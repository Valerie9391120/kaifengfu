// =====================================================
// 前情提要
// 一段对话聊长了，前面的原话不再每次寄给那边的我，换成他自己抄的提要；最近的照旧寄原话。
// 原来的规矩是只寄最后二三十条，前面的直接不寄，也不告诉他：聊了半天的对话，他会当成新开的。
//
// 提要不放进对话里，另存一条（RECAP_KEY + 对话编号，是一个单子，加密了跟着云端走）。
// 对话那一串消息一个字不动：发话、等回话、停键、开分支那一大套都认它，不往里添新东西。
// 单子里的一份：{ id, upto, parts, more, at, ts, n, model }
//   upto   抄到哪一条为止（那一条消息的 id）
//   parts  提要是一段一段攒起来的：[{ text, t0, t1, rows }]，从老到新。
//          text 这一段的正文（平常的字，哪个模型都认）；t0、t1 它抄的那些原话是几点到几点；rows 抄了几条
//   more   这一份还没抄到该抄到的地方（要抄的太厚，一趟抄不完），下一趟接着抄
//   at     什么时候抄的；ts 抄到的那一条是几点说的；n 那一条是这段对话的第几条（从 1 数）
//   model  最后一趟是哪个模型抄的
// 为什么一段一段攒，不是每回把整份重写一遍：
//   抄提要要另问他一回，这一回走的是网页自己等着的那条路：小后端一趟只保得住 75 秒（见开发说明“运行环境的几条规矩”），
//   她一切走、一锁屏，等着的这头就断了，那一回白问。整份重写的话越写越长，一回写三四千字，一分多钟写不完。
//   所以一趟只抄一小段：读的原话有上限（PIECE_MAX），写的也有上限（PART_MOST），十几二十秒的事，哪个模型都赶得上；
//   她中途走了，丢的也只是这一小段，前面几趟抄好的都在。
//   段数攒多了（PARTS_MAX），把最早的一半并成一段（也是单独的一趟）：老的事越压越短，新的事留得细。
// 一份提要作不作数只看 upto：眼下摆在外面的这一支对话里有这一条，就作数。
// 她改了前面的话、翻到别的版本（见 thread.js），那一条不在外面了，提要跟着不作数；翻回来又作数。
// 所以单子里留好几份：哪一份的 upto 在外面、又最靠后，就用哪一份（pickRecap）。
// （一条消息的 id 只在一支里出现；它在外面，它前面的那一串就和抄的时候是同一串。）
//
// 厚薄按字数算，不按 token：字数在手机上数得准，换哪个模型都是这个数；
// 一张照片、一张表情包各折成固定的字数（THICK）。
//
// 这里只放不碰页面、不碰存档的部分，测试在 Node 里跑（tests/recap.test.mjs）。
// 寄给他的话怎么写在 prompt/ 里：平时那一整段见 prompt/messages.js，叫他抄的那一回见 prompt/recap.js。
// =====================================================
import { NAME_MARK } from "./names.js";
import { pad } from "./days.js";

export const RECAP_KEY = "kfs2:recap:";
const RECAP_KEEP = 6; // 单子里最多留几份

// ---------- 一趟抄多少 ----------
export const PIECE_MAX = 18000; // 一趟最多读这么厚的原话（照 askThick 算）：写出来四五百字，十几二十秒
export const PIECE_PHOTOS = 12; // 一趟最多带这么多张照片的图（照厚薄算，一趟本来也就放得下十一张）
export const PIECE_BYTES = 9000000; // 这些图一共最多这么大（base64 的字数）
export const PART_MOST = 900; // 一段提要最长写这么多字（跟他说的数）
export const MERGE_MOST = 1200; // 并出来的那一段最长写这么多字（跟他说的数）
const PART_CLIP = 3000; // 他写得离谱地长的话最多留这么多字（平常超一点的不动它：截掉的正是最后那几样要紧的）
const PART_MIN = 60; // 比这还短的不算抄出来了
const SLIVER = 1500; // 原话不到这么厚的一截，不值得单为它问一回
export const PARTS_MAX = 16; // 攒到超过这么多段，把最早的一半并成一段
export const TEXT_MAX = 9000; // 或者几段加起来超过这么多字，也并
// 叫他抄的时候，原话里太长的东西只带开头（prompt/recap.js 照这几个数截，这里照这几个数算厚薄）
export const DOC_HEAD = 2500; // 她发的文档
export const HIS_DOC_HEAD = 1200; // 他交的文档
export const ROW_HEAD = 10000; // 一条话

