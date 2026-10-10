// 重新算 src/lunar.js 里农历那几个节的表（中间那行字认节日用）。
// 用法（在 source/ 里）：npm install --no-save lunar-javascript@1 && node tools/make_lunar.cjs 2026 2060
// 算法是 lunar-javascript 的（寿星天文历那一套）。手机自带的农历（ICU）2027、2030 年的春节各错一天，所以不用它；
// 算完照样拿它对一遍，对不上的列出来，要去查公开的日子表核实（见开发说明“中间那行字”）。
const fs = require("fs");
const path = require("path");
const { Lunar } = require("lunar-javascript");
const [from, to] = [Number(process.argv[2] || 2026), Number(process.argv[3] || 2060)];
const FEASTS = [["春节", 1, 1], ["元宵", 1, 15], ["端午", 5, 5], ["七夕", 7, 7], ["中秋", 8, 15], ["重阳", 9, 9], ["腊八", 12, 8]];
const rows = [];
for (let y = from - 1; y <= to + 1; y++) {
  for (const [name, m, d] of FEASTS) rows.push([Lunar.fromYmd(y, m, d).getSolar().toYmd(), name]);
  rows.push([Lunar.fromYmd(y, 1, 1).next(-1).getSolar().toYmd(), "除夕"]);
}
const keep = rows.filter(([d]) => d >= `${from}-01-01` && d <= `${to}-12-31`).sort((a, b) => (a[0] < b[0] ? -1 : 1));
const icu = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "numeric", day: "numeric" });
const want = { 春节: "1-1", 元宵: "1-15", 端午: "5-5", 七夕: "7-7", 中秋: "8-15", 重阳: "9-9", 腊八: "12-8" };
for (const [d, n] of keep) {
  if (n === "除夕") continue;
  const p = Object.fromEntries(icu.formatToParts(new Date(d + "T12:00:00Z")).map((x) => [x.type, x.value]));
  if (`${p.month}-${p.day}` !== want[n]) console.log(`和手机自带的农历对不上：${d} ${n}（它说是 ${p.month}-${p.day}）`);
}
const by = {};
for (const [d, n] of keep) (by[d.slice(0, 4)] = by[d.slice(0, 4)] || []).push(d.slice(5, 7) + d.slice(8, 10) + n);
const file = path.join(__dirname, "..", "src", "lunar.js");
const src = fs.readFileSync(file, "utf8");
const table = Object.keys(by).sort().map((y) => `  "${y} ${by[y].join(" ")}",`).join("\n");
fs.writeFileSync(file, src.replace(/const TABLE = \[\n[\s\S]*?\n\];/, `const TABLE = [\n${table}\n];`).replace(/LUNAR_FROM = \d+/, `LUNAR_FROM = ${from}`).replace(/LUNAR_TO = \d+/, `LUNAR_TO = ${to}`));
console.log(`写好了：${from} 到 ${to} 年，${keep.length} 个日子`);
