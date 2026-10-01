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
};
