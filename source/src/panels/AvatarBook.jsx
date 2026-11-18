// =====================================================
// 头像册（“头像与设置”里点“头像册”进来）。见 avatarBook.js。
// 一行一张卡片，从左到右：小图、名字、名字后面一支钢笔、最右边一个方格。
//   - 方格：点了才换成这一张，正在用的那一行格子里打着勾；已经打勾的再点不动。点卡片别的地方不换。
//   - 小图：点一下，这张图放大了摆在这张卡片下面正中（圆角方的，整张都看得见）；再点小图、点大图收起来。一次只放大一张。
//   - 钢笔：就地改名字，回车、点对勾、点别处都算改好；清空了、没动的不改（照账户面板最上面改昵称那一套）。
//   - 左滑：卡片右边让开一截，露出垃圾桶；点垃圾桶变成“再点一次删掉”，再点才删（三秒没点变回垃圾桶）。
//     往右滑回去、点别处、去滑另一行，都收回去。删掉正在用的那一张，头像不变。
//     让开是卡片从右边收窄（改的是右边距），不是整张往左挪：左边的小图和名字一直看得见。
// 最上面两颗钮：“添一张”（从相册选，起个名字，存进来；不换头像）、“把现在用的存进来”（眼下那张不在册子里才有）。
// =====================================================
import { useEffect, useRef, useState } from "react";
import { fileToAvatar } from "../images.js";
import { T, glass, chip, chipPrimary, field, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Avatar, avatarSrc } from "../ui/Avatar.jsx";
import { sameAv } from "../prompt/messages.js";
import { BOOK_MAX, LABEL_MAX, REVEAL, REVEAL_ARMED, canAdd, inBook, swipeDir, revealAt, staysOpen } from "../avatarBook.js";

const small = { fontSize: 12, color: T.inkSoft, lineHeight: 1.6 };
const EASE = "cubic-bezier(.2,.8,.2,1)";
const BIG = 196; // 放大出来的那张图多大
const SWALLOW_MS = 350; // 划完松手以后这么久里的那一下点击不算数（那是松手带出来的）

