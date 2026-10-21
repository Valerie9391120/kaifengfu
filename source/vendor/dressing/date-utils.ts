export function parseDateOnly(s: string): Date {
  const [y,m,d]=s.split("-").map(Number);
  return new Date(Date.UTC(y,m-1,d));
}

export function dayDiff(a:string,b:string):number {
  return Math.floor((parseDateOnly(b).getTime()-parseDateOnly(a).getTime())/86400000);
}

export function isNextDay(previous: string | undefined, current: string): boolean {
  return Boolean(previous && dayDiff(previous,current)===1);
}
