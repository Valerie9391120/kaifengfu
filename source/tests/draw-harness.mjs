// 测试用：在 Node 里跑真的 draw 函数（supabase/draw_function.ts，一个字不改），再配一个假的 ElevenLabs（登录那几道门、MCP、放图的地方）
// 和一张假的 draw_link 表（照 Supabase 的 PostgREST 那样收发，只认 service_role 的钥匙）。
// draw 函数和别的函数在同一个假 Supabase 里跑，各认各的密钥柜：这里给它一个自己的 Deno
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, "..", "supabase", "draw_function.ts");

export const drawEnv = {};
let seq = 0;

export async function loadDrawFunction() {
  const js = transformSync(fs.readFileSync(SOURCE, "utf8"), { loader: "ts", format: "esm", target: "es2022" }).code;
  const dir = path.join(HERE, "..", ".cache");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `draw_function.${process.pid}.${++seq}.mjs`);
  let served = null;
  globalThis.__kfsDrawDeno = {
    env: { get: (k) => drawEnv[k] },
    serve: (handler) => {
      served = handler;
    },
  };
  fs.writeFileSync(out, `const Deno = globalThis.__kfsDrawDeno;\n${js}\n`);
  await import(pathToFileURL(out).href);
  fs.rmSync(out, { force: true });
  if (typeof served !== "function") throw new Error("draw 函数没有调用 Deno.serve");
  return { handler: served };
}

// 一张 48×64 的 png（真的 png：金底一道深蓝，浏览器画得出来）
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAADAAAABACAIAAADTQmMRAAAAfElEQVR4Xu3RMQ3DQBBFQZ8VAm6DISgMyISCwxBCIXiiIJjudMWbeouvt+N7X9tK9pXG/DVIKiQVkgpJhaRCUiGpkFRIxvF86WaqXiYVkgpJhaRCUiGpkFRIKiQVkgrJcoUen/ep0VMtV6hBUiGpkFRIKiQVkgpJhaRC8gOqyQRztLXo2wAAAABJRU5ErkJggg==",
  "base64"
);

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const reply = (status, data, headers = {}) =>
  new Response(data == null ? null : typeof data === "string" ? data : JSON.stringify(data), {
    status,
    headers: { "content-type": typeof data === "string" ? "text/plain" : "application/json", ...headers },
  });

