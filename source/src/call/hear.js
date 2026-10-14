// =====================================================
//   打电话时听她说话：ElevenLabs 的实时听写（Scribe v2 Realtime；见开发说明“通话：换成 ElevenLabs 的实时听写”那一节）。
//   卿卿 10 月 14 日 13:36 说系统听写每开一回、停一回都“滴滴嘟嘟”，14:26 定了换成这个（实时的：她边说字幕边出）。
//   跟 listen.js（系统听写）对外是一个样子：start() 开始听新的一句；stop() 不听了；listening()、heard()；
//   onText(字) 听到的字变了；onDone(字) 她说完了一句；onFail(缘故) 听不了。App 那头不用管底下是哪一种。
//
//   怎么听：
//   - 麦克风整通电话开着（mic.js），这里只在该听的时候把声音送出去：一句一条 WebSocket（连 ElevenLabs，通行证是 voice 函数给的，
//     一次性的；用掉一张马上再要一张备着，下一句一开口就连得上）。还没连上的那一小会儿说的话先攒着，连上了一起送。
//   - 字一路回来（partial_transcript），通话页上的字幕跟着出。
//   - 她说完没有我们自己判（commit_strategy=manual）：有字了以后，又不响、字又不变，停够她挑的那么久（1.2 / 1.6 / 2 秒）就算说完；
//     已经说了 8 秒往上的，喘口气不算，多等 1.2 秒（攻略里踩出来的：一段长话中间换口气，不该切成三条）。
//     屋里吵、一直响的话，字不变了停够再多等 2.5 秒也算说完。
//   - 说完了送一个 commit，等它回“这一句定了”（committed_transcript）交出去；等 2.5 秒还不来就用听到的那些。
//   - 定下来是空的（咳了一声、碰了一下）：当没说，接着听。
//   - 那边断了：有字就交出去；没字再连一回，还不行就说听不了。
//   浏览器的东西（WebSocket、钟、通行证、麦克风）从外头递进来，测试在 Node 里拿假的跑（tests/call.test.mjs）。
// =====================================================
import { pcmB64 } from "./mic.js";

export const CHUNK = 1600; // 一回送这么多个点（16k 下十分之一秒）
export const LOUD = 0.012; // 均方根过了这个算她在出声（攻略里的数）
export const LONG_TALK = 8000; // 说了这么久往上
export const LONG_EXTRA = 1200; // 喘口气多等这么久
export const TEXT_GRACE = 2500; // 一直响（屋里吵），字不变了停够再多等这么久也算说完
export const FINAL_WAIT = 2500; // 送了 commit 等它回定下来的字最多等这么久
export const CONNECT_WAIT = 8000; // 连 WebSocket 最多等这么久
export const QUEUE_MAX = 16000 * 12; // 还没连上的时候最多攒这么多个点（十二秒）
export const TOKEN_AGE = 13 * 60 * 1000; // 备着的通行证放了这么久就不用了（ElevenLabs 那边十五分钟作废）
export const PREROLL_MAX = 16000 * 2; // 没在听的时候留着最近这么多个点（两秒）
const TICK = 200;

// 实时听写的地址：通行证、模型、16k 的 PCM、中文、我们自己判说完
export function sttUrl(tk) {
  const q = new URLSearchParams({ model_id: tk.model || "scribe_v2_realtime", token: tk.token, audio_format: "pcm_16000", language_code: tk.lang || "zh", commit_strategy: "manual" });
  return `${tk.url}?${q.toString()}`;
}

// 两截字接起来：两边都是英文字母（数字）的中间空一格，中文直接接
export function joinText(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (!x) return y;
  if (!y) return x;
  return /[A-Za-z0-9]$/.test(x) && /^[A-Za-z0-9]/.test(y) ? x + " " + y : x + y;
}

// 那边回来的消息是哪一种毛病（照 ElevenLabs 实时听写的事件表）：
// key（通行证不认）、terms（她还没在 ElevenLabs 网站上同意听写的条款）、quota（额度用完了）、busy（太挤）、
// soft（commit 送得太勤，那一下没收：不算毛病，等不到“定了”就用听到的；那边真断了 onclose 会管）、
// net（别的：一条连太久到了上限、好一阵没送声音、送的声音它认不了……断了再连一回）
const TROUBLE = {
  auth_error: "key",
  unaccepted_terms: "terms",
  quota_exceeded: "quota",
  rate_limited: "busy",
  queue_overflow: "busy",
  resource_exhausted: "busy",
  commit_throttled: "soft",
};
export function sttTrouble(m) {
  const type = String((m && m.message_type) || "");
  if (Object.prototype.hasOwnProperty.call(TROUBLE, type)) return TROUBLE[type];
  const t = String(type + " " + ((m && (m.error || m.message)) || "")).toLowerCase();
  // 这几种名字里带着容易认错的字（insufficient_audio_activity 不是额度不够），先认出来
  if (/insufficient_audio|session_time|transcriber|input_error|invalid_request|chunk_size/.test(t)) return "net";
  if (/quota|credit/.test(t)) return "quota";
  if (/terms/.test(t)) return "terms";
  if (/auth|token|permission/.test(t)) return "key";
  if (/rate|throttl|concurren|queue|exhaust|capacity/.test(t)) return "busy";
  return "net";
}

