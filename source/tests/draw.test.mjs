// 画画的小后端（supabase/draw_function.ts）：真的那份代码，配假的 ElevenLabs（登录、MCP、放图的地方）和假的 draw_link 表。
// node tests/draw.test.mjs
import { loadDrawFunction, drawEnv, createFakeEleven, createDrawTable, TINY_PNG } from "./draw-harness.mjs";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log("ok:", msg);
  } else {
    failed++;
    console.log("FAIL:", msg);
    if (process.env.KFS_FAILFAST) process.exit(1);
  }
}

const BASE = "https://proj.supabase.test";
const SERVICE = "service-role-key-for-tests";
const QING = { id: "11111111-1111-1111-1111-111111111111", email: "qing@example.com" };
const OTHER = { id: "22222222-2222-2222-2222-222222222222", email: "someone@example.com" };
const TOKENS = { "token-qing": QING, "token-other": OTHER };

const eleven = createFakeEleven();
const table = createDrawTable(SERVICE);
const realFetch = globalThis.fetch;
const seen = []; // draw 函数敲过的每一个门
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const u = new URL(url);
  seen.push({ url, method: init.method || "GET", headers: init.headers || {} });
  if (u.origin === BASE && u.pathname === "/auth/v1/user") {
    const t = String((init.headers || {}).Authorization || "").replace(/^Bearer\s+/, "");
    return TOKENS[t] ? new Response(JSON.stringify(TOKENS[t]), { status: 200 }) : new Response("{}", { status: 401 });
  }
  if (u.origin === BASE && u.pathname.startsWith("/rest/v1/draw_link")) return table.receive(url, init);
  if (u.hostname === "api.elevenlabs.io" || u.hostname === "storage.googleapis.com") return eleven.receive(url, init);
  throw new Error("draw 函数敲了不该敲的门：" + url);
};

function reset() {
  for (const k of Object.keys(drawEnv)) delete drawEnv[k];
  Object.assign(drawEnv, { SUPABASE_URL: BASE, SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: SERVICE, ALLOWED_EMAIL: "qing@example.com" });
}
reset();
const { handler } = await loadDrawFunction();

