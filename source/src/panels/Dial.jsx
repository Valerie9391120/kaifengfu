import { useId } from "react";
import { DIAL_GLYPHS as G } from "./dialGlyphs.js";

// 闲笔集月历右上角那块日晷（见 DiaryPage.jsx、开发说明“闲笔集换成日晷”那一节）。只管画，不管手指：
// 盘面怎么转是 diaryDeck.js 一帧一帧算好、DiaryPage.jsx 照着把 disk 那一层转过去的；月相那十二颗跟着反着转，一直正着。
// 坐标：圆心在原点，最外那道圈半径 100；角度从正上方起、顺时针。地支摆在“几乘 30 度”上（子在 0 度），指针固定指 NEEDLE。
//
// 从外往里：二十四节气 → 地支一字一个小圆章 → 月相（那个月写了日记的天数占几成，月亮就有多圆）→ 月份的小字 → 刻度 → 宝相花。
// 字都是刻本体（齊伋體，dialGlyphs.js），朝着圆心排。

export const NEEDLE = 232;
// 月建：正月建寅，十一月是子月
export const branchOf = (m) => (m + 2) % 12;
const BR = "子丑寅卯辰巳午未申酉戌亥";
const CN = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
const JQ = ["大雪冬至", "小寒大寒", "立春雨水", "惊蛰春分", "清明谷雨", "立夏小满", "芒种夏至", "小暑大暑", "立秋处暑", "白露秋分", "寒露霜降", "立冬小雪"];

export function polar(r, deg) {
  const t = (deg * Math.PI) / 180;
  return [r * Math.sin(t), -r * Math.cos(t)];
}
const P = (r, a) => polar(r, a).map((v) => v.toFixed(2)).join(" ");
const L = (a) => `rgba(var(--k-ink),${a})`;
const D = (a) => `rgba(var(--k-dai),${a})`;

export function sector(r1, r2, a1, a2) {
  if (a2 - a1 >= 359.9) return `M0 ${-r2}A${r2} ${r2} 0 1 1 0 ${r2}A${r2} ${r2} 0 1 1 0 ${-r2}ZM0 ${-r1}A${r1} ${r1} 0 1 0 0 ${r1}A${r1} ${r1} 0 1 0 0 ${-r1}Z`;
  const lg = a2 - a1 > 180 ? 1 : 0;
  return `M${P(r2, a1)}A${r2} ${r2} 0 ${lg} 1 ${P(r2, a2)}L${P(r1, a2)}A${r1} ${r1} 0 ${lg} 0 ${P(r1, a1)}Z`;
}
// 月亮：f 是圆了几成（0 新月，1 满月），亮的一边在右
export function moonPath(f, r) {
  if (!(f > 0.02)) return "";
  if (f >= 0.98) return `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;
  const rx = (r * Math.abs(1 - 2 * f)).toFixed(2);
  return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${f < 0.5 ? 0 : 1} 0 ${-r}Z`;
}

// ---- 宝相花（她找来的纹样，照它的结构画的）：外头两道八瓣的轮廓，一圈实的花瓣带卷草，里头八瓣小花，花心一颗圆 ----
function lobes(R, V) {
  let d = "";
  for (let k = 0; k < 8; k++) {
    const t = k * 45;
    if (!k) d += "M" + P(V, t - 22.5);
    d += "C" + P(R * 0.97, t - 15) + " " + P(R * 0.9, t - 5) + " " + P(R, t) + "C" + P(R * 0.9, t + 5) + " " + P(R * 0.97, t + 15) + " " + P(V, t + 22.5);
  }
  return d + "Z";
}
function curl(cx, cy, dir) {
  let d = "";
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * 1.6 * Math.PI * 2;
    const r = 0.6 + t * 0.62;
    d += (i ? "L" : "M") + (cx + dir * r * Math.cos(t + Math.PI)).toFixed(2) + " " + (cy + r * Math.sin(t + Math.PI)).toFixed(2);
  }
  return d;
}
const LOBE_OUT = lobes(100, 80);
const LOBE_MID = lobes(92, 73.5);
const LOBE_BAND = lobes(84, 66);
const CURL_L = curl(-8, -57, 1);
const CURL_R = curl(8, -57, -1);
const SCALLOP = (() => {
  let d = "";
  for (let k = 0; k < 8; k++) {
    if (!k) d += "M" + P(27.72, k * 45 - 22.5);
    d += "A11.7 11.7 0 1 1 " + P(27.72, k * 45 + 22.5);
  }
  return d + "Z";
})();

