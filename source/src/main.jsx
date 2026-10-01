import { createRoot } from "react-dom/client";
import Gate from "./Gate.jsx";

// 有的 iOS（26 以后几个版本）把主屏幕上的网页铺到状态栏底下以后，整页会矮一个状态栏，
// 最底下空出一条系统画的色块，颜色取网页底色，网页本身画不到那里，补高也没用（会把输入框挤出去）。
// 这是 WebKit 自己的毛病（Bug 301108），别人试过各种高度写法也一样。
// 量出来是这种情况就在 <html> 上记一笔 data-kfs-gap="bottom"：
// 输入框不再给底下横条让位，直接贴到网页最底边，底色和那条接上（见 App.jsx 的 DOCK_GLASS）；
// 开屏、门口、日记这些页面，最底下加一段淡出，淡进那条色块的颜色。
function safeTop() {
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
  document.body.appendChild(d);
  const h = d.getBoundingClientRect().height || 0;
  d.remove();
  return h;
}

export function detectGap() {
  const root = document.documentElement;
  let gap = false;
  try {
    const standalone =
      window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const top = safeTop();
    const g = full - window.innerHeight;
    gap = standalone && top > 0 && g > 0 && Math.abs(g - top) <= 3;
  } catch (e) {}
  if (gap) root.setAttribute("data-kfs-gap", "bottom");
  else root.removeAttribute("data-kfs-gap");
}

detectGap();
window.addEventListener("resize", detectGap);
window.addEventListener("orientationchange", () => setTimeout(detectGap, 300));
window.addEventListener("pageshow", detectGap);
setTimeout(detectGap, 500);

const MIST = "#D6DCCD";

function BottomMist() {
  return (
    <div
      aria-hidden="true"
      className="kfs-bottom-mist"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: 46,
        background: `linear-gradient(to bottom, rgba(214,220,205,0) 0%, rgba(214,220,205,0.55) 45%, ${MIST} 100%)`,
        pointerEvents: "none",
        zIndex: 60,
      }}
    />
  );
}

createRoot(document.getElementById("root")).render(
  <>
    <Gate />
    <BottomMist />
  </>
);
