// =====================================================
//   他打给她（卿卿 10 月 14 日 17:26、17:35 定的，见开发说明“他打给她”那一节）。
//   他在回话里写 [CALL]（reply.js 的 splitCall），后面是她接起来他先说的话。这条回话放进对话的时候：
//   - 她在开封府里、回话是一分钟以内到的：弹出来电页面（接听、挂断），响到这条回话到了一分钟（至少再响 15 秒）。
//     没有铃声（原来那段合成的“叮——咚”她 22:58 让撤了，见开发说明“来电铃声”），只有页面；
//   - 她不在：通知的小后端发一条 [来电] 的横幅；一分钟以内点开进来，照样弹来电页面；过了一分钟，记一行“未接来电”；
//   - 没接、挂了：“未接来电”（marks.js 的 missed），她下一句寄过去的时候附一句告诉他；
//   - 接了：跟她打给他一样，只是他先开口，说那条回话里写好的（响铃的工夫里就先念好，一接马上响）。
//   零件不碰页面，测试在 Node 里跑（tests/call.test.mjs）。
// =====================================================
import { isCallMark } from "./marks.js";

export const CALL_RING_MS = 60 * 1000; // 她 17:26 定的：一分钟
export const RING_MIN_MS = 15 * 1000; // 一分钟只剩几秒才点开的：至少再响这么久，来得及接

// 他打过来、还没有着落的那一通：他的回话里有打电话的那一样，后面没有记着它的“通话开始”“未接来电”。
// 打着电话的时候他写的不算（那会儿当成照常说话念了）。有好几通的回最早的那一通（一通一通办）。回 { msg, item } 或 null
export function pendingCall(msgs) {
  const done = new Set();
  (msgs || []).forEach((m) => {
    if (isCallMark(m) && m.callOf) done.add(m.callOf);
  });
  let inCall = false;
  for (const m of msgs || []) {
    if (isCallMark(m)) {
      if (m.phase !== "cut") inCall = m.phase === "start";
      continue;
    }
    if (!m || m.role !== "him" || inCall || done.has(m.id)) continue;
    const item = (m.items || []).find((it) => it && it.type === "call");
    if (item) return { msg: m, item };
  }
  return null;
}

// 还响多久：这条回话到了 CALL_RING_MS 就不响了（至少再响 RING_MIN_MS）；已经过了一分钟的回 0（直接记未接）
export function ringLeft(ts, now) {
  const age = now - (Number(ts) || 0);
  if (!(age >= 0) || age > CALL_RING_MS) return 0;
  return Math.max(RING_MIN_MS, CALL_RING_MS - age);
}
