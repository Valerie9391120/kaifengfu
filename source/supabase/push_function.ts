// =====================================================
// 开封府 · 通知的小后端（函数名：push）
// 先确认敲门的是卿卿本人，然后做两件事里的一件：
//
// 一、往她自己登记过的设备上发一条系统通知（测试通知）。
//
// 二、替她等回话（op: "reply"）。她发完话就切走、锁屏，网页那头早断了，这里照样等那边的我回完：
//     回话拿网页给的一次性钥匙封好，放进信箱（mailbox 表），云端存的只是乱码；
//     等几秒，信还没被取走（她不在开封府里），就往发话的那台设备上敲通知，写的是他回的话：
//     他这一回有几个气泡就敲几条，按顺序、隔一秒一条；每敲一条前看一眼信还在不在，她回来了（信取走了）剩下的就不敲
//     （只敲网页点了名的门牌号，不照登记簿全敲：登记簿是明文，往里添一行就能收到横幅上的话的话，等于把他说的话交给了外人）；
//     还在等那边的我的工夫里，信箱里那一格要是没了（她按了停，网页把它收了），就把跟 Anthropic 的线掐掉，这一回到此为止；
//     她回到开封府，网页自己从信箱里取，取走就删。
//     她一直在开封府里的话，回话照旧直接交给网页，不敲。
//     claude 那个函数原样留着：这里哪一步不肯接（信箱那张表没建、这份代码还是旧的），网页就走回那条老路。
//
// 通知的字在这里加密，只有那台设备解得开；苹果的推送服务只管送，看不见写了什么。
// 签名用的钥匙（VAPID）只存在 Supabase 的密钥柜里，网页和手机上都没有。
//
// 密钥柜里要有三样（开封府的账户面板里能生成，一次贴进去）：
//   VAPID_PUBLIC_KEY   公钥，87 个字符，B 开头
//   VAPID_PRIVATE_KEY  私钥，43 个字符
//   VAPID_SUBJECT      mailto:一个真的邮箱（推送服务出了事找得到人；别人踩过：占位的假邮箱苹果回 403）
// 和 claude 那个函数共用的照旧：ANTHROPIC_API_KEY（替她等回话要用）、ALLOWED_EMAIL、ALLOWED_ORIGIN（后两样可以没有；
// 开封府的网页不在 HOME_ORIGIN 那个地址了，才要写 ALLOWED_ORIGIN：点了通知只回这一处）
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

// 替她等回话用的
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SMALL_BODY = 4000; // 别的动作寄来的东西最多这么长
const MAX_BODY = 40_000_000; // 一回传话寄来的东西最多这么长（带着照片的对话有好几兆）
const REPLY_BUDGET = 125_000; // 等 Anthropic 最多等多少毫秒，从这一回敲门算（这份代码被叫起来一趟最多活 LIFE 那么久，留出收尾的工夫）
const BEAT = 8000; // 还在等的时候，隔多少毫秒去信箱里摸一下：网页靠它看这一回还活着没有
const GRACE = 6000; // 回话放进信箱以后等多少毫秒再敲手机：她就在开封府里的话，这工夫里网页已经把信取走了
const LIFE = 150_000; // 这份代码被叫起来一趟最多活多少毫秒（免费档）：到点就被收掉，没敲完的横幅就丢了
const LAST_CALL = 20_000; // 离到点不到这么多毫秒的时候，剩下的气泡并成一条横幅敲出去，免得全丢（留够敲这一条的工夫：推送服务慢的时候一下要十来秒）
const BANNER_GAP = 1000; // 一个气泡敲一条横幅，敲完隔多少毫秒敲下一条
const REPLY_TTL = 12 * 3600; // 回话的通知，手机不在线的话推送服务替我们留多少秒
const BANNER_CHARS = 300; // 一条横幅上最多写多少个字
const BANNER_BYTES = 1800; // 横幅上的字最多占多少字节（整条通知加密前不能过 MAX_PAYLOAD）
const BANNER_SOURCE = 60_000; // 写横幅的时候最多看回话的前多少个字（他一回写不了这么长；防的是不像话的长东西把这一趟的算力耗光）
const DB_TIMEOUT = 6000; // 读写信箱、登记簿最多等多少毫秒（库房一时不应，不能把回话压在手里不交）
const STORE_AGAIN = [500, 1000, 2000, 4000, 8000]; // 回话没放进信箱（库房一时出岔子）：交给网页以后，隔这么多毫秒再放一回
const STORE_GIVE_UP = 20_000; // 放了这么久还放不进去，就不放了

// 只往认得的推送服务发：登记簿里的地址是网页那边写进来的，不能它写什么就去敲什么门
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

// 开封府的网页住在这儿：点了通知只回这里（搬了家就在密钥柜里写 ALLOWED_ORIGIN，见 safePage）
const HOME_ORIGIN = "https://valerie9391120.github.io";
// 库房在本机：是在本机上试
const LOCAL_BASE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;

