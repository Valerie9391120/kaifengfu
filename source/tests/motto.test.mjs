// 中间那行字：拆素材库、认日子、抽一句、摆成几行（src/motto.js），农历的表（src/lunar.js）。
// 素材库是她的私房话，不进仓库：这里的全是编的，只照着她那份的写法写。
// node tests/motto.test.mjs
import { loadBundle } from "./push-harness.mjs";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log("ok:", msg);
  } else {
    failed++;
    console.log("FAIL:", msg);
    if (process.env.KFS_FAILFAST) process.exit(1);
  }
}
const J = (x) => JSON.stringify(x);

const M = await loadBundle("src/motto.js");
const { LUNAR_DAYS, LUNAR_FROM, LUNAR_TO } = await loadBundle("src/lunar.js");
const { parseMotto, poolAt, pickMotto, mottoLines, monthsSince, readMotto, packMotto, describeMotto, fillMotto } = M;

// 照她那份的写法编的一份
const LIB = `- 写在最前头、哪一节都不在的这一行：不算
# 编的素材库

最前头写几句说明，不算句子。

---

## 早晨 7:00–10:00

- 早一
- 早二

---

## 上午 10:00–12:00

- 上午一

---

## 下午 12:00–18:00

- 下午一
- 下午二
- 下午三

---

## 傍晚 18:00–21:00

- 傍晚一

---

## 夜晚 21:00–00:00

- 夜一
- 夜二

---

## 深夜 00:00–04:00

- 深一
- 深二

---

## 凌晨 04:00–07:00

- 凌一

---

## 特别的日子

### 每月8日（纪念日，从2026年3月8日算起）
- 又到这一天
- 陪你第{N}个月

### 中秋节
- 中秋一

### 春节
- 过年一

### 七夕
- 七夕一

### 情人节
- 情人一

### 圣诞节
- 圣诞一

### 生日（3月14日·某某）
- 生日一
- 生日二

### 半年纪念日（2026年9月8日）
- 半年一

### 一周年（2027年3月8日）
- 一年一

---

*说明写在这里。*

*落款*
`;

// ================= 拆 =================
{
  const lib = parseMotto(LIB);
  ok(lib.slots.length === 7 && J(lib.slots.map((s) => s.lines.length)) === J([2, 1, 3, 1, 2, 2, 1]), `时段：七节都认出来，每节几句对得上（${J(lib.slots.map((s) => s.lines.length))}）`);
  ok(J(lib.slots.map((s) => [s.from, s.to])) === J([[420, 600], [600, 720], [720, 1080], [1080, 1260], [1260, 1440], [0, 240], [240, 420]]), "时段：几点到几点认对了（00:00 结尾的算到半夜十二点）");
  ok(lib.days.length === 9 && J(lib.days.map((d) => d.kind)) === J(["monthly", "feast", "feast", "feast", "feast", "feast", "yearly", "once", "once"]), `日子：九个都认出来，各是哪一种（${J(lib.days.map((d) => d.kind))}）`);
  ok(J(lib.start) === J({ y: 2026, m: 3, d: 8 }), "{N} 从哪天算：“从2026年3月8日算起”");
  ok(lib.unknown.length === 0, "大标题、“特别的日子”那个总标题底下没有句子：不当成认不出的");
  const all = lib.slots.flatMap((s) => s.lines).concat(lib.days.flatMap((d) => d.lines));
  ok(!all.some((s) => s.includes("不算") || s.includes("说明写在这里") || s.includes("落款")), "最前头的说明、最后的落款（不是“- ”开头的、或者在“---”后面的）都不算句子");
  const d = describeMotto(lib);
  ok(d.total === 23 && d.start === "2026年3月8日" && d.slots[0].name === "早晨 7:00–10:00" && d.days[6].name === "生日（3月14日·某某）", `面板上说认出了什么：一共 ${d.total} 句，从哪天算，每一节的名字`);
}
{
  const odd = parseMotto(`
## 夜猫子 22:00-02:00
- 跨了半夜的
## 午觉 13：00 ~ 14：30
* 全角冒号、波浪线也认
## 生日（2月30日）
- 没有这一天
## 随便写的标题
- 底下有句子，可这个标题认不出
### 在一起（从2025年1月2日算起）
- 只写了从哪天算起，没写哪天出
### 二月二十九（2月29日）
- 闰年才有
1. 编了号的也算一句
- 早二
- 早二
`);
  ok(odd.slots.length === 2 && odd.slots[0].from === 1320 && odd.slots[0].to === 120 && odd.slots[1].from === 780 && odd.slots[1].to === 870, "时段：跨半夜的（22:00-02:00）、全角冒号和波浪线（13：00 ~ 14：30）都认");
  const night = (t) => J(poolAt(odd, new Date(`2026-10-10T${t}:00`)).lines);
  ok(night("23:30") === J(["跨了半夜的"]) && night("01:30") === J(["跨了半夜的"]) && night("22:00") === J(["跨了半夜的"]) && night("02:00") === "[]" && night("21:59") === "[]",
    "跨半夜的时段：夜里十一点半、凌晨一点半都在里头；22:00 起，到 02:00 为止");
  ok(J(odd.unknown.map((s) => s.name)) === J(["生日（2月30日）", "随便写的标题", "在一起（从2025年1月2日算起）"]), `认不出的标题（底下又写了句子的）：报出来，那些句子不会被抽到（${J(odd.unknown.map((s) => s.name))}）`);
  ok(J(odd.start) === J({ y: 2025, m: 1, d: 2 }), "“从哪天算起”写在哪个标题里都认（只认头一个）");
  const leap = odd.days.find((d) => d.m === 2 && d.d === 29);
  ok(leap && J(leap.lines) === J(["闰年才有", "编了号的也算一句", "早二"]), "2 月 29 日认；编了号的（1.）也算一句；同一节里重复的句子只留一句");
}

