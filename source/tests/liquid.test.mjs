// 液态玻璃滑块：折射算得对不对、拖到头才进门的规矩有没有坏
import { LQ, bezelLut, fillMask, hintLayout, paintKnob, createSlider } from "../src/liquid.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };

// ---- 玻璃边的折射表 ----
const lut = bezelLut();
let top = 0;
for (let i = 0; i < 257; i++) if (lut[i] > lut[top]) top = i;
let down = true;
for (let i = top; i < 256; i++) if (lut[i + 1] > lut[i] + 1e-6) down = false;
ok(Math.abs(lut[top] - 1) < 1e-6 && top < 16 && down && lut[256] === 0 && lut[128] < 0.15,
  "玻璃边的折射：最外沿折得最多，越往里越少，到斜面尽头不折");

// ---- 水珠：拿一张假的“景”来折 ----
// 景：红色分量从左到右 0→255，绿 100，蓝 50；灌满的那份全是 (10, 200, 250)
const S = 2, W = 300, H = 80;
const sw = W * S, sh = H * S;
const scene = new Uint8ClampedArray(sw * sh * 4);
const fullScene = new Uint8ClampedArray(sw * sh * 4);
for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
  const o = (y * sw + x) * 4;
  scene[o] = (x / (sw - 1)) * 255; scene[o + 1] = 100; scene[o + 2] = 50; scene[o + 3] = 255;
  fullScene[o] = 10; fullScene[o + 1] = 200; fullScene[o + 2] = 250; fullScene[o + 3] = 255;
}
const g = { S, W, H, w: sw, h: sh, scene, fullScene, lut };
const K = 2, CW = 120, CH = 84;
const cw = CW * K, ch = CH * K;
const out = new Uint8ClampedArray(cw * ch * 4);
const at = (lx, ly) => { const i = Math.floor((CW / 2 + lx) * K), j = Math.floor((CH / 2 + ly) * K); const o = (j * cw + i) * 4; return [out[o], out[o + 1], out[o + 2], out[o + 3]]; };
const redAt = (x) => (x / W) * 255; // 景里这个位置原本多红

// 按住（透的）、没灌：中间只是放大，边上往里折
paintKnob(g, out, cw, ch, K, { cx: 150, cy: 40, dx: 0, rx: 38, ry: 38, r0: 34, press: 1, fillX: -100 });
const mid = at(0, 0);
ok(mid[3] === 255 && Math.abs(mid[0] - (redAt(150) + 255 * LQ.veil)) < 3, `水珠正中间：看到的就是正底下的画（${mid}）`);
ok(at(45, 0)[3] === 0 && at(0, 41)[3] === 0 && at(-30, -30)[3] === 0 && at(-26, -26)[3] === 255, "水珠外面是透明的，里面是实的");
const zoomL = at(-15, 0)[0], zoomR = at(15, 0)[0];
ok(zoomR - zoomL > 0 && zoomR - zoomL < redAt(30) - 1, `水珠中间放大了：隔 30 像素看到的画只差 ${zoomR - zoomL}（原画差 ${redAt(30).toFixed(1)}）`);
// 边上那圈：和“不折”的比，右边看到的画更靠中间（更不红），左边反过来；正中间不受影响
const bend = LQ.kBend;
LQ.kBend = [0, 0];
paintKnob(g, out, cw, ch, K, { cx: 150, cy: 40, dx: 0, rx: 38, ry: 38, r0: 34, press: 1, fillX: -100 });
const flatR = at(36, 0)[0], flatL = at(-36, 0)[0], flatM = at(0, 0)[0];
LQ.kBend = bend;
paintKnob(g, out, cw, ch, K, { cx: 150, cy: 40, dx: 0, rx: 38, ry: 38, r0: 34, press: 1, fillX: -100 });
const edgeR = at(36, 0)[0], edgeL = at(-36, 0)[0];
ok(edgeR < flatR - 4 && edgeL > flatL + 4 && at(0, 0)[0] === flatM, `水珠边上把画往里折：右边看到的更靠左（${edgeR} < ${flatR}），左边更靠右（${edgeL} > ${flatL}），正中间不动`);
// 上边缘朝着光，最外沿有一道亮线
const rim = at(-17, -33.5), inner = at(-10, -20);
ok(rim[1] > inner[1] + 40, `朝着光的那道边有高光（${rim[1]} 比里面的 ${inner[1]} 亮）`);

