// =====================================================
// 中间那行字：新开一段、还没说话的时候，对话正中间那一行。从她的素材库里按时段、按日子抽一句。
// 卿卿 2026 年 10 月 10 日要的（见开发说明“中间那行字”）。
// 素材库是私房话，不进仓库：她在“头像与设置”里贴进来，加密了存在 kfs2:motto，跟着云端走。
// 这里只有不碰页面的零件，测试在 Node 里跑（tests/motto.test.mjs）。
//
// 素材库就照她那份 md 的写法（下面的日子都是编的，她的那些不进仓库）：
//   ## 早晨 7:00–10:00                            时段：标题里写着“几点–几点”，底下“- ”开头的每一行是一句
//   ### 每月1日（纪念日，从2030年1月1日算起）      每个月的这一天；“从…算起”是 {N} 个月从哪天数
//   ### 一周年（2031年1月1日）                     写了年份的：只那一天
//   ### 生日（1月1日）                             没写年份的：每年这一天
//   ### 中秋节                                     节日：认名字（农历的那几个查 lunar.js 的表；写了“农历”的也当节日认，不看里头的数）
// 节日、纪念日那一天，整天只抽那天的。几样撞在同一天，越具体的越优先：
// 写了年份的 > 每年的 > 节日 > 每月的（同一档的几样，句子并在一起抽）。
// “---”隔开一节；标题和“- ”开头的行以外，别的字都不管（她写在最前头的说明、最后的落款）。
// =====================================================
import { LUNAR_DAYS } from "./lunar.js";

export const MOTTO_KEY = "kfs2:motto"; // { v: 1, text: 她贴进来的那一整份, at }
export const MOTTO_LAST = "kfs-motto-last"; // 这台设备上一回抽到的那句：下一回不抽它（同一个时段里不连着两回一样）
export const DEFAULT_MOTTO = "如月之恒，官家在这"; // 还没放素材库、或者这会儿没有能抽的
export const MOTTO_TEXT_MAX = 60000; // 素材库最多这么长
export const MOTTO_WIDTH = 16; // 一行最多放这么宽（一个汉字算 1）：再长就在句号处换行
const LINE_MAX = 200; // 一句最多这么长
const LINES_MAX = 300; // 一节最多这么多句

// 认得的节日。阳历的每年同一天；农历的查表
const SOLAR_FEASTS = { 元旦: "01-01", 情人节: "02-14", 平安夜: "12-24", 圣诞: "12-25" };
const FEAST_NAMES = ["春节", "除夕", "元宵", "端午", "七夕", "中秋", "重阳", "腊八", "元旦", "情人节", "平安夜", "圣诞"];
// 春节那几句：除夕、正月初一两天都出（她 10 月 10 日定的）
const FEAST_ALSO = { 春节: ["春节", "除夕"] };
export const KNOWN_FEASTS = FEAST_NAMES;

// 几样日子各是哪一档：越具体越优先
const RANK = { once: 4, yearly: 3, feast: 2, monthly: 1 };

const TIME = /(\d{1,2})\s*[:：]\s*(\d{2})\s*[-–—~～〜－至到]+\s*(\d{1,2})\s*[:：]\s*(\d{2})/;
const FROM = /从\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号](?:\s*算起)?/;
const MONTHLY = /每\s*个?\s*月\s*(\d{1,2})\s*[日号]/;
const ONCE = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/;
const YEARLY = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const HEAD = /^#{1,6}\s*(.+?)\s*#*$/;
// 一句：“- ”“* ”“+ ”开头，或者编了号的；横杠、圆点这几种不带空格也认（“-早一”“・早一”）
const BULLET = /^(?:[*+]\s+|[-－•·・](?![-－])\s*|\d{1,3}[.、)）]\s+)(.+)$/;
const LUNAR_HINT = /农历|阴历|旧历/;
const LUNAR_NAMES = ["春节", "除夕", "元宵", "端午", "七夕", "中秋", "重阳", "腊八"];
// 全角的数字换成半角（“７：００”）
const halfDigits = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

