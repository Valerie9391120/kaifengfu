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
// 点开不写（那一天的那一屏点“自己拼”，同页当场写一页空的 day：tools/tongye.mjs 换的那一句问这里），她头一回动手才起
window.__kfsLazy = ON;

// ---------- 本子首页“从哪天写到今天，第几天”：照这一本搬进开封府那一天算（host.js 的 TY_START；她 10 月 18 日定的“就从今天开始”） ----------
// 同页原来写的是今天往前 120 天那一天（tools/tongye.mjs 换的那一句问这里；它首页那一张格子还是从那一天排起）
window.__kfsSince = () => {
  const m = ON && typeof INIT.start === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(INIT.start) : null;
  if (!m) return null;
  const t = today();
  const n = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(+m[1], +m[2] - 1, +m[3])) / 864e5) + 1;
  return n >= 1 ? `从 ${+m[2]}.${+m[3]} 写到今天，第 <b>${n}</b> 天` : null;
};

// ---------- 从闲笔集点开某一天：先盖一层，那一天摆好了再揭开（她 10 月 18 日 20:53 定的） ----------
// 同页一打开先摆它自己的本子首页；开封府要等她的照片库、那一天的页取齐了才翻到那一天（见下面 onReady），
// 中间这一会儿首页会闪一下。盖的这一层跟本子同色（照手机的深浅），写“正在打开 10.18……”；同页的样式还没到也盖得住
// （这一段在 <head> 最前面就跑，盖在 html 上）。外面那一颗“‹ 闲笔集”揭开以前一直在（揭开了才说 ready），出得去
const OPENING = ON && INIT.open && INIT.open.day ? mdOf(INIT.open.day, today()) : null;
if (OPENING) {
  try {
    const st = document.createElement("style");
    st.textContent = [
      "html.kfs-opening::after{content:attr(data-kfs-open);position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#EAEAE7;color:#8D9196;font:14px/1.6 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:.06em;pointer-events:none;transition:opacity .24s}",
      "@media (prefers-color-scheme:dark){html.kfs-opening::after{background:#0F1011;color:#8E9297}}",
      "html.kfs-opening.kfs-opened::after{opacity:0}",
    ].join("\n");
    document.head.appendChild(st);
    document.documentElement.setAttribute("data-kfs-open", `正在打开 ${OPENING}……`);
    document.documentElement.classList.add("kfs-opening");
  } catch (e) {}
}

// ---------- 字：同页原来从 Google Fonts 现取，开封府自己带着（tools/tyfonts.mjs；卿卿 10 月 18 日定的“放到开封府自己这儿”） ----------
// <head> 里那几张（底下那三种字）tools/tongye.mjs 已经写进页里了。换风格的时候同页的 loadFonts 叫这里（它自己先看过这一种风格取没取过）：
//   - 换上的那一种风格：照 Google 的样子，一种字一个粗细一张样式表，挂进 <head>（存长图的时候 html-to-image 照样式表把字画进去，同原版）
//   - “换风格”那一层里的小样（preview）：原版只取小样上那几个字；这里用同一批块里含那几个字的几块，只认那几个字，
//     用 FontFace 放进来、不挂样式表（存长图不带它们，同原版不多带）。只有用到的那几块浏览器才去取
const TYF = __KFS_TYFONTS__;
const fontHref = (f) => `./${TYF.dir}/${f}`;
const fontOn = new Set(TYF.base);
const fontPv = new Set();
window.__kfsFonts = (fonts, preview) => {
  for (const spec of fonts || [])
    for (const key of TYF.spec[spec] || []) {
      if (fontOn.has(key)) continue;
      if (!preview) {
        fontOn.add(key);
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = fontHref(TYF.css[key]);
        document.head.appendChild(l);
      } else if (!fontPv.has(key) && typeof FontFace === "function" && document.fonts) {
        fontPv.add(key);
        const [family, weight] = key.split("|");
        for (const [file, range] of TYF.pv[key] || []) {
          try {
            document.fonts.add(new FontFace(family, `url(${fontHref(file)}) format("woff2")`, { weight, style: "normal", display: "swap", unicodeRange: range }));
          } catch (e) {
            /* 这一块放不进来：小样上这几个字用别的字摆 */
          }
        }
      }
    }
};

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
    // 键盘开着没有（整层铺到了键盘上面）：见下面 CSS 里 kfs-kb 那一句
    if (typeof d.kb === "boolean") document.documentElement.classList.toggle("kfs-kb", d.kb);
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
  // 每一天聊了多少（本子首页的热力图、引用栏聊天那一栏的日历；狐宇宙不算）、狐宇宙里有多少（引用栏便签那一栏的日历）：同页按“月.日”认
  const mdHeat = (src) => {
    const h = {};
    for (const d of Object.keys(src || {})) {
      const md = mdOf(d, today());
      if (md) h[md] = src[d];
    }
    return h;
  };
  window.__bzHeat = mdHeat(INIT.heat);
  window.__bzNoteHeat = mdHeat(INIT.noteHeat);
}

