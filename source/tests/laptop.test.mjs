// 传话走笔记本（src/laptop.js）：API 面板里门牌、暗记怎么收拾；errors.js 照原样说开封府自己的后端（门）说的话
import { normDoor, normKey, laptopOn, laptopReady, lapWebOn, withLapWeb, LAP_WEB_NOTE, withLapPages, LAP_PAGE_NOTE, pagesOf, pageNote, PAGE_KEY } from "../src/laptop.js";
import { explainError } from "../src/errors.js";

let pass = 0, failN = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log("ok:", m);
  } else {
    failN++;
    console.log("FAIL:", m);
  }
};

// ---------- 门牌 ----------
ok(normDoor("https://laptop.tail1234.ts.net:8443") === "https://laptop.tail1234.ts.net:8443", "门牌：照抄的原样留着");
ok(normDoor("  laptop.tail1234.ts.net:8443  ") === "https://laptop.tail1234.ts.net:8443", "门牌：没写 https:// 的补上，前后的空白去掉");
ok(normDoor("https://laptop.tail1234.ts.net:8443/kfs/ping") === "https://laptop.tail1234.ts.net:8443", "门牌：把 /kfs/ping 那一截一起粘进来的，只留到端口");
ok(normDoor("https://laptop.tail1234.ts.net:8443/") === "https://laptop.tail1234.ts.net:8443", "门牌：末尾的斜杠去掉");
ok(normDoor("https://Laptop.Tail1234.TS.net:8443") === "https://laptop.tail1234.ts.net:8443", "门牌：大写的地址照网址的规矩收成小写");
ok(normDoor("http://127.0.0.1:8788") === "http://127.0.0.1:8788", "门牌：写的是 http:// 的不改（测试的假门）");
ok(normDoor("https://laptop.ts.net:84 43") === "https://laptop.ts.net:8443", "门牌：中间夹了空格的去掉");
ok(normDoor("") === "" && normDoor("   ") === "" && normDoor(null) === "", "门牌：空的还是空的");

// ---------- 暗记 ----------
ok(normKey("ABCDE-FGHJK-MNPQR-STUVW") === "ABCDE-FGHJK-MNPQR-STUVW", "暗记：照抄的原样留着");
ok(normKey("abcde fghjk mnpqr stuvw") === "ABCDE-FGHJK-MNPQR-STUVW", "暗记：小写、空格隔开的，收成大写、横杠连");
ok(normKey("ABCDEFGHJKMNPQRSTUVW") === "ABCDE-FGHJK-MNPQR-STUVW", "暗记：连着写的二十位，五个一组用横杠连");
ok(normKey("  abcde—fghjk—mnpqr—stuvw ") === "ABCDE-FGHJK-MNPQR-STUVW", "暗记：中文的破折号隔开的也认");
ok(normKey("abc") === "ABC", "暗记：不够二十位的不硬拆，大写了照留（门那头说不对）");
ok(normKey("") === "", "暗记：空的还是空的");

// ---------- 开关 ----------
ok(!laptopOn({}) && !laptopOn({ route: "api" }) && laptopOn({ route: "laptop" }), "传话走哪儿：没拨过是 API");
ok(!laptopReady({ route: "laptop" }) && !laptopReady({ route: "laptop", door: "https://x" }) && laptopReady({ route: "laptop", door: "https://x", doorKey: "K" }), "拨到笔记本、门牌暗记都填了才算齐");

// ---------- 上网查 ----------
ok(lapWebOn({}) && lapWebOn({ lapWeb: true }) && !lapWebOn({ lapWeb: false }), "上网查：没拨过是开着的，关了才关");
const w1 = withLapWeb({ model: "m", system: [{ type: "text", text: "名帖", cache_control: { type: "ephemeral" } }], messages: [] });
ok(w1.kfs_web === true && w1.system.length === 2 && w1.system[0].text === "名帖" && w1.system[1].text === LAP_WEB_NOTE && LAP_WEB_NOTE.startsWith("【上网】"), "名帖是一串块的：后面接一块【上网】，带上记号");
const w2 = withLapWeb({ model: "m", system: "名帖", messages: [] });
ok(Array.isArray(w2.system) && w2.system.map((b) => b.text).join("|") === "名帖|" + LAP_WEB_NOTE, "名帖是一段字的：换成一串，后面接【上网】");
const w3 = withLapWeb({ model: "m", messages: [] });
ok(w3.system.length === 1 && w3.system[0].text === LAP_WEB_NOTE, "没名帖的：名帖就是【上网】那一段");

// ---------- 做网页 ----------
const p1 = withLapPages({ model: "m", system: [{ type: "text", text: "名帖" }], messages: [] }, "tag12345");
ok(p1.kfs_pages === "tag12345" && p1.system.length === 2 && p1.system[1].text === LAP_PAGE_NOTE && LAP_PAGE_NOTE.includes("{{KFS_PAGES}}") && LAP_PAGE_NOTE.startsWith("【做网页】"), "做网页：带上那段对话的记号，名帖后面接【做网页】（文件夹那儿留着 {{KFS_PAGES}}，门那头换）");
const both = withLapPages(withLapWeb({ model: "m", system: "名帖", messages: [] }), "t");
ok(both.kfs_web === true && both.kfs_pages === "t" && both.system.map((x) => x.text.slice(0, 4)).join("|") === "名帖|【上网】|【做网页", "上网查、做网页两样一起：两段都接上");
const got = pagesOf(
  [
    { type: "text", text: "做好了" },
    { type: "kfs_page", file: "moon.html", title: "小月亮", html: "<title>小月亮</title>🌕", edited: false },
    { type: "kfs_page", file: "big.html", title: "大网页", toobig: 3 * 1048576, edited: false },
    { type: "kfs_page", file: "moon.html", title: "小月亮", html: "<title>小月亮</title>🌖", edited: true },
  ],
  "rjob1"
);
ok(got.items.length === 3 && got.items[0].page === "rjob1.0" && got.items[2].page === "rjob1.2" && got.items[2].edited && got.items[1].toobig === 3 * 1048576 && got.items.every((it) => it.type === "page" && !("html" in it)), "回话里带回来的几页：一页一样（名字是这一条加第几页，两台设备取到的一样），对话里不放整页");
ok(got.saves.length === 2 && got.saves[0].key === PAGE_KEY + "rjob1.0" && JSON.parse(got.saves[1].value).html.includes("🌖"), "要存的：有整页的那几页（太大的没有）");
ok(pageNote(got.items[0]).includes("你做的网页《小月亮》（moon.html）放进对话里了") && pageNote(got.items[2]).includes("你改过的那一页") && pageNote(got.items[1]).includes("太大了（3.0 兆）"), "跟他说的那一句：做的、改过的、太大的各说各的");

// ---------- 门说的话 ----------
ok(explainError(429, { type: "kaifengfu", message: "订阅的额度用完了", code: "cc_quota" }) === "订阅的额度用完了", "门说额度用完了：照原样（不说成“说得太快，Anthropic 让歇一会儿”）");
ok(explainError(401, { type: "kaifengfu", message: "这台电脑上的 Claude Code 没登录（或者登录过期了）", code: "cc_auth" }).includes("Claude Code 没登录"), "门说 Claude Code 没登录：照原样（不说成 key 不对）");
ok(explainError(529, { type: "overloaded_error", message: "Overloaded" }).includes("太挤"), "Anthropic 自己说的照旧翻成人话");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
