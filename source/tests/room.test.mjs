// 回屋看一眼、换装便签（见 src/room.js、开发说明“回屋看一眼”那一节）：工具和名帖里那一段长什么样，看到的三样（园子、妆台、衣柜）
// 照恩师的引擎写、只读不写，便签怎么留、留多久、什么时候收；闹钟那头任务到点那一回带着、醒在屋里那一回不带，便签摆在【醒来】里、完成搭配就收。
// 园子、妆台的存档是拿恩师的引擎现跑出来的（编的日子），不是她的存档。
import {
  ROOM_TOOLS, ROOM_NAMES, ROOM_SECTION, MEMO_KEY, MEMO_NOTE, MEMO_FAIL, LOOK_FAIL, MEMO_DAYS, MEMO_GRACE, GARDEN_KEY, DRESSING_KEY,
  isRoomCall, roomSection, gardenView, dressingView, wardrobeView, runRoomCalls, liveMemos, readMemo, memoStands, memoLines, cutRoom, localDay,
} from "../src/room.js";
import { GardenEngine } from "../vendor/garden/garden-engine.ts";
import { DressingEngine } from "../vendor/dressing/dressing-engine.ts";
import { DIARY_TOOLS, DIARY_NAMES, toolCallsOf } from "../src/diaryTools.js";
import { QX_TOOLS, QX_NAMES } from "../src/qx/pool.js";
import { TOOLS as GAME_TOOLS, GAME_NAMES } from "../src/game/jianghu.js";
import { GARDEN_NAMES } from "../alarm/garden.js";
import { DRESSING_NAMES } from "../alarm/dressing.js";
import { buildSystem } from "../src/prompt/system.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildRows } from "../src/chat/rows.js";
import { dayTranscript } from "../src/diary.js";
import { makePreview } from "../src/chat/overview.js";
import { wakeSection } from "../alarm/note.js";
import { askRoom, askTask } from "../alarm/wake.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };

// 一个放在内存里的存档（手机、闹钟的存档都是这几样）
const kv = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
    peek: (k) => (m.has(k) ? m.get(k) : null),
    keys: (p = "") => [...m.keys()].filter((k) => k.startsWith(p)),
  };
};
// 引擎要的存档（照 alarm/garden.js 的 storeOf 那样，写回这一份存档）
const engineStore = (s, key) => ({
  async load() { const t = await s.get(key); return t ? JSON.parse(t) : null; },
  async update(fn) { const t = await s.get(key); const [next, value] = await fn(t ? JSON.parse(t) : null); await s.set(key, JSON.stringify(next)); return value; },
});
const day = (n) => `2026-10-${String(n).padStart(2, "0")}`;
// 照着恩师的引擎种几天：从 from 号起每天浇一回水（骰子 0.5，不会凋谢）
async function grow(s, from, days) {
  let d = from;
  const g = () => new GardenEngine(engineStore(s, GARDEN_KEY), { today: () => day(d) }, () => 0.5);
  await g().execute({ action: "open" });
  for (let i = 0; i < days; i++, d++) await g().execute({ action: "water" });
}
// 照着引擎去妆台：today 那天换上 picks（[类别, 编号]），complete 给了就完成搭配
async function dress(s, today, picks, complete = true) {
  const e = new DressingEngine(engineStore(s, DRESSING_KEY), { today: () => today });
  await e.execute({ action: "open" });
  for (const [category, itemId] of picks) await e.execute({ action: "select", category, itemId });
  if (complete) await e.execute({ action: "complete" });
  return e;
}
const parse = (t) => (t ? JSON.parse(t) : null);
const snap = (s) => JSON.stringify([...s.m].sort());

// =====================================================
// 工具
// =====================================================
ok(ROOM_TOOLS.map((t) => t.name).join() === "room_look,room_memo" && ROOM_NAMES.size === 2 && isRoomCall({ name: "room_look" }) && isRoomCall({ name: "room_memo" }) && !isRoomCall({ name: "diary_read" }) && !isRoomCall(null),
  "两样工具：room_look（回屋看一眼）、room_memo（留换装便签）");
const others = [...DIARY_NAMES, ...QX_NAMES, ...GAME_NAMES, ...GARDEN_NAMES, ...DRESSING_NAMES];
ok(!others.some((n) => ROOM_NAMES.has(n)) && new Set([...DIARY_TOOLS, ...QX_TOOLS, ...GAME_TOOLS, ...ROOM_TOOLS].map((t) => t.name)).size === DIARY_TOOLS.length + QX_TOOLS.length + GAME_TOOLS.length + 2,
  "跟翻日记、抽签、江湖棋局、屋里的园子妆台那几样不重名");
const lookT = ROOM_TOOLS[0];
const memoT = ROOM_TOOLS[1];
ok(JSON.stringify(lookT.input_schema.properties.what.enum) === '["garden","dressing","wardrobe","pindou"]' && lookT.input_schema.required.join() === "what" && lookT.description.includes("只能看、动不了") && lookT.description.includes("一行小字"),
  "room_look：what 挑园子、妆台、衣柜、拼豆板一样（拼豆板 10 月 25 日添的，见 tests/pindou.test.mjs）；说明里写着只能看、她那边冒一行小字");
ok(memoT.input_schema.required.join() === "text" && memoT.description.includes("只在她明说要你下回在妆台穿什么的时候用，平常用不着") && memoT.description.includes(`“${MEMO_NOTE}”`) && memoT.description.includes("最多三天") && MEMO_NOTE === "记录了下次换装偏好",
  "room_memo：只在她明说要他下回穿什么的时候用（她 02:41 定的：说明书里写死）；她那边那一行是她的原话“记录了下次换装偏好”；管到下一回完成搭配，最多三天");

