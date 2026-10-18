// 闲笔集里掺的手帐（见 src/jz/、开发说明“闲笔集掺手帐”那一节）：存档收拾、两层合起来、原料、他排的那一段怎么拆、
// 各版式排成哪几块、贴纸栏、翻日记的工具看得到手帐和批注、他留批注。数据都是编的。
import {
  emptyPage, readPage, viewOf, penParts, headOf, materialsOf, pickQuotes, quoteSpan, wxName, wxLine, readNotes, buildArrangeAsk, parseArrange, scatter,
  pageText, roll, LAYOUT_KEYS, STYLE_KEYS, LAYOUTS, STYLES, PART_KEYS, photoTag, QUOTE_MAX, PHOTO_MAX,
} from "../src/jz/model.js";
import { blocksOf, partsShown } from "../src/jz/sheet.js";
import { TABS, NAMES_FOR_HIM, stickerByName, EMOJI_NAMES, SEALS } from "../src/jz/stickerList.js";
import { STYLE_KEYS_LOOK, JZ_CSS } from "../src/jz/look.js";
import { geocode, dayWeather, WX_HOSTS } from "../src/jz/weather.js";
import { DIARY_TOOLS, DIARY_NAMES, runDiaryCalls } from "../src/diaryTools.js";
import { DIARY_SECTION } from "../src/prompt/system.js";
import fs from "node:fs";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const seq = (xs) => { let i = 0; return () => xs[i++ % xs.length]; };

// =====================================================
// 一页：存档收拾
// =====================================================
const e0 = emptyPage("2026-10-18");
ok(e0.layout === "column" && e0.style === "inkpaper" && e0.arr.by === "her" && e0.mine.hide.length === 0 && e0.wx === null, "空的一页：单栏流、青墨素纸，她自己拼的，什么都没有");
ok(readPage("坏了{", "2026-10-18") === null && readPage("123", "2026-10-18") === null && readPage(null, "x") === null, "坏的存档：认不出来回 null");
const messy = readPage(
  JSON.stringify({
    layout: "不认得", style: "night", wx: { code: "3", hi: 21, lo: 12 },
    arr: { by: "him", title: "企".repeat(60), quotes: [{ id: "a", w: "her", t: "09:46", p: "原话" }, { id: "b", p: "" }, null], photos: [{ id: "p1", role: "hero", from: "img9" }, { id: "p2", role: "坏的" }, { role: "hero" }], stickers: [{ k: "e:fox", x: 9, y: -9, r: 999, s: 99 }, { x: 1 }] },
    mine: { edit: { title: "她改的", pen: { text: "红笔" }, bad: 1 }, hide: ["wx", "不认得"], texts: [{ m: "  " }, { m: "她写的", x: 0.2 }] },
  }),
  "2026-10-18"
);
ok(messy.layout === "column" && messy.style === "night" && messy.wx.code === 3 && messy.arr.by === "him" && messy.arr.title.length === 40, "版式不认得换成头一个；风格认得留着；天气编号变成数；标题最长四十个字");
ok(messy.arr.quotes.length === 1 && messy.arr.photos.length === 2 && messy.arr.photos[0].from === "img9" && messy.arr.photos[1].role === "more" && !("from" in messy.arr.photos[1]), "空的原话、没编号的照片扔掉；认不得的照片角色当“别的”；从聊天里哪张另存来的记着");
ok(messy.arr.stickers.length === 1 && messy.arr.stickers[0].x === 1.2 && messy.arr.stickers[0].y === -0.2 && messy.arr.stickers[0].r === 180 && messy.arr.stickers[0].s === 4, "贴纸的位置、角度、大小夹在范围里；没 k 的扔掉");
ok(messy.mine.edit.title === "她改的" && messy.mine.edit.pen.text === "红笔" && !("bad" in messy.mine.edit) && messy.mine.hide.join() === "wx" && messy.mine.texts.length === 1 && messy.mine.texts[0].m === "她写的", "她那一层：改过的字、藏起来的（认得的）、自己写的字（空的扔掉）");