export function AvatarBook({ list, av, onUse, onAdd, onDrop, onRename }) {
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null); // 选好了、还没起名字的那一张 { av }
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(null); // 左滑开着（垃圾桶露着）的那一行的 id
  const [armed, setArmed] = useState(null); // 垃圾桶点过一次的那一行的 id
  const [drag, setDrag] = useState(null); // 手指正拖着的那一行 { id, reveal }
  const [big, setBig] = useState(null); // 小图放大着的那一行的 id
  const [edit, setEdit] = useState(null); // 正在改名字的那一行 { id, draft }
  const editRef = useRef(null);
  editRef.current = edit;
  const swipe = useRef(null); // 这一回手指：{ id, pid, x, y, base, dir, reveal }
  const swipedAt = useRef(0); // 上一回划完松手是什么时候
  const full = list.length >= BOOK_MAX;
  const keepable = !pending && canAdd(list, av);

  const shut = () => {
    setOpen(null);
    setArmed(null);
  };

  // 垃圾桶点了一次没再点：三秒以后变回垃圾桶（还开着）
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  // 有一行开着的时候，点别处（册子里外都算）就收回去；点的是那只垃圾桶不收
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (Date.now() - swipedAt.current < SWALLOW_MS) return;
      if (e.target && e.target.closest && e.target.closest(".kfs-avbook-bin")) return;
      shut();
    };
    document.addEventListener("click", away, true);
    return () => document.removeEventListener("click", away, true);
  }, [open]);

  // 开着、放大着的那一行没了（删了、别的设备删了）：记着的也清掉
  useEffect(() => {
    if (open && !list.some((e) => e.id === open)) shut();
    if (big && !list.some((e) => e.id === big)) setBig(null);
  }, [list]);

  // ---- 左滑 ----
  const onDown = (ev, e) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (editRef.current && editRef.current.id === e.id) return; // 正在改名字的那一行不划
    if (open && open !== e.id) shut(); // 去划另一行：原来开着的收回去
    swipe.current = { id: e.id, pid: ev.pointerId, x: ev.clientX, y: ev.clientY, base: open === e.id ? REVEAL : 0, dir: null, reveal: 0 };
  };
  const onMove = (ev) => {
    const s = swipe.current;
    if (!s || s.pid !== ev.pointerId) return;
    const dx = ev.clientX - s.x;
    const dy = ev.clientY - s.y;
    if (!s.dir) {
      s.dir = swipeDir(dx, dy);
      if (!s.dir) return;
      if (s.dir === "v") {
        swipe.current = null;
        return;
      }
      try {
        ev.currentTarget.setPointerCapture(ev.pointerId);
      } catch (x) {}
      setArmed(null);
    }
    s.reveal = revealAt(s.base, dx);
    setDrag({ id: s.id, reveal: s.reveal });
  };
  const onUp = (ev) => {
    const s = swipe.current;
    if (!s || s.pid !== ev.pointerId) return;
    swipe.current = null;
    if (s.dir !== "h") return;
    swipedAt.current = Date.now();
    setDrag(null);
    if (staysOpen(s.reveal)) setOpen(s.id);
    else shut();
  };
  // 划完松手带出来的那一下点击：不算数（不然刚划开就被当成“点别处”收回去，或者点着了方格）
  const swallow = (ev) => {
    if (Date.now() - swipedAt.current < SWALLOW_MS) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  };

  // ---- 改名字 ----
  const startEdit = (e) => {
    shut();
    setEdit({ id: e.id, draft: e.label });
  };
  const endEdit = (save) => {
    const cur = editRef.current;
    if (!cur) return;
    editRef.current = null;
    setEdit(null);
    if (save) onRename(cur.id, cur.draft);
  };
  // 改到一半直接把册子关了（输入框来不及失去焦点）：写了的也算数
  useEffect(() => () => {
    const cur = editRef.current;
    if (cur) onRename(cur.id, cur.draft);
  }, []);

  // ---- 添 ----
  const start = (nextAv) => {
    shut();
    setNote("");
    setLabel("");
    setPending({ av: nextAv });
  };
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const data = await fileToAvatar(f);
      const next = { type: "upload", data };
      if (inBook(list, next)) setNote("这一张册子里已经有了");
      else start(next);
    } catch (x) {
      setNote("这张图读不出来，换一张试试");
    }
  };
  const save = () => {
    if (!pending) return;
    const ok = onAdd(pending.av, label);
    setNote(ok ? "" : "没存进去");
    setPending(null);
    setLabel("");
  };

  return (
    <div className="kfs-avbook">
      <div className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => !full && fileRef.current && fileRef.current.click()}
          disabled={full}
          className="kfs-tap kfs-avbook-add"
          style={{ ...chipPrimary, opacity: full ? 0.45 : 1 }}
        >
          添一张
        </button>
        {keepable && (
          <button onClick={() => start(av)} className="kfs-tap kfs-avbook-keep" style={chip}>
            把现在用的存进来
          </button>
        )}
        {full && <span style={small}>满了，最多 {BOOK_MAX} 张</span>}
      </div>
      <input ref={fileRef} className="kfs-avbook-file" type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
      {note && <div className="kfs-avbook-note" style={{ fontSize: 12, color: T.red2, marginBottom: 10 }}>{note}</div>}

      {pending && (
        <div className="kfs-avbook-new" style={{ ...glass(0.5, 16), borderRadius: 18, padding: 12, marginBottom: 12 }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <Avatar av={pending.av} who="her" size={48} />
            <input
              className="kfs-avbook-name flex-1 min-w-0"
              value={label}
              onChange={(e) => setLabel(Array.from(e.target.value).slice(0, LABEL_MAX).join(""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
              }}
              placeholder="起个名字"
              aria-label="起个名字"
              enterKeyHint="done"
              style={{ ...field, padding: "9px 12px" }}
            />
          </div>
          <div className="flex justify-end" style={{ gap: 8, marginTop: 10 }}>
            <button onClick={() => { setPending(null); setLabel(""); }} className="kfs-tap" style={chip}>
              不存了
            </button>
            <button onClick={save} className="kfs-tap kfs-avbook-save" style={chipPrimary}>
              存进去
            </button>
          </div>
        </div>
      )}

      {list.length === 0 && !pending && <div className="kfs-avbook-empty" style={{ ...small, padding: "18px 2px" }}>册子里还空着</div>}

      <div className="flex flex-col" style={{ gap: 8 }}>
        {list.map((e) => {
          const using = !!(e.av && av && sameAv(e.av, av));
          const editing = !!(edit && edit.id === e.id);
          const dragging = !!(drag && drag.id === e.id);
          const isOpen = open === e.id;
          const isArmed = isOpen && armed === e.id;
          const reveal = dragging ? drag.reveal : isOpen ? (isArmed ? REVEAL_ARMED : REVEAL) : 0;
          const shown = Math.min(1, reveal / REVEAL); // 垃圾桶露出来几成
          const move = dragging ? "none" : `.22s ${EASE}`;
          const thumb = e.av ? (
            <Avatar av={e.av} who="her" size={44} />
          ) : (
            <div className="flex-shrink-0" style={{ width: 44, height: 44, borderRadius: "50%", border: HAIRLINE, background: "rgba(var(--k-soft),0.1)" }} />
          );
          return (
            <div key={e.id} className="kfs-avbook-item" data-open={isOpen ? "1" : undefined} onClickCapture={swallow}>
              <div style={{ position: "relative" }}>
                {/* 垃圾桶：垫在卡片右边让出来的那一截里。卡片没让开的时候是透明的、点不着 */}
                <button
                  onClick={() => {
                    if (!isOpen) return;
                    if (isArmed) {
                      shut();
                      onDrop(e.id);
                    } else setArmed(e.id);
                  }}
                  tabIndex={isOpen ? 0 : -1}
                  aria-hidden={isOpen ? undefined : "true"}
                  aria-label={isArmed ? undefined : `删掉：${e.label}`}
                  className="kfs-avbook-bin flex items-center justify-center"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "50%",
                    height: 44,
                    width: isArmed ? REVEAL_ARMED - 12 : 44,
                    marginTop: -22,
                    borderRadius: 15,
                    background: T.red2,
                    color: "#fff",
                    fontSize: 12.5,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    opacity: shown,
                    transform: `scale(${0.5 + 0.5 * shown})`,
                    transition: dragging ? "none" : `opacity ${move}, transform ${move}, width ${move}`,
                    pointerEvents: isOpen ? "auto" : "none",
                    boxShadow: "0 6px 14px rgba(var(--k-red-2),0.28)",
                  }}
                >
                  {isArmed ? "再点一次删掉" : <Icon name="trash" size={18} />}
                </button>
                <div
                  className="kfs-avbook-row flex items-center"
                  data-using={using ? "1" : undefined}
                  data-kind={e.pic ? "pic" : "meme"}
                  onPointerDown={(ev) => onDown(ev, e)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  style={{
                    ...glass(0.5, 16),
                    position: "relative",
                    borderRadius: 18,
                    padding: "8px 12px 8px 10px",
                    gap: 12,
                    marginRight: reveal,
                    transition: dragging ? "none" : `margin-right ${move}`,
                    touchAction: "pan-y",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                  }}
                >
                  <button
                    onClick={() => e.av && setBig(big === e.id ? null : e.id)}
                    disabled={!e.av}
                    aria-label={`${big === e.id ? "收起大图" : "看大图"}：${e.label}`}
                    aria-expanded={big === e.id}
                    className="kfs-tap kfs-avbook-thumb flex-shrink-0"
                    style={{ borderRadius: "50%" }}
                  >
                    {thumb}
                  </button>
                  {editing ? (
                    <>
                      <input
                        className="kfs-avbook-rename kfs-field flex-1 min-w-0"
                        value={edit.draft}
                        onChange={(ev) => setEdit({ id: e.id, draft: Array.from(ev.target.value).slice(0, LABEL_MAX).join("") })}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" && !ev.nativeEvent.isComposing && ev.keyCode !== 229) {
                            ev.preventDefault();
                            endEdit(true);
                          } else if (ev.key === "Escape") {
                            endEdit(false);
                          }
                        }}
                        onFocus={(ev) => {
                          // 一进来就把旧名字全选上，直接打字就是换掉
                          const el = ev.target;
                          try {
                            el.setSelectionRange(0, el.value.length);
                          } catch (x) {}
                        }}
                        onBlur={() => endEdit(true)}
                        autoFocus
                        aria-label={`改名字：${e.label}`}
                        enterKeyHint="done"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        style={{ ...field, padding: "7px 12px", borderRadius: 12, userSelect: "text", WebkitUserSelect: "text" }}
                      />
                      <button
                        onClick={() => endEdit(true)}
                        onMouseDown={(ev) => ev.preventDefault()}
                        aria-label="改好了"
                        className="kfs-tap kfs-avbook-renamed flex-shrink-0 flex items-center justify-center"
                        style={{ width: 32, height: 32, borderRadius: 999, color: T.onDai, background: T.daiGrad }}
                      >
                        <Icon name="check" size={16} sw={2.2} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center flex-1 min-w-0" style={{ gap: 2 }}>
                        <span className="kfs-avbook-label min-w-0 truncate" style={{ fontSize: 15, color: T.ink }}>{e.label}</span>
                        <button
                          onClick={() => startEdit(e)}
                          aria-label={`改名字：${e.label}`}
                          className="kfs-tap kfs-avbook-pen flex-shrink-0 flex items-center justify-center"
                          style={{ width: 32, height: 32, borderRadius: 999, color: T.inkSoft }}
                        >
                          <Icon name="pen" size={16} />
                        </button>
                        {!e.av && <span className="flex-shrink-0" style={{ fontSize: 12, color: T.inkFaint }}>图还在路上</span>}
                      </div>
                      <button
                        onClick={() => { if (e.av && !using) onUse(e.av); }}
                        disabled={!e.av}
                        role="checkbox"
                        aria-checked={using}
                        aria-label={`用这张：${e.label}`}
                        className="kfs-tap kfs-avbook-check flex-shrink-0 flex items-center justify-center"
                        style={{ width: 40, height: 40, marginRight: -6 }}
                      >
                        <span
                          className="flex items-center justify-center"
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 7,
                            border: using ? "none" : "1.5px solid rgba(var(--k-soft),0.45)",
                            background: using ? T.daiGrad : "transparent",
                            color: T.onDai,
                            opacity: e.av ? 1 : 0.4,
                          }}
                        >
                          {using && <Icon name="check" size={15} sw={2.4} />}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
              {big === e.id && e.av && (
                <div className="kfs-avbook-big flex justify-center" style={{ padding: "10px 0 4px" }}>
                  <button onClick={() => setBig(null)} aria-label={`收起大图：${e.label}`} className="kfs-in" style={{ display: "block", borderRadius: 26 }}>
                    <img
                      src={avatarSrc(e.av)}
                      alt={e.label}
                      draggable={false}
                      style={{ display: "block", width: BIG, height: BIG, borderRadius: 26, objectFit: "cover", border: HAIRLINE, boxShadow: "0 10px 26px rgba(var(--k-shade),0.2)" }}
                    />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
