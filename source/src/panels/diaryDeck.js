// 闲笔集那一页的手指（见 DiaryPage.jsx）：两页上下接着，上面是月历，下面是选中的那一天；月历左右划换月。
// 跟手、甩、吸住都自己一帧一帧写，不用浏览器的滚动和 CSS 动画（同藏音匣那一页的做法，见 cangyin/page.js）；
// 只有“这一天”那一页里面照常用浏览器的滚动：滑到最顶再往下拉，才接过来翻回月历。
// 这里只挪位置、不管内容：月历的格子、那一天的字都是 DiaryPage.jsx 画的。

// 手感的数
export const DECK = {
  follow: 0.92, // 换月的时候格子跟手指走几成
  k: 240, // 弹簧的劲
  c: 27, // 弹簧的阻尼
  thresh: 0.2, // 划过多少才翻（占屏宽、屏高）
  vel: 0.45, // 甩多快就翻（像素/毫秒）
  edge: 0.55, // 拉过头有多重（越小越重）
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

class Spr {
  constructor(x, still) {
    this.x = x;
    this.v = 0;
    this.to = x;
    this.on = false;
    this.still = still;
  }
  go(to, v) {
    this.to = to;
    if (this.still) {
      this.x = to;
      this.v = 0;
    } else if (v !== undefined) this.v = clamp(v, -7, 7);
    this.on = true;
  }
  step(dt) {
    if (!this.on) return;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-DECK.k * (this.x - this.to) - DECK.c * this.v) * h;
      this.x += this.v * h;
    }
    if (Math.abs(this.x - this.to) < 0.0006 && Math.abs(this.v) < 0.012) {
      this.x = this.to;
      this.v = 0;
      this.on = false;
    }
  }
}

// 拉过头：越拉越重
const rb = (d, dim) => (1 - 1 / ((d * DECK.edge) / dim + 1)) * dim;
function band(x, lo, hi, dim) {
  if (x < lo) return lo - rb((lo - x) * dim, dim) / dim;
  if (x > hi) return hi + rb((x - hi) * dim, dim) / dim;
  return x;
}
// 手指最后那一小段的快慢（像素/毫秒）
function vel(ss, k) {
  if (ss.length < 2) return 0;
  const a = ss[0];
  const b = ss[ss.length - 1];
  return b.t > a.t ? (b[k] - a[k]) / (b.t - a.t) : 0;
}

