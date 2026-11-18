// =====================================================
// 他的头像册：她专门给他攒的头像（“头像与设置”里他那张卡片上点“头像册”进来，见 panels/HisBook.jsx）。
// 他换头像只从这里挑（原来是从表情包索引里挑；两处分开是她 11 月 18 日定的）。
//
// 一张有三样：名字（她起的；他写 [AVATAR:名字] 就是照它认，所以册子里不能重、里头不带空白和方括号竖线）、
// 画面、氛围（照表情包库 README 的路子，少一样“图上文字”）。画面和氛围是他自己看着图写的：
// 她传了图、点“整理描述”，开封府把图和 DESC_RULE 那段要求单独寄给他一回（见 App.jsx 的 describeHis），
// 回来的两行存上；她可以让他重写，也可以自己改。**没有描述的不进他的单子**（他挑不着）。
//
// 存法（都加密了跟着云端走）：
//   kfs2:hisbook        { v: 1, list: [{ id, label, look, mood }] }   单子：名字、画面、氛围
//   kfs2:hisbook:<id>   那张图（256 见方的 jpeg，data URL），一张一条
// 他眼下用着的头像（kfs2:avatar:guangyi）换成册子里的一张以后是 { type: "book", id, label, data }：图自己带着，
// 所以从册子里删掉正在用的那一张，头像不变。原来是表情包（{ type: "meme", file }）的照旧认，用到他下回换为止。
// 他回话里换头像那一项：{ type: "avatar", file: 名字, pic: 册子里的 id, data: 图, prev: 换之前那张（不带图） }；
// 没有 pic 的是老记录（file 是表情包的文件名）。
//
// 这里只管纯算的，手机那头（App.jsx）和家里的闹钟（alarm/wake.js）都用。
// =====================================================
import { settleAvatarItems } from "./reply.js";

export const HIS_BOOK_KEY = "kfs2:hisbook";
export const hisPicKey = (id) => `${HIS_BOOK_KEY}:${id}`;
export const HIS_BOOK_MAX = 30; // 最多几张（同她那本）
export const HIS_LABEL_MAX = 12; // 名字最多几个字（同她那本）
export const DESC_MAX = 100; // 画面、氛围各最多这么多字（写给他的要求里是六十、四十；她自己改的时候放宽到这个数）

// ---- 提示词（都是她 11 月 18 日过目、改定的，一个字别动；要动先把前后对照给她看）----
// 名帖里【你的头像】那一段。册子里有带描述的图：
export const HIS_RULE = "想换头像吗？在回复里单独一行写 [AVATAR:头像册里的名字]。换好之后，对话里会出现一行提示，下一轮你会看到新头像图片。";
export const HIS_INDEX_HEAD = "你的头像册（名字｜画面｜氛围）：";
// 册子里一张带描述的都没有：
export const HIS_EMPTY = "头像从头像册里挑，眼下册子里还没有图，等放进来了再换。";
// 叫他看着图写描述的那一回，跟在名帖后面的那段要求
export const descRule = (name) => `【给头像写描述】
头像册里添了一张新图，名字叫「${name}」。图附在后面，以后你换头像的索引就是下面的内容。

写两行，照这个格式：
画面：图上有什么。主体是谁、什么姿态神情，什么颜色、什么画风，背景里有什么。抓重点，不超过六十个字。
氛围：这张图给你什么感觉，什么心情、什么时候适合拿来当头像。简单记录，不超过四十个字。

只写这两行。图上有字的话照抄在画面里。【回复格式】里的规矩这一回都不作数：不写 <thinking>，不拆成几条消息，不要 [SPLIT]、[MEME]、[AVATAR]、[NAME]、[DOC]、[VOICE]、[CALL] 这些记号，也不用跟她说话。`;
// 她点“重写”的那一回，接在上面那段后面
export const descRedo = (look, mood) => `上一回你写的是：
画面：${look}
氛围：${mood}
她想让你重新写一遍，换个写法，别照抄上一回的。`;
// 图前面的那一行记号（寄去的那一条 user 消息：这一行，再是图）
export const descLead = (name) => `〔头像册里的新图：「${name}」〕`;

