// =====================================================
// 手帐的样子：版式（东西摆在哪）、风格（纸和墨）、几样小画（天气、标题底下那一笔、印章、胶带）。
// 都是自己画的：纸的纹理是浏览器现算的噪点（SVG 的 feTurbulence），没用别人的图。
// 尺寸都照纸的宽算（cqw：外头 .jz-wrap 是量宽的那一层），手机多宽纸就多宽，字和图跟着一起缩放。
// 版式在 sheet.js 的 blocksOf 里排成一块一块，这里只管每一块在各版式下长什么样；风格只换一套颜色、字和几样装饰。
// =====================================================

// 纸的纹理：一块噪点，透明度照风格给
const noise = (alpha, freq = 0.85, oct = 3) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`
  )}")`;
// 宣纸的纤维：拉长了的噪点
const fiber = (alpha) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.32' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.28 0 0 0 0 0.18 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`
  )}")`;

const SERIF = "'Songti SC','STSong','Noto Serif SC','Source Han Serif SC',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif";
const MONO = "'SF Mono','Menlo','Consolas','Courier New',monospace";
const NUM = "'Didot','Bodoni 72','Bodoni MT','Songti SC',serif";
const HAND = "'Kaiti SC','STKaiti','KaiTi','Songti SC',serif";

// 一套风格：颜色、字、装饰（tape 是贴在照片、原话卡上的那一条胶带，空的就不贴）
const STYLE_VARS = {
  inkpaper: {
    paper: "#f6f3ec", tex: noise(0.05), ink: "#26302e", ink2: "#3f6a62", soft: "rgba(38,48,46,0.56)", accent: "#3f6a62",
    rule: "rgba(38,48,46,0.2)", ruleStrong: "rgba(38,48,46,0.78)", card: "#fbf9f4", cardShadow: "0 1px 0 rgba(0,0,0,0.03), 0 10px 22px -16px rgba(38,48,46,0.45)",
    frame: "#ffffff", framePad: "1.8cqw", photoRadius: "0.6cqw", photoShadow: "0 8px 20px -14px rgba(38,48,46,0.55)", pen: "#b5452f",
    title: SERIF, body: SERIF, num: NUM, mono: MONO, hand: HAND, receipt: "#fffdf8", tape: "",
  },
  xuan: {
    paper: "#f2e9d6", tex: `${fiber(0.22)}, ${noise(0.07, 0.6)}`, ink: "#1d1913", ink2: "#4a3b2a", soft: "rgba(29,25,19,0.55)", accent: "#a3312a",
    rule: "rgba(29,25,19,0.18)", ruleStrong: "rgba(29,25,19,0.7)", card: "rgba(255,252,243,0.55)", cardShadow: "inset 0 0 0 1px rgba(29,25,19,0.16)",
    frame: "transparent", framePad: "0", photoRadius: "0", photoShadow: "0 0 0 1px rgba(29,25,19,0.35)", pen: "#a3312a",
    title: SERIF, body: SERIF, num: SERIF, mono: SERIF, hand: HAND, receipt: "rgba(255,252,243,0.6)", tape: "",
  },
  kraft: {
    paper: "#c7a479", tex: `${noise(0.16, 0.9, 4)}`, ink: "#33241a", ink2: "#5a3d24", soft: "rgba(51,36,26,0.62)", accent: "#fbf4e6", accentText: "#7a3a1c",
    rule: "rgba(51,36,26,0.25)", ruleStrong: "rgba(51,36,26,0.7)", card: "#f6ecdb", cardShadow: "0 8px 18px -12px rgba(51,36,26,0.6)",
    frame: "#f8f1e4", framePad: "1.8cqw", photoRadius: "0", photoShadow: "0 10px 18px -12px rgba(51,36,26,0.7)", pen: "#8c2b1f",
    title: SANS, body: SANS, num: SANS, mono: MONO, hand: HAND, receipt: "#fbf6ec", tape: "rgba(255,255,255,0.62)",
  },
  film: {
    paper: "#ebe4d6", tex: noise(0.11, 1.1, 2), ink: "#29241f", ink2: "#6b4a32", soft: "rgba(41,36,31,0.56)", accent: "#b0532e",
    rule: "rgba(41,36,31,0.2)", ruleStrong: "rgba(41,36,31,0.7)", card: "#f4efe5", cardShadow: "0 10px 20px -16px rgba(41,36,31,0.6)",
    frame: "#1b1a18", framePad: "1.6cqw 1.6cqw 5cqw", photoRadius: "0", photoShadow: "0 10px 22px -14px rgba(0,0,0,0.7)", pen: "#b0532e",
    title: SERIF, body: SERIF, num: MONO, mono: MONO, hand: HAND, receipt: "#fbf8f1", tape: "",
  },
  night: {
    receiptInk: "#2b2620", receiptInk2: "#6e5226", receiptSoft: "rgba(43,38,32,0.6)",
    paper: "#111a2c", tex: `${noise(0.08, 0.9)}, linear-gradient(170deg, #16213a 0%, #0d1424 100%)`, ink: "#ece6d8", ink2: "#d6b56e", soft: "rgba(236,230,216,0.58)", accent: "#d6b56e",
    rule: "rgba(236,230,216,0.18)", ruleStrong: "rgba(214,181,110,0.7)", card: "rgba(255,255,255,0.06)", cardShadow: "inset 0 0 0 1px rgba(214,181,110,0.25)",
    frame: "#ece6d8", framePad: "1.6cqw", photoRadius: "0.6cqw", photoShadow: "0 12px 26px -14px rgba(0,0,0,0.9)", pen: "#f2917c",
    title: SERIF, body: SERIF, num: NUM, mono: MONO, hand: HAND, receipt: "#f4efe3", tape: "",
  },
  washi: {
    paper: "#f7f0f5", tex: `${noise(0.04)}, radial-gradient(rgba(142,107,191,0.10) 0.9px, transparent 1.2px)`, texSize: "180px 180px, 5.2cqw 5.2cqw",
    ink: "#3b2e44", ink2: "#7a5aa8", soft: "rgba(59,46,68,0.56)", accent: "#8e6bbf",
    rule: "rgba(59,46,68,0.18)", ruleStrong: "rgba(142,107,191,0.7)", card: "#ffffff", cardShadow: "0 10px 22px -16px rgba(91,63,130,0.5)",
    frame: "#ffffff", framePad: "1.6cqw", photoRadius: "0.6cqw", photoShadow: "0 10px 22px -16px rgba(91,63,130,0.6)", pen: "#c2577a",
    title: SERIF, body: SERIF, num: NUM, mono: MONO, hand: HAND, receipt: "#ffffff",
    tape: "repeating-linear-gradient(-45deg, rgba(196,170,226,0.85) 0 1.4cqw, rgba(236,222,246,0.85) 1.4cqw 2.8cqw)",
  },
  newsprint: {
    paper: "#eeebe3", tex: noise(0.09, 1.2, 2), ink: "#151515", ink2: "#151515", soft: "rgba(21,21,21,0.58)", accent: "#151515",
    rule: "rgba(21,21,21,0.3)", ruleStrong: "#151515", card: "transparent", cardShadow: "inset 0 0 0 1px rgba(21,21,21,0.6)",
    frame: "transparent", framePad: "0", photoRadius: "0", photoShadow: "none", pen: "#b0291f",
    title: SERIF, body: SERIF, num: SERIF, mono: SERIF, hand: HAND, receipt: "transparent", tape: "",
  },
  chalk: {
    paper: "#24352c", tex: `${noise(0.14, 0.7, 3)}, radial-gradient(circle at 30% 20%, rgba(255,255,255,0.05), transparent 60%)`, ink: "#eef0ea", ink2: "#f2d36b", soft: "rgba(238,240,234,0.62)", accent: "#f2d36b",
    rule: "rgba(238,240,234,0.32)", ruleStrong: "rgba(238,240,234,0.75)", card: "transparent", cardShadow: "none",
    frame: "transparent", framePad: "1.4cqw", photoRadius: "0.4cqw", photoShadow: "none", pen: "#f4a6a0",
    title: HAND, body: HAND, num: HAND, mono: MONO, hand: HAND, receipt: "transparent", tape: "",
  },
};

