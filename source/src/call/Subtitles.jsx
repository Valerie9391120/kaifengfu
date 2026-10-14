import { useLayoutEffect, useRef, useState } from "react";
import { SANS } from "../ui/style.js";
import { unitsOf, subFade, subGap, SUB_COLOR, SUB_OLD } from "./subs.js";

// =====================================================
//   通话页的字幕区（卿卿 2026 年 10 月 14 日定的，见开发说明“通话”那一节的“字幕”；字幕的账在 subs.js）。
//   没有框、没有底，字直接浮在黑底上；两个人只拿字的颜色分（她的浅灰、他的暖白），字号、字体一样，居中（她 12:08 改的，原来靠左）。
//   一个人一段：连着说接在这一段后面；换人了另起一行，新的一段从下面跳出来（12:08 改的：两个人的都留着）。
//   从顶上开始出，往下长；满了平滑地往上滚，顶上那截慢慢淡没；眼下在说的这一段里最新的那截最亮，越往前越淡，前面几段都淡。
//   她往回翻了（手指往下拉）就不拽她回去；拉回最底下又接着跟。
// =====================================================

// 往上滚过了：顶上那一截慢慢淡没，不是一刀切
const MASK = "linear-gradient(to bottom, transparent 0, #000 30px)";

export function Subtitles({ subs }) {
  const box = useRef(null);
  const follow = useRef(true); // 跟着最新的（她没往回翻）
  const aim = useRef(null); // 自己正往这儿滚（滚的半路上报的位置不算她翻的）
  const [scrolled, setScrolled] = useState(false);
  const turns = subs.turns;
  const lastTurn = turns.length ? turns[turns.length - 1] : null;
  const lastUnits = lastTurn ? unitsOf(lastTurn) : [];
  const tail = lastUnits.length ? lastUnits[lastUnits.length - 1] : "";
  // 多了一段、多了一截、最后那截变了：跟到最底下
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !follow.current) return;
    const top = el.scrollHeight - el.clientHeight;
    if (top <= el.scrollTop + 1) return;
    const calm = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    aim.current = top;
    try {
      el.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
    } catch (e) {
      el.scrollTop = top;
    }
  }, [lastTurn ? lastTurn.id : 0, lastUnits.length, tail]);
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
    <div className="kfs-call-subs absolute inset-0" data-who={lastTurn ? lastTurn.who : ""}>
      <div
        ref={box}
        onScroll={onScroll}
        onTouchStart={hand}
        onWheel={hand}
        className="kfs-sub-scroll kfs-scroll"
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitMaskImage: scrolled ? MASK : "none",
          maskImage: scrolled ? MASK : "none",
        }}
      >
        {turns.map((turn, ti) => {
          const units = unitsOf(turn);
          const newest = ti === turns.length - 1;
          return (
            <p
              key={turn.id}
              className="kfs-sub-turn kfs-sub-pop"
              data-who={turn.who}
              style={{
                margin: ti ? "12px 0 0" : 0,
                fontFamily: SANS,
                fontSize: 17,
                lineHeight: 1.65,
                letterSpacing: "0.02em",
                color: SUB_COLOR[turn.who] || SUB_COLOR.him,
                textAlign: "center",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {units.map((u, i) => (
                <span
                  key={i}
                  className={`kfs-sub-unit${newest && i === units.length - 1 && i > 0 ? " kfs-sub-new" : ""}`}
                  // 多亮：眼下在说的这一段，最新那截照常、往前一截一截淡；前面的几段（换过人了）都算旧的
                  style={{ opacity: subFade(newest ? units.length - 1 - i : SUB_OLD), transition: "opacity .45s ease" }}
                >
                  {(i ? subGap(units[i - 1]) : "") + u}
                </span>
              ))}
            </p>
          );
        })}
      </div>
    </div>
  );
}
