// 他的头像册（src/hisBook.js）：单子怎么读写、添删改、描述怎么认，名帖里【你的头像】那一段，他写 [AVATAR:名字] 怎么认，
// 寄给那边的时候册子里的头像怎么带图
import {
  HIS_BOOK_KEY, hisPicKey, HIS_BOOK_MAX, HIS_LABEL_MAX, DESC_MAX, HIS_RULE, HIS_INDEX_HEAD, HIS_EMPTY, descRule, descRedo, descLead,
  hisLabel, cleanDesc, readHisBook, packHisBook, withPics, loadHisBook, described, pickable, findHis, addHis, dropHis, renameHis, describeHisEntry,
  parseDesc, hisSection, avOfEntry, leanAv, avOfItem, hisAvatarOk, fatAv, settleHisAvatar,
} from "../src/hisBook.js";
import { parseReply, rawOf } from "../src/reply.js";
import { buildSystem } from "../src/prompt/system.js";
import { buildMessages, sameAv } from "../src/prompt/messages.js";
import { MEME_DATA } from "../src/memes.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const pic = (s) => ({ type: "upload", data: "data:image/jpeg;base64," + s });
const none = () => null;
const texts = (messages) => messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }])).filter((b) => b.type === "text").map((b) => b.text);
const images = (messages) => messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "image").map((b) => b.source.data);

// ---- 存在哪 ----
ok(HIS_BOOK_KEY === "kfs2:hisbook" && hisPicKey("a1") === "kfs2:hisbook:a1" && !HIS_BOOK_KEY.startsWith("kfs2:avbook") && !HIS_BOOK_KEY.startsWith("kfs2:avatar"),
  "单子一条、图一张一条；名字不跟她那本、不跟眼下用的头像那两条撞");

// ---- 名字、描述怎么收拾 ----
ok(hisLabel("  雪地 小狐\n ") === "雪地小狐" && hisLabel("[小]【狐】「狸」｜|") === "小狐狸" && hisLabel("") === "" && hisLabel(null) === "" && hisLabel("   ") === "",
  "名字：空白都去掉，方括号、书名号、竖线去掉；空的就是空的（不给“未命名”）");
ok(Array.from(hisLabel("一二三四五六七八九十甲乙丙丁")).length === HIS_LABEL_MAX && hisLabel("🦊".repeat(20)) === "🦊".repeat(HIS_LABEL_MAX), `名字最多 ${HIS_LABEL_MAX} 个字`);
ok(cleanDesc("  一只 小狐\n\n趴在雪里 ｜ 很白|很冷 ") === "一只 小狐 趴在雪里 、 很白、很冷" && cleanDesc(null) === "" && Array.from(cleanDesc("字".repeat(300))).length === DESC_MAX,
  `描述：折行、连着的空白收成一个空格，竖线换成顿号，最多 ${DESC_MAX} 个字`);

// ---- 读、写 ----
ok(readHisBook(null).length === 0 && readHisBook("").length === 0 && readHisBook("坏的").length === 0 && readHisBook("[]").length === 0 && readHisBook('{"v":1}').length === 0,
  "没存过、坏了的：空册子（没有一开始就有的那几张）");
