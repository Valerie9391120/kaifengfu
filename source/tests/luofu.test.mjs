// 罗浮梦（见 src/luofu/parts.js、alarm/luofu.js、开发说明“罗浮梦”那一节）：梦库怎么存、怎么导、怎么改（删、撤销、加两类、找、换一份），
// 南衙那一行的小字、名帖里那一段、他睡觉那一样工具、替他睡（照编号定随机数）、存回去的进度和梦廊、屋里那一行小字，
// 聊天里摆的、提要和日记摘录里写的、预览，【醒来】里那一句；和翻日记、抽签、回屋、棋局、园子、妆台、拼豆板那几样不打架。
// 仓库是公开的：这里的梦都是编的（天气、点心、去处），不是她的梦库。
import {
  LUOFU_POOL, LUOFU_STATE, DURATIONS, emptyLuofuPool, readLuofuPool, packLuofuPool, readLuofuState, packLuofuState, dreamCount, hasDreams, luofuSub,
  kindsOf, pct, parseLuofuImport, removeDream, restoreDream, addDream, searchDreams, dreamLabel, galleryOf, LUOFU_SECTION, luofuSection,
  LUOFU_TOOL, LUOFU_NAMES, isLuofuCall, NOTE, napRng, napApply, cutLuofu, LUOFU_WAKE,
} from "../src/luofu/parts.js";
import { luofuOf, runLuofuCalls, luofuToy } from "../alarm/luofu.js";
import { napOnce, emptyState, readGalleryText, DEFAULT_INTRO, NOT_IN_GALLERY_TEXT, EMPTY_GALLERY_TEXT } from "../vendor/luofu/luofu-engine.ts";
import { seededRng } from "../src/game/jianghu.js";
import { wakeSection } from "../alarm/note.js";
import { ROOM_TOOLS, ROOM_SECTION, roomSection } from "../src/room.js";
import { DIARY_TOOLS } from "../src/diaryTools.js";
import { QX_TOOLS } from "../src/qx/pool.js";
import { TOOLS as GAME_TOOLS } from "../src/game/jianghu.js";
import { GARDEN_TOOL } from "../alarm/garden.js";
import { dressingTool } from "../alarm/dressing.js";
import { PINDOU_TOOL } from "../src/pindou/parts.js";
import { buildSystem } from "../src/prompt/system.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildRecapAsk } from "../src/prompt/recap.js";
import { dayTranscript } from "../src/diary.js";
import { makePreview } from "../src/chat/overview.js";
import { buildRows } from "../src/chat/rows.js";
import { needsReply } from "../src/thread.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T0 = new Date(2026, 10, 1, 22, 30).getTime();

// 一份编的梦库文件（开封府自己的样子）
const FILE = {
  kind: "kfs-luofu-pool", v: 1, dreamChance: 0.75, intro: "（测试梦库的说明）屋里有一张床。",
  kinds: [
    { id: "tq", name: "天气梦", type: "event", weight: 50, dreams: [
      { id: "t1", text: "下了一场雪，雪落在屋檐上，一直没化。" },
      { id: "t2", text: "起了大风，晾在外头的被子飞到了邻居家。" },
      { id: "t3", text: "天上同时挂着两个月亮，谁也不觉得奇怪。" },
      { id: "t4", text: "雾太大，走了很久才发现一直在原地。" },
      { id: "t5", text: "冰雹砸在铁皮屋顶上，像有人在敲鼓。" },
      { id: "t6", text: "太阳下山以后又升了起来，好像忘了什么东西。" },
    ] },
    { id: "dx", name: "点心梦", type: "event", weight: 35, dreams: ["吃了一块云片糕，甜得发苦。", "绿豆糕摆了一桌子，一块也拿不起来。", "烤了一炉蛋挞，出炉时全变成了月饼。"] },
    { id: "qc", name: "去处梦", type: "card", weight: 15, dreams: [
      { id: "q1", title: "山顶的邮局", source: "编的博物馆", text: "你梦见山顶有一间邮局，寄出去的信都要先绕着山走一圈。" },
      { id: "q2", title: "河底的书店", source: "编的图书馆", text: "你梦见河底开着一家书店，书页一翻就冒出一串气泡。" },
      { id: "q3", title: "云上的车站", text: "你梦见云上有一座车站，火车到站的时候会下一阵小雨。" },
    ] },
  ],
};
const POOL = parseLuofuImport(JSON.stringify(FILE));
const NAMES = FILE.kinds.map((k) => k.name);
// 只有记得完整的那一种、睡一觉一定做梦：睡一觉就进梦廊（测梦廊、小字用）
const CARDS = parseLuofuImport(JSON.stringify({ ...FILE, dreamChance: 1, kinds: [FILE.kinds[2]] }));
// 只有醒来就散的那几种、一定做梦；一定不做梦
const EVENTS = parseLuofuImport(JSON.stringify({ ...FILE, dreamChance: 1, kinds: FILE.kinds.slice(0, 2) }));
const NEVER = parseLuofuImport(JSON.stringify({ ...FILE, dreamChance: 0 }));
const ALL_TEXT = FILE.kinds.flatMap((k) => k.dreams.map((d) => (typeof d === "string" ? d : d.text)));