// ---------- 他记多长 ----------
// 三档，API 面板里拨。单位是字：
//   trigger  原话攒到这么厚，叫他把前面的抄成提要
//   keep     抄的时候，最近这么厚留原话不抄
// 抄不成的时候（没网、那边不肯写）照旧寄原话，寄到 trigger 的一倍半（hard）为止，再厚就硬切。
// 适中那一档是照长一点的聊法定的：一个来回连她带他五百字上下的话，聊一百个来回上下抄一回；
// 平常闲聊一个来回一百来字，要聊四五百个来回才抄头一回。
export const RECALL = {
  short: { label: "短", trigger: 20000, keep: 6000 },
  mid: { label: "适中", trigger: 50000, keep: 15000 },
  long: { label: "长", trigger: 120000, keep: 36000 },
};
export const DEFAULT_RECALL = "mid";
const HARD_RATIO = 1.5;
const MIN_ROOM = 16000; // 屋子再小，也当它放得下这么多字的对话（再少就没法聊了；真放不下，那边自会说）

// 屋子里放得下多少字的对话。window 是模型的屋子有多大（上下文窗口，token，见 models.js）。
// 往多里算（平常用这个，定那一档的几个数）：屋子打七折留余量，刨掉回复要占的，一个字按 1.6 个 token 折，再刨掉名帖和记忆库占的字。
//   汉字一个字一个多 token，新模型的分词还要再多三成，1.6 是往多里估的。
// sure = true 是往少里算（一个字只按一个 token、屋子几乎不打折）：照这个算都放不下，才是真放不下。
//   最后那二三十条只有到了这一步才去切（见 planWindow）：估得太保守就白白少寄了，原来的规矩可是不管屋子、照寄二三十条的
export function roomFor(window, sysChars, maxTokens, sure = false) {
  const w = Number(window) || 200000;
  const per = sure ? 1 : 1.6;
  return Math.floor((w * (sure ? 0.95 : 0.7) - (Number(maxTokens) || 0)) / per - (Number(sysChars) || 0));
}

// 这一档眼下作数的几个数。room 是屋子里放得下多少字（roomFor），most 是往少里算的那个数；没给就当屋子够大。
// 屋子小的模型（二十万的）：hard 顶到屋子的八成为止（剩下两成留给硬切不管的最近那几十条），trigger、keep 跟着往下缩
export function tierOf(key, room = Infinity, most = Infinity) {
  const base = Object.prototype.hasOwnProperty.call(RECALL, key) ? RECALL[key] : RECALL[DEFAULT_RECALL];
  const space = Math.max(MIN_ROOM, Number.isFinite(room) ? room : Infinity);
  const hard = Math.min(Math.round(base.trigger * HARD_RATIO), Math.round(space * 0.8));
  const trigger = Math.min(base.trigger, Math.round(hard / HARD_RATIO));
  const keep = Math.min(base.keep, Math.round(trigger * 0.3));
  return { trigger, keep, hard, room: space, most: Math.max(space, Number.isFinite(most) ? most : Infinity) };
}

// ---------- 一条有多厚 ----------
// 照片、表情包折成字。照片长边压到 1280（images.js），那边看一张是一千五到两千个 token，折一千五百字；
// 表情包的缩略图三百像素，一百来个 token
export const THICK = { row: 8, photo: 1500, meme: 150, doc: 2000 };

const len = (s) => (typeof s === "string" ? s.length : 0);

// 平时寄给他的时候，这一条有多厚
export function thick(m) {
  if (!m) return 0;
  if (m.role === "event") return THICK.row + 40 + (m.av ? THICK.meme : 0);
  if (m.role === "her") {
    if (m.kind === "photo") return THICK.row + THICK.photo;
    if (m.kind === "meme") return THICK.row + THICK.meme + 30;
    // 文档的全文跟着这一行整份寄过去（见 docs.js）。字数发的时候记在这一行上；没记的按两千字算
    if (m.kind === "doc") return THICK.row + 80 + (Number(m.chars) > 0 ? Number(m.chars) : THICK.doc);
    if (m.kind === "voice") return THICK.row + 30 + len(m.text);
    return THICK.row + len(m.text);
  }
  // 他的：寄回去的是 raw（心里话不寄）。他换了头像的，后面跟一行提示带着图
  const changed = (m.items || []).some((it) => it && it.type === "avatar");
  return THICK.row + len(m.raw) + (changed ? 60 + THICK.meme : 0);
}

