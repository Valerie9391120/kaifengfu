// =====================================================
// 藏音匣那一页（见开发说明“藏音匣”那一节）。build.mjs 另打成 assets/cangyin-<指纹>.js，开封府头一回点进去的时候才取
// （CangyinPage.jsx 的 loadPage）。原型是 10 月 16、17 日在 artifact 里给卿卿一版一版看的那一页，她说“可以实装了”，
// 手感、动画的数一个没动，照搬过来；换掉的只有：编的语音换成存档里的，声音用开封府那一个放声音的东西，颜色跟着主题走。
//
// 第一页：进来一片空，几笔画出一只小匣子（每回进来都画）。点匣子：从匣盖和匣身那道缝里抽出一张锦灰堆残纸，转过来落在匣子前面；
//   纸条上左边播放键、右边刻本体的字（繁体），右下角年月日。点播放：匣子退后、纸条上前；放完不收，再点从头放；点空白处收回去。
//   空的时候点匣子：匣子晃一晃，冒一句怎么存。
// 第二页（往上划）：一根线串起来的全部，从新到旧，按月份断开。点圈放、停；点那句话整句展开，右下角露出“移出”；点空白收起。
//   翻到最上面再往下拉回第一页。
// 不碰存档、不碰云端：要什么都从 api 递进来（见 mountBox）。
// =====================================================
import { CSS, TEMPLATE } from "./style.js";
import { cnDate, dayOf, lenOf, monthOf, monthKey, rngOf, paperOf, pickFrom, cutQuote } from "./parts.js";

/* global __KFS_CANGYIN_ASSETS__ */
// 图和刻本体样式表的地址（build.mjs 照指纹写进来的；照网页的根找，两个入口都一样）
const ASSETS =
  typeof __KFS_CANGYIN_ASSETS__ !== "undefined"
    ? __KFS_CANGYIN_ASSETS__
    : { tex: "./assets/cangyin/paper.webp", flower: "./assets/cangyin/flower.webp", strips: [1, 2, 3, 4, 5].map((i) => `./assets/cangyin/strip${i}.webp`), font: "./assets/jinhui.css" };
const abs = (u) => {
  try {
    return new URL(u, document.baseURI).href;
  } catch (e) {
    return u;
  }
};

// ======================= 动画的数（原型里调手感那张表的默认值；卿卿没另发过数来，照这些） =======================
const P = {
  drawMs: 760, // 画匣子多久
  shadowMs: 320, // 影子浮上来多久
  pressDip: 0.965, // 按下去匣子缩多少
  slideMs: 300, // 纸条滑出来多久
  popBack: 1.5, // 滑出来那一下弹多少
  tilt: 7, // 滑出来歪多少度
  unfoldMs: 520, // 转过来展开多久
  unfoldTurn: 90, // 转多少度
  focusMs: 560, // 匣子退后、纸条上前多久
  boxShrink: 0.64, // 匣子缩到多大
  boxRise: 0.15, // 匣子往上挪（占屏高）
  stripGrow: 1.08, // 纸条放大到
  stripRise: 0.08, // 纸条往上挪（占屏高）
  returnMs: 640, // 收回去多久
  pageThreshold: 0.2, // 划过多少才翻（占屏高）
  pageVelocity: 0.45, // 甩多快就翻（像素/毫秒）
  pageK: 240, // 翻页弹簧的劲
  pageC: 27, // 翻页弹簧的阻尼
  expandMs: 300, // 第二页那句话展开、收起多久
  scrollFriction: 4.5, // 翻的时候滑多远（越大停得越快）
  listOverlap: 24, // 列表伸到花里多少（像素，0 是正好到花顶）
};
const SEAM = 0.2; // 匣盖和匣身那道缝在前脸从上往下五分之一的地方
const FONT = '17.5px "KFS Jinhui"';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const E = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inCubic: (t) => t * t * t,
  outBack: (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
};
class Spr {
  constructor(x) {
    this.x = x;
    this.v = 0;
    this.t = x;
  }
  set(x) {
    this.x = this.t = x;
    this.v = 0;
  }
  step(dt, k, c) {
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -k * (this.x - this.t) - c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
  }
  still(eps = 0.05) {
    return Math.abs(this.x - this.t) < eps && Math.abs(this.v) < eps * 4;
  }
}

// 样子、刻本体的样式表：头一回进来的时候放进页面，之后一直留着。
// 刻本体的样式表到了才知道哪个字在哪一块，所以记着它到了没有（cssReady）
let cssReady = null;
function ensureStyles() {
  if (!document.getElementById("kfs-cangyin-css")) {
    const s = document.createElement("style");
    s.id = "kfs-cangyin-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  if (!cssReady) {
    cssReady = new Promise((done) => {
      if (!ASSETS.font) return done();
      let l = document.getElementById("kfs-jinhui-css");
      if (l && l.sheet) return done();
      if (!l) {
        l = document.createElement("link");
        l.id = "kfs-jinhui-css";
        l.rel = "stylesheet";
        l.href = abs(ASSETS.font);
        document.head.appendChild(l);
      }
      l.addEventListener("load", () => done(), { once: true });
      l.addEventListener("error", () => done(), { once: true });
      setTimeout(done, 4000);
    });
  }
  return cssReady;
}

// 刻本体是切成一块一块的（unicode-range），用到哪些字才取哪几块：先把这一句要的取回来，最多等 wait 毫秒
function fontsFor(text, wait) {
  const f = document.fonts;
  if (!f || !f.load || !text) return Promise.resolve(true);
  const p = (cssReady || Promise.resolve()).then(() => {
    try {
      if (f.check(FONT, text)) return true;
    } catch (e) {}
    return f.load(FONT, text).then(
      () => true,
      () => false
    );
  });
  return wait == null ? p : Promise.race([p, new Promise((r) => setTimeout(() => r(false), wait))]);
}

