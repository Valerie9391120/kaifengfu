// =====================================================
//   通话里他说的话怎么念（见开发说明“通话”那一节）。不碰页面，测试在 Node 里跑（tests/call.test.mjs）。
//   1. 洗：动作（*…*）、加粗、标题照语音条的规矩（voice.js 的 spokenOf）；再去掉表情、列表记号、引用、代码、链接、漏网的记号。
//      语气标签（[whispers] 这种英文方括号）留着，ElevenLabs 认。
//   2. 切（照那份安卓攻略的路子）：他这一回的头一段要短，十来个字遇到逗号就切，先出声；
//      后面的段攒长一点再切（声音连贯），过了四十个字遇到句末就切，过了八十个字遇到逗号也切，最长一百五十个字左右。
//      省略号不切（他的犹豫不该被切碎）；语气标签不切开；一句话被切成两段，后一段带着这句话的语气标签；
//      [sighs]、[laughs] 这种出声的只在原处，不跟着带。
//   3. 念：最多两段一起去念（ElevenLabs 那头），放的时候严格按顺序；前一段在放，后面的已经在准备。
// =====================================================
import { spokenOf } from "../voice.js";

// 语气标签：方括号里头是英文字母开头的一小段（和 voice.js 的 TAG 一样）
const TAG_SRC = "\\[[A-Za-z][A-Za-z ,.'’-]{0,60}\\]";
const TAG_AT = new RegExp("^" + TAG_SRC);
// 出声的那种（叹气、笑、清嗓子……）：只在原处，切开了不往后带
const EVENT_TAGS = /^\[(?:soft |little |small |quiet |nervous |short )?(?:sighs?|laughs?|laughing|chuckles?|chuckle|giggles?|gasps?|coughs?|sniffs?|sniffles?|clears throat|exhales?|inhales?|yawns?|hums?|groans?|snorts?|scoffs?|whistles?|breathes?)\b/i;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const WORDY = /[\p{L}\p{N}]/u; // 有字（不是光剩标点、符号）

// 洗一段他的话：念出来的就是这些
export function cleanForCall(text) {
  let t = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, " ")
    .replace(/\[([^\]\n]+)\]\((?:https?:\/\/)[^)\s]*\)/g, "$1")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/^[ \t]*\[\/?(?:DOC|Doc|doc)\b[^\]\n]*\][ \t]*$/gm, "")
    .replace(/^[ \t]*\[(?:VOICE|Voice|voice)\][ \t]*/gm, "")
    .replace(/\[(?:MEME|AVATAR|NAME)[:：][^\]\n]*\]/g, " ");
  t = spokenOf(t)
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]{0,3}(?:[-+•·]|\d{1,2}[.、)）])[ \t]+/gm, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(EMOJI, "")
    .replace(/[ \t　]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
  return WORDY.test(t.replace(new RegExp(TAG_SRC, "g"), "")) ? t : "";
}

const END = new Set(["。", "！", "？", "!", "?", "；", ";", "\n"]);
const SOFT = new Set(["，", ",", "、", "：", ":"]);

// 切成一段一段念。first：这是他这一回最先念的一段（要短，早点出声）
// 回切好的几段；每段都有字（光剩语气标签、标点的不要）
export function splitForCall(text, { first = true, firstMin = 12, endMin = 40, softMin = 80, max = 150 } = {}) {
  const src = String(text || "");
  const out = [];
  let cur = "";
  let eff = 0; // 这一段有几个字（标签、空白不算）
  let mood = ""; // 这句话眼下的语气标签（新的盖掉旧的；句子完了就清掉）
  let isFirst = first;
  const push = (carry) => {
    const seg = cur.trim();
    if (seg && WORDY.test(seg.replace(new RegExp(TAG_SRC, "g"), ""))) {
      out.push(seg);
      isFirst = false;
    } else if (out.length && seg) {
      out[out.length - 1] = (out[out.length - 1] + " " + seg).trim(); // 光剩个标签、标点的：并到上一段后面
    }
    cur = carry && mood ? mood + " " : "";
    eff = 0;
  };
  const chars = Array.from(src);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "[") {
      const m = TAG_AT.exec(chars.slice(i, i + 70).join(""));
      if (m) {
        const tag = m[0];
        cur += tag;
        if (!EVENT_TAGS.test(tag)) mood = tag;
        i += Array.from(tag).length - 1;
        continue;
      }
    }
    const c = chars[i];
    cur += c;
    if (!/\s/.test(c)) eff += 1;
    // 英文句号：后面是空白或者完了才算句末（省略号“...”不算）
    const dotEnd = c === "." && chars[i - 1] !== "." && chars[i + 1] !== "." && (i + 1 >= chars.length || /\s/.test(chars[i + 1]));
    if (END.has(c) || dotEnd) {
      // 连着的结尾符号（“！！”“？！”）一起带上
      while (i + 1 < chars.length && (END.has(chars[i + 1]) || chars[i + 1] === "”" || chars[i + 1] === "」") && chars[i + 1] !== "\n") {
        i += 1;
        cur += chars[i];
      }
      if (isFirst ? eff >= 1 : eff >= endMin) {
        push(false);
        mood = "";
      } else if (c === "\n") {
        mood = "";
      }
      continue;
    }
    if (SOFT.has(c) && (isFirst ? eff >= firstMin : eff >= softMin)) {
      push(true);
      continue;
    }
    if (eff >= max) push(true);
  }
  push(false);
  return out;
}

