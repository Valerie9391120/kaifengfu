// =====================================================
// 通知：接浏览器和云端的那一半（零件在 notify.js）
//
// 一条通知走的路：小后端（push 函数）加密、签名 → 苹果的推送服务 → 这台设备的系统 → 横幅。
// 这里管的是这台设备这一头：注册服务工作线程（sw.js）、问她要通知的许可、向推送服务订一个“门牌号”、
// 把门牌号记进登记簿（push_subs 表），小后端照着登记簿发。
// =====================================================
import { callPush, pushLedger, mailbox } from "./cloud.js";
import { PUSH_FLAG, PUSH_KEY, PUSH_AT, b64uToBytes, sameKey, pushSupport, isStandalone, subscriptionKey, subscriptionRow, entrancePage, pushHostOf, readNoticeMark, noticeMarkOfUrl } from "./notify.js";

const local = {
  get(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (e) {
      return "";
    }
  },
  set(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (e) {}
  },
};

const coded = (code, message) => Object.assign(new Error(message), { code });
const withTimeout = (promise, ms, message) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(coded("worker", message)), ms))]);

// sw.js 在网站根上。丁香的入口在 ./dingxiang/ 底下，页面里有 <base href="../">，
// 照 document.baseURI 算，两个入口算出来的是同一个文件、同一个范围
export const workerUrl = () => new URL("./sw.js", document.baseURI).href;
export const workerScope = () => new URL("./", document.baseURI).href;

let worker = null;
export function ensureWorker() {
  if (!worker) {
    worker = (async () => {
      await navigator.serviceWorker.register(workerUrl(), { scope: workerScope() });
      return await withTimeout(navigator.serviceWorker.ready, 10000, "通知的服务线程没起来");
    })();
    worker.catch(() => {
      worker = null;
    });
  }
  return worker;
}

// 动订阅、动登记簿的几件事（重新登记、换门牌号、开、关）一件一件排着做，不叠在一起：
// 叠着做的话，这个刚退订那个又订上，登记簿里会留下作废的行
let queue = Promise.resolve();
function serial(work) {
  const run = queue.then(work, work);
  queue = run.catch(() => {});
  return run;
}

async function currentSub() {
  const reg = await ensureWorker();
  return { reg, sub: await reg.pushManager.getSubscription() };
}

// 系统现在许不许发通知：granted 许了；denied 拒了；default 还没问过。
// 先看 Notification.permission；它说“没问过”的时候再问推送那一头。防的是 iOS 在主屏幕应用里许了以后它还报“没问过”
// （印象里有过这种说法，没查证；多问一句没有坏处）
async function permissionNow(reg) {
  let p = "default";
  try {
    p = Notification.permission;
  } catch (e) {}
  if (p === "granted" || p === "denied") return p;
  try {
    const s = await reg.pushManager.permissionState({ userVisibleOnly: true });
    if (s === "granted" || s === "denied") return s;
  } catch (e) {}
  return "default";
}

// 这份订阅和服务器现在的公钥对不对得上。浏览器不肯说是拿哪把订的，就看当时记下的那把；都不知道就当对得上
function matches(sub, serverKey) {
  const known = subscriptionKey(sub) || local.get(PUSH_KEY);
  return !known || !serverKey || sameKey(known, serverKey);
}

async function subscribeAndRecord(reg, sub, serverKey) {
  if (sub && !matches(sub, serverKey)) {
    // 密钥柜里的钥匙换过：旧的订阅苹果不会再收，退掉重订，登记簿里旧的那行也划掉
    try {
      await pushLedger.remove(sub.endpoint);
    } catch (e) {}
    try {
      await sub.unsubscribe();
    } catch (e) {}
    sub = null;
  }
  if (!sub) {
    const bytes = b64uToBytes(serverKey);
    if (!bytes) throw coded("nokey", "还不知道服务器的公钥");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  }
  const row = subscriptionRow(sub, await pushLedger.myId(), entrancePage(window.location));
  if (!row) throw coded("badsub", "浏览器给的订阅不完整");
  await pushLedger.upsert(row);
  if (serverKey) local.set(PUSH_KEY, serverKey);
  local.set(PUSH_AT, row.endpoint);
  return sub;
}

