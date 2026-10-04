import { useState, useRef } from "react";
import { T, glass } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { safeTopPx } from "../ui/parts.jsx";

// 长按一段对话：重命名、删除（删除要点两下）
export function ChatMenu({ menu, onClose, onRename, onDelete }) {
  const { chat, rect } = menu;
  const [armed, setArmed] = useState(false);
  // 长按松手那一下有时会补一个点击，落在遮罩上就把菜单关了；刚弹出来的一小会儿不认
  const shownAt = useRef(Date.now());
  const menuW = 200;
  const menuH = 44 + 2 * 47;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? Math.max(window.innerHeight, Math.round(document.body.getBoundingClientRect().height) || 0) : 844;
  let top = rect.bottom + 8;
  if (top + menuH > vh - 12) top = Math.max(12 + safeTopPx(), rect.top - menuH - 8);
  const left = Math.max(12, Math.min(rect.left + 12, vw - menuW - 12));
  return (
    <div
      className="absolute inset-0 z-50"
      onClick={() => Date.now() - shownAt.current > 400 && onClose()}
      style={{ background: "rgba(var(--k-dim),0.14)" }}
    >
      <div
        className="kfs-in"
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", top, left, width: menuW, ...glass(0.86, 30), borderRadius: 22, padding: "4px 0 6px" }}
      >
        <div className="truncate" style={{ padding: "10px 18px 6px", fontSize: 12, color: T.inkSoft }}>
          {chat.title}
        </div>
        <button onClick={() => onRename(chat)} role="menuitem" className="w-full flex items-center text-left" style={{ gap: 12, padding: "12px 18px", fontSize: 15, color: T.ink }}>
          <Icon name="pen" size={19} />
          重命名
        </button>
        <button
          onClick={() => (armed ? onDelete(chat) : setArmed(true))}
          role="menuitem"
          className="w-full flex items-center text-left"
          style={{ gap: 12, padding: "12px 18px", fontSize: 15, color: "#B4544A" }}
        >
          <Icon name="trash" size={19} />
          {armed ? "再点一次，删掉" : "删除"}
        </button>
      </div>
    </div>
  );
}
