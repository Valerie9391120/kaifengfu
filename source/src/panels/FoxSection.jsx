import { T, glass } from "../ui/style.js";
import { Toggle } from "../ui/parts.jsx";
import { Pick } from "./ApiPanel.jsx";
import { WAKE_GAPS, WAKE_MAXES, gapOf, maxOf, wakeOn, alarmLine } from "../fox.js";

// 账户面板里“他自己醒”那一块（狐宇宙，卿卿 10 月 20 日要的，见 fox.js）：一个开关，开着的时候底下两道闸。
// 开关、两道闸都存在设置里（kfs2:settings 的 wake、wakeGap、wakeMax），跟着云端走，家里的闹钟照它办。
// 开着的时候这台手机报门牌号（他留了话敲这一台，见 App.jsx 里报 FOX_DOORS 的那一段）；这台手机没开通知的话，照实说敲不到。
// state：闹钟写的那一份（见 fox.js 的 alarmLine）；canKnock：这台手机开着通知没有
const gapLabel = (m) => (m < 60 ? `${m} 分钟` : `${m / 60} 小时`);

export function FoxSection({ settings, onChange, state, canKnock, now }) {
  const on = wakeOn(settings);
  return (
    <div className="kfs-fox-set" data-on={on ? "yes" : "no"}>
      <div style={{ ...glass(0.5, 16), borderRadius: 16, padding: "10px 14px", marginTop: 10 }}>
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.5 }}>
            他自己醒
            <div className="kfs-fox-line" style={{ fontSize: 11.5, color: T.inkSoft }}>
              {on ? alarmLine(state, now) : "关着：只有你来找他，他才醒"}
            </div>
          </div>
          <Toggle on={on} onChange={(v) => onChange({ wake: v })} label="他自己醒" />
        </div>
        {on && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>两回之间最短隔</div>
            <div className="kfs-fox-gap">
              <Pick options={WAKE_GAPS.map((v) => ({ v, t: gapLabel(v) }))} value={gapOf(settings)} onPick={(v) => onChange({ wakeGap: v })} label="两回之间最短隔" />
            </div>
            <div style={{ fontSize: 12, color: T.inkSoft, margin: "12px 0 8px" }}>一天最多醒</div>
            <div className="kfs-fox-max">
              <Pick options={WAKE_MAXES.map((v) => ({ v, t: `${v} 回` }))} value={maxOf(settings)} onPick={(v) => onChange({ wakeMax: v })} label="一天最多醒" />
            </div>
          </div>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
        开着的时候，家里那台笔记本上的闹钟会到点叫醒他：留话、发语音、打电话、翻日记，或者什么都不干，都由他，下回几点醒也是他定。他留了话，这台手机上弹横幅；醒来说的话都在南衙最顶上的“狐宇宙”里。两道闸防的是闹钟出岔子绕圈子，不是管他。醒一回的花费跟你发一句话差不多。
      </p>
      {on && !canKnock && (
        <p className="kfs-fox-noknock" style={{ fontSize: 11.5, color: T.red, marginTop: 4, lineHeight: 1.6 }}>
          这台手机还没开通知：他留了话，敲不到你。在下面“通知”那里打开。
        </p>
      )}
    </div>
  );
}