// =====================================================
// 名帖里的【你的屋子】
// =====================================================
ok(roomSection(false) === "" && roomSection(true) === ROOM_SECTION && ROOM_SECTION.startsWith("【你的屋子】\n"), "“他自己醒”关着没有这一段，开着是固定的那一段（屋里眼下的样子不写进来，缓存接得上）");
ok(["园子", "妆台", "room_look", "不是你身上真穿着的", "只在你自己在屋里醒着的时候能玩", "动不了", "一行小字", "打电话"].every((w) => ROOM_SECTION.includes(w)),
  "那一段：屋里有园子、妆台；那一身是游戏里的；只在屋里醒着的时候能玩，聊天里只能 room_look 回屋看一眼；她看得到一行小字；打电话的时候回不了屋");
ok(!["便签", "room_memo", "答应", "换装偏好"].some((w) => ROOM_SECTION.includes(w)), "名帖里一个字不提便签（她 02:41 定的：不然对话长了他会一直惦记）");
ok(!/\d+ 天|照料了|今天完成/.test(ROOM_SECTION), "名帖里不写屋里眼下的样子（她定的：平时不带，想看再去翻）");
const sysArgs = { now: new Date(2026, 9, 22, 3, 0), memeList: [], hisAvatarName: "", memDocs: [] };
const plain = buildSystem(sysArgs);
const withR = buildSystem({ ...sysArgs, room: ROOM_SECTION });
const both = buildSystem({ ...sysArgs, room: ROOM_SECTION, qx: "【秘戏钱匣】\n编的", game: { board: null } });
ok(buildSystem({ ...sysArgs, room: "" }).staticText === plain.staticText && withR.nowNote === plain.nowNote, "不传、传空的：名帖一个字不变；【此刻】不变");
ok(withR.staticText === plain.staticText.replace("【回复格式】", ROOM_SECTION + "\n\n【回复格式】") && withR.staticText.indexOf("【日记本】") < withR.staticText.indexOf("【你的屋子】"),
  "开着：【日记本】后面多这一段，别的一个字不差");
ok(both.staticText.indexOf("【日记本】") < both.staticText.indexOf("【你的屋子】") && both.staticText.indexOf("【你的屋子】") < both.staticText.indexOf("【秘戏钱匣】") && both.staticText.indexOf("【秘戏钱匣】") < both.staticText.indexOf("【江湖棋局】"),
  "排的次序：【日记本】【你的屋子】【秘戏钱匣】【江湖棋局】");

// =====================================================
// 园子
// =====================================================
{
  const v0 = await gardenView(null, day(21));
  ok(v0.startsWith("【你屋里·园子】") && v0.includes("院子你还没进去过：头一回在屋里醒着去园子，会送你一盆魏紫。") && v0.includes("怎么玩：一个纯文字园艺小游戏") && !v0.includes("群芳谱\n"),
    `没进过园子：照实说，再写怎么玩（${v0.split("\n")[2]}）`);
  const s = kv();
  await grow(s, 19, 3); // 19、20、21 号各浇一回
  const before = snap(s);
  const v = await gardenView(parse(s.m.get(GARDEN_KEY)), day(21));
  ok(v.includes("眼下：\n牡丹 · 魏紫") && v.includes("已完成 3 个有效照料日 / 30") && v.includes("今日已浇水") && v.includes("群芳谱\n1. ？？？") && v.includes("当前仅可培育：牡丹 · 魏紫。") && v.includes("尚未解锁任何成就。"),
    "种了三天：眼下（魏紫、第几天、今天浇过了）、《群芳谱》、能种哪些、成就，都是引擎里的字");
  ok(v.includes("只能看，动不了：浇水、松土、修剪、赏花，只在你自己在屋里醒着的时候。") && v.trim().endsWith("未解锁成就不剧透。"), "开头写着只能看；最后是怎么玩（引擎的说明）");
  const v2 = await gardenView(parse(s.m.get(GARDEN_KEY)), day(22));
  ok(v2.includes("今日尚未照料") && snap(s) === before, "第二天看：今天还没照料（引擎把昨天的记号清掉，只在副本上）；存档一个字没动");
  // 种了快半年：引擎看的时候会顺手点亮“半年”的成就，那只在副本上，不算数也不给他看
  const old = JSON.parse(s.m.get(GARDEN_KEY));
  old.firstGardenDate = "2026-03-01";
  s.m.set(GARDEN_KEY, JSON.stringify(old));
  const b2 = snap(s);
  const v3 = await gardenView(old, day(21));
  ok(!v3.includes("成就解锁") && v3.includes("尚未解锁任何成就。") && snap(s) === b2, "看的时候引擎顺手判的成就（按日子算的）不算数、不给他看，存档不动");
  // 满三十天开花
  const s30 = kv();
  await grow(s30, 1, 30);
  const v30 = await gardenView(parse(s30.m.get(GARDEN_KEY)), day(30));
  ok(v30.includes("牡丹 · 魏紫已经栽成") && v30.includes("1. 牡丹 · 魏紫——") && v30.includes("可选培育品种"), "开了花：栽成了、《群芳谱》里收了魏紫、能挑下一种了");
}

