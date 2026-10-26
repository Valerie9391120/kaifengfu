// 拼豆怎么画（只在浏览器里用：要画布）。那一页（page.js）、聊天里那张小图（PindouRow.jsx）、发给他的那张图（pngFor）都照这一份画。
// 只有像素的样子（实心方格）：卿卿 10 月 26 日 02:33 说的，“拼豆和熨烫这俩其实可以拿掉 只要像素”。
// 官方 App 里那一页原来还有拼豆（一颗一颗带孔的圆豆子）、熨烫（熨过的圆角方块）两种样子，连那一页顶上的切换一起拿掉了；
// 聊天里那一幅、「他的」那一栏的小图和大图也跟着换成像素（她接着点的“都换成像素”）。

// 三套主题的底板（那一页的 --board，见 style.js 开头怎么挑的；聊天里那一幅也铺在上面，见 PindouRow.jsx）
export const BOARD_OF = { qinglv: "#CEE2DA", dingxiang: "#EEE4F8", heiye: "#6C8090" };

// 有豆子的那一块（上下左右各留 pad 格），一颗都没有回 null
export function boundsOf(n, g, pad = 0) {
  let x0 = n;
  let y0 = n;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (g[y * n + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const bx = Math.max(0, x0 - pad);
  const by = Math.max(0, y0 - pad);
  return { x: bx, y: by, w: Math.min(n, x1 + 1 + pad) - bx, h: Math.min(n, y1 + 1 + pad) - by };
}

// 一幅画到一块画布上：S 是一格多少像素（画布上的像素，可以带小数）；crop 是只画哪一块（boundsOf 回的那样，不给就是整块板子）；
// board 是底板的颜色（不给就是透明的）；check 是空格画成两种深浅的棋盘格（[浅, 深]，同那一页的板子：空板子也看得出是一块板子、多大）。
// 每一格的边取整数，相邻两格中间不露缝
export function paintWork(canvas, n, g, { S, crop = null, board = "", check = null }) {
  const c = crop || { x: 0, y: 0, w: n, h: n };
  canvas.width = Math.max(1, Math.round(c.w * S));
  canvas.height = Math.max(1, Math.round(c.h * S));
  const x = canvas.getContext("2d");
  x.clearRect(0, 0, canvas.width, canvas.height);
  if (board) {
    x.fillStyle = board;
    x.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (let yy = 0; yy < c.h; yy++) {
    const T = Math.round(yy * S);
    const B = Math.round((yy + 1) * S);
    for (let xx = 0; xx < c.w; xx++) {
      const v = g[(yy + c.y) * n + xx + c.x];
      const fill = v || (check ? check[(xx + c.x + yy + c.y) & 1] : "");
      if (!fill) continue;
      const L = Math.round(xx * S);
      x.fillStyle = fill;
      x.fillRect(L, T, Math.round((xx + 1) * S) - L, B - T);
    }
  }
  return canvas;
}

// 发给他的那张图：只截有豆子的那一块（四周留一格），铺一块底板（不用透明的：透明的地方那边看成什么颜色说不准，深色的豆子会看不见）。
// 起先画的是熨烫的样子：圆角、描边、渐变压不小，一张八九十 KB 到一百多 KB；实心方格一张十来 KB（图跟着那一条存在对话里，那一段对话每存一回都整段加密推上去）。
// 她在聊天里看到的那一幅是照作品码现画的（PindouRow.jsx），不是这一张。
// 长边最多 PNG_MAX 像素（他看图按像素算 token，这么大一张四五百个 token）；一颗豆子 6 到 24 个像素（24×24 的板子二十来个，48×48 的十来个），看得清。
// 底色是一块灰里带一点黄的板子（同 style.js 那三块底板的挑法：跟三十九种豆子里最近的那一种差得最远，按 CIE Lab 算，最近的是鼠灰，16.7）。
// 原来用的浅灰 #E4E6EA 跟雪白只差 8.2：实心方格没有外沿，白豆子在上面看不大出来。换色板的时候要重新量
export const PNG_MAX = 576;
export const PNG_BOARD = "#B1AE9C";
export function pngFor(n, g) {
  const b = boundsOf(n, g, 1);
  if (!b) return "";
  const S = Math.max(6, Math.min(24, Math.floor(PNG_MAX / Math.max(b.w, b.h))));
  const c = paintWork(document.createElement("canvas"), n, g, { S, crop: b, board: PNG_BOARD });
  try {
    return c.toDataURL("image/png");
  } catch (e) {
    return "";
  }
}
