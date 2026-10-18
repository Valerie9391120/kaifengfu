// 同页那一本手帐搬进开封府（见 src/tongye/、tools/tongye.mjs、vendor/tongye/KFS.md、开发说明“同页搬进来”那一节）：
// 日子换算（同页的“月.日”和开封府的“年-月-日”）、这一本的存档（算不算掺了一页、卡片、批注、点开没动不留）、原来那一版的页挪过来、
// 天气、框里那一页能要的几样（只认这一本的）、翻日记的工具看得到这一本（他留批注）、照原样拿同页那一页打补丁和安全规矩、
// 它要的字开封府自己带着（tools/tyfonts.mjs）。数据都是编的。
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fullOf, mdOf, toFull, toMd, pathToStore, idFromStore, lsKeyToStore, lsKeyFromStore, yearAgoOf } from "../src/tongye/dates.js";
import {
  TY_KV, TY_LS, TY_IMG, TY_BLOCKS, TOOL_PART, madeOf, madeDays, infoOf, notesOf, addNoteTo, dropNoteOf, ensureDay, openMode, quotesOfStk,
  migrateOld, migrateAll, fillWeather, chatOf, makeServer, okKey, okId, okDate, pageTextOf, dayTextOf, pageBitsOf, extrasOf, addHisNote, tyReader, onTyChanged, todayFor,
  TY_LAYOUTS, TY_STYLES, TY_STALE, tyClean, tyKitList, herLookOf, tyArrangeAsk, parseTyArrange, makingDay, failedDay, arrangedDay, settleStale, askOf, tyTag, dayRecOf,
} from "../src/tongye/host.js";
import { DIARY_TOOLS, DIARY_NAMES, NOTE_PARTS, runDiaryCalls } from "../src/diaryTools.js";
import { DIARY_SECTION } from "../src/prompt/system.js";
import { JZ_KEY, JZN_KEY } from "../src/jz/model.js";
import { PATCHES, makeTongye, tyKit } from "../tools/tongye.mjs";
import { TY_FONT_PKGS, parseSpec, tyFontNeeds, makeTyFonts } from "../tools/tyfonts.mjs";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 假的存档（跟 src/store.js 一个样子：peek 当场取，get/set/del 等一下；set 存不上回 false）
const mkStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  const s = {
    m,
    full: false,
    peek: (k) => (m.has(k) ? m.get(k) : null),
    get: async (k) => (m.has(k) ? m.get(k) : null),
    set: async (k, v) => {
      if (s.full) return false;
      m.set(k, v);
      return true;
    },
    del: async (k) => {
      m.delete(k);
    },
    keys: (p = "") => [...m.keys()].filter((k) => k.startsWith(p)),
  };
  return s;
};
const J = (o) => JSON.stringify(o);
const P = (s, k) => JSON.parse(s.peek(k));

// =====================================================
// 日子：同页的“月.日”和开封府的“年-月-日”
// =====================================================
const T0 = new Date(2026, 9, 18, 2, 0); // 2026 年 10 月 18 日凌晨两点
ok(fullOf("10.18", T0) === "2026-10-18" && fullOf("1.5", T0) === "2026-01-05" && fullOf("10.19", T0) === "2025-10-19", "月.日 → 不晚于今天、离今天最近的那一天（今天算；比今天晚的是去年的）");
ok(fullOf("2.29", T0) === "2024-02-29" && fullOf("2.30", T0) === null && fullOf("13.1", T0) === null && fullOf("x", T0) === null, "2 月 29 日往前找有的那一年；没有的日子、认不出的回 null");
ok(mdOf("2026-10-18", T0) === "10.18" && mdOf("2025-10-19", T0) === "10.19" && mdOf("2025-10-18", T0) === null && mdOf("2026-10-19", T0) === null && mdOf("2026-02-30", T0) === null,
  "年-月-日 → 月.日：今天往前一年以内的才换得回来（一年前的同一天、比今天晚的、没有的日子都不行）");
const T1 = new Date(2027, 9, 18, 9, 0);
ok(pathToStore("day/10.18", T0) === "day/2026-10-18" && pathToStore("day/10.18", T1) === "day/2027-10-18" && idFromStore("day", "2026-10-18", T1) === null,
  "过了一年：今年的 10.18 和去年的 10.18 存成两条，各存各的；去年那条在今年看不见（不会盖掉）");
ok(pathToStore("notes/n1", T0) === "notes/n1" && pathToStore("cfg/main", T0) === "cfg/main" && pathToStore("page/2.30", T0) === null && pathToStore("x", T0) === "x" && idFromStore("notes", "2026-10-18", T0) === "2026-10-18",
  "只有一天一条的那几样（day、page、gens、wx）换；批注、设置原样；换不了的回 null");
ok(eq(toFull({ "9.27": { day: "9.27", t: "x" }, list: [{ day: "10.1" }], day: 3 }, T0), { "2026-09-27": { day: "2026-09-27", t: "x" }, list: [{ day: "2026-10-01" }], day: 3 }),
  "存进去：像月.日的键、叫 day 的字段（字符串）换成年-月-日，套着的一层一层都换");
ok(eq(toMd({ "2025-10-18": 1, "2026-10-01": { day: "2026-10-01" }, notes: [{ day: "2025-01-01" }] }, T0), { "2025-10-18": 1, "10.1": { day: "10.1" }, notes: [{ day: "2025-01-01" }] }),
  "取出来：换不回来的键、day 字段都原样留着（对不上同页里的哪一天，等于看不见；存回去也还是它，不丢）");
// 废纸篓里记着“day/10.20”这样的键：删的时候换成年-月-日，找回的时候换得回来的换回去、换不回来的照年-月-日写回原来那一年
const SNAP = toFull({ day: "10.20", docs: { "day/10.20": { day: "10.20", title: "x" }, "page/10.20": { stk: [] }, "notes/n1": { day: "10.20" } } }, T0);
ok(eq(Object.keys(SNAP.docs), ["day/2025-10-20", "page/2025-10-20", "notes/n1"]) && SNAP.day === "2025-10-20" && SNAP.docs["notes/n1"].day === "2025-10-20", "删的时候：废纸篓里那几条的键、日子都换成年-月-日（10.20 是去年的）");
const T2 = new Date(2026, 9, 21, 9, 0);
const BACK = toMd(SNAP, T2);
ok(eq(Object.keys(BACK.docs), ["day/2025-10-20", "page/2025-10-20", "notes/n1"]) && BACK.day === "2025-10-20" && pathToStore("day/2025-10-20", T2) === "day/2025-10-20",
  "过了一年那一天再找回：换不回来，照年-月-日原样，写回 2025-10-20（不会写到今年的 10.20 上，盖掉别的日子）");
ok(eq(Object.keys(toMd(SNAP, T0).docs), ["day/10.20", "page/10.20", "notes/n1"]), "一年以内找回：照同页的样子换回月.日");
// 2 月 29 日那天：3.1 是去年的 3 月 1 日，换出去也换得回来
const LEAP = new Date(2028, 1, 29, 9, 0);
ok(fullOf("3.1", LEAP) === "2027-03-01" && mdOf("2027-03-01", LEAP) === "3.1" && mdOf("2027-02-28", LEAP) === null && fullOf("2.28", LEAP) === "2028-02-28" && yearAgoOf(LEAP).getDate() === 28,
  "2 月 29 日那天：一年前是 2 月 28 日（3.1 换出去是去年的 3 月 1 日，也换得回来）");
ok(lsKeyToStore("journalPage:9.27", T0) === "journalPage:2026-09-27" && lsKeyToStore("journalCfg", T0) === "journalCfg" && lsKeyFromStore("journalLook:2026-09-27", T0) === "journalLook:9.27" && lsKeyFromStore("journalLook:2024-01-01", T0) === null && lsKeyFromStore("stkUse", T0) === "stkUse",
  "这台设备上的键：冒号后面是日子的那几样换，别的原样");

// =====================================================
// 这一本的存档：算不算掺了一页、卡片、批注；点开不写，头一回动手才起那一天
// =====================================================
const D = "2026-10-12";
const s1 = mkStore();
ok(openMode(s1, D) === "day" && s1.keys(TY_KV).length === 0, "这一天还没有页：点开是那一天的那一屏（交给光义、自己拼），什么都不写");
let pushed = [];
const offP = onTyChanged((keys) => pushed.push(...keys));
s1.m.set(`${TY_KV}wx/${D}`, J({ at: "某城", code: 61, hi: 15.4, lo: 9.6, mm: 3, wind: 20, sun: "18:21", src: "open-meteo" }));
ok((await ensureDay(s1, D, 1000)) === true && P(s1, `${TY_KV}day/${D}`).by === "her" && P(s1, `${TY_KV}day/${D}`).wx.sun === "18:21" && P(s1, `${TY_KV}day/${D}`).at === "某城" && pushed.includes(`${TY_KV}day/${D}`),
  "她头一回动手：起那一天的 day（她自己拼的），取过的天气一起写进去（天气签照它画），告诉开着的框");
