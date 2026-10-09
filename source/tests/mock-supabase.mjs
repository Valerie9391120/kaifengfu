// 假的 Supabase：登录、库房（kv 表，照 PostgREST 的规矩）、claude 函数、通知（登记簿 push_subs 表、信箱 mailbox 表、push 函数）、
// 念语音的 voice 函数（跑的是真的那一份，supabase/voice_function.ts；它要去敲的 ElevenLabs 是假的，见 voice-harness.mjs）
// node tests/mock-supabase.mjs  （端口 8787）
// push 函数跑的是真的那一份（supabase/push_function.ts，一个字不改）；它要去敲的推送服务、要去问的 Anthropic 是假的，见 push-harness.mjs
import http from "node:http";
import { loadPushFunction, pushEnv, createFakePush, createLedgerTable, createMailTable, makeVapidKeys } from "./push-harness.mjs";
import { loadVoiceFunction, voiceEnv, createFakeEleven } from "./voice-harness.mjs";

const PORT = Number(process.env.MOCK_PORT || 8787);
const USERS = { "qing@example.com": { id: "11111111-1111-1111-1111-111111111111", password: "correct-horse" } };
const rows = new Map(); // user_id|key → row
const claudeLog = []; // 每一回问“Anthropic”：{ body, beta, via }。via 是从哪条路来的：claude 函数（老路），还是 push 函数（新路）；
// 压着没答的工夫里问的那头把线掐了（她按了停，push 函数不等了）的那一回：{ body, beta, via, cut: true }，没有回话
let claudeFail = null; // 测试用：下一次问 Anthropic 照它的样子报错（workspace：key 没绑工作区；overloaded：太挤）；
// 这三种一直管用、直到改回来：broken：回回都报 key 没绑工作区；mcp：带着工具的一律不行；
// recap：叫他抄前情提要的那一种一律报太挤（平常的话照回）；recap-cut：抄提要的那一种写到上限被截断
let claudeFailTimes = 0; // overloaded 连着挤几回（不写就是一回）
let claudeHold = 0; // 测试用：下一次问 Anthropic，压这么多毫秒再答（等的工夫里她切走、关掉）
let echoSeq = 0; // “原样回：”回过几回（回话里写 {回} 换成这是第几回：重新回答的那一版和原来那一版字不一样，分得清）
let claudeHoldKind = ""; // 只压哪一种：recap 是只压叫他抄前情提要的那一种（平常的话照常答）；不写就是下一回不管哪一种
let claudeRelease = null; // 正压着的那一回：叫它现在就答
// 是不是叫他抄前情提要的那两种（抄一段、并几段，见 src/prompt/recap.js）：跟在名帖后面的那段规矩是这两个标题开头的
const recapRuleOf = (body) => (Array.isArray(body.system) ? body.system.map((x) => x.text || "").find((t) => t.startsWith("【抄提要】") || t.startsWith("【并提要】")) : "") || "";

