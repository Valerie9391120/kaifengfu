// =====================================================
// 头像册里的一行（她那本 panels/AvatarBook.jsx、他那本 panels/HisBook.jsx 共用）。
// 一张卡片，从左到右：小图、名字、名字后面一支钢笔，最右边是各家自己的东西（她那本是打勾的方格，他那本是“在用”几个字）。
//   - 小图：点一下，卡片下面展开各家自己的东西（她那本是放大的图，他那本是图加描述）；再点收起来。一次只展开一行。
//   - 钢笔：就地改名字，回车、点对勾、点别处都算改好；Esc 不改（照账户面板最上面改昵称那一套）。
//   - 左滑：卡片右边让开一截，露出垃圾桶；点垃圾桶变成“再点一次删掉”，再点才删（三秒没点变回垃圾桶）。
//     往右滑回去、点别处、去滑另一行，都收回去。
//     让开是卡片从右边收窄（改的是右边距），不是整张往左挪：左边的小图和名字一直看得见。
// useBookRows 管这几样的状态；BookRow 画一行。
// =====================================================
import { useEffect, useRef, useState } from "react";
import { T, glass, field, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { LABEL_MAX, REVEAL, REVEAL_ARMED, swipeDir, revealAt, staysOpen } from "../avatarBook.js";

const EASE = "cubic-bezier(.2,.8,.2,1)";
const SWALLOW_MS = 350; // 划完松手以后这么久里的那一下点击不算数（那是松手带出来的）

export function useBookRows({ list, onDrop, onRename }) {
  const [open, setOpen] = useState(null); // 左滑开着（垃圾桶露着）的那一行的 id
  const [armed, setArmed] = useState(null); // 垃圾桶点过一次的那一行的 id
  const [drag, setDrag] = useState(null); // 手指正拖着的那一行 { id, reveal }
  const [big, setBig] = useState(null); // 展开着的那一行的 id
  const [edit, setEdit] = useState(null); // 正在改名字的那一行 { id, draft }
  const editRef = useRef(null);
  editRef.current = edit;
  const renameRef = useRef(onRename);
  renameRef.current = onRename;
  const swipe = useRef(null); // 这一回手指：{ id, pid, x, y, base, dir, reveal }
  const swipedAt = useRef(0); // 上一回划完松手是什么时候

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

  // 开着、展开着的那一行没了（删了、别的设备删了）：记着的也清掉
  useEffect(() => {
    if (open && !list.some((e) => e.id === open)) shut();
    if (big && !list.some((e) => e.id === big)) setBig(null);
  }, [list]);

  // ---- 左滑 ----
  const onDown = (ev, e) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (editRef.current && editRef.current.id === e.id) return; // 正在改名字的那一行不划
    if (ev.target && ev.target.closest && ev.target.closest("textarea, input")) return; // 手指落在输入框里：是在选字，不划
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
  // 划完松手带出来的那一下点击：不算数（不然刚划开就被当成“点别处”收回去，或者点着了别的）
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
    if (save) renameRef.current(cur.id, cur.draft);
  };
  // 改到一半直接把册子关了（输入框来不及失去焦点）：写了的也算数
  useEffect(
    () => () => {
      const cur = editRef.current;
      if (cur) renameRef.current(cur.id, cur.draft);
    },
    []
  );

  return { open, armed, drag, big, edit, setArmed, setBig, setEdit, shut, onDown, onMove, onUp, swallow, startEdit, endEdit, onDrop };
}

