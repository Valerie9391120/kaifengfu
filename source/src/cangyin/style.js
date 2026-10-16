// 藏音匣那一页的样子（见 page.js；原型是 10 月 16、17 日给卿卿看的那一页，一样一样照搬过来的）。
// 颜色跟着开封府的主题走：青绿、丁香、黑夜各一套（<html> 上的 data-kfs-theme，见 theme.js）。
// 图（纸的纹理、花、五张残纸）和刻本体的样式表是 build.mjs 照指纹放好的，地址在 page.js 里递进来。
export const CSS = `
.kfs-cangyin {
  --bg: rgb(222, 230, 216); --flower: rgb(63, 106, 98); --flower-amt: 1; --tex-amt: 1;
  --ink: rgb(58, 98, 90); --soft: rgba(52, 74, 68, 0.66); --faint: rgba(52, 74, 68, 0.34);
  --accent: rgb(63, 106, 98); --paper-accent: rgb(63, 106, 98); --inside: rgba(36, 51, 47, 0.045);
  --paper-ink: #3A2A22; --paper-soft: rgba(58, 42, 34, 0.6); --dim: none; --shade: 40, 52, 44;
  --serif: 'Songti SC', 'STSong', 'Noto Serif SC', 'Source Han Serif SC', serif;
  --sans: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif;
  --jinhui: "KFS Jinhui", 'Songti TC', 'Noto Serif CJK TC', serif;
  --safe-t: env(safe-area-inset-top, 0px); --safe-b: env(safe-area-inset-bottom, 0px);
  background: var(--bg); color: var(--ink); font-family: var(--sans);
  overflow: hidden; touch-action: none; overscroll-behavior: none;
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
}
html[data-kfs-theme="dingxiang"] .kfs-cangyin {
  --bg: rgb(241, 232, 244); --flower: rgb(112, 88, 176); --ink: rgb(104, 80, 166);
  --soft: rgba(84, 68, 118, 0.66); --faint: rgba(84, 68, 118, 0.34); --accent: rgb(112, 88, 176);
  --paper-accent: rgb(112, 88, 176); --inside: rgba(48, 38, 70, 0.045); --shade: 78, 56, 128;
}
html[data-kfs-theme="heiye"] .kfs-cangyin {
  --bg: rgb(13, 18, 33); --flower: rgb(172, 192, 230); --flower-amt: 0.8; --tex-amt: 0.6; --ink: rgb(196, 212, 240);
  --soft: rgba(226, 235, 248, 0.6); --faint: rgba(226, 235, 248, 0.3); --accent: rgb(143, 171, 220);
  --paper-accent: rgb(52, 80, 150); --inside: rgba(226, 235, 248, 0.05); --dim: brightness(0.74) saturate(0.85); --shade: 0, 0, 0;
  color-scheme: dark;
}
.kfs-cangyin, .kfs-cangyin * { touch-action: none; }
.kfs-cangyin button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.kfs-cangyin button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px; }
.cy-stage { position: absolute; inset: 0; overflow: hidden; background: var(--bg); isolation: isolate; }
.cy-safe { position: absolute; left: 0; top: 0; width: 1px; height: var(--safe-t); visibility: hidden; pointer-events: none; }
/* 纸的纹理：灰的，柔光叠在纸色上（亮的地方亮一点，暗的地方暗一点，平均不变） */
.cy-tex {
  position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-position: center bottom; background-size: cover; background-repeat: no-repeat;
  mix-blend-mode: soft-light; opacity: var(--tex-amt);
}
/* 花：只拿浓淡当遮罩，颜色用主题的 */
.cy-flower {
  position: absolute; inset: 0; pointer-events: none; z-index: 0; background: var(--flower); opacity: var(--flower-amt);
  -webkit-mask-position: center bottom; mask-position: center bottom;
  -webkit-mask-size: cover; mask-size: cover;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
}
.cy-pages { position: absolute; inset: 0; will-change: transform; z-index: 1; }
.cy-page { position: absolute; left: 0; right: 0; height: 100%; overflow: hidden; }
.cy-p1 { top: 0; }
.cy-p2 { top: 100%; }

/* ---------- 匣子 ---------- */
.cy-box, .cy-boxover { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; transform-origin: 0 0; }
.cy-box svg, .cy-boxover svg { position: absolute; overflow: visible; }
.cy-box path, .cy-boxover path { fill: none; stroke: var(--ink); stroke-width: 1.55; stroke-linecap: round; stroke-linejoin: round; }
/* 匣盖和匣身那道缝单独一层，盖在纸条上面：纸条是从这道缝里抽出来、塞回去的（缝以上的纸条挡在匣盖前面） */
.cy-boxover { z-index: 3; }
.cy-box .cy-inside { stroke: none; fill: var(--inside); }
.cy-boxback { z-index: 1; }
.cy-boxfront { z-index: 3; }
.cy-boxshadow {
  position: absolute; z-index: 0; height: 16px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(var(--shade), 0.2), rgba(var(--shade), 0.06) 60%, transparent);
  opacity: 0;
}
.cy-empty {
  position: absolute; left: 16px; right: 16px; margin: 0; text-align: center; font-size: 12.5px; line-height: 1.8; color: var(--soft);
  opacity: 0; pointer-events: none; padding: 0 12px;
}
.cy-hint { position: absolute; left: 50%; bottom: calc(18px + var(--safe-b)); width: 28px; height: 16px; margin-left: -14px; opacity: 0; pointer-events: none; }
.cy-hint path { fill: none; stroke: var(--faint); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }

/* ---------- 抽出来的那一张：锦灰堆残纸 ---------- */
.cy-strip {
  position: absolute; left: 0; top: 0; box-sizing: border-box; color: var(--paper-ink);
  padding: 19px 25px; transform-origin: 50% 50%; will-change: transform; filter: var(--dim);
  z-index: 4; display: none;
}
/* 纸：残纸图按九宫格（四边 19 / 25 像素不拉伸，中间拉开）画在纸条底下一张 canvas 上。
   不用 border-image：iPhone 三倍屏、黑夜主题加了滤镜的时候，九块之间会露出一圈细缝 */
.cy-strip > canvas.cy-paper { position: absolute; left: 0; top: 0; z-index: -1; pointer-events: none; }
.cy-clip { position: absolute; left: 0; top: 0; width: 100%; overflow: hidden; z-index: 2; pointer-events: none; }
.cy-clip .cy-strip { z-index: 0; }
.cy-content { position: relative; display: flex; flex-direction: column; gap: 0; padding: 4px 8px 2px 6px; opacity: 0; }
/* 左边播放键、右边字，右下角年月日（卿卿 10 月 16 日）；不放进度那根线。字用刻本体 */
.cy-row { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.cy-play {
  flex: none; width: 30px; height: 30px; margin-top: 1px; border-radius: 50%; display: grid; place-items: center;
  border: 1.2px solid var(--paper-accent) !important; color: var(--paper-accent) !important;
}
.cy-play svg { width: 12px; height: 12px; display: block; }
.cy-play svg path { fill: currentColor; }
.cy-words {
  flex: 1; min-width: 0; padding-top: 1px; font-family: var(--jinhui); font-size: 17.5px; line-height: 1.8;
  letter-spacing: 0.08em; color: var(--paper-ink); overflow-wrap: anywhere;
}
.cy-words.cy-clamp { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.cy-date { align-self: flex-end; margin-top: 2px; font-family: var(--jinhui); font-size: 12.5px; letter-spacing: 0.16em; color: var(--paper-soft); }

/* ---------- 往上划：一根线串起来的全部（卿卿 10 月 16 日挑的） ---------- */
.cy-listwrap {
  position: absolute; left: 0; right: 0; top: 0; height: 64%; overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, transparent calc(24px + var(--safe-t)), #000 calc(62px + var(--safe-t)), #000 calc(100% - 56px), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, transparent calc(24px + var(--safe-t)), #000 calc(62px + var(--safe-t)), #000 calc(100% - 56px), transparent 100%);
}
.cy-deck { position: absolute; left: 0; top: 0; width: 100%; box-sizing: border-box; padding: calc(56px + var(--safe-t)) 0 56px; }
.cy-inner { position: relative; max-width: 500px; margin: 0 auto; --padL: clamp(30px, 9vw, 40px); --padR: 30px; --ln: var(--faint); }
.cy-vrow { position: relative; display: flex; align-items: flex-start; gap: 14px; padding: 8px var(--padR) 8px var(--padL); }
.cy-ring { flex: none; width: 44px; height: 44px; padding: 5px !important; margin: 0 -5px; box-sizing: border-box; color: var(--ink) !important; border-radius: 50%; }
.cy-ring svg { display: block; width: 34px; height: 34px; overflow: visible; }
.cy-track { fill: none; stroke: currentColor; stroke-width: 1; opacity: 0.6; transition: opacity 0.3s; }
.cy-prog { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 17px 17px; }
.cy-tri { fill: none; stroke: currentColor; stroke-width: 1.1; stroke-linejoin: round; transition: opacity 0.2s; }
.cy-bars { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; opacity: 0; transition: opacity 0.2s; }
.cy-vrow.cy-on .cy-tri { opacity: 0; }
.cy-vrow.cy-on .cy-bars { opacity: 1; }
.cy-vrow.cy-on .cy-track { opacity: 0.28; }
.cy-body { flex: 1; min-width: 0; outline: none; }
.cy-body:focus-visible { outline: 1px solid var(--faint); outline-offset: 4px; border-radius: 4px; }
.cy-q { font-family: var(--serif); font-size: 15.5px; line-height: 1.75; color: var(--ink); letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; }
.cy-vrow.cy-open .cy-q, .cy-vrow.cy-wrap .cy-q { white-space: normal; overflow-wrap: anywhere; }
.cy-meta { display: flex; align-items: baseline; gap: 1.6em; font-size: 11.5px; line-height: 18px; color: var(--soft); letter-spacing: 0.08em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cy-out { margin: -6px 0 -6px auto !important; padding: 6px 0 6px 16px !important; font-size: 11.5px; letter-spacing: 0.1em; color: var(--soft) !important; opacity: 0; transition: opacity 0.25s; pointer-events: none; }
.cy-vrow.cy-open .cy-out { opacity: 0.85; pointer-events: auto; }
/* 线：每个圈底下一段接到下一个圈上头；碰到月份就穿过月份那个小圈 */
.cy-deck .cy-vrow::after { content: ""; position: absolute; left: calc(var(--padL) + 16.5px); width: 1px; top: 52px; bottom: -8px; background: var(--ln); }
.cy-deck .cy-vrow:last-child::after { display: none; }
.cy-deck .cy-vrow:has(+ .cy-mon)::after { bottom: 0; }
.cy-deck .cy-mon + .cy-vrow::before { content: ""; position: absolute; left: calc(var(--padL) + 16.5px); width: 1px; top: 0; height: 8px; background: var(--ln); }
.cy-mon {
  position: relative; height: 42px; display: flex; align-items: center; overflow: hidden;
  padding-left: calc(var(--padL) + 48px); font-family: var(--serif); font-size: 12.5px; letter-spacing: 0.32em; color: var(--soft);
}
.cy-mon::before { content: ""; position: absolute; left: calc(var(--padL) + 16.5px); width: 1px; top: 0; bottom: 0; background: var(--ln); }
.cy-mon:first-child::before { top: 50%; }
.cy-mon::after {
  content: ""; position: absolute; left: calc(var(--padL) + 13px); top: 50%; width: 6px; height: 6px; margin-top: -4px;
  border-radius: 50%; border: 1px solid var(--soft); background: var(--bg);
}
.cy-deckempty { position: absolute; left: 0; right: 0; top: 38%; margin: 0; text-align: center; font-family: var(--serif); font-size: 13px; letter-spacing: 0.2em; color: var(--soft); display: none; }
.cy-pull { position: absolute; top: calc(22px + var(--safe-t)); left: 50%; width: 30px; height: 4px; margin-left: -15px; border-radius: 4px; background: var(--faint); opacity: 0.7; z-index: 2; }

/* ---------- 浮在上面的：左上角很淡的返回（卿卿 10 月 16 日定的） ---------- */
.cy-ui { position: absolute; z-index: 20; }
.cy-back { left: max(10px, env(safe-area-inset-left, 0px)); top: calc(8px + var(--safe-t)); width: 40px; height: 40px; display: grid; place-items: center; opacity: 0.38; }
.cy-back svg { width: 18px; height: 18px; }
.cy-back path { fill: none; stroke: var(--ink); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
`;