{
  // 她那份要是这么写：也照样认（另一双眼睛挑出来的几样）
  const loose = parseMotto("\ufeff" + `## 早晨 ７：００〜１０：００
-早一
・早二
－ 早三
* 早四
*这是一行斜体的说明，不是一句*
- 两行的诗，
  第二行接着写。
- Good morning,
  my dear.
---
- 写在“---”后面、标题前面的一句
- 又一句
### 七夕（农历七月初七）
- 七夕的
### 中秋（农历8月15日）
- 中秋的
### 生日（2003年3月14日）
- 写了出生那年的生日
### 以后的某天（2099年1月1日）
- 以后的
`);
  const morning = loose.slots[0];
  ok(morning && morning.from === 420 && morning.to === 600, "全角数字、“〜”写的时段也认（文件开头带着的那个看不见的 BOM 也不碍事）");
  ok(J(morning.lines) === J(["早一", "早二", "早三", "早四", "两行的诗，第二行接着写。", "Good morning, my dear."]),
    `“-早一”（没空格）、“・”“－”开头的也算一句；“*斜体*”那种说明不算；缩进的第二行接在上一句后面（中文不加空格，英文加一个）（${J(morning.lines)}）`);
  ok(loose.stray === 2, `写在“---”后面、哪一节都不在的句子：数出来（${loose.stray} 句），面板上说一声`);
  const qixi = loose.days.find((d) => d.name.startsWith("七夕"));
  const zhongqiu = loose.days.find((d) => d.name.startsWith("中秋"));
  ok(qixi.kind === "feast" && qixi.feast === "七夕" && zhongqiu.kind === "feast" && zhongqiu.feast === "中秋", "写了“农历几月几日”的节日：照节日认，不当成阳历的 8 月 15 日");
  ok(J(poolAt(loose, new Date("2026-08-15T12:00:00")).lines) === "[]" && J(poolAt(loose, new Date("2026-09-25T12:00:00")).lines) === J(["中秋的"]), "阳历 8 月 15 日不出中秋的；农历八月十五（2026 年 9 月 25 日）出");
  const seen = describeMotto(loose, new Date("2026-10-10T12:00:00"));
  const born = seen.days.find((d) => d.name.startsWith("生日"));
  const later = seen.days.find((d) => d.name.startsWith("以后"));
  ok(born.past === true && later.past === false && seen.stray === 2, "写了年份、已经过了的日子（连出生那年一起写的生日）：面板上标出来“不会再出”；以后的不标");
}

