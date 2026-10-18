// 日记共读（见 src/diaryTools.js、开发说明“日记共读”那一节）：他自己翻日记的几样工具（掺了手帐以后多了一样留批注，见 jz.test），翻到的字、聊天里那一行小字，
// 寄回去的样子、前情提要和写日记的记录、历史对话的预览、名帖里那一段，和江湖棋局那几样不打架。
// 日记都是编的。
import {
  DIARY_TOOLS, DIARY_NAMES, DIARY_KEY, READ_MAX, HIT_MAX, isDiaryCall, dayOf, monthOf, daysLabel, shortDay, runDiaryCalls, toolCallsOf, noteLines,
} from "../src/diaryTools.js";
import { TOOLS as GAME_TOOLS, GAME_NAMES, hasSteps, collectStepIds, lastStep, apiBlocks, needsRun, midTurn, OFF_CALL, isGameCall } from "../src/game/jianghu.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildSystem, DIARY_SECTION } from "../src/prompt/system.js";
import { buildRecapAsk } from "../src/prompt/recap.js";
import { thick, askThick } from "../src/recap.js";
import { dayTranscript } from "../src/diary.js";
import { makePreview } from "../src/chat/overview.js";
import { buildRows } from "../src/chat/rows.js";
import { needsReply } from "../src/thread.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
let seq = 0;
const call = (name, input = {}) => ({ id: "toolu_d" + ++seq, name, input });

// 一本编的日记：十月里几天，九月一天，去年一天
const BOOK = {
  "2026-10": {
    "2026-10-12": { her: { text: "今天在运河边看到泡桐花，紫色的，一串一串挂着。想起巩义。", moods: ["happy", "sweet"] }, him: { text: "她说看到泡桐花了。我没见过运河边的泡桐，可我知道那个颜色。", moods: ["calm"] } },
    "2026-10-13": { her: { text: "面试准备了一整天，好累。", moods: ["tired"] } },
    "2026-10-15": { her: { text: "", moods: ["anxious"] } },
    "2026-10-16": { him: { text: "她今天没写日记。我自己写一点：开封府的灯一直亮着。", moods: ["calm"] } },
    "2026-10-18": { her: { text: "凌晨一点还在跟老公讨论邸报。PIGGY 不睡觉。", moods: ["sweet"] } },
    "2026-10-20": { her: { text: "未来的一天，不该有", moods: [] } },
    "bad-key": { her: { text: "不该被认出来" } },
  },
  "2026-09": {
    "2026-09-30": { her: { text: "搬家以后第一次去 Aldi，买了泡桐花图案的杯子。", moods: ["happy"] } },
  },
  "2025-11": {
    "2025-11-20": { her: { text: "去年的今天，泡桐花还没开。", moods: [] } },
  },
};
const reader = (book = BOOK) => ({
  months: async () => Object.keys(book),
  month: async (ym) => book[ym] || {},
});
const NOW = new Date(2026, 9, 18, 1, 30);
const run1 = async (name, input, book = BOOK, now = NOW) => (await runDiaryCalls([call(name, input)], reader(book), now))[0];

// =====================================================
// 工具
// =====================================================
ok(DIARY_TOOLS.map((t) => t.name).join(",") === "diary_list,diary_read,diary_search,diary_note" && [...DIARY_NAMES].join(",") === "diary_list,diary_read,diary_search,diary_note", "四样工具：翻目录、读全文、按词找、留批注");
ok(DIARY_TOOLS.every((t) => t.input_schema && t.input_schema.type === "object" && t.description.length > 20) && DIARY_TOOLS[1].input_schema.required.join() === "dates" && DIARY_TOOLS[2].input_schema.required.join() === "query" && !DIARY_TOOLS[0].input_schema.required,
  "每一样都有说明和参数：读全文要日子，按词找要词，翻目录什么都可以不给");
ok(DIARY_KEY === "kfs2:diary:" && READ_MAX === 7 && HIT_MAX === 20, "日记存在 kfs2:diary:<年-月>；一次最多读七天、最多列二十处");
ok(!DIARY_TOOLS.some((t) => GAME_NAMES.has(t.name)) && isDiaryCall(call("diary_read")) && !isDiaryCall(call("roll")) && isGameCall(call("roll")) && !isGameCall(call("diary_read")), "和江湖棋局那四样名字不重，认得出哪样是哪样");