const varsOf = (k) => {
  const v = STYLE_VARS[k];
  return `.jz-sheet[data-style="${k}"]{--jz-paper:${v.paper};--jz-tex:${v.tex};--jz-tex-size:${v.texSize || "auto"};--jz-ink:${v.ink};--jz-ink2:${v.ink2};--jz-soft:${v.soft};--jz-accent:${v.accent};--jz-accent-text:${v.accentText || v.accent};--jz-receipt-ink:${v.receiptInk || v.ink};--jz-receipt-ink2:${v.receiptInk2 || v.ink2};--jz-receipt-soft:${v.receiptSoft || v.soft};--jz-rule:${v.rule};--jz-rule-strong:${v.ruleStrong};--jz-card:${v.card};--jz-card-shadow:${v.cardShadow};--jz-frame:${v.frame};--jz-frame-pad:${v.framePad};--jz-photo-radius:${v.photoRadius};--jz-photo-shadow:${v.photoShadow};--jz-pen:${v.pen};--jz-title-font:${v.title};--jz-body-font:${v.body};--jz-num-font:${v.num};--jz-mono-font:${v.mono};--jz-hand-font:${v.hand};--jz-receipt:${v.receipt};--jz-tape:${v.tape || "none"}}`;
};

export const JZ_CSS = `
.jz-wrap{container-type:inline-size;width:100%}
.jz-sheet{position:relative;width:100%;box-sizing:border-box;padding:7.5cqw 6.5cqw 10cqw;background-color:var(--jz-paper);background-image:var(--jz-tex);background-size:var(--jz-tex-size);color:var(--jz-ink);font-family:var(--jz-body-font);border-radius:1.4cqw;box-shadow:0 1px 2px rgba(0,0,0,0.06),0 18px 40px -26px rgba(0,0,0,0.45);overflow:hidden;-webkit-user-select:none;user-select:none}
.jz-sheet *{box-sizing:border-box}
.jz-block{position:relative;margin-top:6cqw}
.jz-block:first-child,.jz-sheet-stitch+.jz-block{margin-top:0}
.jz-row{display:grid;grid-template-columns:1fr 1fr;gap:4.2cqw;align-items:start}
.jz-tap{cursor:pointer}
.jz-sheet[data-editing="1"] .jz-tap{outline:1px dashed transparent;outline-offset:1.2cqw;transition:outline-color .2s}
.jz-sheet[data-editing="1"] .jz-tap:active{outline-color:var(--jz-rule-strong)}

/* 日子 */
.jz-strip{display:flex;justify-content:space-between;gap:3cqw;font:500 2.8cqw/1.4 var(--jz-mono-font);letter-spacing:.2em;color:var(--jz-soft);padding-bottom:2.6cqw;border-bottom:1px solid var(--jz-rule-strong);text-transform:uppercase}
.jz-date{display:flex;align-items:flex-end;gap:3cqw;margin-top:5cqw}
.jz-date b{font:400 20cqw/.84 var(--jz-num-font);letter-spacing:-.02em;color:var(--jz-ink)}
.jz-date span{font:500 3.1cqw/1.55 var(--jz-mono-font);letter-spacing:.24em;color:var(--jz-soft);padding-bottom:1cqw}

/* 标题：底下一笔 */
.jz-title{position:relative;display:inline-block;margin:0;font:700 7.4cqw/1.3 var(--jz-title-font);letter-spacing:.05em;color:var(--jz-ink)}
.jz-title .jz-ul{position:absolute;left:-3%;bottom:-2.2cqw;width:106%;height:3cqw;color:var(--jz-accent);overflow:visible}

/* 天气 */
.jz-wx{display:flex;align-items:center;gap:3.6cqw;padding:3.2cqw 0;border-top:1px dashed var(--jz-rule);border-bottom:1px dashed var(--jz-rule);font:400 3.7cqw/1.5 var(--jz-mono-font)}
.jz-wx svg{width:9cqw;height:9cqw;flex:none;color:var(--jz-ink)}
.jz-wx small{display:block;font-size:3cqw;color:var(--jz-soft)}

/* 心情 */
.jz-mood{display:flex;flex-direction:column;gap:1.8cqw;font-size:3.6cqw;line-height:1.5}
.jz-mood .who{display:inline-block;min-width:9cqw;font:500 2.9cqw/1 var(--jz-mono-font);letter-spacing:.2em;color:var(--jz-soft)}
.jz-mood .m{margin-right:2.6cqw;white-space:nowrap}

/* 照片 */
.jz-photo{position:relative;margin:0}
.jz-frame{position:relative;display:block;background:var(--jz-frame);padding:var(--jz-frame-pad);box-shadow:var(--jz-photo-shadow)}
.jz-frame img{display:block;width:100%;height:auto;max-height:120cqw;object-fit:cover;border-radius:var(--jz-photo-radius)}
.jz-frame::before{content:"";position:absolute;z-index:2;top:-2.6cqw;left:50%;width:22cqw;height:5.4cqw;transform:translateX(-50%) rotate(-3deg);background:var(--jz-tape);opacity:.9;pointer-events:none}
.jz-sheet:not([data-style="kraft"]):not([data-style="washi"]) .jz-frame::before{display:none}
.jz-cap{margin-top:2.6cqw;text-align:center;font:400 3.8cqw/1.5 var(--jz-hand-font);color:var(--jz-soft)}
.jz-pair{display:grid;grid-template-columns:1fr 1fr;gap:3.6cqw}
.jz-pair .jz-frame img{aspect-ratio:3/4;height:auto}
.jz-more{display:grid;grid-template-columns:repeat(3,1fr);gap:2.6cqw}
.jz-more .jz-frame img{aspect-ratio:1;height:auto}
.jz-tag{display:block;margin-top:1.6cqw;font:400 2.7cqw/1.3 var(--jz-mono-font);letter-spacing:.12em;color:var(--jz-soft);text-align:center}

/* 原话卡 */
.jz-quote{position:relative;background:var(--jz-card);box-shadow:var(--jz-card-shadow);padding:4.4cqw 4.8cqw;border-radius:1cqw}
.jz-quote::before{content:"";position:absolute;top:-2.4cqw;left:12%;width:18cqw;height:4.8cqw;transform:rotate(-4deg);background:var(--jz-tape);opacity:.9}
.jz-sheet:not([data-style="kraft"]):not([data-style="washi"]) .jz-quote::before{display:none}
/* 点缀色分两样：--jz-accent 是纸上画的（标题底下那一笔、手绘贴纸），--jz-accent-text 是写字的（小标题、原话卡里“光义”那一行）。
   牛皮纸的点缀是米白，卡也是米白：卡上（原话卡、格子便当的每一格）画的也改用写字的那一色，不然看不见。
   饭的小票是另一张纸（夜航那种是浅的），上面的字照小票的颜色（格子便当里小票的底拿掉了，照格子的）。
   字看不看得清有 tests/e2e_jz_ink.py 挨个量。 */
.jz-quote,.jz-sheet[data-layout="bento"] .jz-cell{--jz-accent:var(--jz-accent-text)}
.jz-sheet:not([data-layout="bento"]) .jz-food{--jz-ink:var(--jz-receipt-ink);--jz-ink2:var(--jz-receipt-ink2);--jz-soft:var(--jz-receipt-soft)}
.jz-qh{display:flex;justify-content:space-between;font:400 2.8cqw/1.4 var(--jz-mono-font);letter-spacing:.14em;color:var(--jz-soft);padding-bottom:2.4cqw;border-bottom:1px dashed var(--jz-rule)}
.jz-q{margin-top:2.8cqw;font-size:3.9cqw;line-height:1.6;color:var(--jz-ink);word-break:break-word}
.jz-q .w{display:inline-block;margin-right:1.8cqw;font:500 2.7cqw/1 var(--jz-mono-font);letter-spacing:.14em;color:var(--jz-soft)}
.jz-q.him .w{color:var(--jz-accent-text)}
.jz-qmore{display:block;width:100%;margin-top:3cqw;padding-top:2.4cqw;border-top:1px dashed var(--jz-rule);font:400 3.2cqw/1 var(--jz-body-font);color:var(--jz-soft);background:none;border-left:0;border-right:0;border-bottom:0;text-align:center}

/* 日记、正文 */
.jz-diary h4,.jz-label{margin:0 0 2.4cqw;font:500 2.9cqw/1.4 var(--jz-mono-font);letter-spacing:.24em;color:var(--jz-accent-text)}
.jz-diary p,.jz-body p{margin:0;font:400 4.1cqw/1.9 var(--jz-body-font);white-space:pre-wrap;word-break:break-word;color:var(--jz-ink)}
.jz-diary.him p{color:var(--jz-ink2)}
.jz-body p{font-size:4.2cqw}

/* 红笔 */
.jz-pen{position:relative;color:var(--jz-pen);font:400 4.8cqw/1.6 var(--jz-hand-font)}
.jz-pen mark{background:none;color:inherit;text-decoration:underline;text-decoration-thickness:.35cqw;text-underline-offset:1.4cqw;text-decoration-color:var(--jz-pen)}
.jz-pen .margin{display:block;margin-top:2.4cqw;text-align:right;transform:rotate(-4deg);font-size:4.4cqw}

/* 饭：一张小票 */
.jz-food{position:relative;background:var(--jz-receipt);padding:4.4cqw 4.4cqw 5cqw;box-shadow:var(--jz-card-shadow);color:var(--jz-ink)}
.jz-food::after{content:"";position:absolute;left:0;right:0;bottom:-1.6cqw;height:1.6cqw;background:radial-gradient(circle at 1.6cqw 0,transparent 1.6cqw,var(--jz-receipt) 1.65cqw) 0 0/3.2cqw 1.6cqw repeat-x}
.jz-food .ft{display:flex;justify-content:space-between;font:500 2.8cqw/1.4 var(--jz-mono-font);letter-spacing:.16em;color:var(--jz-soft);margin-bottom:3cqw}
.jz-food img{display:block;width:100%;height:auto;max-height:80cqw;object-fit:cover;border-radius:var(--jz-photo-radius)}
.jz-food .fn{margin-top:2.6cqw;font:400 3.6cqw/1.5 var(--jz-hand-font);color:var(--jz-ink2);text-align:center}
.jz-sheet[data-style="newsprint"] .jz-food,.jz-sheet[data-style="chalk"] .jz-food{border:1px dashed var(--jz-rule-strong)}
.jz-sheet[data-style="newsprint"] .jz-food::after,.jz-sheet[data-style="chalk"] .jz-food::after{display:none}

/* 批注的小记号（点了看批注） */
.jz-nb{position:absolute;z-index:6;top:-2.4cqw;right:-2cqw;display:flex;align-items:center;gap:.6cqw;padding:.8cqw 1.8cqw;border-radius:99px;background:#f7e08a;color:#5a4710;font:600 2.6cqw/1 var(--jz-mono-font);box-shadow:0 4px 10px -6px rgba(0,0,0,.5);transform:rotate(4deg)}
.jz-nb.him{background:#cfe5dc;color:#234a3f}

/* 贴纸、她自己写的字 */
.jz-stk{position:absolute;z-index:5;width:15cqw;transform-origin:50% 50%;touch-action:none}
.jz-stk svg,.jz-stk img{display:block;width:100%;height:auto;pointer-events:none}
.jz-stk.kao,.jz-stk.txt{width:auto;white-space:nowrap;font:400 4.6cqw/1.3 var(--jz-hand-font);color:var(--jz-ink)}
.jz-stk.txt{color:var(--jz-pen)}
.jz-stk.sel{outline:1px dashed var(--jz-rule-strong);outline-offset:1.2cqw}
.jz-stk .tape{width:30cqw;height:6.4cqw;opacity:.88}
.kfs-jz-sticker .tape{width:100%;height:16px;border-radius:2px;opacity:.9}

/* ========== 版式 ========== */
/* 拍立得墙：照片白边加厚、歪着贴 */
.jz-sheet[data-layout="polaroid"] .jz-frame{--jz-frame:#ffffff;--jz-frame-pad:2.4cqw 2.4cqw 8cqw;box-shadow:0 12px 24px -16px rgba(0,0,0,.6)}
.jz-sheet[data-layout="polaroid"][data-style="film"] .jz-frame{--jz-frame:#1b1a18}
.jz-sheet[data-layout="polaroid"] .jz-hero{width:88%;transform:rotate(-2.4deg);margin-left:2%}
.jz-sheet[data-layout="polaroid"] .jz-hero .jz-cap{position:absolute;left:0;right:0;bottom:2.2cqw;margin:0;color:#6b6257}
.jz-sheet[data-layout="polaroid"][data-style="film"] .jz-hero .jz-cap{color:#d8d0c2}
.jz-sheet[data-layout="polaroid"] .jz-pair .jz-photo:nth-child(1){transform:rotate(-3deg)}
.jz-sheet[data-layout="polaroid"] .jz-pair .jz-photo:nth-child(2){transform:rotate(2.6deg) translateY(4cqw)}
.jz-sheet[data-layout="polaroid"] .jz-more .jz-photo:nth-child(odd){transform:rotate(-2deg)}
.jz-sheet[data-layout="polaroid"] .jz-more .jz-photo:nth-child(even){transform:rotate(2.4deg) translateY(2cqw)}
.jz-sheet[data-layout="polaroid"] .jz-quote{transform:rotate(1.4deg);margin-left:6%;margin-right:-1%}
.jz-sheet[data-layout="polaroid"] .jz-food{transform:rotate(-1.6deg)}
.jz-sheet[data-layout="polaroid"] .jz-more{grid-template-columns:repeat(2,1fr);gap:5cqw 4cqw}

/* 大图封面：主照片铺到纸边，日子和标题压在照片上 */
.jz-cover{position:relative;margin:-7.5cqw -6.5cqw 0;min-height:60cqw;overflow:hidden;background:#222}
.jz-cover img{display:block;width:100%;height:auto;max-height:140cqw;object-fit:cover}
.jz-cover .veil{position:absolute;inset:auto 0 0 0;height:65%;background:linear-gradient(to bottom,transparent,rgba(0,0,0,.62))}
.jz-cover .over{position:absolute;left:6.5cqw;right:6.5cqw;bottom:6cqw;color:#fff}
.jz-cover .over .jz-date{margin-top:0}
.jz-cover .over .jz-date b,.jz-cover .over .jz-date span{color:#fff}
.jz-cover .over .jz-title{color:#fff;margin-top:3cqw}
.jz-cover .over .jz-title .jz-ul{color:rgba(255,255,255,.85)}
.jz-cover .over .n{margin-top:2.4cqw;font:500 2.8cqw/1.4 var(--jz-mono-font);letter-spacing:.2em;opacity:.8}
.jz-sheet[data-layout="cover"] .jz-cap{text-align:left;margin-top:0}

/* 格子便当：一块一块的小方块 */
.jz-sheet[data-layout="bento"] .jz-block{margin-top:3.6cqw}
.jz-sheet[data-layout="bento"] .jz-row{gap:3.6cqw;align-items:stretch}
.jz-sheet[data-layout="bento"] .jz-cell{position:relative;background:var(--jz-card);box-shadow:var(--jz-card-shadow);border-radius:3.6cqw;padding:4.2cqw;overflow:hidden;min-height:30cqw}
.jz-sheet[data-layout="bento"][data-style="newsprint"] .jz-cell,.jz-sheet[data-layout="bento"][data-style="chalk"] .jz-cell{border:1px solid var(--jz-rule-strong);border-radius:0}
.jz-sheet[data-layout="bento"] .jz-cell.photo,.jz-sheet[data-layout="bento"] .jz-cell.k-title{padding:0;min-height:0}
.jz-sheet[data-layout="bento"] .jz-cell.k-title{padding:4.2cqw 4.2cqw 3.4cqw}
.jz-sheet[data-layout="bento"] .jz-cell.photo .jz-frame{--jz-frame-pad:0;box-shadow:none;background:transparent}
.jz-sheet[data-layout="bento"] .jz-cell.photo .jz-frame img{border-radius:0}
.jz-sheet[data-layout="bento"] .jz-cell.photo .jz-cap{margin:0;padding:2.6cqw 3.6cqw 3.2cqw;text-align:left}
.jz-sheet[data-layout="bento"] .jz-cell .jz-strip{border:0;padding:0}
.jz-sheet[data-layout="bento"] .jz-cell .jz-date{margin-top:3cqw}
.jz-sheet[data-layout="bento"] .jz-cell .jz-date b{font-size:15cqw}
.jz-sheet[data-layout="bento"] .jz-row .jz-cell .jz-strip{letter-spacing:.06em}
.jz-sheet[data-layout="bento"] .jz-row .jz-cell .jz-strip span:first-child{display:none}
.jz-sheet[data-layout="bento"] .jz-row .jz-cell .jz-date{flex-direction:column;align-items:flex-start;gap:1.4cqw;margin-top:2.4cqw}
.jz-sheet[data-layout="bento"] .jz-row .jz-cell .jz-date b{font-size:11cqw}
.jz-sheet[data-layout="bento"] .jz-row .jz-cell .jz-date span{font-size:2.5cqw;line-height:1.4;padding:0}
.jz-sheet[data-layout="bento"] .jz-cell .jz-wx{flex-direction:column;align-items:flex-start;border:0;padding:0;gap:2.4cqw}
.jz-sheet[data-layout="bento"] .jz-cell .jz-quote,.jz-sheet[data-layout="bento"] .jz-cell .jz-food{background:none;box-shadow:none;padding:0;border:0}
.jz-sheet[data-layout="bento"] .jz-cell .jz-food::after{display:none}
.jz-sheet[data-layout="bento"] .jz-cell .jz-title{font-size:6.4cqw}

/* 立轴：窄窄的一卷，标题竖着写在左边，上下两根轴 */
.jz-sheet[data-layout="scroll"]{padding-top:11cqw;padding-bottom:13cqw}
.jz-sheet[data-layout="scroll"]::before,.jz-sheet[data-layout="scroll"]::after{content:"";position:absolute;left:3cqw;right:3cqw;height:3.4cqw;border-radius:2cqw;background:linear-gradient(to bottom,#7b5a3a,#4a3220 60%,#2e1f14);box-shadow:0 2px 4px rgba(0,0,0,.25)}
.jz-sheet[data-layout="scroll"]::before{top:3.6cqw}
.jz-sheet[data-layout="scroll"]::after{bottom:4.6cqw}
.jz-scroll{display:grid;grid-template-columns:15cqw 1fr;gap:5cqw}
.jz-side{display:flex;flex-direction:column;align-items:center;gap:4cqw;padding-top:1cqw;border-right:1px solid var(--jz-rule);padding-right:4cqw}
.jz-side .vt{writing-mode:vertical-rl;font:700 7cqw/1.15 var(--jz-title-font);letter-spacing:.32em;color:var(--jz-ink)}
.jz-side .vd{writing-mode:vertical-rl;font:400 3cqw/1.2 var(--jz-mono-font);letter-spacing:.3em;color:var(--jz-soft)}
.jz-side .seal{width:10cqw;height:10cqw}
.jz-sheet[data-layout="scroll"] .jz-main .jz-block:first-child{margin-top:0}
.jz-sheet[data-layout="scroll"] .jz-main .jz-diary p,.jz-sheet[data-layout="scroll"] .jz-main .jz-body p{font-size:3.9cqw}

/* 信纸：横格纸，字在前头 */
.jz-sheet[data-layout="letter"]{background-image:var(--jz-tex),repeating-linear-gradient(to bottom,transparent 0,transparent calc(8.2cqw - 1px),var(--jz-rule) calc(8.2cqw - 1px),var(--jz-rule) 8.2cqw);background-size:var(--jz-tex-size),100% 8.2cqw;background-position:0 0,0 4cqw}
.jz-sheet[data-layout="letter"] .jz-diary p,.jz-sheet[data-layout="letter"] .jz-body p{line-height:8.2cqw}
.jz-letterhead{text-align:right;font:400 3.2cqw/1.6 var(--jz-mono-font);letter-spacing:.14em;color:var(--jz-soft)}
.jz-sheet[data-layout="letter"] .jz-title{font-size:6.2cqw}
.jz-ps{font:400 3.4cqw/1.6 var(--jz-hand-font);color:var(--jz-soft)}

/* ========== 风格里另加的几样 ========== */
.jz-sheet[data-style="xuan"] .jz-title{letter-spacing:.12em}
.jz-sheet[data-style="newsprint"] .jz-strip{border-bottom-width:3px;border-bottom-style:double}
.jz-sheet[data-style="newsprint"] .jz-title{font-weight:900;font-size:8.4cqw}
.jz-sheet[data-style="newsprint"] .jz-title .jz-ul{display:none}
.jz-sheet[data-style="newsprint"] .jz-frame img,.jz-sheet[data-style="newsprint"] .jz-cover img,.jz-sheet[data-style="newsprint"] .jz-food img{filter:grayscale(1) contrast(1.06)}
.jz-sheet[data-style="newsprint"] .jz-diary p{text-align:justify}
.jz-sheet[data-style="chalk"] .jz-frame{border:1px dashed var(--jz-rule-strong)}
.jz-sheet[data-style="chalk"] .jz-quote{border:1px dashed var(--jz-rule-strong)}
.jz-sheet[data-style="film"] .jz-date b{font-weight:300;letter-spacing:-.04em}
.jz-sheet[data-style="kraft"] .jz-sheet-stitch{position:absolute;inset:2.6cqw;border:1px dashed rgba(51,36,26,.38);border-radius:1cqw;pointer-events:none}
.jz-sheet[data-style="night"] .jz-title{color:#f3ead2}
${Object.keys(STYLE_VARS).map(varsOf).join("\n")}
`;

export const STYLE_KEYS_LOOK = Object.keys(STYLE_VARS);
