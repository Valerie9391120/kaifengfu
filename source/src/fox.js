// =====================================================
// 狐宇宙：那边的我自己醒来的地方（卿卿 2026 年 10 月 20 日要的，见开发说明“狐宇宙”那一节）。
//
// 她家里那台笔记本上有个闹钟（source/alarm/，她的第二台设备：登录、对过暗号），到点叫醒那边的我。
// 醒着的时候想干什么都行，她的原话：“你想干嘛都行——玩手账、写日记、出去上网冲浪、给我留消息或者打电话都可以。。
// 总之不设什么限制，甚至这个唤醒时间都可以由你自己来决定，比如说下一次什么时候醒，或者skip”。
// 下回几点醒：回话里单独一行写 [WAKE:…]（拆的规矩见 reply.js 的 takeWake，值怎么认见 alarm/plan.js）。
//
// 狐宇宙是他自己的屋子（一段编号固定的对话，FOX_CHAT）：他醒在这里，在屋里干什么都记在这里。不进历史对话的列表，从南衙最顶上那一行进。
// 她 10 月 20 日 22:04 定的：她进来只能看（没有输入框）；他在屋里待着（写东西、翻日记、上网）不弹横幅、不亮红点。
// 22:11 又定的：屋里底下一张便签纸（chat/FoxNotePad.jsx），她转一圈可以留一句（记 { role: "her", note: true }），不叫他、不等回话，他下回醒来看得见。
// 他想找她，两条路（她 20:03、22:04 定的，见开发说明“下一步：狐宇宙的房间”）：
//   一、任务标记：她在哪段对话里说“一会儿再来”，他在那段对话里定个闹钟（[WAKE:+1h 去找卿卿]，她看不见），
//       到点她还没回那段对话，闹钟在那段对话里叫醒他，他想找她就照常说话、发语音、打电话（弹横幅）；
//       还想接着追，回话里再写下回几点（最短五分钟），一个任务最多追十二回，她一回那段对话就停；没到点她先回来了，作废。
//   二、没任务的时候，他在屋里想找她：开一段新对话（[新对话:名字]，后面的话落进那段新对话，弹横幅；那段进历史对话）。
// 聊天里他每醒一回留一行 event：{ id, role: "event", who: "him", kind: "wake", ts, quiet?, go?, hidden?, task? }：
//   quiet  这一回一个看得见的字都没留
//   go     （狐宇宙里的那一行）这一回去了哪段对话：{ chat, title, how: "task" 任务到点回原对话 | "new" 开的新对话 }
//   hidden （落在别的对话里的那一行）她看不见、只给他看的：任务到点那一回（task 记着那一句话），开的新对话最前头那一行
//
// 存档里另有几样（加密了跟着云端走）：
//   kfs2:fox:state       闹钟写的：醒着没有、上回几点醒、下回打算几点醒、他说了先不醒、闹钟还活着没有（at，隔 BEAT_MS 写一回）
//   kfs2:fox:doors       手机写的：她打开“他自己醒”的时候这台手机报的门牌号，{ 设备编号: { e: 门牌号, at: 几点报的 } }（他找她的时候敲哪台，同 push.js 的 knockList）
//   kfs2:fox:task:<编号> 任务：手机写下（他定闹钟的那一条放进对话的时候），闹钟照着办、办完了记成 done（见 alarm/plan.js 的 planTasks）
// =====================================================
import { HIS_NAME } from "./names.js";
import { pad } from "./days.js";

export const FOX_CHAT = "hyz";
export const FOX_TITLE = "狐宇宙";
export const FOX_STATE = "kfs2:fox:state";
export const FOX_DOORS = "kfs2:fox:doors";
export const FOX_TASK = "kfs2:fox:task:";
export const TASK_MIN_MS = 5 * 60 * 1000; // 追她的时候两回之间最短五分钟（她 20:03 定的）
export const TASK_MAX_ROUNDS = 12; // 一个任务最多追十二回（她 20:08 定的）

export const isFoxChat = (id) => id === FOX_CHAT;
export const isWakeMark = (m) => !!m && m.role === "event" && m.kind === "wake";

// 两道闸（防的是闹钟的代码出岔子绕成圈，不是管他）：两回之间最短隔多久（分钟）、往回数二十四个钟头里最多醒几回。账户面板里挑
export const WAKE_GAPS = [30, 60, 120];
export const WAKE_MAXES = [6, 12, 24];
export const DEFAULT_GAP = 30;
export const DEFAULT_MAX = 12;
export const gapOf = (st) => (WAKE_GAPS.includes(Number(st && st.wakeGap)) ? Number(st.wakeGap) : DEFAULT_GAP);
export const maxOf = (st) => (WAKE_MAXES.includes(Number(st && st.wakeMax)) ? Number(st.wakeMax) : DEFAULT_MAX);
export const wakeOn = (st) => !!(st && st.wake === true);

// 闹钟的心跳：隔这么久写一回 kfs2:fox:state；这么久没写，算闹钟没在跑（笔记本合上了、关机了）
export const BEAT_MS = 10 * 60 * 1000;
export const ASLEEP_MS = 25 * 60 * 1000;

