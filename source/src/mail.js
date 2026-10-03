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
const OFF_MS = 3 * 60 * 1000; // 新路不通以后，隔多久再试一回
const DEAD_MS = 25 * 1000; // 信箱里那一格这么久没人摸过，就当小后端那头断了（它每 8 秒摸一下）
const WAIT_MS = 260 * 1000; // 一回最多等这么久（切走又回来的，从回来那一刻重新算）
const BOX_MS = 8 * 1000; // 看一眼信箱最多等这么久，等不到算没看成（刚回来的那一下，请求有时会悬着不动）
const BACK_PAUSE = 500; // 刚回到眼前，歇这么久再敲网络的门（iOS 上一回来就发的请求会悬很久才报错）
const PATIENT_MS = 5 * 1000; // 刚回到眼前这么久之内没看成信箱：网络多半还没醒，不算数，多试几回
const YIELD_MS = 150; // 直接等的那头断了，先让一让再去看信箱：手机刚被叫醒的时候，“断了”可能比“回到眼前了”先到
const BLIND_MS = 30 * 1000; // 直接等着的时候信箱连着这么久都看不成：当成真没网，照实说
const QUICK_MS = 3 * 1000; // 她点重发的时候先同步看一眼别处回上了没有，最多等这么久
const TOKEN_MS = 4 * 1000; // 换登录凭证最多等这么久
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

