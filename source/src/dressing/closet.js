// =====================================================
// 他屋里妆台的衣柜（狐宇宙；引擎见 vendor/dressing/，同罗浮梦的梦库那个路子）。
// 衣服一开始那一份写在引擎里（vendor/dressing/dressing-data.ts 的 BASE_ITEMS）；手机上衣柜那一页加的、删的、改了字的，
// 另存一条 kfs2:dressing:closet（加密了跟着云端走，只有手机上那一页写；家里的闹钟、聊天里回屋看一眼只读）：
//   { v: 1, add: [{ id, name, category, description, at }], edit: { 编号: { name, description } }, drop: [编号] }
// 用的时候拿一开始那一份照着改一遍（closetCatalog），递给引擎（new DressingEngine(store, clock, cat)）。
// 规矩：
//   只改衣服（梳发、妆面、熏香、衣柜、下装、鞋履、配饰里的每一件）：加一件、删一件、改名字和描述；成就、攒成就换来的那几样只看
//   成就里点了名的、一开始就穿着的（披发、素面、不熏香）不让删，只能改字；删了以后件数不够、哪条成就就亮不了的，也锁着
//   新加的没有风格标签（古今一炉、博采众长那几条看风格的不算它），算“试过几种”；不算“全部基础××”那几条（只数一开始那一批）
//   删掉的名字留着（gone）：他以前完成的那几身照旧写得出名字；他身上要是正穿着，下回去妆台就取下来（引擎的 dropGone）
// =====================================================
import { BASE_ITEMS, CATEGORY_LABELS, DEFAULT_APPEARANCE, makeCatalog } from "../../vendor/dressing/dressing-data.ts";
import { ACHIEVEMENTS } from "../../vendor/dressing/achievements.ts";
import { REWARDS } from "../../vendor/dressing/rewards.ts";
import { completedToday } from "../../vendor/dressing/dressing-engine.ts";
import { newId } from "../util.js";

export const CLOSET_KEY = "kfs2:dressing:closet";
export const CATS = ["hair", "makeup", "scent", "outfit", "bottom", "shoes", "accessory"];
export { CATEGORY_LABELS };
const PREFIX = { hair: "hair", makeup: "makeup", scent: "scent", outfit: "outfit", bottom: "bottom", shoes: "shoes", accessory: "acc" };
export const NAME_MAX = 40;
export const DESC_MAX = 200;
const SEARCH_MAX = 60;
const BASE = new Map(BASE_ITEMS.map((x) => [x.id, x]));
// 能改的：一开始那一份里平常就有的（攒成就换来的那几样不算）
const EDITABLE = new Set(BASE_ITEMS.filter((x) => x.base).map((x) => x.id));

export const emptyCloset = () => ({ v: 1, add: [], edit: {}, drop: [] });
const clean = (v, max) =>
  String(v == null ? "" : v)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const same = (a, b) => clean(a, NAME_MAX).toLowerCase() === clean(b, NAME_MAX).toLowerCase();

// 收拾一份（读进来的、要存的都过一遍）：认不出的扔掉，名字、描述去前后空白、截长
export function normCloset(o) {
  if (!o || typeof o !== "object" || o.v !== 1) return emptyCloset();
  const add = [];
  const seen = new Set();
  for (const x of Array.isArray(o.add) ? o.add : []) {
    if (!x || typeof x.id !== "string" || !x.id || BASE.has(x.id) || seen.has(x.id) || !CATS.includes(x.category)) continue;
    const name = clean(x.name, NAME_MAX);
    if (!name) continue;
    seen.add(x.id);
    add.push({ id: x.id, name, category: x.category, description: clean(x.description, DESC_MAX), at: Number(x.at) || 0 });
  }
  const edit = {};
  for (const [id, e] of Object.entries(o.edit && typeof o.edit === "object" ? o.edit : {})) {
    if (!EDITABLE.has(id) || !e || typeof e !== "object") continue;
    const y = {};
    const name = clean(e.name, NAME_MAX);
    if (name && name !== BASE.get(id).name) y.name = name;
    if (typeof e.description === "string") {
      const d = clean(e.description, DESC_MAX);
      if (d !== (BASE.get(id).description || "")) y.description = d;
    }
    if (Object.keys(y).length) edit[id] = y;
  }
  const known = new Set([...EDITABLE, ...seen]);
  const drop = [...new Set((Array.isArray(o.drop) ? o.drop : []).filter((id) => typeof id === "string" && known.has(id)))];
  return { v: 1, add, edit, drop };
}
export function readCloset(text) {
  try {
    return normCloset(typeof text === "string" && text ? JSON.parse(text) : null);
  } catch (e) {
    return emptyCloset();
  }
}
export const packCloset = (rec) => JSON.stringify(normCloset(rec));
export const isEmptyCloset = (rec) => !rec || (!rec.add.length && !Object.keys(rec.edit).length && !rec.drop.length);

