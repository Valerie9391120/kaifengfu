import { plainOf } from "../rich.js";

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
  const last = msgs[msgs.length - 1];
  if (!last) return "";
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
  if ((last.items || []).some((it) => it.type === "voice")) return "[语音]";
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
