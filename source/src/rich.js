// 气泡里的字怎么画：标题行、加粗、淡斜体。这里只管把一段字拆成几样，不碰 React（chat/Bubble.jsx 的 renderRich 照着画）。
// 规矩（卿卿 10 月 3 日定的）：
//   一行开头是一到六个井号、后面跟空格、再跟字：标题，加大加粗。井号后面不跟空格的（#标签）不算。
//   **加粗**：加粗（原来被认成“两边各多一个星号的斜体”）。
//   *动作*：淡斜体，原来就有，不动。***两样都要***：又粗又淡斜。
//   别的 Markdown（列表、引用、代码、链接）在气泡里不认，照原样摆：那是聊天，不是文档（文档那一页另有一套，见 MdView）。
// “不动”说的是：一段话里没有两个星号连着的、也没有标题行，拆出来的和原来线上那个画法一模一样（测试里拿原来的画法对着验）。

// 标题行：前头最多让三个空格（再多就是他特意缩进去的，不算）；井号后面至少一个空格（半角的、全角的、制表符都算）；
// 后面得有字（光一个“# ”不算）；末尾再跟一串井号的（“## 标题 ##”）不要那一串。
// 是标题就回 { level: 几个井号, text: 标题的字 }，不是回 null。
// 不写成一条正则从头配到尾：一行里要是有几千个连着的空格，那种写法要来回试上千万次，气泡每画一遍都卡一下
const HEAD = /^ {0,3}(#{1,6})[ \t\u00a0\u3000]+(?=\S)/;
const SPACE = /[ \t\u00a0\u3000]/; // 算空格的那几样
function heading(line) {
  const m = HEAD.exec(line);
  if (!m) return null;
  let text = line.slice(m[0].length).trimEnd();
  let j = text.length;
  while (text[j - 1] === "#") j--;
  if (j < text.length && SPACE.test(text[j - 1])) text = text.slice(0, j).trimEnd();
  return { level: m[1].length, text };
}

// 一行里的加粗和淡斜体，都不跨行：
//   两个星号围着的是加粗，里头可以再夹一个星号围着的（那一截又粗又斜）；
//   一个星号围着的是淡斜体，里头可以再夹两个星号围着的（那一截又粗又斜）；
//   三个星号围着的，就是“加粗，里头整个是淡斜体”，不用另写。
// 淡斜体收尾的那个星号，不能正好是一个认得成的加粗的头一个星号：那是下一个加粗的开头，不是收尾。
// （“* **苹果**：好吃”“5 * 2 = 10，**记住**”：没有这一条，前头那个零散的星号会把加粗的头一个星号吃掉，又成了“斜体、多一个星号”。）
// 只看“后面是不是紧跟着星号”不行：“*推了推眼镜***听话**”里动作收尾的星号后面也跟着星号，那个动作得照旧是淡斜体。
const BOLD = "\\*\\*(?:[^*\\n]|\\*[^*\\n]+\\*)+\\*\\*";
const MARKS = new RegExp("(" + BOLD + ")|(\\*(?:[^*\\n]|\\*\\*[^*\\n]+\\*\\*)+\\*(?!" + BOLD.slice(2) + "))", "g");
const EM_IN_BOLD = /\*[^*\n]+\*/g;
const BOLD_IN_EM = /\*\*[^*\n]+\*\*/g;
// 围着的那一截里头再拆一层。inner：去了外头星号的字；marks：认里头夹着的那一种（它两头各 n 个星号）；base：外头是哪一种
function inside(inner, marks, n, base) {
  const out = [];
  let last = 0;
  for (const m of inner.matchAll(marks)) {
    if (m.index > last) out.push({ s: inner.slice(last, m.index), ...base });
    out.push({ s: m[0].slice(n, -n), b: true, i: true });
    last = m.index + m[0].length;
  }
  if (last < inner.length) out.push({ s: inner.slice(last), ...base });
  return out;
}
// 认剩下的那一截（两对星号中间的、或者一对都没认出来的一整段）：两头要是都顶着星号，也算围起来的，哪怕中间跨了行。
// 原来线上就是这样（他把跨了两行的动作用一对星号围起来，整段是淡斜体），留着；两头各两个、各三个星号的照加粗、又粗又斜算。
// 不算围着的两种，照原样摆：整截全是星号的；头一行或者末一行是一排星号的（两个往上：他拿来当分隔线的）
function rest(seg) {
  const plain = { s: seg, b: false, i: false };
  const head = /^\*{1,3}/.exec(seg);
  const tail = /\*{1,3}$/.exec(seg);
  const n = head && tail ? Math.min(head[0].length, tail[0].length) : 0;
  if (!n || !/[^*]/.test(seg)) return plain;
  if (/^\*{2,}\n/.test(seg) || /\n\*{2,}$/.test(seg)) return plain;
  return { s: seg.slice(n, -n), b: n >= 2, i: n !== 2 };
}
// 回 [{ s: 字, b: 加不加粗, i: 是不是淡斜体 }]，照原来的次序
export function richInline(text) {
  const src = String(text || "");
  const out = [];
  let last = 0;
  for (const m of src.matchAll(MARKS)) {
    if (m.index > last) out.push(rest(src.slice(last, m.index)));
    const parts = m[1] ? inside(m[1].slice(2, -2), EM_IN_BOLD, 1, { b: true, i: false }) : inside(m[2].slice(1, -1), BOLD_IN_EM, 2, { b: false, i: true });
    for (const p of parts) out.push(p); // 不写成 push(...parts)：一截里头夹了几万样的话，那种写法会撑爆
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(rest(src.slice(last)));
  return out;
}

// 一整段字拆成一块一块：标题 { t: "h", level: 几个井号, parts }，别的 { t: "p", parts }。
// 不是标题的那几行连在一起算一块，中间的换行照留。紧挨着标题的空行不要（标题自己上下留了空）；别处的空行照留。
// 三个反引号围起来的代码里头，井号开头的是注释，不当标题。
// 认进没进代码：一行里“三个反引号”出现了单数回，就算进去（或者出来）了。
// 这样写在列表圆点后头、写在一句话后头的（“代码：```sh”）也认得；一行里自己开自己关的（“```ls``` 这样”）不算进去
export function richBlocks(text) {
  const out = [];
  if (!text) return out;
  let run = [];
  let afterHeading = false; // 前面出过标题了：这以后一段话开头的空行（就是紧挨着标题的那几行）不要
  let fenced = false; // 正在三个反引号围起来的代码里头
  const flush = (beforeHeading) => {
    if (beforeHeading) while (run.length && !run[run.length - 1].trim()) run.pop();
    if (run.length) out.push({ t: "p", parts: richInline(run.join("\n")) });
    run = [];
  };
  for (const line of String(text || "").split("\n")) {
    const h = fenced ? null : heading(line);
    if ((line.split("```").length - 1) % 2) fenced = !fenced;
    if (h) {
      flush(true);
      out.push({ t: "h", level: h.level, parts: richInline(h.text) });
      afterHeading = true;
      continue;
    }
    if (afterHeading && !run.length && !line.trim()) continue;
    run.push(line);
  }
  flush(false);
  return out;
}

// 只要字的地方（历史对话里那一行预览、对话的名字）：就是气泡里摆出来的那些字，一块一行。
// 当了记号的井号、星号不带；没当记号的（#标签、零散的星号、代码里的注释）照留。
// 横幅上的字也是这一套：小后端（supabase/push_function.ts 的 plainOf）里照着另写了一份（它引不了这个文件）。
// 这里的规矩改了，那边得跟着改：tests/mail.test.mjs 拿几万条字两边各认一遍，对不上就不过
export function plainOf(text) {
  return richBlocks(text)
    .map((b) => b.parts.map((p) => p.s).join(""))
    .join("\n");
}
