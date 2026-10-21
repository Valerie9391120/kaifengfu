import { BASE_IDS, BOLD_OUTFIT_IDS, HEAD_FACE_ACCESSORY_IDS, ITEMS, MODERN_BOTTOM_IDS, MODERN_SHOES_IDS } from "./dressing-data.js";
import { dayDiff } from "./date-utils.js";
import type { DressingState } from "./types.js";

export interface AchievementContext {
  /** 这一下是完成搭配（成就基本都只在这时判，按完成的那一身算） */
  justCompleted?: boolean;
  /** 这一下是照镜子（只判 when 为 "mirror" 的那几个） */
  justMirrored?: boolean;
  selectedItemId?: string;
  selectedCategory?: string;
  today?: string;
}

export interface AchievementDefinition {
  id:string;
  name:string;
  description:string;
  /** 什么时候判：不写是完成搭配的时候；"mirror" 是照镜子的时候 */
  when?:"mirror";
  check:(state:DressingState,ctx:AchievementContext)=>boolean;
}

const every=(need:string[],have:string[])=>need.every(x=>have.includes(x));
const usedBaseCount=(used:string[],category:keyof typeof BASE_IDS)=>used.filter(x=>BASE_IDS[category].includes(x)).length;
const allBaseUsed=(used:string[],category:keyof typeof BASE_IDS)=>BASE_IDS[category].every(x=>used.includes(x));
const currentIds=(s:DressingState)=>[
  s.appearance.hair,s.appearance.makeup,s.appearance.scent,
  ...s.appearance.outfits,...s.appearance.bottoms,...s.appearance.shoes,...s.appearance.accessories
];

const styleSources=(s:DressingState)=>{
  const allowed=new Set(["ancient","modern","uniform","fantasy","ceremonial","sleepwear","bold","martial","casual","costume"]);
  const out=new Set<string>();
  for (const id of currentIds(s)) for (const tag of ITEMS[id]?.sourceTags??[]) if (allowed.has(tag)) out.add(tag);
  return out;
};

const hasAncient=(s:DressingState)=>currentIds(s).some(id=>ITEMS[id]?.sourceTags?.includes("ancient"));
const hasModern=(s:DressingState)=>currentIds(s).some(id=>ITEMS[id]?.sourceTags?.includes("modern"));
const hasFormalOutfit=(s:DressingState)=>s.appearance.outfits.some(id=>ITEMS[id]?.formal);
const hasAncientFormalOutfit=(s:DressingState)=>s.appearance.outfits.some(id=>ITEMS[id]?.ancientFormal);

// 最近 n 天（连着的 n 天）完成的造型各不相同
function differentDays(state:DressingState,n:number):boolean {
  if (state.dailyFinalLooks.length<n) return false;
  const last=state.dailyFinalLooks.slice(-n);
  for (let i=1;i<last.length;i++) if (dayDiff(last[i-1]!.date,last[i]!.date)!==1) return false;
  return new Set(last.map(x=>x.signature)).size===n;
}

