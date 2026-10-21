// 秘戏钱匣（见 src/qx/pool.js、开发说明“秘戏钱匣”那一节）：签库怎么存、怎么导、怎么改，她抽、重抽、他抽（照编号抽），
// 她丢进聊天的那一签寄给他的样子、聊天里摆的、提要和日记摘录里写的、预览，名帖里那一段，和翻日记、江湖棋局那几样不打架。
// 仓库是公开的：这里的签、维度都是编的（天气、点心、去处），不是她的签库。
import {
  QX_KEY, QX_TOOLS, QX_NAMES, CUT_QX, COINS, coinName, emptyPool, readPool, packPool, poolSize, hasLots, parseImport,
  setOn, addTag, removeTag, restoreTag, searchTags, phoneRng, dimsFor, drawLots, rerollLine, cleanLines, lotText, lotBrief,
  isQxCall, drawNote, runQxCalls, qxSection, TAG_MAX,
} from "../src/qx/pool.js";
import { seededRng, apiBlocks, hasSteps, needsRun, midTurn } from "../src/game/jianghu.js";
import { DIARY_TOOLS, DIARY_NAMES, toolCallsOf } from "../src/diaryTools.js";
import { TOOLS as GAME_TOOLS, GAME_NAMES } from "../src/game/jianghu.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildSystem } from "../src/prompt/system.js";
import { buildRecapAsk } from "../src/prompt/recap.js";
import { thick, askThick } from "../src/recap.js";
import { dayTranscript } from "../src/diary.js";
import { makePreview, makeTitle } from "../src/chat/overview.js";
import { buildRows } from "../src/chat/rows.js";
import { needsReply } from "../src/thread.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };

// 一份编的签库文件（开封府自己的样子）
const FILE = {
  kind: "kfs-qx-pool", v: 1,
  dims: [
    { name: "天气", tags: ["晴", "阴", "雨", "雪"] },
    { name: "点心", tags: ["桂花糕", "云片糕", "豌豆黄"] },
    { name: "去处", tags: ["湖边", "书店", "云台山"] },
    { name: "单一", tags: ["只有这一条"] },
  ],
};
const POOL = parseImport(JSON.stringify(FILE));

// =====================================================
// 存、读
// =====================================================
ok(QX_KEY === "kfs2:qx:pool", "签库存在 kfs2:qx:pool 一条里（跟着云端走，云端只见乱码）");
ok(readPool(null).dims.length === 0 && readPool("不是 JSON").dims.length === 0 && readPool(JSON.stringify({ v: 2, dims: [{ name: "x", tags: ["y"] }] })).dims.length === 0 && readPool('{"v":1}').dims.length === 0,
  "读不出来、版本不对、没有 dims 的：一律当空的");
const messy = readPool(JSON.stringify({ v: 1, dims: [
  { id: "a", name: "  天气 ", on: false, tags: [" 晴 ", "晴", "", null, "阴  天", "长".repeat(60)] },
  { id: "b", name: "天气", tags: ["重了的维度"] },
  { name: "", tags: ["没名字"] },
  "坏的", null,
] }));
ok(messy.dims.length === 1 && messy.dims[0].name === "天气" && messy.dims[0].on === false && messy.dims[0].tags.join("|") === `晴|阴 天|${"长".repeat(TAG_MAX)}`,
  "读的时候收拾干净：前后空白去掉、中间空白并成一个、重复的签去掉、空的不要、太长的截到 40 字；重名的维度、没名字的、坏的不要；on 照存的");
const back = readPool(packPool(POOL));
ok(JSON.stringify(back) === JSON.stringify(POOL) && back.dims.every((d) => typeof d.id === "string" && d.id && d.on === true), "存进去再读出来一模一样；导进来的每一样都有编号、都开着");
ok(poolSize(POOL) === 11 && hasLots(POOL) && !hasLots(emptyPool()) && !hasLots(readPool(JSON.stringify({ v: 1, dims: [{ name: "空", tags: [] }] }))), "签库里几条签；一条都没有的算空的");