ok((await ensureDay(s1, D, 2000)) === false && P(s1, `${TY_KV}day/${D}`).ts === 1000, "已经有了：不再起，不盖");
offP();
ok(!madeOf(s1, D) && eq(madeDays(s1), []) && infoOf(s1, D) === null && pageTextOf(s1, D) === "" && openMode(s1, D) === "day", "空的一页（只有天气）不算掺了：日历上不标、没有卡片、他翻日记也看不到");
s1.m.set(`${TY_KV}page/${D}`, J({ stk: [{ c: "kao", k: "٩(ˊᗜˋ*)و", who: "me", x: 1, y: 2, me1: 1 }] }));
ok(!madeOf(s1, D), "同页点开的时候替他放的那一张（me1）不算掺了东西");
s1.m.set(`${TY_KV}page/${D}`, J({ stk: [{ c: "kao", k: "x", who: "me", me1: 1 }, { c: "stamp", k: "feng", who: "me", x: 1, y: 2 }] }));
ok(madeOf(s1, D) && openMode(s1, D) === "view" && eq(madeDays(s1), [D]), "她点了“让光义贴一张”贴上的也算（同同页：除了那一张 me1 都算）：点开是看");
s1.m.set(`${TY_KV}page/${D}`, J({ stk: [], hide: ["wx"] }));
ok(madeOf(s1, D), "藏了哪几块也算（同同页的 worth）");
s1.m.set(`${TY_KV}page/${D}`, J({ stk: [] }));
s1.m.set(`${TY_KV}gens/${D}`, J({ list: [{ n: 1 }] }));
ok(madeOf(s1, D), "存过一代也算（只靠骰子摆的一页也是她存下来的）");
s1.m.delete(`${TY_KV}gens/${D}`);
s1.m.delete(`${TY_KV}day/${D}`);
s1.m.set(`${TY_KV}page/${D}`, J({ stk: [{ c: "emoji", k: "fox", who: "her", x: 1, y: 2 }] }));
ok(madeOf(s1, D) && eq(madeDays(s1), [D]) && infoOf(s1, D).sub === "单栏流 × 青墨素纸", "只有 page 没有 day 的（起 day 那一下没存上）也算，日历上照样标");

const s2 = mkStore({
  [`${TY_KV}day/${D}`]: J({
    day: D, by: "me", title: "泡桐花", at: "某城", layout: "column", style: "qingmo",
    wx: { code: 61, hi: 15.4, lo: 9.6 },
    photos: [{ src: "kfsimg:p1", role: "hero" }, { src: "kfsimg:p2", role: "pair" }, { src: "kfsimg:p3", role: "pair" }, { src: "kfsimg:p4", role: "sh" }],
    chat: [{ w: "her", t: "09:46", p: "今天看到泡桐花" }, { w: "me", t: "09:47", p: "拍给我看" }],
    text: { p1: "下午去了运河边。", cap: "运河边", pen: { text: "[[紫色]]的，一串一串", margin: "记得" }, p2: "<her>这张</her>是她拍的" },
    food: { meal: "午饭", at: "米线店", items: [["番茄牛肉米线", 5], ["冰粉", 4]] },
  }),
  [`${TY_KV}page/${D}`]: J({
    stk: [
      { c: "text", k: "t1", who: "her", m: "好看" },
      { c: "pic", k: "m1", who: "her", m: "运河边上" },
      { c: "emoji", k: "fox", who: "her" },
      { c: "kao", k: "٩(ˊᗜˋ*)و", who: "me", me1: 1 },
      { c: "qsel", k: "C:" + encodeURIComponent(JSON.stringify([{ d: "10.12", w: "her", t: "09:50", p: "风好大 拍糊了", src: "原话" }])), who: "her" },
      { c: "qsel", k: "c:10.12#3", who: "her" },
    ],
    hide: ["wx"],
  }),
  [`${TY_LS}journalLook:${D}`]: J({ layout: "polaroid", style: "washi" }),
  [`${TY_KV}mine/m1`]: J({ id: "m1", src: "kfsimg:m1img", day: D }),
});
const info = infoOf(s2, D);
ok(info && info.title === "泡桐花" && info.sub === "拍立得墙 × 和纸" && info.by === "him" && info.heroId === "p1", "卡片：标题、版式 × 风格（照她这一天挑的）、他排的、主照片那张的编号");
s2.m.set(`${TY_KV}day/2026-10-13`, J({ day: "2026-10-13", by: "her", title: "" }));
s2.m.set(`${TY_KV}page/2026-10-13`, J({ stk: [{ c: "pic", k: "m1", who: "her" }] }));
ok(infoOf(s2, "2026-10-13").heroId === "m1img" && infoOf(s2, "2026-10-13").sub === "单栏流 × 青墨素纸", "她自己拼、只放了一张照片的：那张当主照片；没挑过版式风格的照同页默认的");

ok(eq((await addNoteTo(s2, D, "her", "这天真好", Date.UTC(2026, 9, 12, 14))).map((n) => [n.who, n.text, n.b]), [["her", "这天真好", ""]]), "闲笔集里留一条：存成同页的一条批注（贴在页角）");
const nHim = (await addNoteTo(s2, D, "him", "我也记得", Date.UTC(2026, 9, 12, 15))).pop();
ok(nHim.who === "me" && notesOf(s2, D).length === 2 && notesOf(s2, "2026-10-13").length === 0, "他的那条在同页里叫 me；别的日子不掺");
const root = notesOf(s2, D)[0];
s2.m.set(`${TY_KV}notes/re1`, J({ id: "re1", day: D, who: "me", text: "回你", at: Date.UTC(2026, 9, 12, 16), re: root.id }));
ok((await dropNoteOf(s2, D, root.id)).length === 1 && s2.peek(`${TY_KV}notes/re1`) === null, "删一条：回它的那几条一起删");
await dropNoteOf(s2, D, nHim.id);

// =====================================================
// 翻日记的工具看得到这一本；他留批注
// =====================================================
const txt = pageTextOf(s2, D);
ok(txt.startsWith("手帐：有一页（你排的；版式 拍立得墙，风格 和纸）") && txt.includes("标题：泡桐花") && txt.includes("正文：下午去了运河边。") && txt.includes("红笔：紫色的，一串一串（页边：记得）") && txt.includes("截图说明：这张是她拍的"),
  "他翻到那一天：谁排的、版式风格、标题、正文、红笔（记号去掉）、截图说明");
ok(txt.includes("照片 5 张：主照片（底下写着：运河边）、双联照 2 张、截图 1 张、她贴上去的 1 张（底下写着：“运河边上”）") && txt.includes("摆的原话：09:46 卿卿：今天看到泡桐花｜09:47 你：拍给我看"),
  "照片他看不见：写明几张、各是什么、她在照片底下写的；摆的原话带着几点、谁说的");
ok(txt.includes("她贴的原话：09:50 卿卿：风好大 拍糊了") && txt.includes("引用的便签 1 张（这边认不出写的是哪几句）"), "她从引用栏贴到纸上的原话也念（认不出的那种写明有一张）");
ok(txt.includes("票根：午饭 米线店：番茄牛肉米线、冰粉") && txt.includes("她在页上写的字：“好看”") && txt.includes("贴纸 1 张") && txt.includes("她藏起来的：天气签") && !txt.includes("天气："),
  "票根、她写的字、贴纸几张（同页替他放的那一张不算）；藏起来的天气不念，写明藏了");
ok(pageBitsOf(s2, D).includes("紫色的，一串一串") && pageBitsOf(s2, D).includes("好看") && pageBitsOf(s2, D).includes("运河边上") && pageBitsOf(s2, D).includes("风好大 拍糊了") && !pageBitsOf(s2, D).includes("[["),
  "按词找的时候：页上写着的字（记号去掉）、照片底下写的、她贴的原话");
