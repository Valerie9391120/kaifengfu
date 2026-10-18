// =====================================================
// 闲笔集里掺的手帐（卿卿 2026 年 10 月 18 日凌晨要的，见开发说明“闲笔集掺手帐”那一节）。不碰界面。
//
// 她的话：“比起升级我更想用掺和这个词来形容，因为不可能每天都有做手账的心情呀”：文字日记照旧，
// 哪天有心情就给那一天掺一页手帐。一页上排的是那天现成的东西：照片、聊天里的原话、两个人的日记、心情、她拍的饭、天气。
// 她自己拼、让他排，两样都有；两个人都能留批注（跟日记一样，他想翻、翻到了就看见）。
//
// 样子是照幡幡的“同页”（TangfanOVO/tongye）的意思自己写的：版式和风格两根轴分开选，骰到喜欢的就留着；
// 代码一行没搬（它是 AGPL，开封府的协议不改，见开发说明“下一步：邸报、同页手帐”那一节）。
//
// 存法（都加密了跟着云端走）：
//   kfs2:jz:<年-月-日>     那一天的一页（PAGE 见下面）
//   kfs2:jzn:<年-月-日>    那一天的批注：[{ id, who: "her" | "him", text, at, part }]（没有手帐页也能有：批注是留在那一天上的）
//   kfs2:jzimg:<编号>      手帐页上的照片，另存一份（聊天删了它还在），长边压到 960
//   kfs2:jzcfg             手帐的设置：天气在哪儿 { city: { name, lat, lon, tz } }
//
// 一页（PAGE）分两层，他重排的时候只换“排的那一份”，她改过的那一层留着（同页的规矩：别把她藏掉的排回来，别盖掉她自己打的字）：
//   {
//     v: 1, day: "2026-10-18",
//     layout, style,                     版式、风格（谁最后挑的算谁的）
//     arr: {                             排的那一份
//       by: "her" | "him", at,
//       title, body, cap,                标题、正文、主照片底下那一行
//       pen: { text, margin },           红笔：[[要划线的字]]，页边一句
//       quotes: [{ id, w, t, p }],       聊天里的原话（照原话拿，一个字不改：挑的时候只认编号，字从原话里抄）
//       photos: [{ id, role, note }],    role：hero 主照片 / pair 双联照 / food 饭 / more 别的
//       stickers: [{ k, x, y, r, s }],   他贴的贴纸（见下面“贴纸”）
//     },
//     mine: {                            她改的那一层
//       edit: { title, body, cap, pen }, 她改过的字（没改过的没有这一项）
//       hide: [零件],                    她藏起来的零件
//       stickers: [...], texts: [{ id, m, x, y, r, s }],   她贴的贴纸、自己打的字
//       at,
//     },
//     wx: { code, hi, lo, mm, city, src } | null,
//     at,
//   }
// 两个人的日记、心情不另抄：每回照闲笔集里眼下的那一份摆（她改了日记，手帐上跟着变）。
//
// 贴纸摆在哪：x 是从左往右第几成（0～1，照纸的宽），y 也照纸的宽算（纸多高看排了多少东西，换版式以后照旧在那个地方）；
// r 转多少度，s 多大（1 是原样）。
// =====================================================
import { dayKeyOf, parseDayKey, MOODS } from "../diary.js";
import { pad, WEEK, dayNumber } from "../days.js";
import { plainOf } from "../rich.js";
import { clip } from "../recap.js"; // 截字不劈开表情（半个表情寄过去，那边整段话都不认）

export const JZ_KEY = "kfs2:jz:";
export const JZN_KEY = "kfs2:jzn:";
export const JZIMG_KEY = "kfs2:jzimg:";
export const JZCFG_KEY = "kfs2:jzcfg";