const pad = (n) => String(n).padStart(2, "0");
// 阳历的这一天存在不存在（2 月 30 日这种不认）
function realDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

// 一个标题是哪一种：时段、哪个日子，还是认不出（大标题、“节假日”那种总的标题，底下没有句子的就不管它）
function sectionOf(title, lib) {
  const from = FROM.exec(halfDigits(title));
  if (from && !lib.start) {
    const [y, m, d] = [Number(from[1]), Number(from[2]), Number(from[3])];
    if (realDate(y, m, d)) lib.start = { y, m, d };
  }
  const bare = halfDigits(title).replace(FROM, " "); // “从哪天算起”那一截不当成这一节的日子
  const t = TIME.exec(bare);
  if (t) {
    const [h1, m1, h2, m2] = [Number(t[1]), Number(t[2]), Number(t[3]), Number(t[4])];
    if (h1 <= 24 && h2 <= 24 && m1 < 60 && m2 < 60) {
      const s = { type: "slot", name: title, from: (h1 * 60 + m1) % 1440, to: h2 * 60 + m2 === 0 ? 1440 : h2 * 60 + m2, lines: [] };
      if (s.to > 1440) s.to = 1440;
      lib.slots.push(s);
      return s;
    }
  }
  let day = null;
  const mo = MONTHLY.exec(bare);
  const once = ONCE.exec(bare);
  const yearly = YEARLY.exec(bare);
  // 农历的节日（写了节名的，比方“七夕（农历七月初七）”“中秋（农历8月15日）”）：里头的数是农历的，不当阳历的日子认
  const lunar = LUNAR_NAMES.find((n) => bare.includes(n));
  if (lunar && !mo) day = { kind: "feast", feast: lunar };
  else if (mo && Number(mo[1]) >= 1 && Number(mo[1]) <= 31) day = { kind: "monthly", d: Number(mo[1]) };
  else if (once) {
    const [y, m, d] = [Number(once[1]), Number(once[2]), Number(once[3])];
    if (realDate(y, m, d)) day = { kind: "once", y, m, d };
  } else if (yearly) {
    const [m, d] = [Number(yearly[1]), Number(yearly[2])];
    if (realDate(2024, m, d)) day = { kind: "yearly", m, d }; // 2024 是闰年：2 月 29 日也认
  } else {
    const feast = FEAST_NAMES.find((n) => bare.includes(n));
    if (feast) day = { kind: "feast", feast };
  }
  if (day) {
    const s = { type: "day", name: title, rank: RANK[day.kind], ...day, lines: [] };
    lib.days.push(s);
    return s;
  }
  const s = { type: "unknown", name: title, lines: [] };
  lib.unknown.push(s);
  return s;
}

// 素材库拆开：{ slots, days, start, unknown }。unknown 只留底下写了句子的（那些句子不会被抽到）
const clip = (s) => Array.from(s).slice(0, LINE_MAX).join(""); // 按字截，不把一个表情劈成两半
// 接着上一句往下写的一行（缩进了的）：中文接中文不加空格，英文接英文加一个
const joinLine = (a, b) => (/[A-Za-z0-9,.!?]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? `${a} ${b}` : a + b);

