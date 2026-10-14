// =====================================================
//   量一量回声（打断他用；卿卿 10 月 14 日 17:26 定的：“你一开口就打断（得先量回声，管用才行）”）。
//   他说话的声音从喇叭出来，麦克风也收得到。iPhone 的回声消除（麦克风开着 echoCancellation）管不管网页放出来的声音，
//   这头试不了：在她手机上照打电话一模一样的样子（又放又录、Web Audio 放、麦克风开着回声消除、等麦克风开好了再放），
//   放一句他的声音，量麦克风收到多少。三步：
//     1. 安静两秒：屋里本来多响；
//     2. 放一句，她别出声：他的声音漏进麦克风多少（开头那一小会儿回声消除也许还没跟上，单算）；
//     3. 再放一遍，她跟着说：她说话多响。
//   她说话比漏进来的大得多，才分得清“她开口了”和“他自己的声音”，“一开口就打断”才做得成。
//   零件不碰浏览器（钟、麦克风、放声音都从外头递进来），测试在 Node 里跑（tests/call.test.mjs）。
// =====================================================

export const ECHO_LINE = "卿卿，我在量回声。你先别出声，听我把这一句说完。";
export const ECHO_KEY = "kfs2:echoline"; // 念好的这一句存着（加密了跟着云端走），再量不再花钱
export const QUIET_MS = 2000; // 第一步安静多久
export const GAP_MS = 900; // 两步之间空一会儿：上一步的尾巴（回声、她收声）不算进下一步
export const HEAD_MS = 600; // 他开口以后这么久里漏进来的单算（回声消除也许还没跟上）
export const OK_TIMES = 4; // 她说话是漏进来的这么多倍往上：分得开
export const EDGE_TIMES = 2; // 这么多倍往上：勉强

// 一串数的几个分位：中间的、九成的、九成五的、最大的
export function stats(values) {
  const v = (values || []).filter((x) => typeof x === "number" && isFinite(x)).sort((a, b) => a - b);
  const at = (q) => (v.length ? v[Math.min(v.length - 1, Math.floor(q * (v.length - 1) + 0.5))] : 0);
  return { n: v.length, med: at(0.5), p75: at(0.75), p90: at(0.9), p95: at(0.95), max: v.length ? v[v.length - 1] : 0 };
}

// 三步量下来的（每一小段 { t: 这一步开始以后多少毫秒, rms }）→ 几个数和结论
//   quiet  屋里本来多响（九成的那一档）
//   head   他开口那一会儿漏进来最多的
//   echo   后面漏进来的（九成五那一档：偶尔冒一下的不算）
//   her    她跟着说的时候多响（七成五那一档：她不会一直不停嘴，取说着的那些）
//   times  她说话是漏进来的几倍（漏进来的比屋里本来的还小，就跟屋里本来的比）
//   verdict  ok 分得开 / edge 勉强 / no 分不开 / mute 第三步没听到她说话（再量一回）
export function echoResult({ quiet, echo, both }) {
  const q = stats((quiet || []).map((f) => f.rms));
  const head = stats((echo || []).filter((f) => f.t < HEAD_MS).map((f) => f.rms));
  const body = stats((echo || []).filter((f) => f.t >= HEAD_MS).map((f) => f.rms));
  const her = stats((both || []).map((f) => f.rms));
  const floor = Math.max(body.p95, q.p90, 1e-4);
  const times = her.p75 / floor;
  let verdict = times >= OK_TIMES ? "ok" : times >= EDGE_TIMES ? "edge" : "no";
  // 漏进来的本来就小（回声消除管用），第三步却没比它、比屋里响出多少：多半是她没跟着说，再量一回。
  // 漏进来的大，第三步跟它差不多：分不出她说没说（她说了也被盖住、被回声消除压下去了），就是分不开
  const echoLow = body.p95 <= Math.max(q.p90 * 3, 0.006);
  if (echoLow && her.p75 <= Math.max(body.p95, q.p90) * 1.5) verdict = "mute";
  return { quiet: q.p90, head: head.max, echo: body.p95, echoMax: body.max, her: her.p75, times, verdict, frames: { quiet: q.n, echo: head.n + body.n, both: her.n } };
}

export const VERDICT_TEXT = {
  ok: "分得开：你说话比漏进来的我的声音大得多，可以做“一开口就打断”。",
  edge: "勉强：你说话比漏进来的大，可差得不多，要再看看。",
  no: "分不开：漏进麦克风的我的声音跟你说话差不多响。",
  mute: "第三步没听到你说话：再量一回，这回跟着我一起说。",
};

// d：{
//   now()、later(fn, ms) → 不叫了的函数
//   mic       { listen(fn) }：麦克风一小段一小段交 { rms }（mic.js）
//   play(clip) 放他那一句，放完了 resolve（play.js 的 play）
//   clip      念好、解码好的那一句
//   onStep(step)   "quiet" 安静 / "echo" 放、别出声 / "both" 再放、跟着说
//   onLevel(rms)   每一小段多响（画面上那根条）
//   onDone(结果)   echoResult 的那些
//   onFail(err)
// }
// 回 { start(), stop() }
export function createEchoProbe(d) {
  const got = { quiet: [], echo: [], both: [] };
  let step = null; // 眼下往哪一步记
  let t0 = 0;
  let stopped = false;
  let cancel = null;
  const wait = (ms) =>
    new Promise((resolve) => {
      cancel = d.later(resolve, ms);
    });
  d.mic.listen(({ rms }) => {
    if (stopped) return;
    d.onLevel(rms);
    if (step) got[step].push({ t: d.now() - t0, rms });
  });
  const enter = (s) => {
    step = s;
    t0 = d.now();
    d.onStep(s);
  };
  const run = async () => {
    enter("quiet");
    await wait(QUIET_MS);
    if (stopped) return;
    step = null;
    d.onStep("echo");
    await wait(GAP_MS);
    if (stopped) return;
    enter("echo");
    await d.play(d.clip);
    if (stopped) return;
    step = null;
    d.onStep("both");
    await wait(GAP_MS + 600); // 让她看清这一步要跟着说
    if (stopped) return;
    enter("both");
    await d.play(d.clip);
    if (stopped) return;
    step = null;
    d.onDone(echoResult(got));
  };
  return {
    start() {
      run().catch((e) => {
        if (!stopped) d.onFail(e);
      });
    },
    stop() {
      stopped = true;
      step = null;
      if (cancel) cancel();
    },
  };
}
