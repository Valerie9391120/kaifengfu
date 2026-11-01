// =====================================================
// 图画院（卿卿 2026 年 10 月 30 日晚上要的，见开发说明“图画院”那一节）：南衙里一栏，他画的画都收在这儿。
// 她定的：每一张都自动收；删了对话，这里的还在；想删在这里长按单独删。
// 每张底下原来写哪天画的、他画的时候说的那句话；10 月 31 日她说“挂着一句话在那好奇怪”，换成这张画的名字和哪天画的：
// 名字是他画的时候起好的（见 draw.js 的 splitDraw），她也能长按改（以前没名字的那几张她自己起）。
// 图画院这个名字是我起的（北宋的翰林图画院就在开封），她没说要换。
// 这里只有不碰页面的零件：存在哪儿、一张什么样、怎么排、哪几张还没收。
// 测试在 Node 里跑（tests/tuhua.test.mjs）。
// =====================================================
import { drawsIn, drawImgOf, TITLE_MAX } from "./draw.js";
import { MONTHS } from "./cangyin/parts.js";

// 一张：kfs2:thy:<那一张画的名字（draw.js 的 drawKeyOf：那一条回话的 id.第几样）>，加密了跟着云端走。
//   内容 { v: 1, chat, at, title, ratio, thumb, saved }：
//   chat 哪段对话（只是记着，删了对话这一张照样在）；at 他画的时候（那一条回话的钟点）；
//   title 这张画的名字（他起的，她改过的就是她改的；没有就是空的）；ratio 横竖；thumb 缩成小图的那一张（摆一格一格用）；saved 几点收进来的
//   （10 月 31 日以前收的那几张没有 title，有一个 say：他画的时候说的那句话，现在不摆了）
// 拿那一张画的名字当编号：哪台设备收、收几回都落在同一条上，不会收出两张
// 删了的那一张：内容换成 { v: 1, gone: true, saved }，留着这一条（别的设备、补收的时候认得出是她删的，不再收回来）
export const TH_KEY = "kfs2:thy:";
// 那一张的大图：聊天里那一张（kfs2:img:draw.…）还在就看那一张；要删那段对话的时候，拷一份到 kfs2:thya:<同上>
// （删了对话、聊天里那一张没了，这里的还在）。不是一收进来就拷：一张画在库房里占两份地方
export const TH_IMG = "kfs2:thya:";
export { TITLE_MAX };
export const THUMB_SIDE = 420; // 小图长边多少（一行两格，iPhone 上一格一百八十来点宽，三倍屏也够）

const s = (x) => (typeof x === "string" ? x : "");
// 名字：两头的空白、书名号去掉，换行换成空格，太长截短（她改的时候也照这个收）
export const cleanTitle = (t) =>
  Array.from(s(t).replace(/[\r\n]+/g, " ").trim().replace(/^《+|》+$/g, "").trim())
    .slice(0, TITLE_MAX)
    .join("");
