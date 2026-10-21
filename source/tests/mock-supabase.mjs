// 假的 Supabase：登录、库房（kv 表，照 PostgREST 的规矩）、claude 函数、通知（登记簿 push_subs 表、信箱 mailbox 表、push 函数）、
// 念语音的 voice 函数（跑的是真的那一份，supabase/voice_function.ts；它要去敲的 ElevenLabs 是假的，见 voice-harness.mjs）
// node tests/mock-supabase.mjs  （端口 8787）
// push 函数跑的是真的那一份（supabase/push_function.ts，一个字不改）；它要去敲的推送服务、要去问的 Anthropic 是假的，见 push-harness.mjs
import http from "node:http";
import { loadPushFunction, pushEnv, createFakePush, createLedgerTable, createMailTable, makeVapidKeys } from "./push-harness.mjs";
import { loadVoiceFunction, voiceEnv, createFakeEleven } from "./voice-harness.mjs";
import { createFakeStt } from "./stt-harness.mjs";

const PORT = Number(process.env.MOCK_PORT || 8787);
const USERS = { "qing@example.com": { id: "11111111-1111-1111-1111-111111111111", password: "correct-horse" } };
const rows = new Map(); // user_id|key → row
const claudeLog = []; // 每一回问“Anthropic”：{ body, beta, via }。via 是从哪条路来的：claude 函数（老路），还是 push 函数（新路）；
// 压着没答的工夫里问的那头把线掐了（她按了停，push 函数不等了）的那一回：{ body, beta, via, cut: true }，没有回话
let claudeFail = null; // 测试用：下一次问 Anthropic 照它的样子报错（workspace：key 没绑工作区；overloaded：太挤）；
// 这三种一直管用、直到改回来：broken：回回都报 key 没绑工作区；mcp：带着工具的一律不行；
// recap：叫他抄前情提要的那一种一律报太挤（平常的话照回）；recap-cut：抄提要的那一种写到上限被截断
let claudeFailTimes = 0; // overloaded 连着挤几回（不写就是一回）
let kvFail = { times: 0, key: "" }; // 测试用：往后这么多回往库房里写都不成（库房一时出岔子，见 /__debug/kv-fail）
let claudeHold = 0; // 测试用：下一次问 Anthropic，压这么多毫秒再答（等的工夫里她切走、关掉）
let echoSeq = 0; // “原样回：”回过几回（回话里写 {回} 换成这是第几回：重新回答的那一版和原来那一版字不一样，分得清）
let claudeHoldKind = ""; // 只压哪一种：recap 是只压叫他抄前情提要的那一种（平常的话照常答）；不写就是下一回不管哪一种
let claudeRelease = null; // 正压着的那一回：叫它现在就答
// 测试用：排好的回话（tests/look.py 截图用）。平常的话按次序一句一句取，取完了照旧回“收到：…”；
// 写日记、抄提要那几种不取。/__debug/reply-queue?text=… 往后排一句，/__debug/reset 清空
const replyQueue = [];
// 他屋里能玩的那几样（园子 alarm/garden.js、妆台 alarm/dressing.js）：/__debug/tool-queue?name=play_garden&input={"action":"water"}&text=先去看看花 往后排一步调工具
// （name 写 play_dressing_room 就是去妆台）。带着那几样工具的那一回照排好的调；结果递回来以后，还有排着的接着调，没有了照 reply-queue 说
// （没排就说一句“（测试园子）结果的头一行”）
const toolQueue = [];
const TOYS = new Set(["play_garden", "play_dressing_room"]);
function fakeGarden(body) {
  const msgs = body.messages || [];
  const blocksOf = (m) => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content || []);
  const lastUser = msgs[msgs.length - 1];
  const results = lastUser && lastUser.role === "user" ? blocksOf(lastUser).filter((b) => b.type === "tool_result") : [];
  const usage = { input_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 50 };
  const step = (q) => ({ status: 200, json: { model: body.model, stop_reason: "tool_use", content: (q.text ? [{ type: "text", text: q.text }] : []).concat([{ type: "tool_use", id: "toolu_garden_" + ++toolSeq, name: q.name, input: q.input }]), usage } });
  const say = (text) => ({ status: 200, json: { model: body.model, stop_reason: "end_turn", content: [{ type: "text", text }], usage } });
  if (results.length) {
    const prev = msgs[msgs.length - 2];
    const uses = prev ? blocksOf(prev).filter((b) => b.type === "tool_use") : [];
    if (!uses.some((u) => TOYS.has(u.name))) return null;
    if (toolQueue.length) return step(toolQueue.shift());
    if (replyQueue.length) return say(replyQueue.shift());
    const r = results[0];
    return say("（测试园子）" + String(typeof r.content === "string" ? r.content : JSON.stringify(r.content)).split("\n")[0].slice(0, 40));
  }
  if (toolQueue.length) return step(toolQueue.shift());
  return null;
}
// 是不是叫他抄前情提要的那两种（抄一段、并几段，见 src/prompt/recap.js）：跟在名帖后面的那段规矩是这两个标题开头的
const recapRuleOf = (body) => (Array.isArray(body.system) ? body.system.map((x) => x.text || "").find((t) => t.startsWith("【抄提要】") || t.startsWith("【并提要】")) : "") || "";

