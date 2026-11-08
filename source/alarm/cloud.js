// =====================================================
// 闹钟连云端：登录、库房（kv 表）、claude 函数、push 函数、通知的登记簿（只读门牌号）、
// 信箱（mailbox 表；笔记本那扇门替她等回话的时候用，同 push 函数的 mailbox()）。
// 网页那头用的是 Supabase 的那一包（src/cloud.js）；这里只用得着几样，直接照 Supabase 的规矩敲门，不带那一包
// （少一样东西，在她电脑上就少一样会出岔子的）。网址和公开钥匙跟网页是同一份（src/config.js）。
// =====================================================
import { SUPABASE_URL, SUPABASE_KEY, FUNCTION_URL, PUSH_URL } from "../src/config.js";

const WAIT = 30 * 1000; // 一般的敲门最多等多久
const REPLY_WAIT = 160 * 1000; // 问那边的我最多等多久（网关自己等到 150 秒也就不等了）
const FRESH = 300; // 登录凭证至少还得能用这么多秒，不够就先换一张

const coded = (code, message) => Object.assign(new Error(message), { code });

async function ask(url, { method = "GET", headers = {}, body, wait = WAIT } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(wait) });
  } catch (e) {
    throw coded("unreachable", "连不上开封府的后端（" + String((e && e.name) || e) + "）");
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {}
  return { status: res.status, ok: res.ok, data, text };
}

const why = (r) => {
  const d = r.data || {};
  const e = d.error && typeof d.error === "object" ? d.error : null;
  return (e && e.message) || d.msg || d.message || d.error_description || (typeof d.error === "string" ? d.error : "") || `出错了（${r.status}）`;
};

