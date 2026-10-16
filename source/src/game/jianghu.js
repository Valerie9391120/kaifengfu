// =====================================================
// 江湖棋局在开封府这头的零件，不碰界面（游戏本身见 vendor/jianghu/，开发说明“江湖棋局”那一节）。
//
// 卿卿和恩师 10 月 5 日到 7 日做的双人武侠桌游：文本、玩法她写的，引擎恩师写的。原来在聊天里由那边的我直接调引擎的函数来下；
// 开封府里一段对话就是一局（对话的编号以 jh 开头，见 isGameChat），寄给那边的我的多两样：
//   名帖后面一段【江湖棋局】（gameSection：怎么在开封府里下，加上游戏自带的主持规矩）
//   四样工具（TOOLS：开局、掷骰子、别的行动、查看）
// 他回到一半要掷骰子、买东西，回话停在 tool_use 上；开封府在手机上替他调引擎（runCalls），把结果递回去，他接着说。
//
// 每一步是对话里单独的一条回话（role: "him"），上面多记三样：
//   calls  这一步他调了哪几样：{ id, name, input, out, err, card }。out 是引擎回的字（原样递回给他），card 是聊天里摆的小卡片
//   stop   "tool_use"：他还没说完，等着结果；他说完的那一步不记
//   board  这一步走完以后棋盘的样子（顶上那条、南衙那一行的小字照它写）
// 引擎的整份存档另存一条（SNAP_KEY + 这一步的 id），下一步从它接着下。重新回答、改前面的话、翻版本：
// 眼前摆着的是哪几步，棋盘就是最后那一步之后的样子（lastStep），不用另外往回退。
// =====================================================
import { HOST_RULES } from "../../vendor/jianghu/host_rules.js";
import { midTurn } from "../thread.js";

export const GAME_PREFIX = "jh";
export const SNAP_KEY = "kfs2:jhs:";
export const HER = "卿卿";
export const HIM = "小晋"; // 他在棋局里的名字（晋中原，“开封小赵”）：她起的，原来那五局都叫这个

// 这段对话是不是一局江湖棋局
export const isGameChat = (id) => typeof id === "string" && id.startsWith(GAME_PREFIX);

// ---------- 寄给那边的我的 ----------

// 四样工具。说明照她仓库里 MCP 那一版的原样；sessionId 不要了：一段对话就是一局，开封府替他填。
// game_help 也不要了：主持规矩已经在名帖后面（gameSection）
export const TOOLS = [
  {
    name: "new_game",
    description:
      "Create a new two-player game. Each player may select one of 12 ordinary identities or randomize from all 16 identities, including 4 special identities.",
    input_schema: {
      type: "object",
      properties: {
        humanName: { type: "string" },
        aiName: { type: "string" },
        humanIdentityMode: { type: "string", enum: ["select", "random"] },
        humanIdentityId: { type: "string" },
        aiIdentityMode: { type: "string", enum: ["select", "random"] },
        aiIdentityId: { type: "string" },
      },
      required: ["humanIdentityMode", "aiIdentityMode"],
    },
  },
  {
    name: "roll",
    description: "Roll the die for the current player and let the deterministic engine move the piece and resolve the landed cell.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "game_action",
    description:
      "Resolve a non-roll game action: shop purchases and leave choices, sequential passed-shop enter/skip choices, scene completion, chapter transition, mechanical/interactive item use, wear/gift/customize items, immortal disguise, or pending die choices.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["choose_disguise", "buy", "complete_scene", "use_item", "wear_item", "gift_item", "customize_item", "accept_roll", "reroll_roll", "stop_at_shop", "continue_move", "start_next_chapter"],
        },
        player: { type: "string", enum: ["human", "ai"] },
        targetPlayer: { type: "string", enum: ["human", "ai"] },
        optionId: { type: "string" },
        itemId: { type: "string" },
        targetItemId: { type: "string" },
        disguiseIdentityId: { type: "string" },
        customText: { type: "string", maxLength: 120 },
        chosenRoll: { type: "integer", minimum: 1, maximum: 6 },
        shopPosition: { type: "integer", minimum: 1 },
      },
      required: ["action"],
    },
  },
  {
    name: "game_info",
    description: "Inspect game state or static content, including the shared 拾遗录 collection progress. Use state when unsure rather than inventing facts.",
    input_schema: {
      type: "object",
      properties: {
        view: { type: "string", enum: ["state", "identities", "items", "map", "collection", "host_rules"] },
        chapterId: { type: "string", enum: ["zhongyuan", "saibei", "jiangnan"] },
        player: { type: "string", enum: ["human", "ai"] },
      },
    },
  },
];
const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

