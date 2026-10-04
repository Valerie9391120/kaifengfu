import { NAME_MARK } from "./names.js";
import { docBlocksToNote } from "./docs.js";
import { pad } from "./days.js";

// ---------- 日记本 ----------
export const dayKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ymKeyOf = (y, m) => `${y}-${pad(m + 1)}`;
export const parseDayKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const MOODS = [
  { k: "happy", e: "😊", t: "开心" },
  { k: "sweet", e: "🥰", t: "甜" },
  { k: "calm", e: "🍃", t: "平静" },
  { k: "tired", e: "😪", t: "累" },
  { k: "anxious", e: "😣", t: "焦虑" },
  { k: "sad", e: "🥲", t: "难过" },
  { k: "angry", e: "😤", t: "生气" },
  { k: "sick", e: "🤧", t: "不舒服" },
];
export const moodOf = (k) => MOODS.find((m) => m.k === k);

// 日历格子的深浅：这天说了多少句
export function heatLevel(n) {
  if (!n) return 0;
  if (n < 20) return 1;
  if (n < 60) return 2;
  if (n < 150) return 3;
  return 4;
}

// 月历：周一开头，前面空几格
export function monthCells(y, m) {
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return cells;
}

// 他回复里的改名标记 [NAME:新名字]，独占一行的才算（见 names.js）
const NAME_RE = () => new RegExp(NAME_MARK, "gm");

// 把某一天的聊天整理成一份摘录，给光义写日记用
export function dayTranscript(msgs, memeLookup, maxChars = 9000) {
  const lines = msgs
    .filter((m) => m.role === "her" || m.role === "him")
    .sort((a, b) => a.ts - b.ts)
    .map((m) => {
      if (m.role === "her") {
        if (m.kind === "meme") return `卿卿：[表情包：${(memeLookup(m.file) || {}).name || "表情包"}]`;
        if (m.kind === "photo") return "卿卿：[照片]";
        if (m.kind === "doc") return `卿卿：[文档《${m.name || "文档"}》]`;
        if (m.kind === "voice") return `卿卿：[语音] ${m.text || ""}`;
        return `卿卿：${m.text || ""}`;
      }
      const raw = docBlocksToNote(m.raw || "")
        .replace(/\[(MEME|AVATAR)[:：][^\]]*\]/g, "")
        .replace(NAME_RE(), "")
        .replace(/\s*\[SPLIT\]\s*/g, " ")
        .trim();
      return `光义：${raw || "……"}`;
    });
  let text = lines.join("\n");
  if (text.length > maxChars) text = "……（前面的省略）\n" + text.slice(text.length - maxChars);
  return text;
}

// 光义写的日记：第一行“心情：”，后面是正文；顺手把聊天用的标记都清掉
export function parseDiary(text) {
  let t = (text || "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/<\/?thinking>/g, "")
    .replace(/\[(MEME|AVATAR)[:：][^\]]*\]/g, "")
    .replace(NAME_RE(), "")
    .replace(/^[ \t]*\[\/?(?:DOC|Doc|doc)[^\]\n]*\][ \t]*$/gm, "")
    .replace(/\[SPLIT\]/g, "\n")
    .trim();
  const lines = t.split("\n");
  let moods = [];
  const idx = lines.findIndex((l) => /^\s*心情[:：]/.test(l));
  if (idx >= 0) {
    const names = lines[idx].replace(/^\s*心情[:：]\s*/, "").split(/[、,，\s]+/).filter(Boolean);
    moods = MOODS.filter((m) => names.includes(m.t)).map((m) => m.k).slice(0, 2);
    lines.splice(idx, 1);
  }
  return { text: lines.join("\n").replace(/\*/g, "").trim(), moods };
}