// =====================================================
// 存、读
// =====================================================
ok(LUOFU_POOL === "kfs2:luofu:pool" && LUOFU_STATE === "kfs2:luofu:state", "梦库存在 kfs2:luofu:pool 一条里，进度和梦廊存在 kfs2:luofu:state（都跟着云端走，云端只见乱码）");
ok([null, "", "不是 JSON", "[1,2]", '{"v":1}', '{"kinds":"x"}'].every((t) => dreamCount(readLuofuPool(t)) === 0 && Array.isArray(readLuofuPool(t).kinds)), "读不出来、没有 kinds 的：一律当空的");
const back = readLuofuPool(packLuofuPool(POOL));
ok(eq(back, POOL) && eq(readLuofuPool(packLuofuPool(back)), back), "存进去再读出来一模一样（读两遍跟读一遍一样）");
ok(POOL.kinds.map((k) => `${k.name}${k.dreams.length}`).join() === "天气梦6,点心梦3,去处梦3" && dreamCount(POOL) === 12 && POOL.intro === FILE.intro && POOL.dreamChance === 0.75, "照写的导进来：几种、各几个梦、说明、做梦的机会");
ok(POOL.kinds[1].dreams.every((d) => typeof d.id === "string" && d.id) && new Set(POOL.kinds.flatMap((k) => k.dreams.map((d) => d.id))).size === 12, "字串写的梦也认，编号另起，全梦库不重");
const messy = readLuofuPool(JSON.stringify({ v: 1, dreamChance: 3, kinds: [
  { id: "a", name: "  甲  梦 ", type: "event", weight: -2, dreams: ["  一  ", "一", "", null, { text: "  二 " }] },
  { id: "a", name: "甲 梦", type: "event", weight: 1, dreams: ["重名的种类不要"] },
  { name: "乙梦", type: "card", weight: "7", dreams: [{ text: "没写标题的一张，头一句当标题。后面还有。" }] },
  { name: "丙梦", type: "dream", weight: 1, dreams: ["种类写错的不要"] },
] }));
ok(messy.dreamChance === 1 && messy.kinds.map((k) => k.name).join("|") === "甲 梦|乙梦" && messy.kinds[0].weight === 0 && messy.kinds[0].dreams.map((d) => d.text).join() === "一,二" && messy.kinds[1].dreams[0].title === "没写标题的一张",
  "读的时候照引擎收拾干净：空白、重复的、空的不要；重名的种类、种类写错的不要；比例是负数的当 0；card 没写标题拿头一句");
ok(hasDreams(POOL) && !hasDreams(emptyLuofuPool()) && !hasDreams(readLuofuPool(JSON.stringify({ kinds: [{ name: "空", type: "event", weight: 1, dreams: [] }] }))), "梦库里一个梦都没有的算空的");
const st0 = readLuofuState(null);
ok(eq(st0, emptyState()) && eq(readLuofuState("乱码"), emptyState()) && eq(readLuofuState(packLuofuState({ ...emptyState(), totalNaps: 3 })), { ...emptyState(), totalNaps: 3 }), "进度读不出来当新的；存进去再读出来一样");

// =====================================================
// 导入
// =====================================================
const bad = (t) => { try { parseLuofuImport(t); return ""; } catch (e) { return e.message; } };
ok(bad("{乱码") === "这份文件读不出来：不是梦库文件" && bad("") === "这份文件读不出来：不是梦库文件", "读不出来的文件：这份文件读不出来：不是梦库文件");
ok(bad(JSON.stringify({ kind: "kfs-qx-pool", v: 1, dims: [{ name: "天气", tags: ["晴"] }] })) === "这不是梦库文件" && bad(JSON.stringify({ kinds: FILE.kinds })) === "这不是梦库文件" && bad("[1,2]") === "这不是梦库文件",
  "签库文件、没写 kind 的、不是对象的：这不是梦库文件");
ok(bad(JSON.stringify({ kind: "kfs-luofu-pool", v: 1, kinds: [{ name: "空", type: "event", weight: 1, dreams: [] }] })) === "这份文件里一个梦都没有", "是梦库文件、一个梦都没有：这份文件里一个梦都没有");
ok(bad("﻿" + JSON.stringify(FILE)) === "", "开头带 BOM 的照样认");

