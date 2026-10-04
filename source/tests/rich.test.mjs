// 气泡里的字：标题行、加粗、淡斜体（src/rich.js）
import { richInline, richBlocks, plainOf } from "../src/rich.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const J = (x) => JSON.stringify(x);
const T = (s) => ({ s, b: false, i: false }); // 平常的字
const B = (s) => ({ s, b: true, i: false }); // 加粗
const I = (s) => ({ s, b: false, i: true }); // 淡斜体
const BI = (s) => ({ s, b: true, i: true }); // 又粗又淡斜
const same = (a, b) => J(a) === J(b);
// 随机数（mulberry32）：给一个种子，回一个“掷 n 面骰子”的函数。种子一样，掷出来的一样
const dice = (seed) => {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
};

// 原来线上的那个画法（只认一个星号的淡斜体），留在这儿当对照：没有两个星号连着的话，新的得和它一模一样
const old = (text) =>
  text
    .split(/(\*[^*\n]+\*)/g)
    .filter((p) => p !== "")
    .map((p) => (p.length > 2 && p.startsWith("*") && p.endsWith("*") ? I(p.slice(1, -1)) : T(p)));

// ---- 一行里的加粗和淡斜体 ----
ok(same(richInline("今天风很大"), [T("今天风很大")]) && same(richInline(""), []) && same(richInline(null), []) && same(richInline(undefined), []), "平常的话：原样一段；空的什么都没有");
ok(same(richInline("*推了推眼镜*"), [I("推了推眼镜")]) && same(richInline("好。*抬头看你* 说吧"), [T("好。"), I("抬头看你"), T(" 说吧")]), "一个星号围起来的：淡斜体，和原来一样");
ok(same(richInline("**要紧的**"), [B("要紧的")]) && same(richInline("这句**要紧**，别忘"), [T("这句"), B("要紧"), T("，别忘")]), "两个星号围起来的：加粗，两边不再各剩一个星号");
ok(same(richInline("***又粗又斜***"), [BI("又粗又斜")]) && same(richInline("a***b***c"), [T("a"), BI("b"), T("c")]), "三个星号围起来的：又粗又淡斜");
ok(same(richInline("前**粗**中*斜*后***都要***完"), [T("前"), B("粗"), T("中"), I("斜"), T("后"), BI("都要"), T("完")]), "三样混在一句里：各认各的，次序不乱");
ok(same(richInline("**粗一****粗二**"), [B("粗一"), B("粗二")]) && same(richInline("*斜一**斜二*"), [I("斜一"), I("斜二")]), "两段挨着：各算各的");
ok(same(richInline("**没关上"), [T("**没关上")]) && same(richInline("没开头**"), [T("没开头**")]) && same(richInline("****"), [T("****")]) && same(richInline("**"), [T("**")]) && same(richInline("* *"), [I(" ")]),
  "没关上的、里面空着的：当平常的字，星号照摆");
ok(same(richInline("**甲**\n**乙**"), [B("甲"), T("\n"), B("乙")]) && same(richInline("*甲*\n*乙*"), [I("甲"), T("\n"), I("乙")]) && same(richInline("开头 *没关上\n下一行* 结尾"), [T("开头 *没关上\n下一行* 结尾")]),
  "一行一段的各认各的，中间的换行留着；星号在话中间开了头、到下一行才关上的：不认");
// 一整段两头顶着星号、中间跨了行：也算围起来的（原来线上一个星号的就是这样：他把两行的动作围在一对星号里，整段淡斜体）
ok(same(richInline("*走过去\n把窗关上*"), [I("走过去\n把窗关上")]) && same(richInline("*走过去\n把窗关上*"), old("*走过去\n把窗关上*")), "一对星号围着两行：整段淡斜体，和原来一样");
ok(same(richInline("**头一行\n第二行**"), [B("头一行\n第二行")]) && same(richInline("***头一行\n第二行***"), [BI("头一行\n第二行")]), "两对、三对星号围着两行：加粗、又粗又斜（原来是“斜体、两头各剩一个星号”）");
ok(same(richInline("**头一行\n第二行*"), [I("*头一行\n第二行")]) && same(richInline("*甲\n*乙\n丙*"), [I("甲\n*乙\n丙")]) && same(richInline("*甲*\n*乙\n丙*"), [I("甲"), T("\n*乙\n丙*")]) && same(richInline("*甲*\n*乙\n丙*"), old("*甲*\n*乙\n丙*")),
  "两头的星号不一样多：照少的那一头算，多出来的星号留在字里；中间零散的星号照摆；认剩下的那一截得是两头都顶着星号");