// =====================================================
// 妆台、衣柜
// =====================================================
{
  const v0 = await dressingView(null, day(21));
  ok(v0.startsWith("【你屋里·妆台】") && v0.includes("妆台你还没去过。") && v0.includes("怎么玩：一个给 AI 自己玩的纯文字梳妆换装系统"), "没去过妆台：照实说，再写怎么玩");
  const s = kv();
  const e = await dress(s, day(21), [["outfit", "outfit_black_turtleneck"]]);
  // 完成以后又换着玩（光了脚，没完成）：妆台前眼下摆着的这一身不给他看（同镜子：只照得出完成的那一身）
  await e.execute({ action: "select", category: "shoes", itemId: "shoes_barefoot" });
  const before = snap(s);
  const v = await dressingView(parse(s.m.get(DRESSING_KEY)), day(21));
  ok(v.includes("今天完成的那一身\n梳发：披发\n妆面：素面\n熏香：不熏香\n衣柜：高领黑毛衣\n下装：无\n鞋履：无") && !v.includes("跣足"), "今天完成过：写完成的那一身；完成以后换着玩的（光脚）不写");
  ok(v.includes("这是妆台小游戏里搭的那一身，不是你这会儿真穿着的。") && v.includes("已解锁成就") && v.includes("累计成就：") && v.includes("怎么玩：") && snap(s) === before,
    "写明是游戏里搭的；成就、攒到的怪东西、怎么玩；存档一个字没动");
  const v2 = await dressingView(parse(s.m.get(DRESSING_KEY)), day(22));
  ok(v2.includes("今天还没完成搭配。") && v2.includes("上一回完成的那一身（10 月 21 日）\n梳发：披发") && v2.includes("衣柜：高领黑毛衣") && !v2.includes("今天完成的那一身"),
    "第二天还没完成：照实说，再写上一回完成的那一身（哪天）");
  const fresh = kv();
  await dress(fresh, day(21), [], false);
  const v3 = await dressingView(parse(fresh.m.get(DRESSING_KEY)), day(21));
  ok(v3.includes("今天还没完成搭配。") && !v3.includes("上一回完成的那一身"), "从来没完成过：只说今天还没完成");

  const w = wardrobeView(parse(s.m.get(DRESSING_KEY)));
  ok(w.startsWith("【你屋里·衣柜】") && ["梳发：", "妆面：", "熏香：", "衣柜：", "下装：", "鞋履：", "配饰："].every((x) => w.includes("\n" + x) || w.includes(x)) && w.includes("高领黑毛衣") && w.includes("跣足") && w.includes("不穿"),
    "衣柜：一样一行，有哪些（高领黑毛衣、跣足、不穿……）");
  // 10 月 23 日她添的那一批（妆台 0.3.0）：每一栏都在，“不穿”还在最后
  const w0 = wardrobeView(null);
  const line = (k) => w0.split("\n").find((x) => x.startsWith(k + "：")) || "";
  ok(line("梳发").endsWith("湿发、单侧披发、松散低盘发") && line("衣柜").includes("、哥特黑婚纱、不穿") && line("衣柜").includes("黄金珠链内衣") && line("下装").endsWith("海浪曳地鱼尾蓝纱裙、不穿") && line("下装").includes("小猪粉波点内裤") && line("配饰").includes("黄金龙脊骨背链") && line("配饰").endsWith("素色发带") && !w0.includes("龙脊谷"),
    `衣柜：她 10 月 23 日添的都在，“不穿”还在最后（${line("梳发")}｜${line("下装")}）`);
  ok(line("梳发").split("、").length === 12 && line("衣柜").split("、").length === 39 && line("下装").split("、").length === 16 && line("配饰").split("、").length === 50, "衣柜：发型 12、衣柜 39、下装 16、配饰 50");
  {
    const pig = kv();
    await dress(pig, day(21), [["outfit", "outfit_piggy"], ["hair", "hair_loose_low_bun"]]);
    const pv = await dressingView(parse(pig.m.get(DRESSING_KEY)), day(21));
    ok(pv.includes("衣柜：小猪套装") && pv.includes("梳发：松散低盘发") && pv.includes("淀粉肠的呼唤——穿上小猪套装。") && pv.includes("温柔人夫——选择松散低盘发。") && /已解锁成就 \d+ \/ 60/.test(pv),
      "妆台：新衣服穿得上，新成就点得亮（一共 60 个）");
  }
  const swim = (st) => wardrobeView(st).includes("游泳镜");
  const st = parse(s.m.get(DRESSING_KEY));
  ok(st.unlockedRewards.length > 0 ? swim(st) && wardrobeView(st).includes("游泳镜（攒成就换来的）") : true, "攒成就换来的怪东西在衣柜里，标着是攒来的");
  ok(!swim({ ...st, unlockedRewards: [] }) && !wardrobeView(st).includes("✓"), "没攒到的不写；不标哪件在身上");
  ok(wardrobeView(null).includes("妆台你还没去过，衣柜里一开始就有这些：") && wardrobeView(null).includes("高领黑毛衣"), "没去过妆台：衣柜里一开始就有的照样列出来");
}