// 他这一回的话（回话里的那几样）切成要念的几段：字和语音都念；表情包、文档、换头像不念
export function segmentsOfReply(items) {
  const out = [];
  (items || []).forEach((it) => {
    if (!it || (it.type !== "text" && it.type !== "voice")) return;
    const clean = cleanForCall(it.text);
    if (!clean) return;
    splitForCall(clean, { first: out.length === 0 }).forEach((s) => out.push(s));
  });
  return out;
}

// ---------- 念：最多两段一起准备，按顺序放 ----------
// d：{
//   synth(text, signal)  念一段，回 { url }（放得出来的地址）；出了岔子抛错
//   play(url)            放一段，放完了 resolve；放不出来 reject
//   stopPlay()           立刻停下正在放的
//   release(url)         这一段用完了（收回地址）
//   onState(s)           "speaking" 开始出声 / "done" 这一回都念完了（或者念不成的跳过了） / "idle" 停了
//   onError(e)           某一段念不成（跳过它接着念后面的）
// }
// 回 { add(texts), end(), cancel(), busy() }：add 加几段；end 这一回没有更多了（念完就报 done）；cancel 全停
export function createSayer(d, { ahead = 2 } = {}) {
  let queue = []; // { text, st: wait|load|ready|fail, url, ctl }
  let closed = false;
  let playing = false;
  let run = 0; // cancel 一回加一：旧的回调认得出自己过期了
  let spoke = false;

  const fill = () => {
    // 往前准备的（在念的、念好了等着放的；正在放的那段不算）最多 ahead 段：挂了电话，没放的白白扣额度
    const waiting = queue.slice(playing ? 1 : 0);
    let room = ahead - waiting.filter((q) => q.st === "load" || q.st === "ready").length;
    for (const q of waiting) {
      if (room <= 0) break;
      if (q.st !== "wait") continue;
      q.st = "load";
      room -= 1;
      const my = run;
      q.ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      Promise.resolve()
        .then(() => d.synth(q.text, q.ctl ? q.ctl.signal : null))
        .then(
          (got) => {
            if (my !== run) {
              if (got && got.url) d.release(got.url);
              return;
            }
            q.st = "ready";
            q.url = got && got.url;
            pump();
          },
          (e) => {
            if (my !== run) return;
            q.st = "fail";
            q.err = e;
            pump();
          }
        );
    }
  };
  const pump = () => {
    fill();
    if (playing) return;
    const head = queue[0];
    if (!head) {
      if (closed) {
        closed = false;
        const said = spoke;
        spoke = false;
        d.onState("done", said);
      }
      return;
    }
    if (head.st === "fail") {
      queue.shift();
      d.onError(head.err);
      pump();
      return;
    }
    if (head.st !== "ready") return;
    playing = true;
    fill(); // 这一段开始放了：后面的接着准备
    const my = run;
    if (!spoke) {
      spoke = true;
      d.onState("speaking");
    }
    Promise.resolve()
      .then(() => d.play(head.url))
      .catch((e) => {
        if (my === run) d.onError(e);
      })
      .then(() => {
        if (head.url) d.release(head.url);
        if (my !== run) return;
        playing = false;
        queue.shift();
        pump();
      });
  };

  return {
    add(texts) {
      (texts || []).forEach((text) => text && queue.push({ text, st: "wait" }));
      pump();
    },
    end() {
      closed = true;
      pump();
    },
    cancel() {
      run += 1;
      queue.forEach((q) => {
        if (q.ctl) q.ctl.abort();
        if (q.url && q.st === "ready") d.release(q.url);
      });
      queue = [];
      closed = false;
      spoke = false;
      if (playing) {
        playing = false;
        d.stopPlay();
      }
      d.onState("idle");
    },
    busy: () => playing || queue.length > 0,
  };
}
