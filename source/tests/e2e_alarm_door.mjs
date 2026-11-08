// 闹钟里的那扇门（alarm/main.js 的 door、run 里开门；门本身见 tests/door.test.mjs），对着假 Supabase：
//   没装闹钟先敲 door：叫她先 setup；装好以后 door：生成暗记（封着存，测试的机器上是明文）、写出暗记，
//     找不到 Tailscale 照实说、门牌那一行等 Tailscale 开好再写；再敲一遍 door 暗记不变，door new 换一串；
//   Tailscale 的各种样子（假的 tailscale）：没在跑、断开着、https 没开（它给的链接原样写出来、指管理页）、
//     头一回叫她在网页上打开 https 然后开好了（门牌写出来；叫它的那一句对不对）；
//   后台跑起来门就开着：status 里写着开着；带着暗记敲 ping 回闹钟的版本；
//     Anthropic 那头回错（假的）：直接回话照实报（code 是 cc 开头的，开封府看了问她走不走 API）；
//     door test：走这台电脑上的 Claude Code 试一句（前面两句接上、工具挂上），后台没在跑、门关了各说各的；
//   door off：门关了、暗记删了；后台再起来门不开。
// 先起假 Supabase（npm run mock &）。跑：npm run test:alarm-door
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { deriveVault, seal, unseal, rowKeyFor, toB64 } from "../src/vault.js";
import { usageKey } from "../src/models.js";

const BASE = "http://127.0.0.1:8787";
const BUNDLE = path.resolve("alarm/dist/kfs-alarm-test.mjs");
const EMAIL = "qing@example.com";
const PASSWORD = "correct-horse";
const PASS = "月亮与六便士";
const ITER = 2000;
const CLAUDE = process.env.KFS_CLAUDE || ["/opt/claude-code/bin/claude"].find((f) => fs.existsSync(f)) || "";
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => (await fetch(BASE + p)).json();
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

// ---------- 她手机上已经有的：暗号、设置 ----------
await get("/__debug/reset");
const login = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json", apikey: "sb_publishable_test" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
const H = { apikey: "sb_publishable_test", Authorization: "Bearer " + login.access_token, "Content-Type": "application/json" };
const salt = crypto.getRandomValues(new Uint8Array(16));
const vault = await deriveVault(PASS, salt, ITER);
await fetch(`${BASE}/rest/v1/kv`, { method: "POST", headers: H, body: JSON.stringify([{ key: "m_kdf", value: JSON.stringify({ v: 1, salt: toB64(salt), iter: ITER }) }, { key: "m_check", value: await seal(vault, "开封府") }]) });
// 手机那头的设置：传话拨到了笔记本（狐宇宙醒来也走这台电脑上的 Claude Code）
const put = async (pairs) => {
  const rows = [];
  for (const [k, v] of Object.entries(pairs)) rows.push({ key: await rowKeyFor(vault, k), value: await seal(vault, JSON.stringify({ k, v })) });
  await fetch(`${BASE}/rest/v1/kv`, { method: "POST", headers: H, body: JSON.stringify(rows) });
};
const read = async (k) => {
  const rk = await rowKeyFor(vault, k);
  const row = (await get("/__debug/rows")).find((r) => r.key === rk);
  if (!row) return null;
  const p = JSON.parse(await unseal(vault, row.value));
  return p.d ? null : p.v;
};
const t0 = Date.now();
await put({
  "kfs2:settings": JSON.stringify({ model: "claude-haiku-4-5-20251001", maxTokens: 1024, wake: true, route: "laptop", door: "https://laptop.tail1234.ts.net:8443", doorKey: "XXXXX-XXXXX-XXXXX-XXXXX" }),
  "kfs2:memindex": JSON.stringify([{ id: "m1", name: "名帖.md", enabled: true, size: 10 }]),
  "kfs2:mem:m1": "你是光义，她是卿卿。（测试名帖）",
  "kfs2:index": JSON.stringify([{ id: "c1", title: "周末去哪", preview: "去睡", updatedAt: t0 - 3 * 3600 * 1000 }]),
  "kfs2:chat:c1": JSON.stringify([
    { id: "h1", role: "her", ts: t0 - 3 * 3600 * 1000 - 60000, text: "困了，先睡" },
    { id: "g1", role: "him", ts: t0 - 3 * 3600 * 1000, raw: "去睡", items: [{ type: "text", text: "去睡" }] },
  ]),
});

