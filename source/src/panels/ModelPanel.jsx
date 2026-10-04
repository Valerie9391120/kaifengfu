import { useState } from "react";
import { MODELS } from "../models.js";
import { T, glass, chipPrimary, field } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";

export function ModelPanel({ current, onPick }) {
  const [custom, setCustom] = useState(MODELS.find((m) => m.id === current) ? "" : current);
  return (
    <div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {MODELS.map((m) => {
          const active = current === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onPick(m.id)}
              className="flex items-center text-left"
              style={{ ...glass(active ? 0.62 : 0.36, 14), borderRadius: 16, padding: "11px 14px", gap: 10 }}
            >
              <span className="flex-1 min-w-0">
                <span className="block" style={{ fontSize: 15, color: T.ink }}>
                  {m.label}
                </span>
                <span className="block" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
                  {m.note}
                </span>
              </span>
              {active && <Icon name="check" size={18} color={T.dai} sw={2.2} />}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>其他模型ID（以后出新模型时用）</div>
        <div className="flex" style={{ gap: 8 }}>
          <input className="kfs-field" value={custom} onChange={(e) => setCustom(e.target.value.trim())} placeholder="claude-…" autoCapitalize="off" autoCorrect="off" style={field} />
          <button onClick={() => custom && onPick(custom)} className="kfs-tap flex-shrink-0" style={chipPrimary}>
            用这个
          </button>
        </div>
      </div>
    </div>
  );
}
