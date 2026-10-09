// 前情提要：一条多厚、用哪一份提要、这一回寄哪些、该不该抄、抄哪一段、抄回来的字怎么收拾；
// 平时寄的那一整段长什么样、缓存接不接得上；叫他抄的那一回寄的是什么。
// 里面的对话都是编的。
import {
  RECALL, DEFAULT_RECALL, RECAP_KEY, RECAP_BAD_KEY, THICK, PIECE_MAX, PIECE_PHOTOS, PIECE_BYTES, PART_MOST, MERGE_MOST, PARTS_MAX, TEXT_MAX, DOC_HEAD, HIS_DOC_HEAD, ROW_HEAD, RETRY_WAITS,
  thick, askThick, clip, rowFloor, roomFor, tierOf, stamp, stampSpan, recapText, normRecaps, pickRecap, planWindow, staleImages, dueRecap, splitForMerge, nextRecap, cleanRecap, addRecap, mayRetry, afterFail, afterAway, loadBad,
} from "../src/recap.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildSystem, withNowNote, TALK_CACHE } from "../src/prompt/system.js";
import { buildRecapAsk, buildMergeAsk, recapLength } from "../src/prompt/recap.js";
import { buildRows } from "../src/chat/rows.js";
import { forkAt, switchAlt } from "../src/thread.js";
import { MEME_DATA } from "../src/memes.js";
import { windowOf, costOf, thinksFirst, MODELS } from "../src/models.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };

// ---- 编对话用的 ----
const T0 = new Date(2026, 9, 1, 9, 0, 0).getTime();
let seq = 0;
const her = (text, extra = {}) => ({ id: "h" + ++seq, role: "her", ts: T0 + seq * 60000, text, ...extra });
const him = (raw, extra = {}) => ({ id: "m" + ++seq, role: "him", ts: T0 + seq * 60000, raw, items: [{ type: "text", text: raw }], ...extra });
const photo = (imgId) => ({ id: "p" + ++seq, role: "her", ts: T0 + seq * 60000, kind: "photo", imgId });
const meme = (file) => ({ id: "e" + ++seq, role: "her", ts: T0 + seq * 60000, kind: "meme", file });
const doc = (chars, docId = "d" + (seq + 1)) => ({ id: "f" + ++seq, role: "her", ts: T0 + seq * 60000, kind: "doc", docId, name: "测试文档.md", fmt: "md", chars });
const fill = (n, ch = "字") => ch.repeat(n);
// 一问一答 turns 个来回，她一句 herLen 字、他一句 hisLen 字
function talk(turns, herLen = 40, hisLen = 60) {
  const out = [];
  for (let i = 0; i < turns; i++) out.push(her(`第${i}问` + fill(herLen)), him(`第${i}答` + fill(hisLen)));
  return out;
}
const sum = (list) => list.reduce((a, m) => a + thick(m), 0);
const oldWindowStart = (n) => (n <= 40 ? 0 : Math.floor((n - 20) / 20) * 20); // 原来 prompt/messages.js 里的那一句
const MID = tierOf("mid");
const noLookup = () => null;
const AV = { her: null, him: null };
const build = (msgs, ctx = {}, img = noLookup, thumb = noLookup, docs = noLookup) => buildMessages(msgs, AV, noLookup, img, thumb, docs, ctx).messages;
// 把寄出去的摊平成一块一块（带着是谁说的），好比两回寄的前面一样不一样
const flat = (api) => api.flatMap((m) => m.content.map((b) => m.role + "|" + JSON.stringify(b)));
const isPrefix = (a, b) => a.length <= b.length && a.every((x, i) => x === b[i]);
const texts = (api) => api.flatMap((m) => m.content.filter((b) => b.type === "text").map((b) => b.text));
const imgCount = (a) => a.reduce((n, m) => n + m.content.filter((b) => b.type === "image").length, 0);
const FAKE_IMG = (n) => "data:image/jpeg;base64," + "A".repeat(n);
// 一份提要（一段）
const R = (upto, at = 1, text = "提要正文" + upto, extra = {}) => ({ id: "r" + upto + "-" + at, upto, parts: [{ text, t0: T0, t1: T0 + 3600000, rows: 10 }], at, ts: T0 + 3600000, n: 0, ...extra });
// 照规矩一趟一趟抄到不用抄为止（最多 max 趟）：回 { list, passes }，passes 是每一趟 dueRecap 给的东西
function chase(msgs, list, tier, bytesOf = () => 0, max = 200) {
  const passes = [];
  let at = 1000;
  for (let i = 0; i < max; i++) {
    const due = dueRecap(msgs, list, tier, bytesOf);
    if (!due) break;
    passes.push(due);
    const text = (due.kind === "merge" ? "并出来的一段" : `第${passes.length}趟抄的`) + fill(700);
    list = addRecap(list, nextRecap(due, text, msgs, { id: "c" + i, at: ++at, model: "测试模型" }));
  }
  return { list, passes };
}
const photosIn = (chat, d) => chat.slice(d.from, d.to + 1).filter((m) => m.kind === "photo").length;
const rowsCovered = (rec) => rec.parts.reduce((a, x) => a + (x.rows || 0), 0);

// =====================================================
// 一条多厚
// =====================================================
ok(thick(her("一二三四五")) === THICK.row + 5 && thick(him("好的")) === THICK.row + 2, "一句话多厚：它的字数，加一点每条都有的零头");
ok(thick(photo("x")) === THICK.row + THICK.photo && THICK.photo === 1500, "一张照片折一千五百字");
ok(thick(meme("a.jpg")) < 250 && thick(meme("a.jpg")) > 100, "一张表情包折一百多字");
ok(thick(doc(30000)) > 30000 && thick(doc(30000)) < 30200 && thick(doc(0)) === THICK.row + 80 + THICK.doc && thick({ role: "her", kind: "doc" }) === THICK.row + 80 + THICK.doc,
  "文档按它的字数算（全文跟着这一行寄）；没记字数的按两千字");
ok(thick({ role: "her", kind: "voice", text: "一二三" }) === THICK.row + 33, "语音按转出来的字算");
ok(thick({ role: "event", av: { type: "meme", file: "a.jpg" } }) > thick({ role: "event", av: null }), "她换头像的那一行：带图的比换回默认的厚");
ok(thick(him("一二三", { items: [{ type: "text", text: "一二三" }, { type: "avatar", file: "a.jpg" }] })) > thick(him("一二三")), "他换了头像的那一条后面跟一行带图的提示，算厚一点");
ok(thick(null) === 0 && thick({ role: "him" }) === THICK.row && thick({ role: "her" }) === THICK.row, "空的、缺字的不出错");
ok(thick(him("说出来的", { thinking: fill(5000) })) === THICK.row + 4, "他的心里话不寄回去，不算厚");
// 叫他抄的时候多厚：太长的只带开头
ok(askThick(doc(90000)) === THICK.row + 80 + DOC_HEAD && askThick(doc(500)) === THICK.row + 580 && askThick(her(fill(50000))) === THICK.row + ROW_HEAD && askThick(her("一二三")) === thick(her("一二三")),
  "叫他抄的时候：九万字的文档只算开头两千五百字，五万字的一条话只算头一万字，平常的话和平时一样厚");
ok(askThick(him("x", { items: [{ type: "text", text: "写好了" }, { type: "doc", name: "a.md", text: fill(8000) }] })) < 1400 && askThick({ role: "him", raw: fill(300) }) === THICK.row + 300 && askThick(meme("a.jpg")) < 60 && askThick(null) === 0,
  "他交的文档只算开头一千二百字；表情包只写名字，不占地方；老数据（没记拆好的几样）照原话算");
// 截字不劈开一个字
const face = "\u{1F98A}"; // 一只狐狸，占两格
ok(clip("一二三四", 2) === "一二" && clip("一二", 5) === "一二" && clip("一" + face + "二", 2) === "一" && clip("一" + face + "二", 3) === "一" + face && clip(null, 3) === "" && clip(12345, 2) === "12",
  "截字：占两格的字不从中间劈开（劈开了那边整段话都不认）");

// =====================================================
// 最后那二三十条
// =====================================================
let same = true;
for (let n = 0; n <= 600; n++) if (rowFloor(n) !== oldWindowStart(n)) same = false;
ok(same && rowFloor(40) === 0 && rowFloor(41) === 20 && rowFloor(60) === 40 && rowFloor(79) === 40, "最后二三十条那条线，和原来“二十条一跳”的窗口一条不差");

// =====================================================
// 三档、屋子
// =====================================================
ok(DEFAULT_RECALL === "mid" && RECALL.short.trigger < RECALL.mid.trigger && RECALL.mid.trigger < RECALL.long.trigger && Object.values(RECALL).every((t) => t.keep < t.trigger && t.label),
  "三档：短、适中、长，默认适中；每一档留的原话都比攒的少");
ok(MID.trigger === 50000 && MID.keep === 15000 && MID.hard === 75000 && MID.room === Infinity && MID.most === Infinity, "适中：攒到五万字抄，最近一万五千字留原话，抄不成的时候老的那一段最多寄七万五");
ok(JSON.stringify(tierOf("没有这一档")) === JSON.stringify(MID) && JSON.stringify(tierOf(undefined)) === JSON.stringify(MID) && JSON.stringify(tierOf("constructor")) === JSON.stringify(MID) && JSON.stringify(tierOf("__proto__")) === JSON.stringify(MID),
  "没选过、认不得的档（连“constructor”这种怪名字）：当适中");
const big = roomFor(1000000, 60000, 2048);
const small = roomFor(200000, 60000, 2048);
const smallSure = roomFor(200000, 60000, 2048, true);
ok(big > RECALL.long.trigger * 1.5 && tierOf("long", big).hard === 180000, "一百万的屋子：名帖记忆库六万字也放得下“长”那一档");
const tight = tierOf("mid", small, smallSure);
ok(small > 20000 && small < 30000 && tight.room === small && tight.hard === Math.round(small * 0.8) && tight.trigger === Math.round(tight.hard / 1.5) && tight.keep === Math.round(tight.trigger * 0.3) && tight.trigger < MID.trigger,
  `二十万的屋子、名帖记忆库六万字：往多里算只放得下 ${small} 字的对话，适中那一档跟着缩（攒到 ${tight.trigger} 字就抄）`);
ok(smallSure > 120000 && tight.most === smallSure && smallSure > small * 4, `同一间屋子往少里算放得下 ${smallSure} 字：照这个数都放不下，才去动最后那二三十条`);
ok(tierOf("mid", -5000).room === 16000 && tierOf("mid", -5000).hard === 12800 && tierOf("mid", 0).room === 16000 && tierOf("mid", 3000, 2000).most === 16000 && roomFor(0, 0, 0) === roomFor(200000, 0, 0),
  "屋子算出来太小、是负的（记忆库比屋子还大）：当它放得下一万六千字；没说屋子多大按二十万算");
ok(MODELS.every((m) => windowOf(m.id) >= 200000) && windowOf("claude-haiku-4-5-20251001") === 200000 && windowOf("claude-opus-4-6") === 1000000 && windowOf("claude-sonnet-4-6") === 1000000 && windowOf("claude-opus-5-5") === 1000000 && windowOf("claude-不认识") === 200000 && windowOf("") === 200000,
  "各模型的屋子：Haiku 4.5 二十万，别的五个一百万；不认识的按二十万");

// 价目：现在每句话大半是从缓存读的，读缓存的价错了，估出来的钱就跟着错。照官方价目页（2026年10月）对一遍
const M = 1000000;
const price = (id) => [costOf(id, { input_tokens: M }), costOf(id, { cache_creation_input_tokens: M }), costOf(id, { cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: M } }), costOf(id, { cache_read_input_tokens: M }), costOf(id, { output_tokens: M })].join("/");
ok(price("claude-fable-5-1") === "10/12.5/20/0.25/50" && price("claude-opus-5-5") === "4/5/8/0.2/20" && price("claude-sonnet-5-5") === "2/2.5/4/0.1/10" && price("claude-opus-4-6") === "5/6.25/10/0.5/25" && price("claude-sonnet-4-6") === "3/3.75/6/0.3/15" && price("claude-haiku-4-5-20251001") === "1/1.25/2/0.1/5" && costOf("claude-不认识", { input_tokens: M }) === null,
  "各模型的价（每百万 token：新读、写五分钟的缓存、写一小时的缓存、读缓存、写出）和官方价目页一样；读缓存是原价的一成，5.5 那两个是半成，Fable 是四十分之一");
ok(thinksFirst("claude-fable-5-1") && thinksFirst("claude-opus-5-5") && thinksFirst("claude-sonnet-5-5") && !thinksFirst("claude-opus-4-6") && !thinksFirst("claude-sonnet-4-6") && !thinksFirst("claude-haiku-4-5-20251001") && !thinksFirst("claude-haiku-4-5")
  && thinksFirst("claude-不认识") && thinksFirst("") && thinksFirst(undefined) && MODELS.filter((m) => thinksFirst(m.id)).map((m) => m.label).join("、") === "Fable 5.1、Opus 5.5、Sonnet 5.5",
  "哪些模型自己会先想一阵再写：5 字头的那三个会（关不掉）；上一代的三个不会；不认识的当它会（上限往宽里放）");

// =====================================================
// 提要的字、单子
// =====================================================
ok(stamp(T0) === "2026年10月1日 09:00" && stamp(T0 + 13 * 3600000 + 5 * 60000) === "2026年10月1日 22:05", "钟点的写法定死：年月日 时:分");
// 钟点都拿本地的年月日时分来造（不拿毫秒去加），在有夏令时的时区里跑也一样
const at = (mo, d, h, mi, y = 2026) => new Date(y, mo - 1, d, h, mi, 0).getTime();
ok(stampSpan(T0, at(10, 1, 10, 0)) === "2026年10月1日 09:00 到 10:00" && stampSpan(T0, T0) === "2026年10月1日 09:00 到 09:00" && stampSpan(T0, at(10, 1, 23, 59)) === "2026年10月1日 09:00 到 23:59"
  && stampSpan(T0, at(10, 2, 0, 0)) === "2026年10月1日 09:00 到 2026年10月2日 00:00" && stampSpan(T0, at(10, 2, 9, 0)) === "2026年10月1日 09:00 到 2026年10月2日 09:00"
  && stampSpan(T0, at(11, 1, 9, 0)) === "2026年10月1日 09:00 到 2026年11月1日 09:00" && stampSpan(T0, at(10, 1, 9, 0, 2027)) === "2026年10月1日 09:00 到 2027年10月1日 09:00",
  "从几点到几点：同一天的后头只写钟点；跨了天、隔一个月同一号、隔一年同月同日的，后头的日子照写全");
const twoParts = [{ text: "头一段", t0: T0, t1: T0 + 3600000, rows: 5 }, { text: "  第二段  ", t0: T0 + 7200000, t1: at(10, 2, 11, 30), rows: 7 }];
ok(recapText(twoParts) === "〔2026年10月1日 09:00 到 10:00〕\n头一段\n\n〔2026年10月1日 11:00 到 2026年10月2日 11:30〕\n第二段" && recapText([{ text: "没记钟点的" }]) === "没记钟点的" && recapText([]) === "" && recapText(null) === "",
  "几段连成一整份：每段前面一行写它抄的是几点到几点的原话；没记钟点的那一行不写");