ok(same(richInline("*甲**\n乙\n**丙*"), [I("甲"), I("\n乙\n"), I("丙")]) && same(richInline("*甲**\n乙\n**丙*"), old("*甲**\n乙\n**丙*")), "两对星号中间夹着的那一截，两头也顶着星号：一样认（和原来一样）");
ok(same(richInline("****甲\n乙****"), [BI("*甲\n乙*")]) && same(richInline("****甲****"), [T("*"), BI("甲"), T("*")]), "两头各四个星号：最多认三个，多出来的照摆（一行的、跨行的一个算法）");
ok([1, 2, 3, 4, 5, 6, 7, 10, 40].every((k) => same(richInline("*".repeat(k)), [T("*".repeat(k))])) && same(richInline("上面\n**********\n下面"), [T("上面\n**********\n下面")]),
  "一排星号（他拿来当分隔线的）：不管几个，照原样摆");
ok(same(richInline("*****"), [T("*****")]) && same(richInline("***"), [T("***")]) && same(richInline("* 第一项\n* 第二项"), [T("* 第一项\n* 第二项")]) && same(richInline("第一行*\n*第二行"), [T("第一行*\n*第二行")]),
  "全是星号的、只有开头顶着星号的（列表）、星号在中间的：不认");
ok(same(richInline("2*3*4"), old("2*3*4")) && same(richInline("* 列表似的一行"), [T("* 列表似的一行")]) && same(richInline("a * b * c"), old("a * b * c")), "乘号、列表那种单个的星号：和原来怎么认的一样");
ok(same(richInline("**甲*乙**"), [T("*"), I("甲"), T("乙**")]), "加粗里头又夹了一个星号（写岔了）：不出错，认得出几样算几样");
ok(richInline("**a**").length === 1 && richInline("x".repeat(5000) + "**y**")[1].b === true, "很长的一段：照认");
// 连着认两遍，结果一样（里头那个正则是带着位置走的，上一回走到哪不能带到下一回）
ok(same(richInline("**甲**乙"), richInline("**甲**乙")) && same(richInline("乙**甲**"), [T("乙"), B("甲")]) && same(richInline("**甲**"), [B("甲")]), "连着认几遍：每一遍都从头认");

// 没有两个星号连着的：和原来线上的画法一模一样（随便拼的两万句）
{
  const seed = 20261004;
  const rnd = dice(seed);
  const bits = ["*", "*", "字", "a", " ", "\n", "，", "#", "1"];
  let bad = "";
  let n = 0;
  for (let k = 0; k < 20000 && !bad; k++) {
    let s = "";
    const len = 1 + rnd(14);
    for (let j = 0; j < len; j++) s += bits[rnd(bits.length)];
    if (s.includes("**")) continue;
    n++;
    if (!same(richInline(s), old(s))) bad = s;
  }
  ok(!bad && n > 5000, `没有两个星号连着的 ${n} 句随便拼的话：和原来线上的画法一模一样${bad ? "（对不上的：" + J(bad) + "）" : ""}`);
}
// 拆完再拼回去，字一个不少（去掉的只有那几对星号）
{
  const seed = 7;
  const rnd = dice(seed);
  const bits = ["*", "*", "*", "字", "a", " ", "\n"];
  let bad = "";
  for (let k = 0; k < 20000 && !bad; k++) {
    let s = "";
    const len = 1 + rnd(16);
    for (let j = 0; j < len; j++) s += bits[rnd(bits.length)];
    const back = richInline(s).map((p) => { const w = (p.b && p.i ? "***" : p.b ? "**" : p.i ? "*" : ""); return w + p.s + w; }).join("");
    if (back !== s) bad = s;
  }
  ok(!bad, `随便拼的两万句（星号一个、两个、三个连着的都有）：拆完把星号补回去，和原来的字一个不差${bad ? "（对不上的：" + J(bad) + "）" : ""}`);
}