// 名字：空白都去掉，方括号、书名号、竖线去掉（他写 [AVATAR:名字] 的时候名字里不能有这些；单子里拿竖线隔着），最多 HIS_LABEL_MAX 个字。空的回 ""
export function hisLabel(s) {
  const t = String(s == null ? "" : s).replace(/[\s\[\]【】「」『』｜|]/g, "");
  return Array.from(t).slice(0, HIS_LABEL_MAX).join("");
}
// 画面、氛围：折行和连着的空白收成一个空格，头尾去掉，竖线换成顿号（单子里拿竖线隔着），最多 DESC_MAX 个字
export function cleanDesc(s) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").replace(/[｜|]/g, "、").trim();
  return Array.from(t).slice(0, DESC_MAX).join("").trim();
}

// 存着的那一份 → 单子（图先空着，外面按 hisPicKey 去取）。没有、坏了的：空单子
export function readHisBook(raw) {
  let d = null;
  try {
    d = raw ? JSON.parse(raw) : null;
  } catch (x) {
    d = null;
  }
  if (!d || typeof d !== "object" || !Array.isArray(d.list)) return [];
  const ids = new Set();
  const names = new Set();
  const out = [];
  for (const e of d.list) {
    if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id || ids.has(e.id)) continue;
    const label = hisLabel(e.label);
    if (!label || names.has(label)) continue;
    ids.add(e.id);
    names.add(label);
    out.push({ id: e.id, label, look: cleanDesc(e.look), mood: cleanDesc(e.mood), av: null, pic: true });
    if (out.length >= HIS_BOOK_MAX) break;
  }
  return out;
}
export function packHisBook(list) {
  return JSON.stringify({ v: 1, list: list.map((e) => ({ id: e.id, label: e.label, look: e.look || "", mood: e.mood || "" })) });
}
// 单子带上图：pics(id) 回那张图的 data URL（没有就还空着）
export function withPics(list, pics) {
  return list.map((e) => {
    const data = pics(e.id);
    return typeof data === "string" && data.startsWith("data:image/") ? { ...e, av: { type: "upload", data } } : e;
  });
}
// 从存档里把册子取齐（手机、闹钟都用）：get(key) 回存着的字（Promise）
export async function loadHisBook(get) {
  const idx = readHisBook(await get(HIS_BOOK_KEY));
  const pics = {};
  for (const e of idx) pics[e.id] = await get(hisPicKey(e.id));
  return withPics(idx, (id) => pics[id]);
}

// 有没有描述：画面写了才算
export const described = (e) => !!(e && e.look);
// 他挑得着的那几张：有描述、图在手上
export const pickable = (list) => (list || []).filter((e) => described(e) && e.av);
// 照名字找（只在他挑得着的里头找）
export function findHis(list, name) {
  // 他照着名帖里的写法连书名号一起抄的（[AVATAR:「名字」]）也认
  const n = String(name == null ? "" : name).trim().replace(/^[「『“"]+|[」』”"]+$/g, "");
  return (n && pickable(list).find((e) => e.label === n)) || null;
}

// 添一张。回 { list, entry } 或者 { why }：why 是添不了的缘故（"name" 没起名字、"dup" 名字重了、"same" 这张图已经在里头、"full" 满了、"bad" 不是一张图）
export function addHis(list, av, label, id) {
  if (!id || !av || av.type !== "upload" || !av.data) return { why: "bad" };
  const name = hisLabel(label);
  if (!name) return { why: "name" };
  if (list.some((e) => e.label === name)) return { why: "dup" };
  if (list.some((e) => e.av && e.av.data === av.data)) return { why: "same" };
  if (list.length >= HIS_BOOK_MAX || list.some((e) => e.id === id)) return { why: "full" };
  const entry = { id, label: name, look: "", mood: "", av: { type: "upload", data: av.data }, pic: true };
  return { entry, list: [entry].concat(list) };
}
export const dropHis = (list, id) => list.filter((e) => e.id !== id);
// 改名字。回 { list } 改了；{ why: "dup" } 名字重了；null 不用改（清空了、没动、没有这一行）
export function renameHis(list, id, label) {
  const e = list.find((x) => x.id === id);
  const name = hisLabel(label);
  if (!e || !name || name === e.label) return null;
  if (list.some((x) => x.id !== id && x.label === name)) return { why: "dup" };
  return { list: list.map((x) => (x.id === id ? { ...x, label: name } : x)) };
}
// 改描述（她自己改的、他写回来的都走这儿）。回新单子；没有这一行、没变的回 null
export function describeHisEntry(list, id, look, mood) {
  const e = list.find((x) => x.id === id);
  const l = cleanDesc(look);
  const m = cleanDesc(mood);
  if (!e || (l === e.look && m === e.mood)) return null;
  return list.map((x) => (x.id === id ? { ...x, look: l, mood: m } : x));
}

