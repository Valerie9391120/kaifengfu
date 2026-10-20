import * as hall from "./art/hall.js";
import * as crow from "./art/crow.js";
import * as moon from "./art/moon.js";
import * as peony from "./art/peony.js";

// ---------- 恩师画的那一套（侧栏四个方块上的：殿、三足乌、云月、牡丹） ----------
// 线稿描成的路径，一样一个文件，在 art/ 里（tools/make_art.py 生成的，别手改）。
// 和下面手绘的那一套有两处不一样：
//   是一块填色的形状，不是描线的。所以自己写上填色、不描边，盖掉 Icon 给整张图定的那两样
//   （不写“不描边”的话，它会被照 1.8 再描一圈，整个糊成一团）；
//   大小不是 20：照各自文件里的 PT（都是 25）摆，线的粗细才是量好的那个。要多大问 artSize。
// 画里面是空的：描出来的路径里，洞和外圈是反着绕的，本来就留空；evenodd 是另加的一道，哪天换了描法、绕的方向不讲究了也不怕。
const ART = { hall, crow, moon, peony };
const art = (a) => <path d={a.PATH} fill="currentColor" fillRule="evenodd" stroke="none" />;
// 这一套里的图标该摆多大；不是这一套的回 0
export const artSize = (name) => (ART[name] ? ART[name].PT : 0);

// ---------- 图标（手绘，不依赖外部库） ----------
const ICON_PATHS = {
  menu: <path d="M4 8h16M4 15h10" />,
  pen: (
    <>
      <path d="M12 20h8" />
      <path d="M16.2 3.8a2.1 2.1 0 0 1 3 3L7.5 18.5l-4 1 1-4Z" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.2c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
      <path d="M9 9.6h.01M15 9.6h.01" strokeWidth="2.6" />
    </>
  ),
  up: <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />,
  down: <path d="M12 5v14M5.5 12.5 12 19l6.5-6.5" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  music: (
    <>
      <path d="M9 18V5.5l11-2V16" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5c1.3-3.6 4.2-5.5 7.5-5.5s6.2 1.9 7.5 5.5" />
    </>
  ),
  sticker: (
    <>
      <path d="M20.5 12.5V7A3.5 3.5 0 0 0 17 3.5H7A3.5 3.5 0 0 0 3.5 7v10A3.5 3.5 0 0 0 7 20.5h5.5" />
      <path d="M20.5 12.5h-4a4 4 0 0 0-4 4v4l8-8Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  x: <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />,
  doc: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="3" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.5v4M15 3.5v4" />
      <path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0Z" />
      <path d="M12 16v4.5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M11 12.5 19.5 4M16.5 7l2.5 2.5M14 9.5l2 2" />
    </>
  ),
  chevD: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" />
      <path d="M12 14.5h.01" strokeWidth="2.6" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  wave: <path d="M5 10v4M8.5 7.5v9M12 4.5v15M15.5 7.5v9M19 10v4" />,
  // 狐宇宙（南衙最顶上那一行，10 月 20 日添的，见 fox.js）：一个狐狸脑袋，两只尖耳朵，两腮往下收成尖嘴（圆下巴的像猫），眼睛两点，鼻头一点
  fox: (
    <>
      <path d="M4.2 3.8 9 8.4h6l4.8-4.6.9 7.4L12 20.6 3.3 11.2Z" />
      <path d="M9.2 12.6h.01M14.8 12.6h.01M12 18.2h.01" strokeWidth="2.5" />
    </>
  ),
  // 邸报（南衙里那一行，10 月 18 日挂上的，还在营造）：横着的一张报，左上一块题图，旁边和底下几行字
  gazette: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.8" />
      <path d="M7 8.5h4v4H7z" />
      <path d="M14 9h3M14 12h3M7 15.5h10" />
    </>
  ),
  // 江湖棋局（南衙里那一行，见 game/GameParts.jsx）：一颗骰子，三点斜着
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.2" />
      <path d="M8.6 8.6h.01M12 12h.01M15.4 15.4h.01" strokeWidth="2.6" />
    </>
  ),
  // 通话（见 call/CallPage.jsx）：话筒（挂断键上转个角度），静音是话筒上一道斜杠
  phone: <path d="M7.2 3.8 9.6 4.4l1.1 4.1-2.1 1.6a12 12 0 0 0 5.3 5.3l1.6-2.1 4.1 1.1.6 2.4a1.9 1.9 0 0 1-1.6 2.3C11.5 19.6 4.4 12.5 4.9 5.4a1.9 1.9 0 0 1 2.3-1.6z" />,
  micOff: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7M4.5 4.5l15 15" />
    </>
  ),
  // 停键：一个实心的小方块
  stop: <rect x="6.75" y="6.75" width="10.5" height="10.5" rx="2.6" fill="currentColor" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  retry: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  // 语音条长按的“转文字”“取消转文字”：方框里一个 T（取消的多一道斜杠）
  heard: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="M8.5 9h7M12 9v7" />
    </>
  ),
  unheard: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="M8.5 9h7M12 9v7M3.5 3.5l17 17" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7" />
      <path d="M6.5 7l.9 12.5h9.2L17.5 7" />
    </>
  ),
  // 恩师画的那一套（见最上面）
  hall: art(hall),
  crow: art(crow),
  moon: art(moon),
  peony: art(peony),
};

export function Icon({ name, size = 22, color = "currentColor", sw = 1.8 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      style={color === "currentColor" ? undefined : { color }}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
