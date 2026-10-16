// 藏音匣纸条上的刻本体（见开发说明“藏音匣”那节）要放进哪些字、照什么次序切块：生成 tools/jinhui_chars.txt。
//
// 纸条上的字是转成繁体（OpenCC 标准繁体，跟 src/cangyin/s2t.js 一样）以后再摆的，所以要的是繁体那一头的字。
// 两样并起来：
//   1. 现代汉语里常用的：照结巴分词那份词典的词频（三十四万多个词），每个词转成繁体，按词频把字加起来，取最常用的 7200 个
//      （按词频算覆盖九成九五）；
//   2. GB2312 里的六千七百多个简体字，一个一个转成繁体（单字转，常用简体字的繁体都在）。
// 次序：照第 1 样的词频从常用到不常用排（第 2 样里词频里没有的排在最后），切块的时候常用的在前头（见 tools/make_jinhui.py）。
//
// 用法：node tools/make_jinhui_chars.mjs <结巴的 dict.txt>
//   结巴的词典：pip download jieba==0.42.1 --no-deps --no-binary :all: 以后解开，在 jieba-0.42.1/jieba/dict.txt（MIT）。
//   这份词典只在这里用来排次序，不进开封府、不进仓库。
import fs from "node:fs";
import * as OpenCC from "opencc-js/cn2t";

const TOP = 7200;
const conv = OpenCC.Converter({ from: "cn", to: "t" });
const isHan = (cp) => (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0x20000 && cp <= 0x2ffff);

const dict = process.argv[2];
if (!dict) throw new Error("用法：node tools/make_jinhui_chars.mjs <结巴的 dict.txt>");
const freq = new Map();
for (const ln of fs.readFileSync(dict, "utf8").split("\n")) {
  const [w, f] = ln.split(" ");
  if (!w || !f) continue;
  for (const ch of conv(w)) if (isHan(ch.codePointAt(0))) freq.set(ch, (freq.get(ch) || 0) + Number(f));
}
const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0)).map((e) => e[0]);
const keep = new Set(ranked.slice(0, TOP));

// GB2312：一区一区排的那六千七百多个汉字（16 区到 87 区），一个一个转成繁体
const gb = new TextDecoder("gb18030");
for (let a = 0xb0; a <= 0xf7; a++)
  for (let b = 0xa1; b <= 0xfe; b++) {
    const ch = gb.decode(new Uint8Array([a, b]));
    if (ch.length !== 1 || !isHan(ch.codePointAt(0))) continue;
    for (const t of conv(ch)) if (isHan(t.codePointAt(0))) keep.add(t);
  }

const rank = new Map(ranked.map((ch, i) => [ch, i]));
const out = [...keep].sort((a, b) => (rank.has(a) ? rank.get(a) : 1e9) - (rank.has(b) ? rank.get(b) : 1e9) || a.codePointAt(0) - b.codePointAt(0));
fs.writeFileSync(new URL("./jinhui_chars.txt", import.meta.url), out.join("") + "\n");
console.log(`${out.length} 个字（词频里最常用的 ${TOP} 个 + GB2312 转繁体）→ tools/jinhui_chars.txt`);
