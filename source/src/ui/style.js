// 聊天背景跟着主题走（见 theme.js）。青绿那张是卿卿和恩师做的：青纸、一方深青、一群白鸟、云里的山；
// 丁香那张是她画的：月牙、星星、丝带、丁香枝
export const WALL = { paper: "rgb(var(--k-paper))" };

// ---------- 视觉 ----------
export const SERIF =
  "'Songti SC','STSong','Noto Serif SC','Source Han Serif SC',serif";
export const SANS =
  "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif";

// 颜色：跟主题走的都写成 CSS 变量（--k-ink 这些，值在 input.css 里，青绿一套、丁香一套），
// 换主题不用重画。青绿的颜色从沙燕开屏里取：纸是天青，墨是燕子的墨绿；丁香的从小猪开屏里取。
// 金色、红色两个主题共用
export const T = {
  ink: "rgb(var(--k-ink))",
  inkSoft: "rgba(var(--k-soft),0.76)",
  inkFaint: "rgba(var(--k-soft),0.48)",
  dai: "rgb(var(--k-dai))",
  daiGrad: "linear-gradient(140deg,rgb(var(--k-dai-a)) 0%,rgb(var(--k-dai-b)) 100%)",
  rouge:
    "linear-gradient(140deg,rgba(243,186,196,0.66) 0%,rgba(224,150,168,0.58) 100%)",
  rougeSolid: "linear-gradient(140deg,#E6CC8F 0%,#B9914C 100%)",
  rougeInk: "#45262F",
  gold: "#94733A",
  bg: "linear-gradient(168deg,rgb(var(--k-bg1)) 0%,rgb(var(--k-bg2)) 46%,rgb(var(--k-bg3)) 100%)",
  motto: "rgb(var(--k-motto))",
};

export const glass = (a = 0.55, blur = 24) => ({
  backgroundColor: `rgba(255,255,255,${a})`,
  backdropFilter: `blur(${blur}px) saturate(165%)`,
  WebkitBackdropFilter: `blur(${blur}px) saturate(165%)`,
  border: "1px solid rgba(255,255,255,0.7)",
  boxShadow:
    "0 10px 30px rgba(var(--k-shade),0.12), inset 0 1px 0 rgba(255,255,255,0.75)",
});

export const BUBBLE_GLASS = {
  background:
    "linear-gradient(150deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.1) 55%, rgba(255,255,255,0.2) 100%)",
  backdropFilter: "blur(10px) saturate(150%)",
  WebkitBackdropFilter: "blur(10px) saturate(150%)",
  border: "1px solid rgba(255,255,255,0.62)",
  boxShadow:
    "0 6px 20px rgba(var(--k-shade),0.08), inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -1px 1px rgba(255,255,255,0.2)",
  color: "rgb(var(--k-ink))",
};

// 输入框贴底，照官方那样沉到最下面：上半截是玻璃，越往下越淡进 --k-base。
// 这个颜色是聊天背景最底边的颜色，也是网页底色；有的 iOS 在屏幕最底下空出一条系统画的色块（见 gap.js），
// 就是这个颜色，所以输入框底边和那条接在一起，看着像一直铺到屏幕底
export const DOCK_GLASS = {
  background:
    "linear-gradient(to bottom, rgba(var(--k-base),0) calc(100% - 14px), rgb(var(--k-base)) 100%), " +
    "linear-gradient(to bottom, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0.3) 52%, rgba(var(--k-base),0.6) 100%)",
  backdropFilter: "blur(30px) saturate(140%)",
  WebkitBackdropFilter: "blur(30px) saturate(140%)",
  borderTop: "1px solid rgba(255,255,255,0.72)",
  boxShadow: "0 -10px 30px rgba(var(--k-shade),0.1), inset 0 1px 0 rgba(255,255,255,0.7)",
  borderRadius: "26px 26px 0 0",
};

export const chip = {
  ...glass(0.62, 16),
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  color: T.ink,
};
export const chipPrimary = {
  borderRadius: 999,
  padding: "8px 16px",
  fontSize: 13,
  color: "#fff",
  background: T.daiGrad,
  boxShadow: "0 6px 16px rgba(var(--k-dai-shade),0.3)",
};
export const field = {
  width: "100%",
  borderRadius: 16,
  padding: "11px 14px",
  fontSize: 16,
  color: T.ink,
  backgroundColor: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(255,255,255,0.8)",
  outline: "none",
};

export const GLOBAL_CSS = `
@keyframes kfsUp { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes kfsSheet { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
@keyframes kfsPage { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
@keyframes kfsSpin { to { transform: rotate(360deg); } }
@keyframes kfsBreath { 0%,100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.05); opacity: 1; } }
@keyframes kfsDot { 0%,80%,100% { transform: translateY(0); opacity: .35; } 40% { transform: translateY(-3px); opacity: 1; } }
.kfs-in { animation: kfsUp .3s cubic-bezier(.2,.8,.2,1) both; }
.kfs-sheet { animation: kfsSheet .34s cubic-bezier(.2,.8,.2,1) both; }
.kfs-page { animation: kfsPage .3s cubic-bezier(.2,.8,.2,1) both; }
.kfs-breath { animation: kfsBreath 3.2s ease-in-out infinite; }
.kfs-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: rgba(var(--k-soft),.55); animation: kfsDot 1.2s infinite; }
.kfs-scroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.kfs-scroll::-webkit-scrollbar { display: none; }
/* 聊天记录不藏滚动条：手机上用系统自带的那根（滚的时候出来、停了自己淡掉；长按能不能拖，要她的手机说了算）。
   用鼠标的地方照旧藏着（那儿的滚动条是一直杵在边上的那种） */
.kfs-chat-scroll { -webkit-overflow-scrolling: touch; }
@media (hover: hover) and (pointer: fine) {
  .kfs-chat-scroll { scrollbar-width: none; }
  .kfs-chat-scroll::-webkit-scrollbar { display: none; }
}
.kfs-field::placeholder { color: rgba(var(--k-soft),.45); }
.kfs-tap { transition: transform .15s ease; }
.kfs-tap:active { transform: scale(.94); }
button { -webkit-tap-highlight-color: transparent; }
button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid rgba(var(--k-dai),.55); outline-offset: 2px; }
@keyframes kfsSplashIn { from { opacity: 0; transform: scale(1.045); } to { opacity: 1; transform: scale(1); } }
@keyframes kfsGlow { 0%,100% { opacity: .35; transform: scale(.97); } 50% { opacity: .9; transform: scale(1.03); } }
.kfs-splash-img { animation: kfsSplashIn 2.4s cubic-bezier(.2,.8,.2,1) both; }
.kfs-moonglow { animation: kfsGlow 3.4s ease-in-out infinite; }
@keyframes kfsKite { 0%,100% { transform: translateY(0) rotate(-2.5deg); } 50% { transform: translateY(-6px) rotate(2.5deg); } }
@keyframes kfsKiteAway { 0% { transform: translate(0,0) rotate(0) scale(1); opacity: 1; } 100% { transform: translate(26px,-330px) rotate(-10deg) scale(.42); opacity: 0; } }
.kfs-kite { animation: kfsKite 3.4s ease-in-out infinite; transform-origin: 50% 35%; }
.kfs-kite-away { animation: kfsKiteAway .95s cubic-bezier(.45,0,.2,1) forwards; }

@media (prefers-reduced-motion: reduce) { .kfs-in, .kfs-sheet, .kfs-page, .kfs-breath, .kfs-splash-img, .kfs-moonglow, .kfs-kite { animation: none !important; } }
`;
