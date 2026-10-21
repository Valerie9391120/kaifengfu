import { ITEMS } from "./dressing-data.js";
import type { Category, RewardUnlock } from "./types.js";

export interface RewardDefinition {
  milestone:number;
  itemId:string;
}

export const REWARDS:RewardDefinition[]=[
  {milestone:3,itemId:"reward_swim_goggles"},
  {milestone:5,itemId:"reward_crocs"},
  {milestone:8,itemId:"reward_gold_underwear"},
  {milestone:12,itemId:"reward_plastic_crown"},
  {milestone:16,itemId:"reward_cockroach_suit"},
  {milestone:20,itemId:"reward_frog_raincoat"},
  {milestone:24,itemId:"reward_hot_pink_puffer"},
  {milestone:28,itemId:"reward_giant_red_bow"},
  {milestone:32,itemId:"reward_dinosaur_onesie"},
  {milestone:36,itemId:"reward_diamond_swim_ring"},
  {milestone:40,itemId:"reward_fox_tail"},
  {milestone:50,itemId:"reward_supreme_gold_crocs"}
];

export function rewardUnlocks(unlockedAchievementCount:number,already:string[]):RewardUnlock[] {
  const out:RewardUnlock[]=[];
  for (const r of REWARDS) {
    if (unlockedAchievementCount<r.milestone || already.includes(r.itemId)) continue;
    const item=ITEMS[r.itemId];
    out.push({id:item.id,name:item.name,category:item.category as Category,description:item.description??"",milestone:r.milestone});
  }
  return out;
}
