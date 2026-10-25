// 拼豆作（见 src/pindou/parts.js、alarm/pindou.js、开发说明“拼豆作”那一节）：色板、作品码、她的板子和作品集怎么存，
// 他屋里那块板子（play_pindou 的每一样：看、放豆子、整片换色、换板子、清空、挂起来、翻挂起来的）、屋里那一行小字、【醒来】里那一句、
// 聊天里回屋看一眼；她发给他的那一幅寄给他的样子（图加一句）、聊天里摆的、提要和日记摘录里写的、预览、一条多厚。
// 仓库是公开的：这里的板子都是编的（几颗豆子、一个小方块），不是她拼的。
import {
  PALETTE, SIZES, HIS_SIZE, PD_STATE, PD_WORK, PD_HIS, colorName, keyOf, hexOfKey, toCode, fromCode, resizeGrid, floodGrid, cleanName,
  countBeads, usageOf, readState, packState, readWork, packWork, listWorks, readHis, packHis, gridText, boardText, galleryText,
  PINDOU_TOOL, isPindouCall, PD_NOTE, hisApply, pindouBrief, pindouView, pdText, pdBrief, pdInfo, pdSub, DONE_MAX, NAME_MAX,
} from "../src/pindou/parts.js";
import { pindouOf, runPindouCalls, cutPindou, pindouToy, PINDOU_NAMES } from "../alarm/pindou.js";
import { wakeSection } from "../alarm/note.js";
import { ROOM_TOOLS, ROOM_SECTION, runRoomCalls } from "../src/room.js";
import { DIARY_TOOLS } from "../src/diaryTools.js";
import { QX_TOOLS } from "../src/qx/pool.js";
import { TOOLS as GAME_TOOLS } from "../src/game/jianghu.js";
import { GARDEN_TOOL } from "../alarm/garden.js";
import { dressingTool } from "../alarm/dressing.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildRecapAsk } from "../src/prompt/recap.js";
import { thick, askThick, THICK } from "../src/recap.js";
import { dayTranscript } from "../src/diary.js";
import { makePreview, makeTitle } from "../src/chat/overview.js";
import { buildRows } from "../src/chat/rows.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const K = "#1F1D24", W = "#FBFBF8", O = "#EE7A2D", Z = "#6C3FA1", P = "#F6A3BC";
const blank = (n) => new Array(n * n).fill(null);
// 一块编的板子：n×n，左上角一个 3×3 的黑框，中间一颗橘的
function sample(n = 24) {
  const g = blank(n);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g[y * n + x] = K;
  g[1 * n + 1] = O;
  return g;
}

