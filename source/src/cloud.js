// =====================================================
// 云端：Supabase 的登录、库房、传话的小后端
// =====================================================

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY, FUNCTION_URL } from "./config.js";
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

// 传话：拿着登录凭证去敲 claude 函数的门
export async function callClaude(body, beta) {
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
  if (d && d.error) throw new Error(explainError(res.status, d.error));
  if (!res.ok) throw new Error((d && (d.message || d.msg)) || `出错了（${res.status}）`);
  return d;
}
