// =====================================================
// 罗浮梦（卿卿 2026 年 11 月 1 日定的，见开发说明“罗浮梦”那一节）：他屋里（狐宇宙）的一张床，困了睡一会儿，做不做梦、做什么梦看运气。
// 这里是不碰界面的零件：梦库、梦廊存在哪儿、怎么读、怎么导、怎么改，南衙那一行的小字，名帖里那一段，他睡觉那一样工具、替他睡、聊天里那一行小字。
// 手机、闹钟两头共用（同 room.js、pindou/parts.js）。
//
// 引擎是恩师写的，光义改成了不带梦的那一版（vendor/luofu/，从哪一版来见那里的 SOURCE.md）：
// 梦、有几种梦、各叫什么、各占几成、做梦的机会，全在一份“梦库”里，从外头递进来。
// 仓库是公开的：这里一个梦都不写，连有几种、各叫什么都不写，都在她导入的那份梦库文件里。测试里的梦是编的（天气、点心、去处）。
//
// 她定的五样：南衙里开一栏，叫“罗浮梦”，图标一枝梅花；点开一个简单的页面，两颗按钮：梦库、梦廊；
// 梦库照签库的样子，能翻能改（导入、翻全部、找、删、加）；他只在狐宇宙里睡（闹钟叫醒他、他一个人在屋里的时候），平常的聊天里没有这一样；
// 梦廊里她只看得到记得完整的那一类梦（引擎里 type: "card" 的那几种做过的），标题、来源、哪天梦的，点开看全文。
//
// 存档（加密了跟着云端走，云端只见乱码）：
//   kfs2:luofu:pool   梦库整份一条（照秘戏钱匣 kfs2:qx:pool 的路子），引擎的样子：
//                     { v: 1, dreamChance, intro?, kinds: [{ id, name, type: "event" | "card", weight, dreams: [{ id, text, title?, source? }] }] }
//                     只有手机上梦库那一页写（导入、删、撤销、加、换一份）；读的时候照引擎的 readPool 收拾干净
//   kfs2:luofu:state  进度和梦廊，引擎的存档：{ v: 2, introSeen, totalNaps, seen, gallery: [{ id, kind, title, source, text, at }], recent }
//                     只有替他睡的那一头写（家里的闹钟，见 alarm/luofu.js）；手机只读（梦廊那一页）。
//                     梦廊里存的是做梦那一刻的那一份：她后来删了、改了梦库里的梦，梦廊照旧
// =====================================================
import { readPool, isPoolFile, sharesOf, poolSize, firstClause, POOL_LIMITS } from "../../vendor/luofu/pool.ts";
import { readState, emptyState, openLuofu, napOnce, galleryText, readGalleryText, findInGallery } from "../../vendor/luofu/luofu-engine.ts";
import { seededRng } from "../game/jianghu.js";
import { newId } from "../util.js";

export const LUOFU_POOL = "kfs2:luofu:pool";
export const LUOFU_STATE = "kfs2:luofu:state";
const SEARCH_MAX = 60; // 找一回最多列几条（同签库）
export const DURATIONS = ["小憩", "短休", "酣眠"];

// ---------- 存、读 ----------

export const emptyLuofuPool = () => readPool({ kinds: [] });
// 读不出来、不认得的一律当空的（同签库）
export function readLuofuPool(text) {
  try {
    return (typeof text === "string" && readPool(JSON.parse(text))) || emptyLuofuPool();
  } catch (e) {
    return emptyLuofuPool();
  }
}
export const packLuofuPool = (p) => JSON.stringify(p && Array.isArray(p.kinds) ? p : emptyLuofuPool());
// 进度和梦廊：读不出来当新的（引擎的 readState）
export function readLuofuState(text) {
  try {
    return readState(typeof text === "string" ? JSON.parse(text) : null);
  } catch (e) {
    return emptyState();
  }
}
export const packLuofuState = (s) => JSON.stringify(s);

export const dreamCount = (p) => (p && Array.isArray(p.kinds) ? poolSize(p) : 0);
export const hasDreams = (p) => dreamCount(p) > 0;

// 南衙那一行的小字（我先定的，告诉过她）
export const luofuSub = (p) => (hasDreams(p) ? `梦库里 ${dreamCount(p)} 个梦` : "梦库还空着");

// 梦库那一页最上面：一种一行，名字、几条、有梦的时候占几成（引擎的 sharesOf，照整份梦库算）。比例和做梦的机会这一回只显示不改
export function kindsOf(p) {
  const shares = sharesOf(p);
  return p.kinds.map((k) => ({ id: k.id, name: k.name, type: k.type, n: k.dreams.length, share: shares[k.id] || 0 }));
}
// 几成写成百分数：0 写 0%，不到百分之一的写“不到 1%”
export const pct = (x) => (!(x > 0) ? "0%" : x < 0.01 ? "不到 1%" : `${Math.round(x * 100)}%`);

