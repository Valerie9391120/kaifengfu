// 聊天记录怎么滚（src/scroll.js）：跟着最新、不拽、滑回最底下、滑回最顶。只验规矩，不碰浏览器。
// 真浏览器里的那一遍在 tests/e2e_gesture.py。
//
// 三部分：
//   一、拿一个假的会滚的盒子，一句一句叫，验每条规矩
//   二、照浏览器的次序排一遍（先报“滚了一下”，再跑动画帧，最后量大小），验“晚一拍”的那些事
//   三、乱来一通：随便翻、随便来话、随便点，规矩不能破
import { NEAR, GLIDE, createFollow } from "../src/scroll.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };

// ====================================================================================
// 一、一句一句叫
// ====================================================================================

// 假的会滚的盒子：写 scrollTop 的时候照浏览器那样收到 0 和最底下之间（raw 可以硬塞一个回弹时的数）
const box = (scrollHeight, clientHeight) => {
  let top = 0;
  return {
    scrollHeight, clientHeight,
    get scrollTop() { return top; },
    set scrollTop(v) { top = Math.max(0, Math.min(v, this.scrollHeight - this.clientHeight)); },
    raw(v) { top = v; },
    get max() { return this.scrollHeight - this.clientHeight; },
  };
};
// 假的钟和动画帧
const world = (e, { reduce = false } = {}) => {
  let t = 1000;
  let seq = 0;
  let frames = [];
  const said = [];
  const halted = [];
  const f = createFollow({
    el: () => e,
    onAway: (v) => said.push(v),
    raf: (fn) => { frames.push({ id: ++seq, fn }); return seq; },
    caf: (id) => { frames = frames.filter((x) => x.id !== id); },
    now: () => t,
    still: () => reduce,
    halt: () => halted.push(t),
  });
  // 过 n 帧，一帧 16 毫秒
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { t += 16; const due = frames; frames = []; due.forEach((x) => x.fn()); } };
  const wait = (ms) => { t += ms; };
  return { f, said, halted, tick, wait, pending: () => frames.length };
};
const ALL = Math.ceil(GLIDE / 16) + 2; // 够滑完的帧数

ok(NEAR === 64 && GLIDE === 380, "说好的两个数：离底不到 64 像素算在最底下，滑回去走 380 毫秒");

// ---------- 跟着最新 ----------
{
  const e = box(2000, 600);
  const { f, said, wait } = world(e);
  ok(f.stick() === true && f.away() === false, "刚打开：算跟着最新，圆钮不出来");
  f.pin(); f.changed(); wait(1000);
  ok(e.scrollTop === e.max, "打开一段对话：一下到底");
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
  ok(e.scrollTop === 400 && f.away() === true && f.stick() === false, "翻着旧消息的时候来了新话：画面不动");
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
  // 没跟着的时候东西变矮了、盒子变高了，正好又到了底：没有“滚了一下”可报，也得认出来
  const e = box(2000, 600);
  const { f, said } = world(e);
  f.changed();
  e.scrollTop = e.max - 100; f.scrolled();
  ok(f.away() === true, "先翻上去 100");
  e.scrollHeight = 1950; // “正在输入”那一行撤了：离底只剩 50
  f.changed();
  ok(e.scrollTop === 1300 && f.stick() === true && f.away() === false && said.join() === "true,false", "东西变矮了、离底不到 64 了：画面不动，算回到最底下，圆钮收了");
  e.scrollTop = 1150; f.scrolled();
  ok(f.away() === true, "再翻上去");
  e.clientHeight = 800; // 键盘收了，盒子变高
  f.changed();
  ok(f.stick() === true && f.away() === false, "盒子变高了、又够着底了：圆钮收了");
}
{
  // 回弹
  const e = box(2000, 600);
  const { f } = world(e);
  f.changed();
  e.raw(1500); // 拉过了底 100
  f.scrolled();
  ok(f.stick() === true && f.away() === false, "拉过了底、正在回弹（离底算出来是负一百）：算在最底下");
  const short = box(630, 600); // 只比一屏多 30
  const w = world(short);
  w.f.changed();
  short.raw(-80); // 在顶上往下拉，位置成了负的
  w.f.scrolled();
  ok(w.f.stick() === true && w.f.away() === false, "一屏差不多放得下的对话，在顶上往下拉（位置是负的）：不当成翻走了，圆钮不闪");
}

