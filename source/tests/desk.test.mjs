// 狐宇宙那一页（他屋里的一张书案，见 src/desk/parts.js）：信笺上摆哪几轮、一轮里写什么（他的字、几行小字），已阅存哪儿、怎么存，
// 他醒来寄给他的狐宇宙那段对话里收起来的那几轮、它们回的便签不寄（前情提要抄过的那一截不动）；推近花盆、铜镜的卡片上写什么。
// 闹钟那头醒在屋里那一回真的照这个寄（askRoom，假的那边）。话、存档都是编的。
import { DESK_READ, readRead, packRead, roundsOf, wakeContext, gardenCard, dressingCard, deskCards, cn, boxOf, richOf } from "../src/desk/parts.js";
import { buildMessages } from "../src/prompt/messages.js";
import { askRoom, gather } from "../alarm/wake.js";
import { GardenEngine } from "../vendor/garden/garden-engine.ts";
import { DressingEngine } from "../vendor/dressing/dressing-engine.ts";
import { lookLine as alarmLookLine } from "../alarm/dressing.js";
import { lookLine } from "../src/room.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 狐宇宙那段对话（编的）：她先留了两张便签，他醒了一回（两步：浇水、写字），她又留一张，他醒了一回什么也没写，
// 又醒一回开了一段新对话去找她、在屋里写了一句，又醒一回只换了一身；最后她又留了一张（还没回）
const T = (h, m = 0) => new Date(2026, 10, 5, h, m).getTime();
const fox = [
  { id: "n1", role: "her", ts: T(8), text: "冰箱里有布丁", note: true },
  { id: "n2", role: "her", ts: T(8, 5), text: "记得浇花", note: true },
  { id: "w1", role: "event", who: "him", kind: "wake", ts: T(10) },
  { id: "m1", role: "him", ts: T(10, 1), items: [], calls: [{ name: "play_garden", note: "去园子里浇了水" }] },
  { id: "m2", role: "him", ts: T(10, 2), raw: "布丁吃了，**甜**\n[SPLIT]\n[MEME:fox_reading_book.jpg]\n[SPLIT]\n[VOICE][laughs] 花也浇了[/VOICE]", items: [{ type: "text", text: "布丁吃了，**甜**" }, { type: "meme", file: "fox_reading_book.jpg" }, { type: "voice", text: "[laughs] 花也浇了" }] },
  { id: "n3", role: "her", ts: T(12), text: "收到", note: true },
  { id: "w2", role: "event", who: "him", kind: "wake", ts: T(14), quiet: true },
  { id: "w3", role: "event", who: "him", kind: "wake", ts: T(16), go: { chat: "c9", title: "布丁", how: "new" } },
  { id: "m3", role: "him", ts: T(16, 1), raw: "出门找你", items: [{ type: "text", text: "出门找你" }], tools: ["tavily"] },
  { id: "av", role: "event", who: "her", ts: T(16, 30), av: null },
  { id: "w4", role: "event", who: "him", kind: "wake", ts: T(18) },
  { id: "m4", role: "him", ts: T(18, 1), items: [], calls: [{ name: "play_dressing_room", note: "在妆台前换了换行头" }, { name: "play_dressing_room", note: "在妆台前换了换行头" }, { name: "luofu_nap", note: "睡了一觉 · 做了个梦" }] },
  { id: "n4", role: "her", ts: T(20), text: "晚安", note: true },
];

// ---------- 一轮一轮 ----------
const rs = roundsOf(fox);
ok(eq(rs.map((r) => r.id), ["w1", "w3", "w4"]), `一轮一个编号（醒了那一行的），什么都没留的那一回（w2）不摆（${rs.map((r) => r.id)}）`);
ok(rs[0].text === "布丁吃了，甜\n花也浇了" && eq(rs[0].lines, ["去园子里浇了水"]) && rs[0].ts === T(10),
   `一轮里：他说的话（记号拿掉）、语音条上的字（语气标签拿掉），表情包不算；后头几行小字（${JSON.stringify(rs[0])}）`);
