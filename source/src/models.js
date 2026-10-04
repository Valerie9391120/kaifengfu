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

// 每百万 token 的美元价：[新读, 5分钟缓存写, 1小时缓存写, 缓存读, 写出]（2026年10月官方价）
const PRICES = {
  "claude-sonnet-4-6": [3, 3.75, 6, 0.3, 15],
  "claude-opus-4-6": [5, 6.25, 10, 0.5, 25],
  "claude-fable-5-1": [10, 12.5, 20, 0.25, 50],
  "claude-opus-5-5": [4, 5, 8, 0.2, 20],
  "claude-sonnet-5-5": [2, 2.5, 4, 0.2, 10],
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
