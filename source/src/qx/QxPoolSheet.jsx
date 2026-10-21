import { useMemo, useRef, useState } from "react";
import { Sheet } from "../ui/parts.jsx";
import { Icon } from "../ui/Icon.jsx";
import { T, SERIF, flat, field, chipPrimary, HAIRLINE } from "../ui/style.js";
import { HIS_NAME } from "../names.js";
import { poolSize, hasLots, parseImport, setOn, addTag, removeTag, restoreTag, searchTags } from "./pool.js";

// 秘戏钱匣的签库那一页（秘戏钱匣那一层右上角“签库”点开；签库空着还点了锦盒也开它）。
// 卿卿 10 月 21 日定的：挑维度、自己加签、搜签删签都要，抽签记录不要；签先全搬进来，手机上慢慢删。
//   导入：她那份签库文件（给她的那一份，或者 Ruota della Fortuna 原样的 tags.json），换一份要先问一声
//   抽哪几样：她点锦盒的时候只抽开着的（他自己抽不看这个），至少留一样
//   找签：搜到的一条一条列着，点叉就删
//   加一条：挑一样、写一条
//   翻全部：一样一样点开看，点叉就删
//   删了的那一条能撤销（只管刚删的那一条）
// 签多（四百来条），一条一个小块，不磨砂（磨砂的每块单独占一层，见开发说明“长对话里拉侧栏白屏”）
export const CREDIT = "Based on Ruota della Fortuna by Copper (29-Cu)";
export const CREDIT_URL = "https://github.com/29-Cu/routa-della-fortuna";

const CAP = { fontSize: 12, color: T.inkFaint, letterSpacing: "0.04em", margin: "0 2px 8px" };
const H = { fontFamily: SERIF, fontSize: 15, color: T.ink, letterSpacing: "0.08em", margin: "22px 2px 8px" };
const pill = (on) => ({
  ...(on ? { background: T.daiGrad, color: T.onDai, border: "1px solid transparent" } : { ...flat(0.5), color: T.ink }),
  borderRadius: 999,
  padding: "7px 13px",
  fontSize: 13,
});

function Tag({ t, onDrop }) {
  return (
    <span className="kfs-qx-tag inline-flex items-center" style={{ ...flat(0.5), borderRadius: 999, padding: "4px 4px 4px 11px", fontSize: 13, color: T.ink, gap: 1 }}>
      <span>{t}</span>
      <button onClick={onDrop} aria-label={`删掉 ${t}`} className="kfs-qx-drop flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 999, color: T.inkFaint }}>
        <Icon name="x" size={11} sw={2} />
      </button>
    </span>
  );
}

