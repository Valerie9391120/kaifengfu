// 选项卡：他的写法怎么拆、写回去、她答完发回去的那几行（见 src/ask.js）。数据都是编的
import { ASK_MAX_Q, ASK_MAX_O, parseAskBody, splitAskBlocks, askRaw, askSummary, askBanner, answerText, askBlocksToNote } from "../src/ask.js";
import { parseReply, rawOf } from "../src/reply.js";
import { buildSystem, ASK_RULE, CALL_NOTE } from "../src/prompt/system.js";
import { makePreview } from "../src/chat/overview.js";
import { buildRows } from "../src/chat/rows.js";
import { buildRecapAsk } from "../src/prompt/recap.js";
import { askThick } from "../src/recap.js";
import { tailTranscript } from "../alarm/note.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const J = (x) => JSON.stringify(x);

// ---- 拆一张卡 ----
{
  const qs = parseAskBody("问：今天晚饭想吃什么？\n- 火锅｜天冷了，热乎乎的\n- 烧烤\n问（多选）：周末想干嘛？\n- 看电影\n- 睡懒觉\n- 逛公园");
  ok(J(qs) === J([
    { q: "今天晚饭想吃什么？", multi: false, opts: [{ t: "火锅", d: "天冷了，热乎乎的" }, { t: "烧烤" }] },
    { q: "周末想干嘛？", multi: true, opts: [{ t: "看电影" }, { t: "睡懒觉" }, { t: "逛公园" }] },
  ]), "照名帖里教的写法：一题一行“问：”，选项一行“- ”，“｜”后面是一行小字说明，“问（多选）：”是多选");
}
{
  const qs = parseAskBody("Q: 半角的问\n1. 一\n2、二\n3) 三\nq：小写\n· 点\n• 圆点\n* 星\n– 短横");
  ok(qs.length === 2 && qs[0].q === "半角的问" && J(qs[0].opts.map((o) => o.t)) === J(["一", "二", "三"]) && qs[1].q === "小写" && J(qs[1].opts.map((o) => o.t)) === J(["点", "圆点", "星", "短横"]),
    "Q:、q：也认；选项前面写 1. 2、 3) · • * – 都认");
}
{
  const a = parseAskBody("问(多选): 半角括号\n- a\n- b");
  const b = parseAskBody("问：题目后面写（多选）\n- a\n- b");
  const c = parseAskBody("问：两回（多选）（多选）\n- a");
  ok(a[0].multi && a[0].q === "半角括号" && b[0].multi && b[0].q === "题目后面写" && c[0].multi && c[0].q === "两回", "多选：半角括号也认；写在题目末尾的“（多选）”也算，摘掉不显示");
}
{
  const qs = parseAskBody("今天吃什么？\n火锅\n烧烤\n周末去哪?（多选）\n公园\n商场");
  ok(J(qs) === J([
    { q: "今天吃什么？", multi: false, opts: [{ t: "火锅" }, { t: "烧烤" }] },
    { q: "周末去哪?", multi: true, opts: [{ t: "公园" }, { t: "商场" }] },
  ]), "没写记号的几行：头一行是题目；问号结尾的是新的一题，别的算眼下这一题的选项");
  const noQ = parseAskBody("晚饭吃什么\n火锅\n烧烤");
  ok(noQ.length === 1 && noQ[0].q === "晚饭吃什么" && noQ[0].opts.length === 2, "头一行没写问号也是题目，后面的都是它的选项");
}
{
  const five = parseAskBody([1, 2, 3, 4, 5].map((i) => `问：第${i}题\n- a\n- b`).join("\n"));
  const six = parseAskBody("问：六个选项\n" + [1, 2, 3, 4, 5, 6].map((i) => `- 选项${i}`).join("\n"));
  ok(five.length === ASK_MAX_Q && ASK_MAX_Q === 4 && five[3].q === "第4题" && six[0].opts.length === ASK_MAX_O && ASK_MAX_O === 4 && six[0].opts[3].t === "选项4",
    "一张卡最多四题、每题最多四个选项：多写的不要");
}
{
  const long = parseAskBody(`问：${"题".repeat(100)}\n- ${"选".repeat(50)}｜${"说".repeat(80)}`);
  ok(Array.from(long[0].q).length === 80 && Array.from(long[0].opts[0].t).length === 40 && Array.from(long[0].opts[0].d).length === 60, "太长的截短：题目八十个字、选项四十个字、说明六十个字");
  const emoji = parseAskBody(`问：${"👨‍👩‍👧".repeat(3)}\n- 🦊`);
  ok(emoji[0].q.length > 0 && emoji[0].opts[0].t === "🦊", "表情符号不会截成半个");
}
{
  const empty = parseAskBody("问：\n- \n- ｜只有说明\n问：留着\n- 有");
  ok(J(empty) === J([{ q: "留着", multi: false, opts: [{ t: "有" }] }]), "空题目又没有选项的那题不要；空选项、只有说明没有选项的不要");
  const optsFirst = parseAskBody("- 火锅\n- 烧烤");
  ok(optsFirst.length === 1 && optsFirst[0].q === "" && optsFirst[0].opts.length === 2, "只写了选项没写题目：照样是一题（题目空着）");
  const open = parseAskBody("问：你今天开心吗？");
  ok(open.length === 1 && open[0].opts.length === 0, "只有题目没有选项：照样是一题（她只能自己写一句、或者跳过）");
  ok(parseAskBody("").length === 0 && parseAskBody("\n \n").length === 0 && parseAskBody(null).length === 0, "里头什么都没有：一题都没有");
}

