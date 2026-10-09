import { pad } from "./days.js";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "一直陪你聊的这个" },
  { id: "claude-opus-4-6", label: "Opus 4.6", note: "上一代 Opus" },
  { id: "claude-fable-5-1", label: "Fable 5.1", note: "最强，也最贵" },
  { id: "claude-opus-5-5", label: "Opus 5.5", note: "最新的 Opus" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "新一代 Sonnet，比 4.6 还省" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "最快最省" },
];
export const modelLabel = (id) => {
  const m = MODELS.find((x) => x.id === id || String(id || "").startsWith(x.id));
  return m ? m.label : id || "";
};

// 屋子多大：一回最多装得下多少 token（上下文窗口，2026年10月官方文档上的数）。
// “他记多长”要看它：屋子小的模型，对话攒不到那一档写的那么厚就得抄提要（见 recap.js 的 roomFor）。
// 这里没写的模型按二十万算（往小里算，不会撑破）
const WINDOWS = {
  "claude-sonnet-4-6": 1000000,
  "claude-opus-4-6": 1000000,
  "claude-fable-5-1": 1000000,
  "claude-opus-5-5": 1000000,
  "claude-sonnet-5-5": 1000000,
  "claude-haiku-4-5": 200000,
};
export function windowOf(model) {
  const id = Object.keys(WINDOWS).find((k) => String(model || "").startsWith(k));
  return id ? WINDOWS[id] : 200000;
}

// 哪些模型自己会先想一阵再写（2026年10月官方文档“Thinking”那一页的表）。
// Fable 5.1、Opus 5.5、Sonnet 5.5 的思考不用开、也关不掉：想的那些字不回给这头看，可照样算在 max_tokens 里、按写出的价收钱。
// 下面这三个不写明要就不想。这里没写的模型当它会先想：新出的都这样；上限放宽一点不碍事，放窄了正文会被想的挤掉。
// 眼下只有抄前情提要的那一回看它（App.jsx 的 RECAP_ROOM_THINK）
const PLAIN_WRITERS = ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"];
export const thinksFirst = (model) => !PLAIN_WRITERS.some((k) => String(model || "").startsWith(k));

// 每百万 token 的美元价：[新读, 5分钟缓存写, 1小时缓存写, 缓存读, 写出]（2026年10月官方价）
const PRICES = {
  "claude-sonnet-4-6": [3, 3.75, 6, 0.3, 15],
  "claude-opus-4-6": [5, 6.25, 10, 0.5, 25],
  "claude-fable-5-1": [10, 12.5, 20, 0.25, 50],
  "claude-opus-5-5": [4, 5, 8, 0.2, 20],
  "claude-sonnet-5-5": [2, 2.5, 4, 0.1, 10],
  "claude-haiku-4-5": [1, 1.25, 2, 0.1, 5],
};

export function costOf(model, u) {
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

export function money(x) {
  if (x == null) return "";
  if (x < 0.01) return "$" + x.toFixed(4);
  return "$" + x.toFixed(x < 1 ? 3 : 2);
}

export const usageKey = (d = new Date()) => `kfs2:usage:${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
