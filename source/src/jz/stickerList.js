// =====================================================
// 手帐的贴纸栏：有哪几栏、每栏有哪些（只有名字，图另打一包，见 stickers.js）。
//
// 表情、小动物、吃的、天和花、东西、心这几栏是微软的 Fluent Emoji（MIT），从 npm 上的 fluentui-emoji 包（MIT）里挑的扁平那一套，
// 原样拷进 vendor/fluent-emoji/（授权原文在那儿），tools/make_jz_stickers.mjs 照这张表拷、生成 stickers.js。
// 胶带、印章、手绘、颜文字是自己做的（marks.jsx）。同页的作者家的两枚印章不拿（卿卿 10 月 18 日说的）。
//
// 一张贴纸的 k：
//   e:<名字>  Fluent Emoji       t:<花色>  胶带（marks.jsx 的 TAPES）
//   s:<字>    印章（最多四个字）  d:<样子>  手绘（marks.jsx 的 DOODLES）
//   k:<字>    颜文字
// =====================================================
import { TAPES, TAPE_NAMES, DOODLES, KAOMOJI } from "./marks.jsx";

// [名字, 中文]
const E = {
  动物: [
    ["fox", "狐狸"], ["pig", "小猪"], ["pig-face", "猪脸"], ["mouse", "老鼠"], ["mouse-face", "鼠脸"], ["rabbit", "兔子"], ["rabbit-face", "兔脸"],
    ["cat-face", "猫脸"], ["dog-face", "狗脸"], ["penguin", "企鹅"], ["owl", "猫头鹰"], ["hamster", "仓鼠"], ["bear", "熊"], ["panda", "熊猫"],
    ["baby-chick", "小鸡"], ["duck", "鸭子"], ["swan", "天鹅"], ["dove", "鸽子"], ["honeybee", "蜜蜂"], ["butterfly", "蝴蝶"], ["snail", "蜗牛"],
    ["turtle", "乌龟"], ["spouting-whale", "鲸鱼"], ["tropical-fish", "热带鱼"], ["paw-prints", "爪印"],
  ],
  表情: [
    ["smiling-face-with-hearts", "冒爱心"], ["face-blowing-a-kiss", "飞吻"], ["pleading-face", "可怜巴巴"], ["sleeping-face", "睡着了"], ["yawning-face", "打哈欠"],
    ["pouting-face", "生气"], ["loudly-crying-face", "大哭"], ["partying-face", "开派对"], ["star-struck", "星星眼"], ["smirking-face", "坏笑"],
    ["hugging-face", "抱抱"], ["thinking-face", "想一想"], ["face-with-steam-from-nose", "哼"], ["smiling-face-with-smiling-eyes", "笑眯眯"], ["face-holding-back-tears", "忍住眼泪"],
  ],
  吃的: [
    ["cooked-rice", "米饭"], ["steaming-bowl", "一碗面"], ["bento-box", "便当"], ["rice-ball", "饭团"], ["dumpling", "饺子"], ["pizza", "披萨"],
    ["shortcake", "蛋糕"], ["birthday-cake", "生日蛋糕"], ["cupcake", "纸杯蛋糕"], ["custard", "布丁"], ["hot-beverage", "热饮"], ["teacup-without-handle", "茶"],
    ["bubble-tea", "奶茶"], ["wine-glass", "葡萄酒"], ["beer-mug", "啤酒"], ["strawberry", "草莓"], ["cherries", "樱桃"], ["lemon", "柠檬"], ["peach", "桃子"],
    ["croissant", "可颂"], ["cooking", "煎蛋"], ["dango", "团子"], ["moon-cake", "月饼"], ["fortune-cookie", "幸运饼干"],
  ],
  天和花: [
    ["sun", "太阳"], ["cloud", "云"], ["cloud-with-rain", "下雨"], ["snowflake", "雪花"], ["rainbow", "彩虹"], ["crescent-moon", "弯月"], ["full-moon", "满月"],
    ["star", "星星"], ["sparkles", "闪闪"], ["cherry-blossom", "樱花"], ["tulip", "郁金香"], ["rose", "玫瑰"], ["sunflower", "向日葵"], ["hibiscus", "扶桑花"],
    ["bouquet", "花束"], ["four-leaf-clover", "四叶草"], ["maple-leaf", "枫叶"], ["fallen-leaf", "落叶"], ["herb", "小草"],
  ],
  东西: [
    ["camera", "相机"], ["camera-with-flash", "闪光相机"], ["books", "书"], ["open-book", "打开的书"], ["memo", "便签"], ["pencil", "铅笔"], ["envelope", "信封"],
    ["love-letter", "情书"], ["wrapped-gift", "礼物"], ["ribbon", "蝴蝶结"], ["balloon", "气球"], ["crown", "皇冠"], ["gem-stone", "宝石"], ["key", "钥匙"],
    ["light-bulb", "灯泡"], ["candle", "蜡烛"], ["umbrella", "雨伞"], ["train", "火车"], ["house", "房子"], ["airplane", "飞机"], ["ticket", "票"],
    ["scroll", "卷轴"], ["coin", "铜钱"], ["mobile-phone", "手机"], ["laptop", "电脑"], ["game-die", "骰子"], ["teddy-bear", "小熊玩偶"],
    ["musical-note", "音符"], ["headphone", "耳机"], ["red-paper-lantern", "灯笼"],
  ],
  心: [["red-heart", "红心"], ["pink-heart", "粉心"], ["purple-heart", "紫心"], ["sparkling-heart", "闪闪的心"], ["two-hearts", "两颗心"], ["heart-with-ribbon", "系丝带的心"], ["kiss-mark", "唇印"]],
};
export const EMOJI_NAMES = Object.values(E).flat().map(([k]) => k);