// 叫他抄提要的时候，这一条有多厚：太长的东西只带开头，表情包只写名字（见 prompt/recap.js）
export function askThick(m) {
  if (!m) return 0;
  if (m.role === "event") return THICK.row + 30;
  if (m.role === "her") {
    if (m.kind === "photo") return THICK.row + THICK.photo;
    if (m.kind === "meme") return THICK.row + 30;
    if (m.kind === "doc") return THICK.row + 80 + Math.min(DOC_HEAD, Number(m.chars) > 0 ? Number(m.chars) : THICK.doc);
    return THICK.row + Math.min(ROW_HEAD, len(m.text)) + (m.kind === "voice" ? 12 : 0);
  }
  const items = Array.isArray(m.items) && m.items.length ? m.items : null;
  if (!items) return THICK.row + Math.min(ROW_HEAD, len(m.raw));
  return items.reduce((a, it) => a + (it && it.type === "doc" ? 60 + Math.min(HIS_DOC_HEAD, len(it.text)) : it && it.type === "text" ? Math.min(ROW_HEAD, len(it.text)) + 4 : 30), THICK.row);
}

const isPhoto = (m) => !!m && m.role === "her" && m.kind === "photo";
const hasPicture = (m) => !!m && m.role === "her" && (m.kind === "photo" || m.kind === "meme");

// 截一段字，不从一个字的两半中间切（表情那种字占两格，切开了整段话那边都不认）
export function clip(text, max) {
  const t = typeof text === "string" ? text : String(text == null ? "" : text);
  if (t.length <= max) return t;
  let end = Math.max(0, max);
  const c = t.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end--;
  return t.slice(0, end);
}

// ---------- 最后这二三十条 ----------
// 原来的规矩：四十条以内全寄，再多就只寄最后二三十条，二十条一跳。
// 新规矩不管怎么切、怎么抄，这最后二三十条都寄原话：寄给他的永远不比原来少。
// 她刚发的大文档也靠这一条留得住：它再厚，也要等后面又添了二三十条才轮到抄
export function rowFloor(n) {
  return n <= 40 ? 0 : Math.floor((n - 20) / 20) * 20;
}

// 眼下她问的这一轮从第几条起（最后那一串她的话；最后一条是他的就是最后那一条）
function lastTurn(msgs) {
  let i = msgs.length - 1;
  while (i > 0 && msgs[i].role !== "him" && msgs[i - 1].role !== "him") i--;
  return Math.max(0, i);
}

// ---------- 提要的字 ----------
// 钟点怎么写：只在提要这一摊里用（段首那一行、寄给他时的“抄到几点为止”），写法定死，两回寄的时候一个字不差
export function stamp(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 从几点到几点：同一天的，后头那个只写钟点（一段多半就是一天里的事，日子写两遍在手机上要折行）
export function stampSpan(t0, t1) {
  const a = new Date(t0);
  const b = new Date(t1);
  const sameDay = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  return `${stamp(t0)} 到 ${sameDay ? `${pad(b.getHours())}:${pad(b.getMinutes())}` : stamp(t1)}`;
}

const goodPart = (p) => !!p && typeof p === "object" && typeof p.text === "string" && !!p.text.trim();

// 几段连成一整份：每段前面一行写它抄的是几点到几点的原话
export function recapText(parts) {
  return (parts || [])
    .filter(goodPart)
    .map((p) => (p.t0 && p.t1 ? `〔${stampSpan(p.t0, p.t1)}〕\n` : "") + p.text.trim())
    .join("\n\n");
}

// 单子收拾一遍：坏的、空的不认；每一份上添一个 text（几段连成的整份），外头都用它
export function normRecaps(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== "object" || typeof r.upto !== "string" || !r.upto || !Array.isArray(r.parts)) continue;
    const parts = r.parts.filter(goodPart);
    if (!parts.length) continue;
    out.push({ ...r, parts, text: recapText(parts) });
  }
  return out;
}

// ---------- 用哪一份提要 ----------
// 回 { recap, at }：at 是它抄到的那一条眼下排第几（下标）。没有作数的：{ recap: null, at: -1 }
export function pickRecap(msgs, recaps) {
  const list = normRecaps(recaps);
  if (!list.length) return { recap: null, at: -1 };
  const pos = new Map();
  msgs.forEach((m, i) => pos.set(m.id, i));
  let recap = null;
  let at = -1;
  for (const r of list) {
    const i = pos.has(r.upto) ? pos.get(r.upto) : -1;
    if (i < 0) continue;
    // 抄到同一条的有两份（两台设备各抄了一回）：用后抄的
    if (i > at || (i === at && (r.at || 0) > ((recap && recap.at) || 0))) {
      recap = r;
      at = i;
    }
  }
  return { recap, at };
}

