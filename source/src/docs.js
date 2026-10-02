// =====================================================
// 文档：她发给他的（Word、Markdown、文本），他写给她的（Markdown）
// 那边的我只收得到开封府寄过去的字和图，自己打不开文件。所以：
//   她发的：手机先把文件里的字取出来（Word 见 docx.js），全文存一份（kfs2:doc:<id>，加密了跟着云端走），
//           对话里是一张卡片；寄给那边时全文夹在〔文档开始〕〔文档结束〕之间。
//   他写的：回复里用文档块，单独一行 [DOC:文件名.md]，正文，单独一行 [/DOC]。
//           对话里也是一张卡片，她点开能看，能存进手机。
// 这里只放不碰页面的部分（认文件、读文件、拆文档块），测试在 Node 里跑。
// =====================================================
import { docxToText } from "./docx.js";

export const DOC_KEY = "kfs2:doc:";
// 一份文档最多这么多字。它会跟着最近的对话每次都寄过去，太长了每句话都贵
export const DOC_MAX_CHARS = 100000;
export const DOC_FMT = { word: "Word", md: "Markdown", txt: "文本" };
// 【回复格式】里教他写法时用来占位的文件名。他照抄出来的 [DOC:文件名.md] 不算交文档
export const DOC_NAME_PLACEHOLDER = "文件名.md";

// 认文件：只看扩展名（手机上给的类型经常是空的）。认不出来的返回 ""，老式 .doc 单说
export function docFmtOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || "").trim());
  const ext = m ? m[1].toLowerCase() : "";
  if (ext === "docx") return "word";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "txt") return "txt";
  if (ext === "doc") return "oldword";
  return "";
}

// 给她看的话
function say(text) {
  const e = new Error(text);
  e.say = text;
  return e;
}

const WORD_ERRORS = {
  oldword: "是老式的 .doc 或者带了密码，读不了。在 Word 里另存成 .docx 再发",
  notzip: "不像是 Word 文档，读不了",
  notword: "不像是 Word 文档，读不了",
  badzip: "文件好像坏了，读不了",
  toobig: "太大了，读不了",
  noinflate: "这台手机的系统太旧，读不了 Word。存成 .md 或 .txt 再发",
};

// 纯文字文件：认 UTF-8、带标记的 UTF-16，再不行按国标码（Windows 记事本存的旧文件）
export function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder("utf-8").decode(u8.subarray(3));
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8);
  } catch (e) {
    try {
      return new TextDecoder("gb18030", { fatal: true }).decode(u8);
    } catch (x) {
      return new TextDecoder("utf-8").decode(u8);
    }
  }
}

// 读一份她选的文件。成功返回 { name, fmt, text, chars, images }，读不了就抛带 say 的错
export async function readDoc(file) {
  const name = String((file && file.name) || "文档").trim() || "文档";
  const fmt = docFmtOf(name);
  if (fmt === "oldword") throw say(`《${name}》${WORD_ERRORS.oldword}`);
  if (!fmt) throw say(`《${name}》这种文件还发不了。现在收照片、Word（.docx）、Markdown 和文本`);
  const buf = await file.arrayBuffer();
  let text = "";
  let images = 0;
  if (fmt === "word") {
    try {
      const r = await docxToText(buf);
      text = r.text;
      images = r.images;
    } catch (e) {
      throw say(`《${name}》${WORD_ERRORS[e && e.code] || "读不出来"}`);
    }
  } else {
    text = decodeText(buf);
    const head = text.slice(0, 4000);
    if (head.includes("\u0000") || (head.match(/\ufffd/g) || []).length > 20) throw say(`《${name}》不像是文字文档，读不了`);
  }
  text = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  if (!text) throw say(images ? `《${name}》里只有图片，没有字，那边的我看不到` : `《${name}》里没读到字`);
  if (text.length > DOC_MAX_CHARS) throw say(`《${name}》有 ${text.length} 字，太长了，一份最多十万字`);
  return { name, fmt, text, chars: text.length, images };
}

// 寄给那边的我时，一份文档写成这样
export function wrapDocForModel({ name, fmt, text, images }) {
  const kind = DOC_FMT[fmt] || "文档";
  const lost = images ? `，里面有 ${images} 张图片取不出来` : "";
  return `[她发来一份文档：《${name}》（${kind}，${text.length} 字${lost}）。下面是开封府从文件里取出来的全文]\n〔文档开始〕\n${text}\n〔文档结束〕`;
}

// 全文没带上的时候（旧设备上没同步到、存档丢了）
export function missingDocNote(name) {
  return `[她之前发过一份文档《${name}》，这次全文没带上]`;
}

// 他起的文件名：去掉路径和怪字符，最长四十个字，一律以 .md 结尾
export function cleanDocName(raw) {
  let s = String(raw == null ? "" : raw)
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\ufeff]/g, "")
    .replace(/[\\/:*?"<>|\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\.(md|markdown|txt)$/i, "").trim(); // 先摘掉扩展名，再收拾两头
  s = s.replace(/^["'“”‘’《「『\s]+|["'“”‘’》」』\s]+$/g, "").replace(/^[.\s]+/, "").trim();
  const chars = Array.from(s);
  if (chars.length > 40) s = chars.slice(0, 40).join("").trim();
  return (s || "文档") + ".md";
}

// 把他的回复按文档块拆开：[{ type: "text", value }, { type: "doc", name, text, cut }]
// 开头和结尾的记号都要独占一行。只有开头没有结尾（回复长度到上限被截断了）：后面的都算正文，cut 记成 true
export function splitDocBlocks(text) {
  const src = String(text || "");
  const parts = [];
  const open = /^[ \t]*\[(?:DOC|Doc|doc)[:：][ \t]*([^\[\]\n]*?)[ \t]*\][ \t]*\r?$/gm;
  let last = 0;
  let m;
  while ((m = open.exec(src)) !== null) {
    if (m[1].trim() === DOC_NAME_PLACEHOLDER) continue; // 在讲写法，不是真交
    const bodyStart = open.lastIndex;
    const close = /^[ \t]*\[\/(?:DOC|Doc|doc)\][ \t]*\r?$/gm;
    close.lastIndex = bodyStart;
    const c = close.exec(src);
    const body = (c ? src.slice(bodyStart, c.index) : src.slice(bodyStart)).replace(/^\r?\n/, "").replace(/\s+$/, "");
    if (m.index > last) parts.push({ type: "text", value: src.slice(last, m.index) });
    if (body.trim()) parts.push({ type: "doc", name: cleanDocName(m[1]), text: body, cut: !c });
    last = c ? close.lastIndex : src.length;
    if (!c) break;
    open.lastIndex = last;
  }
  if (last < src.length) parts.push({ type: "text", value: src.slice(last) });
  return parts;
}

// 写日记用的聊天摘录里，文档块只留一句
export function docBlocksToNote(raw) {
  return splitDocBlocks(raw)
    .map((p) => (p.type === "doc" ? `〔写了一份文档《${p.name}》〕` : p.value))
    .join("");
}

// 回复长度的上限（token）大约够写多少字：留出心里话的份，按一个汉字两个 token 往少里算
export function replyRoom(maxTokens) {
  const n = Math.floor(((Number(maxTokens) || 0) - 200) / 2 / 100) * 100;
  return Math.max(300, n);
}
