// =====================================================
// 狐宇宙：那边的我自己醒来的地方（卿卿 2026 年 10 月 20 日要的，见开发说明“狐宇宙”那一节）。
//
// 她家里那台笔记本上有个闹钟（source/alarm/，她的第二台设备：登录、对过暗号），到点叫醒那边的我。
// 醒着的时候想干什么都行，她的原话：“你想干嘛都行——玩手账、写日记、出去上网冲浪、给我留消息或者打电话都可以。。
// 总之不设什么限制，甚至这个唤醒时间都可以由你自己来决定，比如说下一次什么时候醒，或者skip”。
// 下回几点醒：回话里单独一行写 [WAKE:…]（拆的规矩见 reply.js 的 takeWake，值怎么认见 alarm/plan.js）。
//
// 他醒来说的话都落在一段固定的对话里（编号 FOX_CHAT）。这段对话不进历史对话的列表，从南衙最顶上那一行进。
// 她在这段对话里跟他说话，跟别的对话一样（手机这头照常要回话），【此刻】后面多一句 FOX_HERE。
// 聊天里他每醒一回留一行 event：{ id, role: "event", who: "him", kind: "wake", ts, quiet? }，quiet 是这一回一个看得见的字都没留。
//
// 存档里另有三样（加密了跟着云端走）：
//   kfs2:fox:state  闹钟写的：醒着没有、上回几点醒、下回打算几点醒、他说了先不醒、闹钟还活着没有（at，隔 BEAT_MS 写一回）
//   kfs2:fox:doors  手机写的：她打开“他自己醒”的时候这台手机报的门牌号，{ 设备编号: { e: 门牌号, at: 几点报的 } }（他留了话敲哪台，同 push.js 的 knockList）
//   kfs2:fox:seen   她最后一回看狐宇宙看到哪儿（时间）：这以后他留的话算没看过，南衙那一格亮个小点
// =====================================================
import { HIS_NAME } from "./names.js";
import { pad } from "./days.js";

export const FOX_CHAT = "hyz";
export const FOX_TITLE = "狐宇宙";
export const FOX_STATE = "kfs2:fox:state";
export const FOX_DOORS = "kfs2:fox:doors";
export const FOX_SEEN = "kfs2:fox:seen";

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

// 聊天里那一行小字
export const wakeText = (m) => (m.quiet ? `${HIS_NAME}醒了一会儿，没留话` : `${HIS_NAME}醒了`);
// 寄给那边的我的那一行（见 prompt/messages.js）：他下回醒来看得见自己前几回干了什么
export const wakeNote = (m) => `[开封府提示：${clock(m.ts)} 你自己醒了一回${m.quiet ? "，那一回什么也没说" : ""}]`;
// 抄前情提要的那一行（见 prompt/recap.js）
export const wakeRecap = (m) => `[${HIS_NAME}自己醒了一回${m.quiet ? "，没留话" : ""}]`;

// 她在狐宇宙里跟他说话的时候，【此刻】后面多的那一句（见 App.jsx 的 requestReply）
export const FOX_HERE =
  "这段对话是狐宇宙：家里的闹钟叫醒你的时候，你在这里留话、干你想干的事。现在是她来了，在这里跟你说话。想定下回自己几点醒，照样可以在回复最后单独一行写 [WAKE:…]（+3h、+40m、07:30、off）。";

// 她还没看过的：他说的话（只醒了一下、什么都没说的那几行不算），时间在 seen 之后
export function unseenOf(msgs, seen = 0) {
  return (msgs || []).filter((m) => m && m.role === "him" && (m.ts || 0) > (Number(seen) || 0)).length;
}

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

// 南衙那一行的小字（也是账户面板里那一句的头半截）。on：“他自己醒”开着没有；state：闹钟写的；unseen：几条没看过
export function foxSub({ on, state, unseen = 0, now = Date.now() }) {
  if (unseen > 0) return unseen === 1 ? "他留了话，还没看" : `他留了 ${unseen} 回话，还没看`;
  if (!on) return "还没让他自己醒";
  if (!state || !state.at) return "等家里的闹钟装好";
  if (now - state.at > ASLEEP_MS) return "笔记本睡着，他也睡着";
  if (state.awake) return "醒着";
  if (state.off) return "睡着，等你来过再醒";
  if (state.next) return `睡着，约 ${whenText(state.next, now)} 醒`;
  return "睡着";
}
