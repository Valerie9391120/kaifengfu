import { useEffect, useRef } from "react";
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

// entries：藏音匣里的那几条（parts.js 的 listEntries）；audio：{ el, load, urlOf, claim }（见 page.js 的 mountBox）；
// 那一包取不回来（网不好）：onFail
export function CangyinPage({ entries, audio, toast, onBack, onRemove, onFail }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const latest = useRef(null);
  latest.current = { entries, audio, toast, onBack, onRemove, onFail };
  useEffect(() => {
    let gone = false;
    loadPage().then(
      (m) => {
        if (gone || !ref.current) return;
        const L = () => latest.current;
        inst.current = m.mountBox(ref.current, {
          entries: L().entries,
          audio: {
            el: () => L().audio.el(),
            load: (a, url) => L().audio.load(a, url),
            urlOf: (id) => L().audio.urlOf(id),
            claim: () => L().audio.claim(),
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
    if (inst.current) inst.current.update(entries);
  }, [entries]);
  return <div ref={ref} className="absolute inset-0 z-40 kfs-page kfs-cangyin-shell" style={{ background: T.bg }} />;
}
