// =====================================================
//   通话里听她说话（卿卿 2026 年 10 月 14 日要的通话，见开发说明“通话”那一节）。
//   用的是手机自带的听写（SpeechRecognition，iPhone 上就是系统的听写），声音不出手机、不花钱。
//   自己判断她说完没有：听写出来的字有好一会儿（pauseMs，默认 1.6 秒）不再变，就当她说完了，交出这一句。
//   不碰页面：听写的构造函数、钟、定时器都从外面递进来，测试在 Node 里拿假的跑（tests/call.test.mjs）。
// =====================================================

export const PAUSE_MS = 1600; // 停多久算说完（那份“小屋”攻略里真的通话磨出来的数，短句 1.6 秒）
export const PAUSES = [1200, 1600, 2000]; // API 面板里能挑的三档
export const pauseOf = (v) => (PAUSES.includes(Number(v)) ? Number(v) : PAUSE_MS);
const TICK_MS = 200; // 多久看一眼字还变不变
const FINAL_WAIT = 1200; // 叫听写收尾以后，最多等它把最后那点字交回来这么久
const QUICK_MS = 1000; // 一开起来不到这么久就自己停了：算“一开就停”
const QUICK_MAX = 5; // 连着一开就停这么多回：这台手机上听不了，别再空转

// d：{
//   SR         听写的构造函数（window.SpeechRecognition || window.webkitSpeechRecognition）；没有就听不了
//   now()      现在是多少毫秒
//   later(fn, ms)  过一会儿叫 fn；回一个“不叫了”的函数
//   pauseMs    停多久算说完
//   onText(text)   听到的字变了（通话页上头像底下那行小字）
//   onDone(text)   她说完了一句（不是空的）
//   onFail(kind)   听不了：mic 不给用麦克风（或者 iPhone 要她点一下才肯开）、dead 一开就停、none 这台手机没有听写
// }
// 回 { start(), stop(), listening(), heard() }：start 开始听新的一句；stop 不听了（挂断、静音、轮到他说），听到一半的不交
export function createListener(d) {
  const pauseMs = d.pauseMs || PAUSE_MS;
  let rec = null;
  let on = false; // 正在听这一句
  let text = "";
  let lastAt = 0;
  let finishing = false;
  let startedAt = 0;
  let quick = 0;
  let stopTick = null;
  let stopWait = null;
  let stopRestart = null;

  const clearTimers = () => {
    [stopTick, stopWait, stopRestart].forEach((f) => f && f());
    stopTick = stopWait = stopRestart = null;
  };
  const drop = () => {
    const r = rec;
    rec = null;
    if (!r) return;
    r.onresult = r.onend = r.onerror = null;
    try {
      r.abort();
    } catch (e) {}
  };
  // 这一句听完了：交出去（空的不交，接着听）
  const deliver = () => {
    if (!on) return;
    const said = text.trim();
    if (!said) {
      finishing = false;
      restart();
      return;
    }
    on = false;
    clearTimers();
    drop();
    d.onDone(said);
  };
  const fail = (kind) => {
    on = false;
    clearTimers();
    drop();
    d.onFail(kind);
  };
  const tick = () => {
    stopTick = d.later(tick, TICK_MS);
    if (!on || finishing || !text.trim()) return;
    if (d.now() - lastAt >= pauseMs) {
      // 停够了：叫听写收尾（它会把最后那点字交回来，再报结束）；它不报就自己收
      finishing = true;
      try {
        rec && rec.stop();
      } catch (e) {}
      stopWait = d.later(deliver, FINAL_WAIT);
    }
  };
  const open = () => {
    let r;
    try {
      r = new d.SR();
    } catch (e) {
      fail("none");
      return;
    }
    r.lang = "zh-CN";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (ev) => {
      if (rec !== r) return;
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      if (t === text) return;
      text = t;
      lastAt = d.now();
      d.onText(text);
    };
    r.onerror = (ev) => {
      if (rec !== r) return;
      const e = ev && ev.error;
      if (e === "not-allowed" || e === "service-not-allowed" || e === "audio-capture") fail("mic");
      // 别的（没听到声音、被打断、网络）：等它报结束，照常接着听
    };
    r.onend = () => {
      if (rec !== r) return;
      rec = null;
      if (finishing || text.trim()) {
        deliver();
        return;
      }
      // 什么都没听到就自己停了（iPhone 上停顿久了会这样）：接着听。老是一开就停：听不了
      if (d.now() - startedAt < QUICK_MS) quick += 1;
      else quick = 0;
      if (quick >= QUICK_MAX) {
        fail("dead");
        return;
      }
      restart();
    };
    rec = r;
    startedAt = d.now();
    try {
      r.start();
    } catch (e) {
      rec = null;
      fail("mic");
    }
  };
  const restart = () => {
    drop();
    if (!on) return;
    if (stopRestart) stopRestart();
    stopRestart = d.later(() => {
      stopRestart = null;
      if (on) open();
    }, 250);
  };

  return {
    start() {
      if (!d.SR) {
        d.onFail("none");
        return;
      }
      clearTimers();
      drop();
      on = true;
      text = "";
      lastAt = d.now();
      finishing = false;
      quick = 0;
      d.onText("");
      stopTick = d.later(tick, TICK_MS);
      open();
    },
    stop() {
      on = false;
      finishing = false;
      clearTimers();
      drop();
    },
    listening: () => on,
    // 这一句听到过字没有（她点屏幕的时候：听到了就不重开，免得把她说了一半的丢掉）
    heard: () => on && !!text.trim(),
  };
}
