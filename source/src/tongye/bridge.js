// 同页那一页里头一个跑的脚本（tools/tongye.mjs 把它塞进 <head> 最前面，记了指纹）：把开封府接上。
//
// 同页是别人写的程序，关在一个隔开的框里（sandbox，没有 allow-same-origin）：它碰不到开封府的网页、存档、钥匙，
// 只能跟外面那一层（TongyeFrame.jsx）说话（postMessage），外面那一层只认这一本手帐自己的几样（见 host.js 的 makeServer）：
//   - 这一本的存档：kfs2:ty:<集合>/<id>（同页的 db）、kfs2:tyls:<键>（同页存在“这台设备上”的那几样）
//   - 这一本的照片：kfs2:jzimg:<编号>；存档里写 kfsimg:<编号>，用的时候换成这一页里的 blob: 地址
//   - 某一天聊天里的原话、聊天里的照片（引用栏、放照片要用）
// 日子：同页写“月.日”，开封府存“年-月-日”（见 dates.js）。
// 同页用 localStorage 是同步的：开门那一下外面把小的那几样（kfs2:tyls:，大的缓存不要）放在框的名字里带进来（window.name），读完就清掉。
// 没从开封府里打开（单独打开这一页）：什么都不接、不存，只说一句。
import { toFull, toMd, pathToStore, idFromStore, lsKeyToStore, lsKeyFromStore, mdOf, fullOf, DAY_LS } from "./dates.js";

const KV = "kfs2:ty:";
const LS = "kfs2:tyls:";
const IMG = "kfsimg:";
const TAG = "kfs-ty:";
// 同页存在“这台设备上”的几样里，这几样是 db 里那几样的缓存（大，还会越攒越多）：不要，同页自己会从 db 再取
const LS_SKIP = /^(journalPage|journalGens|journalNotes):|^(journalMine|journalDays)$/;

let INIT = null;
try {
  const s = window.name;
  if (s && s.startsWith(TAG)) INIT = JSON.parse(s.slice(TAG.length));
  window.name = "";
} catch (e) {
  INIT = null;
}
const PARENT = window.parent && window.parent !== window ? window.parent : null;
const ON = !!(INIT && PARENT);

// “今天”：外面带进来的（翻一年以前的页的时候挪到那一天）。开着的时候不往前走（同页自己的“今天”也是打开那一下定的）：
// 过了半夜还开着，日子换算照旧，写的还是打开时那一天、那一年
const T0 = ON && Number.isFinite(INIT.today) ? INIT.today : Date.now();
const today = () => new Date(T0);
// 每一回问外面都带着这一个暗号（开门的时候外面给的，只在这一段里）：框里换成了别的网页，它问什么外面都不理
const TOK = ON && typeof INIT.tok === "string" ? INIT.tok : "";
// 同页里几处“今天”（本子首页的日子、热力图的最后一格……）照这个（tools/tongye.mjs 换的）
window.__kfsToday = today;

// ---------- 跟外面说话：一问一答（postMessage） ----------
let seq = 0;
const waiting = new Map();
const watchers = new Set();
const lsCache = new Map(ON ? Object.entries(INIT.ls || {}) : []);
function ask(method, args) {
  if (!ON) return Promise.reject(new Error("没在开封府里"));
  const id = ++seq;
  return new Promise((res, rej) => {
    waiting.set(id, { res, rej });
    PARENT.postMessage({ kfsTy: 1, tok: TOK, id, method, args }, "*");
  });
}
const tellOut = (method, args) => ON && PARENT.postMessage({ kfsTy: 1, tok: TOK, method, args }, "*");
const setSafe = (s) => {
  const r = document.documentElement.style;
  for (const k of ["t", "b", "l", "r"]) if (Number.isFinite(s[k])) r.setProperty("--safe-" + k, s[k] + "px");
};
if (ON) {
  if (INIT.safe) setSafe(INIT.safe);
  window.addEventListener("message", (e) => {
    if (e.source !== PARENT) return;
    const d = e.data;
    if (!d || d.kfsTy !== 1) return;
    if (d.re) {
      const w = waiting.get(d.re);
      if (!w) return;
      waiting.delete(d.re);
      if (d.ok) w.res(d.value);
      else w.rej(new Error(d.error || "出错了"));
      return;
    }
    if (d.safe) setSafe(d.safe);
    if (Array.isArray(d.changed)) {
      const keys = [];
      for (const [k, v] of d.changed) {
        if (typeof k !== "string") continue;
        if (k.startsWith(LS)) {
          if (v == null) lsCache.delete(k);
          else lsCache.set(k, String(v));
        }
        keys.push([k, v]);
      }
      watchers.forEach((f) => {
        try {
          f(keys);
        } catch (er) {}
      });
    }
  });
}

