// =====================================================
// 拆他的回话：心里话、一条一条的话、表情包、换头像、改名字、文档块。
// 不碰页面，测试在 Node 里跑。
// 通知的小后端（supabase/push_function.ts 的 bubblesOf）照同一套规矩决定敲几条横幅、各写什么（一个气泡一条）：
// 这里改了规矩，那边得跟着改。tests/mail.test.mjs 拿同一批回话两边各拆一遍，对不上就不过。
// =====================================================
import { NAME_MARK, NAME_PLACEHOLDER, cleanMarkName } from "./names.js";
import { splitDocBlocks, DOC_NAME_PLACEHOLDER } from "./docs.js";
import { splitVoice } from "./voice.js";

// 语音里不留 [VOICE] 这几个字：摘到没有为止（摘掉一个，两头拼起来可能又成了一个，像 [VOI[VOICE]CE]）。
// 从头往后一个字一个字地收，收进来的末尾正好是一个，就把它扔掉：和一遍一遍摘到没有的结果一样，只走一趟（不来回试）。
// 通知的小后端（push_function.ts 的 bubblesOf）照同一个办法摘：改一边要跟着改另一边
const TOKENS = ["[VOICE]", "[Voice]", "[voice]"];
export function untoken(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    out.push(text[i]);
    if (text[i] === "]" && out.length >= 7 && TOKENS.includes(out.slice(-7).join(""))) out.length -= 7;
  }
  return out.join("");
}

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
      // 一条里 [VOICE] 那一行起是语音（见 voice.js 的 splitVoice）。语音里的字并成一条语音，
      // 里头夹着的表情包、换头像、改名字照认，排在这条语音后面
      splitVoice(chunk).forEach((seg) => {
        const words = [];
        const marks = [];
        splitMarks(seg.text).forEach((p) => {
          if (p.type === "meme") marks.push({ type: "meme", file: p.value });
          else if (p.type === "avatar") marks.push({ type: "avatar", file: p.value });
          else if (p.type === "name") rename = cleanMarkName(p.value) || rename;
          else if (seg.voice) words.push(p.value);
          else if (p.value.trim()) marks.push({ type: "text", text: p.value.trim() });
        });
        // 语音里不留 [VOICE] 这几个字（同一行写了两遍的；表情包夹在中间、两头拼起来又成了一个的）：
        // 留着的话，写回去（rawOf）再拆，它会被当成又一条语音的开头
        const said = untoken(words.join("")).trim();
        if (said) items.push({ type: "voice", text: said });
        marks.forEach((x) => items.push(x)); // 一样一样塞（展开的写法碰上几十万样会撑爆）
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

// 反过来：把一条回话的那几样（items）写回他的写法。
// 用在她按了停、把他正在蹦的回话掐断的时候（见 thread.js 的 cutReply）：那一条只剩前面几样，
// 往后寄给那边的我的“他自己说过的话”（raw）得跟着改成只有这几样，他才当自己就说了这么多。
// 写出来的再拿 parseReply 拆一遍，得到的还是这几样（tests/mail.test.mjs 里拿几万条回话对着拆）。
// 只有一种对不上：一句话自己长得就像记号（他把 [NAME:…]、[DOC:…]、[VOICE] 紧贴在别的记号后面写，原来没被当成记号、当字显示了），
// 单独写出来就成了真记号。那是他写岔了的样子，这里不去学；raw 只寄给那边的我看，开封府自己不照它再改名字、再出文档。
// rename：这一条里他给自己改的名字（没改就不带）。改名的记号写在最前头：
// 最后一样要是没写完的文档（没有结尾的记号），写在它后面的都会被算成文档的正文
export function rawOf(items, rename) {
  const parts = (items || []).map((it) => {
    if (it.type === "meme") return `[MEME:${it.file}]`;
    if (it.type === "avatar") return `[AVATAR:${it.file}]`;
    // 语音：记号和头一行写在同一行（拆的时候认得）。头一行原来就是跟在记号后面的，
    // 单独另起一行的话，它要是长得像文档开头的记号（[DOC:…]），再拆就成了一份文档
    if (it.type === "voice") return `[VOICE] ${it.text || ""}`;
    if (it.type === "doc") {
      // 文件名正好是教写法时占位的那个：照抄会被当成“在讲写法”，套一层书名号（拆的时候会剥掉）
      const name = it.name === DOC_NAME_PLACEHOLDER ? `《${it.name.replace(/\.md$/, "")}》` : it.name;
      return `[DOC:${name}]\n${it.text}${it.cut ? "" : "\n[/DOC]"}`;
    }
    return it.text || "";
  });
  if (rename) parts.unshift(`[NAME:${rename}]`);
  return parts.join("\n[SPLIT]\n");
}
