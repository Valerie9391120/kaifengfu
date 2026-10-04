import { wrapDocForModel, missingDocNote } from "../docs.js";
import { MEME_MAP } from "../memes.js";

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

function dataUrlBlock(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

function memeLabel(m) {
  if (!m) return "一张表情包";
  const t = m.text && m.text !== "无" ? `，图上写着“${m.text}”` : "";
  return `${m.name}${t}`;
}

// ---------- 打包送信 ----------
// 对话窗口二十条一跳：跳之前这段前缀一直不变，名帖和历史都能命中缓存
function windowStart(n) {
  return n <= 40 ? 0 : Math.floor((n - 20) / 20) * 20;
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

export function buildMessages(msgs, avatars, memeLookup, imgLookup = () => null, thumbLookup = () => null, docLookup = () => null) {
  const win = msgs.slice(windowStart(msgs.length));
  const arr = [];
  win.forEach((m) => {
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
        const data = imgLookup(m.imgId);
        const blk = data ? dataUrlBlock(data) : null;
        const blocks = [];
        if (blk) blocks.push(blk);
        blocks.push({ type: "text", text: blk ? "[她发了一张照片]" : "[她之前发过一张照片]" });
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
        if (MEME_MAP[m.file]) {
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

  while (arr.length && arr[0].role === "assistant") arr.shift();

  const merged = [];
  arr.forEach((x) => {
    const last = merged[merged.length - 1];
    if (last && last.role === x.role) last.content = last.content.concat(x.content);
    else merged.push({ role: x.role, content: x.content.slice() });
  });

  if (merged.length) {
    const from = windowStart(msgs.length);
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
    note.push({ type: "text", text: "【附注结束，以下是对话】" });
    merged[0].content = note.concat(merged[0].content);

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
    const lastMsg = merged[merged.length - 1];
    if (tail.length && lastMsg.role === "user") lastMsg.content = lastMsg.content.concat(tail);
  }
  return merged;
}
