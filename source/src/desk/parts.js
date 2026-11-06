// =====================================================
// 狐宇宙那一页（他屋里的一张书案，见 desk/DeskPage.jsx、tools/make_desk.py）的零件，不碰界面，手机、家里的闹钟两头共用。
//
// 信笺：他每回在屋里醒来写的那一轮（一轮 = 狐宇宙里醒了那一行，连着后面他的那几条），摆在案上那张信笺上：
//   他写的字，后头跟着那一回醒着干了什么的几行小字（浇水、换装、睡了一觉……），末尾落日子。
//   她点“已阅”，那一轮收起来：存档里记一笔（kfs2:fox:read，加密了跟着云端走），纸上不摆了，
//   他下回醒来，寄给他的狐宇宙那段对话里也没有那一轮了；那一轮回的她那几张便签（排在上一轮和这一轮中间的）跟着不寄。
//   狐宇宙那段对话本身一个字不删：信匣里照样一条一条排着，前情提要照样抄。
// 信匣：原来狐宇宙那一页上摆的（聊天记录那一套，chat/rows.js），一样一样搬到信笺上（他在左、她在右，不带气泡），见 boxOf。
// 卡片：推近花盆，卡片上写园子眼下的样子（照家里的闹钟写的存档，只读）；推近铜镜，卡片上只有照镜子、衣柜、成就三颗。
// =====================================================
import { isWakeMark } from "../fox.js";
import { plainOf, richBlocks } from "../rich.js";
import { shownOf, voiceKeyOf } from "../voice.js";
import { drawKeyOf, drawImgOf, drawOf } from "../draw.js";
import { askSummary } from "../ask.js";
import { sepLabel } from "../days.js";
import { buildRows } from "../chat/rows.js";
import { pickRecap } from "../recap.js";
import { PLANTS } from "../../vendor/garden/garden-data.ts";

export const DESK_READ = "kfs2:fox:read"; // 收起来的那几轮：{ v: 1, ids: [那一轮的编号…] }

// ---------- 已阅 ----------
export function readRead(text) {
  try {
    const v = JSON.parse(text);
    const ids = v && Array.isArray(v.ids) ? v.ids : [];
    return new Set(ids.filter((x) => typeof x === "string" && x));
  } catch (e) {
    return new Set();
  }
}
// 存回去：只留眼下狐宇宙里还有的那几轮（keep 给了的话），省得越攒越长
export function packRead(set, keep = null) {
  const ids = [...set].filter((id) => !keep || keep.has(id));
  return JSON.stringify({ v: 1, ids });
}

// ---------- 一轮一轮 ----------
// 他那一条里看得见的字：说的话、语音条上的字（语气标签摘掉）；表情包、换头像这些不算
function wordsOf(m) {
  const out = [];
  for (const it of m.items || []) {
    if (!it) continue;
    if (it.type === "text" || it.type === "call") out.push(plainOf(it.text || ""));
    else if (it.type === "voice") out.push(plainOf(shownOf(it.text || "")));
  }
  return out.map((t) => t.trim()).filter(Boolean);
}
// 那一条里干了什么：用了哪几样（tavily 这些）、翻日记、浇水、换装……那几行小字（聊天里怎么摆，这里就怎么写）
function linesOf(m) {
  const out = [];
  if (m.toolNote || (m.tools && m.tools.length)) out.push(m.toolNote || `用了 ${m.tools.join("、")}`);
  for (const c of m.calls || []) if (c && c.note) out.push(c.note);
  for (const it of m.items || []) {
    if (it && it.type === "doc" && it.name) out.push(`留了一份文档《${it.name}》`);
    if (it && it.type === "draw") out.push("画了一张画");
  }
  return out;
}
// 醒了那一行去了哪儿（开了新对话、回去找她、到点去找她）：一行小字
function goLine(ev) {
  const g = ev.go;
  if (!g) return "";
  if (g.how === "new") return `开了一段新对话《${g.title || "新对话"}》找你`;
  return ev.quiet ? `去《${g.title || "一段对话"}》看了看` : `去《${g.title || "一段对话"}》找你了`;
}

// 狐宇宙那段对话分成一轮一轮：每一轮记着从第几条到第几条（idx），它回的那几张便签（notes，她排在上一轮和这一轮中间的话）
function groups(msgs) {
  const out = [];
  let cur = null;
  let notes = [];
  (msgs || []).forEach((m, i) => {
    if (!m) return;
    if (isWakeMark(m)) {
      if (m.hidden) return;
      cur = { id: m.id, ts: m.ts || 0, idx: [i], ev: m, msgs: [], notes };
      notes = [];
      out.push(cur);
    } else if (m.role === "her") {
      cur = null;
      notes.push(i);
    } else if (m.role === "him") {
      // 早先狐宇宙里还能聊天的时候，手机替她要来的回话：前面没有醒了那一行，自己算一轮
      if (!cur) {
        cur = { id: m.id, ts: m.ts || 0, idx: [], ev: null, msgs: [], notes };
        notes = [];
        out.push(cur);
      }
      cur.idx.push(i);
      cur.msgs.push(m);
    }
    // 别的几种（换头像的提示这些）不算哪一轮的，也不打断这一轮
  });
  return out;
}