// ---------- 版式和风格 ----------
// 版式管东西摆在哪，风格管纸和墨（见 look.js）。两根轴分开选，换一根另一根不动
export const LAYOUTS = [
  { k: "column", t: "单栏流", d: "从上到下一栏排下来，什么都有" },
  { k: "polaroid", t: "拍立得墙", d: "照片一张张歪着贴，原话夹在中间" },
  { k: "cover", t: "大图封面", d: "主照片铺满头上，日子和标题压在照片上" },
  { k: "bento", t: "格子便当", d: "一格一格的小方块：日子、天气、心情、照片、原话各占一格" },
  { k: "scroll", t: "立轴", d: "窄窄的一卷，标题竖着写在边上" },
  { k: "letter", t: "信纸", d: "横格纸上写信，字在前头，照片夹在后面" },
];
export const STYLES = [
  { k: "inkpaper", t: "青墨素纸", d: "米白的纸、青墨的字，最素" },
  { k: "xuan", t: "宣纸", d: "带纤维的宣纸、墨色、一方朱印" },
  { k: "kraft", t: "牛皮纸", d: "牛皮纸、白胶带、走线" },
  { k: "film", t: "复古胶片", d: "颗粒、胶片框、等宽的日期" },
  { k: "night", t: "夜航", d: "深蓝的夜、金色的字" },
  { k: "washi", t: "和纸", d: "淡紫的和纸、花纹胶带" },
  { k: "newsprint", t: "报纸", d: "灰白的新闻纸、大标题、分栏线" },
  { k: "chalk", t: "黑板", d: "墨绿的黑板、粉笔字、虚线框" },
];
export const LAYOUT_KEYS = LAYOUTS.map((x) => x.k);
export const STYLE_KEYS = STYLES.map((x) => x.k);
export const layoutOf = (k) => LAYOUTS.find((x) => x.k === k) || LAYOUTS[0];
export const styleOf = (k) => STYLES.find((x) => x.k === k) || STYLES[0];

