// 同页的字（卿卿 10 月 18 日定的：“放到开封府自己这儿”，样子跟原版一模一样，不连 Google）。
//
// 同页原来从 Google Fonts 现取：<head> 里一行要三种（思源宋体三个粗细、IBM Plex Mono、龙藏体），换风格的时候再按那一种风格的 fonts 取
// （写法是 Google Fonts css2 的：“Noto+Sans+SC:wght@300;400;700”）；“换风格”那一层里的小样只取小样上那几个字（&text=）。
// 开封府这一页只连自己：同一批字（Fontsource 打好的 Google Fonts 原样文件，npm 上的 @fontsource/*，版本钉死在 package.json，
// 文件一个字节不改）放进 assets/tyfonts-<指纹>/，照 Google 的样子一种字一个粗细写一张样式表（一块一个 @font-face，unicode-range 照原样，
// 页面上用到哪些字才取哪几块）。要哪些字、哪几个粗细，照同页那一页里写的现算（作者添了风格、换了字，这里对不上就停下来）。
//
// 跟 Google 一样的几处：
//   - 一种风格要的粗细才有那个粗细（“Fraunces:opsz,wght@9..144,300;600”后一半写法不对，Google 只给 300，这里也只给 300；
//     要 600 的地方浏览器自己加粗，跟原版一样）
//   - 小样：Google 是现切一份只有那几个字的；这里不切字（不改字体文件），用同一批块里含那几个字的几块，
//     只认那几个字（FontFace，不进样式表：存长图的时候 html-to-image 只把样式表里的字体画进去，跟原版一样不多带）
import { createHash } from "node:crypto";
import fs from "node:fs";

// 同页要的每一种字 → 开封府装的那一个包
export const TY_FONT_PKGS = {
  "Noto Serif SC": "@fontsource/noto-serif-sc",
  "Noto Sans SC": "@fontsource/noto-sans-sc",
  "IBM Plex Mono": "@fontsource/ibm-plex-mono",
  "IBM Plex Sans": "@fontsource/ibm-plex-sans",
  "Long Cang": "@fontsource/long-cang",
  "Ma Shan Zheng": "@fontsource/ma-shan-zheng",
  "ZCOOL KuaiLe": "@fontsource/zcool-kuaile",
  "ZCOOL QingKe HuangYou": "@fontsource/zcool-qingke-huangyou",
  "ZCOOL XiaoWei": "@fontsource/zcool-xiaowei",
  DotGothic16: "@fontsource/dotgothic16",
  "DM Serif Display": "@fontsource/dm-serif-display",
  "Archivo Black": "@fontsource/archivo-black",
  "Space Mono": "@fontsource/space-mono",
  "Special Elite": "@fontsource/special-elite",
  Caveat: "@fontsource/caveat",
  "Cormorant Garamond": "@fontsource/cormorant-garamond",
  // Google 给的 Fraunces 是能调“字号”（opsz）的那一种：Fontsource 的可变字体包里 opsz 那一份就是它（粗细也能调，这里只认要的那个粗细）
  Fraunces: "@fontsource-variable/fraunces",
  Silkscreen: "@fontsource/silkscreen",
  "Playfair Display": "@fontsource/playfair-display",
  Unbounded: "@fontsource/unbounded",
};

// Google Fonts css2 的一种字：“Noto+Sans+SC:wght@300;400;700” → { family: "Noto Sans SC", weights: [300, 400, 700] }。
// 没写粗细的是 400；轴不止一个的（“opsz,wght@9..144,300”）取 wght 那一位；写法对不上的那一组 Google 不给，这里也不要
export function parseSpec(spec) {
  const [name, axes] = String(spec).split(":");
  const family = decodeURIComponent(name.replace(/\+/g, " ")).trim();
  if (!family) throw new Error(`同页的字写法认不出：${spec}`);
  if (!axes) return { family, weights: [400] };
  const [tags, tuples] = axes.split("@");
  const A = tags.split(",");
  const wi = A.indexOf("wght");
  if (!tuples) throw new Error(`同页的字写法认不出：${spec}`);
  const weights = [];
  for (const t of tuples.split(";")) {
    const v = t.split(",");
    if (v.length !== A.length) continue;
    const w = wi < 0 ? 400 : Number(v[wi]);
    if (!Number.isInteger(w) || w < 100 || w > 900) throw new Error(`同页的字写法认不出（粗细）：${spec}`);
    if (!weights.includes(w)) weights.push(w);
  }
  if (!weights.length) throw new Error(`同页的字一个粗细都没认出来：${spec}`);
  return { family, weights };
}

