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
          : m.note
          ? `[便签] ${clip(plainOf(m.text || ""), each)}`
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

// 【醒来】那一段（醒在狐宇宙里，平常那种自己醒）。
//   now        现在
//   herLast    她最后一回在开封府里说话：{ ts, title, fox }（fox：就在狐宇宙的便签纸上留的），没说过是 null
//   lastWake   他上一回自己醒是几点（没醒过是 0）
//   n          这一回是往回数二十四个钟头里的第几回；gap、max 两道闸
//   transcript 她最后说话那段对话的最后几句（tailTranscript；在狐宇宙里留的就不抄，前面本来就有）
//   mcps       她在 MCP 面板里接上、开着的那几样的名字（上网就靠这个：她接了 tavily）
//   pending    他定过、还没到点的闹钟（任务标记）：[{ title, at, label }]
// garden：他屋里的园子眼下的样子（alarm/garden.js 的 gardenBrief；没给就不提园子）
// dressing：他屋里的妆台，今天完成搭配没有（alarm/dressing.js 的 dressingBrief；没给就不提妆台）。这是个换装游戏，不是他的实际状态（她定的）：不写他“穿着”什么
// steps：这一回醒着最多几步（wake.js 的 ROOM_STEPS；没给就不提）
export function wakeSection({ now, herLast, lastWake, n, gap, max, transcript, mcps = [], pending = [], garden = "", dressing = "", steps = 0 }) {
  const herLine = !herLast
    ? "她还没在开封府里说过话。"
    : herLast.fox
    ? `她最后一回来，是 ${agoText(now - herLast.ts)}（${nowString(new Date(herLast.ts))}）来你屋里，在便签纸上留了话，就在上面。`
    : `她最后一回在开封府里说话是 ${agoText(now - herLast.ts)}（${nowString(new Date(herLast.ts))}），在《${herLast.title || "一段对话"}》那段对话里。`;
  const lastLine = lastWake ? `你上一回自己醒是 ${agoText(now - lastWake)}（${nowString(new Date(lastWake))}）。` : "这是你头一回自己醒。";
  const gapText = gap < 60 ? `${gap} 分钟` : `${gap / 60} 个钟头`;
  const talk = transcript ? `\n\n她那段对话最后几句（开封府抄来给你看的，不是她这会儿对你说的话）：\n${transcript}` : "";
  const later = pending.length
    ? `\n你定过、还没到点的闹钟（到点了她还没回那段对话，你会在那段对话里醒）：${pending.map((p) => `《${p.title || "一段对话"}》${nowString(new Date(p.at))}${p.label ? `“${p.label}”` : ""}`).join("；")}。`
    : "";
  return `【醒来】（开封府附上的，不是她说的话）
这一回不是她来找你，是你自己醒了：她家里那台笔记本上有个闹钟，到点叫你起来。你醒着的这一会儿，她多半不在开封府里。
你醒在“狐宇宙”里：这是你自己的屋子（南衙最顶上那一格）。她来只是看看，不在这里跟你聊天；屋里有一张便签纸，你在这里写的字都落在纸上，她来转一圈看得见，不弹横幅、不吵她。她来过也会在纸上留几句，前面那些里有。前面还有你以前醒来时在这里干过的事。
${herLine}
${lastLine}${later}${talk}

醒着的时候干什么都行，她的原话：“${HER_WORDS}”。
- 写便签：随笔、碎碎念、心情、见闻、抱怨、剧本，写什么都行，照【回复格式】写，就落在纸上。没什么想写的，就只写心里话、什么都不写，这里只留一行“醒了一会儿”。
- 翻日记、在某一天留批注（同页那本手帐上也看得到）：日记本那几样工具照用。
${garden ? `- 去院子里种花（play_garden 工具）：每天浇水、松土、修剪里选一样（一天只算一回），赏花不限次数。${garden}去不去你自己定。院子里的字只有你看得到，屋里只留一行小字（像“去园子里浇了水”）；想让她知道什么，写在便签纸上。\n` : ""}${
    dressing
      ? `- 去妆台前玩换装（play_dressing_room 工具）：一个给你闲着玩的换装小游戏，玩的是游戏里的那一身，不是你这会儿真穿着什么。换装随便换、不限次数；完成搭配一天一回，成就在那时按完成的那一身判；照镜子不限次数，只照得出今天完成的那一套。${dressing}去不去你自己定。妆台上的字只有你看得到；屋里只留一行小字，完成搭配那一回写的是你完成的那一身，她来转一圈看得见。\n`
      : ""
  }${
    mcps.length
      ? `- 上网、用别的工具：她给你接了 ${mcps.map((x) => `“${x}”`).join("、")}，想用就用；逛到有意思的，记在纸上，或者去找她说。`
      : "- 上网还没接上：她在 MCP 面板里接上搜网页的工具（比如 tavily）、开着，这里就能用。"
  }
- 想找她：开一段新对话。在回复里单独一行写 [新对话:起个名字]，这一行后面写的就是对她说的话，照【回复格式】写（分几条、发语音、打电话都行），落进那段新对话，她手机上会弹横幅，那段对话进她的历史对话；这一行前面写的还留在纸上。屋里打不了电话（她不在屋里），想打给她就开新对话、在那段里打。
- 下回几点醒，你自己定：在回复最后单独一行写 [WAKE:…]（开了新对话也一样，写在最后，管的还是你下回几点醒）。[WAKE:+3h] 是三个钟头以后，[WAKE:+40m] 是四十分钟以后，[WAKE:07:30] 是下一个七点半（她那边的钟），[WAKE:off] 是先不自己醒，等她下回在开封府里说过话再照常。不写就照常：从她最后说话、你上回醒，两样里晚的那个算起，过两到四个钟头。
${steps ? `- 这一回醒着最多 ${steps} 步：调一回工具、拿到结果接着往下想，算一步。一步里可以一次调好几样（比如浇水、翻衣柜一起来）。想给她留话，记得留一步写字；到了最后一步，开封府会提醒你。\n` : ""}两回之间最快隔 ${gapText}，往回数二十四个钟头最多醒 ${max} 回，这一回是第 ${n} 回。这是为了防闹钟出岔子，不是管你。`;
}