function Flower({ id }) {
  const st = (a) => ({ fill: "none", stroke: D(a), strokeWidth: 1 });
  return (
    <g transform="scale(.34)">
      <path d={LOBE_OUT} {...st(0.6)} />
      <path d={LOBE_MID} {...st(0.45)} />
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="-110" y="-110" width="220" height="220">
          <path d={LOBE_BAND} fill="#fff" />
          <circle r="49" fill="#000" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
            <g key={k} transform={`rotate(${k * 45 + 22.5})`} fill="none" stroke="#000">
              <line x1="0" y1="-58" x2="0" y2="-90" strokeWidth="3.2" />
              <path d={CURL_L} strokeWidth="2.6" strokeLinecap="round" />
              <path d={CURL_R} strokeWidth="2.6" strokeLinecap="round" />
              <path d="M0 -48 Q-3 -55 -8 -57 M0 -48 Q3 -55 8 -57" strokeWidth="2.4" />
            </g>
          ))}
        </mask>
      </defs>
      <path d={LOBE_BAND} fill={D(0.3)} mask={`url(#${id})`} />
      <path d={SCALLOP} {...st(0.6)} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
        const [x, y] = polar(30, k * 45);
        return <circle key={k} cx={x.toFixed(2)} cy={y.toFixed(2)} r="7.4" {...st(0.5)} />;
      })}
      <circle r="19" {...st(0.6)} />
      <circle r="16.5" {...st(0.3)} />
      <circle r="13" fill={D(0.32)} />
    </g>
  );
}

function Word({ txt, adv, sc }) {
  const cs = [...txt];
  return cs.map((c, k) => (
    <g key={k} transform={`translate(${((k - (cs.length - 1) / 2) * adv).toFixed(2)} 0) scale(${sc})`}>
      <path d={G[c]} />
    </g>
  ));
}

const ring = (r, a, dash) => <circle r={r} fill="none" stroke={L(a)} strokeWidth="1" strokeDasharray={dash} />;
const ARR12 = [...Array(12).keys()];

// 不随眼前哪个月变的那些线：一份就够
const STATIC = (
  <>
    {ring(109, 0.12)}
    {ring(100, 0.5)}
    {ring(97, 0.2)}
    {[...Array(24).keys()].map((k) => {
      const [x, y] = polar(104.6, k * 15);
      return <circle key={"j" + k} cx={x.toFixed(2)} cy={y.toFixed(2)} r=".6" fill={L(0.3)} />;
    })}
    {ring(75, 0.42)}
    {ring(73, 0.16)}
    {ARR12.map((k) => {
      const [a1, b1] = polar(75, 15 + 30 * k);
      const [a2, b2] = polar(97, 15 + 30 * k);
      return <line key={"v" + k} x1={a1.toFixed(2)} y1={b1.toFixed(2)} x2={a2.toFixed(2)} y2={b2.toFixed(2)} stroke={L(0.28)} strokeWidth="1" />;
    })}
    {ring(71, 0.18)}
    {ring(62, 0.18)}
    {ARR12.map((k) => (
      <g key={"m" + k}>
        {[0, -7, 7].map((d) => {
          const [x, y] = polar(66.5, 15 + 30 * k + d);
          return <circle key={d} cx={x.toFixed(2)} cy={y.toFixed(2)} r={d ? 0.45 : 0.9} fill={L(d ? 0.22 : 0.35)} />;
        })}
      </g>
    ))}
    {ring(51.5, 0.28)}
    {ring(46, 0.12)}
    {[...Array(96).keys()].map((k) => {
      const big = k % 8 === 0;
      const mid = k % 4 === 0;
      const [a1, b1] = polar(big ? 46 : mid ? 48.5 : 49.8, k * 3.75);
      const [a2, b2] = polar(51.5, k * 3.75);
      return <line key={"t" + k} x1={a1.toFixed(2)} y1={b1.toFixed(2)} x2={a2.toFixed(2)} y2={b2.toFixed(2)} stroke={L(big ? 0.5 : mid ? 0.32 : 0.2)} strokeWidth="1" />;
    })}
    {ring(37, 0.13, "1 3")}
  </>
);

