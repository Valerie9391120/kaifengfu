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
import { NOTE_MAX } from "./jz/model.js";

export const DIARY_KEY = "kfs2:diary:";
export const READ_MAX = 7; // 读全文一次最多几天
export const HIT_MAX = 20; // 搜一回最多列几处
export const RECENT_DAYS = 30; // 不给月份的目录看最近几天
const ENTRY_MAX = 4000; // 一篇最多递多少字（再长的后面截掉，写明还有多少）
const OUT_MAX = 16000; // 读全文一回最多递多少字（够了就不往下读，写明哪几天没读）
const HEAD = 30; // 目录里每篇开头几个字
const AROUND = 40; // 搜到的那一处前后各几个字
const TERMS_MAX = 5; // 搜的时候最多认几个词
// 批注贴在那一页手帐的哪一块旁边（闲笔集的手帐是同页那一本：这几样换成同页的零件，见 tongye/host.js 的 TOOL_PART；叫法照同页里她看到的）
export const NOTE_PARTS = { title: "题签（标题）", wx: "天气签", hero: "主照片", route: "路线", shot: "截图", quote: "引言", body: "正文", pair: "双联照", pen: "红笔段落", food: "票根（吃了什么）" };

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
  {
    name: "diary_note",
    description:
      "在日记本的某一天留一条批注（她在闲笔集那一天底下、那一天的手帐上都看得到，跟她留的批注摆在一起）。想留就留，一回一条，三百字以内。part 是贴在手帐的哪一块旁边，不写就是留在那一天上。",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "哪一天，写成 2026-10-12 这样。" },
        text: { type: "string", description: "批注的话。" },
        part: { type: "string", enum: Object.keys(NOTE_PARTS), description: `贴在手帐哪一块旁边（有手帐的那一天才有用）：${Object.entries(NOTE_PARTS).map(([k, t]) => `${k} ${t}`).join("、")}。` },
      },
      required: ["date", "text"],
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

// 手帐和批注（闲笔集里同页那一本，见 tongye/host.js 的 tyReader：page 那一天的手帐和批注写成的字、pageBits 页上写着的字、
// notes 那一天的批注、extras 哪几天有、addNote 他留一条）：reader 给了才看（测试里的老 reader 没给，照只有日记的算）
// 回 { jz: Set(有手帐的日子), notes: Map(日子 → 几条批注) }
async function extrasOf(reader) {
  if (!reader.extras) return { jz: new Set(), notes: new Map() };
  try {
    return await reader.extras();
  } catch (e) {
    return { jz: new Set(), notes: new Map() };
  }
}
const extraTail = (ex, k) => `${ex.jz.has(k) ? "｜手帐：有" : ""}${ex.notes.get(k) ? `｜批注 ${ex.notes.get(k)} 条` : ""}`;