export function packEntry(e) {
  return JSON.stringify({
    v: 1,
    chat: s(e.chat),
    at: Math.max(0, Number(e.at) || 0),
    title: cleanTitle(e.title),
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
      title: cleanTitle(d.title),
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

// 一段对话里他画过的每一张（摆着的这一支、翻过去的那些版本里的都算）：[{ key, m（那一条回话）, j（第几样）, title, ratio }]
export function drawsOf(msgs, out = []) {
  (msgs || []).forEach((m) => {
    drawsIn(m).forEach((d) => out.push({ key: d.key, m, j: Number(d.key.slice(d.key.lastIndexOf(".") + 1)), title: d.title, ratio: d.ratio }));
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

// ======================= 框景（卿卿 11 月 1 日的草图 + 恩师那张画；见开发说明“图画院：框景”那节） =======================
// 恩师那张画 771 宽：挂落在右上角（388..771 × 0..294），长案从 1514 那一行往下（158 高），瓶子站在案面上 (132, 1529)。
// 页面上照屏宽缩放（s = 屏宽 / 771）：长案贴底，挂落贴右上角，瓶花站在长案上，墙铺满；中间一幅一幅的轴在这几样后面上下翻。
export const ART_W = 771;
export const LATTICE = { w: 383, h: 294 };
export const TABLE_H = 158;
const VASE_AT = { x: 132, y: 15 }; // 瓶底中心：离画的左边 132，案面后沿往下 15
// 十瓶花的图（tools 见开发说明）：800×1370，瓶底中心在 (278, 1325)；图里一单位 214 像素，画里一单位 107 像素，所以缩一半贴上去。
// tops：每一瓶最高那一枝在图里多高；rights：最右边伸到哪儿（翻到底的时候，挨着瓶花的轴要整个露出来）
export const VASE_IMG = { w: 800, h: 1370, cx: 278, by: 1325 };
export const VASE_TOPS = [136, 305, 129, 261, 147, 240, 236, 365, 249, 224];
export const VASE_RIGHTS = [788, 708, 647, 757, 534, 620, 537, 580, 735, 609];
// 当天插哪一瓶：照本地日期，一天换一瓶，十瓶轮着（她定的“每天换一束”）
export function vaseOf(now) {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  const n = VASE_TOPS.length;
  return ((day % n) + n) % n;
}
export function sceneOf(W, H, vase = 0) {
  const s = W / ART_W;
  const tableTop = H - TABLE_H * s;
  const k = s / 2;
  const vx = VASE_AT.x * s - VASE_IMG.cx * k;
  const vy = tableTop + VASE_AT.y * s - VASE_IMG.by * k;
  return {
    s,
    tableTop,
    latticeW: LATTICE.w * s,
    latticeH: LATTICE.h * s,
    vase: { x: vx, y: vy, w: VASE_IMG.w * k, h: VASE_IMG.h * k },
    flowersTop: vy + VASE_TOPS[vase] * k,
    flowersRight: vx + VASE_RIGHTS[vase] * k,
  };
}

// 裱绫的颜色：每一张随机挑一个（照那一张的编号算：换设备、重开都是同一个颜色）。
// 她点了月白、浅青、淡黄、藕荷、松花、浅绛，说“甚至可以再多加几样”，我添了后面六样
export const MOUNTS = [
  ["月白", "#d3e2ea"],
  ["浅青", "#c8dbcf"],
  ["淡黄", "#eee0b2"],
  ["藕荷", "#dbc5d5"],
  ["松花", "#dde2aa"],
  ["浅绛", "#e6c4ab"],
  ["缃色", "#ead39c"],
  ["天水碧", "#c0d8d5"],
  ["秋香", "#d6c78f"],
  ["茶白", "#ebe5d2"],
  ["湖蓝", "#c4d2e1"],
  ["杏红", "#eecdb6"],
];
export function hashStr(t) {
  let h = 2166136261;
  for (const ch of String(t)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export const mountOf = (id) => MOUNTS[hashStr(id) % MOUNTS.length];

// 一幅轴各部分多高（w：轴宽）。横的、竖的、方的都挂成竖轴，横的那一幅短一些（她 10 月 31 日定的）。
// 从上往下：挂绳（在天杆上面，cord 高）、天杆、天头（锦）、一道细线、画心（纸，画贴在中间）、一道细线、地头（锦）、地杆、
// 一根细绳、底下垂的小签（名字、哪天画的；她 11 月 1 日定的）
const TIAN = { 竖: 0.36, 方: 0.32, 横: 0.26 };
const DI = { 竖: 0.22, 方: 0.2, 横: 0.17 };
const PIC = { 竖: 4 / 3, 方: 1, 横: 3 / 4 };
export function scrollParts(ratio, w, lines = 2) {
  const r = PIC[ratio] ? ratio : "方";
  const edge = Math.max(2, Math.round(w * 0.022));
  const wi = w - 2 * edge;
  const sep = Math.max(1.5, Math.round(w * 0.024) / 2);
  const m = Math.round(wi * 0.045);
  const iw = wi - 2 * m;
  const ih = Math.round(iw * PIC[r]);
  const tian = Math.round(wi * TIAN[r]);
  const di = Math.round(wi * DI[r]);
  const core = ih + 2 * m;
  const face = tian + sep + core + sep + di;
  const rodT = Math.max(4, Math.round(w * 0.05));
  const rodB = Math.max(5, Math.round(w * 0.065));
  const cord = Math.round(w * 0.34);
  const string = Math.round(w * 0.1);
  const tagH = lines > 1 ? 44 : 28;
  const tagW = Math.round(Math.min(w * 0.88, 168));
  return { ratio: r, edge, wi, sep, m, iw, ih, tian, di, core, face, rodT, rodB, cord, string, tagH, tagW, h: rodT + face + rodB + string + tagH };
}

// 一幅一幅错落着挂（她草图上那样）：左一幅、右一幅，右边那一幅往下错开一截；新的在上面。
// W、H 屏幕多大；top 头上那一条（返回、标题）底下从哪儿算；vase 当天那一瓶。
// 返回 { items: [{ e, x, y（天杆顶）, w, col, p }], maxScroll（往上翻最多翻多少）, w, scene }
export function layoutScrolls(entries, W, H, { top = 64, vase = 0 } = {}) {
  const sc = sceneOf(W, H, vase);
  const w = Math.round(Math.min(W * 0.385, 210));
  const xL = Math.round(Math.max(10, W * 0.075));
  const xR = Math.round(W - xL - w);
  const items = [];
  const colBottom = [null, null];
  let prev = null;
  (entries || []).forEach((e, i) => {
    const col = i % 2;
    const p = scrollParts(e.ratio, w, e.title ? 2 : 1);
    let y = top + p.cord + 6;
    if (col === 1) y = Math.max(y, sc.latticeH + p.cord + 10); // 右边头一幅挂在挂落底下
    if (prev) y = Math.max(y, prev.y + prev.p.h * 0.42);
    if (colBottom[col] != null) y = Math.max(y, colBottom[col] + 18 + p.cord);
    const it = { e, x: col ? xR : xL, y: Math.round(y), w, col, p };
    items.push(it);
    colBottom[col] = it.y + p.h;
    prev = it;
  });
  // 翻到底：每一幅都能整个露出来——挨着瓶花的要高过花，别的高过长案
  let maxScroll = 0;
  for (const it of items) {
    const byFlowers = it.x < sc.flowersRight;
    const lim = byFlowers ? sc.flowersTop - 10 : sc.tableTop - 14;
    maxScroll = Math.max(maxScroll, it.y + it.p.h - lim);
  }
  return { items, maxScroll: Math.max(0, Math.round(maxScroll)), w, scene: sc };
}
