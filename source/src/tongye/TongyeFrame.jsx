import { useEffect, useRef, useState } from "react";
import { store } from "../store.js";
import { safeTopPx } from "../ui/parts.jsx";
import { makeServer, TY_KV, TY_LS, onTyChanged } from "./host.js";
import { JZCFG_KEY } from "../jz/model.js";
import { geocode, dayWeather } from "../jz/weather.js";

/* global __KFS_TONGYE__ */
// 同页那一本手帐（vendor/tongye/，作者同意搬进来，见开发说明“同页搬进来”那一节）：闲笔集里点手帐，盖一层全屏，用一个框装着它。
// 那一页原样一个文件（打了几处补丁，见 tools/tongye.mjs），名字带指纹，地址由 build.mjs 写进来；点进来的时候才建框、才下载。
//
// 它是别人写的程序：框是隔开的（sandbox 里只给 allow-scripts、allow-downloads，没有 allow-same-origin），
// 里面的东西碰不到开封府的网页、存档、钥匙，也不能把开封府这一页带走、不能开新窗口。
// 它要什么只能来问（postMessage），这边只答这一本手帐自己的几样（见 host.js 的 makeServer）。
// 开门那一下要同步给它的几样（这一本存在“这台设备上”的那些、今天、每一天聊了多少、打开哪一天、刘海多高、暗号）放在框的名字里带进去，它读完就清掉。
// 暗号：框里来问的每一回都得带着（框要是换成了别的网页，它拿不到暗号，问什么都不理，这边也不再往里递东西）
export const TONGYE_URL = typeof __KFS_TONGYE__ !== "undefined" ? __KFS_TONGYE__ : "./assets/tongye.html";

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
// 刘海、底下那一条：iPhone 上框里的 env(safe-area-inset-*) 都是 0，同页的样式里那几处换成了 --safe-t 这几个（见 tools/tongye.mjs），量好了告诉它
const safeNow = () => ({ t: safeTopPx(), b: px("var(--kfs-sab)"), l: px("env(safe-area-inset-left)"), r: px("env(safe-area-inset-right)") });

const newTok = () => {
  try {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
};

// 框还没摆出来的那一下，底色跟同页一样（它照手机的深浅：浅的 #EAEAE7、深的 #0F1011），不先闪一下别的颜色
const DARK = () => {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch (e) {
    return false;
  }
};

export function TongyeFrame({ day, mode, heat, dayMsgs, chatImg, onFail, onAsk, onClose }) {
  const box = useRef(null);
  // 同页还没摆好（那一页 6.5 MB 还在下载、没网取不到）：这边摆一颗回去的，不然她被这一层挡住出不去
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let frame = null;
    let authed = false; // 框里带着暗号来问过了：这之后才往里递东西
    const tok = newTok();
    const send = (msg) => {
      try {
        if (frame && frame.contentWindow) frame.contentWindow.postMessage({ kfsTy: 1, ...msg }, "*");
      } catch (e) {}
    };
    const server = makeServer({ store, dayMsgs, chatImg, onFail, onAsk, onClose: () => onClose(), onReady: () => setReady(true), cfgKey: JZCFG_KEY, geocode, weather: dayWeather, day });
    const onMsg = async (e) => {
      if (!frame || e.source !== frame.contentWindow) return;
      const d = e.data;
      if (!d || d.kfsTy !== 1 || typeof d.method !== "string") return;
      if (d.tok !== tok) {
        authed = false; // 框里换了人：不理，也不再递
        return;
      }
      authed = true;
      try {
        const value = await server.handle(d.method, d.args);
        if (d.id) send({ re: d.id, ok: true, value });
      } catch (er) {
        if (d.id) send({ re: d.id, ok: false, error: String((er && er.message) || er) });
      }
    };
    window.addEventListener("message", onMsg);
    // 别的设备改了这一本的东西（拉下来以后），开封府这头替她写了（天气、起了那一天的 day）：告诉框里
    const push = (keys) => {
      if (!authed) return;
      const pairs = keys.filter((k) => k.startsWith(TY_KV) || k.startsWith(TY_LS)).map((k) => [k, store.peek(k)]);
      if (pairs.length) send({ changed: pairs });
    };
    const offPull = store.subscribe(push);
    const offMine = onTyChanged(push);
    const onResize = () => authed && send({ safe: safeNow() });
    window.addEventListener("resize", onResize);
    window.addEventListener("kfs-kb", onResize);
    const slowT = setTimeout(() => setSlow(true), 12000);
    // 先起名字（带进去的东西），再给地址
    frame = document.createElement("iframe");
    frame.className = "kfs-ty-frame";
    frame.title = "手帐本子";
    frame.setAttribute("sandbox", "allow-scripts allow-downloads");
    frame.setAttribute("allow", "web-share");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;border:0;display:block";
    frame.name = "kfs-ty:" + JSON.stringify({ ...server.init({ day, mode, heat, safe: safeNow() }), tok });
    frame.src = TONGYE_URL;
    box.current.appendChild(frame);
    return () => {
      clearTimeout(slowT);
      window.removeEventListener("message", onMsg);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("kfs-kb", onResize);
      offPull();
      offMine();
      try {
        frame.remove();
      } catch (e) {}
      frame = null;
    };
  }, []);
  return (
    <div ref={box} className="kfs-ty absolute inset-0" style={{ zIndex: 60, background: DARK() ? "#0F1011" : "#EAEAE7" }}>
      {ready ? null : (
        <div className="kfs-ty-wait" style={{ position: "absolute", left: 0, right: 0, top: 0, paddingTop: safeTopPx(), zIndex: 2, pointerEvents: "none" }}>
          <button
            onClick={() => onClose()}
            className="kfs-tap kfs-ty-back"
            style={{ pointerEvents: "auto", margin: "10px 0 0 12px", padding: "6px 12px 6px 8px", border: 0, background: "rgba(255,255,255,.7)", borderRadius: 999, color: "#2e2a26", fontSize: 13.5 }}
          >
            ‹ 闲笔集
          </button>
          {slow ? <div style={{ margin: "40vh 24px 0", textAlign: "center", color: "#6e6862", fontSize: 14, lineHeight: 1.8 }}>手帐本子还没打开，网不好？先回闲笔集，过一会儿再点开</div> : null}
        </div>
      )}
    </div>
  );
}
