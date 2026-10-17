import { useEffect, useMemo, useRef, useState } from "react";
import { T } from "../ui/style.js";

// 藏音匣那一页在开封府这头的壳子（里面那一页见 page.js，单独一包，头一回点进去才取）。
// 南衙里点“藏音匣”：铺满屏幕，照别的整页那样滑进来；左上角返回回到侧栏（跟闲笔集一样）。
/* global __KFS_CANGYIN__, __KFS_S2T__ */
const PAGE_URL = typeof __KFS_CANGYIN__ !== "undefined" ? __KFS_CANGYIN__ : "./cangyin.js";
const S2T_URL = typeof __KFS_S2T__ !== "undefined" ? __KFS_S2T__ : "./s2t.js";

// 照这一包自己的地址找（两个入口都一样：它们和这一包在同一个目录）；写成 new URL(...) 是不让打包的时候把它当成要一起打进来的东西
let pageP = null;
export const loadPage = () => {
  if (!pageP)
    pageP = import(new URL(PAGE_URL, import.meta.url).href).catch((e) => {
      pageP = null;
      throw e;
    });
  return pageP;
};
let s2tP = null;
export const loadS2T = () => {
  if (!s2tP)
    s2tP = import(new URL(S2T_URL, import.meta.url).href).catch((e) => {
      s2tP = null;
      throw e;
    });
  return s2tP;
};

// 纸条上的繁体：这台设备上自己转、自己记着（编号 → 繁体），不往存档里写（存进来的那一条不再改，见 parts.js）。
// 转字的那一包一兆多、头一回拿出来要一百来毫秒：点进去等匣子画完了再转，只转这台设备上还没转过的那几条
export const TRAD_KEY = "kfs-cyx-trad";
const TRAD_WAIT = 1500;
function readTrad() {
  try {
    const o = JSON.parse(localStorage.getItem(TRAD_KEY) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch (e) {
    return {};
  }
}
function writeTrad(o) {
  try {
    localStorage.setItem(TRAD_KEY, JSON.stringify(o));
  } catch (e) {}
}

// entries：藏音匣里的那几条（parts.js 的 listEntries）；audio：{ el, load, urlOf, claim }（见 page.js 的 mountBox）；
// 那一包取不回来（网不好）：onFail
export function CangyinPage({ entries, audio, toast, onBack, onRemove, onFail }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const latest = useRef(null);
  const [trad, setTrad] = useState(readTrad);
  const tried = useRef(new Set()); // 这一趟转过的（转不出来的不来回转）
  // 递给那一页的：每一条带上这台设备上转好的繁体
  const shown = useMemo(() => entries.map((e) => (trad[e.id] ? { ...e, trad: trad[e.id] } : e)), [entries, trad]);
  latest.current = { entries, shown, audio, toast, onBack, onRemove, onFail };
  useEffect(() => {
    let gone = false;
    loadPage().then(
      (m) => {
        if (gone || !ref.current) return;
        const L = () => latest.current;
        inst.current = m.mountBox(ref.current, {
          entries: L().shown,
          audio: {
            el: () => L().audio.el(),
            load: (a, url) => L().audio.load(a, url),
            urlOf: (id) => L().audio.urlOf(id),
            claim: (lost) => L().audio.claim(lost),
          },
          toast: (t) => L().toast(t),
          onBack: () => L().onBack(),
          onRemove: (id) => L().onRemove(id),
        });
      },
      () => {
        if (!gone) latest.current.onFail();
      }
    );
    return () => {
      gone = true;
      if (inst.current) inst.current.destroy();
      inst.current = null;
    };
  }, []);
  useEffect(() => {
    if (inst.current) inst.current.update(shown);
  }, [shown]);
  // 还没转繁体的：等一会儿（匣子画完）再取那一包转
  useEffect(() => {
    if (!entries.some((e) => !trad[e.id] && !tried.current.has(e.id))) return;
    let gone = false;
    const t = setTimeout(() => {
      loadS2T().then(
        (m) => {
          if (gone) return;
          const have = readTrad();
          const next = {};
          for (const e of latest.current.entries) {
            let s = have[e.id] || "";
            if (!s && !tried.current.has(e.id)) {
              tried.current.add(e.id);
              try {
                s = m.toTrad(e.text);
              } catch (er) {
                s = "";
              }
            }
            if (s) next[e.id] = s; // 只记还在匣子里的那几条（移出了的顺手忘掉）
          }
          writeTrad(next);
          setTrad(next);
        },
        () => {}
      );
    }, TRAD_WAIT);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [entries, trad]);
  return <div ref={ref} className="absolute inset-0 z-40 kfs-page kfs-cangyin-shell" style={{ background: T.bg }} />;
}
