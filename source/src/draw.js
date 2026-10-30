// =====================================================
// 他画画（卿卿 2026 年 10 月 30 日要的，见开发说明“他画画”那一节）。
// 这里只有不碰页面的零件：哪一段是画、画的那一张存在哪、记着要画的那一串、寄给他的那几句、名帖里教他的那一段。
// 测试在 Node 里跑（tests/draw_parts.test.mjs）。
//
// 他在回复里单独一行写 [DRAW]（要竖的写 [DRAW:竖]，横的 [DRAW:横]），后面接着写要画什么，到这一条（[SPLIT] 隔开的那一段）完为止。
// 拆在 reply.js 的 parseReply 里，成了一样 { type: "draw", prompt, ratio }；写回去在 rawOf 里。
// 通知的小后端（supabase/push_function.ts 的 splitDraw、visibleBubbles）照同一套规矩认，横幅上写 [画]：这里改了，那边跟着改。
//
// 画是 draw 函数（supabase/draw_function.ts）替他交给 ElevenLabs 画的；画的活在 painter.js。
// 画好的图跟她发的照片一样存：kfs2:img:<drawImgOf(那一样)>，加密了跟着云端走。
// 画到一半的那一回（ElevenLabs 那头的画布、会话）另存一条 kfs2:drawjob:<那一样>，也跟着云端走：
// 换一台设备、开封府被系统收掉重开，都能接着问“画好没有”，不用再画一回、再花一回额度
// =====================================================

export const DRAW_JOB_KEY = "kfs2:drawjob:";
export const WANT_KEY = "kfs-draw-want"; // 这台设备上要画、还没画成的那几张（开封府被系统收掉了，下回打开接着画）
export const WANT_MAX = 30;
export const WANT_AGE = 2 * 24 * 3600 * 1000; // 记下两天了还没画成的：不画了
export const PROMPT_MAX = 2000; // 一张画的“画什么”最多这么多个字（draw 函数那边也是这个数）
export const RATIOS = ["横", "竖", "方"];

// 一行开头写着 [DRAW]（或者 [DRAW:竖]、[DRAW：横]、[DRAW:方]）：从这儿起是一张画，记号后面的（同一行跟着的、下面几行）都是“画什么”
const MARK = /^[ \t]*\[(?:DRAW|Draw|draw)(?:[:：][ \t]*(横|竖|方)[ \t]*)?\][ \t]*/m;

// 把一条（[SPLIT] 隔开的那一段）里的画摘出来：回 { before, prompt, ratio }（before 是记号前面的字，照常拆），没有画就是 null。
// 一条里只认头一个记号：后面再写的 [DRAW] 也算“画什么”里的字（要画两张，用 [SPLIT] 隔成两条）
export function splitDraw(chunk) {
  const text = String(chunk);
  const m = MARK.exec(text);
  if (!m) return null;
  return { before: text.slice(0, m.index), prompt: text.slice(m.index + m[0].length).trim(), ratio: m[1] || "" };
}

// 一张画的名字：那一条回话的 id 加第几样（跟语音条一样，见 voice.js 的 voiceKeyOf）
export const drawKeyOf = (msgId, j) => `${msgId}.${j}`;
// 画好的那一张存成照片：kfs2:img:draw.<那一条回话的 id>.<第几样>
export const drawImgOf = (key) => `draw.${key}`;

// 一条回话里的画：[{ key, prompt, ratio }]
export function drawsIn(m) {
  const out = [];
  if (!m || m.role !== "him") return out;
  (m.items || []).forEach((it, j) => {
    if (it && it.type === "draw" && it.prompt) out.push({ key: drawKeyOf(m.id, j), prompt: it.prompt, ratio: it.ratio || "" });
  });
  return out;
}

// 所有分支里他画过的画（删对话的时候一起清掉：画好的图、画到一半的那一回）
export function collectDrawKeys(msgs, out = []) {
  (msgs || []).forEach((m) => {
    drawsIn(m).forEach((d) => out.push(d.key));
    (m.alts || []).forEach((a) => {
      if (a.node) drawsIn(a.node).forEach((d) => out.push(d.key));
      collectDrawKeys(a.after || [], out);
    });
  });
  return Array.from(new Set(out));
}

