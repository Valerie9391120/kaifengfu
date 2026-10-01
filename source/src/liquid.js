// =====================================================
// 液态玻璃（丁香开屏那个滑块用）
//
// 苹果的液态玻璃是系统给原生应用的材质，网页借不到。网上的仿法靠 backdrop-filter 接 SVG 滤镜，
// 只有 Chrome 认，iPhone 的 Safari 不认。这里换个办法：滑块底下压着的是开屏图，是死的，
// 每个像素长什么样我们都知道，所以折射可以自己在画布上一格一格算，哪个浏览器都一样。
// 只用 drawImage / getImageData / putImageData，不用任何滤镜。
//
// 三样东西：
//   1. 轨道：一条玻璃。底下的开屏图按玻璃边的斜面折进来，染上紫色，描上高光。只算一次。
//      算两份：空的（深紫）和灌满的（亮丁香）。圆钮走到哪，灌满的那份就露到哪。
//   2. 圆钮：一颗水珠。每一帧按它的位置、大小、被拉长多少，把它底下的轨道再折一遍。
//   3. 动作：按住鼓起来、变透；拖快了被拉长；顶到头被压扁；松手弹回去，像果冻一样晃两下。
//
// 坐标一律是“轨道自己的 CSS 像素”：左上角是 (0,0)，宽 W，高 H。
// =====================================================

// 调样子的数都在这儿
export const LQ = {
  res: 3, // 画布最多按几倍屏画
  bgRes: 2, // 底下那张画按几倍取样
  blur: 1.1, // 透过轨道看到的画先糊多少（CSS 像素）。糊得少，亮片才看得出被折弯
  // 原图是白底白点，染了色亮片就淡了。亮的地方反差放大一点（亮片在玻璃里发亮），暗的地方压一点（不然像脏了）
  mean: 222,
  gainHi: 1.5,
  gainLo: 0.55,
  ior: 1.5, // 玻璃的折射率

  // 轨道
  tBezel: 13, // 边上那圈斜面多宽
  tBend: 10, // 最外沿把画往里折多少
  tCa: 0.1, // 红蓝错开多少（色散）
  // 空着的那段：深紫的玻璃。先像有色玻璃那样把画滤一遍（相乘），再蒙一层同色的雾
  plainMul: [0.47, 0.37, 0.62],
  plainFog: [86, 66, 126],
  plainFogA: 0.34,
  // 灌满的那段：亮丁香
  fullMul: [0.8, 0.7, 0.98],
  fullFog: [178, 152, 232],
  fullFogA: 0.34,

  // 圆钮
  kBezel: 14,
  kBend: [5.5, 12], // 没按 / 按住
  kCa: 0.14,
  kZoom: 0.09, // 按住时中间放大多少
  kGrow: 0.14, // 按住时整个鼓大多少
  ring: [162, 136, 206], // 她画的那个浅紫的环
  ringW: [8, 4], // 环多宽：没按 / 按住
  ringA: [0.86, 0.2], // 环多实：没按 / 按住
  core: [66, 46, 102], // 环里面的深紫
  coreA: [0.5, 0], // 没按 / 按住（按住就透了）
  veil: 0.05, // 按住时整颗水珠泛一点白
  kShade: 0.2, // 按住时水珠边里面那圈深多少
  feather: 30, // 透过水珠看，灌满和空着的交界有多宽

  // 光从左上来
  light: [-0.5, -0.866],

  // 提示的三个箭头（和页面上画的那三个一个位置、一个粗细）
  hint: { size: 46, sw: 3.4, gap: 30, color: [186, 164, 228], alpha: 0.72 },
};

const N = 256;
const SLOW_MS = 7; // 一帧画水珠超过这么多毫秒算慢
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;

// 玻璃边上那一圈斜面怎么折光。u=0 是最外沿，u=1 是斜面到头（再往里是平的，不折）。
// 斜面的截面是“凸的方圆”，按折射定律算垂直进来的光往里偏多少，归一到最大是 1
export function bezelLut(ior = LQ.ior) {
  const lut = new Float32Array(N + 2);
  let max = 0;
  for (let i = 0; i <= N; i++) {
    const u = Math.max(i / N, 0.5 / N);
    const a = 1 - Math.pow(1 - u, 4);
    const h = Math.pow(a, 0.25);
    const slope = Math.pow(1 - u, 3) * Math.pow(a, -0.75);
    const ti = Math.atan(slope);
    const tr = Math.asin(Math.sin(ti) / ior);
    const v = (h + 0.12) * Math.tan(ti - tr);
    lut[i] = v;
    if (v > max) max = v;
  }
  for (let i = 0; i <= N; i++) lut[i] /= max;
  lut[N] = 0;
  lut[N + 1] = 0;
  return lut;
}