// =====================================================
// 两层合起来
// =====================================================
const img = (id) => ({ p1: "data:1", p2: "data:2", p3: "data:3", p4: "data:4", f: "data:f" }[id] || null);
const page = readPage({
  day: "2026-10-12", layout: "polaroid", style: "washi",
  arr: { by: "him", title: "泡桐花", body: "他写的正文", cap: "", pen: { text: "看到[[泡桐花]]了", margin: "记得" }, quotes: [{ id: "q1", w: "her", t: "09:46", p: "今天看到泡桐花" }], photos: [{ id: "p1", role: "hero", note: "运河边" }, { id: "p2", role: "pair" }, { id: "p3", role: "pair" }, { id: "f", role: "food", note: "番茄牛肉米线" }, { id: "gone", role: "more" }], stickers: [{ k: "e:fox", x: 0.8, y: 0.2 }] },
  mine: { edit: { body: "她改过的正文" }, hide: ["mood"], stickers: [{ k: "s:卿卿", x: 0.1, y: 1 }], texts: [{ id: "t1", m: "好看", x: 0.5, y: 0.9 }] },
  wx: { code: 61, hi: 15.4, lo: 9.6, mm: 3.2, city: "某城" },
}, "2026-10-12");
const diary = { her: { text: "她的日记", moods: ["happy", "sweet"] }, him: { text: "他的日记", moods: ["calm"] } };
const v = viewOf(page, diary, img);
ok(v.title === "泡桐花" && v.body === "她改过的正文" && v.cap === "运河边" && v.pen.margin === "记得", "她改过的字盖在他排的上面；主照片底下那一行没写就用主照片的备注");
ok(v.hero.id === "p1" && v.pair.map((x) => x.id).join() === "p2,p3" && v.food.id === "f" && v.more.length === 0, "照片照角色分好：主照片、双联照两张、饭；取不到图的那张不摆");
ok(v.moods.her.map((m) => m.t).join() === "开心,甜" && v.her === "她的日记" && v.him === "他的日记", "日记、心情照闲笔集里眼下的摆");
ok(v.has("head") && v.has("title") && v.has("wx") && !v.has("mood") && v.has("hero") && v.has("cap") && v.has("quote") && v.has("pen") && v.has("pair") && v.has("food") && !v.has("more"), "has：有东西、她没藏的才摆（心情她藏了）");
ok(v.stickers.length === 2 && v.arrStickers === 1 && v.texts[0].m === "好看", "贴纸：他贴的在前、她贴的在后（分得清哪张是谁那一层的）；她写的字另摆");
const solo = viewOf(readPage({ arr: { photos: [{ id: "p2", role: "more" }, { id: "p3", role: "pair" }] } }, "2026-10-12"), {}, img);
ok(solo.hero.id === "p2" && solo.pair.length === 0 && solo.more.map((x) => x.id).join() === "p3", "没挑主照片：头一张当主照片；双联照只有一张的挪去“别的”");
ok(!viewOf(emptyPage("2026-10-12"), {}, img).has("hero") && viewOf(emptyPage("2026-10-12"), {}, img).has("head"), "空的一页：只摆日子");
ok(JSON.stringify(penParts("看到[[泡桐花]]了，[[紫色]]")) === JSON.stringify([{ s: "看到", mark: false }, { s: "泡桐花", mark: true }, { s: "了，", mark: false }, { s: "紫色", mark: true }]) && penParts("").length === 0, "红笔：[[ ]] 里的划线");
const h = headOf("2026-10-18");
ok(h.md === "10.18" && h.week === "SUN" && h.year === "2026" && h.cn === "10月18日" && h.weekCn === "星期日" && h.n === 191, `日子：10.18、SUN、在一起的第 191 天（${h.n}）`);
let r1 = 0;
ok(roll(LAYOUT_KEYS, "column", () => 0) !== "column" && roll(["a"], "a") === "a" && Array.from({ length: 50 }, () => roll(STYLE_KEYS, "night", () => (r1 = (r1 + 0.137) % 1))).every((k) => k !== "night"), "骰一下：不骰到眼下这个");

