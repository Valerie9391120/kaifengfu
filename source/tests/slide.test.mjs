// 对话窗怎么滑（src/slide.js）：侧栏拉出来、收回去的时候，对话窗一帧一帧挪，不交给系统动画。只验规矩，不碰浏览器。
// 为什么不交给系统动画（长对话里 iPhone 会把整页杀掉）见 src/slide.js 开头；真浏览器里的那一遍在 tests/e2e_gesture.py。
import { SLIDE_MS, SLIDE_EASE, ENTER_MS, ENTER_X, bezier, createSlide, enterLook } from "../src/slide.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;

// ====================================================================================
// 一、那条曲线
// ====================================================================================

// 对照：把 cubic-bezier 那条线照定义密密地描一遍（十万个点），横着走到 x 的时候竖着走到哪，拿它来对
const drawn = (x1, y1, x2, y2) => {
  const N = 100000;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pts.push([3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t, 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t]);
  }
  return (x) => {
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] < x) lo = mid; else hi = mid; }
    const [xa, ya] = pts[lo], [xb, yb] = pts[hi];
    return xb === xa ? ya : ya + ((yb - ya) * (x - xa)) / (xb - xa);
  };
};
const xs = [0.01, 0.046, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99];

ok(SLIDE_MS === 350, "说好的数：对话窗滑一趟走 350 毫秒（和原来写在 CSS 里的一样）");
ok(SLIDE_EASE(0) === 0 && SLIDE_EASE(1) === 1 && SLIDE_EASE(-3) === 0 && SLIDE_EASE(7) === 1 && SLIDE_EASE(NaN) === 0, "曲线两头：没开始是 0，到了是 1；钟点出了界的、不是数的，不出岔子");
{
  const ref = drawn(0.2, 0.8, 0.2, 1);
  const worst = Math.max(...xs.map((x) => Math.abs(SLIDE_EASE(x) - ref(x))));
  ok(worst < 1e-4, `和照定义描出来的 cubic-bezier(.2,.8,.2,1) 对得上（十二处里差得最多的 ${worst.toExponential(1)}）`);
}
{
  let last = 0, up = true, inside = true;
  for (let i = 0; i <= 1000; i++) {
    const y = SLIDE_EASE(i / 1000);
    if (y < last - 1e-9) up = false;
    if (y < 0 || y > 1) inside = false;
    last = y;
  }
  ok(up && inside, "一路只往前走、不回头，也不冲过头（千分之一一格走了一遍）");
}
ok(SLIDE_EASE(0.1) > 0.35 && SLIDE_EASE(0.1) < 0.45 && SLIDE_EASE(0.5) > 0.9, `起步快、收尾慢：走了一成的钟点已经挪了 ${(SLIDE_EASE(0.1) * 100).toFixed(0)}%，走到一半已经挪了 ${(SLIDE_EASE(0.5) * 100).toFixed(0)}%`);
{
  const line = bezier(0, 0, 1, 1);
  ok(xs.every((x) => near(line(x), x, 1e-6)), "换一条曲线也认：cubic-bezier(0,0,1,1) 是匀速");
  const css = { ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1] };
  const worst = Math.max(...Object.values(css).map((c) => Math.max(...xs.map((x) => Math.abs(bezier(...c)(x) - drawn(...c)(x))))));
  ok(worst < 1e-4, `CSS 里有名字的那四条（ease、ease-in、ease-out、ease-in-out）也都对得上（差得最多的 ${worst.toExponential(1)}）`);
}

// ====================================================================================
// 二、滑
// ====================================================================================

// 假的钟和动画帧：一帧 16 毫秒
const world = (opts = {}) => {
  let t = 5000;
  let seq = 0;
  let frames = [];
  const puts = [];
  const s = createSlide({
    put: (v) => puts.push(v),
    raf: (fn) => { frames.push({ id: ++seq, fn }); return seq; },
    caf: (id) => { frames = frames.filter((x) => x.id !== id); },
    now: () => t,
    ...opts,
  });
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { t += 16; const due = frames; frames = []; due.forEach((x) => x.fn()); } };
  const wait = (ms) => { t += ms; };
  return { s, puts, tick, wait, pending: () => frames.length, asked: () => seq };
};
const ALL = Math.ceil(SLIDE_MS / 16) + 2; // 够滑完的帧数
const rising = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
const falling = (a) => a.every((v, i) => i === 0 || v < a[i - 1]);