// =====================================================
// 色板
// =====================================================
ok(PALETTE.length === 39, "色板三十九种，跟官方 App 里那一份一样多");
ok(new Set(PALETTE.map((c) => c.k)).size === 39 && PALETTE.every((c) => c.k.length === 1 && !".- ".includes(c.k)), "给他用的字母一种一个，都是一个字，不是点、减号、空格（那三个另有用处）");
ok(new Set(PALETTE.map((c) => c.hex)).size === 39 && PALETTE.every((c) => /^#[0-9A-F]{6}$/.test(c.hex)), "颜色一种一个，写法统一（井号、六位、大写）");
ok(colorName(K) === "墨黑" && colorName("#123456") === "自定义 #123456" && keyOf(Z) === "Z" && keyOf("#123456") === "" && hexOfKey("o") === O && hexOfKey("?") === "", "名字、字母、颜色三样互相认得；色板外的颜色名字写“自定义”，没有字母");
ok(eq(SIZES, [16, 24, 29, 32, 48]) && HIS_SIZE === 24, "板子五种大小，他头一块是 24×24");
ok(PD_STATE === "kfs2:pd:state" && PD_WORK === "kfs2:pd:work:" && PD_HIS === "kfs2:pindou", "存档的钥匙：她的板子、作品集一幅一条、他的板子");

// =====================================================
// 作品码
// =====================================================
const g24 = sample();
const c24 = toCode(24, g24);
ok(c24.startsWith("PD1~24~1F1D24,EE7A2D~") && eq(fromCode(c24), { n: 24, g: g24 }), "作品码来回一趟一样：PD1~边长~颜色~一格一格");
ok(eq(fromCode(`作品码：\n${c24.slice(0, 20)}\n  ${c24.slice(20)}  `), { n: 24, g: g24 }), "前后有别的字、中间断了行有空格（从聊天里、备忘录里粘过来的）也认");
// 官方 App 里那一份复制的作品码（写法一样）：一块 16×16，上面一排四颗白的，后面一颗紫的
const fromApp = "PD1~16~FBFBF8,6C3FA1~a4b.251";
const appB = fromCode(fromApp);
ok(appB && appB.n === 16 && countBeads(appB.g) === 5 && appB.g[0] === W && appB.g[4] === Z && appB.g[5] === null, "官方 App 里那一份的写法照认（白的连着四颗写成 a4，紫的一颗写成 b）");
ok(fromCode("PD1~16~FBFBF8~a4.250") === null, "格数不够（少了一格）：认不出");
ok(fromCode("PD1~16~FBFBF8~a4.253") !== null && countBeads(fromCode("PD1~16~FBFBF8~a4.253").g) === 4, "格数多了：多的不要（照边长截）");
ok(fromCode("PD1~16~GGGGGG~a256") === null && fromCode("PD1~16~FBFBF8~b256") === null && fromCode("PD1~7~FBFBF8~a49") === null && fromCode("PD1~65~FBFBF8~a4225") === null && fromCode("随便一句话") === null && fromCode("") === null,
  "颜色不对、字母指着没有的颜色、边长太小太大、根本不是作品码：都认不出");
ok(toCode(16, blank(16)) === "PD1~16~~.256" && eq(fromCode("PD1~16~~.256"), { n: 16, g: blank(16) }), "空板子也写得出、认得回");
const many = blank(16);
for (let i = 0; i < 53; i++) many[i] = "#" + (0x100000 + i * 997).toString(16).toUpperCase().padStart(6, "0");
ok(toCode(16, many) === "", "五十三种颜色写不下（一种一个字母，只有五十二个）：给空的");
let rt = true;
for (let t = 0; t < 30; t++) {
  const n = SIZES[t % SIZES.length];
  const g = blank(n).map(() => (Math.random() < 0.4 ? PALETTE[Math.floor(Math.random() * 39)].hex : null));
  if (!eq(fromCode(toCode(n, g)), { n, g })) rt = false;
}
ok(rt, "随便铺三十块（五种大小、乱七八糟的颜色）：来回一趟都一样");

// =====================================================
// 换板子、整片换色、名字
// =====================================================
const r1 = resizeGrid(24, g24, 32);
ok(r1.lost === 0 && countBeads(r1.g) === 9 && r1.g[4 * 32 + 4] === K && r1.g[5 * 32 + 5] === O, "换大的：拼好的居中挪过去（24→32 往右下各挪 4 格），一颗不少");
const mid = blank(24);
mid[0] = K;
mid[12 * 24 + 12] = O;
const r2 = resizeGrid(24, mid, 16);
ok(r2.lost === 1 && countBeads(r2.g) === 1 && r2.g[8 * 16 + 8] === O, "换小的：居中挪过去（往左上挪 4 格），出了边的（左上角那颗）取下来，记着取下来几颗");
const fg = sample(16);
ok(floodGrid(16, fg, 10, 10, P) === 256 - 9 && fg[10 * 16 + 10] === P && fg[0] === K && floodGrid(16, fg, 10, 10, P) === 0, "整片换色：从一格起连着的空格都换了，黑框没碰；本来就是这个颜色的换 0 格");
ok(floodGrid(16, fg, 0, 0, null) === 8 && fg[1 * 16 + 1] === O, "黑框整片取下来：连着的八颗黑的，中间那颗橘的不连着、没碰");
ok(cleanName("  《小狐狸》\n[穿紫袍] ") === "小狐狸 穿紫袍" && Array.from(cleanName("字".repeat(40))).length === NAME_MAX && cleanName(null) === "", "名字：书名号、方括号拿掉，空白收成一个，最长二十四个字");
ok(Array.from(cleanName("🦊".repeat(30))).length === NAME_MAX && !cleanName("🦊".repeat(30)).includes("\ud83e\ud83e"), "名字里的表情一个一个数，截的时候不截成半个");

// =====================================================
// 她的板子、作品集
// =====================================================
const st = readState(packState({ n: 24, g: g24, custom: ["#123456", "#123456", W], color: O, view: "fused", tool: "fill", mirror: true, guides: true, hint: true }));
ok(st && st.n === 24 && eq(st.g, g24) && eq(st.custom, ["#123456"]) && st.color === O && st.view === "fused" && st.tool === "fill" && st.mirror && st.guides && st.hint,
  "她的板子存进去读出来一样；自己调的颜色去掉重复的、去掉色板里本来就有的");
const st0 = readState(JSON.stringify({ v: 1, code: "坏了", color: "红", view: "3d", tool: "刷子" }));
ok(st0 && st0.n === 24 && countBeads(st0.g) === 0 && st0.color === O && st0.view === "bead" && st0.tool === "pen" && !st0.mirror, "存档里的板子、颜色、样子、工具认不出：照默认的来（24×24 空板子、狐橘、拼豆、拼）");
ok(readState(null) === null && readState("不是 JSON") === null && readState("[1]") === null, "没存过、存坏了：回 null（那一页照默认的开）");
const w1 = readWork(packWork({ name: " 《头一幅》 ", code: c24, at: 1000 }));
ok(w1 && w1.name === "头一幅" && w1.n === 24 && w1.beads === 9 && w1.code === c24 && w1.at === 1000, "作品集里的一幅：名字收拾过、几号板、几颗、几点存的");
ok(readWork(JSON.stringify({ v: 1, name: "坏", code: "PD1~24~~", at: 1 })) === null && readWork("x") === null, "板子认不出的那一幅：不要");
const list = listWorks([
  [PD_WORK + "a", packWork({ name: "旧的", code: c24, at: 1000 })],
  [PD_WORK + "b", packWork({ name: "新的", code: toCode(16, sample(16)), at: 3000 })],
  [PD_WORK + "c", "坏了"],
  ["kfs2:qx:pool", packWork({ name: "不是作品集的", code: c24, at: 5000 })],
  [PD_WORK + "d", packWork({ name: "", code: c24, at: 2000 })],
]);
ok(eq(list.map((w) => [w.id, w.name]), [["b", "新的"], ["d", ""], ["a", "旧的"]]), "作品集：新的在前；坏了的、别处的钥匙不算");
ok(pdSub([], readHis(null)) === "还没拼过" && pdSub(list, readHis(null)) === "作品集里 3 幅", "南衙那一行的小字：还没拼过；作品集里几幅");

// =====================================================
// 他的板子
// =====================================================
const h0 = readHis(null);
ok(h0.n === 24 && countBeads(h0.g) === 0 && h0.done.length === 0 && !h0.touched && h0.since === 0, "他没动过：一块空的 24×24，没挂起来过，没碰过");
ok(eq(readHis("坏了"), h0) && eq(readHis(JSON.stringify({ v: 1, code: "坏了", done: [{ code: "坏了" }] })).done, []), "存坏了照没动过算；挂起来的里头认不出的不要");
const T0 = new Date(2026, 9, 25, 21, 30).getTime();
// look
const lk = hisApply(h0, { action: "look" }, T0);
ok(lk.his === h0 && !lk.changed && !lk.err && lk.note === "看了看拼豆板" && lk.out.includes("24×24，还空着") && lk.out.includes("  0  ........................") && lk.out.includes("23  ........................"),
  "look：板子一个字没动，给他看一格一个点（左边行号），屋里一行“看了看拼豆板”");
ok(gridText(12, blank(12)).split("\n")[0] === "     0         1 " && gridText(12, blank(12)).split("\n")[1] === "     012345678901", "上面两行列号：十位、个位，跟底下的格子对齐");
// paint
const p1 = hisApply(h0, { action: "paint", rows: [{ y: 2, x: 3, beads: "kkk" }, { y: 3, beads: "...o.-" }, { y: 4, x: 0, beads: "k k" }] }, T0);
ok(p1.changed && !p1.err && p1.note === "在拼豆板上拼了一会儿" && countBeads(p1.his.g) === 6 && p1.his.g[2 * 24 + 3] === K && p1.his.g[2 * 24 + 5] === K && p1.his.g[3 * 24 + 3] === O && p1.his.g[4 * 24 + 0] === K && p1.his.g[4 * 24 + 1] === null && p1.his.g[4 * 24 + 2] === K,
  "paint：一项一行，x 不写从 0 开始；点、空格这一格不动；字母放豆子");
ok(p1.out.startsWith("放好了：这一笔放了 6 颗") && p1.out.includes("\n  2  ...kkk.") && p1.out.includes("用到的颜色：k 墨黑 5 颗，o 狐橘 1 颗。"), "回给他：这一笔放了几颗，再加板子眼下的样子、用到的颜色");
ok(p1.his.since === T0 && p1.his.at === T0 && h0.since === 0 && countBeads(h0.g) === 0, "记下这块哪天开拼、最近一回几点动的；原来那一份没被改");
const p2 = hisApply(p1.his, { action: "paint", rows: [{ y: 2, x: 3, beads: "-" }, { y: 30, beads: "k" }, { y: 5, x: 22, beads: "kkkk" }, { y: 6, beads: "Q?k" }] }, T0 + 1000);
ok(p2.changed && countBeads(p2.his.g) === 8 && p2.his.g[2 * 24 + 3] === null && p2.his.g[5 * 24 + 23] === K && p2.his.g[6 * 24 + 2] === K && p2.his.at === T0 + 1000 && p2.his.since === T0,
  "减号取下来；写出右边的截掉；y 出了板子的那一项不放；不认得的字母那一格不动，后面的照放");
ok(p2.out.includes("取下 1 颗") && p2.out.includes("第 2 项的 y 或 x 不在板子上") && p2.out.includes("第 5 行写出板子右边了") && p2.out.includes("Q、? 不在色板上"), "哪几样没放、为什么，都告诉他");
const p3 = hisApply(p2.his, { action: "paint", rows: [{ y: 4, beads: "k" }] }, T0 + 2000);
ok(!p3.changed && p3.his === p2.his && p3.note === "看了看拼豆板" && p3.out.startsWith("这一笔板子上没变"), "放的跟原来一样：板子没变、不写存档，屋里那一行写“看了看”");
ok(hisApply(h0, { action: "paint" }).err && hisApply(h0, { action: "paint", rows: [] }).note === PD_NOTE.fail, "paint 没写 rows：告诉他怎么写，屋里一行“想拼拼豆，没拼成”");
ok(hisApply(h0, { action: "paint", rows: [{ y: "3", x: "1", beads: "k" }] }).his.g[3 * 24 + 1] === K, "y、x 写成了字（\"3\"）也认");
// fill
const f1 = hisApply(p1.his, { action: "fill", at: { x: 20, y: 20 }, color: "x" }, T0);
ok(f1.changed && countBeads(f1.his.g) === 576 && f1.his.g[20 * 24 + 20] === hexOfKey("x") && f1.his.g[3 * 24 + 3] === O && f1.out.includes("换成了天青") && f1.note === PD_NOTE.paint, "fill：连着的空格整片换成天青，原来的豆子没碰");
const f2 = hisApply(f1.his, { action: "fill", at: { x: 20, y: 20 }, color: "-" }, T0);
ok(f2.changed && countBeads(f2.his.g) === 6 && f2.out.includes("取下来了"), "fill 写减号：那一片整片取下来");
ok(hisApply(p1.his, { action: "fill", at: { x: 3, y: 3 }, color: "o" }).changed === false, "那一片本来就是这个颜色：板子没变");
ok(hisApply(p1.his, { action: "fill", at: { x: 30, y: 3 }, color: "o" }).err && hisApply(p1.his, { action: "fill", at: { x: 3, y: 3 }, color: "Q" }).err && hisApply(p1.his, { action: "fill", color: "o" }).err, "fill 写错格子、写错颜色、没写格子：告诉他怎么写");
// resize
const z1 = hisApply(p1.his, { action: "resize", size: 32 }, T0);
ok(z1.changed && z1.his.n === 32 && countBeads(z1.his.g) === 6 && z1.his.g[6 * 32 + 7] === K && z1.note === "换了一块 32×32 的拼豆板" && z1.out.includes("32×32"), "resize：换大的，居中挪过去，屋里一行写换了多大的");
const z2 = hisApply(p1.his, { action: "resize", size: 16 }, T0);
ok(z2.changed && z2.his.n === 16 && z2.out.includes("放不下") , "换小的：放不下的取下来，告诉他");
ok(hisApply(p1.his, { action: "resize", size: 20 }).err && !hisApply(p1.his, { action: "resize", size: 24 }).changed, "大小不在那五种里：不换；本来就是这么大：不换");
// clear
const cl = hisApply(p1.his, { action: "clear" }, T0 + 5000);
ok(cl.changed && countBeads(cl.his.g) === 0 && cl.his.n === 24 && cl.his.since === T0 + 5000 && cl.note === "把拼豆板清空了", "clear：豆子全取下来，板子还是那么大，屋里一行“把拼豆板清空了”");
ok(!hisApply(h0, { action: "clear" }).changed, "本来就是空的：不清");
// finish
const fi = hisApply(p1.his, { action: "finish", name: "《黑框》" }, T0 + 9000);
ok(fi.changed && fi.his.done.length === 1 && fi.his.done[0].name === "黑框" && fi.his.done[0].beads === 6 && countBeads(fi.his.done[0].g) === 6 && countBeads(fi.his.g) === 0 && fi.his.n === 24 && fi.his.since === 0 && fi.his.at === T0 + 9000,
  "finish：起了名字挂起来（书名号拿掉），桌上换一块一样大的空板子");
ok(fi.note === "拼完了一幅《黑框》，挂了起来" && fi.out.includes("挂起来了：《黑框》，24×24，6 颗"), "屋里一行写拼完了哪一幅");
ok(hisApply(p1.his, { action: "finish" }, T0).his.done[0].name === "无题" && hisApply(h0, { action: "finish", name: "空的" }).err, "没起名字叫“无题”；板子上一颗都没有：挂不起来");
// gallery
let gh = fi.his;
gh = hisApply(hisApply(gh, { action: "paint", rows: [{ y: 0, beads: "ooo" }] }, T0 + 10000).his, { action: "finish", name: "三颗橘" }, T0 + 11000).his;
const ga = hisApply(gh, { action: "gallery" });
ok(!ga.changed && ga.note === "翻了翻挂起来的拼豆" && ga.out.includes("挂起来的拼豆（2 幅，新的在前") && ga.out.indexOf("1.《三颗橘》") < ga.out.indexOf("2.《黑框》"), "gallery：一幅一行，新的在前");
const g2 = hisApply(gh, { action: "gallery", index: 2 });
ok(g2.out.startsWith("挂起来的第 2 幅：《黑框》") && g2.out.includes("\n  2  ...kkk.") && hisApply(gh, { action: "gallery", index: 9 }).out.includes("没有第 9 幅"), "写了第几幅：给他看那一幅的样子；没有那一幅照实说");
ok(hisApply(h0, { action: "gallery" }).out.startsWith("还没挂起来过一幅"), "一幅都没挂过：照实说");
ok(hisApply(h0, { action: "画画" }).err && hisApply(h0, {}).note === PD_NOTE.fail && hisApply(h0, null).err, "action 写错了、没写：告诉他有哪几样");
// 存档来回
const packed = readHis(packHis(gh));
ok(packed.done.length === 2 && packed.done[1].name === "三颗橘" && eq(packed.done[0].g, gh.done[0].g) && packed.n === 24 && packed.at === gh.at && packed.touched, "他的板子存进去读出来一样（挂起来的那几幅也是）");
const lots = { ...gh, done: Array.from({ length: DONE_MAX + 5 }, (_, i) => ({ id: "d" + i, name: "第" + i, n: 16, g: sample(16), beads: 9, at: i })) };
ok(readHis(packHis(lots)).done.length === DONE_MAX && readHis(packHis(lots)).done[0].name === "第5", `挂起来的最多留 ${DONE_MAX} 幅，再多把最旧的收起来`);
// 【醒来】那一句、回屋看一眼
ok(pindouBrief(h0) === "拼豆板还空着：一块 24×24 的板子，色板上三十九种颜色。", "【醒来】里：没动过，照实说");
ok(pindouBrief(p1.his) === "桌上那块 24×24 拼了 6 颗，拼到一半。" && pindouBrief(gh) === "桌上是一块空的 24×24；挂起来的有 2 幅，最近一幅是《三颗橘》。", "拼到一半、挂起来了几幅（最近一幅叫什么）");
ok(pindouView(h0).startsWith("【你屋里·拼豆板】（回屋看了一眼。只能看，动不了") && pindouView(h0).includes("拼豆板你还没动过") && pindouView(h0).includes("怎么玩："), "回屋看一眼：只能看动不了；没动过照实说；后面是怎么玩");
ok(pindouView(gh).includes("桌上这块拼豆板：24×24，还空着") && pindouView(gh).includes("1.《三颗橘》"), "回屋看一眼：桌上那块、挂起来的那些都看得到");
ok(pdSub(list, gh) === "作品集里 3 幅，他挂起来 2 幅" && pdSub([], p1.his) === "他桌上那块拼到一半", "南衙那一行的小字带上他那边");

// =====================================================
// 工具
// =====================================================
ok(PINDOU_TOOL.name === "play_pindou" && eq(PINDOU_TOOL.input_schema.required, ["action"]) && isPindouCall({ name: "play_pindou" }) && !isPindouCall({ name: "room_look" }) && PINDOU_NAMES.has("play_pindou"), "工具叫 play_pindou，action 必填");
ok(PALETTE.every((c) => PINDOU_TOOL.description.includes(`${c.k} ${c.name}`)), "说明里写着整张色板（字母 颜色）");
ok(PINDOU_TOOL.description.includes("只在你自己醒着、待在屋里的时候") && PINDOU_TOOL.description.includes("她在拼豆作里看得见"), "说明里写着只在屋里能拼、她看得见");
const others = [...DIARY_TOOLS, ...QX_TOOLS, ...ROOM_TOOLS, ...GAME_TOOLS, GARDEN_TOOL, dressingTool(true)].map((t) => t.name);
ok(!others.includes("play_pindou"), "不跟翻日记、抽签、回屋、棋局、园子、妆台那几样重名");

// =====================================================
// 闹钟那头：替他办、屋里那一行小字
// =====================================================
function fakeStore() {
  const data = new Map();
  return { data, get: async (k) => (data.has(k) ? data.get(k) : null), set: async (k, v) => { data.set(k, v); return true; } };
}
const fs = fakeStore();
const pd = pindouOf(fs, { now: () => T0 });
const toy = pindouToy(pd);
const call = (id, input) => ({ id, name: "play_pindou", input });
let out = await toy.run([call("a", { action: "look" }), { id: "x", name: "diary_read", input: {} }, call("b", { action: "paint", rows: [{ y: 0, beads: "kk" }] })]);
ok(out[0].note === "看了看拼豆板" && out[1].out === undefined && out[2].note === "在拼豆板上拼了一会儿" && !out[2].err, "替他办：看了、拼了各一行小字；别的工具不碰");
ok(readHis(fs.data.get(PD_HIS)).g[0] === K && readHis(fs.data.get(PD_HIS)).since === T0, "拼了就写进存档 kfs2:pindou（只写动了板子的那几回）");
out = await toy.run([call("c", { action: "paint", rows: [{ y: 1, beads: "o" }] }), call("d", { action: "look" }), call("e", { action: "finish", name: "两颗" })]);
ok(out[0].note === "" && out[1].note === "" && out[2].note === "拼完了一幅《两颗》，挂了起来", "一回醒着里一样的小字只留一行（第二回拼、第二回看不再写），挂起来的那一行照写");
ok(readHis(fs.data.get(PD_HIS)).done.length === 1 && countBeads(readHis(fs.data.get(PD_HIS)).g) === 0, "挂起来以后存档里多一幅，桌上是空板子");
const toy2 = pindouToy(pd);
ok((await toy2.run([call("f", { action: "look" })]))[0].note === "看了看拼豆板", "下一回醒来（新的一份）：小字从头算");
const done1 = await toy.run([{ ...call("g", { action: "look" }), out: "办过了" }]);
ok(done1[0].out === "办过了" && done1[0].note === undefined, "已经办过的（有结果的）不再办");
const bad = pindouOf({ get: async () => { throw new Error("坏了"); }, set: async () => true });
const bo = await runPindouCalls([call("h", { action: "look" })], bad);
ok(bo[0].err && bo[0].note === PD_NOTE.fail && bo[0].out.includes("存档出了岔子"), "存档读不出来：告诉他下回再拼，屋里一行“想拼拼豆，没拼成”");
let threw = false;
try {
  await runPindouCalls([call("i", { action: "look" })], pindouOf({ get: async () => { const e = new Error("x"); e.code = "badlogin"; throw e; }, set: async () => true }));
} catch (e) {
  threw = e.code === "badlogin";
}
ok(threw, "密码不对、凭据坏了：往外抛（闹钟那头照这个停下，同园子、妆台）");
const cu = cutPindou(call("j", { action: "paint", rows: [{ y: 0, beads: "kk" }] }));
ok(cu.err && cu.note === PD_NOTE.fail && cu.out.includes("没写完"), "写到长度上限截断的：不替他办");
const sec = wakeSection({ now: T0, herLast: null, lastWake: 0, n: 1, gap: 30, max: 12, transcript: "", pindou: "桌上那块 24×24 拼了 6 颗，拼到一半。" });
ok(sec.includes("- 去桌上拼拼豆（play_pindou 工具）") && sec.includes("桌上那块 24×24 拼了 6 颗") && sec.includes("她在开封府的拼豆作里看得见"), "【醒来】里一行：去桌上拼拼豆、拼到哪儿了、她看得见");
ok(!wakeSection({ now: T0, herLast: null, lastWake: 0, n: 1, gap: 30, max: 12, transcript: "" }).includes("拼豆"), "没给就不提拼豆板");

// =====================================================
// 聊天里回屋看一眼
// =====================================================
const look = ROOM_TOOLS.find((t) => t.name === "room_look");
ok(look.input_schema.properties.what.enum.includes("pindou") && look.description.includes("pindou 桌上的拼豆板"), "回屋看一眼多一样：pindou 拼豆板");
ok(ROOM_SECTION.includes("桌上还有一块拼豆板") && ROOM_SECTION.includes("你拼的她在开封府的拼豆作里看得见"), "名帖【你的屋子】里添了一句拼豆板");
const io = (store) => ({ get: (k) => store.get(k), set: (k, v) => store.set(k, v), today: "2026-10-25", at: T0, chat: "c1", title: "测试", on: true });
const rr = await runRoomCalls([{ id: "r1", name: "room_look", input: { what: "pindou" } }], io(fs));
ok(rr[0].note === "回屋看了看拼豆板" && rr[0].out.startsWith("【你屋里·拼豆板】") && rr[0].out.includes("1.《两颗》"), "回屋看拼豆板：她那边一行“回屋看了看拼豆板”，他看得到挂起来的那一幅");
const before = fs.data.get(PD_HIS);
ok(fs.data.get(PD_HIS) === before, "只看：存档一个字没动");
const rr0 = await runRoomCalls([{ id: "r2", name: "room_look", input: { what: "pindou" } }], io(fakeStore()));
ok(rr0[0].out.includes("拼豆板你还没动过") && !rr0[0].err, "他还没动过：照实说");

// =====================================================
// 她发给他的那一幅
// =====================================================
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const msg = { id: "m1", role: "her", kind: "pindou", ts: T0, name: "小方块", code: c24, png: PNG };
ok(eq(pdInfo(msg), { name: "小方块", n: 24, beads: 9, kinds: 2 }), "认得出名字、几号板、几颗、几种颜色");
ok(pdText(msg) === "【拼豆作】卿卿拼了一幅《小方块》（24×24 的板子，9 颗，2 种颜色）", "寄给他的那一句");
ok(pdText({ ...msg, name: "" }) === "【拼豆作】卿卿拼了一幅拼豆（24×24 的板子，9 颗，2 种颜色）" && pdText(msg, { img: false, stale: true }).endsWith("（图这一回没带上）") && pdText(msg, { img: false }).endsWith("（图没带上）"), "没起名字、图没带上，各有说法");
ok(pdBrief(msg) === "[拼豆] 小方块" && pdBrief({ ...msg, name: "" }) === "[拼豆]", "短的写法（预览、名字、日记摘录）");
const built = buildMessages([msg], { her: null, him: null }, () => null).messages;
const blocks = built[built.length - 1].content;
const img = blocks.find((b) => b.type === "image");
ok(img && img.source.media_type === "image/png" && img.source.data === "iVBORw0KGgo=" && blocks.some((b) => b.type === "text" && b.text === pdText(msg)), "寄给他：发的那一下画好的图，后面跟着那一句");
const noPng = buildMessages([{ ...msg, png: "" }], { her: null, him: null }, () => null).messages;
ok(!noPng[noPng.length - 1].content.some((b) => b.type === "image") && noPng[noPng.length - 1].content.some((b) => b.type === "text" && b.text.endsWith("（图没带上）")), "图没存上：只寄那一句，写明图没带上");
ok(makePreview([msg]) === "[拼豆] 小方块" && makeTitle([msg], () => null) === "[拼豆] 小方块", "历史对话的预览、对话名字");
ok(dayTranscript([msg], () => null).includes("卿卿：[拼豆] 小方块"), "写日记用的聊天摘录");
const rows = buildRows([msg], null, "m1");
ok(rows.some((r) => r.type === "pindou" && r.msg === msg) && rows.some((r) => r.type === "stopped") && !rows.some((r) => r.type === "bubble"), "聊天里：正中一个方框（不是她那一边的气泡）；她按了停，底下照样摆那一行");
ok(thick(msg) === THICK.row + THICK.pd + pdText(msg).length && askThick(msg) === THICK.row + pdText(msg).length, "一条多厚：寄的时候一张图加一句，抄提要的时候只那一句");
const ask = JSON.stringify(buildRecapAsk({ msgs: [msg, { id: "h1", role: "him", ts: T0 + 1, raw: "好看", items: [{ type: "text", text: "好看" }] }], memeLookup: () => null }));
ok(ask.includes("【拼豆作】卿卿拼了一幅《小方块》") && !ask.includes("iVBORw0KGgo"), "叫他抄提要的记录里写那一句，图不带");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