export function QxPoolSheet({ pool, onPool, onClose }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null); // 翻全部里点开的那一样（维度编号）
  const [addDim, setAddDim] = useState(null);
  const [addText, setAddText] = useState("");
  const [note, setNote] = useState(""); // 加没加上、导没导进来的那一句
  const [undo, setUndo] = useState(null); // 刚删的那一条
  const [asking, setAsking] = useState(false); // 换一份签库：先问一声
  const file = useRef(null);
  const hits = useMemo(() => searchTags(pool, q), [pool, q]);
  const empty = !hasLots(pool);
  const dims = pool.dims;
  const target = dims.find((d) => d.id === addDim) || dims[0];

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
      const next = parseImport(await f.text());
      onPool(next);
      setUndo(null);
      setAsking(false);
      setOpen(null);
      setNote(`导进来了：${next.dims.length} 样，${poolSize(next)} 条签。`);
    } catch (err) {
      setNote(err && err.message ? err.message : "这份文件读不出来");
    }
  };
  const drop = (id, t) => {
    const r = removeTag(pool, id, t);
    if (!r.removed) return;
    onPool(r.pool);
    setUndo(r.removed);
  };
  const back = () => {
    if (!undo) return;
    onPool(restoreTag(pool, undo));
    setUndo(null);
  };
  const add = () => {
    if (!target) return;
    const r = addTag(pool, target.id, addText);
    if (r.added) {
      onPool(r.pool);
      setAddText("");
      setNote(`加上了：${target.name} · ${r.added}`);
    } else setNote(addText.trim() ? "这一条已经有了" : "先写一条");
  };

  return (
    <Sheet title="签库" onClose={onClose}>
      <input ref={file} type="file" onChange={onFile} style={{ display: "none" }} />
      {empty ? (
        <div className="kfs-qx-empty">
          <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.75, margin: "0 2px 16px" }}>
            签库还空着。把签库文件导进来就能抽了：点下面这颗，挑那份 .json 文件。签只存在这台手机上，跟着云端走，云端只见乱码。
          </p>
          <button onClick={pick} className="kfs-qx-import kfs-tap" style={{ ...chipPrimary, padding: "10px 18px", fontSize: 14 }}>
            导入签库文件
          </button>
        </div>
      ) : (
        <>
          {undo && (
            <div className="kfs-qx-undo flex items-center justify-between" style={{ ...flat(0.6), borderRadius: 14, padding: "8px 8px 8px 14px", marginBottom: 12, fontSize: 13, color: T.inkSoft }}>
              <span>删了「{undo.t}」</span>
              <button onClick={back} className="kfs-tap" style={{ ...pill(false), padding: "5px 12px", fontSize: 12.5 }}>
                撤销
              </button>
            </div>
          )}

          <div style={{ ...H, marginTop: 0 }}>抽哪几样</div>
          <div style={CAP}>你点锦盒的时候只抽开着的这几样；{HIS_NAME}自己抽不看这个。</div>
          <div className="kfs-qx-dims flex flex-wrap" style={{ gap: 8 }}>
            {dims.map((d) => (
              <button key={d.id} onClick={() => onPool(setOn(pool, d.id, !d.on))} aria-pressed={d.on} className="kfs-tap" style={pill(d.on)}>
                {d.name} <span style={{ opacity: 0.7, fontSize: 12 }}>{d.tags.length}</span>
              </button>
            ))}
          </div>

          <div style={H}>找签</div>
          <input
            className="kfs-field kfs-qx-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜一个字、一个词"
            style={field}
          />
          {q.trim() && (
            <div className="kfs-qx-hits flex flex-wrap" style={{ gap: 6, marginTop: 10 }}>
              {hits.length ? (
                hits.map((h) => (
                  <span key={h.id + h.t} className="inline-flex items-center" style={{ gap: 4 }}>
                    <span style={{ fontSize: 11.5, color: T.inkFaint }}>{h.name}</span>
                    <Tag t={h.t} onDrop={() => drop(h.id, h.t)} />
                  </span>
                ))
              ) : (
                <span style={{ fontSize: 13, color: T.inkFaint, margin: "2px" }}>没找到</span>
              )}
            </div>
          )}

          <div style={H}>加一条</div>
          <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 10 }}>
            {dims.map((d) => (
              <button key={d.id} onClick={() => setAddDim(d.id)} aria-pressed={target && target.id === d.id} className="kfs-tap" style={{ ...pill(target && target.id === d.id), padding: "5px 11px", fontSize: 12.5 }}>
                {d.name}
              </button>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: 8 }}>
            <input
              className="kfs-field kfs-qx-new"
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder={target ? `往「${target.name}」里加一条` : "写一条"}
              style={{ ...field, flex: 1 }}
            />
            <button onClick={add} className="kfs-qx-add kfs-tap flex-shrink-0" style={{ ...chipPrimary, padding: "10px 16px" }}>
              加上
            </button>
          </div>

          <div style={H}>翻全部</div>
          <div className="kfs-qx-all" style={{ borderTop: HAIRLINE }}>
            {dims.map((d) => (
              <div key={d.id} style={{ borderBottom: HAIRLINE }}>
                <button onClick={() => setOpen(open === d.id ? null : d.id)} className="kfs-qx-dim w-full flex items-center justify-between" style={{ padding: "12px 2px", color: T.ink, fontSize: 14.5 }}>
                  <span style={{ fontFamily: SERIF, letterSpacing: "0.06em" }}>
                    {d.name} <span style={{ fontSize: 12, color: T.inkFaint, fontFamily: "inherit" }}>{d.tags.length} 条</span>
                  </span>
                  <span style={{ color: T.inkFaint }}>
                    <Icon name={open === d.id ? "chevD" : "chevR"} size={16} />
                  </span>
                </button>
                {open === d.id && (
                  <div className="flex flex-wrap" style={{ gap: 6, padding: "0 0 14px" }}>
                    {d.tags.length ? d.tags.map((t) => <Tag key={t} t={t} onDrop={() => drop(d.id, t)} />) : <span style={{ fontSize: 13, color: T.inkFaint }}>这一样空了</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            {asking ? (
              <div className="flex items-center flex-wrap" style={{ gap: 8, fontSize: 13, color: T.inkSoft }}>
                <span>换一份签库？眼下这 {poolSize(pool)} 条（连你加的、删的）都换掉。</span>
                <button onClick={pick} className="kfs-tap" style={{ ...pill(true), padding: "6px 14px" }}>
                  挑文件
                </button>
                <button onClick={() => setAsking(false)} className="kfs-tap" style={{ ...pill(false), padding: "6px 14px" }}>
                  算了
                </button>
              </div>
            ) : (
              <button onClick={() => setAsking(true)} className="kfs-qx-replace" style={{ fontSize: 13, color: T.inkFaint, padding: "4px 2px" }}>
                换一份签库
              </button>
            )}
          </div>
        </>
      )}
      {note && <div className="kfs-qx-msg" style={{ fontSize: 13, color: T.inkSoft, margin: "12px 2px 0" }}>{note}</div>}
      <div style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.7, marginTop: 24, textAlign: "center" }}>
        签的分法和签出自 Ruota della Fortuna
        <br />
        <a href={CREDIT_URL} target="_blank" rel="noopener noreferrer" className="kfs-qx-credit" style={{ color: T.inkSoft, textDecoration: "underline", textUnderlineOffset: 2 }}>
          {CREDIT}
        </a>
      </div>
    </Sheet>
  );
}
