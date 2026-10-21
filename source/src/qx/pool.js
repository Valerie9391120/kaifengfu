// =====================================================
// 秘戏钱匣（卿卿 2026 年 10 月 21 日要的，见开发说明“秘戏钱匣”那一节）：签库、抽签、他自己抽签的那一样工具。不碰界面。
//
// 南衙里一只锦盒（她拿来的《锦盒抽签》那一页，见 tools/make_qianxia.py、QxPage.jsx）：点一下，一枚铜钱飞出来，
// 底下展开一幅卷轴，写着抽到的一签：她开着的每个维度各抽一条。签和维度的分法出自 Ruota della Fortuna（Copper，29-Cu），
// 署名见 README 和签库那一页底下。
//
// 签库在她手机上，跟着云端走（云端只见乱码）。仓库是公开的：这里一条签都不写，连维度叫什么都不写，都在她导入的那份文件里。
// 存在 kfs2:qx:pool 一条里：{ v: 1, dims: [{ id, name, on, tags: [签, …] }] }
//   id    维度的编号（导入的时候起的，删签、加签都不变）
//   name  维度名（她那份文件里写的）
//   on    她自己抽的时候抽不抽这一样（签库那一页里点；他抽的时候不看这个）
//   tags  这一样里的签，不重复
// 抽到的一签排成 [{ d: 维度名, t: 签 }]。她抽用这台手机的随机数；他抽照他调的那一样的编号（同江湖棋局的骰子：两台设备替他抽，抽得一样）。
// 她丢进聊天的那一签是她的一条话：{ role: "her", kind: "lot", coin, lines }，coin 是飞出来的是第几枚铜钱（1–5，只图好看）。
// =====================================================
import { HER_NAME, HIS_NAME } from "../names.js";
import { seededRng } from "../game/jianghu.js";
import { newId } from "../util.js";

export const QX_KEY = "kfs2:qx:pool";
export const TAG_MAX = 40; // 一条签最多几个字（她自己加的；导入的照这个截）
export const DIM_MAX = 12; // 最多几个维度
const SEARCH_MAX = 60; // 搜一回最多列几条

// 五枚铜钱（锦盒那一页里的次序）：篆书的、花月宜人、卷草边的、楷书的、花好月圆
export const COINS = ["风花雪月", "花月宜人", "风花雪月", "风花雪月", "花好月圆"];
export const coinName = (n) => COINS[(Number(n) || 0) - 1] || "";

// ---------- 存、读 ----------

const cleanTag = (t) =>
  String(t == null ? "" : t)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TAG_MAX);

function cleanDim(d) {
  if (!d || typeof d !== "object") return null;
  const name = cleanTag(d.name).slice(0, 12);
  if (!name) return null;
  const seen = new Set();
  const tags = [];
  for (const raw of Array.isArray(d.tags) ? d.tags : []) {
    const t = cleanTag(raw);
    if (t && !seen.has(t)) {
      seen.add(t);
      tags.push(t);
    }
  }
  return { id: typeof d.id === "string" && d.id ? d.id : newId(), name, on: d.on !== false, tags };
}

export const emptyPool = () => ({ v: 1, dims: [] });

// 读不出来、不认得的一律当空的
export function readPool(text) {
  try {
    const o = typeof text === "string" ? JSON.parse(text) : null;
    if (!o || o.v !== 1 || !Array.isArray(o.dims)) return emptyPool();
    const dims = [];
    const names = new Set();
    for (const d of o.dims) {
      const c = cleanDim(d);
      if (c && !names.has(c.name) && dims.length < DIM_MAX) {
        names.add(c.name);
        dims.push(c);
      }
    }
    return { v: 1, dims };
  } catch (e) {
    return emptyPool();
  }
}
export const packPool = (p) => JSON.stringify({ v: 1, dims: (p && p.dims) || [] });

export const poolSize = (p) => ((p && p.dims) || []).reduce((n, d) => n + d.tags.length, 0);
export const hasLots = (p) => poolSize(p) > 0;

// ---------- 导入 ----------
// 认两种文件：
//   1. 开封府的签库文件：{ kind: "kfs-qx-pool", v: 1, dims: [{ name, tags: [签, …] }] }（给她的那一份就是这个样子）
//   2. Ruota della Fortuna 原样的 tags.json：[{ zh, gore, tags: [{ zh, en, ja }] }]（gore 那一样不要，只拿中文）
// 认不出来抛错（字写给她看）
export function parseImport(text) {
  let o;
  try {
    o = JSON.parse(String(text || "").replace(/^﻿/, ""));
  } catch (e) {
    throw new Error("这份文件读不出来：不是签库文件");
  }
  let raw = null;
  if (o && !Array.isArray(o) && Array.isArray(o.dims)) raw = o.dims.map((d) => ({ name: d && d.name, tags: (d && d.tags) || [] }));
  else if (Array.isArray(o)) raw = o.filter((d) => d && !d.gore).map((d) => ({ name: d.zh || d.name, tags: (d.tags || []).map((t) => (t && typeof t === "object" ? t.zh : t)) }));
  if (!raw) throw new Error("这份文件里没有签库");
  const pool = readPool(packPool({ dims: raw }));
  if (!hasLots(pool)) throw new Error("这份文件里一条签都没有");
  return pool;
}

