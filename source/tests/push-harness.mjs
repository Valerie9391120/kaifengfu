// 测试用：在 Node 里跑真的 push 函数（supabase/push_function.ts，一个字不改），再配一个假的推送服务。
// 假推送服务照苹果文档里写的规矩验每一次请求，同时扮演那台设备：拿设备的私钥把通知解开。
// 解密这一头是照 RFC 8291 的步骤用 node:crypto 一步一步另写的，和函数里用 WebCrypto 写的加密不是同一段代码。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, "..", "supabase", "push_function.ts");
// 函数文件本身不往外交东西；测试要摸里面的零件，就在转出来的那份末尾补一行 export
const INTERNALS = ["b64uEncode", "b64uDecode", "checkVapid", "vapidToken", "encryptPayload", "pushHost", "safePage", "tidy"];

export const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

// ---------- 假的 Deno ----------
// 函数每次都现读密钥柜，所以这里的 env 改了马上生效
export const pushEnv = {};
let served = null;
let seq = 0;

export async function loadPushFunction() {
  const js = transformSync(fs.readFileSync(SOURCE, "utf8"), { loader: "ts", format: "esm", target: "es2022" }).code;
  const dir = path.join(HERE, "..", ".cache");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `push_function.${process.pid}.${++seq}.mjs`);
  fs.writeFileSync(out, `${js}\nexport { ${INTERNALS.join(", ")} };\n`);
  globalThis.Deno = {
    env: { get: (k) => pushEnv[k] },
    serve: (handler) => {
      served = handler;
    },
  };
  served = null;
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(out, { force: true });
  if (typeof served !== "function") throw new Error("push 函数没有调用 Deno.serve");
  return { handler: served, ...mod };
}

