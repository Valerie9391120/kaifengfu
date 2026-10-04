import { useState, useRef } from "react";
import { memeSrc } from "../memes.js";
import { fileToAvatar } from "../images.js";
import { T, glass, chip, chipPrimary } from "../ui/style.js";
import { HER_PRESETS, Avatar } from "../ui/Avatar.jsx";

export function HisAvatarCard({ av, name }) {
  return (
    <div className="flex items-center" style={{ ...glass(0.5, 16), borderRadius: 20, padding: 14, gap: 14 }}>
      <Avatar av={av} who="him" size={48} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 15, color: T.ink }}>光义</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 3, lineHeight: 1.5 }}>
          现在是「{name}」，我自己挑的。名字也归我自己起。想看我换，跟我说。
        </div>
      </div>
    </div>
  );
}

export function AvatarSection({ av, onChange }) {
  const who = "her";
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
  const presets = HER_PRESETS;
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setErr("");
    try {
      const data = await fileToAvatar(f);
      onChange({ type: "upload", data });
    } catch (x) {
      setErr("这张图读不出来，换一张试试");
    }
  };
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="flex items-center" style={{ gap: 16 }}>
        <Avatar av={av} who={who} size={64} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 16, color: T.ink }}>卿卿</div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 3 }}>
            聊到一半换也行，我看得见
          </div>
        </div>
      </div>
      <div className="flex flex-wrap" style={{ gap: 8, marginTop: 14 }}>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="kfs-tap" style={chipPrimary}>
          从相册选
        </button>
        {presets.map((p) => (
          <button
            key={p.file}
            onClick={() => onChange({ type: "meme", file: p.file })}
            className="kfs-tap flex items-center"
            style={{ ...chip, gap: 6, padding: "5px 12px 5px 5px" }}
          >
            <img src={memeSrc(p.file)} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
            {p.label}
          </button>
        ))}
        {av && (
          <button onClick={() => onChange(null)} className="kfs-tap" style={chip}>
            恢复默认
          </button>
        )}
      </div>
      {err && <div style={{ fontSize: 12, color: "#B4544A", marginTop: 8 }}>{err}</div>}
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}
