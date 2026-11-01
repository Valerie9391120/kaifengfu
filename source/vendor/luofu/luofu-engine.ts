import { firstClause, remainingIn } from "./pool.js";
import type {
  EngineOptions,
  GalleryEntry,
  GalleryTextOptions,
  LuofuPool,
  LuofuState,
  MemoryClarity,
  NapDuration,
  NapOptions,
  NapResult,
  PoolDream,
  PoolKind,
  SleepState,
  StateStore,
  WakeFeeling,
} from "./types.js";

// 引擎里一个梦都没有：梦、有几种梦、各叫什么、各占几成、做梦的机会，全在梦库里（见 pool.ts）。
// 这里只管怎么睡、怎么抽、怎么糊、怎么串线、梦廊怎么记。

const CROSSLINE_CHANCE = 0.05;
const NESTED_DREAM_CHANCE = 0.03;
const RECENT_LIMIT = 5;

const DURATIONS: NapDuration[] = ["小憩", "短休", "酣眠"];

/** 梦库里没写 intro 的时候，头一回打开说这一段。 */
export const DEFAULT_INTRO = `罗浮梦 · take a nap

困了就睡一会儿。
有些梦醒来便散了，有些只剩模糊片段；偶尔也会做一场记得格外清楚的梦。
那样的梦会留在梦廊里，以后可以再翻出来看。

没有奖励，没有成就，也没有必须完成的事。想睡就睡。`;

export const REOPEN_TEXT = "罗浮梦还在这里。困了就睡一会儿。";
export const EMPTY_GALLERY_TEXT = "梦廊里还没有留下梦。";
export const NOT_IN_GALLERY_TEXT = "梦廊里没有这场梦。未曾发生的梦不会被提前展示。";

export const LUOFU_RULES = {
  crosslineChance: CROSSLINE_CHANCE,
  nestedDreamChance: NESTED_DREAM_CHANCE,
  recentRepeatWindow: RECENT_LIMIT,
} as const;

// ---------------------------------------------------------------- 存档

export function emptyState(): LuofuState {
  return { v: 2, introSeen: false, totalNaps: 0, seen: [], gallery: [], recent: {} };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function galleryEntry(value: unknown, fallbackKind: string): GalleryEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  const id = typeof e.id === "string" ? e.id : "";
  const text = typeof e.text === "string" ? e.text : "";
  if (!id || !text) return null;
  const at = typeof e.at === "string" ? e.at : typeof e.triggeredAt === "string" ? e.triggeredAt : "";
  return {
    id,
    kind: typeof e.kind === "string" ? e.kind : fallbackKind,
    title: typeof e.title === "string" && e.title ? e.title : firstClause(text),
    source: typeof e.source === "string" ? e.source : typeof e.sourceLabel === "string" ? e.sourceLabel : "",
    text,
    at,
  };
}

/**
 * 读一份存档，收拾干净；读不出来当新的。
 * 也认 v0.1、v0.2 那种存档（seenDeepDreamIds、deepDreamGallery），做过的和梦廊搬过来，
 * 记在种类 "deep" 底下。
 */
export function readState(raw: unknown): LuofuState {
  const state = emptyState();
  if (!raw || typeof raw !== "object") return state;
  const s = raw as Record<string, unknown>;
  const legacy = s.v !== 2;
  state.introSeen = s.introSeen === true;
  state.totalNaps = typeof s.totalNaps === "number" && Number.isFinite(s.totalNaps) && s.totalNaps > 0 ? Math.floor(s.totalNaps) : 0;

  const rawGallery = legacy ? s.deepDreamGallery : s.gallery;
  const seenGallery = new Set<string>();
  for (const item of Array.isArray(rawGallery) ? rawGallery : []) {
    const entry = galleryEntry(item, "deep");
    if (entry && !seenGallery.has(entry.id)) {
      seenGallery.add(entry.id);
      state.gallery.push(entry);
    }
  }

  const seen = new Set(strings(legacy ? s.seenDeepDreamIds : s.seen));
  // 梦廊里有的一定算做过。
  for (const entry of state.gallery) seen.add(entry.id);
  state.seen = [...seen];

  // 旧存档里“最近几条”那几栏不搬：最多就是头几觉可能碰上刚做过的。
  if (!legacy && s.recent && typeof s.recent === "object") {
    for (const [kind, ids] of Object.entries(s.recent as Record<string, unknown>)) {
      const list = strings(ids).slice(-RECENT_LIMIT);
      if (list.length) state.recent[kind] = list;
    }
  }
  return state;
}

