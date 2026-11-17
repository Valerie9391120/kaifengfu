// =====================================================
// 自定义聊天背景：账户面板“主题色”底下一个开关。
// 开着、选好了图：不管换哪个主题色，聊天那一屏最底下铺的都是她选的那一张；关了，回到主题自带的那一张。
// 只换聊天那一屏的背景：别的颜色照旧跟主题色走，进门那一页、别的页面不动。图上什么都不加（不蒙、不糊）。
// 只在这台手机上：开没开记在 localStorage（一打开就知道），图记在本地存档的 meta 里（不加密、不上云端；
// 退出登录清本地存档的时候一起清掉）。
// =====================================================
import { useEffect, useState } from "react";
import { localDb } from "./localdb.js";

const ON_KEY = "kfs-wall-on";
const META = "wall";
export const WALL_SIDE = 2048; // 选的图长边压到这么大（iPhone 的屏幕长边两千五上下，铺满够清楚；存下来几百 K）

const isImg = (v) => typeof v === "string" && v.startsWith("data:image/");
const readOn = () => {
  try {
    return localStorage.getItem(ON_KEY) === "1";
  } catch (e) {
    return false;
  }
};

// on 开着没有；img 她选的那一张（data URL，没选过是空的）；ready 存档里那一张取过了没有
let state = { on: readOn(), img: "", ready: false };
let loading = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f(state));
const put = (next) => {
  state = { ...state, ...next };
  emit();
};

function load() {
  if (loading) return loading;
  loading = localDb
    .getMeta(META)
    .then((v) => put({ img: isImg(v) ? v : "", ready: true }))
    .catch(() => put({ ready: true }));
  return loading;
}

export function setWallOn(on) {
  try {
    if (on) localStorage.setItem(ON_KEY, "1");
    else localStorage.removeItem(ON_KEY);
  } catch (e) {}
  put({ on: !!on });
}

// 换一张：存不进去的往外抛（面板上说一声），原来那张照旧
export async function setWallImage(dataUrl) {
  if (!isImg(dataUrl)) throw new Error("这不是一张图");
  await localDb.setMeta(META, dataUrl);
  put({ img: dataUrl, ready: true });
}

export function useWall() {
  const [w, setW] = useState(state);
  useEffect(() => {
    subs.add(setW);
    setW(state);
    load();
    return () => subs.delete(setW);
  }, []);
  return w;
}

// 眼下是不是“自定义”的样子：开着、图也有
export const wallShown = (w) => !!w && w.on && !!w.img;
// 开着、图还没从存档里取出来的那一小会儿：先不摆主题那一张（不然一打开先闪一下主题的图）
export const wallPending = (w) => !!w && w.on && !w.ready;

// 她选的那一张照整块屏幕铺：键盘弹出来聊天那一屏变矮，图不跟着缩、不跟着挪。
// 记下这个宽度下见过的最高的那个高（换了宽度——转屏、换窗口——重新记）
export function tallest(prev, w, h) {
  if (!prev || prev.w !== w) return { w, h };
  return h > prev.h ? { w, h } : prev;
}
