// =====================================================
// 聊天记录怎么滚（卿卿 2026 年 10 月 3 日定的）
// - 跟着最新：她在最底下的时候，新来的东西（他的回话一条条蹦、“正在输入”、面板开合）把画面带到最底下
// - 不拽：她往上翻旧消息的时候，新来的东西不动画面；输入框上面浮出一个圆钮，点了滑回最新
// - 她自己发话、改话、点开键盘、换一段对话、点着横幅回来：一定到底
// - 点上面：滑回最顶
// 这里只管记“她是不是在最底下”和滑的那一下，不碰 React、不碰页面上别的东西。App.jsx 把事情报进来：
//   scrolled()  聊天记录滚了一下（她手指滚的、惯性带的、浏览器自己收的，都报）
//   changed()   聊天记录变高变矮了、那个盒子变高变矮了（新气泡、正在输入、图片出来、键盘、面板……全报）
//   pin()       她自己发话了、改话了、点了重新回答、换了一段对话
//   loose()     她自己点开了里面的什么（思考过程）：接下来变高不是新话来了
//   bottom()    到底（点圆钮是滑过去；键盘弹出来、点着横幅回来是一下到）
//   top()       点上面：滑回最顶
//   touch()     她的手指落在聊天记录上，或者滚轮动了
// el() 交出聊天记录那个会滚的盒子；onAway(真/假) 是告诉外头圆钮该不该出来；
// raf / caf / now 是排动画帧、取消、看钟；still() 是系统开没开“减弱动态效果”；
// halt(盒子) 是叫它把惯性停下（见下面 calm）。
// =====================================================

export const NEAR = 64; // 离最底下不到这么多像素，算在最底下（差不多一个气泡多一点）
export const GLIDE = 380; // 滑回去走多少毫秒
const PIN = 600; // 她发话、换对话以后这么多毫秒里，东西一变就一定到底
const LOOSE = 400; // 她点开“思考过程”以后这么多毫秒里，变高了不跟，照眼下的样子重新量
const MOVING = 200; // 她上一回滚是这么多毫秒之内的事：多半还带着惯性

