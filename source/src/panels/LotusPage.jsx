import { useEffect, useRef } from "react";
import { Icon } from "../ui/Icon.jsx";
import { safeTopPx } from "../ui/parts.jsx";

/* global __KFS_LOTUS__ */
// 并蒂莲（卿卿 2026 年 10 月 12 日要的，那一页是项目外的 Claude 做的，她拿来放进开封府）。
// 长按侧栏的日期卡片、点“去看并蒂莲”进来：盖一层全屏的黑幕，里面用一个框装着那一页，左上角一个叉回到侧栏。
// 那一页原样一个文件（source/static/lotus.html，打包时名字带指纹，地址由 build.mjs 写进来）。
// 装在框里，它的样式、它挂在整页上的那些监听、它在 window 上留的东西都碰不到开封府；
// 框是点进来的时候才建、才去下载那九百多 KB，叉一点框就拆了，花不再画，什么都不剩。
// 详细的见开发说明“并蒂莲”那节
export const LOTUS_URL = typeof __KFS_LOTUS__ !== "undefined" ? __KFS_LOTUS__ : "./assets/lotus.html";

// 主题 → 那一页里的配色（她那一页自带五套，刚好有这两套）：青绿配青瓷，丁香配藕荷。
// 每回进来都照主题，在里面换的配色只管这一回
const PALETTE = { qinglv: "celadon", dingxiang: "mauve" };
export const lotusSrc = (theme) => `${LOTUS_URL}?palette=${PALETTE[theme] || PALETTE.qinglv}`;

// 量一个长度（写成 CSS 的样子）在开封府这头是多少像素
function px(css) {
  try {
    const d = document.createElement("div");
    d.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${css};visibility:hidden;pointer-events:none`;
    document.body.appendChild(d);
    const h = d.getBoundingClientRect().height || 0;
    d.remove();
    return h;
  } catch (e) {
    return 0;
  }
}

// 叉的样子照那一页自己的圆按钮（.round）：深色半透明、发丝边，在花旁边不扎眼
const CLOSE = {
  position: "absolute",
  top: "calc(env(safe-area-inset-top) + 10px)",
  left: "calc(env(safe-area-inset-left) + 12px)",
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "1px solid rgba(190,210,240,0.16)",
  background: "rgba(8,13,24,0.5)",
  color: "rgba(226,235,248,0.88)",
  WebkitBackdropFilter: "blur(10px)",
  backdropFilter: "blur(10px)",
  display: "grid",
  placeItems: "center",
};

export function LotusPage({ theme, onClose }) {
  const frame = useRef(null);
  // 那一页的按钮、起名框要让开底下横条（横着拿的时候还有两边的刘海），它自己量不到（iPhone 上框里的 env(safe-area-inset-*) 都是 0），
  // 由这边量好了写进去：它的样式里拿 --safe-b、--safe-l、--safe-r 摆（--safe-t 也定义了，眼下没用上，一起写了）。
  // 底下那个就是开封府自己用的 --kfs-sab：键盘开着、底下空一条够不着的时候是 0（见 input.css）。
  // 框读完、键盘一开一收、屏幕变了，各写一遍
  const push = () => {
    let root = null;
    try {
      root = frame.current && frame.current.contentDocument && frame.current.contentDocument.documentElement;
    } catch (e) {}
    if (!root) return;
    root.style.setProperty("--safe-t", safeTopPx() + "px");
    root.style.setProperty("--safe-b", px("var(--kfs-sab)") + "px");
    root.style.setProperty("--safe-l", px("env(safe-area-inset-left)") + "px");
    root.style.setProperty("--safe-r", px("env(safe-area-inset-right)") + "px");
  };
  useEffect(() => {
    window.addEventListener("resize", push);
    window.addEventListener("kfs-kb", push);
    // 网页底色这会儿换成黑的：主屏幕底下空一条、100vh 也够不着的那种手机（gap.js 的 "bottom"），系统在最底下画的那条取的是网页底色，
    // 不换的话黑幕底下会露一条浅色。撑满的手机（她的）看不出区别。叉一点换回去
    const r = document.documentElement, b = document.body;
    const was = [r.style.backgroundColor, b.style.backgroundColor];
    r.style.backgroundColor = b.style.backgroundColor = "#000";
    return () => {
      window.removeEventListener("resize", push);
      window.removeEventListener("kfs-kb", push);
      r.style.backgroundColor = was[0];
      b.style.backgroundColor = was[1];
    };
  }, []);
  return (
    <div className="kfs-lotus absolute inset-0" style={{ zIndex: 60, background: "#000" }}>
      {/* data-kfs-kbfit：框里的起名框拿到焦点、键盘弹起来时，开封府照自己的输入框那样铺到键盘上面（见 keyboard.js） */}
      <iframe
        ref={frame}
        src={lotusSrc(theme)}
        title="并蒂莲"
        data-kfs-kbfit=""
        onLoad={push}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0, display: "block", background: "#000" }}
      />
      <button onClick={onClose} aria-label="关闭" className="kfs-lotus-close kfs-tap" style={CLOSE}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
