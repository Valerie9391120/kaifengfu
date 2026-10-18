import { useState, useEffect } from "react";
import { pad, WEEK, START, dayNumber } from "../days.js";
import { dayKeyOf, ymKeyOf, parseDayKey, MOODS, moodOf, heatLevel, monthCells } from "../diary.js";
import { SERIF, T, glass, chip, chipPrimary, field, fill, HAIR, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Glows, IconBtn } from "../ui/parts.jsx";
import { JzPage, JzCard } from "../jz/JzPage.jsx";
import { NOTE_MAX } from "../jz/model.js";
import { clip } from "../recap.js";
import { newId } from "../util.js";

// 那一天的批注（手帐上的、他翻日记的时候留的，都在这儿；见 jz/model.js）：一条一条摆着，底下能再留一条；
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

export function DiaryPage({ now, onBack, loadMonth, saveEntry, loadDays, writeHis, jz = null }) {
  const todayKey = dayKeyOf(now);
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [month, setMonth] = useState({});
  const [counts, setCounts] = useState({});
  const [sel, setSel] = useState(todayKey);
  const [draft, setDraft] = useState(null);
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(null);
  // 闲笔集里掺的手帐（见 jz/）：这一天有没有一页、几条批注；点开的是哪一天
  const [jzInfo, setJzInfo] = useState({ day: "", page: null, notes: [], hero: null }); // day：读的是哪一天（换了一天、还没读完的时候不摆上一天的）
  const [jzOpen, setJzOpen] = useState(null);
  const [jzTick, setJzTick] = useState(0);
  // 掺过手帐的那几天：日历格子左上角标一个 🏷️（卿卿 10 月 18 日早上要的）。点开手帐再出来（jzTick）重新看一遍
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
      const [page, notes] = await Promise.all([jz.loadPage(sel), jz.loadNotes(sel)]);
      let hero = null;
      if (page && page.arr.photos.length) {
        const h = page.arr.photos.find((x) => x.role === "hero") || page.arr.photos[0];
        hero = await jz.getImg(h.id);
      }
      if (alive) setJzInfo({ day: sel, page, notes, hero });
    })();
    return () => {
      alive = false;
    };
  }, [sel, jzTick]);

  useEffect(() => {
    loadDays().then((c) => setCounts(c || {}));
  }, []);
  useEffect(() => {
    loadMonth(ymKeyOf(ym.y, ym.m)).then((d) => setMonth(d || {}));
    setDraft(null);
    setErr("");
    setArmed(null);
  }, [ym.y, ym.m]);

  const goMonth = (dir) => {
    let m = ym.m + dir;
    let y = ym.y;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setYm({ y, m });
    setSel(y === now.getFullYear() && m === now.getMonth() ? todayKey : null);
  };

  const cells = monthCells(ym.y, ym.m);
  const entry = (sel && month[sel]) || {};
  const her = entry.her || {};
  const him = entry.him || {};
  const selDate = sel ? parseDayKey(sel) : null;
  const together = selDate ? dayNumber(selDate) : 0;
  const isStart = (y, m, d) => y > START.y || (y === START.y && (m > START.m || (m === START.m && d >= START.d)));

  const save = async (who, value) => {
    const next = await saveEntry(sel, who, value);
    setMonth(next);
  };
  const toggleMood = (k) => {
    const moods = her.moods || [];
    const nextMoods = moods.includes(k) ? moods.filter((x) => x !== k) : moods.concat([k]);
    save("her", { ...her, moods: nextMoods, updatedAt: Date.now() });
  };
  const askHim = async () => {
    setWriting(true);
    setErr("");
    try {
      const e = await writeHis(sel, her);
      const next = await saveEntry(sel, "him", e);
      setMonth(next);
    } catch (x) {
      setErr(`没写成（${String((x && x.message) || x).slice(0, 50)}）`);
    }
    setWriting(false);
  };

  const card = { ...glass(0.5, 26), borderRadius: 28, padding: 18 };
  const legendCell = (lv) => ({ width: 14, height: 14, borderRadius: 4, background: `rgba(var(--k-dai),${[0.06, 0.12, 0.22, 0.34, 0.48][lv]})` });

  return (
    <div className="absolute inset-0 z-40 flex flex-col kfs-page" style={{ background: T.bg }}>
      <Glows />
      <div className="relative z-10 flex items-center" style={{ ...glass(0.52, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}>
        <IconBtn onClick={onBack} label="返回">
          <Icon name="chevL" />
        </IconBtn>
        {/* 顶上写“闲笔集”（卿卿 2026 年 10 月 11 日改的，原来写“日记本”）。只换这三个字；里面的“卿卿写的”“光义写的”这些都没动 */}
        <div className="flex-1 text-center" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.12em", color: T.ink }}>
          闲笔集
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* 顶栏和日历之间那道缝留在滚动区外面：往上滑时内容在缝底下就收住，不顶到顶栏 */}
      <div
        className="kfs-page-scroll relative z-10 flex-1 overflow-y-auto kfs-scroll"
        style={{ marginTop: 12, padding: "0 12px calc(24px + env(safe-area-inset-bottom))" }}
      >
        {/* 月历 */}
        <div style={card}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <IconBtn onClick={() => goMonth(-1)} label="上个月">
              <Icon name="chevL" size={18} />
            </IconBtn>
            <div style={{ fontFamily: SERIF, fontSize: 19, color: T.ink, letterSpacing: "0.06em" }}>
              {ym.y}年{ym.m + 1}月
            </div>
            <IconBtn onClick={() => goMonth(1)} label="下个月">
              <Icon name="chevR" size={18} />
            </IconBtn>
          </div>
          <div className="grid grid-cols-7" style={{ gap: 6, marginBottom: 6 }}>
            {"一二三四五六日".split("").map((w) => (
              <div key={w} className="text-center" style={{ fontSize: 11.5, color: T.inkFaint }}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" style={{ gap: 6 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={"b" + i} />;
              const key = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`;
              const future = key > todayKey;
              const n = counts[key] || 0;
              const lv = heatLevel(n);
              const e = month[key] || {};
              const mood = moodOf(((e.her && e.her.moods) || [])[0] || ((e.him && e.him.moods) || [])[0]);
              const selected = key === sel;
              const today = key === todayKey;
              const anniv = d === START.d && isStart(ym.y, ym.m, d);
              return (
                <button
                  key={key}
                  disabled={future}
                  onClick={() => {
                    setSel(key);
                    setDraft(null);
                    setErr("");
                    setArmed(null);
                  }}
                  className="relative flex flex-col items-center justify-center"
                  style={{
                    aspectRatio: "1 / 1.1",
                    borderRadius: 13,
                    background: selected ? fill(0.82) : `rgba(var(--k-dai),${[0.05, 0.12, 0.22, 0.34, 0.48][lv]})`,
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

        {/* 这一天 */}
        {sel ? (
          <div style={{ ...card, marginTop: 12 }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: T.ink }}>
              {selDate.getMonth() + 1}月{selDate.getDate()}日 星期{WEEK[selDate.getDay()]}
            </div>
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
              {[together >= 1 ? `在一起的第${together}天` : "", counts[sel] ? `这天说了 ${counts[sel]} 句` : "这天没在开封府说话"].filter(Boolean).join("，")}
            </div>

            <div style={{ height: 1, background: HAIR, margin: "16px 0" }} />
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
                  <div className="whitespace-pre-wrap" style={{ fontSize: 14.5, lineHeight: 1.75, color: T.ink }}>{her.text}</div>
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
                <div className="whitespace-pre-wrap" style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.85, color: T.ink }}>{him.text}</div>
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
                <JzCard page={jzInfo.page} notes={jzInfo.notes} heroSrc={jzInfo.hero} onOpen={() => setJzOpen(sel)} />
                <DayNotes
                  notes={jzInfo.notes}
                  onAdd={async (text) => {
                    const day = sel;
                    const list = await jz.addNote(day, { id: newId(), who: "her", text, at: Date.now(), part: "" });
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
          </div>
        ) : (
          <div className="text-center" style={{ ...card, marginTop: 12, fontSize: 13, color: T.inkSoft }}>
            点一天看看
          </div>
        )}
      </div>
      {jzOpen && jz ? (
        <JzPage
          day={jzOpen}
          diary={month[jzOpen] || {}}
          api={jz}
          onBack={() => {
            setJzOpen(null);
            setJzTick((t) => t + 1);
          }}
        />
      ) : null}
    </div>
  );
}