// ---------- 改签库（都回新的一份，不动原来的） ----------

const withDim = (p, id, f) => ({ v: 1, dims: p.dims.map((d) => (d.id === id ? f(d) : d)) });

export function setOn(p, id, on) {
  // 至少留一样开着、而且有签：全关了（或者开着的都空了）就抽不出东西
  if (!on && p.dims.filter((d) => d.on && d.tags.length && d.id !== id).length === 0) return p;
  return withDim(p, id, (d) => ({ ...d, on: !!on }));
}

// 加一条签：回 { pool, added }（空的、重了、太长截了以后重了都不加）
export function addTag(p, id, text) {
  const t = cleanTag(text);
  const d = p.dims.find((x) => x.id === id);
  if (!t || !d || d.tags.includes(t)) return { pool: p, added: "" };
  return { pool: withDim(p, id, (x) => ({ ...x, tags: x.tags.concat(t) })), added: t };
}

// 删一条签：回 { pool, removed: { id, t, at } }（at 是原来排第几，撤销的时候放回原处）
export function removeTag(p, id, text) {
  const d = p.dims.find((x) => x.id === id);
  const at = d ? d.tags.indexOf(text) : -1;
  if (at < 0) return { pool: p, removed: null };
  return { pool: withDim(p, id, (x) => ({ ...x, tags: x.tags.filter((t) => t !== text) })), removed: { id, t: text, at } };
}

// 撤销刚才删的那一条
export function restoreTag(p, removed) {
  if (!removed) return p;
  const d = p.dims.find((x) => x.id === removed.id);
  if (!d || d.tags.includes(removed.t)) return p;
  return withDim(p, removed.id, (x) => {
    const tags = x.tags.slice();
    tags.splice(Math.min(removed.at, tags.length), 0, removed.t);
    return { ...x, tags };
  });
}

// 搜签：哪一样里有带这几个字的（不分大小写，空格隔开的几个词都得有）
export function searchTags(p, q) {
  const words = String(q || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const d of p.dims)
    for (const t of d.tags) {
      const low = t.toLowerCase();
      if (words.every((w) => low.includes(w))) {
        out.push({ id: d.id, name: d.name, t });
        if (out.length >= SEARCH_MAX) return out;
      }
    }
  return out;
}

// ---------- 抽 ----------

// 这台手机的随机数（她抽的时候用）：(min, maxExcl) => 整数
export function phoneRng() {
  const buf = new Uint32Array(1);
  return (min, max) => {
    const span = Math.max(1, max - min);
    // 去掉尾巴上那一截，各条一样容易抽到
    const lim = Math.floor(0x100000000 / span) * span;
    let x;
    do {
      crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= lim);
    return min + (x % span);
  };
}

// 抽哪几样：names 给了就照名字找（他抽的时候），没给就是开着的那几样（她抽的时候；一样都没开就全抽）。空着的那一样不抽
export function dimsFor(p, names) {
  const full = p.dims.filter((d) => d.tags.length);
  if (Array.isArray(names) && names.length) {
    const want = names.map((n) => cleanTag(n));
    return full.filter((d) => want.includes(d.name));
  }
  const on = full.filter((d) => d.on);
  return on.length ? on : full;
}

export function drawLots(p, rnd, names) {
  return dimsFor(p, names).map((d) => ({ d: d.name, t: d.tags[rnd(0, d.tags.length)] }));
}

// 重抽一样：换一条跟眼下不一样的（那一样只有一条就还是它）
export function rerollLine(p, line, rnd) {
  const d = p.dims.find((x) => x.name === (line && line.d));
  if (!d || !d.tags.length) return line;
  const rest = d.tags.length > 1 ? d.tags.filter((t) => t !== line.t) : d.tags;
  return { d: d.name, t: rest[rnd(0, rest.length)] };
}

// ---------- 她丢进聊天的那一签 ----------

export const cleanLines = (lines) =>
  (Array.isArray(lines) ? lines : [])
    .map((l) => ({ d: cleanTag(l && l.d), t: cleanTag(l && l.t) }))
    .filter((l) => l.d && l.t);

// 寄给他的样子（也是提要的记录、日记摘录里写的）
export function lotText(m) {
  const lines = cleanLines(m && m.lines);
  const coin = coinName(m && m.coin);
  return `【秘戏钱匣】${HER_NAME}抽了一签${coin ? `（${coin}）` : ""}：\n${lines.map((l) => `${l.d}：${l.t}`).join("\n")}`;
}
// 历史对话的预览、名字：短一点
export const lotBrief = (m) => `[签] ${cleanLines(m && m.lines).map((l) => l.t).join("、")}`;

