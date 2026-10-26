import { useEffect, useRef } from "react";
import { T, SERIF, flat } from "../ui/style.js";
import { useTheme } from "../theme.js";
import { fromCode, pdInfo } from "./parts.js";
import { paintWork, boundsOf, BOARD_OF } from "./draw.js";

// 她从拼豆作里发给他的一幅（她的一条话，kind: "pindou"，见 parts.js）：聊天正中一个方框，同秘戏钱匣的签（卿卿 10 月 25 日点的“像秘戏钱匣那样”）。
// 头一行〔拼豆〕用主题色，后面是名字；中间那幅照像素的样子画（实心方格，只画有豆子的那一块；原来是熨烫的样子，她 10 月 26 日说“只要像素”），
// 铺在这套主题的底板上（同那一页；原来是透明的底，黑夜里墨黑的豆子跟方框几乎一个颜色，看不见），换了主题跟着重画；
// 底下一行几号板、几颗。跟着聊天记录滚的东西不磨砂（flat，见 ui/style.js）。不接长按菜单
const SIDE = 168; // 那幅最长的一边摆多宽

export function PindouRow({ msg, animate }) {
  const ref = useRef(null);
  const code = (msg && msg.code) || "";
  const info = pdInfo(msg);
  const theme = useTheme();
  useEffect(() => {
    const c = ref.current;
    const b = fromCode(code);
    if (!c || !b) return;
    const box = boundsOf(b.n, b.g, 1) || { x: 0, y: 0, w: b.n, h: b.n };
    const dpr = Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, 3);
    const S = (SIDE * dpr) / Math.max(box.w, box.h);
    paintWork(c, b.n, b.g, { S, crop: box, board: BOARD_OF[theme] || BOARD_OF.qinglv });
    c.style.width = (box.w * S) / dpr + "px";
    c.style.height = (box.h * S) / dpr + "px";
  }, [code, theme]);
  return (
    <div className={`kfs-pd-card flex justify-center ${animate ? "kfs-in" : ""}`} style={{ margin: "14px 0 6px" }}>
      <div style={{ ...flat(0.55), borderRadius: 16, padding: "9px 16px 10px", maxWidth: "80%" }}>
        <div className="text-center" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 7 }}>
          <span style={{ color: T.dai }}>〔拼豆〕</span>
          <span style={{ fontFamily: SERIF, letterSpacing: "0.14em", color: T.inkSoft }}>{info.name || "拼豆作"}</span>
        </div>
        {info.n ? <canvas ref={ref} role="img" aria-label={info.name ? `拼豆《${info.name}》` : "一幅拼豆"} style={{ display: "block", margin: "0 auto", borderRadius: 8 }} /> : null}
        <div className="text-center" style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 7 }}>{info.n ? `${info.n}×${info.n}，${info.beads} 颗` : "这一幅认不出来了"}</div>
      </div>
    </div>
  );
}
