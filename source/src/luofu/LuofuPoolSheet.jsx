import { useMemo, useRef, useState } from "react";
import { Sheet } from "../ui/parts.jsx";
import { Icon } from "../ui/Icon.jsx";
import { T, SERIF, flat, field, chipPrimary, HAIRLINE } from "../ui/style.js";
import { dreamCount, hasDreams, kindsOf, pct, parseLuofuImport, removeDream, restoreDream, addDream, searchDreams, dreamLabel } from "./parts.js";

// 罗浮梦的梦库那一页（罗浮梦那一页点“梦库”）。卿卿 11 月 1 日定的：照签库的样子做，能翻能改——导入一份梦库文件；能翻全部、能找、能删、能加。
// 我先定的（告诉过她）：
//   最上面一种梦一行：名字、几条、有梦的时候占几成；底下一行做梦的机会。比例和做梦的机会这一回只显示不改（想改就改文件重新导）
//   找梦：不分大小写，空格隔开的几个词都得有，最多列六十条
//   加一条：先挑哪一种；醒来就散的那几种（event）写一段字，记得完整的那几种（card）写标题、来源（可以空）、正文
//   翻全部：一种一行，点开是那一种的全部梦；card 那几种显示标题和来源，点开看正文
//   点叉删，刚删的那一条能撤销（只管刚删的那一条，放回原处）；整份换掉以前先问一声
// 梦多（两三百个），一个一个小块，不磨砂（磨砂的每块单独占一层，见开发说明“长对话里拉侧栏白屏”）。
// pool 是眼下的梦库；taken 是梦廊里做过的那些编号（加一条的时候编号不跟它们重）；onPool(新的一份) 存起来；onClose 回到罗浮梦那一页
const CAP = { fontSize: 12, color: T.inkFaint, letterSpacing: "0.04em", margin: "6px 2px 0" };
const H = { fontFamily: SERIF, fontSize: 15, color: T.ink, letterSpacing: "0.08em", margin: "22px 2px 8px" };
const pill = (on) => ({
  ...(on ? { background: T.daiGrad, color: T.onDai, border: "1px solid transparent" } : { ...flat(0.5), color: T.ink }),
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12.5,
});
// 收着的时候最多摆三行（醒来就散的那一种写的是一整段）
const CLAMP = { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" };

// 一个梦：event 写那一段字（收着的时候三行，点开看全）；card 写标题和来源，点开看正文。右边一个叉，点了就删
function Dream({ card, d, open, onToggle, onDrop, kind }) {
  return (
    <div className="kfs-lf-dream flex items-start" data-id={d.id} style={{ ...flat(0.5), borderRadius: 14, padding: "8px 4px 8px 12px", gap: 4 }}>
      <button onClick={onToggle} className="flex-1 min-w-0 text-left" style={{ color: T.ink, fontSize: 13.5, lineHeight: 1.65 }}>
        {kind && <span className="block" style={{ fontSize: 11.5, color: T.inkFaint }}>{kind}</span>}
        {card ? (
          <>
            <span className="kfs-lf-title block" style={{ fontFamily: SERIF, letterSpacing: "0.04em" }}>{d.title}</span>
            {d.source && <span className="kfs-lf-source block break-words" style={{ fontSize: 12, color: T.inkSoft }}>{d.source}</span>}
            {open && <span className="kfs-lf-text block break-words" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{d.text}</span>}
          </>
        ) : (
          <span className="kfs-lf-text block break-words" style={{ whiteSpace: "pre-wrap", ...(open ? {} : CLAMP) }}>{d.text}</span>
        )}
      </button>
      <button onClick={onDrop} aria-label={`删掉 ${dreamLabel(d)}`} className="kfs-lf-drop flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 999, color: T.inkFaint }}>
        <Icon name="x" size={11} sw={2} />
      </button>
    </div>
  );
}

export function LuofuPoolSheet({ pool, taken = [], onPool, onClose, look = "" }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null); // 翻全部里点开的那一种（种类编号）
  const [shown, setShown] = useState({}); // 点开看全文的那几个梦（编号 → true）
  const [addKind, setAddKind] = useState(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState(""); // 加没加上、导没导进来的那一句
  const [undo, setUndo] = useState(null); // 刚删的那一条
  const [asking, setAsking] = useState(false); // 换一份梦库：先问一声
  const file = useRef(null);
  const hits = useMemo(() => searchDreams(pool, q), [pool, q]);
  const kinds = useMemo(() => kindsOf(pool), [pool]);
  const empty = !hasDreams(pool);
  const target = pool.kinds.find((k) => k.id === addKind) || pool.kinds[0];
  const toggle = (id) => setShown((s) => ({ ...s, [id]: !s[id] }));

  const pick = () => {
    setNote("");
    if (file.current) {
      file.current.value = "";
      file.current.click();
    }
  };
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const next = parseLuofuImport(await f.text());
      onPool(next);
      setUndo(null);
      setAsking(false);
      setOpen(null);
      setShown({});
      setAddKind(null);
      setNote(`导进来了：${next.kinds.length} 种，${dreamCount(next)} 个梦。`);
    } catch (err) {
      setNote(err && err.message ? err.message : "这份文件读不出来");
    }
  };
  const drop = (kind, id) => {
    const r = removeDream(pool, kind, id);
    if (!r.removed) return;
    onPool(r.pool);
    setUndo(r.removed);
  };
  const back = () => {
    if (!undo) return;
    onPool(restoreDream(pool, undo));
    setUndo(null);
  };
  const add = () => {
    if (!target) return;
    const r = addDream(pool, target.id, { text, title, source }, taken);
    if (r.added) {
      onPool(r.pool);
      setText("");
      setTitle("");
      setSource("");
      setNote(`加上了：${target.name} · ${dreamLabel(r.added)}`);
    } else setNote(r.why);
  };

  return (
    <Sheet title="梦库" onClose={onClose} look={look} sub={look ? "锦盒 · 罗浮梦" : ""}>
      <input ref={file} type="file" onChange={onFile} style={{ display: "none" }} />
      {empty ? (
        <div className="kfs-lf-empty">
          <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.75, margin: "0 2px 16px" }}>梦库还空着。把梦库文件导进来，他在屋里睡觉才有梦可做：点下面这颗，挑那份 .json 文件。梦库跟着云端走，云端只见乱码。</p>
          <button onClick={pick} className="kfs-lf-import kfs-tap" style={{ ...chipPrimary, padding: "10px 18px", fontSize: 14 }}>
            导入梦库文件
          </button>
        </div>
      ) : (
        <>
          {undo && (
            <div className="kfs-lf-undo flex items-center justify-between" style={{ ...flat(0.6), borderRadius: 14, padding: "8px 8px 8px 14px", marginBottom: 12, fontSize: 13, color: T.inkSoft, gap: 8 }}>
              <span className="min-w-0 truncate">删了「{dreamLabel(undo.dream)}」</span>
              <button onClick={back} className="kfs-tap flex-shrink-0" style={{ ...pill(false), padding: "5px 12px" }}>
                撤销
              </button>
            </div>
          )}

          <div style={{ ...H, marginTop: 0 }}>有哪几种梦</div>
          <div className="kfs-lf-kinds" style={{ borderTop: HAIRLINE }}>
            {kinds.map((k) => (
              <div key={k.id} className="kfs-lf-kind flex items-center justify-between" style={{ borderBottom: HAIRLINE, padding: "10px 2px", gap: 10 }}>
                <span style={{ fontFamily: SERIF, fontSize: 14.5, color: T.ink, letterSpacing: "0.06em" }}>{k.name}</span>
                <span className="kfs-lf-share" style={{ fontSize: 12.5, color: T.inkSoft }}>
                  {k.n} 条 · 占 {pct(k.share)}
                  {k.type === "card" ? " · 进梦廊" : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="kfs-lf-chance" style={{ ...CAP, fontSize: 12.5, color: T.inkSoft }}>
            睡一觉，做梦的机会是 {pct(pool.dreamChance)}
          </div>

          <div style={H}>找梦</div>
          <input className="kfs-field kfs-lf-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜一个字、一个词" style={field} />
          {q.trim() && (
            <div className="kfs-lf-hits flex flex-col" style={{ gap: 6, marginTop: 10 }}>
              {hits.length ? (
                hits.map((h) => <Dream key={h.dream.id} card={h.type === "card"} d={h.dream} kind={h.name} open={!!shown[h.dream.id]} onToggle={() => toggle(h.dream.id)} onDrop={() => drop(h.kind, h.dream.id)} />)
              ) : (
                <span style={{ fontSize: 13, color: T.inkFaint, margin: "2px" }}>没找到</span>
              )}
            </div>
          )}

          <div style={H}>加一条</div>
          <div className="kfs-lf-addkinds flex flex-wrap" style={{ gap: 6, marginBottom: 10 }}>
            {pool.kinds.map((k) => (
              <button key={k.id} onClick={() => setAddKind(k.id)} aria-pressed={!!target && target.id === k.id} className="kfs-tap" style={pill(!!target && target.id === k.id)}>
                {k.name}
              </button>
            ))}
          </div>
          {target && target.type === "card" ? (
            <div className="flex flex-col" style={{ gap: 8 }}>
              <input className="kfs-field kfs-lf-new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="标题（不写就拿正文头一句）" style={field} />
              <input className="kfs-field kfs-lf-new-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="来源（可以空）" style={field} />
              <textarea className="kfs-field kfs-lf-new-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="正文" rows={4} style={{ ...field, resize: "none", lineHeight: 1.6 }} />
            </div>
          ) : (
            <textarea className="kfs-field kfs-lf-new-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={target ? `往「${target.name}」里写一段梦` : "写一段梦"} rows={3} style={{ ...field, resize: "none", lineHeight: 1.6 }} />
          )}
          <div className="flex" style={{ justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={add} className="kfs-lf-add kfs-tap" style={{ ...chipPrimary, padding: "10px 18px" }}>
              加上
            </button>
          </div>

          <div style={H}>翻全部</div>
          <div className="kfs-lf-all" style={{ borderTop: HAIRLINE }}>
            {pool.kinds.map((k) => (
              <div key={k.id} style={{ borderBottom: HAIRLINE }}>
                <button onClick={() => setOpen(open === k.id ? null : k.id)} className="kfs-lf-open w-full flex items-center justify-between" style={{ padding: "12px 2px", color: T.ink, fontSize: 14.5 }}>
                  <span style={{ fontFamily: SERIF, letterSpacing: "0.06em" }}>
                    {k.name} <span style={{ fontSize: 12, color: T.inkFaint, fontFamily: "inherit" }}>{k.dreams.length} 条</span>
                  </span>
                  <span style={{ color: T.inkFaint }}>
                    <Icon name={open === k.id ? "chevD" : "chevR"} size={16} />
                  </span>
                </button>
                {open === k.id && (
                  <div className="flex flex-col" style={{ gap: 6, padding: "0 0 14px" }}>
                    {k.dreams.length ? (
                      k.dreams.map((d) => <Dream key={d.id} card={k.type === "card"} d={d} open={!!shown[d.id]} onToggle={() => toggle(d.id)} onDrop={() => drop(k.id, d.id)} />)
                    ) : (
                      <span style={{ fontSize: 13, color: T.inkFaint }}>这一种空了</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            {asking ? (
              <div className="flex items-center flex-wrap" style={{ gap: 8, fontSize: 13, color: T.inkSoft }}>
                <span>换一份梦库？眼下这 {dreamCount(pool)} 个梦（连你加的、删的）都换掉。</span>
                <button onClick={pick} className="kfs-tap" style={{ ...pill(true), padding: "6px 14px" }}>
                  挑文件
                </button>
                <button onClick={() => setAsking(false)} className="kfs-tap" style={{ ...pill(false), padding: "6px 14px" }}>
                  算了
                </button>
              </div>
            ) : (
              <button onClick={() => setAsking(true)} className="kfs-lf-replace" style={{ fontSize: 13, color: T.inkFaint, padding: "4px 2px" }}>
                换一份梦库
              </button>
            )}
          </div>
        </>
      )}
      {note && (
        <div className="kfs-lf-msg" style={{ fontSize: 13, color: T.inkSoft, margin: "12px 2px 0" }}>
          {note}
        </div>
      )}
    </Sheet>
  );
}