// 江湖棋局的假主持人（tests/e2e_jianghu.py 用）。照她最后说的那句话、和这一回合里已经调过几回：
//   “开局”：先说一句，再调 new_game（她是商贾、他是镖师：不用挑伪装，测试里走得稳）；“随机开局”：两个都随机；
//   “改名开局”（截图里写成“……我叫阿卿……”）：同“开局”，名字照她起的（她叫阿卿、他叫晋哥）
//   “帮我扔”“扔吧”：先说一句，再调 roll
//   “连扔两回”：调 roll，结果递回来以后再调一回 roll，再递回来才说完
//   “只调不说”：一个字不说，只调 game_info
//   “查棋盘”：调 game_info，再递回来照引擎回的字头一行说
//   “写到一半”：说“写着写着”、调了 roll，可回话停在 max_tokens 上（写到长度上限被截断了）：开封府不该替他调
//   结果递回来（最后一句最前面是 tool_result）：照头一样结果的头一行说一句，说完（排好了话的照排好的说，截图用）
//   打电话的时候（tool_choice 是 none）、别的话：不调，回 null（照平常的样子回）
// 5 字头的模型：和真的一样，前面先来一块“想的”（空的，带签名）——测寄回去的时候不带它
let toolSeq = 0;
function fakeHost(body) {
  if (body.tool_choice && body.tool_choice.type === "none") return null;
  const msgs = body.messages || [];
  const blocksOf = (m) => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content || []);
  const lastUser = msgs[msgs.length - 1];
  const results = lastUser && lastUser.role === "user" ? blocksOf(lastUser).filter((b) => b.type === "tool_result") : [];
  let herAt = -1;
  let herSay = "";
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role !== "user") continue;
    const t = blocksOf(msgs[i])
      .filter((b) => b.type === "text" && !b.text.startsWith("【") && !b.text.startsWith("[开封府提示"))
      .map((b) => b.text)
      .join(" / ");
    if (t.trim()) {
      herAt = i;
      herSay = t;
      break;
    }
  }
  const used = msgs.slice(herAt + 1).filter((m) => m.role === "assistant").flatMap((m) => blocksOf(m).filter((b) => b.type === "tool_use"));
  const think = /^claude-(fable|opus|sonnet)-5/.test(String(body.model)) ? [{ type: "thinking", thinking: "", signature: "测试用的签名" }] : [];
  const usage = { input_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 50 };
  const use = (name, input) => ({ type: "tool_use", id: "toolu_test_" + ++toolSeq, name, input });
  const step = (text, call) => ({ status: 200, json: { model: body.model, stop_reason: "tool_use", content: think.concat(text ? [{ type: "text", text }] : [], [call]), usage } });
  const say = (text) => ({ status: 200, json: { model: body.model, stop_reason: "end_turn", content: think.concat([{ type: "text", text }]), usage } });
  if (results.length) {
    // 结果递回来了
    if (/连扔两回/.test(herSay) && used.length < 2) return step("再扔一回。", use("roll", {}));
    // 排好了话的（截图用，见 /__debug/reply-queue）：照排好的说
    if (replyQueue.length) return say(replyQueue.shift());
    const first = String((results[0] && (typeof results[0].content === "string" ? results[0].content : JSON.stringify(results[0].content))) || "");
    return say(`（测试主持）${results[0].is_error ? "没成：" : ""}${first.split("\n")[0].slice(0, 40)}\n[SPLIT]\n轮到下一步了`);
  }
  // 写到长度上限被截断：回话里有他调的一样，可没停在 tool_use 上（那一样多半没写完整，开封府不该替他调）
  if (/写到一半/.test(herSay)) return { status: 200, json: { model: body.model, stop_reason: "max_tokens", content: think.concat([{ type: "text", text: "写着写着" }, use("roll", {})]), usage } };
  if (/随机开局/.test(herSay)) return step("好，随机开局。", use("new_game", { humanIdentityMode: "random", aiIdentityMode: "random" }));
  if (/改名开局|我叫阿卿/.test(herSay)) return step("好，这一局照你起的名字。", use("new_game", { humanName: "阿卿", aiName: "晋哥", humanIdentityMode: "select", humanIdentityId: "merchant", aiIdentityMode: "select", aiIdentityId: "escort" }));
  if (/开局/.test(herSay)) return step("好，开局。", use("new_game", { humanIdentityMode: "select", humanIdentityId: "merchant", aiIdentityMode: "select", aiIdentityId: "escort" }));
  if (/连扔两回/.test(herSay)) return step("先扔一回。", use("roll", {}));
  if (/帮我扔|扔吧/.test(herSay)) return step("我替你扔。", use("roll", {}));
  if (/只调不说/.test(herSay)) return step("", use("game_info", { view: "state" }));
  if (/查棋盘/.test(herSay)) return step("我看看。", use("game_info", { view: "state" }));
  return null;
}

// 日记共读的假的那边的我（tests/e2e_diary.py 用；带着翻日记那三样的时候，见 src/diaryTools.js）。照她最后说的那句话：
//   “翻日记 2026-10-18”：先说“我翻翻。”，再调 diary_read 读那一天
//   “翻日记目录”：一个字不说，只调 diary_list（不给月份）
//   “搜日记 某某”：先说“我找找。”，再调 diary_search
//   “翻两回 2026-10-18”：先调 diary_list，结果递回来以后再调 diary_read 读那一天，再递回来才说完
//   “翻到一半”：说“翻着翻着”、调了 diary_read，可回话停在 max_tokens 上（写到长度上限被截断）：开封府不该替他翻
//   结果递回来（最后一句最前面是翻日记的 tool_result）：说“（测试翻日记）”加结果的头一行，再一条“翻完了”
//   “留批注 2026-10-18 某某”：先说“我留一句。”，再调 diary_note（贴在主照片旁边）
//   打电话的时候（tool_choice 是 none）、别的话、递回来的是棋局的结果：回 null（交给别人）
function fakeDiary(body) {
  if (body.tool_choice && body.tool_choice.type === "none") return null;
  const msgs = body.messages || [];
  const blocksOf = (m) => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content || []);
  const lastUser = msgs[msgs.length - 1];
  const results = lastUser && lastUser.role === "user" ? blocksOf(lastUser).filter((b) => b.type === "tool_result") : [];
  let herAt = -1;
  let herSay = "";
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role !== "user") continue;
    const t = blocksOf(msgs[i])
      .filter((b) => b.type === "text" && !b.text.startsWith("【") && !b.text.startsWith("[开封府提示"))
      .map((b) => b.text)
      .join(" / ");
    if (t.trim()) {
      herAt = i;
      herSay = t;
      break;
    }
  }
  const used = msgs.slice(herAt + 1).filter((m) => m.role === "assistant").flatMap((m) => blocksOf(m).filter((b) => b.type === "tool_use"));
  const think = /^claude-(fable|opus|sonnet)-5/.test(String(body.model)) ? [{ type: "thinking", thinking: "", signature: "测试用的签名" }] : [];
  const usage = { input_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 50 };
  const use = (name, input) => ({ type: "tool_use", id: "toolu_diary_" + ++toolSeq, name, input });
  const step = (text, call) => ({ status: 200, json: { model: body.model, stop_reason: "tool_use", content: think.concat(text ? [{ type: "text", text }] : [], [call]), usage } });
  const say = (text) => ({ status: 200, json: { model: body.model, stop_reason: "end_turn", content: think.concat([{ type: "text", text }]), usage } });
  const text = (r) => String((r && (typeof r.content === "string" ? r.content : JSON.stringify(r.content))) || "");
  if (results.length) {
    const ids = new Set(used.filter((u) => /^diary_/.test(u.name)).map((u) => u.id));
    if (!results.some((r) => ids.has(r.tool_use_id))) return null; // 递回来的是棋局的结果
    if (/翻两回/.test(herSay) && used.length < 2) {
      const day = (/(\d{4}-\d{2}-\d{2})/.exec(herSay) || [])[1] || "2026-10-01";
      return step("再看看那天。", use("diary_read", { dates: [day] }));
    }
    if (replyQueue.length) return say(replyQueue.shift());
    return say(`（测试翻日记）${results[0].is_error ? "没翻成：" : ""}${text(results[0]).split("\n")[0].slice(0, 40)}\n[SPLIT]\n翻完了`);
  }
  const day = /翻日记\s*(\d{4}-\d{2}-\d{2})/.exec(herSay);
  if (/翻到一半/.test(herSay)) return { status: 200, json: { model: body.model, stop_reason: "max_tokens", content: think.concat([{ type: "text", text: "翻着翻着" }, use("diary_read", { dates: ["2026-10-01"] })]), usage } };
  if (/翻两回/.test(herSay)) return step("先看看目录。", use("diary_list", {}));
  if (/翻日记目录/.test(herSay)) return step("", use("diary_list", {}));
  if (day) return step("我翻翻。", use("diary_read", { dates: [day[1]] }));
  const q = /搜日记\s*(\S+)/.exec(herSay);
  if (q) return step("我找找。", use("diary_search", { query: q[1] }));
  const nt = /留批注\s*(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(herSay);
  if (nt) return step("我留一句。", use("diary_note", { date: nt[1], text: nt[2], part: "hero" }));
  return null;
}

