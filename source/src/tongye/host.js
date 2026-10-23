// 开封府这一头管同页（见 bridge.js、开发说明“同页搬进来”那一节）的几样：存档长什么样、闲笔集那张小卡片、批注、
// 原来那版手帐（src/jz/）掺的页挪过来、天气、外面那一层（TongyeFrame.jsx）交给同页的 __kfsTongye。
// 存档（都在 store 里，加密了跟着云端走）：
//   kfs2:ty:<集合>/<id>     同页的 db：day/<年-月-日>（那一天的原料：标题、正文、照片、原话、天气、谁排的）、page/<年-月-日>（她贴的、藏的）、
//                           gens/<年-月-日>（存过的几代）、wx/<年-月-日>（天气）、notes/<编号>（批注）、mine/<编号>（她传的贴纸、照片）、cfg/main（设置）
//   kfs2:tyls:<键>          同页存在“这台设备上”的那几样（这一天挑的版式风格、常用的贴纸……），也跟着云端走
//   kfs2:jzimg:<编号>       照片（跟原来那版手帐同一处）
import { materialsOf, readPage as readOldPage, readNotes as readOldNotes, JZ_KEY, JZN_KEY } from "../jz/model.js";
import { MOODS } from "../diary.js";
import { clip } from "../recap.js";
import { yearAgoOf } from "./dates.js";

export const TY_KV = "kfs2:ty:";
export const TY_LS = "kfs2:tyls:";
export const TY_IMG = "kfs2:jzimg:";

// 开封府这头替她往这一本里写了东西（天气）：开着的框要知道（TongyeFrame.jsx 听着）
const tyListeners = new Set();
export const onTyChanged = (fn) => {
  tyListeners.add(fn);
  return () => tyListeners.delete(fn);
};
export const tyChanged = (keys) =>
  tyListeners.forEach((f) => {
    try {
      f(keys);
    } catch (e) {}
  });

// 同页的版式、风格叫什么（闲笔集那张小卡片上写）
export const TY_LAYOUTS = { column: "单栏流", cover: "大图封面", two: "双栏报刊", margin: "边栏笔记", bento: "格子便当", scatter: "拼贴散落", poster: "只留重点", polaroid: "拍立得墙", letter: "信纸", timeline: "时间线", postcard: "明信片", scroll: "立轴", filmstrip: "胶片条", calendar: "撕页日历", magcover: "杂志封面", notewall: "便签墙", routemap: "路线图" };
export const TY_STYLES = { qingmo: "青墨素纸", swiss: "瑞士网格", editorial: "杂志编辑", mono: "单色极简", brutal: "粗野工业", neo: "新粗野贴纸", bauhaus: "包豪斯", memphis: "孟菲斯", film: "复古胶片", sketch: "手绘草稿", eink: "电子墨水", academia: "学院手抄", nature: "自然提纯", bigtype: "夸张极简", pixel: "像素", chaos: "拼贴乱炖", cyan: "蓝晒", night: "夜航", kraft: "牛皮纸", news: "报纸", xuan: "宣纸", washi: "和纸", water: "水彩", chalk: "黑板", receipt: "小票", y2k: "镭射" };

const parse = (s, d = null) => {
  if (s == null) return d;
  try {
    return JSON.parse(s);
  } catch (e) {
    return d;
  }
};
const ok = async (p) => {
  const r = await p;
  if (r === false) throw new Error("没存上");
};

export const dayRecOf = (store, day) => parse(store.peek(`${TY_KV}day/${day}`));
export const pageRecOf = (store, day) => parse(store.peek(`${TY_KV}page/${day}`));
const lookOf = (store, day) => parse(store.peek(`${TY_LS}journalLook:${day}`));

// 那一天的批注（同页的 notes 集合里 day 是这一天的），照时间排
export function notesOf(store, day) {
  return store
    .keys(`${TY_KV}notes/`)
    .map((k) => parse(store.peek(k)))
    .filter((n) => n && n.day === day && n.text)
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

// 那一天的 day 里有没有东西（标题、她起的标题、正文、照片、原话、红笔、票根……；他正排着也算）
export function dayHasContent(R) {
  if (!R || typeof R !== "object") return false;
  const T = R.text || {};
  return !!(R.title || R.herTitle || (R.photos || []).length || (R.chat || []).length || T.p1 || T.pen || T.cap || T.p2 || T.ann || T.quote || R.food || R.status === "making");
}

// 这一天算不算掺了一页（日历上的 🏷️、闲笔集的卡片、他翻日记看不看得到）：光点开不算（同页替他在页上放的那一张 me1 也不算）；
// day 里有东西，或者她在页上贴了、写了、放了照片，藏了哪几块，存过几代，才算（同同页自己的 worth()，只是不看批注：只有批注的日子不标）
export function madeOf(store, day) {
  if (dayHasContent(dayRecOf(store, day))) return true;
  const P = pageRecOf(store, day);
  if (P && ((P.stk || []).some((o) => o && !o.me1) || (P.hide || []).length || P.ext)) return true;
  const G = parse(store.peek(`${TY_KV}gens/${day}`));
  return !!(G && (G.list || []).length);
}

// 掺过的那几天（day、page 两样里有那一天的都看）
export function madeDays(store) {
  const days = new Set();
  for (const col of ["day", "page", "gens"]) for (const k of store.keys(`${TY_KV}${col}/`)) days.add(k.slice(`${TY_KV}${col}/`.length));
  return [...days].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && madeOf(store, d)).sort();
}

// 闲笔集那张小卡片要的：标题、版式 × 风格、谁排的、主照片（编号）、几条批注
export function infoOf(store, day) {
  if (!madeOf(store, day)) return null;
  const R = dayRecOf(store, day) || {};
  const L = lookOf(store, day) || {};
  const layout = L.layout || R.layout || "column";
  const style = L.style || R.style || "qingmo";
  const ph = (R.photos || []).filter((p) => p && p.src);
  const hero = ph.find((p) => p.role === "hero") || ph[0] || null;
  let heroId = hero && String(hero.src).startsWith("kfsimg:") ? hero.src.slice(7) : null;
  if (!heroId) {
    // 她自己放的照片（同页的 mine 里那一张）
    const P = pageRecOf(store, day);
    const pic = P && (P.stk || []).find((o) => o && o.c === "pic");
    const m = pic && parse(store.peek(`${TY_KV}mine/${pic.k}`));
    if (m && String(m.src || "").startsWith("kfsimg:")) heroId = m.src.slice(7);
  }
  return {
    title: R.herTitle || R.title || "",
    layout,
    style,
    sub: `${TY_LAYOUTS[layout] || layout} × ${TY_STYLES[style] || style}`,
    by: R.by === "me" ? "him" : "her",
    heroId,
    // 交给他排了、他正排着
    making: R.status === "making",
  };
}

// 闲笔集里留一条（贴在页边，同页里看是页角上的一颗）、删一条（连着回它的一起删）
export async function addNoteTo(store, day, who, text, now = Date.now()) {
  const n = { id: "n" + now.toString(36) + Math.random().toString(36).slice(2, 5), day, who: who === "him" ? "me" : "her", text, at: now, re: null, b: "", fx: 0.9, fy: 0.04 };
  await ok(store.set(`${TY_KV}notes/${n.id}`, JSON.stringify(n)));
  return notesOf(store, day);
}
export async function dropNoteOf(store, day, id) {
  for (const n of notesOf(store, day)) if (n.id === id || n.re === id) await store.del(`${TY_KV}notes/${n.id}`);
  return notesOf(store, day);
}