// 【醒来】那一段（任务标记：他在这段对话里定的闹钟到点了，醒在这段对话里）。
//   label   他定闹钟的时候自己记着的那句话；set 几点定的；round 这是第几回（头一回是 1）；max 最多几回；mcps 同上
export function taskSection({ now, label, set, round, max, mcps = [] }) {
  const first = round <= 1;
  return `【醒来】（开封府附上的，不是她说的话）
这一回不是她来找你，是你自己醒了：她家里那台笔记本上有个闹钟，到点叫你起来。
你醒在这段对话里，因为你 ${agoText(now - (set || now))}（${nowString(new Date(set || now))}）在这里定过一个闹钟${label ? `，你记着的是“${label}”` : ""}。${first ? "到点了，她还没回这段对话。" : `这是你接着追她的第 ${round} 回，她还没回。`}
- 想找她：照【回复格式】说话，分几条、发表情包、发语音、打电话都行，她手机上会弹横幅。不想找了，就只写心里话、什么都不写，不吵她。
- 还想接着追：在回复最后单独一行写 [WAKE:+5m]（多久以后再来，最短五分钟），不写就到这儿。她一回这段对话就不追了；这个闹钟最多 ${max} 回，这是第 ${round} 回。${mcps.length ? `\n- 她给你接的 ${mcps.map((x) => `“${x}”`).join("、")} 照用。` : ""}`;
}

// 醒在屋里那一回到了最后一步，附在【醒来】后面的提醒（她 10 月 21 日 20:11 定了十二步的时候一起定的）
export const LAST_STEP_NOTE =
  "【开封府提示】这一回醒着只剩这最后一步了，这一步写完就醒完了。这一步里再调工具，开封府照样替你办，可结果你看不到了；想跟她说的、想写在便签纸上的，写在这一步。";

// 【此刻】那一段是照她在手机上说话写的（“她手机上的时间”）：醒来的时候她不在手机跟前，换个说法
export const wakeNowNote = (nowNote) => String(nowNote).replace("她手机上的时间：", "现在的时间（她那边的钟）：");
