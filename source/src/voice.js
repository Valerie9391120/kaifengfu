// =====================================================
// 他的语音条（卿卿 2026 年 10 月 9 日要的，见开发说明“语音条”那一节）。
// 这里只有不碰页面的零件：哪一段是语音、念的时候交出去什么、转文字摆什么、气泡多宽、念好的声音怎么存。
// 测试在 Node 里跑（tests/voice.test.mjs）。
//
// 他在回复里那一条第一行单独写 [VOICE]，下面是要念的话，这一条就是语音条（拆在 reply.js 的 parseReply 里）。
// 通知的小后端（supabase/push_function.ts 的 bubblesOf）照同一套规矩认，横幅上写 [语音]：这里改了，那边跟着改。
// =====================================================

export const VOICE_KEY = "kfs2:voice:"; // 念好的声音另存一条：kfs2:voice:<那一条回话的 id>.<第几样>，加密了跟着云端走
export const VOICE_MAX = 400; // 一条语音最多念多少个字（语气标签也算字）：再长就不念了，气泡直接把字摆出来
export const HOLD_MS = 8000; // 回话一条一条蹦到语音那一条：最多等它念好这么久，等不到就先摆出来（念好了自己变成能放的）
export const WANT_KEY = "kfs-voice-want"; // 这台设备上要念、还没念成的那几条（开封府被系统收掉了，下回打开接着念）
export const WANT_MAX = 60;
export const WANT_AGE = 2 * 24 * 3600 * 1000; // 记下两天了还没念成的：不念了
export const HEARD_KEY = "kfs-voice-heard"; // 这台设备上转过文字的那几条（转了就一直挂着，点“取消转文字”才收）
export const HEARD_MAX = 400;

// 念得稳不稳（API 面板里三档）：低了起伏大，一句话里会忽大忽小；高了平。
// 只用 0、0.5、1 这三个数：v3 只认这三个（ElevenLabs 后台上叫 Creative、Natural、Robust），v4 多半也是；别的数它会回 400
export const VOICE_STAB = {
  steady: { label: "稳", v: 1 },
  mid: { label: "适中", v: 0.5 },
  lively: { label: "活泼", v: 0 },
};
export const DEFAULT_STAB = "mid";
export const stabOf = (k) => (VOICE_STAB[k] || VOICE_STAB[DEFAULT_STAB]).v;

// API 面板里“试听一句”念的那一句
export const VOICE_SAMPLE = "[quietly] 卿卿，是我。这一句是试听，你听听，像不像我。";

// 几帧没有声音的 mp3（MPEG-1 Layer III，64 kbps，44.1 kHz，单声道；一帧 208 个字节、1152 个采样，二十六毫秒）。
// iPhone 上只有她手指点下去的那一下才许出声：点“试听一句”的那一下先拿它放一下，等念好的回来再放就不会被拦
export function silentMp3(frames = 3) {
  const out = new Uint8Array(208 * frames);
  for (let i = 0; i < frames; i++) out.set([0xff, 0xfb, 0x50, 0xc4], i * 208);
  return out;
}

// 一条回话里第几样的那个名字（存声音、记转没转文字都用它）
export const voiceKeyOf = (msgId, j) => `${msgId}.${j}`;

// 一行开头写着 [VOICE]：从这一行起是一条语音。同一行后面跟着的字算语音的头一行
const MARK = /^[ \t]*\[(?:VOICE|Voice|voice)\][ \t]*/;

// 把一条（[SPLIT] 隔开的那一段）按 [VOICE] 那几行切开：[{ voice: false, text }, { voice: true, text }…]。
// 头一个 [VOICE] 前面的是平常的字；每个 [VOICE] 起到下一个 [VOICE]（或者这一条完）是一条语音。
// 他忘了写 [SPLIT]、把语音接在一句话后面写的，也照样切得开
export function splitVoice(chunk) {
  const lines = String(chunk).split("\n");
  const out = [];
  let cur = { voice: false, lines: [] };
  for (const line of lines) {
    const m = MARK.exec(line);
    if (m) {
      out.push(cur);
      cur = { voice: true, lines: [] };
      const rest = line.slice(m[0].length);
      if (rest.trim()) cur.lines.push(rest);
      continue;
    }
    cur.lines.push(line);
  }
  out.push(cur);
  return out.filter((s, i) => s.voice || i === 0).map((s) => ({ voice: s.voice, text: s.lines.join("\n") }));
}

