// 文档：认文件、读文件、寄给那边时的写法、他回复里的文档块
import { DOC_KEY, DOC_MAX_CHARS, DOC_FMT, DOC_NAME_PLACEHOLDER, docFmtOf, decodeText, readDoc, wrapDocForModel, missingDocNote, cleanDocName, splitDocBlocks, docBlocksToNote, replyRoom } from "../src/docs.js";
import { makeDocx, makeZip, p, fakeFile } from "./zip-util.mjs";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const sayOf = async (file) => { try { await readDoc(file); return ""; } catch (e) { return e.say || "没给话：" + e; } };
const te = new TextEncoder();

// ---- 认文件 ----
ok(docFmtOf("周末计划.docx") === "word" && docFmtOf("A.DOCX") === "word" && docFmtOf("笔记.md") === "md" && docFmtOf("x.markdown") === "md" && docFmtOf("读我.TXT") === "txt",
  "按扩展名认：.docx 是 Word，.md / .markdown 是 Markdown，.txt 是文本，大小写不管");
ok(docFmtOf("老文件.doc") === "oldword" && docFmtOf("表.xlsx") === "" && docFmtOf("书.pdf") === "" && docFmtOf("没有扩展名") === "" && docFmtOf("") === "" && docFmtOf(null) === "",
  "老式 .doc 单说；别的（Excel、PDF、没扩展名）不认");
ok(DOC_KEY === "kfs2:doc:" && DOC_MAX_CHARS === 100000 && DOC_FMT.word === "Word" && DOC_FMT.md === "Markdown" && DOC_FMT.txt === "文本", "存档里的位置、字数上限、三种叫法");

// ---- 纯文字的编码 ----
ok(decodeText(te.encode("你好，开封府").buffer) === "你好，开封府", "UTF-8 照常读");
ok(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...te.encode("带标记")]).buffer) === "带标记", "开头的 UTF-8 标记去掉");
ok(decodeText(new Uint8Array([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]).buffer) === "你好", "带标记的 UTF-16 也读得了");
ok(decodeText(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3, 0xa3, 0xac, 0xbf, 0xaa, 0xb7, 0xe2, 0xb8, 0xae]).buffer) === "你好，开封府", "Windows 记事本存的国标码旧文件：读出来不是乱码");

// ---- 读文件 ----
{
  const d = await readDoc(fakeFile("清单.md", "\ufeff# 清单\r\n\r\n- 一\r\n- 二\r\n\r\n"));
  ok(d.name === "清单.md" && d.fmt === "md" && d.text === "# 清单\n\n- 一\n- 二" && d.chars === d.text.length && d.images === 0, "Markdown：全文取出来，换行统一，前后的空白去掉，数好字数");
  const w = await readDoc(fakeFile("计划.docx", makeDocx(p("第一段") + `<w:p><w:r><w:drawing/></w:r></w:p>` + p("第二段"))));
  ok(w.fmt === "word" && w.text === "第一段\n\n[图片]\n\n第二段" && w.images === 1 && w.chars === w.text.length, "Word：取出字来，记下有几张图取不出来");
}
ok((await sayOf(fakeFile("旧的.doc", "x"))) === "《旧的.doc》是老式的 .doc 或者带了密码，读不了。在 Word 里另存成 .docx 再发", "老式 .doc：说清楚另存成 .docx");
{
  const ole = new Uint8Array(600); ole.set([0xd0, 0xcf, 0x11, 0xe0]);
  ok((await sayOf(fakeFile("带密码.docx", ole.buffer))).includes("带了密码，读不了"), "带密码的 .docx（里面不是 zip）：同样说清楚");
}
ok((await sayOf(fakeFile("账本.xlsx", "x"))) === "《账本.xlsx》这种文件还发不了。现在收照片、Word（.docx）、Markdown 和文本", "不认的类型：说现在收哪几种");
ok((await sayOf(fakeFile("假的.docx", "这不是 Word"))) === "《假的.docx》不像是 Word 文档，读不了" && (await sayOf(fakeFile("表格.docx", makeZip({ "xl/a.xml": "<a/>" })))) === "《表格.docx》不像是 Word 文档，读不了",
  "扩展名是 .docx 但里面不是 Word：说读不了");
ok((await sayOf(fakeFile("空的.md", "  \n\n "))) === "《空的.md》里没读到字" && (await sayOf(fakeFile("只有图.docx", makeDocx(`<w:p><w:r><w:drawing/></w:r></w:p>`)))) === "《只有图.docx》里没读到字" === false,
  "空文档：说没读到字（只有图片的 Word 另有说法）");
ok((await sayOf(fakeFile("只有图.docx", makeDocx(`<w:p><w:r><w:pict/></w:r></w:p>`)))) === "", "只有一个 [图片] 记号的 Word：记号也算字，照样能发（那边会说看不到图）");
ok((await sayOf(fakeFile("乱码.txt", new Uint8Array(3000).buffer))).includes("不像是文字文档"), "二进制文件改名成 .txt：认得出来，不发");
ok((await sayOf(fakeFile("太长.txt", "字".repeat(DOC_MAX_CHARS + 1)))) === `《太长.txt》有 ${DOC_MAX_CHARS + 1} 字，太长了，一份最多十万字` && (await sayOf(fakeFile("正好.txt", "字".repeat(DOC_MAX_CHARS)))) === "",
  "超过十万字：不发，说有多少字；正好十万字能发");