// ---------- 头一回摆出来 ----------
{
  const { s, puts, pending } = world();
  ok(s.at() === 0 && s.moving() === false && s.goal() === 0 && puts.length === 0, "刚造出来：在 0，停着，什么都还没写");
  s.to(0);
  ok(puts.length === 1 && puts[0] === 0 && pending() === 0, "头一回叫它待在 0：把 0 写上去（对话窗身上得一直有这个位置），不排动画帧");
}

// ---------- 拉出来：一帧一帧挪到头 ----------
{
  const { s, puts, tick, pending } = world();
  s.to(322);
  ok(puts.length === 0 && pending() === 1 && s.moving() && s.goal() === 322 && s.at() === 0, "叫它滑到 322：这一下先不动，排了一帧");
  tick();
  ok(near(puts[0], 322 * SLIDE_EASE(16 / 350), 1e-9) && puts[0] > 30 && puts[0] < 90, `头一帧（16 毫秒）照曲线挪到 ${puts[0].toFixed(1)}`);
  tick(ALL);
  ok(rising(puts) && puts[puts.length - 1] === 322 && puts.slice(0, -1).every((v) => v > 0 && v < 322), `一路往右、一帧比一帧远，最后正好落在 322（一共写了 ${puts.length} 回）`);
  ok(puts.length === Math.ceil(SLIDE_MS / 16) && s.at() === 322 && !s.moving() && s.goal() === 322, "走了 350 毫秒：过了 350 毫秒的头一帧到位（22 帧）");
  const n = puts.length;
  tick(30);
  ok(pending() === 0 && puts.length === n, "停稳了就不再排动画帧，也不再写");
}

// ---------- 收回去 ----------
{
  const { s, puts, tick, pending } = world();
  s.jump(322);
  puts.length = 0;
  s.to(0);
  tick(ALL);
  ok(falling(puts) && puts[puts.length - 1] === 0 && s.at() === 0 && pending() === 0, "从 322 滑回 0：一路往左，最后正好落在 0，停稳");
}

// ---------- 正滑着又叫一回同一个地方 ----------
{
  const a = world(), b = world();
  a.s.to(322); b.s.to(322);
  a.tick(5); b.tick(5);
  b.s.to(322); b.s.to(322);
  ok(b.pending() === 1 && b.asked() === a.asked(), "正往 322 滑着，又叫它滑到 322：不重来，也不多排一帧");
  a.tick(ALL); b.tick(ALL);
  ok(JSON.stringify(a.puts) === JSON.stringify(b.puts), "多叫的那两回不改它的步子：和没多叫的那一趟一帧一帧对得上");
}

// ---------- 滑到一半改了主意 ----------
{
  const { s, puts, tick, pending } = world();
  s.to(322);
  tick(6);
  const mid = s.at();
  const before = puts.length;
  s.to(0);
  ok(pending() === 1 && s.goal() === 0 && s.at() === mid && puts.length === before, `滑到一半（${mid.toFixed(0)}）叫它回 0：不跳，从眼下的地方接着走`);
  tick();
  ok(near(puts[puts.length - 1], mid - mid * SLIDE_EASE(16 / 350), 1e-9), "回头的头一帧是从半路那个地方起步的");
  tick(ALL);
  const back = puts.slice(before);
  ok(falling(back) && back[back.length - 1] === 0 && back.length === Math.ceil(SLIDE_MS / 16), "回头这一趟也走 350 毫秒，一路往左，正好落在 0");
}

