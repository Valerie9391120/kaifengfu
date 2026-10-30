// =====================================================
// 开封府 · 画画的小后端（函数名：draw，2026 年 10 月 30 日添的，见开发说明“他画画”那一节）
// 光义在聊天里想画一张画：网页把他写的“画什么”交到这里，这里拿着她在 ElevenLabs 登录换来的凭证，
// 去敲 ElevenLabs 的 MCP（跟 claude.ai 里那个自定义连接器是同一个门），让它画；画好了把图取回来交给网页。
// 画出来的图这里不留：网页拿到以后加密了存进库房，跟照片一个路子，云端存的还是乱码。
//
// 为什么走 MCP、不走 ElevenLabs 的图片接口：图片接口要 Pro 及以上的套餐，她是 Creator；
// MCP 是拿她自己的账号登录，花的是 ElevenCreative 的额度（10 月 30 日在 claude.ai 里试过，Creator 画得出来，一张一两百点）。
//
// 登录（OAuth）：她在 API 面板里点“连上 ElevenLabs”，网页问这里要一个登录的地址（link），在浏览器里打开；
// 她在 ElevenLabs 那边登录、点授权，ElevenLabs 把浏览器送回这个函数（GET，带着 code 和 state），这里换好凭证存进 draw_link 那张表，
// 再把浏览器送到开封府网页里的 oauth/done.html（“连好了，回开封府吧”）。凭证过期了这里自己拿 refresh token 续，她不用管。
// 开封府在 ElevenLabs 那头的身份：一份放在开封府网页里的说明（oauth/draw-client.json，Client ID Metadata Document）；
// ElevenLabs 那头要是不认这种，退回去现场登记一个（Dynamic Client Registration）。
//
// 这个函数要在 Supabase 里把“Verify JWT”关掉（跟另外三个函数一样，函数自己认人）：ElevenLabs 送回来的那一下不带她的登录凭证。
//
// 密钥柜里不用另放东西。用到的：
//   SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（或者新版的 SUPABASE_SECRET_KEYS）：Supabase 自动放进来的，读写 draw_link 那张表用
//   ALLOWED_EMAIL、ALLOWED_ORIGIN：和另外三个函数共用的
// 可以有的：
//   DRAW_MODEL          用哪个模型画，默认 gpt-image-2.5-sunburst
//   DRAW_DAILY_MAX      一天最多画几张，默认 30（只是防出岔子的时候一直画下去）
//   DRAW_CLIENT_ID      开封府在 ElevenLabs 那头的身份说明放在哪（默认是网页里的 oauth/draw-client.json）
//   DRAW_CLIENT_MODE    写 dcr：不用那份说明，现场登记一个
//   ELEVENLABS_MCP_URL  ElevenLabs 的 MCP 在哪，默认 https://api.elevenlabs.io/v1/mcp
//
// 动作（网页 POST，带着她的登录凭证）：
//   status  连上 ElevenLabs 没有（不去敲 ElevenLabs 的门，不花钱）：{ type: "status", linked, at, model, can }
//   link    去 ElevenLabs 登录的地址：{ type: "link", url }
//   unlink  不连了：凭证删掉。{ type: "unlinked" }
//   start   开画一张：{ prompt, ratio } → { type: "job", job: { flow, node, sessions }, credits }
//   check   画好没有：{ job } → { type: "pending", after } | { type: "image", data（base64）, mime, w, h, credits } | { type: "failed", why }
// GET ?code=…&state=…：ElevenLabs 把她送回来的那一下（见上面“登录”）
// =====================================================

const MCP_DEFAULT = "https://api.elevenlabs.io/v1/mcp";
const CLIENT_DEFAULT = "https://valerie9391120.github.io/kaifengfu/oauth/draw-client.json";
const DONE_PAGE = "https://valerie9391120.github.io/kaifengfu/oauth/done.html";
const DEFAULT_MODEL = "gpt-image-2.5-sunburst";
const PROTO = "2025-06-18"; // 跟 ElevenLabs 的 MCP 说的版本（它回的要是别的版本，照它的）
const RATIOS: Record<string, string> = { 方: "1:1", 横: "4:3", 竖: "3:4" };
const MAX_PROMPT = 2000; // 一张画的“画什么”最多这么多个字
const SMALL_BODY = 16000; // 寄来的东西最多这么长
const CALL_TIMEOUT = 25_000; // 敲 ElevenLabs 一回最多等这么久
const IMG_TIMEOUT = 25_000; // 取图最多等这么久
const IMG_MAX = 12_000_000; // 取回来的图最多这么大
const PENDING_AGE = 15 * 60 * 1000; // 去登录的那一趟最多走这么久（state 过了就不认）
const DAILY_DEFAULT = 30;