// =====================================================
// 原料
// =====================================================
const at = (h, m) => new Date(2026, 9, 12, h, m).getTime();
const msgs = [
  { id: "m3", role: "him", ts: at(9, 50), items: [{ type: "text", text: "**真的？**拍给我看" }, { type: "meme", file: "a.jpg" }, { type: "text", text: "我也想看" }] },
  { id: "m1", role: "her", ts: at(9, 46), text: "今天看到泡桐花了" },
  { id: "m2", role: "her", ts: at(9, 48), kind: "photo", imgId: "img1" },
  { id: "m4", role: "her", ts: at(10, 2), kind: "voice", text: "紫色的" },
  { id: "m5", role: "event", ts: at(10, 3) },
  { id: "m6", role: "her", ts: at(10, 4), kind: "meme", file: "b.jpg" },
];
const mats = materialsOf(msgs);
ok(mats.photos.length === 1 && mats.photos[0].imgId === "img1" && mats.photos[0].t === "09:48", "原料里的照片：她发的那张，带着几点");
ok(mats.quotes.map((q) => q.id).join() === "m1,m3#0,m3#2,m4" && mats.quotes[1].p === "真的？拍给我看" && mats.quotes[1].w === "him" && mats.quotes[3].p === "紫色的", "原话：照时间排；他一条回话里的几句各有编号（那一条#第几样）；加粗的记号去掉；语音照转出来的字；表情包、换头像不算");
const picked = pickQuotes(["m4", "m1", "不认得", "m1"], mats.quotes);
ok(picked.map((q) => q.id).join() === "m1,m4" && picked[0].p === "今天看到泡桐花了", "照编号挑原话：认不出的不要、挑两回只算一回、照时间排，字照原话抄");
ok(pickQuotes(mats.quotes.concat(mats.quotes.map((q, i) => ({ ...q, id: "x" + i }))).map((q) => q.id), mats.quotes.concat(mats.quotes.map((q, i) => ({ ...q, id: "x" + i })))).length === QUOTE_MAX, `最多 ${QUOTE_MAX} 句`);
ok(quoteSpan(mats.quotes) === "09:46 – 10:02" && quoteSpan([mats.quotes[0]]) === "09:46" && quoteSpan([]) === "", "原话卡头上的钟点");
ok(wxName(0).t === "晴" && wxName(3).i === "cloud" && wxName(63).i === "rain" && wxName(73).t === "雪" && wxName(95).i === "storm" && wxName(45).i === "fog", "天气编号 → 中文和小图");
ok(wxLine({ code: 61, hi: 15.4, lo: 9.6, mm: 3.2 }) === "小雨 10–15°C · 雨 3 mm" && wxLine({ code: 0, hi: 20, lo: 10, mm: 0 }) === "晴 10–20°C" && wxLine(null) === "", "天气那一行");
const ns = readNotes(JSON.stringify([{ id: "b", who: "him", text: "我留的", at: 2, part: "hero" }, { id: "a", who: "x", text: "她留的", at: 1, part: "坏" }, { text: "" }]));
ok(ns.length === 2 && ns[0].id === "a" && ns[0].who === "her" && ns[0].part === "" && ns[1].part === "hero" && readNotes("坏").length === 0, "批注：照时间排、认不出的人当她、认不出的零件不贴、空的扔掉");

