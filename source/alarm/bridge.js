// =====================================================
// 传话走这台电脑上的 Claude Code（见开发说明“传话走笔记本上的 Claude Code”那一节）。
// 开封府在手机上拼好要寄给 claude 函数（Anthropic）的那一包（model、system、messages、tools、mcp_servers），改寄到这里；
// 这里交给这台电脑上的 Claude Code（claude -p，走她的订阅），回一个跟 Anthropic 一个样子的回话
// （content、stop_reason、usage）。手机那头整理回话、换头像、记用量那些不用改。
//
// 怎么交给 Claude Code：
//   - 名帖（system）：--system-prompt-file，一个临时文件，Claude Code 读进去就删。
//   - 前面的对话：写成 Claude Code 自己的会话记录（一个临时的 .jsonl，放在它找会话的那个文件夹里），--resume 接上，
//     --no-session-persistence 不往磁盘写；Claude Code 读进去就删。这台电脑上不落明文（2.1.319 试过：读进去以后删了照样接得上，
//     跑完了磁盘上找不到对话里的一个字）。最后那一句从 stdin 递进去。
//   - 他回话半路要调的工具（江湖棋局、翻日记、抽签、回屋看一眼、翻梦廊，tools 里那些）：这里开一个 MCP（--mcp-config，http），
//     工具在 Claude Code 那头叫 mcp__kfs__<名字>。他一调，这里把回话停在 tool_use 上交给手机（跟 Anthropic 一样），
//     手机办完了照常把下一包寄来（最后一句是 tool_result），这里把结果交还给等着的那一下，他接着说。
//     Claude Code 调的时候带着 tool_use 的编号（_meta 里的 claudecode/toolUseId），结果对得上号。
//   - 她接的 MCP（mcp_servers，tavily 这些）：原样挂到 Claude Code 上，他自己调；回话里照 Anthropic 的样子写成
//     mcp_tool_use、mcp_tool_result（手机那头照这个写“用了 tavily”）。
//   - 同一段对话接着说：上一回的那条进程还开着、这一包正好是接着上一回往下说的（前面每一句都对得上），就接着用那一条
//     （Claude Code 手里记着的跟 Anthropic 那头缓存着的是同一份，省额度、也快）；对不上（重新回答、改了话、抄了提要、
//     换了一支）就另起一条，照这一包从头接。
//
// 这一个文件只管“一包进、一个回话出”，不管谁来敲门（配对、Tailscale 那些在门那头）。
// =====================================================
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createHash, randomUUID, randomBytes } from "node:crypto";

export const KFS = "kfs"; // 这里那个 MCP 的名字
const PREFIX = `mcp__${KFS}__`; // 手机那头的工具在 Claude Code 那头的名字前缀
const IDLE_MS = 60 * 60 * 1000; // 一段对话说完了，进程留一个钟头，接着说就接着用（缓存也是一个钟头）
const WAIT_MS = 10 * 60 * 1000; // 停在工具上等手机把结果寄来，最多等这么久
const MAX_RUNS = 4; // 最多同时开着几条（多了把闲得最久的那条关掉）
// 可有可无的参数（这个版本的 claude 不认就拿掉再起，同 Moonlight）：
//   --thinking disabled：不让模型自己先想（开封府不发 thinking；会想的那几个 Claude Code 自己换回 adaptive）
//   --setting-sources ""：不读这台电脑上的用户、项目设置（hook、skill 进不来）
//   --no-chrome：不挂 Claude in Chrome（装了那个扩展的电脑上，不然他手里多出一把开浏览器的工具）
//   --disable-slash-commands：她说的话以 / 开头也只是话，不当 Claude Code 的命令、技能
const OPTIONAL = [["--thinking", "disabled"], ["--setting-sources", ""], ["--no-chrome"], ["--disable-slash-commands"]];

