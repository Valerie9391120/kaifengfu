// 整页不许捏（src/nozoom.js）和看照片时的双指缩放（src/zoom.js）：只验算得对不对，不碰浏览器。
// 真浏览器里的那一遍在 tests/e2e_gesture.py。
import { LIMIT, reach, settle, createZoom } from "../src/zoom.js";
import { initNoZoom } from "../src/nozoom.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// 一台手机那么大的一页，中间摆一张竖着的照片
const BOX = { W: 393, H: 852, w: 360, h: 480 };
const make = (box = BOX) => {
  const painted = [];
  const z = createZoom({ box: () => box, paint: (v, smooth) => painted.push({ ...v, smooth }) });
  return { z, painted, last: () => painted[painted.length - 1] };
};
const T = (id, x, y) => ({ id, x, y });
// 屏幕上的一点底下，是图上的哪一点（从图的中心量起，没放大时的像素）
const under = (v, p) => ({ x: (p.x - v.x) / v.s, y: (p.y - v.y) / v.s });

// ---------- 能挪多远 ----------
{
  const r1 = reach(1, BOX);
  const r2 = reach(2, BOX);
  const r3 = reach(3, BOX);
  ok(r1.x === 0 && r1.y === 0, "没放大：图整个在那一页里，哪边都不能挪");
  ok(near(r2.x, (720 - 393) / 2) && near(r2.y, (960 - 852) / 2), "放大两倍：能挪的是图比那一页大出来的那一半");
  ok(reach(1.5, BOX).x > 0 && reach(1.5, BOX).y === 0, "一倍半：横着大出来了能挪，竖着还没大出来不能挪");
  ok(near(r3.x, (1080 - 393) / 2) && near(r3.y, (1440 - 852) / 2), "放大三倍：两边都能挪");
}

// ---------- 松手以后停在哪 ----------
{
  ok(JSON.stringify(settle({ s: 1, x: 0, y: 0 }, BOX, null)) === '{"s":1,"x":0,"y":0}', "本来就好好的：不动");
  const small = settle({ s: 0.7, x: 40, y: -30 }, BOX, { x: 100, y: 100 });
  ok(small.s === 1 && small.x === 0 && small.y === 0, "捏得比原样还小：弹回原样，回到正中");
  const big = settle({ s: 6.5, x: 0, y: 0 }, BOX, { x: 0, y: 0 });
  ok(big.s === LIMIT.max && big.x === 0 && big.y === 0, "拉过了五倍：收回五倍");
  const off = settle({ s: 2, x: 999, y: -999 }, BOX, null);
  ok(near(off.x, reach(2, BOX).x) && near(off.y, -reach(2, BOX).y), "拖出了边：图的边贴回那一页的边，不留空");
  // 倍数被收回来的时候，手指中间那一点底下的图不动
  const v = { s: 7, x: -140, y: 70 };
  const anchor = { x: 60, y: -40 };
  const before = under(v, anchor);
  const kept = settle(v, BOX, anchor);
  const after = under(kept, anchor);
  ok(kept.s === 5 && near(before.x, after.x) && near(before.y, after.y), "从七倍收回五倍：手指中间那一点底下还是图上的同一处");
  const hair = settle({ s: 1.04, x: 3, y: -2 }, BOX, { x: 50, y: 50 });
  const kept2 = settle({ s: 1.06, x: 0, y: 0 }, BOX, null);
  ok(hair.s === 1 && hair.x === 0 && hair.y === 0 && kept2.s === 1.06, "差一点点没到原样的（不到 1.05 倍）回原样；过了的留着");
}

