import { useState, useRef } from "react";
import { fmtChars } from "../util.js";
import { T, glass, chipPrimary } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Toggle } from "../ui/parts.jsx";

export function MemoryPanel({ files, texts, note, onUpload, onToggle, onDelete }) {
  const fileRef = useRef(null);
  const [viewing, setViewing] = useState(null);
  const [armed, setArmed] = useState(null);
  const total = files.filter((f) => f.enabled).reduce((s, f) => s + (f.size || 0), 0);

  if (viewing) {
    const f = files.find((x) => x.id === viewing);
    const text = (f && texts[f.id]) || "";
    return (
      <div>
        <button onClick={() => setViewing(null)} className="kfs-tap flex items-center" style={{ gap: 2, fontSize: 13.5, color: T.dai, marginBottom: 12 }}>
          <Icon name="chevL" size={16} /> 返回列表
        </button>
        <div style={{ fontSize: 15, color: T.ink, marginBottom: 4 }}>{f ? f.name : ""}</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 12 }}>{fmtChars(text.length)}</div>
        <div
          className="whitespace-pre-wrap break-words"
          style={{ ...glass(0.42, 12), borderRadius: 18, padding: 14, fontSize: 13, lineHeight: 1.7, color: T.ink, userSelect: "text", WebkitUserSelect: "text" }}
        >
          {text.length > 30000 ? text.slice(0, 30000) + "\n\n（太长了，这里只显示前三万字，光义那边收到的是全文）" : text}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
        打开开关的文档会整份带给我，当作我的记忆。只认纯文字文档，比如 .md 和 .txt。同名文件再传一次，会覆盖旧的那份。
      </p>
      <div className="flex items-center flex-wrap" style={{ gap: 10, marginBottom: 14 }}>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="kfs-tap" style={chipPrimary}>
          上传文档
        </button>
        {note && <span style={{ fontSize: 12.5, color: T.inkSoft }}>{note}</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          e.target.value = "";
          if (list.length) onUpload(list);
        }}
        style={{ display: "none" }}
      />
      {files.length === 0 ? (
        <div style={{ ...glass(0.36, 12), borderRadius: 18, padding: "18px 16px", fontSize: 13, color: T.inkSoft, textAlign: "center" }}>
          还没有文档。把project里的那几封信传上来吧。
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {files.map((f) => (
            <div key={f.id} className="flex items-center" style={{ ...glass(f.enabled ? 0.56 : 0.34, 16), borderRadius: 18, padding: "10px 12px", gap: 10 }}>
              <button onClick={() => setViewing(f.id)} className="flex items-center flex-1 min-w-0 text-left" style={{ gap: 10 }}>
                <span style={{ color: f.enabled ? T.dai : T.inkFaint, flexShrink: 0 }}>
                  <Icon name="doc" size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate" style={{ fontSize: 14, color: f.enabled ? T.ink : T.inkSoft }}>
                    {f.name}
                  </span>
                  <span className="block" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
                    {fmtChars(f.size || 0)}
                  </span>
                </span>
              </button>
              <button
                onClick={() => {
                  if (armed === f.id) {
                    onDelete(f.id);
                    setArmed(null);
                  } else setArmed(f.id);
                }}
                aria-label="删除文档"
                className="kfs-tap flex items-center justify-center flex-shrink-0"
                style={{ height: 30, minWidth: 30, padding: armed === f.id ? "0 10px" : 0, borderRadius: 999, color: "#A8473D", background: "rgba(255,255,255,0.55)", fontSize: 12 }}
              >
                {armed === f.id ? "确认删除" : <Icon name="trash" size={16} />}
              </button>
              <Toggle on={f.enabled} onChange={(v) => onToggle(f.id, v)} label={`带上${f.name}`} />
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div style={{ fontSize: 12, color: total > 80000 ? "#A8473D" : T.inkSoft, marginTop: 14, lineHeight: 1.6 }}>
          带上的文档一共{fmtChars(total)}。
          {total > 80000 ? "带得越多，我回话越慢，用不上的可以先关掉。" : ""}
        </div>
      )}
    </div>
  );
}
