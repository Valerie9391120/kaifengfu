import type { CareAction, PlantDefinition, PlantId } from "./types.js";

export const INTRO_TEXT = `缘识 其五七
牡丹花，深红浅，忍把金刀枝上剪。
侵晨含露万苞香，见者无非情展转。
繁华影里皆柔弱，密叶交加开闪烁。
朱栏别是一般春，蛱蝶悠飏闲自乐。
丽天和日景迟迟，思量往事不堪追。
风送园中来又去，豁然兴感竞移时。

现在，你获得了一盆待培育的魏紫牡丹。
请耐心照料、静待开花。`;

export const CARE_TEXT: Record<CareAction, string | string[]> = {
  water: "你提壶浇了一圈水，土色慢慢深了下去。",
  loosen: "你将花根周围的土轻轻拨松，过程中仔细避开新生的细根。",
  prune: [
    "你取来金剪，小心翼翼地剪除了一段发黑的细枝。",
    "你取来金剪，小心翼翼地剪除了一段枯黄的细枝。",
    "你取来金剪，小心翼翼地剪除了一段蔫掉的细枝。"
  ]
};

export const STAGE_TEXTS = {
  sprout: [
    "茎叶幼嫩，破土初展，尚为小芽。",
    "冲着青黄色的细尖嫩芽，你忍不住轻轻吹了一口气。小叶微颤，可爱非常。",
    "远没到开花的时候。悉心培育，再等一些日子吧。"
  ],
  leaf: [
    "盆中幼苗近日抽条，肉眼可见长高了许多，令人心生欢喜。",
    "新叶一层层舒展开来，叶色由浅转浓，细嫩的枝梢也渐渐有了精神。",
    "你俯身细看，几片嫩叶正从枝节间探出来，仿佛一夜之间又长了一截。"
  ],
  bud: [
    "新发的芽苞坠在枝头，随风轻轻颤动。",
    "枝端渐渐鼓起圆润的花苞，青萼紧合，却已经藏不住将开的意思。",
    "你今日再来看时，花苞似乎比昨日又饱满了一些。再等几场晨露，大约便要开了。"
  ]
} as const;

