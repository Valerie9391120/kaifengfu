import { ACHIEVEMENTS } from "./achievements.js";
import { BASE_IDS, CATEGORY_LABELS, DEFAULT_APPEARANCE, ITEMS, itemAvailable, itemName } from "./dressing-data.js";
import { rewardUnlocks } from "./rewards.js";
import type { AchievementUnlock, Appearance, Category, DressingClock, DressingCommand, DressingResult, DressingState, DressingStore, MultiCategory, SingleCategory } from "./types.js";

const DEFAULT_STATE:DressingState={
  version:1,
  initialized:false,
  appearance:{...DEFAULT_APPEARANCE,outfits:[],bottoms:[],shoes:[],accessories:[]},
  touched:{hair:false,makeup:false,scent:false,outfit:false,bottom:false,shoes:false,accessory:false},
  unlockedAchievements:[],
  unlockedRewards:[],
  stats:{
    mirrorCount:0,
    completeCount:0,
    // “尝试过几种”只算完成过的搭配里出现过的：一开始的披发、素面、不熏香也要穿着完成一回才算
    usedHair:[],
    usedMakeup:[],
    usedScent:[],
    usedOutfits:[],usedBottoms:[],usedShoes:[],usedAccessories:[],
    nakedCompleteStreak:0,noBarefootCompleteStreak:0
  },
  dailyFinalLooks:[]
};

function cloneDefault():DressingState { return structuredClone(DEFAULT_STATE); }
// 0.1.x 的存档里没有这几个数（那时候数的是照镜）：补上 0，不然加上去成了 NaN
function normalize(state:DressingState){
  const s=state.stats;
  s.completeCount??=0;
  s.nakedCompleteStreak??=0;
  s.noBarefootCompleteStreak??=0;
}
function pushUnique(arr:string[],id:string){ if(!arr.includes(id)) arr.push(id); }
function arrFor(a:Appearance,c:MultiCategory):string[] {
  if(c==="outfit") return a.outfits;
  if(c==="bottom") return a.bottoms;
  if(c==="shoes") return a.shoes;
  return a.accessories;
}
function singleDefault(c:SingleCategory):string {
  return c==="hair"?DEFAULT_APPEARANCE.hair:c==="makeup"?DEFAULT_APPEARANCE.makeup:DEFAULT_APPEARANCE.scent;
}
/** 今天完成过搭配没有（一天只能完成一次） */
export function completedToday(state:DressingState|null|undefined,today:string):boolean {
  return Boolean(state&&state.completedLook&&state.completedLook.date===today);
}

function signature(a:Appearance):string {
  return JSON.stringify({
    hair:a.hair,makeup:a.makeup,scent:a.scent,
    outfits:[...a.outfits].sort(),bottoms:[...a.bottoms].sort(),shoes:[...a.shoes].sort(),accessories:[...a.accessories].sort()
  });
}

export class DressingEngine {
  constructor(private store:DressingStore,private clock:DressingClock){}

  async execute(cmd:DressingCommand):Promise<DressingResult>{
    return this.store.update(async loaded=>{
      const state=loaded?structuredClone(loaded):cloneDefault();
      normalize(state);
      const today=this.clock.today();
      let text="";
      const ctx:{justCompleted?:boolean;justMirrored?:boolean;selectedItemId?:string;selectedCategory?:string;today:string}={today};

      if(!state.initialized){
        state.initialized=true;
        state.firstOpenedDate=today;
      }
      this.ensureCurrentDay(state,today);

      switch(cmd.action){
        case "open":
          text=loaded?this.statusText(state,today):this.introText();
          break;
        case "status":
          text=this.statusText(state,today);
          break;
        case "catalog":
          text=this.catalogText(state,cmd.category&&cmd.category!=="all"?cmd.category:undefined);
          break;
        case "select":
          text=this.selectItem(state,cmd.category,cmd.itemId,ctx);
          break;
        case "remove":
          text=this.removeItem(state,cmd.itemId);
          break;
        case "clear":
          text=this.clearCategory(state,cmd.category??"all");
          break;
        case "complete":
          if(completedToday(state,today)){
            text="今天已经完成过一次搭配了，明天再来。妆台前照样可以换着玩，只是今天不再算数。";
            break;
          }
          this.completeLook(state,today);
          ctx.justCompleted=true;
          text=this.lookText(state.appearance,"今天的搭配完成了");
          break;
        case "mirror":
          this.recordMirror(state,today);
          ctx.justMirrored=true;
          text=completedToday(state,today)?this.lookText(state.completedLook!.appearance,"镜中今日"):"镜子里是一只裸狐。\n\n今天还没有完成搭配。";
          break;
        case "achievements":
          text=this.achievementText(state);
          break;
        case "rewards":
          text=this.rewardText(state);
          break;
        default:
          text="未识别的梳妆指令。";
      }

      // 成就只在完成搭配的时候判（按完成的那一身）；照镜子的时候只判照镜子那几个。换着玩的时候一个都不判
      const newAchievements=ctx.justCompleted?this.achievementSweep(state,ctx,"complete"):ctx.justMirrored?this.achievementSweep(state,ctx,"mirror"):[];
      const newRewards=rewardUnlocks(state.unlockedAchievements.length,state.unlockedRewards);
      for(const r of newRewards) state.unlockedRewards.push(r.id);

      return [state,{ok:true,text,newAchievements,newRewards,state}];
    });
  }