// ---------- 这一回寄哪些 ----------
// 回 { recap, at, start, from, gap, over, total, sent }：
//   recap、at  用哪一份提要、它抄到第几条（没有就是 null、-1）
//   start      提要之后的头一条
//   from       原话从第几条寄起。平常就是 start
//   gap        硬切掉的条数：提要之后、from 之前，这一回没寄原话，提要也还没抄到（from 比 start 靠后的时候）
//   over       和提要重着的条数：提要里已经抄过、原话也照寄（from 比 start 靠前的时候）
//   total      start 以后一共多厚；sent 这一回寄出去的原话多厚
//
// 重着寄：最后二三十条（rowFloor）无论如何寄原话。平常提要抄不到那儿，碰不上；
// 她点了重新回答、改了前面的话，这一支一下子短了，提要抄到的地方就可能落在最后二三十条里头。
// 这时候原话照样从 rowFloor 寄起，和提要重着的那几条在附注里说一声。寄的永远不比原来少。
//
// 硬切是抄不成的时候兜底用的，也管她那些早就聊得很长、提要还没追上来的旧对话。
// 它只管老的那一段：提要之后、最后六七十条之前（rowFloor 再往前让 HARD_LAG 条）。这一段超过 hard 了，从最老的切起，
// 四分之一个 hard 一跳，留下的在四分之三个 hard 和一个 hard 之间。
// 为什么要往前让：一条话从最后二三十条里退出来，才轮得到抄提要（dueRecap）；抄要等他回完一句才动手，还得等那边写完。
// 硬切要是紧跟着 rowFloor，一份大文档刚退出来、还没来得及抄，这一回就先被切掉了。
// 让出四十条：正常的时候提要早就抄完了，轮不到硬切；抄了这么久都没抄成，才切。
// 切掉的不是丢了：提要是从 start 一段一段往后抄的（dueRecap），切掉的那些迟早抄得到；切只是这几回先不寄。
// 跳着切是为了缓存：两跳之间前面一个字不变，每句话只有新添的那几句按写缓存的价算（和原来二十条一跳是一个道理）。
// 切到哪儿只看从 start 数起攒了多厚，后面再添话不会让它挪窝，要等老的那一段的厚度跨过下一格才跳
const HARD_LAG = 40;
export function planWindow(msgs, recaps, tier) {
  const n = msgs.length;
  const { recap, at } = pickRecap(msgs, recaps);
  const start = at + 1;
  const floor = rowFloor(n);
  const begin = Math.min(start, floor); // 厚薄从这儿数起（重着寄的时候比 start 靠前）
  const sums = [0]; // sums[k]：从 begin 起头 k 条一共多厚
  for (let i = begin; i < n; i++) sums.push(sums[sums.length - 1] + thick(msgs[i]));
  const upTo = (i) => sums[i - begin];
  const total = upTo(n) - upTo(start);
  const head = recap ? recap.text.length : 0; // 提要自己占的地方：看屋子放不放得下的时候算上
  let from = begin;
  if (start <= floor) {
    const old = Math.max(start, floor - HARD_LAG); // 这一条之前的，才归硬切管
    const stale = upTo(old) - upTo(start);
    if (stale > tier.hard) {
      const step = Math.max(1, Math.round(tier.hard / 4));
      const drop = Math.floor((stale - (tier.hard - step)) / step) * step;
      while (from < old && upTo(from) - upTo(start) < drop) from++;
    }
  }
  // 屋子小的模型：硬切让出来的那四十条加上最后二三十条，往多里算可能就放不下了（一百万的屋子碰不上这一条）。
  // 那就接着往后切，最多切到最后二三十条跟前：寄的还是不比原来少，可也不能因为多寄了这一截，整句发不出去。
  // 也是跳着切（八分之一个屋子一跳）：超出去多少才切多少的话，每添一句切口都要挪
  if (from < floor && upTo(n) - upTo(from) + head > tier.room) {
    const step = Math.max(1, Math.round(tier.room / 8));
    const drop = Math.ceil((upTo(n) - upTo(from) + head - tier.room) / step) * step;
    const base = from;
    while (from < floor && upTo(from) - upTo(base) < drop) from++;
  }
  // 往少里算屋子都放不下（多半是最近那几十条里有好几份大文档）：只好接着切，切到她眼下问的这一轮为止。
  // 这时候每添一句切口都在挪，缓存用不上；总比整句发不出去强
  if (upTo(n) - upTo(from) + head > tier.most) {
    const last = Math.max(from, lastTurn(msgs));
    while (from < last && upTo(n) - upTo(from) + head > tier.most) from++;
  }
  return { recap, at, start, from, gap: Math.max(0, from - start), over: Math.max(0, start - from), total, sent: upTo(n) - upTo(from) };
}