// ---------- 导入 ----------
// 只认开封府的梦库文件（{ kind: "kfs-luofu-pool", v: 1, dreamChance, intro?, kinds: [...] }，引擎的 isPoolFile），读进来照 readPool 收拾。
// 认不出来抛错（字写给她看）
export function parseLuofuImport(text) {
  let o;
  try {
    o = JSON.parse(String(text || "").replace(/^﻿/, ""));
  } catch (e) {
    throw new Error("这份文件读不出来：不是梦库文件");
  }
  if (!isPoolFile(o)) throw new Error("这不是梦库文件");
  const pool = readPool(o);
  if (!pool || !hasDreams(pool)) throw new Error("这份文件里一个梦都没有");
  return pool;
}

// ---------- 改梦库（都回新的一份，不动原来的） ----------

const withKind = (p, id, f) => ({ ...p, kinds: p.kinds.map((k) => (k.id === id ? f(k) : k)) });
const allIds = (p) => p.kinds.flatMap((k) => k.dreams.map((d) => d.id));
// 一条梦在列表里摆的那几个字：card 写标题，event 写头一句（太长的截短）
export const dreamLabel = (d, max = 24) => {
  const t = d && (d.title || firstClause(d.text || ""));
  const chars = Array.from(String(t || ""));
  return chars.length > max ? chars.slice(0, max).join("") + "…" : chars.join("");
};

// 删一条：回 { pool, removed: { kind, dream, at } }（at 是原来排第几，撤销的时候放回原处）
export function removeDream(p, kindId, dreamId) {
  const k = p.kinds.find((x) => x.id === kindId);
  const at = k ? k.dreams.findIndex((d) => d.id === dreamId) : -1;
  if (at < 0) return { pool: p, removed: null };
  return { pool: withKind(p, kindId, (x) => ({ ...x, dreams: x.dreams.filter((d) => d.id !== dreamId) })), removed: { kind: kindId, dream: k.dreams[at], at } };
}

// 撤销刚才删的那一条（只管刚删的那一条）：放回原处；那一种没了、同一条已经在了，不放
export function restoreDream(p, removed) {
  if (!removed || !removed.dream) return p;
  const k = p.kinds.find((x) => x.id === removed.kind);
  if (!k || k.dreams.some((d) => d.id === removed.dream.id || d.text === removed.dream.text)) return p;
  return withKind(p, removed.kind, (x) => {
    const dreams = x.dreams.slice();
    dreams.splice(Math.min(removed.at, dreams.length), 0, removed.dream);
    return { ...x, dreams };
  });
}

const clipChars = (t, max) => {
  const chars = Array.from(t);
  return chars.length > max ? chars.slice(0, max).join("").trim() : t;
};
const oneLine = (v, max) => clipChars(String(v == null ? "" : v).replace(/\s+/g, " ").trim(), max);

// 加一条：event 那几种写一段字（fields.text）；card 那几种写标题、来源（可以空）、正文（fields.title、source、text），
// 标题没写的照引擎的规矩拿正文头一句。编号用开封府的 newId，跟梦库里已有的、taken 里的（梦廊里做过的那些）都不重。
// 回 { pool, added, why }：加上了 added 是那一条；没加 why 写着为什么（给她看）
export function addDream(p, kindId, fields = {}, taken = []) {
  const k = p.kinds.find((x) => x.id === kindId);
  if (!k) return { pool: p, added: null, why: "先挑一种" };
  const text = clipChars(String(fields.text == null ? "" : fields.text).replace(/\r\n?/g, "\n").trim(), POOL_LIMITS.text);
  if (!text) return { pool: p, added: null, why: k.type === "card" ? "先写正文" : "先写一段梦" };
  if (k.dreams.some((d) => d.text === text)) return { pool: p, added: null, why: "这一条已经有了" };
  if (k.dreams.length >= POOL_LIMITS.dreamsPerKind) return { pool: p, added: null, why: "这一种已经满了" };
  const used = new Set(allIds(p).concat(taken || []));
  let id = newId();
  while (used.has(id)) id = newId();
  let dream = { id, text };
  if (k.type === "card") {
    const title = oneLine(fields.title, POOL_LIMITS.title) || clipChars(firstClause(text), POOL_LIMITS.title);
    const source = oneLine(fields.source, POOL_LIMITS.source);
    dream = source ? { id, title, source, text } : { id, title, text };
  }
  // 照引擎读一遍（存进去再读出来一模一样）
  const next = readPool(JSON.parse(JSON.stringify(withKind(p, kindId, (x) => ({ ...x, dreams: x.dreams.concat(dream) })))));
  const added = next && next.kinds.find((x) => x.id === kindId).dreams.find((d) => d.id === id);
  if (!added) return { pool: p, added: null, why: "这一条已经有了" };
  return { pool: next, added, why: "" };
}