let list = [];
let r = addHis(list, pic("AAAA"), " 雪地 小狐 ", "a1");
ok(r.entry && r.list.length === 1 && r.entry.label === "雪地小狐" && r.entry.look === "" && r.entry.mood === "" && r.entry.av.data.endsWith("AAAA") && list.length === 0, "添一张：名字收拾过，描述空着；原来的单子不动");
list = r.list;
ok(addHis(list, pic("BBBB"), "", "a2").why === "name" && addHis(list, pic("BBBB"), "  ", "a2").why === "name" && addHis(list, pic("BBBB"), "[]", "a2").why === "name", "没起名字（收拾完是空的）：不添");
ok(addHis(list, pic("BBBB"), "雪地小狐", "a2").why === "dup" && addHis(list, pic("BBBB"), "雪地 小狐", "a2").why === "dup", "名字跟册子里别的重了：不添");
ok(addHis(list, pic("AAAA"), "另一个名字", "a2").why === "same", "同一张图不添第二遍");
ok(addHis(list, null, "名字", "a2").why === "bad" && addHis(list, { type: "meme", file: "x.jpg" }, "名字", "a2").why === "bad" && addHis(list, pic("BBBB"), "名字", "").why === "bad", "不是一张图、没编号的：不添");
r = addHis(list, pic("BBBB"), "读书的狐", "a2");
list = r.list;
ok(list.map((e) => e.id).join() === "a2,a1", "新添的排最上面");
let full = [];
for (let i = 0; i < HIS_BOOK_MAX + 3; i++) { const x = addHis(full, pic("P" + i), "第" + i + "张", "f" + i); if (x.list) full = x.list; }
ok(full.length === HIS_BOOK_MAX && addHis(full, pic("ZZ"), "多的", "zz").why === "full", `最多 ${HIS_BOOK_MAX} 张`);

// ---- 描述 ----
ok(!described(list[0]) && pickable(list).length === 0 && findHis(list, "雪地小狐") === null, "没有描述的：他挑不着");
let next = describeHisEntry(list, "a1", " 白色小狐趴在雪地里，\n眯着眼 ", "安静、 想睡");
ok(next && next.find((e) => e.id === "a1").look === "白色小狐趴在雪地里， 眯着眼" && next.find((e) => e.id === "a1").mood === "安静、 想睡" && !list.find((e) => e.id === "a1").look, "写上描述：收拾过；原来的单子不动");
list = next;
ok(describeHisEntry(list, "a1", "白色小狐趴在雪地里， 眯着眼", "安静、 想睡") === null && describeHisEntry(list, "没有", "x", "y") === null, "没变的、没有这一行的：不用存");
ok(described(list.find((e) => e.id === "a1")) && pickable(list).map((e) => e.id).join() === "a1" && findHis(list, "雪地小狐").id === "a1" && findHis(list, " 雪地小狐 ").id === "a1" && findHis(list, "「雪地小狐」").id === "a1"
  && findHis(list, "读书的狐") === null && findHis(list, "雪地") === null && findHis(list, "") === null && findHis(list, null) === null,
  "有描述的他挑得着：照名字认（连书名号一起抄的也认）；没描述的、只对上半截的不认");
next = describeHisEntry(list, "a1", "", "只有氛围");
ok(next && !described(next.find((e) => e.id === "a1")) && pickable(next).length === 0, "画面清空了：又算没有描述");
ok(describeHisEntry(list, "a2", "狐狸戴着眼镜看书", "").find((e) => e.id === "a2").mood === "" && described(describeHisEntry(list, "a2", "狐狸戴着眼镜看书", "").find((e) => e.id === "a2")), "只写了画面、氛围空着：算有描述");

// ---- 存了再读 ----
const packed = packHisBook(list);
ok(!packed.includes("AAAA") && !packed.includes("data:image") && packed.includes("白色小狐"), "存着的单子里没有图，有名字和描述");
const back = readHisBook(packed);
ok(back.length === 2 && back.map((e) => e.id).join() === "a2,a1" && back[1].label === "雪地小狐" && back[1].look === list[1].look && back[1].mood === list[1].mood && back[1].av === null && back[1].pic === true,
  "读回来：先后、名字、描述都对，图先空着");
