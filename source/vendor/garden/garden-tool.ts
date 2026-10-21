import type { GardenAction, GardenCommand, PlantId } from "./types.js";
import { GardenEngine } from "./garden-engine.js";

export const GARDEN_TOOL_SCHEMA = {
  name: "play_garden",
  description: "一个纯文字园艺小游戏。每天可在浇水、松土、修剪中任选一次作为有效照料；赏花不限次数。累计 30 个有效照料日后植物首次开花并收入《群芳谱》。首株魏紫完成后可自选其他品种。未解锁成就不剧透。",
  parameters: {
    type: "object",
    properties: {
      action: { type:"string", enum:["open","status","admire","water","loosen","prune","collection","achievements","plants","plant"] },
      plantId: { type:"string", description:"plant 时要培育的品种 id" },
      targetPlantId: { type:"string", description:"admire 时要赏的品种 id；不填则优先赏当前植物，若当前没有正在培育的植物，则赏最近栽成的一株" }
    },
    required:["action"]
  }
} as const;

export function createGardenTool(engine:GardenEngine) {
  return async (args:{action:GardenAction;plantId?:PlantId;targetPlantId?:PlantId}) => {
    const result=await engine.execute(args as GardenCommand);
    const parts=[result.text,...result.events];
    for (const a of result.newAchievements) parts.push(`成就解锁——${a.name}\n${a.description}`);
    return parts.filter(Boolean).join("\n\n");
  };
}