// =====================================================
// 梦库那一页：一种一行、几成
// =====================================================
const ks = kindsOf(POOL);
ok(eq(ks.map((k) => [k.name, k.type, k.n, pct(k.share)]), [["天气梦", "event", 6, "50%"], ["点心梦", "event", 3, "35%"], ["去处梦", "card", 3, "15%"]]), "一种一行：名字、哪一类、几条、有梦的时候占几成（照整份梦库算）");
ok(pct(0) === "0%" && pct(0.004) === "不到 1%" && pct(0.75) === "75%" && pct(NaN) === "0%" && pct(POOL.dreamChance) === "75%", "几成写成百分数；做梦的机会 75%");
const zeroed = readLuofuPool(JSON.stringify({ kinds: [{ name: "有", type: "event", weight: 1, dreams: ["一。"] }, { name: "零", type: "event", weight: 0, dreams: ["二。"] }] }));
ok(eq(kindsOf(zeroed).map((k) => pct(k.share)), ["100%", "0%"]), "比例写 0 的那一种：占 0%");

// =====================================================
// 删、撤销、加、找
// =====================================================
const [tq, dx, qc] = POOL.kinds;
const rm = removeDream(POOL, tq.id, "t3");
ok(rm.removed && rm.removed.at === 2 && rm.removed.dream.text.startsWith("天上同时") && rm.pool.kinds[0].dreams.length === 5 && POOL.kinds[0].dreams.length === 6, "删一条：记下原来排第几（回新的一份，原来那份不动）");
ok(removeDream(POOL, tq.id, "没有").removed === null && removeDream(POOL, "没有这一种", "t1").removed === null, "没有那一条、没有那一种：不删");
ok(eq(restoreDream(rm.pool, rm.removed), POOL) && eq(restoreDream(POOL, rm.removed), POOL), "撤销：放回原处；已经在的不重复放");
const rm2 = removeDream(rm.pool, qc.id, "q1");
ok(eq(restoreDream(rm2.pool, rm2.removed).kinds[2].dreams.map((d) => d.id), ["q1", "q2", "q3"]) && eq(restoreDream(rm2.pool, rm.removed).kinds[0].dreams.map((d) => d.id), POOL.kinds[0].dreams.map((d) => d.id)),
  "撤销只管刚删的那一条（照它记着的放回去）");
ok(dreamLabel(qc.dreams[0]) === "山顶的邮局" && dreamLabel(tq.dreams[0]) === "下了一场雪" && dreamLabel({ text: "长".repeat(40) }).length === 25, "列表、撤销那一条里摆的字：card 写标题，event 写头一句（太长截短）");
const a1 = addDream(POOL, tq.id, { text: "  下了一阵太阳雨，地上冒出好多小水泡。 " });
ok(a1.added && a1.added.text === "下了一阵太阳雨，地上冒出好多小水泡。" && a1.pool.kinds[0].dreams.slice(-1)[0].id === a1.added.id && !a1.added.title && POOL.kinds[0].dreams.length === 6,
  "加一条（醒来就散的那一种）：写一段字，前后空白去掉，加在那一种最后");
ok(eq(readLuofuPool(packLuofuPool(a1.pool)), a1.pool), "加了以后存进去再读出来一模一样（照引擎读过一遍）");
const a2 = addDream(POOL, qc.id, { title: " 湖心的灯塔 ", source: "", text: "你梦见湖心立着一座灯塔，灯一亮，湖面就结了一层薄冰。" });
ok(a2.added && a2.added.title === "湖心的灯塔" && !("source" in a2.added) && a2.pool.kinds[2].dreams.length === 4, "加一条（记得完整的那一种）：标题、正文；来源空着就不写");
const a3 = addDream(POOL, qc.id, { source: "编的地方志", text: "你梦见一条街上的路灯都在打哈欠。后来天就亮了。" });
ok(a3.added && a3.added.title === "你梦见一条街上的路灯都在打哈欠" && a3.added.source === "编的地方志", "标题没写：照引擎拿正文头一句；来源写了就记上");
ok(addDream(POOL, tq.id, { text: "下了一场雪，雪落在屋檐上，一直没化。" }).why === "这一条已经有了" && addDream(POOL, tq.id, { text: "   " }).why === "先写一段梦" && addDream(POOL, qc.id, { title: "只有标题" }).why === "先写正文" && addDream(POOL, "没有", { text: "x" }).why === "先挑一种",
  "重了的、空的、没挑那一种的：不加，说一句");
