// 同页那一本手帐搬进开封府（见 src/tongye/、tools/tongye.mjs、vendor/tongye/KFS.md、开发说明“同页搬进来”那一节）：
// 日子换算（同页的“月.日”和开封府的“年-月-日”）、这一本的存档（算不算掺了一页、卡片、批注、点开没动不留）、原来那一版的页挪过来、
// 天气、框里那一页能要的几样（只认这一本的）、翻日记的工具看得到这一本（他留批注）、照原样拿同页那一页打补丁和安全规矩。数据都是编的。
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fullOf, mdOf, toFull, toMd, pathToStore, idFromStore, lsKeyToStore, lsKeyFromStore } from "../src/tongye/dates.js";
import {
  TY_KV, TY_LS, TY_IMG, TY_BLOCKS, TOOL_PART, madeOf, madeDays, infoOf, notesOf, addNoteTo, dropNoteOf, ensureDay, tidyDay,
  migrateOld, migrateAll, fillWeather, chatOf, makeServer, okKey, okId, okDate, pageTextOf, dayTextOf, pageBitsOf, extrasOf, addHisNote, tyReader, onTyChanged, todayFor,
} from "../src/tongye/host.js";
import { DIARY_TOOLS, DIARY_NAMES, NOTE_PARTS, runDiaryCalls } from "../src/diaryTools.js";
import { DIARY_SECTION } from "../src/prompt/system.js";
import { JZ_KEY, JZN_KEY } from "../src/jz/model.js";
import { PATCHES, makeTongye } from "../tools/tongye.mjs";

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
ok(eq(toMd({ "2025-10-18": 1, "2026-10-01": { day: "2026-10-01" }, notes: [{ day: "2025-01-01" }] }, T0), { "10.1": { day: "10.1" }, notes: [{ day: "2025-01-01" }] }),
  "取出来：换不回来的键整条拿掉；换不回来的 day 字段原样（对不上哪一天，等于看不见）");
ok(lsKeyToStore("journalPage:9.27", T0) === "journalPage:2026-09-27" && lsKeyToStore("journalCfg", T0) === "journalCfg" && lsKeyFromStore("journalLook:2026-09-27", T0) === "journalLook:9.27" && lsKeyFromStore("journalLook:2024-01-01", T0) === null && lsKeyFromStore("stkUse", T0) === "stkUse",
  "这台设备上的键：冒号后面是日子的那几样换，别的原样");

// =====================================================
// 这一本的存档：算不算掺了一页、卡片、批注、点开没动不留
// =====================================================
const D = "2026-10-12";
const s1 = mkStore();
ok((await ensureDay(s1, D, 1000)) === "self" && P(s1, `${TY_KV}day/${D}`).by === "her" && P(s1, `${TY_KV}day/${D}`).day === D, "这一天还没有页：起一页空的（她自己拼的），点开是“自己拼”");
ok(!madeOf(s1, D) && eq(madeDays(s1), []) && infoOf(s1, D) === null && pageTextOf(s1, D) === "", "空的一页不算掺了：日历上不标、没有卡片、他翻日记也看不到");
s1.m.set(`${TY_KV}page/${D}`, J({ stk: [{ c: "stamp", k: "feng", who: "me", x: 1, y: 2 }] }));
ok(!madeOf(s1, D), "同页替他盖的那个章不算她掺了东西");
s1.m.set(`${TY_KV}wx/${D}`, J({ code: 1 }));
s1.m.set(`${TY_LS}journalLook:${D}`, J({ layout: "cover", style: "night" }));
ok((await tidyDay(s1, D)) === true && eq(s1.keys(TY_KV), [`${TY_KV}wx/${D}`]) && s1.peek(`${TY_LS}journalLook:${D}`), "点开没动就关了：那一页不留（那一天的天气、她挑的版式风格留着）");
s1.m.delete(`${TY_KV}wx/${D}`);
s1.m.set(`${TY_KV}day/${D}`, J({ day: D, by: "her", title: "" }));
s1.m.set(`${TY_KV}page/${D}`, J({ stk: [{ c: "emoji", k: "fox", who: "her", x: 1, y: 2 }] }));
ok(madeOf(s1, D) && (await ensureDay(s1, D)) === "view" && (await tidyDay(s1, D)) === false && eq(madeDays(s1), [D]), "她贴了一张狐狸就算掺了：点开是看，关上留着");
s1.m.set(`${TY_KV}page/${D}`, J({ stk: [{ c: "emoji", k: "fox", who: "her", x: 1, y: 2, d: 1 }] }));
ok(!madeOf(s1, D), "撕掉了的不算");

const s2 = mkStore({
  [`${TY_KV}day/${D}`]: J({
    day: D, by: "me", title: "泡桐花", at: "某城", layout: "column", style: "qingmo",
    wx: { code: 61, hi: 15.4, lo: 9.6 },
    photos: [{ src: "kfsimg:p1", role: "hero" }, { src: "kfsimg:p2", role: "pair" }, { src: "kfsimg:p3", role: "pair" }, { src: "kfsimg:p4", role: "sh" }],
    chat: [{ w: "her", t: "09:46", p: "今天看到泡桐花" }, { w: "me", t: "09:47", p: "拍给我看" }],
    text: { p1: "下午去了运河边。", cap: "运河边", pen: { text: "[[紫色]]的，一串一串", margin: "记得" }, p2: "<her>这张</her>是她拍的" },
    food: { meal: "午饭", at: "米线店", items: [["番茄牛肉米线", 5], ["冰粉", 4]] },
  }),
  [`${TY_KV}page/${D}`]: J({ stk: [{ c: "text", k: "t1", who: "her", m: "好看" }, { c: "pic", k: "m1", who: "her" }, { c: "emoji", k: "fox", who: "her" }], hide: ["wx"] }),
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
ok(txt.includes("照片 5 张：主照片（底下写着：运河边）、双联照 2 张、截图 1 张、她贴上去的 1 张") && txt.includes("摆的原话：09:46 卿卿：今天看到泡桐花｜09:47 你：拍给我看"), "照片他看不见：写明几张、各是什么；摆的原话带着几点、谁说的");
ok(txt.includes("票根：午饭 米线店：番茄牛肉米线、冰粉") && txt.includes("她在页上写的字：“好看”") && txt.includes("贴纸 1 张") && txt.includes("她藏起来的：天气签") && !txt.includes("天气："), "票根、她写的字、贴纸几张；藏起来的天气不念，写明藏了");
ok(pageBitsOf(s2, D).includes("紫色的，一串一串") && pageBitsOf(s2, D).includes("好看") && !pageBitsOf(s2, D).includes("[["), "按词找的时候：页上写着的字（记号去掉）");
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
const lic = fs.readFileSync(new URL("../vendor/tongye/LICENSE", import.meta.url), "utf8");
const notice = fs.readFileSync(new URL("../vendor/tongye/NOTICE.md", import.meta.url), "utf8");
const kfsMd = fs.readFileSync(new URL("../vendor/tongye/KFS.md", import.meta.url), "utf8");
ok(lic.includes("GNU AFFERO GENERAL PUBLIC LICENSE") && notice.length > 100 && /TangfanOVO\/tongye/.test(kfsMd) && kfsMd.includes(createHash("sha256").update(SRC, "utf8").digest("hex")), "同页的授权、出处都在；KFS.md 记着搬的是哪一版（原文的指纹对得上）");
ok(!fs.existsSync(new URL("../vendor/tongye/index.html", import.meta.url)) && !fs.existsSync(new URL("../vendor/tongye/book", import.meta.url)), "作者演示用的那一本（带她的照片的）没搬进来");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
