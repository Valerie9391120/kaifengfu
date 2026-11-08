// 笔记本那扇门（alarm/door.js）：拿真的 Claude Code，配假的 Anthropic、假的 Supabase（登录、信箱、push 函数），
// 装成开封府敲门：暗记、只认开封府的网页、直接回话、替她等回话（信箱开一格、摸、封好放进去、她切走了敲手机）、她按了停、
// Claude Code 连进来调工具那一路不许从 Tailscale 转进来。
// npm run test:door（打包的时候把云端换成本地假的：__KFS_SUPABASE_URL__；没装 Claude Code 的机器上跳过）
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createDecipheriv, randomBytes } from "node:crypto";
import { createDoor, newToken, HOME_ORIGIN } from "../alarm/door.js";
import { createCloud } from "../alarm/cloud.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };

const CLAUDE = process.env.KFS_CLAUDE || ["/opt/claude-code/bin/claude"].find((f) => fs.existsSync(f)) || (() => { try { return execFileSync("which", ["claude"]).toString().trim(); } catch { return ""; } })();
if (!CLAUDE) {
  console.log("这台机器上没有 Claude Code，跳过");
  process.exit(0);
}
const SUPA_PORT = 4797; // 跟 package.json 里 test:door 打包时写进去的一样

// ---------- 假的 Anthropic：回“收到：她最后那一句”；“慢”的先等三秒 ----------
const said = (m) => (Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }]).filter((b) => b.type === "text" && !b.text.startsWith("<system-reminder>") && !b.text.startsWith("【此刻】")).map((b) => b.text.trim()).join(" ");
const api = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    if (!req.url.startsWith("/v1/messages") || req.url.includes("count_tokens")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"input_tokens":10}');
    }
    const j = JSON.parse(body);
    const text = said(j.messages[j.messages.length - 1]);
    if (text.includes("坏")) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "假的：这一句不让过" } }));
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: j.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } });
    if (text.includes("慢")) await new Promise((r) => setTimeout(r, 3000));
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "收到：" + text } });
    ev("content_block_stop", { index: 0 });
    ev("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } });
    ev("message_stop", {});
    res.end();
  });
});

// ---------- 假的 Supabase：登录、mailbox 表（照 PostgREST 的样子）、push 函数 ----------
const box = new Map(); // job → { job, note, state, sealed, beat_at, done_at }
const pushed = [];
let noTable = false;
const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const u = new URL(req.url, "http://x");
    const reply = (status, data) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };
    if (u.pathname === "/auth/v1/token") return reply(200, { access_token: "tok", refresh_token: "r", expires_in: 3600, user: { id: "u1" } });
    if (req.headers.authorization !== "Bearer tok") return reply(401, { message: "no" });
    if (u.pathname === "/functions/v1/push") {
      pushed.push(JSON.parse(body));
      return reply(200, { queued: 1 });
    }
    if (u.pathname !== "/rest/v1/mailbox") return reply(404, { message: "no" });
    if (noTable) return reply(404, { code: "PGRST205", message: "Could not find the table" });
    const eq = (k) => (u.searchParams.get(k) || "").replace(/^eq\./, "");
    const match = () => [...box.values()].filter((r) => (!u.searchParams.has("job") || r.job === eq("job")) && (!u.searchParams.has("state") || r.state === eq("state")));
    if (req.method === "POST") {
      const row = JSON.parse(body);
      if (box.has(row.job)) return reply(409, { code: "23505" });
      box.set(row.job, { ...row });
      return reply(201);
    }
    if (req.method === "GET") return reply(200, match().map((r) => ({ job: r.job })));
    if (req.method === "PATCH") {
      const patch = JSON.parse(body);
      const rows = match();
      for (const r of rows) Object.assign(r, patch);
      return reply(200, rows.map((r) => ({ job: r.job })));
    }
    if (req.method === "DELETE") {
      const rows = match();
      for (const r of rows) box.delete(r.job);
      return reply(200, rows.map((r) => ({ job: r.job })));
    }
    reply(405, {});
  });
});

