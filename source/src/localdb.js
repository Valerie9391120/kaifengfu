// =====================================================
// 手机里的本地存档（IndexedDB）
// kv：每条记录 { k, v, dirty, del }，dirty 表示还没传上云端
// vault：这台设备记住的两把钥匙（不能导出）
// meta：同步进度
// =====================================================

const DB_NAME = "kfs-local";
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "k" });
      if (!db.objectStoreNames.contains("vault")) db.createObjectStore("vault", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("本地存档被占用"));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("本地存档写入中断"));
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const localDb = {
  async allKv() {
    const db = await openDb();
    return (await request(db.transaction("kv").objectStore("kv").getAll())) || [];
  },
  async putKv(rec) {
    const db = await openDb();
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(rec);
    await done(tx);
  },
  async putManyKv(recs) {
    if (!recs.length) return;
    const db = await openDb();
    const tx = db.transaction("kv", "readwrite");
    const s = tx.objectStore("kv");
    recs.forEach((r) => s.put(r));
    await done(tx);
  },
  async deleteKv(k) {
    const db = await openDb();
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(k);
    await done(tx);
  },
  async getMeta(id) {
    const db = await openDb();
    const r = await request(db.transaction("meta").objectStore("meta").get(id));
    return r ? r.value : null;
  },
  async setMeta(id, value) {
    const db = await openDb();
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ id, value });
    await done(tx);
  },
  async getVault() {
    const db = await openDb();
    return (await request(db.transaction("vault").objectStore("vault").get("vault"))) || null;
  },
  async setVault(rec) {
    const db = await openDb();
    const tx = db.transaction("vault", "readwrite");
    tx.objectStore("vault").put({ ...rec, id: "vault" });
    await done(tx);
  },
  async wipe() {
    const db = await openDb();
    const tx = db.transaction(["kv", "vault", "meta"], "readwrite");
    tx.objectStore("kv").clear();
    tx.objectStore("vault").clear();
    tx.objectStore("meta").clear();
    await done(tx);
  },
};