// =====================================================
// 日子
// =====================================================
ok(dayOf("2026-10-12") === "2026-10-12" && dayOf("2026-10-1") === "2026-10-01" && dayOf("2026/10/12") === "2026-10-12" && dayOf("2026年10月12日") === "2026-10-12" && dayOf(" 2026-10-12 ") === "2026-10-12",
  "日子认得宽一点：2026-10-1、2026/10/12、2026年10月12日都行");
ok(dayOf("2026-02-30") === "" && dayOf("2026-13-01") === "" && dayOf("昨天") === "" && dayOf("") === "" && dayOf(null) === "" && dayOf(20261012) === "", "没有的日子（2 月 30 日、13 月）、认不出的：回空");
ok(monthOf("2026-10") === "2026-10" && monthOf("2026-1") === "2026-01" && monthOf("2026年10月") === "2026-10" && monthOf("2026-13") === "" && monthOf("十月") === "", "月份：2026-10、2026-1、2026年10月；13 月不认");
ok(shortDay("2026-10-12", NOW) === "10月12日" && shortDay("2025-11-20", NOW) === "2025年11月20日", "短的写法：今年的不写年份，别的年份带上");
ok(daysLabel(["2026-10-12"], NOW) === "10月12日" && daysLabel(["2026-10-15", "2026-10-12"], NOW) === "10月12日、15日" && daysLabel(["2026-10-12", "2026-10-13", "2026-10-14"], NOW) === "10月12日到14日",
  "那一行小字里的日子：一天、两天（同一个月后面只写几日）、连着三天写成“到”");
ok(daysLabel(["2026-09-29", "2026-09-30", "2026-10-01"], NOW) === "9月29日到10月1日" && daysLabel(["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-07"], NOW) === "10月1日、3日、5日等 4 天" && daysLabel(["2026-09-30", "2026-10-02"], NOW) === "9月30日、10月2日" && daysLabel([], NOW) === "",
  "跨月连着的、不连着又多的（写“等几天”）、跨月不连着的、空的");

// =====================================================
// 翻目录
// =====================================================
const l1 = await run1("diary_list", { month: "2026-10" });
ok(!l1.err && l1.note === "翻了日记目录 · 10月" && l1.card.length === 0, `翻十月的目录：那一行小字写“翻了日记目录 · 10月”（${l1.note}）`);
ok(l1.out.startsWith("日记本目录：2026年10月（今天是 10月18日）") && l1.out.includes("有日记的 5 天") && !l1.out.includes("不该被认出来") && !l1.out.includes("未来的一天"), "目录开头写哪个月、今天几号、有日记的几天；认不出的钥匙不算；还没到的日子不列（读全文也不读）");
ok(l1.out.includes("10月12日 星期一｜她：心情 开心、甜；“今天在运河边看到泡桐花，紫色的，一串一串挂着。想起巩义。”｜你：心情 平静；“她说看到泡桐花了。我没见过运河边的泡桐，可我知道那个颜色。”"),
  "一天一行：她的心情、开头一句，他的心情、开头一句（不长的整句）");
ok(l1.out.includes("10月13日 星期二｜她：心情 累；“面试准备了一整天，好累。”｜你：没写") && l1.out.includes("10月15日 星期四｜她：只选了心情 焦虑，没写字｜你：没写") && l1.out.includes("10月16日 星期五｜她：没写｜你：心情 平静；"),
  "只写了一个人的、只选了心情没写字的，照实写");
ok(l1.out.includes("10月18日 星期日（今天）｜") && l1.out.indexOf("\n10月12日") < l1.out.indexOf("\n10月18日") && l1.out.endsWith("要看哪天的全文，调 diary_read。"), "今天那一行标着（今天）；照日子排；最后提一句怎么读全文");
const long = { "2026-10": { "2026-10-01": { her: { text: "一二三四五六七八九十".repeat(5), moods: [] } } } };
const lLong = await run1("diary_list", { month: "2026-10" }, long);
ok(lLong.out.includes("“一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十……”"), "长的只摆开头三十个字，后面写“……”");
const l2 = await run1("diary_list", {});
ok(!l2.err && l2.note === "翻了日记目录 · 最近三十天" && l2.out.startsWith("日记本目录：最近三十天（9月19日到10月18日）") && l2.out.includes("9月30日 星期三｜她：心情 开心") && l2.out.includes("10月18日 星期日（今天）") && !l2.out.includes("10月20日") && !l2.out.includes("2025"),
  "不给月份：最近三十天（连今天），跨了月的两个月都看；三十天以外的、还没到的不列");
