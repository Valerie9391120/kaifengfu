import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SERIF, T, glass, fill, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { useLongPress } from "../ui/press.js";
import { IconBtn } from "../ui/parts.jsx";
import { useSlideIn } from "../ui/enter.js";
import { dateOf, cleanTitle, TITLE_MAX, layoutScrolls, mountOf, vaseOf, hashStr, sceneOf } from "../tuhua.js";

// 图画院（见 tuhua.js、开发说明“图画院”“图画院：框景”两节）。
// 11 月 1 日照卿卿的草图换了样子：恩师那张画拆成的框景——一面墙，右上角挂落，底下一张长案，案上月白瓶里插着当天那一瓶花（十瓶轮着）；
// 中间他画的画一幅一幅裱成竖轴，左右错落挂着，从新到旧；手指一推上下翻，带一点阻尼（手感照藏音匣第二页）。
// 轴在挂落、长案、瓶花后面翻过去；翻到底，最后那几幅都能整个露出来。
// 裱绫的颜色每一张随机挑一个（tuhua.js 的 MOUNTS）；横的挂成短一些的竖轴；轴底下垂一张小签，写名字和哪天画的（她 11 月 1 日挑的）。
// 点一幅看大图；长按一幅“改名字”（没名字的写“起名字”）、“删掉这张”（再点一次才删）。
// entries 见 tuhua.js 的 listEntries；imgOf(id) 那一张的大图（data URL，没取到是空的）；onRemove(id) 删掉这一张；onRename(id, 名字) 改名字

/* global __KFS_TUHUA_ASSETS__ */
const A =
  typeof __KFS_TUHUA_ASSETS__ !== "undefined"
    ? __KFS_TUHUA_ASSETS__
    : {
        wall: "./static/tuhua/wall.webp",
        lattice: "./static/tuhua/lattice.webp",
        table: "./static/tuhua/table.webp",
        damask: "./static/tuhua/damask.webp",
        paper: "./static/tuhua/paper.webp",
        vases: Array.from({ length: 10 }, (_, i) => `./static/tuhua/vase${i + 1}.webp`),
      };

// 框景是一张画，不跟着主题换色：墙上的字、小签上的字用固定的墨色
const INK = "#3b2e25";
const INK_SOFT = "rgba(74,58,46,0.74)";
const WALL = "#ddccb6";
const ROD = "linear-gradient(180deg, #a07a5a 0%, #6d4c36 42%, #3f2c1e 100%)";
const KNOB = "radial-gradient(circle at 38% 32%, #85614a 0%, #3e2a1d 68%, #24170f 100%)";
const EDGE = "#4b3527";

// 手感（照藏音匣第二页）：松手以后滑多远、翻过头弹回来的劲
const FRICTION = 4.5;
const EDGE_K = 180;
const EDGE_C = 26;
const RUBBER = 0.35;
const TAP = 7;

const MENU_H = 104; // 长按那个菜单大约多高（两项）
const MENU_DEAF = 450; // 菜单刚冒出来这么久以内不认点
// 菜单摆在哪儿：那一幅上面放得下就摆上面，放不下摆下面，都放不下贴着屏幕底
function menuTop(rect) {
  const vh = typeof window !== "undefined" ? window.innerHeight : 844;
  const top = Math.max(rect.top, 60);
  if (top - MENU_H - 8 >= 60 && rect.top >= 60) return rect.top - MENU_H - 8;
  if (rect.bottom + 8 + MENU_H <= vh - 12) return rect.bottom + 8;
  return Math.max(12, Math.min(vh - MENU_H - 12, top + 20));
}