// ---------- 双指：捏哪儿，哪儿就在手底下放大 ----------
{
  const { z, painted, last } = make();
  ok(z.view().s === 1 && z.view().x === 0 && z.view().y === 0 && z.moved() === false, "刚点开：原样，在正中");
  z.start([T(1, -50, 0), T(2, 50, 0)]);
  ok(painted.length === 0 && z.moved() === false, "两根手指刚落下、还没动：图不动");
  z.move([T(1, -100, 0), T(2, 100, 0)]);
  ok(near(last().s, 2) && near(last().x, 0) && near(last().y, 0) && last().smooth === false && z.moved() === true, "手指从正中往两边拉开一倍：放大两倍，还在正中；跟手，不带过渡");
  z.move([T(1, -125, 0), T(2, 125, 0)]);
  ok(near(last().s, 2.5), "接着拉：接着放大");
  z.end([]);
  ok(near(z.view().s, 2.5) && z.view().x === 0 && z.view().y === 0, "松手：两倍半在一到五倍之间，留在那儿");
}
{
  // 捏的不是正中：手指中间那一点底下的图跟着手指走（这一段放大以后横竖都没出边，拿画出来的样子直接验）
  const { z, last } = make();
  z.start([T(1, 20, 30), T(2, 60, 30)]);
  const spot = under(z.view(), { x: 40, y: 30 });
  z.move([T(1, 0, 45), T(2, 100, 45)]); // 拉开到两倍半，手指中间从 (40, 30) 挪到 (50, 45)
  const got = under(last(), { x: 50, y: 45 });
  ok(near(last().s, 2.5) && near(last().x, -50) && near(last().y, -30) && near(got.x, spot.x) && near(got.y, spot.y) && near(spot.x, 40) && near(spot.y, 30),
    "两根手指刚落下时中间那一点底下的图，放大以后还在手指中间");
  z.end([]);
  ok(near(z.view().x, -50) && near(z.view().y, -30) && near(z.view().s, 2.5), "没出边、没过头：松手留在原地");
  // 图已经不在正中了，再捏：还是捏哪儿放大哪儿（算的时候得带上图眼下偏了多少）
  z.start([T(1, 70, -10), T(2, 110, -10)]);
  const spot2 = under(z.view(), { x: 90, y: -10 });
  z.move([T(1, 66, -10), T(2, 114, -10)]); // 再放大到一点二倍，手指中间没挪
  const got2 = under(last(), { x: 90, y: -10 });
  ok(near(last().s, 3) && near(got2.x, spot2.x) && near(got2.y, spot2.y) && near(last().x, 90 - (90 + 50) * 1.2) && near(last().y, -10 - (-10 + 30) * 1.2),
    "图偏着的时候再捏：手指中间那一点底下还是图上的同一处");
  z.end([]);
}
{
  // 捏得偏、放大以后出了边：出边的那一截带阻力，松手弹回去
  const { z, last } = make();
  z.start([T(1, 60, 200), T(2, 140, 200)]);
  z.move([T(1, 20, 230), T(2, 220, 230)]); // 拉开到两倍半，手指中间从 (100, 200) 挪到 (120, 230)
  const r = reach(2.5, BOX);
  const wantX = 120 - 100 * 2.5, wantY = 230 - 200 * 2.5;
  ok(near(last().s, 2.5) && Math.abs(wantX) <= r.x && near(last().x, wantX), "横着没出边：原样跟手");
  ok(Math.abs(wantY) > r.y && near(Math.abs(last().y), r.y + (Math.abs(wantY) - r.y) * 0.35), "竖着：出了边还跟着走一点，但出边的那一截只走三成半");
  z.end([]);
  ok(near(Math.abs(z.view().y), reach(2.5, BOX).y) && near(z.view().x, wantX) && last().smooth === true, "松手：出边的那一截弹回去，图的边贴着那一页的边；这一下带过渡");
}

