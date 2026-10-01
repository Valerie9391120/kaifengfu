import { createRoot } from "react-dom/client";
import Gate from "./Gate.jsx";

// 主屏幕上的开封府铺到状态栏底下以后，有的 iOS 会把页面算矮一截（正好矮一个状态栏），
// 屏幕最底下就空出一条。量出来真是这种情况，就把整页补到整块屏幕那么高。
function safeTop() {
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
  document.body.appendChild(d);
  const h = d.getBoundingClientRect().height || 0;
  d.remove();
  return h;
}

export function fitScreen() {
  const root = document.documentElement;
  try {
    const standalone =
      window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const top = safeTop();
    const gap = full - window.innerHeight;
    if (standalone && top > 0 && gap > 0 && Math.abs(gap - top) <= 3) {
      root.style.setProperty("--kfs-h", full + "px");
      return;
    }
  } catch (e) {}
  root.style.removeProperty("--kfs-h");
}

fitScreen();
window.addEventListener("resize", fitScreen);
window.addEventListener("orientationchange", () => setTimeout(fitScreen, 300));
window.addEventListener("pageshow", fitScreen);
setTimeout(fitScreen, 500);

createRoot(document.getElementById("root")).render(<Gate />);
