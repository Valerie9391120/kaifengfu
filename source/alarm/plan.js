// =====================================================
// 闹钟：下回几点叫醒他（狐宇宙，见 src/fox.js、开发说明“狐宇宙”那一节）。
// 全是算数：不碰网、不碰存档、不看钟（现在几点从外面递进来），测试在 Node 里直接跑（tests/fox.test.mjs）。
//
// 规矩（卿卿 10 月 20 日 12:46 到 13:19 定的）：
//   一、他自己定：最近那一回他在回话里单独一行写了 [WAKE:…]，照它办（值怎么认见 parseWake）。
//       写的是 off：先不自己醒，等她下回在开封府里说过话再照常。
//       他写下以后她又来说过话：那一句作废，照常（她来过，他已经跟她说上话了）。
//       写的钟点已经醒过了（醒在那个钟点或者更晚）：也作废，照常。
//   二、照常：从她最后说话那会儿、他上回醒那会儿，两样里晚的那个算起，过两到四个钟头（照 WrenWen 的节奏，一天三到五回）。
//       两到四里挑哪个点，是照起算的那个时刻定的（同一个起点，算几遍都是同一个点），用不着另记。
//   三、错过的不补：该醒的那会儿笔记本关着、睡着，开机（或者醒过来、她刚把“他自己醒”打开）以后不马上响，往后随机挑个点，几十分钟以内。
//   四、她在的时候不插嘴：她十五分钟以内刚说过话，挪到她最后那句话之后半个钟头。
//   五、两道闸（防闹钟的代码出岔子绕圈，不是管他）：两回之间最短隔 gap 分钟；往回数二十四个钟头最多醒 max 回。
//       “醒”数的是闹钟叫过他的每一回（这台电脑上记着，tries），没醒成的也算：问到一半出岔子的那几回，钱多半已经花了；
//       狐宇宙里的醒了那几行要是被手机那头盖掉了，也不会因此多醒。
//   六、上一回没醒成（网断了、Anthropic 一时不应）：隔一刻钟再试，连着三回不成就歇两个钟头再试。
//   七、狐宇宙里她说的那句还没回上（最后一条是她的，或者是他说到一半的那一步）：先不醒。她锁了屏、回话在信箱里等着，
//       这时候往后面接他醒来的话，她回来的时候手机认成“那句已经回过了”，信箱里那封就扔了（另一双眼睛挑出来的）。
//       回话放进来了照常；那句搁了三天还没回上（信箱里的信最多留三天），不等了。
//
// 任务标记（她 20:03、20:08 定的，见 src/fox.js）另算，planTasks 管：
//   他在平常的对话里写 [WAKE:+1h 去找卿卿]，手机记一个任务。到点了，她要是还没回那段对话，在那段对话里叫醒他；
//   没到点她先回来了（那段对话里，他定闹钟的那一条后面她说过话；看的是排在哪儿，不看钟点：她信号不好、那句晚到了也算）、
//   他定闹钟的那一条不在了（删了、重新回答翻过去了）、那段对话删了：作废。
//   错过的不补（同规矩三）：闹钟睡着的时候（笔记本合着、关着，“他自己醒”关着）过了点的，醒过来以后不办；
//   他那一条放进对话的时候就已经过了点（回话在信箱里搁着，她回来才放进去），也不办：她都回来了。
//   叫醒以后他还想追，回话里再写下回几点（最短五分钟），一个任务最多追十二回；她一回那段对话就停；追了一整天还没回，也停。
//   追她的这几回不算进第二道闸；追着的时候平常那种自己醒先停着（main.js）。
// =====================================================
import { TASK_MIN_MS, TASK_MAX_ROUNDS } from "../src/fox.js";

