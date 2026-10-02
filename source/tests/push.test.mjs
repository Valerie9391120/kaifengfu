// 通知的小后端（supabase/push_function.ts）：加密对不对、签名对不对、该拦的拦不拦得住、整条路走不走得通
// 直接跑：node tests/push.test.mjs（要 esbuild 把 TypeScript 的类型标记去掉，别的不靠）
import http from "node:http";
import crypto from "node:crypto";
import { loadPushFunction, loadSource, pushEnv, createFakePush, createFakeSupabase, FAKE_SUPABASE, makeVapidKeys, decryptPush, checkVapidHeader, b64u, unb64u } from "./push-harness.mjs";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fn = await loadPushFunction();
const u8 = (b) => new Uint8Array(b);

// ================= 加密：拿 RFC 8291 附录里的样例对答案 =================
// 样例给了发的一方的临时钥匙、盐、收的一方的两把钥匙，和加密出来应该是什么；一个字节都不能差
const RFC = {
  plain: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};
{
  const pub = unb64u(RFC.asPublic);
  const jwk = { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)), d: RFC.asPrivate, ext: true };
  const keys = {
    privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, true, []),
  };
  const out = await fn.encryptPayload(new TextEncoder().encode(RFC.plain), u8(unb64u(RFC.uaPublic)), u8(unb64u(RFC.auth)), { salt: u8(unb64u(RFC.salt)), keys });
  ok(b64u(out) === RFC.body && out.length === 144, "加密：和 RFC 8291 附录的样例一个字节不差（144 个字节：开头 86、正文 41、结尾的记号 1、校验 16）");

  // 测试里那个解密的（另一段代码写的）解样例，解得出原话：往下用它当“设备”才信得过
  const ua = crypto.createECDH("prime256v1");
  ua.setPrivateKey(unb64u(RFC.uaPrivate));
  const back = decryptPush(unb64u(RFC.body), ua, unb64u(RFC.auth));
  ok(back.text === RFC.plain && back.rs === 4096 && back.idlen === 65, "测试里的解密：解 RFC 的样例解得出原话，记录长度 4096，临时公钥 65 个字节");
}

// ================= 加密：平时每条都不一样，设备解得开 =================
{
  const push = createFakePush();
  const dev = push.addDevice();
  const say = "他说：晚上想吃什么？";
  const a = await fn.encryptPayload(new TextEncoder().encode(say), u8(unb64u(dev.p256dh)), u8(dev.authBytes));
  const b = await fn.encryptPayload(new TextEncoder().encode(say), u8(unb64u(dev.p256dh)), u8(dev.authBytes));
  ok(b64u(a) !== b64u(b) && b64u(a.subarray(0, 16)) !== b64u(b.subarray(0, 16)) && b64u(a.subarray(21, 86)) !== b64u(b.subarray(21, 86)),
    "加密：同一句话加密两回，盐、临时公钥、密文都不一样");
  ok(decryptPush(a, dev.ecdh, dev.authBytes).text === say && decryptPush(b, dev.ecdh, dev.authBytes).text === say, "加密：那台设备两条都解得开，中文不走样");
  const other = push.addDevice();
  let leaked = false;
  try {
    decryptPush(a, other.ecdh, other.authBytes);
    leaked = true;
  } catch (e) {}
  let wrongAuth = false;
  try {
    decryptPush(a, dev.ecdh, other.authBytes);
    wrongAuth = true;
  } catch (e) {}
  ok(!leaked && !wrongAuth, "加密：别的设备解不开；私钥对、另一把（auth）不对也解不开");
  const big = await fn.encryptPayload(new Uint8Array(3000).fill(65), u8(unb64u(dev.p256dh)), u8(dev.authBytes));
  ok(big.length === 3000 + 86 + 17 && big.length <= 4096, `加密：函数肯发的最长一条（3000 个字节）加密完 ${big.length} 个字节，在推送服务的 4096 以内`);
}