ok(rs[1].text === "出门找你" && eq(rs[1].lines, ["用了 tavily", "开了一段新对话《布丁》找你"]), `用了什么、去了哪段对话也是小字（${JSON.stringify(rs[1].lines)}）`);
ok(rs[2].text === "" && eq(rs[2].lines, ["在妆台前换了换行头", "睡了一觉 · 做了个梦"]), `只干了事、没写字的那一回照摆，一样的小字只留一行（${JSON.stringify(rs[2])}）`);
ok(rs.every((r) => r.read === false) && roundsOf(fox, new Set(["w3"]))[1].read === true, "收起来的那几轮带着 read");
const legacy = [{ id: "h1", role: "her", ts: 1, text: "在吗" }, { id: "r1", role: "him", ts: 2, items: [{ type: "text", text: "在" }] }, { id: "r2", role: "him", ts: 3, items: [{ type: "text", text: "怎么了" }] }];
ok(eq(roundsOf(legacy).map((r) => [r.id, r.text]), [["r1", "在\n怎么了"]]), "早先狐宇宙里还能聊天那会儿手机要来的回话（前面没有醒了那一行）：自己算一轮，编号是头一条的");
ok(eq(roundsOf([{ id: "x", role: "event", who: "him", kind: "wake", ts: 5, go: { chat: "c1", title: "晚饭", how: "back" } }])[0].lines, ["去《晚饭》找你了"]) &&
   eq(roundsOf([{ id: "x", role: "event", who: "him", kind: "wake", ts: 5, quiet: true, go: { chat: "c1", title: "晚饭", how: "task" } }])[0].lines, ["去《晚饭》看了看"]),
   "回去找她、到点去找她：一行小字（没说话的那回写看了看）");
ok(eq(roundsOf([]), []) && eq(roundsOf(null), []), "空的、没有的：一轮都没有");

// ---------- 已阅存在哪儿 ----------
ok(DESK_READ === "kfs2:fox:read", "存在 kfs2:fox:read 一条里（加密了跟着云端走）");
const packed = packRead(new Set(["w1", "w3", "gone"]), new Set(["w1", "w3", "w4"]));
ok(eq(JSON.parse(packed), { v: 1, ids: ["w1", "w3"] }) && eq([...readRead(packed)], ["w1", "w3"]), `存的时候只留狐宇宙里还有的那几轮（${packed}）`);
ok(readRead(null).size === 0 && readRead("坏的").size === 0 && readRead('{"ids":[1,"",null,"a"]}').size === 1, "读不出来的、坏的：当一轮都没收");

// ---------- 他醒来寄给他的 ----------
ok(wakeContext(fox, new Set()) === fox && wakeContext(fox, null) === fox, "一轮都没收：原样寄");
const ctx1 = wakeContext(fox, new Set(["w1"]));
ok(eq(ctx1.map((m) => m.id), ["n3", "w2", "w3", "m3", "av", "w4", "m4", "n4"]), `收了头一轮：那一轮（醒了那一行、他那两条）和它回的那两张便签不寄（${ctx1.map((m) => m.id)}）`);
const ctx2 = wakeContext(fox, new Set(["w3", "w4"]));
ok(eq(ctx2.map((m) => m.id), ["n1", "n2", "w1", "m1", "m2", "n3", "w2", "av", "n4"]),
   `收了后两轮：那两轮不寄；中间那一回什么都没写的（w2）、换头像那一行、她最后那张还没回的便签照寄；w3 回的便签就是 w2 之后那一截里的（没有）（${ctx2.map((m) => m.id)}）`);
const ctx3 = wakeContext(fox, new Set(["w2"]));
ok(eq(ctx3.map((m) => m.id), fox.filter((m) => !["n3", "w2"].includes(m.id)).map((m) => m.id)), "什么都没写的那一回也能被收（纸上不摆，照理碰不到）：它回的便签一起不寄");
ok(eq(wakeContext(fox, new Set(["nope"])).map((m) => m.id), fox.map((m) => m.id)), "收的那一轮狐宇宙里已经没有了：原样寄");
const recaps = [{ id: "rc", upto: "m2", at: 9, parts: [{ text: "前面抄成的提要", t0: 1, t1: 2 }] }];
const ctx4 = wakeContext(fox, new Set(["w1", "w4"]), recaps);
ok(ctx4.slice(0, 5).map((m) => m.id).join() === "n1,n2,w1,m1,m2" && !ctx4.some((m) => m.id === "m4" || m.id === "w4") && ctx4.some((m) => m.id === "n4"),
   `前情提要抄到 m2：抄过的那一截不动（寄过去的是提要，抄到的那一条也得在），后面收起来的那一轮照样不寄（${ctx4.map((m) => m.id)}）`);