// 方框模糊一遍（横一次竖一次），只动红绿蓝
function boxBlur(px, w, h, r) {
  if (r < 1) return;
  const tmp = new Uint8ClampedArray(px.length);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w * 4;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += px[o + clamp(k, 0, w - 1) * 4 + c];
      for (let x = 0; x < w; x++) {
        tmp[o + x * 4 + c] = sum / win;
        sum += px[o + Math.min(w - 1, x + r + 1) * 4 + c] - px[o + Math.max(0, x - r) * 4 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      const o = x * 4 + c;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[o + clamp(k, 0, h - 1) * w * 4];
      for (let y = 0; y < h; y++) {
        px[o + y * w * 4] = sum / win;
        sum += tmp[o + Math.min(h - 1, y + r + 1) * w * 4] - tmp[o + Math.max(0, y - r) * w * 4];
      }
    }
  }
}

// 把开屏图里轨道底下那一块取出来（多取一圈边），糊一点
// map：开屏图按 cover 铺在页面上的位置 { w, h, scale, ox, oy }；rect：轨道在页面上的位置
function grabBackdrop(img, map, rect, margin) {
  const res = LQ.bgRes;
  const w = Math.ceil((rect.w + margin * 2) * res);
  const h = Math.ceil((rect.h + margin * 2) * res);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#eee3f0";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // 整张图照它在页面上的位置画进来，画布外面的自己裁掉
  ctx.drawImage(img, (map.ox - rect.x + margin) * res, (map.oy - rect.y + margin) * res, map.w * map.scale * res, map.h * map.scale * res);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  // 三遍方框模糊，近似高斯
  const sigma = LQ.blur * res;
  const r = Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2);
  for (let i = 0; i < 3; i++) boxBlur(px, w, h, r);
  return { px, w, h, res, margin };
}