ok(quotesOfStk({ c: "qsel", k: "C:坏了%" }) === null && quotesOfStk({ c: "text", k: "C:x" }) === null, "认不出的原话便签不出错");
await addNoteTo(s2, D, "her", "这天真好", new Date(2026, 9, 12, 22, 0).getTime());
const r2 = notesOf(s2, D)[0];
s2.m.set(`${TY_KV}notes/re2`, J({ id: "re2", day: D, who: "me", text: "嗯", at: new Date(2026, 9, 12, 23, 5).getTime(), re: r2.id, b: "" }));
s2.m.set(`${TY_KV}notes/n3`, J({ id: "n3", day: D, who: "her", text: "这张", at: new Date(2026, 9, 12, 23, 30).getTime(), re: null, b: "he", fx: 0.5, fy: 0.5 }));
const dt = dayTextOf(s2, D);
ok(dt.includes("批注 3 条：\n  她（10月12日 22:00）：这天真好\n    你回（10月12日 23:05）：嗯\n  她（10月12日 23:30，贴在主照片旁边）：这张"), "批注跟在手帐后面：回的那条跟在它回的那一条底下，贴在哪一块旁边照同页的叫法");
ok(dayTextOf(s2, "2026-10-14") === "" && dayTextOf(mkStore({ [`${TY_KV}notes/x`]: J({ id: "x", day: "2026-10-14", who: "her", text: "只有批注", at: 1 }) }), "2026-10-14").startsWith("批注 1 条："), "什么都没有回空；只有批注就只写批注");

const BOOK = { "2026-10": { [D]: { her: { text: "她的日记", moods: ["happy"] } } } };
const s3 = mkStore({
  ...Object.fromEntries(s2.m),
  [`${TY_KV}day/2026-10-14`]: J({ day: "2026-10-14", by: "her", title: "只有手帐的一天", text: { p1: "灯笼" } }),
  [`${TY_KV}notes/n9`]: J({ id: "n9", day: "2026-10-15", who: "me", text: "灯笼那天", at: new Date(2026, 9, 15, 23).getTime() }),
});
s3.m.delete(`${TY_KV}day/2026-10-13`);
s3.m.delete(`${TY_KV}page/2026-10-13`);
const reader = { months: async () => Object.keys(BOOK), month: async (ym) => BOOK[ym] || {}, ...tyReader(s3) };
const NOW = new Date(2026, 9, 18, 2, 0);
const call = (name, input, id = "toolu_" + Math.random().toString(36).slice(2)) => ({ id, name, input });
ok(DIARY_TOOLS.map((t) => t.name).join() === "diary_list,diary_read,diary_search,diary_note" && DIARY_NAMES.has("diary_note") && DIARY_TOOLS[3].input_schema.required.join() === "date,text", "翻日记的四样工具照旧：翻目录、读全文、按词找、留批注");
ok(eq(DIARY_TOOLS[3].input_schema.properties.part.enum, Object.keys(NOTE_PARTS)) && Object.keys(NOTE_PARTS).every((k) => TY_BLOCKS[TOOL_PART[k]]) && DIARY_TOOLS[3].input_schema.properties.part.description.includes("hero 主照片"),
  "留批注贴在哪一块：他挑的那几样都对得上同页的零件，说明里写着同页的叫法");
ok(DIARY_SECTION.includes("diary_note") && DIARY_SECTION.includes("手帐") && DIARY_SECTION.includes("批注"), "名帖里那一段写着手帐、批注、怎么留");
const [ls] = await runDiaryCalls([call("diary_list", { month: "2026-10" })], reader, NOW);
ok(ls.out.includes("有日记、手帐或批注的 3 天") && ls.out.includes("10月12日 星期一｜她：心情 开心；“她的日记”｜你：没写｜手帐：有｜批注 3 条") && ls.out.includes("10月14日 星期三｜她：没写｜你：没写｜手帐：有") && ls.out.includes("10月15日 星期四｜她：没写｜你：没写｜批注 1 条"),
  "目录：有手帐、有批注的日子标着；没写日记、只有手帐或批注的那天也列");
const [rd] = await runDiaryCalls([call("diary_read", { dates: [D, "2026-10-14"] })], reader, NOW);
ok(rd.out.includes("手帐：有一页（你排的；版式 拍立得墙，风格 和纸）") && rd.out.includes("标题：泡桐花") && rd.out.includes("批注 3 条：") && rd.out.includes("她（10月12日 22:00）：这天真好"), "读全文：那天的手帐和批注跟着一起");
ok(rd.out.includes("【2026年10月14日 星期三】\n这天两个人都没写日记。\n\n手帐：有一页（她自己拼的") && rd.out.includes("标题：只有手帐的一天"), "没写日记、只有手帐的那天：照样给手帐");
const [sr] = await runDiaryCalls([call("diary_search", { query: "灯笼" })], reader, NOW);
ok(sr.out.includes("一共 2 处") && sr.out.includes("10月14日 手帐上写的：只有手帐的一天 灯笼") && sr.out.indexOf("10月15日 你的批注：灯笼那天") < sr.out.indexOf("10月14日 手帐上写的："), "按词找：手帐上写的字、批注也找，新的在前");
const [nt] = await runDiaryCalls([call("diary_note", { date: D, text: "  那天的泡桐花  ", part: "hero" }, "toolu_n9")], reader, NOW);
const mine = P(s3, `${TY_KV}notes/toolu_n9`);
ok(!nt.err && nt.note === "批注了日记 · 10月12日" && nt.out.includes("的手帐上，主照片旁边") && mine.who === "me" && mine.day === D && mine.text === "那天的泡桐花" && mine.b === "he" && mine.at === NOW.getTime(),
  "他留批注：存成同页的一条（他的、那一天、贴在主照片旁边、几点），小字“批注了日记 · 10月12日”");
await runDiaryCalls([call("diary_note", { date: D, text: "又一回" }, "toolu_n9")], reader, NOW);
ok(P(s3, `${TY_KV}notes/toolu_n9`).text === "那天的泡桐花" && notesOf(s3, D).filter((n) => n.id === "toolu_n9").length === 1, "同一步替他办两回（两台设备）：只留一条（编号就是他调的那一样的编号）");
const [n0] = await runDiaryCalls([call("diary_note", { date: "2026-10-13", text: "没有手帐的一天也能留", part: "hero" })], reader, NOW);
const n0r = notesOf(s3, "2026-10-13")[0];
ok(!n0.err && n0.out.includes("那一天底下") && n0r && n0r.b === "" && n0r.who === "me", "没有手帐的那天也能留（留在那一天上，不贴哪一块）");
const [nb] = await runDiaryCalls([call("diary_note", { date: D, text: "贴哪儿呢", part: "坏的" })], reader, NOW);
ok(!nb.err && nb.out.includes("那一天底下") && notesOf(s3, D).find((n) => n.text === "贴哪儿呢").b === "", "认不出的零件不贴");
const [nf] = await runDiaryCalls([call("diary_note", { date: "2026-12-01", text: "x" })], reader, NOW);
const [nr] = await runDiaryCalls([call("diary_note", { date: D, text: "x" })], { months: async () => [], month: async () => ({}) }, NOW);
ok(nf.err && nr.err && nr.out.includes("留不了"), "还没到的日子、开封府没接上：都没留成");
s3.full = true;
const [nx] = await runDiaryCalls([call("diary_note", { date: D, text: "存不上" })], reader, NOW);
ok(nx.err, "存不上：没留成（记成出错，他知道）");
s3.full = false;
const ex3 = await extrasOf(s3);
ok([...ex3.jz].sort().join() === [D, "2026-10-14"].join() && ex3.notes.get(D) === 5 && ex3.notes.get("2026-10-13") === 1 && ex3.notes.get("2026-10-15") === 1, "哪几天有手帐、哪几天几条批注（目录用）");

// =====================================================
// 原来那一版（src/jz/）掺的页挪过来
// =====================================================
const at = new Date(2026, 9, 17, 16, 0).getTime();
const OLD = {
  v: 1, day: "2026-10-17", layout: "polaroid", style: "newsprint", at,
  wx: { code: 3, hi: 21, lo: 12, city: "某城", src: "open-meteo" },
  arr: { by: "him", at, title: "原来的标题", body: "原来的正文", cap: "", pen: { text: "[[红笔]]一句", margin: "" },
    quotes: [{ id: "q1", w: "her", t: "16:12", p: "今天看到泡桐花了" }, { id: "q2#0", w: "him", t: "16:13", p: "好看" }],
    photos: [{ id: "jzold1", role: "hero", note: "" }, { id: "jzold2", role: "more", note: "米线" }], stickers: [{ k: "e:fox", x: 0.5, y: 0.2, r: 0, s: 1 }, { k: "h:heart", x: 0.1, y: 0.1, r: 0, s: 1 }] },
  mine: { edit: { title: "她改的标题" }, hide: ["wx", "mood"], stickers: [{ k: "k:(｀・ω・´)", x: 0.5, y: 0.6, r: 10, s: 1.2 }], texts: [{ id: "t1", m: "那天真好", x: 0.3, y: 0.9, r: -4, s: 1 }], at },
};
const OLDN = [{ id: "nold1", who: "her", text: "˚ʚ(´◡`)ɞ˚", at, part: "hero" }, { id: "nold2", who: "him", text: "我记得", at: at + 1, part: "mood" }];
const s4 = mkStore({ [JZ_KEY + "2026-10-17"]: J(OLD), [JZN_KEY + "2026-10-17"]: J(OLDN), [JZ_KEY + "2026-10-16"]: "坏了{", [JZ_KEY + "坏的日子"]: J(OLD) });
const moved = await migrateAll(s4, 5000);
const R4 = P(s4, `${TY_KV}day/2026-10-17`);
const P4 = P(s4, `${TY_KV}page/2026-10-17`);
ok(moved.length === 1 && moved[0].day === "2026-10-17" && eq(moved[0].lost, ["h:heart"]), "挪过来一页（坏的存档、认不出的日子不挪）；同页里没有一样的手绘贴纸记下来挪不过来");
ok(R4.title === "她改的标题" && R4.by === "me" && R4.layout === "polaroid" && R4.style === "news" && R4.at === "某城" && R4.text.p1 === "原来的正文" && R4.text.pen.text === "[[红笔]]一句" && R4.wx.code === 3,
  "那一天（同页的 day）：标题照她改的、他排的、拍立得墙、报纸、正文、红笔、天气");