// ---------- 假的 Anthropic（后台那一个里的 Claude Code 敲它）：“你好”回 400；别的照“记住这个词：X”回 X ----------
const seen = []; // 它收到的每一包
const textOf = (m) => (Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }]).filter((b) => b.type === "text" && !b.text.startsWith("<system-reminder>")).map((b) => b.text).join(" ");
const api = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!req.url.startsWith("/v1/messages") || req.url.includes("count_tokens")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"input_tokens":10}');
    }
    const j = JSON.parse(body);
    seen.push(j);
    const last = textOf(j.messages[j.messages.length - 1]);
    if (last.includes("你好")) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "假的：这一句不让过" } }));
    }
    const word = (/记住这个词：([^。\s]+)/.exec(j.messages.map(textOf).join(" ")) || [])[1] || "不记得";
    res.writeHead(200, { "content-type": "text/event-stream" });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: j.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } });
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: word } });
    ev("content_block_stop", { index: 0 });
    ev("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } });
    ev("message_stop", {});
    res.end();
  });
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kfs-alarm-door-"));
const CCHOME = path.join(HOME, "cc-home"); // Claude Code 的家：空的，没登录过
fs.mkdirSync(CCHOME);
const DOOR = await freePort();
const env = {
  ...process.env,
  KFS_ALARM_HOME: HOME,
  KFS_ALARM_PLAIN: "1",
  KFS_ALARM_NOSTART: "1",
  KFS_ALARM_EMAIL: EMAIL,
  KFS_ALARM_PASSWORD: PASSWORD,
  KFS_ALARM_PASS: PASS,
  KFS_DOOR_PORT: String(DOOR),
  KFS_ALARM_MANUAL_GAP: "0",
  KFS_TAILSCALE: path.join(HOME, "no-tailscale"),
  ...(CLAUDE ? { KFS_CLAUDE: CLAUDE } : {}),
  HOME: CCHOME,
  USERPROFILE: CCHOME,
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${api.address().port}`, // Claude Code 敲的是上面那个假的
  ANTHROPIC_API_KEY: "sk-should-be-removed",
  CLAUDE_CODE_OAUTH_TOKEN: "",
};
const alarm = (args, extra = {}) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [BUNDLE, ...args], { env: { ...env, ...extra }, encoding: "utf8", timeout: 120000 }) };
  } catch (e) {
    return { code: e.status || 1, out: String(e.stdout || "") + String(e.stderr || "") };
  }
};
// 后台那一个里的 Claude Code 要敲这个进程里的假 Anthropic：这时候不能用 execFileSync 堵着
const alarmAsync = (args, extra = {}) =>
  new Promise((resolve) => {
    const c = spawn(process.execPath, [BUNDLE, ...args], { env: { ...env, ...extra } });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    c.on("close", (code) => resolve({ code, out }));
  });
const tokenIn = (out) => (/暗记：([A-Z0-9]{5}(?:-[A-Z0-9]{5}){3})/.exec(out) || [])[1] || "";

// ---------- door 之前得先装 ----------
let r = alarm(["door"]);
ok(r.code === 1 && r.out.includes("先跑 node kfs-alarm.mjs setup") && !fs.existsSync(path.join(HOME, "door.txt")), "还没装闹钟：door 叫她先 setup");
r = alarm(["setup"]);
ok(r.code === 0 && r.out.includes("暗号对上了"), "装好了");

// ---------- door ----------
r = alarm(["door"]);
const token = tokenIn(r.out);
const sealed = fs.readFileSync(path.join(HOME, "door.txt"), "utf8");
ok(r.code === 0 && token && sealed.startsWith("plain:") && !sealed.includes(token), `door：生成暗记、封着存（这台机器上是明文那种），写出来（${token}）`);
ok(r.out.includes("没找到 Tailscale") && r.out.includes("Tailscale 的 https 开好以后再跑一遍 door"), "找不到 Tailscale：照实说，门牌等开好了再写");
ok(!CLAUDE || /Claude Code：\d/.test(r.out), "写着这台电脑上 Claude Code 是哪一版");
r = alarm(["door"]);
ok(tokenIn(r.out) === token, "再敲一遍 door：暗记不变");
r = alarm(["door", "new"]);
const token2 = tokenIn(r.out);
ok(token2 && token2 !== token, "door new：换一串新的");
r = alarm(["door", "test"]);
ok(r.code === 1 && r.out.includes("门没开着"), "后台没在跑：door test 照实说、叫她看 status");

// ---------- Tailscale 的各种样子（假的 tailscale：FAKE_TS 说怎么演，每一次叫它都记一笔） ----------
const FAKE = path.join(HOME, "fake-tailscale.mjs");
const TSLOG = path.join(HOME, "ts-calls.txt");
fs.writeFileSync(
  FAKE,
  `import fs from "node:fs";
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_TS_LOG, JSON.stringify(args) + "\\n");
const mode = process.env.FAKE_TS;
const link = "\\nServe is not enabled on your tailnet.\\nTo enable, visit:\\n\\n         https://login.tailscale.com/f/serve?node=abc123\\n";
if (args[0] === "status") {
  if (mode === "down") {
    console.error("failed to connect to local tailscaled; it doesn't appear to be running (sudo systemctl start tailscaled ?)");
    process.exit(1);
  }
  console.log(JSON.stringify({ BackendState: mode === "stopped" ? "Stopped" : "Running", Self: { DNSName: "laptop.tail1234.ts.net." } }));
} else if (args[0] === "serve" && args.includes("off")) {
  process.exit(0);
} else if (args[0] === "serve" && mode === "nohttps") {
  console.log(link);
  console.error("error enabling https feature: tailnet does not have HTTPS enabled");
  process.exit(1);
} else if (args[0] === "serve") {
  console.log(link);
  setTimeout(() => {
    console.log("Success.\\nAvailable within your tailnet:\\n\\nhttps://laptop.tail1234.ts.net:8443/\\n|-- proxy http://127.0.0.1:" + args[3].split(":").pop() + "\\n\\nServe started and running in the background.");
  }, 300);
}
`
);
const ts = (mode) => ({ KFS_TAILSCALE: FAKE, FAKE_TS: mode, FAKE_TS_LOG: TSLOG });
const tsCalls = () => (fs.existsSync(TSLOG) ? fs.readFileSync(TSLOG, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
const PLACE = "Tailscale 的 https 开好以后再跑一遍 door";
r = alarm(["door"], ts("down"));
ok(r.out.includes("Tailscale 没应声（它说：failed to connect to local tailscaled") && r.out.includes(PLACE) && !tsCalls().some((a) => a[0] === "serve"), "Tailscale 没在跑：照实说它的原话，不去开 https，门牌等开好了再写");
r = alarm(["door"], ts("stopped"));
ok(r.out.includes("Tailscale 没连着（它说 Stopped）") && r.out.includes(PLACE) && !tsCalls().some((a) => a[0] === "serve"), "Tailscale 断开着：叫她连上");
r = alarm(["door"], ts("nohttps"));
ok(
  r.out.includes("https://login.tailscale.com/f/serve?node=abc123") && r.out.includes("没开成（上面是它的原话）") && r.out.includes("login.tailscale.com/admin/dns") && r.out.includes(PLACE),
  "https 没开成：它给的链接原样写出来，再指管理页，门牌先不写"
);
r = alarm(["door"], ts("ok"));
const serveCall = tsCalls().filter((a) => a[0] === "serve").pop() || [];
ok(
  r.out.includes("https://login.tailscale.com/f/serve?node=abc123") && r.out.includes("Tailscale 的 https：开好了") && r.out.includes("门牌：https://laptop.tail1234.ts.net:8443") && tokenIn(r.out) === token2,
  "头一回：链接写给她、等她在网页上打开、开好了写门牌（暗记还是那一串）"
);
ok(JSON.stringify(serveCall) === JSON.stringify(["serve", "--bg", "--https=8443", `http://127.0.0.1:${DOOR}`]), `叫 Tailscale 的那一句：${serveCall.join(" ")}`);

