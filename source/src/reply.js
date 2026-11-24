// =====================================================
// 拆他的回话：心里话、一条一条的话、表情包、换头像、改名字、文档块、画（见 draw.js）。
// 不碰页面，测试在 Node 里跑。
// 通知的小后端（supabase/push_function.ts 的 bubblesOf）照同一套规矩决定敲几条横幅、各写什么（一个气泡一条）：
// 这里改了规矩，那边得跟着改。tests/mail.test.mjs 拿同一批回话两边各拆一遍，对不上就不过。
// =====================================================
import { NAME_MARK, NAME_PLACEHOLDER, cleanMarkName } from "./names.js";
import { splitDocBlocks, DOC_NAME_PLACEHOLDER } from "./docs.js";
import { splitVoice } from "./voice.js";
import { splitAskBlocks, askRaw } from "./ask.js";
import { splitDraw } from "./draw.js";

// 语音里不留 [VOICE] 这几个字：摘到没有为止（摘掉一个，两头拼起来可能又成了一个，像 [VOI[VOICE]CE]）。
// 从头往后一个字一个字地收，收进来的末尾正好是一个，就把它扔掉：和一遍一遍摘到没有的结果一样，只走一趟（不来回试）。
// 通知的小后端（push_function.ts 的 bubblesOf）照同一个办法摘：改一边要跟着改另一边
const TOKENS = ["[VOICE]", "[Voice]", "[voice]"];
export function untoken(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    out.push(text[i]);
    if (text[i] === "]" && out.length >= 7 && TOKENS.includes(out.slice(-7).join(""))) out.length -= 7;
  }
  return out.join("");
}

// 按 [SPLIT] 切成一条一条，记号两头的空白不要。
// 出来的东西和 text.split(/\s*\[SPLIT\]\s*/) 一样，只是不让正则在一长串空白上来回试（几万个连着的空行能把手机卡住好几秒）
export function splitTurns(text) {
  const chunks = String(text).split("[SPLIT]");
  return chunks.map((chunk, i) => {
    let s = chunk;
    if (i > 0) s = s.trimStart();
    if (i < chunks.length - 1) s = s.trimEnd();
    return s;
  });
}

// 他打电话的记号（卿卿 10 月 14 日 17:26 定的，见开发说明“他打给她”）：一行开头写 [CALL]，
// 后面的（同一行跟着的字、下面几行、连着 [SPLIT] 隔开的，到这一段字完为止）是她接起来他先说的话。
// 一段字（文档块外头的）里只认头一个。回 [记号前面的, 记号后面的]；没有就是 null。
// 通知的小后端（push_function.ts 的 splitCall）照同一个办法认：改一边要跟着改另一边
const CALL_MARK = /^[ \t]*\[(?:CALL|Call|call)\][ \t]*/m;
export function splitCall(text) {
  const m = CALL_MARK.exec(String(text));
  if (!m) return null;
  return [text.slice(0, m.index), text.slice(m.index + m[0].length)];
}

// 他定下回几点醒的记号（狐宇宙，卿卿 10 月 20 日 13:19 定的“唤醒时间都可以由你自己来决定”，见 fox.js）：
// 单独一行写 [WAKE:…]（+3h、+40m、07:30、off），连着那一行的换行一起摘掉，不显示成字；写了好几回只认最后一回。
// 平常的对话里还能带一句他自己记着的话（任务标记，[WAKE:+1h 去找卿卿]），所以里头最长认八十个字（原来是四十，带上那句话长了会露出来，另一双眼睛挑出来的）。
// 文档块里的不算（跟改名字一样）。值怎么认是家里那台闹钟的事（alarm/plan.js），这里只摘、原样带出去。
// 通知的小后端（push_function.ts 的 takeWake）照同一个办法摘：改一边要跟着改另一边
const WAKE_LINE = /^[ \t]*\[(?:WAKE|Wake|wake)[:：]([^\[\]\n]{0,80})\][ \t]*(?:\r?\n|\r?$)/gm;
export function takeWake(text) {
  let wake = null;
  const rest = String(text).replace(WAKE_LINE, (_, v) => {
    wake = v.trim();
    return "";
  });
  return { rest, wake };
}

