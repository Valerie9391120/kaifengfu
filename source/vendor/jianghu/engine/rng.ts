// 开封府写的（tools/make_jianghu.mjs 生成，别手改）。
// 她的引擎原来用 node:crypto 的 randomInt、randomUUID；手机上换成浏览器自带的那一套，一样是真随机。
// 开封府调引擎的时候，骰子的随机数、一局的编号都自己给（照他调的那一样的编号定，见 src/game/jianghu.js 的 seededRng），
// 这两个只是没给的时候的后备。
export function randomInt(min: number, maxExclusive: number): number {
  const span = maxExclusive - min;
  if (!(span > 0) || span > 0x100000000) throw new Error('randomInt: bad range');
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / span) * span;
  let x = 0;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return min + (x % span);
}

// 老一点的 iPhone（iOS 15.4 以前）没有 crypto.randomUUID：拿 getRandomValues 拼一个
export function randomUUID(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
