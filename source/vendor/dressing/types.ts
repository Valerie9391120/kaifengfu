export type Category = "hair" | "makeup" | "scent" | "outfit" | "bottom" | "shoes" | "accessory";
export type SingleCategory = "hair" | "makeup" | "scent";
export type MultiCategory = "outfit" | "bottom" | "shoes" | "accessory";

export interface StyleItem {
  id: string;
  name: string;
  category: Category;
  /** Used only for loose hidden-achievement matching, never to block a look. */
  sourceTags?: string[];
  formal?: boolean;
  bold?: boolean;
  ancientFormal?: boolean;
  headFace?: boolean;
  base: boolean;
  reward?: boolean;
  description?: string;
}

export interface Appearance {
  hair: string;
  makeup: string;
  scent: string;
  outfits: string[];
  bottoms: string[];
  shoes: string[];
  accessories: string[];
}

export interface TouchedCategories {
  hair: boolean;
  makeup: boolean;
  scent: boolean;
  outfit: boolean;
  bottom: boolean;
  shoes: boolean;
  accessory: boolean;
}

export interface DressingStats {
  mirrorCount: number;
  /** 累计完成搭配几次（一天最多一次） */
  completeCount: number;
  usedHair: string[];
  usedMakeup: string[];
  usedScent: string[];
  usedOutfits: string[];
  usedBottoms: string[];
  usedShoes: string[];
  usedAccessories: string[];
  /** 连着几次完成搭配都穿着“不穿” */
  nakedCompleteStreak: number;
  /** 连着几次完成搭配都没有跣足 */
  noBarefootCompleteStreak: number;
}

export interface DressingState {
  version: 1;
  initialized: boolean;
  firstOpenedDate?: string;
  appearance: Appearance;
  touched: TouchedCategories;
  unlockedAchievements: string[];
  unlockedRewards: string[];
  stats: DressingStats;
  currentDay?: { date: string; mirrorCount: number };
  /** 今天完成的那一套（镜子里只照得出它；date 不是今天就当还没完成） */
  completedLook?: { date: string; appearance: Appearance };
  dailyFinalLooks: { date: string; signature: string }[];
}

export interface AchievementUnlock {
  id: string;
  name: string;
  description: string;
}

export interface RewardUnlock {
  id: string;
  name: string;
  category: Category;
  description: string;
  milestone: number;
}

export interface DressingResult {
  ok: boolean;
  text: string;
  newAchievements: AchievementUnlock[];
  newRewards: RewardUnlock[];
  state: DressingState;
}

export type DressingAction =
  | "open"
  | "status"
  | "catalog"
  | "select"
  | "remove"
  | "clear"
  | "complete"
  | "mirror"
  | "achievements"
  | "rewards";

export interface DressingCommand {
  action: DressingAction;
  category?: Category | "all";
  itemId?: string;
}

export interface DressingStore {
  /** Must be atomic if phone and laptop may write at the same time. */
  update<T>(fn: (state: DressingState | null) => Promise<[DressingState, T]> | [DressingState, T]): Promise<T>;
  load(): Promise<DressingState | null>;
}

export interface DressingClock {
  today(): string; // YYYY-MM-DD in the user's chosen timezone
}
