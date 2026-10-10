// =====================================================
// 中间那行字的素材库（“头像与设置”里点进来）。见 motto.js。
// 她把那份 md 贴进来、或者选那个文件；点“存好”才存（锁好了跟着云端走，不进仓库）。
// 底下照着她眼前写的说认出了什么：几个时段、几个日子、{N} 从哪天算、有没有认不出的标题；
// 再给一个“看看哪天会说什么”：挑一天、一个钟点，那时候会从哪几句里抽。
// 没存就关掉的：写了一半的留在 draftRef 里，下回点进来接着写。
// =====================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { T, glass, chip, chipPrimary, field } from "../ui/style.js";
import { parseMotto, describeMotto, poolAt, fillMotto, mottoLines, MOTTO_TEXT_MAX, DEFAULT_MOTTO, KNOWN_FEASTS } from "../motto.js";

const pad = (n) => String(n).padStart(2, "0");
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const KIND = { once: "只这一天", yearly: "每年", feast: "节日", monthly: "每月" };

const small = { fontSize: 12, color: T.inkSoft, lineHeight: 1.65 };
const card = { ...glass(0.5, 16), borderRadius: 16, padding: "12px 14px" };

export function MottoPanel({ text, draftRef, onSave, onDone }) {
  const saved = text || "";
  const [draft, setDraft] = useState(() => (draftRef && typeof draftRef.current === "string" ? draftRef.current : saved));
  const [note, setNote] = useState(() => (draftRef && typeof draftRef.current === "string" && draftRef.current !== saved ? "上回改了没存的还在这儿" : ""));
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const [day, setDay] = useState(dayOf(now));
  const [time, setTime] = useState(timeOf(now));
  const fileRef = useRef(null);
  const lib = useMemo(() => parseMotto(draft), [draft]);
  const seen = useMemo(() => describeMotto(lib), [lib]);
  const changed = draft !== saved;

  // 没存就关掉：写了一半的留着（存好了、没改的就不留）
  useEffect(() => {
    if (draftRef) draftRef.current = changed ? draft : null;
  }, [draft, changed]);

  const when = new Date(`${day}T${time || "12:00"}:00`);
  const pool = Number.isNaN(when.getTime()) ? null : poolAt(lib, when);
  const needsStart = !lib.start && lib.slots.concat(lib.days).some((s) => s.lines.some((x) => x.includes("{N}")));

  const readFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const t = await f.text();
      setDraft(t.slice(0, MOTTO_TEXT_MAX));
      setNote(t.length > MOTTO_TEXT_MAX ? "读进来了。太长了，只留了前六万个字" : "读进来了。看看下面认出来的对不对，再点“存好”");
    } catch (x) {
      setNote("这个文件读不出来");
    }
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(draft.slice(0, MOTTO_TEXT_MAX));
      if (draftRef) draftRef.current = null;
      setNote(draft.trim() ? "存好了。新开一段就能看到" : "清空了。中间照旧写“如月之恒，官家在这”");
    } catch (x) {
      setNote("没存上：" + String((x && x.message) || x).slice(0, 80));
    }
    setSaving(false);
  };

  return (
    <div className="kfs-motto-panel">
      <p style={{ ...small, marginBottom: 12 }}>
        新开一段、还没说话的时候，对话正中间那一行字。照这份素材库按时段抽一句；节日、纪念日那天，整天只抽那天的。素材库锁好了存在云端，换手机也在；不进开封府的代码仓库。
      </p>

      <div className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 10 }}>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="kfs-tap" style={chip}>
          从文件读
        </button>
        <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={readFile} style={{ display: "none" }} />
        <span style={small}>{draft.trim() ? `${Array.from(draft).length} 个字` : "还空着：可以直接把那份 md 贴进下面"}</span>
      </div>
      <textarea
        className="kfs-field kfs-motto-text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value.slice(0, MOTTO_TEXT_MAX));
          setNote("");
        }}
        placeholder={"## 早晨 7:00–10:00\n- 醒了？\n\n### 生日（1月1日）\n- 生日快乐"}
        rows={12}
        spellCheck={false}
        readOnly={saving}
        style={{ ...field, resize: "none", lineHeight: 1.55, userSelect: "text", WebkitUserSelect: "text" }}
      />
      <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
        <button onClick={save} disabled={!changed || saving} className="kfs-tap" style={{ ...chipPrimary, opacity: changed && !saving ? 1 : 0.45 }}>
          {saving ? "正在存…" : "存好"}
        </button>
        <button onClick={onDone} className="kfs-tap" style={chip}>
          {changed ? "先不存" : "好了"}
        </button>
        {changed && saved && (
          <button
            onClick={() => {
              setDraft(saved);
              if (draftRef) draftRef.current = null;
              setNote("改的都不要了，回到存着的那一份");
            }}
            className="kfs-tap"
            style={{ ...chip, opacity: saving ? 0.45 : 1 }}
            disabled={saving}
          >
            改的不要了
          </button>
        )}
      </div>
      {note && (
        <div className="kfs-motto-note" style={{ ...small, marginTop: 8 }}>
          {note}
        </div>
      )}

      {/* 认出来的 */}
      <div style={{ fontSize: 12, color: T.inkSoft, margin: "20px 0 8px" }}>认出来的</div>
      <div className="kfs-motto-seen" style={{ ...card, fontSize: 13, color: T.ink, lineHeight: 1.7 }}>
        {seen.total === 0 && !seen.unknown.length ? (
          <div style={{ color: T.inkSoft }}>还没有能抽的句子。中间写的是“{DEFAULT_MOTTO}”。</div>
        ) : (
          <>
            <div>
              一共 {seen.total} 句：{seen.slots.length} 个时段、{seen.days.length} 个日子
            </div>
            {seen.slots.map((s, i) => (
              <div key={"s" + i} style={{ color: T.inkSoft }}>
                {s.name} · {s.count} 句
              </div>
            ))}
            {seen.days.map((d, i) => (
              <div key={"d" + i} style={{ color: d.past ? "#A8473D" : T.inkSoft }}>
                {d.name}（{d.past ? "只这一天，已经过了，不会再出" : KIND[d.kind]}）· {d.count} 句
              </div>
            ))}
            {seen.start && <div style={{ color: T.inkSoft }}>{"{N}"} 个月从 {seen.start} 算起</div>}
            {needsStart && <div style={{ color: "#A8473D" }}>有句子写着 {"{N}"}，可没写从哪天算起：那几句不会出。在标题里写上“从2030年1月1日算起”这样的</div>}
            {seen.stray > 0 && <div className="kfs-motto-stray" style={{ color: "#A8473D" }}>有 {seen.stray} 句不在哪一节底下（写在“---”后面、下一个标题前面），不会出</div>}
            {seen.unknown.length > 0 && (
              <div className="kfs-motto-unknown" style={{ color: "#A8473D" }}>
                这几个标题认不出是哪个时段、哪一天，底下的句子不会出：{seen.unknown.join("、")}
              </div>
            )}
          </>
        )}
      </div>

      {/* 看看哪天会说什么 */}
      <div style={{ fontSize: 12, color: T.inkSoft, margin: "20px 0 8px" }}>看看哪天会说什么</div>
      <div className="flex" style={{ gap: 8, marginBottom: 8 }}>
        <input className="kfs-motto-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ ...field, flex: 1.4, padding: "9px 12px" }} />
        <input className="kfs-motto-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...field, flex: 1, padding: "9px 12px" }} />
      </div>
      <div className="kfs-motto-preview" style={{ ...card, fontSize: 13, color: T.ink, lineHeight: 1.7 }}>
        {!pool ? (
          <div style={{ color: T.inkSoft }}>挑一天、一个钟点</div>
        ) : !pool.lines.length ? (
          <div style={{ color: T.inkSoft }}>这会儿没有能抽的，中间写“{DEFAULT_MOTTO}”。</div>
        ) : (
          <>
            <div style={{ color: T.inkSoft, marginBottom: 4 }}>
              {pool.kind === "day" ? `那天是：${pool.names.join("、")}，整天从这几句里抽` : `平常日子，这个钟点是：${pool.names.join("、")}`}
            </div>
            {pool.lines.map((s, i) => (
              <div key={i} className="kfs-motto-line">
                {mottoLines(fillMotto(s, pool.n)).join(" / ")}
              </div>
            ))}
          </>
        )}
      </div>

      <p style={{ ...small, marginTop: 14 }}>
        写法照你那份：“## 早晨 7:00–10:00”底下每句一行、“- ”开头（一句写两行的，第二行前面空几格）；“### 生日（1月1日）”每年那天；写了年份的“（2031年1月1日）”只那一天；“每月1日”每个月，标题里写“从2030年1月1日算起”，句子里的 {"{N}"} 就是满几个月。认得的节日（农历的写不写“农历”都行）：
        {KNOWN_FEASTS.map((n) => (n === "春节" ? "春节（除夕、初一两天）" : n)).join("、")}。几样撞在同一天：写了年份的优先，然后是每年的、节日、每月的。“---”隔开一节，标题和“- ”开头的行以外的字都不管。
      </p>
    </div>
  );
}