// 他写回来的那两行 → { look, mood }。没写出“画面”的回 null（氛围可以空着）
export function parseDesc(text) {
  const t = String(text == null ? "" : text).replace(/\r/g, "");
  const m = /(?:^|\n)[ \t>*-]*\**画面\**[：:]([\s\S]*?)(?=\n[ \t>*-]*\**氛围\**[：:]|$)/.exec(t);
  const k = /(?:^|\n)[ \t>*-]*\**氛围\**[：:]([\s\S]*?)(?=\n[ \t>*-]*\**画面\**[：:]|$)/.exec(t);
  const look = cleanDesc(m ? m[1] : "");
  if (!look) return null;
  return { look, mood: cleanDesc(k ? k[1] : "") };
}

// 名帖里【你的头像】那一段的字（小标题不在里头）
export function hisSection(list) {
  const rows = pickable(list);
  if (!rows.length) return HIS_EMPTY;
  return `${HIS_RULE}\n\n${HIS_INDEX_HEAD}\n${rows.map((e) => `${e.label}｜画面：${e.look}｜氛围：${e.mood || "无"}`).join("\n")}`;
}

// ---- 头像本身 ----
// 册子里的一张 → 他用着的头像
export const avOfEntry = (e) => ({ type: "book", id: e.id, label: e.label, data: e.av.data });
// 不带图的那一份（记“换之前那张”用，免得每回换头像都往对话里多存一张图）
export const leanAv = (av) => (av && av.type === "book" ? { type: "book", id: av.id, label: av.label } : av || null);
// 回话里换头像的那一项 → 那张头像（老记录是表情包）
export const avOfItem = (it) => (it && it.pic ? { type: "book", id: it.pic, label: it.file, ...(it.data ? { data: it.data } : {}) } : { type: "meme", file: it && it.file });
// 存着的他的头像认不认：表情包的照旧认；册子里的得带着图
export const hisAvatarOk = (av) => !!av && (av.type === "meme" || (av.type === "book" && typeof av.data === "string" && av.data.startsWith("data:image/")));
// 不带图的那一份补上图：册子里还有这一张就从册子里取，没有了就回 null
export function fatAv(av, list) {
  if (!av || av.type !== "book" || av.data) return av || null;
  const e = (list || []).find((x) => x.id === av.id && x.av);
  return e ? { ...av, data: e.av.data } : null;
}

// 他这一回写的 [AVATAR:名字]：只认册子里他挑得着的，写了好几回只留最后一回（见 reply.js 的 settleAvatarItems）。
// 回 { items, av }：items 里换头像那一项补上是册子里的哪一张（pic、图）和换之前那张（prev，不带图）；av 是换上的那张，没换是 null
export function settleHisAvatar(items, list, prev) {
  const settled = settleAvatarItems(items, (name) => !!findHis(list, name));
  const e = settled.avatarFile ? findHis(list, settled.avatarFile) : null;
  return {
    items: settled.items.map((it) => (it.type === "avatar" && e ? { ...it, file: e.label, pic: e.id, data: e.av.data, prev: leanAv(prev) } : it)),
    av: e ? avOfEntry(e) : null,
  };
}