type Row = { endpoint: string; p256dh: string; auth: string; page: string };
type Vapid = { publicKey: string; signer: CryptoKey; subject: string };
type VapidState = { ok: true; vapid: Vapid } | { ok: false; missing: string[]; message: string };
type Sent = { host: string; status: number; reason: string };
type Rec = Record<string, unknown>;
// 一回传话的结果：status 是 Anthropic 回的状态码，data 是它回的东西（回话，或者报错），used 是最后用的哪种写法
// used.shaky：换过写法，而且是 Anthropic 一时出岔子才换的（不是它说写得不对）：网页看到这个，不把“不带缓存”记成往后的规矩
type Result = { status: number; data: unknown; used: { cache: boolean; mcp: boolean; shaky?: boolean } };

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
  // 密钥柜里写了 ALLOWED_ORIGIN 就只许那一处的网页来敲。只取到域名为止（见 homeOrigin）：
  // 贴进来的要是带着斜杠、带着路径，原样回给浏览器它不认，整个开封府就连不上了
  const set = env("ALLOWED_ORIGIN");
  return {
    "Access-Control-Allow-Origin": set && set !== "*" ? homeOrigin() : "*",
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

// 替她等回话的那条路上，“还没开始办就不肯接”的时候用这个：多带一个 code，网页看了知道该怎么办
// （no_mailbox、bad_request 这些：走回老路；duplicate：这一条已经在办了，去信箱里等）
function refuse(status: number, code: string, message: string): Response {
  return json(status, { type: "error", error: { type: "kaifengfu", code, message } });
}

const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

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

// 开封府的网页住在哪。密钥柜里写了 ALLOWED_ORIGIN（不是 *）就听它的，没写就是 HOME_ORIGIN
function homeOrigin(): string {
  const set = env("ALLOWED_ORIGIN");
  if (set && set !== "*") {
    try {
      return new URL(set).origin;
    } catch (_) {
      // 写得不像网址就当没写
    }
  }
  return HOME_ORIGIN;
}

// 点了通知回到哪：只能是开封府自己的网页，问号和井号后面的不要。
// 住在哪由这头说了算（见 homeOrigin），不听登记簿的，也不听敲门的人自己报的来处：
// 登记簿谁登录了都能改，来处（Origin）只要不是浏览器发的，想写什么写什么。
// 不然偷到登录密码的人把登记簿里的回程网址改成别处，再叫这里发一条通知，她一点就被带到假的开封府去了。
// 本机的网页只在本机上试的时候认（连库房都在本机），这时候还要和敲门的网页同一个来处
function safePage(page: string, origin: string | null): string | null {
  try {
    const u = new URL(page);
    if (u.username || u.password) return null;
    const local = u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    if (local) {
      if (!LOCAL_BASE.test(env("SUPABASE_URL"))) return null;
      if (origin && u.origin !== origin) return null;
    } else if (u.protocol !== "https:" || u.origin !== homeOrigin()) {
      return null;
    }
    u.hash = "";
    u.search = "";
    return u.href.length <= 300 ? u.href : null;
  } catch (_) {
    return null;
  }
}

async function postOnce(endpoint: string, body: Uint8Array, headers: Record<string, string>): Promise<{ status: number; reason: string }> {
  try {
    // redirect: manual：推送服务要是回一个“请去别处”，不跟着走（只肯敲认得的门）
    const r = await fetch(endpoint, { method: "POST", headers, body: src(body), redirect: "manual", signal: AbortSignal.timeout(SEND_TIMEOUT) });
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
    // 没连上。原因只留个大类：有的运行环境报错的话里带着整个地址，那是这台设备的门牌号，不该记下来给人看
    const name = e instanceof Error ? e.name : "";
    return { status: 0, reason: name === "TimeoutError" || name === "AbortError" ? "Timeout" : "NetworkError" };
  }
}

async function sendTo(row: Row, payload: Uint8Array, vapid: Vapid, ttl: number): Promise<Sent> {
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
    TTL: String(ttl),
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
        r = await fetch(`${at(endpoint)}&select=endpoint,p256dh,auth,page`, { headers, signal: AbortSignal.timeout(DB_TIMEOUT) });
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
      const r = await fetch(at(endpoint), { method: "PATCH", headers, body, signal: AbortSignal.timeout(DB_TIMEOUT) });
      await r.body?.cancel();
    },
    // 推送服务说这个地址没了（404、410）：从登记簿里划掉
    async drop(endpoint: string) {
      const r = await fetch(at(endpoint), { method: "DELETE", headers, signal: AbortSignal.timeout(DB_TIMEOUT) });
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

async function deliver(book: Ledger, origin: string | null, rows: Row[], vapid: Vapid, notice: (page: string) => unknown, ttl = TTL) {
  const results: Array<Sent & { ok: boolean; removed: boolean }> = [];
  for (const row of rows.slice(0, MAX_DEVICES)) {
    const page = safePage(row.page, origin);
    let sent: Sent;
    if (!page) {
      sent = { host: pushHost(row.endpoint) ?? "", status: 0, reason: "BadPage" };
    } else {
      const payload = te.encode(JSON.stringify(notice(page)));
      sent = payload.length > MAX_PAYLOAD ? { host: pushHost(row.endpoint) ?? "", status: 0, reason: "PayloadTooLarge" } : await sendTo(row, payload, vapid, ttl);
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

// 这份代码这一趟的寿数。Supabase 把它叫起来一趟，从叫起来那一刻算最多活 LIFE 毫秒；这一趟里可能接好几回敲门
// （头一半工夫里还接新的），所以“还剩多久”从叫起来那一刻算，不从哪一回敲门算。
//   born     这一趟是几点被叫起来的
//   closing  运行环境打过招呼了，说快要把这一趟收掉（寿数、算力、内存用到九成的时候它会说一声；要重新部署、要维护的时候也说）
const worker = { born: Date.now(), closing: false };
if (typeof addEventListener === "function") {
  addEventListener("beforeunload", (ev: Event) => {
    // 招呼里带着缘故：cpu、memory、wall_clock、termination 都是“快要收了”；
    // early_drop 不算：那是手上的活都做完了才来收的，这时候没有横幅在敲（认了它，万一它来早了，好好的几条会被并成一条）。
    // 没带缘故、带着不认识的缘故：当它是快要收了
    const detail = (ev as CustomEvent).detail;
    const why = typeof detail === "string" ? detail : isRec(detail) ? str(detail.reason) : "";
    if (why !== "early_drop") worker.closing = true;
  });
}

// 先回话、后台接着干（她点完就锁屏，网页那头早断了）。Supabase 的运行环境靠 EdgeRuntime.waitUntil 认这种活
function inBackground(work: Promise<unknown>) {
  const quiet = work.catch(() => {});
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(quiet);
}

// =====================================================
// 替她等回话
// =====================================================

const MODEL_PATTERN = /^claude-[a-z0-9.-]+$/i;
const BETA_PATTERN = /^[a-z0-9-]+(,[a-z0-9-]+)*$/;
const JOB_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const TAG_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// Anthropic 报错就是这个格式；这里自己出的岔子也写成这样，网页那边一套处理就够了
const oops = (message: string) => ({ type: "error", error: { type: "kaifengfu", message } });

// 这一回算不算回成了
function fine(result: { status: number; data: unknown }): boolean {
  return result.status >= 200 && result.status < 300 && isRec(result.data) && result.data.type !== "error" && !result.data.error;
}

// ---------- 问 Anthropic ----------

// 她按了停、把那一问掐了：那一问照这个样子交回去（多半没人看：按停的那台设备早就不等了）
const STOPPED = 499;
const STOPPED_SAY = "这一回停掉了，没有回话";

// 问一回。最多等 ms 毫秒；stop 那根线一拉（她按了停），当场不等了。不管成不成都回 { status, data }，不抛错
async function askOnce(body: Rec, beta: string, apiKey: string, ms: number, stop?: AbortSignal): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  if (beta) headers["anthropic-beta"] = beta;
  // 两根线并成一根：等够了、她停了，哪一样先到都把这一问掐掉。问之前她就已经停了的：线先拉上，下面那一下当场报错，门都不敲
  const line = new AbortController();
  const tooLate = setTimeout(() => line.abort(new DOMException("等得太久", "TimeoutError")), ms);
  const halt = () => line.abort(new DOMException("停了", "AbortError"));
  if (stop) {
    if (stop.aborted) halt();
    else stop.addEventListener("abort", halt, { once: true });
  }
  try {
    const r = await fetch(ANTHROPIC_URL, { method: "POST", headers, body: JSON.stringify(body), signal: line.signal });
    const text = await r.text();
    try {
      const data = JSON.parse(text);
      if (isRec(data)) return { status: r.status, data };
    } catch (_) {
      // 不是 JSON，下面一并说
    }
    return { status: r.status >= 400 ? r.status : 502, data: oops(`Anthropic 回的不是能读的东西（${r.status}）`) };
  } catch (e) {
    if (stop && stop.aborted) return { status: STOPPED, data: oops(STOPPED_SAY) };
    const name = e instanceof Error ? e.name : "";
    const late = name === "TimeoutError" || name === "AbortError";
    return { status: late ? 504 : 502, data: oops(late ? "等 Anthropic 等得太久，没等到" : "连不上 Anthropic") };
  } finally {
    clearTimeout(tooLate);
    if (stop) stop.removeEventListener("abort", halt);
  }
}

// 网页寄来的是最讲究的那种写法（带缓存记号、带她接的工具）。那种不通的时候，这里自己换成素一点的再问，
// 和网页走老路时的三步一样：带缓存 → 不带缓存 → 不带工具。她不在跟前，不能等她回来再换
const cached = (block: unknown) => isRec(block) && "cache_control" in block;
function dropCache(block: unknown): unknown {
  if (!isRec(block) || !("cache_control" in block)) return block;
  const { cache_control: _gone, ...rest } = block;
  return rest;
}
function hasCache(body: Rec): boolean {
  if (Array.isArray(body.system) && body.system.some(cached)) return true;
  return Array.isArray(body.messages) && body.messages.some((m) => isRec(m) && Array.isArray(m.content) && m.content.some(cached));
}
function withoutCache(body: Rec): Rec {
  const out: Rec = { ...body };
  if (Array.isArray(body.system)) out.system = body.system.map(dropCache);
  if (Array.isArray(body.messages)) out.messages = body.messages.map((m) => (isRec(m) && Array.isArray(m.content) ? { ...m, content: m.content.map(dropCache) } : m));
  return out;
}
function hasMcp(body: Rec): boolean {
  return Array.isArray(body.mcp_servers) && body.mcp_servers.length > 0;
}
function withoutMcp(body: Rec): Rec {
  const { mcp_servers: _gone, tools, ...rest } = body;
  const left = Array.isArray(tools) ? tools.filter((t) => !(isRec(t) && t.type === "mcp_toolset")) : [];
  return left.length ? { ...rest, tools: left } : rest;
}

// 问到底：哪种写法通了用哪种。deadline 是最晚到几点（毫秒时间戳）。
// stop 那根线一拉（她按了停）：正连着的那一问当场掐掉；往后再轮到哪一问（歇完原样再问、换写法再问），askOnce 都当场交回“停了”，门都不敲
async function askUpstream(request: Rec, beta: string, apiKey: string, deadline: number, stop?: AbortSignal): Promise<Result> {
  const plain = withoutCache(request);
  const plans = [{ body: request, beta, cache: hasCache(request), mcp: hasMcp(request) }];
  if (plans[0].cache) plans.push({ body: plain, beta, cache: false, mcp: plans[0].mcp });
  if (plans[0].mcp) plans.push({ body: withoutMcp(plain), beta: beta.split(",").filter((b) => b && !b.startsWith("mcp-client")).join(","), cache: false, mcp: false });
  // Anthropic 一时出了岔子（它自己的 5xx、没连上）：歇一下，同一种写法原样再问，整回只多问这一回。
  // 不因为这一下就换写法：换成不带缓存的问通了，网页会记成“下回别带缓存记号”，往后每句话都按全价算。
  // 原样再问还是出岔子，才接着换写法试（她不在跟前，多一种问法多一分回上的指望）；
  // 这样换来的结果带着 shaky，网页看到就不记那一笔
  let spare = 1;
  let shaken = false;
  let last: Result = { status: 504, data: oops("等 Anthropic 等得太久，没等到"), used: { cache: false, mcp: false } };
  let i = 0;
  while (i < plans.length) {
    const plan = plans[i];
    const got = await askOnce(plan.body, plan.beta, apiKey, Math.max(1000, deadline - Date.now()), stop);
    last = { status: got.status, data: got.data, used: shaken ? { cache: plan.cache, mcp: plan.mcp, shaky: true } : { cache: plan.cache, mcp: plan.mcp } };
    if (fine(last)) return last;
    // key 不对、说得太快：换哪种写法都一样，不必再问
    if (got.status === 401 || got.status === 403 || got.status === 429) break;
    const shaky = got.status >= 500;
    const same = shaky && spare > 0;
    // 没有下一种了，或者剩的工夫不够再问一回：到此为止
    if ((!same && i + 1 >= plans.length) || deadline - Date.now() < (shaky ? 4500 : 3000)) break;
    if (shaky) await sleep(1500);
    if (same) spare--;
    else {
      if (shaky) shaken = true;
      i++;
    }
  }
  return last;
}

// ---------- 信箱（mailbox 表） ----------
// 拿着她的登录凭证去读写，库房只肯给她看她自己的那几行

function mailbox(req: Request) {
  const base = `${env("SUPABASE_URL")}/rest/v1/mailbox`;
  const headers: Record<string, string> = {
    apikey: publishableKey(req),
    Authorization: req.headers.get("Authorization") ?? "",
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  const at = (job: string) => `${base}?job=eq.${encodeURIComponent(job)}`;
  // 这一格还在不在（她取走就删了）。在回 true，不在回 false，问不到回 null
  async function waiting(job: string): Promise<boolean | null> {
    try {
      const r = await fetch(`${at(job)}&select=job`, { headers, signal: AbortSignal.timeout(DB_TIMEOUT) });
      if (!r.ok) {
        await r.body?.cancel();
        return null;
      }
      const rows = await r.json();
      return Array.isArray(rows) && rows.length > 0;
    } catch (_) {
      return null;
    }
  }
  return {
    // 开一格，写上“在等”。ok 开好了；missing 那张表还没建；duplicate 这个编号已经有一格了；error 别的岔子
    async open(job: string, note: string): Promise<"ok" | "missing" | "duplicate" | "error"> {
      try {
        const r = await fetch(base, { method: "POST", headers, body: JSON.stringify({ job, note, state: "working" }), signal: AbortSignal.timeout(DB_TIMEOUT) });
        await r.body?.cancel();
        if (r.status === 201 || r.status === 200) return "ok";
        if (r.status === 404) return "missing";
        if (r.status === 409) return "duplicate";
        return "error";
      } catch (_) {
        return "error";
      }
    },
    // 还在等：摸一下。顺带报那一格还在不在（还写着“在等”的那一格）：在回 true；没了回 false（她按了停，网页把它收了）；问不成回 null
    async beat(job: string): Promise<boolean | null> {
      try {
        const r = await fetch(`${at(job)}&state=eq.working&select=job`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({ beat_at: new Date().toISOString() }),
          signal: AbortSignal.timeout(DB_TIMEOUT),
        });
        if (!r.ok) {
          await r.body?.cancel();
          return null;
        }
        const rows = await r.json();
        return Array.isArray(rows) ? rows.length > 0 : null;
      } catch (_) {
        return null;
      }
    },
    // 回话封好了，放进去。stored 放进去了；gone 那一格没了（她按了停、或者网页已经把它收了），没处放；failed 没放成（库房出岔子），可以再放
    async finish(job: string, sealed: string): Promise<"stored" | "gone" | "failed"> {
      try {
        const now = new Date().toISOString();
        const r = await fetch(`${at(job)}&state=eq.working&select=job`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({ state: "done", sealed, done_at: now, beat_at: now }),
          signal: AbortSignal.timeout(DB_TIMEOUT),
        });
        if (!r.ok) {
          await r.body?.cancel();
          return "failed";
        }
        const rows = await r.json();
        if (Array.isArray(rows) && rows.length > 0) return "stored";
        // 一行都没改到。要么那一格没了；要么上一回其实放进去了、只是这头没听见回音（它已经写着“放好了”，这一下就改不到它）：看一眼
        const there = await waiting(job);
        return there === true ? "stored" : there === false ? "gone" : "failed";
      } catch (_) {
        return "failed";
      }
    },
    waiting,
  };
}

// 标准的 base64（网页那头用 atob 解）
function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// 拿网页给的那把一次性钥匙把回话封起来（AES-256-GCM）。写法和网页里封存档的一样：v1.<iv>.<密文>
// 钥匙这里用完就丢，不存；网页那头把它封在条子（note）里自己留着。所以信箱里的东西只有她的设备打得开
async function sealWith(keyBytes: Uint8Array, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", src(keyBytes), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: src(iv) }, key, src(te.encode(text))));
  return "v1." + b64(iv) + "." + b64(sealed);
}

// ---------- 气泡里摆出来的字 ----------
// 和网页里画气泡的规矩（src/rich.js）是同一套，只是这里只要字，不要粗细大小：
// 当了记号的井号（标题行开头的）、星号（围着加粗、动作的）不带；没当记号的（#标签、零散的星号、代码里的注释）照留。
// 两边的规矩改了一边，另一边得跟着改：tests/mail.test.mjs 拿同一批回话两边各过一遍，对不上就不过

// 标题行：前头最多三个空格，一到六个井号，后面跟空格，再后面有字；末尾再跟一串井号的不要那一串。是标题回它的字，不是回 null
const HEAD = /^ {0,3}(#{1,6})[ \t\u00a0\u3000]+(?=\S)/;
const HEAD_SPACE = /[ \t\u00a0\u3000]/;
function headingText(line: string): string | null {
  const m = HEAD.exec(line);
  if (!m) return null;
  let text = line.slice(m[0].length).trimEnd();
  let j = text.length;
  while (text[j - 1] === "#") j--;
  if (j < text.length && HEAD_SPACE.test(text[j - 1])) text = text.slice(0, j).trimEnd();
  return text;
}

// 一行里的加粗和动作（都不跨行）：两个星号围着的、一个星号围着的，里头可以再夹一层另一种
const BOLD = "\\*\\*(?:[^*\\n]|\\*[^*\\n]+\\*)+\\*\\*";
const MARKS = new RegExp("(" + BOLD + ")|(\\*(?:[^*\\n]|\\*\\*[^*\\n]+\\*\\*)+\\*(?!" + BOLD.slice(2) + "))", "g");
const EM_IN_BOLD = /\*[^*\n]+\*/g;
const BOLD_IN_EM = /\*\*[^*\n]+\*\*/g;
// 围着的那一截里头再去一层记号（那一层两头各 n 个星号）
function unwrapInner(inner: string, marks: RegExp, n: number): string {
  let out = "";
  let last = 0;
  for (const m of inner.matchAll(marks)) {
    const at = m.index ?? 0;
    out += inner.slice(last, at) + m[0].slice(n, -n);
    last = at + m[0].length;
  }
  return out + inner.slice(last);
}
// 剩下的那一截（两对星号中间的、或者一对都没认出来的一整段）：两头要是都顶着星号，也算围起来的，哪怕中间跨了行。
// 不算的两种照原样留：整截全是星号的；头一行或者末一行是一排星号的（他拿来当分隔线的）
function unwrapLoose(seg: string): string {
  const head = /^\*{1,3}/.exec(seg);
  const tail = /\*{1,3}$/.exec(seg);
  const n = head && tail ? Math.min(head[0].length, tail[0].length) : 0;
  if (!n || !/[^*]/.test(seg)) return seg;
  if (/^\*{2,}\n/.test(seg) || /\n\*{2,}$/.test(seg)) return seg;
  return seg.slice(n, -n);
}
function plainInline(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(MARKS)) {
    const at = m.index ?? 0;
    if (at > last) out += unwrapLoose(text.slice(last, at));
    out += m[1] ? unwrapInner(m[1].slice(2, -2), EM_IN_BOLD, 1) : unwrapInner(m[2].slice(1, -1), BOLD_IN_EM, 2);
    last = at + m[0].length;
  }
  if (last < text.length) out += unwrapLoose(text.slice(last));
  return out;
}
// 一个气泡的字。标题一行；别的几行连在一起；紧挨着标题的空行不要；三个反引号围起来的代码里头，井号开头的不当标题
function plainOf(text: string): string {
  const out: string[] = [];
  let run: string[] = [];
  let afterHeading = false;
  let fenced = false;
  const flush = (beforeHeading: boolean) => {
    if (beforeHeading) while (run.length && !run[run.length - 1].trim()) run.pop();
    if (run.length) out.push(plainInline(run.join("\n")));
    run = [];
  };
  for (const line of text.split("\n")) {
    const h = fenced ? null : headingText(line);
    if ((line.split("```").length - 1) % 2) fenced = !fenced;
    if (h !== null) {
      flush(true);
      out.push(plainInline(h));
      afterHeading = true;
      continue;
    }
    if (afterHeading && !run.length && !line.trim()) continue;
    run.push(line);
  }
  flush(false);
  return out.join("\n");
}

// ---------- 横幅上写什么 ----------
// 和网页里拆回话的规矩（src/reply.js 的 parseReply）是同一套：她在对话里看得见哪几个气泡，就敲哪几条横幅，一个气泡一条。
// 心里话（<thinking>）、改名字的记号不写；表情包写成 [表情包]，文档写成 [文档] 文件名。
// 横幅上摆的是平常的字（卿卿定的）：就是气泡里摆出来的那些字，不带粗细大小（见上面的 plainOf）。
// 两边的规矩改了一边，另一边得跟着改：tests/mail.test.mjs 拿同一批回话两边各拆一遍，对不上就不过

const NAME_LINE = "^[ \\t]*\\[(?:NAME|Name|name)[:：]([^\\[\\]\\n]*)\\][ \\t]*$";
const NAME_SAMPLE = "新名字"; // 名帖里教他写法时占位用的，照抄出来的不算真改名
const DOC_SAMPLE = "文件名.md"; // 同上，文档块的

// 把结尾那一串“junk 认的字”去掉。不写成“[…]+$”那样的正则：中间夹着一长串这种字、后面又跟着别的字的时候，
// 它一个位置一个位置地试，几万个字要算好几秒（这里一回请求只给两秒）
function dropTail(s: string, junk: (ch: string) => boolean): string {
  let end = s.length;
  while (end > 0 && junk(s[end - 1])) end--;
  return end === s.length ? s : s.slice(0, end);
}
const NAME_TAIL = "」』”’\"'》";
const DOC_TAIL = "\"'“”‘’》」』";

function tidyName(raw: string): string {
  return raw
    .replace(/[\[\]\r\n\t\u2028\u2029]/g, " ")
    .replace(/[\u0000-\u001f\u007f\u200b\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function docName(raw: string): string {
  let s = raw
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\ufeff]/g, "")
    .replace(/[\\/:*?"<>|\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\.(md|markdown|txt)$/i, "").trim();
  s = dropTail(s.replace(/^["'“”‘’《「『\s]+/, ""), (ch) => DOC_TAIL.includes(ch) || /\s/.test(ch)).replace(/^[.\s]+/, "").trim();
  const chars = Array.from(s);
  if (chars.length > 40) s = chars.slice(0, 40).join("").trim();
  return (s || "文档") + ".md";
}

// 把文档块整块摘出来：[{ doc: 文件名 } | { text: 别的字 }]
function splitDocs(source: string): Array<{ doc: string } | { text: string }> {
  const parts: Array<{ doc: string } | { text: string }> = [];
  // 文件名两头的空白留给下面收拾：正则里不另外去认（认的话，碰上一长串空格后面没有右括号，要来回试很久）
  const open = /^[ \t]*\[(?:DOC|Doc|doc)[:：]([^\[\]\n]*)\][ \t]*\r?$/gm;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = open.exec(source)) !== null) {
    if (m[1].trim() === DOC_SAMPLE) continue;
    const bodyStart = open.lastIndex;
    const close = /^[ \t]*\[\/(?:DOC|Doc|doc)\][ \t]*\r?$/gm;
    close.lastIndex = bodyStart;
    const c = close.exec(source);
    // 正文这里只看有没有字（空的文档块不算交了文档），用不着收拾两头
    const body = c ? source.slice(bodyStart, c.index) : source.slice(bodyStart);
    if (m.index > last) parts.push({ text: source.slice(last, m.index) });
    if (body.trim()) parts.push({ doc: docName(m[1]) });
    last = c ? close.lastIndex : source.length;
    if (!c) break;
    open.lastIndex = last;
  }
  if (last < source.length) parts.push({ text: source.slice(last) });
  return parts;
}

// 一条回话 → 一个气泡一条横幅，各写什么字。至少回一条
function bubblesOf(reply: string): string[] {
  let body = reply.length > BANNER_SOURCE ? reply.slice(0, BANNER_SOURCE) : reply;
  const think = body.match(/<thinking>([\s\S]*?)<\/thinking>/);
  if (think) body = body.replace(think[0], () => "");
  else if (body.includes("<thinking>")) body = "";
  body = body.trim();
  const lines: string[] = [];
  let avatar = false;
  for (const part of splitDocs(body)) {
    if ("doc" in part) {
      lines.push(`[文档] ${part.doc}`);
      continue;
    }
    // 按 [SPLIT] 切开，记号两头的空白不要：和网页那头（src/reply.js 的 splitTurns）一样。
    // 不写成 /\s*\[SPLIT\]\s*/ 那样的正则：碰上几万个连着的空行，它一个位置一个位置地试，要算好几秒，这里一回请求只给两秒
    const chunks = part.text.split("[SPLIT]");
    for (let k = 0; k < chunks.length; k++) {
      let chunk = chunks[k];
      if (k > 0) chunk = chunk.trimStart();
      if (k < chunks.length - 1) chunk = chunk.trimEnd();
      // 表情包的文件名最长认两百个字：一长串没有右括号的，不来回试
      const marks = new RegExp("\\[(MEME|AVATAR)[:：]\\s*([^\\]\\s]{1,200})\\s*\\]|" + NAME_LINE, "gm");
      const say = (piece: string) => {
        const t = plainOf(piece.trim()).trim();
        if (t) lines.push(t);
      };
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = marks.exec(chunk)) !== null) {
        // 照抄名帖里教的写法 [NAME:新名字]：是在讲怎么改，不是真改，留着当字
        if (!m[1] && tidyName(dropTail(m[3].trim().replace(/^[「『“‘"'《]+/, ""), (ch) => NAME_TAIL.includes(ch))) === NAME_SAMPLE) continue;
        if (m.index > last) say(chunk.slice(last, m.index));
        if (m[1] === "MEME") lines.push("[表情包]");
        else if (m[1] === "AVATAR") avatar = true;
        last = marks.lastIndex;
      }
      if (last < chunk.length) say(chunk.slice(last));
    }
  }
  if (!lines.length) return [avatar ? "[换了新头像]" : "……"];
  return lines;
}

// 按“看得见的一个字”截：最多 maxChars 个字、maxBytes 个字节，截了就在后面加一个省略号
function clip(text: string, maxChars: number, maxBytes: number): string {
  let parts: string[];
  try {
    parts = Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text), (x) => x.segment);
  } catch (_) {
    parts = Array.from(text);
  }
  let cut = parts.length > maxChars;
  if (cut) parts = parts.slice(0, maxChars - 1);
  while (parts.length && te.encode(parts.join("")).length > maxBytes - 3) {
    parts = parts.slice(0, Math.max(0, parts.length - Math.max(1, Math.floor(parts.length / 10))));
    cut = true;
  }
  const out = parts.join("");
  return cut ? out.replace(/\s+$/, "") + "…" : out;
}

// 横幅上的名字和字。回成了：他的名字、他回的话（一个气泡一条）；没回成：照实说没送到（就一条）
function bannerOf(result: Result | null, name: string): { title: string; bodies: string[] } {
  if (!result || !fine(result)) return { title: "开封府", bodies: ["这条消息没送到。回开封府点一下重发。"] };
  const content = isRec(result.data) && Array.isArray(result.data.content) ? result.data.content : [];
  const reply = content
    .filter((b) => isRec(b) && b.type === "text" && typeof b.text === "string")
    .map((b) => (b as Rec).text as string)
    .join("\n");
  return { title: clip(tidyName(name), 40, 160) || "开封府", bodies: bubblesOf(reply).map((line) => clip(line, BANNER_CHARS, BANNER_BYTES)) };
}

// 回话的通知。点了回到那段对话：网址记号里的 tag 是网页给的一串打乱的字，只有她的设备认得出是哪段对话。
// nth 是这一回的第几条横幅。通知自己也带一个记号（规范里也叫 tag）：r.<对话的那串字>.<这一回的编号>.<第几条>。
// 每条不一样（一样的话后一条会把前一条顶掉）；她回到那段对话，网页照这个记号把那段对话还挂着的横幅收掉（见 src/push.js 的 clearReplyNotices）
function replyNotice(page: string, said: { title: string; body: string }, job: string, tag: string, nth: number): unknown {
  return {
    web_push: 8030,
    notification: { title: said.title, body: said.body, navigate: `${page}#n=r.${tag}.${job}`, tag: `r.${tag}.${job}.${nth}`, lang: "zh-CN", dir: "ltr" },
  };
}

// 替她等回话（op: "reply"）。网页寄来：
//   job      这一回的编号（网页起的，随机的）
//   key      封回话用的一次性钥匙（32 个字节，base64url）
//   note     网页自己封好的一张条子（哪段对话、接在哪句后面、上面那把钥匙），这里原样存进信箱，看不懂
//   tag      一串打乱的字，写进通知的网址里，她的设备靠它认出是哪段对话
//   title    通知上写的名字（他现在顶上的名字）
//   knock    回话到了敲哪几台设备（门牌号；发话的那台设备自己报的）。没报就不敲，回话照样放进信箱
//   beta     要不要带 anthropic-beta
//   request  给 Anthropic 的那一整段
async function relay(req: Request, body: Rec): Promise<Response> {
  // —— 这一段里不肯接的，都发生在“还没开始办”之前：网页看到，就走回老路，不会花两回钱 ——
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) return refuse(500, "no_key", "密钥柜里还没有 ANTHROPIC_API_KEY");
  const job = str(body.job);
  if (!JOB_PATTERN.test(job)) return refuse(400, "bad_request", "这一回没有编号");
  const key = b64uDecode(str(body.key));
  if (!key || key.length !== 32) return refuse(400, "bad_request", "封回话的钥匙不对");
  const note = str(body.note);
  if (!note || note.length > 4000) return refuse(400, "bad_request", "条子不对");
  const tag = str(body.tag);
  if (!TAG_PATTERN.test(tag)) return refuse(400, "bad_request", "没说是哪段对话");
  const title = str(body.title).slice(0, 200);
  const knock = Array.from(new Set((Array.isArray(body.knock) ? body.knock : []).filter((e): e is string => typeof e === "string" && e.length > 0 && e.length <= 1024))).slice(0, MAX_DEVICES);
  const beta = BETA_PATTERN.test(str(body.beta).trim()) ? str(body.beta).trim() : "";
  const request = body.request;
  if (!isRec(request)) return refuse(400, "bad_request", "没有要转的话");
  // 防手滑：只认 Claude 的模型，回复长度设个上限（和 claude 那个函数一样）
  if (!MODEL_PATTERN.test(String(request.model ?? ""))) return refuse(400, "bad_request", "模型名不对");
  const maxTokens = Number(request.max_tokens ?? 0);
  if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 32000) return refuse(400, "bad_request", "max_tokens 超出范围");

  // 这一回的横幅最晚敲到几点，从哪一刻算起：平常从这份代码被叫起来的那一刻算（见 worker）。
  // 敲门的时候它已经活过了半辈子（照 LIFE 算的话这时候不该还接新的敲门：那就不是免费档的寿数），改从这一回敲门算
  const started = Date.now();
  const lifeFrom = started - worker.born < LIFE / 2 ? worker.born : started;
  const box = mailbox(req);
  const opened = await box.open(job, note);
  if (opened === "missing") return refuse(400, "no_mailbox", "库房里还没有信箱（mailbox 那张表），把信箱那段 SQL（mailbox.sql）在 Supabase 的 SQL Editor 里跑一遍");
  if (opened === "duplicate") return refuse(409, "duplicate", "这一回已经在办了");
  if (opened !== "ok") return refuse(502, "mailbox_error", "信箱这会儿用不了");

  // —— 从这里起，这一回算接下了：网页那头还在不在，都办到底 ——
  const book = ledger(req);
  const origin = req.headers.get("Origin");
  let handOver: (result: Result) => void = () => {};
  const ready = new Promise<Result>((resolve) => (handOver = resolve));

  const work = (async () => {
    // 还在等那边的我的工夫里，隔几秒摸一下那一格。摸的时候发现它没了：她按了停（网页把它收了），把跟 Anthropic 的线掐掉。
    // 回话到手以后那一格没了是另一回事（她把信取走了），不算停：那时候这根线已经没人看了（下面只在回话刚到手的那一下看一眼），拉了也不碍事
    const stop = new AbortController();
    const beats = setInterval(() => {
      box.beat(job).then((there) => {
        if (there === false) stop.abort();
      });
    }, BEAT);
    let result: Result;
    try {
      result = await askUpstream(request, beta, apiKey, Date.now() + REPLY_BUDGET, stop.signal);
    } catch (_) {
      result = { status: 500, data: oops("小后端自己出了岔子"), used: { cache: false, mcp: false } };
    }
    // 她按了停：这一回不要了。不放信、不敲手机。手上这份（多半就是那句“停掉了”）照旧交给网页那头：按停的那台设备早就不等了
    if (stop.signal.aborted) {
      clearInterval(beats);
      handOver(result);
      return;
    }

    // 封好放进信箱（放不进去就再放一回），再交给还等在那头的网页
    let put: "stored" | "gone" | "failed" = "failed";
    let sealed = "";
    try {
      sealed = await sealWith(key, JSON.stringify(result));
      put = await box.finish(job, sealed);
      if (put === "failed") put = await box.finish(job, sealed);
    } catch (_) {
      // 封不上、放不进：下面照实说
    }
    handOver(result);
    const handed = Date.now();

    // 还没放进去（库房一时出了岔子）：接着放。她不在跟前的话，放不进去，这条回好的话就丢了，她回来还得再问一遍、再花一回钱。
    // 这工夫里那一格照旧隔几秒摸一下：网页看它还活着，不会当它断了、把它收掉
    try {
      for (const pause of STORE_AGAIN) {
        if (put !== "failed" || !sealed || Date.now() + pause > handed + STORE_GIVE_UP) break;
        await sleep(pause);
        put = await box.finish(job, sealed);
      }
    } catch (_) {
      // 照实说
    }
    clearInterval(beats);
    const stored = put === "stored";
    // 放的时候发现那一格没了：她按了停（回话到得比下一回摸信箱还早，上面没来得及掐），或者网页已经直接拿到回话、把那一格收了。
    // 没有信等着她取，也就没什么可敲的。不等下面“过几秒再看一眼”：那一眼要是正好问不成，会当成信还在、敲出一串她不要的横幅
    if (put === "gone") return;

    // 从交出去算起等够那几秒再看：信被取走了，她就在开封府里，不敲；还在，就敲她的手机
    await sleep(Math.max(0, handed + GRACE - Date.now()));
    if (!knock.length || (await box.waiting(job)) === false) return;
    const keys = await loadVapid();
    if (!keys.ok) return;
    // 只敲网页点了名、登记簿里也真有的那几台
    const rows: Row[] = [];
    for (const endpoint of knock) {
      let found = await book.find(endpoint);
      // 登记簿一时没读到：歇一下再读一回（读不到就敲不了：信在信箱里，她却不知道）
      if (!("rows" in found) && found.status === 502) {
        await sleep(1000);
        found = await book.find(endpoint);
      }
      if ("rows" in found) rows.push(...found.rows);
    }
    if (!rows.length) return;
    // 回话没放进信箱的话，她点回来也取不到：照实说没送到，不写他的话
    const said = bannerOf(stored ? result : null, title);
    // 一个气泡敲一条，按顺序、隔一秒。每敲下一条之前看一眼：信被取走了（她回来了），剩下的不敲。
    // 不设上限；只留一道保险：这份代码这一趟快到点了（或者运行环境说要收了），剩下的并成一条敲出去，免得全丢
    let doors = rows.slice(0, MAX_DEVICES);
    for (let i = 0; i < said.bodies.length && doors.length; i++) {
      if (i > 0) {
        await sleep(BANNER_GAP);
        if ((await box.waiting(job)) === false) return;
      }
      const rest = said.bodies.slice(i);
      const last = worker.closing || Date.now() - lifeFrom > LIFE - LAST_CALL;
      // 并的是两条往上；只剩一条的原样敲（它已经截过一回，再截一回会多截掉一截）
      const body = last && rest.length > 1 ? clip(rest.join("\n"), BANNER_CHARS, BANNER_BYTES) : rest[0];
      const sent = await deliver(book, origin, doors, keys.vapid, (page) => replyNotice(page, { title: said.title, body }, job, tag, i), REPLY_TTL);
      // 门牌号作废了的那几台（已经从登记簿里划掉了）：后面几条不再敲它
      doors = doors.filter((_, k) => !(sent[k] && sent[k].removed));
      if (last) return;
    }
  })();
  inBackground(work);

  return json(200, { type: "reply", job, result: await ready });
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
    if (text.length > MAX_BODY) return fail(413, "寄来的东西太长");
    body = JSON.parse(text);
    if (!isRec(body)) throw new Error("不是对象");
    // 只有替她等回话那一种寄得长（整段对话都在里面），别的动作几行字就够
    if (body.op !== "reply" && text.length > SMALL_BODY) return fail(413, "寄来的东西太长");
  } catch (_) {
    return fail(400, "收到的不是合法的 JSON");
  }

  // 替她等回话
  if (body.op === "reply") return await relay(req, body);

  const state = await loadVapid();

  // 问：钥匙放好了没有。放好了就把公钥给网页（订阅要用，公钥本来就是公开的）。
  // can 是这份代码会做的事：网页看到 "reply"，就知道回话可以交给这里等；
  // "bubbles" 是横幅一个气泡敲一条，"halt" 是她按了停就把跟 Anthropic 的线掐掉（面板的“看细节”里照着说）
  if (body.op === "key") {
    const can = ["reply", "bubbles", "halt"];
    return json(200, state.ok ? { configured: true, publicKey: state.vapid.publicKey, can } : { configured: false, missing: state.missing, message: state.message, can });
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
