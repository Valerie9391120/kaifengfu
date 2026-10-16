import { T, SERIF, glass, flat, chip, chipPrimary } from "../ui/style.js";
import { stripLines } from "./jianghu.js";

// 江湖棋局在界面上的几样（逻辑见 jianghu.js）。卿卿 10 月 15 日定的：画面先只在聊天里（顶上一条、气泡中间的小卡片），棋盘页以后再说。

// 顶上那条：顶栏底下，写第几章、各在第几格、各有几两（不写身份）。浮在聊天记录上面，跟顶栏一样是玻璃
export function GameStrip({ board }) {
  const [a, b] = stripLines(board);
  return (
    <div className="relative z-10 flex justify-center flex-shrink-0" style={{ margin: "8px 12px 0" }}>
      <div className="kfs-game-strip text-center" style={{ ...glass(0.36, 22), borderRadius: 14, padding: "5px 14px 6px", maxWidth: "100%" }}>
        <div className="truncate" style={{ fontFamily: SERIF, fontSize: 12.5, letterSpacing: "0.12em", color: T.ink, lineHeight: 1.5 }}>
          {a}
        </div>
        <div className="truncate" style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45 }}>
          {b}
        </div>
      </div>
    </div>
  );
}

// 气泡中间的一张小卡片：前面括号里那个字（骰、银、行……）用主题色，后面照常。
// 跟着聊天记录滚的东西不磨砂（flat，见 ui/style.js）。左边和他的气泡对齐
export function GameCardRow({ text, animate }) {
  const m = /^(〔[^〕]*〕)([\s\S]*)$/.exec(text || "");
  return (
    <div className={`kfs-game-card ${animate ? "kfs-in" : ""}`} style={{ marginLeft: 42, marginTop: 6, marginRight: 24 }}>
      <span style={{ ...flat(0.5), display: "inline-block", borderRadius: 12, padding: "4px 11px 5px", fontSize: 12.5, lineHeight: 1.55, color: T.ink }}>
        {m ? (
          <>
            <span style={{ color: T.dai }}>{m[1]}</span>
            {m[2]}
          </>
        ) : (
          text
        )}
      </span>
    </div>
  );
}

// 南衙里点“江湖棋局”冒出来的那一张：接着上一局（有局在下才有）、开新的一局。
// last：最近那一局的棋盘（还没开局是 null）；hasGame：有没有下过的那一局（对话还在）
export function JianghuPanel({ last, hasGame, onContinue, onNew }) {
  const [a, b] = stripLines(last);
  return (
    <div className="kfs-jianghu flex flex-col" style={{ gap: 12 }}>
      {hasGame && (
        <div style={{ ...glass(0.5, 16), borderRadius: 18, padding: "12px 14px" }}>
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 4 }}>上一局</div>
          <div style={{ fontFamily: SERIF, fontSize: 15, letterSpacing: "0.1em", color: T.ink }}>{a}</div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>{b}</div>
          <button onClick={onContinue} className="kfs-tap kfs-jianghu-go" style={{ ...chipPrimary, marginTop: 12 }}>
            接着上一局
          </button>
        </div>
      )}
      <div>
        <button onClick={onNew} className="kfs-tap kfs-jianghu-new" style={hasGame ? chip : chipPrimary}>
          开新的一局
        </button>
      </div>
      <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.7 }}>
        开新的一局会另开一段对话，跟小晋说一声“开局”就开。{hasGame ? "上一局留在历史对话里，翻回去还能接着下。" : ""}掷骰子跟他说一声，他替你扔。
      </p>
    </div>
  );
}