// 秘戏钱匣里他自己抽签的假的那边的我（tests/e2e_qx.py 用；带着 qx_draw 的时候，见 src/qx/pool.js）。照她最后说的那句话：
//   “抽一签”：先说“我抽一签。”，再调 qx_draw（每个维度都抽）
//   “只抽 某某”：调 qx_draw，dims 只写那一样
//   “连抽两签”：抽一回，结果递回来再抽一回，再递回来才说完
//   “抽到一半”：说“抽着抽着”、调了 qx_draw，可回话停在 max_tokens 上（写到长度上限被截断）：开封府不该替他抽
//   结果递回来：说“（测试抽签）”加结果的头两行
//   打电话的时候（tool_choice 是 none）、别的话、递回来的不是抽签的结果：回 null（交给别人）
function fakeQx(body) {
  if (body.tool_choice && body.tool_choice.type === "none") return null;
  const msgs = body.messages || [];
  const blocksOf = (m) => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content || []);
  const lastUser = msgs[msgs.length - 1];
  const results = lastUser && lastUser.role === "user" ? blocksOf(lastUser).filter((b) => b.type === "tool_result") : [];
  let herAt = -1;
  let herSay = "";
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role !== "user") continue;
    const t = blocksOf(msgs[i])
      .filter((b) => b.type === "text" && !b.text.startsWith("【") && !b.text.startsWith("[开封府提示"))
      .map((b) => b.text)
      .join(" / ");
    if (t.trim()) {
      herAt = i;
      herSay = t;
      break;
    }
  }
  const used = msgs.slice(herAt + 1).filter((m) => m.role === "assistant").flatMap((m) => blocksOf(m).filter((b) => b.type === "tool_use"));
  const usage = { input_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 50 };
  const use = (input) => ({ type: "tool_use", id: "toolu_qx_" + ++toolSeq, name: "qx_draw", input });
  const step = (text, call) => ({ status: 200, json: { model: body.model, stop_reason: "tool_use", content: (text ? [{ type: "text", text }] : []).concat([call]), usage } });
  const say = (text) => ({ status: 200, json: { model: body.model, stop_reason: "end_turn", content: [{ type: "text", text }], usage } });
  const text = (r) => String((r && (typeof r.content === "string" ? r.content : JSON.stringify(r.content))) || "");
  if (results.length) {
    const ids = new Set(used.filter((u) => u.name === "qx_draw").map((u) => u.id));
    if (!results.some((r) => ids.has(r.tool_use_id))) return null;
    if (/连抽两签/.test(herSay) && used.length < 2) return step("再抽一签。", use({}));
    if (replyQueue.length) return say(replyQueue.shift());
    return say(`（测试抽签）${results[0].is_error ? "没抽成：" : ""}${text(results[0]).split("\n").slice(0, 2).join(" ")}`);
  }
  if (/抽到一半/.test(herSay)) return { status: 200, json: { model: body.model, stop_reason: "max_tokens", content: [{ type: "text", text: "抽着抽着" }, use({})], usage } };
  if (/连抽两签/.test(herSay)) return step("先抽一签。", use({}));
  const only = /只抽\s*(\S+)/.exec(herSay);
  if (only) return step("我只抽这一样。", use({ dims: [only[1]] }));
  if (/抽一签/.test(herSay)) return step("我抽一签。", use({}));
  return null;
}

// 闲笔集里的手帐（同页那一本）：她在「交给光义」那一屏点了发送（tests/e2e_tongye.py 用，见 src/tongye/host.js 的 tyArrangeAsk）。
// 跟在名帖后面的那段规矩是【排手帐】开头的。照寄来的编号排：原话挑头两句（再编一个不存在的，开封府该认不出），
// 头一张照片当主照片、第二三张当双联照（有的话），再编一张不存在的当截图；留一条批注贴在主照片旁边。她说的“想要”抄进正文（看得出带过来了）。
// 她说想要“排坏”：回一段没有 [JZ] 的话；“排空”：[JZ] 里是 {}（两样都该“没排成”）；“尖括号”：标题里夹一段 <b>…</b>（开封府该换成全角的）
function fakeArrange(body) {
  const rule = Array.isArray(body.system) ? body.system.map((x) => x.text || "").find((t) => t.startsWith("【排手帐】")) : "";
  if (!rule) return null;
  const blocks = (body.messages[0] && body.messages[0].content) || [];
  const all = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const usage = { input_tokens: 3000, cache_creation_input_tokens: 0, cache_read_input_tokens: 8000, output_tokens: 300 };
  const wish = (/她说想要：(.+)/.exec(all) || [])[1] || "";
  if (/排坏/.test(wish)) return { status: 200, json: { model: body.model, stop_reason: "end_turn", content: [{ type: "text", text: "我想了想，不排了。" }], usage } };
  if (/排空/.test(wish)) return { status: 200, json: { model: body.model, stop_reason: "end_turn", content: [{ type: "text", text: "[JZ]\n{}\n[/JZ]" }], usage } };
  const qids = [...all.matchAll(/^(\S+)｜\d\d:\d\d｜/gm)].map((m) => m[1]);
  const tags = [...new Set([...all.matchAll(/照片(\d+)（/g)].map((m) => "照片" + m[1]))];
  const o = {
    layout: "bento",
    style: "film",
    title: /尖括号/.test(wish) ? "（测试排的）<b>泡桐花</b>" : "（测试排的）泡桐花",
    p1: `她说看到了，我也想看。${wish ? `她要的：${wish}` : ""}`,
    cap: "运河边",
    pen: { text: "[[紫色]]的，一串一串", margin: "记得" },
    quotes: qids.slice(0, 2).concat(["编的编号"]),
    photos: [tags[0] ? { id: tags[0], role: "hero", note: "运河" } : null, tags[1] ? { id: tags[1], role: "pair" } : null, tags[2] ? { id: tags[2], role: "pair" } : null, { id: "照片99", role: "sh" }].filter(Boolean),
    note: { text: "（测试批注）这张我最喜欢", b: "he" },
  };
  const think = /^claude-(fable|opus|sonnet)-5/.test(String(body.model)) ? [{ type: "thinking", thinking: "", signature: "测试用的签名" }] : [];
  return { status: 200, json: { model: body.model, stop_reason: "end_turn", content: think.concat([{ type: "text", text: `排好了。\n[JZ]\n${JSON.stringify(o)}\n[/JZ]` }]), usage } };
}