ok(eq(R4.photos.map((p) => [p.src, p.role]), [["kfsimg:jzold1", "hero"], ["kfsimg:jzold2", ""]]) && eq(R4.chat, [{ w: "her", t: "16:12", p: "今天看到泡桐花了" }, { w: "me", t: "16:13", p: "好看" }]), "照片还是那几张图（编号不变）；原话照原样，他叫 me");
ok(P4.stk.some((x) => x.c === "emoji" && x.k === "fox" && x.who === "me") && P4.stk.some((x) => x.c === "kao" && x.k === "(｀・ω・´)" && x.who === "her") && P4.stk.some((x) => x.c === "text" && x.m === "那天真好" && x.who === "her") && eq(P4.hide, ["wx"]),
  "贴纸、她写的字挪到页上（谁贴的照旧）；藏起来的天气照样藏（心情同页没有这一块）");
ok(P(s4, `${TY_KV}notes/nold1`).b === "he" && P(s4, `${TY_KV}notes/nold1`).who === "her" && P(s4, `${TY_KV}notes/nold2`).who === "me" && P(s4, `${TY_KV}notes/nold2`).b === "", "批注挪成同页的批注：贴在主照片旁边的照旧，心情旁边的（同页没有）贴在页角");
ok(s4.peek(`${TY_KV}moved/2026-10-17`) && s4.peek(JZ_KEY + "2026-10-17") && (await migrateAll(s4, 6000)).length === 0, "记一笔挪过；原来那一版的存档留着；再挪一回什么都不动");
const s5 = mkStore({ [JZ_KEY + "2026-10-17"]: J(OLD), [`${TY_KV}day/2026-10-17`]: J({ day: "2026-10-17", title: "同页里已经有了" }) });
ok((await migrateAll(s5)).length === 0 && P(s5, `${TY_KV}day/2026-10-17`).title === "同页里已经有了", "同页里那一天已经有页了：不挪，不盖");
// 上一版只有批注、没有页的那几天
const s6n = mkStore({
  [JZN_KEY + "2026-10-16"]: J([{ id: "nn1", who: "her", text: "只有批注的一天", at: at - 86400000 }, { id: "坏的 编号", who: "him", text: "编号不对的那条", at: at - 86000000 }]),
  [JZN_KEY + "2026-10-15"]: J([{ id: "nn9", who: "her", text: "已经挪过", at: at - 2 * 86400000 }]),
  [`${TY_KV}notes/nn9`]: J({ id: "nn9", day: "2026-10-15", who: "her", text: "已经挪过", at: 1 }),
});
const mv6 = await migrateAll(s6n, 7000);
const n16 = notesOf(s6n, "2026-10-16");
ok(n16.length === 2 && n16[0].text === "只有批注的一天" && n16[0].who === "her" && n16[1].who === "me" && /^jzn20261016\d$/.test(n16[1].id) && s6n.peek(`${TY_KV}moved/2026-10-16`),
  "上一版只有批注没有页的那天：批注也挪过来（他的叫 me，编号不规矩的另起一个），记一笔挪过");
ok(notesOf(s6n, "2026-10-15").length === 1 && mv6.some((m) => m.day === "2026-10-15" && m.notes === 0), "已经挪过来的那条不再挪一份");
await dropNoteOf(s6n, "2026-10-16", "nn1");
ok((await migrateAll(s6n, 8000)).length === 0 && notesOf(s6n, "2026-10-16").length === 1, "她在这边删了的：不会从上一版的存档里又冒出来");

// =====================================================
// 天气
// =====================================================
const wxCalls = [];
const fakeWx = async (city, day) => {
  wxCalls.push([city.name, day]);
  return { code: 61, hi: 15.4, lo: 9.6, mm: 3.2, wind: 21.7, sun: "18:21" };
};
const s6 = mkStore({ [`${TY_KV}day/${D}`]: J({ day: D, by: "her", title: "x" }) });
let told = [];
const off = onTyChanged((keys) => told.push(...keys));
ok((await fillWeather(s6, D, {}, fakeWx)) === null && wxCalls.length === 0, "没填在哪儿：不取");
const w1 = await fillWeather(s6, D, { city: { name: "某城", lat: 12.3456, lon: -45.6789 } }, fakeWx);
ok(w1 && eq(P(s6, `${TY_KV}wx/${D}`), { at: "某城", code: 61, hi: 15.4, lo: 9.6, mm: 3.2, wind: 21.7, sun: "18:21", src: "open-meteo" }) && P(s6, `${TY_KV}day/${D}`).wx.sun === "18:21" && P(s6, `${TY_KV}day/${D}`).at === "某城",
  "取一回：写进同页的 wx，也写进那一天的页（连日落，不然同页收这一页的时候日落没了）");
ok(told.includes(`${TY_KV}wx/${D}`), "开着的框知道了（TongyeFrame 听着）");
ok((await fillWeather(s6, D, { city: { name: "某城", lat: 1, lon: 2 } }, fakeWx)) === null && wxCalls.length === 1, "取过的不再取");
s6.m.set(`${TY_KV}day/${D}`, J({ day: D, by: "her", title: "", ts: 9 }));
told = [];
await fillWeather(s6, D, { city: { name: "某城", lat: 1, lon: 2 } }, fakeWx);
ok(P(s6, `${TY_KV}day/${D}`).wx.code === 61 && P(s6, `${TY_KV}day/${D}`).wx.sun === "18:21" && wxCalls.length === 1 && told.includes(`${TY_KV}day/${D}`),
  "那一天的 day 是后起的、没有天气：照取过的写进去（不再取一回），告诉开着的框");
const s6b = mkStore();
await fillWeather(s6b, "2026-10-11", { city: { name: "某城", lat: 1, lon: 2 } }, fakeWx);
ok(s6b.peek(`${TY_KV}day/2026-10-11`) === null && P(s6b, `${TY_KV}wx/2026-10-11`).code === 61, "那一天还没有 day：只记天气，不起 day（点开不写页）");
off();

// =====================================================
// 框里那一页能要的几样：只认这一本的
// =====================================================
const MSGS = { [D]: [
  { id: "m1", role: "her", kind: "text", text: "今天看到泡桐花", ts: new Date(2026, 9, 12, 9, 46).getTime() },
  { id: "m2", role: "her", kind: "photo", imgId: "img1", ts: new Date(2026, 9, 12, 9, 47).getTime() },
  { id: "m3", role: "her", kind: "photo", imgId: "img2", ts: new Date(2026, 9, 12, 9, 48).getTime() },
  { id: "m4", role: "him", items: [{ type: "text", text: "拍给我看" }], ts: new Date(2026, 9, 12, 9, 49).getTime() },
] };
ok(eq(chatOf(MSGS[D]), [{ w: "her", t: "09:46", p: "今天看到泡桐花" }, { w: "me", t: "09:49", p: "拍给我看" }]), "那一天聊天里的原话：她的、他的（同页管他叫 me），带几点");
const s7 = mkStore({
  "kfs2:settings": J({ apiKey: "编的钥匙" }), "kfs2:chat:c1": "[]", "kfs2:img:img1": "data:image/png;base64,AAAA",
  [`${TY_KV}cfg/main`]: "{}", [`${TY_LS}journalCfg`]: J({ a: 1 }), [`${TY_LS}journalPage:${D}`]: "{}", [`${TY_LS}journalMine`]: "[]",
  [TY_IMG + "abc"]: "data:image/png;base64,AAAA", [TY_IMG + "bad"]: "javascript:alert(1)",
});
let closed = 0, readyN = 0, fails = 0;
const srv = makeServer({
  store: s7, dayMsgs: async (d) => MSGS[d] || [], chatImg: async (id) => (id === "img1" ? "data:image/jpeg;base64,BBBB" : "<svg onload=x>"),
  onClose: () => closed++, onReady: () => readyN++, onFail: () => fails++, cfgKey: "kfs2:jzcfg",
  geocode: async (q) => Array.from({ length: 9 }, (_, i) => ({ name: q + i, lat: 1, lon: 2 })), weather: fakeWx, day: D,
});
const H = (m, a) => srv.handle(m, a);
ok((await H("get", { k: "kfs2:settings" })) === null && (await H("get", { k: `${TY_KV}cfg/main` })) === "{}" && (await H("get", { k: "kfs2:ty:" + "x".repeat(300) })) === null, "取：只给这一本的（设置、太长的键都不给）");
ok((await H("set", { k: "kfs2:settings", v: "{}" })) === false && P(s7, "kfs2:settings").apiKey === "编的钥匙" && (await H("set", { k: `${TY_KV}a`, v: "1" })) === true && (await H("set", { k: `${TY_KV}b`, v: 1 })) === false && (await H("set", { k: `${TY_KV}c`, v: "x".repeat(4000001) })) === false,
  "存：只存这一本的，得是字，不过 4 MB；设置改不了");
