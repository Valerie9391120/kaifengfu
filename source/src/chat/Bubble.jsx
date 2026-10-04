import { useState, useRef, Fragment } from "react";
import { DOC_FMT } from "../docs.js";
import { richBlocks } from "../rich.js";
import { fmtChars } from "../util.js";
import { memeSrc } from "../memes.js";
import { T, glass, BUBBLE_GLASS } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { twoFingers } from "../ui/press.js";

// 气泡里的字：标题行加大加粗、**加粗**、*动作* 淡斜体（怎么拆见 rich.js）
const RICH_H = [0, 20, 18, 16.5, 16.5, 16.5, 16.5]; // 一到六个井号的标题各多大（气泡里平常的字是 15.5；三级往下一样大，再小就和正文分不出来了）
function renderRich(text) {
  const blocks = richBlocks(text);
  const inline = (parts, n) =>
    parts.map((p, i) =>
      p.i ? (
        <em key={n + "-" + i} style={{ fontStyle: "italic", opacity: 0.72, ...(p.b ? { fontWeight: 600 } : {}) }}>
          {p.s}
        </em>
      ) : p.b ? (
        <strong key={n + "-" + i} style={{ fontWeight: 600 }}>
          {p.s}
        </strong>
      ) : (
        <span key={n + "-" + i}>{p.s}</span>
      )
    );
  return blocks.map((b, n) =>
    b.t === "h" ? (
      // 标题自己占一行；上面要是还有字，留一点空
      <div key={n} className="kfs-head" role="heading" aria-level={b.level} style={{ fontSize: RICH_H[b.level], fontWeight: 600, lineHeight: 1.4, marginTop: n ? 8 : 0, marginBottom: n < blocks.length - 1 ? 3 : 0 }}>
        {inline(b.parts, n)}
      </div>
    ) : (
      <Fragment key={n}>{inline(b.parts, n)}</Fragment>
    )
  );
}

function MemeImg({ file, width = 140 }) {
  const [bad, setBad] = useState(false);
  if (bad) {
    return (
      <div
        className="text-[12px]"
        style={{ ...glass(0.45, 12), borderRadius: 14, padding: "8px 12px", color: T.inkSoft }}
      >
        表情包 {file} 暂时显示不了
      </div>
    );
  }
  return (
    <img
      src={memeSrc(file)}
      alt=""
      draggable={false}
      onError={() => setBad(true)}
      style={{
        WebkitTouchCallout: "none",
        width,
        display: "block",
        borderRadius: 18,
        border: "1.5px solid rgba(255,255,255,0.8)",
        boxShadow: "0 8px 22px rgba(var(--k-shade),0.16)",
      }}
    />
  );
}

function PhotoImg({ data, onOpen }) {
  if (!data) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ ...BUBBLE_GLASS, borderRadius: 18, width: 150, height: 112, fontSize: 12, color: T.inkSoft }}
      >
        {data === false ? "照片没存下来" : "照片加载中"}
      </div>
    );
  }
  return (
    <img
      src={data}
      alt=""
      className="kfs-photo"
      draggable={false}
      onClick={() => onOpen && onOpen(data)}
      style={{
        WebkitTouchCallout: "none",
        display: "block",
        maxWidth: 210,
        maxHeight: 280,
        borderRadius: 18,
        border: "1.5px solid rgba(255,255,255,0.8)",
        boxShadow: "0 8px 22px rgba(var(--k-shade),0.16)",
      }}
    />
  );
}

function VoiceBubble({ text, dur }) {
  return (
    <div style={{ ...BUBBLE_GLASS, borderRadius: 22, padding: "10px 15px", minWidth: 92 }}>
      <div className="flex items-center" style={{ gap: 8, color: T.dai }}>
        <Icon name="wave" size={18} />
        <span style={{ fontSize: 14, color: T.ink }}>{dur || 1}″</span>
      </div>
      {text ? (
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 6, lineHeight: 1.55 }}>
          {text}
        </div>
      ) : null}
    </div>
  );
}

// ---------- 文档 ----------
// 对话里的一张文档卡片：她发的（全文另存在 kfs2:doc:<id>）和他写的（全文就在回复里）长得一样
function docSub(it, text) {
  if (it.docId && text === false) return "全文没存下来";
  if (it.docId && text === undefined) return "加载中";
  const n = it.chars || (text ? text.length : 0);
  return `${DOC_FMT[it.fmt || "md"] || "文档"}，${fmtChars(n)}` + (it.cut ? "，没写完" : "");
}

