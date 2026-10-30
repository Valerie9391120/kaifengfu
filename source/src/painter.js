// =====================================================
// 画画的活（他画画，零件见 draw.js）：哪几张要画、正在画哪一张、问画好没有、画好了存起来、没画成记下缘故。
// 不碰页面：用到的浏览器和云端的东西从外头递进来（App.jsx 的 getPainter），测试在 Node 里跑（tests/draw_parts.test.mjs）。
//
// 规矩（卿卿 10 月 30 日定的“他想画就画”，细处是我定的、跟她说过的）：
//   回话放进这台设备上的对话的那一下，里头的画记下来要画（want）；
//   她在眼前才动手：不在眼前的时候不开画、不问，回到眼前接着来（跟语音条一样，切走了网多半是断的）；
//   一张一张来。开画之前先在存档里记一笔“正在开画”（kfs2:drawjob:<那一张>），开画成了记下 ElevenLabs 那头的画布和会话：
//     换一台设备、开封府被系统收掉重开，都接着问“画好没有”，不再开画（开画一回扣一回额度）；
//   问“画好没有”不花钱：没连上、太挤、一时出岔子的，歇一会儿接着问；
//   画好了：图缩成跟照片一样大，存成 kfs2:img:<drawImgOf(那一张)>（加密了跟着云端走），画到一半的那一笔删掉；
//   没画成（ElevenLabs 不肯画、画失败了、额度不够、今天画够数了）：缘故记进存档那一笔（别的设备也看得见），
//     气泡上写着缘故和“点这里重画”（again），不自己一遍一遍画；
//   ElevenLabs 的登录过期了：画到一半的那一笔留着，她重新连上以后点“点这里接着画”，接着问，不重画。
//
// 每一张的样子（states 里的，也是交给画面的）：
//   load  正从存档里取
//   wait  记下要画了，还没轮到（或者她不在眼前，等她回来）
//   busy  正在画：{ t0（几点开画的） }
//   ready 画好了（图在存档里，画面照 imgs 摆）
//   fail  没画成：{ why（缘故）, link（要重新连 ElevenLabs）, resume（画到一半，接着问就行，不重画） }
//   none  存档里没有，也没人要画（别的设备的回话还没同步来；她没开“他能画画”时他画的；她关了开关时还没开画的）
// =====================================================
import { DRAW_JOB_KEY, drawImgOf, readJob, packJob, readWants, addWants, dropWants } from "./draw.js";

export const IMG_KEY = "kfs2:img:";
export const POLL_MIN = 3000; // 问“画好没有”最少隔这么久
export const POLL_MAX = 15000;
export const RETRY_MS = 5000; // 没连上、太挤：歇这么久再问
export const RETRY_MAX = 8; // 连着这么多回没问成：不问了，记成没画成（画到一半的那一笔留着，她点了接着问）
export const STARTING_MS = 2 * 60 * 1000; // 别的设备记了“正在开画”：这么久以内等它，过了当它没开成
export const TOO_LONG = 12 * 60 * 1000; // 开画以后这么久还没画好：不等了

const LINK_CODES = new Set(["auth", "unlinked"]);
const LATER_CODES = new Set(["down", "busy", "unreachable", "slow"]);