const av = { her: null, him: { type: "meme", file: "fox_reading_book.jpg" } };
const none = () => null;
const flat = (list) => JSON.stringify(buildMessages(list, av, none, none, none, none, { recaps }).messages);
ok(flat(ctx4).includes("前面抄成的提要") && !flat(ctx4).includes("在妆台前换了换行头"), "寄过去的：提要照用，收起来的那一轮的小字不在里头");

// ---------- 卡片 ----------
const day = (d) => `2026-11-${String(d).padStart(2, "0")}`;
const mem = () => {
  let st = null;
  return { st: () => st, store: { load: async () => (st ? JSON.parse(JSON.stringify(st)) : null), update: async (fn) => { const [n, r] = await fn(st ? JSON.parse(JSON.stringify(st)) : null); st = n; return r; } } };
};
ok(eq(gardenCard(null, day(5)), { sub: "钧窑六方盆", note: "园子我还没进去过。头一回进去，会得一盆魏紫。", go: [] }), "花盆：园子还没进去过");
const g = mem();
for (let d = 1; d <= 12; d++) await new GardenEngine(g.store, { today: () => day(d) }, () => 0.5).execute({ action: d % 2 ? "water" : "loosen" });
let c = gardenCard(g.st(), day(12));
ok(c.sub === "钧窑六方盆 · 魏紫" && c.note === "魏紫，抽枝展叶，照料了十二天（满三十天开花）。今天松过土了。" && eq(c.go, []), `花盆：在种哪株、到哪一步、照料了几天、今天照料过没有；没有按钮（${c.note}）`);
c = gardenCard(g.st(), day(13));
ok(c.note.endsWith("今天还没照料。"), `第二天还没照料：写还没照料（不照存档里昨天那一笔）（${c.note}）`);
for (let d = 13; d <= 30; d++) await new GardenEngine(g.store, { today: () => day(d) }, () => 0.5).execute({ action: "water" });
c = gardenCard(g.st(), day(30));
ok(c.note === "魏紫开了。《群芳谱》里收了一种。", `开了：写开了、《群芳谱》里收了几种（${c.note}）`);
ok(cn(0) === "〇" && cn(9) === "九" && cn(10) === "十" && cn(12) === "十二" && cn(20) === "二十" && cn(29) === "二十九", "几天写成汉字");

ok(eq(dressingCard(null, day(5)), { note: "妆台我还没去过。", go: ["照镜子", "衣柜", "成就"] }), "铜镜：妆台还没去过；底下照镜子、衣柜、成就三颗");
const dr = mem();
await new DressingEngine(dr.store, { today: () => day(3) }).execute({ action: "select", category: "outfit", itemId: "outfit_black_turtleneck" });
c = dressingCard(dr.st(), day(3));
ok(c.note === "今天还没完成搭配。", `换了一身、没完成：只照得出完成的那一身，写今天还没完成搭配（${c.note}）`);
await new DressingEngine(dr.store, { today: () => day(3) }).execute({ action: "complete" });
c = dressingCard(dr.st(), day(3));
ok(c.note === "今天这一身：披发、素面、不熏香；衣柜：高领黑毛衣。" && eq(c.go, ["照镜子", "衣柜", "成就"]), `完成了：今天那一身（同狐宇宙里那一行），底下三颗（${c.note}）`);
c = dressingCard(dr.st(), day(5));
ok(c.note === "今天还没完成搭配。上一回（十一月三日）：披发、素面、不熏香；衣柜：高领黑毛衣。", `第二天：今天还没完成，写上一回那一身和哪天（${c.note}）`);
await new DressingEngine(dr.store, { today: () => day(5) }).execute({ action: "select", category: "outfit", itemId: "outfit_black_turtleneck" });
ok(dressingCard(dr.st(), day(5)).note === c.note, "今天换着玩、没完成：眼下摆着的那一身不写");
const cards = deskCards({ garden: g.st(), dressing: dr.st(), today: day(5) });
ok(eq(Object.keys(cards), ["花盆", "铜镜"]), "递给那一页的卡片只有花盆、铜镜两样（别的照那一页自己写的）");
ok(alarmLookLine === lookLine, "完成的那一身写成一行：狐宇宙里那一行小字和卡片上用的是同一个");

