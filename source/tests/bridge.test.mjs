// 传话走这台电脑上的 Claude Code（alarm/bridge.js）：拿真的 Claude Code，配一个假的 Anthropic（不花钱、回什么照规矩来），
// 再配一个假的“她接的 MCP”，把开封府寄来的那几种包走一遍：
//   平常说一句、接着上一回那一条说（不另起）、重新回答（另起，照这一包从头接）、带图和工具的前情、
//   停在手机那头的工具上（回话停在 tool_use，结果寄回来他接着说）、一回调两样、这一回不许调、她接的 MCP（写成 mcp_tool_use）、
//   她按了停、出了岔子、磁盘上不落明文。
// 直接跑：node tests/bridge.test.mjs（找不到 Claude Code 就跳过；KFS_CLAUDE 可以指定在哪）
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createBridge, sessionDir } from "../alarm/bridge.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); if (process.env.KFS_FAILFAST) process.exit(1); } };

// ---------- 真的 Claude Code ----------
const CLAUDE = process.env.KFS_CLAUDE || ["/opt/claude-code/bin/claude"].find((f) => fs.existsSync(f)) || (() => { try { return execFileSync("which", ["claude"]).toString().trim(); } catch { return ""; } })();
if (!CLAUDE) {
  console.log("这台机器上没有 Claude Code，跳过");
  process.exit(0);
}

// ---------- 假的 Anthropic ----------
// 照她最后那一句（去掉 Claude Code 自己附的 <system-reminder>、开封府附的【此刻】）回：
//   带 tool_result 的：回“结果：……”；“骰子”：先说一句再调 jianghu_roll；“两样”：一回调两样；“不许”：调 qx_draw；
//   “查”：调她接的 tavily 的 search；“慢”：开了头等三秒；“401”：照 Anthropic 没登录的样子报错；别的：回“收到：……”
const seen = []; // 每一回请求：{ system, messages, tools, thinking, max_tokens }
const said = (m) => (Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }]).filter((b) => b.type === "text" && !b.text.startsWith("<system-reminder>") && !b.text.startsWith("【此刻】")).map((b) => b.text.trim()).join(" ");
const api = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    if (!req.url.startsWith("/v1/messages") || req.url.includes("count_tokens")) {
      res.writeHead(req.url.includes("count_tokens") ? 200 : 404, { "content-type": "application/json" });
      return res.end(req.url.includes("count_tokens") ? '{"input_tokens":10}' : '{"type":"error","error":{"type":"not_found_error","message":"nope"}}');
    }
    const j = JSON.parse(body);
    seen.push({ system: j.system, messages: j.messages, tools: (j.tools || []).map((t) => t.name), thinking: j.thinking, max_tokens: j.max_tokens });
    // 同真的 Anthropic：名帖里有一块只有空白的字就不收（开封府测试连接那一包没带名帖，撞过这个）
    if (Array.isArray(j.system) && j.system.some((b) => b && b.type === "text" && !String(b.text || "").trim())) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "system: text content blocks must contain non-whitespace text" } }));
    }
    const last = j.messages[j.messages.length - 1];
    const results = (Array.isArray(last.content) ? last.content : []).filter((b) => b.type === "tool_result");
    const text = said(last);
    let blocks;
    if (text.includes("401")) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
    }
    const resultText = (r) => (typeof r.content === "string" ? r.content : (r.content || []).filter((x) => x.type === "text" && !x.text.startsWith("<system-reminder>")).map((x) => x.text.trim()).join(""));
    if (results.length) blocks = [{ type: "text", text: (results.some((r) => r.is_error) ? "那就不抽了：" : "结果：") + results.map(resultText).join("、") }];
    else if (text.includes("骰子")) blocks = [{ type: "text", text: "我替你扔" }, { type: "tool_use", name: "mcp__kfs__jianghu_roll", input: { who: "her" } }];
    else if (text.includes("两样")) blocks = [{ type: "tool_use", name: "mcp__kfs__jianghu_roll", input: { who: "him" } }, { type: "tool_use", name: "mcp__kfs__qx_draw", input: { n: 1 } }];
    else if (text.includes("不许")) blocks = [{ type: "tool_use", name: "mcp__kfs__qx_draw", input: { n: 1 } }];
    else if (text.includes("查")) blocks = [{ type: "tool_use", name: "mcp__tavily__search", input: { query: "明天天气" } }];
    else if (text.includes("上网")) blocks = [{ type: "text", text: "我上网看看" }, { type: "tool_use", name: "WebFetch", input: { url: "https://example.com/", prompt: "这一页写了什么" } }];
    else blocks = [{ type: "text", text: "收到：" + text }];
    res.writeHead(200, { "content-type": "text/event-stream" });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev("message_start", { message: { id: "msg_" + seen.length, type: "message", role: "assistant", model: j.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, cache_read_input_tokens: 40, cache_creation_input_tokens: 0, output_tokens: 1 } } });
    if (text.includes("慢")) await new Promise((r) => setTimeout(r, 3000));
    blocks.forEach((b, i) => {
      if (b.type === "text") {
        ev("content_block_start", { index: i, content_block: { type: "text", text: "" } });
        ev("content_block_delta", { index: i, delta: { type: "text_delta", text: b.text } });
      } else {
        ev("content_block_start", { index: i, content_block: { type: "tool_use", id: `toolu_${seen.length}_${i}`, name: b.name, input: {} } });
        ev("content_block_delta", { index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
      }
      ev("content_block_stop", { index: i });
    });
    ev("message_delta", { delta: { stop_reason: blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 7 } });
    ev("message_stop", {});
    res.end();
  });
});

