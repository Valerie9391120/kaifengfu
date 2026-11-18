// =====================================================
// 头像册（“头像与设置”里点“头像册”进来）。见 avatarBook.js。
// 一行一张图、一个名字：点哪一行就换成哪张，眼下用着的那一行后面写“在用”。
// 最上面两颗钮：“添一张”（从相册选，起个名字，存进来；不换头像）、“把现在用的存进来”（眼下那张不在册子里才有）。
// 每一行最右边一支钢笔、一个小桶。钢笔：就地改名字，回车、点对勾、点别处都算改好；清空了、没动的不改（照账户面板最上面改昵称那一套）。
// 小桶：点一下变成“再点一次删掉”，再点才删；删掉正在用的那一张，头像不变。
// =====================================================
import { useEffect, useRef, useState } from "react";
import { fileToAvatar } from "../images.js";
import { T, glass, chip, chipPrimary, field, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { sameAv } from "../prompt/messages.js";
import { BOOK_MAX, LABEL_MAX, canAdd, inBook } from "../avatarBook.js";

const small = { fontSize: 12, color: T.inkSoft, lineHeight: 1.6 };

export function AvatarBook({ list, av, onUse, onAdd, onDrop, onRename }) {
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null); // 选好了、还没起名字的那一张 { av }
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState(null); // 点过一次小桶的那一行的 id
  const [edit, setEdit] = useState(null); // 正在改名字的那一行 { id, draft }
  const editRef = useRef(null);
  editRef.current = edit;
  const full = list.length >= BOOK_MAX;
  const keepable = !pending && canAdd(list, av);

  // 小桶点了一次没再点：三秒以后收回去
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const startEdit = (e) => {
    setArmed(null);
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

  const start = (nextAv) => {
    setArmed(null);
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
          return (
            <div
              key={e.id}
              className="kfs-avbook-row flex items-center"
              data-using={using ? "1" : undefined}
              data-kind={e.pic ? "pic" : "meme"}
              style={{ ...glass(0.5, 16), borderRadius: 18, padding: "8px 8px 8px 10px", gap: 4 }}
            >
              {edit && edit.id === e.id ? (
                <div className="flex items-center flex-1 min-w-0" style={{ gap: 12, padding: "2px 0" }}>
                  {e.av ? (
                    <Avatar av={e.av} who="her" size={44} />
                  ) : (
                    <div className="flex-shrink-0" style={{ width: 44, height: 44, borderRadius: "50%", border: HAIRLINE, background: "rgba(var(--k-soft),0.1)" }} />
                  )}
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
                </div>
              ) : (
                <button
                  onClick={() => { setArmed(null); if (e.av) onUse(e.av); }}
                  disabled={!e.av}
                  aria-label={e.label}
                  className="kfs-tap kfs-avbook-use flex items-center flex-1 min-w-0 text-left"
                  style={{ gap: 12, padding: "2px 0" }}
                >
                  {e.av ? (
                    <Avatar av={e.av} who="her" size={44} />
                  ) : (
                    <div className="flex-shrink-0" style={{ width: 44, height: 44, borderRadius: "50%", border: HAIRLINE, background: "rgba(var(--k-soft),0.1)" }} />
                  )}
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 15, color: T.ink }}>{e.label}</span>
                  {using && <span className="kfs-avbook-using flex-shrink-0" style={{ fontSize: 12, color: T.inkSoft }}>在用</span>}
                  {!e.av && <span className="flex-shrink-0" style={{ fontSize: 12, color: T.inkFaint }}>图还在路上</span>}
                </button>
              )}
              {edit && edit.id === e.id ? (
                <button
                  onClick={() => endEdit(true)}
                  onMouseDown={(ev) => ev.preventDefault()}
                  aria-label="改好了"
                  className="kfs-tap kfs-avbook-renamed flex-shrink-0 flex items-center justify-center"
                  style={{ width: 32, height: 32, margin: "0 2px 0 6px", borderRadius: 999, color: T.onDai, background: T.daiGrad }}
                >
                  <Icon name="check" size={16} sw={2.2} />
                </button>
              ) : armed === e.id ? (
                <button
                  onClick={() => { setArmed(null); onDrop(e.id); }}
                  className="kfs-tap kfs-avbook-drop flex-shrink-0"
                  style={{ ...chip, padding: "7px 12px", fontSize: 12.5, color: T.red2 }}
                >
                  再点一次删掉
                </button>
              ) : (
                <>
                  <button
                    onClick={() => startEdit(e)}
                    aria-label={`改名字：${e.label}`}
                    className="kfs-tap kfs-avbook-pen flex-shrink-0 flex items-center justify-center"
                    style={{ width: 32, height: 36, borderRadius: 999, color: T.inkFaint }}
                  >
                    <Icon name="pen" size={15} />
                  </button>
                  <button
                    onClick={() => setArmed(e.id)}
                    aria-label={`删掉：${e.label}`}
                    className="kfs-tap kfs-avbook-drop flex-shrink-0 flex items-center justify-center"
                    style={{ width: 32, height: 36, borderRadius: 999, color: T.inkFaint }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