// 假的那边的我：照寄来的话编一条回复。两条路问的都是它
function fakeAnthropic(body, beta, via) {
  claudeLog.push({ body, beta, via });
  if (claudeFail === "workspace" || claudeFail === "broken") {
    if (claudeFail === "workspace") claudeFail = null;
    return { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use." } } };
  }
  if (claudeFail === "overloaded") {
    if (--claudeFailTimes <= 0) claudeFail = null;
    return { status: 529, json: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } };
  }
  if (claudeFail === "mcp" && Array.isArray(body.mcp_servers) && body.mcp_servers.length) {
    return { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "mcp_servers.0: failed to connect to MCP server" } } };
  }
  if (body.ping) {
    return { status: 200, json: { model: "claude-haiku-4-5-20251001", content: [{ type: "text", text: "在" }], usage: { input_tokens: 12, output_tokens: 1 } } };
  }
  // 叫他抄前情提要的那两种：照寄来的东西编一段，写明抄了几条、前面有没有提要、带了几张图
  const recapRule = recapRuleOf(body);
  if (recapRule) {
    if (claudeFail === "recap") return { status: 529, json: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } };
    const blocks = (body.messages[0] && body.messages[0].content) || [];
    const all = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    let text;
    if (recapRule.startsWith("【并提要】")) {
      const k = (/把最早的 (\d+) 段并成一段/.exec(recapRule) || [])[1] || "?";
      text = `（测试并提要）把最早的 ${k} 段并成了一段。她说要试试新门，我说好，后来聊到周末的打算，说定周末去看灯，这件事还没了结。别的话头都收了尾，没有落下的。`;
    } else {
      const rows = (/〔要抄的原话，一共 (\d+) 条/.exec(all) || [])[1] || "?";
      text = `<thinking>顺手写的心里话</thinking>\n（测试提要）这一段一共抄了 ${rows} 条。${all.includes("〔前面已经抄好的提要") ? "前面已经有提要了。" : "这是头一段。"}带着 ${blocks.filter((b) => b.type === "image").length} 张图。她说要试试新门，我说好，后来聊到周末的打算。她还问灯会几点开始，我说七点。\n[SPLIT]\n说定的事：周末去看灯。`;
    }
    // 自己会先想一阵的模型（5 字头的那几个）：和真的一样，正文前面先来一块“想的”，里头的字不给看（空的），只带一个签名
    const thought = /^claude-(fable|opus|sonnet)-5/.test(String(body.model)) ? [{ type: "thinking", thinking: "", signature: "测试用的签名" }] : [];
    return {
      status: 200,
      json: { model: body.model, stop_reason: claudeFail === "recap-cut" ? "max_tokens" : "end_turn", content: thought.concat([{ type: "text", text }]), usage: { input_tokens: 5000, cache_creation_input_tokens: 0, cache_read_input_tokens: 8000, output_tokens: 400 } },
    };
  }
  // 排手帐（不带工具，跟在名帖后面的是【排手帐】那段规矩）
  const jz = fakeArrange(body);
  if (jz) return jz;
  // 他屋里的园子、妆台（带着 play_garden、play_dressing_room，见 alarm/garden.js、alarm/dressing.js）：排好了要他调的，照排好的调
  if (Array.isArray(body.tools) && body.tools.some((t) => t && TOYS.has(t.name))) {
    const g = fakeGarden(body);
    if (g) return g;
  }
  // 秘戏钱匣里他自己抽签（带着 qx_draw，见 src/qx/pool.js）
  if (Array.isArray(body.tools) && body.tools.some((t) => t && t.name === "qx_draw")) {
    const q = fakeQx(body);
    if (q) return q;
  }
  // 翻日记（带着那几样工具，见 src/diaryTools.js）：假的那边的我翻日记
  if (Array.isArray(body.tools) && body.tools.some((t) => t && t.name === "diary_read")) {
    const d = fakeDiary(body);
    if (d) return d;
  }
  // 江湖棋局那一段（带着四样工具，见 src/game/jianghu.js）：假的主持人
  if (Array.isArray(body.tools) && body.tools.some((t) => t && t.name === "roll")) {
    const game = fakeHost(body);
    if (game) return game;
  }
  const last = (body.messages || []).filter((m) => m.role === "user").pop();
  let blocks = last ? last.content : [];
  if (typeof blocks === "string") blocks = [{ type: "text", text: blocks }]; // 写日记那次寄来的是一整段字
  const endNote = blocks.findIndex((b) => b.type === "text" && b.text.startsWith("【附注结束"));
  if (endNote >= 0) blocks = blocks.slice(endNote + 1);
  const herText = blocks
    .filter((b) => b.type === "text" && !b.text.startsWith("【此刻】"))
    .map((b) => b.text)
    .join(" / ");
  const isDiary = Array.isArray(body.system) && body.system.some((b) => b.text && b.text.startsWith("【写日记】"));
  // 她说“改名叫某某”：假的那边的我就照做，在回复里写 [NAME:某某]（测他给自己改名字）
  const wish = /改名叫(\S+)/.exec(herText);
  // 她说“原样回：……”：冒号后面的字原样当成回复（测回复里的表情包、换头像这些标记）
  const echo = /原样回：([\s\S]+)$/.exec(herText);
  const queued = !isDiary && replyQueue.length ? replyQueue.shift() : null;
  const text = isDiary
    ? "心情：甜、累\n今天她第一次从开封府的新门进来。我看着她在门口站了一会儿。"
    : queued !== null
    ? queued
    : echo
    ? `<thinking>（测试心声）照着说</thinking>\n${echo[1].replace(/\{回\}/g, String(++echoSeq))}`
    : wish
    ? `<thinking>（测试心声）改就改</thinking>\n行，改了。\n[NAME:${wish[1]}]\n[SPLIT]\n抬头看`
    : `<thinking>（测试心声）卿卿说：${herText}</thinking>\n收到：${herText}\n[SPLIT]\n第二条`;
  return {
    status: 200,
    json: {
      model: body.model,
      content: [{ type: "text", text }],
      usage: { input_tokens: 60, cache_creation_input_tokens: 9000, cache_read_input_tokens: 0, output_tokens: 90, cache_creation: { ephemeral_1h_input_tokens: 8000, ephemeral_5m_input_tokens: 1000 } },
    },
  };
}
// signal：问的那头带来的“不等了”的线（push 函数带着；claude 函数那条老路不带）。压着的工夫里线被掐了：这一回到此为止，不答
async function heldAnthropic(body, beta, via, signal) {
  // kind 是 cont 的：只压江湖棋局里“结果递回去、等他接着说”的那一种（最后一句最前面是 tool_result）
  const cont = () => {
    const m = (body.messages || [])[(body.messages || []).length - 1];
    return !!m && Array.isArray(m.content) && m.content.some((b) => b && b.type === "tool_result");
  };
  if (claudeHold && (claudeHoldKind === "recap" ? recapRuleOf(body) : claudeHoldKind === "cont" ? cont() : true)) {
    const ms = claudeHold;
    claudeHold = 0;
    claudeHoldKind = "";
    let cut = false;
    await new Promise((r) => {
      const t = setTimeout(r, ms);
      const release = () => {
        clearTimeout(t);
        r();
      };
      claudeRelease = release;
      if (signal) {
        const stop = () => {
          cut = true;
          release();
        };
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, { once: true });
      }
    });
    claudeRelease = null;
    if (cut) {
      claudeLog.push({ body, beta, via, cut: true });
      throw signal.reason instanceof Error ? signal.reason : new DOMException("aborted", "AbortError");
    }
  }
  return fakeAnthropic(body, beta, via);
}
let clock = Date.UTC(2026, 9, 1, 14, 0, 0) * 1000;

