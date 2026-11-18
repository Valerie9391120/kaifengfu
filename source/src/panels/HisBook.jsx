// =====================================================
// 他的头像册（“头像与设置”里他那张卡片上点“头像册”进来）：她给他攒的头像，他换头像只从这里挑。见 hisBook.js；
// 一行怎么点（小图、钢笔、左滑）见 BookRows.jsx，同她那本。不一样的地方：
//   - 没有打勾的方格：挑哪张是他自己的事。他正用着的那一行最右边写“在用”；还没有描述的写“没描述”（没描述的他挑不着）。
//   - 点小图，卡片下面展开：左边是图（圆角方的），右边一个圆角方框，里头是描述（画面、氛围两段），方框右下角是钮：
//     还没有描述的是“整理描述”（把图寄给他，他看着写）；有了的是“编辑”（她自己改）和“重写”（叫他再写一遍）。
//   - 添的时候必须起名字，名字不能跟册子里别的重（他写 [AVATAR:名字] 就是照名字认的）。添上以后那一行自己展开。
// 字都是照她 11 月 18 日说的摆的。
// =====================================================
import { useRef, useState } from "react";
import { fileToAvatar } from "../images.js";
import { T, glass, chip, chipPrimary, field, fill, HAIRLINE } from "../ui/style.js";
import { Avatar, avatarSrc } from "../ui/Avatar.jsx";
import { HIS_BOOK_MAX, DESC_MAX, described, hisLabel } from "../hisBook.js";
import { useBookRows, BookRow, imeProps, isSubmitKey } from "./BookRows.jsx";

const small = { fontSize: 12, color: T.inkSoft, lineHeight: 1.6 };
const PIC = 116; // 展开以后左边那张图多大
const WHY = {
  name: "得起个名字，他是照着名字挑的",
  dup: "册子里已经有叫这个名字的了",
  same: "这一张册子里已经有了",
  full: `满了，最多 ${HIS_BOOK_MAX} 张`,
  bad: "这张图读不出来，换一张试试",
};
const miniChip = { ...chip, padding: "5px 11px", fontSize: 12 };
const miniPrimary = { ...chipPrimary, padding: "5px 11px", fontSize: 12 };
const clip = (s) => Array.from(String(s || "")).slice(0, DESC_MAX).join("");

