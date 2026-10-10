// =====================================================
// 对话窗怎么滑（侧栏拉出来的时候它往右让开，收回去的时候它滑回来）
//
// 原来这一下是交给系统动画的（CSS 里写 transition: transform .35s）。2026 年 10 月 10 日卿卿报的：
// 在一段聊了很久的对话里拉开侧栏，再点一下露在右边的对话窗，整页白屏、退回开屏；连着几回，
// iPhone 就摆出“重复出现问题”那一页，不再自己重开了。新开的对话里没有这个毛病。
//
// 根子在 iPhone 的 WebKit：一层东西正跑着 transform 的系统动画（CSS 的过渡、动画都算）的时候，
// 它里面所有“单独成层”的东西，不管在不在屏幕上，都要把画面备好
// （WebKit 的 GraphicsLayerCA::updateCoverage，那一行后面还挂着一句“以后再算精确点”）。
// 开封府的每个气泡都是一小块毛玻璃（backdrop-filter），每一块单独成一层；
// 平时只有屏幕上看得见的那几块备着画面，对话窗一跑系统动画，整段对话成百上千块一起备，
// 内存顶破，系统就把这一页杀了。Chrome 不这么干，所以在 Chrome 里试不出来。
//
// 所以对话窗的 transform 不交给系统动画，这里自己一帧一帧写：
// 手指拖着走的时候本来就是这样写的，在她手机上长对话里也是好的。快慢照原来那条曲线，走 0.35 秒。
//
// 往后的规矩：**别给对话窗、聊天记录、或者气泡的哪一层长辈加 transform 的 CSS 过渡和动画**
// （translate、scale、rotate 这几样单写的也一样）。要动，就照这里一帧一帧写。
// 侧栏自己那一层照旧是系统动画：它里面单独成层的只有那几张卡片，都在眼前。
//
// 这里只管“眼下画在哪、往哪儿滑”，不碰 React、不碰页面：
// put(像素) 是把位置写到对话窗身上；raf / caf / now 是排动画帧、取消、看钟。
// =====================================================

export const SLIDE_MS = 350;

// CSS 的 cubic-bezier(x1, y1, x2, y2)：交回一个函数，给它钟点走了几成（0 到 1），它回路走了几成。
// 先用牛顿法找曲线上横着走到 x 的那一点，找不准再对半夹
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (!(x > 0)) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-7) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-7) break;
      t -= e / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 50; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-7) break;
      if (e < 0) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

// 原来写在 CSS 里的那一条：cubic-bezier(.2,.8,.2,1)，起步快、收尾慢。侧栏自己那一层还用着 CSS 里的这一条，两边要一样
export const SLIDE_EASE = bezier(0.2, 0.8, 0.2, 1);

export function createSlide({ put, raf, caf, now, ms = SLIDE_MS, ease = SLIDE_EASE }) {
  let at = 0; // 眼下画在哪（像素）
  let run = null; // 正在滑的那一下：{ to, id }

  const stop = () => {
    if (!run) return;
    caf(run.id);
    run = null;
  };
  const set = (v) => {
    at = v;
    put(v);
  };

  return {
    at: () => at,
    // 正往哪儿去（停着的时候就是眼下在哪）
    goal: () => (run ? run.to : at),
    moving: () => !!run,
    stop,

    // 一下到位，不滑：手指拖着走的时候每动一下叫一回
    jump(v) {
      stop();
      set(v);
    },

    // 自己滑过去。正往那儿滑着的再叫一回：不重来；滑到一半改了主意：从眼下的地方接着往新的地方滑
    to(v) {
      if (run && run.to === v) return;
      stop();
      // 本来就在那儿（差不到半个像素）：写准了就行，不排动画帧
      if (Math.abs(v - at) < 0.5) {
        set(v);
        return;
      }
      const from = at;
      const t0 = now();
      const step = () => {
        // 页面被切走的时候动画帧是停的：回来的头一帧钟点已经过了头，一下到位
        const p = Math.min(1, (now() - t0) / ms);
        if (p >= 1) {
          run = null;
          set(v);
          return;
        }
        set(from + (v - from) * ease(p));
        run.id = raf(step);
      };
      run = { to: v, id: raf(step) };
    },
  };
}