// 开过通知的设备，每次打开开封府都重新登记一遍：门牌号被系统换了、上回登记没传上去，都在这儿补上。
// 不弹任何东西；没开过、许可被收回了，就什么都不做。serverKey 没给就用上回记下的
export function resyncPush(serverKey = "") {
  return serial(() => resyncNow(serverKey));
}
async function resyncNow(serverKey) {
  if (local.get(PUSH_FLAG) !== "on") return "off";
  if (!pushSupport(window).ok) return "blocked";
  const found = await currentSub();
  let sub = found.sub;
  const allowed = (await permissionNow(found.reg)) === "granted";
  if (!sub && !allowed) return "blocked"; // 许可被收回了：重订不了，等她自己再开
  if (sub && allowed) {
    // 订阅还在，登记簿里却没有这台设备：多半是推送服务说这个门牌号作废了，小后端把它划掉了
    // （每回订阅都是订完马上登记，平白少一行只有这一种来路）。作废的门牌号留着也收不到，退掉重订一个。
    // 登记簿读不到（没网）就到此为止，不动订阅
    const rows = await pushLedger.list();
    if (!rows.some((r) => r.endpoint === sub.endpoint)) {
      try {
        await sub.unsubscribe();
      } catch (e) {}
      sub = null;
    }
  }
  // 许可不在的时候只把现有的订阅重新登记一遍，不拿钥匙去比：比出不一样要退订重订，重订又订不上，反倒把好好的订阅弄没了
  await subscribeAndRecord(found.reg, sub, allowed ? serverKey || local.get(PUSH_KEY) : "");
  return "ok";
}

// 这台设备的门牌号作废了（推送服务回 404、410）：退掉，重新订一个、登记上。许可还在，不用她再点
// 她已经把通知关了就什么都不做，回 false（关掉以后订阅没了，也像是“作废”，不能因此又替她订上）
export function renewPush(serverKey = "") {
  return serial(async () => {
    if (local.get(PUSH_FLAG) !== "on") return false;
    const { reg, sub } = await currentSub();
    if (sub) {
      try {
        await pushLedger.remove(sub.endpoint);
      } catch (e) {}
      try {
        await sub.unsubscribe();
      } catch (e) {}
    }
    await subscribeAndRecord(reg, null, serverKey || local.get(PUSH_KEY));
    return true;
  });
}

// 看一遍现在是什么情形，给面板用。不弹任何东西
export async function checkPush() {
  const support = pushSupport(window);
  const state = {
    support,
    standalone: isStandalone(window),
    permission: support.ok ? Notification.permission : "",
    // 她在 Supabase 要做的三样，各自好了没有：ok 好了；别的是没好的缘故。
    // 后两样是“他的回话也敲她”要的：relay 是 push 函数会不会替她等回话（ok 会；old 还是旧的那份代码），mail 是信箱那张表
    setup: { table: "", fn: "", keys: "", say: "", relay: "", mail: "" },
    ready: false, // 三样都好了
    replyReady: false, // 他的回话也能敲她了（push 函数是新的、信箱建好了）
    away: false, // 开过通知的设备，这会儿连不上后端
    serverKey: "",
    on: false,
    host: "",
    endpoint: "",
    devices: 0,
    last: null,
    worker: "",
    flag: local.get(PUSH_FLAG) === "on",
  };
  if (!support.ok) return state;

  try {
    let k;
    try {
      k = await callPush({ op: "key" });
    } catch (e) {
      // 一时没连上（刚解锁、刚切回来，网络还没醒）：等一下再试一回，别因为这一下就说小后端没接上
      if (e.code !== "unreachable") throw e;
      await new Promise((done) => setTimeout(done, 900));
      k = await callPush({ op: "key" });
    }
    if (!k || typeof k.configured !== "boolean") {
      // 有 push 这个函数，答的却不是开封府那份代码该答的话（多半是建函数的时候里面还是 Supabase 给的样板）
      state.setup.fn = "wrong";
      state.setup.say = String((k && (k.message || k.msg)) || "").slice(0, 120);
    } else {
      state.setup.fn = "ok";
      state.setup.relay = Array.isArray(k.can) && k.can.includes("reply") ? "ok" : "old";
      if (k.configured) {
        state.setup.keys = "ok";
        state.serverKey = k.publicKey;
      } else {
        state.setup.keys = (k.missing || []).length >= 3 ? "missing" : "bad";
        state.setup.say = k.message || "";
      }
    }
  } catch (e) {
    state.setup.fn = e.code === "auth" ? "auth" : e.code === "refused" ? "refused" : "unreachable";
    state.setup.say = e.message || "";
  }

  const readLedger = async () => {
    try {
      const rows = await pushLedger.list();
      state.setup.table = "ok";
      state.devices = rows.length;
      return rows;
    } catch (e) {
      state.setup.table = e.code === "notable" ? "missing" : "error";
      if (e.code !== "notable" && !state.setup.say) state.setup.say = e.message || "";
      return null;
    }
  };
  let rows = await readLedger();
  state.ready = state.setup.fn === "ok" && state.setup.keys === "ok" && state.setup.table === "ok";
  try {
    await mailbox.probe();
    state.setup.mail = "ok";
  } catch (e) {
    state.setup.mail = e.code === "notable" ? "missing" : "error";
  }
  state.replyReady = state.ready && state.setup.relay === "ok" && state.setup.mail === "ok";
  // 这台设备开过通知（那时候三样都是好的），现在却连不上：是这会儿的网络，不是她在 Supabase 少做了什么
  state.away = state.flag && (state.setup.fn === "unreachable" || state.setup.table === "error");
  if (!state.ready) return state;

  try {
    // 开过的设备顺手修一修（钥匙换过就重订、登记簿里没有就补上），修完重读一遍
    if (state.flag) {
      try {
        if ((await resyncPush(state.serverKey)) === "ok") rows = (await readLedger()) || rows;
      } catch (e) {}
    }
    const { reg, sub } = await currentSub();
    state.worker = "ok";
    state.permission = await permissionNow(reg);
    if (sub) {
      state.endpoint = sub.endpoint;
      state.host = pushHostOf(sub.endpoint);
      const row = rows.find((r) => r.endpoint === sub.endpoint);
      // 开着：她在这台设备上开过、订阅在、登记簿里有、钥匙对得上、系统没拒绝
      state.on = state.flag && state.permission !== "denied" && !!row && matches(sub, state.serverKey);
      if (row && row.last_at) state.last = { at: Date.parse(row.last_at), status: row.last_status, note: row.last_note || "", host: state.host };
    }
  } catch (e) {
    state.worker = (e && e.message) || "出错了";
  }
  return state;
}

