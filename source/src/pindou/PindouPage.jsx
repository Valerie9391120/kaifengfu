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

// state：她眼下这块板子（parts.js 的 readState，没有是 null，只在打开的那一下递一回）；incoming：开着的时候同步下来的她那块（别的设备上后来又拼过的）；
// works：作品集；his：他的板子；wake：“他自己醒”开着没有；canSend：摆不摆“发给光义”（狐宇宙里不摆）；
// onState(st, rev) → { rev, kept }、onSave({ name, code })、onDelete(id)、onSend({ name, code })、onClose()；那一包取不回来（网不好）：onFail
export function PindouPage({ state, incoming, works, his, wake, canSend, onState, onSave, onDelete, onSend, onClose, onFail }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const latest = useRef(null);
  latest.current = { state, incoming, works, his, wake, canSend, onState, onSave, onDelete, onSend, onClose, onFail };
  useEffect(() => {
    let gone = false;
    const page = { was: null };
    loadPindou().then(
      (m) => {
        if (gone || !ref.current) return;
        const L = () => latest.current;
        // 那一包取回来之前同步下来的那一块比打开那一下的新
        inst.current = m.mountBoard(ref.current, {
          state: L().incoming || L().state,
          works: L().works,
          his: L().his,
          wake: L().wake,
          canSend: L().canSend,
          onState: (st, rev) => L().onState(st, rev),
          onSave: (w) => L().onSave(w),
          onDelete: (id) => L().onDelete(id),
          onSend: (w) => L().onSend(w),
          onClose: () => L().onClose(),
        });
        if (typeof window !== "undefined") window.__kfsPindou = inst.current; // 端到端测试看板子用
        // 那一页铺好了：壳子上那层底色撤掉（那一页自己有桌面的颜色 --desk，壳子上的写在元素上，分量重，盖着它）；
        // 网页底色也换成桌面的颜色（同秘戏钱匣、并蒂莲：底下空一条的手机，系统画的那条取网页底色），关上的时候换回去
        const el = ref.current;
        el.style.background = "";
        const desk = getComputedStyle(el).getPropertyValue("--desk").trim();
        if (desk) {
          const r = document.documentElement;
          const b = document.body;
          page.was = [r.style.backgroundColor, b.style.backgroundColor];
          r.style.backgroundColor = b.style.backgroundColor = desk;
        }
      },
      () => {
        if (!gone) latest.current.onFail();
      }
    );
    return () => {
      gone = true;
      if (page.was) {
        document.documentElement.style.backgroundColor = page.was[0];
        document.body.style.backgroundColor = page.was[1];
        page.was = null;
      }
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
  useEffect(() => {
    if (inst.current && incoming) inst.current.update({ state: incoming });
  }, [incoming]);
  return <div ref={ref} className="kfs-pindou-shell kfs-fade absolute inset-0" style={{ zIndex: 60, background: "rgb(var(--k-base))" }} />;
}
