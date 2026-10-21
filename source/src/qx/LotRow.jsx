import { T, SERIF, flat } from "../ui/style.js";
import { cleanLines, coinName } from "./pool.js";

// 她从秘戏钱匣里丢进聊天的一签（她的一条话，kind: "lot"，见 pool.js）：聊天正中一个方框（卿卿 10 月 21 日定的：不挂在顶上，
// 居中放一个方框，插在聊天中间，一次能丢好几个）。头一行〔签〕跟江湖棋局的小卡片一样用主题色，后面是飞出来的那枚铜钱；
// 底下一样一行：维度名小字淡墨，签照常。跟着聊天记录滚的东西不磨砂（flat，见 ui/style.js）
export function LotRow({ msg, animate }) {
  const lines = cleanLines(msg && msg.lines);
  const coin = coinName(msg && msg.coin);
  return (
    <div className={`kfs-lot flex justify-center ${animate ? "kfs-in" : ""}`} style={{ margin: "14px 0 6px" }}>
      <div style={{ ...flat(0.55), borderRadius: 16, padding: "9px 18px 11px", maxWidth: "80%" }}>
        <div className="text-center" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 5 }}>
          <span style={{ color: T.dai }}>〔签〕</span>
          <span style={{ fontFamily: SERIF, letterSpacing: "0.14em", color: T.inkSoft }}>{coin || "秘戏钱匣"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 10, rowGap: 1, justifyContent: "center", alignItems: "baseline" }}>
          {lines.map((l, i) => [
            <span key={"d" + i} className="text-right" style={{ fontSize: 11.5, color: T.inkFaint, whiteSpace: "nowrap" }}>
              {l.d}
            </span>,
            <span key={"t" + i} style={{ fontSize: 14, lineHeight: 1.6, color: T.ink }}>
              {l.t}
            </span>,
          ])}
        </div>
      </div>
    </div>
  );
}