// 开封府的网页住在这儿（搬了家就在密钥柜里写 ALLOWED_ORIGIN）
const HOME_ORIGIN = "https://valerie9391120.github.io";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

// 密钥柜里贴进来的值：两头的空白和引号去掉（整段粘贴的时候容易带上）
function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}

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

function cors(): Record<string, string> {
  const set = env("ALLOWED_ORIGIN");
  return {
    "Access-Control-Allow-Origin": set && set !== "*" ? homeOrigin() : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(), "Content-Type": "application/json" } });
}

// 出错时的格式和另外几个函数一样。code：是哪一种（网页看了知道怎么跟她说）：
//   setup 她在 Supabase 那头还差一步（表没建、钥匙没有）；auth 要重新连一回 ElevenLabs；unlinked 还没连 ElevenLabs；
//   quota 额度不够；cap 今天画够数了；busy 太挤；down 一时出岔子；refused ElevenLabs 不肯画；bad 寄来的不对
function fail(status: number, message: string, code = ""): Response {
  return json(status, { type: "error", error: { type: "kaifengfu", message, ...(code ? { code } : {}) } });
}

class Oops extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function tidy(text: string): string {
  return String(text).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

// ---------- 认人 ----------
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

// ---------- draw_link 那张表 ----------
// 拿 Supabase 自动放进来的 service_role 钥匙读写（这张表只给它开了门，见 draw.sql）
function serviceKey(): string {
  const old = env("SUPABASE_SERVICE_ROLE_KEY");
  if (old) return old;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
    const first = Object.values(keys)[0];
    if (typeof first === "string") return first;
  } catch (_) {
    // 没有新版钥匙
  }
  return "";
}

function tableHeaders(): Record<string, string> {
  const key = serviceKey();
  if (!key || !env("SUPABASE_URL")) throw new Oops("setup", "这个函数拿不到 Supabase 自动放进来的 service_role 钥匙", 500);
  // 新版的 sb_secret_ 钥匙不是 JWT，只放在 apikey 里；旧版的 service_role 是 JWT，两处都放
  return key.startsWith("sb_secret_") ? { apikey: key, "Content-Type": "application/json" } : { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function tableTrouble(r: Response): Promise<Oops> {
  let text = "";
  try {
    text = await r.text();
  } catch (_) {
    // 读不出来
  }
  if (r.status === 404 || /PGRST205|42P01|draw_link/.test(text)) return new Oops("setup", "库房里还没有画画的登记（draw_link）：在 Supabase 的 SQL Editor 里跑一遍 draw.sql", 500);
  return new Oops("down", `库房一时出岔子了（${r.status}）`, 502);
}

async function readLink(uid: string): Promise<Rec> {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/draw_link?user_id=eq.${encodeURIComponent(uid)}&select=data`, { headers: tableHeaders() });
  if (!r.ok) throw await tableTrouble(r);
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] && isRec(rows[0].data) ? (rows[0].data as Rec) : {};
}

async function writeLink(uid: string, data: Rec): Promise<void> {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/draw_link?on_conflict=user_id`, {
    method: "POST",
    headers: { ...tableHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ user_id: uid, data, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw await tableTrouble(r);
}

// ---------- 找门：ElevenLabs 的登录在哪（OAuth 的几份说明，照 MCP 的规矩找） ----------
function mcpUrl(): string {
  const set = env("ELEVENLABS_MCP_URL");
  if (set && /^https:\/\//.test(set)) return set;
  return MCP_DEFAULT;
}
const redirectUri = () => `${env("SUPABASE_URL")}/functions/v1/draw`;
const clientIdUrl = () => {
  const set = env("DRAW_CLIENT_ID");
  return set && /^https:\/\//.test(set) ? set : CLIENT_DEFAULT;
};

async function getJson(url: string): Promise<Rec | null> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(CALL_TIMEOUT) });
    if (!r.ok) return null;
    const d = await r.json();
    return isRec(d) ? d : null;
  } catch (_) {
    return null;
  }
}

// 先不带凭证敲一下 MCP 的门：它回 401，WWW-Authenticate 里写着那份说明（protected resource metadata）在哪
async function resourceMetaUrl(): Promise<string> {
  try {
    const r = await fetch(mcpUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTO, capabilities: {}, clientInfo: { name: "kaifengfu", version: "1" } } }),
      signal: AbortSignal.timeout(CALL_TIMEOUT),
    });
    try {
      await r.body?.cancel();
    } catch (_) {
      // 不要了
    }
    const m = /resource_metadata="([^"]+)"/i.exec(r.headers.get("www-authenticate") || "");
    if (m) return m[1];
  } catch (_) {
    // 没连上：照规矩的位置去找
  }
  return "";
}