// 一张画在哪儿：shown 在眼前（摆着的这一支里）；kept 在翻过去的版本里；"" 没了（掐断了、删了）
export function drawWhere(msgs, key) {
  const shown = (msgs || []).some((m) => drawsIn(m).some((d) => d.key === key));
  if (shown) return "shown";
  return collectDrawKeys(msgs || []).includes(key) ? "kept" : "";
}

// ---------- 记在这台设备上的那一串 ----------
// 一样：{ k: 那一张的名字, p: 画什么, r: 横竖, c: 哪段对话, at: 几点记下的 }
export function readWants(text, now) {
  let raw = null;
  try {
    raw = JSON.parse(text || "null");
  } catch (e) {}
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const w of raw) {
    if (!w || typeof w.k !== "string" || !w.k || typeof w.p !== "string" || !w.p || seen.has(w.k)) continue;
    const at = Number(w.at) || 0;
    if (now - at > WANT_AGE || at > now + 60000) continue;
    seen.add(w.k);
    out.push({ k: w.k, p: w.p.slice(0, PROMPT_MAX), r: RATIOS.includes(w.r) ? w.r : "", c: typeof w.c === "string" ? w.c : "", at });
  }
  return out.slice(-WANT_MAX);
}
export function addWants(list, adds) {
  const keys = new Set(adds.map((a) => a.k));
  return list.filter((w) => !keys.has(w.k)).concat(adds).slice(-WANT_MAX);
}
export const dropWants = (list, keys) => list.filter((w) => !keys.includes(w.k));

// ---------- 画到一半的那一回 ----------
// { flow, node, sessions, at（开画的钟点）, by（哪台设备开的）, state: "running" | "failed", why }
export function readJob(text) {
  let d = null;
  try {
    d = JSON.parse(text || "null");
  } catch (e) {}
  if (!d || typeof d !== "object") return null;
  if (d.state === "failed") return { state: "failed", why: String(d.why || "没画成").slice(0, 120), at: Number(d.at) || 0 };
  if (d.state === "starting") return { state: "starting", at: Number(d.at) || 0, by: String(d.by || "") };
  if (typeof d.flow !== "string" || !d.flow || !Array.isArray(d.sessions) || !d.sessions.length) return null;
  return { state: "running", flow: d.flow, node: String(d.node || ""), sessions: d.sessions.filter((x) => typeof x === "string").slice(0, 8), at: Number(d.at) || 0, by: String(d.by || "") };
}
export const packJob = (job) => JSON.stringify(job);

// ---------- 寄给他的那几句 ----------
// 他画的那一张：画好了带着图让他看；还在画、没画成、图太老了不带的，各说各的（见 prompt/messages.js）
export function drawNote(st) {
  if (st && st.img) return "[开封府提示：你画的那张画好了，长这样]";
  if (st && st.old) return "[开封府提示：你画的那张画好了，在聊天里摆着；图这一回没带上]";
  if (st && st.why) return `[开封府提示：你那张画没画成：${st.why}]`;
  if (st && st.none) return "[开封府提示：你那张画这一回没画出来]";
  return "[开封府提示：你那张画还在画，画好了会摆在聊天里]";
}

// 名帖里教他的那一段（“他能画画”开着、连上了 ElevenLabs 才有，见 prompt/system.js）
export const DRAW_RULE = `想给她画一张画的时候，单独一行写 [DRAW]，后面接着写这张画要画什么（同一行接着写，或者写在下面几行，到这一条完为止）。开封府会替你交给 ElevenLabs 画出来，画一张要半分钟上下；画好了在聊天里摆成一张图，她点开能看大图，她下一回说话的时候你也会看到画成了什么样。写在 [DRAW] 后面的那一段她看不见，她只看得到画：想跟她说的话写在 [DRAW] 前面，或者另起一条。画什么写得具体一点：画面里有什么、什么风格、颜色和光线，中文英文都行；别画真人的样子。要竖的写 [DRAW:竖]，横的写 [DRAW:横]，不写是方的。一条里只画一张，要画两张就用 [SPLIT] 隔成两条。画一张花她一点 ElevenLabs 的额度。画不画、画什么，你自己决定。`;

// API 面板里“试画一张”画的那一张
export const DRAW_SAMPLE = "一只小狐狸坐在窗边的书案前读书，穿紫色的宋代圆领袍，戴展脚幞头，窗外是夜里的月亮和几枝花，水彩画，暖色的灯光";