const normed = normRecaps([null, 1, {}, { upto: "a" }, { upto: "a", parts: [] }, { upto: "a", parts: [{ text: "  " }] }, { upto: "", parts: [{ text: "有字" }] }, { upto: "a", text: "只有一整份字、没分段的" }, { upto: "a", parts: [{ text: "有字" }, null, { text: "" }, { text: "还有" }] }]);
ok(normed.length === 1 && normed[0].parts.length === 2 && normed[0].text === "有字\n\n还有" && normRecaps("乱的").length === 0 && normRecaps(null).length === 0, "单子收拾一遍：坏的、空的、没有分段的不认，也不出错；每一份上现连出整份的字");

// =====================================================
// 用哪一份提要
// =====================================================
seq = 0;
const base = talk(50); // 100 条
ok(pickRecap(base, []).at === -1 && pickRecap(base, null).recap === null && pickRecap(base, "乱的").at === -1, "没有提要：不用");
ok(pickRecap(base, [R(base[19].id)]).at === 19 && pickRecap(base, [R(base[19].id)]).recap.upto === base[19].id && pickRecap(base, [R(base[19].id)]).recap.text.endsWith("提要正文" + base[19].id), "有一份、它抄到的那一条在这段对话里：用它");
ok(pickRecap(base, [R(base[19].id, 1), R(base[59].id, 2), R(base[39].id, 3)]).at === 59, "有好几份：用抄得最靠后的那一份，不看谁后抄");
ok(pickRecap(base, [R("不在这段对话里"), R(base[9].id)]).at === 9 && pickRecap(base, [R("不在这段对话里")]).at === -1, "它抄到的那一条不在摆在外面的这一支里：不作数");
ok(pickRecap(base, [R(base[9].id, 5, "先抄的"), R(base[9].id, 9, "后抄的"), R(base[9].id, 7, "中间的")]).recap.parts[0].text === "后抄的", "两份抄到同一条（两台设备各抄了一回）：用后抄的");
ok(pickRecap(base, [{ upto: base[5].id, parts: [{ text: "" }] }, null]).at === -1 && pickRecap([], [R("x")]).at === -1 && pickRecap([{ id: "__proto__", role: "her", text: "怪编号" }], [R("__proto__")]).at === 0, "坏的不认；对话是空的不出错；怪编号也认得准");
// 她改了前面的话：提要抄到的那一条不在外面了；翻回来又在
const forked = forkAt(base, 10, { ...base[10], id: "改过的", text: "改了" });
const backAgain = switchAlt(forked, 10, 0);
ok(forked.length === 11 && pickRecap(forked, [R(base[59].id), R(base[5].id)]).at === 5 && pickRecap(forked, [R(base[59].id)]).at === -1,
  "她改了第 11 条（后面的收进别的分支）：抄到第 60 条的那份不作数了，抄到第 6 条的还作数");
ok(backAgain.length === 100 && pickRecap(backAgain, [R(base[59].id), R(base[5].id)]).at === 59, "翻回原来那一支：抄到第 60 条的那份又作数了");

// =====================================================
// 这一回寄哪些
// =====================================================
let p = planWindow(base, [], MID);
ok(p.from === 0 && p.gap === 0 && p.over === 0 && p.recap === null && p.total === sum(base) && p.sent === p.total, "一百条、不厚、没提要：从头全寄（原来只寄最后四十条）");
p = planWindow(base, [R(base[59].id)], MID);
ok(p.from === 60 && p.start === 60 && p.gap === 0 && p.over === 0 && p.at === 59 && p.sent === sum(base.slice(60)), "有提要：从它抄到的下一条寄起");
ok(planWindow([], [], MID).from === 0 && planWindow([], [R("x")], MID).sent === 0 && planWindow([her("一句")], [], MID).from === 0, "空对话、只有一句的对话：不出错");

// 她那些早就聊得很长、从来没抄过的旧对话：硬切
seq = 0;
const legacy = talk(1500, 120, 280); // 3000 条，六十多万字
// 老的那一段（切口之后、最后六七十条之前）留下多厚
const midKept = (chat, plan) => sum(chat.slice(plan.from, Math.max(plan.from, rowFloor(chat.length) - 40)));
p = planWindow(legacy, [], MID);
ok(p.total > 600000 && p.from > 0 && p.gap === p.from && midKept(legacy, p) <= MID.hard && midKept(legacy, p) > MID.hard * 0.75 - 500 && p.from < rowFloor(legacy.length) && p.sent === sum(legacy.slice(p.from)),
  `旧对话三千条、六十多万字、提要还没抄：硬切，这一回先寄最后 ${legacy.length - p.from} 条（${p.sent} 字；最后六七十条之前的那一段在七万五以内）`);
// 往后一句一句添：切口只偶尔跳一下，不是每句都挪；只往后不往前
let moves = 0, backwards = false, outOfBand = false, grow = legacy.slice(), lastFrom = p.from, biggestJump = 0;
for (let i = 0; i < 400; i++) {
  grow = grow.concat([i % 2 ? him("添的答" + fill(140)) : her("添的问" + fill(60))]);
  const q = planWindow(grow, [], MID);
  if (q.from !== lastFrom) { moves++; biggestJump = Math.max(biggestJump, sum(grow.slice(lastFrom, q.from))); }
  if (q.from < lastFrom) backwards = true;
  if (midKept(grow, q) > MID.hard || midKept(grow, q) < MID.hard * 0.75 - 500) outOfBand = true;
  lastFrom = q.from;
}
ok(moves >= 1 && moves <= 3 && !backwards && !outOfBand && biggestJump < MID.hard / 4 + 500,
  `接着添四百条（四万多字）：切口一共只挪了 ${moves} 回，每回跳四分之一个 hard，两跳之间前面一个字不变（缓存接得上）`);
// 不比原来少：不管多厚、怎么切，寄的头一条都不晚于原来那个窗口的头一条
let neverLess = true;
seq = 0;
for (const [turns, a, b] of [[30, 10, 20], [200, 50, 100], [400, 300, 900], [60, 2000, 4000], [25, 5000, 9000]]) {
  const chat = talk(turns, a, b);
  for (let n = 1; n <= chat.length; n += 7) {
    const cut = chat.slice(0, n);
    for (const tier of [tierOf("short"), MID, tierOf("long"), tierOf("mid", 20000)]) {
      if (planWindow(cut, [], tier).from > oldWindowStart(n)) neverLess = false;
      // 带着一份抄到各处的提要也一样（抄到最后二三十条里头的也算上）
      for (const at of [0, Math.floor(n / 2), n - 1]) if (planWindow(cut, [R(cut[at].id)], tier).from > oldWindowStart(n)) neverLess = false;
    }
  }
}
ok(neverLess, "各种长短厚薄的对话、三档、屋子小的模型、带着抄到各处的提要都试：寄的头一条从不晚于原来那个窗口的头一条（寄的永远不比原来少）");
// 重着寄：她点了重新回答、改了前面的话，这一支短了，提要抄到的地方落在最后二三十条里头
seq = 0;
const long600 = talk(300);
const nearEnd = [R(long600[467].id)];
const retried = long600.slice(0, 469); // 在第 470 条上点重新回答：寄的是它前面的 469 条
p = planWindow(retried, nearEnd, MID);
ok(p.at === 467 && p.start === 468 && p.from === rowFloor(469) && p.from === 440 && p.over === 28 && p.gap === 0 && p.sent === sum(retried.slice(440)),
  "提要抄到第 468 条、她在第 470 条上点重新回答：原话照样从最后二三十条寄起（原来也是寄这些），和提要重着的 28 条在附注里说一声");
ok(planWindow(long600.slice(0, 468), nearEnd, MID).from === 440 && planWindow(long600.slice(0, 468), nearEnd, MID).sent > 0 && planWindow(base.slice(0, 30), [R(base[29].id)], MID).from === 0,
  "提要抄到的正好是最后一条：也照寄最后二三十条，不会寄出一封空信");
// 最后二三十条里有大文档：前面的照寄
seq = 0;
const withDoc = talk(40).concat([doc(90000), him("看完了")], talk(5));
p = planWindow(withDoc, [], MID);
ok(p.sent > 90000 && p.from === 0 && p.gap === 0 && withDoc.findIndex((m) => m.kind === "doc") >= rowFloor(withDoc.length), "最后二三十条里有一份九万字的文档：照寄，也不为它去切前面的话（切了也省不下多少）");
// 屋子：往多里算放不下不动最后二三十条；往少里算都放不下才切，切到她眼下问的这一轮为止
seq = 0;
const asking = talk(30).concat([doc(15000), him("看完了第一份"), doc(15000), him("看完了第二份"), her("那第二份里说的对吗"), her("你再想想")]);
p = planWindow(asking, [], tierOf("mid", 20000, 200000));
ok(p.from === rowFloor(asking.length) && p.from === 40 && p.gap === 40 && p.sent > 30000 && asking.slice(p.from).filter((m) => m.kind === "doc").length === 2,
  "往多里算屋子只放得下两万字、往少里算放得下二十万：最后二三十条里的两份文档照寄（估得保守不能白白少寄），它们前面的切到原来那个窗口为止");
const tiny = tierOf("mid", 20000, 20000);
p = planWindow(asking, [], tiny);
ok(p.sent <= 20000 && asking[p.from].raw === "看完了第一份" && asking.slice(p.from).filter((m) => m.kind === "doc").length === 1 && p.from < asking.length - 2,
  "往少里算也只放得下两万字：切到放得下为止，老的那份文档不寄了，新的那份和她眼下问的照寄");
seq = 0;
const hugeAsk = talk(30).concat([him("上一句"), her("先看这个"), doc(60000), her("看完说说")]);
p = planWindow(hugeAsk, [], tiny);
ok(hugeAsk[p.from].text === "先看这个" && p.sent > 20000, "她眼下问的这一轮自己就比屋子大：这一轮整个照寄（不从她的话中间切），寄不寄得成交给那边");
// 她眼下问的这一轮里夹着一行换头像：也算在这一轮里
seq = 0;
const withEvent = talk(30).concat([him("上一句"), her("先看这个"), { id: "evx", role: "event", who: "her", av: null, ts: T0 }, doc(60000), her("看完说说")]);
p = planWindow(withEvent, [], tiny);
ok(withEvent[p.from].text === "先看这个" && withEvent.slice(p.from).length === 4, "她这一轮里夹着一行换头像：这一轮还是从她的头一句算起，整个照寄");
// 提要抄到最后二三十条里头（重着寄）、又放不下：照样切到她眼下问的这一轮
seq = 0;
const overAsk = talk(30).concat([doc(15000), him("看完了第一份"), doc(15000), him("看完了第二份"), her("那第二份里说的对吗"), her("你再想想")]);
p = planWindow(overAsk, [R(overAsk[60].id)], tiny);
ok(p.at === 60 && p.sent <= 20000 && overAsk[p.from].raw === "看完了第一份" && p.over === 0 && p.gap === 0 + (p.from - 61) && p.from > rowFloor(overAsk.length),
  "提要抄到了最后二三十条里头、往少里算又放不下：不重着寄了，从提要之后寄起，再切到放得下为止");
// 有提要、提要之后又攒得太厚（一直抄不成）
seq = 0;
const stuck = talk(1000, 60, 140);
p = planWindow(stuck, [R(stuck[99].id)], MID);
ok(p.at === 99 && p.start === 100 && p.from > 100 && p.gap === p.from - 100 && p.over === 0 && midKept(stuck, p) <= MID.hard, "有提要、之后又攒了二十万字没抄成：提要照用，它后面太老的这一回先不寄，记下多少条");

// =====================================================
// 图
// =====================================================
seq = 0;
const pics = [];
for (let i = 0; i < 70; i++) pics.push(meme("m" + i + ".jpg"), him("哈"));
const b1 = () => 1000;
const inBody = (chat) => chat.slice(0, rowFloor(chat.length)).filter((m) => m.kind === "meme" || m.kind === "photo").length;
ok(inBody(pics.slice(0, 100)) === 40 && staleImages(pics.slice(0, 100), 0, b1).size === 0, "最后二三十条前面有四十张图：都带");
let st = staleImages(pics.slice(0, 120), 0, b1);
ok(inBody(pics.slice(0, 120)) === 50 && st.size === 20 && st.has(0) && st.has(38) && !st.has(40), "前面攒到五十张：最老的二十张不带图了（一跳二十张，带着的在二十到四十张之间）");
let stable = true, tailKept = true;
for (let n = 41; n <= pics.length; n++) {
  const gone = staleImages(pics.slice(0, n), 0, b1);
  for (const i of gone) if (i >= rowFloor(n)) tailKept = false;
  if (n > 41) for (const i of staleImages(pics.slice(0, n - 1), 0, b1)) if (!gone.has(i)) stable = false;
}
ok(stable && tailKept, "一条一条添着看：不带图的只增不减（前面不变，缓存接得上）；最后二三十条里的图一张不去");
ok(staleImages(pics, 62, b1).size === 0 && staleImages(pics, 0, () => 0).size === 0, "只数这一回寄的那一段里的；本来就没图的不算");
seq = 0;
const allPhotos = [];
for (let i = 0; i < 59; i++) allPhotos.push(photo("i" + i));
st = staleImages(allPhotos, 0, () => 475000);
ok(st.size > 0 && st.size <= 59 - 39 && [...st].every((i) => i < rowFloor(59)), "五十九张大照片连着发：最后三十九条里的都带（原来也是带这三十九张），去掉的只在它们前面");
seq = 0;
const heavyPics = [];
for (let i = 0; i < 40; i++) heavyPics.push(photo("i" + i), him("好看"));
st = staleImages(heavyPics, 0, () => 700000);
ok(st.size > 0 && st.has(0) && (30 - st.size) * 700000 <= 9000000 && [...st].every((i) => i < 60), "最后二三十条前面有三十张照片一共二十一兆：从最老的去掉几张，那一段剩下的在九兆以内");

// 照片和表情包混着：张数超了先去表情包的图，照片的留着
seq = 0;
const mixed = [];
for (let i = 0; i < 5; i++) mixed.push(photo("mx" + i), him("好看"));
for (let i = 0; i < 60; i++) mixed.push(meme(MEME_DATA[0].file), him("哈"));
const mixedBytes = (m) => (m.kind === "photo" ? 300000 : 8000);
st = staleImages(mixed, 0, mixedBytes);
ok(inBody(mixed) === 50 && st.size === 20 && [...st].every((i) => mixed[i].kind === "meme") && st.has(10) && st.has(48) && !st.has(50) && ![0, 2, 4, 6, 8].some((i) => st.has(i)),
  "五张照片、后面六十张表情包（最后二三十条前面一共五十张图）：去掉的二十张全是表情包，最老的那五张照片的图都留着");
const mixedApi = build(mixed, {}, () => FAKE_IMG(300000));
ok(texts(mixedApi).filter((t) => t === "[她发了一张照片]").length === 5 && !texts(mixedApi).some((t) => t.includes("没带上")) && texts(mixedApi).filter((t) => t.startsWith("[她发了一张表情包：")).length === 60 && imgCount(mixedApi) === 5 + 40 && dueRecap(mixed, [], tierOf("short"), mixedBytes) === null,
  "寄的时候：五张照片都带着图；表情包那句话一句不少，去了图的只是没有图；这么薄也用不着抄");
