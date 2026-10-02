// =====================================================
// 信箱：替她等回话的那条新路，手机这一头。
//
// 老路（claude 函数）：网页自己等着那边的我回完。她一切走、一锁屏，等着的这头就断了，回话丢在半路。
// 新路（push 函数的 op: "reply"）：把话交给小后端去等。
//   她在跟前：回话照旧直接交到手上，和老路一样快。
//   她切走了：小后端把回话封好放进信箱（mailbox 表），再敲她的手机；她回来，这里从信箱里取出来。
//   新路不通（信箱那张表没建、push 函数还是旧的）：自己走回老路，聊天不会断。
//
// 信箱里的每一格有两样封着的东西，云端都看不懂：
//   note    手机自己封的条子（用存档的钥匙）：哪段对话、接在哪句后面、开这封信的一次性钥匙
//   sealed  小后端封的回话（用那把一次性钥匙；它用完就丢，钥匙只留在条子里）
//
// 这里只管“一回传话”怎么走完，不认识对话长什么样：往对话里放、存、显示，都在 App.jsx。
// 用到的浏览器和云端的东西都从外面递进来（createRelay 的参数），测试里换成假的。
// =====================================================
import { unseal } from "./vault.js";
import { explainError } from "./errors.js";
import { bytesToB64u, b64uToBytes } from "./notify.js";

// 记在这台设备上（localStorage，不跟云端走）
export const JOBS_KEY = "kfs-jobs"; // 发出去还没着落的那几回
export const RELAY_KEY = "kfs-relay"; // 写着 "ok"：这台设备上，新路走通过

const TOKEN_SECONDS = 240; // 登录凭证至少还得能用这么多秒，小后端要拿着它等上两分多钟
const PENDING_MS = 10 * 60 * 1000; // “发出去还没着落”最多记多久
const OFF_MS = 3 * 60 * 1000; // 新路不通以后，隔多久再试一回
const DEAD_MS = 25 * 1000; // 信箱里那一格这么久没人摸过，就当小后端那头断了（它每 8 秒摸一下）
const OLD_MS = 15 * 60 * 1000; // 头一回看到就已经放了这么久还写着“在等”：不用等了
const WAIT_MS = 260 * 1000; // 一回最多等这么久
const WATCH_EVERY = 2000; // 守着信箱等的时候，隔多久看一眼
const LOOK_FIRST = 45 * 1000; // 直接等着的时候，等了这么久还没回话，也去信箱里看一眼
const LOOK_EVERY = 15 * 1000; // 之后隔这么久再看

const ABSENT = Symbol("absent"); // 信箱里没有这一回
const AGAIN = Symbol("again"); // 这一回没发成，可以原样再发一回

// ---------- 小零件 ----------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// 一回传话的编号：二十个随机的字母数字
export function newJob() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

// 封回话用的一次性钥匙
export function newKey() {
  return crypto.getRandomValues(new Uint8Array(32));
}

// 拆条子。拆不开、不像条子，回 null
export async function readNote(open, note) {
  try {
    const info = JSON.parse(await open(note));
    if (!info || info.v !== 1 || typeof info.chat !== "string" || typeof info.last !== "string" || typeof info.key !== "string") return null;
    return info;
  } catch (e) {
    return null;
  }
}

// 拿条子里那把一次性钥匙把回话打开
export async function openSealed(keyText, sealed) {
  const bytes = b64uToBytes(keyText);
  if (!bytes || bytes.length !== 32) throw new Error("钥匙不对");
  const aes = await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const result = JSON.parse(await unseal({ aes }, sealed));
  if (!result || typeof result !== "object") throw new Error("不像回话");
  return result;
}

// 这一回回成了没有
export function resultOk(result) {
  const d = result && result.data;
  return !!result && result.status >= 200 && result.status < 300 && !!d && typeof d === "object" && d.type !== "error" && !d.error;
}

// 没回成的话，说成人话（和老路上的说法一样）
export function explainResult(result) {
  const d = (result && result.data) || null;
  const status = (result && result.status) || 0;
  if (d && d.error) return explainError(status, d.error);
  return (d && (d.message || d.msg)) || `出错了（${status}）`;
}