const OK_TYPES = new Set(["session_started", "partial_transcript", "committed_transcript", "committed_transcript_with_timestamps", "committed_transcript_entities", "warning"]);

// d：{
//   now()、later(fn, ms) → 不叫了的函数
//   pauseMs                停多久算说完（她在 API 面板挑的）
//   token()                要一张通行证：Promise<{ token, url, model, lang }>；出了岔子抛带 code 的错
//   first                  （可以没有）开头已经要好的那一张
//   socket(url)            开一条 WebSocket（浏览器里就是 new WebSocket(url)）
//   mic                    { listen(fn) }：麦克风一小段一小段交 { pcm, rms }
//   onText、onDone、onFail
// }
export function createHearer(d) {
  let on = false;
  let gen = 0; // 每开一回加一：旧的回调认得出自己过期了
  let ws = null;
  let open = false;
  let queue = []; // 还没连上时攒着的
  let queued = 0;
  let pending = []; // 攒不够一块的
  let pendingN = 0;
  let committed = "";
  let partial = "";
  let shown = "";
  let activityAt = 0;
  let textAt = 0;
  let firstAt = 0;
  let voiced = false;
  let finishing = false;
  let retried = false;
  let spare = d.first && d.first.token ? { tk: d.first, at: d.now() } : null;
  let fetching = null;
  const timers = { tick: null, finish: null, connect: null };

  const clear = (k) => {
    if (timers[k]) timers[k]();
    timers[k] = null;
  };
  const text = () => joinText(committed, partial).trim();

  // 通行证：备着的还新就用它，用掉了马上再要一张备着
  const prefetch = () => {
    if (spare || fetching) return;
    fetching = Promise.resolve()
      .then(() => d.token())
      .then(
        (tk) => {
          fetching = null;
          if (tk && tk.token) spare = { tk, at: d.now() };
        },
        () => {
          fetching = null;
        }
      );
  };
  const getToken = async () => {
    if (spare && d.now() - spare.at < TOKEN_AGE) {
      const tk = spare.tk;
      spare = null;
      return tk;
    }
    spare = null;
    if (fetching) await fetching;
    if (spare && d.now() - spare.at < TOKEN_AGE) {
      const tk = spare.tk;
      spare = null;
      return tk;
    }
    return d.token();
  };

  const send = (pcm, commit = false) => {
    if (!ws || !open) return;
    try {
      ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: pcm && pcm.length ? pcmB64(pcm) : "", commit, sample_rate: 16000 }));
    } catch (e) {}
  };
  const joinPcm = (parts, n) => {
    const out = new Int16Array(n);
    let at = 0;
    parts.forEach((p) => {
      out.set(p, at);
      at += p.length;
    });
    return out;
  };
  // 攒着的、攒不够一块的都送出去（连上的那一下、说完要 commit 之前）
  const flush = () => {
    if (!open) return;
    queue.forEach((p) => send(p));
    queue = [];
    queued = 0;
    if (pendingN) {
      send(joinPcm(pending, pendingN));
      pending = [];
      pendingN = 0;
    }
  };

  const closeWs = () => {
    const w = ws;
    ws = null;
    open = false;
    clear("connect");
    if (!w) return;
    w.onopen = w.onmessage = w.onclose = w.onerror = null;
    try {
      w.close();
    } catch (e) {}
  };
  const reset = () => {
    committed = partial = shown = "";
    activityAt = textAt = d.now();
    firstAt = 0;
    voiced = false;
    finishing = false;
    clear("finish");
  };
  const end = () => {
    on = false;
    gen += 1;
    closeWs();
    clear("tick");
    clear("finish");
    queue = [];
    queued = 0;
    pending = [];
    pendingN = 0;
  };

  const show = () => {
    const t = text();
    if (t === shown) return;
    shown = t;
    activityAt = textAt = d.now();
    if (!firstAt && t) firstAt = d.now();
    d.onText(t);
  };

  // 这一句定了：交出去（空的当没说，接着听）
  const deliver = () => {
    if (!on) return;
    const t = text();
    clear("finish");
    if (!t) {
      reset();
      return;
    }
    end();
    prefetch();
    d.onDone(t);
  };
  const fail = (kind) => {
    if (!on) return;
    end();
    d.onFail(kind);
  };

  const finish = () => {
    if (finishing) return;
    finishing = true;
    if (open) {
      flush();
      send(null, true);
    }
    clear("finish");
    timers.finish = d.later(deliver, open ? FINAL_WAIT : FINAL_WAIT + CONNECT_WAIT);
  };

  const onMsg = (m) => {
    if (!m || typeof m !== "object") return;
    const type = m.message_type;
    if (type === "partial_transcript") {
      partial = typeof m.text === "string" ? m.text : "";
      show();
      return;
    }
    if (type === "committed_transcript" || type === "committed_transcript_with_timestamps") {
      committed = joinText(committed, typeof m.text === "string" ? m.text : "");
      partial = "";
      show();
      if (finishing) deliver();
      return;
    }
    if (OK_TYPES.has(type)) return;
    // 别的都是毛病（通行证不认、额度、太挤……）：有字先把字交出去；别的毛病（一条连了太久之类）当断了，再连一回
    const kind = sttTrouble(m);
    if (kind === "soft") return;
    if (text()) {
      deliver();
      return;
    }
    if (kind === "net") {
      lost(gen);
      return;
    }
    fail(kind);
  };

  // 那边断了（或者连不上）：有字就交出去；没字再连一回；还不行就说听不了
  const lost = (my) => {
    if (my !== gen || !on) return;
    closeWs();
    if (text()) {
      deliver();
      return;
    }
    if (finishing) {
      reset();
    }
    if (!retried) {
      retried = true;
      connect();
      return;
    }
    fail("net");
  };

  const connect = () => {
    const my = gen;
    getToken().then(
      (tk) => {
        if (my !== gen || !on) {
          // 没用上：留着下回用
          if (tk && tk.token && !spare) spare = { tk, at: d.now() };
          return;
        }
        let w;
        try {
          w = d.socket(sttUrl(tk));
        } catch (e) {
          lost(my);
          return;
        }
        ws = w;
        open = false;
        prefetch();
        timers.connect = d.later(() => lost(my), CONNECT_WAIT);
        w.onopen = () => {
          if (my !== gen || ws !== w) return;
          open = true;
          clear("connect");
          flush();
          if (finishing) send(null, true);
        };
        w.onmessage = (ev) => {
          if (my !== gen || ws !== w) return;
          let m = null;
          try {
            m = JSON.parse(ev.data);
          } catch (e) {
            return;
          }
          onMsg(m);
        };
        w.onclose = () => {
          if (ws === w) lost(my);
        };
        w.onerror = () => {};
      },
      (e) => {
        if (my !== gen || !on) return;
        const code = e && e.code;
        fail(code === "key" || code === "setup" ? "key" : code === "quota" || code === "terms" ? code : "net");
      }
    );
  };

  const tick = () => {
    timers.tick = d.later(tick, TICK);
    if (!on || finishing) return;
    const has = !!text();
    if (!has && !voiced) return;
    const now = d.now();
    const talked = firstAt ? now - firstAt : 0;
    const need = (d.pauseMs || 1600) + (talked >= LONG_TALK ? LONG_EXTRA : 0);
    if (now - activityAt >= need || (has && now - textAt >= need + TEXT_GRACE)) finish();
  };

  // 麦克风来的一小段：在听才要；响的算她在出声；攒够一块送一块（没连上就先攒着）
  // 没在听的时候也留着最近一小段（PREROLL_MAX）：她打断他的时候，从她开口那会儿往前一点送过去，头几个字不丢（见 barge.js）
  let recent = [];
  let recentN = 0;
  d.mic.listen(({ pcm, rms }) => {
    if (!on) {
      recent.push(pcm);
      recentN += pcm.length;
      while (recent.length > 1 && recentN - recent[0].length >= PREROLL_MAX) recentN -= recent.shift().length;
      return;
    }
    if (rms >= LOUD) {
      activityAt = d.now();
      if (!firstAt) firstAt = activityAt;
      voiced = true;
    }
    pending.push(pcm);
    pendingN += pcm.length;
    if (pendingN < CHUNK) return;
    const block = joinPcm(pending, pendingN);
    pending = [];
    pendingN = 0;
    if (open) send(block);
    else if (queued + block.length <= QUEUE_MAX) {
      queue.push(block);
      queued += block.length;
    }
  });

  return {
    // preroll：从多少毫秒以前的声音开始送（她打断他的时候用：她开口那会儿还没在听）
    start({ preroll = 0 } = {}) {
      end();
      on = true;
      gen += 1;
      retried = false;
      reset();
      const want = Math.min(PREROLL_MAX, Math.round((Number(preroll) || 0) * 16));
      if (want > 0 && recentN) {
        let n = 0;
        const take = [];
        for (let i = recent.length - 1; i >= 0 && n < want; i--) {
          take.unshift(recent[i]);
          n += recent[i].length;
        }
        take.forEach((p) => {
          queue.push(p);
          queued += p.length;
        });
        // 她已经在说了：算响过、从那会儿算起说了多久
        voiced = true;
        firstAt = d.now() - Math.round(n / 16);
      }
      recent = [];
      recentN = 0;
      d.onText("");
      timers.tick = d.later(tick, TICK);
      connect();
    },
    stop() {
      end();
    },
    listening: () => on,
    heard: () => on && !!text(),
    // 先要一张通行证备着（接通的时候叫：他说“喂”的工夫里就准备好）
    warm: prefetch,
  };
}
