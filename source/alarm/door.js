// =====================================================
// 笔记本那扇门：开封府走这台电脑上的 Claude Code 的时候敲这里（见开发说明“传话走笔记本上的 Claude Code”那一节）。
// 只听这台电脑自己（127.0.0.1）；手机从 Tailscale Serve 转进来（https://<这台电脑>.<tailnet>.ts.net:8443 → 这里，
// 见 main.js 的 door 那一下）。开封府那头只换一个门牌，等回话、看信箱那一大段照旧：
//   GET  /kfs/ping    门开着没有、Claude Code 是哪一版（开封府“测试连接”、打电话接通前看一眼）
//   POST /kfs/claude  跟 claude 函数一样：一包进、一个回话出（抄提要、写日记、打电话、老路）
//   POST /kfs/reply   跟 push 函数的 op: "reply" 一样：替她等回话。信箱照样开一格、隔几秒摸一下、回话拿手机给的一次性钥匙
//                     封好放进去，她切走了就敲她的手机（借 push 函数的 op: "notify"）。读写信箱、敲手机拿的是闹钟自己的登录
//                     （等多久都不过期）。她按了停（网页把信箱那一格收了）：这一回作废，不放、不敲
//   POST /mcp/<编号>  Claude Code 连进来调手机那头的工具（bridge.js）。只认这台电脑上直接连的：
//                     从 Tailscale Serve 转进来的带着 Tailscale-* 头、或者带着 Origin 的，都不认
// 开封府敲 /kfs/* 要带暗记（x-kfs-door 头）：闹钟 door 那一下生成、封在这台电脑上，她在开封府 API 面板里输一次。
// 网页的脚本只认开封府那一处（CORS）。日志只记几点办了什么，不记对话里的字。
// =====================================================
import http from "node:http";
import { createCipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { createBridge } from "./bridge.js";

export const DOOR_PORT = 3458; // Moonlight 是 3457
export const DOOR_HTTPS = 8443; // Tailscale Serve 在这个端口上把 https 转进来（443 留给别的）
export const HOME_ORIGIN = "https://valerie9391120.github.io"; // 开封府的网页住在哪（同 push 函数的 HOME_ORIGIN）
const BEAT = 8000; // 替她等回话的时候，隔多少毫秒去信箱里摸一下（网页靠它看这一回还活着没有；同 push 函数）
const GRACE = 6000; // 回话放进信箱以后等多少毫秒再敲手机：她就在开封府里的话，这工夫里网页已经把信取走了
const STORE_AGAIN = [500, 1000, 2000, 4000, 8000]; // 没放进信箱：隔这么多毫秒再放
const STORE_GIVE_UP = 20000;
const MAX_BODY = 40_000_000; // 一回传话寄来的最多这么长（带着照片的对话有好几兆；同 push 函数）
const MCP_BODY = 2_000_000;
const MODEL = /^claude-[a-z0-9.-]+$/i;
const JOB = /^[A-Za-z0-9_-]{8,64}$/;
const TAG = /^[A-Za-z0-9_-]{8,64}$/;

// ---------- 暗记：二十个字，五个一组。去掉了长得像的（0 和 O、1 和 I、L）；她在手机上输，大小写、空格、横杠都不算 ----------
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newToken() {
  const b = randomBytes(20);
  let s = "";
  for (const x of b) s += ALPHA[x % ALPHA.length];
  return s.match(/.{5}/g).join("-");
}
export const normToken = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// 回话拿网页给的那把一次性钥匙封起来（AES-256-GCM），写法同 push 函数的 sealWith：v1.<iv>.<密文和校验>，标准 base64
export function sealWith(key, text) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(text, "utf8")), c.final(), c.getAuthTag()]);
  return "v1." + iv.toString("base64") + "." + ct.toString("base64");
}
const b64u = (s) => {
  try {
    const b = Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return b.length ? b : null;
  } catch (e) {
    return null;
  }
};

