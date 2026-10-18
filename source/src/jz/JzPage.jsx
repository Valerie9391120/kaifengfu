// =====================================================
// 一页手帐那一层：看、改、让他排、留批注（见 model.js 开头）。从闲笔集里点“掺一页手帐”或者那一页的卡片进来。
//
// 改的法子（照同页的意思，自己写的）：
//   顶上两根轴：版式、风格，点开挑，或者骰一下（换版式、换风格、全洗牌）；
//   点纸上哪一块：改字、换照片、挑原话、藏起来、留批注；
//   底下一排：贴纸、写字、排的东西（标题、照片、原话、正文、红笔）、让光义排、更多（天气在哪儿、藏起来的、删掉这一页）；
//   贴纸、写的字按住能挪，点一下选中，底下冒出转、大小、删。
// 改了就存（停手半秒存一回）。存档、取图、问他，都走外头给的 api（App.jsx 的 jzApi）。
// =====================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { T, SERIF, glass, chip, chipPrimary, field, fill, HAIR, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { IconBtn, Sheet } from "../ui/parts.jsx";
import { fileToPhoto } from "../images.js";
import { newId } from "../util.js";
import { LAYOUTS, STYLES, LAYOUT_KEYS, STYLE_KEYS, emptyPage, viewOf, roll, partName, pickQuotes, QUOTE_MAX, PHOTO_MAX, PHOTO_ROLES, layoutOf, styleOf, wxLine, NOTE_MAX, headOf } from "./model.js";
import { partsShown } from "./sheet.js";
import { JzSheet, StickerArt } from "./JzSheet.jsx";
import { TABS } from "./stickerList.js";

