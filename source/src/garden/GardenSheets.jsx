import { Sheet } from "../ui/parts.jsx";
import { T, SERIF, HAIRLINE } from "../ui/style.js";
import { lookView, bookView, gardenAchievementsView } from "./view.js";

// 他屋里园子的三页（推近花盆，卡片上那三颗：看看园子、群芳谱、成就；在案上那一层里弹出来，照屋里卡片的样子，同妆台那三页）。
// 只看，不改（园子的存档只有家里的闹钟写）；零件见 view.js。state 是园子的存档（kfs2:garden），today 是她这边的今天
const SUB = "钧窑六方盆 · 园子";
const H = { fontFamily: SERIF, fontSize: 15, color: T.ink, letterSpacing: "0.08em", margin: "22px 2px 8px" };
const SMALL = { fontSize: 12, color: T.inkSoft, lineHeight: 1.6 };
const DIM = 0.42;

// ---------- 看看园子 ----------
export function GardenLook({ state, today, onClose }) {
  const v = lookView(state, today);
  return (
    <Sheet title="看看园子" onClose={onClose} look="room" sub={SUB}>
      {v.kind === "never" && (
        <p className="kfs-gd-never" style={{ fontSize: 14, color: T.inkSoft, margin: "4px 2px 8px" }}>
          他还没进过园子。头一回进去，会得一盆魏紫。
        </p>
      )}
      {v.kind === "garden" && (
        <>
          {v.plant ? (
            <div className="kfs-gd-plant">
              <div className="kfs-gd-name" style={{ fontFamily: SERIF, fontSize: 17, color: T.ink, letterSpacing: "0.1em", margin: "2px 2px 6px" }}>
                {v.plant.name}
              </div>
              <p className="kfs-gd-now" style={{ fontSize: 14.5, color: T.ink, lineHeight: 1.8, margin: "0 2px" }}>
                {v.plant.text}
              </p>
              {v.plant.bloom && (
                <p className="kfs-gd-bloom" style={{ fontFamily: SERIF, fontSize: 14, color: T.ink, lineHeight: 1.9, margin: "8px 2px 0", letterSpacing: "0.04em", whiteSpace: "pre-line" }}>
                  {v.plant.bloom}
                </p>
              )}
              {v.plant.since && <p style={{ ...SMALL, margin: "6px 2px 0" }}>{v.plant.since}</p>}
            </div>
          ) : (
            <p className="kfs-gd-now" style={{ fontSize: 14.5, color: T.ink, lineHeight: 1.8, margin: "2px 2px 0" }}>
              {v.empty}
            </p>
          )}
          <div style={H}>照料的账</div>
          <div className="kfs-gd-rows" style={{ borderTop: HAIRLINE }}>
            {v.rows.map((r) => (
              <div key={r.label} className="kfs-gd-row flex" style={{ borderBottom: HAIRLINE, padding: "9px 2px", gap: 14 }}>
                <span className="flex-shrink-0" style={{ width: 40, fontSize: 13, color: T.inkSoft, letterSpacing: "0.1em" }}>
                  {r.label}
                </span>
                <span className="flex-1 min-w-0" style={{ fontSize: 14.5, color: T.ink, lineHeight: 1.65 }}>
                  {r.text}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------- 群芳谱 ----------
export function GardenBook({ state, onClose }) {
  const v = bookView(state);
  return (
    <Sheet title="群芳谱" onClose={onClose} look="room" sub={SUB}>
      <p className="kfs-gd-got" style={{ fontSize: 14, color: T.ink, margin: "0 2px 12px", letterSpacing: "0.04em" }}>
        {v.head}
      </p>
      <div className="kfs-gd-book" style={{ borderTop: HAIRLINE }}>
        {v.list.map((f) => (
          <div key={f.id} className={`kfs-gd-flower${f.on ? " on" : ""}`} data-id={f.id} style={{ borderBottom: HAIRLINE, padding: "11px 2px 12px", opacity: f.on ? 1 : DIM }}>
            <div className="flex items-baseline" style={{ gap: 10 }}>
              <span className="flex-shrink-0" style={{ width: 26, fontSize: 12.5, color: T.inkSoft, letterSpacing: "0.04em" }}>
                {f.no}
              </span>
              <span className="kfs-gd-fname" style={{ fontFamily: SERIF, fontSize: 15, color: T.ink, letterSpacing: "0.08em" }}>
                {f.name}
              </span>
            </div>
            <div className="kfs-gd-ftext" style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.85, marginTop: 4, paddingLeft: 36, whiteSpace: "pre-line" }}>
              {f.text}
            </div>
            {f.meta && <div style={{ ...SMALL, marginTop: 3, paddingLeft: 36 }}>{f.meta}</div>}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- 成就 ----------
export function GardenAchievements({ state, onClose }) {
  const v = gardenAchievementsView(state);
  return (
    <Sheet title="成就" onClose={onClose} look="room" sub={SUB}>
      <p className="kfs-gd-lit" style={{ fontSize: 14, color: T.ink, margin: "0 2px 12px", letterSpacing: "0.04em" }}>
        点亮了 {v.lit} 个，一共 {v.total} 个。
      </p>
      <div className="kfs-gd-achs" style={{ borderTop: HAIRLINE }}>
        {v.list.map((a) => (
          <div key={a.id} className={`kfs-gd-ach${a.on ? " on" : ""}`} data-id={a.id} style={{ borderBottom: HAIRLINE, padding: "9px 2px", opacity: a.on ? 1 : DIM }}>
            <div style={{ fontFamily: SERIF, fontSize: 14.5, color: T.ink, letterSpacing: "0.04em" }}>{a.name}</div>
            <div style={{ ...SMALL, marginTop: 1 }}>{a.description}</div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