export const ACHIEVEMENTS:AchievementDefinition[]=[
  {id:"first_mirror",name:"初整衣冠",description:"第一次换装并完成搭配。",check:(s,c)=>Boolean(c.justCompleted)&&Object.values(s.touched).some(Boolean)},
  {id:"change_hair",name:"改头换面",description:"第一次更换与初始不同的发型。",check:s=>s.appearance.hair!=="hair_loose"},
  {id:"hair_3",name:"千丝万缕",description:"尝试 3 种不同发型。",check:s=>usedBaseCount(s.stats.usedHair,"hair")>=3},
  {id:"hair_all",name:"理发店VIP",description:"尝试全部 10 种发型。",check:s=>allBaseUsed(s.stats.usedHair,"hair")},
  {id:"makeup_first",name:"铅华淡淡妆成",description:"第一次使用淡妆或全妆。",check:s=>s.stats.usedMakeup.includes("makeup_light")||s.stats.usedMakeup.includes("makeup_full")},
  {id:"makeup_all",name:"浓淡相宜，国色芳华",description:"素面、淡妆、全妆三种妆面均使用过。",check:s=>allBaseUsed(s.stats.usedMakeup,"makeup")},
  {id:"scent_first",name:"暗香来",description:"第一次使用任意熏香。",check:s=>s.stats.usedScent.some(id=>id!=="scent_none")},
  {id:"scent_3",name:"夜幽昙",description:"尝试 3 种不同香气。",check:s=>s.stats.usedScent.filter(id=>id!=="scent_none"&&BASE_IDS.scent.includes(id)).length>=3},
  {id:"scent_5",name:"熟谙天香",description:"尝试 5 种不同香气。",check:s=>s.stats.usedScent.filter(id=>id!=="scent_none"&&BASE_IDS.scent.includes(id)).length>=5},
  {id:"scent_10",name:"名花信芳",description:"尝试 10 种不同香气。",check:s=>s.stats.usedScent.filter(id=>id!=="scent_none"&&BASE_IDS.scent.includes(id)).length>=10},
  {id:"scent_all",name:"闻香识美男",description:"除“不熏香”外，所有香气都至少使用过一次。",check:s=>BASE_IDS.scent.filter(id=>id!=="scent_none").every(id=>s.stats.usedScent.includes(id))},
  {id:"outfit_5",name:"衣不重样",description:"尝试 5 种不同衣柜造型。",check:s=>usedBaseCount(s.stats.usedOutfits,"outfit")>=5},
  {id:"outfit_10",name:"百变狐狐",description:"尝试 10 种不同衣柜造型。",check:s=>usedBaseCount(s.stats.usedOutfits,"outfit")>=10},
  {id:"ancient_modern",name:"古今一炉",description:"同一套搭配里同时出现古代风格与现代风格单品。",check:s=>hasAncient(s)&&hasModern(s)},
  {id:"outfit_stack_3",name:"叠床架屋",description:"同时选择 3 件以上衣柜造型。",check:s=>s.appearance.outfits.length>=3},
  {id:"accessory_5",name:"衣冠楚楚",description:"同时佩戴 5 件以上配饰。",check:s=>s.appearance.accessories.length>=5},
  {id:"accessory_10",name:"珠围翠绕",description:"同时佩戴 10 件以上配饰。",check:s=>s.appearance.accessories.length>=10},
  {id:"all_base_accessories",name:"行走的杂货铺",description:"一次性把 v1 基础配饰全部戴上。",check:s=>every(BASE_IDS.accessory,s.appearance.accessories)},
  {id:"mirror_10_day",name:"照花前后镜",description:"同一天照镜 3 次。",when:"mirror",check:s=>(s.currentDay?.mirrorCount??0)>=3},
  {id:"five_looks_day",name:"时尚先锋",description:"连续 3 天最终造型都不完全相同。",check:s=>differentDays(s,3)},
  {id:"seven_days_new",name:"日日新",description:"连续 7 天最终造型都不完全相同。",check:s=>differentDays(s,7)},
  {id:"first_naked",name:"坦荡荡",description:"第一次选择衣柜“不穿”。",check:s=>s.appearance.outfits.includes("outfit_none")},
  {id:"naked_3",name:"袒裼裸裎",description:"连续 3 次以“不穿”状态完成搭配。",check:s=>s.stats.nakedCompleteStreak>=3},
  {id:"bold_first",name:"狐狐的诱惑",description:"第一次穿上明显大胆的衣着。",check:s=>s.appearance.outfits.some(id=>BOLD_OUTFIT_IDS.has(id))},
  {id:"bold_bottom_mix",name:"创新驱动发展",description:"同时满足“大胆衣着”与泳裤、超短裙或不穿下装中的任意一种。",check:s=>s.appearance.outfits.some(id=>BOLD_OUTFIT_IDS.has(id))&&s.appearance.bottoms.some(id=>["bottom_swim","bottom_mini_skirt","bottom_none"].includes(id))},
  {id:"formal_barefoot",name:"跣足而游",description:"正式或礼服类造型搭配跣足。",check:s=>hasFormalOutfit(s)&&s.appearance.shoes.includes("shoes_barefoot")},
  {id:"prince_capital",name:"亲王尹京",description:"穿上黑领金带紫公服。",check:s=>s.appearance.outfits.includes("outfit_purple_official")},
  {id:"chuigong",name:"垂拱",description:"穿上金领红带白公服。",check:s=>s.appearance.outfits.includes("outfit_white_official")},
  {id:"middle_earth",name:"中土的呼唤",description:"中土精灵额冠与白纱金线祭祀长袍同时出现。",check:s=>s.appearance.accessories.includes("acc_elven_circlet")&&s.appearance.outfits.includes("outfit_ritual_white_gold")},
  {id:"night_banquet",name:"夜宴",description:"black tie 与白金袖扣同时出现。",check:s=>s.appearance.outfits.includes("outfit_black_tie")&&s.appearance.accessories.includes("acc_platinum_cufflinks")},
  {id:"young_wanderer",name:"游侠儿",description:"穿上浅青圆领袍。",check:s=>s.appearance.outfits.includes("outfit_lightblue_roundrobe")},
  {id:"imperial_street",name:"御街行",description:"穿上蓝紫轻甲窄袖劲装。",check:s=>s.appearance.outfits.includes("outfit_light_armor")},
  {id:"cultured_scoundrel",name:"斯文败类",description:"戴上金丝眼镜。",check:s=>s.appearance.accessories.includes("acc_gold_wire_glasses")},
  {id:"hot_fox",name:"纯情狐狐火辣辣",description:"穿上高开叉旗袍。",check:s=>s.appearance.outfits.includes("outfit_qipao")},
  {id:"forgive_me_father",name:"forgive me father for I have sinned",description:"穿上神父装。",check:s=>s.appearance.outfits.includes("outfit_priest")},
  {id:"mix_genius",name:"混搭天才",description:"古代正式服饰搭配明显现代下装或现代鞋履。",check:s=>hasAncientFormalOutfit(s)&&(s.appearance.bottoms.some(id=>MODERN_BOTTOM_IDS.has(id))||s.appearance.shoes.some(id=>MODERN_SHOES_IDS.has(id)))},
  {id:"back_to_nature",name:"返璞归真",description:"素面、不熏香且不佩戴任何配饰。",check:(s,c)=>Boolean(c.justCompleted)&&s.appearance.makeup==="makeup_bare"&&s.appearance.scent==="scent_none"&&s.appearance.accessories.length===0},
  {id:"head_construction",name:"头顶违章建筑",description:"同时佩戴 3 件以上头面部配饰。",check:s=>s.appearance.accessories.filter(id=>HEAD_FACE_ACCESSORY_IDS.has(id)).length>=3},
  {id:"borrow_everywhere",name:"博采众长",description:"同一套搭配里同时出现 3 种以上不同风格来源。",check:s=>styleSources(s).size>=3},
  {id:"full_firepower",name:"火力全开",description:"全妆、正式衣着，并使用龙涎或沉香。",check:s=>s.appearance.makeup==="makeup_full"&&hasFormalOutfit(s)&&["scent_ambergris","scent_agarwood"].includes(s.appearance.scent)},
  {id:"among_flowers",name:"花间客",description:"淡妆、簪花与折扇同时出现。",check:s=>s.appearance.makeup==="makeup_light"&&every(["acc_flower_hairpin","acc_folding_fan"],s.appearance.accessories)},
  {id:"pale_to_vivid",name:"淡极生艳",description:"素白寝衣与披发同时出现。",check:s=>s.appearance.outfits.includes("outfit_white_sleep")&&s.appearance.hair==="hair_loose"},
  {id:"most_indecent_menswear",name:"男人最淫荡的衣服",description:"穿上高领黑毛衣。",check:s=>s.appearance.outfits.includes("outfit_black_turtleneck")},
  {id:"shoes_5",name:"足下生风",description:"尝试 5 种不同鞋履。",check:s=>usedBaseCount(s.stats.usedShoes,"shoes")>=5},
  {id:"shoes_all",name:"履迹纷纷",description:"尝试全部基础鞋履。",check:s=>allBaseUsed(s.stats.usedShoes,"shoes")},
  {id:"bottom_5",name:"下装自由",description:"尝试 5 种不同下装。",check:s=>usedBaseCount(s.stats.usedBottoms,"bottom")>=5},
  {id:"bottom_all",name:"裤子也是衣服",description:"尝试全部基础下装。",check:s=>allBaseUsed(s.stats.usedBottoms,"bottom")},
  {id:"bottom_stack_2",name:"层层叠叠",description:"同一次搭配里选择 2 件以上下装。",check:s=>s.appearance.bottoms.length>=2},
  {id:"grounded_7",name:"脚踏实地",description:"连续 7 次完成搭配都没有选择跣足。",check:s=>s.stats.noBarefootCompleteStreak>=7},
  {id:"head_to_toe",name:"从头到脚",description:"同一次造型中完成发型、妆面、熏香、衣柜、下装、鞋履的选择，并至少佩戴 1 件配饰。",check:(s,c)=>Boolean(c.justCompleted)&&s.touched.hair&&s.touched.makeup&&s.touched.scent&&s.appearance.outfits.length>0&&s.appearance.bottoms.length>0&&s.appearance.shoes.length>0&&s.appearance.accessories.length>0}
];

if (ACHIEVEMENTS.length!==50) throw new Error(`Expected 50 achievements, got ${ACHIEVEMENTS.length}`);
