// =====================================================
// 拼豆作的零件，不碰界面（卿卿 2026 年 10 月 25 日要的，见开发说明“拼豆作”那一节）。
// 那一页原来是官方 App 里的那一份（一个文件，存不住东西），她 22:53 说“塞进开封府，甚至可以往狐宇宙里也塞一个给你玩”。
// 23:00 她点的四样：
//   她拼好的能发给他看，像秘戏钱匣那样（那一页里一颗“发给光义”，聊天正中一张小图，他看得见拼的是什么）
//   他在狐宇宙屋里拼的，拼豆页里多一栏「他的」：拼到一半的、挂起来的都能看，只能看不能动
//   平常聊天里的他只能回屋看一眼（同园子、妆台：拼只在屋里醒着的时候）
//   板子的颜色跟着青绿、丁香、黑夜换
//
// 存档（都是加密了跟着云端走）：
//   kfs2:pd:state       她眼下这块板子和几样习惯（几号板、拼到哪了、手上的颜色、看的样子、对称、辅助线、自己调的颜色）
//   kfs2:pd:work:<编号> 她存进作品集的一幅，一幅一条（两台设备各存各的不互相盖掉）
//   kfs2:pindou         他屋里桌上那块板子和挂起来的那些，只有家里的闹钟写（同园子 kfs2:garden、妆台 kfs2:dressing）
//
// 板子在存档里、在作品码里都是一串字（toCode / fromCode）：PD1~边长~用到的颜色~一格一格。
// 跟官方 App 里那一份的作品码一个写法，她在那边复制的码，这边粘贴得进来。
// =====================================================
import { HER_NAME } from "../names.js";

// ---------- 色板 ----------
// 三十九种，跟官方 App 里那一份一样（名字、颜色、次序）。k 是给他用的字母：他拼的时候一个字母一颗豆子（见 PINDOU_TOOL）
export const PALETTE = [
  { k: "w", name: "雪白", hex: "#FBFBF8" },
  { k: "c", name: "米酒白", hex: "#F1E6D2" },
  { k: "G", name: "雾灰", hex: "#C7C9D0" },
  { k: "g", name: "鼠灰", hex: "#9A9CA6" },
  { k: "d", name: "石墨", hex: "#5C5F69" },
  { k: "k", name: "墨黑", hex: "#1F1D24" },
  { k: "f", name: "瓷肤", hex: "#FCE5D4" },
  { k: "s", name: "桃肤", hex: "#F5C6A5" },
  { k: "t", name: "蜜肤", hex: "#E0A177" },
  { k: "m", name: "麦色", hex: "#C27F52" },
  { k: "n", name: "可可", hex: "#8E5636" },
  { k: "b", name: "栗棕", hex: "#63402B" },
  { k: "B", name: "浓咖", hex: "#3A2820" },
  { k: "i", name: "樱粉", hex: "#FFD4DF" },
  { k: "p", name: "小猪粉", hex: "#F6A3BC" },
  { k: "P", name: "牡丹", hex: "#E0457D" },
  { k: "h", name: "霓虹粉", hex: "#FF2D96" },
  { k: "r", name: "胭脂", hex: "#D12A3D" },
  { k: "R", name: "酒红", hex: "#87203A" },
  { k: "a", name: "杏子", hex: "#FFBA8C" },
  { k: "o", name: "狐橘", hex: "#EE7A2D" },
  { k: "A", name: "琥珀", hex: "#C47C22" },
  { k: "y", name: "金带", hex: "#E2AC2B" },
  { k: "e", name: "鹅黄", hex: "#FFE690" },
  { k: "Y", name: "柠檬", hex: "#FFD924" },
  { k: "q", name: "青瓷", hex: "#A6D4C0" },
  { k: "L", name: "青柠", hex: "#A4E040" },
  { k: "v", name: "草绿", hex: "#4CAD56" },
  { k: "V", name: "松绿", hex: "#1F7650" },
  { k: "x", name: "天青", hex: "#AFDFF2" },
  { k: "C", name: "电光青", hex: "#1FE0F2" },
  { k: "u", name: "湖蓝", hex: "#2F99D4" },
  { k: "U", name: "宝蓝", hex: "#2A57C4" },
  { k: "N", name: "藏青", hex: "#1F2A55" },
  { k: "z", name: "泡桐紫", hex: "#DCC9EF" },
  { k: "j", name: "丁香", hex: "#B38BE0" },
  { k: "J", name: "激光紫", hex: "#904EFF" },
  { k: "Z", name: "紫袍", hex: "#6C3FA1" },
  { k: "X", name: "葡萄", hex: "#45285F" },
];
const BY_HEX = new Map(PALETTE.map((c) => [c.hex, c]));
const BY_KEY = new Map(PALETTE.map((c) => [c.k, c]));
export const colorName = (hex) => (BY_HEX.has(hex) ? BY_HEX.get(hex).name : `自定义 ${hex}`);
export const keyOf = (hex) => (BY_HEX.has(hex) ? BY_HEX.get(hex).k : "");
export const hexOfKey = (k) => (BY_KEY.has(k) ? BY_KEY.get(k).hex : "");