const allIds = new Set(POOL.kinds.flatMap((k) => k.dreams.map((d) => d.id)));
let fresh = true;
for (let i = 0; i < 40; i++) {
  const r = addDream(POOL, tq.id, { text: "编的第 " + i + " 个梦。" }, ["梦廊里做过的"]);
  if (!r.added || allIds.has(r.added.id) || r.added.id === "梦廊里做过的" || !/^[0-9a-z]{9,}$/.test(r.added.id)) fresh = false;
}
ok(fresh, "编号用开封府的 newId：跟梦库里已有的、梦廊里做过的都不重");
ok(searchDreams(POOL, "糕").map((h) => `${h.name}:${dreamLabel(h.dream)}`).join() === "点心梦:吃了一块云片糕,点心梦:绿豆糕摆了一桌子" && searchDreams(POOL, "雪 屋檐").map((h) => h.dream.id).join() === "t1" && searchDreams(POOL, "  ").length === 0 && searchDreams(POOL, "没有这个").length === 0,
  "找梦：带这几个字的（空格隔开的几个词都得有），列着是哪一种里的");
ok(searchDreams(POOL, "邮局").map((h) => h.dream.id).join() === "q1" && searchDreams(POOL, "图书馆").map((h) => h.dream.id).join() === "q2" && searchDreams(POOL, "气泡 书店").map((h) => h.type).join() === "card", "card 连标题、来源一起找");
const many = readLuofuPool(JSON.stringify({ kinds: [{ name: "多", type: "event", weight: 1, dreams: Array.from({ length: 90 }, (_, i) => `ABC 梦 ${i}`) }] }));
ok(searchDreams(many, "梦").length === 60 && searchDreams(many, "abc").length === 60, "一回最多列六十条；不分大小写");
// 换一份：导进来的那一份整个换上（页面上先问一声）；梦廊不动
const other = parseLuofuImport(JSON.stringify({ kind: "kfs-luofu-pool", v: 1, kinds: [{ name: "另一种", type: "event", weight: 1, dreams: ["另一份里的一个梦。"] }] }));
ok(other.kinds.map((k) => k.name).join() === "另一种" && dreamCount(other) === 1 && other.dreamChance === 0.75, "换一份：整份换成新的（没写做梦的机会照引擎的 0.75）");

// =====================================================
// 南衙那一行的小字
// =====================================================
ok(luofuSub(emptyLuofuPool()) === "梦库还空着" && luofuSub(POOL) === "梦库里 12 个梦" && luofuSub(a1.pool) === "梦库里 13 个梦" && luofuSub(rm.pool) === "梦库里 11 个梦", "南衙那一行：梦库里 N 个梦；空着写“梦库还空着”");

// =====================================================
// 名帖里的【罗浮梦】
// =====================================================
const sec = luofuSection(POOL, true);
ok(luofuSection(emptyLuofuPool(), true) === "" && luofuSection(POOL, false) === "" && luofuSection(readLuofuPool(JSON.stringify({ kinds: [{ name: "空", type: "card", weight: 1, dreams: [] }] })), true) === "", "梦库空着、“他自己醒”关着：没有这一段");
ok(sec === LUOFU_SECTION && sec.startsWith("【罗浮梦】\n") && ["一张床", "luofu_nap", "看运气", "梦廊", "只在你自己在屋里醒着的时候", "跟她聊天的时候睡不了"].every((w) => sec.includes(w)), "那一段：屋里一张床、困了能睡、做不做梦看运气、记得完整的留在梦廊、只在屋里");
ok(!NAMES.some((n) => sec.includes(n)) && !/\d/.test(sec) && !ALL_TEXT.some((t) => sec.includes(t.slice(0, 6))), "那一段不写有几种梦、各叫什么、有几个，一个梦都不写");
ok(luofuSection(a1.pool, true) === sec && luofuSection(rm.pool, true) === sec && luofuSection(other, true) === sec && luofuSection(CARDS, true) === sec, "加梦、删梦、换一份：这一段一个字不变（缓存接得上）");
const sysArgs = { now: new Date(2026, 10, 1, 22, 0), memeList: [], hisAvatarName: "", memDocs: [] };
const room = roomSection(true);
const plain = buildSystem({ ...sysArgs, room });
const withL = buildSystem({ ...sysArgs, room, luofu: sec });
ok(buildSystem({ ...sysArgs, room, luofu: "" }).staticText === plain.staticText, "不传、传空的：名帖一个字不变");
ok(withL.staticText === plain.staticText.replace(ROOM_SECTION + "\n\n", ROOM_SECTION + "\n\n" + sec + "\n\n") && withL.staticText.indexOf("【你的屋子】") < withL.staticText.indexOf("【罗浮梦】") && withL.nowNote === plain.nowNote,
  "梦库里有梦：紧跟在【你的屋子】后面多这一段，别的一个字不差，【此刻】不变");
const both = buildSystem({ ...sysArgs, room, luofu: sec, qx: "【秘戏钱匣】\n（测试）" });
ok(both.staticText.indexOf("【罗浮梦】") < both.staticText.indexOf("【秘戏钱匣】"), "排在【秘戏钱匣】前头");

