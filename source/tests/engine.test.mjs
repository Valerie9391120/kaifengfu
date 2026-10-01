import "fake-indexeddb/auto";
import { deriveVault, newSalt, seal, unseal, rowKeyFor, CHECK_TEXT } from "../src/vault.js";
import { createEngine, cmpTs, tsMinus, PAGE } from "../src/engine.js";
import { localDb } from "../src/localdb.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 假云端：照 PostgREST 的规矩排序、过滤、翻页；同一批写入共用一个时间戳（像 Postgres 的 now()） ----
class FakeRemote {
  constructor() { this.rows = new Map(); this.clock = Date.UTC(2026, 9, 1, 14, 0, 0) * 1000; this.down = false; this.calls = 0; }
  stamp() {
    this.clock += 1234;
    const ms = Math.floor(this.clock / 1000), us = this.clock % 1000;
    const d = new Date(ms).toISOString().replace("Z", "");
    let frac = d.split(".")[1] + String(us).padStart(3, "0");
    frac = frac.replace(/0+$/, "");
    return d.split(".")[0] + (frac ? "." + frac : "") + "+00:00";
  }
  async upsert(rows) {
    this.calls++;
    if (this.down) throw new Error("network down");
    const t = this.stamp();
    for (const r of rows) this.rows.set(r.user_id + "|" + r.key, { ...r, updated_at: t });
  }
  async fetchPage({ from, cursor, limit }) {
    if (this.down) throw new Error("network down");
    let list = [...this.rows.values()];
    if (cursor) list = list.filter((r) => cmpTs(r.updated_at, cursor.t) > 0 || (cmpTs(r.updated_at, cursor.t) === 0 && r.key > cursor.k));
    else if (from) list = list.filter((r) => cmpTs(r.updated_at, from) >= 0);
    list.sort((a, b) => cmpTs(a.updated_at, b.updated_at) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return list.slice(0, limit).map(({ key, value, updated_at }) => ({ key, value, updated_at }));
  }
}

class FakeLocal {
  constructor() { this.kv = new Map(); this.meta = new Map(); }
  async allKv() { return [...this.kv.values()].map((r) => ({ ...r })); }
  async putKv(r) { this.kv.set(r.k, { ...r }); }
  async putManyKv(rs) { rs.forEach((r) => this.kv.set(r.k, { ...r })); }
  async deleteKv(k) { this.kv.delete(k); }
  async getMeta(id) { return this.meta.get(id) ?? null; }
  async setMeta(id, v) { this.meta.set(id, v); }
}

const salt = newSalt();
const t0 = Date.now();
const vault = await deriveVault("test-passphrase-123", salt);
console.log("（60万轮钥匙锻造用时", Date.now() - t0, "毫秒）");
const wrongVault = await deriveVault("暗号不对", salt);

// ---- 加密本身 ----
const sealed = await seal(vault, "今天吃火锅");
ok(sealed.startsWith("v1.") && !sealed.includes("火锅"), "加密后是乱码，看不出原文");
ok((await unseal(vault, sealed)) === "今天吃火锅", "同一个暗号解得开");
let wrongFailed = false; try { await unseal(wrongVault, sealed); } catch (e) { wrongFailed = true; }
ok(wrongFailed, "暗号不对解不开");
ok((await seal(vault, "同一句话")) !== (await seal(vault, "同一句话")), "同一句话每次加密结果都不一样");
const rk = await rowKeyFor(vault, "kfs2:diary:2026-10");
ok(/^h_[A-Za-z0-9_-]{32}$/.test(rk) && rk === (await rowKeyFor(vault, "kfs2:diary:2026-10")), "钥匙名被打乱成固定的一串，看不出是日记");
ok(rk !== (await rowKeyFor(wrongVault, "kfs2:diary:2026-10")), "换个暗号，打乱的结果也不一样");
const check = await seal(vault, CHECK_TEXT);
ok((await unseal(vault, check)) === CHECK_TEXT, "验暗号用的“开封府”三个字能对上");

// ---- 时间戳 ----
ok(cmpTs("2026-10-01T14:23:45.12345+00:00", "2026-10-01T14:23:45.123456+00:00") < 0, "微秒级的时间也比得出先后");
ok(cmpTs("2026-10-01T14:23:45+00:00", "2026-10-01T14:23:45.000001+00:00") < 0, "没有小数的时间也能比");
ok(tsMinus("2026-10-01T14:23:45.123456+00:00", 60000) === "2026-10-01T14:22:45.123Z", "往前倒一分钟");

// ---- 两台设备 ----
const remote = new FakeRemote();
const localA = new FakeLocal(), localB = new FakeLocal();
const A = createEngine({ local: localA, remote, vault, uid: "u1" });
const B = createEngine({ local: localB, remote, vault, uid: "u1" });
await A.load(); await B.load();

const photo = "data:image/jpeg;base64," + "Q".repeat(300000);
await A.set("kfs2:chat:abc", JSON.stringify([{ role: "her", text: "老公在吗" }]));
await A.set("kfs2:diary:2026-10", JSON.stringify({ "2026-10-01": { her: { moods: ["sweet"] } } }));
await A.set("kfs2:img:p1", photo);
ok(A.get("kfs2:chat:abc").includes("老公在吗") && A.getStatus().pending === 3, "A 先存在本地，马上读得到，三条排队等上传");
await A.push();
ok(A.getStatus().pending === 0 && remote.rows.size === 3, "A 推上云端，排队清空");
const cloudRows = [...remote.rows.values()];
const cloudText = cloudRows.map((r) => r.key + r.value).join("");
ok(!/[\u4e00-\u9fff]/.test(cloudText) && cloudRows.every((r) => /^h_[A-Za-z0-9_-]+$/.test(r.key) && /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(r.value)), "云端只有乱码：没有一个中文字，钥匙名全被打乱，内容全是密文");
ok(!cloudRows.some((r) => r.key.includes("kfs2") || r.value.includes("kfs2")), "云端连“kfs2:chat”这种记录名都看不到");
ok([...localA.kv.values()].every((r) => r.dirty === 0), "A 本地记录都标成已上传");

await B.pull();
ok(B.get("kfs2:chat:abc") === A.get("kfs2:chat:abc") && B.get("kfs2:img:p1") === photo, "B 拉下来，聊天和三十万字的照片都一字不差");
ok(B.get("kfs2:diary:2026-10").includes("sweet"), "B 的日记也到了");

// 删除
await A.del("kfs2:chat:abc");
await A.push();
let notified = [];
const unsub = B.subscribe((ks) => { notified = notified.concat(ks); });
await B.pull();
ok(B.get("kfs2:chat:abc") === null && notified.includes("kfs2:chat:abc"), "A 删了，B 拉到墓碑也跟着删，还通知了界面");
ok(!localA.kv.has("kfs2:chat:abc"), "A 本地的墓碑传完就清掉");
unsub();

// 本地没传上去的改动优先
await A.set("kfs2:settings", JSON.stringify({ model: "A的选择" }));
await A.push();
await B.set("kfs2:settings", JSON.stringify({ model: "B的选择" }));   // B 还没推
await B.pull();
ok(B.get("kfs2:settings").includes("B的选择"), "B 还没推上去的改动，不会被云端的旧值盖掉");
await B.push();
await A.pull();
ok(A.get("kfs2:settings").includes("B的选择"), "B 推上去之后，A 拉到 B 的新值");

// 同一批六十条，时间戳完全相同，翻页不漏
for (let i = 0; i < 60; i++) await A.set("kfs2:mem:" + String(i).padStart(2, "0"), "文档" + i);
await A.push();
const sameStamp = new Set([...remote.rows.values()].filter((r) => r.value).map((r) => r.updated_at));
const C = createEngine({ local: new FakeLocal(), remote, vault, uid: "u1" });
await C.load();
await C.pull();
const memKeys = C.keys("kfs2:mem:");
ok(memKeys.length === 60 && PAGE < 60, `新设备一次取回六十条同一时刻写入的记录，一页 ${PAGE} 条翻了三页，一条不漏`);

// 第二次拉取：只看最近一分钟，重复的不算变化
const callsBefore = remote.calls;
const changedAgain = await C.pull();
ok(changedAgain === 0, "再拉一次，没有新东西就不打扰界面");

// 暗号不对的设备
const W = createEngine({ local: new FakeLocal(), remote, vault: wrongVault, uid: "u1" });
await W.load();
await W.pull();
ok(W.keys("").length === 0, "暗号不对的设备，什么都解不开，也不会崩");

// 坏人把两条记录的内容对调
const rowsArr = [...remote.rows.values()].filter((r) => r.key.startsWith("h_"));
const kSettings = await rowKeyFor(vault, "kfs2:settings");
const kDiary = await rowKeyFor(vault, "kfs2:diary:2026-10");
const rS = remote.rows.get("u1|" + kSettings), rD = remote.rows.get("u1|" + kDiary);
const tmp = rS.value; rS.value = rD.value; rD.value = tmp;
rS.updated_at = rD.updated_at = remote.stamp();
const D = createEngine({ local: new FakeLocal(), remote, vault, uid: "u1" });
await D.load();
await D.pull();
ok(D.get("kfs2:settings") === null && D.get("kfs2:diary:2026-10") === null, "云端记录被对调过：钥匙名对不上，一律不认");

// 断网：排队等着，联网后补传
remote.down = true;
await A.set("kfs2:lastChat", "xyz");
await A.push();
ok(A.getStatus().offline === true && A.getStatus().pending === 1, "断网时记录留在本地排队，状态显示离线");
remote.down = false;
await A.push();
ok(A.getStatus().offline === false && A.getStatus().pending === 0, "联网后自动补传");

// 上传途中又改了：留着下一轮
const slow = new FakeRemote();
const origUpsert = slow.upsert.bind(slow);
let hold;
slow.upsert = (rows) => new Promise((res) => { hold = () => origUpsert(rows).then(res); });
const E = createEngine({ local: new FakeLocal(), remote: slow, vault, uid: "u1" });
await E.load();
await E.set("kfs2:chat:live", "第一版");
const pushing = E.push();
await sleep(50);
await E.set("kfs2:chat:live", "第二版");
hold();
await pushing;
ok(E.getStatus().pending === 1, "上传途中又改了一次：这一条留着，不会误标成已上传");
slow.upsert = origUpsert;
await E.push();
const F = createEngine({ local: new FakeLocal(), remote: slow, vault, uid: "u1" });
await F.load(); await F.pull();
ok(F.get("kfs2:chat:live") === "第二版", "下一轮补传的是最新的第二版");

// 关掉重开：没传上去的还在排队
const localG = new FakeLocal();
const G1 = createEngine({ local: localG, remote: new FakeRemote(), vault, uid: "u1" });
await G1.load();
await G1.set("kfs2:chat:offline", "没网时写的");
await G1.del("kfs2:chat:gone");
G1.stop();
const G2 = createEngine({ local: localG, remote: new FakeRemote(), vault, uid: "u1" });
await G2.load();
ok(G2.get("kfs2:chat:offline") === "没网时写的" && G2.getStatus().pending === 2, "app 关掉重开：没传上去的改动和删除都还在排队");

// ---- 真正的浏览器数据库（这里用模拟的 IndexedDB） ----
await localDb.putKv({ k: "a", v: "1", dirty: 1, del: 0 });
await localDb.putManyKv([{ k: "b", v: "2", dirty: 0, del: 0 }, { k: "c", v: null, dirty: 1, del: 1 }]);
await localDb.deleteKv("b");
const all = await localDb.allKv();
ok(all.length === 2 && all.find((r) => r.k === "a").v === "1" && all.find((r) => r.k === "c").del === 1, "本地存档：存、批量存、删、全部读出");
await localDb.setMeta("since", "2026-10-01T14:00:00+00:00");
ok((await localDb.getMeta("since")) === "2026-10-01T14:00:00+00:00", "同步进度记得住");
let vaultSaved = true;
try { await localDb.setVault({ uid: "u1", aes: vault.aes, mac: vault.mac }); } catch (e) { vaultSaved = String(e); }
if (vaultSaved === true) {
  const v = await localDb.getVault();
  const back = await unseal({ aes: v.aes }, await seal(vault, "记住钥匙"));
  ok(v.uid === "u1" && back === "记住钥匙", "这台设备记住的钥匙取出来照样能用");
} else console.log("（模拟的数据库存不了钥匙对象，留给真浏览器测：", vaultSaved, "）");
await localDb.wipe();
ok((await localDb.allKv()).length === 0 && (await localDb.getVault()) === null, "退出登录时本地清得干干净净");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