async function call(body, token = "token-qing") {
  const res = await handler(new Request(`${BASE}/functions/v1/draw`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", apikey: "anon" }, body: JSON.stringify(body) }));
  let data = null;
  try {
    data = await res.json();
  } catch (e) {}
  return { status: res.status, data };
}
const codeOf = (r) => r.data && r.data.error && r.data.error.code;
const msgOf = (r) => (r.data && r.data.error && r.data.error.message) || "";

// 照浏览器那样走一趟登录：问这里要地址 → 打开 ElevenLabs 的登录页（假的直接 302 送回来）→ 浏览器照着回到这个函数
async function linkUp() {
  const r = await call({ op: "link" });
  if (!r.data || r.data.type !== "link") return { r };
  const back = await eleven.receive(r.data.url);
  const loc = back.headers.get("location");
  const res = await handler(new Request(loc, { method: "GET" }));
  return { r, loc, res, landed: res.headers.get("location") || "" };
}

// ================= 认人 =================
{
  const res = await handler(new Request(`${BASE}/functions/v1/draw`, { method: "POST", body: "{}" }));
  ok(res.status === 401, "没带登录凭证：不理");
  ok((await call({ op: "status" }, "token-other")).status === 403, "别人的账号：只认卿卿");
  ok(codeOf(await call({ op: "fly" })) === "bad", "不认识的动作：说一句");
  const opt = await handler(new Request(`${BASE}/functions/v1/draw`, { method: "OPTIONS" }));
  ok(opt.status === 200 && /POST/.test(opt.headers.get("access-control-allow-methods")) && /GET/.test(opt.headers.get("access-control-allow-methods")), "浏览器先来打招呼：放行（跨域的头带着）");
}

// ================= 还没建表、拿不到 service_role 钥匙 =================
{
  table.state.missing = true;
  const r = await call({ op: "status" });
  ok(r.status === 500 && codeOf(r) === "setup" && msgOf(r).includes("draw.sql"), `表还没建：说清是她在 Supabase 那头还差一步（${msgOf(r)}）`);
  table.state.missing = false;
  delete drawEnv.SUPABASE_SERVICE_ROLE_KEY;
  const r2 = await call({ op: "status" });
  ok(codeOf(r2) === "setup", "拿不到 service_role 钥匙：也说是还差一步");
  drawEnv.SUPABASE_SECRET_KEYS = JSON.stringify({ default: SERVICE });
  ok((await call({ op: "status" })).data.type === "status", "新版的 SUPABASE_SECRET_KEYS 也认");
  delete drawEnv.SUPABASE_SECRET_KEYS;
  drawEnv.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
}

// ================= 还没连上 =================
{
  const r = await call({ op: "status" });
  ok(r.data.type === "status" && r.data.linked === false && r.data.model === "gpt-image-2.5-sunburst" && r.data.can.includes("start"), "还没连上：status 照实说，不去敲 ElevenLabs 的门");
  ok(!seen.some((x) => x.url.includes("elevenlabs")), "问 status 的时候没碰 ElevenLabs");
  const s = await call({ op: "start", prompt: "一只小狐狸" });
  ok(s.status === 409 && codeOf(s) === "unlinked", "还没连上就要画：说先去连");
}

// ================= 登录（认那份身份说明的） =================
let firstClient = "";
{
  const { r, loc, res, landed } = await linkUp();
  ok(r.data.type === "link", "要登录的地址：给了");
  const u = new URL(r.data.url);
  const q = u.searchParams;
  firstClient = q.get("client_id");
  ok(u.origin + u.pathname === "https://api.elevenlabs.io/oauth/authorize" && q.get("response_type") === "code" && q.get("code_challenge_method") === "S256" && q.get("code_challenge").length >= 40, "地址：照 ElevenLabs 的说明找到登录页，带着 PKCE（S256）");
  ok(firstClient === "https://valerie9391120.github.io/kaifengfu/oauth/draw-client.json", "ElevenLabs 认身份说明：client_id 就是网页里那份说明的网址");
  ok(q.get("redirect_uri") === `${BASE}/functions/v1/draw` && q.get("resource") === "https://api.elevenlabs.io/v1/mcp" && q.get("scope") === "mcp", "送回来的地址是这个函数；resource、scope 照它的说明写");
  ok(q.get("state").startsWith(QING.id + "."), "state 头一截是她的编号（送回来的那一下不带登录凭证，靠它认人）");
  ok(res.status === 302 && landed.startsWith("https://valerie9391120.github.io/kaifengfu/oauth/done.html") && new URL(landed).searchParams.get("ok") === "1", `送回来以后：换好凭证，把浏览器送到“连好了”那一页（${landed}）`);
  const row = table.rows.get(QING.id);
  ok(row && row.tokens && row.tokens.access && row.tokens.refresh && !row.pendings && row.clientUsed === firstClient, "凭证存进了 draw_link；登录那一趟的东西清掉了");
  const st = await call({ op: "status" });
  ok(st.data.linked === true && st.data.at > 0, "再问 status：连上了");
  const again = await handler(new Request(loc, { method: "GET" }));
  ok(new URL(again.headers.get("location")).searchParams.get("why").includes("过期"), "同一个送回来的地址再打开一回：不认（state 用过了）");
}

// ================= 画一张 =================
let job = null;
{
  seen.length = 0;
  const s = await call({ op: "start", prompt: "  一只戴展脚幞头的小狐狸在读书，水彩  ", ratio: "竖" });
  ok(s.data && s.data.type === "job" && s.data.job.flow && s.data.job.node && s.data.job.sessions.length === 1 && s.data.credits === 237, `开画：回了要看的那一张（画布、节点、会话），花了多少点（${JSON.stringify(s.data)}）`);
  job = s.data.job;
  const tools = eleven.log.filter((x) => x.tool).slice(-2);
  ok(tools[0].tool === "creative_add_flow_node" && tools[0].args.node_type === "image-generation" && tools[0].args.model_id === "gpt-image-2.5-sunburst" && tools[0].args.prompt === "一只戴展脚幞头的小狐狸在读书，水彩" && tools[0].args.model_parameters.aspect_ratio === "3:4" && !tools[0].args.flow_id,
    "先加一个画画的节点：模型、画什么（两头的空白去掉）、竖的是 3:4；头一回另开一张画布");
  ok(tools[1].tool === "creative_run_flow_nodes" && tools[1].args.generations_count === 1 && tools[1].args.node_ids[0] === job.node, "再叫它画：只画一张（不照它默认的四张）");
  ok(table.rows.get(QING.id).flow === job.flow && table.rows.get(QING.id).day.n === 1, "画布记下了（往后都画在这一张上）；今天画了一张");
  const mcpCalls = seen.filter((x) => x.url.endsWith("/v1/mcp") && x.method === "POST");
  ok(mcpCalls.every((x) => /^Bearer at_/.test(x.headers.Authorization)) && mcpCalls.some((x) => x.headers["MCP-Protocol-Version"] === "2025-06-18" && x.headers["Mcp-Session-Id"]), "敲 MCP 都带着凭证；打过招呼以后带着会话号和版本");

  const c1 = await call({ op: "check", job });
  ok(c1.data.type === "pending" && c1.data.after === 3, "还在画：说一声，几秒以后再问");
  const c2 = await call({ op: "check", job });
  ok(c2.data.type === "image" && c2.data.mime === "image/png" && Buffer.from(c2.data.data, "base64").equals(TINY_PNG) && c2.data.w === 960 && c2.data.h === 1280 && c2.data.credits === 237, "画好了：图取回来交给网页（png、多大、花了多少点）");

  const s2 = await call({ op: "start", prompt: "再画一张", ratio: "横" });
  const add2 = eleven.log.filter((x) => x.tool === "creative_add_flow_node").pop();
  ok(s2.data.type === "job" && s2.data.job.flow === job.flow && add2.args.flow_id === job.flow && add2.args.model_parameters.aspect_ratio === "4:3", "第二张画在同一张画布上；横的是 4:3");
  const s3 = await call({ op: "start", prompt: "不说横竖" });
  ok(eleven.log.filter((x) => x.tool === "creative_add_flow_node").pop().args.model_parameters.aspect_ratio === "1:1", "没说横竖：方的");
  eleven.state.fail = "noflow";
  const s4 = await call({ op: "start", prompt: "画布被删了" });
  ok(s4.data.type === "job" && s4.data.job.flow !== job.flow && table.rows.get(QING.id).flow === s4.data.job.flow, "原来那张画布找不到了：另开一张，记下新的");
}

// ================= 回话是一段一段的事件（text/event-stream） =================
{
  eleven.state.sse = true;
  eleven.state.polls = 0;
  const s = await call({ op: "start", prompt: "事件流" });
  const c = await call({ op: "check", job: s.data.job });
  ok(s.data.type === "job" && c.data.type === "image", "MCP 回话用 text/event-stream：一样认");
  eleven.state.sse = false;
  eleven.state.polls = 1;
}

// ================= 凭证到点了：自己续 =================
{
  const before = table.rows.get(QING.id).tokens.refresh;
  eleven.expireAll();
  const s = await call({ op: "start", prompt: "凭证到点了" });
  const after = table.rows.get(QING.id).tokens;
  ok(s.data.type === "job" && after.refresh !== before, "ElevenLabs 说凭证不认了：拿 refresh token 续一张再敲一回，新的存下了");
  // 存的凭证还没到点、ElevenLabs 那头却过期了（钟不准）：MCP 回 401，续一张再敲
  eleven.expireAll();
  table.rows.get(QING.id).tokens.exp = Date.now() + 3600 * 1000;
  const s2 = await call({ op: "start", prompt: "钟不准" });
  ok(s2.data.type === "job", "这头以为凭证还没到点、那头说不认：续一张再敲一回");
  // 快到点了（一分钟以内）：先续再敲
  table.rows.get(QING.id).tokens.exp = Date.now() + 20_000;
  const r0 = table.rows.get(QING.id).tokens.refresh;
  await call({ op: "check", job });
  ok(table.rows.get(QING.id).tokens.refresh !== r0, "快到点了：先续一张再敲");
  // 续不成：凭证清掉，说要重新连
  eleven.expireAll();
  eleven.state.fail = "badrefresh";
  const s3 = await call({ op: "start", prompt: "续不成" });
  ok(s3.status === 401 && codeOf(s3) === "auth" && msgOf(s3).includes("重新连") && !table.rows.get(QING.id).tokens, "refresh token 也作废了：凭证清掉，说要在 API 面板里重新连一回");
  ok((await call({ op: "status" })).data.linked === false, "这时候 status 照实说没连上");
}

// ================= 重新连：这回 ElevenLabs 不认身份说明，现场登记 =================
{
  eleven.state.cimd = false;
  const { r, landed } = await linkUp();
  const client = new URL(r.data.url).searchParams.get("client_id");
  ok(client.startsWith("client_") && new URL(landed).searchParams.get("ok") === "1" && table.rows.get(QING.id).client === client, "ElevenLabs 不认身份说明：现场登记一个，记下来，照样连好");
  const { r: r2 } = await linkUp();
  ok(new URL(r2.data.url).searchParams.get("client_id") === client, "再连一回：用记下的那个，不重复登记");
  eleven.state.cimd = true;
  drawEnv.DRAW_CLIENT_MODE = "dcr";
  const { r: r3 } = await linkUp();
  ok(new URL(r3.data.url).searchParams.get("client_id") === client, "密钥柜里写了 DRAW_CLIENT_MODE=dcr：认身份说明的也走现场登记");
  delete drawEnv.DRAW_CLIENT_MODE;
}

// ================= 登录页上没点授权、state 不对、过期 =================
{
  eleven.state.fail = "deny";
  const { landed } = await linkUp();
  ok(new URL(landed).searchParams.get("why") === "没给授权", "登录页上没点授权：送到那一页写着没给授权");
  const fake = await handler(new Request(`${BASE}/functions/v1/draw?code=x&state=${QING.id}.wrongstate`, { method: "GET" }));
  ok(new URL(fake.headers.get("location")).searchParams.get("why").includes("过期"), "state 对不上：不认");
  const junk = await handler(new Request(`${BASE}/functions/v1/draw?code=x&state=nobody`, { method: "GET" }));
  ok(new URL(junk.headers.get("location")).searchParams.get("why").includes("认不出"), "state 里认不出是谁：不认");
  const r = await call({ op: "link" });
  table.rows.get(QING.id).pendings.forEach((x) => (x.at -= 16 * 60 * 1000));
  const back = await eleven.receive(r.data.url);
  const late = await handler(new Request(back.headers.get("location"), { method: "GET" }));
  ok(new URL(late.headers.get("location")).searchParams.get("why").includes("过期"), "登录那一趟走了十五分钟以上：不认");
  // 要了两回地址（两台设备都点开了面板）：先要的那一趟登录完也认；认了以后别的几趟清掉
  const a1 = await call({ op: "link" });
  const a2 = await call({ op: "link" });
  ok(table.rows.get(QING.id).pendings.length === 2, "要了两回地址：两趟都记着");
  const b1 = await eleven.receive(a1.data.url);
  const l1 = await handler(new Request(b1.headers.get("location"), { method: "GET" }));
  ok(new URL(l1.headers.get("location")).searchParams.get("ok") === "1" && !table.rows.get(QING.id).pendings, "先要的那一趟登录完：也连上了，别的几趟清掉");
  const b2 = await eleven.receive(a2.data.url);
  const l2 = await handler(new Request(b2.headers.get("location"), { method: "GET" }));
  ok(new URL(l2.headers.get("location")).searchParams.get("why").includes("过期"), "后要的那一趟再登录完：不认（已经清掉了）");
  for (let i = 0; i < 6; i++) await call({ op: "link" });
  ok(table.rows.get(QING.id).pendings.length === 4, "要了好多回：只记最近四趟");
  await linkUp();
  ok((await call({ op: "status" })).data.linked === true, "再走一趟：连上了");
}

// ================= ElevenLabs 不肯画、画失败了、取图出岔子 =================
{
  eleven.state.fail = "quota";
  const q = await call({ op: "start", prompt: "额度不够" });
  ok(codeOf(q) === "quota" && msgOf(q).includes("额度"), "额度不够：说额度不够");
  eleven.state.fail = "busy";
  const b = await call({ op: "start", prompt: "太挤" });
  ok(codeOf(b) === "busy", "MCP 回 429：说太挤");
  eleven.state.fail = "down";
  const d = await call({ op: "start", prompt: "出岔子" });
  ok(codeOf(d) === "down", "MCP 回 500：说一时出岔子");
  eleven.state.fail = "genfail";
  eleven.state.polls = 0;
  const g = await call({ op: "start", prompt: "画失败" });
  const gc = await call({ op: "check", job: g.data.job });
  ok(gc.data.type === "failed" && gc.data.why.includes("Content policy"), "画失败了：照实说 ElevenLabs 的原话");
  const n = await call({ op: "start", prompt: "取图 404" });
  eleven.state.fail = "noimage";
  const nc = await call({ op: "check", job: n.data.job });
  ok(codeOf(nc) === "down", "画好了取图没取到：说过一会儿再取（不当成没画成）");
  const nc2 = await call({ op: "check", job: n.data.job });
  ok(nc2.data.type === "image", "再取一回：取到了");
  eleven.state.fail = "notpng";
  const pc = await call({ op: "check", job: n.data.job });
  ok(codeOf(pc) === "refused" && msgOf(pc).includes("不是一张图"), "取回来的不是图：不交给网页");
  eleven.state.polls = 1;
}

// ================= 寄来的不对 =================
{
  ok(codeOf(await call({ op: "start", prompt: "   " })) === "bad", "没写要画什么：不画");
  ok(codeOf(await call({ op: "start", prompt: "字".repeat(2001) })) === "bad", "写得太长：不画");
  ok(codeOf(await call({ op: "check", job: { flow: "", sessions: [] } })) === "bad", "不知道看哪一张：说一句");
  const big = await handler(new Request(`${BASE}/functions/v1/draw`, { method: "POST", headers: { Authorization: "Bearer token-qing" }, body: JSON.stringify({ op: "start", prompt: "字".repeat(17000) }) }));
  ok(big.status === 413, "寄来的东西太长：不收");
}

// ================= 一天画几张 =================
{
  drawEnv.DRAW_DAILY_MAX = "3";
  table.rows.get(QING.id).day = { d: new Date().toISOString().slice(0, 10), n: 2 };
  const a = await call({ op: "start", prompt: "第三张" });
  const b = await call({ op: "start", prompt: "第四张" });
  ok(a.data.type === "job" && b.status === 429 && codeOf(b) === "cap" && msgOf(b).includes("3"), "一天的上限到了：不画，说一声");
  table.rows.get(QING.id).day = { d: "2026-01-01", n: 99 };
  ok((await call({ op: "start", prompt: "第二天" })).data.type === "job", "过了一天：重新数");
  delete drawEnv.DRAW_DAILY_MAX;
  drawEnv.DRAW_MODEL = "gemini-3.1-flash-image";
  await call({ op: "start", prompt: "换个模型" });
  ok(eleven.log.filter((x) => x.tool === "creative_add_flow_node").pop().args.model_id === "gemini-3.1-flash-image", "密钥柜里写了 DRAW_MODEL：照它画");
  drawEnv.DRAW_MODEL = "乱写的 模型";
  await call({ op: "start", prompt: "写岔了" });
  ok(eleven.log.filter((x) => x.tool === "creative_add_flow_node").pop().args.model_id === "gpt-image-2.5-sunburst", "DRAW_MODEL 写岔了：用默认的");
  delete drawEnv.DRAW_MODEL;
}

// ================= 不连了 =================
{
  const u = await call({ op: "unlink" });
  ok(u.data.type === "unlinked" && !table.rows.get(QING.id).tokens && (await call({ op: "status" })).data.linked === false, "不连了：凭证删掉");
  ok(codeOf(await call({ op: "start", prompt: "不连了还画" })) === "unlinked", "不连了再画：说先去连");
}

// ================= 不该敲的门一个没敲 =================
ok(true, "draw 函数只敲了 Supabase 自己、ElevenLabs、放图的那几处（别的会当场报错）");

globalThis.fetch = realFetch;
console.log(`\n通过 ${passed}  失败 ${failed}`);
process.exit(failed ? 1 : 0);
