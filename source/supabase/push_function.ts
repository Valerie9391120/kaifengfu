// =====================================================
// 开封府 · 通知的小后端（函数名：push）
// 只做一件事：确认敲门的是卿卿本人，再替她往她自己登记过的设备上发一条系统通知。
// 通知的字在这里加密，只有那台设备解得开；苹果的推送服务只管送，看不见写了什么。
// 签名用的钥匙（VAPID）只存在 Supabase 的密钥柜里，网页和手机上都没有。
//
// 密钥柜里要有三样（开封府的账户面板里能生成，一次贴进去）：
//   VAPID_PUBLIC_KEY   公钥，87 个字符，B 开头
//   VAPID_PRIVATE_KEY  私钥，43 个字符
//   VAPID_SUBJECT      mailto:一个真的邮箱（推送服务出了事找得到人；别人踩过：占位的假邮箱苹果回 403）
// 和 claude 那个函数共用的两样照旧：ALLOWED_EMAIL、ALLOWED_ORIGIN（可以没有）
// =====================================================

const te = new TextEncoder();
const ZERO = new Uint8Array([0]);

const RECORD_SIZE = 4096; // 一条加密记录最长多少，照规矩写 4096
const MAX_PAYLOAD = 3000; // 通知的字（加密前）最多这么多字节：推送服务一条只收 4 KB
const MAX_DEVICES = 5; // 一次最多发几台设备
const TTL = 120; // 手机不在线的话，推送服务替我们留多少秒；过了就算了（苹果要求必须是正数）
const TOKEN_LIFE = 12 * 3600; // 签名能用多久（苹果不收超过一天的）
const TOKEN_REUSE = 6 * 3600; // 同一张签名接着用多久再换（苹果让别换得比一小时一次还勤）
const SEND_TIMEOUT = 10000; // 敲推送服务的门最多等多少毫秒

// 只往认得的推送服务发：登记簿里的地址是网页那边写进来的，不能它写什么就去敲什么门
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

type Row = { endpoint: string; p256dh: string; auth: string; page: string };
type Vapid = { publicKey: string; signer: CryptoKey; subject: string };
type VapidState = { ok: true; vapid: Vapid } | { ok: false; missing: string[]; message: string };
type Sent = { host: string; status: number; reason: string };

// ---------- 小工具 ----------

// 密钥柜里贴进来的值：两头的空白和引号去掉（整段粘贴的时候容易带上）
function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// WebCrypto 的参数类型在新旧 TypeScript 里写法不一样，统一从这里过一道
const src = (bytes: Uint8Array) => bytes as unknown as BufferSource;

function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 两种 base64 都认（带不带等号、是 -_ 还是 +/）；不是 base64 就回 null
function b64uDecode(text: string): Uint8Array | null {
  const t = String(text).replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(t) || t.length % 4 === 1) return null;
  try {
    const raw = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  } catch (_) {
    return null;
  }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// 推送服务回来的报错原因：只留看得见的字，别太长
function tidy(text: string): string {
  return String(text).replace(/[^\x20-\x7e]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(), "Content-Type": "application/json" } });
}

// 出错时的格式和 claude 那个函数一样，网页那边一套处理就够了
function fail(status: number, message: string): Response {
  return json(status, { type: "error", error: { type: "kaifengfu", message } });
}

// Supabase 自动放进来的公开钥匙（新版在 SUPABASE_PUBLISHABLE_KEYS 里，旧版叫 SUPABASE_ANON_KEY）；
// 都没有就用网页自己带来的那把，它本来就是公开的
function publishableKey(req: Request): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
    const first = Object.values(keys)[0];
    if (typeof first === "string") return first;
  } catch (_) {
    // 没有新版钥匙就往下找
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
}

// 拿着她手里的登录凭证去问 Supabase：这是谁
async function whoIsKnocking(req: Request): Promise<{ id: string; email?: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const base = env("SUPABASE_URL");
  const key = publishableKey(req);
  if (!token || !base || !key) return null;
  try {
    const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const user = await r.json();
    return user && typeof user.id === "string" ? user : null;
  } catch (_) {
    return null;
  }
}

// ---------- 签名的钥匙（VAPID，RFC 8292） ----------