const listen = (s, p = 0) => new Promise((r) => s.listen(p, "127.0.0.1", () => r(s.address().port)));
const apiPort = await listen(api);
await listen(supa, SUPA_PORT);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kfs-door-"));
const home = path.join(tmp, "home");
fs.mkdirSync(home);
const TOKEN = newToken();
const logs = [];
const cloud = createCloud({ email: "a@b.c", password: "x" });
const door = createDoor({
  token: TOKEN,
  cloud,
  claude: CLAUDE,
  cwd: path.join(tmp, "cc"),
  configDir: path.join(home, ".claude"),
  port: 0,
  version: "test",
  log: (l) => logs.push(l),
  timing: { beat: 300, grace: 400 },
  env: { HOME: home, USERPROFILE: home, ANTHROPIC_BASE_URL: `http://127.0.0.1:${apiPort}`, ANTHROPIC_API_KEY: "sk-ant-test", HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "", NO_PROXY: "127.0.0.1,localhost", DISABLE_TELEMETRY: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1" },
});
const port = await door.listen();
const base = `http://127.0.0.1:${port}`;
const H = (extra = {}) => ({ "content-type": "application/json", "x-kfs-door": TOKEN, ...extra });
const post = (p, data, headers = H(), signal) => fetch(base + p, { method: "POST", headers, body: JSON.stringify(data), signal });
const REQ = (text) => ({ model: "claude-sonnet-4-6", max_tokens: 1024, system: [{ type: "text", text: "名帖" }], messages: [{ role: "user", content: [{ type: "text", text }] }] });
const b64u = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const open = (key, sealed) => {
  const [v, iv, ct] = sealed.split(".");
  const raw = Buffer.from(ct, "base64");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return v === "v1" ? JSON.parse(Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString("utf8")) : null;
};
const job = () => "j" + randomBytes(10).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ---------- 暗记、网页 ----------
  ok((await fetch(base + "/kfs/ping")).status === 401, "不带暗记：不开门");
  let r = await fetch(base + "/kfs/ping", { headers: { "x-kfs-door": TOKEN.toLowerCase().replace(/-/g, " ") } });
  let d = await r.json();
  ok(r.status === 200 && d.ok && d.door === 1 && d.version === "test", "暗记大小写、空格横杠不算：开门，报一声开着");
  ok((await fetch(base + "/kfs/ping", { headers: { "x-kfs-door": newToken() } })).status === 401, "暗记不对：不开门");
  r = await fetch(base + "/kfs/claude", { method: "OPTIONS", headers: { Origin: HOME_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-kfs-door", "Access-Control-Request-Private-Network": "true" } });
  ok(r.status === 204 && r.headers.get("access-control-allow-origin") === HOME_ORIGIN && /x-kfs-door/.test(r.headers.get("access-control-allow-headers")) && r.headers.get("access-control-allow-private-network") === "true", "开封府的网页先问一声：答应");
  ok((await fetch(base + "/kfs/claude", { method: "OPTIONS", headers: { Origin: "https://evil.example" } })).status === 403, "别的网页问：不答应");
  ok((await post("/kfs/claude", REQ("你好"), H({ Origin: "https://evil.example" }))).status === 403, "别的网页的脚本带着暗记也不许敲");

  // ---------- 直接回话 ----------
  r = await post("/kfs/claude", REQ("你好"), H({ Origin: HOME_ORIGIN }));
  d = await r.json();
  ok(r.status === 200 && d.content[0].text === "收到：你好" && d.via === "claude-code" && r.headers.get("access-control-allow-origin") === HOME_ORIGIN, `直接回话：跟 claude 函数一个样子（${JSON.stringify(d).slice(0, 100)}）`);
  r = await post("/kfs/claude", { ...REQ("x"), model: "gpt-4" });
  ok(r.status === 400 && (await r.json()).error.type === "kaifengfu", "模型名不对：不收（报错的样子同 claude 函数）");

  // ---------- 替她等回话：她一直在跟前 ----------
  let key = randomBytes(32);
  let j = job();
  r = await post("/kfs/reply", { job: j, key: b64u(key), note: "封好的条子", tag: "tag12345", title: "光义", knock: ["https://push.example/1"], request: REQ("在吗") });
  d = await r.json();
  const row = box.get(j);
  ok(r.status === 200 && d.type === "reply" && d.job === j && d.result.status === 200 && d.result.data.content[0].text === "收到：在吗", `替她等回话：回话直接交到手上（${JSON.stringify(d).slice(0, 90)}）`);
  ok(row && row.state === "done" && row.note === "封好的条子" && row.done_at, "信箱里开了一格，放好了");
  const back = open(key, row.sealed);
  ok(back && back.status === 200 && back.data.content[0].text === "收到：在吗", "放进去的拿她那把一次性钥匙打得开，跟交到手上的一样");
  box.delete(j); // 网页拿到了，把信取走
  await sleep(800);
  ok(!pushed.length, "她在跟前（信被取走了）：不敲手机");

  // ---------- 她切走了：信没人取，敲她的手机 ----------
  key = randomBytes(32);
  j = job();
  const gone = new AbortController();
  post("/kfs/reply", { job: j, key: b64u(key), note: "条子", tag: "tag12345", title: "光义", knock: ["https://push.example/1"], request: REQ("慢慢说") }, H(), gone.signal).catch(() => {});
  await sleep(1200);
  gone.abort(); // 她锁屏了，网页那头断了
  await sleep(4500);
  ok(box.get(j) && box.get(j).state === "done" && open(key, box.get(j).sealed).data.content[0].text === "收到：慢慢说", "网页断了照样等完、放进信箱");
  const knocked = pushed.find((p) => p.job === j);
  ok(knocked && knocked.op === "notify" && knocked.tag === "tag12345" && knocked.title === "光义" && knocked.reply === "收到：慢慢说" && knocked.knock[0] === "https://push.example/1", `信没人取：借 push 函数敲她的手机，写的是他回的话（${JSON.stringify(knocked)}）`);

  // ---------- 她切走了、Claude Code 那头又没回成：也敲一条，说笔记本那头没回上（她回来点“这句走不走 API”） ----------
  key = randomBytes(32);
  j = job();
  const gone2 = new AbortController();
  post("/kfs/reply", { job: j, key: b64u(key), note: "条子", tag: "tag12345", title: "光义", knock: ["https://push.example/1"], request: REQ("坏了") }, H(), gone2.signal).catch(() => {});
  await sleep(600);
  gone2.abort();
  for (let i = 0; i < 40 && !pushed.some((p) => p.job === j); i++) await sleep(250);
  const sorry = pushed.find((p) => p.job === j);
  const stored = box.get(j) && box.get(j).state === "done" ? open(key, box.get(j).sealed) : null;
  ok(stored && stored.status >= 400 && /^cc/.test(stored.data.error.code || ""), `没回成的也放进信箱（${stored && stored.status} ${stored && stored.data.error.code}）`);
  ok(sorry && sorry.title === "开封府" && /^笔记本那头没回上/.test(sorry.reply) && sorry.reply.includes("回开封府看一眼"), `信没人取、又没回成：敲一条“笔记本那头没回上”（${sorry && sorry.reply}）`);

  // ---------- 她按了停：网页把那一格收了 ----------
  key = randomBytes(32);
  j = job();
  const pending = post("/kfs/reply", { job: j, key: b64u(key), note: "条子", tag: "tag12345", title: "光义", knock: ["https://push.example/1"], request: REQ("慢一点说") });
  await sleep(1000);
  box.delete(j);
  d = await (await pending).json();
  await sleep(900);
  ok(d.type === "reply" && d.result.status === 499 && !box.has(j) && !pushed.some((p) => p.job === j), `按了停：这一回作废，不放信、不敲手机（${d.result.status}）`);

  // ---------- 不肯接的那几种（网页看了走回老路，或者去信箱里等） ----------
  j = job();
  await post("/kfs/reply", { job: j, key: b64u(randomBytes(32)), note: "n", tag: "tag12345", request: REQ("一") });
  r = await post("/kfs/reply", { job: j, key: b64u(randomBytes(32)), note: "n", tag: "tag12345", request: REQ("一") });
  d = await r.json();
  ok(r.status === 409 && d.error.code === "duplicate", "同一个编号再敲一回：说已经在办了");
  r = await post("/kfs/reply", { job: job(), key: "short", note: "n", tag: "tag12345", request: REQ("一") });
  ok(r.status === 400 && (await r.json()).error.code === "bad_request", "钥匙不对：不接");
  noTable = true;
  r = await post("/kfs/reply", { job: job(), key: b64u(randomBytes(32)), note: "n", tag: "tag12345", request: REQ("一") });
  ok(r.status === 400 && (await r.json()).error.code === "no_mailbox", "库房里没有信箱：说一声（网页走回老路）");
  noTable = false;

  // ---------- Claude Code 连进来那一路 ----------
  const mcpUrl = `${base}/mcp/${"a".repeat(32)}`;
  const rpc = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  ok((await fetch(mcpUrl, { method: "POST", headers: { "content-type": "application/json", "Tailscale-User-Login": "x@y" }, body: JSON.stringify(rpc) })).status === 403, "从 Tailscale 转进来的：不许连工具那一路");
  ok((await fetch(mcpUrl, { method: "POST", headers: { "content-type": "application/json", Origin: HOME_ORIGIN }, body: JSON.stringify(rpc) })).status === 403, "网页的脚本：不许连工具那一路");
  d = await (await fetch(mcpUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rpc) })).json();
  ok(d.error && d.error.code === -32001, "这台电脑上连的、编号不对：那一条没有");
} finally {
  door.close();
}
ok(!logs.some((l) => /你好|在吗|慢慢说/.test(l)), "日志里不记对话里的字");
api.close();
supa.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
