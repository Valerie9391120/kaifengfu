// =====================================================
// 选项卡：他弹给她的几道选择题（卿卿 10 月 24 日凌晨要的，照 Claude 那张卡“逐帧照抄”，见开发说明“选项卡”那一节）。
// 他的写法（名帖【回复格式】里教的，见 prompt/system.js 的 ASK_RULE）：
//   [ASK]
//   问：今天晚饭想吃什么？
//   - 火锅｜天冷了，热乎乎的
//   - 烧烤
//   问（多选）：周末想干嘛？
//   - 看电影
//   - 睡懒觉
//   [/ASK]
// 一张卡最多四题、每题最多四个选项（多写的不要），选项“｜”后面是一行小字说明；单选还是多选每一题他自己定。
// 这里只管拆、写回、她答完发回去的那几行，不碰页面，测试在 Node 里跑（tests/ask.test.mjs）。
// 通知的小后端（supabase/push_function.ts 的 splitAsks、askQuestions）照同一套规矩认，横幅上写“[选项卡] 头一题”：
// 改一边要跟着改另一边，tests/mail.test.mjs 拿同一批回话两边各拆一遍。
// =====================================================

export const ASK_MAX_Q = 4;
export const ASK_MAX_O = 4;
const Q_MAX = 80; // 题目最长几个字
const LABEL_MAX = 40; // 选项
const DESC_MAX = 60; // 选项底下那行小字

// 开头、结尾的记号各占一行（跟文档块一个写法，见 docs.js 的 splitDocBlocks）
const OPEN = /^[ \t]*\[(?:ASK|Ask|ask)\][ \t]*\r?$/gm;
const CLOSE = /^[ \t]*\[\/(?:ASK|Ask|ask)\][ \t]*\r?$/gm;
// 一题：问：……（多选写成 问（多选）：……）
// 带 s：一行里夹着 U+2028 这种“行分隔符”也照认（不然 . 走不过去，写回去再拆就对不上）
const Q_LINE = /^(?:问|Q|q)[ \t]*(?:[（(][ \t]*(多选)[ \t]*[）)])?[ \t]*[：:][ \t]*(.*)$/s;
// 一个选项：- 选项、· 选项、1. 选项……
const O_LINE = /^(?:[-–•·*]|\d{1,2}[.、)）])[ \t]*(.*)$/s;
const MULTI_TAIL = /[（(][ \t]*多选[ \t]*[）)]$/;
// 没写记号的一行是不是一道题：末尾是问号（后面可以再跟几个“（多选）”）
const PLAIN_Q = /[？?](?:[ \t]*[（(][ \t]*多选[ \t]*[）)])*$/;

const cut = (s, n) => {
  const a = Array.from(s);
  return a.length > n ? a.slice(0, n).join("") : s;
};

// 截完再收拾一遍两头的空白：写回去（askRaw）再拆，得到的还是这几个字
function option(text) {
  const t = String(text || "");
  const i = t.search(/[｜|]/);
  const label = cut((i < 0 ? t : t.slice(0, i)).trim(), LABEL_MAX).trim();
  const desc = i < 0 ? "" : cut(t.slice(i + 1).trim(), DESC_MAX).trim();
  return label ? (desc ? { t: label, d: desc } : { t: label }) : null;
}

