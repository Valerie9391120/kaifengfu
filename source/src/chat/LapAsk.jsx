// 传话走她笔记本上的 Claude Code、没走成的时候问她走不走 API（卿卿 11 月 8 日定的：走不了先问她，每句都问）。
//   LapAsk      聊天底下那张卡：没送到的那句话照写，下面两个钮。只管这一句（这一回重新回答），下一句照旧先走笔记本
//   LapConfirm  日记、手帐那几样（她点了才有的）走不了的时候，弹出来问的那一下
import { T, glass, chip, chipPrimary, FLOAT_SHADOW } from "../ui/style.js";

// note：底下那句话；regen：是重新回答没成（钮上写“这次”）；onApi 走 API；onAgain 再敲一回笔记本
export function LapAsk({ note, regen, onApi, onAgain }) {
  return (
    <div className="flex justify-center" style={{ marginTop: 14 }}>
      <div className="kfs-lap-ask" data-kind={regen ? "regen" : "send"} style={{ ...glass(0.62, 18), borderRadius: 18, padding: "10px 14px 12px", maxWidth: "88%" }}>
        <p style={{ fontSize: 12.5, color: T.red, lineHeight: 1.55, textAlign: "center" }}>{note}</p>
        <div className="flex justify-center flex-wrap" style={{ gap: 8, marginTop: 9 }}>
          <button onClick={onApi} className="kfs-tap kfs-lap-api" style={chipPrimary}>
            {regen ? "这次走 API" : "这句走 API"}
          </button>
          <button onClick={onAgain} className="kfs-tap kfs-lap-again" style={chip}>
            再敲笔记本
          </button>
        </div>
      </div>
    </div>
  );
}

// ask：{ why 没走成的缘故, what 问的是哪一样（“这篇日记”“这页手帐”）, answer(yes) }
export function LapConfirm({ ask }) {
  return (
    <div className="kfs-lap-confirm absolute inset-0 flex items-center justify-center" style={{ zIndex: 80, background: "rgba(0,0,0,0.28)", padding: "0 28px" }} onClick={() => ask.answer(false)}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass(0.86, 22), borderRadius: 24, padding: "18px 18px 16px", width: "100%", maxWidth: 340, boxShadow: FLOAT_SHADOW }}>
        <p style={{ fontSize: 14, color: T.ink, lineHeight: 1.6 }}>笔记本那头走不了</p>
        <p style={{ fontSize: 12.5, color: T.red, lineHeight: 1.55, marginTop: 4 }}>{ask.why}</p>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.6, marginTop: 10 }}>{ask.what || "这一回"}走 API 吗？</p>
        <div className="flex justify-end" style={{ gap: 8, marginTop: 14 }}>
          <button onClick={() => ask.answer(false)} className="kfs-tap kfs-lap-no" style={chip}>
            先不了
          </button>
          <button onClick={() => ask.answer(true)} className="kfs-tap kfs-lap-yes" style={chipPrimary}>
            走 API
          </button>
        </div>
      </div>
    </div>
  );
}