// call(op, body)：敲 draw 函数（见 cloud.js 的 callDraw），回它的话；出了岔子抛带 code 的错
// store：{ get, set, del }（存档）；visible()：她在不在眼前；wants：{ get, set }（这台设备上记的那一串）；
// alive(w)：那一张画在哪儿——"shown" 在眼前，"kept" 在翻过去的版本里，"" 没了（见 draw.js 的 drawWhere）；
// shrink(got)：画好的那一张（{ data, mime }）缩成存的样子（data URL）；device：这台设备的编号；
// onChange(key, state)：哪一张变了样子（state 是 null：不认这一张了）；onImage(imgId, data)：画好的图存下了
export function createPainter({ call, store, visible, wants, alive, now, sleep, shrink, device = "", onChange, onImage = () => {} }) {
  const states = new Map();
  let list = readWants(wants.get(), now());
  let running = false;
  let rerun = false;
  let current = "";

  const saveWants = () => wants.set(list.length ? JSON.stringify(list) : "");
  saveWants(); // 读的时候不认的（太老的、钟点不对的）当场从设备上清掉
  const set = (key, st) => {
    states.set(key, st);
    onChange(key, st);
  };
  const clear = (key) => {
    if (!states.has(key)) return;
    states.delete(key);
    onChange(key, null);
  };
  const forget = (key) => {
    list = dropWants(list, [key]);
    saveWants();
  };
  const wanted = (key) => list.some((w) => w.k === key);
  const get = async (k) => {
    try {
      return await store.get(k);
    } catch (e) {
      return null;
    }
  };
  const hasImg = async (key) => !!(await get(IMG_KEY + drawImgOf(key)));
  const jobOf = async (key) => readJob(await get(DRAW_JOB_KEY + key));
  const where = async (w) => {
    try {
      return (await alive(w)) || "";
    } catch (e) {
      return "";
    }
  };
  const why = (e) => String((e && e.message) || "没画成").slice(0, 90);

  // 存档里是什么样子：画好了、没画成、画到一半
  async function fromStore(key) {
    if (await hasImg(key)) return { s: "ready" };
    const job = await jobOf(key);
    if (job && job.state === "failed") return { s: "fail", why: job.why };
    if (job && (job.state === "running" || job.state === "starting")) return { s: "busy", t0: job.at || now(), job: true };
    return null;
  }

  // 画面上冒出一张画：看看它是什么样子。画到一半（别的设备开的画、上回没问完的）：记下来接着问（问不花钱）
  async function look(key, chat = "", prompt = "", ratio = "") {
    if (states.has(key)) return;
    set(key, { s: "load" });
    const got = await fromStore(key);
    const st = states.get(key);
    if (!st || st.s !== "load") return; // 取的工夫里被划掉、被要画了
    if (got && got.s === "busy") {
      if (prompt && !wanted(key)) {
        list = addWants(list, [{ k: key, p: prompt, r: ratio, c: chat, at: now() }]);
        saveWants();
      }
      set(key, { s: "busy", t0: got.t0 });
      kick();
      return;
    }
    if (got) {
      set(key, got);
      if (wanted(key)) forget(key);
      return;
    }
    set(key, wanted(key) ? { s: "wait" } : { s: "none" });
  }

  // 要画这几张：items 是 [{ key, prompt, ratio }]，chat 是哪段对话
  function want(chat, items) {
    const adds = [];
    for (const it of items || []) {
      const st = states.get(it.key);
      if (st && (st.s === "ready" || st.s === "busy")) continue;
      adds.push({ k: it.key, p: it.prompt, r: it.ratio || "", c: chat, at: now() });
      set(it.key, { s: "wait" });
    }
    if (!adds.length) return;
    list = addWants(list, adds);
    saveWants();
    kick();
  }

  // 她点了“点这里重画”（没画成的、没人画的）、“点这里接着画”（登录过期了、画到一半的）
  async function again(chat, key, prompt, ratio = "") {
    const st = states.get(key);
    if (st && (st.s === "busy" || st.s === "wait" || st.s === "ready" || st.s === "load")) return;
    const job = await jobOf(key);
    // 没画成记在存档里的那一笔：划掉，重画。画到一半的那一笔留着：接着问
    if (job && job.state === "failed") await store.del(DRAW_JOB_KEY + key);
    states.delete(key);
    want(chat, [{ key, prompt, ratio }]);
  }

  // 这几张不要了（掐断了、对话删了）：不画了；画好存着的、画到一半的那一笔删掉
  async function drop(keys) {
    if (!keys.length) return;
    list = dropWants(list, keys);
    saveWants();
    for (const k of keys) {
      clear(k);
      try {
        if ((await store.get(IMG_KEY + drawImgOf(k))) != null) await store.del(IMG_KEY + drawImgOf(k));
        if ((await store.get(DRAW_JOB_KEY + k)) != null) await store.del(DRAW_JOB_KEY + k);
      } catch (e) {}
    }
  }
  function dropChat(chat) {
    return drop(list.filter((w) => w.c === chat).map((w) => w.k));
  }

  // 她关了“他能画画”：还没开画的都不画了（气泡上是“这张画还没画，点这里画出来”）。已经开画的接着问完（钱已经花了）
  async function halt() {
    const keep = [];
    for (const w of list) {
      const job = await jobOf(w.k);
      if (job && (job.state === "running" || job.state === "starting")) keep.push(w);
      else {
        const st = states.get(w.k);
        if (st && st.s === "wait") set(w.k, { s: "none" });
      }
    }
    list = keep;
    saveWants();
  }

  // 别的设备画好的、没画成的、开了画的同步下来了（keys 是存档里的名字，带着前缀）
  async function synced(keys) {
    for (const full of keys) {
      let key = "";
      if (full.startsWith(IMG_KEY + "draw.")) key = full.slice((IMG_KEY + "draw.").length);
      else if (full.startsWith(DRAW_JOB_KEY)) key = full.slice(DRAW_JOB_KEY.length);
      if (!key || (!states.has(key) && !wanted(key)) || current === key) continue;
      const got = await fromStore(key);
      if (!got) continue;
      if (got.s === "busy") {
        if (!wanted(key)) continue;
        set(key, { s: "busy", t0: got.t0 });
        kick();
        continue;
      }
      if (wanted(key)) forget(key);
      set(key, got);
    }
  }

  // 问到画好（或者没画成）为止。回 true 是这一张了结了（画好了、没画成）；false 是她走开了、先停下
  async function follow(w, job) {
    set(w.k, { s: "busy", t0: job.at || now() });
    let misses = 0;
    for (;;) {
      if (!visible()) {
        set(w.k, { s: "busy", t0: job.at || now() });
        return false;
      }
      if (now() - (job.at || now()) > TOO_LONG) {
        await store.set(DRAW_JOB_KEY + w.k, packJob({ state: "failed", why: "画了太久没画好", at: now() }));
        forget(w.k);
        set(w.k, { s: "fail", why: "画了太久没画好" });
        return true;
      }
      let r = null;
      try {
        r = await call("check", { job: { flow: job.flow, node: job.node, sessions: job.sessions } });
        misses = 0;
      } catch (e) {
        if (LINK_CODES.has(e && e.code)) {
          forget(w.k);
          set(w.k, { s: "fail", why: why(e), link: true, resume: true });
          return true;
        }
        if (LATER_CODES.has(e && e.code) && ++misses <= RETRY_MAX) {
          await sleep(RETRY_MS);
          continue;
        }
        forget(w.k);
        set(w.k, { s: "fail", why: why(e), resume: true });
        return true;
      }
      if (r && r.type === "pending") {
        await sleep(Math.max(POLL_MIN, Math.min(POLL_MAX, (Number(r.after) || 4) * 1000)));
        continue;
      }
      if (r && r.type === "failed") {
        const said = String(r.why || "没画成").slice(0, 120);
        await store.set(DRAW_JOB_KEY + w.k, packJob({ state: "failed", why: said, at: now() }));
        forget(w.k);
        set(w.k, { s: "fail", why: said });
        return true;
      }
      if (r && r.type === "image" && r.data) {
        let data = "";
        try {
          data = await shrink(r);
        } catch (e) {
          data = "";
        }
        if (!data) data = `data:${r.mime || "image/png"};base64,${r.data}`;
        const imgId = drawImgOf(w.k);
        await store.set(IMG_KEY + imgId, data);
        try {
          await store.del(DRAW_JOB_KEY + w.k);
        } catch (e) {}
        onImage(imgId, data);
        forget(w.k);
        set(w.k, { s: "ready" });
        return true;
      }
      // 回来的认不出：歇一会儿再问
      if (++misses > RETRY_MAX) {
        forget(w.k);
        set(w.k, { s: "fail", why: "画画的小后端回的话认不出", resume: true });
        return true;
      }
      await sleep(RETRY_MS);
    }
  }

  // 一张一张来。她不在眼前就停下，等她回来（resume）
  async function kick() {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      for (;;) {
        if (!visible()) break;
        const w = list[0];
        if (!w) break;
        current = w.k;
        if (await hasImg(w.k)) {
          forget(w.k);
          set(w.k, { s: "ready" });
          continue;
        }
        let job = await jobOf(w.k);
        const at = await where(w);
        // 那一张不在了（掐断了、删了）：不画。翻过去的（她点了重新回答、改了前面的话）：没开画的不画了；开了画的接着问完（钱已经花了）
        if (!at || (at === "kept" && !(job && job.state === "running"))) {
          forget(w.k);
          if (at === "kept") set(w.k, { s: "none" });
          else clear(w.k);
          continue;
        }
        if (job && job.state === "failed") {
          forget(w.k);
          set(w.k, { s: "fail", why: job.why });
          continue;
        }
        // 别的设备刚记了“正在开画”：等它一会儿（它开成了，那一笔会换成画布和会话）
        if (job && job.state === "starting" && job.by !== device && now() - job.at < STARTING_MS) {
          set(w.k, { s: "busy", t0: job.at });
          await sleep(RETRY_MS);
          continue;
        }
        if (!job || job.state === "starting") {
          await store.set(DRAW_JOB_KEY + w.k, packJob({ state: "starting", at: now(), by: device }));
          set(w.k, { s: "busy", t0: now() });
          let res = null;
          try {
            res = await call("start", { prompt: w.p, ratio: w.r || "" });
          } catch (e) {
            // 开画没成：不自己再开（不知道那头扣没扣额度）。缘故记进存档，别的设备也看得见
            const said = why(e);
            await store.set(DRAW_JOB_KEY + w.k, packJob({ state: "failed", why: said, at: now() }));
            forget(w.k);
            set(w.k, { s: "fail", why: said, ...(LINK_CODES.has(e && e.code) ? { link: true } : {}) });
            continue;
          }
          const j = res && res.job;
          if (!j || !j.flow || !Array.isArray(j.sessions) || !j.sessions.length) {
            await store.set(DRAW_JOB_KEY + w.k, packJob({ state: "failed", why: "画画的小后端没说画在哪", at: now() }));
            forget(w.k);
            set(w.k, { s: "fail", why: "画画的小后端没说画在哪" });
            continue;
          }
          job = { state: "running", flow: j.flow, node: j.node || "", sessions: j.sessions, at: now(), by: device };
          await store.set(DRAW_JOB_KEY + w.k, packJob(job));
        }
        const settled = await follow(w, job);
        if (!settled) break;
      }
    } finally {
      current = "";
      running = false;
      if (rerun) {
        rerun = false;
        kick();
      }
    }
  }

  return {
    look,
    want,
    again,
    drop,
    dropChat,
    halt,
    synced,
    resume: () => kick(),
    stateOf: (key) => states.get(key) || null,
    wanting: () => list.map((w) => w.k),
    busyWith: () => current,
  };
}
