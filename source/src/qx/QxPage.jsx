import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon.jsx";
import { safeTopPx } from "../ui/parts.jsx";
import { HIS_NAME } from "../names.js";
import { newId } from "../util.js";
import { loadS2T } from "../cangyin/CangyinPage.jsx";
import { hasLots, drawLots, rerollLine, phoneRng } from "./pool.js";
import { QxPoolSheet } from "./QxPoolSheet.jsx";

/* global __KFS_QIANXIA__ */
// 秘戏钱匣那一层（卿卿 2026 年 10 月 21 日要的，见开发说明“秘戏钱匣”那节；签库、抽签见 pool.js）。
// 南衙里点“秘戏钱匣”进来：盖一层全屏，里面用一个框装着那一页（她拿来的《锦盒抽签》，tools/make_qianxia.py 改过几处），
// 左上角一个叉回到聊天，右上角“签库”。框是点进来的时候才建、才去下载那两兆六，叉一点框就拆了，那一页整个卸掉。
// 框是隔开的（sandbox 只给 allow-scripts，同同页那一本手帐）：来路是 null，碰不到开封府的网页、存档、localStorage，
// 不能开新窗口、不能把开封府这一页带走。那一页往后照她的新版重新生成，也关在框里。
// 和那一页一问一答（postMessage）：只认这个框、只认带着暗号的（暗号放在框的名字里带进去，它读完就清掉；
// 框要是换成了别的网页，拿不到暗号，它说什么都不理，这边也不往里递签）：
//   它说 hello（那一页的脚本跑起来了）、ready（画好了）→ 告诉它“发给他”那颗写什么（狐宇宙里不摆）、签库空没空、底下横条让开多高；
//   它说 start（点了锦盒，coin 是飞出来第几枚）→ 照签库抽一签，转成繁体递进去（卷轴上是刻本体，刻本是繁体）；
//   它说 reroll（长按了第几行）→ 那一样重抽，递进去；
//   它说 send → 交给开封府丢进聊天（sendLot），成了告诉它 sent；
//   它说 empty（签库空着还点了锦盒）→ 打开签库；
//   它说 lost（画好以后画布被收走了，iPhone 切到后台常有）→ 框重建一回；fail（WebGL 建不起来、图读不成）→ 换成一句话，签库照样能开。
export const QX_URL = typeof __KFS_QIANXIA__ !== "undefined" ? __KFS_QIANXIA__ : "./assets/qianxia.html";
const WAIT_MS = 15000; // 这么久还没画出来（网慢、头一回要下两兆六），说一句
const REBUILD_MAX = 2; // 画布被收走，框最多重建几回
const NOTE = {
  fail: "这台手机画不出锦盒。签库照样能看、能改。",
  slow: "锦盒还在路上，网有点慢……",
  gone: "锦盒这一页取不到了：把开封府从后台划掉、重新打开再试。签库照样能看、能改。",
};

// 量一个长度（写成 CSS 的样子）在开封府这头是多少像素（同 LotusPage.jsx）
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

// 叉、签库两颗照那一页自己的“再抽一次”：深红半透明、金色发丝边、宋体
const ROUND = {
  position: "absolute",
  top: "calc(env(safe-area-inset-top) + 10px)",
  height: 38,
  borderRadius: 999,
  border: "1px solid rgba(247,222,180,0.42)",
  background: "rgba(40,14,6,0.42)",
  color: "#f7e6c6",
  WebkitBackdropFilter: "blur(6px)",
  backdropFilter: "blur(6px)",
  display: "grid",
  placeItems: "center",
};
const SONG = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", serif';