// ================= 签名的钥匙 =================
const keys = makeVapidKeys();
const other = makeVapidKeys();
const SUBJECT = "mailto:qing@example.com";
{
  const good = await fn.checkVapid(keys.publicKey, keys.privateKey, SUBJECT);
  ok(good.ok && good.vapid.publicKey === keys.publicKey && good.vapid.subject === SUBJECT, "钥匙：一对好的钥匙认得，公钥原样交出来");
  const none = await fn.checkVapid("", "", "");
  ok(!none.ok && none.missing.join() === "VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,VAPID_SUBJECT" && none.message.includes("VAPID_SUBJECT"), "钥匙：三样都没放，三样都点名");
  const noSub = await fn.checkVapid(keys.publicKey, keys.privateKey, "");
  ok(!noSub.ok && noSub.missing.join() === "VAPID_SUBJECT", "钥匙：只缺联系人，就只点它");
  const swapped = await fn.checkVapid(keys.privateKey, keys.publicKey, SUBJECT);
  ok(!swapped.ok && swapped.missing.join() === "VAPID_PUBLIC_KEY", "钥匙：公钥私钥贴反了，说公钥不对");
  const shortPriv = await fn.checkVapid(keys.publicKey, keys.privateKey.slice(0, 30), SUBJECT);
  ok(!shortPriv.ok && shortPriv.missing.join() === "VAPID_PRIVATE_KEY", "钥匙：私钥贴少了一截，说私钥不对");
  const junk = await fn.checkVapid("不是钥匙", keys.privateKey, SUBJECT);
  ok(!junk.ok && junk.missing.join() === "VAPID_PUBLIC_KEY", "钥匙：公钥那格贴了别的字，说公钥不对");
  const mixed = await fn.checkVapid(other.publicKey, keys.privateKey, SUBJECT);
  ok(!mixed.ok && mixed.missing.join() === "VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY" && mixed.message.includes("不是一对"), "钥匙：两回生成的公钥私钥混着贴，认得出不是一对");
  // Supabase 的函数跑在 Deno 上。Deno 读私钥的时候不核对它和公钥成不成对（试过：照读不误），Node 会核对、直接报错。
  // 所以函数自己另有一道：拿私钥签一句、拿公钥验。这里让 Node 学 Deno 的样子（私钥是什么就用什么），验这一道拦得住
  const realImport = crypto.subtle.importKey;
  crypto.subtle.importKey = function (format, data, ...rest) {
    if (format === "jwk" && data && data.d) {
      const e = crypto.createECDH("prime256v1");
      e.setPrivateKey(unb64u(data.d));
      const pub = e.getPublicKey();
      data = { ...data, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) };
    }
    return realImport.call(this, format, data, ...rest);
  };
  const lax = await fn.checkVapid(other.publicKey, keys.privateKey, SUBJECT);
  const laxGood = await fn.checkVapid(keys.publicKey, keys.privateKey, SUBJECT);
  delete crypto.subtle.importKey;
  ok(crypto.subtle.importKey === realImport && !lax.ok && lax.missing.join() === "VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY" && lax.message.startsWith("VAPID_PUBLIC_KEY 和 VAPID_PRIVATE_KEY 不是一对") && laxGood.ok,
    "钥匙：运行环境不核对成不成对的时候（Deno 就是这样），函数自己签一句验一句，照样认得出不是一对");
  const subs = await Promise.all(["qing@example.com", "mailto: qing@example.com", "mailto:qing", "mailto:qing@example", "http://example.com", "https://localhost", ""].map((x) => fn.checkVapid(keys.publicKey, keys.privateKey, x)));
  ok(subs.every((x) => !x.ok && x.missing.join() === "VAPID_SUBJECT"), "钥匙：联系人没写 mailto:、中间带空格、不像邮箱、不是 https 的网址，都拦下");
  const site = await fn.checkVapid(keys.publicKey, keys.privateKey, "https://example.com/contact");
  ok(site.ok, "钥匙：联系人写成 https 的网址也行");
  // 标准 base64（+ / 和等号）贴进来的也认，交出去的公钥统一成不带等号的写法
  const std = (x) => unb64u(x).toString("base64");
  const loose = await fn.checkVapid(std(keys.publicKey), std(keys.privateKey), SUBJECT);
  ok(loose.ok && loose.vapid.publicKey === keys.publicKey, "钥匙：带等号的标准 base64 贴进来也认，公钥交出去还是统一的写法");

  const AUD = "https://web.push.apple.com";
  const before = Math.floor(Date.now() / 1000);
  const token = await fn.vapidToken(good.vapid, AUD);
  const seen = checkVapidHeader(`vapid t=${token}, k=${good.vapid.publicKey}`, AUD);
  const head = JSON.parse(unb64u(token.split(".")[0]).toString());
  ok(seen.ok && head.alg === "ES256" && head.typ === "JWT" && seen.claims.aud === AUD && seen.claims.sub === SUBJECT, "签名：ES256，验得过；写着给哪家推送服务、联系人是谁");
  ok(seen.claims.exp - before === 12 * 3600 || seen.claims.exp - before === 12 * 3600 + 1, "签名：十二小时后过期（苹果不收超过一天的）");
  ok(!checkVapidHeader(`vapid t=${token}, k=${other.publicKey}`, AUD).ok && !checkVapidHeader(`vapid t=${token}, k=${good.vapid.publicKey}`, "https://fcm.googleapis.com").ok,
    "签名：换一把公钥验不过；拿给另一家推送服务也不认");
  ok((await fn.vapidToken(good.vapid, AUD)) === token, "签名：同一家推送服务接着用同一张，不每条通知都重签（苹果让别换得比一小时一次还勤）");
  ok((await fn.vapidToken(good.vapid, "https://fcm.googleapis.com")) !== token, "签名：另一家推送服务另签一张");
}

// ================= 只往认得的推送服务发、只回开封府自己的网址 =================
{
  const yes = ["https://web.push.apple.com/QGuQyavXutnMH", "https://fcm.googleapis.com/fcm/send/abc:def", "https://updates.push.services.mozilla.com/wpush/v2/gAAA", "https://db5p.notify.windows.com/w/?token=abc"];
  const no = [
    "http://web.push.apple.com/x", "https://web.push.apple.com.evil.example/x", "https://evil.example/web.push.apple.com", "https://push.apple.com.evil.example/",
    "https://user:pw@web.push.apple.com/x", "https://web.push.apple.com:8443/x", "https://127.0.0.1/x", "https://169.254.169.254/latest/meta-data", "https://localhost/x",
    "https://xfcm.googleapis.com/x", "ftp://web.push.apple.com/x", "不是网址", "",
  ];
  ok(yes.every((x) => fn.pushHost(x) === new URL(x).hostname), "地址：苹果、谷歌、火狐、微软的推送服务认得");
  ok(no.every((x) => fn.pushHost(x) === null), "地址：别的网址、内网地址、冒名的域名、带账号密码的、换了端口的，一律不发");

  const O = "https://valerie.example";
  ok(fn.safePage(O + "/kaifengfu/", O) === O + "/kaifengfu/" && fn.safePage(O + "/kaifengfu/dingxiang/", O) === O + "/kaifengfu/dingxiang/", "回到哪：开封府自己的两个入口都行");
  ok(fn.safePage(O + "/kaifengfu/?a=1#n=x", O) === O + "/kaifengfu/", "回到哪：问号和井号后面的不要");
  ok(fn.safePage("https://evil.example/kaifengfu/", O) === null && fn.safePage("javascript:alert(1)", O) === null && fn.safePage("", O) === null && fn.safePage("http://valerie.example/", "http://valerie.example") === null,
    "回到哪：别人的网址、不是 https 的、空的，都不行");
  ok(fn.safePage("http://127.0.0.1:8080/", "http://127.0.0.1:8080") === "http://127.0.0.1:8080/" && fn.safePage(O + "/" + "a".repeat(300), O) === null && fn.safePage("https://u:p@valerie.example/", O) === null,
    "回到哪：本机测试的网址放行；太长的、带账号密码的不行");
  pushEnv.ALLOWED_ORIGIN = "https://only.example";
  ok(fn.safePage(O + "/kaifengfu/", null) === null && fn.safePage("https://only.example/kaifengfu/", null) === "https://only.example/kaifengfu/", "回到哪：密钥柜里写了 ALLOWED_ORIGIN，就只认它");
  delete pushEnv.ALLOWED_ORIGIN;
  ok(fn.tidy("Bad\nJwt\tToken 中文 " + "x".repeat(300)).length === 120 && fn.tidy(" BadJwtToken\r\n") === "BadJwtToken", "报错原因：只留看得见的英文数字，最长 120 个字");
}