// =====================================================
// 导入
// =====================================================
ok(POOL.dims.map((d) => `${d.name}${d.tags.length}`).join() === "天气4,点心3,去处3,单一1", "开封府的签库文件：照写的导进来");
const RUOTA = [
  { id: "a", zh: "甲", gore: false, tags: [{ zh: "一", en: "One", ja: "いち" }, { zh: "二", en: "Two" }] },
  { id: "x", zh: "乙", tags: [{ zh: "三" }] },
  { id: "gore", zh: "", short: "GORE", gore: true, enOnly: true, tags: [{ zh: "不要的", en: "Nope" }] },
];
const fromRuota = parseImport(JSON.stringify(RUOTA));
ok(fromRuota.dims.map((d) => `${d.name}:${d.tags.join("/")}`).join() === "甲:一/二,乙:三", "Ruota della Fortuna 原样的 tags.json：只拿中文，gore 那一样不要");
const bad = (t) => { try { parseImport(t); return ""; } catch (e) { return e.message; } };
ok(bad("{乱码") === "这份文件读不出来：不是签库文件" && bad('{"a":1}') === "这份文件里没有签库" && bad(JSON.stringify({ dims: [{ name: "空", tags: [] }] })) === "这份文件里一条签都没有" && bad("﻿" + JSON.stringify(FILE)) === "",
  "认不出来的文件说一句给她看（开头带 BOM 的照样认）");

// =====================================================
// 改签库
// =====================================================
const [tq, ds, qc, dy] = POOL.dims;
const off1 = setOn(POOL, tq.id, false);
ok(!off1.dims[0].on && POOL.dims[0].on, "关一样（回新的一份，原来那份不动）");
let allOff = POOL;
for (const d of POOL.dims) allOff = setOn(allOff, d.id, false);
ok(allOff.dims.filter((d) => d.on).length === 1 && allOff.dims[3].on, "至少留一样开着：最后那一样关不掉");
const halfEmpty = readPool(JSON.stringify({ v: 1, dims: [{ id: "x", name: "有", tags: ["一"] }, { id: "y", name: "空", tags: [] }] }));
ok(setOn(halfEmpty, "x", false) === halfEmpty, "开着的另一样是空的：有签的这一样也关不掉（不然抽不出东西）");
const add1 = addTag(POOL, ds.id, "  绿豆糕 ");
ok(add1.added === "绿豆糕" && add1.pool.dims[1].tags.slice(-1)[0] === "绿豆糕" && addTag(POOL, ds.id, "桂花糕").added === "" && addTag(POOL, ds.id, "   ").added === "" && addTag(POOL, "没有这一样", "x").added === "",
  "加一条：去掉前后空白加在最后；重了的、空的、没有那一样的不加");
const rm = removeTag(POOL, tq.id, "阴");
ok(rm.removed && rm.removed.at === 1 && rm.pool.dims[0].tags.join() === "晴,雨,雪" && removeTag(POOL, tq.id, "没有").removed === null, "删一条：记下原来排第几");
ok(restoreTag(rm.pool, rm.removed).dims[0].tags.join() === "晴,阴,雨,雪" && restoreTag(POOL, rm.removed).dims[0].tags.join() === "晴,阴,雨,雪", "撤销：放回原处；已经在的不重复放");
ok(searchTags(POOL, "糕").map((h) => `${h.name}${h.t}`).join() === "点心桂花糕,点心云片糕" && searchTags(POOL, "云 糕").map((h) => h.t).join() === "云片糕" && searchTags(POOL, "  ").length === 0 && searchTags(POOL, "没有").length === 0,
  "找签：带这几个字的（空格隔开的几个词都得有），列着是哪一样里的");
const many = readPool(JSON.stringify({ v: 1, dims: [{ name: "多", tags: Array.from({ length: 90 }, (_, i) => "签" + i) }] }));
ok(searchTags(many, "签").length === 60 && searchTags(readPool(JSON.stringify({ v: 1, dims: [{ name: "x", tags: ["ABC"] }] })), "abc").length === 1, "一回最多列六十条；不分大小写");

