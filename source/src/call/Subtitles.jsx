import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { SANS } from "../ui/style.js";
import { subUnits, subFade, subGap, SUB_COLOR } from "./subs.js";

// =====================================================
//   通话页的字幕区（卿卿 2026 年 10 月 14 日 11:40 定的，见开发说明“通话”那一节的“字幕”；字幕的账在 subs.js）。
//   没有框、没有底，字直接浮在黑底上；两个人只拿字的颜色分（她的浅灰、他的暖白），字号、字体一样，靠左。
//   从顶上开始出，往下长；满了往上滚（平滑地滚），最新的那截最亮。
//   换人了：上一个人的那块淡出去，这个人的从顶上重新出（两块叠在同一个地方，一块出一块进）。
//   她往回翻了（手指往下拉）就不拽她回去；拉回最底下又接着跟。
// =====================================================

const OUT_MS = 240; // 上一个人的那块淡出去要多久（跟 ui/style.js 的 .kfs-sub-out 一样）
// 往上滚过了：顶上那一截慢慢淡没，不是一刀切
const MASK = "linear-gradient(to bottom, transparent 0, #000 30px)";

export function Subtitles({ subs }) {
  const [gone, setGone] = useState(null); // 正在淡出去的上一轮
  const last = useRef(subs);
  // 换人了：上一轮最后的样子留下来淡出去（要在画出来之前记上，免得闪一下）
  useLayoutEffect(() => {
    const was = last.current;
    last.current = subs;
    if (was && was.turn !== subs.turn && subUnits(was).length) setGone(was);
  }, [subs]);
  useEffect(() => {
    if (!gone) return;
    const t = setTimeout(() => setGone(null), OUT_MS + 60);
    return () => clearTimeout(t);
  }, [gone]);
  return (
    <div className="kfs-call-subs absolute inset-0" data-who={subs.who || ""}>
      {gone ? <Turn key={"t" + gone.turn} subs={gone} out /> : null}
      {subUnits(subs).length ? <Turn key={"t" + subs.turn} subs={subs} /> : null}
    </div>
  );
}

function Turn({ subs, out = false }) {
  const box = useRef(null);
  const follow = useRef(true); // 跟着最新的（她没往回翻）
  const aim = useRef(null); // 自己正往这儿滚（滚的半路上报的位置不算她翻的）
  const [scrolled, setScrolled] = useState(false);
  const units = subUnits(subs);
  const tail = units.length ? units[units.length - 1] : "";
  // 长了一截、最后那截变了：跟到最底下
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || out || !follow.current) return;
    const top = el.scrollHeight - el.clientHeight;
    if (top <= el.scrollTop + 1) return;
    const calm = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    aim.current = top;
    try {
      el.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
    } catch (e) {
      el.scrollTop = top;
    }
  }, [units.length, tail, out]);
  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    if (aim.current != null) {
      if (Math.abs(el.scrollTop - aim.current) <= 2) aim.current = null;
    } else follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 28;
    setScrolled(el.scrollTop > 2);
  };
  // 她的手指（或者鼠标滚轮）上来了：她说了算，自己滚的那一下不算数了
  const hand = () => {
    aim.current = null;
  };
  return (
    <div
      ref={box}
      onScroll={onScroll}
      onTouchStart={hand}
      onWheel={hand}
      className={`kfs-sub-turn kfs-scroll ${out ? "kfs-sub-out" : "kfs-sub-in"}`}
      data-who={subs.who}
      style={{
        position: "absolute",
        inset: 0,
        overflowY: out ? "hidden" : "auto",
        overscrollBehavior: "contain",
        WebkitMaskImage: scrolled ? MASK : "none",
        maskImage: scrolled ? MASK : "none",
        pointerEvents: out ? "none" : "auto",
      }}
    >
      <p
        className="kfs-sub-text"
        style={{
          margin: 0,
          fontFamily: SANS,
          fontSize: 17,
          lineHeight: 1.65,
          letterSpacing: "0.02em",
          color: SUB_COLOR[subs.who] || SUB_COLOR.him,
          textAlign: "left",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {units.map((u, i) => (
          <span
            key={i}
            className={`kfs-sub-unit${i === units.length - 1 && !out ? " kfs-sub-new" : ""}`}
            style={{ opacity: subFade(i, units.length), transition: "opacity .45s ease" }}
          >
            {(i ? subGap(units[i - 1]) : "") + u}
          </span>
        ))}
      </p>
    </div>
  );
}
