// 选项卡：他弹给她的几道选择题（卿卿 10 月 24 日凌晨要的，照 Claude 那张卡“逐帧照抄”，见 ask.js 和开发说明“选项卡”那一节）。
// 浮在输入框上面（输入框照旧在底下，能直接回复）：
//   顶上一行：题目；不止一题的时候右边“‹ 第 1 项，共 3 项 ›”切题；最右一个 ✕。
//   每个选项一行：左边一个数字块，选项，底下可以带一行小字说明；行和行之间一根细线。
//   最后一行：✎ 其他回答（自己写一句），右边一颗“跳过”，写了字、或者多选勾了几个，换成“好了”。
// 单选的题点一下就跳到下一题（“其他回答”里写着字的，一起带上）；多选的勾好了点“好了”。还有没答的就跳到它，
// 都答了（跳过也算答了）一起交：onDone(答案)。交的是卡上眼下摆着的（翻回去改了勾、改了字，没再点“好了”的，也照改过的交）。
import { useState } from "react";
import { T, glass, fill, HAIRLINE, chipPrimary, flat } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";
import { useLongPress } from "../ui/press.js";

const badge = (on) => ({
  width: 30,
  height: 30,
  borderRadius: 9,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13.5,
  fontVariantNumeric: "tabular-nums",
  background: on ? T.daiGrad : fill(0.62),
  border: on ? "1px solid transparent" : HAIRLINE,
  color: on ? T.onDai : T.inkSoft,
  transition: "background .15s ease, color .15s ease",
});