// creds：{ email, password }，登录过期、换不了新凭证的时候拿它重新登录
export function createCloud(creds) {
  let session = null; // { access_token, refresh_token, expires_at, user }

  const keep = (d) => {
    if (!d || !d.access_token) throw coded("auth", "登录没成");
    session = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      user: d.user || (session && session.user) || null,
    };
    return session;
  };

  async function login() {
    const r = await ask(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    if (!r.ok) throw coded(r.status === 400 ? "badlogin" : "auth", "登录没成：" + why(r));
    return keep(r.data);
  }

  async function refresh() {
    const r = await ask(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!r.ok) throw coded("auth", "换登录凭证没成：" + why(r));
    return keep(r.data);
  }

  // 一张还能用一阵子的登录凭证：快到期了先换；换不了（放久了作废了）就拿邮箱密码重新登录
  async function token() {
    if (!session) await login();
    else if (session.expires_at - Date.now() / 1000 < FRESH) {
      try {
        await refresh();
      } catch (e) {
        if (e.code === "unreachable") throw e;
        await login();
      }
    }
    return session.access_token;
  }

  const headers = async (extra = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${await token()}`, ...extra });

  // 库房：一页一页往后翻（同网页那头 src/cloud.js 的 remote.fetchPage，排序、接着翻的规矩一样）
  async function fetchPage({ from, cursor, limit }) {
    const q = new URLSearchParams({ select: "key,value,updated_at", order: "updated_at.asc,key.asc", limit: String(limit) });
    if (cursor) q.set("or", `(updated_at.gt."${cursor.t}",and(updated_at.eq."${cursor.t}",key.gt."${cursor.k}"))`);
    else if (from) q.set("updated_at", "gte." + from);
    const r = await ask(`${SUPABASE_URL}/rest/v1/kv?${q}`, { headers: await headers() });
    if (!r.ok) throw coded(r.status === 401 ? "auth" : "store", "库房没给东西：" + why(r));
    return Array.isArray(r.data) ? r.data : [];
  }

  // 只取点名的那几行（暗号那两样：m_kdf、m_check）
  async function fetchKeys(keys) {
    const q = new URLSearchParams({ select: "key,value", key: `in.(${keys.join(",")})` });
    const r = await ask(`${SUPABASE_URL}/rest/v1/kv?${q}`, { headers: await headers() });
    if (!r.ok) throw coded("store", "库房没给东西：" + why(r));
    const out = {};
    for (const row of Array.isArray(r.data) ? r.data : []) out[row.key] = row.value;
    return out;
  }

  async function upsert(rows) {
    if (!rows.length) return;
    const uid = session && session.user && session.user.id;
    const r = await ask(`${SUPABASE_URL}/rest/v1/kv?on_conflict=user_id,key`, {
      method: "POST",
      headers: await headers({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows.map((x) => (uid ? { user_id: uid, ...x } : x))),
    });
    if (!r.ok) throw coded("store", "没存上：" + why(r));
  }

  // 问那边的我（同网页那头 src/cloud.js 的 callClaude：拿着登录凭证敲 claude 函数的门，它转给 Anthropic）
  async function callClaude(body, beta = "") {
    const r = await ask(FUNCTION_URL, {
      method: "POST",
      headers: await headers({ "Content-Type": "application/json", ...(beta ? { "x-kfs-beta": beta } : {}) }),
      body: JSON.stringify(body),
      wait: REPLY_WAIT,
    });
    if (r.data && r.data.error) throw coded("api", why(r));
    if (!r.ok || !r.data) throw coded("api", `后端没回话（${r.status}）`);
    return r.data;
  }

  // push 函数：问它会什么（op: key）、照他的话敲她的手机（op: notify）
  async function push(payload) {
    const r = await ask(PUSH_URL, {
      method: "POST",
      headers: await headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw coded("push", why(r));
    return r.data;
  }

  // 登记簿（push_subs 表）里她那几台开了通知的设备的门牌号（只读得到她自己的行）：
  // 手机报上来的门牌号（kfs2:fox:doors），登记簿里已经没有的不敲（见 wake.js 的 doorsOf）
  async function endpoints() {
    const r = await ask(`${SUPABASE_URL}/rest/v1/push_subs?select=endpoint`, { headers: await headers() });
    if (!r.ok) throw coded("push", "登记簿没给东西：" + why(r));
    return (Array.isArray(r.data) ? r.data : []).map((x) => x && x.endpoint).filter((x) => typeof x === "string" && x);
  }

  // 信箱（mailbox 表）：笔记本那扇门替她等回话（door.js 的 /kfs/reply）。写法、回什么，跟 push 函数的 mailbox() 一个样子，
  // 只是拿的是闹钟自己的登录（等多久都不过期；她手机那张凭证只保得住四分钟）。库房只给她看她自己的那几行
  const BOX = `${SUPABASE_URL}/rest/v1/mailbox`;
  const DB_WAIT = 6000; // 读写信箱最多等多少毫秒（库房一时不应，不能把回话压在手里不交）
  const at = (job) => `${BOX}?job=eq.${encodeURIComponent(job)}`;
  const mailbox = {
    // 开一格，写上“在等”。ok 开好了；missing 那张表还没建；duplicate 这个编号已经有一格了；error 别的岔子
    async open(job, note) {
      try {
        const r = await ask(BOX, { method: "POST", headers: await headers({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify({ job, note, state: "working" }), wait: DB_WAIT });
        if (r.status === 201 || r.status === 200 || r.status === 204) return "ok";
        if (r.status === 404) return "missing";
        if (r.status === 409) return "duplicate";
        return "error";
      } catch (e) {
        return "error";
      }
    },
    // 这一格还在不在（她取走就删了）：在回 true，不在回 false，问不到回 null
    async waiting(job) {
      try {
        const r = await ask(`${at(job)}&select=job`, { headers: await headers(), wait: DB_WAIT });
        if (!r.ok) return null;
        return Array.isArray(r.data) && r.data.length > 0;
      } catch (e) {
        return null;
      }
    },
    // 还在等：摸一下。顺带报那一格还在不在（还写着“在等”的那一格）：在回 true；没了回 false（她按了停，网页把它收了）；问不成回 null
    async beat(job) {
      try {
        const r = await ask(`${at(job)}&state=eq.working&select=job`, { method: "PATCH", headers: await headers({ "Content-Type": "application/json", Prefer: "return=representation" }), body: JSON.stringify({ beat_at: new Date().toISOString() }), wait: DB_WAIT });
        if (!r.ok) return null;
        return Array.isArray(r.data) ? r.data.length > 0 : null;
      } catch (e) {
        return null;
      }
    },
    // 回话封好了，放进去。stored 放进去了；gone 那一格没了，没处放；failed 没放成，可以再放
    async finish(job, sealed) {
      try {
        const now = new Date().toISOString();
        const r = await ask(`${at(job)}&state=eq.working&select=job`, { method: "PATCH", headers: await headers({ "Content-Type": "application/json", Prefer: "return=representation" }), body: JSON.stringify({ state: "done", sealed, done_at: now, beat_at: now }), wait: DB_WAIT });
        if (!r.ok) return "failed";
        if (Array.isArray(r.data) && r.data.length > 0) return "stored";
        // 一行都没改到：要么那一格没了，要么上一回其实放进去了、只是这头没听见回音：看一眼
        const there = await mailbox.waiting(job);
        return there === true ? "stored" : there === false ? "gone" : "failed";
      } catch (e) {
        return "failed";
      }
    },
  };

  return {
    login,
    token,
    fetchPage,
    fetchKeys,
    upsert,
    callClaude,
    push,
    endpoints,
    mailbox,
    userId: () => (session && session.user && session.user.id) || "",
  };
}