// 展开以后卡片下面那一块：左边图，右边描述的方框
function Detail({ e, busy, err, onEdit, onDescribe }) {
  const [draft, setDraft] = useState(null); // 她正在改的 { look, mood }；null 是没在改
  const has = described(e);
  const area = { ...field, width: "100%", padding: "7px 10px", borderRadius: 12, fontSize: 16, lineHeight: 1.45, resize: "none", userSelect: "text", WebkitUserSelect: "text" };
  const tag = { fontSize: 11.5, color: T.inkSoft, marginBottom: 2 };
  const words = { fontSize: 13, color: T.ink, lineHeight: 1.55, wordBreak: "break-word" };
  return (
    <div className="kfs-hisbook-detail kfs-in flex items-start" style={{ gap: 10, padding: "10px 0 4px" }}>
      <img
        className="kfs-hisbook-pic flex-shrink-0"
        src={avatarSrc(e.av)}
        alt={e.label}
        draggable={false}
        style={{ display: "block", width: PIC, height: PIC, borderRadius: 20, objectFit: "cover", border: HAIRLINE, boxShadow: "0 8px 20px rgba(var(--k-shade),0.16)" }}
      />
      <div
        className="kfs-hisbook-desc flex flex-col flex-1 min-w-0"
        data-state={draft ? "edit" : busy ? "busy" : has ? "has" : "none"}
        style={{ minHeight: PIC, borderRadius: 18, border: HAIRLINE, backgroundColor: fill(0.36), padding: "10px 12px 8px" }}
      >
        {draft ? (
          <>
            <div style={tag}>画面</div>
            <textarea className="kfs-hisbook-look kfs-field" rows={3} value={draft.look} {...imeProps((v) => setDraft((d) => (d ? { ...d, look: v } : d)), clip)} aria-label="画面" style={area} />
            <div style={{ ...tag, marginTop: 8 }}>氛围</div>
            <textarea className="kfs-hisbook-mood kfs-field" rows={2} value={draft.mood} {...imeProps((v) => setDraft((d) => (d ? { ...d, mood: v } : d)), clip)} aria-label="氛围" style={area} />
          </>
        ) : busy ? (
          <div className="kfs-hisbook-busy" style={{ ...words, color: T.inkSoft }}>
            他在看图，写着呢…
          </div>
        ) : has ? (
          <>
            <div style={tag}>画面</div>
            <div className="kfs-hisbook-look" style={words}>
              {e.look}
            </div>
            <div style={{ ...tag, marginTop: 8 }}>氛围</div>
            <div className="kfs-hisbook-mood" style={{ ...words, color: e.mood ? T.ink : T.inkFaint }}>
              {e.mood || "没写"}
            </div>
          </>
        ) : (
          <div className="kfs-hisbook-none" style={{ ...words, color: T.inkFaint }}>
            还没有描述
          </div>
        )}
        {err && !draft && !busy && (
          <div className="kfs-hisbook-err" style={{ fontSize: 12, color: T.red2, marginTop: 6, lineHeight: 1.5 }}>
            没写成：{err}
          </div>
        )}
        <div className="kfs-hisbook-acts flex justify-end" style={{ gap: 6, marginTop: "auto", paddingTop: 8 }}>
          {draft ? (
            <>
              <button onClick={() => setDraft(null)} className="kfs-tap" style={miniChip}>
                不改了
              </button>
              <button
                onClick={() => {
                  onEdit(e.id, draft.look, draft.mood);
                  setDraft(null);
                }}
                className="kfs-tap kfs-hisbook-done"
                style={miniPrimary}
              >
                好了
              </button>
            </>
          ) : has ? (
            <>
              <button onClick={() => setDraft({ look: e.look, mood: e.mood })} disabled={busy} className="kfs-tap kfs-hisbook-edit" style={{ ...miniChip, opacity: busy ? 0.45 : 1 }}>
                编辑
              </button>
              <button onClick={() => onDescribe(e.id, true)} disabled={busy} className="kfs-tap kfs-hisbook-redo" style={{ ...miniChip, opacity: busy ? 0.45 : 1 }}>
                重写
              </button>
            </>
          ) : (
            <button onClick={() => onDescribe(e.id, false)} disabled={busy} className="kfs-tap kfs-hisbook-write" style={{ ...miniPrimary, opacity: busy ? 0.45 : 1 }}>
              整理描述
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function HisBook({ list, av, busy = {}, errs = {}, onAdd, onDrop, onRename, onEdit, onDescribe }) {
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null); // 选好了、还没起名字的那一张 { av }
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  // 改名字：名字跟别的重了的说一声（没改）
  const rename = (id, draft) => {
    const why = onRename(id, draft);
    setNote(why ? `${WHY[why] || "没改成"}，没改` : "");
  };
  const rows = useBookRows({ list, onDrop, onRename: rename });
  const { shut, setBig } = rows;
  const full = list.length >= HIS_BOOK_MAX;

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const data = await fileToAvatar(f);
      if (list.some((x) => x.av && x.av.data === data)) {
        setNote(WHY.same);
        return;
      }
      shut();
      setNote("");
      setLabel("");
      setPending({ av: { type: "upload", data } });
    } catch (x) {
      setNote(WHY.bad);
    }
  };
  // 存进去：没添成（没起名字、名字重了）的，卡片留着，改了名字再存
  const save = () => {
    if (!pending) return;
    const r = onAdd(pending.av, label);
    if (r && r.why) {
      setNote(WHY[r.why] || "没存进去");
      return;
    }
    setNote("");
    setPending(null);
    setLabel("");
    if (r && r.id) setBig(r.id); // 新添的那一行自己展开：图、“还没有描述”、右下角“整理描述”
  };

  return (
    <div className="kfs-avbook kfs-hisbook">
      <div className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => !full && fileRef.current && fileRef.current.click()}
          disabled={full}
          className="kfs-tap kfs-avbook-add"
          style={{ ...chipPrimary, opacity: full ? 0.45 : 1 }}
        >
          添一张
        </button>
        {full && <span style={small}>{WHY.full}</span>}
      </div>
      <input ref={fileRef} className="kfs-avbook-file" type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
      {note && (
        <div className="kfs-avbook-note" style={{ fontSize: 12, color: T.red2, marginBottom: 10 }}>
          {note}
        </div>
      )}

      {pending && (
        <div className="kfs-avbook-new" style={{ ...glass(0.5, 16), borderRadius: 18, padding: 12, marginBottom: 12 }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <Avatar av={pending.av} who="her" size={48} />
            <input
              className="kfs-avbook-name flex-1 min-w-0"
              value={label}
              {...imeProps(setLabel, hisLabel)}
              onKeyDown={(e) => {
                if (isSubmitKey(e)) save();
              }}
              placeholder="起个名字"
              aria-label="起个名字"
              enterKeyHint="done"
              style={{ ...field, padding: "9px 12px" }}
            />
          </div>
          <div className="flex justify-end" style={{ gap: 8, marginTop: 10 }}>
            <button
              onClick={() => {
                setPending(null);
                setLabel("");
                setNote("");
              }}
              className="kfs-tap"
              style={chip}
            >
              不存了
            </button>
            <button onClick={save} className="kfs-tap kfs-avbook-save" style={chipPrimary}>
              存进去
            </button>
          </div>
        </div>
      )}

      {list.length === 0 && !pending && (
        <div className="kfs-avbook-empty" style={{ ...small, padding: "18px 2px" }}>
          册子里还空着
        </div>
      )}

      <div className="flex flex-col" style={{ gap: 8 }}>
        {list.map((e) => {
          const using = !!(av && av.type === "book" && av.id === e.id);
          return (
            <BookRow
              key={e.id}
              e={e}
              rows={rows}
              using={using}
              openWord="看描述"
              closeWord="收起描述"
              tail={
                (using || !described(e)) && (
                  <span className="kfs-hisbook-tags flex-shrink-0 flex items-center" style={{ gap: 8, fontSize: 12 }}>
                    {!described(e) && (
                      <span className="kfs-hisbook-bare" style={{ color: T.inkFaint }}>
                        没描述
                      </span>
                    )}
                    {using && (
                      <span className="kfs-hisbook-using" style={{ color: T.inkSoft }}>
                        在用
                      </span>
                    )}
                  </span>
                )
              }
              below={<Detail e={e} busy={!!busy[e.id]} err={errs[e.id] || ""} onEdit={onEdit} onDescribe={onDescribe} />}
            />
          );
        })}
      </div>
    </div>
  );
}