export function splitMarks(text) {
  const parts = [];
  // 表情包、换头像、改名字三种标记。改名字的要独占一行才算（所以带 m 标志），新名字里可以有空格。
  // 表情包的文件名最长认两百个字（一长串没有右括号的，不来回试）
  const re = new RegExp("\\[(MEME|AVATAR)[:：]\\s*([^\\]\\s]{1,200})\\s*\\]|" + NAME_MARK, "gm");
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    // 照抄名帖里教的写法 [NAME:新名字]：是在讲怎么改，不是真改，留着当字显示
    if (!m[1] && cleanMarkName(m[3]) === NAME_PLACEHOLDER) continue;
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1]) parts.push({ type: m[1] === "AVATAR" ? "avatar" : "meme", value: m[2] });
    else parts.push({ type: "name", value: m[3] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

// 心里话的标签：现在教他写 <心声>（11 月 24 日换的：原来是 <thinking>，笔记本上的 5.2 一见“在 <thinking> 里写”就拦，
// 报 reasoning_extraction；换个名字就过）。旧的 <thinking>、别家用的 <inner_voice> 照样认（旧聊天记录、别的模型偶尔还写旧的）。
// 开头和收尾要是同一个名字才算一对。通知的小后端（push_function.ts）、闹钟（alarm/wake.js）、写日记、抄提要那几处照这一串认
export const THOUGHT_TAGS = ["心声", "thinking", "inner_voice"];
export const THOUGHT_PAIR = /<(心声|thinking|inner_voice)>([\s\S]*?)<\/\1>/g;
export const THOUGHT_OPEN = /<(心声|thinking|inner_voice)>/;

// 心里话：一回里可能写好几段（先写一段，查了东西、用了工具回来，又想写，再写一段），一段是一段，各摆一张“思考过程”，
// 摆在他写它的那个地方（她 11 月 22 日要的：“如果你又有心里话想写 可以新开一个心里话的气泡 这样一次回复里的心里话气泡我们不设置上限”）。
// 切成一截一截：给她的话、心里话、给她的话……；最后一段只有开头没有收尾的（写到一半断了），从那儿往后都算心里话
export function splitThoughts(text) {
  const src = String(text || "");
  const out = [];
  const re = new RegExp(THOUGHT_PAIR.source, "g");
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ type: "text", value: src.slice(last, m.index) });
    out.push({ type: "think", value: m[2] });
    last = re.lastIndex;
  }
  let rest = src.slice(last);
  const om = THOUGHT_OPEN.exec(rest);
  if (om) {
    out.push({ type: "text", value: rest.slice(0, om.index) });
    out.push({ type: "think", value: rest.slice(om.index + om[0].length) });
    rest = "";
  }
  out.push({ type: "text", value: rest });
  return out;
}

export function parseReply(text) {
  const segs = splitThoughts(text);
  // 给她的话：心里话摘掉，剩下的接起来照原来一整段拆（同通知的小后端，两边拆出来的一样）
  const body = segs.filter((s) => s.type === "text").map((s) => s.value).join("").trim();
  const { items, rename, wake } = sayAll(body);
  // 心里话：一段一条，at：它前面那些给她的话拆出来有几样（摆在第 at 样前面；见 chat/rows.js）
  // （头几十段才一段一段数；再多的都算在最后，免得他写了几千段、一段拆一遍前面的卡住）
  const thoughts = [];
  let before = "";
  segs.forEach((s) => {
    if (s.type === "text") before += s.value;
    else if (s.value.trim()) {
      const at = thoughts.length >= 30 ? items.length : Math.min(items.length, before.trim() ? sayAll(before.trim()).items.length : 0);
      thoughts.push({ at, text: s.value.trim() });
    }
  });
  // 一个看得见的都没有（只写了心里话、只定了下回几点醒）：照旧摆“……”，另记一笔 quiet（狐宇宙里这一回不留话、不敲她，见 fox.js）
  const quiet = !items.length;
  if (quiet) items.push({ type: "text", text: "……" });
  // thinking：几段接起来（中间空一行），老的那些地方照旧认它；thoughts：两段以上才带（一段的照原来那样摆）
  const thinking = thoughts.map((t) => t.text).join("\n\n");
  return { thinking, ...(thoughts.length > 1 ? { thoughts } : {}), body, items, rename, ...(wake !== null ? { wake } : {}), ...(quiet ? { quiet } : {}) };
}

