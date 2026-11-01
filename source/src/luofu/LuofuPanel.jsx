import { T, SERIF, glass } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";

// 罗浮梦那一页（南衙里点“罗浮梦”，见 luofu/parts.js）：卿卿 11 月 1 日定的“一个简单的页面，两颗按钮：梦库、梦廊”。
// 同江湖棋局那一张：南衙的菜单换成这一张；点了梦库、梦廊，这一张换成那一页，那一页右上角的叉回到这一张（我先定的）
function Btn({ cls, name, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`kfs-tap ${cls} w-full flex items-center justify-between text-left`}
      style={{ ...glass(0.5, 16), borderRadius: 18, padding: "15px 16px 15px 18px", color: T.ink }}
    >
      <span style={{ fontFamily: SERIF, fontSize: 16, letterSpacing: "0.14em" }}>{name}</span>
      <Icon name="chevR" size={17} color={T.inkSoft} />
    </button>
  );
}

export function LuofuPanel({ onPool, onGallery }) {
  return (
    <div className="kfs-luofu flex flex-col" style={{ gap: 10 }}>
      <Btn cls="kfs-luofu-pool" name="梦库" onClick={onPool} />
      <Btn cls="kfs-luofu-gallery" name="梦廊" onClick={onGallery} />
    </div>
  );
}