const l3 = await run1("diary_list", { month: "2026-12" });
ok(!l3.err && l3.out.startsWith("2026年12月还没到") && l3.note === "翻了日记目录 · 12月", "还没到的月份：照实说还没到");
const l4 = await run1("diary_list", { month: "2026-05" });
ok(!l4.err && l4.out.includes("这段日子一篇日记都没有") && l4.note === "翻了日记目录 · 5月", "一篇都没有的月份：照实说");
const l5 = await run1("diary_list", { month: "十月" });
ok(l5.err && l5.out.includes("看不懂要看哪个月") && l5.note === "想翻日记，没翻成", "月份看不懂：记成出错，那一行小字写“想翻日记，没翻成”");
const l6 = await run1("diary_list", { month: "2025-11" });
ok(l6.note === "翻了日记目录 · 2025年11月" && l6.out.includes("2025年11月20日 星期四｜她："), "去年的月份：小字和目录里都带年份");

// =====================================================
// 读全文
// =====================================================
const r1 = await run1("diary_read", { dates: ["2026-10-12"] });
ok(!r1.err && r1.note === "翻了日记 · 10月12日", `读一天：那一行小字写“翻了日记 · 10月12日”（${r1.note}）`);
ok(r1.out === "【2026年10月12日 星期一】\n她写的（心情：开心、甜）：\n今天在运河边看到泡桐花，紫色的，一串一串挂着。想起巩义。\n\n你写的（心情：平静）：\n她说看到泡桐花了。我没见过运河边的泡桐，可我知道那个颜色。",
  "读到的：哪天、她写的（连心情）、他写的（连心情），一个字不改");
const r2 = await run1("diary_read", { dates: ["2026-10-15", "2026-10-14", "2026-10-13", "2026-10-18"] });
ok(r2.out.includes("【2026年10月13日 星期二】\n她写的（心情：累）：\n面试准备了一整天，好累。\n\n你这天没写。") && r2.out.includes("【2026年10月14日 星期三】\n这天两个人都没写日记。") && r2.out.includes("她写的：只选了心情（焦虑），没写字。") && r2.out.includes("【2026年10月18日 星期日（今天）】"),
  "几天一起读：只有一个人写的、两个人都没写的、只选了心情的、今天的，照实写");