// 回话的通知带的记号：r.<对话的记号>.<编号>。不是这种就回 null
export function parseReplyMark(mark) {
  const m = /^r\.([A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{8,64})$/.exec(String(mark || ""));
  return m ? { tag: m[1], job: m[2] } : null;
}

// 通知的网址里用来认对话的那串字：把对话的编号打乱，云端和推送服务都看不出是哪一段
export async function chatTag(nameFor, chatId) {
  return String(await nameFor("notice:" + chatId)).replace(/^h_/, "");
}

const useOld = (why) => Object.assign(new Error(why || "走老路"), { code: "oldpath" });
const answered = () => Object.assign(new Error("别处已经回上了"), { code: "answered" });

// ---------- 一回传话 ----------
//
// d（从外面递进来的）：
//   callReply(payload, { signal })   把话交给 push 函数（cloud.js）
//   box { list, get, remove }        信箱（cloud.js 的 mailbox）
//   seal / unseal / nameFor          借存档的钥匙：封条子、拆条子、把名字打乱（store.js）
//   visible()                        开封府这会儿是不是开在眼前
//   online()                         手机这会儿有没有网（浏览器自己说的；没有这个就当有）
//   onVisible(fn)                    切走又回来的时候叫 fn；返回一个“不用叫了”的函数
//   now() / sleep(ms)                几点了、等一会儿
//   storage { get(), set(text) }     记“发出去还没着落的那几回”的地方
//   hint { get(), set(bool) }        记“这台设备上新路走通过”的地方
//   freshToken(seconds)              登录凭证快到期就先换一张
//   answered(chat, last, fork)       别的设备是不是已经把这一句的回话取走、放进对话了（先同步再看）
export function createRelay(d) {
  const live = new Set(); // 这会儿有人守着的那几回：collect 不碰
  const beats = new Map(); // 编号 → { beat, at }：上回看到那一格被摸，是什么时候
  let offUntil = 0;
  let offWhy = "";
  let lastRun = null; // 上一回是怎么走的（通知面板的“看细节”里要说）

  // ---- 发出去还没着落的那几回 ----
  const pending = {
    all() {
      let list = [];
      try {
        list = JSON.parse(d.storage.get() || "[]");
      } catch (e) {}
      const now = d.now();
      return (Array.isArray(list) ? list : []).filter((x) => x && typeof x.job === "string" && now - (x.at || 0) < PENDING_MS);
    },
    save(list) {
      try {
        d.storage.set(list.length ? JSON.stringify(list.slice(-8)) : "");
      } catch (e) {}
    },
    add(rec) {
      this.save(this.all().filter((x) => x.job !== rec.job).concat([rec]));
    },
    drop(job) {
      const list = this.all();
      if (list.some((x) => x.job === job)) this.save(list.filter((x) => x.job !== job));
    },
    find(chat, last, fork) {
      return this.all().find((x) => x.chat === chat && x.last === last && (x.fork || "") === (fork || "")) || null;
    },
  };

  const remember = (works) => {
    try {
      if (d.hint) d.hint.set(works);
    } catch (e) {}
  };
  const turnOff = (why) => {
    offUntil = d.now() + OFF_MS;
    offWhy = why || "";
    remember(false);
  };
  // 新路在这台设备上走通过、这会儿也没停着：她切走的那一下，可以放心把话交出去
  // （走老路的时候不能这么干：话一交出去她就走了，等着的这头断掉，那一回白问）
  const trusted = () => {
    try {
      return !!d.hint && !!d.hint.get() && d.now() >= offUntil;
    } catch (e) {
      return false;
    }
  };

  // 信箱里“在等”的那一格还活着没有。不拿手机的钟和云端的钟比（手机的钟可能不准）：
  // 只看那一格上的时间变没变，变了就是还有人在摸；自己这边数着多久没变
  function alive(job, row) {
    const now = d.now();
    const seen = beats.get(job);
    if (!seen) {
      beats.set(job, { beat: row.beat_at, at: now });
      const born = Date.parse(row.created_at);
      return !(born && now - born > OLD_MS);
    }
    if (seen.beat !== row.beat_at) {
      beats.set(job, { beat: row.beat_at, at: now });
      return true;
    }
    return now - seen.at < DEAD_MS;
  }

  async function discard(job) {
    pending.drop(job);
    beats.delete(job);
    try {
      await d.box.remove(job);
    } catch (e) {}
  }

  // 回话到手了（直接交来的，或者从信箱里取的）
  function done(job, info, result, via) {
    beats.delete(job);
    lastRun = { path: "new", via, at: d.now() };
    remember(true);
    if (!resultOk(result)) {
      // 没回成：这一回到此为止。她在跟前就把信箱里那一格收掉；
      // 不在跟前先留着：小后端看它还在，会敲她一下说没送到
      pending.drop(job);
      if (d.visible()) d.box.remove(job).catch(() => {});
      throw new Error(explainResult(result));
    }
    let settled = false;
    // 回话落进对话、存好以后叫这个
    const settle = async () => {
      if (settled) return;
      settled = true;
      pending.drop(job);
      // 她在跟前：信箱里那一格收掉，小后端看它没了，就不敲手机。
      // 不在跟前：留着让小后端敲她；等她回来，collect 看到这一回已经在对话里，再收
      if (d.visible()) {
        try {
          await d.box.remove(job);
        } catch (e) {}
      }
    };
    return { data: result.data, used: result.used || { cache: false, mcp: false }, job, info, via, settle };
  }

  // 守着信箱等一回。回话到了就交出来；信箱里没有这一回，回 ABSENT；断了、等太久，抛错
  async function watch(job, info) {
    const started = d.now();
    let misses = 0;
    let absent = 0;
    for (;;) {
      let row;
      try {
        row = await d.box.get(job);
        misses = 0;
      } catch (e) {
        if (e && e.code === "notable") return ABSENT;
        // 手机自己说没网：不用试了。有网却没连上（刚解锁、刚切回来，网络还没醒）：多试几回
        if ((d.online && !d.online()) || ++misses >= 4) throw new Error("连不上开封府的后端，看看网络");
        await d.sleep(800 * misses);
        continue;
      }
      if (!row) {
        // 刚断的那一下，小后端可能正要开那一格：稍等再看一眼，还没有才算没有
        if (absent++ === 0) {
          await d.sleep(1500);
          continue;
        }
        beats.delete(job);
        return ABSENT;
      }
      if (!info) {
        info = await readNote(d.unseal, row.note);
        if (!info) {
          await discard(job);
          throw new Error("信箱里那一格读不出来");
        }
      }
      if (row.state === "done") {
        let result;
        try {
          result = await openSealed(info.key, row.sealed);
        } catch (e) {
          await discard(job);
          throw new Error("信箱里的回话打不开");
        }
        return done(job, info, result, "mailbox");
      }
      if (!alive(job, row)) {
        await discard(job);
        throw new Error("那边断了，这一条没回成");
      }
      if (d.now() - started > WAIT_MS) throw new Error("等了太久，没等到回话");
      await d.sleep(WATCH_EVERY);
    }
  }

  // 直接等小后端回话，同时留一只眼睛看信箱（切走又回来的时候、等得久了的时候）
  async function race(job, info, payload) {
    const started = d.now();
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const direct = d.callReply(payload, { signal: ctl ? ctl.signal : undefined }).then(
      (r) => ({ got: r.result }),
      (e) => ({ err: e })
    );
    let nudge = () => {};
    const off = d.onVisible(() => nudge("back"));
    try {
      let nextLook = LOOK_FIRST;
      for (;;) {
        const waited = d.now() - started;
        const what = await Promise.race([
          direct,
          new Promise((resolve) => {
            nudge = resolve;
          }),
          d.sleep(Math.max(1000, nextLook - waited)).then(() => "look"),
        ]);
        if (what && what.got) return done(job, info, what.got, "direct");
        if (what && what.err) return await afterFailure(job, info, what.err);
        if (what === "look") nextLook = d.now() - started + LOOK_EVERY;
        let row = null;
        try {
          row = await d.box.get(job);
        } catch (e) {}
        if (row && row.state === "done") {
          const result = await openSealed(info.key, row.sealed);
          if (ctl) ctl.abort();
          return done(job, info, result, "mailbox");
        }
        if (row && row.state === "working" && !alive(job, row)) {
          if (ctl) ctl.abort();
          await discard(job);
          throw new Error("那边断了，这一条没回成");
        }
        if (d.now() - started > WAIT_MS) {
          if (ctl) ctl.abort();
          throw new Error("等了太久，没等到回话");
        }
      }
    } finally {
      off();
    }
  }

  // 直接等的那一头出了岔子
  async function afterFailure(job, info, e) {
    if (e.code === "auth") {
      pending.drop(job);
      throw new Error(e.message);
    }
    if (e.code === "refused" && e.reason !== "duplicate") {
      // 小后端没接：这一回根本没开始办。走回老路；一时半会儿也不用再试新路
      pending.drop(job);
      turnOff(e.message);
      throw useOld(e.message);
    }
    // 没连上、连到一半断了、小后端那头崩了：办没办不知道，去信箱里看
    const got = await watch(job, info);
    if (got !== ABSENT) return got;
    pending.drop(job);
    if (e.code === "gateway") {
      // 小后端回了一句读不懂的，信箱里又没有这一回：它根本没办起来。走回老路
      turnOff(e.message);
      throw useOld(e.message);
    }
    return AGAIN;
  }

  async function once({ body, beta, chat, last, fork, title, extra }) {
    try {
      await d.freshToken(TOKEN_SECONDS);
    } catch (e) {}
    const job = newJob();
    const key = bytesToB64u(newKey());
    const info = { v: 1, chat, last, key, at: d.now() };
    if (fork) info.fork = fork;
    if (extra) info.extra = extra;
    let note = "";
    let tag = "";
    try {
      note = await d.seal(JSON.stringify(info));
      tag = await chatTag(d.nameFor, chat);
    } catch (e) {}
    if (!note || note.length > 4000 || !tag) throw useOld("条子封不上");
    pending.add({ job, chat, last, fork: fork || "", at: d.now() });
    live.add(job);
    try {
      return await race(job, info, { op: "reply", job, key, note, tag, title: title || "", beta: beta || "", request: body });
    } finally {
      live.delete(job);
    }
  }

  const gone = async (a) => {
    try {
      return d.answered ? !!(await d.answered(a.chat, a.last, a.fork || "")) : false;
    } catch (e) {
      return false;
    }
  };

  // 守着一回已经发出去的（上次打开时发的、collect 在信箱里看到的）
  async function resume(job, info) {
    live.add(job);
    try {
      const got = await watch(job, info || null);
      if (got === ABSENT) throw new Error("那边断了，这一条没回成");
      return got;
    } finally {
      live.delete(job);
    }
  }

  // 要一条回话。成了回 { data, used, job, info, via, settle }：
  //   data 是 Anthropic 回的那一整段；used 是最后用的哪种写法（带没带缓存、带没带工具）；
  //   settle() 等回话落进对话、存好以后叫。
  // 抛的错：code 是 oldpath：新路不通，请走老路；code 是 answered：别的设备已经把回话放进对话了；
  //   别的：message 就是给她看的话
  async function ask(args) {
    if (d.now() < offUntil) throw useOld(offWhy);
    // 为同一句话发出去的上一回还没着落：先去信箱里看，不重发（重发就是花两回钱、回两遍）
    const had = pending.find(args.chat, args.last, args.fork);
    if (had) {
      live.add(had.job);
      let got;
      try {
        got = await watch(had.job, null);
      } finally {
        live.delete(had.job);
      }
      if (got !== ABSENT) return got;
      pending.drop(had.job);
      if (await gone(args)) throw answered();
    }
    for (let round = 0; round < 2; round++) {
      const got = await once(args);
      if (got !== AGAIN) return got;
      if (await gone(args)) throw answered();
    }
    // 两回都没送到小后端，信箱却看得到（看得到才知道里面没有这一回）：不是没网，是小后端那条路不通
    // （比如 Supabase 里根本没有 push 这个函数，浏览器只会说“没连上”）。这两回都没开始办，走回老路
    turnOff("小后端连不上");
    throw useOld("小后端连不上");
  }

  // 看一遍信箱（不动它）。看不了（没网、没这张表）回 null。
  // 回 [{ job, row, info, state, result }]，state：
  //   done 回话在里面（result 是打开以后的）；working 还在等；dead 写着在等，其实早断了；unreadable 条子或回话打不开
  // 有人守着的那几回不在里面
  async function collect() {
    let rows;
    try {
      rows = await d.box.list();
    } catch (e) {
      return null;
    }
    const out = [];
    for (const row of rows) {
      if (live.has(row.job)) continue;
      const info = await readNote(d.unseal, row.note);
      if (!info) {
        out.push({ job: row.job, row, info: null, state: "unreadable" });
        continue;
      }
      if (row.state === "done") {
        let result = null;
        try {
          result = await openSealed(info.key, row.sealed);
        } catch (e) {}
        out.push(result ? { job: row.job, row, info, state: "done", result } : { job: row.job, row, info, state: "unreadable" });
        continue;
      }
      out.push({ job: row.job, row, info, state: alive(row.job, row) ? "working" : "dead" });
    }
    return out;
  }

  // 走老路回成了一条：记一笔（“看细节”里要说）
  function tookOld(why) {
    lastRun = { path: "old", why: why || offWhy || "", at: d.now() };
  }

  return {
    ask,
    resume,
    collect,
    discard,
    tookOld,
    trusted,
    isLive: (job) => live.has(job),
    status: () => ({ off: d.now() < offUntil, why: offWhy, last: lastRun }),
  };
}
