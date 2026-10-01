// =====================================================
// 主题：青绿（沙燕）和丁香（小猪）
// 颜色全写成 CSS 变量（input.css 里 :root 是青绿，html[data-kfs-theme="dingxiang"] 是丁香），
// 换主题就是换 <html> 上的 data-kfs-theme，页面不用重画；图（聊天背景、开屏）跟着 useTheme() 换。
// 主题记在这台手机上（localStorage），不跟着云端走：
//   从哪个入口添加到主屏幕，头一回进去就是哪个主题（青绿的入口是 ./，丁香的入口是 ./dingxiang/）；
//   之后在账户面板里可以随时换，图标不跟着变（苹果在添加那一刻就把图标定死了）。
// =====================================================
import { useEffect, useState } from "react";

const KEY = "kfs-theme";

export const THEMES = {
  qinglv: {
    label: "青绿",
    wall: "./assets/wall.webp",
    meta: "#D6DCCD",
    entrance: "./",
    icon: "沙燕",
  },
  dingxiang: {
    label: "丁香",
    wall: "./assets/wall-dingxiang.webp",
    meta: "#EFE2EF",
    entrance: "./dingxiang/",
    icon: "小猪",
  },
};

// 这次是从哪个入口进来的
export function entranceTheme() {
  try {
    return /\/dingxiang\/(index\.html)?$/.test(window.location.pathname) ? "dingxiang" : "qinglv";
  } catch (e) {
    return "qinglv";
  }
}

let current = null;
const subs = new Set();

function apply(t) {
  current = t;
  document.documentElement.setAttribute("data-kfs-theme", t);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", THEMES[t].meta);
}

export function initTheme() {
  let t = null;
  try {
    t = localStorage.getItem(KEY);
  } catch (e) {}
  if (!THEMES[t]) t = entranceTheme();
  apply(t);
  return t;
}

export function getTheme() {
  return current || initTheme();
}

export function setTheme(t) {
  if (!THEMES[t]) return;
  try {
    localStorage.setItem(KEY, t);
  } catch (e) {}
  apply(t);
  subs.forEach((f) => f(t));
}

export function useTheme() {
  const [t, setT] = useState(getTheme());
  useEffect(() => {
    subs.add(setT);
    return () => subs.delete(setT);
  }, []);
  return t;
}

// 某个主题的入口网址（换图标时要用 Safari 打开它重新添加）
export function entranceUrl(t) {
  try {
    return new URL(THEMES[t].entrance, document.baseURI).href;
  } catch (e) {
    return "";
  }
}