ok(r2.out.indexOf("10月13日") < r2.out.indexOf("10月14日") && r2.out.indexOf("10月15日") < r2.out.indexOf("10月18日") && r2.note === "翻了日记 · 10月13日、14日、15日等 4 天", `照日子排；小字写几天（${r2.note}）`);
const r3 = await run1("diary_read", { dates: ["2026-10-12", "2026-10-13", "2026-10-14"] });
ok(r3.note === "翻了日记 · 10月12日到14日", "连着三天：小字写成“10月12日到14日”");
const r4 = await run1("diary_read", { dates: ["2026-10-20"] });
ok(!r4.err && r4.out.includes("这一天还没到") && !r4.out.includes("未来的一天"), "还没到的日子：不读（存档里就算有，也照实说还没到）");
const nine = ["01", "02", "03", "04", "05", "06", "07", "08", "09"].map((d) => `2026-10-${d}`);
const r5 = await run1("diary_read", { dates: nine });
ok(!r5.err && (r5.out.match(/【2026年10月/g) || []).length === 7 && r5.out.endsWith("一次最多读 7 天：10月8日、9日这一回没读，要看再调一回。") && r5.note === "翻了日记 · 10月1日到7日", "一回给九天：只读头七天，写明哪两天没读");
const r6 = await run1("diary_read", { dates: ["2026-10-12", "后天", "2026-02-30"] });
ok(!r6.err && r6.out.startsWith("看不懂的日子：后天、2026-02-30（日子写成 2026-10-12 这样）。") && r6.out.includes("【2026年10月12日"), "认不出的日子写明，认得出的照读");
const r7 = await run1("diary_read", { dates: ["后天"] });
ok(r7.err && r7.note === "想翻日记，没翻成", "一个都认不出：记成出错");
const r8 = await run1("diary_read", {});
ok(r8.err && r8.out.includes("没说要读哪天"), "没给日子：记成出错，告诉他怎么写");
const r9 = await run1("diary_read", { dates: "2026-10-12，2026-10-13" });
ok(!r9.err && r9.out.includes("【2026年10月12日") && r9.out.includes("【2026年10月13日"), "日子写成一串字（不是一组）也认");
const big = { "2026-10": { "2026-10-01": { her: { text: "长".repeat(5000), moods: [] } } } };
const r10 = await run1("diary_read", { dates: ["2026-10-01"] }, big);
ok(r10.out.includes("长".repeat(4000) + "……（后面还有 1000 字，这一回没递过来）") && !r10.out.includes("长".repeat(4001)), "一篇太长：递头四千字，写明后面还有多少");
const huge = { "2026-10": {} };
for (let d = 1; d <= 7; d++) huge["2026-10"][`2026-10-0${d}`] = { her: { text: "满".repeat(3900) }, him: { text: "也满".repeat(1900) } };
const r11 = await run1("diary_read", { dates: Object.keys(huge["2026-10"]) }, huge);
ok(!r11.err && r11.out.length < 30000 && /这一回递的字够多了：10月\d+日.*没读，要看再调一回。$/.test(r11.out) && !r11.note.includes("7日"), `一回递的字够多了就不往下读，写明哪几天没读（${r11.note}）`);
const both = { "2026-10": {} };
for (let d = 1; d <= 9; d++) both["2026-10"][`2026-10-0${d}`] = { her: { text: "满".repeat(3900) }, him: { text: "也满".repeat(1900) } };
const r13 = await run1("diary_read", { dates: Object.keys(both["2026-10"]) }, both);
ok(/这一回递的字够多了：10月\d+日.*没读，要看再调一回。\n\n一次最多读 7 天：10月8日、9日这一回没读，要看再调一回。$/.test(r13.out), "两样上限都碰上（要了九天、头七天里又有字够多了没读的）：两样都写明，一天也不悄悄漏掉");
const r12 = await run1("diary_read", { dates: ["2025-11-20"] });
ok(r12.note === "翻了日记 · 2025年11月20日" && r12.out.startsWith("【2025年11月20日 星期四】"), "去年的日子照样读");

