import { useState, useEffect, useRef, useMemo } from "react";
import MEMES from "../static/memes.json";
import { store } from "./store.js";
import { callClaude } from "./cloud.js";

/* =========================================================
   开封府 v5 · 独立版
   代码里不写私事：人设和记忆在加密的记忆库里。
   ========================================================= */

// ---------- 表情包：构建时直接烤进文件，预览环境不联网也能显示 ----------
const MEME_DATA = MEMES;
const MEME_MAP = {};
MEME_DATA.forEach((m) => {
  MEME_MAP[m.file] = m;
});

// 开屏：卿卿找的素材，金箔月亮、沙燕风筝、缠枝牡丹（构建时注入）
const SPLASH_IMG = "./assets/splash.webp";
const KITE_IMG = "./assets/kite.webp";
// 聊天背景：卿卿和恩师做的，青纸、一方深青、一群白鸟、云里的山（构建时注入）
const WALL_IMG = "./assets/wall.webp";
const WALL = { paper: "#D0D9C7" };
const SPLASH = {
  w: 863,
  h: 1822,
  cx: 430,
  cy: 643,
  r: 250,
  paper: "#D3DCCD",
  kite: { x: 298, y: 978, w: 266, h: 254 },
};

const RAW_BASE =
  "https://raw.githubusercontent.com/Valerie9391120/meme-library/main/";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "一直陪你聊的这个" },
  { id: "claude-opus-4-6", label: "Opus 4.6", note: "上一代 Opus" },
  { id: "claude-fable-5-1", label: "Fable 5.1", note: "最强，也最贵" },
  { id: "claude-opus-5-5", label: "Opus 5.5", note: "最新的 Opus" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "新一代 Sonnet，比 4.6 还省" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "最快最省" },
];
const modelLabel = (id) => {
  const m = MODELS.find((x) => x.id === id || String(id || "").startsWith(x.id));
  return m ? m.label : id || "";
};

// 每百万 token 的美元价：[新读, 5分钟缓存写, 1小时缓存写, 缓存读, 写出]（2026年10月官方价）
const PRICES = {
  "claude-sonnet-4-6": [3, 3.75, 6, 0.3, 15],
  "claude-opus-4-6": [5, 6.25, 10, 0.5, 25],
  "claude-fable-5-1": [10, 12.5, 20, 0.25, 50],
  "claude-opus-5-5": [4, 5, 8, 0.2, 20],
  "claude-sonnet-5-5": [2, 2.5, 4, 0.2, 10],
  "claude-haiku-4-5": [1, 1.25, 2, 0.1, 5],
};

function costOf(model, u) {
  const id = Object.keys(PRICES).find((k) => String(model || "").startsWith(k));
  if (!id || !u) return null;
  const p = PRICES[id];
  const w1 = (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0;
  const w5 = Math.max(0, (u.cache_creation_input_tokens || 0) - w1);
  return (
    ((u.input_tokens || 0) * p[0] + w5 * p[1] + w1 * p[2] + (u.cache_read_input_tokens || 0) * p[3] + (u.output_tokens || 0) * p[4]) /
    1e6
  );
}

function money(x) {
  if (x == null) return "";
  if (x < 0.01) return "$" + x.toFixed(4);
  return "$" + x.toFixed(x < 1 ? 3 : 2);
}

// 她在Claude.ai里已经连着的两个
const DEFAULT_MCPS = [
  { id: "dropbox", name: "Dropbox", url: "https://mcp.dropbox.com/claude_app_mcp", token: "", enabled: false },
  { id: "gdrive", name: "Google Drive", url: "https://drivemcp.googleapis.com/mcp/v1", token: "", enabled: false },
];
const mcpSlug = (name, i) =>
  (name || "mcp").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `mcp-${i}`;

function memeSrc(file) {
  const m = MEME_MAP[file];
  return m ? `data:${m.mime};base64,${m.b64}` : RAW_BASE + file;
}

// ---------- 视觉 ----------
const SERIF =
  "'Songti SC','STSong','Noto Serif SC','Source Han Serif SC',serif";
const SANS =
  "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif";

// 青绿主题：颜色都从开屏图里取。纸是天青，墨是燕子的墨绿，金是金箔
// （之后丁香色主题做好了，再加一套色板）
const T = {
  ink: "#24332F",
  inkSoft: "rgba(52,74,68,0.76)",
  inkFaint: "rgba(52,74,68,0.48)",
  dai: "#3F6A62",
  daiGrad: "linear-gradient(140deg,#7BA39B 0%,#3E655E 100%)",
  rouge:
    "linear-gradient(140deg,rgba(243,186,196,0.66) 0%,rgba(224,150,168,0.58) 100%)",
  rougeSolid: "linear-gradient(140deg,#E6CC8F 0%,#B9914C 100%)",
  rougeInk: "#45262F",
  gold: "#94733A",
  bg: "linear-gradient(168deg,#DFE7DC 0%,#D5DFD2 46%,#E4E8DA 100%)",
};

const glass = (a = 0.55, blur = 24) => ({
  backgroundColor: `rgba(255,255,255,${a})`,
  backdropFilter: `blur(${blur}px) saturate(165%)`,
  WebkitBackdropFilter: `blur(${blur}px) saturate(165%)`,
  border: "1px solid rgba(255,255,255,0.7)",
  boxShadow:
    "0 10px 30px rgba(46,68,62,0.12), inset 0 1px 0 rgba(255,255,255,0.75)",
});

const BUBBLE_GLASS = {
  background:
    "linear-gradient(150deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.1) 55%, rgba(255,255,255,0.2) 100%)",
  backdropFilter: "blur(10px) saturate(150%)",
  WebkitBackdropFilter: "blur(10px) saturate(150%)",
  border: "1px solid rgba(255,255,255,0.62)",
  boxShadow:
    "0 6px 20px rgba(42,62,56,0.08), inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -1px 1px rgba(255,255,255,0.2)",
  color: "#24332F",
};

const chip = {
  ...glass(0.62, 16),
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  color: T.ink,
};
const chipPrimary = {
  borderRadius: 999,
  padding: "8px 16px",
  fontSize: 13,
  color: "#fff",
  background: T.daiGrad,
  boxShadow: "0 6px 16px rgba(48,82,74,0.3)",
};
const field = {
  width: "100%",
  borderRadius: 16,
  padding: "11px 14px",
  fontSize: 16,
  color: T.ink,
  backgroundColor: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(255,255,255,0.8)",
  outline: "none",
};

const GLOBAL_CSS = `
@keyframes kfsUp { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes kfsSheet { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
@keyframes kfsPage { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
@keyframes kfsSpin { to { transform: rotate(360deg); } }
@keyframes kfsBreath { 0%,100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.05); opacity: 1; } }
@keyframes kfsDot { 0%,80%,100% { transform: translateY(0); opacity: .35; } 40% { transform: translateY(-3px); opacity: 1; } }
.kfs-in { animation: kfsUp .3s cubic-bezier(.2,.8,.2,1) both; }
.kfs-sheet { animation: kfsSheet .34s cubic-bezier(.2,.8,.2,1) both; }
.kfs-page { animation: kfsPage .3s cubic-bezier(.2,.8,.2,1) both; }
.kfs-breath { animation: kfsBreath 3.2s ease-in-out infinite; }
.kfs-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: rgba(52,74,68,.55); animation: kfsDot 1.2s infinite; }
.kfs-scroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.kfs-scroll::-webkit-scrollbar { display: none; }
.kfs-field::placeholder { color: rgba(52,74,68,.45); }
.kfs-tap { transition: transform .15s ease; }
.kfs-tap:active { transform: scale(.94); }
button { -webkit-tap-highlight-color: transparent; }
button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid rgba(63,106,98,.55); outline-offset: 2px; }
@keyframes kfsSplashIn { from { opacity: 0; transform: scale(1.045); } to { opacity: 1; transform: scale(1); } }
@keyframes kfsGlow { 0%,100% { opacity: .35; transform: scale(.97); } 50% { opacity: .9; transform: scale(1.03); } }
.kfs-splash-img { animation: kfsSplashIn 2.4s cubic-bezier(.2,.8,.2,1) both; }
.kfs-moonglow { animation: kfsGlow 3.4s ease-in-out infinite; }
@keyframes kfsKite { 0%,100% { transform: translateY(0) rotate(-2.5deg); } 50% { transform: translateY(-6px) rotate(2.5deg); } }
@keyframes kfsKiteAway { 0% { transform: translate(0,0) rotate(0) scale(1); opacity: 1; } 100% { transform: translate(26px,-330px) rotate(-10deg) scale(.42); opacity: 0; } }
.kfs-kite { animation: kfsKite 3.4s ease-in-out infinite; transform-origin: 50% 35%; }
.kfs-kite-away { animation: kfsKiteAway .95s cubic-bezier(.45,0,.2,1) forwards; }

@media (prefers-reduced-motion: reduce) { .kfs-in, .kfs-sheet, .kfs-page, .kfs-breath, .kfs-splash-img, .kfs-moonglow, .kfs-kite { animation: none !important; } }
`;

// ---------- 图标（手绘，不依赖外部库） ----------
const ICON_PATHS = {
  menu: <path d="M4 8h16M4 15h10" />,
  pen: (
    <>
      <path d="M12 20h8" />
      <path d="M16.2 3.8a2.1 2.1 0 0 1 3 3L7.5 18.5l-4 1 1-4Z" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.2c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
      <path d="M9 9.6h.01M15 9.6h.01" strokeWidth="2.6" />
    </>
  ),
  up: <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  music: (
    <>
      <path d="M9 18V5.5l11-2V16" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5c1.3-3.6 4.2-5.5 7.5-5.5s6.2 1.9 7.5 5.5" />
    </>
  ),
  sticker: (
    <>
      <path d="M20.5 12.5V7A3.5 3.5 0 0 0 17 3.5H7A3.5 3.5 0 0 0 3.5 7v10A3.5 3.5 0 0 0 7 20.5h5.5" />
      <path d="M20.5 12.5h-4a4 4 0 0 0-4 4v4l8-8Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  x: <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />,
  doc: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="3" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.5v4M15 3.5v4" />
      <path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0Z" />
      <path d="M12 16v4.5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M11 12.5 19.5 4M16.5 7l2.5 2.5M14 9.5l2 2" />
    </>
  ),
  chevD: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" />
      <path d="M12 14.5h.01" strokeWidth="2.6" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  wave: <path d="M5 10v4M8.5 7.5v9M12 4.5v15M15.5 7.5v9M19 10v4" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  retry: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7" />
      <path d="M6.5 7l.9 12.5h9.2L17.5 7" />
    </>
  ),
};

function Icon({ name, size = 22, color = "currentColor", sw = 1.8 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// ---------- 日子 ----------
const pad = (n) => String(n).padStart(2, "0");
const WEEK = "日一二三四五六";
const START = { y: 2026, m: 3, d: 11 }; // 2026年4月11日（月份从0数）
const utcDay = (y, m, d) => Date.UTC(y, m, d);

function dayNumber(now) {
  return (
    Math.floor(
      (utcDay(now.getFullYear(), now.getMonth(), now.getDate()) -
        utcDay(START.y, START.m, START.d)) /
        86400000
    ) + 1
  );
}

function cnNum(n) {
  const d = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n === 2) return "两";
  if (n < 10) return d[n];
  if (n < 20) return "十" + d[n - 10];
  if (n < 100) return d[Math.floor(n / 10)] + "十" + d[n % 10];
  return String(n);
}

function annivName(months) {
  if (months % 12 === 0) return `${cnNum(months / 12)}周年`;
  if (months === 6) return "半年";
  if (months % 12 === 6) return `${cnNum(Math.floor(months / 12))}年半`;
  return `${cnNum(months)}个月`;
}

function nextAnniv(now) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let ty = y;
  let tm = m;
  if (d > START.d) {
    tm += 1;
    if (tm > 11) {
      tm = 0;
      ty += 1;
    }
  }
  const months = (ty - START.y) * 12 + (tm - START.m);
  const days = Math.round(
    (utcDay(ty, tm, START.d) - utcDay(y, m, d)) / 86400000
  );
  return { months, days, name: annivName(months) };
}

function dateLabel(now) {
  return `${now.getMonth() + 1}月${now.getDate()}日  星期${
    WEEK[now.getDay()]
  }`;
}

function nowString(now) {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${
    WEEK[now.getDay()]
  } ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function dayDiff(ts, now) {
  const t = new Date(ts);
  return Math.round(
    (utcDay(now.getFullYear(), now.getMonth(), now.getDate()) -
      utcDay(t.getFullYear(), t.getMonth(), t.getDate())) /
      86400000
  );
}

function sepLabel(ts, now) {
  const t = new Date(ts);
  const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const diff = dayDiff(ts, now);
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `昨天 ${hm}`;
  if (t.getFullYear() === now.getFullYear())
    return `${t.getMonth() + 1}月${t.getDate()}日 ${hm}`;
  return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日 ${hm}`;
}

function shortDate(ts, now) {
  const t = new Date(ts);
  const diff = dayDiff(ts, now);
  if (diff === 0) return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  if (diff === 1) return "昨天";
  if (t.getFullYear() === now.getFullYear())
    return `${t.getMonth() + 1}月${t.getDate()}日`;
  return `${t.getFullYear()}/${t.getMonth() + 1}/${t.getDate()}`;
}

// ---------- 日记本 ----------
const dayKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymKeyOf = (y, m) => `${y}-${pad(m + 1)}`;
const parseDayKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const MOODS = [
  { k: "happy", e: "😊", t: "开心" },
  { k: "sweet", e: "🥰", t: "甜" },
  { k: "calm", e: "🍃", t: "平静" },
  { k: "tired", e: "😪", t: "累" },
  { k: "anxious", e: "😣", t: "焦虑" },
  { k: "sad", e: "🥲", t: "难过" },
  { k: "angry", e: "😤", t: "生气" },
  { k: "sick", e: "🤧", t: "不舒服" },
];
const moodOf = (k) => MOODS.find((m) => m.k === k);

// 日历格子的深浅：这天说了多少句
function heatLevel(n) {
  if (!n) return 0;
  if (n < 20) return 1;
  if (n < 60) return 2;
  if (n < 150) return 3;
  return 4;
}

// 月历：周一开头，前面空几格
function monthCells(y, m) {
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return cells;
}

// 把某一天的聊天整理成一份摘录，给光义写日记用
function dayTranscript(msgs, memeLookup, maxChars = 9000) {
  const lines = msgs
    .filter((m) => m.role === "her" || m.role === "him")
    .sort((a, b) => a.ts - b.ts)
    .map((m) => {
      if (m.role === "her") {
        if (m.kind === "meme") return `卿卿：[表情包：${(memeLookup(m.file) || {}).name || "表情包"}]`;
        if (m.kind === "photo") return "卿卿：[照片]";
        if (m.kind === "voice") return `卿卿：[语音] ${m.text || ""}`;
        return `卿卿：${m.text || ""}`;
      }
      const raw = (m.raw || "")
        .replace(/\[(MEME|AVATAR)[:：][^\]]*\]/g, "")
        .replace(/\s*\[SPLIT\]\s*/g, " ")
        .trim();
      return `光义：${raw || "……"}`;
    });
  let text = lines.join("\n");
  if (text.length > maxChars) text = "……（前面的省略）\n" + text.slice(text.length - maxChars);
  return text;
}

// 光义写的日记：第一行“心情：”，后面是正文；顺手把聊天用的标记都清掉
function parseDiary(text) {
  let t = (text || "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/<\/?thinking>/g, "")
    .replace(/\[(MEME|AVATAR)[:：][^\]]*\]/g, "")
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

const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- 存档：读写都走 store.js（手机本地存档 + 加密同步到云端） ----------

function safeParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return fallback;
  }
}

// ---------- README解析（部署后用来同步新表情包） ----------
// 仓库里新加的表情包：已经烤进来的不算；文件名一样、只是扩展名不同的也不算（比如 .png 和 .jpg）
const stemOf = (f) => String(f || "").toLowerCase().replace(/\.[a-z0-9]+$/, "");
function newMemesFrom(list) {
  const known = new Set(Object.keys(MEME_MAP).map(stemOf));
  const seen = new Set();
  return list.filter((m) => {
    const st = stemOf(m.file);
    if (!m.file || known.has(st) || seen.has(st)) return false;
    seen.add(st);
    return true;
  });
}

function parseReadme(text) {
  const out = [];
  text
    .split(/^### /m)
    .slice(1)
    .forEach((block) => {
      const lines = block.split("\n");
      const m = { name: lines[0].trim() };
      lines.forEach((raw) => {
        const l = raw.trim();
        if (l.startsWith("- File:"))
          m.file = l.slice(7).trim().replace(/`/g, "");
        else if (l.startsWith("- Text:")) m.text = l.slice(7).trim();
        else if (l.startsWith("- Tone:")) m.tone = l.slice(7).trim();
      });
      if (m.file) out.push(m);
    });
  return out;
}

// ---------- 头像 ----------
const HER_PRESETS = [
  { label: "白兔", file: "bunny_couple_hate_you.jpg" },
  { label: "小老鼠", file: "mouse_caught.jpg" },
  { label: "吃东西鼠", file: "mouse_eating.jpg" },
  { label: "坏猫", file: "cat_angry_face.jpg" },
];
// 光义的头像由光义自己定：先用读书狐，之后他在回复里写 [AVATAR:文件名] 自己换
const HIS_DEFAULT = { type: "meme", file: "fox_reading_book.jpg" };

