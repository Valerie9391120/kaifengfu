import type { Category, StyleItem } from "./types.js";

const I=(item:Omit<StyleItem,"base">&{base?:boolean}):StyleItem=>({base:true,...item});

export const DEFAULT_APPEARANCE = {
  hair: "hair_loose",
  makeup: "makeup_bare",
  scent: "scent_none",
  outfits: [] as string[],
  bottoms: [] as string[],
  shoes: [] as string[],
  accessories: [] as string[]
};

export const ITEMS: Record<string,StyleItem> = Object.fromEntries(([
  // 梳发
  I({id:"hair_loose",name:"披发",category:"hair"}),
  I({id:"hair_crowned",name:"束发戴冠",category:"hair"}),
  I({id:"hair_twintails",name:"双马尾",category:"hair"}),
  I({id:"hair_side_ponytail",name:"侧马尾",category:"hair"}),
  I({id:"hair_curls",name:"卷发",category:"hair"}),
  I({id:"hair_short",name:"短发",category:"hair"}),
  I({id:"hair_low_ponytail",name:"低马尾",category:"hair"}),
  I({id:"hair_high_ponytail",name:"高马尾",category:"hair"}),
  I({id:"hair_braided",name:"编发",category:"hair"}),
  I({id:"hair_wet",name:"湿发",category:"hair"}),

  // 妆面
  I({id:"makeup_bare",name:"素面",category:"makeup"}),
  I({id:"makeup_light",name:"淡妆－描眉、涂口脂",category:"makeup"}),
  I({id:"makeup_full",name:"全妆－玉龙膏涂面、描眉、勾眼线、涂口脂",category:"makeup"}),

  // 熏香
  I({id:"scent_plum",name:"梅香",category:"scent"}),
  I({id:"scent_agarwood",name:"沉香",category:"scent"}),
  I({id:"scent_sandalwood",name:"檀香",category:"scent"}),
  I({id:"scent_fruit",name:"果香",category:"scent"}),
  I({id:"scent_ambergris",name:"龙涎",category:"scent"}),
  I({id:"scent_grass",name:"青草",category:"scent"}),
  I({id:"scent_citrus",name:"柑橘",category:"scent"}),
  I({id:"scent_rose",name:"玫瑰",category:"scent"}),
  I({id:"scent_white_flower",name:"白花",category:"scent"}),
  I({id:"scent_leather",name:"皮革",category:"scent"}),
  I({id:"scent_iris",name:"鸢尾",category:"scent"}),
  I({id:"scent_vetiver",name:"香根草",category:"scent"}),
  I({id:"scent_lavender",name:"薰衣草",category:"scent"}),
  I({id:"scent_cedar",name:"雪松",category:"scent"}),
  I({id:"scent_tea",name:"茶香",category:"scent"}),
  I({id:"scent_soap",name:"皂感",category:"scent"}),
  I({id:"scent_musk",name:"麝香",category:"scent"}),
  I({id:"scent_none",name:"不熏香",category:"scent"}),

  // 衣柜：每一项都是一整套造型重点，可自由叠穿
  I({id:"outfit_purple_official",name:"黑领金带紫公服",category:"outfit",sourceTags:["ancient","formal"],formal:true,ancientFormal:true}),
  I({id:"outfit_white_official",name:"金领红带白公服",category:"outfit",sourceTags:["ancient","formal"],formal:true,ancientFormal:true}),
  I({id:"outfit_lightblue_roundrobe",name:"浅青圆领袍",category:"outfit",sourceTags:["ancient"]}),
  I({id:"outfit_beige_deep_robe",name:"米色交领对襟大袖深衣",category:"outfit",sourceTags:["ancient"]}),
  I({id:"outfit_hanjin",name:"汉晋款峨冠博带",category:"outfit",sourceTags:["ancient","formal"],formal:true,ancientFormal:true}),
  I({id:"outfit_tang_crimson",name:"绯色提花窄袖唐圆领",category:"outfit",sourceTags:["ancient","formal"],formal:true,ancientFormal:true}),
  I({id:"outfit_light_armor",name:"蓝紫轻甲窄袖劲装",category:"outfit",sourceTags:["ancient","martial"]}),
  I({id:"outfit_white_sleep",name:"素白寝衣",category:"outfit",sourceTags:["sleepwear"]}),
  I({id:"outfit_school_shirt",name:"校园白衬衫",category:"outfit",sourceTags:["modern","uniform"]}),
  I({id:"outfit_cream_knit",name:"奶油毛衣套装",category:"outfit",sourceTags:["modern","casual"]}),
  I({id:"outfit_biker",name:"机车夹克",category:"outfit",sourceTags:["modern","casual"]}),
  I({id:"outfit_military_cape",name:"黑色披风军装",category:"outfit",sourceTags:["modern","uniform","formal"],formal:true}),
  I({id:"outfit_long_coat",name:"冷感长风衣",category:"outfit",sourceTags:["modern","casual"]}),
  I({id:"outfit_black_turtleneck",name:"高领黑毛衣",category:"outfit",sourceTags:["modern","casual"]}),
  I({id:"outfit_black_tie",name:"black tie",category:"outfit",sourceTags:["modern","formal"],formal:true}),
  I({id:"outfit_bunny",name:"兔男郎",category:"outfit",sourceTags:["modern","bold"],bold:true}),
  I({id:"outfit_priest",name:"神父装",category:"outfit",sourceTags:["modern","uniform","formal"],formal:true}),
  I({id:"outfit_sailor",name:"水手服",category:"outfit",sourceTags:["modern","uniform"]}),
  I({id:"outfit_maid",name:"黑白男仆装",category:"outfit",sourceTags:["modern","uniform"]}),
  I({id:"outfit_ritual_white_gold",name:"白纱金线祭祀长袍",category:"outfit",sourceTags:["fantasy","ceremonial","formal"],formal:true}),
  I({id:"outfit_apron",name:"真空围裙",category:"outfit",sourceTags:["modern","bold"],bold:true}),
  I({id:"outfit_lace_cami",name:"蕾丝吊带",category:"outfit",sourceTags:["modern","bold"],bold:true}),
  I({id:"outfit_wedding",name:"抹胸款白婚纱",category:"outfit",sourceTags:["modern","formal"],formal:true}),
  I({id:"outfit_qipao",name:"高开叉旗袍",category:"outfit",sourceTags:["modern","bold","formal"],bold:true,formal:true}),
  I({id:"outfit_burgundy_sheer",name:"酒红透纱睡衣",category:"outfit",sourceTags:["sleepwear","bold"],bold:true}),
  I({id:"outfit_bathrobe",name:"白色浴袍",category:"outfit",sourceTags:["sleepwear"]}),
  I({id:"outfit_none",name:"不穿",category:"outfit",sourceTags:["minimal"]}),

  // 下装
  I({id:"bottom_lower_garment",name:"下裳",category:"bottom",sourceTags:["ancient"]}),
  I({id:"bottom_pleated_skirt",name:"褶裙",category:"bottom",sourceTags:["ancient"]}),
  I({id:"bottom_bound_trousers",name:"缚裤",category:"bottom",sourceTags:["ancient"]}),
  I({id:"bottom_straight_waist",name:"直腰裤",category:"bottom",sourceTags:["ancient"]}),
  I({id:"bottom_suit_trousers",name:"西裤",category:"bottom",sourceTags:["modern","formal"]}),
  I({id:"bottom_warm_wide",name:"暖色阔腿裤",category:"bottom",sourceTags:["modern","casual"]}),
  I({id:"bottom_dark_jeans",name:"深色牛仔裤",category:"bottom",sourceTags:["modern","casual"]}),
  I({id:"bottom_swim",name:"泳裤",category:"bottom",sourceTags:["modern","bold"]}),
  I({id:"bottom_mini_skirt",name:"超短裙",category:"bottom",sourceTags:["modern","bold"]}),
  I({id:"bottom_underwear_outer",name:"内裤外穿",category:"bottom",sourceTags:["modern","bold"]}),
  I({id:"bottom_none",name:"不穿",category:"bottom",sourceTags:["minimal"]}),

  // 鞋履
  I({id:"shoes_upturned_silk",name:"翘头丝履",category:"shoes",sourceTags:["ancient"]}),
  I({id:"shoes_black_leather_boots",name:"乌皮靴",category:"shoes",sourceTags:["ancient"]}),
  I({id:"shoes_black_brocade_boots",name:"玄色锦靴",category:"shoes",sourceTags:["ancient"]}),
  I({id:"shoes_xiegong_clogs",name:"谢公屐",category:"shoes",sourceTags:["ancient"]}),
  I({id:"shoes_riding_boots",name:"马靴",category:"shoes",sourceTags:["ancient","martial"]}),
  I({id:"shoes_oxford",name:"牛津鞋",category:"shoes",sourceTags:["modern","formal"]}),
  I({id:"shoes_chelsea",name:"切尔西靴",category:"shoes",sourceTags:["modern"]}),
  I({id:"shoes_martens",name:"马丁靴",category:"shoes",sourceTags:["modern"]}),
  I({id:"shoes_sneakers",name:"运动鞋",category:"shoes",sourceTags:["modern","casual"]}),
  I({id:"shoes_canvas",name:"帆布鞋",category:"shoes",sourceTags:["modern","casual"]}),
  I({id:"shoes_fluffy_slippers",name:"居家毛绒拖鞋",category:"shoes",sourceTags:["modern","casual"]}),
  I({id:"shoes_red_heels",name:"红底高跟鞋",category:"shoes",sourceTags:["modern","formal"]}),
  I({id:"shoes_barefoot",name:"跣足",category:"shoes",sourceTags:["minimal"]}),

  // 配饰
  I({id:"acc_jade_set",name:"组玉佩",category:"accessory",sourceTags:["ancient"]}),
  I({id:"acc_flower_hairpin",name:"簪花",category:"accessory",sourceTags:["ancient"],headFace:true}),
  I({id:"acc_golden_eagle_headband",name:"金鹰抹额",category:"accessory",sourceTags:["ancient"],headFace:true}),
  I({id:"acc_jade_flute",name:"玉笛",category:"accessory",sourceTags:["ancient"]}),
  I({id:"acc_seal",name:"玺印",category:"accessory",sourceTags:["ancient"]}),
  I({id:"acc_thumb_ring",name:"扳指",category:"accessory",sourceTags:["ancient"]}),
  I({id:"acc_dragon_jade",name:"龙纹玉佩",category:"accessory",sourceTags:["ancient"]}),
  I({id:"acc_yingluo",name:"璎珞",category:"accessory",sourceTags:["ancient"]}),
  I({id:"acc_sunglasses",name:"墨镜",category:"accessory",sourceTags:["modern"],headFace:true}),
  I({id:"acc_gold_gem_chain",name:"黄金宝石胸链",category:"accessory",sourceTags:["modern"]}),
  I({id:"acc_pearl_chain",name:"珍珠胸链",category:"accessory",sourceTags:["modern"]}),
  I({id:"acc_red_tassel_ear",name:"单侧红流苏耳饰",category:"accessory",sourceTags:["modern"],headFace:true}),
  I({id:"acc_pearl_hairpin",name:"珠钗",category:"accessory",sourceTags:["ancient"],headFace:true}),
  I({id:"acc_monocle",name:"单片镜",category:"accessory",sourceTags:["modern"],headFace:true}),
  I({id:"acc_bud_brooch",name:"花苞胸针",category:"accessory",sourceTags:["modern"]}),
  I({id:"acc_gold_armlet",name:"金臂钏",category:"accessory",sourceTags:["ancient"]}),
  I({id:"acc_pearl_face_decor",name:"珍珠面靥",category:"accessory",sourceTags:["ancient"],headFace:true}),
  I({id:"acc_platinum_cufflinks",name:"白金袖扣",category:"accessory",sourceTags:["modern","formal"]}),
  I({id:"acc_moon_pendant",name:"月亮吊坠",category:"accessory",sourceTags:["modern"]}),
  I({id:"acc_elven_circlet",name:"中土精灵额冠",category:"accessory",sourceTags:["fantasy"],headFace:true}),
  I({id:"acc_white_lace_blindfold",name:"白色蕾丝眼罩",category:"accessory",sourceTags:["modern"],headFace:true}),
  I({id:"acc_white_snake_choker",name:"白蛇颈环",category:"accessory",sourceTags:["fantasy"]}),
  I({id:"acc_sword",name:"佩剑",category:"accessory",sourceTags:["ancient","martial"]}),
  I({id:"acc_waist_tattoo",name:"腰腹纹身贴纸",category:"accessory",sourceTags:["modern"]}),
  I({id:"acc_pearl_ear_chain",name:"珍珠耳链",category:"accessory",sourceTags:["modern"],headFace:true}),
  I({id:"acc_white_jade_hairpin",name:"白玉簪",category:"accessory",sourceTags:["ancient"],headFace:true}),
  I({id:"acc_leg_ring",name:"腿环",category:"accessory",sourceTags:["modern"]}),
  I({id:"acc_beaded_face_veil",name:"珠玉面帘",category:"accessory",sourceTags:["ancient"],headFace:true}),
  I({id:"acc_folding_fan",name:"折扇",category:"accessory",sourceTags:["ancient"]}),
  I({id:"acc_gold_wire_glasses",name:"金丝眼镜",category:"accessory",sourceTags:["modern"],headFace:true}),
  I({id:"acc_magpie_moon_sachet",name:"鹊衔月香囊",category:"accessory",sourceTags:["ancient"]}),
  I({id:"acc_white_gloves",name:"白手套",category:"accessory",sourceTags:["modern","formal"]}),
  I({id:"acc_scarf",name:"丝巾",category:"accessory",sourceTags:["modern"]}),
  I({id:"acc_gold_anklet",name:"黄金脚链",category:"accessory",sourceTags:["modern"]}),

  // 累计成就奖励。未解锁前不会出现在 catalog 中。
  I({id:"reward_swim_goggles",name:"游泳镜",category:"accessory",base:false,reward:true,sourceTags:["modern"],headFace:true,description:"一副很认真、很专业、却未必适合眼下造型的游泳镜。"}),
  I({id:"reward_crocs",name:"洞洞鞋",category:"shoes",base:false,reward:true,sourceTags:["modern","casual"],description:"轻便、透气，和大多数公服都没有关系。"}),
  I({id:"reward_gold_underwear",name:"黄金内裤",category:"bottom",base:false,reward:true,sourceTags:["modern","bold"],description:"色泽堂皇，存在感远高于布料用量。"}),
  I({id:"reward_plastic_crown",name:"塑料皇冠",category:"accessory",base:false,reward:true,sourceTags:["modern"],headFace:true,description:"金灿灿的塑料皇冠，庄严感取决于观看距离。"}),
  I({id:"reward_cockroach_suit",name:"蟑螂套装",category:"outfit",base:false,reward:true,sourceTags:["costume"],description:"深棕亮面连体衣，背附薄翅，头顶长触须。看起来生命力极其顽强。"}),
  I({id:"reward_frog_raincoat",name:"青蛙雨衣",category:"outfit",base:false,reward:true,sourceTags:["costume","modern"],description:"鲜绿雨衣带两只鼓眼睛的帽兜，雨没下也可以穿。"}),
  I({id:"reward_hot_pink_puffer",name:"荧光粉羽绒服",category:"outfit",base:false,reward:true,sourceTags:["modern","casual"],description:"粉得很有决心，几乎能独自照亮整个衣柜。"}),
  I({id:"reward_giant_red_bow",name:"巨型红色蝴蝶结",category:"accessory",base:false,reward:true,sourceTags:["costume"],headFace:true,description:"尺寸大到已经很难再被称为点缀。"}),
  I({id:"reward_dinosaur_onesie",name:"恐龙连体睡衣",category:"outfit",base:false,reward:true,sourceTags:["costume","sleepwear"],description:"背后一排软刺，尾巴拖在身后，威严与保暖兼备。"}),
  I({id:"reward_diamond_swim_ring",name:"镶钻泳圈",category:"accessory",base:false,reward:true,sourceTags:["costume"],description:"一个在理论上并不需要镶钻的泳圈。"}),
  I({id:"reward_fox_tail",name:"超大号毛绒狐狸尾巴",category:"accessory",base:false,reward:true,sourceTags:["costume"],description:"蓬松到足以单独占据半张椅子。"}),
  I({id:"reward_supreme_gold_crocs",name:"至尊黄金洞洞鞋",category:"shoes",base:false,reward:true,sourceTags:["costume","modern"],description:"全成就纪念品。金光璀璨，洞依然很多。"})
] as StyleItem[]).map(x=>[x.id,x]));

