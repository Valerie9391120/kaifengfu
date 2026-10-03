// 聊天记录怎么滚（src/scroll.js）：跟着最新、不拽、滑回最底下、滑回最顶。只验规矩，不碰浏览器。
// 真浏览器里的那一遍在 tests/e2e_gesture.py。
import { NEAR, GLIDE, createFollow } from "../src/scroll.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const near = (a, b, e = 0.5) => Math.abs(a - b) <= e;

// 一个假的会滚的盒子：写 scrollTop 的时候照浏览器那样收到 0 和最底下之间
const box = (scrollHeight, clientHeight) => {
  let top = 0;
  return {
    scrollHeight, clientHeight,
    get scrollTop() { return top; },
    set scrollTop(v) { top = Math.max(0, Math.min(v, this.scrollHeight - this.clientHeight)); },
    get max() { return this.scrollHeight - this.clientHeight; },
  };
};
// 假的钟和动画帧
const world = (e, { reduce = false } = {}) => {
  let t = 1000;
  let seq = 0;
  let frames = [];
  const said = [];
  const f = createFollow({
    el: () => e,
    onAway: (v) => said.push(v),
    raf: (fn) => { frames.push({ id: ++seq, fn }); return seq; },
    caf: (id) => { frames = frames.filter((x) => x.id !== id); },
    now: () => t,
    still: () => reduce,
  });
  // 过 n 帧，一帧 16 毫秒
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { t += 16; const due = frames; frames = []; due.forEach((x) => x.fn()); } };
  return { f, said, tick, pending: () => frames.length };
};
const ALL = Math.ceil(GLIDE / 16) + 2; // 够滑完的帧数

// ---------- 跟着最新 ----------
{
  const e = box(2000, 600);
  const { f, said } = world(e);
  ok(f.stick() === true && f.away() === false, "刚打开：算跟着最新，圆钮不出来");
  f.changed();
  ok(e.scrollTop === e.max, "东西来了：一下到底");
  f.scrolled();
  ok(f.stick() === true && said.length === 0, "到底的那一下报来的滚动：还是跟着的，没人被惊动");
  e.scrollHeight = 2300; // 又蹦出来一条
  f.changed();
  ok(e.scrollTop === 1700, "在最底下的时候又蹦出一条：跟到新的底");
  e.scrollTop = 1700 - (NEAR - 1);
  f.scrolled();
  ok(f.stick() === true && f.away() === false, `往上挪了不到 ${NEAR} 像素：还算在最底下`);
  e.scrollHeight = 2400;
  f.changed();
  ok(e.scrollTop === 1800, "这时候来了新的：照样带到底");
}

// ---------- 自己滚的那一下，晚一拍才报来 ----------
{
  // 浏览器报“滚了一下”是晚一拍的。自己刚滚到底，紧接着又蹦出来一条长的（比“算在底下”的那点余量还长），
  // 这时候才报来的那一下不能当成她翻的：不然一量离底还远，就不跟了，新来的话全落在屏幕外面
  const e = box(2000, 600);
  const { f, said } = world(e);
  f.changed();                 // 到底（1400）
  e.scrollHeight = 2300;       // 紧接着蹦出来一条 300 高的
  f.scrolled();                // 上面那一下滚动这时候才报来
  ok(f.stick() === true && f.away() === false && said.length === 0, "自己刚滚到底、紧接着又蹦出一条长的，这时候才报来“滚了一下”：不算她翻的，还跟着");
  f.changed();
  ok(e.scrollTop === 1700, "跟到新的底");
  e.scrollTop = 1500; f.scrolled();
  ok(f.stick() === false && f.away() === true, "她真翻上去了（位置不在自己放的那儿了）：照样认");
  e.scrollTop = 1700; f.scrolled();
  ok(f.stick() === true && f.away() === false, "她翻回原来那个位置：照眼下的算（在底下，跟上）");
  e.scrollHeight = 2600;
  e.scrollTop = 1700; f.scrolled();
  ok(f.stick() === false && f.away() === true, "她动过以后，位置碰巧和自己以前放的一样也不算数：离底远了就是不跟了");
}
{
  // 滑完的最后一下也是晚一拍才报来
  const e = box(5000, 600);
  const { f, tick } = world(e);
  f.changed();
  e.scrollTop = 1000; f.scrolled();
  f.bottom(true); tick(ALL);
  e.scrollHeight = 5300;       // 刚滑到底就蹦出一条长的
  f.scrolled();                // 滑的最后一下这时候才报来
  ok(f.stick() === true && f.away() === false, "刚滑到底就蹦出一条长的，滑的最后一下这时候才报来：不算她翻的");
  f.changed();
  ok(e.scrollTop === e.max, "跟到新的底");
}

