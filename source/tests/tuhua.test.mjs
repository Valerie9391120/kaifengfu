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
const { TH_KEY, TH_IMG, TITLE_MAX, packEntry, packGone, readEntry, listEntries, cleanTitle, drawsOf, toCollect, thSub, dateOf, byMonth } = th;
const { MOUNTS, mountOf, vaseOf, sceneOf, scrollParts, pageLayout, VASE_TOPS, VASE_RIGHTS, ART_W, TABLE_H } = th;
const THUMB = "data:image/jpeg;base64,thumb";
const T0 = Date.UTC(2026, 9, 30, 21, 40);

// ================= 一张怎么存、怎么读 =================
{
  ok(TH_KEY === "kfs2:thy:" && TH_IMG === "kfs2:thya:" && TH_KEY.startsWith("kfs2:") && TH_IMG.startsWith("kfs2:"), "存在 kfs2: 底下：加密了跟着云端走");
  const raw = packEntry({ chat: "c1", at: T0, title: "月下读书", ratio: "竖", thumb: THUMB, saved: T0 + 5000, extra: "不存" });
  const e = readEntry("m1.1", raw);
  ok(J(e) === J({ id: "m1.1", chat: "c1", at: T0, title: "月下读书", ratio: "竖", thumb: THUMB, saved: T0 + 5000 }), "存进去读出来一样；多出来的字段不存");
  ok(readEntry("x", packEntry({ thumb: "", at: 1 })) === null && readEntry("x", "{坏的") === null && readEntry("x", JSON.stringify({ v: 2, thumb: THUMB })) === null, "没有小图的、坏的、认不得的版本：不当一张摆");
  ok(readEntry("x", packEntry({ thumb: THUMB, ratio: "斜", title: "长".repeat(TITLE_MAX + 50) })).ratio === "" && readEntry("x", packEntry({ thumb: THUMB, title: "长".repeat(TITLE_MAX + 50) })).title.length === TITLE_MAX, "横竖认不得的不写；名字太长截短");
  const old = readEntry("y", JSON.stringify({ v: 1, chat: "c1", at: T0, say: "给你画了一张", thumb: THUMB, saved: 1 }));
  ok(old && old.title === "" && !("say" in old), "10 月 31 日以前收的（没有名字、有一句话的）：照样摆，名字空着，那句话不摆");
  ok(cleanTitle(" 《月下读书》 ") === "月下读书" && cleanTitle("两\n行") === "两 行" && cleanTitle(null) === "" && cleanTitle("《》") === "", "名字：两头的空白、书名号去掉，换行换成空格");
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

// ================= 一段对话里画过的、还没收的 =================
{
  const her = { id: "h1", role: "her", text: "画一张" };
  const old = { id: "m0", role: "him", ts: T0 - 1000, items: [{ type: "draw", prompt: "旧的" }] };
  const now = { id: "m1", role: "him", ts: T0, items: [{ type: "text", text: "给你" }, { type: "draw", prompt: "新的", ratio: "横", title: "雪夜" }], alts: [] };
  const msgs = [her, { ...now, alts: [{ node: old, after: [{ id: "m5", role: "him", items: [{ type: "draw", prompt: "翻过去以后的" }] }] }, { node: now, after: [] }] }];
  const got = drawsOf(msgs);
  ok(J(got.map((x) => [x.key, x.j, x.m.id, x.title, x.ratio])) === J([["m1.1", 1, "m1", "雪夜", "横"], ["m0.0", 0, "m0", "", ""], ["m5.0", 0, "m5", "", ""]]), "摆着的这一支、翻过去的版本里的都算；同一张不算两回；知道是哪一条回话的第几样、名字、横竖");
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

// ================= 框景（11 月 1 日换的样子） =================
{
  // 当天那一瓶：一天换一瓶，十瓶轮着；同一天里不换（早上、半夜都是同一瓶）
  const d0 = new Date(2026, 10, 1, 0, 5), d1 = new Date(2026, 10, 1, 23, 55), d2 = new Date(2026, 10, 2, 9);
  const seen = new Set();
  for (let i = 0; i < 10; i++) seen.add(vaseOf(new Date(2026, 10, 1 + i, 12)));
  ok(vaseOf(d0) === vaseOf(d1) && vaseOf(d2) === (vaseOf(d0) + 1) % 10 && seen.size === 10 && VASE_TOPS.length === 10 && VASE_RIGHTS.length === 10,
     `当天那一瓶：同一天不换，第二天换下一瓶，十天十瓶各一回（${vaseOf(d0)} → ${vaseOf(d2)}）`);
  // 裱绫：同一张永远是同一个颜色；十几张里颜色不止一两样
  const ids = Array.from({ length: 40 }, (_, i) => `m${i}.${i % 3}`);
  const cols = new Set(ids.map((id) => mountOf(id)[0]));
  ok(MOUNTS.length >= 12 && MOUNTS.slice(0, 6).map((m) => m[0]).join("") === "月白浅青淡黄藕荷松花浅绛" && mountOf("m1.1") === mountOf("m1.1") && cols.size >= 8,
     `裱绫的颜色：月白那六样打头，又添了几样；同一张永远同一个颜色；四十张里有 ${cols.size} 样`);
  // 一幅轴：竖的最长、横的最短（都挂成竖轴）；各部分加起来就是总高
  const pv = scrollParts("竖", 150), pf = scrollParts("方", 150), ph = scrollParts("横", 150);
  ok(pv.h > pf.h && pf.h > ph.h && pv.ih > pv.iw && ph.ih < ph.iw && pf.ih === pf.iw && pv.di > pv.tian && pv.tian > 0.3 * pv.wi,
     `横竖方都挂成竖轴：竖的 ${pv.h}、方的 ${pf.h}、横的 ${ph.h}；天头地头照秘戏钱匣那样长，地头比天头还长一点`);
  ok(pv.h === pv.rodT + pv.face + pv.rodB + pv.string + pv.tagH && pv.face === pv.tian + 2 * pv.sep + pv.core + pv.di && pv.core === pv.ih + 2 * pv.m,
     "一幅轴各部分加起来就是总高（天杆、轴面、地杆、细绳、小签）");
  ok(scrollParts("", 150).ratio === "方" && scrollParts("竖", 150, 1).tagH < pv.tagH, "认不出横竖的当方的挂；没名字的小签矮一些（只写日期）");
  // 框景照屏宽缩放：长案贴底，瓶底站在案面上，挂落在右上角
  const sc = sceneOf(390, 844, 0);
  ok(Math.abs(sc.s - 390 / ART_W) < 1e-9 && Math.abs(sc.tableTop - (844 - TABLE_H * sc.s)) < 1e-9 && sc.vase.y + 1325 * sc.s / 2 > sc.tableTop && sc.flowersTop < sc.tableTop && sc.latticeW > 150,
     `框景照屏宽缩放：长案顶在 ${sc.tableTop.toFixed(0)}，瓶底站在案面上，花最高到 ${sc.flowersTop.toFixed(0)}`);
  // 一页两幅（照恩师那张画：左上一幅窄些短些，右下一幅宽些长些、顶低一截），新的在前，单下一张的那一页只挂左边
  const es = Array.from({ length: 5 }, (_, i) => ({ id: `k${i}`, ratio: ["竖", "横", "方"][i % 3], title: i % 2 ? "" : "名字", at: 1000 - i }));
  const L = pageLayout(es, 390, 844, { safeTop: 59, vase: 0 });
  const P0 = L.pages[0], P2 = L.pages[2];
  ok(L.pages.length === 3 && L.pages.map((p) => p.map((it) => it.e.id).join(",")).join(" | ") === "k0,k1 | k2,k3 | k4" && P2.length === 1 && P2[0].slot === 0,
     `一页两幅，新的在前；单下的那一张挂在左边（${L.pages.map((p) => p.map((it) => it.e.id).join(",")).join(" | ")}）`);
  const [l, r] = P0;
  ok(l.x + l.w < r.x && r.w > l.w && r.y > l.y && L.pages[1][0].x === l.x && L.pages[1][1].y === r.y,
     `左上一幅窄些（${l.w}）、右下一幅宽些（${r.w}），右边的顶低一截（${l.y} → ${r.y}）；每一页都挂在同样的两个地方`);
  ok(l.y - l.p.cord >= 59 + 12 && l.x + l.w / 2 > 50 + 30 && L.scale === 1, `左边那颗钉子在刘海底下（${l.y - l.p.cord}），在左上角返回那个箭头右边；iPhone 这么大的屏幕不用缩`);
  // 最长的（竖的、有名字的）也放得下：左边高过瓶花，右边高过长案
  const tall = pageLayout([{ id: "a", ratio: "竖", title: "名字" }, { id: "b", ratio: "竖", title: "名字" }], 390, 844, { safeTop: 59, vase: 2 });
  const sc2 = tall.scene, [tl, tr] = tall.pages[0];
  ok(tl.y + tl.p.h <= sc2.flowersTop - 8 + 0.5 && tr.y + tr.p.h <= sc2.tableTop - 10 + 0.5, `两幅都是竖的也放得下：左边高过最高的那瓶花，右边高过长案（${tl.y + tl.p.h} ≤ ${Math.round(sc2.flowersTop - 8)}，${tr.y + tr.p.h} ≤ ${Math.round(sc2.tableTop - 10)}）`);
  const se = pageLayout([{ id: "a", ratio: "竖", title: "名字" }, { id: "b", ratio: "竖", title: "名字" }], 375, 667, { safeTop: 20, vase: 2 });
  const [sl, sr] = se.pages[0];
  ok(se.scale < 1 && sl.y + sl.p.h <= se.scene.flowersTop - 8 + 1 && sr.y + sr.p.h <= se.scene.tableTop - 10 + 1, `矮屏幕放不下就两幅一起缩（缩到 ${se.scale.toFixed(2)}）`);
  ok(pageLayout([], 390, 844).pages.length === 0, "一张都没有：没有页");
}

console.log(`\n通过 ${passed}  失败 ${failed}`);
process.exit(failed ? 1 : 0);
