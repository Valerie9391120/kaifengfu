import { useLayoutEffect } from "react";
import { createSlide, enterLook, ENTER_MS, ENTER_X } from "../slide.js";

// 一整页进来的那一下：从右边滑到位、一边淡入，自己一帧一帧写，不交给 CSS 动画（为什么见 slide.js）。
// 系统开了“减弱动态效果”的不滑，直接在位（原来 CSS 里也是这个规矩）。
// 用它的那一页要自己把 CSS 的入场动画关掉（身上写 animation: none），不然两边一起动
export function useSlideIn(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let still = false;
    try {
      still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}
    if (still) return undefined;
    const slide = createSlide({
      put: (v) => {
        const look = enterLook(v);
        el.style.transform = look.transform;
        el.style.opacity = look.opacity;
      },
      raf: (fn) => requestAnimationFrame(fn),
      caf: (id) => cancelAnimationFrame(id),
      now: () => performance.now(),
      ms: ENTER_MS,
    });
    // 画出来之前先摆在起点上（这里赶在头一回画之前），再往到位的地方滑
    slide.jump(ENTER_X);
    slide.to(0);
    return () => slide.stop();
  }, []);
}
