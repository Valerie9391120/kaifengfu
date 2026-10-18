// =====================================================
// 一页手帐画出来（看的时候、改的时候都用这一张）。排成哪几块见 sheet.js，样子见 look.js。
// 不存东西：点了哪一块（onPart）、按住了哪张贴纸（onStickerDown），都交给外头（JzPage.jsx）。
// =====================================================
import { useState } from "react";
import { JZ_CSS } from "./look.js";
import { blocksOf } from "./sheet.js";
import { headOf, wxName, wxLine, penParts, quoteSpan } from "./model.js";
import { Underline, WxIcon, Seal, TAPES, Doodle } from "./marks.jsx";

// 样式表只往页面里放一回
let cssIn = false;
export function ensureJzCss() {
  if (cssIn || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.id = "jz-css";
  el.textContent = JZ_CSS;
  document.head.appendChild(el);
  cssIn = true;
}

const QUOTE_FOLD = 3; // 原话卡收着的时候摆几句

// 一张贴纸的样子
export function StickerArt({ k, emoji }) {
  const kind = k.slice(0, 1);
  const val = k.slice(2);
  if (kind === "e") {
    const svg = emoji && emoji[val];
    return svg ? <span style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: svg }} /> : <span style={{ display: "block", aspectRatio: "1", borderRadius: "30%", background: "rgba(127,127,127,0.12)" }} />;
  }
  if (kind === "t") return <div className="tape" style={{ background: TAPES[val] || TAPES.plain }} />;
  if (kind === "s") return <Seal text={val} />;
  if (kind === "d") return <Doodle k={val} />;
  return <span>{val}</span>;
}
// 点贴纸（按下去就选中了）：那一下的 click 别再往外冒，冒到外头的纸上会把刚选中的又放掉
const stop = (e) => e.stopPropagation();
const stickerClass = (k) => (k.startsWith("k:") ? "kao" : k.startsWith("t:") ? "tp" : k.startsWith("d:") ? "dd" : "");