// ================= 认日子、挑那一堆 =================
{
  const lib = parseMotto(LIB);
  const at = (s) => poolAt(lib, new Date(s));
  const lines = (s) => J(at(s).lines);
  ok(lines("2026-10-10T00:45:00") === J(["深一", "深二"]) && at("2026-10-10T00:45:00").kind === "slot", "平常日子的半夜十二点四十五：深夜那一节");
  ok(lines("2026-10-10T23:59:00") === J(["夜一", "夜二"]) && lines("2026-10-10T04:00:00") === J(["凌一"]) && lines("2026-10-10T06:59:00") === J(["凌一"]) && lines("2026-10-10T07:00:00") === J(["早一", "早二"]) && lines("2026-10-10T21:00:00") === J(["夜一", "夜二"]),
    "时段的边：23:59 还是夜晚；4:00 起是凌晨；6:59 还是凌晨；7:00 起是早晨；21:00 起是夜晚");
  ok(lines("2026-09-08T00:00:00") === J(["半年一"]) && lines("2026-09-08T08:00:00") === J(["半年一"]) && lines("2026-09-08T23:59:00") === J(["半年一"]),
    "半年纪念日（写了年份的）那一天：整天只抽那天的，从半夜十二点到夜里 23:59");
  ok(at("2026-09-08T08:00:00").names[0] === "半年纪念日（2026年9月8日）", "9 月 8 日既是每月 8 日、又是半年纪念日：写了年份的优先，不出每月 8 日的");
  ok(lines("2027-09-08T08:00:00") === J(["又到这一天", "陪你第{N}个月"]) && at("2027-09-08T08:00:00").n === 18, "写了年份的只那一年：2027 年 9 月 8 日只是每月 8 日（满十八个月）");
  ok(lines("2026-10-08T09:00:00") === J(["又到这一天", "陪你第{N}个月"]) && at("2026-10-08T09:00:00").n === 7, "每月 8 日：{N} 是从 2026 年 3 月 8 日算起满几个月（10 月 8 日是七个月）");
  ok(lines("2027-03-08T09:00:00") === J(["一年一"]), "一周年那天：写了年份的优先，不出每月 8 日的");
  ok(lines("2027-03-14T09:00:00") === J(["生日一", "生日二"]) && lines("2028-03-14T09:00:00") === J(["生日一", "生日二"]), "生日（没写年份）：每年这一天");
  ok(lines("2026-09-25T20:00:00") === J(["中秋一"]) && lines("2027-09-15T20:00:00") === J(["中秋一"]) && lines("2026-09-26T20:00:00") === J(["傍晚一"]), "中秋：农历八月十五（2026 年 9 月 25 日、2027 年 9 月 15 日）；第二天就回到平常");
  ok(lines("2027-02-05T10:30:00") === J(["过年一"]) && lines("2027-02-06T10:30:00") === J(["过年一"]) && lines("2027-02-07T10:30:00") === J(["上午一"]) && lines("2027-02-04T10:30:00") === J(["上午一"]),
    "春节：除夕（2027 年 2 月 5 日）和正月初一（2 月 6 日）两天都出；手机自带的农历会算成 2 月 7 日，这里不跟它");
  ok(lines("2026-08-19T13:00:00") === J(["七夕一"]) && lines("2027-02-14T13:00:00") === J(["情人一"]) && lines("2026-12-25T13:00:00") === J(["圣诞一"]), "七夕（农历七月初七）、情人节、圣诞节");
  ok(lines("2026-02-08T13:00:00") === J(["下午一", "下午二", "下午三"]), "每月 8 日：从哪天算起之前的那些 8 日不算（还没开始）");
}
{
  // 几样撞在同一天
  const lib = parseMotto(`
## 全天 00:00–00:00
- 平常
### 春节
- 过年
### 2月17日（某个每年的日子）
- 每年的
### 生日（2月17日）
- 也是每年的
### 每月17日
- 每月的
`);
  const lines = (s) => J(poolAt(lib, new Date(s)).lines);
  ok(lines("2026-02-17T12:00:00") === J(["每年的", "也是每年的"]), "2026 年 2 月 17 日（春节）又是两个每年的日子、又是每月 17 日：每年的那一档优先，同一档的两样并在一起抽");
  ok(lines("2026-03-17T12:00:00") === J(["每月的"]) && lines("2026-03-18T12:00:00") === J(["平常"]), "只剩每月的那一档；都不是就回到时段（00:00–00:00 是整天）");
  const lone = parseMotto("### 每月8日\n- 又到这一天\n- 陪你第{N}个月\n## 全天 0:00–24:00\n- 平常");
  ok(J(poolAt(lone, new Date("2026-11-08T12:00:00")).lines) === J(["又到这一天"]), "没写从哪天算起：写着 {N} 的那句不抽（不会摆出“陪你第0个月”）");
  const only = parseMotto("### 每月8日\n- 陪你第{N}个月\n## 全天 0:00–24:00\n- 平常");
  ok(J(poolAt(only, new Date("2026-11-08T12:00:00")).lines) === J(["平常"]), "那一天的句子全都抽不了：回到时段");
  ok(poolAt(parseMotto(""), new Date()).kind === "none" && pickMotto(parseMotto("随便写的一段字"), new Date()) === "", "什么都没写、写的不是这个格式：没有能抽的（画面上照旧是“如月之恒，官家在这”）");
}