// 信笺上摆的：[{ id, ts, text, lines, read }]，早的在前。一个看得见的字、一行小字都没有的那一回（醒了一会儿，没留话）不摆
export function roundsOf(msgs, read = new Set()) {
  return groups(msgs)
    .map((g) => {
      const lines = [];
      for (const m of g.msgs) for (const l of linesOf(m)) if (!lines.includes(l)) lines.push(l);
      const go = g.ev ? goLine(g.ev) : "";
      if (go) lines.push(go);
      return { id: g.id, ts: g.ts, text: g.msgs.flatMap(wordsOf).join("\n"), lines, read: read.has(g.id) };
    })
    .filter((r) => r.text || r.lines.length);
}

// 他醒来的时候寄给他的狐宇宙那段对话：收起来的那几轮、它们回的那几张便签不寄。
// 前情提要抄过的那一截不动（那一截寄过去的是提要，不是原话；抄到的那一条也得在，不然认不出是哪一份）
export function wakeContext(msgs, read, recaps = []) {
  if (!read || !read.size || !Array.isArray(msgs)) return msgs || [];
  const { at } = pickRecap(msgs, recaps || []);
  const drop = new Set();
  for (const g of groups(msgs)) {
    if (!read.has(g.id)) continue;
    for (const i of g.idx.concat(g.notes)) if (i > at) drop.add(i);
  }
  return drop.size ? msgs.filter((_, i) => !drop.has(i)) : msgs;
}

