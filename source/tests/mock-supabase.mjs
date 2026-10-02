// 假的 Supabase：登录、库房（kv 表，照 PostgREST 的规矩）、claude 函数、通知（登记簿 push_subs 表、push 函数）
// node tests/mock-supabase.mjs  （端口 8787）
// push 函数跑的是真的那一份（supabase/push_function.ts，一个字不改）；它要去敲的推送服务是假的，见 push-harness.mjs
import http from "node:http";
import { loadPushFunction, pushEnv, createFakePush, createLedgerTable, makeVapidKeys } from "./push-harness.mjs";

const PORT = Number(process.env.MOCK_PORT || 8787);
const USERS = { "qing@example.com": { id: "11111111-1111-1111-1111-111111111111", password: "correct-horse" } };
const rows = new Map(); // user_id|key → row
const claudeLog = [];
let claudeFail = null; // 测试用：下一次 claude 调用照 Anthropic 的样子报错
let clock = Date.UTC(2026, 9, 1, 14, 0, 0) * 1000;

// ---- 通知 ----
const ledger = createLedgerTable();
const fakePush = createFakePush();
fakePush.install();
const pushFn = await loadPushFunction();
let pushHold = 0; // 下一次敲 push 函数的门：答案照常算好，压这么多毫秒再回（测“先问的后到”）
let pushFnState = "ok"; // ok 部署了；missing 还没建这个函数（照 Supabase 网关那样回 404，不带跨域的头）；missing-cors 同上但带着头
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
  ledger.state.missing = false;
  fakePush.reset();
  pushFnState = "ok";
  pushHold = 0;
  for (const k of Object.keys(pushEnv)) delete pushEnv[k];
  Object.assign(pushEnv, { SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_ANON_KEY: "sb_publishable_test", ALLOWED_EMAIL: "qing@example.com" });
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
const readBody = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    // push 函数还没建：网关回 404，浏览器先来打招呼的那一下就过不去
    if (url.pathname === "/functions/v1/push" && pushFnState !== "ok") {
      res.writeHead(404, { ...(pushFnState === "missing-cors" ? cors : {}), "Content-Type": "application/json" });
      return res.end(JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" }));
    }
    if (req.method === "OPTIONS") return send(res, 204);

    // ---- 调试用 ----
    if (url.pathname === "/__debug/rows") return send(res, 200, [...rows.values()]);
    if (url.pathname === "/__debug/claude") return send(res, 200, claudeLog);
    if (url.pathname === "/__debug/claude-fail") {
      claudeFail = url.searchParams.get("kind") || null;
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__debug/reset") {
      rows.clear();
      claudeLog.length = 0;
      claudeFail = null;
      pushReset();
      return send(res, 200, { ok: true });
    }
    // ---- 通知的调试口 ----
    // 看：登记簿、送到设备上的通知（已经解开）、每一次敲推送服务的门
    if (url.pathname === "/__debug/push") {
      return send(res, 200, {
        rows: ledger.all(),
        delivered: fakePush.delivered.map((d) => ({ endpoint: d.endpoint, json: d.json, text: d.text, claims: d.claims, ttl: d.ttl, urgency: d.urgency })),
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
    // 她在 Supabase 做到哪一步了：table=missing 还没建表；fn=missing 还没建函数；都不写就是恢复
    if (url.pathname === "/__debug/push-setup") {
      ledger.state.missing = url.searchParams.get("table") === "missing";
      pushFnState = url.searchParams.get("fn") || "ok";
      pushHold = Number(url.searchParams.get("hold") || 0);
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

    // ---- push 函数：把这次敲门原样交给真的那份代码 ----
    if (url.pathname === "/functions/v1/push") {
      const headers = {};
      for (const k of ["authorization", "apikey", "content-type", "origin"]) if (req.headers[k]) headers[k] = req.headers[k];
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const out = await pushFn.handler(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body }));
      if (pushHold && req.method === "POST") {
        const ms = pushHold;
        pushHold = 0;
        await new Promise((r) => setTimeout(r, ms));
      }
      res.writeHead(out.status, Object.fromEntries(out.headers));
      return res.end(await out.text());
    }

    // ---- claude 函数 ----
    if (url.pathname === "/functions/v1/claude" && req.method === "POST") {
      const u = userFromAuth(req);
      if (!u) return send(res, 401, { type: "error", error: { type: "kaifengfu", message: "请先登录开封府" } });
      const body = JSON.parse((await readBody(req)) || "{}");
      claudeLog.push({ body, beta: req.headers["x-kfs-beta"] || "" });
      if (claudeFail === "workspace") {
        claudeFail = null;
        return send(res, 400, {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use.",
          },
        });
      }
      if (body.ping) {
        return send(res, 200, { model: "claude-haiku-4-5-20251001", content: [{ type: "text", text: "在" }], usage: { input_tokens: 12, output_tokens: 1 } });
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
        ? `<thinking>（测试心声）照着说</thinking>\n${echo[1]}`
        : wish
        ? `<thinking>（测试心声）改就改</thinking>\n行，改了。\n[NAME:${wish[1]}]\n[SPLIT]\n抬头看`
        : `<thinking>（测试心声）卿卿说：${herText}</thinking>\n收到：${herText}\n[SPLIT]\n第二条`;
      return send(res, 200, {
        model: body.model,
        content: [{ type: "text", text }],
        usage: { input_tokens: 60, cache_creation_input_tokens: 9000, cache_read_input_tokens: 0, output_tokens: 90, cache_creation: { ephemeral_1h_input_tokens: 8000, ephemeral_5m_input_tokens: 1000 } },
      });
    }

    send(res, 404, { message: "not found: " + url.pathname });
  })
  .listen(PORT, () => console.log("假 Supabase 在 " + PORT));