type AS = { issuer: string; authorize: string; token: string; register: string; cimd: boolean };

async function discover(): Promise<{ as: AS; resource: string; scope: string }> {
  const mcp = new URL(mcpUrl());
  const tries = [await resourceMetaUrl(), `${mcp.origin}/.well-known/oauth-protected-resource${mcp.pathname}`, `${mcp.origin}/.well-known/oauth-protected-resource`].filter(Boolean);
  let prm: Rec | null = null;
  for (const u of tries) {
    prm = await getJson(u);
    if (prm) break;
  }
  const servers = prm && Array.isArray(prm.authorization_servers) ? prm.authorization_servers.filter((x) => typeof x === "string") : [];
  const issuer = String(servers[0] || mcp.origin);
  const resource = prm && typeof prm.resource === "string" ? prm.resource : mcpUrl();
  const scopes = prm && Array.isArray(prm.scopes_supported) ? prm.scopes_supported.filter((x) => typeof x === "string") : [];
  const iu = new URL(issuer);
  const path = iu.pathname.replace(/\/$/, "");
  const asTries = path
    ? [`${iu.origin}/.well-known/oauth-authorization-server${path}`, `${iu.origin}/.well-known/openid-configuration${path}`, `${iu.origin}${path}/.well-known/openid-configuration`]
    : [`${iu.origin}/.well-known/oauth-authorization-server`, `${iu.origin}/.well-known/openid-configuration`];
  let meta: Rec | null = null;
  for (const u of asTries) {
    meta = await getJson(u);
    if (meta) break;
  }
  if (!meta || typeof meta.authorization_endpoint !== "string" || typeof meta.token_endpoint !== "string") {
    throw new Oops("down", "找不到 ElevenLabs 的登录入口（它那边的 OAuth 说明取不到）", 502);
  }
  return {
    as: {
      issuer: String(meta.issuer || issuer),
      authorize: meta.authorization_endpoint,
      token: meta.token_endpoint,
      register: typeof meta.registration_endpoint === "string" ? meta.registration_endpoint : "",
      cimd: meta.client_id_metadata_document_supported === true,
    },
    resource,
    scope: scopes.join(" "),
  };
}

// 开封府在 ElevenLabs 那头的身份：认那份说明的用那份说明；不认的、她在密钥柜里写了 DRAW_CLIENT_MODE=dcr 的，现场登记一个
async function clientFor(as: AS, link: Rec): Promise<string> {
  const mode = env("DRAW_CLIENT_MODE").toLowerCase();
  if (as.cimd && mode !== "dcr") return clientIdUrl();
  if (typeof link.client === "string" && link.clientAs === as.issuer && link.clientRedirect === redirectUri()) return link.client;
  if (!as.register) throw new Oops("refused", "ElevenLabs 那头不认开封府这种登录方式（没有登记的地方）", 502);
  let r: Response;
  try {
    r = await fetch(as.register, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_name: "开封府",
        redirect_uris: [redirectUri()],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT),
    });
  } catch (_) {
    throw new Oops("down", "连不上 ElevenLabs 的登记处", 502);
  }
  const d = await r.json().catch(() => null);
  if (!r.ok || !isRec(d) || typeof d.client_id !== "string") throw new Oops("refused", `ElevenLabs 不给开封府登记（${r.status}）`, 502);
  link.client = d.client_id;
  link.clientAs = as.issuer;
  link.clientRedirect = redirectUri();
  return d.client_id;
}

// ---------- 凭证 ----------
type Tokens = { access: string; refresh: string; exp: number };