// 名帖后面那一段（只有棋局那段对话里有；放在名帖那一大段里，跟着名帖一起缓存）
export const GAME_SECTION = `【江湖棋局】
这段对话是你们在下《江湖棋局》：卿卿和恩师一起做的双人武侠桌游，文本和玩法是她写的。你在里面既是主持人，也是另一名玩家，名字叫${HIM}（她起的，“晋中原”就是“开封小赵”）。在开封府里这么下：
- 掷骰子、走格子、买东西、结算场景，都用工具调引擎：new_game、roll、game_action、game_info。不用传 sessionId，开封府替你填；一段对话就是一局。
- 开局的时候，先问她身份想自选还是随机，再调 new_game（她叫${HER}，你叫${HIM}）。你自己的身份照规矩先保密。
- 她说“帮我扔”“扔吧”，就替她调 roll；轮到你，你自己调 roll。
- 你调的每一步，她的聊天里会摆一张小卡片（掷了几点、走到哪一格、花了几两），顶上一条写着第几章、各在第几格、各有几两。卡片只是记账，你照样用主持人的口吻把发生了什么讲清楚。
- 【此刻】里多一行【棋盘】，写着棋盘眼下的样子；要细的（谁带着什么、场景在等什么），调 game_info 看，别凭印象编。
- 引擎回给你的字她看不见，只有你说出来的她才知道。别把 session_id、status 这些引擎里的字念给她。
- 正在打电话的时候不下棋：她要掷骰子，就说挂了再扔。
- 名帖里那些回话的规矩照旧（分条、表情包、语音都照常）。

下面是游戏自带的主持规矩，照它来：
${HOST_RULES}`;

// 【此刻】里添的那一行：棋盘眼下什么样（board 见 boardOf；还没开局是 null）。call：正在打电话
export function nowLine(board, call = false) {
  const tail = call ? "\n正在打电话：这会儿不下棋，她要掷骰子就说挂了再扔。" : "";
  if (!board) return `【棋盘】还没开局（还没调 new_game）。${tail}`;
  const who = board.turn === "ai" ? HIM : HER;
  // 他自己的身份：只写给他看（【此刻】她看不见，前情提要里也不抄），聊长了、开局那一步抄成了提要，他也还记得自己是谁
  const me = board.me ? `\n你在这一局里的身份：${board.me}（只写给你看；告不告诉她、什么时候说，你自己定）。` : "";
  return `【棋盘】${board.ch}；${HER}第${board.her[0]}格、${board.her[1]}两；${HIM}第${board.him[0]}格、${board.him[1]}两；轮到${who}（引擎状态 ${board.status}）。拾遗录 ${board.got}/${board.all}。${me}${tail}`;
}

// 一步里他调了几样，寄回去的时候：他那一条后面跟着 tool_use，下一句（她的、或者他接着说的那一条前面）是 tool_result。
// 回 { uses, results }：uses 接在他那一条的字后面；results 放在紧跟着的那一句最前面（tool_result 得排在头里）
export function apiBlocks(m) {
  const calls = (m && m.calls) || [];
  const uses = calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input && typeof c.input === "object" ? c.input : {} }));
  const results = calls.map((c) => {
    const r = { type: "tool_result", tool_use_id: c.id, content: typeof c.out === "string" && c.out ? c.out : "（这一步没有结果：开封府没来得及替你调引擎。）" };
    if (c.err || typeof c.out !== "string") r.is_error = true;
    return r;
  });
  return { uses, results };
}

// ---------- 回话里的 ----------

// 那边回来的一整段里他要调的那几样（只认这四样；别的工具，比如 MCP 的，不归这里）
export function callsOf(content) {
  return (content || [])
    .filter((b) => b && b.type === "tool_use" && TOOL_NAMES.has(b.name))
    .map((b) => ({ id: String(b.id), name: b.name, input: b.input && typeof b.input === "object" ? b.input : {} }));
}