export const RHYTHM_MIN = 2 * 3600 * 1000;
export const RHYTHM_MAX = 4 * 3600 * 1000;
export const RESUME_MIN = 10 * 60 * 1000;
export const RESUME_MAX = 60 * 60 * 1000;
export const PRESENT_MS = 15 * 60 * 1000;
export const PRESENT_PUSH = 30 * 60 * 1000;
export const DAY_MS = 24 * 3600 * 1000;
export const RETRY_MS = 15 * 60 * 1000;
export const RETRY_MOST = 3;
export const OWED_MS = 3 * DAY_MS;
export const TASK_STALE = 7 * DAY_MS; // 定了七天还没到点的任务（写的钟点认错了之类）：不办了
export const TASK_KEEP = 2 * DAY_MS; // 办完的任务留两天再删（手机那头不会把它当成新的再记一回）
export const TASK_LATE = 15 * 60 * 1000; // 闹钟醒过来的时候过点超过这么久的任务：睡着的时候错过的，不补
export const CHASE_MAX = DAY_MS; // 追了一整天她还没回：不追了
const MOST_AHEAD = 7 * DAY_MS; // 他写的最远认到七天以后

// 照一个时刻定一个 [0, 1) 之间的数：同一个时刻回回一样（mulberry32，种子是那个时刻）
export function fracOf(seed) {
  let t = (Math.floor(Number(seed) || 0) % 4294967296) >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

// [WAKE:…] 里写的认成什么（from 是他写下的那一刻；钟点按这台电脑的钟，也就是她那边的钟）：
//   +3h、+40m、+1h30m、3h、90m，也认“3小时”“3个钟头”“40分钟”“1小时30分”：几个钟头、几分钟以后 → { at }
//   07:30、7:30、19：05：下一个这个钟点 → { at }
//   off、skip、不醒、先不醒、等你：先不自己醒 → { off: true }
// 认不出的、零的、负的回 null（照常醒）
export function parseWake(raw, from) {
  const s = String(raw == null ? "" : raw)
    .replace(/\s+/g, "")
    .replace(/：/g, ":")
    .toLowerCase();
  if (!s) return null;
  if (/^(off|skip|none|no|不醒|先不醒|别叫我|等你|等她)$/.test(s)) return { off: true };
  const rel = /^\+?(?:(\d{1,3}(?:\.\d+)?)(?:h|hr|hrs|hour|hours|小时|个小时|钟头|个钟头))?(?:(\d{1,4})(?:m|min|mins|minute|minutes|分钟|分))?$/.exec(s);
  if (rel && (rel[1] || rel[2])) {
    const ms = (Number(rel[1] || 0) * 60 + Number(rel[2] || 0)) * 60 * 1000;
    if (!(ms > 0) || ms > MOST_AHEAD) return null;
    return { at: from + ms };
  }
  const clock = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (clock) {
    const h = Number(clock[1]);
    const m = Number(clock[2]);
    if (h > 23 || m > 59) return null;
    const d = new Date(from);
    d.setHours(h, m, 0, 0);
    let at = d.getTime();
    // 写的正好是这一分钟、或者已经过了：明天这个钟点
    if (at <= from + 60 * 1000) {
      const n = new Date(from);
      n.setDate(n.getDate() + 1);
      n.setHours(h, m, 0, 0);
      at = n.getTime();
    }
    return { at };
  }
  return null;
}

// [WAKE:…] 里写的拆成两截：前面是几点醒（+1h、+1h 30m、3 小时、07:30、off），后面是他自己记着的一句话（任务标记用，最多四十个字）。
// 从长往短试：打头那几截合起来认得出钟点的，最长的那一截是钟点（中间有空格也认），剩下的是那句话（另一双眼睛挑出来的：
// 原来只认头一截，“3 小时”“+1h 30m”这种中间有空格的就认错了）。一截都认不出：头一截当钟点（照常醒、任务作废），剩下的是那句话
export function splitWake(raw) {
  const parts = String(raw == null ? "" : raw)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (let n = parts.length; n >= 1; n--) {
    const when = parts.slice(0, n).join(" ");
    if (parseWake(when, 0)) return { when, label: parts.slice(n).join(" ").slice(0, 40) };
  }
  return { when: parts[0] || "", label: parts.slice(1).join(" ").slice(0, 40) };
}

// 最近那一回他写的 [WAKE:…]：狐宇宙那段对话里，他的话（role him）和他醒的那几行（kind wake）上记着的 wake。没有回 null
export function lastMark(msgs) {
  for (let i = (msgs || []).length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || typeof m.wake !== "string") continue;
    if (m.role === "him" || (m.role === "event" && m.kind === "wake")) return { value: m.wake, ts: m.ts || 0 };
  }
  return null;
}