// 假的那边的我：照寄来的话编一条回复。两条路问的都是它
function fakeAnthropic(body, beta, via) {
  claudeLog.push({ body, beta, via });
  if (claudeFail === "workspace" || claudeFail === "broken") {
    if (claudeFail === "workspace") claudeFail = null;
    return { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use." } } };
  }
  if (claudeFail === "overloaded") {
    if (--claudeFailTimes <= 0) claudeFail = null;
    return { status: 529, json: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } };
  }
  if (claudeFail === "mcp" && Array.isArray(body.mcp_servers) && body.mcp_servers.length) {
    return { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "mcp_servers.0: failed to connect to MCP server" } } };
  }
  if (body.ping) {
    return { status: 200, json: { model: "claude-haiku-4-5-20251001", content: [{ type: "text", text: "在" }], usage: { input_tokens: 12, output_tokens: 1 } } };
  }
  // 叫他抄前情提要的那两种：照寄来的东西编一段，写明抄了几条、前面有没有提要、带了几张图
  const recapRule = recapRuleOf(body);
  if (recapRule) {
    if (claudeFail === "recap") return { status: 529, json: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } };
    const blocks = (body.messages[0] && body.messages[0].content) || [];
    const all = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    let text;
    if (recapRule.startsWith("【并提要】")) {
      const k = (/把最早的 (\d+) 段并成一段/.exec(recapRule) || [])[1] || "?";
      text = `（测试并提要）把最早的 ${k} 段并成了一段。她说要试试新门，我说好，后来聊到周末的打算，说定周末去看灯，这件事还没了结。别的话头都收了尾，没有落下的。`;
    } else {
      const rows = (/〔要抄的原话，一共 (\d+) 条/.exec(all) || [])[1] || "?";
      text = `<thinking>顺手写的心里话</thinking>\n（测试提要）这一段一共抄了 ${rows} 条。${all.includes("〔前面已经抄好的提要") ? "前面已经有提要了。" : "这是头一段。"}带着 ${blocks.filter((b) => b.type === "image").length} 张图。她说要试试新门，我说好，后来聊到周末的打算。她还问灯会几点开始，我说七点。\n[SPLIT]\n说定的事：周末去看灯。`;
    }
    // 自己会先想一阵的模型（5 字头的那几个）：和真的一样，正文前面先来一块“想的”，里头的字不给看（空的），只带一个签名
    const thought = /^claude-(fable|opus|sonnet)-5/.test(String(body.model)) ? [{ type: "thinking", thinking: "", signature: "测试用的签名" }] : [];
    return {
      status: 200,
      json: { model: body.model, stop_reason: claudeFail === "recap-cut" ? "max_tokens" : "end_turn", content: thought.concat([{ type: "text", text }]), usage: { input_tokens: 5000, cache_creation_input_tokens: 0, cache_read_input_tokens: 8000, output_tokens: 400 } },
    };
  }
  const last = (body.messages || []).filter((m) => m.role === "user").pop();
  let blocks = last ? last.content : [];
  if (typeof blocks === "string") blocks = [{ type: "text", text: blocks }]; // 写日记那次寄来的是一整段字
  const endNote = blocks.findIndex((b) => b.type === "text" && b.text.startsWith("【附注结束"));
  if (endNote >= 0) blocks = blocks.slice(endNote + 1);
  const herText = blocks
    .filter((b) => b.type === "text" && !b.text.startsWith("【此刻】"))
    .map((b) => b.text)
    .join(" / ");
  const isDiary = Array.isArray(body.system) && body.system.some((b) => b.text && b.text.startsWith("【写日记】"));
  // 她说“改名叫某某”：假的那边的我就照做，在回复里写 [NAME:某某]（测他给自己改名字）
  const wish = /改名叫(\S+)/.exec(herText);
  // 她说“原样回：……”：冒号后面的字原样当成回复（测回复里的表情包、换头像这些标记）
  const echo = /原样回：([\s\S]+)$/.exec(herText);
  const text = isDiary
    ? "心情：甜、累\n今天她第一次从开封府的新门进来。我看着她在门口站了一会儿。"
    : echo
    ? `<thinking>（测试心声）照着说</thinking>\n${echo[1].replace(/\{回\}/g, String(++echoSeq))}`
    : wish
    ? `<thinking>（测试心声）改就改</thinking>\n行，改了。\n[NAME:${wish[1]}]\n[SPLIT]\n抬头看`
    : `<thinking>（测试心声）卿卿说：${herText}</thinking>\n收到：${herText}\n[SPLIT]\n第二条`;
  return {
    status: 200,
    json: {
      model: body.model,
      content: [{ type: "text", text }],
      usage: { input_tokens: 60, cache_creation_input_tokens: 9000, cache_read_input_tokens: 0, output_tokens: 90, cache_creation: { ephemeral_1h_input_tokens: 8000, ephemeral_5m_input_tokens: 1000 } },
    },
  };
}
// signal：问的那头带来的“不等了”的线（push 函数带着；claude 函数那条老路不带）。压着的工夫里线被掐了：这一回到此为止，不答
async function heldAnthropic(body, beta, via, signal) {
  if (claudeHold && (claudeHoldKind !== "recap" || recapRuleOf(body))) {
    const ms = claudeHold;
    claudeHold = 0;
    claudeHoldKind = "";
    let cut = false;
    await new Promise((r) => {
      const t = setTimeout(r, ms);
      const release = () => {
        clearTimeout(t);
        r();
      };
      claudeRelease = release;
      if (signal) {
        const stop = () => {
          cut = true;
          release();
        };
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, { once: true });
      }
    });
    claudeRelease = null;
    if (cut) {
      claudeLog.push({ body, beta, via, cut: true });
      throw signal.reason instanceof Error ? signal.reason : new DOMException("aborted", "AbortError");
    }
  }
  return fakeAnthropic(body, beta, via);
}
let clock = Date.UTC(2026, 9, 1, 14, 0, 0) * 1000;