// ---- 一段字里摘出卡来 ----
{
  const parts = splitAskBlocks("先说一句\n[ASK]\n问：吃什么？\n- 面\n[/ASK]\n后面一句");
  ok(parts.length === 3 && parts[0].type === "text" && parts[0].value === "先说一句\n" && parts[1].type === "ask" && parts[1].qs[0].q === "吃什么？" && parts[2].value === "\n后面一句",
    "卡片前后的字照留着");
  const open = splitAskBlocks("说\n[ASK]\n问：没收尾\n- a\n- b");
  ok(open.length === 2 && open[1].type === "ask" && open[1].qs[0].opts.length === 2, "没写 [/ASK]：到末尾都算");
  const empty = splitAskBlocks("前\n[ASK]\n\n[/ASK]\n后");
  ok(empty.length === 2 && empty.every((p) => p.type === "text"), "里头一题都认不出来的整块不要（记号也不留）");
  const cases = splitAskBlocks("[ask]\n问：小写\n- a\n[/Ask]\n  [ASK]  \n问：带空格\n- b\n[/ASK]");
  ok(cases.filter((p) => p.type === "ask").length === 2, "记号大小写、前后的空格都不管");
  const inline = splitAskBlocks("夹在句子里的 [ASK] 不算\n问：x");
  ok(inline.length === 1 && inline[0].type === "text", "开头的记号要独占一行才算");
}
{
  // 结尾写岔了（另一双眼睛挑出来的：原来一直吞到末尾，后面的话全成了选项）
  const types = (r) => r.items.map((it) => it.type + (it.type === "ask" ? ":" + it.qs.map((x) => x.opts.map((o) => o.t).join("/")).join("|") : ":" + (it.text || ""))).join(" ");
  const forgot = parseReply("[ASK]\n问：吃什么？\n- 火锅\n- 烧烤\n[SPLIT]\n那我先去洗澡啦\n[SPLIT]\n回来再说");
  ok(types(forgot) === "ask:火锅/烧烤 text:那我先去洗澡啦 text:回来再说", `没写 [/ASK]：卡到下一个 [SPLIT] 为止，后面的照常分条（${types(forgot)}）`);
  const sameLine = parseReply("[ASK]\n问：吃什么？\n- 火锅\n- 烧烤[/ASK]。\n好了");
  ok(types(sameLine) === "ask:火锅/烧烤 text:。\n好了", `结尾的记号跟在选项后面、后面又跟着字：照样是结尾，后面的字照常是话（${types(sameLine)}）`);
  const glued = parseReply("[ASK]\n问：吃什么？\n- 火锅\n[/ASK][SPLIT]后面一句");
  ok(types(glued) === "ask:火锅 text:后面一句", `“[/ASK][SPLIT]”写在一行：照样分开（${types(glued)}）`);
  const twoOpen = parseReply("[ASK]\n问：头一张忘了收尾\n- 甲\n[ASK]\n问：第二张\n- 乙\n[/ASK]\n尾巴");
  ok(types(twoOpen) === "ask:甲 ask:乙 text:尾巴", `头一张忘了收尾：到第二张的开头为止（${types(twoOpen)}）`);
  ok(J(parseReply(rawOf(forgot.items)).items) === J(forgot.items) && J(parseReply(rawOf(twoOpen.items)).items) === J(twoOpen.items), "这几种写回去再拆，还是这几样");
}
{
  // “问”后面一长串空格：一眨眼拆完（原来的正则会来回试，五万九千个空格要三秒）
  const t0 = performance.now();
  const qs = parseAskBody("问" + " ".repeat(59000) + "x\nQ" + "\t".repeat(59000) + "（多选");
  const took = performance.now() - t0;
  ok(took < 100 && qs.length === 1 && qs[0].q === "问" && qs[0].opts.length === 1, `“问”后面五万九千个空格、“Q”后面五万九千个制表符（都没有冒号，不是题目的写法）：${Math.round(took)} 毫秒拆完`);
  const t1 = performance.now();
  const many = splitAskBlocks("[ASK]\n".repeat(10000) + "问：x\n- a");
  ok(performance.now() - t1 < 200 && many.filter((p) => p.type === "ask").length === 1, "一万行没收尾的 [ASK]：一眨眼拆完");
}