// ---------- 晚一拍报来的“滚了一下” ----------
{
  // 自己刚滚到底，紧接着又蹦出来一条长的，这时候才报来“滚了一下”：位置还在自己放的地方，不算她翻的
  const e = box(2000, 600);
  const { f, said } = world(e);
  f.changed();
  e.scrollHeight = 2300;
  f.scrolled();
  ok(f.stick() === true && f.away() === false && said.length === 0, "自己刚滚到底、紧接着蹦出一条长的，这时候才报来“滚了一下”：不算她翻的");
  f.changed();
  ok(e.scrollTop === 1700, "跟到新的底");
}
{
  // 她的手指在最底下轻轻动着，这时候蹦出一条长的：她那一下是照“变长之前的底”认的
  const e = box(2000, 600);
  const { f, said } = world(e);
  f.changed();
  e.scrollTop = 1395; f.scrolled();   // 手指往上带了 5
  ok(f.stick() === true, "手指在最底下动了 5 个像素：还跟着");
  e.scrollHeight = 2300;              // 蹦出一条 300 高的，还没来得及跟
  e.scrollTop = 1392;                 // 手指又动了 3
  f.scrolled();                       // 这一下报来的时候，离新的底有 308
  ok(f.stick() === true && f.away() === false && said.length === 0, "蹦出一条长的、还没跟上的那一小会儿，手指又动了一下：照变长之前的底认，还算跟着");
  f.changed();
  ok(e.scrollTop === 1700, "跟到新的底");
  e.scrollHeight = 2600;
  e.scrollTop = 1700 - 200;           // 这回她是真往上翻了 200
  f.scrolled();
  ok(f.stick() === false && f.away() === true, "同样的工夫里她真往上翻了 200：照变长之前的底也远了，不跟");
  f.changed();
  ok(e.scrollTop === 1500, "画面不动");
}
{
  // 蹦出一条长的、还没跟上的那一小会儿，连着报来两下滚动：头一下认完不许顺手把账对到新的高度上，不然第二下就照新的底量了
  const e = box(2000, 600);
  const { f, said } = world(e);
  f.changed();
  e.scrollHeight = 2300;
  e.scrollTop = 1397; f.scrolled();
  e.scrollTop = 1394; f.scrolled();
  ok(f.stick() === true && said.length === 0, "还没跟上的那一小会儿连着报来两下：两下都照变长之前的底认，还算跟着");
  f.changed();
  ok(e.scrollTop === 1700, "跟到新的底");
}
{
  // 蹦出一条长的、还没跟上，这时候她的手指落在聊天记录上（没在滑）：手指落下不算“重新量”，不然照新的高度一量就成了翻走
  const e = box(2000, 600);
  const { f, said } = world(e);
  f.changed();
  e.scrollHeight = 2300;
  f.touch();
  ok(f.stick() === true && f.away() === false && said.length === 0, "还没跟上的时候手指落在聊天记录上：照旧跟着（没在滑的时候，手指落下什么都不动）");
  f.changed();
  ok(e.scrollTop === 1700, "跟到新的底");
}
{
  // 认“位置变没变”的那条线是 1 个像素：差 0.9 不算，差 1 就算
  const e = box(3000, 600);
  const { f, halted, wait } = world(e);
  f.changed();
  e.raw(2399.1); f.scrolled();          // 差 0.9（位置带小数的手机上常有）：不算滚过
  f.bottom(false);
  ok(halted.length === 0, "位置只差 0.9 个像素报来一下：不算她滚的");
  wait(1000);
  e.scrollTop = 2399; f.scrolled();     // 差 1：算
  f.bottom(false);
  ok(halted.length === 1, "差 1 个像素：算她滚的（紧跟着到底要叫停）");
}
{
  // 东西变了的时候“她动过没有”也是这条线：挪了 0.9 不先认，挪了 1 就先认
  const e = box(3000, 600);
  const { f } = world(e);
  f.changed();
  e.raw(2400 - 63.5); f.scrolled();
  ok(f.stick() === true, "离底 63.5：还跟着");
  e.raw(2400 - 64.4);                   // 又往上挪了 0.9，没报来
  e.scrollHeight = 3100; f.changed();
  ok(e.scrollTop === e.max && f.stick() === true, "又挪了 0.9 个像素、没报来就来了新话：不算她动过，照旧跟到底");
  const g = box(3000, 600);
  const w = world(g);
  w.f.changed();
  g.raw(2400 - 63.5); w.f.scrolled();
  g.raw(2400 - 64.5);                   // 这回挪了正好 1，过了 64 那条线
  g.scrollHeight = 3100; w.f.changed();
  ok(g.scrollTop === 2400 - 64.5 && w.f.stick() === false && w.f.away() === true, "挪了正好 1 个像素（离底 64.5）、没报来就来了新话：先认她那一下，算翻走了，不拽");
}
{
  // 她刚好挪过了那条线（离底 63 → 65），这一下还没报来，就来了新话：先认她那一下，不拽
  const e = box(3000, 600);
  const { f } = world(e);
  f.changed();
  e.scrollTop = 2400 - 63; f.scrolled();
  ok(f.stick() === true, "离底 63：还跟着");
  e.scrollTop = 2400 - 65;              // 又往上挪了 2 个像素，没报来
  e.scrollHeight = 3100; f.changed();
  ok(e.scrollTop === 2400 - 65 && f.stick() === false && f.away() === true, "又往上挪了 2 个像素（离底 65）、还没报来就来了新话：先认她那一下，算翻走了，不拽");
}
{
  // 她动过以后，位置碰巧回到自己以前放的地方，不能再当成“自己放的”
  const e = box(2000, 600);
  const { f } = world(e);
  f.changed();                 // 自己放在 1400
  e.scrollTop = 1000; f.scrolled();
  e.scrollHeight = 2600; f.changed();
  e.scrollTop = 1400; f.scrolled();
  ok(f.stick() === false && f.away() === true, "她翻走以后又翻到自己以前放的那个位置（这时候离底已经很远）：照眼下的认");
}
{
  // 滑完的最后一下也是晚一拍才报来
  const e = box(5000, 600);
  const { f, tick } = world(e);
  f.changed();
  e.scrollTop = 1000; f.scrolled();
  f.bottom(true); tick(ALL);
  e.scrollHeight = 5300;
  f.scrolled();
  ok(f.stick() === true && f.away() === false, "刚滑到底就蹦出一条长的，滑的最后一下这时候才报来：不算她翻的");
  f.changed();
  ok(e.scrollTop === e.max, "跟到新的底");
}

{
  // 键盘收起来、位置被浏览器收到底，紧跟着蹦出一条。浏览器报的高度是凑成整数的，位置可以带小数：差的那点零头不碍事
  const e = box(2000, 300);
  const { f } = world(e);
  f.changed();                 // 键盘开着，在最底下（1700）
  e.clientHeight = 600;        // 键盘收了
  e.raw(1400.4);               // 浏览器把位置收到了底：真的底带着小数，比拿整数算出来的 1400 多一点
  e.scrollHeight = 2100;       // 紧跟着蹦出一条
  f.changed();
  ok(e.scrollTop === 1500 && f.stick() === true && f.away() === false, "键盘收起来被收到底（位置带着 0.4 的零头）、紧跟着蹦出一条：照样跟到底");
  for (const [off, follows] of [[0.9, true], [-0.9, true], [1, false], [-1, false]]) {
    const b = box(2000, 300);
    const w = world(b);
    w.f.changed();
    b.clientHeight = 600;
    b.raw(1400 + off);
    b.scrollHeight = 2100;
    w.f.changed();
    ok((b.scrollTop === 1500) === follows && w.f.stick() === follows, `同上，位置离那个底差 ${off} 个像素：${follows ? "算被收过去的，跟" : "不算，不跟"}`);
  }
}