// ---------- 照片：kfsimg:<编号> ↔ 这一页里的 blob: 地址 ----------
const blobs = new Map(); // 编号 → 地址
const owners = new Map(); // 地址 → 编号
function dataToBlob(data) {
  const i = data.indexOf(",");
  const type = (/data:([^;,]+)/.exec(data.slice(0, i)) || [])[1] || "image/jpeg";
  const bin = atob(data.slice(i + 1));
  const buf = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) buf[j] = bin.charCodeAt(j);
  return new Blob([buf], { type });
}
const own = (id, url) => {
  blobs.set(id, url);
  owners.set(url, id);
};
const deep = (v, f) => {
  if (typeof v === "string") return f(v);
  if (Array.isArray(v)) return v.map((x) => deep(x, f));
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = deep(v[k], f);
    return o;
  }
  return v;
};
async function imgsIn(v) {
  const need = new Set();
  deep(v, (s) => {
    if (s.startsWith(IMG) && !blobs.has(s.slice(IMG.length))) need.add(s.slice(IMG.length));
    return s;
  });
  await Promise.all(
    [...need].map(async (id) => {
      try {
        const data = await ask("img", { id });
        if (typeof data === "string" && data.startsWith("data:image/")) own(id, URL.createObjectURL(dataToBlob(data)));
      } catch (e) {}
    })
  );
  return deep(v, (s) => (s.startsWith(IMG) ? blobs.get(s.slice(IMG.length)) || "" : s));
}
const imgsOut = (v) => deep(v, (s) => (s.startsWith("blob:") && owners.has(s) ? IMG + owners.get(s) : s));
const fromStore = (v) => imgsIn(toMd(v, today()));
const toStore = (v) => toFull(imgsOut(v), today());
const parseJson = (s) => {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
};

// ---------- 刚打开、还没换到要看的那一天之前：同页按它自带的那一天（9.26）摆过一遍，那时候写的不存 ----------
// 换天（journalSetDay 里 PAGE_DAY 换过来那一下，tools/tongye.mjs 在那儿加了一句 __kfsOpened）以后才放开
let opened = false;
window.__kfsOpened = () => {
  opened = true;
};
const lsHead = (k) => {
  const i = String(k).lastIndexOf(":");
  return i < 0 ? "" : k.slice(0, i);
};
const lsHeld = (k) => !opened && DAY_LS.includes(lsHead(k));
const pathHeld = (p) => !opened && /^(page|gens)\//.test(String(p));

// ---------- 同页自己存那一页（savePage，tools/tongye.mjs 在它开头问 __kfsSaveOk）：三样都对上才存 ----------
//   1. 那一天的页从存档里取回来了（pageRef.get 回来了：__kfsPageIn）。没回来之前同页先摆一页空的，那时候存，真的那一页就被盖了
//   2. 她在这一天真的动过手（在纸上、贴纸栏、加东西那一排、下面弹出来的那几层里点、按、打字）。光点开不算：
//      同页自己挪那一张 me1、把取回来的页再摆一遍，都会叫它存一回，存的是原样，可另一台设备做好、这台还没同步下来的那一页，会被这边自动存的空页盖掉
//   3. 照片库取齐了（不齐的时候她放的照片摆不出来，一存就把照片弄丢了；取不齐这一回都不存，见下面 onReady）
let pageIn = null;
let touched = null;
let noSave = false;
const touchedDays = new Set(); // 起过 day 的那几天（年-月-日），不再问外面
window.__kfsPageIn = (k) => {
  pageIn = k;
};
window.__kfsSaveOk = () => !ON || (!noSave && opened && pageIn === window.PAGE_DAY && touched === window.PAGE_DAY);
// 顶上那一栏（回本子、标题、版式风格）、本子首页、回闲笔集那一颗：不算动了这一页
const CHROME = ".top, #shell, .kfs-close, .backhome";
for (const type of ["pointerdown", "keydown", "input", "change", "click", "drop", "paste"])
  document.addEventListener(
    type,
    (e) => {
      if (!opened) return;
      const t = e.target;
      if (t && t.closest && t.closest(CHROME)) return;
      touched = window.PAGE_DAY;
    },
    true
  );