export function createFollow({ el, onAway, raf, caf, now, still, halt }) {
  let stick = true; // 跟着最新（她没往上翻）
  let away = false; // 圆钮出没出来
  let run = null; // 正在滑的那一下：{ to: "bottom" | "top", id }
  // 上一回认的时候它在哪（自己滚到的、她滚到的，认过就记）。
  // 浏览器报“滚了一下”是晚一拍的：报来的时候位置还在上一回认过的地方，就没有新的事，不用再认；
  // 反过来，东西变了的时候位置已经不在那儿了，就是她动过、那一下还没报来，得先把她那一下认了
  let last = 0;
  // 上一回对账的时候，里面的东西多高、盒子多高。
  // 东西变高了（蹦出一条新的），到“跟到新的底”之间有一小段工夫；这工夫里她的手指、惯性报来一下滚动，
  // 拿新的高度一量就是“离底还远”。所以她滚的那一下，离没离开要照变高之前的那个底来认
  let seen = null;
  let at = -Infinity; // 她上一回滚是什么时候
  let pinUntil = 0;
  let looseUntil = 0;

  // 顶上回弹的时候位置是负的，当成 0；底下回弹的时候算出来离底是负的，照样算在底下
  const topOf = (e) => Math.max(0, e.scrollTop);
  const gap = (e) => e.scrollHeight - e.clientHeight - topOf(e);
  const sync = (e) => {
    seen = { sh: e.scrollHeight, ch: e.clientHeight };
  };
  const mark = (v) => {
    if (v === away) return;
    away = v;
    onAway(v);
  };
  // 照眼下的样子重新量：在不在最底下
  const fresh = () => {
    const e = el();
    if (!e) return;
    sync(e);
    last = e.scrollTop;
    stick = gap(e) < NEAR;
    mark(!stick);
  };
  // 位置变了（她滚的，或者盒子变高了、浏览器自己把位置收回来的）：认一认还在不在底下。
  // 离眼下的底不到 NEAR 算在；照上一回对账时的高度、那时候的盒子算不到 NEAR 也算在
  // （东西刚变高、还没跟上的那一小会儿；键盘刚弹出来、她的手指同时动了一下）。
  // 还有一样：键盘刚收起来（盒子变高了），位置被浏览器收到了“那时候的东西、眼下的盒子”的底上，紧跟着又蹦出一条。
  // 这时候上面两样量出来都离底老远，可她是被浏览器挪过去的，不是自己翻走的。认它要两头都对得上：
  // 她本来是跟着的；位置正好在那个底上（差不到一个像素：浏览器报的高度是凑成整数的）。
  // 不放宽成“离那个底不远就算”：本来跟着、同一帧里自己往上翻了三百来像素的人（拖滚动条、卡了一下），
  // 落的地方也可能离那个底不远，放宽了会把她拽回去。宁可认不出来（圆钮出来，她点一下），也不拽人。
  // 这里只认，不对账：账等 changed() 来对（东西一变它准来）
  const hers = () => {
    const e = el();
    if (!e) return;
    const t = topOf(e);
    let g = e.scrollHeight - e.clientHeight - t;
    if (seen) {
      g = Math.min(g, seen.sh - seen.ch - t);
      if (stick && Math.abs(seen.sh - e.clientHeight - t) < 1) g = 0;
    }
    last = e.scrollTop;
    stick = g < NEAR;
    mark(!stick);
  };
  const stop = () => {
    if (!run) return;
    caf(run.id);
    run = null;
  };
  // 聊天记录还带着惯性的时候，先叫它停下，再去动它。
  // 新一些的 iPhone 上，程序滚它一下并不打断惯性：不先停，滑到了底又被惯性带走
  const calm = (e) => {
    if (halt && now() - at < MOVING) halt(e);
  };
  // 自己滚：滚完把实际落在哪记下来（多写的浏览器自己收回去，所以要读回来），账也对上
  const set = (e, v) => {
    e.scrollTop = v;
    last = e.scrollTop;
    sync(e);
  };
  // 一下到底。firm：先把惯性停掉
  const land = (firm) => {
    const e = el();
    if (!e) return;
    if (firm) calm(e);
    set(e, e.scrollHeight);
  };
  const glide = (to) => {
    const e = el();
    if (!e) return;
    stop();
    calm(e);
    // 往底下滑的时候，“底”现量：滑的工夫里又蹦出来一条，就滑到新的底
    const goal = () => (to === "top" ? 0 : Math.max(0, e.scrollHeight - e.clientHeight));
    const from = topOf(e);
    if (still() || Math.abs(goal() - from) < 2) {
      set(e, goal());
      fresh();
      return;
    }
    const t0 = now();
    const step = () => {
      const p = Math.min(1, (now() - t0) / GLIDE);
      set(e, from + (goal() - from) * (1 - Math.pow(1 - p, 3))); // 先快后慢
      if (p < 1) {
        run.id = raf(step);
        return;
      }
      run = null;
      fresh();
    };
    run = { to, id: raf(step) };
  };

  return {
    stick: () => stick,
    away: () => away,
    gliding: () => (run ? run.to : ""),

    scrolled() {
      const e = el();
      if (!e) return;
      if (run) return; // 自己正滑着：滑到头再认
      if (Math.abs(e.scrollTop - last) < 1) return; // 还在上一回认过的地方：没有新的事
      at = now();
      hers();
    },

    // 她的手指落在聊天记录上（或者滚轮动了）：正滑着的停下，听她的
    touch() {
      if (!run) return;
      stop();
      fresh(); // 停在哪算哪：照眼下的样子量
    },

    changed() {
      const e = el();
      if (!e) return;
      // 正往底下滑：滑的那一下每一帧现量，自己会追到新的底（这里要是也去跟，画面会先跳到底、下一帧又被拉回半路）；
      // 正往顶上滑：不打岔，滑完再量
      if (run) return;
      // 位置不在上一回认过的地方：她动过，那一下还没报来。先照变之前的底把她那一下认了，
      // 不然她刚往上翻、紧跟着来一条新话，会照“还跟着”把她拽回去
      if (Math.abs(e.scrollTop - last) >= 1) hers();
      const t = now();
      if (t < looseUntil) {
        // 她自己点开的：不跟，照眼下的样子重新量（多半成了“不在最底下”，圆钮出来）
        looseUntil = 0;
        fresh();
        return;
      }
      if (t < pinUntil) {
        // 她刚发了话、刚换了对话：不管这工夫里报来过什么，到底
        stick = true;
        land(true);
        mark(false);
        return;
      }
      if (stick) land(false);
      else fresh(); // 没跟着：画面不动，只把“在不在最底下”重新量一遍（东西变矮了、盒子变高了，可能又到底了）
    },

    pin() {
      if (run && run.to === "top") stop();
      pinUntil = now() + PIN;
      looseUntil = 0;
      stick = true;
      mark(false);
    },

    loose() {
      looseUntil = now() + LOOSE;
    },

    // 到底。smooth：滑过去（点圆钮）；不带：一下到（键盘弹出来、点着横幅回来）
    bottom(smooth) {
      stick = true;
      looseUntil = 0;
      if (smooth) {
        glide("bottom");
        return;
      }
      stop();
      land(true);
      mark(false);
    },

    // 点上面：滑回最顶
    top() {
      const e = el();
      if (!e) return;
      stick = false;
      pinUntil = 0;
      // 一屏就放得下的对话，顶就是底，圆钮不用出来
      mark(e.scrollHeight - e.clientHeight >= NEAR);
      glide("top");
    },
  };
}