// els：{ root 整页, pages 两页的那一层, cal 月历那一页, wrap 月历里跟着淡出的那一层, months 装各个月的那一格,
//        day 这一天那一页, sc 它里面滚的那一层, tkY、tkM 年月里会滚的两格, peek 最底下那行小字 }
// live()：眼下的 { count 一共几个月, hasSel 选没选中一天, yearIndex(i) 第 i 个月是第几个年份, blocked 上面盖着别的（手帐那一层），
//          onAt(i) 眼前换成第 i 个月了（还在动）, onMonth(i) 停在第 i 个月了 }
// 返回 { goPage(n), stepMonth(dir), repaint(), remeasure(), pageAt(), destroy() }
export function mountDeck(els, live) {
  const { root, pages, cal, wrap, months, day, sc, tkY, tkM, peek } = els;
  const still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let W = 1;
  let H = 1;
  let wY = [];
  let wM = [];
  let lineH = 1;
  let at = Math.max(0, live().count - 1);
  let pageNow = 0;
  const mpos = new Spr(at, still); // 眼前是第几个月（带小数）
  const page = new Spr(0, still); // 0 月历，1 这一天
  const maxM = () => Math.max(0, live().count - 1);

  function remeasure() {
    W = root.clientWidth || 1;
    H = root.clientHeight || 1;
    wY = [...tkY.firstChild.children].map((e) => e.getBoundingClientRect().width);
    wM = [...tkM.firstChild.children].map((e) => e.getBoundingClientRect().width);
    lineH = tkM.getBoundingClientRect().height || 1;
  }

  // 年月：原地不动，数字跟着手指滚（往后一个月，新的数从底下上来）；数字宽窄不一样的时候，那一格的宽跟着匀过去
  function roll(tk, widths, pos) {
    const max = widths.length - 1;
    if (max < 0) return;
    const soft = pos < 0 ? pos * 0.5 : pos > max ? max + (pos - max) * 0.5 : pos; // 拉过头的时候数字只挪一半
    const i = clamp(Math.floor(pos), 0, max);
    const j = Math.min(max, i + 1);
    const f = clamp(pos - i, 0, 1);
    tk.style.width = (widths[i] + (widths[j] - widths[i]) * f).toFixed(2) + "px";
    tk.firstChild.style.transform = `translate3d(0,${(-soft * lineH).toFixed(2)}px,0)`;
  }
  function paintMonths() {
    const max = maxM();
    const x = mpos.x;
    roll(tkM, wM, x);
    const i = clamp(Math.floor(x), 0, max);
    const j = Math.min(max, i + 1);
    const L = live();
    const yi = L.yearIndex(i);
    roll(tkY, wY, yi + (L.yearIndex(j) - yi) * clamp(x - i, 0, 1));
    const near = Math.round(clamp(x, 0, max));
    for (const el of months.children) {
      const d = Number(el.dataset.i) - x;
      const a = Math.abs(d);
      if (a >= 1.4) {
        el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "visible";
      el.style.transform = `translate3d(${(d * 100).toFixed(3)}%,0,0) scale(${(1 - 0.05 * Math.min(1, a)).toFixed(4)})`;
      el.style.opacity = clamp(1 - 0.62 * a, 0, 1).toFixed(3);
      el.inert = Number(el.dataset.i) !== near;
    }
    if (near !== at) {
      at = near;
      L.onAt(near);
    }
  }
  function paintPages() {
    pages.style.transform = `translate3d(0,${(-page.x * 100).toFixed(3)}%,0)`;
    const x = clamp(page.x, 0, 1);
    wrap.style.opacity = (1 - 0.7 * x).toFixed(3);
    wrap.style.transform = `scale(${(1 - 0.04 * x).toFixed(4)})`;
    peek.style.visibility = x > 0.02 ? "hidden" : "visible";
  }
  // 停在哪一页：另一页碰不着、读屏不念
  function setPage(n) {
    pageNow = n;
    cal.inert = n === 1;
    day.inert = n === 0;
    cal.setAttribute("aria-hidden", n === 1 ? "true" : "false");
    day.setAttribute("aria-hidden", n === 0 ? "true" : "false");
    root.dataset.page = String(n);
    if (n === 0) sc.scrollTop = 0;
  }
  function goPage(n, v) {
    if (n === 1 && !live().hasSel) return;
    if (n === 0 && document.activeElement && root.contains(document.activeElement) && document.activeElement.blur) document.activeElement.blur();
    if (n === 1) day.inert = false;
    page.go(n, v);
    kick();
  }
  function stepMonth(dir) {
    const cur = Math.round(mpos.to);
    const to = clamp(cur + dir, 0, maxM());
    if (to === cur) {
      // 到头了：顶一下回来
      if (!still) mpos.v = dir * 2.2;
      mpos.on = true;
    } else mpos.go(to);
    kick();
  }

  // ---------- 一帧一帧 ----------
  let raf = 0;
  let last = 0;
  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function tick(t) {
    raf = 0;
    const dt = clamp((t - last) / 1000, 0.001, 0.034);
    last = t;
    let busy = false;
    if (mpos.on) {
      mpos.step(dt);
      paintMonths();
      if (mpos.on) busy = true;
      else live().onMonth(Math.round(clamp(mpos.x, 0, maxM())));
    }
    if (page.on) {
      page.step(dt);
      paintPages();
      if (page.on) busy = true;
      else setPage(Math.round(clamp(page.x, 0, 1)));
    }
    if (busy) raf = requestAnimationFrame(tick);
  }

  // ---------- 月历那一页的手指：先看往哪边动，横的换月，竖的翻页 ----------
  let g = null;
  let swallow = false; // 拖过了：手指抬起来以后那一下“点击”不算
  function onDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (g) endG(true);
    swallow = false;
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: null, ox: 0, oy: 0, m0: mpos.x, p0: page.x, ss: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
    mpos.on = false;
    mpos.v = 0;
    page.on = false;
    page.v = 0;
  }
  function onMove(e) {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    g.ss.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (g.ss.length > 2 && e.timeStamp - g.ss[0].t > 90) g.ss.shift();
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      g.ox = dx;
      g.oy = dy;
      swallow = true;
      try {
        cal.setPointerCapture(g.id);
      } catch (er) {}
    }
    if (g.axis === "x") {
      mpos.x = band(g.m0 - ((dx - g.ox) * DECK.follow) / W, 0, maxM(), W);
      paintMonths();
    } else {
      page.x = band(g.p0 - (dy - g.oy) / H, 0, live().hasSel ? 1 : 0, H);
      paintPages();
    }
  }
  function endG(cancel) {
    const G = g;
    g = null;
    if (!G) return;
    try {
      cal.releasePointerCapture(G.id);
    } catch (er) {}
    if (G.axis === "x") {
      const v = cancel ? 0 : vel(G.ss, "x");
      const base = Math.round(clamp(G.m0, 0, maxM()));
      const d = mpos.x - base;
      let to = base;
      if (Math.abs(v) > DECK.vel) to = base + (v < 0 ? 1 : -1);
      else if (Math.abs(d) > DECK.thresh) to = base + Math.sign(d);
      mpos.go(clamp(to, 0, maxM()), (-v * 1000 * DECK.follow) / W);
    } else if (G.axis === "y") {
      const v = cancel ? 0 : vel(G.ss, "y");
      const base = Math.round(clamp(G.p0, 0, 1));
      const d = page.x - base;
      let to = base;
      if (Math.abs(v) > DECK.vel) to = base + (v < 0 ? 1 : -1);
      else if (Math.abs(d) > DECK.thresh) to = base + Math.sign(d);
      to = clamp(to, 0, live().hasSel ? 1 : 0);
      if (to === 1) day.inert = false;
      page.go(to, (-v * 1000) / H);
    } else {
      // 没拖，只是点了一下（点格子那一下是格子自己的“点击”管的）：按下去的时候停住的弹簧接着走完
      mpos.go(Math.round(clamp(mpos.x, 0, maxM())));
      page.go(Math.round(clamp(page.x, 0, 1)));
    }
    kick();
  }
  const onUp = (e) => {
    if (g && e.pointerId === g.id) endG(false);
  };
  const onCancel = (e) => {
    if (g && e.pointerId === g.id) endG(true);
  };
  const onClickCap = (e) => {
    if (!swallow) return;
    swallow = false;
    e.stopPropagation();
    e.preventDefault();
  };
  cal.addEventListener("pointerdown", onDown);
  cal.addEventListener("pointermove", onMove);
  cal.addEventListener("pointerup", onUp);
  cal.addEventListener("pointercancel", onCancel);
  cal.addEventListener("click", onClickCap, true);

  // ---------- 这一天那一页的手指：里面照常滑；在最顶上往下拉，翻回月历 ----------
  let t2 = null;
  function onTStart(e) {
    if (e.touches.length !== 1) {
      t2 = null;
      return;
    }
    const t = e.touches[0];
    t2 = { x0: t.clientX, y0: t.clientY, st: sc.scrollTop, mode: null, ss: [], inField: !!(e.target.closest && e.target.closest("textarea,input")) };
  }
  function onTMove(e) {
    if (!t2) return;
    const t = e.touches[0];
    const dx = t.clientX - t2.x0;
    const dy = t.clientY - t2.y0;
    if (!t2.mode) {
      t2.mode = !t2.inField && !live().blocked && t2.st <= 0 && sc.scrollTop <= 0 && dy > 0 && Math.abs(dy) > Math.abs(dx) ? "pull" : "native";
      if (t2.mode === "pull") {
        page.on = false;
        page.v = 0;
      }
    }
    if (t2.mode !== "pull") return;
    if (e.cancelable) e.preventDefault();
    t2.ss.push({ t: e.timeStamp, y: t.clientY });
    while (t2.ss.length > 2 && e.timeStamp - t2.ss[0].t > 90) t2.ss.shift();
    page.x = clamp(1 - dy / H, -0.15, 1);
    paintPages();
  }
  function endT(cancel) {
    const T2 = t2;
    t2 = null;
    if (!T2 || T2.mode !== "pull") return;
    const v = cancel ? 0 : vel(T2.ss, "y");
    const to = v > DECK.vel || (v > -DECK.vel && 1 - page.x > DECK.thresh) ? 0 : 1;
    goPage(to, (-v * 1000) / H);
  }
  const onTEnd = () => endT(false);
  const onTCancel = () => endT(true);
  sc.addEventListener("touchstart", onTStart, { passive: true });
  sc.addEventListener("touchmove", onTMove, { passive: false });
  sc.addEventListener("touchend", onTEnd);
  sc.addEventListener("touchcancel", onTCancel);

  // ---------- 滚轮、键盘（电脑上、读屏） ----------
  let cool = 0;
  function onWheel(e) {
    if (live().blocked) return;
    const now = performance.now();
    if (now < cool) return;
    if (pageNow === 0 && !page.on) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 24) {
        stepMonth(e.deltaX > 0 ? 1 : -1);
        cool = now + 480;
      } else if (e.deltaY > 24 && live().hasSel) {
        goPage(1);
        cool = now + 600;
      }
    } else if (pageNow === 1 && sc.scrollTop <= 0 && e.deltaY < -24) {
      goPage(0);
      cool = now + 600;
    }
  }
  function onKey(e) {
    if (live().blocked || e.defaultPrevented) return;
    if (e.target && e.target.closest && e.target.closest("textarea,input")) return;
    if (e.key === "Escape") {
      if (pageNow === 1) goPage(0);
      return;
    }
    if (pageNow !== 0) return;
    if (e.key === "ArrowLeft") stepMonth(-1);
    else if (e.key === "ArrowRight") stepMonth(1);
    else if (e.key === "ArrowDown") goPage(1);
  }
  root.addEventListener("wheel", onWheel, { passive: true });
  document.addEventListener("keydown", onKey);

  // 这一页不许被浏览器自己推歪（焦点落进另一页的时候它会想滚过去）
  const onScroll = (e) => {
    const el = e.target;
    if (el === root || el === pages || el === cal || el === months || el === day) {
      if (el.scrollTop) el.scrollTop = 0;
      if (el.scrollLeft) el.scrollLeft = 0;
    }
  };
  root.addEventListener("scroll", onScroll, true);

  function repaint() {
    const max = maxM();
    if (!mpos.on && !g) {
      // 月份的个数变了（跨了月）：还停在原来那个月上，出了界的拉回来
      mpos.x = mpos.to = clamp(Math.round(mpos.x), 0, max);
    }
    paintMonths();
    paintPages();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { remeasure(); repaint(); }) : null;
  if (ro) ro.observe(root);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (root.isConnected) { remeasure(); repaint(); } });

  remeasure();
  setPage(0);
  repaint();

  return {
    goPage,
    stepMonth,
    repaint,
    remeasure,
    pageAt: () => pageNow,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ro) ro.disconnect();
      cal.removeEventListener("pointerdown", onDown);
      cal.removeEventListener("pointermove", onMove);
      cal.removeEventListener("pointerup", onUp);
      cal.removeEventListener("pointercancel", onCancel);
      cal.removeEventListener("click", onClickCap, true);
      sc.removeEventListener("touchstart", onTStart);
      sc.removeEventListener("touchmove", onTMove);
      sc.removeEventListener("touchend", onTEnd);
      sc.removeEventListener("touchcancel", onTCancel);
      root.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKey);
      root.removeEventListener("scroll", onScroll, true);
    },
  };
}
