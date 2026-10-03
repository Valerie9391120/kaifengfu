// =====================================================
// 整页不许捏
// 卿卿定的：开封府是固定的，不跟着双指放大缩小（原来两根手指一捏，整个界面会缩到左上角去）。
// 三道一起上，哪一道在她的手机上管用都行：
//   1. 网页开头那行 viewport 写明不缩放（build.mjs 的 VIEWPORT）。
//      主屏幕上的网页认；Safari 里直接打开的不认（苹果给看不清字的人留的口子）
//   2. input.css 里 html、body 的 touch-action: pan-x pan-y。只许上下左右滑，双指捏、双击放大都不算
//   3. 这里：Safari 独有的 gesturestart / gesturechange（两根手指一落、一动就报），拦掉
// 不去拦 touchmove：给 touchmove 挂一个“会拦”的监听，每回手指落下浏览器都得先等网页点头才肯滚，聊天记录滚起来会顿。
// 看照片那一页自己认双指（zoom.js、PhotoViewer.jsx），不靠整页缩放。
// =====================================================

const GESTURES = ["gesturestart", "gesturechange", "gestureend"];

export function initNoZoom(doc = typeof document !== "undefined" ? document : null) {
  if (!doc || !doc.addEventListener) return () => {};
  const stop = (e) => {
    if (e.cancelable !== false) e.preventDefault();
  };
  for (const type of GESTURES) doc.addEventListener(type, stop, { passive: false });
  return () => {
    for (const type of GESTURES) doc.removeEventListener(type, stop);
  };
}