// ---------- 图 ----------
// 一回最多带多少张她发的图（照片、表情包）、照片一共多大（base64 的字数）。
// Anthropic 一回最多收一百张（二十万屋子的模型），整个请求不过 32 MB。
// 最后二三十条里的图不在这两个数里、一张不去：原来这二三十条全是照片也照寄，不能比原来少。
// 这两个数管的是它们前面的：加上最后二三十条里最多四十张，一回到不了一百张
const IMG_MAX = 40;
const BYTES_MAX = 9000000;
// 照片攒多了也算厚：最后二三十条之前的照片有这么多张、这么大，就该抄了（抄的时候最近这些留着）
const PHOTO_TRIGGER = 30;
const PHOTO_KEEP = 12;
const BYTES_TRIGGER = 8000000;
const BYTES_KEEP = 3000000;

// 从 from 寄起的这一回里，哪几条的图不带了（回它们的下标）。bytesOf(m) 是那一条的图有多大，没图回 0。
// 张数超了（照片、表情包一共过了四十张）：去表情包的图，从最老的去起（它那句话里写着名字和图上的字，图去了不少什么）。
// 照片的图去了就没处看了，所以轻易不去：光照片自己就过了四十张，才从最老的照片去起；
//   照片一共太大（过了九兆），也从最老的照片去起（表情包的缩略图只有几千个字，不算在里头）。
//   这两样都比“照片攒多了该抄提要”那两条线（三十张、八兆）高：正常的时候提要早抄了，轮不到去照片的图。
// 都是跳着去（张数二十张一跳，大小三兆一跳），两跳之间前面不变；去过图的不会又带上（只增不减）。
// 不带图的那一条只剩一句话：表情包留名字和图上的字，照片留一句“她之前发过一张照片，图这一回没带上”
export function staleImages(msgs, from, bytesOf) {
  const end = rowFloor(msgs.length);
  const memes = [];
  const photos = [];
  let bytes = 0;
  for (let i = from; i < end; i++) {
    if (!hasPicture(msgs[i])) continue;
    const b = Number(bytesOf(msgs[i])) || 0;
    if (b <= 0) continue;
    if (isPhoto(msgs[i])) {
      photos.push({ i, b });
      bytes += b;
    } else memes.push({ i, b });
  }
  const out = new Set();
  const half = IMG_MAX / 2;
  const jump = (count) => (count <= IMG_MAX ? 0 : Math.floor((count - half) / half) * half);
  memes.slice(0, jump(memes.length + photos.length)).forEach((x) => out.add(x.i));
  const dropP = jump(photos.length);
  const third = BYTES_MAX / 3;
  const dropB = bytes <= BYTES_MAX ? 0 : Math.floor((bytes - 2 * third) / third) * third;
  let gone = 0;
  photos.forEach((x, k) => {
    if (k < dropP || gone < dropB) {
      out.add(x.i);
      gone += x.b;
    }
  });
  return out;
}

