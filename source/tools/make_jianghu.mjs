// 江湖棋局搬进开封府：node tools/make_jianghu.mjs <江湖棋局仓库在这台电脑上的目录>
//
// 江湖棋局是卿卿和恩师 10 月 5 日到 7 日做的双人武侠桌游（仓库 veden001/jianghu-rp-mcp：文本、玩法她写的，引擎恩师写的）。
// 原来是在聊天里由那边的我直接调引擎的函数来下；开封府里由开封府在手机上替他调（见 src/game/jianghu.js、开发说明“江湖棋局”那一节）。
//
// 这个脚本把她仓库里的引擎和章节原样拷到 vendor/jianghu/，只动离不开电脑的三处，别的一个字不动：
//   1. game.ts 头上那一行 import { randomInt, randomUUID } from 'node:crypto' 换成 './rng.js'（手机自带的随机数）
//   2. content.ts 换成开封府写的：章节、身份、道具直接打进包里，不读文件（读出来的东西和她的一样，每回给一份新的）
//   3. store.ts 换成开封府写的：存档不写文件，放在“眼下这一局”那一格里，开封府每回调引擎之前放进去、调完拿走
// 主持规矩（HOST_RULES）从她的 src/index.ts（或 src/server.ts）里原样取出来，放进 host_rules.js。
// 她那边改了引擎、加了章节：拿新的仓库重跑这个脚本；哪一处对不上会停下来说是哪一处。vendor/jianghu/ 别手改。
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("用法：node tools/make_jianghu.mjs <江湖棋局仓库的目录>");
  process.exit(1);
}
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(HERE, "..", "vendor", "jianghu");
const read = (p) => fs.readFileSync(path.join(src, p), "utf8");
const stop = (why) => {
  console.error("停下了：" + why);
  process.exit(1);
};

// ---- game.ts：只认这几行 import，多了少了都停下来看 ----
const game = read("src/engine/game.ts");
const imports = game.match(/^import[\s\S]*?;$/gm) || [];
const want = [
  "import { randomInt, randomUUID } from 'node:crypto';",
  "import { loadChapter, loadIdentities, loadItems } from './content.js';",
  "import { loadState, saveState } from './store.js';",
];
for (const w of want) if (!imports.includes(w)) stop(`game.ts 里没有这一行：${w}`);
const others = imports.filter((l) => !want.includes(l));
if (others.some((l) => !/from '\.\/types\.js';$/.test(l))) stop(`game.ts 多了没见过的 import：\n${others.join("\n")}`);
const gameOut = game.replace(want[0], "import { randomInt, randomUUID } from './rng.js';");

// ---- 章节：照她 content.ts 里那张表（CHAPTER_CONTENT）的次序 ----
const content = read("src/engine/content.ts");
const table = /const CHAPTER_CONTENT[^=]*=\s*\{([\s\S]*?)\n\};/.exec(content);
if (!table) stop("content.ts 里没找到 CHAPTER_CONTENT 那张表");
const chapters = [];
for (const m of table[1].matchAll(/(\w+):\s*\{\s*map:\s*'\.\.\/\.\.\/(chapters\/[^']+\/map\.json)',\s*(?:items:\s*'\.\.\/\.\.\/(chapters\/[^']+\/items\.json)',?\s*)?\}/g)) {
  chapters.push({ id: m[1], map: m[2], items: m[3] || "" });
}
if (!chapters.length) stop("CHAPTER_CONTENT 那张表一章都没认出来");
if (!/new URL\('\.\.\/\.\.\/content\/identities\.json'/.test(content) || !/new URL\(\s*'\.\.\/\.\.\/content\/common-items\.json'/.test(content)) stop("content.ts 读身份、通用道具的地方变了");
if (!/Duplicate item id across content files/.test(content)) stop("content.ts 查重的那一段变了");

// ---- 主持规矩 ----
let rulesFrom = "";
let rules = "";
for (const f of ["src/server.ts", "src/index.ts"]) {
  if (!fs.existsSync(path.join(src, f))) continue;
  const m = /(?:export )?const HOST_RULES = `([\s\S]*?)`;/.exec(read(f));
  if (m) {
    rules = m[1];
    rulesFrom = f;
    break;
  }
}
if (!rules) stop("src/server.ts、src/index.ts 里都没找到 HOST_RULES");
if (rules.includes("${") || rules.includes("\\")) stop("HOST_RULES 里有 ${ 或者反斜杠，原样搬不了，得看一眼");

// ---- 从哪一版来的 ----
let ver = "（不是 git 仓库，认不出是哪一版）";
try {
  ver = execSync(`git -C "${src}" log -1 --format="%H（%ci）%n  %s"`, { encoding: "utf8" }).trim();
} catch (e) {}
const engVer = (/const GAME_VERSION = '([^']+)'/.exec(game) || [])[1] || "?";

// ---- 写出来 ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "engine"), { recursive: true });
const put = (p, text) => {
  fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true });
  fs.writeFileSync(path.join(OUT, p), text);
};
const copy = (p) => put(p, read(p));

put("engine/game.ts", gameOut);
put("engine/types.ts", read("src/engine/types.ts"));
copy("content/identities.json");
copy("content/common-items.json");
for (const c of chapters) {
  copy(c.map);
  if (c.items) copy(c.items);
}

