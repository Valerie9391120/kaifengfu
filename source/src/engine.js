// =====================================================
// 同步引擎
// 读写都先落在手机本地，马上能用；再加密了推上云端。
// 拉取时只认能解开、钥匙名对得上的记录。
// 本地还没传上去的改动优先，云端旧值不会盖掉它。
// 删除留一块“墓碑”，别的设备拉到就跟着删。
// =====================================================

import { seal, unseal, rowKeyFor } from "./vault.js";

export const PAGE = 25;
const OVERLAP_MS = 60000;
const MAX_BATCH_CHARS = 1500000;

// Postgres 的时间戳 "2026-10-01T14:23:45.123456+00:00" → [毫秒, 微秒]，用来比大小
export function tsParts(s) {
  const m = /^(.+?)(?:\.(\d+))?([+-]\d\d:?\d\d|Z)$/.exec(String(s || ""));
  if (!m) return [Date.parse(s) || 0, 0];
  const frac = (m[2] || "").padEnd(6, "0").slice(0, 6);
  const ms = Date.parse(m[1] + "." + frac.slice(0, 3) + (m[3] === "Z" ? "Z" : m[3]));
  return [ms || 0, Number(frac.slice(3)) || 0];
}

export function cmpTs(a, b) {
  const x = tsParts(a);
  const y = tsParts(b);
  return x[0] - y[0] || x[1] - y[1];
}

export function tsMinus(s, ms) {
  return new Date(tsParts(s)[0] - ms).toISOString();
}

