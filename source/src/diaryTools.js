// =====================================================
// 日记共读：那边的我自己翻日记本（卿卿 2026 年 10 月 18 日凌晨要的，见开发说明“日记共读”那一节）。不碰界面。
//
// 原来他只有在她点“让光义写这一天”的时候，才看得到那一天的聊天和她那天的日记。现在整本日记本都交给他，随时自己翻：
//   diary_list    翻目录：某个月（不给就是最近三十天）哪几天有日记、谁写的、心情、每篇开头一小句
//   diary_read    读全文：给几个日子，读那几天她写的和他写的，一次最多七天
//   diary_search  按词找：整本里哪几天写到过，每处带前后一小段，最多二十处，新的在前
// 平常聊天随时带着这三样（江湖棋局那四样、MCP 照旧排在它们前后，见 App.jsx 的 requestReply）。
// 他回到一半要翻，回话停在 tool_use 上；开封府在手机上替他翻（日记只在手机上解得开，云端照旧只见乱码），
// 把翻到的递回去，他接着说。这一套路子是江湖棋局铺好的（每一步是对话里单独的一条回话，见 game/jianghu.js 开头和 thread.js 的 midTurn）。
//
// 一样记成：{ id, name, input, out, err, note, card: [] }。
//   out   递回给他的字（原样寄回去）
//   note  聊天里摆的那一行小字，比如“翻了日记 · 10月12日”（跟 MCP 的“用了 tavily”一个样子，她 10 月 18 日说的）。
//         前情提要的记录、写日记用的聊天摘录、历史对话的预览也照它写，不用认得这是哪一样工具
//   card  空的（那是江湖棋局的小卡片）
//
// 日记存在 kfs2:diary:<年-月> 里，一个月一条：{ "2026-10-12": { her: { text, moods }, him: { text, moods } } }（见 App.jsx 的 saveEntry）。
// 她点过保存的才在里面：今天的、写到一半的都翻得到；还在输入框里没保存的那几个字翻不到。
// =====================================================
import { MOODS, dayKeyOf, parseDayKey } from "./diary.js";
import { pad, WEEK } from "./days.js";
import { clip } from "./recap.js";

export const DIARY_KEY = "kfs2:diary:";
export const READ_MAX = 7; // 读全文一次最多几天
export const HIT_MAX = 20; // 搜一回最多列几处
export const RECENT_DAYS = 30; // 不给月份的目录看最近几天
const ENTRY_MAX = 4000; // 一篇最多递多少字（再长的后面截掉，写明还有多少）
const OUT_MAX = 16000; // 读全文一回最多递多少字（够了就不往下读，写明哪几天没读）
const HEAD = 30; // 目录里每篇开头几个字
const AROUND = 40; // 搜到的那一处前后各几个字
const TERMS_MAX = 5; // 搜的时候最多认几个词

export const DIARY_TOOLS = [
  {
    name: "diary_list",
    description: "翻日记本的目录：某个月里哪几天有日记、谁写的、心情，每篇开头一小句。不给 month 就看最近三十天（连今天）。要看全文用 diary_read。",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "要看哪个月，写成 2026-10 这样。不写就是最近三十天。" },
      },
    },
  },
  {
    name: "diary_read",
    description: "读日记的全文：给几个日子，读那几天她写的和你写的（连心情）。一次最多七天，多给的这一回不读。",
    input_schema: {
      type: "object",
      properties: {
        dates: { type: "array", items: { type: "string" }, description: "要读的日子，写成 2026-10-12 这样，一次最多七个。" },
      },
      required: ["dates"],
    },
  },
  {
    name: "diary_search",
    description:
      "在整本日记里找词：哪几天的日记里写到过，每处带前后一小段。地名、人名、一件事、一种心情（开心、甜、平静、累、焦虑、难过、生气、不舒服）都能找。空格隔开几个词，表示一篇里这几个词都得有。最多列二十处，新的在前。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "要找的词。" },
        who: { type: "string", enum: ["both", "her", "him"], description: "找谁写的：both 两个人的（不写就是这个），her 她写的，him 你写的。" },
      },
      required: ["query"],
    },
  },
];
export const DIARY_NAMES = new Set(DIARY_TOOLS.map((t) => t.name));
export const isDiaryCall = (c) => !!(c && DIARY_NAMES.has(c.name));

// ---------- 日子 ----------