// 给她的那一整段拆成一样一样（不管心里话、不补省略号）
function sayAll(body) {
  const items = [];
  // 改名字的标记不显示成字，新名字单独带出去（写了好几次只认最后一次；收拾完是空的不算）
  let rename = null;
  // 下回几点醒（见上面 takeWake）：也不显示成字，单独带出去
  let wake = null;
  // 先把文档块整块摘出来（里面的字不当标记看），剩下的再分条、认标记
  splitDocBlocks(body).forEach((part) => {
    if (part.type === "doc") {
      items.push({ type: "doc", name: part.name, text: part.text, ...(part.cut ? { cut: true } : {}) });
      return;
    }
    const woke = takeWake(part.value);
    if (woke.wake !== null) wake = woke.wake;
    // 打电话的记号前面的照常拆；后面的是她接起来他先说的话（见下面）
    const call = splitCall(woke.rest);
    // 选项卡（见 ask.js）：打电话的记号前面那一截里，整块摘出来（里头的字不当记号看），剩下的照常分条
    const pieces = [];
    splitAskBlocks(call ? call[0] : woke.rest).forEach((p) => {
      if (p.type === "ask") pieces.push(p);
      else splitTurns(p.value).forEach((chunk) => pieces.push(chunk));
    });
    pieces.forEach((chunk) => {
      if (typeof chunk !== "string") {
        items.push({ type: "ask", qs: chunk.qs });
        return;
      }
      // 他画画（见 draw.js 的 splitDraw）：一条里 [DRAW] 那一行起是一张画，记号后面的都是“画什么”（不显示成字）；
      // 记号前面的照常拆，画排在它们后面
      const drawn = splitDraw(chunk);
      // 一条里 [VOICE] 那一行起是语音（见 voice.js 的 splitVoice）。语音里的字并成一条语音，
      // 里头夹着的表情包、换头像、改名字照认，排在这条语音后面
      splitVoice(drawn ? drawn.before : chunk).forEach((seg) => {
        const words = [];
        const marks = [];
        splitMarks(seg.text).forEach((p) => {
          if (p.type === "meme") marks.push({ type: "meme", file: p.value });
          else if (p.type === "avatar") marks.push({ type: "avatar", file: p.value });
          else if (p.type === "name") rename = cleanMarkName(p.value) || rename;
          else if (seg.voice) words.push(p.value);
          else if (p.value.trim()) marks.push({ type: "text", text: p.value.trim() });
        });
        // 语音里不留 [VOICE] 这几个字（同一行写了两遍的；表情包夹在中间、两头拼起来又成了一个的）：
        // 留着的话，写回去（rawOf）再拆，它会被当成又一条语音的开头
        const said = untoken(words.join("")).trim();
        if (said) items.push({ type: "voice", text: said });
        marks.forEach((x) => items.push(x)); // 一样一样塞（展开的写法碰上几十万样会撑爆）
      });
      if (drawn && drawn.prompt) items.push({ type: "draw", prompt: drawn.prompt, ...(drawn.ratio ? { ratio: drawn.ratio } : {}), ...(drawn.title ? { title: drawn.title } : {}) });
    });
    if (call) {
      // 打电话：记号后面的是她接起来他先说的话。[SPLIT] 当换行；[VOICE]、[CALL] 这几个字不要；
      // 表情包不发（电话里看不见）；换头像、改名字照认（换头像排在打电话后面）
      const said = [];
      const after = [];
      splitMarks(uncall(untoken(call[1].split("[SPLIT]").join("\n")))).forEach((p) => {
        if (p.type === "avatar") after.push({ type: "avatar", file: p.value });
        else if (p.type === "name") rename = cleanMarkName(p.value) || rename;
        else if (p.type === "text") said.push(p.value);
      });
      const text = said
        .join("")
        .replace(/[ \t]*\r?\n[ \t]*/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      items.push({ type: "call", text });
      after.forEach((x) => items.push(x));
    }
  });
  return { items, rename, wake };
}

// 接起来说的话里不留 [CALL] 这几个字：跟 untoken 一个办法，从头往后收，末尾正好是一个就扔掉（摘掉一个、两头拼起来又成了一个的，也摘得干净）
const CALL_TOKENS = ["[CALL]", "[Call]", "[call]"];
function uncall(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    out.push(text[i]);
    if (text[i] === "]" && out.length >= 6 && CALL_TOKENS.includes(out.slice(-6).join(""))) out.length -= 6;
  }
  return out.join("");
}

