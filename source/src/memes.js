import MEMES from "../static/memes.json";

// ---------- 表情包：构建时直接烤进文件，预览环境不联网也能显示 ----------
export const MEME_DATA = MEMES;
export const MEME_MAP = {};
MEME_DATA.forEach((m) => {
  MEME_MAP[m.file] = m;
});

export const RAW_BASE =
  "https://raw.githubusercontent.com/Valerie9391120/meme-library/main/";

export function memeSrc(file) {
  const m = MEME_MAP[file];
  return m ? `data:${m.mime};base64,${m.b64}` : RAW_BASE + file;
}

// ---------- README解析（部署后用来同步新表情包） ----------
// 仓库里新加的表情包：已经烤进来的不算；文件名一样、只是扩展名不同的也不算（比如 .png 和 .jpg）
const stemOf = (f) => String(f || "").toLowerCase().replace(/\.[a-z0-9]+$/, "");
export function newMemesFrom(list) {
  const known = new Set(Object.keys(MEME_MAP).map(stemOf));
  const seen = new Set();
  return list.filter((m) => {
    const st = stemOf(m.file);
    if (!m.file || known.has(st) || seen.has(st)) return false;
    seen.add(st);
    return true;
  });
}

export function parseReadme(text) {
  const out = [];
  text
    .split(/^### /m)
    .slice(1)
    .forEach((block) => {
      const lines = block.split("\n");
      const m = { name: lines[0].trim() };
      lines.forEach((raw) => {
        const l = raw.trim();
        if (l.startsWith("- File:"))
          m.file = l.slice(7).trim().replace(/`/g, "");
        else if (l.startsWith("- Text:")) m.text = l.slice(7).trim();
        else if (l.startsWith("- Tone:")) m.tone = l.slice(7).trim();
      });
      if (m.file) out.push(m);
    });
  return out;
}
