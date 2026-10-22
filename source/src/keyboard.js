// =====================================================
// 键盘弹出来的时候，让开封府正好铺在键盘上面
// iOS 的键盘不会把网页变矮，只会把整页往上推，推到刚好露出光标那一行为止，
// 输入框底下那排按钮就压在键盘底下了，顶栏也被推出屏幕。
// 这里跟着“可视区”（visualViewport）走：键盘开着时，外壳挪到可视区的顶上、高度等于可视区，
// 输入框整块贴在键盘上面，顶栏留在屏幕最上面，中间的聊天记录变矮。
// 只管输入框、弹出面板和门口这几处（.kfs-composer、.kfs-sheet、data-kfs-kbfit），
// 日记那种整页往下滚的地方还是让 iOS 自己推。
// 外壳的 top 和 height 用的是 --kfs-kb-top、--kfs-kb-h（见 App.jsx 和 Gate.jsx）。
// 顺手量一下这台手机的键盘多高（--kfs-kb-px，记在这台手机上）：表情包面板沉在输入框底下，照键盘那么高，
// 键盘和面板换来换去的时候输入框不跳（见 input.css 的 .kfs-meme-panel）。
// =====================================================

const FIT = ".kfs-composer, .kfs-sheet, [data-kfs-kbfit]";
const KB_KEY = "kfs-kb-px";
const KB_MIN = 150;
const KB_MAX = 900;

const isTextField = (a) =>
  !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(checkbox|radio|file|button|submit|range|color)$/i.test(a.type || "")));

// 焦点到底落在谁身上：落在一个框里（并蒂莲那一页）的时候，开封府这头的 activeElement 是那个框，
// 要再往框里看一层（同一个网址下的框才看得进去，看不进去的回 null）。gap.js 也用它
export function focusInside(a) {
  if (!a || a.tagName !== "IFRAME") return a || null;
  try {
    return (a.contentDocument && a.contentDocument.activeElement) || null;
  } catch (e) {
    return null;
  }
}

function typingHere() {
  const a = document.activeElement;
  if (!a || !a.closest || !a.closest(FIT)) return false;
  // 隔开的框（手帐本子，sandbox）里头看不进去：框里自己报在打字没有，框上记着 data-kfs-typing（见 tongye/TongyeFrame.jsx）
  if (a.tagName === "IFRAME" && a.hasAttribute("data-kfs-typing")) return true;
  // 框身上带 data-kfs-kbfit 的（并蒂莲那一页），看框里的焦点是不是落在输入框上（它底下那个起名框）
  return isTextField(focusInside(a));
}

export function initKeyboardFit() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let raf = 0;
  let open = false;
  let kbPx = 0; // 这一回键盘开着的时候量到的高（键盘本身加上面那条“上一项、下一项、完成”）
  try {
    const v = Number(localStorage.getItem(KB_KEY));
    if (v >= KB_MIN && v <= KB_MAX) root.style.setProperty("--kfs-kb-px", v + "px");
  } catch (e) {}

  const update = () => {
    raf = 0;
    // 不开键盘时整页有多高：撑满时 html 比 innerHeight 高（见 gap.js）
    const base = Math.max(window.innerHeight, Math.round(root.getBoundingClientRect().height));
    const now = typingHere() && (vv.scale || 1) < 1.05 && vv.height < base - 120;
    if (now) {
      root.style.setProperty("--kfs-kb-top", Math.round(vv.offsetTop) + "px");
      root.style.setProperty("--kfs-kb-h", Math.round(vv.height) + "px");
      // 键盘往上升的那一阵这个数一直在变，最后一回的就是它停下来的高
      const kb = Math.round(base - vv.height);
      if (kb >= KB_MIN && kb <= KB_MAX && kb !== kbPx) {
        kbPx = kb;
        root.style.setProperty("--kfs-kb-px", kb + "px");
      }
      if (!open) {
        open = true;
        root.setAttribute("data-kfs-kb", "");
        window.dispatchEvent(new CustomEvent("kfs-kb", { detail: { open: true } }));
      }
    } else if (open) {
      open = false;
      if (kbPx) {
        try {
          localStorage.setItem(KB_KEY, String(kbPx));
        } catch (e) {}
      }
      root.removeAttribute("data-kfs-kb");
      root.style.removeProperty("--kfs-kb-top");
      root.style.removeProperty("--kfs-kb-h");
      window.dispatchEvent(new CustomEvent("kfs-kb", { detail: { open: false } }));
    }
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  window.addEventListener("focusin", schedule);
  window.addEventListener("focusout", () => setTimeout(schedule, 60));
  // 框里报了一声开始打字、不打了（手帐本子，见 typingHere）：再看一遍
  window.addEventListener("kfs-kbcheck", schedule);
}