// ---- 他的回话里 ----
{
  const r = parseReply("<thinking>让她挑</thinking>\n好嘞\n[SPLIT]\n你挑一个：\n[ASK]\n问：吃什么？\n- 火锅\n- 烧烤\n[/ASK]\n[SPLIT]\n挑好了告诉我");
  ok(J(r.items.map((it) => it.type)) === J(["text", "text", "ask", "text"]) && r.items[2].qs[0].opts.length === 2 && r.items[3].text === "挑好了告诉我" && r.thinking === "让她挑",
    "回话里的选项卡单独成一样，前后照常分条");
  const raw = rawOf(r.items);
  const again = parseReply(raw);
  ok(J(again.items) === J(r.items), "写回他的原话再拆一遍，还是这几样（掐断回话、重写原话的时候用）");
  const inDoc = parseReply("[DOC:x.md]\n[ASK]\n问：文档里的\n- a\n[/DOC]");
  ok(inDoc.items.length === 1 && inDoc.items[0].type === "doc" && inDoc.items[0].text.includes("[ASK]"), "文档块里写的 [ASK] 不算，照原样是文档里的字");
  const two = parseReply("[ASK]\n问：一\n- a\n[/ASK]\n[ASK]\n问：二\n- b\n[/ASK]");
  ok(two.items.filter((it) => it.type === "ask").length === 2, "一条回话里写了两张：两张都在");
}
{
  const qs = [{ q: "吃什么？", multi: false, opts: [{ t: "火锅", d: "热乎" }, { t: "烧烤" }] }, { q: "", multi: true, opts: [{ t: "a" }] }];
  ok(J(parseAskBody(askRaw(qs).split("\n").slice(1, -1).join("\n"))) === J(qs), "askRaw 写出来的再拆，还是这几题（多选、说明、空题目都在）");
  ok(askSummary(qs) === "[选项卡] 吃什么？（火锅／烧烤）；（没写题目）（多选：a）", "写成一行：题目和选项");
  ok(askBanner(qs) === "[选项卡] 吃什么？" && askBanner([{ q: "", opts: [] }]) === "[选项卡]", "横幅上那一行：头一题；没写题目就只写[选项卡]");
  ok(askBlocksToNote("给你挑\n[ASK]\n问：吃什么？\n- 火锅\n- 烧烤\n[/ASK]\n好") === "给你挑\n〔弹了一张选项卡：吃什么？（火锅／烧烤）〕\n好", "写日记的摘录里：整块换成一句");
}

// ---- 她答完发回去的那一条 ----
{
  const qs = [
    { q: "吃什么？", multi: false, opts: [{ t: "火锅" }, { t: "烧烤" }, { t: "面" }] },
    { q: "周末干嘛？", multi: true, opts: [{ t: "看电影" }, { t: "睡懒觉" }, { t: "逛公园" }] },
    { q: "几点出门？", multi: false, opts: [{ t: "十点" }, { t: "下午" }] },
  ];
  const t = answerText(qs, [{ picks: [1], other: "" }, { picks: [2, 0], other: "  还想吃蛋糕 " }, { skip: true }]);
  ok(t === "Q: 吃什么？\nA: 烧烤\n\nQ: 周末干嘛？\nA: 看电影、逛公园、还想吃蛋糕\n\nQ: 几点出门？\nA: （跳过）", "一题一行问、一行答；多选的照选项的顺序；自己写的接在后面；跳过的写（跳过）");
  ok(answerText(qs, [{ skip: true }, { skip: true }, { skip: true }]) === "" && answerText(qs, [{ picks: [], other: " " }, null, {}]) === "", "全跳过了（或者什么都没选）：不发");
  ok(answerText([{ q: "", multi: false, opts: [{ t: "a" }] }], [{ picks: [0, 5], other: "" }]) === "Q: （没写题目）\nA: a", "没写题目的写“（没写题目）”；对不上的选项不要");
  ok(answerText([{ q: "开心吗？", multi: false, opts: [] }], [{ picks: [], other: "开心" }]) === "Q: 开心吗？\nA: 开心", "没有选项的题：她自己写的那一句");
}