st = staleImages(mixed.slice(0, 10).concat(mixed.slice(10).map((m) => (m.kind === "meme" ? { ...m, kind: "photo", imgId: "was-meme" } : m))), 0, () => 300000);
ok(st.size > 0 && st.has(0), "全是照片的时候（没有表情包可去）：才从最老的照片去起");
// 照片太大：只算照片的大小，从最老的照片去起；表情包照张数另算
seq = 0;
const heavyMix = [];
for (let i = 0; i < 12; i++) heavyMix.push(photo("hm" + i), him("好看"));
for (let i = 0; i < 50; i++) heavyMix.push(meme(MEME_DATA[0].file), him("哈"));
st = staleImages(heavyMix, 0, (m) => (m.kind === "photo" ? 800000 : 8000));
ok([...st].filter((i) => heavyMix[i].kind === "photo").sort((x, y) => x - y).join() === "0,2,4,6" && [...st].filter((i) => heavyMix[i].kind === "meme").length === 20,
  "十二张照片一共九兆六、加上表情包：照片从最老的去四张（剩下的在九兆以内），表情包照张数去二十张");

// =====================================================
// 该不该抄、抄哪一段
// =====================================================
seq = 0;
ok(dueRecap(talk(100), [], MID) === null, "两百条、两万来字：不厚，不抄");
seq = 0;
ok(dueRecap(talk(15, 2000, 4000), [], MID) === null, "三十条、九万字：再厚也不抄（最后二三十条不抄）");
seq = 0;
const thickChat = talk(300, 60, 140); // 600 条，六万七千字
let due = dueRecap(thickChat, [], MID);
ok(due && due.kind === "piece" && due.from === 0 && due.prev === null && due.n === due.to + 1 && due.upto === thickChat[due.to].id && due.ts === thickChat[due.to].ts && due.thick <= PIECE_MAX && due.thick > PIECE_MAX - 400 && PIECE_MAX === 18000,
  `攒够了：要抄。从头抄起，一趟读到一万八千字为止（这一趟 ${due ? due.to + 1 : "?"} 条），记下抄到哪一条、它是第几条、几点说的`);
ok(due.more === true && thickChat[due.to].role === "him" && thickChat[due.to + 1].role === "her", "一趟没抄到头：记上“还得接着抄”；切在一轮的末尾（抄到他的一条回话为止）");
let run = chase(thickChat, [], MID);
let fin = pickRecap(thickChat, run.list).recap;
ok(run.passes.length === 3 && run.passes.every((d) => d.kind === "piece") && run.passes[1].from === run.passes[0].to + 1 && run.passes[1].prev.upto === run.passes[0].upto && run.passes[1].more === true && run.passes[2].from === run.passes[1].to + 1 && run.passes[2].prev.parts.length === 2 && run.passes[2].more === false,
  "接着抄第二趟、第三趟：不等再攒够，从上一趟抄到的下一条抄起，前面抄好的带着给他对照；第三趟抄到头了");
ok(fin.parts.length === 3 && rowsCovered(fin) === fin.n && fin.more === false && fin.parts[0].t0 === thickChat[0].ts && fin.parts[1].t0 === thickChat[run.passes[1].from].ts && fin.parts[2].t1 === thickChat[fin.n - 1].ts && thickChat[fin.n - 1].role === "him" && thickChat[fin.n].role === "her",
  "三趟抄下来：提要里三段，头一条到抄到的那一条一条不落；每段记着它抄的是几点到几点");
ok(sum(thickChat.slice(fin.n)) <= MID.keep + 300 && sum(thickChat.slice(fin.n)) > MID.keep - 600 && fin.n <= rowFloor(thickChat.length),
  `留下最近 ${thickChat.length - fin.n} 条（${sum(thickChat.slice(fin.n))} 字，一万五上下）原话不抄`);
ok(dueRecap(thickChat, run.list, MID) === null && planWindow(thickChat, run.list, MID).from === fin.n && planWindow(thickChat, run.list, MID).gap === 0, "抄完以后：不会马上再抄；寄的从留下的那一段起");
// 接着聊：再攒够了抄下一段，从上一份之后抄起
seq = 100000;
const later = thickChat.concat(talk(200, 60, 140));
const due2 = dueRecap(later, run.list, MID);
ok(due2 && due2.kind === "piece" && due2.from === fin.n && due2.prev.upto === fin.upto && due2.to > fin.n && later[due2.to].role === "him", "接着聊够了：再抄一段，从上一份之后抄起");
ok(dueRecap(later.slice(0, fin.n + 200), run.list, MID) === null, "上一份之后才攒了两万来字：不抄");

// 旧对话：从头一条一趟一趟追上来，没有哪一条是跳过去不抄的
run = chase(legacy, [], MID);
fin = pickRecap(legacy, run.list).recap;
const pieces = run.passes.filter((d) => d.kind === "piece");
const merges = run.passes.filter((d) => d.kind === "merge");
let contiguous = pieces[0].from === 0;
for (let i = 1; i < pieces.length; i++) if (pieces[i].from !== pieces[i - 1].to + 1) contiguous = false;
ok(contiguous && pieces.length >= 33 && pieces.length <= 38 && pieces.every((d) => d.thick <= PIECE_MAX) && pieces.slice(0, -1).every((d) => d.more) && !pieces[pieces.length - 1].more,
  `旧对话三千条、六十多万字：一趟一段从头追，一共 ${pieces.length} 趟，一趟接一趟，中间没有跳过去的`);
ok(rowsCovered(fin) === fin.n && fin.n === pieces[pieces.length - 1].to + 1 && sum(legacy.slice(fin.n)) <= MID.keep + 500 && fin.more === false,
  `追完了：头 ${fin.n} 条都在提要里（各段抄的条数加起来正好），剩下最近 ${legacy.length - fin.n} 条原话`);
ok(merges.length >= 2 && fin.parts.length <= PARTS_MAX && fin.text.length <= TEXT_MAX && run.passes.every((d, i) => d.kind !== "merge" || (run.passes[i - 1] && run.passes[i - 1].kind === "piece")),
  `段数攒过十六段就并：中间并了 ${merges.length} 回，最后提要是 ${fin.parts.length} 段、${fin.text.length} 字`);
ok(planWindow(legacy, run.list, MID).gap === 0 && planWindow(legacy, run.list, MID).from === fin.n && dueRecap(legacy, run.list, MID) === null, "追完以后：寄的就是提要加最近的原话，中间没有没寄的；不再抄");
// 追到一半的时候：提要照用，它后面太老的先不寄，写明多少条
const half = chase(legacy, [], MID, () => 0, 5);
const halfPlan = planWindow(legacy, half.list, MID);
ok(half.passes.length === 5 && halfPlan.recap.more === true && halfPlan.gap > 1000 && halfPlan.start === pickRecap(legacy, half.list).recap.n && halfPlan.from === halfPlan.start + halfPlan.gap,
  `追到一半（抄了五趟）：提要抄到第 ${halfPlan.start} 条，它后面还有 ${halfPlan.gap} 条这一回先不寄，等提要追上来`);

// 她把“他记多长”拨小了、换了屋子小的模型：也是一趟一趟追，不丢
seq = 0;
const roomy = talk(350, 110, 200); // 700 条，十一万多字：在“长”那一档底下用不着抄
ok(dueRecap(roomy, [], tierOf("long")) === null && planWindow(roomy, [], tierOf("long")).from === 0, "七百条、十一万多字，“长”那一档：全寄原话，用不着抄");
const shortTier = tierOf("short");
const firstShort = dueRecap(roomy, [], shortTier);
ok(planWindow(roomy, [], shortTier).gap > 0 && firstShort.kind === "piece" && firstShort.from === 0, "拨到“短”：这一回寄的硬切了，可抄提要是从头一条抄起的（不是从切口抄起）");
run = chase(roomy, [], shortTier);
fin = pickRecap(roomy, run.list).recap;
ok(rowsCovered(fin) === fin.n && fin.more === false && sum(roomy.slice(fin.n)) <= shortTier.keep + 400, `在“短”那一档追完：头 ${fin.n} 条都抄进提要了，一条没跳`);
p = planWindow(roomy, run.list, tierOf("long"));
ok(p.from === fin.n && p.gap === 0 && p.over === 0, "再拨回“长”：寄的是提要加它后面的原话，没有哪一段既没寄也没抄");
const haiku = tierOf("mid", roomFor(200000, 60000, 2048), roomFor(200000, 60000, 2048, true));
run = chase(roomy, [], haiku);
fin = pickRecap(roomy, run.list).recap;
ok(run.passes.filter((d) => d.kind === "piece").every((d) => d.thick <= haiku.room - TEXT_MAX) && rowsCovered(fin) === fin.n && planWindow(roomy, run.list, MID).gap === 0,
  "换到屋子小的模型抄：一趟读得少一点（放得下），照样从头追完；再换回大屋子的模型，没有丢的");

// 屋子小的模型、话又厚：硬切让出来的那四十条加上最后二三十条，往多里算放不下，就接着往后切，最多切到最后二三十条跟前
seq = 0;
const cram = talk(200, 300, 500); // 400 条，一条三五百字，十六万多字
p = planWindow(cram, [], haiku);
const pWide = planWindow(cram, [], { ...haiku, room: Infinity });
ok(haiku.room === 26220 && pWide.sent > haiku.room && p.from > pWide.from && p.from < rowFloor(cram.length) && p.sent <= haiku.room && p.sent > haiku.room * 0.85 && p.gap === p.from,
  `二十万的屋子、名帖记忆库六万字、一条三五百字：光是硬切的话要寄 ${pWide.sent} 字，放不下；接着往后切到放得下（寄 ${p.sent} 字），比原来那个窗口还是多寄 ${rowFloor(cram.length) - p.from} 条`);
let cramGrow = cram.slice(), cramMoves = 0, cramBad = 0, cramLast = p.from;
for (let i = 0; i < 80; i++) {
  cramGrow = cramGrow.concat([i % 2 ? him("添答" + fill(500)) : her("添问" + fill(300))]);
  const q = planWindow(cramGrow, [], haiku);
  if (q.from !== cramLast) cramMoves++;
  if (q.from > rowFloor(cramGrow.length) || !(q.sent <= haiku.room || q.from === rowFloor(cramGrow.length))) cramBad++;
  cramLast = q.from;
}
ok(cramBad === 0 && cramMoves <= 20, `接着添八十条：回回都放得下，从不切过最后二三十条那条线；切口跳着挪（挪了 ${cramMoves} 回，不是每句都挪）`);
// 有一截没寄的：不等攒够就抄，抄到寄的时候没有空着的一截为止
run = chase(cram, [], haiku);
fin = pickRecap(cram, run.list).recap;
p = planWindow(cram, run.list, haiku);
ok(run.passes.length >= 8 && run.passes.every((d) => d.kind === "merge" || d.thick <= haiku.room - TEXT_MAX) && rowsCovered(fin) === fin.n && p.gap === 0 && p.from === fin.n && p.sent <= haiku.room && dueRecap(cram, run.list, haiku) === null,
  `这样的对话抄提要：一趟一趟追，追到寄的时候没有空着的一截（提要抄到第 ${fin.n} 条，后面寄 ${p.sent} 字原话）`);
seq = 0;
const holed = talk(40, 300, 500).concat(talk(15, 1500, 2500)); // 前面三万多字，最后三十条六万字：最后二三十条自己就比屋子厚
const pHole = planWindow(holed, [], haiku);
run = chase(holed, [], haiku);
p = planWindow(holed, run.list, haiku);
ok(pHole.from === rowFloor(holed.length) && pHole.gap > 0 && pHole.sent > haiku.room && pickRecap(holed, run.list).recap.n === rowFloor(holed.length) && p.gap === 0 && p.over === 0 && p.sent === pHole.sent,
  "最后二三十条自己就比屋子厚：切到那条线为止不再切（和原来寄的一样多）；它前面的不管厚薄都抄进提要，没有既不寄也不抄的");
// 很薄的一截也照抄：屋子小、最后二三十条又厚，前面只空着一千来字
seq = 0;
const sliver = talk(10, 40, 60).concat(talk(19, 1500, 2500), [her(fill(1500))]); // 前面二十条一千多字，后面三十九条七万多字
ok(rowFloor(sliver.length) === 20 && planWindow(sliver, [], haiku).gap === 20 && sum(sliver.slice(0, 20)) < 1500 && dueRecap(sliver, [], haiku) !== null && dueRecap(sliver, [], haiku).from === 0 && dueRecap(sliver, [], haiku).to === 19 && dueRecap(sliver, [], haiku).more === false && dueRecap(sliver, [], MID) === null && planWindow(sliver, [], MID).gap === 0,
  "没寄的那一截只有一千来字：也抄（平常这么薄是不抄的），不让它一直空着；屋子够大的时候本来就都寄了，不抄");
// 切口跳着挪：八分之一个屋子一跳（这两个数就是照这个步子算出来的）
ok(planWindow(cram, [], haiku).from === 341 && planWindow(cram, [], haiku).sent === 24467 && Math.round(haiku.room / 8) === 3278, "屋子小的那种切，一跳是八分之一个屋子：四百条的那段对话切在第 342 条上");
// 提要自己也占地方：看放不放得下的时候算上
const shortHead = [R(cram[339].id, 1, "短短的提要")];
const longHead = [R(cram[339].id, 1, fill(5000))];
ok(planWindow(cram, shortHead, haiku).from === 340 && planWindow(cram, shortHead, haiku).gap === 0 && planWindow(cram, longHead, haiku).from > 340 && planWindow(cram, longHead, haiku).sent + 5000 <= haiku.room + 60 && planWindow(cram, longHead, MID).from === 340
  && planWindow(cram, [R(cram[339].id, 1, fill(4000))], haiku).from === 348,
  "提要之后的原话正好放得下、可提要自己有五千字：连它一起算就放不下了，接着往后切一跳；屋子够大的不受影响");
// 有一截没寄的时候，一趟抄到最后二三十条跟前为止，不往前退到一轮的末尾（退了的话留下的那半轮又寄不出去，还得单为它问一回）
seq = 0;
const parity = [her("先说一句" + fill(400))].concat(talk(49, 400, 1500)); // 99 条：最后二三十条那条线正好落在她的一问和他的一答中间
run = chase(parity, [], haiku);
fin = pickRecap(parity, run.list).recap;
ok(rowFloor(parity.length) === 60 && parity[59].role === "her" && parity[60].role === "him" && planWindow(parity, [], haiku).gap === 60 && fin.n === 60 && run.passes.every((d) => d.kind === "merge" || sum(parity.slice(d.from, d.to + 1)) >= 1500) && run.passes.length === 4 && run.passes[3].to === 59 && run.passes[3].to - run.passes[3].from >= 5 && planWindow(parity, run.list, haiku).gap === 0,
  `最后二三十条那条线落在她的一问和他的一答中间、屋子又小：四趟抄到那条线为止，最后一趟连她那一问一起抄了，没有单为那一问再跑一趟`);
// 她那一问有两千字（不算零头）：有一截空着的时候照样不往前退，连它一起抄，不留它单跑一趟
seq = 0;
const cutBig = [her("先说一句" + fill(400))].concat(talk(49, 2000, 1500));
run = chase(cutBig, [], haiku);
ok(cutBig[59].role === "her" && thick(cutBig[59]) > 1500 && planWindow(cutBig, [], haiku).gap === 60 && run.passes.every((d) => d.kind === "merge" || d.to > d.from) && run.passes.filter((d) => d.kind === "piece").slice(-1)[0].to === 59 && pickRecap(cutBig, run.list).recap.n === 60,
  "那条线前头她那一问有两千字、中间又有一截空着：最后一趟连它一起抄到那条线为止，没有哪一趟只抄一条");