// ---------- 后台跑起来，门开着 ----------
const child = spawn(process.execPath, [BUNDLE, "run"], { env: { ...env, KFS_ALARM_TICK: "500", KFS_ALARM_PULL: "500" }, stdio: "ignore" });
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await sleep(500);
  try {
    up = (await fetch(`http://127.0.0.1:${DOOR}/kfs/ping`)).status === 401;
  } catch (e) {}
}
ok(up, "后台跑起来：门开着（不带暗记敲，回 401）");
r = alarm(["status"]);
ok(r.out.includes("笔记本那扇门：开着"), "status 里写着门开着");
let res = await fetch(`http://127.0.0.1:${DOOR}/kfs/ping`, { headers: { "x-kfs-door": token2 } });
let d = await res.json();
ok(res.status === 200 && d.ok && d.version === "2026-11-08", `带着新暗记敲 ping：回闹钟的版本（${d.version}）`);
ok((await fetch(`http://127.0.0.1:${DOOR}/kfs/ping`, { headers: { "x-kfs-door": token } })).status === 401, "换掉的那一串暗记不管用了");
if (CLAUDE) {
  res = await fetch(`http://127.0.0.1:${DOOR}/kfs/claude`, { method: "POST", headers: { "content-type": "application/json", "x-kfs-door": token2 }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 100, messages: [{ role: "user", content: "你好" }] }) });
  d = await res.json();
  // Anthropic 那头回了错（假的：“你好”回 400）：照实报，带着 cc 开头的 code（开封府看了问她走不走 API）。
  // “没登录”翻成 401、cc_auth 的那一下在 tests/bridge.test.mjs 里测（这台测试机上的 Claude Code 另有登录，装不成没登录）
  ok(res.status >= 400 && d.error && /^cc/.test(d.error.code || "") && d.error.message, `Claude Code 那头出了岔子：照实报（${res.status} ${d.error && d.error.code} ${d.error && d.error.message}）`);
  // door test：敲本机的门，前面带两句、带一样工具，问他刚才记的词
  const before = seen.length;
  r = await alarmAsync(["door", "test"]);
  const said = r.out.split("\n").filter((l) => /他回|没成/.test(l)).join(" ");
  ok(r.code === 0 && r.out.includes("他回：“月亮”。通了。"), `door test：走这台电脑上的 Claude Code 试一句，他回了记的那个词（${said}）`);
  const got = seen.slice(before).find((j) => j.messages.map(textOf).join(" ").includes("记住这个词：月亮"));
  ok(
    got && got.messages.length >= 3 && got.messages.map(textOf).join(" ").includes("记住了") && textOf(got.messages[got.messages.length - 1]).includes("刚才让你记的词") && (got.tools || []).some((t) => /kfs_ping/.test(t.name)) && JSON.stringify(got.system || "").includes("自检"),
    "试的那一句：前面两句接上了、开封府那样的工具挂上了、名帖是自检那一段"
  );

  // 传话拨到笔记本：狐宇宙醒来也交给这台电脑上的 Claude Code（不走 claude 函数），用量另记、不算钱
  const apiBefore = (await get("/__debug/claude")).length;
  const seenBefore = seen.length;
  r = await alarmAsync(["wake"]);
  const woke = seen.slice(seenBefore).find((j) => j.messages.map(textOf).join(" ").includes("【醒来】"));
  const fox = JSON.parse((await read("kfs2:chat:hyz")) || "[]");
  const hisWords = fox.filter((m) => m.role === "him").map((m) => m.raw || "").join(" ");
  ok(r.code === 0 && r.out.includes("醒过了") && woke && (woke.tools || []).some((t) => /diary_read/.test(t.name)) && hisWords.includes("不记得"), `传话走笔记本：狐宇宙醒来交给这台电脑上的 Claude Code（带着翻日记那几样），他说的放进了狐宇宙（${r.out.trim().split("\n").pop()}｜${hisWords.slice(0, 20)}）`);
  ok((await get("/__debug/claude")).length === apiBefore, "没走 claude 函数（API）");
  ok((woke.tools || []).some((t) => t.name === "WebSearch") && (woke.tools || []).some((t) => t.name === "WebFetch") && JSON.stringify(woke.system || "").includes("【上网】"), "上网查默认开着：醒来那一回 Claude Code 带着它自带的搜索、读网页，名帖后面有【上网】");
  const month = JSON.parse((await read(usageKey())) || "null");
  ok(month && month.cc >= 1 && !month.cost, `用量：走笔记本的另记几步，不算钱（${JSON.stringify(month)}）`);
}
const logText = fs.readFileSync(path.join(HOME, "alarm.log"), "utf8");
ok(/\[门\] 开了/.test(logText) && !logText.includes("你好") && !logText.includes(token2), "日志里记着门开了；没有对话里的字、没有暗记");

