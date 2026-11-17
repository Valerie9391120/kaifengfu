// 白昼的开屏：一片米白，正中是恩师画的那只狐狸（南衙里狐宇宙那一行的那一只，ui/art/fox.js），陶土色。
// 一开始纸上是空的；过半秒底下浮出滑块；圆钮往右拉多少，狐狸就照一笔的次序画出多少
// （从后背起笔，顺着后背往上，画耳朵、脸、下巴、胸口，再从身子底下绕出尾巴，收在尾巴尖上，见 ui/art/foxLine.js；
// 起笔在哪儿是她定的）；拉到头正好画完，手指松开才进门。没拉到头就松手，圆钮弹回去，画也跟着收回去。
//
// 滑块跟丁香那一条是同一条（她要的“丁香同款”：头一版做的是一条素的，她说手感薄）：一样的尺寸、一样的液态玻璃和手感
// （liquid.js 的 prepareGlass、createSlider），只换了一套陶土色（LOOK_BZ）。底下不是画、是一片平的米白，玻璃折进来的
// 就是这一片颜色，看得出的是玻璃自己的斜面、高光和水珠。玻璃算不出来就退回不带玻璃的陶土色滑块，照样能拉。
//
// 画的是 fox.js 那块形状，上面盖一层蒙版（蒙版照 foxLine.js 那两笔描，描到哪形状露到哪）；画完了蒙版拿掉，就是恩师那块形状。
// 狐狸不经过 React：圆钮每走一帧（createSlider 的 onMove），蒙版直接写到页面上。
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as fox from "./ui/art/fox.js";
import { STROKES, TIPS, GUARD, MASK_WIDTH } from "./ui/art/foxLine.js";
import { LQ, blit, createSlider, fillMask, hintLayout, prepareGlass } from "./liquid.js";

// 尺寸同丁香那一条
const TRACK_H = 80;
const KNOB = 68;
const PAD = 6;
const SIDE = 18;
export const END = 0.985; // 拉到这么多算到头（同 liquid.js）
const PAPER = [249, 249, 247]; // 开屏的底色（--k-paper）