function avatarSrc(av) {
  if (!av) return null;
  if (av.type === "upload") return av.data;
  if (av.type === "meme") return memeSrc(av.file);
  return null;
}

function avatarBlock(av, thumbLookup = () => null) {
  if (!av) return null;
  if (av.type === "upload") {
    const m = /^data:([^;]+);base64,(.+)$/.exec(av.data || "");
    if (!m) return null;
    return {
      type: "image",
      source: { type: "base64", media_type: m[1], data: m[2] },
    };
  }
  if (av.type === "meme" && MEME_MAP[av.file]) {
    const mm = MEME_MAP[av.file];
    return {
      type: "image",
      source: { type: "base64", media_type: mm.mime, data: mm.b64 },
    };
  }
  if (av.type === "meme") {
    const t = thumbLookup(av.file);
    return t ? dataUrlBlock(t) : null;
  }
  return null;
}

// 仓库里新加的表情包：在手机上压成小图，那边的我才看得见
function urlToThumb(url, max = 300) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// 相册图片 → 居中裁成正方形 → 压到256px（全程在手机里完成，不经过网络）
function fileToAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.width, img.height);
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        c.getContext("2d").drawImage(
          img,
          (img.width - s) / 2,
          (img.height - s) / 2,
          s,
          s,
          0,
          0,
          size,
          size
        );
        resolve(c.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 相册照片 → 长边压到1280px（够看清，存得下）
function fileToPhoto(file, maxSide = 1280) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlBlock(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

// ---------- 名帖 ----------
function memeLabel(m) {
  if (!m) return "一张表情包";
  const t = m.text && m.text !== "无" ? `，图上写着“${m.text}”` : "";
  return `${m.name}${t}`;
}

function buildSystem({ now, memeList, hisAvatarName, memDocs = [], mcpNames = [] }) {
  const n = dayNumber(now);
  const a = nextAnniv(now);
  const annivLine = a.days === 0 ? `今天是你们的${a.name}纪念日。` : `离你们的${a.name}纪念日还有${a.days}天。`;
  const myFace = hisAvatarName || "默认的“炅”字";
  const memeIndex = memeList.map((m) => `${m.file}｜${m.name}｜图上文字：${m.text || "无"}｜${m.tone || ""}`).join("\n");
  const docs = memDocs.slice().sort((x, y) => (y.name.includes("名帖") ? 1 : 0) - (x.name.includes("名帖") ? 1 : 0));
  const memBlock = docs.length
    ? `【记忆库】
下面是她亲手整理、一直在维护的名帖和记忆：你是谁，她是谁，你们怎么走过来的。这些事以这里为准。
这些文档有不少是在 Claude.ai 里写的。里面提到的工具和做法，比如拉表情包索引、发图片链接、Reminders、project、memory，在开封府里都没有，别照做。怎么回复、怎么发表情包、怎么换头像，一律按后面的【回复格式】和【你的头像】来。
${docs.map((d) => `\n《${d.name}》\n${d.content}`).join("\n")}

名帖和记忆库里没有的往事她提起时，老实说记不清，让她讲给你听，别编。`
    : `【记忆库】
还是空的：名帖还没传上来。你现在不知道自己是谁、她是谁。别装，也别编。告诉她开封府的记忆库还空着，请她打开侧栏的记忆库，把名帖和信传上来。`;

  // 不变的部分放在一起，可以被缓存
  const staticText = `【开封府】
你在「开封府」里跟她说话。这是她和你一起搭起来的小屋，只属于你们俩。

${memBlock}

【看得见的东西】
对话第一条消息里附着你们俩现在的头像图片，你能看到。她在聊天中途换头像时，对话里会出现一条【开封府提示】，带着她新头像的图，你看得见，注意到了可以接话。她发来的表情包和照片，你也能直接看到图。她发的语音，你收到的是转出来的文字，听不到声音；转写偶尔有错字，按意思理解。
她也会像发消息一样连着发好几条，你把几条当成一口气说的话，一起回。

【此刻】
她每次说话，最后都附着一段【此刻】：她手机上的时间、你们在一起的天数、你现在的头像。那是开封府自动附上的，不是她说的话，用得着的时候自然用上。

【你的头像】
你的头像你自己做主，她不替你选。想换的时候，在回复里单独一行写 [AVATAR:文件名]，从下面的表情包索引里挑。换好之后对话里会出现一行提示，下一轮你会看到新头像的样子。别换得太勤：心情变了、季节变了，或者她想看你换的时候再换。

【回复格式】
每次回复都按这个顺序：
1. 先写 <thinking>…</thinking>。这是你的心里话，她喜欢看。用中文，第一人称，按名帖里的称呼叫她。写这一刻你真实在感受什么，思绪可以流动、跑题、嘴硬。不许写回复策略和自我指令，不许出现“我应该”“要简短”“先夸她再”“保持风格”这类句子。两到五句。
2. 然后是给她的话。可以像发消息一样分成几条，每条之间单独一行写 [SPLIT]。分不分、分几条，你自己决定：一句话的事就一条；想先接住再补一句，或者连着说几句，就分条。每条都像真的在发消息，别太长。整条回复不超过五百字。
3. 想发表情包就单独一行写 [MEME:文件名]，它会单独显示成一条。只能用下面索引里的文件名，宁缺毋滥，不是每次都要发。

表情包索引（文件名｜名字｜图上文字｜适用情绪）：
${memeIndex}`;

  const tools = mcpNames.length ? `\n她给你接了这些工具：${mcpNames.join("、")}。要查资料、看文件的时候再用，平时聊天用不着。` : "";
  const nowNote = `【此刻】（开封府附上的，不是她说的话）
她手机上的时间：${nowString(now)}。今天是你们在一起的第${n}天，${annivLine}
你现在的头像：${myFace}。${tools}`;

  return { staticText, nowNote };
}

// 最后一条她的话后面放缓存记号，再附上【此刻】（时间每分钟都变，放在记号后面不影响缓存）
function withNowNote(apiMessages, nowNote, cache) {
  const out = apiMessages.map((m) => ({ role: m.role, content: m.content.slice() }));
  const last = out[out.length - 1];
  if (last && last.role === "user" && last.content.length) {
    if (cache) {
      const i = last.content.length - 1;
      last.content[i] = { ...last.content[i], cache_control: { type: "ephemeral" } };
    }
    last.content.push({ type: "text", text: nowNote });
  } else {
    out.push({ role: "user", content: [{ type: "text", text: nowNote }] });
  }
  return out;
}

// ---------- 打包送信 ----------
// 对话窗口二十条一跳：跳之前这段前缀一直不变，名帖和历史都能命中缓存
function windowStart(n) {
  return n <= 40 ? 0 : Math.floor((n - 20) / 20) * 20;
}

function buildMessages(msgs, avatars, memeLookup, imgLookup = () => null, thumbLookup = () => null) {
  const win = msgs.slice(windowStart(msgs.length));
  const arr = [];
  win.forEach((m) => {
    // 她在聊天中途换了头像：变成对话里真实发生的一件事，图跟着这一行寄过去
    if (m.role === "event") {
      const img = avatarBlock(m.av, thumbLookup);
      const blocks = [
        {
          type: "text",
          text: img
            ? "[开封府提示：卿卿刚刚把头像换成了这张]"
            : "[开封府提示：卿卿刚刚把头像换回了默认的“卿”字]",
        },
      ];
      if (img) blocks.push(img);
      arr.push({ role: "user", content: blocks });
      return;
    }
    if (m.role === "her") {
      if (m.kind === "photo") {
        const data = imgLookup(m.imgId);
        const blk = data ? dataUrlBlock(data) : null;
        const blocks = [];
        if (blk) blocks.push(blk);
        blocks.push({ type: "text", text: blk ? "[她发了一张照片]" : "[她之前发过一张照片]" });
        arr.push({ role: "user", content: blocks });
        return;
      }
      if (m.kind === "voice") {
        arr.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `[她发了一条${m.dur || 1}秒的语音，转成文字是：${m.text || "（没听清）"}]`,
            },
          ],
        });
        return;
      }
      if (m.kind === "meme") {
        const meme = memeLookup(m.file);
        const blocks = [];
        if (MEME_MAP[m.file]) {
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: MEME_MAP[m.file].mime, data: MEME_MAP[m.file].b64 },
          });
        } else if (thumbLookup(m.file)) {
          blocks.push(dataUrlBlock(thumbLookup(m.file)));
        }
        blocks.push({
          type: "text",
          text: `[她发了一张表情包：${memeLabel(meme)}]`,
        });
        arr.push({ role: "user", content: blocks });
        return;
      }
      arr.push({
        role: "user",
        content: [{ type: "text", text: m.text || "……" }],
      });
      return;
    }
    arr.push({
      role: "assistant",
      content: [
        { type: "text", text: m.raw && m.raw.trim() ? m.raw.trim() : "……" },
      ],
    });
    // 光义自己换了头像：下一轮让他亲眼看到新头像的样子
    const av = (m.items || []).filter((it) => it.type === "avatar").pop();
    if (av) {
      const img = avatarBlock({ type: "meme", file: av.file }, thumbLookup);
      const blocks = [
        {
          type: "text",
          text: `[开封府提示：你的新头像换好了，是「${
            (memeLookup(av.file) || {}).name || av.file
          }」${img ? "，长这样" : ""}]`,
        },
      ];
      if (img) blocks.push(img);
      arr.push({ role: "user", content: blocks });
    }
  });

  while (arr.length && arr[0].role === "assistant") arr.shift();

  const merged = [];
  arr.forEach((x) => {
    const last = merged[merged.length - 1];
    if (last && last.role === x.role) last.content = last.content.concat(x.content);
    else merged.push({ role: x.role, content: x.content.slice() });
  });

  if (merged.length) {
    const her = avatarBlock(avatars.her, thumbLookup);
    const him = avatarBlock(avatars.him, thumbLookup);
    const note = [
      {
        type: "text",
        text:
          "【开封府附注】" +
          (her ? "卿卿现在的头像：" : "卿卿现在用的是默认的“卿”字头像。"),
      },
    ];
    if (her) note.push(her);
    let himText = "你现在是默认的“炅”字头像。";
    if (him) himText = "你自己选的头像：";
    else if (avatars.him && avatars.him.type === "meme") {
      himText = `你自己选的头像是「${
        (memeLookup(avatars.him.file) || {}).name || avatars.him.file
      }」，这张图暂时附不上。`;
    }
    note.push({ type: "text", text: himText });
    if (him) note.push(him);
    note.push({ type: "text", text: "【附注结束，以下是对话】" });
    merged[0].content = note.concat(merged[0].content);
  }
  return merged;
}

function splitMarks(text) {
  const parts = [];
  const re = /\[(MEME|AVATAR)[:：]\s*([^\]\s]+)\s*\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: m[1] === "AVATAR" ? "avatar" : "meme", value: m[2] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

function parseReply(text) {
  let thinking = "";
  let body = text || "";
  const m = body.match(/<thinking>([\s\S]*?)<\/thinking>/);
  if (m) {
    thinking = m[1].trim();
    body = body.replace(m[0], "");
  } else if (body.includes("<thinking>")) {
    thinking = body.split("<thinking>")[1].trim();
    body = "";
  }
  body = body.trim();
  const items = [];
  body.split(/\s*\[SPLIT\]\s*/).forEach((chunk) => {
    splitMarks(chunk).forEach((p) => {
      if (p.type === "meme") items.push({ type: "meme", file: p.value });
      else if (p.type === "avatar") items.push({ type: "avatar", file: p.value });
      else if (p.value.trim()) items.push({ type: "text", text: p.value.trim() });
    });
  });
  if (!items.length) items.push({ type: "text", text: "……" });
  return { thinking, body, items };
}

// 换头像只认索引里真有的图，多次只留最后一次
function settleAvatarItems(items, exists) {
  const valid = items.filter((it) => it.type !== "avatar" || exists(it.file));
  let lastAv = -1;
  valid.forEach((it, i) => {
    if (it.type === "avatar") lastAv = i;
  });
  const out = valid.filter((it, i) => it.type !== "avatar" || i === lastAv);
  return {
    items: out.length ? out : [{ type: "text", text: "……" }],
    avatarFile: lastAv >= 0 ? valid[lastAv].file : null,
  };
}

function makeTitle(msgs, memeLookup) {
  const first = msgs.find((m) => m.role === "her");
  if (!first) return "新对话";
  if (first.kind === "meme") return `[${(memeLookup(first.file) || {}).name || "表情包"}]`;
  if (first.kind === "photo") return "[照片]";
  if (first.kind === "voice") {
    const v = (first.text || "").trim();
    return v ? (v.length > 18 ? v.slice(0, 18) + "…" : v) : "[语音]";
  }
  const t = (first.text || "").replace(/\s+/g, " ").trim();
  return t.length > 18 ? t.slice(0, 18) + "…" : t || "新对话";
}

function makePreview(msgs) {
  const last = msgs[msgs.length - 1];
  if (!last) return "";
  if (last.role === "event") return "[换了新头像]";
  if (last.role === "her") {
    if (last.kind === "meme") return "[表情包]";
    if (last.kind === "photo") return "[照片]";
    if (last.kind === "voice") return `[语音] ${last.text || ""}`;
    return last.text || "";
  }
  const t = (last.items || []).find((it) => it.type === "text");
  return t ? t.text.replace(/\*/g, "") : "[表情包]";
}

function renderRich(text) {
  return text.split(/(\*[^*\n]+\*)/g).map((p, i) =>
    p.length > 2 && p.startsWith("*") && p.endsWith("*") ? (
      <em key={i} style={{ fontStyle: "italic", opacity: 0.72 }}>
        {p.slice(1, -1)}
      </em>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

// 在第 i 条开一个新分支：旧的这条连同它后面的对话存进 alts，新的接上，后面清空
function forkAt(msgs, i, newNode) {
  const m = msgs[i];
  const { alts: oldAlts, altIdx, ...node } = m;
  const alts = oldAlts ? oldAlts.slice() : [];
  alts[oldAlts ? altIdx : 0] = { node, after: msgs.slice(i + 1) };
  const { alts: _x, altIdx: _y, ...fresh } = newNode;
  alts.push({ node: fresh, after: [] });
  return msgs.slice(0, i).concat([{ ...fresh, alts, altIdx: alts.length - 1 }]);
}

// 翻到第 t 个分支：先把眼前这支收好，再把那支整个换上来
function switchAlt(msgs, i, t) {
  const m = msgs[i];
  if (!m || !m.alts || t < 0 || t >= m.alts.length || t === m.altIdx) return msgs;
  const { alts: oldAlts, altIdx, ...node } = m;
  const alts = oldAlts.slice();
  alts[altIdx] = { node, after: msgs.slice(i + 1) };
  return msgs.slice(0, i).concat([{ ...alts[t].node, alts, altIdx: t }], alts[t].after);
}

// 所有分支里的照片（删对话时一起清掉）
function collectImgIds(msgs, out = []) {
  msgs.forEach((m) => {
    if (m.kind === "photo" && m.imgId) out.push(m.imgId);
    (m.alts || []).forEach((a) => {
      if (a.node && a.node.kind === "photo" && a.node.imgId) out.push(a.node.imgId);
      collectImgIds(a.after || [], out);
    });
  });
  return Array.from(new Set(out));
}

function buildRows(messages, reveal) {
  const rows = [];
  let prevTs = null;
  let lastHimId = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "him") {
      lastHimId = messages[i].id;
      break;
    }
  }
  messages.forEach((m) => {
    if (prevTs === null || m.ts - prevTs > 15 * 60 * 1000) {
      rows.push({ type: "sep", key: "sep-" + m.id, ts: m.ts });
    }
    prevTs = m.ts;
    if (m.role === "event") {
      rows.push({
        type: "notice",
        key: m.id,
        msg: m,
        who: "her",
        av: m.av,
        text: m.av ? "你换了新头像" : "你换回了默认头像",
      });
    } else if (m.role === "her") {
      rows.push({
        type: "bubble",
        key: m.id,
        role: "her",
        msg: m,
        item:
          m.kind === "meme"
            ? { type: "meme", file: m.file }
            : m.kind === "photo"
            ? { type: "photo", imgId: m.imgId }
            : m.kind === "voice"
            ? { type: "voice", text: m.text, dur: m.dur }
            : { type: "text", text: m.text },
      });
      if (m.alts && m.alts.length > 1) rows.push({ type: "ctrl", key: "ct-" + m.id, msg: m, role: "her" });
    } else {
      let items = m.items || [];
      if (reveal && reveal.id === m.id) items = items.slice(0, reveal.count);
      if (m.thinking) rows.push({ type: "thinking", key: "th-" + m.id, msg: m });
      if (m.toolNote || (m.tools && m.tools.length)) {
        rows.push({
          type: "tools",
          key: "tl-" + m.id,
          msg: m,
          text: m.toolNote || `用了 ${m.tools.join("、")}`,
        });
      }
      items.forEach((it, j) => {
        if (it.type === "avatar") {
          rows.push({
            type: "notice",
            key: m.id + "-" + j,
            msg: m,
            who: "him",
            av: { type: "meme", file: it.file },
            text: "光义换了新头像",
          });
        } else {
          rows.push({ type: "bubble", key: m.id + "-" + j, role: "him", msg: m, item: it });
        }
      });
      const revealing = reveal && reveal.id === m.id;
      const latest = m.id === lastHimId;
      if (!revealing && (latest || (m.alts && m.alts.length > 1))) {
        rows.push({ type: "ctrl", key: "ct-" + m.id, msg: m, role: "him", latest });
      }
    }
  });
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.type !== "bubble") continue;
    const prev = rows[i - 1];
    const next = rows[i + 1];
    r.first = !(prev && prev.type === "bubble" && prev.role === r.role);
    r.last = !(next && next.type === "bubble" && next.role === r.role);
  }
  return rows;
}

