import { useState } from "react";
import { SERIF, T, glass, chip, fill } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";

// 闲笔集那一天底下的手帐卡片（样子照原来那一版的 JzCard）：还没掺的是一颗“掺一页手帐”；
// 掺了的：主照片、标题、版式 × 风格、谁排的、几条批注，点开是同页那一本（TongyeFrame.jsx）。
// 点开之前要跟云端对一回、取一回天气（最多几秒，见 App.jsx 的 tyApi.prepare）：这几秒里写着“正在打开”，点了不再点
export function TyCard({ info, notes = [], onOpen }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onOpen();
    } finally {
      setBusy(false);
    }
  };
  if (!info) {
    return (
      <button onClick={open} className="kfs-tap kfs-jz-open flex items-center" style={{ ...chip, gap: 6, opacity: busy ? 0.6 : 1 }}>
        <Icon name="sticker" size={16} />
        {busy ? "正在打开……" : "掺一页手帐"}
      </button>
    );
  }
  return (
    <button onClick={open} className="kfs-tap kfs-jz-open w-full flex items-center text-left" style={{ ...glass(0.5, 14), borderRadius: 18, padding: 10, gap: 12, opacity: busy ? 0.6 : 1 }}>
      <div style={{ width: 54, height: 54, borderRadius: 12, overflow: "hidden", background: fill(0.6), flexShrink: 0 }}>
        {info.hero ? <img src={info.hero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontFamily: SERIF, fontSize: 15, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.title || "（还没起标题）"}</div>
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
          {busy
            ? "正在打开……"
            : info.making
              ? "光义正在排……"
              : `${info.sub}${info.by === "him" ? " · 他排的" : ""}${notes.length ? ` · 批注 ${notes.length}` : ""}`}
        </div>
      </div>
      <Icon name="chevR" size={17} color={T.inkSoft} />
    </button>
  );
}