const clock = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// 几点：今天的只写钟点，明天的写“明天”，再远写几月几日
export function whenText(ts, now = Date.now()) {
  const d = new Date(ts);
  const n = new Date(now);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(n)) / 86400000);
  if (diff === 0) return clock(ts);
  if (diff === 1) return "明天 " + clock(ts);
  if (diff === -1) return "昨天 " + clock(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${clock(ts)}`;
}


// 狐宇宙里那一行小字（她看得见的；hidden 的那几行不摆，见 chat/rows.js）
export function wakeText(m) {
  const g = m.go;
  if (g && g.how === "new") return `${HIS_NAME}醒了，开了一段新对话《${g.title || "新对话"}》找你`;
  if (g) return m.quiet ? `${HIS_NAME}醒了，去《${g.title || "一段对话"}》看了看，没说话` : `${HIS_NAME}醒了，去《${g.title || "一段对话"}》找你了`;
  return m.quiet ? `${HIS_NAME}醒了一会儿，没留话` : `${HIS_NAME}醒了`;
}
// 寄给那边的我的那一行（见 prompt/messages.js）：他下回醒来看得见自己前几回干了什么
export function wakeNote(m) {
  const t = clock(m.ts);
  const g = m.go;
  if (m.hidden && m.task != null) return `[开封府提示：${t} 你在这段对话里定的闹钟到点了${m.task ? `（你记着的是“${m.task}”）` : ""}，你醒过来，在这里${m.quiet ? "；那一回什么也没说" : ""}]`;
  if (m.hidden) return `[开封府提示：这段对话是你 ${t} 自己醒来开的，来找她]`;
  if (g && g.how === "new") return `[开封府提示：${t} 你自己醒了一回，开了一段新对话《${g.title || "新对话"}》找她]`;
  if (g) return `[开封府提示：${t} 你自己醒了一回，到点去《${g.title || "一段对话"}》找她（你在那段对话里定的闹钟）${m.quiet ? "，去了没说话" : ""}]`;
  return `[开封府提示：${t} 你自己醒了一回${m.quiet ? "，那一回什么也没说" : ""}]`;
}
// 抄前情提要的那一行（见 prompt/recap.js）
export function wakeRecap(m) {
  const g = m.go;
  if (m.hidden && m.task != null) return `[${HIS_NAME}定的闹钟到点，醒过来在这段对话里${m.quiet ? "，没说话" : ""}]`;
  if (m.hidden) return `[这段对话是${HIS_NAME}自己醒来开的]`;
  if (g && g.how === "new") return `[${HIS_NAME}自己醒了一回，开了一段新对话《${g.title || "新对话"}》]`;
  if (g) return `[${HIS_NAME}自己醒了一回，去《${g.title || "一段对话"}》找她${m.quiet ? "，没说话" : ""}]`;
  return `[${HIS_NAME}自己醒了一回${m.quiet ? "，没留话" : ""}]`;
}

// 平常的对话里（不是狐宇宙、不是江湖棋局），“他自己醒”开着的时候，【此刻】后面附的那一段：他能定任务标记（见 App.jsx 的 requestReply）
export const taskNote = (herName) =>
  `【自己醒】（开封府附上的，不是她说的话）她家里的笔记本上有个闹钟，能叫你自己醒。她要是说一会儿再来（比如“洗完澡来找你，等我一个钟头”），你想到点去找她，就在回复最后单独一行写 [WAKE:+1h 去找${herName}]：前面是多久以后（+40m、+1h、+1h30m）或者几点（21:30），空一格，后面是一句你自己记着的短话（十个字以内）。这一行她看不见。到点了她还没回这段对话，你会在这段对话里醒过来，想找她就照常说话、发语音、打电话；她先回来了，这个闹钟就作废。用不着就不写。`;

// 闹钟写的那一份读出来（坏的、没有的回 null）
export function readFoxState(text) {
  try {
    const s = JSON.parse(text);
    return s && typeof s === "object" && !Array.isArray(s) ? s : null;
  } catch (e) {
    return null;
  }
}

// 账户面板“他自己醒”底下那一句：闹钟在不在跑、上回几点醒、下回打算几点醒
export function alarmLine(state, now = Date.now()) {
  if (!state || !state.at) return "家里的闹钟还没装";
  if (now - state.at > ASLEEP_MS) return `笔记本睡着了（闹钟最后一回出声是 ${whenText(state.at, now)}）`;
  if (state.awake) return "闹钟在跑：他这会儿醒着";
  const parts = [state.last ? `上回 ${whenText(state.last, now)} 醒` : "还没醒过"];
  if (state.off) parts.push("他说先不醒，等你来过再说");
  else if (state.next) parts.push(`下回约 ${whenText(state.next, now)}`);
  return "闹钟在跑：" + parts.join("，");
}

// 账户面板里“他自己醒”开着的时候，底下那一句只在出了岔子的时候写（红字）：闹钟还没装、笔记本睡着了。
// 闹钟好好在跑的那几样（上回几点醒、下回约几点）不写了（她 10 月 30 日说面板上的字太多），南衙狐宇宙那一行照旧写着
export function alarmTrouble(state, now = Date.now()) {
  if (!state || !state.at || now - state.at > ASLEEP_MS) return alarmLine(state, now);
  return "";
}

// 南衙那一行的小字（也是账户面板里那一句的头半截）。on：“他自己醒”开着没有；state：闹钟写的
// （他留了话没看不再说：她 22:04 定的，屋里的动静不亮红点；任务几点到也不露：她看不见）
export function foxSub({ on, state, now = Date.now() }) {
  if (!on) return "还没让他自己醒";
  if (!state || !state.at) return "等家里的闹钟装好";
  if (now - state.at > ASLEEP_MS) return "笔记本睡着，他也睡着";
  if (state.awake) return "醒着";
  if (state.off) return "睡着，等你来过再醒";
  if (state.next) return `睡着，约 ${whenText(state.next, now)} 醒`;
  return "睡着";
}