// ---------- 过头 ----------
{
  const { z, last } = make();
  z.start([T(1, -40, 0), T(2, 40, 0)]);
  z.move([T(1, -400, 0), T(2, 400, 0)]); // 想拉到十倍
  ok(LIMIT.max === 5 && near(last().s, 5 + (10 - 5) * 0.35), "想拉到十倍：手里是六倍七五（过了五倍的那一截只算三成半）");
  z.move([T(1, -4000, 0), T(2, 4000, 0)]);
  ok(last().s === 7, "拉得再开也就七倍");
  z.end([]);
  ok(z.view().s === 5 && last().smooth === true, "松手：弹回五倍");
}
{
  const { z, last } = make();
  z.start([T(1, -100, 0), T(2, 100, 0)]);
  z.move([T(1, -50, 0), T(2, 50, 0)]); // 想捏到半倍
  ok(near(last().s, 1 - 0.5 * 0.35), "想捏到半倍：手里是 0.825 倍（过头的那一截只算三成半）");
  z.move([T(1, -0.5, 0), T(2, 0.5, 0)]);
  ok(last().s > 0.65 && last().s < 0.66, "捏得再狠，手里也就小到 0.65 倍出头");
  z.end([]);
  ok(z.view().s === 1 && z.view().x === 0 && z.view().y === 0 && last().smooth === true, "松手：弹回原样，回到正中");
}
{
  // 两根手指落在同一点上：不除以零
  const { z, last } = make();
  z.start([T(1, 10, 10), T(2, 10, 10)]);
  z.move([T(1, 0, 10), T(2, 20, 10)]);
  ok(Number.isFinite(last().s) && Number.isFinite(last().x) && Number.isFinite(last().y) && last().s <= 7, "两根手指落在同一点上：算得出来，不出怪数");
  z.move([T(1, 30, 40), T(2, 30, 40)]);
  ok(Number.isFinite(last().s) && Number.isFinite(last().x) && Number.isFinite(last().y) && near(last().s, 1), "动的时候又叠回同一点上：也不出怪数（零除以零），就当和刚落下时一样近，回到落下时的倍数");
  z.end([]);
  ok(z.view().s >= LIMIT.min && z.view().s <= LIMIT.max, "松手照样收回一到五倍之间");
}

{
  // 在偏的地方拉过了头：松手收回五倍的时候，绕的是手指中间那一点，不是图的正中
  const { z, last } = make();
  z.start([T(1, 40, 20), T(2, 80, 20)]);
  z.move([T(1, -60, 20), T(2, 180, 20)]); // 六倍（手里带阻力，五倍多一点），中点还在 (60, 20)
  const heldView = { ...z.view() };
  const spot = under(heldView, { x: 60, y: 20 });
  z.end([]);
  const after = under(z.view(), { x: 60, y: 20 });
  ok(heldView.s > LIMIT.max && z.view().s === LIMIT.max && near(spot.x, after.x, 1e-6) && near(spot.y, after.y, 1e-6) && Math.abs(z.view().x) > 1,
    "在偏的地方拉过了头再松手：收回五倍，手指中间那一点底下还是图上的同一处");
}

// ---------- 一根手指 ----------
{
  const { z, painted } = make();
  z.start([T(1, 0, 0)]);
  z.move([T(1, 3, 4)]);
  ok(painted.length === 0 && z.moved() === false, "没放大的时候手指抖了几个像素：图不动，抬手那一下还算点一下");
  z.move([T(1, 80, 120)]);
  ok(painted.length === 0 && z.moved() === true && z.view().s === 1, "没放大的时候一根手指划出去：图不动，但这一回不算点了（划一下不该把照片关掉）");
  z.end([]);
  ok(painted.length === 0 && z.moved() === true, "抬手：记着这一回是划过的（下一回手指落下才清）");
  z.start([T(1, 5, 5)]);
  z.end([]);
  ok(z.moved() === false, "下一回干干净净点一下：算点");
}
{
  const { z, last, painted } = make();
  z.start([T(1, -50, 0), T(2, 50, 0)]);
  z.move([T(1, -150, 0), T(2, 150, 0)]); // 三倍
  z.end([]);
  const n = painted.length;
  z.start([T(3, 10, 10)]);
  ok(z.moved() === false, "放大以后再落一根手指：新的一回，先不算动过");
  z.move([T(3, 11, 11)]);
  ok(painted.length === n && z.moved() === false, "只挪了一两个像素：图不动（手指按下去本来就会抖）");
  z.move([T(3, 14, 13)]);
  ok(painted.length === n + 1 && near(last().x, 4) && near(last().y, 3) && z.moved() === false, "挪了五个像素：图跟着走，可抬手那一下还算点一下（放大着点一下关掉，手指难免带一点）");
  z.move([T(3, 10.5, 10.5)]);
  ok(painted.length === n + 2 && near(last().x, 0.5), "动起来以后再挪回原地附近：照样跟手，不卡在那儿");
  z.move([T(3, 70, -90)]);
  ok(near(last().s, 3) && near(last().x, 60) && near(last().y, -100) && z.moved() === true, "放大以后一根手指拖：图跟着手指走，倍数不变");
  z.move([T(3, 2000, 10)]);
  const r = reach(3, BOX);
  ok(last().x > r.x && last().x < 1990, "拖出了边：还跟着走一点，带阻力");
  z.end([]);
  ok(near(z.view().x, r.x) && near(z.view().s, 3) && last().smooth === true, "松手：弹回到边上");
}