const ROLE_NAME = { hero: "主照片", pair: "双联照", food: "饭", more: "别的" };
const TEXT_PARTS = ["title", "body", "cap", "pen"];
const fmtAt = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// 小按钮（底下那一排）
function DockBtn({ icon, label, onClick, busy, cls }) {
  return (
    <button onClick={onClick} disabled={busy} className={`kfs-tap flex flex-col items-center justify-center ${cls || ""}`} style={{ flex: 1, gap: 3, padding: "7px 0 5px", color: busy ? T.inkFaint : T.inkSoft, fontSize: 11 }}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

export function JzPage({ day, diary = {}, api, onBack }) {
  const H = headOf(day);
  const [page, setPage] = useState(null); // null：还在读
  const [notes, setNotes] = useState([]);
  const [imgs, setImgs] = useState({}); // 手帐页上的照片：编号 → 图
  const [mats, setMats] = useState({ photos: [], quotes: [] }); // 那一天的原料
  const [matImgs, setMatImgs] = useState({}); // 原料里的照片：聊天里那张的编号 → 图
  const [emoji, setEmoji] = useState(null);
  const [sheet, setSheet] = useState(""); // 冒出来的是哪一张：part / layout / style / stickers / text / stuff / him / more / notes / city / edit
  const [focus, setFocus] = useState(""); // 点了哪一块
  const [sel, setSel] = useState(null); // 选中的贴纸 { layer, idx }
  const [busy, setBusy] = useState(""); // him：他在排；wx：在取天气
  const [toast, setToast] = useState("");
  const [cfg, setCfg] = useState(null);
  const sheetRef = useRef(null);
  const saveTimer = useRef(null);
  const pageRef = useRef(null);
  const gone = useRef(false); // 退出去了、删掉了：还在路上的天气、他排的那一版回来了也不再存
  const fresh = useRef(false); // 这一页还没存过（点“掺一页手帐”进来、还没动）：顺手取的天气先摆着不存，动了哪儿再连天气一起存

  // ---- 读 ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, ns, m, c] = await Promise.all([api.loadPage(day), api.loadNotes(day), api.materials(day), api.loadCfg()]);
      if (!alive) return;
      const pg = p || emptyPage(day);
      fresh.current = !p;
      pageRef.current = pg;
      setPage(pg);
      setNotes(ns || []);
      setMats(m || { photos: [], quotes: [] });
      setCfg(c || {});
      // 这一页上的照片
      const ids = pg.arr.photos.map((x) => x.id);
      const got = {};
      for (const id of ids) got[id] = await api.getImg(id);
      if (alive) setImgs(got);
      // 头一回、还没有天气、填过在哪儿：顺手取一回
      if (!p && c && c.city) fetchWx(pg, c.city, true);
    })();
    api.loadEmoji().then((e) => alive && setEmoji(e)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [day]);

  // 停手半秒存一回；离开的时候存
  const commit = (next, now = false) => {
    fresh.current = false;
    const stamped = { ...next, at: Date.now() };
    pageRef.current = stamped;
    setPage(stamped);
    clearTimeout(saveTimer.current);
    const doSave = () => api.savePage(day, pageRef.current);
    if (now) doSave();
    else saveTimer.current = setTimeout(doSave, 500);
  };
  useEffect(() => () => {
    gone.current = true;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      if (pageRef.current && pageRef.current.at) api.savePage(day, pageRef.current);
    }
  }, []);
  const say = (t) => {
    setToast(t);
    setTimeout(() => setToast((x) => (x === t ? "" : x)), 1800);
  };

  const v = useMemo(() => (page ? viewOf(page, diary, (id) => imgs[id] || null) : null), [page, diary, imgs]);
  const noteMap = useMemo(() => {
    const m = {};
    notes.forEach((n) => {
      const k = n.part || "head";
      m[k] = m[k] || { her: 0, him: 0 };
      m[k][n.who] += 1;
    });
    return m;
  }, [notes]);

  // ---- 改 ----
  const setArr = (patch) => commit({ ...pageRef.current, arr: { ...pageRef.current.arr, ...patch } });
  const setMine = (patch) => commit({ ...pageRef.current, mine: { ...pageRef.current.mine, ...patch, at: Date.now() } });
  const editText = (k, val) => {
    const p = pageRef.current;
    // 他排的那一页：她改的字放在她那一层（他重排也不盖掉）；她自己拼的：直接改
    if (p.arr.by === "him") setMine({ edit: { ...p.mine.edit, [k]: val } });
    else setArr({ [k]: val });
  };
  const hidePart = (k) => setMine({ hide: Array.from(new Set(pageRef.current.mine.hide.concat([k]))) });
  const showPart = (k) => setMine({ hide: pageRef.current.mine.hide.filter((x) => x !== k) });

  // ---- 照片 ----
  // 用一张聊天里的照片：另存一份到手帐（删了聊天也还在）
  const adoptChat = async (imgId) => {
    const data = await api.chatImg(imgId);
    if (!data) throw new Error("这张图在这台手机上还没同步下来");
    const small = await api.shrink(data, 960);
    const id = "jz" + newId();
    await api.putImg(id, small);
    setImgs((m) => ({ ...m, [id]: small }));
    return id;
  };
  const addPhotoFromChat = async (imgId, role) => {
    if (pageRef.current.arr.photos.length >= PHOTO_MAX) return say(`一页最多 ${PHOTO_MAX} 张`);
    try {
      const id = await adoptChat(imgId);
      setArr({ photos: pageRef.current.arr.photos.concat([{ id, role: role || nextRole(), note: "", from: imgId }]) });
    } catch (e) {
      say(String(e.message || e));
    }
  };
  const addPhotoFromFile = async (file) => {
    if (!file) return;
    if (pageRef.current.arr.photos.length >= PHOTO_MAX) return say(`一页最多 ${PHOTO_MAX} 张`);
    try {
      const data = await fileToPhoto(file, 960);
      const id = "jz" + newId();
      await api.putImg(id, data);
      setImgs((m) => ({ ...m, [id]: data }));
      setArr({ photos: pageRef.current.arr.photos.concat([{ id, role: nextRole(), note: "" }]) });
    } catch (e) {
      say("这张没放进来");
    }
  };
  const nextRole = () => {
    const ps = pageRef.current.arr.photos;
    if (!ps.some((x) => x.role === "hero")) return "hero";
    return "more";
  };
  const setRole = (id, role) => {
    let ps = pageRef.current.arr.photos.map((x) => ({ ...x }));
    // 主照片、饭只能一张：别的换成“别的”
    if (role === "hero" || role === "food") ps.forEach((x) => x.id !== id && x.role === role && (x.role = "more"));
    ps = ps.map((x) => (x.id === id ? { ...x, role } : x));
    setArr({ photos: ps });
  };
  const dropPhoto = (id) => {
    setArr({ photos: pageRef.current.arr.photos.filter((x) => x.id !== id) });
    api.dropImg(id);
  };

  // ---- 原话 ----
  const toggleQuote = (q) => {
    const now = pageRef.current.arr.quotes;
    const ids = now.some((x) => x.id === q.id) ? now.filter((x) => x.id !== q.id).map((x) => x.id) : now.map((x) => x.id).concat([q.id]);
    if (ids.length > QUOTE_MAX) return say(`一页最多摆 ${QUOTE_MAX} 句`);
    setArr({ quotes: pickQuotes(ids, mats.quotes) });
  };

  // ---- 贴纸、字 ----
  const centerY = () => {
    const el = sheetRef.current;
    if (!el) return 0.6;
    const r = el.getBoundingClientRect();
    const mid = Math.max(0, window.innerHeight / 2 - r.top);
    return Math.max(0.1, mid / Math.max(1, r.width));
  };
  const addSticker = (k) => {
    const s = { k, x: 0.5 + (Math.random() - 0.5) * 0.3, y: centerY() + (Math.random() - 0.5) * 0.2, r: Math.round((Math.random() - 0.5) * 24), s: 1 };
    const list = pageRef.current.mine.stickers.concat([s]);
    setMine({ stickers: list });
    setSel({ layer: "mine", idx: list.length - 1 });
    setSheet("");
  };
  const addText = (m) => {
    const t = { id: newId(), m: m.slice(0, 200), x: 0.5, y: centerY(), r: -3, s: 1 };
    const list = pageRef.current.mine.texts.concat([t]);
    setMine({ texts: list });
    setSel({ layer: "text", idx: list.length - 1 });
    setSheet("");
  };
  const layerList = (layer) => (layer === "arr" ? pageRef.current.arr.stickers : layer === "mine" ? pageRef.current.mine.stickers : pageRef.current.mine.texts);
  const putLayer = (layer, list) => {
    if (layer === "arr") setArr({ stickers: list });
    else if (layer === "mine") setMine({ stickers: list });
    else setMine({ texts: list });
  };
  const tweak = (fn) => {
    if (!sel) return;
    const list = layerList(sel.layer).slice();
    if (!list[sel.idx]) return;
    list[sel.idx] = fn({ ...list[sel.idx] });
    putLayer(sel.layer, list);
  };
  const dropSel = () => {
    if (!sel) return;
    putLayer(
      sel.layer,
      layerList(sel.layer).filter((_, i) => i !== sel.idx)
    );
    setSel(null);
  };
  const raiseSel = () => {
    if (!sel) return;
    const list = layerList(sel.layer).slice();
    const [it] = list.splice(sel.idx, 1);
    list.push(it);
    putLayer(sel.layer, list);
    setSel({ layer: sel.layer, idx: list.length - 1 });
  };
  // 按住挪：手指挪多少，照纸的宽折成几成
  const drag = useRef(null);
  const onStickerDown = (e, layer, idx) => {
    e.stopPropagation();
    const el = sheetRef.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    const it = layerList(layer)[idx];
    if (!it) return;
    setSel({ layer, idx });
    drag.current = { layer, idx, x0: e.clientX, y0: e.clientY, sx: it.x, sy: it.y, w, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (x) {}
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) / d.w;
    const dy = (e.clientY - d.y0) / d.w;
    if (Math.abs(dx) + Math.abs(dy) > 0.004) d.moved = true;
    const list = layerList(d.layer).slice();
    if (!list[d.idx]) return;
    list[d.idx] = { ...list[d.idx], x: Math.min(1.05, Math.max(-0.05, d.sx + dx)), y: Math.max(0, d.sy + dy) };
    // 挪的时候只改画面，松手再存
    const p = pageRef.current;
    const next = d.layer === "arr" ? { ...p, arr: { ...p.arr, stickers: list } } : d.layer === "mine" ? { ...p, mine: { ...p.mine, stickers: list } } : { ...p, mine: { ...p.mine, texts: list } };
    pageRef.current = next;
    setPage(next);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved) commit(pageRef.current);
  };

  // ---- 版式、风格 ----
  const setLook = (patch) => commit({ ...pageRef.current, ...patch });
  const dice = (what) => {
    const p = pageRef.current;
    if (what === "layout") setLook({ layout: roll(LAYOUT_KEYS, p.layout) });
    else if (what === "style") setLook({ style: roll(STYLE_KEYS, p.style) });
    else setLook({ layout: roll(LAYOUT_KEYS, p.layout), style: roll(STYLE_KEYS, p.style) });
  };

  // ---- 天气 ----
  const fetchWx = async (pg, city, quiet = false) => {
    setBusy("wx");
    try {
      const wx = await api.weather(city, day);
      if (gone.current) return;
      const base = pageRef.current || pg; // 取的工夫里她又改了的，照改过的存
      if (quiet && fresh.current) {
        // 头一回点开顺手取的：摆上，不存
        pageRef.current = { ...pageRef.current, wx };
        setPage(pageRef.current);
      } else commit({ ...base, wx }, true);
      if (!quiet) say(`取到了：${wxLine(wx)}`);
    } catch (e) {
      if (!quiet) say(`天气没取到（${String(e.message || e).slice(0, 30)}）`);
    }
    setBusy("");
  };

  // ---- 他排 ----
  const askHim = async (wish) => {
    setSheet("");
    setBusy("him");
    try {
      const p = pageRef.current;
      const r = await api.arrange(day, p, mats, wish);
      if (gone.current) return;
      // 他挑的聊天里的照片：另存一份
      const photos = [];
      for (const x of r.arr.photos) {
        if (x.chat) {
          try {
            const id = await adoptChat(x.chat);
            photos.push({ id, role: x.role, note: x.note, from: x.chat });
          } catch (e) {}
        } else photos.push({ id: x.id, role: x.role, note: x.note });
      }
      // 她原来放的（连等他的工夫里新放的）、他这回没挑的照片：图删掉（他挑了的另算）
      const keepIds = new Set(photos.map((x) => x.id));
      pageRef.current.arr.photos.forEach((x) => !keepIds.has(x.id) && api.dropImg(x.id));
      const next = { ...pageRef.current, arr: { ...r.arr, photos }, layout: r.layout || pageRef.current.layout, style: r.style || pageRef.current.style };
      commit(next, true);
      if (r.note) {
        const ns = await api.addNote(day, { id: newId(), who: "him", text: r.note.text, at: Date.now(), part: r.note.part });
        if (ns) setNotes(ns);
      }
      say("他排好了");
    } catch (e) {
      say(`没排成（${String(e.message || e).slice(0, 40)}）`);
    }
    setBusy("");
  };

  // ---- 批注 ----
  // 加一条、删一条都现读现写（见 App.jsx 的 addJzNote）：他翻日记时刚留的那条不会被这边手里的旧单子盖掉
  const addNote = async (text, part) => {
    const t = text.trim().slice(0, NOTE_MAX);
    if (!t) return;
    const ns = await api.addNote(day, { id: newId(), who: "her", text: t, at: Date.now(), part: part || "" });
    if (ns) setNotes(ns);
  };
  const dropNote = async (id) => {
    const ns = await api.dropNote(day, id);
    if (ns) setNotes(ns);
  };

  // ---- 删掉这一页 ----
  const [armed, setArmed] = useState(false);
  const deletePage = async () => {
    if (!armed) return setArmed(true);
    gone.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    pageRef.current.arr.photos.forEach((x) => api.dropImg(x.id));
    pageRef.current = null;
    await api.savePage(day, null);
    onBack();
  };

  if (!page || !v) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center kfs-jz" style={{ background: T.bg, color: T.inkSoft, fontSize: 13 }}>
        翻开这一页……
      </div>
    );
  }

  const shown = partsShown(v);
  const empty = !v.has("title") && !v.has("hero") && !v.has("quote") && !v.has("body") && !v.has("her") && !v.has("him") && !v.has("pen") && !v.has("food");

  // ---- 冒出来的那几张 ----
  const partSheet = () => {
    const k = focus;
    const acts = [];
    if (TEXT_PARTS.includes(k)) acts.push(["改字", () => setSheet("edit")]);
    if (["hero", "pair", "food", "more", "cap"].includes(k)) acts.push(["换照片", () => setSheet("stuff")]);
    if (k === "quote") acts.push(["挑原话", () => setSheet("stuff")]);
    if (k === "her" || k === "him") acts.push(["日记在闲笔集里改", () => setSheet("")]);
    if (k === "wx") {
      acts.push(["天气在哪儿", () => setSheet("city")]);
      if (cfg && cfg.city) acts.push(["重新取一回", () => (setSheet(""), fetchWx(null, cfg.city))]);
    }
    if (k !== "head") acts.push(["藏起来", () => (hidePart(k), setSheet(""), say(`“${partName(k)}”藏起来了，“更多”里能拿回来`))]);
    acts.push(["留一条批注", () => setSheet("notes")]);
    return (
      <Sheet title={partName(k)} onClose={() => setSheet("")}>
        <div className="flex flex-col" style={{ gap: 8 }}>
          {acts.map(([t, fn]) => (
            <button key={t} onClick={fn} className="kfs-tap kfs-jz-act text-left" style={{ ...glass(0.5, 12), borderRadius: 16, padding: "13px 16px", fontSize: 15, color: T.ink }}>
              {t}
            </button>
          ))}
        </div>
      </Sheet>
    );
  };

  const pickSheet = (what) => {
    const list = what === "layout" ? LAYOUTS : STYLES;
    const cur = what === "layout" ? page.layout : page.style;
    return (
      <Sheet title={what === "layout" ? "版式" : "风格"} onClose={() => setSheet("")}>
        <div className="flex flex-col" style={{ gap: 8 }}>
          {list.map((x) => (
            <button
              key={x.k}
              onClick={() => {
                setLook(what === "layout" ? { layout: x.k } : { style: x.k });
                setSheet("");
              }}
              className={`kfs-tap text-left kfs-jz-pick ${x.k === cur ? "on" : ""}`}
              data-k={x.k}
              style={{ ...glass(x.k === cur ? 0.8 : 0.45, 12), borderRadius: 16, padding: "11px 16px", border: x.k === cur ? `1px solid ${T.dai}` : HAIRLINE }}
            >
              <div style={{ fontSize: 15, color: T.ink }}>{x.t}</div>
              <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{x.d}</div>
            </button>
          ))}
        </div>
      </Sheet>
    );
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col kfs-jz" style={{ background: T.bg }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {/* 顶上 */}
      <div className="relative z-10 flex items-center" style={{ ...glass(0.6, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}>
        <IconBtn onClick={onBack} label="返回">
          <Icon name="chevL" />
        </IconBtn>
        <div className="flex-1 text-center" style={{ fontFamily: SERIF, fontSize: 16, letterSpacing: "0.08em", color: T.ink }}>
          {H.cn}的手帐
        </div>
        <button onClick={() => (setFocus(""), setSheet("notes"))} aria-label="批注" className="kfs-tap kfs-jz-notes flex items-center" style={{ height: 40, padding: "0 12px", borderRadius: 999, gap: 4, color: T.inkSoft, fontSize: 13 }}>
          <Icon name="pen" size={17} />
          {notes.length ? <span>{notes.length}</span> : null}
        </button>
      </div>

      {/* 两根轴 */}
      <div className="relative z-10" style={{ margin: "8px 12px 0" }}>
        <div className="flex" style={{ ...glass(0.5, 20), borderRadius: 20, padding: 4, gap: 4 }}>
          <button onClick={() => setSheet("layout")} className="kfs-tap kfs-jz-layout flex-1 text-left" style={{ padding: "7px 12px", borderRadius: 16 }}>
            <div style={{ fontSize: 10.5, color: T.inkSoft, letterSpacing: "0.1em" }}>版式</div>
            <div style={{ fontSize: 14.5, color: T.ink }}>{layoutOf(page.layout).t}</div>
          </button>
          <div style={{ width: 1, background: HAIR, margin: "8px 0" }} />
          <button onClick={() => setSheet("style")} className="kfs-tap kfs-jz-style flex-1 text-left" style={{ padding: "7px 12px", borderRadius: 16 }}>
            <div style={{ fontSize: 10.5, color: T.inkSoft, letterSpacing: "0.1em" }}>风格</div>
            <div style={{ fontSize: 14.5, color: T.ink }}>{styleOf(page.style).t}</div>
          </button>
        </div>
        <div className="flex items-center" style={{ gap: 6, marginTop: 6 }}>
          {[
            ["换版式", "layout"],
            ["换风格", "style"],
            ["全洗牌", "both"],
          ].map(([t, w]) => (
            <button key={w} onClick={() => dice(w)} className={`kfs-tap kfs-jz-dice-${w} flex items-center`} style={{ ...chip, gap: 5, padding: "6px 11px", fontSize: 12.5 }}>
              <Icon name="dice" size={15} />
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 纸 */}
      <div className="relative flex-1 overflow-y-auto kfs-scroll kfs-jz-scroll" style={{ padding: "12px 12px 120px" }} onClick={() => setSel(null)}>
        {busy === "him" ? (
          <div className="text-center kfs-jz-busy" style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 10px" }}>
            光义在排……
          </div>
        ) : null}
        <JzSheet
          v={v}
          notes={noteMap}
          editing
          emoji={emoji}
          sheetRef={sheetRef}
          selected={sel}
          onStickerDown={onStickerDown}
          onPart={(k) => {
            setSel(null);
            setFocus(k);
            setSheet("part");
          }}
        />
        {empty ? (
          <div className="text-center kfs-jz-empty" style={{ ...glass(0.5, 16), borderRadius: 20, padding: "16px 18px", marginTop: 12, fontSize: 13, lineHeight: 1.7, color: T.inkSoft }}>
            这一页还空着。点底下“排的东西”自己挑照片、原话、写标题；或者点“让光义排”。
          </div>
        ) : null}
      </div>

      {/* 选中了一张贴纸：转、大小、删 */}
      {sel ? (
        <div className="absolute z-20 flex items-center justify-center kfs-jz-selbar" style={{ left: 12, right: 12, bottom: "calc(86px + env(safe-area-inset-bottom))", gap: 6 }}>
          <div className="flex" style={{ ...glass(0.78, 20), borderRadius: 18, padding: 4, gap: 2 }}>
            {[
              ["左转", () => tweak((s) => ({ ...s, r: s.r - 12 }))],
              ["右转", () => tweak((s) => ({ ...s, r: s.r + 12 }))],
              ["小", () => tweak((s) => ({ ...s, s: Math.max(0.4, Math.round((s.s - 0.15) * 100) / 100) }))],
              ["大", () => tweak((s) => ({ ...s, s: Math.min(3, Math.round((s.s + 0.15) * 100) / 100) }))],
              ["顶上", raiseSel],
              ["删掉", dropSel],
            ].map(([t, fn]) => (
              <button key={t} onClick={fn} className="kfs-tap" style={{ padding: "8px 11px", borderRadius: 14, fontSize: 13, color: t === "删掉" ? T.red : T.ink }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* 底下一排 */}
      <div className="absolute z-10 flex kfs-jz-dock" style={{ left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))", ...glass(0.7, 26), borderRadius: 24, padding: "2px 4px" }}>
        <DockBtn icon="sticker" label="贴纸" onClick={() => setSheet("stickers")} cls="kfs-jz-addsticker" />
        <DockBtn icon="pen" label="写字" onClick={() => setSheet("text")} cls="kfs-jz-addtext" />
        <DockBtn icon="doc" label="排的东西" onClick={() => setSheet("stuff")} cls="kfs-jz-stuff" />
        <DockBtn icon="smile" label={busy === "him" ? "在排……" : "让光义排"} onClick={() => setSheet("him")} busy={busy === "him"} cls="kfs-jz-him" />
        <DockBtn icon="sliders" label="更多" onClick={() => (setArmed(false), setSheet("more"))} cls="kfs-jz-more" />
      </div>

      {toast ? (
        <div className="absolute z-50 left-0 right-0 flex justify-center pointer-events-none kfs-jz-toast" style={{ top: "calc(120px + env(safe-area-inset-top))" }}>
          <div style={{ ...glass(0.85, 16), borderRadius: 999, padding: "8px 16px", fontSize: 13, color: T.ink }}>{toast}</div>
        </div>
      ) : null}

      {sheet === "part" ? partSheet() : null}
      {sheet === "layout" ? pickSheet("layout") : null}
      {sheet === "style" ? pickSheet("style") : null}
      {sheet === "edit" ? <EditSheet k={focus} v={v} onClose={() => setSheet("")} onSave={(val) => (editText(focus, val), setSheet(""))} /> : null}
      {sheet === "stickers" ? <StickerSheet emoji={emoji} onPick={addSticker} onClose={() => setSheet("")} /> : null}
      {sheet === "text" ? <TextSheet onAdd={addText} onClose={() => setSheet("")} /> : null}
      {sheet === "stuff" ? (
        <StuffSheet
          page={page}
          v={v}
          mats={mats}
          imgs={imgs}
          matImgs={matImgs}
          loadMatImg={async (id) => {
            if (matImgs[id] !== undefined) return;
            const d = await api.chatImg(id);
            setMatImgs((m) => ({ ...m, [id]: d || false }));
          }}
          onText={editText}
          onAddChat={addPhotoFromChat}
          onAddFile={addPhotoFromFile}
          onRole={setRole}
          onDrop={dropPhoto}
          onQuote={toggleQuote}
          onClose={() => setSheet("")}
        />
      ) : null}
      {sheet === "him" ? <HimSheet page={page} onGo={askHim} onClose={() => setSheet("")} /> : null}
      {sheet === "notes" ? <NotesSheet notes={notes} shown={shown} part={focus} onAdd={addNote} onDrop={dropNote} onClose={() => setSheet("")} /> : null}
      {sheet === "city" ? (
        <CitySheet
          cfg={cfg}
          api={api}
          onPick={async (city) => {
            const c = { ...(cfg || {}), city };
            setCfg(c);
            await api.saveCfg(c);
            setSheet("");
            fetchWx(null, city);
          }}
          onClose={() => setSheet("")}
        />
      ) : null}
      {sheet === "more" ? (
        <Sheet title="更多" onClose={() => setSheet("")}>
          <div className="flex flex-col" style={{ gap: 8 }}>
            <button onClick={() => setSheet("city")} className="kfs-tap text-left kfs-jz-city" style={{ ...glass(0.5, 12), borderRadius: 16, padding: "13px 16px", fontSize: 15, color: T.ink }}>
              天气在哪儿{cfg && cfg.city ? `：${cfg.city.name}` : "（还没填）"}
            </button>
            {cfg && cfg.city ? (
              <button onClick={() => (setSheet(""), fetchWx(null, cfg.city))} disabled={busy === "wx"} className="kfs-tap text-left" style={{ ...glass(0.5, 12), borderRadius: 16, padding: "13px 16px", fontSize: 15, color: T.ink }}>
                {busy === "wx" ? "在取天气……" : page.wx ? `重新取天气（${wxLine(page.wx)}）` : "取这一天的天气"}
              </button>
            ) : null}
            {page.mine.hide.length ? (
              <div style={{ ...glass(0.5, 12), borderRadius: 16, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>藏起来的（点一下拿回来）</div>
                <div className="flex flex-wrap" style={{ gap: 6 }}>
                  {page.mine.hide.map((k) => (
                    <button key={k} onClick={() => showPart(k)} className="kfs-tap kfs-jz-unhide" style={{ ...chip, fontSize: 13 }}>
                      {partName(k)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.6, padding: "4px 4px 0" }}>
              表情、小动物这几栏贴纸是微软的 Fluent Emoji（MIT）；胶带、印章、手绘、颜文字是开封府自己画的。天气来自 Open-Meteo，只寄城市的经纬度和日子。
            </div>
            <button onClick={deletePage} className="kfs-tap text-left kfs-jz-delete" style={{ ...glass(0.5, 12), borderRadius: 16, padding: "13px 16px", fontSize: 15, color: T.red }}>
              {armed ? "再点一次，删掉这一页手帐（日记和批注不删）" : "删掉这一页手帐"}
            </button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

// ---------- 改字 ----------
function EditSheet({ k, v, onSave, onClose }) {
  const isPen = k === "pen";
  const [text, setText] = useState(isPen ? (v.pen && v.pen.text) || "" : k === "cap" ? v.cap : v[k] || "");
  const [margin, setMargin] = useState(isPen ? (v.pen && v.pen.margin) || "" : "");
  const max = k === "title" ? 40 : k === "cap" ? 80 : k === "pen" ? 300 : 2000;
  return (
    <Sheet title={`改${partName(k)}`} onClose={onClose}>
      <textarea className="kfs-field kfs-jz-edit" value={text} onChange={(e) => setText(e.target.value.slice(0, max))} rows={k === "body" ? 6 : 3} style={{ ...field, resize: "none", lineHeight: 1.6 }} />
      {isPen ? (
        <>
          <div style={{ fontSize: 12, color: T.inkSoft, margin: "10px 0 6px" }}>要划线的字用 [[ ]] 包起来；页边一句（可以不写）</div>
          <input className="kfs-field" value={margin} onChange={(e) => setMargin(e.target.value.slice(0, 40))} style={field} />
        </>
      ) : null}
      <div className="flex" style={{ gap: 8, marginTop: 12 }}>
        <button onClick={() => onSave(isPen ? (text.trim() ? { text: text.trim(), margin: margin.trim() } : null) : text.trim())} className="kfs-tap kfs-jz-save" style={chipPrimary}>
          好了
        </button>
        <button onClick={onClose} className="kfs-tap" style={chip}>
          取消
        </button>
      </div>
    </Sheet>
  );
}

// ---------- 贴纸栏 ----------
function StickerSheet({ emoji, onPick, onClose }) {
  const [tab, setTab] = useState(TABS[0].k);
  const [carve, setCarve] = useState("");
  const cur = TABS.find((t) => t.k === tab) || TABS[0];
  return (
    <Sheet title="贴纸" onClose={onClose}>
      <div className="flex overflow-x-auto kfs-scroll" style={{ gap: 6, marginBottom: 12, paddingBottom: 2 }}>
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className="kfs-tap flex-shrink-0 kfs-jz-tab" style={{ ...chip, fontSize: 13, ...(t.k === tab ? { background: T.daiGrad, color: T.onDai } : {}) }}>
            {t.t}
          </button>
        ))}
      </div>
      {tab === "印章" ? (
        <div className="flex" style={{ gap: 8, marginBottom: 12 }}>
          <input className="kfs-field" value={carve} onChange={(e) => setCarve(Array.from(e.target.value.replace(/\s/g, "")).slice(0, 4).join(""))} placeholder="自己刻一枚（最多四个字）" style={{ ...field, flex: 1 }} />
          <button onClick={() => carve && onPick(`s:${carve}`)} className="kfs-tap kfs-jz-carve" style={chipPrimary}>
            刻
          </button>
        </div>
      ) : null}
      <div className="jz-wrap">
        <div className="grid" style={{ gridTemplateColumns: tab === "颜文字" ? "repeat(2, 1fr)" : tab === "胶带" ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: 8 }}>
          {cur.items.map((it) => (
            <button key={it.k} onClick={() => onPick(it.k)} className="kfs-tap kfs-jz-sticker flex flex-col items-center" data-k={it.k} style={{ ...glass(0.45, 10), borderRadius: 14, padding: "8px 4px 6px", gap: 4, color: T.ink, fontSize: tab === "颜文字" ? 15 : 10.5, minHeight: 64, justifyContent: "center" }}>
              {tab === "颜文字" ? (
                <span>{it.t}</span>
              ) : (
                <>
                  <span style={{ display: "block", width: tab === "胶带" ? "84%" : 38, color: tab === "手绘" ? T.dai : undefined }}>
                    <StickerArt k={it.k} emoji={emoji} />
                  </span>
                  <span style={{ color: T.inkSoft }}>{it.t}</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

// ---------- 写字 ----------
function TextSheet({ onAdd, onClose }) {
  const [t, setT] = useState("");
  return (
    <Sheet title="在页上写几个字" onClose={onClose}>
      <input className="kfs-field kfs-jz-textin" value={t} onChange={(e) => setT(e.target.value.slice(0, 200))} placeholder="写什么都行，写完按住能挪" style={field} />
      <div className="flex" style={{ gap: 8, marginTop: 12 }}>
        <button onClick={() => t.trim() && onAdd(t.trim())} className="kfs-tap kfs-jz-textok" style={chipPrimary}>
          贴上去
        </button>
      </div>
    </Sheet>
  );
}

// ---------- 排的东西：标题、照片、原话、正文、红笔 ----------
function StuffSheet({ page, v, mats, imgs, matImgs, loadMatImg, onText, onAddChat, onAddFile, onRole, onDrop, onQuote, onClose }) {
  const fileRef = useRef(null);
  const used = new Set(page.arr.photos.map((x) => x.from).filter(Boolean));
  const [title, setTitle] = useState(v.title);
  const [body, setBody] = useState(v.body);
  const [pen, setPen] = useState((v.pen && v.pen.text) || "");
  useEffect(() => {
    mats.photos.forEach((p) => loadMatImg(p.imgId));
  }, []);
  const label = { fontSize: 12, color: T.inkSoft, margin: "16px 0 8px" };
  const picked = new Set(page.arr.quotes.map((q) => q.id));
  return (
    <Sheet title="排的东西" onClose={onClose}>
      <div style={{ ...label, marginTop: 0 }}>标题</div>
      <input className="kfs-field kfs-jz-title-in" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 40))} onBlur={() => title !== v.title && onText("title", title.trim())} placeholder="这一天叫什么" style={field} />

      <div style={label}>照片（{page.arr.photos.length}/{PHOTO_MAX}）</div>
      {page.arr.photos.length ? (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {page.arr.photos.map((x) => (
            <div key={x.id} className="flex items-center kfs-jz-photo-row" style={{ gap: 10 }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", background: fill(0.5), flexShrink: 0 }}>{imgs[x.id] ? <img src={imgs[x.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</div>
              <div className="flex flex-wrap flex-1" style={{ gap: 4 }}>
                {PHOTO_ROLES.map((r) => (
                  <button key={r} onClick={() => onRole(x.id, r)} className="kfs-tap" style={{ ...chip, padding: "4px 9px", fontSize: 12, ...(x.role === r ? { background: T.daiGrad, color: T.onDai } : {}) }}>
                    {ROLE_NAME[r]}
                  </button>
                ))}
              </div>
              <button onClick={() => onDrop(x.id)} aria-label="拿掉这张" className="kfs-tap" style={{ color: T.inkSoft, padding: 6 }}>
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {mats.photos.length ? (
        <>
          <div style={{ fontSize: 11.5, color: T.inkFaint, margin: "10px 0 6px" }}>这一天聊天里的照片（点一下放上去）</div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {mats.photos.map((p) => (
              <button key={p.imgId} onClick={() => !used.has(p.imgId) && onAddChat(p.imgId)} className="kfs-tap kfs-jz-matphoto" style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: fill(0.5), opacity: used.has(p.imgId) ? 0.4 : 1 }}>
                {matImgs[p.imgId] ? <img src={matImgs[p.imgId]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                <span style={{ position: "absolute", left: 4, bottom: 3, fontSize: 10, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>{p.t}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <button onClick={() => fileRef.current && fileRef.current.click()} className="kfs-tap kfs-jz-addfile" style={{ ...chip, marginTop: 10 }}>
        从相册添一张
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => (onAddFile(e.target.files && e.target.files[0]), (e.target.value = ""))} />

      <div style={label}>
        聊天里的原话（{page.arr.quotes.length}/{QUOTE_MAX}，照原话摆，一个字不改）
      </div>
      {mats.quotes.length ? (
        <div className="flex flex-col kfs-jz-quotes" style={{ gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {mats.quotes.map((q) => (
            <button key={q.id} onClick={() => onQuote(q)} className="kfs-tap text-left kfs-jz-quote-pick" data-on={picked.has(q.id) ? "1" : undefined} style={{ ...glass(picked.has(q.id) ? 0.85 : 0.4, 10), borderRadius: 12, padding: "8px 12px", fontSize: 13, color: T.ink, border: picked.has(q.id) ? `1px solid ${T.dai}` : HAIRLINE }}>
              <span style={{ fontSize: 11, color: T.inkSoft, marginRight: 6 }}>
                {q.w === "her" ? "卿卿" : "光义"} {q.t}
              </span>
              {q.p.length > 90 ? q.p.slice(0, 90) + "…" : q.p}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: T.inkFaint }}>这一天没在开封府聊天。</div>
      )}

      <div style={label}>正文</div>
      <textarea className="kfs-field kfs-jz-body-in" value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} onBlur={() => body !== v.body && onText("body", body.trim())} rows={4} placeholder="想写就写几句（日记照旧在闲笔集里写）" style={{ ...field, resize: "none", lineHeight: 1.6 }} />
      <div style={label}>红笔（要划线的字用 [[ ]] 包起来，可以不写）</div>
      <input className="kfs-field" value={pen} onChange={(e) => setPen(e.target.value.slice(0, 300))} onBlur={() => pen !== ((v.pen && v.pen.text) || "") && onText("pen", pen.trim() ? { text: pen.trim(), margin: (v.pen && v.pen.margin) || "" } : null)} style={field} />
    </Sheet>
  );
}

// ---------- 让他排 ----------
function HimSheet({ page, onGo, onClose }) {
  const [wish, setWish] = useState("");
  const kept = page.mine.hide.length || page.mine.texts.length || page.mine.stickers.length || Object.keys(page.mine.edit).length;
  return (
    <Sheet title="让光义排这一天" onClose={onClose}>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: T.inkSoft }}>
        他会看这一天的照片、聊天、你们俩的日记，挑版式和风格、主照片和几句原话，起个标题、写一小段。
        {kept ? "你藏起来的、自己改的字、写的字、贴的贴纸都留着。" : ""}
        {page.arr.by === "him" ? "（这一页他排过一回，再排会换成新的一版。）" : page.arr.photos.length || page.arr.quotes.length ? "（你挑的照片和原话会换成他挑的。）" : ""}
      </div>
      <div style={{ fontSize: 12, color: T.inkSoft, margin: "14px 0 6px" }}>想要什么样（可以不写）</div>
      <input className="kfs-field kfs-jz-wish" value={wish} onChange={(e) => setWish(e.target.value.slice(0, 120))} placeholder="比如：要那张饭、标题凶一点" style={field} />
      <div className="flex" style={{ gap: 8, marginTop: 14 }}>
        <button onClick={() => onGo(wish.trim())} className="kfs-tap kfs-jz-go" style={chipPrimary}>
          交给他
        </button>
        <button onClick={onClose} className="kfs-tap" style={chip}>
          再想想
        </button>
      </div>
    </Sheet>
  );
}

// ---------- 批注 ----------
function NotesSheet({ notes, shown, part, onAdd, onDrop, onClose }) {
  const [text, setText] = useState("");
  const [at, setAt] = useState(part || "");
  const [armed, setArmed] = useState(""); // 点过一下“删掉”的那一条
  return (
    <Sheet title="批注" onClose={onClose}>
      {notes.length ? (
        <div className="flex flex-col kfs-jz-notelist" style={{ gap: 8, marginBottom: 14 }}>
          {notes.map((n) => (
            <div key={n.id} className="kfs-jz-note" data-who={n.who} style={{ ...glass(0.5, 12), borderRadius: 14, padding: "10px 12px", borderLeft: `3px solid ${n.who === "her" ? "#e3c35a" : T.dai}` }}>
              <div className="flex items-center justify-between" style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>
                <span>
                  {n.who === "her" ? "卿卿" : "光义"} · {fmtAt(n.at)}
                  {n.part ? ` · 贴在${partName(n.part)}旁边` : ""}
                </span>
                <button onClick={() => (armed === n.id ? (onDrop(n.id), setArmed("")) : setArmed(n.id))} className="kfs-tap kfs-jz-notedrop" style={{ color: armed === n.id ? T.red : T.inkFaint, fontSize: 11 }}>
                  {armed === n.id ? "再点一次删掉" : "删掉"}
                </button>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink, whiteSpace: "pre-wrap" }}>{n.text}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: T.inkFaint, marginBottom: 12 }}>还没有批注。他翻日记的时候看得到这里，也能留。</div>
      )}
      <div className="flex flex-wrap" style={{ gap: 5, marginBottom: 8 }}>
        {[""].concat(shown.filter((k) => k !== "cap")).map((k) => (
          <button key={k || "page"} onClick={() => setAt(k)} className="kfs-tap" style={{ ...chip, padding: "4px 9px", fontSize: 11.5, ...(at === k ? { background: T.daiGrad, color: T.onDai } : {}) }}>
            {k ? partName(k) : "整页"}
          </button>
        ))}
      </div>
      <textarea className="kfs-field kfs-jz-notein" value={text} onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX))} rows={3} placeholder="留一句" style={{ ...field, resize: "none", lineHeight: 1.6 }} />
      <div className="flex" style={{ gap: 8, marginTop: 10 }}>
        <button
          onClick={() => {
            if (!text.trim()) return;
            onAdd(text, at);
            setText("");
          }}
          className="kfs-tap kfs-jz-noteok"
          style={chipPrimary}
        >
          留下
        </button>
      </div>
    </Sheet>
  );
}

// ---------- 天气在哪儿 ----------
function CitySheet({ cfg, api, onPick, onClose }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const find = async () => {
    setErr("");
    try {
      const r = await api.geocode(q);
      setList(r);
      if (!r.length) setErr("没找到，换个写法试试（中文、英文都行）");
    } catch (e) {
      setErr("这会儿找不了（网不好？）");
    }
  };
  return (
    <Sheet title="天气在哪儿" onClose={onClose}>
      <div style={{ fontSize: 12.5, lineHeight: 1.7, color: T.inkSoft, marginBottom: 10 }}>
        填一个城市，手帐上的天气照它取（Open-Meteo，只寄城市的经纬度和日子）。只记在你这儿，换了城市以后掺的页照新的取。{cfg && cfg.city ? ` 现在是：${cfg.city.name}。` : ""}
      </div>
      <div className="flex" style={{ gap: 8 }}>
        <input className="kfs-field kfs-jz-cityin" value={q} onChange={(e) => setQ(e.target.value.slice(0, 40))} onKeyDown={(e) => e.key === "Enter" && find()} placeholder="城市" style={{ ...field, flex: 1 }} />
        <button onClick={find} className="kfs-tap kfs-jz-cityfind" style={chipPrimary}>
          找
        </button>
      </div>
      {err ? <div style={{ fontSize: 12, color: T.red, marginTop: 8 }}>{err}</div> : null}
      {list && list.length ? (
        <div className="flex flex-col" style={{ gap: 6, marginTop: 10 }}>
          {list.map((c) => (
            <button key={`${c.lat},${c.lon}`} onClick={() => onPick(c)} className="kfs-tap text-left kfs-jz-cityitem" style={{ ...glass(0.5, 10), borderRadius: 12, padding: "10px 12px", fontSize: 14, color: T.ink }}>
              {c.name}
              <span style={{ fontSize: 11.5, color: T.inkSoft, marginLeft: 6 }}>{c.where}</span>
            </button>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}

// 闲笔集里那一天的卡片：有手帐的摆一张小样，没有的摆“掺一页手帐”
export function JzCard({ page, notes = [], heroSrc, onOpen }) {
  if (!page) {
    return (
      <button onClick={onOpen} className="kfs-tap kfs-jz-open flex items-center" style={{ ...chip, gap: 6 }}>
        <Icon name="sticker" size={16} />
        掺一页手帐
      </button>
    );
  }
  const title = (page.mine.edit && page.mine.edit.title) || page.arr.title || "（还没起标题）";
  return (
    <button onClick={onOpen} className="kfs-tap kfs-jz-open w-full flex items-center text-left" style={{ ...glass(0.5, 14), borderRadius: 18, padding: 10, gap: 12 }}>
      <div style={{ width: 54, height: 54, borderRadius: 12, overflow: "hidden", background: fill(0.6), flexShrink: 0 }}>{heroSrc ? <img src={heroSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</div>
      <div className="flex-1 min-w-0">
        <div style={{ fontFamily: SERIF, fontSize: 15, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
          {layoutOf(page.layout).t} × {styleOf(page.style).t}
          {page.arr.by === "him" ? " · 他排的" : ""}
          {notes.length ? ` · 批注 ${notes.length}` : ""}
        </div>
      </div>
      <Icon name="chevR" size={17} color={T.inkSoft} />
    </button>
  );
}
