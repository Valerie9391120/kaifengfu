import { SERIF } from "../ui/style.js";
import { Avatar } from "../ui/Avatar.jsx";
import { RoundKey } from "./CallPage.jsx";

// =====================================================
//   他打来的电话（见 call/incoming.js）：跟通话页一个样子的黑底；他的头像在中间，后面那圈光一亮一亮（跟他说话时一样），
//   底下他的名字、“来电”；最底下两个键，左边挂断（红）、右边接听（绿），跟手机来电一样摆。
//   接听要在她点的那一下里开声音、开麦克风（iPhone 要这一下），所以 onAnswer 直接接在按钮上。
// =====================================================
export function IncomingCall({ avatar, name, onAnswer, onDecline }) {
  return (
    <div
      className="kfs-ring absolute inset-0 flex flex-col items-center"
      role="dialog"
      aria-label="来电"
      style={{
        zIndex: 75,
        background: "#000",
        color: "rgba(255,255,255,0.92)",
        paddingTop: "calc(env(safe-area-inset-top) + 44px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 40px)",
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      <div className="text-center" style={{ fontSize: 14, letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)" }}>
        来电
      </div>
      <div className="flex-1 flex flex-col items-center w-full" style={{ minHeight: 0 }}>
        <div style={{ flex: "1 1 24px", minHeight: 6 }} />
        <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 200, height: 176 }}>
          {/* 头像后面那一圈光：跟他说话时一样一亮一亮（ui/style.js 的 kfsCallTalk） */}
          <div
            className="kfs-call-ring kfs-call-talk"
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
              opacity: 0.28,
            }}
          />
          <div style={{ position: "relative" }}>
            <Avatar av={avatar} who="him" size={128} />
          </div>
        </div>
        <div className="kfs-ring-name flex-shrink-0" style={{ fontFamily: SERIF, fontSize: 24, letterSpacing: "0.12em", paddingLeft: "0.12em", marginTop: 14, position: "relative" }}>
          {name}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 8, letterSpacing: "0.06em" }}>邀请你通话…</div>
        <div style={{ flex: "2 0 60px" }} />
      </div>
      <div className="flex items-start justify-center" style={{ gap: 96 }}>
        <RoundKey label="挂断" onClick={onDecline} bg="#E5484D" color="#fff" icon="phone" turn />
        <RoundKey label="接听" onClick={onAnswer} bg="#30A46C" color="#fff" icon="phone" />
      </div>
    </div>
  );
}