// 没有空着的一截、可屋子快满了：留在前头的要是只有一点零头，也不往前退（往后再添几句它就寄不出去了）；屋子宽裕的照旧退
const nearFull = tierOf("mid", 50000, 200000);
const chasing54 = [R(parity[53].id, 1, "提要", { more: true })];
ok(planWindow(parity, chasing54, nearFull).gap === 0 && planWindow(parity, chasing54, nearFull).sent > nearFull.room * 0.7 && dueRecap(parity, chasing54, nearFull).to === 59 && dueRecap(parity, chasing54, MID).to === 58 && parity[58].role === "him",
  "屋子快满了（这一回还都寄得出去）、往前退只留下她四百字的一问：不退，连那一问一起抄；屋子宽裕的时候照旧退到上一轮的末尾，那一问留着原话");
// 没读到的只剩一点零头：这一趟顺手带上
seq = 0;
const crumbs = talk(70, 600, 600); // 140 条，一条六百字
const crumbDue = dueRecap(crumbs, [R(crumbs[84].id, 1, "提要", { more: true })], MID);
const crumbDue3 = dueRecap(crumbs, [R(crumbs[83].id, 1, "提要", { more: true })], MID);
ok(crumbDue && crumbDue.from === 85 && crumbDue.to === 115 && crumbDue.thick > PIECE_MAX && crumbDue.thick < PIECE_MAX + 1500 && crumbDue.more === false && sum(crumbs.slice(114, 116)) < 1500,
  "一趟读满以后只剩两条一千二百字的零头：顺手带上（这一趟超出上限一点），不留它");
ok(crumbDue3 && crumbDue3.from === 84 && crumbDue3.to === 111 && crumbDue3.thick <= PIECE_MAX && crumbDue3.more === false && sum(crumbs.slice(113, 116)) >= 1500 && crumbs[111].role === "him",
  "剩下的有一千八百字（不算零头）：不带，照旧退到一轮的末尾");
const crumbPhoto = crumbs.slice(0, 114).concat([{ ...crumbs[114], kind: "photo", imgId: "cp", text: undefined }], crumbs.slice(115));
ok(dueRecap(crumbPhoto, [R(crumbPhoto[84].id, 1, "提要", { more: true })], MID).to < 114, "剩下的里头有一张照片：一张照片就折一千五百字，不算零头，不顺手带");
// 没读到头的时候退到一轮的末尾：退掉不到一半才退
seq = 0;
const halfA = [her(fill(100)), him(fill(10000))].concat(Array.from({ length: 80 }, (_, i) => her(`接着说${i}` + fill(600))), [him("回")], talk(30));
seq = 0;
const halfB = [her(fill(100)), him(fill(6000))].concat(Array.from({ length: 80 }, (_, i) => her(`接着说${i}` + fill(600))), [him("回")], talk(30));
ok(dueRecap(halfA, [], MID).to === 1 && dueRecap(halfA, [], MID).more === true && dueRecap(halfB, [], MID).to > 15 && halfB[dueRecap(halfB, [], MID).to].role === "her",
  "没读到头：退到一轮的末尾要是只退掉四成，就退（抄到他那条一万字的话为止）；要退掉六成多，就不退（宁可把她那一长串劈开）");
// 还得不得接着抄，看的是没读到的那一截平时寄的时候多厚（文档算全文），不是叫他抄的时候多厚（文档只算开头）
seq = 0;
const docRest = talk(80, 60, 140).concat([doc(90000), him("看完了")], talk(40));
due = dueRecap(docRest, [], MID);
ok(due && due.to === 157 && due.more === true && docRest[160].kind === "doc" && askThick(docRest[158]) + askThick(docRest[159]) + askThick(docRest[160]) + askThick(docRest[161]) < 5000 && sum(docRest.slice(158, 162)) > 90000,
  "一趟读满，没读到的那一截里有一份九万字的文档：记上“还得接着抄”（它平时寄起来有九万字厚，虽然叫他抄的时候只读开头）");
// 找不到往后的一轮末尾、这一回寄的又没有空着的一截：往前退到上一轮的末尾，她正说着的那一长串留着原话
seq = 0;
const tailMono = talk(120, 100, 300).concat(Array.from({ length: 45 }, (_, i) => her(`还没说完${i}` + fill(600))));
run = chase(tailMono, [], MID);
fin = pickRecap(tailMono, run.list).recap;
ok(rowFloor(tailMono.length) === 260 && planWindow(tailMono, [], MID).gap === 0 && fin.n === 240 && tailMono[239].role === "him" && tailMono[240].text.startsWith("还没说完0") && planWindow(tailMono, run.list, MID).from === 240,
  "抄到的地方往后找不到一轮的末尾（她一个人正说着一长串）：往前退到上一轮的末尾，她这一长串整个留着原话");
// 中间只空着两条没寄：也抄
seq = 0;
const twoGap = talk(9, 100, 300).concat([her(fill(2000)), him(fill(2000))], talk(19, 1500, 2500), [her(fill(1500))]);
const twoGapRecap = [R(twoGap[17].id, 1, "提要")];
ok(rowFloor(twoGap.length) === 20 && planWindow(twoGap, twoGapRecap, haiku).gap === 2 && dueRecap(twoGap, twoGapRecap, haiku) !== null && dueRecap(twoGap, twoGapRecap, haiku).from === 18 && dueRecap(twoGap, twoGapRecap, haiku).to === 19 && dueRecap(twoGap, twoGapRecap, MID) === null,
  "提要之后只有两条没寄（屋子小、最后二三十条又厚）：不等攒够就把这两条抄了");
// 她刚发的大文档：等后面添了二三十条才轮到它
seq = 0;
let docChat = talk(60).concat([doc(90000), him("看完了，写得不错")]);
const docAt = docChat.findIndex((m) => m.kind === "doc");
ok(dueRecap(docChat, [], MID) === null, "刚发了一份九万字的文档：它在最后二三十条里，不算数；前面那一段才六千来字，不抄");
let turnsUntil = 0;
while (turnsUntil < 60 && !(due = dueRecap(docChat, [], MID))) { docChat = docChat.concat(talk(1)); turnsUntil++; }
ok(due && turnsUntil >= 10 && docChat.length - docAt - 2 >= 20 && docChat.length - docAt - 2 <= 40, `文档后面又添了 ${docChat.length - docAt - 2} 条，它退到最后二三十条前面了，才轮到抄（原来的规矩它也是留二三十条）`);
ok(due.from === 0 && due.to === docAt + 1 && docChat[due.to].raw === "看完了，写得不错" && docChat[due.to + 1].role === "her" && due.more === false && due.thick < 12000,
  "抄的时候文档和他看完说的那句抄在一起（不从这一轮中间劈开），连同前面的一趟抄完（文档只读开头，不占一趟的地方）");
ok(planWindow(docChat, [], MID).from === 0 && planWindow(docChat, [], MID).sent > 90000, "文档刚退到二三十条前面的那一回：硬切不抢在抄提要前头，文档和前面的话都还寄着");
// 一直抄不成：再添四十条，硬切才动手
let unlucky = docChat.slice();
let cutAfter = 0;
while (cutAfter < 80 && planWindow(unlucky, [], MID).from === 0) { unlucky = unlucky.concat(talk(1)); cutAfter += 2; }
ok(cutAfter >= 20 && cutAfter <= 42 && planWindow(unlucky, [], MID).from > docAt && dueRecap(unlucky, [], MID).from === 0, `提要一直没抄成：又添了 ${cutAfter} 条以后硬切才动手（那份九万字的文档这一回先不寄了）；等抄得成了，还是从头一条抄起`);

// 有提要的时候也一样：大文档刚退到最后二三十条前面，硬切不抢在抄提要前头
seq = 0;
let lagChat = talk(60);
const lagRecap = [R(lagChat[59].id)];
lagChat = lagChat.concat([doc(90000), him("看完了")], talk(11)); // 文档在第 121 条，眼下一共 144 条：它刚退出最后二三十条
p = planWindow(lagChat, lagRecap, MID);
ok(rowFloor(lagChat.length) === 120 && lagChat.findIndex((m) => m.kind === "doc") === 120 && p.gap === 0 && p.from === 60 && p.sent > 90000 && planWindow(lagChat.slice(0, 139), lagRecap, MID).gap === 0, "有提要、后面跟着一份九万字的文档，文档还在最后二三十条里：照寄");
seq = 500000;
const lagLater = lagChat.concat(talk(8)); // 一共 160 条：文档退到最后二三十条前面了
const lagFar = lagLater.concat(talk(21)); // 又添了四十多条
ok(rowFloor(lagLater.length) === 140 && planWindow(lagLater, lagRecap, MID).gap === 0 && planWindow(lagLater, lagRecap, MID).sent > 90000 && dueRecap(lagLater, lagRecap, MID) !== null && dueRecap(lagLater, lagRecap, MID).from === 60,
  "文档刚退到最后二三十条前面：这一回还照寄（硬切往前让四十条），同时也轮到抄了");
ok(planWindow(lagFar, lagRecap, MID).gap > 0 && planWindow(lagFar, lagRecap, MID).start === 60 && planWindow(lagFar, lagRecap, MID).from === 121 && lagFar[121].raw === "看完了", "一直没抄成、又添了四十多条：硬切才动手，提要后面那一截（连那份文档）这一回先不寄");
// 照片攒多了也抄；一趟最多带二十张图
seq = 0;
let album = [];
for (let i = 0; i < 45; i++) album.push(photo("a" + i), him("这张好"));
album = album.concat(talk(30, 5, 5));
const bytes300 = () => 300000;
const dueAlbum = dueRecap(album, [], tierOf("long"), bytes300);
ok(sum(album) < RECALL.long.trigger && dueAlbum && dueAlbum.kind === "piece" && photosIn(album, dueAlbum) === 11 && photosIn(album, dueAlbum) <= PIECE_PHOTOS && dueAlbum.thick <= PIECE_MAX && dueAlbum.more === true, "四十五张照片（字数还没攒到“长”那一档）：照片过了三十张也抄；一趟放得下十一张，剩下的下一趟");
run = chase(album, [], tierOf("long"), bytes300);
fin = pickRecap(album, run.list).recap;
ok(run.passes.every((d) => photosIn(album, d) <= PIECE_PHOTOS) && album.slice(fin.n).filter((m) => m.kind === "photo").length <= 12 && album.slice(0, fin.n).filter((m) => m.kind === "photo").length >= 33,
  `照片这样追了 ${run.passes.length} 趟：每趟不超过十二张，留下的原话里照片不超过十二张`);
seq = 0;
let bigAlbum = [];
for (let i = 0; i < 20; i++) bigAlbum.push(photo("b" + i), him("这张好"));
bigAlbum = bigAlbum.concat(talk(30, 5, 5));
ok(dueRecap(bigAlbum, [], tierOf("long"), () => 300000) === null && dueRecap(bigAlbum, [], tierOf("long"), () => 500000) !== null, "二十张照片：一共六兆不抄，一共十兆就抄（照片太大也算）");
seq = 0;
let fresh = talk(40, 5, 5);
for (let i = 0; i < 10; i++) fresh.push(photo("c" + i), him("这张好"));
ok(dueRecap(fresh, [], tierOf("long"), () => 1500000) === null, "十张很大的照片全在最后二十条里、前面没照片也不厚：没什么可抄的，不抄");
// 照片太大：一趟带的图不过九兆；薄可照片重的也抄
seq = 0;
let bigs = [];
for (let i = 0; i < 20; i++) bigs.push(photo("bg" + i), him("好看"));
bigs = bigs.concat(talk(30, 5, 5));
const twoMeg = (m) => (m.kind === "photo" ? 2000000 : 0);
const dueBig = dueRecap(bigs, [], tierOf("long"), twoMeg);
run = chase(bigs, [], tierOf("long"), twoMeg);
ok(PIECE_BYTES === 9000000 && dueBig && photosIn(bigs, dueBig) === 4 && dueBig.more === true && run.passes.every((d) => photosIn(bigs, d) === 4) && bigs.slice(pickRecap(bigs, run.list).recap.n).filter((m) => m.kind === "photo").length <= 4,
  "二十张两兆的照片：一趟带的图不过九兆（四张），一趟一趟抄；留下的原话里照片不到八兆");
seq = 0;
let thinHeavy = [];
for (let i = 0; i < 5; i++) thinHeavy.push(photo("th" + i), him("好看"));
thinHeavy = thinHeavy.concat(talk(30, 5, 5));
const dueThin = dueRecap(thinHeavy, [], tierOf("long"), twoMeg);
ok(sum(thinHeavy) < 12000 && dueThin && dueThin.kind === "piece" && photosIn(thinHeavy, dueThin) === 4 && thinHeavy.slice(dueThin.to + 1).filter((m) => m.kind === "photo").length === 1 && dueRecap(thinHeavy, [], tierOf("long"), () => 100000) === null,
  "五张照片一共十兆、字数很薄：也抄（不嫌薄），留一张（三兆以内）不抄；照片不大的时候这么薄是不抄的");
// 照片和表情包一共过了四十张、表情包又不够去：表情包去光为止，照片的图不动（照片自己过了四十张才去）
seq = 0;
let crowded = [];
for (let i = 0; i < 30; i++) crowded.push(photo("ex" + i), him("好看"));
for (let i = 0; i < 15; i++) crowded.push(meme("m" + i + ".jpg"), him("哈"));
crowded = crowded.concat(talk(30, 5, 5));
const mixBytes = (m) => (m.kind === "photo" ? 200000 : 8000);
st = staleImages(crowded, 0, mixBytes);
ok(st.size === 15 && [...st].every((i) => crowded[i].kind === "meme") && dueRecap(crowded, [], tierOf("long"), mixBytes) === null,
  "三十张照片加十五张表情包（一共四十五张）：十五张表情包的图去光，照片的图一张不去；照片没过三十张，也还不用抄");
// 一张一张添表情包：去过图的不会又带上（原来照片会被去了又带上、带上又去，前面跟着来回变）
let grown = crowded.slice(0, 60);
let prevGone = new Set();
let flipped = false;
let photoGone = false;
for (let i = 0; i < 45; i++) {
  grown = grown.concat([meme("g" + i + ".jpg"), him("哈")]);
  const padded = grown.concat(talk(30, 5, 5));
  const gone = staleImages(padded, 0, mixBytes);
  for (const k of prevGone) if (!gone.has(k)) flipped = true;
  for (const k of gone) if (padded[k].kind === "photo") photoGone = true;
  prevGone = gone;
}
ok(!flipped && !photoGone && prevGone.size === 40, "三十张照片后面一张一张添表情包（添到四十五张）：去图的只增不减，去的全是表情包，照片的图一直在");
// 照片自己过了四十张：才从最老的照片去起；这时候早就该抄了
seq = 0;
let manyPhotos = [];
for (let i = 0; i < 45; i++) manyPhotos.push(photo("mp" + i), him("好看"));
for (let i = 0; i < 15; i++) manyPhotos.push(meme("m" + i + ".jpg"), him("哈"));
manyPhotos = manyPhotos.concat(talk(30, 5, 5));
st = staleImages(manyPhotos, 0, mixBytes);
ok([...st].filter((i) => manyPhotos[i].kind === "photo").length === 20 && st.has(0) && st.has(38) && !st.has(40) && [...st].filter((i) => manyPhotos[i].kind === "meme").length === 15 && dueRecap(manyPhotos, [], tierOf("long"), mixBytes) !== null,
  "四十五张照片加十五张表情包：照片从最老的去二十张（一跳二十张），表情包去光；照片过了三十张，该抄提要了（抄的那一回是带着图看的）");
