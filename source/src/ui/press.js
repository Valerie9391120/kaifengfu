import { useRef } from "react";

// 这一回手指落下以来，屏幕上有没有同时出现过两根手指。长按只认一根：两根手指是在捏，不是在按。
// 整页不许捏以后，她照老习惯在气泡、照片上捏一下，不该把长按的菜单捏出来。
// 挂在整页上、抢在前头听：第二根手指落在别的东西上，被按着的那个气泡自己是听不到的
export let twoFingers = false;
if (typeof document !== "undefined") {
  // 每回有手指落下的时候现数。只在落下的时候数就够了：屏幕上只剩一根、又落下一根，还是两根；
  // 全抬起来以后再落下的头一根，数出来是一根，就是新的一回（不用另外去听“抬起”）
  document.addEventListener("touchstart", (e) => { twoFingers = e.touches.length > 1; }, { capture: true, passive: true });
}

// 长按：一根手指按住不动 0.45 秒；电脑上右键也算。长按以后松手的那一下不算点击
export function useLongPress(onLong) {
  const press = useRef(null);
  const fired = useRef(false);
  const stop = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  return {
    onTouchStart: (e) => {
      const t = e.touches[0];
      const el = e.currentTarget;
      fired.current = false;
      press.current = {
        x: t.clientX,
        y: t.clientY,
        timer: setTimeout(() => {
          press.current = null;
          if (twoFingers) return;
          fired.current = true;
          onLong(el.getBoundingClientRect());
        }, 450),
      };
    },
    onTouchMove: (e) => {
      const p = press.current;
      if (!p) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - p.x) > 8 || Math.abs(t.clientY - p.y) > 8) stop();
    },
    onTouchEnd: stop,
    onTouchCancel: stop,
    onContextMenu: (e) => {
      e.preventDefault();
      onLong(e.currentTarget.getBoundingClientRect());
    },
    onClickCapture: (e) => {
      if (fired.current) {
        e.stopPropagation();
        e.preventDefault();
        fired.current = false;
      }
    },
  };
}
