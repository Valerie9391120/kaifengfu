// 搬家的检查：把 App.jsx 里的东西原样搬到别的文件以后，五道一起验。
// 在 source/ 里跑：
//   node tools/check_move.mjs baseline   搬之前跑一次，把现在的包记下来（.cache/move-baseline.js）
//   node tools/check_move.mjs            每搬一块跑一次
//
// 五道各拦一种错：
//   1 打得出包      门牌号写错（import 的路径不对、要的名字那边没 export）
//   2 没有漏引      用了某个名字、新家忘了引进来。打包器不管这个，包照打，点到那儿才白屏
//   3 没改没丢      和搬之前的包一行一行对：原来的每一行都得还在
//   4 没有绕圈      甲引乙、乙又引甲。打包器也不管，可顶层的常量会在还没备好的时候被用到
//   5 注释没丢      包里不带注释，第 3 道看不见它们；这个仓库的“为什么”都写在注释里，剪的时候落下一段就找不回来了
//
// 第 3 道认不出第 2 种错（漏引的那个名字，打包器会给自家同名的改个编号让开，抹掉编号以后两边看着一样），
// 所以五道都要过，不能只看一道。
//
// 第 2 道要三个包，不进 package.json，用之前装一下：
//   npm install --no-save eslint@9 eslint-plugin-react globals
import { build, formatMessages } from "esbuild";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";

const BASE = ".cache/move-baseline.js";
const BASE_NOTES = ".cache/move-baseline-notes.json";
const LINT_PKGS = ["eslint", "eslint-plugin-react", "globals"];

// 和 build.mjs 一样的打法，只是不压缩（压缩了就没法一行一行对）
async function bundle() {
  return build({
    entryPoints: ["src/main.jsx"],
    bundle: true,
    minify: false,
    format: "esm",
    target: ["es2020", "safari14"],
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    write: false,
    metafile: true,
    legalComments: "none",
    logLevel: "silent",
  });
}

// ---------- 第 3 道：和搬之前的包对 ----------
const MARK = /^\/\/ (src|static|node_modules)\//; // 打包器标的“下面这段是哪个文件的”
const JSX_RT = /^var import_jsx_runtime = __toESM\(require_jsx_runtime\(\)(, 1)?\);$/; // 每个带尖括号的新文件各多这一句
const strip = (l) => l.replace(/\b([A-Za-z_$]+?)\d+\b/g, "$1"); // 抹掉打包器给重名变量加的编号（Fragment4 → Fragment）
const linesOf = (t) => t.split("\n").filter((l) => l.trim() !== "" && !MARK.test(l));

function bag(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return m;
}
// a 里有、b 里没有的（算个数：a 里三行一样的、b 里只有两行，差一行）
function minus(a, b) {
  const left = bag(b);
  const out = [];
  for (const x of a) {
    const n = left.get(x) || 0;
    if (n > 0) left.set(x, n - 1);
    else out.push(x);
  }
  return out;
}

function compare(before, after) {
  const a = linesOf(before);
  const b = linesOf(after);
  const onlyA = minus(a, b); // 一个字不差地对，搬之前独有的
  const onlyB = minus(b, a);
  const sa = onlyA.map(strip);
  const sb = onlyB.map(strip);
  const lost = minus(sa, sb); // 抹掉编号还是对不上的：真丢了、真改了
  const added = minus(sb, sa).filter((l) => !JSX_RT.test(l.trim()));
  // 哪些名字被打包器换了编号：带编号的名字只在一边出现的（两边都有的，是它本来就带着数字）
  const ids = (list) => new Set(list.flatMap((l) => l.match(/\b[A-Za-z_$]+?\d+\b/g) || []));
  const idsB = ids(onlyB);
  const renamed = new Set([...ids(onlyA)].filter((x) => !idsB.has(x)).map(strip));
  return { total: a.length, strict: onlyA.length, lost, added, renamed: [...renamed] };
}

// ---------- 第 4 道：有没有绕圈 ----------
function findCycle(metafile) {
  const graph = new Map();
  for (const [file, info] of Object.entries(metafile.inputs)) {
    if (!file.startsWith("src/")) continue;
    graph.set(file, info.imports.map((i) => i.path).filter((p) => p.startsWith("src/")));
  }
  const state = new Map(); // 1 正在走，2 走完了
  const path = [];
  const visit = (f) => {
    if (state.get(f) === 2) return null;
    if (state.get(f) === 1) return [...path.slice(path.indexOf(f)), f];
    state.set(f, 1);
    path.push(f);
    for (const g of graph.get(f) || []) {
      const c = visit(g);
      if (c) return c;
    }
    path.pop();
    state.set(f, 2);
    return null;
  };
  for (const f of graph.keys()) {
    const c = visit(f);
    if (c) return c;
  }
  return null;
}

