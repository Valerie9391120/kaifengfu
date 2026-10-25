// 拼豆作那一页的样子（见 page.js；原来是官方 App 里那一页，一样一样照搬过来的，类名前头都加了 pd-，免得跟开封府的撞上）。
// 颜色跟着开封府的主题走（卿卿 10 月 25 日 23:00 点的“跟着青绿、丁香、黑夜换”）：<html> 上的 data-kfs-theme，见 theme.js。
// 底板的颜色是挑过的：三十九种豆子跟它都差得开（按 CIE Lab 算的色差最近的一种也有十二三），白豆子、灰豆子落在板上看得出来。
//   青绿 #CEE2DA（最近的是雾灰、青瓷）  丁香 #EEE4F8（最近的是泡桐紫）  黑夜 #6C8090（最近的是石墨、鼠灰）
// 空格的棋盘格、钉子照底板深一点浅一点。换了底板颜色要重新量（开发说明“拼豆作”那一节写着怎么量）
export const CSS = `
.kfs-pindou {
  --desk: rgb(222, 230, 216); --paper: rgb(246, 249, 244); --paper-2: rgb(233, 240, 230); --line: rgba(52, 74, 68, 0.15);
  --ink: rgb(36, 51, 47); --mute: rgba(52, 74, 68, 0.68); --accent: rgb(63, 106, 98); --accent-ink: #fff; --accent-soft: rgba(63, 106, 98, 0.14);
  --seal: rgb(184, 70, 60); --danger: rgb(168, 71, 61);
  --board: #CEE2DA; --board-rim: rgba(63, 106, 98, 0.24); --rim-hi: rgba(255, 255, 255, 0.6); --peg: #B4CDC2;
  --check-a: #D5E8E0; --check-b: #C6DCD3; --well: rgb(226, 234, 222);
  --toast-bg: rgb(36, 51, 47); --toast-ink: #fff; --scrim: rgba(20, 32, 28, 0.42); --shadow: 0 14px 28px -16px rgba(28, 44, 38, 0.5);
  --serif: 'Songti SC', 'STSong', 'Noto Serif SC', 'Source Han Serif SC', serif;
  --sans: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif;
  position: absolute; inset: 0; z-index: 60; overflow: hidden;
  background: var(--desk); color: var(--ink); font-family: var(--sans); font-size: 14px; line-height: 1.45;
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none;
}
html[data-kfs-theme="dingxiang"] .kfs-pindou {
  --desk: rgb(241, 232, 244); --paper: rgb(251, 248, 253); --paper-2: rgb(241, 234, 247); --line: rgba(84, 68, 118, 0.15);
  --ink: rgb(48, 38, 70); --mute: rgba(84, 68, 118, 0.68); --accent: rgb(112, 88, 176); --accent-soft: rgba(112, 88, 176, 0.14);
  --board: #EEE4F8; --board-rim: rgba(112, 88, 176, 0.24); --peg: #D9CBEB; --check-a: #F3EBFB; --check-b: #E7DCF3; --well: rgb(236, 228, 243);
  --toast-bg: rgb(48, 38, 70); --scrim: rgba(36, 24, 54, 0.42); --shadow: 0 14px 28px -16px rgba(60, 40, 100, 0.5);
}
html[data-kfs-theme="heiye"] .kfs-pindou {
  --desk: rgb(9, 13, 25); --paper: rgb(20, 27, 45); --paper-2: rgb(28, 37, 60); --line: rgba(226, 235, 248, 0.13);
  --ink: rgb(226, 235, 248); --mute: rgba(226, 235, 248, 0.6); --accent: rgb(143, 171, 220); --accent-ink: rgb(10, 16, 32); --accent-soft: rgba(143, 171, 220, 0.18);
  --seal: rgb(196, 76, 66); --danger: rgb(255, 138, 148);
  --board: #6C8090; --board-rim: rgba(226, 235, 248, 0.16); --rim-hi: rgba(255, 255, 255, 0.1); --peg: #8296A6;
  --check-a: #72869A; --check-b: #657889; --well: rgb(12, 18, 32);
  --toast-bg: rgb(226, 235, 248); --toast-ink: rgb(13, 18, 33); --scrim: rgba(0, 0, 0, 0.55); --shadow: 0 14px 28px -16px rgba(0, 0, 0, 0.8);
  color-scheme: dark;
}
/* 打底的这几条包在 :where() 里（不占分量）：不然 .kfs-pindou button 比 .pd-btn 分量重，按钮的底色全被它抹掉 */
:where(.kfs-pindou) * { box-sizing: border-box; margin: 0; padding: 0; }
:where(.kfs-pindou) button, :where(.kfs-pindou) input, :where(.kfs-pindou) textarea { font: inherit; color: inherit; }
:where(.kfs-pindou) button { background: none; border: 0; cursor: pointer; touch-action: manipulation; }
:where(.kfs-pindou) button:disabled { cursor: default; }
.kfs-pindou :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.kfs-pindou [hidden] { display: none !important; }

/* 一整层不动，里面这一块上下滑；提示条、弹出来的那几张跟它并排摆在这一层上（不跟着滑） */
.pd-scroll { position: absolute; inset: 0; overflow-x: hidden; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.pd-app { max-width: 1080px; margin: 0 auto; padding: calc(env(safe-area-inset-top, 0px) + 10px) 14px calc(26px + env(safe-area-inset-bottom, 0px)); }

/* 顶上：叉、名字、看的样子 */
.pd-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.pd-close { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); color: var(--ink); }
.pd-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; }
.pd-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
.pd-title h1 { font-family: var(--serif); font-size: 21px; font-weight: 700; letter-spacing: 0.14em; line-height: 1; white-space: nowrap; }
.pd-seal { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 3px; background: var(--seal); color: #fff; font: 700 12px/1 var(--serif); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.6); transform: rotate(-7deg); flex: none; }
.pd-seg { display: inline-flex; flex: none; padding: 3px; border-radius: 999px; background: var(--paper-2); box-shadow: inset 0 0 0 1px var(--line); }
.pd-seg button { padding: 6px 10px; border-radius: 999px; font-size: 13px; line-height: 1.2; color: var(--mute); }
.pd-seg button.on { background: var(--paper); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(20, 16, 30, 0.14); }

.pd-layout { display: grid; gap: 14px; }
.pd-bench { width: min(100%, 640px, max(290px, calc(var(--kfs-h, 100vh) - 360px))); margin: 0 auto; display: grid; gap: 10px; }
@media (min-width: 900px) {
  .pd-layout { grid-template-columns: minmax(0, 1fr) 388px; align-items: start; }
  .pd-bench { width: min(100%, 640px, max(320px, calc(var(--kfs-h, 100vh) - 190px))); }
}

/* 板子 */
.pd-board { position: relative; aspect-ratio: 1 / 1; border-radius: 18px; background: var(--board); box-shadow: inset 0 0 0 1px var(--board-rim), inset 0 2px 0 var(--rim-hi), var(--shadow); }
.pd-wrap { position: absolute; inset: 9px; border-radius: 9px; overflow: hidden; touch-action: none; }
.pd-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: crosshair; }
.pd-hint { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); padding: 6px 12px; border-radius: 999px; background: rgba(28, 26, 34, 0.78); color: #fff; font-size: 12px; white-space: nowrap; pointer-events: none; transition: opacity 0.5s; }
.pd-hint.gone { opacity: 0; }
.pd-zchip { position: absolute; right: 8px; bottom: 8px; display: flex; align-items: center; gap: 6px; padding: 3px 3px 3px 10px; border-radius: 999px; background: rgba(28, 26, 34, 0.8); color: #fff; font-size: 12px; font-variant-numeric: tabular-nums; transition: opacity 0.35s; }
.pd-zchip.idle { opacity: 0.4; }
.pd-zchip button { padding: 4px 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.18); color: #fff; font-size: 12px; }

/* 工具 */
.pd-dock { display: grid; grid-template-columns: repeat(4, 1fr) 11px 1fr 11px repeat(2, 1fr); align-items: center; padding: 5px; border-radius: 20px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
.pd-sep { width: 1px; height: 26px; background: var(--line); justify-self: center; }
.pd-tb { display: flex; align-items: center; justify-content: center; height: 44px; border-radius: 14px; color: var(--ink); }
.pd-tb svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.pd-tb.on { background: var(--accent); color: var(--accent-ink); }
.pd-tb.tg.on { background: var(--accent-soft); color: var(--accent); }
.pd-tb:disabled { opacity: 0.3; }
.pd-bico { position: relative; width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0) 45%), var(--c, #EE7A2D); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2), inset -2px -2px 3px rgba(0, 0, 0, 0.18); }
.pd-bico::after { content: ""; position: absolute; inset: 34%; border-radius: 50%; background: var(--paper); box-shadow: inset 1px 1px 1.5px rgba(0, 0, 0, 0.35); }
.pd-tb.on .pd-bico::after { background: var(--accent); }

/* 底下那一块：色板、画板、作品、他的、用量 */
.pd-panel { border-radius: 20px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; }
.pd-tabs { display: grid; grid-template-columns: repeat(5, 1fr); border-bottom: 1px solid var(--line); }
.pd-tabs button { position: relative; padding: 12px 0 10px; font-size: 13.5px; color: var(--mute); white-space: nowrap; }
.pd-tabs button.on { color: var(--ink); font-weight: 600; }
.pd-tabs button.on::after { content: ""; position: absolute; left: 50%; bottom: -1px; width: 22px; height: 2.5px; margin-left: -11px; border-radius: 2px; background: var(--accent); }
.pd-badge:empty { display: none; }
.pd-badge { margin-left: 2px; font-size: 10.5px; font-weight: 400; color: var(--mute); font-variant-numeric: tabular-nums; }
.pd-pane { display: none; padding: 12px; }
.pd-pane.on { display: block; }

.pd-pal { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; }
.pd-cell { position: relative; aspect-ratio: 1 / 1; border-radius: 8px; background: var(--well); box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12); }
.pd-cell .bd { position: absolute; inset: 14%; border-radius: 50%; background: radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 44%), var(--c); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.16), inset -2px -2px 3px rgba(0, 0, 0, 0.16); }
.pd-cell .bd::after { content: ""; position: absolute; inset: 33%; border-radius: 50%; background: var(--well); box-shadow: inset 1px 1px 1.5px rgba(0, 0, 0, 0.3); }
.pd-cell.on { box-shadow: inset 0 0 0 2px var(--accent); }
.pd-cell.add { display: grid; place-items: center; color: var(--mute); font-size: 19px; line-height: 1; overflow: hidden; cursor: pointer; }
.pd-cell.add:focus-within { box-shadow: inset 0 0 0 2px var(--accent); }
.pd-cell.add input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
.pd-palfoot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; min-height: 22px; font-size: 12.5px; color: var(--mute); }
.pd-palfoot b { color: var(--ink); font-weight: 600; }
.pd-link { color: var(--accent); font-size: 12.5px; padding: 2px 0; }

.pd-blk + .pd-blk { margin-top: 16px; }
.pd-blk h3 { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.pd-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pd-chip { min-width: 56px; padding: 7px 10px; border-radius: 10px; background: var(--paper-2); box-shadow: inset 0 0 0 1px var(--line); font-size: 13px; font-variant-numeric: tabular-nums; }
.pd-chip.on { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent); color: var(--accent); font-weight: 600; }
.pd-note { margin-top: 7px; font-size: 12px; color: var(--mute); line-height: 1.55; }
.pd-tpls { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.pd-tpl { display: grid; justify-items: center; gap: 6px; padding: 9px 4px 8px; border-radius: 12px; background: var(--paper-2); box-shadow: inset 0 0 0 1px var(--line); font-size: 12px; }
.pd-tpl canvas { image-rendering: pixelated; }
.pd-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0; font-size: 13px; }
.pd-switch { position: relative; flex: none; width: 44px; height: 26px; border-radius: 999px; background: var(--line); transition: background 0.2s; }
.pd-switch i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); transition: transform 0.2s; }
.pd-switch[aria-checked="true"] { background: var(--accent); }
.pd-switch[aria-checked="true"] i { transform: translateX(18px); }
.pd-zbtns { display: flex; gap: 6px; }
.pd-btn { padding: 9px 14px; border-radius: 12px; background: var(--accent); color: var(--accent-ink); font-weight: 600; font-size: 13.5px; white-space: nowrap; }
.pd-btn.soft { background: var(--paper-2); color: var(--ink); font-weight: 500; box-shadow: inset 0 0 0 1px var(--line); }
.pd-btn:disabled { opacity: 0.4; }
.pd-btn.warn { background: transparent; color: var(--danger); font-weight: 500; box-shadow: inset 0 0 0 1px var(--line); }
.pd-wide { display: block; width: 100%; }

/* 作品 */
.pd-saverow { display: flex; gap: 8px; }
.pd-saverow input { flex: 1; min-width: 0; padding: 9px 12px; border: 0; border-radius: 12px; background: var(--paper-2); box-shadow: inset 0 0 0 1px var(--line); font-size: 16px; outline: none; -webkit-user-select: text; user-select: text; }
.pd-saverow input:focus { box-shadow: inset 0 0 0 1.5px var(--accent); }
.pd-send { margin-top: 8px; }
.pd-btnrow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; }
.pd-btnrow .pd-btn { padding: 9px 4px; font-size: 13px; }
.pd-works { display: grid; gap: 8px; margin-top: 12px; }
.pd-work { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 8px; border-radius: 14px; background: var(--paper-2); }
.pd-work.two { grid-template-columns: 48px minmax(0, 1fr) auto; }
.pd-work canvas { width: 48px; height: 48px; border-radius: 8px; background: var(--board); image-rendering: pixelated; }
.pd-winfo b { display: block; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pd-winfo small { display: block; font-size: 11.5px; color: var(--mute); }
.pd-mini { padding: 6px 10px; border-radius: 10px; font-size: 12.5px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); white-space: nowrap; }
.pd-mini.del { color: var(--mute); }
.pd-mini.del.arm { color: #fff; background: var(--danger); box-shadow: none; }
.pd-empty { padding: 18px 6px; text-align: center; color: var(--mute); font-size: 12.5px; line-height: 1.6; }

/* 他的：桌上那块、挂起来的 */
.pd-his { display: grid; gap: 10px; }
.pd-hisnow { display: grid; grid-template-columns: 96px minmax(0, 1fr); align-items: center; gap: 12px; padding: 10px; border-radius: 14px; background: var(--paper-2); text-align: left; width: 100%; }
.pd-hisnow canvas { width: 96px; height: 96px; border-radius: 10px; background: var(--board); }
.pd-hisnow b { display: block; font-size: 14px; font-weight: 600; }
.pd-hisnow small { display: block; margin-top: 2px; font-size: 12px; color: var(--mute); line-height: 1.5; }
.pd-sub { font-size: 12.5px; color: var(--mute); margin: 4px 2px 0; }

/* 用量 */
.pd-usum { margin-bottom: 10px; font-size: 12.5px; color: var(--mute); }
.pd-ulist { display: grid; gap: 4px; }
.pd-urow { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 6px 8px; border-radius: 10px; text-align: left; background: linear-gradient(90deg, var(--accent-soft) var(--w), transparent var(--w)); }
.pd-ubd { position: relative; width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 44%), var(--c); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.16), inset -2px -2px 3px rgba(0, 0, 0, 0.16); }
.pd-ubd::after { content: ""; position: absolute; inset: 33%; border-radius: 50%; background: var(--paper); box-shadow: inset 1px 1px 1.5px rgba(0, 0, 0, 0.3); }
.pd-un { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pd-uk { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }

.pd-foot { margin-top: 18px; text-align: center; font-size: 11.5px; color: var(--mute); }

/* 提示条（几秒自己收；有的带一颗“撤销”） */
.pd-toast { position: absolute; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); z-index: 70; display: flex; align-items: center; gap: 14px; max-width: calc(100% - 28px); padding: 10px 14px; border-radius: 14px; background: var(--toast-bg); color: var(--toast-ink); font-size: 13px; opacity: 0; pointer-events: none; transform: translate(-50%, 14px); transition: opacity 0.2s, transform 0.2s; }
.pd-toast.show { opacity: 1; pointer-events: auto; transform: translate(-50%, 0); }
.pd-toast button { flex: none; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }

/* 从底下冒出来的那几张：导出图片、作品码、看大图 */
.pd-modal { position: absolute; inset: 0; z-index: 65; display: grid; align-items: end; justify-items: center; background: var(--scrim); }
.pd-sheet { width: min(100%, 520px); max-height: 92%; overflow: auto; padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px)); border-radius: 22px 22px 0 0; background: var(--paper); }
@media (min-width: 600px) { .pd-modal { align-items: center; } .pd-sheet { border-radius: 22px; } }
.pd-sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.pd-sheet-head b { font-size: 16px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pd-sheet .pd-note { margin-top: 0; }
.pd-exwrap { margin-top: 12px; border-radius: 14px; overflow: hidden; background-color: #fff; background-image: linear-gradient(45deg, #E9EBEF 25%, transparent 25%, transparent 75%, #E9EBEF 75%), linear-gradient(45deg, #E9EBEF 25%, transparent 25%, transparent 75%, #E9EBEF 75%); background-size: 16px 16px; background-position: 0 0, 8px 8px; }
.pd-exwrap img { display: block; width: 100%; height: auto; -webkit-touch-callout: default; -webkit-user-select: auto; user-select: auto; }
.pd-exfoot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; font-size: 12.5px; color: var(--mute); }
.pd-code { display: block; width: 100%; min-height: 118px; margin-top: 10px; padding: 10px 12px; border: 0; border-radius: 12px; background: var(--paper-2); box-shadow: inset 0 0 0 1px var(--line); color: var(--ink); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; resize: vertical; outline: none; -webkit-user-select: text; user-select: text; }
.pd-code:focus { box-shadow: inset 0 0 0 1.5px var(--accent); }
.pd-cerr { margin-top: 8px; font-size: 12.5px; color: var(--danger); }
.pd-sheet-foot { margin-top: 12px; }
.pd-big { display: block; margin-top: 4px; border-radius: 16px; overflow: hidden; background: var(--board); }
.pd-big canvas { display: block; width: 100%; height: auto; }
.pd-bigmeta { margin-top: 10px; font-size: 12.5px; color: var(--mute); line-height: 1.55; }

@media (prefers-reduced-motion: reduce) { .pd-toast, .pd-switch, .pd-switch i, .pd-hint, .pd-zchip { transition: none; } }
`;
