// 拼豆作那一页（卿卿 2026 年 10 月 25 日要的，见开发说明“拼豆作”那一节；零件见 parts.js，样子见 style.js，画法见 draw.js）。
// build.mjs 另打成 assets/pindou-<指纹>.js，头一回点进来才取（同藏音匣）。开封府那头的壳子是 PindouPage.jsx：存档、发给他都是它办，
// 这一页只管板子上的事，要存要发的时候叫一声。
//
// 原来是官方 App 里那一页（一个文件）：拼豆、取豆、填色、吸色、左右对称、撤销重做、三种样子、双指缩放、换板子、模板、作品集、作品码、导出图片、用量。
// 搬进来改的几处：
//   存档交给开封府（她眼下这块板子、作品集都加密了跟着云端走；手上的颜色、看的样子这些习惯记在这台设备上），原来那一套“存不存得住”的自查、钉在作品集里的那一幅都拿掉了
//   （仓库是公开的，她拼的东西不进仓库；原来那一幅她拿作品码粘进来）
//   作品那一栏多一颗“发给光义”（狐宇宙里不摆，同秘戏钱匣），多一栏「他的」（他在屋里拼的，只能看）
//   颜色跟着开封府的主题走；左上角一个叉回到聊天
//   工具那一排只留图标，底下那一排字拿掉了（她 10 月 25 日 23:33 说的：“感觉十分拥挤 而且功能很清晰了其实”；读屏照样念得出名字）
import { CSS } from "./style.js";
import { makeSprite, paintWork, rrect, boundsOf } from "./draw.js";
import { PALETTE, SIZES, CUSTOM_MAX, COLOR_MAX, PD_PREFS, readPrefs, packPrefs, colorName, normHex, isHex, countBeads, usageOf, toCode, fromCode, resizeGrid, floodGrid, cleanName } from "./parts.js";

const PAL = PALETTE.map((c) => [c.name, c.hex]);
const NAME = new Map(PAL.map(([n, h]) => [h, n]));
const EXPORT_BOARD = "#F5F6F8";
const EXPORT_PEG = "#DCDFE5";

// 四个模板（官方 App 里那一份带过来的；一个字母一种颜色，点是空的）
const TK = { k: "#1F1D24", w: "#FBFBF8", h: "#63402B", s: "#F5C6A5", p: "#F6A3BC", m: "#8E5636", M: "#E0457D", b: "#2A57C4", d: "#5C5F69", o: "#EE7A2D", i: "#FFD4DF", v: "#6C3FA1", y: "#E2AC2B", g: "#9A9CA6", G: "#C7C9D0", n: "#F6A3BC", P: "#F6A3BC", r: "#FFD4DF" };
const TEMPLATES = [
  { name: "小人底模", rows: ["........................", "........kkkkkkkk........", ".......khhhhhhhhk.......", "......khhhhhhhhhhk......", ".....khhhhhhhhhhhhk.....", "....khhhhhhhhhhhhhhk....", "...khhhhhhhhhhhhhhhhk...", "...khhhhhhhhhhhhhhhhk...", "...khhhhhhhhhhhhhhhhk...", "...khhshhshhhhshhshhk...", "...khhsssssssssssshhk...", "....khsskwsssskwsshk....", "....khsskksssskksshk....", ".....khpsssmmsssphk.....", "......kksssssssskk......", ".......kwwwwwwwwk.......", "......kwwwwwwwwwwk......", ".....kswwwwwwwwwwsk.....", ".....kskwwwwwwwwksk.....", "......kkbbbbbbbbkk......", ".......kbbbkkbbbk.......", ".......kdddkkdddk.......", "........kkk..kkk........", "........................"] },
  { name: "官家狐狐", rows: ["........................", "........................", ".........kkkkkk.........", "....k...kkkkkkkk...k....", "...kok..kkkkkkkk..kok...", "kkkkookkkkkkkkkkkkookkkk", "...koiokkkkkkkkkkoiok...", "...koiookkkkkkkkooiok...", "...koiiooooooooooiiok...", "...koiooooooooooooiok...", "...kooooooooooooooook...", "....koookooooookoook....", "...koookokooookokoook...", "...kooooooooooooooook...", "..kwwooowwwkkwwwooowwk..", "...kwwpwwwwwwwwwwpwwk...", "....kkkwwwwwwwwwwkkk....", ".......kwwwwwwwwk.......", ".......kkkkwwkkkk.......", "......kvvvvvvvvvvk......", "......kvvvvvvvvvvk......", ".....kyyyyyyyyyyyyk.....", ".....kvvvvvvvvvvvvk.....", "......kkkkkkkkkkkk......"] },
  { name: "小猪狐", rows: ["........................", "........................", "........................", "....k..............k....", "...kok............kok...", "...kook..........kook...", "...koiok.kkkkkk.koiok...", "...koiookPPPPPPkooiok...", "...koiiPPPPPPPPPPiiok...", "...koiPPPPPPPPPPPPiok...", "...koPPPPPPPPPPPPPPok...", "....kPPPPPPPPPPPPPPk....", "....kPPPkPPPPPPkPPPk....", "....kPPPkPPPPPPkPPPk....", "....kPPPPPrrrrPPPPPkk...", "....kPMPPrMrrMrPPMPwwk..", ".....kPPPrrrrrrPPPkwwwk.", "......kPPPPrrPPPPkooook.", ".......kkPPPPPPkkkooook.", ".......kPPPPPPPPkkooook.", "......kPPPPrrPPPPkooook.", "......kPPPPPPPPPPkkook..", ".......kkkkkkkkkk..kk...", "........................"] },
  { name: "鼠鼠", rows: ["........................", "........................", "...kkkkk........kkkkk...", "..kgggggk......kgggggk..", ".kgggggggk....kgggggggk.", ".kggrrrrgk....kgrrrrggk.", ".kggrrrrgkkkkkkgrrrrggk.", ".kggrrrrggggggggrrrrggk.", ".kggrrrggggggggggrrrggk.", "..kggggggggggggggggggk..", "...kkggggggggggggggkk...", "....kggggggggggggggk....", "....kgggkggggggkgggk....", "....kgggkggggggkgggk....", ".dddkgggggGnnGgggggkddd.", "....kgpggGGGGGGggpgk....", "..dddkgggGGGGGGgggkddd..", "......kggggGGggggk..P...", ".......kkggggggkk....P..", ".......kPPPPPPPPk....P..", "......kPPwPPPPwPPk..P...", "......kPPPPwwPPPPkPP....", ".......kkkkkkkkkk.......", "........................"] },
];

const ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>',
  fill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></svg>',
  picker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>',
  mirror: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/></svg>',
};