async function tokenRequest(as: AS, form: Record<string, string>): Promise<{ ok: true; tokens: Tokens } | { ok: false; status: number; error: string }> {
  let r: Response;
  try {
    r = await fetch(as.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(CALL_TIMEOUT),
    });
  } catch (_) {
    return { ok: false, status: 0, error: "offline" };
  }
  const d = await r.json().catch(() => null);
  if (!r.ok || !isRec(d) || typeof d.access_token !== "string") {
    return { ok: false, status: r.status, error: isRec(d) && typeof d.error === "string" ? d.error : `http_${r.status}` };
  }
  const life = Number(d.expires_in);
  return {
    ok: true,
    tokens: {
      access: d.access_token,
      refresh: typeof d.refresh_token === "string" ? d.refresh_token : String(form.refresh_token || ""),
      exp: Date.now() + (Number.isFinite(life) && life > 0 ? life * 1000 : 3600 * 1000),
    },
  };
}

function tokensOf(link: Rec): Tokens | null {
  const t = link.tokens;
  return isRec(t) && typeof t.access === "string" && t.access ? { access: t.access, refresh: String(t.refresh || ""), exp: Number(t.exp) || 0 } : null;
}

// 拿一张能用的凭证：快过期了（一分钟以内）、或者 force（MCP 刚说不认）就拿 refresh token 续一张。
// 续不成（refresh token 也作废了）：凭证清掉，她得重新连一回
async function accessFor(uid: string, link: Rec, force = false): Promise<string> {
  const t = tokensOf(link);
  if (!t) throw new Oops("unlinked", "还没连上 ElevenLabs：在 API 面板里点“连上 ElevenLabs”", 409);
  if (!force && t.exp - Date.now() > 60_000) return t.access;
  const as = link.as as AS;
  if (!t.refresh || !isRec(as)) throw new Oops("auth", "ElevenLabs 的登录过期了：在 API 面板里重新连一回", 401);
  const got = await tokenRequest(as, { grant_type: "refresh_token", refresh_token: t.refresh, client_id: String(link.clientUsed || ""), ...(link.resource ? { resource: String(link.resource) } : {}) });
  if (got.ok) {
    link.tokens = got.tokens;
    await writeLink(uid, link);
    return got.tokens.access;
  }
  if (got.status === 0 || got.status >= 500) throw new Oops("down", "续 ElevenLabs 的登录的时候没连上，过一会儿再试", 502);
  // 两回一起续：先续的那一回把 refresh token 换了，后来的这一回拿的是旧的。再读一遍，那边续好了就用那边的
  const again = await readLink(uid);
  const t2 = tokensOf(again);
  if (t2 && t2.access !== t.access && t2.exp - Date.now() > 60_000) {
    Object.assign(link, again);
    return t2.access;
  }
  delete link.tokens;
  await writeLink(uid, link);
  throw new Oops("auth", "ElevenLabs 的登录过期了：在 API 面板里重新连一回", 401);
}

// ---------- 敲 ElevenLabs 的 MCP ----------
// 一回请求开一个会话：先打招呼（initialize），再说“好了”（notifications/initialized），再一样一样调工具（tools/call）。
// 回来的可能是一整块 JSON，也可能是一段一段的事件（text/event-stream），两种都认
async function readRpc(r: Response, id: number): Promise<Rec> {
  const type = r.headers.get("content-type") || "";
  const text = await r.text();
  if (type.includes("text/event-stream")) {
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      try {
        const msg = JSON.parse(data);
        if (isRec(msg) && msg.id === id) return msg;
      } catch (_) {
        // 这一段不是 JSON
      }
    }
    throw new Oops("down", "ElevenLabs 的回话没读全", 502);
  }
  try {
    const msg = JSON.parse(text);
    if (isRec(msg)) return msg;
  } catch (_) {
    // 不是 JSON
  }
  throw new Oops("down", "ElevenLabs 回来的不是 MCP 的话", 502);
}

type Call = { name: string; args: Rec };

