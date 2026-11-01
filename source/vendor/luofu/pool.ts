import type { KindType, LuofuPool, PoolDream, PoolKind } from "./types.js";

/** 梦库文件头上的记号：{ "kind": "kfs-luofu-pool", "v": 1, ... } */
export const POOL_FILE_KIND = "kfs-luofu-pool";

export const DEFAULT_DREAM_CHANCE = 0.75;

/** 读梦库时的上限：超出的截掉或者不要。 */
export const POOL_LIMITS = {
  kinds: 12,
  dreamsPerKind: 2000,
  text: 2000,
  title: 40,
  source: 80,
  kindName: 12,
  id: 64,
  intro: 800,
} as const;

function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join("").trim() : text;
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return clip(value.replace(/\r\n?/gu, "\n").trim(), max);
}

/** 只占一行的字（名字、标题、来源、编号）：空白并成一个空格。 */
function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return clip(value.replace(/\s+/gu, " ").trim(), max);
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** 一段梦的头一句，card 没写标题的时候拿它当标题。 */
export function firstClause(text: string): string {
  const parts = text
    .trim()
    .replace(/[。！？!?]+$/u, "")
    .split(/[，。；！？!?]/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[0] ?? text.trim();
}

function uniqueId(wanted: string, fallbackBase: string, used: Set<string>): string {
  if (wanted && !used.has(wanted)) {
    used.add(wanted);
    return wanted;
  }
  let n = used.size + 1;
  let id = `${fallbackBase}_${n}`;
  while (used.has(id)) {
    n += 1;
    id = `${fallbackBase}_${n}`;
  }
  used.add(id);
  return id;
}

/** 认不认得出这是一份梦库文件（导入的时候用来说一句“这不是梦库文件”）。 */
export function isPoolFile(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && (raw as Record<string, unknown>).kind === POOL_FILE_KIND && Array.isArray((raw as Record<string, unknown>).kinds);
}

/**
 * 读一份梦库，收拾干净：前后空白、重复的梦、空的不要，太长的截短；
 * 同名的种类只留头一个，最多十二种；比例不是数或者是负数的当 0；
 * 编号重了或者没写的另起一个；card 没写标题的拿头一句当标题。
 * 读不出来（不是对象、没有 kinds）回 null。梦库文件和存档里的那一份都认。
 */
export function readPool(raw: unknown): LuofuPool | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (!Array.isArray(input.kinds)) return null;

  const chance = toNumber(input.dreamChance);
  const dreamChance = chance === null ? DEFAULT_DREAM_CHANCE : Math.min(1, Math.max(0, chance));
  const intro = cleanText(input.intro, POOL_LIMITS.intro);

  const kindIds = new Set<string>();
  const kindNames = new Set<string>();
  const dreamIds = new Set<string>();
  const kinds: PoolKind[] = [];

  for (const rawKind of input.kinds) {
    if (kinds.length >= POOL_LIMITS.kinds) break;
    if (!rawKind || typeof rawKind !== "object") continue;
    const k = rawKind as Record<string, unknown>;
    const type: KindType | null = k.type === "event" || k.type === "card" ? k.type : null;
    if (!type) continue;
    const name = cleanLine(k.name, POOL_LIMITS.kindName);
    if (!name || kindNames.has(name)) continue;
    kindNames.add(name);
    const id = uniqueId(cleanLine(k.id, POOL_LIMITS.id), "kind", kindIds);
    const w = toNumber(k.weight);
    const weight = w === null || w < 0 ? 0 : w;

    const texts = new Set<string>();
    const dreams: PoolDream[] = [];
    for (const rawDream of Array.isArray(k.dreams) ? k.dreams : []) {
      if (dreams.length >= POOL_LIMITS.dreamsPerKind) break;
      const d = (typeof rawDream === "string" ? { text: rawDream } : rawDream) as Record<string, unknown> | null;
      if (!d || typeof d !== "object") continue;
      const text = cleanText(d.text, POOL_LIMITS.text);
      if (!text || texts.has(text)) continue;
      texts.add(text);
      const dreamId = uniqueId(cleanLine(d.id, POOL_LIMITS.id), id, dreamIds);
      if (type === "card") {
        const title = cleanLine(d.title, POOL_LIMITS.title) || clip(firstClause(text), POOL_LIMITS.title);
        const source = cleanLine(d.source ?? d.sourceLabel, POOL_LIMITS.source);
        dreams.push(source ? { id: dreamId, title, source, text } : { id: dreamId, title, text });
      } else {
        dreams.push({ id: dreamId, text });
      }
    }
    kinds.push({ id, name, type, weight, dreams });
  }

  const pool: LuofuPool = { v: 1, dreamChance, kinds };
  if (intro) pool.intro = intro;
  return pool;
}

/** 一种梦眼下还剩几条抽得到：event 是全部，card 是还没做过的。 */
export function remainingIn(kind: PoolKind, seen: readonly string[]): number {
  if (kind.type === "event") return kind.dreams.length;
  const done = new Set(seen);
  return kind.dreams.filter((dream) => !done.has(dream.id)).length;
}

/**
 * 有梦的时候各种梦占几成（0 到 1，加起来是 1）。没梦可抽的、比例是 0 的不算在里头。
 * 传了 seen，做完了的 card 也不算；不传就照整份梦库算。
 */
export function sharesOf(pool: LuofuPool, seen?: readonly string[]): Record<string, number> {
  const live = pool.kinds.filter((kind) => kind.weight > 0 && (seen ? remainingIn(kind, seen) : kind.dreams.length) > 0);
  const total = live.reduce((sum, kind) => sum + kind.weight, 0);
  const shares: Record<string, number> = {};
  for (const kind of pool.kinds) shares[kind.id] = 0;
  if (total > 0) for (const kind of live) shares[kind.id] = kind.weight / total;
  return shares;
}

/** 梦库里一共多少个梦。 */
export function poolSize(pool: LuofuPool): number {
  return pool.kinds.reduce((sum, kind) => sum + kind.dreams.length, 0);
}
