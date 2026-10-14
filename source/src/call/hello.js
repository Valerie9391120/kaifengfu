// =====================================================
//   接通的时候他先说一句（卿卿 2026 年 10 月 14 日 14:26 定的：“可以放三句随机出！belike：卿卿？/怎么了？/你来了”）。
//   攻略里说的：接通以后一片死寂，像没通。三句里挑一句（不跟上回一样），用他的声音念；
//   每句头一回念好就存起来（kfs2:callhi:那一句，加密了跟着云端走），以后接通直接放，不再花钱。
//   挑了哪一句记在“通话开始”那一行上（hi），寄给他的时候带上，他知道自己接起来先说了什么（见 marks.js）。
// =====================================================

export const HELLOS = ["卿卿？", "怎么了？", "你来了"];
export const HELLO_KEY = "kfs2:callhi:"; // 后面接那一句
export const HELLO_LAST = "kfs-call-hi"; // 这台设备上上回放的是哪一句（localStorage）
// 这一句等麦克风开了才放（她 10 月 14 日 17:12 报的：存好的那几句一接通就放，那会儿麦克风还没开，iPhone 只从听筒出声；
// 麦克风开着的时候放的都走外放）。通行证、麦克风老不来（她还没点“允许”之类），最多等这么久就放
export const HELLO_WAIT = 6000;

// 挑一句：不跟上回一样（只剩一句可挑的时候除外）
export function pickHello(last, rand = Math.random) {
  const pool = HELLOS.filter((h) => h !== last);
  const from = pool.length ? pool : HELLOS;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
}