// ---------- localStorage 那一层（同页里那几十处换成了 __kfsLS） ----------
function makeLS() {
  if (!ON) {
    // 没接上开封府：只在这一页里记着，关了就没了
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => void m.set(String(k), String(v)),
      removeItem: (k) => void m.delete(String(k)),
      key: (i) => Array.from(m.keys())[i] ?? null,
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
    };
  }
  const keys = () =>
    [...lsCache.keys()]
      .map((k) => lsKeyFromStore(k.slice(LS.length), today()))
      .filter((k) => k && !LS_SKIP.test(k));
  const isJson = (s) => s.charAt(0) === "{" || s.charAt(0) === "[";
  return {
    getItem(k) {
      k = String(k);
      if (LS_SKIP.test(k)) return null;
      const sk = lsKeyToStore(k, today());
      if (!sk || !lsCache.has(LS + sk)) return null;
      const v = lsCache.get(LS + sk);
      if (!isJson(v)) return v;
      const o = parseJson(v);
      return o == null ? v : JSON.stringify(toMd(o, today()));
    },
    setItem(k, v) {
      k = String(k);
      if (LS_SKIP.test(k) || lsHeld(k)) return;
      const sk = lsKeyToStore(k, today());
      if (!sk) return;
      let s = String(v);
      if (isJson(s)) {
        const o = parseJson(s);
        if (o != null) s = JSON.stringify(toFull(o, today()));
      }
      if (lsCache.get(LS + sk) === s) return;
      lsCache.set(LS + sk, s);
      ask("set", { k: LS + sk, v: s }).catch(() => {});
    },
    removeItem(k) {
      const sk = lsKeyToStore(String(k), today());
      if (!sk || !lsCache.has(LS + sk)) return;
      lsCache.delete(LS + sk);
      ask("del", { k: LS + sk }).catch(() => {});
    },
    key(i) {
      return keys()[i] ?? null;
    },
    get length() {
      return keys().length;
    },
    clear() {},
  };
}
window.__kfsLS = makeLS();