// ---------- 打字的时候告诉外面（她 10 月 22 日报的：交给光义那一屏打字的时候，输入框被键盘挡住、看不到打的字） ----------
// iPhone 的键盘不把框变矮，框里贴着底的输入框就压在键盘底下；框是隔开的，外面看不见框里在不在打字。
// 这里打字的地方（输入框、打的字）一拿到焦点就告诉外面，外面照开封府自己的输入框那样把整层铺到键盘上面（keyboard.js），框跟着变矮；
// 不打了也说一声。框变矮了，正在打字的那一处要是落到了底下看不见的地方，挪上来（只挪能滚的那几层，不碰 overflow:hidden 的）
const typingEl = (a) =>
  !!a && (a.isContentEditable || a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(checkbox|radio|file|button|submit|reset|image|range|color|hidden)$/i.test(a.type || "")));
let typingOn = false;
function typingCheck() {
  const t = typingEl(document.activeElement);
  if (t === typingOn) return;
  typingOn = t;
  tellOut("typing", { on: t });
}
function caretIntoView(a) {
  let r = a.getBoundingClientRect();
  if (a.isContentEditable) {
    try {
      const s = window.getSelection();
      const rr = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
      if (rr && (rr.width || rr.height)) r = rr;
    } catch (e) {}
  }
  const H = window.innerHeight;
  const pad = 16;
  let dy = r.bottom > H - pad ? r.bottom - (H - pad) : r.top < pad ? r.top - pad : 0;
  for (let p = a.parentElement; p && Math.abs(dy) >= 1; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) {
      const was = p.scrollTop;
      p.scrollTop = was + dy;
      dy -= p.scrollTop - was;
    }
  }
  if (Math.abs(dy) >= 1) window.scrollBy(0, dy);
}
if (ON) {
  document.addEventListener("focusin", typingCheck);
  document.addEventListener("focusout", () => setTimeout(typingCheck, 0));
  window.addEventListener("resize", () => {
    if (!typingOn) return;
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (typingEl(a)) caretIntoView(a);
    });
  });
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
  return !!(R.title || R.herTitle || (R.photos || []).length || (R.chat || []).length || T.p1 || T.pen || T.cap || T.p2 || T.ann || T.quote || R.food || R.status === "making");
};

