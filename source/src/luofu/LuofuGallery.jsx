import { useState } from "react";
import { Sheet } from "../ui/parts.jsx";
import { Icon } from "../ui/Icon.jsx";
import { T, SERIF, flat } from "../ui/style.js";
import { dateOf } from "../tuhua.js";
import { galleryOf } from "./parts.js";

// 罗浮梦的梦廊那一页（罗浮梦那一页点“梦廊”）。卿卿 11 月 1 日定的：她只看得到记得完整的那一类梦（引擎里 type: "card" 的那几种做过的），
// 标题、来源、哪天梦的，点开看全文。我先定的（告诉过她）：最新的在最上面；不写一共多少张、还剩多少张，不留空位；
// 空着写“梦廊里还没有留下梦。”；日期照图画院的写法（今年的写“11月1日”，别的年份带上年）。
// 梦廊里是做梦那一刻的那一份（存在进度里，见 luofu/parts.js）：梦库里删了、改了，这里照旧。
// 一场一个小块，不磨砂（同梦库那一页）。state 是进度（引擎的存档）；now 现在（日期写不写年份）；onClose 回到罗浮梦那一页
export const EMPTY_GALLERY = "梦廊里还没有留下梦。";
const dayOf = (at, nowYear) => {
  const t = Date.parse(at || "");
  return Number.isFinite(t) ? dateOf(t, nowYear) : "";
};

export function LuofuGallery({ state, now = new Date(), onClose, look = "" }) {
  const [reading, setReading] = useState(null); // 点开的那一场（编号）
  const list = galleryOf(state);
  const year = now.getFullYear();
  const one = reading ? list.find((e) => e.id === reading) : null;
  return (
    <Sheet title="梦廊" onClose={onClose} look={look} sub={look ? "锦盒 · 罗浮梦" : ""}>
      {one ? (
        <div className="kfs-lf-read">
          <button onClick={() => setReading(null)} className="kfs-lf-back kfs-tap flex items-center" style={{ color: T.inkSoft, fontSize: 13, padding: "2px 2px 10px", gap: 2 }}>
            <Icon name="chevL" size={15} />
            梦廊
          </button>
          <div className="kfs-lf-rtitle" style={{ fontFamily: SERIF, fontSize: 18, color: T.ink, letterSpacing: "0.08em", lineHeight: 1.5, margin: "0 2px" }}>
            {one.title}
          </div>
          <div className="kfs-lf-rmeta break-words" style={{ fontSize: 12, color: T.inkSoft, margin: "4px 2px 14px" }}>
            {[one.source, dayOf(one.at, year)].filter(Boolean).join(" · ")}
          </div>
          <div className="kfs-lf-rtext break-words" style={{ ...flat(0.5), borderRadius: 16, padding: "14px 16px", fontSize: 14.5, color: T.ink, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>
            {one.text}
          </div>
        </div>
      ) : list.length ? (
        <div className="kfs-lf-gallery flex flex-col" style={{ gap: 8 }}>
          {list.map((e) => (
            <button key={e.id} onClick={() => setReading(e.id)} className="kfs-lf-gitem kfs-tap w-full flex items-center justify-between text-left" style={{ ...flat(0.5), borderRadius: 16, padding: "11px 12px 11px 16px", gap: 10 }}>
              <span className="block flex-1 min-w-0">
                <span className="kfs-lf-gtitle block" style={{ fontFamily: SERIF, fontSize: 15, color: T.ink, letterSpacing: "0.06em" }}>
                  {e.title}
                </span>
                <span className="kfs-lf-gmeta block" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
                  {[e.source, dayOf(e.at, year)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Icon name="chevR" size={16} color={T.inkFaint} />
            </button>
          ))}
        </div>
      ) : (
        <p className="kfs-lf-gempty" style={{ fontSize: 14, color: T.inkSoft, margin: "4px 2px 8px" }}>
          {EMPTY_GALLERY}
        </p>
      )}
    </Sheet>
  );
}
