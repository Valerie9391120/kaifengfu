import { useState, useRef, useEffect, Fragment } from "react";
import { DOC_FMT } from "../docs.js";
import { richBlocks } from "../rich.js";
import { fmtChars } from "../util.js";
import { memeSrc } from "../memes.js";
import { T, flat, BUBBLE_GLASS, fill, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { twoFingers } from "../ui/press.js";
import { voiceKeyOf, heardOf, shownOf, voiceWidth, secondsOf } from "../voice.js";
import { drawKeyOf, drawImgOf } from "../draw.js";

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
        style={{ ...flat(0.45), borderRadius: 14, padding: "8px 12px", color: T.inkSoft }}
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
        border: HAIRLINE,
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
        border: HAIRLINE,
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

// ---------- 他的语音条（见 voice.js、speaker.js） ----------
// 一个点、两道弧，朝右（他在左边）。放的时候两道弧一道一道亮起来（照微信）
function VoiceGlyph({ on }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true" className={on ? "kfs-voice-on" : ""} style={{ flexShrink: 0 }}>
      <circle cx="6.5" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <path className="kfs-arc1" d="M10.6 8.3a5.3 5.3 0 0 1 0 7.4" />
      <path className="kfs-arc2" d="M14.4 5.1a9.7 9.7 0 0 1 0 13.8" />
    </svg>
  );
}