// ---------- 页面摆好以后 ----------
const CSS = [
  // 刘海屏（iPhone 顶上让开的那一截：外面量好写进来的 --safe-t）。编辑器顶上那一条原来粘在刘海底下（top 是 --safe-t），
  // 后面的“版式 / 风格”那一块还照没有刘海排，被它挡住；往上划的时候刘海那一截露着底下的纸（她 10 月 18 日 18:44 截图报的）。
  // 改成从最顶上粘住、底色一直铺到最顶上，里头的字往下让开刘海（同页自己“看一页”“交给光义”那两屏顶上就是这么做的）
  // 两边那一截也铺上底色（同页那一条只有纸那么宽，往上划的时候“换笔”那个圆从边上露出来半个）
  "html.app-mode .top{top:0;padding-top:calc(12px + var(--safe-t,0px));box-shadow:-48px 0 0 var(--bg),48px 0 0 var(--bg)}",
  // 贴纸库那一层原来是屏幕的 94% 高，刘海屏上顶到刘海里去了：让开刘海
  "html #libS{height:min(94vh,calc(100vh - var(--safe-t,0px) - 8px));max-height:min(94vh,calc(100vh - var(--safe-t,0px) - 8px))}",
  // 她自己起标题：题签底下冒出来的那一条（跟贴纸那一条一个样子）
  ".kfs-ti{position:absolute;z-index:72;display:flex;flex-direction:column;align-items:flex-start;gap:6px}",
  ".kfs-ti-row{display:flex;gap:4px;align-items:center;padding:4px;border-radius:22px;background:var(--ink);box-shadow:var(--lift,0 8px 24px rgba(0,0,0,.22))}",
  ".kfs-ti-in{width:210px;height:36px;border:0;border-radius:18px;padding:0 12px;font:inherit;font-size:16px;background:rgba(255,255,255,.14);color:var(--paper);outline:none}",
  ".kfs-ti-in::placeholder{color:var(--paper);opacity:.55}",
  ".kfs-ti-ok{width:44px;height:36px;border:0;border-radius:18px;background:none;color:var(--paper);font-size:14px}",
  ".kfs-ti-tip{font-size:12px;color:var(--ink2);background:var(--paper);padding:2px 8px;border-radius:8px}",
  // 打的字挑颜色：没挑的跟着纸（同页原来那一句 .tbox{color:var(--ink)}）；“色”只给打的字（kfs-can-col，见 __kfsSel）。
  // 那一条多一颗：同页自己定的每颗 32 像素（窄屏 29）是照十颗放得下算的，十一颗每颗窄到 28（窄屏 26），还是一排放得下。
  // 同页那几句写的是 #stkbar，这里也写 #stkbar 才盖得过
  ".stk.placed .tbox{color:var(--kc,var(--ink))}",
  "#stkbar .kfs-col{display:none;color:#FFD4C4}",
  "#stkbar.kfs-can-col .kfs-col{display:block}",
  "#stkbar.kfs-can-col .tools button{width:28px}",
  "#stkbar .kfs-colrow{display:none;gap:4px;align-items:center;padding:0 4px}",
  "#stkbar.kfs-coloring .tools{display:none}",
  "#stkbar.kfs-coloring .kfs-colrow{display:flex}",
  "#stkbar .kfs-sw{width:28px;height:28px;flex:none;border-radius:50%;padding:0;border:2px solid rgba(255,255,255,.25)}",
  "#stkbar .kfs-sw.on{border-color:#fff;box-shadow:0 0 0 2px var(--ink),0 0 0 4px #fff}",
  "#stkbar .kfs-col-ok{width:36px;height:36px;border:0;background:none;color:var(--paper);font-size:14px}",
  "@media (max-width:380px){#stkbar.kfs-can-col .tools button{width:26px}#stkbar .kfs-sw{width:26px;height:26px}}",
  // 那一天的那一屏：“几样吃的”（开封府没有吃了什么的记录）
  "#dayFound>span:nth-child(3){display:none!important}",
  // 交给光义：“在排”那一栏里没排成的那一步（打个叉，不转、不打勾）
  ".log .r.fail i{box-shadow:inset 0 0 0 1.5px #C0533F}",
  ".log .r.fail i::after{content:'×';position:absolute;inset:0;display:grid;place-items:center;font:600 12px/1 system-ui,sans-serif;color:#C0533F}",
  // 拆零件（给做页面的人对照用）、去家里拿颜文字
  "section:has(>#xray){display:none!important}",
  "#xray{display:none!important}",
  "#cfgKaoHome,[data-kh]{display:none!important}",
  // 引用栏里的吃了吗、书摘、健康：开封府没有这几样记录
  '[data-qs="吃了吗"],[data-qs="书摘"],[data-qs="健康"]{display:none!important}',
  // 引用栏（见上面“引用栏”那一节）：句子不飞进来（飞着的时候 iPhone 不认点）；底下那两颗还没选的时候藏着；还有多少句没摆
  ".qrow{animation:none!important}",
  ".qbar [data-qa][hidden]{display:none!important}",
  ".kfs-qmore{flex:none;padding:8px 0 12px;text-align:center;font-size:11.5px;color:var(--mute)}",
  // 键盘开着、整层铺到了键盘上面的时候（外面说的，见上面“跟外面说话”那一段的 kb）：右下角“＋”、左下角“撤回”收起来，
  // 框变矮以后它们浮在键盘上头，正好压着正打着的那一行。只看键盘：同页放上一张字贴会自己把焦点放到字上（键盘不出来），那时候不收
  "html.kfs-kb #addFab,html.kfs-kb #undoPill{display:none!important}",
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

// ---------- 交给光义（同页的「交给」那一屏；开封府另问他一回，见 host.js 的 tyArrangeAsk、App.jsx 的 tyArrange） ----------
// 那一天的那一屏（本子首页点一天、闲笔集点“掺一页手帐”）：“几张照片、几句聊天”和那几张小图照她那天在聊天里发的照片、聊的原话数
// （同页的 renderDay 叫这里取，摆的时候问 __kfsDayPh、__kfsDayN，tools/tongye.mjs 接上的。同页原来拿那一天的 day 里的：
// 掺过一页的日子，摆的成了那一页上的几张、他挑的那几句，小图还摆不出来，她 10 月 18 日 19:18 截图报的）。
// 那一天的页上没有照片的时候，聊天里的照片也给「交给光义」那一屏先挑四张（她能拿掉、能从相册再添）
const chatRefs = new Map(); // blob 地址 → 聊天里那一张的编号
const dayAsked = new Set();
const dayStat = new Map(); // 月.日 → { ph: 那天聊天里的照片（blob 地址）, n: 那天的原话数 }；还没取回来是没有
window.__kfsDayPh = (md) => (dayStat.has(md) ? dayStat.get(md).ph : null);
window.__kfsDayN = (md) => (dayStat.has(md) ? dayStat.get(md).n : null);
window.__bzDay = async (md) => {
  if (!ON || dayAsked.has(md)) return;
  dayAsked.add(md);
  const full = fullOf(md, today());
  if (!full) return;
  try {
    const [src, list] = await Promise.all([ask("sources", { date: full }), ask("chatPhotos", { date: full })]);
    const chat = src && Array.isArray(src.chat) ? src.chat.filter((x) => x && x.p).map((x) => ({ w: x.w, t: x.t || "", p: x.p, src: "原话" })) : [];
    const urls = (Array.isArray(list) ? list : []).map((p) => {
      const u = URL.createObjectURL(dataToBlob(p.data));
      chatRefs.set(u, p.id);
      return u;
    });
    dayStat.set(md, { ph: urls, n: chat.length });
    // 同页那一屏的照片、原话在它自己那一段里（摸不着），交给 tools/tongye.mjs 摆的那个口子：那一天还没有的才摆，还是那一天就再摆一回
    // （它再摆一回又会叫这里：取过的不再取）。那个口子还没摆好（同页刚打开）：等一会儿；等不到，下回再取
    for (let i = 0; i < 50 && !(window.__kfsShell && window.__kfsShell.dayIn); i++) await sleep(100);
    if (window.__kfsShell && window.__kfsShell.dayIn) window.__kfsShell.dayIn(md, urls, chat);
    else dayAsked.delete(md);
  } catch (e) {
    dayAsked.delete(md);
  }
};
// 寄给他的照片（同页写进 ask 的 photos，tools/tongye.mjs 换的那一句问这里）：框里的 blob: 地址换成开封府认得的编号。
// 她刚从相册传的、页上原来的是 kfsimg:<编号>，聊天里的是 kfschat:<编号>；别的原样（同页自己会把 blob:、data: 的拿掉）
window.__kfsAskRef = (u) => {
  const s = String(u || "");
  if (chatRefs.has(s)) return "kfschat:" + chatRefs.get(s);
  if (owners.has(s)) return IMG + owners.get(s);
  return s;
};
// “光义刚更新了这一页”（同页收 day 的时候，tools/tongye.mjs 换的那一句问这里）：只在他新排好的那一回说。
// 同页收 day 的时候先告诉这里（__kfsIngest，tools/tongye.mjs 在 ingestDay 开头加的）：记下那一天上一回收到的是哪一份（钟点 ts）。
// 她开着那一页的时候收到他排好的、钟点跟上一回不一样（新排好的），才说。她自己起标题、另一台设备改了、别的日子在排，
// 那一天的钟点都不变，不说；打开以前就排好的（头一回收到）、他正排着、没排成放回原样的，也不说
const dayTs = new Map(); // 那一天上一回收到的 day 的钟点
const fresh = new Set(); // 这一回收到的那一天是新的一份（钟点变了）
window.__kfsIngest = (R) => {
  if (!R || !R.day) return;
  const before = dayTs.get(R.day);
  dayTs.set(R.day, R.ts);
  if (before !== undefined && before !== R.ts) fresh.add(R.day);
  else fresh.delete(R.day);
  // 她正开着起标题那一条：跟着收到的这一份（同页这就把题签重摆一遍，她打着的字摆完再摆回去）
  const o = ti;
  if (o && o.md === R.day) {
    o.R = R;
    if (o.typed) setTimeout(() => ti === o && showTitle(o.h2, titleOf(norm(o.inp.value), o.R, o.md)), 0);
  }
};
window.__kfsHisNew = (R) => {
  if (!R || !fresh.has(R.day)) return false;
  fresh.delete(R.day);
  return R.by === "me" && R.status === "done" && !(R.steps || []).some((s) => s && s.fail);
};

// ---------- 引用栏（她 10 月 22 日报的：“手帐好卡呀！！完全点不动……引用句子更是 连选中句子都点了没反应”） ----------
// 同页原来：一打开就把那一天的每一句都摆出来，一句一句排着队飞进来（一句隔 0.035 秒，上千句要飞半分钟往上）；
// 点一句，它在后台把整张单子重拼一遍。iPhone 有条规矩（WebKit 的 ContentChangeObserver）：手指按着的那一会儿，
// 有能点的东西刚从透明变出来，这一下就当“看看”、不当“点”。句子一直在往外冒，点了就不算；句子一多，摆、拼、取字把整页拖垮。
// 这里接过来（tools/tongye.mjs 在同页的 quotePickerHTML、wireQuote 开头问这里；只管聊天、便签这两栏，别的几栏照同页原来的）：
//   - 不飞（样式里 .qrow 的动画去掉，见下面 CSS）
//   - 先摆前面 QCH 句；滑到离底不到一屏，接着摆下一段。同一天同一栏重摆（清空了、整天的话取回来了），摆过多少还摆多少、滑到哪还在哪
//   - 点一句只改那一句、底下那一行、上面那一栏的数：整排上接一处（同页给每一句挂的那一下拿掉了，它那一下要整张重摆）
//   - 底下“清空”“贴到页上”两颗一直摆着（还没选的时候藏着），点一句不用重挂；这两颗做什么照同页原来的
// 便签那一栏（她 10 月 22 日截图画的）：狐宇宙里的，她留的、他在屋里说的（NOTELOG：取那一天的时候一起取，见 tools/tongye.mjs）
const QCH = 60;
const QSUBS = ["聊天", "便签"];
let qMem = { key: "", n: 0, st: 0 }; // 引用栏这会儿摆着的：哪一栏哪一天（key）、摆了几句、滑到哪
let qWired = null; // 整排上接点一下的那一处挂在哪一排上（同页的 #wxrow 一直是那一个，挂一回）
// 同页这几样是它脚本里的 let、const、function（不在 window 上），这里照名字找
/* eslint-disable no-undef */
const qSub = () => (typeof quoteSub === "string" ? quoteSub : "");
const qDayNow = () => (typeof qDay === "string" ? qDay : "");
const qLogNow = () => {
  try {
    return (typeof qLog === "function" && qLog()) || {};
  } catch (e) {
    return {};
  }
};
const qSel = () => {
  try {
    return (typeof QSEL === "object" && QSEL[qSub()]) || [];
  } catch (e) {
    return [];
  }
};
const qName = (w) => {
  try {
    return typeof NM === "function" ? NM(w) : "";
  } catch (e) {
    return "";
  }
};
const qBuzz = () => {
  try {
    if (typeof buzz === "function") buzz(4);
  } catch (e) {}
};
/* eslint-enable no-undef */
// 一条里的几行、“|||”隔开的几截拆成几句（同同页的 qSplitDay；它只拆聊天那一本，这里哪一本都拆）
function qSplit(LOG, k) {
  const L = LOG[k];
  if (!Array.isArray(L) || L.__sp) return;
  const out = [];
  L.forEach((x) => {
    const ps = String((x && x.p) || "")
      .split(/\n+|\|\|\|/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ps.length < 2) out.push(x);
    else ps.forEach((p, j) => out.push(Object.assign({}, x, { p, part: j + 1, parts: ps.length })));
  });
  out.__sp = true;
  LOG[k] = out;
}
// 第 a 到第 b 句（不含 b）：同同页那一行的样子（qRich 是同页画螃蟹表情的那一个）。
// 小字里的出处：便签那一栏里句句都是便签，不再写；聊天那一栏里掺着的（他排页挑进来的便签）照写
function qRowsHTML(L, a, b, day) {
  const on = new Set(qSel());
  const own = qSub() === "便签" ? "便签" : "";
  let h = "";
  for (let i = a; i < b; i++) {
    const x = L[i] || {};
    const p = typeof window.qRich === "function" ? window.qRich(x.p) : esc(x.p);
    h +=
      `<button class="qrow ${esc(x.w)}${on.has(day + "#" + i) ? " on" : ""}" data-qi="${i}" style="--i:${i}"><i class="ck"></i><span class="qb"><span class="qp">${p}</span>` +
      `<span class="qm">${esc(qName(x.w))}${x.t ? " · " + esc(x.t) : ""}${x.src && x.src !== "原话" && x.src !== own ? ` · <em>${esc(x.src)}</em>` : ""}</span></span></button>`;
  }
  return h;
}
const qMoreText = (n) => `还有 ${n} 句，往下滑接着摆`;
const qBarText = (sel) => {
  const days = new Set(sel.map((x) => String(x).split("#")[0])).size;
  return sel.length ? `已选 ${sel.length} 句${days > 1 ? " · 跨了几天" : ""}` : "点一句选中，可以多选、跨日子选";
};
window.__kfsQuoteHTML = () => {
  const sub = qSub();
  const day = qDayNow();
  try {
    if (typeof window.qFullDay === "function") window.qFullDay(day);
  } catch (e) {}
  const LOG = qLogNow();
  qSplit(LOG, day);
  const L = LOG[day] || [];
  const key = sub + "|" + day;
  const n = Math.min(L.length, Math.max(QCH, qMem.key === key ? qMem.n : 0));
  const pend = !!(window.QF_PEND && window.QF_PEND.has && window.QF_PEND.has(day));
  const here = day === window.PAGE_DAY ? "这页这天" : "这天";
  const rows = n
    ? qRowsHTML(L, 0, n, day)
    : `<div class="empty-t">${here}${sub === "便签" ? "狐宇宙里没有便签" : "没有聊天记录"}${pend ? "（正在取）" : ""}，点上面别的日子挑</div>`;
  const sel = qSel();
  const hid = sel.length ? "" : " hidden";
  return (
    `<div class="qlist" data-kfs-q="${esc(key)}">${rows}${n < L.length ? `<div class="kfs-qmore">${qMoreText(L.length - n)}</div>` : ""}</div>` +
    `<div class="qbar"><span>${qBarText(sel)}</span><button class="tap" data-qa="clr"${hid}>清空</button><button class="tap go" data-qa="put"${hid}>贴到页上</button></div>`
  );
};
// 滑到离底不到一屏：接着摆下一段（一段还摆不满的、每句都很短的，接着摆到满）
function qMore(list) {
  for (let guard = 0; guard < 40; guard++) {
    const key = list.dataset.kfsQ;
    if (!list.isConnected || !list.clientHeight || qMem.key !== key || key !== qSub() + "|" + qDayNow()) return;
    if (list.scrollTop + list.clientHeight * 2 < list.scrollHeight) return;
    const L = qLogNow()[qDayNow()] || [];
    const n = qMem.n;
    if (n >= L.length) return;
    const m = Math.min(L.length, n + QCH);
    const html = qRowsHTML(L, n, m, qDayNow());
    const tail = list.querySelector(".kfs-qmore");
    if (tail) tail.insertAdjacentHTML("beforebegin", html);
    else list.insertAdjacentHTML("beforeend", html);
    qMem.n = m;
    if (tail) {
      if (m >= L.length) tail.remove();
      else tail.textContent = qMoreText(L.length - m);
    }
  }
}
// 点了一句：只改这一句、底下那一行、上面那一栏的数
function qTap(e) {
  const b = e.target && e.target.closest ? e.target.closest("[data-qi]") : null;
  if (!b || !this.contains(b) || !QSUBS.includes(qSub())) return;
  const id = qDayNow() + "#" + b.dataset.qi;
  const sel = qSel();
  const i = sel.indexOf(id);
  if (i >= 0) sel.splice(i, 1);
  else sel.push(id);
  b.classList.toggle("on", i < 0);
  qBuzz();
  const bar = this.querySelector(".qbar");
  if (bar) {
    const sp = bar.querySelector("span");
    if (sp) sp.textContent = qBarText(sel);
    bar.querySelectorAll("[data-qa]").forEach((x) => (x.hidden = !sel.length));
  }
  const sub = qSub();
  const tab = [...document.querySelectorAll("#wxdays [data-qs]")].find((x) => x.dataset.qs === sub);
  if (tab) tab.innerHTML = esc(sub) + (sel.length ? `<sup>${sel.length}</sup>` : "");
}
window.__kfsWireQuote = (wq) => {
  // 底下那两颗照同页原来的挂上（它顺手给每一句也挂了一下，那一下要整张重摆：拿掉，归上面 qTap 管）
  try {
    wq();
  } catch (e) {}
  const row = document.getElementById("wxrow");
  if (!row) return;
  row.querySelectorAll("[data-qi]").forEach((b) => (b.onclick = null));
  if (qWired !== row) {
    qWired = row;
    row.addEventListener("click", qTap);
  }
  const list = row.querySelector(".qlist[data-kfs-q]");
  if (!list) return;
  const key = list.dataset.kfsQ;
  const st = qMem.key === key ? qMem.st : 0;
  qMem = { key, n: list.querySelectorAll("[data-qi]").length, st };
  if (st) list.scrollTop = st;
  list.addEventListener(
    "scroll",
    () => {
      if (qMem.key === key) qMem.st = list.scrollTop;
      qMore(list);
    },
    { passive: true }
  );
  qMore(list);
};

// ---------- 她自己起标题（第二步；她 10 月 18 日看了样子说“可以 老公请施工～”）：点纸上的题签，底下冒出一条打标题 ----------
// 存在那一天的 day 里（herTitle，host.js 的 setTitle；他排的时候不盖）。清空就用回原来的（他起过就用他的，没起过写日子）。
// 跟同页自己改字那一条一样：边打纸上边换，点“好”、回车、点别处都算定了；Esc 是不改了。
// 正开着“批注”的时候点题签，照旧是批注，不冒这一条（拆零件那一颗藏着；开着的话也一样）
let ti = null; // 开着的那一条：{ box, h2, md, full, was（打开时纸上的）, R（那一天的 day，取回来以前是 null）, got }
const hisName = () => {
  try {
    // 同页的 NM（署名，设置里能改）是它脚本里的 const（不在 window 上），这里照名字找
    // eslint-disable-next-line no-undef
    return (typeof NM === "function" && String(NM("me") || "").trim()) || "他";
  } catch (e) {
    return "他";
  }
};
const showTitle = (h2, text) => {
  const sv = h2.querySelector("svg");
  h2.textContent = text;
  if (sv) h2.appendChild(sv);
};
// 他起的（他排的一页上的 title；她自己拼的一页上 title 里记着的是她的，见 host.js 的 setTitle）
const hisTitle = (R) => (R && R.by === "me" && R.title) || "";
// 她这会儿起的（没取回那一天的 day 的时候是 null）
const herTitleOf = (R) => (R ? R.herTitle || (R.by !== "me" && R.title) || "" : null);
// 纸上该摆的：她起的，没有就他起的，再没有写日子
const titleOf = (t, R, md) => t || hisTitle(R) || md;
// 标题一行：空白（连全角空格、换行）收成一个空格再比（他起的里头要是有，她点开不改就走，不算她改了）
const norm = (x) => String(x || "").replace(/\s+/g, " ").trim();
function closeTitle(keep) {
  const o = ti;
  if (!o) return;
  ti = null;
  o.box.remove();
  // 纸上该摆回去的：照手上最新的那一份（开着的时候收到过新的，见 __kfsIngest）；没取回那一天的 day，照打开的时候纸上的
  const back = () => (o.R ? titleOf(herTitleOf(o.R), o.R, o.md) : o.was);
  // 不改了：她打过字（纸上换过）才换回去；没打过的不碰
  if (!keep) {
    if (o.typed) showTitle(o.h2, back());
    return;
  }
  const t = norm(o.inp.value);
  (async () => {
    await o.got;
    const had = herTitleOf(o.R);
    // 没改：跟她起的一样；没起过的，跟他起的一样（不把他起的当成她起的存下）；没取回那一天的 day，照打开的时候纸上的比
    if (had === null ? t === norm(o.was === o.md ? "" : o.was) : t === norm(had) || (!had && t === norm(hisTitle(o.R)))) {
      if (o.typed) showTitle(o.h2, back());
      return;
    }
    showTitle(o.h2, titleOf(t, o.R, o.md));
    let ok = false;
    try {
      ok = await ask("setTitle", { date: o.full, title: t });
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      showTitle(o.h2, back());
      try {
        // eslint-disable-next-line no-undef
        if (typeof toast === "function") toast("标题没存上，再试一回");
      } catch (e) {}
    }
  })();
}
function openTitle(h2) {
  closeTitle(true);
  const md = typeof window.PAGE_DAY === "string" ? window.PAGE_DAY : "";
  const full = fullOf(md, today());
  const pg = document.getElementById("page");
  if (!full || !pg) return;
  const box = document.createElement("div");
  box.className = "kfs-ti";
  box.innerHTML =
    '<div class="kfs-ti-row"><input class="kfs-ti-in" maxlength="20" placeholder="二十个字以内" autocomplete="off" enterkeyhint="done"><button type="button" class="tap kfs-ti-ok">好</button></div>' +
    '<div class="kfs-ti-tip">给这一页起个标题</div>';
  // 摆在题签底下（放在纸里，跟着纸走；纸要是缩放过，照纸自己的尺寸算）
  const r = h2.getBoundingClientRect();
  const pr = pg.getBoundingClientRect();
  const k = pg.offsetWidth ? pr.width / pg.offsetWidth || 1 : 1;
  box.style.left = Math.max(4, Math.min((r.left - pr.left) / k - pg.clientLeft - 4, pg.clientWidth - 276)) + "px";
  box.style.top = (r.bottom - pr.top) / k - pg.clientTop + 10 + "px";
  pg.appendChild(box);
  const inp = box.querySelector("input");
  const tip = box.querySelector(".kfs-ti-tip");
  // 纸上这会儿摆的（写着日子就是还没有标题）
  const was = (h2.textContent || "").trim();
  inp.value = was === md ? "" : was;
  const o = { box, h2, md, full, was, inp, R: null, got: null, typed: false };
  ti = o;
  o.got = ask("get", { k: KV + "day/" + full })
    .then((v) => {
      if (!o.R) o.R = typeof v === "string" ? parseJson(v) : null;
      if (ti !== o) return;
      if (o.R && !o.typed) {
        inp.value = herTitleOf(o.R) || hisTitle(o.R);
        inp.select();
      }
      tip.textContent = `给这一页起个标题（清空就${hisTitle(o.R) ? `用回${hisName()}起的` : "回到写日子"}）`;
    })
    .catch(() => {});
  inp.addEventListener("input", () => {
    o.typed = true;
    showTitle(h2, titleOf(norm(inp.value), o.R, md));
  });
  inp.addEventListener("keydown", (e) => {
    // 拼音还在候选里的那一下回车是选字，不算定了
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      closeTitle(true);
    } else if (e.key === "Escape") closeTitle(false);
  });
  box.querySelector(".kfs-ti-ok").onclick = () => closeTitle(true);
  // 跟着这一下点的就把键盘叫出来（iPhone 要在点的那一下里）
  try {
    inp.focus();
    inp.select();
  } catch (e) {}
}
function titleTap() {
  // 这一下按下去的时候是不是正开着批注、拆零件（批注那边按下去就收了，等到 click 再看就晚了）
  let busy = false;
  document.addEventListener(
    "pointerdown",
    (e) => {
      const pg = document.getElementById("page");
      const app = document.getElementById("app");
      busy = !!((pg && pg.classList.contains("noting")) || (app && app.classList.contains("xray")));
      // 点别处：定了
      if (ti && !ti.box.contains(e.target)) closeTitle(true);
    },
    true
  );
  document.addEventListener("click", (e) => {
    const h2 = e.target && e.target.closest ? e.target.closest("#page .title h2") : null;
    if (!h2 || busy || !document.documentElement.classList.contains("app-mode")) return;
    const pg = document.getElementById("page");
    const app = document.getElementById("app");
    if ((pg && pg.classList.contains("noting")) || (app && app.classList.contains("xray"))) return;
    openTitle(h2);
  });
}