async function list(input, reader, now) {
  const today = dayKeyOf(now);
  const ex = await extrasOf(reader);
  const extraDays = new Set([...ex.jz, ...ex.notes.keys()]);
  let days;
  let head;
  let note;
  if (input.month !== undefined && input.month !== null && String(input.month).trim() !== "") {
    const ym = monthOf(input.month);
    if (!ym) return { err: true, out: `看不懂要看哪个月：“${clip(oneLine(input.month), 20)}”。月份写成 2026-10 这样。`, note: "想翻日记，没翻成" };
    const data = (await reader.month(ym)) || {};
    // 还没到的日子不列（存档里就算有，读全文也不读：两样说法对得上）
    const keys = new Set(Object.keys(data).filter((k) => dayOf(k) === k && k.startsWith(ym) && k <= today));
    extraDays.forEach((k) => k.startsWith(ym) && k <= today && keys.add(k));
    days = Array.from(keys)
      .sort()
      .map((k) => [k, data[k] || {}]);
    head = `日记本目录：${fullMonth(ym)}`;
    note = `翻了日记目录 · ${shortMonth(ym, now)}`;
    if (ym > today.slice(0, 7)) return { out: `${fullMonth(ym)}还没到（今天是 ${fullDay(today)}）。`, note };
  } else {
    const keys = [];
    for (let i = RECENT_DAYS - 1; i >= 0; i--) keys.push(dayKeyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
    const months = {};
    for (const ym of Array.from(new Set(keys.map((k) => k.slice(0, 7))))) months[ym] = (await reader.month(ym)) || {};
    days = keys.map((k) => [k, months[k.slice(0, 7)][k] || (extraDays.has(k) ? {} : null)]).filter(([, e]) => e);
    head = `日记本目录：最近三十天（${shortDay(keys[0], now)}到${shortDay(today, now)}）`;
    note = "翻了日记目录 · 最近三十天";
  }
  const rows = days
    .filter(([k, e]) => e && (has(e.her) || has(e.him) || extraDays.has(k)))
    .map(([k, e]) => `${shortDay(k, now)} 星期${WEEK[parseDayKey(k).getDay()]}${k === today ? "（今天）" : ""}｜${brief(e.her, "她")}｜${brief(e.him, "你")}${extraTail(ex, k)}`);
  if (!rows.length) return { out: `${head}\n这段日子一篇日记都没有。`, note };
  const what = extraDays.size ? "有日记、手帐或批注" : "有日记";
  return { out: `${head}（今天是 ${shortDay(today, now)}）\n${what}的 ${rows.length} 天，没写的日子不列：\n${rows.join("\n")}\n\n要看哪天的全文，调 diary_read。`, note };
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
      // 那一天的手帐和批注（reader 给了才有，见 tongye/host.js 的 dayTextOf）
      let extra = "";
      if (reader.page) {
        try {
          extra = (await reader.page(k)) || "";
        } catch (x) {
          extra = "";
        }
      }
      block = has(e.her) || has(e.him) ? `【${fullDay(k)}${tag}】\n${whole(e.her, "她")}\n\n${whole(e.him, "你")}` : `【${fullDay(k)}${tag}】\n这天两个人都没写日记。`;
      if (extra) block += `\n\n${extra}`;
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
  // 一篇一篇摆出来：日记（她的、他的），还有手帐上的字、批注（reader 给了才有）
  const docs = [];
  const months = (await reader.months()).filter((ym) => monthOf(ym) === ym);
  for (const ym of months) {
    const data = (await reader.month(ym)) || {};
    Object.keys(data)
      .filter((k) => dayOf(k) === k && k.startsWith(ym))
      .forEach((k) => {
        for (const side of sides) {
          const e = data[k] && data[k][side];
          if (!has(e)) continue;
          docs.push({ k, rank: side === "her" ? 0 : 1, label: side === "her" ? "她写的" : "你写的", text: textOf(e), moods: moodNames(e.moods) });
        }
      });
  }
  if (reader.extras && (reader.pageBits || reader.notes)) {
    const ex = await extrasOf(reader);
    if (reader.pageBits)
      for (const k of ex.jz) {
        try {
          const bits = await reader.pageBits(k);
          if (bits && who !== "him") docs.push({ k, rank: 2, label: "手帐上写的", text: bits, moods: [] });
        } catch (x) {}
      }
    if (reader.notes)
      for (const k of ex.notes.keys()) {
        try {
          (await reader.notes(k)).forEach((n) => {
            if (who === "both" || who === n.who) docs.push({ k, rank: 3, label: n.who === "her" ? "她的批注" : "你的批注", text: n.text, moods: [] });
          });
        } catch (x) {}
      }
  }
  docs.sort((a, b) => (a.k === b.k ? a.rank - b.rank : a.k < b.k ? 1 : -1));
  const hits = [];
  let total = 0;
  for (const d of docs) {
    const hay = `${d.moods.length ? "心情：" + d.moods.join("、") + "\n" : ""}${d.text}`.toLowerCase();
    if (!lower.every((t) => hay.includes(t))) continue;
    total++;
    if (hits.length >= HIT_MAX) continue;
    const low = d.text.toLowerCase();
    const at = lower.map((t) => low.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    let piece;
    if (at === undefined) piece = `心情：${d.moods.join("、")}`;
    else {
      const w = span(d.text, at - AROUND, at + AROUND + terms[0].length);
      piece = `${w.a > 0 ? "……" : ""}${oneLine(w.s)}${w.b < d.text.length ? "……" : ""}`;
    }
    hits.push(`${shortDay(d.k, now)} ${d.label}：${piece}`);
  }
  const note = `搜了日记 · ${query.length > 12 ? clip(query, 12) + "…" : query}`;
  const scope = who === "her" ? "她写的日记里" : who === "him" ? "你写的日记里" : "整本日记里";
  if (!total) return { out: `${scope}没找到“${query}”。`, note };
  const more = total > hits.length ? `，只列了最新的 ${hits.length} 处` : "";
  return { out: `在${scope}找“${query}”：一共 ${total} 处${more}（新的在前）\n${hits.join("\n")}\n\n要看哪天的全文，调 diary_read。`, note };
}

// 他留一条批注（写的：别的三样只读）。编号用他调的那一样的编号：同一步替他办两回（两台设备），也只留一条
async function noteOn(input, reader, now, id) {
  const k = dayOf(input.date);
  const text = clip(String(input.text || "").trim(), NOTE_MAX);
  if (!k) return { err: true, out: `看不懂是哪一天：“${clip(oneLine(input.date || ""), 20)}”。日子写成 2026-10-12 这样。`, note: "想留批注，没留成" };
  if (k > dayKeyOf(now)) return { err: true, out: `${fullDay(k)}还没到，批注留不上。`, note: "想留批注，没留成" };
  if (!text) return { err: true, out: "批注的话是空的：text 里写上要留的那一句。", note: "想留批注，没留成" };
  if (!reader.addNote) return { err: true, out: "这会儿留不了批注（开封府这边还没接上）。", note: "想留批注，没留成" };
  // 贴在哪一块旁边：那一天有手帐才贴（没有手帐的那天留在那一天上）
  const part = Object.prototype.hasOwnProperty.call(NOTE_PARTS, input.part) && (await extrasOf(reader)).jz.has(k) ? input.part : "";
  await reader.addNote(k, { id: String(id || ""), who: "him", text, at: now.getTime(), part });
  return { out: `留好了：${fullDay(k)}${part ? `的手帐上，${NOTE_PARTS[part]}旁边` : "那一天底下"}多了你这一条批注，她在闲笔集里看得到。`, note: `批注了日记 · ${shortDay(k, now)}` };
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
      r =
        c.name === "diary_list"
          ? await list(input, reader, now)
          : c.name === "diary_read"
          ? await read(input, reader, now)
          : c.name === "diary_note"
          ? await noteOn(input, reader, now, c.id)
          : await search(input, reader, now);
    } catch (e) {
      r = c.name === "diary_note" ? { err: true, out: "这会儿批注没存上（开封府没存成），跟她说一声，过一会儿再试。", note: "想留批注，没留成" } : { err: true, out: "这会儿翻不开日记本（开封府没取到），跟她说一声，过一会儿再试。", note: "想翻日记，没翻成" };
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
