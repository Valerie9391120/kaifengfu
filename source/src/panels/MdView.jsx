import { useMemo } from "react";
import { SERIF, T } from "../ui/style.js";

// 点开文档时把 Markdown 排一排。只认常用的：标题、列表（带勾选框）、引用、代码、表格、分隔线；
// 行内认粗体、斜体、行内代码、删除线、链接（链接只显示字，不跳转）。认不出来的原样当字
const MD_MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
const MD_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const mdTableRule = (l) => l.includes("|") && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const mdCells = (l) => {
  const hold = String.fromCharCode(1); // 转义过的竖线先藏起来
  return l
    .trim()
    .replace(/\\\|/g, hold)
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim().split(hold).join("|"));
};

function mdBlocks(src) {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^\s*```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push({ t: "pre", text: buf.join("\n") });
    } else if (!line.trim()) {
      i++;
    } else if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      out.push({ t: "h", level: m[1].length, text: m[2].replace(/\s+#+\s*$/, "") });
      i++;
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push({ t: "hr" });
      i++;
    } else if (line.includes("|") && i + 1 < lines.length && mdTableRule(lines[i + 1])) {
      const head = mdCells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(mdCells(lines[i++]));
      out.push({ t: "table", head, rows });
    } else if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", text: buf.join("\n") });
    } else if (MD_ITEM.test(line)) {
      const items = [];
      while (i < lines.length && (m = MD_ITEM.exec(lines[i]))) {
        let text = m[3];
        i++;
        // 往里缩着的后续几行算在这一项里
        while (i < lines.length && lines[i].trim() && /^\s{2,}/.test(lines[i]) && !MD_ITEM.test(lines[i])) text += "\n" + lines[i++].trim();
        const box = /^\[([ xX])\]\s+/.exec(text);
        items.push({
          depth: Math.min(4, Math.floor(m[1].replace(/\t/g, "  ").length / 2)),
          mark: box ? (box[1] === " " ? "☐" : "☑") : /\d/.test(m[2]) ? m[2].replace(")", ".") : "•",
          text: box ? text.slice(box[0].length) : text,
        });
      }
      out.push({ t: "list", items });
    } else {
      const buf = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,6}\s|\s*```|\s*>)/.test(lines[i]) &&
        !MD_ITEM.test(lines[i]) &&
        !(lines[i].includes("|") && i + 1 < lines.length && mdTableRule(lines[i + 1]))
      )
        buf.push(lines[i++]);
      out.push({ t: "p", text: buf.join("\n") });
    }
  }
  return out;
}

function mdInline(text, base) {
  const out = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\n]+\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = base + "-" + i++;
    if (tok[0] === "`")
      out.push(
        <code key={k} style={{ fontFamily: MD_MONO, fontSize: "0.88em", background: "rgba(255,255,255,0.6)", borderRadius: 5, padding: "1px 5px" }}>
          {tok.slice(1, -1)}
        </code>
      );
    else if (tok.startsWith("**") || tok.startsWith("__")) out.push(<strong key={k} style={{ fontWeight: 600 }}>{tok.slice(2, -2)}</strong>);
    else if (tok[0] === "*") out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else if (tok[0] === "~") out.push(<span key={k} style={{ textDecoration: "line-through", opacity: 0.7 }}>{tok.slice(2, -2)}</span>);
    else out.push(<span key={k} style={{ textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>{tok.slice(1, tok.indexOf("]("))}</span>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MdView({ text }) {
  const blocks = useMemo(() => mdBlocks(text), [text]);
  const sizes = [0, 19, 17, 15.5, 14.5, 14.5, 14.5];
  const cell = { padding: "6px 10px", borderBottom: "1px solid rgba(var(--k-soft),0.16)", textAlign: "left", verticalAlign: "top" };
  return (
    <div className="kfs-md" style={{ fontSize: 14.5, lineHeight: 1.75, color: T.ink }}>
      {blocks.map((b, i) => {
        if (b.t === "h")
          return (
            <div key={i} role="heading" aria-level={b.level} style={{ fontFamily: SERIF, fontSize: sizes[b.level], lineHeight: 1.45, letterSpacing: "0.04em", margin: `${i ? 18 : 2}px 0 8px` }}>
              {mdInline(b.text, i)}
            </div>
          );
        if (b.t === "hr") return <div key={i} style={{ height: 1, background: "rgba(var(--k-soft),0.18)", margin: "14px 0" }} />;
        if (b.t === "pre")
          return (
            <pre key={i} className="kfs-scroll" style={{ overflowX: "auto", fontFamily: MD_MONO, fontSize: 12.5, lineHeight: 1.6, background: "rgba(255,255,255,0.5)", borderRadius: 12, padding: "10px 12px", margin: "0 0 10px", whiteSpace: "pre" }}>
              {b.text}
            </pre>
          );
        if (b.t === "quote")
          return (
            <div key={i} className="whitespace-pre-wrap break-words" style={{ borderLeft: "2px solid rgba(var(--k-dai),0.45)", paddingLeft: 10, color: T.inkSoft, margin: "0 0 10px" }}>
              {mdInline(b.text, i)}
            </div>
          );
        if (b.t === "list")
          return (
            <div key={i} style={{ margin: "0 0 10px" }}>
              {b.items.map((it, j) => (
                <div key={j} className="flex" style={{ gap: 8, paddingLeft: it.depth * 16, marginBottom: 3 }}>
                  <span className="flex-shrink-0" style={{ minWidth: 14, color: T.dai, fontVariantNumeric: "tabular-nums" }}>
                    {it.mark}
                  </span>
                  <span className="whitespace-pre-wrap break-words min-w-0">{mdInline(it.text, i + "-" + j)}</span>
                </div>
              ))}
            </div>
          );
        if (b.t === "table")
          return (
            <div key={i} className="kfs-scroll" style={{ overflowX: "auto", margin: "0 0 12px" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 13.5, lineHeight: 1.55, minWidth: "100%" }}>
                <thead>
                  <tr>
                    {b.head.map((c, j) => (
                      <th key={j} style={{ ...cell, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {mdInline(c, i + "-h" + j)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {b.head.map((_, c) => (
                        <td key={c} style={cell}>
                          {mdInline(r[c] || "", i + "-" + j + "-" + c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        return (
          <p key={i} className="whitespace-pre-wrap break-words" style={{ margin: "0 0 10px" }}>
            {mdInline(b.text, i)}
          </p>
        );
      })}
    </div>
  );
}
