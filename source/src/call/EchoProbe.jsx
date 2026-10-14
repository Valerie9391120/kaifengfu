import { useEffect, useState } from "react";
import { SERIF } from "../ui/style.js";
import { VERDICT_TEXT } from "./echo.js";

// =====================================================
//   量一量回声的那一页（见 echo.js）：黑底，跟通话页一个样子。
//   每一步写着这会儿要她做什么；底下一根条跟着麦克风一跳一跳（她看得到在量）；量完摆出几个数和结论，让她截图发我。
//   echo：{ step: prep|quiet|echo|both|done|fail, result, error }
//   levelOf()：麦克风眼下多响。那根条自己隔一会儿来取（不走 App 的 state：一秒十几回，整页跟着重画太费）
// =====================================================
const STEPS = {
  prep: ["准备中…", "开麦克风，把我那一句念好（头一回要念一下，等几秒）。音量调到平常打电话那么大，手机像打电话那样拿着。"],
  quiet: ["先安静两秒", "别出声。"],
  echo: ["听我说一句", "这回别出声，听我说完。"],
  both: ["我再说一遍", "这回跟着我一起说话，说什么都行，像平常打电话那么大声。"],
};

const fmt = (x) => (typeof x === "number" && isFinite(x) ? x.toFixed(4) : "—");

export function EchoProbe({ echo, levelOf, onClose, onAgain }) {
  const step = echo.step;
  const done = step === "done";
  const r = echo.result;
  const [level, setLevel] = useState(0);
  const live = !done && step !== "fail";
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setLevel(levelOf ? levelOf() : 0), 80);
    return () => clearInterval(t);
  }, [live, levelOf]);
  const [title, how] = STEPS[step] || (done ? ["量完了", "截个图发我。"] : ["量不成", echo.error || ""]);
  // 条的长短：rms 0.2 算满（说话大声的时候到得了），开个方，小声的也看得出动
  const bar = Math.max(0, Math.min(1, Math.sqrt((level || 0) / 0.2)));
  const rows = r
    ? [
        ["回声消除", r.aec === true ? "开着" : r.aec === false ? "关着" : "不知道"],
        ["屋里本来（安静的时候）", fmt(r.quiet)],
        ["我开口那一会儿漏进来最多", fmt(r.head)],
        ["后面漏进来的", fmt(r.echo)],
        ["你说话", fmt(r.her)],
        ["你说话是漏进来的", `${(r.times || 0).toFixed(1)} 倍`],
        ["麦克风收到的段数", `${r.frames.quiet} / ${r.frames.echo} / ${r.frames.both}`],
        ["采样率", r.rate ? `${r.rate}` : "—"],
      ]
    : [];
  return (
    <div
      className="kfs-echo absolute inset-0 flex flex-col"
      role="dialog"
      aria-label="量一量回声"
      data-step={step}
      style={{
        zIndex: 80,
        background: "#000",
        color: "rgba(255,255,255,0.92)",
        paddingTop: "calc(env(safe-area-inset-top) + 40px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      <div style={{ fontFamily: SERIF, fontSize: 21, letterSpacing: "0.1em", marginBottom: 6 }}>量一量回声</div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 26 }}>打断我用：看我说话的声音有多少漏进麦克风。</div>
      <div className="kfs-echo-title" style={{ fontSize: 19, marginBottom: 8 }}>
        {title}
      </div>
      <div className="kfs-echo-how" style={{ fontSize: 14.5, lineHeight: 1.7, color: done || step === "fail" ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.88)" }}>
        {how}
      </div>
      {!done && step !== "fail" && (
        <div aria-hidden="true" style={{ marginTop: 26, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
          <div className="kfs-echo-bar" style={{ width: `${Math.round(bar * 100)}%`, height: "100%", background: "rgba(205,220,252,0.85)", transition: "width .08s linear" }} />
        </div>
      )}
      {done && r && (
        <div style={{ marginTop: 18 }}>
          <div className="kfs-echo-verdict" data-verdict={r.verdict} style={{ fontSize: 15, lineHeight: 1.65, marginBottom: 14, color: r.verdict === "ok" ? "rgba(190,240,200,0.95)" : r.verdict === "edge" ? "rgba(250,225,160,0.95)" : "rgba(255,190,180,0.95)" }}>
            {VERDICT_TEXT[r.verdict] || ""}
          </div>
          <div className="kfs-echo-rows" style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 12, rowGap: 4, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {rows.map(([k, v]) => [
              <div key={k + "k"} style={{ color: "rgba(255,255,255,0.6)" }}>
                {k}
              </div>,
              <div key={k + "v"} style={{ textAlign: "right" }}>
                {v}
              </div>,
            ])}
          </div>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div className="flex" style={{ gap: 12 }}>
        {(done || step === "fail") && (
          <button onClick={onAgain} className="kfs-tap" style={{ flex: 1, padding: "12px 0", borderRadius: 999, fontSize: 15, color: "#fff", background: "rgba(255,255,255,0.14)" }}>
            再量一回
          </button>
        )}
        <button onClick={onClose} aria-label="关掉量回声" className="kfs-tap" style={{ flex: 1, padding: "12px 0", borderRadius: 999, fontSize: 15, color: "#000", background: "rgba(255,255,255,0.86)" }}>
          {done || step === "fail" ? "关掉" : "不量了"}
        </button>
      </div>
    </div>
  );
}
