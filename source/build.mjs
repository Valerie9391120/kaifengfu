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

const IMAGES = ["splash.webp", "kite.webp", "wall.webp", "splash-dingxiang.webp", "dx-heart.webp", "dx-blush.webp", "wall-dingxiang.webp"];
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
  `connect-src 'self' ${SUPABASE_URL} https://raw.githubusercontent.com`,
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
console.log(`  连接：${SUPABASE_URL}`);
