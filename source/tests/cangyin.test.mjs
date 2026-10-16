// 藏音匣：不碰页面的零件（src/cangyin/parts.js）、转繁体（src/cangyin/s2t.js）、刻本体切出来的那些块（static/jinhui/）。
// 跟别的几份一样先用 esbuild 打成一份再跑（package.json 的 test:unit）
import fs from "node:fs";
import { BOX_KEY, BOX_AUDIO, BOX_TEXT_MAX, packEntry, readEntry, listEntries, findBySrc, boxSub, cnNum, cnDate, dayOf, lenOf, monthOf, monthKey, rngOf, paperOf, PAPERS, pickFrom, cutQuote } from "../src/cangyin/parts.js";
import { toTrad } from "../src/cangyin/s2t.js";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log("ok:", msg);
  } else {
    failed++;
    console.log("FAIL:", msg);
    if (process.env.KFS_FAILFAST) process.exit(1);
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- 存在哪儿、一条什么样 ----------
ok(BOX_KEY === "kfs2:cyx:" && BOX_AUDIO === "kfs2:cyxa:" && !BOX_AUDIO.startsWith(BOX_KEY), "一条存在 kfs2:cyx:，声音存在 kfs2:cyxa:（声音那一串不会被当成一条认）");
{
  const e = { src: "m1.0", chat: "c1", at: 1792000000000, text: "今天降温了。", trad: "", dur: 3.456, saved: 1792000100000 };
  const back = readEntry("x1", packEntry(e));
  ok(eq(back, { id: "x1", src: "m1.0", chat: "c1", at: 1792000000000, text: "今天降温了。", trad: "", dur: 3.5, saved: 1792000100000 }), "存一条、读回来：几秒留一位小数，别的原样");
  ok(JSON.parse(packEntry(e)).v === 1, "存的时候写着版本 1");
  ok(readEntry("x", packEntry({ ...e, text: "" })) === null && readEntry("x", packEntry({ ...e, text: "   " })) === null, "没有字的不算一条");
  ok(readEntry("x", "not json") === null && readEntry("x", JSON.stringify({ v: 2, text: "a" })) === null && readEntry("x", "null") === null && readEntry("x", "[]") === null, "认不出来的（坏的、版本不对的）不算一条");
  const odd = readEntry("y", JSON.stringify({ v: 1, text: "字", src: 5, chat: null, at: "x", trad: 7, dur: -3, saved: "z" }));
  ok(odd && odd.src === "" && odd.chat === "" && odd.at === 0 && odd.trad === "" && odd.dur === 0 && odd.saved === 0, "该是字的不是字、该是数的不是数：当没有");
  const long = "字".repeat(BOX_TEXT_MAX + 50);
  ok(readEntry("z", packEntry({ ...e, text: long, trad: long })).text.length === BOX_TEXT_MAX && JSON.parse(packEntry({ ...e, text: long })).text.length === BOX_TEXT_MAX, `字最多留 ${BOX_TEXT_MAX} 个`);
  ok(JSON.parse(packEntry({ text: "a", at: -5, dur: "x", saved: null })).at === 0 && JSON.parse(packEntry({ text: "a", at: -5, dur: "x" })).dur === 0, "存的时候负的、不是数的都当 0");
}
{
  const p = (id, at, saved, text = "话") => [BOX_KEY + id, packEntry({ src: "s" + id, at, saved, text })];
  const list = listEntries([p("a", 100, 5), p("b", 300, 1), p("c", 200, 9), p("d", 300, 7), [BOX_AUDIO + "a", "{}"], ["kfs2:chat:x", "[]"], [BOX_KEY + "bad", "{"], [BOX_KEY + "gone", null]]);
  ok(eq(list.map((e) => e.id), ["d", "b", "c", "a"]), "排成从新到旧（照他说的时候；同一刻的后存进来的在前）；声音那一串、别的钥匙、坏的、删了的都不算");
  ok(findBySrc(list, "sc").id === "c" && findBySrc(list, "nope") === null && findBySrc(list, "") === null, "照从哪条语音来找存过的那一条");
  const twice = listEntries([p("e1", 1, 50), [BOX_KEY + "e2", packEntry({ src: "se1", at: 1, saved: 10, text: "话" })]]);
  ok(findBySrc(twice, "se1").id === "e2", "同一条存过两回（两台设备各存了一回）：给最早存的那条");
}
ok(boxSub(0) === "还空着" && boxSub(1) === "藏了 1 条" && boxSub(12) === "藏了 12 条", "南衙那一行的小字：还空着、藏了几条");

// ---------- 日期、几秒 ----------
ok([1, 9, 10, 11, 14, 19, 20, 21, 28, 30, 31].map(cnNum).join(" ") === "一 九 十 十一 十四 十九 二十 二十一 二十八 三十 三十一", "一到三十一写成汉字");
{
  const at = new Date(2026, 9, 14, 8, 12).getTime();
  ok(cnDate(at) === "二〇二六年十月十四日", `纸条上的年月日：${cnDate(at)}`);
  ok(cnDate(new Date(2027, 0, 1).getTime()) === "二〇二七年一月一日" && cnDate(new Date(2030, 11, 31).getTime()) === "二〇三〇年十二月三十一日", "年份一个字一个字写，〇 是〇");
  ok(dayOf(at) === "2026 / 10 / 14" && dayOf(new Date(2026, 0, 5).getTime()) === "2026 / 01 / 05", "列表上的日期：2026 / 10 / 14，月和日补零");
  ok(monthOf(at, 2026) === "十月" && monthOf(at, 2027) === "2026 年 十月" && monthOf(new Date(2025, 11, 3).getTime(), 2026) === "2025 年 十二月", "按月断开的那一行：今年的只写月，别的年份带上年");
  ok(monthKey(at) === monthKey(new Date(2026, 9, 31, 23, 59).getTime()) && monthKey(at) !== monthKey(new Date(2026, 10, 1).getTime()) && monthKey(at) !== monthKey(new Date(2025, 9, 14).getTime()), "同一个月一段，换了月、换了年都另起一段");
}
ok([0, 0.4, 1, 3.4, 3.6, 59.4, 59.6, 60, 72, 120, 125].map(lenOf).join(" ") === "1秒 1秒 1秒 3秒 4秒 59秒 1分钟 1分钟 1分12秒 2分钟 2分5秒", "几秒：最少写 1 秒，满一分钟写几分几秒");

// ---------- 抽哪一条 ----------
{
  const r1 = rngOf("abc");
  const r2 = rngOf("abc");
  const a = [r1(), r1(), r1()];
  ok(eq(a, [r2(), r2(), r2()]) && a.every((x) => x >= 0 && x < 1) && rngOf("abd")() !== a[0], "照字串种出来的随机数：同一个字串同一串数，都在 0 到 1 之间");
  const papers = Array.from({ length: 400 }, (_, i) => paperOf("v" + i));
  ok(papers.every((k) => Number.isInteger(k) && k >= 0 && k < PAPERS) && paperOf("v7") === paperOf("v7") && new Set(papers).size === PAPERS, "每条配五张残纸里的一张，同一条一直是那一张，五张都用得上");
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const seen = new Set();
  let rep = false;
  let last = "";
  let x = 0;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280), x / 233280);
  for (let i = 0; i < 300; i++) {
    const e = pickFrom(list, last, rnd);
    if (e.id === last) rep = true;
    seen.add(e.id);
    last = e.id;
  }
  ok(!rep && seen.size === 3, "随机抽一条：不跟上一回同一条，三条都抽得到");
  ok(pickFrom([{ id: "a" }], "a").id === "a" && pickFrom([], "") === null && pickFrom(null, "") === null, "只有一条的时候就是它；空的抽不出来");
  ok(pickFrom(list, "zzz", () => 0.9999).id === "c" && pickFrom(list, "c", () => 0.9999).id === "b", "随机数到头也不出界");
}

