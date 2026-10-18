// =====================================================
// 手帐上自己画的几样：标题底下那一笔、天气的小图、印章、胶带、几样手绘的小东西。
// 都是描线或者填色的 SVG，颜色跟着风格走（currentColor）。贴纸栏里的“胶带”“印章”“手绘”三栏也用这里的。
// =====================================================

// 标题底下那一笔：一条稍微抖一下的线
export function Underline() {
  return (
    <svg className="jz-ul" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 7.5c18-2.6 37-3.4 56-2.6 21 .9 39 3.2 61 2.7 24-.6 48-3.6 79-2.1" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// 天气的小图（model.js 的 wxName 给 i：sun / partly / cloud / fog / rain / snow / storm）
export function WxIcon({ kind }) {
  const cloud = "M8.5 18.5h8.2a3.8 3.8 0 0 0 .4-7.6 5.2 5.2 0 0 0-10-1.3A4.4 4.4 0 0 0 8.5 18.5z";
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  let body;
  if (kind === "sun")
    body = (
      <>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
      </>
    );
  else if (kind === "partly")
    body = (
      <>
        <path d="M9 3.6v1.6M3.6 9h1.6M5.2 5.2l1.1 1.1M12.8 5.2l-1.1 1.1" />
        <path d="M12.3 8.4A3.6 3.6 0 0 0 6.2 10.6" />
        <path d="M9.5 19.5h8a3.6 3.6 0 0 0 .3-7.2 4.9 4.9 0 0 0-9.4-1.2 4.1 4.1 0 0 0 1.1 8.4z" />
      </>
    );
  else if (kind === "fog") body = <path d="M4 9.5h16M6 13h12M4 16.5h16M8 20h8" />;
  else if (kind === "rain")
    body = (
      <>
        <path d={cloud} transform="translate(0 -3)" />
        <path d="M9 18.6l-1 2.4M13 18.6l-1 2.4M17 18.6l-1 2.4" />
      </>
    );
  else if (kind === "snow")
    body = (
      <>
        <path d={cloud} transform="translate(0 -3)" />
        <path d="M9 19.4h.01M12.5 20.6h.01M16 19.4h.01" strokeWidth="2.4" />
      </>
    );
  else if (kind === "storm")
    body = (
      <>
        <path d={cloud} transform="translate(0 -3)" />
        <path d="M12.6 16.4l-2 3h3l-2 3" />
      </>
    );
  else body = <path d={cloud} />;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {body}
    </svg>
  );
}

// 印章：方的，朱红，最多四个字（两个字竖着一行，三四个字排成两行两列，照印章的读法从右往左）
export function Seal({ text = "开封", color = "#b3352b", round = false }) {
  const t = Array.from(String(text || "").replace(/\s/g, "")).slice(0, 4);
  const n = t.length || 1;
  // 字的位置：一个字居中；两个字上下；三四个字右列先读
  const spots =
    n === 1
      ? [[50, 50]]
      : n === 2
      ? [
          [50, 31],
          [50, 69],
        ]
      : n === 3
      ? [
          [67, 31],
          [67, 69],
          [33, 50],
        ]
      : [
          [67, 31],
          [67, 69],
          [33, 31],
          [33, 69],
        ];
  const size = n === 1 ? 56 : n === 2 ? 34 : 30;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      {round ? <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="6" /> : <rect x="4" y="4" width="92" height="92" rx="7" fill="none" stroke={color} strokeWidth="6" />}
      {t.map((ch, i) => (
        <text key={i} x={spots[i][0]} y={spots[i][1]} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight="700" fill={color} style={{ fontFamily: "'Kaiti SC','STKaiti','KaiTi','Songti SC',serif" }}>
          {ch}
        </text>
      ))}
    </svg>
  );
}

