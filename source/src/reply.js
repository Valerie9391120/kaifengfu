// =====================================================
// 拆他的回话：心里话、一条一条的话、表情包、换头像、改名字、文档块。
// 不碰页面，测试在 Node 里跑。
// 通知的小后端（supabase/push_function.ts 的 previewOf）照同一套规矩决定横幅上写什么：
// 这里改了规矩，那边得跟着改。tests/mail.test.mjs 拿同一批回话两边各拆一遍，对不上就不过。
// =====================================================
import { NAME_MARK, NAME_PLACEHOLDER, cleanMarkName } from "./names.js";
import { splitDocBlocks } from "./docs.js";

// 按 [SPLIT] 切成一条一条，记号两头的空白不要。
// 出来的东西和 text.split(/\s*\[SPLIT\]\s*/) 一样，只是不让正则在一长串空白上来回试（几万个连着的空行能把手机卡住好几秒）
export function splitTurns(text) {
  const chunks = String(text).split("[SPLIT]");
  return chunks.map((chunk, i) => {
    let s = chunk;
    if (i > 0) s = s.trimStart();
    if (i < chunks.length - 1) s = s.trimEnd();
    return s;
  });
}

export function splitMarks(text) {
  const parts = [];
  // 表情包、换头像、改名字三种标记。改名字的要独占一行才算（所以带 m 标志），新名字里可以有空格。
  // 表情包的文件名最长认两百个字（一长串没有右括号的，不来回试）
  const re = new RegExp("\\[(MEME|AVATAR)[:：]\\s*([^\\]\\s]{1,200})\\s*\\]|" + NAME_MARK, "gm");
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    // 照抄名帖里教的写法 [NAME:新名字]：是在讲怎么改，不是真改，留着当字显示
    if (!m[1] && cleanMarkName(m[3]) === NAME_PLACEHOLDER) continue;
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1]) parts.push({ type: m[1] === "AVATAR" ? "avatar" : "meme", value: m[2] });
    else parts.push({ type: "name", value: m[3] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

export function parseReply(text) {
  let thinking = "";
  let body = text || "";
  const m = body.match(/<thinking>([\s\S]*?)<\/thinking>/);
  if (m) {
    thinking = m[1].trim();
    body = body.replace(m[0], "");
  } else if (body.includes("<thinking>")) {
    thinking = body.split("<thinking>")[1].trim();
    body = "";
  }
  body = body.trim();
  const items = [];
  // 改名字的标记不显示成字，新名字单独带出去（写了好几次只认最后一次；收拾完是空的不算）
  let rename = null;
  // 先把文档块整块摘出来（里面的字不当标记看），剩下的再分条、认标记
  splitDocBlocks(body).forEach((part) => {
    if (part.type === "doc") {
      items.push({ type: "doc", name: part.name, text: part.text, ...(part.cut ? { cut: true } : {}) });
      return;
    }
    splitTurns(part.value).forEach((chunk) => {
      splitMarks(chunk).forEach((p) => {
        if (p.type === "meme") items.push({ type: "meme", file: p.value });
        else if (p.type === "avatar") items.push({ type: "avatar", file: p.value });
        else if (p.type === "name") rename = cleanMarkName(p.value) || rename;
        else if (p.value.trim()) items.push({ type: "text", text: p.value.trim() });
      });
    });
  });
  if (!items.length) items.push({ type: "text", text: "……" });
  return { thinking, body, items, rename };
}

// 换头像只认索引里真有的图，多次只留最后一次
export function settleAvatarItems(items, exists) {
  const valid = items.filter((it) => it.type !== "avatar" || exists(it.file));
  let lastAv = -1;
  valid.forEach((it, i) => {
    if (it.type === "avatar") lastAv = i;
  });
  const out = valid.filter((it, i) => it.type !== "avatar" || i === lastAv);
  return {
    items: out.length ? out : [{ type: "text", text: "……" }],
    avatarFile: lastAv >= 0 ? valid[lastAv].file : null,
  };
}
