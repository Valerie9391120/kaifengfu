// =====================================================
// 闹钟的存档：她的第二台设备，跟手机同一份存档、同一把钥匙。
// 跟手机那头（src/engine.js）一样从云端一页一页拉、只认解得开、钥匙名对得上的；写的时候封好推上去。
// 不一样的是存在这台电脑上的样子：手机把解开的存在浏览器的数据库里（那是她手机自己的地方）；
// 这里是电脑上的一个文件夹，所以磁盘上只放云端原样的密文（一行一个文件），要用的时候再解。
// 内存里只留：每样东西在云端叫什么（钥匙名 → 那一行）；不大的那些（聊天、日记、设置……）解开的字；
// 大的（照片、语音、她发的文档、聊长了的对话）用到的时候从磁盘上取出来现解。
// 闹钟写东西不多（醒一回写几样），不攒着：写一样推一样，推不上去就照实报错，下回再来。
//
// 一样东西明明有、却读不出来（磁盘上那个文件坏了、一时打不开）：抛错，不当它没有。
// 当成没有的话，接着往上写的就是一份只有新几行的对话、只有一条的目录，会把云端那份好好的盖掉（另一双眼睛挑出来的）。
// 打开的时候磁盘上有文件坏了：扔掉，下回从头再拉一遍（不然那一样就再也拉不回来了）
// =====================================================
import fs from "node:fs";
import path from "node:path";
import { seal, unseal, rowKeyFor } from "../src/vault.js";
import { tsMinus, cmpTs, PAGE } from "../src/engine.js";

const OVERLAP_MS = 60000; // 同手机：往回多拉一分钟，免得两边钟点差一点漏掉
const BIG = 200000; // 比这长的不在内存里留解开的字，用到再解

const hex = (s) => Buffer.from(s, "utf8").toString("hex");
const coded = (code, message) => Object.assign(new Error(message), { code });
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// 写一个文件：先写到旁边一个临时的，落到盘上（fsync）再换过去：写到一半断了电，原来那份还在。
// 临时的那个名字里带着进程号：两个进程（后台那一个、她手敲的 setup）碰巧写同一个文件，各写各的，不互相踩。
// Windows 上杀毒、建索引的时候会一时占着文件，换不过去就歇一下再换
export function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (i >= 8 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      pause(50 * (i + 1));
    }
  }
}

