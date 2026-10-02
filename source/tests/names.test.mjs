// 昵称：名字收拾得对不对、他回复里的 [NAME:新名字] 认不认得出来
import { HER_NAME, HIS_NAME, NAME_KEYS, NAME_ROOM, NAME_MARK, NAME_PLACEHOLDER, cleanName, cleanMarkName, tidyName } from "../src/names.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };

// ---- 默认的名字和存档里的位置 ----
ok(HER_NAME === "卿卿" && HIS_NAME === "光义", "默认的名字：卿卿、光义");
ok(NAME_KEYS.her === "kfs2:name:her" && NAME_KEYS.him === "kfs2:name:guangyi" && NAME_KEYS.her !== NAME_KEYS.him,
  "两个名字各存一条，互不相干");

// ---- 收拾名字 ----
ok(cleanName("测试大王") === "测试大王" && cleanName("Fox") === "Fox", "正常的名字原样留着");
ok(cleanName("  测试 \n  大王\t ") === "测试 大王", "前后的空白去掉，中间的换行和连着的空白收成一个空格");
ok(cleanName("[测试]大王") === "测试 大王" && !/[\[\]]/.test(cleanName("]]a[[")), "方括号留给标记用，名字里不留");
ok(cleanName("") === "" && cleanName("   ") === "" && cleanName(null) === "" && cleanName(undefined) === "" && cleanName("[]") === "",
  "空的、只有空白的、只有括号的：都算没起名字");
ok(cleanName("a\u0000b\u200bc\ufeff") === "abc", "看不见的控制符去掉");
ok(cleanName(12345) === "12345", "不是字符串也不会出错");

// ---- 长短：汉字和表情占两格，英文数字占一格，一共二十四格 ----
const twelve = "一二三四五六七八九十甲乙";
ok(NAME_ROOM === 24 && cleanName(twelve) === twelve, "十二个汉字正好放得下");
ok(cleanName(twelve + "丙丁") === twelve, "第十三个汉字起截掉");
ok(cleanName("abcdefghijklmnopqrstuvwxyz") === "abcdefghijklmnopqrstuvwx", "英文一个字母一格，能写二十四个");
ok(cleanName("一二三四五六七八九十甲a乙") === "一二三四五六七八九十甲a", "汉字英文混着：按格数算，放不下的那个字起截掉");
ok(cleanName("一二三四五六七八九十甲 乙") === "一二三四五六七八九十甲", "截完末尾剩个空格也去掉");
const family = "\u{1F469}\u200D\u{1F467}"; // 两个表情用连接符拼成的一个
ok(cleanName(family.repeat(13)) === family.repeat(12), "拼出来的表情算一个字，不会从中间切开");
ok(tidyName(twelve + "丙丁") === twelve + "丙丁" && tidyName(" a  b ") === "a b", "tidyName 只收拾不截：拿来看名字是不是被截短了");

// ---- 他回复里的改名标记：独占一行的才算 ----
const find = (s) => { const out = []; const re = new RegExp(NAME_MARK, "gm"); let m; while ((m = re.exec(s)) !== null) out.push(m[1]); return out; };
ok(JSON.stringify(find("行，改了。\n[NAME:测试狐狐]\n抬头看")) === '["测试狐狐"]', "单独一行的 [NAME:新名字] 认得出来");
ok(find("  [NAME:甲]\t").join() === "甲" && find("[NAME:甲]\r\n下一行").join() === "甲" && find("[NAME:甲]").join() === "甲",
  "那一行前后有空格、行尾是回车换行、整条回复就这一行：都算");
ok(find("想改就写 [NAME:甲]，就这样").length === 0 && find("改好了[NAME:甲]").length === 0 && find("[NAME:甲]了").length === 0 && find("`[NAME:甲]`").length === 0,
  "夹在句子里、前后挨着别的字的不算：他讲“名字怎么改”时引出来的写法不会真改名");
ok(JSON.stringify(find("[NAME：全角冒号]")) === '["全角冒号"]' && find("[name:小写]").length === 1 && find("[Name: Mr Fox ]")[0] === " Mr Fox ",
  "全角冒号、小写都认；名字里可以有空格（前后的空格交给 cleanName）");
ok(find("[NAME:甲]\n[NAME:乙]").join() === "甲,乙" && find("[NAME:甲][NAME:乙]").length === 0, "各占一行写了好几次：一个个都找得到（App 里只认最后一次）；挤在一行的不算");
ok(find("[NAME:]")[0] === "" && cleanName(find("[NAME:  ]")[0]) === "", "空的标记也摘掉，但不算改名");
ok(cleanMarkName(" 「测试狐狐」 ") === "测试狐狐" && cleanMarkName("“Mr Fox”") === "Mr Fox" && cleanMarkName("测试「狐」狐") === "测试「狐」狐" && cleanMarkName("「」") === "",
  "他在标记里给名字套了引号：剥掉最外面一层，中间的不动；只有引号的不算改名");
ok(NAME_PLACEHOLDER === "新名字" && cleanMarkName(find("写法是：\n[NAME:新名字]")[0]) === NAME_PLACEHOLDER,
  "名帖里教写法用的占位名字是“新名字”：他照抄出来的认得出是占位（App 里不当改名，原样显示）");
ok(find("[MEME:fox.jpg]").length === 0 && find("[AVATAR:fox.jpg]").length === 0 && find("NAME:没有括号").length === 0 && find("[NAME:跨\n行]").length === 0,
  "表情包、头像的标记不会被当成改名；没括号、跨行的不算");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
