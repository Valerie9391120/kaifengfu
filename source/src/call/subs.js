// =====================================================
//   通话页的字幕（卿卿 2026 年 10 月 14 日定的，见开发说明“通话”那一节的“字幕”）。不碰页面，测试在 Node 里跑。
//   头像和名字底下一块，两个人共用：谁在说，这一块就是谁的。
//   - 她：听写听到的字，边说边出（还没说完的那一截是 live）；说完一句收进 lines，接着说的接在后面。
//   - 他：念到哪一段出哪一段（say.js 的 onSegment），语气标签、动作都不摆（subOf）。
//   - 换人了（他开口了、她开口了）：上一个人的淡出去，这个人的从顶上重新出，两个人的字不混在一块。
//   - 一个人连着说：不清空，接在后面往下长，满了往上滚；最新的那一截最亮，旧的淡一点。
//   turn：第几轮（换一回人加一），画面认它来淡出上一轮
// =====================================================
import { subOf } from "./say.js";

export const SUB_KEEP = 8; // 一轮里最多留这么多截（字幕区装不下的早滚上去了）

export const emptySubs = () => ({ who: "", lines: [], live: "", turn: 0 });

const fresh = (s, who) => ({ who, lines: [], live: "", turn: s.turn + 1 });
const keep = (lines) => (lines.length > SUB_KEEP ? lines.slice(lines.length - SUB_KEEP) : lines);

// 她边说边出的字（听写还在变的那一截）。空的不算开口（开听写那一下会报一个空的）
export function herLive(s, text) {
  const t = String(text || "").trim();
  if (!t) return s;
  const base = s.who === "her" ? s : fresh(s, "her");
  return base.live === t && base === s ? s : { ...base, live: t };
}

// 她说完了一句（发出去的那句）：收进这一轮
export function herDone(s, text) {
  const t = String(text || "").trim();
  if (!t) return s;
  const base = s.who === "her" ? s : fresh(s, "her");
  return { ...base, lines: keep(base.lines.concat([t])), live: "" };
}

// 他念到了这一段
export function hisSay(s, seg) {
  const t = subOf(seg);
  if (!t) return s;
  const base = s.who === "him" ? s : fresh(s, "him");
  return { ...base, lines: keep(base.lines.concat([t])), live: "" };
}

// 这一轮摆哪几截（她还没说完的那一截在最后）
export const subUnits = (s) => (s && s.live ? s.lines.concat([s.live]) : (s && s.lines) || []);

// 第 i 截（一共 n 截）多亮：最新的那截照常，前一截淡一点，再往前更淡
export const subFade = (i, n) => (i >= n - 1 ? 1 : i === n - 2 ? 0.62 : 0.38);

// 两截接在一起：前一截是标点（或者空白）收尾的直接接上，不是的中间空一格，免得两句粘成一句
export const subGap = (prev) => (!prev || /[\s。！？!?…~～，,、；;：:”’」』）)]$/.test(prev) ? "" : " ");

// 两个人的字幕颜色（她定的）：她的柔和浅灰，他的暖白
export const SUB_COLOR = { her: "#999999", him: "#F0F0F0" };