const TEMPLATE = `
<div class="pd-scroll">
<div class="pd-app">
  <header class="pd-top">
    <button type="button" class="pd-close" aria-label="关上拼豆作">${ICON.x}</button>
    <div class="pd-title"><h1>拼豆作</h1><span class="pd-seal" aria-hidden="true">炅</span></div>
    <div class="pd-seg" data-seg="view" role="group" aria-label="显示方式">
      <button type="button" data-view="bead" class="on">拼豆</button><button type="button" data-view="fused">熨烫</button><button type="button" data-view="pixel">像素</button>
    </div>
  </header>
  <main class="pd-layout">
    <section class="pd-bench">
      <div class="pd-board">
        <div class="pd-wrap">
          <canvas class="pd-cv" role="img" aria-label="拼豆板"></canvas>
          <div class="pd-hint">单指拼豆，双指缩放和挪动</div>
          <div class="pd-zchip" hidden><span class="pd-zval">1.0×</span><button type="button" class="pd-zreset">还原</button></div>
        </div>
      </div>
      <nav class="pd-dock" aria-label="工具">
        <button type="button" class="pd-tb on" data-tool="pen" aria-label="拼豆" title="拼豆 (B)"><span class="pd-bico"></span></button>
        <button type="button" class="pd-tb" data-tool="eraser" aria-label="取豆" title="取豆 (E)">${ICON.eraser}</button>
        <button type="button" class="pd-tb" data-tool="fill" aria-label="填色" title="填色 (G)">${ICON.fill}</button>
        <button type="button" class="pd-tb" data-tool="picker" aria-label="吸色" title="吸色 (I)">${ICON.picker}</button>
        <i class="pd-sep"></i>
        <button type="button" class="pd-tb tg" data-act="mirror" aria-pressed="false" aria-label="左右对称" title="左右对称 (M)">${ICON.mirror}</button>
        <i class="pd-sep"></i>
        <button type="button" class="pd-tb" data-act="undo" aria-label="撤销" title="撤销 (Ctrl+Z)" disabled>${ICON.undo}</button>
        <button type="button" class="pd-tb" data-act="redo" aria-label="重做" title="重做 (Ctrl+Shift+Z)" disabled>${ICON.redo}</button>
      </nav>
    </section>
    <section class="pd-panel">
      <div class="pd-tabs" role="tablist">
        <button type="button" role="tab" data-tab="pal" class="on" aria-selected="true">色板</button>
        <button type="button" role="tab" data-tab="board" aria-selected="false">画板</button>
        <button type="button" role="tab" data-tab="works" aria-selected="false">作品</button>
        <button type="button" role="tab" data-tab="his" aria-selected="false">他的</button>
        <button type="button" role="tab" data-tab="use" aria-selected="false">用量<span class="pd-badge"></span></button>
      </div>
      <div class="pd-pane on" data-pane="pal">
        <div class="pd-pal"></div>
        <div class="pd-palfoot"><span>手上的颜色 <b class="pd-palname"></b></span><button type="button" class="pd-link" data-act="clear-custom" hidden>清空自己调的颜色</button></div>
      </div>
      <div class="pd-pane" data-pane="board">
        <div class="pd-blk"><h3>板子多大</h3><div class="pd-chips pd-sizes"></div><p class="pd-note">29×29 是最常见的大方板。换了尺寸，拼好的居中挪过去。</p></div>
        <div class="pd-blk"><h3>从模板开始</h3><div class="pd-tpls"></div><p class="pd-note">小人底模的头发和衣服：挑好颜色，用「填色」点一下，整块就换了。</p></div>
        <div class="pd-blk">
          <div class="pd-row"><span>辅助线（每 5 格一条，加中线）</span><button type="button" class="pd-switch" data-act="guides" role="switch" aria-checked="false" aria-label="辅助线"><i></i></button></div>
          <div class="pd-row"><span>缩放</span><div class="pd-zbtns"><button type="button" class="pd-btn soft" data-act="zout">缩小</button><button type="button" class="pd-btn soft" data-act="zfit">全板</button><button type="button" class="pd-btn soft" data-act="zin">放大</button></div></div>
        </div>
        <div class="pd-blk"><button type="button" class="pd-btn warn pd-wide" data-act="clear">清空画板</button></div>
      </div>
      <div class="pd-pane" data-pane="works">
        <div class="pd-saverow"><input class="pd-name" maxlength="24" placeholder="给这一幅起个名字" enterkeyhint="done" autocomplete="off"><button type="button" class="pd-btn" data-act="save">存进作品集</button></div>
        <button type="button" class="pd-btn pd-wide pd-send" data-act="send">发给光义</button>
        <div class="pd-btnrow">
          <button type="button" class="pd-btn soft" data-act="copy-code">复制作品码</button>
          <button type="button" class="pd-btn soft" data-act="paste-code">粘贴作品码</button>
          <button type="button" class="pd-btn soft" data-act="export">导出图片</button>
        </div>
        <div class="pd-works"></div>
        <p class="pd-empty pd-works-empty" hidden>作品集还空着。拼好一幅，起个名字存进来；在别处复制的作品码，点「粘贴作品码」贴进来。</p>
      </div>
      <div class="pd-pane" data-pane="his"><div class="pd-his"></div></div>
      <div class="pd-pane" data-pane="use"><div class="pd-usage"></div></div>
    </section>
  </main>
  <p class="pd-foot">文思院出品，官家监制，十二点前收工。</p>
</div>
</div>
<div class="pd-toast" role="status" aria-live="polite"><span class="pd-tmsg"></span><button type="button" class="pd-tact" hidden></button></div>
<div class="pd-modal" data-modal="export" hidden>
  <div class="pd-sheet" role="dialog" aria-modal="true" aria-label="导出图片">
    <div class="pd-sheet-head"><b>导出图片</b><button type="button" class="pd-mini" data-act="close-modal">关闭</button></div>
    <div class="pd-seg" data-seg="bg"><button type="button" data-bg="board" class="on">带底板</button><button type="button" data-bg="clear">透明底，只要图案</button></div>
    <div class="pd-exwrap"><img class="pd-eximg" alt="导出的拼豆图"></div>
    <div class="pd-exfoot"><span>长按图片存到相册</span><a class="pd-link pd-exdl" download="拼豆.png" href="#">下载 PNG</a></div>
  </div>
</div>
<div class="pd-modal" data-modal="code" hidden>
  <div class="pd-sheet" role="dialog" aria-modal="true" aria-label="作品码">
    <div class="pd-sheet-head"><b class="pd-ctitle">作品码</b><button type="button" class="pd-mini" data-act="close-modal">关闭</button></div>
    <p class="pd-note pd-cnote"></p>
    <textarea class="pd-code" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
    <p class="pd-cerr" hidden></p>
    <div class="pd-sheet-foot"><button type="button" class="pd-btn pd-wide" data-act="code-go">复制</button></div>
  </div>
</div>
<div class="pd-modal" data-modal="view" hidden>
  <div class="pd-sheet" role="dialog" aria-modal="true" aria-label="看大图">
    <div class="pd-sheet-head"><b class="pd-vtitle"></b><button type="button" class="pd-mini" data-act="close-modal">关闭</button></div>
    <div class="pd-big"><canvas class="pd-vcv"></canvas></div>
    <p class="pd-bigmeta"></p>
  </div>
</div>`;