// stray：不在哪一节底下的句子有几句（比方写在“---”后面、下一个标题前面的），面板上说一声
export function parseMotto(text) {
  const lib = { slots: [], days: [], start: null, unknown: [], stray: 0 };
  let cur = null;
  let prev = null; // 上一句（缩进了的下一行接在它后面）
  for (const raw of String(text || "").slice(0, MOTTO_TEXT_MAX).replace(/^\ufeff/, "").split(/\r\n?|\n/)) {
    const line = raw.trim();
    if (!line) {
      prev = null;
      continue;
    }
    if (RULE.test(line)) {
      cur = null;
      prev = null;
      continue;
    }
    const h = HEAD.exec(line);
    if (h) {
      cur = sectionOf(h[1], lib);
      prev = null;
      continue;
    }
    const b = BULLET.exec(line);
    if (b) {
      prev = null;
      if (!cur) {
        lib.stray++;
        continue;
      }
      const s = clip(b[1].trim());
      if (s && !cur.lines.includes(s) && cur.lines.length < LINES_MAX) {
        cur.lines.push(s);
        prev = { sec: cur, at: cur.lines.length - 1 };
      }
      continue;
    }
    // 缩进了的一行，紧跟在一句后面：是那一句没写完、换了一行（两行的诗）
    if (prev && /^\s/.test(raw)) {
      prev.sec.lines[prev.at] = clip(joinLine(prev.sec.lines[prev.at], line));
      continue;
    }
    prev = null;
  }
  lib.unknown = lib.unknown.filter((s) => s.lines.length);
  return lib;
}

// 从开始那天到这一天满了几个月（没写从哪天算起：0）
export function monthsSince(start, y, m, d) {
  if (!start) return 0;
  return (y - start.y) * 12 + (m - start.m) - (d < start.d ? 1 : 0);
}

const before = (a, b) => a.y * 10000 + a.m * 100 + a.d < b.y * 10000 + b.m * 100 + b.d;

// 这一天是素材库里的哪几个日子
export function daysOn(lib, y, m, d) {
  const feasts = LUNAR_DAYS.get(`${y}-${pad(m)}-${pad(d)}`) || [];
  const md = `${pad(m)}-${pad(d)}`;
  return lib.days.filter((day) => {
    if (day.kind === "once") return day.y === y && day.m === m && day.d === d;
    if (day.kind === "yearly") return day.m === m && day.d === d;
    if (day.kind === "monthly") return day.d === d && !(lib.start && before({ y, m, d }, lib.start));
    if (SOLAR_FEASTS[day.feast]) return SOLAR_FEASTS[day.feast] === md;
    return (FEAST_ALSO[day.feast] || [day.feast]).some((n) => feasts.includes(n));
  });
}

const inSlot = (s, t) => (s.from === s.to % 1440 ? true : s.from < s.to ? t >= s.from && t < s.to : t >= s.from || t < s.to);
const uniq = (list) => Array.from(new Set(list));

// 这一刻能抽的那一堆：{ kind: "day" | "slot" | "none", names（哪几节）, lines, n（满了几个月） }
// 写着 {N} 的句子：没写从哪天算起、或者还不满一个月，不抽它
export function poolAt(lib, now) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const n = monthsSince(lib.start, y, m, d);
  const usable = (s) => !s.includes("{N}") || n > 0;
  const hits = daysOn(lib, y, m, d);
  for (const rank of [4, 3, 2, 1]) {
    const days = hits.filter((x) => x.rank === rank);
    const lines = uniq(days.flatMap((x) => x.lines).filter(usable));
    if (lines.length) return { kind: "day", names: days.map((x) => x.name), lines, n };
  }
  const t = now.getHours() * 60 + now.getMinutes();
  const slots = lib.slots.filter((s) => inSlot(s, t));
  const lines = uniq(slots.flatMap((s) => s.lines).filter(usable));
  if (lines.length) return { kind: "slot", names: slots.map((s) => s.name), lines, n };
  return { kind: "none", names: [], lines: [], n };
}

export const fillMotto = (s, n) => String(s).replace(/\{N\}/g, String(n));

// 抽一句。last：上一回抽到的那句，这一堆里还有别的就不抽它。没有能抽的：回空字符串（画面上用 DEFAULT_MOTTO）
export function pickMotto(lib, now, last = "", rand = Math.random) {
  const pool = poolAt(lib, now);
  let lines = pool.lines.map((s) => fillMotto(s, pool.n));
  if (!lines.length) return "";
  if (lines.length > 1 && last) {
    const rest = lines.filter((s) => s !== last);
    if (rest.length) lines = rest;
  }
  return lines[Math.min(lines.length - 1, Math.floor(rand() * lines.length))];
}