// 他这一回写的字（几块 text 拼起来，同 push 函数敲手机时取的那几块）
const textOf = (data) => ((data && Array.isArray(data.content) ? data.content : []).filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// =====================================================
// createDoor：
//   token    暗记（door.txt 里封着的那一串）
//   cloud    闹钟的云端（cloud.js）：读写信箱、敲手机（push 的 op: notify）
//   claude   claude 在哪；cwd  Claude Code 的工作目录（bridge.js）；configDir 测试用
//   origin   开封府的网页住在哪（CORS 只认它）
//   port     听哪个端口（127.0.0.1）
//   env      给 Claude Code 的额外环境变量（测试连假的 API 用）
//   log      (line) => 记一笔
//   version  闹钟是哪一版（ping 回）
//   timing   测试拨快：{ beat, grace }
// 回 { listen() → Promise, close(), bridge, port() }
// =====================================================
export function createDoor({ token, cloud, claude, cwd, configDir, origin = HOME_ORIGIN, port = DOOR_PORT, env = {}, log = () => {}, version = "", timing = {} } = {}) {
  const want = normToken(token);
  if (want.length < 16) throw new Error("暗记不对");
  const beatMs = timing.beat || BEAT;
  const graceMs = timing.grace ?? GRACE;
  let listening = 0;
  const bridge = createBridge({
    claude,
    cwd,
    configDir,
    env,
    log,
    mcpUrl: (id) => `http://127.0.0.1:${listening}/mcp/${id}`,
  });
  let ccVersion = "";

  const tokenOk = (t) => {
    const got = Buffer.from(normToken(t));
    const exp = Buffer.from(want);
    return got.length === exp.length && timingSafeEqual(got, exp);
  };
  const corsFor = (req) => (req.headers.origin === origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {});
  const send = (res, status, data, extra = {}) => {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
    res.end(JSON.stringify(data));
  };
  // 出错的样子同 claude、push 函数（网页那头一套处理）；code 给开封府认：auth 没登录、quota 额度、busy 那边忙、cc 别的
  const problem = (status, message, code) => ({ type: "error", error: { type: "kaifengfu", message, ...(code ? { code } : {}) } });
  const ccCode = (e) => (e.status === 401 ? "cc_auth" : e.status === 429 ? "cc_quota" : e.status === 529 ? "cc_busy" : e.status === 499 ? "stopped" : "cc");
  const readBody = (req, limit) =>
    new Promise((resolve, reject) => {
      const parts = [];
      let n = 0;
      req.on("data", (c) => {
        n += c.length;
        if (n > limit) {
          reject(Object.assign(new Error("寄来的东西太长"), { status: 413 }));
          req.destroy();
        } else parts.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
      req.on("error", reject);
    });
  const readJson = async (req, limit) => {
    const text = await readBody(req, limit);
    try {
      const j = JSON.parse(text);
      if (j && typeof j === "object" && !Array.isArray(j)) return j;
    } catch (e) {}
    throw Object.assign(new Error("收到的不是合法的 JSON"), { status: 400 });
  };

  // ---------- 替她等回话（同 push 函数的 relay） ----------
  async function relay(req, res, body, cors) {
    const refuse = (status, code, message) => send(res, status, problem(status, message, code), cors);
    const job = String(body.job || "");
    if (!JOB.test(job)) return refuse(400, "bad_request", "这一回没有编号");
    const key = b64u(body.key);
    if (!key || key.length !== 32) return refuse(400, "bad_request", "封回话的钥匙不对");
    const note = typeof body.note === "string" ? body.note : "";
    if (!note || note.length > 4000) return refuse(400, "bad_request", "条子不对");
    const tag = String(body.tag || "");
    if (!TAG.test(tag)) return refuse(400, "bad_request", "没说是哪段对话");
    const title = String(body.title || "").slice(0, 200);
    const knock = [...new Set((Array.isArray(body.knock) ? body.knock : []).filter((e) => typeof e === "string" && e && e.length <= 1024))].slice(0, 5);
    const request = body.request;
    if (!request || typeof request !== "object" || Array.isArray(request)) return refuse(400, "bad_request", "没有要转的话");
    if (!MODEL.test(String(request.model || ""))) return refuse(400, "bad_request", "模型名不对");
    const maxTokens = Number(request.max_tokens || 0);
    if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 32000) return refuse(400, "bad_request", "max_tokens 超出范围");

    const opened = await cloud.mailbox.open(job, note);
    if (opened === "missing") return refuse(400, "no_mailbox", "库房里还没有信箱（mailbox 那张表）");
    if (opened === "duplicate") return refuse(409, "duplicate", "这一回已经在办了");
    if (opened !== "ok") return refuse(502, "mailbox_error", "信箱这会儿用不了");

    // —— 从这里起，这一回算接下了：网页那头还在不在，都办到底 ——
    log("[门] 替她等一回回话");
    const stop = new AbortController();
    const beats = setInterval(() => {
      cloud.mailbox.beat(job).then((there) => {
        if (there === false) stop.abort();
      });
    }, beatMs);
    let result;
    try {
      const data = await bridge.handle(request, { signal: stop.signal });
      result = { status: 200, data, used: { cache: true, mcp: !!(request.mcp_servers && request.mcp_servers.length) } };
    } catch (e) {
      const status = e.status || 500;
      result = { status, data: problem(status, e.message || "笔记本上的 Claude Code 出了岔子", ccCode(e)), used: { cache: false, mcp: false } };
    }
    // 她按了停：不放信、不敲手机；手上这份照旧交给网页那头（按停的那台早就不等了）
    if (stop.signal.aborted) {
      clearInterval(beats);
      log("[门] 她按了停");
      return send(res, 200, { type: "reply", job, result }, cors);
    }
    let put = "failed";
    let sealed = "";
    try {
      sealed = sealWith(key, JSON.stringify(result));
      put = await cloud.mailbox.finish(job, sealed);
      if (put === "failed") put = await cloud.mailbox.finish(job, sealed);
    } catch (e) {}
    send(res, 200, { type: "reply", job, result }, cors);
    const handed = Date.now();
    for (const pause of STORE_AGAIN) {
      if (put !== "failed" || !sealed || Date.now() + pause > handed + STORE_GIVE_UP) break;
      await sleep(pause);
      put = await cloud.mailbox.finish(job, sealed);
    }
    clearInterval(beats);
    if (put === "gone") return; // 网页已经直接拿到、把那一格收了（或者她按了停）：没信可敲
    if (put !== "stored") return log("[门] 回话没放进信箱");
    // 从交出去算起等够那几秒再看：信被取走了，她就在开封府里，不敲；还在，就敲她的手机（一个气泡一条，同狐宇宙那样）
    await sleep(Math.max(0, handed + graceMs - Date.now()));
    if (!knock.length || result.status !== 200 || (await cloud.mailbox.waiting(job)) === false) return;
    try {
      await cloud.push({ op: "notify", job, tag, title, knock, reply: textOf(result.data) });
      log("[门] 敲了她的手机");
    } catch (e) {
      log("[门] 敲手机没成：" + String(e.message || e).slice(0, 120));
    }
  }

  // ---------- 敲门的都从这儿进 ----------
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://door");
    const cors = corsFor(req);
    try {
      // Claude Code 连进来调工具：只认这台电脑上直接连的
      const mcp = /^\/mcp\/([0-9a-f]{32})$/.exec(url.pathname);
      if (mcp) {
        const relayed = req.headers.origin || Object.keys(req.headers).some((h) => h.startsWith("tailscale-") || h === "x-forwarded-for");
        if (relayed) return send(res, 403, { error: "不认" });
        if (req.method !== "POST") return send(res, 405, { error: "只收 POST" }, { Allow: "POST" });
        const msg = await readJson(req, MCP_BODY);
        const out = await bridge.mcp(mcp[1], msg);
        if (!out) {
          res.writeHead(202);
          return res.end();
        }
        return send(res, 200, out);
      }
      if (!url.pathname.startsWith("/kfs/")) return send(res, 404, problem(404, "没有这一处"));
      // 网页先问一声能不能敲（预检）：只答开封府那一处
      if (req.method === "OPTIONS") {
        if (!cors["Access-Control-Allow-Origin"]) return send(res, 403, problem(403, "不认这个网页"));
        res.writeHead(204, {
          ...cors,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, x-kfs-door, x-kfs-beta",
          "Access-Control-Max-Age": "600",
          ...(req.headers["access-control-request-private-network"] ? { "Access-Control-Allow-Private-Network": "true" } : {}),
        });
        return res.end();
      }
      // 别的网页的脚本不许敲（不带 Origin 的是这台电脑上的程序、测试，照样要暗记）
      if (req.headers.origin && !cors["Access-Control-Allow-Origin"]) return send(res, 403, problem(403, "不认这个网页"));
      if (!tokenOk(req.headers["x-kfs-door"])) return send(res, 401, problem(401, "笔记本那扇门的暗记不对", "door"), cors);

      if (url.pathname === "/kfs/ping" && req.method === "GET") return send(res, 200, { ok: true, door: 1, version, claude: ccVersion, runs: bridge.runs().length }, cors);
      if (req.method !== "POST") return send(res, 405, problem(405, "只收 POST"), cors);
      const body = await readJson(req, MAX_BODY);

      if (url.pathname === "/kfs/claude") {
        if (!MODEL.test(String(body.model || ""))) return send(res, 400, problem(400, "模型名不对"), cors);
        // 网页那头断了（她按了停、关了网页）：这一回作废（同 claude 函数：网页断了 Anthropic 那头也就停了）
        const gone = new AbortController();
        res.on("close", () => {
          if (!res.writableFinished) gone.abort();
        });
        try {
          const data = await bridge.handle(body, { signal: gone.signal });
          return send(res, 200, data, cors);
        } catch (e) {
          const status = e.status || 500;
          return send(res, status, problem(status, e.message || "笔记本上的 Claude Code 出了岔子", ccCode(e)), cors);
        }
      }
      if (url.pathname === "/kfs/reply") return await relay(req, res, body, cors);
      return send(res, 404, problem(404, "没有这一处"), cors);
    } catch (e) {
      return send(res, e.status || 500, problem(e.status || 500, e.status ? e.message : "门这头出了岔子"), cors);
    }
  });
  server.requestTimeout = 0; // 回话、等手机办工具，都可能等上好几分钟
  server.headersTimeout = 60000;

  return {
    bridge,
    port: () => listening,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          listening = server.address().port;
          log(`[门] 开了（127.0.0.1:${listening}）`);
          resolve(listening);
        });
      }),
    setClaudeVersion: (v) => (ccVersion = String(v || "")),
    close: () => {
      bridge.close();
      server.close();
    },
  };
}