await H("del", { k: "kfs2:chat:c1" });
ok(s7.peek("kfs2:chat:c1") === "[]" && eq(await H("list", { prefix: "kfs2:" }), []) && (await H("list", { prefix: TY_LS })).length === 3, "删、列：别处的删不了、列不出来");
ok((await H("img", { id: "abc" })).startsWith("data:image/") && (await H("img", { id: "bad" })) === null && (await H("img", { id: "../img:img1" })) === null && (await H("img", { id: "img1" })) === null, "照片：只给这一本的图（得是图；别处的、编号不对的不给）");
ok((await H("imgPut", { id: "n1", data: "data:image/png;base64,QUJD" })) === true && (await H("imgPut", { id: "n2", data: "data:image/svg+xml;base64,PHN2Zz4=" })) === false && (await H("imgPut", { id: "n3", data: "javascript:1" })) === false && (await H("imgPut", { id: "a/b", data: "data:image/png;base64,QUJD" })) === false,
  "放照片：只收 jpeg、png、webp、gif 的图（svg、别的都不收），编号得规矩");
await H("imgDel", { id: "n1" });
ok(s7.peek(TY_IMG + "n1") === null, "删照片");
const src = await H("sources", { date: D });
ok(src.date === D && src.chat.length === 2 && eq(src.book, []) && eq((await H("sources", { date: "2026/10/12" })).chat, []), "某一天的原话（日子不规矩的不给）");
const ph = await H("chatPhotos", { date: D });
ok(ph.length === 1 && ph[0].id === "img1" && ph[0].t === "09:47" && ph[0].data.startsWith("data:image/jpeg"), "某一天聊天里的照片：只给是图的那几张");
ok((await H("city")) === null && eq(await H("geocode", { q: "" }), []) && (await H("geocode", { q: "某城" })).length === 6, "天气在哪儿：还没填；找城市最多列六个，空的不找");
ok((await H("setCity", { city: { name: "某城", lat: 200, lon: 1 } })) === false && (await H("setCity", { city: { name: "某城", lat: 12.3456, lon: -45.6789, where: "某省 · 某国" } })) === true, "挑城市：经纬度不对的不收");
ok(eq(await H("city"), { name: "某城", where: "某省 · 某国" }) && P(s7, "kfs2:jzcfg").city.tz === "auto", "记在 kfs2:jzcfg（跟原来那一版同一处）");
ok((await H("touch", { date: "2026-10-09" })) === true && P(s7, `${TY_KV}day/2026-10-09`).by === "her" && (await H("touch", { date: "坏的" })) === false, "她在那一天头一回动手：外面起那一天的 day（日子不规矩的不起）");
let threw = [];
for (const m of ["eval", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
  try {
    await H(m, {});
    threw.push(m + ":没拦");
  } catch (e) {
    if (e.message !== "不认得") threw.push(m + ":" + e.message);
  }
}
ok(threw.length === 0, `不认得的一概不认（连对象自带的那几样）${threw.join(" ")}`);
await H("close"); await H("ready");
ok(closed === 1 && readyN === 1, "关上、摆好了：外面那一层知道");
s7.full = true;
ok((await H("set", { k: `${TY_KV}z`, v: "1" })) === false && fails === 1, "存不上：回 false，外面报“没存上”");
s7.full = false;
const init = srv.init({ day: D, mode: "view", heat: { [D]: 4 }, safe: { t: 47 }, now: 123 });
ok(init.today === 123 && init.ls[`${TY_LS}journalCfg`] && !init.ls[`${TY_LS}journalPage:${D}`] && !init.ls[`${TY_LS}journalMine`] && eq(init.open, { day: D, mode: "view" }) && init.heat[D] === 4,
  "开门带进去的：这一本存在“这台设备上”的那几样（大的缓存不带），今天、要打开的那一天");
const t0 = T0.getTime();
ok(todayFor("2026-10-12", t0) === t0 && todayFor("2025-10-19", t0) === t0 && todayFor("2025-10-18", t0) === new Date(2025, 9, 18, 12).getTime() && todayFor("2024-02-29", t0) === new Date(2024, 1, 29, 12).getTime() && todayFor("坏的", t0) === t0 && todayFor("2025-02-30", t0) === t0,
  "框里的“今天”：一年以内的照今天；翻一年以前的那一天，今天挪到那一天（不然同页认不出那一天）");
ok(srv.init({ day: "2024-05-01", mode: "view", now: t0 }).today === new Date(2024, 4, 1, 12).getTime() && mdOf("2024-05-01", new Date(srv.init({ day: "2024-05-01", now: t0 }).today)) === "5.1", "开两年前的那一页：框里换得出“5.1”");
ok(okKey(`${TY_KV}day/x`) && !okKey("kfs2:tyx") && !okKey(`${TY_KV}a\nb`) && okId("toolu_01AbC-9") && !okId("") && !okId("a.b") && okDate(D) && !okDate("2026-1-1"), "键、编号、日子的规矩");

// =====================================================
// 光义排一页（同页的「交给光义」）：寄什么、他回的怎么收拾、排的时候 day 里记什么、没排成怎么办
// =====================================================
ok(tyClean("  <b>泡桐花</b> & 运河\u0007\n边  ", 40) === "＜b＞泡桐花＜/b＞ ＆ 运河 \n边" && tyClean(3, 10) === "" && tyClean("一二三四五六", 4) === "一二三四",
  "他写的字：尖括号、& 换成全角（同页有几处当 HTML 画），控制字符去掉、换行留着，截到上限");
const kL = tyKitList("layouts");
ok(kL.length === Object.keys(TY_LAYOUTS).length - 1 && !kL.some(([id]) => id === "routemap") && tyKitList("styles").length === Object.keys(TY_STYLES).length,
  "给他挑的版式风格：照同页的全套，路线图那一种不给（照片里没有地点，画不出路线）");
const AD = "2026-10-15";
const QS = [
  { id: "m1", w: "her", t: "16:02", p: "今天看到泡桐花了" },
  { id: "m2#0", w: "him", t: "16:03", p: "拍给我看" },
  { id: "m3", w: "her", t: "16:05", p: "风好大 拍糊了" },
];
const PHS = [
  { tag: tyTag(0), from: "asked", t: "16:01" },
  { tag: tyTag(1), from: "page", t: "" },
  { tag: tyTag(2), from: "chat", t: "16:04" },
];
const AQ = tyArrangeAsk({
  label: "2026年10月15日 星期四",
  her: "卿卿",
  quotes: QS,
  photos: PHS,
  diary: { her: { text: "运河边走了一圈", moods: ["happy"] }, him: { text: "" } },
  wx: { code: 61, hi: 15.4, lo: 9.6 },
  at: "某城",
  wish: "安安静静的",
  keep: { hide: ["ro", "su"], texts: ["那天真好"], title: "泡桐花开了", look: { layout: "letter", style: "washi" } },
});
ok(AQ.rule.startsWith("【排手帐】") && AQ.rule.includes("卿卿在闲笔集的手帐本子里点了「交给你」") && AQ.rule.includes("[JZ]") && AQ.rule.includes("xuan（宣纸") && !AQ.rule.includes("routemap") && AQ.rule.includes("只写编号"),
  "跟在名帖后面的【排手帐】：她点了交给你、照片原话只写编号、版式风格列着（没有路线图）、只回 [JZ] 那一段");
ok(AQ.text.includes("这一天：2026年10月15日 星期四") && AQ.text.includes("天气：小雨 10–15°C（某城）") && AQ.text.includes("她这天的日记") && AQ.text.includes("运河边走了一圈") && AQ.text.includes("你这天没写日记")
  && AQ.text.includes("m1｜16:02｜卿卿｜今天看到泡桐花了") && AQ.text.includes("m2#0｜16:03｜你｜拍给我看") && AQ.text.includes("照片1（她发过来的 16:01）、照片2（这一页上原来的）、照片3（聊天里的 16:04）")
  && AQ.text.includes("她说想要：安安静静的") && AQ.text.includes("她藏起来的：路线、快门条") && AQ.text.includes("“那天真好”") && AQ.text.includes("她自己起的标题：“泡桐花开了”") && AQ.text.includes("信纸 × 和纸"),
  "寄去的：哪天、天气、两个人的日记、原话（编号｜几点｜谁）、照片（哪来的）、她想要的、她动过的（藏的、打的字、起的标题、挑的版式风格）");
ok(tyArrangeAsk({ label: "x" }).text.includes("这天你们没在开封府聊天") && tyArrangeAsk({ label: "x" }).text.includes("这天没有照片") && !tyArrangeAsk({ label: "x" }).text.includes("她已经动过"), "什么都没有的一天：照实说，不编");

const TAGS = PHS.map((x) => x.tag);
const say = (o) => `排好了。\n[JZ]\n${JSON.stringify(o)}\n[/JZ]`;
const A1 = parseTyArrange(
  say({ layout: "polaroid", style: "xuan", title: "<i>泡桐花</i>", p1: "运河边", cap: "风大", pen: { text: "[[紫色]]的", margin: "记得" }, quotes: ["m3", "编的", "m1"], photos: [{ id: "照片 2", role: "hero", note: "这张" }, { id: "照片1", role: "hero" }, { id: "照片9", role: "pair" }, { id: "照片3", role: "pair" }], note: { text: "我喜欢这张", b: "he" } }),
  QS,
  TAGS
);
ok(A1.layout === "polaroid" && A1.style === "xuan" && A1.title === "＜i＞泡桐花＜/i＞" && eq(A1.text, { p1: "运河边", cap: "风大", pen: { text: "[[紫色]]的", margin: "记得" } }),
  "他回的那一段：版式风格认得的才要，字照规矩收拾（尖括号换全角）");
ok(eq(A1.quotes.map((q) => q.id), ["m1", "m3"]) && A1.quotes[0].p === "今天看到泡桐花了", "原话只认编号、照原话抄（编的不要），照那天的次序");
ok(eq(A1.photos.map((p) => [p.tag, p.role]), [["照片2", "hero"], ["照片1", ""], ["照片3", ""]]) && A1.photos[0].note === "这张",
  "照片只认寄过去的编号（多写了空格也认，没有的不要）；主照片只一张，双联照只挑了一张不成对");
ok(eq(A1.note, { text: "我喜欢这张", b: "he" }), "他想留的批注：贴在主照片旁边");
const A2 = parseTyArrange("```json\n" + JSON.stringify({ body: "只写了正文", layout: "routemap", style: "宣纸", photos: ["照片1", "照片2"], note: { text: "x", b: "zz" } }) + "\n```", QS, TAGS);
ok(A2.text.p1 === "只写了正文" && A2.layout === "" && A2.style === "" && A2.photos.length === 2 && A2.note.b === "", "没夹 [JZ]、包了 ```json 的也认；写成 body 的当正文；路线图、认不出的风格不要；批注贴的地方认不出就贴页角");
const why = (f) => {
  try {
    f();
    return "";
  } catch (e) {
    return e.why || "";
  }
};
ok(why(() => parseTyArrange("我想了想，不排了。", QS, TAGS)).includes("没有排好的那一段") && why(() => parseTyArrange("[JZ]\n{}\n[/JZ]", QS, TAGS)).includes("什么都没排出来")
  && why(() => parseTyArrange('[JZ]\n{"quotes":["编的"],"photos":[{"id":"照片7"}]}\n[/JZ]', QS, TAGS)).includes("什么都没排出来") && why(() => parseTyArrange("[JZ]\n[1,2]\n[/JZ]", QS, TAGS)).includes("看不懂"),
  "拆不出来、什么都没排（{}、只有对不上的编号）：没排成，跟她说一句为什么");
const many = parseTyArrange(say({ quotes: Array.from({ length: 12 }, (_, i) => "q" + i) }), Array.from({ length: 12 }, (_, i) => ({ id: "q" + i, w: "her", t: "10:00", p: "话" + i })), TAGS);
ok(many.quotes.length === 8, "原话最多八句");

const s9 = mkStore();
const MK = makingDay(null, AD, [{ a: "在读", ok: false }], 5000);
ok(MK.status === "making" && MK.by === "me" && MK.mk.prev === null && MK.mk.at === 5000 && MK.ts === 5000, "交给他了（那一天还没有页）：记一个“在排”的 day");
s9.m.set(`${TY_KV}day/${AD}`, J(MK));
const IM = infoOf(s9, AD);
ok(madeOf(s9, AD) && IM && IM.making === true, "他正排着：算掺了一页（日历标着、卡片上写着在排）");
const FD = failedDay(MK, AD, [{ a: "没排成", b: "网断了", fail: 1 }], 6000);
s9.m.set(`${TY_KV}day/${AD}`, J(FD));
ok(FD.status === "failed" && !madeOf(s9, AD) && infoOf(s9, AD) === null && openMode(s9, AD) === "day", "没排成（原来没有页）：记一个 failed，什么都没有：不标、没卡片，点开还是那一天的那一屏");
ok((await ensureDay(s9, AD, 7000)) === true && P(s9, `${TY_KV}day/${AD}`).by === "her" && P(s9, `${TY_KV}day/${AD}`).status === "done", "没排成以后她自己拼：照常起她的那一页（failed 那一条盖掉）");
const HER = { day: AD, status: "done", by: "her", title: "", ts: 100, herTitle: "她起的", photos: [], wx: { code: 3, hi: 20, lo: 10 } };
const MK2 = makingDay(HER, AD, [{ a: "在读", ok: false }], 8000);
ok(MK2.status === "making" && MK2.by === "her" && MK2.ts === 100 && MK2.herTitle === "她起的" && eq(MK2.mk.prev, HER), "原来有页：照旧摆着（钟点不变），排之前那一份记着");
const FD2 = failedDay(MK2, AD, [{ a: "没排成", b: "网断了", fail: 1 }]);
ok(eq({ ...FD2, steps: undefined }, { ...HER, steps: undefined }) && FD2.steps[0].fail === 1 && !FD2.mk, "没排成（原来有页）：放回原样，记一步“没排成”");
ok(makingDay({ ...FD, steps: [] }, AD, [], 9000).mk.prev === null && makingDay(MK, AD, [], 9000).mk.prev === null, "没排成的、正排着的那一份不当“排之前那一份”");
const AR = arrangedDay("她起的", A1, { day: AD, src: (t) => ({ 照片1: "kfsimg:a1", 照片2: "kfsimg:a2" })[t], time: (t) => (t === "照片1" ? "16:01" : ""), wx: { code: 61, hi: 15, lo: 9, sun: "18:21" }, at: "某<城>", now: 9999, steps: [{ a: "排好了", ok: true }] });
ok(AR.status === "done" && AR.by === "me" && AR.ts === 9999 && AR.title === "＜i＞泡桐花＜/i＞" && AR.herTitle === "她起的" && AR.layout === "polaroid" && AR.style === "xuan" && AR.at === "某＜城＞" && AR.wx.sun === "18:21",
  "他排好的那一份：他排的、排好了、这会儿的钟点；她起的标题留着；天气、在哪儿带上（在哪儿也换全角）");
ok(eq(AR.photos.map((p) => [p.src, p.role, p.t]), [["kfsimg:a2", "hero", ""], ["kfsimg:a1", "", "16:01"]]) && eq(AR.chat, [{ w: "her", t: "16:02", p: "今天看到泡桐花了" }, { w: "her", t: "16:05", p: "风好大 拍糊了" }]),
  "照片照存档里的编号写（没存成的那一张不要），主照片排头；原话照同页的样子（他是 me）");
ok(!("herTitle" in arrangedDay("", A2, { day: AD, src: () => "" })) && !("layout" in arrangedDay("", A2, { day: AD, src: () => "" })), "没有的不写（她没起标题、他没挑版式）");

// 排到一半断了（开封府被关了）
const s10 = mkStore({ [`${TY_KV}day/${AD}`]: J(makingDay(HER, AD, [{ a: "看了", ok: true }, { a: "在排", ok: false }], 1000)), [`${TY_KV}day/2026-10-16`]: J(makingDay(null, "2026-10-16", [], 1000)), [`${TY_KV}day/2026-10-17`]: J(makingDay(null, "2026-10-17", [], 1000 + TY_STALE)) });
const settled = await settleStale(s10, new Set(["2026-10-16"]), 1000 + TY_STALE + 1);
const RS = P(s10, `${TY_KV}day/${AD}`);
ok(eq(settled, [AD]) && RS.status === "done" && RS.by === "her" && RS.herTitle === "她起的" && eq(RS.steps.map((x) => x.a), ["看了", "没排成"]) && P(s10, `${TY_KV}day/2026-10-16`).status === "making" && P(s10, `${TY_KV}day/2026-10-17`).status === "making",
  "排了十分钟还没排完：当没排成（原来的放回去）；这台设备上正排着的、还没到十分钟的不动");

// 她点了发送：同页写一张 ask
ok(eq(askOf("a1", { status: "new", day: AD, text: "安静点", photos: ["kfschat:i1", "kfsimg:j2", "blob:x", "https://x/y.jpg", 3] }), { id: "a1", day: AD, text: "安静点", photos: ["kfschat:i1", "kfsimg:j2"] }) && askOf("a1", { status: "done", day: AD }) === null && askOf("a1", { status: "new", day: "10.15" }) === null && askOf("a1", { status: "new", day: AD, text: 3 }) === null,
  "一张 ask：只认新的、日子对的；照片只认开封府给的编号");
const asked = [];
const s11 = mkStore();
const srvA = makeServer({ store: s11, onAsk: (a) => asked.push(a) });
const askV = J({ id: "a9", day: AD, text: "帮我排", photos: ["kfschat:i1"], at: 1, who: "her", status: "new" });
ok((await srvA.handle("set", { k: `${TY_KV}ask/a9`, v: askV })) === true && (await srvA.handle("set", { k: `${TY_KV}ask/a9`, v: askV })) === true && (await srvA.handle("set", { k: `${TY_KV}notes/a9`, v: askV })) === true, "写进去照常存");
await new Promise((r) => setTimeout(r, 0));
ok(asked.length === 1 && asked[0].id === "a9" && asked[0].text === "帮我排", "新写的一张 ask 交给开封府排一回（同一张再写、别处的不算）");
await srvA.handle("set", { k: `${TY_KV}ask/b1`, v: J({ status: "new", day: "x" }) });
await new Promise((r) => setTimeout(r, 0));
ok(asked.length === 1, "看不懂的 ask 不排");

// 她自己挑过版式风格没有
const s12 = mkStore({ [`${TY_LS}journalLook:${AD}`]: J({ layout: "column", style: "qingmo" }) });
ok(herLookOf(s12, AD, { photos: [] }) === null && herLookOf(s12, AD, { layout: "column", style: "qingmo" }) === null && eq(herLookOf(s12, AD, { layout: "bento", style: "film" }), { layout: "column", style: "qingmo" }) && herLookOf(mkStore(), AD, null) === null,
  "她自己挑过的版式风格：跟那一页本来的一样的不算（同页离开一天自动记的）");

// =====================================================
// 照原样拿同页那一页：打补丁、安全规矩
// =====================================================
const SRC = fs.readFileSync(new URL("../vendor/tongye/app.html", import.meta.url), "utf8");
const BR = "/*kfs-bridge*/window.__kfsBridge=1;";
const { html, scripts } = makeTongye(SRC, BR);
const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html) || [])[1] || "";
const inl = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const sha = (s) => "'sha256-" + createHash("sha256").update(s, "utf8").digest("base64") + "'";
ok(scripts === inl.length && inl.length === SRC.split("<script>").length && inl.length > 10 && inl[0] === BR && inl.every((s) => csp.includes(sha(s))), `${inl.length} 段脚本（同页自己的，加开封府那一层排第一）：每一段的指纹都写进安全规矩，别的跑不了`);
ok(!/unsafe-eval/.test(csp) && /connect-src 'self' data: blob:/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp) && /form-action 'none'/.test(csp) && !/https?:/.test(csp), "安全规矩：不许 eval，只连自己（不连外面哪一处）");
ok(html.indexOf('<meta charset="utf-8">') < html.indexOf("Content-Security-Policy") && html.indexOf("Content-Security-Policy") < html.indexOf(BR) && html.indexOf(BR) < html.indexOf("<script>", html.indexOf(BR) + BR.length),
  "安全规矩、开封府那一层都在最前面（同页自己的脚本之前）");