const keyOf = (family, w) => `${family}|${w}`;

// 同页那一页里要的字：<head> 里那一行（base）、每一种风格的 fonts（styles）、小样上的那几个字（preview）
export function tyFontNeeds(html) {
  const link = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?([^"]+)">/);
  if (!link) throw new Error("同页 <head> 里取字的那一行找不到了");
  const base = link[1]
    .split("&")
    .filter((p) => p.startsWith("family="))
    .map((p) => p.slice(7));
  const styles = {};
  for (const m of html.matchAll(/"id": "([^"]+)"[^{}]*?"fonts": \[([^\]]*)\]/g)) styles[m[1]] = JSON.parse(`[${m[2]}]`);
  const all = (html.match(/"fonts": \[/g) || []).length;
  if (!Object.keys(styles).length || Object.keys(styles).length !== all) throw new Error(`同页的风格认不全：认出 ${Object.keys(styles).length} 种，写着 fonts 的有 ${all} 处`);
  const pv = html.match(/&text="\+encodeURIComponent\("([^"]+)"\)/);
  if (!pv) throw new Error("同页“换风格”小样上的字找不到了");
  return { base, styles, preview: pv[1] };
}

// 一个包里某一个粗细的那一张样式表（Fontsource 写的）→ 一块一块：文件名、unicode-range
function facesOf(nm, pkg, family, w) {
  const variable = pkg.startsWith("@fontsource-variable/");
  const file = variable ? `${nm}/${pkg}/opsz.css` : `${nm}/${pkg}/${w}.css`;
  if (!fs.existsSync(file)) throw new Error(`${family} 没有 ${w} 这个粗细（${file}）`);
  const css = fs.readFileSync(file, "utf8");
  const faces = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const prop = (p) => (m[1].match(new RegExp(`(?:^|;|\\s)${p}\\s*:\\s*([^;]+);`)) || [])[1];
    const fam = (prop("font-family") || "").replace(/^['"]|['"]$/g, "");
    if (fam !== (variable ? `${family} Variable` : family)) throw new Error(`${file} 里的字名对不上：${fam}`);
    if (prop("font-style") !== "normal") throw new Error(`${file} 里有不是正体的`);
    const fw = prop("font-weight");
    if (variable ? !/^\d+ \d+$/.test(fw) || +fw.split(" ")[0] > w || +fw.split(" ")[1] < w : fw !== String(w)) throw new Error(`${file} 里的粗细对不上：${fw}`);
    const src = (prop("src") || "").match(/url\(\.\/files\/([a-z0-9-]+\.woff2)\)/);
    if (!src) throw new Error(`${file} 里有一块没有 woff2`);
    const range = prop("unicode-range");
    if (!range) throw new Error(`${file} 里有一块没写 unicode-range`);
    faces.push({ file: src[1], range: range.trim() });
  }
  if (!faces.length) throw new Error(`${file} 里一块都没有`);
  return faces;
}

// “U+4E00-4E05,U+0030” 管不管这个字
const covers = (range, cp) =>
  range.split(",").some((p) => {
    const [a, b] = p.trim().replace(/^U\+/i, "").split("-");
    if (a.includes("?")) return cp >= parseInt(a.replace(/\?/g, "0"), 16) && cp <= parseInt(a.replace(/\?/g, "F"), 16);
    const lo = parseInt(a, 16);
    return cp >= lo && cp <= (b ? parseInt(b, 16) : lo);
  });
const hex = (n) => n.toString(16).toUpperCase().padStart(4, "0");
// 几个字 → unicode-range（连着的并成一段）
const rangeOf = (cps) => {
  const s = [...new Set(cps)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `U+${hex(s[i])}` : `U+${hex(s[i])}-${hex(s[j])}`);
    i = j + 1;
  }
  return out.join(",");
};

// 打包：要放进 assets/tyfonts-<指纹>/ 的文件（相对那个目录的路径 → 内容），<head> 里那几张样式表，交给开封府那一层（bridge.js）的清单
export function makeTyFonts(html, nm = "node_modules") {
  const need = tyFontNeeds(html);
  const pkgs = new Map(); // 包 → { version, license }
  const keys = new Map(); // family|w → { family, w, pkg }
  const specKeys = (spec) =>
    (({ family, weights }) => {
      const pkg = TY_FONT_PKGS[family];
      if (!pkg) throw new Error(`同页要的字“${family}”开封府没装（tools/tyfonts.mjs 的 TY_FONT_PKGS）`);
      return weights.map((w) => {
        const k = keyOf(family, w);
        keys.set(k, { family, w, pkg });
        return k;
      });
    })(parseSpec(spec));
  const base = need.base.flatMap(specKeys);
  const spec = {};
  for (const list of Object.values(need.styles)) for (const s of list) spec[s] = specKeys(s);

  const files = new Map();
  const css = {};
  const pv = {};
  const pvCps = [...need.preview].map((c) => c.codePointAt(0));
  const owner = new Map(); // 字体文件 → 哪个包（不同的包撞了名就停）
  for (const [k, { family, w, pkg }] of [...keys].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!pkgs.has(pkg)) {
      const pj = JSON.parse(fs.readFileSync(`${nm}/${pkg}/package.json`, "utf8"));
      if (!fs.existsSync(`${nm}/${pkg}/LICENSE`)) throw new Error(`${pkg} 没带授权`);
      pkgs.set(pkg, { version: pj.version, license: pj.license });
    }
    const { version, license } = pkgs.get(pkg);
    const slug = pkg.split("/")[1];
    const faces = facesOf(nm, pkg, family, w);
    for (const f of faces) {
      if (owner.has(f.file) && owner.get(f.file) !== pkg) throw new Error(`字体文件撞名：${f.file}`);
      owner.set(f.file, pkg);
      if (!files.has(`files/${f.file}`)) files.set(`files/${f.file}`, fs.readFileSync(`${nm}/${pkg}/files/${f.file}`));
    }
    const name = `${slug}-${w}.css`;
    css[k] = name;
    files.set(
      name,
      Buffer.from(
        `/* ${family} ${w} — Google Fonts, files as packaged by Fontsource (${pkg}@${version}), unmodified; ${license}, see licenses/${slug}.txt */\n` +
          faces
            .map((f) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url(files/${f.file}) format('woff2');unicode-range:${f.range}}`)
            .join("\n") +
          "\n"
      )
    );
    // 小样（<head> 里本来就有的不用）：含小样上那几个字的几块，只认那几个字。
    // 几块都管同一个字的（数字常常在最后那一块和 latin 里都有），浏览器用写在后面的那一块：那个字只算给它
    if (!base.includes(k)) {
      const by = new Map();
      for (const cp of pvCps) {
        const f = faces.findLast((x) => covers(x.range, cp));
        if (f) by.set(f, [...(by.get(f) || []), cp]);
      }
      const list = faces.filter((f) => by.has(f)).map((f) => [`files/${f.file}`, rangeOf(by.get(f))]);
      if (list.length) pv[k] = list;
    }
  }
  for (const [pkg, { version, license }] of pkgs) files.set(`licenses/${pkg.split("/")[1]}.txt`, Buffer.concat([Buffer.from(`${pkg}@${version} (${license})\n\n`), fs.readFileSync(`${nm}/${pkg}/LICENSE`)]));
  files.set(
    "README.txt",
    Buffer.from(
      "Fonts for 同页 (tongye) in 开封府. These are the Google Fonts font files the original page loads from fonts.googleapis.com,\n" +
        "taken unmodified from the Fontsource npm packages (https://fontsource.org) and served from here instead.\n" +
        "Each family keeps its own license (SIL Open Font License 1.1, or Apache License 2.0 for Special Elite): see licenses/.\n" +
        "The style sheets here were written by tools/tyfonts.mjs in the kaifengfu repository.\n\n" +
        [...pkgs].map(([pkg, { version, license }]) => `${pkg}@${version}  ${license}`).join("\n") +
        "\n"
    )
  );
  const h = createHash("sha256");
  for (const [p, buf] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) h.update(p).update("\0").update(buf);
  const dir = `tyfonts-${h.digest("hex").slice(0, 10)}`;
  const bytes = [...files.values()].reduce((n, b) => n + b.length, 0);
  return {
    dir,
    files,
    // <head> 里那一行换成这几张（相对同页那一页：同在 assets/ 里）
    baseHrefs: base.map((k) => `./${dir}/${css[k]}`),
    // 交给开封府那一层：换风格的时候照这个取（spec：同页写的那一种 → 哪几张；pv：小样）
    manifest: { dir, base, spec, css, pv },
    bytes,
    fonts: [...files.keys()].filter((p) => p.endsWith(".woff2")).length,
  };
}
