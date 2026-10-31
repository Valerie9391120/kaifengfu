import { useEffect, useRef, useState } from "react";
import { SERIF, T, glass, fill, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { useLongPress } from "../ui/press.js";
import { Glows, IconBtn } from "../ui/parts.jsx";
import { useSlideIn } from "../ui/enter.js";
import { byMonth, dateOf, cleanTitle, TITLE_MAX } from "../tuhua.js";

// 图画院（见 tuhua.js、开发说明“图画院”那节）：他画的画，一行两格，按月断开，新的在上面。
// 每一格底下写这张画的名字、哪天画的（卿卿 10 月 31 日定的；原来是他画的时候说的那句话，她说挂着一句话好奇怪）。
// 点一格看大图；长按一格“改名字”（没名字的写“起名字”）、“删掉这张”（再点一次才删）。
// entries 见 tuhua.js 的 listEntries；imgOf(id) 那一张的大图（data URL，没取到是空的）；onRemove(id) 删掉这一张；onRename(id, 名字) 改名字
const TALL = { 竖: 4 / 3, 横: 3 / 4, 方: 1 };
const MENU_H = 104; // 长按那个菜单大约多高（两项）
const MENU_DEAF = 450; // 菜单刚冒出来这么久以内不认点
// 菜单摆在哪儿：那一格上面放得下就摆上面，放不下摆下面，都放不下贴着屏幕底
function menuTop(rect) {
  const vh = typeof window !== "undefined" ? window.innerHeight : 844;
  if (rect.top - MENU_H - 8 >= 60) return rect.top - MENU_H - 8;
  if (rect.bottom + 8 + MENU_H <= vh - 12) return rect.bottom + 8;
  return Math.max(12, vh - MENU_H - 12);
}

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
        {e.title ? (
          <span
            className="kfs-tuhua-title block"
            style={{ fontFamily: SERIF, fontSize: 14, color: T.ink, lineHeight: 1.45, letterSpacing: "0.04em", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {e.title}
          </span>
        ) : null}
        <span className="kfs-tuhua-date block" style={{ fontSize: 11, color: T.inkSoft, letterSpacing: "0.04em", marginTop: e.title ? 2 : 0 }}>
          {dateOf(e.at, nowYear)}
        </span>
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

// 改名字：一个框，写好了点“好了”（回车也行），“算了”不改。写空了就是没名字
function Rename({ e, onDone, onCancel }) {
  const [text, setText] = useState(e.title || "");
  const box = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => box.current && box.current.focus(), 60);
    return () => clearTimeout(t);
  }, []);
  const save = () => onDone(cleanTitle(text));
  return (
    <div className="kfs-tuhua-rename absolute inset-0 z-50" onClick={onCancel} style={{ background: "rgba(var(--k-dim),0.22)" }}>
      <div
        className="kfs-in"
        onClick={(ev) => ev.stopPropagation()}
        style={{ position: "absolute", left: 16, right: 16, top: "calc(84px + env(safe-area-inset-top))", ...glass(0.9, 30), borderRadius: 22, padding: 14, border: HAIRLINE }}
      >
        <div className="flex items-center" style={{ gap: 12 }}>
          <img src={e.thumb} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 12, flexShrink: 0 }} />
          <input
            ref={box}
            value={text}
            maxLength={TITLE_MAX + 4}
            placeholder="这张画叫什么"
            onChange={(ev) => setText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.nativeEvent.isComposing) save();
            }}
            className="kfs-tuhua-input flex-1 min-w-0"
            style={{ fontFamily: SERIF, fontSize: 16, color: T.ink, background: fill(0.7), border: HAIRLINE, borderRadius: 14, padding: "10px 12px", outline: "none" }}
          />
        </div>
        <div className="flex justify-end" style={{ gap: 10, marginTop: 12 }}>
          <button onClick={onCancel} className="kfs-tap kfs-tuhua-cancel" style={{ padding: "8px 16px", fontSize: 14.5, color: T.inkSoft, borderRadius: 999 }}>
            算了
          </button>
          <button onClick={save} className="kfs-tap kfs-tuhua-save" style={{ padding: "8px 18px", fontSize: 14.5, color: T.onDai, background: T.daiGrad, borderRadius: 999 }}>
            好了
          </button>
        </div>
      </div>
    </div>
  );
}

export function TuhuaPage({ entries, imgOf, now, onBack, onRemove, onRename }) {
  const pageRef = useRef(null);
  useSlideIn(pageRef);
  const [big, setBig] = useState(null); // 点开的那一张
  const [act, setAct] = useState(null); // 长按的那一张：{ e, rect, armed }
  const [naming, setNaming] = useState(null); // 正在改名字的那一张
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
                    <Card key={e.id} e={e} nowYear={nowYear} onOpen={setBig} onLong={(x, rect) => setAct({ e: x, rect, armed: false, at: Date.now() })} />
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
            {big.title ? <div style={{ fontFamily: SERIF, fontSize: 17, color: "rgba(255,255,255,0.95)", lineHeight: 1.5, letterSpacing: "0.08em" }}>{big.title}</div> : null}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", letterSpacing: "0.06em", marginTop: big.title ? 6 : 0 }}>{dateOf(big.at, nowYear)}</div>
          </div>
        </div>
      )}

      {/* 长按一格：改名字（没名字的写“起名字”）；删掉这张（点一下变“再点一次，删掉这张”，再点才删；点别处算了）。
          菜单摆在那一格上面（上面放不下摆下面），不摆在手指底下；刚冒出来的那一小会儿不认点：手指松开的那一下浏览器会补一下点击，
          落在菜单上就成了点了菜单（测试里截到的：长按完“删掉这张”自己变成了“再点一次”） */}
      {act && (
        <div className="absolute inset-0 z-50" onClick={() => Date.now() - act.at > MENU_DEAF && setAct(null)} style={{ background: "rgba(var(--k-dim),0.14)" }}>
          <div
            className="kfs-in"
            onClick={(ev) => ev.stopPropagation()}
            onClickCapture={(ev) => {
              if (Date.now() - act.at <= MENU_DEAF) {
                ev.stopPropagation();
                ev.preventDefault();
              }
            }}
            style={{
              position: "fixed",
              top: menuTop(act.rect),
              left: Math.max(12, Math.min(act.rect.left, (typeof window !== "undefined" ? window.innerWidth : 390) - 220)),
              width: 208,
              ...glass(0.86, 30),
              borderRadius: 20,
              padding: "4px 0",
              border: HAIRLINE,
            }}
          >
            <button
              className="kfs-tuhua-name w-full flex items-center text-left"
              onClick={() => {
                setNaming(act.e);
                setAct(null);
              }}
              style={{ gap: 12, padding: "12px 18px", fontSize: 15, color: T.ink }}
            >
              <Icon name="pen" size={19} />
              {act.e.title ? "改名字" : "起名字"}
            </button>
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

      {naming && (
        <Rename
          e={naming}
          onCancel={() => setNaming(null)}
          onDone={(title) => {
            if (title !== (naming.title || "")) onRename(naming.id, title);
            setNaming(null);
          }}
        />
      )}
    </div>
  );
}