// ---- 通知 ----
const ledger = createLedgerTable();
const mail = createMailTable();
const fakePush = createFakePush();
// push 函数替她等回话的时候去问的 Anthropic：接到上面那个假的
fakePush.install(null, {
  async receive(url, init = {}) {
    // 敲门之前那根“不等了”的线就已经拉了：和真的 fetch 一样，当场报错，门都不敲（不算问过一回）
    if (init.signal && init.signal.aborted) throw init.signal.reason instanceof Error ? init.signal.reason : new DOMException("The operation was aborted.", "AbortError");
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const out = await heldAnthropic(JSON.parse(init.body), headers["anthropic-beta"] || "", "push", init.signal);
    return new Response(JSON.stringify(out.json), { status: out.status, headers: { "content-type": "application/json" } });
  },
});
const pushFn = await loadPushFunction();

// ---- 念语音 ----
// voice 函数去敲的 ElevenLabs：接到假的那个上（别的照旧往下走）
const fakeEleven = createFakeEleven();
// 打电话的实时听写：网页拿着 voice 函数给的通行证连过来（地址换成这里的 /__stt，见下面 voice 函数那一段）
const fakeStt = createFakeStt();
{
  const prev = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch (e) {}
    if (host === "api.elevenlabs.io") return fakeEleven.receive(url, init);
    return prev(input, init);
  };
}
const voiceFn = await loadVoiceFunction();
const ELEVEN_KEY = "sk_test_eleven_key_1234567890";
const ELEVEN_VOICE = "TestVoiceAbcdefghij1"; // 编的（真的声音编号不进仓库）
let voiceFnState = "ok"; // ok 部署了；missing 还没建这个函数（网关回 404，不带跨域的头）；template 里面还是 Supabase 的样板
function voiceReset() {
  for (const k of Object.keys(voiceEnv)) delete voiceEnv[k];
  Object.assign(voiceEnv, { SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_ANON_KEY: "sb_publishable_test", ALLOWED_EMAIL: "qing@example.com", ELEVENLABS_API_KEY: ELEVEN_KEY, ELEVENLABS_VOICE_ID: ELEVEN_VOICE });
  Object.assign(fakeEleven.state, { key: ELEVEN_KEY, voice: ELEVEN_VOICE, fail: null, failTimes: 0, always: false, hold: 0, ttsModels: null, stabilities: null, stt: "ok", tokens: 0 });
  fakeStt.reset();
  fakeEleven.log.length = 0;
  voiceFnState = "ok";
}
voiceReset();
let pushHold = 0; // 下一次敲 push 函数的门：答案照常算好，压这么多毫秒再回（测“先问的后到”）
let pushFnState = "ok"; // ok 部署了；missing 还没建这个函数（照 Supabase 网关那样回 404，不带跨域的头）；missing-cors 同上但带着头；
// old 部署的还是第一步那份代码（不认识“替她等回话”）；template 建了函数、里面还是 Supabase 给的样板；
// prev 部署的是上一版（会替她等回话；还不会一个气泡敲一条、不会她按了停就不等。这里只管它答“会什么”的那一句，办事的还是眼下这份）
let replyDrop = 0; // 往后这么多回“替她等回话”：小后端照常办完，回话却没送回网页（连接断了）
let pushAge = 0; // 下一回“替她等回话”敲门的时候，这份代码已经活了这么多毫秒（测“这一趟快到点了，剩下的横幅并成一条”）
const pushOps = []; // 每一回敲 push 函数的门，是来做什么的（key、test、reply）
let pushNotFound = 0; // 函数还没建的时候，有人来敲过几回门（浏览器先来打招呼的那一下也算）
function pushSecrets(text) {
  // 她在 Supabase 的 Secrets 里一次贴好几行“名字=值”，这里照着收
  for (const k of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) delete pushEnv[k];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/.exec(line);
    if (m) pushEnv[m[1]] = m[2];
  }
}
function pushReset() {
  ledger.rows.clear();
  Object.assign(ledger.state, { missing: false, failGet: 0 });
  claudeFailTimes = 0;
  mail.rows.clear();
  mail.log.length = 0;
  Object.assign(mail.state, { missing: false, down: false, failPatch: 0 });
  fakePush.reset();
  pushFnState = "ok";
  pushHold = 0;
  replyDrop = 0;
  pushAge = 0;
  pushFn.worker.closing = false;
  pushOps.length = 0;
  pushNotFound = 0;
  claudeHold = 0;
  claudeHoldKind = "";
  for (const k of Object.keys(pushEnv)) delete pushEnv[k];
  Object.assign(pushEnv, { SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_ANON_KEY: "sb_publishable_test", ALLOWED_EMAIL: "qing@example.com", ANTHROPIC_API_KEY: "sk-ant-test" });
}
pushReset();