// ---------- db 那一层（同页自己的 journal-backend.js 把它包成 claude.use("db" | "assets" | "mcp")） ----------
const blobToData = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
if (ON) {
  window.journalBackend = {
    async get(path) {
      const sp = pathToStore(path, today());
      if (!sp) return null;
      const v = await ask("get", { k: KV + sp });
      const o = typeof v === "string" ? parseJson(v) : null;
      return o == null ? null : fromStore(o);
    },
    async set(path, data) {
      if (pathHeld(path)) return null;
      const sp = pathToStore(path, today());
      if (!sp) return null;
      // 那一天头一回存那一页、存一代：外面先起那一天的 day（点开的时候不起，见 host.js 的 ensureDay）
      const m = /^(page|gens)\/(\d{4}-\d{2}-\d{2})$/.exec(sp);
      if (m && !touchedDays.has(m[2])) {
        if (!(await ask("touch", { date: m[2] }))) throw new Error("没存上");
        touchedDays.add(m[2]);
      }
      // 没存上（存档满了、存不进去）：报错，同页自己那几处“没存成”的路才走得到（比如删一页：挪进废纸篓没存上，就不删原来的）
      if ((await ask("set", { k: KV + sp, v: JSON.stringify(toStore(data)) })) === false) throw new Error("没存上");
      return null;
    },
    async del(path) {
      const sp = pathToStore(path, today());
      if (sp) await ask("del", { k: KV + sp });
      return null;
    },
    async list(col) {
      const pre = KV + col + "/";
      const rows = (await ask("list", { prefix: pre })) || [];
      const items = [];
      for (const [k, v] of rows) {
        const id = idFromStore(col, String(k).slice(pre.length), today());
        const o = id && typeof v === "string" ? parseJson(v) : null;
        if (o != null) items.push({ id, o });
      }
      // 照片一起取（不一张一张排着等：她的照片库大了，一张一张等，点开要等好久）
      const datas = await imgsIn(items.map((x) => toMd(x.o, today())));
      return items.map((x, i) => ({ id: x.id, data: datas[i] }));
    },
    async upload(blob) {
      const id = "ty" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if ((await ask("imgPut", { id, data: await blobToData(blob) })) === false) throw new Error("没存上");
      const url = URL.createObjectURL(blob);
      own(id, url);
      return { id, url };
    },
    async removeAsset(id) {
      await ask("imgDel", { id });
      const url = blobs.get(id);
      if (url) {
        blobs.delete(id);
        owners.delete(url);
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      }
      return null;
    },
    // 引用栏要那一整天的原话（同页给的是“年-月-日”）
    async sources(date) {
      return (await ask("sources", { date })) || { chat: [] };
    },
    // 批注送回家（sync_talk）、去家里拿颜文字（get_kaomoji）、吃了吗：开封府这边不走这几条（批注存在页上，光义翻日记看得到）
    async callTool(tool, args) {
      if (tool === "sync_talk") return { ok: true };
      if (tool === "get_kaomoji") return { payload: { kaomoji: [] } };
      if (tool === "food_days") return { days: [] };
      if (tool === "food_day") return { date: args && args.date, meals: [] };
      return {};
    },
    // 别的设备改了、开封府这头替她写了（天气）：告诉同页
    watch(cb) {
      const f = async (pairs) => {
        for (const [k, v] of pairs) {
          if (!k.startsWith(KV)) continue;
          const sp = k.slice(KV.length);
          const i = sp.indexOf("/");
          if (i < 0) continue;
          const col = sp.slice(0, i);
          const id = idFromStore(col, sp.slice(i + 1), today());
          if (!id) continue;
          const o = typeof v === "string" ? parseJson(v) : null;
          try {
            cb(col + "/" + id, o == null ? null : await fromStore(o));
          } catch (e) {}
        }
      };
      watchers.add(f);
      return () => watchers.delete(f);
    },
  };
  // 每一天聊了多少（本子首页的热力图、引用栏的日历）：同页按“月.日”认
  const h = {};
  for (const d of Object.keys(INIT.heat || {})) {
    const md = mdOf(d, today());
    if (md) h[md] = INIT.heat[d];
  }
  window.__bzHeat = h;
}

// ---------- 关上回闲笔集：先把还没存的存了 ----------
// 同页停手 0.7 秒才存那一页（savePage）、0.6 秒才存设置（saveCfg）：一关框就拆了，最后那一下没存上。
// 先叫它把那一页马上存了（flushPage，tools/tongye.mjs 递出来的 __kfsFlush；没动过手的它不存），等设置那一下存完，
// 还在路上的（存那一页、存设置、存照片）等它们回来（最多三秒），再说关
let closing = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function closeNow() {
  if (!ON) return;
  if (closing) return;
  closing = true;
  try {
    if (window.__kfsFlush) window.__kfsFlush();
  } catch (e) {}
  await sleep(700);
  const end = Date.now() + 3000;
  while (waiting.size && Date.now() < end) await sleep(100);
  tellOut("close");
}
// 同页删掉这一页、找回一页以后要重新载入（回它的本子首页）：开封府这边本子首页就是闲笔集，关上回去（tools/tongye.mjs 换的那两处）
window.__kfsReload = () => (ON ? closeNow() : location.reload());
// 找回之前那一天现在的 day 算不算有东西（同 host.js 的 madeOf 看 day 的那一半）：点开就起的那一页空的不算
window.__kfsWorth = (R) => {
  if (!R || typeof R !== "object") return false;
  const T = R.text || {};
  return !!(R.title || (R.photos || []).length || (R.chat || []).length || T.p1 || T.pen || T.cap || T.p2 || T.ann || T.quote || R.food || R.status === "making");
};

