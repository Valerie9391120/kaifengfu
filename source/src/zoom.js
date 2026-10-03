// =====================================================
// 看照片：双指捏着放大缩小，放大以后手指拖着看
// 整页不许捏了（见 nozoom.js），照片要看清楚就得自己认双指。
// 这里只管算，不碰页面：PhotoViewer.jsx 把手指落在哪喂进来，再照算出来的数去挪图。
//
// 记法：图摆在那一页的正中。s 是放大了几倍；x、y 是图的中心离那一页的中心多远（像素）。
// 手指的位置也从那一页的中心量起，每根手指是 { id, x, y }。
// box() 现量现报：W、H 是那一页多大，w、h 是没放大的时候图多大。
// =====================================================

export const LIMIT = {
  min: 1, // 最小就是刚点开的样子
  max: 5, // 最多放大五倍
  give: 0.35, // 拉过头了还跟着走一点：过头的那一截只算三成半，松手弹回去（所以捏得再狠，手里的图也不小过 0.65 倍）
  ceil: 7, // 拉得再开，手里的图也不大过七倍
  slop: 3, // 一根手指挪了不到这么多像素，图不跟着动（手指按下去本来就会抖）
  tap: 10, // 挪了不到这么多像素，抬手那一下还算“点一下”（浏览器自己也是差不多这个数才不报 click）
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const soft = (v, lo, hi) => (v < lo ? lo - (lo - v) * LIMIT.give : v > hi ? hi + (v - hi) * LIMIT.give : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const same = (a, b) => a.s === b.s && a.x === b.x && a.y === b.y;

// 放大到 s 倍的时候，图的中心最多能离开正中多远：图比那一页大出来的那一半。
// 没大出来就只能待在正中（哪一边没大出来，哪一边就不能挪）
export function reach(s, box) {
  return { x: Math.max(0, (box.w * s - box.W) / 2), y: Math.max(0, (box.h * s - box.H) / 2) };
}

// 松手以后该停在哪：倍数收回一到五倍之间，图的边不许跑进那一页里面来。
// anchor 是最后那一回双指中间的那一点：倍数被收回来的时候，那一点底下的图不动
export function settle(view, box, anchor) {
  const s = clamp(view.s, LIMIT.min, LIMIT.max);
  let { x, y } = view;
  if (s !== view.s && anchor) {
    const k = s / view.s;
    x = anchor.x - (anchor.x - view.x) * k;
    y = anchor.y - (anchor.y - view.y) * k;
  }
  const r = reach(s, box);
  // 加 0 是把 -0 收成 0（比大小、写进样式都省得多一种情况）
  return { s, x: clamp(x, -r.x, r.x) + 0, y: clamp(y, -r.y, r.y) + 0 };
}

// 认手势的那个小东西。paint(view, smooth)：把图挪到 view；smooth 是松手弹回去的那一下，要带过渡
export function createZoom({ box, paint }) {
  let view = { s: 1, x: 0, y: 0 };
  let g = null; // 这一回手势：{ kind: "pinch", from, a, b, m0, d0 } 或 { kind: "drag", from, a, p0 }
  let anchor = null; // 最后那一回双指中间的那一点
  let moved = false; // 这一回手指落下以来，是不是真的捏过、拖过（是的话，抬手那一下不算“点一下关掉”）

  const show = (next, smooth) => {
    view = next;
    paint(view, !!smooth);
  };
  // 手还没松：过了头的那一截带点阻力
  const held = (s, x, y) => {
    const r = reach(s, box());
    return { s, x: soft(x, -r.x, r.x), y: soft(y, -r.y, r.y) };
  };
  const find = (touches, id) => touches.find((t) => t.id === id);
  const begin = (touches) => {
    if (touches.length >= 2) {
      const [a, b] = touches;
      g = { kind: "pinch", from: view, a: a.id, b: b.id, m0: mid(a, b), d0: Math.max(1, dist(a, b)) };
    } else if (touches.length === 1) {
      g = { kind: "drag", from: view, a: touches[0].id, p0: { x: touches[0].x, y: touches[0].y } };
    } else g = null;
  };

  return {
    view: () => view,
    moved: () => moved,

    // 有手指落下。touches 是这会儿屏幕上所有的手指（下同）
    start(touches) {
      if (!g) moved = false;
      begin(touches);
    },

    // 手指在动
    move(touches) {
      if (!g) return;
      if (g.kind === "pinch") {
        const a = find(touches, g.a);
        const b = find(touches, g.b);
        if (!a || !b) return;
        const m = mid(a, b);
        const s = Math.min(LIMIT.ceil, soft((g.from.s * dist(a, b)) / g.d0, LIMIT.min, LIMIT.max));
        const k = s / g.from.s;
        // 两根手指刚落下时中间那一点底下的图，跟着手指中间那一点走：捏哪儿，哪儿就在手底下放大
        anchor = m;
        moved = true;
        show(held(s, m.x - (g.m0.x - g.from.x) * k, m.y - (g.m0.y - g.from.y) * k));
        return;
      }
      // 没放大的时候，图不跟着一根手指走（那多半是要点一下关掉，或者手滑了一下）
      if (g.from.s <= LIMIT.min) return;
      const p = find(touches, g.a);
      if (!p) return;
      const dx = p.x - g.p0.x;
      const dy = p.y - g.p0.y;
      const far = Math.hypot(dx, dy);
      if (!g.live && far < LIMIT.slop) return;
      g.live = true;
      // 放大着的时候点一下，手指难免带着图挪几个像素：图跟着走，但这还算点，不算拖
      if (far >= LIMIT.tap) moved = true;
      show(held(g.from.s, g.from.x + dx, g.from.y + dy));
    },

    // 有手指抬起（或者被系统打断）。还剩着手指：从眼下的样子接着来，图不跳。都抬起来了：该弹回去的弹回去
    end(touches) {
      if (touches.length) {
        begin(touches);
        return;
      }
      g = null;
      const rest = settle(view, box(), anchor);
      if (!same(rest, view)) show(rest, true);
    },

    // 屏幕转了、那一页的大小变了：照新的大小收一收
    refit() {
      if (g) return;
      const rest = settle(view, box(), null);
      if (!same(rest, view)) show(rest, false);
    },
  };
}