// ---- 标题行 ----
const H = (level, ...parts) => ({ t: "h", level, parts });
const P = (...parts) => ({ t: "p", parts });
ok(same(richBlocks("# 今天的打算"), [H(1, T("今天的打算"))]) && same(richBlocks("今天风很大"), [P(T("今天风很大"))]) && same(richBlocks(""), []) && same(richBlocks(null), []), "一行井号开头、后面跟空格：标题；平常的话照旧是一段；空的什么都没有");
ok([1, 2, 3, 4, 5, 6].every((n) => same(richBlocks("#".repeat(n) + " 标题"), [H(n, T("标题"))])) && same(richBlocks("####### 七个井号"), [P(T("####### 七个井号"))]), "一到六个井号都算标题，几个井号就是第几级；七个不算");
ok(same(richBlocks("#标签"), [P(T("#标签"))]) && same(richBlocks("#1 名"), [P(T("#1 名"))]) && same(richBlocks("##没空格"), [P(T("##没空格"))]), "井号后面不跟空格的（#标签、#1）：不算标题，照原样摆");
ok(same(richBlocks("# "), [P(T("# "))]) && same(richBlocks("#"), [P(T("#"))]) && same(richBlocks("#   "), [P(T("#   "))]) && same(richBlocks("##"), [P(T("##"))]), "光有井号、后面没字：不算标题");
ok(same(richBlocks(" # 一个空格"), [H(1, T("一个空格"))]) && same(richBlocks("   ## 三个空格"), [H(2, T("三个空格"))]) && same(richBlocks("    # 四个空格"), [P(T("    # 四个空格"))]) && same(richBlocks("\t# 制表符"), [P(T("\t# 制表符"))]),
  "井号前头最多让三个空格；缩进得更深的不算标题");
ok(same(richBlocks("#\t制表符隔开"), [H(1, T("制表符隔开"))]) && same(richBlocks("#    好几个空格"), [H(1, T("好几个空格"))]) && same(richBlocks("# 末尾有空格   "), [H(1, T("末尾有空格"))]), "井号和字中间隔着制表符、好几个空格：都算；标题两头的空白不要");
ok(same(richBlocks("## 标题 ##"), [H(2, T("标题"))]) && same(richBlocks("# 标题 #####  "), [H(1, T("标题"))]) && same(richBlocks("# 学 C#"), [H(1, T("学 C#"))]) && same(richBlocks("# C# 入门"), [H(1, T("C# 入门"))]) && same(richBlocks("# a#b"), [H(1, T("a#b"))]),
  "标题末尾另跟一串井号的（## 标题 ##）：那一串不要；字里头自己带的井号（C#）留着");
ok(same(richBlocks("# ###"), [H(1, T("###"))]) && same(richBlocks("# a ## b ##"), [H(1, T("a ## b"))]) && same(richBlocks("# 标题\t##"), [H(1, T("标题"))]) && same(richBlocks("# 标题##"), [H(1, T("标题##"))]),
  "标题末尾那一串井号：前头隔着空格才算收尾的；整个标题就是一串井号的，照字摆");
{
  // 一行里几万个连着的空格：也是一眨眼的事（气泡每画一遍都要认一回）
  const long = "# 标题" + " ".repeat(60000) + "尾巴" + " ".repeat(60000) + "## ";
  const t0 = Date.now();
  const got = richBlocks(long + "\n" + "*".repeat(30000) + "字" + " ".repeat(30000) + "*\n" + "#".repeat(40000) + "\n" + "*".repeat(40000) + "字");
  const plain = plainOf(long);
  const took = Date.now() - t0;
  ok(got.length === 2 && got[0].t === "h" && got[0].parts[0].s === "标题" + " ".repeat(60000) + "尾巴" && plain === "标题" + " ".repeat(60000) + "尾巴" && took < 300, `一行里夹着几万个连着的空格、星号、井号：照认，不卡（${took} 毫秒）`);
}
ok(same(richBlocks("这不是 # 标题"), [P(T("这不是 # 标题"))]) && same(richBlocks("1. # 也不是"), [P(T("1. # 也不是"))]), "井号不在一行开头：不算标题");
ok(same(richBlocks("# **要紧的** 和 *小动作*"), [H(1, B("要紧的"), T(" 和 "), I("小动作"))]), "标题里的加粗、淡斜体照认");
ok(same(richBlocks("开头一句\n# 标题\n正文\n再一行"), [P(T("开头一句")), H(1, T("标题")), P(T("正文\n再一行"))]), "标题夹在话中间：前后的话各成一段，段里的换行照留");
ok(same(richBlocks("开头\n\n# 标题\n\n正文"), [P(T("开头")), H(1, T("标题")), P(T("正文"))]) && same(richBlocks("开头\n\n\n# 标题\n\n\n正文"), [P(T("开头")), H(1, T("标题")), P(T("正文"))]),
  "紧挨着标题的空行不要（标题自己上下留了空），空几行都一样");
