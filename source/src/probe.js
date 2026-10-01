// =====================================================
// 量一量屏幕底下：看这台手机上网页到底画得到哪儿
// 有的 iOS 在主屏幕上最底下空一条（见 main.jsx）。网上有人说把整页撑到 100vh 就能铺满，
// 可在别的手机上，系统给网页的那块地方本身就矮一截，撑多高都画不出去。
// 这里临时把整页撑到屏幕那么高，在空出来的那条里放两块颜色：
//   右半边金色：跟着页面走的内容（撑高整页这招管不管用）
//   左半边粉色：fixed 的内容（固定在屏幕上的东西能不能画到那儿）
// 两块都看不见，就是系统根本没把那条给网页。截图看一眼就知道。
// =====================================================

function fullHeight() {
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  return portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
}

function measure(css) {
  const e = document.createElement("div");
  e.style.cssText = `position:absolute;top:0;left:0;width:1px;height:${css};visibility:hidden;pointer-events:none`;
  document.body.appendChild(e);
  const h = e.getBoundingClientRect().height || 0;
  e.remove();
  return Math.round(h);
}

function box(css, text) {
  const e = document.createElement("div");
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

export function probeNumbers() {
  const vv = window.visualViewport;
  return {
    screen: fullHeight(),
    inner: window.innerHeight,
    client: document.documentElement.clientHeight,
    visual: vv ? Math.round(vv.height) : null,
    vh: measure("100vh"),
    lvh: measure("100lvh"),
    dvh: measure("100dvh"),
    svh: measure("100svh"),
    top: measure("env(safe-area-inset-top)"),
    bottom: measure("env(safe-area-inset-bottom)"),
    standalone: window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches,
    gap: document.documentElement.getAttribute("data-kfs-gap") === "bottom",
  };
}

export function closeProbe() {
  const el = document.getElementById("kfs-probe");
  if (el) el.remove();
  const root = document.documentElement;
  root.removeAttribute("data-kfs-probe");
  root.style.removeProperty("--kfs-probe-h");
  window.scrollTo(0, 0);
}

export function openProbe() {
  if (document.getElementById("kfs-probe")) return;
  const n = probeNumbers(); // 先量，再把整页撑高
  const full = n.screen;
  const gap = Math.max(0, full - n.inner);
  const root = document.documentElement;
  root.style.setProperty("--kfs-probe-h", full + "px");
  root.setAttribute("data-kfs-probe", "");

  const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB',sans-serif";
  const el = box(
    `position:relative;height:100%;overflow:hidden;background:linear-gradient(180deg,#E6ECE2 0%,#D6DCCD 100%);font:14px/1.7 ${SANS};color:#24332F;-webkit-user-select:text;user-select:text`
  );
  el.id = "kfs-probe";

  const card = box(
    "position:absolute;left:16px;right:16px;top:calc(env(safe-area-inset-top) + 16px);padding:16px 18px;border-radius:22px;background:rgba(255,255,255,0.72);border:1px solid rgba(255,255,255,0.9);box-shadow:0 10px 30px rgba(46,68,62,0.12)"
  );
  card.appendChild(box("font-size:19px;letter-spacing:0.08em;font-family:'Songti SC','STSong',serif;margin-bottom:6px", "量一量屏幕底下"));
  const how = gap
    ? "看屏幕最底下那一条：右边露出金色，说明撑高整页能铺到底；左边露出粉色，说明固定的东西也能画到底；两边都没颜色、只有灰绿，就是系统没把那条给网页。截个图给我，再点关掉。"
    : "这台手机量出来没有空一条，网页本来就铺到底了。截个图给我，再点关掉。";
  card.appendChild(box("font-size:13px;color:rgba(52,74,68,0.8);margin-bottom:10px", how));

  const rows = [
    ["屏幕高", n.screen],
    ["网页高 innerHeight", n.inner],
    ["可视区 visualViewport", n.visual],
    ["布局 clientHeight", n.client],
    ["100vh", n.vh],
    ["100lvh", n.lvh],
    ["100dvh", n.dvh],
    ["100svh", n.svh],
    ["顶上安全区", n.top],
    ["底下安全区", n.bottom],
    ["主屏幕打开", n.standalone ? "是" : "否"],
    ["量出空一条", n.gap ? `是，空 ${gap}` : "否"],
  ];
  const grid = box("display:grid;grid-template-columns:1fr auto;column-gap:12px;font-size:13px;font-variant-numeric:tabular-nums");
  rows.forEach(([k, v]) => {
    grid.appendChild(box("color:rgba(52,74,68,0.7)", k));
    grid.appendChild(box("text-align:right", v == null ? "量不到" : String(v)));
  });
  card.appendChild(grid);

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "关掉";
  close.setAttribute("aria-label", "关掉量屏幕");
  close.style.cssText = `margin-top:14px;width:100%;padding:11px 0;border:none;border-radius:999px;font:15px ${SANS};color:#fff;background:linear-gradient(140deg,#7BA39B 0%,#3E655E 100%)`;
  close.addEventListener("click", closeProbe);
  card.appendChild(close);
  el.appendChild(card);

  // 网页以为的最底下：贴着布局视口的底边画一条墨绿线
  el.appendChild(box("position:fixed;left:0;right:0;bottom:0;height:4px;background:#3F6A62;z-index:3"));
  el.appendChild(box("position:fixed;right:14px;bottom:10px;font-size:12px;color:#3F6A62;z-index:3", "墨绿线：网页以为的最底下"));
  if (gap) {
    // 右半边：跟着页面走，在整页最底下，正好落在空出来的那条里
    el.appendChild(
      box(
        `position:absolute;right:0;width:50%;bottom:0;height:${gap}px;background:#C9A24B;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;z-index:2`,
        "金色：页面"
      )
    );
    // 左半边：fixed，挪到网页以为的最底下再往下
    el.appendChild(
      box(
        `position:fixed;left:0;width:50%;bottom:${-gap}px;height:${gap}px;background:#D98C9A;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;z-index:2`,
        "粉色：固定"
      )
    );
  }
  document.body.appendChild(el);
}