// 一开始那一份照着改一遍：改了字的换上，加的接在后头（算第三批，不算“全部基础××”），删的标 gone（名字留着）
export function closetItems(rec) {
  const r = rec || emptyCloset();
  const drop = new Set(r.drop);
  const items = BASE_ITEMS.map((x) => {
    const e = r.edit[x.id];
    let y = x;
    if (e) {
      y = { ...x };
      if (e.name) y.name = e.name;
      if (typeof e.description === "string") {
        if (e.description) y.description = e.description;
        else delete y.description;
      }
    }
    return drop.has(x.id) ? { ...y, gone: true } : y;
  });
  for (const a of r.add) items.push({ id: a.id, name: a.name, category: a.category, base: true, batch: 3, ...(a.description ? { description: a.description } : {}), ...(drop.has(a.id) ? { gone: true } : {}) });
  return items;
}
let memo = { key: null, cat: null };
export function closetCatalog(rec) {
  const key = rec ? JSON.stringify(rec) : "";
  if (memo.key !== key) memo = { key, cat: makeCatalog(closetItems(rec)) };
  return memo.cat;
}

// ---------- 锁：哪几件不让删 ----------
// 成就里点了名的：照每一条成就查条件的那一段里写着的单品编号认（成就往后添了改了，这里跟着变）
const NAMED = (() => {
  const out = new Map();
  for (const a of ACHIEVEMENTS) {
    const src = String(a.check);
    for (const id of EDITABLE) if (src.includes(`"${id}"`) || src.includes(`'${id}'`)) out.set(id, [...(out.get(id) || []), a.name]);
  }
  for (const id of [DEFAULT_APPEARANCE.hair, DEFAULT_APPEARANCE.makeup, DEFAULT_APPEARANCE.scent]) if (!out.has(id)) out.set(id, []);
  return out;
})();
const ACH = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
const achName = (id) => (ACH.get(id) || {}).name || id;
const has = (x, tag) => !!(x.sourceTags && x.sourceTags.includes(tag));
// 件数：删了以后还得凑得够（一条成就要几件，照那一条的条件写；这里列的只是删了会凑不够的那几种）
const NEEDS = [
  { ach: "hair_all", n: 10, ok: (x) => x.category === "hair" },
  { ach: "scent_10", n: 10, ok: (x) => x.category === "scent" && x.id !== "scent_none" },
  { ach: "outfit_10", n: 10, ok: (x) => x.category === "outfit" },
  { ach: "accessory_10", n: 10, ok: (x) => x.category === "accessory" },
  { ach: "shoes_5", n: 5, ok: (x) => x.category === "shoes" },
  { ach: "bottom_5", n: 5, ok: (x) => x.category === "bottom" },
  { ach: "budget_airline", n: 5, ok: (x) => x.category === "bottom" },
  { ach: "head_construction", n: 3, ok: (x) => x.category === "accessory" && x.headFace },
  { ach: "bold_first", n: 1, ok: (x) => x.category === "outfit" && x.bold },
  { ach: "formal_barefoot", n: 1, ok: (x) => x.category === "outfit" && x.formal },
  { ach: "mix_genius", n: 1, ok: (x) => x.category === "outfit" && x.ancientFormal },
  { ach: "mix_genius", n: 1, ok: (x) => (x.category === "bottom" || x.category === "shoes") && has(x, "modern") },
  { ach: "ancient_modern", n: 1, ok: (x) => has(x, "ancient") },
  { ach: "ancient_modern", n: 1, ok: (x) => has(x, "modern") },
];
const STYLE_TAGS = ["ancient", "modern", "uniform", "fantasy", "ceremonial", "sleepwear", "bold", "martial", "casual", "costume"];
const styleCount = (items) => new Set(items.flatMap((x) => (x.sourceTags || []).filter((t) => STYLE_TAGS.includes(t)))).size;

