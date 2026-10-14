// 通话（卿卿 10 月 14 日要的，见开发说明“通话”那一节）：听她说完没有、他的话怎么洗怎么切、按顺序念、聊天里那两行小字
import { createListener, PAUSE_MS, PAUSES, pauseOf } from "../src/call/listen.js";
import { cleanForCall, splitForCall, segmentsOfReply, createSayer, subOf } from "../src/call/say.js";
import { emptySubs, herLive, herDone, hisSay, subUnits, subFade, subGap, SUB_KEEP, SUB_COLOR } from "../src/call/subs.js";
import { isCallMark, callLen, callClock, markText, markNote, markRecap } from "../src/call/marks.js";
import { buildSystem, CALL_NOTE } from "../src/prompt/system.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildRecapAsk } from "../src/prompt/recap.js";
import { buildRows } from "../src/chat/rows.js";
import { makePreview } from "../src/chat/overview.js";
import { needsReply } from "../src/thread.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };

// =====================================================
// 听：手机自带的听写，停 1.6 秒算说完
// =====================================================
// 假的钟和定时器：拨 advance(ms) 才往前走
function fakeClock() {
  let t = 0;
  let timers = [];
  let seq = 0;
  return {
    now: () => t,
    later(fn, ms) {
      const id = ++seq;
      timers.push({ id, at: t + ms, fn });
      return () => { timers = timers.filter((x) => x.id !== id); };
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        t = next.at;
        next.fn();
      }
      t = end;
    },
  };
}
// 假的听写：made 里记着每一回开起来的那个；say() 交一回字，end() 报结束，error() 报错
function fakeSR() {
  const made = [];
  class SR {
    constructor() { this.started = false; this.stopped = false; this.aborted = false; made.push(this); }
    start() { this.started = true; }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
    say(...parts) { this.onresult && this.onresult({ results: parts.map((p) => [{ transcript: p }]) }); }
    end() { this.onend && this.onend(); }
    error(e) { this.onerror && this.onerror({ error: e }); }
  }
  return { SR, made };
}
function listener(opts = {}) {
  const clock = fakeClock();
  const { SR, made } = fakeSR();
  const got = { texts: [], done: [], fails: [] };
  const l = createListener({
    SR: opts.noSR ? null : SR,
    now: clock.now,
    later: clock.later,
    pauseMs: opts.pauseMs,
    onText: (t) => got.texts.push(t),
    onDone: (t) => got.done.push(t),
    onFail: (k) => got.fails.push(k),
  });
  return { l, clock, made, got };
}

{
  const { l, clock, made, got } = listener();
  l.start();
  const r = made[0];
  ok(made.length === 1 && r.started && r.lang === "zh-CN" && r.continuous === true && r.interimResults === true, "开始听：开一个听写（中文、一直听、边听边出字）");
  r.say("今天");
  clock.advance(1000);
  r.say("今天好", "累");
  ok(got.texts.slice(-1)[0] === "今天好累", "听到的字变了就报（几段拼起来），通话页上那行小字跟着变");
  clock.advance(1500);
  ok(!r.stopped && got.done.length === 0, "字还在变的时候不算说完（上回变了才 1.5 秒）");
  clock.advance(200);
  ok(r.stopped && got.done.length === 0, "停够 1.6 秒：叫听写收尾（它会把最后那点字交回来）");
  r.say("今天好累啊");
  r.end();
  ok(got.done.length === 1 && got.done[0] === "今天好累啊" && !l.listening(), "听写收好尾：交出这一句（用的是收尾时交回来的字），这一句听完了");
}
{
  const { l, clock, made, got } = listener();
  l.start();
  made[0].say("在吗");
  clock.advance(PAUSE_MS + 200);
  ok(made[0].stopped && got.done.length === 0, "停够了叫收尾");
  clock.advance(1300);
  ok(got.done.length === 1 && got.done[0] === "在吗" && made[0].aborted, "听写收了尾却不报结束：过一会儿自己收（交出已经听到的字），把它关掉");
}
{
  const { l, clock, made, got } = listener();
  l.start();
  clock.advance(5000);
  ok(!made[0].stopped && got.done.length === 0, "一直没人说话：不收尾，一直听着");
  made[0].end();
  clock.advance(300);
  ok(made.length === 2 && made[1].started && got.fails.length === 0, "什么都没听到听写就自己停了（iPhone 上停久了会这样）：再开一个接着听");
  made[1].say("嗯");
  made[1].end();
  ok(got.done.length === 1 && got.done[0] === "嗯", "说了话以后听写自己停了：当她说完了，交出这一句");
}
{
  const { l, clock, made, got } = listener();
  l.start();
  for (let i = 0; i < 6 && !got.fails.length; i++) {
    made[made.length - 1].end();
    clock.advance(300);
  }
  ok(got.fails[0] === "dead" && made.length === 5 && !l.listening(), "一开就停、连着五回：这台手机上听不了，报 dead，不再空转");
}
{
  const { l, made, got } = listener();
  l.start();
  made[0].error("not-allowed");
  ok(got.fails[0] === "mic" && !l.listening(), "不给用麦克风（或者 iPhone 要她点一下才肯开）：报 mic");
  const b = listener();
  b.l.start();
  b.made[0].error("no-speech");
  b.made[0].end();
  b.clock.advance(300);
  ok(b.got.fails.length === 0 && b.made.length === 2, "没听到声音这种：不算听不了，接着听");
}
{
  const { l, clock, made, got } = listener();
  l.start();
  made[0].say("说到一半");
  l.stop();
  clock.advance(5000);
  ok(got.done.length === 0 && made[0].aborted && !l.listening(), "挂断、静音、轮到他说：stop 了，听到一半的不交");
  const n = listener({ noSR: true });
  n.l.start();
  ok(n.got.fails[0] === "none", "这台手机没有听写：报 none");
}
{
  const { l, clock, made, got } = listener({ pauseMs: 2000 });
  l.start();
  made[0].say("慢慢说");
  clock.advance(1900);
  ok(!made[0].stopped, "调成 2 秒：1.9 秒还不算说完");
  clock.advance(200);
  ok(made[0].stopped, "调成 2 秒：过了 2 秒才收尾");
  ok(PAUSES.join() === "1200,1600,2000" && pauseOf(undefined) === 1600 && pauseOf(1200) === 1200 && pauseOf(999) === 1600 && pauseOf("2000") === 2000,
    "停多久算说完：三档 1.2、1.6、2 秒，没挑过、挑的数不认得都是 1.6 秒");
}

