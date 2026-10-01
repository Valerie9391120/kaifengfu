// 丁香的开屏：卿卿画的戴长翅帽的小猪。
// 先是没脸红的小猪；过半秒底下浮出一条紫色的液态玻璃滑块；圆钮拉到最右边，
// 小猪脸红、白心里长出小紫心；手指松开才进门。没拉到头就松手，圆钮弹回去。
// 玻璃是自己在画布上算的（见 liquid.js）；算不出来就退回不带折射的紫色滑块，照样能拉。
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LQ, blit, createSlider, fillMask, hintLayout, prepareGlass } from "./liquid.js";

// 脸红和白心里的小紫心是两小块透明图，叠在开屏上
// （位置是它们在原图里的像素，tools/make_dingxiang.py 打印出来的）
export const SPLASH_DX = {
  img: "./assets/splash-dingxiang.webp",
  w: 829,
  h: 1896,
  heart: { src: "./assets/dx-heart.webp", x: 331, y: 647, w: 169, h: 154 },
  blush: { src: "./assets/dx-blush.webp", x: 363, y: 1199, w: 241, h: 56 },
};

// 尺寸照她画的那张滑块
const TRACK_H = 80;
const KNOB = 68;
const PAD = 6;
const SIDE = 18;

const CSS = `
@keyframes kfsDxHint { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
.kfs-dx-hint { animation: kfsDxHint 1.4s ease-in-out infinite; }
.kfs-dx-track[data-live] .kfs-dx-hint { animation-play-state: paused; }
.kfs-dx-knob { color: #B9A2E2; transition: color .2s ease; }
.kfs-dx-knob[data-press], .kfs-dx-knob[data-done] { color: #F6F0FF; }
.kfs-dx-body { box-shadow: 0 5px 12px rgba(44,26,92,.34), 0 1px 3px rgba(44,26,92,.28); transition: box-shadow .25s ease; }
.kfs-dx-knob[data-press] .kfs-dx-body { box-shadow: 0 9px 20px rgba(44,26,92,.36), 0 2px 5px rgba(44,26,92,.24); }
.kfs-dx-knob[data-done] .kfs-dx-body { box-shadow: 0 0 14px rgba(255,255,255,.6), 0 0 30px rgba(214,190,255,.75), 0 6px 14px rgba(44,26,92,.26); }
@media (prefers-reduced-motion: reduce) { .kfs-dx-hint { animation: none; opacity: .72; } }
`;

const MASK = fillMask();