// 骰一下：从剩下的里抽一个（不抽到眼下这个）。rand 给 [0,1) 的数，测试里换成定的
export function roll(list, now, rand = Math.random) {
  const pool = list.filter((k) => k !== now);
  if (!pool.length) return now;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

// ---------- 零件 ----------
// 一页上能摆的几样。顺序是“单栏流”从上到下的次序；别的版式自己挑着摆
export const PARTS = [
  { k: "head", t: "日子" },
  { k: "title", t: "标题" },
  { k: "wx", t: "天气" },
  { k: "mood", t: "心情" },
  { k: "hero", t: "主照片" },
  { k: "cap", t: "照片底下那一行" },
  { k: "quote", t: "聊天里的原话" },
  { k: "her", t: "卿卿写的" },
  { k: "him", t: "光义写的" },
  { k: "body", t: "正文" },
  { k: "pen", t: "红笔" },
  { k: "pair", t: "双联照" },
  { k: "food", t: "饭" },
  { k: "more", t: "别的照片" },
];
export const PART_KEYS = PARTS.map((p) => p.k);
export const partName = (k) => (PARTS.find((p) => p.k === k) || { t: k }).t;
export const PHOTO_ROLES = ["hero", "pair", "food", "more"];
export const QUOTE_MAX = 6; // 一页最多摆几句原话
export const PHOTO_MAX = 8; // 一页最多几张照片

// ---------- 一页 ----------
export const emptyPage = (day) => ({ v: 1, day, layout: "column", style: "inkpaper", arr: emptyArr("her"), mine: emptyMine(), wx: null, at: 0 });
export const emptyArr = (by) => ({ by, at: 0, title: "", body: "", cap: "", pen: null, quotes: [], photos: [], stickers: [] });
export const emptyMine = () => ({ edit: {}, hide: [], stickers: [], texts: [], at: 0 });

// 存档里取出来的一页收拾一遍：缺的补上、坏的扔掉、版式风格不认得的换成头一个。坏得认不出来回 null
export function readPage(text, day) {
  let o = null;
  try {
    o = typeof text === "string" ? JSON.parse(text) : text;
  } catch (e) {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const p = emptyPage(day || o.day || "");
  p.day = typeof o.day === "string" && o.day ? o.day : p.day;
  p.layout = LAYOUT_KEYS.includes(o.layout) ? o.layout : p.layout;
  p.style = STYLE_KEYS.includes(o.style) ? o.style : p.style;
  p.at = Number(o.at) || 0;
  p.wx = o.wx && typeof o.wx === "object" && Number.isFinite(Number(o.wx.code)) ? { ...o.wx, code: Number(o.wx.code) } : null;
  const a = o.arr && typeof o.arr === "object" ? o.arr : {};
  p.arr = {
    by: a.by === "him" ? "him" : "her",
    at: Number(a.at) || 0,
    title: str(a.title, 40),
    body: str(a.body, 2000),
    cap: str(a.cap, 80),
    pen: penOf(a.pen),
    quotes: (Array.isArray(a.quotes) ? a.quotes : []).filter((q) => q && typeof q.p === "string" && q.p).slice(0, QUOTE_MAX).map((q) => ({ id: String(q.id || ""), w: q.w === "him" ? "him" : "her", t: str(q.t, 5), p: q.p })),
    // from：从聊天里哪张照片另存来的（排的东西那一张里，那张聊天照片就不再让挑一回）
    photos: (Array.isArray(a.photos) ? a.photos : []).filter((x) => x && x.id).slice(0, PHOTO_MAX).map((x) => ({ id: String(x.id), role: PHOTO_ROLES.includes(x.role) ? x.role : "more", note: str(x.note, 60), ...(typeof x.from === "string" && x.from ? { from: x.from } : {}) })),
    stickers: stickersOf(a.stickers),
  };
  const m = o.mine && typeof o.mine === "object" ? o.mine : {};
  const edit = {};
  if (m.edit && typeof m.edit === "object") {
    for (const k of ["title", "body", "cap"]) if (typeof m.edit[k] === "string") edit[k] = m.edit[k];
    if (m.edit.pen !== undefined) edit.pen = penOf(m.edit.pen);
  }
  p.mine = {
    edit,
    hide: (Array.isArray(m.hide) ? m.hide : []).filter((k) => PART_KEYS.includes(k)),
    stickers: stickersOf(m.stickers),
    texts: (Array.isArray(m.texts) ? m.texts : []).filter((t) => t && typeof t.m === "string" && t.m.trim()).map((t) => ({ id: String(t.id || ""), m: clip(t.m, 200), ...placeOf(t) })),
    at: Number(m.at) || 0,
  };
  return p;
}
const str = (s, max) => (typeof s === "string" ? clip(s, max) : "");
const penOf = (pen) => (pen && typeof pen === "object" && typeof pen.text === "string" && pen.text.trim() ? { text: clip(pen.text, 300), margin: str(pen.margin, 40) } : null);
const num = (v, d, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const placeOf = (o) => ({ x: num(o.x, 0.5, -0.2, 1.2), y: num(o.y, 0.3, -0.2, 40), r: num(o.r, 0, -180, 180), s: num(o.s, 1, 0.3, 4) });
function stickersOf(list) {
  return (Array.isArray(list) ? list : []).filter((s) => s && typeof s.k === "string" && s.k).slice(0, 80).map((s) => ({ k: clip(s.k, 80), ...placeOf(s) }));
}

// 摆出来的样子：两层合起来，加上那天的日记和心情、照片的图。
//   diary：闲笔集里那一天的那一条（{ her: { text, moods }, him: { text, moods } }，没有就是 {}）
//   img(id)：照片的图（data: 地址），没取到回 null
// 回 { layout, style, title, body, cap, pen, quotes, hero, pair, food, more, wx, moods, her, him, stickers, texts, hide, has }
// has(零件)：这一块有没有东西、她没藏（版式照它决定摆不摆）
export function viewOf(page, diary = {}, img = () => null) {
  const p = page || emptyPage("");
  const e = p.mine.edit || {};
  const pick = (k) => (e[k] !== undefined ? e[k] : p.arr[k]);
  const photos = p.arr.photos.map((x) => ({ ...x, src: img(x.id) })).filter((x) => x.src);
  const role = (r) => photos.filter((x) => x.role === r);
  let hero = role("hero")[0] || null;
  const pair = role("pair").slice(0, 2);
  const food = role("food")[0] || null;
  let more = role("more").concat(role("hero").slice(1), role("pair").slice(2), role("food").slice(1));
  // 没挑主照片的：头一张当主照片（同页也是这样）
  if (!hero && more.length) {
    hero = more[0];
    more = more.slice(1);
  }
  const moodsOf = (side) => ((side && side.moods) || []).map((k) => MOODS.find((m) => m.k === k)).filter(Boolean);
  const v = {
    day: p.day,
    layout: p.layout,
    style: p.style,
    title: pick("title") || "",
    body: pick("body") || "",
    cap: pick("cap") || (hero && hero.note) || "",
    pen: e.pen !== undefined ? e.pen : p.arr.pen,
    quotes: p.arr.quotes,
    hero,
    pair: pair.length === 2 ? pair : [],
    food,
    more: pair.length === 2 ? more : more.concat(pair),
    wx: p.wx,
    moods: { her: moodsOf(diary.her), him: moodsOf(diary.him) },
    her: (diary.her && diary.her.text) || "",
    him: (diary.him && diary.him.text) || "",
    stickers: p.arr.stickers.concat(p.mine.stickers),
    arrStickers: p.arr.stickers.length, // 前头这几张是排的那一份里的，后头的是她贴的
    texts: p.mine.texts,
    hide: p.mine.hide,
    by: p.arr.by,
  };
  const filled = {
    head: true,
    title: !!v.title,
    wx: !!v.wx,
    mood: v.moods.her.length + v.moods.him.length > 0,
    hero: !!v.hero,
    cap: !!(v.hero && v.cap),
    quote: v.quotes.length > 0,
    her: !!v.her,
    him: !!v.him,
    body: !!v.body,
    pen: !!(v.pen && v.pen.text),
    pair: v.pair.length === 2,
    food: !!v.food,
    more: v.more.length > 0,
  };
  v.has = (k) => !!filled[k] && !v.hide.includes(k);
  return v;
}

// 红笔那一段拆成几截：[[划线的]] 和平常的。回 [{ s, mark }]
export function penParts(text) {
  const out = [];
  const re = /\[\[([^\]\n]{1,80})\]\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text || ""))) {
    if (m.index > last) out.push({ s: text.slice(last, m.index), mark: false });
    out.push({ s: m[1], mark: true });
    last = m.index + m[0].length;
  }
  if (last < (text || "").length) out.push({ s: text.slice(last), mark: false });
  return out;
}

