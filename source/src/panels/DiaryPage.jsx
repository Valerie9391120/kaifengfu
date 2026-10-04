import { useState, useEffect } from "react";
import { pad, WEEK, START, dayNumber } from "../days.js";
import { dayKeyOf, ymKeyOf, parseDayKey, MOODS, moodOf, heatLevel, monthCells } from "../diary.js";
import { SERIF, T, glass, chip, chipPrimary, field } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Glows, IconBtn } from "../ui/parts.jsx";

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
              color: on ? "#fff" : T.inkSoft,
              background: on ? T.daiGrad : "rgba(255,255,255,0.5)",
              border: "1px solid rgba(255,255,255,0.7)",
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

export function DiaryPage({ now, onBack, loadMonth, saveEntry, loadDays, writeHis }) {
  const todayKey = dayKeyOf(now);
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [month, setMonth] = useState({});
  const [counts, setCounts] = useState({});
  const [sel, setSel] = useState(todayKey);
  const [draft, setDraft] = useState(null);
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(null);

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
        <div className="flex-1 text-center" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.12em", color: T.ink }}>
          日记本
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
                    background: selected ? "rgba(255,255,255,0.82)" : `rgba(var(--k-dai),${[0.05, 0.12, 0.22, 0.34, 0.48][lv]})`,
                    border: selected ? `1.5px solid ${T.dai}` : today ? `1.5px dashed ${T.dai}` : "1.5px solid transparent",
                    opacity: future ? 0.32 : 1,
                  }}
                >
                  {e.her && e.her.text ? (
                    <span style={{ position: "absolute", top: 4, right: 5, width: 5, height: 5, borderRadius: "50%", background: T.dai }} />
                  ) : null}
                  {e.him && e.him.text ? (
                    <span style={{ position: "absolute", top: 4, right: e.her && e.her.text ? 12 : 5, width: 5, height: 5, borderRadius: "50%", background: "#B9914C" }} />
                  ) : null}
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.1, color: anniv ? T.gold : T.ink }}>{d}</span>
                  <span style={{ fontSize: mood ? 11 : 9.5, lineHeight: 1.3, color: T.inkSoft, minHeight: 13 }}>
                    {mood ? mood.e : n ? n : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.7)", fontSize: 11.5, color: T.inkSoft }}>
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
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B9914C" }} />光义写的
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

            <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "16px 0" }} />
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
                      style={{ ...chip, color: "#A8473D" }}
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

            <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "18px 0 16px" }} />
            <div style={{ fontSize: 12.5, color: "#94733A", marginBottom: 10 }}>光义写的</div>
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
                    style={{ ...chip, color: "#A8473D" }}
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
            {err && <div style={{ fontSize: 12, color: "#A8473D", marginTop: 10 }}>{err}</div>}
          </div>
        ) : (
          <div className="text-center" style={{ ...card, marginTop: 12, fontSize: 13, color: T.inkSoft }}>
            点一天看看
          </div>
        )}
      </div>
    </div>
  );
}