ok(pickable(back).length === 0 && findHis(back, "雪地小狐") === null, "图还没取到的：他挑不着（换不上）");
const filled = withPics(back, (id) => (id === "a1" ? "data:image/jpeg;base64,AAAA" : id === "a2" ? "不是图" : null));
ok(filled[1].av.data.endsWith("AAAA") && filled[0].av === null && findHis(filled, "雪地小狐").id === "a1", "图取回来就挑得着；取回来的不是图的还空着");
const kv = { [HIS_BOOK_KEY]: packed, [hisPicKey("a1")]: "data:image/jpeg;base64,AAAA", [hisPicKey("a2")]: "data:image/jpeg;base64,BBBB" };
const loaded = await loadHisBook(async (k) => (k in kv ? kv[k] : null));
ok(loaded.length === 2 && loaded[0].av.data.endsWith("BBBB") && loaded[1].av.data.endsWith("AAAA") && (await loadHisBook(async () => null)).length === 0, "从存档里取齐：单子带着图；什么都没存过是空册子");
const messy = JSON.stringify({ v: 1, list: [null, { id: "x1", label: "好的", look: "有", mood: "" }, { id: "x1", label: "编号重了" }, { id: "x2", label: "好的" }, { id: "x3", label: "  " }, { label: "没编号" }, { id: "x4", label: "第 二 张", look: 3 }] });
const tidy = readHisBook(messy);
ok(tidy.length === 2 && tidy[0].id === "x1" && tidy[1].id === "x4" && tidy[1].label === "第二张" && tidy[1].look === "3", "认不出的行跳过；编号重了的、名字重了的只认头一个；没名字的不要");

// ---- 改名字、删 ----
ok(renameHis(list, "a1", "雪地小狐") === null && renameHis(list, "a1", "  ") === null && renameHis(list, "没有", "名字") === null, "名字没动、清空了、没有这一行：不改");
ok(renameHis(list, "a1", "读书的狐").why === "dup" && renameHis(list, "a1", "读书 的狐").why === "dup", "改成跟别的一样的名字：不让改");
const renamed = renameHis(list, "a1", " 雪 团子 ");
ok(renamed.list.find((e) => e.id === "a1").label === "雪团子" && renamed.list.find((e) => e.id === "a1").look === list.find((e) => e.id === "a1").look && list.find((e) => e.id === "a1").label === "雪地小狐", "改名字：只换名字，描述、图不动");
ok(dropHis(list, "a1").length === 1 && dropHis(list, "没有").length === 2 && list.length === 2, "删一行");

// ---- 他写回来的两行怎么认 ----
ok(JSON.stringify(parseDesc("画面：白色小狐趴在雪地里，眯着眼。\n氛围：安静，想睡的时候。")) === JSON.stringify({ look: "白色小狐趴在雪地里，眯着眼。", mood: "安静，想睡的时候。" }), "照格式写的两行");
ok(parseDesc("画面: 一只狐狸\n氛围: 懒").look === "一只狐狸" && parseDesc("氛围：懒\n画面：一只狐狸").mood === "懒" && parseDesc("氛围：懒\n画面：一只狐狸").look === "一只狐狸", "半角冒号、两行倒过来写：也认");
ok(parseDesc("好的，我来写。\n\n**画面**：狐狸在看书，\n戴着圆眼镜\n**氛围**：认真\n\n写好了。").look === "狐狸在看书， 戴着圆眼镜" && parseDesc("- 画面：狐狸\n- 氛围：认真").mood === "认真", "前后多说了话、加了粗、带了小横线、画面折了行：也认");
ok(parseDesc("画面：只有画面").mood === "" && parseDesc("画面：只有画面").look === "只有画面", "只写了画面：氛围空着");
ok(parseDesc("") === null && parseDesc(null) === null && parseDesc("这张图是一只狐狸") === null && parseDesc("氛围：只有氛围") === null && parseDesc("画面：\n氛围：有") === null, "没写出画面的：不算");
ok(Array.from(parseDesc("画面：" + "字".repeat(300) + "\n氛围：" + "气".repeat(300)).look).length === DESC_MAX, "写太长的截到上限");