// ---------- 她自己发话、换对话：一定到底 ----------
{
  const e = box(3000, 600);
  const { f, said, wait } = world(e);
  f.changed();
  e.scrollTop = 500; f.scrolled();
  ok(f.away() === true, "先翻上去");
  f.pin();
  ok(f.stick() === true && f.away() === false && e.scrollTop === 500 && said.join() === "true,false", "她发话了：记成跟着最新，圆钮收了（画面等东西真放进去再动）");
  e.scrollTop = 470; f.scrolled();     // 发话那一下聊天记录还带着惯性，又报来一下
  ok(f.away() === true, "发话的时候聊天记录还带着惯性往上走：这一下照实认（圆钮闪出来）");
  e.scrollHeight = 3060;
  f.changed();
  ok(e.scrollTop === e.max && f.stick() === true && f.away() === false, "她那句放进去：不管刚才报来过什么，到底");
  wait(700);
  e.scrollTop = 500; f.scrolled();
  e.scrollHeight = 3200; f.changed();
  ok(e.scrollTop === 500, "过了那一小会儿（半秒多），她再翻上去、再来新话：照旧不拽");
}
{
  // 带着惯性的时候到底：先叫它停
  const e = box(3000, 600);
  const { f, halted, wait } = world(e);
  f.changed();
  e.scrollTop = 900; f.scrolled();     // 她刚滚过
  f.pin(); e.scrollHeight = 3050; f.changed();
  ok(halted.length === 1 && e.scrollTop === e.max, "聊天记录刚滚过（多半还带着惯性）的时候她发话：先叫它停下，再到底");
  wait(1000);
  e.scrollTop = 900; f.scrolled(); wait(1000);
  f.pin(); e.scrollHeight = 3100; f.changed();
  ok(halted.length === 1, "早就停稳了的时候发话：用不着叫停");
  e.scrollTop = 900; f.scrolled();
  f.bottom(false);
  ok(halted.length === 2 && e.scrollTop === e.max, "带着惯性的时候键盘弹出来：也先叫停");
  wait(1000);
  e.scrollTop = 900; f.scrolled();
  f.bottom(true);
  ok(halted.length === 3, "带着惯性的时候点圆钮：也先叫停，再滑");
  wait(1000);
  e.scrollHeight = 3300; f.changed();
  ok(halted.length === 3, "平常跟着新话到底：不叫停");
}
{
  // “刚滚过”的那条线是 0.2 秒
  const e = box(3000, 600);
  const { f, halted, wait } = world(e);
  f.changed();
  e.scrollTop = 900; f.scrolled(); wait(190);
  f.bottom(false);
  ok(halted.length === 1, "0.19 秒前滚过：算还带着惯性，叫停");
  e.scrollTop = 900; f.scrolled(); wait(210);
  f.bottom(false);
  ok(halted.length === 1, "0.21 秒前滚过：不算，不叫停");
}
{
  // “刚发话”的那条线是 0.6 秒
  const e = box(3000, 600);
  const { f, wait } = world(e);
  f.changed();
  f.pin(); wait(590);
  e.scrollTop = 500; f.scrolled();
  e.scrollHeight = 3100; f.changed();
  ok(e.scrollTop === e.max, "发话以后 0.59 秒来的：不管中间报来过什么，到底");
  f.pin(); wait(610);
  e.scrollTop = 500; f.scrolled();
  e.scrollHeight = 3200; f.changed();
  ok(e.scrollTop === 500, "发话以后 0.61 秒才来的、她已经翻上去了：不拽");
}
{
  // 叫停只在她真滚过的时候：自己滚的那一下晚一拍报来，不算她滚的
  const e = box(3000, 600);
  const { f, halted } = world(e);
  f.pin(); f.changed();     // 自己一下到底（写的是“越大越好”，浏览器收到了 2400）
  f.scrolled();             // 这一下晚一拍报来
  f.bottom(false);          // 紧跟着键盘弹出来
  ok(halted.length === 0 && e.scrollTop === e.max, "自己到底的那一下晚一拍报来、紧跟着键盘弹出来：那一下不算她滚的，用不着叫停");
}
{
  // 手指在最底下带着的时候来了新话：跟，可不叫停（叫停是不许它滚一小会儿，会把她手上这一下掐断）
  const e = box(3000, 600);
  const { f, halted } = world(e);
  f.changed();
  e.scrollTop = e.max - 5; f.scrolled();
  e.scrollHeight = 3100; f.changed();
  ok(e.scrollTop === e.max && halted.length === 0, "手指在最底下带着的时候来了新话：跟到底，不叫停");
}
{
  // 往顶上滑的时候聊天记录变矮了，位置被浏览器收了一下；这时候她的手指落上来
  const e = box(5000, 600);
  const { f, halted, tick } = world(e);
  f.changed();
  f.top(); tick(3);
  const at = e.scrollTop;
  e.scrollHeight = at + 600 - 500;   // 变矮了：最底下比眼下的位置还高 500
  e.scrollTop = e.scrollTop;         // 浏览器把位置收回来
  f.changed();
  f.touch();                         // 手指落上来：停在这儿，照眼下的样子量
  f.scrolled();                      // 被收的那一下这时候才报来
  ok(e.scrollTop === at - 500 && f.stick() === true && f.away() === false, "往顶上滑的半路变矮了、被收到了底，手指落上来：停在底下，算跟着");
  f.bottom(false);
  ok(halted.length === 0, "被浏览器收的那一下不算她滚的：过后到底用不着叫停");
}