// ---------- 第 5 道：注释没丢 ----------
// src 里每一行带注释的（整行是注释的、代码后面跟着注释的都算），搬完以后都得原样还在，在哪个文件里不管。
// 行首新加的 export 不算改（搬过去的东西要让别的文件引得到，只许多这一个词）
function sourceFiles(dir = "src") {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
function noteLines() {
  const out = [];
  for (const f of sourceFiles())
    for (const raw of readFileSync(f, "utf8").split("\n")) {
      const l = raw.trim().replace(/^export (default )?/, "");
      if (l.includes("//") || l.includes("/*") || l.startsWith("*")) out.push(l);
    }
  return out;
}

// ---------- 跑 ----------
const say = (ok, title, detail) => console.log(`${ok ? "✓" : "✗"} ${title}${detail ? "\n" + detail : ""}`);
const indent = (list, n = 8) => list.slice(0, n).map((l) => "    " + l.trim().slice(0, 140)).join("\n") + (list.length > n ? `\n    …还有 ${list.length - n} 行` : "");

const mode = process.argv[2];

if (mode === "baseline") {
  const r = await bundle();
  mkdirSync(".cache", { recursive: true });
  writeFileSync(BASE, r.outputFiles[0].text);
  writeFileSync(BASE_NOTES, JSON.stringify(noteLines()));
  const n = readFileSync("src/App.jsx", "utf8").trimEnd().split("\n").length;
  console.log(`记下了：${BASE}（App.jsx 现在 ${n} 行）。搬吧，每搬一块跑一次 node tools/check_move.mjs`);
  process.exit(0);
}

let bad = 0;

// 1 打得出包
let result = null;
try {
  result = await bundle();
  say(true, "1 打得出包");
} catch (e) {
  bad++;
  const msgs = e.errors ? await formatMessages(e.errors, { kind: "error", color: false }) : [String(e)];
  say(false, "1 打不出包（门牌号写错了）", msgs.join("\n"));
}

// 2 没有漏引
if (!LINT_PKGS.every((p) => existsSync(`node_modules/${p}`))) {
  bad++;
  say(false, "2 没查成：检查用的包没装", "    npm install --no-save eslint@9 eslint-plugin-react globals");
} else {
  const r = spawnSync("npx", ["eslint", "--no-config-lookup", "-c", "tools/eslint.move.mjs", "src/**/*.js", "src/**/*.jsx"], { encoding: "utf8" });
  if (r.status === 0) say(true, "2 没有漏引");
  else {
    bad++;
    say(false, r.status === 1 ? "2 有名字用了没引" : "2 没查成（eslint 自己出了岔子）", (r.stdout + r.stderr).trim().split("\n").slice(0, 40).join("\n"));
  }
}

// 3 没改没丢
if (!result) {
  bad++;
  say(false, "3 没对成：包没打出来");
} else if (!existsSync(BASE)) {
  bad++;
  say(false, "3 没对成：没有搬之前的包", "    先在没动过的代码上跑 node tools/check_move.mjs baseline");
} else {
  const c = compare(readFileSync(BASE, "utf8"), result.outputFiles[0].text);
  const ok = c.lost.length === 0 && c.added.length === 0;
  if (!ok) bad++;
  const notes = [`    一共 ${c.total} 行；一个字不差地对，有 ${c.strict} 行对不上，抹掉打包器的编号以后剩 ${c.lost.length} 行`];
  if (c.renamed.length) notes.push(`    被重新编号的名字（${c.renamed.length} 个）：${c.renamed.slice(0, 10).join("、")}${c.renamed.length > 10 ? " …" : ""}`);
  if (c.lost.length) notes.push("    搬之前有、现在没有的：\n" + indent(c.lost));
  if (c.added.length) notes.push("    现在多出来的：\n" + indent(c.added));
  say(ok, ok ? "3 没改没丢" : "3 和搬之前的包对不上", notes.join("\n"));
}

// 4 没有绕圈
if (!result) {
  bad++;
  say(false, "4 没查成：包没打出来");
} else {
  const cyc = findCycle(result.metafile);
  if (cyc) bad++;
  say(!cyc, cyc ? "4 绕圈了" : "4 没有绕圈", cyc ? "    " + cyc.join(" → ") : "");
}

// 5 注释没丢
if (!existsSync(BASE_NOTES)) {
  bad++;
  say(false, "5 没对成：没有搬之前记下的注释", "    先在没动过的代码上跑 node tools/check_move.mjs baseline");
} else {
  const before = JSON.parse(readFileSync(BASE_NOTES, "utf8"));
  const gone = minus(before, noteLines());
  if (gone.length) bad++;
  say(!gone.length, gone.length ? `5 注释少了 ${gone.length} 行` : "5 注释没丢", gone.length ? indent(gone) : `    搬之前带注释的 ${before.length} 行都还在`);
}

const n = readFileSync("src/App.jsx", "utf8").trimEnd().split("\n").length;
console.log(`\nApp.jsx 现在 ${n} 行。${bad ? `有 ${bad} 道没过，别往下搬。` : "五道都过了。"}`);
process.exit(bad ? 1 : 0);
