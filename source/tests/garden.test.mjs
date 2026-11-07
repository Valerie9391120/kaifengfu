// 园子那三页（推近花盆，卡片上那三颗：看看园子、群芳谱、成就；见 src/garden/view.js）：照园艺引擎真跑出来的存档写，只看不改。
// 存档、日子都是编的；字照引擎里现成的那一份（vendor/garden）。
import { lookView, bookView, gardenAchievementsView, cnDay, stageOf } from "../src/garden/view.js";
import { GardenEngine } from "../vendor/garden/garden-engine.ts";
import { PLANTS, PLANT_ORDER } from "../vendor/garden/garden-data.ts";
import { ACHIEVEMENTS } from "../vendor/garden/achievements.ts";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 十一月一日起第 n 天（过了三十号接着往十二月数）
const day = (n) => new Date(Date.UTC(2026, 10, n)).toISOString().slice(0, 10);
const mem = () => {
  let st = null;
  return { st: () => st, store: { load: async () => (st ? JSON.parse(JSON.stringify(st)) : null), update: async (fn) => { const [n, r] = await fn(st ? JSON.parse(JSON.stringify(st)) : null); st = n; return r; } } };
};
const run = (g, n, cmd, rng = () => 0.5) => new GardenEngine(g.store, { today: () => day(n) }, rng).execute(cmd);
const row = (v, label) => (v.rows.find((r) => r.label === label) || {}).text;

ok(cnDay("2026-10-28") === "十月二十八日" && cnDay("2026-11-01") === "十一月一日" && cnDay("") === "", "日子写成汉字");
ok(stageOf(0) === "萌动" && stageOf(10) === "萌动" && stageOf(11) === "抽枝展叶" && stageOf(21) === "孕蕾", "到哪一步：同引擎");

// ---------- 还没进过园子 ----------
ok(eq(lookView(null, day(1)), { kind: "never" }) && lookView({ initialized: false }, day(1)).kind === "never", "看看园子：还没进过园子");
let b = bookView(null);
ok(b.total === 12 && b.got === 0 && b.head === "一种都还没收，一共十二种。" && b.list.every((f) => !f.on), `群芳谱：十二种全列，都灰着（${b.head}）`);
ok(eq(b.list.map((f) => f.id), PLANT_ORDER) && b.list[0].no === "一" && b.list[11].no === "十二", "群芳谱：照引擎里的次序，一到十二");
ok(b.list.every((f) => f.name === PLANTS[f.id].displayName && f.text === PLANTS[f.id].collectionText && f.text), "群芳谱：名字、配的那段字都写上（没收的也写，只是灰着）");
let a = gardenAchievementsView(null);
ok(a.total === 30 && a.total === ACHIEVEMENTS.length && a.lit === 0 && a.list.every((x) => !x.on && x.name && x.description), `成就：三十个全列，都没点亮（${a.total}）`);

// ---------- 照料了十二天（单日浇水、双日松土），第十二天赏了一回花 ----------
const g = mem();
for (let d = 1; d <= 12; d++) await run(g, d, { action: d % 2 ? "water" : "loosen" });
await run(g, 12, { action: "admire" });
let v = lookView(g.st(), day(12));
ok(v.kind === "garden" && v.plant.name === "牡丹 · 魏紫" && v.plant.text === "抽枝展叶，照料了十二天（满三十天开花）。今天松过土了。" && v.plant.since === "十一月一日种下。" && !v.plant.bloom,
  `看看园子：这一盆（卡片上原来那一句挪进来）、哪天种下（${v.plant.text}）`);