// =====================================================
// 替他办（手机那头的 settleCalls、闹钟任务到点那一回都走这儿）
// =====================================================
{
  const s = kv();
  await grow(s, 20, 2);
  await dress(s, day(21), [["outfit", "outfit_black_turtleneck"]]);
  const before = snap(s);
  const io = { get: s.get, set: s.set, today: day(21), at: 1761100000000, chat: "c1", title: "布丁", on: true };
  const call = (id, name, input) => ({ id, name, input });
  const calls = [call("t1", "room_look", { what: "garden" }), call("t2", "room_look", { what: "dressing" }), call("t3", "room_look", { what: "wardrobe" }), call("t4", "room_look", { what: "garden" })];
  const out = await runRoomCalls(calls, io);
  ok(out.map((c) => c.note).join("|") === "回屋看了看园子|回屋看了看妆台|回屋翻了翻衣柜|" && out.every((c) => c.err === false), `她那边的小字：看园子、看妆台、翻衣柜；一步里看了两回园子只留一行（${out.map((c) => c.note).join("|")}）`);
  ok(out[0].out.startsWith("【你屋里·园子】") && out[1].out.startsWith("【你屋里·妆台】") && out[2].out.startsWith("【你屋里·衣柜】") && snap(s) === before, "看到的字只给他（结果里），存档一个字没动");
  const bad = await runRoomCalls([call("b1", "room_look", { what: "kitchen" }), call("b2", "room_look", {})], io);
  ok(bad.every((c) => c.err) && bad[0].note === LOOK_FAIL && bad[0].out.includes("garden") && bad[1].note === "", "what 写错了、没写：递回去该写什么，小字“没看成”（一样的只留一行）");

  // 便签
  const m = await runRoomCalls([call("toolu_m1", "room_memo", { text: "  答应了卿卿\n下次穿高领黑毛衣 " })], io);
  const memo = JSON.parse(s.m.get(MEMO_KEY + "toolu_m1") || "null");
  ok(m[0].note === MEMO_NOTE && !m[0].err && memo && memo.v === 1 && memo.text === "答应了卿卿 下次穿高领黑毛衣" && memo.chat === "c1" && memo.title === "布丁" && memo.at === 1761100000000,
    `留便签：记在 kfs2:fox:memo:<编号>（写的那句、哪段对话、他那一条的时间），她那边一行“记录了下次换装偏好”（${JSON.stringify(memo)}）`);
  ok(m[0].out.includes("答应了卿卿 下次穿高领黑毛衣") && m[0].out.includes("第一眼就看得到") && m[0].out.includes("最多三天") && !m[0].out.includes("关着"), "递给他：留好了、写的什么、下回在屋里醒来第一眼看得到、最多三天");
  const s2 = kv();
  const m2 = await runRoomCalls([call("toolu_m1", "room_memo", { text: "  答应了卿卿\n下次穿高领黑毛衣 " })], { ...io, get: s2.get, set: s2.set });
  ok(s2.m.get(MEMO_KEY + "toolu_m1") === s.m.get(MEMO_KEY + "toolu_m1") && m2[0].out === m[0].out, "两台设备替他留同一张：钥匙、写进去的一样（记的是他那一条的时间，不是各自的钟）");
  const long = await runRoomCalls([call("toolu_m2", "room_memo", { text: "长".repeat(80) }), call("toolu_m6", "room_memo", { text: "😀".repeat(80) })], io);
  ok(JSON.parse(s.m.get(MEMO_KEY + "toolu_m2")).text === "长".repeat(60) + "…" && !long[0].err, "写得太长：留前六十个字");
  ok(JSON.parse(s.m.get(MEMO_KEY + "toolu_m6")).text === "😀".repeat(60) + "…", "表情这种占两格的字一个一个数，不截成半个");
  const empty = await runRoomCalls([call("toolu_m3", "room_memo", { text: "   " }), call("toolu_m4", "room_memo", {})], io);
  ok(empty.every((c) => c.err) && empty[0].note === MEMO_FAIL && empty[1].note === "" && !s.m.has(MEMO_KEY + "toolu_m3") && !s.m.has(MEMO_KEY + "toolu_m4"), "便签上没写字：不留，小字“没记成”（一样的只留一行）");
  const off = await runRoomCalls([call("toolu_m5", "room_memo", { text: "下次穿旗袍" })], { ...io, on: false });
  ok(off[0].out.includes("关着“他自己醒”") && s.m.has(MEMO_KEY + "toolu_m5"), "“他自己醒”关着：照样留，告诉他眼下不会在屋里醒");

  // 别的不碰；办过的不再办
  const mixed = [call("d1", "diary_read", { dates: [] }), { ...call("t9", "room_look", { what: "garden" }), out: "早办过了", err: false, note: "回屋看了看园子" }, call("t10", "room_look", { what: "garden" })];
  const mo = await runRoomCalls(mixed, io);
  ok(mo[0] === mixed[0] && mo[1] === mixed[1] && mo[2].note === "回屋看了看园子" && typeof mo[2].out === "string", "翻日记那几样、办过的不碰，只办还没办的");

  // 存档出了岔子
  const broken = { ...io, get: async () => { throw new Error("坏了"); }, set: async () => { throw new Error("坏了"); } };
  const br = await runRoomCalls([call("e1", "room_look", { what: "dressing" }), call("e2", "room_memo", { text: "下次穿旗袍" })], broken);
  ok(br[0].err && br[0].note === LOOK_FAIL && br[1].err && br[1].note === MEMO_FAIL && br[0].out.includes("回不了屋"), "存档出了岔子：照实递回去，小字“没看成”“没记成”");
  for (const code of ["badlogin", "secret"]) {
    let threw = null;
    try {
      await runRoomCalls([call("e3", "room_look", { what: "garden" })], { ...io, get: async () => { throw Object.assign(new Error("x"), { code }); } });
    } catch (e) {
      threw = e;
    }
    ok(threw && threw.code === code, `闹钟那头密码不对、凭据坏了（${code}）：往外抛（同园子、妆台）`);
  }

  // 截断了
  const cl = cutRoom(call("c1", "room_look", { what: "garden" }));
  const cm = cutRoom(call("c2", "room_memo", { text: "x" }));
  ok(cl.err && cl.note === LOOK_FAIL && cl.out.includes("没回成屋") && cm.err && cm.note === MEMO_FAIL && cm.out.includes("便签没留成"), "写到长度上限被截断：不替他办，小字“没看成”“没记成”");
  ok(toolCallsOf([{ type: "tool_use", id: "x", name: "room_look", input: { what: "garden" } }, { type: "tool_use", id: "y", name: "play_garden", input: {} }], ROOM_NAMES).map((c) => c.name).join() === "room_look", "从回话里挑他调的：认这两样");
}

