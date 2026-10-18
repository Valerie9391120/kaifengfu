// =====================================================
// 一页手帐排成哪几块（不碰 React，测试在 Node 里跑）。
// v 是 model.js 的 viewOf 给的；回一串块：
//   { t: "one", k }            一块零件占一整行
//   { t: "row", ks: [a, b] }   两块并排（格子便当里两个小方块、拍立得墙里饭和心情）
//   { t: "cover" }             大图封面：主照片铺满头上，日子和标题压在上面
//   { t: "scroll", main }      立轴：左边竖着的日子和标题，右边是 main 那一串
//   { t: "letterhead" }        信纸头上那一行日子
//   { t: "ps" }                信纸末尾那一行（天气、心情）
// 没东西的、她藏起来的零件不排（v.has）。照片底下那一行（cap）跟着主照片走，不单排。
// =====================================================

// 各版式从上到下的次序（cap 跟着 hero，不在这里）
const ORDER = {
  column: ["head", "title", "wx", "mood", "hero", "quote", "her", "him", "body", "pen", "pair", "food", "more"],
  polaroid: ["head", "title", "wx", "hero", "quote", "pair", ["food", "mood"], "her", "him", "body", "pen", "more"],
  cover: ["wx", "mood", "quote", "her", "him", "body", "pen", "pair", "food", "more"],
  scroll: ["wx", "mood", "hero", "quote", "her", "him", "body", "pen", "pair", "food", "more"],
  letter: ["title", "body", "him", "her", "quote", "pen", "hero", "pair", "food", "more"],
};
// 格子便当里哪几块是半格（两个半格挨着就并排；落单的撑满一行）
const BENTO = ["head", "wx", "title", "hero", "mood", "food", "quote", "pair", "her", "him", "body", "pen", "more"];
const HALF = new Set(["head", "wx", "mood", "food"]);

export function blocksOf(v) {
  const has = (k) => v.has(k);
  const seq = (list) => {
    const out = [];
    list.forEach((k) => {
      if (Array.isArray(k)) {
        const ks = k.filter(has);
        if (ks.length === 2) out.push({ t: "row", ks });
        else if (ks.length === 1) out.push({ t: "one", k: ks[0] });
      } else if (has(k)) out.push({ t: "one", k });
    });
    return out;
  };
  const layout = v.layout;
  if (layout === "bento") {
    const out = [];
    let half = null;
    BENTO.filter(has).forEach((k) => {
      if (HALF.has(k)) {
        if (half) {
          out.push({ t: "row", ks: [half, k] });
          half = null;
        } else half = k;
        return;
      }
      if (half) {
        out.push({ t: "one", k: half });
        half = null;
      }
      out.push({ t: "one", k });
    });
    if (half) out.push({ t: "one", k: half });
    return out;
  }
  if (layout === "cover") {
    if (!has("hero")) return seq(["head", "title"].concat(ORDER.cover));
    return [{ t: "cover" }].concat(seq(ORDER.cover));
  }
  if (layout === "scroll") return [{ t: "scroll", main: seq(ORDER.scroll) }];
  if (layout === "letter") {
    const out = [{ t: "letterhead" }].concat(seq(ORDER.letter));
    if (has("wx") || has("mood")) out.push({ t: "ps" });
    return out;
  }
  if (layout === "polaroid") return seq(ORDER.polaroid);
  return seq(ORDER.column);
}

// 这一页一共摆了哪几样零件（排出来的，照次序；批注的记号照它贴）
export function partsShown(v) {
  const out = [];
  const add = (k) => !out.includes(k) && out.push(k);
  blocksOf(v).forEach((b) => {
    if (b.t === "one") add(b.k);
    else if (b.t === "row") b.ks.forEach(add);
    else if (b.t === "cover") ["head", "title", "hero"].forEach((k) => (k === "head" || v.has(k)) && add(k));
    else if (b.t === "scroll") {
      add("head");
      if (v.has("title")) add("title");
      b.main.forEach((m) => (m.t === "one" ? add(m.k) : m.ks.forEach(add)));
    } else if (b.t === "letterhead") add("head");
    else if (b.t === "ps") ["wx", "mood"].forEach((k) => v.has(k) && add(k));
  });
  if (out.includes("hero") && v.has("cap")) out.splice(out.indexOf("hero") + 1, 0, "cap");
  return out;
}