export const TEMPLATE = `
<div class="cy-stage">
  <div class="cy-safe"></div>
  <div class="cy-tex"></div>
  <div class="cy-flower"></div>
  <div class="cy-pages">
    <section class="cy-page cy-p1" aria-label="随机抽一条">
      <div class="cy-box">
        <div class="cy-boxshadow"></div>
        <svg class="cy-boxback" aria-hidden="true"></svg>
        <svg class="cy-boxfront" aria-hidden="true"></svg>
      </div>
      <div class="cy-clip"></div>
      <div class="cy-boxover"><svg class="cy-boxseam" aria-hidden="true"></svg></div>
      <div class="cy-strip" role="group" aria-label="抽出来的语音纸条">
        <div class="cy-content">
          <div class="cy-row">
            <button class="cy-play" aria-label="播放"></button>
            <div class="cy-words cy-clamp"></div>
          </div>
          <span class="cy-date"></span>
        </div>
      </div>
      <p class="cy-empty">匣子还空着。聊天里长按他的语音条，点“存入藏音匣”。</p>
      <svg class="cy-hint" viewBox="0 0 28 16" aria-hidden="true"><path d="M7 11 L14 5.5 L21 11"/></svg>
    </section>
    <section class="cy-page cy-p2" aria-label="藏音匣里全部的语音">
      <div class="cy-pull"></div>
      <div class="cy-listwrap"><div class="cy-deck"></div></div>
      <p class="cy-deckempty">这里还空着。</p>
    </section>
  </div>
  <button class="cy-ui cy-back" aria-label="退出藏音匣"><svg viewBox="0 0 18 18"><path d="M11.5 3.5 L6 9 L11.5 14.5"/></svg></button>
</div>
`;