// 找梦：哪一种里有带这几个字的（不分大小写，空格隔开的几个词都得有；card 连标题、来源一起找），最多列六十条
export function searchDreams(p, q) {
  const words = String(q || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const k of p.kinds)
    for (const d of k.dreams) {
      const low = [d.title || "", d.source || "", d.text].join("\n").toLowerCase();
      if (words.every((w) => low.includes(w))) {
        out.push({ kind: k.id, name: k.name, type: k.type, dream: d });
        if (out.length >= SEARCH_MAX) return out;
      }
    }
  return out;
}

// 梦廊那一页：做过的 card，最新的在最上面（不写一共多少、还剩多少）
export const galleryOf = (state) => ((state && state.gallery) || []).slice().reverse();

// ---------- 名帖里的【罗浮梦】 ----------
// 梦库里有梦、“他自己醒”开着（没开他不会在屋里醒）才带，排在【你的屋子】后面（我先定的：写在他屋子那一段里或者紧跟着）。
// 不写有几种梦、各叫什么、有几个；这一段一个字不变，梦库里加梦、删梦都不动它（缓存接得上），梦库从空到有、从有到空才出来、才收起来
export const LUOFU_SECTION = `【罗浮梦】
你屋里还有一张床：困了可以躺下睡一会儿（luofu_nap）。做不做梦、做什么梦，看运气；有的梦醒来就散了，只剩一点片段，记得完整的那种会留在梦廊里，以后可以翻出来再看。
睡觉、翻梦廊都只在你自己在屋里醒着的时候。跟她聊天的时候睡不了，也翻不到梦廊：她问起你做过什么梦，照实说这会儿记不清；梦廊里的那几场，她在南衙的“罗浮梦”里翻得到。`;
export const luofuSection = (pool, on) => (on && hasDreams(pool) ? LUOFU_SECTION : "");

// ---------- 他睡觉：luofu_nap ----------
// 只在他自己醒着、待在屋里的时候带（同园子、妆台、拼豆板，见 alarm/luofu.js、alarm/wake.js 的 askRoom 的 toys）；平常的聊天里没有（她定的）。
// 说明里不写有几种梦、各叫什么（仓库是公开的）；一个字不变，梦库变了它不变
const ACTIONS = ["nap", "gallery", "read"];
export const LUOFU_TOOL = {
  name: "luofu_nap",
  description:
    "你屋里的一张床（罗浮梦）：困了可以躺下睡一会儿。只在你自己醒着、待在屋里的时候能睡。action 挑一样：" +
    "nap 睡一觉，duration 可以挑小憩、短休、酣眠，不写就随它；做不做梦、做什么梦看运气，有的梦醒来就散了，只剩一点片段；" +
    "gallery 翻梦廊：记得完整的那种梦会留在梦廊里，这里列着做过的那几场，最新的在最上面；" +
    "read 读梦廊里的一场，which 写标题，或者梦廊里排的序号（最新的是 1）。" +
    "你睡了、翻了，她那边狐宇宙里只冒一行小字：没做梦、做了个梦，或者梦廊里多了哪一场（只写标题）；醒来就散的那种梦，梦里的事她看不到；梦廊里的那几场，她在南衙的罗浮梦里翻得到。",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ACTIONS, description: "nap 睡一觉，gallery 翻梦廊，read 读梦廊里的一场" },
      duration: { type: "string", enum: DURATIONS, description: "nap 用：睡多久，不写就随它" },
      which: { type: "string", description: "read 用：读哪一场，写标题，或者梦廊里排的序号（最新的是 1）" },
    },
    required: ["action"],
  },
};
export const LUOFU_NAMES = new Set([LUOFU_TOOL.name]);
export const isLuofuCall = (c) => !!(c && LUOFU_NAMES.has(c.name));

