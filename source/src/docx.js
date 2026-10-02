// =====================================================
// 在手机上把 Word（.docx）里的字取出来
// 那边的我收不了 .docx：接口只认文字、图片和 PDF，官方的说法是“先转成文字再发”。
// 所以这一步在她手机上做：.docx 其实是一个 zip，正文在里面的 word/document.xml。
// 这里自己拆 zip、自己读 XML，不引别的库（解压用浏览器自带的 DecompressionStream）。
// 取出来的是 Markdown 样子的文字：标题带 #，列表带 - 或 1.，表格画成 | a | b |。
// 取不出来的：图片（原处留一个 [图片]）、页眉页脚、批注。修订里删掉的字不要，新加的字要。
// 不认的：老式的 .doc、带密码的 Word（这两种都不是 zip）。
// 只用到 ArrayBuffer、TextDecoder、DecompressionStream，浏览器和 Node 里都能跑（测试在 Node 里跑）。
// =====================================================

// 出错时带一个 code，docs.js 里换成给她看的话
function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const MAX_XML_BYTES = 40 * 1024 * 1024;

// ---------- zip ----------
function listEntries(buf) {
  const dv = new DataView(buf);
  const n = dv.byteLength;
  if (n >= 8 && dv.getUint32(0, false) === 0xd0cf11e0) throw fail("oldword"); // 老式 .doc，或者带密码的 Word
  let e = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      e = i;
      break;
    }
  }
  if (e < 0) throw fail("notzip");
  const count = dv.getUint16(e + 10, true);
  let off = dv.getUint32(e + 16, true);
  const td = new TextDecoder("utf-8");
  const out = {};
  for (let i = 0; i < count; i++) {
    if (off + 46 > n || dv.getUint32(off, true) !== 0x02014b50) break;
    const nlen = dv.getUint16(off + 28, true);
    const name = td.decode(new Uint8Array(buf, off + 46, nlen));
    out[name] = {
      method: dv.getUint16(off + 10, true),
      csize: dv.getUint32(off + 20, true),
      usize: dv.getUint32(off + 24, true),
      at: dv.getUint32(off + 42, true),
    };
    off += 46 + nlen + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
  }
  return out;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") throw fail("noinflate");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(buf, ent) {
  if (!ent) return null;
  if (ent.usize > MAX_XML_BYTES) throw fail("toobig");
  const dv = new DataView(buf);
  if (ent.at + 30 > dv.byteLength || dv.getUint32(ent.at, true) !== 0x04034b50) throw fail("badzip");
  const start = ent.at + 30 + dv.getUint16(ent.at + 26, true) + dv.getUint16(ent.at + 28, true);
  if (start + ent.csize > dv.byteLength) throw fail("badzip");
  const data = new Uint8Array(buf, start, ent.csize);
  let bytes;
  if (ent.method === 0) bytes = data;
  else if (ent.method === 8) {
    try {
      bytes = await inflateRaw(data);
    } catch (x) {
      throw x && x.code ? x : fail("badzip");
    }
  } else throw fail("badzip");
  return new TextDecoder("utf-8").decode(bytes);
}

// ---------- XML ----------
// 只要一棵够用的树：{ name, attrs, kids }，字是 { text }
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescapeXml(s) {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (all, k) => {
    if (k[0] === "#") {
      const code = k[1] === "x" || k[1] === "X" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch (x) {
        return "";
      }
    }
    return k in ENT ? ENT[k] : all;
  });
}

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(src) {
  const root = { name: "#root", attrs: {}, kids: [] };
  const stack = [root];
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(src)) !== null) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.kids.push({ text: m[1] });
    else if (m[3] !== undefined) {
      if (m[2]) {
        // 收尾的标签：往回找到同名的那一层
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].name === m[3]) {
            stack.length = i;
            break;
          }
        }
      } else {
        const node = { name: m[3], attrs: {}, kids: [] };
        if (m[4]) {
          ATTR.lastIndex = 0;
          let a;
          while ((a = ATTR.exec(m[4])) !== null) node.attrs[a[1]] = unescapeXml(a[2] !== undefined ? a[2] : a[3]);
        }
        top.kids.push(node);
        if (!m[5]) stack.push(node);
      }
    } else if (m[6] !== undefined) top.kids.push({ text: unescapeXml(m[6]) });
  }
  return root;
}

const kid = (node, name) => (node ? node.kids.find((k) => k.name === name) || null : null);
const kidsOf = (node, name) => (node ? node.kids.filter((k) => k.name === name) : []);
const textOf = (node) => node.kids.map((k) => (k.text !== undefined ? k.text : "")).join("");