// ---------- 日子 ----------
export function headOf(day) {
  const d = parseDayKey(day);
  return {
    md: `${d.getMonth() + 1}.${pad(d.getDate())}`,
    week: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()],
    weekCn: `星期${WEEK[d.getDay()]}`,
    year: String(d.getFullYear()),
    n: dayNumber(d),
    full: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`,
    cn: `${d.getMonth() + 1}月${d.getDate()}日`,
  };
}

// ---------- 原料：那一天的照片和聊天 ----------
// msgs：那一天的话（App.jsx 的 loadDays 按天归好的，各段对话混在一起），her / him 两种
// 回 { photos: [{ imgId, t, msg }], quotes: [{ id, w, t, p }] }，都照时间排。
// 原话的编号：她的话是那一条的 id；他的话一条回话拆成好几样，编号是“那一条的 id#第几样”。字照气泡里摆出来的（去掉加粗那些记号）
export function materialsOf(msgs) {
  const photos = [];
  const quotes = [];
  const hm = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  (msgs || [])
    .filter((m) => m && (m.role === "her" || m.role === "him"))
    .slice()
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .forEach((m) => {
      if (m.role === "her") {
        if (m.kind === "photo" && m.imgId) photos.push({ imgId: m.imgId, t: hm(m.ts), msg: m.id });
        else if (!m.kind || m.kind === "text") {
          const p = plainOf(m.text || "").trim();
          if (p) quotes.push({ id: m.id, w: "her", t: hm(m.ts), p });
        } else if (m.kind === "voice" && (m.text || "").trim()) quotes.push({ id: m.id, w: "her", t: hm(m.ts), p: m.text.trim() });
        return;
      }
      (m.items || []).forEach((it, j) => {
        if (it && it.type === "text") {
          const p = plainOf(it.text || "").trim();
          if (p) quotes.push({ id: `${m.id}#${j}`, w: "him", t: hm(m.ts), p });
        }
      });
    });
  return { photos, quotes };
}

// 原话照编号拿：挑的人（她在界面上勾、他在回话里写编号）只给编号，字从原话里抄，一个字也改不了。
// 认不出的编号不要；同一句挑两回只算一回；最多 QUOTE_MAX 句；照时间排
export function pickQuotes(ids, quotes) {
  const want = new Set((ids || []).map(String));
  return (quotes || []).filter((q) => want.has(q.id)).slice(0, QUOTE_MAX);
}