function Chev({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={LQ.hint.sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default function SplashDingxiang({ fading, onEnter }) {
  const ref = useRef(null);
  const imgRef = useRef(null);
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
  const [done, setDone] = useState(false);

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

  const b = box || { w: 390, h: 844, tx: SIDE, ty: 0, tw: 390 - SIDE * 2 };
  // 开屏图按 cover 铺满时，脸红和小紫心落在哪
  const scale = Math.max(b.w / SPLASH_DX.w, b.h / SPLASH_DX.h);
  const ox = (b.w - SPLASH_DX.w * scale) / 2;
  const oy = (b.h - SPLASH_DX.h * scale) / 2;
  const place = (p) => ({ position: "absolute", left: p.x * scale + ox, top: p.y * scale + oy, width: p.w * scale, height: p.h * scale, pointerEvents: "none" });

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
      onDone: setDone,
      reduced,
    });
    ctl.current = c;
    trackRef.current.__kfs = c; // 测试和截图从这儿摆姿势、量每帧花多久
    return () => {
      c.destroy();
      ctl.current = null;
    };
  }, [tw]);

  // 玻璃：图到了、位置量好了就算；页面大小变了重算
  const key = box ? [box.w, box.h, box.tx, box.ty, box.tw].join(",") : "";
  useEffect(() => {
    if (!box) return;
    const img = imgRef.current;
    let off = false;
    let timer = 0;
    const fail = () => {
      if (off) return;
      if (ctl.current) ctl.current.setGlass(null);
      setGlass("off");
    };
    const run = () => {
      if (off) return;
      try {
        const g = prepareGlass({
          img,
          map: { w: SPLASH_DX.w, h: SPLASH_DX.h, scale, ox, oy },
          rect: { x: box.tx, y: box.ty, w: box.tw, h: TRACK_H },
          pad: PAD,
          knob: KNOB,
          dpr: window.devicePixelRatio,
        });
        blit(trackCv.current, g.plain, g.w, g.h);
        blit(fillCv.current, g.full, g.w, g.h);
        if (ctl.current) ctl.current.setGlass(g);
        setGlass("on");
      } catch (e) {
        fail();
      }
    };
    const start = () => {
      timer = setTimeout(run, 0);
    };
    if (img.complete && img.naturalWidth) start();
    else {
      img.addEventListener("load", start);
      img.addEventListener("error", fail);
    }
    return () => {
      off = true;
      clearTimeout(timer);
      img.removeEventListener("load", start);
      img.removeEventListener("error", fail);
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

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-50 overflow-hidden"
      style={{ background: "rgb(var(--k-paper))", opacity: fading ? 0 : 1, transition: "opacity .7s ease", pointerEvents: fading ? "none" : "auto" }}
    >
      <style>{CSS}</style>
      {/* 图和两小块一起慢慢落定，不然还在缩放的时候叠上去会错位 */}
      <div className="kfs-splash-img absolute inset-0">
        <img ref={imgRef} src={SPLASH_DX.img} alt="" draggable={false} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <img
          src={SPLASH_DX.heart.src}
          alt=""
          draggable={false}
          className="kfs-dx-heart"
          style={{ ...place(SPLASH_DX.heart), opacity: done ? 1 : 0, transform: done ? "scale(1)" : "scale(.55)", transition: "opacity .25s ease, transform .4s cubic-bezier(.2,1.7,.4,1)" }}
        />
        <img
          src={SPLASH_DX.blush.src}
          alt=""
          draggable={false}
          className="kfs-dx-blush"
          style={{ ...place(SPLASH_DX.blush), opacity: done ? 1 : 0, transition: "opacity .3s ease" }}
        />
      </div>

      {/* 滑块 */}
      <div
        ref={trackRef}
        className="kfs-dx-track"
        data-glass={on ? "on" : "off"}
        style={{
          position: "absolute",
          left: SIDE,
          right: SIDE,
          bottom: "max(24px, calc(4px + var(--kfs-sab)))",
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          ...(on
            ? { boxShadow: "0 14px 30px rgba(62,42,112,0.26), 0 3px 8px rgba(52,34,100,0.16)" }
            : {
                // 不带折射的样子：她画的那个 #5D4A7A
                background: "rgba(70,50,104,0.86)",
                backdropFilter: "blur(14px) saturate(140%)",
                WebkitBackdropFilter: "blur(14px) saturate(140%)",
                boxShadow: "0 12px 30px rgba(62,42,112,0.3), inset 0 0 0 1px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.14)",
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
          style={{ position: "absolute", left: hint.left, top: 0, height: "100%", color: on ? `rgb(${LQ.hint.color.join(",")})` : "rgba(156,129,198,0.8)", pointerEvents: "none" }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="kfs-dx-hint" style={{ display: "flex", marginLeft: i ? hint.gap - hint.size : 0, animationDelay: `${i * 0.18}s` }}>
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
          aria-label="把小猪拉到最右边，进开封府"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={(e) => {
            const c = ctl.current;
            if (!c) return;
            if (e.key === "ArrowRight" || e.key === "End") c.jump(true);
            else if (e.key === "ArrowLeft" || e.key === "Home") c.jump(false);
            else if ((e.key === "Enter" || e.key === " ") && c.atEnd()) enter();
          }}
          className="kfs-dx-knob"
          style={{
            position: "absolute",
            left: PAD,
            top: PAD,
            width: KNOB,
            height: KNOB,
            padding: 0,
            border: 0,
            borderRadius: "50%",
            background: "transparent",
            touchAction: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span
            ref={bodyRef}
            className="kfs-dx-body"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: KNOB,
              height: KNOB,
              boxSizing: "border-box",
              borderRadius: "50%",
              ...(on ? {} : { background: "rgba(70,50,104,0.45)", border: "8px solid #9C81C6" }),
            }}
          />
          <canvas
            ref={lensRef}
            aria-hidden="true"
            style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: on ? "block" : "none", pointerEvents: "none" }}
          />
          <span ref={iconRef} className="flex items-center justify-center" style={{ position: "absolute", left: 0, top: 0, width: KNOB, height: KNOB, pointerEvents: "none" }}>
            <Chev size={44} />
          </span>
        </button>
      </div>
    </div>
  );
}