// ---- 名帖里的规矩 ----
{
  const base = { now: new Date(2026, 9, 24, 3, 20), memeList: [], hisAvatarName: "" };
  const s = buildSystem(base).staticText;
  const call = buildSystem({ ...base, call: true }).nowNote;
  ok(s.includes(ASK_RULE) && ASK_RULE.includes("[ASK]") && ASK_RULE.includes("[/ASK]") && ASK_RULE.includes("问（多选）：") && ASK_RULE.includes("- 选项｜说明") && ASK_RULE.includes("Q: 题目") && ASK_RULE.includes("（跳过）"),
    "【回复格式】里教了怎么弹选项卡、她答完发回来是什么样子");
  ok(/\d\. 想让她挑一挑的时候/.test(s) && s.indexOf(ASK_RULE) > s.indexOf("[/DOC]"), "排在文档那一条后面，照样编了号");
  ok(call.includes("不弹选项卡") && CALL_NOTE.includes("不弹选项卡"), "打着电话：不弹选项卡");
  ok(buildSystem({ ...base, thoughts: false }).staticText.includes(ASK_RULE), "心里话关了也有");
}

// ---- 聊天里那一行、对话列表的预览、提要 ----
{
  const qs = [{ q: "吃什么？", multi: false, opts: [{ t: "火锅" }, { t: "烧烤" }] }, { q: "喝什么？", multi: false, opts: [{ t: "茶" }, { t: "奶" }] }];
  const him = { id: "h1", role: "him", ts: 1000, raw: "好\n[ASK]\n…", items: [{ type: "text", text: "好" }, { type: "ask", qs }] };
  const rows = buildRows([{ id: "s1", role: "her", ts: 900, text: "饿了" }, him], null);
  const ask = rows.find((r) => r.type === "ask");
  ok(ask && ask.idx === 1 && ask.msg.id === "h1" && ask.item.qs.length === 2 && !rows.some((r) => r.type === "bubble" && r.item.type === "ask"), "聊天里：选项卡是单独一行（不是气泡），记着是哪一条的第几样");
  const hidden = buildRows([him], { id: "h1", count: 1 });
  ok(!hidden.some((r) => r.type === "ask"), "还在一条一条蹦、没蹦到它：先不摆");
  ok(makePreview([him]) === "好" && makePreview([{ ...him, items: [{ type: "ask", qs }] }]) === "[选项卡] 吃什么？", "对话列表的预览：有字写字，只有一张卡写头一题");
  const her = { id: "s2", role: "her", ts: 2000, text: "Q: 吃什么？\nA: 火锅\n\nQ: 喝什么？\nA: （跳过）" };
  const r = buildRecapAsk({ msgs: [him, her], memeLookup: () => null });
  const text = r.content.map((c) => c.text || "").join("\n");
  ok(text.includes("[选项卡] 吃什么？（火锅／烧烤）；喝什么？（茶／奶）") && text.includes("A: 火锅"), "叫他抄提要：选项卡写成一行（题目、选项），她答的那一条照常");
  const big = { ...him, items: [{ type: "ask", qs: [1, 2, 3, 4].map((i) => ({ q: "长".repeat(80), multi: true, opts: [1, 2, 3, 4].map(() => ({ t: "选".repeat(40) })) })) }] };
  const bigText = buildRecapAsk({ msgs: [big], memeLookup: () => null }).content.map((c) => c.text || "").join("\n");
  const sum = askSummary(big.items[0].qs);
  ok(bigText.includes(sum) && askThick(big) === askThick({ ...big, items: [{ type: "text", text: "字".repeat(sum.length) }] }), "写满的一张卡（四题、每题四个选项）照抄一整行；算厚薄的时候跟一样长的话一样算");
  const tail = tailTranscript([{ id: "s0", role: "her", ts: 1, text: "饿了" }, him, her]);
  ok(tail.includes("你：[选项卡] 吃什么？（火锅／烧烤）；喝什么？（茶／奶）") && tail.includes("卿卿：Q: 吃什么？"), "醒来那会儿抄给他的那段对话里：选项卡一行，她答的照常");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
if (failN) process.exit(1);