export const CATEGORY_LABELS: Record<Category,string> = {
  hair:"梳发", makeup:"妆面", scent:"熏香", outfit:"衣柜", bottom:"下装", shoes:"鞋履", accessory:"配饰"
};

export const BASE_IDS: Record<Category,string[]> = {
  hair:Object.values(ITEMS).filter(x=>x.base&&x.category==="hair").map(x=>x.id),
  makeup:Object.values(ITEMS).filter(x=>x.base&&x.category==="makeup").map(x=>x.id),
  scent:Object.values(ITEMS).filter(x=>x.base&&x.category==="scent").map(x=>x.id),
  outfit:Object.values(ITEMS).filter(x=>x.base&&x.category==="outfit").map(x=>x.id),
  bottom:Object.values(ITEMS).filter(x=>x.base&&x.category==="bottom").map(x=>x.id),
  shoes:Object.values(ITEMS).filter(x=>x.base&&x.category==="shoes").map(x=>x.id),
  accessory:Object.values(ITEMS).filter(x=>x.base&&x.category==="accessory").map(x=>x.id)
};

export const BOLD_OUTFIT_IDS = new Set(Object.values(ITEMS).filter(x=>x.base&&x.category==="outfit"&&x.bold).map(x=>x.id));
export const MODERN_BOTTOM_IDS = new Set(Object.values(ITEMS).filter(x=>x.base&&x.category==="bottom"&&x.sourceTags?.includes("modern")).map(x=>x.id));
export const MODERN_SHOES_IDS = new Set(Object.values(ITEMS).filter(x=>x.base&&x.category==="shoes"&&x.sourceTags?.includes("modern")).map(x=>x.id));
export const HEAD_FACE_ACCESSORY_IDS = new Set(Object.values(ITEMS).filter(x=>x.category==="accessory"&&x.headFace).map(x=>x.id));

export function itemName(id:string):string { return ITEMS[id]?.name ?? id; }
export function itemAvailable(id:string, unlockedRewards:string[]):boolean {
  const item=ITEMS[id];
  return Boolean(item && (item.base || unlockedRewards.includes(id)));
}
