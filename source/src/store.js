// 主体里读写存档都走这里。解锁之后由门口接上同步引擎。
let engine = null;

export function attachEngine(e) {
  engine = e;
}

export function currentEngine() {
  return engine;
}

export const store = {
  async get(key) {
    return engine ? engine.get(key) : null;
  },
  async set(key, value) {
    return engine ? engine.set(key, value) : false;
  },
  async del(key) {
    if (engine) await engine.del(key);
  },
  subscribe(fn) {
    return engine ? engine.subscribe(fn) : () => {};
  },
  onStatus(fn) {
    return engine ? engine.onStatus(fn) : () => {};
  },
  syncNow() {
    return engine ? engine.syncNow() : Promise.resolve(0);
  },
  exportAll() {
    return engine ? engine.exportAll() : {};
  },
  keys(prefix) {
    return engine ? engine.keys(prefix) : [];
  },
  // 切走之前：把还没传上去的改动马上推一遍（平时是攒一秒多再推）
  flush() {
    return engine ? engine.push() : Promise.resolve();
  },
  // 借钥匙用：封、拆、把名字打乱（见 engine.js）。还没进门就做不了
  seal(text) {
    return engine ? engine.seal(text) : Promise.reject(new Error("还没进门"));
  },
  unseal(sealed) {
    return engine ? engine.unseal(sealed) : Promise.reject(new Error("还没进门"));
  },
  nameFor(name) {
    return engine ? engine.nameFor(name) : Promise.reject(new Error("还没进门"));
  },
};
