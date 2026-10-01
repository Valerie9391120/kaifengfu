// =====================================================
// 键盘弹出来的时候，让开封府正好铺在键盘上面
// iOS 的键盘不会把网页变矮，只会把整页往上推，推到刚好露出光标那一行为止，
// 输入框底下那排按钮就压在键盘底下了，顶栏也被推出屏幕。
// 这里跟着“可视区”（visualViewport）走：键盘开着时，外壳挪到可视区的顶上、高度等于可视区，
// 输入框整块贴在键盘上面，顶栏留在屏幕最上面，中间的聊天记录变矮。
// 只管输入框、弹出面板和门口这几处（.kfs-composer、.kfs-sheet、data-kfs-kbfit），
// 日记那种整页往下滚的地方还是让 iOS 自己推。
// 外壳的 top 和 height 用的是 --kfs-kb-top、--kfs-kb-h（见 App.jsx 和 Gate.jsx）。
// =====================================================

const FIT = ".kfs-composer, .kfs-sheet, [data-kfs-kbfit]";

function typingHere() {
  const a = document.activeElement;
  if (!a || !a.closest || !a.closest(FIT)) return false;
  if (a.tagName === "TEXTAREA") return true;
  return a.tagName === "INPUT" && !/^(checkbox|radio|file|button|submit|range|color)$/i.test(a.type || "");
}

export function initKeyboardFit() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let raf = 0;
  let open = false;

  const update = () => {
    raf = 0;
    // 不开键盘时整页有多高：撑满时 html 比 innerHeight 高（见 gap.js）
    const base = Math.max(window.innerHeight, Math.round(root.getBoundingClientRect().height));
    const now = typingHere() && (vv.scale || 1) < 1.05 && vv.height < base - 120;
    if (now) {
      root.style.setProperty("--kfs-kb-top", Math.round(vv.offsetTop) + "px");
      root.style.setProperty("--kfs-kb-h", Math.round(vv.height) + "px");
      if (!open) {
        open = true;
        root.setAttribute("data-kfs-kb", "");
        window.dispatchEvent(new CustomEvent("kfs-kb", { detail: { open: true } }));
      }
    } else if (open) {
      open = false;
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
}