// 文档里 Word 那套标签用的前缀，几乎总是 w:，以防万一照着声明找一遍
const W_NS = ["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"];
function wPrefix(tree) {
  const top = tree.kids.find((k) => k.name);
  if (top) {
    for (const [k, v] of Object.entries(top.attrs)) {
      if (k.startsWith("xmlns:") && W_NS.includes(v)) return k.slice(6) + ":";
    }
  }
  return "w:";
}

// 新旧两种写法并排放着的地方（文本框、图形）：只走新的那份，不然字会出来两遍
function pickAlternate(node) {
  return kid(node, "mc:Choice") || kid(node, "mc:Fallback");
}

// ---------- 样式和编号 ----------
function readStyles(xml) {
  const map = {};
  if (!xml) return map;
  const tree = parseXml(xml);
  const W = wPrefix(tree);
  const walk = (node) => {
    node.kids.forEach((k) => {
      if (!k.name) return;
      if (k.name === W + "style") {
        const id = k.attrs[W + "styleId"];
        if (!id) return;
        const pPr = kid(k, W + "pPr");
        const numPr = kid(pPr, W + "numPr");
        const lvl = kid(pPr, W + "outlineLvl");
        map[id] = {
          name: ((kid(k, W + "name") || { attrs: {} }).attrs[W + "val"] || "").toLowerCase(),
          basedOn: (kid(k, W + "basedOn") || { attrs: {} }).attrs[W + "val"] || "",
          outline: lvl ? Number(lvl.attrs[W + "val"]) : null,
          numId: numPr && kid(numPr, W + "numId") ? kid(numPr, W + "numId").attrs[W + "val"] : null,
          ilvl: numPr && kid(numPr, W + "ilvl") ? Number(kid(numPr, W + "ilvl").attrs[W + "val"]) || 0 : 0,
        };
      } else walk(k);
    });
  };
  walk(tree);
  return map;
}

// numId → 每一级是圆点还是数字
function readNumbering(xml) {
  const out = {};
  if (!xml) return out;
  const tree = parseXml(xml);
  const W = wPrefix(tree);
  const top = tree.kids.find((k) => k.name);
  if (!top) return out;
  const abs = {};
  const levels = (node) => {
    const lv = {};
    kidsOf(node, W + "lvl").forEach((l) => {
      const fmt = kid(l, W + "numFmt");
      lv[Number(l.attrs[W + "ilvl"]) || 0] = fmt ? fmt.attrs[W + "val"] || "" : "";
    });
    return lv;
  };
  kidsOf(top, W + "abstractNum").forEach((a) => {
    abs[a.attrs[W + "abstractNumId"]] = levels(a);
  });
  kidsOf(top, W + "num").forEach((n) => {
    const ref = kid(n, W + "abstractNumId");
    const base = { ...(ref ? abs[ref.attrs[W + "val"]] || {} : {}) };
    kidsOf(n, W + "lvlOverride").forEach((o) => {
      const l = kid(o, W + "lvl");
      const fmt = l ? kid(l, W + "numFmt") : null;
      if (fmt) base[Number(o.attrs[W + "ilvl"]) || 0] = fmt.attrs[W + "val"] || "";
    });
    out[n.attrs[W + "numId"]] = base;
  });
  return out;
}

function headingOfStyle(styles, id) {
  let cur = id;
  for (let hop = 0; cur && hop < 8; hop++) {
    const st = styles[cur];
    if (!st) {
      const m = /^heading\s*([1-9])$/i.exec(cur);
      return m ? Number(m[1]) : 0;
    }
    const m = /^heading\s*([1-9])$/.exec(st.name);
    if (m) return Number(m[1]);
    if (st.name === "title") return 1;
    if (st.name === "subtitle") return 2;
    if (st.outline !== null && st.outline >= 0 && st.outline < 9) return st.outline + 1;
    cur = st.basedOn;
  }
  return 0;
}

function listOfStyle(styles, id) {
  let cur = id;
  for (let hop = 0; cur && hop < 8; hop++) {
    const st = styles[cur];
    if (!st) return null;
    if (st.numId && st.numId !== "0") return { numId: st.numId, ilvl: st.ilvl, hint: st.name };
    if (/^list (bullet|number)/.test(st.name)) return { numId: "style:" + cur, ilvl: 0, hint: st.name };
    cur = st.basedOn;
  }
  return null;
}