// 灌满：看到的是灌满的那份
paintKnob(g, out, cw, ch, K, { cx: 150, cy: 40, dx: 0, rx: 38, ry: 38, r0: 34, press: 1, fillX: 400 });
const fm = at(0, 0);
ok(Math.abs(fm[0] - (10 + 255 * LQ.veil)) < 3 && fm[1] > 200 && fm[2] > 245, `灌满以后水珠里看到的是灌满的那份（${fm}）`);
// 灌到水珠正中：左半边是灌满的，右半边是空的，中间羽化
paintKnob(g, out, cw, ch, K, { cx: 150, cy: 40, dx: 0, rx: 38, ry: 38, r0: 34, press: 1, fillX: 150 });
const hl = at(-20, 0), hr = at(20, 0), hm = at(0, 0);
ok(hl[2] > 240 && hr[2] < 70 && hm[2] > 120 && hm[2] < 190, `灌到一半：左边灌满、右边空着、中间化开（蓝 ${hl[2]} / ${hm[2]} / ${hr[2]}）`);

// 没按：她画的那个样子，浅紫的环、里面深紫
paintKnob(g, out, cw, ch, K, { cx: 150, cy: 40, dx: 0, rx: 34, ry: 34, r0: 34, press: 0, fillX: -100 });
const ring = at(30, 0), core = at(0, 0);
const near = (a, b, e) => Math.abs(a[0] - b[0]) < e && Math.abs(a[1] - b[1]) < e && Math.abs(a[2] - b[2]) < e;
ok(near(ring, LQ.ring, 30) && core[0] < 100 && core[2] < 90 && core[2] > 60, `没按的时候：外面一圈浅紫的环（${ring.slice(0, 3)}），里面深紫（${core.slice(0, 3)}）`);
// 拉长：椭圆，横着比竖着宽；挪了位置（贴墙）画也跟着
paintKnob(g, out, cw, ch, K, { cx: 150, cy: 40, dx: 6, rx: 46, ry: 32, r0: 34, press: 1, fillX: -100 });
ok(at(6 + 44, 0)[3] === 255 && at(6 - 44, 0)[3] === 255 && at(6, 34)[3] === 0 && at(6, 30)[3] === 255, "拉长了是个椭圆，挪了位置也画在对的地方");

// ---- 页面上的两样小东西 ----
ok(/^linear-gradient\(to right, rgba\(0,0,0,1\.000\) calc\(100% - 30\.00px\).*rgba\(0,0,0,0\.000\) calc\(100% - 0\.00px\)\)$/.test(fillMask()) && fillMask().includes("rgba(0,0,0,0.500) calc(100% - 15.00px)"),
  "灌满那份的边：遮罩从实到透，宽度和水珠里看到的交界一样");
const hl2 = hintLayout(6, 68);
ok(hl2.left === 78 && hl2.size === 46 && hl2.gap === 30 && hl2.count === 3, "三个提示箭头的位置（页面上和水珠里看到的用同一份）");