// 胶带的花色（自己调的几样）：k → CSS 的底
export const TAPES = {
  "stripe-lilac": "repeating-linear-gradient(-45deg, rgba(196,170,226,0.9) 0 1.6cqw, rgba(238,226,247,0.9) 1.6cqw 3.2cqw)",
  "stripe-mint": "repeating-linear-gradient(-45deg, rgba(150,200,182,0.9) 0 1.6cqw, rgba(226,242,235,0.9) 1.6cqw 3.2cqw)",
  "dot-pink": "radial-gradient(rgba(214,120,150,0.9) 0.7cqw, transparent 0.8cqw) 0 0/3cqw 3cqw, rgba(250,224,232,0.92)",
  "dot-blue": "radial-gradient(rgba(96,132,190,0.9) 0.7cqw, transparent 0.8cqw) 0 0/3cqw 3cqw, rgba(222,232,247,0.92)",
  grid: "linear-gradient(rgba(120,110,95,0.35) 1px, transparent 1px) 0 0/2.4cqw 2.4cqw, linear-gradient(90deg, rgba(120,110,95,0.35) 1px, transparent 1px) 0 0/2.4cqw 2.4cqw, rgba(246,240,226,0.92)",
  kraft: "rgba(196,160,112,0.85)",
  gold: "linear-gradient(100deg, rgba(214,181,110,0.95), rgba(244,226,170,0.95) 45%, rgba(200,160,90,0.95))",
  plain: "rgba(255,255,255,0.7)",
};
export const TAPE_NAMES = { "stripe-lilac": "紫斜纹", "stripe-mint": "青斜纹", "dot-pink": "粉点", "dot-blue": "蓝点", grid: "格子", kraft: "牛皮", gold: "金箔", plain: "白" };

// 手绘的小东西（描线，跟着字的颜色走）
export const DOODLES = {
  heart: { t: "画的心", d: "M12 20s-7.5-4.6-7.5-10.1A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3C19.5 15.4 12 20 12 20z" },
  star: { t: "画的星", d: "M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.8L8 13.6l-4.3-4 5.8-.7z" },
  sparkle: { t: "闪光线", d: "M12 3v5M12 16v5M3 12h5M16 12h5M6.5 6.5l2.6 2.6M14.9 14.9l2.6 2.6M6.5 17.5l2.6-2.6M14.9 9.1l2.6-2.6" },
  arrow: { t: "箭头", d: "M4 16c4-6 9-8.5 15-8M15.2 4.6 19.2 8l-3.4 4" },
  circle: { t: "圈", d: "M19.4 9.2c1.4 4.6-2.2 9.4-7.6 9.6-5 .2-8.2-3.3-7.7-7.4.6-4.5 5.3-7.8 10.1-7 2.4.4 4.6 1.7 5.6 3.4" },
  squiggle: { t: "波浪线", d: "M3 13c2-3.4 3.6-3.4 5.2 0s3.4 3.4 5.2 0 3.4-3.4 5.2 0 1.6 2 2.4 1.2" },
  cloud: { t: "画的云", d: "M8.5 18.5h8.2a3.8 3.8 0 0 0 .4-7.6 5.2 5.2 0 0 0-10-1.3A4.4 4.4 0 0 0 8.5 18.5z" },
  flower: { t: "画的花", d: "M12 12m-2.2 0a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0M12 9.8c-1.2-3.2.4-5.6 0-6.2-.4.6 1.2 3 0 6.2M14.2 12c3.2-1.2 5.6.4 6.2 0-.6-.4-3 1.2-6.2 0M12 14.2c1.2 3.2-.4 5.6 0 6.2.4-.6-1.2-3 0-6.2M9.8 12c-3.2 1.2-5.6-.4-6.2 0 .6.4 3-1.2 6.2 0" },
  moon: { t: "画的月", d: "M19 14.6A7.5 7.5 0 0 1 9.4 5a7.5 7.5 0 1 0 9.6 9.6z" },
  check: { t: "勾", d: "M4.5 12.5l4.5 4.5L19.5 6.5" },
};
export function Doodle({ k }) {
  const d = DOODLES[k];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d.d} />
    </svg>
  );
}

// 颜文字（贴纸栏“颜文字”那一栏）
export const KAOMOJI = ["(｡•ᴗ•｡)", "(｀・ω・´)", "(⁄ ⁄•⁄ω⁄•⁄ ⁄)", "( ˘ ³˘)♥", "ヾ(≧▽≦*)o", "(っ˘ω˘ς )", "(╥﹏╥)", "( ´▽` )ﾉ", "(๑•̀ㅂ•́)و✧", "(=^･ω･^=)", "ʕ•ᴥ•ʔ", "(・∀・)", "( ˙-˙ )", "(｡>﹏<｡)", "o(^▽^)o", "(￣▽￣)ノ", "(*/ω＼*)", "⌯ᵔ⤙ᵔ⌯", "ᯇᴗᯇ", "(¦3[▓▓]"];