// =====================================================
// 抽
// =====================================================
const rnd = phoneRng();
let inRange = true;
const seen = new Map();
for (let i = 0; i < 3000; i++) {
  const v = rnd(0, 3);
  if (v < 0 || v > 2) inRange = false;
  seen.set(v, (seen.get(v) || 0) + 1);
}
ok(inRange && [0, 1, 2].every((v) => seen.get(v) > 850), `这台手机的随机数：0–2 三个数各一千上下（${[...seen.values()].join("、")}）`);
const lots = drawLots(POOL, rnd);
ok(lots.map((l) => l.d).join() === "天气,点心,去处,单一" && lots.every((l, i) => POOL.dims[i].tags.includes(l.t)), "她抽：开着的每一样各抽一条，照签库里的次序");
ok(drawLots(off1, rnd).map((l) => l.d).join() === "点心,去处,单一", "关掉的那一样不抽");
const emptyDim = readPool(JSON.stringify({ v: 1, dims: [{ name: "空", tags: [] }, { name: "有", tags: ["一"] }] }));
ok(drawLots(emptyDim, rnd).map((l) => l.d).join() === "有", "空了的那一样不抽");
const noneOn = { v: 1, dims: POOL.dims.map((d) => ({ ...d, on: false })) };
ok(dimsFor(noneOn).length === 4, "存档里一样都没开（别处改坏了）：全抽");
ok(drawLots(POOL, rnd, ["去处", "没有的", "天气"]).map((l) => l.d).join() === "天气,去处", "他抽、给了维度名：只抽这几样（照签库里的次序），没有的那一样不管");
const r1 = rerollLine(POOL, { d: "天气", t: "晴" }, rnd);
let changed = true;
for (let i = 0; i < 200; i++) if (rerollLine(POOL, { d: "天气", t: "晴" }, rnd).t === "晴") changed = false;
ok(r1.d === "天气" && changed, "重抽一样：换一条跟眼下不一样的");
ok(rerollLine(POOL, { d: "单一", t: "只有这一条" }, rnd).t === "只有这一条" && rerollLine(POOL, { d: "没有", t: "x" }, rnd).t === "x", "那一样只有一条：还是它；没有那一样：原样");

// =====================================================
// 她丢进聊天的那一签
// =====================================================
const lotMsg = { id: "l1", role: "her", ts: 10, kind: "lot", coin: 5, lines: [{ d: "天气", t: "雪" }, { d: "点心", t: "云片糕" }, { d: "", t: "坏的" }] };
ok(cleanLines(lotMsg.lines).length === 2 && COINS.length === 5 && coinName(5) === "花好月圆" && coinName(1) === "风花雪月" && coinName(9) === "" && coinName(null) === "", "铜钱五枚（第五枚花好月圆）；坏的那一行不要");
ok(lotText(lotMsg) === "【秘戏钱匣】卿卿抽了一签（花好月圆）：\n天气：雪\n点心：云片糕" && lotText({ ...lotMsg, coin: 0 }).startsWith("【秘戏钱匣】卿卿抽了一签：\n"), "寄给他的样子：【秘戏钱匣】卿卿抽了一签（哪一枚）：一样一行");
ok(lotBrief(lotMsg) === "[签] 雪、云片糕", "预览、摘录里短的样子");
const her0 = { id: "h0", role: "her", ts: 1, text: "去南衙抽签" };
const lot2 = { ...lotMsg, id: "l2", ts: 11, coin: 2, lines: [{ d: "去处", t: "湖边" }] };
const msgs = buildMessages([her0, { id: "m0", role: "him", ts: 2, items: [{ type: "text", text: "去吧" }], raw: "去吧" }, lotMsg, lot2], {}, () => null).messages;
const lastU = msgs[msgs.length - 1];
ok(lastU.role === "user" && lastU.content.map((b) => b.text).join("|") === `${lotText(lotMsg)}|${lotText(lot2)}`, "她连着丢了两签：寄过去是一句话里两段（跟她连着发几条一样）");
ok(needsReply([her0, lotMsg]), "她丢了签：欠着他一句");
const rows = buildRows([her0, lotMsg, lot2], null, "l2", null, "");
ok(rows.filter((r) => r.type === "lot").map((r) => r.key).join() === "l1,l2" && !rows.some((r) => r.type === "bubble" && r.msg.kind === "lot") && rows.some((r) => r.type === "stopped" && r.msg.id === "l2"),
  "聊天里：一签一个方框（不是她那一边的气泡）；她按了停，底下照样摆“停了，点这里让我回”");