// ---- 提示词：她过目过的，一个字不差 ----
ok(HIS_RULE === "想换头像吗？在回复里单独一行写 [AVATAR:头像册里的名字]。换好之后，对话里会出现一行提示，下一轮你会看到新头像图片。", "【你的头像】那一段的头一句");
ok(HIS_INDEX_HEAD === "你的头像册（名字｜画面｜氛围）：" && HIS_EMPTY === "头像从头像册里挑，眼下册子里还没有图，等放进来了再换。", "单子的那一行抬头；册子空着时的那一句");
const want = `【给头像写描述】
头像册里添了一张新图，名字叫「雪地小狐」。图附在后面，以后你换头像的索引就是下面的内容。

写两行，照这个格式：
画面：图上有什么。主体是谁、什么姿态神情，什么颜色、什么画风，背景里有什么。抓重点，不超过六十个字。
氛围：这张图给你什么感觉，什么心情、什么时候适合拿来当头像。简单记录，不超过四十个字。

只写这两行。图上有字的话照抄在画面里。【回复格式】里的规矩这一回都不作数：不写 <thinking>，不拆成几条消息，不要 [SPLIT]、[MEME]、[AVATAR]、[NAME]、[DOC]、[VOICE]、[CALL] 这些记号，也不用跟她说话。`;
ok(descRule("雪地小狐") === want, "叫他写描述的那段要求");
ok(descRedo("甲", "乙") === "上一回你写的是：\n画面：甲\n氛围：乙\n她想让你重新写一遍，换个写法，别照抄上一回的。" && descLead("雪地小狐") === "〔头像册里的新图：「雪地小狐」〕", "重写时多的那一句；图前面的那一行记号");

// ---- 名帖里【你的头像】那一段 ----
const withDesc = withPics(readHisBook(packHisBook(describeHisEntry(list, "a2", "狐狸戴着眼镜看书", ""))), (id) => kv[hisPicKey(id)]);
ok(hisSection([]) === HIS_EMPTY && hisSection(list.map((e) => ({ ...e, look: "" }))) === HIS_EMPTY && hisSection(back) === HIS_EMPTY, "册子空着、都没描述、图都没到：写“眼下册子里还没有图”那一句");
ok(hisSection(withDesc) === `${HIS_RULE}\n\n${HIS_INDEX_HEAD}\n读书的狐｜画面：狐狸戴着眼镜看书｜氛围：无\n雪地小狐｜画面：白色小狐趴在雪地里， 眯着眼｜氛围：安静、 想睡`, "有描述的：那句话、单子一行一张（名字｜画面｜氛围），氛围空着的写“无”");
ok(hisSection(filled).split("\n").length === 4 && hisSection(filled).includes("雪地小狐｜") && !hisSection(filled).includes("读书的狐"), "没描述的、图没到的不进单子");
const sysArgs = { now: new Date(2026, 10, 18, 15, 0), memeList: MEME_DATA.slice(0, 2), hisAvatarName: "「雪地小狐」", memDocs: [{ name: "名帖-测试.md", content: "测试用的名帖" }] };
const sysNone = buildSystem(sysArgs), sysBook = buildSystem({ ...sysArgs, hisBook: withDesc });
ok(sysNone.staticText.includes("【你的头像】\n" + HIS_EMPTY + "\n\n【你的名字】") && sysNone.staticText === buildSystem({ ...sysArgs, hisBook: [] }).staticText, "名帖：册子空着（不传也算空）是那一句");
ok(sysBook.staticText.includes("【你的头像】\n" + hisSection(withDesc) + "\n\n【你的名字】") && sysBook.nowNote.includes("你现在的头像：「雪地小狐」。") && sysBook.nowNote === sysNone.nowNote, "名帖：册子里有图是那句话加单子；【此刻】里写着眼下用的那张，不跟着册子变");
ok(!sysBook.staticText.includes("从下面的表情包索引里挑") && !sysBook.staticText.includes("你的头像你自己做主") && !sysNone.staticText.includes("[AVATAR:文件名]") && sysBook.staticText.includes("表情包索引（文件名｜名字｜图上文字｜适用情绪）："),
  "原来“从表情包索引里挑”的那一段没了；表情包索引还在（发表情包用）");

