// Word（.docx）取字：自己拆 zip、自己读 XML，取出来的是 Markdown 样子的文字
import fs from "node:fs";
import { docxToText, parseXml } from "../src/docx.js";
import { makeZip, makeDocx, docXml, partXml, p } from "./zip-util.mjs";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const read = async (body, extra, opts) => (await docxToText(makeDocx(body, extra, opts)));
const codeOf = async (buf) => { try { await docxToText(buf); return "没报错"; } catch (e) { return e.code || String(e); } };

// ---- XML 读得对 ----
{
  const t = parseXml(`<?xml version="1.0"?><!-- 注释 --><a x="1" y='二'><b/>字&amp;&lt;&#x4e2d;&#20013;<c k="a&quot;b">里<![CDATA[<原样>]]></c></a>`);
  const a = t.kids[0];
  ok(a.name === "a" && a.attrs.x === "1" && a.attrs.y === "二" && a.kids[0].name === "b" && a.kids[1].text === "字&<中中"
     && a.kids[2].attrs.k === 'a"b' && a.kids[2].kids.map((k) => k.text).join("") === "里<原样>",
     "XML：属性、自闭合、转义、数字转义、CDATA、注释都认得");
}

// ---- 段落 ----
{
  const r = await read(p("第一段，前后有空格 ") + p("") + p("A &amp; B &lt;尖括号&gt;") + `<w:p><w:r><w:t>拆成</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>好几</w:t></w:r><w:r><w:t>截</w:t></w:r></w:p>`);
  ok(r.text === "第一段，前后有空格\n\nA & B <尖括号>\n\n拆成好几截" && r.images === 0 && r.tables === 0,
     "段落之间空一行；空段落不留；转义的符号还原；一段拆成好几截的接起来");
}
{
  const r = await read(`<w:p><w:r><w:t>甲</w:t><w:tab/><w:t>乙</w:t><w:br/><w:t>丙</w:t><w:noBreakHyphen/><w:t>丁</w:t></w:r></w:p>`);
  ok(r.text === "甲\t乙\n丙-丁", "制表符、段内换行、不断行的连字符");
}

// ---- 标题 ----
{
  const styles = partXml("styles",
    `<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="2"><w:name w:val="heading 2"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="a3"><w:name w:val="Title"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="mine"><w:name w:val="我的小标题"/><w:basedOn w:val="2"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="lvl"><w:name w:val="自定义"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>`);
  const r = await read(
    p("大题目", `<w:pStyle w:val="a3"/>`) + p("一级", `<w:pStyle w:val="1"/>`) + p("二级", `<w:pStyle w:val="2"/>`) +
    p("照着二级改的", `<w:pStyle w:val="mine"/>`) + p("样式里写了大纲级别", `<w:pStyle w:val="lvl"/>`) +
    p("段落上直接写了大纲级别", `<w:outlineLvl w:val="3"/>`) + p("正文", `<w:pStyle w:val="none"/>`),
    { "word/styles.xml": styles });
  ok(r.text === "# 大题目\n\n# 一级\n\n## 二级\n\n## 照着二级改的\n\n### 样式里写了大纲级别\n\n#### 段落上直接写了大纲级别\n\n正文",
     "标题：按样式的名字认（中文版 Word 里样式的代号是数字），照着标题改出来的样式、大纲级别也认");
  const r2 = await read(p("没有样式表", `<w:pStyle w:val="Heading2"/>`) + p("正文"));
  ok(r2.text === "## 没有样式表\n\n正文", "没有样式表的时候，按样式代号 Heading2 认");
}