// ---------- 不拽 ----------
{
  const e = box(2000, 600);
  const { f, said } = world(e);
  f.changed();
  e.scrollTop = e.max - NEAR;
  f.scrolled();
  ok(f.stick() === false && f.away() === true && said.join() === "true", `往上翻了 ${NEAR} 像素：不跟了，圆钮出来（只说一回）`);
  e.scrollTop = 400;
  f.scrolled(); f.scrolled();
  ok(said.join() === "true", "接着翻：圆钮已经在了，不重复说");
  e.scrollHeight = 2500; // 他回了一条
  f.changed();
  ok(e.scrollTop === 400 && f.away() === true, "翻着旧消息的时候来了新话：画面不动");
  e.scrollHeight = 2800;
  f.changed(); f.changed();
  ok(e.scrollTop === 400, "一条一条蹦：都不动");
  e.scrollTop = e.max - 10;
  f.scrolled();
  ok(f.stick() === true && f.away() === false && said.join() === "true,false", "她自己翻回最底下：又跟上了，圆钮收了");
  e.scrollHeight = 3000;
  f.changed();
  ok(e.scrollTop === e.max, "再来新话：带到底");
}
{
  // 最底下回弹：算出来离底是负的，照样算在底下
  const e = box(2000, 600);
  const { f } = world(e);
  f.changed();
  const fake = { scrollHeight: 2000, clientHeight: 600, scrollTop: 1440 };
  const w2 = createFollow({ el: () => fake, onAway: () => {}, raf: () => 0, caf: () => {}, now: () => 0, still: () => false });
  w2.scrolled();
  ok(w2.stick() === true && w2.away() === false, "拉过了底、正在回弹：算在最底下");
}

// ---------- 她自己发话、换对话：一定到底 ----------
{
  const e = box(3000, 600);
  const { f, said } = world(e);
  f.changed();
  e.scrollTop = 500; f.scrolled();
  ok(f.away() === true, "先翻上去");
  f.pin();
  ok(f.stick() === true && f.away() === false && e.scrollTop === 500 && said.join() === "true,false", "她发话了：记成跟着最新，圆钮收了（画面等东西真放进去再动）");
  e.scrollHeight = 3060;
  f.changed();
  ok(e.scrollTop === e.max, "她那句放进去：到底");
}

// ---------- 点圆钮：滑回最底下 ----------
{
  const e = box(5000, 600);
  const { f, said, tick, pending } = world(e);
  f.changed();
  e.scrollTop = 1000; f.scrolled();
  f.bottom(true);
  ok(f.gliding() === "bottom" && f.stick() === true && pending() === 1 && e.scrollTop === 1000, "点圆钮：开始往底下滑（还没动）");
  tick(3);
  const mid = e.scrollTop;
  f.scrolled();
  ok(mid > 1000 && mid < e.max && f.stick() === true && f.away() === true, "滑到半路：自己滑出来的滚动不算她翻的，圆钮先留着");
  ok(mid - 1000 > (e.max - 1000) * 0.3, "先快后慢：三帧已经走了三成多");
  e.scrollHeight = 5400; // 滑的工夫里又蹦出一条
  f.changed();
  ok(e.scrollTop === mid, "滑的工夫里来了新话：不另外跳，接着滑");
  tick(ALL);
  ok(e.scrollTop === e.max && e.max === 4800 && f.gliding() === "" && pending() === 0, "滑完：停在新的底上，不是点的时候的那个底");
  ok(f.stick() === true && f.away() === false && said.join() === "true,false", "到底了：圆钮收了");
}
{
  // 滑到一半她的手指落上来：停下，听她的
  const e = box(5000, 600);
  const { f, tick, pending } = world(e);
  f.changed();
  e.scrollTop = 1000; f.scrolled();
  f.bottom(true);
  tick(4);
  const at = e.scrollTop;
  f.touch();
  ok(f.gliding() === "" && pending() === 0 && e.scrollTop === at, "滑到一半手指落上来：当场停住");
  ok(f.stick() === false && f.away() === true, "停在半路：不算在最底下，圆钮还在");
  tick(ALL);
  ok(e.scrollTop === at, "停了就是停了，后面不再动");
  e.scrollHeight = 5300; f.changed();
  ok(e.scrollTop === at, "这时候来新话：不拽");
  f.touch();
  ok(f.stick() === false, "没在滑的时候手指落上来：什么都不变");
}
{
  // 本来就在底下再点：不滑
  const e = box(2000, 600);
  const { f, pending } = world(e);
  f.changed();
  f.bottom(true);
  ok(pending() === 0 && e.scrollTop === e.max && f.away() === false, "本来就在最底下：不用滑");
}
{
  // 减弱动态效果：一下到，不滑
  const e = box(5000, 600);
  const { f, pending } = world(e, { reduce: true });
  f.changed();
  e.scrollTop = 800; f.scrolled();
  f.bottom(true);
  ok(pending() === 0 && e.scrollTop === e.max && f.away() === false && f.stick() === true, "系统开了“减弱动态效果”：一下到底，不滑");
  f.top();
  ok(pending() === 0 && e.scrollTop === 0 && f.away() === true && f.stick() === false, "回顶也是一下到");
}

