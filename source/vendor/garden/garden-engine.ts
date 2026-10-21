import { ACHIEVEMENTS } from "./achievements.js";
import { CARE_TEXT, INTRO_TEXT, PLANTS, PLANT_ORDER, STAGE_TEXTS } from "./garden-data.js";
import { dayDiff, isNextDay } from "./date-utils.js";
import type { CareAction, GardenClock, GardenCommand, GardenResult, GardenState, GardenStore, PlantId } from "./types.js";

const DEFAULT_STATE: GardenState = {
  version: 1,
  initialized: false,
  careDays: 0,
  completedPlants: [],
  unlockedAchievements: [],
  stats: { water:0, loosen:0, prune:0, admire:0, totalCare:0, consecutiveCareDays:0, bestCareStreak:0, deaths:0, completedPlants:0 },
  plantHistory: {},
  cleanBloomStreak: 0
};

const DEATH_PROBABILITY = 0.0002; // 0.02% per valid care action during cultivation only

function cloneDefault(): GardenState { return JSON.parse(JSON.stringify(DEFAULT_STATE)); }
function pick<T>(arr: readonly T[], rng:()=>number): T { return arr[Math.floor(rng()*arr.length)]!; }
function stageFor(careDays:number): "sprout"|"leaf"|"bud"|"bloom" {
  if (careDays>=30) return "bloom";
  if (careDays>=21) return "bud";
  if (careDays>=11) return "leaf";
  return "sprout";
}
function historyOf(state:GardenState,id:PlantId) {
  return state.plantHistory[id] ?? { completed:false, deaths:0, admireCount:0 };
}
function setHistory(state:GardenState,id:PlantId,h:ReturnType<typeof historyOf>) { state.plantHistory[id]=h; }

function achievementSweep(state:GardenState, ctx:Parameters<(typeof ACHIEVEMENTS)[number]["check"]>[1], today:string, sameDayAdmireCount=0) {
  const newly:{id:string;name:string;description:string}[]=[];
  for (const a of ACHIEVEMENTS) {
    if (state.unlockedAchievements.includes(a.id)) continue;
    let ok = a.check(state, ctx);
    if (a.id==="admire_same_3") ok = sameDayAdmireCount>=3;
    if (a.id==="admire_same_10") ok = sameDayAdmireCount>=10;
    if (a.id==="garden_180") ok = Boolean(state.firstGardenDate && dayDiff(state.firstGardenDate,today)>=180);
    if (a.id==="garden_365") ok = Boolean(state.firstGardenDate && dayDiff(state.firstGardenDate,today)>=365);
    if (a.id==="three_clean_blooms") ok = state.cleanBloomStreak>=3;
    if (ok) { state.unlockedAchievements.push(a.id); newly.push({id:a.id,name:a.name,description:a.description}); }
  }
  return newly;
}

export class GardenEngine {
  constructor(private store:GardenStore, private clock:GardenClock, private rng:()=>number=Math.random) {}