// ---------- 两根手指抬起一根 ----------
{
  const { z, last, painted } = make();
  z.start([T(1, -50, 0), T(2, 50, 0)]);
  z.move([T(1, -100, 40), T(2, 100, 40)]); // 两倍，往下带了 40
  const held = { ...z.view() };
  z.end([T(2, 100, 40)]); // 抬起一根，还剩一根
  ok(JSON.stringify(z.view()) === JSON.stringify(held) && z.moved() === true, "抬起一根：图不跳，还是手里那个样子；这一回算动过");
  const n = painted.length;
  z.move([T(2, 130, 20)]);
  ok(painted.length === n + 1 && near(last().s, held.s) && near(last().x - held.x, 30 * (Math.abs(held.x + 30) <= reach(held.s, BOX).x ? 1 : LIMIT.give), 1e-6) , "剩下那根接着拖：从眼下的样子接着走");
  z.start([T(2, 130, 20), T(4, 30, 20)]); // 又落下一根
  const again = { ...z.view() };
  z.move([T(2, 180, 20), T(4, -20, 20)]); // 从 100 宽拉到 200 宽
  ok(near(last().s, again.s * 2), "又落下一根接着捏：从眼下的倍数接着算");
  z.end([T(4, -20, 20)]);
  z.end([]);
  ok(z.view().s <= LIMIT.max && z.view().s >= LIMIT.min && Math.abs(z.view().x) <= reach(z.view().s, BOX).x + 1e-6 && Math.abs(z.view().y) <= reach(z.view().s, BOX).y + 1e-6,
    "全抬起来：倍数、位置都收回规矩里");
}
{
  // 拖到一半又落下一根：这一回还是“动过”的（不能因为多了根手指就当成新的一回）
  const { z } = make();
  z.start([T(1, -50, 0), T(2, 50, 0)]);
  z.move([T(1, -150, 0), T(2, 150, 0)]);
  z.end([]);
  z.start([T(3, 0, 0)]);
  z.move([T(3, 50, 0)]);
  z.start([T(3, 50, 0), T(4, -50, 0)]);
  ok(z.moved() === true, "拖到一半又落下一根手指：这一回照旧算动过");
  z.end([T(4, -50, 0)]);
  z.end([]);
  ok(z.moved() === true, "全抬起来：还记着");
}
{
  // 三根手指：认排在最前头的那两根，第三根怎么动都不管
  const { z } = make();
  z.start([T(1, -50, 0), T(2, 50, 0), T(3, 0, 200)]);
  z.move([T(1, -50, 0), T(2, 50, 0), T(3, 150, -300)]);
  ok(z.view().s === 1 && z.view().x === 0 && z.view().y === 0, "三根手指，只有第三根在动：图不动");
  z.move([T(1, -100, 0), T(2, 100, 0), T(3, 150, -300)]);
  ok(near(z.view().s, 2), "前两根拉开：照前两根算");
  z.end([]);
}
{
  // 正拉过了头（带着阻力）的时候换手指：图不跳。
  // 原来接着算是从“带着阻力的样子”算起的，阻力在同一截上又打了一遍折：抬起一根、剩下那根挪 4 个像素，图一下缩回去二十多个像素
  const still = (z, touches, why) => {
    const before = { ...z.view() };
    z.move(touches);
    const v = z.view();
    ok(near(v.s, before.s, 1e-9) && near(v.x, before.x, 1e-9) && near(v.y, before.y, 1e-9), why);
  };
  const a = make();
  a.z.start([T(1, -50, 0), T(2, 50, 0)]);
  a.z.move([T(1, -75, 0), T(2, 75, 0)]);       // 一倍半：竖着还没大出来，不能挪
  a.z.move([T(1, -75, 120), T(2, 75, 120)]);   // 两根手指一起往下带 120：手里只走三成半
  ok(near(a.z.view().y, 42) && near(a.z.view().s, 1.5), "一倍半的时候两根手指往下带 120：图只跟着走 42");
  a.z.end([T(2, 75, 120)]);
  still(a.z, [T(2, 75, 120)], "抬起一根、剩下那根没动：图不动");
  a.z.move([T(2, 75, 124)]);
  ok(near(a.z.view().y, 42 + 4 * 0.35) && near(a.z.view().s, 1.5), "剩下那根再往下挪 4：图跟着走 1.4，不往回跳");
  a.z.end([]);

  const b = make();
  b.z.start([T(1, -10, 0), T(2, 10, 0)]);
  b.z.move([T(1, -80, 0), T(2, 80, 0)]);       // 想拉到八倍：手里 6.05
  ok(near(b.z.view().s, 6.05), "想拉到八倍：手里是 6.05 倍");
  b.z.start([T(1, -80, 0), T(2, 80, 0), T(3, 0, 100)]);
  still(b.z, [T(1, -80, 0), T(2, 80, 0), T(3, 0, 100)], "过了五倍的时候又落下第三根手指、谁都没动：倍数不变");
  b.z.end([T(2, 80, 0)]);
  b.z.start([T(2, 80, 0), T(4, -40, 0)]);
  still(b.z, [T(2, 80, 0), T(4, -40, 0)], "抬起两根、又落下一根、谁都没动：倍数不变");
  b.z.end([]);
  ok(b.z.view().s === 5, "全抬起来：收回五倍");

  const c = make();
  c.z.start([T(1, -100, 0), T(2, 100, 0)]);
  c.z.move([T(1, -40, 0), T(2, 40, 0)]);       // 想捏到 0.4 倍：手里 0.79
  ok(near(c.z.view().s, 0.79), "想捏到 0.4 倍：手里是 0.79 倍");
  c.z.end([T(2, 40, 0)]);
  c.z.start([T(2, 40, 0), T(5, -70, 30)]);
  still(c.z, [T(2, 40, 0), T(5, -70, 30)], "比原样小的时候抬起一根又落下一根、谁都没动：倍数不变");
  c.z.end([]);
  ok(c.z.view().s === 1, "全抬起来：回原样");

  const d = make();
  d.z.start([T(1, -50, 0), T(2, 50, 0)]);
  d.z.move([T(1, -100, 0), T(2, 100, 0)]);     // 两倍
  d.z.move([T(1, 300, 0), T(2, 500, 0)]);      // 两根一起往右带 400：出了右边
  const rx = reach(2, BOX).x;
  ok(near(d.z.view().x, rx + (400 - rx) * 0.35), "两倍的时候往右带出了边：出边的那一截只走三成半");
  d.z.end([T(1, 300, 0)]);
  const x0 = d.z.view().x;
  d.z.move([T(1, 304, 0)]);
  ok(near(d.z.view().x - x0, 4 * 0.35), "出着边的时候抬起一根、剩下那根再挪 4：图跟着走 1.4，不乱跳");
  d.z.end([]);
  ok(near(d.z.view().x, rx), "全抬起来：弹回到边上");
}
{
  // 弹回去的半路上手指又落下来：从图实际在的地方接着来
  const { z, last, painted } = make();
  z.start([T(1, -10, 0), T(2, 10, 0)]);
  z.move([T(1, -80, 0), T(2, 80, 0)]);
  z.end([]);                                    // 从 6.05 往五倍弹
  ok(z.view().s === 5 && last().smooth === true, "松手：算的是弹到位的样子（五倍）");
  z.adopt({ s: 5.6, x: 12, y: -7 });           // 页面上读出来：这会儿才弹到 5.6
  ok(z.view().s === 5.6 && z.view().x === 12 && z.view().y === -7 && last().smooth === false, "半路上手指落下：照页面上实际的样子接着来，过渡停掉");
  z.start([T(3, 0, 0)]);
  z.move([T(3, 20, 0)]);
  ok(near(z.view().s, 5.6) && near(z.view().x, 32), "接着拖：从 5.6 倍、偏 12 的地方走，不是从五倍");
  const n = painted.length;
  z.adopt({ s: 2, x: 0, y: 0 });
  ok(painted.length === n && near(z.view().s, 5.6), "手指还按着的时候不认页面上读来的数");
  z.end([]);
  ok(z.view().s === 5, "松手：照旧收回五倍");
  const m = painted.length;
  z.adopt(null); z.adopt({ s: NaN, x: 0, y: 0 }); z.adopt({ s: 0, x: 0, y: 0 }); z.adopt({ s: 2, x: Infinity, y: 0 });
  ok(painted.length === m && z.view().s === 5, "读来的数不像话（空的、不是数、零倍）：不理");
}
{
  // 两根手指点了一下、只抖出一点点：松手回原样，不留一个 1.008 倍
  const { z, last } = make();
  z.start([T(1, -50, 0), T(2, 50, 0)]);
  z.move([T(1, -50.4, 0), T(2, 50.4, 0)]);
  ok(near(last().s, 1.008), "两根手指抖了一下：手里是 1.008 倍");
  z.end([]);
  ok(z.view().s === 1 && z.view().x === 0 && z.view().y === 0, "松手：回原样");
}
{
  // 手指的编号对不上（系统把那根手指换了、报漏了）：这一下不动，不出错
  const { z, painted } = make();
  z.start([T(1, -50, 0), T(2, 50, 0)]);
  z.move([T(1, -80, 0), T(9, 80, 0)]);
  ok(painted.length === 0, "动的那根手指认不得：这一下不算");
  z.move([]);
  z.end([]);
  ok(z.view().s === 1, "空着手报了一下、又全抬了：照旧原样");
  z.move([T(1, 0, 0)]);
  z.end([]);
  ok(painted.length === 0, "没落下就报在动、在抬：不理");
}

