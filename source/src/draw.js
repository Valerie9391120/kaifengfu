// =====================================================
// 他画画（卿卿 2026 年 10 月 30 日要的，见开发说明“他画画”那一节）。
// 这里只有不碰页面的零件：哪一段是画、画的那一张存在哪、记着要画的那一串、寄给他的那几句、名帖里教他的那一段。
// 测试在 Node 里跑（tests/draw_parts.test.mjs）。
//
// 他在回复里单独一行写 [DRAW]（要竖的写 [DRAW:竖]，横的 [DRAW:横]），后面接着写要画什么，到这一条（[SPLIT] 隔开的那一段）完为止。
// 这张画的名字（卿卿 10 月 31 日要的，图画院里摆的就是它）：用书名号写在记号同一行的后面，画什么另起一行：
//   [DRAW:竖]《月下读书》
//   一扇木窗，窗外……
// 记号那一行后面只有一个《……》才算名字；《清明上河图》那样的，后面还跟着字的，算画什么里的字。名字不交给 ElevenLabs（交了它会把字画进图里）
// 拆在 reply.js 的 parseReply 里，成了一样 { type: "draw", prompt, ratio, title }；写回去在 rawOf 里。
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
export const TITLE_MAX = 30; // 名字最多这么多个字

// 一行开头写着 [DRAW]（或者 [DRAW:竖]、[DRAW：横]、[DRAW:方]）：从这儿起是一张画，记号后面的（同一行跟着的、下面几行）都是“画什么”
const MARK = /^[ \t]*\[(?:DRAW|Draw|draw)(?:[:：][ \t]*(横|竖|方)[ \t]*)?\][ \t]*/m;

// 记号后面那一段的头一行只有一个《名字》：那是名字，下面才是画什么。回 { title, prompt }
const TITLE_LINE = new RegExp(`^[ \\t]*《([^《》\\n]{1,${TITLE_MAX}})》[ \\t]*(?:\\r?\\n|$)`);
export function titleSplit(rest) {
  const text = String(rest || "");
  const m = TITLE_LINE.exec(text);
  if (!m || !m[1].trim()) return { title: "", prompt: text.trim() };
  return { title: m[1].trim(), prompt: text.slice(m[0].length).trim() };
}

// 把一条（[SPLIT] 隔开的那一段）里的画摘出来：回 { before, prompt, ratio, title }（before 是记号前面的字，照常拆），没有画就是 null。
// 一条里只认头一个记号：后面再写的 [DRAW] 也算“画什么”里的字（要画两张，用 [SPLIT] 隔成两条）
export function splitDraw(chunk) {
  const text = String(chunk);
  const m = MARK.exec(text);
  if (!m) return null;
  const { title, prompt } = titleSplit(text.slice(m.index + m[0].length));
  return { before: text.slice(0, m.index), prompt, ratio: m[1] || "", title };
}

// 一张画的名字：那一条回话的 id 加第几样（跟语音条一样，见 voice.js 的 voiceKeyOf）
export const drawKeyOf = (msgId, j) => `${msgId}.${j}`;
// 画好的那一张存成照片：kfs2:img:draw.<那一条回话的 id>.<第几样>
export const drawImgOf = (key) => `draw.${key}`;

// 一样画：画什么、名字。有名字以前拆的（还有旧的闹钟拆的），名字那一行还在画什么里头：这里摘出来（画的时候不把名字交出去）
export function drawOf(it) {
  if (!it || it.type !== "draw") return { prompt: "", title: "" };
  if (it.title) return { prompt: String(it.prompt || ""), title: String(it.title).slice(0, TITLE_MAX) };
  const t = titleSplit(it.prompt);
  return t.title && t.prompt ? t : { prompt: String(it.prompt || ""), title: "" };
}

// 一条回话里的画：[{ key, prompt, ratio, title }]
export function drawsIn(m) {
  const out = [];
  if (!m || m.role !== "him") return out;
  (m.items || []).forEach((it, j) => {
    if (it && it.type === "draw" && it.prompt) {
      const d = drawOf(it);
      out.push({ key: drawKeyOf(m.id, j), prompt: d.prompt, ratio: it.ratio || "", title: d.title });
    }
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
export const DRAW_RULE = `想给她画一张画的时候，单独一行写 [DRAW]，给这张画起个名字，用书名号写在 [DRAW] 同一行的后面，比如 [DRAW]《月下读书》，然后另起一行写这张画要画什么（可以写好几行，到这一条完为止）。名字会摆在开封府的图画院里，跟这张画放在一起，她看得到。开封府会替你交给 ElevenLabs 画出来，画一张要半分钟上下；画好了在聊天里摆成一张图，她点开能看大图，她下一回说话的时候你也会看到画成了什么样。画什么那几行她看不见，她只看得到画：想跟她说的话写在 [DRAW] 前面，或者另起一条。画什么写得具体一点：画面里有什么、什么风格、颜色和光线，中文英文都行；别画真人的样子。要竖的写 [DRAW:竖]《名字》，横的写 [DRAW:横]《名字》，不写是方的。一条里只画一张，要画两张就用 [SPLIT] 隔成两条。画一张花她一点 ElevenLabs 的额度。画不画、画什么，你自己决定。`;

// API 面板里“试画一张”画的那一张
export const DRAW_SAMPLE = "一只小狐狸坐在窗边的书案前读书，穿紫色的宋代圆领袍，戴展脚幞头，窗外是夜里的月亮和几枝花，水彩画，暖色的灯光";