// 开启通知。必须直接从她点的那一下里调用：iPhone 只在手指点下去的那一刻肯弹“允许通知吗”，
// 所以问许可是这里的头一件事，前面不能先等别的
export async function enablePush(serverKey = "") {
  let permission = "";
  try {
    permission = await Notification.requestPermission();
  } catch (e) {}
  return serial(async () => {
    const { reg, sub } = await currentSub();
    if (permission !== "granted") permission = await permissionNow(reg);
    if (permission !== "granted") return { ok: false, why: permission === "denied" ? "denied" : "dismissed" };
    let key = serverKey;
    if (!key) {
      const k = await callPush({ op: "key" });
      if (!k.configured) throw coded("nokey", k.message || "密钥柜里的钥匙还没放好");
      key = k.publicKey;
    }
    await subscribeAndRecord(reg, sub, key);
    local.set(PUSH_FLAG, "on");
    return { ok: true, why: "" };
  });
}

// 关掉：退订，登记簿里划掉这台设备。哪一步没做成都接着往下做。
// 先退订：这一步不靠网络，做了门牌号就作废，这台设备再也收不到。登记簿没划掉也不要紧，
// 小后端下回发的时候推送服务会说这个门牌号没了，它自己划掉
export function disablePush() {
  // “开过”的记号马上清：排在前头还没做完的重新登记、换门牌号，看到记号没了就不会又订上
  local.set(PUSH_FLAG, "");
  local.set(PUSH_KEY, "");
  local.set(PUSH_AT, "");
  return serial(async () => {
    if (!pushSupport(window).ok) return;
    let sub = null;
    try {
      const reg = await navigator.serviceWorker.getRegistration(workerScope());
      sub = reg ? await reg.pushManager.getSubscription() : null;
    } catch (e) {}
    if (!sub) return;
    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
    } catch (e) {}
    try {
      await pushLedger.remove(endpoint);
    } catch (e) {}
  });
}

// 往这一台设备发一条测试通知。delay 是等几秒再发（给她留出锁屏的工夫）
export async function sendTestPush(delay = 0) {
  const { sub } = await currentSub();
  if (!sub) throw coded("nosub", "这台设备还没开通知");
  return await callPush({ op: "test", endpoint: sub.endpoint, delay });
}

// 这台设备上一回发得怎么样（小后端记在登记簿里）。登记簿里已经没有这台设备了就回 { gone: true }；她把通知关了回 { off: true }
export async function lastOutcome() {
  if (local.get(PUSH_FLAG) !== "on") return { off: true };
  const { sub } = await currentSub();
  if (!sub) return { gone: true };
  const row = (await pushLedger.list()).find((r) => r.endpoint === sub.endpoint);
  if (!row) return { gone: true };
  return row.last_at ? { at: Date.parse(row.last_at), status: row.last_status, note: row.last_note || "", host: pushHostOf(sub.endpoint) } : { at: 0 };
}