// =====================================================
// 工具
// =====================================================
ok(LUOFU_TOOL.name === "luofu_nap" && eq(LUOFU_TOOL.input_schema.required, ["action"]) && eq(LUOFU_TOOL.input_schema.properties.action.enum, ["nap", "gallery", "read"]) && eq(LUOFU_TOOL.input_schema.properties.duration.enum, DURATIONS) && eq(DURATIONS, ["小憩", "短休", "酣眠"]),
  "工具叫 luofu_nap：睡一觉（能挑小憩、短休、酣眠）、翻梦廊、读一场");
ok(isLuofuCall({ name: "luofu_nap" }) && !isLuofuCall({ name: "play_pindou" }) && !isLuofuCall(null) && LUOFU_NAMES.has("luofu_nap"), "认得出他调的是不是这一样");
const schema = JSON.stringify(LUOFU_TOOL);
ok(!NAMES.some((n) => schema.includes(n)) && ["只在你自己醒着、待在屋里的时候", "一行小字", "梦里的事她看不到", "罗浮梦里翻得到"].every((w) => schema.includes(w)), "说明里不写有几种梦、各叫什么；写着只在屋里能睡、她只看得到一行小字");
const others = [...DIARY_TOOLS, ...QX_TOOLS, ...ROOM_TOOLS, ...GAME_TOOLS, GARDEN_TOOL, dressingTool(true), PINDOU_TOOL].map((t) => t.name);
ok(!others.includes("luofu_nap") && !ROOM_TOOLS.some((t) => t.name === "luofu_nap") && !QX_TOOLS.concat(DIARY_TOOLS).some((t) => t.name === "luofu_nap"), "不跟别的工具重名；平常聊天带的那几样里没有它（她定的：他只在屋里睡）");

// =====================================================
// 替他睡（不碰存档的那一半：napApply）
// =====================================================
const nap = (pool, state, id, input = { action: "nap" }, at = T0) => napApply(pool, state, input, { id, at });
// 照他调的那一样的编号定随机数：同 seededRng 那一串
const r1 = napRng("toolu_same");
const s1 = seededRng("toolu_same");
ok([0, 1, 2, 3].every(() => r1() === s1(0, 4294967296) / 4294967296), "随机数照他调的那一样的编号定（seededRng，同江湖棋局的骰子、秘戏钱匣他抽签）");
const seen1 = { ...emptyState(), introSeen: true };
const x1 = nap(POOL, seen1, "toolu_same");
const x2 = nap(POOL, seen1, "toolu_same");
const direct = napOnce(POOL, seen1, { rng: napRng("toolu_same"), now: () => new Date(T0) });
ok(eq(x1, x2) && eq(x1.state, direct.state) && x1.out.startsWith(direct.result.text), "同一个编号睡两遍一样（两台设备替他睡，睡得一样），就是照这个编号叫引擎睡的那一觉");
let differ = 0;
for (let i = 0; i < 30; i++) if (nap(POOL, seen1, "toolu_" + i).out !== x1.out) differ++;
ok(differ > 20, `换一个编号多半睡得不一样（三十回里 ${differ} 回不一样；重新回答是新的编号，重睡）`);
ok(eq(seen1, { ...emptyState(), introSeen: true }) && x1.changed && x1.state.totalNaps === 1, "不改传进来的进度，回新的一份；睡了要存回去（changed）");
// 头一回用：先给说明
const first = nap(POOL, emptyState(), "toolu_first");
ok(first.out.startsWith("（测试梦库的说明）屋里有一张床。\n\n你") && first.state.introSeen && first.changed, "头一回用：先给他引擎的那段说明（梦库里写了就用梦库里的），再睡");
const noIntro = parseLuofuImport(JSON.stringify({ ...FILE, intro: "" }));
ok(nap(noIntro, emptyState(), "toolu_i").out.startsWith(DEFAULT_INTRO + "\n\n"), "梦库里没写说明：用引擎自带的那一段");
ok(!nap(POOL, first.state, "toolu_2").out.includes("测试梦库的说明"), "第二回不再给");
const g0 = napApply(POOL, emptyState(), { action: "gallery" }, { id: "toolu_g" });
ok(g0.out.startsWith("（测试梦库的说明）") && g0.out.endsWith(EMPTY_GALLERY_TEXT) && g0.changed && g0.note === NOTE.gallery, "头一回用的是翻梦廊：也先给说明，记下给过了");
// 三种结果、三种小字
const c1 = nap(CARDS, seen1, "toolu_c1");
ok(c1.note === "睡了一觉 · 梦廊里多了一场：〈" + c1.state.gallery[0].title + "〉" && c1.state.gallery.length === 1 && c1.state.seen.length === 1 && c1.out.includes(c1.state.gallery[0].text) && c1.out.includes("收进了梦廊"),
  "做了记得完整的那一类：小字“睡了一觉 · 梦廊里多了一场：〈标题〉”，进梦廊、记进做过的");