let styled = false;
function ensureStyles() {
  if (styled) return;
  styled = true;
  const st = document.createElement("style");
  st.setAttribute("data-kfs", "pindou");
  st.textContent = CSS;
  document.head.appendChild(st);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// 这台设备上的习惯（见 parts.js 的 readPrefs）。localStorage 用不了（隐私模式、存满了）就当没有
function loadPrefs() {
  try {
    return readPrefs(localStorage.getItem(PD_PREFS));
  } catch (e) {
    return readPrefs(null);
  }
}
// 从主屏幕上打开的开封府（没有地址栏、没有返回）：点“下载 PNG”会跳到那张图上回不来，那一颗不摆，长按图片存
function standalone() {
  try {
    return !!(window.navigator.standalone || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches));
  } catch (e) {
    return false;
  }
}
const fmtDate = (t) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
const fmtTime = (t) => {
  const d = new Date(t);
  return `${fmtDate(t)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const nameOfHex = (h) => NAME.get(h) || colorName(h);

// api：{ state（parts.js 的 readState，没有就是 null）, works（listWorks）, his（readHis，没有就是 null）, wake（“他自己醒”开着没有）, canSend,
//        onState({ n, g, custom }, rev)（她这块板子真动了，存下来；rev 是眼下这块是从存着的哪一份接着拼的）→ { rev, kept }（存成的那一份的记号；
//          别的设备后来又拼过、那一份存进了作品集：kept）, onSave({ name, code }) → 存成了没有, onDelete(id), onSend({ name, code }) → 发成了没有, onClose() }
// 回 { update({ works, his, wake, canSend, state }), destroy() }：state 是同步下来的板子（别的设备上拼的）
export function mountBoard(root, api) {
  ensureStyles();
  root.classList.add("kfs-pindou");
  root.innerHTML = TEMPLATE;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));
  let dead = false;
  const cleanups = [];
  const on = (el, ev, fn, opt) => {
    el.addEventListener(ev, fn, opt);
    cleanups.push(() => el.removeEventListener(ev, fn, opt));
  };

  // ---------- 状态 ----------
  // 板子跟着云端走（App.jsx 递进来）；习惯记在这台设备上
  const st0 = api.state || null;
  const pf0 = loadPrefs();
  let N = st0 ? st0.n : 24;
  let grid = st0 ? st0.g.slice() : new Array(N * N).fill(null);
  let rev = st0 ? st0.r : ""; // 眼下这块是存着的哪一份（存的时候交给 App.jsx 认一认，见 savePdState）
  let tool = pf0.tool;
  let color = pf0.color;
  let mirror = pf0.mirror;
  let view = pf0.view;
  let guides = pf0.guides;
  let hintSeen = pf0.hint;
  let customColors = st0 ? st0.custom.slice() : [];
  for (const v of grid) if (v && !NAME.has(v) && !customColors.includes(v)) customColors.push(v);
  let zoom = 1;
  let ox = 0;
  let oy = 0;
  let undoStack = [];
  let redoStack = [];
  let tab = "pal";
  let works = api.works || [];
  let his = api.his || null;
  let wake = !!api.wake;
  let canSend = !!api.canSend;
  let sentCode = ""; // 刚发过的那一幅（板子没再动就写“已发”，不发两回）
  let curName = ""; // 眼下这一幅叫什么（存进作品集的时候起的、从作品集里打开的那一幅的名字）：发给他的时候名字框空着就用它

  // ---------- 画布 ----------
  const wrap = $(".pd-wrap");
  const cv = $(".pd-cv");
  const ctx = cv.getContext("2d");
  const spriteCache = new Map();
  let spriteSize = 0;
  let V = 0;
  let dpr = 1;
  const theme = {};
  function readTheme() {
    const cs = getComputedStyle(root);
    const g = (k, d) => cs.getPropertyValue(k).trim() || d;
    theme.board = g("--board", "#CEE2DA");
    theme.peg = g("--peg", "#B4CDC2");
    theme.checkA = g("--check-a", "#D5E8E0");
    theme.checkB = g("--check-b", "#C6DCD3");
    theme.accent = g("--accent", "#3F6A62");
  }
  const cellSize = () => (V / N) * zoom;
  const maxZoom = () => clamp((44 * N) / Math.max(V, 1), 1, 6);
  function clampPan() {
    const max = Math.max(0, N * cellSize() - V);
    ox = clamp(ox, 0, max);
    oy = clamp(oy, 0, max);
  }
  function layout() {
    const w = wrap.clientWidth;
    if (!w) return;
    const ratio = V ? w / V : 1;
    V = w;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.round(V * dpr);
    if (cv.width !== px || cv.height !== px) {
      cv.width = px;
      cv.height = px;
    }
    ox *= ratio;
    oy *= ratio;
    zoom = clamp(zoom, 1, maxZoom());
    clampPan();
    spriteCache.clear();
    updateZoomUI();
    render();
  }
  function sprite(hex) {
    const S = Math.max(4, Math.ceil((cellSize() * dpr) / 2) * 2);
    if (S !== spriteSize) {
      spriteCache.clear();
      spriteSize = S;
    }
    const key = view + hex;
    let s = spriteCache.get(key);
    if (!s) {
      s = makeSprite(hex, view, S);
      spriteCache.set(key, s);
    }
    return s;
  }
  let raf = 0;
  const requestRender = () => {
    if (!raf && !dead)
      raf = requestAnimationFrame(() => {
        raf = 0;
        render();
      });
  };
  function render() {
    if (!V || dead) return;
    const c = cellSize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.board;
    ctx.fillRect(0, 0, cv.width, cv.height);
    const x0 = Math.max(0, Math.floor(ox / c));
    const x1 = Math.min(N - 1, Math.floor((ox + V) / c));
    const y0 = Math.max(0, Math.floor(oy / c));
    const y1 = Math.min(N - 1, Math.floor((oy + V) / c));
    if (view === "pixel") {
      for (let y = y0; y <= y1; y++) {
        const T = Math.round((y * c - oy) * dpr);
        const B = Math.round(((y + 1) * c - oy) * dpr);
        for (let x = x0; x <= x1; x++) {
          const L = Math.round((x * c - ox) * dpr);
          const R = Math.round(((x + 1) * c - ox) * dpr);
          const v = grid[y * N + x];
          ctx.fillStyle = v || ((x + y) & 1 ? theme.checkB : theme.checkA);
          ctx.fillRect(L, T, R - L, B - T);
        }
      }
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (view === "bead") {
        const pr = c * 0.16;
        ctx.beginPath();
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            if (grid[y * N + x]) continue;
            const cx = x * c - ox + c / 2;
            const cy = y * c - oy + c / 2;
            ctx.moveTo(cx + pr, cy);
            ctx.arc(cx, cy, pr, 0, Math.PI * 2);
          }
        ctx.fillStyle = theme.peg;
        ctx.fill();
      }
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const v = grid[y * N + x];
          if (v) ctx.drawImage(sprite(v), x * c - ox, y * c - oy, c, c);
        }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlays(c);
  }
  function drawOverlays(c) {
    const full = N * c;
    if (guides) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(90,100,110,.38)";
      ctx.beginPath();
      for (let k = 5; k < N; k += 5) {
        const p = Math.round(k * c - ox);
        const q = Math.round(k * c - oy);
        if (p > 0 && p < V) {
          ctx.moveTo(p, 0);
          ctx.lineTo(p, V);
        }
        if (q > 0 && q < V) {
          ctx.moveTo(0, q);
          ctx.lineTo(V, q);
        }
      }
      ctx.stroke();
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = theme.accent;
      ctx.globalAlpha = 0.6;
      const cx = full / 2 - ox;
      const cy = full / 2 - oy;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, V);
      ctx.moveTo(0, cy);
      ctx.lineTo(V, cy);
      ctx.stroke();
      ctx.restore();
    }
    if (mirror) {
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = theme.accent;
      ctx.globalAlpha = 0.9;
      const cx = full / 2 - ox;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, V);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- 拼、取、填 ----------
  // 一块板子最多 COLOR_MAX 种颜色（作品码一种颜色一个字母，再多写不下，存不住）：板子上已经这么多种了，再拼一种新的不让放，说一声
  function roomFor(v) {
    if (!v || grid.includes(v)) return true;
    const used = new Set();
    for (const c of grid) if (c) used.add(c);
    if (used.size < COLOR_MAX) return true;
    toast(`一块板子最多 ${COLOR_MAX} 种颜色，「${nameOfHex(v)}」放不上了，先用板子上有的颜色吧`);
    return false;
  }
  function setCell(x, y, v) {
    const i = y * N + x;
    if (grid[i] === v) return false;
    grid[i] = v;
    return true;
  }
  function paintAt(x, y) {
    const v = tool === "eraser" ? null : color;
    let ch = setCell(x, y, v);
    if (mirror) {
      const mx = N - 1 - x;
      if (mx !== x && setCell(mx, y, v)) ch = true;
    }
    return ch;
  }
  function line(x0, y0, x1, y1, fn) {
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      fn(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  function pushUndo(snap, n) {
    undoStack.push({ n, g: snap });
    if (undoStack.length > 150) undoStack.shift();
    redoStack.length = 0;
    updateUndoUI();
  }
  function restore(s) {
    if (s.n !== N) {
      N = s.n;
      zoom = 1;
      ox = oy = 0;
      spriteCache.clear();
      renderSizes();
      updateZoomUI();
    }
    grid = s.g;
    requestRender();
    afterChange();
    updateUndoUI();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push({ n: N, g: grid });
    restore(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push({ n: N, g: grid });
    restore(redoStack.pop());
  }
  function updateUndoUI() {
    $('[data-act="undo"]').disabled = !undoStack.length;
    $('[data-act="redo"]').disabled = !redoStack.length;
  }
  function afterChange() {
    updateCount();
    updateSend();
    if (tab === "use") renderUsage();
    scheduleSave();
  }
  function updateCount() {
    const n = countBeads(grid);
    $(".pd-badge").textContent = n ? String(n) : "";
  }

  // ---------- 手指 ----------
  const pointers = new Map();
  let mode = null;
  let stroke = null;
  let gest = null;
  let tapCell = null;
  let blockUntilUp = false;
  function posOf(e) {
    const r = cv.getBoundingClientRect();
    const k = V / (r.width || V);
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }
  function cellAt(e) {
    const p = posOf(e);
    const c = cellSize();
    const x = Math.floor((p.x + ox) / c);
    const y = Math.floor((p.y + oy) / c);
    return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
  }
  on(cv, "pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      cv.setPointerCapture(e.pointerId);
    } catch (er) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    hideHint();
    if (pointers.size === 2) {
      cancelAction();
      startGesture();
      return;
    }
    if (pointers.size > 2 || blockUntilUp) return;
    const p = cellAt(e);
    if (tool === "pen" || tool === "eraser") {
      if (tool === "pen" && !roomFor(color)) return;
      mode = "draw";
      stroke = { snap: grid.slice(), changed: false, last: p };
      if (p && paintAt(p.x, p.y)) stroke.changed = true;
      requestRender();
    } else {
      mode = "tap";
      tapCell = p;
    }
  });
  on(cv, "pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === "gesture") {
      moveGesture();
      return;
    }
    if (mode !== "draw" || !stroke) return;
    const list = (typeof e.getCoalescedEvents === "function" && e.getCoalescedEvents()) || [];
    const evs = list.length ? list : [e];
    for (const ev of evs) {
      const p = cellAt(ev);
      if (!p) {
        stroke.last = null;
        continue;
      }
      const last = stroke.last;
      if (last && last.x === p.x && last.y === p.y) continue;
      if (last)
        line(last.x, last.y, p.x, p.y, (x, y) => {
          if (paintAt(x, y)) stroke.changed = true;
        });
      else if (paintAt(p.x, p.y)) stroke.changed = true;
      stroke.last = p;
    }
    requestRender();
  });
  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (mode === "gesture") {
      if (pointers.size >= 2) startGesture();
      else {
        mode = null;
        gest = null;
        blockUntilUp = pointers.size > 0;
      }
      return;
    }
    if (pointers.size === 0) blockUntilUp = false;
    if (mode === "draw") finishStroke();
    else if (mode === "tap" && e.type === "pointerup") doTap(tapCell);
    mode = null;
    tapCell = null;
  }
  on(cv, "pointerup", endPointer);
  on(cv, "pointercancel", endPointer);
  on(cv, "contextmenu", (e) => e.preventDefault());
  function finishStroke() {
    if (stroke && stroke.changed) {
      pushUndo(stroke.snap, N);
      afterChange();
    }
    stroke = null;
  }
  function cancelAction() {
    if (mode === "draw" && stroke && stroke.changed) {
      grid = stroke.snap;
      requestRender();
    }
    stroke = null;
    tapCell = null;
    mode = null;
  }
  function doTap(p) {
    if (!p) return;
    if (tool === "fill") {
      if (!roomFor(color)) return;
      const snap = grid.slice();
      let ch = floodGrid(N, grid, p.x, p.y, color) > 0;
      if (mirror && floodGrid(N, grid, N - 1 - p.x, p.y, color) > 0) ch = true;
      if (ch) {
        pushUndo(snap, N);
        afterChange();
        requestRender();
      }
    } else if (tool === "picker") {
      const v = grid[p.y * N + p.x];
      if (v) {
        selectColor(v);
        setTool("pen");
        toast(`吸到了「${nameOfHex(v)}」`);
      } else toast("这一格还没有豆子");
    }
  }
  const pair = () => {
    const it = pointers.values();
    return [it.next().value, it.next().value];
  };
  function startGesture() {
    mode = "gesture";
    const [a, b] = pair();
    const r = cv.getBoundingClientRect();
    const k = V / (r.width || V);
    const mx = ((a.x + b.x) / 2 - r.left) * k;
    const my = ((a.y + b.y) / 2 - r.top) * k;
    const c = cellSize();
    gest = { d0: Math.max(12, Math.hypot(a.x - b.x, a.y - b.y)), z0: zoom, bx: (mx + ox) / c, by: (my + oy) / c };
  }
  function moveGesture() {
    if (!gest || pointers.size < 2) return;
    const [a, b] = pair();
    const r = cv.getBoundingClientRect();
    const k = V / (r.width || V);
    const mx = ((a.x + b.x) / 2 - r.left) * k;
    const my = ((a.y + b.y) / 2 - r.top) * k;
    const d = Math.max(12, Math.hypot(a.x - b.x, a.y - b.y));
    zoom = clamp((gest.z0 * d) / gest.d0, 1, maxZoom());
    const c = cellSize();
    ox = gest.bx * c - mx;
    oy = gest.by * c - my;
    clampPan();
    updateZoomUI();
    requestRender();
  }
  function zoomTo(z, mx, my) {
    if (mx === undefined) {
      mx = V / 2;
      my = V / 2;
    }
    const c0 = cellSize();
    const bx = (mx + ox) / c0;
    const by = (my + oy) / c0;
    zoom = clamp(z, 1, maxZoom());
    const c = cellSize();
    ox = bx * c - mx;
    oy = by * c - my;
    clampPan();
    updateZoomUI();
    requestRender();
  }
  function resetZoom() {
    zoom = 1;
    ox = oy = 0;
    updateZoomUI();
    requestRender();
  }
  let zIdleT = 0;
  function updateZoomUI() {
    const zoomed = zoom > 1.01;
    const chip = $(".pd-zchip");
    chip.hidden = !zoomed;
    chip.classList.remove("idle");
    clearTimeout(zIdleT);
    if (zoomed) zIdleT = setTimeout(() => chip.classList.add("idle"), 2500);
    $(".pd-zval").textContent = zoom.toFixed(1) + "×";
    $('[data-act="zin"]').disabled = zoom >= maxZoom() - 0.01;
    $('[data-act="zout"]').disabled = !zoomed;
    $('[data-act="zfit"]').disabled = !zoomed;
  }
  on(
    cv,
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const p = posOf(e);
        zoomTo(zoom * Math.exp(-e.deltaY * 0.01), p.x, p.y);
      } else if (zoom > 1.01) {
        e.preventDefault();
        ox += e.deltaX;
        oy += e.deltaY;
        clampPan();
        requestRender();
      }
    },
    { passive: false }
  );

  // ---------- 工具、颜色、样子 ----------
  function setTool(t) {
    tool = t;
    $$("[data-tool]").forEach((b) => {
      const o = b.dataset.tool === t;
      b.classList.toggle("on", o);
      b.setAttribute("aria-pressed", String(o));
    });
    savePrefs();
  }
  function selectColor(h) {
    color = h;
    $(".pd-bico").style.setProperty("--c", h);
    $$(".pd-pal .pd-cell[data-hex]").forEach((el) => el.classList.toggle("on", el.dataset.hex === h));
    $(".pd-palname").textContent = nameOfHex(h);
    savePrefs();
  }
  function setMirror(v) {
    mirror = v;
    const b = $('[data-act="mirror"]');
    b.classList.toggle("on", v);
    b.setAttribute("aria-pressed", String(v));
    requestRender();
    savePrefs();
  }
  function setGuides(v) {
    guides = v;
    $('[data-act="guides"]').setAttribute("aria-checked", String(v));
    requestRender();
    savePrefs();
  }
  function setView(v) {
    view = v;
    $$('[data-seg="view"] button').forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    requestRender();
    savePrefs();
  }
  function setTab(t) {
    tab = t;
    $$(".pd-tabs [data-tab]").forEach((b) => {
      const o = b.dataset.tab === t;
      b.classList.toggle("on", o);
      b.setAttribute("aria-selected", String(o));
    });
    $$(".pd-pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === t));
    if (t === "use") renderUsage();
    if (t === "his") renderHis();
  }

  function renderPalette() {
    const el = $(".pd-pal");
    el.textContent = "";
    const items = PAL.concat(customColors.map((h) => [`自己调的 ${h}`, h]));
    for (const [n, h] of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pd-cell" + (h === color ? " on" : "");
      b.dataset.hex = h;
      b.title = n;
      b.setAttribute("aria-label", n);
      const bd = document.createElement("span");
      bd.className = "bd";
      bd.style.setProperty("--c", h);
      b.appendChild(bd);
      b.addEventListener("click", () => {
        selectColor(h);
        if (tool !== "fill") setTool("pen");
      });
      el.appendChild(b);
    }
    const add = document.createElement("label");
    add.className = "pd-cell add";
    add.title = "自己调一个颜色";
    add.innerHTML = '<span aria-hidden="true">+</span><input type="color" aria-label="自己调一个颜色">';
    const inp = add.querySelector("input");
    inp.value = color.toLowerCase();
    inp.addEventListener("change", () => addCustom(inp.value));
    el.appendChild(add);
    $(".pd-palname").textContent = nameOfHex(color);
    $('[data-act="clear-custom"]').hidden = !customColors.length;
  }
  function addCustom(v) {
    const h = normHex(v);
    if (!isHex(h)) return;
    let added = false;
    if (!NAME.has(h) && !customColors.includes(h)) {
      customColors.push(h);
      if (customColors.length > CUSTOM_MAX) customColors.shift();
      added = true;
    }
    color = h;
    renderPalette();
    selectColor(h);
    if (tool !== "fill") setTool("pen");
    if (added) scheduleSave(); // 自己调的颜色跟着板子存（换到别的设备上也在）
    toast("加进色板了");
  }

  // ---------- 画板那一栏 ----------
  function renderSizes() {
    const el = $(".pd-sizes");
    el.textContent = "";
    for (const n of SIZES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pd-chip" + (n === N ? " on" : "");
      b.textContent = n + "×" + n;
      b.addEventListener("click", () => setSize(n));
      el.appendChild(b);
    }
  }
  function setSize(n) {
    if (n === N) return;
    const old = grid;
    const oN = N;
    const r = resizeGrid(oN, old, n);
    pushUndo(old, oN);
    N = n;
    grid = r.g;
    zoom = 1;
    ox = oy = 0;
    spriteCache.clear();
    renderSizes();
    updateZoomUI();
    requestRender();
    afterChange();
    if (r.lost) toast(`换成 ${n}×${n}，边上 ${r.lost} 颗放不下`, "撤销", undo);
    else toast(`换成 ${n}×${n} 了`);
  }
  function tplGrid(t) {
    const n = t.rows.length;
    const g = new Array(n * n).fill(null);
    t.rows.forEach((row, y) => {
      for (let x = 0; x < n; x++) {
        const ch = row[x];
        if (ch && ch !== "." && TK[ch]) g[y * n + x] = TK[ch];
      }
    });
    return { n, g };
  }
  function drawThumb(c, n, g, css) {
    const px = Math.max(1, Math.ceil((css * Math.min(window.devicePixelRatio || 1, 3)) / n));
    c.width = c.height = n * px;
    c.style.width = c.style.height = css + "px";
    const x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < g.length; i++) {
      const v = g[i];
      if (!v) continue;
      x.fillStyle = v;
      x.fillRect((i % n) * px, Math.floor(i / n) * px, px, px);
    }
  }
  function renderTemplates() {
    const el = $(".pd-tpls");
    el.textContent = "";
    for (const t of TEMPLATES) {
      const { n, g } = tplGrid(t);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pd-tpl";
      const c = document.createElement("canvas");
      drawThumb(c, n, g, 56);
      const s = document.createElement("span");
      s.textContent = t.name;
      b.append(c, s);
      b.addEventListener("click", () => loadGrid(n, g, `铺好了「${t.name}」`));
      el.appendChild(b);
    }
  }
  // 换上一整块板子（模板、作品码、作品集里打开的、同步下来的）：原来那块记进撤销；板子上不在色板里的颜色添进“自己调的”
  function putBoard(n, g, custom = []) {
    pushUndo(grid, N);
    N = n;
    grid = g.slice();
    zoom = 1;
    ox = oy = 0;
    spriteCache.clear();
    let added = false;
    for (const v of custom.concat(grid))
      if (v && !NAME.has(v) && !customColors.includes(v)) {
        customColors.push(v);
        added = true;
      }
    if (added) {
      customColors = customColors.slice(-CUSTOM_MAX);
      renderPalette();
    }
    renderSizes();
    updateZoomUI();
    requestRender();
  }
  function loadGrid(n, g, msg, name = "") {
    curName = name;
    putBoard(n, g);
    afterChange();
    hideHint();
    toast(msg, "撤销", undo);
  }
  // 同步下来的板子（别的设备上后来又拼过）：手上没有还没存的，换上它（不用再存，存着的就是它）；
  // 有的话不换，存的时候 App.jsx 那头认出来，把那一份存进作品集（见 savePdState）
  function adopt(s) {
    if (!s || s.r === rev || saveT || saving) return;
    if (toCode(s.n, s.g) === toCode(N, grid)) {
      rev = s.r;
      return;
    }
    curName = "";
    putBoard(s.n, s.g, s.custom || []);
    rev = s.r;
    updateCount();
    updateSend();
    if (tab === "use") renderUsage();
    toast("另一台设备上拼的这一块同步过来了", "撤销", undo);
  }
  function clearBoard() {
    if (!hasBeads()) {
      toast("板子本来就是空的");
      return;
    }
    pushUndo(grid, N);
    grid = new Array(N * N).fill(null);
    curName = "";
    requestRender();
    afterChange();
    toast("清空了", "撤销", undo);
  }

  // ---------- 用量 ----------
  function renderUsage() {
    const el = $(".pd-usage");
    el.textContent = "";
    const rows = usageOf(grid);
    const total = countBeads(grid);
    if (!total) {
      const p = document.createElement("p");
      p.className = "pd-empty";
      p.textContent = "板子还空着。拼上几颗，这里会算出每种颜色要备几颗豆。";
      el.appendChild(p);
      return;
    }
    const max = rows[0][1];
    const sum = document.createElement("p");
    sum.className = "pd-usum";
    sum.textContent = `一共 ${total} 颗豆，用了 ${rows.length} 种颜色。点一行就换成那个颜色。`;
    el.appendChild(sum);
    const list = document.createElement("div");
    list.className = "pd-ulist";
    for (const [h, k] of rows) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pd-urow";
      b.style.setProperty("--w", Math.max(4, Math.round((k / max) * 100)) + "%");
      const bd = document.createElement("span");
      bd.className = "pd-ubd";
      bd.style.setProperty("--c", h);
      const nm = document.createElement("span");
      nm.className = "pd-un";
      nm.textContent = nameOfHex(h);
      const ct = document.createElement("span");
      ct.className = "pd-uk";
      ct.textContent = k + " 颗";
      b.append(bd, nm, ct);
      b.addEventListener("click", () => {
        selectColor(h);
        setTool("pen");
        toast(`换成「${nameOfHex(h)}」`);
      });
      list.appendChild(b);
    }
    el.appendChild(list);
  }

  // ---------- 作品集 ----------
  function defaultName() {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  let savingWork = false; // 存进作品集正在存（点了两下、回车又点了一下，只存一幅）
  async function saveWork() {
    if (savingWork) return;
    if (!hasBeads()) {
      toast("先拼几颗再存");
      return;
    }
    const code = toCode(N, grid);
    if (!code) {
      toast("颜色太多了，存不下，先导出图片吧");
      return;
    }
    const inp = $(".pd-name");
    const name = cleanName(inp.value) || defaultName();
    let ok = false;
    savingWork = true;
    try {
      ok = await api.onSave({ name, code });
    } catch (e) {
      ok = false;
    }
    savingWork = false;
    if (dead) return;
    if (ok) {
      inp.value = "";
      inp.blur();
      curName = name;
      toast(`存进作品集了：「${name}」`);
    } else toast("没存上，再点一次试试");
  }
  function workRow(w, tail) {
    const row = document.createElement("div");
    row.className = "pd-work" + (tail.length === 1 ? " two" : "");
    const c = document.createElement("canvas");
    drawThumb(c, w.n, w.g, 48);
    const info = document.createElement("div");
    info.className = "pd-winfo";
    const b = document.createElement("b");
    b.textContent = w.name || "无题";
    const s = document.createElement("small");
    s.textContent = `${w.n}×${w.n}，${w.beads} 颗${w.at ? "，" + fmtDate(w.at) : ""}`;
    info.append(b, s);
    row.append(c, info, ...tail);
    return row;
  }
  function renderWorks() {
    const el = $(".pd-works");
    el.textContent = "";
    $(".pd-works-empty").hidden = works.length > 0;
    for (const w of works) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "pd-mini";
      open.textContent = "打开";
      open.addEventListener("click", () => loadGrid(w.n, w.g, `打开了「${w.name || "无题"}」`, w.name || ""));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "pd-mini del";
      del.textContent = "删除";
      let armT = 0;
      del.addEventListener("click", async () => {
        if (del.classList.contains("arm")) {
          clearTimeout(armT);
          let ok = false;
          try {
            ok = await api.onDelete(w.id);
          } catch (e) {
            ok = false;
          }
          if (!dead) toast(ok ? `删掉了「${w.name || "无题"}」` : "没删成，再点一次试试");
          return;
        }
        del.classList.add("arm");
        del.textContent = "确认删除";
        armT = setTimeout(() => {
          del.classList.remove("arm");
          del.textContent = "删除";
        }, 2600);
      });
      el.appendChild(workRow(w, [open, del]));
    }
  }

  // ---------- 发给光义 ----------
  function updateSend() {
    const b = $('[data-act="send"]');
    b.hidden = !canSend;
    const code = grid.some(Boolean) ? toCode(N, grid) : "";
    const sent = !!code && code === sentCode;
    b.disabled = !code || sent;
    b.textContent = sent ? "已发" : "发给光义";
  }
  let sending = false;
  async function sendWork() {
    if (sending || !canSend) return;
    if (!hasBeads()) {
      toast("板子是空的，先拼点什么");
      return;
    }
    const code = toCode(N, grid);
    if (!code) {
      toast("颜色太多了，发不了，先导出图片吧");
      return;
    }
    sending = true;
    let ok = false;
    try {
      ok = await api.onSend({ name: cleanName($(".pd-name").value) || curName, code });
    } catch (e) {
      ok = false;
    }
    sending = false;
    if (dead) return;
    if (ok) {
      sentCode = code;
      toast("发过去了。关上这一页，他看了再回");
    } else toast("没发成，再点一次试试");
    updateSend();
  }

  // ---------- 他的 ----------
  function hisMeta(h) {
    const beads = countBeads(h.g);
    const t = h.at ? `，${fmtTime(h.at)}动过` : "";
    return beads ? `${h.n}×${h.n}，拼了 ${beads} 颗，拼到一半${t}` : `${h.n}×${h.n}，眼下是空的${t}`;
  }
  function renderHis() {
    const el = $(".pd-his");
    el.textContent = "";
    if (!his || !his.touched) {
      const p = document.createElement("p");
      p.className = "pd-empty";
      p.textContent = wake
        ? "他还没在屋里拼过。他自己醒着的时候会去桌上拼，拼到一半的、挂起来的都摆在这里，只能看。"
        : "他还没在屋里拼过。“他自己醒”还关着：在账户面板里打开，他在屋里醒着的时候会去桌上拼。";
      el.appendChild(p);
      return;
    }
    const now = document.createElement("button");
    now.type = "button";
    now.className = "pd-hisnow";
    const c = document.createElement("canvas");
    paintThumb(c, his.n, his.g, 96);
    const info = document.createElement("div");
    const b = document.createElement("b");
    b.textContent = "桌上这块";
    const s = document.createElement("small");
    s.textContent = hisMeta(his);
    info.append(b, s);
    now.append(c, info);
    now.addEventListener("click", () => openView("他桌上这块", his.n, his.g, hisMeta(his)));
    el.appendChild(now);
    const sub = document.createElement("p");
    sub.className = "pd-sub";
    sub.textContent = his.done.length ? `挂起来的（${his.done.length} 幅，新的在前）` : "还没挂起来过一幅：拼完了起个名字，他会挂在这里。";
    el.appendChild(sub);
    const list = document.createElement("div");
    list.className = "pd-works";
    for (const d of his.done.slice().reverse()) {
      const look = document.createElement("button");
      look.type = "button";
      look.className = "pd-mini";
      look.textContent = "看看";
      look.addEventListener("click", () => openView(`《${d.name}》`, d.n, d.g, `${d.n}×${d.n}，${d.beads} 颗，${fmtTime(d.at)}挂起来的`));
      list.appendChild(workRow(d, [look]));
    }
    el.appendChild(list);
  }
  // 他的那几块画成小图：拼豆的样子（带钉子，看得出是一块板子），空板子也画得出来
  function paintThumb(c, n, g, css) {
    const S = (css * Math.min(window.devicePixelRatio || 1, 3)) / n;
    paintWork(c, n, g, { S, mode: "bead", board: theme.board, peg: theme.peg });
    c.style.width = c.style.height = css + "px";
  }
  function openView(title, n, g, meta) {
    $(".pd-vtitle").textContent = title;
    const c = $(".pd-vcv");
    const S = Math.max(4, Math.floor((480 * Math.min(window.devicePixelRatio || 1, 3)) / n));
    paintWork(c, n, g, { S, mode: view === "pixel" ? "pixel" : view, board: theme.board, peg: theme.peg });
    $(".pd-bigmeta").textContent = meta + "。他的板子只能看，动不了。";
    openModal("view");
  }

  // ---------- 作品码 ----------
  let codeMode = "copy";
  function openCode(m) {
    const ta = $(".pd-code");
    $(".pd-cerr").hidden = true;
    if (m === "copy") {
      if (!hasBeads()) {
        toast("板子是空的，先拼点什么");
        return;
      }
      const code = toCode(N, grid);
      if (!code) {
        toast("颜色太多，生成不了作品码，先导出图片吧");
        return;
      }
      $(".pd-ctitle").textContent = "作品码";
      $(".pd-cnote").textContent = "这一串就是整块板子。复制下来存进备忘录，或者发给别人，之后点「粘贴作品码」贴回来就能复原。";
      ta.value = code;
      ta.readOnly = true;
      ta.placeholder = "";
      $('[data-act="code-go"]').textContent = "复制";
    } else {
      $(".pd-ctitle").textContent = "粘贴作品码";
      $(".pd-cnote").textContent = "把作品码贴进下面的框里（官方 App 里那一份复制的也认）。铺上去以后，原来的样子可以撤销回来。";
      ta.value = "";
      ta.readOnly = false;
      ta.placeholder = "长按这里粘贴，开头是 PD1~";
      $('[data-act="code-go"]').textContent = "铺到板子上";
    }
    codeMode = m;
    // 粘贴的那一张挂在顶上：要在框里打字（粘贴），摆在底下的话键盘一起来，框和底下那颗“铺到板子上”都压在键盘底下
    $('[data-modal="code"]').classList.toggle("pd-up", m === "paste");
    openModal("code");
    if (m === "copy")
      setTimeout(() => {
        try {
          ta.focus();
          ta.setSelectionRange(0, ta.value.length);
        } catch (e) {}
      }, 60);
  }
  async function codeAction() {
    const ta = $(".pd-code");
    if (codeMode === "copy") {
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(ta.value);
          ok = true;
        }
      } catch (e) {}
      if (dead) return; // 复制的那一下她把这一页关了
      if (!ok) {
        try {
          ta.focus();
          ta.setSelectionRange(0, ta.value.length);
          ok = !!document.execCommand("copy");
        } catch (e) {}
      }
      if (ok) {
        toast("作品码复制好了");
        closeModal();
      } else {
        try {
          ta.focus();
          ta.setSelectionRange(0, ta.value.length);
        } catch (e) {}
        toast("自动复制不了，长按文字选「全选」再拷贝");
      }
      return;
    }
    const r = fromCode(ta.value);
    if (!r) {
      const e = $(".pd-cerr");
      e.textContent = ta.value.trim() ? "这串作品码不完整，看看是不是没复制全。" : "框里还是空的。";
      e.hidden = false;
      return;
    }
    closeModal();
    loadGrid(r.n, r.g, "作品码铺好了");
  }

  // ---------- 导出图片 ----------
  let exBg = "board";
  function renderExport(withBoard) {
    let bx = 0;
    let by = 0;
    let bw = N;
    let bh = N;
    if (!withBoard) {
      const b = boundsOf(N, grid, 1);
      if (b) ({ x: bx, y: by, w: bw, h: bh } = b);
    }
    const S = Math.max(12, Math.floor(900 / Math.max(bw, bh)));
    const pad = withBoard ? Math.round(S * 0.6) : 0;
    const out = document.createElement("canvas");
    out.width = bw * S + pad * 2;
    out.height = bh * S + pad * 2;
    const g = out.getContext("2d");
    if (withBoard) {
      if (view === "pixel") {
        g.fillStyle = "#FFFFFF";
        g.fillRect(0, 0, out.width, out.height);
      } else {
        g.fillStyle = EXPORT_BOARD;
        g.beginPath();
        rrect(g, 0, 0, out.width, out.height, S * 0.9);
        g.fill();
      }
      if (view === "bead") {
        g.fillStyle = EXPORT_PEG;
        g.beginPath();
        const pr = S * 0.16;
        for (let y = 0; y < bh; y++)
          for (let x = 0; x < bw; x++) {
            if (grid[(y + by) * N + x + bx]) continue;
            const cx = pad + x * S + S / 2;
            const cy = pad + y * S + S / 2;
            g.moveTo(cx + pr, cy);
            g.arc(cx, cy, pr, 0, Math.PI * 2);
          }
        g.fill();
      }
    }
    const cache = new Map();
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const v = grid[(y + by) * N + x + bx];
        if (!v) continue;
        let sp = cache.get(v);
        if (!sp) {
          sp = makeSprite(v, view, S);
          cache.set(v, sp);
        }
        g.drawImage(sp, pad + x * S, pad + y * S);
      }
    return out.toDataURL("image/png");
  }
  function refreshExport() {
    $$('[data-seg="bg"] button').forEach((b) => b.classList.toggle("on", b.dataset.bg === exBg));
    const url = renderExport(exBg === "board");
    $(".pd-eximg").src = url;
    const a = $(".pd-exdl");
    a.hidden = standalone();
    a.href = url;
    a.download = "拼豆 " + defaultName().replace(":", "") + ".png";
  }
  function openExport() {
    if (!hasBeads()) {
      toast("板子是空的，先拼点什么");
      return;
    }
    openModal("export");
    refreshExport();
  }

  // ---------- 弹出来的那几张 ----------
  let modal = "";
  function openModal(m) {
    modal = m;
    $$(".pd-modal").forEach((el) => (el.hidden = el.dataset.modal !== m));
  }
  function closeModal() {
    if (modal === "export") $(".pd-eximg").removeAttribute("src");
    if (modal === "code") $(".pd-code").blur();
    modal = "";
    $$(".pd-modal").forEach((el) => (el.hidden = true));
  }

  // ---------- 提示条、头一回的那句提示 ----------
  let toastT = 0;
  function toast(msg, act, fn) {
    $(".pd-tmsg").textContent = msg;
    const a = $(".pd-tact");
    if (act) {
      a.hidden = false;
      a.textContent = act;
      a.onclick = () => {
        hideToast();
        fn();
      };
    } else {
      a.hidden = true;
      a.onclick = null;
    }
    $(".pd-toast").classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(hideToast, act ? 4000 : 2400);
  }
  const hideToast = () => $(".pd-toast").classList.remove("show");
  function hideHint() {
    const h = $(".pd-hint");
    if (h.classList.contains("gone")) return;
    h.classList.add("gone");
    if (!hintSeen) {
      hintSeen = true;
      savePrefs();
    }
  }

  // ---------- 存：交给开封府 ----------
  // 板子真动了才存（拼、取、填、换板子、模板、作品码、撤销、自己调的颜色），隔六百毫秒存一回；只换了颜色、样子不存板子（习惯记在这台设备上，savePrefs）。
  // 存的时候带上眼下这块是从存着的哪一份接着拼的（rev）：App.jsx 那头认一认，别的设备后来又拼过的那一份不盖掉，存进作品集（见 savePdState）。
  // 一回一回排着存：前一回还没存完，后一回等它（不然后一回拿着旧的记号去认，认成别的设备拼的）
  let saveT = 0;
  let saving = null;
  let again = false;
  let booted = false;
  // 板子上有没有豆子（写成一个小函数：直接写那一句，打包样式表的时候会被认成一个样式名，白白多出一条）
  function hasBeads() {
    return grid.some(Boolean);
  }
  const snapshot = () => ({ n: N, g: grid.slice(), custom: customColors.slice() });
  function scheduleSave() {
    if (!booted || dead) return;
    clearTimeout(saveT);
    saveT = setTimeout(flushSave, 600);
  }
  function flushSave() {
    if (!saveT) return;
    clearTimeout(saveT);
    saveT = 0;
    if (saving) {
      again = true;
      return;
    }
    doSave();
  }
  // 关上了、整页卸掉了也照样存完（排着的那一回不丢）；提示条只在还开着的时候说
  function doSave() {
    let p;
    try {
      p = Promise.resolve(api.onState(snapshot(), rev));
    } catch (e) {
      p = Promise.resolve(null);
    }
    saving = p
      .then(
        (r) => {
          if (r && typeof r.rev === "string") rev = r.rev;
          if (r && r.kept && !dead) toast("另一台设备上后来也拼过：那边的那一块存进作品集了");
        },
        () => {}
      )
      .then(() => {
        saving = null;
        if (again) {
          again = false;
          doSave();
        }
      });
  }
  function savePrefs() {
    if (!booted || dead) return;
    try {
      localStorage.setItem(PD_PREFS, packPrefs({ color, view, tool, mirror, guides, hint: hintSeen }));
    } catch (e) {}
  }

  // ---------- 接线 ----------
  $$("[data-tool]").forEach((b) => on(b, "click", () => setTool(b.dataset.tool)));
  $$('[data-seg="view"] button').forEach((b) => on(b, "click", () => setView(b.dataset.view)));
  $$(".pd-tabs [data-tab]").forEach((b) => on(b, "click", () => setTab(b.dataset.tab)));
  $$('[data-seg="bg"] button').forEach((b) =>
    on(b, "click", () => {
      exBg = b.dataset.bg;
      refreshExport();
    })
  );
  const ACTS = {
    mirror: () => {
      setMirror(!mirror);
      toast(mirror ? "左右对称开了，拼一边出两边" : "左右对称关了");
    },
    undo,
    redo,
    guides: () => setGuides(!guides),
    zin: () => zoomTo(zoom * 1.5),
    zout: () => zoomTo(zoom / 1.5),
    zfit: resetZoom,
    clear: clearBoard,
    "clear-custom": () => {
      customColors = [];
      renderPalette();
      scheduleSave();
      toast("自己调的颜色清空了");
    },
    save: saveWork,
    send: sendWork,
    "copy-code": () => openCode("copy"),
    "paste-code": () => openCode("paste"),
    export: openExport,
    "close-modal": closeModal,
    "code-go": codeAction,
  };
  on(root, "click", (e) => {
    const b = e.target.closest && e.target.closest("[data-act]");
    if (b && root.contains(b) && ACTS[b.dataset.act] && !b.disabled) ACTS[b.dataset.act]();
  });
  on($(".pd-zreset"), "click", resetZoom);
  on($(".pd-close"), "click", () => {
    flushSave();
    api.onClose();
  });
  $$(".pd-modal").forEach((m) =>
    on(m, "click", (e) => {
      if (e.target === m) closeModal();
    })
  );
  on($(".pd-name"), "keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveWork();
    }
  });
  on($(".pd-name"), "input", () => updateSend());
  on(document, "keydown", (e) => {
    if (modal) {
      if (e.key === "Escape") closeModal();
      return;
    }
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = (e.key || "").toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && k === "y") {
      e.preventDefault();
      redo();
    } else if (!mod && !e.altKey) {
      if (k === "b") setTool("pen");
      else if (k === "e") setTool("eraser");
      else if (k === "g") setTool("fill");
      else if (k === "i") setTool("picker");
      else if (k === "m") setMirror(!mirror);
      else if (k === "=" || k === "+") zoomTo(zoom * 1.5);
      else if (k === "-") zoomTo(zoom / 1.5);
      else if (k === "0") resetZoom();
      else if (k === "escape") api.onClose();
    }
  });
  // 换了主题：底板、钉子、空格的颜色跟着换（<html> 上的 data-kfs-theme，见 theme.js）
  const mo = new MutationObserver(() => {
    readTheme();
    spriteCache.clear();
    requestRender();
    if (tab === "his") renderHis();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-kfs-theme"] });
  cleanups.push(() => mo.disconnect());
  // 切到后台（上划回主屏幕、锁屏）：眼下这块马上存，不等那六百毫秒（在后台被系统杀掉，最后那几笔也在）
  on(document, "visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
  on(window, "pagehide", flushSave);
  let ro = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => layout());
    ro.observe(wrap);
    cleanups.push(() => ro.disconnect());
  } else on(window, "resize", layout);

  // ---------- 开张 ----------
  readTheme();
  renderPalette();
  $(".pd-bico").style.setProperty("--c", color);
  renderSizes();
  renderTemplates();
  renderWorks();
  setTool(tool);
  setView(view);
  setMirror(mirror);
  setGuides(guides);
  if (hintSeen) $(".pd-hint").classList.add("gone");
  updateUndoUI();
  updateCount();
  updateSend();
  layout();
  booted = true;
  const hintT = setTimeout(hideHint, 7000);
  cleanups.push(() => clearTimeout(hintT));

  return {
    // 存档同步下来变了（作品集、他的板子），或者翻到了狐宇宙（不摆“发给光义”）
    update(next = {}) {
      if (dead) return;
      if (next.works) {
        // 作品集没变（同步下来的是别的东西）不重画：重画了，点到一半的“确认删除”就没了
        const sig = (l) => l.map((w) => `${w.id}:${w.at}:${w.name}`).join("|");
        const same = sig(next.works) === sig(works);
        works = next.works;
        if (!same) renderWorks();
      }
      if (next.state) adopt(next.state);
      if ("his" in next) his = next.his;
      if ("wake" in next) wake = !!next.wake;
      if (("his" in next || "wake" in next) && tab === "his") renderHis();
      if ("canSend" in next) {
        canSend = !!next.canSend;
        updateSend();
      }
    },
    destroy() {
      if (dead) return;
      flushSave();
      dead = true;
      clearTimeout(toastT);
      clearTimeout(zIdleT);
      if (raf) cancelAnimationFrame(raf);
      cleanups.forEach((f) => {
        try {
          f();
        } catch (e) {}
      });
      root.innerHTML = "";
      root.classList.remove("kfs-pindou");
    },
    // 端到端测试用：板子眼下是什么样（作品码）
    _code: () => toCode(N, grid),
  };
}