function cloneState(state: LuofuState): LuofuState {
  return {
    v: 2,
    introSeen: state.introSeen,
    totalNaps: state.totalNaps,
    seen: [...state.seen],
    gallery: state.gallery.map((entry) => ({ ...entry })),
    recent: Object.fromEntries(Object.entries(state.recent).map(([k, v]) => [k, [...v]])),
  };
}

// ---------------------------------------------------------------- 抽

class Roller {
  constructor(private readonly rng: () => number) {}

  next(): number {
    const x = this.rng();
    return Number.isFinite(x) ? Math.min(Math.max(x, 0), 1 - Number.EPSILON) : 0;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Cannot pick from an empty list.");
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))]!;
  }

  weighted<T extends { weight: number }>(items: readonly T[]): T | null {
    const live = items.filter((item) => item.weight > 0);
    const total = live.reduce((sum, item) => sum + item.weight, 0);
    if (!live.length || total <= 0) return null;
    let roll = this.next() * total;
    for (const item of live) {
      roll -= item.weight;
      if (roll < 0) return item;
    }
    return live[live.length - 1]!;
  }
}

function eventKinds(pool: LuofuPool, except?: string): PoolKind[] {
  return pool.kinds.filter((kind) => kind.type === "event" && kind.id !== except && kind.weight > 0 && kind.dreams.length > 0);
}

function availableKinds(pool: LuofuPool, state: LuofuState): PoolKind[] {
  return pool.kinds.filter((kind) => kind.weight > 0 && remainingIn(kind, state.seen) > 0);
}

function drawEvent(r: Roller, kind: PoolKind, state: LuofuState): PoolDream {
  const recent = state.recent[kind.id] ?? [];
  let candidates = kind.dreams.filter((dream) => !recent.includes(dream.id));
  if (candidates.length === 0) candidates = [...kind.dreams];
  const dream = r.pick(candidates);
  const next = recent.filter((id) => id !== dream.id);
  next.push(dream.id);
  while (next.length > RECENT_LIMIT) next.shift();
  state.recent[kind.id] = next;
  return dream;
}

function pickSleepState(r: Roller, duration: NapDuration): SleepState {
  const roll = r.next();
  if (duration === "小憩") {
    if (roll < 0.35) return "半梦半醒";
    if (roll < 0.80) return "未被打扰的浅眠";
    if (roll < 0.95) return "熟睡";
    return "惊醒";
  }
  if (duration === "短休") {
    if (roll < 0.25) return "半梦半醒";
    if (roll < 0.55) return "未被打扰的浅眠";
    if (roll < 0.90) return "熟睡";
    return "惊醒";
  }
  if (roll < 0.15) return "半梦半醒";
  if (roll < 0.35) return "未被打扰的浅眠";
  if (roll < 0.90) return "熟睡";
  return "惊醒";
}

