import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { pad, WEEK, START, dayNumber } from "../days.js";
import { dayKeyOf, ymKeyOf, parseDayKey, MOODS, moodOf, heatLevel, monthCells } from "../diary.js";
import { SERIF, T, chip, chipPrimary, field, fill, HAIR, HAIRLINE } from "../ui/style.js";
import { Glows } from "../ui/parts.jsx";
import { TongyeFrame } from "../tongye/TongyeFrame.jsx";
import { TyCard } from "../tongye/TyCard.jsx";
import { NOTE_MAX } from "../jz/model.js";
import { clip } from "../recap.js";
import { mountDeck } from "./diaryDeck.js";
import { Dial, NEEDLE, branchOf } from "./Dial.jsx";

// 那一天的批注（同页那一本里留的、他翻日记的时候留的，都在这儿；见 tongye/host.js）：一条一条摆着，底下能再留一条；
// 长按不好找，删就在每一条后头摆一个“删”，点两下才删（跟删日记一样）
function DayNotes({ notes, onAdd, onDrop }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState("");
  return (
    <div className="kfs-day-notes" style={{ marginTop: 12 }}>
      {notes.map((n) => (
        <div key={n.id} className="kfs-day-note" data-who={n.who} style={{ fontSize: 13.5, lineHeight: 1.65, color: T.ink, padding: "8px 0 8px 10px", borderLeft: `2px solid ${n.who === "her" ? "#e3c35a" : T.dai}`, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: T.inkSoft, marginRight: 6 }}>{n.who === "her" ? "卿卿批" : "光义批"}</span>
          {n.text}
          <button
            onClick={() => (armed === n.id ? (onDrop(n.id), setArmed("")) : setArmed(n.id))}
            className="kfs-tap kfs-day-notedrop"
            style={{ fontSize: 11, color: armed === n.id ? T.red : T.inkFaint, marginLeft: 8 }}
          >
            {armed === n.id ? "再点一次删掉" : "删"}
          </button>
        </div>
      ))}
      {open ? (
        <div style={{ marginTop: 10 }}>
          <textarea className="kfs-field kfs-day-notein" value={text} onChange={(e) => setText(clip(e.target.value, NOTE_MAX))} rows={2} placeholder="在这一天留一句" style={{ ...field, resize: "none", lineHeight: 1.6 }} />
          <div className="flex" style={{ gap: 8, marginTop: 8 }}>
            <button
              onClick={() => {
                if (!text.trim()) return;
                onAdd(text.trim());
                setText("");
                setOpen(false);
              }}
              className="kfs-tap kfs-day-noteok"
              style={chipPrimary}
            >
              留下
            </button>
            <button onClick={() => setOpen(false)} className="kfs-tap" style={chip}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="kfs-tap kfs-day-noteadd" style={{ ...chip, marginTop: 10, fontSize: 12.5 }}>
          留一条批注
        </button>
      )}
    </div>
  );
}

function MoodChips({ value = [], onToggle, readOnly }) {
  return (
    <div className="flex flex-wrap" style={{ gap: 6 }}>
      {MOODS.filter((m) => !readOnly || value.includes(m.k)).map((m) => {
        const on = value.includes(m.k);
        return (
          <button
            key={m.k}
            disabled={readOnly}
            onClick={() => onToggle && onToggle(m.k)}
            className={readOnly ? "" : "kfs-tap"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              borderRadius: 999,
              fontSize: 12.5,
              color: on ? T.onDai : T.inkSoft,
              background: on ? T.daiGrad : fill(0.5),
              border: HAIRLINE,
            }}
          >
            <span style={{ fontSize: 13 }}>{m.e}</span>
            {m.t}
          </button>
        );
      })}
    </div>
  );
}

// 月历从哪个月起（往前划到这个月就到头）；今天要是比它还早，就只有今天这一个月
const FIRST = { y: 2026, m: 9 };
const HEAT = [0.05, 0.12, 0.22, 0.34, 0.48];
// 摆法（她在原型上调的；都是占整页宽、高的几成）：日晷的半径、圆心，月历左右留白
const LAY = { r: 0.55, cx: 0.8, cy: 0.21, left: 0.06, right: 0.07 };
const GAP = 7;
const LEGEND_H = 44; // 图例那一行连上面的线
const PEEK_H = 30; // 最底下那行小字占的（不算主屏幕底下那一条）：整块沉到底，小字贴着主屏幕底下那一条
const DIAL_OUT = 1.1; // 晷盘最外那圈节气画到半径的几倍（格子要躲开它）
const DIAL_GAP = 44; // 晷盘最外那圈和星期那一行之间留的白（她要两块隔开一段）