// src/ 里的文件是给打包工具看的（没写明是 ES 模块），Node 直接引会抱怨；转一道再引
export async function loadSource(relative) {
  const file = path.join(HERE, "..", relative);
  const js = transformSync(fs.readFileSync(file, "utf8"), { loader: "js", format: "esm", target: "es2022" }).code;
  const dir = path.join(HERE, "..", ".cache");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${path.basename(relative, ".js")}.${process.pid}.${++seq}.mjs`);
  fs.writeFileSync(out, js);
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(out, { force: true });
  return mod;
}

// ---------- 钥匙 ----------

// 一对 VAPID 钥匙，写法和 web-push 这类工具给的一样：公钥 65 个字节、私钥 32 个字节，都是 base64url
export function makeVapidKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

// 把一条加密的通知解开（RFC 8291 第 3.4 节的步骤）。ecdh 是那台设备的私钥
export function decryptPush(body, ecdh, auth) {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  const rs = buf.readUInt32BE(16);
  const idlen = buf[20];
  const asPublic = buf.subarray(21, 21 + idlen);
  const sealed = buf.subarray(21 + idlen);
  const uaPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(asPublic);
  const prkKey = hmac(auth, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info"), Buffer.from([0]), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm"), Buffer.from([0, 1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce"), Buffer.from([0, 1])])).subarray(0, 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
  // 正文后面是一个 2，再后面只许是 0（填充）
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (end < 0 || plain[end] !== 2) throw new Error("结尾的记号不对");
  return { text: plain.subarray(0, end).toString("utf8"), rs, idlen, total: buf.length };
}

// 验推送服务收到的签名（RFC 8292）：格式、是不是这把公钥签的、给谁的、几点过期、联系人
export function checkVapidHeader(authorization, origin, now = Date.now()) {
  const m = /^vapid t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(String(authorization || ""));
  if (!m) return { ok: false, reason: "BadAuthorizationHeader" };
  const [head, claims, sig] = m[1].split(".");
  const pub = unb64u(m[2]);
  if (pub.length !== 65 || pub[0] !== 4) return { ok: false, reason: "BadVapidPublicKey" };
  let header, body;
  try {
    header = JSON.parse(unb64u(head).toString("utf8"));
    body = JSON.parse(unb64u(claims).toString("utf8"));
  } catch (e) {
    return { ok: false, reason: "BadJwtToken" };
  }
  const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: "jwk" });
  const signed = crypto.verify("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" }, unb64u(sig));
  const sec = Math.floor(now / 1000);
  const fine =
    signed &&
    header.alg === "ES256" &&
    body.aud === origin &&
    typeof body.exp === "number" &&
    body.exp > sec &&
    body.exp <= sec + 24 * 3600 &&
    typeof body.sub === "string" &&
    (/^mailto:\S+@\S+$/.test(body.sub) || /^https:\/\/\S+$/.test(body.sub));
  return fine ? { ok: true, key: m[2], claims: body, token: m[1] } : { ok: false, reason: "BadJwtToken", claims: body, signed };
}

// ---------- 假的登记簿（push_subs 表，照 PostgREST 的规矩） ----------
// 每一行只认它的主人：读、改、删都只碰得到自己的（库房里的行级权限就是这个意思）
const SUB_COLS = ["user_id", "endpoint", "p256dh", "auth", "page", "created_at", "updated_at", "last_at", "last_status", "last_note"];

export function createLedgerTable() {
  const rows = new Map(); // user_id|endpoint → 行
  const state = { missing: false }; // 还没建表
  // 回 { status, body }；body 是 undefined 就是没有正文
  function handle(method, params, userId, bodyText) {
    if (state.missing) return { status: 404, body: { code: "PGRST205", details: null, hint: null, message: "Could not find the table 'public.push_subs' in the schema cache" } };
    if (!userId) return { status: 401, body: { code: "42501", message: "permission denied for table push_subs" } };
    const eq = params.get("endpoint");
    if (eq !== null && !eq.startsWith("eq.")) return { status: 400, body: { message: "bad filter: " + eq } };
    const mine = [...rows.values()].filter((r) => r.user_id === userId && (eq === null || r.endpoint === eq.slice(3)));
    if (method === "GET") {
      const sel = (params.get("select") || "*") === "*" ? SUB_COLS : params.get("select").split(",");
      for (const c of sel) if (!SUB_COLS.includes(c)) return { status: 400, body: { code: "42703", message: `column push_subs.${c} does not exist` } };
      return { status: 200, body: mine.map((r) => Object.fromEntries(sel.map((c) => [c, r[c] === undefined ? null : r[c]]))) };
    }
    if (method === "POST") {
      const list = [].concat(JSON.parse(bodyText || "[]"));
      for (const r of list) {
        if (r.user_id && r.user_id !== userId) return { status: 403, body: { code: "42501", message: 'new row violates row-level security policy for table "push_subs"' } };
        for (const c of Object.keys(r)) if (!SUB_COLS.includes(c)) return { status: 400, body: { code: "PGRST204", message: `Could not find the '${c}' column of 'push_subs' in the schema cache` } };
        if (!/^https:\/\//.test(r.endpoint || "") || r.endpoint.length > 1024 || !r.p256dh || !r.auth) return { status: 400, body: { code: "23514", message: 'new row for relation "push_subs" violates check constraint' } };
        const key = userId + "|" + r.endpoint;
        const now = new Date().toISOString();
        const had = rows.get(key);
        if (had && params.get("on_conflict") !== "user_id,endpoint") return { status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint" } };
        rows.set(key, { page: "", created_at: now, updated_at: now, last_at: null, last_status: null, last_note: null, ...(had || {}), ...r, user_id: userId });
      }
      return { status: 201 };
    }
    if (method === "PATCH") {
      const patch = JSON.parse(bodyText || "{}");
      for (const c of Object.keys(patch)) if (!SUB_COLS.includes(c)) return { status: 400, body: { code: "PGRST204", message: `Could not find the '${c}' column of 'push_subs' in the schema cache` } };
      for (const r of mine) Object.assign(r, patch, { user_id: userId });
      return { status: 204 };
    }
    if (method === "DELETE") {
      for (const r of mine) rows.delete(r.user_id + "|" + r.endpoint);
      return { status: 204 };
    }
    return { status: 405, body: { message: "method not allowed" } };
  }
  return { rows, state, handle, all: () => [...rows.values()] };
}

// ---------- 假的 Supabase（只有函数用得着的两样：问“这是谁”、登记簿），单元测试里用 ----------
export const FAKE_SUPABASE = "http://supabase.test";

export function createFakeSupabase() {
  const tokens = new Map(); // 登录凭证 → 人
  const table = createLedgerTable();
  const seen = []; // 函数来问过什么
  async function receive(url, init = {}) {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const user = tokens.get((headers.authorization || "").replace(/^Bearer /, "")) || null;
    seen.push({ method: init.method || "GET", path: u.pathname + u.search, apikey: headers.apikey || "" });
    const reply = (status, body) => new Response(body === undefined || status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (u.pathname === "/auth/v1/user") return user ? reply(200, { id: user.id, email: user.email }) : reply(401, { msg: "invalid JWT" });
    if (u.pathname === "/rest/v1/push_subs") {
      const r = table.handle(init.method || "GET", u.searchParams, user && user.id, init.body);
      return reply(r.status, r.body);
    }
    return reply(404, { message: "not found" });
  }
  return { tokens, table, seen, receive };
}

// ---------- 假的推送服务 ----------

const PUSH_HOST = /(\.push\.apple\.com|^fcm\.googleapis\.com|^updates\.push\.services\.mozilla\.com|\.notify\.windows\.com)$/;

export function createFakePush() {
  const devices = new Map(); // endpoint → 设备
  const log = []; // 每一次敲门
  const delivered = []; // 真送到设备上的通知（解开以后的样子）

  // mode：ok 正常；gone 这个地址作废了（410）；flaky 头一回 503、第二回才收；down 一直 503；
  //       dead 根本连不上（报错的话里带着整个地址，有的运行环境就是这样）
  function addDevice(mode = "ok", host = "web.push.apple.com") {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.generateKeys();
    const auth = crypto.randomBytes(16);
    const dev = { endpoint: `https://${host}/${b64u(crypto.randomBytes(24))}`, p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth), ecdh, authBytes: auth, mode, serverKey: null, hits: 0 };
    devices.set(dev.endpoint, dev);
    return dev;
  }

  const answer = (status, reason) => new Response(reason ? JSON.stringify({ reason }) : "", { status, headers: { "apns-id": crypto.randomUUID() } });

  async function receive(url, init = {}) {
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const body = init.body ? Buffer.from(init.body.buffer ? new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength) : init.body) : Buffer.alloc(0);
    const entry = { endpoint: url, method: init.method || "GET", headers, size: body.length, status: 0, reason: "", redirect: init.redirect || "" };
    log.push(entry);
    const done = (status, reason = "") => {
      entry.status = status;
      entry.reason = reason;
      return answer(status, reason);
    };
    const dev = devices.get(url);
    if (!dev) return done(404, "BadPath");
    dev.hits++;
    if (dev.mode === "dead") throw new TypeError(`error sending request for url (${url}): connection refused`);
    if (entry.method !== "POST") return done(405, "MethodNotAllowed");
    if (dev.mode === "gone") return done(410, "Unregistered");
    if (dev.mode === "down" || (dev.mode === "flaky" && dev.hits === 1)) return done(503, "ServiceUnavailable");
    // 下面是苹果文档里列的规矩
    if (!/^[1-9]\d*$/.test(headers.ttl || "")) return done(400, "BadTtl");
    if (headers.urgency && !["very-low", "low", "normal", "high"].includes(headers.urgency)) return done(400, "BadUrgency");
    const vapid = checkVapidHeader(headers.authorization, new URL(url).origin);
    if (!vapid.ok) return done(vapid.reason === "BadJwtToken" ? 403 : 400, vapid.reason);
    if (dev.serverKey && vapid.key !== dev.serverKey) return done(400, "VapidPkHashMismatch");
    if (body.length > 4096) return done(413, "PayloadTooLarge");
    if (headers["content-encoding"] !== "aes128gcm") return done(400, "BadWebPushRequest");
    let plain;
    try {
      plain = decryptPush(body, dev.ecdh, dev.authBytes);
    } catch (e) {
      return done(400, "BadWebPushRequest");
    }
    let message = null;
    try {
      message = JSON.parse(plain.text);
    } catch (e) {}
    delivered.push({ endpoint: url, text: plain.text, json: message, claims: vapid.claims, token: vapid.token, ttl: headers.ttl, urgency: headers.urgency || "", at: Date.now() });
    return done(201);
  }

  // 接管 fetch：去推送服务的拦下来自己答；给了假的 Supabase 就把去它那儿的也接上；别的照常放行
  const real = globalThis.fetch;
  function install(supabase) {
    globalThis.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch (e) {}
      if (PUSH_HOST.test(host)) return receive(url, init);
      if (supabase && url.startsWith(FAKE_SUPABASE + "/")) return supabase.receive(url, init);
      return real(input, init);
    };
  }
  function uninstall() {
    globalThis.fetch = real;
  }
  function reset() {
    devices.clear();
    log.length = 0;
    delivered.length = 0;
  }
  return { addDevice, devices, log, delivered, receive, install, uninstall, reset };
}