// Claude Code 在哪个文件夹里找会话：<配置文件夹>/projects/<工作目录，不是字母数字的都换成 -；太长的截到 200 再接一截编号>
// （照 2.1.319 的写法；名字太长的那种这里用不上：工作目录是自己定的一个短路径）
export function sessionDir(cwd, configDir) {
  const name = String(cwd).replace(/[^a-zA-Z0-9]/g, "-");
  return path.join(configDir || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "projects", name.slice(0, 200));
}

// ---------- 一包里的东西 ----------

// 没带名帖的时候名帖那个临时文件里写的（见 run）
const NO_SYSTEM = "（这一回没有名帖。）";
// system：字或者一串 { type: "text", text }，拼成一份
const systemText = (s) => (typeof s === "string" ? s : Array.isArray(s) ? s.filter((b) => b && b.type === "text").map((b) => b.text).join("\n\n") : "");
const asBlocks = (c) => (typeof c === "string" ? [{ type: "text", text: c }] : Array.isArray(c) ? c : []);

// 一块寄给 Claude Code 的样子：缓存记号拿掉（Claude Code 自己放）；想的那几块、Anthropic 那头替他调 MCP 的那几块不要；
// 手机那头的工具改名 mcp__kfs__…（写成字的那几种在 cleanMessages 里先办了）
function cleanBlock(b, own) {
  if (!b || typeof b !== "object") return null;
  if (b.type === "text") return typeof b.text === "string" && b.text ? { type: "text", text: b.text } : null;
  if (b.type === "image" || b.type === "document") return { type: b.type, source: b.source };
  if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: PREFIX + b.name, input: b.input && typeof b.input === "object" ? b.input : {} };
  if (b.type === "tool_result") return { type: "tool_result", tool_use_id: b.tool_use_id, content: resultContent(b.content), ...(b.is_error ? { is_error: true } : {}) };
  return null; // thinking、redacted_thinking、mcp_tool_use、mcp_tool_result、server_tool_use……
}
const resultContent = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x && (x.type === "text" || x.type === "image") ? (x.type === "text" ? { type: "text", text: x.text } : { type: "image", source: x.source }) : null)).filter(Boolean) : "");

// 对话收拾成 Claude Code 认的样子：每一句的块收拾好；空了的他那一句补一个“……”；挨着的同一个人的两句并成一句。
// 调用和结果得成对：工具名不在 tools 里的、调了没结果的、有结果没调用的，两头都写成字；
// asText 里给的编号也写成字（停在工具上以后那一条没了、结果寄来了：见 handle）。
// 为什么：接上的会话最后要是停在一下没结果的调用上，或者最后是她那头的结果、后面没有他的话，Claude Code 读进去的时候
// 会自己补一句“Tool call interrupted”、替他补一句“No response requested.”（2.1.319 试出来的），他看到的就不是原来的对话了
function cleanMessages(messages, own, forced = new Set()) {
  const uses = new Set();
  const answered = new Set();
  for (const m of messages || []) for (const b of asBlocks(m && m.content)) {
    if (b && b.type === "tool_use") uses.add(b.id);
    if (b && b.type === "tool_result") answered.add(b.tool_use_id);
  }
  const asText = new Set(forced);
  for (const m of messages || []) for (const b of asBlocks(m && m.content)) {
    if (b && b.type === "tool_use" && (!own.has(b.name) || !answered.has(b.id))) asText.add(b.id);
    if (b && b.type === "tool_result" && !uses.has(b.tool_use_id)) asText.add(b.tool_use_id);
  }
  const out = [];
  for (const m of messages || []) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    let blocks = asBlocks(m.content)
      .map((b) =>
        b && b.type === "tool_result" && asText.has(b.tool_use_id)
          ? { type: "text", text: `[结果：${typeof b.content === "string" ? b.content : (b.content || []).filter((x) => x && x.type === "text").map((x) => x.text).join("")}]` }
          : b && b.type === "tool_use" && asText.has(b.id)
          ? { type: "text", text: `[调了 ${b.name}：${JSON.stringify(b.input || {})}]` }
          : cleanBlock(b, own)
      )
      .filter(Boolean);
    if (!blocks.length) {
      if (m.role === "user") continue;
      blocks = [{ type: "text", text: "……" }];
    }
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content.push(...blocks);
    else out.push({ role: m.role, content: blocks });
  }
  return out;
}

