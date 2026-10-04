import { useState } from "react";
import { shortDate } from "../days.js";
import { SERIF, T, glass } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { useLongPress } from "../ui/press.js";
import { Glows, IconBtn } from "../ui/parts.jsx";

function HistoryItem({ c, currentId, now, editing, onOpen, onDelete, onLongPress }) {
  const lp = useLongPress((rect) => onLongPress && onLongPress(c, rect));
  return (
    <div
      {...lp}
      className="flex items-center"
      style={{ ...glass(c.id === currentId ? 0.66 : 0.46, 22), borderRadius: 20, padding: "12px 14px", gap: 8, WebkitTouchCallout: "none" }}
    >
      <button className="flex-1 text-left min-w-0" onClick={() => onOpen(c.id)}>
        <span className="flex items-baseline justify-between" style={{ gap: 8 }}>
          <span className="truncate" style={{ fontSize: 15, color: T.ink }}>
            {c.title}
          </span>
          <span className="flex-shrink-0" style={{ fontSize: 11, color: T.inkSoft }}>
            {shortDate(c.updatedAt, now)}
          </span>
        </span>
        <span className="block truncate" style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3 }}>
          {c.preview}
        </span>
      </button>
      {editing && (
        <button
          onClick={() => onDelete(c.id)}
          aria-label="删除这段对话"
          className="kfs-tap flex items-center justify-center flex-shrink-0"
          style={{ width: 36, height: 36, borderRadius: 999, color: "#B4544A", background: "rgba(255,255,255,0.6)" }}
        >
          <Icon name="trash" size={18} />
        </button>
      )}
    </div>
  );
}

export function HistoryPage({ index, currentId, now, onBack, onOpen, onDelete, onLongPress }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="absolute inset-0 z-40 flex flex-col kfs-page" style={{ background: T.bg }}>
      <Glows />
      <div
        className="relative z-10 flex items-center"
        style={{ ...glass(0.52, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}
      >
        <IconBtn onClick={onBack} label="返回">
          <Icon name="chevL" />
        </IconBtn>
        <div className="flex-1 text-center" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.1em", color: T.ink }}>
          历史对话
        </div>
        <button onClick={() => setEditing(!editing)} className="kfs-tap" style={{ padding: "8px 12px", fontSize: 14, color: T.dai }}>
          {editing ? "完成" : "编辑"}
        </button>
      </div>
      <div className="kfs-page-scroll relative z-10 flex-1 overflow-y-auto kfs-scroll flex flex-col" style={{ marginTop: 12, padding: "0 12px 12px", gap: 8 }}>
        {index.length === 0 && (
          <p className="text-center" style={{ fontSize: 13, color: T.inkSoft, marginTop: 64 }}>
            还没有对话。回去说句话，这里就有了。
          </p>
        )}
        {index.map((c) => (
          <HistoryItem key={c.id} c={c} currentId={currentId} now={now} editing={editing} onOpen={onOpen} onDelete={onDelete} onLongPress={onLongPress} />
        ))}
      </div>
    </div>
  );
}