// ---------- 闹钟那头：醒在屋里寄给他的 ----------
const kv = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => void m.set(k, v), del: async (k) => void m.delete(k), peek: (k) => (m.has(k) ? m.get(k) : null), keys: (p = "") => [...m.keys()].filter((k) => k.startsWith(p)) };
};
const cloudOf = (replies) => {
  const bodies = [];
  return { bodies, callClaude: async (body) => { bodies.push(JSON.parse(JSON.stringify(body))); return { model: body.model, usage: { input_tokens: 1, output_tokens: 1 }, ...replies.shift() }; } };
};
const said = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });
const body = async (read) => {
  const s = kv({ "kfs2:chat:hyz": JSON.stringify(fox), "kfs2:settings": JSON.stringify({ model: "claude-sonnet-4-6", maxTokens: 2048, wake: true }) });
  if (read) s.m.set(DESK_READ, packRead(new Set(read)));
  const ctx = await gather(s);
  const cloud = cloudOf([said("醒了")]);
  await askRoom({ store: s, cloud, ctx, now: T(21), dressingOpts: { today: () => day(5) }, gardenOpts: { today: () => day(5), rng: () => 0.5 } });
  return JSON.stringify(cloud.bodies[0].messages);
};
let all = await body(null);
ok(all.includes("布丁吃了") && all.includes("冰箱里有布丁") && all.includes("play_garden"), "闹钟那头：一轮都没收，狐宇宙那段对话照原样寄（他浇水那一步寄的是调用）");
let some = await body(["w1"]);
ok(!some.includes("布丁吃了") && !some.includes("冰箱里有布丁") && !some.includes("记得浇花") && some.includes("收到") && some.includes("出门找你") && some.includes("晚安"),
   "闹钟那头：收了头一轮，寄给他的里没有那一轮、它回的那两张便签；后来的便签、别的几轮照寄");
const s9 = kv({ "kfs2:chat:hyz": JSON.stringify(fox), [DESK_READ]: packRead(new Set(["w1", "w3", "w4"])) });
const ctx9 = await gather(s9);
ok(ctx9.fox.length === fox.length && ctx9.read.size === 3, "闹钟记着的狐宇宙那段对话还是整段（几点醒、欠没欠她那些照整段算），只是寄的时候不寄收起来的");