// 轨道：胶囊形的一条玻璃。一次算出空的和灌满的两份
function buildTrack(bg, W, H, S, lut) {
  const w = Math.round(W * S);
  const h = Math.round(H * S);
  const plain = new Uint8ClampedArray(w * h * 4);
  const full = new Uint8ClampedArray(w * h * 4);
  const r = H / 2;
  const bw = bg.w;
  const bh = bg.h;
  const bpx = bg.px;
  const bres = bg.res;
  const bm = bg.margin;
  const [LX, LY] = LQ.light;
  const { tBezel, tBend, tCa, gainHi, gainLo, mean } = LQ;
  const pm = LQ.plainMul;
  const pf = LQ.plainFog;
  const pa = LQ.plainFogA;
  const fm = LQ.fullMul;
  const ff = LQ.fullFog;
  const fa = LQ.fullFogA;

  const tap = (x, y, c) => {
    const fx = clamp((x + bm) * bres - 0.5, 0, bw - 1.001);
    const fy = clamp((y + bm) * bres - 0.5, 0, bh - 1.001);
    const x0 = fx | 0;
    const y0 = fy | 0;
    const tx = fx - x0;
    const ty = fy - y0;
    const i0 = (y0 * bw + x0) * 4 + c;
    const i1 = i0 + bw * 4;
    return (bpx[i0] * (1 - tx) + bpx[i0 + 4] * tx) * (1 - ty) + (bpx[i1] * (1 - tx) + bpx[i1 + 4] * tx) * ty;
  };

  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) / S;
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) / S;
      const px = x < r ? r : x > W - r ? W - r : x;
      const vx = x - px;
      const vy = y - r;
      const dist = Math.sqrt(vx * vx + vy * vy);
      const dRaw = r - dist; // 离边多远（里面是正的）
      const d = dRaw > 0 ? dRaw : 0;
      const nx = dist > 1e-6 ? vx / dist : 0;
      const ny = dist > 1e-6 ? vy / dist : 0;
      const o = (j * w + i) * 4;

      // 折射：边上那圈把画往里折
      const u = d / tBezel;
      let R;
      let G;
      let B;
      if (u < 1) {
        const f = u * N;
        const k = f | 0;
        const disp = (lut[k] + (lut[k + 1] - lut[k]) * (f - k)) * tBend;
        R = tap(x - nx * disp * (1 + tCa), y - ny * disp * (1 + tCa), 0);
        G = tap(x - nx * disp, y - ny * disp, 1);
        B = tap(x - nx * disp * (1 - tCa), y - ny * disp * (1 - tCa), 2);
      } else {
        R = tap(x, y, 0);
        G = tap(x, y, 1);
        B = tap(x, y, 2);
      }
      // 亮片的反差放大
      R = mean + (R - mean) * (R > mean ? gainHi : gainLo);
      G = mean + (G - mean) * (G > mean ? gainHi : gainLo);
      B = mean + (B - mean) * (B > mean ? gainHi : gainLo);

      // 高光：最外沿一道细亮线，朝着光的那边最亮，背光那边也有一点（光从玻璃里穿过去）
      const lit = nx * LX + ny * LY;
      const hi = lit > 0 ? Math.pow(lit, 1.4) : 0.55 * Math.pow(-lit, 2);
      let line = 1 - d / 1.3;
      line = line > 0 ? line * line : 0;
      const glow = Math.exp(-d / 5);
      const sheen = 1 - y / H; // 上半边亮一点
      const add = 255 * (line * (0.16 + 0.74 * hi) + glow * 0.17 * hi) + 16 * sheen * sheen;
      // 边里面一圈暗一点，显得有厚度
      const depth = 1 - 0.2 * Math.exp(-d / 9) * (1 - hi * 0.7);

      const a = clamp(dRaw * S + 0.5, 0, 1) * 255;
      plain[o] = mix(R * pm[0], pf[0], pa) * depth + add;
      plain[o + 1] = mix(G * pm[1], pf[1], pa) * depth + add;
      plain[o + 2] = mix(B * pm[2], pf[2], pa) * depth + add;
      plain[o + 3] = a;
      full[o] = mix(R * fm[0], ff[0], fa) * depth + add;
      full[o + 1] = mix(G * fm[1], ff[1], fa) * depth + add;
      full[o + 2] = mix(B * fm[2], ff[2], fa) * depth + add;
      full[o + 3] = a;
    }
  }
  return { plain, full, w, h };
}

// 提示的三个箭头在轨道里的位置（页面上那三个也照这个摆）
export function hintLayout(pad, knob) {
  const { size, gap } = LQ.hint;
  return { left: pad + knob + 4, size, gap, count: 3 };
}

// 水珠要折的“景”：空轨道上再画上那三个箭头（页面上的箭头会一闪一闪，景里的是稳的）
function withHints(plain, w, h, S, H, pad, knob) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  // 先铺成不透明的再画：带透明边的像素来回读写会走样
  const opaque = new Uint8ClampedArray(plain);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  ctx.putImageData(new ImageData(opaque, w, h), 0, 0);
  const L = hintLayout(pad, knob);
  const k = L.size / 24;
  const [cr, cg, cb] = LQ.hint.color;
  ctx.strokeStyle = `rgba(${cr},${cg},${cb},${LQ.hint.alpha})`;
  ctx.lineWidth = LQ.hint.sw * k * S;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < L.count; i++) {
    const x0 = (L.left + i * L.gap) * S;
    const y0 = ((H - L.size) / 2) * S;
    ctx.beginPath();
    ctx.moveTo(x0 + 9 * k * S, y0 + 6 * k * S);
    ctx.lineTo(x0 + 15 * k * S, y0 + 12 * k * S);
    ctx.lineTo(x0 + 9 * k * S, y0 + 18 * k * S);
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, w, h).data;
}