export const SIZES = [16, 24, 29, 32, 48];
export const HIS_SIZE = 24; // 他桌上头一块板子多大（字母一行二十四个，他看得清、拼得动）
export const NAME_MAX = 24; // 一幅的名字最长几个字

export const PD_STATE = "kfs2:pd:state";
export const PD_WORK = "kfs2:pd:work:";
export const PD_HIS = "kfs2:pindou";

export const normHex = (v) => String(v || "").trim().toUpperCase();
export const isHex = (v) => typeof v === "string" && /^#[0-9A-F]{6}$/.test(v);
export const countBeads = (g) => (g || []).reduce((n, v) => n + (v ? 1 : 0), 0);
// 用了哪几种颜色、各几颗，多的在前（一样多的照色板的次序）
export function usageOf(g) {
  const m = new Map();
  for (const v of g || []) if (v) m.set(v, (m.get(v) || 0) + 1);
  const order = (h) => (BY_HEX.has(h) ? PALETTE.indexOf(BY_HEX.get(h)) : 99);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]));
}
const emptyGrid = (n) => new Array(n * n).fill(null);

// ---------- 作品码 ----------
// PD1~边长~颜色（不带井号，逗号隔开）~一格一格：用到的颜色依次记成 a、b、c……，空格记成点，连着一样的后面跟个数
const CODE_AB = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function toCode(n, g) {
  const cols = [];
  const idx = new Map();
  for (const v of g) if (v && !idx.has(v)) idx.set(v, cols.push(v) - 1);
  if (cols.length > CODE_AB.length) return "";
  let out = "";
  let prev = "";
  let run = 0;
  const flush = () => {
    if (run) out += prev + (run > 1 ? run : "");
  };
  for (const v of g) {
    const ch = v ? CODE_AB[idx.get(v)] : ".";
    if (ch === prev) run++;
    else {
      flush();
      prev = ch;
      run = 1;
    }
  }
  flush();
  return `PD1~${n}~${cols.map((c) => c.slice(1)).join(",")}~${out}`;
}
// 认得出就回 { n, g }，认不出（不完整、边长不对、颜色不对）回 null。前后的字、中间的空白、换行都不碍事（从聊天里、备忘录里粘过来的）
export function fromCode(text) {
  const m = String(text || "")
    .replace(/\s+/g, "")
    .match(/PD1~(\d{1,2})~([0-9A-Fa-f,]*)~([A-Za-z.][A-Za-z.0-9]*)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n >= 8 && n <= 64)) return null;
  const cols = m[2] ? m[2].split(",").map((c) => "#" + c.toUpperCase()) : [];
  if (cols.some((c) => !isHex(c))) return null;
  const g = emptyGrid(n);
  const re = /([A-Za-z.])(\d*)/g;
  let i = 0;
  let r;
  while ((r = re.exec(m[3])) && i < n * n) {
    const cnt = r[2] ? parseInt(r[2], 10) : 1;
    let v = null;
    if (r[1] !== ".") {
      const k = CODE_AB.indexOf(r[1]);
      if (k < 0 || k >= cols.length) return null;
      v = cols[k];
    }
    for (let j = 0; j < cnt && i < n * n; j++) g[i++] = v;
  }
  return i === n * n ? { n, g } : null;
}

// 换一块大小不同的板子：拼好的居中挪过去，放不下的取下来（lost 是取下来几颗）
export function resizeGrid(n, g, size) {
  const off = Math.trunc((size - n) / 2);
  const out = emptyGrid(size);
  let lost = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = g[y * n + x];
      if (!v) continue;
      const nx = x + off;
      const ny = y + off;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out[ny * size + nx] = v;
      else lost++;
    }
  return { g: out, lost };
}

