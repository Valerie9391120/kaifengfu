import { useRef, useState } from "react";
import { SERIF, T, glass, fill, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { useLongPress } from "../ui/press.js";
import { Glows, IconBtn } from "../ui/parts.jsx";
import { useSlideIn } from "../ui/enter.js";
import { byMonth, dateOf } from "../tuhua.js";

// 图画院（见 tuhua.js、开发说明“图画院”那节）：他画的画，一行两格，按月断开，新的在上面。
// 每一格底下写哪天画的、他画的时候说的那句话（卿卿 10 月 30 日定的）。点一格看大图；长按一格“删掉这张”，再点一次才删。
// entries 见 tuhua.js 的 listEntries；imgOf(id) 那一张的大图（data URL，没取到是空的）；onRemove(id) 删掉这一张
const TALL = { 竖: 4 / 3, 横: 3 / 4, 方: 1 };

function Card({ e, nowYear, onOpen, onLong }) {
  const lp = useLongPress((rect) => onLong(e, rect));
  return (
    <button
      {...lp}
      onClick={() => onOpen(e)}
      className="kfs-tuhua-card kfs-tap block w-full text-left"
      data-id={e.id}
      style={{ ...glass(0.5, 16), borderRadius: 18, padding: 6, WebkitTouchCallout: "none" }}
    >
      <img src={e.thumb} alt="" draggable={false} style={{ display: "block", width: "100%", borderRadius: 13, WebkitTouchCallout: "none" }} />
      <span className="block" style={{ padding: "7px 5px 3px" }}>
        <span className="kfs-tuhua-date block" style={{ fontSize: 11, color: T.inkSoft, letterSpacing: "0.04em" }}>
          {dateOf(e.at, nowYear)}
        </span>
        {e.say ? (
          <span
            className="kfs-tuhua-say block"
            style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.5, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {e.say}
          </span>
        ) : null}
      </span>
    </button>
  );
}

// 一个月里的那几张分成左右两列：哪一列矮放哪一列（照横竖估高），一行一行看下来大致是新的在前
function twoCols(items) {
  const cols = [[], []];
  const h = [0, 0];
  for (const e of items) {
    const i = h[0] <= h[1] ? 0 : 1;
    cols[i].push(e);
    h[i] += (TALL[e.ratio] || 1) + 0.32; // 底下两行字大约占这么高
  }
  return cols;
}

export function TuhuaPage({ entries, imgOf, now, onBack, onRemove }) {
  const pageRef = useRef(null);
  useSlideIn(pageRef);
  const [big, setBig] = useState(null); // 点开的那一张
  const [act, setAct] = useState(null); // 长按的那一张：{ e, rect, armed }
  const nowYear = (now || new Date()).getFullYear();
  const months = byMonth(entries || [], nowYear);
  const bigSrc = big ? imgOf(big.id) || big.thumb : "";
  return (
    <div ref={pageRef} className="kfs-tuhua absolute inset-0 z-40 flex flex-col kfs-page" style={{ background: T.bg, animation: "none" }}>
      <Glows />
      <div className="relative z-10 flex items-center" style={{ ...glass(0.52, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}>
        <IconBtn onClick={onBack} label="返回">
          <Icon name="chevL" />
        </IconBtn>
        <div className="flex-1 text-center" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.1em", color: T.ink }}>
          图画院
        </div>
        <div style={{ width: 44 }} />
      </div>
      <div className="kfs-page-scroll relative z-10 flex-1 overflow-y-auto kfs-scroll" style={{ marginTop: 12, padding: "0 12px calc(16px + env(safe-area-inset-bottom))" }}>
        {months.length === 0 && (
          <p className="kfs-tuhua-empty text-center" style={{ fontSize: 13, color: T.inkSoft, marginTop: 64 }}>
            还没有画
          </p>
        )}
        {months.map((mo) => (
          <section key={mo.key} className="kfs-tuhua-month" style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: SERIF, fontSize: 13.5, letterSpacing: "0.12em", color: T.inkSoft, padding: "4px 6px 8px" }}>{mo.label}</div>
            <div className="flex" style={{ gap: 10, alignItems: "flex-start" }}>
              {twoCols(mo.items).map((col, i) => (
                <div key={i} className="flex flex-col" style={{ flex: 1, minWidth: 0, gap: 10 }}>
                  {col.map((e) => (
                    <Card key={e.id} e={e} nowYear={nowYear} onOpen={setBig} onLong={(x, rect) => setAct({ e: x, rect, armed: false })} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* 点开的那一张：大图，底下哪天画的、他那句话。点一下关掉 */}
      {big && (
        <div
          onClick={() => setBig(null)}
          className="kfs-tuhua-big absolute inset-0 z-50 flex flex-col items-center justify-center kfs-in"
          style={{ background: "rgba(var(--k-dim),0.78)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", padding: "calc(24px + env(safe-area-inset-top)) 18px calc(24px + env(safe-area-inset-bottom))" }}
        >
          <img src={bigSrc} alt="" style={{ maxWidth: "100%", maxHeight: "70%", borderRadius: 18, objectFit: "contain", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }} />
          <div style={{ marginTop: 14, maxWidth: 340, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", letterSpacing: "0.06em" }}>{dateOf(big.at, nowYear)}</div>
            {big.say ? <div style={{ fontSize: 14.5, color: "rgba(255,255,255,0.94)", lineHeight: 1.6, marginTop: 6, whiteSpace: "pre-wrap" }}>{big.say}</div> : null}
          </div>
        </div>
      )}

      {/* 长按一格：删掉这张（点一下变“再点一次，删掉这张”，再点才删；点别处算了） */}
      {act && (
        <div className="absolute inset-0 z-50" onClick={() => setAct(null)} style={{ background: "rgba(var(--k-dim),0.14)" }}>
          <div
            className="kfs-in"
            onClick={(ev) => ev.stopPropagation()}
            style={{
              position: "fixed",
              top: Math.max(12, Math.min(act.rect.top + 12, (typeof window !== "undefined" ? window.innerHeight : 844) - 80)),
              left: Math.max(12, Math.min(act.rect.left, (typeof window !== "undefined" ? window.innerWidth : 390) - 220)),
              width: 208,
              ...glass(0.86, 30),
              borderRadius: 20,
              padding: "4px 0",
              border: HAIRLINE,
            }}
          >
            <button
              className="kfs-tuhua-drop w-full flex items-center text-left"
              onClick={() => {
                if (!act.armed) return setAct({ ...act, armed: true });
                onRemove(act.e.id);
                setAct(null);
              }}
              style={{ gap: 12, padding: "12px 18px", fontSize: 15, color: act.armed ? T.red2 : T.ink, background: act.armed ? fill(0.4) : "transparent" }}
            >
              <Icon name="trash" size={19} />
              {act.armed ? "再点一次，删掉这张" : "删掉这张"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