// 这一件删不删得：不让删就回一句为什么（哪条成就要用），删得就回 ""
export function lockOf(rec, id) {
  if (!EDITABLE.has(id) && !(rec || emptyCloset()).add.some((a) => a.id === id)) return "这一件改不了";
  if (NAMED.has(id)) {
    const names = NAMED.get(id);
    return names.length ? `《${names.join("》《")}》要用` : "一开始就穿着的";
  }
  const live = closetItems(rec).filter((x) => x.base && !x.gone);
  const me = live.find((x) => x.id === id);
  if (!me) return "";
  const rest = live.filter((x) => x.id !== id);
  for (const r of NEEDS) if (r.ok(me) && rest.filter(r.ok).length < r.n) return `少了它《${achName(r.ach)}》凑不够`;
  if (styleCount(rest) < 3 && styleCount(live) >= 3) return `少了它《${achName("borrow_everywhere")}》凑不够`;
  return "";
}

// ---------- 改 ----------
const liveIn = (rec, c) => closetItems(rec).filter((x) => x.category === c && x.base && !x.gone);
function nameTaken(rec, c, name, except = "") {
  return liveIn(rec, c).some((x) => x.id !== except && same(x.name, name));
}
// 加一件：挑哪一样、写名字（描述可以空）。名字空了、同一样里重了不加
export function addItem(rec, category, { name, description } = {}, now = Date.now()) {
  const r = normCloset(rec);
  if (!CATS.includes(category)) return { rec: r, why: "先挑加在哪一样里" };
  const n = clean(name, NAME_MAX);
  if (!n) return { rec: r, why: "名字还空着" };
  if (nameTaken(r, category, n)) return { rec: r, why: `${CATEGORY_LABELS[category]}里已经有「${n}」了` };
  const ids = new Set([...BASE.keys(), ...r.add.map((a) => a.id)]);
  let id = `${PREFIX[category]}_my_${newId()}`;
  while (ids.has(id)) id = `${PREFIX[category]}_my_${newId()}`;
  const item = { id, name: n, category, description: clean(description, DESC_MAX), at: now };
  return { rec: { ...r, add: [...r.add, item] }, item };
}
// 改名字、描述（一开始那一份里的、她加的都能改；攒成就换来的那几样不能改）
export function editItem(rec, id, { name, description } = {}) {
  const r = normCloset(rec);
  const mine = r.add.find((a) => a.id === id);
  if (!mine && !EDITABLE.has(id)) return { rec: r, why: "这一件改不了" };
  const cur = closetItems(r).find((x) => x.id === id);
  if (!cur || cur.gone) return { rec: r, why: "这一件已经删了" };
  const n = clean(name, NAME_MAX);
  if (!n) return { rec: r, why: "名字还空着" };
  if (nameTaken(r, cur.category, n, id)) return { rec: r, why: `${CATEGORY_LABELS[cur.category]}里已经有「${n}」了` };
  const d = clean(description, DESC_MAX);
  if (mine) return { rec: { ...r, add: r.add.map((a) => (a.id === id ? { ...a, name: n, description: d } : a)) } };
  return { rec: normCloset({ ...r, edit: { ...r.edit, [id]: { name: n, description: d } } }) };
}
// 删一件（锁着的不删）：回删掉的那一件，撤销的时候用
export function dropItem(rec, id) {
  const r = normCloset(rec);
  const lock = lockOf(r, id);
  if (lock) return { rec: r, why: lock };
  const cur = closetItems(r).find((x) => x.id === id);
  if (!cur || cur.gone) return { rec: r, why: "这一件已经删了" };
  return { rec: { ...r, drop: [...r.drop, id] }, dropped: { id, name: cur.name, category: cur.category } };
}
// 撤销刚删的那一件
export const undropItem = (rec, id) => {
  const r = normCloset(rec);
  return { ...r, drop: r.drop.filter((x) => x !== id) };
};