ok(eq(v.rows.map((r) => r.label), ["浇水", "松土", "修剪", "赏花", "连着", "谢过", "开过", "进园"]), "照料的账：浇水、松土、修剪、赏花、连着、谢过、开过、进园");
ok(row(v, "浇水") === "六回" && row(v, "松土") === "六回" && row(v, "修剪") === "还没有" && row(v, "赏花") === "一回", `照料的账：各几回（${v.rows.map((r) => r.text).join("／")}）`);
ok(row(v, "连着") === "眼下连着照料了十二天，最长连着十二天" && row(v, "谢过") === "没谢过" && row(v, "开过") === "还没开过" && row(v, "进园") === "十一月一日头一回进园子", "照料的账：连着几天、谢过、开过、头一回进园子");
v = lookView(g.st(), day(13));
ok(v.plant.text.endsWith("今天还没照料。") && row(v, "连着") === "眼下连着照料了十二天，最长连着十二天", "第二天还没照料：写还没照料（不照存档里昨天那一笔）；昨天照料过的，连着照算");
v = lookView(g.st(), day(15));
ok(row(v, "连着") === "眼下没连着，最长连着十二天", "隔了两天没照料：眼下没连着（存档里那个数要等下一回照料才变）");
b = bookView(g.st());
ok(!b.list[0].on && b.list[0].meta === "在种，照料了十二天" && b.list.slice(1).every((f) => !f.meta), `群芳谱：魏紫在种，还灰着（${b.list[0].meta}）`);
a = gardenAchievementsView(g.st());
ok(a.list.find((x) => x.id === "first_admire").on && a.lit === g.st().unlockedAchievements.length && eq(a.list.map((x) => x.id), ACHIEVEMENTS.map((x) => x.id)), `成就：赏了一回花点亮《怜花惜弱》；次序同引擎（点亮了 ${a.lit} 个）`);

// ---------- 照料满三十天：开了 ----------
for (let d = 13; d <= 30; d++) await run(g, d, { action: "water" });
v = lookView(g.st(), day(30));
ok(v.plant.name === "牡丹 · 魏紫" && v.plant.text === "魏紫开了。" && v.plant.bloom === PLANTS.peony_weizi.bloomText && v.plant.since === "十一月三十日开的。", `开了：写开了，带上开花那段字、哪天开的（${v.plant.text}）`);
ok(row(v, "开过") === "一种，收在《群芳谱》里" && row(v, "浇水") === "二十四回" && row(v, "连着") === "眼下连着照料了三十天，最长连着三十天", "照料的账：开过一种、浇水二十四回、连着三十天");
b = bookView(g.st());
ok(b.got === 1 && b.head === "收了一种，一共十二种。" && b.list[0].on && b.list[0].meta === "十一月三十日开的" && b.list.slice(1).every((f) => !f.on), `群芳谱：魏紫亮了，写哪天开的；别的还灰着（${b.head}）`);
a = gardenAchievementsView(g.st());
ok(a.list.find((x) => x.id === "garden_first_bloom").on && a.list.find((x) => x.id === "streak_7").on && !a.list.find((x) => x.id === "burial_song").on, `成就：《庭芳初发》《朝朝相见》亮了，《葬花吟》还灰着（点亮了 ${a.lit} 个）`);

// ---------- 换种白梅：刚种下；头一回照料就谢了 ----------
await run(g, 31, { action: "plant", plantId: "white_plum" });
v = lookView(g.st(), day(31));
ok(v.plant.name === "白梅" && v.plant.text === "萌动，刚种下（满三十天开花）。今天还没照料。" && v.plant.since === "十二月一日种下。", `换种白梅：刚种下（${v.plant.text}）`);
await run(g, 32, { action: "water" }, () => 0);
v = lookView(g.st(), day(32));
ok(v.plant === null && v.empty === "眼下没在种。" && row(v, "谢过") === "一株", `白梅谢了：眼下没在种，谢过一株（${v.empty}）`);
b = bookView(g.st());
const plum = b.list.find((f) => f.id === "white_plum");
ok(!plum.on && plum.meta === "谢过一回" && b.list[0].on, `群芳谱：白梅还灰着，写谢过一回；魏紫照旧亮着（${plum.meta}）`);
ok(gardenAchievementsView(g.st()).list.find((x) => x.id === "burial_song").on, "成就：《葬花吟》亮了");

// 头一株就谢了、一种都没开过：庭中暂时空着
const g2 = mem();
await run(g2, 1, { action: "water" }, () => 0);
v = lookView(g2.st(), day(1));
ok(v.plant === null && v.empty === "庭中暂时空着。" && row(v, "开过") === "还没开过", `头一株就谢了：庭中暂时空着（${v.empty}）`);

console.log(`\n通过 ${pass}  失败 ${failN}`);
if (failN) process.exit(1);
