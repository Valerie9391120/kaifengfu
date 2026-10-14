// =====================================================
//   他说话的时候她开口了没有（打断他；卿卿 10 月 14 日 17:26 定的“你一开口就打断”，18:16 列的做法她点了头，18:19 拿掉点屏幕打断）。
//   她手机上量过（见开发说明“量一量回声”）：回声消除开着，他的声音还是漏进麦克风不少（0.02 到 0.06），她说话 0.11 到 0.13，
//   拿一个死的门槛判不稳。这里照着他正在放的那一段算“这会儿该漏进来多少”：
//     该漏进来的 = 漏的比例 k × 他这会儿多响 + 屋里本来的底子；
//     他大声的地方漏得多，停顿的地方几乎不漏（他换气、句子中间停一下的时候她一开口最好认）。
//   麦克风比该漏进来的大出一截（MARGIN 倍，还得多出 ABS），又过了最低那条线（MIN），算“像她在说”；
//   最近 SPAN 毫秒里像她在说的加起来够 HOLD（半秒，“嗯”“对”这种短的不算），就是“她好像开口了”（suspect）：
//   App 那头先把他的声音压小、开听写，认出她说的字（不是他自己那句漏进去的，见 echoOf）才真停下来听她说；
//   认不出来（杂音、咳嗽）声音恢复、接着说。
//   漏的比例 k 边放边学：不像她在说的那些时候，麦克风 ÷ 他多响，取偏大的那一头（慢慢往下回落），比量回声时那一回更贴着眼下拿手机的样子。
//   估小了的话（声音开得大、手机拿得近），他自己的声音就像她在说，学不着（学的只是“不像她在说”的那些）：
//   压小、开听写以后认出来是他自己那句，App 那头叫 echoed()，k 一下子调到刚才那几帧那么大。
//   “嗯”“对”“哈哈”这种应声（她 17:26 定的“应声不算”）：短的半秒凑不够；长一点的，听写出来光是应声的字也不算（见 ackOnly）。
//   零件不碰浏览器，测试在 Node 里跑（tests/call.test.mjs）。
// =====================================================

export const MARGIN = 1.4; // 比该漏进来的大这么多倍
export const ABS = 0.015; // 还得多出这么多（该漏进来的很小的时候，倍数靠不住）
export const MIN = 0.03; // 最低这么响（她手机上量的屋里底子 0.0006 到 0.005，她说话 0.1 往上）
export const HOLD = 500; // 像她在说的加起来够这么久：算开口（“嗯”“对”这种短的不算）
export const SPAN = 800; // 在最近这么长一段里加（中间换口气的一两帧不算断）
export const CLEAR = 900; // 这么久一帧像她在说的都没有：算她没在说了
// 漏的比例一开始估多少：她量的漏进来 0.02 到 0.06（九成五那一档）；他的声音那一头（每二十毫秒的均方根，往回看 0.3 秒取最响的）
// 说话的时候一般 0.25 到 0.35，算下来 0.07 到 0.2。宁可估小：估大了她打断不了，还会越学越大（她的声音没过线，被当成漏进来的学进去）；
// 估小了顶多白压小一回他的声音，认出不是她，马上调上去（echoed）。在 Node 里拿编的声音模拟过（漏的比例 0.05 到 0.6、她 0.08 到 0.12）
export const K0 = 0.2;
export const K_MAX = 1.2;
export const K_DECAY = 0.996; // 每一帧往下回落一点（一帧八十几毫秒，十五秒回落一半）
export const K_UP = 0.02; // 漏得比估的多（又没过线）：每一帧往上追差的这么一点。追快了，她小声说话没过线的那几帧会把 k 抬高，越来越打断不了；往上主要靠 echoed
export const OUT_LEARN = 0.05; // 他这会儿这么响往上，才拿来学漏的比例（他很小声的时候，屋里一点动静一除就大得离谱）
const OUT_MIN = 0.01; // 他这会儿这么响往上，才算他在出声（不到的算他没在放，学屋里的底子）