// =====================================================
// 他排一页
// =====================================================
const ask = buildArrangeAsk({ label: "2026年10月12日 星期一", quotes: mats.quotes, photos: [{ tag: "照片1", t: "09:48" }], diary, wx: page.wx, keep: { hide: ["mood"], texts: ["好看"], edit: { body: "x" } }, stickers: NAMES_FOR_HIM.slice(0, 3) });
ok(ask.rule.startsWith("【排手帐】") && LAYOUTS.every((l) => ask.rule.includes(l.k)) && STYLES.every((s) => ask.rule.includes(s.k)) && ask.rule.includes("[JZ]") && ask.rule.includes("一个字都不会改"), "规矩：版式风格都列着、只写编号、夹在 [JZ] 里");
ok(ask.text.includes("m1｜09:46｜卿卿｜今天看到泡桐花了") && ask.text.includes("m3#0｜09:50｜你｜真的？拍给我看") && ask.text.includes("照片1（09:48）") && ask.text.includes("她这天的日记（心情：开心、甜）") && ask.text.includes("小雨"), "寄的：原话带编号、照片的编号、日记、天气");
ok(ask.text.includes("她藏起来的：心情") && ask.text.includes("她自己改过的：正文") && ask.text.includes("“好看”") && ask.text.includes(NAMES_FOR_HIM[0]), "她动过的写明（别碰）；能贴的贴纸名字");
const reply = `好的
[JZ]
{"layout":"bento","style":"film","title":"泡桐花开了","body":"她说看到了。","cap":"运河边","pen":{"text":"[[紫色]]的","margin":"记得"},"quotes":["m4","m1","编的"],"photos":[{"id":"照片1","role":"hero","note":"运河"},{"id":"照片2","role":"hero"},{"id":"照片9","role":"food"},{"id":"照片3","role":"pair"}],"stickers":["狐狸","不存在的贴纸","画的心","卿卿"],"note":{"text":"这张我最喜欢","part":"hero"}}
[/JZ]`;
const parsed = parseArrange(reply, mats.quotes, { 照片1: "jzA", 照片2: "chat:img1", 照片3: "jzC" }, stickerByName, seq([0.5]), 99);
ok(parsed.layout === "bento" && parsed.style === "film" && parsed.arr.by === "him" && parsed.arr.at === 99 && parsed.arr.title === "泡桐花开了" && parsed.arr.pen.text === "[[紫色]]的", "拆出来：版式、风格、标题、红笔，记着是他排的");
ok(parsed.arr.quotes.map((q) => q.id).join() === "m1,m4" && parsed.arr.quotes[1].p === "紫色的", "原话只认编号，编的那个不要，字照原话抄");
ok(parsed.arr.photos.map((x) => `${x.id}:${x.role}`).join() === "jzA:hero,chat:img1:more,jzC:more", "照片照编号对上；主照片多了的挪去“别的”；双联照只有一张也挪去“别的”；没有的编号不要");
ok(parsed.arr.stickers.map((s) => s.k).join() === "e:fox,d:heart,s:卿卿" && parsed.arr.stickers.every((s) => s.s === 1), "贴纸照名字认，认不出的不要，摆在纸边上");
ok(parsed.note.text === "这张我最喜欢" && parsed.note.part === "hero", "他要留的批注");
let threw = 0;
try { parseArrange("没有那一段", [], {}); } catch (e) { threw++; }
try { parseArrange("[JZ]{坏的[/JZ]", [], {}); } catch (e) { threw++; }
ok(threw === 2, "拆不出来、看不懂：抛错（JzPage 报“没排成”）");
const bare = parseArrange('{"title":"只有字","layout":"不认得"}', [], {}, () => "");
ok(bare.arr.title === "只有字" && bare.layout === "" && bare.note === null && bare.arr.photos.length === 0, "没夹 [JZ] 的一整段 JSON 也认；版式不认得回空（不换）");
ok(scatter(["a", "b"], () => 0.5).map((s) => [s.k, s.x, s.y, s.r].join()).join("|") === "a,0.86,0.2,0|b,0.12,0.62,0", "他的贴纸摆在纸边、角上");
ok(photoTag(0) === "照片1" && photoTag(9) === "照片10", "照片的编号");

