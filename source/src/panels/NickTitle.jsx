import { useState, useEffect, useRef } from "react";
import { HER_NAME } from "../names.js";
import { T } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { SHEET_TITLE } from "../ui/parts.jsx";

// 账户面板最上面：卿卿的昵称，后面一支钢笔。点钢笔就地改，回车、点对勾、点别处都算改好；
// 清空了保存就回到默认的“卿卿”。只换这一处的显示，底下头像旁边和日记本里还是“卿卿”
export function NickTitle({ name, onSave }) {
  const [draft, setDraft] = useState(null); // null 是没在改
  const settled = useRef(true);
  const opened = useRef(""); // 点钢笔那一刻的名字：一个字没动就不存，免得盖掉别的设备刚同步过来的
  const latest = useRef({ draft, onSave });
  latest.current = { draft, onSave };
  const start = () => {
    settled.current = false;
    opened.current = name;
    setDraft(name);
  };
  const finish = (save) => {
    if (settled.current) return;
    settled.current = true;
    if (save && draft !== opened.current) onSave(draft || "");
    setDraft(null);
  };
  // 改到一半直接把面板关了（输入框来不及失去焦点）：写了的也算数
  useEffect(
    () => () => {
      if (settled.current) return;
      settled.current = true;
      if (latest.current.draft !== opened.current) latest.current.onSave(latest.current.draft || "");
    },
    []
  );
  if (draft === null) {
    return (
      <div className="flex items-center min-w-0 flex-1" style={{ gap: 2, marginRight: 10 }}>
        <span className="truncate" style={SHEET_TITLE}>
          {name}
        </span>
        <button
          onClick={start}
          aria-label="改昵称"
          className="kfs-tap flex-shrink-0 flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: 999, color: T.inkSoft }}
        >
          <Icon name="pen" size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center min-w-0 flex-1" style={{ gap: 8, marginRight: 14 }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            finish(false);
          }
        }}
        onFocus={(e) => {
          // 一进来就把旧名字全选上，直接打字就是换掉
          const el = e.target;
          try {
            el.setSelectionRange(0, el.value.length);
          } catch (x) {}
        }}
        onBlur={() => finish(true)}
        autoFocus
        placeholder={HER_NAME}
        aria-label="我的昵称"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="kfs-field flex-1 min-w-0"
        style={{
          ...SHEET_TITLE,
          height: 32,
          padding: "0 12px",
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.6)",
          border: "1px solid rgba(255,255,255,0.85)",
          outline: "none",
          userSelect: "text",
          WebkitUserSelect: "text",
        }}
      />
      <button
        onClick={() => finish(true)}
        onMouseDown={(e) => e.preventDefault()}
        aria-label="保存昵称"
        className="kfs-tap flex-shrink-0 flex items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: 999, color: "#fff", background: T.daiGrad }}
      >
        <Icon name="check" size={16} sw={2.2} />
      </button>
    </div>
  );
}