// 页面上“灌满的那份”右边那道边怎么羽化：和水珠里看到的交界同宽、同一条曲线
export function fillMask() {
  const f = LQ.feather;
  const at = (t) => `calc(100% - ${(f * (1 - t)).toFixed(2)}px)`;
  const a = (t) => (1 - t * t * (3 - 2 * t)).toFixed(3);
  const stops = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1].map((t) => `rgba(0,0,0,${a(t)}) ${at(t)}`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

// 把玻璃备好。算不出来就抛错，外面退回不带玻璃的滑块
export function prepareGlass({ img, map, rect, pad, knob, dpr }) {
  const S = clamp(dpr || 1, 1, LQ.res);
  const lut = bezelLut();
  const bg = grabBackdrop(img, map, rect, 12);
  const t = buildTrack(bg, rect.w, rect.h, S, lut);
  const scene = withHints(t.plain, t.w, t.h, S, rect.h, pad, knob);
  // 灌满的那份也铺成不透明的给水珠折（边上的透明只留给显示用）
  const fullScene = new Uint8ClampedArray(t.full);
  for (let i = 3; i < fullScene.length; i += 4) fullScene[i] = 255;
  return { S, W: rect.w, H: rect.h, w: t.w, h: t.h, plain: t.plain, full: t.full, scene, fullScene, lut };
}

// 把算好的一份画到画布上
export function blit(canvas, px, w, h) {
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);
}

// 高光用的小表：每帧每个像素都算 pow / exp 太慢，先算好查表
const NEAR = 16; // 离边这么远以内才有高光和暗边
const HI = new Float32Array(514); // 朝着光多少 → 多亮
for (let i = 0; i < 514; i++) {
  const l = clamp(i / 256 - 1, -1, 1);
  HI[i] = l > 0 ? Math.pow(l, 1.3) : 0.6 * Math.pow(-l, 1.8);
}
const GLOW = new Float32Array(NEAR * 16 + 2); // 边里面那圈光晕
const SHADE = new Float32Array(NEAR * 16 + 2); // 边里面那圈暗（水珠边上厚，看着深一点）
for (let i = 0; i < GLOW.length; i++) {
  const d = i / 16;
  const fade = clamp((NEAR - d) / 4, 0, 1); // 到 NEAR 正好收到 0，接缝看不出来
  GLOW[i] = Math.exp(-d / 4.2) * fade;
  SHADE[i] = Math.exp(-d / 6.5) * fade;
}