export function createEngine({ local, remote, vault, uid, onError }) {
  const cache = new Map();
  const ver = new Map();
  const dirty = new Set();
  const deleted = new Set();
  const subs = new Set();
  const statusSubs = new Set();
  let since = null;
  let status = { pending: 0, syncing: false, offline: false, lastSync: 0, error: "", pulled: 0 };
  let timer = null;
  let stopped = false;
  let chain = Promise.resolve();

  const emit = (patch = {}) => {
    status = { ...status, ...patch, pending: dirty.size };
    statusSubs.forEach((f) => {
      try {
        f(status);
      } catch (e) {}
    });
  };
  const bump = (k) => ver.set(k, (ver.get(k) || 0) + 1);

  // 推和拉排队进行
  const exclusive = (fn) => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  };

  async function load() {
    const recs = await local.allKv();
    for (const r of recs) {
      if (r.del) {
        if (r.dirty) {
          dirty.add(r.k);
          deleted.add(r.k);
          bump(r.k);
        }
        continue;
      }
      if (typeof r.v === "string") cache.set(r.k, r.v);
      if (r.dirty) {
        dirty.add(r.k);
        bump(r.k);
      }
    }
    since = (await local.getMeta("since")) || null;
    emit();
  }

  function get(k) {
    return cache.has(k) ? cache.get(k) : null;
  }

  function keys(prefix = "") {
    return Array.from(cache.keys()).filter((k) => k.startsWith(prefix));
  }

  function schedule(ms = 1200) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      push();
    }, ms);
  }

  async function set(k, v) {
    const value = typeof v === "string" ? v : String(v);
    cache.set(k, value);
    deleted.delete(k);
    dirty.add(k);
    bump(k);
    emit();
    let ok = true;
    try {
      await local.putKv({ k, v: value, dirty: 1, del: 0 });
    } catch (e) {
      ok = false;
      if (onError) onError(e);
    }
    schedule();
    return ok;
  }

  async function del(k) {
    cache.delete(k);
    deleted.add(k);
    dirty.add(k);
    bump(k);
    emit();
    try {
      await local.putKv({ k, v: null, dirty: 1, del: 1 });
    } catch (e) {
      if (onError) onError(e);
    }
    schedule();
  }

  function push() {
    if (stopped) return Promise.resolve();
    return exclusive(async () => {
      if (!dirty.size) return;
      emit({ syncing: true });
      try {
        while (dirty.size && !stopped) {
          const batch = [];
          let chars = 0;
          for (const k of Array.from(dirty)) {
            const isDel = deleted.has(k);
            const snapshot = isDel ? null : cache.get(k);
            const payload = isDel ? { k, d: 1 } : { k, v: snapshot };
            const value = await seal(vault, JSON.stringify(payload));
            batch.push({ k, version: ver.get(k), isDel, snapshot, row: { user_id: uid, key: await rowKeyFor(vault, k), value } });
            chars += value.length;
            if (chars > MAX_BATCH_CHARS) break;
          }
          await remote.upsert(batch.map((b) => b.row));
          const toPut = [];
          const toDelete = [];
          let progress = 0;
          for (const b of batch) {
            if (ver.get(b.k) !== b.version) continue; // 上传途中又改了，留着下一轮
            progress++;
            dirty.delete(b.k);
            if (b.isDel) {
              deleted.delete(b.k);
              toDelete.push(b.k);
            } else {
              toPut.push({ k: b.k, v: b.snapshot, dirty: 0, del: 0 });
            }
          }
          await local.putManyKv(toPut);
          for (const k of toDelete) await local.deleteKv(k);
          emit();
          if (!progress) break;
        }
        emit({ syncing: false, offline: false, error: "", lastSync: Date.now() });
        if (dirty.size && !stopped) schedule(800);
      } catch (e) {
        emit({ syncing: false, offline: true, error: String((e && e.message) || e) });
        if (!stopped) schedule(15000);
      }
    });
  }

  function pull() {
    if (stopped) return Promise.resolve(0);
    return exclusive(async () => {
      const changed = new Set();
      emit({ syncing: true, pulled: 0 });
      let count = 0;
      try {
        const from = since ? tsMinus(since, OVERLAP_MS) : null;
        let cursor = null;
        let maxSeen = since;
        for (;;) {
          const rows = await remote.fetchPage({ from, cursor, limit: PAGE });
          for (const row of rows) {
            if (!maxSeen || cmpTs(row.updated_at, maxSeen) > 0) maxSeen = row.updated_at;
            if (!row.key || !row.key.startsWith("h_")) continue;
            let p;
            try {
              p = JSON.parse(await unseal(vault, row.value));
            } catch (e) {
              continue;
            }
            if (!p || typeof p.k !== "string") continue;
            if ((await rowKeyFor(vault, p.k)) !== row.key) continue; // 对不上的记录不认
            count++;
            if (dirty.has(p.k)) continue; // 本地还没传上去的改动优先
            if (p.d) {
              if (cache.has(p.k)) {
                cache.delete(p.k);
                await local.deleteKv(p.k);
                changed.add(p.k);
              }
            } else if (typeof p.v === "string" && cache.get(p.k) !== p.v) {
              cache.set(p.k, p.v);
              await local.putKv({ k: p.k, v: p.v, dirty: 0, del: 0 });
              changed.add(p.k);
            }
          }
          emit({ pulled: count });
          if (rows.length < PAGE) break;
          const last = rows[rows.length - 1];
          cursor = { t: last.updated_at, k: last.key };
        }
        if (maxSeen && maxSeen !== since) {
          since = maxSeen;
          await local.setMeta("since", since);
        }
        emit({ syncing: false, offline: false, error: "", lastSync: Date.now() });
      } catch (e) {
        emit({ syncing: false, offline: true, error: String((e && e.message) || e) });
      }
      if (changed.size) {
        const list = Array.from(changed);
        subs.forEach((f) => {
          try {
            f(list);
          } catch (e) {}
        });
      }
      return changed.size;
    });
  }

  async function syncNow() {
    clearTimeout(timer);
    await push();
    return pull();
  }

  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  function onStatus(fn) {
    statusSubs.add(fn);
    fn(status);
    return () => statusSubs.delete(fn);
  }

  function exportAll() {
    const data = {};
    cache.forEach((v, k) => {
      data[k] = v;
    });
    return data;
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
  }

  return {
    load,
    get,
    keys,
    set,
    del,
    push,
    pull,
    syncNow,
    subscribe,
    onStatus,
    getStatus: () => status,
    exportAll,
    stop,
    // 借钥匙用（钥匙本身不往外交）：封一段字、拆一段字、把一个名字打乱成云端看不懂的样子。
    // 信箱那条路要用：条子用它封，通知网址里的对话记号用它打乱（见 mail.js）
    seal: (text) => seal(vault, text),
    unseal: (sealed) => unseal(vault, sealed),
    nameFor: (name) => rowKeyFor(vault, name),
    _debug: { cache, dirty, deleted, getSince: () => since },
  };
}