// ---------- 一句话截成一行 ----------
{
  const w = (t) => [...t].length * 10; // 一个字十个单位宽
  ok(cutQuote("我在呢。慢慢说，不急。", w, 200) === "“我在呢。慢慢说，不急。”", "放得下：整句，前后引号");
  const c = cutQuote("今天降温了，出门把围巾带上。别嫌麻烦，就绕两圈。", w, 120);
  ok(c === "“今天降温了，出门把…”" && w(c) <= 120, `放不下：截短，省略号挨着后引号（${c}）`);
  const c2 = cutQuote("今天降温了，出门把围巾带上。", w, 90);
  ok(c2 === "“今天降温了…”", `截的地方正好是逗号：逗号不留（${c2}）`);
  ok(cutQuote("一二三四五六七八九十", w, 100) === "“一二三四五六七…”", "截的时候照放得下的最多的字");
  ok(cutQuote("  早。\n窗外的光  很好  ", w, 300) === "“早。 窗外的光 很好”", "换行、连着的空白并成一个空格，头尾的去掉");
  ok(cutQuote("嗯", w, 10) === "“…”", "一个字都放不下也不出错");
  ok(cutQuote("😀😀😀😀😀😀", w, 60) === "“😀😀😀…”", "表情这种两个码元的字不劈开");
}