// 一块的指纹（比对“前面的对不对得上”用）
const canon = (b) => createHash("sha256").update(JSON.stringify(b)).digest("hex").slice(0, 32);

// 她接的 MCP：mcp_servers 里的 { type: "url", url, name, authorization_token } → Claude Code 的 http 那一种
function remoteServers(body) {
  const out = {};
  for (const s of body.mcp_servers || []) {
    if (!s || !s.url || !s.name || s.name === KFS) continue;
    out[s.name] = { type: "http", url: s.url, ...(s.authorization_token ? { headers: { Authorization: `Bearer ${s.authorization_token}` } } : {}) };
  }
  return out;
}

// 这一包要的 Claude Code 是哪一种：名帖、模型、回话多长、有哪些工具、接了哪些 MCP 一样，才能接着用同一条进程
function shapeOf(body) {
  const tools = (body.tools || []).filter((t) => t && t.name && t.input_schema && !t.type);
  const servers = remoteServers(body);
  const key = createHash("sha256")
    .update(JSON.stringify([systemText(body.system), body.model, body.max_tokens || 0, tools.map((t) => [t.name, t.description || "", t.input_schema]), servers]))
    .digest("hex");
  return { key, tools, servers, own: new Set(tools.map((t) => t.name)) };
}

// ---------- 会话记录（Claude Code 自己的样子，2.1.319 认得的最少那几样） ----------
function writeSession(dir, cwd, sid, messages, model) {
  fs.mkdirSync(dir, { recursive: true });
  let parent = null;
  const t0 = Date.now() - messages.length * 1000;
  const lines = messages.map((m, i) => {
    const uuid = randomUUID();
    const e = {
      parentUuid: parent,
      isSidechain: false,
      type: m.role,
      uuid,
      timestamp: new Date(t0 + i * 1000).toISOString(),
      userType: "external",
      cwd,
      sessionId: sid,
      message:
        m.role === "user"
          ? { role: "user", content: m.content }
          : { id: "msg_kfs" + i, type: "message", role: "assistant", model, content: m.content, stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
    };
    parent = uuid;
    return JSON.stringify(e);
  });
  const file = path.join(dir, `${sid}.jsonl`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

// ---------- 出了岔子：照实说，带个状态码（手机那头照 Anthropic 的报错翻成中文） ----------
export class BridgeError extends Error {
  constructor(status, message, type = "api_error") {
    super(message);
    this.status = status;
    this.type = type;
  }
}
function errorOf(text, stderr, status) {
  const t = `${text || ""}\n${stderr || ""}`;
  if (/ENOENT|not recognized|找不到/.test(t)) return new BridgeError(500, "这台电脑上找不到 Claude Code");
  if (status === 401 || status === 403 || /not logged in|\/login|authentication|invalid api key|oauth/i.test(t)) return new BridgeError(401, "这台电脑上的 Claude Code 没登录（或者登录过期了）", "authentication_error");
  if (status === 429 || /rate.?limit|usage limit|limit reached|quota/i.test(t)) return new BridgeError(429, "订阅的额度用完了", "rate_limit_error");
  if (status === 529 || /overloaded/i.test(t)) return new BridgeError(529, "Anthropic 那头太忙，过一会儿再试", "overloaded_error");
  if (/No conversation found/i.test(t)) return new BridgeError(500, "Claude Code 没接上前面的对话");
  const line = String(text || stderr || "").split("\n").map((s) => s.trim()).filter(Boolean).pop() || "Claude Code 出了岔子";
  return new BridgeError(500, line.slice(0, 300));
}

// =====================================================
// createBridge：
//   claude   claude 在哪（Windows 上是 claude.exe 的完整路径；.js/.mjs 的拿 node 跑，测试用）
//   cwd      Claude Code 的工作目录（一个空文件夹，路径短一点；会话记录照它找）
//   mcpUrl   (runId) => 这里那个 MCP 的网址（门那头开的，Claude Code 从这台电脑上连）
//   env      额外的环境变量（测试用；ANTHROPIC_API_KEY 一律拿掉，走订阅）
//   log      (line) => 记一笔（不记对话里的字）
// 回 { handle(body, { signal }) → 回话, mcp(runId, 一条 JSON-RPC) → 回的那一条（null 是不用回）, runs(), close() }
// =====================================================
export function createBridge({ claude = "claude", cwd, configDir, mcpUrl, env = {}, log = () => {}, idleMs = IDLE_MS, waitMs = WAIT_MS, maxRuns = MAX_RUNS } = {}) {
  if (!cwd || !mcpUrl) throw new Error("createBridge 要 cwd、mcpUrl");
  fs.mkdirSync(cwd, { recursive: true });
  const realCwd = fs.realpathSync.native(cwd);
  const runs = new Map(); // runId → run
  const unsupported = new Set();
  let spawned = 0;

  const kill = (run, why) => {
    if (run.dead) return;
    run.dead = true;
    runs.delete(run.id);
    clearTimeout(run.timer);
    for (const f of run.temp) fs.rmSync(f, { force: true });
    for (const c of run.calls.values()) c.resolve({ content: [{ type: "text", text: "（开封府那头没接着说，这一下作废了。）" }], isError: true });
    run.calls.clear();
    if (run.segment) run.segment.fail(new BridgeError(500, "Claude Code 那一条停了"));
    try {
      run.proc.stdin.end();
    } catch {}
    try {
      run.proc.kill();
    } catch {}
    log(`[传话] 关了一条（${why}）`);
  };
  const idle = (run) => {
    clearTimeout(run.timer);
    run.timer = setTimeout(() => kill(run, "闲久了"), run.state === "waiting" ? waitMs : idleMs);
  };

  // ---------- 起一条 ----------
  function start(shape, body, history) {
    const id = randomBytes(16).toString("hex"); // MCP 网址里的那一截：猜不到，别的进程冒充不了这一条
    const temp = [];
    const sysFile = path.join(realCwd, `system-${id}.md`);
    // 没带名帖的一包（开封府的测试连接）：写一句话占着。不能只写空白：Claude Code 原样当一块字寄出去，Anthropic 回 400
    // “system: text content blocks must contain non-whitespace text”（开封府的测试连接撞上过）
    const sys = systemText(body.system);
    fs.writeFileSync(sysFile, sys.trim() ? sys : NO_SYSTEM);
    temp.push(sysFile);
    let sid = null;
    if (history.length) {
      sid = randomUUID();
      temp.push(writeSession(sessionDir(realCwd, configDir), realCwd, sid, history, body.model));
    }
    const mcp = { mcpServers: { [KFS]: { type: "http", url: mcpUrl(id) }, ...shape.servers } };
    const allowed = [`mcp__${KFS}`, ...Object.keys(shape.servers).map((n) => `mcp__${n}`)];
    const args = [
      "--print",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model", body.model,
      "--system-prompt-file", sysFile,
      "--tools", "", // Claude Code 自己的那些（读写文件、跑命令）一样都不给
      "--mcp-config", JSON.stringify(mcp),
      "--strict-mcp-config", // 这台电脑上别处配的 MCP 不挂
      "--allowedTools", allowed.join(","),
      "--no-session-persistence", // 不往磁盘写会话记录
    ];
    for (const [flag, ...value] of OPTIONAL) if (!unsupported.has(flag)) args.push(flag, ...value);
    if (sid) args.push("--resume", sid);
    // 环境里的 ANTHROPIC_API_KEY 拿掉（不然 Claude Code 走 API 按量计费）；env 里明着给的照给（测试连假的 API 用）
    const e = { ...process.env };
    delete e.ANTHROPIC_API_KEY;
    delete e.ANTHROPIC_AUTH_TOKEN;
    Object.assign(e, env, { MCP_TOOL_TIMEOUT: String(waitMs + 60000), ENABLE_PROMPT_CACHING_1H: "1" });
    if (body.max_tokens) e.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(body.max_tokens);
    const [cmd, argv] = /\.m?js$/.test(claude) ? [process.execPath, [claude, ...args]] : [claude, args];
    const proc = spawn(cmd, argv, { cwd: realCwd, env: e, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    spawned++;
    const run = {
      id,
      proc,
      shape,
      temp,
      transcript: [], // 这一条手里记着的对话，照手机寄来的样子：{ role, keys?（她那一句每一块的指纹） }
      state: "busy", // busy 说着；waiting 停在工具上等结果；idle 说完了，等下一句
      calls: new Map(), // tool_use 编号 → 等着结果的那一下 { resolve }
      results: new Map(), // 结果先到、调的那一下还没到的
      pending: [], // 停在工具上的时候，等哪几个编号的结果
      noTools: false, // 这一回不许调（tool_choice: none）
      segment: null, // 眼下这一回要交出去的回话（见 Segment）
      stderr: "",
      dead: false,
      timer: null,
    };
    runs.set(id, run);
    log(`[传话] 起了一条（${body.model}${sid ? `，接上前面 ${history.length} 句` : "，新的一段"}）`);
    let buf = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        onEvent(run, ev);
      }
    });
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (c) => (run.stderr = (run.stderr + c).slice(-4000)));
    proc.stdin.on("error", () => {});
    proc.on("error", (err) => onExit(run, err.code === "ENOENT" ? "ENOENT" : err.message));
    proc.on("close", (code) => onExit(run, code));
    return run;
  }

  // 进程没了：说到一半的那一回照实报错；还没开口就没了、是不认哪个可有可无的参数，记下来，交给外头重起
  function onExit(run, code) {
    if (run.dead) return;
    const bad = OPTIONAL.map(([f]) => f).find((f) => !unsupported.has(f) && run.stderr.includes(f) && /unknown option|unrecognized|is invalid/i.test(run.stderr));
    if (bad) {
      unsupported.add(bad);
      log(`[传话] 这个版本的 claude 不认 ${bad}，往后不带`);
      if (run.segment) run.segment.retry = true;
    }
    const seg = run.segment;
    run.segment = null;
    kill(run, `进程没了（${code}）`);
    if (seg) seg.fail(bad ? Object.assign(new BridgeError(500, "重起"), { retry: true }) : errorOf(code === "ENOENT" ? "ENOENT" : `claude 没起来（${code}）`, run.stderr));
  }

  // ---------- 回话一段一段攒 ----------
  // 一段：交给手机的一个回话。攒他说的（text）、手机那头的工具（tool_use，停在这儿）、她接的 MCP（mcp_tool_use、mcp_tool_result）
  function Segment(run, resolve, reject) {
    return {
      blocks: [],
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      stop: null,
      msgId: null,
      done: false,
      retry: false,
      finish(stop) {
        if (this.done) return;
        this.done = true;
        run.segment = null;
        resolve({
          id: "msg_cc_" + randomBytes(8).toString("hex"),
          type: "message",
          role: "assistant",
          model: run.model,
          content: this.blocks,
          stop_reason: stop,
          stop_sequence: null,
          usage: this.usage,
          via: "claude-code", // 手机那头认这个：走的是这台电脑（不算钱）
        });
      },
      fail(err) {
        if (this.done) return;
        this.done = true;
        run.segment = null;
        reject(err);
      },
    };
  }
  const remoteOf = (run, name) => {
    for (const s of Object.keys(run.shape.servers)) if (name.startsWith(`mcp__${s}__`)) return { server_name: s, name: name.slice(`mcp__${s}__`.length) };
    return null;
  };

  // 停在手机那头的工具上：这一段交出去（工具要等手机办完寄回来）。
  // 两处叫它：这一句写完了（message_delta 说停在 tool_use 上），或者 Claude Code 已经来调了（那时这一句一定写完了）
  function stopAtTools(run) {
    const seg = run.segment;
    if (!seg || seg.done || !seg.blocks.some((b) => b.type === "tool_use")) return;
    run.pending = seg.blocks.filter((b) => b.type === "tool_use").map((b) => b.id);
    run.state = "waiting";
    run.transcript.push({ role: "assistant" });
    idle(run);
    seg.finish("tool_use");
  }

  function onEvent(run, ev) {
    if (ev.type === "system" && ev.subtype === "init") {
      // 名帖、前面的对话都读进去了：临时文件删掉
      for (const f of run.temp) fs.rmSync(f, { force: true });
      run.temp = [];
      return;
    }
    const seg = run.segment;
    if (!seg) return;
    if (ev.type === "stream_event") {
      const e = ev.event || {};
      if (e.type === "message_start") {
        const u = (e.message && e.message.usage) || {};
        seg.usage.input_tokens += u.input_tokens || 0;
        seg.usage.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
        seg.usage.cache_read_input_tokens += u.cache_read_input_tokens || 0;
      }
      if (e.type === "message_delta") {
        seg.usage.output_tokens += (e.usage && e.usage.output_tokens) || 0;
        seg.stop = (e.delta && e.delta.stop_reason) || seg.stop;
        if (seg.stop === "tool_use") stopAtTools(run);
      }
      return;
    }
    if (ev.type === "assistant") {
      // 那边报了错：Claude Code 写成一句 <synthetic> 的话，不是他说的，记下来等 result 报
      if (ev.error || (ev.message && ev.message.model === "<synthetic>")) {
        seg.apiError = { status: ev.api_error_status, text: ((ev.message && ev.message.content) || []).map((b) => b.text || "").join(" ") };
        return;
      }
      for (const b of (ev.message && ev.message.content) || []) {
        if (b.type === "text" && b.text) seg.blocks.push({ type: "text", text: b.text });
        // 这一回不许调（tool_choice: none）：他还是调了的那一下不交给手机（MCP 那头直接回“不许调”，他接着说）
        else if (b.type === "tool_use" && b.name.startsWith(PREFIX)) !run.noTools && seg.blocks.push({ type: "tool_use", id: b.id, name: b.name.slice(PREFIX.length), input: b.input || {} });
        else if (b.type === "tool_use") {
          const r = remoteOf(run, b.name);
          if (r) seg.blocks.push({ type: "mcp_tool_use", id: b.id, name: r.name, server_name: r.server_name, input: b.input || {} });
        }
      }
      return;
    }
    if (ev.type === "user") {
      // 她接的 MCP 回来的结果：照 Anthropic 的样子写成 mcp_tool_result
      for (const b of (ev.message && ev.message.content) || []) {
        if (b.type !== "tool_result" || !seg.blocks.some((x) => x.type === "mcp_tool_use" && x.id === b.tool_use_id)) continue;
        const content = typeof b.content === "string" ? [{ type: "text", text: b.content }] : (b.content || []).filter((x) => x && x.type === "text");
        seg.blocks.push({ type: "mcp_tool_result", tool_use_id: b.tool_use_id, is_error: !!b.is_error, content });
      }
      return;
    }
    if (ev.type === "result") {
      if (ev.is_error || seg.apiError) {
        const e = seg.apiError || {};
        const err = errorOf(e.text || ev.result || (ev.errors || []).join("\n"), run.stderr, e.status || ev.api_error_status);
        seg.fail(err); // 先报这一句，再关（关的时候还没交出去的那一段报的是“停了”）
        return kill(run, "回话出错");
      }
      run.state = "idle";
      run.transcript.push({ role: "assistant" });
      idle(run);
      seg.finish(seg.stop === "max_tokens" ? "max_tokens" : "end_turn");
    }
  }

  // 这一条手里的对话跟这一包前面那些对不对得上：
  //   一句一句对：谁说的一样；她的那一句，这一包里的那几块得是这一条记着的那几块从头起的一截
  //   （手机那头只在最后一句后面附【此刻】那一块，下一回那一句挪到前面，那一块就不带了）；他的那一句不比（这一条手里是他的原话）
  function fits(run, history) {
    if (run.transcript.length !== history.length) return false;
    for (let i = 0; i < history.length; i++) {
      const a = run.transcript[i];
      const b = history[i];
      if (a.role !== b.role) return false;
      if (b.role === "user") {
        const keys = b.content.map(canon);
        if (keys.length > a.keys.length || keys.some((k, j) => k !== a.keys[j])) return false;
      }
    }
    return true;
  }

  // ---------- 一包进、一个回话出 ----------
  async function handle(body, { signal } = {}) {
    if (!body || typeof body.model !== "string" || !Array.isArray(body.messages) || !body.messages.length) throw new BridgeError(400, "寄来的不对：要 model、messages", "invalid_request_error");
    const shape = shapeOf(body);
    let all = cleanMessages(body.messages, shape.own);
    let last = all[all.length - 1];
    if (!last || last.role !== "user") throw new BridgeError(400, "最后一句得是她说的（或者工具的结果）", "invalid_request_error");
    let history = all.slice(0, -1);
    const noTools = !!(body.tool_choice && body.tool_choice.type === "none");
    const results = last.content.filter((b) => b.type === "tool_result");

    // 1. 接着上一回停在工具上的：结果交还给等着的那几下，他接着说
    const waiting = [...runs.values()].find((r) => !r.dead && r.state === "waiting" && r.shape.key === shape.key && results.length === last.content.length && r.pending.every((id) => results.some((b) => b.tool_use_id === id)) && fits(r, history));
    if (waiting) {
      waiting.transcript.push({ role: "user", keys: last.content.map(canon) });
      waiting.state = "busy";
      waiting.noTools = noTools;
      clearTimeout(waiting.timer);
      const out = turn(waiting, signal, () => {
        for (const b of results) {
          const r = { content: typeof b.content === "string" ? [{ type: "text", text: b.content || "（空）" }] : mcpContent(b.content), isError: !!b.is_error };
          const call = waiting.calls.get(b.tool_use_id);
          if (call) {
            waiting.calls.delete(b.tool_use_id);
            call.resolve(r);
          } else waiting.results.set(b.tool_use_id, r);
        }
      });
      return out;
    }

    // 停在工具上、可等着的那一条没了（这边重开过、等太久关了），结果寄来了：那一下调用和结果都写成字，当她这一句递进去
    // （会话停在结果上 Claude Code 会替他补一句“No response requested.”，见 cleanMessages）
    if (results.length) {
      all = cleanMessages(body.messages, shape.own, new Set(results.map((b) => b.tool_use_id)));
      last = all[all.length - 1];
      history = all.slice(0, -1);
    }

    // 2. 接着上一回说完的往下说：那一条还开着、前面都对得上，就把这一句递进去
    const idleRun = [...runs.values()].find((r) => !r.dead && r.state === "idle" && r.shape.key === shape.key && fits(r, history));
    if (idleRun) {
      log("[传话] 接着上一回那一条说");
      return say(idleRun, last, noTools, signal);
    }

    // 3. 另起一条，照这一包从头接（满了先把闲得最久的那条关掉）
    const live = [...runs.values()].filter((r) => !r.dead);
    if (live.length >= maxRuns) {
      const old = live.filter((r) => r.state !== "busy").sort((a, b) => a.touched - b.touched)[0];
      if (old) kill(old, "开得太多，关掉闲得最久的");
    }
    for (let tries = 0; ; tries++) {
      const run = start(shape, body, history);
      run.model = body.model;
      run.transcript = history.map((m) => (m.role === "user" ? { role: "user", keys: m.content.map(canon) } : { role: "assistant" }));
      try {
        return await say(run, last, noTools, signal);
      } catch (err) {
        if (err && err.retry && tries < OPTIONAL.length) continue;
        throw err;
      }
    }
  }

  // 把她这一句递进去，等这一回的回话（停在工具上、或者说完）
  function say(run, last, noTools, signal) {
    run.transcript.push({ role: "user", keys: last.content.map(canon) });
    run.state = "busy";
    run.noTools = noTools;
    clearTimeout(run.timer);
    return turn(run, signal, () => {
      run.proc.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: last.content } }) + "\n");
    });
  }

  // 一回：开一段、递东西进去（go）、等这一段交出来。她按了停（signal）：这一条关掉
  function turn(run, signal, go) {
    run.touched = Date.now();
    return new Promise((resolve, reject) => {
      const seg = Segment(run, resolve, reject);
      run.segment = seg;
      const stop = () => {
        if (seg.done) return;
        seg.fail(new BridgeError(499, "停了"));
        kill(run, "她按了停");
      };
      if (signal && signal.aborted) return stop();
      if (signal) signal.addEventListener("abort", stop, { once: true });
      go();
    });
  }

  // 手机寄来的 tool_result 的内容 → MCP 回的那几块
  function mcpContent(c) {
    const out = [];
    for (const x of Array.isArray(c) ? c : []) {
      if (x && x.type === "text") out.push({ type: "text", text: x.text });
      else if (x && x.type === "image" && x.source && x.source.type === "base64") out.push({ type: "image", data: x.source.data, mimeType: x.source.media_type });
    }
    return out.length ? out : [{ type: "text", text: "（空）" }];
  }

  // ---------- 这里那个 MCP（Claude Code 从这台电脑上连进来，一条进程一个网址） ----------
  async function mcp(runId, msg) {
    const run = runs.get(runId);
    if (!msg || typeof msg !== "object") return null;
    const reply = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
    const fail = (code, message) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
    if (msg.id === undefined || msg.id === null) return null; // 通知：不用回
    if (!run || run.dead) return fail(-32001, "这一条已经关了");
    if (msg.method === "initialize") return reply({ protocolVersion: (msg.params && msg.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "kaifengfu", version: "1" } });
    if (msg.method === "ping") return reply({});
    if (msg.method === "tools/list") return reply({ tools: run.shape.tools.map((t) => ({ name: t.name, description: t.description || "", inputSchema: t.input_schema })) });
    if (msg.method === "tools/call") {
      const p = msg.params || {};
      const id = p._meta && p._meta["claudecode/toolUseId"];
      if (run.noTools) return reply({ content: [{ type: "text", text: "（这一回不许调。）" }], isError: true });
      if (!id) return reply({ content: [{ type: "text", text: "（开封府认不出这一下是哪一个。）" }], isError: true });
      const early = run.results.get(id);
      if (early) {
        run.results.delete(id);
        return reply(early);
      }
      const r = new Promise((resolve) => run.calls.set(id, { resolve }));
      stopAtTools(run);
      return reply(await r);
    }
    return fail(-32601, "没有这一样");
  }

  return {
    handle,
    mcp,
    runs: () => [...runs.values()].filter((r) => !r.dead).map((r) => ({ id: r.id, state: r.state, said: r.transcript.length })),
    spawned: () => spawned,
    close: () => {
      for (const r of [...runs.values()]) kill(r, "收工");
    },
  };
}