function pickWakeFeeling(r: Roller, state: SleepState): WakeFeeling {
  const roll = r.next();
  if (state === "熟睡") {
    if (roll < 0.55) return "精神不错";
    if (roll < 0.80) return "没什么特别感觉";
    if (roll < 0.90) return "困乏未消";
    return "一时还有些恍惚";
  }
  if (state === "未被打扰的浅眠") {
    if (roll < 0.30) return "精神不错";
    if (roll < 0.65) return "没什么特别感觉";
    if (roll < 0.90) return "困乏未消";
    return "一时还有些恍惚";
  }
  if (state === "半梦半醒") {
    if (roll < 0.10) return "精神不错";
    if (roll < 0.40) return "没什么特别感觉";
    if (roll < 0.80) return "困乏未消";
    return "一时还有些恍惚";
  }
  if (roll < 0.10) return "精神不错";
  if (roll < 0.25) return "没什么特别感觉";
  if (roll < 0.55) return "困乏未消";
  return "一时还有些恍惚";
}

function pickClarity(r: Roller): MemoryClarity {
  const roll = r.next();
  if (roll < 0.45) return "清晰";
  if (roll < 0.80) return "片段";
  return "模糊";
}

// ---------------------------------------------------------------- 写成字

function clauses(text: string): string[] {
  return text
    .trim()
    .replace(/[。！？!?]+$/u, "")
    .split(/[，。；！？!?]/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function firstTwoClauses(text: string): string {
  return clauses(text).slice(0, 2).join("，") || firstClause(text);
}

function eventMemory(primary: PoolDream, clarity: MemoryClarity, cross: PoolDream | null): string {
  if (clarity === "清晰") {
    if (!cross) return primary.text;
    return `${primary.text}\n\n梦做到一半，事情忽然拐了个弯：${cross.text}`;
  }
  if (clarity === "片段") {
    if (!cross) return `似乎梦见了${firstTwoClauses(primary.text)}。后面的经过有些断断续续，醒来时只剩下这些片段。`;
    return `前半段似乎是${firstClause(primary.text)}。后来事情突然拐到了另一边，隐约记得${firstClause(cross.text)}。再往后的细节已经接不起来了。`;
  }
  if (!cross) return `好像梦见了这样一件事：${firstClause(primary.text)}。具体经过已经散掉了，只剩下一点模糊印象。`;
  return `只记得梦里先有${firstClause(primary.text)}，后来好像又出了一个完全不同的岔子。醒来以后，那个岔子究竟是什么已经想不起来了。`;
}

function durationLead(duration: NapDuration): string {
  if (duration === "小憩") return "小憩了一会儿";
  if (duration === "短休") return "睡了一阵";
  return "好好睡了一觉";
}

function sleepStatePhrase(state: SleepState): string {
  if (state === "熟睡") return "睡得很沉";
  if (state === "半梦半醒") return "一直有些半梦半醒";
  if (state === "惊醒") return "最后忽然惊醒";
  return "是一场没被打扰的浅眠";
}

function wakePhrase(feeling: WakeFeeling): string {
  if (feeling === "精神不错") return "精神比睡前好了些";
  if (feeling === "困乏未消") return "困意还没有完全散去";
  if (feeling === "一时还有些恍惚") return "一时还有些恍惚";
  return "没什么特别的感觉";
}

function memoryLead(clarity: MemoryClarity): string {
  if (clarity === "清晰") return "这个梦记得很清楚：";
  if (clarity === "片段") return "梦还记得一些，但已经断成了片段：";
  return "梦醒以后很快就散了：";
}

// ---------------------------------------------------------------- 对外

/** 打开罗浮梦：头一回说梦库里的 intro（没有就说 DEFAULT_INTRO），以后说一句 REOPEN_TEXT。 */
export function openLuofu(pool: LuofuPool | null, prev: LuofuState): { text: string; state: LuofuState } {
  if (prev.introSeen) return { text: REOPEN_TEXT, state: prev };
  const state = cloneState(prev);
  state.introSeen = true;
  return { text: pool?.intro || DEFAULT_INTRO, state };
}

/**
 * 睡一觉。不改传进来的存档，回一份新的。
 * 随机数用的次序跟 v0.1 一样：时长（没指定的话）、睡得怎样、醒来怎样、做不做梦、哪一种、抽哪一条……
 * 递一样的随机数，睡出来一样。梦库空着、或者一个都抽不到，就是这一觉没做梦。
 */
export function napOnce(
  pool: LuofuPool | null,
  prev: LuofuState,
  options: NapOptions & EngineOptions = {},
): { result: NapResult; state: LuofuState } {
  const r = new Roller(options.rng ?? Math.random);
  const now = options.now ?? (() => new Date());
  const state = cloneState(prev);

  const duration = options.duration ?? r.pick(DURATIONS);
  const sleepState = pickSleepState(r, duration);
  const wakeFeeling = pickWakeFeeling(r, sleepState);
  state.totalNaps += 1;

  const head = `你${durationLead(duration)}，这一觉${sleepStatePhrase(sleepState)}。`;
  const tail = `醒来以后，${wakePhrase(wakeFeeling)}。`;
  const base = { duration, sleepState, wakeFeeling };

  const noDream = () => ({
    result: { ...base, hadDream: false, text: `${head}\n\n这一觉没有留下什么梦。时间安静地过去了一阵。\n\n${tail}` },
    state,
  });

  const dreamChance = pool ? pool.dreamChance : 0;
  if (r.next() >= dreamChance || !pool) return noDream();

  const kind = r.weighted(availableKinds(pool, state));
  if (!kind) return noDream();

  if (kind.type === "card") {
    const done = new Set(state.seen);
    const dream = r.pick(kind.dreams.filter((d) => !done.has(d.id)));
    const title = dream.title || firstClause(dream.text);
    state.seen.push(dream.id);
    state.gallery.push({ id: dream.id, kind: kind.id, title, source: dream.source ?? "", text: dream.text, at: now().toISOString() });
    return {
      result: {
        ...base,
        hadDream: true,
        kind: kind.id,
        kindName: kind.name,
        kindType: "card",
        dreamId: dream.id,
        title,
        galleryAdded: true,
        crossline: false,
        nestedDream: false,
        text: `${head}\n\n这一次，你做了一场完整而清晰的${kind.name}。\n\n${dream.text}\n\n${tail}`,
      },
      state,
    };
  }

  const primary = drawEvent(r, kind, state);
  const crossRoll = r.next() < CROSSLINE_CHANCE;
  const crossKind = crossRoll ? r.weighted(eventKinds(pool, kind.id)) : null;
  const cross = crossKind ? drawEvent(r, crossKind, state) : null;
  const clarity = pickClarity(r);
  let body = eventMemory(primary, clarity, cross);

  const nested = r.next() < NESTED_DREAM_CHANCE;
  if (nested) {
    const nestedKind = r.weighted(eventKinds(pool)) ?? kind;
    const nestedPrimary = drawEvent(r, nestedKind, state);
    const nestedCrossRoll = r.next() < CROSSLINE_CHANCE;
    const nestedCrossKind = nestedCrossRoll ? r.weighted(eventKinds(pool, nestedKind.id)) : null;
    const nestedCross = nestedCrossKind ? drawEvent(r, nestedCrossKind, state) : null;
    const second = eventMemory(nestedPrimary, pickClarity(r), nestedCross);
    body += `\n\n后来你在梦里又睡着了。\n\n第二层梦里，${second}\n\n你先从第二层梦里醒来，过了一会儿才真正醒。`;
  }

  return {
    result: {
      ...base,
      hadDream: true,
      kind: kind.id,
      kindName: kind.name,
      kindType: "event",
      memoryClarity: clarity,
      dreamId: primary.id,
      crossline: !!cross,
      nestedDream: nested,
      text: `${head}\n\n${memoryLead(clarity)}\n${body}\n\n${tail}`,
    },
    state,
  };
}

/**
 * 梦廊里写的那一天（YYYY-MM-DD）：默认照 UTC（at 取前十个字）；给了 timeZone 照那个时区的日子。
 * 认不出的时区、读不出的时间，照 UTC 那样写。
 */
function dayOf(at: string, timeZone?: string): string {
  const utc = at.slice(0, 10);
  if (!timeZone) return utc;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return utc;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(t));
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const day = `${part("year")}-${part("month")}-${part("day")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : utc;
  } catch {
    return utc;
  }
}

/** 梦廊：做过的 card，最新的在最上面。不写一共多少、还剩多少。哪天做的照 options.timeZone 写（不给照 UTC）。 */
export function galleryText(state: LuofuState, options: GalleryTextOptions = {}): string {
  if (state.gallery.length === 0) return EMPTY_GALLERY_TEXT;
  return [...state.gallery]
    .reverse()
    .map((entry, index) => {
      const lines = [`${index + 1}. ${entry.title}`];
      if (entry.source) lines.push(`   来源：${entry.source}`);
      if (entry.at) lines.push(`   ${dayOf(entry.at, options.timeZone)}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * 在梦廊里找一场：编号或者标题都行（标题重了取最近做的那一场）；
 * 也认 galleryText 列出来的那个序号（“1”是最新的那一场，也写得成“第 1 场”“#1”），先认编号、再认标题、最后认序号。
 * 没做过的不给看。
 */
export function findInGallery(state: LuofuState, idOrTitle: string): GalleryEntry | null {
  const query = idOrTitle.trim();
  if (!query) return null;
  const byId = state.gallery.find((entry) => entry.id === query);
  if (byId) return byId;
  for (let i = state.gallery.length - 1; i >= 0; i -= 1) {
    if (state.gallery[i]!.title === query) return state.gallery[i]!;
  }
  const no = /^(?:#|第)?\s*(\d+)\s*(?:场)?$/u.exec(query);
  if (no) {
    const n = Number(no[1]);
    if (n >= 1 && n <= state.gallery.length) return state.gallery[state.gallery.length - n]!;
  }
  return null;
}

/** 读梦廊里的一场（找法同 findInGallery）。“入梦”那一天照 options.timeZone 写（不给照 UTC）。 */
export function readGalleryText(state: LuofuState, idOrTitle: string, options: GalleryTextOptions = {}): string {
  const entry = findInGallery(state, idOrTitle);
  if (!entry) return NOT_IN_GALLERY_TEXT;
  const lines = [entry.title];
  if (entry.source) lines.push(`来源：${entry.source}`);
  if (entry.at) lines.push(`入梦：${dayOf(entry.at, options.timeZone)}`);
  return `${lines.join("\n")}\n\n${entry.text}`;
}

/** 带存档的用法：存档交给一个 StateStore，梦库递进来。 */
export class LuofuDreamEngine {
  private readonly rng: () => number;
  private readonly now: () => Date;

  constructor(
    private readonly store: StateStore,
    private readonly pool: LuofuPool | null,
    options: EngineOptions = {},
  ) {
    this.rng = options.rng ?? Math.random;
    this.now = options.now ?? (() => new Date());
  }

  private async load(): Promise<LuofuState> {
    return readState(await this.store.load());
  }

  async open(): Promise<string> {
    const prev = await this.load();
    const { text, state } = openLuofu(this.pool, prev);
    if (state !== prev) await this.store.save(state);
    return text;
  }

  async nap(options: NapOptions = {}): Promise<NapResult> {
    const { result, state } = napOnce(this.pool, await this.load(), { ...options, rng: this.rng, now: this.now });
    await this.store.save(state);
    return result;
  }

  async gallery(): Promise<string> {
    return galleryText(await this.load());
  }

  async readGalleryDream(idOrTitle: string): Promise<string> {
    return readGalleryText(await this.load(), idOrTitle);
  }

  async getStateSnapshot(): Promise<LuofuState> {
    return cloneState(await this.load());
  }
}