// 印章里先摆着的几枚（点了就贴；也能自己刻：最多四个字）
export const SEALS = ["开封府", "闲笔", "卿卿", "光义", "已阅", "甚好"];

// 贴纸栏的几栏：[{ k: 栏, t: 名字, items: [{ k: 贴纸, t: 中文 }] }]
export const TABS = [
  ...Object.entries(E).map(([t, list]) => ({ k: t, t, items: list.map(([n, cn]) => ({ k: `e:${n}`, t: cn })) })),
  { k: "胶带", t: "胶带", items: Object.keys(TAPES).map((n) => ({ k: `t:${n}`, t: TAPE_NAMES[n] || n })) },
  { k: "印章", t: "印章", items: SEALS.map((s) => ({ k: `s:${s}`, t: s })) },
  { k: "手绘", t: "手绘", items: Object.entries(DOODLES).map(([n, d]) => ({ k: `d:${n}`, t: d.t })) },
  { k: "颜文字", t: "颜文字", items: KAOMOJI.map((s) => ({ k: `k:${s}`, t: s })) },
];
const ALL = TABS.flatMap((t) => t.items);

// 他排一页的时候能挑的贴纸名字（中文，见 model.js 的 buildArrangeAsk）：表情这几栏和手绘、印章；胶带、颜文字不给他
export const NAMES_FOR_HIM = ALL.filter((x) => /^[eds]:/.test(x.k)).map((x) => x.t);
// 他写的名字 → 贴纸（认不出回 ""）。照中文名认；他写成英文的那个名字（fox、heart）也认
export const stickerByName = (name) => {
  const n = String(name || "").trim();
  const hit = ALL.find((x) => /^[eds]:/.test(x.k) && x.t === n) || ALL.find((x) => /^[ed]:/.test(x.k) && x.k.slice(2) === n);
  return hit ? hit.k : "";
};
export const stickerName = (k) => (ALL.find((x) => x.k === k) || { t: k.slice(2) }).t;
