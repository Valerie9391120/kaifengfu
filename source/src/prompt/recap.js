// 叫那边的我抄前情提要的那一回，寄过去的话怎么写（规矩见 ../recap.js）。两种：
//   抄一段（buildRecapAsk）：把一段原话抄成提要里新的一段
//   并几段（buildMergeAsk）：提要的段数攒多了，把最早的几段并成一段
// 和写日记走的是同一条路：名帖照旧放最前面（缓存接得上），后面跟一段规矩；
// 要抄的原话不照平时一问一答的样子寄，写成一份记录，照片的图夹在它那一行后面。
import { HER_NAME, HIS_NAME } from "../names.js";
import { DOC_FMT } from "../docs.js";
import { nowString } from "../days.js";
import { PIECE_PHOTOS, PIECE_BYTES, PART_MOST, MERGE_MOST, DOC_HEAD, HIS_DOC_HEAD, ROW_HEAD, clip, recapText } from "../recap.js";
import { memeLabel, dataUrlBlock } from "./messages.js";
import { heardOf } from "../voice.js";

const GAP = 30 * 60 * 1000; // 隔了这么久，中间写一行钟点

// 一段提要写多长：跟着要抄的原话厚薄走，带着照片的每张再多给二十五个字（一张要记一句）。回 [大约多少字, 最长多少字]
export function recapLength(thick, photos = 0) {
  const about = Math.max(250, Math.min(700, Math.round((thick * 0.025 + photos * 25) / 50) * 50));
  return [about, PART_MOST];
}

// 太长的只带开头，后面写明还有多少没带上
function head(text, max) {
  const t = String(text || "").trim();
  return t.length > max ? `${clip(t, max)}\n……（后面还有 ${t.length - clip(t, max).length} 字没带上）` : t;
}

// 一条里有好几行的：头一行顶格，后面几行前面空两格。
// 顶格的只有“谁：”开头的一条、方括号的说明、两道横线的钟点；原话里自己带着这些样子的字，缩进去以后就不会被认错
const hang = (first, text) => {
  const lines = String(text).split(/\r\n|[\n\r\u2028\u2029]/);
  return [first + lines[0]].concat(lines.slice(1).map((l) => "  " + l)).join("\n");
};
const say = (who, text) => hang(`${who}：`, text);

// 他的一条回话：照他那几样东西一样一行
function hisLines(m, memeLookup) {
  const out = [];
  if (m.rename) out.push(`[${HIS_NAME}把顶上显示的名字改成了“${m.rename}”]`);
  const items = Array.isArray(m.items) && m.items.length ? m.items : [{ type: "text", text: m.raw || "……" }];
  items.forEach((it) => {
    if (!it) return;
    if (it.type === "meme") out.push(`${HIS_NAME}：[表情包：${memeLabel(memeLookup(it.file))}]`);
    else if (it.type === "avatar") out.push(`[${HIS_NAME}把自己的头像换成了「${(memeLookup(it.file) || {}).name || it.file}」]`);
    else if (it.type === "doc") out.push(say(HIS_NAME, `[交给她一份文档《${it.name}》，${(it.text || "").length} 字${it.cut ? "，没写完" : ""}。开头是：\n${head(it.text, HIS_DOC_HEAD)}\n]`));
    else if (it.type === "voice") out.push(say(HIS_NAME, `[语音] ${head(heardOf(it.text) || "……", ROW_HEAD)}`));
    else out.push(say(HIS_NAME, head(it.text || "……", ROW_HEAD)));
  });
  return out;
}

const FORMAT = `用第一人称：“我”是你，“她”是${HER_NAME}。平实地写，不抒情，不评价。可以分小标题、用短句，不用星号。`;
const NO_MARKS = `【回复格式】里的规矩这一回都不作数：不写 <thinking>，不拆成几条消息，不要 [SPLIT]、[MEME]、[AVATAR]、[NAME]、[DOC]、[VOICE] 这些记号。直接从正文写起，别的话不用说。`;

