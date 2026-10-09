import { sepLabel } from "../days.js";
import { T, glass } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { safeTopPx } from "../ui/parts.jsx";

// heard：长按的是他的语音条的话，它眼下转没转文字（菜单里那一项写“转文字”还是“取消转文字”）；
// hearable：给不给“转文字”（念不成、没人念的那种，气泡上已经把字摆出来了，不给）
export function MsgMenu({ menu, now, busy, heard = false, hearable = true, onClose, onCopy, onEdit, onRetry, onHeard }) {
  const { row, rect } = menu;
  const her = row.role === "her";
  const it = row.item;
  const acts = [];
  // 他的语音条：头一项是转文字（照微信），转了以后变成“取消转文字”
  if (!her && it.type === "voice" && hearable) acts.push({ k: "heard", label: heard ? "取消转文字" : "转文字", icon: heard ? "unheard" : "heard" });
  if (it.type === "text" || it.type === "voice") acts.push({ k: "copy", label: "复制", icon: "copy" });
  if (it.type === "doc") acts.push({ k: "copy", label: "复制全文", icon: "copy" });
  if (her && it.type === "text") acts.push({ k: "edit", label: "编辑", icon: "pen" });
  if (!her) acts.push({ k: "retry", label: "重新回答", icon: "retry" });
  const menuW = 196;
  const menuH = 44 + acts.length * 47;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  // 撑满屏幕的时候 innerHeight 还是网页以为的那么矮，按整页实际的高来算
  const vh = typeof window !== "undefined" ? Math.max(window.innerHeight, Math.round(document.body.getBoundingClientRect().height) || 0) : 844;
  let top = rect.top - menuH - 10;
  if (top < 12 + safeTopPx()) top = Math.min(rect.bottom + 10, vh - menuH - 12);
  let left = her ? rect.right - menuW : rect.left;
  left = Math.max(12, Math.min(left, vw - menuW - 12));
  return (
    <div className="absolute inset-0 z-50" onClick={onClose} style={{ background: "rgba(var(--k-dim),0.14)" }}>
      <div
        className="kfs-in"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", top, left, width: menuW, ...glass(0.86, 30), borderRadius: 22, padding: "4px 0 6px" }}
      >
        <div style={{ padding: "10px 18px 6px", fontSize: 12, color: T.inkSoft }}>{sepLabel(row.msg.ts, now)}</div>
        {acts.map((a) => {
          const off = busy && a.k !== "copy" && a.k !== "heard";
          return (
            <button
              key={a.k}
              disabled={off}
              onClick={() => (a.k === "copy" ? onCopy(row) : a.k === "edit" ? onEdit(row) : a.k === "heard" ? onHeard(row) : onRetry(row))}
              className="w-full flex items-center text-left"
              style={{ gap: 12, padding: "12px 18px", fontSize: 15, color: T.ink, opacity: off ? 0.4 : 1 }}
            >
              <Icon name={a.icon} size={19} />
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
