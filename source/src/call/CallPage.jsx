import { useEffect, useState } from "react";
import { SERIF } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { callClock } from "./marks.js";
import { Subtitles } from "./Subtitles.jsx";

// =====================================================
//   通话页（卿卿 2026 年 10 月 14 日定的，见开发说明“通话”那一节）。
//   全屏，先用纯黑的底（她说以后做一张合适的图给我，现在统一用黑的）；他的头像在中间，
//   他说话的时候一亮一亮，他在想的时候慢慢呼吸；上面一行写在干什么和通话多久；
//   头像和名字底下是两个人共用的字幕（她 11:40 定的，见 Subtitles.jsx）；底下两个键：静音、挂断。
//   phase：
//     ring      刚点下去，还没开始听
//     listening 在听她说
//     thinking  她说完了，等他回
//     speaking  他在说
//     muted     静音（不听她说）
//     tap       iPhone 不让自己接着听：点一下屏幕再说
// =====================================================
const STATUS = {
  ring: "接通中…",
  listening: "在听你说",
  thinking: "他在想…",
  speaking: "他在说",
  muted: "静音中",
  tap: "点一下屏幕，接着说",
};

export function CallPage({ call, avatar, name, onMute, onHangUp, onTap }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const phase = call.phase;
  const secs = (Date.now() - call.start) / 1000;
  const muted = !!call.muted;
  const ring = phase === "speaking" ? "kfs-call-talk" : phase === "thinking" ? "kfs-call-think" : "";
  return (
    <div
      className="kfs-call absolute inset-0 flex flex-col items-center"
      role="dialog"
      aria-label="通话中"
      data-phase={phase}
      onClick={phase === "tap" ? onTap : undefined}
      style={{
        zIndex: 70,
        background: "#000",
        color: "rgba(255,255,255,0.92)",
        paddingTop: "calc(env(safe-area-inset-top) + 44px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 40px)",
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      <div className="kfs-call-status text-center" style={{ fontSize: 14, letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)", position: "relative" }}>
        <span>{STATUS[phase] || ""}</span>
        <span style={{ margin: "0 8px", opacity: 0.5 }}>·</span>
        <span className="kfs-call-clock" style={{ fontVariantNumeric: "tabular-nums" }}>
          {callClock(secs)}
        </span>
      </div>

      {/* 中间这一块从上往下：头像、名字、字幕。多出来的地方上面分一份、底下分两份（字幕和按钮之间要空得多一些，她定的）；
          屏幕矮的手机上先让字幕区变矮（最矮 110），再让顶上那点空变小 */}
      <div className="flex-1 flex flex-col items-center w-full" style={{ minHeight: 0 }}>
        <div style={{ flex: "1 1 24px", minHeight: 6 }} />
        <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 200, height: 176 }}>
          {/* 头像后面那一圈光：比头像大一圈，贴着头像那一圈最亮，往外淡下去。
              他说话时一亮一亮，他在想时慢慢呼吸，在听时淡淡地亮着（动的那两样见 ui/style.js 的 kfsCallTalk、kfsCallThink）。
              这一块占的地方比光小：光往外溢一点（盖不住字，名字、上面那行都垫在它上面） */}
          <div
            className={`kfs-call-ring ${ring}`}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 280,
              height: 280,
              marginLeft: -140,
              marginTop: -140,
              borderRadius: "50%",
              pointerEvents: "none",
              background:
                "radial-gradient(circle closest-side, rgba(205,220,252,0.8) 0%, rgba(205,220,252,0.8) 44%, rgba(170,195,245,0.38) 61%, rgba(140,170,235,0.1) 80%, rgba(140,170,235,0) 100%)",
              opacity: muted ? 0.1 : 0.28,
            }}
          />
          {/* 头像垫在光上面（光是浮起来的一层，头像不浮的话会被它罩住） */}
          <div style={{ position: "relative" }}>
            <Avatar av={avatar} who="him" size={128} />
          </div>
        </div>
        <div className="flex-shrink-0" style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "0.12em", paddingLeft: "0.12em", marginTop: 12, position: "relative" }}>
          {name}
        </div>
        {/* 字幕区：两个人共用（见 Subtitles.jsx）。宽照原来那行小字（最宽 320），高 225 上下 */}
        <div className="relative w-full" style={{ maxWidth: 320, marginTop: 22, flex: "0 1 225px", minHeight: 110 }}>
          <Subtitles subs={call.subs} />
          {/* 出了岔子的那一句：摆在字幕区底下，不占字幕的地方 */}
          {call.note ? (
            <div
              className="kfs-call-note text-center"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "calc(100% + 10px)",
                fontSize: 13,
                lineHeight: 1.55,
                color: "rgba(255,190,180,0.85)",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {call.note}
            </div>
          ) : null}
        </div>
        <div style={{ flex: "2 0 60px" }} />
      </div>

      <div className="flex items-start justify-center" style={{ gap: 72 }}>
        <RoundKey
          label={muted ? "取消静音" : "静音"}
          onClick={(e) => {
            e.stopPropagation();
            onMute();
          }}
          bg={muted ? "rgba(255,255,255,0.86)" : "rgba(255,255,255,0.14)"}
          color={muted ? "#000" : "#fff"}
          icon={muted ? "micOff" : "mic"}
          pressed={muted}
        />
        <RoundKey
          label="挂断"
          onClick={(e) => {
            e.stopPropagation();
            onHangUp();
          }}
          bg="#E5484D"
          color="#fff"
          icon="phone"
          turn
        />
      </div>
    </div>
  );
}

function RoundKey({ label, onClick, bg, color, icon, turn = false, pressed }) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 8 }}>
      <button
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        className="kfs-tap flex items-center justify-center"
        style={{ width: 66, height: 66, borderRadius: "50%", background: bg, color }}
      >
        <span style={{ display: "inline-flex", transform: turn ? "rotate(135deg)" : "none" }}>
          <Icon name={icon} size={26} sw={1.9} />
        </span>
      </button>
      <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>{label}</span>
    </div>
  );
}
