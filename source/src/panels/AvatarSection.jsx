import { useState, useRef } from "react";
import { fileToAvatar } from "../images.js";
import { T, glass, chip, chipPrimary } from "../ui/style.js";
import { Avatar } from "../ui/Avatar.jsx";
import { Icon } from "../ui/Icon.jsx";

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

// 她的头像那一栏：“从相册选”选了直接换上（不进册子）；“头像册”点开是存好的那些（panels/AvatarBook.jsx）。
// 原来这里排着四颗写死的小钮和一颗“恢复默认”，11 月 18 日收成了头像册一颗
export function AvatarSection({ av, onChange, onBook }) {
  const who = "her";
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
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
        <button onClick={onBook} className="kfs-tap kfs-avbook-entry flex items-center" style={{ ...chip, gap: 4, paddingRight: 10 }}>
          头像册
          <Icon name="chevR" size={14} />
        </button>
      </div>
      {err && <div style={{ fontSize: 12, color: T.red2, marginTop: 8 }}>{err}</div>}
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}