function DocCard({ name, sub, onOpen }) {
  return (
    <button
      onClick={onOpen}
      aria-label={`文档 ${name}`}
      className="kfs-doc-card kfs-tap flex items-center text-left"
      style={{ ...BUBBLE_GLASS, borderRadius: 20, padding: "9px 14px 9px 9px", gap: 10, maxWidth: 232 }}
    >
      <span
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 38, height: 38, borderRadius: 13, background: "rgba(255,255,255,0.7)", color: T.dai }}
      >
        <Icon name="doc" size={20} />
      </span>
      <span className="block min-w-0">
        <span className="block truncate" style={{ fontSize: 14.5, color: T.ink }}>
          {name}
        </span>
        <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
          {sub}
        </span>
      </span>
    </button>
  );
}

export function BubbleRow({ row, avatars, animate, imgs = {}, docs = {}, onOpenPhoto, onOpenDoc, onLongPress }) {
  const press = useRef(null);
  const fired = useRef(false);
  const startPress = (e) => {
    const t = e.touches[0];
    const el = e.currentTarget;
    fired.current = false;
    press.current = {
      x: t.clientX,
      y: t.clientY,
      timer: setTimeout(() => {
        press.current = null;
        // 长按只认一根手指（见 useLongPress 上面那段）
        if (twoFingers) return;
        fired.current = true;
        if (onLongPress) onLongPress(row, el.getBoundingClientRect());
      }, 450),
    };
  };
  const movePress = (e) => {
    const p = press.current;
    if (!p) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - p.x) > 8 || Math.abs(t.clientY - p.y) > 8) {
      clearTimeout(p.timer);
      press.current = null;
    }
  };
  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const her = row.role === "her";
  // 照iOS短信：四个角一样圆，多长都不变方
  const radius = 22;
  const it = row.item;
  const skin = BUBBLE_GLASS;
  // 文档的全文：他写的就在回复里；她发的另存着，没取到是 undefined，丢了是 false
  const docText = it.type === "doc" ? (it.text !== undefined ? it.text : docs[it.docId]) : null;
  return (
    <div
      className={`flex items-end ${her ? "flex-row-reverse" : ""}`}
      style={{ gap: 8, marginTop: row.first ? 12 : 3 }}
    >
      <div style={{ width: 34, flexShrink: 0 }}>
        {row.last && <Avatar av={her ? avatars.her : avatars.him} who={row.role} size={34} />}
      </div>
      <div
        className={animate ? "kfs-in" : ""}
        onTouchStart={startPress}
        onTouchMove={movePress}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onLongPress) onLongPress(row, e.currentTarget.getBoundingClientRect());
        }}
        onClickCapture={(e) => {
          if (fired.current) {
            e.stopPropagation();
            e.preventDefault();
            fired.current = false;
          }
        }}
        style={{
          maxWidth: "74%",
          display: "flex",
          flexDirection: "column",
          alignItems: her ? "flex-end" : "flex-start",
          transformOrigin: her ? "bottom right" : "bottom left",
          WebkitTouchCallout: "none",
        }}
      >
        {it.type === "meme" ? (
          <MemeImg file={it.file} />
        ) : it.type === "photo" ? (
          <PhotoImg data={imgs[it.imgId]} onOpen={onOpenPhoto} />
        ) : it.type === "doc" ? (
          <DocCard
            name={it.name || "文档"}
            sub={docSub(it, docText)}
            onOpen={() => docText && onOpenDoc && onOpenDoc({ name: it.name || "文档", fmt: it.fmt || "md", text: docText, images: it.images || 0, cut: !!it.cut, mine: her })}
          />
        ) : it.type === "voice" ? (
          <VoiceBubble text={it.text} dur={it.dur} />
        ) : (
          <div
            className="whitespace-pre-wrap break-words"
            style={{ padding: "10px 15px", fontSize: 15.5, lineHeight: 1.55, borderRadius: radius, userSelect: "none", WebkitUserSelect: "none", ...skin }}
          >
            {renderRich(it.text || "")}
          </div>
        )}
      </div>
    </div>
  );
}