// ---------- 手指接过去 ----------
{
  const { s, puts, tick, pending } = world();
  s.to(322);
  tick(4);
  s.jump(120);
  ok(pending() === 0 && !s.moving() && s.at() === 120 && puts[puts.length - 1] === 120, "滑到一半手指接过去（一下到位）：自己滑的那一下撤掉，位置听手指的");
  const n = puts.length;
  tick(ALL);
  ok(puts.length === n, "撤掉的那一下不会过一会儿又冒出来写一笔");
  s.jump(121.5); s.jump(180.25); s.jump(322);
  ok(puts.slice(n).join() === "121.5,180.25,322" && pending() === 0, "手指拖着走：动一下写一回，一帧都不排");
  s.to(322);
  ok(pending() === 0 && puts.length === n + 4 && puts[puts.length - 1] === 322, "拖到了头才松手：本来就在那儿，写准了就行，不滑");
  s.jump(200);
  s.to(322);
  tick(ALL);
  ok(s.at() === 322 && rising(puts.slice(n + 5)), "拖到一半松手：从松手的地方接着滑到头");
}

// ---------- 差不到半个像素 ----------
{
  const { s, puts, pending } = world();
  s.jump(321.7);
  s.to(322);
  ok(pending() === 0 && s.at() === 322 && puts[puts.length - 1] === 322, "离要去的地方不到半个像素：直接写准，不排动画帧");
  s.to(321.4);
  ok(pending() === 1, "差了半个像素以上的就照常滑");
}

// ---------- 停 ----------
{
  const { s, puts, tick, pending } = world();
  s.to(322);
  tick(3);
  const at = s.at();
  s.stop();
  tick(ALL);
  ok(pending() === 0 && s.at() === at && !s.moving() && s.goal() === at, "叫它停：停在眼下的地方，不再排动画帧");
  s.stop();
  s.to(322);
  tick(ALL);
  ok(s.at() === 322 && puts[puts.length - 1] === 322, "停过以后再叫它滑：从停的地方接着走到头");
}

// ---------- 页面被切走 ----------
{
  const { s, puts, tick, wait, pending } = world();
  s.to(322);
  tick(2);
  wait(60000); // 切走一分钟：动画帧是停的
  ok(pending() === 1 && s.at() < 322, "滑到一半她切走了：动画帧停着，位置停在半路");
  tick();
  ok(s.at() === 322 && puts[puts.length - 1] === 322 && pending() === 0, "回来的头一帧：钟点早过了，一下到位，不从半路慢慢补");
}

// ---------- 换个快慢 ----------
{
  const { s, puts, tick } = world({ ms: 160, ease: (p) => p });
  s.to(100);
  tick(20);
  ok(puts.length === 10 && near(puts[0], 10, 1e-9) && puts[9] === 100, "快慢、曲线能从外头换（160 毫秒匀速：十帧走完，头一帧走一成）");
}

// ---------- 乱来一通 ----------
{
  let seed = 20261010;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let bad = "";
  for (let run = 0; run < 300 && !bad; run++) {
    const { s, puts, tick, wait, pending } = world();
    let want = 0;
    for (let i = 0; i < 40 && !bad; i++) {
      const r = rnd();
      const before = s.at();
      if (r < 0.3) { want = rnd() < 0.5 ? 0 : 322; s.to(want); }
      else if (r < 0.5) { want = Math.round(rnd() * 3220) / 10; s.jump(want); }
      else if (r < 0.55) { s.stop(); want = s.at(); }
      else if (r < 0.6) wait(Math.floor(rnd() * 2000));
      else tick(1 + Math.floor(rnd() * 6));
      const lo = Math.min(before, s.goal()) - 1e-9, hi = Math.max(before, s.goal()) + 1e-9;
      if (!(s.at() >= lo && s.at() <= hi)) bad = `第 ${run} 趟第 ${i} 步：位置 ${s.at()} 跑到了 ${before} 和 ${s.goal()} 外头`;
      if (pending() > 1) bad = `第 ${run} 趟第 ${i} 步：同时排了 ${pending()} 帧`;
      if (s.moving() !== (pending() === 1)) bad = `第 ${run} 趟第 ${i} 步：说自己${s.moving() ? "在滑" : "停着"}，排着的帧却是 ${pending()}`;
      if (puts.length && puts[puts.length - 1] !== s.at()) bad = `第 ${run} 趟第 ${i} 步：写上去的（${puts[puts.length - 1]}）和它记着的（${s.at()}）对不上`;
    }
    tick(ALL);
    if (!bad && (s.at() !== want || pending() !== 0)) bad = `第 ${run} 趟：最后该在 ${want}，却在 ${s.at()}（还排着 ${pending()} 帧）`;
  }
  ok(!bad, bad || "乱来三百趟（滑、手指接、停、切走、过几帧，随便排）：位置从不跑到起点和终点外头，一回只排一帧，说的和做的对得上，最后都落在该在的地方");
}