// =====================================================
// 洗：念出来的就是这些
// =====================================================
ok(cleanForCall("*摸摸你的头* 乖。") === "乖。", "动作（星号那种）不念");
ok(cleanForCall("**真的**好想你") === "真的好想你", "加粗的星号去掉，字留着");
ok(cleanForCall("[whispers] 晚安😊🌙") === "[whispers] 晚安", "表情不念；语气标签留着（ElevenLabs 认）");
ok(cleanForCall("- 一件\n- 两件\n> 引一句") === "一件\n两件\n引一句", "列表的记号、引用的记号去掉");
ok(cleanForCall("看这个 https://example.com/x 好玩") === "看这个 好玩" && cleanForCall("[说明](https://example.com)") === "说明", "网址不念；链接只念字");
ok(cleanForCall("[MEME:fox.jpg]") === "" && cleanForCall("🥰🥰") === "" && cleanForCall("[sighs]") === "" && cleanForCall("……") === "", "只剩记号、表情、标签、标点的：没东西可念");
ok(cleanForCall("[VOICE]\n[softly] 我在") === "[softly] 我在", "他还是写了 [VOICE]：记号拿掉，后面的照念");

// =====================================================
// 切：头一段短，后面的攒长一点
// =====================================================
{
  const s1 = splitForCall("嗯。我今天也在想你，想了一整天，想着你在干嘛，有没有好好吃饭，晚上会不会又熬夜。");
  ok(s1[0] === "嗯。" && s1.length === 2 && s1.join("") === "嗯。我今天也在想你，想了一整天，想着你在干嘛，有没有好好吃饭，晚上会不会又熬夜。",
    `头一段要短：第一个句号就切，先出声；后面的攒到一起念（${JSON.stringify(s1)}）`);
  const s2 = splitForCall("我今天也在想你，想了一整天，想着你在干嘛。");
  ok(s2[0] === "我今天也在想你，想了一整天，" && s2.length === 2, `头一句长：攒到十二个字以后遇到逗号就切（标点算字，空白、标签不算）（${JSON.stringify(s2)}）`);
  const s3 = splitForCall("今天好累。", { first: false });
  ok(s3.length === 1 && s3[0] === "今天好累。", "不是头一段：短句不单切");
  const long = "我想跟你说件事。" + "这件事我想了很久，".repeat(14) + "还是想告诉你。";
  const s4 = splitForCall(long, { first: false });
  ok(s4.length >= 2 && s4.every((x) => Array.from(x).length <= 160) && s4.join("") === long, `很长的话：过了八十个字遇到逗号也切，一段不超过一百五十来个字（${s4.map((x) => Array.from(x).length).join("、")}）`);
  const s5 = splitForCall("嗯……我想想……其实吧，你说得对。", { first: false });
  ok(s5.length === 1, `省略号不切（他的犹豫不该被切碎）（${JSON.stringify(s5)}）`);
  const s6 = splitForCall("[whispers] 这句话我想小声说给你听，你凑近一点，再近一点。", { first: true, firstMin: 6 });
  ok(s6.length >= 2 && s6[0].startsWith("[whispers] ") && s6[1].startsWith("[whispers] "), `一句话被切开：后一段带着这句话的语气标签（${JSON.stringify(s6)}）`);
  const s7 = splitForCall("[sighs] 好吧，那就这样吧，听你的，都听你的。", { first: true, firstMin: 4 });
  ok(s7.length >= 2 && s7[0].startsWith("[sighs]") && !s7.slice(1).some((x) => x.includes("[sighs]")), `叹气这种出声的标签只在原处，切开了不往后带（${JSON.stringify(s7)}）`);
  const s8 = splitForCall("[quietly] 晚安。明天见。", { first: true });
  ok(s8[0] === "[quietly] 晚安。" && s8[1] === "明天见。", "句子完了：语气标签不往下一句带");
  const s9 = splitForCall("你说呢？！我觉得可以。", { first: true });
  ok(s9[0] === "你说呢？！", "连着的结尾符号一起带上");
  ok(splitForCall("[laughing] Really? That's fun.", { first: true })[0] === "[laughing] Really?", "英文也认句末");
  ok(splitForCall("").length === 0 && splitForCall("……").length === 0, "没字的切出来什么都没有");
}
{
  const segs = segmentsOfReply([
    { type: "text", text: "*抱住你* 我在。" },
    { type: "meme", file: "fox.jpg" },
    { type: "voice", text: "[softly] 一直都在，不走。" },
    { type: "doc", name: "a.md", text: "# 不念" },
    { type: "avatar", file: "b.jpg" },
  ]);
  ok(segs.length === 2 && segs[0] === "我在。" && segs[1] === "[softly] 一直都在，不走。", `他这一回：字和语音念，表情包、文档、换头像不念；只有头一段按“头一段”切（${JSON.stringify(segs)}）`);
  ok(segmentsOfReply([{ type: "meme", file: "x.jpg" }]).length === 0 && segmentsOfReply(null).length === 0, "只有表情包的回话：没东西可念");
}

