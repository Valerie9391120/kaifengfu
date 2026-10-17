// 开封府打包：node build.mjs
// 测试时：KFS_TEST_URL=http://127.0.0.1:8787 KFS_OUT=dist-test node build.mjs
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";

const OUT = process.env.KFS_OUT || "dist";
const TEST_URL = process.env.KFS_TEST_URL || "";
const SUPABASE_URL = TEST_URL || "https://hrfjammapxnzmtlafykq.supabase.co";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(`${OUT}/assets`, { recursive: true });

const hash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 10);

const define = { "process.env.NODE_ENV": '"production"' };

// 并蒂莲那一页（长按侧栏的日期卡片进去，见开发说明“并蒂莲”那节）：一整个 HTML，九百多 KB，名字带指纹。
// 开封府开门不碰它，点进去的时候才用框装进来；地址写进包里（LotusPage.jsx 的 LOTUS_URL）
const lotus = fs.readFileSync("static/lotus.html");
const lotusName = `lotus-${hash(lotus)}.html`;
fs.writeFileSync(`${OUT}/assets/${lotusName}`, lotus);
define.__KFS_LOTUS__ = JSON.stringify(`./assets/${lotusName}`);

// 镜碎入月（黑夜主题的开屏，见开发说明“镜碎入月”那节）：也是一整个 HTML（两兆多，镜框模型在里面），开屏用框装着它。
// 它要的 three.js 是开封府自己带的（npm 里钉死 0.160.0，她那一页就是照这一版写的），同一个目录、名字带指纹；
// 那一页里写的是占位的 __KFS_THREE__，这里换成真名字，再给那一页算指纹
const three = fs.readFileSync("node_modules/three/build/three.module.min.js");
const threeName = `three-${hash(three)}.module.min.js`;
fs.writeFileSync(`${OUT}/assets/${threeName}`, three);
const mirrorSrc = fs.readFileSync("static/mirror.html", "utf8");
if (!mirrorSrc.includes("'./__KFS_THREE__'")) throw new Error("static/mirror.html 里没找到 __KFS_THREE__：用 tools/make_mirror.py 重新生成");
const mirror = Buffer.from(mirrorSrc.replace("'./__KFS_THREE__'", `'./${threeName}'`));
const mirrorName = `mirror-${hash(mirror)}.html`;
fs.writeFileSync(`${OUT}/assets/${mirrorName}`, mirror);
define.__KFS_MIRROR__ = JSON.stringify(`./assets/${mirrorName}`);