// 一张卡里头那几行 → [{ q, multi, opts: [{ t, d? }] }]
export function parseAskBody(body) {
  const qs = [];
  let cur = null;
  // 题目末尾写着“（多选）”也算多选（摘掉）。先截再摘：截完露出个“（多选）”的，写回去再拆也是同一题
  const start = (q, multi) => {
    let text = cut(String(q || "").trim(), Q_MAX).trim();
    let many = !!multi;
    while (MULTI_TAIL.test(text)) {
      many = true;
      text = text.replace(MULTI_TAIL, "").trim();
    }
    cur = { q: text, multi: many, opts: [] };
    qs.push(cur);
  };
  for (const raw of String(body || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const q = Q_LINE.exec(line);
    if (q) {
      start(q[2], q[1]);
      continue;
    }
    const o = O_LINE.exec(line);
    if (o) {
      if (!cur) start("", false);
      const op = option(o[1]);
      if (op) cur.opts.push(op);
      continue;
    }
    // 没写记号的一行：还没有题目，或者是一句问话（末尾是问号），就是新的一题；不然算眼下这一题的选项
    if (!cur || PLAIN_Q.test(line)) start(line, false);
    else {
      const op = option(line);
      if (op) cur.opts.push(op);
    }
  }
  return qs
    .filter((x) => x.q || x.opts.length)
    .slice(0, ASK_MAX_Q)
    .map((x) => ({ q: x.q, multi: x.multi, opts: x.opts.slice(0, ASK_MAX_O) }));
}

// 一段字（文档块外头的）里把选项卡整块摘出来：[{ type: "text", value }, { type: "ask", qs }]。
// 没有结尾的记号：到这一段的末尾都算（写回去的时候补上结尾，见 askRaw）。里头一题都认不出来的，整块不要
export function splitAskBlocks(text) {
  const src = String(text || "");
  const parts = [];
  let last = 0;
  let m;
  OPEN.lastIndex = 0;
  while ((m = OPEN.exec(src)) !== null) {
    const bodyStart = OPEN.lastIndex;
    CLOSE.lastIndex = bodyStart;
    const c = CLOSE.exec(src);
    const body = c ? src.slice(bodyStart, c.index) : src.slice(bodyStart);
    if (m.index > last) parts.push({ type: "text", value: src.slice(last, m.index) });
    const qs = parseAskBody(body);
    if (qs.length) parts.push({ type: "ask", qs });
    last = c ? CLOSE.lastIndex : src.length;
    if (!c) break;
    OPEN.lastIndex = last;
  }
  if (last < src.length) parts.push({ type: "text", value: src.slice(last) });
  return parts;
}

// 写回他的写法（rawOf 用：她按了停、掐断回话的时候，寄给他的“他自己说过的话”跟着改）。再拆一遍还是这几题
export function askRaw(qs) {
  const lines = ["[ASK]"];
  for (const x of qs || []) {
    lines.push(`问${x.multi ? "（多选）" : ""}：${x.q || ""}`);
    for (const o of x.opts || []) lines.push(`- ${o.t}${o.d ? "｜" + o.d : ""}`);
  }
  lines.push("[/ASK]");
  return lines.join("\n");
}

// 前情提要、醒来那会儿抄给他的那段对话、写日记的摘录里，一张卡写成一行
export function askSummary(qs) {
  return (
    "[选项卡] " +
    (qs || [])
      .map((x) => `${x.q || "（没写题目）"}${x.opts && x.opts.length ? `（${x.multi ? "多选：" : ""}${x.opts.map((o) => o.t).join("／")}）` : ""}`)
      .join("；")
  );
}

// 横幅上那一行：头一题（通知的小后端写的是同一句）
export function askBanner(qs) {
  const q = qs && qs[0] && qs[0].q;
  return q ? `[选项卡] ${q}` : "[选项卡]";
}

// 她答完发回给他的那一条：一题一行问、一行答（她 10 月 24 日 03:13 挑的“问一行、答一行”）。
// answers[i]：{ picks: [选项序号], other: 自己写的, skip: true }；跳过的写“（跳过）”。全跳过了回 ""（不发）
export function answerText(qs, answers) {
  const list = qs || [];
  const outs = list.map((x, i) => {
    const a = (answers || [])[i] || {};
    if (a.skip || (!(a.picks || []).length && !String(a.other || "").trim())) return null;
    const words = (a.picks || [])
      .filter((k) => x.opts && x.opts[k])
      .sort((p, q) => p - q)
      .map((k) => x.opts[k].t);
    const other = String(a.other || "").trim();
    if (other) words.push(other);
    return words.join("、");
  });
  if (!outs.some((w) => w)) return "";
  return list.map((x, i) => `Q: ${x.q || "（没写题目）"}\nA: ${outs[i] || "（跳过）"}`).join("\n\n");
}

// 写日记的摘录（拿的是他的原话 raw）：选项卡整块换成一句（同 docs.js 的 docBlocksToNote）
export function askBlocksToNote(raw) {
  return splitAskBlocks(raw)
    .map((p) => (p.type === "ask" ? `〔弹了一张选项卡：${askSummary(p.qs).slice(6)}〕` : p.value))
    .join("");
}
