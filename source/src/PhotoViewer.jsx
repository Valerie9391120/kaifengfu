// =====================================================
// 点开的照片
// 整页不许捏了（见 nozoom.js），这一页自己认双指：捏合缩小放大，放大以后一根手指拖着看，点一下关掉。
// 怎么算在 zoom.js；这里只管把手指落在哪喂进去，照算出来的数挪图。
//
// 几处讲究：
// - 挪图直接改样式，不走 React 的状态：手指一动就重画整棵树，跟不上手
// - 一处都不 preventDefault：这一页的 touch-action 是 none，浏览器自己就不滚不缩。
//   这样“点一下关掉”还是浏览器报的 click（它只在一根手指、没挪动、按得不久的时候报），
//   长按照片出来的那个“存储图像”也还在
// - 刚捏完、拖完的那一下不算点：有的浏览器挪得少也报 click
// =====================================================
import { useEffect, useRef } from "react";
import { createZoom } from "./zoom.js";

const AFTER_MOVE = 350; // 图动过以后这么多毫秒里的 click 不算

export default function PhotoViewer({ src, onClose }) {
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const movedAt = useRef(0);

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
    const zoom = createZoom({
      box: () => size || measure(),
      paint: (v, smooth) => {
        img.style.transition = smooth ? "transform .26s cubic-bezier(.2,.8,.2,1)" : "none";
        img.style.transform = v.s === 1 && !v.x && !v.y ? "none" : `translate3d(${v.x.toFixed(2)}px, ${v.y.toFixed(2)}px, 0) scale(${v.s.toFixed(4)})`;
        stage.dataset.zoom = String(Math.round(v.s * 100) / 100);
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
      zoom.start(points(e.touches));
    };
    const onMove = (e) => zoom.move(points(e.touches));
    const onEnd = (e) => {
      if (zoom.moved()) movedAt.current = Date.now();
      zoom.end(points(e.touches));
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
        if (Date.now() - movedAt.current < AFTER_MOVE) return;
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
        style={{ maxWidth: "92%", maxHeight: "86%", borderRadius: 18, objectFit: "contain", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}
      />
    </div>
  );
}
