export function dayDiff(a: string, b: string): number {
  const [ay,am,ad]=a.split("-").map(Number);
  const [by,bm,bd]=b.split("-").map(Number);
  return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/86400000);
}

export function isNextDay(previous: string | undefined, today: string): boolean {
  return Boolean(previous && dayDiff(previous, today)===1);
}
