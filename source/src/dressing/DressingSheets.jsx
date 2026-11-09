import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "../ui/parts.jsx";
import { Icon } from "../ui/Icon.jsx";
import { T, SERIF, flat, field, chipPrimary, HAIRLINE } from "../ui/style.js";
import { CATS, CATEGORY_LABELS, closetView, findItems, droppedView, addItem, editItem, dropItem, undropItem, mirrorView, achievementsView, NAME_MAX, DESC_MAX } from "./closet.js";

// 他屋里妆台的三页（推近铜镜，卡片上那三颗：照镜子、衣柜、成就；在案上那一层里弹出来，照屋里卡片的样子，同锦盒里的梦库、梦廊）。
// 规矩（见 closet.js）：衣柜里的衣服能加、能删、能改名字和描述；成就、攒成就换来的那几样只看；锁着的（成就要用的）只能改字。
//   照镜子：同他屋里的镜子，只照得出今天完成的那一身；还没完成是一只裸狐，底下再写上一回完成的那一身
//   衣柜：找一件、加一件、翻全部（一样一栏，点开是那一样的全部；点一件改字，点叉删，刚删的那一件能撤销）；
//     点叉要点两下：头一下叉变成“删掉”，再点才删，三秒不点变回叉（免得手一滑就删了）；最底下一栏“删掉的”，删过的都在，一件一个“放回去”
//   成就：六十个全列，点亮的亮着、没点亮的灰着；底下攒成就换来的那几样，拿到的亮着
// state 是妆台的存档（家里的闹钟写的，只读）；closet 是衣柜那一条（见 closet.js）；onCloset(新的一条) 存起来
const SUB = "铜镜 · 妆台";
const H = { fontFamily: SERIF, fontSize: 15, color: T.ink, letterSpacing: "0.08em", margin: "22px 2px 8px" };
const SMALL = { fontSize: 12, color: T.inkSoft, lineHeight: 1.6 };
const pill = (on) => ({
  ...(on ? { background: T.daiGrad, color: T.onDai, border: "1px solid transparent" } : { ...flat(0.5), color: T.ink }),
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12.5,
});
const UNIT = { hair: "种", makeup: "种", scent: "种" };
const dayText = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
  return m ? `${Number(m[2])}月${Number(m[3])}日` : "";
};