// ---------- 页面摆好以后 ----------
const CSS = [
  // 交给枫（同页自己的聊天那一屏）：开封府这边光义排一页的路子下一步再接
  "#toChat{display:none!important}",
  // 拆零件（给做页面的人对照用）、去家里拿颜文字
  "section:has(>#xray){display:none!important}",
  "#xray{display:none!important}",
  "#cfgKaoHome,[data-kh]{display:none!important}",
  // 引用栏里的吃了吗、书摘、健康：开封府没有这几样记录
  '[data-qs="吃了吗"],[data-qs="书摘"],[data-qs="健康"]{display:none!important}',
  // 「存」里删掉这一页：同页用 hidden 先藏着“真的删掉 / 算了”，可它自己的 .savebig{display:flex} 把 hidden 盖了，两颗一起露着（原版也这样），
  // 一下就能点到“真的删掉”。照它的意思：先点“删掉这一页”才露出来
  "#delBox [hidden]{display:none!important}",
  // 批注那一栏的“分享到聊天”：同页是送进它家里的聊天；开封府这边光义翻日记看得到批注，这一颗先藏着（不然它说送进去了，其实没有）
  "[data-sh]{display:none!important}",
  // 回闲笔集的那一颗
  ".kfs-close{display:inline-flex;align-items:center;gap:2px;margin-right:10px;padding:4px 8px 4px 2px;border:0;background:none;color:inherit;font:inherit;font-size:13px;opacity:.75;cursor:pointer}",
  ".kfs-close svg{width:16px;height:16px}",
  ".kfs-alone{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:#f1eee8;color:#2e2a26;font:15px/1.8 -apple-system,system-ui,sans-serif;text-align:center}",
  // 聊天里的照片（放照片的那一排里多的一样）
  ".kfs-ph-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
  ".kfs-ph{position:relative;aspect-ratio:1;border:0;padding:0;border-radius:10px;overflow:hidden;background:var(--line,#ddd)}",
  ".kfs-ph img{width:100%;height:100%;object-fit:cover;display:block}",
  ".kfs-ph span{position:absolute;left:6px;bottom:4px;font-size:10px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6)}",
  ".kfs-ph.on{outline:3px solid var(--pen,#4A6A60);outline-offset:-3px}",
  ".kfs-ph.on::after{content:'✓';position:absolute;right:6px;top:4px;width:18px;height:18px;border-radius:50%;background:var(--pen,#4A6A60);color:#fff;font-size:11px;line-height:18px;text-align:center}",
  // 天气在哪儿（设置里多的一节）
  ".kfs-city-go{flex:none;padding:6px 12px;border-radius:999px;border:1px solid var(--line,rgba(0,0,0,.12));background:none;color:inherit;font:inherit}",
  ".kfs-city-list{display:flex;flex-direction:column;gap:6px;margin-top:6px}",
  ".kfs-city-list button{text-align:left;padding:9px 12px;border-radius:12px;border:1px solid var(--line,rgba(0,0,0,.12));background:none;color:inherit;font:inherit;font-size:13.5px}",
  ".kfs-city-list small{display:block;font-size:11px;opacity:.65}",
].join("\n");

const esc = (t) => String(t == null ? "" : t).replace(/[<&>"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;", '"': "&quot;" })[c]);
const $ = (s) => document.querySelector(s);
const scrimOn = (on) => {
  const s = $("#scrim");
  if (s) s.classList.toggle("on", on);
};

