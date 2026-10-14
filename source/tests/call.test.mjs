// 通话（卿卿 10 月 14 日要的，见开发说明“通话”那一节）：听她说完没有、他的话怎么洗怎么切、按顺序念、聊天里那两行小字
import { createListener, PAUSE_MS, PAUSES, pauseOf } from "../src/call/listen.js";
import { cleanForCall, splitForCall, segmentsOfReply, createSayer, subOf } from "../src/call/say.js";
import { emptySubs, herLive, herDone, hisSay, unitsOf, subWho, subFade, subGap, SUB_KEEP, SUB_TURNS, SUB_COLOR, SUB_OLD } from "../src/call/subs.js";
import { createCallAudio, bytesOf } from "../src/call/play.js";
import { downsampler, toPcm16, rmsOf, pcmB64, MIC_RATE } from "../src/call/mic.js";
import { createHearer, sttUrl, joinText, sttTrouble, CHUNK, LOUD, LONG_EXTRA, TEXT_GRACE, FINAL_WAIT } from "../src/call/hear.js";
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

{
  const { l, made } = listener();
  l.start();
  const before = l.heard();
  made[0].say("嗯");
  const mid = l.heard();
  l.stop();
  ok(before === false && mid === true && l.heard() === false, "听没听到字（她点屏幕的时候看这个：听到了就不重开，免得把她说了一半的丢掉）");
}

// =====================================================
// 麦克风那几样零件（她 13:36 说系统听写滴滴嘟嘟，14:26 定了换 ElevenLabs 的实时听写）
// =====================================================
{
  const ramp = Float32Array.from({ length: 48 }, (_, i) => i / 100);
  const one = downsampler(48000)(ramp);
  const ds = downsampler(48000);
  const two = Array.from(ds(ramp.subarray(0, 24))).concat(Array.from(ds(ramp.subarray(24))));
  ok(one.length === 16 && Math.abs(one[0] - 0) < 1e-6 && Math.abs(one[1] - 0.03) < 1e-6 && Math.abs(one[15] - 0.45) < 1e-6 && two.length === 16 && two.every((v, i) => Math.abs(v - one[i]) < 1e-6),
    `降采样：48k 变 16k，三个取一个；一块一块来跟一口气来的一样（块和块接得上）（${one.length}、${two.length}）`);
  const odd = downsampler(44100);
  const n1 = odd(new Float32Array(4410)).length + odd(new Float32Array(4410)).length;
  ok(Math.abs(n1 - 3200) <= 1 && MIC_RATE === 16000, `降采样：44.1k 的十分之二秒变成 16k 的三千二百个点上下（${n1}）`);
  ok(Array.from(toPcm16(Float32Array.from([-1, 0, 1, 0.5, 2]))).join() === "-32768,0,32767,16384,32767", "浮点变 16 位整数：两头卡住");
  ok(Math.abs(rmsOf(Float32Array.from([0.5, -0.5])) - 0.5) < 1e-9 && rmsOf(new Float32Array(0)) === 0, "多响：均方根");
  ok(pcmB64(Int16Array.from([1, -1])) === "AQD//w==", "16 位的声音写成 base64：小端（ElevenLabs 要的样子）");
  const u = new URL(sttUrl({ token: "t1", url: "wss://api.elevenlabs.io/v1/speech-to-text/realtime", model: "scribe_v2_realtime", lang: "zh" }));
  ok(u.origin + u.pathname === "wss://api.elevenlabs.io/v1/speech-to-text/realtime" && u.searchParams.get("token") === "t1" && u.searchParams.get("model_id") === "scribe_v2_realtime" && u.searchParams.get("audio_format") === "pcm_16000" && u.searchParams.get("language_code") === "zh" && u.searchParams.get("commit_strategy") === "manual",
    "实时听写的地址：通行证、模型、16k 的 PCM、中文、说完没有我们自己判（manual）");
  ok(joinText("你好", "世界") === "你好世界" && joinText("hello", "world") === "hello world" && joinText("", "嗯") === "嗯", "两截字接起来：英文中间空一格，中文直接接");
  ok(sttTrouble({ message_type: "auth_error" }) === "key" && sttTrouble({ message_type: "quota_exceeded" }) === "quota" && sttTrouble({ message_type: "rate_limited" }) === "busy" && sttTrouble({ message_type: "input_error" }) === "net",
    "那边回来的毛病分得清：通行证不认、额度、太挤、别的");
  const kinds = ["unaccepted_terms", "commit_throttled", "insufficient_audio_activity", "session_time_limit_exceeded", "queue_overflow", "resource_exhausted", "transcriber_error"].map((t) => sttTrouble({ message_type: t, error: "x" }));
  ok(kinds.join() === "terms,soft,net,net,busy,busy,net", `事件表里别的几种：没同意条款、commit 太勤（不算毛病）、好一阵没送声音（不是额度不够）、连太久、两种太挤、认不了（${kinds.join()}）`);
  ok(sttTrouble({ message_type: "error", error: "Insufficient credits" }) === "quota" && sttTrouble({ message_type: "error", error: "Invalid token" }) === "key" && sttTrouble({ message_type: "error", error: "boom" }) === "net",
    "笼统的 error：照它说的话认（额度、通行证、别的）");
}