// d：{ now(), out() 他这会儿多响（没在放就是 0） }
// 回 { feed({ rms }) → "suspect" | "clear" | null, reset(), since(), echoed(), view() }
export function createBarge(d) {
  let k = K0;
  let floor = 0.002;
  let hits = []; // 最近像她在说的那几帧：{ at, ms }
  let peak = 0; // 上回 reset 以来像她在说的那几帧里（他够响的时候），麦克风 ÷ 他多响 最大的（认出是他自己的声音的话，k 调到这么大）
  let lastAt = 0;
  let lastHit = 0;
  let suspect = false;
  const reset = () => {
    hits = [];
    peak = 0;
    lastAt = 0;
    lastHit = 0;
    suspect = false;
  };
  return {
    feed({ rms }) {
      const now = d.now();
      const ms = lastAt ? Math.min(250, Math.max(0, now - lastAt)) : 85;
      lastAt = now;
      const out = Math.max(0, Number(d.out()) || 0);
      const expected = k * out + floor;
      const hit = rms > Math.max(expected * MARGIN, expected + ABS, MIN);
      if (!hit) {
        // 学：他在放的时候漏的比例（偏大那一头：往上追得快，往下慢慢回落）；他没在放的时候屋里的底子
        if (out >= OUT_LEARN) {
          const r = rms / out;
          k = Math.min(K_MAX, r > k ? k + (r - k) * K_UP : Math.max(r, k * K_DECAY));
        } else if (out < OUT_MIN) floor = floor * 0.95 + Math.min(rms, MIN) * 0.05;
      }
      if (hit) {
        hits.push({ at: now, ms });
        lastHit = now;
        if (out >= OUT_LEARN) peak = Math.max(peak, rms / out);
      }
      hits = hits.filter((h) => now - h.at <= SPAN);
      const said = hits.reduce((s, h) => s + h.ms, 0);
      if (!suspect && said >= HOLD) {
        suspect = true;
        return "suspect";
      }
      if (suspect && now - lastHit >= CLEAR) {
        suspect = false;
        hits = [];
        return "clear";
      }
      return null;
    },
    reset,
    // 这一回像她在说的头一帧是几点开始的（开听写从那会儿往前一点送起，少送他自己的声音进去）；没有就是 0
    since: () => (hits.length ? hits[0].at - hits[0].ms : 0),
    // 刚才压小他、开听写的那一回不是她（听写认出来的是他自己那句，或者一个字没认出来）：漏的比估的多。
    // k 调到刚才那几帧那么大（一回最多翻一倍：万一是她咳了一声，不至于一下子抬得太高），再从头听
    echoed() {
      if (peak > 0) k = Math.min(K_MAX, k * 2, Math.max(k, peak));
      reset();
    },
    view: () => ({ k, floor, suspect }),
  };
}

