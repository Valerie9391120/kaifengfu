// 替她等回话的那条新路：
//   小后端这一头（supabase/push_function.ts 的 op: "reply"）：该拦的拦、等回话、封好放信箱、她不在才敲手机；
//   手机这一头（src/mail.js、src/thread.js、src/reply.js）：直接等、去信箱里等、走回老路、不花两回钱。
// 直接跑：node tests/mail.test.mjs
import crypto from "node:crypto";
import { mock } from "node:test";
import { loadPushFunction, loadBundle, pushEnv, createFakePush, createFakeSupabase, createFakeAnthropic, FAKE_SUPABASE, makeVapidKeys, b64u, unb64u } from "./push-harness.mjs";

let pass = 0, failN = 0;
// KFS_FAILFAST：故意改坏了看拦不拦得住的时候，头一条没过就收工
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); if (process.env.KFS_FAILFAST) process.exit(1); } };

// ---------- 时间 ----------
// 函数里的“等六秒再敲”“隔八秒摸一下”、手机这头的“隔两秒看一眼”，都靠假的钟一步一步拨，不真等。
// 真的那个定时器留一份：测试自己要让出手来（让加密、假的网络这些真的异步活儿做完）
const realTimeout = globalThis.setTimeout;
const breathe = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => realTimeout(r, 2)); };
const until = async (cond, ms = 4000) => {
  const t0 = performance.now();
  while (!(await cond())) {
    if (performance.now() - t0 > ms) return false;
    await new Promise((r) => realTimeout(r, 3));
  }
  return true;
};
const clock = {
  on() { mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: Date.now() }); },
  async tick(ms) { mock.timers.tick(ms); await breathe(); },
  off() { mock.timers.reset(); },
};

// ---------- 搭台 ----------
const background = []; // 函数交给运行环境“后台接着干”的活
globalThis.EdgeRuntime = { waitUntil: (p) => background.push(p) };

const supa = createFakeSupabase();
const push = createFakePush();
const claude = createFakeAnthropic();
push.install(supa, claude);
const fn = await loadPushFunction();
const mailjs = await loadBundle("src/mail.js");
const thread = await loadBundle("src/thread.js");
const replyjs = await loadBundle("src/reply.js");
const vaultjs = await loadBundle("src/vault.js");
const docsjs = await loadBundle("src/docs.js");
const namesjs = await loadBundle("src/names.js");
const richjs = await loadBundle("src/rich.js");
const notifyjs = await loadBundle("src/notify.js");

const vapid = makeVapidKeys();
const USER = { id: "11111111-1111-1111-1111-111111111111", email: "qing@example.com" };
const OTHER = { id: "22222222-2222-2222-2222-222222222222", email: "other@example.com" };
supa.tokens.set("tok", USER);
supa.tokens.set("tok-other", OTHER);
const ORIGIN = "https://valerie.example";
const PAGE = ORIGIN + "/kaifengfu/";
// 测试里的开封府住在 valerie.example：照“网页搬了家”的办法，在密钥柜里写上 ALLOWED_ORIGIN
const baseEnv = { SUPABASE_URL: FAKE_SUPABASE, SUPABASE_ANON_KEY: "sb_publishable_test", ALLOWED_EMAIL: USER.email, ALLOWED_ORIGIN: ORIGIN, ANTHROPIC_API_KEY: "sk-ant-test", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: "mailto:qing@example.com" };
Object.assign(pushEnv, baseEnv);

const GRACE = 6000, BEAT = 8000, GAP = 1000, LIFE = 150000, LAST_CALL = 12000;

async function call(body, { token = "tok", origin = ORIGIN } = {}) {
  const res = await fn.handler(
    new Request(FAKE_SUPABASE + "/functions/v1/push", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token, apikey: "sb_publishable_test", origin },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

// 一回传话寄给函数的那一包。KNOCK 是网页点名要敲的设备（门牌号）：addDevice 领的设备默认都点上名
let seq = 0;
let KNOCK = [];
function order(extra = {}) {
  const key = crypto.randomBytes(32);
  return {
    op: "reply",
    job: "job" + String(++seq).padStart(4, "0") + crypto.randomBytes(6).toString("hex"),
    key: b64u(key),
    note: "v1.bm90ZQ.c2VhbGVk",
    tag: "TAGtagTAG_-123456",
    title: "光义",
    beta: "",
    knock: KNOCK.slice(),
    request: { model: "claude-sonnet-4-6", max_tokens: 2048, system: "名帖", messages: [{ role: "user", content: [{ type: "text", text: "在吗" }] }] },
    ...extra,
  };
}
const mailRow = (job) => supa.mail.rows.get(USER.id + "|" + job) || null;
// 拿网页那头真的代码开信；打不开回 null（测试照样往下走，该挂的那一条会挂）
const openMail = async (key, sealed) => {
  try {
    return await mailjs.openSealed(key, sealed);
  } catch (e) {
    return null;
  }
};
const said = (text) => ({ status: 200, json: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } } });
const upstreamError = (status, type, message) => ({ status, json: { type: "error", error: { type, message } } });

function addDevice(mode = "ok", page = PAGE, updated = "2026-10-01T10:00:00.000Z") {
  const dev = push.addDevice(mode);
  KNOCK.push(dev.endpoint);
  supa.table.rows.set(USER.id + "|" + dev.endpoint, { user_id: USER.id, endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth, page, created_at: updated, updated_at: updated, last_at: null, last_status: null, last_note: null });
  return dev;
}
// 等一件事，最多等 ms 毫秒（真的钟）；等不到回 null。掐线那几条用：改坏了的话那一问永远不回，不能让整份测试跟着悬住
const within = (work, ms = 3000) => Promise.race([work, new Promise((r) => realTimeout(() => r(null), ms))]);
// 推送服务一共被敲过 n 下、每一下的结果也都记进登记簿了为止（假的钟不动，只等加密、假的网络这些真的异步活儿做完）。
// 用之前先 push.reset()、supa.seen.length = 0，两边才是从零数起
const ledgerWrites = () => supa.seen.filter((x) => x.method !== "GET" && x.path.startsWith("/rest/v1/push_subs")).length;
const knocked = async (n) => {
  const done = await until(() => push.log.length >= n && ledgerWrites() >= n);
  await breathe();
  return done;
};
// 后台的活做完为止，一步一步拨钟（一步 step 毫秒，最多 rounds 步）：横幅隔一秒敲一条，不拨钟它就一直歇着。
// 每拨一步，等这一步里敲的那一下做完（推送服务收了、登记簿记了）再拨下一步：这样“隔一秒一条”在假的钟上分毫不差。
// 这一步里什么都没敲的话白等四分之一秒（真的钟）。回做没做完
const drain = async (step = GAP, rounds = 60) => {
  let done = false;
  Promise.all(background).then(() => { done = true; });
  await breathe();
  for (let i = 0; i < rounds && !done; i++) {
    const n = push.log.length;
    await clock.tick(step);
    await until(() => done || (push.log.length > n && ledgerWrites() >= push.log.length), 250);
    await breathe();
  }
  return done;
};
// 送到的横幅上的字，照敲的先后（给了设备就只看那一台）
const bodies = (dev) => push.delivered.filter((d) => !dev || d.endpoint === dev.endpoint).map((d) => d.json.notification.body);
function resetWorld() {
  // 这份代码当它是刚被叫起来的（见 push_function.ts 的 worker）
  fn.worker.born = Date.now();
  fn.worker.closing = false;
  supa.mail.rows.clear();
  supa.mail.log.length = 0;
  Object.assign(supa.mail.state, { missing: false, down: false, failPatch: 0, cutPatch: 0 });
  supa.table.rows.clear();
  Object.assign(supa.table.state, { missing: false, failGet: 0 });
  supa.seen.length = 0;
  push.reset();
  KNOCK = [];
  claude.reset();
  background.length = 0;
  for (const k of Object.keys(pushEnv)) delete pushEnv[k];
  Object.assign(pushEnv, baseEnv);
}

// ================= 小后端：门口 =================
{
  resetWorld();
  const o = order();
  ok((await call(o, { token: "nobody" })).status === 401 && (await call(o, { token: "tok-other" })).status === 403 && claude.calls.length === 0 && supa.mail.rows.size === 0,
    "等回话·门口：没登录、不是卿卿，一样拦下，不问 Anthropic，信箱里不留东西");

  delete pushEnv.ANTHROPIC_API_KEY;
  const noKey = await call(order());
  ok(noKey.status === 500 && noKey.data.error.type === "kaifengfu" && noKey.data.error.code === "no_key" && supa.mail.rows.size === 0, "等回话·门口：密钥柜里没有 ANTHROPIC_API_KEY，不接（带着 no_key，网页看了走回老路）");
  pushEnv.ANTHROPIC_API_KEY = "sk-ant-test";

  const bad = [
    ["没有编号", order({ job: "" })],
    ["编号里有怪字", order({ job: "abc def/ghi" })],
    ["钥匙不是 32 个字节", order({ key: b64u(crypto.randomBytes(16)) })],
    ["钥匙不是 base64", order({ key: "***" })],
    ["没有条子", order({ note: "" })],
    ["条子太长", order({ note: "x".repeat(4001) })],
    ["对话的记号不对", order({ tag: "a b" })],
    ["没有要转的话", order({ request: null })],
    ["模型名不对", order({ request: { model: "gpt-4", max_tokens: 100, messages: [] } })],
    ["max_tokens 太大", order({ request: { model: "claude-sonnet-4-6", max_tokens: 99999, messages: [] } })],
    ["max_tokens 不是数", order({ request: { model: "claude-sonnet-4-6", max_tokens: "很多", messages: [] } })],
  ];
  const outs = [];
  for (const [, o2] of bad) outs.push(await call(o2));
  ok(outs.every((r) => r.status === 400 && r.data.error.type === "kaifengfu" && r.data.error.code === "bad_request") && claude.calls.length === 0 && supa.mail.rows.size === 0,
    `等回话·门口：寄来的东西不对（${bad.map((b) => b[0]).join("、")}），都不接，不问 Anthropic，信箱里不留东西`);

  // 信箱那张表还没建
  supa.mail.state.missing = true;
  const noBox = await call(order());
  ok(noBox.status === 400 && noBox.data.error.code === "no_mailbox" && noBox.data.error.message.includes("mailbox.sql") && claude.calls.length === 0, "等回话·门口：信箱那张表还没建，不接、不问 Anthropic（带着 no_mailbox，说清楚要跑哪段 SQL）");
  supa.mail.state.missing = false;

  // 库房出岔子
  supa.mail.state.down = true;
  const boxDown = await call(order());
  ok(boxDown.status === 502 && boxDown.data.error.code === "mailbox_error" && claude.calls.length === 0, "等回话·门口：信箱这会儿用不了，不接、不问 Anthropic");
  supa.mail.state.down = false;

  // 别的动作照旧只收短的；等回话这一种寄得长也收
  const longTest = await call(JSON.stringify({ op: "test", endpoint: "https://web.push.apple.com/x", pad: "x".repeat(5000) }));
  const big = order();
  big.request.messages[0].content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "A".repeat(200000) } });
  clock.on();
  const bigOut = await call(big);
  clock.off();
  ok(longTest.status === 413 && bigOut.status === 200 && bigOut.data.type === "reply" && claude.calls.length === 1 && claude.calls[0].body.messages[0].content[1].source.data.length === 200000,
    "等回话·门口：别的动作寄长了照旧拦；等回话的带着照片寄二十万字也收，原样转给 Anthropic");
}

// ================= 小后端：她就在跟前 =================
{
  resetWorld();
  const dev = addDevice();
  clock.on();
  const o = order({ beta: "mcp-client-2025-11-20" });
  claude.script.push(said("<thinking>想她了</thinking>\n在呢\n[SPLIT]\n怎么了"));
  const r = await call(o);
  const row = mailRow(o.job);
  const c = claude.calls[0];
  ok(r.status === 200 && r.data.type === "reply" && r.data.job === o.job && r.data.result.status === 200 && r.data.result.data.content[0].text.includes("在呢") && JSON.stringify(r.data.result.used) === JSON.stringify({ cache: false, mcp: false }),
    "等回话：回话直接交给还等着的网页，带着 Anthropic 回的那一整段、用的是哪种写法");
  ok(c.key === "sk-ant-test" && c.version === "2023-06-01" && c.beta === "mcp-client-2025-11-20" && JSON.stringify(c.body) === JSON.stringify(o.request),
    "等回话：问 Anthropic 用的是密钥柜里的 key，寄去的就是网页给的那一整段，beta 照带");
  ok(!!row && row.state === "done" && row.note === o.note && typeof row.sealed === "string" && row.sealed.startsWith("v1.") && row.done_at && background.length === 1,
    "等回话：同一条回话封好放进了信箱（条子原样存着），后台的活交给了运行环境看着");
  const opened = row && (await openMail(o.key, row.sealed));
  ok(!!opened && JSON.stringify(opened) === JSON.stringify(r.data.result), "等回话：信箱里那封，拿网页自己那把一次性钥匙打得开，和直接交来的一字不差（开信用的是网页那头真的代码）");
  const wrong = row && (await openMail(b64u(crypto.randomBytes(32)), row.sealed));
  const stored = JSON.stringify(row);
  ok(!wrong && !stored.includes(o.key) && !stored.includes("在呢") && !stored.includes("想她了") && !JSON.stringify(r.data).includes(o.key),
    "等回话：信箱里只有乱码：没有那把钥匙、没有他的话；换一把钥匙打不开；回给网页的东西里也不带钥匙");

  // 网页拿到回话，把信取走（删掉那一格）：过了那几秒，不敲手机
  supa.mail.rows.delete(USER.id + "|" + o.job);
  await clock.tick(GRACE + 1000);
  await Promise.all(background);
  ok(push.log.length === 0 && dev.hits === 0, "等回话：她就在开封府里（信被取走了），不敲手机");
  clock.off();
}

// ================= 小后端：她不在 =================
{
  resetWorld();
  const a = addDevice("ok", PAGE, "2026-10-01T10:00:00.000Z");
  const b = addDevice("ok", PAGE + "dingxiang/", "2026-10-02T10:00:00.000Z");
  // 登记簿里还有一行：别人（偷到登录密码、没有暗号的人）添进去的设备。网页没点它的名
  const spy = addDevice("ok", PAGE, "2026-10-03T10:00:00.000Z");
  KNOCK = [a.endpoint, b.endpoint, "https://web.push.apple.com/not-in-the-ledger"];
  supa.seen.length = 0;
  clock.on();
  const o = order({ title: "  小狐\n狸  " });
  claude.script.push(said("<thinking>她肯定睡了</thinking>\n在呢\n[SPLIT]\n*摸摸头* 早点睡\n[MEME:fox_reading_book.jpg]\n[NAME:小狐狸]"));
  const r = await call(o);
  await clock.tick(GRACE - 100);
  const early = push.log.length;
  await clock.tick(200);
  // 他这一回是三个气泡（两句话、一张表情包）：敲三条。头一条先到
  await knocked(2);
  const first = push.delivered.slice();
  const n0 = first[0] && first[0].json && first[0].json.notification;
  ok(r.status === 200 && early === 0 && first.length === 2 && first.map((d) => d.endpoint).sort().join() === [a.endpoint, b.endpoint].sort().join(), "她不在：等够那几秒、信还在信箱里，才敲；网页点了名的两台设备都敲到");
  ok(!!n0 && first[0].json.web_push === 8030 && first.every((d) => d.json.notification.title === "小狐 狸" && d.json.notification.body === "在呢"),
    `她不在：头一条横幅上是他的名字和他的头一句话，心里话不写（${JSON.stringify(n0 && n0.body)}）`);
  // 隔一秒敲下一条：差两百毫秒的时候还没敲
  await clock.tick(GAP - 200);
  await breathe();
  const beforeSecond = push.delivered.length;
  await clock.tick(200);
  await knocked(4);
  const afterSecond = push.delivered.length;
  await clock.tick(GAP - 200);
  await breathe();
  const beforeThird = push.delivered.length;
  await clock.tick(200);
  await knocked(6);
  const finished = await drain(50, 4);
  const got = push.delivered;
  ok(beforeSecond === 2 && afterSecond === 4 && beforeThird === 4 && got.length === 6 && finished, `一个气泡一条：隔一秒敲下一条，不早不晚；三个气泡敲完三条就收工（${[beforeSecond, afterSecond, beforeThird, got.length].join("、")}）`);
  ok(bodies(a).join("|") === "在呢|摸摸头 早点睡|[表情包]" && bodies(b).join("|") === bodies(a).join("|") && got.every((d) => d.json.notification.title === "小狐 狸"),
    `一个气泡一条：两台设备各收到三条，照他说的先后；星号去掉，表情包单独一条写成 [表情包]，改名字的记号不写（${JSON.stringify(bodies(a))}）`);
  const marks = got.filter((d) => d.endpoint === a.endpoint).map((d) => notifyjs.parseBannerTag(d.json.notification.tag));
  ok(marks.every((m, i) => !!m && m.chat === o.tag && m.job === o.job && m.nth === i) && new Set(got.filter((d) => d.endpoint === a.endpoint).map((d) => d.json.notification.tag)).size === 3 && got.filter((d) => d.endpoint === a.endpoint)[1].json.notification.tag === `r.${o.tag}.${o.job}.1`,
    "一个气泡一条：每条横幅自己带一个记号（哪段对话、哪一回、第几条），条条不一样（一样的话后一条会把前一条顶掉）；网页那头读得出来");
  ok(spy.hits === 0 && push.log.every((x) => x.endpoint !== spy.endpoint) && push.log.length === 6 && supa.table.rows.get(USER.id + "|" + spy.endpoint).last_at === null,
    "她不在：登记簿里没被点名的那一行不敲（往登记簿里添一行，收不到他说的话）；点了名、登记簿里却没有的门牌号也不去敲");
  const navs = Array.from(new Set(got.map((d) => d.json.notification.navigate))).sort();
  ok(navs.length === 2 && navs[0] === `${PAGE}#n=r.${o.tag}.${o.job}` && navs[1] === `${PAGE}dingxiang/#n=r.${o.tag}.${o.job}`, "她不在：哪一条点了都回到各自的入口，网址带着“哪段对话”的记号");
  ok(got.every((d) => d.ttl === String(12 * 3600) && d.urgency === "high"), "她不在：手机不在线的话，推送服务替我们留十二个小时");
  const rows = supa.table.all().filter((x) => x.endpoint !== spy.endpoint);
  ok(rows.length === 2 && rows.every((x) => x.last_status === 201 && x.last_at), "她不在：发得怎么样记在登记簿里（面板的“看细节”查得到）");
  ok(mailRow(o.job) && mailRow(o.job).state === "done", "她不在：信还在信箱里，等她回来取");
  const parsed = mailjs.parseReplyMark(new URL(navs[0]).hash.slice(3));
  ok(!!parsed && parsed.tag === o.tag && parsed.job === o.job, "她不在：网页那头读得出通知网址里的记号（哪段对话、哪一回）");

  // 网页一台都没点名（这台设备没开通知）：不敲，信照样在信箱里
  push.reset();
  const o2 = order({ knock: [] });
  await call(o2);
  await clock.tick(GRACE + 200);
  await Promise.all(background);
  ok(push.log.length === 0 && mailRow(o2.job).state === "done", "网页一台设备都没点名：不敲（登记簿里有几行都不敲），信照样在信箱里");
  // 点名点得不像话：不是字符串、太长、太多，都不理
  const o3 = order({ knock: [null, 42, { endpoint: a.endpoint }, "x".repeat(2000), ...Array(20).fill("https://web.push.apple.com/zzz")] });
  const r3 = await call(o3);
  await clock.tick(GRACE + 200);
  await Promise.all(background);
  ok(r3.status === 200 && push.log.length === 0, "点名点得不像话（不是字、太长、太多）：照常回话，不敲、不出错");
  // 点了七台：只查、只敲前五台
  push.reset();
  const seven = [];
  for (let i = 0; i < 7; i++) seven.push(addDevice("ok", PAGE, "2026-10-04T10:00:0" + i + ".000Z"));
  supa.seen.length = 0;
  const o4 = order({ knock: seven.map((d) => d.endpoint) });
  await call(o4);
  await clock.tick(GRACE + 200);
  await Promise.all(background);
  const lookups = supa.seen.filter((x) => x.method === "GET" && x.path.startsWith("/rest/v1/push_subs"));
  ok(lookups.length === 5 && push.delivered.length === 5 && seven.slice(5).every((d) => d.hits === 0), "点名点了七台：只去登记簿里查前五台、只敲这五台");
  // 门牌号长得不像话（一千多个字）：登记簿里就算真有这一行，也不去查、不去敲
  push.reset();
  const longEnd = "https://web.push.apple.com/" + "x".repeat(1100);
  const lent = push.addDevice();
  supa.table.rows.set(USER.id + "|" + longEnd, { user_id: USER.id, endpoint: longEnd, p256dh: lent.p256dh, auth: lent.auth, page: PAGE, created_at: "2026-10-05T10:00:00.000Z", updated_at: "2026-10-05T10:00:00.000Z", last_at: null, last_status: null, last_note: null });
  supa.seen.length = 0;
  await call(order({ knock: [longEnd] }));
  await clock.tick(GRACE + 200);
  await Promise.all(background);
  ok(push.log.length === 0 && supa.seen.filter((x) => x.path.startsWith("/rest/v1/push_subs")).length === 0, "点名的门牌号长得不像话：登记簿里真有这一行也不查、不敲");

  // 偷到登录密码的人：把她那一行的回程网址改成自己的站，再叫小后端等一回话、点她那台设备的名，来处也冒成那个站。
  // 密钥柜里没写 ALLOWED_ORIGIN（她的就是这样）：只认开封府现在住的那个地址，不发
  push.reset();
  delete pushEnv.ALLOWED_ORIGIN;
  const victim = addDevice("ok", "https://evil.example/kaifengfu/");
  const o5 = order({ knock: [victim.endpoint], title: "光义" });
  const r5 = await call(o5, { origin: "https://evil.example" });
  await clock.tick(GRACE + 200);
  await Promise.all(background);
  ok(r5.status === 200 && victim.hits === 0 && push.delivered.length === 0 && supa.table.rows.get(USER.id + "|" + victim.endpoint).last_note === "BadPage",
    "回程网址被人改成别处、来处也冒成那个站：回话照办，横幅不发（点了通知带不到假的开封府去）");
  // 她自己的设备（登记的是开封府现在住的地址）：照敲，不管这一回敲门的人报的来处是什么
  const hers = addDevice("ok", "https://valerie9391120.github.io/kaifengfu/dingxiang/");
  const o6 = order({ knock: [hers.endpoint] });
  await call(o6, { origin: "https://valerie9391120.github.io" });
  await clock.tick(GRACE + 200);
  await Promise.all(background);
  const n6 = push.delivered.find((d) => d.endpoint === hers.endpoint);
  ok(!!n6 && n6.json.notification.navigate === `https://valerie9391120.github.io/kaifengfu/dingxiang/#n=r.${o6.tag}.${o6.job}`, "密钥柜里没写 ALLOWED_ORIGIN：登记的是开封府现在住的那个地址，照敲，点了回到那个入口");
  Object.assign(pushEnv, baseEnv);
  clock.off();
}