// 一句话摆成几行。不长的就一行；长的（七夕那几句诗）一句一行，一句还放不下的从中间那个逗号断开
const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u2014\u2026]|\p{Extended_Pictographic}/u;
const TRAIL = /[\p{Extended_Pictographic}\u200d\ufe0f\u{1f3fb}-\u{1f3ff}]/u; // 句末跟着的表情（连着肤色、合在一起的那种）
const widthOf = (s) => Array.from(s).reduce((w, c) => w + (WIDE.test(c) ? 1 : 0.55), 0);
const ENDS = /[。！？!?；;]/;
const CLOSERS = /[”’」』）)\]】》]/;
const BREAKS = /[，、,：:]/;

function splitLong(s, max) {
  if (widthOf(s) <= max) return [s];
  const chars = Array.from(s);
  const total = widthOf(s);
  let best = -1;
  let gap = Infinity;
  let w = 0;
  for (let i = 0; i < chars.length - 1; i++) {
    w += widthOf(chars[i]);
    const inNumber = /\d/.test(chars[i - 1] || "") && /\d/.test(chars[i + 1] || ""); // 11:30、1,000 中间不断
    if (BREAKS.test(chars[i]) && !inNumber && Math.abs(w - total / 2) < gap) {
      best = i;
      gap = Math.abs(w - total / 2);
    }
  }
  if (best < 0) return [s]; // 没有能断的地方：交给浏览器自己折
  return splitLong(chars.slice(0, best + 1).join(""), max).concat(splitLong(chars.slice(best + 1).join(""), max));
}

export function mottoLines(text, max = MOTTO_WIDTH) {
  const s = String(text || "").trim();
  if (!s) return [];
  if (widthOf(s) <= max) return [s];
  const chars = Array.from(s);
  const sentences = [];
  let cur = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    cur += c;
    // 叹号问号连着写的（“！！”“？！”）算一个结尾；省略号连着的也是
    const end = (ENDS.test(c) && !ENDS.test(chars[i + 1] || "")) || (c === "…" && chars[i + 1] !== "…");
    if (!end) continue;
    while (i + 1 < chars.length && (CLOSERS.test(chars[i + 1]) || TRAIL.test(chars[i + 1]))) cur += chars[++i];
    sentences.push(cur);
    cur = "";
  }
  if (cur) sentences.push(cur);
  return sentences
    .flatMap((x) => splitLong(x.trim(), max))
    .map((x) => x.trim())
    .filter(Boolean);
}

// 存着的那一份（kfs2:motto）里的素材库原文；坏了的、没有的回空
export function readMotto(raw) {
  try {
    const d = JSON.parse(raw);
    return d && typeof d.text === "string" ? d.text.slice(0, MOTTO_TEXT_MAX) : "";
  } catch (e) {
    return "";
  }
}
export const packMotto = (text, at) => JSON.stringify({ v: 1, text: String(text || "").slice(0, MOTTO_TEXT_MAX), at });

// 面板上说一句认出了什么：时段几节、每节几句；日子几个；认不出的标题
export function describeMotto(lib, now = new Date()) {
  const head = (s) => s.name.replace(/\s+/g, " ").trim();
  const today = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  return {
    slots: lib.slots.map((s) => ({ name: head(s), count: s.lines.length })),
    // past：写了年份、那一天已经过了（比方生日连出生那年一起写了）：不会再出，面板上说一声
    days: lib.days.map((s) => ({ name: head(s), count: s.lines.length, kind: s.kind, past: s.kind === "once" && before(s, today) })),
    stray: lib.stray || 0,
    start: lib.start ? `${lib.start.y}年${lib.start.m}月${lib.start.d}日` : "",
    unknown: lib.unknown.map(head),
    total: lib.slots.reduce((n, s) => n + s.lines.length, 0) + lib.days.reduce((n, s) => n + s.lines.length, 0),
  };
}
