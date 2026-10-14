// =====================================================
//   通话页的字幕（卿卿 2026 年 10 月 14 日定的，见开发说明“通话”那一节的“字幕”）。不碰页面，测试在 Node 里跑。
//   头像和名字底下一块，两个人共用，像一张一直往下写的字条：
//   - 她：听写听到的字，边说边出（还没说完的那一截是 live）；说完一句收进 lines，接着说的接在后面。
//   - 他：念到哪一段出哪一段（say.js 的 onSegment），语气标签、动作都不摆（subOf）。
//   - 一个人连着说：接在他这一段后面往下长。换人了：另起一行，新的一段接在下面（她 12:08 改的：两个人的都留着；
//     11:40 那会儿定的是换人就把上一个人的淡出去、从顶上重新出，看了视频改了）。
//   - 满了往上滚；眼下在说的这一段里最新的那一截最亮，越往前越淡；前面几段都淡。
//   turns：一段一段（{ id, who, lines, live }），最后一段是眼下在说的；next：下一段的编号（画面认它，新的一段跳出来）
// =====================================================
import { subOf } from "./say.js";

export const SUB_KEEP = 8; // 一段里最多留这么多截
export const SUB_TURNS = 6; // 最多留这么多段（再往前的早滚上去了）

export const emptySubs = () => ({ turns: [], next: 1 });

const last = (s) => (s.turns.length ? s.turns[s.turns.length - 1] : null);
const keep = (lines) => (lines.length > SUB_KEEP ? lines.slice(lines.length - SUB_KEEP) : lines);
// 换掉最后一段
const put = (s, turn) => ({ ...s, turns: s.turns.slice(0, -1).concat([turn]) });
// 另起一段
const open = (s, turn) => {
  const turns = s.turns.concat([{ id: s.next, ...turn }]);
  return { turns: turns.length > SUB_TURNS ? turns.slice(turns.length - SUB_TURNS) : turns, next: s.next + 1 };
};

// 眼下是谁在说（最后一段是谁的）
export const subWho = (s) => (last(s) ? last(s).who : "");

// 她边说边出的字（听写还在变的那一截）。空的不算开口（开听写那一下会报一个空的）
export function herLive(s, text) {
  const t = String(text || "").trim();
  if (!t) return s;
  const cur = last(s);
  if (cur && cur.who === "her") return cur.live === t ? s : put(s, { ...cur, live: t });
  return open(s, { who: "her", lines: [], live: t });
}

// 她说完了一句（发出去的那句）：收进她这一段
export function herDone(s, text) {
  const t = String(text || "").trim();
  if (!t) return s;
  const cur = last(s);
  if (cur && cur.who === "her") return put(s, { ...cur, lines: keep(cur.lines.concat([t])), live: "" });
  return open(s, { who: "her", lines: [t], live: "" });
}

// 他念到了这一段
export function hisSay(s, seg) {
  const t = subOf(seg);
  if (!t) return s;
  const cur = last(s);
  if (cur && cur.who === "him") return put(s, { ...cur, lines: keep(cur.lines.concat([t])) });
  return open(s, { who: "him", lines: [t], live: "" });
}

// 一段摆哪几截（她还没说完的那一截在最后）
export const unitsOf = (turn) => (turn.live ? turn.lines.concat([turn.live]) : turn.lines);

// 第 k 截多亮（k 是在眼下这一段里从最新的那截往回数：0 是最新的）：最新的照常，前一截淡一点，再往前更淡。
// 前面几段（换过人了）里的都算旧的，传 SUB_OLD：她那句浅灰本来就暗，他上一段要是还亮着，她刚说的反倒不显眼
export const SUB_OLD = 99;
export const subFade = (k) => (k <= 0 ? 1 : k === 1 ? 0.62 : 0.38);

// 一段里两截接在一起：前一截是标点（或者空白）收尾的直接接上，不是的中间空一格，免得两句粘成一句
export const subGap = (prev) => (!prev || /[\s。！？!?…~～，,、；;：:”’」』）)]$/.test(prev) ? "" : " ");

// 两个人的字幕颜色（她定的）：她的柔和浅灰，他的暖白
export const SUB_COLOR = { her: "#999999", him: "#F0F0F0" };