// =====================================================
// 便签留多久
// =====================================================
{
  const now = Date.UTC(2026, 9, 22, 12);
  const H = 60 * 60 * 1000;
  const item = (key, at, text = "下次穿旗袍") => ({ key, text: JSON.stringify({ v: 1, text, chat: "c", title: "t", at }) });
  const r = liveMemos([item("k3", now - 1 * H, "后留的"), item("k1", now - 71 * H, "先留的"), item("k2", now - 73 * H), { key: "k4", text: "不是 JSON" }, { key: "k5", text: JSON.stringify({ v: 1, text: "", at: now }) }], now);
  ok(r.live.map((m) => m.key).join() === "k1,k3" && r.live[0].text === "先留的" && r.stale.sort().join() === "k2,k4,k5" && MEMO_DAYS === 3,
    "还管着的：三天以内的，按留的先后排；过了三天的、坏了的、空的该收");
  ok(readMemo(null) === null && readMemo('{"text":"x","at":"昨天"}') === null && readMemo(JSON.stringify({ text: "x", at: 1 })).chat === "", "读便签：坏的不认，缺的补空");
  ok(liveMemos([item(MEMO_KEY + "toolu_9", now)], now).live[0].id === "toolu_9", "每张带着他调 room_memo 那一下的编号（钥匙后半截）");

  // 还算不算数：留它的那一步还在那段对话眼前这一支上
  const memo = { id: "toolu_m", text: "下次穿旗袍", chat: "c1", at: now - 2 * H };
  const step = (id, name = "room_memo") => ({ id: "h" + id, role: "him", ts: 1, items: [], calls: [{ id, name, input: { text: "x" }, out: "好", note: MEMO_NOTE }] });
  const her = { id: "q1", role: "her", ts: 0, text: "记得下次穿旗袍" };
  ok(memoStands(memo, [her, step("toolu_m")], now), "留它的那一步还在：算数");
  ok(!memoStands(memo, [{ ...her, alts: [[her, step("toolu_m")]] }, step("toolu_other")], now) && !memoStands(memo, [her, step("toolu_m", "room_look")], now),
    "她改了话、重新回答（原来那一支收进 alts，眼前这一支上没有这一步）：不算了");
  ok(!memoStands(memo, null, now) && !memoStands(memo, [], now), "那段对话没了、空了：不算了");
  ok(memoStands({ ...memo, at: now - MEMO_GRACE + 60 * 1000 }, null, now) && MEMO_GRACE === 30 * 60 * 1000, "刚留的半个钟头里不查（手机先存便签、再存对话，闹钟可能先拉到便签）");
  const ls = memoLines([{ text: "下次穿旗袍", at: 1 }, { text: "下次穿西装", at: 2 }, { text: "下次穿旗袍", at: 3 }]);
  ok(ls.map((m) => m.at).join() === "2,3", "写的一样的只摆一张（留得晚的那张），照先后排");
}

// =====================================================
// 聊天里、提要和日记的记录里、预览：照翻日记那一行的路子（认 note）
// =====================================================
{
  const him = { id: "h1", role: "him", ts: 2, items: [{ type: "text", text: "我回屋看看。" }], raw: "我回屋看看。", calls: [{ id: "t1", name: "room_look", input: { what: "garden" }, out: "【你屋里·园子】……眼下：魏紫", err: false, note: "回屋看了看园子" }, { id: "t2", name: "room_memo", input: { text: "答应了卿卿下次穿旗袍" }, out: "便签留好了", err: false, note: MEMO_NOTE }] };
  const msgs = [{ id: "q1", role: "her", ts: 1, text: "你的花怎么样了" }, him];
  const rows = buildRows(msgs, null);
  const lines = rows.filter((r) => r.type === "tools").map((r) => r.text);
  ok(lines.join("|") === `回屋看了看园子|${MEMO_NOTE}`, `聊天里：两行小字（${lines.join("|")}）`);
  const shown = rows.filter((r) => r.type === "tools" || (r.item && r.item.type === "text")).map((r) => r.text || r.item.text).join("\n");
  ok(!shown.includes("眼下：魏紫") && !shown.includes("答应了卿卿下次穿旗袍"), "她看得见的那几行里没有他看到的字、没有便签上写的");
  const { messages } = buildMessages(msgs, { her: null, him: null }, () => null, () => null, () => null, () => null, {});
  const flat = JSON.stringify(messages);
  ok(flat.includes('"name":"room_look"') && flat.includes("【你屋里·园子】") && flat.includes('"name":"room_memo"'), "寄给他：调了哪两样、看到了什么（他下回还记得）");
  ok(dayTranscript(msgs).includes("[光义回屋看了看园子]") && dayTranscript(msgs).includes(`[光义${MEMO_NOTE}]`) && !dayTranscript(msgs).includes("答应了卿卿"), "写日记的摘录：照那两行小字写");
  const quietHim = { ...him, items: [], raw: "" };
  ok(makePreview(msgs) === "我回屋看看。" && makePreview([msgs[0], quietHim]) === "[回屋看了看园子]", `预览：说了话照说的写；一个字没说、只回屋看了一眼，写那一行小字（${makePreview([msgs[0], quietHim])}）`);
}