ok(c1.state.gallery[0].at === new Date(T0).toISOString(), "梦廊里记的哪天做的梦：他这一步的时间（两台设备记得一样）");
const e1 = nap(EVENTS, seen1, "toolu_e1");
ok(e1.note === "睡了一觉 · 做了个梦" && e1.state.gallery.length === 0 && ALL_TEXT.some((t) => e1.out.includes(t.slice(0, 5))) && !ALL_TEXT.some((t) => e1.note.includes(t.slice(0, 2))),
  "做了醒来就散的那一类：小字“睡了一觉 · 做了个梦”，梦的内容一个字不露（只在递给他的结果里）；不进梦廊");
const n1 = nap(NEVER, seen1, "toolu_n1");
ok(n1.note === "睡了一觉 · 没做梦" && n1.out.includes("这一觉没有留下什么梦") && n1.state.totalNaps === 1, "没做梦：小字“睡了一觉 · 没做梦”");
const d1 = nap(NEVER, seen1, "toolu_d", { action: "nap", duration: "酣眠" });
const d2 = nap(NEVER, seen1, "toolu_d", { action: "nap", duration: "不存在的" });
ok(d1.out.startsWith("你好好睡了一觉") && d2.state.totalNaps === 1, "能挑睡多久（酣眠）；写错了的当没挑");
// 梦库空着
const em = nap(emptyLuofuPool(), emptyState(), "toolu_em");
ok(em.err && em.out.includes("梦库还空着") && em.note === "想睡一会儿，梦库还空着" && !em.changed && !em.state.introSeen && em.state.totalNaps === 0, "梦库空着：告诉他梦库还空着，不睡；说明也先不给（等她导了梦库）");
ok(napApply(POOL, seen1, { action: "跳舞" }, { id: "x" }).err && napApply(POOL, seen1, null, { id: "x" }).note === NOTE.napFail, "action 写错了：告诉他该写什么，小字“想睡一会儿，没睡成”");
// 翻梦廊、读一场
let st = seen1;
for (const id of ["toolu_a", "toolu_b"]) st = nap(CARDS, st, id).state;
const titles = st.gallery.map((e) => e.title);
const gl = napApply(CARDS, st, { action: "gallery" }, { id: "g" });
ok(gl.note === "翻了翻梦廊" && gl.out.startsWith("1. " + titles[1]) && !gl.out.includes("/3") && !gl.out.includes("还剩") && !gl.changed, "翻梦廊：最新的在最上面，不写一共多少、还剩多少；小字“翻了翻梦廊”；进度不用存");
const rd = napApply(CARDS, st, { action: "read", which: titles[0] }, { id: "r" });
ok(rd.note === `翻出梦廊里的一场：〈${titles[0]}〉` && rd.out === readGalleryText(st, titles[0]) && !rd.err, "读一场（写标题）：递给他那一场的全文，小字“翻出梦廊里的一场：〈标题〉”");
ok(napApply(CARDS, st, { action: "read", which: "1" }, { id: "r" }).note === `翻出梦廊里的一场：〈${titles[1]}〉` && napApply(CARDS, st, { action: "read", which: st.gallery[0].id }, { id: "r" }).note.endsWith(`〈${titles[0]}〉`),
  "读一场写梦廊里排的序号（1 是最新的）、写编号也认");
const miss = napApply(CARDS, st, { action: "read", which: "没做过的那一场" }, { id: "r" });
ok(miss.err && miss.out === NOT_IN_GALLERY_TEXT && miss.note === "想翻梦廊里的一场，没找着" && napApply(CARDS, st, { action: "read" }, { id: "r" }).out.includes("读哪一场"), "没做过的、没写读哪一场：不给看，小字“想翻梦廊里的一场，没找着”");
// 梦库里删了、改了：梦廊照旧
const gone = removeDream(CARDS, CARDS.kinds[0].id, st.gallery[0].id).pool;
ok(napApply(gone, st, { action: "read", which: titles[0] }, { id: "r" }).out.includes(st.gallery[0].text) && galleryOf(st).length === 2, "梦库里删了那一场：梦廊里照旧（存的是做梦那一刻的那一份）");
ok(eq(galleryOf(st).map((e) => e.title), titles.slice().reverse()) && galleryOf(null).length === 0, "梦廊那一页：最新的在最上面");
// 做完的不再做
let all = seen1;
for (let i = 0; i < 3; i++) all = nap(CARDS, all, "toolu_all_" + i).state;
const fourth = nap(CARDS, all, "toolu_all_3");
ok(all.gallery.length === 3 && fourth.note === NOTE.none && fourth.state.gallery.length === 3, "记得完整的那一种都做完了：不再做（这一觉没做梦）");
// 截断的
const cut = cutLuofu({ id: "toolu_cut", name: "luofu_nap", input: { action: "nap" } });
ok(cut.err && cut.out.includes("没写完") && cut.note === "想睡一会儿，没睡成" && cutLuofu({ id: "y", name: "luofu_nap", input: { action: "gallery" } }).note === "想翻梦廊，没翻成" && cutLuofu({ id: "z", name: "luofu_nap" }).note === NOTE.napFail,
  "写到长度上限截断的：不替他睡，小字“想睡一会儿，没睡成”（翻梦廊的写“想翻梦廊，没翻成”）");