// ---------- 打的字挑颜色（同上）：点她打的那一段字，底下那一条里“字”后面多一颗“色”，点了换成一排颜色 ----------
// 只给打的字（文字贴纸，五种字形都行）；便签、照片底下那一句不给。颜色记在那一张贴纸上（--kc），跟着那一段字存
// （tools/tongye.mjs 在存那一页、存一代、摆回来那几处接上的）。第一个是原来的（跟着纸走，换风格跟着变）
const INKS = [
  ["", "原来的"],
  ["#1F1D1A", "墨黑"],
  ["#C23A2B", "朱红"],
  ["#D9738C", "樱粉"],
  ["#A0662F", "赭石"],
  ["#E8C24A", "鹅黄"],
  ["#3F6B55", "松绿"],
  ["#2F4A8A", "靛蓝"],
  ["#FFFFFF", "白"],
];
const typed = (s) => !!(s && s.querySelector && s.querySelector(".tbox"));
function colorBar() {
  const bar = document.getElementById("stkbar");
  const tools = bar && bar.querySelector(".tools");
  if (!tools || bar.querySelector(".kfs-col")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "kfs-col";
  b.setAttribute("aria-label", "换颜色");
  b.textContent = "色";
  const txt = tools.querySelector('[data-a="txt"]');
  if (txt && txt.nextSibling) tools.insertBefore(b, txt.nextSibling);
  else tools.appendChild(b);
  const row = document.createElement("div");
  row.className = "kfs-colrow";
  row.innerHTML =
    INKS.map(([c, n]) => `<button type="button" class="kfs-sw" data-c="${c}" aria-label="${n}" style="background:${c || "conic-gradient(var(--paper) 0 50%,var(--ink) 50% 100%)"}"></button>`).join("") +
    '<button type="button" class="kfs-col-ok">好</button>';
  bar.appendChild(row);
  const sel = () => {
    const s = document.querySelector("#page .stk.placed.sel");
    return typed(s) ? s : null;
  };
  const mark = () => {
    const s = sel();
    const cur = s ? s.style.getPropertyValue("--kc").trim().toUpperCase() : "";
    row.querySelectorAll(".kfs-sw").forEach((x) => {
      const on = x.dataset.c.toUpperCase() === cur;
      x.classList.toggle("on", on);
      x.setAttribute("aria-pressed", on ? "true" : "false");
    });
  };
  b.onclick = () => {
    if (!sel()) return;
    bar.classList.add("kfs-coloring");
    mark();
  };
  row.querySelectorAll(".kfs-sw").forEach((x) => {
    x.onclick = () => {
      const s = sel();
      if (!s) return;
      // 改了贴纸的 style：同页自己就存那一页（它看着贴纸的 style）
      if (x.dataset.c) s.style.setProperty("--kc", x.dataset.c);
      else s.style.removeProperty("--kc");
      mark();
    };
  });
  row.querySelector(".kfs-col-ok").onclick = () => bar.classList.remove("kfs-coloring");
}
// 换选了一张、不选了（同页的 select，tools/tongye.mjs 在开头问这里）：颜色那一排收回去；选的是打的字才有“色”
window.__kfsSel = (s) => {
  const bar = document.getElementById("stkbar");
  if (!bar) return;
  bar.classList.remove("kfs-coloring");
  bar.classList.toggle("kfs-can-col", typed(s));
};

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
  titleTap();
  colorBar();
  // 揭开盖着的那一层（见上面 OPENING）：淡出，再告诉外面摆好了（外面那一颗“‹ 闲笔集”这时候才收）
  let shown = false;
  const uncover = () => {
    if (shown) return;
    shown = true;
    const h = document.documentElement;
    if (h.classList.contains("kfs-opening")) {
      h.classList.add("kfs-opened");
      setTimeout(() => h.classList.remove("kfs-opening", "kfs-opened"), 260);
    }
    tellOut("ready");
  };
  // 翻到了：看一页的是编辑器出来、本子首页收起来了；还没掺过的是那一天的那一屏滑进来了
  const arrived = (mode) => (mode === "day" ? !!document.querySelector("#sDay.on") : document.documentElement.classList.contains("app-mode") && !!document.querySelector("#shell.off"));
  // 要打开的那一天：等她的照片库（同页的 mine）取齐了再开，不然她放在页上的照片同页摆不出来（见上面存那一页的第 3 条）。
  // 十二秒还没齐：照样开，这一回改的都不存，说一声
  const o = INIT.open;
  if (o && o.day) {
    const md = mdOf(o.day, today());
    if (md && window.__kfsShell) {
      const end = Date.now() + 12000;
      const mode = o.mode || "view";
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
        try {
          window.__kfsShell.open(md, mode);
        } catch (e) {}
        // 翻到了再揭开（滑进来那一下也等它滑完）；等太久（二十秒）也揭开，不让她一直对着盖着的那一层
        const stop = Date.now() + 20000;
        while (!arrived(mode) && Date.now() < stop) await sleep(50);
        await sleep(mode === "day" ? 520 : 60);
        uncover();
      })();
      return;
    }
  }
  uncover();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(onReady, 0));
else setTimeout(onReady, 0);