// root：一块铺满屏幕的空 div（CangyinPage 给的）。
// api：
//   entries：一条一条（{ id, at, text, trad, dur }，从新到旧，见 parts.js 的 listEntries）
//   audio：{ el() 那一个放声音的东西, load(a, url) 换地址（上一个 blob: 收回）, urlOf(id) 那一条的声音变成能放的地址（没有给 ""）,
//            claim(lost) 聊天那边别再管它；之后开封府那边要停下它（切到后台、来电话）的时候叫一声 lost }
//   toast(话)、onBack()、onRemove(id)
// 返回 { update(entries), destroy() }
export function mountBox(root, api) {
  ensureStyles();
  root.classList.add("kfs-cangyin");
  root.innerHTML = TEMPLATE;
  const $ = (c) => root.querySelector("." + c);
  const stage = $("cy-stage");
  $("cy-tex").style.backgroundImage = `url("${abs(ASSETS.tex)}")`;
  const lines = `url("${abs(ASSETS.flower)}")`;
  $("cy-flower").style.webkitMaskImage = lines;
  $("cy-flower").style.maskImage = lines;
  const STRIPS = ASSETS.strips.map(abs);
  let voices = (api.entries || []).slice();
  let dead = false;
  const reduce = (() => {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  })();
  const ms = (v) => (reduce ? Math.min(v, 120) : v);
  const mark = (k, v) => {
    if (v == null || v === "") delete root.dataset[k];
    else root.dataset[k] = String(v);
  };
  const viaKeys = (e) => e.detail === 0;

  // ---------- 残纸：每条语音配五张里的一张，同一条一直是那一张；九宫格画在 canvas 上 ----------
  const paperImgs = new Map();
  function paperImg(url) {
    let im = paperImgs.get(url);
    if (!im) {
      im = new Image();
      im.src = url;
      paperImgs.set(url, im);
    }
    return im;
  }
  STRIPS.forEach(paperImg); // 先取着
  function paintPaper(el, w, h) {
    let cv = el.querySelector(":scope > canvas.cy-paper");
    if (!cv) {
      cv = document.createElement("canvas");
      cv.className = "cy-paper";
      cv.setAttribute("aria-hidden", "true");
      el.insertBefore(cv, el.firstChild);
    }
    const url = el.dataset.paper;
    if (!url || !w || !h) return;
    const im = paperImg(url);
    if (!im.complete || !im.naturalWidth) {
      im.addEventListener("load", () => !dead && paintPaper(el, w, h), { once: true });
      return;
    }
    const k = Math.min(3, window.devicePixelRatio || 1) * 1.12; // 播放的时候纸条会放大一点：多画一点，放大了也不糊
    const cw = Math.round(w * k);
    const ch = Math.round(h * k);
    if (cv.width !== cw) cv.width = cw;
    if (cv.height !== ch) cv.height = ch;
    cv.style.width = w + "px";
    cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = "high";
    const iw = im.naturalWidth;
    const ih = im.naturalHeight;
    const SX = [0, 72, iw - 72, iw];
    const SY = [0, 62, ih - 62, ih];
    const bl = Math.round(25 * k);
    const bt = Math.round(19 * k);
    const DX = [0, bl, cw - bl, cw];
    const DY = [0, bt, ch - bt, ch];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const dw = DX[i + 1] - DX[i];
        const dh = DY[j + 1] - DY[j];
        if (dw > 0 && dh > 0) ctx.drawImage(im, SX[i], SY[j], SX[i + 1] - SX[i], SY[j + 1] - SY[j], DX[i], DY[j], dw, dh);
      }
  }

  // ---------- 声音：开封府那一个放声音的东西（iPhone 上被她点过一回，接着放才不拦） ----------
  const A = api.audio;
  let playing = null; // { v, where: 1 | 第二页那一行 }
  let loaded = ""; // 放声音的东西眼下装着哪一条
  let loadedSrc = ""; // 装的时候的那个地址（不是它了，就是别处换过）
  const ours = { ended: null, pause: null, error: null };
  function hook(a) {
    a.onended = ours.ended;
    a.onpause = ours.pause;
    a.onerror = ours.error;
  }
  const mine = () => A.el().onended === ours.ended;
  // 开封府那边把放声音的东西停了（切到后台、来电话）：画面上跟着停；放到哪儿还记着，再点接着放
  const lost = () => {
    if (!dead) syncIcons();
  };
  function startAudio(v, where) {
    const a = A.el();
    if (loaded !== v.id || !loadedSrc || a.src !== loadedSrc) {
      const url = A.urlOf(v.id);
      if (!url) {
        api.toast("这条语音还没同步过来，放不出来");
        return false;
      }
      if (!mine()) A.claim(lost);
      hook(a);
      a.pause();
      A.load(a, url);
      loaded = v.id;
      loadedSrc = a.src;
      try {
        a.currentTime = 0;
      } catch (e) {}
    } else {
      // 还是装着的这一条：被停下过的拿回来接着放；放完了的、换了一处放的（第一页放过、到第二页再点）从头
      if (!mine()) {
        A.claim(lost);
        hook(a);
      }
      if (!playing || playing.v !== v)
        try {
          a.currentTime = 0;
        } catch (e) {}
    }
    playing = { v, where };
    const p = a.play();
    if (p && p.catch)
      p.catch((er) => {
        if (dead || !playing || playing.v !== v || !a.paused) return;
        syncIcons();
        // iPhone 没认出是她手指点的那一下，不让出声：说一声（再点一下一般就行）
        if (er && er.name === "NotAllowedError") api.toast("手机没让放出声来，再点一下试试");
      });
    return true;
  }
  const pauseAudio = () => A.el().pause();
  function stopAudio() {
    const a = A.el();
    if (a.onended === ours.ended) {
      a.pause();
      try {
        a.currentTime = 0;
      } catch (e) {}
    }
    playing = null;
  }
  const isPlaying = () => {
    const a = A.el();
    return !!playing && a.onended === ours.ended && !a.paused && !a.ended;
  };
  const progressOf = (v) => {
    if (!playing || playing.v !== v) return 0;
    const a = A.el();
    const d = a.duration && isFinite(a.duration) ? a.duration : v.dur || 1;
    return Math.min(1, (a.currentTime || 0) / d);
  };
  ours.ended = () => {
    if (!playing) return;
    if (playing.where === 1) {
      // 放完了不收（卿卿 10 月 17 日）：纸条留在外面，三角回来，再点从头放；点空白处才收回去
      playing = null;
      try {
        A.el().currentTime = 0;
      } catch (e) {}
      playIcon(play1, false);
      mark("playing", "");
    } else endRow(playing.where);
  };
  // 被别的停下了（来电话、锁屏上点了暂停）：画面跟着停（放完的那一下也会先来一个“停了”，ended 是真的，不算）
  ours.pause = () => {
    const a = A.el();
    if (a.ended) return;
    syncIcons();
  };
  ours.error = () => {
    if (!playing) return;
    playing = null;
    loaded = "";
    loadedSrc = "";
    syncIcons();
    api.toast("这条语音放不出来");
  };
  function syncIcons() {
    const on = isPlaying();
    playIcon(play1, on && playing && playing.where === 1);
    paintRows();
    mark("playing", on && playing ? playing.v.id : "");
  }

  // ---------- 一帧一帧走的那一圈 ----------
  let tweens = [];
  function tween(dur, fn, ease = E.outCubic) {
    return new Promise((done) => {
      tweens.push({ t0: performance.now(), dur: Math.max(1, dur), fn, ease, done });
      kick();
    });
  }
  const wait = (t) => new Promise((r) => setTimeout(r, t));
  let raf = 0;
  let last = 0;
  const steppers = new Set();
  function kick() {
    if (!raf && !dead) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }
  function frame(now) {
    raf = 0;
    if (dead) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const keep = [];
    for (const tw of tweens) {
      const t = clamp((now - tw.t0) / tw.dur, 0, 1);
      tw.fn(tw.ease(t), t);
      if (t < 1) keep.push(tw);
      else tw.done();
    }
    tweens = tweens.filter((tw) => keep.includes(tw));
    let busy = tweens.length > 0;
    for (const s of [...steppers]) {
      if (s(dt)) busy = true;
      else steppers.delete(s);
    }
    if (isPlaying()) busy = true;
    paintRows();
    if (busy) kick();
  }

  // ---------- 尺寸 ----------
  let W = 360;
  let H = 640;
  let G = null;
  let safeT = 0;
  let safeB = 0;
  function measure() {
    const r = stage.getBoundingClientRect();
    W = r.width || 360;
    H = r.height || 640;
    safeT = $("cy-safe").getBoundingClientRect().height || 0;
    safeB = $("cy-safeb").getBoundingClientRect().height || 0;
    const bw = clamp(W * 0.47, 150, 230);
    const fh = bw * 0.5;
    const cx = W / 2;
    const cy = H * 0.38;
    G = { bw, fh, depth: bw * 0.2, inset: bw * 0.045, cx, cy, top: cy - fh / 2, bottom: cy + fh / 2, left: cx - bw / 2, right: cx + bw / 2 };
    G.backY = G.top - G.depth;
    G.seam = G.top + fh * SEAM;
  }

  // ---------- 匣子：线稿，几笔 ----------
  const NS = "http://www.w3.org/2000/svg";
  let strokes = [];
  function line(x1, y1, x2, y2, rnd, over = 1.4) {
    // 一笔：两头各多出一点（手画的收不住），中间微微弯
    const dx = x2 - x1;
    const dy = y2 - y1;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    const sx = x1 - ux * over * rnd();
    const sy = y1 - uy * over * rnd();
    const ex = x2 + ux * over * (0.4 + rnd());
    const ey = y2 + uy * over * (0.4 + rnd());
    const bend = (rnd() - 0.5) * Math.min(3.2, L * 0.03);
    const mx = (sx + ex) / 2 - uy * bend;
    const my = (sy + ey) / 2 + ux * bend;
    return `M${sx.toFixed(2)} ${sy.toFixed(2)} Q${mx.toFixed(2)} ${my.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }
  function buildBox() {
    measure();
    const m = 8;
    const ox = G.left - m;
    const oy = G.backY - m;
    const w = G.bw + m * 2;
    const h = G.fh + G.depth + m * 2;
    const back = $("cy-boxback");
    const front = $("cy-boxfront");
    const seamSvg = $("cy-boxseam");
    for (const s of [back, front, seamSvg]) {
      s.setAttribute("viewBox", `0 0 ${w} ${h}`);
      s.style.left = ox + "px";
      s.style.top = oy + "px";
      s.style.width = w + "px";
      s.style.height = h + "px";
      s.innerHTML = "";
    }
    const L = m;
    const R = m + G.bw;
    const T = m + G.depth;
    const B = T + G.fh;
    const bl = L + G.inset;
    const br = R - G.inset;
    const bt = m;
    const rnd = rngOf("box-" + Math.round(G.bw));
    const add = (svg, d, cls) => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      if (cls) p.setAttribute("class", cls);
      svg.appendChild(p);
      return p;
    };
    // 里面那一块（匣口）很淡的一层，最后跟着影子一起浮上来
    const inside = add(back, `M${L} ${T} L${bl} ${bt} L${br} ${bt} L${R} ${T} Z`, "cy-inside");
    inside.style.opacity = 0;
    // 第一笔：前脸，一笔绕下来
    const face = [
      `M${(L + 0.6).toFixed(2)} ${(T - 0.8).toFixed(2)}`,
      `Q${(L - 1.3).toFixed(2)} ${((T + B) / 2 - 3).toFixed(2)} ${(L + 0.5).toFixed(2)} ${(B + 0.6).toFixed(2)}`,
      `Q${((L + R) / 2 - 8).toFixed(2)} ${(B + 2).toFixed(2)} ${(R - 0.4).toFixed(2)} ${(B - 0.3).toFixed(2)}`,
      `Q${(R + 1.4).toFixed(2)} ${((T + B) / 2 + 2).toFixed(2)} ${(R - 0.6).toFixed(2)} ${(T + 0.5).toFixed(2)}`,
      `Q${((L + R) / 2 + 6).toFixed(2)} ${(T - 1.8).toFixed(2)} ${(L - 1.6).toFixed(2)} ${(T - 0.3).toFixed(2)}`,
    ].join(" ");
    strokes = [];
    strokes.push({ p: add(front, face), a: 0, b: 0.46 });
    // 两边往后收的两笔、后沿一笔
    strokes.push({ p: add(back, line(L, T, bl, bt, rnd)), a: 0.4, b: 0.6 });
    strokes.push({ p: add(back, line(R, T, br, bt, rnd)), a: 0.42, b: 0.62 });
    strokes.push({ p: add(back, line(bl, bt, br, bt, rnd, 1.8)), a: 0.58, b: 0.8 });
    // 前脸上一道浅浅的缝（匣盖和匣身那一道）：纸条从这里进出（卿卿 10 月 17 日），这一笔画在纸条上面那一层
    const seam = T + G.fh * SEAM;
    strokes.push({ p: add(seamSvg, line(L + G.bw * 0.08, seam, R - G.bw * 0.08, seam, rnd, 0.6)), a: 0.78, b: 1 });
    for (const s of strokes) {
      const len = s.p.getTotalLength();
      s.len = len;
      s.p.style.strokeDasharray = `${len} ${len}`;
      s.p.style.strokeDashoffset = len;
    }
    G.inside = inside;
    // 纸条在匣子里的时候只露缝以上那一截
    clipEl.style.height = G.seam + 0.5 + "px";
    const sh0 = $("cy-boxshadow");
    sh0.style.left = G.cx - G.bw * 0.56 + "px";
    sh0.style.width = G.bw * 1.12 + "px";
    sh0.style.top = G.bottom - 4 + "px";
    $("cy-empty").style.top = G.bottom + 34 + "px";
  }
  function drawnAt(f) {
    for (const s of strokes) {
      const t = clamp((f - s.a) / (s.b - s.a), 0, 1);
      s.p.style.strokeDashoffset = s.len * (1 - E.outCubic(t));
    }
  }
  const boxEl = $("cy-box");
  const boxOverEl = $("cy-boxover");
  const box = { s: 1, dy: 0, press: 1, rot: 0 };
  function paintBox() {
    const s = box.s * box.press;
    boxEl.style.transform = boxOverEl.style.transform = `translate(${G.cx}px, ${G.cy + box.dy}px) rotate(${box.rot}deg) scale(${s}) translate(${-G.cx}px, ${-G.cy}px)`;
  }

  // ======================= 第一页：抽纸条 =======================
  const s1 = $("cy-strip");
  const clipEl = $("cy-clip");
  const p1El = $("cy-p1");
  const words1 = $("cy-words");
  const date1 = $("cy-date");
  const play1 = $("cy-play");
  const content1 = $("cy-content");
  let sw = 320;
  let sh = 120;
  const pose = { x: 0, y: 0, r: 0, sx: 1, sy: 1, o: 0 };
  let focus = 0; // 0：纸条刚展开；1：匣子退后、纸条上前
  let state = "drawing"; // drawing | ready | out | open | back
  let cur = null;
  let lastId = "";
  let next = null; // 下一回抽哪一条（先挑好，刻本体先取着）
  let opened = false;
  let expandable = false;
  const setState = (s) => {
    state = s;
    mark("state", s);
  };
  function layoutStrip1() {
    sw = Math.min(W * 0.9, 380);
    s1.style.width = sw + "px";
    s1.style.display = "block";
    sh = s1.offsetHeight;
  }
  // 在匣子里：整条藏在缝底下；冒出来：整条刚好离开那道缝
  const P_inside = () => ({ x: G.cx, y: G.seam + 46, r: 90 + P.tilt, sx: 86 / sw, sy: 26 / sh, o: 0 });
  const P_pop = () => ({ x: G.cx + 3, y: G.seam - 52, r: P.unfoldTurn + P.tilt, sx: 86 / sw, sy: 26 / sh, o: 0 });
  // 落在匣子前面；纸条长（展开了）也不过屏幕底下那一条（iPhone 底下那一横留出来）
  const P_open = () => ({ x: G.cx, y: Math.max(G.bottom + 26, Math.min(G.bottom + 26 + sh / 2, H - safeB - 12 - sh / 2)), r: 0, sx: 1, sy: 1, o: 1 });
  function paintStrip1() {
    const dy = -P.stripRise * H * focus;
    const g = 1 + (P.stripGrow - 1) * focus;
    s1.style.transform = `translate(${pose.x - sw / 2}px, ${pose.y + dy - sh / 2}px) rotate(${pose.r}deg) scale(${pose.sx * g}, ${pose.sy * g})`;
    content1.style.opacity = pose.o;
  }
  function setPose(a, b, t, oFrom = 0.55) {
    pose.x = lerp(a.x, b.x, t);
    pose.y = lerp(a.y, b.y, t);
    pose.r = lerp(a.r, b.r, t);
    pose.sx = lerp(a.sx, b.sx, t);
    pose.sy = lerp(a.sy, b.sy, t);
    pose.o = b.o > a.o ? clamp((t - oFrom) / (1 - oFrom), 0, 1) : clamp(1 - t / 0.3, 0, 1) * a.o;
  }
  function setFocus(f) {
    focus = f;
    box.s = 1 - (1 - P.boxShrink) * f;
    box.dy = -P.boxRise * H * f;
    paintBox();
    paintStrip1();
  }
  const wordsOf = (v) => v.trad || v.text;
  // 收着最多四行；展开了照屏幕上放得下的行数（太长的那种展开了也还是截着，不出屏幕）
  function linesFit() {
    const lh = parseFloat(getComputedStyle(words1).lineHeight) || 31.5;
    const chrome = s1.offsetHeight - words1.offsetHeight; // 纸边、年月日那一行
    return Math.max(4, Math.floor((H - safeB - 12 - (G.bottom + 26) - chrome) / lh));
  }
  function setOpened(on) {
    opened = on;
    words1.style.webkitLineClamp = on ? String(linesFit()) : "";
  }
  function fillStrip1(v) {
    s1.dataset.paper = STRIPS[paperOf(v.id)];
    words1.textContent = wordsOf(v);
    date1.textContent = cnDate(v.at);
    setOpened(false);
    playIcon(play1, false);
    layoutStrip1();
    // 四行放不下：点那几行字展开、再点收起（不摆按钮）
    expandable = words1.scrollHeight > words1.clientHeight + 2;
    sh = s1.offsetHeight;
    paintPaper(s1, sw, sh);
  }
  // 刻本体到了、繁体换上了：纸条重新量一回，落的地方跟着挪
  function refit(v) {
    if (dead || cur !== v || s1.style.display === "none") return;
    if (!opened) expandable = words1.scrollHeight > words1.clientHeight + 2;
    const h = s1.offsetHeight;
    if (Math.abs(h - sh) >= 0.5) {
      sh = h;
      paintPaper(s1, sw, sh);
    }
    if (state === "open") {
      const y = P_open().y;
      if (Math.abs(pose.y - y) >= 0.5) {
        pose.y = y;
        paintStrip1();
      }
    }
  }
  // 眼前这一张换字（繁体补好了）
  function swapWords(v) {
    if (words1.textContent === wordsOf(v)) return;
    words1.textContent = wordsOf(v);
    if (opened) setOpened(true);
    refit(v);
    fontsFor(wordsOf(v)).then(() => refit(v));
  }
  // 眼前这一张不在匣子里了（第二页上、别的设备上移出了）：声音停下，收回去（正抽着的，抽完了再收）
  function dropCur() {
    if (playing && playing.where === 1) stopAudio();
    syncIcons();
    if (state === "open") putBack();
  }
  const inBoxNow = (v) => voices.some((x) => x.id === v.id);
  function choose() {
    next = pickFrom(voices, lastId);
    if (next) fontsFor(wordsOf(next));
    return next;
  }
  async function press() {
    await tween(ms(70), (e) => {
      box.press = lerp(1, P.pressDip, e);
      paintBox();
    });
    tween(ms(260), (e) => {
      box.press = lerp(P.pressDip, 1, e);
      paintBox();
    }, (t) => E.outBack(t, 2.2));
  }
  let shakeT = 0;
  async function shake() {
    const n = $("cy-empty");
    n.style.transition = "opacity .3s";
    n.style.opacity = 1;
    await tween(ms(420), (e, t) => {
      box.rot = Math.sin(t * Math.PI * 5) * 3.2 * (1 - t);
      paintBox();
    }, (t) => t);
    box.rot = 0;
    paintBox();
    clearTimeout(shakeT);
    shakeT = setTimeout(() => (n.style.opacity = 0), 3200);
  }
  async function drawOut() {
    const v = next && voices.includes(next) ? next : pickFrom(voices, lastId);
    if (!v) return shake();
    setState("out");
    cur = v;
    lastId = v.id;
    mark("cur", v.id);
    hint(false);
    // 匣子先应一下；刻本体那几块还没取回来的，最多等九百毫秒（等不及先用宋体摆，到了再重新量）
    press();
    const ready = await fontsFor(wordsOf(v), 900);
    if (dead || cur !== v) return;
    fillStrip1(v);
    if (!ready) fontsFor(wordsOf(v)).then(() => refit(v));
    choose();
    clipEl.appendChild(s1);
    const a = P_inside();
    const b = P_pop();
    setPose(a, a, 0);
    paintStrip1();
    // 先从缝里冒出来（带一点弹），再一边转过来一边展开，落在匣子前面
    await tween(ms(P.slideMs), (e) => {
      setPose(a, b, e);
      paintStrip1();
    }, (t) => E.outBack(t, P.popBack));
    p1El.appendChild(s1);
    const c = P_open();
    await tween(ms(P.unfoldMs), (e, t) => {
      setPose(b, c, e, 0.5);
      pose.r = lerp(b.r, 0, E.outBack(Math.min(1, t * 1.15), 1.2));
      paintStrip1();
    }, E.inOutCubic);
    if (dead || cur !== v) return;
    setState("open");
    // 抽的工夫里：这一条被移出了的收回去；繁体补好了的换上；刻本体到了的照新的量
    if (!inBoxNow(v)) return putBack();
    if (words1.textContent !== wordsOf(v)) swapWords(v);
    else refit(v);
  }
  async function putBack() {
    if (state !== "open" || !cur) return;
    setState("back");
    if (playing && playing.where === 1) stopAudio();
    mark("playing", "");
    if (focus > 0) {
      const f0 = focus;
      await tween(ms(P.returnMs * 0.42), (e) => setFocus(lerp(f0, 0, e)), E.inOutCubic);
    }
    const a = { ...P_open(), o: 1 };
    const b = P_pop();
    await tween(ms(P.returnMs * 0.5), (e) => {
      setPose(a, b, e);
      paintStrip1();
    }, E.inOutCubic);
    clipEl.appendChild(s1);
    const c = P_inside();
    await tween(ms(P.returnMs * 0.32), (e) => {
      setPose(b, c, e);
      paintStrip1();
    }, E.inCubic);
    s1.style.display = "none";
    // 落进去，匣子轻轻一沉
    await tween(ms(80), (e) => {
      box.press = lerp(1, 0.985, e);
      paintBox();
    });
    tween(ms(240), (e) => {
      box.press = lerp(0.985, 1, e);
      paintBox();
    }, (t) => E.outBack(t, 2));
    cur = null;
    mark("cur", "");
    setState("ready");
    hint(true);
  }
  function toggle1() {
    if (!cur || state !== "open") return;
    if (isPlaying() && playing.v === cur) {
      pauseAudio();
      syncIcons();
      return;
    }
    if (!startAudio(cur, 1)) return;
    syncIcons();
    playIcon(play1, true);
    kick();
    if (focus < 1) {
      const f0 = focus;
      tween(ms(P.focusMs), (e) => setFocus(lerp(f0, 1, e)), E.inOutCubic);
    }
  }
  function playIcon(btn, on) {
    const want = on ? "on" : "off";
    if (btn.dataset.icon === want) return;
    btn.dataset.icon = want;
    btn.innerHTML = on
      ? '<svg viewBox="0 0 12 12"><path d="M3 2h2v8H3zM7 2h2v8H7z"/></svg>'
      : '<svg viewBox="0 0 12 12"><path d="M3.2 1.8 10 6l-6.8 4.2z"/></svg>';
    btn.setAttribute("aria-label", on ? "暂停" : "播放");
  }
  function hint(on) {
    const el = $("cy-hint");
    el.style.transition = "opacity .5s";
    el.style.opacity = on && page.x < 0.5 && voices.length ? 0.9 : 0;
  }
  // 进来：一片空，几笔画出匣子，再浮上一点影子
  async function enter() {
    setState("drawing");
    s1.style.display = "none";
    cur = null;
    focus = 0;
    box.s = 1;
    box.dy = 0;
    box.press = 1;
    box.rot = 0;
    buildBox();
    paintBox();
    $("cy-boxshadow").style.opacity = 0;
    clearTimeout(shakeT);
    $("cy-empty").style.transition = "none";
    $("cy-empty").style.opacity = 0;
    choose();
    await wait(reduce ? 0 : 140);
    if (dead) return;
    await tween(ms(P.drawMs), (e) => drawnAt(e), (t) => t);
    await tween(ms(P.shadowMs), (e) => {
      $("cy-boxshadow").style.opacity = e;
      G.inside.style.opacity = e;
    });
    setState("ready");
    hint(true);
  }

  // ======================= 第二页：一根线串起来的全部 =======================
  const deckEl = $("cy-deck");
  const wrapEl = $("cy-listwrap");
  let rows = [];
  let openRow = null;
  let ringRow = null;
  let scrollY = 0;
  let scrollV = 0;
  const TOP = 56;
  const FADE = 56;
  const RING_C = 2 * Math.PI * 16.5;
  function makeRow(v) {
    const el = document.createElement("div");
    el.className = "cy-vrow";
    el.dataset.id = v.id;
    el.innerHTML = `
      <button class="cy-ring" aria-label="播放"><svg viewBox="0 0 34 34" aria-hidden="true"><circle class="cy-track" cx="17" cy="17" r="16.5"/><circle class="cy-prog" cx="17" cy="17" r="16.5"/><path class="cy-tri" d="M14 11.6 L23 17 L14 22.4 Z"/><path class="cy-bars" d="M14.6 12.4 V21.6 M19.4 12.4 V21.6"/></svg></button>
      <div class="cy-body" tabindex="0">
        <div class="cy-q"></div>
        <div class="cy-meta"><span class="cy-d"></span><span class="cy-len"></span><button class="cy-out" aria-label="移出藏音匣" tabindex="-1">移出</button></div>
      </div>`;
    const t = String(v.text || "").replace(/\s+/g, " ").trim();
    const full = "“" + t + "”";
    el.querySelector(".cy-d").textContent = dayOf(v.at);
    el.querySelector(".cy-len").textContent = lenOf(v.dur);
    const r = { v, el, q: el.querySelector(".cy-q"), prog: el.querySelector(".cy-prog"), btn: el.querySelector(".cy-ring"), mon: null, tok: 0, full, cut: full };
    r.q.textContent = full;
    r.prog.style.strokeDasharray = RING_C.toFixed(2);
    r.prog.style.strokeDashoffset = RING_C.toFixed(2);
    // 键盘、读屏也按得动（手指走下面“手指”那一套；见 viaKeys）
    const body = el.querySelector(".cy-body");
    r.btn.addEventListener("click", (e) => viaKeys(e) && togglePlay(r));
    el.querySelector(".cy-out").addEventListener("click", (e) => viaKeys(e) && openRow === r && removeRow(r));
    body.addEventListener("click", (e) => viaKeys(e) && !e.target.closest(".cy-out") && setOpen(openRow === r ? null : r));
    body.addEventListener("keydown", (e) => e.target === body && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(openRow === r ? null : r)));
    return r;
  }
  function buildDeck(keepScroll) {
    if (playing && playing.where !== 1) stopAudio();
    deckEl.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "cy-inner";
    rows = [];
    openRow = null;
    ringRow = null;
    let mon = null;
    let key = null;
    const nowY = new Date().getFullYear();
    for (const v of voices) {
      const k = monthKey(v.at);
      if (k !== key) {
        key = k;
        mon = document.createElement("div");
        mon.className = "cy-mon";
        mon.innerHTML = `<span></span>`;
        mon.firstChild.textContent = monthOf(v.at, nowY);
        inner.appendChild(mon);
      }
      const r = makeRow(v);
      r.mon = mon;
      inner.appendChild(r.el);
      rows.push(r);
    }
    deckEl.appendChild(inner);
    if (!keepScroll) {
      scrollY = 0;
      scrollV = 0;
    }
    layoutList();
    if (keepScroll) kickList();
    $("cy-deckempty").style.display = voices.length ? "none" : "block";
  }
  // 列表到哪儿为止：跟着底下那枝花走（花是“铺满、贴底”摆的，花最高那片叶子在原图 1539 / 2556 那儿），
  // 淡掉的那一截正好落在花顶上；屏幕矮的时候至少留四五行
  const viewH = () => {
    const sc = Math.max(W / 1179, H / 2556);
    const top = H - (2556 - 1539) * sc;
    return Math.round(clamp(top + P.listOverlap, Math.min(H, TOP + safeT + 61 * 4.6 + FADE), H));
  };
  function layoutList() {
    wrapEl.style.height = viewH() + "px";
    fitRows();
    paintScroll();
  }
  // 收着的时候一句话一行：放不下就截短，省略号紧挨着后引号
  let meas = null;
  function fitRows() {
    if (!rows.length) return;
    const cs = getComputedStyle(rows[0].q);
    const w = rows[0].q.clientWidth - 2;
    if (!(w > 0)) return;
    if (!meas) meas = document.createElement("canvas").getContext("2d");
    meas.font = `${cs.fontSize} ${cs.fontFamily}`;
    const ls = parseFloat(cs.letterSpacing) || 0;
    const width = (t) => meas.measureText(t).width + ls * [...t].length;
    for (const r of rows) {
      r.cut = cutQuote(r.v.text, width, w);
      if (r !== openRow && !r.el.classList.contains("cy-wrap")) r.q.textContent = r.cut;
    }
  }
  const maxScroll = () => Math.max(0, deckEl.offsetHeight - viewH());
  function paintScroll() {
    deckEl.style.transform = `translate3d(0, ${(-scrollY).toFixed(2)}px, 0)`;
  }
  function stepList(dt) {
    if (finger && finger.mode === "scroll") return false;
    let busy = false;
    const mx = maxScroll();
    if (scrollY < 0 || scrollY > mx) {
      const edge = scrollY < 0 ? 0 : mx;
      scrollV += (-(scrollY - edge) * 180 - scrollV * 26) * dt;
      scrollY += scrollV * dt;
      if (Math.abs(scrollY - edge) < 0.3 && Math.abs(scrollV) < 5) {
        scrollY = edge;
        scrollV = 0;
      } else busy = true;
    } else if (Math.abs(scrollV) > 4) {
      scrollY += scrollV * dt;
      scrollV *= Math.exp(-P.scrollFriction * dt);
      busy = true;
    } else scrollV = 0;
    paintScroll();
    return busy;
  }
  function kickList() {
    steppers.add(stepList);
    kick();
  }
  // 翻到让这一行整个露出来（只挪需要的那一点）
  function reveal(r) {
    const sr = stage.getBoundingClientRect();
    const b = r.el.getBoundingClientRect();
    const top = b.top - sr.top;
    const bot = b.bottom - sr.top;
    const lo = TOP + safeT - 6;
    const hi = viewH() - FADE * 0.7;
    let d = 0;
    if (bot > hi) d = bot - hi;
    if (top - d < lo) d = top - lo;
    if (Math.abs(d) < 1) return;
    const y0 = scrollY;
    const y1 = clamp(scrollY + d, 0, maxScroll());
    scrollV = 0;
    tween(ms(320), (e) => {
      if (finger && finger.mode === "scroll") return;
      scrollY = lerp(y0, y1, e);
      paintScroll();
    }, E.inOutCubic);
  }
  // 那一句展开 / 收起：只动那句话的高度，日期那一行跟着往下走
  function animQ(r, from, to, done) {
    const tok = ++r.tok;
    r.q.style.height = from + "px";
    return tween(ms(P.expandMs), (e) => {
      if (r.tok !== tok) return;
      r.q.style.height = lerp(from, to, e).toFixed(2) + "px";
    }, E.inOutCubic).then(() => {
      if (r.tok !== tok) return;
      r.q.style.height = "";
      if (done) done();
    });
  }
  function setOpen(r) {
    if (openRow === r) return;
    const old = openRow;
    openRow = r;
    mark("open", r ? r.v.id : "");
    if (old) {
      const h1 = old.q.offsetHeight;
      old.el.classList.remove("cy-open");
      const h0 = old.q.offsetHeight;
      old.el.classList.add("cy-wrap"); // 收的时候先还是一整段，收完再变回一行
      animQ(old, h1, h0, () => {
        old.el.classList.remove("cy-wrap");
        old.q.textContent = old.cut;
      });
    }
    if (r) {
      const h0 = r.q.offsetHeight;
      r.el.classList.remove("cy-wrap");
      r.el.classList.add("cy-open");
      r.q.textContent = r.full;
      r.q.style.height = "";
      const h1 = r.q.offsetHeight;
      animQ(r, h0, h1, () => reveal(r));
    }
  }
  function togglePlay(r) {
    if (playing && playing.where === r && isPlaying()) {
      pauseAudio();
      syncIcons();
      return;
    }
    if (!startAudio(r.v, r)) return;
    setOpen(r);
    syncIcons();
    kick();
  }
  function setRing(r, f) {
    r.prog.style.strokeDashoffset = (RING_C * (1 - clamp(f, 0, 1))).toFixed(2);
  }
  // 哪一行在放：圈画到哪儿、三角还是两竖
  function paintRows() {
    const r = playing && playing.where && playing.where !== 1 ? playing.where : null;
    if (ringRow && ringRow !== r) {
      setRing(ringRow, 0);
      ringRow.el.classList.remove("cy-on");
      ringRow.btn.setAttribute("aria-label", "播放");
    }
    ringRow = r;
    if (!r) return;
    setRing(r, progressOf(r.v));
    const on = isPlaying();
    if (r.el.classList.contains("cy-on") !== on) {
      r.el.classList.toggle("cy-on", on);
      r.btn.setAttribute("aria-label", on ? "暂停" : "播放");
    }
  }
  // 放完：圈画满了，轻轻淡掉再回到空圈
  async function endRow(r) {
    playing = null;
    ringRow = null;
    mark("playing", "");
    r.el.classList.remove("cy-on");
    r.btn.setAttribute("aria-label", "播放");
    setRing(r, 1);
    await tween(ms(420), (e) => (r.prog.style.opacity = 1 - e));
    if (ringRow !== r) setRing(r, 0);
    r.prog.style.opacity = "";
  }
  async function removeRow(r) {
    if (r.gone) return;
    r.gone = true;
    if (playing && playing.where === r) stopAudio();
    if (openRow === r) {
      openRow = null;
      mark("open", "");
    }
    paintRows();
    syncIcons();
    api.onRemove(r.v.id);
    const el = r.el;
    const h = el.offsetHeight;
    el.style.height = h + "px";
    el.style.overflow = "hidden";
    el.style.boxSizing = "border-box";
    const mon = r.mon && rows.every((x) => x === r || x.gone || x.mon !== r.mon) ? r.mon : null; // 这个月就剩它一条：月份也一起拿掉
    const mh = mon ? mon.offsetHeight : 0;
    await tween(ms(340), (e, t) => {
      el.style.opacity = Math.max(0, 1 - t * 1.8);
      el.style.height = lerp(h, 0, e).toFixed(2) + "px";
      el.style.paddingTop = el.style.paddingBottom = lerp(8, 0, e).toFixed(2) + "px";
      if (mon) {
        mon.style.opacity = Math.max(0, 1 - t * 1.8);
        mon.style.height = lerp(mh, 0, e).toFixed(2) + "px";
      }
    }, E.inOutCubic);
    el.remove();
    if (mon) mon.remove();
    rows = rows.filter((x) => x !== r);
    voices = voices.filter((v) => v.id !== r.v.id);
    if (next && next.id === r.v.id) choose();
    $("cy-deckempty").style.display = voices.length ? "none" : "block";
    kickList();
  }
  function tap2(t) {
    const rowEl = t && t.closest && t.closest(".cy-vrow");
    const r = rowEl && rows.find((x) => x.el === rowEl);
    if (!r || r.gone) return setOpen(null);
    if (t.closest(".cy-ring")) return togglePlay(r);
    if (t.closest(".cy-out") && r === openRow) return removeRow(r);
    setOpen(openRow === r ? null : r);
  }
  function vel(ss, k) {
    if (ss.length < 2) return 0;
    const a = ss[0];
    const b = ss[ss.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b[k] - a[k]) / dt : 0;
  }

  // ======================= 两页上下接着：跟手、甩、吸住 =======================
  const pagesEl = $("cy-pages");
  const page = new Spr(0);
  function paintPages() {
    pagesEl.style.transform = `translateY(${-page.x * H}px)`;
    const n = page.x > 0.5 ? 1 : 0;
    if (root.dataset.page === String(n)) return;
    mark("page", n);
    // 读屏只念眼前这一页
    $("cy-p1").setAttribute("aria-hidden", n ? "true" : "false");
    $("cy-p2").setAttribute("aria-hidden", n ? "false" : "true");
    $("cy-flip").textContent = n ? "回到匣子" : "看藏音匣里的全部";
  }
  function stepPage(dt) {
    page.step(dt, P.pageK, P.pageC);
    paintPages();
    if (page.still(0.0008)) {
      page.x = page.t;
      paintPages();
      return false;
    }
    return true;
  }
  function goPage(n, v = 0) {
    page.t = n;
    page.v = v;
    steppers.add(stepPage);
    kick();
    hint(n === 0 && state === "ready");
  }

  // ======================= 手指 =======================
  let finger = null;
  const inUI = (el) => !!(el && el.closest && el.closest(".cy-ui"));
  const onDown = (e) => {
    if (inUI(e.target)) return;
    if (finger) {
      // 第二根手指不管；上一根手指没收尾（抬起来那一下没传到）又按下来头一根：上一根当取消了
      if (!e.isPrimary) return;
      up({ pointerId: finger.id }, true);
    }
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    finger = { id: e.pointerId, x0: x, y0: y, x, y, t0: e.timeStamp, mode: "", target: e.target, samples: [{ t: e.timeStamp, y }], page0: page.x, scroll0: scrollY };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (er) {}
    if (page.x > 0.5) {
      if (Math.abs(scrollV) > 40) finger.stopped = true; // 正在滑：这一下只是按停，不算点
      scrollV = 0;
    }
  };
  const onMove = (e) => {
    if (!finger || e.pointerId !== finger.id) return;
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    finger.x = x;
    finger.y = y;
    finger.samples.push({ t: e.timeStamp, y });
    while (finger.samples.length > 2 && e.timeStamp - finger.samples[0].t > 90) finger.samples.shift();
    const dx = x - finger.x0;
    const dy = y - finger.y0;
    if (!finger.mode) {
      if (Math.hypot(dx, dy) < 7) return;
      if (page.x < 0.5) finger.mode = Math.abs(dy) > Math.abs(dx) * 0.8 ? "page" : "none";
      else finger.mode = "scroll";
      finger.y0 = y;
      finger.page0 = page.x;
      finger.scroll0 = scrollY;
      steppers.delete(stepPage);
    }
    const d = y - finger.y0;
    if (finger.mode === "page") {
      let p = finger.page0 - d / H;
      if (p < 0) p = p * 0.3;
      if (p > 1) p = 1 + (p - 1) * 0.3;
      page.set(p);
      paintPages();
      hint(false);
    } else if (finger.mode === "scroll") {
      let sY = finger.scroll0 - d;
      const mx = maxScroll();
      if (sY < 0) {
        // 已经翻到顶了还往下拉：拉的是整页，回第一页
        scrollY = 0;
        page.set(clamp(1 + sY / H, 0, 1));
        paintPages();
        finger.pulling = true;
      } else {
        if (page.x !== 1) {
          page.set(1);
          paintPages();
        }
        finger.pulling = false;
        if (sY > mx) sY = mx + (sY - mx) * 0.35;
        scrollY = sY;
      }
      paintScroll();
    }
  };
  const up = (e, cancel) => {
    if (!finger || e.pointerId !== finger.id) return;
    const f = finger;
    finger = null;
    const vy = vel(f.samples, "y") / 1000; // 像素/毫秒
    if (f.mode === "scroll") {
      if (f.pulling) {
        const n = 1 - page.x > P.pageThreshold || vy > P.pageVelocity ? 0 : 1;
        return goPage(n, (-vy * 1000) / H);
      }
      scrollV = cancel ? 0 : -vy * 1000;
      return kickList();
    }
    if (f.mode === "page") {
      const moved = page.x - f.page0;
      let n = f.page0 > 0.5 ? 1 : 0;
      if (n === 0 && (moved > P.pageThreshold || -vy > P.pageVelocity)) n = 1;
      if (n === 1 && f.page0 > 0.5 && (-moved > P.pageThreshold || vy > P.pageVelocity)) n = 0;
      return goPage(n, (-vy * 1000) / H);
    }
    if (f.mode || cancel) return;
    // 点了一下
    if (page.x < 0.5) tap1(f.x, f.y, f.target);
    else if (!f.stopped) tap2(f.target);
  };
  const onUp = (e) => up(e, false);
  const onCancel = (e) => up(e, true);
  stage.addEventListener("pointerdown", onDown);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onCancel);
  // 这一页里的手指不往外走：开封府外壳上划侧栏的那一套别跟着动
  const stopOut = (e) => e.stopPropagation();
  const OUT_EVENTS = ["pointerdown", "pointermove", "pointerup", "touchstart", "touchmove", "touchend", "click"];
  for (const t of OUT_EVENTS) root.addEventListener(t, stopOut);

  function tap1(x, y, target) {
    if (state === "drawing" || state === "out" || state === "back") return;
    const onStrip = s1.style.display !== "none" && target && target.closest && target.closest(".cy-strip");
    if (onStrip) {
      if (target.closest(".cy-play")) return toggle1();
      if (target.closest(".cy-words") && expandable) {
        setOpened(!opened);
        sh = s1.offsetHeight;
        paintPaper(s1, sw, sh);
        pose.y = P_open().y;
        paintStrip1();
        return;
      }
      return;
    }
    // 点在匣子上（缩小、上移以后照眼下的样子算）
    const s = box.s;
    const cy = G.cy + box.dy;
    const inBox = Math.abs(x - G.cx) <= (G.bw / 2) * s + 10 && y >= cy - (G.fh / 2 + G.depth) * s - 10 && y <= cy + (G.fh / 2) * s + 12;
    if (inBox) {
      if (state === "ready") return drawOut();
      if (state === "open") return putBack().then(() => !dead && drawOut());
      return;
    }
    // 点了空白：收回去
    if (state === "open") putBack();
  }

  // 键盘、读屏（VoiceOver 点两下）按出来的“点击”不带手指（detail 是 0）；手指点的那一下上面“手指”那一套已经管了，
  // 跟着来的那个点击（detail 是 1）不再算一回
  play1.addEventListener("click", (e) => viaKeys(e) && toggle1());
  // 匣子、翻页：给读屏的两个看不见的按钮（手指点匣子、划上划下照旧）
  $("cy-draw").addEventListener("click", (e) => {
    if (!viaKeys(e)) return;
    if (state === "ready") drawOut();
    else if (state === "open") putBack().then(() => !dead && drawOut());
  });
  $("cy-flip").addEventListener("click", (e) => viaKeys(e) && goPage(page.t > 0.5 ? 0 : 1));
  // 左上角很淡的返回：停下声音，回到侧栏
  $("cy-back").addEventListener("click", () => {
    stopAudio();
    api.onBack();
  });
  // 切走了：停下
  const onVis = () => {
    if (document.visibilityState !== "visible" && isPlaying()) pauseAudio();
    syncIcons();
  };
  document.addEventListener("visibilitychange", onVis);
  const onResize = () => {
    if (dead) return;
    buildBox();
    drawnAt(state === "drawing" ? 0 : 1);
    if (state !== "drawing") {
      $("cy-boxshadow").style.opacity = 1;
      G.inside.style.opacity = 1;
    }
    paintBox();
    if (cur && state === "open") {
      layoutStrip1();
      if (opened) setOpened(true);
      sh = s1.offsetHeight;
      paintPaper(s1, sw, sh);
      Object.assign(pose, P_open());
      paintStrip1();
    }
    paintPages();
    layoutList();
    kickList();
  };
  window.addEventListener("resize", onResize);

  // ---------- 开始 ----------
  measure();
  page.set(0);
  paintPages();
  playIcon(play1, false);
  buildDeck(false);
  enter();

  return {
    // 存档里变了（别的设备存了、移出了，或者繁体补好了）：照新的一份摆
    update(list) {
      if (dead) return;
      const fresh = (list || []).slice();
      const byId = new Map(fresh.map((e) => [e.id, e]));
      const live = voices.filter((v) => byId.has(v.id));
      const same = live.length === fresh.length && live.every((v, i) => v.id === fresh[i].id);
      if (same) {
        // 还是那几条（这一页上移出的那一条存档里删掉了，或者繁体补好了）：手里的跟着换字
        for (const v of live) v.trad = byId.get(v.id).trad;
        voices = live;
      } else {
        voices = fresh;
        buildDeck(true);
      }
      // 眼前这一张：繁体补好了就换上（正抽着的，抽完了换）；移出了就收回去
      if (cur) {
        if (!byId.has(cur.id)) dropCur();
        else {
          cur.trad = byId.get(cur.id).trad;
          if (state === "open") swapWords(cur);
        }
      }
      if (!next || !byId.has(next.id)) choose();
      else {
        next = voices.find((v) => v.id === next.id) || next;
        fontsFor(wordsOf(next));
      }
      if (state === "ready") hint(true);
    },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(shakeT);
      stopAudio();
      const a = A.el();
      if (a.onended === ours.ended) {
        a.onended = null;
        a.onpause = null;
        a.onerror = null;
      }
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onCancel);
      for (const t of OUT_EVENTS) root.removeEventListener(t, stopOut);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      root.innerHTML = "";
    },
  };
}