export function QxPage({ pool, onPool, sendLot, canSend = true, onClose }) {
  const frame = useRef(null);
  const token = useRef(newId() + newId());
  const [gen, setGen] = useState(0); // 框重建过几回（画布被收走以后）
  const [state, setState] = useState("loading"); // loading / slow / live / fail / gone
  const [sheet, setSheet] = useState(false);
  const cur = useRef(null); // 卷轴上眼下这一签：{ coin, lines }（简体，丢进聊天用的就是它）
  const trad = useRef(null); // 转繁体（那一包取回来以前是 null，先递简体的）
  const latest = useRef(null);
  latest.current = { pool, onPool, sendLot, canSend, gen };

  const post = (m) => {
    try {
      const w = frame.current && frame.current.contentWindow;
      if (w) w.postMessage(m, "*"); // 框是隔开的，来路是 null，只能写 *；认人靠的是只回带着暗号的那几句
    } catch (e) {}
  };
  const tr = (l) => {
    const f = trad.current;
    if (!f) return l;
    try {
      return { d: f(l.d), t: f(l.t) };
    } catch (e) {
      return l;
    }
  };
  // 那一页的按钮要让开底下横条：框里的 env(safe-area-inset-bottom) 是 0，这边量好了递进去（同并蒂莲，只是隔开了不能直接写）
  const setup = () => {
    const L = latest.current;
    post({
      qx: "setup",
      send: `发给${HIS_NAME}`,
      noSend: !L.canSend,
      empty: !hasLots(L.pool),
      emptyHint: "先在右上角导入签库",
      safeT: safeTopPx(),
      safeB: px("var(--kfs-sab)"),
    });
  };

  useEffect(() => {
    let gone = false;
    // 转繁体那一包（藏音匣也用它，一兆上下）：点进来就去取，锦盒抽一签要十来秒，卷轴出来以前一般就到了
    loadS2T().then(
      (m) => {
        if (gone) return;
        trad.current = m.toTrad;
        if (cur.current) post({ qx: "lines", lines: cur.current.lines.map(tr) });
      },
      () => {}
    );
    const onMsg = async (e) => {
      const f = frame.current;
      const m = e.data || {};
      if (!f || e.source !== f.contentWindow || m.tk !== token.current) return;
      const L = latest.current;
      if (m.qx === "hello") setup();
      else if (m.qx === "ready") {
        setState("live");
        setup();
      } else if (m.qx === "fail") setState("fail");
      else if (m.qx === "lost") {
        // 画好以后画布被收走（iPhone 切到后台、内存紧）：框重建一回，卷轴上那一签就没了；重建多了还不行就算了
        cur.current = null;
        if (L.gen < REBUILD_MAX) {
          setGen((g) => g + 1);
          setState("loading");
        } else setState("fail");
      } else if (m.qx === "start") {
        const lines = drawLots(L.pool, phoneRng());
        cur.current = { coin: Number(m.coin) || 0, lines };
        post({ qx: "lines", lines: lines.map(tr) });
      } else if (m.qx === "reroll") {
        const c = cur.current;
        const i = Number(m.i);
        if (!c || !c.lines[i]) return;
        const line = rerollLine(L.pool, c.lines[i], phoneRng());
        c.lines = c.lines.map((l, k) => (k === i ? line : l));
        post({ qx: "line", i, line: tr(line) });
      } else if (m.qx === "send") {
        const c = cur.current;
        const ok = !!(c && c.lines.length) && L.canSend && (await L.sendLot({ coin: c.coin, lines: c.lines }));
        post({ qx: ok ? "sent" : "unsent" });
      } else if (m.qx === "empty") setSheet(true);
      else if (m.qx === "idle") cur.current = null;
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("resize", setup);
    window.addEventListener("kfs-kb", setup);
    // 网页底色这会儿换成跟那一页一样的深红黑（同并蒂莲：底下空一条的手机，系统画的那条取网页底色）
    const r = document.documentElement, b = document.body;
    const was = [r.style.backgroundColor, b.style.backgroundColor];
    r.style.backgroundColor = b.style.backgroundColor = "#140806";
    return () => {
      gone = true;
      window.removeEventListener("message", onMsg);
      window.removeEventListener("resize", setup);
      window.removeEventListener("kfs-kb", setup);
      r.style.backgroundColor = was[0];
      b.style.backgroundColor = was[1];
    };
  }, []);

  // 这一个框十五秒还没画出来：问一声那一页还在不在。不在（开封府在手机上放久了，那一页的名字早换了、旧的删了）说取不到；
  // 在就是网慢，说一句，框照旧等着
  useEffect(() => {
    let gone = false;
    const t = setTimeout(() => {
      fetch(QX_URL, { method: "HEAD", cache: "no-store" })
        .then((r) => r.status)
        .catch(() => 0)
        .then((code) => {
          if (!gone) setState((s) => (s === "loading" ? (code === 404 ? "gone" : "slow") : s));
        });
    }, WAIT_MS);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [gen]);

  // 签库空了、导进来了，翻到了狐宇宙：告诉那一页（空着的时候点锦盒不开抽）
  const empty = !hasLots(pool);
  useEffect(() => {
    if (state === "live") setup();
  }, [empty, canSend, state]);

  const dead = state === "fail" || state === "gone";
  return (
    <div className="kfs-qx kfs-fade absolute inset-0" style={{ zIndex: 60, background: "#140806" }}>
      {!dead && (
        <iframe
          key={gen}
          ref={frame}
          src={QX_URL}
          name={token.current}
          sandbox="allow-scripts"
          title="秘戏钱匣"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0, display: "block", background: "#140806" }}
        />
      )}
      {NOTE[state] && (
        <div
          className="kfs-qx-note absolute inset-x-0 text-center"
          style={{ top: "44%", padding: "0 36px", color: "#f7e6c6", fontFamily: SONG, fontSize: 15, letterSpacing: "0.1em", lineHeight: 1.8, pointerEvents: "none" }}
        >
          {NOTE[state]}
        </div>
      )}
      <button onClick={onClose} aria-label="关闭" className="kfs-qx-close kfs-tap" style={{ ...ROUND, left: "calc(env(safe-area-inset-left) + 12px)", width: 38 }}>
        <Icon name="x" size={18} />
      </button>
      <button
        onClick={() => setSheet(true)}
        className="kfs-qx-pool kfs-tap"
        style={{ ...ROUND, right: "calc(env(safe-area-inset-right) + 12px)", padding: "0 16px 0 calc(16px + 0.3em)", fontFamily: SONG, fontSize: 14, letterSpacing: "0.3em" }}
      >
        签库
      </button>
      {sheet && <QxPoolSheet pool={pool} onPool={onPool} onClose={() => setSheet(false)} />}
    </div>
  );
}
