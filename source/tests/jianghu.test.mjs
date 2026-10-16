// 江湖棋局（见 src/game/jianghu.js、vendor/jianghu/）：引擎在手机上那一包跑不跑得通、替他调引擎的那一下、小卡片、寄回去的样子。
// 引擎是真的（她仓库里拷来的那一份）。骰子照他调的那一样的编号掷（seededRng）：编号一样掷得一样，编号不一样就跟真随机一样，
// 所以每一条都照引擎回的样子认，不认具体几点。
import * as E from "../src/game/engine.js";
import {
  TOOLS, GAME_SECTION, HER, HIM, SNAP_KEY, isGameChat, nowLine, apiBlocks, callsOf, midTurn, needsRun, lastStep, collectStepIds,
  boardOf, stripLines, nanyaSub, runCalls, stepLines, seededRng, gameSection, OFF_LINE, ON_KEY, readOn, gameOn, hasSteps, namesOf,
} from "../src/game/jianghu.js";
import { HOST_RULES } from "../vendor/jianghu/host_rules.js";
import { needsReply, markStopped, stoppedAt, unmarkStopped, mailBefore } from "../src/thread.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildSystem, withNowNote } from "../src/prompt/system.js";
import { buildRecapAsk } from "../src/prompt/recap.js";
import { thick, askThick } from "../src/recap.js";
import { dayTranscript } from "../src/diary.js";
import { makePreview } from "../src/chat/overview.js";
import { buildRows } from "../src/chat/rows.js";
import fs from "node:fs";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
let seq = 0;
const call = (name, input = {}) => ({ id: "toolu_" + ++seq, name, input });

