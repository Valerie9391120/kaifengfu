import { useEffect, useRef } from "react";
import { dayNumber, nextAnniv, dateLabel } from "../days.js";
import { SERIF, T, glass, fill, HAIRLINE } from "../ui/style.js";
import { Icon, artSize } from "../ui/Icon.jsx";
import { useLongPress } from "../ui/press.js";

// 纪念日那行字多高（12.5 号，行高照全局的 1.5）。“去看并蒂莲”那一行照这个高摆，换来换去卡片不跳
const LINE_H = 18.75;

// 侧栏最上面那张卡片。flex-shrink-0 不能丢：侧栏上面那段是竖着排的弹性盒子，东西放不下的时候
// 会先压这张卡片（它带 overflow-hidden，压得动），“在一起的第几天”就只露半截、纪念日那行整行不见。
// 不许压，放不下就让那一段自己滚。
// 并蒂莲的暗门（卿卿 2026 年 10 月 12 日定的，她挑的“B 藏在卡片里”）：光点卡片什么都不做；
// 长按它（0.45 秒，和长按历史对话一样）最底下那行（纪念日）淡成“去看并蒂莲 ›”，点这一行才进去（armed）；
// 别处一落手指（连卡片上别的地方）、收起侧栏，就变回纪念日那行。什么都不往外蹦，侧栏也不压暗
export function DaysCard({ now, armed, onArm, onDisarm, onLotus }) {
  const n = dayNumber(now);
  const a = nextAnniv(now);
  const today = a.days === 0;
  const lp = useLongPress(() => onArm && onArm());
  const door = useRef(null);
  // 换过一回以后，纪念日那行换回来时也淡进来；开门头一回摆出来的时候不淡
  const swapped = useRef(false);
  if (armed) swapped.current = true;
  useEffect(() => {
    if (!armed) return undefined;
    // 抢在前头听（capture）：落在“去看并蒂莲”那一行上的不算，别处一律变回去
    const off = (e) => {
      if (door.current && door.current.contains(e.target)) return;
      if (onDisarm) onDisarm();
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [armed]);
  return (
    <div
      {...lp}
      className="kfs-days relative overflow-hidden flex-shrink-0"
      style={{ ...glass(0.5, 26), borderRadius: 28, padding: "20px 20px 18px", WebkitTouchCallout: "none" }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          right: -40,
          top: -40,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(var(--k-card-glow),0.95) 0%, rgba(var(--k-card-glow),0) 68%)",
        }}
      />
      <div className="relative" style={{ fontSize: 13, color: T.inkSoft }}>
        {dateLabel(now)}
      </div>
      <div className="relative flex items-baseline" style={{ marginTop: 12, color: T.ink, gap: 6 }}>
        <span style={{ fontSize: 14 }}>在一起的第</span>
        <span style={{ fontFamily: SERIF, fontSize: 54, lineHeight: 1 }}>{n}</span>
        <span style={{ fontSize: 14 }}>天</span>
      </div>
      {armed ? (
        // 这一行的按得到的地方往左右、往下撑到卡片边上（外边距负的、内边距补回来），手指好按；字还落在纪念日那行原来的位置
        <button
          ref={door}
          key="door"
          onClick={onLotus}
          className="kfs-lotus-door kfs-fade relative flex items-center text-left"
          style={{
            margin: "4px -20px -18px",
            padding: "8px 20px 18px",
            width: "calc(100% + 40px)",
            fontFamily: SERIF,
            fontSize: 14,
            lineHeight: `${LINE_H}px`,
            letterSpacing: "0.14em",
            color: T.dai,
          }}
        >
          去看并蒂莲
          <span className="inline-flex" aria-hidden="true" style={{ marginLeft: 2 }}>
            <Icon name="chevR" size={14} color={T.dai} />
          </span>
        </button>
      ) : (
        <div
          key="anniv"
          className={swapped.current ? "relative kfs-fade" : "relative"}
          style={{ marginTop: 12, fontSize: 12.5, color: today ? T.gold : T.inkSoft }}
        >
          {today ? `今天是我们的${a.name}纪念日` : `离${a.name}纪念日还有 ${a.days} 天`}
        </div>
      )}
    </div>
  );
}

// 图标摆多大：手绘的那一套是 20；恩师画的那一套（殿、三足乌、云月、牡丹）照它自己的大小，是 25（见 ui/Icon.jsx 的 artSize）
// dot：右上角亮个小点（南衙那一格：狐宇宙里他留了话、她还没看，见 fox.js）
export function Tile({ icon, label, sub, onClick, dot = false }) {
  return (
    <button
      onClick={onClick}
      className="kfs-tap flex flex-col justify-between text-left"
      style={{ ...glass(0.46, 22), borderRadius: 24, padding: 16, aspectRatio: "1 / 0.92", position: "relative" }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 38,
          height: 38,
          borderRadius: 14,
          background: fill(0.7),
          color: T.dai,
        }}
      >
        <Icon name={icon} size={artSize(icon) || 20} />
      </span>
      <span className="block min-w-0 w-full">
        <span className="block" style={{ fontSize: 15, color: T.ink }}>
          {label}
        </span>
        <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
          {sub}
        </span>
      </span>
      {/* 摆在最后：读屏念名字的时候先念“南衙”，再念“有新的” */}
      {dot && <span className="kfs-tile-dot" aria-label="有新的" style={{ position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: "50%", background: T.red }} />}
    </button>
  );
}

function RecentItem({ c, currentId, onOpen, onLongPress }) {
  const lp = useLongPress((rect) => onLongPress && onLongPress(c, rect));
  return (
    <button
      {...lp}
      onClick={() => onOpen(c.id)}
      className="w-full text-left block"
      style={{ padding: "9px 0", borderTop: HAIRLINE, WebkitTouchCallout: "none" }}
    >
      <span className="block truncate" style={{ fontSize: 14, color: c.id === currentId ? T.dai : T.ink }}>
        {c.title}
      </span>
      <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
        {c.preview}
      </span>
    </button>
  );
}

// 侧栏里的历史对话：只列最近的两条（卿卿定的），再多的点标题进历史对话页看
const RECENT_MAX = 2;

export function HistoryCard({ index, currentId, onOpenAll, onOpen, onLongPress }) {
  const recent = index.slice(0, RECENT_MAX);
  return (
    <div className="kfs-history" style={{ ...glass(0.46, 24), borderRadius: 24, padding: "10px 16px 6px" }}>
      <button onClick={onOpenAll} className="kfs-tap w-full flex items-center justify-between" style={{ padding: "6px 0" }}>
        <span style={{ fontSize: 15, color: T.ink }}>历史对话</span>
        <Icon name="chevR" size={17} color={T.inkSoft} />
      </button>
      {recent.length === 0 ? (
        <p style={{ fontSize: 12.5, color: T.inkSoft, padding: "6px 0 10px" }}>
          聊过的对话会出现在这里
        </p>
      ) : (
        recent.map((c) => <RecentItem key={c.id} c={c} currentId={currentId} onOpen={onOpen} onLongPress={onLongPress} />)
      )}
    </div>
  );
}