// ====================================================================================
// 三、一整页进来的那一下（历史对话那一页）
// ====================================================================================

ok(ENTER_MS === 300 && ENTER_X === 28, "说好的两个数：一整页进来走 300 毫秒，从右边 28 像素的地方起步（和 CSS 的 kfsPage 一样）");
{
  const same = (a, t, o) => a.transform === t && a.opacity === o;
  ok(same(enterLook(28), "translateX(28px)", "0") && same(enterLook(14), "translateX(14px)", "0.5") && same(enterLook(7), "translateX(7px)", "0.75"),
     "起点：在右边 28 像素、看不见；走到一半：14 像素、半透明；位置和深浅是一起走的");
  ok(same(enterLook(0), "", "") && same(enterLook(-2), "", "") && same(enterLook(NaN), "", ""), "到位了：两样都交回空的（写在那一页身上的收干净）；不像话的数也当到位");
  ok(same(enterLook(40), "translateX(28px)", "0"), "比起点还远的数：照起点算，深浅不会成负的");
  ok(same(enterLook(1.23456), "translateX(1.23px)", "0.956") && same(enterLook(0.0000027), "translateX(0px)", "1"),
     "位置写到百分之一个像素、深浅写到千分之一：小得很的数也不会写成 2.7e-06 这种样子");
  ok(same(enterLook(5, 10), "translateX(5px)", "0.5"), "起点能换（从 10 像素起步的话，5 像素就是一半）");
}
{
  // 照那一页的用法走一趟：先摆在起点，再滑到位
  const { s, puts, tick, pending } = world({ ms: ENTER_MS });
  s.jump(ENTER_X);
  s.to(0);
  const first = enterLook(puts[0]);
  tick(Math.ceil(ENTER_MS / 16) + 2);
  const looks = puts.map((v) => enterLook(v));
  const xs = puts.slice(0, -1), os = looks.slice(0, -1).map((l) => Number(l.opacity));
  ok(first.transform === "translateX(28px)" && first.opacity === "0", "头一回画之前先摆在起点上：在右边 28 像素、看不见（不会先闪一下整页）");
  ok(falling(xs) && os.every((o, i) => i === 0 || o >= os[i - 1]) && os[os.length - 1] > 0.99, `一路往左、越来越实（${xs.length} 回）`);
  ok(puts[puts.length - 1] === 0 && looks[looks.length - 1].transform === "" && looks[looks.length - 1].opacity === "" && pending() === 0 && puts.length === 1 + Math.ceil(ENTER_MS / 16),
     "300 毫秒到位（19 帧）：身上写的收干净，停稳了不再排动画帧");
  const k = 5;
  ok(near(puts[k], ENTER_X * (1 - SLIDE_EASE((16 * k) / ENTER_MS)), 1e-9) && near(Number(looks[k].opacity), SLIDE_EASE((16 * k) / ENTER_MS), 1e-3),
     "和 CSS 动画是一回事：第 5 帧的位置是 28 × (1 − 曲线)，深浅就是曲线走到的那个数");
}
{
  // 还没滑完那一页就关了
  const { s, puts, tick, pending } = world({ ms: ENTER_MS });
  s.jump(ENTER_X); s.to(0);
  tick(3);
  const n = puts.length;
  s.stop();
  tick(30);
  ok(pending() === 0 && puts.length === n, "滑到一半那一页被关掉：撤掉，不会过一会儿往一个已经没了的东西身上写");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