// 从一格起，把连着的同一种（或者连着的空格）整片换成 v；回换了几格
export function floodGrid(n, g, x, y, v) {
  const start = y * n + x;
  const target = g[start];
  if (target === v) return 0;
  const stack = [start];
  let changed = 0;
  while (stack.length) {
    const i = stack.pop();
    if (g[i] !== target) continue;
    g[i] = v;
    changed++;
    const cx = i % n;
    const cy = (i / n) | 0;
    if (cx > 0) stack.push(i - 1);
    if (cx < n - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - n);
    if (cy < n - 1) stack.push(i + n);
  }
  return changed;
}

// 名字：去掉换行、方括号、书名号（写进提示里会乱），收成一个空格，最长 NAME_MAX 个字（一个字一个字数，表情不截成半个）
export function cleanName(s) {
  const t = String(s == null ? "" : s)
    .replace(/[\[\]《》【】]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(t);
  return chars.length > NAME_MAX ? chars.slice(0, NAME_MAX).join("") : t;
}

const parse = (text) => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
};

// ---------- 她的板子、作品集 ----------
const VIEWS = ["bead", "fused", "pixel"];
const TOOLS = ["pen", "eraser", "fill", "picker"];
export const CUSTOM_MAX = 20;
// 她眼下这块板子和习惯：读不出来回 null（那一页照默认的来）
export function readState(text) {
  const s = parse(text);
  if (!s) return null;
  const b = fromCode(s.code);
  const custom = Array.isArray(s.custom) ? s.custom.map(normHex).filter(isHex).filter((h, i, a) => !BY_HEX.has(h) && a.indexOf(h) === i).slice(0, CUSTOM_MAX) : [];
  const color = normHex(s.color);
  return {
    n: b ? b.n : 24,
    g: b ? b.g : emptyGrid(24),
    custom,
    color: isHex(color) ? color : "#EE7A2D",
    view: VIEWS.includes(s.view) ? s.view : "bead",
    tool: TOOLS.includes(s.tool) ? s.tool : "pen",
    mirror: !!s.mirror,
    guides: !!s.guides,
    hint: !!s.hint,
  };
}
export function packState(st) {
  return JSON.stringify({
    v: 1,
    code: toCode(st.n, st.g),
    custom: st.custom || [],
    color: st.color,
    view: st.view,
    tool: st.tool,
    mirror: !!st.mirror,
    guides: !!st.guides,
    hint: !!st.hint,
    t: Date.now(),
  });
}

// 作品集里的一幅：{ v: 1, name, code, at }。认不出板子的回 null
export function readWork(text) {
  const w = parse(text);
  if (!w) return null;
  const b = fromCode(w.code);
  if (!b) return null;
  return { name: cleanName(w.name), code: toCode(b.n, b.g), n: b.n, g: b.g, beads: countBeads(b.g), at: Number.isFinite(w.at) ? w.at : 0 };
}
export const packWork = ({ name, code, at }) => JSON.stringify({ v: 1, name: cleanName(name), code, at: Number.isFinite(at) ? at : Date.now() });
// entries：[[钥匙, 存档里那一行]]。回新的在前
export function listWorks(entries) {
  const out = [];
  for (const [key, text] of entries || []) {
    if (typeof key !== "string" || !key.startsWith(PD_WORK)) continue;
    const w = readWork(text);
    if (w) out.push({ id: key.slice(PD_WORK.length), ...w });
  }
  return out.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
}

