import { HIS_NAME } from "../names.js";
import { isCallMark, markText } from "../call/marks.js";

// stoppedId：底下要摆那行“停了，点这里让我回”的是她的哪一句（没有就是空的，见 thread.js 的 stoppedAt）
// recap：眼下作数的那一份前情提要（见 recap.js 的 pickRecap；没有就是 null）。在它抄到的那一条后面添一行小字
export function buildRows(messages, reveal, stoppedId = "", recap = null) {
  const rows = [];
  let prevTs = null;
  // 在不在一通电话里（“通话开始”和“通话 N”两行中间）：电话里他照常写语气标签（念的时候用），
  // 聊天记录里他那几条字不摆标签（卿卿 10 月 14 日 12:21 定的；存着的原文不动，只是不显示，见 Bubble.jsx）
  let inCall = false;
  messages.forEach((m) => {
    if (prevTs === null || m.ts - prevTs > 15 * 60 * 1000) {
      rows.push({ type: "sep", key: "sep-" + m.id, ts: m.ts });
    }
    prevTs = m.ts;
    if (isCallMark(m)) {
      // 通话开始、挂了（见 call/marks.js）：一行小字，前面一个小电话
      inCall = m.phase === "start";
      rows.push({ type: "notice", key: m.id, msg: m, kind: "call", text: markText(m) });
    } else if (m.role === "event") {
      rows.push({
        type: "notice",
        key: m.id,
        msg: m,
        who: "her",
        av: m.av,
        text: m.av ? "你换了新头像" : "你换回了默认头像",
      });
    } else if (m.role === "her") {
      rows.push({
        type: "bubble",
        key: m.id,
        role: "her",
        msg: m,
        item:
          m.kind === "meme"
            ? { type: "meme", file: m.file }
            : m.kind === "photo"
            ? { type: "photo", imgId: m.imgId }
            : m.kind === "doc"
            ? { type: "doc", docId: m.docId, name: m.name, fmt: m.fmt, chars: m.chars, images: m.images }
            : m.kind === "voice"
            ? { type: "voice", text: m.text, dur: m.dur }
            : { type: "text", text: m.text },
      });
      if (m.alts && m.alts.length > 1) rows.push({ type: "ctrl", key: "ct-" + m.id, msg: m, role: "her" });
      if (stoppedId && m.id === stoppedId) rows.push({ type: "stopped", key: "sp-" + m.id, msg: m });
    } else {
      let items = m.items || [];
      if (reveal && reveal.id === m.id) items = items.slice(0, reveal.count);
      if (m.thinking) rows.push({ type: "thinking", key: "th-" + m.id, msg: m });
      if (m.toolNote || (m.tools && m.tools.length)) {
        rows.push({
          type: "tools",
          key: "tl-" + m.id,
          msg: m,
          text: m.toolNote || `用了 ${m.tools.join("、")}`,
        });
      }
      items.forEach((it, j) => {
        if (it.type === "call") {
          // 他打电话（见 call/incoming.js）：一行小字“光义来电”，前面一个小电话；接了、没接看后面那一行（“通话开始”“未接来电”）。
          // 打着电话的时候他又写了 [CALL] 的：那会儿当照常说话念了，摆成他说的一句
          if (inCall) rows.push({ type: "bubble", key: m.id + "-" + j, role: "him", msg: m, item: { type: "text", text: it.text || "……" }, idx: j, call: true });
          else rows.push({ type: "notice", key: m.id + "-" + j, msg: m, kind: "call", text: `${HIS_NAME}来电` });
        } else if (it.type === "avatar") {
          rows.push({
            type: "notice",
            key: m.id + "-" + j,
            msg: m,
            who: "him",
            av: { type: "meme", file: it.file },
            text: "光义换了新头像",
          });
        } else {
          // idx：这是那一条回话里的第几样（语音条念好的声音按它存，见 voice.js 的 voiceKeyOf）
          rows.push({ type: "bubble", key: m.id + "-" + j, role: "him", msg: m, item: it, idx: j, ...(inCall ? { call: true } : {}) });
        }
      });
      const revealing = reveal && reveal.id === m.id;
      // 这条回复里他给自己改了名字：话说完以后留一行提示。新名字只显示在顶栏，这里不写
      if (m.rename && !revealing) {
        rows.push({
          type: "notice",
          key: m.id + "-rename",
          msg: m,
          who: "him",
          kind: "rename",
          text: m.rename === HIS_NAME ? "光义把名字改回来了" : "光义改了名字",
        });
      }
      // 翻版本的那一小行：有好几个版本才摆。原来他最后那条底下总跟着一颗“重新回答”，
      // 卿卿 10 月 13 日夜里说老误触，拿掉了，重新回答只在长按菜单里（见 Lines.jsx 的 CtrlRow）
      if (!revealing && m.alts && m.alts.length > 1) {
        rows.push({ type: "ctrl", key: "ct-" + m.id, msg: m, role: "him" });
      }
    }
    if (recap && recap.upto === m.id) rows.push({ type: "recap", key: "rc-" + m.id, msg: m, recap });
  });
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.type !== "bubble") continue;
    const prev = rows[i - 1];
    const next = rows[i + 1];
    r.first = !(prev && prev.type === "bubble" && prev.role === r.role);
    r.last = !(next && next.type === "bubble" && next.role === r.role);
  }
  return rows;
}