export function JzSheet({ v, notes = {}, editing = false, emoji = null, onPart, onStickerDown, selected = null, sheetRef }) {
  ensureJzCss();
  const [open, setOpen] = useState(false); // 原话卡展开了没有
  const H = headOf(v.day);
  const blocks = blocksOf(v);
  const tap = (k) => (onPart ? () => onPart(k) : undefined);
  // 主照片底下那一行：裹在照片那一块里，点它改它自己（不再往外冒成点了照片）
  const tapCap = onPart
    ? (e) => {
        e.stopPropagation();
        onPart("cap");
      }
    : undefined;
  const badge = (k) => {
    const n = notes[k];
    if (!n || !(n.her + n.him)) return null;
    return (
      <span className={`jz-nb ${n.him && !n.her ? "him" : ""}`} aria-label={`${n.her + n.him} 条批注`}>
        批 {n.her + n.him}
      </span>
    );
  };
  const wrap = (k, inner, extra = "") => (
    <div key={k} className={`jz-tap ${extra}`} data-part={k} onClick={tap(k)}>
      {inner}
      {badge(k)}
    </div>
  );

  const photo = (p, cls = "", withCap = false) => (
    <figure className={`jz-photo ${cls}`} key={p.id}>
      <span className="jz-frame">
        <img src={p.src} alt="" draggable={false} />
      </span>
      {withCap ? (
        <figcaption className="jz-cap" data-part="cap" onClick={tapCap}>
          {v.cap}
        </figcaption>
      ) : null}
    </figure>
  );

  const part = (k) => {
    if (k === "head")
      return wrap(
        k,
        <div className="jz-head">
          <div className="jz-strip">
            <span>闲笔集</span>
            <span>{H.n >= 1 ? `在一起的第 ${H.n} 天` : H.weekCn}</span>
          </div>
          <div className="jz-date">
            <b>{H.md}</b>
            <span>
              {H.week}
              <br />
              {H.year}
            </span>
          </div>
        </div>
      );
    if (k === "title")
      return wrap(
        k,
        <h2 className="jz-title">
          {v.title}
          <Underline />
        </h2>
      );
    if (k === "wx") {
      const w = wxName(v.wx.code);
      return wrap(
        k,
        <div className="jz-wx">
          <WxIcon kind={w.i} />
          <div>
            {wxLine(v.wx)}
            {v.wx.city ? <small>{v.wx.city}</small> : null}
          </div>
        </div>
      );
    }
    if (k === "mood")
      return wrap(
        k,
        <div className="jz-mood">
          {[
            ["卿卿", v.moods.her],
            ["光义", v.moods.him],
          ]
            .filter(([, ms]) => ms.length)
            .map(([who, ms]) => (
              <div key={who}>
                <span className="who">{who}</span>
                {ms.map((m) => (
                  <span className="m" key={m.k}>
                    {m.e} {m.t}
                  </span>
                ))}
              </div>
            ))}
        </div>
      );
    if (k === "hero") return wrap(k, photo(v.hero, "jz-hero", v.has("cap")));
    if (k === "quote") {
      const list = open ? v.quotes : v.quotes.slice(0, QUOTE_FOLD);
      return wrap(
        k,
        <div className="jz-quote">
          <div className="jz-qh">
            <span>{quoteSpan(v.quotes)}</span>
            <span>{v.quotes.length} 句</span>
          </div>
          {list.map((q) => (
            <div className={`jz-q ${q.w}`} key={q.id}>
              <span className="w">
                {q.w === "her" ? "卿卿" : "光义"} {q.t}
              </span>
              {q.p}
            </div>
          ))}
          {v.quotes.length > QUOTE_FOLD ? (
            <button
              type="button"
              className="jz-qmore"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(!open);
              }}
            >
              {open ? "收起" : `还有 ${v.quotes.length - QUOTE_FOLD} 句`}
            </button>
          ) : null}
        </div>
      );
    }
    if (k === "her" || k === "him")
      return wrap(
        k,
        <div className={`jz-diary ${k}`}>
          <h4>{k === "her" ? "卿卿写的" : "光义写的"}</h4>
          <p>{k === "her" ? v.her : v.him}</p>
        </div>
      );
    if (k === "body")
      return wrap(
        k,
        <div className="jz-body">
          <p>{v.body}</p>
        </div>
      );
    if (k === "pen")
      return wrap(
        k,
        <div className="jz-pen">
          {penParts(v.pen.text).map((x, i) => (x.mark ? <mark key={i}>{x.s}</mark> : <span key={i}>{x.s}</span>))}
          {v.pen.margin ? <span className="margin">{v.pen.margin}</span> : null}
        </div>
      );
    if (k === "pair") return wrap(k, <div className="jz-pair">{v.pair.map((p) => photo(p))}</div>);
    if (k === "food")
      return wrap(
        k,
        <div className="jz-food">
          <div className="ft">
            <span>今天的饭</span>
            <span>{H.md}</span>
          </div>
          <img src={v.food.src} alt="" draggable={false} />
          {v.food.note ? <div className="fn">{v.food.note}</div> : null}
        </div>
      );
    if (k === "more") return wrap(k, <div className="jz-more">{v.more.map((p) => photo(p))}</div>);
    return null;
  };

  // 格子便当：一块包一层方块
  const cell = (k) => {
    const isPhoto = k === "hero" || k === "pair" || k === "more";
    return (
      <div key={k} className={`jz-cell k-${k} ${isPhoto ? "photo" : ""}`}>
        {part(k)}
      </div>
    );
  };
  const bento = v.layout === "bento";
  const one = (k) => (bento ? cell(k) : part(k));

  const block = (b, i) => {
    if (b.t === "one")
      return (
        <div key={`${b.k}-${i}`} className="jz-block">
          {one(b.k)}
        </div>
      );
    if (b.t === "row")
      return (
        <div key={`${b.ks.join("-")}-${i}`} className="jz-block jz-row">
          {b.ks.map(one)}
        </div>
      );
    if (b.t === "cover")
      return (
        <div key="cover" className="jz-block">
          {wrap(
            "hero",
            <div className="jz-cover">
              <img src={v.hero.src} alt="" draggable={false} />
              <div className="veil" />
              <div className="over">
                <div className="jz-date">
                  <b>{H.md}</b>
                  <span>
                    {H.week}
                    <br />
                    {H.year}
                  </span>
                </div>
                {v.has("title") ? (
                  <h2 className="jz-title" data-part="title">
                    {v.title}
                    <Underline />
                  </h2>
                ) : null}
                <div className="n">{H.n >= 1 ? `闲笔集 · 在一起的第 ${H.n} 天` : "闲笔集"}</div>
              </div>
            </div>
          )}
          {v.has("cap") ? (
            <div className="jz-cap" data-part="cap" onClick={tapCap} style={{ marginTop: "3cqw" }}>
              {v.cap}
            </div>
          ) : null}
        </div>
      );
    if (b.t === "scroll")
      return (
        <div key="scroll" className="jz-block jz-scroll">
          <div className="jz-side">
            {v.has("title") ? wrap("title", <div className="vt">{v.title}</div>) : null}
            <div className="vd">{`${H.year} · ${H.md}`}</div>
            <div className="seal">
              <Seal text="闲笔" />
            </div>
          </div>
          <div className="jz-main">{b.main.map(block)}</div>
        </div>
      );
    if (b.t === "letterhead")
      return wrap(
        "head",
        <div className="jz-letterhead">
          {H.full} {H.weekCn}
          {H.n >= 1 ? ` · 在一起的第 ${H.n} 天` : ""}
        </div>,
        "jz-block"
      );
    if (b.t === "ps") {
      const bits = [];
      if (v.has("wx")) bits.push(`那天${wxLine(v.wx)}${v.wx.city ? `，在${v.wx.city}` : ""}`);
      if (v.has("mood")) {
        if (v.moods.her.length) bits.push(`卿卿${v.moods.her.map((m) => m.t).join("、")}`);
        if (v.moods.him.length) bits.push(`光义${v.moods.him.map((m) => m.t).join("、")}`);
      }
      return wrap("wx", <div className="jz-ps">又及：{bits.join("；")}。</div>, "jz-block");
    }
    return null;
  };

  const sticker = (s, layer, idx) => {
    const sel = selected && selected.layer === layer && selected.idx === idx;
    return (
      <div
        key={`${layer}-${idx}`}
        className={`jz-stk ${stickerClass(s.k)} ${sel ? "sel" : ""}`}
        data-k={s.k}
        style={{
          left: `${s.x * 100}%`,
          top: `calc(${s.y} * 100cqw)`,
          width: s.k.startsWith("k:") || s.k.startsWith("t:") ? undefined : `calc(15cqw * ${s.s})`,
          fontSize: s.k.startsWith("k:") ? `calc(4.6cqw * ${s.s})` : undefined,
          transform: `translate(-50%,-50%) rotate(${s.r}deg)${s.k.startsWith("t:") ? ` scale(${s.s})` : ""}`,
          color: s.k.startsWith("d:") ? "var(--jz-accent)" : undefined,
        }}
        onPointerDown={editing && onStickerDown ? (e) => onStickerDown(e, layer, idx) : undefined}
        onClick={editing ? stop : undefined}
      >
        <StickerArt k={s.k} emoji={emoji} />
      </div>
    );
  };
  const arrN = v.arrStickers || 0;
  const reach = Math.max(0, ...v.stickers.map((s) => s.y), ...v.texts.map((t) => t.y));

  return (
    <div className="jz-wrap" ref={sheetRef}>
      <div className="jz-sheet" data-layout={v.layout} data-style={v.style} data-editing={editing ? "1" : undefined} style={reach ? { minHeight: `calc(${reach} * 100cqw + 12cqw)` } : undefined}>
        {v.style === "kraft" ? <div className="jz-sheet-stitch" /> : null}
        {blocks.map(block)}
        {v.stickers.map((s, i) => (i < arrN ? sticker(s, "arr", i) : sticker(s, "mine", i - arrN)))}
        {v.texts.map((t, i) => {
          const sel = selected && selected.layer === "text" && selected.idx === i;
          return (
            <div
              key={`t-${t.id || i}`}
              className={`jz-stk txt ${sel ? "sel" : ""}`}
              style={{ left: `${t.x * 100}%`, top: `calc(${t.y} * 100cqw)`, fontSize: `calc(4.6cqw * ${t.s})`, transform: `translate(-50%,-50%) rotate(${t.r}deg)` }}
              onPointerDown={editing && onStickerDown ? (e) => onStickerDown(e, "text", i) : undefined}
              onClick={editing ? stop : undefined}
            >
              {t.m}
            </div>
          );
        })}
      </div>
    </div>
  );
}
