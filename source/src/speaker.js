// =====================================================
// 念语音的活（他的语音条，零件见 voice.js）：哪几条要念、正在念哪一条、念好了存起来、念不成记下缘故。
// 不碰页面：用到的浏览器和云端的东西从外头递进来（App.jsx 的 getSpeaker），测试在 Node 里跑（tests/voice.test.mjs）。
//
// 规矩（卿卿 10 月 9 日定的）：
//   回话放进这台设备上的对话的那一下，里头的语音条记下来要念（want）；
//   她在眼前才念：不在眼前的时候不念，回到眼前接着念（她点开才念，头一条要等两三秒，这是说好的）；
//   一条一条念，念好一条存一条（kfs2:voice:<那一条回话的 id>.<第几样>，加密了跟着云端走），换设备也听得到；
//   要念的那几条记在这台设备上（kfs-voice-want），开封府被系统收掉了，下回打开接着念；
//   念不成的：缘故记下，气泡把字摆出来、底下给一行“点这里再念”（again），不自己一遍一遍念（念一回扣一回额度）。
//
// 花钱的规矩：ElevenLabs 念一回扣一回额度，念到一半断了的也扣。所以：
//   自己再念一回的只有两种：ElevenLabs 说太挤（busy）、它那边一时出岔子（down）——这两种它没念，不扣；
//   没连上、等太久（slow）、读到一半断了：那头也许念完了、扣过了，不自己再念，等她点“再念”；
//   只有一种例外：念的工夫里她切走了（锁屏、换别的应用），断多半是切走断的。记着，她回来再念一回（她回来本来也要点开听的）；
//   开念之前看一眼那一条还在不在眼前（她点了重新回答、改了前面的话，旧的翻过去了）：不在眼前的不念。
//
// 每一条的样子（states 里的，也是交给画面的）：
//   load  正从存档里取
//   wait  记下要念了，还没轮到（或者她不在眼前，等她回来）
//   busy  正在念
//   ready 念好了：{ dur（几秒） }。声音在存档里，放的时候现取（不在这儿攒一份，免得聊久了占着一大堆内存）
//   fail  念不成：{ why（缘故）, long（太长了、没有要念的字：再念也没用） }
//   none  存档里没有，也没人要念（别的设备的回话还没同步来；她没开“他能发语音”时他发的语音；她关了开关时还没念的；
//         她点了重新回答、旧回答翻过去的时候还没念到的）
// =====================================================
import { VOICE_KEY, VOICE_MAX, spokenOf, packVoice, readVoice, readWants, addWants, dropWants } from "./voice.js";

export const RETRY_MS = 3000; // ElevenLabs 那边太挤、一时出岔子：歇这么久再念一回（就一回）

// 自己再念一回的：ElevenLabs 说它没念（太挤、一时出岔子）。没连上、等太久的不算：那头也许念完了，再念要再扣一回
export const passing = (e) => !!e && e.code === "refused" && (e.reason === "busy" || e.reason === "down");
// 她切走了的那一阵里断的：多半是切走断的
const cutByLeaving = (e) => !!e && (e.code === "unreachable" || e.code === "stopped" || e.code === "slow" || passing(e));