// ---- 他写 [AVATAR:名字] ----
const itemsOf = (t) => parseReply(t).items;
let s = settleHisAvatar(itemsOf("换一张\n[AVATAR:雪地小狐]\n好了"), withDesc, null);
const avIt = s.items.find((it) => it.type === "avatar");
ok(s.av && s.av.type === "book" && s.av.id === "a1" && s.av.label === "雪地小狐" && s.av.data.endsWith("AAAA") && avIt.file === "雪地小狐" && avIt.pic === "a1" && avIt.data.endsWith("AAAA") && avIt.prev === null,
  "写册子里的名字：换上那一张；那一项上记着是册子里的哪一张、带着图、换之前是默认的");
s = settleHisAvatar(itemsOf("[AVATAR:「读书的狐」]"), withDesc, { type: "book", id: "a1", label: "雪地小狐", data: "data:image/jpeg;base64,AAAA" });
ok(s.av.id === "a2" && JSON.stringify(s.items.find((it) => it.type === "avatar").prev) === JSON.stringify({ type: "book", id: "a1", label: "雪地小狐" }), "连书名号一起抄的也认；换之前那张记的是不带图的");
s = settleHisAvatar(itemsOf("[AVATAR:雪地小狐]\n算了\n[AVATAR:读书的狐]"), withDesc, { type: "meme", file: "fox_a.jpg" });
ok(s.av.id === "a2" && s.items.filter((it) => it.type === "avatar").length === 1 && s.items.find((it) => it.type === "avatar").prev.file === "fox_a.jpg", "写了两回：只认最后一回；换之前是表情包的照原样记");
const memeFile = MEME_DATA[0].file;
s = settleHisAvatar(itemsOf(`想换\n[AVATAR:${memeFile}]\n[AVATAR:头像册里的名字]\n[AVATAR:没有这张]`), withDesc, null);
ok(s.av === null && !s.items.some((it) => it.type === "avatar") && s.items.some((it) => it.type === "text"), "写表情包的文件名、照抄名帖里的写法、册子里没有的名字：都不认，那一行不显示，头像不换");
s = settleHisAvatar(itemsOf("[AVATAR:雪地小狐]"), filled.map((e) => ({ ...e, look: "" })), null);
ok(s.av === null, "那一张没有描述：不认");
s = settleHisAvatar(itemsOf("[AVATAR:雪地小狐]"), [], null);
ok(s.av === null && s.items.length === 1 && s.items[0].text === "……", "册子空着：不认；整条只写了这一行的摆“……”");
ok(rawOf(settleHisAvatar(itemsOf("好\n[AVATAR:雪地小狐]"), withDesc, null).items).includes("[AVATAR:雪地小狐]"), "把他的话写回去：还是 [AVATAR:名字]");

// ---- 头像本身 ----
const bookAv = avOfEntry(withDesc[1]);
ok(bookAv.type === "book" && bookAv.id === "a1" && bookAv.data.endsWith("AAAA") && JSON.stringify(leanAv(bookAv)) === JSON.stringify({ type: "book", id: "a1", label: "雪地小狐" }) && leanAv(null) === null && leanAv({ type: "meme", file: "x" }).file === "x",
  "册子里的一张 → 他用着的头像（带图）；不带图的那一份只有是哪一张、叫什么");
ok(avOfItem({ type: "avatar", file: "x.jpg" }).type === "meme" && avOfItem({ type: "avatar", file: "雪地小狐", pic: "a1", data: "D" }).type === "book" && avOfItem({ type: "avatar", file: "雪地小狐", pic: "a1", data: "D" }).data === "D" && !("data" in avOfItem({ type: "avatar", file: "雪地小狐", pic: "a1" })),
  "回话里换头像的那一项 → 头像：老记录是表情包，新的是册子里的");