// ---- 寄给那边时的写法 ----
ok(wrapDocForModel({ name: "计划.docx", fmt: "word", text: "第一段\n第二段", images: 2 }) === "[她发来一份文档：《计划.docx》（Word，7 字，里面有 2 张图片取不出来）。下面是开封府从文件里取出来的全文]\n〔文档开始〕\n第一段\n第二段\n〔文档结束〕",
  "寄给那边：前面写文件名、类型、字数、有几张图取不出来，全文夹在〔文档开始〕〔文档结束〕之间");
ok(wrapDocForModel({ name: "a.md", fmt: "md", text: "x" }).startsWith("[她发来一份文档：《a.md》（Markdown，1 字）。") && missingDocNote("a.md") === "[她之前发过一份文档《a.md》，这次全文没带上]",
  "没有图片时不提图片；全文没带上时只留一句");

// ---- 他起的文件名 ----
ok(cleanDocName("采购清单.md") === "采购清单.md" && cleanDocName("采购清单") === "采购清单.md" && cleanDocName("notes.MD") === "notes.md" && cleanDocName("读我.txt") === "读我.md" && cleanDocName("a.markdown") === "a.md",
  "文件名一律以 .md 结尾：没写的补上，写了 .txt 的换掉");
ok(cleanDocName("  “周末 计划”.md ") === "周末 计划.md" && cleanDocName("a/b\\c:d*e?.md") === "a b c d e.md" && cleanDocName("../../etc/passwd") === "etc passwd.md" && cleanDocName("[x].md") === "x.md",
  "引号、路径、方括号、怪符号去掉");
ok(cleanDocName("") === "文档.md" && cleanDocName("   ") === "文档.md" && cleanDocName(".md") === "文档.md" && cleanDocName(null) === "文档.md" && cleanDocName("a\u0000b\u200b.md") === "ab.md",
  "空的、只有扩展名的：叫“文档.md”；看不见的控制符去掉");
ok(cleanDocName("字".repeat(60) + ".md") === "字".repeat(40) + ".md", "太长的截到四十个字");

// ---- 他回复里的文档块 ----
{
  const parts = splitDocBlocks("给你写好了\n[DOC:采购清单.md]\n# 清单\n\n- 酸奶\n- 青菜\n[/DOC]\n[SPLIT]\n看看");
  ok(parts.length === 3 && parts[0].type === "text" && parts[0].value === "给你写好了\n" && parts[1].type === "doc" && parts[1].name === "采购清单.md" && parts[1].text === "# 清单\n\n- 酸奶\n- 青菜" && parts[1].cut === false && parts[2].value === "\n[SPLIT]\n看看",
    "文档块拆出来：前后的话照旧，文件名、正文都对");
}
{
  const parts = splitDocBlocks("  [doc：笔记]  \r\n正文一\r\n正文二\r\n  [/DOC]  \r\n");
  ok(parts.filter((x) => x.type === "doc").length === 1 && parts[0].name === "笔记.md" && parts[0].text === "正文一\r\n正文二".replace(/\r/g, "\r") && !parts[0].cut, "小写、全角冒号、前后有空格、回车换行：都认");
}
{
  const parts = splitDocBlocks("先说一句\n[DOC:半截.md]\n写到一半就");
  ok(parts.length === 2 && parts[1].type === "doc" && parts[1].text === "写到一半就" && parts[1].cut === true, "只有开头没有结尾（回复被长度上限截断）：后面的都算正文，记成没写完");
}
{
  const explain = `写法是这样：\n[DOC:${DOC_NAME_PLACEHOLDER}]\n正文\n[/DOC]\n就行了`;
  const parts = splitDocBlocks(explain);
  ok(parts.length === 1 && parts[0].type === "text" && parts[0].value === explain, "照抄教写法用的占位文件名：是在讲怎么写，不算交文档，原样当字");
  const inline = "想交文档就写 [DOC:清单.md] 这样的记号，结尾写 [/DOC]";
  ok(splitDocBlocks(inline).length === 1 && splitDocBlocks(inline)[0].value === inline, "记号夹在句子里的不算");
}
{
  const parts = splitDocBlocks("[DOC:空.md]\n\n[/DOC]\n后面的话");
  ok(parts.every((x) => x.type === "text") && parts.map((x) => x.value).join("") === "\n后面的话", "正文是空的文档块：不出卡片");
  const two = splitDocBlocks("[DOC:一.md]\n甲\n[/DOC]\n中间\n[DOC:二.md]\n乙\n[/DOC]");
  ok(two.map((x) => x.type).join() === "doc,text,doc" && two[0].text === "甲" && two[2].name === "二.md" && two[2].text === "乙", "一条回复里交了两份：两张卡片");
  ok(splitDocBlocks("").length === 0 && splitDocBlocks(null).length === 0 && splitDocBlocks("平常说话").length === 1, "没有文档块的回复不受影响");
}
ok(docBlocksToNote("给你\n[DOC:清单.md]\n# 清单\n[/DOC]\n写好了") === "给你\n〔写了一份文档《清单.md》〕\n写好了", "写日记用的聊天摘录里，文档块只留一句");

// ---- 回复长度大约够写多少字 ----
ok(replyRoom(1024) === 400 && replyRoom(2048) === 900 && replyRoom(4096) === 1900 && replyRoom(0) === 300 && replyRoom(undefined) === 300, "回复上限折成字数：短 400、适中 900、长 1900（往少里算）");

console.log(`\n通过 ${pass}  失败 ${failN}`);
if (failN) process.exit(1);
