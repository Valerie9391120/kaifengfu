// =====================================================
// 藏音匣（卿卿和恩师 10 月 15 日一起想的，16、17 日在原型上一样一样改定的，见开发说明“藏音匣”那一节）。
// 聊天里长按他的语音条“存入藏音匣”，拷一份出来；南衙里点进去：一只线描的小匣子，点一下抽出一张锦灰堆残纸，
// 往上划是一根线串起来的全部。
// 这里只有不碰页面的零件：存在哪儿、一条什么样、怎么排、日期怎么写、抽哪一条、一句话怎么截短。
// 测试在 Node 里跑（tests/cangyin.test.mjs）。
// =====================================================

// 一条：kfs2:cyx:<编号>，内容 { v: 1, src, chat, at, text, dur, saved }，加密了跟着云端走。
//   src：从哪一条语音存进来的（voice.js 的 voiceKeyOf：那一条回话的 id.第几样），聊天里长按的时候认“存过没有”用
//   chat：那段对话的编号（只是记着，删了对话这一条照样在）
//   at：他说那一句的时候（毫秒；纸条和列表上的日期都是这个，不是存进来的时候）
//   text：转出来的字（voice.js 的 heardOf：语气标签摘干净；只有语气标签的那种写“……”）
//   dur：几秒；saved：存进来的时候
// 纸条上的繁体不存在这里：每台设备点开藏音匣的时候自己转、自己记着（CangyinPage.jsx 的 TRAD_KEY）。
// 存进来以后这一条就不再改（改了要跟别的设备上的“移出”打架：那边删了、这边一改又冒出来）
export const BOX_KEY = "kfs2:cyx:";
// 那一条的声音：kfs2:cyxa:<编号>，跟 kfs2:voice: 里一模一样（voice.js 的 packVoice），存进来的那一下从那边整份拷过来。
// 另存一份是卿卿点过头的：删了对话、他那一条语音没了，藏音匣里的还在
export const BOX_AUDIO = "kfs2:cyxa:";
export const BOX_TEXT_MAX = 2000;

export function packEntry(e) {
  return JSON.stringify({
    v: 1,
    src: String(e.src || ""),
    chat: String(e.chat || ""),
    at: Math.max(0, Number(e.at) || 0),
    text: String(e.text || "").slice(0, BOX_TEXT_MAX),
    dur: Math.round(Math.max(0, Number(e.dur) || 0) * 10) / 10,
    saved: Math.max(0, Number(e.saved) || 0),
  });
}
// 存进来的字：转出来的那些；只有语气标签（[soft chuckle] 这种，念出来是一声笑）摘干净就没字了，写“……”
export const keptText = (heard) => String(heard || "").trim() || "……";

// 读一条：认不出来的给 null（不当一条摆出来）
export function readEntry(id, text) {
  try {
    const d = JSON.parse(text);
    if (!d || d.v !== 1 || typeof d.text !== "string" || !d.text.trim()) return null;
    const s = (x) => (typeof x === "string" ? x : "");
    return {
      id: String(id),
      src: s(d.src),
      chat: s(d.chat),
      at: Math.max(0, Number(d.at) || 0),
      text: d.text.slice(0, BOX_TEXT_MAX),
      dur: Math.max(0, Number(d.dur) || 0),
      saved: Math.max(0, Number(d.saved) || 0),
    };
  } catch (e) {
    return null;
  }
}

// 存档里那一串（[钥匙, 内容]）里认得出来的每一条（不去重）
function readAll(pairs) {
  const out = [];
  for (const [k, v] of pairs || []) {
    if (!k || !String(k).startsWith(BOX_KEY) || v == null) continue;
    const e = readEntry(String(k).slice(BOX_KEY.length), v);
    if (e) out.push(e);
  }
  return out;
}
// 同一条语音存过两回的（两台设备还没同步上的时候各存了一回），先存的那一条算数
const earlier = (a, b) => a.saved < b.saved || (a.saved === b.saved && a.id < b.id);