// 这一页上已经摆着的原话加上那天聊天里的：同一句（同一个编号）只算一回、页上那份为准，照几点排。
// 那段对话删了、这台设备上没有，页上摆着的也照样在单子里（挑别的那一句的时候不会把它们弄丢）
export function mergeQuotes(saved, mats) {
  const keep = new Map((saved || []).filter((q) => q && q.id).map((q) => [q.id, q]));
  const out = (mats || []).filter((q) => q && q.id).map((q) => keep.get(q.id) || q);
  const ids = new Set(out.map((q) => q.id));
  keep.forEach((q) => {
    if (ids.has(q.id)) return;
    const at = out.findIndex((x) => x.t > q.t);
    out.splice(at < 0 ? out.length : at, 0, q);
  });
  return out;
}

// 一串原话的头尾钟点：“09:46 – 11:45”（一句的就一个）
export function quoteSpan(quotes) {
  if (!quotes || !quotes.length) return "";
  const a = quotes[0].t;
  const b = quotes[quotes.length - 1].t;
  return a === b ? a : `${a} – ${b}`;
}

// ---------- 天气 ----------
// WMO 的天气编号（Open-Meteo 给的）→ 中文和画哪个小图（见 look.js 的 wxIcon）
export function wxName(code) {
  const c = Number(code);
  if (c === 0) return { t: "晴", i: "sun" };
  if (c === 1) return { t: "大致晴", i: "sun" };
  if (c === 2) return { t: "多云", i: "partly" };
  if (c === 3) return { t: "阴", i: "cloud" };
  if (c === 45 || c === 48) return { t: "雾", i: "fog" };
  if (c >= 51 && c <= 57) return { t: "毛毛雨", i: "rain" };
  if (c >= 61 && c <= 67) return { t: c === 61 ? "小雨" : c === 65 ? "大雨" : "雨", i: "rain" };
  if (c >= 71 && c <= 77) return { t: c === 71 ? "小雪" : c === 75 ? "大雪" : "雪", i: "snow" };
  if (c >= 80 && c <= 82) return { t: "阵雨", i: "rain" };
  if (c === 85 || c === 86) return { t: "阵雪", i: "snow" };
  if (c >= 95) return { t: "雷雨", i: "storm" };
  return { t: "天气", i: "cloud" };
}
// 天气那一行：“阴 12–21°C · 雨 3 mm”
export function wxLine(wx) {
  if (!wx) return "";
  const n = wxName(wx.code).t;
  const t = Number.isFinite(wx.lo) && Number.isFinite(wx.hi) ? ` ${Math.round(wx.lo)}–${Math.round(wx.hi)}°C` : "";
  const r = Number(wx.mm) >= 0.5 ? ` · 雨 ${Math.round(wx.mm)} mm` : "";
  return `${n}${t}${r}`;
}

// ---------- 批注 ----------
export function readNotes(text) {
  let list = [];
  try {
    list = JSON.parse(text || "[]");
  } catch (e) {}
  return (Array.isArray(list) ? list : [])
    .filter((n) => n && typeof n.text === "string" && n.text.trim())
    .map((n) => ({ id: String(n.id || ""), who: n.who === "him" ? "him" : "her", text: clip(n.text, 300), at: Number(n.at) || 0, part: PART_KEYS.includes(n.part) ? n.part : "" }))
    .sort((a, b) => a.at - b.at);
}
export const NOTE_MAX = 300;

// ---------- 他排一页 ----------
// 照片给他的编号：“照片1”“照片2”……（图跟着寄过去，他看得见）
export const photoTag = (i) => `照片${i + 1}`;

