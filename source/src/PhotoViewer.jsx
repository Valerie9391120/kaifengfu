// =====================================================
// 点开的照片
// 整页不许捏了（见 nozoom.js），这一页自己认双指：捏合缩小放大，放大以后一根手指拖着看，点一下关掉。
// 怎么算在 zoom.js；这里只管把手指落在哪喂进去，照算出来的数挪图。
//
// 几处讲究：
// - 挪图直接改样式，不走 React 的状态：手指一动就重画整棵树，跟不上手
// - 一处都不 preventDefault：这一页（连同里面的图）的 touch-action 是 none，浏览器自己就不滚不缩。
//   这样“点一下关掉”还是浏览器报的 click，长按照片出来的那个“存储图像”也还在
// - 捏过、划过的那一回，抬手以后报来的 click 不算点。按“这一回手指”记，不按钟点记：
//   iPhone 在这种不滚的页面上，按住划一下再抬手也可能报 click；页面忙的时候 click 还会来得很晚。
//   每一回手指全抬起来的时候重新记，所以刚捏完紧接着点一下，照样关得掉
// - 弹回去的那一下还没走完手指又落下来：从图这会儿实际在的地方接着来（见 zoom.js 的 adopt）
// =====================================================
import { useEffect, useRef } from "react";
import { createZoom } from "./zoom.js";

const BACK = 260; // 松手弹回去的那一下走多少毫秒

export default function PhotoViewer({ src, onClose }) {
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const swallow = useRef(false); // 刚才那一回手指捏过、划过：它抬手以后报来的 click 不算

  useEffect(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return undefined;
    // 这一页多大、没放大的时候图多大。从样式里读（带小数，也不受放大的影响）：
    // offsetWidth 是凑成整数的，差的那半个像素放大五倍以后，图的边和屏幕的边之间会露出一条缝。
    // 手指落下的时候量一次，这一回手势里就用它（每动一下都量，白费工夫）
    let size = null;
    const measure = () => {
      const a = getComputedStyle(stage);
      const b = getComputedStyle(img);
      size = {
        W: parseFloat(a.width) || stage.clientWidth,
        H: parseFloat(a.height) || stage.clientHeight,
        w: parseFloat(b.width) || img.offsetWidth,
        h: parseFloat(b.height) || img.offsetHeight,
      };
      return size;
    };
    let backUntil = 0; // 弹回去的那一下到几点走完
    const zoom = createZoom({
      box: () => size || measure(),
      paint: (v, smooth) => {
        img.style.transition = smooth ? `transform ${BACK}ms cubic-bezier(.2,.8,.2,1)` : "none";
        img.style.transform = v.s === 1 && !v.x && !v.y ? "none" : `translate3d(${v.x.toFixed(2)}px, ${v.y.toFixed(2)}px, 0) scale(${v.s.toFixed(4)})`;
        stage.dataset.zoom = String(Math.round(v.s * 100) / 100);
        backUntil = smooth ? Date.now() + BACK + 40 : 0;
      },
    });
    // 手指的位置从这一页的中心量起
    const points = (list) => {
      const r = stage.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return Array.from(list, (t) => ({ id: t.identifier, x: t.clientX - cx, y: t.clientY - cy }));
    };
    const onStart = (e) => {
      measure();
      // 弹回去的那一下还没走完：图这会儿实际在哪，就从哪接着来（手指还按着的时候 adopt 自己不理）
      if (backUntil && Date.now() < backUntil) {
        try {
          const m = new DOMMatrixReadOnly(getComputedStyle(img).transform);
          zoom.adopt({ s: m.a, x: m.e, y: m.f });
        } catch (x) {
          // 读不出来就照算的来，顶多跳一下
        }
      }
      zoom.start(points(e.touches));
    };
    const onMove = (e) => zoom.move(points(e.touches));
    const onEnd = (e) => {
      zoom.end(points(e.touches));
      if (e.touches.length === 0) swallow.current = zoom.moved();
    };
    const onResize = () => {
      measure();
      zoom.refit();
    };
    const passive = { passive: true };
    stage.addEventListener("touchstart", onStart, passive);
    stage.addEventListener("touchmove", onMove, passive);
    stage.addEventListener("touchend", onEnd, passive);
    stage.addEventListener("touchcancel", onEnd, passive);
    window.addEventListener("resize", onResize);
    return () => {
      stage.removeEventListener("touchstart", onStart);
      stage.removeEventListener("touchmove", onMove);
      stage.removeEventListener("touchend", onEnd);
      stage.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("resize", onResize);
    };
  }, [src]);

  return (
    <div
      ref={stageRef}
      role="dialog"
      aria-label="看照片"
      data-zoom="1"
      onClick={() => {
        if (swallow.current) {
          swallow.current = false;
          return;
        }
        onClose();
      }}
      className="kfs-viewer absolute inset-0 z-50 flex items-center justify-center kfs-in"
      style={{ background: "rgba(var(--k-dim),0.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", overflow: "hidden", touchAction: "none" }}
    >
      <img
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        style={{ maxWidth: "92%", maxHeight: "86%", borderRadius: 18, objectFit: "contain", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", touchAction: "none" }}
      />
    </div>
  );
}