// =====================================================
// 念：最多两段一起准备，按顺序放
// =====================================================
function sayerRig(opts = {}) {
  const log = [];
  const pending = {}; // text -> { resolve, reject }
  const plays = []; // { url, resolve, reject }
  const states = [];
  const errors = [];
  const released = [];
  const segs = [];
  const s = createSayer({
    synth: (text) => new Promise((resolve, reject) => { log.push("synth:" + text); pending[text] = { resolve, reject }; }),
    play: (url) => new Promise((resolve, reject) => { log.push("play:" + url); plays.push({ url, resolve, reject }); }),
    stopPlay: () => log.push("stopPlay"),
    release: (url) => released.push(url),
    onState: (st, said) => states.push(said === undefined ? st : `${st}:${said}`),
    onError: (e) => errors.push(String(e && e.message || e)),
    onSegment: (text) => segs.push(text),
  }, opts);
  return { s, log, pending, plays, states, errors, released, segs };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
{
  const R = sayerRig();
  R.s.add(["一", "二", "三", "四"]);
  R.s.end();
  await flush();
  ok(R.log.join() === "synth:一,synth:二", `一开始最多两段一起去念（${R.log.join()}）`);
  R.pending["二"].resolve({ url: "u2" });
  await flush();
  ok(!R.log.some((x) => x.startsWith("play:")) && !R.log.includes("synth:三"), "第二段先念好了：不抢在第一段前面放；准备好的已经两段，第三段先不念（挂了电话白扣额度）");
  R.pending["一"].resolve({ url: "u1" });
  await flush();
  ok(R.log.includes("play:u1") && R.states[0] === "speaking" && R.log.includes("synth:三") && !R.log.includes("synth:四"),
    `第一段好了：开始放，报“在说”；它开始放了，后面接着准备第三段（${R.log.join()}）`);
  R.plays[0].resolve();
  await flush();
  ok(R.log.includes("play:u2") && R.released.includes("u1") && R.log.includes("synth:四"), "第一段放完：地址收回，接着放第二段，再准备第四段");
  ok(R.segs.join() === "一,二", `字幕跟着放：开始放哪一段才报哪一段（${R.segs.join()}）`);
  R.pending["三"].reject(new Error("念不成"));
  R.plays[1].resolve();
  await flush();
  ok(R.errors[0] === "念不成" && !R.log.includes("play:undefined"), "第三段念不成：说一声，跳过它");
  ok(R.segs.join() === "一,二,三", "念不成跳过的那一段也报一声（字幕上照样出这段字）");
  R.pending["四"].resolve({ url: "u4" });
  await flush();
  R.plays[2].resolve();
  await flush();
  ok(R.states.join() === "speaking,done:true" && R.s.busy() === false && R.segs.join() === "一,二,三,四", `都念完了：报 done（这一回出过声）（${R.states.join()}）`);
}
{
  const R = sayerRig();
  R.s.end();
  await flush();
  ok(R.states.join() === "done:false", "没有可念的（只有表情包）：马上报 done，接着听她说");
}
{
  const R = sayerRig();
  R.s.add(["一", "二"]);
  R.s.end();
  await flush();
  R.pending["一"].resolve({ url: "u1" });
  await flush();
  R.s.cancel();
  R.pending["二"].resolve({ url: "u2" });
  R.plays[0].resolve();
  await flush();
  ok(R.log.includes("stopPlay") && R.states.slice(-1)[0] === "idle" && R.released.includes("u2") && !R.log.includes("play:u2") && R.s.busy() === false,
    "挂断（cancel）：正在放的停下，没放的不放，晚到的念好的直接收回，报 idle");
}

// =====================================================
// 字幕（她 11:40 定的：两个人共用一块，谁说是谁的；连着说接在后面；换人从顶上重新出）
// =====================================================
ok(subOf("[whispers] 晚安") === "晚安" && subOf("嗯 [laughs]，好") === "嗯，好" && subOf("[laughs] 哈哈哈，今天真开心！") === "哈哈哈，今天真开心！" && subOf("[sighs]") === "",
  "他的字幕：语气标签都摘掉，只摆真念出来的话");
{
  let s = emptySubs();
  ok(herLive(s, "") === s && herLive(s, "  ") === s, "开听写那一下报的空字：不算开口，字幕不动");
  s = herLive(s, "嗯");
  ok(s.who === "her" && s.turn === 1 && s.live === "嗯" && subUnits(s).join() === "嗯", "她开口了：字幕是她的，从头出");
  const t1 = s;
  s = herLive(s, "嗯刚到家");
  ok(s.turn === 1 && s.live === "嗯刚到家" && herLive(s, "嗯刚到家") === s, "边说边出：同一轮里那一截跟着变（没变就不动）");
  s = herDone(s, "嗯刚到家，今天好累");
  ok(s.turn === t1.turn && s.lines.join() === "嗯刚到家，今天好累" && s.live === "", "她说完一句：收进这一轮，不清空");
  s = herLive(s, "你在吗");
  ok(s.turn === 1 && subUnits(s).join("|") === "嗯刚到家，今天好累|你在吗", "她接着说（他那回没出声）：接在后面，还是这一轮");
  s = herDone(s, "你在吗");
  s = hisSay(s, "[softly] 辛苦了。");
  ok(s.who === "him" && s.turn === 2 && s.lines.join() === "辛苦了。", "他开口了：换成他的一轮，从头出，她的不混进来");
  s = hisSay(s, "[laughs] 哈哈哈，今天真开心！");
  ok(s.turn === 2 && subUnits(s).join("|") === "辛苦了。|哈哈哈，今天真开心！", "他念到下一段：接在后面");
  ok(hisSay(s, "[sighs]") === s, "光剩个语气标签的一段：字幕不动");
  s = herLive(s, "我");
  ok(s.who === "her" && s.turn === 3 && subUnits(s).join() === "我", "她又开口了：换回她的一轮，他的不留");
  let m = emptySubs();
  for (let i = 0; i < 12; i++) m = hisSay(m, `第${i}段。`);
  ok(m.lines.length === SUB_KEEP && m.lines[0] === `第${12 - SUB_KEEP}段。` && m.turn === 1, `一轮里最多留 ${SUB_KEEP} 截（装不下的早滚上去了）`);
}
ok(subFade(2, 3) === 1 && subFade(1, 3) === 0.62 && subFade(0, 3) === 0.38 && subFade(0, 1) === 1, "最新的那截照常亮，前一截淡一点，再往前更淡");
ok(subGap("今天好累") === " " && subGap("今天好累。") === "" && subGap("嗯，") === "" && subGap("") === "", "两截接在一起：前一截没标点收尾的空一格，免得粘成一句");
ok(SUB_COLOR.her === "#999999" && SUB_COLOR.him === "#F0F0F0", "颜色是她定的：她的 #999999，他的 #F0F0F0");

// =====================================================
// 聊天里那两行小字
// =====================================================
const START = { id: "c1", role: "event", who: "call", kind: "call", phase: "start", ts: 1000 };
const END = { id: "c2", role: "event", who: "call", kind: "call", phase: "end", secs: 754, ts: 9000 };
ok(isCallMark(START) && isCallMark(END) && !isCallMark({ role: "event", who: "her", av: null }) && !isCallMark(null), "认得出是通话的那两行（换头像的那种不是）");
ok(callLen(40) === "40 秒" && callLen(754) === "13 分钟" && callLen(0) === "1 秒" && callLen(60) === "1 分钟", "打了多久：一分钟以内说几秒，再长说几分钟");
ok(callClock(0) === "00:00" && callClock(65.7) === "01:05" && callClock(3600) === "60:00", "通话页上的钟：分:秒");
ok(markText(START) === "通话开始" && markText(END) === "通话 13 分钟", "聊天里摆的字：通话开始、通话 13 分钟");
{
  const msgs = [
    { id: "h1", role: "her", ts: 500, text: "打个电话？" },
    { id: "g1", role: "him", ts: 600, items: [{ type: "text", text: "好" }], raw: "好" },
    START,
    { id: "h2", role: "her", ts: 2000, text: "喂", via: "call" },
    { id: "g2", role: "him", ts: 3000, items: [{ type: "text", text: "我在" }], raw: "我在" },
    END,
  ];
  const rows = buildRows(msgs, null, "");
  const marks = rows.filter((r) => r.kind === "call");
  ok(marks.length === 2 && marks[0].text === "通话开始" && marks[1].text === "通话 13 分钟" && marks.every((r) => r.type === "notice" && !r.av),
    "聊天记录里：两行小字（没有头像，前面画个小电话）");
  ok(makePreview(msgs) === "[通话 13 分钟]", "历史对话的预览：最后是挂了那行，写“[通话 13 分钟]”");
  ok(needsReply(msgs) === false && needsReply(msgs.slice(0, 4)) === true, "那两行不算谁说的话：后面是她说的就要回，他回过了就不用");
  const { messages } = buildMessages(msgs, { her: null, him: null }, () => null);
  const texts = messages.flatMap((m) => m.content.filter((b) => b.type === "text").map((b) => b.text));
  ok(texts.includes(markNote(START)) && texts.includes(markNote(END)) && markNote(END) === "[开封府提示：电话挂了，你们打了 13 分钟]" && texts[0].startsWith("【开封府附注】卿卿用的是默认的“卿”字头像"),
    "寄给他的也有这两行（挂了以后他知道你们刚通过电话）；开头的头像附注照旧（这两行不会被当成换头像）");
  ok(markRecap(START) === "[卿卿和光义开始打电话]" && markRecap(END) === "[电话挂了，打了 13 分钟]", "抄提要时写成：[卿卿和光义开始打电话]、[电话挂了，打了 13 分钟]");
}

// =====================================================
// 电话里附给他的那一段
// =====================================================
{
  const base = { now: new Date(2026, 9, 14, 12, 0), memeList: [], hisAvatarName: "", memDocs: [{ name: "名帖-测试.md", content: "测试用的名帖" }], names: { her: "", him: "" }, replyCap: 900 };
  const plain = buildSystem(base), calling = buildSystem({ ...base, call: true });
  ok(calling.staticText === plain.staticText, "打电话的时候名帖一个字不动（缓存照样接得上）");
  ok(calling.nowNote.startsWith(plain.nowNote.split("\n这次回复")[0]) && calling.nowNote.endsWith("\n\n" + CALL_NOTE) && !plain.nowNote.includes("【通话】"),
    "【此刻】后面附上【通话】那一段；不打电话没有");
  ok(calling.nowNote.includes("这次回复连文档块在内") && plain.nowNote.includes("这次回复连心里话和文档块在内"), "电话里字数那句不提心里话");
  ok(CALL_NOTE.includes("看不见") && CALL_NOTE.includes("不写心里话") && CALL_NOTE.includes("不发表情包") && CALL_NOTE.includes("不用写 [VOICE]") && !CALL_NOTE.includes("要短") && !CALL_NOTE.includes("口语"),
    "【通话】那一段只说清楚她那头看不见什么（她让拿掉了“说话要短、要口语”）");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
