// =====================================================
// 头像册（“头像与设置”里点“头像册”进来）：她存好的头像。见 avatarBook.js；一行怎么点（小图、钢笔、左滑）见 BookRows.jsx。
// 一行一张卡片，从左到右：小图、名字、名字后面一支钢笔、最右边一个方格。
//   - 方格：点了才换成这一张，正在用的那一行格子里打着勾；已经打勾的再点不动。点卡片别的地方不换。
//   - 小图：点一下，这张图放大了摆在这张卡片下面正中（圆角方的，整张都看得见）；再点小图、点大图收起来。一次只放大一张。
//   - 钢笔改名字、左滑删除：见 BookRows.jsx。删掉正在用的那一张，头像不变。
// 最上面两颗钮：“添一张”（从相册选，起个名字，存进来；不换头像）、“把现在用的存进来”（眼下那张不在册子里才有）。
// =====================================================
import { useRef, useState } from "react";
import { fileToAvatar } from "../images.js";
import { T, glass, chip, chipPrimary, field, HAIRLINE } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { Avatar, avatarSrc } from "../ui/Avatar.jsx";
import { sameAv } from "../prompt/messages.js";
import { BOOK_MAX, LABEL_MAX, canAdd, inBook } from "../avatarBook.js";
import { useBookRows, BookRow } from "./BookRows.jsx";

const small = { fontSize: 12, color: T.inkSoft, lineHeight: 1.6 };
const BIG = 196; // 放大出来的那张图多大

export function AvatarBook({ list, av, onUse, onAdd, onDrop, onRename }) {
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null); // 选好了、还没起名字的那一张 { av }
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const rows = useBookRows({ list, onDrop, onRename });
  const { shut, big, setBig } = rows;
  const full = list.length >= BOOK_MAX;
  const keepable = !pending && canAdd(list, av);

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
          return (
            <BookRow
              key={e.id}
              e={e}
              rows={rows}
              using={using}
              tail={
                <button
                  onClick={() => {
                    if (e.av && !using) onUse(e.av);
                  }}
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
              }
              below={
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
              }
            />
          );
        })}
      </div>
    </div>
  );
}
