// 开封府打包：node build.mjs
// 测试时：KFS_TEST_URL=http://127.0.0.1:8787 KFS_OUT=dist-test node build.mjs
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { makeTongye, tyKit } from "./tools/tongye.mjs";
import { makeTyFonts } from "./tools/tyfonts.mjs";

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
// 秘戏钱匣那一页（她拿来的《锦盒抽签》，tools/make_qianxia.py 生成的，见开发说明“秘戏钱匣”那节）：一整个 HTML，两兆六，名字带指纹。
// 卷轴上的字用刻本体：那一页里写的是占位的 __KFS_JINHUI__，这里换成上面那张样式表的真名字（同一个目录），再算指纹。
// 开封府开门不碰它，南衙里点秘戏钱匣的时候才用框装进来（src/qx/QxPage.jsx 的 QX_URL）
const qxSrc = fs.readFileSync("static/qianxia.html", "utf8");
if (!qxSrc.includes('href="./__KFS_JINHUI__"')) throw new Error("static/qianxia.html 里没找到 __KFS_JINHUI__：用 tools/make_qianxia.py 重新生成");
const qianxia = Buffer.from(qxSrc.replace('href="./__KFS_JINHUI__"', `href="./${jinhuiCssName}"`));
const qianxiaName = `qianxia-${hash(qianxia)}.html`;
fs.writeFileSync(`${OUT}/assets/${qianxiaName}`, qianxia);
define.__KFS_QIANXIA__ = JSON.stringify(`./assets/${qianxiaName}`);
// 狐宇宙那一页（他屋里的一张书案，tools/make_desk.py 生成的，见 src/desk/DeskPage.jsx）：页面一个 HTML，图、几何、两份截出来的小字体在 static/desk/files/ 里，
// 一样一个带指纹的名字放进 assets/desk/（哪一样变了只换那一样，别的照旧读缓存）；页面里的 __KFS_DESK_FILES__ 换成 { 名字: 网址 }，
// __KFS_DESK_FILE__名字 换成那一样的网址。字：页面上写死的那些字截好了一份（wenkai-ui.woff2）；递进来的字不在里面的，用霞鹜文楷切好的那一份
// （npm 的 lxgw-wenkai-webfont，Regular，原样拷进 assets/wenkai-<指纹>/，样式表里叫 KFS WenKai，扣掉截好的那些字）；刻本体同藏音匣那一份。
// 安全规矩里记上页面里每一段脚本的指纹（只许跑这几段）。开封府开门不碰它，南衙里点狐宇宙的时候才用框装进来（DESK_URL）
const deskFiles = {};
fs.mkdirSync(`${OUT}/assets/desk`, { recursive: true });
for (const f of fs.readdirSync("static/desk/files").sort()) {
  const buf = fs.readFileSync(`static/desk/files/${f}`);
  const dot = f.lastIndexOf(".");
  const out = `${f.slice(0, dot)}-${hash(buf)}${f.slice(dot)}`;
  fs.writeFileSync(`${OUT}/assets/desk/${out}`, buf);
  deskFiles[f] = `./desk/${out}`;
}
const WK = "node_modules/lxgw-wenkai-webfont";
const wkUi = new Set([...fs.readFileSync("static/desk/wenkai-ui.chars.txt", "utf8")].map((c) => c.codePointAt(0)));
const wkFaces = [];
for (const blk of fs.readFileSync(`${WK}/lxgwwenkai-regular.css`, "utf8").match(/@font-face\s*\{[^}]*\}/g) || []) {
  const url = /url\(['"]?\.\/files\/([^'")]+)['"]?\)/.exec(blk);
  const range = /unicode-range:\s*([^;}]+)/.exec(blk);
  if (!url || !range) continue;
  const cps = [];
  for (const part of range[1].split(",")) {
    const [a, b] = part.trim().replace(/^U\+/i, "").split("-").map((x) => parseInt(x, 16));
    for (let c = a; c <= (b || a); c++) if (!wkUi.has(c)) cps.push(c);
  }
  if (cps.length) wkFaces.push({ f: url[1], cps });
}
if (wkFaces.length < 50) throw new Error("霞鹜文楷切好的那一份认不出来：看 node_modules/lxgw-wenkai-webfont/lxgwwenkai-regular.css 是不是换了写法");
const wkBufs = wkFaces.map((x) => fs.readFileSync(`${WK}/files/${x.f}`));
const wkDir = `wenkai-${hash(Buffer.concat([Buffer.from(JSON.stringify(wkFaces.map((x) => x.f))), ...wkBufs]))}`;
fs.mkdirSync(`${OUT}/assets/${wkDir}`, { recursive: true });
wkFaces.forEach((x, i) => fs.writeFileSync(`${OUT}/assets/${wkDir}/${x.f}`, wkBufs[i]));
fs.copyFileSync(`${WK}/OFL.txt`, `${OUT}/assets/${wkDir}/OFL.txt`);
const wkCss = Buffer.from(
  `/* KFS WenKai：霞鹜文楷（LXGW WenKai，github.com/lxgw/LxgwWenKai，SIL OFL 1.1；npm 的 lxgw-wenkai-webfont 切好的原样文件，授权见 ${wkDir}/OFL.txt） */\n` +
    wkFaces.map((x) => `@font-face{font-family:"KFS WenKai";src:url("${wkDir}/${x.f}") format("woff2");font-weight:300 700;font-display:swap;unicode-range:${ranges(String.fromCodePoint(...x.cps))}}`).join("\n") +
    "\n"
);
const wkCssName = `wenkai-${hash(wkCss)}.css`;
fs.writeFileSync(`${OUT}/assets/${wkCssName}`, wkCss);
// 信笺纸底下她留的信用龙藏体（那一页里截好的那一小份只有“到此一游”、红圈里那几个字）：用同页那一份字里的龙藏体（Long Cang 400，
// 同一个 @fontsource/long-cang 包的原样文件，已经在 assets/tyfonts-<指纹>/ 里，不另放一份），那一页挂上它那一张样式表，用到哪些字取哪几块
const tySrc = fs.readFileSync("vendor/tongye/app.html", "utf8");
const tyFonts = makeTyFonts(tySrc);
const lcCss = tyFonts.manifest.css["Long Cang|400"];
if (!lcCss) throw new Error("同页的字里没有龙藏体（Long Cang 400）：狐宇宙纸底下她留的信要用它");
let deskSrc = fs.readFileSync("static/desk/desk.html", "utf8");
for (const k of ["__KFS_DESK_FILES__", 'href="./__KFS_WENKAI__"', 'href="./__KFS_JINHUI__"', 'href="./__KFS_LONGCANG__"', '"__KFS_DESK_CSP__"'])
  if (!deskSrc.includes(k)) throw new Error(`static/desk/desk.html 里没找到 ${k}：用 tools/make_desk.py 重新生成`);
