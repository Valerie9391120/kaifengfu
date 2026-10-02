// =====================================================
// 昵称
// 她的：账户面板最上面的名字后面有一支钢笔，点了自己改。
// 他的：他自己做主，在回复里单独一行写 [NAME:新名字]（跟换头像的 [AVATAR:文件名] 一个路子）。
// 只换两处的显示：账户面板的标题（她的）、聊天窗口顶栏（他的）。
// 日记本、聊天摘录、各处提示里写的还是“卿卿”“光义”，不跟着变。
// 两个名字各存一条，跟着云端走；没存就是默认的。
// =====================================================

export const HER_NAME = "卿卿";
export const HIS_NAME = "光义";
export const NAME_KEYS = { her: "kfs2:name:her", him: "kfs2:name:guangyi" };

// 最长十二个汉字那么宽：汉字、表情占两格，英文和数字占一格，一共二十四格
export const NAME_ROOM = 24;

// 他回复里的改名标记：要独占一行才算（前后只许有空格）。夹在句子里的不算，原样当字显示，
// 这样他给她讲“名字怎么改”、把写法引出来的时候，不会真把名字改了。
// 写成字符串，App.jsx 里和表情包、头像的标记拼成一条正则；用的时候要带 m 标志（^ 和 $ 按行算）。
// 括号里抓到的是新名字，还没收拾过
export const NAME_MARK = "^[ \\t]*\\[(?:NAME|Name|name)[:：]([^\\[\\]\\n]*)\\][ \\t]*$";

// 名帖后面教他写法时用来占位的名字。他照抄出来的 [NAME:新名字] 不算改名，原样当字显示
export const NAME_PLACEHOLDER = "新名字";

// 按“看得见的一个字”切开：一个表情哪怕由好几个码位拼成，也算一个
function pieces(s) {
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      return Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(s), (x) => x.segment);
    }
  } catch (e) {}
  return Array.from(s);
}

const widthOf = (g) => (/[\u1100-\uffff]|[\ud800-\udfff]/.test(g) ? 2 : 1);

// 收拾一下：方括号留给标记用，换行和多余的空白收成一个空格，看不见的控制符去掉。不截长短
export function tidyName(raw) {
  return String(raw == null ? "" : raw)
    .replace(/[\[\]\r\n\t\u2028\u2029]/g, " ")
    .replace(/[\u0000-\u001f\u007f\u200b\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 他在标记里写的名字：有时会顺手套一层引号、书名号，剥掉最外面那一层再收拾
export function cleanMarkName(raw) {
  return cleanName(String(raw == null ? "" : raw).trim().replace(/^[「『“‘"'《]+/, "").replace(/[」』”’"'》]+$/, ""));
}

// 能用的昵称：收拾过，超出二十四格的截掉。空的返回 ""
export function cleanName(raw) {
  let room = NAME_ROOM;
  let out = "";
  for (const g of pieces(tidyName(raw))) {
    const w = widthOf(g);
    if (w > room) break;
    out += g;
    room -= w;
  }
  return out.trim();
}
