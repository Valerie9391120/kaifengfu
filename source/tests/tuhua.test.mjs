// 图画院：零件（src/tuhua.js）。
// node tests/tuhua.test.mjs
import { loadBundle } from "./push-harness.mjs";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log("ok:", msg);
  } else {
    failed++;
    console.log("FAIL:", msg);
    if (process.env.KFS_FAILFAST) process.exit(1);
  }
}
const J = (x) => JSON.stringify(x);

const th = await loadBundle("src/tuhua.js");
const { TH_KEY, TH_IMG, SAY_MAX, packEntry, packGone, readEntry, listEntries, sayOf, drawsOf, toCollect, thSub, dateOf, byMonth } = th;
const THUMB = "data:image/jpeg;base64,thumb";
const T0 = Date.UTC(2026, 9, 30, 21, 40);

// ================= 一张怎么存、怎么读 =================
{
  ok(TH_KEY === "kfs2:thy:" && TH_IMG === "kfs2:thya:" && TH_KEY.startsWith("kfs2:") && TH_IMG.startsWith("kfs2:"), "存在 kfs2: 底下：加密了跟着云端走");
  const raw = packEntry({ chat: "c1", at: T0, say: "给你画了一张", ratio: "竖", thumb: THUMB, saved: T0 + 5000, extra: "不存" });
  const e = readEntry("m1.1", raw);
  ok(J(e) === J({ id: "m1.1", chat: "c1", at: T0, say: "给你画了一张", ratio: "竖", thumb: THUMB, saved: T0 + 5000 }), "存进去读出来一样；多出来的字段不存");
  ok(readEntry("x", packEntry({ thumb: "", at: 1 })) === null && readEntry("x", "{坏的") === null && readEntry("x", JSON.stringify({ v: 2, thumb: THUMB })) === null, "没有小图的、坏的、认不得的版本：不当一张摆");
  ok(readEntry("x", packEntry({ thumb: THUMB, ratio: "斜", say: "长".repeat(SAY_MAX + 50) })).ratio === "" && readEntry("x", packEntry({ thumb: THUMB, say: "长".repeat(SAY_MAX + 50) })).say.length === SAY_MAX, "横竖认不得的不写；那句话太长截短");
  ok(J(readEntry("m2.0", packGone(T0))) === J({ id: "m2.0", gone: true }), "删了的那一张：认得出是删了的");
}

// ================= 怎么排 =================
{
  const pairs = [
    [TH_KEY + "a.0", packEntry({ at: T0 - 3000, thumb: THUMB, saved: 1 })],
    [TH_KEY + "b.0", packEntry({ at: T0, thumb: THUMB, saved: 2 })],
    [TH_KEY + "c.0", packGone(T0)],
    [TH_KEY + "d.0", packEntry({ at: T0, thumb: THUMB, saved: 3 })],
    [TH_KEY + "e.0", null],
    ["kfs2:cyx:f", packEntry({ at: T0, thumb: THUMB })],
    [TH_KEY + "g.0", "坏的"],
  ];
  ok(J(listEntries(pairs).map((e) => e.id)) === J(["d.0", "b.0", "a.0"]), "新的在上面（照他画的时候；同一刻的照收进来的先后）；删了的、删掉的钥匙、别处的、坏的不摆");
  ok(thSub(0) === "还空着" && thSub(3) === "收了 3 张", "南衙那一行的小字");
}

// ================= 他画的时候说的那句话 =================
{
  const m = { id: "m1", role: "him", ts: T0, items: [{ type: "text", text: "**好呀**，给你画一张" }, { type: "draw", prompt: "一只狐狸", ratio: "竖" }, { type: "text", text: "画好了你看看" }] };
  ok(sayOf(m, 1) === "好呀，给你画一张", "画前面挨着的那一句（加粗的记号摘掉）");
  const m2 = { id: "m2", role: "him", items: [{ type: "draw", prompt: "灯" }, { type: "text", text: "*放下笔* 画好啦" }] };
  ok(sayOf(m2, 0) === "放下笔 画好啦", "前面没有字：后面挨着的那一句（动作的星号摘掉，字留着）");
  const m3 = { id: "m3", role: "him", items: [{ type: "text", text: "两张" }, { type: "draw", prompt: "一" }, { type: "draw", prompt: "二" }] };
  ok(sayOf(m3, 1) === "两张" && sayOf(m3, 2) === "", "一条里两张画：那一句是前面那一张的，后面那一张不重复写");
  const m4 = { id: "m4", role: "him", items: [{ type: "meme", file: "x.png" }, { type: "draw", prompt: "一" }] };
  ok(sayOf(m4, 1) === "" && sayOf({}, 0) === "", "前后都没有字：空着");
  ok(sayOf({ items: [{ type: "text", text: "长".repeat(SAY_MAX + 10) }, { type: "draw", prompt: "一" }] }, 1).length === SAY_MAX, "太长的截短");
}

// ================= 一段对话里画过的、还没收的 =================
{
  const her = { id: "h1", role: "her", text: "画一张" };
  const old = { id: "m0", role: "him", ts: T0 - 1000, items: [{ type: "draw", prompt: "旧的" }] };
  const now = { id: "m1", role: "him", ts: T0, items: [{ type: "text", text: "给你" }, { type: "draw", prompt: "新的", ratio: "横" }], alts: [] };
  const msgs = [her, { ...now, alts: [{ node: old, after: [{ id: "m5", role: "him", items: [{ type: "draw", prompt: "翻过去以后的" }] }] }, { node: now, after: [] }] }];
  const got = drawsOf(msgs);
  ok(J(got.map((x) => [x.key, x.j, x.m.id])) === J([["m1.1", 1, "m1"], ["m0.0", 0, "m0"], ["m5.0", 0, "m5"]]), "摆着的这一支、翻过去的版本里的都算；同一张不算两回；知道是哪一条回话的第几样");
  const kv = new Set(["kfs2:img:draw.m1.1", "kfs2:img:draw.m0.0", TH_KEY + "m0.0"]);
  ok(J(toCollect(msgs, (k) => kv.has(k)).map((x) => x.key)) === J(["m1.1"]), "还没收的：画好了（有图）、图画院里还没有这一条的；收过的、删了的（也有这一条）不再收；没画好的不收");
  ok(toCollect([], () => true).length === 0 && toCollect(null, () => true).length === 0, "空的对话：没有要收的");
}

// ================= 日期、按月断开 =================
{
  ok(dateOf(T0, 2026) === "10月30日" && dateOf(Date.UTC(2025, 11, 3, 12), 2026) === "2025年12月3日", "每张底下的日期：今年的不写年，别的年份写上");
  const list = [{ id: "a", at: T0 }, { id: "b", at: T0 - 86400000 }, { id: "c", at: Date.UTC(2026, 8, 30, 12) }, { id: "d", at: Date.UTC(2025, 9, 1, 12) }];
  const g = byMonth(list, 2026);
  ok(J(g.map((x) => [x.label, x.items.map((e) => e.id)])) === J([["十月", ["a", "b"]], ["九月", ["c"]], ["2025 年 十月", ["d"]]]), "按月断开：今年的写“十月”，别的年份带上年");
}

console.log(`\n通过 ${passed}  失败 ${failed}`);
process.exit(failed ? 1 : 0);