ok(same(richBlocks("甲\n\n乙\n# 标题\n丙\n\n丁"), [P(T("甲\n\n乙")), H(1, T("标题")), P(T("丙\n\n丁"))]), "不挨着标题的空行照留");
ok(same(richBlocks("# 一\n## 二\n### 三"), [H(1, T("一")), H(2, T("二")), H(3, T("三"))]) && same(richBlocks("# 一\n\n## 二"), [H(1, T("一")), H(2, T("二"))]), "几个标题连着：一行一个，中间的空行不另占地方");
ok(same(richBlocks("# 标题\n"), [H(1, T("标题"))]) && same(richBlocks("# 标题\n\n\n"), [H(1, T("标题"))]) && same(richBlocks("\n\n# 标题"), [H(1, T("标题"))]) && same(richBlocks("正文\n\n"), [P(T("正文\n\n"))]),
  "标题前后只有空行：就一个标题；没有标题的话，末尾的空行照原样（和原来一样）");
ok(same(richBlocks("**跨着\n# 标题\n关上**"), [P(T("**跨着")), H(1, T("标题")), P(T("关上**"))]), "加粗跨不过标题那一行");
// 没有标题行的话：就是一整段，和单认那一行的结果一样（随便拼的）
{
  const seed = 99;
  const rnd = dice(seed);
  const bits = ["*", "字", "a", " ", "\n", "#", "#标", "。"];
  let bad = "";
  let n = 0;
  for (let k = 0; k < 20000 && !bad; k++) {
    let s = "";
    const len = 1 + rnd(14);
    for (let j = 0; j < len; j++) s += bits[rnd(bits.length)];
    if (s.split("\n").some((l) => /^ {0,3}#{1,6}[ \t]/.test(l))) continue;
    n++;
    if (!same(richBlocks(s), [P(...richInline(s))])) bad = s;
  }
  ok(!bad && n > 5000, `没有标题行的 ${n} 句随便拼的话：都是一整段，字、换行一样不少${bad ? "（对不上的：" + J(bad) + "）" : ""}`);
}

// ---- 只要字的地方（历史对话里那一行预览） ----
ok(plainOf("# 今天的打算\n**先**吃饭，*伸懒腰*") === "今天的打算\n先吃饭，伸懒腰" && plainOf("## 标题 ##") === "标题", "预览：标题行开头的井号去掉，星号去掉");
ok(plainOf("#标签 留着") === "#标签 留着" && plainOf("学 C# 的第 # 天") === "学 C# 的第 # 天" && plainOf("# ") === "# ", "预览：不是标题的井号留着");
ok(plainOf("") === "" && plainOf(null) === "" && plainOf("平常的话") === "平常的话" && plainOf("甲\n\n乙") === "甲\n\n乙", "预览：平常的话原样，空的还是空的");
{
  const seed = 5;
  const rnd = dice(seed);
  const bits = ["*", "字", "a", " ", "\n", "#标", "。"];
  let bad = "";
  for (let k = 0; k < 5000 && !bad; k++) {
    let s = "";
    const len = 1 + rnd(14);
    for (let j = 0; j < len; j++) s += bits[rnd(bits.length)];
    if (plainOf(s) !== s.replace(/\*/g, "")) bad = s;
  }
  ok(!bad, `预览：没有标题行的五千句随便拼的话，和原来线上的做法（只去星号）一样${bad ? "（对不上的：" + J(bad) + "）" : ""}`);
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