// ---------- 乱来一通：随便落、随便动、随便抬，规矩不能破 ----------
{
  let seed = 20261003;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (lo, hi) => lo + rnd() * (hi - lo);
  const boxes = [BOX, { W: 393, H: 852, w: 361.5, h: 271.2 }, { W: 393, H: 852, w: 120, h: 732.7 }, { W: 852, H: 393, w: 253.5, h: 338 }];
  let weird = 0, loose = 0, jumps = 0, steps = 0;
  for (let round = 0; round < 1500; round++) {
    const box = boxes[round % boxes.length];
    const painted = [];
    const z = createZoom({ box: () => box, paint: (v) => painted.push({ ...v }) });
    let fingers = [];
    let nextId = 1;
    const check = () => { const v = z.view(); if (![v.s, v.x, v.y].every(Number.isFinite) || v.s < 0.65 - 1e-9 || v.s > 7 + 1e-9) weird++; };
    // 手指换了以后原地报一下“在动”：图不该动
    const hold = () => { const b = { ...z.view() }; z.move(fingers.map((f) => ({ ...f }))); const v = z.view(); if (Math.abs(v.s - b.s) > 1e-7 || Math.abs(v.x - b.x) > 1e-6 || Math.abs(v.y - b.y) > 1e-6) jumps++; };
    for (let step = 0; step < 40; step++) {
      steps++;
      const dice = rnd();
      if (fingers.length === 0 || (dice < 0.2 && fingers.length < 3)) {
        fingers.push({ id: nextId++, x: pick(-190, 190), y: pick(-420, 420) });
        z.start(fingers.map((f) => ({ ...f })));
        hold();
      } else if (dice < 0.75) {
        const far = rnd() < 0.15 ? 900 : 60;
        fingers = fingers.map((f) => (rnd() < 0.8 ? { id: f.id, x: f.x + pick(-far, far), y: f.y + pick(-far, far) } : f));
        z.move(fingers.map((f) => ({ ...f })));
      } else {
        fingers.splice(Math.floor(rnd() * fingers.length), 1);
        z.end(fingers.map((f) => ({ ...f })));
        if (fingers.length) hold();
        else {
          const v = z.view(); const r = reach(v.s, box);
          if (v.s < 1 || v.s > 5 || (v.s > 1 && v.s < 1.05) || Math.abs(v.x) > r.x + 1e-6 || Math.abs(v.y) > r.y + 1e-6) loose++;
        }
      }
      check();
    }
  }
  ok(weird === 0, `乱来 ${steps} 步：没出过怪数，手里的倍数一直在 0.65 到 7 之间（出格 ${weird} 回）`);
  ok(loose === 0, `每回手指全抬起来以后：倍数在一到五倍之间（没有差一点点的），图的边没跑进那一页里（出格 ${loose} 回）`);
  ok(jumps === 0, `每回换手指（多落一根、抬起一根）以后原地不动：图也不动（跳了 ${jumps} 回）`);
}

