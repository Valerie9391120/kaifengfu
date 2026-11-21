// =====================================================
// 同步引擎
// 读写都先落在手机本地，马上能用；再加密了推上云端。
// 拉取时只认能解开、钥匙名对得上的记录。
// 本地还没传上去的改动优先，云端旧值不会盖掉它。
// 删除留一块“墓碑”，别的设备拉到就跟着删。
//
// 往下拉分两步（11 月 21 日改的）：先问云端从哪个时刻起哪几行改过、各是什么时候改的（只有钥匙名和时间），
// 再只把手里还没有的那几行取下来。为了不漏，每回都往回多问一分钟；那一分钟里已经拿到过的（同一行、同一个时间）记在 edge 里，不再取。
// 原来是一步连内容一起取：那一分钟里的几行每拉一回就重新下载一遍，哪怕手里早有了。最后改的多半是整段对话（一段对话存成一行），
// 手机开着每四十五秒、家里的闹钟每五分钟拉一回，对话越聊越长，Supabase 的流量一天比一天多，十一月超了免费的额度。
// 自己刚传上去的也记进 edge（传的时候云端回了时间），下回拉的时候不再取回来。
// =====================================================

import { seal, unseal, rowKeyFor } from "./vault.js";

export const PAGE = 25; // 取内容一回取几行
export const STAMP_PAGE = 500; // 问“哪几行改过”一回问几行（一行只有几十个字）
export const OVERLAP_MS = 60000;
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

// edge：往回多问的那一分钟里已经拿到过的那几行（云端的钥匙名 → 那一版的时间）。只留下回还会问到的（不早于 since 往回一分钟的），
// 早于这个的下回问不到，不用记。存成 [[钥匙名, 时间], …] 的字
export function trimEdge(edge, since, overlap = OVERLAP_MS) {
  if (!since) return;
  const from = tsMinus(since, overlap);
  for (const [k, t] of edge) if (cmpTs(t, from) < 0) edge.delete(k);
}
export function edgeFrom(text) {
  const edge = new Map();
  try {
    const list = typeof text === "string" ? JSON.parse(text) : null;
    if (Array.isArray(list)) for (const x of list) if (Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string") edge.set(x[0], x[1]);
  } catch (e) {}
  return edge;
}
// 这一行（钥匙名、时间）手里有了：edge 里记着同一个时间
export function hasVersion(edge, key, t) {
  const had = edge.get(key);
  return !!had && cmpTs(had, t) === 0;
}

export function createEngine({ local, remote, vault, uid, onError, stampPage = STAMP_PAGE }) {
  const cache = new Map();
  const ver = new Map();
  const dirty = new Set();
  const deleted = new Set();
  const subs = new Set();
  const statusSubs = new Set();
  let since = null;
  let edge = new Map(); // 见文件开头：往回多问的那一分钟里已经拿到过的那几行
  let edgeSaved = "[]";
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
    edgeSaved = (await local.getMeta("edge")) || "[]";
    edge = edgeFrom(edgeSaved);
    emit();
  }

  // edge 变了才写（本地的数据库）。写不成不要紧：下回多取一遍，不会错
  async function saveEdge() {
    trimEdge(edge, since);
    const text = JSON.stringify([...edge]);
    if (text === edgeSaved) return;
    try {
      await local.setMeta("edge", text);
      edgeSaved = text;
    } catch (e) {}
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
            // 版本号跟要传的那一份一起取（封的那一下又改了的，版本号对不上，留着下一轮）。原来是封完才取的：封的那一下改了，
            // 记成新的版本号、传上去的是旧的那一份，标成了已上传，下一回拉的时候云端那一份旧的回来盖掉了本地新的（10 月 26 日审拼豆作的时候认出来的）
            const version = ver.get(k);
            const isDel = deleted.has(k);
            const snapshot = isDel ? null : cache.get(k);
            const payload = isDel ? { k, d: 1 } : { k, v: snapshot };
            const value = await seal(vault, JSON.stringify(payload));
            batch.push({ k, version, isDel, snapshot, row: { user_id: uid, key: await rowKeyFor(vault, k), value } });
            chars += value.length;
            if (chars > MAX_BATCH_CHARS) break;
          }
          const stamps = await remote.upsert(batch.map((b) => b.row));
          // 云端回了每一行记的时间：这几行这一版就是这台设备传上去的，下回拉到同一个时间的不再取回来
          if (Array.isArray(stamps)) for (const st of stamps) if (st && st.key && st.updated_at) edge.set(st.key, st.updated_at);
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
        await saveEdge();
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
      // 取下来的一行：认得的放进本地；认不得的（解不开、钥匙名对不上）也算这一版拿到过了，下回不再取。
      // 放进本地的数据库出了岔子（抛错）的不记：下回再取
      const take = async (row) => {
        if (!row || !row.key || !row.key.startsWith("h_")) return;
        const got = () => row.updated_at && edge.set(row.key, row.updated_at);
        let p;
        try {
          p = JSON.parse(await unseal(vault, row.value));
        } catch (e) {
          return got();
        }
        if (!p || typeof p.k !== "string") return got();
        if ((await rowKeyFor(vault, p.k)) !== row.key) return got(); // 对不上的记录不认
        count++;
        if (dirty.has(p.k)) return got(); // 本地还没传上去的改动优先
        // 先放进本地的数据库、再换手里的：放不进去的那一回手里也不换，下回再取的时候还认得出它变了
        if (p.d) {
          if (cache.has(p.k)) {
            await local.deleteKv(p.k);
            if (dirty.has(p.k)) return; // 删的工夫里她又写了：她那一份优先（本地数据库里她那一份是后写的，还在）
            cache.delete(p.k);
            changed.add(p.k);
          }
        } else if (typeof p.v === "string" && cache.get(p.k) !== p.v) {
          await local.putKv({ k: p.k, v: p.v, dirty: 0, del: 0 });
          if (dirty.has(p.k)) return; // 放的工夫里她又改了（等着传上去的那一份优先），手里不换；这一版不算拿到
          cache.set(p.k, p.v);
          changed.add(p.k);
        }
        got();
      };
      try {
        const from = since ? tsMinus(since, OVERLAP_MS) : null;
        let cursor = null;
        let maxSeen = since;
        for (;;) {
          // 头一步：哪几行改过、什么时候（只有钥匙名和时间）
          const stamps = await remote.fetchStamps({ from, cursor, limit: stampPage });
          const need = [];
          for (const st of stamps) {
            if (!maxSeen || cmpTs(st.updated_at, maxSeen) > 0) maxSeen = st.updated_at;
            if (!st.key || !st.key.startsWith("h_")) continue;
            if (hasVersion(edge, st.key, st.updated_at)) continue; // 这一版手里有了
            need.push(st.key);
          }
          // 第二步：只取手里还没有的那几行。取到的可能比问的时候又新了一点，照取到的那一版记（since 只照头一步问到的往前挪，不漏）
          for (let i = 0; i < need.length; i += PAGE) {
            const rows = await remote.fetchRows(need.slice(i, i + PAGE));
            for (const row of rows) await take(row);
            emit({ pulled: count });
          }
          if (stamps.length < stampPage) break;
          const last = stamps[stamps.length - 1];
          cursor = { t: last.updated_at, k: last.key };
        }
        if (maxSeen && maxSeen !== since) {
          since = maxSeen;
          await local.setMeta("since", since);
        }
        await saveEdge();
        emit({ syncing: false, offline: false, error: "", lastSync: Date.now(), pulled: count });
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
    _debug: { cache, dirty, deleted, getSince: () => since, getEdge: () => edge },
  };
}