function Rows({ rows, dim = false }) {
  return (
    <div className="kfs-dr-rows" style={{ borderTop: HAIRLINE, opacity: dim ? 0.62 : 1 }}>
      {rows.map((r) => (
        <div key={r.label} className="kfs-dr-row flex" style={{ borderBottom: HAIRLINE, padding: "9px 2px", gap: 14 }}>
          <span className="flex-shrink-0" style={{ width: 40, fontSize: 13, color: T.inkSoft, letterSpacing: "0.1em" }}>
            {r.label}
          </span>
          <span className="flex-1 min-w-0" style={{ fontSize: 14.5, color: T.ink, lineHeight: 1.65 }}>
            {r.text}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- 照镜子 ----------
export function DressingMirror({ state, today, closet, onClose }) {
  const v = mirrorView(state, today, closet);
  return (
    <Sheet title="照镜子" onClose={onClose} look="room" sub={SUB}>
      {v.kind === "never" && (
        <p className="kfs-dr-never" style={{ fontSize: 14, color: T.inkSoft, margin: "4px 2px 8px" }}>
          他还没去过妆台。
        </p>
      )}
      {v.kind === "today" && (
        <>
          <div className="kfs-dr-cap" style={{ ...SMALL, margin: "0 2px 8px" }}>
            镜中今日
          </div>
          <Rows rows={v.rows} />
        </>
      )}
      {v.kind === "fox" && (
        <>
          <p className="kfs-dr-fox" style={{ fontSize: 15, color: T.ink, lineHeight: 1.8, margin: "2px 2px 0", fontFamily: SERIF, letterSpacing: "0.06em" }}>
            镜子里是一只裸狐。
          </p>
          <p style={{ ...SMALL, margin: "2px 2px 0" }}>今天还没有完成搭配。</p>
          {v.last && (
            <>
              <div className="kfs-dr-cap" style={{ ...SMALL, margin: "20px 2px 8px" }}>
                上一回（{dayText(v.last.date)}）完成的那一身
              </div>
              <Rows rows={v.last.rows} dim />
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

// ---------- 衣柜 ----------
// 一件：名字（她新添的标着），描述；右边一个叉（锁着的写一个“锁”，攒来的写“攒来的”）。点名字那一块改字。
// 叉点一下变成“删掉”（armed），再点才删
function Item({ x, label, editing, armed, onEdit, onArm, onDrop }) {
  return (
    <div className="kfs-dr-item flex items-start" data-id={x.id} style={{ ...flat(0.5), borderRadius: 14, padding: "8px 4px 8px 12px", gap: 4 }}>
      <button onClick={x.reward ? undefined : onEdit} disabled={x.reward} aria-expanded={editing} className="flex-1 min-w-0 text-left" style={{ color: T.ink, fontSize: 14, lineHeight: 1.6 }}>
        {label && <span className="block" style={{ fontSize: 11.5, color: T.inkFaint }}>{label}</span>}
        <span className="kfs-dr-name block" style={{ fontFamily: SERIF, letterSpacing: "0.04em" }}>
          {x.name}
          {x.mine && <span style={{ fontSize: 11.5, color: T.inkFaint, marginLeft: 6 }}>新添</span>}
        </span>
        {x.description && <span className="kfs-dr-desc block break-words" style={{ fontSize: 12.5, color: T.inkSoft, whiteSpace: "pre-wrap" }}>{x.description}</span>}
      </button>
      {x.reward ? (
        <span className="kfs-dr-tag flex-shrink-0" style={{ fontSize: 11.5, color: T.inkFaint, padding: "4px 8px" }}>
          攒来的
        </span>
      ) : x.lock ? (
        <span className="kfs-dr-lock flex items-center justify-center flex-shrink-0" aria-label={`删不了：${x.lock}`} style={{ width: 28, height: 28, fontSize: 12, color: T.inkFaint }}>
          锁
        </span>
      ) : armed ? (
        <button onClick={onDrop} aria-label={`确定删掉 ${x.name}`} className="kfs-dr-confirm kfs-tap flex items-center justify-center flex-shrink-0" style={{ height: 28, padding: "0 11px", borderRadius: 2, fontSize: 12.5, letterSpacing: "0.12em", color: "#f6ecdc", background: "rgba(158,52,36,.88)" }}>
          删掉
        </button>
      ) : (
        <button onClick={onArm} aria-label={`删掉 ${x.name}`} className="kfs-dr-drop flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 999, color: T.inkFaint }}>
          <Icon name="x" size={11} sw={2} />
        </button>
      )}
    </div>
  );
}

// 改字的那一块（点了一件，在它底下摊开）：名字、描述；锁着的写为什么删不了
function Editor({ x, onSave, onCancel, note }) {
  const [name, setName] = useState(x.name);
  const [desc, setDesc] = useState(x.description || "");
  return (
    <div className="kfs-dr-edit flex flex-col" style={{ gap: 8, padding: "8px 2px 4px" }}>
      <input className="kfs-field kfs-dr-edit-name" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="名字" style={field} />
      <textarea className="kfs-field kfs-dr-edit-desc" value={desc} maxLength={DESC_MAX} onChange={(e) => setDesc(e.target.value)} placeholder="描述（可以空；他翻衣柜的时候看得见）" rows={2} style={{ ...field, resize: "none", lineHeight: 1.6 }} />
      {x.lock && <span className="kfs-dr-why" style={{ ...SMALL, margin: "0 2px" }}>删不了：{x.lock}</span>}
      {note && <span className="kfs-dr-editmsg" style={{ ...SMALL, margin: "0 2px" }}>{note}</span>}
      <div className="flex" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onCancel} className="kfs-dr-cancel kfs-tap" style={{ ...pill(false), padding: "8px 16px" }}>
          算了
        </button>
        <button onClick={() => onSave(name, desc)} className="kfs-dr-save kfs-tap" style={{ ...chipPrimary, padding: "8px 18px" }}>
          存
        </button>
      </div>
    </div>
  );
}

export function DressingCloset({ state, closet, onCloset, onClose }) {
  const got = (state && state.unlockedRewards) || [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null); // 翻全部里点开的那一样
  const [editing, setEditing] = useState(null); // 在改字的那一件（编号）
  const [editNote, setEditNote] = useState("");
  const [addCat, setAddCat] = useState("outfit");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [note, setNote] = useState(""); // 加没加上那一句
  const [undo, setUndo] = useState(null); // 刚删的那一件
  const [arm, setArm] = useState(null); // 叉点了一下、等着再点一下的那一件
  const armT = useRef(null);
  useEffect(() => () => clearTimeout(armT.current), []);
  const armIt = (id) => {
    clearTimeout(armT.current);
    setArm(id);
    armT.current = setTimeout(() => setArm(null), 3000);
  };
  const view = useMemo(() => closetView(closet, got), [closet, got.join(",")]);
  const gone = useMemo(() => droppedView(closet), [closet]);
  const hits = useMemo(() => findItems(closet, q, got), [closet, q, got.join(",")]);

  const edit = (id) => {
    setEditNote("");
    setEditing(editing === id ? null : id);
  };
  const save = (id, n, d) => {
    const r = editItem(closet, id, { name: n, description: d });
    if (r.why) return setEditNote(r.why);
    onCloset(r.rec);
    setEditing(null);
  };
  const drop = (id) => {
    clearTimeout(armT.current);
    setArm(null);
    const r = dropItem(closet, id);
    if (r.why) return setNote(r.why);
    onCloset(r.rec);
    setUndo(r.dropped);
    if (editing === id) setEditing(null);
  };
  const back = () => {
    if (!undo) return;
    onCloset(undropItem(closet, undo.id));
    setUndo(null);
  };
  // 删掉的那一栏里放回去一件
  const restore = (id) => {
    onCloset(undropItem(closet, id));
    if (undo && undo.id === id) setUndo(null);
  };
  const add = () => {
    const r = addItem(closet, addCat, { name, description: desc });
    if (r.why) return setNote(r.why);
    onCloset(r.rec);
    setName("");
    setDesc("");
    setNote(`加上了：${CATEGORY_LABELS[addCat]} · ${r.item.name}`);
  };
  const row = (x, label = "") => (
    <div key={x.id}>
      <Item x={x} label={label} editing={editing === x.id} armed={arm === x.id} onEdit={() => edit(x.id)} onArm={() => armIt(x.id)} onDrop={() => drop(x.id)} />
      {editing === x.id && <Editor x={x} note={editNote} onCancel={() => setEditing(null)} onSave={(n, d) => save(x.id, n, d)} />}
    </div>
  );

  return (
    <Sheet title="衣柜" onClose={onClose} look="room" sub={SUB}>
      {undo && (
        <div className="kfs-dr-undo flex items-center justify-between" style={{ ...flat(0.6), borderRadius: 14, padding: "8px 8px 8px 14px", marginBottom: 12, fontSize: 13, color: T.inkSoft, gap: 8 }}>
          <span className="min-w-0 truncate">删了「{undo.name}」</span>
          <button onClick={back} className="kfs-dr-undo-btn kfs-tap flex-shrink-0" style={{ ...pill(false), padding: "5px 12px" }}>
            撤销
          </button>
        </div>
      )}

      {gone.length > 0 && !undo && (
        <p className="kfs-dr-gonehint" style={{ ...SMALL, margin: "0 2px 12px" }}>
          删掉的 {gone.length} 件在最底下，能放回去。
        </p>
      )}
      <div style={{ ...H, marginTop: 0 }}>找一件</div>
      <input className="kfs-field kfs-dr-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜一个字、一个词" style={field} />
      {q.trim() && (
        <div className="kfs-dr-hits flex flex-col" style={{ gap: 6, marginTop: 10 }}>
          {hits.length ? hits.map((x) => row(x, x.label)) : <span style={{ fontSize: 13, color: T.inkFaint, margin: "2px" }}>没找到</span>}
        </div>
      )}

      <div style={H}>加一件</div>
      <div className="kfs-dr-addcats flex flex-wrap" style={{ gap: 6, marginBottom: 10 }}>
        {CATS.map((c) => (
          <button key={c} onClick={() => setAddCat(c)} aria-pressed={addCat === c} className="kfs-tap" style={pill(addCat === c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="flex flex-col" style={{ gap: 8 }}>
        <input className="kfs-field kfs-dr-new-name" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={`往「${CATEGORY_LABELS[addCat]}」里加一件：名字`} style={field} />
        <textarea className="kfs-field kfs-dr-new-desc" value={desc} maxLength={DESC_MAX} onChange={(e) => setDesc(e.target.value)} placeholder="描述（可以空；他翻衣柜的时候看得见）" rows={2} style={{ ...field, resize: "none", lineHeight: 1.6 }} />
      </div>
      <div className="flex" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={add} className="kfs-dr-add kfs-tap" style={{ ...chipPrimary, padding: "10px 18px" }}>
          加上
        </button>
      </div>
      {note && (
        <div className="kfs-dr-msg" style={{ fontSize: 13, color: T.inkSoft, margin: "10px 2px 0" }}>
          {note}
        </div>
      )}

      <div style={H}>翻全部</div>
      <div className="kfs-dr-all" style={{ borderTop: HAIRLINE }}>
        {view.map((g) => (
          <div key={g.cat} style={{ borderBottom: HAIRLINE }}>
            <button onClick={() => setOpen(open === g.cat ? null : g.cat)} aria-expanded={open === g.cat} className="kfs-dr-open w-full flex items-center justify-between" data-cat={g.cat} style={{ padding: "12px 2px", color: T.ink, fontSize: 14.5 }}>
              <span style={{ fontFamily: SERIF, letterSpacing: "0.06em" }}>
                {g.label}{" "}
                <span style={{ fontSize: 12, color: T.inkFaint, fontFamily: "inherit" }}>
                  {g.items.length} {UNIT[g.cat] || "件"}
                </span>
              </span>
              <span style={{ color: T.inkFaint }}>
                <Icon name={open === g.cat ? "chevD" : "chevR"} size={16} />
              </span>
            </button>
            {open === g.cat && (
              <div className="kfs-dr-list flex flex-col" style={{ gap: 6, padding: "0 0 14px" }}>
                {g.items.map((x) => row(x))}
              </div>
            )}
          </div>
        ))}
      </div>
      {gone.length > 0 && (
        <>
          <div style={H}>删掉的</div>
          <div className="kfs-dr-gone flex flex-col" style={{ gap: 6 }}>
            {gone.map((x) => (
              <div key={x.id} className="kfs-dr-goneitem flex items-center justify-between" data-id={x.id} style={{ ...flat(0.5), borderRadius: 14, padding: "8px 8px 8px 12px", gap: 8 }}>
                <span className="min-w-0">
                  <span className="block" style={{ fontSize: 11.5, color: T.inkFaint }}>{x.label}</span>
                  <span className="kfs-dr-name block" style={{ fontFamily: SERIF, fontSize: 14, color: T.ink, letterSpacing: "0.04em" }}>
                    {x.name}
                    {x.mine && <span style={{ fontSize: 11.5, color: T.inkFaint, marginLeft: 6 }}>新添</span>}
                  </span>
                </span>
                <button onClick={() => restore(x.id)} className="kfs-dr-restore kfs-tap flex-shrink-0" style={{ ...pill(false), padding: "5px 12px" }}>
                  放回去
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <p style={{ ...SMALL, color: T.inkFaint, margin: "12px 2px 0" }}>点叉要再点一下“删掉”才删；删错了，在“删掉的”里放回去。写着“锁”的是成就要用的，只能改字，删不了。新添的不算看风格的那几条成就。</p>
    </Sheet>
  );
}

// ---------- 成就 ----------
export function DressingAchievements({ state, closet, onClose }) {
  const v = achievementsView(state, closet);
  return (
    <Sheet title="成就" onClose={onClose} look="room" sub={SUB}>
      <p className="kfs-dr-lit" style={{ fontSize: 14, color: T.ink, margin: "0 2px 12px", letterSpacing: "0.04em" }}>
        点亮了 {v.lit} 个，一共 {v.total} 个。
      </p>
      <div className="kfs-dr-achs" style={{ borderTop: HAIRLINE }}>
        {v.list.map((a) => (
          <div key={a.id} className={`kfs-dr-ach${a.on ? " on" : ""}`} data-id={a.id} style={{ borderBottom: HAIRLINE, padding: "9px 2px", opacity: a.on ? 1 : 0.42 }}>
            <div style={{ fontFamily: SERIF, fontSize: 14.5, color: T.ink, letterSpacing: "0.04em" }}>{a.name}</div>
            <div style={{ ...SMALL, marginTop: 1 }}>{a.description}</div>
          </div>
        ))}
      </div>
      <div style={H}>攒成就换来的</div>
      <p className="kfs-dr-next" style={{ ...SMALL, margin: "0 2px 8px" }}>
        {v.next ? `下一份：点亮 ${v.next} 个以后。` : "都拿到了。"}
      </p>
      <div className="kfs-dr-rewards" style={{ borderTop: HAIRLINE }}>
        {v.rewards.map((r) => (
          <div key={r.id} className={`kfs-dr-reward${r.on ? " on" : ""}`} data-id={r.id} style={{ borderBottom: HAIRLINE, padding: "9px 2px", opacity: r.on ? 1 : 0.42 }}>
            <div className="flex items-baseline" style={{ gap: 10 }}>
              <span className="flex-shrink-0" style={{ fontSize: 12, color: T.inkSoft, width: 58 }}>
                点亮 {r.milestone} 个
              </span>
              <span style={{ fontFamily: SERIF, fontSize: 14.5, color: T.ink, letterSpacing: "0.04em" }}>{r.name}</span>
            </div>
            {r.description && <div style={{ ...SMALL, marginTop: 1, paddingLeft: 68 }}>{r.description}</div>}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
