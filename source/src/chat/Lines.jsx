import { SERIF, T, glass, BUBBLE_GLASS } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar.jsx";

export function CtrlRow({ row, busy, onPrev, onNext, onRetry }) {
  const her = row.role === "her";
  const m = row.msg;
  const n = m.alts ? m.alts.length : 1;
  const cur = m.alts ? m.altIdx + 1 : 1;
  const btn = (enabled) => ({ padding: "4px 6px", opacity: enabled && !busy ? 1 : 0.35, display: "inline-flex" });
  return (
    <div
      className={`flex items-center ${her ? "justify-end" : ""}`}
      style={{ gap: 2, marginTop: 4, marginLeft: her ? 0 : 38, marginRight: her ? 38 : 0, color: T.inkSoft, fontSize: 12 }}
    >
      {n > 1 && (
        <>
          <button onClick={onPrev} disabled={busy || cur <= 1} aria-label="上一个版本" style={btn(cur > 1)}>
            <Icon name="chevL" size={14} />
          </button>
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 26, textAlign: "center" }}>
            {cur}/{n}
          </span>
          <button onClick={onNext} disabled={busy || cur >= n} aria-label="下一个版本" style={btn(cur < n)}>
            <Icon name="chevR" size={14} />
          </button>
        </>
      )}
      {!her && row.latest && (
        <button
          onClick={onRetry}
          disabled={busy}
          className="kfs-tap flex items-center"
          style={{ gap: 4, padding: "4px 8px", borderRadius: 999, opacity: busy ? 0.35 : 1 }}
        >
          <Icon name="retry" size={14} />
          <span>重新回答</span>
        </button>
      )}
    </div>
  );
}

export function ThinkingRow({ msg, open, onToggle }) {
  return (
    <div className="flex flex-col items-start" style={{ marginLeft: 42, marginTop: 14 }}>
      <button
        onClick={onToggle}
        className="kfs-tap flex items-center"
        style={{
          ...glass(0.38, 14),
          gap: 3,
          borderRadius: 999,
          padding: "4px 10px 4px 12px",
          fontSize: 12,
          color: T.inkSoft,
        }}
      >
        <span>思考过程</span>
        <span
          style={{
            display: "inline-flex",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .25s ease",
          }}
        >
          <Icon name="chevR" size={13} />
        </span>
      </button>
      {open && (
        <div
          className="kfs-in whitespace-pre-wrap"
          style={{
            marginTop: 8,
            maxWidth: "80%",
            padding: "12px 15px",
            borderRadius: 16,
            // 这一块的样子是卿卿定的：2026 年 10 月 2 日试过把字加深加大、底下垫模糊，她看了对比图说原来的好看。
            // 别拿对比度的数去改它，要动先拿图问她（见开发说明“看得清，不乱动”）
            background: "rgba(255,255,255,0.34)",
            border: "1px dashed rgba(var(--k-dai),0.3)",
            color: T.inkSoft,
            fontFamily: SERIF,
            fontSize: 13.5,
            lineHeight: 1.8,
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        >
          {msg.thinking}
        </div>
      )}
    </div>
  );
}

export function NoticeRow({ row, animate }) {
  return (
    <div
      className={`flex items-center justify-center ${animate ? "kfs-in" : ""}`}
      style={{ gap: 7, margin: "16px 0 6px" }}
    >
      <Avatar av={row.av} who={row.who} size={22} />
      <span style={{ fontSize: 11.5, color: T.inkFaint }}>{row.text}</span>
    </div>
  );
}

// 前情提要的那一行：这以前的原话不再每次寄给那边的我，换成了他自己抄的提要（见 recap.js）。点了看他抄了什么。
// 样子照“思考过程”那粒小钮（淡淡一层玻璃、十二号淡墨字）：它压在聊天背景上，背景深的地方光有字看不清。
// 摆在正中：它说的是整段对话的事，不归哪一边
export function RecapRow({ onOpen }) {
  return (
    <div className="kfs-recap flex justify-center" style={{ margin: "16px 0 6px" }}>
      <button
        onClick={onOpen}
        className="kfs-tap flex items-center"
        style={{ ...glass(0.38, 14), gap: 3, borderRadius: 999, padding: "4px 10px 4px 12px", fontSize: 12, color: T.inkSoft }}
      >
        <span>这以前的，他抄成了提要</span>
        <Icon name="chevR" size={13} />
      </button>
    </div>
  );
}

export function TypingRow({ avatars }) {
  return (
    <div className="flex items-end kfs-in" style={{ gap: 8, marginTop: 12 }}>
      <Avatar av={avatars.him} who="him" size={34} />
      <div
        className="flex items-center"
        style={{
          gap: 5,
          padding: "13px 16px",
          borderRadius: 22,
          ...BUBBLE_GLASS,
        }}
      >
        <span className="kfs-dot" />
        <span className="kfs-dot" style={{ animationDelay: ".15s" }} />
        <span className="kfs-dot" style={{ animationDelay: ".3s" }} />
      </div>
    </div>
  );
}