// ---- 列表 ----
{
  const numbering = partXml("numbering",
    `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="lowerLetter"/></w:lvl></w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>`);
  const li = (t, id, lvl = 0) => p(t, `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${id}"/></w:numPr>`);
  const r = await read(p("买：") + li("酸奶", 1) + li("原味的", 1, 1) + li("青菜", 1) + li("先洗", 2) + li("洗两遍", 2, 1) + li("沥干", 2, 1) + li("再切", 2) + li("切丝", 2, 1) + p("完"),
    { "word/numbering.xml": numbering });
  ok(r.text === "买：\n\n- 酸奶\n  - 原味的\n- 青菜\n\n1. 先洗\n  1. 洗两遍\n  2. 沥干\n2. 再切\n  1. 切丝\n\n完",
     "列表：圆点的写 -，编号的自己数；往里一级缩两格，里面那级回到上一级以后从头数；两个列表之间空一行");
  const styles = partXml("styles", `<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>`);
  const r2 = await read(p("样式里带的列表", `<w:pStyle w:val="ListBullet"/>`) + p("第二项", `<w:pStyle w:val="ListBullet"/>`), { "word/numbering.xml": numbering, "word/styles.xml": styles });
  ok(r2.text === "- 样式里带的列表\n- 第二项", "列表写在样式里的（python-docx 就这么写）也认");
  const r3 = await read(li("没有编号表", 7) + p("标题也带编号", `<w:pStyle w:val="Heading1"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr>`) + p("编号关掉的", `<w:numPr><w:numId w:val="0"/></w:numPr>`));
  ok(r3.text === "- 没有编号表\n\n# 标题也带编号\n\n编号关掉的", "没有编号表时当圆点；带编号的标题还是标题；numId 是 0 表示不编号");
}

// ---- 表格 ----
{
  const tc = (...ps) => `<w:tc><w:tcPr><w:tcW w:w="100"/></w:tcPr>${ps.map((x) => p(x)).join("")}</w:tc>`;
  const r = await read(p("表前") + `<w:tbl><w:tblPr/><w:tblGrid/><w:tr>${tc("项目")}${tc("钱")}</w:tr><w:tr>${tc("菜|肉")}${tc("三十", "块")}</w:tr><w:tr>${tc("")}${tc("")}</w:tr><w:tr>${tc("只有一格")}</w:tr></w:tbl>` + p("表后"));
  ok(r.text === "表前\n\n| 项目 | 钱 |\n| --- | --- |\n| 菜\\|肉 | 三十 / 块 |\n| 只有一格 |  |\n\n表后" && r.tables === 1,
     "表格画成 | a | b |：竖线转义，一格里好几段用 / 隔开，空行不要，缺的格子补空");
}