// 照片的大小只算照片：表情包再大也不挤照片
seq = 0;
const fatMemes = [];
for (let i = 0; i < 10; i++) fatMemes.push(photo("fm" + i), him("好看"));
for (let i = 0; i < 10; i++) fatMemes.push(meme("m" + i + ".jpg"), him("哈"));
const padFat = fatMemes.concat(talk(30, 5, 5));
ok(staleImages(padFat, 0, (m) => (m.kind === "photo" ? 850000 : 900000)).size === 0 && staleImages(padFat, 0, (m) => (m.kind === "photo" ? 950000 : 10)).size > 0,
  "十张照片一共八兆半、另有十张很大的表情包：不去图（大小只算照片的）；照片自己过了九兆才去");
// 一轮的末尾找得太靠前（她一个人连着说了一百五十句，他才回）：不用那个末尾，照厚薄切
seq = 0;
const mono = talk(3).concat(Array.from({ length: 150 }, (_, i) => her(`独白${i}` + fill(600))), [him("回了")]);
due = dueRecap(mono, [], MID);
run = chase(mono, [], MID);
fin = pickRecap(mono, run.list).recap;
ok(due && due.kind === "piece" && due.from === 0 && due.to > 25 && due.thick > PIECE_MAX * 0.9 && due.more === true, `三个来回以后她一个人连着说了一百五十句（九万字）：头一趟就抄满一趟（${due ? due.to + 1 : "?"} 条），不是只抄开头那三个来回`);
ok(run.passes.length === 4 && run.passes.every((d) => d.to - d.from + 1 >= 25) && fin.n === rowFloor(mono.length) && rowsCovered(fin) === fin.n && planWindow(mono, run.list, MID).gap === 0, "四趟抄到最后二三十条跟前，寄的时候没有空着的一截");
// 找不到一轮的末尾（她一个人说了几百句没人回）：照样切得下去
seq = 0;
const solo = [];
for (let i = 0; i < 600; i++) solo.push(her("自言自语" + fill(100)));
run = chase(solo, [], MID);
fin = pickRecap(solo, run.list).recap;
ok(run.passes.length >= 2 && fin.n <= rowFloor(solo.length) && rowsCovered(fin) === fin.n && dueRecap(solo, run.list, MID) === null, "一轮的末尾找不到：就按厚薄切，照样一趟一趟抄完，不卡住");
// 一条话比一趟的上限还长：也得往前走
seq = 0;
const giant = talk(30).concat([her(fill(50000)), him("这么长")], talk(40));
run = chase(giant, [], MID);
ok(run.passes.length >= 1 && run.passes.length <= 3 && pickRecap(giant, run.list).recap.n >= 62 && dueRecap(giant, run.list, MID) === null, "中间有一条五万字的话（比一趟的上限还长）：只读它开头一万字，照样抄得过去");
// 屋子小的模型一趟读得少（六千字）：头一条自己就比这长，也得抄它（一趟至少一条，不然永远卡在这儿）
seq = 0;
const cramped = tierOf("mid", 16000, 16000);
const giantFirst = [her(fill(50000)), him("这么长")].concat(talk(60));
due = dueRecap(giantFirst, [], cramped);
run = chase(giantFirst, [], cramped);
fin = pickRecap(giantFirst, run.list).recap;
ok(due && due.kind === "piece" && due.from === 0 && due.to === 0 && due.more === true && run.passes.length >= 2 && rowsCovered(fin) === fin.n && fin.n > 1 && dueRecap(giantFirst, run.list, cramped) === null,
  "屋子小的模型、头一条就是五万字：这一趟就抄它一条，下一趟接着往后，不卡住");
// 一趟没读到头、可剩下的只有一点零头：不记“还得接着抄”
seq = 0;
const nearly = talk(240, 60, 140); // 480 条，五万四千字：该抄的那一段比两趟的上限只多出三千来字
due = dueRecap(nearly, [], MID);
run = chase(nearly, [], MID);
fin = pickRecap(nearly, run.list).recap;
const leftover = sum(nearly.slice(fin.n)) - MID.keep;
ok(due.more === true && run.passes.length === 2 && run.passes[1].more === false && fin.more === false && leftover > 1500 && leftover < 5300 && planWindow(nearly, run.list, MID).gap === 0 && planWindow(nearly, run.list, MID).from === fin.n,
  `第二趟没读到头、可剩下的只有三千来字零头：不为它再跑一趟，也不记“还得接着抄”；那点零头留着原话照寄`);
seq = 200000;
ok(dueRecap(nearly.concat(talk(20, 60, 140)), run.list, MID) === null && dueRecap(nearly.concat(talk(20, 60, 140)), [{ ...fin, more: true }], MID) !== null,
  "又聊了四千多字：下一段要等攒够了才抄（要是记着“还得接着抄”，这会儿就会多跑一趟，前面的缓存也跟着白写一回）");
// “还得接着抄”的记号留在那儿、其实没什么可抄了：不白抄一趟
seq = 0;
const quiet = talk(60);
ok(dueRecap(quiet, [R(quiet[59].id, 1, "提要", { more: true })], MID) === null && dueRecap(quiet.concat(talk(10)), [R(quiet[59].id, 1, "提要", { more: true })], MID) === null,
  "记着“还得接着抄”、后面却只有几千字：太薄，不抄（留着原话，等它再攒一攒）");

// 多薄算太薄：trigger 的一成，可至少一千五百字（屋子小的模型 trigger 才八千多字，一成还不到一千）
seq = 0;
const floorChat = talk(25, 30, 40).concat(talk(10, 500, 700)); // 前面五十条两千多字，后面二十条一万两千字
const chasingFrom = (i) => [R(floorChat[i].id, 1, "提要", { more: true })];
ok(cramped.trigger < 9000 && planWindow(floorChat, chasingFrom(19), cramped).gap === 0 && sum(floorChat.slice(20, 40)) > cramped.trigger * 0.1 && sum(floorChat.slice(20, 40)) < 1500 && dueRecap(floorChat, chasingFrom(19), cramped) === null && sum(floorChat.slice(6, 40)) >= 1500 && dueRecap(floorChat, chasingFrom(5), cramped) !== null,
  "屋子小的模型：要抄的不到一千五百字还是嫌薄（哪怕过了 trigger 的一成），到了一千五才抄");
// 并：段数太多
const seventeen = { id: "r17", upto: thickChat[399].id, at: 9, ts: T0 + 77, n: 400, more: true, model: "老模型", parts: Array.from({ length: 17 }, (_, i) => ({ text: `第${i + 1}段` + fill(400), t0: T0 + i * 1000, t1: T0 + i * 1000 + 500, rows: 40 + i })) };
const dueMerge = dueRecap(thickChat.slice(0, 430), [seventeen], MID);
ok(PARTS_MAX === 16 && dueMerge && dueMerge.kind === "merge" && dueMerge.count === 9 && dueMerge.prev.upto === seventeen.upto && splitForMerge(dueMerge.prev, dueMerge.count).old.length === 9 && splitForMerge(dueMerge.prev, dueMerge.count).rest.length === 8,
  "提要攒到十七段：先并，把最早的九段并成一段，后八段不动");
const mergedRec = nextRecap(dueMerge, "并成的一段" + fill(800), thickChat, { id: "rm", at: 10, model: "测试模型" });
ok(mergedRec.upto === seventeen.upto && mergedRec.n === 400 && mergedRec.parts.length === 9 && mergedRec.parts[0].t0 === seventeen.parts[0].t0 && mergedRec.parts[0].t1 === seventeen.parts[8].t1 && mergedRec.parts[0].rows === 9 * 40 + 36 && mergedRec.parts[1].text === seventeen.parts[9].text && mergedRec.id === "rm" && !("text" in mergedRec),
  "并完：还是抄到原来那一条；并出来的那段记着最早到最晚的钟点、一共抄了多少条；后面几段原样");
ok(mergedRec.ts === seventeen.ts && mergedRec.more === true && mergedRec.at === 10 && mergedRec.model === "测试模型" && rowsCovered(mergedRec) === rowsCovered(seventeen),
  "并完：抄到的那一条是几点说的、还得不得接着抄，照原来的记；什么时候并的、谁并的，记这一回的；管的条数一条不少");
ok(addRecap([seventeen], mergedRec).length === 1 && addRecap([seventeen], mergedRec)[0].id === "rm" && dueRecap(thickChat.slice(0, 430), addRecap([seventeen], mergedRec), MID) === null, "并完存好：换掉原来那一份（抄到同一条）；不再并");
const longText = { ...seventeen, parts: Array.from({ length: 6 }, () => ({ text: fill(1700), t0: T0, t1: T0 + 1, rows: 1 })) };
ok(dueRecap(thickChat.slice(0, 430), [longText], MID).kind === "merge" && dueRecap(thickChat.slice(0, 430), [longText], MID).count === 3 && dueRecap(thickChat.slice(0, 430), [{ ...seventeen, parts: seventeen.parts.slice(0, 16) }], MID) === null && dueRecap(thickChat.slice(0, 430), [{ ...seventeen, parts: [{ text: fill(9500) }] }], MID) === null && TEXT_MAX === 9000,
  "段数不多可加起来过了九千字：也并（并最早的一半）；正好十六段、不到九千字：不并；只有一段：没得并");
// 并出来的要是还那么长（他没照着压短）：接着并，并到只剩一段为止，不会没完没了
let stubborn = [{ ...seventeen, parts: Array.from({ length: 6 }, (_, i) => ({ text: fill(4000), t0: T0 + i, t1: T0 + i, rows: 10 })) }];
let stubbornPasses = 0;
for (; stubbornPasses < 20; stubbornPasses++) {
  const d = dueRecap(thickChat.slice(0, 430), stubborn, MID);
  if (!d) break;
  stubborn = addRecap(stubborn, nextRecap(d, fill(4000), thickChat, { id: "s" + stubbornPasses, at: 100 + stubbornPasses, model: "测试模型" }));
}
const stubbornEnd = pickRecap(thickChat.slice(0, 430), stubborn).recap;
ok(stubbornPasses >= 2 && stubbornPasses <= 5 && (stubbornEnd.parts.length === 1 || stubbornEnd.text.length <= TEXT_MAX) && stubbornEnd.parts.length <= 2 && rowsCovered(stubbornEnd) === 60,
  `并出来的还是四千字一段（没照着压短）：并了 ${stubbornPasses} 回，并到九千字以内（${stubbornEnd.parts.length} 段）就停了，不会没完没了，管的条数一条不少`);
// 抄回来的一段接成新的一份
const pieceDue = dueRecap(thickChat, [], MID);
const firstRec = nextRecap(pieceDue, "头一段", thickChat, { id: "n1", at: 5, model: "测试模型" });
ok(firstRec.upto === pieceDue.upto && firstRec.parts.length === 1 && firstRec.parts[0].rows === pieceDue.to + 1 && firstRec.parts[0].t0 === thickChat[0].ts && firstRec.parts[0].t1 === pieceDue.ts && firstRec.more === true && firstRec.n === pieceDue.n && firstRec.model === "测试模型" && firstRec.ts === pieceDue.ts,
  "抄回来的头一段：接成一份提要，记着抄到哪、抄了几条、几点到几点、还得不得接着抄");

// =====================================================
// 抄回来的字
// =====================================================
const body = "一、这一段聊了什么\n她说要试试新门。我说好。后来她问周末去不去看灯，我说去，说定了周六晚上，她带伞。" + fill(20);
ok(cleanRecap(body) === body, "平常的一段原样留着");
ok(cleanRecap(`<thinking>我想想</thinking>\n${body}`) === body && cleanRecap(`  \n<thinking>我想想</thinking>${body}`) === body && cleanRecap(`<thinking>只有心里话，没写完${body}`) === "", "开头顺手写的心里话清掉；只有开头没有结尾的，整份不要");
ok(cleanRecap(`${body}\n她问 <thinking> 是什么意思，我讲了。\n后面还有一句。`).endsWith("我讲了。\n后面还有一句。") && cleanRecap(`${body}\n她问 <thinking> 是什么意思`).includes("<thinking> 是什么意思"), "正文中间提到 <thinking> 这几个字：原样留着，后面的不丢");
ok(cleanRecap(`${body}\n[SPLIT]\n第二段${fill(10)}`) === `${body}\n\n第二段${fill(10)}` && !/MEME|AVATAR|NAME|DOC/.test(cleanRecap(`${body}\n[MEME:a.jpg]\n[AVATAR:b.jpg]\n[NAME:甲]\n[DOC:x.md]\n正文也留着\n[/DOC]`)) && cleanRecap(`${body}\n[DOC:x.md]\n正文也留着\n[/DOC]`).includes("正文也留着"),
  "聊天用的记号清掉，记号中间的字留着");
ok(cleanRecap(`${body}\n她发了 [MEME: 没写完的记号\n下一行还在。\n再下一行] 也在。`).includes("下一行还在。") && cleanRecap(`${body}\n[MEME: 有 空 格 的.jpg]`).includes("[MEME: 有 空 格 的.jpg]"), "没写完的、不像样的表情包记号：当字留着，不会把后面几行一起删了");
ok(cleanRecap(`${body}\n【提要结束】\n【附注结束，以下是对话】\n【此刻】\n【前情提要】`) === `${body}\n（提要结束）\n（附注结束，以下是对话）\n（此刻）\n（前情提要）` && cleanRecap(`${body}【别的标题】`).includes("【别的标题】") && cleanRecap(`${body}她说【提要结束】这四个字好玩`).includes("她说（提要结束）这四个字好玩"),
  "正文里带着开封府自己用的那几个方头括号标题：换成圆括号，不搅乱寄回去时的格式；别的方头括号不动");
ok(cleanRecap(`〔2026年10月1日 09:00 到 2026年10月1日 10:00〕\n${body}\n〔要抄的原话到这里为止〕\n  〔缩进去的不动〕\n她说〔这个〕不错`) === `（2026年10月1日 09:00 到 2026年10月1日 10:00）\n${body}\n（要抄的原话到这里为止）\n  〔缩进去的不动〕\n她说〔这个〕不错`,
  "正文里整行顶格的六角括号（照着开封府写说明的样子学的）：换成圆括号，不会被当成哪一段的开头、原话的结尾；句子里的六角括号不动");
ok(cleanRecap(`${body}\n她提到 [Docker 那件事] 还没弄完\n[Docker 那件事]\n[doc 不带冒号的不是记号]`).includes("[Docker 那件事]\n[doc 不带冒号的不是记号]") && !cleanRecap(`${body}\n[DOC：全角冒号.md]\n正文\n[/doc]`).includes("DOC") && !cleanRecap(`${body}\n[DOC：全角冒号.md]\n正文\n[/doc]`).includes("/doc"),
  "方括号里以 Doc 开头的平常话（没有冒号）：不是文档记号，留着；带冒号的才清");