// 存档里那一串（[钥匙, 内容]）→ 一条一条，从新到旧（照他说的时候；同一刻的照存进来的先后）。
// 同一条语音存过两回的只摆先存的那一条
export function listEntries(pairs) {
  const all = readAll(pairs);
  const first = new Map();
  for (const e of all) if (e.src && (!first.has(e.src) || earlier(e, first.get(e.src)))) first.set(e.src, e);
  return all
    .filter((e) => !e.src || first.get(e.src) === e)
    .sort((a, b) => b.at - a.at || b.saved - a.saved || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// 移出一条：同一条语音存过两回的，几回一起移出（不然移出了一条，藏着的另一条又冒出来）
export function sameVoiceIds(pairs, id) {
  const all = readAll(pairs);
  const me = all.find((e) => e.id === String(id));
  if (!me || !me.src) return [String(id)];
  return all.filter((e) => e.src === me.src).map((e) => e.id);
}

// 聊天里长按的那一条语音存过没有：存过的那一条（同一条存过两回的，给先存的那条）
export function findBySrc(list, src) {
  if (!src) return null;
  let hit = null;
  for (const e of list) if (e.src === src && (!hit || earlier(e, hit))) hit = e;
  return hit;
}

// 南衙那一行的小字
export const boxSub = (n) => (n > 0 ? `藏了 ${n} 条` : "还空着");

// ---------- 日期、几秒 ----------
const pad = (n) => String(n).padStart(2, "0");
const CN = "〇一二三四五六七八九";
export const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
// 一到三十一写成汉字：十、十四、二十、二十八、三十一
export function cnNum(n) {
  n = Math.floor(Number(n) || 0);
  if (n < 10) return CN[Math.max(0, n)];
  if (n === 10) return "十";
  if (n < 20) return "十" + CN[n - 10];
  return CN[Math.floor(n / 10) % 10] + "十" + (n % 10 ? CN[n % 10] : "");
}
// 纸条右下角：二〇二六年十月十四日
export function cnDate(ms) {
  const d = new Date(ms);
  return `${[...String(d.getFullYear())].map((c) => CN[+c]).join("")}年${cnNum(d.getMonth() + 1)}月${cnNum(d.getDate())}日`;
}
// 列表里：2026 / 10 / 14
export function dayOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()} / ${pad(d.getMonth() + 1)} / ${pad(d.getDate())}`;
}
// 列表里多长：6秒、1分12秒、1分钟
export function lenOf(sec) {
  const s = Math.max(1, Math.round(Number(sec) || 0));
  if (s < 60) return `${s}秒`;
  return `${Math.floor(s / 60)}分${s % 60 ? (s % 60) + "秒" : "钟"}`;
}
// 列表里按月断开的那一行：今年的写“十月”，别的年份写“2025 年 十二月”
export function monthOf(ms, nowYear) {
  const d = new Date(ms);
  return `${d.getFullYear() !== nowYear ? d.getFullYear() + " 年 " : ""}${MONTHS[d.getMonth()]}`;
}
// 同一个月（列表里那一段）的记号
export const monthKey = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() * 12 + d.getMonth();
};

// ---------- 抽哪一条 ----------
// 照一个字串种出来的随机数（同一条语音配的残纸一直是同一张）
export function rngOf(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
export const PAPERS = 5; // 恩师画的锦灰堆残纸，五张
export const paperOf = (id) => Math.min(PAPERS - 1, Math.floor(rngOf("paper-" + id)() * PAPERS));
// 随机抽一条：不跟上一回抽到的同一条（只有一条的时候除外）
export function pickFrom(list, lastId, rnd = Math.random) {
  if (!list || !list.length) return null;
  const pool = list.length > 1 ? list.filter((e) => e.id !== lastId) : list;
  const from = pool.length ? pool : list;
  return from[Math.min(from.length - 1, Math.floor(rnd() * from.length))];
}

// ---------- 一句话截成一行 ----------
// 收着的时候一句话一行：放得下就整句（带前后引号），放不下就截短，省略号紧挨着后引号（“……”），
// 截的地方不留逗号句号。width(t) 量一段字多宽，从外头递进来（页面上用画布量）
export function cutQuote(text, width, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const full = "“" + t + "”";
  if (width(full) <= max) return full;
  const chars = [...t];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (width("“" + chars.slice(0, m).join("") + "…”") <= max) lo = m;
    else hi = m - 1;
  }
  return "“" + chars.slice(0, lo).join("").replace(/[，。、；：,.;:！？!?…\s]+$/u, "") + "…”";
}