// 下回几点醒。
//   now      现在
//   wakes    他醒过的那几回（时刻，从早到晚；只用得着最近二十四个钟头的和最后一回）
//   herLast  她最后一回在开封府里说话是几点（哪段对话都算；没有就是 0）
//   mark     最近那一回他写的 [WAKE:…]（lastMark 的结果，没有就是 null）
//   resumeAt 闹钟这一回是几点“醒过来”的：开机、笔记本从睡眠里醒、她刚把“他自己醒”打开
//   gap      两回之间最短隔多少分钟；max 往回数二十四个钟头最多醒几回
//   fails    最近连着没醒成的那几回（时刻，从早到晚；醒成一回就清空）
//   tries    闹钟叫过他的每一回，醒成没醒成都算（时刻；第二道闸数这个，连同 wakes）
//   owed     狐宇宙里还没回上的那一句是几点说的（没有就是 0）
//   capWakes 第二道闸数的那几回（不给就是 wakes；追她的那几回不算，见 wake.js 的 gather）
// 回 { due, why }：due 是几点醒（null 是先不醒：他说了 off）；why 是照哪一条定的（看日志、测试用）
export function planNext({ now, wakes = [], herLast = 0, mark = null, resumeAt = 0, gap = 30, max = 12, fails = [], tries = [], owed = 0, capWakes = null }) {
  // 七、她那句还没回上
  if (owed && now - owed < OWED_MS) return { due: null, why: "owed" };
  const lastWake = wakes.length ? wakes[wakes.length - 1] : 0;
  let due;
  let why;
  // 一、他自己定的
  const his = mark && !(herLast > mark.ts) ? parseWake(splitWake(mark.value).when, mark.ts) : null;
  if (his && his.off) return { due: null, why: "off" };
  if (his && his.at > lastWake) {
    due = his.at;
    why = "his";
  } else {
    // 二、照常
    const anchor = Math.max(herLast || 0, lastWake || 0) || resumeAt || now;
    due = anchor + RHYTHM_MIN + Math.floor(fracOf(anchor) * (RHYTHM_MAX - RHYTHM_MIN));
    why = "rhythm";
  }
  // 三、错过的不补
  if (resumeAt && due < resumeAt) {
    due = resumeAt + RESUME_MIN + Math.floor(fracOf(resumeAt) * (RESUME_MAX - RESUME_MIN));
    why = "resume";
  }
  // 六、上一回没醒成：隔一刻钟再试；连着三回不成，歇两个钟头再试（网断了一下午，不能一刻钟敲一回）
  if (fails.length) {
    const lastFail = fails[fails.length - 1];
    const wait = fails.length < RETRY_MOST ? RETRY_MS : RHYTHM_MIN;
    if (due < lastFail + wait) {
      due = lastFail + wait;
      why = "retry";
    }
  }
  // 四、她在的时候不插嘴
  if (herLast && now - herLast < PRESENT_MS && due < herLast + PRESENT_PUSH) {
    due = herLast + PRESENT_PUSH;
    why = "present";
  }
  // 五、两道闸
  if (lastWake && due < lastWake + gap * 60 * 1000) {
    due = lastWake + gap * 60 * 1000;
    why = "gap";
  }
  const counted = [...new Set((capWakes || wakes).concat(tries))].sort((a, b) => a - b);
  const recent = counted.filter((t) => t > due - DAY_MS);
  if (recent.length >= max) {
    // 往回数二十四个钟头里已经醒满了：等最早的那一回滑出这二十四个钟头
    due = recent[recent.length - max] + DAY_MS;
    why = "cap";
  }
  return { due, why };
}