// ---------- 他自己抽：qx_draw ----------
// 说明里不写维度名（仓库是公开的；维度名在名帖【秘戏钱匣】那一段里，那一段照她的签库现拼）。
// 一直带着（跟翻日记那几样一样）：对话里有他调过的，不带那边不认
export const QX_TOOLS = [
  {
    name: "qx_draw",
    description:
      "从秘戏钱匣里抽一签：每个维度各随机抽一条（维度和签都在她手机上的签库里，见名帖【秘戏钱匣】）。dims 写了就只抽这几个维度，不写就每个维度都抽。你抽了，她那边聊天里会冒一行小字，写着你抽到了什么。",
    input_schema: {
      type: "object",
      properties: {
        dims: { type: "array", items: { type: "string" }, description: "只抽哪几个维度（写维度名）。不写就每个维度都抽。" },
      },
    },
  },
];
export const QX_NAMES = new Set(QX_TOOLS.map((t) => t.name));
export const isQxCall = (c) => !!(c && QX_NAMES.has(c.name));
// 他写到一半被截断、调的那一样没写完整：不替他抽
export const CUT_QX = "没抽：这一回的回话没写完整（写到长度上限截断了），调的那一样也没写完整。要抽就再调一回。";
export const QX_FAIL_NOTE = "想抽一签，没抽成";

// 一行小字：抽了一签 · 天气 雪｜点心 云片糕
export const drawNote = (lines) => `抽了一签 · ${lines.map((l) => `${l.d} ${l.t}`).join("｜")}`;

// 替他抽：calls 里还没抽过的那几样（out 还不是字）照编号抽，回新的一份（同 diaryTools.js 的 runDiaryCalls）
export function runQxCalls(calls, pool) {
  return (calls || []).map((c) => {
    if (!isQxCall(c) || typeof c.out === "string") return c;
    const input = c.input && typeof c.input === "object" ? c.input : {};
    const base = { id: c.id, name: c.name, input, card: [] };
    try {
      const p = pool && pool.dims ? pool : emptyPool();
      if (!hasLots(p)) return { ...base, out: "秘戏钱匣的签库还空着（她还没导入签库），这回抽不了。", err: true, note: "想抽一签，签库还空着" };
      const named = p.dims.map((d) => d.name);
      const all = p.dims.filter((d) => d.tags.length).map((d) => d.name);
      const asked = Array.isArray(input.dims) ? input.dims.map((n) => cleanTag(n)).filter(Boolean) : [];
      const miss = asked.filter((n) => !named.includes(n));
      const bare = asked.filter((n) => named.includes(n) && !all.includes(n)); // 有这一样，签删光了
      const names = asked.filter((n) => all.includes(n));
      const lines = drawLots(p, seededRng(c.id), names.length ? names : all);
      const notes = [];
      if (miss.length) notes.push(`签库里没有叫“${miss.join("”“")}”的维度（有的是：${named.join("、")}）`);
      if (bare.length) notes.push(`“${bare.join("”“")}”那一样里的签删光了`);
      const head = notes.length ? `${notes.join("；")}${names.length ? "，那几样没抽" : "，就每个维度都抽了"}。\n` : "";
      return { ...base, out: `${head}抽到了：\n${lines.map((l) => `${l.d}：${l.t}`).join("\n")}`, err: false, note: drawNote(lines) };
    } catch (e) {
      return { ...base, out: "这会儿抽不了：秘戏钱匣那头出了岔子。", err: true, note: QX_FAIL_NOTE };
    }
  });
}

// ---------- 名帖里的【秘戏钱匣】那一段 ----------
// 签库里有签才带；只写维度名，空了的那一样也写（删签、加签、把一样删光都不动这一段，缓存接得上；她换了一份签库、维度变了才变）
export function qxSection(p) {
  if (!hasLots(p)) return "";
  const names = p.dims.map((d) => d.name);
  return `【秘戏钱匣】
南衙里还有一只“秘戏钱匣”（她起的名字）：一只锦盒，她点一下，一枚铜钱飞出来，底下展开一幅卷轴，写着抽到的一签：每个维度各抽一条。签库在她手机上，维度有：${names.join("、")}。签她会自己加、自己删。
- 她觉得哪一签合意，会点“发给${HIS_NAME}”丢进聊天：你会看到一条【秘戏钱匣】${HER_NAME}抽了一签……，后面是抽到的那几样。她可能一口气丢好几签过来，一起看。她随手抽着玩、没发过来的，你看不到。
- 你也可以自己抽：调 qx_draw，dims 写维度名就只抽这几样，不写就每个维度都抽。想抽几回抽几回；你抽了，她那边会冒一行小字，写着你抽到了什么。
- 抽到了怎么用、用不用，你们俩自己定。
正在打电话的时候抽不了：她要你抽，就说挂了再抽。`;
}