// 认出来的字是不是他自己那句漏进去的：把两边的字（只算汉字、字母、数字）两个两个一对，
// 认出来的那些对里有一半往上在他刚说的那几句里出现过，就当是他自己的声音。认出来的不到两个字：还说不准（回 null）
export function echoOf(heard, said) {
  const clean = (s) =>
    String(s || "")
      .replace(/\[[A-Za-z][A-Za-z ,.'’-]{0,60}\]/g, "")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase();
  const h = clean(heard);
  if (h.length < 2) return null;
  const s = clean(said);
  const pairs = (t) => {
    const out = [];
    for (let i = 0; i + 1 < t.length; i++) out.push(t.slice(i, i + 2));
    return out;
  };
  const his = new Set(pairs(s));
  const mine = pairs(h);
  const same = mine.filter((p) => his.has(p)).length;
  return same / mine.length >= 0.5;
}

// 光是应声（她 17:26 定的“应声不算”）：嗯、哦、对、好、是的、好的、对对对、哈哈哈这种，整句都是这几个字凑的。
// 他说话的时候她这么应一声不打断他；他在想的时候她这么应一声，那一回也不作废（见 App 的 earsCbs）。
// “对了”“好想你”“是吗”这种带了别的字的不算应声
const ACK_ZH = /^[嗯恩唔呣哼哦噢喔啊呃额欸诶哎哈对好行是的呀嘞呐吧]+$/u;
const ACK_EN = /^(?:ok|okay|yeah|yep|yes|mm+|hmm+|uhhuh|right)+$/;
export function ackOnly(text) {
  const t = String(text || "")
    .replace(/\[[A-Za-z][A-Za-z ,.'’-]{0,60}\]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
  return !!t && t.length <= 8 && (ACK_ZH.test(t) || ACK_EN.test(t));
}

// 他被打断的那一段说到哪儿了：照放了几成截那一段的字（不算语气标签）。frac 0 到 1
export function cutAt(text, frac) {
  const t = String(text || "");
  const f = Math.max(0, Math.min(1, Number(frac) || 0));
  // 一个一个字数：语气标签整个跳过（不算字，也不截在它中间）
  const units = [];
  const re = /\[[A-Za-z][A-Za-z ,.'’-]{0,60}\]|[\s\S]/gu;
  let m;
  while ((m = re.exec(t)) !== null) units.push({ s: m[0], tag: m[0].length > 1 && m[0][0] === "[" });
  const total = units.filter((u) => !u.tag).length;
  const keep = Math.round(total * f);
  if (!keep) return "";
  // 留到第 keep 个字为止（前面的语气标签跟着留；截在一个标签后面的话，那个标签不留）
  let n = 0;
  let end = 0;
  units.forEach((u, i) => {
    if (u.tag || n >= keep) return;
    n += 1;
    end = i + 1;
  });
  return units
    .slice(0, end)
    .map((u) => u.s)
    .join("")
    .replace(/\s+$/, "");
}

// 两段接起来：两边都是英文（数字）的中间空一格，中文直接接
const glue = (a, b) => (!a ? b : !b ? a : /[A-Za-z0-9.,!?;:'"’”]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? a + " " + b : a + b);
const TAG_ANY = /\[[A-Za-z][A-Za-z ,.'’-]{0,60}\]\s*/g;

// 她打断了他，聊天里他的话怎么截（她 17:26 定的“只留念出来的”；App 的 cutCallReply 照这个改）。
// list：这一回排给他念的那几段，按念的先后：{ msgId 哪一条（接起来那一句是空的，不在聊天里，不管）, item 那一条里的第几样, text }；
// cut：sayer.interrupt() 交回来的 { playing: 正放着的那一段 { text, frac } 或 null, pending: 还没放的那几段 }。
// 回被打断的那几条（都念完了的不算）：[{ msgId, stop 从第几样起没念完, done { 第几样: [念完了的那几段] }, part 念了一半的那一段截到哪儿, spoken [念出来的，按先后] }]
export function cutPlan(list, cut) {
  const l = list || [];
  const pending = (cut && cut.pending) || [];
  const playing = (cut && cut.playing) || null;
  const open = l.length - pending.length - (playing ? 1 : 0); // 头一段没念完的
  if (open < 0 || open >= l.length) return [];
  const by = new Map();
  l.forEach((s, i) => {
    if (!s || !s.msgId) return;
    const e = by.get(s.msgId) || { msgId: s.msgId, stop: -1, done: {}, part: "", spoken: [] };
    if (i < open) {
      (e.done[s.item] = e.done[s.item] || []).push(s.text);
      e.spoken.push(s.text);
    } else if (e.stop < 0) {
      e.stop = s.item;
      if (i === open && playing) {
        e.part = cutAt(s.text, playing.frac);
        if (e.part) e.spoken.push(e.part);
      }
    }
    by.set(s.msgId, e);
  });
  return Array.from(by.values()).filter((e) => e.stop >= 0);
}

// 照 cutPlan 的一条截那一条回话的几样：
//   - 整样念完了的（还有排在前面、不用念的表情包之类）原样留着；
//   - 念了一半的那一样，换成念出来的那些字；一个字没念出来的不留；
//   - 后面没念到的都不要了；换头像的留着（电话里回话一到就换上了，她在通话页上看见了）；
//   - 一样字都没剩：留一个“……”（他还没开口就被打断了）。
// 回 { items, said 他说到哪儿（末尾十六个字，不带语气标签；一个字没念出来是空的） }
export function cutItems(items, plan) {
  const out = [];
  (items || []).forEach((it, j) => {
    if (!it) return;
    if (it.type === "avatar" || j < plan.stop) {
      out.push(it);
      return;
    }
    if (j === plan.stop) {
      const t = (plan.done[j] || []).concat(plan.part ? [plan.part] : []).reduce(glue, "").trim();
      if (t) out.push({ type: "text", text: t });
    }
  });
  if (!out.some((it) => it.type !== "avatar")) out.unshift({ type: "text", text: "……" });
  const said = (plan.spoken || [])
    .reduce(glue, "")
    .replace(TAG_ANY, "")
    .replace(/\s+/g, " ")
    .trim();
  return { items: out, said: Array.from(said).slice(-16).join("") };
}