// 一段对话眼下的样子（任务用；wake.js 的 chatInfo 拿存档里的那份递进来）：
//   at(t)          他定闹钟的那一条摆在第几条（认 t.from 编号；没有的话认 t.job，信箱里取出来的那一条记着是哪一回）；不在外面摆着回 -1
//   herAfterAt(i)  第 i 条后面她说过话没有（看排在哪儿，不看钟点；她在狐宇宙便签纸上留的不在这段对话里，醒了那几行、换头像提示不算）
export function infoOf(msgs) {
  const list = Array.isArray(msgs) ? msgs : [];
  return {
    msgs: list,
    at: (t) => (t ? list.findIndex((m) => m && ((t.from && m.id === t.from) || (!t.from && t.job && m.role === "him" && m.job === t.job))) : -1),
    herAfterAt: (i) => i >= 0 && list.slice(i + 1).some((m) => m && m.role === "her" && !m.note),
  };
}

// 任务（kfs2:fox:task:<编号>）眼下该怎么办。
//   tasks     [{ key, id, chat, from, raw, set, placed?, state?, started?, next?, rounds?, last? }]：手机写下的是 wait（没有 state），
//             闹钟办过一回以后是 chase，办完是 done、void。placed：他那一条是几点放进对话的（手机记的）
//   info      (chatId) => null（那段对话没了）| infoOf(那段对话)
//   resumeAt  闹钟这一回是几点“醒过来”的（同 planNext；开机、笔记本睡醒、她刚把“他自己醒”打开）
// 回 { due, task }（最早该办的那一个；没有是 { due: null }）和 changes：[{ key, state, why }]（该作废、该收的）
export function planTasks({ now, tasks = [], info, minGap = TASK_MIN_MS, resumeAt = 0 }) {
  const changes = [];
  let best = null;
  // 闹钟睡着的那会儿（醒过来以前过了点的）
  const missed = (due) => !!resumeAt && due < resumeAt - TASK_LATE;
  for (const t of tasks) {
    if (!t || !t.key) continue;
    const state = t.state || "wait";
    if (state === "done" || state === "void") {
      if (now - (t.endedAt || t.set || 0) > TASK_KEEP) changes.push({ key: t.key, state: "drop", why: "办完两天了" });
      continue;
    }
    const end = (why, st = "void") => changes.push({ key: t.key, state: st, why });
    const c = info(t.chat);
    if (!c) {
      end("那段对话没了");
      continue;
    }
    const at = c.at(t);
    if (state === "wait") {
      const p = parseWake(splitWake(t.raw).when, t.set || 0);
      if (!p || p.off) {
        end("写的钟点认不出");
        continue;
      }
      if (at < 0) {
        end("他定闹钟的那一条不在了");
        continue;
      }
      if (c.herAfterAt(at)) {
        end("她先回来了");
        continue;
      }
      if (now - (t.set || 0) > TASK_STALE) {
        end("定了七天还没办");
        continue;
      }
      // 他那一条放进对话的时候已经过了点（回话在信箱里搁着，她回来才放进来）：她都回来了，不办
      if (t.placed && p.at <= t.placed) {
        end("放进对话的时候已经到点了");
        continue;
      }
      if (missed(p.at)) {
        end("闹钟睡着的时候过了点");
        continue;
      }
      if (!best || p.at < best.due) best = { due: p.at, task: t };
      continue;
    }
    // chase：追着她
    if (at < 0) {
      end("他定闹钟的那一条不在了", "done");
      continue;
    }
    if (c.herAfterAt(at)) {
      end("她回了", "done");
      continue;
    }
    if ((t.rounds || 0) >= TASK_MAX_ROUNDS) {
      end("追满了", "done");
      continue;
    }
    if (!t.next) {
      end("他没说再追", "done");
      continue;
    }
    if (t.started && now - t.started > CHASE_MAX) {
      end("追了一整天了", "done");
      continue;
    }
    const due = Math.max(t.next, (t.last || 0) + minGap);
    if (missed(due)) {
      end("闹钟睡着的时候过了点", "done");
      continue;
    }
    if (!best || due < best.due) best = { due, task: t };
  }
  return { due: best ? best.due : null, task: best ? best.task : null, changes };
}

// 追着她的那一回，他写的下回几点：认得出的照办，最短五分钟；off、认不出、没写：不追了（回 0）
export function nextChase(raw, from, minGap = TASK_MIN_MS) {
  if (raw == null) return 0;
  const p = parseWake(splitWake(raw).when, from);
  if (!p || p.off) return 0;
  return Math.max(p.at, from + minGap);
}