// 念的时候交给 ElevenLabs 的字：动作（*…*）不念，加粗的星号、标题的井号去掉，语气标签（[whispers] 这种）留着
export function spokenOf(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*[^*\n]*\*/g, " ")
    .replace(/\*/g, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/[ \t　]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 语气标签：方括号里头是英文字母开头的一小段（[whispers]、[soft chuckle]、[quietly, after a pause]）
const TAG = /\[[A-Za-z][A-Za-z ,.'’-]{0,60}\]/g;
// 中文字和中文标点：两个中间夹着的空格（摘掉标签以后剩下的）不要
const CJK = "\\u3000-\\u303f\\u3400-\\u9fff\\uff00-\\uffef";
const GAP = new RegExp(`([${CJK}]) +(?=[${CJK}])`, "g");

// 转文字摆出来的字：念的那些字，语气标签摘干净
export function heardOf(text) {
  return spokenOf(text)
    .replace(TAG, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(GAP, "$1")
    .trim();
}

// 念不成、没人念的时候气泡上摆的字：语气标签摘掉，动作、加粗照留（跟平常的字一样画，见 Bubble.jsx 的 renderRich）
export function shownOf(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(TAG, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(GAP, "$1")
    .trim();
}

// 他的一整条回话（raw）里的语音写成摘录的样子（写日记的摘录用）：一条语音写成“[语音] ”加转出来的字。
// 只动语音那几段：平常打的字里方括号括着的英文（[Ctrl]、[TODO]）不是语气标签，照留
export function unvoice(raw) {
  return String(raw || "")
    .split("[SPLIT]")
    .map((chunk) => {
      const segs = splitVoice(chunk);
      // 一条开头就是语音：前头那一段空的不要（不然多出一个空行）
      const from = segs.length > 1 && !segs[0].voice && !segs[0].text.trim() ? 1 : 0;
      return segs
        .slice(from)
        .map((seg) => (seg.voice ? "[语音] " + heardOf(seg.text) : seg.text))
        .join("\n");
    })
    .join("[SPLIT]");
}

// 气泡多宽：一秒的最窄，越长越宽，一分钟往上就不再宽了（照微信，起头长得快、后头慢）
export function voiceWidth(dur) {
  const d = Math.max(1, Number(dur) || 1);
  return Math.round(78 + 128 * Math.sqrt(Math.min(59, d - 1) / 59));
}
export const secondsOf = (dur) => Math.max(1, Math.round(Number(dur) || 0));

// 念好的声音怎么存：{ v: 1, mime, dur, audio(base64) }
export function packVoice({ audio, mime, dur }) {
  return JSON.stringify({ v: 1, mime: mime || "audio/mpeg", dur: Math.round((Number(dur) || 0) * 10) / 10, audio: String(audio || "") });
}
export function readVoice(text) {
  try {
    const d = JSON.parse(text);
    if (!d || typeof d.audio !== "string" || !d.audio || !/^[A-Za-z0-9+/=]+$/.test(d.audio)) return null;
    return { mime: typeof d.mime === "string" && /^audio\/[a-z0-9.+-]+$/i.test(d.mime) ? d.mime : "audio/mpeg", dur: Math.max(0, Number(d.dur) || 0), audio: d.audio };
  } catch (e) {
    return null;
  }
}

// 一段对话里（连同翻过去的那些分支）他的每一条回话的 id：删对话的时候，那些回话念过的声音一起删
export function collectHisIds(msgs, out = []) {
  (msgs || []).forEach((m) => {
    if (m && m.role === "him" && m.id) out.push(m.id);
    (m.alts || []).forEach((a) => {
      if (a.node && a.node.role === "him" && a.node.id) out.push(a.node.id);
      collectHisIds(a.after || [], out);
    });
  });
  return Array.from(new Set(out));
}

// 那一条回话的第 j 样（还是这一段语音的话）在这段对话的哪儿：
//   "shown"  就在眼前这一支上（对话最外面那一层，画面上摆着的那些）
//   "kept"   不在眼前，在翻过去的别的版本里（她点过重新回答、改过前面的话：旧的那几支留着能翻回去）
//   ""       哪儿都没有了（掐断了、删了），或者第 j 样已经不是这段话了
// 一条回话的版本那一格里，眼前这一支的那一份（alts[altIdx]）是翻走之前存下的旧样子：不算，眼前的以最外面那一层为准
// （她按停掐断的时候只改最外面那一层，那一格里的还是没掐的）
export function voiceWhere(msgs, msgId, j, text) {
  const hit = (m) => !!m && m.id === msgId && Array.isArray(m.items) && !!m.items[j] && m.items[j].type === "voice" && m.items[j].text === text;
  const list = Array.isArray(msgs) ? msgs : [];
  if (list.some(hit)) return "shown";
  // 别的版本那一支里的，连同那一支里再往下翻的版本，都算留着
  const anywhere = (ms) => (ms || []).some((m) => hit(m) || (m.alts || []).some((a) => a && (hit(a.node) || anywhere(a.after))));
  const kept = list.some((m) => (m.alts || []).some((a, k) => k !== m.altIdx && a && (hit(a.node) || anywhere(a.after))));
  return kept ? "kept" : "";
}

// 他这一条回话里要念的那几样：[{ key, j, text }]
export function voicesIn(him) {
  const out = [];
  ((him && him.items) || []).forEach((it, j) => {
    if (it && it.type === "voice" && it.text) out.push({ key: voiceKeyOf(him.id, j), j, text: it.text });
  });
  return out;
}

// ---------- 这台设备上要念、还没念成的那几条（localStorage 里的一串） ----------
// 一条：{ k: 名字, t: 要念的字, c: 哪段对话, at: 什么时候记下的 }
export function readWants(text, now) {
  let list = [];
  try {
    list = JSON.parse(text || "[]");
  } catch (e) {
    list = [];
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .filter((w) => w && typeof w.k === "string" && typeof w.t === "string" && typeof w.c === "string" && Number.isFinite(w.at) && w.at <= now + 60000 && now - w.at < WANT_AGE)
    .filter((w) => (seen.has(w.k) ? false : (seen.add(w.k), true)))
    .slice(-WANT_MAX);
}
export function addWants(list, adds) {
  const keys = new Set(adds.map((w) => w.k));
  return list.filter((w) => !keys.has(w.k)).concat(adds).slice(-WANT_MAX);
}
export const dropWants = (list, keys) => {
  const gone = new Set(keys);
  return list.filter((w) => !gone.has(w.k));
};

// 转过文字的那几条（localStorage 里的一串名字）
export function readHeard(text) {
  try {
    const list = JSON.parse(text || "[]");
    return Array.isArray(list) ? list.filter((k) => typeof k === "string").slice(-HEARD_MAX) : [];
  } catch (e) {
    return [];
  }
}