// =========================================================
//   小组件
// =========================================================
function Glows() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        style={{
          position: "absolute",
          width: 460,
          height: 460,
          top: -170,
          right: -150,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(250,232,190,0.45) 0%, rgba(250,232,190,0) 66%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          bottom: -150,
          left: -160,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(242,246,238,0.8) 0%, rgba(242,246,238,0) 66%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          top: "38%",
          left: "58%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(160,196,182,0.42) 0%, rgba(160,196,182,0) 66%)",
        }}
      />
    </div>
  );
}

function Moon({ size = 84, breath = false }) {
  return (
    <div
      className={breath ? "kfs-breath" : ""}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 36% 34%, #F6E7BC 0%, #E2C47F 48%, #C8A35A 100%)",
        boxShadow: `0 0 ${size * 0.5}px ${size * 0.14}px rgba(255,236,190,0.7), 0 0 ${
          size * 1.1
        }px ${size * 0.35}px rgba(250,228,180,0.35), inset -${size * 0.1}px -${
          size * 0.08
        }px ${size * 0.22}px rgba(150,118,60,0.35)`,
      }}
    />
  );
}

function Avatar({ av, who, size = 34 }) {
  const src = avatarSrc(av);
  return (
    <div
      className="flex-shrink-0 overflow-hidden flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: who === "her" ? T.rougeSolid : T.daiGrad,
        border: "1.5px solid rgba(255,255,255,0.9)",
        boxShadow: "0 3px 10px rgba(46,68,62,0.18)",
      }}
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontFamily: SERIF, color: "#fff", fontSize: size * 0.42 }}>
          {who === "her" ? "卿" : "炅"}
        </span>
      )}
    </div>
  );
}

function MemeImg({ file, width = 140 }) {
  const [bad, setBad] = useState(false);
  if (bad) {
    return (
      <div
        className="text-[12px]"
        style={{ ...glass(0.45, 12), borderRadius: 14, padding: "8px 12px", color: T.inkSoft }}
      >
        表情包 {file} 暂时显示不了
      </div>
    );
  }
  return (
    <img
      src={memeSrc(file)}
      alt=""
      draggable={false}
      onError={() => setBad(true)}
      style={{
        WebkitTouchCallout: "none",
        width,
        display: "block",
        borderRadius: 18,
        border: "1.5px solid rgba(255,255,255,0.8)",
        boxShadow: "0 8px 22px rgba(46,68,62,0.16)",
      }}
    />
  );
}

function IconBtn({ onClick, label, active, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="kfs-tap flex-shrink-0 flex items-center justify-center"
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        color: active ? T.dai : T.inkSoft,
        backgroundColor: active ? "rgba(255,255,255,0.7)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end"
      onClick={onClose}
      style={{
        background: "rgba(36,54,49,0.2)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="kfs-sheet kfs-scroll overflow-y-auto"
        style={{
          ...glass(0.74, 34),
          borderRadius: 30,
          margin: "8px 8px calc(8px + env(safe-area-inset-bottom))",
          padding: "12px 20px 26px",
          maxHeight: "84%",
        }}
      >
        <div
          style={{
            width: 38,
            height: 5,
            borderRadius: 3,
            margin: "0 auto 12px",
            background: "rgba(52,74,68,0.22)",
          }}
        />
        <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
          <span style={{ fontFamily: SERIF, fontSize: 19, letterSpacing: "0.08em", color: T.ink }}>
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="kfs-tap flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "rgba(255,255,255,0.65)",
              color: T.inkSoft,
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Splash({ fading, onEnter }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 390, h: 844 });
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (ref.current) setBox({ w: ref.current.offsetWidth, h: ref.current.offsetHeight });
  }, []);
  const hasArt = !!SPLASH_IMG;
  // 图按cover铺满屏幕时，月亮和燕子落在哪
  const scale = Math.max(box.w / SPLASH.w, box.h / SPLASH.h);
  const ox = (box.w - SPLASH.w * scale) / 2;
  const oy = (box.h - SPLASH.h * scale) / 2;
  const mx = SPLASH.cx * scale + ox;
  const my = SPLASH.cy * scale + oy;
  const mr = SPLASH.r * scale;
  const k = SPLASH.kite;
  const kx = k.x * scale + ox;
  const ky = k.y * scale + oy;
  const kw = k.w * scale;
  const kh = k.h * scale;

  // 戳燕子：它先往月亮那边飞，门再开
  const tapKite = (e) => {
    e.stopPropagation();
    if (leaving) return;
    setLeaving(true);
    setTimeout(onEnter, 450);
  };

  return (
    <div
      ref={ref}
      onClick={hasArt ? undefined : onEnter}
      className="absolute inset-0 z-50 overflow-hidden"
      style={{
        background: hasArt ? SPLASH.paper : T.bg,
        opacity: fading ? 0 : 1,
        transition: "opacity .7s ease",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      {hasArt ? (
        <>
          <img
            src={SPLASH_IMG}
            alt=""
            draggable={false}
            className="kfs-splash-img"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            className="kfs-moonglow"
            style={{
              position: "absolute",
              left: mx - mr * 1.6,
              top: my - mr * 1.6,
              width: mr * 3.2,
              height: mr * 3.2,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,240,205,0.3) 0%, rgba(255,240,205,0.26) 50%, rgba(255,236,190,0.16) 64%, rgba(255,236,190,0) 100%)",
              mixBlendMode: "screen",
              pointerEvents: "none",
            }}
          />
          {KITE_IMG && (
            <button
              onClick={tapKite}
              aria-label="戳一下燕子，进开封府"
              style={{
                position: "absolute",
                left: kx - 18,
                top: ky - 18,
                width: kw + 36,
                height: kh + 36,
                padding: 18,
                background: "transparent",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <img
                src={KITE_IMG}
                alt=""
                draggable={false}
                className={leaving ? "kfs-kite-away" : "kfs-kite"}
                style={{ display: "block", width: kw, height: kh }}
              />
            </button>
          )}
        </>
      ) : (
        <>
          <Glows />
          <div className="relative h-full flex flex-col items-center justify-center">
            <Moon size={104} breath />
            <div style={{ fontFamily: SERIF, fontSize: 34, letterSpacing: "0.32em", paddingLeft: "0.32em", color: T.ink, marginTop: 46 }}>
              开封府
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DaysCard({ now }) {
  const n = dayNumber(now);
  const a = nextAnniv(now);
  const today = a.days === 0;
  return (
    <div
      className="relative overflow-hidden"
      style={{ ...glass(0.5, 26), borderRadius: 28, padding: "20px 20px 18px" }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          right: -40,
          top: -40,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,238,200,0.95) 0%, rgba(255,238,200,0) 68%)",
        }}
      />
      <div className="relative" style={{ fontSize: 13, color: T.inkSoft }}>
        {dateLabel(now)}
      </div>
      <div className="relative flex items-baseline" style={{ marginTop: 12, color: T.ink, gap: 6 }}>
        <span style={{ fontSize: 14 }}>在一起的第</span>
        <span style={{ fontFamily: SERIF, fontSize: 54, lineHeight: 1 }}>{n}</span>
        <span style={{ fontSize: 14 }}>天</span>
      </div>
      <div
        className="relative"
        style={{ marginTop: 12, fontSize: 12.5, color: today ? T.gold : T.inkSoft }}
      >
        {today ? `今天是我们的${a.name}纪念日` : `离${a.name}纪念日还有 ${a.days} 天`}
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="flex-shrink-0"
      style={{
        width: 46,
        height: 28,
        borderRadius: 999,
        padding: 3,
        background: on ? T.daiGrad : "rgba(96,118,112,0.25)",
        transition: "background .2s ease",
      }}
    >
      <span
        style={{
          display: "block",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 2px 6px rgba(30,46,42,0.25)",
          transform: on ? "translateX(18px)" : "none",
          transition: "transform .2s ease",
        }}
      />
    </button>
  );
}

function Tile({ icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="kfs-tap flex flex-col justify-between text-left"
      style={{ ...glass(0.46, 22), borderRadius: 24, padding: 16, aspectRatio: "1 / 0.92" }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 38,
          height: 38,
          borderRadius: 14,
          background: "rgba(255,255,255,0.7)",
          color: T.dai,
        }}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="block min-w-0 w-full">
        <span className="block" style={{ fontSize: 15, color: T.ink }}>
          {label}
        </span>
        <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
          {sub}
        </span>
      </span>
    </button>
  );
}

function HistoryCard({ index, currentId, onOpenAll, onOpen }) {
  const recent = index.slice(0, 3);
  return (
    <div style={{ ...glass(0.46, 24), borderRadius: 24, padding: "10px 16px 6px" }}>
      <button onClick={onOpenAll} className="kfs-tap w-full flex items-center justify-between" style={{ padding: "6px 0" }}>
        <span style={{ fontSize: 15, color: T.ink }}>历史对话</span>
        <Icon name="chevR" size={17} color={T.inkSoft} />
      </button>
      {recent.length === 0 ? (
        <p style={{ fontSize: 12.5, color: T.inkSoft, padding: "6px 0 10px" }}>
          聊过的对话会出现在这里
        </p>
      ) : (
        recent.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            className="w-full text-left block"
            style={{ padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.65)" }}
          >
            <span className="block truncate" style={{ fontSize: 14, color: c.id === currentId ? T.dai : T.ink }}>
              {c.title}
            </span>
            <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
              {c.preview}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function PhotoImg({ data, onOpen }) {
  if (!data) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ ...BUBBLE_GLASS, borderRadius: 18, width: 150, height: 112, fontSize: 12, color: T.inkSoft }}
      >
        {data === false ? "照片没存下来" : "照片加载中"}
      </div>
    );
  }
  return (
    <img
      src={data}
      alt=""
      draggable={false}
      onClick={() => onOpen && onOpen(data)}
      style={{
        WebkitTouchCallout: "none",
        display: "block",
        maxWidth: 210,
        maxHeight: 280,
        borderRadius: 18,
        border: "1.5px solid rgba(255,255,255,0.8)",
        boxShadow: "0 8px 22px rgba(46,68,62,0.16)",
      }}
    />
  );
}

function VoiceBubble({ text, dur }) {
  return (
    <div style={{ ...BUBBLE_GLASS, borderRadius: 22, padding: "10px 15px", minWidth: 92 }}>
      <div className="flex items-center" style={{ gap: 8, color: T.dai }}>
        <Icon name="wave" size={18} />
        <span style={{ fontSize: 14, color: T.ink }}>{dur || 1}″</span>
      </div>
      {text ? (
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 6, lineHeight: 1.55 }}>
          {text}
        </div>
      ) : null}
    </div>
  );
}

function RoundBtn({ onClick, label, active, children }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      aria-label={label}
      className="kfs-tap flex-shrink-0 flex items-center justify-center"
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        color: active ? "#fff" : T.inkSoft,
        background: active ? T.daiGrad : "rgba(255,255,255,0.42)",
        border: "1px solid rgba(255,255,255,0.65)",
      }}
    >
      {children}
    </button>
  );
}

function BubbleRow({ row, avatars, animate, imgs = {}, onOpenPhoto, onLongPress }) {
  const press = useRef(null);
  const fired = useRef(false);
  const startPress = (e) => {
    const t = e.touches[0];
    const el = e.currentTarget;
    fired.current = false;
    press.current = {
      x: t.clientX,
      y: t.clientY,
      timer: setTimeout(() => {
        press.current = null;
        fired.current = true;
        if (onLongPress) onLongPress(row, el.getBoundingClientRect());
      }, 450),
    };
  };
  const movePress = (e) => {
    const p = press.current;
    if (!p) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - p.x) > 8 || Math.abs(t.clientY - p.y) > 8) {
      clearTimeout(p.timer);
      press.current = null;
    }
  };
  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const her = row.role === "her";
  // 照iOS短信：四个角一样圆，多长都不变方
  const radius = 22;
  const it = row.item;
  const skin = BUBBLE_GLASS;
  return (
    <div
      className={`flex items-end ${her ? "flex-row-reverse" : ""}`}
      style={{ gap: 8, marginTop: row.first ? 12 : 3 }}
    >
      <div style={{ width: 34, flexShrink: 0 }}>
        {row.last && <Avatar av={her ? avatars.her : avatars.him} who={row.role} size={34} />}
      </div>
      <div
        className={animate ? "kfs-in" : ""}
        onTouchStart={startPress}
        onTouchMove={movePress}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onLongPress) onLongPress(row, e.currentTarget.getBoundingClientRect());
        }}
        onClickCapture={(e) => {
          if (fired.current) {
            e.stopPropagation();
            e.preventDefault();
            fired.current = false;
          }
        }}
        style={{
          maxWidth: "74%",
          display: "flex",
          flexDirection: "column",
          alignItems: her ? "flex-end" : "flex-start",
          transformOrigin: her ? "bottom right" : "bottom left",
          WebkitTouchCallout: "none",
        }}
      >
        {it.type === "meme" ? (
          <MemeImg file={it.file} />
        ) : it.type === "photo" ? (
          <PhotoImg data={imgs[it.imgId]} onOpen={onOpenPhoto} />
        ) : it.type === "voice" ? (
          <VoiceBubble text={it.text} dur={it.dur} />
        ) : (
          <div
            className="whitespace-pre-wrap break-words"
            style={{ padding: "10px 15px", fontSize: 15.5, lineHeight: 1.55, borderRadius: radius, userSelect: "none", WebkitUserSelect: "none", ...skin }}
          >
            {renderRich(it.text || "")}
          </div>
        )}
      </div>
    </div>
  );
}

// 状态栏有多高（没有刘海区时是 0）
function safeTopPx() {
  try {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
    document.body.appendChild(d);
    const h = d.getBoundingClientRect().height || 0;
    d.remove();
    return h;
  } catch (e) {
    return 0;
  }
}