// ---------- 屏幕转了 ----------
{
  let box = { ...BOX };
  const painted = [];
  const z = createZoom({ box: () => box, paint: (v, smooth) => painted.push({ ...v, smooth }) });
  z.start([T(1, -50, 0), T(2, 50, 0)]);
  z.move([T(1, -150, -300), T(2, 150, -300)]); // 三倍，往上带到边
  z.end([]);
  const before = { ...z.view() };
  box = { W: 852, H: 393, w: 160, h: 120 }; // 横过来：那一页变宽变矮，图也跟着小了，三倍也没大出那一页
  z.refit();
  const r = reach(z.view().s, box);
  ok(before.y !== 0 && z.view().s === before.s && z.view().x === 0 && z.view().y === 0 && r.x === 0 && r.y === 0 && painted[painted.length - 1].smooth === false,
    "屏幕转了：倍数留着，位置照新的大小收回来（这里是回到正中）；这一下不带过渡");
  const n = painted.length;
  z.refit();
  ok(painted.length === n, "没变就不重画");
  box = { ...BOX };
  z.refit(); // 转回来：位置本来就合规矩，不用动
  z.start([T(1, -50, 0), T(2, 50, 0)]);
  z.move([T(1, -60, -400), T(2, 60, -400)]);
  const m = painted.length;
  box = { W: 852, H: 393, w: 160, h: 120 };
  z.refit();
  ok(painted.length === m, "手指还按着的时候不收（等松手再说）");
  z.end([]);
  const rr = reach(z.view().s, box);
  ok(z.view().x === 0 && Math.abs(z.view().y) <= rr.y + 1e-6 && rr.y < 30, "松手的时候照新的大小收");
}

