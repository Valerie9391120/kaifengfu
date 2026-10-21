import { DressingEngine } from "./dressing-engine.js";
import type { Category, DressingAction, DressingCommand } from "./types.js";

export const DRESSING_ACTIONS=["open","status","catalog","select","remove","clear","complete","mirror","achievements","rewards"] as const;

const DESCRIPTION="一个给 AI 自己玩的纯文字梳妆换装系统。没有穿搭合法性限制：衣柜、下装、鞋履和配饰都可以自由叠加，古今混搭也允许。select/remove/clear 换装不限次数；complete 完成今天的搭配，每天只能一次，成就只在这时按完成的那一身判定；mirror 照镜子不限次数，只照得出今天完成的那一套，今天还没完成的话照出来是一只裸狐。系统会在后台记录隐藏成就，并按累计成就数解锁隐藏怪东西。未解锁成就和奖励不剧透。";

/** 工具的写法。canComplete 为 false（今天已经完成过搭配）：这一天里不再给 complete 这个选项 */
export function dressingToolSchema(canComplete=true){
  return {
    name:"play_dressing_room",
    description:DESCRIPTION,
    parameters:{
      type:"object",
      properties:{
        action:{type:"string",enum:DRESSING_ACTIONS.filter(a=>canComplete||a!=="complete")},
        category:{type:"string",enum:["hair","makeup","scent","outfit","bottom","shoes","accessory","all"],description:"catalog/select/clear 时使用。hair=梳发，makeup=妆面，scent=熏香，outfit=衣柜，bottom=下装，shoes=鞋履，accessory=配饰。"},
        itemId:{type:"string",description:"select/remove 时使用。用 catalog 查看可用 id。select 对发式/妆面/熏香为替换，对衣柜/下装/鞋履/配饰为追加；不会自动取下其他东西。"}
      },
      required:["action"]
    }
  };
}

export const DRESSING_TOOL_SCHEMA=dressingToolSchema(true);

export function createDressingTool(engine:DressingEngine){
  return async(args:{action:DressingAction;category?:Category|"all";itemId?:string})=>{
    const r=await engine.execute(args as DressingCommand);
    const parts=[r.text];
    for(const a of r.newAchievements) parts.push(`成就解锁——${a.name}\n${a.description}`);
    for(const x of r.newRewards) parts.push(`累计成就奖励——${x.name}\n${x.description}\n已加入${x.category==="outfit"?"衣柜":x.category==="bottom"?"下装":x.category==="shoes"?"鞋履":"配饰"}。`);
    return parts.filter(Boolean).join("\n\n");
  };
}