// ---------- 该不该抄、抄哪一段 ----------
// 他回完一句以后看一眼。不用抄回 null。要抄的话回两种里的一种：
//   { kind: "piece", from, to, upto, ts, n, prev, more, thick }
//       把第 from 条到第 to 条（下标，两头都算）抄成新的一段，接在 prev（上一份提要，没有就是 null）的那几段后面。
//       upto、ts 抄到的那一条的 id、它是几点说的；n 它是第几条（从 1 数）；thick 这一段原话多厚（照 askThick）
//       more 这一趟没抄到该抄到的地方（太厚，一趟读不完），抄完存好以后还得接着抄下一趟
//   { kind: "merge", prev, count }
//       prev 的段数攒得太多了：把最早的 count 段并成一段，别的不动（upto 也不动）
// 规矩：
//   能抄的只有中间那一段：上一份提要之后、最后二三十条（rowFloor）之前。它攒到 trigger 才抄；
//   里面的照片太多、太大也抄。最后二三十条再厚也不算数：她刚发的大文档，要等它退到那二三十条前面才轮到
//   抄到哪儿为止：最近 keep 那么厚留着不抄，照片最多留十来张
//   一趟只抄一段，从上一份之后的头一条抄起，读到一趟的上限为止；没抄到头的记上 more，下一趟不等攒够就接着抄。
//   寄的时候中间有一截没寄的（硬切了、屋子小的模型放不下），也是不等攒够就抄
//   （她把“他记多长”拨小了、换了屋子小的模型、聊了很久才头一回抄：都是这样一趟一趟追上来，没有哪一条是跳过去不抄的）
//   切在一轮的末尾：抄到他的一条回话为止，留下的从她的话开头
//   要抄的太薄（不到 trigger 的一成）不值当，不抄
// bytesOf(m)：那一条照片有多大（base64 的字数），没有回 0
export function dueRecap(msgs, recaps, tier, bytesOf = () => 0) {
  const n = msgs.length;
  const { recap: prev, at } = pickRecap(msgs, recaps);
  const start = at + 1;
  const floor = rowFloor(n);

  // 段数太多、太长：先并
  if (prev && prev.parts.length >= 2 && (prev.parts.length > PARTS_MAX || prev.text.length > TEXT_MAX)) {
    return { kind: "merge", prev, count: Math.max(2, Math.ceil(prev.parts.length / 2)) };
  }
  if (floor <= start) return null;

  let body = 0;
  let photos = 0;
  let bytes = 0;
  for (let i = start; i < floor; i++) {
    body += thick(msgs[i]);
    if (isPhoto(msgs[i])) {
      photos++;
      bytes += Number(bytesOf(msgs[i])) || 0;
    }
  }
  // 照片太多、太大（这两条线比 staleImages 开始去照片的图的那两条线低：先抄了，图才轮不到去）
  const heavy = photos > PHOTO_TRIGGER || bytes > BYTES_TRIGGER;
  const chasing = !!(prev && prev.more);
  // 这一回寄的时候中间有一截没寄（硬切了；屋子小的模型放不下）：不等攒够，也不嫌薄，把那一截抄了。
  // 这样没寄的那一截不会一直空着：寄的加上抄的，迟早凑得齐整段对话
  const cut = planWindow(msgs, recaps, tier).gap > 0;
  if (!chasing && !cut && body < tier.trigger && !heavy) return null;

  // 抄到哪儿为止：从最后往前数，留下的不超过 keep、照片不超过那两个数；最后二三十条无论如何留着
  let t = n;
  let kept = 0;
  let keptPhotos = 0;
  let keptBytes = 0;
  while (t > start) {
    const m = msgs[t - 1];
    const p = isPhoto(m) ? 1 : 0;
    const b = p ? Number(bytesOf(m)) || 0 : 0;
    if (kept + thick(m) > tier.keep || keptPhotos + p > PHOTO_KEEP || keptBytes + b > BYTES_KEEP) break;
    kept += thick(m);
    keptPhotos += p;
    keptBytes += b;
    t--;
  }
  t = Math.min(t, floor);
  // 一轮的末尾：前一条是他的、这一条不是
  const edge = (i) => i > start && i < n && msgs[i - 1].role === "him" && msgs[i].role !== "him";
  // 多薄算太薄：不到 trigger 的一成（至少 SLIVER 那么多）
  const thin = Math.max(SLIVER, Math.round(tier.trigger * 0.1));
  const spanTo = (end) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += thick(msgs[i]);
    return sum;
  };
  // 挪到一轮的末尾，不把一轮从中间劈开。先往后找（多抄半轮：她发的文档和他看完说的话抄在一起），
  // 后面到那二三十条为止都没有，再往前找（多留半轮原话）；都找不到就照厚薄切。三种时候不往前退：
  //   往前找到的太靠前（中间是她一个人连着说的一长串，一轮的末尾在这一长串前头），抄不了多少；
  //   这一回寄的中间有一截空着（cut）：留在前头的那半轮寄不出去，下一趟还得单为它问一回；
  //   留在前头的那半轮只是一点零头、屋子又快满了（往后再添几句它就寄不出去了，到时候也得单为它问一回）
  let a = t;
  while (a <= floor && !edge(a)) a++;
  if (a > floor) {
    a = start;
    if (!cut) {
      let b = t;
      while (b > start && !edge(b)) b--;
      if (b > start && spanTo(b) >= thin) {
        const left = spanTo(t) - spanTo(b);
        let after = prev ? prev.text.length : 0; // 退了以后这一回要寄多厚：提要，加上从退到的地方起的原话
        for (let i = b; i < n; i++) after += thick(msgs[i]);
        if (!(left < SLIVER && after > tier.room * 0.7)) a = b;
      }
    }
  }
  if (a > start) t = a;
  if (t <= start) return null;

  const span = spanTo(t);
  let spanPhotos = 0;
  for (let i = start; i < t; i++) if (isPhoto(msgs[i])) spanPhotos++;
  // 太薄不值当：接着追的时候也一样（剩下的那一点就留着原话，等它再攒一攒）
  if (span < thin && !cut && !(heavy && spanPhotos > 0)) return null;

  // 这一趟抄到哪儿：从 start 往后读，读到一趟的上限为止（至少一条）。屋子小的模型，上限跟着屋子缩
  const pieceMax = Math.min(PIECE_MAX, tier.room - TEXT_MAX - 1000);
  let e = start;
  let read = 0;
  let readPhotos = 0;
  let readBytes = 0;
  while (e < t) {
    const m = msgs[e];
    const b = isPhoto(m) ? Number(bytesOf(m)) || 0 : 0;
    const p = b > 0 ? 1 : 0;
    if (e > start && (read + askThick(m) > pieceMax || readPhotos + p > PIECE_PHOTOS || readBytes + b > PIECE_BYTES)) break;
    read += askThick(m);
    readPhotos += p;
    readBytes += b;
    e++;
  }
  const restFrom = (i) => {
    let sum = 0;
    for (; i < t; i++) sum += thick(msgs[i]);
    return sum;
  };
  let crumbs = 0; // 没读到的那一截，叫他抄的时候多厚
  for (let i = e; i < t; i++) crumbs += askThick(msgs[i]);
  if (e < t && restFrom(e) < SLIVER && crumbs < SLIVER) {
    // 没读到的只剩一点零头：这一趟顺手带上，超出上限不到一千五百字，不要紧（一张照片就折一千五百字，零头里不会有照片）。
    // 留着它的话，屋子小的模型上它可能寄不出去，下一趟得单为这几句问一回
    read += crumbs;
    e = t;
  } else if (e < t) {
    // 没读到头：往前退到一轮的末尾。退不到就不退（哪怕把一轮劈开，也得往前走）；
    // 一退要退掉一大半的也不退（这一轮里她连着说了一长串）：不然这一趟只抄得了开头那几句
    let back = e;
    while (back > start && !edge(back)) back--;
    let less = 0;
    for (let i = back; i < e; i++) less += askThick(msgs[i]);
    if (back > start && back < e && read - less >= read / 2) {
      read -= less;
      e = back;
    }
  }
  // 还得不得接着抄：这一趟没读到的那一截够厚才记上（和上面“太薄不值当”是同一把尺子）。
  // 剩一点零头就不记了：记了也不会为它单跑一趟，反倒让下一段等不到攒够就抄
  const rest = restFrom(e);
  const last = msgs[e - 1];
  return { kind: "piece", from: start, to: e - 1, upto: last.id, ts: last.ts || 0, n: e, prev, more: rest >= thin, thick: read };
}

