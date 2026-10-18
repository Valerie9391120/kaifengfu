// 同页（vendor/tongye/，见开发说明“同页搬进来”那一节）里的日子写成“月.日”（9.27），不带年；开封府里一律存成“年-月-日”。
// 照一个“今天”换算：
//   月.日 → 不晚于今天、离今天最近的那一天（比今天晚的算去年的）
//   年-月-日 → 在今天往前一年以内（不含一年前的同一天）的，换回月.日；更早的、比今天晚的换不回来（null）
// 存进去的时候：路径 day/9.27 → day/2026-09-27；对象里叫 day 的字段、长得像月.日的键、长得像 day/9.27 的键（废纸篓里记着的那几条），都换成年-月-日。
// 取出来的时候反过来；换不回来的原样留着（年-月-日：对不上同页里的哪一天，等于看不见；存回去也还是它，不会丢、不会挪到别的年）。
// 这样过了一年，今年的 10.18 和去年的 10.18 各存各的，不会盖掉。

export const MD = /^(\d{1,2})\.(\d{1,2})$/;
export const FULL = /^(\d{4})-(\d{2})-(\d{2})$/;
// 键是一天的集合（db 的路径 <集合>/<日子>）
export const DAY_COLS = ["day", "page", "gens", "wx"];
// 存在这台设备上的键（localStorage）里，冒号后面是日子的那几样
export const DAY_LS = ["journalPage", "journalGens", "journalNotes", "journalLook"];

// 路径样子的键（废纸篓里记着“day/9.27”这样的几条）
const PATH_MD = /^(day|page|gens|wx)\/(\d{1,2}\.\d{1,2})$/;
const PATH_FULL = /^(day|page|gens|wx)\/(\d{4}-\d{2}-\d{2})$/;

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
// 日子本身（不带钟点）：today 当天也算
const dayStart = (t) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
// 一年前的同一天：2 月 29 日往前一年是 2 月 28 日（不让它滚到 3 月 1 日，不然 3.1 换出去换不回来）
export function yearAgoOf(today) {
  const t = dayStart(today);
  const d = new Date(t.getFullYear() - 1, t.getMonth(), t.getDate());
  return d.getMonth() === t.getMonth() ? d : new Date(t.getFullYear() - 1, t.getMonth() + 1, 0);
}

// 2 月 29 日：那一年没有就往前找有的那一年（最多找八年）
export function fullOf(md, today) {
  const m = MD.exec(String(md));
  if (!m) return null;
  const mo = +m[1];
  const da = +m[2];
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const t = dayStart(today);
  for (let y = t.getFullYear(), n = 0; n < 9; y--, n++) {
    const d = new Date(y, mo - 1, da);
    if (d.getMonth() !== mo - 1) continue; // 这一年没有这一天
    if (d > t) continue;
    return ymd(y, mo, da);
  }
  return null;
}

export function mdOf(full, today) {
  const m = FULL.exec(String(full));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getMonth() !== +m[2] - 1) return null;
  const t = dayStart(today);
  if (d > t) return null;
  if (d <= yearAgoOf(t)) return null;
  return `${+m[2]}.${+m[3]}`;
}

// 存进去：月.日 → 年-月-日（键、day 字段、day/9.27 那样的键）
export function toFull(v, today) {
  if (Array.isArray(v)) return v.map((x) => toFull(x, today));
  if (!v || typeof v !== "object") return v;
  const out = {};
  for (const k of Object.keys(v)) {
    let key = k;
    if (MD.test(k)) key = fullOf(k, today) || k;
    else if (PATH_MD.test(k)) {
      const [, col, md] = PATH_MD.exec(k);
      const f = fullOf(md, today);
      if (f) key = `${col}/${f}`;
    }
    let val = v[k];
    if (k === "day" && typeof val === "string" && MD.test(val)) val = fullOf(val, today) || val;
    else val = toFull(val, today);
    out[key] = val;
  }
  return out;
}

// 取出来：年-月-日 → 月.日（一年以内的）；换不回来的原样留着
export function toMd(v, today) {
  if (Array.isArray(v)) return v.map((x) => toMd(x, today));
  if (!v || typeof v !== "object") return v;
  const out = {};
  for (const k of Object.keys(v)) {
    let key = k;
    if (FULL.test(k)) key = mdOf(k, today) || k;
    else if (PATH_FULL.test(k)) {
      const [, col, full] = PATH_FULL.exec(k);
      const md = mdOf(full, today);
      if (md) key = `${col}/${md}`;
    }
    let val = v[k];
    if (k === "day" && typeof val === "string" && FULL.test(val)) val = mdOf(val, today) || val;
    else val = toMd(val, today);
    out[key] = val;
  }
  return out;
}

// db 的路径：day/9.27 ↔ day/2026-09-27；别的集合（notes、mine、cfg、ask）原样
export function pathToStore(path, today) {
  const i = String(path).indexOf("/");
  if (i < 0) return path;
  const col = path.slice(0, i);
  const id = path.slice(i + 1);
  if (DAY_COLS.includes(col) && MD.test(id)) {
    const f = fullOf(id, today);
    return f ? `${col}/${f}` : null;
  }
  return path;
}
export function idFromStore(col, id, today) {
  if (DAY_COLS.includes(col) && FULL.test(id)) return mdOf(id, today);
  return id;
}

// 这台设备上的键：journalPage:9.27 ↔ journalPage:2026-09-27
export function lsKeyToStore(key, today) {
  const i = String(key).lastIndexOf(":");
  if (i < 0) return key;
  const head = key.slice(0, i);
  const d = key.slice(i + 1);
  if (DAY_LS.includes(head) && MD.test(d)) {
    const f = fullOf(d, today);
    return f ? `${head}:${f}` : null;
  }
  return key;
}
export function lsKeyFromStore(key, today) {
  const i = String(key).lastIndexOf(":");
  if (i < 0) return key;
  const head = key.slice(0, i);
  const d = key.slice(i + 1);
  if (DAY_LS.includes(head) && FULL.test(d)) {
    const m = mdOf(d, today);
    return m ? `${head}:${m}` : null;
  }
  return key;
}