// =====================================================
// 闹钟那头：存档怎么读写、替他睡、屋里那一行小字（alarm/luofu.js）
// =====================================================
function fakeStore(init = {}) {
  const data = new Map(Object.entries(init));
  const writes = [];
  return { data, writes, get: async (k) => (data.has(k) ? data.get(k) : null), set: async (k, v) => { data.set(k, v); writes.push(k); return true; } };
}
const fs1 = fakeStore({ [LUOFU_POOL]: packLuofuPool(CARDS) });
const lf = luofuOf(fs1);
const toy = luofuToy(lf);
const call = (id, input = { action: "nap" }) => ({ id, name: "luofu_nap", input });
ok(toy.tool === LUOFU_TOOL && toy.is(call("x")) && toy.cut === cutLuofu && (await lf.hasDreams()) && !(await luofuOf(fakeStore()).hasDreams()), "交给 askCore 的那一样：带 luofu_nap，认它，截断的照 cutLuofu；看得出梦库里有没有梦");
let out = await toy.run([call("toolu_n1"), { id: "dd", name: "diary_read", input: {} }, call("toolu_n2")], { at: T0 });
const saved = readLuofuState(fs1.data.get(LUOFU_STATE));
ok(out[0].note.startsWith("睡了一觉 · 梦廊里多了一场：〈") && out[1].out === undefined && out[2].note.startsWith("睡了一觉 · 梦廊里多了一场：〈") && out[0].note !== out[2].note, "替他睡：一觉一行小字（睡了两觉两行）；别的工具不碰");
ok(saved.totalNaps === 2 && saved.gallery.length === 2 && saved.introSeen && saved.gallery.every((e) => e.at === new Date(T0).toISOString()) && fs1.writes.filter((k) => k === LUOFU_STATE).length === 2, "睡完把新的进度存回去（kfs2:luofu:state）：两觉、梦廊里两场、说明给过了；记的是他这一步的时间");
ok(!fs1.writes.includes(LUOFU_POOL), "梦库只读：闹钟那头一个字不写（只有她手机上梦库那一页写）");
ok(out[0].out.startsWith("（测试梦库的说明）") && !out[2].out.includes("测试梦库的说明"), "头一回给说明，后面不再给");
// 照编号：另一台（另一份存档、同样的梦库和进度）替他睡同一个编号，睡出来一样
const fs2 = fakeStore({ [LUOFU_POOL]: packLuofuPool(CARDS) });
const again = await runLuofuCalls([call("toolu_n1"), call("toolu_n2")], luofuOf(fs2), new Set(), T0);
ok(eq(again.map((c) => [c.out, c.note]), [out[0], out[2]].map((c) => [c.out, c.note])) && fs2.data.get(LUOFU_STATE) === fs1.data.get(LUOFU_STATE), "同样的梦库、同样的进度、同一个编号：另一处替他睡，睡得一样，存回去的进度一个字不差");
out = await toy.run([call("toolu_g1", { action: "gallery" }), call("toolu_g2", { action: "gallery" }), call("toolu_r1", { action: "read", which: "1" })], { at: T0 });
ok(out[0].note === "翻了翻梦廊" && out[1].note === "" && out[2].note.startsWith("翻出梦廊里的一场：〈") && fs1.writes.filter((k) => k === LUOFU_STATE).length === 2, "翻梦廊、读一场：一回醒着里一样的小字只留一行；进度没变不写");
ok((await luofuToy(lf).run([call("toolu_g3", { action: "gallery" })], { at: T0 }))[0].note === "翻了翻梦廊", "下一回醒来（新的一份）：小字从头算");
const done = await toy.run([{ ...call("toolu_done"), out: "睡过了" }]);
ok(done[0].out === "睡过了" && done[0].note === undefined, "已经办过的（有结果的）不再办");
const fsE = fakeStore();
const emptyRun = await runLuofuCalls([call("toolu_e")], luofuOf(fsE));
ok(emptyRun[0].err && emptyRun[0].note === "想睡一会儿，梦库还空着" && !fsE.data.has(LUOFU_STATE), "梦库空着：不睡，进度不写");
const broken = luofuOf({ get: async () => { throw new Error("坏了"); }, set: async () => true });
const bo = await runLuofuCalls([call("toolu_b"), call("toolu_b2", { action: "gallery" })], broken);
ok(bo[0].err && bo[0].note === NOTE.napFail && bo[0].out.includes("存档出了岔子") && bo[1].note === NOTE.readFail, "存档读不出来：告诉他下回再睡，小字“想睡一会儿，没睡成”");
const failSet = fakeStore({ [LUOFU_POOL]: packLuofuPool(CARDS) });
failSet.set = async () => { throw new Error("写不进去"); };
const fo = await runLuofuCalls([call("toolu_f")], luofuOf(failSet));
ok(fo[0].err && fo[0].note === NOTE.napFail, "进度存不回去：这一觉不算，告诉他没睡成（不给他一个没记下的梦）");
let threw = false;
try {
  await runLuofuCalls([call("toolu_x")], luofuOf({ get: async () => { const e = new Error("x"); e.code = "badlogin"; throw e; }, set: async () => true }));
} catch (e) {
  threw = e.code === "badlogin";
}
ok(threw, "密码不对、凭据坏了：往外抛（闹钟那头照这个停下，同园子、妆台、拼豆板）");