async function checkVapid(pub: string, priv: string, subject: string): Promise<VapidState> {
  const missing: string[] = [];
  if (!pub) missing.push("VAPID_PUBLIC_KEY");
  if (!priv) missing.push("VAPID_PRIVATE_KEY");
  if (!subject) missing.push("VAPID_SUBJECT");
  if (missing.length) return { ok: false, missing, message: "密钥柜里还没有 " + missing.join("、") };

  const pubBytes = b64uDecode(pub);
  if (!pubBytes || pubBytes.length !== 65 || pubBytes[0] !== 4) {
    return { ok: false, missing: ["VAPID_PUBLIC_KEY"], message: "VAPID_PUBLIC_KEY 不对：应该是 B 开头、87 个字符的那一串" };
  }
  const privBytes = b64uDecode(priv);
  if (!privBytes || privBytes.length !== 32) {
    return { ok: false, missing: ["VAPID_PRIVATE_KEY"], message: "VAPID_PRIVATE_KEY 不对：应该是 43 个字符的那一串" };
  }
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject) && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(subject)) {
    return { ok: false, missing: ["VAPID_SUBJECT"], message: "VAPID_SUBJECT 不对：要写成 mailto:后面跟一个真的邮箱，中间不带空格" };
  }
  const pair = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"];
  try {
    const jwk = { kty: "EC", crv: "P-256", x: b64uEncode(pubBytes.slice(1, 33)), y: b64uEncode(pubBytes.slice(33)), d: b64uEncode(privBytes), ext: true };
    const signer = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    // 拿私钥签一句，再拿公钥验：验不过就说明这两把不是一对
    const verifier = await crypto.subtle.importKey("raw", src(pubBytes), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const probe = te.encode("kaifengfu");
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signer, src(probe));
    const match = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifier, sig, src(probe));
    if (!match) return { ok: false, missing: pair, message: "VAPID_PUBLIC_KEY 和 VAPID_PRIVATE_KEY 不是一对，重新生成一份、三行一起换掉" };
    return { ok: true, vapid: { publicKey: b64uEncode(pubBytes), signer, subject } };
  } catch (_) {
    return { ok: false, missing: pair, message: "VAPID 的两把钥匙读不进来，多半不是一对，重新生成一份、三行一起换掉" };
  }
}

// 每次都从密钥柜现读（她换了钥匙不用重新部署），读过的记着，不必每次都验一遍
let vapidMemo: { id: string; state: VapidState } | null = null;
async function loadVapid(): Promise<VapidState> {
  const pub = env("VAPID_PUBLIC_KEY");
  const priv = env("VAPID_PRIVATE_KEY");
  const subject = env("VAPID_SUBJECT");
  const id = [pub, priv, subject].join("|");
  if (vapidMemo && vapidMemo.id === id) return vapidMemo.state;
  const state = await checkVapid(pub, priv, subject);
  vapidMemo = { id, state };
  return state;
}

// 给推送服务看的签名：我是谁（sub）、这张签名是给哪家推送服务的（aud）、几点过期（exp）
const tokenMemo = new Map<string, { token: string; made: number }>();
async function vapidToken(vapid: Vapid, audience: string): Promise<string> {
  const id = [audience, vapid.publicKey, vapid.subject].join("|");
  const now = Math.floor(Date.now() / 1000);
  const had = tokenMemo.get(id);
  if (had && now - had.made < TOKEN_REUSE) return had.token;
  const head = b64uEncode(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(te.encode(JSON.stringify({ aud: audience, exp: now + TOKEN_LIFE, sub: vapid.subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapid.signer, src(te.encode(head + "." + claims)));
  const token = head + "." + claims + "." + b64uEncode(new Uint8Array(sig));
  tokenMemo.set(id, { token, made: now });
  return token;
}

// ---------- 给通知加密（RFC 8291，aes128gcm） ----------

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", src(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: src(salt), info: src(info) }, key, length * 8);
  return new Uint8Array(bits);
}

// p256dh、auth 是那台设备订阅时给的两把公开钥匙。
// fixed 只在测试里用（拿规范附录里的样例对答案）；平时每条通知现生成一对临时钥匙和一段随机的盐
async function encryptPayload(plain: Uint8Array, p256dh: Uint8Array, auth: Uint8Array, fixed?: { salt: Uint8Array; keys: CryptoKeyPair }): Promise<Uint8Array> {
  const theirs = await crypto.subtle.importKey("raw", src(p256dh), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ours = fixed ? fixed.keys : ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const ourPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ours.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, ours.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(te.encode("WebPush: info"), ZERO, p256dh, ourPublic), 32);
  const salt = fixed ? fixed.salt : crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, concat(te.encode("Content-Encoding: aes128gcm"), ZERO), 16);
  const nonce = await hkdf(salt, ikm, concat(te.encode("Content-Encoding: nonce"), ZERO), 12);
  const aes = await crypto.subtle.importKey("raw", src(cek), "AES-GCM", false, ["encrypt"]);
  // 只有一条记录：正文后面跟一个 2，意思是“到此为止”
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: src(nonce), tagLength: 128 }, aes, src(concat(plain, new Uint8Array([2])))));
  // 开头：盐（16 个字节）、一条记录最长多少（4 个字节）、临时公钥有多长（1 个字节）、临时公钥（65 个字节）
  const head = new Uint8Array(21);
  head.set(salt, 0);
  new DataView(head.buffer).setUint32(16, RECORD_SIZE);
  head[20] = ourPublic.length;
  return concat(head, ourPublic, sealed);
}