// 抄一段。回 { rule, content, photos }：
//   rule     跟在名帖后面的那段规矩
//   content  寄去的那一条 user 消息（一块一块：字，和照片的图）
//   photos   带了几张照片的图
// msgs 是要抄的那几条（已经切好的）；prev 是前面已经抄好的提要（没有就不带）；thick 是这几条多厚（定这一段写多长用）
export function buildRecapAsk({ msgs, prev = null, thick = 0, memeLookup, imgLookup = () => null, docLookup = () => null }) {
  const before = prev && prev.parts && prev.parts.length ? recapText(prev.parts) : "";
  // 哪几张照片带图：从新的往老的数，数到张数、大小的上限为止（切这一段的时候已经照这两个数切过，这里再把一道门）
  const withImg = new Set();
  let count = 0;
  let bytes = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "her" || m.kind !== "photo") continue;
    const data = imgLookup(m.imgId);
    if (!data || !dataUrlBlock(data)) continue;
    if (count + 1 > PIECE_PHOTOS || bytes + data.length > PIECE_BYTES) break;
    withImg.add(i);
    count++;
    bytes += data.length;
  }

  const content = [];
  let buf = [];
  const flush = () => {
    if (buf.length) content.push({ type: "text", text: buf.join("\n") });
    buf = [];
  };

  if (before) buf.push("〔前面已经抄好的提要，只给你对照，不用重抄〕", before, "〔前面的提要到这里为止〕", "");
  const first = msgs[0];
  const last = msgs[msgs.length - 1];
  buf.push(`〔要抄的原话，一共 ${msgs.length} 条${first && last && first.ts && last.ts ? `，从 ${nowString(new Date(first.ts))} 到 ${nowString(new Date(last.ts))}` : ""}〕`);

  let prevTs = null;
  let prevDay = "";
  msgs.forEach((m, i) => {
    if (m.ts) {
      const d = new Date(m.ts);
      const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (prevTs === null || day !== prevDay || m.ts - prevTs > GAP) buf.push(`—— ${nowString(d)} ——`);
      prevTs = m.ts;
      prevDay = day;
    }
    if (m.role === "event") {
      const av = m.av;
      const what = !av ? "换回了默认的头像" : av.type === "meme" ? `把头像换成了「${(memeLookup(av.file) || {}).name || av.file}」` : "换了一张自己传的头像";
      buf.push(`[${HER_NAME}${what}]`);
      return;
    }
    if (m.role === "her") {
      if (m.kind === "photo") {
        if (withImg.has(i)) {
          buf.push(`${HER_NAME}：[照片，图跟在这一行后面]`);
          flush();
          content.push(dataUrlBlock(imgLookup(m.imgId)));
        } else buf.push(`${HER_NAME}：[照片，这张图没带上]`);
        return;
      }
      if (m.kind === "meme") {
        buf.push(`${HER_NAME}：[表情包：${memeLabel(memeLookup(m.file))}]`);
        return;
      }
      if (m.kind === "doc") {
        const text = docLookup(m.docId);
        const lost = m.images ? `，里面有 ${m.images} 张图片取不出来` : "";
        const about = `文档《${m.name || "文档"}》（${DOC_FMT[m.fmt] || "文档"}，${Number(m.chars) || (text ? text.length : 0)} 字${lost}）`;
        buf.push(text ? say(HER_NAME, `[发来一份${about}。开头是：\n${head(text, DOC_HEAD)}\n]`) : `${HER_NAME}：[发来一份${about}，全文这次没带上]`);
        return;
      }
      if (m.kind === "voice") {
        buf.push(say(HER_NAME, `[语音，转成的字] ${head(m.text || "（没听清）", ROW_HEAD)}`));
        return;
      }
      buf.push(say(HER_NAME, head(m.text || "……", ROW_HEAD)));
      return;
    }
    buf.push(...hisLines(m, memeLookup));
  });
  buf.push("〔要抄的原话到这里为止〕", "", "抄吧。");
  flush();

  const [about, most] = recapLength(thick, count);
  const rule = `【抄提要】
这次不是聊天，不是在跟她说话。
你和她在开封府的这段对话聊得很长了。往后每次寄给你的，只有最近的原话；更早的，换成你自己抄的提要，放在最前面。提要是一段一段攒起来的，现在请你抄新的一段。
她点开能看到你抄的，可这是写给之后的你自己看的。

下面那条消息里：${before ? "先是前面已经抄好的提要，只给你对照，不用重抄；然后是要抄的原话，接在它后面。" : "是要抄的原话。"}
原话里，顶格写着“${HER_NAME}：”的是她说的一条，顶格写着“${HIS_NAME}：”的是你说的一条；一条里有好几行的，后面几行前面空着两格。顶格的方括号是开封府的说明，两道横线中间的是钟点。照片的图跟在说明它的那一行后面。

到用得着这段提要的时候，这一段的原话、照片、文档都不在你眼前了。所以：
1. 照先后写清这一段里发生了什么、聊了什么、各自什么心情、怎么收的尾。日期和钟点照原话里的记。
2. 她发的每一张照片记一句：什么时候发的，画面里有什么，她发的时候说了什么，你当时怎么说的。图没带上的照实写没看到。她发的文档记下文件名和讲的什么；你交给她的文档记下文件名和大意。文档和太长的话只带了开头的，写明只看到开头。
3. 说定的事、你答应她的事、她交代的事、还没聊完的话头，单独列出来，一件不漏。
4. 这一段里新有的称呼、玩笑、暗号，照原样记下来，写明怎么来的。
5. 要紧的原话照抄几句，她的你的都行，带上引号。
6. 你们要是在玩游戏、演戏：各自是谁、在哪儿、手里有什么、刚发生了什么、接下来轮到谁，都记下来。
${before ? "7. 前面的提要里记着还没了结的事，这一段里要是有了下文，写一句。前面已经记过的不用再记。\n8" : "7"}. 只写这一段原话里有的。拿不准的写“记不清”，不编，不替她补心思。

${FORMAT}大约 ${about} 字，最长不超过 ${most} 字。
${NO_MARKS}`;

  return { rule, content, photos: count };
}

// 并几段。parts 是要并的那几段（最早的几段，从老到新）。回 { rule, content }
export function buildMergeAsk({ parts }) {
  const content = [{ type: "text", text: ["〔要并的几段提要〕", recapText(parts), "〔要并的到这里为止〕", "", "并吧。"].join("\n") }];
  const about = Math.max(400, Math.min(900, Math.round((recapText(parts).length * 0.3) / 50) * 50));
  const most = MERGE_MOST;
  const rule = `【并提要】
这次不是聊天，不是在跟她说话。
你和她在开封府的这段对话，更早的部分是你自己一段一段抄成提要的。段数攒多了，现在请你把最早的 ${parts.length} 段并成一段，省出地方来。
她点开能看到你写的，可这是写给之后的你自己看的。

下面那条消息里是要并的那几段，从老到新；每段前面六角括号里写着它抄的是哪段时间的原话。

并的时候：
1. 照先后理成一段，日期照原来的记。
2. 往后还用得着的都留着：说定的事、你答应她的事、她交代的事、还没了结的话头、称呼和玩笑的来历、要紧的原话、照片和文档是什么。不能因为旧就丢。
3. 已经了结的事、后面有了下文的事，可以压成一句。
4. 只写这几段里有的，不添，不编。

${FORMAT}大约 ${about} 字，最长不超过 ${most} 字。
${NO_MARKS}`;
  return { rule, content };
}