// ---------- 转繁体 ----------
ok(toTrad("今天降温了，出门把围巾带上。别嫌麻烦，就绕两圈。") === "今天降溫了，出門把圍巾帶上。別嫌麻煩，就繞兩圈。", "转繁体：一句他说的话");
ok(toTrad("刚才那首歌我又听了一遍。头发长了。饭吃了没有？面条、干净、后来、里面、一只猫、台风") === "剛纔那首歌我又聽了一遍。頭髮長了。飯喫了沒有？麪條、乾淨、後來、裏面、一隻貓、颱風", "转繁体：照词转（头发→頭髮、后来→後來、干净→乾淨），OpenCC 标准繁体（纔、喫、裏）");
ok(toTrad("") === "" && toTrad(null) === "" && toTrad("OK，好啦 :) 123") === "OK，好啦 :) 123", "转繁体：空的、英文、数字、表情原样");

// ---------- 刻本体切出来的那些块 ----------
{
  const dir = new URL("../static/jinhui/", import.meta.url);
  const meta = JSON.parse(fs.readFileSync(new URL("slices.json", dir), "utf8"));
  const all = meta.slices.map((s) => s.c).join("");
  const set = new Set([...all]);
  ok(meta.family === "KFS Jinhui" && meta.slices.length > 40 && set.size === [...all].length, `刻本体切成 ${meta.slices.length} 块，一个字只在一块里`);
  ok(meta.slices.every((s) => fs.existsSync(new URL(s.f, dir)) && fs.statSync(new URL(s.f, dir)).size > 1000), "每一块都在");
  ok(fs.readFileSync(new URL("OFL.txt", dir), "utf8").includes("SIL OPEN FONT LICENSE") && fs.readFileSync(new URL("OFL.txt", dir), "utf8").includes("Reserved Font Name QIJI"), "授权跟着字体放在一起（OFL，写着保留字体名 QIJI）");
  const head = meta.slices[0].c;
  ok(["，", "。", "？", "！", "“", "”", "…", "〇", "一", "的", "了", "我", "你"].every((ch) => head.includes(ch)), "头一块里是标点、〇 和最常用的字");
  const need = "今天降溫了，出門把圍巾帶上。別嫌麻煩，就繞兩圈。剛纔那首歌我又聽了一遍。頭髮長了。飯喫了沒有？晚安，卿卿。二〇二六年十月十四日";
  const miss = [...need].filter((ch) => !set.has(ch));
  ok(!miss.length, `编的那几句（转了繁体）和年月日用到的字都有（缺：${miss.join("")}）`);
}

console.log(`\n通过 ${passed}  失败 ${failed}`);
process.exit(failed ? 1 : 0);
