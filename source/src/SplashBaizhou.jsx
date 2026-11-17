// 白昼的开屏：一片米白，正中是恩师画的那只狐狸（南衙里狐宇宙那一行的那一只，ui/art/fox.js），陶土色。
// 一开始纸上是空的；过半秒底下浮出一条素的滑块；圆钮往右拉多少，狐狸就照一笔的次序画出多少
// （从尾巴尖起，绕一圈画完尾巴，再往上画身子、脸、耳朵、后背，见 ui/art/foxLine.js）；拉到头正好画完，手指松开才进门。
// 没拉到头就松手，圆钮弹回去，画也跟着收回去。规矩同丁香那条（拉到 98.5% 以上才算到头，到头了松手才进）。
// 滑块不是液态玻璃：那个要折射底下的画才好看，这里底下是一片平的颜色。
//
// 画的是 fox.js 那块形状，上面盖一层蒙版（蒙版照 foxLine.js 那两笔描，描到哪形状露到哪）；画完了蒙版拿掉，就是恩师那块形状。
// 拖动的时候不经过 React：位置、蒙版、轨道上灌的那一截都是一帧一帧直接写到页面上的。
import { useEffect, useRef, useState } from "react";
import * as fox from "./ui/art/fox.js";
import { STROKES, TIPS, GUARD, MASK_WIDTH } from "./ui/art/foxLine.js";

const TRACK_H = 64;
const KNOB = 52;
const PAD = 6;
const SIDE = 28;
export const END = 0.985; // 拉到这么多算到头

// 滑块拉到 p（0 到 1）的时候，两笔各画到几成、补的那几小笔露不露
const TOTAL = STROKES[0].len + STROKES[1].len;
export function drawn(p) {
  const f = Math.max(0, Math.min(1, p / END));
  const at = f * TOTAL;
  return {
    f,
    s: [Math.min(1, at / STROKES[0].len), Math.max(0, Math.min(1, (at - STROKES[0].len) / STROKES[1].len))],
    tips: TIPS.map((t) => f >= t.at),
  };
}

const CSS = `
@keyframes kfsBzHint { 0%,100% { opacity: .25; } 50% { opacity: .8; } }
.kfs-bz-hint { animation: kfsBzHint 1.4s ease-in-out infinite; }
.kfs-bz-track[data-live] .kfs-bz-hint { animation: none; opacity: 0; }
.kfs-bz-body { background: #fff; color: rgb(var(--k-dai)); box-shadow: 0 2px 8px rgba(60,56,50,.14), 0 0 0 1px rgba(39,39,38,.06); transition: box-shadow .2s ease, transform .2s ease, background .2s ease, color .2s ease; }
.kfs-bz-knob[data-press] .kfs-bz-body { box-shadow: 0 6px 16px rgba(60,56,50,.18), 0 0 0 1px rgba(39,39,38,.06); transform: scale(1.06); }
.kfs-bz-knob[data-done] .kfs-bz-body { background: rgb(var(--k-dai)); color: rgb(var(--k-on-dai)); }
@media (prefers-reduced-motion: reduce) { .kfs-bz-hint { animation: none; opacity: .55; } }
`;

