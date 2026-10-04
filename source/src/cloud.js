// =====================================================
// 云端：Supabase 的登录、库房、传话的小后端
// =====================================================

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY, FUNCTION_URL, PUSH_URL } from "./config.js";
import { explainError } from "./errors.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "kfs-auth" },
});

const fail = (error) => {
  throw new Error((error && (error.message || error.msg)) || "云端出错了");
};

// 库房：只有一张 kv 表，所有内容在手机上就已经加密
export const remote = {
  async fetchPage({ from, cursor, limit }) {
    let q = supabase
      .from("kv")
      .select("key,value,updated_at")
      .order("updated_at", { ascending: true })
      .order("key", { ascending: true })
      .limit(limit);
    if (cursor) q = q.or(`updated_at.gt."${cursor.t}",and(updated_at.eq."${cursor.t}",key.gt."${cursor.k}")`);
    else if (from) q = q.gte("updated_at", from);
    const { data, error } = await q;
    if (error) fail(error);
    return data || [];
  },
  async upsert(rows) {
    if (!rows.length) return;
    const { error } = await supabase.from("kv").upsert(rows, { onConflict: "user_id,key" });
    if (error) fail(error);
  },
  async getMeta() {
    const { data, error } = await supabase.from("kv").select("key,value").in("key", ["m_kdf", "m_check"]);
    if (error) fail(error);
    const out = {};
    (data || []).forEach((r) => {
      out[r.key] = r.value;
    });
    return out;
  },
};

// 传话：拿着登录凭证去敲 claude 函数的门。
// signal：她一按停就 abort（AbortSignal，聊天那一处才递；写日记、测试连接不递）。按了：这头的连接掐掉；
// 外头那时候已经当“停了”收场（见 App.jsx 的 unlessStopped），这里后来抛什么错都没人看。
// 只有一样要守住：按了停以后不能再把回话交出去，交了会被拿去整理（换头像、改名字、记用量）
export async function callClaude(body, beta, signal) {
  const { data } = await supabase.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw new Error("登录过期了，重新登录一下");
  let res;
  try {
    res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
        ...(beta ? { "x-kfs-beta": beta } : {}),
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    throw new Error("连不上开封府的后端，看看网络");
  }
  let d = null;
  try {
    d = await res.json();
  } catch (e) {
    throw new Error(`后端没回话（${res.status}）`);
  }
  // 回话正好读完的那一下她按了停：不交出去
  if (signal && signal.aborted) throw Object.assign(new Error("停了"), { code: "stopped" });
  if (d && d.error) throw new Error(explainError(res.status, d.error));
  if (!res.ok) throw new Error((d && (d.message || d.msg)) || `出错了（${res.status}）`);
  return d;
}

// ---------- 通知 ----------
// 出了岔子的时候带一个 code，面板好分清是哪一种：
//   auth 没登录；unreachable 连不上（多半是 Supabase 里还没建 push 这个函数）；
//   refused 小后端说不行（message 是它的原话）；notable 库房里还没有登记簿那张表
// refused 的还带着 status（回来的状态码）；是小后端自己说的话（不是半路上的网关出的岔子）再带一个 own
const coded = (code, message) => Object.assign(new Error(message), { code });

