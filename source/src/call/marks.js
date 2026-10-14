// 通话在聊天里留的几行小字：“通话开始”、“通话 12 分钟”（见开发说明“通话”那一节），他打来没接的“未接来电”（见“他打给她”那一节）。
// 记成一行 event：{ role: "event", who: "call", kind: "call", phase: "start" | "end" | "missed" | "cut", secs }。
//   他打来的那一通：“通话开始”那一行带着 from: "him"、callOf（他打电话的那一条回话）；“未接来电”也带着 callOf。
//   cut：电话里她打断了他（见 barge.js）：callOf 被打断的那一条，said 他说到哪儿（末尾几个字）。聊天里不摆，只告诉他。
// 换头像那种 event 是 who: "her"、带着 av；认头像的地方都看 who === "her"，这几行不会被当成换头像。
// 这几行也告诉他（见 prompt/messages.js），挂了以后他知道你们刚通过电话、打过去她没接。
import { HER_NAME, HIS_NAME } from "../names.js";

export const isCallMark = (m) => !!m && m.role === "event" && m.kind === "call";

// 打了多久：一分钟以内说几秒，再长说几分钟
export function callLen(secs) {
  const s = Math.max(1, Math.round(Number(secs) || 0));
  return s < 60 ? `${s} 秒` : `${Math.round(s / 60)} 分钟`;
}
// 通话页上的钟：分:秒
export function callClock(secs) {
  const s = Math.max(0, Math.floor(Number(secs) || 0));
  const m = Math.floor(s / 60);
  return `${m < 10 ? "0" : ""}${m}:${s % 60 < 10 ? "0" : ""}${s % 60}`;
}

// 接起来他先说的那一句（hi，见 hello.js）：寄给他的、抄提要的都带上，他知道自己先说了什么；聊天里那一行照旧只写“通话开始”
const hiOf = (m) => (typeof m.hi === "string" && m.hi.trim() ? m.hi.trim().slice(0, 40) : "");
const fromHim = (m) => m.from === "him";
const saidOf = (m) => (typeof m.said === "string" ? m.said.trim().slice(-24) : "");
export const markText = (m) => (m.phase === "end" ? `通话 ${callLen(m.secs)}` : m.phase === "missed" ? "未接来电" : m.phase === "cut" ? "被你打断" : "通话开始");
export const markNote = (m) =>
  m.phase === "end"
    ? `[开封府提示：电话挂了，你们打了 ${callLen(m.secs)}]`
    : m.phase === "cut"
    ? saidOf(m)
      ? `[开封府提示：你说到“${saidOf(m)}”的时候被她打断了，后面的没说出来]`
      : "[开封府提示：你还没开口就被她打断了，这一条一个字都没说出来]"
    : m.phase === "missed"
    ? "[开封府提示：你打过去的电话她没接]"
    : fromHim(m)
    ? "[开封府提示：她接了你打过去的电话，你们在打电话]"
    : hiOf(m)
    ? `[开封府提示：你们开始打电话了，你接起来先说了一句“${hiOf(m)}”]`
    : "[开封府提示：你们开始打电话了]";
export const markRecap = (m) =>
  m.phase === "end"
    ? `[电话挂了，打了 ${callLen(m.secs)}]`
    : m.phase === "cut"
    ? `[${HER_NAME}打断了${HIS_NAME}${saidOf(m) ? `，他说到“${saidOf(m)}”` : ""}]`
    : m.phase === "missed"
    ? `[${HIS_NAME}给${HER_NAME}打电话，她没接]`
    : fromHim(m)
    ? `[${HER_NAME}接了${HIS_NAME}打来的电话]`
    : hiOf(m)
    ? `[${HER_NAME}和${HIS_NAME}开始打电话，${HIS_NAME}接起来先说“${hiOf(m)}”]`
    : `[${HER_NAME}和${HIS_NAME}开始打电话]`;
