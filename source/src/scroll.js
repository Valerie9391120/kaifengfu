// =====================================================
// 聊天记录怎么滚（卿卿 2026 年 10 月 3 日定的）
// - 跟着最新：她在最底下的时候，新来的东西（他的回话一条条蹦、“正在输入”、面板开合）把画面带到最底下
// - 不拽：她往上翻旧消息的时候，新来的东西不动画面；输入框上面浮出一个圆钮，点了滑回最新
// - 她自己发话、点开键盘、换一段对话：一定到底
// - 点上面：滑回最顶
// 这里只管记“她是不是在最底下”和滑的那一下，不碰 React、不碰页面上别的东西。
// el() 交出聊天记录那个会滚的盒子；onAway(真/假) 是告诉外头圆钮该不该出来；
// raf / caf / now 是排动画帧、取消、看钟；still() 是系统开没开“减弱动态效果”。
// =====================================================

export const NEAR = 64; // 离最底下不到这么多像素，算在最底下（差不多一个气泡多一点）
export const GLIDE = 380; // 滑回去走多少毫秒

export function createFollow({ el, onAway, raf, caf, now, still }) {
  let stick = true; // 跟着最新（她没往上翻）
  let away = false; // 圆钮出没出来
  let run = null; // 正在滑的那一下：{ to: "bottom" | "top", id }
  // 自己上一回把它滚到了哪。浏览器报“滚了一下”是晚一拍的：自己刚把它滚到底，紧接着又蹦出来一条长的，
  // 这时候才报来的那一下要是当成她翻的，一量“离底还远”，就不跟了，新来的话全落在屏幕外面。
  // 所以报来的时候位置还是自己放的那个地方，就不算她翻的
  let put = null;

  // 离最底下还有多远。回弹的时候会是负的，照样算在底下
  const gap = (e) => e.scrollHeight - e.clientHeight - e.scrollTop;
  const mark = (v) => {
    if (v === away) return;
    away = v;
    onAway(v);
  };
  // 照眼下的位置重新认：在不在最底下
  const look = () => {
    const e = el();
    if (!e) return;
    stick = gap(e) < NEAR;
    mark(!stick);
  };
  const stop = () => {
    if (!run) return;
    caf(run.id);
    run = null;
  };
  // 自己滚：滚完把实际落在哪记下来（多写的浏览器自己收回去，所以要读回来）
  const set = (e, v) => {
    e.scrollTop = v;
    put = e.scrollTop;
  };
  // 一下到底
  const land = () => {
    const e = el();
    if (e) set(e, e.scrollHeight);
  };
  const glide = (to) => {
    const e = el();
    if (!e) return;
    stop();
    // 往底下滑的时候，“底”现量：滑的工夫里又蹦出来一条，就滑到新的底
    const goal = () => (to === "top" ? 0 : Math.max(0, e.scrollHeight - e.clientHeight));
    const from = e.scrollTop;
    if (still() || Math.abs(goal() - from) < 2) {
      set(e, goal());
      look();
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
      look();
    };
    run = { to, id: raf(step) };
  };

  return {
    stick: () => stick,
    away: () => away,
    gliding: () => (run ? run.to : ""),

    // 聊天记录滚了一下（她手指滚的、惯性带的、浏览器自己收的都报到这儿）。
    // 自己正滑着的那一下不算：滑到头再认
    scrolled() {
      if (run) return;
      const e = el();
      if (!e) return;
      if (put !== null && Math.abs(e.scrollTop - put) < 1) return; // 还在自己放的那个地方：不是她翻的
      put = null;
      look();
    },

    // 她的手指落在聊天记录上（或者滚轮动了）：正滑着的停下，听她的
    touch() {
      if (!run) return;
      stop();
      look();
    },

    // 里面的东西变了（新气泡、正在输入、面板开合、图片加载出来）：跟着的时候贴到底，没跟着就不动
    changed() {
      if (run) return; // 正往底下滑：滑的那一下自己会追到新的底；正往顶上滑：不打岔
      if (stick) land();
    },

    // 她自己发话了、换了一段对话：下一回“东西变了”一定到底
    pin() {
      if (run && run.to === "top") stop();
      stick = true;
      mark(false);
    },

    // 到底。smooth：滑过去（点圆钮）；不带：一下到（键盘弹出来）
    bottom(smooth) {
      stick = true;
      if (smooth) {
        glide("bottom");
        return;
      }
      stop();
      land();
      mark(false);
    },

    // 点上面：滑回最顶
    top() {
      const e = el();
      if (!e) return;
      stick = false;
      // 一屏就放得下的对话，顶就是底，圆钮不用出来
      mark(e.scrollHeight - e.clientHeight >= NEAR);
      glide("top");
    },
  };
}