ok(cleanRecap(`${body}\r\n第二行  \r第三行\u2028第四行`) === `${body}\n第二行\n第三行\n第四行`, "别样的换行（回车、行分隔符）：都当换行认");
ok(cleanRecap(`${body}\n【开封府附注】她提过这个`) === `${body}\n（开封府附注）她提过这个` && cleanRecap(`${body}\n[doc:小写的.md]\n正文\n[/Doc]`) === `${body}\n\n正文` && cleanRecap(`${body}[SPLIT][NAME:甲]\n下一行`) === `${body}\n\n下一行`,
  "【开封府附注】这个标题也换；小写的文档记号也清；[SPLIT] 后面紧跟着的改名记号（拆开以后独占一行）也清");
ok(cleanRecap("太短") === "" && cleanRecap(fill(59)) === "" && cleanRecap(fill(60)) !== "" && cleanRecap("") === "" && cleanRecap(null) === "" && cleanRecap("   \n  ") === "", "不到六十个字的、空的：不算抄出来了");
ok(cleanRecap(fill(5000)).length < 3030 && cleanRecap(fill(5000)).endsWith("没留）") && !/[\ud800-\udbff]$/.test(cleanRecap(fill(2999) + face + fill(500)).split("\n")[0]), "写得离谱地长的：只留前三千字，写明后面没留；截的地方不劈开占两格的字");
const longish = fill(1900, "正") + "\n说定的事：周末去看灯。";
ok(cleanRecap(longish) === longish, "比说好的长一点的（叫他最长九百、他写了两千）：整段留着，不截（截掉的正是最后那几样要紧的）");
ok(cleanRecap(`${body}\n\n\n\n\n下一段${fill(10)}  \n`) === `${body}\n\n下一段${fill(10)}` && cleanRecap(`${body}   \t\n下一行`) === `${body}\n下一行`, "连着的空行收成一行，行尾的空白去掉");
// 不在一长串空白、一长串没有右括号的字上来回试
const t1 = Date.now();
cleanRecap(body + " ".repeat(200000) + "尾巴");
cleanRecap(body + "\n[MEME:" + "x".repeat(200000));
cleanRecap(body + "【附注结束".repeat(20000));
cleanRecap(body + "<thinking>".repeat(20000));
cleanRecap("<thinking>" + "\n".repeat(200000) + body);
const took = Date.now() - t1;
ok(took < 1500, `几种会让正则来回试的东西（二十万个空格夹在行中间、二十万字没有右括号的记号……）：一共 ${took} 毫秒就认完了`);

// 单子
let list = [];
for (let i = 0; i < 8; i++) list = addRecap(list, R("u" + i, i, "第" + i + "份"));
ok(list.length === 6 && list[0].upto === "u2" && list[5].upto === "u7" && list.every((r) => !("text" in r)), "单子里最多留六份，最早抄的先不要；存进去的不带现连的那份整字");
list = addRecap(list, R("u5", 99, "重抄的"));
ok(list.length === 6 && list.filter((r) => r.upto === "u5").length === 1 && list[5].parts[0].text === "重抄的", "抄到同一条的新一份：把旧的那份换掉");
list = addRecap(list, R("新的", -5, "这台设备的钟慢，刚抄的这份钟点最早"));
ok(list.length === 6 && list[5].upto === "新的" && !list.some((r) => r.upto === "u2"), "新抄的一份无论如何留着（它的钟点排最前也不会被挤掉），挤掉的是别的里头最早的");
ok(addRecap(null, R("u", 1)).length === 1 && addRecap("乱的", R("u", 1)).length === 1 && addRecap([{ upto: "坏的" }], R("u", 1)).length === 1 && RECAP_KEY === "kfs2:recap:", "单子是空的、坏的：从头一份记起");

// 没抄成以后还试不试
const NOW = T0 + 86400000 * 3;
const MIN = 60000;
ok(mayRetry(undefined, NOW) && mayRetry(null, NOW) && mayRetry({ at: NOW, times: 0 }, NOW), "还没失过手：试");
ok(RETRY_WAITS.join() === [10 * MIN, 60 * MIN, 360 * MIN].join() && !mayRetry({ at: NOW - 9 * MIN, times: 1 }, NOW) && mayRetry({ at: NOW - 10 * MIN, times: 1 }, NOW), "失了一回手：十分钟里不试，过了十分钟再试");
ok(!mayRetry({ at: NOW - 59 * MIN, times: 2 }, NOW) && mayRetry({ at: NOW - 60 * MIN, times: 2 }, NOW) && !mayRetry({ at: NOW - 359 * MIN, times: 3 }, NOW) && mayRetry({ at: NOW - 360 * MIN, times: 3 }, NOW) && mayRetry({ at: NOW - 360 * MIN, times: 30 }, NOW) && !mayRetry({ at: NOW - 359 * MIN, times: 30 }, NOW),
  "连着失手：越不成隔得越久（一个钟头、六个钟头），可隔够了总还会再试，不会就此不抄了");

ok(mayRetry({ at: NOW + 5 * MIN, times: 3 }, NOW), "手机的钟被往回拨过（记的钟点比现在还晚）：不认那个钟点，试");
const bad1 = afterFail(undefined, NOW);
ok(bad1.at === NOW && bad1.times === 1 && bad1.away === 0 && afterFail(bad1, NOW + MIN).times === 2 && afterFail(bad1, NOW + MIN).at === NOW + MIN, "真没抄成的一回：记上钟点，连着的回数加一");
const away1 = afterAway(undefined, NOW);
ok(away1.times === 0 && away1.away === 1 && mayRetry(away1, NOW), "抄的工夫里她切走、这一回断了：头一回不算没抄成，他下回回完话照试");
const away2 = afterAway(away1, NOW + MIN);
ok(away2.times === 1 && away2.away === 0 && away2.at === NOW + MIN && !mayRetry(away2, NOW + 5 * MIN) && mayRetry(away2, NOW + 11 * MIN), "连着两回都是她切走才断的：照没抄成记，隔十分钟再试（回回看一眼就走的话，不回回白问）");
const failThenAway = afterAway(bad1, NOW + MIN);
ok(failThenAway.times === 1 && failThenAway.at === NOW && failThenAway.away === 1 && !mayRetry(failThenAway, NOW + 5 * MIN) && afterAway(failThenAway, NOW + 20 * MIN).times === 2 && afterFail(away1, NOW + MIN).away === 0,
  "没抄成以后又碰上她切走：隔多久还是从没抄成那一回算；真没抄成一回，“切走过一回”那一笔就清了");
const ledger = JSON.stringify({ a: bad1, b: away1, old: { at: NOW - 25 * 3600000, times: 2, away: 0 }, oldAway: { at: NOW - 25 * 3600000, times: 0, away: 1 }, future: { at: NOW + 3600000, times: 1 }, junk: "x", zero: { at: NOW, times: 0, away: 0 }, neg: { at: NOW, times: -3, away: 0 } });
const loaded = loadBad(ledger, NOW);
ok(Object.keys(loaded).sort().join() === "a,b" && loaded.a.times === 1 && loaded.a.at === NOW && loaded.b.away === 1 && loaded.b.times === 0 && RECAP_BAD_KEY === "kfs-recap-bad",
  "记在设备上的那本账读出来：没抄成的、切走过一回的都认；一天以前的、钟点比现在还晚的、不成样子的不要");
ok(Object.keys(loadBad("乱的", NOW)).length === 0 && Object.keys(loadBad(null, NOW)).length === 0 && Object.keys(loadBad("[1,2]", NOW)).length === 0 && Object.keys(loadBad("{}", NOW)).length === 0, "账是空的、坏的：当没有，不出错");

// =====================================================
// 平时寄的那一整段
// =====================================================
seq = 0;
const chat60 = talk(30); // 60 条：原来只寄最后四十条
let api = build(chat60);
ok(api.length === 60 && api[0].role === "user" && api[0].content[0].text === "【开封府附注】卿卿用的是默认的“卿”字头像。" && texts(api).includes(chat60[0].text) && !texts(api).some((t) => t.includes("前情提要") || t.includes("没有寄来")),
  "六十条、不厚：从头一条寄起（原来头二十条不寄），开头的附注和原来一样，没有多出来的话");
const opening = (a) => { const out = []; for (const b of a[0].content) { out.push(b.text); if (b.text.startsWith("【附注结束")) break; } return out; };
ok(JSON.stringify(opening(api)) === JSON.stringify(["【开封府附注】卿卿用的是默认的“卿”字头像。", "你用的是默认的“炅”字头像。", "对话中途换了头像的话，换的地方会有开封府提示，以最新的一次为准。", "【附注结束，以下是对话】"]),
  "没提要的时候，开头的附注一个字没变");
// 接着聊：前面一个字不变
const api2 = build(chat60.concat([her("再问一句"), him("再答一句"), her("又问")]));
ok(isPrefix(flat(api), flat(api2)), "接着聊了几句：上一回寄的那一整段，原封不动是这一回的开头（缓存接得上）");
ok(JSON.stringify(buildMessages([], AV, noLookup)) === JSON.stringify({ messages: [], tail: [] }), "空对话：寄的是空的，不出错");

// 有提要
const cutAt = 29; // 抄到第 30 条（他的一条）
const recap = { id: "r1", upto: chat60[cutAt].id, parts: [{ text: "她说要试新门，我说好。\n约好周末看灯。", t0: chat60[0].ts, t1: chat60[cutAt].ts, rows: 30 }], at: T0 + 999, ts: chat60[cutAt].ts, n: 30 };
const recapWhole = recapText(recap.parts);
api = build(chat60, { recaps: [recap] });
const first = api[0].content.map((b) => b.text);
const rc = first.find((t) => t.startsWith("【前情提要】"));
ok(api.length === 30 && rc === `【前情提要】这段对话聊得很长了，头 30 条的原话没有再寄，换成了你自己一段一段抄的提要，抄到 ${stamp(chat60[cutAt].ts)} 为止：\n${recapWhole}\n【提要结束】` && recapWhole.startsWith("〔2026年10月1日 09:01 到 09:30〕\n她说要试新门"),
  "有提要：第一条里多一段【前情提要】，写明头三十条换成了他自己抄的提要、抄到几点，夹着提要正文（每段前面写着是几点到几点的）");
ok(first.indexOf(rc) > 0 && first.indexOf(rc) < first.indexOf("【附注结束，以下是对话】") && first[first.indexOf("【附注结束，以下是对话】") + 1] === chat60[30].text,
  "提要夹在头像附注和“附注结束”中间，后面紧接着留下的头一句原话");
ok(!texts(api).includes(chat60[0].text) && !texts(api).includes(chat60[29].raw) && texts(api).includes(chat60[59].raw), "抄过的那三十条原话不再寄，后面的照寄");
ok(isPrefix(flat(api), flat(build(chat60.concat([her("再问一句"), him("再答一句"), her("又问")]), { recaps: [recap] }))), "有提要、接着聊：前面一样原封不动（缓存接得上）");
ok(build(chat60, { recaps: [{ ...recap, ts: 0 }] })[0].content.some((b) => b.text.includes("抄的提要：\n")), "没记下抄到几点的：那半句不写");
ok(build(chat60, { recaps: [{ ...recap, upto: "不在这一支里" }] }).length === 60, "提要抄到的那一条不在这一支里：当没有这份提要，从头寄");

// 硬切：切口上写明
api = build(legacy);
const p0 = planWindow(legacy, [], MID);
const cutNote = api[0].content.map((b) => b.text).find((t) => t.includes("没有寄来"));
ok(cutNote && cutNote.startsWith("【开封府附注】") && cutNote.includes(`这段对话前面还有 ${p0.from} 条`) && cutNote.includes("这不是新开的对话") && cutNote.includes("照实说") && api[0].content.map((b) => b.text).indexOf(cutNote) < api[0].content.map((b) => b.text).indexOf("【附注结束，以下是对话】"),
  "旧对话硬切：开头写明前面还有多少条没寄来、这不是新开的对话、提起时照实说没寄到");
ok(texts(api).includes(legacy[p0.from].text) && !texts(api).includes(legacy[p0.from - 1].raw) && texts(api).includes(legacy[legacy.length - 1].raw), "硬切：切口之前的不寄，之后的照寄");
ok(isPrefix(flat(api), flat(build(legacy.concat([her("新添的一问")])))), "硬切、接着添一句：前面原封不动（缓存接得上）");
// 提要 + 它后面太老的没寄
api = build(stuck, { recaps: [R(stuck[99].id)] });
const pS = planWindow(stuck, [R(stuck[99].id)], MID);
ok(api[0].content.some((b) => b.text.startsWith("【前情提要】")) && api[0].content.some((b) => b.text === `【开封府附注】提要之后还有 ${pS.gap} 条这一回没有寄来，提要也还没抄到那儿，那一段说了什么你现在看不到。`),
  "有提要、它后面太老的这一回没寄：两样都写明");
// 提要 + 重着寄
api = build(retried, { recaps: nearEnd });
ok(api[0].content.some((b) => b.text === "【开封府附注】下面的原话，开头 28 条是提要里已经抄过的，和提要的末尾重着。") && texts(api).includes(retried[440].text) && texts(api).includes(retried[468].text) && !texts(api).includes(retried[439].raw),
  "提要抄到了最后二三十条里头（她点了重新回答）：原话照寄最后二三十条，写明开头几条和提要重着");
ok(build(long600.slice(0, 468), { recaps: nearEnd }).length > 20, "提要抄到的正好是最后一条：寄出去的不是空信");
// 寄的头一条是他的话：留着，附注自己单占一条
seq = 0;
const oddStart = talk(50);
const hisCut = R(oddStart[28].id, 1, "抄到她的一句为止（不该这么切，万一呢）");
api = build(oddStart, { recaps: [hisCut] });
ok(api[0].role === "user" && api[1].role === "assistant" && api[1].content[0].text === oddStart[29].raw && api[0].content[api[0].content.length - 1].text === "【附注结束，以下是对话】" && api.length === 72,
  "留下的头一条是他的话：照寄（原来会被扔掉），开头的附注自己单占一条排在它前面");

// 图：老的不带，最后二三十条里的都带
seq = 0;
const memeFile = MEME_DATA[0].file;
const memeChat = [];
for (let i = 0; i < 70; i++) memeChat.push(meme(memeFile), him("哈"));
api = build(memeChat);
const labels = texts(api).filter((t) => t.startsWith("[她发了一张表情包："));
ok(imgCount(api) === 30 && labels.length === 70 && api[0].content.filter((b) => b.type === "image").length === 0 && api[api.length - 2].content.some((b) => b.type === "image"),
  "七十张表情包：最老的四十张不带图，那句“她发了一张表情包：名字”一句不少；新的三十张照带");
seq = 0;
const photoChat = [];
for (let i = 0; i < 40; i++) photoChat.push(photo("ph" + i), him("好看"));
const BIG = FAKE_IMG(700000);
const SMALL_EARLY = FAKE_IMG(900);
api = build(photoChat, {}, () => BIG);
const goneBig = staleImages(photoChat, 0, () => BIG.length);
ok(goneBig.size > 0 && imgCount(api) === 40 - goneBig.size && imgCount(api) >= 10 && texts(api).filter((t) => t === "[她之前发过一张照片，图这一回没带上]").length === goneBig.size && texts(api).filter((t) => t === "[她发了一张照片]").length === imgCount(api) && texts(api)[4] === "[她之前发过一张照片，图这一回没带上]" && api.slice(-20).every((m) => m.role !== "user" || m.content.some((b) => b.type === "image")),
  `四十张大照片：最后二三十条里的都带，前面的超了九兆，最老的 ${goneBig.size} 张不带图，只留一句“她之前发过一张照片，图这一回没带上”`);