// ---------- 发给他的那一幅 ----------
// 她的一条话：{ role: "her", kind: "pindou", name, code, png }。png 是发的那一下画好的图（data:image/png;base64,…），寄给他的时候带着
export function pdInfo(m) {
  const b = fromCode(m && m.code);
  return { name: cleanName(m && m.name), n: b ? b.n : 0, beads: b ? countBeads(b.g) : 0, kinds: b ? usageOf(b.g).length : 0 };
}
// 寄给他的那一句（图跟在前面；也是抄提要的记录里写的）。img：图带上了没有；stale：老的图这一回不带了
export function pdText(m, { img = true, stale = false } = {}) {
  const i = pdInfo(m);
  const what = i.name ? `一幅《${i.name}》` : "一幅拼豆";
  const size = i.n ? `（${i.n}×${i.n} 的板子，${i.beads} 颗，${i.kinds} 种颜色）` : "";
  const tail = img ? "" : stale ? "（图这一回没带上）" : "（图没带上）";
  return `【拼豆作】${HER_NAME}拼了${what}${size}${tail}`;
}
// 南衙那一行的小字：作品集里几幅、他那边怎么样
export function pdSub(works, his) {
  const mine = works && works.length ? `作品集里 ${works.length} 幅` : "";
  const h = his && his.touched ? (his.done.length ? `他挂起来 ${his.done.length} 幅` : countBeads(his.g) ? "他桌上那块拼到一半" : "") : "";
  return [mine, h].filter(Boolean).join("，") || "还没拼过";
}
// 历史对话的预览、名字、日记摘录：短一点
export const pdBrief = (m) => {
  const n = cleanName(m && m.name);
  return n ? `[拼豆] ${n}` : "[拼豆]";
};

// ---------- 他屋里的那块板子 ----------
// 存档 kfs2:pindou：{ v: 1, n, code, name, since, at, done: [{ id, name, n, code, at }] }
//   n、code  桌上眼下这块（拼到一半的）；name 他起了名字没有（挂起来的时候起）；since 这块板子哪天开拼的；at 最近一回动它
//   done     挂起来的那些，旧的在前（最多 DONE_MAX 幅，再多把最旧的收起来）
export const DONE_MAX = 200;
export function readHis(text) {
  const h = parse(text);
  const b = h ? fromCode(h.code) : null;
  const done = [];
  for (const d of (h && Array.isArray(h.done) ? h.done : []).slice(-DONE_MAX)) {
    const x = d && fromCode(d.code);
    if (x) done.push({ id: String(d.id || done.length), name: cleanName(d.name) || "无题", n: x.n, g: x.g, beads: countBeads(x.g), at: Number.isFinite(d.at) ? d.at : 0 });
  }
  return {
    n: b ? b.n : HIS_SIZE,
    g: b ? b.g : emptyGrid(HIS_SIZE),
    since: h && Number.isFinite(h.since) ? h.since : 0,
    at: h && Number.isFinite(h.at) ? h.at : 0,
    done,
    touched: !!b || done.length > 0,
  };
}
export function packHis(his) {
  return JSON.stringify({
    v: 1,
    n: his.n,
    code: toCode(his.n, his.g),
    since: his.since || 0,
    at: his.at || 0,
    done: his.done.slice(-DONE_MAX).map((d) => ({ id: d.id, name: d.name, n: d.n, code: toCode(d.n, d.g), at: d.at })),
  });
}

// 板子写成字给他看：一格一个字母，. 是空着；上面两行是列号（十位、个位），左边是行号，都从 0 数
export function gridText(n, g) {
  const pad = (s, w) => String(s).padStart(w, " ");
  const lead = "     ";
  const tens = lead + Array.from({ length: n }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10)) : " ")).join("");
  const ones = lead + Array.from({ length: n }, (_, x) => String(x % 10)).join("");
  const rows = [];
  for (let y = 0; y < n; y++) {
    let line = "";
    for (let x = 0; x < n; x++) {
      const v = g[y * n + x];
      line += v ? keyOf(v) || "?" : ".";
    }
    rows.push(pad(y, 3) + "  " + line);
  }
  return [tens, ones, ...rows].join("\n");
}
const usageText = (g) =>
  usageOf(g)
    .map(([h, c]) => `${keyOf(h) || "?"} ${colorName(h)} ${c} 颗`)
    .join("，");
