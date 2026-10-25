import { useEffect, useRef } from "react";
import { T, SERIF, flat } from "../ui/style.js";
import { fromCode, pdInfo } from "./parts.js";
import { paintWork, boundsOf } from "./draw.js";

// 她从拼豆作里发给他的一幅（她的一条话，kind: "pindou"，见 parts.js）：聊天正中一个方框，同秘戏钱匣的签（卿卿 10 月 25 日点的“像秘戏钱匣那样”）。
// 头一行〔拼豆〕用主题色，后面是名字；中间那幅照熨烫的样子画（只画有豆子的那一块），透明的底，三套主题都看得清（熨烫的豆子带一道外沿淡线）；
// 底下一行几号板、几颗。跟着聊天记录滚的东西不磨砂（flat，见 ui/style.js）。不接长按菜单
const SIDE = 168; // 那幅最长的一边摆多宽

export function PindouRow({ msg, animate }) {
  const ref = useRef(null);
  const code = (msg && msg.code) || "";
  const info = pdInfo(msg);
  useEffect(() => {
    const c = ref.current;
    const b = fromCode(code);
    if (!c || !b) return;
    const box = boundsOf(b.n, b.g, 1) || { x: 0, y: 0, w: b.n, h: b.n };
    const dpr = Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, 3);
    const S = (SIDE * dpr) / Math.max(box.w, box.h);
    paintWork(c, b.n, b.g, { S, mode: "fused", crop: box });
    c.style.width = (box.w * S) / dpr + "px";
    c.style.height = (box.h * S) / dpr + "px";
  }, [code]);
  return (
    <div className={`kfs-pd-card flex justify-center ${animate ? "kfs-in" : ""}`} style={{ margin: "14px 0 6px" }}>
      <div style={{ ...flat(0.55), borderRadius: 16, padding: "9px 16px 10px", maxWidth: "80%" }}>
        <div className="text-center" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 7 }}>
          <span style={{ color: T.dai }}>〔拼豆〕</span>
          <span style={{ fontFamily: SERIF, letterSpacing: "0.14em", color: T.inkSoft }}>{info.name || "拼豆作"}</span>
        </div>
        {info.n ? <canvas ref={ref} role="img" aria-label={info.name ? `拼豆《${info.name}》` : "一幅拼豆"} style={{ display: "block", margin: "0 auto" }} /> : null}
        <div className="text-center" style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 7 }}>{info.n ? `${info.n}×${info.n}，${info.beads} 颗` : "这一幅认不出来了"}</div>
      </div>
    </div>
  );
}
