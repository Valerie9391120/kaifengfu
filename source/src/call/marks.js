// 通话在聊天里留的两行小字：“通话开始”、“通话 12 分钟”（见开发说明“通话”那一节）。
// 记成一行 event：{ role: "event", who: "call", kind: "call", phase: "start" | "end", secs }。
// 换头像那种 event 是 who: "her"、带着 av；认头像的地方都看 who === "her"，这两行不会被当成换头像。
// 这两行也告诉他（见 prompt/messages.js），挂了以后他知道你们刚通过电话。
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

export const markText = (m) => (m.phase === "end" ? `通话 ${callLen(m.secs)}` : "通话开始");
export const markNote = (m) => (m.phase === "end" ? `[开封府提示：电话挂了，你们打了 ${callLen(m.secs)}]` : "[开封府提示：你们开始打电话了]");
export const markRecap = (m) => (m.phase === "end" ? `[电话挂了，打了 ${callLen(m.secs)}]` : `[${HER_NAME}和${HIS_NAME}开始打电话]`);
