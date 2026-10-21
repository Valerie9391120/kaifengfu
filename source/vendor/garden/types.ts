export type PlantId =
  | "peony_weizi"
  | "peony_yulouchun"
  | "white_plum"
  | "xifu_begonia"
  | "zhilan"
  | "azalea"
  | "camellia"
  | "osmanthus"
  | "rose"
  | "narcissus"
  | "autumn_chrysanthemum"
  | "hibiscus";

export type CareAction = "water" | "loosen" | "prune";
export type GardenAction =
  | "open"
  | "status"
  | "admire"
  | CareAction
  | "collection"
  | "achievements"
  | "plants"
  | "plant";

export interface PlantDefinition {
  id: PlantId;
  displayName: string;
  shortName: string;
  familyKey: string;
  collectionText: string;
  bloomText: string;
}

export interface PlantHistory {
  completed: boolean;
  completedAt?: string;
  deaths: number;
  admireCount: number;
  firstAdmiredAt?: string;
}

export interface GardenStats {
  water: number;
  loosen: number;
  prune: number;
  admire: number;
  totalCare: number;
  consecutiveCareDays: number;
  bestCareStreak: number;
  lastCareDate?: string;
  deaths: number;
  completedPlants: number;
}

export interface GardenState {
  version: 1;
  initialized: boolean;
  firstGardenDate?: string;
  currentPlant?: PlantId;
  currentPlantStartedAt?: string;
  careDays: number;
  todayCareAction?: CareAction;
  todayCareDate?: string;
  completedPlants: PlantId[];
  unlockedAchievements: string[];
  stats: GardenStats;
  plantHistory: Partial<Record<PlantId, PlantHistory>>;
  lastBloomEventPlant?: PlantId;
  lastBloomEventDate?: string;
  cleanBloomStreak: number;
  dailyAdmire?: { date: string; counts: Partial<Record<PlantId, number>> };
}

export interface GardenResult {
  ok: boolean;
  text: string;
  events: string[];
  newAchievements: { id: string; name: string; description: string }[];
  state: GardenState;
}

export interface GardenCommand {
  action: GardenAction;
  plantId?: PlantId;
  targetPlantId?: PlantId;
}

export interface GardenStore {
  /** Must be atomic if multiple devices may write at the same time. */
  update<T>(fn: (state: GardenState | null) => Promise<[GardenState, T]> | [GardenState, T]): Promise<T>;
  load(): Promise<GardenState | null>;
}

export interface GardenClock {
  today(): string; // YYYY-MM-DD in the user's chosen timezone
}