// 江湖棋局的引擎（她仓库里拷来的那一份，见 vendor/jianghu/、src/game/engine.js）：单独打一包，名字带指纹。
// 开封府开门不碰它，头一回要替他调引擎的时候才取（App.jsx 的 loadEngine，照包自己的地址找：两个都在 assets/ 里）。
// 照浏览器打：引擎里要是又混进了只有电脑上才有的东西（node: 开头的），这里就打不成，不会等到她手机上才坏
const jianghu = await build({
  entryPoints: ["src/game/engine.js"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["es2020", "safari14"],
  write: false,
  legalComments: "none",
  logLevel: "warning",
});
const jianghuJs = jianghu.outputFiles[0].contents;
const jianghuName = `jianghu-${hash(jianghuJs)}.js`;
fs.writeFileSync(`${OUT}/assets/${jianghuName}`, jianghuJs);
define.__KFS_JIANGHU__ = JSON.stringify(`./${jianghuName}`);

// 藏音匣（见开发说明“藏音匣”那节）：那一页单独一包、转繁体单独一包，都是点进藏音匣的时候才取；
// 图（纸的纹理、花、五张锦灰堆残纸）名字带指纹；刻本体切成一块一块的（static/jinhui/，tools/make_jinhui.py 生成的），
// 放进 assets/jinhui-<指纹>/，另写一张样式表（一块一个 @font-face，unicode-range 写着这一块管哪些字），页面上用到哪些字才取哪几块
const cyAsset = (src, name) => {
  const buf = fs.readFileSync(src);
  const out = `cy-${name}-${hash(buf)}.webp`;
  fs.writeFileSync(`${OUT}/assets/${out}`, buf);
  return `./assets/${out}`;
};
const jinhui = JSON.parse(fs.readFileSync("static/jinhui/slices.json", "utf8"));
const jinhuiBufs = jinhui.slices.map((sl) => fs.readFileSync(`static/jinhui/${sl.f}`));
const jinhuiDir = `jinhui-${hash(Buffer.concat([Buffer.from(JSON.stringify(jinhui)), ...jinhuiBufs]))}`;
fs.mkdirSync(`${OUT}/assets/${jinhuiDir}`, { recursive: true });
jinhui.slices.forEach((sl, i) => fs.writeFileSync(`${OUT}/assets/${jinhuiDir}/${sl.f}`, jinhuiBufs[i]));
fs.copyFileSync("static/jinhui/OFL.txt", `${OUT}/assets/${jinhuiDir}/OFL.txt`);
// 一块管哪些字：连着的码位并成一段（U+4E00-4E05）
const ranges = (text) => {
  const cps = [...new Set([...text].map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cps.length; ) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    const h = (n) => n.toString(16).toUpperCase();
    out.push(i === j ? `U+${h(cps[i])}` : `U+${h(cps[i])}-${h(cps[j])}`);
    i = j + 1;
  }
  return out.join(",");
};
const jinhuiCss = Buffer.from(
  `/* KFS Jinhui：齊伋體（Qiji, Copyright (c) 2020 Lingdong Huang, Reserved Font Name QIJI）加上 Noto Serif CJK SC 的标点数字（(c) 2017-2023 Adobe, Reserved Font Name 'Source'），SIL OFL 1.1；截出来、改了名的；授权见 ${jinhuiDir}/OFL.txt */\n` +
    // swap：那一块还没取回来先用宋体摆着（纸条那头最多等九百毫秒，等不及先摆宋体，到了再换），不让字空着
    jinhui.slices.map((sl) => `@font-face{font-family:"KFS Jinhui";src:url("${jinhuiDir}/${sl.f}") format("woff2");font-display:swap;unicode-range:${ranges(sl.c)}}`).join("\n") +
    "\n"
);
const jinhuiCssName = `jinhui-${hash(jinhuiCss)}.css`;
fs.writeFileSync(`${OUT}/assets/${jinhuiCssName}`, jinhuiCss);
const cyAssets = {
  tex: cyAsset("static/cangyin/paper.webp", "paper"),
  flower: cyAsset("static/cangyin/flower.webp", "flower"),
  strips: [1, 2, 3, 4, 5].map((i) => cyAsset(`static/cangyin/strip${i}.webp`, `strip${i}`)),
  font: `./assets/${jinhuiCssName}`,
};
const side = async (entry, name, extra = {}) => {
  const r = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: ["es2020", "safari14"],
    write: false,
    legalComments: "eof",
    logLevel: "warning",
    ...extra,
  });
  const buf = r.outputFiles[0].contents;
  const out = `${name}-${hash(buf)}.js`;
  fs.writeFileSync(`${OUT}/assets/${out}`, buf);
  return out;
};
const cangyinName = await side("src/cangyin/page.js", "cangyin", { define: { "process.env.NODE_ENV": '"production"', __KFS_CANGYIN_ASSETS__: JSON.stringify(cyAssets) } });
define.__KFS_CANGYIN__ = JSON.stringify(`./${cangyinName}`);
// 词典里全是汉字：照 UTF-8 原样写（esbuild 默认写成 \\uXXXX，大一倍）。
// opencc-js 是 MIT，词典是 OpenCC 的（Apache-2.0）：两份授权原文跟着包走（写在包的末尾）
const openccLic = ["node_modules/opencc-js/LICENSE", "node_modules/opencc-js/THIRD_PARTY_LICENSES.md"].map((f) => fs.readFileSync(f, "utf8").replace(/\*\//g, "* /")).join("\n\n");
const s2tName = await side("src/cangyin/s2t.js", "s2t", {
  charset: "utf8",
  banner: { js: "/*! opencc-js (MIT, Copyright (c) 2020-2021 The nk2028 Project) with OpenCC dictionary data (Apache-2.0); license texts at the end of this file */" },
  footer: { js: "/*!\n" + openccLic + "\n*/" },
});
define.__KFS_S2T__ = JSON.stringify(`./${s2tName}`);

if (TEST_URL) {
  define.__KFS_SUPABASE_URL__ = JSON.stringify(TEST_URL);
  define.__KFS_SUPABASE_KEY__ = JSON.stringify("sb_publishable_test");
}

const result = await build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020", "safari14"],
  jsx: "automatic",
  define,
  write: false,
  legalComments: "none",
  logLevel: "warning",
});
const js = result.outputFiles[0].contents;
const jsName = `app-${hash(js)}.js`;
fs.writeFileSync(`${OUT}/assets/${jsName}`, js);