// 水珠：每帧画一次。out 是 cw×ch 的像素，水珠中心在画布中心往右 st.dx 的地方
// st：{ cx, cy（水珠中心在轨道里的位置）, dx, rx, ry, r0（没变形时的半径）, press（0 没按 1 按住）, fillX（灌到哪）}
// 这个函数每帧要过几万个像素，写得啰嗦是为了快
export function paintKnob(g, out, cw, ch, K, st) {
  out.fill(0);
  const { S, w: sw, h: sh, scene, fullScene, lut } = g;
  const { cx, cy, rx, ry, press, fillX } = st;
  const [LX, LY] = LQ.light;
  const rmin = Math.min(rx, ry);
  const k = rmin / st.r0;
  const bez = LQ.kBezel * k;
  const bend = mix(LQ.kBend[0], LQ.kBend[1], press) * k;
  const ca = LQ.kCa;
  const invZoom = 1 / (1 + LQ.kZoom * press);
  const ringW = mix(LQ.ringW[0], LQ.ringW[1], press) * k;
  const ringA = mix(LQ.ringA[0], LQ.ringA[1], press);
  const coreA = mix(LQ.coreA[0], LQ.coreA[1], press);
  const veil = 255 * LQ.veil * press;
  const glowK = 255 * (0.1 + 0.2 * press);
  const shadeK = LQ.kShade * press;
  const [rr, rg, rb] = LQ.ring;
  const [kr, kg, kb] = LQ.core;
  const ife = 1 / LQ.feather;
  const ox = cw / (2 * K) + st.dx; // 水珠中心在画布里的位置（CSS 像素）
  const oy = ch / (2 * K);
  const mx = sw - 1.001;
  const my = sh - 1.001;
  const row = sw * 4;
  // 离边比这远的像素：不折、没环、没高光，走快的那条路
  const deep = Math.max(bez, NEAR, ringW + 1) + 0.5;
  const qin = Math.max(0, 1 - deep / rmin);
  const qin2 = qin * qin;
  // 折得不到这么多（像素）就不分红蓝了，一个位置取三个颜色
  const caMin = 0.35 / ca;

  let tR = 0;
  let tG = 0;
  let tB = 0;
  // 从“景”里一个位置取红绿蓝（双线性）。灌满和空着的交界在 fillX 附近羽化
  const tap3 = (x, y) => {
    let fx = x * S - 0.5;
    let fy = y * S - 0.5;
    fx = fx < 0 ? 0 : fx > mx ? mx : fx;
    fy = fy < 0 ? 0 : fy > my ? my : fy;
    const x0 = fx | 0;
    const y0 = fy | 0;
    const tx = fx - x0;
    const ty = fy - y0;
    const w11 = tx * ty;
    const w10 = tx - w11;
    const w01 = ty - w11;
    const w00 = 1 - tx - ty + w11;
    const a = (y0 * sw + x0) * 4;
    const b = a + row;
    let f = (fillX - x) * ife + 0.5;
    if (f <= 0) {
      tR = scene[a] * w00 + scene[a + 4] * w10 + scene[b] * w01 + scene[b + 4] * w11;
      tG = scene[a + 1] * w00 + scene[a + 5] * w10 + scene[b + 1] * w01 + scene[b + 5] * w11;
      tB = scene[a + 2] * w00 + scene[a + 6] * w10 + scene[b + 2] * w01 + scene[b + 6] * w11;
      return;
    }
    const fr = fullScene[a] * w00 + fullScene[a + 4] * w10 + fullScene[b] * w01 + fullScene[b + 4] * w11;
    const fg = fullScene[a + 1] * w00 + fullScene[a + 5] * w10 + fullScene[b + 1] * w01 + fullScene[b + 5] * w11;
    const fb = fullScene[a + 2] * w00 + fullScene[a + 6] * w10 + fullScene[b + 2] * w01 + fullScene[b + 6] * w11;
    if (f >= 1) {
      tR = fr;
      tG = fg;
      tB = fb;
      return;
    }
    f = f * f * (3 - 2 * f);
    const pr = scene[a] * w00 + scene[a + 4] * w10 + scene[b] * w01 + scene[b + 4] * w11;
    const pg = scene[a + 1] * w00 + scene[a + 5] * w10 + scene[b + 1] * w01 + scene[b + 5] * w11;
    const pb = scene[a + 2] * w00 + scene[a + 6] * w10 + scene[b + 2] * w01 + scene[b + 6] * w11;
    tR = pr + (fr - pr) * f;
    tG = pg + (fg - pg) * f;
    tB = pb + (fb - pb) * f;
  };
  // 只取一个分量（边上分红蓝时用）
  const tap = (x, y, c) => {
    let fx = x * S - 0.5;
    let fy = y * S - 0.5;
    fx = fx < 0 ? 0 : fx > mx ? mx : fx;
    fy = fy < 0 ? 0 : fy > my ? my : fy;
    const x0 = fx | 0;
    const y0 = fy | 0;
    const tx = fx - x0;
    const ty = fy - y0;
    const a = (y0 * sw + x0) * 4 + c;
    const b = a + row;
    let f = (fillX - x) * ife + 0.5;
    if (f <= 0) return (scene[a] + (scene[a + 4] - scene[a]) * tx) * (1 - ty) + (scene[b] + (scene[b + 4] - scene[b]) * tx) * ty;
    const v = (fullScene[a] + (fullScene[a + 4] - fullScene[a]) * tx) * (1 - ty) + (fullScene[b] + (fullScene[b + 4] - fullScene[b]) * tx) * ty;
    if (f >= 1) return v;
    f = f * f * (3 - 2 * f);
    const p = (scene[a] + (scene[a + 4] - scene[a]) * tx) * (1 - ty) + (scene[b] + (scene[b + 4] - scene[b]) * tx) * ty;
    return p + (v - p) * f;
  };

  const irx = 1 / rx;
  const iry = 1 / ry;
  const iK = 1 / K;
  const j0 = Math.max(0, Math.floor((oy - ry - 1) * K));
  const j1 = Math.min(ch, Math.ceil((oy + ry + 1) * K));
  for (let j = j0; j < j1; j++) {
    const ly = (j + 0.5) * iK - oy;
    const ey = ly * iry;
    const ey2 = ey * ey;
    if (ey2 > 1.12) continue;
    const gy = ey * iry;
    const by = cy + ly * invZoom;
    // 这一行里水珠占哪一段
    const half = rx * Math.sqrt(1.12 - ey2);
    const i0 = Math.max(0, Math.floor((ox - half) * K));
    const i1 = Math.min(cw, Math.ceil((ox + half) * K));
    let o = (j * cw + i0) * 4;
    for (let i = i0; i < i1; i++, o += 4) {
      const lx = (i + 0.5) * iK - ox;
      const ex = lx * irx;
      const q2 = ex * ex + ey2;
      const bx = cx + lx * invZoom;

      if (q2 < qin2) {
        // 水珠中间：只是放大了一点
        tap3(bx, by);
        if (coreA > 0) {
          tR += (kr - tR) * coreA;
          tG += (kg - tG) * coreA;
          tB += (kb - tB) * coreA;
        }
        out[o] = tR + veil;
        out[o + 1] = tG + veil;
        out[o + 2] = tB + veil;
        out[o + 3] = 255;
        continue;
      }

      const q = Math.sqrt(q2);
      const gx = ex * irx;
      const gl = Math.sqrt(gx * gx + gy * gy);
      const dRaw = ((1 - q) * q) / gl; // 离边多远（椭圆的近似）
      const cov = dRaw * K + 0.5;
      if (cov <= 0) continue;
      const nx = gx / gl;
      const ny = gy / gl;
      const d = dRaw > 0 ? dRaw : 0;

      // 折射：边上那圈往里折，折得多的地方红蓝错开一点
      let R;
      let G;
      let B;
      if (d < bez) {
        const f = (d / bez) * N;
        const t = f | 0;
        const disp = (lut[t] + (lut[t + 1] - lut[t]) * (f - t)) * bend;
        const sx = nx * disp;
        const sy = ny * disp;
        if (disp > caMin) {
          R = tap(bx - sx * (1 + ca), by - sy * (1 + ca), 0);
          G = tap(bx - sx, by - sy, 1);
          B = tap(bx - sx * (1 - ca), by - sy * (1 - ca), 2);
        } else {
          tap3(bx - sx, by - sy);
          R = tR;
          G = tG;
          B = tB;
        }
      } else {
        tap3(bx, by);
        R = tR;
        G = tG;
        B = tB;
      }

      // 环里面的深紫（按住就透了）
      if (coreA > 0) {
        R += (kr - R) * coreA;
        G += (kg - G) * coreA;
        B += (kb - B) * coreA;
      }
      // 浅紫的环
      if (d < ringW + 1) {
        let ra = (ringW - d) * K * 0.5 + 0.5;
        ra = (ra < 0 ? 0 : ra > 1 ? 1 : ra) * ringA;
        R += (rr - R) * ra;
        G += (rg - G) * ra;
        B += (rb - B) * ra;
      }
      // 高光和暗边：最外沿一道细亮线，朝着光的那边最亮；边里面一圈略深
      let add = veil;
      if (d < NEAR) {
        const lit = nx * LX + ny * LY;
        const hi = HI[((lit + 1) * 256) | 0];
        const di = (d * 16) | 0;
        const m = 1 - shadeK * SHADE[di] * (1 - (lit > 0 ? lit : 0));
        R *= m;
        G *= m;
        B *= m;
        add += glowK * GLOW[di] * hi;
        if (d < 1.25) {
          const l = 1 - d / 1.25;
          add += 255 * l * l * (0.2 + 0.75 * hi);
        }
      }

      out[o] = R + add;
      out[o + 1] = G + add;
      out[o + 2] = B + add;
      out[o + 3] = cov >= 1 ? 255 : cov * 255;
    }
  }
}

