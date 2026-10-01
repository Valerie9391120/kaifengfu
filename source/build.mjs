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
fs.mkdirSync(`${OUT}/icons`, { recursive: true });

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

for (const f of ["splash.webp", "kite.webp", "wall.webp"]) fs.copyFileSync(`static/${f}`, `${OUT}/assets/${f}`);
for (const f of fs.readdirSync("static/icons")) fs.copyFileSync(`static/icons/${f}`, `${OUT}/icons/${f}`);

fs.writeFileSync(
  `${OUT}/manifest.webmanifest`,
  JSON.stringify(
    {
      name: "开封府",
      short_name: "开封府",
      lang: "zh-CN",
      start_url: "./",
      scope: "./",
      display: "standalone",
      background_color: "#D6DCCD",
      theme_color: "#D6DCCD",
      icons: [
        { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "./icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2
  )
);

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

fs.writeFileSync(
  `${OUT}/index.html`,
  `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="theme-color" content="#D6DCCD">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="开封府">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>开封府</title>
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png">
<link rel="preload" as="image" href="./assets/splash.webp">
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
fs.writeFileSync(`${OUT}/.nojekyll`, "");
fs.writeFileSync(`${OUT}/robots.txt`, "User-agent: *\nDisallow: /\n");

const size = (p) => (fs.statSync(p).size / 1024).toFixed(0) + " KB";
console.log(`打包完成 → ${OUT}/`);
console.log(`  ${jsName}  ${size(`${OUT}/assets/${jsName}`)}`);
console.log(`  ${cssName}  ${size(`${OUT}/assets/${cssName}`)}`);
console.log(`  连接：${SUPABASE_URL}`);