function MsgMenu({ menu, now, busy, onClose, onCopy, onEdit, onRetry }) {
  const { row, rect } = menu;
  const her = row.role === "her";
  const it = row.item;
  const acts = [];
  if (it.type === "text" || it.type === "voice") acts.push({ k: "copy", label: "复制", icon: "copy" });
  if (her && it.type === "text") acts.push({ k: "edit", label: "编辑", icon: "pen" });
  if (!her) acts.push({ k: "retry", label: "重新回答", icon: "retry" });
  const menuW = 196;
  const menuH = 44 + acts.length * 47;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 844;
  let top = rect.top - menuH - 10;
  if (top < 12 + safeTopPx()) top = Math.min(rect.bottom + 10, vh - menuH - 12);
  let left = her ? rect.right - menuW : rect.left;
  left = Math.max(12, Math.min(left, vw - menuW - 12));
  return (
    <div className="absolute inset-0 z-50" onClick={onClose} style={{ background: "rgba(20,32,29,0.14)" }}>
      <div
        className="kfs-in"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", top, left, width: menuW, ...glass(0.86, 30), borderRadius: 22, padding: "4px 0 6px" }}
      >
        <div style={{ padding: "10px 18px 6px", fontSize: 12, color: T.inkSoft }}>{sepLabel(row.msg.ts, now)}</div>
        {acts.map((a) => {
          const off = busy && a.k !== "copy";
          return (
            <button
              key={a.k}
              disabled={off}
              onClick={() => (a.k === "copy" ? onCopy(row) : a.k === "edit" ? onEdit(row) : onRetry(row))}
              className="w-full flex items-center text-left"
              style={{ gap: 12, padding: "12px 18px", fontSize: 15, color: T.ink, opacity: off ? 0.4 : 1 }}
            >
              <Icon name={a.icon} size={19} />
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CtrlRow({ row, busy, onPrev, onNext, onRetry }) {
  const her = row.role === "her";
  const m = row.msg;
  const n = m.alts ? m.alts.length : 1;
  const cur = m.alts ? m.altIdx + 1 : 1;
  const btn = (enabled) => ({ padding: "4px 6px", opacity: enabled && !busy ? 1 : 0.35, display: "inline-flex" });
  return (
    <div
      className={`flex items-center ${her ? "justify-end" : ""}`}
      style={{ gap: 2, marginTop: 4, marginLeft: her ? 0 : 38, marginRight: her ? 38 : 0, color: T.inkSoft, fontSize: 12 }}
    >
      {n > 1 && (
        <>
          <button onClick={onPrev} disabled={busy || cur <= 1} aria-label="上一个版本" style={btn(cur > 1)}>
            <Icon name="chevL" size={14} />
          </button>
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 26, textAlign: "center" }}>
            {cur}/{n}
          </span>
          <button onClick={onNext} disabled={busy || cur >= n} aria-label="下一个版本" style={btn(cur < n)}>
            <Icon name="chevR" size={14} />
          </button>
        </>
      )}
      {!her && row.latest && (
        <button
          onClick={onRetry}
          disabled={busy}
          className="kfs-tap flex items-center"
          style={{ gap: 4, padding: "4px 8px", borderRadius: 999, opacity: busy ? 0.35 : 1 }}
        >
          <Icon name="retry" size={14} />
          <span>重新回答</span>
        </button>
      )}
    </div>
  );
}

function ThinkingRow({ msg, open, onToggle }) {
  return (
    <div className="flex flex-col items-start" style={{ marginLeft: 42, marginTop: 14 }}>
      <button
        onClick={onToggle}
        className="kfs-tap flex items-center"
        style={{
          ...glass(0.38, 14),
          gap: 3,
          borderRadius: 999,
          padding: "4px 10px 4px 12px",
          fontSize: 12,
          color: T.inkSoft,
        }}
      >
        <span>思考过程</span>
        <span
          style={{
            display: "inline-flex",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .25s ease",
          }}
        >
          <Icon name="chevR" size={13} />
        </span>
      </button>
      {open && (
        <div
          className="kfs-in whitespace-pre-wrap"
          style={{
            marginTop: 8,
            maxWidth: "80%",
            padding: "12px 15px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.34)",
            border: "1px dashed rgba(63,106,98,0.3)",
            color: T.inkSoft,
            fontFamily: SERIF,
            fontSize: 13.5,
            lineHeight: 1.8,
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        >
          {msg.thinking}
        </div>
      )}
    </div>
  );
}

function NoticeRow({ row, animate }) {
  return (
    <div
      className={`flex items-center justify-center ${animate ? "kfs-in" : ""}`}
      style={{ gap: 7, margin: "16px 0 6px" }}
    >
      <Avatar av={row.av} who={row.who} size={22} />
      <span style={{ fontSize: 11.5, color: T.inkFaint }}>{row.text}</span>
    </div>
  );
}

function TypingRow({ avatars }) {
  return (
    <div className="flex items-end kfs-in" style={{ gap: 8, marginTop: 12 }}>
      <Avatar av={avatars.him} who="him" size={34} />
      <div
        className="flex items-center"
        style={{
          gap: 5,
          padding: "13px 16px",
          borderRadius: 22,
          ...BUBBLE_GLASS,
        }}
      >
        <span className="kfs-dot" />
        <span className="kfs-dot" style={{ animationDelay: ".15s" }} />
        <span className="kfs-dot" style={{ animationDelay: ".3s" }} />
      </div>
    </div>
  );
}

function MoodChips({ value = [], onToggle, readOnly }) {
  return (
    <div className="flex flex-wrap" style={{ gap: 6 }}>
      {MOODS.filter((m) => !readOnly || value.includes(m.k)).map((m) => {
        const on = value.includes(m.k);
        return (
          <button
            key={m.k}
            disabled={readOnly}
            onClick={() => onToggle && onToggle(m.k)}
            className={readOnly ? "" : "kfs-tap"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              borderRadius: 999,
              fontSize: 12.5,
              color: on ? "#fff" : T.inkSoft,
              background: on ? T.daiGrad : "rgba(255,255,255,0.5)",
              border: "1px solid rgba(255,255,255,0.7)",
            }}
          >
            <span style={{ fontSize: 13 }}>{m.e}</span>
            {m.t}
          </button>
        );
      })}
    </div>
  );
}

function DiaryPage({ now, onBack, loadMonth, saveEntry, loadDays, writeHis }) {
  const todayKey = dayKeyOf(now);
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [month, setMonth] = useState({});
  const [counts, setCounts] = useState({});
  const [sel, setSel] = useState(todayKey);
  const [draft, setDraft] = useState(null);
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(null);

  useEffect(() => {
    loadDays().then((c) => setCounts(c || {}));
  }, []);
  useEffect(() => {
    loadMonth(ymKeyOf(ym.y, ym.m)).then((d) => setMonth(d || {}));
    setDraft(null);
    setErr("");
    setArmed(null);
  }, [ym.y, ym.m]);

  const goMonth = (dir) => {
    let m = ym.m + dir;
    let y = ym.y;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setYm({ y, m });
    setSel(y === now.getFullYear() && m === now.getMonth() ? todayKey : null);
  };

  const cells = monthCells(ym.y, ym.m);
  const entry = (sel && month[sel]) || {};
  const her = entry.her || {};
  const him = entry.him || {};
  const selDate = sel ? parseDayKey(sel) : null;
  const together = selDate ? dayNumber(selDate) : 0;
  const isStart = (y, m, d) => y > START.y || (y === START.y && (m > START.m || (m === START.m && d >= START.d)));

  const save = async (who, value) => {
    const next = await saveEntry(sel, who, value);
    setMonth(next);
  };
  const toggleMood = (k) => {
    const moods = her.moods || [];
    const nextMoods = moods.includes(k) ? moods.filter((x) => x !== k) : moods.concat([k]);
    save("her", { ...her, moods: nextMoods, updatedAt: Date.now() });
  };
  const askHim = async () => {
    setWriting(true);
    setErr("");
    try {
      const e = await writeHis(sel, her);
      const next = await saveEntry(sel, "him", e);
      setMonth(next);
    } catch (x) {
      setErr(`没写成（${String((x && x.message) || x).slice(0, 50)}）`);
    }
    setWriting(false);
  };

  const card = { ...glass(0.5, 26), borderRadius: 28, padding: 18 };
  const legendCell = (lv) => ({ width: 14, height: 14, borderRadius: 4, background: `rgba(63,106,98,${[0.06, 0.12, 0.22, 0.34, 0.48][lv]})` });

  return (
    <div className="absolute inset-0 z-40 flex flex-col kfs-page" style={{ background: T.bg }}>
      <Glows />
      <div className="relative z-10 flex items-center" style={{ ...glass(0.52, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}>
        <IconBtn onClick={onBack} label="返回">
          <Icon name="chevL" />
        </IconBtn>
        <div className="flex-1 text-center" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.12em", color: T.ink }}>
          日记本
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto kfs-scroll" style={{ padding: "12px 12px calc(24px + env(safe-area-inset-bottom))" }}>
        {/* 月历 */}
        <div style={card}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <IconBtn onClick={() => goMonth(-1)} label="上个月">
              <Icon name="chevL" size={18} />
            </IconBtn>
            <div style={{ fontFamily: SERIF, fontSize: 19, color: T.ink, letterSpacing: "0.06em" }}>
              {ym.y}年{ym.m + 1}月
            </div>
            <IconBtn onClick={() => goMonth(1)} label="下个月">
              <Icon name="chevR" size={18} />
            </IconBtn>
          </div>
          <div className="grid grid-cols-7" style={{ gap: 6, marginBottom: 6 }}>
            {"一二三四五六日".split("").map((w) => (
              <div key={w} className="text-center" style={{ fontSize: 11.5, color: T.inkFaint }}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" style={{ gap: 6 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={"b" + i} />;
              const key = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`;
              const future = key > todayKey;
              const n = counts[key] || 0;
              const lv = heatLevel(n);
              const e = month[key] || {};
              const mood = moodOf(((e.her && e.her.moods) || [])[0] || ((e.him && e.him.moods) || [])[0]);
              const selected = key === sel;
              const today = key === todayKey;
              const anniv = d === START.d && isStart(ym.y, ym.m, d);
              return (
                <button
                  key={key}
                  disabled={future}
                  onClick={() => {
                    setSel(key);
                    setDraft(null);
                    setErr("");
                    setArmed(null);
                  }}
                  className="relative flex flex-col items-center justify-center"
                  style={{
                    aspectRatio: "1 / 1.1",
                    borderRadius: 13,
                    background: selected ? "rgba(255,255,255,0.82)" : `rgba(63,106,98,${[0.05, 0.12, 0.22, 0.34, 0.48][lv]})`,
                    border: selected ? `1.5px solid ${T.dai}` : today ? `1.5px dashed ${T.dai}` : "1.5px solid transparent",
                    opacity: future ? 0.32 : 1,
                  }}
                >
                  {e.her && e.her.text ? (
                    <span style={{ position: "absolute", top: 4, right: 5, width: 5, height: 5, borderRadius: "50%", background: T.dai }} />
                  ) : null}
                  {e.him && e.him.text ? (
                    <span style={{ position: "absolute", top: 4, right: e.her && e.her.text ? 12 : 5, width: 5, height: 5, borderRadius: "50%", background: "#B9914C" }} />
                  ) : null}
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.1, color: anniv ? T.gold : T.ink }}>{d}</span>
                  <span style={{ fontSize: mood ? 11 : 9.5, lineHeight: 1.3, color: T.inkSoft, minHeight: 13 }}>
                    {mood ? mood.e : n ? n : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.7)", fontSize: 11.5, color: T.inkSoft }}>
            <span className="flex items-center" style={{ gap: 4 }}>
              少
              {[0, 1, 2, 3, 4].map((lv) => (
                <span key={lv} style={legendCell(lv)} />
              ))}
              多
            </span>
            <span className="flex items-center" style={{ gap: 10 }}>
              <span className="flex items-center" style={{ gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.dai }} />你写的
              </span>
              <span className="flex items-center" style={{ gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B9914C" }} />我写的
              </span>
            </span>
          </div>
        </div>

        {/* 这一天 */}
        {sel ? (
          <div style={{ ...card, marginTop: 12 }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: T.ink }}>
              {selDate.getMonth() + 1}月{selDate.getDate()}日 星期{WEEK[selDate.getDay()]}
            </div>
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
              {[together >= 1 ? `在一起的第${together}天` : "", counts[sel] ? `这天说了 ${counts[sel]} 句` : "这天没在开封府说话"].filter(Boolean).join("，")}
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "16px 0" }} />
            <div style={{ fontSize: 12.5, color: T.dai, marginBottom: 10 }}>你写的</div>
            <MoodChips value={her.moods || []} onToggle={toggleMood} />
            <div style={{ marginTop: 12 }}>
              {draft !== null ? (
                <>
                  <textarea
                    className="kfs-field"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="这天发生了什么"
                    rows={5}
                    style={{ ...field, resize: "none", lineHeight: 1.6, userSelect: "text", WebkitUserSelect: "text" }}
                  />
                  <div className="flex" style={{ gap: 8, marginTop: 10 }}>
                    <button
                      onClick={() => {
                        save("her", { ...her, text: draft.trim(), updatedAt: Date.now() });
                        setDraft(null);
                      }}
                      className="kfs-tap"
                      style={chipPrimary}
                    >
                      保存
                    </button>
                    <button onClick={() => setDraft(null)} className="kfs-tap" style={chip}>
                      取消
                    </button>
                  </div>
                </>
              ) : her.text ? (
                <>
                  <div className="whitespace-pre-wrap" style={{ fontSize: 14.5, lineHeight: 1.75, color: T.ink }}>{her.text}</div>
                  <div className="flex" style={{ gap: 8, marginTop: 10 }}>
                    <button onClick={() => setDraft(her.text)} className="kfs-tap" style={chip}>
                      编辑
                    </button>
                    <button
                      onClick={() => {
                        if (armed !== "her") {
                          setArmed("her");
                          return;
                        }
                        save("her", { ...her, text: "", updatedAt: Date.now() });
                        setArmed(null);
                      }}
                      className="kfs-tap"
                      style={{ ...chip, color: "#A8473D" }}
                    >
                      {armed === "her" ? "再点一次删掉" : "删掉"}
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => setDraft("")} className="kfs-tap" style={chip}>
                  写几句
                </button>
              )}
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "18px 0 16px" }} />
            <div style={{ fontSize: 12.5, color: "#94733A", marginBottom: 10 }}>我写的</div>
            {him.text ? (
              <>
                {him.moods && him.moods.length ? (
                  <div style={{ marginBottom: 10 }}>
                    <MoodChips value={him.moods} readOnly />
                  </div>
                ) : null}
                <div className="whitespace-pre-wrap" style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.85, color: T.ink }}>{him.text}</div>
                <div className="flex" style={{ gap: 8, marginTop: 12 }}>
                  <button onClick={askHim} disabled={writing} className="kfs-tap" style={{ ...chip, opacity: writing ? 0.5 : 1 }}>
                    {writing ? "我在写……" : "重写"}
                  </button>
                  <button
                    onClick={() => {
                      if (armed !== "him") {
                        setArmed("him");
                        return;
                      }
                      save("him", null);
                      setArmed(null);
                    }}
                    className="kfs-tap"
                    style={{ ...chip, color: "#A8473D" }}
                  >
                    {armed === "him" ? "再点一次删掉" : "删掉"}
                  </button>
                </div>
              </>
            ) : (
              <button onClick={askHim} disabled={writing} className="kfs-tap" style={{ ...chipPrimary, opacity: writing ? 0.6 : 1 }}>
                {writing ? "我在写……" : "我来写这一天"}
              </button>
            )}
            {err && <div style={{ fontSize: 12, color: "#A8473D", marginTop: 10 }}>{err}</div>}
          </div>
        ) : (
          <div className="text-center" style={{ ...card, marginTop: 12, fontSize: 13, color: T.inkSoft }}>
            点一天看看
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryPage({ index, currentId, now, onBack, onOpen, onDelete }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="absolute inset-0 z-40 flex flex-col kfs-page" style={{ background: T.bg }}>
      <Glows />
      <div
        className="relative z-10 flex items-center"
        style={{ ...glass(0.52, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}
      >
        <IconBtn onClick={onBack} label="返回">
          <Icon name="chevL" />
        </IconBtn>
        <div className="flex-1 text-center" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.1em", color: T.ink }}>
          历史对话
        </div>
        <button onClick={() => setEditing(!editing)} className="kfs-tap" style={{ padding: "8px 12px", fontSize: 14, color: T.dai }}>
          {editing ? "完成" : "编辑"}
        </button>
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto kfs-scroll flex flex-col" style={{ padding: 12, gap: 8 }}>
        {index.length === 0 && (
          <p className="text-center" style={{ fontSize: 13, color: T.inkSoft, marginTop: 64 }}>
            还没有对话。回去说句话，这里就有了。
          </p>
        )}
        {index.map((c) => (
          <div
            key={c.id}
            className="flex items-center"
            style={{ ...glass(c.id === currentId ? 0.66 : 0.46, 22), borderRadius: 20, padding: "12px 14px", gap: 8 }}
          >
            <button className="flex-1 text-left min-w-0" onClick={() => onOpen(c.id)}>
              <span className="flex items-baseline justify-between" style={{ gap: 8 }}>
                <span className="truncate" style={{ fontSize: 15, color: T.ink }}>
                  {c.title}
                </span>
                <span className="flex-shrink-0" style={{ fontSize: 11, color: T.inkSoft }}>
                  {shortDate(c.updatedAt, now)}
                </span>
              </span>
              <span className="block truncate" style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3 }}>
                {c.preview}
              </span>
            </button>
            {editing && (
              <button
                onClick={() => onDelete(c.id)}
                aria-label="删除这段对话"
                className="kfs-tap flex items-center justify-center flex-shrink-0"
                style={{ width: 36, height: 36, borderRadius: 999, color: "#B4544A", background: "rgba(255,255,255,0.6)" }}
              >
                <Icon name="trash" size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HisAvatarCard({ av, name }) {
  return (
    <div className="flex items-center" style={{ ...glass(0.5, 16), borderRadius: 20, padding: 14, gap: 14 }}>
      <Avatar av={av} who="him" size={48} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 15, color: T.ink }}>光义</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 3, lineHeight: 1.5 }}>
          现在是「{name}」，我自己挑的。想看我换，跟我说。
        </div>
      </div>
    </div>
  );
}

function AvatarSection({ av, onChange }) {
  const who = "her";
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
  const presets = HER_PRESETS;
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setErr("");
    try {
      const data = await fileToAvatar(f);
      onChange({ type: "upload", data });
    } catch (x) {
      setErr("这张图读不出来，换一张试试");
    }
  };
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="flex items-center" style={{ gap: 16 }}>
        <Avatar av={av} who={who} size={64} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 16, color: T.ink }}>卿卿</div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 3 }}>
            聊到一半换也行，我看得见
          </div>
        </div>
      </div>
      <div className="flex flex-wrap" style={{ gap: 8, marginTop: 14 }}>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="kfs-tap" style={chipPrimary}>
          从相册选
        </button>
        {presets.map((p) => (
          <button
            key={p.file}
            onClick={() => onChange({ type: "meme", file: p.file })}
            className="kfs-tap flex items-center"
            style={{ ...chip, gap: 6, padding: "5px 12px 5px 5px" }}
          >
            <img src={memeSrc(p.file)} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
            {p.label}
          </button>
        ))}
        {av && (
          <button onClick={() => onChange(null)} className="kfs-tap" style={chip}>
            恢复默认
          </button>
        )}
      </div>
      {err && <div style={{ fontSize: 12, color: "#B4544A", marginTop: 8 }}>{err}</div>}
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}

function fmtChars(n) {
  return n < 10000 ? `${n} 字` : `${(n / 10000).toFixed(1)} 万字`;
}

function MemoryPanel({ files, texts, note, onUpload, onToggle, onDelete }) {
  const fileRef = useRef(null);
  const [viewing, setViewing] = useState(null);
  const [armed, setArmed] = useState(null);
  const total = files.filter((f) => f.enabled).reduce((s, f) => s + (f.size || 0), 0);

  if (viewing) {
    const f = files.find((x) => x.id === viewing);
    const text = (f && texts[f.id]) || "";
    return (
      <div>
        <button onClick={() => setViewing(null)} className="kfs-tap flex items-center" style={{ gap: 2, fontSize: 13.5, color: T.dai, marginBottom: 12 }}>
          <Icon name="chevL" size={16} /> 返回列表
        </button>
        <div style={{ fontSize: 15, color: T.ink, marginBottom: 4 }}>{f ? f.name : ""}</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 12 }}>{fmtChars(text.length)}</div>
        <div
          className="whitespace-pre-wrap break-words"
          style={{ ...glass(0.42, 12), borderRadius: 18, padding: 14, fontSize: 13, lineHeight: 1.7, color: T.ink, userSelect: "text", WebkitUserSelect: "text" }}
        >
          {text.length > 30000 ? text.slice(0, 30000) + "\n\n（太长了，这里只显示前三万字，光义那边收到的是全文）" : text}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
        打开开关的文档会整份带给我，当作我的记忆。只认纯文字文档，比如 .md 和 .txt。同名文件再传一次，会覆盖旧的那份。
      </p>
      <div className="flex items-center flex-wrap" style={{ gap: 10, marginBottom: 14 }}>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="kfs-tap" style={chipPrimary}>
          上传文档
        </button>
        {note && <span style={{ fontSize: 12.5, color: T.inkSoft }}>{note}</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          e.target.value = "";
          if (list.length) onUpload(list);
        }}
        style={{ display: "none" }}
      />
      {files.length === 0 ? (
        <div style={{ ...glass(0.36, 12), borderRadius: 18, padding: "18px 16px", fontSize: 13, color: T.inkSoft, textAlign: "center" }}>
          还没有文档。把project里的那几封信传上来吧。
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {files.map((f) => (
            <div key={f.id} className="flex items-center" style={{ ...glass(f.enabled ? 0.56 : 0.34, 16), borderRadius: 18, padding: "10px 12px", gap: 10 }}>
              <button onClick={() => setViewing(f.id)} className="flex items-center flex-1 min-w-0 text-left" style={{ gap: 10 }}>
                <span style={{ color: f.enabled ? T.dai : T.inkFaint, flexShrink: 0 }}>
                  <Icon name="doc" size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate" style={{ fontSize: 14, color: f.enabled ? T.ink : T.inkSoft }}>
                    {f.name}
                  </span>
                  <span className="block" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
                    {fmtChars(f.size || 0)}
                  </span>
                </span>
              </button>
              <button
                onClick={() => {
                  if (armed === f.id) {
                    onDelete(f.id);
                    setArmed(null);
                  } else setArmed(f.id);
                }}
                aria-label="删除文档"
                className="kfs-tap flex items-center justify-center flex-shrink-0"
                style={{ height: 30, minWidth: 30, padding: armed === f.id ? "0 10px" : 0, borderRadius: 999, color: "#A8473D", background: "rgba(255,255,255,0.55)", fontSize: 12 }}
              >
                {armed === f.id ? "确认删除" : <Icon name="trash" size={16} />}
              </button>
              <Toggle on={f.enabled} onChange={(v) => onToggle(f.id, v)} label={`带上${f.name}`} />
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div style={{ fontSize: 12, color: total > 80000 ? "#A8473D" : T.inkSoft, marginTop: 14, lineHeight: 1.6 }}>
          带上的文档一共{fmtChars(total)}。
          {total > 80000 ? "带得越多，我回话越慢，用不上的可以先关掉。" : ""}
        </div>
      )}
    </div>
  );
}

function McpPanel({ mcps, onChange }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", url: "", token: "" });
  const [armed, setArmed] = useState(false);

  const openEdit = (m) => {
    setEditing(m ? m.id : "new");
    setForm({ name: m ? m.name : "", url: m ? m.url : "", token: m ? m.token || "" : "" });
    setArmed(false);
  };
  const save = () => {
    const name = form.name.trim();
    const url = form.url.trim();
    if (!name || !/^https?:\/\//.test(url)) return;
    if (editing === "new") {
      onChange(mcps.concat([{ id: newId(), name, url, token: form.token.trim(), enabled: true }]));
    } else {
      onChange(mcps.map((m) => (m.id === editing ? { ...m, name, url, token: form.token.trim() } : m)));
    }
    setEditing(null);
  };

  if (editing) {
    const valid = form.name.trim() && /^https?:\/\//.test(form.url.trim());
    return (
      <div>
        <button onClick={() => setEditing(null)} className="kfs-tap flex items-center" style={{ gap: 2, fontSize: 13.5, color: T.dai, marginBottom: 14 }}>
          <Icon name="chevL" size={16} /> 返回列表
        </button>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>名字</div>
        <input className="kfs-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="比如 Notion" style={field} />
        <div style={{ fontSize: 12, color: T.inkSoft, margin: "14px 0 6px" }}>链接</div>
        <input className="kfs-field" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" autoCapitalize="off" autoCorrect="off" style={field} />
        <div style={{ fontSize: 12, color: T.inkSoft, margin: "14px 0 6px" }}>授权token（需要登录的服务才填）</div>
        <input className="kfs-field" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="可不填" autoCapitalize="off" autoCorrect="off" style={field} />
        <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 18 }}>
          <button onClick={save} className="kfs-tap" style={{ ...chipPrimary, opacity: valid ? 1 : 0.45 }}>
            保存
          </button>
          {editing !== "new" && (
            <button
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  return;
                }
                onChange(mcps.filter((m) => m.id !== editing));
                setEditing(null);
              }}
              className="kfs-tap"
              style={{ ...chip, color: "#A8473D" }}
            >
              {armed ? "再点一次，删掉它" : "删除"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
        打开的工具会带进每次对话。需要登录的服务要填授权token，不然连不上。
      </p>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {mcps.map((m) => (
          <div key={m.id} className="flex items-center" style={{ ...glass(m.enabled ? 0.56 : 0.34, 16), borderRadius: 18, padding: "10px 12px", gap: 10 }}>
            <button onClick={() => openEdit(m)} className="flex items-center flex-1 min-w-0 text-left" style={{ gap: 10 }}>
              <span style={{ color: m.enabled ? T.dai : T.inkFaint, flexShrink: 0 }}>
                <Icon name="plug" size={20} />
              </span>
              <span className="min-w-0">
                <span className="block truncate" style={{ fontSize: 14, color: T.ink }}>
                  {m.name}
                </span>
                <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
                  {m.url}
                </span>
              </span>
            </button>
            <Toggle on={m.enabled} onChange={(v) => onChange(mcps.map((x) => (x.id === m.id ? { ...x, enabled: v } : x)))} label={`启用${m.name}`} />
          </div>
        ))}
      </div>
      <button onClick={() => openEdit(null)} className="kfs-tap flex items-center" style={{ ...chip, gap: 6, marginTop: 14 }}>
        <Icon name="plus" size={16} /> 添加 MCP
      </button>
    </div>
  );
}

function ApiPanel({ settings, onChange, onTest, testNote, testing, usage, monthUsage }) {
  const lengths = [
    { v: 1024, t: "短" },
    { v: 2048, t: "适中" },
    { v: 4096, t: "长" },
  ];
  const cur = settings.maxTokens || 2048;
  const row = (k, v) => (
    <div key={k} className="flex items-center justify-between" style={{ fontSize: 13, color: T.ink, padding: "5px 0", gap: 12 }}>
      <span style={{ color: T.inkSoft, flexShrink: 0 }}>{k}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{v}</span>
    </div>
  );
  const month = monthUsage && monthUsage.month === usageKey() ? monthUsage : null;
  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
        你的 key 锁在 Supabase 的保险柜里，手机上没有。开封府每次说话，都是先在门口核对是你，再替你转给 Anthropic。
      </p>
      <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
        <button onClick={onTest} disabled={testing} className="kfs-tap" style={{ ...chip, opacity: testing ? 0.5 : 1 }}>
          {testing ? "正在测试…" : "测试连接"}
        </button>
        {testNote && <span style={{ fontSize: 12.5, color: T.inkSoft }}>{testNote}</span>}
      </div>

      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>回复最长多少</div>
      <div className="flex" style={{ ...glass(0.4, 12), borderRadius: 999, padding: 4 }}>
        {lengths.map((l) => (
          <button
            key={l.v}
            onClick={() => onChange({ maxTokens: l.v })}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 999,
              fontSize: 13.5,
              color: cur === l.v ? "#fff" : T.inkSoft,
              background: cur === l.v ? T.daiGrad : "transparent",
              transition: "background .2s ease",
            }}
          >
            {l.t}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>只是上限，平时聊天用不满。写长信、讲故事时可以调长。</p>

      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>用量</div>
      <div style={{ ...glass(0.45, 14), borderRadius: 18, padding: "10px 14px" }}>
        {row("本月", month && month.replies ? `约 ${money(month.cost)}，${month.replies} 次` : "还没花钱")}
        {usage
          ? [
              row("上一条", `约 ${money(usage.cost)}，${modelLabel(usage.model)}`),
              row("从缓存读", (usage.cache_read_input_tokens || 0).toLocaleString()),
              row("写进缓存", (usage.cache_creation_input_tokens || 0).toLocaleString()),
              row("新读", (usage.input_tokens || 0).toLocaleString()),
              row("写出", (usage.output_tokens || 0).toLocaleString()),
            ]
          : row("上一条", "这次打开还没说话")}
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
        单位是 token，钱是照官方价格估的，以 Anthropic 后台的账单为准。从缓存读的部分只收原价的一成甚至更少，所以聊得越连贯越省。
      </p>
    </div>
  );
}

function ModelPanel({ current, onPick }) {
  const [custom, setCustom] = useState(MODELS.find((m) => m.id === current) ? "" : current);
  return (
    <div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {MODELS.map((m) => {
          const active = current === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onPick(m.id)}
              className="flex items-center text-left"
              style={{ ...glass(active ? 0.62 : 0.36, 14), borderRadius: 16, padding: "11px 14px", gap: 10 }}
            >
              <span className="flex-1 min-w-0">
                <span className="block" style={{ fontSize: 15, color: T.ink }}>
                  {m.label}
                </span>
                <span className="block" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
                  {m.note}
                </span>
              </span>
              {active && <Icon name="check" size={18} color={T.dai} sw={2.2} />}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>其他模型ID（以后出新模型时用）</div>
        <div className="flex" style={{ gap: 8 }}>
          <input className="kfs-field" value={custom} onChange={(e) => setCustom(e.target.value.trim())} placeholder="claude-…" autoCapitalize="off" autoCorrect="off" style={field} />
          <button onClick={() => custom && onPick(custom)} className="kfs-tap flex-shrink-0" style={chipPrimary}>
            用这个
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================
//   主体
// =========================================================
const DEFAULT_SETTINGS = { model: DEFAULT_MODEL, maxTokens: 2048, mcps: DEFAULT_MCPS };

// 最后一条（不算换头像提示）是她的话，就说明还欠她一个回复
function needsReply(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "event") continue;
    return msgs[i].role === "her";
  }
  return false;
}

// 回复插在这次请求的最后一条后面，回复途中她又发的排在回复后面
function insertReply(base, lastMsgId, him) {
  const pos = lastMsgId ? base.findIndex((m) => m.id === lastMsgId) : -1;
  return pos >= 0 ? base.slice(0, pos + 1).concat([him], base.slice(pos + 1)) : base.concat([him]);
}

const usageKey = (d = new Date()) => `kfs2:usage:${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function App({ account = {} }) {
  const rootRef = useRef(null);
  const [W, setW] = useState(390);
  const drawerW = Math.round(W * 0.82);

  const [splash, setSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);

  const [index, setIndex] = useState([]);
  const indexRef = useRef([]);
  const [chatId, setChatId] = useState(() => newId());
  const chatIdRef = useRef(chatId);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const [avatars, setAvatars] = useState({ her: null, him: HIS_DEFAULT });
  const avatarsRef = useRef({ her: null, him: HIS_DEFAULT });
  const [extraMemes, setExtraMemes] = useState([]);
  const [memFiles, setMemFiles] = useState([]);
  const memFilesRef = useRef([]);
  const [memTexts, setMemTexts] = useState({});
  const memTextsRef = useRef({});
  const [memNote, setMemNote] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragX, setDragX] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memePanel, setMemePanel] = useState(false);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const pendingRef = useRef(false);
  const timerRef = useRef(null);
  const flagsRef = useRef({ noCache: false });
  const [reveal, setReveal] = useState(null);
  const [errorNote, setErrorNote] = useState("");
  const [storageOk, setStorageOk] = useState(true);
  const [storageBanner, setStorageBanner] = useState(false);
  const [openThinking, setOpenThinking] = useState({});
  const [clearArmed, setClearArmed] = useState(false);
  const [testNote, setTestNote] = useState("");
  const [testing, setTesting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // 照片与语音
  const [attach, setAttach] = useState([]);
  const [imgs, setImgs] = useState({});
  const imgsRef = useRef({});
  const [viewer, setViewer] = useState(null);
  const photoInputRef = useRef(null);
  const [voiceNote, setVoiceNote] = useState("");
  const [dictating, setDictating] = useState(false);
  const [recording, setRecording] = useState(null);
  const recordingRef = useRef(null);
  const recRef = useRef(null);
  const dictBaseRef = useRef("");
  const [, setTick] = useState(0);
  const [menu, setMenu] = useState(null);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [diaryToday, setDiaryToday] = useState({ her: false, him: false });
  const diaryCache = useRef({});
  const dayMsgsRef = useRef({});
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState("");
  const [copySheet, setCopySheet] = useState("");
  const [usage, setUsage] = useState(null);
  const [monthUsage, setMonthUsage] = useState(null);
  const [sync, setSync] = useState({ pending: 0, syncing: false, offline: false, lastSync: 0 });
  const [logoutArmed, setLogoutArmed] = useState(false);
  const [backupNote, setBackupNote] = useState("");
  const thumbsRef = useRef({});
  const importRef = useRef(null);

  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const listMount = useRef(Date.now());
  const touch = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const allMemes = useMemo(() => MEME_DATA.concat(extraMemes), [extraMemes]);
  const memeLookup = (file) => MEME_MAP[file] || extraMemes.find((m) => m.file === file) || null;

  const markStorageFail = () => {
    setStorageOk(false);
    setStorageBanner(true);
  };

  // ---- 量宽度 ----
  useEffect(() => {
    const measure = () => {
      if (rootRef.current) setW(rootRef.current.offsetWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ---- 时钟：跨过零点天数自己加一 ----
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // ---- 开机 ----
  useEffect(() => {
    (async () => {
      const t0 = Date.now();

      const list = safeParse(await store.get("kfs2:index"), []) || [];
      indexRef.current = list;
      setIndex(list);

      const st = safeParse(await store.get("kfs2:settings"), null) || {};
      const merged = { ...DEFAULT_SETTINGS, ...st };
      if (!Array.isArray(merged.mcps)) merged.mcps = DEFAULT_MCPS;
      delete merged.nowPlaying;
      delete merged.apiMode;
      delete merged.apiKey;
      if (!merged.maxTokens) merged.maxTokens = 2048;
      settingsRef.current = merged;
      setSettings(merged);

      const ah = safeParse(await store.get("kfs2:avatar:her"), null);
      const am = safeParse(await store.get("kfs2:avatar:guangyi"), null);
      const bootAv = { her: ah, him: am && am.type === "meme" ? am : HIS_DEFAULT };
      avatarsRef.current = bootAv;
      setAvatars(bootAv);

      const mu = safeParse(await store.get(usageKey()), null);
      if (mu) setMonthUsage(mu);
      for (const k of store.keys("kfs2:memethumb:")) {
        const v = await store.get(k);
        if (v) thumbsRef.current[k.slice(15)] = v;
      }

      // 日记本：今天写了没
      const tk = dayKeyOf(new Date());
      const dm = safeParse(await store.get("kfs2:diary:" + tk.slice(0, 7)), {}) || {};
      diaryCache.current[tk.slice(0, 7)] = dm;
      const td = dm[tk] || {};
      setDiaryToday({ her: !!(td.her && (td.her.text || (td.her.moods || []).length)), him: !!(td.him && td.him.text) });

      // 记忆库
      const mi = safeParse(await store.get("kfs2:memindex"), []) || [];
      const texts = {};
      for (const f of mi) {
        const t = await store.get("kfs2:mem:" + f.id);
        if (t != null) texts[f.id] = t;
      }
      const files = mi.filter((f) => texts[f.id] != null);
      memFilesRef.current = files;
      memTextsRef.current = texts;
      setMemFiles(files);
      setMemTexts(texts);

      const lastId = await store.get("kfs2:lastChat");
      if (lastId && list.find((c) => c.id === lastId)) {
        const msgs = safeParse(await store.get("kfs2:chat:" + lastId), []) || [];
        chatIdRef.current = lastId;
        messagesRef.current = msgs;
        setChatId(lastId);
        setMessages(msgs);
        loadImagesFor(msgs);
      }

      // 部署之后才能联网同步新表情包，预览环境里这一步会安静地失败
      fetch(RAW_BASE + "README.md")
        .then((r) => (r.ok ? r.text() : ""))
        .then((txt) => {
          if (txt) setExtraMemes(newMemesFrom(parseReadme(txt)));
        })
        .catch(() => {});

      if (!SPLASH_IMG || !KITE_IMG) {
        const wait = Math.max(0, 1500 - (Date.now() - t0));
        setTimeout(() => {
          setSplashFade(true);
          setTimeout(() => setSplash(false), 700);
        }, wait);
      }
    })();
  }, []);

  // ---- 别的设备改了东西：拉下来之后跟着刷新 ----
  useEffect(() => {
    const offStatus = store.onStatus((st) => setSync(st));
    const off = store.subscribe(async (keys) => {
      const has = (p) => keys.some((k) => k === p || k.startsWith(p));
      if (has("kfs2:index") || has("kfs2:chat:")) {
        const remoteList = safeParse(await store.get("kfs2:index"), []) || [];
        const ids = new Set(remoteList.map((c) => c.id));
        const keep = indexRef.current.filter((c) => !ids.has(c.id) && store.keys("kfs2:chat:" + c.id).length);
        const merged = remoteList
          .filter((c) => store.keys("kfs2:chat:" + c.id).length)
          .concat(keep)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        indexRef.current = merged;
        setIndex(merged);
      }
      if (keys.includes("kfs2:settings")) {
        const st = safeParse(await store.get("kfs2:settings"), null);
        if (st) {
          const m = { ...DEFAULT_SETTINGS, ...st };
          delete m.apiMode;
          delete m.apiKey;
          settingsRef.current = m;
          setSettings(m);
        }
      }
      if (has("kfs2:avatar:")) {
        const ah = safeParse(await store.get("kfs2:avatar:her"), null);
        const am = safeParse(await store.get("kfs2:avatar:guangyi"), null);
        const av = { her: ah, him: am && am.type === "meme" ? am : HIS_DEFAULT };
        avatarsRef.current = av;
        setAvatars(av);
      }
      if (has("kfs2:memindex") || has("kfs2:mem:")) {
        const mi = safeParse(await store.get("kfs2:memindex"), []) || [];
        const texts = {};
        for (const f of mi) {
          const t = await store.get("kfs2:mem:" + f.id);
          if (t != null) texts[f.id] = t;
        }
        const files = mi.filter((f) => texts[f.id] != null);
        memFilesRef.current = files;
        memTextsRef.current = texts;
        setMemFiles(files);
        setMemTexts(texts);
      }
      if (has("kfs2:diary:")) {
        diaryCache.current = {};
        const tk = dayKeyOf(new Date());
        const dm = safeParse(await store.get("kfs2:diary:" + tk.slice(0, 7)), {}) || {};
        const td = dm[tk] || {};
        setDiaryToday({ her: !!(td.her && (td.her.text || (td.her.moods || []).length)), him: !!(td.him && td.him.text) });
      }
      if (has("kfs2:usage:")) {
        const mu = safeParse(await store.get(usageKey()), null);
        if (mu) setMonthUsage(mu);
      }
      for (const k of keys) {
        if (k.startsWith("kfs2:memethumb:")) {
          const v = await store.get(k);
          if (v) thumbsRef.current[k.slice(15)] = v;
        }
        if (k.startsWith("kfs2:img:")) {
          const v = await store.get(k);
          imgsRef.current = { ...imgsRef.current, [k.slice(9)]: v || false };
          setImgs(imgsRef.current);
        }
      }
      const cur = "kfs2:chat:" + chatIdRef.current;
      if (keys.includes(cur) && !loadingRef.current && !timerRef.current) {
        const msgs = safeParse(await store.get(cur), null);
        if (msgs) {
          messagesRef.current = msgs;
          setMessages(msgs);
          loadImagesFor(msgs);
        }
      }
    });
    return () => {
      off();
      offStatus();
    };
  }, []);

  // ---- 对话存取 ----
  const saveChat = async (id, msgs) => {
    const ok = await store.set("kfs2:chat:" + id, JSON.stringify(msgs));
    if (!ok) markStorageFail();
    const prev = indexRef.current;
    const old = prev.find((c) => c.id === id);
    const entry = {
      id,
      title: old && old.title ? old.title : makeTitle(msgs, memeLookup),
      preview: makePreview(msgs),
      updatedAt: Date.now(),
    };
    const next = [entry].concat(prev.filter((c) => c.id !== id));
    indexRef.current = next;
    setIndex(next);
    store.set("kfs2:index", JSON.stringify(next));
    store.set("kfs2:lastChat", id);
  };

  // 切走之前，把还没来得及回的那几条先送出去
  const flushPending = () => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const msgs = messagesRef.current;
    if (!loadingRef.current && needsReply(msgs)) askGuangyi(chatIdRef.current, msgs);
  };

  const openChat = async (id) => {
    flushPending();
    setEditing(null);
    setMenu(null);
    chatIdRef.current = id;
    listMount.current = Date.now();
    setChatId(id);
    setReveal(null);
    setErrorNote("");
    setMemePanel(false);
    setHistoryOpen(false);
    setDrawerOpen(false);
    const msgs = safeParse(await store.get("kfs2:chat:" + id), []) || [];
    if (chatIdRef.current === id) {
      messagesRef.current = msgs;
      setMessages(msgs);
      loadImagesFor(msgs);
    }
    store.set("kfs2:lastChat", id);
  };

  const loadImagesFor = async (msgs) => {
    const ids = msgs
      .filter((m) => m.role === "her" && m.kind === "photo" && m.imgId && imgsRef.current[m.imgId] === undefined)
      .map((m) => m.imgId);
    if (!ids.length) return;
    const add = {};
    for (const id of ids) {
      const d = await store.get("kfs2:img:" + id);
      add[id] = d || false;
    }
    imgsRef.current = { ...imgsRef.current, ...add };
    setImgs(imgsRef.current);
  };
  const imgLookup = (id) => imgsRef.current[id] || null;

  const newChat = () => {
    flushPending();
    setEditing(null);
    setMenu(null);
    const id = newId();
    chatIdRef.current = id;
    listMount.current = Date.now();
    messagesRef.current = [];
    setChatId(id);
    setMessages([]);
    setReveal(null);
    setErrorNote("");
    setMemePanel(false);
    setHistoryOpen(false);
    setDrawerOpen(false);
  };

  const deleteChat = async (id) => {
    if (id === chatIdRef.current && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const old = safeParse(await store.get("kfs2:chat:" + id), []) || [];
    collectImgIds(old).forEach((imgId) => store.del("kfs2:img:" + imgId));
    const next = indexRef.current.filter((c) => c.id !== id);
    indexRef.current = next;
    setIndex(next);
    store.set("kfs2:index", JSON.stringify(next));
    store.del("kfs2:chat:" + id);
    if (id === chatIdRef.current) newChat();
  };

  // ---- 光义回话 ----
  // 只负责向那边要一条回复，成功返回整理好的回复，失败抛错
  const thumbLookup = (file) => thumbsRef.current[file] || null;

  const ensureMemeThumb = async (file) => {
    if (!file || MEME_MAP[file] || thumbsRef.current[file]) return;
    try {
      const data = await Promise.race([
        urlToThumb(RAW_BASE + file),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
      ]);
      thumbsRef.current[file] = data;
      store.set("kfs2:memethumb:" + file, data);
    } catch (e) {}
  };

  const recordUsage = (data) => {
    const u = data && data.usage;
    if (!u) return;
    const cost = costOf(data.model, u);
    setUsage({ model: data.model, ...u, cost });
    if (cost == null) return;
    const key = usageKey();
    setMonthUsage((prev) => {
      const base = prev && prev.month === key ? prev : { month: key, cost: 0, replies: 0 };
      const next = { month: key, cost: base.cost + cost, replies: base.replies + 1 };
      store.set(key, JSON.stringify(next));
      return next;
    });
  };

  const requestReply = async (msgs) => {
    const st = settingsRef.current;
    const model = st.model || DEFAULT_MODEL;
    const mcps = (st.mcps || []).filter((m) => m.enabled && m.url);
    const docs = memFilesRef.current
      .filter((f) => f.enabled)
      .map((f) => ({ name: f.name, content: memTextsRef.current[f.id] || "" }));
    const { staticText, nowNote } = buildSystem({
      now: new Date(),
      memeList: allMemes,
      hisAvatarName: avatarName(avatarsRef.current.him),
      memDocs: docs,
      mcpNames: mcps.map((m) => m.name),
    });
    const apiMessages = buildMessages(msgs, avatarsRef.current, memeLookup, imgLookup, thumbLookup);

    // 依次尝试：带缓存 → 不带缓存 → 不带MCP，哪种通了用哪种
    const withMcp = mcps.length > 0;
    const attempts = [];
    if (!flagsRef.current.noCache) attempts.push({ cache: true, mcp: withMcp });
    attempts.push({ cache: false, mcp: withMcp });
    if (withMcp) attempts.push({ cache: false, mcp: false });

    let data = null;
    let used = null;
    let lastErr = "";
    for (const at of attempts) {
      try {
        const body = {
          model,
          max_tokens: st.maxTokens || 2048,
          system: at.cache ? [{ type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } }] : staticText,
          messages: withNowNote(apiMessages, nowNote, at.cache),
        };
        if (at.mcp) {
          body.mcp_servers = mcps.map((m, i) => {
            const s = { type: "url", url: m.url, name: mcpSlug(m.name, i) };
            if (m.token) s.authorization_token = m.token;
            return s;
          });
          body.tools = body.mcp_servers.map((s) => ({ type: "mcp_toolset", mcp_server_name: s.name }));
        }
        data = await callClaude(body, at.mcp ? "mcp-client-2025-11-20" : "");
        used = at;
        break;
      } catch (e) {
        lastErr = String((e && e.message) || e);
        if (/登录过期|连不上开封府/.test(lastErr)) break;
      }
    }

    if (!data) throw new Error(lastErr || "没有回应");
    {
      if (attempts[0].cache && used === attempts[1]) flagsRef.current.noCache = true;
      recordUsage(data);
      const slugToName = {};
      mcps.forEach((m, i) => {
        slugToName[mcpSlug(m.name, i)] = m.name;
      });
      const usedTools = Array.from(
        new Set(
          (data.content || [])
            .filter((b) => b.type === "mcp_tool_use")
            .map((b) => slugToName[b.server_name] || b.server_name || b.name)
        )
      );
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const parsed = parseReply(text);
      const settled = settleAvatarItems(parsed.items, (f) => !!memeLookup(f));
      const him = {
        id: newId(),
        role: "him",
        ts: Date.now(),
        items: settled.items,
        raw: parsed.body,
        thinking: parsed.thinking,
        tools: usedTools,
        toolNote: withMcp && !used.mcp ? "这次MCP没连上，先不用工具回你" : "",
      };
      if (settled.avatarFile) changeHisAvatar({ type: "meme", file: settled.avatarFile });
      return him;
    }
  };

  const askGuangyi = async (id, msgs) => {
    loadingRef.current = true;
    setLoading(true);
    setErrorNote("");
    try {
      const him = await requestReply(msgs);
      // 回复插在这次请求的最后一条后面；等回复时她又发的几条排在后面
      const isCurrent = chatIdRef.current === id;
      const base = isCurrent ? messagesRef.current : msgs;
      const next = insertReply(base, msgs.length ? msgs[msgs.length - 1].id : null, him);
      if (isCurrent) messagesRef.current = next;
      await saveChat(id, next);
      if (chatIdRef.current === id) {
        setMessages(next);
        setReveal({ id: him.id, count: 1 });
      }
    } catch (e) {
      if (chatIdRef.current === id) setErrorNote(`消息没送到（${String(e.message || e).slice(0, 60)}）。点这里重发`);
    }
    loadingRef.current = false;
    setLoading(false);
    if (pendingRef.current) {
      pendingRef.current = false;
      scheduleReply(1200);
    }
  };

  // ---- 重新回答：在这条开新分支，旧的回答留着能翻回去 ----
  const retryAt = async (msgId) => {
    if (loadingRef.current) return;
    const id = chatIdRef.current;
    const full = messagesRef.current;
    const j = full.findIndex((m) => m.id === msgId);
    if (j < 0) return;
    const base = full.slice(0, j);
    if (!needsReply(base)) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    loadingRef.current = true;
    setLoading(true);
    setErrorNote("");
    setReveal(null);
    messagesRef.current = base; // 先把旧回答收起来
    setMessages(base);
    try {
      const him = await requestReply(base);
      const extra = chatIdRef.current === id ? messagesRef.current.slice(base.length) : [];
      const next = forkAt(full, j, him).concat(extra);
      if (chatIdRef.current === id) {
        messagesRef.current = next;
        setMessages(next);
        setReveal({ id: him.id, count: 1 });
      }
      await saveChat(id, next);
      if (extra.length) pendingRef.current = true;
    } catch (e) {
      if (chatIdRef.current === id) {
        messagesRef.current = full;
        setMessages(full);
        setErrorNote(`重新回答没成功（${String(e.message || e).slice(0, 60)}）`);
      }
    }
    loadingRef.current = false;
    setLoading(false);
    if (pendingRef.current) {
      pendingRef.current = false;
      scheduleReply(1200);
    }
  };

  // ---- 翻版本 ----
  const switchVersion = (msgId, dir) => {
    if (loadingRef.current) return;
    const msgs = messagesRef.current;
    const i = msgs.findIndex((m) => m.id === msgId);
    if (i < 0 || !msgs[i].alts) return;
    const next = switchAlt(msgs, i, msgs[i].altIdx + dir);
    if (next === msgs) return;
    messagesRef.current = next;
    setMessages(next);
    setReveal(null);
    setErrorNote("");
    saveChat(chatIdRef.current, next);
    loadImagesFor(next);
  };

  // ---- 复制 ----
  const copyText = async (text) => {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(text);
      setToast("已复制");
      return;
    } catch (e) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        setToast("已复制");
        return;
      }
    } catch (e) {}
    setCopySheet(text); // 都不行就把字摊开，让她自己选
  };

  // ---- 编辑她发过的话 ----
  const startEdit = (row) => {
    setMenu(null);
    if (loadingRef.current) return;
    setEditing({ id: row.msg.id });
    setInput(row.msg.text || "");
    setAttach([]);
    setMemePanel(false);
    setTimeout(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }, 60);
  };
  const cancelEdit = () => {
    setEditing(null);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
  };
  const submitEdit = (t) => {
    const msgs = messagesRef.current;
    const i = msgs.findIndex((m) => m.id === editing.id);
    setEditing(null);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    if (i < 0 || !t || t === msgs[i].text) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const { alts, altIdx, ...node } = msgs[i];
    const next = forkAt(msgs, i, { ...node, id: newId(), text: t, ts: Date.now() });
    messagesRef.current = next;
    setMessages(next);
    setErrorNote("");
    saveChat(chatIdRef.current, next);
    if (!loadingRef.current) askGuangyi(chatIdRef.current, next);
  };

  // ---- 她连着发几条，停下来再回 ----
  const triggerReply = () => {
    if (loadingRef.current) {
      pendingRef.current = true;
      return;
    }
    const msgs = messagesRef.current;
    if (needsReply(msgs)) askGuangyi(chatIdRef.current, msgs);
  };

  const scheduleReply = (ms) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      triggerReply();
    }, ms);
  };

  const sendHer = (payloads) => {
    const list = Array.isArray(payloads) ? payloads : [payloads];
    if (!list.length) return;
    const id = chatIdRef.current;
    const t0 = Date.now();
    const add = list.map((p, i) => ({ id: newId() + i, role: "her", ts: t0 + i, ...p }));
    const next = messagesRef.current.concat(add);
    messagesRef.current = next;
    setMessages(next);
    setErrorNote("");
    saveChat(id, next);
    scheduleReply(2200);
  };

  const sendText = () => {
    const t = input.trim();
    if (editing) {
      submitEdit(t);
      return;
    }
    if (!t && !attach.length) return;
    if (dictating && recRef.current) recRef.current.stop();
    const items = [];
    if (attach.length) {
      const add = {};
      attach.forEach((p) => {
        add[p.id] = p.data;
        store.set("kfs2:img:" + p.id, p.data).then((ok) => {
          if (!ok) markStorageFail();
        });
        items.push({ kind: "photo", imgId: p.id });
      });
      imgsRef.current = { ...imgsRef.current, ...add };
      setImgs(imgsRef.current);
      setAttach([]);
    }
    if (t) items.push({ kind: "text", text: t });
    setInput("");
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.focus();
    }
    sendHer(items);
  };

  // ---- 照片 ----
  const pickPhotos = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    const room = Math.max(0, 9 - attach.length);
    let failed = 0;
    for (const f of list.slice(0, room)) {
      try {
        const data = await fileToPhoto(f);
        setAttach((a) => a.concat([{ id: newId(), data }]));
      } catch (x) {
        failed++;
      }
    }
    if (failed) setVoiceNote(`有 ${failed} 张照片读不出来，换一张试试`);
    if (list.length > room) setVoiceNote("一次最多九张");
  };

  // ---- 语音：说话转成字 ----
  const MIC_FALLBACK = "这里开不了麦。先用键盘上的话筒听写，效果一样；部署到Safari之后这两个按钮就能用了。";
  const startRec = (onText, onEnd) => {
    const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    if (!SR) {
      setVoiceNote(MIC_FALLBACK);
      return null;
    }
    try {
      const rec = new SR();
      rec.lang = "zh-CN";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev) => {
        let txt = "";
        for (let i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
        onText(txt);
      };
      rec.onerror = (ev) => {
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(ev.error)) setVoiceNote(MIC_FALLBACK);
      };
      rec.onend = () => onEnd && onEnd();
      rec.start();
      return rec;
    } catch (x) {
      setVoiceNote(MIC_FALLBACK);
      return null;
    }
  };

  // 话筒：听写进输入框
  const toggleDictation = () => {
    if (dictating) {
      if (recRef.current) recRef.current.stop();
      return;
    }
    dictBaseRef.current = input;
    const rec = startRec(
      (txt) => setInput(dictBaseRef.current + txt),
      () => {
        setDictating(false);
        recRef.current = null;
      }
    );
    if (rec) {
      recRef.current = rec;
      setDictating(true);
    }
  };

  // 声波键：发一条语音
  const finishVoice = () => {
    const r = recordingRef.current;
    if (!r || r.done) return;
    r.done = true;
    recordingRef.current = null;
    setRecording(null);
    recRef.current = null;
    if (!r.sending) return;
    const text = (r.text || "").trim();
    const dur = Math.max(1, Math.round((Date.now() - r.start) / 1000));
    if (text) sendHer({ kind: "voice", text, dur });
    else setVoiceNote("没听清，再说一次");
  };
  const startVoice = () => {
    const rec = startRec(
      (txt) => {
        if (!recordingRef.current) return;
        recordingRef.current = { ...recordingRef.current, text: txt };
        setRecording(recordingRef.current);
      },
      () => finishVoice()
    );
    if (rec) {
      recRef.current = rec;
      recordingRef.current = { start: Date.now(), text: "", sending: false, done: false };
      setRecording(recordingRef.current);
    }
  };
  const sendVoice = () => {
    if (!recordingRef.current) return;
    recordingRef.current.sending = true;
    if (recRef.current) recRef.current.stop();
    setTimeout(finishVoice, 1500); // 有的浏览器不报结束，兜个底
  };
  const cancelVoice = () => {
    if (recordingRef.current) recordingRef.current.sending = false;
    if (recRef.current) recRef.current.abort();
    finishVoice();
  };

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!voiceNote) return;
    const t = setTimeout(() => setVoiceNote(""), 6000);
    return () => clearTimeout(t);
  }, [voiceNote]);

  const sendMeme = async (file) => {
    setMemePanel(false);
    setSheet(null);
    setDrawerOpen(false);
    await ensureMemeThumb(file);
    sendHer({ kind: "meme", file });
  };

  const retry = () => {
    const msgs = messagesRef.current;
    if (!loadingRef.current && needsReply(msgs)) askGuangyi(chatIdRef.current, msgs);
  };

  // ---- 分条：一条一条冒出来 ----
  useEffect(() => {
    if (!reveal) return;
    const msg = messages.find((m) => m.id === reveal.id);
    if (!msg || reveal.count >= msg.items.length) {
      setReveal(null);
      return;
    }
    const nextItem = msg.items[reveal.count];
    const delay =
      nextItem.type === "meme"
        ? 750
        : nextItem.type === "avatar"
        ? 650
        : Math.min(1900, 550 + (nextItem.text ? nextItem.text.length : 0) * 28);
    const t = setTimeout(() => {
      setReveal((r) => (r && r.id === msg.id ? { id: r.id, count: r.count + 1 } : r));
    }, delay);
    return () => clearTimeout(t);
  }, [reveal, messages]);

  // ---- 滚到底 ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, reveal && reveal.count, loading, chatId, memePanel, errorNote]);

  // ---- 设置 ----
  const updateSettings = (patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    store.set("kfs2:settings", JSON.stringify(next)).then((ok) => {
      if (!ok) markStorageFail();
    });
  };

  // ---- 头像 ----
  const avatarName = (av, withFile = true) => {
    if (!av || av.type !== "meme") return "";
    const m = memeLookup(av.file);
    if (!m) return av.file;
    return withFile ? `「${m.name}」（${av.file}）` : m.name;
  };

  const changeHerAvatar = (av) => {
    const nextAv = { ...avatarsRef.current, her: av };
    avatarsRef.current = nextAv;
    setAvatars(nextAv);
    if (av) {
      store.set("kfs2:avatar:her", JSON.stringify(av)).then((ok) => {
        if (!ok) markStorageFail();
      });
    } else {
      store.del("kfs2:avatar:her");
    }
    // 聊到一半换的：在对话里留下一行，图跟着这行一起寄给光义
    const msgs = messagesRef.current;
    if (!msgs.length) return;
    const ev = { id: newId(), role: "event", who: "her", av, ts: Date.now() };
    const last = msgs[msgs.length - 1];
    const next =
      last && last.role === "event" && last.who === "her"
        ? msgs.slice(0, -1).concat([ev])
        : msgs.concat([ev]);
    messagesRef.current = next;
    setMessages(next);
    saveChat(chatIdRef.current, next);
  };

  const changeHisAvatar = (av) => {
    const nextAv = { ...avatarsRef.current, him: av };
    avatarsRef.current = nextAv;
    setAvatars(nextAv);
    if (av && av.type === "meme") ensureMemeThumb(av.file);
    store.set("kfs2:avatar:guangyi", JSON.stringify(av)).then((ok) => {
      if (!ok) markStorageFail();
    });
  };

  // ---- 记忆库 ----
  const uploadDocs = async (fileList) => {
    let added = 0;
    let updated = 0;
    let failed = 0;
    let files = memFilesRef.current.slice();
    const texts = { ...memTextsRef.current };
    for (const f of fileList) {
      try {
        if (f.size > 3 * 1024 * 1024) {
          failed++;
          continue;
        }
        const text = await f.text();
        const head = text.slice(0, 4000);
        if (!text.trim() || head.includes("\u0000") || (head.match(/\uFFFD/g) || []).length > 20) {
          failed++;
          continue;
        }
        const existing = files.find((x) => x.name === f.name);
        const id = existing ? existing.id : newId();
        const ok = await store.set("kfs2:mem:" + id, text);
        if (!ok) markStorageFail();
        texts[id] = text;
        if (existing) {
          files = files.map((x) => (x.id === id ? { ...x, size: text.length, updatedAt: Date.now() } : x));
          updated++;
        } else {
          files = files.concat([{ id, name: f.name, size: text.length, enabled: true, addedAt: Date.now() }]);
          added++;
        }
      } catch (e) {
        failed++;
      }
    }
    memFilesRef.current = files;
    memTextsRef.current = texts;
    setMemFiles(files);
    setMemTexts(texts);
    store.set("kfs2:memindex", JSON.stringify(files));
    setMemNote(
      [added ? `新增 ${added} 份` : "", updated ? `更新 ${updated} 份` : "", failed ? `${failed} 份读不出文字` : ""]
        .filter(Boolean)
        .join("，")
    );
  };

  const toggleDoc = (id, on) => {
    const files = memFilesRef.current.map((f) => (f.id === id ? { ...f, enabled: on } : f));
    memFilesRef.current = files;
    setMemFiles(files);
    store.set("kfs2:memindex", JSON.stringify(files));
  };

  const deleteDoc = (id) => {
    const files = memFilesRef.current.filter((f) => f.id !== id);
    const texts = { ...memTextsRef.current };
    delete texts[id];
    memFilesRef.current = files;
    memTextsRef.current = texts;
    setMemFiles(files);
    setMemTexts(texts);
    store.set("kfs2:memindex", JSON.stringify(files));
    store.del("kfs2:mem:" + id);
  };

  // ---- 日记本 ----
  const loadMonth = async (ym) => {
    if (diaryCache.current[ym]) return diaryCache.current[ym];
    const data = safeParse(await store.get("kfs2:diary:" + ym), {}) || {};
    diaryCache.current[ym] = data;
    return data;
  };

  const saveEntry = async (key, who, value) => {
    const ym = key.slice(0, 7);
    const base = await loadMonth(ym);
    const day = { ...(base[key] || {}) };
    if (value) day[who] = value;
    else delete day[who];
    if (day.her && !day.her.text && !(day.her.moods && day.her.moods.length)) delete day.her;
    const data = { ...base };
    if (Object.keys(day).length) data[key] = day;
    else delete data[key];
    diaryCache.current[ym] = data;
    store.set("kfs2:diary:" + ym, JSON.stringify(data)).then((ok) => {
      if (!ok) markStorageFail();
    });
    if (key === dayKeyOf(new Date())) {
      setDiaryToday({ her: !!(day.her && (day.her.text || (day.her.moods || []).length)), him: !!(day.him && day.him.text) });
    }
    return data;
  };

  // 把所有对话按天归好：日历的深浅、我写日记要读的聊天，都从这来
  const loadDays = async () => {
    const byDay = {};
    for (const c of indexRef.current) {
      const msgs =
        c.id === chatIdRef.current ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + c.id), []) || [];
      msgs.forEach((m) => {
        if (m.role !== "her" && m.role !== "him") return;
        const k = dayKeyOf(new Date(m.ts));
        (byDay[k] = byDay[k] || []).push(m);
      });
    }
    dayMsgsRef.current = byDay;
    const counts = {};
    Object.keys(byDay).forEach((k) => {
      counts[k] = byDay[k].length;
    });
    return counts;
  };

  const writeHis = async (key, herEntry) => {
    const st = settingsRef.current;
    const d = parseDayKey(key);
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
    const docs = memFilesRef.current
      .filter((f) => f.enabled)
      .map((f) => ({ name: f.name, content: memTextsRef.current[f.id] || "" }));
    const { staticText, nowNote } = buildSystem({
      now: new Date(),
      memeList: allMemes,
      hisAvatarName: avatarName(avatarsRef.current.him),
      memDocs: docs,
      mcpNames: [],
    });
    const msgs = dayMsgsRef.current[key] || [];
    const transcript = msgs.length ? dayTranscript(msgs, memeLookup) : "（这天你们没在开封府说话）";
    const herMoods = ((herEntry && herEntry.moods) || []).map((k) => (moodOf(k) || {}).t).filter(Boolean);
    const herPart =
      herEntry && (herEntry.text || herMoods.length)
        ? `\n\n她这天的日记：\n${herMoods.length ? "心情：" + herMoods.join("、") + "\n" : ""}${herEntry.text || ""}`
        : "";
    const rule = `【写日记】
这次不是聊天。这是开封府日记本里属于你的那一页，日期是${label}。
根据下面这天你们的聊天${herPart ? "和她这天的日记" : ""}，用你自己的口吻写一篇日记：第一人称，写这天发生了什么、你在想什么、你对她的感受。像真的日记，是写给自己的，不是写给她看的信，也不用讨好谁。一百到两百五十字。
格式：第一行写「心情：」，从 开心、甜、平静、累、焦虑、难过、生气、不舒服 里挑一到两个，用顿号隔开。第二行开始写正文。
不要写<thinking>，不要[SPLIT]、[MEME]、[AVATAR]，不要动作描写的星号，不用破折号。`;
    const data = await callClaude({
      model: st.model || DEFAULT_MODEL,
      max_tokens: Math.max(1024, st.maxTokens || 2048),
      system: [
        { type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: rule },
      ],
      messages: [{ role: "user", content: `这天的聊天记录：\n${transcript}${herPart}\n\n${nowNote}\n\n写吧。` }],
    });
    recordUsage(data);
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = parseDiary(text);
    if (!parsed.text) throw new Error("没写出字");
    return { text: parsed.text, moods: parsed.moods, updatedAt: Date.now() };
  };

  // ---- 测试连接 ----
  const testApi = async () => {
    setTesting(true);
    setTestNote("");
    try {
      const d = await callClaude({ ping: true });
      const text = (d.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      setTestNote(`连上了，${modelLabel(d.model || "")} 回了一个“${text.slice(0, 6) || "在"}”`);
    } catch (e) {
      setTestNote(`没连上：${String((e && e.message) || e).slice(0, 80)}`);
    }
    setTesting(false);
  };

  // ---- 备份 ----
  const exportBackup = async () => {
    const data = store.exportAll();
    const json = JSON.stringify({ app: "kaifengfu", v: 1, exportedAt: new Date().toISOString(), data });
    const name = `开封府备份-${dayKeyOf(new Date())}.json`;
    const blob = new Blob([json], { type: "application/json" });
    try {
      const file = new File([blob], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "开封府备份" });
        setBackupNote("备份交给你了，存进 iCloud 或 Dropbox。");
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setBackupNote(`备份已下载：${name}`);
  };

  // 导入：聊天目录、记忆库目录、日记按天合并，不覆盖眼下的设置
  const importBackup = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const data = obj && obj.app === "kaifengfu" ? obj.data : null;
      if (!data || typeof data !== "object") throw new Error("这不是开封府的备份");
      let n = 0;
      for (const [k, v] of Object.entries(data)) {
        if (typeof v !== "string" || !k.startsWith("kfs2:")) continue;
        if (k === "kfs2:settings" || k === "kfs2:lastChat" || k.startsWith("kfs2:usage:")) continue;
        if (k === "kfs2:index" || k === "kfs2:memindex") {
          const mine = safeParse(await store.get(k), []) || [];
          const ids = new Set(mine.map((c) => c.id));
          const merged = mine.concat((safeParse(v, []) || []).filter((c) => c && !ids.has(c.id)));
          if (k === "kfs2:index") merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          await store.set(k, JSON.stringify(merged));
        } else if (k.startsWith("kfs2:diary:")) {
          const mine = safeParse(await store.get(k), {}) || {};
          await store.set(k, JSON.stringify({ ...(safeParse(v, {}) || {}), ...mine }));
        } else if ((await store.get(k)) == null || k.startsWith("kfs2:avatar:")) {
          await store.set(k, v);
        } else continue;
        n++;
      }
      setBackupNote(`导入了 ${n} 条记录，马上刷新。`);
      setTimeout(() => window.location.reload(), 900);
    } catch (x) {
      setBackupNote("导入没成功：" + ((x && x.message) || x));
    }
  };

  const logout = async () => {
    if (!logoutArmed) {
      setLogoutArmed(true);
      try {
        await store.syncNow();
      } catch (e) {}
      return;
    }
    if (account.signOut) account.signOut();
  };

  // ---- 侧滑手势 ----
  const onTouchStart = (e) => {
    if (sheet || historyOpen || splash || viewer || menu || diaryOpen) return;
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, dir: null, base: drawerOpen ? drawerW : 0, dx: 0 };
  };
  const onTouchMove = (e) => {
    const s = touch.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.dir) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
    }
    if (s.dir !== "h") return;
    s.dx = dx;
    setDragX(Math.max(0, Math.min(drawerW, s.base + dx)));
  };
  const onTouchEnd = () => {
    const s = touch.current;
    touch.current = null;
    if (!s || s.dir !== "h") return;
    const open = s.base === 0 ? s.dx > 50 : !(s.dx < -50);
    setDrawerOpen(open);
    setDragX(null);
  };

  const x = dragX !== null ? dragX : drawerOpen ? drawerW : 0;
  const progress = drawerW ? x / drawerW : 0;
  const typing = loading || reveal !== null;
  const rows = useMemo(() => buildRows(messages, reveal), [messages, reveal]);
  const activeModel = settings.model || DEFAULT_MODEL;
  const syncLine = !storageOk
    ? "手机本地存档写不进去，记录可能留不住。"
    : sync.offline
    ? `离线中。${sync.pending ? `有 ${sync.pending} 条记录排队，` : ""}联网后自动补传。`
    : sync.pending
    ? `有 ${sync.pending} 条正在上传。`
    : `都已同步，锁好存在云端。${sync.lastSync ? "上次同步：" + timeAgo(sync.lastSync) : ""}`;
  const enabledMcp = (settings.mcps || []).filter((m) => m.enabled).length;
  const enabledDocs = memFiles.filter((f) => f.enabled).length;

  // ---- 弹层 ----
  const renderSheet = () => {
    if (sheet === "account") {
      return (
        <Sheet title="卿卿" onClose={() => { setSheet(null); setClearArmed(false); setLogoutArmed(false); setBackupNote(""); }}>
          <AvatarSection av={avatars.her} onChange={changeHerAvatar} />
          <HisAvatarCard av={avatars.him} name={avatarName(avatars.him, false) || "炅"} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "22px 0 18px" }} />
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>主题色</div>
          <div className="flex items-center flex-wrap" style={{ gap: 16, marginBottom: 22 }}>
            <span className="flex items-center" style={{ gap: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(140deg,#BCD4CA,#7FA39A)", border: "2px solid #fff", boxShadow: `0 0 0 2px ${T.dai}` }} />
              <span style={{ fontSize: 13, color: T.ink }}>青绿</span>
            </span>
            <span className="flex items-center" style={{ gap: 8, opacity: 0.5 }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(140deg,#DCCFF0,#A58BC9)", border: "2px solid rgba(255,255,255,0.9)" }} />
              <span style={{ fontSize: 13, color: T.inkSoft }}>丁香，等紫色小猪</span>
            </span>
          </div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>云端同步</div>
          <div style={{ ...glass(0.5, 16), borderRadius: 16, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6, color: sync.offline || !storageOk ? "#A8473D" : T.ink }}>
            {syncLine}
          </div>
          <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10, marginBottom: 22 }}>
            <button onClick={() => store.syncNow()} className="kfs-tap" style={{ ...chip, opacity: sync.syncing ? 0.5 : 1 }}>
              {sync.syncing ? "正在同步…" : "现在同步"}
            </button>
          </div>

          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>备份</div>
          <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.6, marginBottom: 10 }}>
            备份文件是没上锁的完整记录，存进你自己的 iCloud 或 Dropbox。换手机、暗号忘了，都能靠它导回来。
          </p>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            <button onClick={exportBackup} className="kfs-tap" style={chip}>
              导出备份
            </button>
            <button onClick={() => importRef.current && importRef.current.click()} className="kfs-tap" style={chip}>
              导入备份
            </button>
          </div>
          {backupNote && <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.6 }}>{backupNote}</div>}
          <input ref={importRef} type="file" accept="application/json,.json" onChange={importBackup} style={{ display: "none" }} />

          <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "22px 0 18px" }} />
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            <button
              onClick={() => {
                if (!clearArmed) {
                  setClearArmed(true);
                  return;
                }
                deleteChat(chatIdRef.current);
                setClearArmed(false);
                setSheet(null);
              }}
              className="kfs-tap"
              style={{ ...chip, color: "#A8473D" }}
            >
              {clearArmed ? "再点一次，删掉这段对话" : "删掉当前这段对话"}
            </button>
            <button onClick={logout} className="kfs-tap" style={{ ...chip, color: "#A8473D" }}>
              {logoutArmed
                ? sync.pending
                  ? `还有 ${sync.pending} 条没传上去，再点一次也退出`
                  : "再点一次，退出登录"
                : "退出登录"}
            </button>
          </div>
          {account.email && <div style={{ fontSize: 12, color: T.inkFaint, marginTop: 12 }}>登录账号：{account.email}</div>}
          <div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 22, textAlign: "center", fontFamily: SERIF, letterSpacing: "0.1em" }}>
            开封府 v5，二〇二六年十月一日动工
          </div>
        </Sheet>
      );
    }
    if (sheet === "memory") {
      return (
        <Sheet title="记忆库" onClose={() => { setSheet(null); setMemNote(""); }}>
          <MemoryPanel files={memFiles} texts={memTexts} note={memNote} onUpload={uploadDocs} onToggle={toggleDoc} onDelete={deleteDoc} />
        </Sheet>
      );
    }
    if (sheet === "mcp") {
      return (
        <Sheet title="MCP" onClose={() => setSheet(null)}>
          <McpPanel mcps={settings.mcps || []} onChange={(mcps) => updateSettings({ mcps })} />
        </Sheet>
      );
    }
    if (sheet === "api") {
      return (
        <Sheet title="API" onClose={() => { setSheet(null); setTestNote(""); }}>
          <ApiPanel
            settings={settings}
            onChange={(patch) => {
              updateSettings(patch);
              setTestNote("");
            }}
            onTest={testApi}
            testNote={testNote}
            testing={testing}
            usage={usage}
            monthUsage={monthUsage}
          />
        </Sheet>
      );
    }
    if (sheet === "model") {
      return (
        <Sheet title="选择模型" onClose={() => setSheet(null)}>
          <ModelPanel
            current={settings.model || DEFAULT_MODEL}
            onPick={(id) => {
              updateSettings({ model: id });
              setSheet(null);
            }}
          />
        </Sheet>
      );
    }
    return null;
  };

  return (
    <div
      ref={rootRef}
      className="overflow-hidden select-none"
      style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "var(--kfs-h, 100dvh)", background: T.bg, fontFamily: SANS, color: T.ink }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <style>{GLOBAL_CSS}</style>
      <Glows />

      {/* ============ 侧栏 ============ */}
      <div
        className="absolute top-0 left-0 h-full flex flex-col"
        style={{
          width: drawerW,
          transform: `translateX(${(progress - 1) * 28}px)`,
          opacity: 0.3 + 0.7 * progress,
          transition: dragX === null ? "transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s" : "none",
        }}
      >
        <div style={{ padding: "calc(22px + env(safe-area-inset-top)) 22px 12px", fontFamily: SERIF, fontSize: 23, letterSpacing: "0.14em", color: T.ink }}>
          开封府
        </div>
        <div className="flex-1 overflow-y-auto kfs-scroll flex flex-col" style={{ padding: "4px 16px 16px", gap: 12 }}>
          <DaysCard now={now} />
          <div className="grid grid-cols-2" style={{ gap: 12 }}>
            <Tile icon="doc" label="记忆库" sub={memFiles.length ? `带着 ${enabledDocs} 份文档` : "放文档"} onClick={() => setSheet("memory")} />
            <Tile icon="plug" label="MCP" sub={enabledMcp ? `开着 ${enabledMcp} 个` : `装了 ${(settings.mcps || []).length} 个`} onClick={() => setSheet("mcp")} />
            <Tile icon="key" label="API" sub={monthUsage && monthUsage.month === usageKey() && monthUsage.replies ? `本月约 ${money(monthUsage.cost)}` : "连接与用量"} onClick={() => setSheet("api")} />
            <Tile
              icon="calendar"
              label="日记本"
              sub={
                diaryToday.her && diaryToday.him
                  ? "今天都写了"
                  : diaryToday.her
                  ? "今天你写了"
                  : diaryToday.him
                  ? "今天我写了"
                  : "今天还没写"
              }
              onClick={() => setDiaryOpen(true)}
            />
          </div>
          <HistoryCard index={index} currentId={chatId} onOpenAll={() => setHistoryOpen(true)} onOpen={openChat} />
        </div>
        <div className="flex items-center justify-between" style={{ padding: "8px 16px calc(18px + env(safe-area-inset-bottom))" }}>
          <button onClick={() => setSheet("account")} aria-label="头像与设置" className="kfs-tap">
            <Avatar av={avatars.her} who="her" size={40} />
          </button>
          <button onClick={newChat} className="kfs-tap flex items-center" style={{ ...glass(0.72, 20), borderRadius: 999, padding: "10px 20px", gap: 6, color: T.ink }}>
            <Icon name="plus" size={18} />
            <span style={{ fontSize: 15 }}>新对话</span>
          </button>
        </div>
      </div>

      {/* ============ 对话窗 ============ */}
      <div
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{
          transform: `translateX(${x}px)`,
          transition: dragX === null ? "transform .35s cubic-bezier(.2,.8,.2,1), border-radius .35s" : "none",
          borderRadius: x > 0 ? 30 : 0,
          boxShadow: x > 0 ? "-14px 0 40px rgba(42,62,56,0.2)" : "none",
          background: WALL_IMG ? WALL.paper : T.bg,
        }}
      >
        {WALL_IMG ? (
          <img
            src={WALL_IMG}
            alt=""
            draggable={false}
            className="absolute pointer-events-none"
            style={{ top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 100%" }}
          />
        ) : (
          <Glows />
        )}

        {/* 顶栏 */}
        <div
          className="relative z-10 flex items-center flex-shrink-0"
          style={{ ...glass(0.36, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}
        >
          <IconBtn onClick={() => setDrawerOpen(true)} label="打开侧栏">
            <Icon name="menu" />
          </IconBtn>
          <div className="flex-1 flex flex-col items-center min-w-0">
            <Avatar av={avatars.him} who="him" size={30} />
            <div style={{ fontSize: 12.5, color: T.ink, marginTop: 2 }}>光义</div>
            {typing && <div style={{ fontSize: 10.5, color: T.inkSoft }}>正在输入…</div>}
          </div>
          <IconBtn onClick={newChat} label="新对话">
            <Icon name="pen" size={20} />
          </IconBtn>
        </div>

        {storageBanner && (
          <div
            className="relative z-10 flex items-center justify-between flex-shrink-0"
            style={{ ...glass(0.62, 20), borderRadius: 14, margin: "8px 12px 0", padding: "8px 12px", fontSize: 12, color: "#A8473D" }}
          >
            <span>手机本地存档写不进去，关掉后这段对话可能留不住</span>
            <button onClick={() => setStorageBanner(false)} aria-label="关闭提示" style={{ marginLeft: 8, opacity: 0.6 }}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {/* 消息 */}
        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto kfs-scroll" style={{ padding: "8px 14px 12px" }}>
          {messages.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center" style={{ gap: 18 }}>
              <p style={{ fontFamily: SERIF, fontSize: 14, letterSpacing: "0.3em", paddingLeft: "0.3em", color: T.inkSoft }}>
                如月之恒，官家在这
              </p>
              {memFiles.length === 0 && (
                <button
                  onClick={() => setSheet("memory")}
                  className="kfs-tap"
                  style={{ ...glass(0.55, 18), borderRadius: 18, padding: "10px 16px", fontSize: 13, color: T.ink, lineHeight: 1.6, maxWidth: 280 }}
                >
                  记忆库还是空的。先把名帖传上来，我才认得你。
                </button>
              )}
            </div>
          )}
          {rows.map((row) => {
            if (row.type === "sep") {
              return (
                <div key={row.key} className="text-center" style={{ fontSize: 11.5, color: T.inkFaint, margin: "16px 0 4px" }}>
                  {sepLabel(row.ts, now)}
                </div>
              );
            }
            if (row.type === "notice") {
              return <NoticeRow key={row.key} row={row} animate={row.msg.ts >= listMount.current} />;
            }
            if (row.type === "ctrl") {
              return (
                <CtrlRow
                  key={row.key}
                  row={row}
                  busy={loading}
                  onPrev={() => switchVersion(row.msg.id, -1)}
                  onNext={() => switchVersion(row.msg.id, 1)}
                  onRetry={() => retryAt(row.msg.id)}
                />
              );
            }
            if (row.type === "tools") {
              return (
                <div key={row.key} style={{ marginLeft: 42, marginTop: 8, fontSize: 11.5, color: T.inkFaint }}>
                  {row.text}
                </div>
              );
            }
            if (row.type === "thinking") {
              return (
                <ThinkingRow
                  key={row.key}
                  msg={row.msg}
                  open={!!openThinking[row.msg.id]}
                  onToggle={() => setOpenThinking((o) => ({ ...o, [row.msg.id]: !o[row.msg.id] }))}
                />
              );
            }
            return (
              <BubbleRow
                key={row.key}
                row={row}
                avatars={avatars}
                animate={row.msg.ts >= listMount.current}
                imgs={imgs}
                onOpenPhoto={setViewer}
                onLongPress={(r, rect) => setMenu({ row: r, rect })}
              />
            );
          })}
          {typing && <TypingRow avatars={avatars} />}
          {errorNote && !loading && (
            <div className="flex justify-center" style={{ marginTop: 14 }}>
              <button onClick={retry} className="kfs-tap" style={{ ...glass(0.62, 18), borderRadius: 18, padding: "8px 16px", fontSize: 12.5, color: "#A8473D", maxWidth: "88%" }}>
                {errorNote}
              </button>
            </div>
          )}
        </div>

        {/* 表情包面板 */}
        {memePanel && (
          <div
            className="relative z-10 flex-shrink-0 overflow-y-auto kfs-scroll kfs-sheet"
            style={{ ...glass(0.5, 28), borderRadius: 24, margin: "0 12px 8px", padding: 12, maxHeight: 250 }}
          >
            <div className="grid grid-cols-4" style={{ gap: 10 }}>
              {allMemes.map((m) => (
                <button
                  key={m.file}
                  onClick={() => sendMeme(m.file)}
                  aria-label={m.name}
                  className="kfs-tap overflow-hidden"
                  style={{ aspectRatio: "1 / 1", borderRadius: 16, border: "1.5px solid rgba(255,255,255,0.8)", boxShadow: "0 3px 10px rgba(46,68,62,0.12)" }}
                >
                  <img src={memeSrc(m.file)} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {voiceNote && (
          <div
            className="relative z-10 flex-shrink-0 kfs-in"
            style={{ ...glass(0.62, 18), borderRadius: 16, margin: "0 12px 8px", padding: "9px 14px", fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}
          >
            {voiceNote}
          </div>
        )}

        {/* 输入框：照官方摆，上面写字，下面一排按钮 */}
        <div
          className="relative z-10 flex-shrink-0"
          style={{ ...glass(0.4, 30), borderRadius: 26, margin: "0 12px calc(12px + env(safe-area-inset-bottom))", padding: "8px 8px 7px" }}
        >
          {attach.length > 0 && (
            <div className="flex overflow-x-auto kfs-scroll" style={{ gap: 10, padding: "6px 4px 10px" }}>
              {attach.map((ph) => (
                <div key={ph.id} className="relative flex-shrink-0">
                  <img
                    src={ph.data}
                    alt=""
                    style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 14, border: "1.5px solid rgba(255,255,255,0.85)", display: "block" }}
                  />
                  <button
                    onClick={() => setAttach((a) => a.filter((q) => q.id !== ph.id))}
                    aria-label="不发这张"
                    className="absolute flex items-center justify-center"
                    style={{ top: -6, right: -6, width: 22, height: 22, borderRadius: 999, background: "rgba(34,48,44,0.78)" }}
                  >
                    <Icon name="x" size={12} color="#fff" sw={2.2} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {editing && (
            <div className="flex items-center justify-between" style={{ gap: 8, padding: "4px 8px 6px", fontSize: 12, color: T.dai }}>
              <span>正在改这条。发出去后从这里重新聊，原来的能翻回去</span>
              <button onClick={cancelEdit} className="kfs-tap flex-shrink-0" style={{ color: T.inkSoft, padding: "2px 6px" }}>
                取消
              </button>
            </div>
          )}
          {recording ? (
            <div className="flex items-center" style={{ gap: 10, padding: "4px 2px" }}>
              <button onClick={cancelVoice} className="kfs-tap flex-shrink-0" style={chip}>
                取消
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center" style={{ gap: 6, fontSize: 13, color: T.dai }}>
                  <Icon name="wave" size={16} />
                  <span>正在听 {Math.max(0, Math.round((Date.now() - recording.start) / 1000))}″</span>
                </div>
                <div className="truncate" style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
                  {recording.text || "说吧，我听着"}
                </div>
              </div>
              <button onClick={sendVoice} className="kfs-tap flex-shrink-0" style={chipPrimary}>
                发送
              </button>
            </div>
          ) : (
            <>
              <textarea
                ref={taRef}
                className="kfs-field block w-full"
                value={input}
                rows={1}
                placeholder={dictating ? "正在听你说…" : "说话，我听着"}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  // 她还在打字，就再等等
                  if (timerRef.current) scheduleReply(2800);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    sendText();
                  }
                }}
                style={{
                  resize: "none",
                  maxHeight: 120,
                  padding: "6px 10px",
                  fontSize: 16,
                  lineHeight: 1.45,
                  color: T.ink,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  userSelect: "text",
                  WebkitUserSelect: "text",
                }}
              />
              <div className="flex items-center" style={{ gap: 6, marginTop: 4 }}>
                {!editing && (
                  <>
                    <RoundBtn onClick={() => photoInputRef.current && photoInputRef.current.click()} label="发照片">
                      <Icon name="plus" size={20} />
                    </RoundBtn>
                    <RoundBtn onClick={() => setMemePanel(!memePanel)} label="表情包" active={memePanel}>
                      <Icon name="smile" size={20} />
                    </RoundBtn>
                  </>
                )}
                <button
                  onClick={() => setSheet("model")}
                  onMouseDown={(e) => e.preventDefault()}
                  className="kfs-tap flex items-center flex-shrink-0"
                  style={{
                    gap: 3,
                    padding: "8px 10px 8px 13px",
                    borderRadius: 999,
                    fontSize: 13,
                    color: T.ink,
                    backgroundColor: "rgba(255,255,255,0.42)",
                    border: "1px solid rgba(255,255,255,0.65)",
                  }}
                >
                  {modelLabel(activeModel)}
                  <Icon name="chevD" size={14} />
                </button>
                <div className="flex-1" />
                <RoundBtn onClick={toggleDictation} label="听写" active={dictating}>
                  <Icon name="mic" size={19} />
                </RoundBtn>
                {editing || input.trim() || attach.length ? (
                  <button
                    onClick={sendText}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label={editing ? "发送修改" : "发送"}
                    disabled={editing ? !input.trim() : false}
                    className="kfs-tap flex-shrink-0 flex items-center justify-center"
                    style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    background: T.daiGrad,
                    boxShadow: "0 6px 16px rgba(48,82,74,0.35)",
                  }}
                  >
                    <Icon name="up" color="#fff" size={19} sw={2.1} />
                  </button>
                ) : (
                  <button
                    onClick={startVoice}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="发语音"
                    className="kfs-tap flex-shrink-0 flex items-center justify-center"
                    style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    background: T.daiGrad,
                    boxShadow: "0 6px 16px rgba(48,82,74,0.35)",
                  }}
                  >
                    <Icon name="wave" color="#fff" size={19} sw={2} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={pickPhotos} style={{ display: "none" }} />

        {/* 侧栏打开时，点露出来的这一条关掉 */}
        {x > 0 && <div className="absolute inset-0 z-30" onClick={() => setDrawerOpen(false)} />}
      </div>

      {renderSheet()}

      {diaryOpen && (
        <DiaryPage
          now={now}
          onBack={() => setDiaryOpen(false)}
          loadMonth={loadMonth}
          saveEntry={saveEntry}
          loadDays={loadDays}
          writeHis={writeHis}
        />
      )}

      {historyOpen && (
        <HistoryPage
          index={index}
          currentId={chatId}
          now={now}
          onBack={() => setHistoryOpen(false)}
          onOpen={openChat}
          onDelete={deleteChat}
        />
      )}

      {menu && (
        <MsgMenu
          menu={menu}
          now={now}
          busy={loading}
          onClose={() => setMenu(null)}
          onCopy={(r) => copyText(r.item.text || "")}
          onEdit={startEdit}
          onRetry={(r) => {
            setMenu(null);
            retryAt(r.msg.id);
          }}
        />
      )}

      {toast && (
        <div className="absolute z-50 kfs-in" style={{ top: "calc(92px + env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
          <div style={{ ...glass(0.82, 20), borderRadius: 999, padding: "8px 18px", fontSize: 13, color: T.ink }}>{toast}</div>
        </div>
      )}

      {copySheet && (
        <Sheet title="复制" onClose={() => setCopySheet("")}>
          <p style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 10 }}>这里不让直接复制，长按下面的字自己选吧。</p>
          <textarea
            readOnly
            value={copySheet}
            className="kfs-field"
            style={{ ...field, minHeight: 120, resize: "none", userSelect: "text", WebkitUserSelect: "text" }}
          />
        </Sheet>
      )}

      {viewer && (
        <div
          onClick={() => setViewer(null)}
          className="absolute inset-0 z-50 flex items-center justify-center kfs-in"
          style={{ background: "rgba(22,34,31,0.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        >
          <img src={viewer} alt="" style={{ maxWidth: "92%", maxHeight: "86%", borderRadius: 18, objectFit: "contain", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }} />
        </div>
      )}

      {splash && (
        <Splash
          fading={splashFade}
          onEnter={() => {
            setSplashFade(true);
            setTimeout(() => setSplash(false), 700);
          }}
        />
      )}
    </div>
  );
}
