// 传话走笔记本（src/laptop.js）：API 面板里门牌、暗记怎么收拾；errors.js 照原样说开封府自己的后端（门）说的话
import { normDoor, normKey, laptopOn, laptopReady } from "../src/laptop.js";
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

// ---------- 门说的话 ----------
ok(explainError(429, { type: "kaifengfu", message: "订阅的额度用完了", code: "cc_quota" }) === "订阅的额度用完了", "门说额度用完了：照原样（不说成“说得太快，Anthropic 让歇一会儿”）");
ok(explainError(401, { type: "kaifengfu", message: "这台电脑上的 Claude Code 没登录（或者登录过期了）", code: "cc_auth" }).includes("Claude Code 没登录"), "门说 Claude Code 没登录：照原样（不说成 key 不对）");
ok(explainError(529, { type: "overloaded_error", message: "Overloaded" }).includes("太挤"), "Anthropic 自己说的照旧翻成人话");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