// ---------- 看 ----------
// 衣柜那一页：一样一栏（平常就有的，加上攒成就换来的、他已经拿到的）。每一件：名字、描述、是不是她加的、改过没有、锁不锁
export function closetView(rec, unlockedRewards = []) {
  const r = rec || emptyCloset();
  const mine = new Set(r.add.map((a) => a.id));
  const got = new Set(unlockedRewards || []);
  const items = closetItems(r);
  return CATS.map((c) => ({
    cat: c,
    label: CATEGORY_LABELS[c],
    items: items
      .filter((x) => x.category === c && !x.gone && (x.base || got.has(x.id)))
      .map((x) => ({ id: x.id, name: x.name, description: x.description || "", mine: mine.has(x.id), edited: !!r.edit[x.id], reward: !x.base, lock: x.base ? lockOf(r, x.id) : "攒成就换来的" })),
  }));
}
// 找一件：空格隔开的几个词都得有（名字、描述里），不分大小写，最多六十件
export function findItems(rec, q, unlockedRewards = []) {
  const words = String(q || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const g of closetView(rec, unlockedRewards))
    for (const x of g.items) {
      const low = `${x.name}\n${x.description}`.toLowerCase();
      if (words.every((w) => low.includes(w))) {
        out.push({ ...x, cat: g.cat, label: g.label });
        if (out.length >= SEARCH_MAX) return out;
      }
    }
  return out;
}

// 照镜子那一页：同他屋里的镜子，只照得出今天完成的那一身；没完成是一只裸狐（再写上一回完成的那一身）
const LOOK_ROWS = [
  ["hair", "hair"],
  ["makeup", "makeup"],
  ["scent", "scent"],
  ["outfit", "outfits"],
  ["bottom", "bottoms"],
  ["shoes", "shoes"],
  ["accessory", "accessories"],
];
export function lookRows(appearance, rec) {
  const cat = closetCatalog(rec);
  return LOOK_ROWS.map(([c, k]) => {
    const v = appearance ? appearance[k] : null;
    const ids = Array.isArray(v) ? v : v ? [v] : [];
    return { label: CATEGORY_LABELS[c], text: ids.length ? ids.map((id) => cat.itemName(id)).join("、") : "无" };
  });
}
export function mirrorView(state, today, rec) {
  if (!state || !state.initialized) return { kind: "never" };
  const look = state.completedLook;
  if (completedToday(state, today)) return { kind: "today", rows: lookRows(look.appearance, rec) };
  return { kind: "fox", last: look && look.appearance ? { date: look.date, rows: lookRows(look.appearance, rec) } : null };
}

// 成就那一页：六十个全列，点亮的亮着、没点亮的灰着；底下攒成就换来的那几样（点亮几个换一样），拿到的亮着
export function achievementsView(state, rec) {
  const on = new Set((state && state.unlockedAchievements) || []);
  const got = new Set((state && state.unlockedRewards) || []);
  const cat = closetCatalog(rec);
  const list = ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, description: a.description, on: on.has(a.id) }));
  const lit = list.filter((a) => a.on).length;
  const rewards = REWARDS.map((r) => {
    const x = cat.ITEMS[r.itemId] || {};
    return { id: r.itemId, milestone: r.milestone, name: x.name || r.itemId, description: x.description || "", on: got.has(r.itemId) };
  });
  const next = rewards.find((r) => !r.on && r.milestone > lit);
  return { lit, total: list.length, list, rewards, next: next ? next.milestone : 0 };
}