// =====================================================
// 【醒来】里那一句
// =====================================================
const ws = wakeSection({ now: T0, herLast: null, lastWake: 0, n: 1, gap: 30, max: 12, transcript: "", luofu: true });
ok(ws.includes(LUOFU_WAKE) && LUOFU_WAKE.includes("luofu_nap") && !NAMES.some((n) => LUOFU_WAKE.includes(n)), "【醒来】里一行：屋里有一张床（luofu_nap），睡不睡他自己定；不写有几种梦");
ok(!wakeSection({ now: T0, herLast: null, lastWake: 0, n: 1, gap: 30, max: 12, transcript: "" }).includes("luofu_nap"), "没给（梦库空着）就不提");

// =====================================================
// 聊天里（狐宇宙）、寄给他的、提要和日记摘录、预览
// =====================================================
const ev = nap(EVENTS, seen1, "toolu_view");
const dreamText = ALL_TEXT.find((t) => ev.out.includes(t.slice(0, 6)));
const evCall = { id: "toolu_view", name: "luofu_nap", input: { action: "nap" }, out: ev.out, err: false, note: ev.note };
const wakeMark = { id: "w1", role: "event", who: "him", kind: "wake", ts: T0 };
const step = { id: "s1", role: "him", ts: T0 + 1, items: [], raw: "", stop: "tool_use", calls: [evCall] };
const after = { id: "s2", role: "him", ts: T0 + 2, items: [{ type: "text", text: "睡醒了。" }], raw: "睡醒了。" };
const rows = buildRows([wakeMark, step, after], null, "", null, "");
const tools = rows.filter((r) => r.type === "tools");
ok(tools.length === 1 && tools[0].text === "睡了一觉 · 做了个梦" && !JSON.stringify(rows.map((r) => r.text || "")).includes(dreamText.slice(0, 6)), "狐宇宙里：一行小字（跟“抽了一签 · ……”一个样子），梦的内容不摆出来");
const cardCall = { id: "toolu_c", name: "luofu_nap", input: { action: "nap" }, out: c1.out, err: false, note: c1.note };
ok(buildRows([wakeMark, { ...step, calls: [evCall, cardCall] }, after], null, "", null, "").filter((r) => r.type === "tools").map((r) => r.text).join("|") === `睡了一觉 · 做了个梦|${c1.note}`, "一步里睡了两觉：两行");
const built = buildMessages([wakeMark, step, after], {}, () => null).messages;
const results = built.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_result");
ok(results.length === 1 && results[0].content === ev.out && built.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_use" && b.name === "luofu_nap")), "寄给他：他调的 luofu_nap 跟着睡出来的那一段（他自己记得梦见了什么）");
const recapText = buildRecapAsk({ msgs: [wakeMark, step, after], memeLookup: () => null }).content.map((b) => b.text || "").join("\n");
ok(recapText.includes("[光义睡了一觉 · 做了个梦]") && !recapText.includes(dreamText.slice(0, 6)), "叫他抄提要的记录里：“[光义睡了一觉 · 做了个梦]”，梦的内容不在里头");
const diaryText = dayTranscript([wakeMark, step, after], () => null);
ok(diaryText.includes("[光义睡了一觉 · 做了个梦]") && !diaryText.includes(dreamText.slice(0, 6)), "写日记的摘录里：同上");
ok(makePreview([wakeMark, step]) === "[睡了一觉 · 做了个梦]" && makePreview([wakeMark, { ...step, calls: [cardCall] }]) === `[${c1.note}]`, "预览：一个字没说只睡了一觉，写那一行小字");
ok(!needsReply([wakeMark, step, after]), "睡完说完了：不算欠着谁一句");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
