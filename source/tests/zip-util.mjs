// 测试用：在 Node 里现做一个 zip（.docx 就是 zip），不依赖别的库
import zlib from "node:zlib";

const te = new TextEncoder();

// files: { "word/document.xml": "…" }，store 为 true 时不压缩
export function makeZip(files, { store = false } = {}) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = te.encode(name);
    const raw = typeof content === "string" ? te.encode(content) : content;
    const data = store ? raw : zlib.deflateRawSync(raw);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(8, store ? 0 : 8, true);
    head.setUint32(18, data.length, true);
    head.setUint32(22, raw.length, true);
    head.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(head.buffer), nameBytes, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, store ? 0 : 8, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, raw.length, true);
    c.setUint16(28, nameBytes.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
  let at = 0;
  for (const x of all) {
    out.set(x, at);
    at += x.length;
  }
  return out.buffer;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';

export const docXml = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
export const partXml = (tag, inner) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:${tag} ${NS}>${inner}</w:${tag}>`;

// 一段：p("字") 或 p("字", "<w:pStyle w:val=\"1\"/>")
export const p = (text, pPr = "") => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

// 做一份 .docx：body 是正文的 XML，extra 是别的部件（styles、numbering、footnotes）
export function makeDocx(body, extra = {}, opts) {
  return makeZip({ "[Content_Types].xml": "<Types/>", "word/document.xml": docXml(body), ...extra }, opts);
}

// 装成浏览器里的 File 那样
export const fakeFile = (name, buf) => ({ name, arrayBuffer: async () => (typeof buf === "string" ? te.encode(buf).buffer : buf) });