// =====================================================
// 听：ElevenLabs 的实时听写（一句一条 WebSocket，说完没有我们自己判）
// =====================================================
const settle = () => new Promise((r) => setTimeout(r, 0));
function hearRig(opts = {}) {
  const clock = fakeClock();
  const socks = [];
  class FakeWS {
    constructor(url) { this.url = url; this.sent = []; this.closed = false; socks.push(this); }
    send(x) { this.sent.push(JSON.parse(x)); }
    close() { this.closed = true; }
    up() { this.onopen && this.onopen(); }
    msg(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }
    drop() { this.onclose && this.onclose(); }
    commits() { return this.sent.filter((m) => m.commit).length; }
    audio() { return this.sent.filter((m) => !m.commit).reduce((n, m) => n + Buffer.from(m.audio_base_64, "base64").length / 2, 0); }
  }
  let n = 0;
  const asked = [];
  const token = opts.token || (() => { n += 1; asked.push(n); return Promise.resolve({ token: "t" + n, url: "wss://x/rt", model: "scribe_v2_realtime", lang: "zh" }); });
  let micFn = null;
  const got = { texts: [], done: [], fails: [] };
  const h = createHearer({
    now: clock.now, later: clock.later, pauseMs: opts.pauseMs || 1600, token, first: opts.first, socket: (url) => new FakeWS(url),
    mic: { listen: (f) => { micFn = f; } },
    onText: (t) => got.texts.push(t), onDone: (t) => got.done.push(t), onFail: (k) => got.fails.push(k),
  });
  // 麦克风送 ms 毫秒的声音（每一小段 100 毫秒），rms 是多响；边送边走钟
  const talk = (ms, rms = 0) => {
    for (let t = 0; t < ms; t += 100) { micFn({ pcm: new Int16Array(1600), rms }); clock.advance(100); }
  };
  return { h, clock, socks, got, talk, asked };
}
{
  const R = hearRig();
  R.h.start();
  R.talk(300, 0.05);
  await settle();
  const w = R.socks[0];
  ok(R.socks.length === 1 && new URL(w.url).searchParams.get("token") === "t1" && w.sent.length === 0, "开始听：拿一张通行证连一条；还没连上的时候说的话先攒着");
  R.talk(200, 0.05);
  w.up();
  ok(w.audio() === 1600 * 5, `连上了：攒着的一起送过去，一点不丢（送了 ${w.audio()} 个点）`);
  await settle();
  ok(R.asked.length === 2, "用掉一张通行证：马上再要一张备着（下一句一开口就连得上）");
  w.msg({ message_type: "session_started" });
  w.msg({ message_type: "partial_transcript", text: "喂" });
  w.msg({ message_type: "partial_transcript", text: "喂，你在吗" });
  ok(R.got.texts.slice(-2).join("|") === "喂|喂，你在吗" && R.h.heard(), "字一路回来：字幕跟着出");
  R.talk(1500, 0);
  ok(w.commits() === 0 && R.got.done.length === 0, "停了 1.5 秒：还不算说完");
  R.talk(300, 0);
  ok(w.commits() === 1, "停够 1.6 秒：送 commit（说完了）");
  w.msg({ message_type: "committed_transcript", text: "喂，你在吗？" });
  ok(R.got.done.join() === "喂，你在吗？" && w.closed && !R.h.listening(), "那边回“这一句定了”：交出去，这一条关掉");
  R.h.start();
  await settle();
  ok(R.socks.length === 2 && new URL(R.socks[1].url).searchParams.get("token") === "t2", "下一句：用备着的那张通行证，不用现要");
  R.h.stop();
  ok(R.socks[1].closed && !R.h.listening(), "他开口了（stop）：这一条关掉，不交东西");
}
{
  const R = hearRig();
  R.h.start();
  await settle();
  const w = R.socks[0];
  w.up();
  for (let i = 1; i <= 18; i++) { w.msg({ message_type: "partial_transcript", text: "说".repeat(i) }); R.talk(500, 0.05); }
  R.talk(1900, 0);
  const early = w.commits();
  R.talk(1000, 0);
  ok(early === 0 && w.commits() === 1, `已经说了 8 秒往上：喘口气不算，多等 ${LONG_EXTRA / 1000} 秒才算说完（攻略里踩出来的）`);
}
{
  const R = hearRig();
  R.h.start();
  await settle();
  const w = R.socks[0];
  w.up();
  w.msg({ message_type: "partial_transcript", text: "这屋里好吵" });
  R.talk(1600 + TEXT_GRACE - 300, 0.05);
  const before = w.commits();
  R.talk(400, 0.05);
  ok(before === 0 && w.commits() === 1, "屋里一直响：字不变了停够再多等 2.5 秒，也算说完");
}
{
  const R = hearRig();
  R.h.start();
  await settle();
  const w = R.socks[0];
  w.up();
  w.msg({ message_type: "partial_transcript", text: "等不到" });
  R.talk(1700, 0);
  ok(w.commits() === 1 && R.got.done.length === 0, "送了 commit");
  R.clock.advance(FINAL_WAIT + 10);
  ok(R.got.done.join() === "等不到", "送了 commit 等不到“定了”：用听到的那些交出去");
}
{
  const R = hearRig();
  R.h.start();
  await settle();
  const w = R.socks[0];
  w.up();
  R.talk(400, 0.08);
  R.talk(1700, 0);
  ok(w.commits() === 1, "咳了一声（响了、没出字）：停够了也送一回 commit 看看");
  w.msg({ message_type: "committed_transcript", text: "" });
  ok(R.got.done.length === 0 && R.h.listening() && !w.closed, "定下来是空的：当没说，接着听（这一条不关）");
}
{
  const R = hearRig();
  R.h.start();
  await settle();
  R.socks[0].up();
  R.socks[0].drop();
  await settle();
  ok(R.socks.length === 2 && R.got.fails.length === 0, "那边断了、还没出字：再连一回");
  R.socks[1].up();
  R.socks[1].drop();
  await settle();
  ok(R.got.fails.join() === "net" && !R.h.listening(), "又断了：说听不了（net）");
}
{
  const R = hearRig();
  R.h.start();
  await settle();
  R.socks[0].up();
  R.socks[0].msg({ message_type: "partial_transcript", text: "说到一半" });
  R.socks[0].drop();
  ok(R.got.done.join() === "说到一半", "那边断了、已经出字了：把听到的交出去");
}
{
  const R = hearRig();
  R.h.start();
  await settle();
  R.socks[0].up();
  R.socks[0].msg({ message_type: "auth_error", error: "Invalid or expired token" });
  ok(R.got.fails.join() === "key", "通行证不认：说听不了（key）");
  const B = hearRig({ token: () => Promise.reject(Object.assign(new Error("没开权限"), { code: "key" })) });
  B.h.start();
  await settle();
  await settle();
  ok(B.got.fails.join() === "key" && B.socks.length === 0, "要不到通行证（key 没开 Speech to Text）：说听不了（key），不去连");
  const T = hearRig({ token: () => Promise.reject(Object.assign(new Error("没同意条款"), { code: "terms" })) });
  T.h.start();
  await settle();
  await settle();
  ok(T.got.fails.join() === "terms" && T.socks.length === 0, "要不到通行证（还没同意听写的条款）：说听不了（terms），不去连");
}
{
  // commit 送得太勤（commit_throttled）：不算毛病。有字的等不到“定了”就用听到的；没字的接着听
  const R = hearRig();
  R.h.start();
  await settle();
  const w = R.socks[0];
  w.up();
  w.msg({ message_type: "partial_transcript", text: "太勤了" });
  R.talk(1700, 0);
  w.msg({ message_type: "commit_throttled", error: "Commit throttled" });
  ok(R.got.done.length === 0 && R.got.fails.length === 0 && R.h.listening(), "commit 被那边按下了：不算毛病，先不交");
  R.clock.advance(FINAL_WAIT + 10);
  ok(R.got.done.join() === "太勤了", "等不到“定了”：用听到的那些交出去");
  const S = hearRig();
  S.h.start();
  await settle();
  S.socks[0].up();
  S.socks[0].msg({ message_type: "commit_throttled", error: "Commit throttled" });
  ok(S.got.fails.length === 0 && S.h.listening() && !S.socks[0].closed, "没字的时候来一回 commit_throttled：接着听，不报听不了");
}
{
  // 好一阵没送声音（insufficient_audio_activity）：当断了再连一回，不当成额度用完了
  const R = hearRig();
  R.h.start();
  await settle();
  R.socks[0].up();
  R.socks[0].msg({ message_type: "insufficient_audio_activity", error: "You haven't sent enough audio activity to maintain the connection." });
  await settle();
  ok(R.got.fails.length === 0 && R.socks.length === 2 && R.socks[0].closed, "那边说好一阵没送声音：再连一回，不说额度用完了");
}
{
  const R = hearRig({ first: { token: "early", url: "wss://x/rt" } });
  R.h.start();
  await settle();
  ok(new URL(R.socks[0].url).searchParams.get("token") === "early", "接通的时候已经要好的那张：开头那一句就用它");
  R.socks[0].up();
  R.h.stop();
  R.socks[0].msg({ message_type: "partial_transcript", text: "挂了以后" });
  ok(R.got.texts.every((t) => t !== "挂了以后") && R.got.done.length === 0, "停了以后那边再来字：不认");
}