ok(texts(build(photoChat.slice(0, 4), {}, (id) => (id === "ph0" ? null : SMALL_EARLY))).filter((t) => t === "[她之前发过一张照片]").length === 1, "存档里取不到图的那一张（别的设备还没同步来）：还是原来那句“她之前发过一张照片”，不说“这一回没带上”");
const SMALL = FAKE_IMG(1000);
ok(imgCount(build(photoChat, {}, () => SMALL)) === 40, "四十张不大的照片：都带");

// 换头像的来龙去脉：照寄的头一条算
seq = 0;
const avChat = talk(10).concat([{ id: "ev1", role: "event", who: "her", av: { type: "meme", file: memeFile }, prev: null, ts: T0 + 5 }], talk(30));
const avRecap = R(avChat[40].id, 1, "提要");
let built = buildMessages(avChat, { her: { type: "meme", file: memeFile }, him: null }, noLookup, noLookup, noLookup, noLookup, { recaps: [avRecap] });
ok(built.messages[0].content[0].text === "【开封府附注】卿卿的头像：" && built.messages[0].content[1].type === "image" && built.tail.length === 0, "换头像的那一行已经抄进提要了：开头的附注写的是寄的这一段开头时的头像（换上的那张）");
built = buildMessages(avChat, { her: { type: "meme", file: memeFile }, him: null }, noLookup, noLookup, noLookup, noLookup, {});
ok(built.messages[0].content[0].text === "【开封府附注】卿卿用的是默认的“卿”字头像。" && texts(built.messages).includes("[开封府提示：卿卿刚刚把头像换成了这张]") && built.tail.length === 0, "换头像的那一行还在寄的原话里：开头写换之前的，换的地方照旧有提示");
// 他自己换头像也一样：换的那一条已经抄进提要了，开头写的就是换上的那张
seq = 0;
const hisAv = talk(5).concat([him("换一张", { items: [{ type: "text", text: "换一张" }, { type: "avatar", file: memeFile, prev: null }] })], talk(30));
built = buildMessages(hisAv, { her: null, him: { type: "meme", file: memeFile } }, noLookup, noLookup, noLookup, noLookup, { recaps: [R(hisAv[40].id, 1, "提要")] });
const builtAll = buildMessages(hisAv, { her: null, him: { type: "meme", file: memeFile } }, noLookup, noLookup, noLookup, noLookup, {});
ok(built.messages[0].content[1].text === "你自己选的头像：" && built.messages[0].content[2].type === "image" && !texts(built.messages).some((t) => t.includes("你的新头像换好了")) && built.tail.length === 0
  && builtAll.messages[0].content[1].text === "你用的是默认的“炅”字头像。" && texts(builtAll.messages).some((t) => t.includes("你的新头像换好了")),
  "他换头像的那一条已经抄进提要了：开头写换上的那张，后面不再有“新头像换好了”的提示；还在寄的原话里的话，开头写换之前的、换的地方有提示");
// 在别的对话里又换过：那句提示单独交出来，不接在寄的那一段里
built = buildMessages(avChat.concat([her("问一句")]), { her: null, him: null }, noLookup, noLookup, noLookup, noLookup, {});
ok(built.tail.length === 1 && built.tail[0].text === "[开封府提示：卿卿后来又换回了默认的“卿”字头像]" && !texts(built.messages).some((t) => t.includes("后来又换")) && built.messages[built.messages.length - 1].content.slice(-1)[0].text === "问一句",
  "在别的对话里又换过头像：那句“后来又换了”单独交出来（要放在缓存记号后面），不接在寄的那一段里");

// =====================================================
// 缓存记号
// =====================================================
seq = 0;
const c1 = talk(3).concat([her("第四问"), her("还有")]);
const req1 = withNowNote(build(c1), "【此刻】一", true);
const marks = (req) => req.flatMap((m, i) => m.content.map((b, j) => (b.cache_control ? [i, j, JSON.stringify(b.cache_control)] : null)).filter(Boolean));
const lastMsg = req1[req1.length - 1];
ok(JSON.stringify(TALK_CACHE) === JSON.stringify({ type: "ephemeral", ttl: "1h" }) && lastMsg.content[lastMsg.content.length - 1].text === "【此刻】一" && JSON.stringify(lastMsg.content[lastMsg.content.length - 2].cache_control) === JSON.stringify(TALK_CACHE),
  "最后一句话后面放缓存记号，留一小时（和名帖一样）；【此刻】附在记号后面");
const m1 = marks(req1);
ok(m1.length === 2 && m1[0][0] === req1.length - 3 && m1[0][1] === req1[req1.length - 3].content.length - 1 && m1.every((x) => x[2] === JSON.stringify(TALK_CACHE)),
  "他上一条回话前面的那一句也放一个记号，一共两个，都是一小时");
// 下一回：上一回放“最后一个记号”的地方，正是这一回放“前一个记号”的地方
const c2 = c1.concat([him("第四答")], Array.from({ length: 25 }, (_, i) => her("连着发的第" + i + "条")));
const req2 = withNowNote(build(c2), "【此刻】二", true);
const m2 = marks(req2);
const lastMarked1 = req1[req1.length - 1].content[req1[req1.length - 1].content.length - 2];
const prevMarked2 = req2[m2[0][0]].content[m2[0][1]];
ok(m2.length === 2 && prevMarked2.text === lastMarked1.text && prevMarked2.text === "还有" && m2[0][0] === req1.length - 1,
  "她一口气发了二十五条：这一回的前一个记号，正好落在上一回最后那个记号的老地方（往回数二十块够不着也不怕）");
const strip = (req) => flat(req.map((m) => ({ role: m.role, content: m.content.map(({ cache_control, ...b }) => b) })));
ok(isPrefix(strip(req1).slice(0, -1), strip(req2)), "去掉【此刻】那一块，上一回寄的是这一回的开头");
ok(marks(withNowNote(build(c1), "【此刻】", false)).length === 0, "不带缓存的那种写法：一个记号都不放");
seq = 0;
const onlyHer = [her("头一句")];
ok(marks(withNowNote(build(onlyHer), "【此刻】", true)).length === 1, "头一句话（前面没有他的回话）：只放最后那一个");
ok(marks(withNowNote(build(chat60, { recaps: [recap] }), "【此刻】", true)).length === 0 && marks(withNowNote(build(chat60.concat([her("问")]), { recaps: [recap] }), "【此刻】", true)).length === 2,
  "最后一条不是她的话的时候不放记号（平常不会这样寄）；有提要的时候照样两个");
seq = 0;
const second = [her("头一句"), him("头一答"), her("第二句")];
const reqA = withNowNote(build(second.slice(0, 1)), "【此刻】", true);
const reqB = withNowNote(build(second), "【此刻】", true);
const mB = marks(reqB);
ok(marks(reqA).length === 1 && mB.length === 2 && mB[0][0] === 0 && reqB[0].content[mB[0][1]].text === "头一句" && reqA[0].content[marks(reqA)[0][1]].text === "头一句" && mB[0][1] === marks(reqA)[0][1] && reqB[mB[1][0]].content[mB[1][1]].text === "第二句",
  "一段对话的第二句话：前一个记号落在头一句上，正是头一回放记号的那一块");
// “后来又换了头像”那句：放在记号后面、【此刻】前面；下一回它挪走了，老地方的记号照样对得上
const tailNote = [{ type: "text", text: "[开封府提示：卿卿后来又换回了默认的“卿”字头像]" }];
const withTail1 = withNowNote(build(c1), "【此刻】一", true, tailNote);
const lastT = withTail1[withTail1.length - 1].content;
ok(lastT[lastT.length - 1].text === "【此刻】一" && lastT[lastT.length - 2].text === tailNote[0].text && !lastT[lastT.length - 2].cache_control && JSON.stringify(lastT[lastT.length - 3].cache_control) === JSON.stringify(TALK_CACHE) && lastT[lastT.length - 3].text === "还有",
  "那句提示放在缓存记号后面、【此刻】前面：记号还是落在她最后那句话上");
const withTail2 = withNowNote(build(c2), "【此刻】二", true, tailNote);
ok(isPrefix(strip(withTail1).slice(0, -2), strip(withTail2)) && withTail2[marks(withTail2)[0][0]].content[marks(withTail2)[0][1]].text === "还有", "带着那句提示聊下去：上一回记号以前的那一整段，原封不动是这一回的开头（原来每一回都对不上，整段重写）");
ok(withNowNote([], "【此刻】", true, tailNote)[0].content.length === 2 && withNowNote([{ role: "assistant", content: [{ type: "text", text: "他的" }] }], "【此刻】", true, tailNote)[1].content[0].text === tailNote[0].text, "最后一条不是她的话：那句提示和【此刻】另起一条");
const sys = buildSystem({ now: new Date(T0), memeList: [], hisAvatarName: "", memDocs: [{ name: "名帖-测试.md", content: "测试用的名帖" }] });
ok(sys.staticText.includes("【前情提要】\n一段对话聊长了") && sys.staticText.includes("不是新开的") && sys.staticText.includes("以她说的为准") && sys.staticText.indexOf("【前情提要】") < sys.staticText.indexOf("【此刻】") && sys.staticText.indexOf("【看得见的东西】") < sys.staticText.indexOf("【前情提要】"),
  "名帖后面的规矩里添了一段【前情提要】：看到它就知道前面还有很长一截、不是新开的；提要是他抄的，和她说的对不上以她为准；提要里没有的照实说记不清");
ok(sys.staticText.includes("有时候没有提要，只有一句“前面还有多少条没有寄来”：一样，前面聊过，只是你现在看不到。") && sys.staticText.includes("早先的照片和表情包也可能不再带图，只留一句话") && sys.staticText.includes("图她是发过的"),
  "那一段里还写着：只有一句“前面还有多少条没寄来”的时候也是聊过的；早先的照片、表情包可能不带图了，图她是发过的");

// =====================================================
// 聊天记录里那行小字
// =====================================================
seq = 0;
const rowsChat = talk(5);
const live = normRecaps([R(rowsChat[3].id, 2)])[0];
const rows = buildRows(rowsChat, null, "", live);
const rowAt = rows.findIndex((r) => r.type === "recap");
ok(rows.filter((r) => r.type === "recap").length === 1 && rows[rowAt].recap === live && rows[rowAt].key === "rc-" + rowsChat[3].id && rows[rowAt - 1].msg.id === rowsChat[3].id && rows[rowAt + 1].msg.id === rowsChat[4].id && rows[rowAt - 1].last === true && rows[rowAt + 1].first === true,
  "那行小字摆在作数的那份提要抄到的那一条后面、下一条前面；上下两个气泡各自成段");
ok(JSON.stringify(buildRows(rowsChat, null, "")) === JSON.stringify(buildRows(rowsChat, null, "", null)) && buildRows(rowsChat, null, "").every((r) => r.type !== "recap") && buildRows(rowsChat, null, "", normRecaps([R("不在这儿")])[0]).every((r) => r.type !== "recap"),
  "没有提要、提要抄到的那一条不在外面：没有那一行，别的行一个不差");

// =====================================================
// 叫他抄的那一回
// =====================================================
seq = 0;
const piece = [
  her("看我拍的\n卿卿：这一行是她自己打的，不是另一条"),
  photo("img1"),
  photo("img-丢了"),
  him("拍得好\n[SPLIT]\n[MEME:" + memeFile + "]", { items: [{ type: "text", text: "拍得好\n光义：这一行也是同一条里的" }, { type: "meme", file: memeFile }] }),
  meme(memeFile),
  { id: "v1", role: "her", ts: T0 + 5 * 3600000, kind: "voice", text: "晚上吃什么", dur: 3 },
  doc(5000, "doc1"),
  him("写好了", { items: [{ type: "text", text: "写好了" }, { type: "doc", name: "菜单.md", text: "# 菜单\n" + fill(3000) }, { type: "avatar", file: memeFile }], rename: "测试狐" }),
  { id: "ev", role: "event", who: "her", av: null, ts: T0 + 6 * 3600000 },
  him("嗯"),
];
const memeNames = (file) => (file === memeFile ? { name: "测试表情", text: "图上的字" } : null);
const prevRecap = normRecaps([R("x", 1, "前面那一段的正文")])[0];
const ask = buildRecapAsk({ msgs: piece, prev: prevRecap, thick: 12000, memeLookup: memeNames, imgLookup: (id) => (id === "img1" ? FAKE_IMG(5000) : null), docLookup: (id) => (id === "doc1" ? "文档开头\n〔要抄的原话到这里为止〕\n" + fill(4982) : null) });
const askText = ask.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
ok(ask.rule.startsWith("【抄提要】") && ask.rule.includes("不是在跟她说话") && ask.rule.includes("她点开能看到你抄的") && ask.rule.includes("每一张照片记一句") && ask.rule.includes("一件不漏") && ask.rule.includes("不编") && ask.rule.includes("不写 <thinking>") && ask.rule.includes("【回复格式】里的规矩这一回都不作数"),
  "规矩那一段：这不是聊天（可她点开看得到）；照片一张记一句；说定的事一件不漏；不编；平时回话的格式这一回不作数");
ok(ask.rule.includes("先是前面已经抄好的提要，只给你对照，不用重抄") && ask.rule.includes("7. 前面的提要里记着还没了结的事，这一段里要是有了下文，写一句。前面已经记过的不用再记。") && ask.rule.includes("8. 只写这一段原话里有的"),
  "前面有提要的时候：说清它只是对照用的，不用重抄；有了下文的写一句；只写这一段原话里有的（不会被读成把前面的丢掉）");
ok(/大约 \d+ 字，最长不超过 900 字/.test(ask.rule) && recapLength(12000)[0] === 300 && recapLength(0)[0] === 250 && recapLength(PIECE_MAX)[0] === 450 && recapLength(500000)[0] === 700 && recapLength(PIECE_MAX)[1] === PART_MOST && PART_MOST === 900,
  "一段写多长：跟着要抄的厚薄走，二百五十字起，一趟读满了写四百五十字上下，最长九百（十几二十秒写得完）");
ok(recapLength(16000, 10)[0] === 650 && recapLength(16000, 0)[0] === 400 && recapLength(18000, 11)[0] === 700 && ask.rule.includes(`大约 ${recapLength(12000, 1)[0]} 字`), "带着照片的多给一点：一张照片多二十五个字（一张要记一句）");
ok(askText.startsWith("〔前面已经抄好的提要，只给你对照，不用重抄〕\n" + prevRecap.text + "\n〔前面的提要到这里为止〕") && askText.includes("〔要抄的原话，一共 10 条，从 2026年10月1日") && askText.trimEnd().endsWith("〔要抄的原话到这里为止〕\n\n抄吧。"),
  "寄去的那一段：先是前面的提要，再是要抄的原话（写明几条、从几点到几点），最后一句“抄吧”");
ok(askText.includes("\n卿卿：看我拍的\n  卿卿：这一行是她自己打的，不是另一条\n") && askText.includes("\n光义：拍得好\n  光义：这一行也是同一条里的\n") && askText.includes("光义：[表情包：测试表情，图上写着“图上的字”]") && askText.includes("卿卿：[表情包：测试表情，图上写着“图上的字”]") && askText.includes("卿卿：[语音，转成的字] 晚上吃什么"),
  "原话一条一条写：谁说的顶格写在前头；一条里的第二行起前面空两格（她自己打的“卿卿：”不会被认成另一条）；表情包写名字和图上的字");