const dateText = (t) => {
  const d = new Date(t);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

// 桌上这块眼下的样子（他 look 的时候、拼完一笔回给他的都是这一段）
export function boardText(his) {
  const beads = countBeads(his.g);
  const head = `桌上这块拼豆板：${his.n}×${his.n}，${beads ? `拼了 ${beads} 颗` : "还空着"}。字母是颜色（见色板），. 是空着；x 是列号、y 是行号，都从 0 数。`;
  const used = beads ? `\n用到的颜色：${usageText(his.g)}。` : "";
  return `${head}\n${gridText(his.n, his.g)}${used}`;
}
// 挂起来的那些：一幅一行，新的在前；写了第几幅就看那一幅
export function galleryText(his, index) {
  const list = his.done.slice().reverse();
  if (!list.length) return "还没挂起来过一幅。拼完了用 finish 起个名字挂起来。";
  if (index != null) {
    const d = list[Number(index) - 1];
    if (!d) return `挂起来的一共 ${list.length} 幅，没有第 ${index} 幅（从 1 数，新的在前）。`;
    return `挂起来的第 ${index} 幅：《${d.name}》，${d.n}×${d.n}，${d.beads} 颗，${dateText(d.at)}挂的。\n${gridText(d.n, d.g)}\n用到的颜色：${usageText(d.g)}。`;
  }
  return `挂起来的拼豆（${list.length} 幅，新的在前；写 index 看哪一幅）：\n${list.map((d, i) => `${i + 1}.《${d.name}》${d.n}×${d.n}，${d.beads} 颗，${dateText(d.at)}`).join("\n")}`;
}

const LEGEND = PALETTE.map((c) => `${c.k} ${c.name}`).join("，");
const ACTIONS = ["look", "paint", "fill", "resize", "clear", "finish", "gallery"];
// 给那边的我的那一样工具（Anthropic 的写法：参数叫 input_schema）。只在他自己醒着、待在屋里的时候带（见 alarm/pindou.js）
export const PINDOU_TOOL = {
  name: "play_pindou",
  description:
    `你屋里桌上的一块拼豆板：一颗一颗彩色的小豆子插在板子的钉子上，拼成一幅像素画（${HER_NAME}也拼，她那块在开封府的拼豆作里）。只在你自己醒着、待在屋里的时候能拼。action 挑一样：` +
    "look 看看板子眼下拼成什么样（一格一个字母，字母是颜色，. 是空着）；" +
    "paint 往板子上放豆子：rows 里一项是一行，y 是第几行、x 从第几列开始（都从 0 数，x 不写就是 0），beads 是一串字母，一个字母一颗豆子往右排，. 或者空格是这一格不动，- 是把这一格的豆子取下来；" +
    "fill 从 at 那一格起，把连着的同一种颜色（或者连着的空格）整片换成 color（写 - 是整片取下来）；" +
    "resize 换一块板子，size 挑 16、24、29、32、48，拼好的居中挪过去，放不下的取下来；" +
    "clear 把板子上的豆子全取下来，从头拼；" +
    "finish 拼完了，起个名字（name）挂起来，桌上换一块一样大的空板子；" +
    "gallery 翻翻挂起来的那些，写了 index（从 1 数，新的在前）就看那一幅。" +
    `拼一笔、换一块、清空以后，回给你的是板子眼下的样子。色板（字母 颜色）：${LEGEND}。` +
    "这块板子会一直摆在桌上，下回醒来接着拼。你拼的东西她在拼豆作里看得见：拼到一半的、挂起来的都看得见，只能看、动不了。",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ACTIONS, description: "look 看、paint 放豆子、fill 整片换色、resize 换板子、clear 清空、finish 挂起来、gallery 翻挂起来的" },
      rows: {
        type: "array",
        description: "paint 用：一项一行",
        items: {
          type: "object",
          properties: {
            y: { type: "integer", description: "第几行，从 0 数" },
            x: { type: "integer", description: "从第几列开始，从 0 数，不写就是 0" },
            beads: { type: "string", description: "一个字母一颗豆子，往右排；. 或空格不动，- 取下来" },
          },
          required: ["y", "beads"],
        },
      },
      at: { type: "object", description: "fill 用：从哪一格起", properties: { x: { type: "integer" }, y: { type: "integer" } }, required: ["x", "y"] },
      color: { type: "string", description: "fill 用：色板上的一个字母，- 是取下来" },
      size: { type: "integer", enum: SIZES, description: "resize 用：新板子的边长" },
      name: { type: "string", description: "finish 用：这一幅叫什么，二十个字以内" },
      index: { type: "integer", description: "gallery 用：看第几幅，从 1 数，新的在前" },
    },
    required: ["action"],
  },
};
export const isPindouCall = (c) => !!(c && c.name === PINDOU_TOOL.name);