// st：它眼下的样子（load、wait、busy 念着；ready 念好了；fail 念不成；none 没人念）。
// heard：转了文字（字摆在底下的白框里）；playing：正在放
function HisVoice({ text, st, heard, playing, onTap, onAgain }) {
  const s = st ? st.s : "load";
  // 念不成、没人念：把字摆出来（跟平常的字一样画：动作淡斜体、加粗；语气标签摘掉），底下一行“点这里再念”
  // （太长了、没有要念的字的那种再念也没用，只说一句）
  if (s === "fail" || s === "none") {
    return (
      <>
        <div className="kfs-voice-text whitespace-pre-wrap break-words" data-state={s} style={{ padding: "10px 15px", fontSize: 15.5, lineHeight: 1.55, borderRadius: 22, userSelect: "none", WebkitUserSelect: "none", ...BUBBLE_GLASS }}>
          {renderRich(shownOf(text) || "……")}
        </div>
        {st && st.long ? (
          <div className="kfs-voice-note" style={{ fontSize: 12, color: T.inkSoft, padding: "5px 6px 0" }}>
            {st.why}
          </div>
        ) : (
          <button className="kfs-voice-again kfs-tap text-left" onClick={onAgain} style={{ fontSize: 12, color: T.inkSoft, padding: "5px 6px 0" }}>
            {s === "fail" ? `语音没念出来：${st.why}。点这里再念` : "这条语音还没念，点这里念出来"}
          </button>
        )}
      </>
    );
  }
  const ready = s === "ready";
  const sec = ready ? secondsOf(st.dur) : 0;
  const words = heardOf(text) || "……"; // 转文字摆的：念出来的那些字
  return (
    <>
      <button
        className="kfs-voice kfs-tap flex items-center"
        data-state={s}
        data-playing={playing ? "yes" : "no"}
        aria-label={ready ? `语音 ${sec} 秒，${playing ? "正在放，点一下停" : "点一下放"}` : "语音，正在念"}
        onClick={() => ready && onTap()}
        style={{ ...BUBBLE_GLASS, borderRadius: 22, height: 44, width: ready ? voiceWidth(st.dur) : 78, padding: "0 14px 0 12px", gap: 8, color: T.dai, justifyContent: "space-between" }}
      >
        <VoiceGlyph on={playing} />
        {ready ? (
          <span className="kfs-voice-sec" style={{ fontSize: 14, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
            {sec}″
          </span>
        ) : (
          <span className="flex items-center" style={{ gap: 4 }} aria-hidden="true">
            <span className="kfs-dot" />
            <span className="kfs-dot" style={{ animationDelay: ".15s" }} />
            <span className="kfs-dot" style={{ animationDelay: ".3s" }} />
          </span>
        )}
      </button>
      {heard && (
        <div
          className="kfs-heard whitespace-pre-wrap break-words"
          style={{ marginTop: 5, padding: "8px 13px", borderRadius: 16, background: fill(0.86), border: HAIRLINE, boxShadow: "0 4px 14px rgba(var(--k-shade),0.10)", fontSize: 14.5, lineHeight: 1.55, color: T.ink, userSelect: "none", WebkitUserSelect: "none" }}
        >
          {words}
        </div>
      )}
    </>
  );
}

// ---------- 他画的画（见 draw.js、painter.js） ----------
// 画好了跟照片一样摆，点开看大图。还没画好的时候摆一个跟那张画一样横竖的框：
// 在画（画了几秒了）、没画成（缘故，点了重画；画到一半断了的点了接着画）、没画（她没开着“他能画画”的时候他画的，点了画出来）
const DRAW_BOX = { 方: [184, 184], 竖: [168, 224], 横: [224, 168] };
function Seconds({ t0 }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.max(0, Math.round((Date.now() - (t0 || Date.now())) / 1000))}″</span>;
}
function HisDraw({ ratio, st, data, onOpen, onAgain }) {
  const s = st ? st.s : "load";
  if (s === "ready" && data) return <PhotoImg data={data} onOpen={onOpen} />;
  const [w, h] = DRAW_BOX[ratio] || DRAW_BOX["方"];
  const box = { ...BUBBLE_GLASS, borderRadius: 18, width: w, height: h, color: T.inkSoft, fontSize: 13, gap: 8 };
  if (s === "fail" || s === "none") {
    const again = st && st.resume ? "接着画" : "重画";
    const say = s === "none" ? "这张画还没画，点这里画出来" : st.link ? `没连上 ElevenLabs。在 API 面板连上以后，点这里${again}` : `没画成：${st.why || "不知道为什么"}。点这里${again}`;
    return (
      <button className="kfs-draw kfs-tap flex flex-col items-center justify-center text-center" data-state={s} onClick={onAgain} style={{ ...box, padding: "0 16px", lineHeight: 1.55 }}>
        <Icon name="pen" size={20} />
        <span className="kfs-draw-note" style={{ fontSize: 12.5 }}>
          {say}
        </span>
      </button>
    );
  }
  // 在画、等着画、正从存档里取；画好了图还没取出来
  const drawing = s === "busy" || s === "wait";
  return (
    <div className="kfs-draw flex flex-col items-center justify-center" data-state={s} aria-label={drawing ? "他在画" : "画加载中"} style={box}>
      {s === "ready" ? (
        <span>{data === false ? "画没存下来" : "画加载中"}</span>
      ) : (
        <>
          <Icon name="pen" size={20} />
          <span className="flex items-center" style={{ gap: 6 }}>
            {drawing ? "他在画" : ""}
            <span className="flex items-center" style={{ gap: 4 }} aria-hidden="true">
              <span className="kfs-dot" />
              <span className="kfs-dot" style={{ animationDelay: ".15s" }} />
              <span className="kfs-dot" style={{ animationDelay: ".3s" }} />
            </span>
          </span>
          {s === "busy" && st.t0 ? (
            <span className="kfs-draw-sec" style={{ fontSize: 11.5 }}>
              <Seconds t0={st.t0} />
            </span>
          ) : null}
        </>
      )}
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
        style={{ width: 38, height: 38, borderRadius: 13, background: fill(0.7), color: T.dai }}
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

// voices、heard、playing：他的语音条眼下的样子、转过文字的那几条、正在放的那一条（名字见 voice.js 的 voiceKeyOf）
// draws：他画的画眼下的样子（名字见 draw.js 的 drawKeyOf）
export function BubbleRow({ row, avatars, animate, imgs = {}, docs = {}, voices = {}, heard = null, playing = "", draws = {}, onVoice, onVoiceAgain, onDrawAgain, onOpenPhoto, onOpenDoc, onLongPress }) {
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
        // 给测试认气泡是谁的（tests/mailkit.py 的 retry_last：长按他最后那个气泡点“重新回答”）
        data-kfs-bubble={row.role}
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
        ) : it.type === "voice" && !her ? (
          <HisVoice
            text={it.text}
            st={voices[voiceKeyOf(row.msg.id, row.idx)]}
            heard={!!heard && heard.has(voiceKeyOf(row.msg.id, row.idx))}
            playing={playing === voiceKeyOf(row.msg.id, row.idx)}
            onTap={() => onVoice && onVoice(voiceKeyOf(row.msg.id, row.idx))}
            onAgain={() => onVoiceAgain && onVoiceAgain(row)}
          />
        ) : it.type === "voice" ? (
          <VoiceBubble text={it.text} dur={it.dur} />
        ) : it.type === "draw" ? (
          <HisDraw
            ratio={it.ratio || ""}
            st={draws[drawKeyOf(row.msg.id, row.idx)]}
            data={imgs[drawImgOf(drawKeyOf(row.msg.id, row.idx))]}
            onOpen={onOpenPhoto}
            onAgain={() => onDrawAgain && onDrawAgain(row)}
          />
        ) : (
          <div
            className="whitespace-pre-wrap break-words"
            style={{ padding: "10px 15px", fontSize: 15.5, lineHeight: 1.55, borderRadius: radius, userSelect: "none", WebkitUserSelect: "none", ...skin }}
          >
            {/* 电话里他说的（row.call，见 rows.js）：语气标签不摆，跟字幕一样只留话 */}
            {renderRich(row.call && !her ? shownOf(it.text || "") || "……" : it.text || "")}
          </div>
        )}
      </div>
    </div>
  );
}