// ---------- 信匣：原来那一页上的，一样一样搬到纸上 ----------
{
  const now = new Date(2026, 10, 5, 23, 0);
  const thought = { ...fox[3], thinking: "先去浇水" };
  const early = [
    // 早先狐宇宙里还能聊天那几天：她发的字、表情包、照片、文档、语音；他回的（没有醒了那一行）
    { id: "e1", role: "her", ts: T(1), text: "在吗" },
    { id: "e2", role: "her", ts: T(1, 1), kind: "meme", file: "fox_reading_book.jpg" },
    { id: "e3", role: "her", ts: T(1, 2), kind: "photo", imgId: "p1" },
    { id: "e4", role: "her", ts: T(1, 3), kind: "doc", docId: "d1", name: "清单.md", fmt: "md", chars: 120 },
    { id: "e5", role: "her", ts: T(1, 4), kind: "voice", text: "我到家了", dur: 3 },
    { id: "e6", role: "him", ts: T(1, 5), raw: "在", items: [{ type: "text", text: "在，*抬头*" }, { type: "doc", name: "回信.md", fmt: "md", text: "# 回信\n好" }, { type: "draw", prompt: "一盏灯", title: "灯", ratio: "竖" }] },
  ];
  const msgs = early.concat(fox.slice(0, 3), [thought], fox.slice(4));
  const read = new Set(["w1", "e6"]);
  const box = boxOf(msgs, { read, now });
  const ts = (t) => box.filter((e) => e.t === t);
  ok(box[0].t === "stamp" && box[0].text === "今天 01:00", `头一样是几点（照聊天记录那一套：今天、昨天、几月几日；${box[0].text}）`);
  ok(eq(box.filter((e) => e.side).map((e) => e.side).slice(0, 5), ["her", "her", "her", "her", "her"]) && box.find((e) => e.k === "e6-0").side === "me", "她的在右（her）、他的在左（me）");
  ok(ts("meme").length === 2 && ts("meme")[0].file === "fox_reading_book.jpg" && ts("meme")[0].side === "her" && ts("meme")[1].side === "me", "表情包：她发的、他发的都摆");
  ok(ts("photo").length === 1 && ts("photo")[0].img === "p1", "照片：记着存档里那张图的编号");
  const docs = ts("doc");
  ok(docs.length === 2 && docs[0].ref === "d:d1" && docs[0].chars === 120 && docs[1].ref === "m:e6:1" && docs[1].chars === "# 回信\n好".length, `文档：她发的认文档编号，他写的认那一条、第几样（${docs.map((d) => d.ref)}）`);
  const hv = ts("voice").find((e) => e.side === "her");
  ok(hv && hv.dur === 3 && hv.copy === "我到家了" && !hv.key, "她的语音：字和几秒，没有要念的声音");
  const mv = ts("voice").find((e) => e.side === "me");
  ok(mv && mv.key === "m2.2" && mv.copy === "花也浇了" && mv.raw === "[laughs] 花也浇了", `他的语音：认念好的声音（${mv && mv.key}），复制的是念的那些字（语气标签拿掉），原文留着再念一回用`);
  const dr = ts("draw")[0];
  ok(dr && dr.key === "e6.2" && dr.img === "draw.e6.2" && dr.title === "灯" && dr.ratio === "竖", "他画的画：认画好的那张图");
  const s0 = box.find((e) => e.k === "e6-0");
  ok(s0.t === "say" && s0.seal === true && s0.copy === "在，抬头" && eq(s0.rich, [{ h: 0, parts: [{ s: "在，", b: false, i: false }, { s: "抬头", b: false, i: true }] }]),
     "早先那一轮（没有醒了那一行）收进信匣了：阅盖在头一句；字拆成一段一段（动作淡一点），复制的是摘了记号的字");
  ok(box.filter((e) => e.seal).length === 2, "只盖收进信匣的那两轮");
  const wakes = ts("notice").filter((e) => /醒了/.test(e.text));
  ok(wakes.length === 4 && wakes[0].seal === true && !wakes[1].seal, `醒了那一行照原来那一页写，那一轮已阅的盖“阅”（${wakes.map((w) => w.text + (w.seal ? "·阅" : ""))}）`);
  ok(ts("notice").some((e) => e.text === "你换回了默认头像"), "换头像那一行照写");
  const th = ts("think")[0];
  ok(th && th.text === "先去浇水" && th.side === "me", "心里话单独一样（收着，点开看）");
  ok(eq(ts("line").map((e) => e.text), ["去园子里浇了水", "用了 tavily", "在妆台前换了换行头", "在妆台前换了换行头", "睡了一觉 · 做了个梦"]), `小字一样一行（照原来那一页，一样的也照摆；${ts("line").map((e) => e.text)}）`);
  ok(box.filter((e) => e.t === "say" && e.side === "her").map((e) => e.copy).join("|") === "在吗|冰箱里有布丁|记得浇花|收到|晚安", "她的字：发的话、便签纸上留的，都在右边");
  ok(box.every((e) => typeof e.k === "string" && e.k) && new Set(box.map((e) => e.k)).size === box.length, "一样一个编号，不重");
  ok(eq(richOf("# 题\n正文"), [{ h: 1, parts: [{ s: "题", b: false, i: false }] }, { h: 0, parts: [{ s: "正文", b: false, i: false }] }]), "标题单独一段");
  const rc = boxOf(msgs, { recaps: [{ id: "r1", upto: "n3", at: Date.now(), parts: [{ upto: "n3", text: "抄的" }] }], now });
  ok(rc.some((e) => e.t === "recap" && e.id === "r1"), "抄过提要的：那一行照摆");
  const yday = boxOf(msgs, { now: new Date(2026, 10, 6, 9, 0) });
  ok(yday[0].text === "昨天 01:00", "过了一天：几点那一行跟着变成“昨天”");
  ok(eq(boxOf(null), []) && eq(boxOf([]), []), "空的也不出错");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
