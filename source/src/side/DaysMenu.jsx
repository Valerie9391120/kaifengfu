import { useRef } from "react";
import { T, glass } from "../ui/style.js";
import { safeTopPx } from "../ui/parts.jsx";

// 长按侧栏最上面那张日期卡片冒出来的小菜单（卿卿 2026 年 10 月 12 日定的）。
// 里面就一行“去看并蒂莲”，只写字、不带图标（她定的：“还是不做图标了”）。点这一行才进并蒂莲，点别处收起。
// 光点卡片什么都不做：她说聊天的时候手闲不住，怕一直点进来，所以要长按、再点一下才算。
// 样子、摆法照长按历史对话的那张（ChatMenu）：放在卡片底下，底下放不下就放到上面
export function DaysMenu({ rect, onClose, onLotus }) {
  // 长按松手那一下有时会补一个点击，落在遮罩上就把菜单关了；刚弹出来的一小会儿不认（和 ChatMenu 一样）
  const shownAt = useRef(Date.now());
  const menuW = 200;
  const menuH = 10 + 47;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? Math.max(window.innerHeight, Math.round(document.body.getBoundingClientRect().height) || 0) : 844;
  let top = rect.bottom + 8;
  if (top + menuH > vh - 12) top = Math.max(12 + safeTopPx(), rect.top - menuH - 8);
  const left = Math.max(12, Math.min(rect.left + 12, vw - menuW - 12));
  return (
    <div
      className="kfs-days-menu absolute inset-0 z-50"
      onClick={() => Date.now() - shownAt.current > 400 && onClose()}
      style={{ background: "rgba(var(--k-dim),0.14)" }}
    >
      <div
        className="kfs-in"
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", top, left, width: menuW, ...glass(0.86, 30), borderRadius: 22, padding: "4px 0 6px" }}
      >
        <button onClick={onLotus} role="menuitem" className="w-full flex items-center text-left" style={{ padding: "12px 18px", fontSize: 15, color: T.ink }}>
          去看并蒂莲
        </button>
      </div>
    </div>
  );
}