// dir：这台电脑上放存档的文件夹；vault：两把钥匙（src/vault.js）；cloud：alarm/cloud.js
export function createStore({ dir, vault, cloud }) {
  const rowsDir = path.join(dir, "rows");
  const metaFile = path.join(dir, "meta.json");
  const rowOf = new Map(); // 逻辑上的名字（kfs2:…） → 云端的钥匙名（h_…）
  const plain = new Map(); // 逻辑上的名字 → 解开的字（不大的那些）
  let since = null;
  const fileOf = (rowKey) => path.join(rowsDir, hex(rowKey) + ".json");

  // 打开：磁盘上攒着的那几行挨个解开，记下每一行是什么。坏了的、解不开的、对不上的扔掉，下回从头再拉一遍
  async function open() {
    fs.mkdirSync(rowsDir, { recursive: true });
    try {
      since = JSON.parse(fs.readFileSync(metaFile, "utf8")).since || null;
    } catch (e) {
      since = null;
    }
    let dropped = 0;
    for (const f of fs.readdirSync(rowsDir)) {
      const full = path.join(rowsDir, f);
      if (f.endsWith(".tmp")) {
        fs.rmSync(full, { force: true });
        continue;
      }
      if (!f.endsWith(".json")) continue;
      const rowKey = Buffer.from(f.slice(0, -5), "hex").toString("utf8");
      let k = null;
      try {
        const rec = JSON.parse(fs.readFileSync(full, "utf8"));
        k = await take(rowKey, rec.v, rec.t, false);
      } catch (e) {}
      if (!k) {
        fs.rmSync(full, { force: true });
        dropped++;
      }
    }
    if (dropped) {
      since = null;
      writeAtomic(metaFile, JSON.stringify({ since }));
    }
    return dropped;
  }

  // 一行密文 → 记下来。save：同时写到磁盘上（从云端刚拉下来的）。回这一行是哪样东西（逻辑上的名字），认不得回 null
  async function take(rowKey, sealed, t, save = true) {
    if (!rowKey || !rowKey.startsWith("h_")) return null;
    let p;
    try {
      p = JSON.parse(await unseal(vault, sealed));
    } catch (e) {
      return null;
    }
    if (!p || typeof p.k !== "string") return null;
    if ((await rowKeyFor(vault, p.k)) !== rowKey) return null;
    if (p.d) {
      rowOf.delete(p.k);
      plain.delete(p.k);
      if (save) fs.rmSync(fileOf(rowKey), { force: true });
      return p.k;
    }
    if (typeof p.v !== "string") return null;
    if (save) writeAtomic(fileOf(rowKey), JSON.stringify({ t, v: sealed }));
    rowOf.set(p.k, rowKey);
    if (p.v.length <= BIG) plain.set(p.k, p.v);
    else plain.delete(p.k);
    return p.k;
  }

  // 从云端往下拉（同 src/engine.js 的 pull）：回这一回变了的那几样（逻辑上的名字）
  async function pull(onPage) {
    const changed = new Set();
    const from = since ? tsMinus(since, OVERLAP_MS) : null;
    let cursor = null;
    let maxSeen = since;
    let count = 0;
    for (;;) {
      const rows = await cloud.fetchPage({ from, cursor, limit: PAGE });
      for (const row of rows) {
        if (!maxSeen || cmpTs(row.updated_at, maxSeen) > 0) maxSeen = row.updated_at;
        // 往回多拉的那一分钟里，磁盘上已经是原样的那几行：不用再解
        if (row.value === sealedOf(row.key)) continue;
        const k = await take(row.key, row.value, row.updated_at);
        if (k) changed.add(k);
        count++;
      }
      if (onPage) onPage(count);
      if (rows.length < PAGE) break;
      const last = rows[rows.length - 1];
      cursor = { t: last.updated_at, k: last.key };
    }
    if (maxSeen && maxSeen !== since) {
      since = maxSeen;
      writeAtomic(metaFile, JSON.stringify({ since }));
    }
    return [...changed];
  }

  // 磁盘上那一行的密文（云端原样的那一串）；没有回 ""
  function sealedOf(rowKey) {
    try {
      return JSON.parse(fs.readFileSync(fileOf(rowKey), "utf8")).v || "";
    } catch (e) {
      return "";
    }
  }

  // 同步取（只取得到不大的那些；大的回 null）：src/tongye/host.js 的 tyReader 要这么取
  const peek = (k) => (plain.has(k) ? plain.get(k) : null);

  // 取一样：没有回 null；有、却读不出来，抛错
  async function get(k) {
    if (plain.has(k)) return plain.get(k);
    const rowKey = rowOf.get(k);
    if (!rowKey) return null;
    try {
      const rec = JSON.parse(fs.readFileSync(fileOf(rowKey), "utf8"));
      const p = JSON.parse(await unseal(vault, rec.v));
      if (p && p.k === k && typeof p.v === "string") return p.v;
    } catch (e) {}
    throw coded("store", `存档里有这一样，可读不出来（${k.replace(/:[^:]*$/, ":…")}）`);
  }

  const keys = (prefix = "") => [...rowOf.keys()].filter((k) => k.startsWith(prefix));
  const has = (k) => rowOf.has(k);

  // 写一样：封好推上去，推上去了再记下来。推不上去抛错（照实报，下回再来）
  async function put(k, payload) {
    const rowKey = await rowKeyFor(vault, k);
    const sealed = await seal(vault, JSON.stringify(payload));
    await cloud.upsert([{ key: rowKey, value: sealed }]);
    await take(rowKey, sealed, new Date().toISOString());
    return true;
  }
  const set = (k, v) => put(k, { k, v: typeof v === "string" ? v : String(v) });
  const del = (k) => put(k, { k, d: 1 });

  return {
    open,
    pull,
    peek,
    get,
    keys,
    has,
    set,
    del,
    nameFor: (name) => rowKeyFor(vault, name),
    // 那一样眼下在云端（照最近一回拉到的）是哪一串密文：认“是不是还是闹钟自己写的那一份”用（见 main.js 的核对）
    sealedOfKey: async (k) => sealedOf(await rowKeyFor(vault, k)),
    // 拿同一把钥匙封一段字、解一段字：闹钟自己记在这台电脑上的东西（state.json 里他的话）也只存密文
    sealText: (text) => seal(vault, text),
    unsealText: (text) => unseal(vault, text),
    size: () => rowOf.size,
  };
}