async function mcpSession(access: string, calls: Call[]): Promise<Rec[]> {
  const url = mcpUrl();
  let session = "";
  let proto = PROTO;
  let id = 0;
  const post = async (msg: Rec): Promise<Response> => {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${access}` };
    if (session) headers["Mcp-Session-Id"] = session;
    if (id > 1 || msg.method === "notifications/initialized") headers["MCP-Protocol-Version"] = proto;
    try {
      return await fetch(url, { method: "POST", headers, body: JSON.stringify(msg), signal: AbortSignal.timeout(CALL_TIMEOUT) });
    } catch (_) {
      throw new Oops("down", "连不上 ElevenLabs 的 MCP", 502);
    }
  };
  const ask = async (method: string, params: Rec): Promise<Rec> => {
    const my = ++id;
    const r = await post({ jsonrpc: "2.0", id: my, method, params });
    if (r.status === 401) throw new Oops("auth401", "ElevenLabs 不认这张凭证", 401);
    if (r.status === 429) throw new Oops("busy", "ElevenLabs 那边太挤，过一会儿再画", 503);
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Oops(r.status >= 500 ? "down" : "refused", `ElevenLabs 的 MCP 回了 ${r.status}${t ? "：" + tidy(t) : ""}`, 502);
    }
    if (method === "initialize") session = r.headers.get("mcp-session-id") || "";
    const msg = await readRpc(r, my);
    if (isRec(msg.error)) throw new Oops("refused", `ElevenLabs 说：${tidy(String(msg.error.message || "出错了"))}`, 502);
    return isRec(msg.result) ? msg.result : {};
  };
  const init = await ask("initialize", { protocolVersion: PROTO, capabilities: {}, clientInfo: { name: "kaifengfu", version: "1" } });
  if (typeof init.protocolVersion === "string") proto = init.protocolVersion;
  const note = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  try {
    await note.body?.cancel();
  } catch (_) {
    // 不用读
  }
  const out: Rec[] = [];
  for (const c of calls) out.push(await ask("tools/call", { name: c.name, arguments: c.args }));
  if (session) {
    // 会话用完了说一声（它不理也不要紧）
    fetch(url, { method: "DELETE", headers: { "Mcp-Session-Id": session, Authorization: `Bearer ${access}`, "MCP-Protocol-Version": proto }, signal: AbortSignal.timeout(5000) })
      .then((r) => r.body?.cancel())
      .catch(() => {});
  }
  return out;
}

// 带着凭证敲：MCP 说凭证不认（401），续一张再敲一回（就一回）
async function withAccess(uid: string, link: Rec, calls: Call[]): Promise<Rec[]> {
  const access = await accessFor(uid, link);
  try {
    return await mcpSession(access, calls);
  } catch (e) {
    if (!(e instanceof Oops) || e.code !== "auth401") throw e;
  }
  const fresh = await accessFor(uid, link, true);
  try {
    return await mcpSession(fresh, calls);
  } catch (e) {
    if (e instanceof Oops && e.code === "auth401") throw new Oops("auth", "ElevenLabs 的登录过期了：在 API 面板里重新连一回", 401);
    throw e;
  }
}

// 工具回来的东西：结构化的那份（structuredContent）先认，再看文字里是不是一块 JSON
function toolOut(result: Rec): Rec {
  const texts = (Array.isArray(result.content) ? result.content : []).filter((c) => isRec(c) && c.type === "text").map((c) => String((c as Rec).text || ""));
  if (result.isError) throw new Oops(blame(texts.join(" ")), elevenSays(texts.join(" ")), 502);
  if (isRec(result.structuredContent)) return result.structuredContent;
  for (const t of texts) {
    try {
      const d = JSON.parse(t);
      if (isRec(d)) return d;
    } catch (_) {
      // 不是 JSON
    }
  }
  return { text: texts.join("\n") };
}
// ElevenLabs 不肯画的时候说的话：额度不够、套餐不够认出来，别的照原话
function blame(text: string): string {
  if (/credit|quota|insufficient|balance|payment|402/i.test(text)) return "quota";
  if (/rate.?limit|too many|429|busy|overloaded/i.test(text)) return "busy";
  return "refused";
}
function elevenSays(text: string): string {
  const code = blame(text);
  if (code === "quota") return "ElevenLabs 的额度不够了";
  if (code === "busy") return "ElevenLabs 那边太挤，过一会儿再画";
  return `ElevenLabs 不肯画${text ? "：" + tidy(text) : ""}`;
}

// ---------- 画 ----------
function modelOf(): string {
  const set = env("DRAW_MODEL");
  return /^[a-z0-9][a-z0-9.-]{2,60}$/.test(set) ? set : DEFAULT_MODEL;
}
function dailyMax(): number {
  const n = Number(env("DRAW_DAILY_MAX"));
  return Number.isFinite(n) && n >= 1 && n <= 500 ? Math.floor(n) : DAILY_DEFAULT;
}
const today = () => new Date().toISOString().slice(0, 10);
const ratioOf = (r: unknown) => {
  const s = typeof r === "string" ? r.trim() : "";
  if (RATIOS[s]) return RATIOS[s];
  if (["1:1", "4:3", "3:4", "16:9", "9:16"].includes(s)) return s;
  return RATIOS["方"];
};
const sessionsOf = (out: Rec): string[] => {
  const ids = Array.isArray(out.session_ids) ? out.session_ids : Array.isArray(out.results) ? out.results.map((x) => (isRec(x) ? x.session_id : "")) : [];
  return ids.filter((x) => typeof x === "string" && x).slice(0, 8) as string[];
};
const creditsOf = (out: Rec): number => {
  let sum = 0;
  for (const x of Array.isArray(out.results) ? out.results : []) {
    if (!isRec(x) || !isRec(x.credit_costs)) continue;
    for (const v of Object.values(x.credit_costs)) if (Number.isFinite(Number(v))) sum += Number(v);
  }
  return Math.round(sum);
};

async function start(uid: string, body: Rec): Promise<Response> {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return fail(400, "没写要画什么", "bad");
  if (Array.from(prompt).length > MAX_PROMPT) return fail(400, `太长了：一张画最多写 ${MAX_PROMPT} 个字`, "bad");
  const link = await readLink(uid);
  // 一天画几张（只是防出岔子的时候一直画下去）：开画之前先记上，开画没成也算一回，不来回试
  const day = isRec(link.day) && link.day.d === today() ? link.day : { d: today(), n: 0 };
  if (Number(day.n) >= dailyMax()) return fail(429, `今天已经画了 ${day.n} 张，到上限了（一天 ${dailyMax()} 张）`, "cap");
  if (!tokensOf(link)) return fail(409, "还没连上 ElevenLabs：在 API 面板里点“连上 ElevenLabs”", "unlinked");
  const model = modelOf();
  const node = (flow: string): Call => ({
    name: "creative_add_flow_node",
    args: {
      node_type: "image-generation",
      model_id: model,
      prompt,
      model_parameters: { aspect_ratio: ratioOf(body.ratio) },
      label: "开封府",
      context: "开封府：光义在聊天里给卿卿画一张画",
      ...(flow ? { flow_id: flow } : {}),
    },
  });
  // 先加一个节点（不花钱），再叫它画（花钱，就一回，不重试）。画都画在同一张画布上（开封府用的那一张），找不到了另开一张
  const flow0 = typeof link.flow === "string" ? link.flow : "";
  let added: Rec;
  try {
    added = toolOut((await withAccess(uid, link, [node(flow0)]))[0]);
  } catch (e) {
    if (!flow0 || !(e instanceof Oops) || e.code !== "refused") throw e;
    added = toolOut((await withAccess(uid, link, [node("")]))[0]);
  }
  const flow = typeof added.flow_id === "string" ? added.flow_id : "";
  const nodeId = Array.isArray(added.node_ids) && typeof added.node_ids[0] === "string" ? added.node_ids[0] : Array.isArray(added.created_nodes) && isRec(added.created_nodes[0]) ? String(added.created_nodes[0].id || "") : "";
  if (!flow || !nodeId) return fail(502, "ElevenLabs 没把画布准备好", "refused");
  link.day = { d: day.d, n: Number(day.n) + 1 };
  link.flow = flow;
  await writeLink(uid, link);
  const ran = toolOut(
    (await withAccess(uid, link, [{ name: "creative_run_flow_nodes", args: { flow_id: flow, node_ids: [nodeId], generations_count: 1, context: "开封府：光义在聊天里给卿卿画一张画" } }]))[0]
  );
  const sessions = sessionsOf(ran);
  if (!sessions.length) {
    const why = Array.isArray(ran.results) && isRec(ran.results[0]) ? String(ran.results[0].error || ran.results[0].message || "") : String(ran.text || "");
    return fail(502, elevenSays(why), blame(why));
  }
  return json(200, { type: "job", job: { flow, node: nodeId, sessions }, credits: creditsOf(ran), model });
}

// 取图：只认 https、不认本机和内网的地址，最多这么大，看头几个字节认是不是 png、jpeg、webp
function safeImageUrl(u: unknown): string {
  if (typeof u !== "string") return "";
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" || x.username || x.password) return "";
    const h = x.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":") || !h.includes(".")) return "";
    return x.toString();
  } catch (_) {
    return "";
  }
}
function mimeOf(b: Uint8Array): string {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}
async function fetchImage(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  let r: Response;
  try {
    r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(IMG_TIMEOUT) });
  } catch (_) {
    throw new Oops("down", "画好了，取图的时候没连上，过一会儿再取", 502);
  }
  if (!r.ok) throw new Oops("down", `画好了，取图的时候 ElevenLabs 回了 ${r.status}`, 502);
  const size = Number(r.headers.get("content-length") || 0);
  if (size > IMG_MAX) throw new Oops("refused", "画出来的图太大了", 502);
  const reader = r.body?.getReader();
  if (!reader) throw new Oops("down", "画好了，图没取回来", 502);
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (got > IMG_MAX) {
      try {
        await reader.cancel();
      } catch (_) {
        // 不要了
      }
      throw new Oops("refused", "画出来的图太大了", 502);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  const mime = mimeOf(bytes);
  if (!mime) throw new Oops("refused", "取回来的不是一张图", 502);
  return { bytes, mime };
}

async function check(uid: string, body: Rec): Promise<Response> {
  const job = isRec(body.job) ? body.job : null;
  const flow = job && typeof job.flow === "string" ? job.flow : "";
  const sessions = job && Array.isArray(job.sessions) ? job.sessions.filter((x) => typeof x === "string" && x).slice(0, 8) : [];
  if (!flow || !sessions.length || flow.length > 100) return fail(400, "不知道要看哪一张", "bad");
  const link = await readLink(uid);
  const out = toolOut((await withAccess(uid, link, [{ name: "creative_get_flow_run_status", args: { flow_id: flow, session_ids: sessions, context: "开封府：看光义的画画好没有" } }]))[0]);
  const gens = Array.isArray(out.generations) ? out.generations.filter(isRec) : [];
  const g = gens[0] as Rec | undefined;
  const status = g ? String(g.status || "") : "";
  if (out.has_failures === true || status === "failed" || status === "error" || status === "canceled" || status === "cancelled") {
    const why = g ? String(g.error || g.failure_reason || g.error_message || g.message || "") : "";
    return json(200, { type: "failed", why: why ? `ElevenLabs 没画成：${tidy(why)}` : "ElevenLabs 没画成" });
  }
  const media = Array.isArray(out.media) && isRec(out.media[0]) ? (out.media[0] as Rec) : null;
  const url = safeImageUrl(g && g.content_url) || safeImageUrl(media && media.master_url) || safeImageUrl(media && media.url);
  if (!g || status !== "completed" || !url) {
    const after = Number(out.poll_after_seconds);
    return json(200, { type: "pending", after: Number.isFinite(after) && after > 0 ? Math.min(30, after) : 4, status: status || "pending" });
  }
  const img = await fetchImage(url);
  const price = isRec(g.price) ? Number(g.price.credits) : NaN;
  return json(200, { type: "image", data: b64(img.bytes), mime: img.mime, w: Number(g.width) || 0, h: Number(g.height) || 0, ...(Number.isFinite(price) ? { credits: Math.round(price) } : {}) });
}

// ---------- 登录 ----------
const PENDING_MAX = 4;
const pendingsOf = (link: Rec): Rec[] =>
  (Array.isArray(link.pendings) ? link.pendings : []).filter((p: unknown) => isRec(p) && typeof p.state === "string" && Date.now() - Number(p.at || 0) <= PENDING_AGE) as Rec[];
async function begin(uid: string): Promise<Response> {
  const link = await readLink(uid);
  const { as, resource, scope } = await discover();
  const client = await clientFor(as, link);
  const verifier = randomToken(48);
  const state = `${uid}.${randomToken(24)}`;
  link.as = as;
  link.resource = resource;
  link.scope = scope;
  // 登录到一半的几趟都记着（最多 PENDING_MAX 趟、十五分钟以内的）：她在两台设备上都点开过面板、点了一回又点一回，
  // 哪一趟先登录完都认，不是只认最后要的那一趟
  link.pendings = pendingsOf(link).concat([{ state, verifier, at: Date.now(), client }]).slice(-PENDING_MAX);
  delete link.pending;
  await writeLink(uid, link);
  const q = new URLSearchParams({
    response_type: "code",
    client_id: client,
    redirect_uri: redirectUri(),
    code_challenge: await challengeOf(verifier),
    code_challenge_method: "S256",
    state,
    resource,
    ...(scope ? { scope } : {}),
  });
  return json(200, { type: "link", url: `${as.authorize}${as.authorize.includes("?") ? "&" : "?"}${q.toString()}` });
}

// ElevenLabs 把她的浏览器送回来：认 state（头一截是她的编号），换凭证，存好，把浏览器送到“连好了”那一页
const done = (ok: boolean, why = "") => {
  const u = new URL(DONE_PAGE);
  if (ok) u.searchParams.set("ok", "1");
  else u.searchParams.set("why", why.slice(0, 120));
  return new Response(null, { status: 302, headers: { Location: u.toString(), "Cache-Control": "no-store" } });
};
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
async function callback(url: URL): Promise<Response> {
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const err = url.searchParams.get("error") || "";
  const uid = state.split(".")[0] || "";
  if (!/^[0-9a-f-]{36}$/i.test(uid)) return done(false, "这一趟登录认不出是谁的，回开封府重新点一回“连上 ElevenLabs”");
  let link: Rec;
  try {
    link = await readLink(uid);
  } catch (e) {
    return done(false, e instanceof Oops ? e.message : "库房一时出岔子了");
  }
  const live = pendingsOf(link);
  const p = live.find((x) => sameText(String(x.state), state)) || null;
  if (!p) return done(false, "这一趟登录过期了，回开封府重新点一回“连上 ElevenLabs”");
  link.pendings = live.filter((x) => x !== p);
  if (err || !code) {
    await writeLink(uid, link).catch(() => {});
    return done(false, err === "access_denied" ? "没给授权" : `ElevenLabs 没让登录（${tidy(err || "没有 code")}）`);
  }
  const as = link.as as AS;
  const got = await tokenRequest(as, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: String(p.client || ""),
    code_verifier: String(p.verifier || ""),
    ...(link.resource ? { resource: String(link.resource) } : {}),
  });
  if (!got.ok) {
    await writeLink(uid, link).catch(() => {});
    return done(false, `换凭证没成（${got.error}）`);
  }
  link.tokens = got.tokens;
  link.clientUsed = String(p.client || "");
  link.linkedAt = Date.now();
  delete link.pendings; // 连上了：别的几趟都不要了
  try {
    await writeLink(uid, link);
  } catch (e) {
    return done(false, e instanceof Oops ? e.message : "凭证没存下来");
  }
  return done(true);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  const url = new URL(req.url);
  // ElevenLabs 把她送回来的那一下：浏览器直接打开的，不带她的登录凭证
  if (req.method === "GET" && (url.searchParams.has("state") || url.searchParams.has("code") || url.searchParams.has("error"))) {
    try {
      return await callback(url);
    } catch (e) {
      return done(false, e instanceof Oops ? e.message : "出岔子了");
    }
  }
  if (req.method !== "POST") return fail(405, "只收 POST");

  const user = await whoIsKnocking(req);
  if (!user) return fail(401, "请先登录开封府");
  const allowed = env("ALLOWED_EMAIL").toLowerCase();
  if (allowed && (user.email ?? "").trim().toLowerCase() !== allowed) return fail(403, "这里只认卿卿");

  let body: Rec;
  try {
    const text = await req.text();
    if (text.length > SMALL_BODY) return fail(413, "寄来的东西太长");
    const parsed = JSON.parse(text);
    if (!isRec(parsed)) throw new Error("不是对象");
    body = parsed;
  } catch (_) {
    return fail(400, "收到的不是合法的 JSON", "bad");
  }

  try {
    if (body.op === "status") {
      const link = await readLink(user.id);
      return json(200, { type: "status", linked: !!tokensOf(link), at: Number(link.linkedAt) || 0, model: modelOf(), can: ["link", "unlink", "start", "check"] });
    }
    if (body.op === "link") return await begin(user.id);
    if (body.op === "unlink") {
      const link = await readLink(user.id);
      delete link.tokens;
      delete link.pendings;
      await writeLink(user.id, link);
      return json(200, { type: "unlinked" });
    }
    if (body.op === "start") return await start(user.id, body);
    if (body.op === "check") return await check(user.id, body);
    return fail(400, "不认识这个动作", "bad");
  } catch (e) {
    if (e instanceof Oops) return fail(e.status, e.message, e.code === "auth401" ? "auth" : e.code);
    return fail(500, `出岔子了：${tidy(String((e as Error)?.message || e))}`, "down");
  }
});