ok(!html.includes("localStorage") && !/\beval\(/.test(html) && !html.includes("new Function") && html.includes('<meta name="referrer" content="no-referrer">') && html.includes('<meta name="robots" content="noindex, nofollow">'), "同页里一处 localStorage、eval 都不剩；不带来路、不让搜");
ok(html.includes('her:"卿卿",me:"光义"') && html.includes("const WX={};") && html.includes('let CURDAY="";') && html.includes("window.__kfsShell="), "署名换成卿卿和光义；演示的天气清掉；从“没在哪一天”开始；开封府能打开某一天");
ok(!/googleapis|gstatic/.test(html) && !html.includes("<!--kfs:fonts-->") && !html.includes("<link rel=\"stylesheet\"") && html.includes("\n window.__kfsFonts&&__kfsFonts(st.fonts,preview)}") && !csp.includes("google"),
  "字不去 Google 取（连都不连）：换风格的时候问开封府那一层要（不给字的时候，<head> 里一张都不挂）");
ok(html.includes("function savePage(){if(restoring)return;if(window.__kfsSaveOk&&!window.__kfsSaveOk())return;") && html.includes("window.__kfsPageIn&&window.__kfsPageIn(k);") && html.includes("window.__kfsMineIn=1;") && html.includes("window.__kfsFlush=()=>flushPage();") && html.includes("PAGE_DAY=k;window.__kfsOpened&&window.__kfsOpened(k);"),
  "同页自己存那一页之前问一声；那一页取回来了、照片库齐了、关之前存、换了天才许存，几处都接上了");
ok(html.includes('"存好了，"+NM("me")+"翻日记的时候看得到"') && !html.includes("也送回家了"), "留了批注不说“送回家了”");
ok(html.includes("map(x=>window.__kfsAskRef?__kfsAskRef(x):x)") && html.includes('(R.status==="making"||R.status==="failed")') && html.includes('s2.fail?"fail"') && html.includes("!(r.steps||[]).some(x=>x&&x.fail)")
  && html.includes('(window.__kfsHisNew?__kfsHisNew(R):R.by!=="her")&&toast2') && html.includes('if(mode==="day"&&!DONE[k]){try{openDay(k)}') && html.includes("dayIn:function(k,ph,chat)") && html.includes('"这天还没有天气"'),
  "交给光义那几处接上了：寄的照片换成开封府的编号、没排成不起页不冒“打开这一页”、“光义刚更新了这一页”只在他排好的时候说、开封府能打开某一天的那一屏、那一屏的照片原话");
const KIT = tyKit(SRC);
ok(KIT.layouts.length === 17 && KIT.styles.length === 26 && KIT.layouts.every(([id, n, t]) => TY_LAYOUTS[id] === n && t) && KIT.styles.every(([id, n, t]) => TY_STYLES[id] === n && t),
  "同页的版式、风格（给他挑的那一份）照同页那一页抄：名字跟开封府这头记的对得上，每一种都有一句是什么样");
ok(!html.includes("setTimeout(function(){location.reload()},900)") && html.split("setTimeout(function(){window.__kfsReload?__kfsReload():location.reload()},900)").length === 3 && html.includes('return w==="me"?"光义":"卿卿"'), "删掉这一页、找回以后不在框里重新载入（关上回闲笔集）");
ok(PATCHES.every(([from, to, n]) => SRC.split(from).length - 1 === n && typeof to === "string"), `每一处补丁在原文里都找得到、处数对得上（${PATCHES.length} 处）`);
const bad = (mut) => {
  try {
    makeTongye(mut(SRC), BR);
    return "";
  } catch (e) {
    return e.message;
  }
};
ok(bad((s) => s.replace("const WX={", "const WX ={")).includes("同页的补丁对不上（演示的天气清掉）"), "作者改了那一处：停下来，不悄悄打歪");
ok(bad((s) => s.replace("</body>", '<script src="https://example.com/x.js"></script></body>')).includes("从外面取的脚本"), "多了从外面取的脚本：停下来");
ok(bad((s) => s.replace("</body>", '<button onclick="x()">x</button></body>')).includes("写在标签上的事件"), "多了写在标签上的事件：停下来");
// =====================================================
// 同页的字：开封府自己带着（tools/tyfonts.mjs；卿卿 10 月 18 日定的“放到开封府自己这儿”）
// =====================================================
ok(eq(parseSpec("Noto+Sans+SC:wght@300;400;700"), { family: "Noto Sans SC", weights: [300, 400, 700] }) && eq(parseSpec("Long+Cang"), { family: "Long Cang", weights: [400] }) && eq(parseSpec("Caveat:wght@500"), { family: "Caveat", weights: [500] }),
  "Google Fonts 的写法认得出：哪一种字、哪几个粗细（没写的是 400）");
ok(eq(parseSpec("Fraunces:opsz,wght@9..144,300;600"), { family: "Fraunces", weights: [300] }), "“Fraunces:opsz,wght@9..144,300;600”后一半写法不对，Google 只给 300：这里也只给 300（要 600 的地方浏览器自己加粗，同原版）");
const throwsOf = (f) => { try { f(); return ""; } catch (e) { return e.message; } };
ok(throwsOf(() => parseSpec("Foo:wght@abc")).includes("认不出") && throwsOf(() => parseSpec("Foo:wght@1000")).includes("认不出"), "认不出的写法：停下来");
const need = tyFontNeeds(SRC);
ok(eq(need.base, ["Noto+Serif+SC:wght@300;400;600", "IBM+Plex+Mono:wght@400;500", "Long+Cang"]) && Object.keys(need.styles).length === 26 && need.preview === "0123456789.这一天的标题",
  "同页那一页里要的字：<head> 里那一行三种、二十六种风格各自的、“换风格”小样上那几个字");
const TF = makeTyFonts(SRC);
const TF2 = makeTyFonts(SRC);
const cssFiles = [...TF.files.keys()].filter((p) => p.endsWith(".css"));
const woffs = [...TF.files.keys()].filter((p) => p.endsWith(".woff2"));
ok(/^tyfonts-[0-9a-f]{10}$/.test(TF.dir) && TF.dir === TF2.dir && cssFiles.length === 34 && woffs.length === TF.fonts && TF.fonts > 1500,
  `打好的字放在 assets/${TF.dir}/：三十四张样式表（一种字一个粗细一张）、${TF.fonts} 块字；再打一回一模一样（名字带内容的指纹）`);
ok(eq(TF.baseHrefs, ["noto-serif-sc-300", "noto-serif-sc-400", "noto-serif-sc-600", "ibm-plex-mono-400", "ibm-plex-mono-500", "long-cang-400"].map((n) => `./${TF.dir}/${n}.css`)),
  "<head> 里那一行换成六张：思源宋体三个粗细、IBM Plex Mono 两个、龙藏体");
const allCss = cssFiles.map((p) => TF.files.get(p).toString());
const refs = allCss.flatMap((c) => [...c.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]));
ok(refs.length === TF.fonts && refs.every((r) => /^files\/[a-z0-9-]+\.woff2$/.test(r) && TF.files.has(r)) && !allCss.some((c) => /https?:|\.woff\)|format\('woff'\)/.test(c)),
  "样式表里只指着这一目录里的字（一块一处，只用 woff2，不连外面）");
