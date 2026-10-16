import { T, glass, fill } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";

// 南衙：侧栏第四个格子点开以后的小功能汇总（卿卿 2026 年 10 月 11 日定的，名字、里面放什么、长什么样都是她定的）。
// 原来那一格是“日记本”，点了直接进日记；现在点了先从底下冒出这张菜单，日记是里面的头一行，改名叫“闲笔集”。
//
// 一行一样东西：左边图标，中间名字和一行小字，能进去的右边带个箭头。
// 还没盖好的（soon）：图标和名字淡一档，小字写“营造中”，没有箭头；点了只冒一句“还在营造”，别的不动。
// 哪天盖好了：把那一行的 soon 去掉，在 App.jsx 给这块面板的 open、subs 里接上它（见最底下）。
const ROWS = [
  { key: "diary", icon: "calendar", name: "闲笔集" },
  // 江湖棋局：卿卿和恩师做的双人武侠桌游，10 月 15 日烤进来的（见 game/jianghu.js）。小字写最近那一局下到哪了
  { key: "jianghu", icon: "dice", name: "江湖棋局" },
  // 藏音匣：聊天里存进来的他的语音（10 月 17 日盖好的，见 cangyin/）。小字写藏了几条
  { key: "voicebox", icon: "wave", name: "藏音匣" },
  // 网易云：2026 年 10 月 1 日看过一个现成的播放器，打算照它的思路自己写，还没动手（见开发说明“南衙”那一节）
  { key: "music", icon: "music", name: "网易云", soon: true },
];

export const SOON_SUB = "营造中";
export const soonToast = (name) => `${name}还在营造`;

function Row({ icon, name, sub, soon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="kfs-tap kfs-nanya-row w-full flex items-center text-left"
      data-soon={soon ? "1" : undefined}
      style={{ ...glass(0.5, 16), borderRadius: 18, padding: "11px 14px 11px 12px", gap: 12 }}
    >
      <span
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 38, height: 38, borderRadius: 14, background: fill(0.7), color: T.dai, opacity: soon ? 0.55 : 1 }}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="block flex-1 min-w-0">
        <span className="block" style={{ fontSize: 15, color: T.ink, opacity: soon ? 0.55 : 1 }}>
          {name}
        </span>
        <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
          {sub}
        </span>
      </span>
      {!soon && <Icon name="chevR" size={17} color={T.inkSoft} />}
    </button>
  );
}

// subs：每一行的小字，照 key 给，例如 { diary: "今天还没写" }（闲笔集那一行和格子上那一行是同一句）；
// open：每一行点了去哪儿，照 key 给，例如 { diary: 进闲笔集 }；
// onSoon(name)：点了还没盖好的那一行。去掉了 soon 却忘了在 open 里接上的，点了也走这儿，不会点了没反应
export function NanyaPanel({ subs = {}, open = {}, onSoon }) {
  return (
    <div className="kfs-nanya flex flex-col" style={{ gap: 10 }}>
      {ROWS.map((r) => {
        const go = !r.soon && open[r.key];
        return (
          <Row
            key={r.key}
            icon={r.icon}
            name={r.name}
            soon={!go}
            sub={go ? subs[r.key] || "" : SOON_SUB}
            onClick={go || (() => onSoon(r.name))}
          />
        );
      })}
    </div>
  );
}