// ---- 通知 ----
const ledger = createLedgerTable();
const mail = createMailTable();
const fakePush = createFakePush();
// push 函数替她等回话的时候去问的 Anthropic：接到上面那个假的
fakePush.install(null, {
  async receive(url, init = {}) {
    // 敲门之前那根“不等了”的线就已经拉了：和真的 fetch 一样，当场报错，门都不敲（不算问过一回）
    if (init.signal && init.signal.aborted) throw init.signal.reason instanceof Error ? init.signal.reason : new DOMException("The operation was aborted.", "AbortError");
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const out = await heldAnthropic(JSON.parse(init.body), headers["anthropic-beta"] || "", "push", init.signal);
    return new Response(JSON.stringify(out.json), { status: out.status, headers: { "content-type": "application/json" } });
  },
});
const pushFn = await loadPushFunction();

// ---- 念语音 ----
// voice 函数去敲的 ElevenLabs：接到假的那个上（别的照旧往下走）
const fakeEleven = createFakeEleven();
{
  const prev = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch (e) {}
    if (host === "api.elevenlabs.io") return fakeEleven.receive(url, init);
    return prev(input, init);
  };
}
const voiceFn = await loadVoiceFunction();
const ELEVEN_KEY = "sk_test_eleven_key_1234567890";
const ELEVEN_VOICE = "TestVoiceAbcdefghij1"; // 编的（真的声音编号不进仓库）
let voiceFnState = "ok"; // ok 部署了；missing 还没建这个函数（网关回 404，不带跨域的头）；template 里面还是 Supabase 的样板
function voiceReset() {
  for (const k of Object.keys(voiceEnv)) delete voiceEnv[k];
  Object.assign(voiceEnv, { SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_ANON_KEY: "sb_publishable_test", ALLOWED_EMAIL: "qing@example.com", ELEVENLABS_API_KEY: ELEVEN_KEY, ELEVENLABS_VOICE_ID: ELEVEN_VOICE });
  Object.assign(fakeEleven.state, { key: ELEVEN_KEY, voice: ELEVEN_VOICE, fail: null, failTimes: 0, always: false, hold: 0, ttsModels: null, stabilities: null });
  fakeEleven.log.length = 0;
  voiceFnState = "ok";
}
voiceReset();
let pushHold = 0; // 下一次敲 push 函数的门：答案照常算好，压这么多毫秒再回（测“先问的后到”）
let pushFnState = "ok"; // ok 部署了；missing 还没建这个函数（照 Supabase 网关那样回 404，不带跨域的头）；missing-cors 同上但带着头；
// old 部署的还是第一步那份代码（不认识“替她等回话”）；template 建了函数、里面还是 Supabase 给的样板；
// prev 部署的是上一版（会替她等回话；还不会一个气泡敲一条、不会她按了停就不等。这里只管它答“会什么”的那一句，办事的还是眼下这份）
let replyDrop = 0; // 往后这么多回“替她等回话”：小后端照常办完，回话却没送回网页（连接断了）
let pushAge = 0; // 下一回“替她等回话”敲门的时候，这份代码已经活了这么多毫秒（测“这一趟快到点了，剩下的横幅并成一条”）
const pushOps = []; // 每一回敲 push 函数的门，是来做什么的（key、test、reply）
let pushNotFound = 0; // 函数还没建的时候，有人来敲过几回门（浏览器先来打招呼的那一下也算）
function pushSecrets(text) {
  // 她在 Supabase 的 Secrets 里一次贴好几行“名字=值”，这里照着收
  for (const k of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) delete pushEnv[k];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/.exec(line);
    if (m) pushEnv[m[1]] = m[2];
  }
}
function pushReset() {
  ledger.rows.clear();
  Object.assign(ledger.state, { missing: false, failGet: 0 });
  claudeFailTimes = 0;
  mail.rows.clear();
  mail.log.length = 0;
  Object.assign(mail.state, { missing: false, down: false, failPatch: 0 });
  fakePush.reset();
  pushFnState = "ok";
  pushHold = 0;
  replyDrop = 0;
  pushAge = 0;
  pushFn.worker.closing = false;
  pushOps.length = 0;
  pushNotFound = 0;
  claudeHold = 0;
  claudeHoldKind = "";
  for (const k of Object.keys(pushEnv)) delete pushEnv[k];
  Object.assign(pushEnv, { SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_ANON_KEY: "sb_publishable_test", ALLOWED_EMAIL: "qing@example.com", ANTHROPIC_API_KEY: "sk-ant-test" });
}
pushReset();