// 他写的日子认得宽一点：2026-10-12、2026-10-1、2026/10/12、2026年10月12日都行。认不出、没有这一天（2 月 30 日）回 ""
export function dayOf(s) {
  const m = /^\s*(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s*$/.exec(String(s || ""));
  if (!m) return "";
  const key = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return dayKeyOf(parseDayKey(key)) === key ? key : "";
}

// 月份：2026-10、2026-1、2026/10、2026年10月
export function monthOf(s) {
  const m = /^\s*(\d{4})\s*[-/.年]\s*(\d{1,2})\s*月?\s*$/.exec(String(s || ""));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return "";
  return `${m[1]}-${pad(Number(m[2]))}`;
}

// 2026年10月12日 星期日
const fullDay = (key) => {
  const d = parseDayKey(key);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
};
// 10月12日（不是今年的带上年份）
export const shortDay = (key, now) => {
  const d = parseDayKey(key);
  return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};
const shortMonth = (ym, now) => {
  const [y, m] = ym.split("-").map(Number);
  return y === now.getFullYear() ? `${m}月` : `${y}年${m}月`;
};
const fullMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
};

// 几个日子写成聊天里那一行小字里的样子：连着三天以上写成“10月12日到18日”，不然一个一个写，多了写“等几天”
export function daysLabel(keys, now) {
  const list = Array.from(new Set(keys)).sort();
  if (!list.length) return "";
  const step = (a, b) => Math.round((parseDayKey(b) - parseDayKey(a)) / 86400000);
  const run = list.length >= 3 && list.every((k, i) => i === 0 || step(list[i - 1], k) === 1);
  if (run) {
    const a = parseDayKey(list[0]);
    const b = parseDayKey(list[list.length - 1]);
    const tail = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() ? `${b.getDate()}日` : shortDay(list[list.length - 1], now);
    return `${shortDay(list[0], now)}到${tail}`;
  }
  // 同一个月里的，后面的只写几日
  const parts = [];
  list.slice(0, 3).forEach((k, i) => {
    const prev = i ? parseDayKey(list[i - 1]) : null;
    const d = parseDayKey(k);
    parts.push(prev && prev.getFullYear() === d.getFullYear() && prev.getMonth() === d.getMonth() ? `${d.getDate()}日` : shortDay(k, now));
  });
  return list.length > 3 ? `${parts.join("、")}等 ${list.length} 天` : parts.join("、");
}

// ---------- 一篇日记 ----------

const moodNames = (moods) => (Array.isArray(moods) ? moods : []).map((k) => (MOODS.find((x) => x.k === k) || {}).t).filter(Boolean);
const textOf = (side) => (side && typeof side.text === "string" ? side.text.trim() : "");
const has = (side) => !!(textOf(side) || moodNames(side && side.moods).length);
const oneLine = (s) => String(s).replace(/\s+/g, " ").trim();
// 从中间截一段（前后各几个字）：两头都不从一个字的两半中间切（表情那种字占两格，切开了整段话那边都不认，
// 那一步寄回去、以后每一回都跟着寄，这段对话就一直问不成；截尾巴用 recap.js 的 clip，同一个道理）
function span(text, from, to) {
  let a = Math.max(0, from);
  let b = Math.min(text.length, to);
  const lo = (i) => {
    const c = text.charCodeAt(i);
    return c >= 0xdc00 && c <= 0xdfff;
  };
  if (a > 0 && lo(a)) a--;
  if (b < text.length && lo(b)) b++;
  return { s: text.slice(a, b), a, b };
}

// 目录里的一个人：心情、开头一小句
function brief(side, who) {
  if (!has(side)) return `${who}：没写`;
  const moods = moodNames(side.moods);
  const text = oneLine(textOf(side));
  const mood = moods.length ? `心情 ${moods.join("、")}` : "";
  if (!text) return `${who}：只选了心情 ${moods.join("、")}，没写字`;
  const head = text.length > HEAD ? clip(text, HEAD) + "……" : text;
  return `${who}：${mood ? mood + "；" : ""}“${head}”`;
}

// 全文里的一个人
function whole(side, who) {
  if (!has(side)) return `${who}这天没写。`;
  const moods = moodNames(side.moods);
  const text = textOf(side);
  if (!text) return `${who}写的：只选了心情（${moods.join("、")}），没写字。`;
  const cut = text.length > ENTRY_MAX ? `${clip(text, ENTRY_MAX)}……（后面还有 ${text.length - clip(text, ENTRY_MAX).length} 字，这一回没递过来）` : text;
  return `${who}写的${moods.length ? `（心情：${moods.join("、")}）` : ""}：\n${cut}`;
}