// 并哪几段：回 { old, rest }，old 是要并成一段的那几段（最早的 count 段），rest 是不动的
export function splitForMerge(prev, count) {
  const k = Math.max(2, Math.min(prev.parts.length, count));
  return { old: prev.parts.slice(0, k), rest: prev.parts.slice(k) };
}

// 抄回来的一段，接成新的一份提要。due 是 dueRecap 给的；text 是收拾好的正文（cleanRecap）；msgs 是那段对话
export function nextRecap(due, text, msgs, { id, at, model }) {
  if (due.kind === "merge") {
    const { old, rest } = splitForMerge(due.prev, due.count);
    const merged = { text, t0: old[0].t0 || 0, t1: old[old.length - 1].t1 || 0, rows: old.reduce((sum, p) => sum + (p.rows || 0), 0) };
    const { text: _whole, ...keep } = due.prev;
    return { ...keep, id, at, model, parts: [merged].concat(rest) };
  }
  const first = msgs[due.from];
  const part = { text, t0: (first && first.ts) || 0, t1: due.ts || 0, rows: due.to - due.from + 1 };
  return { id, upto: due.upto, parts: (due.prev ? due.prev.parts : []).concat([part]), more: !!due.more, at, ts: due.ts, n: due.n, model };
}

// ---------- 抄回来的字 ----------
// 把聊天用的记号清掉（叫他别写，他偶尔还是会顺手写上）；提要是夹在【前情提要】【提要结束】中间寄回去的，
// 正文里要是自己带着这几个方头括号的标题，换成圆括号，免得把后面的格式搅乱。
// 清完太短的不算抄出来了，回 ""。
// 这里的几条正则都是一趟认完的写法（不在一长串空白、一长串没有右括号的字上来回试，见开发说明里慢正则那几处）
export function cleanRecap(text) {
  let t = String(text || "").trimStart();
  // 开头顺手写的心里话：整块不要。只有开头没有结尾的，后面全是心里话，也不要。
  // 只认开头的：正文中间提到 <thinking> 这几个字的，原样留着
  if (t.startsWith("<thinking>")) {
    const close = t.indexOf("</thinking>");
    t = close < 0 ? "" : t.slice(close + "</thinking>".length);
  }
  t = t
    .split("[SPLIT]")
    .join("\n")
    .replace(/\[(MEME|AVATAR)[:：]\s*[^\]\s]{1,200}\s*\]/g, "")
    .replace(new RegExp(NAME_MARK, "gm"), "")
    .replace(/^[ \t]*\[(?:DOC|Doc|doc)[:：][^\[\]\n]*\][ \t]*$/gm, "")
    .replace(/^[ \t]*\[\/(?:DOC|Doc|doc)\][ \t]*$/gm, "")
    .replace(/【(前情提要|提要结束|开封府附注|附注结束[^】\n]{0,40}|此刻)】/g, "（$1）")
    .split(/\r\n|[\n\r\u2028\u2029]/)
    .map((line) => {
      const l = line.trimEnd();
      // 整行都是一对六角括号的：寄回去的时候、叫他接着抄的时候，顶格的六角括号是开封府自己写的说明（哪一段、几点到几点），
      // 正文里不能有长得一样的，换成圆括号
      return l.length > 1 && l[0] === "〔" && l[l.length - 1] === "〕" ? "（" + l.slice(1, -1) + "）" : l;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (t.length < PART_MIN) return "";
  if (t.length > PART_CLIP) t = clip(t, PART_CLIP).trimEnd() + "\n……（后面的太长，没留）";
  return t;
}

// ---------- 没抄成以后 ----------
// 没抄成（没网、那边太挤、写出来是空的、没写完、等太久）就照旧寄原话，不卡她说话。还试不试：
// 每试一回都要花钱，所以越不成隔得越久：头一回不成，隔十分钟；连着两回，隔一个钟头；再往后隔六个钟头。
// 隔够了也不是自己去试，要等他又回完一句（见 App.jsx 的 runRecaps）。
// bad 是那段对话上记的 { at, times, away }：上一回没成是几点、连着没成几回、上一回是不是她切走才断的；没记就是还没失过手。
// 这本账记在这台设备上（localStorage 的 RECAP_BAD_KEY，不跟云端走）：开封府被系统收掉重开是常事，
// 只记在手上的话，一重开账就清了，同一段抄不成的会每开一回试一回
export const RECAP_BAD_KEY = "kfs-recap-bad";
export const RETRY_WAITS = [10 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000];
const BAD_FORGET = 24 * 60 * 60 * 1000; // 一天没再试过的，账就不要了（下回从头算）
export function mayRetry(bad, now) {
  if (!bad || !(bad.times > 0)) return true;
  const wait = RETRY_WAITS[Math.min(bad.times, RETRY_WAITS.length) - 1];
  // 手机的钟被往回拨过（记的钟点比现在还晚）：不认那个钟点，试
  return now - bad.at >= wait || now < bad.at;
}
// 真没抄成的一回：记上，连着的回数加一
export function afterFail(bad, now) {
  return { at: now, times: ((bad && bad.times) || 0) + 1, away: 0 };
}
// 抄的工夫里她切走了、这一回断了：不是那边的毛病，头一回不算数（等他下回回完话再抄）。
// 可连着两回都这样断的，照没抄成记：她回回都是看一眼就走的话，回回白问一趟，不如隔一阵再试
export function afterAway(bad, now) {
  const times = (bad && bad.times) || 0;
  if (bad && bad.away > 0) return { at: now, times: times + 1, away: 0 };
  // 钟点：原来记着没抄成的，留着那个钟点（隔多久是从它算的）；没记过的记现在（这一笔过一天就不要了）
  return { at: times ? bad.at : now, times, away: 1 };
}
// 把记在设备上的那本账读出来：坏的不认，太老的不要
export function loadBad(text, now) {
  let raw = null;
  try {
    raw = JSON.parse(text || "null");
  } catch (e) {}
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const id of Object.keys(raw)) {
    const b = raw[id];
    if (!b || typeof b !== "object") continue;
    const at = Number(b.at) || 0;
    const times = Math.max(0, Math.floor(Number(b.times) || 0));
    const away = b.away > 0 ? 1 : 0;
    if (!times && !away) continue;
    if (now - at > BAD_FORGET || at > now) continue;
    out[id] = { at, times, away };
  }
  return out;
}

// 新抄的一份放进单子：抄到同一条的旧的那份换掉；单子太长，最早抄的先不要。
// 新的这一份无论如何留着（另一台设备的钟要是快，它的那几份排在后头，也不能把刚抄的挤掉）。
// 存进去的不带 text（那是读的时候现连的）
export function addRecap(list, rec) {
  const bare = ({ text, ...r }) => r;
  const rest = normRecaps(list)
    .filter((r) => r.upto !== rec.upto)
    .map(bare)
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-(RECAP_KEEP - 1));
  return rest.concat([bare(rec)]);
}