// 狐宇宙里那一行小字（同园子、妆台：屋里只留一行；板子她在拼豆作「他的」那一栏里看得见）
export const PD_NOTE = {
  look: "看了看拼豆板",
  paint: "在拼豆板上拼了一会儿",
  clear: "把拼豆板清空了",
  gallery: "翻了翻挂起来的拼豆",
  fail: "想拼拼豆，没拼成",
};
const resizeNote = (n) => `换了一块 ${n}×${n} 的拼豆板`;
const finishNote = (name) => `拼完了一幅《${name}》，挂了起来`;

const int = (v) => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN);

// 替他办一样：回 { his（办完以后的，没动就是原来那份）, out（给他看的字）, note（屋里那一行）, err, changed }。
// 不碰存档（存不存是闹钟那头的事，见 alarm/pindou.js）；now 是现在几点（测试里换成定的）
export function hisApply(his0, input, now = Date.now()) {
  const action = input && ACTIONS.includes(input.action) ? input.action : "";
  if (!action) return { his: his0, out: `action 写 ${ACTIONS.join("、")}，挑一样。`, note: PD_NOTE.fail, err: true, changed: false };
  const his = { ...his0, g: his0.g.slice(), done: his0.done.slice() };
  const n = his.n;
  const touch = () => {
    if (!his.since) his.since = now;
    his.at = now;
    his.touched = true;
  };
  if (action === "look") return { his: his0, out: boardText(his0), note: PD_NOTE.look, err: false, changed: false };
  if (action === "gallery") {
    const idx = input.index == null || input.index === "" ? null : int(input.index);
    return { his: his0, out: galleryText(his0, Number.isNaN(idx) ? null : idx), note: PD_NOTE.gallery, err: false, changed: false };
  }
  if (action === "paint") {
    const rows = Array.isArray(input.rows) ? input.rows : null;
    if (!rows || !rows.length) return { his: his0, out: "paint 要写 rows：一项一行，写 y（第几行）、beads（一串字母），x 不写就是从第 0 列开始。", note: PD_NOTE.fail, err: true, changed: false };
    let put = 0;
    let took = 0;
    const odd = new Set();
    const off = [];
    const cut = [];
    rows.forEach((r, i) => {
      const y = int(r && r.y);
      const x0 = r && r.x != null && r.x !== "" ? int(r.x) : 0;
      const beads = r && typeof r.beads === "string" ? r.beads : "";
      if (Number.isNaN(y) || y < 0 || y >= n || Number.isNaN(x0) || x0 < 0 || x0 >= n) {
        off.push(i + 1);
        return;
      }
      const chars = Array.from(beads);
      if (x0 + chars.length > n) cut.push(y);
      chars.slice(0, n - x0).forEach((ch, j) => {
        if (ch === "." || ch === " ") return;
        const at = y * n + x0 + j;
        if (ch === "-") {
          if (his.g[at]) {
            his.g[at] = null;
            took++;
          }
          return;
        }
        const hex = hexOfKey(ch);
        if (!hex) {
          odd.add(ch);
          return;
        }
        if (his.g[at] !== hex) {
          his.g[at] = hex;
          put++;
        }
      });
    });
    const notes = [];
    if (off.length) notes.push(`第 ${off.join("、")} 项的 y 或 x 不在板子上（这块是 ${n}×${n}，从 0 数到 ${n - 1}），那几项没放`);
    if (cut.length) notes.push(`第 ${cut.join("、")} 行写出板子右边了，多的没放`);
    if (odd.size) notes.push(`${Array.from(odd).slice(0, 8).join("、")} 不在色板上，那几格没动`);
    const changed = put + took > 0;
    if (changed) touch();
    const said = changed ? `放好了：这一笔放了 ${put} 颗${took ? `、取下 ${took} 颗` : ""}` : "这一笔板子上没变";
    return { his: changed ? his : his0, out: `${said}${notes.length ? `（${notes.join("；")}）` : ""}。\n\n${boardText(changed ? his : his0)}`, note: changed ? PD_NOTE.paint : PD_NOTE.look, err: !changed && notes.length > 0, changed };
  }
  if (action === "fill") {
    const x = int(input.at && input.at.x);
    const y = int(input.at && input.at.y);
    const c = typeof input.color === "string" ? input.color.trim() : "";
    const hex = c === "-" ? null : hexOfKey(c);
    if (Number.isNaN(x) || Number.isNaN(y) || x < 0 || y < 0 || x >= n || y >= n) return { his: his0, out: `fill 要写 at（x、y，从 0 数，这块是 ${n}×${n}）。`, note: PD_NOTE.fail, err: true, changed: false };
    if (hex === "") return { his: his0, out: `color 写色板上的一个字母（取下来写 -）。色板：${LEGEND}。`, note: PD_NOTE.fail, err: true, changed: false };
    const k = floodGrid(n, his.g, x, y, hex);
    if (!k) return { his: his0, out: `那一片本来就是这个颜色，板子上没变。\n\n${boardText(his0)}`, note: PD_NOTE.look, err: false, changed: false };
    touch();
    return { his, out: `换好了：从（${x}，${y}）起连着的 ${k} 格${hex ? `换成了${colorName(hex)}` : "取下来了"}。\n\n${boardText(his)}`, note: PD_NOTE.paint, err: false, changed: true };
  }
  if (action === "resize") {
    const size = int(input.size);
    if (!SIZES.includes(size)) return { his: his0, out: `size 挑 ${SIZES.join("、")} 里的一个。`, note: PD_NOTE.fail, err: true, changed: false };
    if (size === n) return { his: his0, out: `桌上这块本来就是 ${n}×${n}。\n\n${boardText(his0)}`, note: PD_NOTE.look, err: false, changed: false };
    const r = resizeGrid(n, his.g, size);
    his.n = size;
    his.g = r.g;
    touch();
    return { his, out: `换了一块 ${size}×${size} 的板子，拼好的居中挪过来了${r.lost ? `，边上 ${r.lost} 颗放不下，取下来了` : ""}。\n\n${boardText(his)}`, note: resizeNote(size), err: false, changed: true };
  }
  if (action === "clear") {
    if (!countBeads(his.g)) return { his: his0, out: `板子本来就是空的。\n\n${boardText(his0)}`, note: PD_NOTE.look, err: false, changed: false };
    his.g = emptyGrid(n);
    his.since = now;
    his.at = now;
    his.touched = true;
    return { his, out: `豆子全取下来了，桌上是一块空的 ${n}×${n}。`, note: PD_NOTE.clear, err: false, changed: true };
  }
  // finish
  const beads = countBeads(his.g);
  if (!beads) return { his: his0, out: "板子上还一颗豆子都没有，挂不起来。", note: PD_NOTE.look, err: true, changed: false };
  const name = cleanName(input.name) || "无题";
  his.done.push({ id: now.toString(36) + his.done.length.toString(36), name, n, g: his.g, beads, at: now });
  if (his.done.length > DONE_MAX) his.done = his.done.slice(-DONE_MAX);
  his.g = emptyGrid(n);
  his.since = 0;
  his.at = now;
  his.touched = true;
  return { his, out: `挂起来了：《${name}》，${n}×${n}，${beads} 颗。挂起来的一共 ${his.done.length} 幅。桌上换了一块空的 ${n}×${n}。`, note: finishNote(name), err: false, changed: true };
}