// ---------- 整页不许捏：第三道（拦 Safari 的 gesturestart） ----------
{
  const handlers = {};
  const doc = {
    addEventListener: (type, fn, opts) => { handlers[type] = { fn, opts }; },
    removeEventListener: (type, fn) => { if (handlers[type] && handlers[type].fn === fn) delete handlers[type]; },
  };
  const off = initNoZoom(doc);
  ok(Object.keys(handlers).sort().join() === "gesturechange,gestureend,gesturestart", "只接 Safari 报双指的那三件事；touchmove 不接（接了聊天记录滚起来会顿）");
  ok(Object.values(handlers).every((h) => h.opts && h.opts.passive === false), "挂的是“会拦”的监听（不然拦不住）");
  let stopped = 0;
  handlers.gesturestart.fn({ cancelable: true, preventDefault: () => { stopped++; } });
  handlers.gesturechange.fn({ preventDefault: () => { stopped++; } });
  ok(stopped === 2, "两根手指一落、一动：拦掉");
  handlers.gesturestart.fn({ cancelable: false, preventDefault: () => { stopped++; } });
  ok(stopped === 2, "浏览器说这一下拦不了的：不硬拦（硬拦只会在控制台里报错）");
  off();
  ok(Object.keys(handlers).length === 0, "退得干净");
  ok(typeof initNoZoom(null) === "function" && typeof initNoZoom({}) === "function", "没有页面的地方（测试、打包）叫它也不出错");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
