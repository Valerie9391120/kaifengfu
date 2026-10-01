import { createRoot } from "react-dom/client";
import Gate from "./Gate.jsx";
import { initGap } from "./gap.js";

// iOS 主屏幕底下空一条：一打开就量，能撑满就撑满，够不着就贴底淡出（见 gap.js）
initGap();

// 够不着的时候（data-kfs-gap="bottom"），页面最底下淡进系统画的那条的颜色
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