function darken(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// 一幅轴
function Scroll({ it, nowYear, onOpen, onLong }) {
  const { e, x, y, w, p } = it;
  const lp = useLongPress((rect) => onLong(e, rect));
  const [, col] = mountOf(e.id);
  const line = darken(col, 0.7);
  const silk = { backgroundColor: col, backgroundImage: `url(${A.damask})`, backgroundSize: "100% auto", backgroundPosition: "center", backgroundBlendMode: "multiply" };
  const hh = hashStr(e.id + "/签");
  const tilt = ((hh % 1000) / 1000 - 0.5) * 5; // 小签本来就有一点歪（±2.5°）
  const delay = (hh >>> 10) % 320; // 一进来各自晃两下，先后差一点
  const ov = Math.round(w * 0.03);
  const knobW = Math.max(5, Math.round(w * 0.07));
  const knobH = Math.round(p.rodB * 1.4);
  const rodB = p.rodT + p.face;
  const tagTop = rodB + p.rodB;
  return (
    <button
      {...lp}
      onClick={() => onOpen(e)}
      className="kfs-tuhua-card th-scroll"
      data-id={e.id}
      data-col={it.col}
      aria-label={e.title || dateOf(e.at, nowYear)}
      style={{ position: "absolute", left: x, top: y, width: w, height: p.h, padding: 0, margin: 0, border: 0, background: "none", textAlign: "left", WebkitTouchCallout: "none" }}
    >
      {/* 挂绳、钉子 */}
      <svg width={w} height={p.cord} style={{ position: "absolute", left: 0, top: -p.cord, overflow: "visible", pointerEvents: "none" }} aria-hidden="true">
        <path d={`M${(w * 0.1).toFixed(1)} ${p.cord + 1} L${w / 2} 4 L${(w * 0.9).toFixed(1)} ${p.cord + 1}`} fill="none" stroke="#6e5644" strokeWidth="1" strokeLinejoin="round" />
        <circle cx={w / 2} cy={4} r={3.6} fill="#8d6c44" stroke="#5b4430" strokeWidth="0.8" />
        <circle cx={w / 2 - 1} cy={3} r={1.2} fill="#ecd8ad" opacity="0.85" />
      </svg>
      {/* 天杆 */}
      <span aria-hidden="true" style={{ position: "absolute", left: -ov, width: w + 2 * ov, top: 0, height: p.rodT, borderRadius: p.rodT / 2, background: ROD, boxShadow: "0 1px 2px rgba(40,25,15,0.35)" }} />
      {/* 轴面：天头、细线、画心、细线、地头；两边一道深褐的边 */}
      <span
        className="th-face"
        style={{ position: "absolute", left: 0, top: p.rodT, width: w, height: p.face, background: EDGE, padding: `0 ${p.edge}px`, display: "flex", flexDirection: "column", boxShadow: "0 9px 18px rgba(70,48,28,0.2), 0 2px 5px rgba(70,48,28,0.16)" }}
      >
        <span style={{ height: p.tian, flexShrink: 0, ...silk }} />
        <span style={{ height: p.sep, flexShrink: 0, background: line }} />
        <span style={{ height: p.core, flexShrink: 0, padding: p.m, backgroundColor: "#efe5cf", backgroundImage: `url(${A.paper})`, backgroundSize: "100% auto" }}>
          <img src={e.thumb} alt="" draggable={false} style={{ display: "block", width: p.iw, height: p.ih, objectFit: "cover", WebkitTouchCallout: "none" }} />
        </span>
        <span style={{ height: p.sep, flexShrink: 0, background: line }} />
        <span style={{ height: p.di, flexShrink: 0, ...silk }} />
      </span>
      {/* 地杆、两头的轴头 */}
      <span aria-hidden="true" style={{ position: "absolute", left: -ov, width: w + 2 * ov, top: rodB, height: p.rodB, borderRadius: p.rodB / 2, background: ROD, boxShadow: "0 2px 3px rgba(40,25,15,0.35)" }} />
      <span aria-hidden="true" style={{ position: "absolute", left: -ov - knobW + 2, top: rodB - (knobH - p.rodB) / 2, width: knobW, height: knobH, borderRadius: knobW * 0.4, background: KNOB }} />
      <span aria-hidden="true" style={{ position: "absolute", left: w + ov - 2, top: rodB - (knobH - p.rodB) / 2, width: knobW, height: knobH, borderRadius: knobW * 0.4, background: KNOB }} />
      {/* 底下垂一张小签：名字、哪天画的 */}
      <span className="th-tagwrap" style={{ position: "absolute", left: w / 2, top: tagTop, width: 0, height: 0, "--th-tilt": `${tilt.toFixed(2)}deg`, animationDelay: `${delay}ms` }}>
        <span aria-hidden="true" style={{ position: "absolute", left: -0.5, top: -1, width: 1, height: p.string + 3, background: "#7a6250" }} />
        <span
          className="th-tag"
          style={{
            position: "absolute",
            left: -p.tagW / 2,
            top: p.string,
            width: p.tagW,
            minHeight: p.tagH,
            padding: "8px 8px 6px",
            background: "#f6eedd",
            border: "1px solid rgba(150,120,90,0.32)",
            borderRadius: 3,
            boxShadow: "0 3px 7px rgba(70,48,28,0.18)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: 3, width: 4, height: 4, marginLeft: -2, borderRadius: 2, background: "rgba(90,70,55,0.5)" }} />
          {e.title ? (
            <span className="kfs-tuhua-title" style={{ display: "block", maxWidth: "100%", fontFamily: SERIF, fontSize: 13, lineHeight: 1.35, letterSpacing: "0.04em", color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.title}
            </span>
          ) : null}
          <span className="kfs-tuhua-date" style={{ display: "block", fontSize: 10.5, letterSpacing: "0.05em", color: INK_SOFT, marginTop: e.title ? 1 : 0 }}>
            {dateOf(e.at, nowYear)}
          </span>
        </span>
      </span>
    </button>
  );
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

// 屏幕顶上让开多少（刘海）：拿一个看不见的小块量 env(safe-area-inset-top)
function useSafeTop() {
  const [v, setV] = useState(0);
  useLayoutEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
    document.body.appendChild(el);
    setV(el.offsetHeight || 0);
    el.remove();
  }, []);
  return v;
}

export function TuhuaPage({ entries, imgOf, now, onBack, onRemove, onRename }) {
  const pageRef = useRef(null);
  const stageRef = useRef(null);
  const deckRef = useRef(null);
  useSlideIn(pageRef);
  const [big, setBig] = useState(null); // 点开的那一张
  const [act, setAct] = useState(null); // 长按的那一张：{ e, rect, armed }
  const [naming, setNaming] = useState(null); // 正在改名字的那一张
  const [size, setSize] = useState({ W: 390, H: 844 });
  const safeTop = useSafeTop();
  const today = now || new Date();
  const nowYear = today.getFullYear();
  const vase = vaseOf(today);
  const list = entries || [];

  // 屏幕多大
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return undefined;
    const read = () => setSize((o) => (o.W === el.clientWidth && o.H === el.clientHeight ? o : { W: el.clientWidth || 390, H: el.clientHeight || 844 }));
    read();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el);
    else window.addEventListener("resize", read);
    return () => (ro ? ro.disconnect() : window.removeEventListener("resize", read));
  }, []);
  const { W, H } = size;
  const lay = useMemo(() => layoutScrolls(list, W, H, { top: safeTop + 58, vase }), [list, W, H, safeTop, vase]);
  const sc = lay.scene || sceneOf(W, H, vase);

  // ======================= 上下翻（手感照藏音匣第二页：松手以后慢慢停；翻过头弹回来） =======================
  const st = useRef({ y: 0, v: 0, finger: null, dragged: false, stopped: false, raf: 0, last: 0, max: 0 });
  const paint = () => {
    const d = deckRef.current;
    if (d) d.style.transform = `translate3d(0, ${(-st.current.y).toFixed(2)}px, 0)`;
  };
  const loop = (t) => {
    const S = st.current;
    const dt = Math.min(0.033, Math.max(0.001, (t - S.last) / 1000));
    S.last = t;
    let busy = false;
    if (!S.finger) {
      const mx = S.max;
      if (S.y < 0 || S.y > mx) {
        const edge = S.y < 0 ? 0 : mx;
        S.v += (-(S.y - edge) * EDGE_K - S.v * EDGE_C) * dt;
        S.y += S.v * dt;
        if (Math.abs(S.y - edge) < 0.3 && Math.abs(S.v) < 5) {
          S.y = edge;
          S.v = 0;
        } else busy = true;
      } else if (Math.abs(S.v) > 4) {
        S.y += S.v * dt;
        S.v *= Math.exp(-FRICTION * dt);
        busy = true;
      } else S.v = 0;
    }
    paint();
    S.raf = busy ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => {
    const S = st.current;
    if (S.raf) return;
    S.last = performance.now();
    S.raf = requestAnimationFrame(loop);
  };
  useEffect(() => {
    st.current.max = lay.maxScroll;
    kick();
  }, [lay.maxScroll]);
  useEffect(() => () => st.current.raf && cancelAnimationFrame(st.current.raf), []);

  const onMove = (ev) => {
    const S = st.current;
    const f = S.finger;
    if (!f || ev.pointerId !== f.id) return;
    f.samples.push({ t: ev.timeStamp, y: ev.clientY });
    while (f.samples.length > 2 && ev.timeStamp - f.samples[0].t > 90) f.samples.shift();
    if (!f.mode) {
      if (Math.hypot(ev.clientX - f.x0, ev.clientY - f.y0) < TAP) return;
      f.mode = "scroll";
      f.y0 = ev.clientY;
      f.s0 = S.y;
      S.dragged = true;
    }
    let y = f.s0 - (ev.clientY - f.y0);
    if (y < 0) y *= RUBBER;
    else if (y > S.max) y = S.max + (y - S.max) * RUBBER;
    S.y = y;
    paint();
  };
  const onUp = (ev, cancel) => {
    const S = st.current;
    const f = S.finger;
    if (!f || ev.pointerId !== f.id) return;
    S.finger = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUpEv);
    window.removeEventListener("pointercancel", onCancelEv);
    // 松手时的速度：最后九十毫秒里手指走了多远；停了一会儿才松手的，不甩
    if (f.mode && !cancel && f.samples.length > 1 && ev.timeStamp - f.samples[f.samples.length - 1].t < 80) {
      const a = f.samples[0];
      const b = f.samples[f.samples.length - 1];
      const dt = b.t - a.t;
      S.v = dt > 0 ? (-(b.y - a.y) / dt) * 1000 : 0;
    }
    kick();
  };
  const onUpEv = (ev) => onUp(ev, false);
  const onCancelEv = (ev) => onUp(ev, true);
  const onDown = (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    const S = st.current;
    if (S.finger) return;
    S.dragged = false;
    S.stopped = Math.abs(S.v) > 40; // 正在滑：这一下只是按停，不算点
    S.v = 0;
    S.finger = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, s0: S.y, mode: "", samples: [{ t: ev.timeStamp, y: ev.clientY }] };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUpEv);
    window.addEventListener("pointercancel", onCancelEv);
  };
  const onWheel = (ev) => {
    const S = st.current;
    S.v = 0;
    S.y = Math.max(-60, Math.min(S.max + 60, S.y + ev.deltaY));
    paint();
    kick();
  };
  // 推过、按停的那一下，松手时浏览器补的点击不算点
  const onClickCapture = (ev) => {
    const S = st.current;
    if (S.dragged || S.stopped) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    S.dragged = false;
    S.stopped = false;
  };

  const bigSrc = big ? imgOf(big.id) || big.thumb : "";
  return (
    <div ref={pageRef} className="kfs-tuhua absolute inset-0 z-40 kfs-page" style={{ background: WALL, animation: "none", overflow: "hidden" }}>
      <style>{`
        .kfs-tuhua .th-tagwrap { transform-origin: 0 0; transform: rotate(var(--th-tilt)); animation: th-sway 1.7s cubic-bezier(.3,.6,.4,1) both; }
        @keyframes th-sway {
          0% { transform: rotate(calc(var(--th-tilt) + 7deg)); }
          30% { transform: rotate(calc(var(--th-tilt) - 4deg)); }
          55% { transform: rotate(calc(var(--th-tilt) + 2deg)); }
          78% { transform: rotate(calc(var(--th-tilt) - 0.8deg)); }
          100% { transform: rotate(var(--th-tilt)); }
        }
        @media (prefers-reduced-motion: reduce) { .kfs-tuhua .th-tagwrap { animation: none; } }
      `}</style>
      {/* 墙 */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundColor: WALL, backgroundImage: `url(${A.wall})`, backgroundSize: "cover", backgroundPosition: "center top" }} />

      {/* 中间：一幅一幅的轴，上下翻 */}
      <div
        ref={stageRef}
        className="th-stage"
        onPointerDown={onDown}
        onWheel={onWheel}
        onClickCapture={onClickCapture}
        style={{ position: "absolute", inset: 0, zIndex: 10, overflow: "hidden", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
      >
        <div ref={deckRef} className="th-deck" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: 0, willChange: "transform" }}>
          {lay.items.map((it) => (
            <Scroll key={it.e.id} it={it} nowYear={nowYear} onOpen={setBig} onLong={(x, rect) => setAct({ e: x, rect, armed: false, at: Date.now() })} />
          ))}
        </div>
        {list.length === 0 && (
          <div style={{ position: "absolute", left: "50%", top: Math.round(H * 0.3), width: 0, height: 0 }}>
            <svg width="16" height="40" style={{ position: "absolute", left: -8, top: -40, overflow: "visible" }} aria-hidden="true">
              <line x1="8" y1="4" x2="8" y2="41" stroke="#7a6250" strokeWidth="1" />
              <circle cx="8" cy="4" r="3.6" fill="#8d6c44" stroke="#5b4430" strokeWidth="0.8" />
            </svg>
            <div className="th-tagwrap" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, "--th-tilt": "-1.5deg" }}>
              <p
                className="kfs-tuhua-empty"
                style={{ position: "absolute", left: -58, top: 0, width: 116, padding: "10px 6px 8px", textAlign: "center", fontFamily: SERIF, fontSize: 14, letterSpacing: "0.12em", color: INK_SOFT, background: "#f6eedd", border: "1px solid rgba(150,120,90,0.32)", borderRadius: 3, boxShadow: "0 3px 7px rgba(70,48,28,0.18)" }}
              >
                还没有画
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 前面的框景：挂落、长案、瓶花（不挡手指） */}
      <div aria-hidden="true" className="th-front" style={{ position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none" }}>
        <img src={A.lattice} alt="" draggable={false} style={{ position: "absolute", right: 0, top: 0, width: sc.latticeW, height: sc.latticeH }} />
        <img src={A.table} alt="" draggable={false} style={{ position: "absolute", left: 0, bottom: 0, width: W, height: H - sc.tableTop }} />
        <img className="th-vase" data-vase={vase + 1} src={A.vases[vase]} alt="" draggable={false} style={{ position: "absolute", left: sc.vase.x, top: sc.vase.y, width: sc.vase.w, height: sc.vase.h }} />
      </div>

      {/* 左上角：返回、“图画院”（一小块玻璃，轴翻上去从它底下过） */}
      <div className="flex items-center" style={{ position: "absolute", zIndex: 30, left: 10, top: "calc(10px + env(safe-area-inset-top))", ...glass(0.55, 18), borderRadius: 999, padding: "0 16px 0 0" }}>
        <IconBtn onClick={onBack} label="返回">
          <Icon name="chevL" />
        </IconBtn>
        <span style={{ fontFamily: SERIF, fontSize: 16.5, letterSpacing: "0.16em", color: INK }}>图画院</span>
      </div>

      {/* 点开的那一张：大图，底下名字、哪天画的。点一下关掉 */}
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

      {/* 长按一幅：改名字（没名字的写“起名字”）；删掉这张（点一下变“再点一次，删掉这张”，再点才删；点别处算了）。
          菜单摆在那一幅上面（上面放不下摆下面），不摆在手指底下；刚冒出来的那一小会儿不认点：手指松开的那一下浏览器会补一下点击，
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