// 点开是看（view，掺过了）还是打开那一天的那一屏（day：同页本子首页点那一天，交给光义、自己拼两颗）：点开的时候什么都不写
export const openMode = (store, day) => (madeOf(store, day) ? "view" : "day");

// 她在那一页上头一回真的动了（同页要存那一页、存一代，见 bridge.js 的 touch）：那一天还没有 day，起一个空的（同同页的“自己拼”），
// 那一天取过的天气一起写进去（天气签照它画）。点开不动就不起：什么都不写，也就没有要收拾的（同原来那版“点开不动不存”），
// 另一台设备做好、这台还没同步下来的那一页，也不会被这边起的空页盖掉、被收拾的时候删掉。起了回 true。
// 交给他排、没排成的那一天（status 是 failed，什么都没有）当没有 day
export async function ensureDay(store, day, now = Date.now()) {
  const had = dayRecOf(store, day);
  if (had && had.status !== "failed") return false;
  const R = { day, status: "done", by: "her", title: "", ts: now };
  const w = parse(store.peek(`${TY_KV}wx/${day}`));
  if (w && Number.isFinite(w.code)) {
    R.wx = { code: w.code, hi: w.hi, lo: w.lo, mm: w.mm || 0, wind: w.wind || 0, sun: w.sun || "—", src: w.src || "open-meteo" };
    if (w.at) R.at = tyClean(String(w.at), 40);
  }
  await ok(store.set(`${TY_KV}day/${day}`, JSON.stringify(R)));
  tyChanged([`${TY_KV}day/${day}`]);
  return true;
}

// ---------- 他翻日记（diaryTools.js）看得到这一本：那一天的手帐、批注；他留批注 ----------
// 同页的零件叫什么（批注贴在哪一块旁边）：照同页自己的叫法（它的 BLKN），她在同页里看到的也是这几个字
export const TY_BLOCKS = { sp: "书脊条", ti: "题签", wx: "天气签", p1: "正文", he: "主照片", ro: "路线", sh: "截图", p2: "截图说明", qu: "引言", pa: "双联照", an: "照片批注", pe: "红笔段落", su: "快门条", tk: "票根", en: "邮戳和批章" };
// 翻日记的工具（diary_note 的 part，见 diaryTools.js 的 NOTE_PARTS）换成同页的零件
export const TOOL_PART = { title: "ti", wx: "wx", hero: "he", route: "ro", shot: "sh", quote: "qu", body: "p1", pair: "pa", pen: "pe", food: "tk" };

