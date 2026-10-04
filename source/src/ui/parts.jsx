import { SERIF, T, glass } from "./style.js";
import { Icon } from "./Icon.jsx";

// =========================================================
//   小组件
// =========================================================
export function Glows() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        style={{
          position: "absolute",
          width: 460,
          height: 460,
          top: -170,
          right: -150,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(250,232,190,0.45) 0%, rgba(250,232,190,0) 66%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          bottom: -150,
          left: -160,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(var(--k-glow-light),0.8) 0%, rgba(var(--k-glow-light),0) 66%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          top: "38%",
          left: "58%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(var(--k-glow),0.42) 0%, rgba(var(--k-glow),0) 66%)",
        }}
      />
    </div>
  );
}

export function IconBtn({ onClick, label, active, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="kfs-tap flex-shrink-0 flex items-center justify-center"
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        color: active ? T.dai : T.inkSoft,
        backgroundColor: active ? "rgba(255,255,255,0.7)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

export const SHEET_TITLE = { fontFamily: SERIF, fontSize: 19, letterSpacing: "0.08em", color: T.ink };

export function Sheet({ title, onClose, children }) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end"
      onClick={onClose}
      style={{
        background: "rgba(var(--k-dim),0.2)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="kfs-sheet kfs-sheet-box kfs-scroll overflow-y-auto"
        style={{
          ...glass(0.74, 34),
          borderRadius: 30,
          margin: "8px 8px calc(8px + env(safe-area-inset-bottom))",
          padding: "12px 20px 26px",
          maxHeight: "84%",
        }}
      >
        <div
          style={{
            width: 38,
            height: 5,
            borderRadius: 3,
            margin: "0 auto 12px",
            background: "rgba(var(--k-soft),0.22)",
          }}
        />
        <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
          {/* 标题一般是几个字；账户面板传进来的是能改的昵称（NickTitle） */}
          {typeof title === "string" ? <span style={SHEET_TITLE}>{title}</span> : title}
          <button
            onClick={onClose}
            aria-label="关闭"
            className="kfs-tap flex-shrink-0 flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "rgba(255,255,255,0.65)",
              color: T.inkSoft,
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="flex-shrink-0"
      style={{
        width: 46,
        height: 28,
        borderRadius: 999,
        padding: 3,
        background: on ? T.daiGrad : "rgba(var(--k-soft),0.25)",
        transition: "background .2s ease",
      }}
    >
      <span
        style={{
          display: "block",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 2px 6px rgba(var(--k-dim),0.25)",
          transform: on ? "translateX(18px)" : "none",
          transition: "transform .2s ease",
        }}
      />
    </button>
  );
}

export function RoundBtn({ onClick, label, active, children }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      aria-label={label}
      className="kfs-tap flex-shrink-0 flex items-center justify-center"
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        color: active ? "#fff" : T.inkSoft,
        background: active ? T.daiGrad : "rgba(255,255,255,0.42)",
        border: "1px solid rgba(255,255,255,0.65)",
      }}
    >
      {children}
    </button>
  );
}

// 状态栏有多高（没有刘海区时是 0）
export function safeTopPx() {
  try {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
    document.body.appendChild(d);
    const h = d.getBoundingClientRect().height || 0;
    d.remove();
    return h;
  } catch (e) {
    return 0;
  }
}