// 整页两页上下接着（手指怎么走见 diaryDeck.js）：
//   上面一页是月历，摆在背景上，没有顶栏、没有衬底的卡片：右上角一块日晷（Dial.jsx），左边竖着写年月，底下是日期的格子。
//   左右划格子、在晷盘上绕着圈拨、点晷盘上的地支，都是换月：格子跟着走，盘面跟着转（指针不动），年月的数字跟着换；
//   点一天是选中，选中了往上划（或者再点一下那一天）翻到下面一页：那一天的日记、手帐和批注；在那一页最顶上往下拉回月历。
// 左上角一个很淡的返回（照藏音匣、图画院那个），两页上都在，回侧栏。
export function DiaryPage({ now, onBack, loadMonth, saveEntry, loadDays, writeHis, jz = null }) {
  const todayKey = dayKeyOf(now);
  const ny = now.getFullYear();
  const nm = now.getMonth();
  const months = useMemo(() => {
    let y = FIRST.y;
    let m = FIRST.m;
    if (ny < y || (ny === y && nm < m)) {
      y = ny;
      m = nm;
    }
    const list = [];
    while (y < ny || (y === ny && m <= nm)) {
      list.push({ y, m });
      if (m === 11) {
        y += 1;
        m = 0;
      } else m += 1;
    }
    return list;
  }, [ny, nm]);
  const [at, setAt] = useState(months.length - 1); // 眼前是第几个月
  const [data, setData] = useState({}); // 年-月 → 那个月的日记
  const [counts, setCounts] = useState({});
  const [sel, setSel] = useState(todayKey);
  const [draft, setDraft] = useState(null);
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(null);
  // 闲笔集里掺的手帐（同页那一本，见 tongye/）：这一天有没有一页、几条批注；点开的是哪一天
  const [jzInfo, setJzInfo] = useState({ day: "", info: null, notes: [] }); // day：读的是哪一天（换了一天、还没读完的时候不摆上一天的）
  const [jzOpen, setJzOpen] = useState(null); // { day, mode, deps }
  const [jzTick, setJzTick] = useState(0);
  // 掺过手帐的那几天：日历格子左上角标一个 🏷️。点开手帐再出来（jzTick）重新看一遍
  const [jzDays, setJzDays] = useState(() => new Set());
  useEffect(() => {
    if (!jz || !jz.days) return;
    let alive = true;
    jz.days()
      .then((list) => alive && setJzDays(new Set(list || [])))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [jzTick]);
  useEffect(() => {
    if (!jz || !sel) return;
    let alive = true;
    (async () => {
      const [info, notes] = await Promise.all([jz.info(sel), jz.notes(sel)]);
      if (alive) setJzInfo({ day: sel, info, notes });
    })();
    return () => {
      alive = false;
    };
  }, [sel, jzTick]);
  // 那一本里哪一天变了（他排好了、正排着、没排成）：重看一遍（小卡片上的“光义正在排”跟着换）
  useEffect(() => (jz && jz.watch ? jz.watch(() => setJzTick((t) => t + 1)) : undefined), []);

  useEffect(() => {
    loadDays().then((c) => setCounts(c || {}));
  }, []);
  // 每个月的日记都取出来（从十月起，一个月一份，都在手机上）：格子要眼前这个月和它两边的，晷盘上的月亮要每个月的
  useEffect(() => {
    let alive = true;
    months.forEach((mm) => {
      const k = ymKeyOf(mm.y, mm.m);
      if (data[k]) return;
      loadMonth(k).then((d) => alive && setData((x) => (x[k] ? x : { ...x, [k]: d || {} })));
    });
    return () => {
      alive = false;
    };
  }, [at, months]);


  // ---- 两页怎么走（diaryDeck.js） ----
  const rootRef = useRef(null);
  const pagesRef = useRef(null);
  const calRef = useRef(null);
  const wrapRef = useRef(null);
  const monthsRef = useRef(null);
  const dayRef = useRef(null);
  const scRef = useRef(null);
  const yRef = useRef(null);
  const mRef = useRef(null);
  const dialRef = useRef(null);
  const diskRef = useRef(null);
  const moonRefs = useRef([]);
  const peekRef = useRef(null);
  const deck = useRef(null);
  const probeRef = useRef(null);
  // 整页多宽多高、主屏幕底下空出来的那一条多高（摆法照它们算，见 LAY）
  const [box, setBox] = useState(() => ({ W: window.innerWidth || 390, H: window.innerHeight || 844, sb: 0 }));
  useLayoutEffect(() => {
    const measure = () => {
      const r = rootRef.current;
      if (!r) return;
      const nb = { W: r.clientWidth || 390, H: r.clientHeight || 844, sb: (probeRef.current && probeRef.current.offsetHeight) || 0 };
      setBox((o) => (o.W === nb.W && o.H === nb.H && o.sb === nb.sb ? o : nb));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(rootRef.current);
    return () => ro && ro.disconnect();
  }, []);
  const live = useRef(null);
  // 换了一天（sel 是 null 就是没选）：上一天写到一半的、点了一下“删掉”的都不留，那一页回到最顶
  useLayoutEffect(() => {
    setDraft(null);
    setErr("");
    setArmed(null);
    if (scRef.current) scRef.current.scrollTop = 0;
  }, [sel]);
  // 盘面转多少：第 x 个月的地支转到指针底下
  const rotAt = (x) => NEEDLE - (branchOf(months[0].m) * 30 + 30 * x);
  const dialGeo = () => {
    const el = dialRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 } : null;
  };
  // 年月那两格：两层叠着，前一个淡出往上走，后一个淡入从底下上来
  const roll = (box, v0, v1, f) => {
    if (!box) return;
    const [a, b] = box.children;
    if (a.dataset.v !== String(v0)) (a.dataset.v = String(v0)), (a.firstChild.textContent = String(v0));
    if (b.dataset.v !== String(v1)) (b.dataset.v = String(v1)), (b.firstChild.textContent = String(v1));
    const s = 22;
    if (v0 === v1 || f <= 0) {
      a.style.opacity = "1";
      a.style.transform = "none";
      b.style.opacity = "0";
    } else {
      a.style.opacity = (1 - f).toFixed(3);
      a.style.transform = `translate3d(0,${(-f * s).toFixed(2)}px,0)`;
      b.style.opacity = f.toFixed(3);
      b.style.transform = `translate3d(0,${((1 - f) * s).toFixed(2)}px,0)`;
    }
  };
  const paintPos = (x) => {
    const max = months.length - 1;
    const rot = rotAt(x);
    if (diskRef.current) diskRef.current.setAttribute("transform", `rotate(${rot.toFixed(3)})`);
    moonRefs.current.forEach((el, b) => el && el.setAttribute("transform", `rotate(${b * 30}) translate(0 -66.5) rotate(${(-(b * 30 + rot)).toFixed(3)})`));
    const c = Math.max(0, Math.min(max, x));
    const i = Math.floor(c);
    const j = Math.min(max, i + 1);
    roll(yRef.current, months[i].y, months[j].y, c - i);
    roll(mRef.current, months[i].m + 1, months[j].m + 1, c - i);
  };
  live.current = {
    count: months.length,
    hasSel: !!sel,
    // 一帧一帧：盘面转到第 x 个月（带小数）对着指针，月亮反着转回正的，年月的数字换过去
    onPos: (x) => paintPos(x),
    // 手指落在晷盘上没有（屏幕上的坐标）
    dialAt: (px, py) => {
      const g = dialGeo();
      return g && Math.hypot(px - g.cx, py - g.cy) < g.r * 1.02 ? g : null;
    },
    // 点了晷盘外圈的哪个地支：换到离眼前最近的那个月（还没到的、十月以前的没有）
    dialTap: (px, py, pos) => {
      const g = dialGeo();
      if (!g) return null;
      const d = Math.hypot(px - g.cx, py - g.cy);
      if (d < g.r * 0.68 || d > g.r * 1.02) return null;
      const phi = (Math.atan2(px - g.cx, -(py - g.cy)) * 180) / Math.PI;
      const b = ((Math.round((phi - rotAt(pos)) / 30) % 12) + 12) % 12;
      let best = null;
      months.forEach((mm, i) => {
        if (branchOf(mm.m) === b && (best === null || Math.abs(i - pos) < Math.abs(best - pos))) best = i;
      });
      return best;
    },
    blocked: !!jzOpen,
    onAt: setAt,
    // 停在了哪个月：选中的那一天不在这个月里就不选了；回到本月选今天
    onMonth: (i) => {
      const mm = months[i];
      if (!mm) return;
      const pre = ymKeyOf(mm.y, mm.m) + "-";
      setSel((cur) => (cur && cur.startsWith(pre) ? cur : mm.y === ny && mm.m === nm ? todayKey : null));
    },
  };
  useLayoutEffect(() => {
    const d = mountDeck(
      { root: rootRef.current, pages: pagesRef.current, cal: calRef.current, wrap: wrapRef.current, months: monthsRef.current, day: dayRef.current, sc: scRef.current, peek: peekRef.current },
      () => live.current
    );
    deck.current = d;
    return () => {
      deck.current = null;
      d.destroy();
    };
  }, []);
  // 月份多了一个（跨了月）、眼前换了一个月（旁边那个月刚摆上）：位置重摆一遍
  useLayoutEffect(() => {
    if (!deck.current) return;
    deck.current.remeasure();
    deck.current.repaint();
  }, [months.length]);
  useLayoutEffect(() => {
    if (deck.current) deck.current.repaint();
  }, [at]);

  // 点一天：没选中的选中；已经选中的再点一下，翻到那一天
  const tapDay = (key) => {
    if (key > todayKey) return;
    if (key === sel) {
      if (deck.current) deck.current.goPage(1);
    } else setSel(key);
  };

  const month = (sel && data[sel.slice(0, 7)]) || {};
  const entry = (sel && month[sel]) || {};
  const her = entry.her || {};
  const him = entry.him || {};
  const selDate = sel ? parseDayKey(sel) : null;
  const together = selDate ? dayNumber(selDate) : 0;
  const isStart = (y, m, d) => y > START.y || (y === START.y && (m > START.m || (m === START.m && d >= START.d)));

  const save = async (who, value) => {
    const day = sel;
    const next = await saveEntry(day, who, value);
    setData((x) => ({ ...x, [day.slice(0, 7)]: next }));
  };
  const toggleMood = (k) => {
    const moods = her.moods || [];
    const nextMoods = moods.includes(k) ? moods.filter((x) => x !== k) : moods.concat([k]);
    save("her", { ...her, moods: nextMoods, updatedAt: Date.now() });
  };
  const askHim = async () => {
    const day = sel;
    setWriting(true);
    setErr("");
    try {
      const e = await writeHis(day, her);
      const next = await saveEntry(day, "him", e);
      setData((x) => ({ ...x, [day.slice(0, 7)]: next }));
    } catch (x) {
      setErr(`没写成（${String((x && x.message) || x).slice(0, 50)}）`);
    }
    setWriting(false);
  };

  const legendCell = (lv) => ({ width: 14, height: 14, borderRadius: 4, background: `rgba(var(--k-dai),${[0.06, 0.12, 0.22, 0.34, 0.48][lv]})` });
  const cur = months[Math.min(at, months.length - 1)];

  // ---- 摆法：照整页的宽高算（LAY）。格子的高矮跟着屏幕：晷盘底下到图例上面那一段放得下六行就照原来的 1:1.25，放不下就扁一点 ----
  const { W, H, sb } = box;
  const DR = LAY.r * W;
  const DCX = LAY.cx * W;
  const DCY = LAY.cy * H;
  // 格子整块从晷盘最外那圈底下起（11 月 22 日她截图圈出来：星期五六日压在节气那圈上）。放不下六行 1:1.25 的，
  // 先扁一点（最扁 1:1.1），再扁就整块一起缩窄、左右居中（格子宽跟着高缩，不压成扁条）
  const calStart = Math.max(DCY + DR * DIAL_OUT + DIAL_GAP, 0.36 * H);
  const fullW = W - LAY.left * W - LAY.right * W;
  const rowFit = (H - sb - PEEK_H - LEGEND_H - 24 - calStart - 5 * GAP) / 6;
  const colFull = (fullW - 6 * GAP) / 7;
  const rowH = Math.max(34, Math.min(colFull * 1.25, rowFit));
  const colW = Math.min(colFull, rowH / 1.1);
  const calW = colW * 7 + 6 * GAP;
  const calL = LAY.left * W + (fullW - calW) / 2;
  const gridH = 6 * rowH + 5 * GAP;

  // ---- 晷盘上跟着月份变的：眼前那个月的地支、有哪几个地支、每个月的月亮（写了日记的天数占过了的天数几成）、走过的那一段 ----
  const inRange = useMemo(() => new Set(months.map((x) => branchOf(x.m))), [months]);
  const fracs = useMemo(() => {
    const out = Array(12).fill(null);
    months.forEach((mm) => {
      const md = data[ymKeyOf(mm.y, mm.m)];
      const n = new Date(mm.y, mm.m + 1, 0).getDate();
      let w = 0;
      let t = 0;
      for (let d = 1; d <= n; d++) {
        const k = `${mm.y}-${pad(mm.m + 1)}-${pad(d)}`;
        if (k > todayKey) break;
        t++;
        const e = (md && md[k]) || {};
        if ((e.her && e.her.text) || (e.him && e.him.text)) w++;
      }
      out[branchOf(mm.m)] = t ? w / t : 0; // 同一个地支有好几年的：取最近那一年
    });
    return out;
  }, [months, data, todayKey]);
  const a0 = branchOf(months[0].m) * 30;
  const pastArc = [a0 - 15, a0 + 30 * Math.min(at, months.length - 1) + 15];

  // 一个月的格子（眼前这个月和它两边的才摆；位置是 diaryDeck.js 照 data-i 挪的）
  const monthPanel = (mm, i) => {
    const md = data[ymKeyOf(mm.y, mm.m)] || {};
    return (
      <div key={ymKeyOf(mm.y, mm.m)} data-i={i} className="kfs-diary-mon" style={{ position: "absolute", inset: 0, willChange: "transform, opacity" }}>
        <div style={{ width: "100%", padding: "0 14px", boxSizing: "border-box" }}>
          <div className="grid grid-cols-7" style={{ gap: GAP }}>
            {monthCells(mm.y, mm.m).map((d, ci) => {
              if (!d) return <div key={"b" + ci} />;
              const key = `${mm.y}-${pad(mm.m + 1)}-${pad(d)}`;
              const future = key > todayKey;
              const n = counts[key] || 0;
              const lv = heatLevel(n);
              const e = md[key] || {};
              const mood = moodOf(((e.her && e.her.moods) || [])[0] || ((e.him && e.him.moods) || [])[0]);
              const selected = key === sel;
              const today = key === todayKey;
              const anniv = d === START.d && isStart(mm.y, mm.m, d);
              return (
                <button
                  key={key}
                  data-day={key}
                  disabled={future}
                  aria-pressed={selected}
                  onClick={() => tapDay(key)}
                  className="relative flex flex-col items-center justify-center"
                  style={{
                    height: rowH,
                    borderRadius: 13,
                    background: selected ? fill(0.82) : `rgba(var(--k-dai),${HEAT[lv]})`,
                    border: selected ? `1.5px solid ${T.dai}` : today ? `1.5px dashed ${T.dai}` : "1.5px solid transparent",
                    opacity: future ? 0.32 : 1,
                  }}
                >
                  {jzDays.has(key) ? (
                    <span className="kfs-jz-tag" aria-hidden="true" style={{ position: "absolute", top: 2, left: 3, fontSize: 9, lineHeight: 1 }}>
                      🏷️
                    </span>
                  ) : null}
                  {e.her && e.her.text ? (
                    <span style={{ position: "absolute", top: 4, right: 5, width: 5, height: 5, borderRadius: "50%", background: T.dai }} />
                  ) : null}
                  {e.him && e.him.text ? (
                    <span style={{ position: "absolute", top: 4, right: e.her && e.her.text ? 12 : 5, width: 5, height: 5, borderRadius: "50%", background: T.goldDot }} />
                  ) : null}
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.1, color: anniv ? T.gold : T.ink }}>{d}</span>
                  <span style={{ fontSize: mood ? 11 : 9.5, lineHeight: 1.3, color: T.inkSoft, minHeight: 13 }}>
                    {mood ? mood.e : n ? n : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };
  // 年月那两格里的一层（两层叠着，字是 roll 一帧一帧填的，React 不管）：月份的数字横着摆在竖排里（纵中横）
  const rollLayer = (tcy) => (
    <div style={{ gridArea: "1 / 1", willChange: "transform, opacity" }}>
      <span style={tcy ? { textCombineUpright: "all", WebkitTextCombine: "horizontal" } : null} />
    </div>
  );
  const VERT = { writingMode: "vertical-rl", lineHeight: 1 };

  return (
    <div ref={rootRef} className="absolute inset-0 z-40 kfs-page kfs-diary" style={{ background: T.bg, overflow: "hidden" }}>
      <Glows />
      {/* 量主屏幕底下空出来的那一条有多高（格子的高矮要扣掉它） */}
      <div ref={probeRef} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: 0, height: "env(safe-area-inset-bottom)", visibility: "hidden" }} />
      <div ref={pagesRef} className="kfs-diary-pages" style={{ position: "absolute", inset: 0, willChange: "transform" }}>
        {/* 上面一页：月历。手指都归 diaryDeck.js 管（不交给浏览器）：晷盘上拨的、格子上划的、点的 */}
        <section ref={calRef} className="kfs-diary-cal" aria-label="月历" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", touchAction: "none" }}>
          <div ref={wrapRef} style={{ position: "absolute", inset: 0, willChange: "transform, opacity" }}>
            {/* 右上角的日晷：一截出了屏幕。盘面跟着月份转，指针不动 */}
            <svg
              ref={dialRef}
              className="kfs-dial"
              viewBox="-100 -100 200 200"
              aria-hidden="true"
              style={{ position: "absolute", left: DCX - DR, top: DCY - DR, width: 2 * DR, height: 2 * DR, overflow: "visible", pointerEvents: "none" }}
            >
              <style>{".kfs-dial *{vector-effect:non-scaling-stroke}"}</style>
              <Dial cur={branchOf(cur.m)} inRange={inRange} fracs={fracs} past={pastArc} diskRef={diskRef} moonRefs={moonRefs} />
            </svg>
            {/* 左边竖着写的年、月（她画的稿子：年份一列，月份错开一点在它右下） */}
            <div
              className="kfs-diary-title"
              role="heading"
              aria-level={2}
              aria-label={`${cur.y}年${cur.m + 1}月`}
              style={{ position: "absolute", left: 0.085 * W, top: Math.max(0.15 * H, 56), display: "flex", flexDirection: "column", alignItems: "flex-start", fontFamily: SERIF, color: T.ink, pointerEvents: "none" }}
            >
              <div ref={yRef} aria-hidden="true" style={{ ...VERT, display: "grid", textOrientation: "upright", fontSize: 27, letterSpacing: "0.18em" }}>
                {rollLayer(false)}
                {rollLayer(false)}
              </div>
              <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", marginLeft: 0.07 * W, marginTop: 22 }}>
                <div ref={mRef} style={{ ...VERT, display: "grid", fontSize: 24, overflow: "hidden", padding: "4px 0", WebkitMaskImage: "linear-gradient(transparent,#000 22%,#000 78%,transparent)", maskImage: "linear-gradient(transparent,#000 22%,#000 78%,transparent)" }}>
                  {rollLayer(true)}
                  {rollLayer(true)}
                </div>
                <div style={{ ...VERT, fontSize: 24, marginTop: "0.12em" }}>月</div>
              </div>
            </div>
            {/* 底下：星期那一行、格子、图例。整块贴着屏幕底（最底下那行小字上面） */}
            <div style={{ position: "absolute", left: calL, width: calW, bottom: `calc(${PEEK_H}px + env(safe-area-inset-bottom))` }}>
              <div className="grid grid-cols-7" aria-hidden="true" style={{ gap: GAP, marginBottom: 10 }}>
                {"一二三四五六日".split("").map((w) => (
                  <div key={w} className="text-center" style={{ fontSize: 11.5, color: T.inkFaint }}>
                    {w}
                  </div>
                ))}
              </div>
              {/* 各个月的格子：左右各让出 14 像素，划的时候两头淡出去 */}
              <div
                ref={monthsRef}
                style={{ position: "relative", height: gridH, margin: "0 -14px", overflow: "hidden", WebkitMaskImage: "linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%)", maskImage: "linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%)" }}
              >
                {months.map((mm, i) => (Math.abs(i - at) <= 1 ? monthPanel(mm, i) : null))}
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: 14, paddingTop: 12, borderTop: HAIRLINE, fontSize: 11.5, color: T.inkSoft }}>
                <span className="flex items-center" style={{ gap: 4 }}>
                  少
                  {[0, 1, 2, 3, 4].map((lv) => (
                    <span key={lv} style={legendCell(lv)} />
                  ))}
                  多
                </span>
                <span className="flex items-center" style={{ gap: 10 }}>
                  <span className="flex items-center" style={{ gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.dai }} />卿卿写的
                  </span>
                  <span className="flex items-center" style={{ gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.goldDot }} />光义写的
                  </span>
                </span>
              </div>
            </div>
          </div>
          {/* 选中了一天：最底下一行很淡的小字（往上划就是它） */}
          <div
            ref={peekRef}
            className="kfs-diary-peek"
            aria-hidden="true"
            style={{ position: "absolute", left: 0, right: 0, bottom: "calc(8px + env(safe-area-inset-bottom))", textAlign: "center", fontSize: 12, letterSpacing: "0.04em", color: T.inkSoft, pointerEvents: "none", opacity: sel ? 1 : 0, transition: "opacity .25s ease" }}
          >
            {sel ? [`${selDate.getMonth() + 1}月${selDate.getDate()}日 星期${WEEK[selDate.getDay()]}`, together >= 1 ? `第${together}天` : "", counts[sel] ? `说了 ${counts[sel]} 句` : ""].filter(Boolean).join(" · ") : ""}
          </div>
        </section>

        {/* 下面一页：这一天。里面照常滑；在最顶上往下拉回月历（diaryDeck.js） */}
        <section ref={dayRef} className="kfs-diary-day" aria-label="这一天" style={{ position: "absolute", left: 0, top: "100%", width: "100%", height: "100%" }}>
          {/* 给键盘、读屏的：看不见的一颗“回到月历” */}
          <button className="kfs-diary-up" aria-label="回到月历" onClick={() => deck.current && deck.current.goPage(0)} style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }} />
          <div ref={scRef} className="kfs-page-scroll kfs-scroll" style={{ position: "absolute", inset: 0, overflowY: "auto", overscrollBehavior: "none", touchAction: "pan-y" }}>
            <div style={{ boxSizing: "border-box", maxWidth: 448, minHeight: "100%", margin: "0 auto", padding: "calc(60px + env(safe-area-inset-top)) 24px calc(48px + env(safe-area-inset-bottom))" }}>
              {sel ? (
                <>
                  <div style={{ fontFamily: SERIF, fontSize: 22, color: T.ink, letterSpacing: "0.02em" }}>
                    {selDate.getMonth() + 1}月{selDate.getDate()}日 星期{WEEK[selDate.getDay()]}
                  </div>
                  <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>
                    {[together >= 1 ? `在一起的第${together}天` : "", counts[sel] ? `这天说了 ${counts[sel]} 句` : "这天没在开封府说话"].filter(Boolean).join("，")}
                  </div>

                  <div style={{ height: 1, background: HAIR, margin: "18px 0 16px" }} />
                  <div style={{ fontSize: 12.5, color: T.dai, marginBottom: 10 }}>卿卿写的</div>
                  <MoodChips value={her.moods || []} onToggle={toggleMood} />
                  <div style={{ marginTop: 12 }}>
                    {draft !== null ? (
                      <>
                        <textarea
                          className="kfs-field"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="这天发生了什么"
                          rows={5}
                          style={{ ...field, resize: "none", lineHeight: 1.6, userSelect: "text", WebkitUserSelect: "text" }}
                        />
                        <div className="flex" style={{ gap: 8, marginTop: 10 }}>
                          <button
                            onClick={() => {
                              save("her", { ...her, text: draft.trim(), updatedAt: Date.now() });
                              setDraft(null);
                            }}
                            className="kfs-tap"
                            style={chipPrimary}
                          >
                            保存
                          </button>
                          <button onClick={() => setDraft(null)} className="kfs-tap" style={chip}>
                            取消
                          </button>
                        </div>
                      </>
                    ) : her.text ? (
                      <>
                        <div className="whitespace-pre-wrap break-words" style={{ fontSize: 14.5, lineHeight: 1.75, color: T.ink }}>{her.text}</div>
                        <div className="flex" style={{ gap: 8, marginTop: 10 }}>
                          <button onClick={() => setDraft(her.text)} className="kfs-tap" style={chip}>
                            编辑
                          </button>
                          <button
                            onClick={() => {
                              if (armed !== "her") {
                                setArmed("her");
                                return;
                              }
                              save("her", { ...her, text: "", updatedAt: Date.now() });
                              setArmed(null);
                            }}
                            className="kfs-tap"
                            style={{ ...chip, color: T.red }}
                          >
                            {armed === "her" ? "再点一次删掉" : "删掉"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <button onClick={() => setDraft("")} className="kfs-tap" style={chip}>
                        写几句
                      </button>
                    )}
                  </div>

                  <div style={{ height: 1, background: HAIR, margin: "18px 0 16px" }} />
                  <div style={{ fontSize: 12.5, color: T.gold, marginBottom: 10 }}>光义写的</div>
                  {him.text ? (
                    <>
                      {him.moods && him.moods.length ? (
                        <div style={{ marginBottom: 10 }}>
                          <MoodChips value={him.moods} readOnly />
                        </div>
                      ) : null}
                      <div className="whitespace-pre-wrap break-words" style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.85, color: T.ink }}>{him.text}</div>
                      <div className="flex" style={{ gap: 8, marginTop: 12 }}>
                        <button onClick={askHim} disabled={writing} className="kfs-tap" style={{ ...chip, opacity: writing ? 0.5 : 1 }}>
                          {writing ? "光义在写……" : "重写"}
                        </button>
                        <button
                          onClick={() => {
                            if (armed !== "him") {
                              setArmed("him");
                              return;
                            }
                            save("him", null);
                            setArmed(null);
                          }}
                          className="kfs-tap"
                          style={{ ...chip, color: T.red }}
                        >
                          {armed === "him" ? "再点一次删掉" : "删掉"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button onClick={askHim} disabled={writing} className="kfs-tap" style={{ ...chipPrimary, opacity: writing ? 0.6 : 1 }}>
                      {writing ? "光义在写……" : "让光义写这一天"}
                    </button>
                  )}
                  {err && <div style={{ fontSize: 12, color: T.red, marginTop: 10 }}>{err}</div>}

                  {jz && jzInfo.day === sel ? (
                    <>
                      <div style={{ height: 1, background: HAIR, margin: "18px 0 16px" }} />
                      <div style={{ fontSize: 12.5, color: T.dai, marginBottom: 10 }}>手帐和批注</div>
                      <TyCard
                        info={jzInfo.info}
                        notes={jzInfo.notes}
                        onOpen={async () => {
                          const day = sel;
                          const mode = await jz.prepare(day);
                          setJzOpen({ day, mode, deps: jz.frame() });
                        }}
                      />
                      <DayNotes
                        notes={jzInfo.notes}
                        onAdd={async (text) => {
                          const day = sel;
                          const list = await jz.addNote(day, text);
                          if (list) setJzInfo((x) => (x.day === day ? { ...x, notes: list } : x));
                        }}
                        onDrop={async (id) => {
                          const day = sel;
                          const list = await jz.dropNote(day, id);
                          if (list) setJzInfo((x) => (x.day === day ? { ...x, notes: list } : x));
                        }}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {/* 左上角很淡的一个返回（照藏音匣、图画院那个：没有底、没有字） */}
      <button
        onClick={onBack}
        aria-label="返回"
        className="kfs-tap"
        style={{ position: "absolute", zIndex: 30, left: "max(10px, env(safe-area-inset-left, 0px))", top: "calc(8px + env(safe-area-inset-top))", width: 40, height: 40, display: "grid", placeItems: "center", opacity: 0.42, background: "none", border: 0, padding: 0, color: T.ink }}
      >
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path d="M11.5 3.5 L6 9 L11.5 14.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {jzOpen && jz ? (
        <TongyeFrame
          day={jzOpen.day}
          mode={jzOpen.mode}
          {...jzOpen.deps}
          onClose={() => {
            // 点开不动关上：什么都没写（同页里头一回动手才存，见 tongye/host.js 的 ensureDay），用不着收拾；回来重看一遍这一天
            setJzOpen(null);
            setJzTick((t) => t + 1);
          }}
        />
      ) : null}
    </div>
  );
}