execSync(`npx tailwindcss -c tailwind.config.cjs -i src/input.css -o ${OUT}/assets/_app.css --minify`, { stdio: "pipe" });
const css = fs.readFileSync(`${OUT}/assets/_app.css`);
const cssName = `app-${hash(css)}.css`;
fs.renameSync(`${OUT}/assets/_app.css`, `${OUT}/assets/${cssName}`);

const IMAGES = ["splash.webp", "kite.webp", "wall.webp", "splash-dingxiang.webp", "dx-heart.webp", "dx-blush.webp", "wall-dingxiang.webp", "wall-heiye.webp", "splash-heiye.webp"];
for (const f of IMAGES) fs.copyFileSync(`static/${f}`, `${OUT}/assets/${f}`);

// 两个入口：从哪个入口“添加到主屏幕”，图标就是哪个，头一回进去就是哪个主题（见 src/theme.js）。
// 苹果在添加那一刻把图标定死，所以想换图标只能删掉重新从另一个入口添加。
//   ./            青绿，沙燕图标
//   ./dingxiang/  丁香，小猪图标（页面里用 <base href="../">，资源还是从上一层拿）
const ENTRANCES = [
  { dir: "", icons: "icons", manifest: "manifest.webmanifest", color: "#D6DCCD", splash: "splash.webp" },
  { dir: "dingxiang", icons: "icons-dingxiang", manifest: "manifest-dingxiang.webmanifest", color: "#EFE2EF", splash: "splash-dingxiang.webp" },
];
for (const e of ENTRANCES) {
  fs.mkdirSync(`${OUT}/${e.icons}`, { recursive: true });
  for (const f of fs.readdirSync(`static/${e.icons}`)) fs.copyFileSync(`static/${e.icons}/${f}`, `${OUT}/${e.icons}/${f}`);
  // 图标换了，网址后面跟着变：Safari 添加到主屏幕时才不会拿缓存里的旧图
  e.icon = (f) => `./${e.icons}/${f}?v=${hash(fs.readFileSync(`static/${e.icons}/${f}`))}`;
  fs.writeFileSync(
    `${OUT}/${e.manifest}`,
    JSON.stringify(
      {
        name: "开封府",
        short_name: "开封府",
        lang: "zh-CN",
        id: e.dir ? `./${e.dir}/` : "./",
        start_url: e.dir ? `./${e.dir}/` : "./",
        scope: "./",
        display: "standalone",
        background_color: e.color,
        theme_color: e.color,
        icons: [
          { src: e.icon("icon-192.png"), sizes: "192x192", type: "image/png" },
          { src: e.icon("icon-512.png"), sizes: "512x512", type: "image/png" },
          { src: e.icon("icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      null,
      2
    )
  );
}

// 只许连 Supabase 和表情包仓库；万一页面里混进了坏东西，也送不出去
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://raw.githubusercontent.com",
  // 他的语音条：念好的声音在手机上变成 blob: 的地址再放（见 App.jsx 的 audioUrl）。不写这一句，声音被 default-src 拦下，放不出来
  "media-src 'self' blob:",
  // 打电话的实时听写（ElevenLabs 的 WebSocket，见 src/call/hear.js）：不写这一句连不上，电话退回手机自带的听写。
  // 测试的时候连的是假 Supabase 上的假的（同一个地址，ws:// 开头）
  `connect-src 'self' ${SUPABASE_URL} ${TEST_URL ? TEST_URL.replace(/^http/, "ws") : "wss://api.elevenlabs.io"} https://raw.githubusercontent.com`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// 整页不许捏（卿卿定的：开封府是固定的，不跟着双指放大缩小）。这是三道里的头一道，另两道见 src/nozoom.js。
// 主屏幕上的网页多半认这几个“不缩放”；Safari 里直接打开的不认（苹果给看不清字的人留的口子）
const VIEWPORT = "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

for (const e of ENTRANCES) {
  if (e.dir) fs.mkdirSync(`${OUT}/${e.dir}`, { recursive: true });
  fs.writeFileSync(
    `${OUT}/${e.dir ? e.dir + "/" : ""}index.html`,
    `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
${e.dir ? '<base href="../">\n' : ""}<meta name="viewport" content="${VIEWPORT}">
<meta name="theme-color" content="${e.color}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="开封府">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>开封府</title>
<link rel="manifest" href="./${e.manifest}">
<link rel="apple-touch-icon" href="${e.icon("apple-touch-icon.png")}">
<link rel="icon" type="image/png" sizes="192x192" href="${e.icon("icon-192.png")}">
<link rel="preload" as="image" href="./assets/${e.splash}">
<link rel="stylesheet" href="./assets/${cssName}">
</head>
<body>
<div id="root"></div>
<noscript>开封府需要打开 JavaScript 才能进门。</noscript>
<script type="module" src="./assets/${jsName}"></script>
</body>
</html>
`
  );
}
// 通知用的服务工作线程：原样放到根上，名字不带指纹（浏览器按这个固定的网址找它、查它更新没有）。
// 它管得着的范围是它所在的目录，放在根上两个入口才都在里面
fs.copyFileSync("src/sw.js", `${OUT}/sw.js`);

fs.writeFileSync(`${OUT}/.nojekyll`, "");
fs.writeFileSync(`${OUT}/robots.txt`, "User-agent: *\nDisallow: /\n");

const size = (p) => (fs.statSync(p).size / 1024).toFixed(0) + " KB";
console.log(`打包完成 → ${OUT}/`);
console.log(`  ${jsName}  ${size(`${OUT}/assets/${jsName}`)}`);
console.log(`  ${cssName}  ${size(`${OUT}/assets/${cssName}`)}`);
console.log(`  sw.js  ${size(`${OUT}/sw.js`)}`);
console.log(`  ${lotusName}  ${size(`${OUT}/assets/${lotusName}`)}`);
console.log(`  ${jianghuName}  ${size(`${OUT}/assets/${jianghuName}`)}`);
console.log(`  ${cangyinName}  ${size(`${OUT}/assets/${cangyinName}`)}`);
console.log(`  ${s2tName}  ${size(`${OUT}/assets/${s2tName}`)}`);
console.log(`  ${jinhuiCssName} + ${jinhuiDir}/（${jinhui.slices.length} 块，${(jinhuiBufs.reduce((n, b) => n + b.length, 0) / 1024).toFixed(0)} KB）`);
console.log(`  连接：${SUPABASE_URL}`);