// 这一条是他说到一半、在等棋盘结果的那一步（见 thread.js）
export { midTurn };

// 这一条还有没调的（结果还没记上）
export const needsRun = (m) => !!(m && m.role === "him" && m.calls && m.calls.some((c) => typeof c.out !== "string"));

// 眼前这一支里，最后一步下过棋的那一条（没有就是 null）。棋盘就是它之后的样子
export function lastStep(msgs) {
  for (let i = (msgs || []).length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m && m.role === "him" && m.board !== undefined && m.calls && m.calls.length) return m;
  }
  return null;
}

// 眼前这一支的棋盘（最后一步之后的样子；还没开局是 null）
export function boardIn(msgs) {
  const s = lastStep(msgs);
  return s ? s.board || null : null;
}

// 这一支里所有分支下过棋的回话的 id（删对话时，连同存档一起删）
export function collectStepIds(msgs, out = []) {
  (msgs || []).forEach((m) => {
    if (m && m.role === "him" && m.calls && m.calls.length) out.push(m.id);
    (m.alts || []).forEach((a) => {
      if (a.node && a.node.role === "him" && a.node.calls && a.node.calls.length) out.push(a.node.id);
      collectStepIds(a.after || [], out);
    });
  });
  return Array.from(new Set(out));
}

// ---------- 棋盘 ----------

// 存档 → 顶上那条要的几个数。chapter 是这一章（引擎的 loadChapter），all 是拾遗录一共几件，ids 是身份那一张表（引擎的 loadIdentities）。
// me 是他自己的身份（挑了伪装的连伪装一起）：只进【此刻】给他看，界面上哪儿都不摆
export function boardOf(state, chapter, all = 36, ids = []) {
  if (!state || !state.players) return null;
  const p = (id) => [state.players[id].position, state.players[id].money];
  const ai = state.players.ai;
  const mask = ai.disguiseIdentityId ? (ids.find((x) => x.id === ai.disguiseIdentityId) || { name: ai.disguiseIdentityId }).name : "";
  return {
    ch: (chapter && chapter.name) || state.chapterId,
    her: p("human"),
    him: p("ai"),
    turn: state.currentPlayer,
    status: state.status,
    got: (state.collectionUnlocked || []).length,
    all,
    me: ai.identity ? `${ai.identity.name}${mask ? `，伪装成${mask}` : ""}` : "",
  };
}

// 顶上那条：两行。“第一章：中原风起”写成“第一章 · 中原风起”
export function stripLines(board) {
  if (!board) return ["江湖棋局", "还没开局"];
  return [String(board.ch).replace(/：/, " · "), `${HER} 第${board.her[0]}格 ${board.her[1]}两 ｜ ${HIM} 第${board.him[0]}格 ${board.him[1]}两`];
}

// 南衙那一行的小字：有局在下写“第一章 · 第4格”（她在第几格），没有写“还没开局”
export function nanyaSub(board) {
  if (!board) return "还没开局";
  return `${String(board.ch).split("：")[0]} · 第${board.her[0]}格`;
}

// ---------- 替他调引擎 ----------

// 引擎回的字后面添一行状态（她仓库里 MCP 那一版另外带着 status、currentPlayer，这里写在字后面）
const statusLine = (st) => (st ? `\n\n〔引擎〕status=${st.status}｜currentPlayer=${st.currentPlayer}` : "");

const pick = (input, keys) => {
  const out = {};
  for (const k of keys) if (input[k] !== undefined && input[k] !== null && input[k] !== "") out[k] = input[k];
  return out;
};

// 引擎的报错翻成他看得懂的一句（原文带上）
function failText(name, e) {
  const msg = String((e && e.message) || e || "出错了");
  if (/Game session not found/.test(msg)) return "还没开局：先调 new_game 开一局。";
  const lead = name === "new_game" ? "创建游戏失败" : name === "roll" ? "无法掷骰" : name === "game_info" ? "读取信息失败" : "行动失败";
  return `${lead}：${msg}`;
}