// =====================================================
// 各版式排成哪几块
// =====================================================
const kinds = (bs) => bs.map((b) => (b.t === "one" ? b.k : b.t === "row" ? `[${b.ks.join("+")}]` : b.t === "scroll" ? `scroll(${kinds(b.main)})` : b.t)).join(",");
const withLayout = (layout, hide = []) => viewOf({ ...page, layout, mine: { ...page.mine, hide } }, diary, img);
ok(kinds(blocksOf(withLayout("column", []))) === "head,title,wx,mood,hero,quote,her,him,body,pen,pair,food", `单栏流：从上到下（${kinds(blocksOf(withLayout("column", [])))}）`);
ok(kinds(blocksOf(withLayout("polaroid", []))) === "head,title,wx,hero,quote,pair,[food+mood],her,him,body,pen", `拍立得墙：饭和心情并排（${kinds(blocksOf(withLayout("polaroid", [])))}）`);
ok(kinds(blocksOf(withLayout("polaroid", ["mood"]))).includes(",food,"), "拍立得墙：心情藏了，饭自己占一行");
ok(kinds(blocksOf(withLayout("cover", []))) === "cover,wx,mood,quote,her,him,body,pen,pair,food", "大图封面：头一块是铺满的主照片（日子、标题压在上面）");
ok(kinds(blocksOf(withLayout("cover", ["hero"]))).startsWith("head,title,wx"), "大图封面没有主照片：照常从日子排起");
ok(kinds(blocksOf(withLayout("bento", []))) === "[head+wx],title,hero,[mood+food],quote,pair,her,him,body,pen", `格子便当：两个小方块并排（${kinds(blocksOf(withLayout("bento", [])))}）`);
ok(kinds(blocksOf(withLayout("bento", ["wx", "food"]))) === "head,title,hero,mood,quote,pair,her,him,body,pen", "格子便当：落单的小方块撑满一行");
ok(kinds(blocksOf(withLayout("scroll", []))) === "scroll(wx,mood,hero,quote,her,him,body,pen,pair,food)", "立轴：左边竖着的日子标题，右边一串");
ok(kinds(blocksOf(withLayout("letter", []))) === "letterhead,title,body,him,her,quote,pen,hero,pair,food,ps", "信纸：字在前头、照片在后头、末尾又及（天气、心情）");
ok(partsShown(withLayout("column", [])).join() === "head,title,wx,mood,hero,cap,quote,her,him,body,pen,pair,food" && partsShown(withLayout("letter", ["wx", "mood"])).every((k) => k !== "wx" && k !== "mood"), "摆了哪几样（批注的“贴在哪一块”照它列）");

// =====================================================
// 样子、贴纸栏、天气
// =====================================================
ok(STYLE_KEYS.every((k) => STYLE_KEYS_LOOK.includes(k)) && STYLE_KEYS_LOOK.length === STYLE_KEYS.length && LAYOUT_KEYS.every((k) => k === "column" || JZ_CSS.includes(`data-layout="${k}"`)), "每种风格都有一套颜色；版式（单栏流以外）都有样子");
ok(!/https?:\/\/(?!www\.w3\.org)/.test(JZ_CSS), "样子里不取外面的东西（纹理是浏览器现算的）");
const names = TABS.flatMap((t) => t.items).filter((x) => /^[eds]:/.test(x.k)).map((x) => x.t);
ok(new Set(names).size === names.length, "贴纸的中文名不重（他照名字挑，不会认错）");
ok(TABS.map((t) => t.t).join() === "动物,表情,吃的,天和花,东西,心,胶带,印章,手绘,颜文字" && EMOJI_NAMES.length === 120 && SEALS.includes("卿卿"), "贴纸栏十栏，Fluent Emoji 一百二十张；印章里先摆着几枚");
ok(stickerByName("狐狸") === "e:fox" && stickerByName("fox") === "e:fox" && stickerByName("heart") === "d:heart" && stickerByName("甚好") === "s:甚好" && stickerByName("不存在") === "" && stickerByName("plain") === "", "贴纸照中文名认，写成英文名（fox、heart）也认；胶带不认");
ok(NAMES_FOR_HIM.includes("狐狸") && NAMES_FOR_HIM.includes("画的心") && NAMES_FOR_HIM.includes("已阅") && !NAMES_FOR_HIM.some((n) => n.includes("斜纹") || n.includes("ω")), "他能挑的：表情这几栏、手绘、印章；胶带、颜文字不给他");
const svgDir = new URL("../vendor/fluent-emoji/flat/", import.meta.url);
ok(EMOJI_NAMES.every((n) => fs.existsSync(new URL(n + ".svg", svgDir))) && fs.readFileSync(new URL("../vendor/fluent-emoji/LICENSE.md", import.meta.url), "utf8").includes("Copyright (c) Microsoft Corporation"), "表里的每一张都拷进了 vendor/fluent-emoji/，授权原文在");
const stk = fs.readFileSync(new URL("../src/jz/stickers.js", import.meta.url), "utf8");
ok(EMOJI_NAMES.every((n) => stk.includes(`/flat/${n}.svg"`)), "stickers.js 跟表对得上（生成的）");
const fakeFetch = (routes) => async (url) => {
  const hit = routes.find(([re]) => re.test(url));
  if (!hit) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => hit[1](url) };
};
const geo = await geocode("某城", fakeFetch([[/geocoding-api.*name=%E6%9F%90%E5%9F%8E/, () => ({ results: [{ name: "某城", latitude: 12.3456, longitude: -45.6789, timezone: "Etc/UTC", admin1: "某省", country: "某国" }] })]]));
ok(geo.length === 1 && geo[0].lat === 12.35 && geo[0].lon === -45.68 && geo[0].where === "某省，某国", "找城市：经纬度留两位小数");
const urls = [];
const wx = await dayWeather({ name: "某城", lat: 12.35, lon: -45.68, tz: "Etc/UTC" }, "2026-10-12", async (u) => (urls.push(u), { ok: true, status: 200, json: async () => ({ daily: { weather_code: [61], temperature_2m_max: [15.4], temperature_2m_min: [9.6], precipitation_sum: [3.2] } }) }), new Date(2026, 9, 18));
ok(wx.code === 61 && wx.hi === 15.4 && wx.city === "某城" && urls[0].startsWith(WX_HOSTS[1] + "/v1/forecast?latitude=12.35&longitude=-45.68") && urls[0].includes("start_date=2026-10-12&end_date=2026-10-12"), "近的日子走预报那个接口，只寄经纬度和日子");
const urls2 = [];
await dayWeather({ name: "某城", lat: 1, lon: 2 }, "2026-04-12", async (u) => { urls2.push(u); return u.includes("archive") ? { ok: false, status: 400, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ daily: { weather_code: [0], temperature_2m_max: [1], temperature_2m_min: [0], precipitation_sum: [0] } }) }; }, new Date(2026, 9, 18));
ok(urls2[0].startsWith(WX_HOSTS[2]) && urls2[1].startsWith(WX_HOSTS[1]), "早的日子先走历史那个，不行换预报那个");
let noCity = "";
try { await dayWeather(null, "2026-10-12", async () => ({})); } catch (e) { noCity = e.message; }
ok(noCity.includes("还没填"), "没填在哪儿：不取");