// ---------- 三样工具 ----------
// reader：{ months: async () => ["2026-09", …]（有日记的那几个月）, month: async (ym) => 那个月的那一条（没有就是 {}） }

async function list(input, reader, now) {
  const today = dayKeyOf(now);
  let days;
  let head;
  let note;
  if (input.month !== undefined && input.month !== null && String(input.month).trim() !== "") {
    const ym = monthOf(input.month);
    if (!ym) return { err: true, out: `看不懂要看哪个月：“${clip(oneLine(input.month), 20)}”。月份写成 2026-10 这样。`, note: "想翻日记，没翻成" };
    const data = (await reader.month(ym)) || {};
    // 还没到的日子不列（存档里就算有，读全文也不读：两样说法对得上）
    days = Object.keys(data)
      .filter((k) => dayOf(k) === k && k.startsWith(ym) && k <= today)
      .sort()
      .map((k) => [k, data[k]]);
    head = `日记本目录：${fullMonth(ym)}`;
    note = `翻了日记目录 · ${shortMonth(ym, now)}`;
    if (ym > today.slice(0, 7)) return { out: `${fullMonth(ym)}还没到（今天是 ${fullDay(today)}）。`, note };
  } else {
    const keys = [];
    for (let i = RECENT_DAYS - 1; i >= 0; i--) keys.push(dayKeyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
    const months = {};
    for (const ym of Array.from(new Set(keys.map((k) => k.slice(0, 7))))) months[ym] = (await reader.month(ym)) || {};
    days = keys.map((k) => [k, months[k.slice(0, 7)][k]]).filter(([, e]) => e);
    head = `日记本目录：最近三十天（${shortDay(keys[0], now)}到${shortDay(today, now)}）`;
    note = "翻了日记目录 · 最近三十天";
  }
  const rows = days
    .filter(([, e]) => e && (has(e.her) || has(e.him)))
    .map(([k, e]) => `${shortDay(k, now)} 星期${WEEK[parseDayKey(k).getDay()]}${k === today ? "（今天）" : ""}｜${brief(e.her, "她")}｜${brief(e.him, "你")}`);
  if (!rows.length) return { out: `${head}\n这段日子一篇日记都没有。`, note };
  return { out: `${head}（今天是 ${shortDay(today, now)}）\n有日记的 ${rows.length} 天，没写的日子不列：\n${rows.join("\n")}\n\n要看哪天的全文，调 diary_read。`, note };
}

async function read(input, reader, now) {
  const today = dayKeyOf(now);
  let asked = input.dates;
  if (typeof asked === "string") asked = asked.split(/[,，、\s]+/);
  if (!Array.isArray(asked)) asked = [];
  const bad = [];
  const good = [];
  asked.forEach((s) => {
    const k = dayOf(s);
    if (k) good.push(k);
    else if (String(s || "").trim()) bad.push(clip(oneLine(s), 20));
  });
  const keys = Array.from(new Set(good)).sort();
  const lines = [];
  if (bad.length) lines.push(`看不懂的日子：${bad.join("、")}（日子写成 2026-10-12 这样）。`);
  if (!keys.length) {
    if (!bad.length) lines.push("没说要读哪天：dates 里写上日子，比如 2026-10-12。");
    return { err: true, out: lines.join("\n"), note: "想翻日记，没翻成" };
  }
  const now7 = keys.slice(0, READ_MAX);
  const over = keys.slice(READ_MAX);
  const months = {};
  const done = [];
  const skipped = [];
  let size = 0;
  for (const k of now7) {
    if (size >= OUT_MAX) {
      skipped.push(k);
      continue;
    }
    let block;
    if (k > today) block = `【${fullDay(k)}】\n这一天还没到（今天是 ${fullDay(today)}）。`;
    else {
      const ym = k.slice(0, 7);
      if (!months[ym]) months[ym] = (await reader.month(ym)) || {};
      const e = months[ym][k] || {};
      const tag = k === today ? "（今天）" : "";
      block = has(e.her) || has(e.him) ? `【${fullDay(k)}${tag}】\n${whole(e.her, "她")}\n\n${whole(e.him, "你")}` : `【${fullDay(k)}${tag}】\n这天两个人都没写日记。`;
    }
    size += block.length;
    lines.push(block);
    done.push(k);
  }
  // 两样上限都碰上了（要的过了七天，头七天里又有因为字够多了没读的）：两样都写明，一天也不悄悄漏掉（不然他当那几天没写）
  if (skipped.length) lines.push(`这一回递的字够多了：${daysLabel(skipped, now)}没读，要看再调一回。`);
  if (over.length) lines.push(`一次最多读 ${READ_MAX} 天：${daysLabel(over, now)}这一回没读，要看再调一回。`);
  return { out: lines.join("\n\n"), note: `翻了日记 · ${daysLabel(done, now)}` };
}

async function search(input, reader, now) {
  const query = oneLine(input.query || "");
  const terms = query.split(" ").filter(Boolean).slice(0, TERMS_MAX);
  if (!terms.length) return { err: true, out: "要找的词是空的：query 里写上要找什么。", note: "想翻日记，没翻成" };
  const who = input.who === "her" || input.who === "him" ? input.who : "both";
  const sides = who === "both" ? ["her", "him"] : [who];
  const lower = terms.map((t) => t.toLowerCase());
  const months = (await reader.months()).filter((ym) => monthOf(ym) === ym).sort().reverse();
  const hits = [];
  let total = 0;
  for (const ym of months) {
    const data = (await reader.month(ym)) || {};
    const days = Object.keys(data)
      .filter((k) => dayOf(k) === k && k.startsWith(ym))
      .sort()
      .reverse();
    for (const k of days) {
      for (const side of sides) {
        const e = data[k] && data[k][side];
        if (!has(e)) continue;
        const text = textOf(e);
        const moods = moodNames(e.moods);
        const hay = `${moods.length ? "心情：" + moods.join("、") + "\n" : ""}${text}`.toLowerCase();
        if (!lower.every((t) => hay.includes(t))) continue;
        total++;
        if (hits.length >= HIT_MAX) continue;
        // 前后一小段：照头一个在正文里找得到的词截；只在心情里对上的，写心情
        const low = text.toLowerCase();
        const at = lower.map((t) => low.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
        let piece;
        if (at === undefined) piece = `心情：${moods.join("、")}`;
        else {
          const w = span(text, at - AROUND, at + AROUND + terms[0].length);
          piece = `${w.a > 0 ? "……" : ""}${oneLine(w.s)}${w.b < text.length ? "……" : ""}`;
        }
        hits.push(`${shortDay(k, now)} ${side === "her" ? "她" : "你"}写的：${piece}`);
      }
    }
  }
  const note = `搜了日记 · ${query.length > 12 ? clip(query, 12) + "…" : query}`;
  const scope = who === "her" ? "她写的日记里" : who === "him" ? "你写的日记里" : "整本日记里";
  if (!total) return { out: `${scope}没找到“${query}”。`, note };
  const more = total > hits.length ? `，只列了最新的 ${hits.length} 处` : "";
  return { out: `在${scope}找“${query}”：一共 ${total} 处${more}（新的在前）\n${hits.join("\n")}\n\n要看哪天的全文，调 diary_read。`, note };
}

// 替他把这一步里翻日记的那几样翻完（别的工具不碰，原样留着；已经翻过的不再翻）。回新的一份 calls
export async function runDiaryCalls(calls, reader, now = new Date()) {
  const out = [];
  for (const c of calls || []) {
    if (!isDiaryCall(c) || typeof c.out === "string") {
      out.push(c);
      continue;
    }
    const input = c.input && typeof c.input === "object" ? c.input : {};
    let r;
    try {
      r = c.name === "diary_list" ? await list(input, reader, now) : c.name === "diary_read" ? await read(input, reader, now) : await search(input, reader, now);
    } catch (e) {
      r = { err: true, out: "这会儿翻不开日记本（开封府没取到），跟她说一声，过一会儿再试。", note: "想翻日记，没翻成" };
    }
    out.push({ id: c.id, name: c.name, input, out: r.out, err: !!r.err, note: r.note, card: [] });
  }
  return out;
}

// 那边回来的一整段里他要调的那几样（江湖棋局那四样、翻日记这三样都认；MCP 的不归这里）。names：认哪些名字
export function toolCallsOf(content, names) {
  return (content || [])
    .filter((b) => b && b.type === "tool_use" && names.has(b.name))
    .map((b) => ({ id: String(b.id), name: b.name, input: b.input && typeof b.input === "object" ? b.input : {} }));
}

// 一条回话里那几行小字（翻日记的那几样），前情提要的记录、写日记用的聊天摘录照它写：“[翻了日记 · 10月12日]”
export const noteLines = (m) => ((m && m.calls) || []).filter((c) => c && c.note).map((c) => `[${c.note}]`);
