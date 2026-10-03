// =====================================================
// 整页不许捏
// 卿卿定的：开封府是固定的，不跟着双指放大缩小（原来两根手指一捏，整个界面会缩到左上角去）。
// 三道一起上，哪一道在她的手机上管用都行：
//   1. 网页开头那行 viewport 写明不缩放（build.mjs 的 VIEWPORT）。
//      主屏幕上的网页多半认（查到的说法不一）；Safari 里直接打开的不认（苹果给看不清字的人留的口子）。
//      认的话系统干脆把缩放整个关掉，往里捏缩到左上角的那一下也就没了
//   2. input.css 里每个元素的 touch-action: pan-x pan-y。只许上下左右滑，双指捏、双击放大都不算。
//      要每个元素都写：WebKit 走到会滚的盒子就把这条规矩重新算（见 input.css 里那段话）
//   3. 这里：Safari 独有的 gesturestart / gesturechange（两根手指一落、一动就报），拦掉。
//      只在“还拦得了”的时候管用：聊天记录正滚着的时候落下第二根手指，这一下浏览器不许拦，靠前两道
// 不另外去拦 touchmove：有上面三道，用不着再多一层。
// （拦手势的监听和拦 touchmove 的监听，在 WebKit 里是一类：手指落下时浏览器都要先问网页一声再滚。
//   React 自己挂在根上的那几个监听本来就是这一类，所以多这三个不添新的迟钝。）
// 点开的照片也跟着放大不了了：卿卿说不用（点开的只有她自己发的照片，原图在她相册里）。
// 写过一版照片自己认双指的（捏着放大缩小、拖着看），审过测过，她说不做就撤了，留在 keep/photo-zoom 那一枝上（提交 ad5e500）。
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