// ---------- 聊天里的照片：那一天她在聊天里发的照片，挑几张放上来（走同页自己放照片的那条路：缩到 1000、存好、摆上纸） ----------
function chatPhotoItem() {
  const menu = $("#addFab .menu");
  if (!menu || menu.querySelector("[data-kfs='chatph']")) return;
  const b = document.createElement("button");
  b.className = "tap";
  b.dataset.kfs = "chatph";
  b.innerHTML =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5h12a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 012.5 13V6A1.5 1.5 0 014 4.5z"/><circle cx="7.5" cy="8.5" r="1.2"/><path d="M5 12.5l3-2.5 2.2 1.8 2-1.6 2.8 2.3"/></svg><span>聊天里的照片</span>';
  const pic = menu.querySelector('[data-add="pic"]');
  if (pic && pic.nextSibling) menu.insertBefore(b, pic.nextSibling);
  else menu.appendChild(b);
  b.onclick = (e) => {
    e.stopPropagation();
    const fab = $("#addFab");
    if (fab) fab.classList.remove("open");
    openChatPhotos();
  };
}
let phSheet = null;
function closeChatPhotos() {
  if (!phSheet) return;
  phSheet.classList.remove("on");
  if (!document.querySelector(".sheet.on")) scrimOn(false);
}
async function openChatPhotos() {
  const md = typeof window.PAGE_DAY === "string" ? window.PAGE_DAY : "";
  const full = fullOf(md, today());
  if (!phSheet) {
    phSheet = document.createElement("div");
    phSheet.className = "sheet cfg";
    phSheet.id = "kfsPh";
    phSheet.setAttribute("role", "dialog");
    phSheet.setAttribute("aria-modal", "true");
    phSheet.setAttribute("aria-label", "聊天里的照片");
    phSheet.innerHTML =
      '<div class="grab"><i></i></div><div class="sh"><h3>聊天里的照片</h3><span class="mono kfs-ph-day" style="font-size:10.5px;color:var(--mute)"></span></div>' +
      '<div class="cfgbody"><div class="cfgpage on" style="gap:12px"><p class="hint" style="margin:0">这一天你在聊天里发的照片。点一张选上，再点「放进来」。</p>' +
      '<div class="kfs-ph-grid"></div><div class="savebig"><button class="tap go kfs-ph-go">放进来</button><button class="tap kfs-ph-no">算了</button></div></div></div>';
    document.body.appendChild(phSheet);
    phSheet.querySelector(".grab").onclick = closeChatPhotos;
    phSheet.querySelector(".kfs-ph-no").onclick = closeChatPhotos;
    const sc = $("#scrim");
    if (sc) sc.addEventListener("click", closeChatPhotos);
  }
  const grid = phSheet.querySelector(".kfs-ph-grid");
  const go = phSheet.querySelector(".kfs-ph-go");
  phSheet.querySelector(".kfs-ph-day").textContent = md;
  grid.innerHTML = '<p class="hint" style="grid-column:1/-1;margin:0">在找……</p>';
  go.disabled = true;
  scrimOn(true);
  phSheet.classList.add("on");
  let list = [];
  try {
    list = full ? (await ask("chatPhotos", { date: full })) || [] : [];
  } catch (e) {
    list = [];
  }
  if (!list.length) {
    grid.innerHTML = '<p class="hint" style="grid-column:1/-1;margin:0">这一天聊天里没有照片。</p>';
    return;
  }
  const picked = new Set();
  const urls = list.map((p) => {
    try {
      return URL.createObjectURL(dataToBlob(p.data));
    } catch (e) {
      return "";
    }
  });
  grid.innerHTML = list.map((p, i) => `<button class="kfs-ph tap" data-i="${i}"><img alt="" src="${esc(urls[i])}"><span>${esc(p.t)}</span></button>`).join("");
  grid.querySelectorAll(".kfs-ph").forEach((b) => {
    b.onclick = () => {
      const i = +b.dataset.i;
      if (picked.has(i)) picked.delete(i);
      else picked.add(i);
      b.classList.toggle("on", picked.has(i));
      go.disabled = !picked.size;
    };
  });
  go.onclick = async () => {
    if (!picked.size || !window.journalAdd || !window.journalAdd.photos) return;
    const files = [...picked].sort((a, b) => a - b).map((i) => {
      const b = dataToBlob(list[i].data);
      return new File([b], `聊天里 ${list[i].t || ""}.jpg`.replace(/:/g, "."), { type: b.type });
    });
    closeChatPhotos();
    await window.journalAdd.photos(files);
    urls.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch (e) {}
    });
  };
}