// ---------- 键盘弹出来：一下到底 ----------
{
  const e = box(5000, 600);
  const { f, tick, pending } = world(e);
  f.changed();
  e.scrollTop = 800; f.scrolled();
  f.top();
  tick(2);
  f.bottom(false);
  ok(e.scrollTop === e.max && pending() === 0 && f.gliding() === "" && f.stick() === true && f.away() === false, "正往顶上滑的时候键盘弹出来：滑的那一下停掉，一下到底");
}

// ---------- 点上面：滑回最顶 ----------
{
  const e = box(5000, 600);
  const { f, said, tick } = world(e);
  f.changed();
  f.top();
  ok(f.gliding() === "top" && f.stick() === false && f.away() === true && said.join() === "true", "在最底下点上面：往顶上滑，圆钮马上出来（好回来）");
  tick(2);
  e.scrollHeight = 5200; f.changed();
  f.scrolled();
  ok(f.stick() === false && e.scrollTop < 4400 && e.scrollTop > 0, "滑的工夫里来了新话：不打岔");
  tick(ALL);
  ok(e.scrollTop === 0 && f.gliding() === "" && f.stick() === false && f.away() === true, "滑完：在最顶上，圆钮在");
  f.pin();
  f.changed();
  ok(e.scrollTop === e.max && f.away() === false, "在顶上的时候她发话：到底");
}
{
  // 正往顶上滑的时候她发话：不滑了，到底
  const e = box(5000, 600);
  const { f, tick, pending } = world(e);
  f.changed();
  f.top();
  tick(3);
  f.pin();
  ok(pending() === 0 && f.gliding() === "" && f.stick() === true, "正往顶上滑的时候她发话：滑的那一下停掉");
  f.changed();
  ok(e.scrollTop === e.max, "她那句放进去：到底");
}
{
  // 一屏就放得下的对话：顶就是底
  const e = box(600, 600);
  const { f, said, pending } = world(e);
  f.changed();
  f.top();
  ok(said.length === 0 && pending() === 0 && f.stick() === true && f.away() === false, "一屏就放得下：点上面什么都不用做，圆钮不出来");
  const e2 = box(640, 600); // 只多出来一点点
  const w = world(e2);
  w.f.changed();
  w.f.top(); w.tick(ALL);
  ok(e2.scrollTop === 0 && w.f.away() === false && w.f.stick() === true && w.said.length === 0, `只比一屏多出不到 ${NEAR} 像素：滑到顶也还算在底下，圆钮不出来`);
}
{
  // 往顶上滑的半路又点圆钮
  const e = box(5000, 600);
  const { f, tick, pending } = world(e);
  f.changed();
  f.top(); tick(5);
  f.bottom(true);
  ok(f.gliding() === "bottom" && pending() === 1, "往顶上滑的半路点圆钮：改成往底下滑，不是两头一起滑");
  tick(ALL);
  ok(e.scrollTop === e.max && f.away() === false, "滑回最底下");
}

// ---------- 盒子还没摆出来 ----------
{
  let said = 0;
  const f = createFollow({ el: () => null, onAway: () => { said++; }, raf: () => 0, caf: () => {}, now: () => 0, still: () => false });
  f.scrolled(); f.changed(); f.touch(); f.bottom(true); f.bottom(false); f.top();
  ok(f.gliding() === "" && said === 0, "聊天记录那个盒子还没摆出来：叫什么都不出错");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
