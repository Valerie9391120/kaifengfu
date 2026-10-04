// ---------- 日子 ----------
export const pad = (n) => String(n).padStart(2, "0");
export const WEEK = "日一二三四五六";
export const START = { y: 2026, m: 3, d: 11 }; // 2026年4月11日（月份从0数）
const utcDay = (y, m, d) => Date.UTC(y, m, d);

export function dayNumber(now) {
  return (
    Math.floor(
      (utcDay(now.getFullYear(), now.getMonth(), now.getDate()) -
        utcDay(START.y, START.m, START.d)) /
        86400000
    ) + 1
  );
}

function cnNum(n) {
  const d = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n === 2) return "两";
  if (n < 10) return d[n];
  if (n < 20) return "十" + d[n - 10];
  if (n < 100) return d[Math.floor(n / 10)] + "十" + d[n % 10];
  return String(n);
}

function annivName(months) {
  if (months % 12 === 0) return `${cnNum(months / 12)}周年`;
  if (months === 6) return "半年";
  if (months % 12 === 6) return `${cnNum(Math.floor(months / 12))}年半`;
  return `${cnNum(months)}个月`;
}

export function nextAnniv(now) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let ty = y;
  let tm = m;
  if (d > START.d) {
    tm += 1;
    if (tm > 11) {
      tm = 0;
      ty += 1;
    }
  }
  const months = (ty - START.y) * 12 + (tm - START.m);
  const days = Math.round(
    (utcDay(ty, tm, START.d) - utcDay(y, m, d)) / 86400000
  );
  return { months, days, name: annivName(months) };
}

export function dateLabel(now) {
  return `${now.getMonth() + 1}月${now.getDate()}日  星期${
    WEEK[now.getDay()]
  }`;
}

export function nowString(now) {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${
    WEEK[now.getDay()]
  } ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function dayDiff(ts, now) {
  const t = new Date(ts);
  return Math.round(
    (utcDay(now.getFullYear(), now.getMonth(), now.getDate()) -
      utcDay(t.getFullYear(), t.getMonth(), t.getDate())) /
      86400000
  );
}

export function sepLabel(ts, now) {
  const t = new Date(ts);
  const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const diff = dayDiff(ts, now);
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `昨天 ${hm}`;
  if (t.getFullYear() === now.getFullYear())
    return `${t.getMonth() + 1}月${t.getDate()}日 ${hm}`;
  return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日 ${hm}`;
}

export function shortDate(ts, now) {
  const t = new Date(ts);
  const diff = dayDiff(ts, now);
  if (diff === 0) return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  if (diff === 1) return "昨天";
  if (t.getFullYear() === now.getFullYear())
    return `${t.getMonth() + 1}月${t.getDate()}日`;
  return `${t.getFullYear()}/${t.getMonth() + 1}/${t.getDate()}`;
}

export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