function Chev({ size, sw = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default function SplashBaizhou({ fading, onEnter }) {
  const trackRef = useRef(null);
  const knobRef = useRef(null);
  const fillRef = useRef(null);
  const svgRef = useRef(null);
  const st = useRef({ pos: 0, vel: 0, max: 1, dragging: false, x0: 0, p0: 0, goal: null, raf: 0, last: 0 });
  const entered = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(t);
  }, []);

  // 这一帧的样子写到页面上
  const paint = () => {
    const s = st.current;
    const knob = knobRef.current;
    const svg = svgRef.current;
    if (!knob || !svg) return;
    const p = s.max > 0 ? Math.max(0, Math.min(1, s.pos / s.max)) : 0;
    const d = drawn(p);
    knob.style.transform = `translate3d(${s.pos}px,0,0)`;
    knob.setAttribute("aria-valuenow", String(Math.round(p * 100)));
    if (d.f >= 1) knob.setAttribute("data-done", "");
    else knob.removeAttribute("data-done");
    if (fillRef.current) fillRef.current.style.width = `${PAD * 2 + KNOB + s.pos}px`;
    if (trackRef.current) {
      if (s.pos > 0.5 || s.dragging) trackRef.current.setAttribute("data-live", "");
      else trackRef.current.removeAttribute("data-live");
    }
    svg.querySelectorAll("[data-stroke]").forEach((el) => {
      const t = d.s[Number(el.getAttribute("data-stroke"))];
      // 一点没画的时候整根藏起来（不然圆头会在起笔的地方露半个点）
      el.style.visibility = t > 0 ? "visible" : "hidden";
      el.style.strokeDashoffset = String(1 - t);
    });
    svg.querySelectorAll("[data-tip]").forEach((el) => {
      el.style.visibility = d.tips[Number(el.getAttribute("data-tip"))] ? "visible" : "hidden";
    });
    // 画完了：蒙版拿掉，露出整块形状（蒙版盖不到的那一丝也在了）
    const shape = svg.querySelector("[data-fox]");
    if (shape) {
      if (d.f >= 1) shape.removeAttribute("mask");
      else shape.setAttribute("mask", "url(#kfs-bz-mask)");
    }
    svg.setAttribute("data-drawn", d.f.toFixed(3));
  };

  // 松手以后、按键盘的时候：一根弹簧把圆钮送到 goal
  const tick = (now) => {
    const s = st.current;
    s.raf = 0;
    if (s.dragging || s.goal === null) return;
    const h = Math.min(0.032, Math.max(0.001, (now - s.last) / 1000));
    s.last = now;
    const a = -230 * (s.pos - s.goal) - 24 * s.vel;
    s.vel += a * h;
    s.pos += s.vel * h;
    if (s.pos < 0) {
      s.pos = 0;
      s.vel = 0;
    }
    if (s.pos > s.max) {
      s.pos = s.max;
      s.vel = 0;
    }
    if (Math.abs(s.pos - s.goal) < 0.3 && Math.abs(s.vel) < 4) {
      s.pos = s.goal;
      s.vel = 0;
      s.goal = null;
    }
    paint();
    if (s.goal !== null) s.raf = requestAnimationFrame(tick);
  };
  const go = (goal) => {
    const s = st.current;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}
    if (reduced) {
      s.pos = goal;
      s.vel = 0;
      s.goal = null;
      paint();
      return;
    }
    s.goal = goal;
    s.last = performance.now();
    if (!s.raf) s.raf = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const measure = () => {
      const t = trackRef.current;
      if (!t) return;
      const s = st.current;
      const max = Math.max(1, t.offsetWidth - PAD * 2 - KNOB);
      const p = s.max > 0 ? s.pos / s.max : 0;
      s.max = max;
      s.pos = Math.min(max, p * max);
      paint();
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      if (st.current.raf) cancelAnimationFrame(st.current.raf);
    };
  }, []);

  const atEnd = () => st.current.pos / st.current.max >= END;
  const enter = () => {
    if (entered.current) return;
    entered.current = true;
    onEnter();
  };
  const onDown = (e) => {
    if (fading || entered.current) return;
    const s = st.current;
    s.dragging = true;
    s.goal = null;
    s.vel = 0;
    s.x0 = e.clientX;
    s.p0 = s.pos;
    e.currentTarget.setAttribute("data-press", "");
    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (x) {}
    }
    paint();
  };
  const onMove = (e) => {
    const s = st.current;
    if (!s.dragging) return;
    s.pos = Math.max(0, Math.min(s.max, s.p0 + e.clientX - s.x0));
    paint();
  };
  const onUp = (e) => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    e.currentTarget.removeAttribute("data-press");
    if (atEnd()) {
      s.pos = s.max;
      paint();
      enter();
    } else go(0);
  };

  return (
    <div
      className="kfs-bz-splash absolute inset-0 z-50 overflow-hidden"
      style={{ background: "rgb(var(--k-paper))", opacity: fading ? 0 : 1, transition: "opacity .7s ease", pointerEvents: fading ? "none" : "auto" }}
    >
      <style>{CSS}</style>
      {/* 狐狸：摆在正中偏上一点 */}
      <div className="absolute flex items-center justify-center" style={{ left: 0, right: 0, top: 0, bottom: "18%", pointerEvents: "none" }}>
        <svg ref={svgRef} className="kfs-bz-fox" viewBox="0 0 24 24" aria-hidden="true" style={{ width: "min(58vw, 240px)", height: "min(58vw, 240px)", overflow: "visible" }}>
          <defs>
            <mask id="kfs-bz-mask" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
              {/* 次序要紧：头一笔和它的小笔 → 挡板（黑的，挡住第二笔还没画到的身子）→ 第二笔和它的小笔 */}
              {[0, 1].map((k) => [
                k === 1 ? <path key="guard" d={GUARD.d} fill="none" stroke="#000" strokeWidth={GUARD.width} strokeLinecap="round" strokeLinejoin="round" /> : null,
                <path
                  key={"s" + k}
                  data-stroke={k}
                  d={STROKES[k].d}
                  pathLength="1"
                  fill="none"
                  stroke="#fff"
                  strokeWidth={MASK_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeDasharray: "1 3", strokeDashoffset: 1, visibility: "hidden" }}
                />,
                TIPS.map((t, j) =>
                  t.stroke === k ? <path key={"t" + j} data-tip={j} d={t.d} fill="none" stroke="#fff" strokeWidth={MASK_WIDTH} strokeLinecap="round" strokeLinejoin="round" style={{ visibility: "hidden" }} /> : null
                ),
              ])}
            </mask>
          </defs>
          <path data-fox="" d={fox.PATH} mask="url(#kfs-bz-mask)" style={{ fill: "rgb(var(--k-dai))" }} />
        </svg>
      </div>

      {/* 滑块 */}
      <div
        ref={trackRef}
        className="kfs-bz-track"
        style={{
          position: "absolute",
          left: SIDE,
          right: SIDE,
          bottom: "max(28px, calc(8px + var(--kfs-sab)))",
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          background: "rgba(var(--k-ink),0.045)",
          boxShadow: "inset 0 0 0 1px rgba(var(--k-ink),0.06)",
          opacity: ready ? 1 : 0,
          transform: ready ? "none" : "translateY(14px)",
          transition: "opacity .5s ease, transform .5s cubic-bezier(.2,.8,.2,1)",
          pointerEvents: ready ? "auto" : "none",
        }}
      >
        {/* 圆钮走过的那一截：淡淡的陶土色 */}
        <div ref={fillRef} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, height: "100%", width: PAD * 2 + KNOB, borderRadius: TRACK_H / 2, background: "rgba(var(--k-dai),0.16)", pointerEvents: "none" }} />
        {/* 提示的三个箭头 */}
        <div aria-hidden="true" className="flex items-center" style={{ position: "absolute", left: PAD + KNOB + 14, top: 0, height: "100%", color: "rgba(var(--k-soft),0.7)", pointerEvents: "none" }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="kfs-bz-hint" style={{ display: "flex", marginLeft: i ? -6 : 0, animationDelay: `${i * 0.18}s` }}>
              <Chev size={20} />
            </span>
          ))}
        </div>
        <button
          ref={knobRef}
          type="button"
          role="slider"
          aria-label="把圆钮拉到最右边，画完狐狸，进开封府"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={(e) => {
            if (fading || entered.current) return;
            if (e.key === "ArrowRight" || e.key === "End") go(st.current.max);
            else if (e.key === "ArrowLeft" || e.key === "Home") go(0);
            else if ((e.key === "Enter" || e.key === " ") && atEnd()) enter();
          }}
          className="kfs-bz-knob"
          style={{ position: "absolute", left: PAD, top: PAD, width: KNOB, height: KNOB, padding: 0, border: 0, borderRadius: "50%", background: "transparent", touchAction: "none", WebkitTapHighlightColor: "transparent" }}
        >
          <span
            className="kfs-bz-body flex items-center justify-center"
            style={{ position: "absolute", left: 0, top: 0, width: KNOB, height: KNOB, borderRadius: "50%" }}
          >
            <Chev size={26} sw={2.2} />
          </span>
        </button>
      </div>
    </div>
  );
}
