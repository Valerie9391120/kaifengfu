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
// =====================================================

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
// 回 { due, why }：due 是几点醒（null 是先不醒：他说了 off）；why 是照哪一条定的（看日志、测试用）
export function planNext({ now, wakes = [], herLast = 0, mark = null, resumeAt = 0, gap = 30, max = 12, fails = [], tries = [], owed = 0 }) {
  // 七、她那句还没回上
  if (owed && now - owed < OWED_MS) return { due: null, why: "owed" };
  const lastWake = wakes.length ? wakes[wakes.length - 1] : 0;
  let due;
  let why;
  // 一、他自己定的
  const his = mark && !(herLast > mark.ts) ? parseWake(mark.value, mark.ts) : null;
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
  const counted = [...new Set(wakes.concat(tries))].sort((a, b) => a - b);
  const recent = counted.filter((t) => t > due - DAY_MS);
  if (recent.length >= max) {
    // 往回数二十四个钟头里已经醒满了：等最早的那一回滑出这二十四个钟头
    due = recent[recent.length - max] + DAY_MS;
    why = "cap";
  }
  return { due, why };
}