// 叫他排这一天的那一回寄什么（走写日记那条路，见 App.jsx 的 arrangeByHim）。
//   label     哪天（“2026年10月18日 星期日”）
//   quotes    那天的原话（materialsOf 的 quotes）
//   photos    要给他看的那几张：[{ tag, t }]（图另附）
//   diary     那天的日记 { her: { text, moods }, him: { text, moods } }
//   wx        天气（有就带）
//   keep      她已经改过的：{ hide: [零件], texts: [字], edit: { … } }（重排的时候别碰）
//   stickers  能贴的贴纸的名字（几十个）
// 回 { rule, text }：rule 跟在名帖后面；text 是寄去的字（图在 App.jsx 里接在后面）
export function buildArrangeAsk({ label, quotes = [], photos = [], diary = {}, wx = null, keep = null, stickers = [] }) {
  const moods = (side) => ((side && side.moods) || []).map((k) => (MOODS.find((m) => m.k === k) || {}).t).filter(Boolean).join("、");
  const lay = LAYOUTS.map((l) => `${l.k}（${l.t}：${l.d}）`).join("；");
  const sty = STYLES.map((s) => `${s.k}（${s.t}：${s.d}）`).join("；");
  const rule = `【排手帐】
这次不是聊天。她在闲笔集里给${label}掺了一页手帐，请你来排。闲笔集是你们俩的日记本，手帐是哪天有心情就掺进去的一页，排的是那天现成的东西：照片、聊天里的原话、你们俩的日记和心情、天气。
你要做的：挑一种版式、一种风格，挑主照片（还有双联照、饭，有就挑），从原话里挑几句，起一个标题，写一小段正文，照你记得的、你在意的挑，不是挑最清楚、最热闹的。
规矩：
- 原话只写编号，字由开封府从原话里抄，一个字都不会改；挑不出合适的就不挑，不要编一句像原话的话。
- 照片只写编号（照片1、照片2……）。不放照片也行。
- 标题二十个字以内；正文用你的口气写给她看，短一点，一百字以内；主照片底下那一行（cap）十几个字。
- 红笔（pen）可以不写：写的话是一两句话，要划线的字用 [[ ]] 包起来，margin 是页边一句（十个字以内）。
- 贴纸可以挑几个（不超过四个），只能用下面列着的名字，不挑也行。
- 想在某一块旁边留一句批注的，写 note（text 是那一句，part 是贴在哪一块：hero 主照片、title 标题、quote 原话、her 她的日记、him 你的日记、food 饭、body 正文），不想留就不写。
- 版式：${lay}。
- 风格：${sty}。
只回一段 JSON，夹在单独一行的 [JZ] 和单独一行的 [/JZ] 中间，前后不要别的话，不要 <thinking>，不要 [SPLIT]、[MEME] 这些记号。样子：
[JZ]
{"layout":"polaroid","style":"xuan","title":"……","body":"……","cap":"……","pen":{"text":"……[[……]]……","margin":"……"},"quotes":["q3","q7"],"photos":[{"id":"照片2","role":"hero","note":"……"},{"id":"照片1","role":"food"}],"stickers":["狐狸","画的心"],"note":{"text":"……","part":"hero"}}
[/JZ]
role 只有 hero（主照片，一张）、pair（双联照，两张）、food（饭，一张）、more（别的）。`;
  const lines = [];
  lines.push(`这一天：${label}`);
  if (wx) lines.push(`天气：${wxLine(wx)}${wx.city ? `（${wx.city}）` : ""}`);
  const herM = moods(diary.her);
  const himM = moods(diary.him);
  lines.push(diary.her && (diary.her.text || herM) ? `\n她这天的日记${herM ? `（心情：${herM}）` : ""}：\n${(diary.her && diary.her.text) || "（只选了心情，没写字）"}` : "\n她这天没写日记。");
  lines.push(diary.him && diary.him.text ? `\n你这天的日记${himM ? `（心情：${himM}）` : ""}：\n${diary.him.text}` : "\n你这天没写日记。");
  if (quotes.length) {
    lines.push(`\n这天聊天里的原话（编号｜几点｜谁｜原话）：`);
    quotes.forEach((q) => lines.push(`${q.id}｜${q.t}｜${q.w === "her" ? "卿卿" : "你"}｜${clip(q.p.replace(/\s+/g, " "), 160)}`));
  } else lines.push("\n这天你们没在开封府聊天。");
  if (photos.length) lines.push(`\n照片 ${photos.length} 张，图附在最后，照顺序是：${photos.map((x) => `${x.tag}（${x.t || "她放进来的"}）`).join("、")}。`);
  else lines.push("\n这天没有照片。");
  if (keep && ((keep.hide && keep.hide.length) || (keep.texts && keep.texts.length) || (keep.edit && Object.keys(keep.edit).length))) {
    const bits = [];
    if (keep.hide && keep.hide.length) bits.push(`她藏起来的：${keep.hide.map(partName).join("、")}（不会摆出来）`);
    if (keep.edit && Object.keys(keep.edit).length) bits.push(`她自己改过的：${Object.keys(keep.edit).map(partName).join("、")}（照她改的摆，你写的那几样不会盖掉她的）`);
    if (keep.texts && keep.texts.length) bits.push(`她自己在页上写的字：${keep.texts.map((t) => `“${t}”`).join("、")}`);
    lines.push(`\n这一页她已经动过：${bits.join("；")}。`);
  }
  if (stickers.length) lines.push(`\n能贴的贴纸：${stickers.join("、")}。`);
  lines.push("\n排吧。");
  return { rule, text: lines.join("\n") };
}