const GEN = "// 开封府写的（tools/make_jianghu.mjs 生成，别手改）。";
put(
  "engine/rng.ts",
  `${GEN}
// 她的引擎原来用 node:crypto 的 randomInt、randomUUID；手机上换成浏览器自带的那一套，一样是真随机。
// 开封府调引擎的时候，骰子的随机数、一局的编号都自己给（照他调的那一样的编号定，见 src/game/jianghu.js 的 seededRng），
// 这两个只是没给的时候的后备。
export function randomInt(min: number, maxExclusive: number): number {
  const span = maxExclusive - min;
  if (!(span > 0) || span > 0x100000000) throw new Error('randomInt: bad range');
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / span) * span;
  let x = 0;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return min + (x % span);
}

// 老一点的 iPhone（iOS 15.4 以前）没有 crypto.randomUUID：拿 getRandomValues 拼一个
export function randomUUID(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return \`\${h.slice(0, 8)}-\${h.slice(8, 12)}-\${h.slice(12, 16)}-\${h.slice(16, 20)}-\${h.slice(20)}\`;
}
`
);

const imp = [];
const mapIds = [];
const itemIds = [];
chapters.forEach((c, i) => {
  imp.push(`import map${i} from '../${c.map}';`);
  mapIds.push(`  ${c.id}: map${i},`);
  if (c.items) {
    imp.push(`import items${i} from '../${c.items}';`);
    itemIds.push(`items${i}`);
  }
});
put(
  "engine/content.ts",
  `${GEN}
// 她原来的 content.ts 每回从文件里读一份新的；这里章节、身份、道具打进包里，每回照样给一份新的（引擎拿去随便改，不碍下一回）。
import type { ChapterDefinition, Identity, ItemDefinition } from './types.js';
import identities from '../content/identities.json';
import commonItems from '../content/common-items.json';
${imp.join("\n")}

const fresh = <T>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;

const CHAPTERS: Record<string, unknown> = {
${mapIds.join("\n")}
};

export async function loadIdentities(): Promise<Identity[]> {
  return fresh<Identity[]>(identities);
}

export async function loadItems(): Promise<ItemDefinition[]> {
  const allItems = fresh<ItemDefinition[]>([...(commonItems as unknown[]), ${itemIds.map((x) => `...(${x} as unknown[])`).join(", ")}]);
  const seen = new Set<string>();
  for (const item of allItems) {
    if (seen.has(item.id)) throw new Error(\`Duplicate item id across content files: \${item.id}\`);
    seen.add(item.id);
  }
  return allItems;
}

export async function loadChapter(id: string): Promise<ChapterDefinition> {
  const map = CHAPTERS[id];
  if (!map) throw new Error(\`Unknown chapter: \${id}\`);
  return fresh<ChapterDefinition>(map);
}
`
);

put(
  "engine/store.ts",
  `${GEN}
// 她原来的 store.ts 把存档写成文件（.data/<编号>.json）。开封府里一段对话就是一局，存档跟着他的回话走（见 src/game/jianghu.js）：
// 调引擎之前把那一局放进这一格（putState），调完拿走（takeState）。引擎照旧按编号读写，编号对不上就当没有这一局。
import type { GameState } from './types.js';

let slot: string | null = null;

export function putState(state: GameState | null): void {
  slot = state ? JSON.stringify(state) : null;
}

export function takeState(): GameState | null {
  return slot ? (JSON.parse(slot) as GameState) : null;
}

export async function saveState(state: GameState): Promise<void> {
  slot = JSON.stringify(state);
}

export async function loadState(sessionId: string): Promise<GameState> {
  const state = slot ? (JSON.parse(slot) as GameState) : null;
  if (!state || state.sessionId !== sessionId) throw new Error(\`Game session not found: \${sessionId}\`);
  return state;
}
`
);

put("host_rules.js", `${GEN}\n// 主持规矩：从她的 ${rulesFrom} 里原样取出来的（她的 MCP 那一版 game_help 回的就是这一段）。\nexport const HOST_RULES = ${JSON.stringify(rules)};\n`);

put(
  "SOURCE.md",
  `# 江湖棋局（vendor）

卿卿和恩师做的双人武侠桌游，原仓库 \`veden001/jianghu-rp-mcp\`。文本、玩法是她写的，引擎是恩师写的；仓库写着保留所有权利，是她自己的东西，放进开封府是她定的。

**这个目录是 \`tools/make_jianghu.mjs\` 生成的，别手改。** 她那边改了：拿新的仓库重跑那个脚本。

- 从哪一版来：${ver}
- 引擎自己写的版本号（GAME_VERSION）：${engVer}
- 章节：${chapters.map((c) => c.id).join("、")}
- 主持规矩：从 \`${rulesFrom}\` 取的 HOST_RULES

## 原样拷来的

- \`engine/game.ts\`：只换了头上一行，\`node:crypto\` 换成 \`./rng.js\`
- \`engine/types.ts\`
- \`content/\`、\`chapters/\` 里的 JSON

## 开封府写的

- \`engine/rng.ts\`：随机数用手机自带的（\`crypto.getRandomValues\`、\`crypto.randomUUID\`，没有 randomUUID 的老手机拿 getRandomValues 拼）。开封府调引擎时骰子、编号都自己给，这只是后备
- \`engine/content.ts\`：章节、身份、道具打进包里，不读文件
- \`engine/store.ts\`：存档放在“眼下这一局”那一格里（\`putState\`、\`takeState\`），不写文件
- \`host_rules.js\`：主持规矩
`
);

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`江湖棋局搬好了 → vendor/jianghu/（${(size(OUT) / 1024).toFixed(0)} KB）`);
console.log(`  来源：${ver.split("\n")[0]}`);
console.log(`  章节：${chapters.map((c) => c.id).join("、")}；主持规矩 ${rules.length} 字（${rulesFrom}）`);