// =====================================================
// 放他的声音（她 12:50 碰上的：只能说一句。iPhone 上 <audio> 放过一回，下一回开听写就听不见了）
// =====================================================
const tick = () => new Promise((r) => setTimeout(r, 0));
function audioRig({ ac = true, resumable = true, session = true } = {}) {
  const log = [];
  const revoked = [];
  const acs = [];
  let n = 0;
  class FakeAC {
    constructor() { this.state = "suspended"; this.sources = []; acs.push(this); log.push("ac"); }
    get destination() { return {}; }
    createBuffer() { return { duration: 0 }; }
    createBufferSource() {
      const src = { connect() {}, start: () => log.push("src.start"), stop: () => log.push("src.stop"), onended: null };
      this.sources.push(src);
      return src;
    }
    resume() { if (resumable) this.state = "running"; return Promise.resolve(); }
    decodeAudioData(buf, ok2) { const got = { duration: 0.01, bytes: buf.byteLength }; ok2(got); return Promise.resolve(got); }
    close() { log.push("ac.close"); return Promise.resolve(); }
  }
  class FakeAudio {
    constructor() { this.src = ""; }
    play() { log.push("el.play:" + this.src); setTimeout(() => this.onended && this.onended(), 0); return Promise.resolve(); }
    pause() { log.push("el.pause"); }
    removeAttribute() {}
  }
  const win = {
    Audio: FakeAudio,
    URL: { createObjectURL: () => "blob:" + ++n, revokeObjectURL: (u) => revoked.push(u) },
    Blob: class { constructor() {} },
    navigator: session ? { audioSession: { type: "auto" } } : {},
  };
  if (ac) win.AudioContext = FakeAC;
  return { win, log, revoked, acs, a: createCallAudio(win, new Uint8Array([1, 2, 3])) };
}
{
  ok(Array.from(bytesOf(btoa("abc"))).join() === "97,98,99", "念好的声音（base64）解回字节");
  const R = audioRig();
  R.a.unlock();
  ok(R.win.navigator.audioSession.type === "play-and-record" && R.log[0] === "ac" && R.log.includes("src.start") && R.log.some((x) => x.startsWith("el.play:blob:")),
    `打电话那一下：告诉 iPhone 这一通是又放又录的；Web Audio 开起来、放一下没声音的；<audio> 也先放一下没声音的（${R.log.join()}）`);
  const clip = await R.a.decode(btoa("mp3bytes"), "audio/mpeg");
  ok(clip.buf && clip.buf.bytes === 8 && String(clip.url).startsWith("blob:"), "念好的一段：Web Audio 解码好，再留一个 <audio> 用的地址兜底");
  R.log.length = 0;
  let done = false;
  R.a.play(clip).then(() => { done = true; });
  await tick();
  ok(R.log.join() === "src.start" && R.a.kind() === "webaudio" && !done, `放：用 Web Audio，不用 <audio>；还没放完（${R.log.join()}）`);
  R.acs[0].sources.slice(-1)[0].onended();
  await tick();
  ok(done, "Web Audio 那一段报放完了：这一段才算放完（接着放下一段）");
  R.a.play(clip);
  await tick();
  R.a.stop();
  ok(R.log.includes("src.stop") && R.log.includes("el.pause"), "立刻停：Web Audio 那一段停下，<audio> 也停下");
  R.a.release(clip);
  ok(R.revoked.includes(clip.url), "这一段用完了：<audio> 用的地址收回");
  R.a.close();
  ok(R.win.navigator.audioSession.type === "auto" && R.log.includes("ac.close"), "挂了：Web Audio 关掉，iPhone 的声音路子换回原来的");
}
{
  const R = audioRig({ resumable: false });
  R.a.unlock();
  const clip = await R.a.decode(btoa("x"), "audio/mpeg");
  R.log.length = 0;
  await R.a.play(clip);
  ok(R.log.join() === "el.play:" + clip.url, `Web Audio 醒不过来：这一段改用 <audio> 放（${R.log.join()}）`);
}
{
  const R = audioRig({ ac: false, session: false });
  R.a.unlock();
  const clip = await R.a.decode(btoa("x"), "audio/mpeg");
  R.log.length = 0;
  await R.a.play(clip);
  ok(clip.buf === null && R.log.join() === "el.play:" + clip.url && R.a.kind() === "audio", "没有 Web Audio 的浏览器：照原来用 <audio> 放；没有声音路子那个开关的也不碍事");
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
// 字幕（她 11:40 定的五条，12:08 改了：居中；换人另起一行，两个人的都留着）
// =====================================================
ok(subOf("[whispers] 晚安") === "晚安" && subOf("嗯 [laughs]，好") === "嗯，好" && subOf("[laughs] 哈哈哈，今天真开心！") === "哈哈哈，今天真开心！" && subOf("[sighs]") === "",
  "他的字幕：语气标签都摘掉，只摆真念出来的话");
{
  const look = (s) => s.turns.map((t) => `${t.who}:${unitsOf(t).join("|")}`).join(" / ");
  let s = emptySubs();
  ok(herLive(s, "") === s && herLive(s, "  ") === s && subWho(s) === "", "开听写那一下报的空字：不算开口，字幕不动");
  s = herLive(s, "嗯");
  ok(look(s) === "her:嗯" && subWho(s) === "her", "她开口了：头一段是她的");
  s = herLive(s, "嗯刚到家");
  ok(look(s) === "her:嗯刚到家" && herLive(s, "嗯刚到家") === s, "边说边出：那一截跟着变（没变就不动）");
  s = herDone(s, "嗯刚到家，今天好累");
  ok(look(s) === "her:嗯刚到家，今天好累" && s.turns[0].live === "", "她说完一句：收进她这一段，不清空");
  s = herLive(s, "你在吗");
  ok(look(s) === "her:嗯刚到家，今天好累|你在吗", "她接着说（他那回没出声）：接在她这一段后面");
  s = herDone(s, "你在吗");
  const herId = s.turns[0].id;
  s = hisSay(s, "[softly] 辛苦了。");
  ok(look(s) === "her:嗯刚到家，今天好累|你在吗 / him:辛苦了。" && subWho(s) === "him" && s.turns[0].id === herId && s.turns[1].id !== herId,
    "他开口了：另起一段接在下面，她那段还在（两个人的都留着）");
  s = hisSay(s, "[laughs] 哈哈哈，今天真开心！");
  ok(look(s) === "her:嗯刚到家，今天好累|你在吗 / him:辛苦了。|哈哈哈，今天真开心！", "他念到下一段：接在他这一段后面");
  ok(hisSay(s, "[sighs]") === s, "光剩个语气标签的一段：字幕不动");
  s = herLive(s, "我");
  ok(look(s) === "her:嗯刚到家，今天好累|你在吗 / him:辛苦了。|哈哈哈，今天真开心！ / her:我" && subWho(s) === "her", "她又开口了：再另起一段");
  let m = emptySubs();
  for (let i = 0; i < 12; i++) m = hisSay(m, `第${i}段。`);
  ok(m.turns.length === 1 && m.turns[0].lines.length === SUB_KEEP && m.turns[0].lines[0] === `第${12 - SUB_KEEP}段。`, `一段里最多留 ${SUB_KEEP} 截（装不下的早滚上去了）`);
  let n = emptySubs();
  for (let i = 0; i < 9; i++) n = i % 2 ? hisSay(n, `他${i}。`) : herDone(n, `她${i}`);
  ok(n.turns.length === SUB_TURNS && n.turns[0].lines[0] === `他3。` && new Set(n.turns.map((t) => t.id)).size === SUB_TURNS && n.next === 10, `最多留 ${SUB_TURNS} 段，再往前的不留；每段的编号不重`);
}
ok(subFade(0) === 1 && subFade(1) === 0.62 && subFade(2) === 0.38 && subFade(5) === 0.38 && subFade(SUB_OLD) === 0.38, "最新的那截照常亮，前一截淡一点，再往前更淡；前面几段的都淡");
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
    { id: "a", role: "him", ts: 500, items: [{ type: "text", text: "[softly] 电话前" }] },
    START,
    { id: "h", role: "her", ts: 2000, text: "喂" },
    { id: "b", role: "him", ts: 3000, items: [{ type: "text", text: "[softly] 在呢" }, { type: "meme", file: "x.jpg" }] },
    END,
    { id: "c", role: "him", ts: 9500, items: [{ type: "text", text: "[softly] 挂了" }] },
  ];
  const his = buildRows(msgs, null).filter((r) => r.type === "bubble" && r.role === "him");
  ok(his.map((r) => !!r.call).join() === "false,true,true,false", `电话里他那几条记着 call（聊天里不摆语气标签，她 12:21 定的）；电话前后的不算（${his.map((r) => !!r.call).join()}）`);
}
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
  ok(CALL_NOTE === "【通话】你们正在打电话：你回的每一句都会用你的声音念给她听，她这会儿看着的是通话页面，只能看到你的头像和昵称，对话界面的东西看不见，所以这时候不写心里话，不发表情包、不交文档、不写星号动作；每一句本来就会念出来，不用写 [VOICE]。语气标签照用。" && !CALL_NOTE.includes("不换头像"),
    "【通话】那一段一个字不差是她 16:27 改的那样（看得到头像和昵称；“不换头像”拿掉了）");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