// ---------- 正文 ----------
function makeReader(W, styles, numbering, notes) {
  const ctx = { images: 0, tables: 0, refs: [], counters: {} };

  const findBoxes = (node, out = []) => {
    node.kids.forEach((k) => {
      if (!k.name) return;
      if (k.name === W + "txbxContent") out.push(k);
      else if (k.name === "mc:AlternateContent") {
        const c = pickAlternate(k);
        if (c) findBoxes(c, out);
      } else findBoxes(k, out);
    });
    return out;
  };

  // 图片、图形：文本框里的字取出来，别的只留一个记号
  const drawing = (node) => {
    const boxes = findBoxes(node);
    if (!boxes.length) {
      ctx.images++;
      return "[图片]";
    }
    const parts = boxes.map((b) => render(blocks(b))).filter(Boolean);
    return parts.length ? "\n" + parts.join("\n") + "\n" : "";
  };

  const noteRef = (kind, node) => {
    const id = node.attrs[W + "id"];
    if (id === undefined || !notes[kind] || notes[kind][id] === undefined) return "";
    ctx.refs.push({ kind, id });
    return `[注${ctx.refs.length}]`;
  };

  const run = (r) => {
    let s = "";
    r.kids.forEach((k) => {
      if (!k.name) return;
      if (k.name === W + "t") s += textOf(k);
      else if (k.name === W + "tab") s += "\t";
      else if (k.name === W + "br" || k.name === W + "cr") s += "\n";
      else if (k.name === W + "noBreakHyphen") s += "-";
      else if (k.name === W + "drawing" || k.name === W + "pict" || k.name === W + "object") s += drawing(k);
      else if (k.name === W + "footnoteReference") s += noteRef("foot", k);
      else if (k.name === W + "endnoteReference") s += noteRef("end", k);
      else if (k.name === "mc:AlternateContent") {
        const c = pickAlternate(k);
        if (c) s += run(c);
      }
      // 其余的（格式、域代码 instrText、删掉的字 delText、批注记号）都不要
    });
    return s;
  };

  const inline = (node) => {
    let s = "";
    node.kids.forEach((k) => {
      if (!k.name) return;
      if (k.name === W + "r") s += run(k);
      else if (k.name === W + "del" || k.name === W + "moveFrom" || k.name === W + "pPr" || k.name === W + "rPr") return;
      else if (k.name === "mc:AlternateContent") {
        const c = pickAlternate(k);
        if (c) s += inline(c);
      } else if (k.name === "m:t") s += textOf(k);
      else s += inline(k); // 超链接、修订里新加的字、内容控件、域、公式……往里走
    });
    return s;
  };

  const paragraph = (p) => {
    const pPr = kid(p, W + "pPr");
    const text = inline(p).replace(/[ \t]+\n/g, "\n").replace(/^\n+|\n+$/g, "");
    if (!text.trim()) return null;
    const styleId = pPr && kid(pPr, W + "pStyle") ? kid(pPr, W + "pStyle").attrs[W + "val"] : "";
    const ol = pPr ? kid(pPr, W + "outlineLvl") : null;
    let level = ol && Number(ol.attrs[W + "val"]) < 9 ? Number(ol.attrs[W + "val"]) + 1 : 0;
    if (!level && styleId) level = headingOfStyle(styles, styleId);
    if (level) return { kind: "h", text: "#".repeat(Math.min(6, level)) + " " + text.replace(/\s*\n\s*/g, " ").trim() };

    const numPr = pPr ? kid(pPr, W + "numPr") : null;
    let list = null;
    if (numPr && kid(numPr, W + "numId")) {
      const numId = kid(numPr, W + "numId").attrs[W + "val"];
      if (numId && numId !== "0") list = { numId, ilvl: kid(numPr, W + "ilvl") ? Number(kid(numPr, W + "ilvl").attrs[W + "val"]) || 0 : 0, hint: "" };
    }
    if (!list && styleId) list = listOfStyle(styles, styleId);
    if (list) {
      const fmt = (numbering[list.numId] || {})[list.ilvl];
      const ordered = fmt !== undefined ? fmt !== "bullet" && fmt !== "none" : /number/.test(list.hint);
      let mark = "- ";
      if (ordered) {
        const c = ctx.counters[list.numId] || (ctx.counters[list.numId] = []);
        c[list.ilvl] = (c[list.ilvl] || 0) + 1;
        c.length = list.ilvl + 1; // 更深的几级从头数
        mark = c[list.ilvl] + ". ";
      }
      const pad = "  ".repeat(Math.min(6, list.ilvl));
      return { kind: "li", list: list.numId, text: pad + mark + text.replace(/\n/g, "\n" + pad + "  ") };
    }
    return { kind: "p", text };
  };

  const table = (t) => {
    const rows = [];
    const eachRow = (node) => {
      node.kids.forEach((k) => {
        if (!k.name) return;
        if (k.name === W + "tr") {
          const cells = [];
          const eachCell = (n2) => {
            n2.kids.forEach((c) => {
              if (!c.name) return;
              if (c.name === W + "tc") {
                const txt = blocks(c).map((b) => b.text.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean).join(" / ");
                cells.push(txt.replace(/\|/g, "\\|"));
              } else if (c.name !== W + "trPr" && c.name !== W + "tblPrEx") eachCell(c);
            });
          };
          eachCell(k);
          if (cells.some((c) => c)) rows.push(cells);
        } else if (k.name !== W + "tblPr" && k.name !== W + "tblGrid") eachRow(k);
      });
    };
    eachRow(t);
    if (!rows.length) return null;
    ctx.tables++;
    const width = Math.max(...rows.map((r) => r.length));
    const line = (r) => "| " + Array.from({ length: width }, (_, i) => r[i] || "").join(" | ") + " |";
    const out = [line(rows[0]), "| " + Array.from({ length: width }, () => "---").join(" | ") + " |"];
    rows.slice(1).forEach((r) => out.push(line(r)));
    return { kind: "t", text: out.join("\n") };
  };

  function blocks(node) {
    const out = [];
    node.kids.forEach((k) => {
      if (!k.name) return;
      let b = null;
      if (k.name === W + "p") b = paragraph(k);
      else if (k.name === W + "tbl") b = table(k);
      else if (k.name === W + "del" || k.name === W + "moveFrom" || k.name === W + "sectPr") return;
      else if (k.name === "mc:AlternateContent") {
        const c = pickAlternate(k);
        if (c) out.push(...blocks(c));
        return;
      } else {
        out.push(...blocks(k)); // 内容控件之类的壳，往里走
        return;
      }
      if (b) out.push(b);
    });
    return out;
  }

  // 段落之间空一行；同一个列表里挨着的几项不空
  function render(list) {
    let s = "";
    list.forEach((b, i) => {
      if (i) s += b.kind === "li" && list[i - 1].kind === "li" && list[i - 1].list === b.list ? "\n" : "\n\n";
      s += b.text;
    });
    return s;
  }

  return { ctx, blocks, render };
}