// ---- 手感和规矩：假的页面元素、假的时钟 ----
const fakeEl = () => {
  const attrs = new Map();
  return {
    style: {}, attrs,
    setAttribute: (k, v) => attrs.set(k, String(v)), getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    removeAttribute: (k) => attrs.delete(k), hasAttribute: (k) => attrs.has(k),
    toggleAttribute: (k, on) => (on ? attrs.set(k, "") : attrs.delete(k)),
  };
};
let queue = [], clock = 1000, rafId = 0;
globalThis.requestAnimationFrame = (f) => { queue.push(f); return ++rafId; };
globalThis.cancelAnimationFrame = () => { queue = []; };
// 走 ms 毫秒（每帧 1/60 秒）
const run = (ms) => { for (let t = 0; t < ms; t += 1000 / 60) { clock += 1000 / 60; const q = queue; queue = []; q.forEach((f) => f(clock)); } };
const make = (opts = {}) => {
  const els = { track: fakeEl(), knob: fakeEl(), body: fakeEl(), lens: fakeEl(), icon: fakeEl(), fill: fakeEl() };
  const log = [];
  const c = createSlider({ els, geom: { W: 357, H: 80, pad: 6, knob: 68 }, onDone: (d) => log.push(d), ...opts });
  c.setGlass(null);
  const x = () => parseFloat(/translate3d\(([-\d.]+)px/.exec(els.knob.style.transform)[1]);
  const now = () => Number(els.knob.getAttribute("aria-valuenow"));
  const shape = () => /scale\(([\d.]+),([\d.]+)\)/.exec(els.body.style.transform).slice(1).map(Number);
  return { c, els, log, x, now, shape };
};

{
  const { c, els, log, x, now } = make();
  ok(c.max === 277 && x() === 0 && now() === 0 && els.fill.style.width === "0.00px", "开头：圆钮在最左边，灌满的那份一点不露");
  // 拉到一半松手：不进门，弹回去
  c.down(100); c.move(240); run(100);
  ok(x() === 140 && now() === 51 && log.length === 0 && els.knob.hasAttribute("data-press") && els.track.hasAttribute("data-live") && parseFloat(els.fill.style.width) > 150, "拉到一半：圆钮跟着手指，后面灌上了");
  const entered = c.up(); run(50);
  const mid = x();
  run(1200);
  ok(entered === false && mid > 0 && mid < 140 && x() === 0 && now() === 0 && log.length === 0 && !els.knob.hasAttribute("data-press") && !els.track.hasAttribute("data-live") && els.fill.style.width === "0.00px",
    `拉到一半松手：不进门，圆钮自己弹回最左边（半路在 ${mid.toFixed(0)}），停稳以后箭头接着闪`);
}
{
  // 拉到头：到头的那一刻才算；手没松不进门；松手进门
  const { c, els, log, x, now } = make();
  c.down(50); c.move(50 + 270); run(50);
  ok(log.length === 0 && now() === 97, "差一点没到头（97%）：不算");
  c.move(50 + 275); run(50);
  ok(log.join() === "true" && els.knob.hasAttribute("data-done"), "拉到头了：小猪该脸红了");
  c.move(50 + 600); run(400);
  ok(x() === 277 && now() === 100 && log.join() === "true", "手指拉过头：圆钮顶在最右边不出去");
  const sq = /scale\(([\d.]+),([\d.]+)\)/.exec(els.body.style.transform).slice(1).map(Number);
  ok(sq[0] < 1.1 && sq[1] > sq[0], `拉过头的时候圆钮被压扁了（横 ${sq[0]} 竖 ${sq[1]}）`);
  run(600);
  ok(parseFloat(els.fill.style.width) >= 357, "到头以后整条都灌满");
  ok(c.atEnd() && c.up() === true, "到头松手：进门");
  run(600);
  ok(x() === 277 && log.join() === "true", "进门的时候圆钮留在最右边");
}
{
  // 拉到头又拉回来再松手：不进门，小猪的脸红收回去
  const { c, log, x } = make();
  c.down(50); c.move(50 + 300); run(100);
  c.move(50 + 120); run(100);
  const entered = c.up(); run(1500);
  ok(log.join() === "true,false" && entered === false && x() === 0, "拉到头又拉回来再松手：脸红收回去，不进门");
}
{
  // 弹回去的半路上又被按住：从当时的位置接着拖
  const { c, x } = make();
  c.down(0); c.move(200); run(100); c.up(); run(80);
  const caught = x();
  c.down(500); run(30);
  const held = x();
  c.move(520); run(30);
  ok(caught > 20 && caught < 200 && Math.abs(held - caught) < 0.01 && Math.abs(x() - (caught + 20)) < 0.01, `弹回去的半路上按住：停在当时的位置（${caught.toFixed(0)}），接着拖`);
  c.up(); run(1500);
  ok(x() === 0, "再松手还是弹回去");
}
{
  // 拖得快：被拉长；停下来以后恢复
  const { c, shape } = make();
  c.down(0); run(400);
  const held = shape();
  for (let i = 1; i <= 8; i++) { c.move(i * 30); run(17); }
  const fast = shape();
  run(900);
  const rest = shape();
  ok(held[0] > 1.1 && Math.abs(held[0] - held[1]) < 0.01 && fast[0] > held[0] + 0.08 && fast[1] < held[1] && Math.abs(rest[0] - held[0]) < 0.01 && Math.abs(rest[1] - held[1]) < 0.01,
    `按住鼓大（${held[0]}），拖得快被拉长（横 ${fast[0]} 竖 ${fast[1]}），停下来变回圆的`);
  c.up(); run(1500);
  const end = shape();
  ok(end[0] === 1 && end[1] === 1, "松手停稳以后变回原来的大小");
}
{
  // 减少动态效果：不拉长、不压扁
  const { c, shape } = make({ reduced: true });
  c.down(0); run(400);
  const held = shape();
  for (let i = 1; i <= 8; i++) { c.move(i * 30); run(17); }
  const fast = shape();
  c.move(2000); run(300);
  const wall = shape();
  ok(Math.abs(fast[0] - held[0]) < 0.01 && Math.abs(fast[1] - held[1]) < 0.01 && Math.abs(wall[0] - held[0]) < 0.01, "系统里开了“减弱动态效果”：不拉长、不压扁");
  c.destroy();
}
{
  // 键盘
  const { c, log, x, now } = make();
  c.jump(true); run(100);
  ok(x() === 277 && now() === 100 && c.atEnd() && log.join() === "true", "键盘按右：直接到头");
  c.jump(false); run(100);
  ok(x() === 0 && !c.atEnd() && log.join() === "true,false", "键盘按左：回到开头");
  run(2000);
  ok(queue.length === 0, "停稳以后不再一帧一帧空转（省电）");
}
{
  // 没按住的时候 move / up 不该有反应
  const { c, x } = make();
  c.move(300); run(50);
  ok(x() === 0 && c.up() === false, "没按住的时候划过去、松开：没反应");
  run(50);
  c.destroy();
  const before = queue.length;
  c.down(0); c.move(100);
  ok(before === 0 && queue.length === 0, "开屏收掉以后不再排动画");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