// cur：眼前那个月是哪个地支；inRange：月历里有的那几个地支；fracs[地支]：那个月的月亮圆了几成（没有那个月是 null）；
// past：[从几度, 到几度]，走过的那几个月照亮的那一段（盘面上的角度）；diskRef、moonRefs 给 DiaryPage 一帧一帧转
export function Dial({ cur, inRange, fracs, past, diskRef, moonRefs }) {
  const id = "kfs-bxh" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <>
      <g ref={diskRef}>
        <path d={sector(37.5, 46, past[0], past[1])} fill={D(0.07)} fillRule="evenodd" />
        <path d={sector(75, 97, -15, 15)} transform={`rotate(${cur * 30})`} fill={D(0.09)} />
        {STATIC}
        <Flower id={id} />
        {ARR12.map((b) => {
          const on = b === cur;
          const inr = inRange.has(b);
          const [mx, my] = polar(86, b * 30);
          const m = (b + 10) % 12;
          return (
            <g key={b} className="kfs-dial-b" data-b={b} data-on={on ? "1" : "0"}>
              <circle cx={mx.toFixed(2)} cy={my.toFixed(2)} r="10.4" fill="none" stroke={D(0.55)} strokeWidth="1" opacity={on ? 1 : 0} />
              <circle cx={mx.toFixed(2)} cy={my.toFixed(2)} r="8.3" fill={on ? D(0.14) : "none"} stroke={on ? D(0.8) : L(inr ? 0.32 : 0.16)} strokeWidth="1" />
              <g transform={`rotate(${b * 30}) translate(0 -86) scale(.0118)`} fill={on ? "rgb(var(--k-dai))" : L(inr ? 0.85 : 0.26)}>
                <path d={G[BR[b]]} />
              </g>
              <g transform={`rotate(${b * 30}) translate(0 -56.5)`} fill={on ? D(0.9) : `rgba(var(--k-soft),${inr ? 0.55 : 0.2})`}>
                <Word txt={CN[m] + "月"} adv={6.6} sc={0.0066} />
              </g>
              {[0, 1].map((h) => (
                <g key={h} transform={`rotate(${b * 30 + (h ? 7.5 : -7.5)}) translate(0 -104.6)`} fill={on ? D(0.85) : L(inr ? 0.42 : 0.2)}>
                  <Word txt={JQ[b].slice(h * 2, h * 2 + 2)} adv={4.7} sc={0.0042} />
                </g>
              ))}
              <g ref={(el) => (moonRefs.current[b] = el)} className="kfs-dial-moon" data-f={fracs[b] == null ? "" : fracs[b].toFixed(2)} opacity={inr ? 1 : 0.45}>
                <circle r="4.9" fill="none" stroke={L(0.22)} strokeWidth="1" />
                <circle r="3.6" fill={L(0.1)} stroke={L(0.3)} strokeWidth="1" />
                <path d={fracs[b] == null ? "" : moonPath(fracs[b], 3.6)} fill="rgb(var(--k-moon))" />
              </g>
            </g>
          );
        })}
      </g>
      <g transform={`rotate(${NEEDLE})`}>
        <path d={`M0 0 L${P(52, -8)} A52 52 0 0 1 ${P(52, 8)} Z`} fill={D(0.08)} />
        <polygon points="0,-52 2.2,0 0,7 -2.2,0" fill="rgb(var(--k-dai))" />
        <circle cy="9" r="1.6" fill="none" stroke="rgb(var(--k-dai))" strokeWidth="1" />
      </g>
      <circle r="2.4" fill="rgb(var(--k-dai))" />
    </>
  );
}
