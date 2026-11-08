/* global __KFS_PAGEBOX__ */
// 他做的网页点开玩（走笔记本的时候他做的，见 laptop.js、alarm/bridge.js；卿卿 11 月 8 日要的，同 Moonlight）：盖一层全屏，框里是那一页。
// 框是隔开的（同秘戏钱匣那一页）：sandbox 只给 allow-scripts 那几样，来路是 null，碰不到开封府的网页、存档、localStorage，
// 不能开新窗口、不能把开封府这一页带走。框里先装 pagebox（assets/pagebox-*.html：它自己的安全规矩许那一页的脚本、样式跑，
// 开封府自己的不许），带着暗号（放在框的名字里，它读完就清掉）；它说“好了”，再把整页递进去，它照原样写出来。
// 右上角一个叉（Esc 也行），整层拆掉、框里那一页整个卸掉
import { useEffect, useRef } from "react";
import { T, glass } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";

export const PAGEBOX_URL = typeof __KFS_PAGEBOX__ !== "undefined" ? __KFS_PAGEBOX__ : "./assets/pagebox.html";
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

// it：对话里那一样（{ page, title, file, edited }）；html：那一页（"" 还在取，null 取不到）
export function PageView({ it, html, onClose }) {
  const token = useRef(newToken());
  const frame = useRef(null);
  useEffect(() => {
    if (!html) return;
    const on = (e) => {
      const f = frame.current;
      if (!f || e.source !== f.contentWindow) return;
      const m = e.data || {};
      // 框是隔开的，来路是 null，只能写 *；认人靠的是只回带着暗号的那一句
      if (m.t === "ready" && m.k === token.current) f.contentWindow.postMessage({ t: "page", k: token.current, html }, "*");
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [html]);
  useEffect(() => {
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="kfs-page-view absolute inset-0" data-state={html ? "open" : html === null ? "missing" : "loading"} style={{ zIndex: 60, background: "#fff" }}>
      {html ? (
        <iframe
          ref={frame}
          title={it.title || "网页"}
          src={PAGEBOX_URL}
          name={token.current}
          sandbox="allow-scripts allow-modals allow-forms allow-pointer-lock"
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      ) : (
        <div className="flex items-center justify-center" style={{ height: "100%", color: T.inkSoft, fontSize: 13, padding: "0 32px", textAlign: "center", lineHeight: 1.7 }}>
          {html === null ? "这一页取不到了（存档里没有，可能还没同步过来）" : "翻开这一页……"}
        </div>
      )}
      <button
        onClick={onClose}
        aria-label="关掉网页"
        className="kfs-tap absolute flex items-center justify-center"
        style={{ ...glass(0.7, 14), top: "calc(env(safe-area-inset-top, 0px) + 10px)", right: 12, width: 38, height: 38, borderRadius: 19, color: T.ink }}
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