// 假的 ElevenLabs。认得这几样：
//   MCP（https://api.elevenlabs.io/v1/mcp）：不带凭证、凭证不认回 401（WWW-Authenticate 里写着说明在哪）；
//     会 initialize、notifications/initialized、tools/call（creative_add_flow_node、creative_run_flow_nodes、creative_get_flow_run_status）
//   登录的几道门：两份说明（.well-known 底下）、/oauth/authorize（照浏览器那样，直接回 302 送回 redirect_uri）、/oauth/token、/oauth/register
//   放图的地方（https://storage.googleapis.com/…）：回一张小 png
// state：
//   cimd 认不认 Client ID Metadata Document（不认的走现场登记）；sse MCP 回话用一段一段的事件（text/event-stream）；
//   life 发的凭证几秒过期；polls 画一张要被问几回“好了没”才画好；
//   fail：下一回出岔子的样子——quota（画的时候说额度不够）、genfail（画失败了）、busy（MCP 回 429）、down（MCP 回 500）、
//     badrefresh（续凭证不给）、deny（她在登录页点了不授权）、noimage（画好了取图回 404）、notpng（取回来的不是图）、noflow（往旧画布上加节点说找不到画布）
//   always 一直这样，直到改回来
export function createFakeEleven() {
  const log = [];
  const state = { cimd: true, sse: false, life: 3600, polls: 1, fail: null, always: false, art: null };
  const clients = new Map(); // 现场登记的：client_id → redirect_uris
  const codes = new Map(); // code → { client, redirect, challenge, resource }
  const access = new Map(); // access token → 几点过期
  const refreshes = new Map(); // refresh token → client
  const flows = new Map(); // flow_id → { nodes: Map(node_id → { prompt, params }) }
  const gens = new Map(); // session_id → { polls, model, prompt, params, failed }
  const sessions = new Set();
  let n = 0;
  const id = (p) => `${p}${++n}${randomBytes(4).toString("hex")}`;
  const once = (what) => {
    if (state.fail !== what) return false;
    if (!state.always) state.fail = null;
    return true;
  };
  const AS = "https://api.elevenlabs.io";
  const META = {
    issuer: AS,
    authorization_endpoint: `${AS}/oauth/authorize`,
    token_endpoint: `${AS}/oauth/token`,
    registration_endpoint: `${AS}/oauth/register`,
    code_challenge_methods_supported: ["S256"],
  };
  const grant = (client) => {
    const a = id("at_");
    const r = id("rt_");
    access.set(a, Date.now() + state.life * 1000);
    refreshes.set(r, client);
    return { access_token: a, refresh_token: r, token_type: "Bearer", expires_in: state.life };
  };
  const toolText = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
  const toolErr = (text) => ({ content: [{ type: "text", text }], isError: true });

  function callTool(name, args) {
    if (name === "creative_add_flow_node") {
      if (args.flow_id && (once("noflow") || !flows.has(args.flow_id))) return toolErr(`Flow ${args.flow_id} not found`);
      const flow = args.flow_id || id("flow");
      if (!flows.has(flow)) flows.set(flow, { nodes: new Map() });
      const node = id("node");
      flows.get(flow).nodes.set(node, { prompt: args.prompt, params: args.model_parameters || {}, model: args.model_id, label: args.label });
      return toolText({ flow_id: flow, flow_created: !args.flow_id, success: true, node_ids: [node], created_nodes: [{ id: node, model_id: args.model_id, prompt: args.prompt, model_parameters: { resolution: "1K", quality: "high", ...(args.model_parameters || {}) } }] });
    }
    if (name === "creative_run_flow_nodes") {
      const f = flows.get(args.flow_id);
      const nd = f && f.nodes.get((args.node_ids || [])[0]);
      if (!nd) return toolErr("Node not found");
      if (once("quota")) return toolErr("Insufficient credits: this generation needs 237 credits, you have 12.");
      const sid = id("sess");
      gens.set(sid, { polls: state.polls, model: nd.model, prompt: nd.prompt, params: nd.params, count: args.generations_count, failed: once("genfail") });
      return toolText({ flow_id: args.flow_id, results: [{ success: true, node_id: args.node_ids[0], session_id: sid, credit_costs: { g1: 237.08 } }], session_ids: [sid], poll_after_seconds: 15 });
    }
    if (name === "creative_get_flow_run_status") {
      const sid = (args.session_ids || [])[0];
      const g = gens.get(sid);
      if (!g) return toolErr("Session not found");
      const base = { id: "gen" + sid, model_id: g.model, modality: "image", prompt: g.prompt, price: { credits: 237.08, price_cents: 4.3 } };
      if (g.failed) return toolText({ flow_id: args.flow_id, generations: [{ ...base, status: "failed", error: "Content policy violation" }], all_completed: true, has_failures: true, session_ids: args.session_ids });
      if (g.polls > 0) {
        g.polls--;
        return toolText({ flow_id: args.flow_id, generations: [{ ...base, status: "generating" }], all_completed: false, has_failures: false, session_ids: args.session_ids, poll_after_seconds: 3 });
      }
      const url = `https://storage.googleapis.com/xi-backend/fake/${sid}/content.png?X-Goog-Signature=abc`;
      return toolText({
        flow_id: args.flow_id,
        generations: [{ ...base, status: "completed", width: 960, height: 1280, content_url: url, thumbnail_url: url.replace("content.png", "preview.webp") }],
        all_completed: true,
        has_failures: false,
        session_ids: args.session_ids,
        media: [{ generation_id: "gen" + sid, kind: "image", url, master_url: url }],
      });
    }
    return toolErr(`Unknown tool ${name}`);
  }

  async function mcp(init, headers) {
    const auth = (headers.authorization || "").replace(/^Bearer\s+/i, "");
    const exp = access.get(auth);
    const meta = `resource_metadata="${AS}/.well-known/oauth-protected-resource/v1/mcp"`;
    if (init.method === "DELETE") {
      sessions.delete(headers["mcp-session-id"]);
      return reply(204, null);
    }
    if (!exp || exp < Date.now()) return reply(401, { error: "invalid_token" }, { "www-authenticate": `Bearer ${meta}` });
    if (once("busy")) return reply(429, "Too Many Requests");
    if (once("down")) return reply(500, "Internal Server Error");
    const msg = JSON.parse(init.body || "{}");
    if (msg.method === "notifications/initialized") return reply(202, null);
    let result;
    const extra = {};
    if (msg.method === "initialize") {
      const s = id("mcps");
      sessions.add(s);
      extra["mcp-session-id"] = s;
      result = { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake-elevenlabs", version: "1" } };
    } else {
      if (!sessions.has(headers["mcp-session-id"])) return reply(404, { error: "session not found" });
      if (msg.method !== "tools/call") return reply(200, { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } });
      result = callTool(msg.params.name, msg.params.arguments || {});
      log.push({ tool: msg.params.name, args: msg.params.arguments || {} });
    }
    const body = { jsonrpc: "2.0", id: msg.id, result };
    if (state.sse) return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, { status: 200, headers: { "content-type": "text/event-stream", ...extra } });
    return reply(200, body, extra);
  }

  function authorize(u) {
    const q = u.searchParams;
    const client = q.get("client_id");
    const redirect = q.get("redirect_uri");
    const okClient = state.cimd && /^https:\/\/.+draw-client\.json$/.test(client || "") ? true : clients.has(client) && clients.get(client).includes(redirect);
    if (!okClient || q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) return reply(400, { error: "invalid_request" });
    const back = new URL(redirect);
    back.searchParams.set("state", q.get("state") || "");
    if (once("deny")) back.searchParams.set("error", "access_denied");
    else {
      const code = id("code_");
      codes.set(code, { client, redirect, challenge: q.get("code_challenge"), resource: q.get("resource") });
      back.searchParams.set("code", code);
    }
    return reply(302, null, { location: back.toString() });
  }

  function token(init) {
    const f = new URLSearchParams(init.body || "");
    if (f.get("grant_type") === "authorization_code") {
      const c = codes.get(f.get("code"));
      codes.delete(f.get("code"));
      if (!c || c.client !== f.get("client_id") || c.redirect !== f.get("redirect_uri")) return reply(400, { error: "invalid_grant" });
      const challenge = b64url(createHash("sha256").update(f.get("code_verifier") || "").digest());
      if (challenge !== c.challenge) return reply(400, { error: "invalid_grant", error_description: "PKCE" });
      return reply(200, grant(c.client));
    }
    if (f.get("grant_type") === "refresh_token") {
      const r = f.get("refresh_token");
      if (once("badrefresh") || !refreshes.has(r)) return reply(400, { error: "invalid_grant" });
      const client = refreshes.get(r);
      refreshes.delete(r); // 续一回换一张新的（旧的作废）
      return reply(200, grant(client));
    }
    return reply(400, { error: "unsupported_grant_type" });
  }

  async function receive(url, init = {}) {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const method = init.method || "GET";
    log.push({ method, path: u.pathname, host: u.hostname });
    if (u.hostname === "storage.googleapis.com") {
      if (once("noimage")) return reply(404, "Not Found");
      if (once("notpng")) return new Response("<html>nope</html>", { status: 200, headers: { "content-type": "text/html" } });
      // 截图用：state.art 里照横竖放了像样一点的图（{ "3:4": Buffer, … }），就回那一张
      const g = gens.get((/\/fake\/([^/]+)\//.exec(u.pathname) || [])[1]);
      const png = (state.art && g && state.art[(g.params && g.params.aspect_ratio) || "1:1"]) || TINY_PNG;
      return new Response(png, { status: 200, headers: { "content-type": "image/png", "content-length": String(png.length) } });
    }
    if (u.pathname === "/v1/mcp") return mcp({ ...init, method }, headers);
    if (u.pathname === "/.well-known/oauth-protected-resource/v1/mcp") return reply(200, { resource: `${AS}/v1/mcp`, authorization_servers: [AS], scopes_supported: ["mcp"] });
    if (u.pathname === "/.well-known/oauth-authorization-server") return reply(200, { ...META, ...(state.cimd ? { client_id_metadata_document_supported: true } : {}) });
    if (u.pathname === "/oauth/authorize") return authorize(u);
    if (u.pathname === "/oauth/token" && method === "POST") return token(init);
    if (u.pathname === "/oauth/register" && method === "POST") {
      const d = JSON.parse(init.body || "{}");
      const cid = id("client_");
      clients.set(cid, d.redirect_uris || []);
      return reply(201, { client_id: cid, redirect_uris: d.redirect_uris, token_endpoint_auth_method: "none" });
    }
    return reply(404, { detail: "Not Found" });
  }

  // 测试里装作 ElevenLabs 的凭证到点了
  const expireAll = () => {
    for (const k of access.keys()) access.set(k, Date.now() - 1000);
  };
  return { receive, state, log, flows, gens, expireAll, AS };
}

// 假的 draw_link 表：照 PostgREST 那样收发（GET 读、POST 加 merge-duplicates 写），只认 service_role 的钥匙。
// state.missing：表还没建（回 404，PGRST205）
export function createDrawTable(serviceKey) {
  const rows = new Map();
  const state = { missing: false, writes: 0 };
  async function receive(url, init = {}) {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    if (headers.apikey !== serviceKey) return reply(401, { message: "Invalid API key" });
    if (state.missing) return reply(404, { code: "PGRST205", message: "Could not find the table 'public.draw_link' in the schema cache" });
    if ((init.method || "GET") === "GET") {
      const uid = (u.searchParams.get("user_id") || "").replace(/^eq\./, "");
      return reply(200, rows.has(uid) ? [{ data: JSON.parse(JSON.stringify(rows.get(uid))) }] : []);
    }
    if (init.method === "POST") {
      state.writes++;
      for (const r of JSON.parse(init.body || "[]")) rows.set(r.user_id, JSON.parse(JSON.stringify(r.data)));
      return reply(201, null);
    }
    return reply(405, { message: "Method not allowed" });
  }
  return { receive, rows, state };
}