  private ensureCurrentDay(state:DressingState,today:string){
    if(!state.currentDay||state.currentDay.date!==today) state.currentDay={date:today,mirrorCount:0};
  }

  private selectItem(state:DressingState,category:Category|"all"|undefined,itemId:string|undefined,ctx:{selectedItemId?:string;selectedCategory?:string}):string{
    if(!category||category==="all"||!itemId) return "请选择要调整的类别与单品。";
    const item=ITEMS[itemId];
    if(!item||item.category!==category) return "没有找到这个单品，或它不属于所选类别。";
    if(!itemAvailable(itemId,state.unlockedRewards)) return "这件东西还没有解锁。";
    ctx.selectedItemId=itemId;ctx.selectedCategory=category;
    state.touched[category]=true;

    if(category==="hair"||category==="makeup"||category==="scent"){
      state.appearance[category]=itemId;
      return `${CATEGORY_LABELS[category]}已改为：${item.name}。`;
    }

    const arr=arrFor(state.appearance,category);
    if(arr.includes(itemId)) return `${item.name}已经在当前搭配里。`;
    arr.push(itemId);
    return `已加入当前${CATEGORY_LABELS[category]}：${item.name}。`;
  }

  private removeItem(state:DressingState,itemId:string|undefined):string{
    if(!itemId||!ITEMS[itemId]) return "请选择要取下的单品。";
    const item=ITEMS[itemId];
    const c=item.category;
    if(c==="hair"||c==="makeup"||c==="scent"){
      if(state.appearance[c]!==itemId) return `${item.name}目前并不是当前${CATEGORY_LABELS[c]}。`;
      const def=singleDefault(c);
      state.appearance[c]=def;
      state.touched[c]=false;
      return `${CATEGORY_LABELS[c]}已恢复为：${itemName(def)}。`;
    }
    const arr=arrFor(state.appearance,c);
    const i=arr.indexOf(itemId);
    if(i<0) return `${item.name}目前并不在身上。`;
    arr.splice(i,1);
    return `已取下：${item.name}。`;
  }

  private clearCategory(state:DressingState,category:Category|"all"):string{
    const resetSingle=(c:SingleCategory)=>{state.appearance[c]=singleDefault(c);state.touched[c]=false;};
    const resetMulti=(c:MultiCategory)=>{arrFor(state.appearance,c).splice(0);state.touched[c]=false;};
    if(category==="all"){
      resetSingle("hair");resetSingle("makeup");resetSingle("scent");
      resetMulti("outfit");resetMulti("bottom");resetMulti("shoes");resetMulti("accessory");
      return "已经把当前造型重新收拾干净。";
    }
    if(category==="hair"||category==="makeup"||category==="scent") resetSingle(category); else resetMulti(category);
    return `已清空当前${CATEGORY_LABELS[category]}选择。`;
  }

  // 完成搭配：这一身就是今天的造型（镜子里照得出的就是它）；“试过几种”、几个连着的都从这一身算
  private completeLook(state:DressingState,today:string){
    const a=state.appearance;
    state.completedLook={date:today,appearance:structuredClone(a)};
    state.stats.completeCount+=1;
    pushUnique(state.stats.usedHair,a.hair);
    pushUnique(state.stats.usedMakeup,a.makeup);
    pushUnique(state.stats.usedScent,a.scent);
    for(const id of a.outfits) pushUnique(state.stats.usedOutfits,id);
    for(const id of a.bottoms) pushUnique(state.stats.usedBottoms,id);
    for(const id of a.shoes) pushUnique(state.stats.usedShoes,id);
    for(const id of a.accessories) pushUnique(state.stats.usedAccessories,id);

    if(a.outfits.includes("outfit_none")) state.stats.nakedCompleteStreak+=1;
    else state.stats.nakedCompleteStreak=0;

    if(a.shoes.includes("shoes_barefoot")) state.stats.noBarefootCompleteStreak=0;
    else state.stats.noBarefootCompleteStreak+=1;

    const sig=signature(a);
    const existing=state.dailyFinalLooks.find(x=>x.date===today);
    if(existing) existing.signature=sig;
    else state.dailyFinalLooks.push({date:today,signature:sig});
    state.dailyFinalLooks.sort((x,y)=>x.date.localeCompare(y.date));
    if(state.dailyFinalLooks.length>14) state.dailyFinalLooks=state.dailyFinalLooks.slice(-14);
  }