// =====================================================
// 闹钟那头：任务到点那一回带着、醒在屋里那一回不带；便签摆在【醒来】里，完成搭配就收
// =====================================================
{
  const ctxOf = (wake = true) => ({ settings: { model: "claude-sonnet-4-6", maxTokens: 2048, wake }, names: { her: "", him: "" }, avatars: { her: null, him: { type: "meme", file: "fox_reading_book.jpg" } }, memDocs: [], index: [], fox: [], recaps: [], herLast: null, wakes: [], extras: [] });
  const cloudOf = (replies) => {
    const bodies = [];
    return {
      bodies,
      callClaude: async (body) => {
        bodies.push(JSON.parse(JSON.stringify(body)));
        const r = replies.shift();
        if (!r) throw new Error("没排回话");
        return { model: body.model, usage: { input_tokens: 1, output_tokens: 1 }, ...r };
      },
    };
  };
  const use = (id, name, input) => ({ type: "tool_use", id, name, input });
  const said = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });
  const names = (b) => (b.tools || []).map((t) => t.name);
  const sys = (b) => (Array.isArray(b.system) ? b.system.map((x) => x.text).join("") : b.system);
  const lastText = (b) => b.messages[b.messages.length - 1].content.map((x) => x.text || "").join("\n");
  const results = (b) => b.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((x) => x.type === "tool_result");
  const opts = { dressingOpts: { today: () => day(21) }, gardenOpts: { today: () => day(21), rng: () => 0.5 } };
  const chat = { id: "c1", title: "布丁", msgs: [{ id: "h1", role: "her", ts: 1, text: "我九点回" }] };

  // 任务到点：醒在平常那段对话里，同手机那头带着这两样（排在翻日记、抽签后面），名帖里有【你的屋子】；他看了园子、留了便签都替他办
  const s = kv();
  await grow(s, 20, 2);
  let cloud = cloudOf([{ stop_reason: "tool_use", content: [use("tk1", "room_look", { what: "garden" }), use("tk2", "room_memo", { text: "答应了卿卿下次穿旗袍" })] }, said("人呢")]);
  let b = await askTask({ store: s, cloud, ctx: ctxOf(), task: { key: "kfs2:fox:task:x", raw: "+5m", set: Date.now() }, chat });
  const want = [...DIARY_TOOLS, ...QX_TOOLS, ...ROOM_TOOLS].map((t) => t.name).join();
  ok(names(cloud.bodies[0]).join() === want && sys(cloud.bodies[0]).includes("【你的屋子】"), `任务到点：工具同手机那头（翻日记、抽签、回屋这两样，次序一样），名帖里有【你的屋子】（${names(cloud.bodies[0]).join()}）`);
  const rs = results(cloud.bodies[1]);
  const memo = JSON.parse(s.m.get(MEMO_KEY + "tk2") || "null");
  const rowNotes = b.puts[0].rows.flatMap((r) => (r.calls || []).map((c) => c.note)).filter(Boolean);
  ok(rs.length === 2 && JSON.stringify(rs[0].content).includes("【你屋里·园子】") && memo && memo.chat === "c1" && memo.title === "布丁" && memo.text === "答应了卿卿下次穿旗袍" && rowNotes.join("|") === `回屋看了看园子|${MEMO_NOTE}`,
    `任务到点那一回他回屋看了一眼、留了便签：都替他办（便签记着哪段对话），那段对话里两行小字（${rowNotes.join("|")}）`);
  // 截断了：不替他办
  cloud = cloudOf([{ stop_reason: "max_tokens", content: [{ type: "text", text: "写着写着" }, use("tk3", "room_look", { what: "garden" })] }]);
  b = await askTask({ store: kv(), cloud, ctx: ctxOf(), task: { key: "kfs2:fox:task:y", raw: "+5m", set: Date.now() }, chat });
  ok(b.puts[0].rows.flatMap((r) => (r.calls || []).map((c) => c.note)).join("|") === LOOK_FAIL, "任务到点那一回截断了：不替他办，一行“没看成”");
  // “他自己醒”关着的那份设置（闹钟不会这样叫他，防着）：名帖里没有那一段，工具照带
  cloud = cloudOf([said("在吗")]);
  await askTask({ store: kv(), cloud, ctx: ctxOf(false), task: { key: "kfs2:fox:task:z", raw: "+5m", set: Date.now() }, chat });
  ok(!sys(cloud.bodies[0]).includes("【你的屋子】") && names(cloud.bodies[0]).includes("room_look"), "设置里关着：名帖里没有【你的屋子】，工具照带（同手机那头）");

  // 醒在屋里：不带这两样（他就在屋里），名帖跟任务到点那一回一个字不差
  const r0 = kv();
  cloud = cloudOf([said("醒了")]);
  const c0 = cloudOf([said("在吗")]);
  await askRoom({ store: r0, cloud, ctx: ctxOf(), ...opts });
  await askTask({ store: kv(), cloud: c0, ctx: ctxOf(), task: { key: "kfs2:fox:task:w", raw: "+5m", set: Date.now() }, chat });
  ok(!names(cloud.bodies[0]).some((n) => ROOM_NAMES.has(n)) && names(cloud.bodies[0]).includes("play_dressing_room") && sys(cloud.bodies[0]) === sys(c0.bodies[0]),
    "醒在屋里：不带回屋看、留便签那两样（屋里的园子、妆台照带）；名帖跟聊天那头一个字不差");
  ok(!lastText(cloud.bodies[0]).includes("妆台上压着"), "没有便签：【醒来】里不提");

  // 有一张便签：摆在【醒来】里；他这一回完成了搭配，便签收起来
  const now = Date.now();
  const H = 60 * 60 * 1000;
  // 那段对话（留便签的那几步在眼前这一支上）
  const chatWith = (...ids) => JSON.stringify([{ id: "q1", role: "her", ts: 1, text: "记得下次穿旗袍" }, ...ids.map((id, i) => ({ id: "h" + i, role: "him", ts: 2 + i, items: [], calls: [{ id, name: "room_memo", input: { text: "x" }, out: "好", note: MEMO_NOTE }] }))]);
  const memoOf = (text, chat, title, at) => JSON.stringify({ v: 1, text, chat, title, at });
  const r1 = kv({
    [MEMO_KEY + "m1"]: memoOf("答应了卿卿下次穿旗袍", "c1", "布丁", now - 2 * H),
    [MEMO_KEY + "old"]: memoOf("早就过期的那张", "c1", "布丁", now - 4 * 24 * H),
    "kfs2:chat:c1": chatWith("m1", "old"),
  });
  cloud = cloudOf([
    { stop_reason: "tool_use", content: [use("w1", "play_dressing_room", { action: "select", category: "outfit", itemId: "outfit_qipao" }), use("w2", "play_dressing_room", { action: "complete" })] },
    said("穿上了"),
  ]);
  await askRoom({ store: r1, cloud, ctx: ctxOf(), now, ...opts });
  const woke = lastText(cloud.bodies[0]);
  ok(woke.includes("妆台上压着你自己留的一张便签（跟她聊天的时候留的，管到你下一回完成搭配为止）：") && woke.includes("“答应了卿卿下次穿旗袍”") && woke.includes("在《布丁》里") && !woke.includes("早就过期的那张"),
    "醒在屋里：【醒来】里摆着那张便签（写的什么、哪段对话里留的）；过了三天的不摆");
  ok(woke.indexOf("妆台上压着") < woke.indexOf("她还没在开封府里说过话"), "便签摆在前头（他第一眼看得到）");
  ok(!r1.m.has(MEMO_KEY + "m1") && !r1.m.has(MEMO_KEY + "old"), "他这一回完成了搭配：便签收起来；过了三天的那张也收了");

  // 这一回只照了照镜子、没完成：便签留着
  const r2 = kv({ [MEMO_KEY + "m2"]: memoOf("答应了卿卿下次穿旗袍", "c1", "布丁", now - H), "kfs2:chat:c1": chatWith("m2") });
  cloud = cloudOf([{ stop_reason: "tool_use", content: [use("x1", "play_dressing_room", { action: "mirror" })] }, said("照了照")]);
  await askRoom({ store: r2, cloud, ctx: ctxOf(), now, ...opts });
  ok(r2.m.has(MEMO_KEY + "m2"), "这一回没完成搭配（只照了镜子）：便签留着");
  // 今天早就完成过了（这一回完成不了）：便签留着，等明天那一身
  const r3 = kv({ [MEMO_KEY + "m3"]: memoOf("答应了卿卿下次穿旗袍", "c1", "布丁", now - H), "kfs2:chat:c1": chatWith("m3") });
  await dress(r3, day(21), [["outfit", "outfit_black_turtleneck"]]);
  cloud = cloudOf([{ stop_reason: "tool_use", content: [use("y1", "play_dressing_room", { action: "select", category: "outfit", itemId: "outfit_qipao" }), use("y2", "play_dressing_room", { action: "complete" })] }, said("今天穿过了")]);
  await askRoom({ store: r3, cloud, ctx: ctxOf(), now, ...opts });
  ok(r3.m.has(MEMO_KEY + "m3") && lastText(cloud.bodies[0]).includes("答应了卿卿下次穿旗袍"), "今天早就完成过搭配（这一回完成不了）：便签照摆、留着，等下一回完成");
  // 两张：都摆、都收
  const r4 = kv({
    [MEMO_KEY + "a"]: memoOf("先答应的", "c1", "", now - 3 * H),
    [MEMO_KEY + "b"]: memoOf("后答应的", "c2", "雪", now - H),
    "kfs2:chat:c1": chatWith("a"),
    "kfs2:chat:c2": chatWith("b"),
  });
  cloud = cloudOf([{ stop_reason: "tool_use", content: [use("z1", "play_dressing_room", { action: "complete" })] }, said("好")]);
  await askRoom({ store: r4, cloud, ctx: ctxOf(), now, ...opts });
  const w4 = lastText(cloud.bodies[0]);
  ok(w4.includes("妆台上压着你自己留的 2 张便签") && w4.indexOf("先答应的") < w4.indexOf("后答应的") && w4.includes("在《雪》里") && r4.keys(MEMO_KEY).length === 0, "两张：照留的先后都摆着，完成搭配一起收");
  // 她改了话、重新回答以后：原来那一支上的那张不摆、收掉；那段对话删了的也收；刚留的、对话还没同步过来的照摆
  const r5 = kv({
    [MEMO_KEY + "gone"]: memoOf("答应了卿卿下次穿旗袍", "c1", "布丁", now - 2 * H),
    [MEMO_KEY + "kept"]: memoOf("答应了卿卿下次穿西装", "c1", "布丁", now - H),
    [MEMO_KEY + "nochat"]: memoOf("删了的那段里留的", "c9", "没了", now - H),
    [MEMO_KEY + "fresh"]: memoOf("刚留的那张", "c8", "新的", now - 5 * 60 * 1000),
    "kfs2:chat:c1": JSON.stringify([{ id: "q1", role: "her", ts: 1, text: "记得下次穿西装", alts: [[{ id: "q1", role: "her", ts: 1, text: "记得下次穿旗袍" }, { id: "h0", role: "him", ts: 2, items: [], calls: [{ id: "gone", name: "room_memo", input: {}, out: "好" }] }]] }, { id: "h1", role: "him", ts: 3, items: [], calls: [{ id: "kept", name: "room_memo", input: {}, out: "好" }] }]),
  });
  cloud = cloudOf([said("醒了")]);
  await askRoom({ store: r5, cloud, ctx: ctxOf(), now, ...opts });
  const w5 = lastText(cloud.bodies[0]);
  ok(w5.includes("穿西装") && w5.includes("刚留的那张") && !w5.includes("穿旗袍") && !w5.includes("删了的那段里留的") && r5.m.has(MEMO_KEY + "kept") && r5.m.has(MEMO_KEY + "fresh") && !r5.m.has(MEMO_KEY + "gone") && !r5.m.has(MEMO_KEY + "nochat"),
    "她把“穿旗袍”改成“穿西装”：屋里只摆后来那张，原来那一支上的那张收掉；那段对话删了的也收掉；刚留的照摆");
  // 一样的两张（他留了两回）：只摆一张，完成搭配都收
  const r6 = kv({ [MEMO_KEY + "d1"]: memoOf("答应了卿卿下次穿旗袍", "c1", "布丁", now - 2 * H), [MEMO_KEY + "d2"]: memoOf("答应了卿卿下次穿旗袍", "c1", "布丁", now - H), "kfs2:chat:c1": chatWith("d1", "d2") });
  cloud = cloudOf([{ stop_reason: "tool_use", content: [use("v1", "play_dressing_room", { action: "complete" })] }, said("好")]);
  await askRoom({ store: r6, cloud, ctx: ctxOf(), now, ...opts });
  ok(lastText(cloud.bodies[0]).split("答应了卿卿下次穿旗袍").length === 2 && r6.keys(MEMO_KEY).length === 0, "写的一样的两张：只摆一张，完成搭配两张都收");
  // 收的时候头一张没收成：后面那张照收，头一张醒完再收一遍
  const r7 = kv({ [MEMO_KEY + "e1"]: memoOf("先答应的", "c1", "", now - 2 * H), [MEMO_KEY + "e2"]: memoOf("后答应的", "c1", "", now - H), "kfs2:chat:c1": chatWith("e1", "e2") });
  let fails = 1;
  const del7 = r7.del;
  r7.del = async (k) => {
    if (k === MEMO_KEY + "e1" && fails-- > 0) throw Object.assign(new Error("断了"), { code: "unreachable" });
    return del7(k);
  };
  cloud = cloudOf([{ stop_reason: "tool_use", content: [use("u1", "play_dressing_room", { action: "complete" })] }, said("好")]);
  await askRoom({ store: r7, cloud, ctx: ctxOf(), now, ...opts });
  ok(r7.keys(MEMO_KEY).length === 0 && fails < 0, "收的时候头一张一时没收成：后面那张照收，头一张醒完再收一遍，都收了");
  // 头一张两回都没收成：后面那张照样收了，头一张留着（下回完成搭配再收）
  const r7b = kv({ [MEMO_KEY + "e1"]: memoOf("先答应的", "c1", "", now - 2 * H), [MEMO_KEY + "e2"]: memoOf("后答应的", "c1", "", now - H), "kfs2:chat:c1": chatWith("e1", "e2") });
  const del7b = r7b.del;
  r7b.del = async (k) => {
    if (k === MEMO_KEY + "e1") throw Object.assign(new Error("断了"), { code: "unreachable" });
    return del7b(k);
  };
  cloud = cloudOf([{ stop_reason: "tool_use", content: [use("u3", "play_dressing_room", { action: "complete" })] }, said("好")]);
  await askRoom({ store: r7b, cloud, ctx: ctxOf(), now, ...opts });
  ok(r7b.m.has(MEMO_KEY + "e1") && !r7b.m.has(MEMO_KEY + "e2"), "头一张怎么也收不成：不耽误后面那张（一张一张收）");
  // 一直收不成（断网）：这一回醒照常醒完，便签留着，下回完成搭配再收
  const r8 = kv({ [MEMO_KEY + "f1"]: memoOf("先答应的", "c1", "", now - 2 * H), "kfs2:chat:c1": chatWith("f1") });
  r8.del = async () => {
    throw Object.assign(new Error("断了"), { code: "unreachable" });
  };
  cloud = cloudOf([{ stop_reason: "tool_use", content: [use("u2", "play_dressing_room", { action: "complete" })] }, said("好")]);
  const b8 = await askRoom({ store: r8, cloud, ctx: ctxOf(), now, ...opts });
  ok(b8 && b8.kind === "room" && r8.m.has(MEMO_KEY + "f1"), "一直收不成（断了网）：这一回照常醒完，便签留着");
  // 密码不对、凭据坏了：照样往外抛（同园子、妆台）
  const r9 = kv({ [MEMO_KEY + "g1"]: memoOf("过期的", "c1", "", now - 4 * 24 * H) });
  r9.del = async () => {
    throw Object.assign(new Error("x"), { code: "badlogin" });
  };
  let threw = null;
  try {
    await askRoom({ store: r9, cloud: cloudOf([said("醒了")]), ctx: ctxOf(), now, ...opts });
  } catch (e) {
    threw = e;
  }
  ok(threw && threw.code === "badlogin", "收便签的时候密码不对：往外抛（同园子、妆台）");
  // 【醒来】那一段：没给便签，跟原来一个字不差
  const base = { now, herLast: null, lastWake: 0, n: 1, gap: 30, max: 12, transcript: "" };
  ok(wakeSection(base) === wakeSection({ ...base, memos: [] }) && !wakeSection(base).includes("便签（跟她聊天"), "没有便签：【醒来】跟原来一个字不差");
}

ok(localDay(new Date(2026, 9, 22, 0, 5).getTime()) === "2026-10-22" && localDay(new Date(2026, 9, 21, 23, 59).getTime()) === "2026-10-21", "哪一天照这台设备的钟（她那边的钟）");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