// ================= 整条路：敲门 → 查人 → 查登记簿 → 加密 → 签名 → 推送服务 → 设备 =================
const push = createFakePush();
const supa = createFakeSupabase();
push.install(supa);
const QING = { id: "11111111-1111-1111-1111-111111111111", email: "qing@example.com" };
const STRANGER = { id: "22222222-2222-2222-2222-222222222222", email: "someone@example.com" };
supa.tokens.set("token-qing", QING);
supa.tokens.set("token-stranger", STRANGER);
const ORIGIN = "https://valerie.example";
const PAGE = ORIGIN + "/kaifengfu/dingxiang/";
Object.assign(pushEnv, { SUPABASE_URL: FAKE_SUPABASE, SUPABASE_ANON_KEY: "sb_publishable_test", ALLOWED_EMAIL: "Qing@Example.com " });

const replies = []; // 函数回过的每一句话，最后查里面有没有私钥
async function call(body, { token = "token-qing", method = "POST", origin = ORIGIN, raw } = {}) {
  const headers = { "Content-Type": "application/json", apikey: "sb_publishable_test" };
  if (token) headers.Authorization = "Bearer " + token;
  if (origin) headers.Origin = origin;
  const req = new Request("http://fn.test/functions/v1/push", { method, headers, body: method === "POST" ? (raw !== undefined ? raw : JSON.stringify(body)) : undefined });
  const res = await fn.handler(req);
  const text = await res.text();
  replies.push(text);
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {}
  return { status: res.status, data, text, headers: res.headers };
}
const register = (dev, user = QING, page = PAGE) => supa.table.handle("POST", new URLSearchParams("on_conflict=user_id,endpoint"), user.id, JSON.stringify({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth, page }));
const rowOf = (dev) => supa.table.all().find((r) => r.endpoint === dev.endpoint) || null;

