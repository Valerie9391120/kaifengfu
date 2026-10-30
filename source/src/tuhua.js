// =====================================================
// 图画院（卿卿 2026 年 10 月 30 日晚上要的，见开发说明“图画院”那一节）：南衙里一栏，他画的画都收在这儿。
// 她定的：每一张都自动收；删了对话，这里的还在；每张底下写哪天画的、他画的时候说的那句话；想删在这里长按单独删。
// 名字是我起的（北宋的翰林图画院就在开封），她没说要换。
// 这里只有不碰页面的零件：存在哪儿、一张什么样、怎么排、他画的时候说的是哪一句、哪几张还没收。
// 测试在 Node 里跑（tests/tuhua.test.mjs）。
// =====================================================
import { drawsIn, drawImgOf } from "./draw.js";
import { plainOf } from "./rich.js";
import { MONTHS } from "./cangyin/parts.js";

// 一张：kfs2:thy:<那一张画的名字（draw.js 的 drawKeyOf：那一条回话的 id.第几样）>，加密了跟着云端走。
//   内容 { v: 1, chat, at, say, ratio, thumb, saved }：
//   chat 哪段对话（只是记着，删了对话这一张照样在）；at 他画的时候（那一条回话的钟点）；
//   say 他画的时候说的那句话（见 sayOf）；ratio 横竖；thumb 缩成小图的那一张（摆一格一格用）；saved 几点收进来的
// 拿那一张画的名字当编号：哪台设备收、收几回都落在同一条上，不会收出两张
// 删了的那一张：内容换成 { v: 1, gone: true, saved }，留着这一条（别的设备、补收的时候认得出是她删的，不再收回来）
export const TH_KEY = "kfs2:thy:";
// 那一张的大图：聊天里那一张（kfs2:img:draw.…）还在就看那一张；要删那段对话的时候，拷一份到 kfs2:thya:<同上>
// （删了对话、聊天里那一张没了，这里的还在）。不是一收进来就拷：一张画在库房里占两份地方
export const TH_IMG = "kfs2:thya:";
export const SAY_MAX = 300;
export const THUMB_SIDE = 420; // 小图长边多少（一行两格，iPhone 上一格一百八十来点宽，三倍屏也够）

const s = (x) => (typeof x === "string" ? x : "");
export function packEntry(e) {
  return JSON.stringify({
    v: 1,
    chat: s(e.chat),
    at: Math.max(0, Number(e.at) || 0),
    say: s(e.say).slice(0, SAY_MAX),
    ratio: ["横", "竖", "方"].includes(e.ratio) ? e.ratio : "",
    thumb: s(e.thumb),
    saved: Math.max(0, Number(e.saved) || 0),
  });
}
export const packGone = (saved) => JSON.stringify({ v: 1, gone: true, saved: Math.max(0, Number(saved) || 0) });

// 读一张：认不出来的给 null；删了的给 { id, gone: true }
export function readEntry(id, text) {
  try {
    const d = JSON.parse(text);
    if (!d || d.v !== 1) return null;
    if (d.gone) return { id: String(id), gone: true };
    if (!s(d.thumb).startsWith("data:image/")) return null;
    return {
      id: String(id),
      chat: s(d.chat),
      at: Math.max(0, Number(d.at) || 0),
      say: s(d.say).slice(0, SAY_MAX),
      ratio: ["横", "竖", "方"].includes(d.ratio) ? d.ratio : "",
      thumb: d.thumb,
      saved: Math.max(0, Number(d.saved) || 0),
    };
  } catch (e) {
    return null;
  }
}

// 存档里那一串（[钥匙, 内容]）→ 摆出来的那几张，从新到旧（照他画的时候；同一刻的照收进来的先后）。删了的不摆
export function listEntries(pairs) {
  const out = [];
  for (const [k, v] of pairs || []) {
    if (!k || !String(k).startsWith(TH_KEY) || v == null) continue;
    const e = readEntry(String(k).slice(TH_KEY.length), v);
    if (e && !e.gone) out.push(e);
  }
  return out.sort((a, b) => b.at - a.at || b.saved - a.saved || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

// 他画的时候说的那句话：同一条回话里，画前面挨着的那一句字；前面没有，就是后面挨着的那一句。
// 照聊天里看到的样子取字（加粗、动作的记号摘掉，见 rich.js 的 plainOf）；太长的截短
export function sayOf(m, j) {
  const items = (m && m.items) || [];
  const textAt = (i) => (items[i] && items[i].type === "text" ? plainOf(items[i].text || "").trim() : "");
  for (let i = j - 1; i >= 0; i--) {
    const t = textAt(i);
    if (t) return t.slice(0, SAY_MAX);
    if (items[i] && items[i].type === "draw") break; // 前面是另一张画：那一句是那一张的
  }
  for (let i = j + 1; i < items.length; i++) {
    const t = textAt(i);
    if (t) return t.slice(0, SAY_MAX);
    if (items[i] && items[i].type === "draw") break;
  }
  return "";
}

// 一段对话里他画过的每一张（摆着的这一支、翻过去的那些版本里的都算）：[{ key, m（那一条回话）, j（第几样） }]
export function drawsOf(msgs, out = []) {
  (msgs || []).forEach((m) => {
    drawsIn(m).forEach((d) => out.push({ key: d.key, m, j: Number(d.key.slice(d.key.lastIndexOf(".") + 1)) }));
    (m && m.alts ? m.alts : []).forEach((a) => {
      if (a && a.node) drawsOf([a.node], out);
      if (a && a.after) drawsOf(a.after, out);
    });
  });
  const seen = new Set();
  return out.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
}

// 还没收的那几张：画好了（存档里有图）、这里还没有这一条（删了的也算有，不再收回来）
// has(钥匙)：存档里有没有这一条（App.jsx 里是 store.peek(…) != null）
export function toCollect(msgs, has) {
  return drawsOf(msgs).filter((x) => has("kfs2:img:" + drawImgOf(x.key)) && !has(TH_KEY + x.key));
}

// 南衙那一行的小字
export const thSub = (n) => (n > 0 ? `收了 ${n} 张` : "还空着");

// 每张底下的日期：今年的写“10月30日”，别的年份带上年
export function dateOf(ms, nowYear) {
  const d = new Date(ms);
  return `${d.getFullYear() !== nowYear ? d.getFullYear() + "年" : ""}${d.getMonth() + 1}月${d.getDate()}日`;
}
// 按月断开的那一行：今年的写“十月”，别的年份写“2025 年 十二月”（同藏音匣）
export function monthOf(ms, nowYear) {
  const d = new Date(ms);
  return `${d.getFullYear() !== nowYear ? d.getFullYear() + " 年 " : ""}${MONTHS[d.getMonth()]}`;
}
export const monthKey = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() * 12 + d.getMonth();
};
// 一串排好的 → 按月分成几段：[{ key, label, items }]
export function byMonth(list, nowYear) {
  const out = [];
  for (const e of list) {
    const k = monthKey(e.at);
    const last = out[out.length - 1];
    if (last && last.key === k) last.items.push(e);
    else out.push({ key: k, label: monthOf(e.at, nowYear), items: [e] });
  }
  return out;
}