// 表情占两格：截的地方正好落在一个表情中间，两头都不能留半个（半个表情寄过去，那边整段话都不认，这段对话就一直问不成）
const lone = (s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
const emo = "🌸";
const eBook = {
  "2026-10": {
    "2026-10-01": { her: { text: "一".repeat(29) + emo + "后面还有字", moods: [] } },
    "2026-10-02": { her: { text: "长".repeat(3999) + emo + "尾巴", moods: [] } },
    "2026-10-03": { her: { text: emo + "啊".repeat(39) + "泡桐" + "啊".repeat(39) + emo + "后面", moods: [] } },
  },
};
const e1 = await run1("diary_list", { month: "2026-10" }, eBook);
const e2 = await run1("diary_read", { dates: ["2026-10-02"] }, eBook);
const e3 = await run1("diary_search", { query: "泡桐" }, eBook);
const e4 = await run1("diary_search", { query: "一二三四五六七八九十一" + emo }, eBook);
ok(![e1, e2, e3, e4].some((r) => lone(r.out) || lone(r.note)) && e1.out.includes("“" + "一".repeat(29) + "……”") && e2.out.includes("长".repeat(3999) + "……（后面还有 ") && e3.out.includes(emo + "啊") && e3.out.includes("啊" + emo) && e4.note === "搜了日记 · 一二三四五六七八九十一…",
  "截开头一句、截四千字、搜到的前后一小段、小字里的词：落在表情中间的都不劈开（少截一格或者多带一格）");

// =====================================================
// 按词找
// =====================================================
const s1 = await run1("diary_search", { query: "泡桐花" });
ok(!s1.err && s1.note === "搜了日记 · 泡桐花", `按词找：小字写“搜了日记 · 泡桐花”（${s1.note}）`);
ok(s1.out.startsWith("在整本日记里找“泡桐花”：一共 4 处（新的在前）") && s1.out.indexOf("10月12日 她写的") < s1.out.indexOf("10月12日 你写的") && s1.out.indexOf("10月12日 你写的") < s1.out.indexOf("9月30日 她写的") && s1.out.indexOf("9月30日") < s1.out.indexOf("2025年11月20日"),
  "整本都找：十月、九月、去年的都找到，新的在前；同一天她的在前");
ok(s1.out.includes("10月12日 她写的：今天在运河边看到泡桐花，紫色的，一串一串挂着。想起巩义。") && s1.out.endsWith("要看哪天的全文，调 diary_read。"), "每处带前后一小段（短的就是整句）");
const s2 = await run1("diary_search", { query: "泡桐花", who: "him" });
ok(s2.out.startsWith("在你写的日记里找“泡桐花”：一共 1 处") && s2.out.includes("10月12日 你写的："), "只找他写的");
const s3 = await run1("diary_search", { query: "焦虑" });
ok(s3.out.includes("10月15日 她写的：心情：焦虑"), "按心情找：只选了心情的那天也找得到，写心情");
const s4 = await run1("diary_search", { query: "泡桐花 巩义" });
ok(s4.out.includes("一共 1 处") && s4.out.includes("10月12日 她写的"), "空格隔开两个词：一篇里两个都得有");
const s5 = await run1("diary_search", { query: "piggy" });
ok(s5.out.includes("一共 1 处") && s5.out.includes("PIGGY 不睡觉"), "英文不分大小写");
const s6 = await run1("diary_search", { query: "西湖" });
ok(!s6.err && s6.out === "整本日记里没找到“西湖”。" && s6.note === "搜了日记 · 西湖", "找不到：照实说，不算出错");
const s7 = await run1("diary_search", { query: "  " });
ok(s7.err && s7.note === "想翻日记，没翻成", "词是空的：记成出错");
const many = { "2026-10": {} };
for (let d = 1; d <= 25; d++) many["2026-10"][`2026-10-${String(d).padStart(2, "0")}`] = { her: { text: `第${d}天，又看到了灯。` + "很长的前文".repeat(20) + "灯" + "很长的后文".repeat(20) } };
const s8 = await run1("diary_search", { query: "灯" }, many, new Date(2026, 9, 26));
ok(s8.out.includes("一共 25 处，只列了最新的 20 处") && s8.out.includes("10月25日 她写的") && !s8.out.includes("10月5日 她写的") && (s8.out.match(/她写的/g) || []).length === 20, "超过二十处：只列最新的二十处，写明一共几处");
const piece = s8.out.split("\n").find((l) => l.startsWith("10月25日"));
ok(piece.length < 140 && piece.endsWith("……"), `一处只带前后一小段（${piece.length} 字），后面截掉的写“……”`);
const s9 = await run1("diary_search", { query: "一二三四五六七八九十一二三四五" });
ok(s9.note === "搜了日记 · 一二三四五六七八九十一二…", "词太长：小字只写头十二个字");

// =====================================================
// 一回调几样、出岔子、别的工具不碰
// =====================================================
const mixed = [call("roll"), call("diary_read", { dates: ["2026-10-12"] }), { ...call("diary_list"), out: "早翻过了", err: false, note: "翻了日记目录 · 10月", card: [] }];
const done = await runDiaryCalls(mixed, reader(), NOW);
ok(done[0] === mixed[0] && done[2] === mixed[2] && done[1].out.startsWith("【2026年10月12日") && done[1].id === mixed[1].id, "一步里有棋局那一样、翻过了的：都不碰，只翻没翻的那一样");
const broken = { months: async () => { throw new Error("坏了"); }, month: async () => { throw new Error("坏了"); } };
const bad = (await runDiaryCalls([call("diary_search", { query: "灯" })], broken, NOW))[0];
ok(bad.err && bad.out.includes("这会儿翻不开日记本") && bad.note === "想翻日记，没翻成", "存档取不到：记成出错，他看到会跟她说");
const odd = (await runDiaryCalls([{ id: "x", name: "diary_read", input: null }], reader(), NOW))[0];
ok(odd.err && odd.input && typeof odd.input === "object", "参数不是一个对象：当成空的，不出错");

// =====================================================
// 认出他调的那几样
// =====================================================
const NAMES = new Set([...GAME_NAMES, ...DIARY_NAMES]);
const content = [
  { type: "thinking", thinking: "", signature: "x" },
  { type: "text", text: "我翻翻。" },
  { type: "mcp_tool_use", id: "m1", name: "tavily-search", server_name: "tavily" },
  { type: "tool_use", id: "t1", name: "diary_search", input: { query: "灯" } },
  { type: "tool_use", id: "t2", name: "roll", input: {} },
  { type: "tool_use", id: "t3", name: "made_up", input: {} },
];
const got = toolCallsOf(content, NAMES);
ok(got.map((c) => c.id).join() === "t1,t2" && got[0].input.query === "灯", "认出他调的：翻日记、棋局的都认，按他调的先后；MCP 的、没有的那种不认");
ok(toolCallsOf(content, DIARY_NAMES).map((c) => c.id).join() === "t1", "只认翻日记的");

// =====================================================
// 对话里的一步（跟江湖棋局一个路子）
// =====================================================
const her1 = { id: "h1", role: "her", ts: 1, text: "你记得那天的泡桐花吗" };
const stepD = { id: "s1", role: "him", ts: 2, items: [{ type: "text", text: "我翻翻。" }], raw: "我翻翻。", stop: "tool_use", calls: [{ id: "toolu_1", name: "diary_search", input: { query: "泡桐花" }, out: "在整本日记里找“泡桐花”：一共 4 处", err: false, note: "搜了日记 · 泡桐花", card: [] }] };
const doneD = { id: "s2", role: "him", ts: 3, items: [{ type: "text", text: "记得，紫色的。" }], raw: "记得，紫色的。" };
const silentD = { id: "s3", role: "him", ts: 4, items: [], raw: "", stop: "tool_use", calls: [{ id: "toolu_2", name: "diary_read", input: { dates: ["2026-10-12"] }, out: "【2026年10月12日 星期一】……", err: false, note: "翻了日记 · 10月12日", card: [] }] };
ok(midTurn(stepD) && !needsRun(stepD) && needsRun({ ...stepD, calls: [{ id: "x", name: "diary_read", input: {} }] }) && needsReply([her1, stepD]) && !needsReply([her1, stepD, doneD]), "翻日记的一步也是“说到一半”：结果记上了等着递回去，欠着后半截");
const built = buildMessages([her1, stepD, doneD], {}, () => null).messages;
const a = built[1];
const u = built[2];
ok(a.role === "assistant" && a.content.map((b) => b.type).join() === "text,tool_use" && a.content[1].name === "diary_search" && a.content[1].input.query === "泡桐花", "寄回去：他说的字后面跟着他调的那一样");
ok(u.role === "user" && u.content[0].type === "tool_result" && u.content[0].tool_use_id === "toolu_1" && u.content[0].content === stepD.calls[0].out && !u.content[0].is_error, "紧跟着的下一句最前面是翻到的字");
const errStep = { ...stepD, calls: [{ ...stepD.calls[0], out: "这会儿翻不开日记本", err: true }] };
ok(buildMessages([her1, errStep], {}, () => null).messages[2].content[0].is_error === true, "没翻成的：结果标成出错");
ok(apiBlocks({ calls: [{ id: "q", name: "diary_read", input: {} }] }).results[0].content === "（这一步没有结果：开封府没来得及替你办。）" && apiBlocks({ calls: [{ id: "q", name: "roll", input: {} }] }).results[0].content.includes("调引擎"),
  "万一没有结果：翻日记的写“没来得及替你办”，棋局的照旧写“调引擎”");
const quiet = buildMessages([her1, silentD], {}, () => null).messages;
ok(quiet[1].content.map((b) => b.type).join() === "tool_use", "一个字没说只翻了日记的一步：寄回去只有 tool_use，不补“……”");

// 和江湖棋局那几样不打架
ok(!hasSteps([her1, stepD, doneD]) && hasSteps([her1, { ...stepD, calls: [{ id: "g", name: "roll", input: {}, out: "x", card: [] }] }]), "只翻过日记的对话不算下过棋（不会被当成“收了棋”）");
ok(collectStepIds([her1, stepD, silentD]).length === 0 && collectStepIds([her1, { ...stepD, calls: [{ id: "g", name: "roll", input: {}, out: "x", card: [] }] }]).join() === "s1", "删对话时只删下过棋的那几步的存档；翻日记的那几步没有存档");
ok(lastStep([her1, { ...stepD, board: { ch: "x" }, calls: [{ id: "g", name: "roll", input: {}, out: "x", card: [] }] }, silentD]).board.ch === "x", "棋盘照最后一步下过棋的：后面翻了日记的那一步不算");
ok(OFF_CALL.includes("棋盘收着") && OFF_CALL.includes("南衙"), "收了棋又调棋局那几样：递回去的那句写明棋盘收着、想下去南衙里摆开");

// =====================================================
// 聊天里摆的、记录里写的
// =====================================================
const rows = buildRows([her1, stepD, doneD], null, "", null, "");
const note = rows.filter((r) => r.type === "tools");
ok(note.length === 1 && note[0].kind === "diary" && note[0].text === "搜了日记 · 泡桐花" && rows.indexOf(note[0]) > rows.findIndex((r) => r.key === "s1-0") && rows.indexOf(note[0]) < rows.findIndex((r) => r.key === "s2-0"),
  "聊天里一行小字（跟“用了 tavily”一个样子），摆在他那一步的话后面、接着说的话前面");
ok(!buildRows([her1, stepD], { id: "s1", count: 0 }, "", null, "").some((r) => r.type === "tools"), "那一步正一条一条蹦的时候不摆，蹦完才冒");
ok(buildRows([her1, silentD], null, "", null, "").filter((r) => r.type === "tools").map((r) => r.text).join() === "翻了日记 · 10月12日", "一个字没说只翻了日记：只有那一行小字");
ok(!buildRows([her1, { ...stepD, calls: [{ id: "g", name: "roll", input: {}, out: "x", card: ["〔骰〕卿卿掷出 3 点"] }] }], null, "", null, "").some((r) => r.type === "tools"), "下棋的那一步不摆这一行（摆的是卡片）");
ok(noteLines(stepD).join() === "[搜了日记 · 泡桐花]" && noteLines(her1).length === 0, "noteLines：那一行小字套上方括号");
ok(dayTranscript([her1, stepD, doneD, silentD], () => null).split("\n").join("|") === "卿卿：你记得那天的泡桐花吗|光义：我翻翻。 [光义搜了日记 · 泡桐花]|光义：记得，紫色的。|[光义翻了日记 · 10月12日]",
  "写日记用的聊天摘录：翻日记写成“[光义翻了日记 · …]”，翻到的字不抄");
const ask = buildRecapAsk({ msgs: [her1, stepD, doneD, silentD], memeLookup: () => null });
const asked = ask.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
ok(asked.includes("光义：我翻翻。\n[光义搜了日记 · 泡桐花]") && asked.includes("[光义翻了日记 · 10月12日]") && !asked.includes("一共 4 处") && !/光义：……/.test(asked), "叫他抄提要的记录里：只记翻了哪天、搜了什么，翻到的字不抄；只翻不说的不补“……”");
ok(thick(stepD) > thick({ ...stepD, calls: [] }) && askThick(stepD) > askThick({ ...stepD, calls: [] }), "一条多厚：翻到的字（寄回去的）、那一行小字（记录里的）都算");
ok(makePreview([her1, silentD]) === "[翻了日记 · 10月12日]" && makePreview([her1, stepD]) === "我翻翻。", "历史对话的预览：最后是只翻不说的那一步，写那一行小字");

// =====================================================
// 名帖
// =====================================================
const sysArgs = { now: new Date(2026, 9, 18, 1, 30), memeList: [], hisAvatarName: "", memDocs: [] };
const withD = buildSystem(sysArgs);
const without = buildSystem({ ...sysArgs, diary: false });
ok(withD.staticText.includes(DIARY_SECTION + "\n\n【回复格式】") && !without.staticText.includes("【日记本】") && withD.staticText === without.staticText.replace("【回复格式】", DIARY_SECTION + "\n\n【回复格式】"),
  "名帖：默认带【日记本】那一段，排在【回复格式】前头；写日记那一回不带（别的一个字不差）");
ok(["diary_list", "diary_read", "diary_search", "diary_note", "随时", "她那边会看到一行小字", "打电话的时候翻不了", "别编"].every((w) => DIARY_SECTION.includes(w)) && DIARY_SECTION.includes("叫“闲笔集”，放在“南衙”里") && !DIARY_SECTION.includes("【回复格式】"),
  "那一段里写着四样怎么用、随时能翻、她看得到、打电话翻不了、别编；写着日记本叫闲笔集、在南衙里（10 月 18 日她说要让他知道）");
const gamed = buildSystem({ ...sysArgs, game: { board: null } });
ok(gamed.staticText.indexOf("【日记本】") < gamed.staticText.indexOf("【江湖棋局】") && gamed.staticText.indexOf("【江湖棋局】") < gamed.staticText.indexOf("【回复格式】"), "摆着棋盘的：【日记本】、【江湖棋局】、【回复格式】依次排");
ok(withD.nowNote === without.nowNote, "【此刻】不变");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