  // 照镜子：不限次数，只记照了几回（照到裸狐也算）
  private recordMirror(state:DressingState,today:string){
    this.ensureCurrentDay(state,today);
    state.stats.mirrorCount+=1;
    state.currentDay!.mirrorCount+=1;
  }

  private achievementSweep(state:DressingState,ctx:{justCompleted?:boolean;justMirrored?:boolean;selectedItemId?:string;selectedCategory?:string;today:string},phase:"complete"|"mirror"):AchievementUnlock[]{
    const out:AchievementUnlock[]=[];
    for(const a of ACHIEVEMENTS){
      if(state.unlockedAchievements.includes(a.id)) continue;
      if((a.when??"complete")!==phase) continue;
      if(a.check(state,ctx)){
        state.unlockedAchievements.push(a.id);
        out.push({id:a.id,name:a.name,description:a.description});
      }
    }
    return out;
  }

  private introText():string{
    return `衣柜、妆台和配饰已经准备好了。\n\n你可以自由更换发型、妆面和香气，也可以随意选择衣服、下装、鞋履和配饰。不同单品之间没有搭配限制，可以自由叠穿、混搭，也可以什么都不穿。\n\n换好之后，可以完成搭配：每天只能完成一次，成就只在完成搭配的时候判定。镜子不限次数，只照得出今天完成的那一套；今天还没完成的话，镜子里是一只裸狐。部分搭配、使用习惯和累计次数会触发隐藏成就；累计解锁一定数量的成就后，还会获得额外的衣物和配饰奖励。`;
  }

  private statusText(state:DressingState,today:string):string{
    return this.lookText(state.appearance,"妆台前眼下的搭配")+`\n\n${completedToday(state,today)?"今天已经完成过搭配了。":"今天还没有完成搭配。"}`;
  }

  private lookText(a:Appearance,heading:string):string{
    const fmt=(ids:string[])=>ids.length?ids.map(itemName).join("、"):"无";
    const lines=[
      heading,
      `梳发：${itemName(a.hair)}`,
      `妆面：${itemName(a.makeup)}`,
      `熏香：${itemName(a.scent)}`,
      `衣柜：${fmt(a.outfits)}`,
      `下装：${fmt(a.bottoms)}`,
      `鞋履：${fmt(a.shoes)}`,
      `配饰：${fmt(a.accessories)}`
    ];
    return lines.join("\n");
  }

  private catalogText(state:DressingState,category?:Category):string{
    const validCategories:Category[]=["hair","makeup","scent","outfit","bottom","shoes","accessory"];
    if(category&&!validCategories.includes(category)) return "没有这个类别。可用类别：hair / makeup / scent / outfit / bottom / shoes / accessory。";
    const categories:Category[]=category?[category]:validCategories;
    const out:string[]=[];
    for(const c of categories){
      out.push(CATEGORY_LABELS[c]);
      for(const item of Object.values(ITEMS).filter(x=>x.category===c&&(x.base||state.unlockedRewards.includes(x.id)))){
        const selected=c==="hair"||c==="makeup"||c==="scent"
          ? state.appearance[c]===item.id
          : arrFor(state.appearance,c).includes(item.id);
        out.push(`${selected?"✓":"·"} ${item.name} [${item.id}]`);
      }
      out.push("");
    }
    return out.join("\n").trim();
  }

  private achievementText(state:DressingState):string{
    const unlocked=ACHIEVEMENTS.filter(a=>state.unlockedAchievements.includes(a.id));
    const lines=[`已解锁成就 ${unlocked.length} / ${ACHIEVEMENTS.length}`];
    if(!unlocked.length) lines.push("尚未解锁任何成就。");
    else for(const a of unlocked) lines.push(`· ${a.name}——${a.description}`);
    lines.push(`其余 ${ACHIEVEMENTS.length-unlocked.length} 个成就尚未点亮。`);
    return lines.join("\n");
  }

  private rewardText(state:DressingState):string{
    const count=state.unlockedAchievements.length;
    const lines=[`累计成就：${count} / ${ACHIEVEMENTS.length}`];
    if(!state.unlockedRewards.length) lines.push("尚未获得累计成就奖励。");
    else {
      lines.push("已获得奖励：");
      for(const id of state.unlockedRewards){ const x=ITEMS[id]; lines.push(`· ${x.name}——${x.description??""}`); }
    }
    const milestones=[3,5,8,12,16,20,24,28,32,36,40,50];
    const next=milestones.find(x=>x>count);
    if(next) lines.push(`下一份累计奖励：解锁 ${next} 个成就后获得（内容保密）。`);
    else lines.push("累计成就奖励已全部获得。 ");
    return lines.join("\n");
  }
}