// =====================================================
// 动作：滑块的手感。只管位置、形变和每帧往页面上写，不管 React
// els：{ track, knob, body（水珠的影子）, lens（水珠的画布）, icon, fill（灌满那份外面的裁剪框）}
// geom：{ W, H, pad, knob }
// =====================================================
export function createSlider({ els, geom, onDone, reduced }) {
  const { W, H, pad } = geom;
  const R = geom.knob / 2;
  const max = Math.max(1, W - pad * 2 - geom.knob);
  const END = 0.985;

  let glass = null;
  let ctx = null;
  let image = null;
  let K = 1;
  let cw = 0;
  let ch = 0;

  let pos = 0;
  let vel = 0;
  let goal = 0;
  let dragging = false;
  let coasting = false; // 松手以后自己往回弹
  let x0 = 0;
  let p0 = 0;
  let over = 0; // 手指拉出头多少
  let press = 0;
  let pressV = 0;
  let pressGoal = 0;
  let stretch = 0;
  let stretchV = 0;
  let squash = 0;
  let squashV = 0;
  let squashSide = 1;
  let fillExtra = 0;
  let done = false;
  let raf = 0;
  let last = 0;
  let lastPos = 0;
  let dead = false;
  let frames = 0;
  let cost = 0;

  // 水珠的画布比水珠大一圈：拉长、贴墙挪位都画得下
  const CW = Math.ceil(R * 2 * (1 + LQ.kGrow) * 1.3 + 28);
  const CH = Math.ceil(H + 4);
  let slow = 0; // 连着几帧画得慢

  // 水珠的画布按几倍画
  function sizeLens(k) {
    K = k;
    cw = Math.round(CW * K);
    ch = Math.round(CH * K);
    els.lens.width = cw;
    els.lens.height = ch;
    els.lens.style.width = CW + "px";
    els.lens.style.height = CH + "px";
    ctx = els.lens.getContext("2d");
    image = ctx.createImageData(cw, ch);
    slow = 0;
  }

  function setGlass(g) {
    glass = g;
    if (g) sizeLens(g.S);
    paint();
  }

  function spring(x, v, to, k, c, h) {
    const a = -k * (x - to) - c * v;
    v += a * h;
    return [x + v * h, v];
  }

  function step(h) {
    if (coasting) {
      [pos, vel] = spring(pos, vel, goal, 230, 21, h);
      if (pos < 0) {
        // 撞到左头：按撞上去的速度压扁一下
        squashSide = -1;
        squashV += Math.min(5, -vel / 160);
        pos = 0;
        vel = 0;
      } else if (pos > max) {
        squashSide = 1;
        squashV += Math.min(5, vel / 160);
        pos = max;
        vel = 0;
      }
    }
    [press, pressV] = spring(press, pressV, pressGoal, 300, reduced ? 40 : 21, h);
    const eg = reduced ? 0 : clamp(Math.abs(vel) / 2300, 0, 1) * 0.25;
    [stretch, stretchV] = spring(stretch, stretchV, eg, 380, 20, h);
    // 手指拉出头：越拉越压扁，但有个头（橡皮筋）
    const sg = reduced || !dragging ? 0 : 0.2 * (1 - Math.exp(-Math.abs(over) / 110));
    [squash, squashV] = spring(squash, squashV, sg, 420, 22, h);
    const fg = done ? W : 0;
    fillExtra += (fg - fillExtra) * (1 - Math.exp(-h * 9));
  }

  function settled() {
    const still = (x, v, to, e) => Math.abs(x - to) < e && Math.abs(v) < e * 12;
    return (
      (!coasting || still(pos, vel, goal, 0.15)) &&
      Math.abs(vel) < 4 &&
      still(press, pressV, pressGoal, 0.003) &&
      still(stretch, stretchV, 0, 0.003) &&
      still(squash, squashV, dragging ? 0.2 * (1 - Math.exp(-Math.abs(over) / 110)) : 0, 0.003) &&
      Math.abs(fillExtra - (done ? W : 0)) < 0.6
    );
  }

  function paint() {
    const p = clamp(press, 0, 1.25);
    const sc = 1 + LQ.kGrow * clamp(press, -0.2, 1.25); // 松手时允许缩过头一点点再弹回来
    const sq = clamp(squash, -0.12, 0.3);
    const st = clamp(stretch, -0.12, 0.3);
    const wide = R * sc * (1 + st);
    let rx = wide * (1 - sq);
    let ry = R * sc * (1 - 0.5 * st) * (1 + 0.42 * sq);
    ry = Math.min(ry, H / 2 - 0.75);
    rx = Math.min(rx, CW / 2 - 12);
    const base = pad + R + pos;
    // 压扁的时候贴着墙那一边不动
    const cx = clamp(base + squashSide * (wide - rx), rx + 0.75, W - rx - 0.75);
    const dx = cx - base;
    const isDone = pos / max >= END;
    if (isDone !== done) {
      done = isDone;
      els.knob.toggleAttribute("data-done", done);
      if (onDone) onDone(done);
    }
    // 灌到哪：平时灌到水珠中心；刚起步那一小段从最左边长出来，停在开头时一点不露
    const half = LQ.feather / 2;
    const grow = clamp(pos / 44, 0, 1);
    const fillX = Math.min(W + half, mix(-half, cx, grow * grow * (3 - 2 * grow)) + fillExtra);

    els.knob.style.transform = `translate3d(${pos.toFixed(2)}px,0,0)`;
    els.knob.setAttribute("aria-valuenow", String(Math.round((pos / max) * 100)));
    els.body.style.transform = `translate(${dx.toFixed(2)}px,0) scale(${(rx / R).toFixed(4)},${(ry / R).toFixed(4)})`;
    els.icon.style.transform = `translate(${dx.toFixed(2)}px,0) scale(${(1 + 0.1 * p).toFixed(3)})`;
    // 按住的时候水珠是透的，圆钮上的箭头让开，底下的画才看得清
    els.icon.style.opacity = glass ? clamp(1 - p * 1.25, 0, 1).toFixed(3) : "1";
    // 外面那份的边是用遮罩羽化的（见 fillMask），框要比“灌到哪”宽半个羽化
    els.fill.style.width = Math.max(0, fillX + half).toFixed(2) + "px";
    if (glass && ctx) {
      const t0 = performance.now();
      paintKnob(glass, image.data, cw, ch, K, { cx, cy: H / 2, dx, rx, ry, r0: R, press: clamp(p, 0, 1), fillX });
      ctx.putImageData(image, 0, 0);
      const ms = performance.now() - t0;
      cost += ms;
      frames++;
      // 手机慢、连着好几帧都画不过来：水珠的画布降一档（糊一点点，但是跟手）。头几帧不算，那时候还没热起来
      if (frames > 24 && ms > SLOW_MS && K > 1.5) {
        if (++slow >= 6) {
          sizeLens(K > 2 ? 2 : 1.5);
          paint(); // 换了画布马上补画一帧，不然会空一下
        }
      } else slow = 0;
    }
  }

  function frame(t) {
    raf = 0;
    if (dead) return;
    const el = last ? (t - last) / 1000 : 1 / 60;
    if (el < 0.0005) {
      // 时间没往前走（同一帧被叫了两回）：这一回不算
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.034, el);
    last = t;
    if (dragging) {
      const v = (pos - lastPos) / dt;
      vel = vel * 0.55 + v * 0.45;
    }
    lastPos = pos;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    for (let i = 0; i < n; i++) step(dt / n);
    paint();
    if (dragging || !settled()) raf = requestAnimationFrame(frame);
    else {
      // 停稳了：收个尾，箭头接着闪
      last = 0;
      coasting = false;
      vel = 0;
      pos = clamp(Math.abs(pos - goal) < 0.5 ? goal : pos, 0, max);
      press = pressGoal;
      pressV = stretch = stretchV = squash = squashV = 0;
      fillExtra = done ? W : 0;
      paint();
      els.track.removeAttribute("data-live");
    }
  }

  function kick() {
    if (dead) return;
    els.track.setAttribute("data-live", "");
    if (!raf) raf = requestAnimationFrame(frame);
  }

  return {
    setGlass,
    max,
    down(clientX) {
      dragging = true;
      coasting = false;
      x0 = clientX;
      p0 = pos;
      over = 0;
      lastPos = pos;
      pressGoal = 1;
      els.knob.setAttribute("data-press", "");
      kick();
    },
    move(clientX) {
      if (!dragging) return;
      const want = p0 + clientX - x0;
      pos = clamp(want, 0, max);
      over = want - pos;
      if (over) squashSide = over > 0 ? 1 : -1;
      kick();
    },
    // 松手。到头了返回 true（外面进门），没到头自己弹回去
    up() {
      if (!dragging) return false;
      dragging = false;
      over = 0;
      pressGoal = 0;
      els.knob.removeAttribute("data-press");
      const end = pos / max >= END;
      if (end) {
        pos = max;
        vel = 0;
      } else {
        goal = 0;
        coasting = true;
      }
      kick();
      return end;
    },
    // 键盘：直接到头 / 回到开头
    jump(toEnd) {
      dragging = false;
      coasting = false;
      vel = 0;
      pos = toEnd ? max : 0;
      kick();
    },
    atEnd: () => pos / max >= END,
    isDragging: () => dragging,
    // 每帧画水珠花了多少毫秒（平均），量性能用
    stats: () => ({ frames, ms: frames ? cost / frames : 0, res: K }),
    // 摆个固定的样子（截图、测试用）
    pose(o) {
      if (o.pos != null) pos = clamp(o.pos, 0, max);
      if (o.press != null) press = pressGoal = o.press;
      if (o.stretch != null) stretch = o.stretch;
      if (o.squash != null) squash = o.squash;
      if (o.fill != null) fillExtra = o.fill;
      els.knob.toggleAttribute("data-press", press > 0.5);
      paint();
    },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