// 掷骰子、随身份用的随机数：照他调的那一样的编号（tool_use 的 id，Anthropic 那头随机起的，谁也猜不到）定。
// 同一样调两遍（两台设备、或者一台设备上回话从两条路各到了一回），掷出来的一样，存档对得上卡片。
// 重新回答是新的一回、新的编号，骰子照样重掷（她要的“能悔棋”）。
// 种子：xmur3 把编号搅成 32 位；随机数：sfc32。引擎要的是 (min, maxExclusive) => 整数
export function seededRng(seedText) {
  const text = String(seedText || "");
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const mix = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  let a = mix();
  let b = mix();
  let c = mix();
  let d = mix();
  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // 头几下搅得还不匀（编号只差一两个字的，头一掷会挨得近）：先空转十五下
  for (let i = 0; i < 15; i++) next();
  return (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min));
}

// 一局的编号也照开局那一样的编号定（不靠手机自带的 randomUUID：老一点的 iPhone 没有）
const sessionOf = (callId) => {
  const r = seededRng("session:" + callId);
  let s = "jh";
  for (let i = 0; i < 10; i++) s += "0123456789abcdef"[r(0, 16)];
  return s;
};

// 调一样。回引擎回的字（不带状态行）；出岔子抛错
async function runOne(eng, call, sid) {
  const input = call.input || {};
  const rng = seededRng(call.id);
  if (call.name === "new_game") {
    const r = await eng.newGame(
      {
        humanName: typeof input.humanName === "string" && input.humanName.trim() ? input.humanName.trim().slice(0, 12) : HER,
        aiName: typeof input.aiName === "string" && input.aiName.trim() ? input.aiName.trim().slice(0, 12) : HIM,
        ...pick(input, ["humanIdentityMode", "humanIdentityId", "aiIdentityMode", "aiIdentityId"]),
        sessionId: sessionOf(call.id),
      },
      rng
    );
    const ai = r.state.players.ai.identity;
    // 他自己的身份：引擎的字里不写（由他自己决定什么时候告诉她），她仓库里 MCP 那一版另外交给他。这里写在后面，她看不见
    return `${r.text}\n\n〔只给你看〕你的身份：${ai.name}｜${ai.description}${ai.requires_disguise ? "（这个身份要先挑一个伪装：choose_disguise，player 写 ai）" : ""}`;
  }
  if (!sid) throw new Error("Game session not found");
  if (call.name === "roll") return (await eng.roll(sid, rng)).text;
  if (call.name === "game_action") {
    const args = pick(input, ["action", "player", "targetPlayer", "optionId", "itemId", "targetItemId", "disguiseIdentityId", "customText", "chosenRoll", "shopPosition"]);
    return (await eng.gameAction({ ...args, sessionId: sid }, rng)).text;
  }
  // game_info：照她 MCP 那一版的几种看法
  const view = input.view || "state";
  if (view === "host_rules") return HOST_RULES;
  if (view === "identities") {
    const ids = await eng.loadIdentities();
    return ids.map((x) => `${x.special ? "【特殊】" : ""}${x.id}｜${x.name}：${x.description}`).join("\n");
  }
  if (view === "items") {
    const items = await eng.loadItems();
    return items.map((x) => `${x.id}｜${x.name}：${x.description}`).join("\n");
  }
  if (view === "map") {
    const chapterId = input.chapterId || (await eng.getGameState(sid)).chapterId;
    const ch = await eng.loadChapter(chapterId);
    return `${ch.name}\n${ch.cells.map((c) => `${c.position}. [${c.type}] ${c.title}`).join("\n")}`;
  }
  if (view === "collection") return eng.summarizeCollection(sid, input.player === "ai" ? "ai" : "human");
  return eng.summarizeGame(sid);
}