function readNotes(xml, tag) {
  const out = {};
  if (!xml) return { map: out, tree: null, W: "w:" };
  const tree = parseXml(xml);
  const W = wPrefix(tree);
  const top = tree.kids.find((k) => k.name);
  if (top) {
    kidsOf(top, W + tag).forEach((n) => {
      if (n.attrs[W + "type"]) return; // 分隔线之类
      out[n.attrs[W + "id"]] = n;
    });
  }
  return { map: out, W };
}

// buf：.docx 的 ArrayBuffer。返回 { text, images, tables }
export async function docxToText(buf) {
  const entries = listEntries(buf);
  const main = entries["word/document.xml"];
  if (!main) throw fail("notword");
  const [docXml, stylesXml, numXml, footXml, endXml] = await Promise.all([
    readEntry(buf, main),
    readEntry(buf, entries["word/styles.xml"]),
    readEntry(buf, entries["word/numbering.xml"]),
    readEntry(buf, entries["word/footnotes.xml"]),
    readEntry(buf, entries["word/endnotes.xml"]),
  ]);
  const tree = parseXml(docXml);
  const W = wPrefix(tree);
  const doc = tree.kids.find((k) => k.name === W + "document");
  const body = doc ? kid(doc, W + "body") : null;
  if (!body) throw fail("notword");
  const foot = readNotes(footXml, "footnote");
  const end = readNotes(endXml, "endnote");
  const reader = makeReader(W, readStyles(stylesXml), readNumbering(numXml), { foot: foot.map, end: end.map });
  let text = reader.render(reader.blocks(body));
  // 脚注、尾注附在最后（注里面再引注的不管）
  const refs = reader.ctx.refs.slice();
  if (refs.length) {
    const lines = refs.map((r, i) => {
      const node = (r.kind === "foot" ? foot.map : end.map)[r.id];
      const t = node ? reader.render(reader.blocks(node)).replace(/\s*\n\s*/g, " ").trim() : "";
      return `[注${i + 1}] ${t}`;
    });
    text += "\n\n---\n\n" + lines.join("\n");
  }
  text = text.replace(/\u00a0/g, " ").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text, images: reader.ctx.images, tables: reader.ctx.tables };
}