// ---------- door off ----------
r = alarm(["door", "off"], ts("ok"));
ok(r.out.includes("门关了") && !fs.existsSync(path.join(HOME, "door.txt")), "door off：门关了、暗记删了");
ok(tsCalls().some((a) => JSON.stringify(a) === JSON.stringify(["serve", "--https=8443", "off"])), "door off：Tailscale 那头 8443 也关了");
r = alarm(["door", "test"]);
ok(r.code === 1 && r.out.includes("门还没开过"), "关了门：door test 叫她先跑 door");
alarm(["stop"]);
await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); child.on("exit", resolve); setTimeout(resolve, 15000); });
const child2 = spawn(process.execPath, [BUNDLE, "run"], { env: { ...env, KFS_ALARM_TICK: "500", KFS_ALARM_PULL: "500" }, stdio: "ignore" });
await sleep(4000);
let open = false;
try {
  open = !!(await fetch(`http://127.0.0.1:${DOOR}/kfs/ping`));
} catch (e) {}
ok(!open && !alarm(["status"]).out.includes("笔记本那扇门"), "关了门再起来：门不开，status 里也不提");
alarm(["stop"]);
await new Promise((resolve) => { if (child2.exitCode !== null) return resolve(); child2.on("exit", resolve); setTimeout(resolve, 15000); });
fs.rmSync(HOME, { recursive: true, force: true });
console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
