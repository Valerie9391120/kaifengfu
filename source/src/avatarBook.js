// =====================================================
// 头像册：她存好的头像，一行一张图、一个名字（“头像与设置”里点“头像册”进来，见 panels/AvatarBook.jsx）。
// 点哪一行最右边的方格就换成哪张；能添（从相册选一张起个名字、把眼下用着的那张存进来），左滑能删，名字能改。
//
// 存法（都加密了跟着云端走）：
//   kfs2:avbook        { v: 1, list: [{ id, label, file } | { id, label, pic: 1 }] }   单子本身，只有名字和“是哪张”
//   kfs2:avbook:<id>   相册里选的那张图（256 见方的 jpeg，data URL）                     一张图一条，添一张只传这一张
// 表情包里的那种只记文件名；相册选的图不放在单子里，免得添一张、删一张都把所有图重传一遍。
// 从没动过的时候（kfs2:avbook 没有）：单子是 STARTERS 那四张，原来写死在头像栏里的那四颗小钮。
// 动过一次就照存着的来；删光了是空单子，不会自己长回来。
// =====================================================
import { sameAv } from "./prompt/messages.js";

export const BOOK_KEY = "kfs2:avbook";
export const picKey = (id) => `${BOOK_KEY}:${id}`;
export const BOOK_MAX = 30;
export const LABEL_MAX = 12;
export const NO_LABEL = "未命名";

export const STARTERS = [
  { label: "白兔", file: "bunny_couple_hate_you.jpg" },
  { label: "小老鼠", file: "mouse_caught.jpg" },
  { label: "吃东西鼠", file: "mouse_eating.jpg" },
  { label: "坏猫", file: "cat_angry_face.jpg" },
].map((p, i) => ({ id: `s${i + 1}`, label: p.label, av: { type: "meme", file: p.file } }));

// 名字：去掉头尾的空、中间连着的空并成一个，最多 LABEL_MAX 个字；空的给一个“未命名”
export function cleanLabel(s) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return Array.from(t).slice(0, LABEL_MAX).join("") || NO_LABEL;
}

// 存着的那一份 → 单子。表情包那种带着 av；相册选的那种 av 先空着、pic 记着，图由外面按 picKey 去取。
// 没有这一条：STARTERS。坏了的（不是 JSON、不是这个样子）也当没有；单子里认不出的行跳过，重了的 id 只认头一个。
export function readBook(raw) {
  if (raw == null || raw === "") return STARTERS.map((e) => ({ ...e }));
  let d = null;
  try {
    d = JSON.parse(raw);
  } catch (x) {
    d = null;
  }
  if (!d || typeof d !== "object" || !Array.isArray(d.list)) return STARTERS.map((e) => ({ ...e }));
  const seen = new Set();
  const out = [];
  for (const e of d.list) {
    if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id || seen.has(e.id)) continue;
    const label = cleanLabel(e.label);
    if (typeof e.file === "string" && e.file) out.push({ id: e.id, label, av: { type: "meme", file: e.file } });
    else if (e.pic) out.push({ id: e.id, label, av: null, pic: true });
    else continue;
    seen.add(e.id);
    if (out.length >= BOOK_MAX) break;
  }
  return out;
}

const isPic = (e) => !!e.pic || !!(e.av && e.av.type === "upload");

// 单子 → 存着的那一份。图不写进去
export function packBook(list) {
  return JSON.stringify({
    v: 1,
    list: list.map((e) => (isPic(e) ? { id: e.id, label: e.label, pic: 1 } : { id: e.id, label: e.label, file: e.av.file })),
  });
}

// 这张头像在不在单子里（图还没取到的那几行不算）
export function inBook(list, av) {
  if (!av) return null;
  return list.find((e) => e.av && sameAv(e.av, av)) || null;
}

// 能不能存进去：得是一张头像（表情包里的、相册选的），单子没满，里头还没有这一张
export function canAdd(list, av) {
  if (!av || (av.type !== "meme" && av.type !== "upload")) return false;
  if (av.type === "meme" ? !av.file : !av.data) return false;
  return list.length < BOOK_MAX && !inBook(list, av);
}

// 添一行，放在最上面。添不了的回 null
export function addEntry(list, av, label, id) {
  if (!id || !canAdd(list, av) || list.some((e) => e.id === id)) return null;
  const entry = av.type === "upload" ? { id, label: cleanLabel(label), av: { type: "upload", data: av.data }, pic: true } : { id, label: cleanLabel(label), av: { type: "meme", file: av.file } };
  return { entry, list: [entry].concat(list) };
}

export const dropEntry = (list, id) => list.filter((e) => e.id !== id);

// 改一行的名字。改完和原来一样的、清空了的、没有这一行的：回 null（不用存）
export function renameEntry(list, id, label) {
  const e = list.find((x) => x.id === id);
  const raw = String(label == null ? "" : label).trim();
  if (!e || !raw) return null;
  const next = cleanLabel(raw);
  if (next === e.label) return null;
  return list.map((x) => (x.id === id ? { ...x, label: next } : x));
}

// ---- 左滑露出垃圾桶（panels/AvatarBook.jsx）----
export const REVEAL = 56; // 露出垃圾桶要让开多宽
export const REVEAL_ARMED = 124; // 垃圾桶点了一下、变成“再点一次删掉”以后
// 手指走了 dx、dy：这一回算横着划（"h"）还是竖着滚（"v"）；还没走出 8 个像素先不定（null）
export function swipeDir(dx, dy) {
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
}
// 眼下让开多宽：从 base 起，手指往左（dx 是负的）多让、往右收；让过头的那一截只跟三成
export function revealAt(base, dx, max = REVEAL) {
  const r = base - dx;
  if (r <= 0) return 0;
  return r <= max ? r : max + (r - max) * 0.3;
}
// 松手：让开过半就停在开着，不然收回去
export const staysOpen = (reveal, max = REVEAL) => reveal > max / 2;
