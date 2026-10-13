/* global __KFS_MIRROR__ */
import { useEffect, useRef, useState } from "react";
import { SERIF } from "./ui/style.js";

// =========================================================
//   黑夜的开屏：镜碎入月（卿卿 2026 年 10 月 12 日拿来的，项目外的 Claude 做的；见开发说明“镜碎入月”那节）
//   她定的：点一下，整面镜子碎开，镜头穿过镜框落进月相之海；这时候再点一下才进门，不点月亮们就一直流着。
//   开头那片奶白留着，不压暗。
//
//   那一页（static/mirror.html，tools/make_mirror.py 生成）两兆多，用框装着，和并蒂莲一个路子：
//   - 先摆一张定格图（static/splash-heiye.webp，那一页刚飘起来那一下），那一页读完、画出来了自己淡进来盖住它；
//   - 那一页画好了、出岔子了、进了月海又点了一下，都用 postMessage 告诉这儿（ready / fail / enter）；
//   - 开屏是进门的唯一一道关，不能因为好看把人关在外面：那一页说出岔子了，或者等了 12 秒还没画出来（网慢、手机画不动），
//     框整个拆掉，就剩这张定格图，底下一行“点一下进门”，点哪儿都进；
//   - 进门以后整个开屏拆掉，框跟着没了，显卡那头的东西全还回去（开封府本来就怕内存顶破）。
// =========================================================
const MIRROR_URL = typeof __KFS_MIRROR__ !== "undefined" ? __KFS_MIRROR__ : "./assets/mirror.html";
const POSTER = "./assets/splash-heiye.webp";
const WAIT_MS = 12000;
// 定格图还没出来的那一下垫的底色：定格图四周的奶白（量过，四角和中间大约这个数）
const PAPER = "#E2E0DE";

// 测试用的两个开关（存在这台手机的 localStorage 里；平常没有）：
//   kfs-mirror-still：不装那一页，直接只摆定格图（tests/look.py 拍照用，每回都一样）
//   kfs-mirror-debug：那一页的网址后面带 #debug，测试能伸手进去把时间往前拨（tests/e2e_mirror.py）
function knob(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch (e) {
    return false;
  }
}

export default function SplashHeiye({ fading, onEnter }) {
  const still0 = knob("kfs-mirror-still");
  // loading：框在读；live：那一页画出来了；still：只剩定格图（出岔子了、等太久了、或者测试说只要定格图）
  const [mode, setMode] = useState(still0 ? "still" : "loading");
  const frameRef = useRef(null);
  const entered = useRef(false);

  const enter = () => {
    if (entered.current) return;
    entered.current = true;
    onEnter();
  };

  useEffect(() => {
    if (still0) return undefined;
    const onMsg = (e) => {
      const f = frameRef.current;
      if (!f || e.source !== f.contentWindow) return;
      const t = e.data && e.data.kfsMirror;
      if (t === "ready") setMode((m) => (m === "loading" ? "live" : m));
      else if (t === "fail") setMode("still");
      else if (t === "enter") enter();
    };
    window.addEventListener("message", onMsg);
    const timer = setTimeout(() => setMode((m) => (m === "loading" ? "still" : m)), WAIT_MS);
    return () => {
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
    };
  }, []);

  const still = mode === "still";
  const src = MIRROR_URL + (knob("kfs-mirror-debug") ? "#debug" : "");

  return (
    <div
      className="kfs-splash-heiye absolute inset-0 z-50 overflow-hidden"
      data-kfs-mirror-mode={mode}
      // 给 tests/look.py：点哪一块进门、点几下。定格图点一下；那一页是点一下碎、等它落进月海（data-kfs-splash-wait 秒）再点一下
      data-kfs-splash-enter={still ? "1" : "2"}
      data-kfs-splash-wait={still ? undefined : "12"}
      onClick={still ? enter : undefined}
      style={{
        background: PAPER,
        opacity: fading ? 0 : 1,
        transition: "opacity .7s ease",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <img
        src={POSTER}
        alt=""
        draggable={false}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
      />
      {!still && (
        <iframe
          ref={frameRef}
          src={src}
          title="镜碎入月"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0, display: "block", background: "transparent" }}
        />
      )}
      {still && (
        <div
          className="kfs-heiye-still-hint"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(48px + env(safe-area-inset-bottom))",
            textAlign: "center",
            fontFamily: SERIF,
            fontSize: 14,
            letterSpacing: "0.3em",
            paddingLeft: "0.3em",
            color: "rgba(98,92,88,0.72)",
            pointerEvents: "none",
          }}
        >
          点一下进门
        </div>
      )}
    </div>
  );
}