ok(hisAvatarOk({ type: "meme", file: "x.jpg" }) && hisAvatarOk(bookAv) && !hisAvatarOk(leanAv(bookAv)) && !hisAvatarOk(null) && !hisAvatarOk({ type: "upload", data: "data:image/png;base64,AA" }), "存着的他的头像：表情包照旧认，册子里的得带着图");
ok(fatAv(leanAv(bookAv), withDesc).data.endsWith("AAAA") && fatAv(leanAv(bookAv), []) === null && fatAv(bookAv, []) === bookAv && fatAv(null, withDesc) === null && fatAv({ type: "meme", file: "x" }, []).file === "x",
  "不带图的补上图：册子里还有就从册子里取，没有了回空；本来带着的、表情包的原样");
ok(sameAv(bookAv, leanAv(bookAv)) && !sameAv(bookAv, avOfEntry(withDesc[0])) && !sameAv(bookAv, { type: "meme", file: "a1" }) && !sameAv(bookAv, null), "是不是同一张：册子里的认是哪一张，带没带图不管");

// ---- 寄给那边的时候 ----
let seq = 0;
const T0 = new Date(2026, 10, 18, 12, 0).getTime();
const her = (text) => ({ id: "h" + ++seq, role: "her", ts: T0 + seq * 1000, text });
const him = (text, extra = {}) => ({ id: "m" + ++seq, role: "him", ts: T0 + seq * 1000, raw: text, items: [{ type: "text", text }], ...extra });
const change = settleHisAvatar(itemsOf("换一张\n[AVATAR:读书的狐]"), withDesc, bookAv);
const chat = [her("在吗"), him("在"), her("换个头像看看"), him("换一张\n[AVATAR:读书的狐]", { items: change.items }), her("好看")];
const pics = (id) => kv[hisPicKey(id)] || null;
let built = buildMessages(chat, { her: null, him: change.av }, none, none, none, none, { picLookup: pics });
let ts = texts(built.messages), im = images(built.messages);
ok(built.messages[0].content[1].text === "你自己选的头像：" && built.messages[0].content[2].type === "image" && built.messages[0].content[2].source.data === "AAAA", "开头的附注：这段对话开头时他用的那张（换之前那张，记的是不带图的），图从册子里补上");
ok(ts.includes("[开封府提示：你的新头像换好了，是「读书的狐」，长这样]") && im.includes("BBBB") && built.tail.length === 0, "他换了头像的下一轮：提示里写着名字，带着新头像的图；眼下用的就是这一张，末尾不补话");
built = buildMessages(chat, { her: null, him: change.av }, none, none, none, none, {});
ok(texts(built.messages).includes("你自己选的头像：「雪地小狐」，这张图暂时附不上。") && images(built.messages).includes("BBBB"), "换之前那张已经从册子里删了：开头写名字、说图附不上；换上的那张图自己带着，照样看得见");
built = buildMessages(chat, { her: null, him: bookAv }, none, none, none, none, { picLookup: pics });
ok(built.tail.length === 2 && built.tail[0].text === "[开封府提示：你的头像后来又换过，现在是这张]" && built.tail[1].source.data === "AAAA", "在别的对话里又换回去了：末尾单独交出一句，带着眼下那张的图");
const old = [her("在吗"), him("换", { items: [{ type: "text", text: "换" }, { type: "avatar", file: memeFile, prev: null }] }), her("嗯")];
built = buildMessages(old, { her: null, him: { type: "meme", file: memeFile } }, (f) => MEME_DATA.find((m) => m.file === f) || null, none, none, none, { picLookup: pics });
ok(texts(built.messages).some((t) => t.includes(`你的新头像换好了，是「${MEME_DATA[0].name}」，长这样`)) && built.tail.length === 0, "老记录（换的是表情包）：照旧写表情包的名字、带图");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