// 他回的那一段拆出来、照规矩收拾成“排的那一份”。
//   quotes：那天的原话（他写的编号照它认）；photoIds：{ "照片1": 存好的照片编号, … }；stickerKey(名字)：贴纸的名字 → 贴纸（认不出回 ""）
//   rand：摆贴纸的随机数（测试里换成定的）
// 回 { arr, layout, style, note }（note 是他要留的批注 { text, part }，没有是 null）；拆不出来抛错
export function parseArrange(text, quotes, photoIds = {}, stickerKey = () => "", rand = Math.random, now = Date.now()) {
  const m = /\[JZ\]\s*([\s\S]*?)\s*\[\/JZ\]/i.exec(text || "") || /(\{[\s\S]*\})/.exec(text || "");
  if (!m) throw new Error("他回的里头没有排好的那一段");
  // 他有时候会把那一段再包一层 ```json …```，或者前后多一两句话：剥掉包的那一层，再不行就取里头头一个 { 到最后一个 }
  const body = m[1].trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "");
  let o;
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
    if (!o) throw new Error("他排好的那一段看不懂");
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("他排好的那一段看不懂");
  const photos = [];
  const seen = new Set();
  const own = (k) => (Object.prototype.hasOwnProperty.call(photoIds, k) ? photoIds[k] : "");
  (Array.isArray(o.photos) ? o.photos : []).forEach((x0) => {
    const x = typeof x0 === "string" ? { id: x0 } : x0; // 写成一串编号的（["照片1"]）也认，当“别的”
    const id = x && own(String(x.id || "").replace(/\s/g, ""));
    if (!id || seen.has(id) || photos.length >= PHOTO_MAX) return;
    seen.add(id);
    photos.push({ id, role: PHOTO_ROLES.includes(x.role) ? x.role : "more", note: str(x.note, 60) });
  });
  // 主照片只能一张、饭只能一张、双联照两张：多的挪到“别的”
  let heroes = 0;
  let foods = 0;
  let pairs = 0;
  photos.forEach((x) => {
    if (x.role === "hero" && ++heroes > 1) x.role = "more";
    if (x.role === "food" && ++foods > 1) x.role = "more";
    if (x.role === "pair" && ++pairs > 2) x.role = "more";
  });
  if (pairs === 1) photos.forEach((x) => x.role === "pair" && (x.role = "more"));
  const ks = [];
  (Array.isArray(o.stickers) ? o.stickers : []).slice(0, 4).forEach((n) => {
    const k = stickerKey(String(n || ""));
    if (k && !ks.includes(k)) ks.push(k);
  });
  const arr = {
    by: "him",
    at: now,
    title: str(o.title, 40).trim(),
    body: str(o.body, 600).trim(),
    cap: str(o.cap, 80).trim(),
    pen: penOf(o.pen),
    quotes: pickQuotes(Array.isArray(o.quotes) ? o.quotes : [], quotes),
    photos,
    stickers: scatter(ks, rand),
  };
  // 什么都没排（{}、只有对不上的编号）：不算排好，这一页原样不动（JzPage 报“没排成”）
  const empty = !arr.title && !arr.body && !arr.cap && !arr.pen && !arr.quotes.length && !arr.photos.length && !arr.stickers.length && !LAYOUT_KEYS.includes(o.layout) && !STYLE_KEYS.includes(o.style);
  if (empty) throw new Error("他排好的那一段是空的");
  const note = o.note && typeof o.note === "object" && typeof o.note.text === "string" && o.note.text.trim() ? { text: clip(o.note.text.trim(), NOTE_MAX), part: PART_KEYS.includes(o.note.part) ? o.note.part : "" } : null;
  return { arr, layout: LAYOUT_KEYS.includes(o.layout) ? o.layout : "", style: STYLE_KEYS.includes(o.style) ? o.style : "", note };
}