// e：这一行 { id, label, av, pic }；rows：useBookRows 交回来的那一包；
// tail：最右边摆的东西（改名字的工夫里不摆）；below：展开以后卡片下面摆的东西（没展开不摆）；
// using：是不是正用着的那一张（只是在卡片上记一笔 data-using）；openWord / closeWord：小图那颗钮念出来的字
export function BookRow({ e, rows, tail = null, below = null, using = false, openWord = "看大图", closeWord = "收起大图" }) {
  const { open, armed, drag, big, edit } = rows;
  const editing = !!(edit && edit.id === e.id);
  const dragging = !!(drag && drag.id === e.id);
  const isOpen = open === e.id;
  const isArmed = isOpen && armed === e.id;
  const isBig = big === e.id;
  const reveal = dragging ? drag.reveal : isOpen ? (isArmed ? REVEAL_ARMED : REVEAL) : 0;
  const shown = Math.min(1, reveal / REVEAL); // 垃圾桶露出来几成
  const move = dragging ? "none" : `.22s ${EASE}`;
  return (
    <div className="kfs-avbook-item" data-open={isOpen ? "1" : undefined} onClickCapture={rows.swallow}>
      <div style={{ position: "relative" }}>
        {/* 垃圾桶：垫在卡片右边让出来的那一截里。卡片没让开的时候是透明的、点不着 */}
        <button
          onClick={() => {
            if (!isOpen) return;
            if (isArmed) {
              rows.shut();
              rows.onDrop(e.id);
            } else rows.setArmed(e.id);
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
          onPointerDown={(ev) => rows.onDown(ev, e)}
          onPointerMove={rows.onMove}
          onPointerUp={rows.onUp}
          onPointerCancel={rows.onUp}
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
            onClick={() => e.av && rows.setBig(isBig ? null : e.id)}
            disabled={!e.av}
            aria-label={`${isBig ? closeWord : openWord}：${e.label}`}
            aria-expanded={isBig}
            className="kfs-tap kfs-avbook-thumb flex-shrink-0"
            style={{ borderRadius: "50%" }}
          >
            {e.av ? (
              <Avatar av={e.av} who="her" size={44} />
            ) : (
              <div className="flex-shrink-0" style={{ width: 44, height: 44, borderRadius: "50%", border: HAIRLINE, background: "rgba(var(--k-soft),0.1)" }} />
            )}
          </button>
          {editing ? (
            <>
              <input
                className="kfs-avbook-rename kfs-field flex-1 min-w-0"
                value={edit.draft}
                onChange={(ev) => rows.setEdit({ id: e.id, draft: Array.from(ev.target.value).slice(0, LABEL_MAX).join("") })}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && !ev.nativeEvent.isComposing && ev.keyCode !== 229) {
                    ev.preventDefault();
                    rows.endEdit(true);
                  } else if (ev.key === "Escape") {
                    rows.endEdit(false);
                  }
                }}
                onFocus={(ev) => {
                  // 一进来就把旧名字全选上，直接打字就是换掉
                  const el = ev.target;
                  try {
                    el.setSelectionRange(0, el.value.length);
                  } catch (x) {}
                }}
                onBlur={() => rows.endEdit(true)}
                autoFocus
                aria-label={`改名字：${e.label}`}
                enterKeyHint="done"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                style={{ ...field, padding: "7px 12px", borderRadius: 12, userSelect: "text", WebkitUserSelect: "text" }}
              />
              <button
                onClick={() => rows.endEdit(true)}
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
                <span className="kfs-avbook-label min-w-0 truncate" style={{ fontSize: 15, color: T.ink }}>
                  {e.label}
                </span>
                <button
                  onClick={() => rows.startEdit(e)}
                  aria-label={`改名字：${e.label}`}
                  className="kfs-tap kfs-avbook-pen flex-shrink-0 flex items-center justify-center"
                  style={{ width: 32, height: 32, borderRadius: 999, color: T.inkSoft }}
                >
                  <Icon name="pen" size={16} />
                </button>
                {!e.av && (
                  <span className="flex-shrink-0" style={{ fontSize: 12, color: T.inkFaint }}>
                    图还在路上
                  </span>
                )}
              </div>
              {tail}
            </>
          )}
        </div>
      </div>
      {isBig && e.av && below}
    </div>
  );
}
