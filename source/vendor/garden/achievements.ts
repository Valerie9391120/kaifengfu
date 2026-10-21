import { PLANTS } from "./garden-data.js";
import type { GardenState, PlantId } from "./types.js";

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  check: (state: GardenState, ctx?: { justCompleted?: PlantId; justAdmired?: PlantId; justDied?: PlantId; replanted?: PlantId; startedPlant?: PlantId; today?: string }) => boolean;
}

const familiesAdmired = (state: GardenState) => {
  const families = new Set<string>();
  for (const [id, history] of Object.entries(state.plantHistory) as [PlantId, NonNullable<GardenState["plantHistory"][PlantId]>][]) {
    if ((history?.admireCount ?? 0) > 0) families.add(PLANTS[id].familyKey);
  }
  return families;
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id:"garden_first_bloom", name:"庭芳初发", description:"完成魏紫培育。", check:s=>s.completedPlants.includes("peony_weizi") },
  { id:"burial_song", name:"葬花吟", description:"首次触发“意外凋谢”。", check:s=>s.stats.deaths>=1 },
  { id:"first_admire", name:"怜花惜弱", description:"首次赏花。", check:s=>s.stats.admire>=1 },
  { id:"water_10", name:"倾忱以报", description:"累计浇水 10 次。", check:s=>s.stats.water>=10 },
  { id:"loosen_10", name:"松松土，松松筋骨", description:"累计松土 10 次。", check:s=>s.stats.loosen>=10 },
  { id:"prune_10", name:"剪春裁碧", description:"累计修剪 10 次。", check:s=>s.stats.prune>=10 },
  { id:"streak_7", name:"朝朝相见", description:"连续 7 天完成一次照料。", check:s=>s.stats.bestCareStreak>=7 },
  { id:"streak_30", name:"月满花前", description:"连续 30 天完成一次照料。", check:s=>s.stats.bestCareStreak>=30 },
  { id:"admire_same_3", name:"三顾频烦天下计", description:"同一天内赏同一株花 3 次。", check:()=>false },
  { id:"admire_same_10", name:"看花不厌", description:"同一天内赏同一株花 10 次。", check:()=>false },
  { id:"admire_50", name:"撷芳忘归", description:"累计赏花 50 次。", check:s=>s.stats.admire>=50 },
  { id:"admire_100", name:"百看犹新", description:"累计赏花 100 次。", check:s=>s.stats.admire>=100 },
  { id:"second_species", name:"花信初成", description:"成功培育除魏紫之外的第一个新品种。", check:s=>s.completedPlants.some(id=>id!=="peony_weizi") },
  { id:"two_peonies", name:"国色天香", description:"同时解锁魏紫与玉楼春。", check:s=>s.completedPlants.includes("peony_weizi")&&s.completedPlants.includes("peony_yulouchun") },
  { id:"three_species", name:"三花聚顶", description:"累计成功培育 3 个品种。", check:s=>s.completedPlants.length>=3 },
  { id:"six_species", name:"小有花木", description:"累计成功培育 6 个品种。", check:s=>s.completedPlants.length>=6 },
  { id:"all_species", name:"群芳毕集", description:"解锁《群芳谱》全部 12 个品种。", check:s=>s.completedPlants.length>=12 },
  { id:"water_loosen_20", name:"水土相宜", description:"浇水与松土分别累计达到 20 次。", check:s=>s.stats.water>=20&&s.stats.loosen>=20 },
  { id:"all_care_20", name:"枝叶有度", description:"浇水、松土、修剪三种照料均累计达到 20 次。", check:s=>s.stats.water>=20&&s.stats.loosen>=20&&s.stats.prune>=20 },
  { id:"three_clean_blooms", name:"花开有信", description:"连续成功培育 3 株植物，中途未触发意外凋谢。", check:()=>false },
  { id:"admire_bloom_day", name:"惜取眼前", description:"在一株植物开花后的当天赏花。", check:(s,ctx)=>Boolean(ctx?.justAdmired && s.lastBloomEventPlant===ctx.justAdmired && s.lastBloomEventDate===ctx.today) },
  { id:"replant_after_death", name:"旧地重栽", description:"某一品种意外凋谢后，再次选择培育同一品种。", check:(_s,ctx)=>Boolean(ctx?.replanted) },
  { id:"bloom_after_death", name:"春风又度", description:"曾经意外凋谢的品种重新培育成功。", check:(s,ctx)=>Boolean(ctx?.justCompleted && (s.plantHistory[ctx.justCompleted]?.deaths ?? 0)>0) },
  { id:"keep_going_after_2_deaths", name:"未肯轻弃", description:"累计经历 2 次意外凋谢后，仍再次开始新的培育。", check:(s,ctx)=>s.stats.deaths>=2&&Boolean(ctx?.startedPlant) },
  { id:"admire_all_12", name:"十二花事", description:"十二种植物均至少赏花一次。", check:s=>Object.values(s.plantHistory).filter(Boolean).every(()=>true) && Object.values(PLANTS).every(p=>(s.plantHistory[p.id]?.admireCount??0)>0) },
  { id:"admire_all_families", name:"各有其芳", description:"分别赏过牡丹、梅、海棠、兰、杜鹃、茶花、桂、月季、水仙、菊、木槿。", check:s=>familiesAdmired(s).size>=11 },
  { id:"care_100", name:"手熟花知", description:"累计完成 100 次照料。", check:s=>s.stats.totalCare>=100 },
  { id:"garden_180", name:"庭前岁久", description:"从第一次进入园艺系统起满 180 天。", check:()=>false },
  { id:"garden_365", name:"花木为伴", description:"从第一次进入园艺系统起满 365 天。", check:()=>false },
  { id:"full_garden", name:"满庭芳", description:"《群芳谱》全部点亮，并累计赏花 100 次。", check:s=>s.completedPlants.length>=12&&s.stats.admire>=100 }
];