// 丁香那条玻璃换成陶土色：空着的那段深一点，灌满的那段亮一点；圆钮是浅陶土的环、深陶土的芯；提示的箭头是浅的。
// 底是平的，不用放大反差（mean 设成底色，两头的放大都是 1）
export const LOOK_BZ = {
  mean: 249,
  gainHi: 1,
  gainLo: 1,
  plainMul: [0.731, 0.406, 0.302],
  plainFog: [170, 92, 66],
  fullMul: [0.944, 0.663, 0.543],
  fullFog: [226, 150, 120],
  ring: [238, 184, 160],
  core: [136, 70, 48],
  hint: { color: [246, 208, 190] },
};

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
@keyframes kfsBzHint { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
.kfs-bz-hint { animation: kfsBzHint 1.4s ease-in-out infinite; }
.kfs-bz-track[data-live] .kfs-bz-hint { animation-play-state: paused; }
.kfs-bz-knob { color: #F0C2AC; transition: color .2s ease; }
.kfs-bz-knob[data-press], .kfs-bz-knob[data-done] { color: #FFF6F1; }
.kfs-bz-body { box-shadow: 0 5px 12px rgba(110,54,34,.3), 0 1px 3px rgba(110,54,34,.24); transition: box-shadow .25s ease; }
.kfs-bz-knob[data-press] .kfs-bz-body { box-shadow: 0 9px 20px rgba(110,54,34,.32), 0 2px 5px rgba(110,54,34,.2); }
.kfs-bz-knob[data-done] .kfs-bz-body { box-shadow: 0 0 14px rgba(255,255,255,.6), 0 0 30px rgba(255,206,182,.75), 0 6px 14px rgba(110,54,34,.22); }
@media (prefers-reduced-motion: reduce) { .kfs-bz-hint { animation: none; opacity: .72; } }
`;

const MASK = fillMask();

function Chev({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={LQ.hint.sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default function SplashBaizhou({ fading, onEnter }) {
  const ref = useRef(null);
  const svgRef = useRef(null);
  const trackRef = useRef(null);
  const trackCv = useRef(null);
  const fillRef = useRef(null);
  const fillCv = useRef(null);
  const knobRef = useRef(null);
  const bodyRef = useRef(null);
  const lensRef = useRef(null);
  const iconRef = useRef(null);
  const ctl = useRef(null);
  const entered = useRef(false);
  const [box, setBox] = useState(null); // 页面多大、轨道在哪
  const [ready, setReady] = useState(false); // 过了半秒
  const [late, setLate] = useState(false); // 玻璃迟迟没算好，不等了
  const [glass, setGlass] = useState("wait"); // wait 还在算 / on 好了 / off 算不出来

  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      const t = trackRef.current;
      if (!el || !t) return;
      const b = { w: el.offsetWidth, h: el.offsetHeight, tx: t.offsetLeft, ty: t.offsetTop, tw: t.offsetWidth };
      setBox((o) => (o && o.w === b.w && o.h === b.h && o.tx === b.tx && o.ty === b.ty && o.tw === b.tw ? o : b));
    };
    measure();
    window.addEventListener("resize", measure);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(ref.current);
    }
    return () => {
      window.removeEventListener("resize", measure);
      if (ro) ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 500);
    const t2 = setTimeout(() => setLate(true), 1600);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, []);

  // 圆钮走到 p：狐狸画到哪，写到页面上
  const paintFox = (p) => {
    const svg = svgRef.current;
    if (!svg) return;
    const d = drawn(p);
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

  // 手感：轨道多宽就建一个
  const tw = box ? box.tw : 0;
  useEffect(() => {
    if (!tw) return;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}
    const c = createSlider({
      els: { track: trackRef.current, knob: knobRef.current, body: bodyRef.current, lens: lensRef.current, icon: iconRef.current, fill: fillRef.current },
      geom: { W: tw, H: TRACK_H, pad: PAD, knob: KNOB },
      onMove: paintFox,
      reduced,
    });
    ctl.current = c;
    trackRef.current.__kfs = c; // 测试和截图从这儿摆姿势
    return () => {
      c.destroy();
      ctl.current = null;
    };
  }, [tw]);

  // 玻璃：位置量好了就算；页面大小变了重算。底下是一片平的米白：拿一小块这个颜色的画布当“开屏图”，铺满整页
  const key = box ? [box.w, box.h, box.tx, box.ty, box.tw].join(",") : "";
  useEffect(() => {
    if (!box) return;
    let off = false;
    const timer = setTimeout(() => {
      if (off) return;
      try {
        const flat = document.createElement("canvas");
        flat.width = 16;
        flat.height = 16;
        const fx = flat.getContext("2d");
        fx.fillStyle = `rgb(${PAPER.join(",")})`;
        fx.fillRect(0, 0, 16, 16);
        const g = prepareGlass({
          img: flat,
          map: { w: 16, h: 16, scale: Math.max(box.w, box.h) / 16 + 1, ox: -8, oy: -8 },
          rect: { x: box.tx, y: box.ty, w: box.tw, h: TRACK_H },
          pad: PAD,
          knob: KNOB,
          dpr: window.devicePixelRatio,
          look: LOOK_BZ,
        });
        blit(trackCv.current, g.plain, g.w, g.h);
        blit(fillCv.current, g.full, g.w, g.h);
        if (ctl.current) ctl.current.setGlass(g);
        setGlass("on");
      } catch (e) {
        if (ctl.current) ctl.current.setGlass(null);
        setGlass("off");
      }
    }, 0);
    return () => {
      off = true;
      clearTimeout(timer);
    };
  }, [key]);

  const enter = () => {
    if (entered.current) return;
    entered.current = true;
    onEnter();
  };
  const onDown = (e) => {
    if (fading || entered.current || !ctl.current) return;
    ctl.current.down(e.clientX);
    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (x) {}
    }
  };
  const onMove = (e) => {
    if (ctl.current) ctl.current.move(e.clientX);
  };
  const onUp = () => {
    if (ctl.current && ctl.current.up()) enter();
  };

  const on = glass === "on";
  const show = ready && (glass !== "wait" || late);
  const hint = hintLayout(PAD, KNOB);
  const b = box || { tw: 390 - SIDE * 2 };

  return (
    <div
      ref={ref}
      className="kfs-bz-splash absolute inset-0 z-50 overflow-hidden"
      style={{ background: "rgb(var(--k-paper))", opacity: fading ? 0 : 1, transition: "opacity .7s ease", pointerEvents: fading ? "none" : "auto" }}
    >
      <style>{CSS}</style>
      {/* 狐狸：摆在正中偏上一点 */}
      <div className="absolute flex items-center justify-center" style={{ left: 0, right: 0, top: 0, bottom: "18%", pointerEvents: "none" }}>
        <svg ref={svgRef} className="kfs-bz-fox" viewBox="0 0 24 24" aria-hidden="true" style={{ width: "min(58vw, 240px)", height: "min(58vw, 240px)", overflow: "visible" }}>
          <defs>
            <mask id="kfs-bz-mask" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
              {/* 次序要紧：头一笔和它的小笔 → 挡板（黑的，挡住第二笔还没画到的尾巴）→ 第二笔和它的小笔 */}
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

      {/* 滑块：同丁香那一条 */}
      <div
        ref={trackRef}
        className="kfs-bz-track"
        data-glass={on ? "on" : "off"}
        style={{
          position: "absolute",
          left: SIDE,
          right: SIDE,
          bottom: "max(24px, calc(4px + var(--kfs-sab)))",
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          ...(on
            ? { boxShadow: "0 14px 30px rgba(140,74,50,0.22), 0 3px 8px rgba(120,62,42,0.14)" }
            : {
                // 不带玻璃的样子：一条实的陶土色
                background: "rgba(178,98,72,0.94)",
                boxShadow: "0 12px 30px rgba(140,74,50,0.26), inset 0 0 0 1px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.14)",
              }),
          opacity: show ? 1 : 0,
          transform: show ? "none" : "translateY(18px)",
          transition: "opacity .5s ease, transform .5s cubic-bezier(.2,.8,.2,1)",
          pointerEvents: show ? "auto" : "none",
        }}
      >
        {/* 空着的玻璃 */}
        <canvas ref={trackCv} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", display: on ? "block" : "none", pointerEvents: "none" }} />
        {/* 提示的三个箭头 */}
        <div
          aria-hidden="true"
          className="flex items-center"
          style={{ position: "absolute", left: hint.left, top: 0, height: "100%", color: on ? `rgb(${LOOK_BZ.hint.color.join(",")})` : "rgba(246,208,190,0.85)", pointerEvents: "none" }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="kfs-bz-hint" style={{ display: "flex", marginLeft: i ? hint.gap - hint.size : 0, animationDelay: `${i * 0.18}s` }}>
              <Chev size={hint.size} />
            </span>
          ))}
        </div>
        {/* 灌满的玻璃：圆钮走到哪露到哪 */}
        <div
          ref={fillRef}
          aria-hidden="true"
          style={{ position: "absolute", left: 0, top: 0, height: "100%", width: 0, overflow: "hidden", display: on ? "block" : "none", pointerEvents: "none", WebkitMaskImage: MASK, maskImage: MASK }}
        >
          <canvas ref={fillCv} style={{ position: "absolute", left: 0, top: 0, width: b.tw, height: TRACK_H }} />
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
            const c = ctl.current;
            if (!c || fading || entered.current) return;
            if (e.key === "ArrowRight" || e.key === "End") c.jump(true);
            else if (e.key === "ArrowLeft" || e.key === "Home") c.jump(false);
            else if ((e.key === "Enter" || e.key === " ") && c.atEnd()) enter();
          }}
          className="kfs-bz-knob"
          style={{ position: "absolute", left: PAD, top: PAD, width: KNOB, height: KNOB, padding: 0, border: 0, borderRadius: "50%", background: "transparent", touchAction: "none", WebkitTapHighlightColor: "transparent" }}
        >
          <span
            ref={bodyRef}
            className="kfs-bz-body"
            style={{ position: "absolute", left: 0, top: 0, width: KNOB, height: KNOB, boxSizing: "border-box", borderRadius: "50%", ...(on ? {} : { background: "rgba(136,70,48,0.45)", border: "8px solid #EEB8A0" }) }}
          />
          <canvas ref={lensRef} aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: on ? "block" : "none", pointerEvents: "none" }} />
          <span ref={iconRef} className="flex items-center justify-center" style={{ position: "absolute", left: 0, top: 0, width: KNOB, height: KNOB, pointerEvents: "none" }}>
            <Chev size={44} />
          </span>
        </button>
      </div>
    </div>
  );
}