// ================= 小后端：横幅一个气泡敲一条 =================
{
  resetWorld();
  const five = "一\n[SPLIT]\n二\n[SPLIT]\n三\n[SPLIT]\n四\n[SPLIT]\n五";
  // 每一段从头来：推送服务、登记簿、点名都清空，这份代码当它是刚被叫起来的
  const fresh = () => {
    push.reset();
    supa.seen.length = 0;
    supa.table.rows.clear();
    KNOCK = [];
    background.length = 0;
    claude.script.length = 0;
    fn.worker.born = Date.now();
    fn.worker.closing = false;
  };
  // 一回传话：他照 text 回，等到头一条横幅敲完。回这一包
  const away = async (text, extra = {}) => {
    claude.script.push(said(text));
    const o = order(extra);
    await call(o);
    await clock.tick(GRACE);
    await knocked(KNOCK.length);
    return o;
  };
  clock.on();

  // 她回来了（网页把信取走了）：剩下的不敲
  fresh();
  const dev = addDevice();
  const o = await away(five);
  await clock.tick(GAP);
  await knocked(2);
  supa.mail.rows.delete(USER.id + "|" + o.job);
  await clock.tick(GAP);
  const done1 = await drain(50, 4);
  ok(bodies().join("|") === "一|二" && push.log.length === 2 && done1, `她回来了：敲到第二条的时候信被取走了，剩下三条不敲，这一回收工（${bodies().join("、")}）`);
  // 头一条刚敲完她就回来了：只有那一条
  fresh();
  addDevice();
  const o1 = await away(five);
  supa.mail.rows.delete(USER.id + "|" + o1.job);
  await clock.tick(GAP);
  const done2 = await drain(50, 4);
  ok(bodies().join("|") === "一" && done2, "她回来了：每敲下一条之前都看一眼信还在不在（头一条刚敲完信就被取走：只有那一条）");
  // 敲下一条之前问不到信还在不在（库房一时没应）：照敲（宁可多敲一下，不能因为问不到就不敲）
  fresh();
  addDevice();
  await away(five);
  supa.mail.state.down = true;
  const done3 = await drain();
  supa.mail.state.down = false;
  ok(bodies().join("|") === "一|二|三|四|五" && done3, "敲下一条之前问不到信还在不在（库房一时没应）：照敲，五条都到");

  // 敲的时候有一台的门牌号作废了：划掉，后面几条不再敲它；别的照敲
  fresh();
  const gone = addDevice("gone");
  const fine = addDevice("ok");
  await away("一\n[SPLIT]\n二\n[SPLIT]\n三");
  const done4 = await drain();
  ok(gone.hits === 1 && bodies(fine).join("|") === "一|二|三" && !supa.table.rows.has(USER.id + "|" + gone.endpoint) && done4, "有一台设备的门牌号作废了：敲头一条的时候划掉，后面两条不再敲它；另一台三条照到");
  // 点名的设备都作废了：没有可敲的了，当场收工，不空等
  fresh();
  const dead = addDevice("gone");
  await away(five);
  const done5 = await drain(50, 3);
  ok(dead.hits === 1 && done5 && push.log.length === 1, "点了名的设备门牌号都作废了：敲完头一条就收工，不对着空门牌号接着等、接着敲");

  // 不设上限：他一口气说了四十句，就敲四十条，一秒一条
  fresh();
  addDevice();
  const many = Array.from({ length: 40 }, (_, i) => "第" + (i + 1) + "句");
  const t0 = Date.now();
  await away(many.join("\n[SPLIT]\n"));
  const done6 = await drain();
  const ats = push.delivered.map((d) => d.at - t0);
  ok(bodies().join("|") === many.join("|") && done6 && ats[0] === GRACE && ats.every((t, i) => t === GRACE + i * GAP), `不设上限：四十个气泡敲四十条，照先后，一秒一条（头一条在交出去 ${ats[0]} 毫秒以后，最后一条在 ${ats[ats.length - 1]} 毫秒）`);

  // 一条横幅最多三百个字：一个气泡再长也只截它自己，不占别的气泡的地方
  fresh();
  addDevice();
  await away("长".repeat(800) + "\n[SPLIT]\n短的");
  await drain();
  const [long0, short1] = bodies();
  ok(bodies().length === 2 && Array.from(long0).length === 300 && long0.endsWith("…") && short1 === "短的", "一条横幅最多三百个字：长的那个气泡截到三百、结尾加省略号，下一个气泡照旧另敲一条");

  // 横幅上摆的是气泡里摆出来的字：标题行的井号、围着字的星号不带，没当记号的照留
  fresh();
  addDevice();
  await away("# 今日安排\n\n**先**吃饭，*再*散步\n[SPLIT]\n## 小标题 ##\n正文 * 零散的星号、#标签");
  await drain();
  ok(bodies().join("|") === "今日安排\n先吃饭，再散步|小标题\n正文 * 零散的星号、#标签", `横幅上是平常的字：标题行开头的井号、围着字的星号不带，紧挨着标题的空行不要；零散的星号、#标签照留（${JSON.stringify(bodies())}）`);

  // ---- 保险：这份代码这一趟快到点了，剩下的并成一条 ----
  // 运行环境打了招呼（快要把这一趟收掉了）：下一条起，剩下的并成一条敲出去
  fresh();
  addDevice();
  const oc = await away(five);
  await clock.tick(GAP);
  await knocked(2);
  fn.worker.closing = true;
  await clock.tick(GAP);
  await knocked(3);
  const done7 = await drain(50, 4);
  const tags7 = push.delivered.map((d) => d.json.notification.tag);
  ok(bodies().join("|") === "一|二|三\n四\n五" && done7 && tags7.join() === [0, 1, 2].map((i) => `r.${oc.tag}.${oc.job}.${i}`).join(), `保险：运行环境说快要收了，剩下三个气泡并成一条敲出去（一条一行），不丢；敲完收工（${JSON.stringify(bodies())}）`);
  // 头一条还没敲就打了招呼：整回并成一条
  fresh();
  addDevice();
  fn.worker.closing = true;
  await away(five);
  const done8 = await drain(50, 4);
  ok(bodies().join("|") === "一\n二\n三\n四\n五" && done8, "保险：头一条还没敲就说要收了：整回并成一条");
  // 并成的那一条也只写三百个字
  fresh();
  addDevice();
  fn.worker.closing = true;
  await away(Array.from({ length: 6 }, (_, i) => String(i) + "很长".repeat(40)).join("\n[SPLIT]\n"));
  await drain(50, 4);
  ok(bodies().length === 1 && Array.from(bodies()[0]).length === 300 && bodies()[0].endsWith("…") && bodies()[0].startsWith("0很长"), "保险：并成的那一条超过三百个字照截");
  // 只有一个气泡：打没打招呼都一样，就是那一条
  fresh();
  addDevice();
  fn.worker.closing = true;
  await away("只有一句");
  const done9 = await drain(50, 4);
  ok(bodies().join("|") === "只有一句" && done9, "保险：只有一个气泡，没什么可并的，照常敲那一条");

  // 没打招呼也一样防着：从这份代码被叫起来算，过了 LIFE - LAST_CALL（138 秒）就并。
  // 这一回敲门的时候它已经活了 70 秒，他又回得慢（60 秒）：头一条横幅在 136 秒敲，138 秒那一条还单敲，139 秒起并
  const held = async (age, hold, text = five) => {
    fresh();
    addDevice();
    fn.worker.born = Date.now() - age;
    let release;
    const gate = new Promise((r) => (release = r));
    claude.script.push({ wait: gate, ...said(text) });
    const before = claude.calls.length;
    const pending = call(order());
    await until(() => claude.calls.length === before + 1);
    await clock.tick(hold);
    release();
    await pending;
    await clock.tick(GRACE);
    await knocked(1);
    return await drain(GAP, 20);
  };
  const doneA = await held(70000, 60000);
  ok(doneA && bodies().join("|") === "一|二|三|四\n五", `保险：敲门的时候这份代码已经活了 70 秒、他回了 60 秒：136、137、138 秒那三条单敲，过了 138 秒剩下的并成一条（${JSON.stringify(bodies())}）`);
  // 敲门的时候它已经活过了半辈子（75 秒）：照免费档的寿数，这时候不该还接新的敲门，可见不是那一档。改从这一回敲门算
  const doneB = await held(LIFE / 2, 60000);
  const fromKnock = bodies().join("|");
  const doneC = await held(LIFE / 2 - 1, 60000);
  const fromBirth = bodies().join("|");
  ok(doneB && doneC && fromKnock === "一|二|三|四|五" && fromBirth === "一\n二\n三\n四\n五", `保险：差一毫秒到半辈子的，从被叫起来那一刻算（头一条在 141 秒，整回并成一条）；正好半辈子的，从这一回敲门算（66 秒起敲，五条单敲）（${JSON.stringify([fromBirth, fromKnock])}）`);
  const doneD = await held(135000, 0);
  ok(doneD && bodies().join("|") === "一|二|三|四|五", "保险：敲门的时候它已经活了 135 秒（不是免费档的寿数）：从这一回敲门算，五条照常单敲，不会一上来就并");
  // 从敲门算的那种，也是过了 138 秒就并。他回了 124 秒（再久这头就不等了），十二个气泡：130 秒到 138 秒那九条单敲，剩下三条并成一条
  const twelve = Array.from({ length: 12 }, (_, i) => "句" + (i + 1));
  const doneE = await held(LIFE / 2, LIFE - LAST_CALL - GRACE - 8 * GAP, twelve.join("\n[SPLIT]\n"));
  ok(doneE && bodies().join("|") === twelve.slice(0, 9).join("|") + "|" + twelve.slice(9).join("\n"), `保险：从这一回敲门算的，也是过了 138 秒剩下的并成一条（${JSON.stringify(bodies())}）`);
  clock.off();
  void dev;
}