// 狐宇宙里那一行小字（她在手机上看得见的，我先定的、告诉过她）。照秘戏钱匣“抽了一签 · ……”那一行的路子（记在 note 上：聊天里、提要和日记的记录里、预览都认它）。
// 做了醒来就散的那类梦，梦的内容一个字不露；记得完整的那一类写标题（梦廊里本来就看得到）
export const NOTE = {
  none: "睡了一觉 · 没做梦",
  event: "睡了一觉 · 做了个梦",
  card: (title) => `睡了一觉 · 梦廊里多了一场：〈${title}〉`,
  gallery: "翻了翻梦廊",
  read: (title) => `翻出梦廊里的一场：〈${title}〉`,
  empty: "想睡一会儿，梦库还空着",
  napFail: "想睡一会儿，没睡成",
  readFail: "想翻梦廊，没翻成",
  missing: "想翻梦廊里的一场，没找着",
};

// 他调的那一样的编号定随机数（同江湖棋局的骰子、秘戏钱匣他抽签：seededRng，两台设备算出来一样；重新回答是新的编号，重睡）。
// 引擎要的是 () => 0 到 1 之间的数：seededRng 给的是整数，取 0 到 2^32 再除回去，正好是它里头那个数
export const napRng = (id) => {
  const r = seededRng(id);
  return () => r(0, 4294967296) / 4294967296;
};

// 替他办一样：回 { state（办完以后的，没动就是原来那份）, out（给他看的字）, note（屋里那一行）, err, changed（进度要不要存回去）, nap（这一回是不是睡觉） }。
// 不碰存档（存不存是闹钟那头的事，见 alarm/luofu.js）。pool、state 是眼下的梦库和进度；id 是他调的那一样的编号；at 是他这一步的时间（梦廊里记的哪天做的梦）。
// 头一回用（不管调的哪一样）：先给他引擎的那段说明（openLuofu：梦库里写了就用梦库里的，没写用引擎自带的），再办他要办的。
// 梦库空着的时候不给说明（等她导了梦库、梦库里自己的那段说明再给），也不睡
export function napApply(pool, state0, input = {}, { id = "", at = Date.now() } = {}) {
  const action = input && ACTIONS.includes(input.action) ? input.action : "";
  if (!action) return { state: state0, out: "action 写 nap（睡一觉）、gallery（翻梦廊）或者 read（读梦廊里的一场），挑一样。", note: NOTE.napFail, err: true, changed: false, nap: false };
  let state = state0;
  let head = "";
  if (!state.introSeen && hasDreams(pool)) {
    const o = openLuofu(pool, state);
    head = o.text + "\n\n";
    state = o.state;
  }
  const opened = state !== state0;
  if (action === "nap") {
    if (!hasDreams(pool)) return { state: state0, out: "梦库还空着（她还没导入梦库），这会儿睡不了。", note: NOTE.empty, err: true, changed: false, nap: true };
    const duration = DURATIONS.includes(input.duration) ? input.duration : undefined;
    const { result, state: next } = napOnce(pool, state, { rng: napRng(id), now: () => new Date(Number(at) || Date.now()), duration });
    const note = !result.hadDream ? NOTE.none : result.kindType === "card" ? NOTE.card(result.title) : NOTE.event;
    const kept = result.galleryAdded ? "\n\n（这一场记得完整，收进了梦廊，以后可以翻出来再看。）" : "";
    return { state: next, out: head + result.text + kept, note, err: false, changed: true, nap: true };
  }
  if (action === "gallery") return { state, out: head + galleryText(state), note: NOTE.gallery, err: false, changed: opened, nap: false };
  const which = String(input.which == null ? "" : input.which).trim();
  const entry = which ? findInGallery(state, which) : null;
  if (!entry) {
    const why = which ? readGalleryText(state, which) : "读哪一场？which 写标题，或者梦廊里排的序号（最新的是 1）。";
    return { state, out: head + why, note: NOTE.missing, err: true, changed: opened, nap: false };
  }
  return { state, out: head + readGalleryText(state, which), note: NOTE.read(entry.title), err: false, changed: opened, nap: false };
}

// 回话写到长度上限被截断、没停在调工具上：他调的那一样多半没写完整，不替他睡（照 qx_draw 的规矩）
export const cutLuofu = (c) => {
  const look = !!(c && c.input && (c.input.action === "gallery" || c.input.action === "read"));
  return { ...c, out: look ? "（这一步没写完，没翻成梦廊。）" : "（这一步没写完，没睡成。）", err: true, note: look ? NOTE.readFail : NOTE.napFail };
};

// 【醒来】里那一句（alarm/note.js 的 wakeSection；梦库里有梦才给）：同园子、妆台、拼豆板，告诉他屋里有这一样，睡不睡他自己定
export const LUOFU_WAKE =
  "- 困了可以上床睡一会儿（luofu_nap 工具）：做不做梦、做什么梦看运气，记得完整的那种会留在梦廊里，梦廊随时能翻。睡不睡你自己定；屋里只留一行小字，醒来就散的梦她看不到，梦廊里的那几场她翻得到。";