// =====================================================
// 翻日记的工具看得到手帐和批注、他能留批注
// =====================================================
ok(DIARY_TOOLS.map((t) => t.name).join() === "diary_list,diary_read,diary_search,diary_note" && DIARY_NAMES.has("diary_note") && DIARY_TOOLS[3].input_schema.required.join() === "date,text", "翻日记的工具多了一样：diary_note（留批注）");
ok(DIARY_SECTION.includes("diary_note") && DIARY_SECTION.includes("手帐") && DIARY_SECTION.includes("批注"), "名帖里那一段写着手帐、批注、怎么留");
const BOOK = { "2026-10": { "2026-10-12": { her: { text: "她的日记", moods: ["happy"] } } } };
const PAGES = { "2026-10-12": page, "2026-10-14": readPage({ arr: { title: "只有手帐的一天", body: "灯笼" } }, "2026-10-14") };
const NOTES = { "2026-10-12": [{ id: "n1", who: "her", text: "这天真好", at: at(22, 0), part: "hero" }], "2026-10-15": [{ id: "n2", who: "him", text: "灯笼那天", at: at(23, 0), part: "" }] };
const reader = {
  months: async () => Object.keys(BOOK),
  month: async (ym) => BOOK[ym] || {},
  jz: async (d) => PAGES[d] || null,
  notes: async (d) => NOTES[d] || [],
  extras: async () => ({ jz: new Set(Object.keys(PAGES)), notes: new Map(Object.entries(NOTES).map(([k, v]) => [k, v.length])) }),
  addNote: async (d, n) => {
    NOTES[d] = NOTES[d] || [];
    if (!NOTES[d].some((x) => x.id === n.id)) NOTES[d].push(n);
  },
};
const NOW = new Date(2026, 9, 18, 2, 0);
const call = (name, input, id = "toolu_" + Math.random()) => ({ id, name, input });
const [ls] = await runDiaryCalls([call("diary_list", { month: "2026-10" })], reader, NOW);
ok(ls.out.includes("有日记、手帐或批注的 3 天") && ls.out.includes("10月12日 星期一｜她：心情 开心；“她的日记”｜你：没写｜手帐：有｜批注 1 条") && ls.out.includes("10月14日 星期三｜她：没写｜你：没写｜手帐：有") && ls.out.includes("10月15日 星期四｜她：没写｜你：没写｜批注 1 条"), "目录：有手帐、有批注的日子标着；没写日记、只有手帐或批注的那天也列");
const [rd] = await runDiaryCalls([call("diary_read", { dates: ["2026-10-12", "2026-10-14"] })], reader, NOW);
ok(rd.out.includes("手帐：有一页（你排的；版式 拍立得墙，风格 和纸）") && rd.out.includes("标题：泡桐花") && rd.out.includes("正文：她改过的正文") && rd.out.includes("她在页上写的字：“好看”") && rd.out.includes("批注 1 条：") && rd.out.includes("她（10月12日 22:00，贴在主照片旁边）：这天真好"), "读全文：那天的手帐（谁排的、版式风格、标题、正文、她写的字）和批注跟着一起");
ok(rd.out.includes("照片 5 张：主照片（底下写着：运河边）、双联照 2 张、饭（番茄牛肉米线）、别的 1 张") && rd.out.includes("摆的原话：09:46 卿卿：今天看到泡桐花"), "照片他看不见：写明几张、各是什么、备注；摆的原话带着几点、谁说的");
ok(rd.out.includes("【2026年10月14日 星期三】\n这天两个人都没写日记。\n\n手帐：有一页（她自己拼的") && rd.out.includes("标题：只有手帐的一天"), "没写日记、只有手帐的那天：照样给手帐");
const [sr] = await runDiaryCalls([call("diary_search", { query: "灯笼" })], reader, NOW);
ok(sr.out.includes("一共 2 处") && sr.out.indexOf("10月15日 你的批注：灯笼那天") < sr.out.indexOf("10月14日 手帐上写的：") && sr.out.includes("10月14日 手帐上写的："), "按词找：手帐上写的字、批注也找，新的在前");
const [nt] = await runDiaryCalls([call("diary_note", { date: "2026-10-12", text: "  那天的泡桐花  ", part: "hero" }, "toolu_n9")], reader, NOW);
ok(!nt.err && nt.note === "批注了日记 · 10月12日" && nt.out.includes("主照片旁边") && NOTES["2026-10-12"].some((n) => n.id === "toolu_n9" && n.who === "him" && n.text === "那天的泡桐花" && n.part === "hero"), "他留批注：存进那一天（谁、几点、贴在哪），小字“批注了日记 · 10月12日”");
await runDiaryCalls([call("diary_note", { date: "2026-10-12", text: "那天的泡桐花" }, "toolu_n9")], reader, NOW);
ok(NOTES["2026-10-12"].filter((n) => n.id === "toolu_n9").length === 1, "同一步替他办两回（两台设备）：只留一条（编号就是他调的那一样的编号）");
const [nf] = await runDiaryCalls([call("diary_note", { date: "2026-12-01", text: "x" })], reader, NOW);
const [ne] = await runDiaryCalls([call("diary_note", { date: "2026-10-12", text: "  " })], reader, NOW);
const [nr] = await runDiaryCalls([call("diary_note", { date: "2026-10-12", text: "x" })], { months: async () => [], month: async () => ({}) }, NOW);
ok(nf.err && ne.err && nr.err && nf.note === "想留批注，没留成" && nr.out.includes("留不了"), "还没到的日子、空的、开封府没接上：都没留成");
const [n0] = await runDiaryCalls([call("diary_note", { date: "2026-10-13", text: "没有手帐的一天也能留", part: "坏的" })], reader, NOW);
ok(!n0.err && NOTES["2026-10-13"][0].part === "" && n0.out.includes("那一天底下"), "没有手帐的那天也能留（留在那一天上）；认不出的零件不贴");
ok(pageText(null, []) === "" && pageText(null, ns).startsWith("批注 2 条："), "给工具看的字：什么都没有回空；只有批注就只写批注");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