// ================= 小后端：她按了停，把跟 Anthropic 的线掐掉 =================
{
  resetWorld();
  addDevice();
  clock.on();
  // 带缓存记号、带工具的一整段：没问成的话本来还有两种写法可换、还能原样再问一回
  const rich = {
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [{ type: "text", text: "名帖", cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [{ role: "user", content: [{ type: "text", text: "在吗" }] }],
    mcp_servers: [{ type: "url", url: "https://mcp.example/sse", name: "s0_notes", authorization_token: "tok" }],
    tools: [{ type: "mcp_toolset", mcp_server_name: "s0_notes" }],
  };
  const sealedPatches = () => supa.mail.log.filter((x) => x.method === "PATCH" && x.sets.includes("sealed")).length;
  const beatPatches = () => supa.mail.log.filter((x) => x.method === "PATCH" && !x.sets.includes("sealed"));

  // 还在等的工夫里，信箱里那一格没了（她按了停，网页把它收了）：下一回摸的时候发现，掐线
  claude.script.push({ hang: true }, said("不该问到这一回"), said("不该问到这一回"), said("不该问到这一回"));
  const o = order({ request: rich, beta: "mcp-client-2025-11-20" });
  const pending = call(o);
  await until(() => claude.calls.length === 1);
  await clock.tick(BEAT);
  await breathe();
  const stillAsking = !claude.calls[0].cut && mailRow(o.job).state === "working";
  supa.mail.rows.delete(USER.id + "|" + o.job);
  await clock.tick(BEAT - 100);
  await breathe();
  const notYet = !claude.calls[0].cut;
  await clock.tick(100);
  const r = await within(pending);
  ok(stillAsking && notYet && !!r && claude.calls[0].cut === true, "按了停：那一格还在的时候照常等；它没了，下一回摸（最多八秒以后）就发现，把跟 Anthropic 的线掐掉");
  ok(!!r && r.status === 200 && r.data.result.status === 499 && mailjs.resultOk(r.data.result) === false && mailjs.explainResult(r.data.result) === "这一回停掉了，没有回话" && claude.calls.length === 1,
    "按了停：这一回到此为止。不原样再问、不换写法再问（Anthropic 只问了那一回）；万一还有网页等着，交给它的是一句“停掉了”，不是回话");
  const beatsAtStop = beatPatches().length;
  await clock.tick(GRACE + BEAT * 3);
  const done = await within(Promise.all(background));
  ok(!!done && sealedPatches() === 0 && !mailRow(o.job) && push.log.length === 0 && beatPatches().length === beatsAtStop, "按了停：不往信箱里放东西、不敲手机，也不再去摸那一格");
  ok(beatPatches().length === 2 && beatPatches().every((x) => /return=representation/.test(x.prefer) && x.query.includes("select=job") && x.query.includes("state=eq.working")),
    "摸一下的时候顺带问“改到了哪几行”（Prefer: return=representation）：一行都没改到，就是那一格没了");
  claude.script.length = 0;

  // 摸的那一下库房没应（问不成）：不算“没了”，不掐；接着等，回话照常到
  let release;
  const gate = new Promise((res) => (release = res));
  claude.script.push({ wait: gate, ...said("等到了") });
  const before2 = claude.calls.length;
  const o2 = order();
  const pending2 = call(o2);
  await until(() => claude.calls.length === before2 + 1);
  supa.mail.state.failPatch = 1;
  await clock.tick(BEAT);
  await breathe();
  const blind = !claude.calls[before2].cut;
  release();
  const r2 = await within(pending2);
  ok(blind && !!r2 && r2.data.result.status === 200 && r2.data.result.data.content[0].text === "等到了" && mailRow(o2.job).state === "done", "摸的那一下库房没应（不知道那一格还在不在）：不掐线，回话照常到、照常放进信箱");
  // 摸的那一下根本没连上库房：一样，不掐
  let release2b;
  const gate2b = new Promise((res) => (release2b = res));
  claude.script.push({ wait: gate2b, ...said("也等到了") });
  const before2b = claude.calls.length;
  const pending2b = call(order({ knock: [] }));
  await until(() => claude.calls.length === before2b + 1);
  supa.mail.state.cutPatch = 1;
  await clock.tick(BEAT);
  await breathe();
  const deaf = !claude.calls[before2b].cut && supa.mail.state.cutPatch === 0;
  release2b();
  const r2b = await within(pending2b);
  ok(deaf && !!r2b && r2b.data.result.status === 200 && r2b.data.result.data.content[0].text === "也等到了", "摸的那一下根本没连上库房：也不掐线，回话照常到");
  await clock.tick(GRACE);
  await knocked(1);
  await drain(50, 4);

  // Anthropic 一时太挤、正歇着要原样再问的那一秒半里发现她停了：不再问
  push.reset();
  supa.seen.length = 0;
  const sealed3 = sealedPatches();
  let release3;
  const gate3 = new Promise((res) => (release3 = res));
  claude.script.push({ wait: gate3, ...upstreamError(529, "overloaded_error", "Overloaded") }, said("不该问到这一回"));
  const before3 = claude.calls.length;
  const o3 = order();
  const pending3 = call(o3);
  await until(() => claude.calls.length === before3 + 1);
  supa.mail.rows.delete(USER.id + "|" + o3.job);
  await clock.tick(BEAT - 100);
  release3();
  await breathe();
  await clock.tick(100); // 摸：那一格没了。这时候没有哪一问正连着，线是拉给“歇完别再问”看的
  await breathe();
  await clock.tick(1500);
  const r3 = await within(pending3);
  ok(!!r3 && r3.data.result.status === 499 && claude.calls.length === before3 + 1, "按了停：正歇着要原样再问的工夫里发现她停了，歇完不再问");
  await clock.tick(GRACE + 100);
  await within(Promise.all(background));
  ok(push.log.length === 0 && sealedPatches() === sealed3, "按了停（歇着的时候发现的）：一样不放信、不敲手机");

  // 问之前那根线就已经拉了的（眼下的走法里碰不上，这个零件自己得站得住）：当场不问，照“停了”交回去
  {
    const dead = new AbortController();
    dead.abort();
    claude.script.length = 0;
    claude.script.push({ hang: true });
    const before5 = claude.calls.length;
    const r5 = await within(fn.askOnce(rich, "", "sk-ant-test", 60000, dead.signal), 1500);
    const r6 = await within(fn.askUpstream(rich, "mcp-client-2025-11-20", "sk-ant-test", Date.now() + 60000, dead.signal), 1500);
    ok(!!r5 && r5.status === 499 && !!r6 && r6.status === 499 && claude.calls.length === before5, "问之前那根线就已经拉了：当场照“停了”交回去，门都不敲（有三种写法可换的也一种都不问）");
    claude.script.length = 0;
  }

  // 回话到手以后那一格没了，是她把信取走了，不是停：交出去的照旧是回话（上面“她就在跟前”那一段验的是不敲手机）
  push.reset();
  supa.mail.state.failPatch = 2;
  const o4 = order();
  const r4 = await call(o4);
  supa.mail.rows.delete(USER.id + "|" + o4.job);
  await clock.tick(BEAT);
  await clock.tick(GRACE);
  const done4 = await within(Promise.all(background));
  ok(r4.data.result.status === 200 && !!done4 && push.log.length === 0, "回话到手以后那一格才没的（她把信取走了）：不是停，交给网页的照旧是他的回话");
  clock.off();
}

// 运行环境打招呼的那一下接上了没有：重新装一份函数，装的时候给它一个假的“听招呼”的口子
{
  const heard = {};
  globalThis.addEventListener = (type, listener) => { heard[type] = listener; };
  const fn2 = await loadPushFunction();
  delete globalThis.addEventListener;
  const say = (detail) => {
    fn2.worker.closing = false;
    if (heard.beforeunload) heard.beforeunload(detail === undefined ? {} : { detail });
    return fn2.worker.closing;
  };
  const before = fn2.worker.closing;
  const real = ["wall_clock", "cpu", "memory", "termination"].map((why) => say({ reason: why }));
  ok(typeof heard.beforeunload === "function" && before === false && real.every((x) => x === true) && fn.worker.closing === false && Math.abs(fn2.worker.born - Date.now()) < 5000,
    "保险：运行环境说“快要收了”（寿数、算力、内存快用完，要撤下去）的时候记一笔；这份代码被叫起来的那一刻也记着");
  ok(say({ reason: "early_drop" }) === false && say("early_drop") === false && say("wall_clock") === true && say(undefined) === true && say({ reason: "没见过的缘故" }) === true && say({}) === true,
    "保险：活都做完了才来收的那种招呼（early_drop）不算；缘故直接写在招呼上的也认；没带缘故、带着不认识的缘故的，当它是快要收了");
}

// ================= 小后端：没回成 =================
{
  resetWorld();
  const dev = addDevice();
  clock.on();
  // key 不对：照实交回去，不再换写法问
  const o = order();
  claude.script.push(upstreamError(401, "authentication_error", "invalid x-api-key"));
  const r = await call(o);
  ok(r.status === 200 && r.data.result.status === 401 && r.data.result.data.error.type === "authentication_error" && claude.calls.length === 1,
    "没回成：Anthropic 说 key 不对，照实交给网页（网页那头翻成人话），不多问");
  const opened = await openMail(o.key, mailRow(o.job).sealed);
  ok(!!opened && opened.status === 401 && mailjs.resultOk(opened) === false && mailjs.explainResult(opened).includes("key 不对"), "没回成：信箱里封的也是这句报错，网页取出来说得成人话");
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  const n = push.delivered[0] && push.delivered[0].json.notification;
  ok(push.delivered.length === 1 && n.title === "开封府" && n.body === "这条消息没送到。回开封府点一下重发。" && !JSON.stringify(push.delivered[0].json).includes("x-api-key"),
    "没回成、她又不在：敲一下，照实说没送到；报错的细节不往横幅上写");

  // 说得太快：也不多问
  claude.script.push(upstreamError(429, "rate_limit_error", "slow down"));
  const calls0 = claude.calls.length;
  const r2 = await call(order());
  ok(r2.data.result.status === 429 && claude.calls.length === calls0 + 1, "没回成：Anthropic 让歇一会儿（429），不接着问");

  // Anthropic 一时出岔子：只有一种写法的时候，原样再问一回
  claude.script.push(upstreamError(529, "overloaded_error", "Overloaded"), said("好了"));
  const calls1 = claude.calls.length;
  const slow = call(order());
  await until(() => claude.calls.length === calls1 + 1);
  await breathe();
  const waiting = claude.calls.length;
  await clock.tick(1500);
  const r3 = await slow;
  ok(waiting === calls1 + 1 && claude.calls.length === calls1 + 2 && r3.data.result.status === 200 && r3.data.result.data.content[0].text === "好了",
    "没回成：Anthropic 一时太挤（529），歇一秒半原样再问一回，问成了");

  // 一直太挤：问两回就交回去
  claude.script.push(upstreamError(529, "overloaded_error", "Overloaded"), upstreamError(529, "overloaded_error", "Overloaded"), said("不该问到这一回"));
  const calls2 = claude.calls.length;
  const slow2 = call(order());
  await until(() => claude.calls.length === calls2 + 1);
  await clock.tick(1500);
  const r4 = await slow2;
  ok(r4.data.result.status === 529 && claude.calls.length === calls2 + 2, "没回成：再问还是太挤，就把这句报错交回去，不没完没了地问");
  claude.script.length = 0;

  // 寄去的东西它不认（400）：只有一种写法，不重问
  claude.script.push(upstreamError(400, "invalid_request_error", "messages: bad"));
  const calls3 = claude.calls.length;
  const r5 = await call(order());
  ok(r5.data.result.status === 400 && claude.calls.length === calls3 + 1, "没回成：只有一种写法、Anthropic 说写得不对（400），原样再问没用，不重问");

  // 连不上、回来的不是 JSON
  claude.script.push({ fail: "connection refused" }, { fail: "connection refused" });
  const dead = call(order());
  await until(() => claude.calls.length === calls3 + 2);
  await clock.tick(1500);
  const r6 = await dead;
  ok(r6.data.result.status === 502 && r6.data.result.data.error.type === "kaifengfu" && r6.data.result.data.error.message === "连不上 Anthropic", "没回成：连不上 Anthropic，说成一句人话交回去");
  claude.script.push({ status: 200, text: "<html>gateway</html>" }, { status: 200, text: "<html>gateway</html>" });
  const junk = call(order());
  await until(() => claude.calls.length === calls3 + 4);
  await clock.tick(1500);
  const r7 = await junk;
  ok(r7.data.result.status === 502 && mailjs.resultOk(r7.data.result) === false, "没回成：回来的不是 JSON，也算没回成");
  // 状态码不是 2xx、回来的东西又不像报错：也算没回成，横幅不拿它当他的话
  claude.script.push({ status: 503, json: { message: "upstream connect error" } }, { status: 503, json: { message: "upstream connect error" } });
  push.reset();
  const dev8 = addDevice();
  const calls8 = claude.calls.length;
  const o8 = order();
  const odd = call(o8);
  await until(() => claude.calls.length === calls8 + 1);
  await clock.tick(1500);
  const r8 = await odd;
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  const n8 = push.delivered.find((d) => d.endpoint === dev8.endpoint && d.json.notification.navigate.endsWith(o8.job));
  ok(r8.data.result.status === 503 && fn.fine(r8.data.result) === false && mailjs.resultOk(r8.data.result) === false && !!n8 && n8.json.notification.title === "开封府" && n8.json.notification.body.includes("没送到"),
    "没回成：状态码是 503、回来的东西又不像报错：两头都认它没回成，横幅照实说没送到");
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  clock.off();
  void dev;
}

// ================= 小后端：换写法 =================
{
  resetWorld();
  clock.on();
  const rich = {
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [{ type: "text", text: "名帖", cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [
      { role: "user", content: [{ type: "text", text: "早" }] },
      { role: "assistant", content: [{ type: "text", text: "早" }] },
      { role: "user", content: [{ type: "text", text: "在吗", cache_control: { type: "ephemeral" } }, { type: "text", text: "【此刻】" }] },
    ],
    mcp_servers: [{ type: "url", url: "https://mcp.example/sse", name: "s0_notes", authorization_token: "tok" }],
    tools: [{ type: "mcp_toolset", mcp_server_name: "s0_notes" }],
  };
  const o = order({ request: rich, beta: "mcp-client-2025-11-20" });
  claude.script.push(upstreamError(400, "invalid_request_error", "cache_control: ttl not supported"), upstreamError(400, "invalid_request_error", "mcp_servers.0: failed to connect"), said("不用工具也行"));
  const r = await call(o);
  const [c1, c2, c3] = claude.calls;
  const noCache = JSON.parse(JSON.stringify(rich));
  delete noCache.system[0].cache_control;
  delete noCache.messages[2].content[0].cache_control;
  const bare = JSON.parse(JSON.stringify(noCache));
  delete bare.mcp_servers;
  delete bare.tools;
  ok(claude.calls.length === 3 && JSON.stringify(c1.body) === JSON.stringify(rich) && JSON.stringify(c2.body) === JSON.stringify(noCache) && JSON.stringify(c3.body) === JSON.stringify(bare),
    "换写法：带缓存、带工具的不通，这头自己换：先摘缓存记号，再摘工具，和网页走老路的三步一样");
  ok(c1.beta === "mcp-client-2025-11-20" && c2.beta === "mcp-client-2025-11-20" && c3.beta === "" && r.data.result.status === 200 && JSON.stringify(r.data.result.used) === JSON.stringify({ cache: false, mcp: false }),
    "换写法：摘了工具就不带 beta；最后用的是哪种写法告诉网页（它好写“这次MCP没连上”）");
  ok(JSON.stringify(rich.system[0].cache_control) === JSON.stringify({ type: "ephemeral", ttl: "1h" }) && fn.hasCache(rich) && fn.hasMcp(rich) && !fn.hasCache(noCache) && !fn.hasMcp(bare),
    "换写法：摘记号不动原来那一份");

  // 第二种就通了：停在第二种
  claude.script.push(upstreamError(400, "invalid_request_error", "cache_control"), said("第二种"));
  const before = claude.calls.length;
  const r2 = await call(order({ request: rich, beta: "mcp-client-2025-11-20" }));
  ok(claude.calls.length === before + 2 && JSON.stringify(r2.data.result.used) === JSON.stringify({ cache: false, mcp: true }), "换写法：不带缓存就通了，停在这一种（工具还带着）");

  // 头一种就通：只问一回
  const before2 = claude.calls.length;
  const r3 = await call(order({ request: rich, beta: "mcp-client-2025-11-20" }));
  ok(claude.calls.length === before2 + 1 && JSON.stringify(r3.data.result.used) === JSON.stringify({ cache: true, mcp: true }), "换写法：头一种就通，只问一回");

  // key 不对、说得太快：还有别的写法也不换着问（换了也一样）
  for (const [status, type] of [[401, "authentication_error"], [403, "permission_error"], [429, "rate_limit_error"]]) {
    claude.script.push(upstreamError(status, type, "no"), said("不该问到这一回"));
    const at = claude.calls.length;
    const rr = await call(order({ request: rich, beta: "mcp-client-2025-11-20" }));
    ok(rr.data.result.status === status && claude.calls.length === at + 1, `换写法：Anthropic 回 ${status}（${type}），还有两种写法也不换着问`);
    claude.script.length = 0;
  }

  // Anthropic 一时太挤（它自己的 5xx）：歇一下，同一种写法原样再问，不因为这一下就换成不带缓存的
  // （换了问通的话，网页会记成“下回别带缓存记号”，往后每句话都按全价算）
  claude.script.push(upstreamError(529, "overloaded_error", "Overloaded"), said("带着缓存问通了"));
  const beforeS = claude.calls.length;
  const shaky = call(order({ request: rich, beta: "mcp-client-2025-11-20" }));
  await until(() => claude.calls.length === beforeS + 1);
  await breathe();
  await clock.tick(1500);
  const rs = await shaky;
  ok(claude.calls.length === beforeS + 2 && JSON.stringify(claude.calls[beforeS + 1].body) === JSON.stringify(rich) && JSON.stringify(rs.data.result.used) === JSON.stringify({ cache: true, mcp: true }),
    "换写法：Anthropic 一时太挤（529），歇一秒半照原样再问一回，问通了：用的还是带缓存、带工具的那种");
  // 原样再问还是太挤：才接着换写法试（整回只多问那一回）
  claude.script.push(upstreamError(529, "overloaded_error", "Overloaded"), upstreamError(500, "api_error", "Internal"), upstreamError(503, "api_error", "Unavailable"), said("第三种通了"));
  const beforeT = claude.calls.length;
  const stormy = call(order({ request: rich, beta: "mcp-client-2025-11-20" }));
  for (let i = 1; i <= 3; i++) {
    await until(() => claude.calls.length === beforeT + i);
    await breathe();
    await clock.tick(1500);
  }
  const rt = await stormy;
  const sent = claude.calls.slice(beforeT).map((c) => (fn.hasCache(c.body) ? "缓存" : "") + (fn.hasMcp(c.body) ? "工具" : "") || "素的");
  ok(sent.join() === "缓存工具,缓存工具,工具,素的" && rt.data.result.status === 200 && JSON.stringify(rt.data.result.used) === JSON.stringify({ cache: false, mcp: false, shaky: true }),
    `换写法：一直出岔子：同一种只多问一回，然后照旧一种一种往下换；结果上记着“是一时的岔子才换的”（${sent.join(" → ")}）`);
  // 连着两回太挤、换成不带缓存的问通了：也记着 shaky。网页看到这个，不把“不带缓存”记成往后的规矩
  // （不然 Anthropic 挤上两三秒，她这一趟后面的每句话都按全价算）
  claude.script.push(upstreamError(529, "overloaded_error", "Overloaded"), upstreamError(529, "overloaded_error", "Overloaded"), said("不带缓存问通了"));
  const beforeU = claude.calls.length;
  const twice = call(order({ request: rich, beta: "mcp-client-2025-11-20" }));
  for (let i = 1; i <= 2; i++) {
    await until(() => claude.calls.length === beforeU + i);
    await breathe();
    await clock.tick(1500);
  }
  const ru = await twice;
  ok(claude.calls.length === beforeU + 3 && JSON.stringify(ru.data.result.used) === JSON.stringify({ cache: false, mcp: true, shaky: true }),
    "换写法：连着两回太挤、换成不带缓存的才问通：结果上带着 shaky（是一时的岔子换的，不是缓存记号的毛病）");
  // Anthropic 说写得不对（400）才换的：不带 shaky，网页照旧记下“下回别带缓存记号”。后面那一步是一时的岔子换的，才带
  claude.script.push(upstreamError(400, "invalid_request_error", "cache_control"), upstreamError(500, "api_error", "Internal"), upstreamError(500, "api_error", "Internal"), said("摘了工具通了"));
  const beforeV = claude.calls.length;
  const mixed = call(order({ request: rich, beta: "mcp-client-2025-11-20" }));
  for (let i = 2; i <= 3; i++) {
    await until(() => claude.calls.length === beforeV + i);
    await breathe();
    await clock.tick(1500);
  }
  const rv = await mixed;
  ok(claude.calls.length === beforeV + 4 && JSON.stringify(rv.data.result.used) === JSON.stringify({ cache: false, mcp: false, shaky: true }) && !("shaky" in r2.data.result.used) && !("shaky" in rs.data.result.used),
    "换写法：是 Anthropic 说写得不对才换的，不带 shaky；原样再问就通了的，也不带");

  // 没带缓存记号、带着工具：两种写法（带工具、不带工具）
  const plainMcp = JSON.parse(JSON.stringify(noCache));
  claude.script.push(upstreamError(400, "invalid_request_error", "mcp"), said("行"));
  const before3 = claude.calls.length;
  const r4 = await call(order({ request: plainMcp, beta: "mcp-client-2025-11-20,other-beta" }));
  ok(claude.calls.length === before3 + 2 && claude.calls[before3 + 1].beta === "other-beta" && !("mcp_servers" in claude.calls[before3 + 1].body) && r4.data.result.used.mcp === false,
    "换写法：本来就没带缓存记号的，直接从“带工具 → 不带工具”换；别的 beta 留着");
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  clock.off();

  // 等得太久：到点就不等了（这一条用真的钟，等三秒多）
  claude.script.push({ hang: true });
  const before4 = claude.calls.length;
  const t0 = performance.now();
  const awake = setInterval(() => {}, 100); // 限时的信号不占着进程：没有别的事等着的话，Node 会以为没活儿了、直接收工
  const late = await fn.askUpstream(rich, "", "sk-ant-test", Date.now() + 3300);
  clearInterval(awake);
  ok(late.status === 504 && late.data.error.message.includes("等得太久") && claude.calls.length === before4 + 1 && performance.now() - t0 < 4500,
    "等回话：等 Anthropic 等到点就不等了，剩的工夫不够也不再换写法问");
}

// ================= 小后端：还在等的时候隔几秒摸一下信箱 =================
{
  resetWorld();
  addDevice();
  clock.on();
  let release;
  const gate = new Promise((r) => (release = r));
  claude.script.push({ wait: gate, ...said("久等了") });
  const o = order();
  const pending = call(o);
  await until(() => claude.calls.length === 1);
  const born = mailRow(o.job);
  const b0 = born.beat_at;
  ok(born.state === "working" && born.sealed === null && born.note === o.note, "还在等：信箱里先开一格，写着“在等”");
  await clock.tick(BEAT);
  const b1 = mailRow(o.job).beat_at;
  await clock.tick(BEAT);
  const b2 = mailRow(o.job).beat_at;
  ok(b1 !== b0 && b2 !== b1 && mailRow(o.job).state === "working", "还在等：每八秒摸一下那一格（手机靠它看这一回还活着没有）");
  release();
  const r = await pending;
  const patches = supa.mail.log.filter((x) => x.method === "PATCH").length;
  await clock.tick(BEAT * 2);
  await Promise.all(background);
  ok(r.data.result.status === 200 && mailRow(o.job).state === "done" && supa.mail.log.filter((x) => x.method === "PATCH").length === patches, "还在等：回话到了就不再摸");
  const beats = supa.mail.log.filter((x) => x.method === "PATCH");
  ok(beats.length === 3 && beats.every((x) => x.query.includes("state=eq.working")), "还在等：摸的、放信的那几下都只认还写着“在等”的那一格（放好了的不再动它）");
  const db = supa.seen.filter((x) => x.path.startsWith("/rest/v1/"));
  ok(db.length >= 5 && db.every((x) => x.timed) && ["POST", "PATCH", "GET"].every((m) => db.some((x) => x.method === m && x.path.startsWith("/rest/v1/mailbox"))),
    "读写库房（开一格、摸一下、放信、看信还在不在）每一下都带着限时的信号：库房悬着不应，不会把回话压在手里");

  // 同一个编号再来一回：不接（这一回已经在办了）
  const again = await call(o);
  ok(again.status === 409 && again.data.error.code === "duplicate" && claude.calls.length === 1, "同一个编号再敲一回门：不接，也不再问 Anthropic（不花两回钱）");
  clock.off();
}

// ================= 小后端：信放不进信箱、没有钥匙、没有设备 =================
{
  resetWorld();
  const dev = addDevice();
  clock.on();
  const finishes = () => supa.mail.log.filter((x) => x.method === "PATCH" && x.sets.includes("sealed"));
  const beatsOnly = () => supa.mail.log.filter((x) => x.method === "PATCH" && !x.sets.includes("sealed"));
  // 库房一时出岔子，头两回都放不进：回话照样先交给网页；交完隔半秒再放，放进了。
  // 她不在跟前的话，这条回好的话就靠这几下：放不进去，她回来只能再问一遍、再花一回钱
  supa.mail.state.failPatch = 2;
  const o = order();
  const r = await call(o);
  ok(r.status === 200 && r.data.result.status === 200 && mailRow(o.job).state === "working" && finishes().length === 2, "信放不进信箱（两回）：回话照样直接交给网页");
  await clock.tick(499);
  const early = finishes().length;
  await clock.tick(1);
  await until(() => mailRow(o.job).state === "done");
  const kept = mailRow(o.job);
  const letter = kept.sealed ? await openMail(o.key, kept.sealed) : null;
  ok(early === 2 && finishes().length === 3 && kept.state === "done" && !!letter && letter.status === 200 && letter.data.content[0].text.includes("收到") && claude.calls.length === 1,
    "信放不进信箱：交给网页以后隔半秒再放一回，放进了（打得开，是他回的话）；Anthropic 只问了一回");
  await clock.tick(GRACE - 500 - 100);
  const before = push.delivered.length;
  await clock.tick(200);
  await Promise.all(background);
  const n = push.delivered[0] && push.delivered[0].json.notification;
  ok(before === 0 && push.delivered.length === 1 && n.title === "光义" && n.body.includes("收到") && !n.body.includes("没送到"),
    "后来放进了的：从交出去算起照旧等够六秒才敲（不因为多放了几回就晚敲），横幅写的是他的话");

  // 一直放不进（库房出了大岔子）：隔半秒、一秒、两秒、四秒、八秒各再放一回，都不成才罢休；这工夫里那一格照旧隔八秒摸一下。
  // 她又不在：横幅照实说没送到，不写一句她回来取不到的话
  push.reset();
  supa.mail.log.length = 0;
  KNOCK = [];
  addDevice();
  supa.mail.state.failPatch = 999;
  const oN = order();
  const rN = await call(oN);
  const tries = [];
  for (const pause of [500, 1000, 2000, 4000, 8000]) {
    await clock.tick(pause);
    await breathe();
    tries.push(finishes().length);
  }
  const quiet = push.delivered.length;
  await clock.tick(50);
  await Promise.all(background);
  supa.mail.state.failPatch = 0;
  const nN = push.delivered[0] && push.delivered[0].json.notification;
  ok(rN.data.result.status === 200 && tries.join() === "3,4,5,6,7" && mailRow(oN.job).state === "working" && beatsOnly().length >= 1 && quiet === 0,
    `信一直放不进：交出去以后又放了五回（${tries.join("、")}），放的工夫里那一格照旧摸着（网页不会当它断了）`);
  ok(push.delivered.length === 1 && nN.title === "开封府" && nN.body.includes("没送到") && !nN.body.includes("收到"), "信一直放不进、她又不在：横幅照实说没送到，不写一句她回来取不到的话");
  const settled = finishes().length;
  await clock.tick(60000);
  ok(finishes().length === settled && beatsOnly().length === supa.mail.log.filter((x) => x.method === "PATCH").length - settled && supa.mail.log.filter((x) => x.method === "PATCH" && x.at > Date.now() - 40000).length === 0,
    "信一直放不进：罢休以后不再放、也不再摸");

  // 她就在跟前：回话直接到手，网页把那一格收掉了。还在“接着放”的这头放了个空：不敲手机
  push.reset();
  KNOCK = [];
  addDevice();
  supa.mail.state.failPatch = 2;
  const oP = order();
  await call(oP);
  supa.mail.rows.delete(USER.id + "|" + oP.job);
  await clock.tick(500);
  await clock.tick(GRACE);
  await Promise.all(background);
  ok(push.log.length === 0 && !mailRow(oP.job) && finishes().length === settled + 3, "信还没放进去、她已经直接拿到回话把那一格收了：接着放的这头放个空，不敲手机");

  // 头一回放不进，第二回放进了
  push.reset();
  KNOCK = [];
  const dev2 = addDevice();
  supa.mail.state.failPatch = 1;
  const o2 = order();
  await call(o2);
  ok(mailRow(o2.job).state === "done", "信头一回没放进：再放一回，放进了");
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  ok(push.delivered.some((d) => d.endpoint === dev2.endpoint && d.json.notification.title === "光义"), "再放一回放进了的：横幅照常写他的话");

  // 等够那几秒去看信还在不在，库房正好没应（问不到）：宁可多敲一下，不能因为问不到就不敲
  push.reset();
  const devQ = addDevice();
  const oq = order();
  await call(oq);
  supa.mail.state.down = true;
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  supa.mail.state.down = false;
  ok(push.delivered.some((d) => d.endpoint === devQ.endpoint && d.json.notification.navigate.endsWith(oq.job)), "问不到信还在不在（库房一时没应）：照样敲她（信要是其实被取走了，顶多多敲一下）");

  // 通知的钥匙没放：不敲，信照样在信箱里
  push.reset();
  addDevice();
  delete pushEnv.VAPID_PRIVATE_KEY;
  const o3 = order();
  const r3 = await call(o3);
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  ok(r3.status === 200 && push.log.length === 0 && mailRow(o3.job).state === "done", "通知的钥匙没放好：不敲手机，回话照样等、照样放进信箱（她回来取得到）");
  Object.assign(pushEnv, baseEnv);

  // 点了名、登记簿里却一行都没有：也一样
  supa.table.rows.clear();
  push.reset();
  const o4 = order();
  const r4 = await call(o4);
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  ok(r4.status === 200 && push.log.length === 0 && mailRow(o4.job).state === "done", "一台设备都没开通知：不敲，信照样在信箱里");

  // 等够那几秒要敲的时候，登记簿正好没读到：歇一秒再读一回，读到了照敲（读不到就敲不了：信在信箱里，她却不知道）
  push.reset();
  KNOCK = [];
  const devL = addDevice();
  const oL = order();
  await call(oL);
  supa.table.state.failGet = 1;
  await clock.tick(GRACE + 100);
  await breathe();
  const notYet = push.delivered.length;
  await clock.tick(1000);
  await Promise.all(background);
  ok(notYet === 0 && push.delivered.length === 1 && push.delivered[0].endpoint === devL.endpoint && push.delivered[0].json.notification.body.includes("收到"), "要敲的时候登记簿一时没读到：歇一秒再读一回，读到了照敲");
  // 两回都读不到：敲不了，信照样在信箱里（她回来取得到）
  push.reset();
  const oL2 = order();
  await call(oL2);
  supa.table.state.failGet = 2;
  await clock.tick(GRACE + 100);
  await breathe();
  await clock.tick(1000);
  await Promise.all(background);
  ok(push.log.length === 0 && supa.table.state.failGet === 0 && mailRow(oL2.job).state === "done", "登记簿两回都读不到：敲不了，信照样在信箱里");

  // 同一个门牌号报了好几遍：只敲一下
  push.reset();
  KNOCK = [];
  const devD = addDevice();
  const oD = order({ knock: [devD.endpoint, devD.endpoint, devD.endpoint] });
  await call(oD);
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  ok(push.delivered.length === 1 && push.log.length === 1, "同一个门牌号报了三遍：只敲一下");

  // 门牌号作废的设备：划掉
  KNOCK = [];
  const gone = addDevice("gone");
  const fine = addDevice("ok");
  const o5 = order();
  await call(o5);
  await clock.tick(GRACE + 100);
  await Promise.all(background);
  ok(!supa.table.rows.has(USER.id + "|" + gone.endpoint) && supa.table.rows.has(USER.id + "|" + fine.endpoint) && push.delivered.some((d) => d.endpoint === fine.endpoint),
    "敲的时候有一台门牌号作废了：从登记簿里划掉，别的照敲");
  clock.off();
  void dev;
}

// ================= 横幅上写什么：和对话里看得见的是同一套 =================
{
  const { parseReply } = replyjs;
  // 网页那头拆完以后，横幅该是什么样：对话里一个气泡，这里一条。
  // 字的气泡：气泡里摆出来的那些字（src/rich.js 的 plainOf：当了记号的井号、星号不带）；表情包、文档各写一句；
  // 摆出来一个字都没有的气泡不敲；什么都没剩下的，换了头像就说换了头像，不然写省略号
  const expect = (text) => {
    const lines = [];
    let avatar = false;
    for (const it of parseReply(text).items) {
      if (it.type === "text") {
        const t = richjs.plainOf(it.text).trim();
        if (t) lines.push(t);
      } else if (it.type === "meme") lines.push("[表情包]");
      else if (it.type === "doc") lines.push(`[文档] ${it.name}`);
      else if (it.type === "avatar") avatar = true;
    }
    return lines.length ? lines : [avatar ? "[换了新头像]" : "……"];
  };
  // 两边拆出来的是不是一模一样（一条对一条）
  const same = (text) => JSON.stringify(fn.bubblesOf(text)) === JSON.stringify(expect(text));
  const flat = (text) => fn.bubblesOf(text).join("\n");
  const corpus = [
    "<thinking>嗯</thinking>\n在呢",
    "在\n[SPLIT]\n第二条\n[SPLIT]\n第三条",
    "<thinking>没关上的心里话",
    "没有心里话的回复",
    "*摸摸头* 乖\n[MEME:fox_reading_book.jpg]\n好",
    "[MEME:a.jpg]",
    "[AVATAR:fox.jpg]",
    "[AVATAR:fox.jpg]\n换了",
    "行，改了。\n[NAME:小狐]\n[SPLIT]\n抬头看",
    "想改就单独一行写 [NAME:新名字] 这样",
    "[NAME:新名字]",
    "照抄的：\n[NAME:「新名字」]\n是这个",
    "  [NAME: 带 空格 ]  ",
    "给你\n[DOC:清单.md]\n# 买菜\n- 葱\n[/DOC]\n收好",
    "[DOC:文件名.md]\n这是在讲写法\n[/DOC]",
    "[DOC:长文.md]\n没写完的文档",
    "[DOC: a/b:c?.txt ]\n正文\n[/DOC]",
    "[DOC:]\n没起名\n[/DOC]",
    "[DOC:空的.md]\n\n[/DOC]\n后面",
    "",
    "   \n  ",
    "<thinking>只有心里话</thinking>",
    "***",
    "第一条\n\n\n[SPLIT]\n\n第二条",
    "带 [SPLIT] 在句子中间的",
    "全角：[MEME：a.jpg] 和 [AVATAR：b.jpg] 完",
    "<thinking>一</thinking>\n话\n<thinking>二</thinking>\n又一句",
    "一家人 👨\u200d👩\u200d👧\u200d👦 都在",
    "[doc:小写.md]\n正文\n[/doc]",
    "两份\n[DOC:a.md]\n甲\n[/DOC]\n中间\n[DOC:b.md]\n乙\n[/DOC]\n尾",
    "文档里的记号不算：\n[DOC:x.md]\n[MEME:a.jpg]\n[SPLIT]\n[NAME:甲]\n[/DOC]\n完",
    "钱：$& 和 $1 和 $$",
    "<thinking>$&</thinking>\n真话",
    "Windows 换行\r\n[SPLIT]\r\n第二条\r\n[DOC:w.md]\r\n正文\r\n[/DOC]\r\n尾",
    "[MEME: 带空格.jpg ]",
    "[MEME:]",
    "[SPLIT]",
    "[SPLIT]\n[SPLIT]\n只有这句",
    "[NAME:小狐]\u00a0[SPLIT]",
    "在\u3000[SPLIT]\u00a0[NAME:小狐]\u00a0",
    "一\ufeff[SPLIT]\u2028[NAME:小狐]\u2029[SPLIT]\u000b二",
    "[MEME:" + "名".repeat(200) + "]",
    "[MEME:" + "名".repeat(201) + "]",
    "[DOC:\u00a0 带着怪空白.md \t]\n正文\n[/DOC]",
    "[DOC:\"「清单」\".md]\n正文\n[/DOC]",
    "[DOC:''清单'']\n正文\n[/DOC]",
    "[DOC:》」』 ']\n正文\n[/DOC]",
    "[DOC:a'b\"]\n正文\n[/DOC]",
    "[DOC:「a」b「]\n正文\n[/DOC]",
    "[DOC:  .. 名 ..  ]\n正文\n[/DOC]",
    "[DOC:《》]\n正文\n[/DOC]",
    "[DOC:x.md]\n正文后面一串空白 \t\u00a0\u3000\n\n\r\n[/DOC]\n尾",
    "[DOC:x.md]\n没写完的，结尾一串空白 \n\t \u2028",
    "[NAME:「新名字」」」]",
    "[NAME:『“新名字”』]",
    "[NAME:新名字」x]",
    "[NAME:\"'新名字'\"]",
    "[NAME:「」]",
    "[NAME:」新名字「]",
    "[DOC:清单' ']\n正文\n[/DOC]",
    "[DOC:' '清单' \"]\n正文\n[/DOC]",
    "[DOC:清单 》 」.md]\n正文\n[/DOC]",
    "[DOC:清单.md' ']\n正文\n[/DOC]",
    "[NAME:新名字」 」]",
    "[NAME:「 「新名字]",
    // 标题行、加粗、动作：横幅上是气泡里摆出来的字
    "# 标题\n\n正文",
    "## 二级 ##\n**粗**的和*斜*的\n### 三级",
    "####### 七个井号不算\n#标签也不算\n   # 前头三个空格算\n    # 四个不算",
    "#\u3000全角空格也算\n#\u00a0不断行的空格也算\n#\t制表符也算",
    "正文\n\n# 标题\n\n\n正文二\n\n空行在别处照留",
    "```\n# 代码里的注释\n```\n# 外头的标题",
    "代码：```sh\n# 注释\n```这样\n## 标题",
    "**加粗***动作***又粗又斜***",
    "*推了推眼镜***听话**",
    "* **苹果**：好吃\n* **梨**：也行",
    "5 * 2 = 10，**记住**",
    "*跨了两行的\n动作*",
    "**\n分隔线下面\n**",
    "***",
    "** **",
    "*",
    "# **标题里的粗体** 和 *动作* #",
    "# 只有标题",
    "#",
    "# ",
    "[MEME:a.jpg]\n# 表情包后面的标题\n[SPLIT]\n**整条都粗**",
    "# 一\n[SPLIT]\n\n## 二\n\n[SPLIT]\n### 三 ###",
  ];
  const diff = corpus.filter((t) => !same(t));
  ok(diff.length === 0, `横幅：${corpus.length} 条各式各样的回话，小后端拆出来的和网页拆出来的一模一样，一个气泡对一条${diff.length ? "（对不上的：" + JSON.stringify(diff.map((t) => [t, fn.bubblesOf(t), expect(t)])) + "）" : ""}`);
  ok(flat("<thinking>想她</thinking>\n在呢") === "在呢" && flat("<thinking>没关上") === "……" && !flat("<thinking>秘密</thinking>\n话").includes("秘密"), "横幅：心里话一个字都不上横幅");
  ok(JSON.stringify(fn.bubblesOf("在\n[SPLIT]\n第二条\n两行\n[MEME:a.jpg]\n[DOC:清单.md]\n正文\n[/DOC]\n尾")) === JSON.stringify(["在", "第二条\n两行", "[表情包]", "[文档] 清单.md", "尾"]) && JSON.stringify(fn.bubblesOf("[AVATAR:fox.jpg]")) === JSON.stringify(["[换了新头像]"]) && JSON.stringify(fn.bubblesOf("")) === JSON.stringify(["……"]),
    "横幅：一个气泡一条（气泡里的换行照留）；表情包、文档各占一条；只换了头像的说一句换了头像；空的写省略号");
  ok(JSON.stringify(fn.bubblesOf("# 标题\n\n**粗**的 *斜*的\n[SPLIT]\n5 * 2，#标签")) === JSON.stringify(["标题\n粗的 斜的", "5 * 2，#标签"]) && fn.plainOf("## 二级 ##") === "二级" && fn.plainOf("```\n# 注释\n```") === "```\n# 注释\n```",
    "横幅：标题行开头的井号、围着字的星号不带，紧挨着标题的空行不要；零散的星号、#标签、代码里的注释照留");
  // 再随机拼四千条对一遍（种子是定的，每回跑的是同一批）
  let seed = 20261002;
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };
  const bits = ["在呢", "*笑*", "好", " ", "\n", "\n\n", "[SPLIT]", "\n[SPLIT]\n", " [SPLIT] ", "[MEME:a.jpg]", "[AVATAR:b.jpg]", "[NAME:小狐]", "\n[NAME:小狐]\n", "[NAME:新名字]", "\n[NAME:新名字]\n", "\n [NAME:「新名字」] \n",
    "<thinking>", "</thinking>", "[DOC:x.md]\n", "\n[DOC:x.md]\n", "\n[/DOC]\n", "[/DOC]", "\n[DOC:文件名.md]\n", "\r\n", "\t", "：", "$&", "*", "[", "]", "一家人 👨\u200d👩\u200d👧\u200d👦",
    "\u00a0", "\u3000", "\ufeff", "\u000b", "\u2028", "[DOC: x .md ]\n", "[MEME: a.jpg ]",
    "「", "」", "'", "\"", "》", "《", "[DOC:「x」.md]\n", "[DOC:'x'", "]\n", "[NAME:「新名字」」]", "\n[NAME:『新名字』]\n", "[NAME:新名字", "」]\n",
    "# ", "## ", "\n# ", "\n### ", "#", " #", " ##\n", "**", "***", "**粗**", "*斜*", "```", "\n```\n", "   ", "    "];
  const off = [];
  const splitOff = [];
  for (let i = 0; i < 20000; i++) {
    let t = "";
    for (let k = 1 + Math.floor(rnd() * 12); k > 0; k--) t += bits[Math.floor(rnd() * bits.length)];
    if (!same(t)) off.push(t);
    // 网页那头按 [SPLIT] 切的新写法，和原来那条正则切出来的一样
    if (JSON.stringify(replyjs.splitTurns(t)) !== JSON.stringify(t.split(/\s*\[SPLIT\]\s*/))) splitOff.push(t);
  }
  ok(splitOff.length === 0, `分条：按 [SPLIT] 切的写法（不用正则在空白上来回试），切出来的和原来那条正则一模一样${splitOff.length ? "（对不上：" + JSON.stringify(splitOff[0]) + "）" : ""}`);
  ok(off.length === 0, `横幅：随机拼的两万条回话，两边拆出来的也一模一样${off.length ? "（对不上 " + off.length + " 条，头一条：" + JSON.stringify([off[0], fn.bubblesOf(off[0]), expect(off[0])]) + "）" : ""}`);
  // 气泡里摆出来的字（小后端的 plainOf 对网页的 plainOf）：只拿星号、井号、空白、反引号这几样密密地拼，再对四万条
  {
    const marks = ["*", "**", "***", "#", "# ", "## ", " ", "\n", "\n\n", "字", "a", "```", "\u3000", "\t", " #", "*字*", "**字**"];
    const wrong = [];
    for (let i = 0; i < 40000; i++) {
      let t = "";
      for (let k = 1 + Math.floor(rnd() * 10); k > 0; k--) t += marks[Math.floor(rnd() * marks.length)];
      if (fn.plainOf(t) !== richjs.plainOf(t)) wrong.push(t);
    }
    ok(wrong.length === 0, `气泡里摆出来的字：拿星号、井号、空白、反引号密密地拼四万条，小后端认出来的和网页认出来的一模一样${wrong.length ? "（对不上 " + wrong.length + " 条，头一条：" + JSON.stringify([wrong[0], fn.plainOf(wrong[0]), richjs.plainOf(wrong[0])]) + "）" : ""}`);
  }

  // ---- 反过来写回去（reply.js 的 rawOf）：她按停把他的回话掐断以后，剩下的那几样要写回他的写法 ----
  {
    const { rawOf } = replyjs;
    const T = (text) => ({ type: "text", text });
    ok(rawOf([T("在呢"), { type: "meme", file: "a.jpg" }, T("好")], "") === "在呢\n[SPLIT]\n[MEME:a.jpg]\n[SPLIT]\n好" && rawOf([T("……")]) === "……" && rawOf([], "") === "" && rawOf(null) === "",
      "写回去：一样一条，中间用 [SPLIT] 隔开；表情包写回 [MEME:…]");
    ok(rawOf([T("行"), { type: "avatar", file: "b.jpg", prev: null }], "小狐") === "[NAME:小狐]\n[SPLIT]\n行\n[SPLIT]\n[AVATAR:b.jpg]", "写回去：换头像写回 [AVATAR:…]（换之前那张不往里写）；改过名字的，改名的记号写在最前头");
    const docRaw = rawOf([T("给你"), { type: "doc", name: "清单.md", text: "# 买菜\n- 葱" }, T("收好")], "");
    ok(docRaw === "给你\n[SPLIT]\n[DOC:清单.md]\n# 买菜\n- 葱\n[/DOC]\n[SPLIT]\n收好", "写回去：文档写回一整块，开头结尾的记号各占一行");
    // 没写完的文档（没有结尾的记号）后面什么都不能跟：改名的记号要是写在后面，会被算成文档的正文
    const cutDoc = parseReply("<thinking>x</thinking>\n" + rawOf([T("看"), { type: "doc", name: "长文.md", text: "没写完", cut: true }], "小狐"));
    ok(cutDoc.rename === "小狐" && cutDoc.items.length === 2 && cutDoc.items[1].type === "doc" && cutDoc.items[1].cut === true && cutDoc.items[1].text === "没写完", "写回去：最后一样是没写完的文档、这一条里又改了名字：再拆，文档还是没写完的那份，名字也还认得出");
    const holder = parseReply(rawOf([{ type: "doc", name: "文件名.md", text: "真的叫这个名字" }], ""));
    ok(holder.items.length === 1 && holder.items[0].type === "doc" && holder.items[0].name === "文件名.md" && holder.items[0].text === "真的叫这个名字", "写回去：文档真叫“文件名.md”（教写法时占位的那个名字）：再拆还是一份文档，不会被当成在讲写法");

    // 拿上面那一批、再加随机拼的几万条：拆开、只留头几样（一样、两样……全留）、写回去、再拆，得到的还是那几样。
    // 再拆的时候前头垫一段心里话：对话里存的 raw 本来就是摘掉了头一段心里话以后的
    const reparse = (raw) => parseReply("<thinking>x</thinking>\n" + raw);
    const nameLine = () => new RegExp(namesjs.NAME_MARK, "m");
    const docOpen = () => /^[ \t]*\[(?:DOC|Doc|doc)[:：]([^\[\]\n]*)\][ \t]*\r?$/gm;
    const docClose = () => /^[ \t]*\[\/(?:DOC|Doc|doc)\][ \t]*\r?$/m;
    // 学不了的三种，都是他写岔了才有的样子（见 rawOf 上面那段）：
    //   一句话自己长得就像记号（改名的、文档开头的记号紧贴着别的东西写，原来当字显示了）；
    //   文档的正文里夹着一行结尾的记号（原来那一行后面跟着怪空白，没被认成结尾）；
    //   名字再收拾一遍会变（太长截断以后露出个引号）
    const odd = (items, rename) =>
      items.some((it) => (it.type === "text" && (nameLine().test(it.text) || [...it.text.matchAll(docOpen())].some((m) => m[1].trim() !== docsjs.DOC_NAME_PLACEHOLDER))) || (it.type === "doc" && docClose().test(it.text))) ||
      (!!rename && namesjs.cleanMarkName(rename) !== rename);
    const flat = (items) => JSON.stringify(items.map((it) => (it.type === "doc" ? { ...it, name: docsjs.cleanDocName(it.name) } : it)));
    let tried = 0, skipped = 0;
    const wrong = [];
    const roundTrip = (t) => {
      const p = parseReply(t);
      for (let k = 1; k <= p.items.length; k++) {
        const kept = p.items.slice(0, k);
        if (odd(kept, p.rename)) { skipped++; continue; }
        tried++;
        const q = reparse(rawOf(kept, p.rename || ""));
        if (flat(q.items) !== flat(kept) || (q.rename || "") !== (p.rename || "")) { wrong.push([t, k, rawOf(kept, p.rename || "")]); return; }
      }
    };
    corpus.forEach(roundTrip);
    const fromCorpus = tried;
    seed = 20261004;
    for (let i = 0; i < 30000; i++) {
      let t = "";
      for (let k = 1 + Math.floor(rnd() * 12); k > 0; k--) t += bits[Math.floor(rnd() * bits.length)];
      roundTrip(t);
    }
    ok(wrong.length === 0 && fromCorpus > 60 && tried > 30000 && tried > skipped * 2,
      `写回去：${tried} 回（上面那一批加随机拼的三万条，每条从留一样试到全留），写回去再拆，得到的都还是留下的那几样、名字也对${wrong.length ? "（对不上 " + wrong.length + " 回，头一回：" + JSON.stringify(wrong[0]) + "）" : ""}（另有 ${skipped} 回是他写岔了的样子，学不了，不算）`);
  }
  // 会让正则来回试的几种写法：两头都一眨眼拆完（小后端一回请求只有两秒可算；手机上卡住更难看）。
  // 原来的写法：五万个空行后面不跟 [SPLIT] 要算好几秒；[DOC: 后面几千个空格、没有右括号，要算十几秒；一万个没有右括号的 [MEME: 将近两秒
  const slow = [
    ["五万个连着的空行、后面不是 [SPLIT]", "在呢" + "\n".repeat(50000) + "好", "在呢" + "\n".repeat(50000) + "好"],
    ["[SPLIT] 两边各两万五千个空白", "在呢" + "\n".repeat(25000) + "[SPLIT]" + " ".repeat(25000) + "好", "在呢\n好"],
    ["[DOC: 后面四千个空格、没有右括号", "看\n[DOC:" + " ".repeat(4000) + "\n完", null],
    ["一万个没有右括号的 [MEME:", "[MEME:".repeat(10000), null],
  ];
  for (const [what, text, want] of slow) {
    const t0 = performance.now();
    const quick = flat(text);
    const mid = performance.now();
    const here = expect(text).join("\n");
    const t1 = performance.now();
    ok(quick === here && (want === null || quick === want) && mid - t0 < 300 && t1 - mid < 300, `不拖：${what}：小后端 ${Math.round(mid - t0)} 毫秒、网页 ${Math.round(t1 - mid)} 毫秒就拆完，两边拆的一样`);
  }
  // 还有三种只在小后端这头量（网页那头同样的地方没动：它不在这两秒里；这三种得是他一口气写出几万个引号才碰得上）。
  // 原来的写法各要算三到六秒：名字里夹着一长串引号、后面又跟着别的字；文档正文里夹着一长串空白
  const slowHere = [
    ["文档名里夹着五万九千个引号", "[DOC:a" + "'".repeat(59000) + "b]\n正文\n[/DOC]", "[文档] a" + "'".repeat(39) + ".md"],
    ["[NAME: 后面五万九千个右引号再跟一个字", "[NAME:" + "」".repeat(59000) + "x]", "……"],
    ["文档正文里夹着五万九千个空格", "[DOC:d.md]\nx" + " ".repeat(59000) + "y\n[/DOC]", "[文档] d.md"],
  ];
  for (const [what, text, want] of slowHere) {
    const t0 = performance.now();
    const quick = flat(text);
    const took = performance.now() - t0;
    ok(quick === want && took < 300, `不拖：${what}：小后端 ${Math.round(took)} 毫秒就拆完`);
  }
  // 认标题、认加粗的那几条规矩碰上最难缠的写法（几万个连着的空格、星号、井号，凑不成对的星号一长串）：也是一眨眼。
  // 小后端只看回话的前六万个字，这里就照六万个字的量来
  const slowRich = [
    ["标题后面五万多个空格", "# 标题" + " ".repeat(29000) + "尾巴" + " ".repeat(29000) + "## "],
    ["三万个星号、一个字、三万个空格、一个星号", "*".repeat(29990) + "字" + " ".repeat(29990) + "*"],
    ["六万个井号", "#".repeat(60000)],
    ["一万五千回“*a**”", "*a**".repeat(15000)],
    ["两个星号后面三万回“a*”", "**" + "a*".repeat(29000)],
    ["加粗里头夹着一万九千个动作", "**" + "*a*".repeat(19000) + "**"],
    ["五千行星号打头的列表", ("* **项**：字\n").repeat(5000)],
    ["两万个连着的反引号围栏", "```".repeat(20000)],
    ["两万行“**”", ("**\n").repeat(19000) + "字"],
  ];
  for (const [what, text] of slowRich) {
    const t0 = performance.now();
    const quick = fn.bubblesOf(text);
    const took = performance.now() - t0;
    ok(JSON.stringify(quick) === JSON.stringify(expect(text)) && took < 300, `不拖：${what}：小后端 ${Math.round(took)} 毫秒就认完，和网页认的一样`);
  }
  ok(flat("好".repeat(100000) + "[SPLIT]尾巴") === "好".repeat(60000), "横幅：回话太长只看前六万个字（横幅上本来也只写三百个）");

  // 太长的截掉
  const long = "很长".repeat(400);
  const cut = fn.clip(long, 300, 1800);
  ok(Array.from(cut).length === 300 && cut.endsWith("…") && fn.clip("短的", 300, 1800) === "短的", "横幅：超过三百个字的截到三百、结尾加省略号；短的原样");
  const family = "👨\u200d👩\u200d👧\u200d👦".repeat(200);
  const cutF = fn.clip(family, 300, 1800);
  ok(new TextEncoder().encode(cutF).length <= 1800 && cutF.endsWith("…") && cutF.slice(0, -1).length % "👨\u200d👩\u200d👧\u200d👦".length === 0, "横幅：字少但占的字节多（一长串拼起来的表情），按字节再截，不把一个表情劈开");
  const b = fn.bannerOf({ status: 200, data: { content: [{ type: "text", text: "<thinking>x</thinking>\n" + long }, { type: "mcp_tool_use", name: "t" }, { type: "text", text: "尾巴" }] }, used: {} }, "光义");
  ok(b.title === "光义" && b.bodies.length === 1 && Array.from(b.bodies[0]).length === 300 && b.bodies[0].endsWith("…") && fn.bannerOf(null, "光义").title === "开封府" && fn.bannerOf({ status: 200, data: { content: [] }, used: {} }, "").title === "开封府" && fn.bannerOf({ status: 200, data: { content: [] }, used: {} }, "x").bodies.join() === "……",
    "横幅：名字用网页给的（没给就写开封府）；每一条最多三百个字；回话是空的写省略号");
  const failed = fn.bannerOf(null, "光义");
  const failed2 = fn.bannerOf({ status: 529, data: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, used: {} }, "光义");
  ok(failed.bodies.length === 1 && failed.bodies[0] === "这条消息没送到。回开封府点一下重发。" && failed2.title === "开封府" && failed2.bodies.join() === failed.bodies.join(), "横幅：没回成的就一条，照实说没送到，不写他的话");
  ok(fn.bannerOf({ status: 200, data: { content: [{ type: "text", text: "好" }] }, used: {} }, "名字".repeat(50)).title.length <= 40, "横幅：名字太长也截");
  const heavy = fn.bannerOf({ status: 200, data: { content: [{ type: "text", text: family }] }, used: {} }, "光义");
  // 整条通知就是小后端真寄的那个样子：名字、字、回程的网址、通知自己的记号都按最长的算（对话的记号、编号各六十四个字，第几条是四位数）
  const heavyNotice = JSON.stringify(fn.replyNotice(PAGE + "dingxiang/" + "p".repeat(240), { title: fn.clip("名".repeat(100), 40, 160), body: heavy.bodies[0] }, "J".repeat(64), "T".repeat(64), 9999));
  const heavyTag = JSON.parse(heavyNotice).notification.tag;
  ok(heavy.bodies.length === 1 && new TextEncoder().encode(heavy.bodies[0]).length <= 1800 && new TextEncoder().encode(heavyNotice).length <= 3000 && !!notifyjs.parseBannerTag(heavyTag) && notifyjs.parseBannerTag(heavyTag).nth === 9999,
    `横幅：一长串拼起来的表情，写上横幅以后整条通知还在推送服务肯收的大小以内（名字、网址、记号都按最长的算：${new TextEncoder().encode(heavyNotice).length} 个字节）`);
}

// ================= 手机这一头：对话上的手艺（src/thread.js） =================
{
  const { hasJob, answeredAfter, mailFit, mailPut, needsReply, insertReply, forkAt } = thread;
  const her = (id, ts = 0) => ({ id, role: "her", ts, text: id });
  const him = (id, ts = 0, job) => ({ id, role: "him", ts, items: [{ type: "text", text: id }], ...(job ? { job } : {}) });
  const ev = (id) => ({ id, role: "event", who: "her" });
  const chat = [her("a", 1), him("b", 2), her("c", 3)];
  ok(needsReply(chat) && !needsReply(chat.slice(0, 2)) && needsReply(chat.concat([ev("e")])) && !needsReply([]), "对话：最后一句（不算换头像提示）是她的，就还欠一个回复");
  ok(insertReply(chat.concat([her("d", 4)]), "c", him("r", 5)).map((m) => m.id).join() === "a,b,c,r,d" && insertReply(chat, "不在", him("r")).map((m) => m.id).join() === "a,b,c,r", "对话：回复插在那一句后面，等的工夫她又说的排在回复后面");
  ok(answeredAfter(chat, "a") && !answeredAfter(chat, "c") && !answeredAfter(chat, "不在") && answeredAfter([her("a"), ev("e"), him("b")], "a") && !answeredAfter([her("a"), ev("e")], "a") && !answeredAfter([her("a"), her("a2"), him("b")], "a"),
    "对话：那一句后面是不是已经有他的回话（换头像提示不算；她又说了一句的不算）");

  const info = { v: 1, chat: "C", last: "c", key: "k", at: 10 };
  ok(mailFit(chat, info, "J1") === "ok" && mailFit(null, info, "J1") === "later" && mailFit([], info, "J1") === "later" && mailFit([her("a")], info, "J1") === "later",
    "取信：那一句在、后面还空着，放得进；这台设备上还没有那一句（没同步到），先留着");
  const placed = mailPut(chat, info, him("rJ1", 9, "J1"));
  ok(placed.map((m) => m.id).join() === "a,b,c,rJ1" && mailFit(placed, info, "J1") === "dup" && mailFit(chat.concat([him("x")]), info, "J1") === "gone" && hasJob(placed, "J1") && !hasJob(placed, "J2"),
    "取信：放进去以后再来一遍，认得出放过了；那一句后面已经有别的回话，这封就不要了");
  const withMore = chat.concat([her("d", 20)]);
  ok(mailFit(withMore, info, "J1") === "ok" && mailPut(withMore, info, him("rJ1", 9, "J1")).map((m) => m.id).join() === "a,b,c,rJ1,d", "取信：等的工夫她又说了一句：回话插在它该在的那一句后面");

  // 重新回答：在要换掉的那一条上开新分支
  const full = [her("a", 1), him("b", 2), her("c", 3), him("old", 4), her("旧的后话", 5)];
  const finfo = { v: 1, chat: "C", last: "c", fork: "old", key: "k", at: 100 };
  const tail = full.concat([her("新说的", 200)]);
  const forked = mailPut(tail, finfo, him("rJ2", 150, "J2"));
  ok(mailFit(tail, finfo, "J2") === "ok" && forked.map((m) => m.id).join() === "a,b,c,rJ2,新说的" && forked[3].alts.length === 2 && forked[3].altIdx === 1 && forked[3].alts[0].node.id === "old" && forked[3].alts[0].after.map((m) => m.id).join() === "旧的后话",
    "取信·重新回答：新回答开一个分支摆在外面，旧回答连同它后面的话收进旧分支；那一回发出去以后她又说的，接在新回答后面");
  ok(mailFit(forked, finfo, "J2") === "dup" && mailFit([her("a")], finfo, "J2") === "later", "取信·重新回答：放过了认得出；这台设备上还没有那一句，先留着");
  // 要换掉的那一条不在外面摆着了（她翻到了别的版本、存档里缺了它）：那一句后面还空着，就当平常的回话放进去，不把回好的话扔了
  const lost = [her("a", 1), him("b", 2), her("c", 3), her("新说的", 200)];
  ok(mailFit(lost, finfo, "J2") === "ok" && mailPut(lost, finfo, him("rJ2", 150, "J2")).map((m) => m.id).join() === "a,b,c,rJ2,新说的" && !mailPut(lost, finfo, him("rJ2", 150, "J2"))[3].alts,
    "取信·重新回答：要换掉的那一条不在了、那一句后面还空着：当平常的回话接在那一句后面");
  const other = [her("a", 1), him("b", 2), her("c", 3), him("另一个版本", 4)];
  ok(mailFit(other, finfo, "J2") === "gone" && mailFit(full.slice(0, 3).concat([her("event", 9)]).map((m, i) => (i === 3 ? { id: "e", role: "event" } : m)).concat([him("x", 10)]), finfo, "J2") === "gone",
    "取信·重新回答：要换掉的那一条不在了、那一句后面已经有别的回话：这封不要了");
  // 要换掉的那一条被她翻走了（外面摆着的是它的另一个版本）：新回答加成那一条的又一个版本，不扔
  const twoVersions = forkAt(full.slice(0, 4), 3, him("v2", 50));
  const third = mailPut(twoVersions, finfo, him("rJ3", 150, "J3"));
  ok(mailFit(twoVersions, finfo, "J3") === "ok" && third.length === 4 && third[3].id === "rJ3" && third[3].altIdx === 2 && third[3].alts.map((a) => a.node.id).join() === "old,v2,rJ3" && mailFit(third, finfo, "J3") === "dup",
    "取信·重新回答：要换掉的那一条被她翻成了另一个版本：新回答照样加成那一条的又一个版本（三个都翻得到），不扔");
  // 条子里说要换掉的是她的一句话（不该有的事）：不在她的话上开分支，当平常的回话放
  const odd = { v: 1, chat: "C", last: "c", fork: "c", key: "k", at: 10 };
  const plain = mailPut(chat, odd, him("rJ4", 9, "J4"));
  ok(mailFit(chat, odd, "J4") === "ok" && plain.map((m) => m.id).join() === "a,b,c,rJ4" && !plain[2].alts && !plain[3].alts, "取信·重新回答：条子指着的是她的话：不在她的话上开分支，当平常的回话接在后面");
  const back = thread.switchAlt(forked, 3, 0);
  ok(hasJob(back, "J2") && mailFit(back, finfo, "J2") === "dup" && back.map((m) => m.id).join() === "a,b,c,old,旧的后话", "取信：她翻回旧分支以后，收在别的分支里的那条也认得出（不会再放一遍）");
  const nested = forkAt([her("a"), him("b", 2, "J9"), her("c")], 0, her("a2"));
  ok(hasJob(nested, "J9") && !hasJob(nested, "J8"), "取信：改过她的话、整段收进旧分支的，里面的回话也认得出");

  // ---- 她按了停 ----
  const { markStopped, stoppedAt, cutReply } = thread;
  const marked = markStopped(chat);
  ok(marked !== chat && marked[2].stopped === true && !chat[2].stopped && marked[0] === chat[0] && marked[1] === chat[1] && stoppedAt(marked) === "c" && stoppedAt(chat) === "" && markStopped(marked) === marked,
    "按停·作废：在她最后那句话上记一笔“停了”（原来那份不动）；底下那行小字认的就是它；记过了再记，原样交回");
  const withEv = markStopped(chat.concat([ev("e")]));
  ok(withEv.length === 4 && withEv[2].stopped === true && !withEv[3].stopped && stoppedAt(withEv) === "c", "按停·作废：她那句后面夹着换头像的提示：照样记在她那句上");
  const hisLast = chat.slice(0, 2);
  ok(markStopped(hisLast) === hisLast && markStopped([]).length === 0 && stoppedAt([]) === "" && stoppedAt(hisLast) === "", "按停·作废：最后一句是他的话、对话是空的：没什么可记的，原样交回");
  ok(stoppedAt(marked.concat([her("d", 4)])) === "" && stoppedAt(marked.concat([him("r", 5)])) === "" && stoppedAt(marked.concat([ev("e2")])) === "c" && needsReply(marked),
    "按停·作废：那一句后面她又说了别的、有了回话，那一笔就不作数了（小字不摆）；只多了一行换头像提示的还作数；那一句照旧算“还欠一个回复”");
  const edited = forkAt(marked, 2, (({ stopped, ...rest }) => ({ ...rest, id: "c2", text: "改过的" }))(marked[2]));
  ok(stoppedAt(edited) === "" && edited[2].alts[0].node.stopped === true && stoppedAt(thread.switchAlt(edited, 2, 0)) === "c", "按停·作废：她把那一句改了，改出来的新话上没有这一笔；翻回原来那一句，小字还在");
  // 她点了那行小字：那一笔擦掉
  const { unmarkStopped } = thread;
  const wiped = unmarkStopped(marked);
  ok(wiped !== marked && !("stopped" in wiped[2]) && JSON.stringify(wiped) === JSON.stringify(chat) && wiped[0] === marked[0] && wiped[1] === marked[1] && marked[2].stopped === true && stoppedAt(wiped) === "" && needsReply(wiped),
    "按停·作废：她点了那行小字：那一笔擦掉（原来那份不动），这一句又和平常的话一样，照旧算“还欠一个回复”");
  const wipedEv = unmarkStopped(withEv);
  ok(wipedEv.length === 4 && !("stopped" in wipedEv[2]) && wipedEv[3] === withEv[3] && stoppedAt(wipedEv) === "" && withEv[2].stopped === true, "按停·作废：那一句后面夹着换头像的提示：那一笔照样擦得到");
  const moot = marked.concat([her("d", 4)]);
  ok(unmarkStopped(chat) === chat && unmarkStopped(hisLast) === hisLast && unmarkStopped([]).length === 0 && unmarkStopped(moot) === moot && moot[2].stopped === true,
    "按停·作废：没有那一笔、那一笔已经不作数了（后面她又说了别的）：没什么可擦的，原样交回");

  const full4 = { id: "h", role: "him", ts: 9, items: [{ type: "text", text: "一" }, { type: "meme", file: "a.jpg" }, { type: "avatar", file: "b.jpg", prev: null }, { type: "text", text: "四" }], raw: "一 [MEME:a.jpg]\n[AVATAR:b.jpg]\n[SPLIT]\n四\n[NAME:小狐]", thinking: "想了想", tools: ["笔记"], toolNote: "", job: "J7", rename: "小狐" };
  const talk = [her("a", 1), full4, her("z", 10)];
  const cut = cutReply(talk, "h", 2);
  ok(!!cut && cut.msgs.length === 3 && cut.msgs[0] === talk[0] && cut.msgs[2] === talk[2] && cut.msgs[1].items.length === 2 && cut.msgs[1].items[1].file === "a.jpg" && cut.msgs[1].cut === true && cut.dropped.length === 2 && cut.dropped[0].type === "avatar" && cut.dropped[1].text === "四" && full4.items.length === 4 && !full4.cut,
    "按停·掐断：只留已经蹦出来的头两样，后面的不要了；不要了的那几样另外交出来（里面有换头像，外头要把头像换回去）；原来那份不动");
  ok(cut.msgs[1].raw === "[NAME:小狐]\n[SPLIT]\n一\n[SPLIT]\n[MEME:a.jpg]" && JSON.stringify(replyjs.parseReply(cut.msgs[1].raw).items) === JSON.stringify(cut.msgs[1].items) && replyjs.parseReply(cut.msgs[1].raw).rename === "小狐",
    "按停·掐断：往后寄给那边的我的“他自己说过的话”照剩下的重写：他只当自己就说了这么多（再拆一遍，正是留下的那两样）");
  ok(cut.msgs[1].thinking === "想了想" && cut.msgs[1].job === "J7" && cut.msgs[1].rename === "小狐" && cut.msgs[1].tools.join() === "笔记" && cut.msgs[1].id === "h" && cut.msgs[1].ts === 9 && hasJob(cut.msgs, "J7"),
    "按停·掐断：心里话、用了什么工具、改的名字、是哪一回的回话，都照旧留着（信箱那头还认得出这一回放过了）");
  ok(cutReply(talk, "h", 4) === null && cutReply(talk, "h", 9) === null && cutReply(talk, "没有这一条", 1) === null && cutReply(talk, "a", 1) === null && cutReply(talk, "h", 0).msgs[1].items.length === 1 && cutReply(talk, "h", 3).dropped.length === 1 && cutReply(talk, "h", 3).msgs[1].raw.includes("[AVATAR:b.jpg]"),
    "按停·掐断：都蹦完了、没有这一条、那一条是她的话：没什么可掐的；至少留一样；换头像的那一样已经蹦出来了就留着");
  const forked4 = forkAt([her("a", 1), him("旧回答", 2)], 1, full4);
  const cutFork = cutReply(forked4, "h", 1);
  ok(cutFork.msgs[1].alts.length === 2 && cutFork.msgs[1].altIdx === 1 && thread.switchAlt(cutFork.msgs, 1, 0)[1].id === "旧回答" && thread.switchAlt(thread.switchAlt(cutFork.msgs, 1, 0), 1, 1)[1].items.length === 1,
    "按停·掐断：掐的是重新回答出来的那个版本：别的版本照旧翻得到，翻回来还是掐断以后的样子");
}

// ================= 手机这一头：一回传话（src/mail.js） =================
const { createRelay, readNote, openSealed, parseReplyMark, chatTag, resultOk, explainResult } = mailjs;
const vault = await vaultjs.deriveVault("test-passphrase", new Uint8Array(16).fill(7), 1000);
const coded = (code, message, more = {}) => Object.assign(new Error(message || code), { code }, more);
const GOOD = { status: 200, data: { model: "claude-sonnet-4-6", content: [{ type: "text", text: "在呢" }], usage: { input_tokens: 1, output_tokens: 1 } }, used: { cache: true, mcp: false } };
const stamp = () => new Date().toISOString();

// 假的世界：信箱、小后端、手机的眼前和网络
function world({ visible = true } = {}) {
  const w = {
    visible, online: true, table: true, getFails: 0, listFails: 0,
    rows: new Map(), removed: [], sent: [], replies: [], aborted: 0,
    storage: "", vis: new Set(), freshed: 0, synced: 0, answered: false, hint: false,
    backAt: -Infinity, probe: true, probes: 0, knock: ["https://web.push.apple.com/this-device"], hang: "", looks: [],
    removedWorking: [], askedJobs: null, onRemove: null, removeFails: 0, halted: "",
  };
  const never = new Promise(() => {});
  const box = {
    async list() {
      w.looks.push(Date.now());
      if (w.hang === "list") return never;
      if (!w.table) throw coded("notable");
      if (w.listFails > 0) { w.listFails--; throw coded("refused", "TypeError: Failed to fetch"); }
      return [...w.rows.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    },
    async get(job) {
      w.looks.push(Date.now());
      if (w.hang === "get") return never;
      if (!w.table) throw coded("notable");
      if (w.getFails > 0) { w.getFails--; throw coded("refused", "TypeError: Failed to fetch"); }
      const r = w.rows.get(job);
      return r ? { ...r } : null;
    },
    // onlyWorking：只在那一格还写着“在等”的时候删（和真的信箱一样）。回删掉了几行
    async remove(job, onlyWorking) {
      if (w.onRemove) await w.onRemove(job);
      if (w.removeFails > 0) { w.removeFails--; throw coded("refused", "TypeError: Failed to fetch"); }
      if (onlyWorking) {
        w.removedWorking.push(job);
        const r = w.rows.get(job);
        if (r && r.state !== "working") return 0;
      }
      w.removed.push(job);
      return w.rows.delete(job) ? 1 : 0;
    },
  };
  w.relay = createRelay({
    callReply: (payload, opts = {}) => {
      w.sent.push(payload);
      if (opts.signal) opts.signal.addEventListener("abort", () => { w.aborted++; });
      const next = w.replies.shift();
      return next ? next(payload, opts) : new Promise(() => {});
    },
    box,
    seal: (t) => vaultjs.seal(vault, t),
    unseal: (t) => { if (w.onUnseal) w.onUnseal(); return vaultjs.unseal(vault, t); },
    nameFor: (n) => vaultjs.rowKeyFor(vault, n),
    visible: () => w.visible,
    online: () => w.online,
    onVisible: (f) => { w.vis.add(f); return () => w.vis.delete(f); },
    sinceBack: () => Date.now() - w.backAt,
    probe: async () => { w.probes++; if (w.hang === "probe") return never; if (w.probe instanceof Error) throw w.probe; return w.probe; },
    knock: () => w.knock,
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    storage: { get: () => w.storage, set: (t) => { w.storage = t; } },
    hint: { get: () => w.hint, set: (v) => { w.hint = v; } },
    halted: { get: () => (w.haltedBroken ? "" : w.halted), set: (t) => { if (!w.haltedBroken) w.halted = t; } },
    freshToken: async (s) => { w.freshed = s; if (w.hang === "token") return never; },
    // answered 可以是一个函数 (jobs) => 真假：照“同步下来的对话里有没有这几回的回话”来答
    answered: async (chat, last, fork, jobs) => { w.synced++; w.askedJobs = jobs; if (w.hang === "answered") return never; return typeof w.answered === "function" ? w.answered(jobs, fork) : w.answered; },
  });
  // 小后端那头的动静
  w.working = (p, at = stamp()) => w.rows.set(p.job, { job: p.job, state: "working", note: p.note, sealed: null, created_at: at, beat_at: at, done_at: null });
  w.beat = (job) => { const r = w.rows.get(job); if (r) r.beat_at = stamp(); };
  w.done = async (p, result = GOOD) => {
    const old = w.rows.get(p.job);
    const now = stamp();
    w.rows.set(p.job, { job: p.job, state: "done", note: p.note, sealed: await fn.sealWith(new Uint8Array(unb64u(p.key)), JSON.stringify(result)), created_at: old ? old.created_at : now, beat_at: now, done_at: now });
  };
  w.comeBack = () => { w.visible = true; w.backAt = Date.now(); for (const f of [...w.vis]) f(); };
  w.jobs = () => { try { return JSON.parse(w.storage || "[]").map((x) => x.job); } catch (e) { return []; } };
  w.halts = () => { try { return JSON.parse(w.halted || "[]"); } catch (e) { return []; } };
  return w;
}
const ARGS = { body: { model: "claude-sonnet-4-6", max_tokens: 100, messages: [] }, beta: "", chat: "chatA", last: "m7", fork: "", title: "光义", extra: null };
const settled = async (p) => { let out; let done = false; p.then((v) => { out = { v }; done = true; }, (e) => { out = { e }; done = true; }); await until(() => done, 3000); return out || {}; };
// 一边拨钟一边等这个 Promise 落定
const drive = async (p, step = 500, max = 400000) => {
  let out = null;
  p.then((v) => { out = { v }; }, (e) => { out = { e }; });
  for (let t = 0; t < max && !out; t += step) await clock.tick(step);
  await breathe();
  return out || {};
};

// ---- 她在跟前：直接交到 ----
{
  clock.on();
  const w = world();
  const untrusted = w.relay.trusted();
  w.replies.push(async (p) => { await w.done(p); return { type: "reply", job: p.job, result: GOOD }; });
  const got = (await settled(w.relay.ask({ ...ARGS, extra: { withMcp: true, slugs: { s0: "笔记" } } }))).v;
  ok(untrusted === false && w.relay.trusted() === true && w.hint === true && w.probes === 1, "一回传话：这台设备上头一回用，先轻轻问一声新路通不通；通，就记着（她切走的那一下才敢把话交出去）");
  const p = w.sent[0];
  const info = await readNote((t) => vaultjs.unseal(vault, t), p.note, p.job);
  ok(!!got && got.via === "direct" && JSON.stringify(got.data) === JSON.stringify(GOOD.data) && got.used.cache === true && got.job === p.job, "一回传话：她在跟前，回话直接交到手上");
  ok(p.op === "reply" && /^[A-Za-z0-9]{20}$/.test(p.job) && unb64u(p.key).length === 32 && p.title === "光义" && p.knock.join() === "https://web.push.apple.com/this-device" && p.request === ARGS.body && p.tag === (await chatTag((n) => vaultjs.rowKeyFor(vault, n), "chatA")) && /^[A-Za-z0-9_-]{32}$/.test(p.tag) && !p.tag.includes("chatA"),
    "一回传话：寄给小后端的有编号、一次性钥匙、条子、打乱了的对话记号、他的名字、这台设备的门牌号（回话到了敲它）、要转的那一整段");
  ok(!!info && info.job === p.job && info.chat === "chatA" && info.last === "m7" && info.key === p.key && info.extra.slugs.s0 === "笔记" && p.note.startsWith("v1.") && !p.note.includes("chatA") && w.freshed === 240,
    "一回传话：条子是拿存档的钥匙封的（云端看不懂），里面记着是哪一回、哪段对话、接在哪句后面、那把一次性钥匙；发之前先看登录凭证够不够用");
  ok((await readNote((t) => vaultjs.unseal(vault, t), p.note, "anotherJob0000000001")) === null, "一回传话：条子认编号：被人挪到另一格上（换了编号）就不认");
  ok(w.jobs().join() === p.job && w.rows.has(p.job) && w.removed.length === 0, "一回传话：回话还没落进对话之前，信不取走、这一回也还记着");
  await got.settle();
  await got.settle();
  ok(w.jobs().length === 0 && !w.rows.has(p.job) && w.removed.join() === p.job, "一回传话：落进对话以后叫一声 settle：信取走（小后端就不敲手机了），这一回不用再记");
  ok(w.relay.status().last.path === "new" && w.relay.status().last.via === "direct" && !w.relay.status().off, "一回传话：记着上一回是怎么到的（面板的“看细节”要说）");
  // 第二回：已经知道通了，不再问
  w.replies.push(async (p2) => { await w.done(p2); return { type: "reply", job: p2.job, result: GOOD }; });
  const second = (await settled(w.relay.ask({ ...ARGS, last: "m8" }))).v;
  ok(!!second && w.probes === 1 && second.at === 0, "一回传话：知道通了以后不再问；当面交到的不带“几点放进信箱”");

  // 她不在跟前（页面在后台）：信留着，让小后端敲她
  const h = world({ visible: false });
  h.replies.push(async (p2) => { await h.done(p2); return { type: "reply", job: p2.job, result: GOOD }; });
  const got2 = (await settled(h.relay.ask(ARGS))).v;
  await got2.settle();
  ok(h.rows.size === 1 && h.removed.length === 0 && h.jobs().length === 0, "一回传话：回话到的时候开封府不在眼前：信留在信箱里（小后端看它还在，就敲她）");
  clock.off();
}

// ---- 小后端不肯接：走回老路 ----
{
  clock.on();
  for (const [name, err] of [
    ["信箱那张表没建", coded("refused", "库房里还没有信箱", { reason: "no_mailbox" })],
    ["push 函数还是旧的", coded("refused", "不认识这个动作", { reason: "old" })],
    ["没有 push 函数", coded("refused", "push 函数还接不了回话", { reason: "nofn" })],
  ]) {
    const w = world();
    w.hint = true; // 以前走通过
    w.replies.push(async () => { throw err; });
    const out = await settled(w.relay.ask(ARGS));
    const again = await settled(w.relay.ask({ ...ARGS, last: "m8" }));
    ok(out.e && out.e.code === "oldpath" && w.jobs().length === 0 && again.e && again.e.code === "oldpath" && w.sent.length === 1 && w.relay.status().off,
      `走回老路：${name}：这一回没开始办，请走老路；接下来几分钟不再白敲新路的门`);
    ok(w.hint === false && w.relay.trusted() === false, `走回老路：${name}：这台设备不再当新路是通的`);
    await clock.tick(3 * 60 * 1000 + 1000);
    w.replies.push(async (p) => { await w.done(p); return { type: "reply", job: p.job, result: GOOD }; });
    const later = await settled(w.relay.ask({ ...ARGS, last: "m9" }));
    ok(!!later.v && w.sent.length === 2 && !w.relay.status().off, `走回老路：${name}：过了三分钟再试一回新路（她在 Supabase 补好了就接上）`);
  }
  // 这台设备上还不知道通不通：轻轻一问就知道不通（小后端还是旧的、信箱没建），整段对话不往那边寄
  const np = world();
  np.probe = false;
  const out0 = await settled(np.relay.ask(ARGS));
  const out0b = await settled(np.relay.ask({ ...ARGS, last: "m8" }));
  ok(out0.e && out0.e.code === "oldpath" && np.sent.length === 0 && np.probes === 1 && out0b.e && out0b.e.code === "oldpath" && np.relay.status().off && !np.relay.trusted(),
    "还不知道通不通：先轻轻问一声，不通就走老路，那一大包对话不白传；几分钟里也不再问");
  // 她在 Supabase 补好了：过三分钟自己再问一声，问通了，下一句就走新路，切走也敢交
  np.probe = true;
  await clock.tick(3 * 60 * 1000 + 1000);
  await breathe();
  ok(np.probes === 2 && np.relay.trusted(), "不通以后过三分钟：自己再轻轻问一声，通了就记着");
  // 没问成（没网）：这一句走老路，不下“不通”的结论
  const nn = world();
  nn.probe = null;
  const outn = await settled(nn.relay.ask(ARGS));
  ok(outn.e && outn.e.code === "oldpath" && nn.sent.length === 0 && !nn.relay.status().off, "没问成（没网）：这一句走老路（老路也连不上就照实说），不记成“新路不通”");
  nn.probe = new Error("boom");
  ok((await settled(nn.relay.ask(ARGS))).e.code === "oldpath" && !nn.relay.status().off, "问的时候出了错：一样");
  // 开机先问好
  const wm = world();
  const warmed = await wm.relay.warm();
  ok(warmed === true && wm.relay.trusted() && wm.probes === 1 && (await wm.relay.warm()) === true && wm.probes === 1, "开机先问好通不通：头一句话发完就切走，也敢交出去；问过了不再问");
  // 面板那边查到两样都好了：记下，停着的也解开
  const lp = world();
  lp.probe = false;
  await settled(lp.relay.ask(ARGS));
  lp.relay.learn(true);
  lp.replies.push(async (p) => { await lp.done(p); return { type: "reply", job: p.job, result: GOOD }; });
  const learned = await settled(lp.relay.ask(ARGS));
  ok(!!learned.v && lp.sent.length === 1 && lp.relay.trusted(), "面板上刚查到回话那两样都好了：马上走新路，不用等那三分钟、不用重开");

  // 登录过期：不是新路的毛病，照实说
  const a = world();
  a.replies.push(async () => { throw coded("auth", "登录过期了，重新登录一下"); });
  const out = await settled(a.relay.ask(ARGS));
  ok(out.e && !out.e.code && out.e.message.includes("登录过期") && a.jobs().length === 0 && !a.relay.status().off, "登录过期：照实说，不走老路（老路也一样过期）");
  // 条子封不上（记的东西太多）
  const big = world();
  const out2 = await settled(big.relay.ask({ ...ARGS, extra: { slugs: { a: "长".repeat(4000) } } }));
  ok(out2.e && out2.e.code === "oldpath" && big.sent.length === 0, "条子太长封不进去：不发，走老路");
  clock.off();
}

// ---- 直接等的那头断了：去信箱里看 ----
{
  clock.on();
  // 回话其实已经放进信箱了
  const w = world();
  w.replies.push(async (p) => { await w.done(p); throw coded("unreachable", "连不上"); });
  const got = (await drive(w.relay.ask(ARGS))).v;
  ok(!!got && got.via === "mailbox" && got.data.content[0].text === "在呢" && w.sent.length === 1 && w.relay.status().last.via === "mailbox", "断了：回话其实已经在信箱里，取出来就是，不重发");

  // 小后端还在等：守着，等它放进来
  const w2 = world();
  w2.replies.push(async (p) => { w2.working(p); throw coded("unreachable", "连不上"); });
  const pending = w2.relay.ask(ARGS);
  let res2 = null;
  pending.then((v) => { res2 = v; }, (e) => { res2 = { e }; });
  for (let i = 0; i < 20; i++) { await clock.tick(2000); if (i % 3 === 2) w2.beat(w2.sent[0].job); }
  ok(res2 === null && w2.sent.length === 1, "断了、小后端还在等：守着信箱（那一格隔几秒被摸一下，就是还活着），四十秒了也不重发");
  await w2.done(w2.sent[0]);
  await clock.tick(2500);
  ok(!!res2 && res2.via === "mailbox" && w2.sent.length === 1, "断了、小后端还在等：回话一放进来就取到");

  // 小后端那头也断了（那一格再没人摸）
  const w3 = world();
  w3.replies.push(async (p) => { w3.working(p); throw coded("unreachable", "连不上"); });
  const t0 = Date.now();
  const out3 = await drive(w3.relay.ask(ARGS), 1000);
  ok(out3.e && out3.e.message.includes("那边断了") && Date.now() - t0 >= 25000 && Date.now() - t0 < 32000 && w3.rows.size === 0 && w3.jobs().length === 0 && w3.sent.length === 1,
    `断了、小后端那头也断了：那一格二十五秒没人摸，就不等了（等了 ${Math.round((Date.now() - t0) / 1000)} 秒），照实说没回成；那一格收掉（真删掉了），下回重发是新的一回`);
  // 她点重发：马上就是新的一回（不用再去找那一回）
  w3.replies.push(async (p) => { await w3.done(p); return { type: "reply", job: p.job, result: GOOD }; });
  const tr3 = Date.now();
  const re3 = await drive(w3.relay.ask(ARGS), 100);
  ok(!!re3.v && re3.v.via === "direct" && w3.sent.length === 2 && re3.v.job === w3.sent[1].job && w3.jobs().join() === w3.sent[1].job && Date.now() - tr3 < 500,
    "断了以后她点重发：马上发新的一回，不耽搁");
  // 收的那一下没连上（那一格多半还在）：和从前一样，这一回不再记着，重发是新的一回（不为它再等二十五秒）
  const w3b = world();
  w3b.replies.push(async (p) => { w3b.working(p); throw coded("unreachable", "连不上"); });
  w3b.removeFails = 1;
  const out3b = await drive(w3b.relay.ask(ARGS), 1000);
  w3b.replies.push(async (p) => { await w3b.done(p); return { type: "reply", job: p.job, result: GOOD }; });
  const tr3b = Date.now();
  const re3b = await drive(w3b.relay.ask(ARGS), 100);
  ok(out3b.e && out3b.e.message.includes("那边断了") && w3b.rows.has(w3b.sent[0].job) && !!re3b.v && w3b.sent.length === 2 && Date.now() - tr3b < 500,
    "断了、收那一格的那一下没连上：这一回不再记着，她点重发马上发新的一回");

  // 手机的钟不准也不碍事：那一格上写的时间比手机的钟早十分钟，照样靠“变没变”认活着
  const w4 = world();
  w4.replies.push(async (p) => { w4.working(p, new Date(Date.now() - 10 * 60 * 1000).toISOString()); throw coded("unreachable", "连不上"); });
  let res4 = null;
  const p4 = w4.relay.ask(ARGS);
  p4.then((v) => { res4 = v; }, (e) => { res4 = { e }; });
  for (let i = 0; i < 10; i++) { await clock.tick(2000); const r = w4.rows.get(w4.sent[0].job); if (r) r.beat_at = new Date(Date.now() - 10 * 60 * 1000 + i).toISOString(); }
  const alive4 = res4 === null;
  await w4.done(w4.sent[0]);
  await clock.tick(2500);
  ok(alive4 && !!res4 && res4.via === "mailbox", "断了：手机的钟和云端差十分钟也不碍事（只看那一格上的时间变没变，不拿两边的钟比）");

  // 手机的钟快了、慢了一个钟头：一样不碍事（那一格上写的时间和手机的钟差多少都不看）
  for (const skew of [60 * 60 * 1000, -60 * 60 * 1000]) {
    const w5 = world();
    const at = () => new Date(Date.now() - skew).toISOString();
    w5.replies.push(async (p) => { w5.working(p, at()); throw coded("unreachable", "连不上"); });
    let res5 = null;
    w5.relay.ask(ARGS).then((v) => { res5 = v; }, (e) => { res5 = { e }; });
    for (let i = 0; i < 20; i++) { await clock.tick(2000); const r = w5.rows.get(w5.sent[0].job); if (r && i % 3 === 2) r.beat_at = at(); }
    const alive5 = res5 === null;
    const p5 = w5.sent[0];
    w5.rows.set(p5.job, { ...w5.rows.get(p5.job), state: "done", sealed: await fn.sealWith(new Uint8Array(unb64u(p5.key)), JSON.stringify(GOOD)), done_at: at(), beat_at: at() });
    await clock.tick(2500);
    ok(alive5 && !!res5 && res5.via === "mailbox" && w5.sent.length === 1, `断了：手机的钟${skew > 0 ? "快" : "慢"}了一个钟头，他想了四十秒，照样守到了（没有因为“看着像放了很久”就不等）`);
  }
  // 钟差一个钟头、小后端真断了：照样二十五秒认出来
  const w6 = world();
  w6.replies.push(async (p) => { w6.working(p, new Date(Date.now() - 60 * 60 * 1000).toISOString()); throw coded("unreachable", "连不上"); });
  const t6 = Date.now();
  const out6 = await drive(w6.relay.ask(ARGS), 1000);
  ok(out6.e && out6.e.message.includes("那边断了") && Date.now() - t6 >= 25000 && Date.now() - t6 < 32000, "断了：钟差一个钟头、那一格真没人摸了：照样二十五秒认出来");
  clock.off();
}

// ---- 直接等的那头断了，信箱里也没有这一回 ----
{
  clock.on();
  // 话根本没送到小后端：原样再发一回
  const w = world();
  w.replies.push(async () => { throw coded("unreachable", "连不上"); });
  w.replies.push(async (p) => { await w.done(p); return { type: "reply", job: p.job, result: GOOD }; });
  const out = await drive(w.relay.ask(ARGS));
  ok(!!out.v && w.sent.length === 2 && w.sent[0].job !== w.sent[1].job && w.sent[0].key !== w.sent[1].key && w.jobs().join() === w.sent[1].job && w.synced === 1,
    "没送到：信箱里等了一下还是没有这一回，说明小后端根本没收到：换个编号、换把钥匙再发一回（先看过不是别的设备取走的）");

  // 再发还是送不到，信箱却一直看得到：不是没网，是小后端那条路不通（比如根本没有 push 这个函数）。走回老路
  const w2 = world();
  w2.replies.push(async () => { throw coded("unreachable", "连不上"); }, async () => { throw coded("unreachable", "连不上"); });
  const out2 = await drive(w2.relay.ask(ARGS));
  const next2 = await settled(w2.relay.ask({ ...ARGS, last: "m8" }));
  ok(out2.e && out2.e.code === "oldpath" && w2.sent.length === 2 && w2.jobs().length === 0 && w2.relay.status().off && next2.e && next2.e.code === "oldpath" && w2.sent.length === 2,
    "没送到：再发还是送不到、信箱却看得到：是小后端那条路不通，走回老路（一共只发两回；接下来几分钟不再试）");

  // 刚断的那一下，小后端正要开那一格：等一秒半再看，看到了就守着，不重发
  const w3 = world();
  w3.replies.push(async (p) => { realTimeout(() => {}, 0); setTimeout(() => w3.working(p), 800); throw coded("unreachable", "连不上"); });
  const p3 = w3.relay.ask(ARGS);
  let res3 = null;
  p3.then((v) => { res3 = v; }, (e) => { res3 = { e }; });
  await until(() => w3.sent.length === 1);
  await breathe();
  await clock.tick(200); // 让过那一百五十毫秒，头一眼：还没有
  const firstLook = w3.looks.length;
  await clock.tick(800); // 八百毫秒的时候那一格开出来了
  await clock.tick(1000); // 一秒半以后再看的那一眼：有了
  await w3.done(w3.sent[0]);
  await clock.tick(2500);
  ok(firstLook === 1 && !!res3 && res3.via === "mailbox" && w3.sent.length === 1, "没送到？刚断的那一下信箱里还没有，过一秒半有了：守着它，不重发");

  // 别的设备已经把信取走、放进对话了
  const w4 = world();
  w4.answered = true;
  w4.replies.push(async () => { throw coded("unreachable", "连不上"); });
  const out4 = await drive(w4.relay.ask(ARGS));
  ok(out4.e && out4.e.code === "answered" && w4.sent.length === 1, "信箱里没有这一回，是别的设备取走了（同步下来的对话里已经有回话）：不重发");

  // 小后端回了一句读不懂的（崩了、超时）：信箱里有就守着，没有就走老路
  const w5 = world();
  w5.replies.push(async (p) => { w5.working(p); setTimeout(() => w5.done(p), 3000); throw coded("gateway", "小后端出错了（546）"); });
  const out5 = await drive(w5.relay.ask(ARGS));
  ok(!!out5.v && out5.v.via === "mailbox" && w5.sent.length === 1, "小后端回了一句读不懂的，信箱里却有这一回：守着取");
  const w6 = world();
  w6.replies.push(async () => { throw coded("gateway", "小后端出错了（500）"); });
  const out6 = await drive(w6.relay.ask(ARGS));
  ok(out6.e && out6.e.code === "oldpath" && w6.sent.length === 1 && w6.relay.status().off, "小后端回了一句读不懂的，信箱里也没有这一回：它没办起来，走老路");

  // 信箱那张表都没有（断了以后才发现）：当然没有这一回
  const w7 = world();
  w7.replies.push(async () => { w7.table = false; throw coded("gateway", "小后端出错了（500）"); });
  const out7 = await drive(w7.relay.ask(ARGS));
  ok(out7.e && out7.e.code === "oldpath", "断了以后去看，信箱那张表都没有：走老路");
  clock.off();
}

// ---- 去信箱里看也连不上：这一回先记着，回头接着等，不重发 ----
{
  clock.on();
  const w = world();
  w.replies.push(async (p) => { w.working(p); w.getFails = 99; throw coded("unreachable", "连不上"); });
  const t0 = Date.now();
  const out = await drive(w.relay.ask(ARGS), 100);
  const job = w.sent[0].job;
  ok(out.e && out.e.code === "offline" && out.e.message.includes("连不上开封府的后端") && w.jobs().join() === job && Date.now() - t0 < 1000 && w.getFails === 98, "话没连上、信箱也没看成（真没网）：看一眼就照实说连不上，不让她对着“正在输入”干等；这一回还记着（它多半还在办）");
  // 她点“重发”：网络好了，那一回的回话已经在信箱里：取它，不花第二回钱
  w.getFails = 0;
  await w.done(w.sent[0]);
  const again = await drive(w.relay.ask(ARGS));
  ok(!!again.v && again.v.job === job && again.v.via === "mailbox" && w.sent.length === 1, "她点重发：上一回为这句话发出去的还记着，先去信箱里看，取到了它的回话，没有重发");
  await again.v.settle();
  ok(w.jobs().length === 0 && w.rows.size === 0, "取到以后：信取走，这一回不用再记");

  // 刚回到眼前的那一阵：网络还没醒，信箱一时没看成不算数，多试几回
  const wb = world();
  wb.replies.push(async (p) => { await wb.done(p); wb.getFails = 2; wb.backAt = Date.now(); throw coded("unreachable", "连不上"); });
  const tb = Date.now();
  const outb = await drive(wb.relay.ask(ARGS), 200);
  ok(!!outb.v && outb.v.via === "mailbox" && wb.getFails === 0 && Date.now() - tb >= 2400 && wb.looks[0] - tb >= 500, `刚回到眼前：歇半秒再敲网络的门；头两眼没看成也不算数，第三眼取到了（${Date.now() - tb} 毫秒）`);
  const wc = world();
  wc.replies.push(async (p) => { wc.working(p); wc.getFails = 99; wc.backAt = Date.now(); throw coded("unreachable", "连不上"); });
  const outc = await drive(wc.relay.ask(ARGS), 200);
  ok(outc.e && outc.e.message.includes("连不上") && wc.getFails === 95, "刚回到眼前：试四眼都没看成，才照实说连不上");
  // 看信箱那一下悬着不应：八秒算没看成，不会一直挂着
  const wh = world();
  wh.replies.push(async (p) => { await wh.done(p); wh.hang = "get"; throw coded("unreachable", "连不上"); });
  const th = Date.now();
  const outh = await drive(wh.relay.ask(ARGS), 500);
  ok(outh.e && outh.e.message.includes("连不上") && Date.now() - th >= 8000 && Date.now() - th < 10000 && wh.jobs().length === 1, `看信箱那一下悬着不应：等八秒算没看成（${Date.now() - th} 毫秒），照实说，这一回还记着`);
  wh.hang = "";
  const outh2 = await drive(wh.relay.ask(ARGS));
  ok(!!outh2.v && wh.sent.length === 1, "悬过以后她点重发：取到了那一回的回话，没有重发");

  // 新路这会儿停着，也先找回记着的那一回：不走老路再问一遍
  const wo = world();
  wo.replies.push(async (p) => { wo.working(p); wo.getFails = 99; throw coded("unreachable", "连不上"); });
  await drive(wo.relay.ask(ARGS));
  wo.getFails = 0;
  wo.replies.push(async () => { throw coded("refused", "库房里还没有信箱", { reason: "no_mailbox" }); });
  const tripped = await drive(wo.relay.ask({ ...ARGS, last: "m8" }));
  await wo.done(wo.sent[0]);
  const found = await drive(wo.relay.ask(ARGS));
  ok(tripped.e && tripped.e.code === "oldpath" && wo.relay.status().off && !!found.v && found.v.job === wo.sent[0].job && wo.sent.length === 2,
    "新路这会儿停着：为这句话发出去的那一回还记着，照样先去信箱里取它，不走老路再问一遍");
  ok(wo.hint === true && wo.relay.status().off && wo.relay.trusted() === false, "新路这会儿停着：哪怕刚从信箱里取到过一回（记号又写上了“通”），她切走的那一下也不抢着交（停着的这几分钟不算通）");

  // 换了一句话（她又说了一句）：那是新的一回
  const w2 = world();
  w2.replies.push(async (p) => { w2.working(p); w2.getFails = 99; throw coded("unreachable", "连不上"); });
  await drive(w2.relay.ask(ARGS));
  w2.getFails = 0;
  w2.replies.push(async (p) => { await w2.done(p); return { type: "reply", job: p.job, result: GOOD }; });
  const other = await drive(w2.relay.ask({ ...ARGS, last: "m8" }));
  ok(!!other.v && w2.sent.length === 2 && other.v.job === w2.sent[1].job, "她又说了一句（接在另一句后面）：这是新的一回，照常发");

  // 手机说没网：不用一回一回试
  const w3 = world();
  w3.replies.push(async (p) => { w3.working(p); w3.getFails = 99; w3.online = false; throw coded("unreachable", "连不上"); });
  const t1 = Date.now();
  const out3 = await drive(w3.relay.ask(ARGS), 100);
  ok(out3.e && out3.e.message.includes("连不上") && Date.now() - t1 < 1000 && w3.getFails === 98, "手机自己说没网：马上照实说，不白等");

  // 隔了很久才点重发：那一回的回话还在信箱里，照样取它；信箱里已经没有它了，才发新的一回
  const w4 = world();
  w4.replies.push(async (p) => { w4.working(p); w4.getFails = 99; throw coded("unreachable", "连不上"); });
  await drive(w4.relay.ask(ARGS));
  await clock.tick(40 * 60 * 1000);
  w4.getFails = 0;
  await w4.done(w4.sent[0]);
  const late = await drive(w4.relay.ask(ARGS));
  ok(!!late.v && late.v.job === w4.sent[0].job && w4.sent.length === 1, "隔了四十分钟才点重发：那一回的回话还在信箱里，取它，不重发");
  const w4b = world();
  w4b.replies.push(async (p) => { w4b.working(p); w4b.getFails = 99; throw coded("unreachable", "连不上"); });
  await drive(w4b.relay.ask(ARGS));
  w4b.getFails = 0;
  w4b.rows.clear();
  w4b.replies.push(async (p) => { await w4b.done(p); return { type: "reply", job: p.job, result: GOOD }; });
  const fresh = await drive(w4b.relay.ask(ARGS));
  ok(!!fresh.v && w4b.sent.length === 2 && w4b.jobs().join() === w4b.sent[1].job, "记着的那一回信箱里已经没有了：划掉它，发新的一回");
  // 记的回数有上限：新的挤掉旧的
  const w4c = world();
  for (let i = 0; i < 10; i++) {
    w4c.replies.push(async (p) => { w4c.working(p); w4c.getFails = 99; throw coded("unreachable", "连不上"); });
    await drive(w4c.relay.ask({ ...ARGS, last: "m" + i }));
    w4c.getFails = 0;
  }
  ok(w4c.jobs().length === 8 && w4c.jobs().join() === w4c.sent.slice(2).map((p) => p.job).join(), "发出去没着落的最多记八回，新的挤掉旧的");
  clock.off();
}

// ---- 切走又回来、等得久了：直接等的那头没动静，自己去信箱里看 ----
{
  clock.on();
  const w = world();
  w.replies.push((p) => { w.first = p; return new Promise(() => {}); }); // 一直不回话，也不报错（手机被挂起以后常这样）
  const p1 = w.relay.ask(ARGS);
  let res = null;
  p1.then((v) => { res = v; }, (e) => { res = { e }; });
  await until(() => w.sent.length === 1);
  w.visible = false;
  await w.done(w.sent[0]);
  await clock.tick(20000);
  const before = res;
  const tBack = Date.now();
  w.looks.length = 0;
  w.comeBack();
  await breathe();
  await clock.tick(300);
  const tooSoon = w.looks.length;
  await clock.tick(300);
  ok(before === null && tooSoon === 0 && w.looks.length === 1 && w.looks[0] - tBack >= 500 && !!res && res.via === "mailbox" && w.aborted === 1 && w.sent.length === 1,
    "切走又回来：直接等的那头还悬着，回来歇半秒就去信箱里看，取到了；悬着的那头掐掉");

  // 回来的时候他还没回完、直接等的那头悬着：往后每两秒看一眼信箱，回话一放进来就取到
  const w5 = world();
  w5.replies.push((p) => { w5.working(p); return new Promise(() => {}); });
  const p5 = w5.relay.ask(ARGS);
  let res5 = null;
  p5.then((v) => { res5 = v; }, (e) => { res5 = { e }; });
  await until(() => w5.sent.length === 1);
  await clock.tick(5000);
  w5.visible = false;
  w5.comeBack();
  await breathe();
  for (let i = 0; i < 6; i++) { await clock.tick(2000); w5.beat(w5.sent[0].job); }
  const still = res5;
  await w5.done(w5.sent[0]);
  await clock.tick(2100);
  ok(still === null && !!res5 && res5.via === "mailbox" && w5.sent.length === 1, "切走又回来、他还没回完：往后每两秒看一眼信箱（不再干等那头悬着的），回话放进来两秒内取到");

  // 刚回来的那一下网络还没醒，信箱没看成：过一秒再看
  const w6 = world();
  w6.replies.push(() => new Promise(() => {}));
  const p6 = w6.relay.ask(ARGS);
  let res6 = null;
  p6.then((v) => { res6 = v; }, (e) => { res6 = { e }; });
  await until(() => w6.sent.length === 1);
  await w6.done(w6.sent[0]);
  w6.getFails = 1;
  w6.comeBack();
  await breathe();
  await clock.tick(600);
  const missed = res6;
  const failedLooks = w6.getFails;
  await clock.tick(1100);
  ok(missed === null && failedLooks === 0 && !!res6 && res6.via === "mailbox", "刚回来网络还没醒、头一眼没看成：过一秒再看，取到了");

  // 手机被挂起十分钟才回来，刚回来那几秒网络还没醒：不能因为“已经过了十分钟”就说等太久，回话明明在信箱里
  const w7 = world();
  w7.replies.push(() => new Promise(() => {}));
  const p7 = w7.relay.ask(ARGS);
  let res7 = null;
  p7.then((v) => { res7 = v; }, (e) => { res7 = { e }; });
  await until(() => w7.sent.length === 1);
  await w7.done(w7.sent[0]);
  w7.visible = false;
  mock.timers.setTime(Date.now() + 10 * 60 * 1000); // 挂起：钟走了十分钟，页面里的定时器一下没走
  w7.getFails = 5;
  w7.comeBack();
  await breathe();
  for (let i = 0; i < 30 && !res7; i++) await clock.tick(500);
  ok(!!res7 && res7.via === "mailbox" && w7.getFails === 0 && w7.sent.length === 1, `挂起十分钟才回来、头几眼信箱没看成：不说“等了太久”，网络醒了就取到（${res7 && res7.e ? res7.e.message : "取到了"}）`);
  // 回来以后他还没回完：等多久从回来那一刻重新算（挂起的那段不算）
  const w8 = world();
  w8.replies.push((p) => { w8.working(p); return new Promise(() => {}); });
  const p8 = w8.relay.ask(ARGS);
  let res8 = null;
  p8.then((v) => { res8 = v; }, (e) => { res8 = { e }; });
  await until(() => w8.sent.length === 1);
  w8.visible = false;
  mock.timers.setTime(Date.now() + 10 * 60 * 1000);
  w8.comeBack();
  await breathe();
  for (let i = 0; i < 5; i++) { await clock.tick(2000); w8.beat(w8.sent[0].job); }
  const waiting8 = res8;
  await w8.done(w8.sent[0]);
  await clock.tick(2500);
  ok(waiting8 === null && !!res8 && res8.via === "mailbox", "挂起十分钟才回来、他还在回：接着等，不说“等了太久”");

  // 一直在眼前、直接等的那头悬着：四十五秒去看一眼，之后每十五秒
  const w2 = world();
  w2.replies.push(() => new Promise(() => {}));
  const p2 = w2.relay.ask(ARGS);
  let res2 = null;
  p2.then((v) => { res2 = v; }, (e) => { res2 = { e }; });
  await until(() => w2.sent.length === 1);
  await w2.done(w2.sent[0]);
  await clock.tick(44000);
  const at44 = res2;
  await clock.tick(2000);
  ok(at44 === null && !!res2 && res2.via === "mailbox", "等得久了：直接等了四十五秒没动静，去信箱里看一眼，回话其实早到了");

  // 悬着、小后端那头也断了
  const w3 = world();
  w3.replies.push((p) => { w3.working(p); return new Promise(() => {}); });
  const t0 = Date.now();
  const out3 = await drive(w3.relay.ask(ARGS), 1000);
  ok(out3.e && out3.e.message.includes("那边断了") && Date.now() - t0 <= 91000 && w3.aborted === 1 && w3.rows.size === 0, `等得久了：信箱里那一格也没人摸了，就不等了（${Math.round((Date.now() - t0) / 1000)} 秒）`);

  // 怎么都没动静：最多等四分多钟
  const w4 = world();
  w4.replies.push(() => new Promise(() => {}));
  const t1 = Date.now();
  const out4 = await drive(w4.relay.ask(ARGS), 5000);
  ok(out4.e && out4.e.message.includes("等了太久") && Date.now() - t1 < 300000 && w4.jobs().length === 1, `怎么都没动静：最多等四分多钟（${Math.round((Date.now() - t1) / 1000)} 秒）就照实说；这一回还记着，她点重发先去信箱里看`);
  clock.off();
}

// ---- 没回成的那一回 ----
{
  clock.on();
  const BAD = { status: 529, data: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, used: { cache: false, mcp: false } };
  const w = world();
  w.replies.push(async (p) => { await w.done(p, BAD); return { type: "reply", job: p.job, result: BAD }; });
  const out = await settled(w.relay.ask(ARGS));
  await breathe();
  ok(out.e && !out.e.code && out.e.message.includes("太挤") && w.rows.size === 0 && w.jobs().length === 0, "没回成：说成和老路上一样的人话；她在跟前，信箱里那一格收掉（不敲手机）、这一回不再记");
  const h = world({ visible: false });
  h.replies.push(async (p) => { await h.done(p, BAD); return { type: "reply", job: p.job, result: BAD }; });
  const out2 = await settled(h.relay.ask(ARGS));
  await breathe();
  ok(out2.e && h.rows.size === 1 && h.jobs().length === 0, "没回成、她不在跟前：那一格留着（小后端会敲她一下说没送到）");
  ok(resultOk(GOOD) && !resultOk(BAD) && !resultOk(null) && !resultOk({ status: 200, data: { type: "error", error: {} } }) && !resultOk({ status: 200, data: null }) && explainResult({ status: 502, data: { type: "error", error: { type: "kaifengfu", message: "连不上 Anthropic" } } }) === "连不上 Anthropic" && explainResult({ status: 500, data: null }) === "出错了（500）",
    "没回成：认得出各种没回成的样子，都说得成一句话");
  clock.off();
}

// ---- 看信箱（collect）、接着守（resume） ----
{
  clock.on();
  const w = world();
  const note = async (info) => vaultjs.seal(vault, JSON.stringify(info));
  const k1 = b64u(crypto.randomBytes(32));
  const k2 = b64u(crypto.randomBytes(32));
  const info1 = { v: 1, job: "jobDONE0001", chat: "A", last: "m1", key: k1, at: 1 };
  const info2 = { v: 1, job: "jobWORK0001", chat: "B", last: "m2", key: k2, at: 2 };
  const t = (ms) => new Date(Date.now() - ms).toISOString();
  w.rows.set("jobDONE0001", { job: "jobDONE0001", state: "done", note: await note(info1), sealed: await fn.sealWith(new Uint8Array(unb64u(k1)), JSON.stringify(GOOD)), created_at: t(60000), beat_at: t(50000), done_at: t(50000) });
  w.rows.set("jobWORK0001", { job: "jobWORK0001", state: "working", note: await note(info2), sealed: null, created_at: t(5000), beat_at: t(5000), done_at: null });
  w.rows.set("jobSTALE001", { job: "jobSTALE001", state: "working", note: await note({ ...info2, job: "jobSTALE001" }), sealed: null, created_at: t(20 * 60000), beat_at: t(20 * 60000), done_at: null });
  w.rows.set("jobMOVED001", { job: "jobMOVED001", state: "done", note: await note(info1), sealed: await fn.sealWith(new Uint8Array(unb64u(k1)), JSON.stringify(GOOD)), created_at: t(800), beat_at: t(800), done_at: t(800) });
  w.rows.set("jobALIEN001", { job: "jobALIEN001", state: "done", note: "v1.AAAA.BBBB", sealed: "v1.AAAA.BBBB", created_at: t(1000), beat_at: t(1000), done_at: t(1000) });
  w.rows.set("jobBROKEN01", { job: "jobBROKEN01", state: "done", note: await note({ ...info1, job: "jobBROKEN01" }), sealed: "v1.AAAA.BBBB", created_at: t(900), beat_at: t(900), done_at: t(900) });
  const list = await w.relay.collect();
  const by = Object.fromEntries(list.map((m) => [m.job, m]));
  ok(list.length === 6 && by.jobDONE0001.state === "done" && by.jobDONE0001.result.data.content[0].text === "在呢" && by.jobDONE0001.info.chat === "A" && by.jobWORK0001.state === "working" && by.jobSTALE001.state === "working" && by.jobALIEN001.state === "unreadable" && by.jobBROKEN01.state === "unreadable" && w.removed.length === 0,
    "看信箱：到了的打开；还在等的（哪怕那一格上写的时间看着很旧：手机的钟不一定准）先当它活着；打不开的认得出；只看不动");
  ok(by.jobMOVED001.state === "unreadable", "看信箱：条子是从别的格子上挪过来的（编号对不上）：不认");
  ok(list[0].job === "jobSTALE001" && list[1].job === "jobDONE0001", "看信箱：放得早的排前面");
  // 还在等的那两格一直没人摸：过二十五秒算断了
  await clock.tick(26000);
  const list2 = await w.relay.collect();
  ok(list2.find((m) => m.job === "jobWORK0001").state === "dead" && list2.find((m) => m.job === "jobSTALE001").state === "dead", "看信箱：还在等的那一格二十五秒没人摸，下一遍看就算断了");
  await w.relay.discard("jobSTALE001");
  ok(!w.rows.has("jobSTALE001"), "看信箱：收掉一格");

  // 有人守着的那一回，collect 不碰
  const w2 = world();
  w2.replies.push((p) => { w2.working(p); return new Promise(() => {}); });
  const p2 = w2.relay.ask(ARGS);
  p2.catch(() => {});
  await until(() => w2.sent.length === 1);
  const mid = await w2.relay.collect();
  ok(mid.length === 0 && w2.relay.isLive(w2.sent[0].job), "看信箱：正有人守着的那一回不在里面（免得两头各放一遍）");

  // 没看成（没网）回 null：外头过一会儿再来；信箱那张表还没建：回空的，没什么可取的，也不用再来
  const w3 = world();
  w3.listFails = 1;
  const none = await w3.relay.collect();
  w3.table = false;
  const noTable = await w3.relay.collect();
  ok(none === null && Array.isArray(noTable) && noTable.length === 0, "看信箱：这一遍没看成（没网）说没看成，外头好过一会儿再来；信箱那张表还没建，就是没有信");
  // 看的那一下悬着不应：八秒算没看成，下一遍照常能看
  const w3b = world();
  w3b.hang = "list";
  const hung = await drive(w3b.relay.collect(), 500, 12000);
  w3b.hang = "";
  ok(hung.v === null && Array.isArray(await w3b.relay.collect()), "看信箱：那一下悬着不应，八秒算没看成；不会把后面的都堵住");
  // 刚回到眼前：歇半秒再看
  const w3c = world();
  w3c.backAt = Date.now();
  const t3 = Date.now();
  await drive(w3c.relay.collect(), 100, 2000);
  ok(w3c.looks.length === 1 && w3c.looks[0] - t3 >= 500, "看信箱：刚回到眼前，歇半秒再敲网络的门");

  // 接着守上次打开时发出去的那一回
  const w4 = world();
  const k4 = b64u(crypto.randomBytes(32));
  const info4 = { v: 1, job: "jobRESUME01", chat: "A", last: "m1", key: k4, at: 1, extra: { withMcp: true, slugs: { s0: "笔记" } } };
  const p4 = { job: "jobRESUME01", key: k4, note: await note(info4) };
  w4.working(p4);
  const r4 = w4.relay.resume("jobRESUME01", info4);
  let res4 = null;
  r4.then((v) => { res4 = v; }, (e) => { res4 = { e }; });
  await clock.tick(2000);
  const liveNow = w4.relay.isLive("jobRESUME01") && (await w4.relay.collect()).length === 0;
  await w4.done(p4);
  await clock.tick(2500);
  ok(w4.hint === true && w4.probes === 0, "接着守：取到了，这台设备就知道新路是通的（不用再问一声）");
  ok(liveNow && !!res4 && res4.via === "mailbox" && res4.info.extra.slugs.s0 === "笔记" && !w4.relay.isLive("jobRESUME01") && res4.at === Date.parse(w4.rows.get("jobRESUME01").done_at),
    "接着守：上次打开时发出去的那一回，守到回话放进来；条子里记的东西（接了哪些工具）原样带回来；带着小后端放进信箱的时间");
  // 守着守着信没了：是别的设备（发话的那台）取走了。等它把对话传上来，同步下来一看有回话了，就不报错
  const w5 = world();
  w5.working({ job: "jobRESUME01", key: k4, note: p4.note });
  let res5 = null;
  w5.relay.resume("jobRESUME01", info4).then((v) => { res5 = v; }, (e) => { res5 = { e }; });
  await clock.tick(2000);
  w5.rows.clear();
  let arrived5 = false;
  w5.answered = (jobs) => arrived5 && jobs.length === 1 && jobs[0] === "jobRESUME01"; // 认的是“对话里有这一回的回话”
  for (let i = 0; i < 40 && w5.synced < 1; i++) await clock.tick(500);
  const before5 = res5;
  arrived5 = true; // 那台设备的对话这时候才传上来
  for (let i = 0; i < 20 && !res5; i++) await clock.tick(500);
  ok(before5 === null && res5 && res5.e && res5.e.code === "answered" && w5.synced === 2 && w5.askedJobs.join() === "jobRESUME01" && w5.jobs().length === 0,
    "接着守：信箱里那一格没了，是别的设备取走了：带着这一回的编号去问，头一眼对话还没同步到，隔两秒再看就有了，不说“那边断了”");
  // 真没了（等了几眼对话里也没有回话）：照实说没回成
  const w5b = world();
  const out5 = await drive(w5b.relay.resume("jobNOWHERE1", { ...info4, job: "jobNOWHERE1" }));
  ok(out5.e && !out5.e.code && out5.e.message.includes("那边断了") && w5b.synced === 4 && w5b.jobs().length === 0, "接着守：信箱里根本没有这一回，隔两秒看一回、看了四回对话里也没有回话：照实说没回成，这一回不再记着");
  // 没带条子去守：自己从那一格上拆
  const w6 = world();
  await w6.done(p4);
  const out6 = await drive(w6.relay.resume("jobRESUME01", null));
  ok(!!out6.v && out6.v.info.chat === "A", "接着守：没带条子也行，从那一格上拆");
  clock.off();
}

// ---- 第二遍审出来的那几处 ----
{
  clock.on();
  const fine = (w) => async (p) => { await w.done(p); return { type: "reply", job: p.job, result: GOOD }; };

  // 重新回答：信箱里没有这一回了，是别的设备取走、放进对话的。那一句后面本来就有回话，只能靠编号认
  const f = world();
  f.hint = true;
  f.answered = (jobs) => jobs.length === 1 && jobs[0] === f.sent[0].job; // 同步下来的对话里有这一回的回话
  f.replies.push(async () => { throw coded("unreachable", "连不上"); });
  const outF = await drive(f.relay.ask({ ...ARGS, fork: "oldReply" }), 200);
  ok(outF.e && outF.e.code === "answered" && f.sent.length === 1 && f.askedJobs.join() === f.sent[0].job, "重新回答、信箱里没有这一回了：带着这一回的编号去问别处回上了没有，回上了就不重发（不花第二回钱，也不盖掉她已经看到的那个版本）");
  // 为这句话记着的上一回，信箱里没有了、别处回上了：不重发
  const wa = world();
  wa.hint = true;
  wa.replies.push(async (p) => { wa.working(p); wa.getFails = 99; throw coded("unreachable", "连不上"); });
  await drive(wa.relay.ask(ARGS), 100);
  wa.getFails = 0;
  wa.rows.clear();
  wa.answered = true;
  const outA = await drive(wa.relay.ask(ARGS), 200);
  ok(outA.e && outA.e.code === "answered" && wa.sent.length === 1 && wa.jobs().length === 0 && wa.askedJobs.join() === wa.sent[0].job, "她点重发、记着的那一回信箱里已经没有了、别处已经回上了：不重发");

  // 她点“重发”、这台设备不记得为这句话发过哪一回（多半是别的设备发的）：先同步看一眼
  const r1 = world();
  r1.hint = true;
  r1.answered = true;
  const outR1 = await drive(r1.relay.ask({ ...ARGS, recheck: true }), 200);
  const r2 = world();
  r2.hint = true;
  r2.replies.push(fine(r2));
  const outR2 = await drive(r2.relay.ask({ ...ARGS, recheck: true }), 200);
  const r3 = world();
  r3.hint = true;
  r3.replies.push(fine(r3));
  const outR3 = await drive(r3.relay.ask(ARGS), 200);
  ok(outR1.e && outR1.e.code === "answered" && r1.sent.length === 0 && r1.synced === 1 && r1.askedJobs.length === 0, "她点重发、这台设备不记得发过：先同步看一眼，别处已经回上了就不发");
  ok(!!outR2.v && r2.synced === 1 && r2.sent.length === 1 && !!outR3.v && r3.synced === 0, "她点重发、别处没回上：照常发；平常发话不多问这一句（不拖慢每一句话）");
  const r4 = world();
  r4.hint = true;
  r4.hang = "answered";
  r4.replies.push(fine(r4));
  const t4 = Date.now();
  const outR4 = await drive(r4.relay.ask({ ...ARGS, recheck: true }), 200);
  ok(!!outR4.v && Date.now() - t4 >= 3000 && Date.now() - t4 < 4000, `她点重发、那一眼悬着不应：等三秒就照常发（${Date.now() - t4} 毫秒）`);

  // 问一声、换登录凭证悬着不应：都有时限，不让她那句话卡在这儿
  const pb = world();
  pb.hang = "probe";
  const tp = Date.now();
  const outP = await drive(pb.relay.ask(ARGS), 500);
  ok(outP.e && outP.e.code === "oldpath" && pb.sent.length === 0 && Date.now() - tp >= 8000 && Date.now() - tp < 9500 && !pb.relay.status().off, `问新路通不通的那一声悬着不应：八秒当没问成，这一句走老路（${Date.now() - tp} 毫秒）`);
  const tk = world();
  tk.hint = true;
  tk.hang = "token";
  tk.replies.push(fine(tk));
  const tt = Date.now();
  const outT = await drive(tk.relay.ask(ARGS), 200);
  ok(!!outT.v && Date.now() - tt >= 4000 && Date.now() - tt < 5000, `换登录凭证悬着不应：等四秒照常发（${Date.now() - tt} 毫秒）`);
  const sh = world();
  sh.hint = true;
  sh.hang = "answered";
  sh.replies.push(async () => { throw coded("unreachable", "连不上"); }, fine(sh));
  const ts = Date.now();
  const outS = await drive(sh.relay.ask(ARGS), 500);
  ok(!!outS.v && sh.sent.length === 2 && Date.now() - ts < 13000, `问别处回上了没有的那一眼悬着不应：八秒当没回上，接着办（${Date.now() - ts} 毫秒）`);

  // 开机问出来不通：记下，这几分钟里不再问；过了三分钟自己再问
  const wn = world();
  wn.probe = false;
  const warm1 = await wn.relay.warm();
  const warm2 = await wn.relay.warm();
  ok(warm1 === false && warm2 === false && wn.probes === 1 && wn.relay.status().off && !wn.relay.trusted(), "开机问出来新路不通：记下，这几分钟里切回来多少趟都不再问");
  wn.probe = true;
  await clock.tick(3 * 60 * 1000 + 1000);
  await breathe();
  ok(wn.probes === 2 && wn.relay.trusted() && !wn.relay.status().off, "开机问出来不通：过三分钟自己再问一声，通了就记着");
  // 新路停着的那几分钟里：不去问
  const wf = world();
  wf.hint = true;
  wf.replies.push(async () => { throw coded("refused", "不认识这个动作", { reason: "old" }); });
  await settled(wf.relay.ask(ARGS));
  const asked = wf.probes;
  ok((await wf.relay.warm()) === false && wf.probes === asked && wf.relay.status().off, "新路刚被拒过、停着的那几分钟里：开机、切回来都不去问");

  // 刚回到眼前、手机自己说没网：看一眼就照实说，不试四回
  const wo2 = world();
  wo2.hint = true;
  wo2.replies.push(async (p) => { wo2.working(p); wo2.getFails = 99; wo2.backAt = Date.now(); wo2.online = false; throw coded("unreachable", "连不上"); });
  const outO = await drive(wo2.relay.ask(ARGS), 100);
  ok(outO.e && outO.e.message.includes("连不上") && wo2.getFails === 98, "刚回到眼前、手机自己说没网：看一眼就照实说，不白试四回");

  // 早就守着的那一回（不是刚回来才开始找的）：她切走又回来，头两眼没看成，不报“连不上”
  const wp = world();
  const kp = b64u(crypto.randomBytes(32));
  const infoP = { v: 1, job: "jobPATIENT1", chat: "A", last: "m1", key: kp, at: 1 };
  const pp = { job: "jobPATIENT1", key: kp, note: await vaultjs.seal(vault, JSON.stringify(infoP)) };
  wp.working(pp);
  let resP = null;
  wp.relay.resume("jobPATIENT1", infoP).then((v) => { resP = v; }, (e) => { resP = { e }; });
  await clock.tick(2000);
  wp.visible = false;
  mock.timers.setTime(Date.now() + 10 * 60 * 1000);
  await wp.done(pp);
  wp.getFails = 2;
  wp.comeBack();
  for (let i = 0; i < 30 && !resP; i++) await clock.tick(300);
  ok(!!resP && resP.via === "mailbox" && wp.getFails === 0, `早就守着的那一回、她切走十分钟又回来、头两眼没看成：不报连不上，网络醒了就取到（${resP && resP.e ? resP.e.message : "取到了"}）`);
  // “断了”比“回到眼前了”先到（手机刚被叫醒）：页面还藏着的时候没看成，不算数
  const wq = world({ visible: false });
  wq.hint = true;
  wq.replies.push(async (p) => { await wq.done(p); wq.getFails = 2; throw coded("unreachable", "连不上"); });
  let resQ = null;
  wq.relay.ask(ARGS).then((v) => { resQ = v; }, (e) => { resQ = { e }; });
  await until(() => wq.sent.length === 1);
  await breathe();
  await clock.tick(200); // 让过那一百五十毫秒，头一眼：页面还藏着，没看成
  const early = resQ;
  const hiddenMiss = wq.getFails === 1;
  wq.comeBack();
  for (let i = 0; i < 30 && !resQ; i++) await clock.tick(300);
  ok(hiddenMiss && early === null && !!resQ && resQ.via === "mailbox" && wq.sent.length === 1, `“断了”比“回到眼前了”先到：页面还藏着的那一眼没看成不算数，回到眼前就取到（${resQ && resQ.e ? resQ.e.message : "取到了"}）`);
  // 直接等的那头一断，先让一让再去看信箱（让“回到眼前了”先记下是几点）
  const wy = world();
  wy.hint = true;
  wy.replies.push(async (p) => { await wy.done(p); throw coded("unreachable", "连不上"); });
  const ty = Date.now();
  await drive(wy.relay.ask(ARGS), 50);
  ok(wy.looks.length >= 1 && wy.looks[0] - ty >= 150, `直接等的那头断了：先让一百五十毫秒再去看信箱（${wy.looks[0] - ty} 毫秒）`);

  // 直接等着、她回来以后信箱一直看不成：半分钟照实说；这一回还记着
  const wb = world();
  wb.hint = true;
  wb.replies.push((p) => { wb.working(p); return new Promise(() => {}); });
  let resB = null;
  wb.relay.ask(ARGS).then((v) => { resB = v; }, (e) => { resB = { e }; });
  await until(() => wb.sent.length === 1);
  wb.visible = false;
  wb.getFails = 99999;
  wb.comeBack();
  const tb = Date.now();
  for (let i = 0; i < 100 && !resB; i++) await clock.tick(500);
  ok(resB && resB.e && resB.e.code === "offline" && resB.e.message.includes("连不上") && Date.now() - tb >= 30000 && Date.now() - tb < 40000 && wb.aborted === 1 && wb.jobs().length === 1, `直接等着、回来以后信箱一直看不成：半分钟照实说连不上（${Math.round((Date.now() - tb) / 1000)} 秒），悬着的那头掐掉，这一回还记着`);
  // 看不成的那半分钟不把挂起的工夫算进去：挂起以前有一眼没看成，挂了十分钟回来，头一眼又没看成，不能马上说连不上
  const wc = world();
  wc.hint = true;
  wc.replies.push(() => new Promise(() => {}));
  let resC = null;
  wc.relay.ask(ARGS).then((v) => { resC = v; }, (e) => { resC = { e }; });
  await until(() => wc.sent.length === 1);
  await wc.done(wc.sent[0]);
  wc.getFails = 1;
  await clock.tick(45500); // 四十五秒那一眼：没看成
  wc.visible = false;
  mock.timers.setTime(Date.now() + 10 * 60 * 1000);
  wc.getFails = 1;
  wc.comeBack();
  for (let i = 0; i < 20 && !resC; i++) await clock.tick(500);
  ok(!!resC && resC.via === "mailbox", `挂起以前有一眼没看成、挂了十分钟回来头一眼又没看成：不马上说连不上，下一眼取到（${resC && resC.e ? resC.e.message : "取到了"}）`);
  // 钟一下子跳了十分钟（没收到“回到眼前”），那一眼又没看成：不说“等了太久”，下一眼取到
  const ws = world();
  ws.hint = true;
  ws.replies.push(() => new Promise(() => {}));
  let resS = null;
  ws.relay.ask(ARGS).then((v) => { resS = v; }, (e) => { resS = { e }; });
  await until(() => ws.sent.length === 1);
  await ws.done(ws.sent[0]);
  await clock.tick(44000);
  mock.timers.setTime(Date.now() + 10 * 60 * 1000);
  ws.getFails = 1;
  await clock.tick(1500);
  const afterMiss = resS;
  await clock.tick(1500);
  ok(afterMiss === null && !!resS && resS.via === "mailbox", `钟一下子走了十分钟、那一眼信箱又没看成：没看成的时候不说“等了太久”，下一眼取到（${resS && resS.e ? resS.e.message : "取到了"}）`);

  // 收“早断了”的那一格：只在它还写着“在等”的时候删。看的那一眼和删的这一下之间回话正好放进来了：不删，下一遍取得到
  const wd = world();
  wd.hint = true;
  wd.replies.push(async (p) => { wd.working(p); throw coded("unreachable", "连不上"); });
  let flipped = false;
  wd.onRemove = async () => { if (!flipped) { flipped = true; await wd.done(wd.sent[0]); } };
  const outD = await drive(wd.relay.ask(ARGS), 1000);
  const jobD = wd.sent[0].job;
  const listD = await wd.relay.collect();
  ok(outD.e && outD.e.message.includes("那边断了") && wd.removedWorking.join() === jobD && wd.rows.has(jobD) && listD.length === 1 && listD[0].state === "done" && listD[0].result.data.content[0].text === "在呢",
    "收“早断了”的那一格：删的那一下回话正好放进来了，就不删；下一遍看信箱取得到，没丢");
  await wd.relay.discard(jobD, true);
  const kept = wd.rows.has(jobD);
  await wd.relay.discard(jobD);
  ok(kept && !wd.rows.has(jobD), "收掉一格：说了“只收还在等的”，放好了的就留着；没说就照收");
  // 平常收一格（放过了、用不着了），那一格却已经没了（别的设备先收了）：编号照样划掉，不留着
  const wx = world();
  wx.hint = true;
  wx.replies.push(async (p) => { wx.working(p); wx.getFails = 99; throw coded("unreachable", "连不上"); });
  await drive(wx.relay.ask(ARGS), 100);
  const hadX = wx.jobs().length;
  wx.rows.clear();
  await wx.relay.discard(wx.sent[0].job);
  ok(hadX === 1 && wx.jobs().length === 0, "平常收一格、那一格已经没了：编号照样划掉");
  // 外头问“为这句话发出去过哪一回、还没着落”：记着的答得出（编号、几点发的）；别的话、重新回答的、有了着落的，都答没有
  const wo3 = world();
  wo3.hint = true;
  wo3.replies.push(async (p) => { wo3.working(p); wo3.getFails = 99; throw coded("unreachable", "连不上"); });
  const sentAt = Date.now();
  await drive(wo3.relay.ask(ARGS), 100);
  const owedNow = wo3.relay.owed("chatA", "m7");
  wo3.replies.push(async (p) => { wo3.working(p); wo3.getFails = 99; throw coded("unreachable", "连不上"); });
  await drive(wo3.relay.ask({ ...ARGS, last: "m9", fork: "oldReply" }), 100);
  ok(!!owedNow && owedNow.job === wo3.sent[0].job && owedNow.at >= sentAt && owedNow.at <= Date.now() && wo3.relay.owed("chatA", "m8") === null && wo3.relay.owed("chatB", "m7") === null && wo3.relay.owed("chatA", "m9") === null,
    "问为这句话发出去过哪一回：记着的答得出编号和几点发的；别的话、别的对话、重新回答的那一回，都答没有");
  wo3.getFails = 0;
  await wo3.done(wo3.sent[0]);
  const gotO = await drive(wo3.relay.ask(ARGS), 200);
  await gotO.v.settle();
  ok(wo3.relay.owed("chatA", "m7") === null, "有了着落的那一回：再问就没有了");
  // 直接等着的时候看出那一格早断了：也一样，只收还写着“在等”的
  const we = world();
  we.hint = true;
  we.replies.push((p) => { we.working(p); return new Promise(() => {}); });
  let flippedE = false;
  we.onRemove = async () => { if (!flippedE) { flippedE = true; await we.done(we.sent[0]); } };
  const outE = await drive(we.relay.ask(ARGS), 1000);
  const listE = await we.relay.collect();
  ok(outE.e && outE.e.message.includes("那边断了") && we.removedWorking.join() === we.sent[0].job && listE.length === 1 && listE[0].state === "done", "直接等着的时候看出那一格早断了、删的那一下回话正好放进来：也不删，下一遍取得到");

  // 刚回到眼前、头一眼悬了八秒才算没看成：这时候离回来已经八秒多了，照样算“刚回来”，再看一眼
  const wm = world();
  wm.hint = true;
  wm.replies.push(async (p) => { await wm.done(p); wm.hang = "get"; wm.backAt = Date.now(); throw coded("unreachable", "连不上"); });
  let resM = null;
  wm.relay.ask(ARGS).then((v) => { resM = v; }, (e) => { resM = { e }; });
  for (let i = 0; i < 17; i++) await clock.tick(500); // 八秒半：悬着的那一眼到点了
  wm.hang = "";
  for (let i = 0; i < 10 && !resM; i++) await clock.tick(500);
  ok(!!resM && resM.via === "mailbox", `刚回到眼前、头一眼悬了八秒才算没看成：照样再看一眼，取到了（${resM && resM.e ? resM.e.message : "取到了"}）`);

  // 守着信箱的那一回：手机被挂起的那一段不算在“等了多久”里
  const wl = world();
  const kl = b64u(crypto.randomBytes(32));
  const infoL = { v: 1, job: "jobLONGNAP1", chat: "A", last: "m1", key: kl, at: 1 };
  const pl = { job: "jobLONGNAP1", key: kl, note: await vaultjs.seal(vault, JSON.stringify(infoL)) };
  wl.working(pl);
  let resL = null;
  wl.relay.resume("jobLONGNAP1", infoL).then((v) => { resL = v; }, (e) => { resL = { e }; });
  await clock.tick(2000);
  wl.visible = false;
  mock.timers.setTime(Date.now() + 10 * 60 * 1000); // 挂起十分钟
  wl.beat("jobLONGNAP1"); // 他还在回
  wl.comeBack();
  for (let i = 0; i < 4; i++) { await clock.tick(2000); wl.beat("jobLONGNAP1"); }
  const stillL = resL;
  await wl.done(pl);
  await clock.tick(2500);
  ok(stillL === null && !!resL && resL.via === "mailbox", `守着信箱的那一回、挂起十分钟回来他还在回：挂起的那一段不算，接着等（${resL && resL.e ? resL.e.message : "等到了"}）`);
  clock.off();
}

// ---- 第三遍审出来的那几处 ----
{
  clock.on();
  const sealNote = async (info) => vaultjs.seal(vault, JSON.stringify(info));
  const letterFor = async (job, chat = "A", last = "m1") => {
    const key = b64u(crypto.randomBytes(32));
    const info = { v: 1, job, chat, last, key, at: 1 };
    return { info, p: { job, key, note: await sealNote(info) } };
  };

  // 收“早断了”的那一格、删的那一下回话正好放进来了：那一格留下了，编号也还记着。
  // 她看到“那边断了”点了重发：先去信箱里找，取到的是那一回的回话，不再发一遍（不花第二回钱）
  const wg = world();
  wg.hint = true;
  wg.replies.push(async (p) => { wg.working(p); throw coded("unreachable", "连不上"); });
  let flippedG = false;
  wg.onRemove = async () => { if (!flippedG) { flippedG = true; await wg.done(wg.sent[0]); } };
  const outG = await drive(wg.relay.ask(ARGS), 1000);
  const rememberedG = wg.jobs().join();
  const againG = await drive(wg.relay.ask({ ...ARGS, recheck: true }), 200);
  ok(outG.e && outG.e.message.includes("那边断了") && rememberedG === wg.sent[0].job && !!againG.v && againG.v.via === "mailbox" && againG.v.job === wg.sent[0].job && wg.sent.length === 1,
    "收“早断了”的那一格、回话正好放进来：那一格留下了，编号也还记着；她点重发，取到的是那一回的回话，没有再发一遍");
  await againG.v.settle();
  ok(wg.jobs().length === 0 && wg.rows.size === 0, "取到以后：信取走，这一回不用再记");

  // 守着别的设备发的那一回（这台设备本来不记得它）、守的工夫里没连上：这一回记在这台设备上了。
  // 她在这台设备上点重发：先去信箱里找它，不再发一遍
  const wr = world();
  wr.hint = true;
  const X = await letterFor("jobOTHERDEV1", "chatA", "m7");
  wr.working(X.p);
  wr.getFails = 99;
  const outR = await drive(wr.relay.resume("jobOTHERDEV1", X.info), 100);
  const rememberedR = wr.jobs().join();
  wr.getFails = 0;
  await wr.done(X.p);
  const againR = await drive(wr.relay.ask({ ...ARGS, recheck: true }), 200);
  ok(outR.e && outR.e.code === "offline" && rememberedR === "jobOTHERDEV1" && !!againR.v && againR.v.job === "jobOTHERDEV1" && againR.v.via === "mailbox" && wr.sent.length === 0,
    "守着别的设备发的那一回、没连上：这一回记在这台设备上；她在这台设备上点重发，先去信箱里找它，取到了，一回都没发");
  // 守到了的：落进对话以后不再记
  const wr2 = world();
  const Y = await letterFor("jobOTHERDEV2");
  await wr2.done(Y.p);
  const gotY = await drive(wr2.relay.resume("jobOTHERDEV2", Y.info), 200);
  const midY = wr2.jobs().join();
  await gotY.v.settle();
  ok(midY === "jobOTHERDEV2" && wr2.jobs().length === 0, "守到了的：回话落进对话以前记着，落进去以后不再记");

  // 守着信箱的那一回，他一直在回（那一格一直有人摸）：等够四分多钟也照实说等太久，这一回还记着
  const wt = world();
  const Z = await letterFor("jobTOOLONG01", "chatA", "m7");
  wt.working(Z.p);
  let resT = null;
  const tT = Date.now();
  wt.relay.resume("jobTOOLONG01", Z.info).then((v) => { resT = v; }, (e) => { resT = { e }; });
  for (let i = 0; i < 150 && !resT; i++) { await clock.tick(2000); wt.beat("jobTOOLONG01"); }
  ok(resT && resT.e && resT.e.message.includes("等了太久") && Date.now() - tT >= 260000 && Date.now() - tT < 290000 && wt.jobs().join() === "jobTOOLONG01" && wt.rows.has("jobTOOLONG01"),
    `守着信箱的那一回、他一直在回：等够四分多钟（${Math.round((Date.now() - tT) / 1000)} 秒）照实说等太久；那一格不动、这一回还记着（她点重发先去信箱里找）`);

  // 看信箱（collect）：刚回到眼前歇的那半秒里她又切走了（只瞥了一眼）：不看
  const wv = world();
  wv.backAt = Date.now();
  const V = await letterFor("jobGLANCE001");
  await wv.done(V.p);
  const peek = wv.relay.collect();
  await clock.tick(300);
  wv.visible = false;
  const outV = await drive(peek, 100, 2000);
  const hiddenFromStart = await drive(world({ visible: false }).relay.collect(), 100, 2000);
  wv.visible = true;
  wv.backAt = -Infinity;
  const laterV = await drive(wv.relay.collect(), 100, 2000);
  ok(Array.isArray(outV.v) && outV.v.length === 0 && wv.looks.length === 1 && Array.isArray(hiddenFromStart.v) && hiddenFromStart.v.length === 0 && laterV.v.length === 1 && laterV.v[0].state === "done",
    "看信箱：歇的那半秒里她又切走了，就不看了（外头不会在她不在的时候把信取走）；开封府不在眼前也不看；回到眼前再看，信还在");

  // 直接等着、信箱连着看不成：按一眼一眼地加，手机被挂起的那一段不算。
  // 挂起以前有一眼没看成，挂了十分钟（没收到“回到眼前”，或者它来得晚），醒来头一眼又没看成：不能马上说连不上
  const wz = world();
  wz.hint = true;
  wz.replies.push(() => new Promise(() => {}));
  let resZ = null;
  wz.relay.ask(ARGS).then((v) => { resZ = v; }, (e) => { resZ = { e }; });
  await until(() => wz.sent.length === 1);
  await wz.done(wz.sent[0]);
  wz.getFails = 1;
  await clock.tick(45500); // 四十五秒那一眼：没看成
  mock.timers.setTime(Date.now() + 10 * 60 * 1000); // 挂起十分钟
  wz.getFails = 1;
  await clock.tick(1500); // 醒来头一眼：又没看成
  const afterZ = resZ;
  for (let i = 0; i < 6 && !resZ; i++) await clock.tick(500);
  ok(afterZ === null && wz.getFails === 0 && !!resZ && resZ.via === "mailbox", `挂起以前一眼没看成、挂了十分钟、醒来头一眼又没看成（没等到“回到眼前”）：不马上说连不上，下一眼取到（${resZ && resZ.e ? resZ.e.message : "取到了"}）`);

  // 中间有一眼看成了：前面看不成的工夫一笔勾销，从头算
  const wk = world();
  wk.hint = true;
  wk.replies.push((p) => { wk.working(p); return new Promise(() => {}); });
  let resK = null;
  wk.relay.ask(ARGS).then((v) => { resK = v; }, (e) => { resK = { e }; });
  await until(() => wk.sent.length === 1);
  wk.visible = false;
  wk.comeBack();
  await breathe();
  const jobK = wk.sent[0].job;
  const blindFor = async (seconds) => { wk.getFails = 99999; for (let i = 0; i < seconds * 2 && !resK; i++) await clock.tick(500); wk.getFails = 0; };
  await blindFor(20);
  wk.beat(jobK);
  for (let i = 0; i < 6 && !resK; i++) await clock.tick(500); // 这三秒里看成了一眼
  const seenOnce = wk.looks.length;
  wk.beat(jobK);
  await blindFor(20);
  const afterTwo = resK;
  await blindFor(15);
  ok(seenOnce > 0 && afterTwo === null && resK && resK.e && resK.e.code === "offline", `信箱看不成二十秒、看成一眼、又看不成二十秒：不算连着半分钟，不说连不上；再看不成十五秒（这回连着过了半分钟）才说（${resK && resK.e ? resK.e.message : "没说"}）`);

  // 她切走又回来：看不成的工夫也从头算（刚回来网络多半还没醒，重新给足半分钟）
  const wj = world();
  wj.hint = true;
  wj.replies.push((p) => { wj.working(p); return new Promise(() => {}); });
  let resJ = null;
  wj.relay.ask(ARGS).then((v) => { resJ = v; }, (e) => { resJ = { e }; });
  await until(() => wj.sent.length === 1);
  wj.visible = false;
  wj.comeBack();
  await breathe();
  wj.getFails = 99999;
  for (let i = 0; i < 50 && !resJ; i++) await clock.tick(500); // 看不成二十五秒
  const before = resJ;
  wj.visible = false;
  wj.comeBack(); // 她又切走、又回来
  for (let i = 0; i < 40 && !resJ; i++) await clock.tick(500); // 再看不成二十秒：从回来算还不到半分钟
  const afterBack = resJ;
  for (let i = 0; i < 30 && !resJ; i++) await clock.tick(500); // 再十五秒：过了半分钟
  ok(before === null && afterBack === null && resJ && resJ.e && resJ.e.code === "offline", `信箱看不成二十五秒、她切走又回来、再看不成二十秒：从回来那一刻重新算，不说连不上；再过十五秒才说（${resJ && resJ.e ? resJ.e.message : "没说"}）`);
  clock.off();
}

// ---- 她按了停（ask、resume 的 signal） ----
{
  clock.on();
  const times = (list, job) => list.filter((j) => j === job).length;
  const good = (w) => async (p) => { await w.done(p); return { type: "reply", job: p.job, result: GOOD }; };
  const watching = (p) => { let out = null; p.then((v) => { out = { v }; }, (e) => { out = { e }; }); return () => out; };

  // 直接等着的时候按停
  const w = world();
  w.hint = true;
  const ctl = new AbortController();
  w.replies.push((p) => { w.working(p); return new Promise(() => {}); });
  const out = watching(w.relay.ask({ ...ARGS, signal: ctl.signal }));
  await until(() => w.sent.length === 1);
  await breathe();
  const job = w.sent[0].job;
  const before = { out: out(), jobs: w.jobs().join(), row: w.rows.has(job) };
  ctl.abort();
  await breathe();
  ok(before.out === null && before.jobs === job && before.row && out() && out().e && out().e.code === "stopped" && w.aborted === 1,
    "按停：正直接等着回话的时候按：这一问马上以“停了”收场（外头不报错、不重发），直接等的那头掐掉");
  ok(w.jobs().length === 0 && !w.rows.has(job) && times(w.removed, job) === 1 && w.relay.wasHalted(job) && w.halts().join() === job && !w.relay.isLive(job),
    "按停：这一回不再记着，信箱里那一格当场收掉（小后端回完了放不进去，六秒后看那一格不在，也不敲手机），编号记进“按了停的”");
  // 按停的那一下小后端还没来得及开出那一格：过后它开出来了。隔半秒、再一秒半、再五秒、再十五秒、再四十秒，各再收一遍
  // （每一遍都卡着两边看：差一百毫秒还没收，到点了收掉）
  const swept = [];
  for (const gap of [500, 1500, 5000, 15000, 40000]) {
    w.working(w.sent[0]);
    await clock.tick(gap - 100);
    const early = w.rows.has(job);
    await clock.tick(150);
    swept.push(early && !w.rows.has(job));
  }
  w.working(w.sent[0]);
  await clock.tick(120000);
  ok(swept.join() === "true,true,true,true,true" && times(w.removed, job) === 6 && w.rows.has(job), `按停：那一格要是晚一步才开出来：隔半秒、一秒半、五秒、十五秒、四十秒各再收一遍（一共六遍，最后一遍在一分钟以后），之后不再追着收（${swept.join()}，收了 ${times(w.removed, job)} 遍）`);
  // 再晚的：回话放进来了。看信箱的时候认得出是她停掉的那一回：收掉，不往对话里放
  await w.done(w.sent[0]);
  const listed = await w.relay.collect();
  await breathe();
  ok(Array.isArray(listed) && listed.length === 0 && !w.rows.has(job) && times(w.removed, job) === 7, "按停：停掉的那一回的回话后来还是进了信箱：看信箱的时候见一回收一回，不交出去（不会再冒进对话）");
  // 停了以后她点小字让他回：是新的一回，不去找停掉的那一回
  w.replies.push(good(w));
  const again = await settled(w.relay.ask(ARGS));
  ok(!!again.v && w.sent.length === 2 && again.v.job === w.sent[1].job && again.v.job !== job && !w.relay.wasHalted(again.v.job), "按停以后再要回话：发新的一回");
  // “按了停的”记在这台设备上：重开一遍（另起一个）还认得
  const w1 = world();
  w1.halted = w.halted;
  await w1.done(w.sent[0]);
  const listed1 = await w1.relay.collect();
  ok(w1.relay.wasHalted(job) && listed1.length === 0, "按停：停掉的那几回记在这台设备上，开封府重开以后在信箱里碰上也还认得、照收");

  // 回话和“停”前后脚到：算停了
  const wr = world();
  wr.hint = true;
  const cr = new AbortController();
  let release = null;
  wr.replies.push((p) => new Promise((resolve) => { release = () => resolve({ type: "reply", job: p.job, result: GOOD }); }));
  const outR = watching(wr.relay.ask({ ...ARGS, signal: cr.signal }));
  await until(() => !!release);
  await wr.done(wr.sent[0]); // 小后端把回话放进信箱了，
  release(); // 也交到了还等着的这一头；
  cr.abort(); // 同一下，她按了停
  await breathe();
  const jr = wr.sent[0].job;
  ok(outR() && outR().e && outR().e.code === "stopped" && !wr.rows.has(jr) && wr.relay.wasHalted(jr) && wr.jobs().length === 0, "按停：回话和“停”前后脚到：算停了，回话不交出去，那一格收掉");

  // 话还没出手机就按了停：不发了，没什么可收的
  for (const [name, hang, known] of [["还在问新路通不通", "probe", false], ["还在换登录凭证", "token", true]]) {
    const w2 = world();
    w2.hint = known;
    w2.hang = hang;
    const c2 = new AbortController();
    const out2 = watching(w2.relay.ask({ ...ARGS, signal: c2.signal }));
    await breathe();
    const waiting = out2() === null;
    c2.abort();
    await breathe();
    ok(waiting && out2() && out2().e && out2().e.code === "stopped" && w2.sent.length === 0 && w2.removed.length === 0 && w2.halts().length === 0 && w2.jobs().length === 0, `按停：话还没出手机（${name}）就按了：不发了，什么都没记、没什么可收的`);
  }

  // 直接等的那头断了、正守着信箱的时候按停
  const w3 = world();
  w3.hint = true;
  const c3 = new AbortController();
  w3.replies.push(async (p) => { w3.working(p); throw coded("unreachable", "连不上"); });
  const out3 = watching(w3.relay.ask({ ...ARGS, signal: c3.signal }));
  for (let i = 0; i < 3; i++) { await clock.tick(2000); w3.beat(w3.sent[0].job); }
  const still3 = out3() === null;
  c3.abort();
  await breathe();
  const j3 = w3.sent[0].job;
  ok(still3 && out3() && out3().e && out3().e.code === "stopped" && !w3.rows.has(j3) && times(w3.removed, j3) === 1 && w3.jobs().length === 0 && w3.relay.wasHalted(j3) && w3.sent.length === 1, "按停：直接等的那头断了、正守着信箱等的时候按：一样作废，那一格收掉（收一遍），不重发");

  // 守着上次发出去的那一回（resume）的时候按停
  const w4 = world();
  const c4 = new AbortController();
  const note4 = await vaultjs.seal(vault, JSON.stringify({ v: 1, job: "jobResume0000000001", chat: "chatA", last: "m7", key: b64u(crypto.randomBytes(32)), at: Date.now() }));
  w4.working({ job: "jobResume0000000001", note: note4 });
  const info4 = await readNote((t) => vaultjs.unseal(vault, t), note4, "jobResume0000000001");
  const out4 = watching(w4.relay.resume("jobResume0000000001", info4, c4.signal));
  await clock.tick(2000);
  const still4 = out4() === null && w4.jobs().join() === "jobResume0000000001";
  c4.abort();
  await breathe();
  ok(still4 && out4() && out4().e && out4().e.code === "stopped" && !w4.rows.has("jobResume0000000001") && times(w4.removed, "jobResume0000000001") === 1 && w4.jobs().length === 0 && w4.relay.wasHalted("jobResume0000000001"), "按停：守着上次打开时发出去的那一回的时候按：一样作废");
  // 守着的那一回信箱里没有了、正同步着看别处回上了没有的时候按停：不等那一下有着落
  const w4b = world();
  const c4b = new AbortController();
  w4b.hang = "answered";
  const out4b = watching(w4b.relay.resume("jobResume0000000002", { ...info4, job: "jobResume0000000002" }, c4b.signal));
  await breathe();
  await clock.tick(2000);
  const still4b = out4b() === null && w4b.synced === 1;
  c4b.abort();
  await breathe();
  ok(still4b && out4b() && out4b().e && out4b().e.code === "stopped" && w4b.relay.wasHalted("jobResume0000000002"), "按停：守着的那一回信箱里没有了、正同步着看别处回上了没有的时候按：马上以“停了”收场，不等同步有着落");

  // 线早就拉了（递进来的时候已经是按了停的）：什么都不发，也不等（这时候问新路通不通的那一下悬着）
  const w4c = world();
  w4c.hang = "probe";
  const c4c = new AbortController();
  c4c.abort();
  const out4c = watching(w4c.relay.ask({ ...ARGS, signal: c4c.signal }));
  await breathe();
  ok(out4c() && out4c().e && out4c().e.code === "stopped" && w4c.sent.length === 0 && w4c.jobs().length === 0 && w4c.halts().length === 0, "按停：递进来的时候线已经拉了：当场以“停了”收场，什么都不发、不等");

  // 回话已经从信箱里取到手、正拆着的那一下她按了停：也算停了，不交出去
  const w4d = world();
  const c4d = new AbortController();
  const key4d = b64u(crypto.randomBytes(32));
  const note4d = await vaultjs.seal(vault, JSON.stringify({ v: 1, job: "jobResume0000000003", chat: "chatA", last: "m7", key: key4d, at: Date.now() }));
  await w4d.done({ job: "jobResume0000000003", note: note4d, key: key4d });
  w4d.onUnseal = () => c4d.abort(); // 那一格已经看到了、正拆条子：这时候她按了停
  const out4d = await settled(w4d.relay.resume("jobResume0000000003", null, c4d.signal));
  await breathe();
  ok(out4d.e && out4d.e.code === "stopped" && !w4d.rows.has("jobResume0000000003") && w4d.relay.wasHalted("jobResume0000000003") && w4d.jobs().length === 0, "按停：回话已经从信箱里取到手、正拆着的那一下按：也算停了，不交出去，那一格收掉");

  // 为同一句话发出去的上一回还没着落、她点了重发、正去信箱里找它的时候按停：那一回作废
  const w5 = world();
  w5.hint = true;
  w5.replies.push(async (p) => { w5.working(p); throw coded("unreachable", "连不上"); });
  w5.getFails = 99;
  const first5 = await drive(w5.relay.ask(ARGS), 500, 20000);
  w5.getFails = 0;
  const j5 = w5.sent[0].job;
  const c5 = new AbortController();
  const out5 = watching(w5.relay.ask({ ...ARGS, recheck: true, signal: c5.signal }));
  await clock.tick(2000);
  w5.beat(j5);
  const still5 = out5() === null;
  c5.abort();
  await breathe();
  ok(first5.e && first5.e.code === "offline" && still5 && out5() && out5().e && out5().e.code === "stopped" && !w5.rows.has(j5) && w5.jobs().length === 0 && w5.relay.wasHalted(j5) && w5.sent.length === 1,
    "按停：上一回没连上、还记着，她点重发、正去信箱里找那一回的时候按：那一回作废（收掉、不再记着），没有另发一回");

  // 里头正卡在慢的一步上（收一格收了八秒才有着落）、出来的是别的错：对外头还是“停了”，那一回照样作废
  const w6 = world();
  const c6 = new AbortController();
  w6.rows.set("jobBroken0000000001", { job: "jobBroken0000000001", state: "working", note: "乱写的条子", sealed: null, created_at: stamp(), beat_at: stamp(), done_at: null });
  let hung = 0;
  w6.onRemove = () => (hung++ === 0 ? new Promise(() => {}) : null);
  const out6 = watching(w6.relay.resume("jobBroken0000000001", null, c6.signal));
  await clock.tick(1000);
  c6.abort();
  await breathe();
  const slow6 = out6() === null;
  await clock.tick(9000);
  ok(hung >= 1 && slow6 && out6() && out6().e && out6().e.code === "stopped" && w6.relay.wasHalted("jobBroken0000000001"), "按停：里头正卡在慢的一步上、出来的本该是别的错：交出去的还是“停了”，那一回照样记成作废");

  // 她不在的时候没送成、还记着的那一回（这会儿没人守着）：她在那段对话里按了停，这一回也作废（forget）
  const wf = world();
  wf.hint = true;
  wf.relay.forget("chatA"); // 什么都没记着的时候叫：什么都不做
  await breathe();
  const idleF = wf.removed.length === 0 && wf.halts().length === 0;
  wf.replies.push(async (p) => { wf.working(p); throw coded("unreachable", "连不上"); });
  wf.getFails = 99;
  const lostF = await drive(wf.relay.ask(ARGS), 500, 20000);
  wf.getFails = 0;
  const jf = wf.sent[0].job;
  const keptF = wf.jobs().join() === jf && wf.rows.has(jf) && !!wf.relay.owed("chatA", "m7") && !wf.relay.isLive(jf);
  wf.relay.forget("chatA");
  await breathe();
  ok(idleF && lostF.e && lostF.e.code === "offline" && keptF && wf.jobs().length === 0 && wf.relay.owed("chatA", "m7") === null && !wf.rows.has(jf) && times(wf.removed, jf) === 1 && wf.relay.wasHalted(jf) && wf.halts().join() === jf,
    "按停：没送成、还记着的那一回（这会儿没人守着）：她在那段对话里按了停，这一回也作废：不再记着（下回打开不会替她补发），那一格当场收掉，编号记进“按了停的”");
  for (let i = 0; i < 126; i++) await clock.tick(500); // 一分多钟：一步一步拨，过后的那五遍才排得上
  await wf.done(wf.sent[0]); // 那一回其实送到了：回话后来还是进了信箱
  const listedF = await wf.relay.collect();
  await breathe();
  wf.replies.push(good(wf));
  const againF = await settled(wf.relay.ask(ARGS));
  ok(times(wf.removed, jf) === 7 && Array.isArray(listedF) && listedF.length === 0 && !wf.rows.has(jf) && !!againF.v && wf.sent.length === 2 && againF.v.job === wf.sent[1].job && againF.v.job !== jf,
    `按停：这样作废的那一回和正等着的时候按停的一样收拾：过后再收五遍，回话后来进了信箱也不交出去；她再要回话，发的是新的一回（收了 ${times(wf.removed, jf)} 遍）`);

  // 只管那一段对话、这会儿没人守着的那几回：正守着的不碰（那一回 guarded 自己会收拾，这儿再收就收了两轮），别的对话记着的也不碰
  const wg = world();
  wg.hint = true;
  for (const more of [{ last: "m5" }, { last: "m6", fork: "old6" }, { chat: "chatB", last: "n1" }]) {
    wg.replies.push(async (p) => { wg.working(p); throw coded("unreachable", "连不上"); });
    wg.getFails = 99;
    await drive(wg.relay.ask({ ...ARGS, ...more }), 500, 20000);
  }
  wg.getFails = 0;
  wg.replies.push((p) => { wg.working(p); return new Promise(() => {}); });
  const cg = new AbortController();
  const outG = watching(wg.relay.ask({ ...ARGS, signal: cg.signal }));
  await until(() => wg.sent.length === 4);
  await breathe();
  const [g5, g6, gB, g7] = wg.sent.map((p) => p.job);
  const beforeG = wg.jobs().join() === [g5, g6, gB, g7].join() && wg.relay.isLive(g7) && !wg.relay.isLive(g5) && wg.rows.size === 4;
  wg.relay.forget("chatA");
  await breathe();
  ok(beforeG && wg.jobs().join() === [gB, g7].join() && wg.relay.wasHalted(g5) && wg.relay.wasHalted(g6) && !wg.relay.wasHalted(gB) && !wg.relay.wasHalted(g7) && [...wg.rows.keys()].join() === [gB, g7].join() && outG() === null && wg.relay.isLive(g7) && times(wg.removed, g7) === 0,
    "按停：作废的是那一段对话记着、这会儿没人守着的那几回（接在哪一句后面的都算，重新回答的也算）；正守着的那一回不碰，别的对话记着的也不碰");
  cg.abort(); // 正守着的那一回：按停的那一下它自己收场
  await breathe();
  const stoppedG = outG() && outG().e && outG().e.code === "stopped";
  for (let i = 0; i < 126; i++) await clock.tick(500);
  ok(stoppedG && wg.jobs().join() === gB && wg.relay.wasHalted(g7) && times(wg.removed, g7) === 6 && times(wg.removed, g5) === 6 && times(wg.removed, g6) === 6 && times(wg.removed, gB) === 0 && wg.rows.has(gB) && !!wg.relay.owed("chatB", "n1"),
    `按停：正守着的那一回由它自己那一问收拾，前后只收一轮（${times(wg.removed, g7)} 遍）；别的对话那一回原样记着，回头照旧补发`);

  // 没按停的：一切照旧（带着 signal 也一样）
  const w7 = world();
  w7.hint = true;
  const c7 = new AbortController();
  w7.replies.push(good(w7));
  const fine = await settled(w7.relay.ask({ ...ARGS, signal: c7.signal }));
  await fine.v.settle();
  c7.abort(); // 回话已经落进对话以后才按：这一问早就收场了，什么都不动
  await breathe();
  ok(!!fine.v && fine.v.via === "direct" && w7.halts().length === 0 && w7.removed.join() === w7.sent[0].job && !w7.relay.wasHalted(w7.sent[0].job), "带着停的线、没按停：照常交到；回话落进对话以后才按的，这一回不算停掉的");

  // “按了停的”最多记二十回
  const w8 = world();
  w8.hint = true;
  const jobs8 = [];
  for (let i = 0; i < 23; i++) {
    const c8 = new AbortController();
    w8.replies.push((p) => { w8.working(p); return new Promise(() => {}); });
    const o8 = watching(w8.relay.ask({ ...ARGS, last: "n" + i, signal: c8.signal }));
    await until(() => w8.sent.length === i + 1);
    await breathe();
    c8.abort();
    await breathe();
    jobs8.push(w8.sent[i].job);
    if (!(o8() && o8().e && o8().e.code === "stopped")) jobs8.push("没停成");
  }
  const w8b = world();
  w8b.halted = w8.halted; // 重开一遍：只认得记在设备上的那二十回
  ok(jobs8.length === 23 && w8.halts().length === 20 && w8.halts().join() === jobs8.slice(3).join() && !w8b.relay.wasHalted(jobs8[0]) && w8b.relay.wasHalted(jobs8[3]) && w8b.relay.wasHalted(jobs8[22]) && w8.relay.wasHalted(jobs8[0]) && w8.rows.size === 0,
    "按停：停掉的编号记在设备上的最多二十回，新的挤掉旧的（这次打开以来停掉的，这一趟里都还认得）");
  await clock.tick(10000);

  // 设备上记不进去（存不了东西的浏览器）：这一趟里照样认得停掉的那一回
  const w9 = world();
  w9.hint = true;
  w9.haltedBroken = true;
  const c9 = new AbortController();
  w9.replies.push((p) => { w9.working(p); return new Promise(() => {}); });
  const out9 = watching(w9.relay.ask({ ...ARGS, signal: c9.signal }));
  await until(() => w9.sent.length === 1);
  await breathe();
  c9.abort();
  await breathe();
  await clock.tick(10000);
  await w9.done(w9.sent[0]);
  const listed9 = await w9.relay.collect();
  await breathe();
  ok(out9() && out9().e && out9().e.code === "stopped" && w9.halted === "" && w9.relay.wasHalted(w9.sent[0].job) && listed9.length === 0 && !w9.rows.has(w9.sent[0].job), "按停：设备上记不进去的时候，这一趟里照样认得停掉的那一回：后来进了信箱的回话照收、不交出去");
  clock.off();
}

// ---- 小零件 ----
{
  ok(parseReplyMark("r.TAGtagTAG_-12.job0001abcdef")?.job === "job0001abcdef" && parseReplyMark("test-abc") === null && parseReplyMark("r.short.x") === null && parseReplyMark("r.TAGtagTAG_-12.job0001abcdef.extra") === null && parseReplyMark("") === null && parseReplyMark(null) === null,
    "记号：认得出回话的通知带的那种（r.对话.编号），测试通知的、多一截的、短的都不认");
  const good = await vaultjs.seal(vault, JSON.stringify({ v: 1, job: "J", chat: "A", last: "m", key: "k" }));
  const open = (t) => vaultjs.unseal(vault, t);
  const other = await vaultjs.deriveVault("别的暗号", new Uint8Array(16).fill(7), 1000);
  ok((await readNote(open, good, "J")).chat === "A" && (await readNote(open, good, "K")) === null && (await readNote(open, "乱写的", "J")) === null && (await readNote(open, await vaultjs.seal(vault, "不是 JSON"), "J")) === null && (await readNote(open, await vaultjs.seal(vault, JSON.stringify({ v: 2, job: "J", chat: "A", last: "m", key: "k" })), "J")) === null && (await readNote((t) => vaultjs.unseal(other, t), good, "J")) === null,
    "条子：自己封的拆得开；编号对不上的、乱写的、不是这个格式的、别的暗号封的，都拆不开（回空，不出错）");
  const key = crypto.randomBytes(32);
  const sealed = await fn.sealWith(new Uint8Array(key), JSON.stringify({ status: 200, data: { 话: "中文也行" } }));
  const sealed2 = await fn.sealWith(new Uint8Array(key), JSON.stringify({ status: 200, data: { 话: "中文也行" } }));
  let threw = 0;
  for (const [k, s] of [[b64u(crypto.randomBytes(32)), sealed], [b64u(key), sealed.slice(0, -6) + "AAAAA="], ["短", sealed], [b64u(key), "v2.a.b"], [b64u(key), await fn.sealWith(new Uint8Array(key), "\"只是一句话\"")]]) {
    try { await openSealed(k, s); } catch (e) { threw++; }
  }
  ok((await openSealed(b64u(key), sealed)).data.话 === "中文也行" && sealed !== sealed2 && threw === 5, "封好的回话：小后端封的，网页拿同一把钥匙打得开；同一句话封两回不一样；钥匙不对、被改过、格式不对、不是回话，都打不开");
  const bigText = "长".repeat(300000);
  const bigSealed = await fn.sealWith(new Uint8Array(key), JSON.stringify({ status: 200, data: { content: [{ type: "text", text: bigText }] } }));
  ok((await openSealed(b64u(key), bigSealed)).data.content[0].text === bigText, "封好的回话：三十万字的长回话也封得上、打得开");
}

await Promise.all(background);
console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