// 他挑的几张贴纸摆在哪：靠着纸的四边和角，歪一点，不压在正中间的字上
export function scatter(keys, rand = Math.random) {
  const spots = [
    [0.86, 0.2],
    [0.12, 0.62],
    [0.88, 1.15],
    [0.1, 1.6],
    [0.84, 2.1],
  ];
  return keys.map((k, i) => {
    const [x, y] = spots[i % spots.length];
    return { k, x: x + (rand() - 0.5) * 0.06, y: y + (rand() - 0.5) * 0.12, r: Math.round((rand() - 0.5) * 30), s: 1 };
  });
}

// ---------- 给翻日记的工具看的 ----------
// 那一天的手帐、批注写成几行字（diaryTools.js 的 diary_read 用）。page 没有、notes 空的回 ""
export function pageText(page, notes = [], diary = {}) {
  const lines = [];
  if (page) {
    const v = viewOf(page, diary, () => "x");
    const by = page.arr.by === "him" ? "你排的" : "她自己拼的";
    lines.push(`手帐：有一页（${by}；版式 ${layoutOf(page.layout).t}，风格 ${styleOf(page.style).t}）`);
    if (v.has("title")) lines.push(`  标题：${v.title}`);
    if (v.has("wx")) lines.push(`  天气：${wxLine(v.wx)}${v.wx.city ? `（${v.wx.city}）` : ""}`);
    const pics = [v.hero, ...v.pair, v.food, ...v.more].filter(Boolean);
    if (pics.length) {
      // 照片他看不见（只给字），写明几张、各是什么、备注
      const said = (list) => {
        const ns = list.map((p) => p.note).filter(Boolean);
        return ns.length ? `（${ns.join("、")}）` : "";
      };
      const bits = [];
      if (v.hero) bits.push(`主照片${v.cap ? `（底下写着：${v.cap}）` : ""}`);
      if (v.pair.length) bits.push(`双联照 ${v.pair.length} 张${said(v.pair)}`);
      if (v.food) bits.push(`饭${said([v.food])}`);
      if (v.more.length) bits.push(`别的 ${v.more.length} 张${said(v.more)}`);
      lines.push(`  照片 ${pics.length} 张：${bits.join("、")}`);
    }
    if (v.has("quote")) lines.push(`  摆的原话：${v.quotes.map((q) => `${q.t} ${q.w === "her" ? "卿卿" : "你"}：${clip(q.p.replace(/\s+/g, " "), 60)}`).join("｜")}`);
    if (v.has("body")) lines.push(`  正文：${v.body.replace(/\s+/g, " ")}`);
    if (v.has("pen")) lines.push(`  红笔：${v.pen.text.replace(/\[\[|\]\]/g, "")}${v.pen.margin ? `（页边：${v.pen.margin}）` : ""}`);
    if (page.mine.texts.length) lines.push(`  她在页上写的字：${page.mine.texts.map((t) => `“${t.m}”`).join("、")}`);
    const stk = page.arr.stickers.length + page.mine.stickers.length;
    if (stk) lines.push(`  贴纸 ${stk} 张`);
    if (page.mine.hide.length) lines.push(`  她藏起来的：${page.mine.hide.map(partName).join("、")}`);
  }
  if (notes.length) {
    lines.push(`批注 ${notes.length} 条：`);
    notes.forEach((n) => {
      const d = new Date(n.at);
      lines.push(`  ${n.who === "her" ? "她" : "你"}（${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}${n.part ? `，贴在${partName(n.part)}旁边` : ""}）：${n.text}`);
    });
  }
  return lines.join("\n");
}

export { dayKeyOf };