const b64url = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function jwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    b64url(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 })),
    "mocksig",
  ].join(".");
}
function userFromAuth(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  try {
    const p = JSON.parse(Buffer.from(m[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    return p.role === "authenticated" ? { id: p.sub, email: p.email } : null;
  } catch (e) {
    return null;
  }
}
function session(user) {
  return {
    access_token: jwt(user),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "refresh-" + user.id,
    user: { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" },
  };
}
function stamp() {
  clock += 1700;
  const ms = Math.floor(clock / 1000);
  const us = clock % 1000;
  const iso = new Date(ms).toISOString().replace("Z", "");
  let frac = (iso.split(".")[1] + String(us).padStart(3, "0")).replace(/0+$/, "");
  return iso.split(".")[0] + (frac ? "." + frac : "") + "+00:00";
}
const tsNum = (s) => {
  const m = /^(.+?)(?:\.(\d+))?([+-]\d\d:\d\d|Z)$/.exec(s);
  const frac = (m[2] || "").padEnd(6, "0").slice(0, 6);
  return Date.parse(m[1] + (m[3] === "Z" ? "Z" : m[3])) * 1000 + Number(frac);
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-kfs-beta, x-supabase-api-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "content-range",
};
function send(res, status, body) {
  res.writeHead(status, { ...cors, "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
// 一块一块收齐了再转成字：一块一块转的话，一个汉字正好被劈在两块之间就成了乱码（长对话里碰上过）
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    // push 函数还没建：网关回 404，浏览器先来打招呼的那一下就过不去
    if (url.pathname === "/functions/v1/push" && (pushFnState === "missing" || pushFnState === "missing-cors")) {
      pushNotFound++;
      res.writeHead(404, { ...(pushFnState === "missing-cors" ? cors : {}), "Content-Type": "application/json" });
      return res.end(JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" }));
    }
    // voice 函数还没建：一样回 404，不带跨域的头
    if (url.pathname === "/functions/v1/voice" && voiceFnState === "missing") {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" }));
    }
    if (req.method === "OPTIONS") return send(res, 204);

    // ---- 调试用 ----
    if (url.pathname === "/__debug/rows") return send(res, 200, [...rows.values()]);
    if (url.pathname === "/__debug/claude") return send(res, 200, claudeLog);
    if (url.pathname === "/__debug/claude-fail") {
      claudeFail = url.searchParams.get("kind") || null;
      claudeFailTimes = Number(url.searchParams.get("times") || 1);
      return send(res, 200, { ok: true });
    }
    // 往后 times 回往库房里写（kv 表的 POST）都回 503：家里的闹钟问到了他的话、却一时放不进存档（tests/e2e_alarm.mjs）。
    // 带 key（云端的钥匙名 h_…）：只算写这一行的那几回
    if (url.pathname === "/__debug/kv-fail") {
      kvFail = { times: Number(url.searchParams.get("times") || 1), key: url.searchParams.get("key") || "" };
      return send(res, 200, { ok: true });
    }
    // 下一次问 Anthropic 压多少毫秒再答
    // 带 kind=recap：只压下一回叫他抄前情提要的（这之前平常的话照常答）
    if (url.pathname === "/__debug/claude-hold") {
      claudeHold = Number(url.searchParams.get("ms") || 0);
      claudeHoldKind = url.searchParams.get("kind") || "";
      return send(res, 200, { ok: true });
    }
    // 往后排一步调园子、妆台的工具（见上面 toolQueue）
    if (url.pathname === "/__debug/tool-queue") {
      let input = {};
      try {
        input = JSON.parse(url.searchParams.get("input") || "{}");
      } catch (e) {}
      toolQueue.push({ name: url.searchParams.get("name") || "play_garden", input, text: url.searchParams.get("text") || "" });
      return send(res, 200, { ok: true, queued: toolQueue.length });
    }
    // 往后排一句回话（截图用，见上面 replyQueue）
    if (url.pathname === "/__debug/reply-queue") {
      replyQueue.push(url.searchParams.get("text") || "");
      return send(res, 200, { ok: true, queued: replyQueue.length });
    }
    // 眼下有没有正压着的一回
    if (url.pathname === "/__debug/claude-held") return send(res, 200, { held: !!claudeRelease });
    // 正压着的那一回，现在就答
    if (url.pathname === "/__debug/claude-release") {
      const held = !!claudeRelease;
      if (claudeRelease) claudeRelease();
      return send(res, 200, { ok: held });
    }
    // ---- 念语音的调试口 ----
    // 看：每一回敲 ElevenLabs 的门（念的什么字、什么模型、稳不稳）
    if (url.pathname === "/__debug/eleven") {
      return send(res, 200, { log: fakeEleven.log.map((x) => ({ path: x.path, format: x.format, key: x.key, text: x.body.text || ((x.body.inputs || [])[0] || {}).text || "", model: x.body.model_id, settings: x.body.voice_settings || null, cut: !!x.cut })), state: { ...fakeEleven.state } });
    }
    // fail=quota|key|voice|busy|down|model|garbage|timeout|offline|broken（times=N 连着几回，always=1 一直这样）；hold=毫秒（下一回念得这么慢）；
    // models=只认哪几个模型（逗号隔开）；stab=只认哪几个“稳不稳”的数（逗号隔开，空的是都认）
    if (url.pathname === "/__debug/eleven-setup") {
      const q = url.searchParams;
      if (q.has("fail")) Object.assign(fakeEleven.state, { fail: q.get("fail") || null, failTimes: Number(q.get("times") || 1), always: q.get("always") === "1" });
      if (q.has("hold")) fakeEleven.state.hold = Number(q.get("hold") || 0);
      if (q.has("models")) fakeEleven.state.ttsModels = q.get("models") ? q.get("models").split(",") : null;
      if (q.has("stab")) fakeEleven.state.stabilities = q.get("stab") ? q.get("stab").split(",").map(Number) : null;
      // stt=perm：这把 key 没开 Speech to Text（要听写通行证的时候回 401）；stt=ok 开了
      if (q.has("stt")) fakeEleven.state.stt = q.get("stt") || "ok";
      return send(res, 200, { ok: true });
    }
    // ---- 打电话的实时听写（假的 Scribe）----
    // 看：连上来过的几条（带的参数、送了几块声音、收了几回 commit、断没断）
    if (url.pathname === "/__debug/stt") return send(res, 200, { conns: fakeStt.view(), tokens: fakeEleven.state.tokens });
    // 她说了这么一句：眼下连着的那一条回一句听到一半的字
    if (url.pathname === "/__debug/stt-say") return send(res, 200, { ok: fakeStt.say(url.searchParams.get("text") || "") });
    // kind=close 眼下这一条那边自己断了；kind=auth 下一回连上来不认通行证
    if (url.pathname === "/__debug/stt-fail") return send(res, 200, { ok: fakeStt.fail(url.searchParams.get("kind") || "") });
    // 她在 Supabase 做到哪一步了：fn=missing 还没建 voice 函数、fn=template 里面是样板；keys=missing 密钥柜里还没放 ElevenLabs 的两样；
    // model=… 密钥柜里写了 ELEVENLABS_MODEL
    if (url.pathname === "/__debug/voice-setup") {
      const q = url.searchParams;
      if (q.has("fn")) voiceFnState = q.get("fn") || "ok";
      if (q.get("keys") === "missing") {
        delete voiceEnv.ELEVENLABS_API_KEY;
        delete voiceEnv.ELEVENLABS_VOICE_ID;
      } else if (q.get("keys") === "ok") Object.assign(voiceEnv, { ELEVENLABS_API_KEY: ELEVEN_KEY, ELEVENLABS_VOICE_ID: ELEVEN_VOICE });
      if (q.has("model")) {
        if (q.get("model")) voiceEnv.ELEVENLABS_MODEL = q.get("model");
        else delete voiceEnv.ELEVENLABS_MODEL;
      }
      return send(res, 200, { ok: true });
    }
    // ---- 信箱的调试口 ----
    // 看：信箱里现在有什么、每一回读写
    if (url.pathname === "/__debug/mail") return send(res, 200, { rows: mail.all(), log: mail.log, ops: pushOps, notFound: pushNotFound });
    // table=missing 还没建信箱那张表；drop=N 往后 N 回“替她等回话”办完了却送不回网页；rows=clear 把信箱清空；
    // failpatch=N 往后 N 回往信箱里“改”（摸一下、放信）都不成（库房一时出岔子）
    if (url.pathname === "/__debug/mail-setup") {
      if (url.searchParams.has("table")) mail.state.missing = url.searchParams.get("table") === "missing";
      if (url.searchParams.has("failpatch")) mail.state.failPatch = Number(url.searchParams.get("failpatch") || 0);
      if (url.searchParams.has("drop")) replyDrop = Number(url.searchParams.get("drop") || 0);
      if (url.searchParams.get("rows") === "clear") mail.rows.clear();
      return send(res, 200, { ok: true });
    }
    // 信箱里放好了的那几封，往前挪 ms 毫秒（装成放进去好一会儿了：江湖棋局里别的设备发的一步棋，过了先等发的那台的工夫）
    if (url.pathname === "/__debug/mail-age") {
      const ms = Number(url.searchParams.get("ms") || 0);
      let n = 0;
      for (const r of mail.rows.values()) {
        if (!r.done_at) continue;
        r.done_at = new Date(Date.parse(r.done_at) - ms).toISOString();
        n++;
      }
      return send(res, 200, { ok: true, aged: n });
    }
    if (url.pathname === "/__debug/reset") {
      rows.clear();
      claudeLog.length = 0;
      claudeFail = null;
      kvFail = { times: 0, key: "" };
      replyQueue.length = 0;
      toolQueue.length = 0;
      pushReset();
      voiceReset();
      return send(res, 200, { ok: true });
    }
    // ---- 通知的调试口 ----
    // 看：登记簿、送到设备上的通知（已经解开）、每一次敲推送服务的门
    if (url.pathname === "/__debug/push") {
      return send(res, 200, {
        rows: ledger.all(),
        delivered: fakePush.delivered.map((d) => ({ endpoint: d.endpoint, json: d.json, text: d.text, claims: d.claims, ttl: d.ttl, urgency: d.urgency, at: d.at })),
        log: fakePush.log.map((x) => ({ endpoint: x.endpoint, status: x.status, reason: x.reason, size: x.size })),
        secrets: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"].filter((k) => pushEnv[k]),
        publicKey: pushEnv.VAPID_PUBLIC_KEY || "",
      });
    }
    // 领一台假设备（一个门牌号加两把公开钥匙）。key 是订阅时用的服务器公钥：真的推送服务会记着，换了钥匙就不收
    if (url.pathname === "/__debug/push-device") {
      const dev = fakePush.addDevice(url.searchParams.get("mode") || "ok");
      dev.serverKey = url.searchParams.get("key") || null;
      return send(res, 200, { endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth });
    }
    // 改一台假设备的脾气：gone 是门牌号作废
    if (url.pathname === "/__debug/push-mode") {
      const dev = fakePush.devices.get(url.searchParams.get("endpoint"));
      if (dev) dev.mode = url.searchParams.get("mode") || "ok";
      return send(res, 200, { ok: !!dev });
    }
    // 她在 Supabase 做到哪一步了：table=missing 还没建表；fn=missing 还没建函数；都不写就是恢复。
    // age=N 下一回“替她等回话”敲门的时候，这份代码已经活了 N 毫秒；closing=1 运行环境已经说过“快要把这一趟收掉了”
    if (url.pathname === "/__debug/push-setup") {
      ledger.state.missing = url.searchParams.get("table") === "missing";
      pushFnState = url.searchParams.get("fn") || "ok";
      pushHold = Number(url.searchParams.get("hold") || 0);
      pushAge = Number(url.searchParams.get("age") || 0);
      pushFn.worker.closing = url.searchParams.get("closing") === "1";
      return send(res, 200, { ok: true });
    }
    // 往密钥柜里贴（正文是那几行“名字=值”）；make=1 是现生成一对贴进去
    if (url.pathname === "/__debug/push-secrets") {
      if (url.searchParams.get("make")) {
        const k = makeVapidKeys();
        pushSecrets(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:qing@example.com`);
      } else pushSecrets(await readBody(req));
      return send(res, 200, { ok: true, publicKey: pushEnv.VAPID_PUBLIC_KEY || "" });
    }

    // ---- 登录 ----
    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (url.searchParams.get("grant_type") === "password") {
        const u = USERS[body.email];
        if (!u || u.password !== body.password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return send(res, 200, session({ id: u.id, email: body.email }));
      }
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const id = String(body.refresh_token || "").replace("refresh-", "");
        const email = Object.keys(USERS).find((e) => USERS[e].id === id);
        if (!email) return send(res, 400, { code: 400, msg: "Invalid Refresh Token" });
        return send(res, 200, session({ id, email }));
      }
    }
    if (url.pathname === "/auth/v1/user") {
      const u = userFromAuth(req);
      return u ? send(res, 200, { id: u.id, email: u.email, aud: "authenticated", role: "authenticated" }) : send(res, 401, { msg: "invalid JWT" });
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);

    // ---- 库房 ----
    if (url.pathname === "/rest/v1/kv") {
      const u = userFromAuth(req);
      if (!u) return send(res, 401, { message: "permission denied for table kv", code: "42501" });
      if (req.method === "GET") {
        let list = [...rows.values()].filter((r) => r.user_id === u.id);
        const inq = url.searchParams.get("key");
        if (inq && inq.startsWith("in.(")) {
          const keys = inq.slice(4, -1).split(",").map((k) => k.replace(/^"|"$/g, ""));
          list = list.filter((r) => keys.includes(r.key));
        }
        const upd = url.searchParams.get("updated_at");
        if (upd && upd.startsWith("gte.")) list = list.filter((r) => tsNum(r.updated_at) >= tsNum(upd.slice(4)));
        const or = url.searchParams.get("or");
        if (or) {
          const m = /^\(updated_at\.gt\."([^"]+)",and\(updated_at\.eq\."([^"]+)",key\.gt\."([^"]+)"\)\)$/.exec(or);
          if (!m) return send(res, 400, { message: "bad or filter: " + or });
          const t = tsNum(m[1]);
          list = list.filter((r) => tsNum(r.updated_at) > t || (tsNum(r.updated_at) === t && r.key > m[3]));
        }
        list.sort((a, b) => tsNum(a.updated_at) - tsNum(b.updated_at) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        const limit = Number(url.searchParams.get("limit") || 1000);
        const sel = (url.searchParams.get("select") || "*").split(",");
        return send(
          res,
          200,
          list.slice(0, limit).map((r) => Object.fromEntries(sel.map((c) => [c, r[c]])))
        );
      }
      if (req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "[]");
        const list = Array.isArray(body) ? body : [body];
        if (kvFail.times > 0 && (!kvFail.key || list.some((r) => r && r.key === kvFail.key))) {
          kvFail.times--;
          return send(res, 503, { message: "upstream connect error (test)", code: "PGRST000" });
        }
        const t = stamp();
        for (const r of list) {
          if (r.user_id && r.user_id !== u.id) return send(res, 403, { message: 'new row violates row-level security policy for table "kv"', code: "42501" });
          rows.set(u.id + "|" + r.key, { user_id: u.id, key: r.key, value: r.value, updated_at: t });
        }
        return send(res, 201);
      }
    }

    // ---- 通知的登记簿 ----
    if (url.pathname === "/rest/v1/push_subs") {
      const u = userFromAuth(req);
      const r = ledger.handle(req.method, url.searchParams, u && u.id, await readBody(req));
      return send(res, r.status, r.status === 204 ? undefined : r.body);
    }

    // ---- 信箱 ----
    if (url.pathname === "/rest/v1/mailbox") {
      const u = userFromAuth(req);
      const r = mail.handle(req.method, url.searchParams, u && u.id, await readBody(req), req.headers.prefer || "");
      return send(res, r.status, r.status === 204 ? undefined : r.body);
    }

    // ---- push 函数：把这次敲门原样交给真的那份代码 ----
    if (url.pathname === "/functions/v1/push") {
      const headers = {};
      for (const k of ["authorization", "apikey", "content-type", "origin"]) if (req.headers[k]) headers[k] = req.headers[k];
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const opOf = /^\s*\{\s*"op"\s*:\s*"([a-z]+)"/.exec(body || "");
      pushOps.push(opOf ? opOf[1] : "");
      // 建了函数、里面还是 Supabase 给的样板：不管问什么都答一句 Hello
      if (pushFnState === "template") return send(res, 200, { message: "Hello undefined!" });
      // 部署的还是第一步那份：不认识“替她等回话”，寄来的东西一长就嫌长
      if (pushFnState === "old") {
        if (body && body.length > 4000) return send(res, 413, { type: "error", error: { type: "kaifengfu", message: "寄来的东西太长" } });
        let op = "";
        try {
          op = JSON.parse(body).op;
        } catch (e) {}
        if (op === "reply") return send(res, 400, { type: "error", error: { type: "kaifengfu", message: "不认识这个动作" } });
      }
      // 真的那头，这份代码每被叫起来一趟最多活两分半；这里一直开着不关。每来一回“替她等回话”就当它是刚被叫起来的
      // （测试要它“已经活了多久”就用 push-setup 的 age 说）
      if (opOf && opOf[1] === "reply") {
        pushFn.worker.born = Date.now() - pushAge;
        pushAge = 0;
      }
      const drop = !!opOf && opOf[1] === "reply" && replyDrop > 0;
      if (drop) replyDrop--;
      // 连接断了：这头照常办（函数不知道网页那头没了），回话却送不回去
      if (drop) {
        pushFn.handler(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body })).catch(() => {});
        return setTimeout(() => res.destroy(), 300);
      }
      const out = await pushFn.handler(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body }));
      if (pushHold && req.method === "POST") {
        const ms = pushHold;
        pushHold = 0;
        await new Promise((r) => setTimeout(r, ms));
      }
      res.writeHead(out.status, Object.fromEntries(out.headers));
      let text = await out.text();
      // 第一步那份代码答“钥匙放好了没有”的时候，不会说自己会替她等回话
      if (pushFnState === "old" && opOf && opOf[1] === "key") {
        const d = JSON.parse(text);
        delete d.can;
        text = JSON.stringify(d);
      }
      // 上一版答的是：只会替她等回话
      if (pushFnState === "prev" && opOf && opOf[1] === "key") {
        const d = JSON.parse(text);
        d.can = ["reply"];
        text = JSON.stringify(d);
      }
      return res.end(text);
    }

    // ---- voice 函数：把这次敲门原样交给真的那份代码 ----
    if (url.pathname === "/functions/v1/voice") {
      if (voiceFnState === "template") return send(res, 200, { message: "Hello undefined!" });
      const headers = {};
      for (const k of ["authorization", "apikey", "content-type", "origin"]) if (req.headers[k]) headers[k] = req.headers[k];
      const body = req.method === "POST" ? await readBody(req) : undefined;
      // 网页那头把这一问掐了（连接断了）：和真的运行环境一样，交给函数的这一问的 signal 跟着拉
      const gone = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) gone.abort();
      });
      const out = await voiceFn.handler(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body, signal: gone.signal }));
      if (res.destroyed) return;
      res.writeHead(out.status, Object.fromEntries(out.headers));
      let text = await out.text();
      // 听写通行证：真的那份代码交回的是 ElevenLabs 的地址，换成这里假的那个
      if (out.status === 200 && /"type":"token"/.test(text)) {
        const d = JSON.parse(text);
        d.url = `ws://127.0.0.1:${PORT}/__stt`;
        text = JSON.stringify(d);
      }
      return res.end(text);
    }

    // ---- claude 函数 ----
    if (url.pathname === "/functions/v1/claude" && req.method === "POST") {
      const u = userFromAuth(req);
      if (!u) return send(res, 401, { type: "error", error: { type: "kaifengfu", message: "请先登录开封府" } });
      const body = JSON.parse((await readBody(req)) || "{}");
      const out = await heldAnthropic(body, req.headers["x-kfs-beta"] || "", "claude");
      return send(res, out.status, out.json);
    }

    send(res, 404, { message: "not found: " + url.pathname });
  });
// 实时听写的 WebSocket（假的 Scribe，见 stt-harness.mjs）
server.on("upgrade", (req, socket) => {
  if (new URL(req.url, "http://x").pathname === "/__stt") fakeStt.accept(req, socket);
  else socket.destroy();
});
server.listen(PORT, () => console.log("假 Supabase 在 " + PORT));
