// 头像册：存着的那一份怎么读、怎么写，添一行、删一行、认不认得出“这一张已经在里头”
import { BOOK_KEY, picKey, BOOK_MAX, LABEL_MAX, NO_LABEL, STARTERS, cleanLabel, readBook, packBook, inBook, canAdd, addEntry, dropEntry } from "../src/avatarBook.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const meme = (file) => ({ type: "meme", file });
const pic = (data) => ({ type: "upload", data: "data:image/jpeg;base64," + data });

// ---- 存在哪 ----
ok(BOOK_KEY === "kfs2:avbook" && picKey("abc") === "kfs2:avbook:abc" && !BOOK_KEY.startsWith("kfs2:avatar:"),
  "单子一条、相册选的图一张一条；名字不跟“眼下用的头像”那两条撞");

// ---- 从没动过：原来那四张 ----
const first = readBook(null);
ok(first.length === 4 && first.map((e) => e.label).join("、") === "白兔、小老鼠、吃东西鼠、坏猫" && first.every((e) => e.av.type === "meme" && e.id),
  "没存过：单子是原来那四张，都是表情包里的");
ok(readBook("") .length === 4 && readBook("不是 JSON").length === 4 && readBook('{"v":1}').length === 4 && readBook("[]").length === 4,
  "空的、坏了的、样子不对的：当没存过");
first[0].label = "改了"; first.pop();
ok(STARTERS.length === 4 && STARTERS[0].label === "白兔" && readBook(null)[0].label === "白兔", "读出来的单子随便改，原来那四张不跟着变");

// ---- 名字 ----
ok(cleanLabel("  小 \n  狐狸\t ") === "小 狐狸" && cleanLabel("") === NO_LABEL && cleanLabel("   ") === NO_LABEL && cleanLabel(null) === NO_LABEL && cleanLabel(7) === "7",
  "名字：头尾的空去掉，中间连着的空收成一个；没起的叫“未命名”");
ok(Array.from(cleanLabel("一二三四五六七八九十甲乙丙丁")).length === LABEL_MAX && cleanLabel("🦊".repeat(20)) === "🦊".repeat(LABEL_MAX),
  `名字最多 ${LABEL_MAX} 个字，表情算一个字、不会截成半个`);

// ---- 添 ----
let list = readBook(null);
ok(canAdd(list, meme("fox_a.jpg")) && !canAdd(list, meme("mouse_eating.jpg")) && !canAdd(list, null) && !canAdd(list, { type: "unknown" }) && !canAdd(list, meme("")) && !canAdd(list, { type: "upload" }),
  "能不能存：里头没有的能；已经有的、默认头像、认不出的、空的不能");
const a = addEntry(list, pic("AAAA"), " 我的图 ", "n1");
ok(a && a.list.length === 5 && a.list[0].id === "n1" && a.list[0].label === "我的图" && a.list[0].pic === true && a.list[0].av.data.endsWith("AAAA") && list.length === 4,
  "添相册选的一张：放在最上面，名字收拾过；原来的单子不动");
list = a.list;
const b = addEntry(list, meme("fox_a.jpg"), "", "n2");
ok(b && b.list[0].label === NO_LABEL && b.list[0].av.file === "fox_a.jpg" && !b.list[0].pic, "添表情包里的一张，没起名字：叫“未命名”");
list = b.list;
ok(addEntry(list, pic("AAAA"), "又来", "n3") === null && addEntry(list, meme("fox_a.jpg"), "又来", "n3") === null, "同一张图不存第二遍");
ok(addEntry(list, pic("BBBB"), "撞号", "n1") === null && addEntry(list, pic("BBBB"), "没号", "") === null, "编号撞了的、没编号的不添");
ok(inBook(list, pic("AAAA")).id === "n1" && inBook(list, meme("cat_angry_face.jpg")).label === "坏猫" && inBook(list, pic("ZZZZ")) === null && inBook(list, null) === null,
  "认得出哪一行是眼下这张");

// ---- 存、读 ----
const packed = packBook(list);
ok(!packed.includes("AAAA") && !packed.includes("data:image") && packed.length < 600, "存着的单子里没有图本身，只有名字和是哪张");
const back = readBook(packed);
ok(back.length === 6 && back.map((e) => e.id).join(",") === list.map((e) => e.id).join(",") && back.map((e) => e.label).join() === list.map((e) => e.label).join(),
  "存了再读：还是那几行，先后、名字都对");
ok(back[1].pic === true && back[1].av === null && back[0].av.file === "fox_a.jpg" && back[2].av.file === "bunny_couple_hate_you.jpg",
  "读回来：表情包那种带着图；相册选的那种图先空着，等外面去取");
ok(!inBook(back, pic("AAAA")) && canAdd(back, meme("fox_b.jpg")), "图还没取到的那一行不拿来认“是不是眼下这张”");
ok(packBook(back) === packed, "图还没取到的时候再存一遍：那一行不丢");

// ---- 删 ----
const dropped = dropEntry(list, "n1");
ok(dropped.length === 5 && !dropped.some((e) => e.id === "n1") && list.length === 6 && dropEntry(list, "没有这个").length === 6, "删一行；没有的编号删了等于没删");
let none = list;
for (const e of list) none = dropEntry(none, e.id);
ok(none.length === 0 && readBook(packBook(none)).length === 0, "删光了就是空的，原来那四张不会自己长回来");

// ---- 认不出的行、重了的、太多的 ----
const messy = JSON.stringify({ v: 1, list: [null, 3, { id: "x1", label: "好的", file: "fox_a.jpg" }, { id: "x1", label: "重了", file: "fox_b.jpg" }, { id: "", label: "没号", file: "fox_c.jpg" },
  { id: "x2", label: "两头不靠" }, { id: "x3", label: "  ", pic: 1 }, { label: "没 id", pic: 1 }] });
const tidy = readBook(messy);
ok(tidy.length === 2 && tidy[0].id === "x1" && tidy[0].label === "好的" && tidy[1].id === "x3" && tidy[1].label === NO_LABEL && tidy[1].pic,
  "单子里认不出的行跳过，编号重了的只认头一个");
let many = [];
for (let i = 0; i < BOOK_MAX + 5; i++) { const r = addEntry(many, meme(`m${i}.jpg`), `第${i}张`, `id${i}`); if (r) many = r.list; }
ok(many.length === BOOK_MAX && !canAdd(many, meme("more.jpg")) && addEntry(many, meme("more.jpg"), "多的", "idx") === null, `最多 ${BOOK_MAX} 张，满了添不进去`);
const over = JSON.stringify({ v: 1, list: Array.from({ length: BOOK_MAX + 9 }, (_, i) => ({ id: `o${i}`, label: `${i}`, file: `o${i}.jpg` })) });
ok(readBook(over).length === BOOK_MAX, "存着的比上限多：只读前面那些");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