export const PLANTS: Record<PlantId, PlantDefinition> = {
  peony_weizi: {
    id: "peony_weizi", displayName: "牡丹 · 魏紫", shortName: "魏紫", familyKey: "牡丹",
    collectionText: "人人都云，魏紫占尽人间好物华。又有谁知，贵客此身不是自由身。",
    bloomText: "经过数日精心培育，这株魏紫终于在你面前展露出倾国名花的仙姿。重重叠叠的花瓣柔嫩娇媚，姹紫鲜妍，一见忘俗。"
  },
  peony_yulouchun: {
    id: "peony_yulouchun", displayName: "牡丹 · 玉楼春", shortName: "玉楼春", familyKey: "牡丹",
    collectionText: "道是白花冷澹无人爱，故而此花清白。可生于浊世，便不可能有真正的清白。",
    bloomText: "千层白花，重重如练，宛若玲珑之塔。洁白无瑕，暗香浅淡，花心深处却藏着一线淡淡的暖色。"
  },
  white_plum: {
    id: "white_plum", displayName: "白梅", shortName: "白梅", familyKey: "梅",
    collectionText: "冰雪林中著此身，不同桃李混芳尘。忽然一夜清香发，散作乾坤万里春。",
    bloomText: "细枝之上，一点一点的雪色终于绽开。花瓣疏朗，姿态清瘦，凑近时却能闻见极淡而悠长的清香。明明没有半分喧闹，却自有一番令人驻足的风骨。"
  },
  xifu_begonia: {
    id: "xifu_begonia", displayName: "西府海棠", shortName: "西府海棠", familyKey: "海棠",
    collectionText: "惠洪《冷斋夜话》：上皇登沉香亭，诏太真妃子。妃于时卯醉未醒，命力士从侍儿扶掖而至。妃子醉颜残妆，鬓乱钗横，不能再拜。上皇笑曰：是岂妃子醉，真海棠睡未足耳。",
    bloomText: "花苞渐次舒展，粉白相间的花朵压满枝头。花瓣薄而柔润，微微垂首，像是宿醉初醒，尚带几分慵懒。风一过，满枝花影轻轻相碰。"
  },
  zhilan: {
    id: "zhilan", displayName: "芷兰", shortName: "芷兰", familyKey: "兰",
    collectionText: "折茎聊可佩，入室自成芳。开花不竞节，含秀委微霜。自古即为高洁典雅之象，谓君子修道立德，不以困劳改节。",
    bloomText: "修长的叶片之间终于抽出花茎，数朵清雅小花静静开放。花色并不夺目，幽香却若有若无地萦在近旁，不必招摇，也自有一室芬芳。"
  },
  azalea: {
    id: "azalea", displayName: "映山红", shortName: "映山红", familyKey: "杜鹃",
    collectionText: "李白《宣城见杜鹃花》：蜀国曾闻子规鸟，宣城还见杜鹃花。一叫一回肠一断，三春三月忆三巴。",
    bloomText: "枝头蓄了许久的花苞一夕舒展，鲜红花朵成簇开放。远远望去，像有一抹霞色停在枝间，明艳热烈，几乎要将周围的春光都照亮。"
  },
  camellia: {
    id: "camellia", displayName: "茶花", shortName: "茶花", familyKey: "茶花",
    collectionText: "辛弃疾《浣溪沙·与客赏山茶一朵忽坠地戏作》：酒面低迷翠被重，黄昏院落月朦胧。堕髻啼妆孙寿醉，泥秦宫。试问花留春几日？略无人管雨和风。瞥向绿珠楼下见，坠残红。",
    bloomText: "浓绿叶色之间，一朵茶花终于沉沉开放。花瓣厚润而整齐，层层围拢，颜色浓丽，却并不轻浮。枝叶寂静，更衬得那一朵花端庄得近乎郑重。"
  },
  osmanthus: {
    id: "osmanthus", displayName: "金桂", shortName: "金桂", familyKey: "桂",
    collectionText: "古时乡试、会试例在八月，时值桂花盛开季节，遂称桂月，考生考中喻为“折桂”，美称“蟾宫折桂”。",
    bloomText: "起初只见叶间藏着细小花苞，今日再来，却已开成一簇簇碎金。花虽细微，香气却毫不收敛，隔着几步也能闻见，仿佛整个庭院都被悄悄染上了甜香。"
  },
  rose: {
    id: "rose", displayName: "月季", shortName: "月季", familyKey: "月季",
    collectionText: "张新《月季花》：一番花信一番新，半属东风半属尘。惟有此花开不厌，一年长占四时春。",
    bloomText: "枝头的新蕾终于打开，柔软花瓣一层层舒展，颜色鲜润如新。它没有一朝盛极的声势，却自有绵长不绝的生意，一朵谢去，下一枝似乎已经在等着了。"
  },
  narcissus: {
    id: "narcissus", displayName: "水仙", shortName: "水仙", familyKey: "水仙",
    collectionText: "周密《花犯（水仙花）》：楚江湄，湘娥再现，无言洒清泪，淡然春意。空独倚东风，芳思谁寄？凌波路冷秋无际香云随步起，漫记得，汉宫仙掌，亭亭明月底。冰弦写怨更多情，骚人恨，枉赋芳兰幽芷。春思远，谁叹赏国香风味？相将共、岁寒伴侣，小窗净，沉烟熏翠被。幽梦觉、涓涓清露，一枝灯影里。",
    bloomText: "青叶之间，细长花茎托起数朵洁白小花。白瓣清透，中央一点金黄，仿佛素衣仙子掌中托着小小金盏。清香浅淡，临近才觉。"
  },
  autumn_chrysanthemum: {
    id: "autumn_chrysanthemum", displayName: "秋菊", shortName: "秋菊", familyKey: "菊",
    collectionText: "《礼记·月令》载：季秋之月，鞠有黄华。孤高隐逸之花，亦是长寿和坚贞的象征。",
    bloomText: "蓄势已久的花苞终于一瓣瓣打开。细长花瓣层层舒卷，姿态清峻，愈到外层愈显疏朗。纵无群芳相伴，也自顾自地开得从容。"
  },
  hibiscus: {
    id: "hibiscus", displayName: "木槿", shortName: "木槿", familyKey: "木槿",
    collectionText: "有女同车，颜如舜华。将翱将翔，佩玉琼琚。彼美孟姜，洵美且都。有女同行，颜如舜英。将翱将翔，佩玉将将。彼美孟姜，德音不忘。",
    bloomText: "清晨时枝头尚只是紧拢的花苞，再来看时，薄软花瓣已经完全舒展开来。花色温柔明净，迎着日光轻轻颤动，虽知朝开暮落，此刻却仍盛放得毫无保留。"
  }
};

export const PLANT_ORDER = Object.keys(PLANTS) as PlantId[];
