// =====================================================
//   他打给她（卿卿 10 月 14 日 17:26、17:35 定的，见开发说明“他打给她”那一节）。
//   他在回话里写 [CALL]（reply.js 的 splitCall），后面是她接起来他先说的话。这条回话放进对话的时候：
//   - 她在开封府里、回话是一分钟以内到的：弹出来电页面（接听、挂断），响到这条回话到了一分钟（至少再响 15 秒）；
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
      inCall = m.phase === "start";
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

// 来电的铃声：自己合成的一小段（“叮——咚，叮——咚”，再停一会儿），WAV，循环着放；不用外头的音频文件。
// rate 采样率；回 Uint8Array（整个 WAV 文件）
export function ringWav(rate = 22050) {
  const secs = 3.2;
  const n = Math.floor(rate * secs);
  const mix = new Float32Array(n);
  const note = (f, t0, dur, amp) => {
    const a = Math.floor(t0 * rate);
    const b = Math.min(n, Math.floor((t0 + dur) * rate));
    for (let i = a; i < b; i++) {
      const t = i / rate - t0;
      const env = Math.min(1, t / 0.012) * Math.exp(-t * 4.2);
      mix[i] += amp * env * (Math.sin(2 * Math.PI * f * t) + 0.22 * Math.sin(4 * Math.PI * f * t));
    }
  };
  note(880, 0, 1.0, 0.3);
  note(659.25, 0.42, 1.1, 0.3);
  note(880, 1.1, 1.0, 0.26);
  note(659.25, 1.52, 1.2, 0.26);
  const bytes = new Uint8Array(44 + n * 2);
  const v = new DataView(bytes.buffer);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 单声道
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, mix[i]));
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return bytes;
}