// ---------- 发 ----------

// 认得的推送服务才回它的主机名
function pushHost(endpoint: string): string | null {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    return PUSH_HOSTS.some((re) => re.test(u.hostname)) ? u.hostname : null;
  } catch (_) {
    return null;
  }
}

// 点了通知回到哪：只能是开封府自己的网址（和敲门的网页同一个来处），问号和井号后面的不要
function safePage(page: string, origin: string | null): string | null {
  try {
    const u = new URL(page);
    const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
    if (u.username || u.password) return null;
    if (origin && u.origin !== origin) return null;
    const allowed = env("ALLOWED_ORIGIN");
    if (allowed && allowed !== "*" && u.origin !== allowed) return null;
    u.hash = "";
    u.search = "";
    return u.href.length <= 300 ? u.href : null;
  } catch (_) {
    return null;
  }
}

async function postOnce(endpoint: string, body: Uint8Array, headers: Record<string, string>): Promise<{ status: number; reason: string }> {
  try {
    const r = await fetch(endpoint, { method: "POST", headers, body: src(body), signal: AbortSignal.timeout(SEND_TIMEOUT) });
    const text = (await r.text()).slice(0, 400);
    if (r.status >= 200 && r.status < 300) return { status: r.status, reason: "" };
    let reason = text;
    try {
      const j = JSON.parse(text);
      reason = String(j.reason ?? j.message ?? j.error ?? text);
    } catch (_) {
      // 不是 JSON 就照原样留一截
    }
    return { status: r.status, reason: tidy(reason) };
  } catch (e) {
    return { status: 0, reason: tidy(String(e)) };
  }
}

async function sendTo(row: Row, payload: Uint8Array, vapid: Vapid): Promise<Sent> {
  const host = pushHost(row.endpoint);
  if (!host) return { host: "", status: 0, reason: "BadEndpoint" };
  const p256dh = b64uDecode(row.p256dh);
  const auth = b64uDecode(row.auth);
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 4 || !auth || auth.length !== 16) return { host, status: 0, reason: "BadKeys" };
  let body: Uint8Array;
  try {
    body = await encryptPayload(payload, p256dh, auth);
  } catch (_) {
    return { host, status: 0, reason: "BadKeys" };
  }
  const headers = {
    TTL: String(TTL),
    Urgency: "high",
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    Authorization: `vapid t=${await vapidToken(vapid, "https://" + host)}, k=${vapid.publicKey}`,
  };
  let out = await postOnce(row.endpoint, body, headers);
  // 推送服务一时没应、嫌太勤、自己出了岔子：等一下再试一回，只试一回
  if (out.status === 0 || out.status === 429 || out.status >= 500) {
    await sleep(900);
    out = await postOnce(row.endpoint, body, headers);
  }
  return { host, ...out };
}