// 【醒来】里那一句：拼豆板眼下的样子（同园子、妆台：告诉他，去不去他自己定）
export function pindouBrief(his) {
  const beads = countBeads(his.g);
  const last = his.done[his.done.length - 1];
  if (!his.touched) return `拼豆板还空着：一块 ${his.n}×${his.n} 的板子，色板上三十九种颜色。`;
  const board = beads ? `桌上那块 ${his.n}×${his.n} 拼了 ${beads} 颗，拼到一半` : `桌上是一块空的 ${his.n}×${his.n}`;
  const hung = his.done.length ? `；挂起来的有 ${his.done.length} 幅，最近一幅是《${last.name}》` : "";
  return `${board}${hung}。`;
}

// 聊天里回屋看一眼（src/room.js 的 room_look，what 写 pindou）：只能看，动不了
export function pindouView(his) {
  const head = "【你屋里·拼豆板】（回屋看了一眼。只能看，动不了：拼豆只在你自己在屋里醒着的时候。你拼的东西她在拼豆作「他的」那一栏里也看得见。）";
  const rule = `怎么玩：${PINDOU_TOOL.description}`;
  if (!his.touched) return [head, `拼豆板你还没动过：桌上是一块空的 ${his.n}×${his.n}。`, rule].join("\n\n");
  return [head, boardText(his), galleryText(his), rule].join("\n\n");
}