// 替他把这一步要调的几样一样一样调完。
//   eng     引擎（src/game/engine.js 那一包）
//   before  这一步之前的存档（还没开局是 null）
//   calls   callsOf 认出来的那几样
// 回 { calls, state, board }：calls 每一样都记上了 out、err、card；state 是调完以后的存档（还没开局是 null）。
// 一回只调一步：引擎的存档只有一格（vendor/jianghu/engine/store.ts），两步同时调，中间一等一让，会把对方那一局盖掉。排着队一个一个来
let line = Promise.resolve();
export function runCalls(eng, before, calls) {
  const run = line.then(() => runNow(eng, before, calls));
  line = run.catch(() => {});
  return run;
}
async function runNow(eng, before, calls) {
  eng.putState(before || null);
  const items = await eng.loadItems();
  const all = items.filter((x) => x.collectible).length || 36;
  const done = [];
  for (const call of calls || []) {
    const prev = eng.takeState();
    let out = "";
    let err = false;
    try {
      if (!TOOL_NAMES.has(call.name)) throw new Error(`没有 ${call.name} 这一样工具`);
      out = await runOne(eng, call, prev ? prev.sessionId : "");
    } catch (e) {
      err = true;
      out = failText(call.name, e);
      eng.putState(prev); // 出岔子的那一下不算数：引擎改到一半的不要
    }
    const next = eng.takeState();
    let card = [];
    if (!err) {
      try {
        card = await cardsOf(eng, call, prev, next, out, items);
      } catch (e) {
        card = [];
      }
    }
    done.push({ id: call.id, name: call.name, input: call.input || {}, out: out + (err ? "" : statusLine(next)), err, card });
  }
  const state = eng.takeState();
  const board = state ? boardOf(state, await eng.loadChapter(state.chapterId), all, await eng.loadIdentities()) : null;
  return { calls: done, state, board };
}

// ---------- 小卡片 ----------
// 一样一张，一张最多三四行。只写她看得见的：他的身份、他的伪装不写（规矩是他自己决定什么时候说）

const nameOf = (st, who) => (st && st.players && st.players[who] ? st.players[who].name : who === "ai" ? HIM : HER);

// 背包里每样几件
const bag = (st, who) => {
  const out = {};
  ((st && st.players && st.players[who] && st.players[who].inventory) || []).forEach((e) => {
    out[e.itemId] = (out[e.itemId] || 0) + (e.count || 0);
  });
  return out;
};