// 换头像只认索引里真有的图，多次只留最后一次
export function settleAvatarItems(items, exists) {
  const valid = items.filter((it) => it.type !== "avatar" || exists(it.file));
  let lastAv = -1;
  valid.forEach((it, i) => {
    if (it.type === "avatar") lastAv = i;
  });
  const out = valid.filter((it, i) => it.type !== "avatar" || i === lastAv);
  return {
    items: out.length ? out : [{ type: "text", text: "……" }],
    avatarFile: lastAv >= 0 ? valid[lastAv].file : null,
  };
}

// 反过来：把一条回话的那几样（items）写回他的写法。
// 用在她按了停、把他正在蹦的回话掐断的时候（见 thread.js 的 cutReply）：那一条只剩前面几样，
// 往后寄给那边的我的“他自己说过的话”（raw）得跟着改成只有这几样，他才当自己就说了这么多。
// 写出来的再拿 parseReply 拆一遍，得到的还是这几样（tests/mail.test.mjs 里拿几万条回话对着拆）。
// 只有一种对不上：一句话自己长得就像记号（他把 [NAME:…]、[DOC:…]、[VOICE] 紧贴在别的记号后面写，原来没被当成记号、当字显示了），
// 单独写出来就成了真记号。那是他写岔了的样子，这里不去学；raw 只寄给那边的我看，开封府自己不照它再改名字、再出文档。
// rename：这一条里他给自己改的名字（没改就不带）。改名的记号写在最前头：
// 最后一样要是没写完的文档（没有结尾的记号），写在它后面的都会被算成文档的正文
export function rawOf(items, rename) {
  const parts = (items || []).map((it) => {
    if (it.type === "meme") return `[MEME:${it.file}]`;
    if (it.type === "avatar") return `[AVATAR:${it.file}]`;
    // 语音：记号和头一行写在同一行（拆的时候认得）。头一行原来就是跟在记号后面的，
    // 单独另起一行的话，它要是长得像文档开头的记号（[DOC:…]），再拆就成了一份文档
    if (it.type === "voice") return `[VOICE] ${it.text || ""}`;
    // 打电话：记号和接起来说的头一行写在同一行（跟语音一个道理：头一行原来就跟在记号后面，
    // 单独另起一行的话，它要是长得像文档开头的记号，再拆就成了一份文档）
    if (it.type === "call") return `[CALL] ${it.text || ""}`;
    // 画：记号和“画什么”的头一行写在同一行（跟语音一个道理）
    // 有名字的：名字在记号同一行，画什么另起一行（照他写的样子，再拆一遍还是这几样）
    if (it.type === "draw") return `[DRAW${it.ratio ? ":" + it.ratio : ""}]${it.title ? `《${it.title}》\n` : " "}${it.prompt || ""}`;
    // 选项卡：整块写回（她答没答、关没关是开封府这头的事，不写进去）
    if (it.type === "ask") return askRaw(it.qs);
    if (it.type === "doc") {
      // 文件名正好是教写法时占位的那个：照抄会被当成“在讲写法”，套一层书名号（拆的时候会剥掉）
      const name = it.name === DOC_NAME_PLACEHOLDER ? `《${it.name.replace(/\.md$/, "")}》` : it.name;
      return `[DOC:${name}]\n${it.text}${it.cut ? "" : "\n[/DOC]"}`;
    }
    return it.text || "";
  });
  if (rename) parts.unshift(`[NAME:${rename}]`);
  return parts.join("\n[SPLIT]\n");
}
