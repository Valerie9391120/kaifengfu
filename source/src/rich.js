// 气泡里的字怎么画：标题行、加粗、淡斜体。这里只管把一段字拆成几样，不碰 React（App.jsx 的 renderRich 照着画）。
// 规矩（卿卿 10 月 3 日定的）：
//   一行开头是一到六个井号、后面跟空格、再跟字：标题，加大加粗。井号后面不跟空格的（#标签）不算。
//   **加粗**：加粗（原来被认成“两边各多一个星号的斜体”）。
//   *动作*：淡斜体，原来就有，不动。***两样都要***：又粗又淡斜。
//   别的 Markdown（列表、引用、代码、链接）在气泡里不认，照原样摆：那是聊天，不是文档（文档那一页另有一套，见 MdView）。

// 标题行：前头最多让三个空格（再多就是他特意缩进去的，不算）；井号后面至少一个空格；
// 后面得有字（光一个“# ”不算）；末尾再跟一串井号的（“## 标题 ##”）不要那一串
const HEADING = /^ {0,3}(#{1,6})[ \t]+(\S.*?)(?:[ \t]+#+)?[ \t]*$/;

// 一行（或者连着的几行）里的加粗和淡斜体。回 [{ s: 字, b: 加不加粗, i: 是不是淡斜体 }]，照原来的次序。
// 星号里面不能再有星号、不能跨行；三个的先认，再认两个的，最后认一个的
const MARKS = /\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|\*[^*\n]+\*/g;
// 认剩下的那一截（两对星号中间的、或者一对都没认出来的一整段）：两头要是都顶着星号，也算围起来的，哪怕中间跨了行。
// 原来线上就是这样（他把跨了两行的动作用星号围起来，整段是淡斜体），留着；两头各两个、各三个星号的照加粗、又粗又斜算
function rest(seg) {
  const head = /^\*{1,3}/.exec(seg);
  const tail = /\*{1,3}$/.exec(seg);
  const n = head && tail ? Math.min(head[0].length, tail[0].length) : 0;
  if (!n || seg.length <= 2 * n) return { s: seg, b: false, i: false };
  return { s: seg.slice(n, -n), b: n >= 2, i: n !== 2 };
}
export function richInline(text) {
  const src = String(text || "");
  const out = [];
  let last = 0;
  let m;
  MARKS.lastIndex = 0;
  while ((m = MARKS.exec(src)) !== null) {
    if (m.index > last) out.push(rest(src.slice(last, m.index)));
    const tok = m[0];
    const n = tok.startsWith("***") ? 3 : tok.startsWith("**") ? 2 : 1;
    out.push({ s: tok.slice(n, -n), b: n >= 2, i: n !== 2 });
    last = MARKS.lastIndex;
  }
  if (last < src.length) out.push(rest(src.slice(last)));
  return out;
}

// 一整段字拆成一块一块：标题 { t: "h", level: 几个井号, parts }，别的 { t: "p", parts }。
// 不是标题的那几行连在一起算一块，中间的换行照留。紧挨着标题的空行不要（标题自己上下留了空）；别处的空行照留
export function richBlocks(text) {
  const out = [];
  if (!text) return out;
  let run = [];
  let afterHeading = false;
  const flush = (beforeHeading) => {
    if (beforeHeading) while (run.length && !run[run.length - 1].trim()) run.pop();
    if (run.length) out.push({ t: "p", parts: richInline(run.join("\n")) });
    run = [];
  };
  for (const line of String(text || "").split("\n")) {
    const m = HEADING.exec(line);
    if (m) {
      flush(true);
      out.push({ t: "h", level: m[1].length, parts: richInline(m[2]) });
      afterHeading = true;
      continue;
    }
    if (afterHeading && !run.length && !line.trim()) continue;
    run.push(line);
    afterHeading = false;
  }
  flush(false);
  return out;
}

// 只要字的地方（历史对话里那一行预览）：星号去掉，标题行开头的井号去掉
export function plainOf(text) {
  return String(text || "")
    .split("\n")
    .map((line) => {
      const m = HEADING.exec(line);
      return m ? m[2] : line;
    })
    .join("\n")
    .replace(/\*/g, "");
}
