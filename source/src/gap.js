// =====================================================
// iOS 主屏幕底下空一条
// 有的 iOS（26 以后几个版本，WebKit Bug 301108）把主屏幕上的网页铺到状态栏底下以后，
// 网页以为自己矮了一个状态栏（innerHeight、100%、100dvh 都少一截），最底下空出一条。
// 空的这一条分两种，一打开就量，在 <html> 上记 data-kfs-gap：
//   "fill"：100vh 还是整块屏幕那么高（她的手机就是这样，2026 年 10 月 1 日用“量一量屏幕底下”量过）。
//           系统其实把整块屏幕给了网页，只是网页算矮了。把 html、body 和外壳都撑到 100vh，
//           页面和 fixed 的东西就都能画到屏幕最底下，跟系统正常时一样让开底下横条就行。
//           （只撑 fixed 的外壳、html 和 body 不撑，底下会被切掉，上回就栽在这儿。）
//   "bottom"：100vh 也少一截，系统真没把那条给网页。只能让输入框贴着网页最底边，
//           底色和系统画的那条接上（见 ui/style.js 的 DOCK_GLASS），别的页面底下加一段淡出。
// 账户面板里有个开关能把 "fill" 关掉退回 "bottom"，万一撑满在哪台手机上出毛病，她自己就能退回去。
// =====================================================

const PREF_KEY = "kfs-fill";

function readPref() {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch (e) {
    return null;
  }
}

function writePref(v) {
  try {
    if (v) localStorage.setItem(PREF_KEY, v);
    else localStorage.removeItem(PREF_KEY);
  } catch (e) {}
}

function measure(css) {
  const d = document.createElement("div");
  d.style.cssText = `position:absolute;top:0;left:0;width:1px;height:${css};visibility:hidden;pointer-events:none`;
  document.body.appendChild(d);
  const h = d.getBoundingClientRect().height || 0;
  d.remove();
  return h;
}

const orientation = () => (window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape");

function measureGap() {
  try {
    const standalone =
      window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    const full = orientation() === "portrait" ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const top = measure("env(safe-area-inset-top)");
    const g = full - window.innerHeight;
    if (!(standalone && top > 0 && g > 0 && Math.abs(g - top) <= 3)) return { mode: "" };
    // 测试里没法让浏览器真的这样，留个口子把 100vh 量出来的数换掉
    const vh = typeof window.__KFS_TEST_VH__ === "number" ? window.__KFS_TEST_VH__ : measure("100vh");
    return Math.abs(vh - full) <= 3 ? { mode: "fill", h: Math.round(vh) } : { mode: "bottom" };
  } catch (e) {
    return { mode: "" };
  }
}

function apply(r) {
  const root = document.documentElement;
  const mode = r.mode === "fill" && readPref() === "off" ? "bottom" : r.mode;
  if (mode) root.setAttribute("data-kfs-gap", mode);
  else root.removeAttribute("data-kfs-gap");
  if (mode === "fill") root.style.setProperty("--kfs-fill-h", r.h + "px");
  else root.style.removeProperty("--kfs-fill-h");
}

// 每个方向只量一次就记住：撑满以后网页量出来的高度会跟着变，再量就不准了，还会来回翻。
// 也不跟着 resize 量，键盘弹出来时网页会变矮，那不是这个毛病。
const seen = {};
export function detectGap() {
  const k = orientation();
  if (!seen[k]) seen[k] = measureGap();
  apply(seen[k]);
}

// 账户面板用：这台手机量出来能不能撑满、现在撑没撑
export function gapInfo() {
  const r = seen[orientation()] || { mode: "" };
  return { canFill: r.mode === "fill", fill: r.mode === "fill" && readPref() !== "off" };
}

export function setFill(on) {
  writePref(on ? null : "off");
  detectGap();
}

// 撑满以后整页比网页以为的高，万一被系统挪动了（比如收键盘以后没挪回来），挪回顶上。
// 键盘开着的时候不管，让 iOS 自己把输入框露出来。
function settle() {
  if (document.documentElement.getAttribute("data-kfs-gap") !== "fill") return;
  const a = document.activeElement;
  if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) return;
  if (window.scrollY !== 0 || document.documentElement.scrollTop !== 0) window.scrollTo(0, 0);
}

export function initGap() {
  detectGap();
  // 刚打开时网页的尺寸有时还没定下来；头一回没量出毛病的话，过一会儿再量一次
  setTimeout(() => {
    const k = orientation();
    if (seen[k] && !seen[k].mode) {
      seen[k] = measureGap();
      apply(seen[k]);
    }
  }, 500);
  window.addEventListener("pageshow", detectGap);
  let last = orientation();
  const onTurn = () => {
    if (orientation() === last) return;
    last = orientation();
    apply({ mode: "" }); // 先撤掉，换了方向在没撑高的样子下量
    setTimeout(detectGap, 350);
  };
  window.addEventListener("orientationchange", onTurn);
  const mq = window.matchMedia("(orientation: portrait)");
  if (mq.addEventListener) mq.addEventListener("change", onTurn);
  window.addEventListener("scroll", settle, { passive: true });
  document.addEventListener("focusout", () => setTimeout(settle, 150));
}
