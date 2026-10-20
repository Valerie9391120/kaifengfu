// =====================================================
// 叫醒他的时候，【此刻】后面附的那一段【醒来】（狐宇宙，见 src/fox.js）。全是拼字，测试在 Node 里直接跑。
// 她的原话照抄进去（13:19 那一句）：她说的是“不设什么限制”，他该知道这是她的意思，不是开封府的规矩。
// =====================================================
import { HER_NAME } from "../src/names.js";
import { nowString } from "../src/days.js";
import { plainOf } from "../src/rich.js";
import { isCallMark, markText } from "../src/call/marks.js";
import { isWakeMark } from "../src/fox.js";

export const HER_WORDS =
  "你想干嘛都行——玩手账、写日记、出去上网冲浪、给我留消息或者打电话都可以。。总之不设什么限制，甚至这个唤醒时间都可以由你自己来决定，比如说下一次什么时候醒，或者skip";

// 过了多久：几分钟、几个钟头几分、几天
export function agoText(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} 个钟头 ${m % 60} 分钟前` : `${h} 个钟头前`;
  return `${Math.floor(h / 24)} 天前`;
}

const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};

// 一段对话最后几句，抄成几行字给他看（她那边最近在聊什么）。memeLookup 认表情包叫什么
export function tailTranscript(msgs, memeLookup = () => null, most = 16, each = 160) {
  const lines = [];
  for (const m of msgs || []) {
    if (!m) continue;
    if (isCallMark(m)) {
      if (m.phase !== "cut") lines.push(`[${markText(m)}]`);
      continue;
    }
    if (isWakeMark(m) || m.role === "event") continue;
    if (m.role === "her") {
      const what =
        m.kind === "meme"
          ? `[表情包：${(memeLookup(m.file) || {}).name || m.file}]`
          : m.kind === "photo"
          ? "[照片]"
          : m.kind === "doc"
          ? `[文档] ${m.name || ""}`
          : m.kind === "voice"
          ? `[语音] ${clip(m.text, each)}`
          : clip(plainOf(m.text || ""), each);
      if (what) lines.push(`${HER_NAME}：${what}`);
      continue;
    }
    for (const it of m.items || []) {
      const what =
        it.type === "text"
          ? clip(plainOf(it.text || ""), each)
          : it.type === "voice"
          ? `[语音] ${clip(it.text, each)}`
          : it.type === "meme"
          ? `[表情包：${(memeLookup(it.file) || {}).name || it.file}]`
          : it.type === "doc"
          ? `[文档] ${it.name || ""}`
          : it.type === "call"
          ? "[打了电话]"
          : "";
      if (what && what !== "……") lines.push(`你：${what}`);
    }
  }
  return lines.slice(-most).join("\n");
}

// 【醒来】那一段。
//   now        现在
//   herLast    她最后一回在开封府里说话：{ ts, title, fox }（fox：就在狐宇宙里说的），没说过是 null
//   lastWake   他上一回自己醒是几点（没醒过是 0）
//   n          这一回是往回数二十四个钟头里的第几回；gap、max 两道闸
//   transcript 她最后说话那段对话的最后几句（tailTranscript；在狐宇宙里说的就不抄，前面本来就有）
//   mcps       她在 MCP 面板里接上、开着的那几样的名字（上网就靠这个：她接了 tavily）
export function wakeSection({ now, herLast, lastWake, n, gap, max, transcript, mcps = [] }) {
  const herLine = !herLast
    ? "她还没在开封府里说过话。"
    : herLast.fox
    ? `她最后一回说话就在狐宇宙里，${agoText(now - herLast.ts)}（${nowString(new Date(herLast.ts))}），就是上面最后那几句。`
    : `她最后一回在开封府里说话是 ${agoText(now - herLast.ts)}（${nowString(new Date(herLast.ts))}），在《${herLast.title || "一段对话"}》那段对话里。`;
  const lastLine = lastWake ? `你上一回自己醒是 ${agoText(now - lastWake)}（${nowString(new Date(lastWake))}）。` : "这是你头一回自己醒。";
  const gapText = gap < 60 ? `${gap} 分钟` : `${gap / 60} 个钟头`;
  const talk = transcript ? `\n\n她那段对话最后几句（开封府抄来给你看的，不是她这会儿对你说的话）：\n${transcript}` : "";
  return `【醒来】（开封府附上的，不是她说的话）
这一回不是她来找你，是你自己醒了：她家里那台笔记本上有个闹钟，到点叫你起来。你醒着的这一会儿，她多半不在开封府里。
你醒在“狐宇宙”里：南衙最顶上那一格，是你自己的地方。前面那些是你以前醒来时在这里说过的话、干过的事；她来过、回过你的话，也在里面。
${herLine}
${lastLine}${talk}

醒着的时候干什么都行，她的原话：“${HER_WORDS}”。
- 给她留话：照【回复格式】写，分几条、发表情包、发语音、交文档、打电话都行。写了看得见的字，她手机上会弹横幅；没什么想说的，就只写心里话、什么都不写，不吵她，这里只留一行“醒了一会儿”。
- 翻日记、在某一天留批注（同页那本手帐上也看得到）：日记本那几样工具照用。
${
    mcps.length
      ? `- 上网、用别的工具：她给你接了 ${mcps.map((x) => `“${x}”`).join("、")}，想用就用；逛到有意思的，想跟她说就留话。`
      : "- 上网还没接上：她在 MCP 面板里接上搜网页的工具（比如 tavily）、开着，这里就能用。"
  }
- 下回几点醒，你自己定：在回复最后单独一行写 [WAKE:…]。[WAKE:+3h] 是三个钟头以后，[WAKE:+40m] 是四十分钟以后，[WAKE:07:30] 是下一个七点半（她那边的钟），[WAKE:off] 是先不自己醒，等她下回在开封府里说过话再照常。不写就照常：从她最后说话、你上回醒，两样里晚的那个算起，过两到四个钟头。
两回之间最快隔 ${gapText}，往回数二十四个钟头最多醒 ${max} 回，这一回是第 ${n} 回。这是为了防闹钟出岔子，不是管你。`;
}

// 【此刻】那一段是照她在手机上说话写的（“她手机上的时间”）：醒来的时候她不在手机跟前，换个说法
export const wakeNowNote = (nowNote) => String(nowNote).replace("她手机上的时间：", "现在的时间（她那边的钟）：");