ok(allCss.every((c) => (c.match(/@font-face\{/g) || []).length === (c.match(/unicode-range:U\+/g) || []).length && (c.match(/@font-face\{/g) || []).length === (c.match(/font-display:swap/g) || []).length),
  "每一块都写着它管哪些字（用到哪些字才取哪几块）、先用别的字摆着等它到（同 Google 的 swap）");
const nm = "node_modules";
const pkgOf = (file) => Object.values(TY_FONT_PKGS).find((pkg) => fs.existsSync(`${nm}/${pkg}/files/${file}`));
ok(woffs.every((p) => { const f = p.slice(6); const pkg = pkgOf(f); return pkg && fs.readFileSync(`${nm}/${pkg}/files/${f}`).equals(TF.files.get(p)); }), "每一块字都跟装好的包里的一个字节不差（不改字体文件）");
const fr = TF.files.get("fraunces-300.css").toString();
ok(/font-family:'Fraunces';[^}]*font-weight:300;/.test(fr) && !/Variable|100 900/.test(fr) && !TF.files.has("fraunces-600.css"), "Fraunces：名字照 Google 的（不带 Variable），只有 300 这一个粗细");
const lics = [...TF.files.keys()].filter((p) => p.startsWith("licenses/"));
const readme = TF.files.get("README.txt").toString();
ok(lics.length === Object.keys(TY_FONT_PKGS).length && TF.files.get("licenses/special-elite.txt").toString().includes("Apache License") && TF.files.get("licenses/noto-sans-sc.txt").toString().includes("SIL Open Font License")
  && Object.values(TY_FONT_PKGS).every((pkg) => readme.includes(pkg + "@")),
  "每一种字的授权跟着走（二十份；Special Elite 是 Apache 2.0，别的是 SIL OFL 1.1），说明里写着哪个包哪一版");
const M = TF.manifest;
const PV = [...need.preview].map((c) => c.codePointAt(0));
const cpsOf = (range) => range.split(",").flatMap((r) => { const [a, b] = r.replace(/^U\+/, "").split("-"); const lo = parseInt(a, 16), hi = b ? parseInt(b, 16) : lo; return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); });
ok(Object.values(need.styles).flat().every((sp) => (M.spec[sp] || []).length && M.spec[sp].every((k) => M.css[k] && TF.files.has(M.css[k]))) && M.base.every((k) => M.css[k]),
  "交给开封府那一层的清单：同页写的每一种都对得上样式表");