// 拆条子。拆不开、不像条子、不是这一回的（条子里记着编号，别人把它挪到另一格上不认），回 null
export async function readNote(open, note, job) {
  try {
    const info = JSON.parse(await open(note));
    if (!info || info.v !== 1 || typeof info.chat !== "string" || typeof info.last !== "string" || typeof info.key !== "string") return null;
    if (info.job !== job) return null;
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
//   sinceBack()                      上一回回到眼前是多少毫秒以前（没切走过就是很大的数）
//   now() / sleep(ms)                几点了、等一会儿
//   storage { get(), set(text) }     记“发出去还没着落的那几回”的地方
//   hint { get(), set(bool) }        记“这台设备上知道新路是通的”的地方
//   probe()                          轻轻问一声新路通不通：true 通；false 不通（小后端还是旧的、信箱没建）；null 没问成
//   knock()                          回话到了要敲哪几台设备（门牌号）。眼下只有发话的这一台
//   freshToken(seconds)              登录凭证快到期就先换一张
//   answered(chat, last, fork, jobs) 别的设备是不是已经把这一句的回话取走、放进对话了（先同步再看）。jobs 是为这一句发出去过的编号
//   box.remove(job, onlyWorking)     删信箱里那一格；onlyWorking 为真：只在它还写着“在等”的时候删
export function createRelay(d) {
  const live = new Set(); // 这会儿有人守着的那几回：collect 不碰
  const beats = new Map(); // 编号 → { beat, at }：上回看到那一格被摸，是什么时候
  let offUntil = 0;
  let offWhy = "";
  let lastRun = null; // 上一回是怎么走的（通知面板的“看细节”里要说）

  // ---- 发出去还没着落的那几回（最多记八回，新的挤掉旧的） ----
  // 一回有了着落就划掉：回话落进对话了、小后端没接、信箱里没有它、它断了
  const pending = {
    all() {
      let list = [];
      try {
        list = JSON.parse(d.storage.get() || "[]");
      } catch (e) {}
      return (Array.isArray(list) ? list : []).filter((x) => x && typeof x.job === "string");
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
  const known = () => {
    try {
      return !!d.hint && !!d.hint.get();
    } catch (e) {
      return false;
    }
  };
  // 新路不通：接下来几分钟走老路，这台设备也不再当它是通的。过了这几分钟自己再轻轻问一声
  const turnOff = (why) => {
    offUntil = d.now() + OFF_MS;
    offWhy = why || "";
    remember(false);
    d.sleep(OFF_MS + 500).then(warm, () => {});
  };
  // 新路通不通，这台设备上知不知道。不知道就轻轻问一声（不拿整段对话去试：小后端还是旧的话，那一大包会白传一遍）。
  // 回 true 通；false 不通；null 没问成（没网）
  async function ready() {
    if (known()) return true;
    let ok = null;
    try {
      // 问一声也限时：悬着不应就当没问成，不能让她那句话卡在这儿
      ok = d.probe ? await timed(d.probe()) : true;
    } catch (e) {}
    if (ok === true) remember(true);
    return ok === true ? true : ok === false ? false : null;
  }
  // 开机的时候、停了几分钟以后：先把“通不通”问好，她头一句话发完就切走，也敢交出去
  function warm() {
    if (d.now() < offUntil) return Promise.resolve(false);
    return ready().then(
      (ok) => {
        // 问出来不通：记下，这几分钟不再问（不然每回切回来都白问一遍）
        if (ok === false) turnOff("小后端还接不了回话");
        return ok === true;
      },
      () => false
    );
  }
  // 这台设备上知道新路是通的、这会儿也没停着：她切走的那一下，可以放心把话交出去
  // （走老路的时候不能这么干：话一交出去她就走了，等着的这头断掉，那一回白问）
  const trusted = () => known() && d.now() >= offUntil;

  // 看信箱的每一下都限时：等不到算没看成
  const timed = (work, ms = BOX_MS) =>
    Promise.race([
      work,
      d.sleep(ms).then(() => {
        throw Object.assign(new Error("信箱没应"), { code: "timeout" });
      }),
    ]);
  const sinceBack = () => (d.sinceBack ? d.sinceBack() : Infinity);
  // 刚回到眼前：歇一下再敲网络的门
  const breath = async () => {
    const s = sinceBack();
    if (s >= 0 && s < BACK_PAUSE) await d.sleep(BACK_PAUSE - s);
  };

  // 信箱里“在等”的那一格还活着没有。不拿手机的钟和云端的钟比（手机的钟可能不准）：
  // 只看那一格上的时间变没变，变了就是还有人在摸；自己这边数着多久没变
  function alive(job, row) {
    const now = d.now();
    const seen = beats.get(job);
    if (!seen || seen.beat !== row.beat_at) {
      beats.set(job, { beat: row.beat_at, at: now });
      return true;
    }
    return now - seen.at < DEAD_MS;
  }

  // 收掉一回。stale：是因为它“写着在等、其实早断了”才收的。这种只在它还写着“在等”的时候删：
  // 看的那一眼和删的这一下之间，小后端要是正好把回话放进来了，就不能删（留着，下一遍看信箱再取）
  async function discard(job, stale) {
    pending.drop(job);
    beats.delete(job);
    try {
      await timed(d.box.remove(job, !!stale));
    } catch (e) {}
  }

  // 回话到手了（直接交来的，或者从信箱里取的；从信箱里取的带着那一格 row）
  function done(job, info, result, via, row) {
    beats.delete(job);
    lastRun = { path: "new", via, at: d.now() };
    remember(true);
    if (!resultOk(result)) {
      // 没回成：这一回到此为止。她在跟前就把信箱里那一格收掉；
      // 不在跟前先留着：小后端看它还在，会敲她一下说没送到
      pending.drop(job);
      if (d.visible()) timed(d.box.remove(job)).catch(() => {});
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
          await timed(d.box.remove(job));
        } catch (e) {}
      }
    };
    // at：小后端把回话放进信箱是几点（直接交来的没有，就是现在）
    const at = (row && Date.parse(row.done_at)) || 0;
    return { data: result.data, used: result.used || { cache: false, mcp: false }, job, info, via, at, settle };
  }

  // 守着信箱等一回。回话到了就交出来；信箱里没有这一回，回 ABSENT；断了、等太久，抛错
  async function watch(job, info) {
    let waited = 0; // 等了多久。手机被挂起的那一段不算：一圈最多算十一秒
    let lap = d.now();
    let misses = 0;
    let absent = 0;
    for (;;) {
      await breath();
      let row;
      try {
        row = await timed(d.box.get(job));
        misses = 0;
      } catch (e) {
        if (e && e.code === "notable") return ABSENT;
        misses++;
        // 没看成的这一刻，她刚回到眼前（或者页面还藏着）：网络多半还没醒，不算数，多试几回。
        // 平时一回没看成就是真没网，照实说，不让她对着“正在输入”干等
        // （这一回还记着：等会儿自己再看、她点重发，都先来信箱里找）
        const patient = !d.visible() || sinceBack() < PATIENT_MS + BOX_MS;
        if ((d.online && !d.online()) || misses >= (patient ? 4 : 1)) throw new Error("连不上开封府的后端，看看网络");
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
        info = await readNote(d.unseal, row.note, job);
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
        return done(job, info, result, "mailbox", row);
      }
      if (!alive(job, row)) {
        await discard(job, true);
        throw new Error("那边断了，这一条没回成");
      }
      const now = d.now();
      waited += Math.min(now - lap, BOX_MS + WATCH_EVERY + 1000);
      lap = now;
      if (waited > WAIT_MS) throw new Error("等了太久，没等到回话");
      await d.sleep(WATCH_EVERY);
    }
  }

  // 直接等小后端回话，同时留一只眼睛看信箱（切走又回来的时候、等得久了的时候）
  async function race(job, info, payload) {
    let started = d.now();
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const direct = d.callReply(payload, { signal: ctl ? ctl.signal : undefined }).then(
      (r) => ({ got: r.result }),
      (e) => ({ err: e })
    );
    let nudge = () => {};
    const off = d.onVisible(() => nudge("back"));
    try {
      let nextLook = LOOK_FIRST;
      let every = LOOK_EVERY;
      let blindSince = 0; // 信箱从几点起就一直看不成
      for (;;) {
        const waited = d.now() - started;
        const what = await Promise.race([
          direct,
          new Promise((resolve) => {
            nudge = resolve;
          }),
          d.sleep(Math.max(500, nextLook - waited)).then(() => "look"),
        ]);
        if (what && what.got) return done(job, info, what.got, "direct");
        if (what && what.err) return await afterFailure(job, info, what.err);
        if (what === "back") {
          // 切走又回来过：直接等的那一头多半已经断了、只是还没报出来。往后勤看信箱，回话一放进来就取。
          // 手机被挂起的那段不算在“等了多久”里：从回来这一刻重新算
          every = WATCH_EVERY;
          started = d.now();
          blindSince = 0;
        }
        await breath();
        let row = null;
        let seen = true;
        try {
          row = await timed(d.box.get(job));
          blindSince = 0;
        } catch (e) {
          seen = false; // 刚回来网络还没醒：过一秒再看
          if (!blindSince) blindSince = d.now();
        }
        if (row && row.state === "done") {
          const result = await openSealed(info.key, row.sealed);
          if (ctl) ctl.abort();
          return done(job, info, result, "mailbox", row);
        }
        if (row && row.state === "working" && !alive(job, row)) {
          if (ctl) ctl.abort();
          await discard(job, true);
          throw new Error("那边断了，这一条没回成");
        }
        // 信箱连着半分钟都看不成，直接等的那头也一直没动静：多半是真没网了，照实说，不让她对着“正在输入”干等。
        // 这一回还记着：等会儿自己再看、她点重发，都先去信箱里找，不重发
        if (!seen && d.now() - blindSince > BLIND_MS) {
          if (ctl) ctl.abort();
          throw new Error("连不上开封府的后端，看看网络");
        }
        // 这一眼看成了才算数：没看成的时候不知道回话到没到，不能说等太久
        if (seen && d.now() - started > WAIT_MS) {
          if (ctl) ctl.abort();
          throw new Error("等了太久，没等到回话");
        }
        nextLook = d.now() - started + (seen ? every : 1000);
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
      // 小后端没接：这一回根本没开始办。走回老路；接下来几分钟也不用再试新路
      pending.drop(job);
      turnOff(e.message);
      throw useOld(e.message);
    }
    // 没连上、连到一半断了、小后端那头崩了：办没办不知道，去信箱里看。
    // 先让一让：手机刚被叫醒的时候，“断了”可能比“回到眼前了”先到，让那一头先记下是几点回来的（见 breath）
    await d.sleep(YIELD_MS);
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

  // tried：为这句话发出去过的编号，发一回往里记一个
  async function once({ body, beta, chat, last, fork, title, extra }, tried) {
    try {
      await Promise.race([d.freshToken(TOKEN_SECONDS), d.sleep(TOKEN_MS)]);
    } catch (e) {}
    const job = newJob();
    tried.push(job);
    const key = bytesToB64u(newKey());
    const info = { v: 1, job, chat, last, key, at: d.now() };
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
      // knock：回话到了敲哪几台设备。只敲这台设备自己说的那几台，登记簿里别的行不敲：
      // 登记簿是明文的，偷到登录密码（没有暗号）的人能往里添一行；要是照登记簿全敲，他就能收到横幅上的话
      let knock = [];
      try {
        knock = (d.knock ? d.knock() : []) || [];
      } catch (e) {}
      return await race(job, info, { op: "reply", job, key, note, tag, title: title || "", beta: beta || "", knock, request: body });
    } finally {
      live.delete(job);
    }
  }

  // 这一句是不是已经在别处回上了（别的设备把信取走、放进对话了）。
  // jobs：为这一句发出去过的那几回的编号（对话里有其中哪一回的回话，就算回上了；重新回答只能靠这个认）
  const gone = async (a, jobs, ms) => {
    try {
      return d.answered ? !!(await timed(d.answered(a.chat, a.last, a.fork || "", jobs || []), ms)) : false;
    } catch (e) {
      return false;
    }
  };

  // 守着一回已经发出去的（上次打开时发的、collect 在信箱里看到的）
  async function resume(job, info) {
    live.add(job);
    try {
      const got = await watch(job, info || null);
      if (got !== ABSENT) return got;
      // 信箱里没有这一回了。多半是别的设备（发话的那台）把信取走了：等它把对话传上来，同步下来看
      if (info) {
        for (let i = 0; i < 4; i++) {
          if (await gone(info, [job])) throw answered();
          if (i < 3) await d.sleep(2000);
        }
      }
      throw new Error("那边断了，这一条没回成");
    } finally {
      live.delete(job);
    }
  }

  // 要一条回话（args.recheck：是她点“重发”要的）。成了回 { data, used, job, info, via, settle }：
  //   data 是 Anthropic 回的那一整段；used 是最后用的哪种写法（带没带缓存、带没带工具）；
  //   settle() 等回话落进对话、存好以后叫。
  // 抛的错：code 是 oldpath：新路不通，请走老路；code 是 answered：别的设备已经把回话放进对话了；
  //   别的：message 就是给她看的话
  async function ask(args) {
    // 为同一句话发出去的上一回还没着落：先去信箱里看，不重发（重发就是花两回钱、回两遍）。
    // 这一步在最前头：新路这会儿停着也要先找回那一回，不然走老路又问一遍
    const tried = [];
    const had = pending.find(args.chat, args.last, args.fork);
    if (had) {
      tried.push(had.job);
      live.add(had.job);
      let got;
      try {
        got = await watch(had.job, null);
      } finally {
        live.delete(had.job);
      }
      if (got !== ABSENT) return got;
      pending.drop(had.job);
      if (await gone(args, tried)) throw answered();
    } else if (args.recheck && (await gone(args, tried, QUICK_MS))) {
      // 她点的是“重发”，这台设备又不记得为这句话发过哪一回（多半是别的设备发的）：
      // 先同步看一眼，别处已经回上了就不发
      throw answered();
    }
    if (d.now() < offUntil) throw useOld(offWhy);
    const ok = await ready();
    if (ok === false) {
      turnOff("小后端还接不了回话");
      throw useOld("小后端还接不了回话");
    }
    if (ok === null) throw useOld("没问成新路通不通");
    for (let round = 0; round < 2; round++) {
      const got = await once(args, tried);
      if (got !== AGAIN) return got;
      if (await gone(args, tried)) throw answered();
    }
    // 两回都没送到小后端，信箱却看得到（看得到才知道里面没有这一回）：不是没网，是小后端那条路不通
    // （比如 Supabase 里根本没有 push 这个函数，浏览器只会说“没连上”）。这两回都没开始办，走回老路
    turnOff("小后端连不上");
    throw useOld("小后端连不上");
  }

  // 看一遍信箱（不动它）。没看成（没网、信箱没应）回 null，外头过一会儿再来；还没有这张表就回空的（没什么可取的）。
  // 回 [{ job, row, info, state, result }]，state：
  //   done 回话在里面（result 是打开以后的）；working 还在等；dead 写着在等，其实早断了；unreadable 条子或回话打不开
  // 有人守着的那几回不在里面
  async function collect() {
    let rows;
    try {
      await breath();
      rows = await timed(d.box.list());
    } catch (e) {
      return e && e.code === "notable" ? [] : null;
    }
    const out = [];
    for (const row of rows) {
      if (live.has(row.job)) continue;
      const info = await readNote(d.unseal, row.note, row.job);
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
    warm,
    // 外头确实看到新路是通的（通知面板刚查过）：记下来，停着的也解开
    learn: (works) => {
      if (!works) return;
      remember(true);
      offUntil = 0;
      offWhy = "";
    },
    isLive: (job) => live.has(job),
    status: () => ({ off: d.now() < offUntil, why: offWhy, last: lastRun }),
  };
}