// ================= 抽 =================
{
  const lib = parseMotto(LIB);
  const night = new Date("2026-10-10T00:45:00");
  ok(pickMotto(lib, night, "", () => 0) === "深一" && pickMotto(lib, night, "", () => 0.99) === "深二", "抽：照随机数抽");
  ok(pickMotto(lib, night, "深一", () => 0) === "深二" && pickMotto(lib, night, "深二", () => 0.99) === "深一", "抽：上一回抽到的那句不抽（同一个时段里不连着两回一样）");
  ok(pickMotto(lib, new Date("2026-09-08T08:00:00"), "半年一", () => 0) === "半年一", "那一堆只有一句：上一回是它也照抽");
  const seen = new Set();
  let last = "";
  for (let i = 0; i < 200; i++) {
    const s = pickMotto(lib, new Date("2026-10-10T14:00:00"), last);
    if (s === last) seen.add("重复");
    seen.add(s);
    last = s;
  }
  ok(!seen.has("重复") && seen.has("下午一") && seen.has("下午二") && seen.has("下午三"), "连着抽两百回：三句都抽到过，没有一回和上一回一样");
  ok(pickMotto(lib, new Date("2026-10-08T09:00:00"), "又到这一天", () => 0) === "陪你第7个月" && fillMotto("第{N}个月，{N}", 3) === "第3个月，3", "{N} 换成满了几个月");
}

// ================= 摆成几行 =================
{
  ok(J(mottoLines("醒了？先喝口水。")) === J(["醒了？先喝口水。"]) && J(mottoLines("下午好，喝了latte没有？")) === J(["下午好，喝了latte没有？"]), "不长的就一行（英文字母算半个字宽）");
  ok(J(mottoLines("江上清风明月好，山间流水白云多。远客归来灯未灭，小窗相对说今宵。")) === J(["江上清风明月好，山间流水白云多。", "远客归来灯未灭，小窗相对说今宵。"]), "长的诗：一句一行");
  ok(J(mottoLines("杨柳岸边春水绿，桃花渡口夕阳红……船到岸了。")) === J(["杨柳岸边春水绿，", "桃花渡口夕阳红……", "船到岸了。"]), "省略号也是一句的结尾；一句还是放不下（十七个字宽）的从逗号断开");
  ok(J(mottoLines("愿你岁岁平安喜乐，年年花好月圆，日日晴空万里，此外无他。")) === J(["愿你岁岁平安喜乐，年年花好月圆，", "日日晴空万里，此外无他。"]), "一句话太长：从离正中间最近的那个逗号断开");
  ok(J(mottoLines("他说：“回来了。”然后笑了一下，眼睛弯弯的。")) === J(["他说：“回来了。”", "然后笑了一下，眼睛弯弯的。"]), "句号后面跟着的引号带在这一行上");
  ok(J(mottoLines("Happy holidays, my dear.")) === J(["Happy holidays, my dear."]) && J(mottoLines("Happy holidays, my dear little friend from far away.")) === J(["Happy holidays,", "my dear little friend from far away."]),
    "英文：字窄，短的一行放得下；长的（字距拉开以后一行放不下）也从逗号断开");
  ok(J(mottoLines("")) === "[]" && J(mottoLines("  ")) === "[]", "空的不摆");
  ok(J(mottoLines("宝贝今天真的辛苦了！！明天我们一起去看海吧。")) === J(["宝贝今天真的辛苦了！！", "明天我们一起去看海吧。"]), "“！！”连着写的算一个结尾，不剩一个叹号单独一行");
  ok(J(mottoLines("我们说好的时间是晚上的11:30然后一起看月亮好吗")) === J(["我们说好的时间是晚上的11:30然后一起看月亮好吗"]), "数字中间的冒号（11:30）不当断开的地方（别处没得断：交给浏览器自己折）");
  ok(J(mottoLines("晚安。🌙明天见，记得早点起来晒太阳，不许赖床哦。")) === J(["晚安。🌙", "明天见，记得早点起来晒太阳，", "不许赖床哦。"]), "句末跟着的表情带在这一行上，不单独一行");
}

