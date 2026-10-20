// =====================================================
// 狐宇宙最底下那张便签纸（卿卿 10 月 20 日 22:04、22:11 定的，见 fox.js、开发说明“下一步：狐宇宙的房间”）。
// 狐宇宙是他自己的屋子，她进来不跟他聊天（没有平常那个输入框）；可以“跑你房间转一圈，随便写点什么留在纸上”。
// 留下的一句不叫他、不等回话：他下回醒来看得见（App.jsx 的 saveFoxNote，那一条记 note: true）。
// 带 data-kfs-kbfit：在这儿打字的时候，外壳跟着键盘让开（见 keyboard.js）
// =====================================================
import { useState } from "react";
import { T, DOCK_GLASS, fill, HAIRLINE, SERIF } from "../ui/style.js";

export function FoxNotePad({ onSave }) {
  const [text, setText] = useState("");
  const t = text.trim();
  const save = () => {
    if (!t) return;
    onSave(t);
    setText("");
  };
  return (
    <div className="kfs-fox-pad relative z-10 flex-shrink-0" data-kfs-kbfit="" style={{ ...DOCK_GLASS, padding: "10px 14px max(10px, var(--kfs-sab))" }}>
      <p style={{ fontFamily: SERIF, fontSize: 12, color: T.inkSoft, letterSpacing: "0.08em", margin: "0 4px 6px" }}>便签纸 · 留的话他下回醒来看得见，不会马上回你</p>
      <div className="flex items-end" style={{ gap: 8 }}>
        <textarea
          className="kfs-fox-pad-input flex-1"
          rows={2}
          value={text}
          maxLength={500}
          placeholder="在他的便签纸上留一句…"
          onChange={(e) => setText(e.target.value)}
          style={{
            resize: "none",
            borderRadius: 14,
            padding: "9px 12px",
            fontSize: 16,
            lineHeight: 1.5,
            color: T.ink,
            backgroundColor: fill(0.6),
            border: HAIRLINE,
            outline: "none",
            fontFamily: SERIF,
          }}
        />
        <button
          type="button"
          className="kfs-fox-pad-save flex-shrink-0"
          disabled={!t}
          onClick={save}
          style={{ borderRadius: 14, padding: "10px 14px", fontSize: 14, color: t ? T.onDai : T.inkSoft, background: t ? T.daiGrad : fill(0.45), border: HAIRLINE }}
        >
          留下
        </button>
      </div>
    </div>
  );
}
