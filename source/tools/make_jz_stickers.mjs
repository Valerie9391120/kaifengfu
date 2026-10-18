// 手帐贴纸里 Fluent Emoji 那几栏：照 src/jz/stickerList.js 那张表，从 fluentui-emoji 包里把扁平的那一套拷进 vendor/fluent-emoji/flat/，
// 再生成 src/jz/stickers.js（另打成一包，头一回打开手帐贴纸栏才取，见 build.mjs）。
// 用法（在 source/ 里）：
//   npm pack fluentui-emoji@1.3.0 && tar xzf fluentui-emoji-1.3.0.tgz        # 拆出来是 package/
//   npx esbuild tools/make_jz_stickers.mjs --bundle --platform=node --format=esm --outfile=.cache/make_jz_stickers.mjs --loader:.jsx=jsx --log-level=warning
//   node .cache/make_jz_stickers.mjs package/icons/flat
// 表里的名字包里没有的，停下来说是哪几个，不写文件
import fs from "node:fs";
import path from "node:path";
import { EMOJI_NAMES } from "../src/jz/stickerList.js";

const from = process.argv[2];
if (!from || !fs.existsSync(from)) {
  console.error("给我 fluentui-emoji 包里 icons/flat 那个目录");
  process.exit(1);
}
const missing = EMOJI_NAMES.filter((n) => !fs.existsSync(path.join(from, n + ".svg")));
if (missing.length) {
  console.error("包里没有：" + missing.join("、"));
  process.exit(1);
}
const out = "vendor/fluent-emoji/flat";
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith(".svg") && !EMOJI_NAMES.includes(f.slice(0, -4))) fs.unlinkSync(path.join(out, f));
let bytes = 0;
for (const n of EMOJI_NAMES) {
  const svg = fs.readFileSync(path.join(from, n + ".svg"), "utf8").trim();
  if (!svg.startsWith("<svg")) throw new Error(n + " 不像一张 SVG");
  fs.writeFileSync(path.join(out, n + ".svg"), svg + "\n");
  bytes += svg.length;
}
const lines = [
  "// 生成的（tools/make_jz_stickers.mjs），别手改。手帐贴纸里 Fluent Emoji 那几栏的图：名字 → SVG 原文。",
  "// Fluent Emoji: Copyright (c) Microsoft Corporation, MIT License. fluentui-emoji: Copyright (c) 2022 Mohammad Abu Mattar, MIT License.",
  "// 授权原文见 vendor/fluent-emoji/LICENSE.md",
];
EMOJI_NAMES.forEach((n, i) => lines.push(`import e${i} from "../../vendor/fluent-emoji/flat/${n}.svg";`));
lines.push("export const EMOJI = {");
EMOJI_NAMES.forEach((n, i) => lines.push(`  ${JSON.stringify(n)}: e${i},`));
lines.push("};", "");
fs.writeFileSync("src/jz/stickers.js", lines.join("\n"));
console.log(`拷了 ${EMOJI_NAMES.length} 张，一共 ${(bytes / 1024).toFixed(0)} KB；src/jz/stickers.js 写好了`);
