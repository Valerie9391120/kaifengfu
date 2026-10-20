import { plainOf } from "../rich.js";
import { isCallMark, markText } from "../call/marks.js";
import { isWakeMark } from "../fox.js";

export function makeTitle(msgs, memeLookup) {
  const first = msgs.find((m) => m.role === "her");
  if (!first) return "新对话";
  if (first.kind === "meme") return `[${(memeLookup(first.file) || {}).name || "表情包"}]`;
  if (first.kind === "photo") return "[照片]";
  if (first.kind === "doc") return `[文档] ${first.name || ""}`.trim().slice(0, 22);
  if (first.kind === "voice") {
    const v = (first.text || "").trim();
    return v ? (v.length > 18 ? v.slice(0, 18) + "…" : v) : "[语音]";
  }
  // 名字照气泡里摆出来的字起：她头一句要是带着井号、星号的记号，名字里不带
  const t = plainOf(first.text || "").replace(/\s+/g, " ").trim();
  return t.length > 18 ? t.slice(0, 18) + "…" : t || "新对话";
}

export function makePreview(msgs) {
  // 电话里被你打断的那一行聊天里不摆（见 rows.js），这里也跳过它，摆它前面那一条（他截剩下的话）
  // 他自己醒的时候落在别的对话里、她看不见的那一行（fox.js 的 hidden）：也跳过
  let at = msgs.length - 1;
  while (at >= 0 && ((isCallMark(msgs[at]) && msgs[at].phase === "cut") || (isWakeMark(msgs[at]) && msgs[at].hidden))) at -= 1;
  const last = msgs[at];
  if (!last) return "";
  if (isCallMark(last)) return `[${markText(last)}]`;
  if (isWakeMark(last)) return last.quiet ? "[醒了一会儿]" : "[醒了]";
  if (last.role === "event") return "[换了新头像]";
  if (last.role === "her") {
    if (last.kind === "meme") return "[表情包]";
    if (last.kind === "photo") return "[照片]";
    if (last.kind === "doc") return `[文档] ${last.name || ""}`.trim();
    if (last.kind === "voice") return `[语音] ${last.text || ""}`;
    return plainOf(last.text || "");
  }
  const t = (last.items || []).find((it) => it.type === "text");
  if (t) return plainOf(t.text);
  // 江湖棋局里只调了引擎、一个字没说的那一步：写它那一步头一张卡片（见 game/jianghu.js）。
  // 只翻了日记、一个字没说的那一步：写那一行小字（见 diaryTools.js）
  if (!(last.items || []).length && last.calls && last.calls.length) {
    const card = last.calls.flatMap((c) => c.card || [])[0];
    const note = last.calls.map((c) => c.note).find(Boolean);
    return card ? `[棋局] ${card.replace(/^〔[^〕]*〕/, "")}` : note ? `[${note}]` : "[棋局]";
  }
  if ((last.items || []).some((it) => it.type === "voice")) return "[语音]";
  if ((last.items || []).some((it) => it.type === "call")) return "[来电]";
  const d = (last.items || []).find((it) => it.type === "doc");
  return d ? `[文档] ${d.name}` : "[表情包]";
}

// 所有分支里的照片（删对话时一起清掉）
export function collectImgIds(msgs, out = []) {
  msgs.forEach((m) => {
    if (m.kind === "photo" && m.imgId) out.push(m.imgId);
    (m.alts || []).forEach((a) => {
      if (a.node && a.node.kind === "photo" && a.node.imgId) out.push(a.node.imgId);
      collectImgIds(a.after || [], out);
    });
  });
  return Array.from(new Set(out));
}

// 所有分支里她发过的文档（删对话时一起清掉）
export function collectDocIds(msgs, out = []) {
  msgs.forEach((m) => {
    if (m.kind === "doc" && m.docId) out.push(m.docId);
    (m.alts || []).forEach((a) => {
      if (a.node && a.node.kind === "doc" && a.node.docId) out.push(a.node.docId);
      collectDocIds(a.after || [], out);
    });
  });
  return Array.from(new Set(out));
}
