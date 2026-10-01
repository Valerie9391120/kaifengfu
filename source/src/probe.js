// =====================================================
// 量一量屏幕底下：看这台手机上网页到底画得到哪儿
// 有的 iOS 在主屏幕上最底下空一条（见 main.jsx）。网上有人说把整页撑到 100vh 就能铺满，
// 可在别的手机上，系统给网页的那块地方本身就矮一截，撑多高都画不出去。
// 这里临时把整页撑到屏幕那么高，在原来空着的那一条里铺一块金色：
// 露出来，说明撑高整页就能铺到底；看不见，就是系统根本没把那条给网页。截图看一眼就知道。
// （她的手机 2026 年 10 月 1 日量过：金色露出来了。）
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
    mode: document.documentElement.getAttribute("data-kfs-gap") || "",
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
  // 已经撑满的话，网页量出来可能不再矮了；这个毛病空的正好是顶上安全区那么高
  const gap = Math.max(0, full - n.inner) || (n.mode ? n.top : 0);
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
    ? "看屏幕最底下：露出金色，说明撑高整页就能铺到底；没有金色、只有灰绿，就是系统没把那条给网页。截个图给我，再点关掉。"
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
    ["量出空一条", n.mode === "fill" ? `是，空 ${gap}，已撑满` : n.mode === "bottom" ? `是，空 ${gap}，够不着` : "否"],
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

  if (gap) {
    // 跟着页面走，在整页最底下，正好落在原来空着的那一条里
    el.appendChild(
      box(
        `position:absolute;left:0;right:0;bottom:0;height:${gap}px;background:#C9A24B;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center`,
        "金色：原来空着的那一条"
      )
    );
  }
  document.body.appendChild(el);
}