// ---------- 她自己点开的（思考过程）：不跟 ----------
{
  const e = box(2000, 600);
  const { f, said, wait } = world(e);
  f.changed();
  f.loose();
  e.scrollHeight = 2400;       // 点开的那段字有 400 高
  f.changed();
  ok(e.scrollTop === 1400 && f.stick() === false && f.away() === true && said.join() === "true", "在最底下点开“思考过程”、聊天记录变高了：画面不动（刚点开的字不被带走），圆钮出来");
  e.scrollHeight = 2460;
  f.changed();
  ok(e.scrollTop === 1400, "这时候来新话：不拽");
  e.scrollTop = e.max; f.scrolled();
  f.loose();
  e.scrollHeight = 2060;       // 又点了一下，收起来
  e.scrollTop = e.scrollTop;   // 浏览器把位置收回来
  f.changed();
  ok(f.stick() === true && f.away() === false, "收起来、又在最底下了：跟上");
  f.loose(); wait(1000);
  e.scrollHeight = 2200; f.changed();
  ok(e.scrollTop === e.max, "点了却没变高（过了一小会儿才来的是新话）：照样跟到底，不把新话当成她点开的");
  // 那一小会儿是 0.4 秒
  f.loose(); wait(390);
  e.scrollHeight = 2400; f.changed();
  ok(e.scrollTop === 1600 && f.away() === true, "点开以后 0.39 秒变高的：算她点开的，不跟");
  e.scrollTop = e.max; f.scrolled();
  f.loose(); wait(410);
  e.scrollHeight = 2600; f.changed();
  ok(e.scrollTop === e.max, "点开以后 0.41 秒才变高的：算新话，跟");
  f.loose(); f.pin();
  e.scrollHeight = 2300; f.changed();
  ok(e.scrollTop === e.max, "点开以后紧接着发话：发话说了算，到底");
}
{
  const e = box(2000, 600);
  const { f } = world(e);
  f.changed();
  f.loose();
  f.bottom(false);             // 点开以后键盘马上弹出来（点圆钮也一样）
  e.scrollHeight = 2300; f.changed();
  ok(e.scrollTop === e.max, "点开以后紧接着键盘弹出来：她要的是到底，点开的那一小会儿作废，接着来的新话照跟");
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
  ok(mid > 1000 && mid < e.max && f.stick() === true && f.away() === true, "滑到半路：圆钮先留着");
  ok(mid - 1000 > (e.max - 1000) * 0.3 && mid - 1000 < (e.max - 1000) * 0.4, "先快后慢：三帧走了三成多（不到四成）");
  e.scrollHeight = 5200; // 滑的工夫里蹦出一条
  f.changed();
  ok(e.scrollTop === mid && f.gliding() === "bottom", "滑的半路来了新话：不跳到底再被拉回来，画面还在半路上");
  e.scrollTop = mid - 300;     // 滑的工夫里别的东西也在带着它滚（惯性没停干净）
  f.scrolled();
  ok(f.stick() === true && f.away() === true && f.gliding() === "bottom", "滑的工夫里报来的滚动（位置不在自己放的地方）：先不认，滑完再说");
  e.scrollHeight = 5400; // 又蹦出一条
  const before = e.scrollTop;
  f.changed();
  ok(e.scrollTop === before, "这时候再来新话：也不另外跳，接着滑");
  tick(10);
  ok(f.gliding() === "bottom" && e.scrollTop < e.max, `滑了十三帧（两百来毫秒）还没到：不是一眨眼就到的（一共走 ${GLIDE} 毫秒）`);
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
}
{
  // 离底只有一百来像素也是滑过去的，不是一下跳过去
  const e = box(2000, 600);
  const { f, tick, pending } = world(e);
  f.changed();
  e.scrollTop = e.max - 100; f.scrolled();
  f.bottom(true);
  ok(pending() === 1 && e.scrollTop === e.max - 100, "离底 100 点圆钮：也是滑过去的");
  tick(ALL);
  ok(e.scrollTop === e.max && f.away() === false, "滑到底");
}
{
  // 在顶上往下拉过了头（位置是负的、正在回弹）的时候点上面：已经在顶了，不用滑
  const e = box(3000, 600);
  const { f, pending } = world(e);
  f.changed();
  e.raw(-50);
  f.top();
  ok(pending() === 0 && f.gliding() === "", "在顶上拉过了头的时候点上面：不滑（负的位置当成 0）");
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
  ok(f.stick() === false && e.scrollTop < 4400 && e.scrollTop > 0, "滑的工夫里来了新话：不打岔");
  tick(ALL);
  ok(e.scrollTop === 0 && f.gliding() === "" && f.stick() === false && f.away() === true, "滑完：在最顶上，圆钮在");
  f.pin();
  e.scrollHeight = 5260; f.changed();
  ok(e.scrollTop === e.max && f.away() === false, "在顶上的时候她发话：到底");
}
{
  // 往顶上滑才起步（离底还不到 64 像素）的时候对话变了一下：不重新量（一量就成了“在底下”，圆钮收了，再来新话还会往回带）
  const e = box(1000, 600);
  const { f, said, tick } = world(e);
  f.changed();
  f.top(); tick(1);
  const at = e.scrollTop;
  ok(at < e.max && e.max - at < NEAR, `不长的对话，往顶上滑了一帧：离底才 ${Math.round(e.max - at)}`);
  f.changed();                           // 对话变了一下，高度没变
  ok(e.scrollTop === at && f.gliding() === "top" && f.stick() === false && f.away() === true && said.join() === "true", "这时候对话变了一下：照旧往顶上滑，没被当成“在底下”，圆钮没闪");
  e.scrollHeight = 1100; f.changed();    // 又来了新话
  ok(e.scrollTop === at, "又来了新话：不往回带");
  tick(ALL);
  ok(e.scrollTop === 0 && f.away() === true, "滑到顶，圆钮在");
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
  e.scrollHeight = 5060; f.changed();
  ok(e.scrollTop === e.max, "她那句放进去：到底");
}
{
  // 正往底下滑的时候她发话：接着滑就是了
  const e = box(5000, 600);
  const { f, tick, pending } = world(e);
  f.changed();
  e.scrollTop = 500; f.scrolled();
  f.bottom(true); tick(3);
  f.pin();
  ok(f.gliding() === "bottom" && pending() === 1, "正往底下滑的时候她发话：不打断，接着滑");
  e.scrollHeight = 5060; f.changed();
  tick(ALL);
  ok(e.scrollTop === e.max && f.away() === false, "滑到新的底");
}
{
  // 一屏就放得下的对话：顶就是底
  const e = box(600, 600);
  const { f, said, pending } = world(e);
  f.changed();
  f.top();
  ok(said.length === 0 && pending() === 0 && f.stick() === true && f.away() === false, "一屏就放得下：点上面什么都不用做，圆钮不出来");
  const e2 = box(600 + NEAR - 1, 600); // 只多出来一点点
  const w = world(e2);
  w.f.changed();
  w.f.top(); w.tick(ALL);
  ok(e2.scrollTop === 0 && w.f.away() === false && w.f.stick() === true && w.said.length === 0, `只比一屏多出不到 ${NEAR} 像素：滑到顶也还算在底下，圆钮不出来`);
  const e3 = box(600 + NEAR, 600);
  const w3 = world(e3);
  w3.f.changed();
  w3.f.top();
  ok(w3.said.join() === "true", `正好多出 ${NEAR} 像素：点上面圆钮就出来`);
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

// ---------- 盒子被藏起来（整页藏起来的时候量到的全是零） ----------
{
  const e = box(3000, 600);
  const { f, said } = world(e);
  f.changed();
  e.scrollTop = 800; f.scrolled();
  let kept = null;
  const hide = () => { kept = [e.scrollHeight, e.clientHeight, e.scrollTop]; e.scrollHeight = 0; e.clientHeight = 0; e.raw(0); };
  const show = () => { e.scrollHeight = kept[0]; e.clientHeight = kept[1]; e.raw(kept[2]); };
  hide(); f.changed(); f.scrolled();
  ok(f.away() === true && f.stick() === false && said.join() === "true", "翻着旧消息的时候整页被藏起来、量到的全是零：不认，照旧记着她翻上去了");
  show(); f.changed();
  ok(e.scrollTop === 800 && f.away() === true && f.stick() === false, "盒子回来：她还在原来翻到的地方，没被带到底");
  e.scrollTop = e.max; f.scrolled();
  hide(); f.changed();
  kept[0] = 3200;                               // 藏着的工夫里来了新话
  show(); f.changed();
  ok(e.scrollTop === e.max && e.max === 2600 && f.stick() === true, "跟着的人：藏着的工夫里来了新话，盒子回来就跟到底");
}
{
  // 滑到一半整页被藏起来：就此停下，不拿零去滚、去记；回来以后照眼下的样子办
  const e = box(5000, 600);
  const { f, tick, pending } = world(e);
  f.changed();
  e.scrollTop = 1000; f.scrolled();
  f.bottom(true); tick(3);
  const kept = [e.scrollHeight, e.clientHeight, e.scrollTop];
  e.scrollHeight = 0; e.clientHeight = 0; e.raw(0);
  tick(ALL);
  ok(f.gliding() === "" && pending() === 0, "往底下滑到一半整页被藏起来：滑的那一下就此停下");
  e.scrollHeight = kept[0]; e.clientHeight = kept[1]; e.raw(kept[2]);
  f.changed();
  ok(e.scrollTop === e.max && f.stick() === true && f.away() === false, "盒子回来：她点过圆钮的，到底");
}
{
  // 往顶上滑到一半整页被藏起来：一样停下；回来以后她在哪还在哪，不许因为记了一堆零就把她带到底
  const e = box(5000, 600);
  const { f, tick, pending } = world(e);
  f.changed();
  f.top(); tick(6);
  const kept = [e.scrollHeight, e.clientHeight, e.scrollTop];
  e.scrollHeight = 0; e.clientHeight = 0; e.raw(0);
  tick(ALL);
  ok(f.gliding() === "" && pending() === 0, "往顶上滑到一半整页被藏起来：也就此停下");
  e.scrollHeight = kept[0]; e.clientHeight = kept[1]; e.raw(kept[2]);
  f.changed();
  ok(e.scrollTop === kept[2] && kept[2] > 0 && kept[2] < 4400 - NEAR && f.stick() === false && f.away() === true, "盒子回来：停在半路上，没被带到底，圆钮在");
}

// ---------- 盒子还没摆出来 ----------
{
  let said = 0;
  const f = createFollow({ el: () => null, onAway: () => { said++; }, raf: () => 0, caf: () => {}, now: () => 0, still: () => false });
  f.scrolled(); f.changed(); f.touch(); f.bottom(true); f.bottom(false); f.top(); f.loose();
  ok(f.gliding() === "" && said === 0, "聊天记录那个盒子还没摆出来：叫什么都不出错");
  const e = box(2000, 600);
  const g = createFollow({ el: () => e, onAway: () => {}, raf: () => 0, caf: () => {}, now: () => 0, still: () => false });
  g.changed(); e.scrollTop = 100; g.scrolled(); g.pin(); e.scrollHeight = 2100; g.changed(); g.bottom(false);
  ok(e.scrollTop === e.max, "没给“叫停惯性”的办法：照样能用");
}

// ====================================================================================
// 二、照浏览器的次序排一遍
// 一帧里的次序：先把攒着的“滚了一下”报出来 → 跑排好的动画帧 → 量大小（变了就报 changed）→ 画。
// 位置一变（谁变的都算）就攒一个“滚了一下”，下一帧才报。
// App.jsx 的接法：对话变了当场报 changed（commit）；别的变高变矮（图片出来、输入框长高……）等量大小的时候才报（quiet）。
// ====================================================================================
function browser({ H = 3000, C = 600 } = {}) {
  const w = { K: H, C, top: 0, pending: false, rafs: [], dead: new Set(), seq: 0, t: 1000, said: [], halts: 0, roK: H, roC: C };
  const max = () => Math.max(0, Math.max(w.K, w.C) - w.C);
  const el = {
    get scrollHeight() { return Math.max(w.K, w.C); },
    get clientHeight() { return w.C; },
    get scrollTop() { return w.top; },
    set scrollTop(v) { const n = Math.max(0, Math.min(v, max())); if (n !== w.top) { w.top = n; w.pending = true; } },
  };
  w.f = createFollow({
    el: () => el,
    onAway: (v) => w.said.push(v),
    raf: (fn) => { w.rafs.push({ id: ++w.seq, fn }); return w.seq; },
    caf: (id) => { w.rafs = w.rafs.filter((x) => x.id !== id); w.dead.add(id); },
    now: () => w.t,
    still: () => false,
    halt: () => { w.halts++; },
  });
  const clamp = () => { if (w.top > max()) { w.top = max(); w.pending = true; } };
  w.gap = () => Math.max(w.K, w.C) - w.C - w.top;
  w.max = max;
  w.frame = () => {
    w.t += 16.7;
    if (w.pending) { w.pending = false; w.f.scrolled(); }
    const due = w.rafs; w.rafs = [];
    due.forEach((x) => { if (!w.dead.has(x.id)) x.fn(); });   // 这一帧里前头的把后头的取消了：不跑
    if (w.roK !== w.K || w.roC !== w.C) { w.roK = w.K; w.roC = w.C; w.f.changed(); }
  };
  w.frames = (n) => { for (let i = 0; i < n; i++) w.frame(); };
  w.commit = (dh) => { w.K = Math.max(40, w.K + dh); clamp(); w.f.changed(); };   // 对话变了：当场报
  w.quiet = (dh) => { w.K = Math.max(40, w.K + dh); clamp(); };                    // 别的变高变矮：量大小的时候才报
  w.resize = (dc) => { w.C = Math.max(100, w.C + dc); clamp(); };                  // 盒子变高变矮（键盘、面板）
  w.user = (d) => { const n = Math.max(0, Math.min(w.top + d, max())); if (n !== w.top) { w.top = n; w.pending = true; } };
  w.send = (dh) => { w.f.pin(); w.commit(dh); };
  w.f.pin(); w.commit(0); w.frames(3); w.t += 1000;
  return w;
}
{
  // 手指在最底下轻轻动着（那一下还没报来），他的回话带着“思考过程”一起蹦出来
  const w = browser();
  w.user(-3);
  w.commit(120);
  w.frames(2);
  ok(w.gap() === 0 && w.f.stick() && !w.f.away(), "手指的那一下还没报来、就蹦出一条长的：照样跟到底");
  w.user(-3); w.frame();
  w.user(-2); w.commit(90); w.user(-2); w.frame(); w.commit(47); w.frames(3);
  ok(w.gap() === 0 && w.f.stick(), "手指一直轻轻动着、话一条条蹦：一路跟到底");
}
{
  // 图片出来把聊天记录撑高（没人当场报，等量大小的时候才报），中间她的手指动了一下
  const w = browser();
  w.user(-4); w.frame();
  w.quiet(280);
  w.user(-4);
  w.frame();
  ok(w.gap() === 0 && w.f.stick() && !w.f.away() && w.said.length === 0, "图片出来撑高了 280、同一帧里手指又动了一下：还是跟到底，圆钮没闪");
}
{
  // 键盘收起来（盒子变高）和蹦出一条，赶在同一帧
  const w = browser();
  w.resize(-300); w.frames(2);
  ok(w.gap() === 0, "键盘弹出来（盒子变矮）：还在最底下");
  w.resize(+300); w.commit(100); w.frames(2);
  ok(w.gap() === 0 && w.f.stick(), "键盘收起来的同一帧里蹦出一条：跟到底");
}
{
  // 键盘开着、她在最底下。同一帧里：她往上翻了一截，图片出来撑高了 280，键盘收了（盒子高了 300）。
  // 这时候没有哪一步是浏览器把她挪到底的，她是自己翻走的。翻了多少都一样：
  //   94：照“原来的东西、现在的盒子”量，她在那个底的下面 206
  //   270：在那个底的下面 30
  //   350：在那个底的上面 50（头一版把“离那个底不到 64”也算成被挪过去的，这一种就被拽回去了）
  for (const d of [94, 270, 350]) {
    const w = browser();
    w.resize(-300); w.frames(2);
    w.user(-d); w.quiet(280.37); w.resize(+300);
    const held = w.top;
    w.frames(3);
    ok(w.top === held && w.f.away() && !w.f.stick() && w.gap() >= NEAR, `键盘开着的时候往上翻了 ${d}，同一帧里图片撑高、键盘收了：算翻走了，画面不动（离底 ${Math.round(w.gap())}）`);
  }
}
{
  // 键盘开着、她翻上去了（没跟着）。同一帧里：图片出来撑高了 120，她往下带了 40，键盘收了。
  // 她正好落在“原来的东西、现在的盒子”的底上；可她本来就没跟着，不是被浏览器挪过去的，离真的底还有 120
  const w = browser();
  w.resize(-300); w.frames(2);
  w.user(-340); w.frames(2);
  ok(w.f.away() && !w.f.stick(), "键盘开着的时候先翻上去 340");
  w.quiet(120.37); w.user(+40); w.resize(+300);
  const held = w.top;
  w.frames(3);
  ok(w.top === held && w.f.away() && !w.f.stick() && Math.round(w.gap()) === 120, "没跟着的时候图片撑高、键盘收了、她正好停在原来那个底上：照旧没跟着，画面不动（离底 120）");
}
{
  // 认不出来的那一种（知道，不防）：键盘收起来、位置被浏览器收到底，同一帧里她的手指又往上带了 10、还蹦出一条。
  // 位置不正好在那个底上了，跟“自己翻走的”分不出来，算她翻走了：圆钮出来，新的那条没跟。宁可这样，也不拽人
  const w = browser();
  w.resize(-300); w.frames(2);
  w.resize(+300); w.user(-10); w.commit(100); w.frames(2);
  ok(w.gap() === 110 && !w.f.stick() && w.f.away(), "键盘收起来、手指同时往上带了 10、同一帧里又蹦出一条：认不出是被挪过去的，算翻走了（圆钮出来，不拽）");
}
{
  // 发话的时候聊天记录还带着惯性：那一下滚动晚一拍报来
  const w = browser();
  w.user(-900); w.frame();
  ok(w.f.away(), "先翻上去");
  w.user(-40);            // 惯性还在走，这一下还没报来
  w.send(47);
  w.frame();              // 惯性的那一下这时候报来
  w.user(-25); w.frame(); // 又一下
  w.commit(30);           // “正在输入”出来
  w.frames(3);
  ok(w.gap() === 0 && w.f.stick() && !w.f.away() && w.halts >= 1, "带着惯性的时候发话：到底，叫停了惯性；紧跟着“正在输入”出来也还在底下");
}
{
  // 换一段对话：先记“到底”，旧的那段先被收到底，过一会儿新的那段才装进来（一样多条）
  const w = browser({ H: 3000 });
  w.user(-1500); w.frames(2);
  w.f.pin(); w.commit(0);        // 换了对话的那一下，里面还是旧的
  w.frames(2);
  w.K = 5200; w.f.changed();     // 新的那段装进来（比旧的长）
  w.frames(2);
  ok(w.gap() === 0 && w.f.stick() && !w.f.away(), "换一段对话、新的那段晚一步才装进来：从最底下看起");
}
{
  // 翻着旧消息的时候：什么都别动她
  const w = browser();
  w.user(-800); w.frame();
  const held = w.top;
  w.commit(120); w.frame(); w.quiet(200); w.frame(); w.commit(47); w.resize(-250); w.frames(2); w.resize(+250); w.frames(3);
  ok(w.top === held && w.f.away() && !w.f.stick(), "翻着旧消息：来新话、图片出来、面板开合，画面都不动，圆钮一直在");
}

// ====================================================================================
// 三、乱来一通
// 自己记一份账（她该不该是“跟着最新”的），每一步以后、最后停稳了，都拿来对
// ====================================================================================
{
  let seed = 20261003;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const bad = {};
  let steps = 0;
  const RUNS = 4000;
  for (let run = 0; run < RUNS; run++) {
    const w = browser({ H: int(300, 5000), C: 600 });
    let want = true;       // 她该不该是跟着的
    let held = null;       // 不跟的时候，画面该停在哪
    let dirty = false;     // 她上一回自己滚过以后，聊天记录又变过没有
    // “她看到的那个底”：对话变了是当场算数的；别的变高变矮要等量大小的那一下（一帧的最后）才算数
    let refK = w.K, refC = w.C;
    let kb = false, panel = false, pinnedAt = -1e9;
    const trace = [];
    const fail = (why) => { if (!bad[why]) bad[why] = { n: 0, trace: trace.slice() }; bad[why].n++; };
    // 不跟的人：东西变矮了、盒子变高了，离底不到 NEAR 了就算回到底下；被浏览器收了位置的，停的地方跟着改
    const requiet = () => {
      if (want !== false) return;
      // 又够着底了：算回到底下，画面不动（所以这时候不要求正好贴着底，下一回来话才贴）
      if (w.gap() < NEAR) { want = true; held = null; dirty = false; } else held = Math.min(held, w.top);
    };
    const pinned = (t) => t - pinnedAt < 600;
    const frame = () => {
      // 这一帧最后要量大小的话：还在“刚发话”的那一小会儿里就一定到底；不然不跟的人重新量一遍
      if ((w.roK !== w.K || w.roC !== w.C) && !w.f.gliding()) {
        if (pinned(w.t + 16.7)) { want = true; held = null; } else requiet();
      }
      w.frame(); refK = w.K; refC = w.C;
    };
    const commit = (dh) => {
      const gl = !!w.f.gliding();
      w.commit(dh); refK = w.K; refC = w.C; dirty = true;
      if (gl) return;
      if (pinned(w.t)) { want = true; held = null; } else requiet();
    };
    // 她滚了一下以后：离她看到的那个底、离眼下的底，有一个不到 NEAR 就算在底下
    const afterUser = () => {
      // 她看到的那个底：那时候的高度，配那时候的盒子、配眼下的盒子（盒子变高的时候位置是当场被收回去的）各算一遍
      const ref = Math.min(Math.max(refK, refC) - refC - w.top, Math.max(refK, w.C) - w.C - w.top);
      want = Math.min(w.gap(), ref) < NEAR;
      held = want ? null : w.top;
      dirty = false;
    };
    const n = int(4, 26);
    for (let i = 0; i < n; i++) {
      steps++;
      const a = pick(["grow", "grow", "grow", "shrink", "user", "user", "user", "img", "send", "kb", "panel", "button", "bartop", "frames", "frames", "think", "finger"]);
      const gliding = !!w.f.gliding();
      if (a === "grow") { const h = pick([10, 50, 63, 64, 65, 120, 400]); commit(h); trace.push("来话+" + h); }
      // 变矮只照整数变，矮不下去（会低过那条 40 的底线）就不变。让它“收到 40 为止”的话，收掉的那一截带着前面图片、思考过程的零头，
      // 紧跟着再点开一块一样高的思考过程，又排得出“正好抵掉”（见下面图片那一条的说明），那是这份假浏览器自己凑出来的巧合
      else if (a === "shrink") { const h = pick([20, 58, 120, 600]); if (w.K - h < 40) continue; commit(-h); trace.push("变矮-" + h); }
      // 悄悄变高的（图片出来、点开思考）高度都故意带个零头 .37，跟当场报的那些整数凑不成“正好抵掉”。
      // 量大小的那个（ResizeObserver）只在大小跟它上一回看到的不一样的时候才报：同一帧里对话先变矮了 140（当场报了、跟了），
      // 紧跟着一张图片出来又撑高了正好 140，它眼里就是没变，不报，这一回就没人跟（下一回一变就跟上）。
      // 真的高度是随便什么数，凑不出正好相等，所以不防这个；全用整数的话，乱来几十万趟能碰上一两回
      else if (a === "img") { const h = pick([40.37, 140.37, 280.37]); w.quiet(h); dirty = true; trace.push("图片+" + h); }
      else if (a === "user" || a === "finger") {
        if (gliding && a === "user") continue;             // 自己滑着的时候，没碰屏幕的滚动（惯性）不算数，这里不排
        if (gliding) { w.f.touch(); refK = w.K; refC = w.C; trace.push("手指落下"); } // 滑到一半被手指按停：停在哪算哪，照眼下的高度认
        const d = pick([-3, -30, -63, -64, -100, -700, 3, 30, 100, 700, 5000]);
        const t0 = w.top; w.user(d); trace.push("她滚" + d);
        if (w.top !== t0 || gliding || want === null) afterUser();
      }
      else if (a === "send") { w.f.pin(); pinnedAt = w.t; commit(pick([47, 120])); trace.push("发话"); }
      else if (a === "kb") {
        if (!kb) { w.resize(-300); kb = true; dirty = true; frame(); frame(); w.f.bottom(false); want = true; held = null; trace.push("键盘开"); }
        else {
          // 键盘收起来以后先过一帧（量大小的那一下报进去）再接着乱来。
          // 不过这一帧的话，可以排出“键盘刚收、同一帧里面板又开”这种连着两回变盒子、中间谁也没看见的次序：
          // 那样 scroll.js 认不出她在中间那个样子里是贴着底的。手上做不出这么快的事，不排
          w.resize(+300); kb = false; dirty = true; trace.push("键盘收"); if (!gliding) requiet(); frame();
        }
      }
      else if (a === "panel") { w.resize(panel ? +250 : -250); panel = !panel; commit(0); trace.push(panel ? "面板开" : "面板收"); }
      // 点圆钮、点上面，本来就在那儿、当场就算到了的：scroll.js 照眼下的样子重新量了一遍，“她看到的那个底”也就算到眼下
      // （不然排得出“点了一下、同一帧里又滚了一下”，两边拿的不是同一个底。手上做不出这么快的事）
      else if (a === "button") { w.f.bottom(true); want = true; held = null; if (!w.f.gliding()) { refK = w.K; refC = w.C; } trace.push("点圆钮"); }
      else if (a === "bartop") { w.f.top(); want = null; held = null; pinnedAt = -1e9; if (!w.f.gliding()) { refK = w.K; refC = w.C; } trace.push("点上面"); } // 点了上面：“刚发话”的那一小会儿到此为止
      else if (a === "think") {
        if (gliding) continue;
        const h = pick([90.37, 400.37]); w.f.loose(); w.quiet(h); w.frame(); refK = w.K; refC = w.C; trace.push("点开思考+" + h);
        want = w.gap() < NEAR; held = want ? null : w.top; dirty = false;
      }
      else { const k = int(1, 30); for (let j = 0; j < k; j++) frame(); trace.push("过" + k + "帧"); }
      if (rnd() < 0.5) { const k = int(1, 3); for (let j = 0; j < k; j++) frame(); }
      // 点了上面、滑完了：在哪算哪
      if (want === null && !w.f.gliding()) { want = w.gap() < NEAR; held = want ? null : w.top; dirty = false; }
      // 每一步以后：不跟的时候画面不许被挪
      if (want === false && !w.f.gliding() && held !== null && Math.abs(w.top - held) > 0.5) { fail("翻着旧消息的时候画面被挪了"); break; }
      if (![w.top, w.gap()].every(Number.isFinite)) { fail("出了怪数"); break; }
    }
    for (let i = 0; i < 40; i++) frame();
    if (want === null) { want = w.gap() < NEAR; dirty = false; } // 点了上面：停稳以后在哪算哪
    if (w.f.gliding()) fail("滑的那一下一直没完");
    else if (w.rafs.length) fail("停稳了还排着动画帧");
    else if (want && (dirty ? w.gap() > 0.5 : w.gap() >= NEAR)) fail("该跟着的，却没在最底下");
    else if (want && w.f.away()) fail("在最底下，圆钮却出来了");
    else if (want && !w.f.stick()) fail("在最底下，却没记成跟着");
    else if (!want && w.f.stick()) fail("翻着旧消息，却记成跟着（没有圆钮，下一条来了会被拽走）");
    else if (!want && !w.f.away()) fail("翻着旧消息，圆钮却没出来");
    else if (!want && held !== null && Math.abs(w.top - held) > 0.5) fail("翻着旧消息的时候画面被挪了");
  }
  const kinds = Object.keys(bad);
  kinds.forEach((k) => console.log(`  ${bad[k].n} 回：${k}\n    最先碰到的那一回：${bad[k].trace.join("，")}`));
  ok(kinds.length === 0, `乱来 ${RUNS} 趟、${steps} 步（她滚、来话、图片晚到、发话、键盘、面板、点开思考、点圆钮、点上面，带着晚一拍的次序）：规矩一条没破`);
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
