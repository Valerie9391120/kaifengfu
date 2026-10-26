// 拼豆怎么画（只在浏览器里用：要画布）。那一页（page.js）、聊天里那张小图（PindouRow.jsx）、发给他的那张图（pngFor）都照这一份画。
// 三种样子：bead 拼豆（一颗一颗带孔的圆豆子，带一点高光）、fused 熨烫（熨过以后的圆角方块，孔缩成一个小点）、pixel 像素（实心方格）。
// 原来是官方 App 里那一页里的画法；熨烫的那一种搬过来的时候外沿添了一道淡线（浅色的底板上白豆子看得出边）。

export function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 一颗豆子画成一小块画布（S 是边长多少像素），画板上照这一块盖章
export function makeSprite(hex, mode, S) {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const m = S / 2;
  if (mode === "bead") {
    const R = S * 0.47;
    const r = S * 0.165;
    g.beginPath();
    g.arc(m, m, R, 0, Math.PI * 2);
    g.moveTo(m + r, m);
    g.arc(m, m, r, 0, Math.PI * 2);
    g.fillStyle = hex;
    g.fill("evenodd");
    const gr = g.createRadialGradient(m - R * 0.42, m - R * 0.48, R * 0.04, m, m, R * 1.02);
    gr.addColorStop(0, "rgba(255,255,255,.58)");
    gr.addColorStop(0.3, "rgba(255,255,255,.16)");
    gr.addColorStop(0.62, "rgba(255,255,255,0)");
    gr.addColorStop(1, "rgba(0,0,0,.26)");
    g.fillStyle = gr;
    g.fill("evenodd");
    const lw = Math.max(1, S * 0.035);
    g.lineWidth = lw;
    g.strokeStyle = "rgba(0,0,0,.2)";
    g.beginPath();
    g.arc(m, m, R - lw / 2, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "rgba(0,0,0,.32)";
    g.beginPath();
    g.arc(m, m, r + lw / 2, 0, Math.PI * 2);
    g.stroke();
  } else if (mode === "fused") {
    const p = S * 0.01;
    const rad = S * 0.3;
    const r = S * 0.085;
    g.beginPath();
    rrect(g, p, p, S - 2 * p, S - 2 * p, rad);
    g.moveTo(m + r, m);
    g.arc(m, m, r, 0, Math.PI * 2);
    g.fillStyle = hex;
    g.fill("evenodd");
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, "rgba(255,255,255,.26)");
    gr.addColorStop(0.5, "rgba(255,255,255,0)");
    gr.addColorStop(1, "rgba(0,0,0,.16)");
    g.fillStyle = gr;
    g.fill("evenodd");
    const lw = Math.max(1, S * 0.03);
    g.lineWidth = lw;
    g.strokeStyle = "rgba(0,0,0,.16)";
    g.beginPath();
    rrect(g, p + lw / 2, p + lw / 2, S - 2 * p - lw, S - 2 * p - lw, rad);
    g.stroke();
    g.strokeStyle = "rgba(0,0,0,.25)";
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.fillStyle = hex;
    g.fillRect(0, 0, S, S);
  }
  return c;
}

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

// 一幅画到一块画布上：S 是一格多少像素；crop 是只画哪一块（boundsOf 回的那样，不给就是整块板子）；
// board 是底板的颜色（不给就是透明的）；peg 是空格上的小钉子（拼豆的样子才画）
export function paintWork(canvas, n, g, { S, mode = "fused", crop = null, board = "", peg = "" }) {
  const c = crop || { x: 0, y: 0, w: n, h: n };
  canvas.width = Math.max(1, Math.round(c.w * S));
  canvas.height = Math.max(1, Math.round(c.h * S));
  const x = canvas.getContext("2d");
  x.clearRect(0, 0, canvas.width, canvas.height);
  if (board) {
    x.fillStyle = board;
    x.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (peg && mode === "bead") {
    const pr = S * 0.16;
    x.fillStyle = peg;
    x.beginPath();
    for (let yy = 0; yy < c.h; yy++)
      for (let xx = 0; xx < c.w; xx++) {
        if (g[(yy + c.y) * n + xx + c.x]) continue;
        const cx = xx * S + S / 2;
        const cy = yy * S + S / 2;
        x.moveTo(cx + pr, cy);
        x.arc(cx, cy, pr, 0, Math.PI * 2);
      }
    x.fill();
  }
  const cache = new Map();
  const T = Math.max(2, Math.ceil(S));
  for (let yy = 0; yy < c.h; yy++)
    for (let xx = 0; xx < c.w; xx++) {
      const v = g[(yy + c.y) * n + xx + c.x];
      if (!v) continue;
      let sp = cache.get(v);
      if (!sp) {
        sp = makeSprite(v, mode, T);
        cache.set(v, sp);
      }
      x.drawImage(sp, xx * S, yy * S, S, S);
    }
  return canvas;
}

// 发给他的那张图：像素的样子（实心方格），只截有豆子的那一块（四周留一格），铺一块底板（不用透明的：透明的地方那边看成什么颜色说不准，深色的豆子会看不见）。
// 不用熨烫的样子：圆角、描边、渐变压不小，一张八九十 KB 到一百多 KB；实心方格一张十来 KB（图跟着那一条存在对话里，那一段对话每存一回都整段加密推上去）。
// 她在聊天里看到的那一幅是照作品码现画的熨烫样子（PindouRow.jsx），不是这一张。
// 长边最多 PNG_MAX 像素（他看图按像素算 token，这么大一张四五百个 token）；一颗豆子 6 到 24 个像素（24×24 的板子二十来个，48×48 的十来个），看得清。
// 底色是一块灰里带一点黄的板子（同 style.js 那三块底板的挑法：跟三十九种豆子里最近的那一种差得最远，按 CIE Lab 算，最近的是鼠灰，16.7）。
// 原来用的浅灰 #E4E6EA 跟雪白只差 8.2：实心方格没有外沿，白豆子在上面看不大出来。换色板的时候要重新量
export const PNG_MAX = 576;
export const PNG_BOARD = "#B1AE9C";
export function pngFor(n, g) {
  const b = boundsOf(n, g, 1);
  if (!b) return "";
  const S = Math.max(6, Math.min(24, Math.floor(PNG_MAX / Math.max(b.w, b.h))));
  const c = paintWork(document.createElement("canvas"), n, g, { S, mode: "pixel", crop: b, board: PNG_BOARD });
  try {
    return c.toDataURL("image/png");
  } catch (e) {
    return "";
  }
}