// ---- 搬来的引擎 ----
const game = fs.readFileSync(new URL("../vendor/jianghu/engine/game.ts", import.meta.url), "utf8");
ok(game.includes("from './rng.js';") && !/from 'node:/.test(game), "搬来的引擎：game.ts 不再要 node: 开头的东西（随机数换成了 ./rng.js）");
const ids = await E.loadIdentities();
const items = await E.loadItems();
const ch1 = await E.loadChapter("zhongyuan");
ok(ids.length === 16 && ids.filter((x) => x.special).length === 4 && ch1.cells.length === 36 && ch1.name === "第一章：中原风起", "身份十六张（四张特殊）、第一章三十六格，章节打进包里读得出来");
const a = await E.loadChapter("zhongyuan");
a.cells[0].title = "改坏了";
ok((await E.loadChapter("zhongyuan")).cells[0].title === "洛阳城门", "每回给一份新的：引擎改了拿到的那一份，下一回照旧");
ok(items.filter((x) => x.collectible).length === 36, `收藏品一共 36 件（${items.filter((x) => x.collectible).length}）`);

// ---- 工具 ----
ok(TOOLS.map((t) => t.name).join(",") === "new_game,roll,game_action,game_info" && !JSON.stringify(TOOLS).includes("sessionId"), "四样工具，都不要 sessionId（开封府替他填）");
ok(GAME_SECTION.startsWith("【江湖棋局】") && GAME_SECTION.endsWith(HOST_RULES) && HOST_RULES.includes("主持人") && HOST_RULES.length > 1000, "名帖后面那一段：开封府里怎么下，后面原样跟着游戏自带的主持规矩");
ok(isGameChat("jhabc123") && !isGameChat("mgabc123") && !isGameChat(undefined), "对话编号以 jh 开头的是一局棋");

// ---- 还没开局 ----
const r0 = await runCalls(E, null, [call("roll")]);
ok(r0.calls[0].err && r0.calls[0].out === "还没开局：先调 new_game 开一局。" && r0.state === null && r0.board === null && r0.calls[0].card.length === 0, "还没开局就掷骰子：告诉他先开局，没有卡片，棋盘还是空的");

// ---- 开局 ----
const r1 = await runCalls(E, null, [call("new_game", { humanIdentityMode: "select", humanIdentityId: "imperial", aiIdentityMode: "random" })]);
const st1 = r1.state;
const aiId = st1.players.ai.identity;
ok(!r1.calls[0].err && st1.players.human.name === HER && st1.players.ai.name === HIM && st1.players.human.identity.id === "imperial", "开局：她叫卿卿、他叫小晋；她自选的帝室成员");
ok(r1.calls[0].out.includes(`〔只给你看〕你的身份：${aiId.name}`) && /〔引擎〕status=(active|setup)｜currentPlayer=human$/.test(r1.calls[0].out), "引擎回的字后面：只给他看的他自己的身份，最后一行状态");
ok(r1.calls[0].card.length === 1 && r1.calls[0].card[0] === "〔局〕开局 · 卿卿选了帝室成员（亲王/长公主）" && !r1.calls[0].card.join("").includes(aiId.name === st1.players.human.identity.name ? "@@" : aiId.name), `开局的卡片只写她的身份，不写他的（${r1.calls[0].card[0]}）`);
ok(r1.board && r1.board.ch === "第一章：中原风起" && r1.board.her.join() === "1,45" && r1.board.him.join() === "1,45" && r1.board.turn === "human" && r1.board.got === 0 && r1.board.all === 36, "开局以后的棋盘：第一章，两人都在第1格、45两，轮到她");
ok(stripLines(r1.board).join("|") === "第一章 · 中原风起|卿卿 第1格 45两 ｜ 小晋 第1格 45两" && nanyaSub(r1.board) === "第一章 · 第1格" && nanyaSub(null) === "还没开局", "顶上那条两行、南衙那一行的小字");
ok(nowLine(r1.board).startsWith("【棋盘】第一章：中原风起；卿卿第1格、45两；小晋第1格、45两；轮到卿卿") && nowLine(null).startsWith("【棋盘】还没开局") && nowLine(r1.board, true).includes("正在打电话"), "【此刻】里那一行：棋盘眼下的样子；打电话的时候添一句不下棋");

// 他的身份要伪装（千岁仙人这种）：先挑伪装
let st = st1;
let board = r1.board;
async function step(name, input = {}) {
  const r = await runCalls(E, st, [call(name, input)]);
  if (!r.calls[0].err) {
    st = r.state;
    board = r.board;
  }
  return r;
}
if (st.status === "setup") {
  const r = await step("game_action", { action: "choose_disguise", player: "ai", disguiseIdentityId: "fortune_teller" });
  ok(!r.calls[0].err && r.calls[0].card.length === 0, "他要先挑伪装：一张卡片都不摆（只有千岁仙人要挑，摆一张就露了）");
} else ok(true, "他的身份不用伪装（这一回随到的不是特殊身份）");

// ---- 掷骰子 ----
const before = JSON.stringify(st);
const r2 = await step("roll");
ok(JSON.stringify(r1.state) === JSON.stringify(st1), "调引擎不改递进去的那一份（存档是拷进去的）");
const c2 = r2.calls[0];
const die = /掷出了 (\d+) 点/.exec(c2.out);
const pos = st.players.human.position;
ok(!c2.err && die && c2.card[0].startsWith(`〔骰〕卿卿掷出 ${die[1]} 点`) && c2.card[0].includes(`第${pos}格【${ch1.cells[pos - 1].title}】`), `掷骰子：卡片写掷了几点、走到第几格哪一格（${c2.card[0]}）`);
ok(JSON.parse(before).players.human.position === 1 && board.her[0] === pos, "棋盘跟着走了");

// 不在商店里买东西：出岔子，存档不动
const r3 = await runCalls(E, st, [call("game_action", { action: "buy", optionId: "nothing" })]);
ok(r3.calls[0].err && r3.calls[0].out.startsWith("行动失败：") && JSON.stringify(r3.state) === JSON.stringify(st) && r3.calls[0].card.length === 0, `出岔子的那一下不算数：存档原样，没有卡片（${r3.calls[0].out.slice(0, 40)}）`);
const r4 = await runCalls(E, st, [call("game_info", { view: "collection" }), call("game_info", { view: "map" })]);
ok(!r4.calls[0].err && !r4.calls[1].err && r4.calls[1].out.startsWith("第一章：中原风起\n1. [landmark] 洛阳城门") && r4.calls.every((c) => c.card.length === 0), "查看（拾遗录、地图）：照引擎回的字，没有卡片");
const r5 = await runCalls(E, null, [call("roll"), call("new_game", { humanIdentityMode: "random", aiIdentityMode: "random" }), call("game_info", {})]);
ok(r5.calls[0].err && !r5.calls[1].err && !r5.calls[2].err && r5.state && r5.calls[2].out.includes("第一章"), "一步里调好几样：一样一样来，后一样接着前一样的存档（先掷骰子没开局出错，开了局再看棋盘）");

// ---- 自动走完三章：每一步的卡片、棋盘都对得上 ----
async function autoplay() {
  let s = null;
  let b = null;
  const cards = [];
  const run = async (name, input) => {
    const r = await runCalls(E, s, [call(name, input)]);
    if (r.calls[0].err) throw new Error(r.calls[0].out);
    s = r.state;
    b = r.board;
    cards.push(...r.calls[0].card);
    return r;
  };
  await run("new_game", { humanIdentityMode: "random", aiIdentityMode: "random" });
  const aiName = s.players.ai.identity.name;
  const herName = s.players.human.identity.name;
  let guard = 0;
  const chapters = [s.chapterId];
  while (guard++ < 2000) {
    if (s.status === "setup") await run("game_action", { action: "choose_disguise", player: s.setupPendingDisguises[0], disguiseIdentityId: "merchant" });
    else if (s.status === "active") await run("roll", {});
    else if (s.status === "awaiting_scene") await run("game_action", { action: "complete_scene" });
    else if (s.status === "awaiting_shop") {
      // 有钱就买第一样买得起的东西，然后离开
      const cell = (await E.loadChapter(s.chapterId)).cells.find((c) => c.position === s.pendingShop.cellPosition);
      const p = s.players[s.pendingShop.player];
      const opt = (cell.options || []).find((o) => o.kind === "item" && o.cost <= p.money);
      if (opt && !p.inventory.some((e) => e.itemId === opt.item_id)) {
        const r = await runCalls(E, s, [call("game_action", { action: "buy", optionId: opt.id })]);
        if (!r.calls[0].err) {
          s = r.state;
          cards.push(...r.calls[0].card);
        }
      }
      await run("game_action", { action: "buy", optionId: "leave" });
    } else if (s.status === "awaiting_pass_shop") await run("game_action", { action: "continue_move" });
    else if (s.status === "awaiting_roll_choice") await run("game_action", { action: "accept_roll" });
    else if (s.status === "chapter_complete") {
      if (s.chapterId === "jiangnan") break;
      await run("game_action", { action: "start_next_chapter" });
      chapters.push(s.chapterId);
    } else throw new Error("没见过的状态 " + s.status);
    const chName = (await E.loadChapter(s.chapterId)).name;
    if (b.ch !== chName || b.her[0] !== s.players.human.position || b.him[1] !== s.players.ai.money) throw new Error("棋盘和存档对不上");
  }
  return { chapters, done: s.status === "chapter_complete" && s.chapterId === "jiangnan", cards, aiName, herName, steps: guard };
}
let three = 0;
let leak = [];
let shapes = new Set();
let sampleCards = [];
for (let i = 0; i < 4; i++) {
  const g = await autoplay();
  if (g.done && g.chapters.join() === "zhongyuan,saibei,jiangnan") three++;
  if (g.aiName !== g.herName && g.cards.some((c) => c.includes(g.aiName))) leak.push(g.aiName);
  if (g.cards.some((c) => c.startsWith("〔身〕" + HIM))) leak.push("他挑伪装的那一张");
  g.cards.forEach((c) => shapes.add(c.slice(0, 3)));
  if (i === 0) sampleCards = g.cards.slice(0, 8);
}
ok(three === 4, `自动走了四局，四局都走完三章（中原、塞北、江南）`);
ok(!leak.length, `一路的卡片里没漏过他的身份${leak.length ? "：" + leak.join("、") : ""}`);
ok(["〔局〕", "〔骰〕", "〔银〕", "〔章〕"].every((k) => shapes.has(k)), `卡片的几种都出现过（${[...shapes].join(" ")}）\n  ${sampleCards.join("\n  ")}`);

// ---- 骰子照他调的那一样的编号掷（两台设备各调一遍、一台设备上两条路各到一回，掷得一样） ----
const rngA = seededRng("toolu_01ABC");
const rngB = seededRng("toolu_01ABC");
const seqA = Array.from({ length: 50 }, () => rngA(1, 7));
const seqB = Array.from({ length: 50 }, () => rngB(1, 7));
const seqC = Array.from({ length: 50 }, ((r) => () => r(1, 7))(seededRng("toolu_01ABD")));
ok(seqA.join() === seqB.join() && seqA.join() !== seqC.join() && seqA.every((x) => x >= 1 && x <= 6 && Number.isInteger(x)), "同一个编号掷出来一样，差一个字就不一样；点数都在 1 到 6");
const hist = [0, 0, 0, 0, 0, 0];
for (let i = 0; i < 600; i++) hist[seededRng("toolu_" + i)(1, 7) - 1]++;
ok(hist.every((n) => n > 70 && n < 130), `六百个不同编号的头一掷，六个点数都差不多（${hist.join("/")}）`);
// 刚开的一局（两边都自选，不用挑伪装）：轮到她掷
const fresh = (await runCalls(E, null, [call("new_game", { humanIdentityMode: "select", humanIdentityId: "merchant", aiIdentityMode: "select", aiIdentityId: "escort" })])).state;
const same = call("roll");
const twiceA = await runCalls(E, fresh, [same]);
const twiceB = await runCalls(E, fresh, [same]);
const noLog = (x) => JSON.stringify({ ...x, log: [] });
ok(!twiceA.calls[0].err && twiceA.calls[0].out === twiceB.calls[0].out && twiceA.calls[0].card.join() === twiceB.calls[0].card.join() && JSON.stringify(twiceA.board) === JSON.stringify(twiceB.board) && noLog(twiceA.state) === noLog(twiceB.state),
  `同一步调两遍：引擎回的字、卡片、棋盘、存档（日志里的钟点除外）都一样（${twiceA.calls[0].card[0]}）`);
let differ = 0;
for (let i = 0; i < 12; i++) if ((await runCalls(E, fresh, [call("roll")])).calls[0].out !== twiceA.calls[0].out) differ++;
ok(differ >= 6, `换一个编号（重新回答就是新的一回）：骰子照样重掷（十二回里 ${differ} 回跟上面不一样）`);
const open1 = call("new_game", { humanIdentityMode: "random", aiIdentityMode: "random" });
const g1 = await runCalls(E, null, [open1]);
const g2 = await runCalls(E, null, [open1]);
ok(/^jh[0-9a-f]{10}$/.test(g1.state.sessionId) && g1.state.sessionId === g2.state.sessionId && g1.state.players.ai.identity.id === g2.state.players.ai.identity.id && g1.state.sessionId !== r1.state.sessionId,
  `开局：一局的编号、两边的身份也照那一样的编号定（${g1.state.sessionId}），不靠手机自带的 randomUUID`);

// 两步同时调（两段对话各到了一封）：排着队一个一个来，谁也不盖谁
const twin = await Promise.all([runCalls(E, st, [call("game_info", { view: "state" })]), runCalls(E, g1.state, [call("game_info", { view: "state" })]), runCalls(E, fresh, [call("roll")])]);
ok(twin[0].state.sessionId === st.sessionId && twin[1].state.sessionId === g1.state.sessionId && twin[2].state.sessionId === fresh.sessionId && !twin.some((r) => r.calls[0].err) && twin[1].calls[0].out.includes(g1.state.sessionId),
  "两步同时调：各下各的那一局（引擎的存档只有一格，不排队会把对方那一局盖掉）");

// 同一段对话里又开了一局：卡片只写开局，不拿上一局去比
const again = await runCalls(E, st, [call("new_game", { humanIdentityMode: "select", humanIdentityId: "imperial", aiIdentityMode: "random" })]);
ok(!again.calls[0].err && again.calls[0].card.join("|") === "〔局〕开局 · 卿卿选了帝室成员（亲王/长公主）" && again.board.her.join() === "1,45",
  `又开了一局：卡片只有开局那一行（${again.calls[0].card.join("|")}）`);

// 他自己的身份：只进【此刻】给他看，顶上那条、南衙都不摆
let immortal = null;
for (let i = 0; i < 400 && !immortal; i++) {
  const r = await runCalls(E, null, [{ id: "toolu_imm" + i, name: "new_game", input: { humanIdentityMode: "select", humanIdentityId: "imperial", aiIdentityMode: "random" } }]);
  if (r.state.players.ai.identity.id === "immortal") immortal = r;
}
ok(!!immortal && immortal.state.status === "setup" && immortal.board.me === "千岁仙人", "随到千岁仙人（要先挑伪装）：棋盘上记着他的身份");
const masked = await runCalls(E, immortal.state, [call("game_action", { action: "choose_disguise", player: "ai", disguiseIdentityId: "merchant" })]);
const merchant = ids.find((x) => x.id === "merchant").name;
ok(!masked.calls[0].err && masked.calls[0].card.length === 0 && masked.board.me === `千岁仙人，伪装成${merchant}`, `他挑了伪装：没有卡片，棋盘上记着“千岁仙人，伪装成${merchant}”`);
const line = nowLine(masked.board);
ok(line.includes(`你在这一局里的身份：千岁仙人，伪装成${merchant}`) && !stripLines(masked.board).join("").includes("千岁") && !nanyaSub(masked.board).includes("千岁") && !nowLine(r1.board).includes("千岁仙人，"),
  "【此刻】里那一行带着他的身份（只写给他看）；顶上那条、南衙那一行都不带");

// ---- 名字：开局时她起的，不起照默认（卿卿 10 月 16 日要的） ----
const named = await runCalls(E, null, [call("new_game", { humanName: "  阿卿 ", aiName: "晋哥", humanIdentityMode: "select", humanIdentityId: "merchant", aiIdentityMode: "select", aiIdentityId: "escort" })]);
ok(named.state.players.human.name === "阿卿" && named.state.players.ai.name === "晋哥" && String(named.board.names) === "阿卿,晋哥" && named.calls[0].card[0] === "〔局〕开局 · 阿卿选了商贾",
  "开局时起了名字：引擎里、棋盘上、卡片上都是这一局的名字");
ok(stripLines(named.board)[1] === "阿卿 第1格 45两 ｜ 晋哥 第1格 45两" && nowLine(named.board).startsWith("【棋盘】第一章：中原风起；阿卿第1格、45两；晋哥第1格、45两；轮到阿卿"), "顶上那条、【此刻】那一行也照这一局的名字写");
const namedRoll = await runCalls(E, named.state, [call("roll")]);
ok(!namedRoll.calls[0].err && namedRoll.calls[0].card[0].startsWith("〔骰〕阿卿掷出"), `掷骰子的卡片也是（${namedRoll.calls[0].card[0]}）`);
const half = await runCalls(E, null, [call("new_game", { aiName: "晋哥", humanIdentityMode: "random", aiIdentityMode: "random" })]);
ok(String(half.board.names) === "卿卿,晋哥" && String(r1.board.names) === "卿卿,小晋" && namesOf({ ch: "x" }).join() === "卿卿,小晋", "只起了一个：另一个照默认；什么都没起：卿卿、小晋；老存档里没记名字的也照默认");

// ---- 在平常对话里摆开棋盘、收棋（卿卿 10 月 16 日要的） ----
const onSet = readOn(JSON.stringify(["mgplain", 3, "", null]));
ok(ON_KEY === "kfs2:jhon" && onSet.size === 1 && onSet.has("mgplain") && readOn("坏了").size === 0 && readOn(null).size === 0, "摆着棋盘的那份单子：只认对话编号，读不出来当空的");
ok(gameOn("jhabc", null) && gameOn("jhabc", new Set()) && gameOn("mgplain", onSet) && !gameOn("mgother", onSet) && !gameOn("", onSet), "摆没摆着棋盘：专门下棋的那种一直摆着，平常对话看单子");
ok(hasSteps([{ role: "her" }, { role: "him", calls: [{ id: "x" }] }]) && !hasSteps([{ role: "him", calls: [] }, { role: "her", calls: [{ id: "x" }] }]) && !hasSteps(null), "对话里他调过引擎没有");
ok(GAME_SECTION === gameSection(false) && gameSection(true) !== GAME_SECTION && gameSection(true).includes("这段对话原来是你们平常聊天，她在这里摆开了《江湖棋局》") && gameSection(true).includes("她收棋以后") && gameSection(true).endsWith(HOST_RULES) && !GAME_SECTION.includes("平常聊天"),
  "平常对话里摆开的：【江湖棋局】那一段开头换个说法、多一条收棋的，后面照样跟着主持规矩；专门下棋的那一段不变");

// ---- 寄回去的样子 ----
const m = { id: "m1", role: "him", raw: "我替你扔。", calls: [{ id: "toolu_a", name: "roll", input: {}, out: "卿卿掷出了 3 点。", card: ["〔骰〕卿卿掷出 3 点"] }, { id: "toolu_b", name: "game_info", input: { view: "state" } }], stop: "tool_use" };
const { uses, results } = apiBlocks(m);
ok(uses.length === 2 && uses[0].type === "tool_use" && uses[0].id === "toolu_a" && uses[0].name === "roll" && JSON.stringify(uses[0].input) === "{}", "他那一条后面跟着 tool_use（照原样的 id、名字、参数）");
ok(results[0].type === "tool_result" && results[0].tool_use_id === "toolu_a" && results[0].content === "卿卿掷出了 3 点。" && !results[0].is_error && results[1].is_error && results[1].content.includes("没来得及"), "下一句最前面是 tool_result；没调成的那一样也得有一个（写明没结果，标成出错），不然那边不认");
ok(callsOf([{ type: "text", text: "嗯" }, { type: "tool_use", id: "toolu_x", name: "roll", input: {} }, { type: "mcp_tool_use", id: "x", name: "search" }, { type: "tool_use", id: "toolu_y", name: "rm_rf", input: {} }]).map((c) => c.id).join() === "toolu_x", "回话里只认这四样工具（MCP 的、没见过的不归这里）");
ok(midTurn(m) && !midTurn({ ...m, stop: "end_turn" }) && !midTurn({ role: "him", stop: "tool_use" }) && needsRun(m) && !needsRun({ ...m, calls: [m.calls[0]] }), "说到一半的那一步、还有没调的");
const h = (id) => ({ id, role: "her", text: "x" });
const chat = [h("a"), { ...m, board: { ch: "x" } }, { id: "m2", role: "him", raw: "好" }, h("b"), { id: "m3", role: "him", calls: [m.calls[0]], board: null, alts: [{ node: { id: "m3", role: "him" } }, { node: { id: "m4", role: "him", calls: [m.calls[0]] }, after: [{ id: "m5", role: "him", calls: [m.calls[0]] }] }] }];
ok(lastStep(chat).id === "m3" && lastStep(chat.slice(0, 3)).id === "m1" && lastStep([h("a")]) === null, "眼前这一支里最后一步下过棋的（棋盘就是它之后的样子）");
ok(collectStepIds(chat).sort().join() === "m1,m3,m4,m5", "删对话时连同翻过去的那些版本里下过棋的一起找出来");
ok(stepLines(m).join("|") === "[棋局] 卿卿掷出 3 点" && SNAP_KEY === "kfs2:jhs:", "前情提要的记录里，一步写成“[棋局] …”");

// ---- 对话上的几样手艺（thread.js）：说到一半的那一步 ----
const her1 = { id: "h1", role: "her", ts: 1, text: "帮我扔" };
const stepA = { id: "s1", role: "him", ts: 2, raw: "我替你扔。", items: [{ type: "text", text: "我替你扔。" }], calls: [{ id: "toolu_1", name: "roll", input: {}, out: "卿卿掷出了 3 点。", card: ["〔骰〕卿卿掷出 3 点 → 第4格【洛阳西市】"] }], stop: "tool_use", board: { ch: "第一章：中原风起", her: [4, 45], him: [1, 45], turn: "ai", status: "active", got: 0, all: 36 } };
const doneA = { id: "s2", role: "him", ts: 3, raw: "西市到了。", items: [{ type: "text", text: "西市到了。" }] };
const ev = { id: "e1", role: "event", ts: 4, who: "her", av: null };
ok(needsReply([her1]) && needsReply([her1, stepA]) && needsReply([her1, stepA, ev]) && !needsReply([her1, stepA, doneA]) && !needsReply([her1, { ...stepA, stop: undefined }]), "欠不欠回复：最后是她的话、或者他说到一半的那一步，都算欠着；他说完了不欠");
const halted = markStopped([her1, stepA]);
ok(halted[1].stopped && stoppedAt(halted) === "s1" && needsReply(halted) && unmarkStopped(halted)[1].stopped === undefined, "按停记在说到一半的那一步上（底下摆“停了”，欠着的后半截不自己接）；点了那一行擦掉");
const finished = [her1, stepA, doneA];
ok(markStopped(finished) === finished, "他说完了的不记“停了”");
ok(mailBefore([her1, stepA, doneA], { last: "s1" }).map((m) => m.id).join() === "h1,s1" && mailBefore([her1, stepA, doneA], { last: "s1", fork: "s2" }).map((m) => m.id).join() === "h1,s1", "信箱里取出来的那一封放进去以后，前面是哪几条（平常的、重新回答的）");

// ---- 寄过去的样子（prompt/messages.js、system.js、recap.js） ----
const silent = { id: "s3", role: "him", ts: 5, raw: "", items: [], calls: [{ id: "toolu_2", name: "game_info", input: { view: "state" }, out: "棋盘……", card: [] }], stop: "tool_use", board: stepA.board };
const her2 = { id: "h2", role: "her", ts: 6, text: "然后呢" };
const built = buildMessages([her1, stepA, doneA, her2, silent], {}, () => null).messages;
const shape = built.map((m) => m.role + ":" + m.content.map((b) => b.type).join("+"));
ok(built[1].role === "assistant" && built[1].content.map((b) => b.type).join() === "text,tool_use" && built[2].content[0].type === "tool_result" && built[2].content[0].tool_use_id === "toolu_1",
  `他说到一半的那一步：他的字后面跟着 tool_use，下一句最前面是 tool_result（${shape.join(" ")}）`);
const lastA = built[built.length - 2];
const lastU = built[built.length - 1];
ok(lastA.role === "assistant" && lastA.content.map((b) => b.type).join() === "tool_use" && lastU.content.map((b) => b.type).join() === "tool_result", "一个字没说只调了引擎的那一步：寄回去只有 tool_use，不补“……”");
const merged = buildMessages([her1, stepA, her2], {}, () => null).messages;
ok(merged[2].role === "user" && merged[2].content[0].type === "tool_result" && merged[2].content[1].text === "然后呢", "她在他说到一半的时候插了一句：结果排在她那句前头（同一条里，tool_result 在最前面）");
const withNote = withNowNote(built, "【此刻】x", true, []);
const tailMsg = withNote[withNote.length - 1];
ok(tailMsg.content[0].type === "tool_result" && tailMsg.content[0].cache_control && tailMsg.content[tailMsg.content.length - 1].text === "【此刻】x", "【此刻】附在结果后面，缓存记号落在结果上");
const sysArgs = { now: new Date(2026, 9, 15, 22, 0), memeList: [], hisAvatarName: "", memDocs: [] };
const plain = buildSystem(sysArgs);
const gamed = buildSystem({ ...sysArgs, game: { board: stepA.board } });
ok(plain.staticText === buildSystem({ ...sysArgs, game: null }).staticText && !plain.staticText.includes("【江湖棋局】") && !plain.nowNote.includes("【棋盘】"), "不是棋局的对话：名帖、【此刻】一个字不变");
ok(gamed.staticText === plain.staticText.replace("【回复格式】", GAME_SECTION + "\n\n【回复格式】") && gamed.nowNote.includes("\n【棋盘】第一章：中原风起；卿卿第4格、45两；小晋第1格、45两；轮到小晋"), "棋局那一段：名帖里【回复格式】前面多一段【江湖棋局】，【此刻】里多一行棋盘");
const mixedSys = buildSystem({ ...sysArgs, game: { board: null, mixed: true } });
const offSys = buildSystem({ ...sysArgs, game: { off: true } });
ok(mixedSys.staticText === plain.staticText.replace("【回复格式】", gameSection(true) + "\n\n【回复格式】") && mixedSys.nowNote.includes("\n【棋盘】还没开局"), "平常对话里摆开的：名帖里多的是换了说法的那一段，【此刻】里照样一行棋盘");
ok(offSys.staticText === plain.staticText && offSys.nowNote.includes("\n" + OFF_LINE) && !offSys.nowNote.includes("还没开局"), "收了棋的：名帖跟平常一样，【此刻】里写一句收起来了");
const ask = buildRecapAsk({ msgs: [her1, stepA, doneA, silent], memeLookup: () => null });
const asked = ask.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
ok(asked.includes("光义：我替你扔。\n[棋局] 卿卿掷出 3 点 → 第4格【洛阳西市】") && !/光义：……/.test(asked), "叫他抄提要的记录里：一步写成他的话加“[棋局] …”，只调不说的那一步不写“……”");
ok(thick(stepA) > thick({ ...stepA, calls: [] }) && askThick(stepA) > askThick({ ...stepA, calls: [] }), "一条多厚：下棋的那几样也算（寄的结果、记录里的卡片）");
ok(dayTranscript([her1, stepA, doneA, silent], () => null).split("\n").join("|") === "卿卿：帮我扔|光义：我替你扔。 [棋局] 卿卿掷出 3 点 → 第4格【洛阳西市】|光义：西市到了。", "写日记用的聊天摘录：下棋的那一步写成“[棋局] …”，只调不说的那一步不写");
ok(makePreview([her1, silent]) === "[棋局]" && makePreview([her1, { ...silent, calls: [{ ...silent.calls[0], card: ["〔骰〕卿卿掷出 2 点"] }] }]) === "[棋局] 卿卿掷出 2 点", "历史对话的预览：最后是只调不说的那一步，写“[棋局]”");

// ---- 聊天里摆的（chat/rows.js） ----
const rows = buildRows([her1, stepA, doneA], null, "", null, "");
ok(rows.filter((r) => r.type === "game").map((r) => r.text).join() === "〔骰〕卿卿掷出 3 点 → 第4格【洛阳西市】" && rows.findIndex((r) => r.type === "game") > rows.findIndex((r) => r.key === "s1-0"), "卡片摆在他那一步的话后面");
ok(!buildRows([her1, stepA], { id: "s1", count: 0 }, "", null, "").some((r) => r.type === "game"), "那一步正一条一条蹦的时候不摆卡片，蹦完才冒");
ok(buildRows([her1, { ...stepA, stopped: true }], null, "s1", null, "").some((r) => r.type === "stopped" && r.msg.id === "s1") && buildRows([her1, stepA], null, "", null, "s1").some((r) => r.type === "more"), "说到一半的那一步：停了的摆“停了”，没人接着要的摆“还没说完”");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
