import { HIS_NAME } from "../names.js";
import { isCallMark, markText } from "../call/marks.js";
import { isWakeMark, wakeText } from "../fox.js";

// stoppedId：底下要摆那行“停了，点这里让我回”的是哪一句（她的话；江湖棋局里也可能是他说到一半的那一步。没有就是空的，见 thread.js 的 stoppedAt）
// recap：眼下作数的那一份前情提要（见 recap.js 的 pickRecap；没有就是 null）。在它抄到的那一条后面添一行小字
// moreId：江湖棋局里他说到一半、没人接着要的那一步（底下摆“还没说完，点这里让我接着说”；没有就是空的）
export function buildRows(messages, reveal, stoppedId = "", recap = null, moreId = "") {
  const rows = [];
  let prevTs = null;
  // 在不在一通电话里（“通话开始”和“通话 N”两行中间）：电话里他照常写语气标签（念的时候用），
  // 聊天记录里他那几条字不摆标签（卿卿 10 月 14 日 12:21 定的；存着的原文不动，只是不显示，见 Bubble.jsx）
  let inCall = false;
  messages.forEach((m) => {
    // 他自己醒、落在别的对话里的那一行（任务到点、开的新对话最前头，见 fox.js 的 hidden）她看不见：不摆，也不算进几点
    // （算进去的话，他醒过来没说话的那一回，底下会孤零零冒一行时间；另一双眼睛挑出来的）
    if (isWakeMark(m) && m.hidden) {
      // 前情提要抄到的正好是这一行：那一行小字照摆（另一双眼睛挑出来的）
      if (recap && recap.upto === m.id) rows.push({ type: "recap", key: "rc-" + m.id, msg: m, recap });
      return;
    }
    if (prevTs === null || m.ts - prevTs > 15 * 60 * 1000) {
      rows.push({ type: "sep", key: "sep-" + m.id, ts: m.ts });
    }
    prevTs = m.ts;
    if (isCallMark(m) && m.phase === "cut") {
      // 电话里她打断了他（见 call/barge.js）：聊天里不摆（他那一条已经截成只剩念出来的），只告诉他
    } else if (isCallMark(m)) {
      // 通话开始、挂了（见 call/marks.js）：一行小字，前面一个小电话
      inCall = m.phase === "start";
      rows.push({ type: "notice", key: m.id, msg: m, kind: "call", text: markText(m) });
    } else if (isWakeMark(m)) {
      // 他自己醒了一回（狐宇宙，见 fox.js）：一行小字，前面是他的头像（她看不见的那一行上面已经跳过了，只寄给他）
      rows.push({ type: "notice", key: m.id, msg: m, who: "him", kind: "wake", text: wakeText(m) });
    } else if (m.role === "event") {
      rows.push({
        type: "notice",
        key: m.id,
        msg: m,
        who: "her",
        av: m.av,
        text: m.av ? "你换了新头像" : "你换回了默认头像",
      });
    } else if (m.role === "her" && m.kind === "lot") {
      // 她从秘戏钱匣里丢进来的一签（见 qx/pool.js）：聊天正中一个方框，不是她那一边的气泡
      rows.push({ type: "lot", key: m.id, msg: m });
      if (stoppedId && m.id === stoppedId) rows.push({ type: "stopped", key: "sp-" + m.id, msg: m });
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
        } else if (it.type === "ask") {
          // 他弹给她的选项卡（见 ask.js、AskCard.jsx）：聊天里不是气泡，是一行“他问了你 N 个问题 · 点开答 / 已答”；卡片浮在输入框上面
          rows.push({ type: "ask", key: m.id + "-" + j, msg: m, idx: j, item: it });
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
      // 他翻了日记（见 diaryTools.js）：一样一行小字，跟“用了 tavily”一个样子（卿卿 10 月 18 日说的），跟在他这一步的话后面。
      // 这一步正一条一条蹦的时候不摆，蹦完了才冒出来
      if (!revealing && m.calls) {
        m.calls.forEach((c, k) => {
          if (c && c.note) rows.push({ type: "tools", kind: "diary", key: `${m.id}-d${k}`, msg: m, text: c.note });
        });
      }
      // 江湖棋局里这一步下了什么（见 game/jianghu.js）：一张卡片一行，跟在他这一步的话后面（掷了几点、走到哪、花了几两）。
      // 这一步正一条一条蹦的时候不摆，蹦完了才冒出来
      if (!revealing && m.calls) {
        m.calls.forEach((c, k) => (c.card || []).forEach((line, n) => rows.push({ type: "game", key: `${m.id}-g${k}-${n}`, msg: m, text: line })));
      }
      // 翻版本的那一小行：有好几个版本才摆。原来他最后那条底下总跟着一颗“重新回答”，
      // 卿卿 10 月 13 日夜里说老误触，拿掉了，重新回答只在长按菜单里（见 Lines.jsx 的 CtrlRow）
      if (!revealing && m.alts && m.alts.length > 1) {
        rows.push({ type: "ctrl", key: "ct-" + m.id, msg: m, role: "him" });
      }
      // 江湖棋局里他说到一半、她按了停：底下照样摆“停了，点这里让我回”（见 thread.js 的 markStopped）
      if (stoppedId && m.id === stoppedId) rows.push({ type: "stopped", key: "sp-" + m.id, msg: m });
      // 说到一半、没人接着要（上回打开时留下的、别的设备同步过来的）：底下摆“还没说完，点这里让我接着说”
      if (moreId && m.id === moreId) rows.push({ type: "more", key: "mo-" + m.id, msg: m });
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
