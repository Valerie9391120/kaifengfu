export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function fmtChars(n) {
  return n < 10000 ? `${n} 字` : `${(n / 10000).toFixed(1)} 万字`;
}