// ---------- 假的“她接的 MCP”（tavily） ----------
let remoteAuth = null;
const remote = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method !== "POST") { res.writeHead(405); return res.end(); }
    const m = JSON.parse(body);
    if (m.id === undefined) { res.writeHead(202); return res.end(); }
    const reply = (result) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: m.id, result })); };
    if (m.method === "initialize") return reply({ protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "tavily", version: "1" } });
    if (m.method === "tools/list") return reply({ tools: [{ name: "search", description: "搜", inputSchema: { type: "object", properties: { query: { type: "string" } } } }] });
    if (m.method === "tools/call") { remoteAuth = req.headers.authorization; return reply({ content: [{ type: "text", text: "晴" }] }); }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no" } }));
  });
});

// ---------- 门：这里只开 MCP 那一路（Claude Code 从这台电脑上连进来） ----------
let bridge;
const door = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const m = /^\/mcp\/([0-9a-f]{32})$/.exec(req.url);
    if (!m || req.method !== "POST") { res.writeHead(405); return res.end(); }
    const out = await bridge.mcp(m[1], JSON.parse(body));
    if (!out) { res.writeHead(202); return res.end(); }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
  });
});

const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s.address().port)));
const apiPort = await listen(api);
const remotePort = await listen(remote);
const doorPort = await listen(door);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kfs-bridge-"));
const home = path.join(tmp, "home");
const cwd = path.join(tmp, "cc");
fs.mkdirSync(home);
const logs = [];
bridge = createBridge({
  claude: CLAUDE,
  cwd,
  configDir: path.join(home, ".claude"),
  mcpUrl: (id) => `http://127.0.0.1:${doorPort}/mcp/${id}`,
  log: (l) => logs.push(l),
  env: { HOME: home, USERPROFILE: home, ANTHROPIC_BASE_URL: `http://127.0.0.1:${apiPort}`, ANTHROPIC_API_KEY: "sk-ant-test", HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "", NO_PROXY: "127.0.0.1,localhost", DISABLE_TELEMETRY: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1" },
});

// ---------- 开封府寄来的那一包长什么样（照 App.jsx 的 bodyFor、prompt/system.js 的 withNowNote） ----------
const SYSTEM = [{ type: "text", text: "你是赵光义。说话短。（名帖）", cache_control: { type: "ephemeral", ttl: "1h" } }];
const TOOLS = [
  { name: "jianghu_roll", description: "掷骰子", input_schema: { type: "object", properties: { who: { type: "string" } } } },
  { name: "qx_draw", description: "抽一签", input_schema: { type: "object", properties: { n: { type: "integer" } } } },
];
const now = (t) => ({ type: "text", text: `【此刻】10月1日 ${t}` });
const u = (text, extra = []) => ({ role: "user", content: [{ type: "text", text, cache_control: { type: "ephemeral" } }, ...extra] });
const a = (...content) => ({ role: "assistant", content: content.map((c) => (typeof c === "string" ? { type: "text", text: c } : c)) });
const body = (messages, more = {}) => ({ model: "claude-sonnet-4-6", max_tokens: 1024, system: SYSTEM, messages, tools: TOOLS, ...more });
const texts = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("|");
const lastSeen = () => seen[seen.length - 1];
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

try {
  // ---------- 平常说一句 ----------
  let r = await bridge.handle(body([u("你好", [now("14:30")])]));
  ok(texts(r) === "收到：你好" && r.stop_reason === "end_turn" && r.via === "claude-code" && r.role === "assistant", `说一句：回话照 Anthropic 的样子（${JSON.stringify(r).slice(0, 120)}）`);
  ok(r.usage && r.usage.input_tokens === 100 && r.usage.output_tokens === 7 && r.usage.cache_read_input_tokens === 40, `用量照那边报的记（${JSON.stringify(r.usage)}）`);
  let s = lastSeen();
  const sys = JSON.stringify(s.system);
  ok(sys.includes("你是赵光义。说话短。（名帖）") && s.tools.includes("mcp__kfs__jianghu_roll") && s.tools.includes("mcp__kfs__qx_draw") && s.tools.length === 2, `名帖、手机那头的两样工具都带上了（Claude Code 自己的一样不带）（${s.tools}）`);
  ok(s.thinking && s.thinking.type === "disabled" && s.max_tokens === 1024, `不让他先想；回话多长照开封府给的（${JSON.stringify(s.thinking)}，${s.max_tokens}）`);
  ok(s.messages.length === 1 && said(s.messages[0]).includes("你好"), "头一句：前面没有对话");
  ok(bridge.spawned() === 1, "起了一条");

  // ---------- 接着说：同一条，不另起 ----------
  r = await bridge.handle(body([u("你好"), a("收到：你好"), u("第二句", [now("14:31")])]));
  s = lastSeen();
  ok(texts(r) === "收到：第二句" && bridge.spawned() === 1, `接着上一回往下说：用的还是那一条（起过 ${bridge.spawned()} 回）`);
  ok(s.messages.length === 3 && said(s.messages[1]) === "收到：你好" && said(s.messages[2]) === "第二句", "那边看到的是三句：前一来一回、这一句");

  // ---------- 重新回答：另起，照这一包从头接 ----------
  r = await bridge.handle(body([u("你好"), a("收到：你好"), u("第二句", [now("14:32")])]));
  s = lastSeen();
  ok(texts(r) === "收到：第二句" && bridge.spawned() === 2 && s.messages.length === 3, `同一句再问一回（重新回答）：另起一条，照这一包接上前面（起过 ${bridge.spawned()} 回）`);
  ok(said(s.messages[0]) === "你好" && said(s.messages[1]) === "收到：你好", "前面那一来一回是照这一包写进去的");

  // ---------- 带图、带工具的前情 ----------
  r = await bridge.handle(
    body([
      { role: "user", content: [{ type: "text", text: "看图" }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] },
      a("我替你扔", { type: "tool_use", id: "toolu_old1", name: "jianghu_roll", input: { who: "her" } }),
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_old1", content: "掷出 3" }] },
      a("三点", { type: "thinking", thinking: "", signature: "sig" }),
      u("接着", [now("14:33")]),
    ])
  );
  s = lastSeen();
  const flat = JSON.stringify(s.messages);
  ok(texts(r) === "收到：接着", "前情里有图、有下过的棋：照样接着说");
  ok(s.messages.length === 5 && s.messages[0].content.some((b) => b.type === "image" && b.source.data === PNG), "图原样寄过去了");
  ok(flat.includes('"name":"mcp__kfs__jianghu_roll"') && flat.includes('"tool_use_id":"toolu_old1"') && flat.includes("掷出 3") && !flat.includes('"thinking"'), "下过的那一步：工具改了名、结果对得上号；想的那一块不寄");

  // ---------- 停在手机那头的工具上 ----------
  const before = bridge.spawned();
  r = await bridge.handle(body([u("扔个骰子", [now("14:34")])]));
  const use = r.content.find((b) => b.type === "tool_use");
  ok(r.stop_reason === "tool_use" && texts(r) === "我替你扔" && use && use.name === "jianghu_roll" && use.input.who === "her", `他要掷骰子：回话停在 tool_use 上，名字是手机那头认的（${JSON.stringify(r.content)}）`);
  ok(bridge.runs().some((x) => x.state === "waiting"), "那一条等着手机把结果寄回来");
  r = await bridge.handle(body([u("扔个骰子"), a("我替你扔", use), { role: "user", content: [{ type: "tool_result", tool_use_id: use.id, content: "掷出 6" }] }]));
  s = lastSeen();
  ok(texts(r) === "结果：掷出 6" && r.stop_reason === "end_turn" && bridge.spawned() === before + 1, `结果寄回来：他接着说，还是那一条（${texts(r)}）`);
  ok(JSON.stringify(s.messages[s.messages.length - 1]).includes("掷出 6"), "那边看到的是手机办完的结果");

  // ---------- 停在工具上以后，等着的那一条没了（这边重开过、等太久关了）：照这一包从头接 ----------
  const gone = (id) => a("我替你扔", { type: "tool_use", id, name: "jianghu_roll", input: { who: "her" } });
  r = await bridge.handle(body([u("扔个骰子"), gone("toolu_gone1"), { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_gone1", content: "掷出 4" }] }]));
  s = lastSeen();
  const seenAll = JSON.stringify(s.messages);
  ok(r.stop_reason === "end_turn" && texts(r).includes("[结果：掷出 4]"), `只有结果、没人等着：另起一条，结果写成字当这一句递进去，他接着说（${texts(r)}）`);
  ok(seenAll.includes("[调了 jianghu_roll") && !seenAll.includes('"tool_result"') && !seenAll.includes("No response requested") && !seenAll.includes("interrupted"), "那一下调用也写成字；Claude Code 没替他补“No response requested.”");
  r = await bridge.handle(body([u("扔个骰子"), gone("toolu_gone2"), { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_gone2", content: "掷出 5" }, { type: "text", text: "顺便说一句" }] }]));
  s = lastSeen();
  const lastMsg = JSON.stringify(s.messages[s.messages.length - 1]);
  ok(texts(r).includes("[结果：掷出 5]") && texts(r).includes("顺便说一句") && lastMsg.includes("掷出 5") && lastMsg.includes("顺便说一句"), `结果后面还跟着她新说的：一起递进去（${texts(r)}）`);
  r = await bridge.handle(body([u("扔个骰子"), gone("toolu_gone3"), u("算了不扔了", [now("14:35")])]));
  s = lastSeen();
  ok(texts(r) === "收到：算了不扔了" && !JSON.stringify(s.messages).includes("No response requested") && JSON.stringify(s.messages).includes("[调了 jianghu_roll"), "调了没结果就接着说别的：那一下写成字，不留半截");

  // ---------- 一回调两样 ----------
  r = await bridge.handle(body([u("两样都来", [now("14:35")])]));
  const uses = r.content.filter((b) => b.type === "tool_use");
  ok(r.stop_reason === "tool_use" && uses.length === 2 && uses.map((x) => x.name).join() === "jianghu_roll,qx_draw", `一回调两样：两样都交给手机（${uses.map((x) => x.name)}）`);
  r = await bridge.handle(body([u("两样都来"), a(...uses), { role: "user", content: uses.map((x, i) => ({ type: "tool_result", tool_use_id: x.id, content: i ? "上上签" : "掷出 2" })) }]));
  ok(texts(r) === "结果：掷出 2、上上签" && r.stop_reason === "end_turn", `两样的结果一起寄回来，他接着说（${texts(r)}）`);

  // ---------- 这一回不许调 ----------
  r = await bridge.handle(body([u("不许抽", [now("14:36")])], { tool_choice: { type: "none" } }));
  ok(r.stop_reason === "end_turn" && !r.content.some((b) => b.type === "tool_use") && texts(r).startsWith("那就不抽了"), `不许调的那一回：他调了也不交给手机，接着说完（${texts(r)}）`);

  // ---------- 她接的 MCP ----------
  r = await bridge.handle(body([u("帮我查一下", [now("14:37")])], { mcp_servers: [{ type: "url", url: `http://127.0.0.1:${remotePort}/mcp`, name: "tavily", authorization_token: "tvly-test" }], tools: [...TOOLS, { type: "mcp_toolset", mcp_server_name: "tavily" }] }));
  const mu = r.content.find((b) => b.type === "mcp_tool_use");
  const mr = r.content.find((b) => b.type === "mcp_tool_result");
  ok(mu && mu.server_name === "tavily" && mu.name === "search" && mr && mr.tool_use_id === mu.id && JSON.stringify(mr.content).includes("晴") && texts(r) === "结果：晴", `她接的 MCP：他自己调，回话里照 Anthropic 的样子写（${JSON.stringify(r.content).slice(0, 160)}）`);
  ok(remoteAuth === "Bearer tvly-test", `她的 MCP 的钥匙照带（${remoteAuth}）`);

  // ---------- 她按了停 ----------
  const ctl = new AbortController();
  const slow = bridge.handle(body([u("慢慢说", [now("14:38")])]), { signal: ctl.signal });
  setTimeout(() => ctl.abort(), 1500);
  let stopped = null;
  try {
    await slow;
  } catch (e) {
    stopped = e;
  }
  ok(stopped && stopped.status === 499 && bridge.runs().every((x) => x.state !== "busy"), `按了停：这一回作废，那一条关了（${stopped && stopped.message}）`);

  // ---------- 出了岔子 ----------
  let err = null;
  try {
    await bridge.handle(body([u("401", [now("14:39")])]));
  } catch (e) {
    err = e;
  }
  ok(err && err.status === 401 && /没登录/.test(err.message), `那边说没登录：照实报（${err && err.status} ${err && err.message}）`);
  err = null;
  try {
    await bridge.handle(body([a("先说一句")]));
  } catch (e) {
    err = e;
  }
  ok(err && err.status === 400, "最后一句不是她的：不收");

  // ---------- 这里那个 MCP ----------
  // 没带名帖的一包（开封府测试连接那种）：照样走得通（名帖那个临时文件不能只写个空格，Anthropic 不收）
  r = await bridge.handle({ model: "claude-haiku-4-5-20251001", max_tokens: 64, messages: [u("没名帖")] });
  ok(r.content && r.content.some((b) => b.type === "text" && b.text.includes("收到：没名帖")), `没带名帖的一包也走得通（${JSON.stringify((r.content || []).map((b) => b.text))}）`);
  // 这台测试机上的 Claude Code 会在名帖后头自己续几段（她电脑上的不续），只写个空格的那一块在这儿撞不上 400：直接看名帖那一块写的是什么
  ok(JSON.stringify(seen[seen.length - 1].system || "").includes("（这一回没有名帖。）"), "没带名帖：名帖那个临时文件写的是一句“这一回没有名帖”，不是空白");
  // 上网查（开封府 API 面板里的开关，这一包带着 kfs_web）：Claude Code 拿到它自带的搜索、读网页，他自己调；
  // 回话里照她接的 MCP 那样写成 mcp_tool_use、mcp_tool_result（server_name 是“上网查”，手机那头写“用了 上网查”）。没带的那几包不给
  ok(seen.slice(0, 3).every((x) => !x.tools.includes("WebSearch") && !x.tools.includes("WebFetch")), "没带上网查的：Claude Code 自带的搜索、读网页一样不给");
  const seenWeb = seen.length;
  r = await bridge.handle(body([u("上网看看", [now("14:40")])], { kfs_web: true }));
  const webAsk = seen[seenWeb];
  const used = (r.content || []).find((b) => b.type === "mcp_tool_use");
  const back = (r.content || []).find((b) => b.type === "mcp_tool_result");
  ok(webAsk && webAsk.tools.includes("WebSearch") && webAsk.tools.includes("WebFetch") && webAsk.tools.some((t) => t.startsWith("mcp__kfs__")), `带着上网查：Claude Code 拿到 WebSearch、WebFetch，开封府的工具照旧在（${webAsk && webAsk.tools.filter((t) => !t.startsWith("mcp__")).join(",")}）`);
  // （这台测试机连不上外头，读网页那一下是失败的结果：照样接着说完）
  ok(used && used.server_name === "上网查" && used.name === "WebFetch" && used.input.url === "https://example.com/" && back && back.tool_use_id === used.id && r.stop_reason === "end_turn" && r.content[r.content.length - 1].type === "text",
     `他调了读网页：Claude Code 自己办，回话里写成 mcp_tool_use、mcp_tool_result（上网查），他接着说完（${JSON.stringify((r.content || []).map((b) => b.type + (b.server_name ? ":" + b.server_name : "")))}）`);
  ok((await bridge.mcp("0".repeat(32), { jsonrpc: "2.0", id: 1, method: "tools/list" })).error, "关了的、没有的那一条：MCP 不认");
  const live = bridge.runs()[0];
  ok(live && (await bridge.mcp(live.id, { jsonrpc: "2.0", id: 2, method: "nope" })).error.code === -32601 && (await bridge.mcp(live.id, { jsonrpc: "2.0", method: "notifications/initialized" })) === null, "不认的方法回 -32601；通知不用回");
} finally {
  bridge.close();
}

// ---------- 磁盘上不落明文 ----------
await new Promise((r) => setTimeout(r, 500));
const left = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/第二句|扔个骰子|两样都来|名帖/.test(fs.readFileSync(p, "utf8"))) left.push(p);
  }
};
walk(tmp);
const sess = sessionDir(fs.realpathSync(cwd), path.join(home, ".claude"));
ok(!left.length, `跑完了这台电脑上找不到对话里的字、名帖（${left.join(", ")}）`);
ok(!fs.existsSync(sess) || !fs.readdirSync(sess).length, "会话记录一份都没留");
ok(!fs.readdirSync(cwd).length, "名帖的临时文件删了");
ok(!logs.some((l) => /你好|第二句|骰子/.test(l)), "日志里不记对话里的字");

api.close();
remote.close();
door.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
