import { T, glass } from "../ui/style.js";
import { Toggle } from "../ui/parts.jsx";
import { Pick } from "./ApiPanel.jsx";
import { WAKE_GAPS, WAKE_MAXES, gapOf, maxOf, wakeOn, alarmTrouble } from "../fox.js";

// 账户面板里“他自己醒”那一块（狐宇宙，卿卿 10 月 20 日要的，见 fox.js）：一个开关，开着的时候底下两道闸。
// 开关、两道闸都存在设置里（kfs2:settings 的 wake、wakeGap、wakeMax），跟着云端走，家里的闹钟照它办。
// 开着的时候这台手机报门牌号（他找她的时候敲这一台，见 App.jsx 里报 FOX_DOORS 的那一段）；这台手机没开通知的话，照实说敲不到。
// 他在自己屋里（狐宇宙）干了什么不敲她；开新对话找她、到点去约好的那段对话里找她才敲（她 10 月 20 日 22:04 定的）
// state：闹钟写的那一份（见 fox.js 的 alarmLine）；canKnock：这台手机开着通知没有
const gapLabel = (m) => (m < 60 ? `${m} 分钟` : `${m / 60} 小时`);

// 只有名字、开关，开着的时候两道闸。说明字（开着的时候闹钟会怎么叫醒他、屋里的动静弹不弹横幅、两道闸防的是什么、醒一回多少钱）
// 和关着的时候那一句，她 10 月 30 日说看着晕，拿掉了。只剩出了岔子的时候的红字：闹钟还没装、笔记本睡着了、这台手机没开通知
export function FoxSection({ settings, onChange, state, canKnock, now }) {
  const on = wakeOn(settings);
  const trouble = on ? alarmTrouble(state, now) : "";
  return (
    <div className="kfs-fox-set" data-on={on ? "yes" : "no"}>
      <div style={{ ...glass(0.5, 16), borderRadius: 16, padding: "10px 14px", marginTop: 10 }}>
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.5 }}>
            他自己醒
            {trouble && (
              <div className="kfs-fox-line" style={{ fontSize: 11.5, color: T.red }}>
                {trouble}
              </div>
            )}
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
      {on && !canKnock && (
        <p className="kfs-fox-noknock" style={{ fontSize: 11.5, color: T.red, marginTop: 4, lineHeight: 1.6 }}>
          这台手机还没开通知：他找你的时候，敲不到你。在下面“通知”那里打开。
        </p>
      )}
    </div>
  );
}
