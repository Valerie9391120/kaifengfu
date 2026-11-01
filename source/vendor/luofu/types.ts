export type NapDuration = "小憩" | "短休" | "酣眠";
export type SleepState = "半梦半醒" | "熟睡" | "未被打扰的浅眠" | "惊醒";
export type WakeFeeling = "困乏未消" | "精神不错" | "没什么特别感觉" | "一时还有些恍惚";
export type MemoryClarity = "清晰" | "片段" | "模糊";

/**
 * 一种梦是哪一类：
 * - event：可以重复做，会糊成片段，会串线到别的 event，会出梦中梦，不进梦廊；
 * - card：一张只做一次，记得完整清楚，不串线、不套梦中梦，做过就收进梦廊、不再抽到。
 */
export type KindType = "event" | "card";

export interface PoolDream {
  id: string;
  text: string;
  /** card 才用：梦廊里的标题。 */
  title?: string;
  /** card 才用：来源标签，可以没有。 */
  source?: string;
}

export interface PoolKind {
  id: string;
  name: string;
  type: KindType;
  /** 有梦的时候这一种占多少。相对数，眼下抽得到的几种之间折算。 */
  weight: number;
  dreams: PoolDream[];
}

/** 梦库。引擎里一个梦都没有，梦全在这里，从外头递进来。 */
export interface LuofuPool {
  v: 1;
  /** 睡一觉做梦的机会，0 到 1。 */
  dreamChance: number;
  /** 头一回打开时那段说明，可以没有。 */
  intro?: string;
  kinds: PoolKind[];
}

export interface GalleryEntry {
  id: string;
  /** 哪一种梦（PoolKind.id）。 */
  kind: string;
  title: string;
  source: string;
  text: string;
  /** 什么时候做的，ISO 时间。 */
  at: string;
}

export interface LuofuState {
  v: 2;
  introSeen: boolean;
  totalNaps: number;
  /** 做过的 card 的编号，做过的不再抽。 */
  seen: string[];
  /** 梦廊：做过的 card，照做的先后排。梦库以后删了改了，这里留着当时做的那一份。 */
  gallery: GalleryEntry[];
  /** 每一种 event 最近做过的几条（PoolKind.id → 编号），这几条先不重复。 */
  recent: Record<string, string[]>;
}

export interface NapOptions {
  duration?: NapDuration;
}

export interface NapResult {
  text: string;
  duration: NapDuration;
  sleepState: SleepState;
  wakeFeeling: WakeFeeling;
  hadDream: boolean;
  /** 做的是哪一种（PoolKind.id）。 */
  kind?: string;
  kindName?: string;
  kindType?: KindType;
  memoryClarity?: MemoryClarity;
  dreamId?: string;
  /** card 的标题。 */
  title?: string;
  crossline?: boolean;
  nestedDream?: boolean;
  galleryAdded?: boolean;
}

export interface StateStore {
  load(): Promise<unknown>;
  save(state: LuofuState): Promise<void>;
}

export interface EngineOptions {
  rng?: () => number;
  now?: () => Date;
}