ok(makePreview([her0, lotMsg]) === "[签] 雪、云片糕" && makeTitle([lotMsg], () => null) === "[签] 雪、云片糕" && makeTitle([{ ...lotMsg, lines: Array.from({ length: 6 }, () => ({ d: "x", t: "很长的一条签" })) }], () => null).endsWith("…"),
  "历史对话的预览、名字：写成“[签] …”，名字长了截断");
ok(thick(lotMsg) > 20 && askThick(lotMsg) === thick(lotMsg), "一条多厚：照寄给他的字算");
ok(dayTranscript([her0, lotMsg], () => null).split("\n").join("|") === "卿卿：去南衙抽签|卿卿：[签] 雪、云片糕", "写日记用的聊天摘录：“卿卿：[签] …”");
const ask = buildRecapAsk({ msgs: [her0, lotMsg], memeLookup: () => null });
ok(ask.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").includes(lotText(lotMsg)), "叫他抄提要的记录里：照寄给他的样子写");

// =====================================================
// 他自己抽：qx_draw
// =====================================================
ok(QX_TOOLS.length === 1 && QX_TOOLS[0].name === "qx_draw" && [...QX_NAMES].join() === "qx_draw" && isQxCall({ name: "qx_draw" }) && !isQxCall({ name: "diary_read" }) && !isQxCall(null),
  "一样工具：qx_draw");
const schema = JSON.stringify(QX_TOOLS);
ok(!schema.includes("enum") && !POOL.dims.some((d) => schema.includes(d.name)), "工具的说明一个字不变：不写维度名、不列可选的（仓库是公开的；维度名在名帖那一段里）");
const NAMES = new Set([...GAME_NAMES, ...DIARY_NAMES, ...QX_NAMES]);
ok(GAME_TOOLS.concat(DIARY_TOOLS, QX_TOOLS).map((t) => t.name).filter((n) => NAMES.has(n)).length === GAME_TOOLS.length + DIARY_TOOLS.length + 1 && new Set(GAME_TOOLS.concat(DIARY_TOOLS, QX_TOOLS).map((t) => t.name)).size === GAME_TOOLS.length + DIARY_TOOLS.length + 1,
  "跟江湖棋局、翻日记那几样不重名");
const content = [{ type: "text", text: "我抽一签。" }, { type: "tool_use", id: "t1", name: "qx_draw", input: {} }, { type: "tool_use", id: "t2", name: "diary_read", input: { dates: [] } }];
ok(toolCallsOf(content, NAMES).map((c) => c.name).join() === "qx_draw,diary_read", "他回话里调的认得出来（跟翻日记的一起）");

let k = 0;
const qcall = (input = {}, id) => ({ id: id || "toolu_q" + ++k, name: "qx_draw", input });
const [d1] = runQxCalls([qcall({}, "toolu_same")], POOL);
const [d2] = runQxCalls([qcall({}, "toolu_same")], POOL);
ok(d1.out === d2.out && d1.note === d2.note && !d1.err && d1.card.length === 0, "照他调的那一样的编号抽：同一个编号抽两遍一样（两台设备替他抽，抽得一样）");
let differ = 0;
for (let i = 0; i < 30; i++) if (runQxCalls([qcall()], POOL)[0].out !== d1.out) differ++;
ok(differ > 20, `换一个编号多半抽得不一样（三十回里 ${differ} 回不一样）`);
ok(d1.out.startsWith("抽到了：\n") && d1.out.split("\n").length === 5 && /^天气：/.test(d1.out.split("\n")[1]) && d1.note.startsWith("抽了一签 · 天气 ") && d1.note.split("｜").length === 4,
  "递给他的：抽到了，一样一行；她那边一行小字：抽了一签 · 天气 …｜点心 …");
const lines1 = d1.out.split("\n").slice(1).map((l) => ({ d: l.split("：")[0], t: l.split("：")[1] }));
ok(drawNote(lines1) === d1.note && lines1.every((l) => POOL.dims.find((d) => d.name === l.d).tags.includes(l.t)), "抽到的都是签库里的；小字照抽到的写");
const [o1] = runQxCalls([qcall({ dims: ["点心"] })], off1);
ok(o1.out.split("\n").length === 2 && o1.note.startsWith("抽了一签 · 点心 ") && !o1.note.includes("｜"), "dims 写了：只抽那一样");
const [o2] = runQxCalls([qcall({})], off1);
ok(o2.note.split("｜").length === 4, "他抽不看她关了哪几样（关的是她自己抽的时候）");
const [o3] = runQxCalls([qcall({ dims: ["点心", "火锅"] })], POOL);
ok(o3.out.startsWith("签库里没有叫“火锅”的维度（有的是：天气、点心、去处、单一），那几样没抽。\n抽到了：\n点心：") && !o3.err, "写了没有的维度：说一声有哪几样，照写对了的那几样抽");
const [o4] = runQxCalls([qcall({ dims: ["火锅"] })], POOL);
ok(o4.out.startsWith("签库里没有叫“火锅”的维度") && o4.out.includes("就每个维度都抽了") && o4.note.split("｜").length === 4, "写的维度一样都没有：每个维度都抽，说一声");
const bareDim = removeTag(POOL, dy.id, "只有这一条").pool;
const [o6] = runQxCalls([qcall({ dims: ["单一"] })], bareDim);
ok(o6.out.startsWith("“单一”那一样里的签删光了，就每个维度都抽了。\n抽到了：\n") && o6.note.split("｜").length === 3, "写的那一样签删光了：说一声，每个还有签的维度都抽");
const [o5] = runQxCalls([qcall({ dims: "点心" })], POOL);
ok(o5.note.split("｜").length === 4, "dims 写成了一个字（不是一串）：当没写");
const [e1] = runQxCalls([qcall({})], emptyPool());
const [e2] = runQxCalls([qcall({})], null);
ok(e1.err && e1.out.includes("签库还空着") && e1.note === "想抽一签，签库还空着" && e2.err, "签库空着：递回去抽不了，她那边一行小字“想抽一签，签库还空着”");
const done = { id: "toolu_x", name: "qx_draw", input: {}, out: "早就抽过了", err: false, note: "抽了一签 · 早", card: [] };
const mixed = runQxCalls([done, { id: "toolu_d", name: "diary_read", input: { dates: ["2026-10-12"] } }, qcall({})], POOL);
ok(mixed[0] === done && mixed[1].out === undefined && typeof mixed[2].out === "string", "抽过的不再抽（out 已经是字）；别的工具不碰");
ok(CUT_QX.includes("没写完整") && CUT_QX.includes("再调一回"), "写到长度上限截断的那一回：不替他抽，递回去这一句");

// 对话里的一步（跟翻日记一个路子）
const step = { id: "s1", role: "him", ts: 20, items: [{ type: "text", text: "我也抽一签。" }], raw: "我也抽一签。", stop: "tool_use", calls: [d1] };
const after = { id: "s2", role: "him", ts: 21, items: [{ type: "text", text: "抽到雪了。" }], raw: "抽到雪了。" };
ok(midTurn(step) && !needsRun(step) && needsRun({ ...step, calls: [qcall({})] }) && needsReply([her0, step]) && !needsReply([her0, step, after]) && !hasSteps([her0, step, after]), "抽签的一步也是“说到一半”，抽好了等着递回去；不算下过棋");
const built = buildMessages([her0, step, after], {}, () => null).messages;
ok(built[1].content.map((b) => b.type).join() === "text,tool_use" && built[1].content[1].name === "qx_draw" && built[2].content[0].type === "tool_result" && built[2].content[0].content === d1.out,
  "寄回去：他说的字后面跟着 qx_draw，下一句最前面是抽到的");
ok(apiBlocks({ calls: [{ id: "q", name: "qx_draw", input: {} }] }).results[0].content.includes("没来得及替你办"), "万一没有结果：写“没来得及替你办”（不是调引擎那一句）");
const srows = buildRows([her0, step, after], null, "", null, "");
const notes = srows.filter((r) => r.type === "tools");
ok(notes.length === 1 && notes[0].text === d1.note && srows.indexOf(notes[0]) > srows.findIndex((r) => r.key === "s1-0") && srows.indexOf(notes[0]) < srows.findIndex((r) => r.key === "s2-0"),
  "聊天里一行小字（跟翻日记那一行一个样子），摆在他那一步的话后面");
const two = { ...step, calls: [d1, runQxCalls([qcall({ dims: ["天气"] })], POOL)[0]] };
ok(buildRows([her0, two], null, "", null, "").filter((r) => r.type === "tools").length === 2, "一步里抽了两回：两行（她说的“抽了很多次就分行跳出来”）");
ok(dayTranscript([her0, step], () => null).includes(`[光义${d1.note}]`) && buildRecapAsk({ msgs: [her0, step, after], memeLookup: () => null }).content.map((b) => b.text || "").join("\n").includes(`[光义${d1.note}]`),
  "写日记的摘录、抄提要的记录里：“[光义抽了一签 · …]”");
ok(makePreview([her0, { ...step, items: [], raw: "" }]) === `[${d1.note}]`, "历史对话的预览：一个字没说只抽了签，写那一行小字");

// =====================================================
// 名帖里的【秘戏钱匣】
// =====================================================
const sec = qxSection(POOL);
ok(qxSection(emptyPool()) === "" && qxSection(readPool(JSON.stringify({ v: 1, dims: [{ name: "空", tags: [] }] }))) === "", "签库空着：没有这一段");
ok(sec.startsWith("【秘戏钱匣】\n") && sec.includes("维度有：天气、点心、去处、单一。") && ["qx_draw", "发给光义", "一行小字", "打电话的时候抽不了", "你们俩自己定"].every((w) => sec.includes(w)),
  "那一段：写着维度有哪几样、她会丢签过来、你也能自己抽（qx_draw）、她看得到那一行小字、打电话抽不了");
ok(qxSection(rm.pool) === sec && qxSection(add1.pool) === sec && qxSection(off1) === sec && qxSection(bareDim) === sec && !/\d+ 条/.test(sec), "删签、加签、关掉一样、把一样里的签删光，都不动这一段（不写条数）：缓存接得上");
ok(qxSection(readPool(JSON.stringify({ v: 1, dims: [...POOL.dims, { name: "新的一样", tags: ["x"] }] }))) !== sec, "维度变了（换了一份签库）才变");
const sysArgs = { now: new Date(2026, 9, 21, 23, 0), memeList: [], hisAvatarName: "", memDocs: [] };
const plain = buildSystem(sysArgs);
const withQ = buildSystem({ ...sysArgs, qx: sec });
ok(buildSystem({ ...sysArgs, qx: "" }).staticText === plain.staticText, "不传、传空的：名帖一个字不变");
ok(withQ.staticText === plain.staticText.replace("【回复格式】", sec + "\n\n【回复格式】") && withQ.staticText.indexOf("【日记本】") < withQ.staticText.indexOf("【秘戏钱匣】") && withQ.nowNote === plain.nowNote,
  "签库有签：【日记本】后面、【回复格式】前面多这一段，别的一个字不差，【此刻】不变");
const gamed = buildSystem({ ...sysArgs, qx: sec, game: { board: null } });
ok(gamed.staticText.indexOf("【秘戏钱匣】") < gamed.staticText.indexOf("【江湖棋局】"), "摆着棋盘的：【秘戏钱匣】排在【江湖棋局】前头");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