const imgAt = ask.content.findIndex((b) => b.type === "image");
ok(ask.photos === 1 && imgAt > 0 && ask.content[imgAt - 1].text.endsWith("卿卿：[照片，图跟在这一行后面]") && ask.content.filter((b) => b.type === "image").length === 1 && askText.includes("卿卿：[照片，这张图没带上]"),
  "照片：图跟在说明它的那一行后面；图丢了的那张照实写没带上");
ok(askText.includes("卿卿：[发来一份文档《测试文档.md》（Markdown，5000 字）。开头是：\n  文档开头\n  〔要抄的原话到这里为止〕\n") && askText.includes("  ……（后面还有 2500 字没带上）\n  ]") && askText.includes("光义：[交给她一份文档《菜单.md》，3005 字。开头是：\n  # 菜单") && (askText.match(/^〔要抄的原话到这里为止〕$/gm) || []).length === 1,
  "文档只带开头，整块缩进去：文档里自己写着“原话到这里为止”也不会被当成真的结尾（顶格的只有一处）");
ok(askText.includes("[光义把顶上显示的名字改成了“测试狐”]") && askText.includes("[光义把自己的头像换成了「测试表情」]") && askText.includes("[卿卿换回了默认的头像]"), "改名字、换头像：各写一行说明");
ok((askText.match(/^—— 2026年10月1日 星期四 \d\d:\d\d ——$/gm) || []).length === 3, "钟点：开头写一行，隔了半个钟头以上再写一行");
ok(ask.content.every((b) => (b.type === "text" ? b.text.length > 0 : b.type === "image" && b.source && b.source.data.length > 0)), "寄去的每一块都不是空的");
const noPrev = buildRecapAsk({ msgs: piece.slice(0, 1), memeLookup: memeNames });
ok(!noPrev.content[0].text.includes("前面已经抄好的提要") && !noPrev.rule.includes("前面的提要") && noPrev.rule.includes("7. 只写这一段原话里有的") && noPrev.rule.includes("下面那条消息里：是要抄的原话。") && noPrev.photos === 0, "前面没有提要的时候：不带那一段，规矩里也不提");
// 几样少见的：她传的头像、他没写完的文档、全文没取到的文档、隔了一天
const rare = buildRecapAsk({
  msgs: [
    { id: "ev2", role: "event", who: "her", av: { type: "upload", data: "data:image/png;base64,AAAA" }, ts: T0 },
    { id: "ev3", role: "event", who: "her", av: { type: "meme", file: memeFile }, ts: T0 + 1000 },
    him("交一份", { ts: T0 + 2000, items: [{ type: "doc", name: "半份.md", text: "写到一半", cut: true }] }),
    her("第二天说的", { ts: T0 + 26 * 3600000 }),
    { ...doc(800, "没取到的"), ts: T0 + 26 * 3600000 + 1000 },
    her("一行\r\n两行\r三行\u2028四行\u2029五行"),
  ],
  memeLookup: memeNames,
}).content[0].text;
ok(rare.includes("[卿卿换了一张自己传的头像]") && rare.includes("[卿卿把头像换成了「测试表情」]") && rare.includes("光义：[交给她一份文档《半份.md》，4 字，没写完。开头是：\n  写到一半\n  ]") && rare.includes("卿卿：[发来一份文档《测试文档.md》（Markdown，800 字），全文这次没带上]")
  && (rare.match(/^—— 2026年10月\d日 星期. \d\d:\d\d ——$/gm) || []).length === 3 && rare.includes("—— 2026年10月2日 星期五 11:00 ——") && rare.includes("卿卿：一行\n  两行\n  三行\n  四行\n  五行"),
  "她传的头像、换的表情包头像、他没写完的文档、全文没取到的文档：各照实写；隔了一天写一行钟点；别样的换行也缩进去");
// 太长的一条话只带开头；截的地方不劈开占两格的字
const lone = /[\ud800-\udbff](?![\udc00-\udfff])/;
const longOne = buildRecapAsk({ msgs: [her(fill(ROW_HEAD - 1) + face + fill(3000))], memeLookup: memeNames });
ok(longOne.content[0].text.includes("……（后面还有 3002 字没带上）") && !lone.test(longOne.content[0].text), "一条话一万多字：只带头一万字，写明后面还有多少；截的地方不劈开占两格的字");
const docCut = buildRecapAsk({ msgs: [doc(9000, "dx")], memeLookup: memeNames, docLookup: () => fill(DOC_HEAD - 1) + face + fill(6000) });
const hisDocCut = buildRecapAsk({ msgs: [him("x", { items: [{ type: "doc", name: "a.md", text: fill(HIS_DOC_HEAD - 1) + face + fill(900) }] })], memeLookup: memeNames });
ok(!lone.test(docCut.content[0].text) && !lone.test(hisDocCut.content[0].text) && HIS_DOC_HEAD === 1200, "文档开头截在一个占两格的字上（她发的、他交的都试）：不劈开");
// 万一照片太多：新的带图，老的写没带上
seq = 0;
const many = Array.from({ length: 30 }, (_, i) => photo("n" + i));
const askMany = buildRecapAsk({ msgs: many, memeLookup: memeNames, imgLookup: () => SMALL });
const manyText = askMany.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
ok(askMany.photos === PIECE_PHOTOS && PIECE_PHOTOS === 12 && askMany.content.filter((b) => b.type === "image").length === 12 && (manyText.match(/这张图没带上/g) || []).length === 18 && manyText.indexOf("这张图没带上") < manyText.indexOf("图跟在这一行后面"),
  "万一要抄的那一段里有三十张照片（平常切的时候就不会超过十二张）：新的十二张带图，最老的十八张写明没带上");
const MEGA = FAKE_IMG(1000000);
ok(buildRecapAsk({ msgs: many, memeLookup: memeNames, imgLookup: () => MEGA }).photos === 8, "照片很大：带到九兆为止");
ok(buildRecapAsk({ msgs: [{ id: "old", role: "him", ts: T0, raw: "老数据里的一句" }], memeLookup: memeNames }).content[0].text.includes("光义：老数据里的一句"), "他的那一条上没记拆好的几样（老数据）：照他的原话写");
// 并几段
const mergeAsk = buildMergeAsk({ parts: seventeen.parts.slice(0, 5) });
ok(mergeAsk.rule.startsWith("【并提要】") && mergeAsk.rule.includes("把最早的 5 段并成一段") && mergeAsk.rule.includes("不能因为旧就丢") && mergeAsk.rule.includes("不添，不编") && mergeAsk.rule.includes("大约 650 字，最长不超过 1200 字") && MERGE_MOST === 1200 && mergeAsk.rule.includes("【回复格式】里的规矩这一回都不作数"),
  "并的那一回的规矩：把最早的几段并成一段；还用得着的不能因为旧就丢；不添不编；写到原来的三成上下（两千来字并成六百五），最长一千二");
ok(buildMergeAsk({ parts: [{ text: fill(100) }, { text: fill(100) }] }).rule.includes("大约 400 字") && buildMergeAsk({ parts: seventeen.parts.slice(0, 9).map((x) => ({ ...x, text: fill(1200) })) }).rule.includes("大约 900 字"),
  "并出来写多长：再少也有四百字，再多不过九百字上下");
ok(mergeAsk.content.length === 1 && mergeAsk.content[0].text.startsWith("〔要并的几段提要〕\n〔2026年10月1日") && mergeAsk.content[0].text.includes("第1段") && mergeAsk.content[0].text.includes("第5段") && !mergeAsk.content[0].text.includes("第6段") && mergeAsk.content[0].text.endsWith("〔要并的到这里为止〕\n\n并吧。"),
  "寄去并的：就是那几段（每段前面写着几点到几点），不带原话，不带后面不动的那几段");

// =====================================================
// 随便编的对话，大量地试（种子是定死的，每回跑的都是同一批）
// =====================================================
function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  next.int = (a, b) => a + Math.floor(next() * (b - a + 1));
  next.chance = (x) => next() < x;
  return next;
}
function randomChat(r, rowCount) {
  const out = [];
  let turn = "her";
  while (out.length < rowCount) {
    if (turn === "her") {
      const k = r.chance(0.7) ? 1 : r.int(2, 6);
      for (let i = 0; i < k && out.length < rowCount; i++) {
        const x = r();
        if (x < 0.06) out.push(photo("rp" + seq));
        else if (x < 0.14) out.push(meme(memeFile));
        else if (x < 0.16) out.push(doc(r.chance(0.3) ? r.int(20000, 100000) : r.int(200, 8000)));
        else if (x < 0.18) out.push({ id: "re" + ++seq, role: "event", who: "her", av: r.chance(0.5) ? { type: "meme", file: memeFile } : null, prev: null, ts: T0 + seq * 60000 });
        else out.push(her(fill(r.chance(0.8) ? r.int(1, 80) : r.int(80, 3000))));
      }
      turn = r.chance(0.9) ? "him" : "her";
    } else {
      const n = r.chance(0.7) ? r.int(1, 200) : r.int(200, 2500);
      const items = [{ type: "text", text: fill(n, "话") }];
      if (r.chance(0.05)) items.push({ type: "avatar", file: memeFile, prev: null });
      out.push(him(fill(n, "话"), { items }));
      turn = "her";
    }
  }
  return out;
}
const tiers = [tierOf("short"), MID, tierOf("long"), haiku];
// 寄的时候带的图用一张小的顶替（省得测试里搬几个兆的字）；算照片多大的时候另给一个像样的数
const imgOf = () => SMALL;
const bytesOfRow = (m) => (m.kind === "photo" ? 200000 + ((String(m.imgId).length * 37 + String(m.imgId).charCodeAt(String(m.imgId).length - 1) * 911) % 600000) : 0);
const bad = [];
let chains = 0, requests = 0;
for (let seed = 1; seed <= 60; seed++) {
  const r = rng(seed * 7919);
  seq = seed * 100000;
  const chat = randomChat(r, r.int(60, 700));
  const tier = tiers[seed % tiers.length];
  let recaps = [];
  let prevFlat = null, prevKey = "";
  // 一条一条添着走：每添到他的一条回话，照规矩抄（十回里有两回装作没抄成）；每一回寄的都验
  for (let n = 1; n <= chat.length; n++) {
    const cur = chat.slice(0, n);
    const plan = planWindow(cur, recaps, tier);
    // 最后二三十条（连提要自己占的地方）往少里算放得下的时候（放不下就只好再切，那是另一回事）
    const headOf = (pl) => (pl.recap ? pl.recap.text.length : 0);
    const tailFits = sum(cur.slice(rowFloor(n))) + headOf(plan) <= tier.most;
    if (plan.from > oldWindowStart(n) && tailFits) bad.push(`种子 ${seed}：第 ${n} 条时寄的头一条比原来晚`);
    if (plan.from < rowFloor(n) && plan.sent + headOf(plan) > tier.room) bad.push(`种子 ${seed}：第 ${n} 条时往多里算屋子放不下，却没切到最后二三十条跟前`);
    if (plan.from < 0 || plan.from > n || plan.gap < 0 || plan.over < 0 || (plan.gap > 0 && plan.over > 0)) bad.push(`种子 ${seed}：第 ${n} 条时切口的数不对`);
    if (cur[n - 1].role !== "him") {
      const out = buildMessages(cur, AV, memeNames, imgOf, noLookup, () => "文档正文", { recaps, tier });
      const sent = out.messages;
      requests++;
      if (!sent.length || sent[0].role !== "user") bad.push(`种子 ${seed}：第 ${n} 条时寄的头一条不是她那一边的`);
      if (sent.some((m, i) => !m.content.length || (i > 0 && m.role === sent[i - 1].role) || m.content.some((b) => b.type === "text" && !b.text))) bad.push(`种子 ${seed}：第 ${n} 条时寄的有空块、或者同一边连着两条`);
      if (imgCount(sent) > 90) bad.push(`种子 ${seed}：第 ${n} 条时带了 ${imgCount(sent)} 张图`);
      if (marks(withNowNote(sent, "【此刻】", true, out.tail)).length > 2) bad.push(`种子 ${seed}：第 ${n} 条时缓存记号多于两个`);
      // 切口、提要、去图的地方都没变的话：上一回寄的是这一回的开头
      const gone = staleImages(cur, plan.from, (m) => (m.kind === "photo" ? SMALL.length : 8000));
      const key = [plan.from, plan.recap ? plan.recap.id : "", [...gone].join()].join("|");
      const nowFlat = flat(sent);
      if (prevFlat && key === prevKey && !isPrefix(prevFlat, nowFlat)) bad.push(`种子 ${seed}：第 ${n} 条时前面变了（切口没动）`);
      prevFlat = nowFlat;
      prevKey = key;
    } else if (r.chance(0.8)) {
      // 他回完了：最多连抄四趟
      for (let k = 0; k < 4; k++) {
        const due = dueRecap(cur, recaps, tier, bytesOfRow);
        if (!due) break;
        chains++;
        if (due.kind === "piece") {
          const many2 = due.to > due.from;
          if (due.to >= rowFloor(n) || due.to < due.from || cur[due.to].id !== due.upto || due.from !== pickRecap(cur, recaps).at + 1) bad.push(`种子 ${seed}：第 ${n} 条时要抄的那一段不对`);
          if (many2 && (due.thick > PIECE_MAX + 1600 || photosIn(cur, due) > PIECE_PHOTOS)) bad.push(`种子 ${seed}：第 ${n} 条时一趟抄得太多`);
          const askOut = buildRecapAsk({ msgs: cur.slice(due.from, due.to + 1), prev: due.prev, thick: due.thick, memeLookup: memeNames, imgLookup: imgOf, docLookup: () => "文档正文" + fill(3000) });
          if (askOut.content.some((b) => b.type === "text" && !b.text) || askOut.photos > PIECE_PHOTOS) bad.push(`种子 ${seed}：第 ${n} 条时寄去抄的不对`);
        }
        recaps = addRecap(recaps, nextRecap(due, "抄的一段" + fill(r.int(200, 1100)), cur, { id: "s" + seed + "-" + chains, at: chains, model: "测试模型" }));
        const now = pickRecap(cur, recaps).recap;
        if (rowsCovered(now) !== now.n) bad.push(`种子 ${seed}：第 ${n} 条时提要各段抄的条数加起来不等于抄到的第几条（有跳过去的）`);
      }
    }
  }
  // 聊完以后一口气追到底：没有既不寄也不抄的
  const done = chase(chat, recaps, tier, bytesOfRow);
  if (done.passes.length >= 200) bad.push(`种子 ${seed}：追不完`);
  const end = planWindow(chat, done.list, tier);
  if (end.gap > 0 && sum(chat.slice(rowFloor(chat.length))) + (end.recap ? end.recap.text.length : 0) <= tier.most) bad.push(`种子 ${seed}：追完了还有 ${end.gap} 条既没寄也没抄`);
}
ok(bad.length === 0, `随便编的六十段对话（各种长短、照片、文档、换头像，三档加屋子小的模型），一条一条添着走，一共验了 ${requests} 回寄的、${chains} 趟抄的：寄的不比原来少、格式都对、切口不动的时候前面不变、抄的一趟接一趟没有跳过去的` + (bad.length ? "\n  " + [...new Set(bad)].slice(0, 6).join("\n  ") : ""));

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