const b64url = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function jwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    b64url(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 })),
    "mocksig",
  ].join(".");
}
function userFromAuth(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  try {
    const p = JSON.parse(Buffer.from(m[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    return p.role === "authenticated" ? { id: p.sub, email: p.email } : null;
  } catch (e) {
    return null;
  }
}
function session(user) {
  return {
    access_token: jwt(user),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "refresh-" + user.id,
    user: { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" },
  };
}
function stamp() {
  clock += 1700;
  const ms = Math.floor(clock / 1000);
  const us = clock % 1000;
  const iso = new Date(ms).toISOString().replace("Z", "");
  let frac = (iso.split(".")[1] + String(us).padStart(3, "0")).replace(/0+$/, "");
  return iso.split(".")[0] + (frac ? "." + frac : "") + "+00:00";
}
const tsNum = (s) => {
  const m = /^(.+?)(?:\.(\d+))?([+-]\d\d:\d\d|Z)$/.exec(s);
  const frac = (m[2] || "").padEnd(6, "0").slice(0, 6);
  return Date.parse(m[1] + (m[3] === "Z" ? "Z" : m[3])) * 1000 + Number(frac);
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-kfs-beta, x-supabase-api-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "content-range",
};
function send(res, status, body) {
  res.writeHead(status, { ...cors, "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
// 一块一块收齐了再转成字：一块一块转的话，一个汉字正好被劈在两块之间就成了乱码（长对话里碰上过）
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    // push 函数还没建：网关回 404，浏览器先来打招呼的那一下就过不去
    if (url.pathname === "/functions/v1/push" && (pushFnState === "missing" || pushFnState === "missing-cors")) {
      pushNotFound++;
      res.writeHead(404, { ...(pushFnState === "missing-cors" ? cors : {}), "Content-Type": "application/json" });
      return res.end(JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" }));
    }
    // voice 函数还没建：一样回 404，不带跨域的头
    if (url.pathname === "/functions/v1/voice" && voiceFnState === "missing") {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" }));
    }
    if (req.method === "OPTIONS") return send(res, 204);

    // ---- 调试用 ----
    if (url.pathname === "/__debug/rows") return send(res, 200, [...rows.values()]);
    if (url.pathname === "/__debug/claude") return send(res, 200, claudeLog);
    if (url.pathname === "/__debug/claude-fail") {
      claudeFail = url.searchParams.get("kind") || null;
      claudeFailTimes = Number(url.searchParams.get("times") || 1);
      return send(res, 200, { ok: true });
    }
    // 下一次问 Anthropic 压多少毫秒再答
    // 带 kind=recap：只压下一回叫他抄前情提要的（这之前平常的话照常答）
    if (url.pathname === "/__debug/claude-hold") {
      claudeHold = Number(url.searchParams.get("ms") || 0);
      claudeHoldKind = url.searchParams.get("kind") || "";
      return send(res, 200, { ok: true });
    }
    // 眼下有没有正压着的一回
    if (url.pathname === "/__debug/claude-held") return send(res, 200, { held: !!claudeRelease });
    // 正压着的那一回，现在就答
    if (url.pathname === "/__debug/claude-release") {
      const held = !!claudeRelease;
      if (claudeRelease) claudeRelease();
      return send(res, 200, { ok: held });
    }
    // ---- 念语音的调试口 ----
    // 看：每一回敲 ElevenLabs 的门（念的什么字、什么模型、稳不稳）
    if (url.pathname === "/__debug/eleven") {
      return send(res, 200, { log: fakeEleven.log.map((x) => ({ path: x.path, format: x.format, key: x.key, text: x.body.text || ((x.body.inputs || [])[0] || {}).text || "", model: x.body.model_id, settings: x.body.voice_settings || null, cut: !!x.cut })), state: { ...fakeEleven.state } });
    }
    // fail=quota|key|voice|busy|down|model|garbage|timeout|offline|broken（times=N 连着几回，always=1 一直这样）；hold=毫秒（下一回念得这么慢）；
    // models=只认哪几个模型（逗号隔开）；stab=只认哪几个“稳不稳”的数（逗号隔开，空的是都认）
    if (url.pathname === "/__debug/eleven-setup") {
      const q = url.searchParams;
      if (q.has("fail")) Object.assign(fakeEleven.state, { fail: q.get("fail") || null, failTimes: Number(q.get("times") || 1), always: q.get("always") === "1" });
      if (q.has("hold")) fakeEleven.state.hold = Number(q.get("hold") || 0);
      if (q.has("models")) fakeEleven.state.ttsModels = q.get("models") ? q.get("models").split(",") : null;
      if (q.has("stab")) fakeEleven.state.stabilities = q.get("stab") ? q.get("stab").split(",").map(Number) : null;
      return send(res, 200, { ok: true });
    }
    // 她在 Supabase 做到哪一步了：fn=missing 还没建 voice 函数、fn=template 里面是样板；keys=missing 密钥柜里还没放 ElevenLabs 的两样；
    // model=… 密钥柜里写了 ELEVENLABS_MODEL
    if (url.pathname === "/__debug/voice-setup") {
      const q = url.searchParams;
      if (q.has("fn")) voiceFnState = q.get("fn") || "ok";
      if (q.get("keys") === "missing") {
        delete voiceEnv.ELEVENLABS_API_KEY;
        delete voiceEnv.ELEVENLABS_VOICE_ID;
      } else if (q.get("keys") === "ok") Object.assign(voiceEnv, { ELEVENLABS_API_KEY: ELEVEN_KEY, ELEVENLABS_VOICE_ID: ELEVEN_VOICE });
      if (q.has("model")) {
        if (q.get("model")) voiceEnv.ELEVENLABS_MODEL = q.get("model");
        else delete voiceEnv.ELEVENLABS_MODEL;
      }
      return send(res, 200, { ok: true });
    }
    // ---- 信箱的调试口 ----
    // 看：信箱里现在有什么、每一回读写
    if (url.pathname === "/__debug/mail") return send(res, 200, { rows: mail.all(), log: mail.log, ops: pushOps, notFound: pushNotFound });
    // table=missing 还没建信箱那张表；drop=N 往后 N 回“替她等回话”办完了却送不回网页；rows=clear 把信箱清空；
    // failpatch=N 往后 N 回往信箱里“改”（摸一下、放信）都不成（库房一时出岔子）
    if (url.pathname === "/__debug/mail-setup") {
      if (url.searchParams.has("table")) mail.state.missing = url.searchParams.get("table") === "missing";
      if (url.searchParams.has("failpatch")) mail.state.failPatch = Number(url.searchParams.get("failpatch") || 0);
      if (url.searchParams.has("drop")) replyDrop = Number(url.searchParams.get("drop") || 0);
      if (url.searchParams.get("rows") === "clear") mail.rows.clear();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__debug/reset") {
      rows.clear();
      claudeLog.length = 0;
      claudeFail = null;
      pushReset();
      voiceReset();
      return send(res, 200, { ok: true });
    }
    // ---- 通知的调试口 ----
    // 看：登记簿、送到设备上的通知（已经解开）、每一次敲推送服务的门
    if (url.pathname === "/__debug/push") {
      return send(res, 200, {
        rows: ledger.all(),
        delivered: fakePush.delivered.map((d) => ({ endpoint: d.endpoint, json: d.json, text: d.text, claims: d.claims, ttl: d.ttl, urgency: d.urgency, at: d.at })),
        log: fakePush.log.map((x) => ({ endpoint: x.endpoint, status: x.status, reason: x.reason, size: x.size })),
        secrets: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"].filter((k) => pushEnv[k]),
        publicKey: pushEnv.VAPID_PUBLIC_KEY || "",
      });
    }
    // 领一台假设备（一个门牌号加两把公开钥匙）。key 是订阅时用的服务器公钥：真的推送服务会记着，换了钥匙就不收
    if (url.pathname === "/__debug/push-device") {
      const dev = fakePush.addDevice(url.searchParams.get("mode") || "ok");
      dev.serverKey = url.searchParams.get("key") || null;
      return send(res, 200, { endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth });
    }
    // 改一台假设备的脾气：gone 是门牌号作废
    if (url.pathname === "/__debug/push-mode") {
      const dev = fakePush.devices.get(url.searchParams.get("endpoint"));
      if (dev) dev.mode = url.searchParams.get("mode") || "ok";
      return send(res, 200, { ok: !!dev });
    }
    // 她在 Supabase 做到哪一步了：table=missing 还没建表；fn=missing 还没建函数；都不写就是恢复。
    // age=N 下一回“替她等回话”敲门的时候，这份代码已经活了 N 毫秒；closing=1 运行环境已经说过“快要把这一趟收掉了”
    if (url.pathname === "/__debug/push-setup") {
      ledger.state.missing = url.searchParams.get("table") === "missing";
      pushFnState = url.searchParams.get("fn") || "ok";
      pushHold = Number(url.searchParams.get("hold") || 0);
      pushAge = Number(url.searchParams.get("age") || 0);
      pushFn.worker.closing = url.searchParams.get("closing") === "1";
      return send(res, 200, { ok: true });
    }
    // 往密钥柜里贴（正文是那几行“名字=值”）；make=1 是现生成一对贴进去
    if (url.pathname === "/__debug/push-secrets") {
      if (url.searchParams.get("make")) {
        const k = makeVapidKeys();
        pushSecrets(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:qing@example.com`);
      } else pushSecrets(await readBody(req));
      return send(res, 200, { ok: true, publicKey: pushEnv.VAPID_PUBLIC_KEY || "" });
    }

    // ---- 登录 ----
    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (url.searchParams.get("grant_type") === "password") {
        const u = USERS[body.email];
        if (!u || u.password !== body.password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return send(res, 200, session({ id: u.id, email: body.email }));
      }
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const id = String(body.refresh_token || "").replace("refresh-", "");
        const email = Object.keys(USERS).find((e) => USERS[e].id === id);
        if (!email) return send(res, 400, { code: 400, msg: "Invalid Refresh Token" });
        return send(res, 200, session({ id, email }));
      }
    }
    if (url.pathname === "/auth/v1/user") {
      const u = userFromAuth(req);
      return u ? send(res, 200, { id: u.id, email: u.email, aud: "authenticated", role: "authenticated" }) : send(res, 401, { msg: "invalid JWT" });
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);

    // ---- 库房 ----
    if (url.pathname === "/rest/v1/kv") {
      const u = userFromAuth(req);
      if (!u) return send(res, 401, { message: "permission denied for table kv", code: "42501" });
      if (req.method === "GET") {
        let list = [...rows.values()].filter((r) => r.user_id === u.id);
        const inq = url.searchParams.get("key");
        if (inq && inq.startsWith("in.(")) {
          const keys = inq.slice(4, -1).split(",").map((k) => k.replace(/^"|"$/g, ""));
          list = list.filter((r) => keys.includes(r.key));
        }
        const upd = url.searchParams.get("updated_at");
        if (upd && upd.startsWith("gte.")) list = list.filter((r) => tsNum(r.updated_at) >= tsNum(upd.slice(4)));
        const or = url.searchParams.get("or");
        if (or) {
          const m = /^\(updated_at\.gt\."([^"]+)",and\(updated_at\.eq\."([^"]+)",key\.gt\."([^"]+)"\)\)$/.exec(or);
          if (!m) return send(res, 400, { message: "bad or filter: " + or });
          const t = tsNum(m[1]);
          list = list.filter((r) => tsNum(r.updated_at) > t || (tsNum(r.updated_at) === t && r.key > m[3]));
        }
        list.sort((a, b) => tsNum(a.updated_at) - tsNum(b.updated_at) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        const limit = Number(url.searchParams.get("limit") || 1000);
        const sel = (url.searchParams.get("select") || "*").split(",");
        return send(
          res,
          200,
          list.slice(0, limit).map((r) => Object.fromEntries(sel.map((c) => [c, r[c]])))
        );
      }
      if (req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "[]");
        const list = Array.isArray(body) ? body : [body];
        const t = stamp();
        for (const r of list) {
          if (r.user_id && r.user_id !== u.id) return send(res, 403, { message: 'new row violates row-level security policy for table "kv"', code: "42501" });
          rows.set(u.id + "|" + r.key, { user_id: u.id, key: r.key, value: r.value, updated_at: t });
        }
        return send(res, 201);
      }
    }

    // ---- 通知的登记簿 ----
    if (url.pathname === "/rest/v1/push_subs") {
      const u = userFromAuth(req);
      const r = ledger.handle(req.method, url.searchParams, u && u.id, await readBody(req));
      return send(res, r.status, r.status === 204 ? undefined : r.body);
    }

    // ---- 信箱 ----
    if (url.pathname === "/rest/v1/mailbox") {
      const u = userFromAuth(req);
      const r = mail.handle(req.method, url.searchParams, u && u.id, await readBody(req), req.headers.prefer || "");
      return send(res, r.status, r.status === 204 ? undefined : r.body);
    }

    // ---- push 函数：把这次敲门原样交给真的那份代码 ----
    if (url.pathname === "/functions/v1/push") {
      const headers = {};
      for (const k of ["authorization", "apikey", "content-type", "origin"]) if (req.headers[k]) headers[k] = req.headers[k];
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const opOf = /^\s*\{\s*"op"\s*:\s*"([a-z]+)"/.exec(body || "");
      pushOps.push(opOf ? opOf[1] : "");
      // 建了函数、里面还是 Supabase 给的样板：不管问什么都答一句 Hello
      if (pushFnState === "template") return send(res, 200, { message: "Hello undefined!" });
      // 部署的还是第一步那份：不认识“替她等回话”，寄来的东西一长就嫌长
      if (pushFnState === "old") {
        if (body && body.length > 4000) return send(res, 413, { type: "error", error: { type: "kaifengfu", message: "寄来的东西太长" } });
        let op = "";
        try {
          op = JSON.parse(body).op;
        } catch (e) {}
        if (op === "reply") return send(res, 400, { type: "error", error: { type: "kaifengfu", message: "不认识这个动作" } });
      }
      // 真的那头，这份代码每被叫起来一趟最多活两分半；这里一直开着不关。每来一回“替她等回话”就当它是刚被叫起来的
      // （测试要它“已经活了多久”就用 push-setup 的 age 说）
      if (opOf && opOf[1] === "reply") {
        pushFn.worker.born = Date.now() - pushAge;
        pushAge = 0;
      }
      const drop = !!opOf && opOf[1] === "reply" && replyDrop > 0;
      if (drop) replyDrop--;
      // 连接断了：这头照常办（函数不知道网页那头没了），回话却送不回去
      if (drop) {
        pushFn.handler(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body })).catch(() => {});
        return setTimeout(() => res.destroy(), 300);
      }
      const out = await pushFn.handler(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body }));
      if (pushHold && req.method === "POST") {
        const ms = pushHold;
        pushHold = 0;
        await new Promise((r) => setTimeout(r, ms));
      }
      res.writeHead(out.status, Object.fromEntries(out.headers));
      let text = await out.text();
      // 第一步那份代码答“钥匙放好了没有”的时候，不会说自己会替她等回话
      if (pushFnState === "old" && opOf && opOf[1] === "key") {
        const d = JSON.parse(text);
        delete d.can;
        text = JSON.stringify(d);
      }
      // 上一版答的是：只会替她等回话
      if (pushFnState === "prev" && opOf && opOf[1] === "key") {
        const d = JSON.parse(text);
        d.can = ["reply"];
        text = JSON.stringify(d);
      }
      return res.end(text);
    }

    // ---- voice 函数：把这次敲门原样交给真的那份代码 ----
    if (url.pathname === "/functions/v1/voice") {
      if (voiceFnState === "template") return send(res, 200, { message: "Hello undefined!" });
      const headers = {};
      for (const k of ["authorization", "apikey", "content-type", "origin"]) if (req.headers[k]) headers[k] = req.headers[k];
      const body = req.method === "POST" ? await readBody(req) : undefined;
      // 网页那头把这一问掐了（连接断了）：和真的运行环境一样，交给函数的这一问的 signal 跟着拉
      const gone = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) gone.abort();
      });
      const out = await voiceFn.handler(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body, signal: gone.signal }));
      if (res.destroyed) return;
      res.writeHead(out.status, Object.fromEntries(out.headers));
      return res.end(await out.text());
    }

    // ---- claude 函数 ----
    if (url.pathname === "/functions/v1/claude" && req.method === "POST") {
      const u = userFromAuth(req);
      if (!u) return send(res, 401, { type: "error", error: { type: "kaifengfu", message: "请先登录开封府" } });
      const body = JSON.parse((await readBody(req)) || "{}");
      const out = await heldAnthropic(body, req.headers["x-kfs-beta"] || "", "claude");
      return send(res, out.status, out.json);
    }

    send(res, 404, { message: "not found: " + url.pathname });
  })
  .listen(PORT, () => console.log("假 Supabase 在 " + PORT));
