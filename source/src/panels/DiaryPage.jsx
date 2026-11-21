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
// 月历那一块多宽（年月、星期那一行、格子都照它）
const CAL_W = "min(calc(100% - 44px), 400px)";
const HEAT = [0.05, 0.12, 0.22, 0.34, 0.48];
// 年月里会滚的那一格：只露一行，上下两头淡出去
const TK_MASK = "linear-gradient(to bottom, transparent 0, #000 24%, #000 76%, transparent 100%)";
const TK = { display: "inline-block", height: "1.3em", overflow: "hidden", verticalAlign: "bottom", WebkitMaskImage: TK_MASK, maskImage: TK_MASK };
const TK_COL = { display: "flex", flexDirection: "column", alignItems: "center", willChange: "transform" };
const TK_ROW = { display: "block", height: "1.3em", lineHeight: "1.3em", whiteSpace: "nowrap", width: "max-content" };

// 整页两页上下接着（手指怎么走见 diaryDeck.js）：
//   上面一页只有月历，摆在背景上，没有顶栏、没有衬底的卡片。年月和星期那一行不动，左右划的时候只有格子跟着走，年月里的数字跟着滚；
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
  const years = useMemo(() => [...new Set(months.map((x) => x.y))], [months]);
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
  // 眼前这个月和它两边的：日记取出来（划的时候旁边那个月已经摆好了）
  useEffect(() => {
    let alive = true;
    [at - 1, at, at + 1].forEach((i) => {
      const mm = months[i];
      if (!mm) return;
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
  const tkYRef = useRef(null);
  const tkMRef = useRef(null);
  const peekRef = useRef(null);
  const deck = useRef(null);
  const live = useRef(null);
  // 换了一天（sel 是 null 就是没选）：上一天写到一半的、点了一下“删掉”的都不留，那一页回到最顶
  useLayoutEffect(() => {
    setDraft(null);
    setErr("");
    setArmed(null);
    if (scRef.current) scRef.current.scrollTop = 0;
  }, [sel]);
  live.current = {
    count: months.length,
    hasSel: !!sel,
    yearIndex: (i) => Math.max(0, years.indexOf((months[i] || months[months.length - 1]).y)),
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
      { root: rootRef.current, pages: pagesRef.current, cal: calRef.current, wrap: wrapRef.current, months: monthsRef.current, day: dayRef.current, sc: scRef.current, tkY: tkYRef.current, tkM: tkMRef.current, peek: peekRef.current },
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

  // 一个月的格子（眼前这个月和它两边的才摆；位置是 diaryDeck.js 照 data-i 挪的）
  const monthPanel = (mm, i) => {
    const md = data[ymKeyOf(mm.y, mm.m)] || {};
    return (
      <div key={ymKeyOf(mm.y, mm.m)} data-i={i} className="kfs-diary-mon" style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", willChange: "transform, opacity" }}>
        <div style={{ width: CAL_W }}>
          <div className="grid grid-cols-7" style={{ gap: 7 }}>
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
                    aspectRatio: "1 / 1.25",
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
          <div className="flex items-center justify-between" style={{ marginTop: 18, paddingTop: 14, borderTop: HAIRLINE, fontSize: 11.5, color: T.inkSoft }}>
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
    );
  };

  return (
    <div ref={rootRef} className="absolute inset-0 z-40 kfs-page kfs-diary" style={{ background: T.bg, overflow: "hidden" }}>
      <Glows />
      <div ref={pagesRef} className="kfs-diary-pages" style={{ position: "absolute", inset: 0, willChange: "transform" }}>
        {/* 上面一页：月历。手指都归 diaryDeck.js 管（不交给浏览器） */}
        <section ref={calRef} className="kfs-diary-cal" aria-label="月历" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", touchAction: "none" }}>
          <div ref={wrapRef} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", willChange: "transform, opacity" }}>
            <div style={{ flex: "none", width: CAL_W, paddingTop: "calc(env(safe-area-inset-top) + clamp(64px, 11vh, 110px))" }}>
              <h2
                className="kfs-diary-title"
                aria-label={`${cur.y}年${cur.m + 1}月`}
                style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 400, lineHeight: "1.3em", letterSpacing: "0.1em", textAlign: "center", whiteSpace: "nowrap", color: T.ink, margin: "0 0 clamp(28px, 6.5vh, 60px)" }}
              >
                <span ref={tkYRef} aria-hidden="true" style={TK}>
                  <span style={TK_COL}>
                    {years.map((y) => (
                      <span key={y} style={TK_ROW}>
                        {y}
                      </span>
                    ))}
                  </span>
                </span>
                <span aria-hidden="true">年</span>
                <span ref={tkMRef} aria-hidden="true" style={TK}>
                  <span style={TK_COL}>
                    {months.map((x) => (
                      <span key={ymKeyOf(x.y, x.m)} style={TK_ROW}>
                        {x.m + 1}
                      </span>
                    ))}
                  </span>
                </span>
                <span aria-hidden="true">月</span>
              </h2>
              <div className="grid grid-cols-7" aria-hidden="true" style={{ gap: 7, marginBottom: 10 }}>
                {"一二三四五六日".split("").map((w) => (
                  <div key={w} className="text-center" style={{ fontSize: 11.5, color: T.inkFaint }}>
                    {w}
                  </div>
                ))}
              </div>
            </div>
            <div ref={monthsRef} style={{ position: "relative", flex: 1, width: "100%" }}>
              {months.map((mm, i) => (Math.abs(i - at) <= 1 ? monthPanel(mm, i) : null))}
            </div>
          </div>
          {/* 选中了一天：最底下一行很淡的小字（往上划就是它） */}
          <div
            ref={peekRef}
            className="kfs-diary-peek"
            aria-hidden="true"
            style={{ position: "absolute", left: 0, right: 0, bottom: "calc(30px + env(safe-area-inset-bottom))", textAlign: "center", fontSize: 12, letterSpacing: "0.04em", color: T.inkSoft, pointerEvents: "none", opacity: sel ? 1 : 0, transition: "opacity .25s ease" }}
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