deskSrc = deskSrc
  .replace("__KFS_DESK_FILES__", JSON.stringify(deskFiles))
  .replace(/__KFS_DESK_FILE__([A-Za-z0-9_.-]+)/g, (_, f) => {
    if (!deskFiles[f]) throw new Error(`static/desk/desk.html 要的 ${f} 不在 files/ 里`);
    return deskFiles[f];
  })
  .replace('href="./__KFS_WENKAI__"', `href="./${wkCssName}"`)
  .replace('href="./__KFS_JINHUI__"', `href="./${jinhuiCssName}"`)
  .replace('href="./__KFS_LONGCANG__"', `href="./${tyFonts.dir}/${lcCss}"`);
const deskScripts = [...deskSrc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
if ((deskSrc.match(/<script\b/g) || []).length !== deskScripts.length) throw new Error("static/desk/desk.html 里有带属性的 <script>：安全规矩里记不上它的指纹");
// 图：那一页自己的、递进去的（表情包、照片、他的画都是 data:；仓库里新加的表情包从表情包仓库取，同开封府）；声音：信匣里他念好的语音（递进去的 data:，就在那一页里放）
const deskCsp = `default-src 'none'; script-src ${deskScripts.join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://raw.githubusercontent.com; media-src data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'`;
const desk = Buffer.from(deskSrc.replace('"__KFS_DESK_CSP__"', `"${deskCsp}"`));
const deskName = `desk-${hash(desk)}.html`;
fs.writeFileSync(`${OUT}/assets/${deskName}`, desk);
define.__KFS_DESK__ = JSON.stringify(`./assets/${deskName}`);
// 开封府这头也用一份霞鹜文楷：盖在案上那一层上的梦库、梦廊照屋里卡片的样子写（见 src/ui/parts.jsx 的 Sheet look="room"），字跟那一页一样。
// 截好的那些字（那一页里那一条 @font-face，网址照那一页的写法，相对 assets/）加上切好的那一份，DeskPage.jsx 打开的时候挂上
const wkUiFace = (deskSrc.match(/@font-face\{font-family:"KFS WenKai";src:url\("[^"]+"\)[^}]*\}/) || [])[0];
if (!wkUiFace) throw new Error("static/desk/desk.html 里没找到截好的那一份文楷：用 tools/make_desk.py 重新生成");
const wkHost = Buffer.from(wkUiFace.replace("font-display:block", "font-display:swap") + "\n" + wkCss.toString());
const wkHostName = `wenkai-host-${hash(wkHost)}.css`;
fs.writeFileSync(`${OUT}/assets/${wkHostName}`, wkHost);
define.__KFS_WENKAI_CSS__ = JSON.stringify(`./assets/${wkHostName}`);
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
// 拼豆作那一页（src/pindou/page.js）：同藏音匣，另打一包，头一回点进去才取。名字写在包里，换了以后上一版的留一份（见开发说明“改前端”）
const pindouName = await side("src/pindou/page.js", "pindou");
define.__KFS_PINDOU__ = JSON.stringify(`./${pindouName}`);
// 词典里全是汉字：照 UTF-8 原样写（esbuild 默认写成 \\uXXXX，大一倍）。
// opencc-js 是 MIT，词典是 OpenCC 的（Apache-2.0）：两份授权原文跟着包走（写在包的末尾）
const openccLic = ["node_modules/opencc-js/LICENSE", "node_modules/opencc-js/THIRD_PARTY_LICENSES.md"].map((f) => fs.readFileSync(f, "utf8").replace(/\*\//g, "* /")).join("\n\n");
const s2tName = await side("src/cangyin/s2t.js", "s2t", {
  charset: "utf8",
  banner: { js: "/*! opencc-js (MIT, Copyright (c) 2020-2021 The nk2028 Project) with OpenCC dictionary data (Apache-2.0); license texts at the end of this file */" },
  footer: { js: "/*!\n" + openccLic + "\n*/" },
});
define.__KFS_S2T__ = JSON.stringify(`./${s2tName}`);
// 原来那一版手帐的 Fluent Emoji 贴纸包（src/jz/stickers.js → assets/jzstk-<指纹>.js）：闲笔集换成同页以后用不着了，不再打（同页的贴纸都在它那一页里）
// 同页（TangfanOVO/tongye 那一本手帐，作者同意了搬进来，见 vendor/tongye/KFS.md）：照原样拿它那一页，打 tools/tongye.mjs 里那几处补丁，
// 把开封府那一层（src/tongye/bridge.js）塞进最前面，配上这一页自己的安全规矩（只许跑这几段脚本、只连自己），名字带指纹。
// 开封府开门不碰它，闲笔集里点手帐的时候才用框装进来（TongyeFrame.jsx 的 TONGYE_URL）。
// 它要的字（原来从 Google Fonts 现取，卿卿定的放到开封府自己这儿）：tools/tyfonts.mjs 照那一页里写的现算、从装好的 @fontsource 包里拿原样文件，
// 放进 assets/tyfonts-<指纹>/（一千五百多块、三十几兆，页面上用到哪些字才取哪几块）；<head> 里那几张写进那一页，换风格要的清单交给开封府那一层
for (const [p, buf] of tyFonts.files) {
  const out = `${OUT}/assets/${tyFonts.dir}/${p}`;
  fs.mkdirSync(out.slice(0, out.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(out, buf);
}
const tyBridge = await build({
  entryPoints: ["src/tongye/bridge.js"],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2020", "safari14"],
  write: false,
  legalComments: "none",
  charset: "utf8",
  logLevel: "warning",
  define: { __KFS_TYFONTS__: JSON.stringify(tyFonts.manifest) },
});
const ty = makeTongye(tySrc, tyBridge.outputFiles[0].text, tyFonts);
// 同页的版式、风格各叫什么、什么样：叫他排一页的时候列给他挑（tongye/host.js 的 tyArrangeAsk）
define.__KFS_TYKIT__ = JSON.stringify(tyKit(tySrc));
const tyBuf = Buffer.from(
  ty.html.replace(
    "<!doctype html>",
    "<!doctype html>\n<!-- 同页 · tongye — Copyright (c) 2026 幡幡 (TangfanOVO), AGPL-3.0 (https://github.com/TangfanOVO/tongye); used in 开封府 with the author's permission, patched as listed in tools/tongye.mjs. Bundled assets keep their own licenses: see vendor/tongye/NOTICE.md and vendor/tongye/LICENSE in the kaifengfu repository. -->"
  )
);
const tyName = `tongye-${hash(tyBuf)}.html`;
fs.writeFileSync(`${OUT}/assets/${tyName}`, tyBuf);
define.__KFS_TONGYE__ = JSON.stringify(`./assets/${tyName}`);

if (TEST_URL) {
  define.__KFS_SUPABASE_URL__ = JSON.stringify(TEST_URL);
  define.__KFS_SUPABASE_KEY__ = JSON.stringify("sb_publishable_test");
}

// 图画院的框景（见开发说明“图画院：框景”那节）：光墙、挂落、长案、十瓶花，秘戏钱匣那一轴切成的五截。
// 名字带指纹；点进图画院才取（瓶花只取当天那一瓶）
const thAsset = (f) => {
  const buf = fs.readFileSync(`static/tuhua/${f}`);
  const out = `th-${f.replace(/\.webp$/, "")}-${hash(buf)}.webp`;
  fs.writeFileSync(`${OUT}/assets/${out}`, buf);
  return `./assets/${out}`;
};
define.__KFS_TUHUA_ASSETS__ = JSON.stringify({
  wall: thAsset("wall.webp"),
  lattice: thAsset("lattice.webp"),
  table: thAsset("table.webp"),
  zhouTop: thAsset("zhou-top.webp"),
  zhouTian: thAsset("zhou-tian.webp"),
  zhouPaper: thAsset("zhou-paper.webp"),
  zhouDi: thAsset("zhou-di.webp"),
  zhouBottom: thAsset("zhou-bottom.webp"),
  vases: Array.from({ length: 10 }, (_, i) => thAsset(`vase${i + 1}.webp`)),
});

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

// 三个入口：从哪个入口“添加到主屏幕”，图标就是哪个，头一回进去就是哪个主题（见 src/theme.js）。
// 苹果在添加那一刻把图标定死，所以想换图标只能删掉重新从另一个入口添加。
//   ./            青绿，沙燕图标
//   ./dingxiang/  丁香，小猪图标（页面里用 <base href="../">，资源还是从上一层拿）
//   ./heiye/      黑夜，月亮图标（10 月 19 日添的，同丁香，也是 <base href="../">）
const ENTRANCES = [
  { dir: "", icons: "icons", manifest: "manifest.webmanifest", color: "#D6DCCD", splash: "splash.webp" },
  { dir: "dingxiang", icons: "icons-dingxiang", manifest: "manifest-dingxiang.webmanifest", color: "#EFE2EF", splash: "splash-dingxiang.webp" },
  { dir: "heiye", icons: "icons-heiye", manifest: "manifest-heiye.webmanifest", color: "#060911", splash: "splash-heiye.webp" },
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

// 只许连 Supabase、表情包仓库和手帐的天气（Open-Meteo）；万一页面里混进了坏东西，也送不出去
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://raw.githubusercontent.com",
  // 他的语音条：念好的声音在手机上变成 blob: 的地址再放（见 App.jsx 的 audioUrl）。不写这一句，声音被 default-src 拦下，放不出来
  "media-src 'self' blob:",
  // 打电话的实时听写（ElevenLabs 的 WebSocket，见 src/call/hear.js）：不写这一句连不上，电话退回手机自带的听写。
  // 测试的时候连的是假 Supabase 上的假的（同一个地址，ws:// 开头）
  // 手帐上的天气（Open-Meteo，见 src/jz/weather.js）：找城市、取那一天的天气，只寄城市的经纬度和日子
  // 传话走她笔记本上的 Claude Code（见 src/cloud.js 的那扇门）：门只在 Tailscale 里开，门牌是 https://<电脑>.<tailnet>.ts.net:8443。
  // 测试的时候是假 Supabase 旁边那扇假门（端口 +1，见 tests/mock-supabase.mjs）
  `connect-src 'self' ${SUPABASE_URL} ${TEST_URL ? TEST_URL.replace(/^http/, "ws") : "wss://api.elevenlabs.io"} https://raw.githubusercontent.com https://geocoding-api.open-meteo.com https://api.open-meteo.com https://archive-api.open-meteo.com https://*.ts.net:8443${TEST_URL ? " " + TEST_URL.replace(/:(\d+)$/, (m, n) => ":" + (Number(n) + 1)) : ""}`,
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
// 它管得着的范围是它所在的目录，放在根上三个入口才都在里面
fs.copyFileSync("src/sw.js", `${OUT}/sw.js`);

// 他画画（见 supabase/draw_function.ts）：开封府在 ElevenLabs 那头的身份说明（OAuth 的 Client ID Metadata Document），
// 和登录完了浏览器落脚的那一页。名字不带指纹：ElevenLabs 照着固定的网址来取，那份说明里写的 client_id 就是它自己的网址
fs.mkdirSync(`${OUT}/oauth`, { recursive: true });
const DRAW_CLIENT = "https://valerie9391120.github.io/kaifengfu/oauth/draw-client.json";
fs.writeFileSync(
  `${OUT}/oauth/draw-client.json`,
  JSON.stringify(
    {
      client_id: DRAW_CLIENT,
      client_name: "开封府",
      client_uri: "https://valerie9391120.github.io/kaifengfu/",
      redirect_uris: [`${SUPABASE_URL}/functions/v1/draw`],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    null,
    2
  ) + "\n"
);
fs.copyFileSync("static/oauth/done.html", `${OUT}/oauth/done.html`);

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
console.log(`  ${pindouName}  ${size(`${OUT}/assets/${pindouName}`)}`);
console.log(`  ${s2tName}  ${size(`${OUT}/assets/${s2tName}`)}`);
console.log(`  ${tyName}  ${size(`${OUT}/assets/${tyName}`)}（同页，${ty.scripts} 段脚本记了指纹）`);
console.log(`  ${tyFonts.dir}/（同页的字：${tyFonts.fonts} 块，连样式表、授权一共 ${(tyFonts.bytes / 1048576).toFixed(1)} MB）`);
console.log(`  ${jinhuiCssName} + ${jinhuiDir}/（${jinhui.slices.length} 块，${(jinhuiBufs.reduce((n, b) => n + b.length, 0) / 1024).toFixed(0)} KB）`);
console.log(`  ${deskName} + desk/（狐宇宙：${Object.keys(deskFiles).length} 样）、${wkCssName} + ${wkDir}/（${wkFaces.length} 块）、${wkHostName}、龙藏体用 ${tyFonts.dir}/${lcCss}`);
console.log(`  连接：${SUPABASE_URL}`);
