import { createRoot } from "react-dom/client";
import Gate from "./Gate.jsx";
import { initGap } from "./gap.js";
import { initKeyboardFit } from "./keyboard.js";
import { initNoZoom } from "./nozoom.js";
import { initTheme } from "./theme.js";

// 主题：这台手机上选过就用选的，没选过就看是从哪个入口进来的（见 theme.js）
initTheme();

// iOS 主屏幕底下空一条：一打开就量，能撑满就撑满，够不着就贴底淡出（见 gap.js）
initGap();
// 键盘弹出来时，输入框整块贴在键盘上面（见 keyboard.js）
initKeyboardFit();
// 整页不许捏（见 nozoom.js）
initNoZoom();

// 够不着的时候（data-kfs-gap="bottom"），页面最底下淡进系统画的那条的颜色（就是网页底色 --k-base）

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
        background: "linear-gradient(to bottom, rgba(var(--k-base),0) 0%, rgba(var(--k-base),0.55) 45%, rgb(var(--k-base)) 100%)",
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
