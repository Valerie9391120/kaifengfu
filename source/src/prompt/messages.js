import { wrapDocForModel, missingDocNote } from "../docs.js";
import { MEME_MAP } from "../memes.js";
import { tierOf, planWindow, staleImages, stamp } from "../recap.js";

function avatarBlock(av, thumbLookup = () => null) {
  if (!av) return null;
  if (av.type === "upload") {
    const m = /^data:([^;]+);base64,(.+)$/.exec(av.data || "");
    if (!m) return null;
    return {
      type: "image",
      source: { type: "base64", media_type: m[1], data: m[2] },
    };
  }
  if (av.type === "meme" && MEME_MAP[av.file]) {
    const mm = MEME_MAP[av.file];
    return {
      type: "image",
      source: { type: "base64", media_type: mm.mime, data: mm.b64 },
    };
  }
  if (av.type === "meme") {
    const t = thumbLookup(av.file);
    return t ? dataUrlBlock(t) : null;
  }
  return null;
}

export function dataUrlBlock(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

export function memeLabel(m) {
  if (!m) return "一张表情包";
  const t = m.text && m.text !== "无" ? `，图上写着“${m.text}”` : "";
  return `${m.name}${t}`;
}

// ---------- 打包送信 ----------
// 寄哪些：前面抄过提要的不再寄原话，提要放在第一条里；提要之后的原话照寄（见 ../recap.js 的 planWindow）。
// 没有提要、对话又不厚，就是从头全寄。两回抄提要之间，前面这一段一个字不变，名帖和历史都能命中缓存。
// 原来是只寄最后二三十条、二十条一跳，前面的不寄也不说：聊长了他会把这段对话当成新开的。

// 前面有没寄原话的：在开头的附注里写明。回要添进附注的那几块字（没有就是空的）。
// 写的都是定下来的数（第几条、几点），两回抄提要之间不变
function beforeNote(plan) {
  const out = [];
  const r = plan.recap;
  if (r) {
    const when = r.ts ? `，抄到 ${stamp(r.ts)} 为止` : "";
    out.push({
      type: "text",
      text: `【前情提要】这段对话聊得很长了，头 ${plan.at + 1} 条的原话没有再寄，换成了你自己一段一段抄的提要${when}：\n${r.text}\n【提要结束】`,
    });
    if (plan.gap) out.push({ type: "text", text: `【开封府附注】提要之后还有 ${plan.gap} 条这一回没有寄来，提要也还没抄到那儿，那一段说了什么你现在看不到。` });
    if (plan.over) out.push({ type: "text", text: `【开封府附注】下面的原话，开头 ${plan.over} 条是提要里已经抄过的，和提要的末尾重着。` });
  } else if (plan.gap) {
    out.push({
      type: "text",
      text: `【开封府附注】这段对话前面还有 ${plan.gap} 条，太长了这一回没有寄来，下面是最近的。这不是新开的对话。前面说过什么你现在看不到；她提起时照实说那一段没寄到，请她再讲一遍，别编。`,
    });
  }
  return out;
}

// ---------- 头像的来龙去脉 ----------
// 对话里换过头像时，开头的附注要写“这段对话开头时”的头像，不能写现在的。
// 不然那边的我先在开头看见新头像，后面又看见“刚换成这张”，会以为你一直用的就是它。
const UNKNOWN_AV = { type: "unknown" };

export function sameAv(a, b) {
  if (!a || !b) return !a && !b;
  if (a.type !== b.type) return false;
  return a.type === "upload" ? a.data === b.data : a.file === b.file;
}

// 卿卿换头像记成一行 event：av 是换上的，prev 是换之前的（旧记录没有 prev）
function herTrail(msgs, from, current) {
  const all = [];
  msgs.forEach((m, i) => {
    if (m.role === "event" && m.who === "her") all.push({ i, m });
  });
  const inWin = all.filter((x) => x.i >= from);
  if (!inWin.length) return { changed: false, start: current || null, last: current || null };
  const first = inWin[0];
  let start;
  if ("prev" in first.m) start = first.m.prev || null;
  else {
    // 旧记录：换之前那张就是上一次换上的；这段对话里头一回换的，就不知道了
    const before = all.filter((x) => x.i < first.i).pop();
    start = before ? before.m.av || null : UNKNOWN_AV;
  }
  return { changed: true, start, last: inWin[inWin.length - 1].m.av || null };
}

// 光义换头像写在他的回复里（items 里的 avatar）：file 是换上的，prev 是换之前的
function hisTrail(msgs, from, current) {
  const all = [];
  msgs.forEach((m, i) => {
    if (m.role === "him")
      (m.items || []).forEach((it) => {
        if (it.type === "avatar") all.push({ i, it });
      });
  });
  const inWin = all.filter((x) => x.i >= from);
  if (!inWin.length) return { changed: false, start: current || null, last: current || null };
  const first = inWin[0];
  let start;
  if ("prev" in first.it) start = first.it.prev || null;
  else {
    const before = all.filter((x) => x.i < first.i).pop();
    start = before ? { type: "meme", file: before.it.file } : UNKNOWN_AV;
  }
  return { changed: true, start, last: { type: "meme", file: inWin[inWin.length - 1].it.file } };
}

// 一张头像写成附注：有图带图；默认头像、图附不上、没记下来，各说各的
function avatarNote(av, lead, defaultText, unknownText, memeLookup, thumbLookup) {
  if (av === UNKNOWN_AV) return [{ type: "text", text: unknownText }];
  if (!av) return [{ type: "text", text: defaultText }];
  const img = avatarBlock(av, thumbLookup);
  if (img) return [{ type: "text", text: lead }, img];
  const name = av.type === "meme" ? (memeLookup(av.file) || {}).name || av.file : "";
  return [{ type: "text", text: name ? `${lead}「${name}」，这张图暂时附不上。` : `${lead}（这张图暂时附不上）` }];
}

// ctx：{ recaps, tier }。recaps 是这段对话抄过的提要（没有就不带）；tier 是“他记多长”那一档眼下的几个数（见 ../recap.js 的 tierOf）
// 回 { messages, tail }：messages 是寄的那一整段；tail 是要附在最后一句话后面的几块字（在别的对话里又换过头像的那句提示），
// 多半是空的。它不直接接在 messages 里：得放在缓存记号后面（见 system.js 的 withNowNote），
// 不然这一回记号落在它上头，下一回它又挪到新的最后一句后面去了，上一回写下的缓存就再也对不上
export function buildMessages(msgs, avatars, memeLookup, imgLookup = () => null, thumbLookup = () => null, docLookup = () => null, ctx = {}) {
  const plan = planWindow(msgs, ctx.recaps || [], ctx.tier || tierOf());
  const from = plan.from;
  // 她发的图太多的时候，老的那几张不带图，只留那一句话（见 ../recap.js 的 staleImages）
  const memeData = (file) => (MEME_MAP[file] ? MEME_MAP[file].b64 : thumbLookup(file) || "");
  const stale = staleImages(msgs, from, (m) => ((m.kind === "photo" ? imgLookup(m.imgId) : memeData(m.file)) || "").length);
  const arr = [];
  msgs.forEach((m, at) => {
    if (at < from) return;
    const noImg = stale.has(at);
    // 她在聊天中途换了头像：变成对话里真实发生的一件事，图跟着这一行寄过去
    if (m.role === "event") {
      const img = avatarBlock(m.av, thumbLookup);
      const blocks = [
        {
          type: "text",
          text: img
            ? "[开封府提示：卿卿刚刚把头像换成了这张]"
            : "[开封府提示：卿卿刚刚把头像换回了默认的“卿”字]",
        },
      ];
      if (img) blocks.push(img);
      arr.push({ role: "user", content: blocks });
      return;
    }
    if (m.role === "her") {
      if (m.kind === "photo") {
        const data = noImg ? null : imgLookup(m.imgId);
        const blk = data ? dataUrlBlock(data) : null;
        const blocks = [];
        if (blk) blocks.push(blk);
        // 图没带上的两种：存档里取不到（别的设备还没同步来），和老的图这一回不带了（noImg）。后一种写明，免得他当成她没发过
        blocks.push({ type: "text", text: blk ? "[她发了一张照片]" : noImg ? "[她之前发过一张照片，图这一回没带上]" : "[她之前发过一张照片]" });
        arr.push({ role: "user", content: blocks });
        return;
      }
      if (m.kind === "doc") {
        // 文档：全文夹在〔文档开始〕〔文档结束〕之间寄过去；全文没取到（别的设备还没同步来）就只留一句
        const text = docLookup(m.docId);
        arr.push({
          role: "user",
          content: [{ type: "text", text: text ? wrapDocForModel({ name: m.name || "文档", fmt: m.fmt, text, images: m.images }) : missingDocNote(m.name || "文档") }],
        });
        return;
      }
      if (m.kind === "voice") {
        arr.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `[她发了一条${m.dur || 1}秒的语音，转成文字是：${m.text || "（没听清）"}]`,
            },
          ],
        });
        return;
      }
      if (m.kind === "meme") {
        const meme = memeLookup(m.file);
        const blocks = [];
        if (noImg) {
          // 图不带了，下面那一句照写
        } else if (MEME_MAP[m.file]) {
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: MEME_MAP[m.file].mime, data: MEME_MAP[m.file].b64 },
          });
        } else if (thumbLookup(m.file)) {
          blocks.push(dataUrlBlock(thumbLookup(m.file)));
        }
        blocks.push({
          type: "text",
          text: `[她发了一张表情包：${memeLabel(meme)}]`,
        });
        arr.push({ role: "user", content: blocks });
        return;
      }
      arr.push({
        role: "user",
        content: [{ type: "text", text: m.text || "……" }],
      });
      return;
    }
    arr.push({
      role: "assistant",
      content: [
        { type: "text", text: m.raw && m.raw.trim() ? m.raw.trim() : "……" },
      ],
    });
    // 光义自己换了头像：下一轮让他亲眼看到新头像的样子
    const av = (m.items || []).filter((it) => it.type === "avatar").pop();
    if (av) {
      const img = avatarBlock({ type: "meme", file: av.file }, thumbLookup);
      const blocks = [
        {
          type: "text",
          text: `[开封府提示：你的新头像换好了，是「${
            (memeLookup(av.file) || {}).name || av.file
          }」${img ? "，长这样" : ""}]`,
        },
      ];
      if (img) blocks.push(img);
      arr.push({ role: "user", content: blocks });
    }
  });

  // 寄的头一条要是他的话（硬切正好切在他那一条上）：留着，开头的附注自己单占一条排在它前面。
  // 原来是把它扔掉；现在切口上写着前面还有几条，那个数得对得上
  const lead = arr.length && arr[0].role === "assistant";

  const merged = [];
  arr.forEach((x) => {
    const last = merged[merged.length - 1];
    if (last && last.role === x.role) last.content = last.content.concat(x.content);
    else merged.push({ role: x.role, content: x.content.slice() });
  });

  if (merged.length) {
    const ht = herTrail(msgs, from, avatars.her);
    const mt = hisTrail(msgs, from, avatars.him);
    // 开头写的是这段对话开头时的头像（没换过就是现在这张）。说法不带“现在”，
    // 中途换头像时这一段一个字都不变，前面的缓存照样命中
    const note = [
      ...avatarNote(
        ht.start,
        "【开封府附注】卿卿的头像：",
        "【开封府附注】卿卿用的是默认的“卿”字头像。",
        "【开封府附注】卿卿这段对话开头用的什么头像没记下来。",
        memeLookup,
        thumbLookup
      ),
      ...avatarNote(
        mt.start,
        "你自己选的头像：",
        "你用的是默认的“炅”字头像。",
        "你这段对话开头用的什么头像没记下来。",
        memeLookup,
        thumbLookup
      ),
      { type: "text", text: "对话中途换了头像的话，换的地方会有开封府提示，以最新的一次为准。" },
    ];
    note.push(...beforeNote(plan));
    note.push({ type: "text", text: "【附注结束，以下是对话】" });
    if (lead) merged.unshift({ role: "user", content: note });
    else merged[0].content = note.concat(merged[0].content);

    // 在别的对话里又换过：这段对话里最后换上的不是现在这张，末尾补一句
    const tail = [];
    if (ht.changed && !sameAv(ht.last, avatars.her || null)) {
      tail.push(
        ...avatarNote(
          avatars.her || null,
          "[开封府提示：卿卿后来又换了头像，现在是这张]",
          "[开封府提示：卿卿后来又换回了默认的“卿”字头像]",
          "",
          memeLookup,
          thumbLookup
        )
      );
    }
    if (mt.changed && !sameAv(mt.last, avatars.him || null)) {
      tail.push(
        ...avatarNote(
          avatars.him || null,
          "[开封府提示：你的头像后来又换过，现在是这张]",
          "[开封府提示：你的头像后来换回了默认的“炅”字]",
          "",
          memeLookup,
          thumbLookup
        )
      );
    }
    return { messages: merged, tail };
  }
  return { messages: merged, tail: [] };
}
