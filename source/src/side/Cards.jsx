import { dayNumber, nextAnniv, dateLabel } from "../days.js";
import { SERIF, T, glass } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { useLongPress } from "../ui/press.js";

// 侧栏最上面那张卡片。flex-shrink-0 不能丢：侧栏上面那段是竖着排的弹性盒子，东西放不下的时候
// 会先压这张卡片（它带 overflow-hidden，压得动），“在一起的第几天”就只露半截、纪念日那行整行不见。
// 不许压，放不下就让那一段自己滚
export function DaysCard({ now }) {
  const n = dayNumber(now);
  const a = nextAnniv(now);
  const today = a.days === 0;
  return (
    <div
      className="kfs-days relative overflow-hidden flex-shrink-0"
      style={{ ...glass(0.5, 26), borderRadius: 28, padding: "20px 20px 18px" }}
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
            "radial-gradient(circle, rgba(255,238,200,0.95) 0%, rgba(255,238,200,0) 68%)",
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
      <div
        className="relative"
        style={{ marginTop: 12, fontSize: 12.5, color: today ? T.gold : T.inkSoft }}
      >
        {today ? `今天是我们的${a.name}纪念日` : `离${a.name}纪念日还有 ${a.days} 天`}
      </div>
    </div>
  );
}

export function Tile({ icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="kfs-tap flex flex-col justify-between text-left"
      style={{ ...glass(0.46, 22), borderRadius: 24, padding: 16, aspectRatio: "1 / 0.92" }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 38,
          height: 38,
          borderRadius: 14,
          background: "rgba(255,255,255,0.7)",
          color: T.dai,
        }}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="block min-w-0 w-full">
        <span className="block" style={{ fontSize: 15, color: T.ink }}>
          {label}
        </span>
        <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
          {sub}
        </span>
      </span>
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
      style={{ padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.65)", WebkitTouchCallout: "none" }}
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