const WX_WORD = (c) => (c >= 71 ? "雪" : c >= 65 ? "大雨" : c >= 61 ? "小雨" : c >= 51 ? "毛毛雨" : c >= 3 ? "阴" : c >= 1 ? "多云" : "晴");
const one = (t) => String(t || "").replace(/\s+/g, " ").trim();
const cut = (t, n) => (Array.from(t).length > n ? Array.from(t).slice(0, n).join("") + "…" : t);
const two = (n) => String(n).padStart(2, "0");
const when = (t) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${two(d.getHours())}:${two(d.getMinutes())}`;
};

// 那一天的批注，换成翻日记的工具认的样子：who 是 her / him
export function notesForTools(store, day) {
  return notesOf(store, day).map((n) => ({ id: n.id, who: n.who === "me" ? "him" : "her", text: n.text, at: n.at || 0, re: n.re || null, part: TY_BLOCKS[n.b] || "" }));
}

// 她从引用栏贴到纸上的原话（同页的 qsel 贴纸：键是 C: 加上那几句原样的 JSON）。别的样子（c: 是按编号指着那天的聊天）这边认不出来，回 null
export function quotesOfStk(o) {
  if (!o || o.c !== "qsel" || typeof o.k !== "string" || !o.k.startsWith("C:")) return null;
  try {
    const A = JSON.parse(decodeURIComponent(o.k.slice(2)));
    return Array.isArray(A) ? A.filter((x) => x && typeof x.p === "string" && x.p) : null;
  } catch (e) {
    return null;
  }
}
// 狐宇宙里的（她从引用栏的便签那一栏贴的、你排页的时候挑的便签）：写明是狐宇宙里的
const quoteLine = (q) => `${q.t || ""} ${q.w === "her" ? "卿卿" : "你"}${q.src === "便签" ? "（狐宇宙里的便签）" : ""}：${cut(one(q.p), 60)}`.trim();

// 他翻到那一天时，这一页手帐写成几行字（照片他看不见，写明几张、各是什么）
export function pageTextOf(store, day) {
  if (!madeOf(store, day)) return "";
  const R = dayRecOf(store, day) || {};
  const P = pageRecOf(store, day) || {};
  const info = infoOf(store, day) || {};
  const T = R.text || {};
  const hide = new Set(P.hide || []);
  // 同页替他在页上放的那一张（me1）不算她贴的
  const stk = (P.stk || []).filter((o) => o && !o.me1);
  const lines = [`手帐：有一页（${R.by === "me" ? "你排的" : "她自己拼的"}；版式 ${TY_LAYOUTS[info.layout] || info.layout}，风格 ${TY_STYLES[info.style] || info.style}）`];
  const ti = R.herTitle || R.title;
  if (ti && !hide.has("ti")) lines.push(`  标题：${one(ti)}${R.herTitle ? `（她自己起的${R.by === "me" && R.title && R.title !== R.herTitle ? `；你起的是“${one(R.title)}”` : ""}）` : ""}`);
  const wx = R.wx || parse(store.peek(`${TY_KV}wx/${day}`));
  if (wx && Number.isFinite(wx.code) && !hide.has("wx")) lines.push(`  天气：${WX_WORD(wx.code)} ${Math.round(wx.lo)}–${Math.round(wx.hi)}°C${R.at ? `（${R.at}）` : ""}`);
  const ph = (R.photos || []).filter((p) => p && p.src);
  const pics = stk.filter((o) => o.c === "pic");
  if (ph.length || pics.length) {
    const bits = [];
    const roles = (r) => ph.filter((p) => p.role === r);
    if (ph.length && !hide.has("he")) bits.push(`主照片${T.cap ? `（底下写着：${one(T.cap)}）` : ""}`);
    if (roles("pair").length) bits.push(`双联照 ${roles("pair").length} 张`);
    if (roles("sh").length) bits.push(`截图 ${roles("sh").length} 张`);
    const rest = ph.length - 1 - roles("pair").length - roles("sh").length;
    if (rest > 0) bits.push(`别的 ${rest} 张`);
    if (pics.length) {
      const caps = pics.map((o) => one(o.m)).filter(Boolean).map((t) => `“${cut(t, 40)}”`);
      bits.push(`她贴上去的 ${pics.length} 张${caps.length ? `（底下写着：${caps.join("、")}）` : ""}`);
    }
    lines.push(`  照片 ${ph.length + pics.length} 张：${bits.join("、")}`);
  }
  const chat = (R.chat || []).filter((x) => x && x.p);
  if (chat.length) lines.push(`  摆的原话：${chat.map(quoteLine).join("｜")}`);
  const herQ = stk.map(quotesOfStk);
  const herQs = herQ.filter(Boolean).flat();
  if (herQs.length) lines.push(`  她贴的原话：${herQs.map(quoteLine).join("｜")}`);
  const qu = T.quote || R.quote;
  if (qu && qu.p && !hide.has("qu")) lines.push(`  引言：${cut(one(qu.p), 80)}`);
  if (T.p1 && !hide.has("p1")) lines.push(`  正文：${one(T.p1)}`);
  if (T.p2 && !hide.has("p2")) lines.push(`  截图说明：${one(T.p2).replace(/<\/?her>/g, "")}`);
  if (T.ann && !hide.has("an")) lines.push(`  照片批注：${one(T.ann)}`);
  if (T.pen && T.pen.text && !hide.has("pe")) lines.push(`  红笔：${one(T.pen.text).replace(/\[\[|\]\]/g, "")}${T.pen.margin ? `（页边：${one(T.pen.margin)}）` : ""}`);
  const f = R.food;
  if (f && (f.items || []).length && !hide.has("tk")) lines.push(`  票根：${[f.meal, f.at].filter(Boolean).map(one).join(" ")}${f.meal || f.at ? "：" : ""}${f.items.map((x) => one(Array.isArray(x) ? x[0] : x)).filter(Boolean).join("、")}`);
  const said = stk.filter((o) => o.c === "text" && one(o.m)).map((o) => `“${cut(one(o.m), 80)}”`);
  if (said.length) lines.push(`  她在页上写的字：${said.join("、")}`);
  const unreadQ = stk.filter((o, i) => o.c === "qsel" && !herQ[i]).length;
  if (unreadQ) lines.push(`  引用的便签 ${unreadQ} 张（这边认不出写的是哪几句）`);
  const others = stk.filter((o) => o.c !== "text" && o.c !== "pic" && o.c !== "qsel").length;
  if (others) lines.push(`  贴纸 ${others} 张`);
  if (hide.size) lines.push(`  她藏起来的：${[...hide].map((k) => TY_BLOCKS[k] || k).join("、")}`);
  return lines.join("\n");
}

// 按词找的时候，这一页上写着的字（标题、正文、说明、红笔、她写的字、照片底下写的、她贴的原话）
export function pageBitsOf(store, day) {
  if (!madeOf(store, day)) return "";
  const R = dayRecOf(store, day) || {};
  const P = pageRecOf(store, day) || {};
  const T = R.text || {};
  const qu = T.quote || R.quote;
  const stk = (P.stk || []).filter((o) => o && !o.me1);
  const her = stk
    .map(quotesOfStk)
    .filter(Boolean)
    .flat()
    .map((q) => q.p);
  return [R.herTitle, R.title, T.p1, T.p2, T.cap, T.ann, T.pen && T.pen.text, qu && qu.p, ...stk.filter((o) => o.c === "text" || o.c === "pic").map((o) => o.m), ...her]
    .filter(Boolean)
    .join("\n")
    .replace(/\[\[|\]\]|<\/?her>/g, "");
}

// 哪几天有手帐、哪几天有几条批注（翻目录用）
export function extrasOf(store) {
  const notes = new Map();
  for (const k of store.keys(`${TY_KV}notes/`)) {
    const n = parse(store.peek(k));
    if (n && n.text && /^\d{4}-\d{2}-\d{2}$/.test(n.day)) notes.set(n.day, (notes.get(n.day) || 0) + 1);
  }
  return { jz: new Set(madeDays(store)), notes };
}

// 他翻到那一天（diary_read）：这一页手帐，加上那一天的批注（回的那几条跟在它回的那一条底下）。都没有回 ""
export function dayTextOf(store, day) {
  const lines = [];
  const page = pageTextOf(store, day);
  if (page) lines.push(page);
  const ns = notesOf(store, day);
  if (ns.length) {
    const ids = new Set(ns.map((n) => n.id));
    const who = (n) => (n.who === "me" ? "你" : "她");
    lines.push(`批注 ${ns.length} 条：`);
    ns.filter((n) => !n.re || !ids.has(n.re)).forEach((n) => {
      lines.push(`  ${who(n)}（${when(n.at)}${TY_BLOCKS[n.b] ? `，贴在${TY_BLOCKS[n.b]}旁边` : ""}）：${n.text}`);
      ns.filter((m) => m.re === n.id).forEach((m) => lines.push(`    ${who(m)}回（${when(m.at)}）：${m.text}`));
    });
  }
  return lines.join("\n");
}

// 他留一条批注（diary_note）：同一步替他办了两回（两台设备）编号一样，只留一条。
// 贴在哪一块旁边：那一天有手帐、认得那一块才贴（同页里是那一块右上角的一颗），不然留在页角上
export async function addHisNote(store, day, note) {
  const id = /^[A-Za-z0-9_-]{1,64}$/.test(String(note.id || "")) ? String(note.id) : "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (store.peek(`${TY_KV}notes/${id}`) != null) return notesOf(store, day);
  const b = madeOf(store, day) ? TOOL_PART[note.part] || "" : "";
  const n = { id, day, who: "me", text: note.text, at: note.at || Date.now(), re: null, b, fx: 0.9, fy: b ? 0.12 : 0.06 };
  await ok(store.set(`${TY_KV}notes/${id}`, JSON.stringify(n)));
  return notesOf(store, day);
}

// 翻日记的工具（diaryTools.js）从这一本里取的几样；App.jsx 的 diaryReader 摊进去
export function tyReader(store) {
  return {
    page: async (day) => dayTextOf(store, day),
    pageBits: async (day) => pageBitsOf(store, day),
    notes: async (day) => notesForTools(store, day),
    extras: async () => extrasOf(store),
    addNote: async (day, note) => {
      await addHisNote(store, day, note);
    },
  };
}

// ---------- 原来那版手帐（src/jz/，10 月 18 日上午上线的那一版）掺的页挪过来 ----------
const OLD_LAYOUT = { column: "column", polaroid: "polaroid", cover: "cover", bento: "bento", scroll: "scroll", letter: "letter" };
const OLD_STYLE = { inkpaper: "qingmo", xuan: "xuan", kraft: "kraft", film: "film", night: "night", washi: "washi", newsprint: "news", chalk: "chalk" };
const OLD_PART = { title: "ti", hero: "he", cap: "he", quote: "he", pen: "pe", body: "p1", her: "p1", him: "p1", wx: "wx", pair: "pa", food: "tk" };
// 原来贴纸的位置是纸宽的几成，同页是像素（手机上那一页大约这么宽）
const PAGE_W = 360;

export function migrateOld(oldPage, oldNotes, day, now = Date.now()) {
  const p = oldPage;
  const a = p.arr;
  const e = p.mine.edit || {};
  const pick = (k) => (e[k] !== undefined ? e[k] : a[k]);
  const pen = pick("pen");
  const text = {};
  if (pick("body")) text.p1 = pick("body");
  if (pick("cap")) text.cap = pick("cap");
  if (pen && pen.text) text.pen = { text: pen.text, margin: pen.margin || "" };
  // 标题：他排的那一页，他起的记成 title，她改过的记成她起的（herTitle：她点题签起的也记在这儿，他再排也不盖）；
  // 她自己拼的，标题都是她起的（herTitle）。她在上一版把他起的删空了的，照删空的（纸上写日子）。
  // 尖括号换全角（同页本子首页那一列把标题当 HTML 画）
  const tl = (t) => tyClean(String(t || "").replace(/\s+/g, " "), 40);
  const title = a.by === "him" && e.title !== "" ? tl(a.title) : "";
  const herTitle = a.by === "him" ? (e.title && e.title !== a.title ? tl(e.title) : "") : tl(pick("title"));
  const R = {
    day,
    status: "done",
    by: a.by === "him" ? "me" : "her",
    ts: p.at || now,
    title,
    layout: OLD_LAYOUT[p.layout] || "column",
    style: OLD_STYLE[p.style] || "qingmo",
    at: tyClean(String((p.wx && p.wx.city) || ""), 40),
    text,
    photos: a.photos.map((x) => ({ src: "kfsimg:" + x.id, role: x.role === "hero" || x.role === "pair" ? x.role : "", note: x.note || "" })),
    chat: a.quotes.map((q) => ({ w: q.w === "him" ? "me" : "her", t: q.t, p: q.p })),
  };
  if (herTitle) R.herTitle = herTitle;
  if (p.wx && Number.isFinite(p.wx.code)) R.wx = { code: p.wx.code, hi: p.wx.hi, lo: p.wx.lo, mm: p.wx.mm || 0, src: p.wx.src || "open-meteo" };
  // 贴纸：表情、颜文字、印章换成同页里对应的那几样；胶带和手绘同页里没有一样的，挪不过来
  const lost = [];
  const stk = [];
  const put = (s, who) => {
    const base = { who, x: Math.round(s.x * PAGE_W), y: Math.round(s.y * PAGE_W), r: s.r || 0, s: s.s || 1, w: null };
    if (s.k.startsWith("e:")) stk.push({ c: "emoji", k: s.k.slice(2), ...base });
    else if (s.k.startsWith("k:")) stk.push({ c: "kao", k: s.k.slice(2), ...base });
    else if (s.k.startsWith("s:")) stk.push({ c: "stamp", k: "yiyue", t: s.k.slice(2), ...base });
    else lost.push(s.k);
  };
  a.stickers.forEach((s) => put(s, "me"));
  p.mine.stickers.forEach((s) => put(s, "her"));
  p.mine.texts.forEach((t) => stk.push({ c: "text", k: "t" + t.id, who: "her", x: Math.round(t.x * PAGE_W), y: Math.round(t.y * PAGE_W), r: t.r || 0, s: t.s || 1, w: null, m: t.m }));
  const hide = [...new Set((p.mine.hide || []).map((k) => OLD_PART[k]).filter(Boolean))];
  const P = { stk, hide, ts: now };
  const notes = (oldNotes || []).map((n) => ({ id: n.id, day, who: n.who === "him" ? "me" : "her", text: n.text, at: n.at || now, re: null, b: OLD_PART[n.part] || "", fx: 0.9, fy: 0.08 }));
  return { R, P, notes, lost };
}

// 原来那版存的页（kfs2:jz:<日子>）还没挪的，挪过来；原来那几条存档留着（不删，要退回那一版还在）
export async function migrateAll(store, now = Date.now()) {
  const moved = [];
  for (const k of store.keys(JZ_KEY)) {
    const day = k.slice(JZ_KEY.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (store.peek(`${TY_KV}day/${day}`) != null || store.peek(`${TY_KV}moved/${day}`) != null) continue;
    const t = store.peek(k);
    if (!t) continue;
    const old = readOldPage(t, day);
    if (!old) continue;
    const { R, P, notes, lost } = migrateOld(old, readOldNotes(store.peek(JZN_KEY + day)), day, now);
    await ok(store.set(`${TY_KV}day/${day}`, JSON.stringify(R)));
    await ok(store.set(`${TY_KV}page/${day}`, JSON.stringify(P)));
    for (const n of notes) await ok(store.set(`${TY_KV}notes/${n.id}`, JSON.stringify(n)));
    await ok(store.set(`${TY_KV}moved/${day}`, JSON.stringify({ at: now, lost })));
    moved.push({ day, lost });
  }
  // 上一版那几天只有批注、没有页的（她在闲笔集那一天底下留的、他翻日记留的、“点开不动不存”收掉了页的）：批注也挪过来。
  // 编号已经有了的不再挪；挪过记一笔（同上），往后她在这边删了的，不会从上一版的存档里又冒出来
  for (const k of store.keys(JZN_KEY)) {
    const day = k.slice(JZN_KEY.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || store.peek(`${TY_KV}moved/${day}`) != null) continue;
    const list = readOldNotes(store.peek(k));
    if (!list.length) continue;
    let n = 0;
    for (const [i, x] of list.entries()) {
      const id = /^[A-Za-z0-9_-]{1,64}$/.test(String(x.id || "")) ? String(x.id) : `jzn${day.replace(/-/g, "")}${i}`;
      if (store.peek(`${TY_KV}notes/${id}`) != null) continue;
      await ok(store.set(`${TY_KV}notes/${id}`, JSON.stringify({ id, day, who: x.who === "him" ? "me" : "her", text: x.text, at: x.at || now, re: null, b: "", fx: 0.9, fy: 0.08 })));
      n++;
    }
    await ok(store.set(`${TY_KV}moved/${day}`, JSON.stringify({ at: now, lost: [], notes: n })));
    moved.push({ day, lost: [], notes: n });
  }
  return moved;
}

// ---------- 天气：她填过在哪儿（kfs2:jzcfg），这一天还没有就取一回，写进同页的 wx/<日子>；那一天有 day 的，也写进那一天的页 ----------
// 取过了（wx 有了）就不再取；那一天的 day 是后起的（点开不动关了、删了又找回来、她头一回动手），没有天气的照取过的写进去。取了一回回那一条，没取回 null
export async function fillWeather(store, day, cfg, fetchWx) {
  let rec = parse(store.peek(`${TY_KV}wx/${day}`));
  const keys = [];
  let fetched = false;
  if (!rec) {
    const city = cfg && cfg.city;
    if (!city) return null;
    const w = await fetchWx(city, day);
    rec = { at: tyClean(String(city.name || ""), 40), code: w.code, hi: w.hi, lo: w.lo, mm: w.mm || 0, wind: Number.isFinite(w.wind) ? w.wind : 0, sun: w.sun || "—", src: "open-meteo" };
    await ok(store.set(`${TY_KV}wx/${day}`, JSON.stringify(rec)));
    keys.push(`${TY_KV}wx/${day}`);
    fetched = true;
  }
  const R = dayRecOf(store, day);
  if (R && !R.wx && Number.isFinite(rec.code)) {
    // 同页收这一页的时候拿 R.wx 整个盖掉那一天的天气（不是合并）：日落也写进来，不然天气贴纸上的日落没了
    R.wx = { code: rec.code, hi: rec.hi, lo: rec.lo, mm: rec.mm || 0, wind: rec.wind || 0, sun: rec.sun || "—", src: rec.src || "open-meteo" };
    if (!R.at && rec.at) R.at = tyClean(String(rec.at), 40);
    await ok(store.set(`${TY_KV}day/${day}`, JSON.stringify(R)));
    keys.push(`${TY_KV}day/${day}`);
  }
  if (keys.length) tyChanged(keys);
  return fetched ? rec : null;
}

// 那一天聊天里的原话（同页的引用栏、他排的时候用）：her / me（同页管他叫 me）
export function chatOf(msgs) {
  return materialsOf(msgs).quotes.map((q) => ({ w: q.w === "him" ? "me" : "her", t: q.t, p: q.p }));
}

// ---------- 光义排一页（同页的「交给光义」） ----------
// 她在那一屏挑几张照片、说一句想要什么样，点发送：同页写一张 ask/<编号>（makeServer 的 set 看见了交给 App.jsx 的 tyArrange），
// 开封府另问他一回（跟让他写日记一样不进聊天、不进前情提要），他回一段 JSON，这里照规矩收拾成那一天的 day（他排的那一份）。
// 规矩照同页给 agent 的说明（vendor/tongye/server/AGENT.md）和上一版定的（开发说明“闲笔集掺手帐”那一节第 8 条）：
//   原话只认编号、字照原话抄；照片只认编号；没有的不编（照片里没有地点就不画路线、没有天气就空着）；
//   她那一层（page/<日子>：她贴的、打的字、藏的零件）一样不碰；她自己起的标题、自己挑过的版式风格照她的。
// 排的时候 day 里记着进度：status 是 making，steps 一步一步写（同页“在排”那一栏、本子首页“光义在做”照着亮），
// mk 里记着排之前那一份（没排成放回去）。

// 同页的版式、风格各是什么样（build.mjs 从同页那一页里抄出来的，tools/tongye.mjs 的 tyKit）；单测里没有，只给名字。
// 路线图那一种不给他挑：开封府的照片里没有地点，路线画不出来，那一种最上面会空着
/* global __KFS_TYKIT__ */
const KIT = typeof __KFS_TYKIT__ !== "undefined" ? __KFS_TYKIT__ : null;
export const tyKitList = (kind) =>
  ((KIT && KIT[kind]) || Object.entries(kind === "layouts" ? TY_LAYOUTS : TY_STYLES).map(([id, name]) => [id, name, ""])).filter(([id]) => id !== "routemap");

export const TY_PHOTO_MAX = 10; // 寄给他看几张（长边 512）
export const TY_QUOTE_MAX = 8; // 一页最多摆几句原话（同页的原话便签最多摆八句）
export const TY_STALE = 10 * 60 * 1000; // 排了十分钟还没排完：当排到一半断了（开封府被关了）
export const TY_WAIT = 5 * 60 * 1000; // 问他那一回最多等五分钟（比上面那个短：这一台自己先说没排成）
// 这一本从哪天写起：同页搬进开封府、上线的那一天（她 10 月 18 日定的“就从今天开始”）。本子首页那一句“从 10.18 写到今天，第几天”照它算；
// 同页原来写的是今天往前 120 天那一天（它首页那一张格子从那一天排起，格子照旧）
export const TY_START = "2026-10-18";
export const tyTag = (i) => `照片${i + 1}`;
const ROLES = ["hero", "pair", "sh"];
// 他留批注能贴的几块（同页的零件）
const NOTE_BLOCKS = ["ti", "wx", "p1", "he", "pa", "sh", "pe", "an", "p2", "qu"];

// 他写的字：同页有几处把标题、地名直接当 HTML 画（本子首页那一列），尖括号、& 换成全角的；控制字符去掉（换行留着）；截到上限
export function tyClean(s, n) {
  if (typeof s !== "string") return "";
  const t = s
    .replace(/[<>&]/g, (c) => ({ "<": "＜", ">": "＞", "&": "＆" })[c])
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .trim();
  return clip(t, n).trim();
}

// 她自己挑过这一页的版式、风格没有：同页离开一天的时候把眼下的版式风格记下来（journalLook），跟那一页本来的一样的算没挑过
export function herLookOf(store, day, R) {
  const L = lookOf(store, day);
  if (!L || (!L.layout && !L.style)) return null;
  const n = ((R && R.photos) || []).filter((p) => p && p.src).length;
  const lay = (R && R.layout) || (n >= 4 ? "polaroid" : n ? "cover" : "column");
  const sty = (R && R.style) || "qingmo";
  const look = { layout: L.layout || lay, style: L.style || sty };
  return look.layout === lay && look.style === sty ? null : look;
}

// 叫他排这一天的那一回寄什么。回 { rule, text }：rule 跟在名帖后面；text 是寄去的字（图在 App.jsx 里接在后面）
//   label   哪天（“2026年10月18日 星期日”）；her 她叫什么
//   quotes  那天的原话（materialsOf 的 quotes：{ id, w, t, p }）
//   notes   那天狐宇宙里的便签（同上；她 10 月 22 日说的“可以”给他挑），另列一段、写明是狐宇宙里的，编号跟原话一起挑
//   photos  寄给他看的那几张：[{ tag, from, t }]（from：asked 她发过来的、page 这一页上原来的、chat 聊天里的）
//   diary   那天的日记 { her: { text, moods }, him: { text, moods } }
//   wx、at  天气、在哪儿（有就带）
//   wish    她说想要什么样
//   keep    她动过的：{ hide: [零件], texts: [她打的字], title: 她起的标题, look: { layout, style } }
export function tyArrangeAsk({ label, her = "她", quotes = [], notes = [], photos = [], diary = {}, wx = null, at = "", wish = "", keep = {} }) {
  const moods = (side) =>
    ((side && side.moods) || [])
      .map((k) => (MOODS.find((m) => m.k === k) || {}).t)
      .filter(Boolean)
      .join("、");
  const list = (kind) =>
    tyKitList(kind)
      .map(([id, name, tag]) => `${id}（${name}${tag ? "：" + tag : ""}）`)
      .join("；");
  const rule = `【排手帐】
