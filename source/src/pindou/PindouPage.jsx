import { useEffect, useRef } from "react";

// 拼豆作在开封府这头的壳子（里面那一页见 page.js，单独一包，头一回点进来才取，同藏音匣）。
// 南衙里点“拼豆作”：菜单、侧栏都收起，盖一层全屏（层高 60，同秘戏钱匣）；左上角的叉回到眼前这段对话
// （她发给他的那几幅在这儿，开着的时候他先不回，关上了一起回，同秘戏钱匣，见 App.jsx 的 openPd、closePd）。
// 存档、发给他都在 App.jsx 里办（她这块板子 kfs2:pd:state、作品集 kfs2:pd:work:<编号>、他的板子 kfs2:pindou，见 parts.js），
// 这里只管把东西递进去、把那一页叫的几声接出来。
/* global __KFS_PINDOU__ */
const PAGE_URL = typeof __KFS_PINDOU__ !== "undefined" ? __KFS_PINDOU__ : "./pindou.js";

// 照这一包自己的地址找（三个入口都一样：它们和这一包在同一个目录）；写成 new URL(...) 是不让打包的时候把它当成要一起打进来的东西
let pageP = null;
export const loadPindou = () => {
  if (!pageP)
    pageP = import(new URL(PAGE_URL, import.meta.url).href).catch((e) => {
      pageP = null;
      throw e;
    });
  return pageP;
};

// state：她眼下这块板子（parts.js 的 readState，没有是 null，只在打开的那一下递一回）；works：作品集；his：他的板子；wake：“他自己醒”开着没有；
// canSend：摆不摆“发给光义”（狐宇宙里不摆）；onState(st)、onSave({ name, code })、onDelete(id)、onSend({ name, code })、onClose()；
// 那一包取不回来（网不好）：onFail
export function PindouPage({ state, works, his, wake, canSend, onState, onSave, onDelete, onSend, onClose, onFail }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const latest = useRef(null);
  latest.current = { state, works, his, wake, canSend, onState, onSave, onDelete, onSend, onClose, onFail };
  useEffect(() => {
    let gone = false;
    loadPindou().then(
      (m) => {
        if (gone || !ref.current) return;
        const L = () => latest.current;
        inst.current = m.mountBoard(ref.current, {
          state: L().state,
          works: L().works,
          his: L().his,
          wake: L().wake,
          canSend: L().canSend,
          onState: (st) => L().onState(st),
          onSave: (w) => L().onSave(w),
          onDelete: (id) => L().onDelete(id),
          onSend: (w) => L().onSend(w),
          onClose: () => L().onClose(),
        });
        if (typeof window !== "undefined") window.__kfsPindou = inst.current; // 端到端测试看板子用
      },
      () => {
        if (!gone) latest.current.onFail();
      }
    );
    return () => {
      gone = true;
      if (inst.current) inst.current.destroy();
      inst.current = null;
      if (typeof window !== "undefined") window.__kfsPindou = null;
    };
  }, []);
  useEffect(() => {
    if (inst.current) inst.current.update({ works });
  }, [works]);
  useEffect(() => {
    if (inst.current) inst.current.update({ his, wake });
  }, [his, wake]);
  useEffect(() => {
    if (inst.current) inst.current.update({ canSend });
  }, [canSend]);
  return <div ref={ref} className="kfs-pindou-shell kfs-fade absolute inset-0" style={{ zIndex: 60, background: "rgb(var(--k-base))" }} />;
}