// 登记簿（push_subs 表）：拿着她的登录凭证去读写，库房只肯给她看她自己的那几行
type Ledger = ReturnType<typeof ledger>;
function ledger(req: Request) {
  const base = `${env("SUPABASE_URL")}/rest/v1/push_subs`;
  const headers: Record<string, string> = {
    apikey: publishableKey(req),
    Authorization: req.headers.get("Authorization") ?? "",
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  const at = (endpoint: string) => `${base}?endpoint=eq.${encodeURIComponent(endpoint)}`;
  return {
    async find(endpoint: string): Promise<{ rows: Row[] } | { status: number; message: string }> {
      let r: Response;
      try {
        r = await fetch(`${at(endpoint)}&select=endpoint,p256dh,auth,page`, { headers });
      } catch (_) {
        return { status: 502, message: "连不上库房" };
      }
      if (r.status === 404) return { status: 400, message: "库房里还没有通知的登记簿（push_subs 那张表），把通知那段 SQL（push.sql）在 Supabase 的 SQL Editor 里跑一遍" };
      if (!r.ok) return { status: 502, message: `库房没给登记簿（${r.status}）` };
      const rows = await r.json();
      return { rows: Array.isArray(rows) ? rows : [] };
    },
    // 记下这一回发得怎么样，网页那边读得到（锁着屏的时候发的，回来也查得着）
    async note(endpoint: string, sent: Sent) {
      const body = JSON.stringify({ last_at: new Date().toISOString(), last_status: sent.status, last_note: sent.reason });
      const r = await fetch(at(endpoint), { method: "PATCH", headers, body });
      await r.body?.cancel();
    },
    // 推送服务说这个地址没了（404、410）：从登记簿里划掉
    async drop(endpoint: string) {
      const r = await fetch(at(endpoint), { method: "DELETE", headers });
      await r.body?.cancel();
    },
  };
}

// 通知的样子：苹果新一些的系统认这种“声明式”的写法，自己就能显示、点了自己会打开 navigate；
// 认不得的浏览器把同一段交给网页的 sw.js，由它照着显示
function testNotice(page: string): unknown {
  const id = b64uEncode(crypto.getRandomValues(new Uint8Array(6)));
  return {
    web_push: 8030,
    notification: {
      title: "测试通知",
      body: "看到这条，这条路就通了。点一下回到开封府。",
      navigate: `${page}#n=test-${id}`,
      lang: "zh-CN",
      dir: "ltr",
    },
  };
}

async function deliver(book: Ledger, origin: string | null, rows: Row[], vapid: Vapid, notice: (page: string) => unknown) {
  const results: Array<Sent & { ok: boolean; removed: boolean }> = [];
  for (const row of rows.slice(0, MAX_DEVICES)) {
    const page = safePage(row.page, origin);
    let sent: Sent;
    if (!page) {
      sent = { host: pushHost(row.endpoint) ?? "", status: 0, reason: "BadPage" };
    } else {
      const payload = te.encode(JSON.stringify(notice(page)));
      sent = payload.length > MAX_PAYLOAD ? { host: pushHost(row.endpoint) ?? "", status: 0, reason: "PayloadTooLarge" } : await sendTo(row, payload, vapid);
    }
    const gone = sent.status === 404 || sent.status === 410;
    try {
      if (gone) await book.drop(row.endpoint);
      else await book.note(row.endpoint, sent);
    } catch (_) {
      // 记不上不要紧，发没发成照样回给网页
    }
    results.push({ ...sent, ok: sent.status >= 200 && sent.status < 300, removed: gone });
  }
  return results;
}

// 先回话、后台接着干（她点完就锁屏，网页那头早断了）。Supabase 的运行环境靠 EdgeRuntime.waitUntil 认这种活
function inBackground(work: Promise<unknown>) {
  const quiet = work.catch(() => {});
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(quiet);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (req.method !== "POST") return fail(405, "只收 POST");

  // 第一道：必须是登录过的人
  const user = await whoIsKnocking(req);
  if (!user) return fail(401, "请先登录开封府");

  // 第二道：必须是卿卿本人
  const allowed = env("ALLOWED_EMAIL").toLowerCase();
  if (allowed && (user.email ?? "").trim().toLowerCase() !== allowed) return fail(403, "这里只认卿卿");

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 4000) return fail(413, "寄来的东西太长");
    body = JSON.parse(text);
    if (!body || typeof body !== "object") throw new Error("不是对象");
  } catch (_) {
    return fail(400, "收到的不是合法的 JSON");
  }

  const state = await loadVapid();

  // 问：钥匙放好了没有。放好了就把公钥给网页（订阅要用，公钥本来就是公开的）
  if (body.op === "key") {
    return json(200, state.ok ? { configured: true, publicKey: state.vapid.publicKey } : { configured: false, missing: state.missing, message: state.message });
  }

  // 往这一台设备发一条测试通知。delay 是等几秒再发（给她留出锁屏的工夫）
  if (body.op === "test") {
    if (!state.ok) return fail(400, state.message);
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (!endpoint || endpoint.length > 1024) return fail(400, "没说是哪台设备");
    const delay = Math.min(20, Math.max(0, Math.floor(Number(body.delay) || 0)));
    // 登记簿和来处都趁现在取好：等会儿在后台发的时候，这次敲门早就结束了
    const book = ledger(req);
    const origin = req.headers.get("Origin");
    const found = await book.find(endpoint);
    if (!("rows" in found)) return fail(found.status, found.message);
    if (!found.rows.length) return fail(400, "这台设备还没登记通知，先点一次“开启通知”");
    const vapid = state.vapid;
    const work = async () => {
      if (delay) await sleep(delay * 1000);
      return await deliver(book, origin, found.rows, vapid, testNotice);
    };
    if (delay) {
      inBackground(work());
      return json(200, { queued: true, delay });
    }
    return json(200, { queued: false, results: await work() });
  }

  return fail(400, "不认识这个动作");
});