ok(Object.entries(M.pv).every(([k, list]) => !M.base.includes(k) && list.every(([f, r]) => TF.files.has(f) && cpsOf(r).every((c) => PV.includes(c))))
  && Object.values(M.pv).every((list) => { const cs = list.flatMap(([, r]) => cpsOf(r)); return cs.length === new Set(cs).size; }),
  "小样：只认小样上那几个字；一个字只算给一块（几块都管的，算给写在后面的那一块，同浏览器）；<head> 里本来就有的不另放");
ok(eq(M.pv["Ma Shan Zheng|400"].map(([f, r]) => [f.replace(/^files\/ma-shan-zheng-|-400-normal\.woff2$/g, ""), r]), [["117", "U+6807"], ["118", "U+5929,U+8FD9,U+9898"], ["119", "U+4E00,U+7684"], ["latin", "U+002E,U+0030-0039"]]),
  "宣纸的马善政：小样上那几个字在哪几块（数字和点用 latin 那一块）");
const { html: htmlF } = makeTongye(SRC, BR, TF);
const linksF = [...htmlF.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
ok(eq(linksF, TF.baseHrefs) && htmlF.indexOf(linksF[0]) > htmlF.indexOf('<meta name="claude:viewport-fit-sides"') && htmlF.indexOf(linksF[5]) < htmlF.indexOf("<style>\n/* 一页 9.26"),
  "给了字：原来取 Google 那一行的地方换成开封府自己的六张");
ok(throwsOf(() => makeTongye(SRC, BR, { baseHrefs: ["https://fonts.googleapis.com/css2?family=X"] })).includes("只能是开封府自己的"), "<head> 里要挂别处的：停下来");
ok(throwsOf(() => makeTyFonts(SRC.replace('"fonts": ["Silkscreen", "DotGothic16"]', '"fonts": ["Silkscreen", "Comic+Neue"]'))).includes("开封府没装"), "作者添了一种开封府没装的字：停下来");
ok(throwsOf(() => makeTyFonts(SRC.replace('"fonts": ["Caveat:wght@500"]', '"fonts": ["Caveat:wght@800"]'))).includes("没有 800 这个粗细"), "要的粗细包里没有：停下来");

const lic = fs.readFileSync(new URL("../vendor/tongye/LICENSE", import.meta.url), "utf8");
const notice = fs.readFileSync(new URL("../vendor/tongye/NOTICE.md", import.meta.url), "utf8");
const kfsMd = fs.readFileSync(new URL("../vendor/tongye/KFS.md", import.meta.url), "utf8");
ok(lic.includes("GNU AFFERO GENERAL PUBLIC LICENSE") && notice.length > 100 && /TangfanOVO\/tongye/.test(kfsMd) && kfsMd.includes(createHash("sha256").update(SRC, "utf8").digest("hex")), "同页的授权、出处都在；KFS.md 记着搬的是哪一版（原文的指纹对得上）");
ok(!fs.existsSync(new URL("../vendor/tongye/index.html", import.meta.url)) && !fs.existsSync(new URL("../vendor/tongye/book", import.meta.url)), "作者演示用的那一本（带她的照片的）没搬进来");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