// call(text, stability, signal)：念一段，回 { audio, mime, dur }；出了岔子抛带 code 的错（见 cloud.js 的 callVoice）
// store：{ get, set, del }（存档）；visible()：她在不在眼前；hides()：开封府到现在一共被切走过几回（看念的工夫里她走没走开）；
// wants：{ get, set }（这台设备上记的那一串）；stab()：眼下念得稳不稳（0、0.5、1）；
// alive(w)：那一条回话里的这一样在哪儿——"shown" 在眼前，"kept" 在翻过去的版本里，"" 没了（见 voice.js 的 voiceWhere）；
// onChange(key, state)：哪一条变了样子（state 是 null：不认这一条了，掐断了、删了）
export function createSpeaker({ call, store, visible, hides = () => 0, wants, stab, alive, now, sleep, onChange }) {
  const states = new Map();
  let list = readWants(wants.get(), now());
  let running = false;
  let rerun = false; // 念着的工夫里又有人叫接着念（她回来了）：这一轮完了再看一遍
  let current = "";
  let currentChat = "";
  let ctl = null;

  const saveWants = () => wants.set(list.length ? JSON.stringify(list) : "");
  saveWants(); // 读的时候不认的（太老的、钟点不对的）当场从设备上清掉
  const set = (key, st) => {
    states.set(key, st);
    onChange(key, st);
  };
  // 不认这一条了（掐断了、删了）：画面上那一格也清掉（再冒出来的话重新看一眼）
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
  const where = async (w) => {
    try {
      return (await alive(w)) || "";
    } catch (e) {
      return "";
    }
  };

  // 存档里有没有念好的；有就是念好了（几秒）
  async function fromStore(key) {
    let text = null;
    try {
      text = await store.get(VOICE_KEY + key);
    } catch (e) {
      text = null;
    }
    const rec = text ? readVoice(text) : null;
    return rec ? { s: "ready", dur: rec.dur } : null;
  }

  // 画面上冒出一条语音：看看它是什么样子（存档里有就是念好了的）。只看，不开念：开念等她回到眼前那一下（resume），网才连得上
  async function look(key) {
    if (states.has(key)) return;
    set(key, { s: "load" });
    const got = await fromStore(key);
    const st = states.get(key); // 取的工夫里被划掉了（drop）就没有了：不再添回去
    if (got) {
      if (st && (st.s === "load" || st.s === "wait" || st.s === "none")) set(key, got);
      if (wanted(key) && current !== key) forget(key);
      return;
    }
    if (st && st.s === "load") set(key, wanted(key) ? { s: "wait" } : { s: "none" });
  }

  // 要念这几条：items 是 [{ key, text }]，chat 是哪段对话
  function want(chat, items) {
    const adds = [];
    for (const it of items || []) {
      const st = states.get(it.key);
      if (st && (st.s === "ready" || st.s === "busy")) continue;
      adds.push({ k: it.key, t: it.text, c: chat, at: now() });
      set(it.key, { s: "wait" });
    }
    if (!adds.length) return;
    list = addWants(list, adds);
    saveWants();
    kick();
  }

  // 她点了“点这里再念”：念不成的、没人要念的，再念一回
  function again(chat, key, text) {
    const st = states.get(key);
    if (st && (st.s === "busy" || st.s === "wait" || st.s === "ready" || st.s === "load")) return;
    states.delete(key);
    want(chat, [{ key, text }]);
  }

  // 画面正等着这一条（回话一条一条蹦，蹦到它了）：排到最前头，下一个就念它（正念着的那一条不打断）
  function hurry(key) {
    const at = list.findIndex((w) => w.k === key);
    if (at <= 0) return;
    list = [list[at]].concat(list.filter((w, i) => i !== at));
    saveWants();
  }

  // 这几条不要了（掐断了、对话删了）：不念了；正念着的那一问掐掉；念好存着的删掉
  async function drop(keys) {
    const gone = new Set(keys);
    if (!gone.size) return;
    list = dropWants(list, keys);
    saveWants();
    if (current && gone.has(current) && ctl) ctl.abort();
    for (const k of keys) {
      clear(k);
      try {
        if ((await store.get(VOICE_KEY + k)) != null) await store.del(VOICE_KEY + k);
      } catch (e) {}
    }
  }

  // 一整段对话删了：那段对话里记着要念的、正念着的，都不念了
  function dropChat(chat) {
    const keys = list.filter((w) => w.c === chat).map((w) => w.k);
    if (current && currentChat === chat && !keys.includes(current)) keys.push(current);
    return drop(keys);
  }

  // 她关了“他能发语音”：记着要念的都不念了，正念着的那一问掐掉。念好存着的留着（照样能放）；
  // 没念的气泡上是“这条语音还没念，点这里念出来”，她想听自己点
  function halt() {
    const keys = list.map((w) => w.k);
    list = [];
    saveWants();
    if (ctl) ctl.abort();
    for (const k of keys) {
      const st = states.get(k);
      if (st && (st.s === "wait" || st.s === "busy")) set(k, { s: "none" });
    }
  }

  // 别的设备念好的、删掉的同步下来了（keys 是存档里的名字，带着 kfs2:voice: 那一截）
  async function synced(keys) {
    for (const full of keys) {
      if (!full.startsWith(VOICE_KEY)) continue;
      const key = full.slice(VOICE_KEY.length);
      if (!states.has(key) && !wanted(key)) continue;
      const got = await fromStore(key);
      const st = states.get(key);
      if (got) {
        if (current !== key) {
          if (wanted(key)) forget(key);
          set(key, got);
        }
      } else if (st && st.s === "ready") set(key, { s: "none" });
    }
  }

  // 一条一条念。她不在眼前就停下，等她回来（resume）
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
        // 已经念好了（别的设备念的同步下来了，或者上回念好了没来得及划掉）
        const have = await fromStore(w.k);
        if (have) {
          forget(w.k);
          set(w.k, have);
          continue;
        }
        // 那一条不在眼前了（掐断了、删了、她点了重新回答或者改了前面的话、旧的翻过去了）：不念。
        // 翻过去的那种记成“没人念”：她要是翻回来，气泡上是“这条语音还没念，点这里念出来”
        const at = await where(w);
        if (at !== "shown") {
          forget(w.k);
          if (at === "kept") set(w.k, { s: "none" });
          else clear(w.k);
          continue;
        }
        const text = spokenOf(w.t);
        if (!text) {
          forget(w.k);
          set(w.k, { s: "fail", why: "没有要念的字", long: true });
          continue;
        }
        if (Array.from(text).length > VOICE_MAX) {
          forget(w.k);
          set(w.k, { s: "fail", why: "太长了，没念成语音", long: true });
          continue;
        }
        set(w.k, { s: "busy" });
        current = w.k;
        currentChat = w.c;
        ctl = new AbortController();
        const signal = ctl.signal;
        const h0 = hides();
        let got = null;
        let err = null;
        for (let round = 0; round < 2; round++) {
          try {
            got = await call(text, stab(), signal);
            err = null;
            break;
          } catch (e) {
            err = e;
            if (signal.aborted || round > 0 || !passing(e) || !visible()) break;
            await sleep(RETRY_MS);
            if (signal.aborted) break;
          }
        }
        current = "";
        currentChat = "";
        ctl = null;
        if (signal.aborted) continue; // 不要了（drop、halt 已经收拾过）
        if (got && got.audio) {
          // 念的工夫里那一条被掐断、删了：念好的不存。翻过去了的照存（钱已经花了，她翻回来就能放）
          if (!(await where(w))) {
            forget(w.k);
            clear(w.k);
            continue;
          }
          await store.set(VOICE_KEY + w.k, packVoice(got));
          forget(w.k);
          set(w.k, { s: "ready", dur: Number(got.dur) || 0 });
          continue;
        }
        // 没念成。念的工夫里她切走过（或者眼下还不在）、断的样子像是切走断的：记着，等她回来再念
        if ((!visible() || hides() !== h0) && cutByLeaving(err)) {
          set(w.k, { s: "wait" });
          break;
        }
        forget(w.k);
        set(w.k, { s: "fail", why: String((err && err.message) || "没念成").slice(0, 90) });
      }
    } finally {
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
    hurry,
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