// ================= 存 =================
{
  const raw = packMotto("## 早晨 7:00–10:00\n- 早", 123);
  ok(readMotto(raw) === "## 早晨 7:00–10:00\n- 早" && readMotto("坏的") === "" && readMotto(J({ v: 1 })) === "" && readMotto(null) === "", "存：原文存进去、取出来一个字不差；坏的、没有的回空");
  ok(readMotto(packMotto("字".repeat(70000), 1)).length === M.MOTTO_TEXT_MAX, "存：太长的只留前六万个字");
  ok(monthsSince(null, 2026, 11, 8) === 0 && monthsSince({ y: 2026, m: 3, d: 8 }, 2026, 4, 7) === 0 && monthsSince({ y: 2026, m: 3, d: 8 }, 2026, 4, 8) === 1 && monthsSince({ y: 2026, m: 3, d: 8 }, 2027, 3, 8) === 12,
    "满几个月：差一天不算满（4 月 7 日还是 0），一周年是 12");
}

// ================= 农历的表（lunar.js） =================
{
  const years = new Set(Array.from(LUNAR_DAYS.keys()).map((k) => k.slice(0, 4)));
  ok(LUNAR_FROM === 2026 && LUNAR_TO === 2060 && years.size === 35, `表里从 2026 到 2060 年，三十五年（${years.size}）`);
  const of = (k) => J(LUNAR_DAYS.get(k) || []);
  ok(of("2027-02-06") === J(["春节"]) && of("2027-02-05") === J(["除夕"]) && of("2030-02-03") === J(["春节"]) && of("2030-02-02") === J(["除夕"]), "2027、2030 年的春节和除夕：照公开的日子表（手机自带的农历这两年各错一天）");
  // 每一年都有这八样，除夕都在春节前一天
  const byYear = {};
  for (const [k, names] of LUNAR_DAYS) for (const n of names) (byYear[k.slice(0, 4)] = byYear[k.slice(0, 4)] || {})[n] = k;
  // 腊八是那一年腊月初八，落在下一年的一月，偶尔落在当年的十二月底：有的年份一个也没有（2042 年的落在 2041 年 12 月 30 日）
  const seven = ["春节", "除夕", "元宵", "端午", "七夕", "中秋", "重阳"];
  const missing = Object.entries(byYear).filter(([y, m]) => seven.some((n) => !m[n]));
  const laba = Array.from(LUNAR_DAYS.values()).filter((n) => n.includes("腊八")).length;
  ok(missing.length === 0 && laba >= 34 && laba <= 36 && of("2041-12-30") === J(["腊八"]), `每一年七样都有（${missing.map(([y]) => y).join("、") || "都齐"}）；腊八一共 ${laba} 个，2042 年那个落在 2041 年 12 月 30 日`);
  const eveOk = Object.values(byYear).every((m) => new Date(m["春节"] + "T12:00:00Z") - new Date(m["除夕"] + "T12:00:00Z") === 864e5);
  ok(eveOk, "每一年的除夕都在春节前一天");
  // 拿 Node 自带的农历（ICU）对一遍：除了已知的 2027、2030 年那几天，都得对得上
  const icu = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "numeric", day: "numeric" });
  const want = { 春节: "1-1", 元宵: "1-15", 端午: "5-5", 七夕: "7-7", 中秋: "8-15", 重阳: "9-9", 腊八: "12-8" };
  const off = [];
  for (const [k, names] of LUNAR_DAYS) {
    for (const n of names) {
      if (n === "除夕") continue;
      const p = Object.fromEntries(icu.formatToParts(new Date(k + "T12:00:00Z")).map((x) => [x.type, x.value]));
      if (`${p.month}-${p.day}` !== want[n]) off.push(`${k}${n}`);
    }
  }
  // （Node 哪天把自己的农历修好了，这几样就对得上了：只要求“对不上的都在这几样里头”）
  const known = ["2027-02-06春节", "2027-02-20元宵", "2030-02-03春节", "2030-02-17元宵"];
  ok(off.every((x) => known.includes(x)), `和 Node 自带的农历对过：对不上的只有 2027、2030 年那几天（它自己算错的），别的都对得上（${off.join("、") || "全对上了"}）`);
}

console.log(`\n通过 ${passed}  失败 ${failed}`);
process.exit(failed ? 1 : 0);