{
  // ---- 门口 ----
  const pre = await call(null, { method: "OPTIONS", token: "" });
  ok(pre.status === 200 && pre.headers.get("access-control-allow-origin") === "*" && /authorization/.test(pre.headers.get("access-control-allow-headers")) && /apikey/.test(pre.headers.get("access-control-allow-headers")),
    "门口：浏览器先来打招呼（OPTIONS），放行，允许带登录凭证");
  ok((await call(null, { method: "GET" })).status === 405, "门口：只收 POST");
  const anon = await call({ op: "key" }, { token: "" });
  const fake = await call({ op: "key" }, { token: "made-up" });
  ok(anon.status === 401 && fake.status === 401 && anon.data.error.message === "请先登录开封府", "门口：没登录、凭证是编的，都不让进");
  const stranger = await call({ op: "key" }, { token: "token-stranger" });
  ok(stranger.status === 403 && stranger.data.error.message === "这里只认卿卿", "门口：登录了但不是卿卿，不让进（邮箱不分大小写、两头空白不算）");
  ok((await call(null, { raw: "{不是 JSON" })).status === 400 && (await call(null, { raw: "[1,2" })).status === 400 && (await call(null, { raw: "null" })).status === 400, "门口：寄来的不是合法的 JSON，拦下");
  ok((await call(null, { raw: JSON.stringify({ op: "key", pad: "x".repeat(5000) }) })).status === 413, "门口：寄来的东西太长，拦下");
  ok((await call({ op: "bomb" })).status === 400 && (await call({})).status === 400, "门口：不认识的动作，拦下");
  ok(supa.seen.every((x) => x.apikey === "sb_publishable_test"), "门口：去问 Supabase 的时候带着公开钥匙");

  // ---- 钥匙放好了没有 ----
  const empty = await call({ op: "key" });
  ok(empty.status === 200 && empty.data.configured === false && empty.data.missing.length === 3 && !("publicKey" in empty.data), "问钥匙：密钥柜里还没放，照实说缺哪三样");
  const noKeys = await call({ op: "test", endpoint: "https://web.push.apple.com/x" });
  ok(noKeys.status === 400 && noKeys.data.error.message.includes("VAPID_PUBLIC_KEY") && push.log.length === 0, "发测试：钥匙没放好就不发");
  // 整段粘贴带进来的引号、空白、换行，都不碍事；换了密钥柜里的值不用重新部署
  Object.assign(pushEnv, { VAPID_PUBLIC_KEY: ` "${keys.publicKey}"\n`, VAPID_PRIVATE_KEY: `'${keys.privateKey}' `, VAPID_SUBJECT: `\t${SUBJECT}\n` });
  const ready = await call({ op: "key" });
  ok(ready.status === 200 && ready.data.configured === true && ready.data.publicKey === keys.publicKey && Object.keys(ready.data).sort().join() === "configured,publicKey",
    "问钥匙：贴进密钥柜就认（两头带着引号、空白、换行也不碍事），只把公钥交出来");
  pushEnv.VAPID_PRIVATE_KEY = other.privateKey;
  const broken = await call({ op: "key" });
  ok(broken.data.configured === false && broken.data.message.includes("不是一对"), "问钥匙：私钥换成了另一把，马上说不是一对");
  pushEnv.VAPID_PRIVATE_KEY = keys.privateKey;

  // ---- 发测试通知 ----
  ok((await call({ op: "test" })).status === 400 && (await call({ op: "test", endpoint: 42 })).status === 400 && (await call({ op: "test", endpoint: "https://web.push.apple.com/" + "x".repeat(1100) })).status === 400,
    "发测试：没说是哪台设备、地址太长，拦下");
  const dev = push.addDevice();
  const unknown = await call({ op: "test", endpoint: dev.endpoint });
  ok(unknown.status === 400 && unknown.data.error.message.includes("还没登记") && push.log.length === 0, "发测试：这台设备没在登记簿里，不发");
  supa.table.state.missing = true;
  const noTable = await call({ op: "test", endpoint: dev.endpoint });
  ok(noTable.status === 400 && noTable.data.error.message.includes("push.sql") && push.log.length === 0, "发测试：登记簿那张表还没建，说清楚要跑 push.sql");
  supa.table.state.missing = false;

  register(dev);
  const second = push.addDevice();
  register(second);
  const theirs = push.addDevice();
  register(theirs, STRANGER);
  const t0 = Date.now();
  const sent = await call({ op: "test", endpoint: dev.endpoint });
  const got = push.delivered[0];
  ok(sent.status === 200 && sent.data.queued === false && sent.data.results.length === 1 && sent.data.results[0].ok && sent.data.results[0].status === 201 && sent.data.results[0].host === "web.push.apple.com" && sent.data.results[0].removed === false,
    "发测试：推送服务收下了（201），回话里写着发给了哪家");
  ok(push.delivered.length === 1 && got.endpoint === dev.endpoint && push.log.length === 1, "发测试：只发给点名的这一台，她另一台设备、别人的设备都没动");
  ok(got.json && got.json.web_push === 8030 && got.json.notification.title === "测试通知" && got.json.notification.body.includes("这条路就通了") && Object.keys(got.json).join() === "web_push,notification",
    "通知的样子：苹果认的声明式写法（web_push 是 8030），有标题有正文");
  ok(/^https:\/\/valerie\.example\/kaifengfu\/dingxiang\/#n=test-[A-Za-z0-9_-]{8}$/.test(got.json.notification.navigate), `通知的样子：点了回到这台设备自己的入口，后面带一个记号（${got.json.notification.navigate.replace(/.*#/, "#")}）`);
  ok(got.ttl === "120" && got.urgency === "high" && got.claims.aud === "https://web.push.apple.com" && got.claims.sub === SUBJECT, "发的规矩：TTL 是正数、加急、签名是给苹果那家的、联系人照密钥柜里的写");
  ok(!sent.text.includes(dev.endpoint.split("/").pop()) && !sent.text.includes(dev.p256dh) && !sent.text.includes(dev.auth), "回话里不带设备的门牌号和钥匙");
  const noted = rowOf(dev);
  ok(noted.last_status === 201 && noted.last_note === "" && Date.parse(noted.last_at) >= t0 && rowOf(second).last_at === null && rowOf(theirs).last_at === null, "登记簿：这一回发得怎么样记在这台设备那一行，别的行没动");

  // 拿别人的门牌号来发：读不到那一行，发不出去
  const cross = await call({ op: "test", endpoint: theirs.endpoint });
  ok(cross.status === 400 && cross.data.error.message.includes("还没登记") && push.delivered.length === 1, "发测试：点名别人的设备，登记簿不给看，发不出去");

  // 每回点开的记号不一样（同一个网址点两回，手机会当成刷新）
  await call({ op: "test", endpoint: dev.endpoint });
  ok(push.delivered.length === 2 && push.delivered[1].json.notification.navigate !== got.json.notification.navigate && push.delivered[1].token === got.token, "发测试：再发一条，回来的记号换了；签名还是刚才那张");

  // ---- 推送服务不顺的时候 ----
  const gone = push.addDevice("gone");
  register(gone);
  const r410 = await call({ op: "test", endpoint: gone.endpoint });
  ok(r410.status === 200 && r410.data.results[0].status === 410 && r410.data.results[0].removed === true && !r410.data.results[0].ok && rowOf(gone) === null && gone.hits === 1,
    "地址作废（410）：从登记簿里划掉，不重试");
  const flaky = push.addDevice("flaky");
  register(flaky);
  const rFlaky = await call({ op: "test", endpoint: flaky.endpoint });
  ok(rFlaky.data.results[0].ok && flaky.hits === 2 && rowOf(flaky).last_status === 201, "推送服务头一回没应（503）：等一下再试一回，成了");
  const down = push.addDevice("down");
  register(down);
  const rDown = await call({ op: "test", endpoint: down.endpoint });
  ok(!rDown.data.results[0].ok && rDown.data.results[0].status === 503 && rDown.data.results[0].reason === "ServiceUnavailable" && down.hits === 2 && rowOf(down).last_status === 503 && rowOf(down).last_note === "ServiceUnavailable",
    "推送服务一直没应：只重试一回就停，原因记进登记簿");
  const unlisted = push.addDevice();
  supa.table.handle("POST", new URLSearchParams("on_conflict=user_id,endpoint"), QING.id, JSON.stringify({ endpoint: "https://evil.example/collect", p256dh: unlisted.p256dh, auth: unlisted.auth, page: PAGE }));
  const before = push.log.length;
  const rEvil = await call({ op: "test", endpoint: "https://evil.example/collect" });
  ok(rEvil.data.results[0].status === 0 && rEvil.data.results[0].reason === "BadEndpoint" && push.log.length === before, "登记簿里混进了不认得的地址：不去敲那个门");
  const badKeys = push.addDevice();
  supa.table.handle("POST", new URLSearchParams("on_conflict=user_id,endpoint"), QING.id, JSON.stringify({ endpoint: badKeys.endpoint, p256dh: "AAAA", auth: badKeys.auth, page: PAGE }));
  const rKeys = await call({ op: "test", endpoint: badKeys.endpoint });
  ok(rKeys.data.results[0].reason === "BadKeys" && badKeys.hits === 0, "登记簿里的钥匙是坏的：不发，说钥匙不对");
  const farPage = push.addDevice();
  register(farPage, QING, "https://evil.example/kaifengfu/");
  const rPage = await call({ op: "test", endpoint: farPage.endpoint });
  ok(rPage.data.results[0].reason === "BadPage" && farPage.hits === 0 && rowOf(farPage).last_note === "BadPage", "登记的回程网址不是开封府自己的：不发");
  const stale = push.addDevice();
  stale.serverKey = other.publicKey; // 这台设备是拿旧钥匙订的
  register(stale);
  const rStale = await call({ op: "test", endpoint: stale.endpoint });
  ok(rStale.data.results[0].status === 400 && rStale.data.results[0].reason === "VapidPkHashMismatch" && rowOf(stale).last_note === "VapidPkHashMismatch", "换过钥匙、设备还订在旧钥匙上：推送服务不收，原因原样带回来");

  // ---- 等几秒再发（她点完就锁屏） ----
  const waits = [];
  globalThis.EdgeRuntime = { waitUntil: (p) => waits.push(p) };
  const late = push.addDevice();
  register(late);
  const t1 = Date.now();
  const queued = await call({ op: "test", endpoint: late.endpoint, delay: 1 });
  const took = Date.now() - t1;
  ok(queued.status === 200 && queued.data.queued === true && queued.data.delay === 1 && took < 500 && late.hits === 0 && rowOf(late).last_at === null, `等一秒再发：先回话（${took} 毫秒），这时候还没发`);
  ok(waits.length === 1 && typeof waits[0].then === "function", "等一秒再发：后台的活交给了 EdgeRuntime.waitUntil（Supabase 靠它把活干完）");
  await waits[0];
  const lateGot = push.delivered[push.delivered.length - 1];
  ok(late.hits === 1 && lateGot.endpoint === late.endpoint && lateGot.at - t1 >= 1000 && rowOf(late).last_status === 201, `等一秒再发：${lateGot.at - t1} 毫秒后发到，结果记进登记簿`);
  const long = await call({ op: "test", endpoint: late.endpoint, delay: 999 });
  const neg = await call({ op: "test", endpoint: late.endpoint, delay: -5 });
  ok(long.data.queued === true && long.data.delay === 20 && neg.data.queued === false, "等多久：最长二十秒；负数当成马上发");
  delete globalThis.EdgeRuntime;
  // 没有 EdgeRuntime 的地方（本机）：后台的活照样干完，出了错也不往外冒
  const plain = push.addDevice("gone");
  register(plain);
  const q2 = await call({ op: "test", endpoint: plain.endpoint, delay: 1 });
  await sleep(1400);
  ok(q2.data.queued === true && plain.hits === 1 && rowOf(plain) === null, "没有 EdgeRuntime 的地方：后台的活也干完了（地址作废的那行照样划掉）");

  // ---- 私钥哪儿都不该出现 ----
  ok(replies.length > 30 && replies.every((t) => !t.includes(keys.privateKey) && !t.includes(other.privateKey)), `函数回过的 ${replies.length} 句话里，没有一句带着私钥`);
  ok(push.log.every((x) => !JSON.stringify(x.headers).includes(keys.privateKey)), "发给推送服务的请求里也没有私钥");
}
push.uninstall();

// ================= 手机这一头的零件（src/notify.js） =================
const N = await loadSource("src/notify.js");
{
  const bytes = new Uint8Array([251, 255, 0, 1, 2, 254, 62, 63]);
  ok(N.bytesToB64u(bytes) === "-_8AAQL-Pj8" && N.bytesToB64u(bytes.buffer) === "-_8AAQL-Pj8" && N.bytesToB64u(new Uint8Array(new Uint8Array([9, ...bytes, 9]).buffer, 1, 8)) === "-_8AAQL-Pj8",
    "base64url：整块的、缓冲区、中间截一段的，写出来都一样，不带 + / 和等号");
  ok(N.b64uToBytes("-_8AAQL-Pj8").join() === bytes.join() && N.b64uToBytes("+/8AAQL+Pj8=").join() === bytes.join() && N.b64uToBytes(" -_8AAQL-Pj8\n").join() === bytes.join(), "base64url：读回来一样；带 + / 和等号的、两头有空白的也认");
  ok(N.b64uToBytes("不是") === null && N.b64uToBytes("") === null && N.b64uToBytes(null) === null && N.b64uToBytes("abcde") === null && N.b64uToBytes("a b") === null, "base64url：不是 base64 的回 null，不乱猜");
  ok(N.sameKey(keys.publicKey, unb64u(keys.publicKey).toString("base64")) && !N.sameKey(keys.publicKey, other.publicKey) && !N.sameKey("", "") && !N.sameKey(keys.publicKey, ""), "两把公钥比的是内容：写法不同算同一把；空的不算同一把");

  // 她在账户面板里点“生成一份钥匙”
  const made = await N.generateVapidKeys(crypto.subtle);
  const made2 = await N.generateVapidKeys(crypto.subtle);
  ok(/^B[A-Za-z0-9_-]{86}$/.test(made.publicKey) && /^[A-Za-z0-9_-]{43}$/.test(made.privateKey) && made.publicKey !== made2.publicKey && made.privateKey !== made2.privateKey, "生成钥匙：公钥 87 个字符、B 开头，私钥 43 个字符；每回都不一样");
  let refused = 0;
  for (const d of ["AAAA", "", "不是"]) {
    // 浏览器给的私钥万一不对劲（长短不对）：宁可报错，也不交出一份贴进去用不了的钥匙
    const fake = { generateKey: async () => ({ publicKey: 1, privateKey: 2 }), exportKey: async (format) => (format === "raw" ? unb64u(made.publicKey) : { d }) };
    try {
      await N.generateVapidKeys(fake);
    } catch (e) {
      refused++;
    }
  }
  ok(refused === 3, "生成钥匙：浏览器给的私钥长短不对就报错，不交出用不了的钥匙");
  const accepted = await fn.checkVapid(made.publicKey, made.privateKey, "mailto:qing@example.com");
  ok(accepted.ok && accepted.vapid.publicKey === made.publicKey, "生成钥匙：小后端认这对钥匙（公钥私钥对得上）");
  const block = N.secretsBlock(made, " qing@example.com ");
  ok(block === `VAPID_PUBLIC_KEY=${made.publicKey}\nVAPID_PRIVATE_KEY=${made.privateKey}\nVAPID_SUBJECT=mailto:qing@example.com` && block.split("\n").every((l) => l.split("=").length === 2),
    "贴进密钥柜的三行：名字=值，值里没有等号（Supabase 按第一个等号分名字和值）");
  const blank = N.secretsBlock(made, "");
  ok(blank.endsWith("VAPID_SUBJECT=mailto:这里换成你的邮箱") && !(await fn.checkVapid(made.publicKey, made.privateKey, blank.split("\n")[2].split("=")[1])).ok, "不知道邮箱的时候留一句提醒；忘了改，小后端会拦下说联系人不对");

  // 这台设备能不能开
  const full = { isSecureContext: true, navigator: { serviceWorker: {}, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)", standalone: true }, PushManager: function () {}, Notification: function () {} };
  const safariTab = { isSecureContext: true, navigator: { serviceWorker: {}, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)", standalone: false }, matchMedia: () => ({ matches: false }) };
  const oldPhone = { isSecureContext: true, navigator: { serviceWorker: {}, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X)", standalone: true } };
  const ipad = { isSecureContext: true, navigator: { serviceWorker: {}, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 }, matchMedia: () => ({ matches: false }) };
  const oldMac = { isSecureContext: true, navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 }, Notification: function () {} };
  ok(N.pushSupport(full).ok && N.pushSupport(full).say === "", "能不能开：主屏幕上的开封府（新系统）能开");
  ok(N.pushSupport(safariTab).why === "homescreen" && N.pushSupport(safariTab).say.includes("主屏幕") && N.pushSupport(ipad).why === "homescreen", "能不能开：iPhone、iPad 在 Safari 里打开的，说要从主屏幕的图标进来");
  ok(N.pushSupport(oldPhone).why === "old" && N.pushSupport(oldPhone).say.includes("16.4"), "能不能开：从主屏幕进来了还是没有，说系统太旧");
  ok(N.pushSupport(oldMac).why === "nopush" && N.pushSupport({ isSecureContext: false, navigator: {} }).why === "insecure" && N.pushSupport(null).why === "insecure" && !N.pushSupport({ isSecureContext: true }).ok,
    "能不能开：别的浏览器没有就照实说；不是 https 的开不了；什么都没给也不出错");
  ok(N.isStandalone({ navigator: { standalone: true } }) && N.isStandalone({ navigator: {}, matchMedia: () => ({ matches: true }) }) && !N.isStandalone({ navigator: {}, matchMedia: () => { throw new Error("x"); } }) && !N.isStandalone({ navigator: {} }),
    "是不是从主屏幕打开的：苹果的记号、标准的问法都认；问不了就当不是");

  // 订阅 → 登记簿里的一行
  const push2 = createFakePush();
  const dev = push2.addDevice();
  const kb = unb64u(keys.publicKey);
  const sub = { endpoint: dev.endpoint, options: { applicationServerKey: kb.buffer.slice(kb.byteOffset, kb.byteOffset + kb.length) }, toJSON: () => ({ endpoint: dev.endpoint, expirationTime: null, keys: { p256dh: dev.p256dh, auth: dev.auth } }) };
  const when = new Date("2026-10-02T12:00:00Z");
  const row = N.subscriptionRow(sub, "uid-1", "https://valerie.example/kaifengfu/", when);
  ok(row && Object.keys(row).join() === "user_id,endpoint,p256dh,auth,page,updated_at" && row.endpoint === dev.endpoint && row.p256dh === dev.p256dh && row.auth === dev.auth && row.updated_at === "2026-10-02T12:00:00.000Z",
    "订阅变成登记簿里的一行：门牌号、两把公开钥匙、回程网址、时间");
  const viaGetKey = N.subscriptionRow({ endpoint: dev.endpoint, toJSON: () => ({ endpoint: dev.endpoint }), getKey: (n) => (n === "p256dh" ? unb64u(dev.p256dh) : dev.authBytes) }, "uid-1", "p", when);
  const padded = N.subscriptionRow({ toJSON: () => ({ endpoint: dev.endpoint, keys: { p256dh: unb64u(dev.p256dh).toString("base64"), auth: dev.authBytes.toString("base64") } }) }, "uid-1", "p", when);
  ok(viaGetKey && viaGetKey.p256dh === dev.p256dh && viaGetKey.auth === dev.auth && padded && padded.p256dh === dev.p256dh && padded.auth === dev.auth, "订阅：钥匙不在 JSON 里就用 getKey 取；带等号的写法收拾成统一的");
  ok(N.subscriptionRow(sub, "", "p") === null && N.subscriptionRow({ toJSON: () => ({ endpoint: "http://web.push.apple.com/x", keys: { p256dh: dev.p256dh, auth: dev.auth } }) }, "u", "p") === null &&
    N.subscriptionRow({ toJSON: () => ({ endpoint: dev.endpoint, keys: { p256dh: "AAAA", auth: dev.auth } }) }, "u", "p") === null && N.subscriptionRow({ toJSON: () => { throw new Error("x"); } }, "u", "p") === null && N.subscriptionRow(null, "u", "p") === null,
    "订阅：不知道是谁的、门牌号不是 https、钥匙长短不对、读不出来，都不登记");
  ok(N.subscriptionKey(sub) === keys.publicKey && N.subscriptionKey({}) === "" && N.subscriptionKey(null) === "" && N.subscriptionKey({ options: {} }) === "", "订阅是拿哪把公钥订的：浏览器肯说就读出来，不肯说回空");
  const at = (pathname) => N.entrancePage({ origin: "https://valerie.example", pathname });
  ok(at("/kaifengfu/") === "https://valerie.example/kaifengfu/" && at("/kaifengfu/dingxiang/") === "https://valerie.example/kaifengfu/dingxiang/" && at("/kaifengfu/index.html") === "https://valerie.example/kaifengfu/" && at("/kaifengfu/dingxiang/index.html") === "https://valerie.example/kaifengfu/dingxiang/" && at("/") === "https://valerie.example/",
    "回程的网址：这台设备从哪个入口进来的就是哪个，到斜杠为止");
  ok(fn.safePage(at("/kaifengfu/dingxiang/index.html"), "https://valerie.example") === "https://valerie.example/kaifengfu/dingxiang/", "回程的网址：手机这头给的，小后端那头认");

  // 发得怎么样，说成人话
  const say = (status, note, host = "web.push.apple.com") => N.explainOutcome({ status, note, host });
  ok(say(201, "").ok && say(201, "").say.startsWith("苹果收下了") && say(200, "", "fcm.googleapis.com").say.startsWith("谷歌收下了") && say(201, "", "example.net").say.startsWith("推送服务收下了"), "说人话：收下了，说是哪家收的");
  ok(!say(403, "BadJwtToken").ok && say(403, "BadJwtToken").say.includes("VAPID_SUBJECT") && say(403, "BadJwtToken").say.includes("BadJwtToken") && say(400, "BadVapidPublicKey").say.includes("钥匙"), "说人话：苹果不认钥匙，说多半是联系邮箱或者钥匙不成对，原因原样带着");
  ok(say(400, "VapidPkHashMismatch").say.includes("换过") && say(410, "Unregistered").say.includes("作废") && say(404, "BadPath").say.includes("作废"), "说人话：钥匙换过、门牌号作废，各有各的说法");
  ok(say(0, "BadKeys").say.includes("登记不对") && say(0, "BadPage").say.includes("登记不对") && say(0, "TypeError: fetch failed").say.includes("没连上苹果"), "说人话：登记簿里的东西不对，让她重开一次；没连上就说没连上");
  ok(say(413, "PayloadTooLarge").say.includes("太长") && say(429, "TooManyRequests").say.includes("歇一会儿") && say(503, "ServiceUnavailable").say.includes("503") && say(400, "BadTtl").say.includes("BadTtl") && say(400, "BadTtl").say.includes("截图"),
    "说人话：太长、太勤、对面出岔子；认不出来的把状态和原因摆出来，让她截图");
  ok([200, 201, 202].every((x) => say(x, "").ok) && [0, 400, 403, 404, 410, 413, 429, 500, 503].every((x) => !say(x, "x").ok), "说人话：只有 2 开头的算成了");

  // 从通知回来
  ok(N.readNoticeMark("#n=test-AbC_9.z") === "test-AbC_9.z" && N.noticeMarkOfUrl("https://valerie.example/kaifengfu/dingxiang/#n=test-1") === "test-1", "通知的记号：从井号后面读出来");
  ok(["", "#", "#n=", "#n=a b", "#n=<script>", "#x=1", "#n=" + "a".repeat(81), "n=abc", "#n=a#b", null, undefined].every((h) => N.readNoticeMark(h) === "") && N.noticeMarkOfUrl("不是网址") === "" && N.noticeMarkOfUrl("https://valerie.example/") === "",
    "通知的记号：空的、带怪字符的、太长的、不是这种写法的，一律当没有");

  // 给我看的细节
  const state = { standalone: true, support: { ok: true, why: "" }, permission: "granted", setup: { table: "ok", fn: "ok", keys: "ok", say: "" }, worker: "ok", host: "web.push.apple.com", endpoint: dev.endpoint, flag: true, devices: 2, last: { at: Date.parse("2026-10-02T12:00:00Z"), status: 403, note: "BadJwtToken" } };
  const lines = N.describePush(state).join("\n");
  ok(["从主屏幕的图标打开：是", "系统的许可：允许了", "登记簿：有", "小后端：接上了", "钥匙：放好了", "服务线程：在", "苹果给的（web.push.apple.com）", "一共 2 台", "状态 403，BadJwtToken"].every((x) => lines.includes(x)) && !lines.includes(dev.endpoint),
    "看细节：每一环好没好都写着；门牌号只说是哪家给的，整串不露");
  const stuck = N.describePush({ ...state, permission: "default", setup: { table: "missing", fn: "unreachable", keys: "", say: "连不上通知的小后端" }, worker: "", host: "", flag: false, devices: 0, last: null }).join("\n");
  ok(["还没问过", "登记簿：还没建", "小后端：连不上", "钥匙：还看不到", "它说：连不上通知的小后端", "服务线程：还没起", "门牌号：还没有"].every((x) => stuck.includes(x)), "看细节：没接好的时候，哪一环没好写得出来");
  ok(N.describePush({ standalone: false, support: { ok: false, why: "homescreen" } }).join("\n") === "从主屏幕的图标打开：否\n浏览器能开通知：不能（homescreen）", "看细节：开不了的设备只说为什么开不了");
}

// ================= 服务工作线程（src/sw.js）：在假的环境里跑真的那份代码 =================
{
  const vm = await import("node:vm");
  const fs = await import("node:fs");
  const code = fs.readFileSync(new URL("../src/sw.js", import.meta.url), "utf8");
  // scope 是它管得着的范围；wins 是这会儿开着的窗口
  function boot(scope, wins = []) {
    const handlers = {};
    const calls = { shown: [], opened: [], skipped: 0, claimed: 0 };
    const self = {
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: () => { calls.skipped++; },
      registration: { scope, showNotification: async (title, options) => { calls.shown.push({ title, options }); } },
      clients: { claim: async () => { calls.claimed++; }, matchAll: async (q) => { calls.query = q; return wins; }, openWindow: async (url) => { calls.opened.push(url); } },
    };
    vm.runInNewContext(code, { self, URL, console });
    // 派一个事件下去，等它把活干完（waitUntil 交出来的那些）
    const fire = async (type, init = {}) => {
      const waits = [];
      const event = { waitUntil: (p) => waits.push(p), ...init };
      handlers[type](event);
      await Promise.all(waits);
      return waits.length;
    };
    return { calls, fire, handlers };
  }
  const SCOPE = "https://valerie.example/kaifengfu/";
  const data = (obj) => ({ json: () => obj });
  const notice = (navigate, extra = {}) => ({ web_push: 8030, notification: { title: "开封府", body: "测试通知", navigate, lang: "zh-CN", ...extra } });

  const a = boot(SCOPE);
  ok(Object.keys(a.handlers).sort().join() === "activate,install,notificationclick,push", "sw.js：只接四件事：装上、启用、收到推送、通知被点。没有 fetch：网页的请求它一概不碰");
  await a.fire("install");
  await a.fire("activate");
  ok(a.calls.skipped === 1 && a.calls.claimed === 1, "sw.js：新版本一装上就接手，不等旧的退场");

  const waited = await a.fire("push", { data: data(notice(SCOPE + "dingxiang/#n=test-1", { tag: "t1" })) });
  const first = a.calls.shown[0];
  ok(waited === 1 && a.calls.shown.length === 1 && first.title === "开封府" && first.options.body === "测试通知" && first.options.data.target === SCOPE + "dingxiang/#n=test-1" && first.options.tag === "t1" && first.options.lang === "zh-CN" && first.options.icon === SCOPE + "icons/icon-192.png",
    "sw.js 收到推送：照着那段 JSON 显示一条，点了去哪记在通知身上；等显示完了才算完");
  ok(!("navigate" in first.options) && !("title" in first.options) && !("silent" in first.options), "sw.js：只把认得的几样交给系统，别的不带");

  const b = boot(SCOPE);
  const waitedB = await b.fire("push", { data: data(notice(SCOPE + "#n=test-2")), notification: { title: "开封府" } });
  ok(waitedB === 0 && b.calls.shown.length === 0, "sw.js：系统已经准备自己显示了（新一些的苹果系统）：不抢，让系统来");

  const c = boot(SCOPE);
  await c.fire("push", { data: { json: () => { throw new Error("不是 JSON"); } } });
  await c.fire("push", { data: null });
  await c.fire("push", { data: data({ hello: 1 }) });
  await c.fire("push", { data: data(null) });
  await c.fire("push", { data: data({ web_push: 8030, notification: { title: 42, body: { x: 1 }, navigate: 7 } }) });
  ok(c.calls.shown.length === 5 && c.calls.shown.every((x) => x.title === "开封府" && x.options.body === "" && x.options.data.target === SCOPE),
    "sw.js：寄来的东西读不懂、是空的、不是我们的写法：也显示一条“开封府”，点了回门口（苹果不许收了不出声）");

  const d = boot(SCOPE);
  for (const nav of ["https://evil.example/kaifengfu/#n=1", "https://valerie.example/other/", "https://valerie.example/kaifengfu-evil/", "javascript:alert(1)", "", "   ", "//evil.example/x"]) await d.fire("push", { data: data(notice(nav)) });
  await d.fire("push", { data: data(notice("dingxiang/#n=rel")) });
  ok(d.calls.shown.slice(0, 7).every((x) => x.options.data.target === SCOPE) && d.calls.shown[7].options.data.target === SCOPE + "dingxiang/#n=rel",
    "sw.js：别的网站、范围外的路径、怪写法，一律改成回门口；相对的写法按开封府自己的网址算");

  // 点通知：开封府开着
  const posted = [];
  let focused = 0;
  let closed = 0;
  const win = { url: SCOPE + "dingxiang/", postMessage: (m) => posted.push(m), focus: async () => { focused++; } };
  const stranger = { url: "https://valerie.example/other/", postMessage: () => posted.push("错了"), focus: async () => { focused += 100; } };
  const e = boot(SCOPE, [stranger, win]);
  await e.fire("notificationclick", { notification: { close: () => { closed++; }, data: { target: SCOPE + "dingxiang/#n=test-9" } } });
  ok(closed === 1 && posted.length === 1 && posted[0].type === "kfs-notice" && posted[0].target === SCOPE + "dingxiang/#n=test-9" && focused === 1 && e.calls.opened.length === 0 && e.calls.query.type === "window" && e.calls.query.includeUncontrolled === true,
    "sw.js 通知被点、开封府开着：收起通知，告诉开着的那个窗口是哪条，把它叫到前面；不另开窗口，也不理别的网页");
  const grumpy = { url: SCOPE, postMessage: () => { throw new Error("发不过去"); }, focus: async () => { throw new Error("叫不动"); } };
  const f = boot(SCOPE, [grumpy]);
  let threw = false;
  try {
    await f.fire("notificationclick", { notification: { close: () => {}, data: { target: SCOPE + "#n=1" } } });
  } catch (x) {
    threw = true;
  }
  ok(!threw && f.calls.opened.length === 0, "sw.js：窗口不理它、叫不到前面，也不出错");
  // 点通知：开封府没开着
  const g = boot(SCOPE, [stranger]);
  await g.fire("notificationclick", { notification: { close: () => {}, data: { target: SCOPE + "#n=test-3" } } });
  await g.fire("notificationclick", { notification: { close: () => {}, data: { target: "https://evil.example/" } } });
  await g.fire("notificationclick", { notification: { close: () => {}, data: null } });
  ok(g.calls.opened.join() === [SCOPE + "#n=test-3", SCOPE, SCOPE].join(), "sw.js 通知被点、开封府没开着：打开通知里写的网址；写的是别的网站、什么都没写，就打开门口");
  // 开封府部署在网站根上的时候（测试服务器就是这样）
  const h = boot("http://127.0.0.1:8080/");
  await h.fire("push", { data: data(notice("http://127.0.0.1:8080/dingxiang/#n=x")) });
  ok(h.calls.shown[0].options.data.target === "http://127.0.0.1:8080/dingxiang/#n=x", "sw.js：范围是网站根的时候也一样");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
