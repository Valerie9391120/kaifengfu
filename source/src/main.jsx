import { createRoot } from "react-dom/client";
import Gate from "./Gate.jsx";

// 背景铺到状态栏底下以后，时间和电量会变成白字；顶上垫一层很淡的墨绿，免得看不清
function TopShade() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "calc(env(safe-area-inset-top) * 1.5)",
        background: "linear-gradient(to bottom, rgba(30,46,42,0.28) 0%, rgba(30,46,42,0.12) 55%, rgba(30,46,42,0) 100%)",
        pointerEvents: "none",
        zIndex: 60,
      }}
    />
  );
}

createRoot(document.getElementById("root")).render(
  <>
    <Gate />
    <TopShade />
  </>
);