这次不是聊天。${her}在闲笔集的手帐本子里点了「交给你」，要你把${label}排成一页。手帐是哪天有心情就掺进去的一页，排的是那天现成的东西：照片、聊天里的原话、你们俩的日记和心情、天气。
你要做的：
- 挑照片：主照片一张（hero）；有合适的再挑双联照两张（pair）、一张截图放进手机框（sh）。挑你记得她在意的那几张，不是挑最清楚、最热闹的。她发过来的那几张是她挑的，先看那几张。照片只写编号（照片1、照片2……），不放照片也行。
- 挑话：从这天聊天里的原话里挑几句（最多八句），挑拍照前后、跟照片里的东西有关的。${notes.length ? "狐宇宙里的便签（你屋里的：她留的、你在屋里说的）也能挑，跟原话合在一起最多八句。" : ""}只写编号，字由开封府照原话抄，一个字都不会改；挑不出合适的就不挑，不要编一句像原话的话。
- 写字：用你的口气写给她看，短一点。标题二十个字以内；正文 p1 一百字以内；主照片底下那一行 cap 十几个字。截图说明 p2、双联照底下那一行 ann、红笔 pen（一两句话，要划线的那几个字用 [[ ]] 包起来，margin 是页边一句，十个字以内），可以写，也可以不写。
- 版式、风格：各挑一种，只能用下面列着的；拿不准就不写，本子照照片多少自己挑。
- 想在某一块旁边留一句批注的，写 note（text 是那一句，b 是贴在哪一块：ti 题签、wx 天气签、p1 正文、he 主照片、pa 双联照、sh 截图、pe 红笔），不想留就不写。
- 没有的东西不编：照片里没有地点、拍摄参数，不写路线、参数；没有天气就空着。
- 她已经动过的别碰：她藏起来的零件不会摆回来，她在页上打的字、她自己起的标题、她自己挑的版式风格，都照她的，你写的盖不掉。
- 版式：${list("layouts")}。
- 风格：${list("styles")}。
只回一段 JSON，夹在单独一行的 [JZ] 和单独一行的 [/JZ] 中间，前后不要别的话，不要 <thinking>，不要 [SPLIT]、[MEME] 这些记号。样子：
[JZ]
{"layout":"polaroid","style":"xuan","title":"……","p1":"……","cap":"……","pen":{"text":"……[[……]]……","margin":"……"},"quotes":["q3","q7"],"photos":[{"id":"照片2","role":"hero","note":"……"},{"id":"照片1","role":"pair"},{"id":"照片3","role":"pair"}],"note":{"text":"……","b":"he"}}
[/JZ]
role 只有 hero（主照片，一张）、pair（双联照，两张）、sh（截图，一张）。`;
  const lines = [`这一天：${label}`];
  if (wx && Number.isFinite(wx.code)) lines.push(`天气：${WX_WORD(wx.code)}${Number.isFinite(wx.lo) && Number.isFinite(wx.hi) ? ` ${Math.round(wx.lo)}–${Math.round(wx.hi)}°C` : ""}${at ? `（${at}）` : ""}`);
  const herM = moods(diary.her);
  const himM = moods(diary.him);
  lines.push(diary.her && (diary.her.text || herM) ? `\n她这天的日记${herM ? `（心情：${herM}）` : ""}：\n${(diary.her && diary.her.text) || "（只选了心情，没写字）"}` : "\n她这天没写日记。");
  lines.push(diary.him && diary.him.text ? `\n你这天的日记${himM ? `（心情：${himM}）` : ""}：\n${diary.him.text}` : "\n你这天没写日记。");
  if (quotes.length) {
    lines.push(`\n这天聊天里的原话（编号｜几点｜谁｜原话）：`);
    quotes.forEach((q) => lines.push(`${q.id}｜${q.t}｜${q.w === "her" ? her : "你"}｜${clip(String(q.p).replace(/\s+/g, " "), 160)}`));
  } else lines.push("\n这天你们没在开封府聊天。");
  if (notes.length) {
    lines.push(`\n这天狐宇宙里的便签（你屋里的：${her}留的、你在屋里说的；编号｜几点｜谁｜原话）：`);
    notes.forEach((q) => lines.push(`${q.id}｜${q.t}｜${q.w === "her" ? her : "你"}｜${clip(String(q.p).replace(/\s+/g, " "), 160)}`));
  }
  const FROM = { asked: "她发过来的", page: "这一页上原来的", chat: "聊天里的" };
  if (photos.length) lines.push(`\n照片 ${photos.length} 张，图附在最后，照顺序是：${photos.map((x) => `${x.tag}（${FROM[x.from] || ""}${x.t ? " " + x.t : ""}）`).join("、")}。`);
  else lines.push("\n这天没有照片。");
  if (typeof wish === "string" && wish.trim()) lines.push(`\n她说想要：${clip(wish.trim().replace(/\s+/g, " "), 300)}`);
  const bits = [];
  if (keep.hide && keep.hide.length) bits.push(`她藏起来的：${keep.hide.map((k) => TY_BLOCKS[k] || k).join("、")}（不会摆出来）`);
  if (keep.texts && keep.texts.length) bits.push(`她自己在页上打的字：${keep.texts.map((t) => `“${clip(one(t), 80)}”`).join("、")}`);
  if (keep.title) bits.push(`她自己起的标题：“${keep.title}”（照她起的摆，你起的盖不掉）`);
  if (keep.look) bits.push(`她自己挑的版式、风格：${TY_LAYOUTS[keep.look.layout] || keep.look.layout} × ${TY_STYLES[keep.look.style] || keep.look.style}（照她挑的摆）`);
  if (bits.length) lines.push(`\n这一页她已经动过：${bits.join("；")}。`);
  lines.push("\n排吧。");
  return { rule, text: lines.join("\n") };
}

// 他回的那一段拆出来、照规矩收拾好（tags：寄给他看的那几张的编号；quotes：那天的原话）。
// 回 { layout, style, title, text, quotes, photos: [{ tag, role, note }], note }；拆不出来、什么都没排抛错（e.why：没排成的时候跟她说的那一句）
export function parseTyArrange(said, quotes = [], tags = []) {
  const fail = (why) => Object.assign(new Error(why), { why });
  const m = /\[JZ\]\s*([\s\S]*?)\s*\[\/JZ\]/i.exec(said || "") || /(\{[\s\S]*\})/.exec(said || "");
  if (!m) throw fail("回的里头没有排好的那一段，再交给我一回试试");
  // 他有时候会把那一段再包一层 ```json …```，或者前后多一两句话：剥掉包的那一层，再不行就取里头头一个 { 到最后一个 }
  const body = m[1].trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "");
  let o = null;
  try {
    o = JSON.parse(body);
  } catch (e) {
    const a = body.indexOf("{");
    const b = body.lastIndexOf("}");
    try {
      o = a >= 0 && b > a ? JSON.parse(body.slice(a, b + 1)) : null;
    } catch (x) {
      o = null;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) throw fail("回的那一段看不懂，再交给我一回试试");
  const text = {};
  const p1 = tyClean(o.p1 != null ? o.p1 : o.body, 600);
  if (p1) text.p1 = p1;
  for (const [k, n] of [
    ["cap", 80],
    ["p2", 200],
    ["ann", 200],
  ]) {
    const v = tyClean(o[k], n);
    if (v) text[k] = v;
  }
  if (o.pen && typeof o.pen === "object") {
    const t = tyClean(o.pen.text, 200);
    if (t) text.pen = { text: t, margin: tyClean(o.pen.margin, 30) };
  }
  const want = new Set((Array.isArray(o.quotes) ? o.quotes : []).map(String));
  const qs = (quotes || []).filter((q) => want.has(String(q.id))).slice(0, TY_QUOTE_MAX);
  const known = new Set(tags);
  const photos = [];
  (Array.isArray(o.photos) ? o.photos : []).forEach((x0) => {
    const x = typeof x0 === "string" ? { id: x0 } : x0;
    const tag = x && typeof x === "object" ? String(x.id || "").replace(/\s/g, "") : "";
    if (!known.has(tag) || photos.some((p) => p.tag === tag)) return;
    photos.push({ tag, role: ROLES.includes(x.role) ? x.role : "", note: tyClean(x.note, 60) });
  });
  // 主照片一张、截图一张、双联照两张（只挑了一张的不成对，当没挑角色）
  let hero = 0;
  let sh = 0;
  let pair = 0;
  photos.forEach((p) => {
    if (p.role === "hero" && ++hero > 1) p.role = "";
    if (p.role === "sh" && ++sh > 1) p.role = "";
    if (p.role === "pair" && ++pair > 2) p.role = "";
  });
  if (pair === 1) photos.forEach((p) => p.role === "pair" && (p.role = ""));
  const has = (obj, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(obj, k);
  const layout = has(TY_LAYOUTS, o.layout) && o.layout !== "routemap" ? o.layout : "";
  const style = has(TY_STYLES, o.style) ? o.style : "";
  // 标题一行：空白（连全角空格、换行）收成一个空格，同她起的（不然她点开题签不改就走，会当成她改了）
  const title = tyClean(typeof o.title === "string" ? o.title.replace(/\s+/g, " ") : o.title, 40);
  const n = o.note && typeof o.note === "object" ? o.note : null;
  const nt = n ? tyClean(n.text, 300) : "";
  const note = nt ? { text: nt, b: NOTE_BLOCKS.includes(n.b) ? n.b : "" } : null;
  // 什么都没排（{}、只有对不上的编号）：不算排好，那一天原样不动
  if (!title && !Object.keys(text).length && !qs.length && !photos.length && !layout && !style) throw fail("什么都没排出来，再交给我一回试试");
  return { layout, style, title, text, quotes: qs, photos, note };
}

// 交给他了：那一天的 day 记上“在排”。排之前有页的照旧摆着（同页照 steps 亮“在排”），那一份记在 mk.prev（没排成放回去）。
// 上一回排到一半断了的（还记着“在排”，过了十分钟又交给他）：排之前那一份照它记着的 mk.prev，不然没排成的时候放不回去；
// 她起的标题照这会儿的（排着的那一份上她可能刚起过、清空过）
export function makingDay(prev, day, steps, now = Date.now()) {
  const base = prev && prev.status === "making" ? (prev.mk && prev.mk.prev) || null : prev;
  const was = base && base.status !== "failed" && base.status !== "making" ? base : null;
  const R = { ...(was || { day, by: "me", title: "", ts: now }), status: "making", steps, mk: { at: now, prev: was } };
  const her = prev && prev.status === "making" ? (typeof prev.herTitle === "string" ? prev.herTitle : "") : (was && was.herTitle) || "";
  if (her) R.herTitle = her;
  else delete R.herTitle;
  return R;
}
// 没排成：排之前有页的放回去（记一步“没排成”，同页“在排”那一栏照着说）；没有的记一个 failed（什么都没有，日历上不标、同页不起页）。
// 他排的那一会儿她起了标题（herTitle：排着的那一份上记着的）：照她起的；原来没有页的，就起成她的一页
export function failedDay(making, day, steps, now = Date.now()) {
  const was = making && making.mk ? making.mk.prev : null;
  const her = making && typeof making.herTitle === "string" ? making.herTitle : "";
  if (was) {
    const R = { ...was, steps };
    if (her) R.herTitle = her;
    else delete R.herTitle;
    return R;
  }
  if (her) return { day, status: "done", by: "her", title: "", herTitle: her, ts: now, steps };
  return { day, status: "failed", by: "me", title: "", ts: now, steps };
}
// 他排好的那一份写成那一天的 day（同页 BACKEND.md 的样子）：他排的、排好的、这会儿的钟点。
// src(tag)、time(tag)：照片寄过去的编号 → 存档里的 kfsimg:<编号>、几点；她自己起的标题（herTitle）留着
export function arrangedDay(herTitle, A, { day, src, time = () => "", wx = null, at = "", now = Date.now(), steps = [] }) {
  const order = { hero: 0, pair: 1, sh: 2, "": 3 };
  const photos = A.photos
    .slice()
    .sort((a, b) => order[a.role] - order[b.role])
    .map((p) => ({ src: src(p.tag) || "", role: p.role, t: time(p.tag) || "", note: p.note }))
    .filter((p) => p.src);
  // 他挑的狐宇宙里的便签：记着 src（他翻日记的时候写明是狐宇宙里的；同页收这一份的时候照抄进引用栏，那几句底下小字写“便签”）。
  // 页上摆的那几句同页不写出处（原话那一块只摆几点、谁说的），这里不改它
  const R = {
    day,
    status: "done",
    by: "me",
    ts: now,
    title: A.title,
    text: A.text,
    photos,
    chat: A.quotes.map((q) => ({ w: q.w === "him" ? "me" : "her", t: q.t || "", p: q.p, ...(q.src === "便签" ? { src: "便签" } : {}) })),
  };
  if (A.layout) R.layout = A.layout;
  if (A.style) R.style = A.style;
  if (wx && Number.isFinite(wx.code)) R.wx = { code: wx.code, hi: wx.hi, lo: wx.lo, mm: wx.mm || 0, wind: wx.wind || 0, sun: wx.sun || "—", src: wx.src || "open-meteo" };
  const where = tyClean(at, 40);
  if (where) R.at = where;
  if (herTitle) R.herTitle = herTitle;
  if (steps.length) R.steps = steps;
  return R;
}

// 排到一半开封府被关了（划掉了、没电了）：day 一直记着“在排”。排了十分钟还在排的（这台设备上没在排），当没排成
export async function settleStale(store, busy = new Set(), now = Date.now()) {
  const out = [];
  for (const k of store.keys(`${TY_KV}day/`)) {
    const day = k.slice(`${TY_KV}day/`.length);
    if (busy.has(day)) continue;
    const R = parse(store.peek(k));
    if (!R || R.status !== "making" || !R.mk || now - (Number(R.mk.at) || 0) < TY_STALE) continue;
    const steps = [...(R.steps || []).filter((s) => s && s.ok !== false), { a: "没排成", b: "排到一半断了，再交给我一回", fail: 1 }];
    await ok(store.set(k, JSON.stringify(failedDay(R, day, steps, now))));
    out.push(day);
  }
  if (out.length) tyChanged(out.map((d) => `${TY_KV}day/${d}`));
  return out;
}

// 同页写进来的一张 ask（她点了发送）：只认刚写的、看得懂的那一张。照片只认开封府给的编号（她刚传的、页上的 kfsimg:，聊天里的 kfschat:）
const ASK_KEY = /^kfs2:ty:ask\/([A-Za-z0-9_-]{1,64})$/;
export function askOf(id, o) {
  if (!o || typeof o !== "object" || o.status !== "new" || !okDate(o.day)) return null;
  if (o.text != null && typeof o.text !== "string") return null;
  const photos = (Array.isArray(o.photos) ? o.photos : []).filter((s) => typeof s === "string" && /^kfs(img|chat):[A-Za-z0-9_-]{1,64}$/.test(s)).slice(0, 12);
  return { id, day: o.day, text: clip(String(o.text || ""), 500), photos };
}

// ---------- 框里那一页能找外面要的（bridge.js 的 ask）：只有这一本手帐自己的几样 ----------
// 同页关在隔开的框里（sandbox，碰不到开封府），一问一答都走这儿，每一样都先看清楚要的是不是这一本的东西：
//   get / set / del / list   只认 kfs2:ty:、kfs2:tyls: 开头的键
//   img / imgPut / imgDel    只认 kfs2:jzimg:<编号>，放进来的得是图（data:image/…）
//   mineUsed                 「我的」里删一张之前：别的日子的页、他排的几版、废纸篓里还有没有贴着它的
//   sources / chatPhotos     某一天聊天里的原话（chat）、狐宇宙里的便签（note）、聊天里的照片（引用栏、放照片用）
//   city / geocode / setCity 天气在哪儿
//   touch                    她在那一天头一回真的动了：还没有 day 就起一个（点开的时候什么都不写，见 ensureDay）
//   setTitle                 她自己起的标题（点纸上的题签起的）：写进那一天的 day（herTitle），空的就拿掉
//   typing                   框里有打字的地方拿到、丢了焦点（外面照这个把整层铺到键盘上面，见 TongyeFrame.jsx）
//   close / ready            关上；页面摆好了
// set 写的是一张新的 ask/<编号>（她在「交给光义」那一屏点了发送）：存好以后交给 onAsk（App.jsx 的 tyArrange，另问他一回）
// 别的一概不认（回“不认得”）
export const okKey = (k) => typeof k === "string" && k.length < 300 && (k.startsWith(TY_KV) || k.startsWith(TY_LS)) && !/[\u0000-\u001f]/.test(k);
export const okId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
export const okDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const okImg = (s) => typeof s === "string" && s.length <= 8000000 && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
const LS_BIG = /^kfs2:tyls:(journalPage|journalGens|journalNotes):|^kfs2:tyls:(journalMine|journalDays)$/;

const okCity = (c) =>
  !!c &&
  typeof c === "object" &&
  typeof c.name === "string" &&
  c.name.length > 0 &&
  c.name.length <= 60 &&
  Number.isFinite(c.lat) &&
  Math.abs(c.lat) <= 90 &&
  Number.isFinite(c.lon) &&
  Math.abs(c.lon) <= 180 &&
  (c.tz === undefined || (typeof c.tz === "string" && c.tz.length <= 60)) &&
  (c.where === undefined || (typeof c.where === "string" && c.where.length <= 120));

// 框里的“今天”：同页的日子不带年，只认今天往前一年以内的（见 dates.js）。翻一年以前的那一天：今天挪到那一天的中午
export function todayFor(day, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
  if (!m) return now;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getMonth() !== +m[2] - 1) return now;
  return d <= yearAgoOf(now) ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : now;
}

// dayMsgs(日子)：那一天聊天里的话（狐宇宙不算）；noteMsgs(日子)：那一天狐宇宙里的（她留的、他在屋里说的，引用栏的「便签」那一栏）。
// 照片两边的都算（她在哪儿发的照片都是那一天的照片）
export function makeServer({ store, dayMsgs, noteMsgs, chatImg, onClose, onReady, onFail, onAsk, onTyping, cfgKey, geocode, weather, day }) {
  const notesOn = async (date) => (noteMsgs ? (await noteMsgs(date)) || [] : []);
  const put = async (k, v) => {
    const r = await store.set(k, v);
    if (r === false && onFail) onFail();
    return r !== false;
  };
  const cfgNow = () => parse(store.peek(cfgKey), {}) || {};
  const h = {
    // 天气在哪儿（她在同页的设置里填；记在 kfs2:jzcfg，跟原来那一版手帐同一处）
    city: () => {
      const c = cfgNow().city;
      return c ? { name: c.name, where: c.where || "" } : null;
    },
    geocode: async ({ q }) => (typeof q === "string" && q.trim() && q.length <= 60 && geocode ? (await geocode(q)).slice(0, 6) : []),
    setCity: async ({ city }) => {
      if (!okCity(city)) return false;
      const c = { name: city.name, lat: city.lat, lon: city.lon, tz: city.tz || "auto", where: city.where || "" };
      const cfg = { ...cfgNow(), city: c };
      if (!(await put(cfgKey, JSON.stringify(cfg)))) return false;
      // 换了城市：打开的这一天要是还没有天气，照新的取一回（取到了 fillWeather 会告诉框里）。
      // 她这是真的动了手：那一天还没有 day 就起一个，天气签马上照新取的画出来（不用等她再动一下）
      if (day && weather)
        (async () => {
          try {
            await ensureDay(store, day);
          } catch (e) {}
          await fillWeather(store, day, cfg, weather);
        })().catch(() => {});
      return true;
    },
    get: ({ k }) => (okKey(k) ? store.peek(k) : null),
    set: async ({ k, v }) => {
      if (!(okKey(k) && typeof v === "string" && v.length <= 4000000)) return false;
      const m = ASK_KEY.exec(k);
      const fresh = !!m && store.peek(k) == null;
      const r = await put(k, v);
      if (r && fresh && onAsk) {
        const a = askOf(m[1], parse(v));
        if (a)
          Promise.resolve()
            .then(() => onAsk(a))
            .catch(() => {});
      }
      return r;
    },
    del: async ({ k }) => {
      if (okKey(k)) await store.del(k);
      return true;
    },
    list: ({ prefix }) => {
      if (!okKey(prefix)) return [];
      return store
        .keys(prefix)
        .map((k) => [k, store.peek(k)])
        .filter(([, v]) => v != null);
    },
    img: ({ id }) => {
      if (!okId(id)) return null;
      const v = store.peek(TY_IMG + id);
      return typeof v === "string" && v.startsWith("data:image/") ? v : null;
    },
    imgPut: ({ id, data }) => (okId(id) && okImg(data) ? put(TY_IMG + id, data) : false),
    imgDel: async ({ id }) => {
      if (okId(id)) await store.del(TY_IMG + id);
      return true;
    },
    // 「我的」里删一张之前（她 10 月 22 日、23 日定的“架子”）：还有没有哪一页贴着它？每一天的页（page）、她存的几代（gens）、
    // 废纸篓（trash）里只要提到这个编号就算贴着（宁可多算：多算了只是从架子上拿下来、不真删）。先照本地的看（存档本地是一整份，engine.js）；
    // 本地哪儿都没有，真删之前再跟云端对一回（别的设备刚贴上、还没同步过来的；最多等五秒，同 App.jsx 的 tySync），没网、对不上就当它还贴着
    mineUsed: async ({ id }) => {
      if (!okId(id)) return true;
      const used = () => ["page/", "gens/", "trash/"].some((p) => store.keys(TY_KV + p).some((k) => String(store.peek(k) ?? "").includes(id)));
      if (used()) return true;
      if (typeof store.syncNow !== "function") return false;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
      let done = false;
      try {
        await Promise.race([Promise.resolve(store.syncNow()).then(() => (done = true)), new Promise((r) => setTimeout(r, 5000))]);
      } catch (e) {}
      let st = {};
      if (typeof store.onStatus === "function") store.onStatus((s) => (st = s || {}))();
      if (!done || st.offline || st.error) return true;
      return used();
    },
    // 她在那一天头一回真的动了（同页要存那一页、存一代）：还没有 day 就起一个（见 ensureDay）
    touch: async ({ date }) => {
      if (!okDate(date)) return false;
      try {
        await ensureDay(store, date);
        return true;
      } catch (e) {
        if (onFail) onFail();
        return false;
      }
    },
    // 她自己起的标题：一行，二十个字以内（尖括号换全角，同他起的）；起标题算她动了手，那一天还没有 day 就先起一个
    setTitle: async ({ date, title }) => {
      if (!okDate(date) || typeof title !== "string" || title.length > 200) return false;
      const t = tyClean(title.replace(/\s+/g, " "), 20);
      try {
        await ensureDay(store, date);
        const R = dayRecOf(store, date);
        if (!R) return false;
        if (t) R.herTitle = t;
        else delete R.herTitle;
        // 她自己拼的一页：title 里记着的也是她起的（照她这一回的；清空就写日子）
        if (R.by !== "me") R.title = "";
        if (!(await put(`${TY_KV}day/${date}`, JSON.stringify(R)))) return false;
        tyChanged([`${TY_KV}day/${date}`]);
        return true;
      } catch (e) {
        if (onFail) onFail();
        return false;
      }
    },
    sources: async ({ date }) => (okDate(date) ? { date, chat: chatOf(await dayMsgs(date)), note: chatOf(await notesOn(date)), book: [], health: [] } : { chat: [], note: [] }),
    chatPhotos: async ({ date }) => {
      if (!okDate(date)) return [];
      const out = [];
      for (const p of materialsOf([...(await dayMsgs(date)), ...(await notesOn(date))]).photos) {
        const data = await chatImg(p.imgId);
        if (typeof data === "string" && data.startsWith("data:image/")) out.push({ id: p.imgId, t: p.t, data });
      }
      return out;
    },
    typing: ({ on }) => {
      if (onTyping) onTyping(on === true);
      return true;
    },
    close: () => {
      if (onClose) onClose();
      return true;
    },
    ready: () => {
      if (onReady) onReady();
      return true;
    },
  };
  return {
    async handle(method, args) {
      if (!Object.prototype.hasOwnProperty.call(h, method)) throw new Error("不认得");
      return h[method](args && typeof args === "object" ? args : {});
    },
    // 开门那一下带进去的：这一本存在“这台设备上”的那几样（小的；db 那几样的缓存不带，同页自己会再取）
    // heat：每一天聊了几句（狐宇宙不算）；noteHeat：每一天狐宇宙里有几句（便签那一栏的日历）
    init({ day, mode, heat, noteHeat, safe, now = Date.now() }) {
      const ls = {};
      for (const k of store.keys(TY_LS)) {
        if (LS_BIG.test(k)) continue;
        const v = store.peek(k);
        if (v != null) ls[k] = v;
      }
      return { today: todayFor(day, now), ls, heat: heat || {}, noteHeat: noteHeat || {}, open: { day, mode }, safe: safe || null, start: TY_START };
    },
  };
}