  async execute(cmd:GardenCommand):Promise<GardenResult> {
    return this.store.update(async loaded=>{
      const state = loaded ? structuredClone(loaded) : cloneDefault();
      const today = this.clock.today();
      // Daily care flags are only meaningful for the current calendar day.
      // Clearing stale flags here keeps status text truthful and preserves the
      // one-valid-care-action-per-day rule across restarts and devices.
      if (state.todayCareDate && state.todayCareDate !== today) {
        state.todayCareDate=undefined;
        state.todayCareAction=undefined;
      }
      const events:string[]=[];
      let text="";
      let ctx:any={ today };
      let sameDayAdmireCount=0;

      if (!state.initialized) {
        state.initialized=true;
        state.firstGardenDate=today;
        state.currentPlant="peony_weizi";
        state.currentPlantStartedAt=today;
        text=INTRO_TEXT;
        if (cmd.action!=="open") events.push("园艺系统已初始化。魏紫牡丹已开始培育。 ");
      }

      const plant = state.currentPlant ? PLANTS[state.currentPlant] : undefined;

      if (cmd.action==="open") {
        if (!text) text=this.statusText(state);
      } else if (cmd.action==="status") {
        text=this.statusText(state);
      } else if (cmd.action==="collection") {
        text=this.collectionText(state);
      } else if (cmd.action==="achievements") {
        text=this.achievementText(state);
      } else if (cmd.action==="plants") {
        text=this.plantsText(state);
      } else if (cmd.action==="plant") {
        if (state.currentPlant && state.careDays<30) {
          text=`${PLANTS[state.currentPlant].displayName}尚在培育中，暂时不能另栽新花。`;
        } else if (!cmd.plantId || !PLANTS[cmd.plantId]) {
          text="请选择要培育的品种。";
        } else if (!state.completedPlants.includes("peony_weizi") && cmd.plantId!=="peony_weizi") {
          text="先将魏紫培育开花，之后才能自选新的品种。";
        } else {
          const h=historyOf(state,cmd.plantId);
          state.currentPlant=cmd.plantId;
          state.currentPlantStartedAt=today;
          state.careDays=0;
          ctx.startedPlant=cmd.plantId;
          ctx.replanted=h.deaths>0?cmd.plantId:undefined;
          text=h.deaths>0
            ? `你将${PLANTS[cmd.plantId].displayName}重新安置妥当。新的培育由今日开始。`
            : `你将${PLANTS[cmd.plantId].displayName}安置妥当。新的培育由今日开始。`;
        }
      } else if (cmd.action==="admire") {
        const target=cmd.targetPlantId ?? state.currentPlant ?? state.completedPlants[state.completedPlants.length-1];
        if (!target || !PLANTS[target]) {
          text="庭中尚无可赏之花。";
        } else if (target===state.currentPlant && state.careDays<30) {
          const stage=stageFor(state.careDays);
          text=pick(STAGE_TEXTS[stage as "sprout"|"leaf"|"bud"],this.rng);
        } else if (!state.completedPlants.includes(target)) {
          text=`${PLANTS[target].displayName}尚未栽成。`;
        } else {
          text=PLANTS[target].bloomText;
        }
        if (target && (target===state.currentPlant || state.completedPlants.includes(target))) {
          const h=historyOf(state,target);
          h.admireCount+=1;
          h.firstAdmiredAt ??= today;
          setHistory(state,target,h);
          state.stats.admire+=1;
          ctx.justAdmired=target;
          // Daily per-plant admire counter is intentionally transient and hidden from state schema.
          const bag=state.dailyAdmire && state.dailyAdmire.date===today
            ? state.dailyAdmire
            : { date: today, counts: {} };
          bag.counts[target]=(bag.counts[target]??0)+1;
          state.dailyAdmire=bag;
          sameDayAdmireCount=bag.counts[target] ?? 0;
        }
      } else if (["water","loosen","prune"].includes(cmd.action)) {
        const action=cmd.action as CareAction;
        if (!state.currentPlant) {
          text="庭中尚无正在培育的植物。";
        } else if (state.careDays>=30) {
          text=`${PLANTS[state.currentPlant].displayName}已经栽成。若想继续培育，可以另选一个品种。`;
        } else if (state.todayCareDate===today) {
          text=`今日已经${state.todayCareAction==="water"?"浇过水":state.todayCareAction==="loosen"?"松过土":"修剪过"}了。每日只需照料一次。`;
        } else {
          const p=PLANTS[state.currentPlant];
          const raw=CARE_TEXT[action];
          text=Array.isArray(raw)?pick(raw,this.rng):raw;
          state.todayCareDate=today;
          state.todayCareAction=action;
          state.careDays+=1;
          state.stats[action]+=1;
          state.stats.totalCare+=1;
          state.stats.consecutiveCareDays=isNextDay(state.stats.lastCareDate,today)?state.stats.consecutiveCareDays+1:1;
          state.stats.bestCareStreak=Math.max(state.stats.bestCareStreak,state.stats.consecutiveCareDays);
          state.stats.lastCareDate=today;

          // The 30th valid care action is the guaranteed first bloom.
          // Accidental withering is only rolled on care days 1–29.
          const died = state.careDays<30 && this.rng()<DEATH_PROBABILITY;
          if (died) {
            const h=historyOf(state,state.currentPlant);
            h.deaths+=1;
            setHistory(state,state.currentPlant,h);
            state.stats.deaths+=1;
            state.cleanBloomStreak=0;
            const deadId=state.currentPlant;
            ctx.justDied=deadId;
            events.push(`今日再去查看时，枝叶已经失了精神，根部不知何时染了病害。你试着挽救，却终究回天乏术。\n\n这株${p.shortName}没能熬过去。\n\n庭中空出了一处地方。\n\n培育中止。`);
            state.currentPlant=undefined;
            state.currentPlantStartedAt=undefined;
            state.careDays=0;
          } else if (state.careDays===30) {
            const id=state.currentPlant;
            if (!state.completedPlants.includes(id)) state.completedPlants.push(id);
            const h=historyOf(state,id);
            h.completed=true;
            h.completedAt=today;
            setHistory(state,id,h);
            state.stats.completedPlants=state.completedPlants.length;
            state.lastBloomEventPlant=id;
            state.lastBloomEventDate=today;
            state.cleanBloomStreak+=1;
            ctx.justCompleted=id;
            events.push(`${PLANTS[id].bloomText}\n\n图鉴解锁——${PLANTS[id].displayName}。`);
          }
        }
      } else {
        text="未识别的园艺指令。";
      }

      const newAchievements=achievementSweep(state,ctx,today,sameDayAdmireCount);
      return [state,{ok:true,text,events,newAchievements,state}];
    });
  }

  private statusText(state:GardenState):string {
    if (!state.currentPlant) return state.completedPlants.length?"当前没有正在培育的植物。你可以从已开放的品种中选择下一株。":"庭中暂时空着。";
    const p=PLANTS[state.currentPlant];
    if (state.careDays>=30) return `${p.displayName}已经栽成，正值可赏。你也可以开始培育下一品种。`;
    const stage=stageFor(state.careDays);
    const label=stage==="sprout"?"初植 / 萌动":stage==="leaf"?"抽枝展叶":"孕蕾";
    const cared=state.todayCareDate?`今日${state.todayCareAction==="water"?"已浇水":state.todayCareAction==="loosen"?"已松土":"已修剪"}`:"今日尚未照料";
    return `${p.displayName}\n${label}\n已完成 ${state.careDays} 个有效照料日 / 30\n${cared}`;
  }

  private collectionText(state:GardenState):string {
    return ["群芳谱",...PLANT_ORDER.map((id,i)=>state.completedPlants.includes(id)?`${i+1}. ${PLANTS[id].displayName}——${PLANTS[id].collectionText}`:`${i+1}. ？？？`)].join("\n");
  }

  private achievementText(state:GardenState):string {
    const unlocked=ACHIEVEMENTS.filter(a=>state.unlockedAchievements.includes(a.id));
    if (!unlocked.length) return "尚未解锁任何成就。";
    return ["已解锁成就",...unlocked.map(a=>`· ${a.name}——${a.description}`)].join("\n");
  }

  private plantsText(state:GardenState):string {
    if (!state.completedPlants.includes("peony_weizi")) return "当前仅可培育：牡丹 · 魏紫。";
    return ["可选培育品种",...PLANT_ORDER.map(id=>`· ${PLANTS[id].displayName}${state.completedPlants.includes(id)?"（已收录）":""}`)].join("\n");
  }
}