// 敲通知那个小后端（push 函数）的门
export async function callPush(body) {
  const { data } = await supabase.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw coded("auth", "登录过期了，重新登录一下");
  let res;
  try {
    res = await fetch(PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw coded("unreachable", "连不上通知的小后端");
  }
  let d = null;
  try {
    d = await res.json();
  } catch (e) {}
  if (d && d.type === "error" && d.error) throw Object.assign(coded("refused", d.error.message || `小后端说不行（${res.status}）`), { status: res.status, own: true });
  if (res.status === 404) throw coded("unreachable", "Supabase 里还没有 push 这个函数");
  if (!res.ok || !d) throw Object.assign(coded("refused", (d && (d.message || d.msg)) || `小后端出错了（${res.status}）`), { status: res.status });
  return d;
}

// 通知的登记簿（push_subs 表）：这台设备的门牌号存在这儿，小后端照着它发。只读写得到自己的行
const ledgerError = (error) => {
  const text = String((error && error.message) || "");
  const missing = error && (error.code === "PGRST205" || error.code === "42P01" || (/push_subs/.test(text) && /not find|does not exist/i.test(text)));
  return missing ? coded("notable", "库房里还没有通知的登记簿") : coded("refused", text || "登记簿出错了");
};
export const pushLedger = {
  async myId() {
    const { data } = await supabase.auth.getSession();
    return (data && data.session && data.session.user && data.session.user.id) || "";
  },
  async list() {
    const { data, error } = await supabase.from("push_subs").select("endpoint,updated_at,last_at,last_status,last_note");
    if (error) throw ledgerError(error);
    return data || [];
  },
  async upsert(row) {
    const { error } = await supabase.from("push_subs").upsert(row, { onConflict: "user_id,endpoint" });
    if (error) throw ledgerError(error);
  },
  async remove(endpoint) {
    const { error } = await supabase.from("push_subs").delete().eq("endpoint", endpoint);
    if (error) throw ledgerError(error);
  },
};

// ---------- 信箱：替她等回话的那条路（见 mail.js） ----------
const TOKEN_WAIT = 8000; // 交话之前取登录凭证最多等这么久
// 等一件事，最多等 ms 毫秒；等不到就算出错
const within = (work, ms) =>
  new Promise((yes, no) => {
    const t = setTimeout(() => no(new Error("timeout")), ms);
    work.then(
      (v) => {
        clearTimeout(t);
        yes(v);
      },
      (e) => {
        clearTimeout(t);
        no(e);
      }
    );
  });

// 登录凭证至少还得能用这么多秒：小后端要拿着它等上两分多钟，等完还要往信箱里放东西。快到期了就先换一张新的
export async function freshToken(seconds) {
  const { data } = await supabase.auth.getSession();
  const s = data && data.session;
  if (s && s.expires_at && s.expires_at - Date.now() / 1000 < seconds) await supabase.auth.refreshSession();
}

// 把一回传话交给 push 函数去等。成了回 { type: "reply", job, result }。出了岔子抛带 code 的错：
//   auth         没登录、登录过期
//   refused      小后端没接（message 是它的原话，reason 是它给的缘故）：这一回根本没开始办
//   unreachable  没连上，或者连到一半断了：办没办不知道，得去信箱里看
//   gateway      回来的东西读不懂（函数那头崩了、超时了）：办没办也不知道
export async function callReply(payload, { signal } = {}) {
  // 取登录凭证也限时：凭证快到期的时候它要先去换一张，那一下要是悬着不应（刚解锁、网络还没醒），
  // 这里就跟着一直等：话没交出去，她对着“正在输入”干等一分多钟。八秒等不到就算没连上，照实说（什么都没发出去，不花钱）
  let data = null;
  try {
    ({ data } = await within(supabase.auth.getSession(), TOKEN_WAIT));
  } catch (e) {
    throw coded("unreachable", "连不上开封府的后端，看看网络");
  }
  const token = data && data.session && data.session.access_token;
  if (!token) throw coded("auth", "登录过期了，重新登录一下");
  let res;
  try {
    res = await fetch(PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    throw coded("unreachable", "连不上开封府的后端，看看网络");
  }
  let d = null;
  let read = true;
  try {
    d = await res.json();
  } catch (e) {
    read = false; // 回话读到一半断了，或者回来的不是 JSON
  }
  if (res.ok && d && d.type === "reply" && d.result && typeof d.result === "object") return d;
  if (d && d.type === "error" && d.error && d.error.type === "kaifengfu") {
    if (res.status === 401 || res.status === 403) throw coded("auth", d.error.message || "请先登录开封府");
    // 旧的那份代码不肯接的时候不带 code（它不认识这个动作，或者嫌寄来的东西太长）
    throw Object.assign(coded("refused", d.error.message || `小后端说不行（${res.status}）`), { reason: d.error.code || "old" });
  }
  if (res.status === 401) throw coded("auth", "登录过期了，重新登录一下");
  // 没有 push 这个函数；或者有，里面却不是开封府的那份代码（答了一句别的）
  if (res.status === 404 || (res.ok && read)) throw Object.assign(coded("refused", "push 函数还接不了回话"), { reason: "nofn" });
  if (res.ok) throw coded("unreachable", "回话读到一半断了");
  throw coded("gateway", `小后端出错了（${res.status}）`);
}

// 信箱（mailbox 表）：小后端把封好的回话放在这儿，手机来取，取走就删。只读写得到自己的行
const boxError = (error) => {
  const text = String((error && error.message) || "");
  const missing = error && (error.code === "PGRST205" || error.code === "42P01" || (/mailbox/.test(text) && /not find|does not exist/i.test(text)));
  return missing ? coded("notable", "库房里还没有信箱") : coded("refused", text || "信箱出错了");
};
const BOX_COLS = "job,state,note,sealed,created_at,beat_at,done_at";
// 看信箱的请求：没连上不要自己闷头重试（库默认会隔 1、2、4 秒再试三回，她那头就得干等），
// 等上八秒没动静就掐掉。重试、等多久，都由 mail.js 说了算
const quick = (query) => {
  let q = typeof query.retry === "function" ? query.retry(false) : query;
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") q = q.abortSignal(AbortSignal.timeout(8000));
  } catch (e) {}
  return q;
};
export const mailbox = {
  // 信箱里现在有的（放得早的排前面）
  async list() {
    const { data, error } = await quick(supabase.from("mailbox").select(BOX_COLS).order("created_at", { ascending: true }));
    if (error) throw boxError(error);
    return data || [];
  },
  // 某一回的那一格；没有就回 null
  async get(job) {
    const { data, error } = await quick(supabase.from("mailbox").select(BOX_COLS).eq("job", job));
    if (error) throw boxError(error);
    return (data && data[0]) || null;
  },
  // 删一格，回删掉了几行。onlyWorking：只在它还写着“在等”的时候删
  // （收“早断了”的那种用：看的那一眼和删的这一下之间，回话要是正好放进来了，就不删；一行都没删着，外头就知道它留下了）
  async remove(job, onlyWorking) {
    let q = supabase.from("mailbox").delete().eq("job", job);
    if (onlyWorking) q = q.eq("state", "working");
    const { data, error } = await quick(q.select("job"));
    if (error) throw boxError(error);
    return (data || []).length;
  },
  // 只看这张表在不在（通知面板、开机时问新路通不通用）
  async probe() {
    const { error } = await quick(supabase.from("mailbox").select("job").limit(1));
    if (error) throw boxError(error);
  },
};