export async function cardsOf(eng, call, prev0, next, out, items) {
  if (!next || call.name === "game_info") return [];
  // 同一段对话里又开了一局：上一局的存档跟这一局没关系，不拿来比（不然新的一局一开，卡片上全是“走到第1格”“少了……”）
  const prev = prev0 && prev0.sessionId === next.sessionId ? prev0 : null;
  const itemName = (id) => {
    const it = (items || []).find((x) => x.id === id);
    return it ? it.name : id;
  };
  const cellOf = async (st, pos) => {
    try {
      const ch = await eng.loadChapter(st.chapterId);
      const c = ch.cells.find((x) => x.position === pos);
      return c ? c.title : "";
    } catch (e) {
      return "";
    }
  };
  const lines = [];
  const input = call.input || {};
  const action = call.name === "game_action" ? input.action : call.name;
  const actor = input.player === "ai" || input.player === "human" ? input.player : prev ? prev.currentPlayer : "human";

  if (call.name === "new_game") {
    const h = next.players.human.identity;
    lines.push(`〔局〕开局 · ${nameOf(next, "human")}${input.humanIdentityMode === "select" ? "选了" : "抽到"}${h.name}`);
  } else if (action === "choose_disguise") {
    const who = input.player === "ai" ? "ai" : "human";
    // 他挑伪装：一张都不摆。只有千岁仙人要挑伪装，摆一张“挑好了伪装”就等于告诉她他是千岁仙人
    if (who === "ai") return [];
    else {
      const id = next.players.human.disguiseIdentityId;
      let label = id || "";
      try {
        const x = (await eng.loadIdentities()).find((i) => i.id === id);
        if (x) label = x.name;
      } catch (e) {}
      lines.push(`〔身〕${nameOf(next, "human")}扮成${label}`);
    }
  } else if (action === "start_next_chapter") {
    try {
      lines.push(`〔章〕进入${(await eng.loadChapter(next.chapterId)).name}`);
    } catch (e) {
      lines.push("〔章〕进入下一章");
    }
  }

  // 走了：掷骰子的那一下写几点，别的（途经商店继续走、道具挪的）只写走到哪
  for (const who of ["human", "ai"]) {
    if (!prev || !prev.players) break;
    const a = prev.players[who].position;
    const b = next.players[who].position;
    const rolled = (call.name === "roll" || action === "accept_roll" || action === "reroll_roll") && who === (prev.currentPlayer || actor);
    const die = rolled ? /掷出了 (\d+) 点(?:，额外移动加成 \+(\d+))?/.exec(out) : null;
    if (prev.chapterId !== next.chapterId) continue;
    if (die && a === b && next.status === "awaiting_roll_choice") {
      lines.push(`〔骰〕${nameOf(next, who)}掷出 ${die[1]} 点（可以重掷一次）`);
      continue;
    }
    if (a === b && !die) continue;
    const title = await cellOf(next, b);
    const where = `第${b}格${title ? `【${title}】` : ""}`;
    if (die) lines.push(`〔骰〕${nameOf(next, who)}掷出 ${die[1]} 点${die[2] ? `（+${die[2]}）` : ""} → ${where}`);
    else lines.push(`〔行〕${nameOf(next, who)}走到${where}`);
  }

  if (action === "complete_scene" && prev && prev.pendingScene) {
    const title = await cellOf(prev, prev.pendingScene.cellPosition);
    lines.push(`〔景〕${title ? `【${title}】` : "这一场"}结算了`);
  }

  // 东西、银两：一个人一行
  for (const who of ["human", "ai"]) {
    if (!prev || !prev.players) break;
    const b0 = bag(prev, who);
    const b1 = bag(next, who);
    const got = [];
    const gone = [];
    for (const id of new Set([...Object.keys(b0), ...Object.keys(b1)])) {
      const d = (b1[id] || 0) - (b0[id] || 0);
      if (d > 0) got.push(itemName(id) + (d > 1 ? `×${d}` : ""));
      if (d < 0) gone.push(itemName(id) + (d < -1 ? `×${-d}` : ""));
    }
    const m0 = prev.players[who].money;
    const m1 = next.players[who].money;
    const coin = m0 !== m1 ? `  ${m0} → ${m1} 两` : "";
    const nm = nameOf(next, who);
    let line = "";
    if (got.length && (action === "buy" || m1 < m0)) line = `〔银〕${nm}买了${got.join("、")}${coin}`;
    else if (got.length && action === "gift_item") line = `〔物〕${nm}收到${got.join("、")}${coin}`;
    else if (got.length) line = `〔物〕${nm}得了${got.join("、")}${coin}`;
    else if (gone.length && action === "gift_item") line = `〔物〕${nm}送出${gone.join("、")}${coin}`;
    else if (gone.length && action === "use_item") line = `〔物〕${nm}用了${gone.join("、")}${coin}`;
    else if (gone.length) line = `〔物〕${nm}少了${gone.join("、")}${coin}`;
    else if (coin) line = `〔银〕${nm} ${m0} → ${m1} 两`;
    if (line) lines.push(line);
  }
  if (!lines.some((l) => l.startsWith("〔物〕")) && prev && (action === "use_item" || action === "wear_item" || action === "customize_item")) {
    const id = input.itemId || input.targetItemId;
    const verb = action === "wear_item" ? "换了佩戴：" : action === "customize_item" ? "定制了" : "用了";
    if (id) lines.push(`〔物〕${nameOf(next, actor)}${verb}${itemName(id)}`);
  }

  // 拾遗录：新点亮的
  const c0 = new Set((prev && prev.collectionUnlocked) || []);
  const fresh = (next.collectionUnlocked || []).filter((id) => !c0.has(id));
  if (fresh.length) lines.push(`〔录〕拾遗录 ${(next.collectionUnlocked || []).length}/${(items || []).filter((x) => x.collectible).length || 36} · ${fresh.map(itemName).join("、")}`);

  if (next.status === "chapter_complete" && (!prev || prev.status !== "chapter_complete")) lines.push("〔章〕这一章走完了");
  return lines.slice(0, 4);
}

// 前情提要的那份记录里，一步下棋写成几行（卡片上那几行，前面不带括号里的字）
export function stepLines(m) {
  const out = [];
  ((m && m.calls) || []).forEach((c) => (c.card || []).forEach((line) => out.push(`[棋局] ${line.replace(/^〔[^〕]*〕/, "")}`)));
  return out;
}
