import { useState } from "react";
import { newId } from "../util.js";
import { T, glass, chip, chipPrimary, field } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Toggle } from "../ui/parts.jsx";

export function McpPanel({ mcps, onChange }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", url: "", token: "" });
  const [armed, setArmed] = useState(false);

  const openEdit = (m) => {
    setEditing(m ? m.id : "new");
    setForm({ name: m ? m.name : "", url: m ? m.url : "", token: m ? m.token || "" : "" });
    setArmed(false);
  };
  const save = () => {
    const name = form.name.trim();
    const url = form.url.trim();
    if (!name || !/^https?:\/\//.test(url)) return;
    if (editing === "new") {
      onChange(mcps.concat([{ id: newId(), name, url, token: form.token.trim(), enabled: true }]));
    } else {
      onChange(mcps.map((m) => (m.id === editing ? { ...m, name, url, token: form.token.trim() } : m)));
    }
    setEditing(null);
  };

  if (editing) {
    const valid = form.name.trim() && /^https?:\/\//.test(form.url.trim());
    return (
      <div>
        <button onClick={() => setEditing(null)} className="kfs-tap flex items-center" style={{ gap: 2, fontSize: 13.5, color: T.dai, marginBottom: 14 }}>
          <Icon name="chevL" size={16} /> 返回列表
        </button>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>名字</div>
        <input className="kfs-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="比如 Notion" style={field} />
        <div style={{ fontSize: 12, color: T.inkSoft, margin: "14px 0 6px" }}>链接</div>
        <input className="kfs-field" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" autoCapitalize="off" autoCorrect="off" style={field} />
        <div style={{ fontSize: 12, color: T.inkSoft, margin: "14px 0 6px" }}>授权token（需要登录的服务才填）</div>
        <input className="kfs-field" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="可不填" autoCapitalize="off" autoCorrect="off" style={field} />
        <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 18 }}>
          <button onClick={save} className="kfs-tap" style={{ ...chipPrimary, opacity: valid ? 1 : 0.45 }}>
            保存
          </button>
          {editing !== "new" && (
            <button
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  return;
                }
                onChange(mcps.filter((m) => m.id !== editing));
                setEditing(null);
              }}
              className="kfs-tap"
              style={{ ...chip, color: "#A8473D" }}
            >
              {armed ? "再点一次，删掉它" : "删除"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
        打开的工具会带进每次对话。需要登录的服务要填授权token，不然连不上。
      </p>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {mcps.map((m) => (
          <div key={m.id} className="flex items-center" style={{ ...glass(m.enabled ? 0.56 : 0.34, 16), borderRadius: 18, padding: "10px 12px", gap: 10 }}>
            <button onClick={() => openEdit(m)} className="flex items-center flex-1 min-w-0 text-left" style={{ gap: 10 }}>
              <span style={{ color: m.enabled ? T.dai : T.inkFaint, flexShrink: 0 }}>
                <Icon name="plug" size={20} />
              </span>
              <span className="min-w-0">
                <span className="block truncate" style={{ fontSize: 14, color: T.ink }}>
                  {m.name}
                </span>
                <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
                  {m.url}
                </span>
              </span>
            </button>
            <Toggle on={m.enabled} onChange={(v) => onChange(mcps.map((x) => (x.id === m.id ? { ...x, enabled: v } : x)))} label={`启用${m.name}`} />
          </div>
        ))}
      </div>
      <button onClick={() => openEdit(null)} className="kfs-tap flex items-center" style={{ ...chip, gap: 6, marginTop: 14 }}>
        <Icon name="plus" size={16} /> 添加 MCP
      </button>
    </div>
  );
}