// ---------- 信匣 ----------
// 字拆成一段一段（标题、加粗、动作），递给那一页照着摆：[{ h: 几级标题（0 是平常的）, parts: [{ s, b, i }] }]
export function richOf(text) {
  return richBlocks(String(text || "")).map((b) => ({ h: b.t === "h" ? b.level : 0, parts: b.parts.map((p) => ({ s: p.s, b: !!p.b, i: !!p.i })) }));
}
// 狐宇宙原来那一页上摆的（chat/rows.js 的 buildRows，照聊天记录那一套），一样一样搬成信匣里的一样：
//   stamp { text }                      隔了一刻钟以上，正中一行几点（照聊天记录：今天、昨天、几月几日）
//   notice { text, call?, seal? }       醒了、换头像、改名字、打电话那几行小字；醒了那一行，那一轮收进信匣了（已阅）就盖个“阅”
//   recap { id }                        这以前的抄成了提要
//   card { head, text, img? }           秘戏钱匣的签、拼豆（狐宇宙里早先能聊天的时候才可能有）
//   think { side, text }                他的心里话（收着，点开看）
//   line { side, text }                 用了 tavily、翻了日记、浇了水……那几行小字
//   say { side, rich, copy, seal? }     字；copy 是长按复制出来的那些字（简体原文，记号摘掉）
//   voice { side, rich, copy, key?, raw?, dur? }  语音：他的带 key（认念好的声音）、raw（再念一回用）；她的带 dur
//   meme { side, file }、photo { side, img }、draw { side, key, img, title, prompt, ratio }
//   doc { side, ref, name, fmt, chars, cut?, images? }  她发的 ref 是 "d:" + 文档编号，他写的是 "m:" + 那一条的编号 + ":" + 第几样
// side：me 他、her 她。早先那几轮（前面没有醒了那一行）收进信匣了，“阅”盖在那一轮头一句字上
export function boxOf(msgs, { read = new Set(), recaps = [], now = new Date() } = {}) {
  const list = Array.isArray(msgs) ? msgs.filter(Boolean) : [];
  const { recap } = pickRecap(list, recaps || []);
  const rows = buildRows(list, null, "", recap, "");
  const oldRead = new Set(groups(list).filter((g) => !g.ev && read.has(g.id)).map((g) => g.id));
  const out = [];
  const say = (row, side, text, extra = {}) => {
    const e = { k: row.key, t: "say", side, rich: richOf(text), copy: plainOf(text), ...extra };
    if (side === "me" && oldRead.has(row.msg.id)) {
      e.seal = true;
      oldRead.delete(row.msg.id);
    }
    out.push(e);
  };
  for (const row of rows) {
    const m = row.msg;
    if (row.type === "sep") out.push({ k: row.key, t: "stamp", text: sepLabel(row.ts, now) });
    else if (row.type === "notice") out.push({ k: row.key, t: "notice", text: row.text, ...(row.kind === "call" ? { call: true } : {}), ...(row.kind === "wake" && read.has(m.id) ? { seal: true } : {}) });
    else if (row.type === "recap") out.push({ k: row.key, t: "recap", id: row.recap.id });
    else if (row.type === "lot") out.push({ k: row.key, t: "card", head: "签", text: (m.lines || []).map((l) => (l && l.t) || "").filter(Boolean).join("、") });
    else if (row.type === "pindou") out.push({ k: row.key, t: "card", head: "拼豆", text: m.name || "拼豆作", ...(typeof m.png === "string" && /^data:image\//.test(m.png) ? { img: m.png } : {}) });
    else if (row.type === "thinking") out.push({ k: row.key, t: "think", side: "me", text: m.thinking });
    else if (row.type === "tools" || row.type === "game") out.push({ k: row.key, t: "line", side: "me", text: row.text });
    else if (row.type === "ask") say(row, "me", askSummary(row.item.qs));
    else if (row.type === "bubble") {
      const it = row.item;
      const side = row.role === "her" ? "her" : "me";
      if (it.type === "meme") out.push({ k: row.key, t: "meme", side, file: it.file });
      else if (it.type === "photo") out.push({ k: row.key, t: "photo", side, img: it.imgId });
      else if (it.type === "doc") {
        const ref = side === "her" ? "d:" + it.docId : `m:${m.id}:${row.idx}`;
        const chars = side === "her" ? it.chars || 0 : String(it.text || "").length;
        out.push({ k: row.key, t: "doc", side, ref, name: it.name || "文档", fmt: it.fmt || "md", chars, ...(it.cut ? { cut: true } : {}), ...(it.images ? { images: it.images } : {}) });
      } else if (it.type === "voice" && side === "her") out.push({ k: row.key, t: "voice", side, rich: richOf(it.text || ""), copy: plainOf(it.text || ""), dur: it.dur || 0 });
      else if (it.type === "voice") {
        const words = shownOf(it.text || "");
        const e = { k: row.key, t: "voice", side, rich: richOf(words), copy: plainOf(words), key: voiceKeyOf(m.id, row.idx), raw: it.text || "" };
        if (oldRead.has(m.id)) {
          e.seal = true;
          oldRead.delete(m.id);
        }
        out.push(e);
      } else if (it.type === "draw") {
        const key = drawKeyOf(m.id, row.idx);
        const d = drawOf(it);
        out.push({ k: row.key, t: "draw", side, key, img: drawImgOf(key), title: d.title, prompt: d.prompt, ratio: it.ratio || "" });
      } else say(row, side, row.call && side === "me" ? shownOf(it.text || "") || "……" : it.text || "");
    }
  }
  return out;
}

// ---------- 卡片：园子、妆台眼下的样子 ----------
const NUM = "〇一二三四五六七八九";
export function cn(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (n < 10) return NUM[n];
  if (n < 20) return "十" + (n % 10 ? NUM[n % 10] : "");
  if (n < 100) return NUM[Math.floor(n / 10)] + "十" + (n % 10 ? NUM[n % 10] : "");
  return String(n);
}
const CARED = { water: "浇过水了", loosen: "松过土了", prune: "修剪过了" };
const STAGE = (n) => (n >= 21 ? "孕蕾" : n >= 11 ? "抽枝展叶" : "萌动");

// 花盆：在种哪株、照料了几天、今天照料过没有
export function gardenCard(state, today) {
  const sub = (p) => `钧窑六方盆${p ? " · " + p.shortName : ""}`;
  if (!state || !state.initialized) return { sub: sub(null), note: "园子我还没进去过。头一回进去，会得一盆魏紫。", go: [] };
  const done = (state.completedPlants || []).length;
  const book = done ? `《群芳谱》里收了${cn(done)}种。` : "";
  const p = state.currentPlant && PLANTS[state.currentPlant];
  if (!p) return { sub: sub(null), note: `眼下没在种。${book}`, go: [] };
  if (state.careDays >= 30) return { sub: sub(p), note: `${p.shortName}开了。${book}`, go: [] };
  const cared = state.todayCareDate === today && CARED[state.todayCareAction] ? CARED[state.todayCareAction] : "还没照料";
  return { sub: sub(p), note: `${p.shortName}，${STAGE(state.careDays)}，照料了${cn(state.careDays)}天（满三十天开花）。今天${cared}。${book}`, go: [] };
}

// 铜镜：卡片上不写字了（今天那一身、上一回那一身都在“照镜子”那一页里），只留底下三颗：照镜子、衣柜、成就
//   （点了在这一层里弹出那一页，见 DeskPage 的 dressing；衣柜能加、删、改，见 dressing/closet.js）
export const DRESS_GO = ["照镜子", "衣柜", "成就"];
export function dressingCard() {
  return { note: "", go: DRESS_GO };
}

// 递给那一页的卡片（推近哪一样，卡片上写什么）：只有花盆、铜镜换；别的照那一页自己写的
export function deskCards({ garden, today }) {
  return { 花盆: gardenCard(garden, today), 铜镜: dressingCard() };
}