// ---- 修订、超链接、域 ----
{
  const r = await read(
    `<w:p><w:r><w:t>原来的</w:t></w:r><w:del w:id="1"><w:r><w:delText>删掉的</w:delText></w:r></w:del><w:ins w:id="2"><w:r><w:t>新加的</w:t></w:r></w:ins>` +
    `<w:hyperlink r:id="x"><w:r><w:t>链接上的字</w:t></w:r></w:hyperlink>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>7</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `<w:r><w:commentReference w:id="0"/></w:r></w:p>`);
  ok(r.text === "原来的新加的链接上的字7", "修订里删掉的字不要、新加的要；超链接留字；域只留结果，域代码不要；批注记号不留");
}

// ---- 图片和文本框 ----
{
  const pic = `<w:r><w:drawing><wp:inline><a:graphic xmlns:a="x"><a:graphicData><pic:pic xmlns:pic="y"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const box = `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><wps:wsp><wps:txbx><w:txbxContent>${p("框里的字")}</w:txbxContent></wps:txbx></wps:wsp></wp:anchor></w:drawing></mc:Choice>` +
    `<mc:Fallback><w:pict><v:textbox><w:txbxContent>${p("框里的字")}</w:txbxContent></v:textbox></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
  const r = await read(`<w:p><w:r><w:t>图在这：</w:t></w:r>${pic}</w:p><w:p>${pic}</w:p><w:p><w:r><w:t>框前</w:t></w:r>${box}</w:p>`);
  ok(r.text === "图在这：[图片]\n\n[图片]\n\n框前\n框里的字" && r.images === 2,
     "图片原处留一个 [图片] 并且数出来；文本框里的字取出来，新旧两种写法并排放着的只取一遍");
}

// ---- 脚注 ----
{
  const foot = partXml("footnotes", `<w:footnote w:type="separator" w:id="0">${p("线")}</w:footnote><w:footnote w:id="2"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t>出处在这。</w:t></w:r></w:p></w:footnote>`);
  const end = partXml("endnotes", `<w:endnote w:id="1">${p("尾注的字")}</w:endnote>`);
  const r = await read(`<w:p><w:r><w:t>正文</w:t></w:r><w:r><w:footnoteReference w:id="2"/></w:r><w:r><w:t>接着写</w:t></w:r><w:r><w:endnoteReference w:id="1"/></w:r></w:p>`,
    { "word/footnotes.xml": foot, "word/endnotes.xml": end });
  ok(r.text === "正文[注1]接着写[注2]\n\n---\n\n[注1] 出处在这。\n[注2] 尾注的字", "脚注、尾注：正文里留 [注1]，内容附在最后");
}

// ---- 不压缩的 zip、别的前缀 ----
{
  const r = await read(p("没压缩"), {}, { store: true });
  ok(r.text === "没压缩", "zip 里没压缩的部件也读得了");
  const alt = makeZip({ "word/document.xml": `<x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:body><x:p><x:r><x:t>前缀不是 w</x:t></x:r></x:p></x:body></x:document>` });
  ok((await docxToText(alt)).text === "前缀不是 w", "标签前缀不叫 w 的也认（照声明找）");
}

// ---- 读不了的 ----
{
  const ole = new Uint8Array(600); ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  ok(await codeOf(ole.buffer) === "oldword", "老式 .doc（或者带密码的 Word）：认得出来，说 oldword");
  ok(await codeOf(new TextEncoder().encode("这只是一段字，不是 zip").buffer) === "notzip" && await codeOf(new ArrayBuffer(0)) === "notzip", "不是 zip：notzip");
  ok(await codeOf(makeZip({ "xl/workbook.xml": "<a/>" })) === "notword", "是 zip 但里面没有 Word 正文（比如 Excel）：notword");
  ok(await codeOf(makeZip({ "word/document.xml": "<w:document/>" })) === "notword", "有正文部件但里面没有 body：notword");
  const good = new Uint8Array(makeDocx(p("好的")));
  const broken = good.slice(); for (let i = 60; i < 90; i++) broken[i] = 0xff;
  ok(["badzip", "notword"].includes(await codeOf(broken.buffer)), "压缩的内容坏了：不会卡死，报读不了");
}

// ---- 两家软件真存出来的文件 ----
const fileBuf = (name) => { const b = fs.readFileSync("tests/fixtures/" + name); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
{
  const r = await docxToText(fileBuf("文档-测试.docx"));
  ok(r.text.startsWith("# 测试用的周末计划\n\n这是一份给自动测试用的 Word 文档") && r.text.includes("# 上午\n\n- 去早市\n- 买花\n\n# 下午\n\n1. 洗衣服\n2. 晒被子\n\n## 花销")
     && r.text.includes("| 项目 | 钱 |\n| --- | --- |\n| 花 | 12 |\n| 菜\\|肉 | 30 |") && r.text.includes("下面有一张图：\n\n[图片]") && r.text.endsWith("最后一段，带加粗和 A & B <尖括号> 这样的符号。") && r.images === 1 && r.tables === 1,
     "python-docx 存的 Word：标题、两种列表、表格、图片记号、带符号的一段，都取对了");
}
{
  const r = await docxToText(fileBuf("文档-测试-lo.docx"));
  ok(r.text === "# 另一家软件存的文档\n\n这一份是 LibreOffice 存出来的，标签的写法和 Word 不一样。\n\n## 清单\n\n- 第一样\n- 第二样\n\n1. 先做这个\n2. 再做那个\n\n| 名字 | 数量 |\n| --- | --- |\n| 苹果 | 3 |\n\n结尾的一段。",
     "LibreOffice 存的 Word：也取对了");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
if (failN) process.exit(1);