// ---------- 他的回话也敲她（第二步，见 mail.js） ----------

// 他的回话到了，敲哪几台设备：只有这一台（它开着通知的话）。
// 不照登记簿全敲：登记簿是明文的，偷到登录密码（没有暗号）的人能往里添一行自己的设备；
// 要是照登记簿全敲，横幅上他说的话就落到别人手里了。发话的这台设备自己报门牌号，小后端只敲报上来的
export function knockList() {
  const at = local.get(PUSH_FLAG) === "on" ? local.get(PUSH_AT) : "";
  return at ? [at] : [];
}

// 轻轻问一声：替她等回话的那条新路通不通（不带对话，两下很小的敲门）。
// true 通；false 不通（小后端还是旧的、里面是样板、没建，或者信箱那张表没建）；null 没问成（没网、没登录）
export async function probeReply() {
  let fn = await askPushCanReply();
  let box = null;
  try {
    await mailbox.probe();
    box = true;
  } catch (e) {
    box = e.code === "notable" ? false : null;
  }
  if (fn === true && box === true) return true;
  if (fn === false || box === false) return false;
  if (fn === "away" && box === true) {
    // 信箱看得到、小后端却没连上。可能只是头一下网络还没醒（刚解锁、刚切回来）：再敲一回
    fn = await askPushCanReply();
    if (fn === true) return true;
    // 还是连不上（或者这回它自己说接不了）：不是没网，是那条路不通（多半是根本没有 push 这个函数）
    if (fn === "away" || fn === false) return false;
  }
  return null;
}

// 问一回小后端接不接得了回话。true 接得了；false 接不了（它自己答的：还是旧的那份、里面是样板、不认这个人）；
// "away" 没连上（没网，或者根本没有这个函数）；null 没问成
async function askPushCanReply() {
  try {
    const k = await callPush({ op: "key" });
    return !!k && Array.isArray(k.can) && k.can.includes("reply");
  } catch (e) {
    if (e.code === "unreachable") return "away";
    if (e.code !== "refused") return null;
    // 半路上的网关一时出了岔子（5xx）、嫌敲得太勤（429）、登录凭证没带对（401）：这些说明不了小后端接不接得了回话。
    // 算没问成，下回再问；为这一下把新路关上三分钟不值当
    if (e.status === 401 || e.status === 429 || (e.status >= 500 && !e.own)) return null;
    return false;
  }
}

// ---------- 从通知回来 ----------

// 开封府自己待着的那一格历史上做个记号。系统换网址的时候新添的那一格没有这个记号，认得出来
const HOME = "kfs-home";
const atHome = () => !!(window.history.state && window.history.state.kfs === HOME);
function tagHome() {
  try {
    if (!atHome()) window.history.replaceState({ kfs: HOME }, "");
  } catch (e) {}
}

// 网址后面带着通知的记号（#n=…）就取下来，顺手把网址收拾干净：
// 下一条通知的记号不一样，系统打开它的时候页面只当是换了个井号，不会整页重来。
// inPage：开封府开着的时候网址被换的（不是刚被叫起来）。这种时候浏览器会多添一格历史；
// iPhone 的主屏幕应用里，历史一有能退的，从屏幕左边往右划就成了“后退”，会和拉出侧栏的手势抢。
// 所以把新添的那格也收拾干净，再退回原来那一格（两格网址一样，往前往后都不会再有动静）
export function takeNoticeMark(inPage = false) {
  const mark = readNoticeMark(window.location.hash);
  if (!mark) return "";
  const added = inPage && !atHome();
  try {
    window.history.replaceState(added ? null : { kfs: HOME }, "", window.location.pathname + window.location.search);
    if (added) window.history.back();
  } catch (e) {}
  return mark;
}

// 她点了一条通知回到开封府：fn(记号)。三条路都接上：
//   开封府是被通知叫起来的（网址里带着记号）；开着的时候系统把网址换成带记号的（hashchange）；
//   老一些的浏览器由 sw.js 发话过来
export function watchNotices(fn) {
  const fromHash = (e) => {
    const mark = takeNoticeMark(!!e);
    if (mark) fn(mark);
  };
  const fromWorker = (e) => {
    const mark = e.data && e.data.type === "kfs-notice" ? noticeMarkOfUrl(e.data.target) : "";
    if (mark) fn(mark);
  };
  fromHash();
  tagHome();
  window.addEventListener("hashchange", fromHash);
  const sw = navigator.serviceWorker;
  if (sw) sw.addEventListener("message", fromWorker);
  return () => {
    window.removeEventListener("hashchange", fromHash);
    if (sw) sw.removeEventListener("message", fromWorker);
  };
}
