import { useState, useEffect, useRef } from "react";
import SplashDingxiang from "./SplashDingxiang.jsx";
import { SERIF, T } from "./ui/style.js";
import { Glows } from "./ui/parts.jsx";

// 开屏：卿卿找的素材，金箔月亮、沙燕风筝、缠枝牡丹（构建时注入）
const SPLASH_IMG = "./assets/splash.webp";
const KITE_IMG = "./assets/kite.webp";

const SPLASH = {
  w: 863,
  h: 1822,
  cx: 430,
  cy: 643,
  r: 250,
  paper: "rgb(var(--k-paper))",
  kite: { x: 298, y: 978, w: 266, h: 254 },
};
// 丁香的开屏在 SplashDingxiang.jsx：卿卿画的戴长翅帽的小猪，底下一条液态玻璃的滑块

function Moon({ size = 84, breath = false }) {
  return (
    <div
      className={breath ? "kfs-breath" : ""}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 36% 34%, #F6E7BC 0%, #E2C47F 48%, #C8A35A 100%)",
        boxShadow: `0 0 ${size * 0.5}px ${size * 0.14}px rgba(255,236,190,0.7), 0 0 ${
          size * 1.1
        }px ${size * 0.35}px rgba(250,228,180,0.35), inset -${size * 0.1}px -${
          size * 0.08
        }px ${size * 0.22}px rgba(150,118,60,0.35)`,
      }}
    />
  );
}

function Splash({ fading, onEnter }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 390, h: 844 });
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (ref.current) setBox({ w: ref.current.offsetWidth, h: ref.current.offsetHeight });
  }, []);
  const hasArt = !!SPLASH_IMG;
  // 图按cover铺满屏幕时，月亮和燕子落在哪
  const scale = Math.max(box.w / SPLASH.w, box.h / SPLASH.h);
  const ox = (box.w - SPLASH.w * scale) / 2;
  const oy = (box.h - SPLASH.h * scale) / 2;
  const mx = SPLASH.cx * scale + ox;
  const my = SPLASH.cy * scale + oy;
  const mr = SPLASH.r * scale;
  const k = SPLASH.kite;
  const kx = k.x * scale + ox;
  const ky = k.y * scale + oy;
  const kw = k.w * scale;
  const kh = k.h * scale;

  // 戳燕子：它先往月亮那边飞，门再开
  const tapKite = (e) => {
    e.stopPropagation();
    if (leaving) return;
    setLeaving(true);
    setTimeout(onEnter, 450);
  };

  return (
    <div
      ref={ref}
      onClick={hasArt ? undefined : onEnter}
      className="absolute inset-0 z-50 overflow-hidden"
      style={{
        background: hasArt ? SPLASH.paper : T.bg,
        opacity: fading ? 0 : 1,
        transition: "opacity .7s ease",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      {hasArt ? (
        <>
          <img
            src={SPLASH_IMG}
            alt=""
            draggable={false}
            className="kfs-splash-img"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            className="kfs-moonglow"
            style={{
              position: "absolute",
              left: mx - mr * 1.6,
              top: my - mr * 1.6,
              width: mr * 3.2,
              height: mr * 3.2,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,240,205,0.3) 0%, rgba(255,240,205,0.26) 50%, rgba(255,236,190,0.16) 64%, rgba(255,236,190,0) 100%)",
              mixBlendMode: "screen",
              pointerEvents: "none",
            }}
          />
          {KITE_IMG && (
            <button
              onClick={tapKite}
              aria-label="戳一下燕子，进开封府"
              style={{
                position: "absolute",
                left: kx - 18,
                top: ky - 18,
                width: kw + 36,
                height: kh + 36,
                padding: 18,
                background: "transparent",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <img
                src={KITE_IMG}
                alt=""
                draggable={false}
                className={leaving ? "kfs-kite-away" : "kfs-kite"}
                style={{ display: "block", width: kw, height: kh }}
              />
            </button>
          )}
        </>
      ) : (
        <>
          <Glows />
          <div className="relative h-full flex flex-col items-center justify-center">
            <Moon size={104} breath />
            <div style={{ fontFamily: SERIF, fontSize: 34, letterSpacing: "0.32em", paddingLeft: "0.32em", color: T.ink, marginTop: 46 }}>
              开封府
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function SplashByTheme({ theme, fading, onEnter }) {
  return theme === "dingxiang" ? <SplashDingxiang fading={fading} onEnter={onEnter} /> : <Splash fading={fading} onEnter={onEnter} />;
}