export function AskCard({ qs, onDone, onClose }) {
  const n = qs.length;
  const [page, setPage] = useState(0);
  // 每一题的答案：null 还没答；{ picks: [选项序号], other: 自己写的 } 或者 { skip: true }
  const [ans, setAns] = useState(() => qs.map(() => null));
  // 多选的题眼下勾着的；每一题“其他回答”里写着的
  const [picks, setPicks] = useState(() => qs.map(() => []));
  const [others, setOthers] = useState(() => qs.map(() => ""));
  const q = qs[page] || qs[0];
  const multi = !!q.multi;
  const other = others[page];
  const canDone = !!other.trim() || (multi && picks[page].length > 0);

  // 都答了，交的时候照卡上眼下摆着的算（另一双眼睛挑出来的：原来交的是每一题点“好了”那一刻的，翻回去改了的不算）：
  // 多选的是眼下勾着的，单选的是眼下亮着的那一个，再加上“其他回答”里眼下写着的；什么都没有就是跳过
  const settle = (next) =>
    qs.map((x, i) => {
      const o = String(others[i] || "").trim();
      const p = x.multi ? picks[i] : next[i] && next[i].picks ? next[i].picks : [];
      return p.length || o ? { picks: p.slice(), other: o } : { skip: true };
    });
  // 记下这一题的答案：还有没答的就跳过去（往后找，到头了从头找），都答了一起交
  const answer = (a) => {
    const next = ans.slice();
    next[page] = a;
    setAns(next);
    const left = Array.from({ length: n }, (_, k) => (page + 1 + k) % n).find((k) => !next[k]);
    if (left === undefined) onDone(settle(next));
    else setPage(left);
  };
  const pick = (k) => {
    if (multi) {
      setPicks((all) => all.map((p, i) => (i !== page ? p : p.includes(k) ? p.filter((x) => x !== k) : p.concat(k))));
      return;
    }
    answer({ picks: [k], other: other.trim() });
  };
  const done = () => {
    if (!canDone) return;
    answer({ picks: multi ? picks[page].slice() : [], other: other.trim() });
  };
  const chosen = (k) => (multi ? picks[page].includes(k) : !!(ans[page] && ans[page].picks && ans[page].picks.includes(k)));
  const go = (d) => setPage((p) => Math.max(0, Math.min(n - 1, p + d)));

  return (
    <div
      className="kfs-ask relative z-10"
      data-kfs-kbfit=""
      role="dialog"
      aria-label="他问你的问题"
      // 地方不够（键盘开着、表情包面板开着，题又写得长）：卡片自己变矮、里头滑着看，不把输入框挤到键盘底下
      style={{ ...glass(0.74, 20), borderRadius: 20, margin: "0 12px 8px", padding: "12px 14px 8px", maxHeight: "min(62vh, 560px)", minHeight: 96, flexShrink: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}
    >
      <div className="flex items-start" style={{ gap: 6 }}>
        <div className="kfs-ask-q flex-1 min-w-0" style={{ fontSize: 15, color: T.ink, lineHeight: 1.5, padding: "3px 0 0 2px", wordBreak: "break-word" }}>
          {q.q || "（没写题目）"}
          {multi && <span style={{ fontSize: 11.5, color: T.inkSoft, marginLeft: 6, whiteSpace: "nowrap" }}>可多选</span>}
        </div>
        {n > 1 && (
          <div className="kfs-ask-pager flex items-center flex-shrink-0" style={{ color: T.inkSoft, fontSize: 12.5, height: 30 }}>
            <button onClick={() => go(-1)} disabled={page === 0} aria-label="上一题" className="kfs-tap" style={{ padding: "4px 3px", opacity: page === 0 ? 0.35 : 1, display: "inline-flex" }}>
              <Icon name="chevL" size={15} />
            </button>
            <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              第 {page + 1} 项，共 {n} 项
            </span>
            <button onClick={() => go(1)} disabled={page === n - 1} aria-label="下一题" className="kfs-tap" style={{ padding: "4px 3px", opacity: page === n - 1 ? 0.35 : 1, display: "inline-flex" }}>
              <Icon name="chevR" size={15} />
            </button>
          </div>
        )}
        <button onClick={onClose} aria-label="关掉" className="kfs-tap kfs-ask-x flex-shrink-0" style={{ width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.inkSoft }}>
          <Icon name="x" size={17} />
        </button>
      </div>

      <div style={{ marginTop: 6 }}>
        {q.opts.map((o, k) => {
          const on = chosen(k);
          return (
            <button
              key={page + "-" + k}
              onClick={() => pick(k)}
              className="kfs-tap kfs-ask-opt flex w-full text-left"
              aria-pressed={on}
              style={{ gap: 12, padding: "9px 2px", borderTop: k ? HAIRLINE : "none", alignItems: o.d ? "flex-start" : "center" }}
            >
              <span style={badge(on)}>{on && multi ? <Icon name="check" size={15} sw={2.4} color={T.onDai} /> : k + 1}</span>
              <span className="min-w-0" style={{ paddingTop: o.d ? 1 : 0 }}>
                <span className="block" style={{ fontSize: 15, color: T.ink, lineHeight: 1.45, wordBreak: "break-word" }}>
                  {o.t}
                </span>
                {o.d && (
                  <span className="block" style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45, marginTop: 1, wordBreak: "break-word" }}>
                    {o.d}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        <div className="flex items-center" style={{ gap: 12, padding: "8px 2px 4px", borderTop: q.opts.length ? HAIRLINE : "none" }}>
          <span style={badge(false)}>
            <Icon name="pen" size={15} />
          </span>
          <input
            className="kfs-ask-other flex-1 min-w-0"
            value={other}
            onChange={(e) => {
              const v = e.target.value;
              setOthers((all) => all.map((x, i) => (i === page ? v : x)));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                done();
              }
            }}
            placeholder="其他回答"
            enterKeyHint="done"
            style={{ fontSize: 16, color: T.ink, background: "transparent", border: "none", outline: "none", padding: "4px 0" }}
          />
          {canDone ? (
            <button onClick={done} className="kfs-tap kfs-ask-ok flex-shrink-0" style={{ ...chipPrimary, padding: "6px 14px" }}>
              好了
            </button>
          ) : (
            <button onClick={() => answer({ skip: true })} className="kfs-tap kfs-ask-skip flex-shrink-0" style={{ ...flat(0.62), borderRadius: 10, padding: "6px 12px", fontSize: 13, color: T.ink }}>
              跳过
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 聊天里他那条话底下的一行：还没答“他问了你 N 个问题 · 点开答”（点了把卡片再弹出来），答完“他问了你 N 个问题 · 已答”。
// animate：新冒出来的（跟气泡一样浮一下）。
// 长按（电脑上右键）跟长按气泡一样出那个菜单（onLongPress(rect)）：他这一条只弹了一张卡、一个气泡都没有的时候，“重新回答”就在这儿（另一双眼睛挑出来的）
export function AskRow({ n, done, onOpen, onLongPress, animate = false }) {
  const text = `他问了你 ${n} 个问题 · ${done ? "已答" : "点开答"}`;
  const lp = useLongPress((rect) => onLongPress && onLongPress(rect));
  return (
    <div className={animate ? "flex kfs-in" : "flex"} style={{ marginLeft: 42, marginTop: 8 }}>
      {done ? (
        <span {...lp} className="kfs-ask-row" style={{ ...flat(0.38), borderRadius: 999, padding: "4px 12px", fontSize: 12, color: T.inkSoft, WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none" }}>
          {text}
        </span>
      ) : (
        <button {...lp} onClick={onOpen} className="kfs-tap kfs-ask-row flex items-center" style={{ ...flat(0.38), gap: 3, borderRadius: 999, padding: "4px 10px 4px 12px", fontSize: 12, color: T.inkSoft, WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none" }}>
          <span>{text}</span>
          <Icon name="chevR" size={13} />
        </button>
      )}
    </div>
  );
}