// ---------- 天气在哪儿：设置里多一节（她填一回，掺新的一页就自己取那一天的天气） ----------
function citySection() {
  const main = $('#cfg .cfgpage[data-p="main"]');
  if (!main || main.querySelector(".kfs-city")) return;
  const s = document.createElement("section");
  s.className = "kfs-city";
  s.innerHTML =
    '<h4>天气在哪儿</h4><p class="hint">填了以后，掺新的一页会自己取那一天的天气（Open-Meteo，只寄城市的经纬度和日子）。</p>' +
    '<div class="cfgrow"><label>城市</label><input class="kfs-city-in" maxlength="30" autocomplete="off" enterkeyhint="search" placeholder="城市的名字"><button class="tap kfs-city-go" type="button">找</button></div>' +
    '<div class="kfs-city-list"></div><p class="hint kfs-city-now" style="margin-top:6px"></p>';
  const xr = $("#xray");
  const before = xr && xr.closest("section");
  if (before && before.parentNode === main) main.insertBefore(s, before);
  else main.appendChild(s);
  const now = s.querySelector(".kfs-city-now");
  const list = s.querySelector(".kfs-city-list");
  const input = s.querySelector(".kfs-city-in");
  const show = async () => {
    try {
      const c = await ask("city");
      now.textContent = c ? `现在：${c.name}${c.where ? "（" + c.where + "）" : ""}` : "还没填";
    } catch (e) {}
  };
  const find = async () => {
    const q = input.value.trim();
    if (!q) return;
    list.innerHTML = '<p class="hint" style="margin:0">在找……</p>';
    let rs = [];
    try {
      rs = (await ask("geocode", { q })) || [];
    } catch (e) {
      list.innerHTML = '<p class="hint" style="margin:0">没找着，网不好？过一会儿再试</p>';
      return;
    }
    if (!rs.length) {
      list.innerHTML = '<p class="hint" style="margin:0">没找着这个地方，换个写法试试</p>';
      return;
    }
    list.innerHTML = rs.map((c, i) => `<button class="tap" data-i="${i}">${esc(c.name)}<small>${esc(c.where || "")}</small></button>`).join("");
    list.querySelectorAll("button").forEach((b) => {
      b.onclick = async () => {
        const c = rs[+b.dataset.i];
        list.innerHTML = "";
        input.value = "";
        try {
          await ask("setCity", { city: c });
        } catch (e) {}
        show();
      };
    });
  };
  s.querySelector(".kfs-city-go").onclick = find;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      find();
    }
  });
  show();
}

function onReady() {
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);
  if (!ON) {
    const d = document.createElement("div");
    d.className = "kfs-alone";
    d.textContent = "这是开封府里的手帐本子，要从闲笔集里打开。";
    document.body.appendChild(d);
    return;
  }
  // 本子首页左上角：回闲笔集
  const who = document.getElementById("shWho");
  if (who && !document.querySelector(".kfs-close")) {
    const b = document.createElement("button");
    b.className = "kfs-close tap";
    b.setAttribute("aria-label", "回闲笔集");
    b.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 4.5L7 10l5.5 5.5"/></svg>闲笔集';
    b.onclick = () => closeNow();
    who.parentNode.insertBefore(b, who);
  }
  chatPhotoItem();
  citySection();
  // 要打开的那一天：等她的照片库（同页的 mine）取齐了再开，不然她放在页上的照片同页摆不出来（见上面存那一页的第 3 条）。
  // 十二秒还没齐：照样开，这一回改的都不存，说一声
  const o = INIT.open;
  if (o && o.day) {
    const md = mdOf(o.day, today());
    if (md && window.__kfsShell) {
      const end = Date.now() + 12000;
      (async () => {
        while (!window.__kfsMineIn && Date.now() < end) await sleep(100);
        if (!window.__kfsMineIn) {
          noSave = true;
          setTimeout(() => {
            try {
              // 同页的 toast 是它第三段脚本里的 const（不在 window 上），这里照名字找
              // eslint-disable-next-line no-undef
              if (typeof toast === "function") toast("照片还没取齐，这一回改的先不存，关上再开一回");
            } catch (e) {}
          }, 1500);
        }
        window.__kfsShell.open(md, o.mode || "view");
      })();
    }
  }
  tellOut("ready");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(onReady, 0));
else setTimeout(onReady, 0);
