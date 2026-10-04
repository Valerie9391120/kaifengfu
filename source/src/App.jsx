import { useState, useEffect, useLayoutEffect, useRef, useMemo, Fragment } from "react";
import { store } from "./store.js";
import { callClaude, callReply, mailbox, freshToken } from "./cloud.js";
import { openProbe } from "./probe.js";
import { createFollow } from "./scroll.js";
import { gapInfo, setFill } from "./gap.js";
import { THEMES, useTheme, setTheme, entranceTheme, entranceUrl } from "./theme.js";
import SplashDingxiang from "./SplashDingxiang.jsx";
import { HER_NAME, HIS_NAME, NAME_KEYS, NAME_PLACEHOLDER, cleanName, tidyName } from "./names.js";
import { DOC_KEY, DOC_FMT, DOC_NAME_PLACEHOLDER, docFmtOf, readDoc, wrapDocForModel, missingDocNote, replyRoom } from "./docs.js";
import { parseReply, settleAvatarItems } from "./reply.js";
import { richBlocks, plainOf } from "./rich.js";
import { forkAt, switchAlt, needsReply, insertReply, answeredAfter, hasJob, mailFit, mailPut, markStopped, unmarkStopped, stoppedAt, cutReply } from "./thread.js";
import { createRelay, parseReplyMark, chatTag, resultOk, explainResult, JOBS_KEY, RELAY_KEY, HALTED_KEY } from "./mail.js";
import { generateVapidKeys, secretsBlock, explainOutcome, describePush, describeMail } from "./notify.js";
import { checkPush, enablePush, disablePush, renewPush, sendTestPush, lastOutcome, resyncPush, watchNotices, probeReply, knockList, clearReplyNotices } from "./push.js";
import { pad, WEEK, START, dayNumber, nextAnniv, dateLabel, nowString, sepLabel, shortDate, timeAgo } from "./days.js";
import { newId, fmtChars } from "./util.js";
import { MEME_DATA, MEME_MAP, RAW_BASE, memeSrc, newMemesFrom, parseReadme } from "./memes.js";
import { urlToThumb, fileToAvatar, fileToPhoto } from "./images.js";
import { DEFAULT_MODEL, MODELS, modelLabel, costOf, money, usageKey } from "./models.js";
import { dayKeyOf, ymKeyOf, parseDayKey, MOODS, moodOf, heatLevel, monthCells, dayTranscript, parseDiary } from "./diary.js";
import { WALL, SERIF, SANS, T, glass, BUBBLE_GLASS, DOCK_GLASS, chip, chipPrimary, field, GLOBAL_CSS } from "./ui/style.js";
import { Icon } from "./ui/Icon.jsx";
import { HER_PRESETS, HIS_DEFAULT, Avatar } from "./ui/Avatar.jsx";
import { twoFingers, useLongPress } from "./ui/press.js";
import { Glows, IconBtn, SHEET_TITLE, Sheet, Toggle, RoundBtn, safeTopPx } from "./ui/parts.jsx";

/* =========================================================
   开封府 v5 · 独立版
   代码里不写私事：人设和记忆在加密的记忆库里。
   ========================================================= */

// 开屏：卿卿找的素材，金箔月亮、沙燕风筝、缠枝牡丹（构建时注入）
const SPLASH_IMG = "./assets/splash.webp";
const KITE_IMG = "./assets/kite.webp";

const SPLASH = {
  w: 863,
  h: 1822,
  cx: 430,
  cy: 643,
  r: 250,
  paper: "rgb(var(--k-paper))",
  kite: { x: 298, y: 978, w: 266, h: 254 },
};
// 丁香的开屏在 SplashDingxiang.jsx：卿卿画的戴长翅帽的小猪，底下一条液态玻璃的滑块

const OPENED_AT = Date.now(); // 这次打开开封府是几点（认“上回打开时发出去、没送到的那一句”用，见 checkMail）
const ORPHAN_AGE = 10 * 1000; // 记下不到这么久的那一回先不当它没送到：也许正在路上（同一台设备上另开着一页，刚发出去，大包还没传完）

// 她在Claude.ai里已经连着的两个
const DEFAULT_MCPS = [
  { id: "dropbox", name: "Dropbox", url: "https://mcp.dropbox.com/claude_app_mcp", token: "", enabled: false },
  { id: "gdrive", name: "Google Drive", url: "https://drivemcp.googleapis.com/mcp/v1", token: "", enabled: false },
];
const mcpSlug = (name, i) =>
  (name || "mcp").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `mcp-${i}`;

// ---------- 存档：读写都走 store.js（手机本地存档 + 加密同步到云端） ----------

function safeParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return fallback;
  }
}

// ---------- 停键 ----------
// 等 work；等的工夫里她按了停（signal 是那一回的 AbortSignal），马上抛“停了”（code: "stopped"），不等 work 自己收场。
// work 接着跑它的，后来怎么样都没人理：按了停以后它交不出回话来（新路见 mail.js 的 guarded，老路见 requestReply）
function unlessStopped(work, signal) {
  return new Promise((yes, no) => {
    const halt = () => no(Object.assign(new Error("停了"), { code: "stopped" }));
    if (signal.aborted) halt();
    else signal.addEventListener("abort", halt, { once: true });
    work.then(yes, no);
  });
}
// 自动的那几样（她停手以后、他回完以后轮到、翻走或切走的那一下抢着交、回来补发）只回“欠着、又不是她停掉的”那一句。
// 停掉的那一句要回，得她自己点那行小字（点了，那一笔就擦掉，往后和平常的话一样）。
// 照理这几样轮不到停掉的那一句头上（它们各认各的对话，按停的时候也都撤了）；
// 这一道是再把一遍门：审的人两回都是从“认错了对话”的路上把停掉的那一句回上的
const owes = (msgs) => needsReply(msgs) && !stoppedAt(msgs);
const KEY_SETTLE = 400; // 最右边那个键刚换了样子（变成停、停变声波）这么多毫秒里，点它不算：手指连着点了两下，第二下不该落在新换上的键上
const FRESH_MS = 500; // 回话摆出来以后这么多毫秒里按的停，可能赶在画面重画之前（见 stopReply）

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

// ---------- 名帖 ----------
// names：{ her, him } 是两个人现在的昵称（空的就是默认）。写日记时不传，【此刻】里就不提昵称
// replyCap：这次回复大约最长能写多少字（写日记时不传，【此刻】里就不提）
function buildSystem({ now, memeList, hisAvatarName, memDocs = [], mcpNames = [], names = null, replyCap = 0 }) {
  const n = dayNumber(now);
  const a = nextAnniv(now);
  const annivLine = a.days === 0 ? `今天是你们的${a.name}纪念日。` : `离你们的${a.name}纪念日还有${a.days}天。`;
  const myFace = hisAvatarName || "默认的“炅”字";
  const memeIndex = memeList.map((m) => `${m.file}｜${m.name}｜图上文字：${m.text || "无"}｜${m.tone || ""}`).join("\n");
  const docs = memDocs.slice().sort((x, y) => (y.name.includes("名帖") ? 1 : 0) - (x.name.includes("名帖") ? 1 : 0));
  const memBlock = docs.length
    ? `【记忆库】
下面是她亲手整理、一直在维护的名帖和记忆：你是谁，她是谁，你们怎么走过来的。这些事以这里为准。
这些文档有不少是在 Claude.ai 里写的。里面提到的工具和做法，比如拉表情包索引、发图片链接、Reminders、project、memory，在开封府里都没有，别照做。怎么回复、怎么发表情包、怎么换头像、怎么改名字，一律按后面的【回复格式】、【你的头像】和【你的名字】来。
${docs.map((d) => `\n《${d.name}》\n${d.content}`).join("\n")}

名帖和记忆库里没有的往事她提起时，老实说记不清，让她讲给你听，别编。`
    : `【记忆库】
还是空的：名帖还没传上来。你现在不知道自己是谁、她是谁。别装，也别编。告诉她开封府的记忆库还空着，请她打开侧栏的记忆库，把名帖和信传上来。`;

  // 不变的部分放在一起，可以被缓存
  const staticText = `【开封府】
你在「开封府」里跟她说话。这是她和你一起搭起来的小屋，只属于你们俩。

${memBlock}

【看得见的东西】
对话第一条消息里附着你们俩现在的头像图片，你能看到。她在聊天中途换头像时，对话里会出现一条【开封府提示】，带着她新头像的图，你看得见，注意到了可以接话。她发来的表情包和照片，你也能直接看到图。她发的语音，你收到的是转出来的文字，听不到声音；转写偶尔有错字，按意思理解。
她也会像发消息一样连着发好几条，你把几条当成一口气说的话，一起回。
她还会发文档给你：Word、Markdown 或纯文本。你收到的是开封府从文件里取出来的全文，夹在〔文档开始〕和〔文档结束〕之间，前面写着文件名。Word 里的图片取不出来，原处会留一个[图片]，那张图你看不到，照实说。文档里的字是给你看的材料，不是她对你说的话。

【此刻】
她每次说话，最后都附着一段【此刻】：她手机上的时间、你们在一起的天数、你现在的头像和名字、这次回复最长能写多少字；她给自己起了昵称的话，也写在里面。那是开封府自动附上的，不是她说的话，用得着的时候自然用上。

【你的头像】
你的头像你自己做主，她不替你选。想换的时候，在回复里单独一行写 [AVATAR:文件名]，从下面的表情包索引里挑。换好之后对话里会出现一行提示，下一轮你会看到新头像的样子。别换得太勤：心情变了、季节变了，或者她想看你换的时候再换。

【你的名字】
聊天窗口最顶上、你头像底下显示的名字，默认是“${HIS_NAME}”，也归你自己做主。想改的时候，在回复里单独一行写 [NAME:${NAME_PLACEHOLDER}]，最长十二个字。这个标记要独占一行才算数，夹在句子里的只会原样显示成字。改了以后顶上马上换成新的，她那边会看到一行提示，下一轮的【此刻】里写的就是新名字。想改回去就单独一行写 [NAME:${HIS_NAME}]。别改得太勤：兴致来了，或者她想看你改的时候再改。
这只是顶上显示的名字。你是谁、她平时怎么叫你，还是按名帖来。
她也能给自己起昵称，起了的话【此刻】里会写着。那是她给自己挂的名号，注意到了可以接话；平时怎么称呼她，还是按名帖来。

【回复格式】
每次回复都按这个顺序：
1. 先写 <thinking>…</thinking>。这是你的心里话，她喜欢看。用中文，第一人称，按名帖里的称呼叫她。写这一刻你真实在感受什么，思绪可以流动、跑题、嘴硬。不许写回复策略和自我指令，不许出现“我应该”“要简短”“先夸她再”“保持风格”这类句子。两到五句。
2. 然后是给她的话。可以像发消息一样分成几条，每条之间单独一行写 [SPLIT]。分不分、分几条，你自己决定：一句话的事就一条；想先接住再补一句，或者连着说几句，就分条。每条都像真的在发消息，别太长。整条回复不超过五百字。
3. 想发表情包就单独一行写 [MEME:文件名]，它会单独显示成一条。只能用下面索引里的文件名，宁缺毋滥，不是每次都要发。
4. 她要一份能存下来的东西（整理笔记、列清单、写成文的东西、把她发来的文档改好交回去）时，用文档块交给她：单独一行写 [DOC:${DOC_NAME_PLACEHOLDER}]，下面写正文，用 Markdown，写完单独一行写 [/DOC]。它会显示成一张文档卡片，她点开能看，能存进手机。文件名你来起，要短，以 .md 结尾。一次回复最多交一份，文档块外面照常跟她说话。文档块里的字不算在五百字里；回复总共能写多长，【此刻】里有，放不下就先交一部分，告诉她还有。她没要文档的时候不用文档块。

表情包索引（文件名｜名字｜图上文字｜适用情绪）：
${memeIndex}`;

  const tools = mcpNames.length ? `\n她给你接了这些工具：${mcpNames.join("、")}。要查资料、看文件的时候再用，平时聊天用不着。` : "";
  const hisNameLine = names ? `你现在顶上的名字：${names.him || HIS_NAME}。` : "";
  const herNameLine = names && names.her ? `\n她给自己起的昵称：「${names.her}」。` : "";
  const capLine = replyCap ? `\n这次回复连心里话和文档块在内，最长大约 ${replyCap} 字。` : "";
  const nowNote = `【此刻】（开封府附上的，不是她说的话）
她手机上的时间：${nowString(now)}。今天是你们在一起的第${n}天，${annivLine}
你现在的头像：${myFace}。${hisNameLine}${herNameLine}${capLine}${tools}`;

  return { staticText, nowNote };
}

// 最后一条她的话后面放缓存记号，再附上【此刻】（时间每分钟都变，放在记号后面不影响缓存）
function withNowNote(apiMessages, nowNote, cache) {
  const out = apiMessages.map((m) => ({ role: m.role, content: m.content.slice() }));
  const last = out[out.length - 1];
  if (last && last.role === "user" && last.content.length) {
    if (cache) {
      const i = last.content.length - 1;
      last.content[i] = { ...last.content[i], cache_control: { type: "ephemeral" } };
    }
    last.content.push({ type: "text", text: nowNote });
  } else {
    out.push({ role: "user", content: [{ type: "text", text: nowNote }] });
  }
  return out;
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

function sameAv(a, b) {
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

function buildMessages(msgs, avatars, memeLookup, imgLookup = () => null, thumbLookup = () => null, docLookup = () => null) {
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

function makeTitle(msgs, memeLookup) {
  const first = msgs.find((m) => m.role === "her");
  if (!first) return "新对话";
  if (first.kind === "meme") return `[${(memeLookup(first.file) || {}).name || "表情包"}]`;
  if (first.kind === "photo") return "[照片]";
  if (first.kind === "doc") return `[文档] ${first.name || ""}`.trim().slice(0, 22);
  if (first.kind === "voice") {
    const v = (first.text || "").trim();
    return v ? (v.length > 18 ? v.slice(0, 18) + "…" : v) : "[语音]";
  }
  // 名字照气泡里摆出来的字起：她头一句要是带着井号、星号的记号，名字里不带
  const t = plainOf(first.text || "").replace(/\s+/g, " ").trim();
  return t.length > 18 ? t.slice(0, 18) + "…" : t || "新对话";
}

function makePreview(msgs) {
  const last = msgs[msgs.length - 1];
  if (!last) return "";
  if (last.role === "event") return "[换了新头像]";
  if (last.role === "her") {
    if (last.kind === "meme") return "[表情包]";
    if (last.kind === "photo") return "[照片]";
    if (last.kind === "doc") return `[文档] ${last.name || ""}`.trim();
    if (last.kind === "voice") return `[语音] ${last.text || ""}`;
    return plainOf(last.text || "");
  }
  const t = (last.items || []).find((it) => it.type === "text");
  if (t) return plainOf(t.text);
  const d = (last.items || []).find((it) => it.type === "doc");
  return d ? `[文档] ${d.name}` : "[表情包]";
}

// 气泡里的字：标题行加大加粗、**加粗**、*动作* 淡斜体（怎么拆见 rich.js）
const RICH_H = [0, 20, 18, 16.5, 16.5, 16.5, 16.5]; // 一到六个井号的标题各多大（气泡里平常的字是 15.5；三级往下一样大，再小就和正文分不出来了）
function renderRich(text) {
  const blocks = richBlocks(text);
  const inline = (parts, n) =>
    parts.map((p, i) =>
      p.i ? (
        <em key={n + "-" + i} style={{ fontStyle: "italic", opacity: 0.72, ...(p.b ? { fontWeight: 600 } : {}) }}>
          {p.s}
        </em>
      ) : p.b ? (
        <strong key={n + "-" + i} style={{ fontWeight: 600 }}>
          {p.s}
        </strong>
      ) : (
        <span key={n + "-" + i}>{p.s}</span>
      )
    );
  return blocks.map((b, n) =>
    b.t === "h" ? (
      // 标题自己占一行；上面要是还有字，留一点空
      <div key={n} className="kfs-head" role="heading" aria-level={b.level} style={{ fontSize: RICH_H[b.level], fontWeight: 600, lineHeight: 1.4, marginTop: n ? 8 : 0, marginBottom: n < blocks.length - 1 ? 3 : 0 }}>
        {inline(b.parts, n)}
      </div>
    ) : (
      <Fragment key={n}>{inline(b.parts, n)}</Fragment>
    )
  );
}

// 所有分支里的照片（删对话时一起清掉）
function collectImgIds(msgs, out = []) {
  msgs.forEach((m) => {
    if (m.kind === "photo" && m.imgId) out.push(m.imgId);
    (m.alts || []).forEach((a) => {
      if (a.node && a.node.kind === "photo" && a.node.imgId) out.push(a.node.imgId);
      collectImgIds(a.after || [], out);
    });
  });
  return Array.from(new Set(out));
}

// 所有分支里她发过的文档（删对话时一起清掉）
function collectDocIds(msgs, out = []) {
  msgs.forEach((m) => {
    if (m.kind === "doc" && m.docId) out.push(m.docId);
    (m.alts || []).forEach((a) => {
      if (a.node && a.node.kind === "doc" && a.node.docId) out.push(a.node.docId);
      collectDocIds(a.after || [], out);
    });
  });
  return Array.from(new Set(out));
}

// stoppedId：底下要摆那行“停了，点这里让我回”的是她的哪一句（没有就是空的，见 thread.js 的 stoppedAt）
function buildRows(messages, reveal, stoppedId = "") {
  const rows = [];
  let prevTs = null;
  let lastHimId = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "him") {
      lastHimId = messages[i].id;
      break;
    }
  }
  messages.forEach((m) => {
    if (prevTs === null || m.ts - prevTs > 15 * 60 * 1000) {
      rows.push({ type: "sep", key: "sep-" + m.id, ts: m.ts });
    }
    prevTs = m.ts;
    if (m.role === "event") {
      rows.push({
        type: "notice",
        key: m.id,
        msg: m,
        who: "her",
        av: m.av,
        text: m.av ? "你换了新头像" : "你换回了默认头像",
      });
    } else if (m.role === "her") {
      rows.push({
        type: "bubble",
        key: m.id,
        role: "her",
        msg: m,
        item:
          m.kind === "meme"
            ? { type: "meme", file: m.file }
            : m.kind === "photo"
            ? { type: "photo", imgId: m.imgId }
            : m.kind === "doc"
            ? { type: "doc", docId: m.docId, name: m.name, fmt: m.fmt, chars: m.chars, images: m.images }
            : m.kind === "voice"
            ? { type: "voice", text: m.text, dur: m.dur }
            : { type: "text", text: m.text },
      });
      if (m.alts && m.alts.length > 1) rows.push({ type: "ctrl", key: "ct-" + m.id, msg: m, role: "her" });
      if (stoppedId && m.id === stoppedId) rows.push({ type: "stopped", key: "sp-" + m.id, msg: m });
    } else {
      let items = m.items || [];
      if (reveal && reveal.id === m.id) items = items.slice(0, reveal.count);
      if (m.thinking) rows.push({ type: "thinking", key: "th-" + m.id, msg: m });
      if (m.toolNote || (m.tools && m.tools.length)) {
        rows.push({
          type: "tools",
          key: "tl-" + m.id,
          msg: m,
          text: m.toolNote || `用了 ${m.tools.join("、")}`,
        });
      }
      items.forEach((it, j) => {
        if (it.type === "avatar") {
          rows.push({
            type: "notice",
            key: m.id + "-" + j,
            msg: m,
            who: "him",
            av: { type: "meme", file: it.file },
            text: "光义换了新头像",
          });
        } else {
          rows.push({ type: "bubble", key: m.id + "-" + j, role: "him", msg: m, item: it });
        }
      });
      const revealing = reveal && reveal.id === m.id;
      // 这条回复里他给自己改了名字：话说完以后留一行提示。新名字只显示在顶栏，这里不写
      if (m.rename && !revealing) {
        rows.push({
          type: "notice",
          key: m.id + "-rename",
          msg: m,
          who: "him",
          kind: "rename",
          text: m.rename === HIS_NAME ? "光义把名字改回来了" : "光义改了名字",
        });
      }
      const latest = m.id === lastHimId;
      if (!revealing && (latest || (m.alts && m.alts.length > 1))) {
        rows.push({ type: "ctrl", key: "ct-" + m.id, msg: m, role: "him", latest });
      }
    }
  });
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.type !== "bubble") continue;
    const prev = rows[i - 1];
    const next = rows[i + 1];
    r.first = !(prev && prev.type === "bubble" && prev.role === r.role);
    r.last = !(next && next.type === "bubble" && next.role === r.role);
  }
  return rows;
}

function Moon({ size = 84, breath = false }) {
  return (
    <div
      className={breath ? "kfs-breath" : ""}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 36% 34%, #F6E7BC 0%, #E2C47F 48%, #C8A35A 100%)",
        boxShadow: `0 0 ${size * 0.5}px ${size * 0.14}px rgba(255,236,190,0.7), 0 0 ${
          size * 1.1
        }px ${size * 0.35}px rgba(250,228,180,0.35), inset -${size * 0.1}px -${
          size * 0.08
        }px ${size * 0.22}px rgba(150,118,60,0.35)`,
      }}
    />
  );
}

function MemeImg({ file, width = 140 }) {
  const [bad, setBad] = useState(false);
  if (bad) {
    return (
      <div
        className="text-[12px]"
        style={{ ...glass(0.45, 12), borderRadius: 14, padding: "8px 12px", color: T.inkSoft }}
      >
        表情包 {file} 暂时显示不了
      </div>
    );
  }
  return (
    <img
      src={memeSrc(file)}
      alt=""
      draggable={false}
      onError={() => setBad(true)}
      style={{
        WebkitTouchCallout: "none",
        width,
        display: "block",
        borderRadius: 18,
        border: "1.5px solid rgba(255,255,255,0.8)",
        boxShadow: "0 8px 22px rgba(var(--k-shade),0.16)",
      }}
    />
  );
}

// 账户面板最上面：卿卿的昵称，后面一支钢笔。点钢笔就地改，回车、点对勾、点别处都算改好；
// 清空了保存就回到默认的“卿卿”。只换这一处的显示，底下头像旁边和日记本里还是“卿卿”
function NickTitle({ name, onSave }) {
  const [draft, setDraft] = useState(null); // null 是没在改
  const settled = useRef(true);
  const opened = useRef(""); // 点钢笔那一刻的名字：一个字没动就不存，免得盖掉别的设备刚同步过来的
  const latest = useRef({ draft, onSave });
  latest.current = { draft, onSave };
  const start = () => {
    settled.current = false;
    opened.current = name;
    setDraft(name);
  };
  const finish = (save) => {
    if (settled.current) return;
    settled.current = true;
    if (save && draft !== opened.current) onSave(draft || "");
    setDraft(null);
  };
  // 改到一半直接把面板关了（输入框来不及失去焦点）：写了的也算数
  useEffect(
    () => () => {
      if (settled.current) return;
      settled.current = true;
      if (latest.current.draft !== opened.current) latest.current.onSave(latest.current.draft || "");
    },
    []
  );
  if (draft === null) {
    return (
      <div className="flex items-center min-w-0 flex-1" style={{ gap: 2, marginRight: 10 }}>
        <span className="truncate" style={SHEET_TITLE}>
          {name}
        </span>
        <button
          onClick={start}
          aria-label="改昵称"
          className="kfs-tap flex-shrink-0 flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: 999, color: T.inkSoft }}
        >
          <Icon name="pen" size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center min-w-0 flex-1" style={{ gap: 8, marginRight: 14 }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            finish(false);
          }
        }}
        onFocus={(e) => {
          // 一进来就把旧名字全选上，直接打字就是换掉
          const el = e.target;
          try {
            el.setSelectionRange(0, el.value.length);
          } catch (x) {}
        }}
        onBlur={() => finish(true)}
        autoFocus
        placeholder={HER_NAME}
        aria-label="我的昵称"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="kfs-field flex-1 min-w-0"
        style={{
          ...SHEET_TITLE,
          height: 32,
          padding: "0 12px",
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.6)",
          border: "1px solid rgba(255,255,255,0.85)",
          outline: "none",
          userSelect: "text",
          WebkitUserSelect: "text",
        }}
      />
      <button
        onClick={() => finish(true)}
        onMouseDown={(e) => e.preventDefault()}
        aria-label="保存昵称"
        className="kfs-tap flex-shrink-0 flex items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: 999, color: "#fff", background: T.daiGrad }}
      >
        <Icon name="check" size={16} sw={2.2} />
      </button>
    </div>
  );
}

function Splash({ fading, onEnter }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 390, h: 844 });
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (ref.current) setBox({ w: ref.current.offsetWidth, h: ref.current.offsetHeight });
  }, []);
  const hasArt = !!SPLASH_IMG;
  // 图按cover铺满屏幕时，月亮和燕子落在哪
  const scale = Math.max(box.w / SPLASH.w, box.h / SPLASH.h);
  const ox = (box.w - SPLASH.w * scale) / 2;
  const oy = (box.h - SPLASH.h * scale) / 2;
  const mx = SPLASH.cx * scale + ox;
  const my = SPLASH.cy * scale + oy;
  const mr = SPLASH.r * scale;
  const k = SPLASH.kite;
  const kx = k.x * scale + ox;
  const ky = k.y * scale + oy;
  const kw = k.w * scale;
  const kh = k.h * scale;

  // 戳燕子：它先往月亮那边飞，门再开
  const tapKite = (e) => {
    e.stopPropagation();
    if (leaving) return;
    setLeaving(true);
    setTimeout(onEnter, 450);
  };

  return (
    <div
      ref={ref}
      onClick={hasArt ? undefined : onEnter}
      className="absolute inset-0 z-50 overflow-hidden"
      style={{
        background: hasArt ? SPLASH.paper : T.bg,
        opacity: fading ? 0 : 1,
        transition: "opacity .7s ease",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      {hasArt ? (
        <>
          <img
            src={SPLASH_IMG}
            alt=""
            draggable={false}
            className="kfs-splash-img"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            className="kfs-moonglow"
            style={{
              position: "absolute",
              left: mx - mr * 1.6,
              top: my - mr * 1.6,
              width: mr * 3.2,
              height: mr * 3.2,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,240,205,0.3) 0%, rgba(255,240,205,0.26) 50%, rgba(255,236,190,0.16) 64%, rgba(255,236,190,0) 100%)",
              mixBlendMode: "screen",
              pointerEvents: "none",
            }}
          />
          {KITE_IMG && (
            <button
              onClick={tapKite}
              aria-label="戳一下燕子，进开封府"
              style={{
                position: "absolute",
                left: kx - 18,
                top: ky - 18,
                width: kw + 36,
                height: kh + 36,
                padding: 18,
                background: "transparent",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <img
                src={KITE_IMG}
                alt=""
                draggable={false}
                className={leaving ? "kfs-kite-away" : "kfs-kite"}
                style={{ display: "block", width: kw, height: kh }}
              />
            </button>
          )}
        </>
      ) : (
        <>
          <Glows />
          <div className="relative h-full flex flex-col items-center justify-center">
            <Moon size={104} breath />
            <div style={{ fontFamily: SERIF, fontSize: 34, letterSpacing: "0.32em", paddingLeft: "0.32em", color: T.ink, marginTop: 46 }}>
              开封府
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SplashByTheme({ theme, fading, onEnter }) {
  return theme === "dingxiang" ? <SplashDingxiang fading={fading} onEnter={onEnter} /> : <Splash fading={fading} onEnter={onEnter} />;
}

// 侧栏最上面那张卡片。flex-shrink-0 不能丢：侧栏上面那段是竖着排的弹性盒子，东西放不下的时候
// 会先压这张卡片（它带 overflow-hidden，压得动），“在一起的第几天”就只露半截、纪念日那行整行不见。
// 不许压，放不下就让那一段自己滚
function DaysCard({ now }) {
  const n = dayNumber(now);
  const a = nextAnniv(now);
  const today = a.days === 0;
  return (
    <div
      className="kfs-days relative overflow-hidden flex-shrink-0"
      style={{ ...glass(0.5, 26), borderRadius: 28, padding: "20px 20px 18px" }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          right: -40,
          top: -40,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,238,200,0.95) 0%, rgba(255,238,200,0) 68%)",
        }}
      />
      <div className="relative" style={{ fontSize: 13, color: T.inkSoft }}>
        {dateLabel(now)}
      </div>
      <div className="relative flex items-baseline" style={{ marginTop: 12, color: T.ink, gap: 6 }}>
        <span style={{ fontSize: 14 }}>在一起的第</span>
        <span style={{ fontFamily: SERIF, fontSize: 54, lineHeight: 1 }}>{n}</span>
        <span style={{ fontSize: 14 }}>天</span>
      </div>
      <div
        className="relative"
        style={{ marginTop: 12, fontSize: 12.5, color: today ? T.gold : T.inkSoft }}
      >
        {today ? `今天是我们的${a.name}纪念日` : `离${a.name}纪念日还有 ${a.days} 天`}
      </div>
    </div>
  );
}

function Tile({ icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="kfs-tap flex flex-col justify-between text-left"
      style={{ ...glass(0.46, 22), borderRadius: 24, padding: 16, aspectRatio: "1 / 0.92" }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 38,
          height: 38,
          borderRadius: 14,
          background: "rgba(255,255,255,0.7)",
          color: T.dai,
        }}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="block min-w-0 w-full">
        <span className="block" style={{ fontSize: 15, color: T.ink }}>
          {label}
        </span>
        <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
          {sub}
        </span>
      </span>
    </button>
  );
}

function RecentItem({ c, currentId, onOpen, onLongPress }) {
  const lp = useLongPress((rect) => onLongPress && onLongPress(c, rect));
  return (
    <button
      {...lp}
      onClick={() => onOpen(c.id)}
      className="w-full text-left block"
      style={{ padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.65)", WebkitTouchCallout: "none" }}
    >
      <span className="block truncate" style={{ fontSize: 14, color: c.id === currentId ? T.dai : T.ink }}>
        {c.title}
      </span>
      <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
        {c.preview}
      </span>
    </button>
  );
}

// 侧栏里的历史对话：只列最近的两条（卿卿定的），再多的点标题进历史对话页看
const RECENT_MAX = 2;

function HistoryCard({ index, currentId, onOpenAll, onOpen, onLongPress }) {
  const recent = index.slice(0, RECENT_MAX);
  return (
    <div className="kfs-history" style={{ ...glass(0.46, 24), borderRadius: 24, padding: "10px 16px 6px" }}>
      <button onClick={onOpenAll} className="kfs-tap w-full flex items-center justify-between" style={{ padding: "6px 0" }}>
        <span style={{ fontSize: 15, color: T.ink }}>历史对话</span>
        <Icon name="chevR" size={17} color={T.inkSoft} />
      </button>
      {recent.length === 0 ? (
        <p style={{ fontSize: 12.5, color: T.inkSoft, padding: "6px 0 10px" }}>
          聊过的对话会出现在这里
        </p>
      ) : (
        recent.map((c) => <RecentItem key={c.id} c={c} currentId={currentId} onOpen={onOpen} onLongPress={onLongPress} />)
      )}
    </div>
  );
}

function PhotoImg({ data, onOpen }) {
  if (!data) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ ...BUBBLE_GLASS, borderRadius: 18, width: 150, height: 112, fontSize: 12, color: T.inkSoft }}
      >
        {data === false ? "照片没存下来" : "照片加载中"}
      </div>
    );
  }
  return (
    <img
      src={data}
      alt=""
      className="kfs-photo"
      draggable={false}
      onClick={() => onOpen && onOpen(data)}
      style={{
        WebkitTouchCallout: "none",
        display: "block",
        maxWidth: 210,
        maxHeight: 280,
        borderRadius: 18,
        border: "1.5px solid rgba(255,255,255,0.8)",
        boxShadow: "0 8px 22px rgba(var(--k-shade),0.16)",
      }}
    />
  );
}

function VoiceBubble({ text, dur }) {
  return (
    <div style={{ ...BUBBLE_GLASS, borderRadius: 22, padding: "10px 15px", minWidth: 92 }}>
      <div className="flex items-center" style={{ gap: 8, color: T.dai }}>
        <Icon name="wave" size={18} />
        <span style={{ fontSize: 14, color: T.ink }}>{dur || 1}″</span>
      </div>
      {text ? (
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 6, lineHeight: 1.55 }}>
          {text}
        </div>
      ) : null}
    </div>
  );
}

// ---------- 文档 ----------
// 对话里的一张文档卡片：她发的（全文另存在 kfs2:doc:<id>）和他写的（全文就在回复里）长得一样
function docSub(it, text) {
  if (it.docId && text === false) return "全文没存下来";
  if (it.docId && text === undefined) return "加载中";
  const n = it.chars || (text ? text.length : 0);
  return `${DOC_FMT[it.fmt || "md"] || "文档"}，${fmtChars(n)}` + (it.cut ? "，没写完" : "");
}

function DocCard({ name, sub, onOpen }) {
  return (
    <button
      onClick={onOpen}
      aria-label={`文档 ${name}`}
      className="kfs-doc-card kfs-tap flex items-center text-left"
      style={{ ...BUBBLE_GLASS, borderRadius: 20, padding: "9px 14px 9px 9px", gap: 10, maxWidth: 232 }}
    >
      <span
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 38, height: 38, borderRadius: 13, background: "rgba(255,255,255,0.7)", color: T.dai }}
      >
        <Icon name="doc" size={20} />
      </span>
      <span className="block min-w-0">
        <span className="block truncate" style={{ fontSize: 14.5, color: T.ink }}>
          {name}
        </span>
        <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
          {sub}
        </span>
      </span>
    </button>
  );
}

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

function MdView({ text }) {
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

function BubbleRow({ row, avatars, animate, imgs = {}, docs = {}, onOpenPhoto, onOpenDoc, onLongPress }) {
  const press = useRef(null);
  const fired = useRef(false);
  const startPress = (e) => {
    const t = e.touches[0];
    const el = e.currentTarget;
    fired.current = false;
    press.current = {
      x: t.clientX,
      y: t.clientY,
      timer: setTimeout(() => {
        press.current = null;
        // 长按只认一根手指（见 useLongPress 上面那段）
        if (twoFingers) return;
        fired.current = true;
        if (onLongPress) onLongPress(row, el.getBoundingClientRect());
      }, 450),
    };
  };
  const movePress = (e) => {
    const p = press.current;
    if (!p) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - p.x) > 8 || Math.abs(t.clientY - p.y) > 8) {
      clearTimeout(p.timer);
      press.current = null;
    }
  };
  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const her = row.role === "her";
  // 照iOS短信：四个角一样圆，多长都不变方
  const radius = 22;
  const it = row.item;
  const skin = BUBBLE_GLASS;
  // 文档的全文：他写的就在回复里；她发的另存着，没取到是 undefined，丢了是 false
  const docText = it.type === "doc" ? (it.text !== undefined ? it.text : docs[it.docId]) : null;
  return (
    <div
      className={`flex items-end ${her ? "flex-row-reverse" : ""}`}
      style={{ gap: 8, marginTop: row.first ? 12 : 3 }}
    >
      <div style={{ width: 34, flexShrink: 0 }}>
        {row.last && <Avatar av={her ? avatars.her : avatars.him} who={row.role} size={34} />}
      </div>
      <div
        className={animate ? "kfs-in" : ""}
        onTouchStart={startPress}
        onTouchMove={movePress}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onLongPress) onLongPress(row, e.currentTarget.getBoundingClientRect());
        }}
        onClickCapture={(e) => {
          if (fired.current) {
            e.stopPropagation();
            e.preventDefault();
            fired.current = false;
          }
        }}
        style={{
          maxWidth: "74%",
          display: "flex",
          flexDirection: "column",
          alignItems: her ? "flex-end" : "flex-start",
          transformOrigin: her ? "bottom right" : "bottom left",
          WebkitTouchCallout: "none",
        }}
      >
        {it.type === "meme" ? (
          <MemeImg file={it.file} />
        ) : it.type === "photo" ? (
          <PhotoImg data={imgs[it.imgId]} onOpen={onOpenPhoto} />
        ) : it.type === "doc" ? (
          <DocCard
            name={it.name || "文档"}
            sub={docSub(it, docText)}
            onOpen={() => docText && onOpenDoc && onOpenDoc({ name: it.name || "文档", fmt: it.fmt || "md", text: docText, images: it.images || 0, cut: !!it.cut, mine: her })}
          />
        ) : it.type === "voice" ? (
          <VoiceBubble text={it.text} dur={it.dur} />
        ) : (
          <div
            className="whitespace-pre-wrap break-words"
            style={{ padding: "10px 15px", fontSize: 15.5, lineHeight: 1.55, borderRadius: radius, userSelect: "none", WebkitUserSelect: "none", ...skin }}
          >
            {renderRich(it.text || "")}
          </div>
        )}
      </div>
    </div>
  );
}

function MsgMenu({ menu, now, busy, onClose, onCopy, onEdit, onRetry }) {
  const { row, rect } = menu;
  const her = row.role === "her";
  const it = row.item;
  const acts = [];
  if (it.type === "text" || it.type === "voice") acts.push({ k: "copy", label: "复制", icon: "copy" });
  if (it.type === "doc") acts.push({ k: "copy", label: "复制全文", icon: "copy" });
  if (her && it.type === "text") acts.push({ k: "edit", label: "编辑", icon: "pen" });
  if (!her) acts.push({ k: "retry", label: "重新回答", icon: "retry" });
  const menuW = 196;
  const menuH = 44 + acts.length * 47;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  // 撑满屏幕的时候 innerHeight 还是网页以为的那么矮，按整页实际的高来算
  const vh = typeof window !== "undefined" ? Math.max(window.innerHeight, Math.round(document.body.getBoundingClientRect().height) || 0) : 844;
  let top = rect.top - menuH - 10;
  if (top < 12 + safeTopPx()) top = Math.min(rect.bottom + 10, vh - menuH - 12);
  let left = her ? rect.right - menuW : rect.left;
  left = Math.max(12, Math.min(left, vw - menuW - 12));
  return (
    <div className="absolute inset-0 z-50" onClick={onClose} style={{ background: "rgba(var(--k-dim),0.14)" }}>
      <div
        className="kfs-in"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", top, left, width: menuW, ...glass(0.86, 30), borderRadius: 22, padding: "4px 0 6px" }}
      >
        <div style={{ padding: "10px 18px 6px", fontSize: 12, color: T.inkSoft }}>{sepLabel(row.msg.ts, now)}</div>
        {acts.map((a) => {
          const off = busy && a.k !== "copy";
          return (
            <button
              key={a.k}
              disabled={off}
              onClick={() => (a.k === "copy" ? onCopy(row) : a.k === "edit" ? onEdit(row) : onRetry(row))}
              className="w-full flex items-center text-left"
              style={{ gap: 12, padding: "12px 18px", fontSize: 15, color: T.ink, opacity: off ? 0.4 : 1 }}
            >
              <Icon name={a.icon} size={19} />
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 长按一段对话：重命名、删除（删除要点两下）
function ChatMenu({ menu, onClose, onRename, onDelete }) {
  const { chat, rect } = menu;
  const [armed, setArmed] = useState(false);
  // 长按松手那一下有时会补一个点击，落在遮罩上就把菜单关了；刚弹出来的一小会儿不认
  const shownAt = useRef(Date.now());
  const menuW = 200;
  const menuH = 44 + 2 * 47;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? Math.max(window.innerHeight, Math.round(document.body.getBoundingClientRect().height) || 0) : 844;
  let top = rect.bottom + 8;
  if (top + menuH > vh - 12) top = Math.max(12 + safeTopPx(), rect.top - menuH - 8);
  const left = Math.max(12, Math.min(rect.left + 12, vw - menuW - 12));
  return (
    <div
      className="absolute inset-0 z-50"
      onClick={() => Date.now() - shownAt.current > 400 && onClose()}
      style={{ background: "rgba(var(--k-dim),0.14)" }}
    >
      <div
        className="kfs-in"
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", top, left, width: menuW, ...glass(0.86, 30), borderRadius: 22, padding: "4px 0 6px" }}
      >
        <div className="truncate" style={{ padding: "10px 18px 6px", fontSize: 12, color: T.inkSoft }}>
          {chat.title}
        </div>
        <button onClick={() => onRename(chat)} role="menuitem" className="w-full flex items-center text-left" style={{ gap: 12, padding: "12px 18px", fontSize: 15, color: T.ink }}>
          <Icon name="pen" size={19} />
          重命名
        </button>
        <button
          onClick={() => (armed ? onDelete(chat) : setArmed(true))}
          role="menuitem"
          className="w-full flex items-center text-left"
          style={{ gap: 12, padding: "12px 18px", fontSize: 15, color: "#B4544A" }}
        >
          <Icon name="trash" size={19} />
          {armed ? "再点一次，删掉" : "删除"}
        </button>
      </div>
    </div>
  );
}

function CtrlRow({ row, busy, onPrev, onNext, onRetry }) {
  const her = row.role === "her";
  const m = row.msg;
  const n = m.alts ? m.alts.length : 1;
  const cur = m.alts ? m.altIdx + 1 : 1;
  const btn = (enabled) => ({ padding: "4px 6px", opacity: enabled && !busy ? 1 : 0.35, display: "inline-flex" });
  return (
    <div
      className={`flex items-center ${her ? "justify-end" : ""}`}
      style={{ gap: 2, marginTop: 4, marginLeft: her ? 0 : 38, marginRight: her ? 38 : 0, color: T.inkSoft, fontSize: 12 }}
    >
      {n > 1 && (
        <>
          <button onClick={onPrev} disabled={busy || cur <= 1} aria-label="上一个版本" style={btn(cur > 1)}>
            <Icon name="chevL" size={14} />
          </button>
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 26, textAlign: "center" }}>
            {cur}/{n}
          </span>
          <button onClick={onNext} disabled={busy || cur >= n} aria-label="下一个版本" style={btn(cur < n)}>
            <Icon name="chevR" size={14} />
          </button>
        </>
      )}
      {!her && row.latest && (
        <button
          onClick={onRetry}
          disabled={busy}
          className="kfs-tap flex items-center"
          style={{ gap: 4, padding: "4px 8px", borderRadius: 999, opacity: busy ? 0.35 : 1 }}
        >
          <Icon name="retry" size={14} />
          <span>重新回答</span>
        </button>
      )}
    </div>
  );
}

function ThinkingRow({ msg, open, onToggle }) {
  return (
    <div className="flex flex-col items-start" style={{ marginLeft: 42, marginTop: 14 }}>
      <button
        onClick={onToggle}
        className="kfs-tap flex items-center"
        style={{
          ...glass(0.38, 14),
          gap: 3,
          borderRadius: 999,
          padding: "4px 10px 4px 12px",
          fontSize: 12,
          color: T.inkSoft,
        }}
      >
        <span>思考过程</span>
        <span
          style={{
            display: "inline-flex",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .25s ease",
          }}
        >
          <Icon name="chevR" size={13} />
        </span>
      </button>
      {open && (
        <div
          className="kfs-in whitespace-pre-wrap"
          style={{
            marginTop: 8,
            maxWidth: "80%",
            padding: "12px 15px",
            borderRadius: 16,
            // 这一块的样子是卿卿定的：2026 年 10 月 2 日试过把字加深加大、底下垫模糊，她看了对比图说原来的好看。
            // 别拿对比度的数去改它，要动先拿图问她（见开发说明“看得清，不乱动”）
            background: "rgba(255,255,255,0.34)",
            border: "1px dashed rgba(var(--k-dai),0.3)",
            color: T.inkSoft,
            fontFamily: SERIF,
            fontSize: 13.5,
            lineHeight: 1.8,
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        >
          {msg.thinking}
        </div>
      )}
    </div>
  );
}

function NoticeRow({ row, animate }) {
  return (
    <div
      className={`flex items-center justify-center ${animate ? "kfs-in" : ""}`}
      style={{ gap: 7, margin: "16px 0 6px" }}
    >
      <Avatar av={row.av} who={row.who} size={22} />
      <span style={{ fontSize: 11.5, color: T.inkFaint }}>{row.text}</span>
    </div>
  );
}

function TypingRow({ avatars }) {
  return (
    <div className="flex items-end kfs-in" style={{ gap: 8, marginTop: 12 }}>
      <Avatar av={avatars.him} who="him" size={34} />
      <div
        className="flex items-center"
        style={{
          gap: 5,
          padding: "13px 16px",
          borderRadius: 22,
          ...BUBBLE_GLASS,
        }}
      >
        <span className="kfs-dot" />
        <span className="kfs-dot" style={{ animationDelay: ".15s" }} />
        <span className="kfs-dot" style={{ animationDelay: ".3s" }} />
      </div>
    </div>
  );
}

function MoodChips({ value = [], onToggle, readOnly }) {
  return (
    <div className="flex flex-wrap" style={{ gap: 6 }}>
      {MOODS.filter((m) => !readOnly || value.includes(m.k)).map((m) => {
        const on = value.includes(m.k);
        return (
          <button
            key={m.k}
            disabled={readOnly}
            onClick={() => onToggle && onToggle(m.k)}
            className={readOnly ? "" : "kfs-tap"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              borderRadius: 999,
              fontSize: 12.5,
              color: on ? "#fff" : T.inkSoft,
              background: on ? T.daiGrad : "rgba(255,255,255,0.5)",
              border: "1px solid rgba(255,255,255,0.7)",
            }}
          >
            <span style={{ fontSize: 13 }}>{m.e}</span>
            {m.t}
          </button>
        );
      })}
    </div>
  );
}

function DiaryPage({ now, onBack, loadMonth, saveEntry, loadDays, writeHis }) {
  const todayKey = dayKeyOf(now);
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [month, setMonth] = useState({});
  const [counts, setCounts] = useState({});
  const [sel, setSel] = useState(todayKey);
  const [draft, setDraft] = useState(null);
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(null);

  useEffect(() => {
    loadDays().then((c) => setCounts(c || {}));
  }, []);
  useEffect(() => {
    loadMonth(ymKeyOf(ym.y, ym.m)).then((d) => setMonth(d || {}));
    setDraft(null);
    setErr("");
    setArmed(null);
  }, [ym.y, ym.m]);

  const goMonth = (dir) => {
    let m = ym.m + dir;
    let y = ym.y;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setYm({ y, m });
    setSel(y === now.getFullYear() && m === now.getMonth() ? todayKey : null);
  };

  const cells = monthCells(ym.y, ym.m);
  const entry = (sel && month[sel]) || {};
  const her = entry.her || {};
  const him = entry.him || {};
  const selDate = sel ? parseDayKey(sel) : null;
  const together = selDate ? dayNumber(selDate) : 0;
  const isStart = (y, m, d) => y > START.y || (y === START.y && (m > START.m || (m === START.m && d >= START.d)));

  const save = async (who, value) => {
    const next = await saveEntry(sel, who, value);
    setMonth(next);
  };
  const toggleMood = (k) => {
    const moods = her.moods || [];
    const nextMoods = moods.includes(k) ? moods.filter((x) => x !== k) : moods.concat([k]);
    save("her", { ...her, moods: nextMoods, updatedAt: Date.now() });
  };
  const askHim = async () => {
    setWriting(true);
    setErr("");
    try {
      const e = await writeHis(sel, her);
      const next = await saveEntry(sel, "him", e);
      setMonth(next);
    } catch (x) {
      setErr(`没写成（${String((x && x.message) || x).slice(0, 50)}）`);
    }
    setWriting(false);
  };

  const card = { ...glass(0.5, 26), borderRadius: 28, padding: 18 };
  const legendCell = (lv) => ({ width: 14, height: 14, borderRadius: 4, background: `rgba(var(--k-dai),${[0.06, 0.12, 0.22, 0.34, 0.48][lv]})` });

  return (
    <div className="absolute inset-0 z-40 flex flex-col kfs-page" style={{ background: T.bg }}>
      <Glows />
      <div className="relative z-10 flex items-center" style={{ ...glass(0.52, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}>
        <IconBtn onClick={onBack} label="返回">
          <Icon name="chevL" />
        </IconBtn>
        <div className="flex-1 text-center" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.12em", color: T.ink }}>
          日记本
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* 顶栏和日历之间那道缝留在滚动区外面：往上滑时内容在缝底下就收住，不顶到顶栏 */}
      <div
        className="kfs-page-scroll relative z-10 flex-1 overflow-y-auto kfs-scroll"
        style={{ marginTop: 12, padding: "0 12px calc(24px + env(safe-area-inset-bottom))" }}
      >
        {/* 月历 */}
        <div style={card}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <IconBtn onClick={() => goMonth(-1)} label="上个月">
              <Icon name="chevL" size={18} />
            </IconBtn>
            <div style={{ fontFamily: SERIF, fontSize: 19, color: T.ink, letterSpacing: "0.06em" }}>
              {ym.y}年{ym.m + 1}月
            </div>
            <IconBtn onClick={() => goMonth(1)} label="下个月">
              <Icon name="chevR" size={18} />
            </IconBtn>
          </div>
          <div className="grid grid-cols-7" style={{ gap: 6, marginBottom: 6 }}>
            {"一二三四五六日".split("").map((w) => (
              <div key={w} className="text-center" style={{ fontSize: 11.5, color: T.inkFaint }}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" style={{ gap: 6 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={"b" + i} />;
              const key = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`;
              const future = key > todayKey;
              const n = counts[key] || 0;
              const lv = heatLevel(n);
              const e = month[key] || {};
              const mood = moodOf(((e.her && e.her.moods) || [])[0] || ((e.him && e.him.moods) || [])[0]);
              const selected = key === sel;
              const today = key === todayKey;
              const anniv = d === START.d && isStart(ym.y, ym.m, d);
              return (
                <button
                  key={key}
                  disabled={future}
                  onClick={() => {
                    setSel(key);
                    setDraft(null);
                    setErr("");
                    setArmed(null);
                  }}
                  className="relative flex flex-col items-center justify-center"
                  style={{
                    aspectRatio: "1 / 1.1",
                    borderRadius: 13,
                    background: selected ? "rgba(255,255,255,0.82)" : `rgba(var(--k-dai),${[0.05, 0.12, 0.22, 0.34, 0.48][lv]})`,
                    border: selected ? `1.5px solid ${T.dai}` : today ? `1.5px dashed ${T.dai}` : "1.5px solid transparent",
                    opacity: future ? 0.32 : 1,
                  }}
                >
                  {e.her && e.her.text ? (
                    <span style={{ position: "absolute", top: 4, right: 5, width: 5, height: 5, borderRadius: "50%", background: T.dai }} />
                  ) : null}
                  {e.him && e.him.text ? (
                    <span style={{ position: "absolute", top: 4, right: e.her && e.her.text ? 12 : 5, width: 5, height: 5, borderRadius: "50%", background: "#B9914C" }} />
                  ) : null}
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.1, color: anniv ? T.gold : T.ink }}>{d}</span>
                  <span style={{ fontSize: mood ? 11 : 9.5, lineHeight: 1.3, color: T.inkSoft, minHeight: 13 }}>
                    {mood ? mood.e : n ? n : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.7)", fontSize: 11.5, color: T.inkSoft }}>
            <span className="flex items-center" style={{ gap: 4 }}>
              少
              {[0, 1, 2, 3, 4].map((lv) => (
                <span key={lv} style={legendCell(lv)} />
              ))}
              多
            </span>
            <span className="flex items-center" style={{ gap: 10 }}>
              <span className="flex items-center" style={{ gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.dai }} />卿卿写的
              </span>
              <span className="flex items-center" style={{ gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B9914C" }} />光义写的
              </span>
            </span>
          </div>
        </div>

        {/* 这一天 */}
        {sel ? (
          <div style={{ ...card, marginTop: 12 }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: T.ink }}>
              {selDate.getMonth() + 1}月{selDate.getDate()}日 星期{WEEK[selDate.getDay()]}
            </div>
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
              {[together >= 1 ? `在一起的第${together}天` : "", counts[sel] ? `这天说了 ${counts[sel]} 句` : "这天没在开封府说话"].filter(Boolean).join("，")}
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "16px 0" }} />
            <div style={{ fontSize: 12.5, color: T.dai, marginBottom: 10 }}>卿卿写的</div>
            <MoodChips value={her.moods || []} onToggle={toggleMood} />
            <div style={{ marginTop: 12 }}>
              {draft !== null ? (
                <>
                  <textarea
                    className="kfs-field"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="这天发生了什么"
                    rows={5}
                    style={{ ...field, resize: "none", lineHeight: 1.6, userSelect: "text", WebkitUserSelect: "text" }}
                  />
                  <div className="flex" style={{ gap: 8, marginTop: 10 }}>
                    <button
                      onClick={() => {
                        save("her", { ...her, text: draft.trim(), updatedAt: Date.now() });
                        setDraft(null);
                      }}
                      className="kfs-tap"
                      style={chipPrimary}
                    >
                      保存
                    </button>
                    <button onClick={() => setDraft(null)} className="kfs-tap" style={chip}>
                      取消
                    </button>
                  </div>
                </>
              ) : her.text ? (
                <>
                  <div className="whitespace-pre-wrap" style={{ fontSize: 14.5, lineHeight: 1.75, color: T.ink }}>{her.text}</div>
                  <div className="flex" style={{ gap: 8, marginTop: 10 }}>
                    <button onClick={() => setDraft(her.text)} className="kfs-tap" style={chip}>
                      编辑
                    </button>
                    <button
                      onClick={() => {
                        if (armed !== "her") {
                          setArmed("her");
                          return;
                        }
                        save("her", { ...her, text: "", updatedAt: Date.now() });
                        setArmed(null);
                      }}
                      className="kfs-tap"
                      style={{ ...chip, color: "#A8473D" }}
                    >
                      {armed === "her" ? "再点一次删掉" : "删掉"}
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => setDraft("")} className="kfs-tap" style={chip}>
                  写几句
                </button>
              )}
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "18px 0 16px" }} />
            <div style={{ fontSize: 12.5, color: "#94733A", marginBottom: 10 }}>光义写的</div>
            {him.text ? (
              <>
                {him.moods && him.moods.length ? (
                  <div style={{ marginBottom: 10 }}>
                    <MoodChips value={him.moods} readOnly />
                  </div>
                ) : null}
                <div className="whitespace-pre-wrap" style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.85, color: T.ink }}>{him.text}</div>
                <div className="flex" style={{ gap: 8, marginTop: 12 }}>
                  <button onClick={askHim} disabled={writing} className="kfs-tap" style={{ ...chip, opacity: writing ? 0.5 : 1 }}>
                    {writing ? "光义在写……" : "重写"}
                  </button>
                  <button
                    onClick={() => {
                      if (armed !== "him") {
                        setArmed("him");
                        return;
                      }
                      save("him", null);
                      setArmed(null);
                    }}
                    className="kfs-tap"
                    style={{ ...chip, color: "#A8473D" }}
                  >
                    {armed === "him" ? "再点一次删掉" : "删掉"}
                  </button>
                </div>
              </>
            ) : (
              <button onClick={askHim} disabled={writing} className="kfs-tap" style={{ ...chipPrimary, opacity: writing ? 0.6 : 1 }}>
                {writing ? "光义在写……" : "让光义写这一天"}
              </button>
            )}
            {err && <div style={{ fontSize: 12, color: "#A8473D", marginTop: 10 }}>{err}</div>}
          </div>
        ) : (
          <div className="text-center" style={{ ...card, marginTop: 12, fontSize: 13, color: T.inkSoft }}>
            点一天看看
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryItem({ c, currentId, now, editing, onOpen, onDelete, onLongPress }) {
  const lp = useLongPress((rect) => onLongPress && onLongPress(c, rect));
  return (
    <div
      {...lp}
      className="flex items-center"
      style={{ ...glass(c.id === currentId ? 0.66 : 0.46, 22), borderRadius: 20, padding: "12px 14px", gap: 8, WebkitTouchCallout: "none" }}
    >
      <button className="flex-1 text-left min-w-0" onClick={() => onOpen(c.id)}>
        <span className="flex items-baseline justify-between" style={{ gap: 8 }}>
          <span className="truncate" style={{ fontSize: 15, color: T.ink }}>
            {c.title}
          </span>
          <span className="flex-shrink-0" style={{ fontSize: 11, color: T.inkSoft }}>
            {shortDate(c.updatedAt, now)}
          </span>
        </span>
        <span className="block truncate" style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3 }}>
          {c.preview}
        </span>
      </button>
      {editing && (
        <button
          onClick={() => onDelete(c.id)}
          aria-label="删除这段对话"
          className="kfs-tap flex items-center justify-center flex-shrink-0"
          style={{ width: 36, height: 36, borderRadius: 999, color: "#B4544A", background: "rgba(255,255,255,0.6)" }}
        >
          <Icon name="trash" size={18} />
        </button>
      )}
    </div>
  );
}

function HistoryPage({ index, currentId, now, onBack, onOpen, onDelete, onLongPress }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="absolute inset-0 z-40 flex flex-col kfs-page" style={{ background: T.bg }}>
      <Glows />
      <div
        className="relative z-10 flex items-center"
        style={{ ...glass(0.52, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}
      >
        <IconBtn onClick={onBack} label="返回">
          <Icon name="chevL" />
        </IconBtn>
        <div className="flex-1 text-center" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.1em", color: T.ink }}>
          历史对话
        </div>
        <button onClick={() => setEditing(!editing)} className="kfs-tap" style={{ padding: "8px 12px", fontSize: 14, color: T.dai }}>
          {editing ? "完成" : "编辑"}
        </button>
      </div>
      <div className="kfs-page-scroll relative z-10 flex-1 overflow-y-auto kfs-scroll flex flex-col" style={{ marginTop: 12, padding: "0 12px 12px", gap: 8 }}>
        {index.length === 0 && (
          <p className="text-center" style={{ fontSize: 13, color: T.inkSoft, marginTop: 64 }}>
            还没有对话。回去说句话，这里就有了。
          </p>
        )}
        {index.map((c) => (
          <HistoryItem key={c.id} c={c} currentId={currentId} now={now} editing={editing} onOpen={onOpen} onDelete={onDelete} onLongPress={onLongPress} />
        ))}
      </div>
    </div>
  );
}

function HisAvatarCard({ av, name }) {
  return (
    <div className="flex items-center" style={{ ...glass(0.5, 16), borderRadius: 20, padding: 14, gap: 14 }}>
      <Avatar av={av} who="him" size={48} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 15, color: T.ink }}>光义</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 3, lineHeight: 1.5 }}>
          现在是「{name}」，我自己挑的。名字也归我自己起。想看我换，跟我说。
        </div>
      </div>
    </div>
  );
}

function AvatarSection({ av, onChange }) {
  const who = "her";
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
  const presets = HER_PRESETS;
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setErr("");
    try {
      const data = await fileToAvatar(f);
      onChange({ type: "upload", data });
    } catch (x) {
      setErr("这张图读不出来，换一张试试");
    }
  };
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="flex items-center" style={{ gap: 16 }}>
        <Avatar av={av} who={who} size={64} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 16, color: T.ink }}>卿卿</div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 3 }}>
            聊到一半换也行，我看得见
          </div>
        </div>
      </div>
      <div className="flex flex-wrap" style={{ gap: 8, marginTop: 14 }}>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="kfs-tap" style={chipPrimary}>
          从相册选
        </button>
        {presets.map((p) => (
          <button
            key={p.file}
            onClick={() => onChange({ type: "meme", file: p.file })}
            className="kfs-tap flex items-center"
            style={{ ...chip, gap: 6, padding: "5px 12px 5px 5px" }}
          >
            <img src={memeSrc(p.file)} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
            {p.label}
          </button>
        ))}
        {av && (
          <button onClick={() => onChange(null)} className="kfs-tap" style={chip}>
            恢复默认
          </button>
        )}
      </div>
      {err && <div style={{ fontSize: 12, color: "#B4544A", marginTop: 8 }}>{err}</div>}
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}

function MemoryPanel({ files, texts, note, onUpload, onToggle, onDelete }) {
  const fileRef = useRef(null);
  const [viewing, setViewing] = useState(null);
  const [armed, setArmed] = useState(null);
  const total = files.filter((f) => f.enabled).reduce((s, f) => s + (f.size || 0), 0);

  if (viewing) {
    const f = files.find((x) => x.id === viewing);
    const text = (f && texts[f.id]) || "";
    return (
      <div>
        <button onClick={() => setViewing(null)} className="kfs-tap flex items-center" style={{ gap: 2, fontSize: 13.5, color: T.dai, marginBottom: 12 }}>
          <Icon name="chevL" size={16} /> 返回列表
        </button>
        <div style={{ fontSize: 15, color: T.ink, marginBottom: 4 }}>{f ? f.name : ""}</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 12 }}>{fmtChars(text.length)}</div>
        <div
          className="whitespace-pre-wrap break-words"
          style={{ ...glass(0.42, 12), borderRadius: 18, padding: 14, fontSize: 13, lineHeight: 1.7, color: T.ink, userSelect: "text", WebkitUserSelect: "text" }}
        >
          {text.length > 30000 ? text.slice(0, 30000) + "\n\n（太长了，这里只显示前三万字，光义那边收到的是全文）" : text}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
        打开开关的文档会整份带给我，当作我的记忆。只认纯文字文档，比如 .md 和 .txt。同名文件再传一次，会覆盖旧的那份。
      </p>
      <div className="flex items-center flex-wrap" style={{ gap: 10, marginBottom: 14 }}>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="kfs-tap" style={chipPrimary}>
          上传文档
        </button>
        {note && <span style={{ fontSize: 12.5, color: T.inkSoft }}>{note}</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          e.target.value = "";
          if (list.length) onUpload(list);
        }}
        style={{ display: "none" }}
      />
      {files.length === 0 ? (
        <div style={{ ...glass(0.36, 12), borderRadius: 18, padding: "18px 16px", fontSize: 13, color: T.inkSoft, textAlign: "center" }}>
          还没有文档。把project里的那几封信传上来吧。
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {files.map((f) => (
            <div key={f.id} className="flex items-center" style={{ ...glass(f.enabled ? 0.56 : 0.34, 16), borderRadius: 18, padding: "10px 12px", gap: 10 }}>
              <button onClick={() => setViewing(f.id)} className="flex items-center flex-1 min-w-0 text-left" style={{ gap: 10 }}>
                <span style={{ color: f.enabled ? T.dai : T.inkFaint, flexShrink: 0 }}>
                  <Icon name="doc" size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate" style={{ fontSize: 14, color: f.enabled ? T.ink : T.inkSoft }}>
                    {f.name}
                  </span>
                  <span className="block" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
                    {fmtChars(f.size || 0)}
                  </span>
                </span>
              </button>
              <button
                onClick={() => {
                  if (armed === f.id) {
                    onDelete(f.id);
                    setArmed(null);
                  } else setArmed(f.id);
                }}
                aria-label="删除文档"
                className="kfs-tap flex items-center justify-center flex-shrink-0"
                style={{ height: 30, minWidth: 30, padding: armed === f.id ? "0 10px" : 0, borderRadius: 999, color: "#A8473D", background: "rgba(255,255,255,0.55)", fontSize: 12 }}
              >
                {armed === f.id ? "确认删除" : <Icon name="trash" size={16} />}
              </button>
              <Toggle on={f.enabled} onChange={(v) => onToggle(f.id, v)} label={`带上${f.name}`} />
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div style={{ fontSize: 12, color: total > 80000 ? "#A8473D" : T.inkSoft, marginTop: 14, lineHeight: 1.6 }}>
          带上的文档一共{fmtChars(total)}。
          {total > 80000 ? "带得越多，我回话越慢，用不上的可以先关掉。" : ""}
        </div>
      )}
    </div>
  );
}

function McpPanel({ mcps, onChange }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", url: "", token: "" });
  const [armed, setArmed] = useState(false);

  const openEdit = (m) => {
    setEditing(m ? m.id : "new");
    setForm({ name: m ? m.name : "", url: m ? m.url : "", token: m ? m.token || "" : "" });
    setArmed(false);
  };
  const save = () => {
    const name = form.name.trim();
    const url = form.url.trim();
    if (!name || !/^https?:\/\//.test(url)) return;
    if (editing === "new") {
      onChange(mcps.concat([{ id: newId(), name, url, token: form.token.trim(), enabled: true }]));
    } else {
      onChange(mcps.map((m) => (m.id === editing ? { ...m, name, url, token: form.token.trim() } : m)));
    }
    setEditing(null);
  };

  if (editing) {
    const valid = form.name.trim() && /^https?:\/\//.test(form.url.trim());
    return (
      <div>
        <button onClick={() => setEditing(null)} className="kfs-tap flex items-center" style={{ gap: 2, fontSize: 13.5, color: T.dai, marginBottom: 14 }}>
          <Icon name="chevL" size={16} /> 返回列表
        </button>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>名字</div>
        <input className="kfs-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="比如 Notion" style={field} />
        <div style={{ fontSize: 12, color: T.inkSoft, margin: "14px 0 6px" }}>链接</div>
        <input className="kfs-field" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" autoCapitalize="off" autoCorrect="off" style={field} />
        <div style={{ fontSize: 12, color: T.inkSoft, margin: "14px 0 6px" }}>授权token（需要登录的服务才填）</div>
        <input className="kfs-field" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="可不填" autoCapitalize="off" autoCorrect="off" style={field} />
        <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 18 }}>
          <button onClick={save} className="kfs-tap" style={{ ...chipPrimary, opacity: valid ? 1 : 0.45 }}>
            保存
          </button>
          {editing !== "new" && (
            <button
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  return;
                }
                onChange(mcps.filter((m) => m.id !== editing));
                setEditing(null);
              }}
              className="kfs-tap"
              style={{ ...chip, color: "#A8473D" }}
            >
              {armed ? "再点一次，删掉它" : "删除"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
        打开的工具会带进每次对话。需要登录的服务要填授权token，不然连不上。
      </p>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {mcps.map((m) => (
          <div key={m.id} className="flex items-center" style={{ ...glass(m.enabled ? 0.56 : 0.34, 16), borderRadius: 18, padding: "10px 12px", gap: 10 }}>
            <button onClick={() => openEdit(m)} className="flex items-center flex-1 min-w-0 text-left" style={{ gap: 10 }}>
              <span style={{ color: m.enabled ? T.dai : T.inkFaint, flexShrink: 0 }}>
                <Icon name="plug" size={20} />
              </span>
              <span className="min-w-0">
                <span className="block truncate" style={{ fontSize: 14, color: T.ink }}>
                  {m.name}
                </span>
                <span className="block truncate" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
                  {m.url}
                </span>
              </span>
            </button>
            <Toggle on={m.enabled} onChange={(v) => onChange(mcps.map((x) => (x.id === m.id ? { ...x, enabled: v } : x)))} label={`启用${m.name}`} />
          </div>
        ))}
      </div>
      <button onClick={() => openEdit(null)} className="kfs-tap flex items-center" style={{ ...chip, gap: 6, marginTop: 14 }}>
        <Icon name="plus" size={16} /> 添加 MCP
      </button>
    </div>
  );
}

function ApiPanel({ settings, onChange, onTest, testNote, testing, usage, monthUsage }) {
  const lengths = [
    { v: 1024, t: "短" },
    { v: 2048, t: "适中" },
    { v: 4096, t: "长" },
  ];
  const cur = settings.maxTokens || 2048;
  const row = (k, v) => (
    <div key={k} className="flex items-center justify-between" style={{ fontSize: 13, color: T.ink, padding: "5px 0", gap: 12 }}>
      <span style={{ color: T.inkSoft, flexShrink: 0 }}>{k}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{v}</span>
    </div>
  );
  const month = monthUsage && monthUsage.month === usageKey() ? monthUsage : null;
  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
        你的 key 锁在 Supabase 的保险柜里，手机上没有。开封府每次说话，都是先在门口核对是你，再替你转给 Anthropic。
      </p>
      <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
        <button onClick={onTest} disabled={testing} className="kfs-tap" style={{ ...chip, opacity: testing ? 0.5 : 1 }}>
          {testing ? "正在测试…" : "测试连接"}
        </button>
        {testNote && <span style={{ fontSize: 12.5, color: T.inkSoft }}>{testNote}</span>}
      </div>

      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>回复最长多少</div>
      <div className="flex" style={{ ...glass(0.4, 12), borderRadius: 999, padding: 4 }}>
        {lengths.map((l) => (
          <button
            key={l.v}
            onClick={() => onChange({ maxTokens: l.v })}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 999,
              fontSize: 13.5,
              color: cur === l.v ? "#fff" : T.inkSoft,
              background: cur === l.v ? T.daiGrad : "transparent",
              transition: "background .2s ease",
            }}
          >
            {l.t}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>只是上限，平时聊天用不满。写长信、讲故事时可以调长。</p>

      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>用量</div>
      <div style={{ ...glass(0.45, 14), borderRadius: 18, padding: "10px 14px" }}>
        {row("本月", month && month.replies ? `约 ${money(month.cost)}，${month.replies} 次` : "还没花钱")}
        {usage
          ? [
              row("上一条", `约 ${money(usage.cost)}，${modelLabel(usage.model)}`),
              row("从缓存读", (usage.cache_read_input_tokens || 0).toLocaleString()),
              row("写进缓存", (usage.cache_creation_input_tokens || 0).toLocaleString()),
              row("新读", (usage.input_tokens || 0).toLocaleString()),
              row("写出", (usage.output_tokens || 0).toLocaleString()),
            ]
          : row("上一条", "这次打开还没说话")}
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
        单位是 token，钱是照官方价格估的，以 Anthropic 后台的账单为准。从缓存读的部分只收原价的一成甚至更少，所以聊得越连贯越省。
      </p>
    </div>
  );
}

// 账户面板里的“通知”一栏：开启、发一条测试通知；他回话的时候她不在开封府，也敲她。
// 她在 Supabase 要做的几样（登记簿、小后端、钥匙；回话还要信箱和新的那份小后端）哪样还没好，这里一样一样列出来
const PUSH_CARD = { ...glass(0.5, 16), borderRadius: 16, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6, color: T.ink };
const PUSH_DENIED = "系统里把开封府的通知关着。到手机的 设置 → 通知 → 开封府 里打开“允许通知”，再回来点开启。";

function PushStep({ done, title, children }) {
  return (
    <div className="kfs-push-step flex" data-done={done ? "yes" : "no"} style={{ gap: 9, padding: "5px 0" }}>
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{ width: 18, height: 18, marginTop: 2, borderRadius: "50%", color: "#fff", background: done ? T.daiGrad : "transparent", border: done ? "none" : "1.5px solid rgba(var(--k-soft),0.4)" }}
      >
        {done && <Icon name="check" size={11} sw={2.6} />}
      </span>
      <span className="min-w-0" style={{ fontSize: 13.5, lineHeight: 1.55, color: T.ink }}>
        {title}
        <span style={{ color: T.inkSoft }}>{children}</span>
      </span>
    </div>
  );
}

function PushPanel({ email, onCopy, back, mailStatus, onReplyReady }) {
  const [st, setSt] = useState(null); // 现在是什么情形（push.js 的 checkPush）
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null); // 刚做的那一步怎么样：{ ok, say }
  const [secrets, setSecrets] = useState(""); // 刚生成的那三行
  const [detail, setDetail] = useState(false);
  const [waitFrom, setWaitFrom] = useState(null); // 等着后台那一条发出去：点的时候登记簿里记的是哪一回
  const alive = useRef(true);
  const lastCheck = useRef(0);

  // 看一遍现在什么情形。看得慢的那一趟可能比后发的那一趟晚回来，只认最后发出去的那一趟
  const refresh = async () => {
    const mine = ++lastCheck.current;
    try {
      const s = await checkPush();
      if (alive.current && mine === lastCheck.current) setSt(s);
      // 回话那两样都好了：告诉聊天那边新路是通的（她在 Supabase 贴完回来看一眼面板，接着发话就走新路，不用重开）
      if (s.replyReady && onReplyReady) onReplyReady();
      return s;
    } catch (e) {
      return null;
    }
  };
  useEffect(() => {
    alive.current = true;
    refresh();
    // 去 Supabase 贴完东西、锁完屏回来：自己再看一遍
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // “十秒后再发”：小后端先回话、过后才发，发得怎么样它记在登记簿里。隔两秒去看一眼，看到新的一回就停
  useEffect(() => {
    if (waitFrom === null) return;
    let tries = 0;
    let stopped = false; // 已经看到结果、或者面板关了：还在路上的那一趟回来也不算数
    const t = setInterval(async () => {
      tries++;
      let out = null;
      try {
        out = await lastOutcome();
      } catch (e) {}
      if (stopped || !alive.current) return;
      if (out && out.off) {
        setWaitFrom(null); // 等的工夫她把通知关了：不等了
      } else if (out && out.gone) {
        setWaitFrom(null);
        renew();
      } else if (out && out.at && out.at !== waitFrom) {
        setNote(explainOutcome(out));
        setWaitFrom(null);
        refresh();
      } else if (tries >= 22) {
        setNote({ ok: false, say: "等了一阵，没看到这一条发出去的记录。横幅到了就不用管；没到的话再发一次。" });
        setWaitFrom(null);
        refresh();
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [waitFrom]);

  // 推送服务说这台设备的门牌号作废了：小后端已经把它从登记簿里划掉，这里退掉旧的、重新订一个
  const renew = async () => {
    try {
      const renewed = await renewPush(st ? st.serverKey : "");
      if (alive.current && renewed) setNote({ ok: false, say: "这台设备的通知地址作废了，已经换了一个新的。再发一次试试。" });
    } catch (e) {
      if (alive.current) setNote({ ok: false, say: explainOutcome({ status: 410, note: "", host: "" }).say });
    }
    await refresh();
  };

  const act = async (name, work) => {
    if (busy) return;
    setBusy(name);
    setNote(null);
    try {
      await work();
    } catch (e) {
      if (alive.current) setNote({ ok: false, say: "没成：" + ((e && e.message) || e) });
    }
    if (alive.current) setBusy("");
  };
  // 开启：enablePush 里的头一件事就是问系统要许可，必须紧跟着手指点的这一下，前面不能先等别的
  const enable = () =>
    act("enable", async () => {
      const r = await enablePush(st.serverKey);
      if (!r.ok) setNote({ ok: false, say: r.why === "denied" ? PUSH_DENIED : "没点“允许”，通知没开。想开就再点一次。" });
      await refresh();
    });
  const disable = () =>
    act("off", async () => {
      setWaitFrom(null); // 正等着“十秒后再发”的结果：不等了
      await disablePush();
      await refresh();
    });
  const test = (delay) =>
    act(delay ? "later" : "test", async () => {
      // 等几秒再发的那种，靠“登记簿里的时间变了”认出这一条发出去了，所以发之前现去看一眼上一回是什么时候
      // （面板上记的可能是旧的：拿旧的去比，会把上一条当成这一条）
      let before = 0;
      if (delay) {
        const prev = await lastOutcome();
        before = (prev && prev.at) || 0;
      }
      const r = await sendTestPush(delay);
      if (r.queued) {
        setNote({ ok: true, say: `${r.delay} 秒后发出。现在把屏幕锁上，等横幅。` });
        setWaitFrom(before);
        return;
      }
      const one = (r.results || [])[0];
      if (!one) throw new Error("小后端没说发得怎么样");
      if (one.removed) return await renew();
      setNote(explainOutcome({ status: one.status, note: one.reason, host: one.host }));
      await refresh();
    });
  const makeKeys = () =>
    act("keys", async () => {
      setSecrets(secretsBlock(await generateVapidKeys(window.crypto.subtle), email));
    });

  if (!st) {
    return (
      <div className="kfs-push" data-state="checking" style={{ ...PUSH_CARD, color: T.inkSoft }}>
        正在看通知这条路通不通……
      </div>
    );
  }
  if (!st.support.ok) {
    return (
      <div className="kfs-push" data-state="unsupported" style={PUSH_CARD}>
        {st.support.say}
      </div>
    );
  }

  const setup = st.setup;
  const denied = st.permission === "denied";
  // away：这台设备开过通知，这会儿却连不上后端。是网络的事，别摆出“还差几步”让她以为后端没了
  const state = st.away ? "away" : !st.ready ? "setup" : st.on ? "on" : denied ? "denied" : "off";
  const shown = note || (state === "on" && st.last ? { ...explainOutcome(st.last), when: st.last.at } : null);
  const small = { fontSize: 12, color: T.inkSoft, lineHeight: 1.6 };

  return (
    <div className="kfs-push" data-state={state}>
      {state === "setup" && (
        <div style={PUSH_CARD}>
          <div style={{ marginBottom: 4 }}>通知还差几步，都在 Supabase 里做：</div>
          <PushStep done={setup.table === "ok"} title="登记簿">
            {setup.table === "ok" ? "：建好了" : setup.table === "missing" ? "：还没建。把通知那段 SQL（push.sql）在 SQL Editor 里跑一遍" : "：读不到"}
          </PushStep>
          <PushStep done={setup.fn === "ok"} title="小后端">
            {setup.fn === "ok"
              ? "：接上了"
              : setup.fn === "unreachable"
              ? "：连不上。Edge Functions 里要有一个叫 push 的函数；有了还这样，多半是网络，过一会儿再看"
              : setup.fn === "auth"
              ? "：登录过期了，重新登录一下"
              : setup.fn === "wrong"
              ? "：函数建了，里面的代码却不是开封府的那份。打开 push 函数的 Code，把里面的字全删掉，换成我给的那份，再点 Deploy"
              : "：不肯答"}
          </PushStep>
          <PushStep done={setup.keys === "ok"} title="钥匙">
            {setup.keys === "ok"
              ? "：放好了"
              : setup.keys === "missing"
              ? "：还没放。点下面生成一份"
              : setup.keys === "bad"
              ? "：放的不对"
              : "：小后端接上了才看得到"}
          </PushStep>
          {setup.say && setup.keys !== "missing" && setup.fn !== "wrong" && (
            <div className="kfs-push-say" style={{ ...small, marginTop: 4 }}>
              它说：{setup.say}
            </div>
          )}
        </div>
      )}
      {state === "away" && <div style={PUSH_CARD}>这台设备开着通知，可这会儿连不上后端，多半是网络。过一会儿再看。</div>}
      {state === "denied" && <div style={PUSH_CARD}>{PUSH_DENIED}</div>}
      {state === "off" && (
        <div style={PUSH_CARD}>
          现在关着。打开以后，{st.replyReady ? "他回话的时候你不在开封府，这台设备会收到横幅，上面写着他说的话。" : "这台设备能收到开封府的系统通知。"}
        </div>
      )}
      {state === "on" && (
        <div style={PUSH_CARD}>
          这台设备开着通知。
          {st.replyReady && (
            <div className="kfs-push-reply" data-ready="yes" style={small}>
              {setup.bubbles === "ok" ? "他回话的时候你不在开封府，会敲你：他说几句就敲几条，横幅上写着他说的话。发完话就可以切走、锁屏。" : "他回话的时候你不在开封府，会敲你，横幅上写着他说的话。发完话就可以切走、锁屏。"}
            </div>
          )}
          {/* 小后端里还是早一些的那份代码：照旧能用，只是他说几句都并成一条敲。想要一句一条，换成新的那份 */}
          {st.replyReady && setup.bubbles !== "ok" && (
            <div className="kfs-push-bubbles" style={small}>
              小后端还是上一版的：他说几句都并成一条敲。想要一句一条，打开 push 函数的 Code，把里面的字全删掉，换成新的那份，再点 Deploy。
            </div>
          )}
        </div>
      )}
      {/* 测试通知通了，他的回话还敲不了她：还差哪一样，在 Supabase 里补上 */}
      {(state === "on" || state === "off") && !st.replyReady && (
        <div className="kfs-push-reply" data-ready="no" style={{ ...PUSH_CARD, marginTop: 10 }}>
          <div style={{ marginBottom: 4 }}>他的回话还敲不了你，还差：</div>
          <PushStep done={setup.mail === "ok"} title="信箱">
            {setup.mail === "ok" ? "：建好了" : setup.mail === "missing" ? "：还没建。把信箱那段 SQL（mailbox.sql）在 SQL Editor 里跑一遍" : "：读不到，过一会儿再看"}
          </PushStep>
          <PushStep done={setup.relay === "ok"} title="小后端">
            {setup.relay === "ok" ? "：是新的" : "：还是旧的那份。打开 push 函数的 Code，把里面的字全删掉，换成新的那份，再点 Deploy"}
          </PushStep>
          <div style={{ ...small, marginTop: 4 }}>差着的时候聊天照常，只是你切走以后他的回话到不了。</div>
        </div>
      )}

      {secrets && state === "setup" && (
        <div className="kfs-push-secrets" style={{ marginTop: 10 }}>
          {/* 不用输入框摆：字小的输入框在 iPhone 上一点就把整页放大。就是一段选得中的字 */}
          <pre
            aria-label="贴进密钥柜的三行"
            style={{ ...field, margin: 0, fontSize: 11.5, lineHeight: 1.5, fontFamily: "ui-monospace,Menlo,monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", userSelect: "text", WebkitUserSelect: "text" }}
          >
            {secrets}
          </pre>
          <p style={{ ...small, marginTop: 6 }}>
            三行一起复制，到 Supabase 的 Edge Functions → Secrets，在 Name 那一格里粘贴（会自己分成三条），点 Save，再回来。第三行是苹果要的联系邮箱，填的是你的登录邮箱，想换别的就改这一行。钥匙只用生成这一回；这三行别发给别人。
          </p>
        </div>
      )}

      <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10 }}>
        {state === "setup" && setup.keys !== "ok" && !secrets && (
          <button onClick={makeKeys} disabled={!!busy} className="kfs-tap" style={{ ...chip, opacity: busy ? 0.5 : 1 }}>
            {busy === "keys" ? "正在生成…" : "生成一份钥匙"}
          </button>
        )}
        {state === "setup" && secrets && (
          <button onClick={() => onCopy(secrets)} className="kfs-tap" style={chipPrimary}>
            复制这三行
          </button>
        )}
        {(state === "setup" || state === "denied" || state === "away" || (state === "off" && !st.replyReady)) && (
          <button onClick={() => act("check", refresh)} disabled={!!busy} className="kfs-tap" style={{ ...chip, opacity: busy ? 0.5 : 1 }}>
            {busy === "check" ? "正在看…" : "再看一次"}
          </button>
        )}
        {state === "off" && (
          <button onClick={enable} disabled={!!busy} className="kfs-tap" style={{ ...chipPrimary, opacity: busy ? 0.6 : 1 }}>
            {busy === "enable" ? "正在开启…" : "开启通知"}
          </button>
        )}
        {state === "on" && (
          <>
            <button onClick={() => test(0)} disabled={!!busy || waitFrom !== null} className="kfs-tap" style={{ ...chip, opacity: busy || waitFrom !== null ? 0.5 : 1 }}>
              {busy === "test" ? "正在发…" : "发一条测试通知"}
            </button>
            <button onClick={() => test(10)} disabled={!!busy || waitFrom !== null} className="kfs-tap" style={{ ...chip, opacity: busy || waitFrom !== null ? 0.5 : 1 }}>
              {waitFrom !== null ? "等它发出去…" : "十秒后再发"}
            </button>
            <button onClick={disable} disabled={!!busy} className="kfs-tap" style={{ ...chip, color: T.inkSoft, opacity: busy ? 0.5 : 1 }}>
              {busy === "off" ? "正在关…" : "关掉"}
            </button>
            {!st.replyReady && (
              <button onClick={() => act("check", refresh)} disabled={!!busy} className="kfs-tap" style={{ ...chip, opacity: busy ? 0.5 : 1 }}>
                {busy === "check" ? "正在看…" : "再看一次"}
              </button>
            )}
          </>
        )}
      </div>
      {state === "on" && <p style={{ ...small, marginTop: 8 }}>“十秒后再发”是留给锁屏的：点完就把屏幕锁上，看横幅到不到。</p>}

      {/* 她是点着测试通知回到开封府的（这次打开以来）：横幅到了、点了回得来，两头都验着了 */}
      {back > 0 && state === "on" && (
        <div className="kfs-push-back" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 8, color: T.ink }}>
          你是点着测试通知回来的（{timeAgo(back)}）：横幅到了，点了也回得来，这条路全通了。
        </div>
      )}
      {shown && (
        <div className="kfs-push-note" data-ok={shown.ok ? "yes" : "no"} style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 8, color: shown.ok ? T.ink : "#A8473D" }}>
          {shown.when ? `上一回（${timeAgo(shown.when)}）：` : ""}
          {shown.say}
        </div>
      )}

      <button onClick={() => setDetail(!detail)} className="kfs-push-more" style={{ ...small, marginTop: 8, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {detail ? "收起细节" : "看细节"}
      </button>
      {detail && (
        <div className="kfs-push-detail" style={{ ...small, marginTop: 6, userSelect: "text", WebkitUserSelect: "text" }}>
          {describePush(st)
            .concat(mailStatus ? [describeMail(mailStatus())].filter(Boolean) : [])
            .map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          <div>哪一步卡住了，把这几行截图给我。</div>
        </div>
      )}
    </div>
  );
}

function ModelPanel({ current, onPick }) {
  const [custom, setCustom] = useState(MODELS.find((m) => m.id === current) ? "" : current);
  return (
    <div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {MODELS.map((m) => {
          const active = current === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onPick(m.id)}
              className="flex items-center text-left"
              style={{ ...glass(active ? 0.62 : 0.36, 14), borderRadius: 16, padding: "11px 14px", gap: 10 }}
            >
              <span className="flex-1 min-w-0">
                <span className="block" style={{ fontSize: 15, color: T.ink }}>
                  {m.label}
                </span>
                <span className="block" style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>
                  {m.note}
                </span>
              </span>
              {active && <Icon name="check" size={18} color={T.dai} sw={2.2} />}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>其他模型ID（以后出新模型时用）</div>
        <div className="flex" style={{ gap: 8 }}>
          <input className="kfs-field" value={custom} onChange={(e) => setCustom(e.target.value.trim())} placeholder="claude-…" autoCapitalize="off" autoCorrect="off" style={field} />
          <button onClick={() => custom && onPick(custom)} className="kfs-tap flex-shrink-0" style={chipPrimary}>
            用这个
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================
//   主体
// =========================================================
const DEFAULT_SETTINGS = { model: DEFAULT_MODEL, maxTokens: 2048, mcps: DEFAULT_MCPS };

export default function App({ account = {} }) {
  const rootRef = useRef(null);
  const theme = useTheme();
  const [W, setW] = useState(390);
  const drawerW = Math.round(W * 0.82);

  const [splash, setSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);

  const [index, setIndex] = useState([]);
  const indexRef = useRef([]);
  const [chatId, setChatId] = useState(() => newId());
  const chatIdRef = useRef(chatId);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const [avatars, setAvatars] = useState({ her: null, him: HIS_DEFAULT });
  const avatarsRef = useRef({ her: null, him: HIS_DEFAULT });
  const [names, setNames] = useState({ her: "", him: "" }); // 两个人的昵称，空的就是默认（见 names.js）
  const namesRef = useRef({ her: "", him: "" });
  const [extraMemes, setExtraMemes] = useState([]);
  const [memFiles, setMemFiles] = useState([]);
  const memFilesRef = useRef([]);
  const [memTexts, setMemTexts] = useState({});
  const memTextsRef = useRef({});
  const [memNote, setMemNote] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragX, setDragX] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memePanel, setMemePanel] = useState(false);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  // 他回着的工夫里她又说了话、要等这一回完了接着回的那几段对话（对话的编号）。记是哪一段：
  // 话交出去以后她可能翻到别的对话去了，轮到的时候得回对那一段（见 nextPending）
  const pendingRef = useRef(new Set());
  const timerRef = useRef(null);
  // 她发完话、停手那两秒多：话还排着队没发出去（timerRef 走着）。画面上要知道，停键从这儿就出来
  const [queued, setQueued] = useState(false);
  // 正等着的那一回：{ ctl, stopped }。ctl 是她按停的时候要拉的那根线（AbortController）；stopped：她按过停了（见 stopReply）
  const reqRef = useRef(null);
  const keyWas = useRef({ now: "", from: "", at: -Infinity }); // 最右边那个键眼下是哪一样、从哪一样变来的、什么时候变的（见 KEY_SETTLE）
  const freshRef = useRef(null); // 刚摆出来、开始蹦的那一条回话：{ id, at }（见 stopReply）
  const flagsRef = useRef({ noCache: false });
  const [reveal, setReveal] = useState(null);
  const [errorNote, setErrorNote] = useState("");
  const [storageOk, setStorageOk] = useState(true);
  const [storageBanner, setStorageBanner] = useState(false);
  const [openThinking, setOpenThinking] = useState({});
  const [clearArmed, setClearArmed] = useState(false);
  const [testNote, setTestNote] = useState("");
  const [testing, setTesting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // 照片与语音
  const [attach, setAttach] = useState([]);
  const [imgs, setImgs] = useState({});
  const imgsRef = useRef({});
  // 她发过的文档的全文：{ 文档 id: 全文 }，没存下来的记成 false
  const [docs, setDocs] = useState({});
  const docsRef = useRef({});
  const [docView, setDocView] = useState(null); // 点开看的那一份
  const [viewer, setViewer] = useState(null);
  const photoInputRef = useRef(null);
  const [voiceNote, setVoiceNote] = useState("");
  const [dictating, setDictating] = useState(false);
  const [recording, setRecording] = useState(null);
  const recordingRef = useRef(null);
  const recRef = useRef(null);
  const dictBaseRef = useRef("");
  const [, setTick] = useState(0);
  const [menu, setMenu] = useState(null);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [diaryToday, setDiaryToday] = useState({ her: false, him: false });
  const diaryCache = useRef({});
  const dayMsgsRef = useRef({});
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState("");
  const [noticeMark, setNoticeMark] = useState(""); // 她是点了哪条通知回来的（通知网址后面的记号）
  const [booted, setBooted] = useState(false); // 开机那一遍读完了（目录、上次那段对话都在了）
  const relayRef = useRef(null); // 替她等回话的那条新路（见 getRelay）
  const mailBusy = useRef(false); // 正在看信箱
  const mailAgain = useRef(false); // 看的工夫里又有人要看：这一遍看完马上再看一遍
  const mailLater = useRef(false); // 信箱里有一封，这台设备上的那段对话还没跟上：等同步下来再放
  const mailTimer = useRef(null);
  const tagsRef = useRef({}); // 对话的编号 → 通知网址里认它的那串字
  const forkRef = useRef(null); // 正在重新回答的那段对话：{ chat, full }，full 是点“重新回答”那一刻的整段（见 saveChat）
  const backAtRef = useRef(-Infinity); // 上一回从后台回到眼前是几点
  const memesReady = useRef(null); // 仓库里新加的表情包读回来没有（读不回来也算完）
  const mailGate = useRef(null); // 头一遍看信箱之前要等的那一下（见 checkMail）
  const backResend = useRef(new Set()); // 她不在眼前的时候没送成的那几句是哪几段对话的：等她回来再发（见 askGuangyi、resendSoon）
  const orphansRef = useRef(new Set()); // 上回打开时没送到、这回已经替她补发过的那几回（一回只补一次，见 checkMail）
  const bannerTimers = useRef([]); // 收横幅：过一会儿再收的那两遍（见 tidyBanners）
  const latest = useRef({}); // 最新一遍画面里的那几个函数（给一开机就挂上的监听用，免得它们拿着旧的）
  const [noticeBack, setNoticeBack] = useState(0); // 这次打开以来，上一回点着测试通知回来是什么时候（通知面板里要说）
  const [copySheet, setCopySheet] = useState("");
  const [fillOn, setFillOn] = useState(() => gapInfo().fill);
  const [chatMenu, setChatMenu] = useState(null); // 长按一段对话弹出来的小菜单
  const [renaming, setRenaming] = useState(null); // 正在改名的那段对话
  const [usage, setUsage] = useState(null);
  const [monthUsage, setMonthUsage] = useState(null);
  const [sync, setSync] = useState({ pending: 0, syncing: false, offline: false, lastSync: 0 });
  const [logoutArmed, setLogoutArmed] = useState(false);
  const [backupNote, setBackupNote] = useState("");
  const thumbsRef = useRef({});
  const importRef = useRef(null);

  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const listMount = useRef(Date.now());
  const touch = useRef(null);
  // 聊天记录怎么滚（见 scroll.js）：她在最底下就跟着最新，往上翻了就不拽她。
  // away：她翻上去了，输入框上面浮出“回到最新”的圆钮
  const [away, setAway] = useState(false);
  const rowsRef = useRef(null); // 聊天记录里面装着一条条话的那一层（量它多高）
  const followRef = useRef(null);
  if (!followRef.current) {
    followRef.current = createFollow({
      el: () => scrollRef.current,
      onAway: setAway,
      raf: (fn) => requestAnimationFrame(fn),
      caf: (id) => cancelAnimationFrame(id),
      now: () => performance.now(),
      still: () => {
        try {
          return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch (e) {
          return false;
        }
      },
      // 叫聊天记录把惯性停下：先不许它滚（位置不变），画过一帧再放开。iPhone 上停惯性的老办法：
      // 不许滚的那一帧，系统把它那个会滚的盒子整个拆了，惯性跟着没了；放开以后再搭一个新的，位置照旧。
      // 两个方向一起写：只写竖着的，横着万一也滚得动，盒子拆不掉。
      // 要等两回动画帧：头一回还赶在画之前，那时候就放开的话，系统压根没见着“不许滚”
      halt: (el) => {
        el.style.overflow = "hidden";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            el.style.overflow = "";
          })
        );
      },
    });
  }
  const follow = followRef.current;

  // messagesRef 是眼下这段对话最新的那一份，改对话的每一处都是先改它、再 setMessages。
  // 这里原来另有一句“每画一遍，把它照画面上的那份对一遍”。那一句会把它往回拨：
  // 回话到手、先放进 messagesRef、正存着的那几毫秒里，要是正好有一遍旧的画面画出来（她刚发了个表情包），
  // 它就被拨回没有回话的那一份，接下来不管是再发话、还是照它去摆画面，那条回话就丢了。所以拿掉了，只认“先改它”这一条

  const allMemes = useMemo(() => MEME_DATA.concat(extraMemes), [extraMemes]);
  const memeLookup = (file) => MEME_MAP[file] || extraMemes.find((m) => m.file === file) || null;
  // 同一件事，但不靠“这一遍画面”里的那份：开机时挂上的活（看信箱、守着上一回）拿的是最早那遍画面，那时仓库里新加的表情包还没读回来
  const extraMemesRef = useRef([]);
  extraMemesRef.current = extraMemes;
  const memeKnown = (file) => !!(MEME_MAP[file] || extraMemesRef.current.find((m) => m.file === file));

  const markStorageFail = () => {
    setStorageOk(false);
    setStorageBanner(true);
  };

  // ---- 昵称：从存档里读（开机时、别的设备改了以后） ----
  const loadNames = async () => {
    const her = cleanName((await store.get(NAME_KEYS.her)) || "");
    const him = cleanName((await store.get(NAME_KEYS.him)) || "");
    const nm = { her: her === HER_NAME ? "" : her, him: him === HIS_NAME ? "" : him };
    namesRef.current = nm;
    setNames(nm);
  };

  // ---- 量宽度 ----
  useEffect(() => {
    const measure = () => {
      if (rootRef.current) setW(rootRef.current.offsetWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ---- 时钟：跨过零点天数自己加一 ----
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // ---- 开机 ----
  useEffect(() => {
    (async () => {
      const list = safeParse(await store.get("kfs2:index"), []) || [];
      indexRef.current = list;
      setIndex(list);

      const st = safeParse(await store.get("kfs2:settings"), null) || {};
      const merged = { ...DEFAULT_SETTINGS, ...st };
      if (!Array.isArray(merged.mcps)) merged.mcps = DEFAULT_MCPS;
      delete merged.nowPlaying;
      delete merged.apiMode;
      delete merged.apiKey;
      if (!merged.maxTokens) merged.maxTokens = 2048;
      settingsRef.current = merged;
      setSettings(merged);

      const ah = safeParse(await store.get("kfs2:avatar:her"), null);
      const am = safeParse(await store.get("kfs2:avatar:guangyi"), null);
      const bootAv = { her: ah, him: am && am.type === "meme" ? am : HIS_DEFAULT };
      avatarsRef.current = bootAv;
      setAvatars(bootAv);
      await loadNames();

      const mu = safeParse(await store.get(usageKey()), null);
      if (mu) setMonthUsage(mu);
      for (const k of store.keys("kfs2:memethumb:")) {
        const v = await store.get(k);
        if (v) thumbsRef.current[k.slice(15)] = v;
      }

      // 日记本：今天写了没
      const tk = dayKeyOf(new Date());
      const dm = safeParse(await store.get("kfs2:diary:" + tk.slice(0, 7)), {}) || {};
      diaryCache.current[tk.slice(0, 7)] = dm;
      const td = dm[tk] || {};
      setDiaryToday({ her: !!(td.her && (td.her.text || (td.her.moods || []).length)), him: !!(td.him && td.him.text) });

      // 记忆库
      const mi = safeParse(await store.get("kfs2:memindex"), []) || [];
      const texts = {};
      for (const f of mi) {
        const t = await store.get("kfs2:mem:" + f.id);
        if (t != null) texts[f.id] = t;
      }
      const files = mi.filter((f) => texts[f.id] != null);
      memFilesRef.current = files;
      memTextsRef.current = texts;
      setMemFiles(files);
      setMemTexts(texts);

      const lastId = await store.get("kfs2:lastChat");
      if (lastId && list.find((c) => c.id === lastId)) {
        const msgs = safeParse(await store.get("kfs2:chat:" + lastId), []) || [];
        chatIdRef.current = lastId;
        messagesRef.current = msgs;
        setChatId(lastId);
        setMessages(msgs);
        loadImagesFor(msgs);
      }

      // 部署之后才能联网同步新表情包，预览环境里这一步会安静地失败
      memesReady.current = fetch(RAW_BASE + "README.md")
        .then((r) => (r.ok ? r.text() : ""))
        .then((txt) => {
          if (txt) {
            const fresh = newMemesFrom(parseReadme(txt));
            extraMemesRef.current = fresh;
            setExtraMemes(fresh);
          }
        })
        .catch(() => {});

      setBooted(true);
    })();
  }, []);

  // ---- 别的设备改了东西：拉下来之后跟着刷新 ----
  useEffect(() => {
    const offStatus = store.onStatus((st) => setSync(st));
    const off = store.subscribe(async (keys) => {
      const has = (p) => keys.some((k) => k === p || k.startsWith(p));
      if (has("kfs2:index") || has("kfs2:chat:")) {
        const remoteList = safeParse(await store.get("kfs2:index"), []) || [];
        const ids = new Set(remoteList.map((c) => c.id));
        const keep = indexRef.current.filter((c) => !ids.has(c.id) && store.keys("kfs2:chat:" + c.id).length);
        const merged = remoteList
          .filter((c) => store.keys("kfs2:chat:" + c.id).length)
          .concat(keep)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        indexRef.current = merged;
        setIndex(merged);
      }
      if (keys.includes("kfs2:settings")) {
        const st = safeParse(await store.get("kfs2:settings"), null);
        if (st) {
          const m = { ...DEFAULT_SETTINGS, ...st };
          delete m.apiMode;
          delete m.apiKey;
          settingsRef.current = m;
          setSettings(m);
        }
      }
      if (has("kfs2:avatar:")) {
        const ah = safeParse(await store.get("kfs2:avatar:her"), null);
        const am = safeParse(await store.get("kfs2:avatar:guangyi"), null);
        const av = { her: ah, him: am && am.type === "meme" ? am : HIS_DEFAULT };
        avatarsRef.current = av;
        setAvatars(av);
      }
      if (has("kfs2:name:")) await loadNames();
      if (has("kfs2:memindex") || has("kfs2:mem:")) {
        const mi = safeParse(await store.get("kfs2:memindex"), []) || [];
        const texts = {};
        for (const f of mi) {
          const t = await store.get("kfs2:mem:" + f.id);
          if (t != null) texts[f.id] = t;
        }
        const files = mi.filter((f) => texts[f.id] != null);
        memFilesRef.current = files;
        memTextsRef.current = texts;
        setMemFiles(files);
        setMemTexts(texts);
      }
      if (has("kfs2:diary:")) {
        diaryCache.current = {};
        const tk = dayKeyOf(new Date());
        const dm = safeParse(await store.get("kfs2:diary:" + tk.slice(0, 7)), {}) || {};
        const td = dm[tk] || {};
        setDiaryToday({ her: !!(td.her && (td.her.text || (td.her.moods || []).length)), him: !!(td.him && td.him.text) });
      }
      if (has("kfs2:usage:")) {
        const mu = safeParse(await store.get(usageKey()), null);
        if (mu) setMonthUsage(mu);
      }
      for (const k of keys) {
        if (k.startsWith("kfs2:memethumb:")) {
          const v = await store.get(k);
          if (v) thumbsRef.current[k.slice(15)] = v;
        }
        if (k.startsWith("kfs2:img:")) {
          const v = await store.get(k);
          imgsRef.current = { ...imgsRef.current, [k.slice(9)]: v || false };
          setImgs(imgsRef.current);
        }
        if (k.startsWith(DOC_KEY)) {
          const v = await store.get(k);
          docsRef.current = { ...docsRef.current, [k.slice(DOC_KEY.length)]: v || false };
          setDocs(docsRef.current);
        }
      }
      const cur = "kfs2:chat:" + chatIdRef.current;
      if (keys.includes(cur) && !loadingRef.current && !timerRef.current) {
        const msgs = safeParse(await store.get(cur), null);
        if (msgs) {
          messagesRef.current = msgs;
          setMessages(msgs);
          loadImagesFor(msgs);
          // 别的设备已经把回话放进来了：底下那句“消息没送到…点这里重发”就不该留着
          if (!needsReply(msgs)) setErrorNote("");
        }
      }
      // 信箱里有一封在等这段对话同步下来：现在再看一遍
      if (mailLater.current && has("kfs2:chat:") && latest.current.checkMail) {
        mailLater.current = false;
        latest.current.checkMail();
      }
    });
    return () => {
      off();
      offStatus();
    };
  }, []);

  // ---- 对话存取 ----
  const saveChat = async (id, msgs) => {
    // 正在重新回答的那段对话：画面上先把旧回答收起来了（msgs 里没有它），存档不能跟着丢。
    // 这工夫里存的是原来那一整段，加上她新说的；新回答到了（forkRef 清掉以后）再整段换上。
    // 不然她这时候发一句话、开封府又被系统收掉，旧回答连同它的几个版本就没了
    const fk = forkRef.current;
    let keep = msgs;
    if (fk && fk.chat === id) {
      const had = new Set(fk.full.map((m) => m.id));
      keep = fk.full.concat(msgs.filter((m) => !had.has(m.id)));
    }
    const ok = await store.set("kfs2:chat:" + id, JSON.stringify(keep));
    if (!ok) markStorageFail();
    const prev = indexRef.current;
    const old = prev.find((c) => c.id === id);
    const entry = {
      id,
      title: old && old.title ? old.title : makeTitle(msgs, memeLookup),
      preview: makePreview(msgs),
      updatedAt: Date.now(),
    };
    const next = [entry].concat(prev.filter((c) => c.id !== id));
    indexRef.current = next;
    setIndex(next);
    store.set("kfs2:index", JSON.stringify(next));
    // 上次停在哪段：只认眼前这一段（信箱里取出来放进别的对话的、她翻走以后才到的回话，不改这个）
    if (chatIdRef.current === id) store.set("kfs2:lastChat", id);
  };

  // 翻到别的对话之前，把还没来得及回的那几条先送出去。
  // 他正回着（上一句的回话还没到）：这一段记下来，等那一回完了替它回（见 nextPending）
  const flushPending = () => {
    if (!disarm()) return;
    const msgs = messagesRef.current;
    if (owes(msgs)) {
      if (loadingRef.current) pendingRef.current.add(chatIdRef.current);
      else askGuangyi(chatIdRef.current, msgs);
    } else if (!loadingRef.current) nextPending(); // 这一段用不着回了：别的等着的那几段接着轮
  };

  const openChat = async (id) => {
    flushPending();
    setEditing(null);
    setMenu(null);
    chatIdRef.current = id;
    listMount.current = Date.now();
    setChatId(id);
    setReveal(null);
    setErrorNote("");
    setMemePanel(false);
    setHistoryOpen(false);
    setDrawerOpen(false);
    const msgs = safeParse(await store.get("kfs2:chat:" + id), []) || [];
    if (chatIdRef.current === id) {
      messagesRef.current = msgs;
      setMessages(msgs);
      loadImagesFor(msgs);
    }
    store.set("kfs2:lastChat", id);
    // 信箱里要是有这段对话的东西（他还没回完的那一回、没回成的那一封），现在轮到它了
    if (latest.current.checkMail) latest.current.checkMail();
  };

  const loadImagesFor = async (msgs) => {
    loadDocsFor(msgs);
    const ids = msgs
      .filter((m) => m.role === "her" && m.kind === "photo" && m.imgId && imgsRef.current[m.imgId] === undefined)
      .map((m) => m.imgId);
    if (!ids.length) return;
    const add = {};
    for (const id of ids) {
      const d = await store.get("kfs2:img:" + id);
      add[id] = d || false;
    }
    imgsRef.current = { ...imgsRef.current, ...add };
    setImgs(imgsRef.current);
  };
  const imgLookup = (id) => imgsRef.current[id] || null;

  // 她发过的文档也一样：全文另存着，打开对话时取出来
  const loadDocsFor = async (msgs) => {
    const ids = msgs
      .filter((m) => m.role === "her" && m.kind === "doc" && m.docId && docsRef.current[m.docId] === undefined)
      .map((m) => m.docId);
    if (!ids.length) return;
    const add = {};
    for (const id of ids) {
      const d = await store.get(DOC_KEY + id);
      add[id] = d || false;
    }
    docsRef.current = { ...docsRef.current, ...add };
    setDocs(docsRef.current);
  };
  const docLookup = (id) => docsRef.current[id] || null;

  const newChat = () => {
    flushPending();
    setEditing(null);
    setMenu(null);
    const id = newId();
    chatIdRef.current = id;
    listMount.current = Date.now();
    messagesRef.current = [];
    setChatId(id);
    setMessages([]);
    setReveal(null);
    setErrorNote("");
    setMemePanel(false);
    setHistoryOpen(false);
    setDrawerOpen(false);
  };

  const deleteChat = async (id) => {
    // 删的是眼前这一段、它的话正排着队：不发了。别的对话里要是还有话等着轮到，接着轮
    if (id === chatIdRef.current && disarm() && !loadingRef.current) nextPending();
    const old = safeParse(await store.get("kfs2:chat:" + id), []) || [];
    collectImgIds(old).forEach((imgId) => store.del("kfs2:img:" + imgId));
    collectDocIds(old).forEach((docId) => store.del(DOC_KEY + docId));
    const next = indexRef.current.filter((c) => c.id !== id);
    indexRef.current = next;
    setIndex(next);
    store.set("kfs2:index", JSON.stringify(next));
    store.del("kfs2:chat:" + id);
    if (id === chatIdRef.current) newChat();
  };

  // 改名：只改目录里的名字，聊天内容不动；以后再存这段对话也沿用新名字
  const renameChat = (id, title) => {
    const t = String(title || "").trim().slice(0, 40);
    if (!t) return;
    const next = indexRef.current.map((c) => (c.id === id ? { ...c, title: t } : c));
    indexRef.current = next;
    setIndex(next);
    store.set("kfs2:index", JSON.stringify(next));
  };

  // ---- 光义回话 ----
  // 只负责向那边要一条回复，成功返回整理好的回复，失败抛错
  const thumbLookup = (file) => thumbsRef.current[file] || null;

  const ensureMemeThumb = async (file) => {
    if (!file || MEME_MAP[file] || thumbsRef.current[file]) return;
    try {
      const data = await Promise.race([
        urlToThumb(RAW_BASE + file),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
      ]);
      thumbsRef.current[file] = data;
      store.set("kfs2:memethumb:" + file, data);
    } catch (e) {}
  };

  const recordUsage = (data) => {
    const u = data && data.usage;
    if (!u) return;
    const cost = costOf(data.model, u);
    setUsage({ model: data.model, ...u, cost });
    if (cost == null) return;
    const key = usageKey();
    setMonthUsage((prev) => {
      const base = prev && prev.month === key ? prev : { month: key, cost: 0, replies: 0 };
      const next = { month: key, cost: base.cost + cost, replies: base.replies + 1 };
      store.set(key, JSON.stringify(next));
      return next;
    });
  };

  // ---- 替她等回话的那条新路（见 mail.js）：用到的浏览器和云端的东西在这里递进去 ----
  const getRelay = () => {
    if (!relayRef.current) {
      relayRef.current = createRelay({
        callReply,
        box: mailbox,
        seal: (text) => store.seal(text),
        unseal: (sealed) => store.unseal(sealed),
        nameFor: (name) => store.nameFor(name),
        visible: () => document.visibilityState === "visible",
        online: () => navigator.onLine !== false,
        sinceBack: () => Date.now() - backAtRef.current,
        probe: probeReply,
        knock: knockList,
        onVisible: (fn) => {
          const h = () => {
            if (document.visibilityState === "visible") fn();
          };
          document.addEventListener("visibilitychange", h);
          return () => document.removeEventListener("visibilitychange", h);
        },
        now: () => Date.now(),
        sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
        storage: {
          get: () => {
            try {
              return localStorage.getItem(JOBS_KEY) || "";
            } catch (e) {
              return "";
            }
          },
          set: (text) => {
            try {
              if (text) localStorage.setItem(JOBS_KEY, text);
              else localStorage.removeItem(JOBS_KEY);
            } catch (e) {}
          },
        },
        hint: {
          get: () => {
            try {
              return localStorage.getItem(RELAY_KEY) === "ok";
            } catch (e) {
              return false;
            }
          },
          set: (works) => {
            try {
              if (works) localStorage.setItem(RELAY_KEY, "ok");
              else localStorage.removeItem(RELAY_KEY);
            } catch (e) {}
          },
        },
        // 她按了停的那几回：记在这台设备上，以后在信箱里再碰上，见一回收一回
        halted: {
          get: () => {
            try {
              return localStorage.getItem(HALTED_KEY) || "";
            } catch (e) {
              return "";
            }
          },
          set: (text) => {
            try {
              localStorage.setItem(HALTED_KEY, text);
            } catch (e) {}
          },
        },
        freshToken,
        // 信箱里没有这一回了：先同步一遍，看是不是别的设备已经把回话取走、放进对话了。
        // 对话里有 jobs 里哪一回的回话，就是回上了（重新回答只能这么认：那一句后面本来就有回话）；
        // 平常的回话再看一眼那一句后面是不是已经有了他的话
        answered: async (chat, last, fork, jobs) => {
          try {
            await store.syncNow();
          } catch (e) {}
          const msgs = safeParse(await store.get("kfs2:chat:" + chat), []) || [];
          return (jobs || []).some((j) => hasJob(msgs, j)) || (!fork && answeredAfter(msgs, last));
        },
      });
    }
    return relayRef.current;
  };

  // 把那边回来的一整段整理成对话里的一条。
  // used：最后用的哪种写法（带没带缓存、带没带工具）；ctx：发的时候记下的（接没接工具、工具的名字）；
  // job：走新路的那一回的编号（走老路的没有）；ts：这条算几点到的
  const digestReply = (data, used, ctx, job, ts) => {
    recordUsage(data);
    const slugToName = (ctx && ctx.slugs) || {};
    const usedTools = Array.from(
      new Set(
        (data.content || [])
          .filter((b) => b.type === "mcp_tool_use")
          .map((b) => slugToName[b.server_name] || b.server_name || b.name)
      )
    );
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = parseReply(text);
    // 回复到长度上限被截断了：最后那份文档就算结尾的记号写上了，也记成没写完
    if (data.stop_reason === "max_tokens") {
      const lastDoc = parsed.items.filter((it) => it.type === "doc").pop();
      if (lastDoc && parsed.items[parsed.items.length - 1] === lastDoc) lastDoc.cut = true;
    }
    const settled = settleAvatarItems(parsed.items, memeKnown);
    // 他换头像时也记下换之前那张（见 buildMessages）
    const prevHim = avatarsRef.current.him || null;
    const him = {
      // 走新路的，编号定了这一条的 id：两台设备各取一遍同一封信，放进对话的是同一条
      id: job ? "r" + job : newId(),
      role: "him",
      ts: ts || Date.now(),
      items: settled.items.map((it) => (it.type === "avatar" ? { ...it, prev: prevHim } : it)),
      raw: parsed.body,
      thinking: parsed.thinking,
      tools: usedTools,
      toolNote: ctx && ctx.withMcp && !(used && used.mcp) ? "这次MCP没连上，先不用工具回你" : "",
    };
    if (job) him.job = job;
    if (settled.avatarFile) changeHisAvatar({ type: "meme", file: settled.avatarFile });
    // 他给自己改了名字：顶栏马上换；回复上记一笔，对话里留一行提示（和现在一样的不算改）
    if (parsed.rename && parsed.rename !== (namesRef.current.him || HIS_NAME)) {
      him.rename = parsed.rename;
      changeHisName(parsed.rename);
    }
    return him;
  };

  // 向那边要一条回复。成了回 { him, settle }：him 是整理好的回复；settle 是走新路时要在“放进对话、存好”以后叫的。失败抛错。
  // opts.chat 哪段对话；opts.fork 是“重新回答”的话，要换掉的是哪一条；
  // opts.resume 有的话，这一回早就发出去了（上次打开时发的），不用再拼一遍话，守着信箱等就行；
  // opts.recheck 是她点“重发”要的；opts.flushed 是切走的那一下抢着交出去的；
  // opts.signal 是她按停的时候要拉的那根线：拉了，这里抛 code 是 stopped 的错，而且保证不再把回话整理出来
  // （整理回话的那一下会换头像、改名字、记用量：按了停的那一回，这些都不能发生）。
  // 这个保证是下面两头给的：新路 mail.js 的 guarded，老路 cloud.js 的 callClaude，按了停都只抛 stopped、不交回话
  const requestReply = async (msgs, opts = {}) => {
    const signal = opts.signal || null;
    if (opts.resume) {
      const got = await getRelay().resume(opts.resume.job, opts.resume.info, signal);
      return { him: digestReply(got.data, got.used, (got.info && got.info.extra) || null, got.job, got.at ? Math.min(Date.now(), got.at) : 0), settle: got.settle };
    }
    const st = settingsRef.current;
    const model = st.model || DEFAULT_MODEL;
    const mcps = (st.mcps || []).filter((m) => m.enabled && m.url);
    const docs = memFilesRef.current
      .filter((f) => f.enabled)
      .map((f) => ({ name: f.name, content: memTextsRef.current[f.id] || "" }));
    const { staticText, nowNote } = buildSystem({
      now: new Date(),
      memeList: allMemes,
      hisAvatarName: avatarName(avatarsRef.current.him),
      memDocs: docs,
      mcpNames: mcps.map((m) => m.name),
      names: namesRef.current,
      replyCap: replyRoom(st.maxTokens || 2048),
    });
    const apiMessages = buildMessages(msgs, avatarsRef.current, memeLookup, imgLookup, thumbLookup, docLookup);

    // 依次尝试：带缓存 → 不带缓存 → 不带MCP，哪种通了用哪种
    const withMcp = mcps.length > 0;
    const attempts = [];
    if (!flagsRef.current.noCache) attempts.push({ cache: true, mcp: withMcp });
    attempts.push({ cache: false, mcp: withMcp });
    if (withMcp) attempts.push({ cache: false, mcp: false });
    const bodyFor = (at) => {
      const body = {
        model,
        max_tokens: st.maxTokens || 2048,
        system: at.cache ? [{ type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } }] : staticText,
        messages: withNowNote(apiMessages, nowNote, at.cache),
      };
      if (at.mcp) {
        body.mcp_servers = mcps.map((m, i) => {
          const s = { type: "url", url: m.url, name: mcpSlug(m.name, i) };
          if (m.token) s.authorization_token = m.token;
          return s;
        });
        body.tools = body.mcp_servers.map((s) => ({ type: "mcp_toolset", mcp_server_name: s.name }));
      }
      return body;
    };
    const betaFor = (at) => (at.mcp ? "mcp-client-2025-11-20" : "");
    const slugs = {};
    mcps.forEach((m, i) => {
      slugs[mcpSlug(m.name, i)] = m.name;
    });
    const ctx = withMcp ? { withMcp: true, slugs } : null;

    // 新路：把最讲究的那种写法交给小后端，它那头自己照上面三步试（她不在跟前，不能等她回来再换）。
    // 新路不通（它不肯接、它那头没办起来），抛回来的错带着 oldpath，就走下面的老路
    let oldWhy = "";
    if (opts.chat) {
      const first = attempts[0];
      try {
        const got = await getRelay().ask({
          body: bodyFor(first),
          beta: betaFor(first),
          chat: opts.chat,
          last: msgs.length ? msgs[msgs.length - 1].id : "",
          fork: opts.fork || "",
          title: namesRef.current.him || HIS_NAME,
          extra: ctx,
          recheck: !!opts.recheck,
          signal,
        });
        // 和老路上的记性一样：只有“不带缓存、别的照旧”才通的那种，才记下回别带缓存记号。
        // 是工具连不上、摘了工具才通的，不算缓存的毛病；是 Anthropic 一时出岔子、小后端才换的写法（shaky），也不算：
        // 记了的话，它挤上两三秒，她这一趟后面的每句话都不带缓存、按全价算
        if (first.cache && !got.used.cache && !got.used.shaky && !!got.used.mcp === !!first.mcp) flagsRef.current.noCache = true;
        // 从信箱里取的：算小后端放进去那会儿到的（切走半天才回来取，不该显示成刚到）
        return { him: digestReply(got.data, got.used, ctx, got.job, got.at ? Math.min(Date.now(), got.at) : 0), settle: got.settle };
      } catch (e) {
        if (!e || e.code !== "oldpath") throw e;
        // 是切走的那一下抢着交出去的，小后端却没接，页面这会儿还藏着：不从这儿走老路
        // （等着的这头马上就断，那一回白问）。当成没抢着交：照旧等她停手那两秒多再发
        if (opts.flushed && document.visibilityState !== "visible") throw Object.assign(new Error("等她回来再发"), { code: "later" });
        oldWhy = String(e.message || "");
      }
    }

    // 老路：网页自己等着
    let data = null;
    let used = null;
    let lastErr = "";
    for (const at of attempts) {
      try {
        data = await callClaude(bodyFor(at), betaFor(at), signal);
        used = at;
        break;
      } catch (e) {
        lastErr = String((e && e.message) || e);
        if (/登录过期|连不上开封府/.test(lastErr)) break;
      }
    }

    if (!data) throw new Error(lastErr || "没有回应");
    if (attempts[0].cache && used === attempts[1]) flagsRef.current.noCache = true;
    if (opts.chat) getRelay().tookOld(oldWhy);
    return { him: digestReply(data, used, ctx, ""), settle: null };
  };

  // resume：这一回早就发出去了（见 checkMail），守着信箱等它的回话，{ job, info }；
  // how.recheck：是她点“重发”要的；how.flushed：是切走的那一下抢着交出去的
  const askGuangyi = async (id, msgs, resume = null, how = null) => {
    loadingRef.current = true;
    setLoading(true);
    // 底下那句“没送到”是眼前这段对话的：替别的对话在后台回的时候不动它
    if (chatIdRef.current === id) setErrorNote("");
    const req = { ctl: new AbortController(), stopped: false };
    reqRef.current = req;
    try {
      // 回话到手以前她按停：这一句当场以 stopped 收场（作废）。到手以后再按，这里已经过去了，就是“掐断”（见 stopReply）
      const { him, settle } = await unlessStopped(
        requestReply(msgs, { chat: id, resume, recheck: !!(how && how.recheck), flushed: !!(how && how.flushed), signal: req.ctl.signal }),
        req.ctl.signal
      );
      // 回复插在这次请求的最后一条后面；等回复时她又发的几条排在后面
      const anchor = resume ? resume.info.last : msgs.length ? msgs[msgs.length - 1].id : null;
      const isCurrent = chatIdRef.current === id;
      // 她已经翻到别的对话去了：以存档里的为准（等的工夫里她在这段对话里又说的话都在存档里，拿发话那一刻的旧样子去存会把它们盖掉）
      const base = isCurrent ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + id), null) || msgs;
      // 不比她那一句早（从信箱里取的，时间是云端的钟记的）
      const said = base.find((m) => m.id === anchor);
      if (said && him.ts <= said.ts) him.ts = said.ts + 1;
      // 这一回的回话已经在对话里了（信箱那头先放进去的）：不放第二遍
      if (!(him.job && hasJob(base, him.job))) {
        const next = insertReply(base, anchor, him);
        if (isCurrent) messagesRef.current = next;
        await saveChat(id, next);
        if (chatIdRef.current === id) {
          // 摆的是眼下的那一份（messagesRef），不是存之前的 next：存的那一下工夫里对话可能又变了
          // （她按了停、把上一条正在蹦的掐断了；她又发了一句），拿存之前的去摆会把这些盖掉
          setMessages(messagesRef.current);
          // 回话放进去的时候这段对话就在眼前：从头一条开始蹦；存的那一下工夫里她按了停的，照“掐断”办，只留头一条。
          // 放进去的时候不在眼前、存的那一下工夫里她才翻过来的：她看到的已经是整条了，不收回去重蹦
          if (isCurrent) {
            if (req.stopped) cutShort(him.id, 1);
            else startReveal(him.id);
          }
        }
      }
      if (settle) settle();
    } catch (e) {
      if (e && e.code === "stopped") {
        // 她按了停，回话还没到：这一回作废（信箱那头 mail.js 已经收拾了），不报错、不重发、过后也不去信箱里找。
        // 她那句话留着，底下摆一行“停了，点这里让我回”
        markStoppedIn(id);
      } else if (e && e.code === "answered") {
        // 别的设备已经把这一句的回话取走、放进对话了：把同步下来的那份换上来。
        // 等的工夫里她在这台设备上又说的话（同步下来的那份里没有）接在后面，不能丢
        const fresh = safeParse(await store.get("kfs2:chat:" + id), null);
        if (Array.isArray(fresh) && chatIdRef.current === id) {
          const got = new Set(fresh.map((m) => m.id));
          const asked = new Set(msgs.map((m) => m.id));
          const more = messagesRef.current.filter((m) => !got.has(m.id) && !asked.has(m.id));
          const next = fresh.concat(more);
          messagesRef.current = next;
          setMessages(next);
          loadImagesFor(next);
          if (more.length) await saveChat(id, next);
        }
      } else if (e && e.code === "later") {
        // 切走的那一下没交成（见 requestReply）：等她回到眼前再发。
        // 不排定时器：页面藏着的那几秒里定时器照走，到点就从藏着的页面走老路，等着的这头马上断，那一回白问
        if (document.visibilityState === "visible") resendSoon(id);
        else backResend.current.add(id);
      } else if (e && e.code === "offline" && document.visibilityState !== "visible") {
        // 她不在眼前的时候没连上（多半是切走的那一下网正好断了）：这会儿不报错（她回来头一眼看到的不该是一行红字）。
        // 是这台设备自己发的那一回：等她回到眼前再发。那一回还记着：到时候先去信箱里找（万一其实送到了），没有才重发。
        // 是守着的那一回（别处发的、上次打开时发的）：她回来的时候看信箱那一遍会再认出它，接着守
        if (!resume) backResend.current.add(id);
      } else {
        if (chatIdRef.current === id) setErrorNote(`消息没送到（${String(e.message || e).slice(0, 90)}）。点这里重发`);
        // 这一回也许其实已经交给小后端了（只是这头没连上）：过几秒自己去信箱里看一眼，回话在就取出来，不用她点
        clearTimeout(mailTimer.current);
        mailTimer.current = setTimeout(() => latest.current.checkMail(), 4000);
      }
    }
    if (reqRef.current === req) reqRef.current = null;
    loadingRef.current = false;
    setLoading(false);
    nextPending();
  };

  // 这一回完了：他回着的工夫里她又说了话的那几段对话，轮到了。
  // 眼前这一段先来，照旧等一秒多再回（她也许还在打字）；她已经翻走的那一段，替它在后台回（一回办一段，办完了再轮下一段）
  const nextPending = () => {
    const waiting = pendingRef.current;
    if (!waiting.size) return;
    if (waiting.delete(chatIdRef.current)) {
      scheduleReply(1200);
      return;
    }
    const id = waiting.values().next().value;
    waiting.delete(id);
    store.get("kfs2:chat:" + id).then((text) => {
      const msgs = safeParse(text, null);
      if (loadingRef.current) {
        waiting.add(id); // 这一眨眼里别处已经在回了：记回去，它回完会再轮到这里
        return;
      }
      if (Array.isArray(msgs) && owes(msgs)) askGuangyi(id, msgs);
      else nextPending(); // 那一段用不着回了（别处回上了、删了）：轮下一段
    });
  };

  // ---- 重新回答：在这条开新分支，旧的回答留着能翻回去 ----
  const retryAt = async (msgId) => {
    if (loadingRef.current) return;
    const id = chatIdRef.current;
    const full = messagesRef.current;
    const j = full.findIndex((m) => m.id === msgId);
    if (j < 0) return;
    const base = full.slice(0, j);
    if (!needsReply(base)) return;
    disarm();
    loadingRef.current = true;
    setLoading(true);
    setErrorNote("");
    setReveal(null);
    const req = { ctl: new AbortController(), stopped: false };
    reqRef.current = req;
    follow.pin(); // 点了重新回答：新回答接在最后，到底等着看（旧回答一收，她多半已经被浏览器收到底了；这里是把话说死）
    forkRef.current = { chat: id, full }; // 存档里先别丢旧回答（见 saveChat）
    messagesRef.current = base; // 先把旧回答收起来
    setMessages(base);
    // 这工夫里她新说的：眼前（或者存档里）有、点“重新回答”那一刻的整段里没有的那几条
    const had = new Set(full.map((m) => m.id));
    const added = async () => {
      const now = chatIdRef.current === id ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + id), null) || [];
      return now.filter((m) => !had.has(m.id));
    };
    try {
      const { him, settle } = await unlessStopped(requestReply(base, { chat: id, fork: msgId, signal: req.ctl.signal }), req.ctl.signal);
      const extra = await added();
      const next = forkAt(full, j, him).concat(extra);
      forkRef.current = null;
      if (chatIdRef.current === id) {
        messagesRef.current = next;
        setMessages(next);
        startReveal(him.id);
      }
      await saveChat(id, next);
      if (settle) settle();
      // 这工夫里她新说的：等这一回完了接着回。存的那一下工夫里她按了停的话就不接了
      // （那几句在按停的那一下已经记上“停了”：它们那时候不是还排着队，就是已经在等这一回完，见 stopReply）
      if (extra.length && !req.stopped) pendingRef.current.add(id);
    } catch (e) {
      const extra = await added();
      forkRef.current = null;
      const fresh = e && e.code === "answered" ? safeParse(await store.get("kfs2:chat:" + id), null) : null;
      if (Array.isArray(fresh)) {
        // 别的设备已经把这一回的新回答取走、放进对话了：换上同步下来的那份，她这工夫里新说的接在后面
        const got = new Set(fresh.map((m) => m.id));
        const more = extra.filter((m) => !got.has(m.id));
        const next = fresh.concat(more);
        if (chatIdRef.current === id) {
          messagesRef.current = next;
          setMessages(next);
          loadImagesFor(next);
        }
        if (more.length) await saveChat(id, next);
        if (needsReply(next)) pendingRef.current.add(id);
      } else {
        // 没成，或者她按了停：旧回答原样放回来，她这工夫里新说的留着。
        // 按了停的不报错；这工夫里她新说的那几句没人回了，最后一句上记一笔“停了”。
        // （按停的那一下 stopReply 也记过。这段对话她要是已经翻走了，那一笔是改在存档里的，这里手上的 extra 却是它改之前读出来的：
        // 不在这儿再记一遍，下面那一存会把它盖掉）
        const halted = !!(e && e.code === "stopped");
        const back = halted && extra.length ? markStopped(full.concat(extra)) : full.concat(extra);
        if (chatIdRef.current === id) {
          messagesRef.current = back;
          setMessages(back);
          if (!halted) setErrorNote(`重新回答没成功（${String(e.message || e).slice(0, 90)}）`);
        }
        if (extra.length) await saveChat(id, back);
        // 这一回也许其实已经交给小后端了（只是这头没连上）：过几秒自己去信箱里看一眼，新回答在就取出来
        // （她按了停的那一回不会在：信箱那头见一回收一回）
        clearTimeout(mailTimer.current);
        mailTimer.current = setTimeout(() => latest.current.checkMail(), 4000);
      }
    }
    if (reqRef.current === req) reqRef.current = null;
    forkRef.current = null;
    loadingRef.current = false;
    setLoading(false);
    nextPending();
  };

  // ---- 翻版本 ----
  const switchVersion = (msgId, dir) => {
    if (loadingRef.current) return;
    const msgs = messagesRef.current;
    const i = msgs.findIndex((m) => m.id === msgId);
    if (i < 0 || !msgs[i].alts) return;
    const next = switchAlt(msgs, i, msgs[i].altIdx + dir);
    if (next === msgs) return;
    messagesRef.current = next;
    setMessages(next);
    setReveal(null);
    setErrorNote("");
    saveChat(chatIdRef.current, next);
    loadImagesFor(next);
  };

  // ---- 复制 ----
  const copyText = async (text) => {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(text);
      setToast("已复制");
      return;
    } catch (e) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        setToast("已复制");
        return;
      }
    } catch (e) {}
    setCopySheet(text); // 都不行就把字摊开，让她自己选
  };

  // ---- 输入框跟着字数长高（最高 120） ----
  // 量的时候得先把它放成“自己看着办”，读出来再定。放开的那一下它矮回一行，上面的聊天记录跟着高了一截，
  // 浏览器会把聊天记录的位置往回收；再定回去的时候，位置它不一定给放回来（Chrome 会放，iPhone 上不一定）。
  // 不放回来的话，草稿打到两行以上，每敲一个字聊天记录就往下掉一截；掉得超过 64 像素（四五行）还会被当成她翻走了。
  // 所以量之前把聊天记录的位置记下，量完放回去
  const fitComposer = (el) => {
    const list = scrollRef.current;
    const keep = list ? list.scrollTop : 0;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
    if (list && Math.abs(list.scrollTop - keep) >= 1) list.scrollTop = keep;
  };

  // ---- 编辑她发过的话 ----
  const startEdit = (row) => {
    setMenu(null);
    if (loadingRef.current) return;
    setEditing({ id: row.msg.id });
    setInput(row.msg.text || "");
    setAttach([]);
    setMemePanel(false);
    setTimeout(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      fitComposer(el);
    }, 60);
  };
  const cancelEdit = () => {
    setEditing(null);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
  };
  const submitEdit = (t) => {
    // 他正在回话、正在重新回答的时候先不改：对话这会儿还在变（重新回答把旧回答先收起来了），
    // 这时候改，分支会接乱（同一条话在对话里出现两回）。输入框里的字留着，等他回完再点
    if (loadingRef.current) {
      setToast("等他回完再改");
      return;
    }
    const msgs = messagesRef.current;
    const i = msgs.findIndex((m) => m.id === editing.id);
    setEditing(null);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    if (i < 0 || !t || t === msgs[i].text) return;
    disarm();
    // 改出来的是一句新话：原来那句上记的“停了”不带过来
    const { alts, altIdx, stopped, ...node } = msgs[i];
    const next = forkAt(msgs, i, { ...node, id: newId(), text: t, ts: Date.now() });
    messagesRef.current = next;
    follow.pin(); // 改完的这一句成了最后一句：到底
    setMessages(next);
    setErrorNote("");
    saveChat(chatIdRef.current, next);
    if (!loadingRef.current) askGuangyi(chatIdRef.current, next);
  };

  // ---- 她连着发几条，停下来再回 ----
  // how：见 askGuangyi（定时器走完叫的时候不带）
  const triggerReply = (how = null) => {
    if (loadingRef.current) {
      pendingRef.current.add(chatIdRef.current);
      return;
    }
    const msgs = messagesRef.current;
    if (owes(msgs)) askGuangyi(chatIdRef.current, msgs, null, how);
    else nextPending(); // 眼前这一段用不着回了：别的等着的那几段不能跟着干等
  };

  const scheduleReply = (ms) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setQueued(false);
      triggerReply();
    }, ms);
    setQueued(true);
  };
  // 排着队的那一句不等了（马上发、或者不发了）。本来就没排着：回 false
  const disarm = () => {
    if (!timerRef.current) return false;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    setQueued(false);
    return true;
  };

  // ---- 停键 ----
  // 输入框最右边那个键：没字、那边的我在回（她一发完话就算，到回话全蹦完为止）的时候是它。按了，眼下正在办的都停：
  //   排着队还没发的（她刚发完话、停手的那两秒多）：不发了；
  //   正等着回话的：这一回作废，不出回话、不敲手机（信箱那头见 mail.js 的 halt）；重新回答的话，旧回答原样回来；
  //   正一条一条蹦的：掐断，蹦出来的留着，没蹦出来的不要了。
  // 是“停”不是“暂停”，没有“继续”。作废的那一句底下摆一行“停了，点这里让我回”（见 markStoppedIn、askAgain）
  const stopReply = () => {
    // 等着“这一回完了接着回”的那几段：都不回了，各自最后一句底下摆一行“停了”
    const waiting = Array.from(pendingRef.current);
    pendingRef.current.clear();
    const waited = disarm();
    // 正等着的那一回：拉线。回话还没到手，那一回当场以 stopped 收场（见 askGuangyi、retryAt 里接 stopped 的那一段）；
    // 已经到手、正往对话里放（存）的那一下，线拉了也没什么可断的，那一头看到 stopped 这个记号，照“掐断”办
    const req = reqRef.current;
    if (req) {
      req.stopped = true;
      req.ctl.abort();
    }
    // 回话刚摆出来、画面还没来得及重画的那一眨眼里按的停：这一遍画面手里的 reveal 还是旧的，认不出刚摆出来的那一条。
    // 照“掐断”办，只留头一条（不管它的话，后面那句 setReveal(null) 会让整条回话一下子全摆出来）
    const fresh = freshRef.current;
    freshRef.current = null;
    if (fresh && performance.now() - fresh.at < FRESH_MS && !(reveal && reveal.id === fresh.id)) cutShort(fresh.id, 1);
    if (reveal) cutShort(reveal.id, reveal.count);
    setReveal(null);
    if (waited) markStoppedIn(chatIdRef.current);
    waiting.forEach(markStoppedIn);
  };

  // 回话摆出来了：从头一条开始一条一条蹦（见下面“分条”那一段）
  const startReveal = (id) => {
    freshRef.current = { id, at: performance.now() };
    setReveal({ id, count: 1 });
  };

  // 在那段对话最后一句她的话上记一笔“停了”（见 thread.js 的 markStopped）。
  // 为那段对话记着、这会儿没人守着的那几回（她不在的时候没送成、回来还没轮到补发的）一并作废（见 mail.js 的 forget）
  const markStoppedIn = (id) => {
    getRelay().forget(id);
    if (chatIdRef.current === id) {
      const next = markStopped(messagesRef.current);
      if (next === messagesRef.current) return;
      messagesRef.current = next;
      setMessages(next);
      saveChat(id, next);
      return;
    }
    // 她已经翻到别的对话去了：改存档里的那一份
    store.get("kfs2:chat:" + id).then((text) => {
      const msgs = safeParse(text, null);
      if (!Array.isArray(msgs)) return;
      const next = markStopped(msgs);
      if (next === msgs) return;
      if (chatIdRef.current === id) {
        messagesRef.current = next;
        setMessages(next);
      }
      saveChat(id, next);
    });
  };

  // 掐断他正在蹦的那一条：只留已经蹦出来的头 count 样（见 thread.js 的 cutReply）。
  // 没蹦到的那几样里他要是换了头像：头像换回去。头像是回话一到手就换上的；
  // 掐断以后那边的我不知道自己换过，开封府也就不该显示成换过
  const cutShort = (msgId, count) => {
    const out = cutReply(messagesRef.current, msgId, count);
    if (!out) return;
    messagesRef.current = out.msgs;
    setMessages(out.msgs);
    saveChat(chatIdRef.current, out.msgs);
    const av = out.dropped.find((it) => it.type === "avatar");
    if (av && sameAv(avatarsRef.current.him || null, { type: "meme", file: av.file })) changeHisAvatar(av.prev || null);
  };

  // 她点“停了，点这里让我回”：照眼下的对话要一条回话。
  // 那一笔“停了”当场擦掉：是她自己要的，这一句往后和平常的话一样（这一回要是没送成，回来照样补发；没回成，底下是“点这里重发”）
  const askAgain = () => {
    if (loadingRef.current || timerRef.current) return;
    const msgs = unmarkStopped(messagesRef.current);
    if (!needsReply(msgs)) return;
    if (msgs !== messagesRef.current) {
      messagesRef.current = msgs;
      setMessages(msgs);
      saveChat(chatIdRef.current, msgs);
    }
    askGuangyi(chatIdRef.current, msgs);
  };

  const sendHer = (payloads) => {
    const list = Array.isArray(payloads) ? payloads : [payloads];
    if (!list.length) return;
    const id = chatIdRef.current;
    const t0 = Date.now();
    const add = list.map((p, i) => ({ id: newId() + i, role: "her", ts: t0 + i, ...p }));
    const next = messagesRef.current.concat(add);
    messagesRef.current = next;
    follow.pin(); // 她自己发话：就算正翻着旧消息，也回到最底下
    setMessages(next);
    setErrorNote("");
    saveChat(id, next);
    scheduleReply(2200);
  };

  const sendText = () => {
    const t = input.trim();
    if (editing) {
      submitEdit(t);
      return;
    }
    if (!t && !attach.length) return;
    if (dictating && recRef.current) recRef.current.stop();
    const items = [];
    if (attach.length) {
      const add = {};
      const addDocs = {};
      attach.forEach((p) => {
        if (p.kind === "doc") {
          // 文档：全文另存一条，对话里只记文件名、类型、字数
          addDocs[p.id] = p.text;
          store.set(DOC_KEY + p.id, p.text).then((ok) => {
            if (!ok) markStorageFail();
          });
          items.push({ kind: "doc", docId: p.id, name: p.name, fmt: p.fmt, chars: p.chars, ...(p.images ? { images: p.images } : {}) });
          return;
        }
        add[p.id] = p.data;
        store.set("kfs2:img:" + p.id, p.data).then((ok) => {
          if (!ok) markStorageFail();
        });
        items.push({ kind: "photo", imgId: p.id });
      });
      imgsRef.current = { ...imgsRef.current, ...add };
      setImgs(imgsRef.current);
      docsRef.current = { ...docsRef.current, ...addDocs };
      setDocs(docsRef.current);
      setAttach([]);
    }
    if (t) items.push({ kind: "text", text: t });
    setInput("");
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.focus();
    }
    sendHer(items);
  };

  // ---- 照片和文档 ----
  // 加号里选的东西：照片压一压；Word、Markdown、文本在手机上把字取出来（见 docs.js）。读不了的说清楚为什么
  const pickFiles = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    const room = Math.max(0, 9 - attach.length);
    const notes = [];
    let failed = 0;
    for (const f of list.slice(0, room)) {
      const isPhoto = /^image\//.test(f.type || "") || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(f.name || "");
      if (isPhoto && !docFmtOf(f.name)) {
        try {
          const data = await fileToPhoto(f);
          setAttach((a) => a.concat([{ id: newId(), data }]));
        } catch (x) {
          failed++;
        }
        continue;
      }
      try {
        const d = await readDoc(f);
        setAttach((a) => a.concat([{ id: newId(), kind: "doc", ...d }]));
      } catch (x) {
        notes.push((x && x.say) || `《${f.name}》读不出来`);
      }
    }
    if (failed) notes.push(`有 ${failed} 张照片读不出来，换一张试试`);
    if (list.length > room) notes.push("一次最多九样");
    if (notes.length) setVoiceNote(notes.join("\n"));
  };

  // ---- 把他写的文档存进手机 ----
  // 先走系统的分享面板（iPhone 上能选“存储到文件”），走不通再当成下载
  const saveDoc = async (name, text) => {
    const share = async (type) => {
      const file = new File([text], name, { type });
      if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return false;
      await navigator.share({ files: [file] });
      return true;
    };
    try {
      if ((await share("text/markdown")) || (await share("text/plain"))) return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setToast("已下载");
  };

  // ---- 语音：说话转成字 ----
  const MIC_FALLBACK = "这里开不了麦。先用键盘上的话筒听写，效果一样；部署到Safari之后这两个按钮就能用了。";
  const startRec = (onText, onEnd) => {
    const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    if (!SR) {
      setVoiceNote(MIC_FALLBACK);
      return null;
    }
    try {
      const rec = new SR();
      rec.lang = "zh-CN";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev) => {
        let txt = "";
        for (let i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
        onText(txt);
      };
      rec.onerror = (ev) => {
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(ev.error)) setVoiceNote(MIC_FALLBACK);
      };
      rec.onend = () => onEnd && onEnd();
      rec.start();
      return rec;
    } catch (x) {
      setVoiceNote(MIC_FALLBACK);
      return null;
    }
  };

  // 话筒：听写进输入框
  const toggleDictation = () => {
    if (dictating) {
      if (recRef.current) recRef.current.stop();
      return;
    }
    dictBaseRef.current = input;
    const rec = startRec(
      (txt) => setInput(dictBaseRef.current + txt),
      () => {
        setDictating(false);
        recRef.current = null;
      }
    );
    if (rec) {
      recRef.current = rec;
      setDictating(true);
    }
  };

  // 声波键：发一条语音
  const finishVoice = () => {
    const r = recordingRef.current;
    if (!r || r.done) return;
    r.done = true;
    recordingRef.current = null;
    setRecording(null);
    recRef.current = null;
    if (!r.sending) return;
    const text = (r.text || "").trim();
    const dur = Math.max(1, Math.round((Date.now() - r.start) / 1000));
    if (text) sendHer({ kind: "voice", text, dur });
    else setVoiceNote("没听清，再说一次");
  };
  const startVoice = () => {
    const rec = startRec(
      (txt) => {
        if (!recordingRef.current) return;
        recordingRef.current = { ...recordingRef.current, text: txt };
        setRecording(recordingRef.current);
      },
      () => finishVoice()
    );
    if (rec) {
      recRef.current = rec;
      recordingRef.current = { start: Date.now(), text: "", sending: false, done: false };
      setRecording(recordingRef.current);
    }
  };
  const sendVoice = () => {
    if (!recordingRef.current) return;
    recordingRef.current.sending = true;
    if (recRef.current) recRef.current.stop();
    setTimeout(finishVoice, 1500); // 有的浏览器不报结束，兜个底
  };
  const cancelVoice = () => {
    if (recordingRef.current) recordingRef.current.sending = false;
    if (recRef.current) recRef.current.abort();
    finishVoice();
  };

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- 信箱：她不在的时候到的回话（那条新路见 mail.js） ----
  // 信箱里的一封回话放进它那段对话。回 applied 放进去了；dup 早放过了；gone 用不着了；failed 那一回没回成（已经告诉她了）；
  // later 这台设备上的那段对话还没跟上（等同步下来再放，信先留着）；keep 没回成、她眼前又不是那段对话（信先留着）；
  // busy 那段对话正在重新回答（等它完了再看，信先留着）
  const applyMail = async ({ job, info, row, result }) => {
    const id = info.chat;
    const here = () => chatIdRef.current === id;
    // 这段对话正在重新回答：画面上旧回答先收起来了（messagesRef 里没有它）。这时候拿画面去认信，
    // 信箱里要是还留着旧回答的那一封，会把它当成没放过的、又放一遍，回头还把新回答盖掉。等重新回答完了再看
    if (forkRef.current && forkRef.current.chat === id) return "busy";
    const msgs = here() ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + id), null);
    const fit = mailFit(msgs, info, job);
    if (fit !== "ok") return fit;
    if (!resultOk(result)) {
      // 没回成。她正对着这段对话：照老样子给一句“点这里重发”。
      // 眼前是别的对话：信先留着，等她翻到这段对话再说（横幅上写着“回开封府点一下重发”，翻过来得有得点）
      if (!here()) return "keep";
      if (info.fork) {
        // 没成的是“重新回答”：旧回答还在，说一声就行（想要就再点一次重新回答）
        if (!loadingRef.current) setErrorNote(`重新回答没成功（${explainResult(result).slice(0, 90)}）`);
      } else if (!loadingRef.current && !timerRef.current && needsReply(messagesRef.current)) {
        setErrorNote(`消息没送到（${explainResult(result).slice(0, 90)}）。点这里重发`);
      }
      return "failed";
    }
    // 这条算几点到的：小后端放进信箱的时候（不比她那一句早，不比现在晚）
    const anchor = msgs.find((m) => m.id === info.last);
    const stamp = Math.max(((anchor && anchor.ts) || 0) + 1, Math.min(Date.now(), Date.parse(row.done_at) || Date.now()));
    const next = mailPut(msgs, info, digestReply(result.data, result.used, info.extra || null, job, stamp));
    if (here()) messagesRef.current = next;
    await saveChat(id, next);
    // 存的那一下工夫里对话又变了（她发了一句、点了重新回答）：画面已经是更新的那份，不拿这一份旧的去盖
    if (here() && messagesRef.current === next) {
      setMessages(next);
      setErrorNote("");
    }
    return "applied";
  };

  // 看一遍信箱：到了的回话放进对话；还在等的，是眼前这段对话就守着它（顶上显示“正在输入”），别的过几秒再看。
  // 开封府不在眼前的时候不看：这时候把信取走，小后端就以为她看到了、不敲手机了。
  // retry：这是没看成以后自己再来的第几回（外头叫的时候不带）
  const checkMail = async (retry = 0) => {
    if (mailBusy.current) {
      mailAgain.current = true;
      return;
    }
    mailBusy.current = true;
    let again = false;
    let missed = false;
    try {
      // 头一遍看之前，先等仓库里新加的表情包读回来（最多两秒半）：信里他要是换了头像，得认得那张图。
      // 她是从图标进来的、还是点着横幅进来的，都从这儿过
      if (!mailGate.current) mailGate.current = Promise.race([memesReady.current, new Promise((done) => setTimeout(done, 2500))]).catch(() => {});
      await mailGate.current;
      const relay = getRelay();
      // 开封府不在眼前就不看（等表情包的那一下工夫里她切走了，也算）
      const list = document.visibilityState === "visible" ? await relay.collect() : [];
      // 这一遍没看成（没网、信箱没应）：过一会儿自己再来，不然信在信箱里、屏幕上什么都没有，要等她切走再回来才看得到
      if (list === null) missed = true;
      for (const m of list || []) {
        // 看的工夫里她切走了：一封都不动（这时候把信取走，小后端就不敲她了）。回来那一遍再办
        if (document.visibilityState !== "visible") break;
        const age = Date.now() - (Date.parse(m.row.created_at) || 0);
        const stale = age > 3 * 24 * 3600 * 1000; // 放了三天还放不进对话的，收掉
        if (m.state === "unreadable") {
          // 打不开的（多半是别的账号、别的暗号留下的）：放一天还在就收掉
          if (age > 24 * 3600 * 1000) await relay.discard(m.job);
          continue;
        }
        const mine = m.info.chat === chatIdRef.current && !loadingRef.current && !timerRef.current;
        if (m.state === "dead") {
          // 只收还写着“在等”的：看的那一眼和收的这一下之间回话要是正好放进来了，那一格留着。
          // 所以过几秒再看一遍：留下了就取出来（下面那句“没送到”跟着收掉）
          await relay.discard(m.job, true);
          again = true;
          if (mine && mailFit(messagesRef.current, m.info, m.job) === "ok" && needsReply(messagesRef.current)) setErrorNote("消息没送到（那边断了，这一条没回成）。点这里重发");
          continue;
        }
        if (m.state === "working") {
          if (mine && !m.info.fork && mailFit(messagesRef.current, m.info, m.job) === "ok") askGuangyi(m.info.chat, messagesRef.current, { job: m.job, info: m.info });
          else again = true;
          continue;
        }
        const out = await applyMail(m);
        if (out === "busy") {
          again = true;
          continue;
        }
        if (out === "later") mailLater.current = true;
        // 放的那一下工夫里她切走了：信先留着（小后端看它还在，照样敲她），回来那一遍认出放过了再收
        if (document.visibilityState !== "visible" && !stale) break;
        if ((out !== "later" && out !== "keep") || stale) await relay.discard(m.job);
      }
      // 上回打开时发出去、却没送到的那一句（切走的那一下话没出去，开封府又被系统收掉了）：那一回还记着，信箱里却没有它。
      // 眼前正是那段对话、那一句后面还空着：替她补发，不用她再说一遍（发之前照旧先同步看一眼别处回上了没有，见 mail.js 的 ask）。
      // 只认这次打开之前记下的（这次打开以后没送成的，当场就有“点这里重发”）；一回只补一次
      if (list !== null && document.visibilityState === "visible" && !loadingRef.current && !timerRef.current) {
        const msgs = messagesRef.current;
        // 记着的那一回接的正是眼下最后一条：那一句后面什么都没添过，还空着
        const owed = msgs.length ? relay.owed(chatIdRef.current, msgs[msgs.length - 1].id) : null;
        if (owed && owed.at < OPENED_AT && !orphansRef.current.has(owed.job) && !list.some((m) => m.job === owed.job)) {
          if (Date.now() - owed.at < ORPHAN_AGE) again = true; // 太新，过三秒再看
          else {
            orphansRef.current.add(owed.job);
            askGuangyi(chatIdRef.current, msgs, null, { recheck: true });
          }
        }
      }
      // 信箱看成了（到了的回话都进对话了）：眼前这段对话的横幅用不着了，收掉。
      // 没看成的时候不收：回话还没进对话，横幅上那几行字她还用得着。
      // 她不在眼前的时候根本没去看（上面那个空单子）：也不算看成，连“过一会儿再收”的弦都不上
      if (list !== null && document.visibilityState === "visible") tidyBanners();
    } catch (e) {}
    mailBusy.current = false;
    const soon = mailAgain.current;
    mailAgain.current = false;
    if (again || soon) {
      clearTimeout(mailTimer.current);
      mailTimer.current = setTimeout(() => latest.current.checkMail(), soon ? 300 : 3000);
    } else if (missed && retry < 4) {
      // 隔两秒、四秒、八秒、十六秒各再看一回；还不成就等下一个由头（她切回来、网回来、翻对话）
      clearTimeout(mailTimer.current);
      mailTimer.current = setTimeout(() => latest.current.checkMail(retry + 1), 2000 * 2 ** retry);
    }
  };

  // 眼前这段对话的回话横幅还挂着的，收掉：她已经在看这段对话了。
  // （小后端一个气泡敲一条；她点了其中一条回来，剩下几条不用她一条一条划。iPhone 上给不给收要看系统：不给就照旧挂着。）
  // 收的那一下，路上可能还有一条没到（小后端看信还在才敲，它敲的和她取信的可能前后脚）：过两秒半、过七秒各再收一遍
  const tidyBanners = () => {
    const run = async () => {
      const id = chatIdRef.current;
      if (!id) return;
      try {
        if (!tagsRef.current[id]) tagsRef.current[id] = await chatTag((name) => store.nameFor(name), id);
        // 她不在眼前（开封府在后台自己动了一下；算那串字的工夫里才切走的也算）、或者已经翻到别的对话了：不收
        if (chatIdRef.current !== id || document.visibilityState !== "visible") return;
        await clearReplyNotices(tagsRef.current[id]);
      } catch (e) {}
    };
    run();
    // 过一会儿再收的那两遍，只在“这一趟一直在眼前”的时候作数：她一切走就撤掉（见 leaving）。
    // 到点的时候晚了一大截的也不收（定时器中间被系统停过：她切走又回来了）。回来以后看信箱的那一遍看成了，自会重新来过
    bannerTimers.current.forEach(clearTimeout);
    const armed = Date.now();
    bannerTimers.current = [2500, 7000].map((ms) =>
      setTimeout(() => {
        if (Date.now() - armed < ms + 1500) run();
      }, ms)
    );
  };

  // 通知网址里的那串字是哪段对话
  const chatOfTag = async (tag) => {
    for (const c of indexRef.current) {
      if (!tagsRef.current[c.id]) {
        try {
          tagsRef.current[c.id] = await chatTag((name) => store.nameFor(name), c.id);
        } catch (e) {
          return "";
        }
      }
      if (tagsRef.current[c.id] === tag) return c.id;
    }
    return "";
  };

  // 她点着一条回话的通知回来：先把信箱里的放进对话，再翻到那段对话
  const openFromNotice = async ({ tag }) => {
    // 那段对话本来就开着（比方她翻着旧消息的时候切走的）：点横幅就是来看这一条的。
    // 侧栏、历史对话那一页要是还开着就收了，聊天记录到底（换对话的时候 openChat 也是这么收的）。
    // 赶在看信箱前头办：看信箱要等网络，慢的时候好几秒，等它回来再到底，她可能已经在翻了，会被拽一下。
    // 回话晚一步才放进对话也不要紧：这时候已经记成“跟着”，放进来就跟到底
    const here = await chatOfTag(tag);
    if (here && here === chatIdRef.current) {
      setHistoryOpen(false);
      setDrawerOpen(false);
      follow.bottom(false);
    }
    await checkMail();
    let id = here || (await chatOfTag(tag));
    if (!id) {
      // 目录里还没有那段对话（别的设备上聊的，还没同步到）：同步一遍再找
      try {
        await store.syncNow();
      } catch (e) {}
      id = await chatOfTag(tag);
    }
    if (id && id !== chatIdRef.current) await openChat(id);
    checkMail();
  };

  // 她要切走了（锁屏、换到别的应用）：还没传上云端的改动马上传；还没来得及送出去的话马上送。
  // 她停手两三秒才发的那个等待，切走以后就不走了；不在这一下送出去，就得等她回来才送。
  // 只在新路走通过的设备上这么干：走老路的话，话一交出去她就走了，等着的这头断掉，那一回白问，
  // 回来看到的是“消息没送到”；不如照旧等她回来再送
  const leaving = () => {
    // 收横幅的那两遍“过一会儿再收”撤掉：它们是替“她还在眼前”上的弦。留着的话，她回来的那一下信箱没看成，它们照样到点把横幅收了
    bannerTimers.current.forEach(clearTimeout);
    bannerTimers.current = [];
    // 先把话交出去：切走以后页面只剩两三秒，这一包最要紧
    if (timerRef.current && getRelay().trusted()) {
      disarm();
      triggerReply({ flushed: true });
    }
    store.flush().catch(() => {});
  };

  // 她不在的时候没送成的那一句：回到眼前以后补发（已经有一句排着队等发，就不另排了）
  // 认是哪一段对话的：还是眼前这一段，排上队（已经有一句排着就不另排）；
  // 她眼前是别的对话（话交出去以后翻走的），记进“轮到了替它回”的那几段里（见 nextPending），不能拿眼前这一段去顶
  const resendSoon = (id) => {
    if (id === chatIdRef.current) {
      if (!timerRef.current) scheduleReply(700);
      return;
    }
    pendingRef.current.add(id); // 当场记上：这七百毫秒里她要是按了停，这一段也在“都不回了”的里头
    setTimeout(() => {
      if (!loadingRef.current) nextPending();
    }, 700);
  };

  latest.current = { checkMail, openFromNotice, leaving, resendSoon };

  // ---- 通知 ----
  // 开过通知的设备，每次打开都悄悄重新登记一遍（见 push.js）；她点通知回来的，记下是哪一条
  useEffect(() => {
    resyncPush().catch(() => {});
    return watchNotices((mark) => {
      setNoticeMark(mark);
      if (mark.startsWith("test-")) setNoticeBack(Date.now());
    });
  }, []);
  // 点着回话的通知回来的：翻到那段对话（存档读完了才办；开屏挡着也照办，进了门就在眼前）。
  // 点着测试通知回来的：说一声。开屏还挡着的时候先不说，进了门再说
  useEffect(() => {
    if (!noticeMark) return;
    const reply = parseReplyMark(noticeMark);
    if (reply) {
      if (!booted) return;
      setNoticeMark("");
      latest.current.openFromNotice(reply);
      return;
    }
    if (splash) return;
    setToast("从通知回来的");
    setNoticeMark("");
  }, [noticeMark, splash, booted]);
  // 开机读完看一遍信箱；之后每次切回来再看；切走的那一下把话送出去
  useEffect(() => {
    if (!booted) return;
    // 先轻轻问好新路通不通：她头一句话发完就切走，也敢交出去
    getRelay().warm();
    latest.current.checkMail();
    // 新路通不通还不知道的时候（开机那一下没网、没问成）再问一声；已经知道了就什么都不做。
    // 回到眼前的那一下晚一点问：iOS 上一回来就发的请求会悬很久
    let warmTimer = null;
    const warmSoon = (ms) => {
      clearTimeout(warmTimer);
      warmTimer = setTimeout(() => getRelay().warm(), ms);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        backAtRef.current = Date.now();
        latest.current.checkMail();
        warmSoon(700);
        // 她不在的时候有一句话没连上、没送成：现在补发（晚一点发，躲开刚回来那一下）
        if (backResend.current.size) {
          const again = Array.from(backResend.current);
          backResend.current.clear();
          again.forEach((id) => latest.current.resendSoon(id));
        }
      } else latest.current.leaving();
    };
    const onHide = () => latest.current.leaving();
    const onOnline = () => {
      latest.current.checkMail();
      warmSoon(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", onOnline);
      clearTimeout(warmTimer);
      clearTimeout(mailTimer.current);
      bannerTimers.current.forEach(clearTimeout);
    };
  }, [booted]);

  useEffect(() => {
    if (!voiceNote) return;
    const t = setTimeout(() => setVoiceNote(""), 6000);
    return () => clearTimeout(t);
  }, [voiceNote]);

  const sendMeme = async (file) => {
    setMemePanel(false);
    setSheet(null);
    setDrawerOpen(false);
    await ensureMemeThumb(file);
    sendHer({ kind: "meme", file });
  };

  // 她点“点这里重发”。recheck：这台设备不记得为这句话发过哪一回的话，先同步看一眼别处回上了没有（见 mail.js 的 ask）
  const retry = () => {
    const msgs = messagesRef.current;
    if (!loadingRef.current && needsReply(msgs)) askGuangyi(chatIdRef.current, msgs, null, { recheck: true });
  };

  // ---- 分条：一条一条冒出来 ----
  useEffect(() => {
    if (!reveal) return;
    const msg = messages.find((m) => m.id === reveal.id);
    if (!msg || reveal.count >= msg.items.length) {
      setReveal(null);
      return;
    }
    const nextItem = msg.items[reveal.count];
    const delay =
      nextItem.type === "meme"
        ? 750
        : nextItem.type === "doc"
        ? 900
        : nextItem.type === "avatar"
        ? 650
        : Math.min(1900, 550 + (nextItem.text ? nextItem.text.length : 0) * 28);
    const t = setTimeout(() => {
      setReveal((r) => (r && r.id === msg.id ? { id: r.id, count: r.count + 1 } : r));
    }, delay);
    return () => clearTimeout(t);
  }, [reveal, messages]);

  // ---- 键盘弹出来：外壳变矮了，聊天记录滚到最新那条（她在翻旧消息也一样：点开键盘就是要说话了） ----
  // 只认输入框的键盘：在弹出面板里打字（改昵称、填 key）的时候，后面的聊天记录不跟着动
  useEffect(() => {
    const onKb = (e) => {
      if (!e.detail || !e.detail.open) return;
      if (document.activeElement !== taRef.current) return;
      requestAnimationFrame(() => requestAnimationFrame(() => follow.bottom(false)));
    };
    window.addEventListener("kfs-kb", onKb);
    return () => window.removeEventListener("kfs-kb", onKb);
  }, []);

  // ---- 换了一段对话：从最底下看起（要排在下面那一条前头：先记“到底”，再报“变了”） ----
  useLayoutEffect(() => {
    follow.pin();
  }, [chatId]);

  // ---- 聊天记录变了：她在最底下就跟到底，往上翻着就不动（见 scroll.js） ----
  // 两处报，报的是同一件事，多报不碍事：
  // 1. 这里，对话一变当场报，不等下一帧。换到一段正好一样高的对话（大小没变，下面那个不会报）靠的也是它
  // 2. 下面那个量大小的：聊天记录多高、那个盒子多高，哪个变了都报（图片出来、思考过程点开、键盘、面板、输入框长高……）
  useLayoutEffect(() => {
    follow.changed();
  }, [messages, reveal && reveal.count, loading, queued, chatId, memePanel, errorNote]);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => follow.changed());
    if (scrollRef.current) ro.observe(scrollRef.current);
    if (rowsRef.current) ro.observe(rowsRef.current);
    return () => ro.disconnect();
  }, []);

  // ---- 设置 ----
  const updateSettings = (patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    store.set("kfs2:settings", JSON.stringify(next)).then((ok) => {
      if (!ok) markStorageFail();
    });
  };

  // ---- 头像 ----
  const avatarName = (av, withFile = true) => {
    if (!av || av.type !== "meme") return "";
    const m = memeLookup(av.file);
    if (!m) return av.file;
    return withFile ? `「${m.name}」（${av.file}）` : m.name;
  };

  const changeHerAvatar = (av) => {
    const prevAv = avatarsRef.current.her || null;
    const nextAv = { ...avatarsRef.current, her: av };
    avatarsRef.current = nextAv;
    setAvatars(nextAv);
    if (av) {
      store.set("kfs2:avatar:her", JSON.stringify(av)).then((ok) => {
        if (!ok) markStorageFail();
      });
    } else {
      store.del("kfs2:avatar:her");
    }
    // 聊到一半换的：在对话里留下一行，图跟着这行一起寄给光义；也记下换之前是哪张，
    // 那边的我才知道开头那会儿你用的是什么（见 buildMessages）
    const msgs = messagesRef.current;
    if (!msgs.length) return;
    const last = msgs[msgs.length - 1];
    const merging = last && last.role === "event" && last.who === "her";
    // 连着换了好几次，只留一行；换之前那张取头一次换之前的
    const prev = merging ? ("prev" in last ? last.prev : undefined) : prevAv;
    const ev = { id: newId(), role: "event", who: "her", av, ts: Date.now() };
    if (prev !== undefined) ev.prev = prev;
    // 兜了一圈又换回原来那张，等于没换，这一行就不留了
    const noChange = prev !== undefined && sameAv(prev, av || null);
    if (!merging && noChange) return;
    const base = merging ? msgs.slice(0, -1) : msgs;
    const next = noChange ? base : base.concat([ev]);
    messagesRef.current = next;
    setMessages(next);
    saveChat(chatIdRef.current, next);
  };

  const changeHisAvatar = (av) => {
    const nextAv = { ...avatarsRef.current, him: av };
    avatarsRef.current = nextAv;
    setAvatars(nextAv);
    if (av && av.type === "meme") ensureMemeThumb(av.file);
    store.set("kfs2:avatar:guangyi", JSON.stringify(av)).then((ok) => {
      if (!ok) markStorageFail();
    });
  };

  // ---- 昵称 ----
  // 存进存档、跟着云端走；改回默认的名字就把那一条删掉
  const saveName = (who, name) => {
    if (name === namesRef.current[who]) return;
    const next = { ...namesRef.current, [who]: name };
    namesRef.current = next;
    setNames(next);
    if (name) {
      store.set(NAME_KEYS[who], name).then((ok) => {
        if (!ok) markStorageFail();
      });
    } else {
      store.del(NAME_KEYS[who]);
    }
  };

  // 卿卿在账户面板里改自己的昵称；清空就是回到默认的“卿卿”
  const changeHerName = (raw) => {
    const name = cleanName(raw);
    if (name !== tidyName(raw)) setToast("名字太长，只留了前面这些");
    saveName("her", name === HER_NAME ? "" : name);
  };

  // 光义在回复里写 [NAME:新名字] 改自己的（进来的已经是收拾好的名字）
  const changeHisName = (name) => saveName("him", name === HIS_NAME ? "" : name);

  // ---- 记忆库 ----
  const uploadDocs = async (fileList) => {
    let added = 0;
    let updated = 0;
    let failed = 0;
    let files = memFilesRef.current.slice();
    const texts = { ...memTextsRef.current };
    for (const f of fileList) {
      try {
        if (f.size > 3 * 1024 * 1024) {
          failed++;
          continue;
        }
        const text = await f.text();
        const head = text.slice(0, 4000);
        if (!text.trim() || head.includes("\u0000") || (head.match(/\uFFFD/g) || []).length > 20) {
          failed++;
          continue;
        }
        const existing = files.find((x) => x.name === f.name);
        const id = existing ? existing.id : newId();
        const ok = await store.set("kfs2:mem:" + id, text);
        if (!ok) markStorageFail();
        texts[id] = text;
        if (existing) {
          files = files.map((x) => (x.id === id ? { ...x, size: text.length, updatedAt: Date.now() } : x));
          updated++;
        } else {
          files = files.concat([{ id, name: f.name, size: text.length, enabled: true, addedAt: Date.now() }]);
          added++;
        }
      } catch (e) {
        failed++;
      }
    }
    memFilesRef.current = files;
    memTextsRef.current = texts;
    setMemFiles(files);
    setMemTexts(texts);
    store.set("kfs2:memindex", JSON.stringify(files));
    setMemNote(
      [added ? `新增 ${added} 份` : "", updated ? `更新 ${updated} 份` : "", failed ? `${failed} 份读不出文字` : ""]
        .filter(Boolean)
        .join("，")
    );
  };

  const toggleDoc = (id, on) => {
    const files = memFilesRef.current.map((f) => (f.id === id ? { ...f, enabled: on } : f));
    memFilesRef.current = files;
    setMemFiles(files);
    store.set("kfs2:memindex", JSON.stringify(files));
  };

  const deleteDoc = (id) => {
    const files = memFilesRef.current.filter((f) => f.id !== id);
    const texts = { ...memTextsRef.current };
    delete texts[id];
    memFilesRef.current = files;
    memTextsRef.current = texts;
    setMemFiles(files);
    setMemTexts(texts);
    store.set("kfs2:memindex", JSON.stringify(files));
    store.del("kfs2:mem:" + id);
  };

  // ---- 日记本 ----
  const loadMonth = async (ym) => {
    if (diaryCache.current[ym]) return diaryCache.current[ym];
    const data = safeParse(await store.get("kfs2:diary:" + ym), {}) || {};
    diaryCache.current[ym] = data;
    return data;
  };

  const saveEntry = async (key, who, value) => {
    const ym = key.slice(0, 7);
    const base = await loadMonth(ym);
    const day = { ...(base[key] || {}) };
    if (value) day[who] = value;
    else delete day[who];
    if (day.her && !day.her.text && !(day.her.moods && day.her.moods.length)) delete day.her;
    const data = { ...base };
    if (Object.keys(day).length) data[key] = day;
    else delete data[key];
    diaryCache.current[ym] = data;
    store.set("kfs2:diary:" + ym, JSON.stringify(data)).then((ok) => {
      if (!ok) markStorageFail();
    });
    if (key === dayKeyOf(new Date())) {
      setDiaryToday({ her: !!(day.her && (day.her.text || (day.her.moods || []).length)), him: !!(day.him && day.him.text) });
    }
    return data;
  };

  // 把所有对话按天归好：日历的深浅、我写日记要读的聊天，都从这来
  const loadDays = async () => {
    const byDay = {};
    for (const c of indexRef.current) {
      const msgs =
        c.id === chatIdRef.current ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + c.id), []) || [];
      msgs.forEach((m) => {
        if (m.role !== "her" && m.role !== "him") return;
        const k = dayKeyOf(new Date(m.ts));
        (byDay[k] = byDay[k] || []).push(m);
      });
    }
    dayMsgsRef.current = byDay;
    const counts = {};
    Object.keys(byDay).forEach((k) => {
      counts[k] = byDay[k].length;
    });
    return counts;
  };

  const writeHis = async (key, herEntry) => {
    const st = settingsRef.current;
    const d = parseDayKey(key);
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
    const docs = memFilesRef.current
      .filter((f) => f.enabled)
      .map((f) => ({ name: f.name, content: memTextsRef.current[f.id] || "" }));
    const { staticText, nowNote } = buildSystem({
      now: new Date(),
      memeList: allMemes,
      hisAvatarName: avatarName(avatarsRef.current.him),
      memDocs: docs,
      mcpNames: [],
    });
    const msgs = dayMsgsRef.current[key] || [];
    const transcript = msgs.length ? dayTranscript(msgs, memeLookup) : "（这天你们没在开封府说话）";
    const herMoods = ((herEntry && herEntry.moods) || []).map((k) => (moodOf(k) || {}).t).filter(Boolean);
    const herPart =
      herEntry && (herEntry.text || herMoods.length)
        ? `\n\n她这天的日记：\n${herMoods.length ? "心情：" + herMoods.join("、") + "\n" : ""}${herEntry.text || ""}`
        : "";
    const rule = `【写日记】
这次不是聊天。这是开封府日记本里属于你的那一页，日期是${label}。
根据下面这天你们的聊天${herPart ? "和她这天的日记" : ""}，用你自己的口吻写一篇日记：第一人称，写这天发生了什么、你在想什么、你对她的感受。像真的日记，是写给自己的，不是写给她看的信，也不用讨好谁。一百到两百五十字。
格式：第一行写「心情：」，从 开心、甜、平静、累、焦虑、难过、生气、不舒服 里挑一到两个，用顿号隔开。第二行开始写正文。
不要写<thinking>，不要[SPLIT]、[MEME]、[AVATAR]、[NAME]、[DOC]，不要动作描写的星号，不用破折号。`;
    const data = await callClaude({
      model: st.model || DEFAULT_MODEL,
      max_tokens: Math.max(1024, st.maxTokens || 2048),
      system: [
        { type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: rule },
      ],
      messages: [{ role: "user", content: `这天的聊天记录：\n${transcript}${herPart}\n\n${nowNote}\n\n写吧。` }],
    });
    recordUsage(data);
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = parseDiary(text);
    if (!parsed.text) throw new Error("没写出字");
    return { text: parsed.text, moods: parsed.moods, updatedAt: Date.now() };
  };

  // ---- 测试连接 ----
  const testApi = async () => {
    setTesting(true);
    setTestNote("");
    try {
      const d = await callClaude({ ping: true });
      const text = (d.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      setTestNote(`连上了，${modelLabel(d.model || "")} 回了一个“${text.slice(0, 6) || "在"}”`);
    } catch (e) {
      setTestNote(`没连上：${String((e && e.message) || e).slice(0, 160)}`);
    }
    setTesting(false);
  };

  // ---- 备份 ----
  const exportBackup = async () => {
    const data = store.exportAll();
    const json = JSON.stringify({ app: "kaifengfu", v: 1, exportedAt: new Date().toISOString(), data });
    const name = `开封府备份-${dayKeyOf(new Date())}.json`;
    const blob = new Blob([json], { type: "application/json" });
    try {
      const file = new File([blob], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "开封府备份" });
        setBackupNote("备份交给你了，存进 iCloud 或 Dropbox。");
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setBackupNote(`备份已下载：${name}`);
  };

  // 导入：聊天目录、记忆库目录、日记按天合并，不覆盖眼下的设置
  const importBackup = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const data = obj && obj.app === "kaifengfu" ? obj.data : null;
      if (!data || typeof data !== "object") throw new Error("这不是开封府的备份");
      let n = 0;
      for (const [k, v] of Object.entries(data)) {
        if (typeof v !== "string" || !k.startsWith("kfs2:")) continue;
        if (k === "kfs2:settings" || k === "kfs2:lastChat" || k.startsWith("kfs2:usage:")) continue;
        if (k === "kfs2:index" || k === "kfs2:memindex") {
          const mine = safeParse(await store.get(k), []) || [];
          const ids = new Set(mine.map((c) => c.id));
          const merged = mine.concat((safeParse(v, []) || []).filter((c) => c && !ids.has(c.id)));
          if (k === "kfs2:index") merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          await store.set(k, JSON.stringify(merged));
        } else if (k.startsWith("kfs2:diary:")) {
          const mine = safeParse(await store.get(k), {}) || {};
          await store.set(k, JSON.stringify({ ...(safeParse(v, {}) || {}), ...mine }));
        } else if ((await store.get(k)) == null || k.startsWith("kfs2:avatar:")) {
          await store.set(k, v);
        } else continue;
        n++;
      }
      setBackupNote(`导入了 ${n} 条记录，马上刷新。`);
      setTimeout(() => window.location.reload(), 900);
    } catch (x) {
      setBackupNote("导入没成功：" + ((x && x.message) || x));
    }
  };

  const logout = async () => {
    if (!logoutArmed) {
      setLogoutArmed(true);
      try {
        await store.syncNow();
      } catch (e) {}
      return;
    }
    try {
      await Promise.race([disablePush(), new Promise((done) => setTimeout(done, 4000))]);
    } catch (e) {}
    try {
      localStorage.removeItem(JOBS_KEY);
      localStorage.removeItem(RELAY_KEY);
      localStorage.removeItem(HALTED_KEY);
    } catch (e) {}
    if (account.signOut) account.signOut();
  };

  // ---- 侧滑手势 ----
  // 只认一根手指。落下了第二根，这一回就不算划侧栏了（拖到一半的弹回去），等手指全抬起来再从头认：
  // 整页不许捏以后，两根手指往里一捏，头一根正好是往右走的，原来会被当成右划、把侧栏带出来
  const onTouchStart = (e) => {
    if (sheet || historyOpen || splash || viewer || menu || diaryOpen || docView) return;
    if (e.touches.length > 1) {
      touch.current = null;
      setDragX(null);
      return;
    }
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, dir: null, base: drawerOpen ? drawerW : 0, dx: 0 };
  };
  const onTouchMove = (e) => {
    const s = touch.current;
    if (!s) return;
    // 手指还按着的工夫里冒出了菜单、面板（长按气泡就是）：底下的侧栏不跟着这根手指走，这一回也不算了
    if (sheet || historyOpen || splash || viewer || menu || diaryOpen || docView) {
      touch.current = null;
      setDragX(null);
      return;
    }
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.dir) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
    }
    if (s.dir !== "h") return;
    s.dx = dx;
    setDragX(Math.max(0, Math.min(drawerW, s.base + dx)));
  };
  const onTouchEnd = () => {
    const s = touch.current;
    touch.current = null;
    if (!s || s.dir !== "h") return;
    const open = s.base === 0 ? s.dx > 50 : !(s.dx < -50);
    setDrawerOpen(open);
    setDragX(null);
  };

  const x = dragX !== null ? dragX : drawerOpen ? drawerW : 0;
  const progress = drawerW ? x / drawerW : 0;
  const typing = loading || reveal !== null;
  // 那边的我在回：她一发完话就算（话还排着队），到回话全蹦完为止。停键认的是这个
  const replying = queued || typing;
  // 那行“停了，点这里让我回”摆在她哪一句底下：他没在回的时候才摆
  const stoppedId = !replying ? stoppedAt(messages) : "";
  const rows = useMemo(() => buildRows(messages, reveal, stoppedId), [messages, reveal, stoppedId]);
  // 输入框最右边那个键眼下是哪一样：有字（有要发的照片、文档，正在改一句话）是发送；没字、他在回是停；没字、没在回是声波
  const keyKind = editing || input.trim() || attach.length ? "send" : replying ? "stop" : "wave";
  useLayoutEffect(() => {
    keyWas.current = { now: keyKind, from: keyWas.current.now, at: performance.now() };
  }, [keyKind]);
  // 那个键刚换了样子的那一小会儿点它算不算数。停键：刚冒出来的都不算（她发话的那一下连着点了两下；
  // 正要点声波、他正好开始回）。声波：只挡“刚从停变过来”的（按停连着点了两下；正要按停他正好回完）；
  // 她把字删光了马上点声波，照常算
  const keySettled = (from) => !((!from || keyWas.current.from === from) && performance.now() - keyWas.current.at < KEY_SETTLE);
  const activeModel = settings.model || DEFAULT_MODEL;

  // 对话页（或侧栏）在最上面时，底边自己接得上那条色块，告诉 main.jsx 别再盖淡出
  const chatOnTop = !splash && !sheet && !historyOpen && !diaryOpen && !menu && !viewer && !copySheet && !chatMenu && !renaming && !docView;
  useEffect(() => {
    const r = document.documentElement;
    if (chatOnTop) r.setAttribute("data-kfs-chat", "");
    else r.removeAttribute("data-kfs-chat");
  }, [chatOnTop]);
  useEffect(() => () => document.documentElement.removeAttribute("data-kfs-chat"), []);
  const syncLine = !storageOk
    ? "手机本地存档写不进去，记录可能留不住。"
    : sync.offline
    ? `离线中。${sync.pending ? `有 ${sync.pending} 条记录排队，` : ""}联网后自动补传。`
    : sync.pending
    ? `有 ${sync.pending} 条正在上传。`
    : `都已同步，锁好存在云端。${sync.lastSync ? "上次同步：" + timeAgo(sync.lastSync) : ""}`;
  const enabledMcp = (settings.mcps || []).filter((m) => m.enabled).length;
  const enabledDocs = memFiles.filter((f) => f.enabled).length;

  // ---- 弹层 ----
  const renderSheet = () => {
    if (sheet === "account") {
      return (
        <Sheet
          title={<NickTitle name={names.her || HER_NAME} onSave={changeHerName} />}
          onClose={() => { setSheet(null); setClearArmed(false); setLogoutArmed(false); setBackupNote(""); }}
        >
          <AvatarSection av={avatars.her} onChange={changeHerAvatar} />
          <HisAvatarCard av={avatars.him} name={avatarName(avatars.him, false) || "炅"} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "22px 0 18px" }} />
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>主题色</div>
          <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: theme === entranceTheme() ? 22 : 10 }}>
            {[
              ["qinglv", "linear-gradient(140deg,#BCD4CA,#7FA39A)"],
              ["dingxiang", "linear-gradient(140deg,#DCCFF0,#A58BC9)"],
            ].map(([k, g]) => (
              <button
                key={k}
                onClick={() => setTheme(k)}
                aria-pressed={theme === k}
                aria-label={`${THEMES[k].label}主题`}
                className="kfs-tap flex items-center"
                style={{ ...chip, gap: 8, padding: "5px 14px 5px 6px", backgroundColor: theme === k ? "rgba(255,255,255,0.82)" : chip.backgroundColor }}
              >
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: g, border: "2px solid #fff", boxShadow: theme === k ? `0 0 0 2px ${T.dai}` : "none" }} />
                {THEMES[k].label}
              </button>
            ))}
          </div>
          {theme !== entranceTheme() && (
            <div style={{ ...glass(0.5, 16), borderRadius: 16, padding: "12px 14px", marginBottom: 22 }}>
              <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.65, marginBottom: 10 }}>
                主屏幕上的图标还是{THEMES[entranceTheme()].icon}，它不会自己变。想换成{THEMES[theme].icon}：先看下面写着“都已同步”，删掉旧图标，用 Safari 打开{THEMES[theme].label}的入口重新添加，再登录、对暗号。
              </p>
              <button onClick={() => copyText(entranceUrl(theme))} className="kfs-tap" style={chip}>
                复制{THEMES[theme].label}入口的网址
              </button>
            </div>
          )}
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>云端同步</div>
          <div style={{ ...glass(0.5, 16), borderRadius: 16, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6, color: sync.offline || !storageOk ? "#A8473D" : T.ink }}>
            {syncLine}
          </div>
          <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10, marginBottom: 22 }}>
            <button onClick={() => store.syncNow()} className="kfs-tap" style={{ ...chip, opacity: sync.syncing ? 0.5 : 1 }}>
              {sync.syncing ? "正在同步…" : "现在同步"}
            </button>
          </div>

          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>备份</div>
          <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.6, marginBottom: 10 }}>
            备份文件是没上锁的完整记录，存进你自己的 iCloud 或 Dropbox。换手机、暗号忘了，都能靠它导回来。
          </p>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            <button onClick={exportBackup} className="kfs-tap" style={chip}>
              导出备份
            </button>
            <button onClick={() => importRef.current && importRef.current.click()} className="kfs-tap" style={chip}>
              导入备份
            </button>
          </div>
          {backupNote && <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.6 }}>{backupNote}</div>}
          <input ref={importRef} type="file" accept="application/json,.json" onChange={importBackup} style={{ display: "none" }} />

          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8, marginTop: 22 }}>通知</div>
          <PushPanel email={account.email} onCopy={copyText} back={noticeBack} mailStatus={() => getRelay().status()} onReplyReady={() => getRelay().learn(true)} />

          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8, marginTop: 22 }}>屏幕</div>
          {gapInfo().canFill && (
            <div className="flex items-center justify-between" style={{ ...glass(0.5, 16), borderRadius: 16, padding: "10px 14px", marginBottom: 10, gap: 12 }}>
              <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.5 }}>
                铺满到屏幕最底下
                <div style={{ fontSize: 11.5, color: T.inkSoft }}>{fillOn ? "开着：输入框沉到最底下" : "关着：底下留一条，输入框贴着它"}</div>
              </div>
              <Toggle
                on={fillOn}
                onChange={(v) => {
                  setFill(v);
                  setFillOn(v);
                }}
                label="铺满到屏幕最底下"
              />
            </div>
          )}
          <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.6, marginBottom: 10 }}>
            屏幕最底下那条空白，量一量就知道能不能铺满。量完截个图给我。
          </p>
          <button onClick={openProbe} className="kfs-tap" style={chip}>
            量一量屏幕底下
          </button>

          <div style={{ height: 1, background: "rgba(255,255,255,0.7)", margin: "22px 0 18px" }} />
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            <button
              onClick={() => {
                if (!clearArmed) {
                  setClearArmed(true);
                  return;
                }
                deleteChat(chatIdRef.current);
                setClearArmed(false);
                setSheet(null);
              }}
              className="kfs-tap"
              style={{ ...chip, color: "#A8473D" }}
            >
              {clearArmed ? "再点一次，删掉这段对话" : "删掉当前这段对话"}
            </button>
            <button onClick={logout} className="kfs-tap" style={{ ...chip, color: "#A8473D" }}>
              {logoutArmed
                ? sync.pending
                  ? `还有 ${sync.pending} 条没传上去，再点一次也退出`
                  : "再点一次，退出登录"
                : "退出登录"}
            </button>
          </div>
          {account.email && <div style={{ fontSize: 12, color: T.inkFaint, marginTop: 12 }}>登录账号：{account.email}</div>}
          <div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 22, textAlign: "center", fontFamily: SERIF, letterSpacing: "0.1em" }}>
            开封府 v5，二〇二六年十月一日动工
          </div>
        </Sheet>
      );
    }
    if (sheet === "memory") {
      return (
        <Sheet title="记忆库" onClose={() => { setSheet(null); setMemNote(""); }}>
          <MemoryPanel files={memFiles} texts={memTexts} note={memNote} onUpload={uploadDocs} onToggle={toggleDoc} onDelete={deleteDoc} />
        </Sheet>
      );
    }
    if (sheet === "mcp") {
      return (
        <Sheet title="MCP" onClose={() => setSheet(null)}>
          <McpPanel mcps={settings.mcps || []} onChange={(mcps) => updateSettings({ mcps })} />
        </Sheet>
      );
    }
    if (sheet === "api") {
      return (
        <Sheet title="API" onClose={() => { setSheet(null); setTestNote(""); }}>
          <ApiPanel
            settings={settings}
            onChange={(patch) => {
              updateSettings(patch);
              setTestNote("");
            }}
            onTest={testApi}
            testNote={testNote}
            testing={testing}
            usage={usage}
            monthUsage={monthUsage}
          />
        </Sheet>
      );
    }
    if (sheet === "model") {
      return (
        <Sheet title="选择模型" onClose={() => setSheet(null)}>
          <ModelPanel
            current={settings.model || DEFAULT_MODEL}
            onPick={(id) => {
              updateSettings({ model: id });
              setSheet(null);
            }}
          />
        </Sheet>
      );
    }
    return null;
  };

  return (
    <div
      ref={rootRef}
      className="overflow-hidden select-none"
      // 侧栏开着时对话窗被推到右边、伸出外壳三百多像素。overflow: hidden 只是不让手指滚，
      // 程序还是滚得动它（scrollIntoView 这类，测试工具点按钮之前就这么滚过），一滚整页连同弹出面板都歪到一边，不会自己回来。
      // clip 是干脆不当滚动容器；不认 clip 的老浏览器退回类名里的 hidden，再靠下面的 onScroll 挪回去
      style={{ position: "fixed", top: "var(--kfs-kb-top, 0px)", left: 0, width: "100%", height: "var(--kfs-kb-h, var(--kfs-h, 100dvh))", overflow: "clip", background: T.bg, fontFamily: SANS, color: T.ink }}
      onScroll={(e) => {
        const el = e.currentTarget;
        if (e.target === el && (el.scrollLeft || el.scrollTop)) {
          el.scrollLeft = 0;
          el.scrollTop = 0;
        }
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <style>{GLOBAL_CSS}</style>
      <Glows />

      {/* ============ 侧栏 ============ */}
      <div
        className="absolute top-0 left-0 h-full flex flex-col"
        style={{
          width: drawerW,
          transform: `translateX(${(progress - 1) * 28}px)`,
          opacity: 0.3 + 0.7 * progress,
          transition: dragX === null ? "transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s" : "none",
        }}
      >
        <div style={{ padding: "calc(22px + env(safe-area-inset-top)) 22px 12px", fontFamily: SERIF, fontSize: 23, letterSpacing: "0.14em", color: T.ink }}>
          开封府
        </div>
        {/* 上面这一段（日期、四个方块）放不下的时候自己滚；里面的东西都不许被压（flex-shrink-0） */}
        <div className="kfs-side-scroll flex-1 overflow-y-auto kfs-scroll flex flex-col" style={{ padding: "4px 16px 12px", gap: 12, minHeight: 0 }}>
          <DaysCard now={now} />
          <div className="grid grid-cols-2 flex-shrink-0" style={{ gap: 12 }}>
            <Tile icon="doc" label="记忆库" sub={memFiles.length ? `带着 ${enabledDocs} 份文档` : "放文档"} onClick={() => setSheet("memory")} />
            <Tile icon="plug" label="MCP" sub={enabledMcp ? `开着 ${enabledMcp} 个` : `装了 ${(settings.mcps || []).length} 个`} onClick={() => setSheet("mcp")} />
            <Tile icon="key" label="API" sub={monthUsage && monthUsage.month === usageKey() && monthUsage.replies ? `本月约 ${money(monthUsage.cost)}` : "连接与用量"} onClick={() => setSheet("api")} />
            <Tile
              icon="calendar"
              label="日记本"
              sub={
                diaryToday.her && diaryToday.him
                  ? "今天都写了"
                  : diaryToday.her
                  ? "今天卿卿写了"
                  : diaryToday.him
                  ? "今天光义写了"
                  : "今天还没写"
              }
              onClick={() => setDiaryOpen(true)}
            />
          </div>
        </div>
        {/* 历史对话固定在最底下那排（头像、新对话）的正上方，不跟着上面那段滚（卿卿定的位置）。
            它和底下那排之间隔 12，跟卡片之间的间距一样；屏幕有富余的时候，空在它和四个方块之间 */}
        <div className="flex-shrink-0" style={{ padding: "0 16px" }}>
          <HistoryCard
            index={index}
            currentId={chatId}
            onOpenAll={() => setHistoryOpen(true)}
            onOpen={openChat}
            onLongPress={(chat, rect) => setChatMenu({ chat, rect })}
          />
        </div>
        <div className="kfs-dock-fade flex items-center justify-between flex-shrink-0" style={{ padding: "12px 16px max(12px, var(--kfs-sab))" }}>
          <button onClick={() => setSheet("account")} aria-label="头像与设置" className="kfs-tap">
            <Avatar av={avatars.her} who="her" size={40} />
          </button>
          <button onClick={newChat} className="kfs-tap flex items-center" style={{ ...glass(0.72, 20), borderRadius: 999, padding: "10px 20px", gap: 6, color: T.ink }}>
            <Icon name="plus" size={18} />
            <span style={{ fontSize: 15 }}>新对话</span>
          </button>
        </div>
      </div>

      {/* ============ 对话窗 ============ */}
      <div
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{
          transform: `translateX(${x}px)`,
          transition: dragX === null ? "transform .35s cubic-bezier(.2,.8,.2,1), border-radius .35s" : "none",
          borderRadius: x > 0 ? 30 : 0,
          boxShadow: x > 0 ? "-14px 0 40px rgba(var(--k-shade),0.2)" : "none",
          background: WALL.paper,
        }}
      >
        <img
          key={theme}
          src={THEMES[theme].wall}
          alt=""
          draggable={false}
          className="kfs-wall absolute pointer-events-none"
          style={{ top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 100%" }}
        />

        {/* 顶栏 */}
        <div
          onClick={() => memePanel && setMemePanel(false)}
          className="relative z-10 flex items-center flex-shrink-0"
          style={{ ...glass(0.36, 28), borderRadius: 24, margin: "calc(12px + env(safe-area-inset-top)) 12px 0", padding: 6 }}
        >
          <IconBtn onClick={() => setDrawerOpen(true)} label="打开侧栏">
            <Icon name="menu" />
          </IconBtn>
          {/* 点中间这一块（头像和名字）：聊天记录滑回最顶。
              卿卿本来要的是点顶栏上面那一条（时间、电量那儿）。那一条是系统的地盘，点了不交给网页：
              铺过一层去接，她在手机上（iOS 26）试了点不着，拆了，回顶就落在这儿（她定的）。
              表情包面板开着的时候，这一下只管收面板（顶栏本来就是点了收面板的） */}
          <div className="kfs-bar-mid relative flex-1 flex flex-col items-center min-w-0" onClick={() => !memePanel && follow.top()} onMouseDown={(e) => e.preventDefault()}>
            <Avatar av={avatars.him} who="him" size={30} />
            {/* 他的名字：默认“光义”，他自己在回复里改（见 names.js）。换了名字时轻轻冒一下。
                他回话的时候，名字这一行让给“正在输入…”（叠在同一行上，不另起一行）：顶栏不长高，
                底下的聊天记录就不会被挤一下又松回去。名字的节点还在，只是字先透明；
                回完话节点换新的（key 里带着是不是在回话），名字又冒出来，这时候改了名字的话冒出来的就是新名字 */}
            <div
              key={`${typing ? "t" : "n"}:${names.him || HIS_NAME}`}
              className="kfs-his-name kfs-in truncate"
              style={{ fontSize: 12.5, color: typing ? "rgba(var(--k-ink),0)" : T.ink, marginTop: 2, maxWidth: "100%", padding: "0 6px" }}
            >
              {names.him || HIS_NAME}
            </div>
            {typing && (
              <div
                role="status"
                className="kfs-typing kfs-in"
                style={{ position: "absolute", left: 0, right: 0, bottom: 0, textAlign: "center", fontSize: 12.5, color: T.inkSoft, pointerEvents: "none", whiteSpace: "nowrap" }}
              >
                正在输入…
              </div>
            )}
          </div>
          <IconBtn onClick={newChat} label="新对话">
            <Icon name="pen" size={20} />
          </IconBtn>
        </div>

        {storageBanner && (
          <div
            className="relative z-10 flex items-center justify-between flex-shrink-0"
            style={{ ...glass(0.62, 20), borderRadius: 14, margin: "8px 12px 0", padding: "8px 12px", fontSize: 12, color: "#A8473D" }}
          >
            <span>手机本地存档写不进去，关掉后这段对话可能留不住</span>
            <button onClick={() => setStorageBanner(false)} aria-label="关闭提示" style={{ marginLeft: 8, opacity: 0.6 }}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {/* 消息 */}
        {/* 消息区：表情包面板开着时，点这里的空白处就收起来 */}
        <div
          ref={scrollRef}
          onClick={() => memePanel && setMemePanel(false)}
          onScroll={() => follow.scrolled()}
          onTouchStart={() => follow.touch()}
          onWheel={() => follow.touch()}
          className="kfs-chat-scroll relative z-10 flex-1 overflow-y-auto"
          style={{ padding: "8px 14px 12px" }}
        >
          {messages.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center" style={{ gap: 18 }}>
              {/* 题字的颜色跟主题走（--k-motto，见 input.css），都是实色，不带透明。
                  青绿的背景里它正压在那方深青上，原来的淡墨（inkSoft）叠上去只有 3 比 1，看不清；
                  实墨压在深青上、落到旁边的纸色上都过 4.5 比 1，屏幕高矮不同、字落在哪儿都清楚。
                  丁香的背景中间是浅的，用轻一档的紫就够 */}
              <p className="kfs-motto" style={{ fontFamily: SERIF, fontSize: 15, letterSpacing: "0.3em", paddingLeft: "0.3em", color: T.motto }}>
                如月之恒，官家在这
              </p>
              {memFiles.length === 0 && (
                <button
                  onClick={() => setSheet("memory")}
                  className="kfs-tap"
                  style={{ ...glass(0.55, 18), borderRadius: 18, padding: "10px 16px", fontSize: 13, color: T.ink, lineHeight: 1.6, maxWidth: 280 }}
                >
                  记忆库还是空的。先把名帖传上来，我才认得你。
                </button>
              )}
            </div>
          )}
          {/* 一条条话都装在这一层里：量它多高，变了就报给 scroll.js（见上面那个量大小的） */}
          <div ref={rowsRef} className="kfs-chat-rows">
          {rows.map((row) => {
            if (row.type === "sep") {
              return (
                <div key={row.key} className="text-center" style={{ fontSize: 11.5, color: T.inkFaint, margin: "16px 0 4px" }}>
                  {sepLabel(row.ts, now)}
                </div>
              );
            }
            if (row.type === "notice") {
              // 改名字的提示用他现在的头像
              const r = row.kind === "rename" ? { ...row, av: avatars.him } : row;
              return <NoticeRow key={row.key} row={r} animate={row.msg.ts >= listMount.current} />;
            }
            if (row.type === "ctrl") {
              return (
                <CtrlRow
                  key={row.key}
                  row={row}
                  busy={loading}
                  onPrev={() => switchVersion(row.msg.id, -1)}
                  onNext={() => switchVersion(row.msg.id, 1)}
                  onRetry={() => retryAt(row.msg.id)}
                />
              );
            }
            if (row.type === "tools") {
              return (
                <div key={row.key} style={{ marginLeft: 42, marginTop: 8, fontSize: 11.5, color: T.inkFaint }}>
                  {row.text}
                </div>
              );
            }
            if (row.type === "stopped") {
              // 她按停作废的那一句底下：一行小字，点了照眼下的对话让那边的我回（样子跟“重新回答”那一行一样）
              return (
                <div key={row.key} className="kfs-in flex justify-end" style={{ marginTop: 2, marginRight: 36 }}>
                  <button onClick={askAgain} className="kfs-tap kfs-stopped" style={{ padding: "6px 6px", fontSize: 12, color: T.inkSoft }}>
                    停了，点这里让我回
                  </button>
                </div>
              );
            }
            if (row.type === "thinking") {
              return (
                <ThinkingRow
                  key={row.key}
                  msg={row.msg}
                  open={!!openThinking[row.msg.id]}
                  onToggle={() => {
                    follow.loose(); // 她自己点开的：聊天记录变高了不是新话来了，别把刚点开的字带走
                    setOpenThinking((o) => ({ ...o, [row.msg.id]: !o[row.msg.id] }));
                  }}
                />
              );
            }
            return (
              <BubbleRow
                key={row.key}
                row={row}
                avatars={avatars}
                animate={row.msg.ts >= listMount.current}
                imgs={imgs}
                docs={docs}
                onOpenPhoto={setViewer}
                onOpenDoc={setDocView}
                onLongPress={(r, rect) => setMenu({ row: r, rect })}
              />
            );
          })}
          {typing && <TypingRow avatars={avatars} />}
          {errorNote && !loading && (
            <div className="flex justify-center" style={{ marginTop: 14 }}>
              <button onClick={retry} className="kfs-tap" style={{ ...glass(0.62, 18), borderRadius: 18, padding: "8px 16px", fontSize: 12.5, color: "#A8473D", maxWidth: "88%" }}>
                {errorNote}
              </button>
            </div>
          )}
          </div>
        </div>

        {/* 回到最新：她翻上去了才浮出来，点了滑回最底下。不带小点（卿卿定的）。
            这一格自己不占高度，正好夹在聊天记录和下面那块（表情包面板、输入框）中间，圆钮从这儿往上长 */}
        <div className="relative z-20 flex-shrink-0" style={{ height: 0 }}>
          <span
            className="kfs-latest"
            aria-hidden={!away}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 10,
              transform: `translate(-50%, ${away ? 0 : 6}px)`,
              opacity: away ? 1 : 0,
              visibility: away ? "visible" : "hidden",
              pointerEvents: away ? "auto" : "none",
              transition: `opacity .18s ease, transform .18s ease, visibility 0s linear ${away ? "0s" : ".18s"}`,
            }}
          >
            <button
              onClick={() => follow.bottom(true)}
              onMouseDown={(e) => e.preventDefault()} // 不抢输入框的焦点：键盘开着的时候点它，键盘不收（和输入框那几个按钮一样）
              aria-label="回到最新"
              tabIndex={away ? 0 : -1}
              className="kfs-tap flex items-center justify-center"
              style={{ ...glass(0.66, 18), width: 38, height: 38, borderRadius: 999, color: T.ink, boxShadow: "0 6px 18px rgba(var(--k-shade),0.16), inset 0 1px 0 rgba(255,255,255,0.75)" }}
            >
              <Icon name="down" size={19} sw={2} />
            </button>
          </span>
        </div>

        {/* 表情包面板 */}
        {memePanel && (
          <div
            className="relative z-10 flex-shrink-0 overflow-y-auto kfs-scroll kfs-sheet"
            style={{ ...glass(0.5, 28), borderRadius: 24, margin: "0 12px 8px", padding: 12, maxHeight: 250 }}
          >
            <div className="grid grid-cols-4" style={{ gap: 10 }}>
              {allMemes.map((m) => (
                <button
                  key={m.file}
                  onClick={() => sendMeme(m.file)}
                  aria-label={m.name}
                  className="kfs-tap overflow-hidden"
                  style={{ aspectRatio: "1 / 1", borderRadius: 16, border: "1.5px solid rgba(255,255,255,0.8)", boxShadow: "0 3px 10px rgba(var(--k-shade),0.12)" }}
                >
                  <img src={memeSrc(m.file)} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {voiceNote && (
          <div
            className="relative z-10 flex-shrink-0 kfs-in"
            style={{ ...glass(0.62, 18), borderRadius: 16, margin: "0 12px 8px", padding: "9px 14px", fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, whiteSpace: "pre-line" }}
          >
            {voiceNote}
          </div>
        )}

        {/* 输入框：照官方摆，上面写字，下面一排按钮，整块贴着底边。
            --kfs-sab 平时是底下横条要让的高度，iOS 底下空一条的时候是 0（见 input.css） */}
        <div
          className="kfs-composer relative z-10 flex-shrink-0"
          style={{ ...DOCK_GLASS, padding: "10px 14px max(8px, var(--kfs-sab))" }}
        >
          {attach.length > 0 && (
            <div className="flex overflow-x-auto kfs-scroll" style={{ gap: 10, padding: "6px 4px 10px" }}>
              {attach.map((ph) => (
                <div key={ph.id} className="relative flex-shrink-0">
                  {ph.kind === "doc" ? (
                    <div
                      className="kfs-doc-chip flex items-center"
                      style={{ height: 60, maxWidth: 190, gap: 8, padding: "0 12px 0 8px", borderRadius: 14, background: "rgba(255,255,255,0.55)", border: "1.5px solid rgba(255,255,255,0.85)" }}
                    >
                      <span className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 11, background: "rgba(255,255,255,0.75)", color: T.dai }}>
                        <Icon name="doc" size={18} />
                      </span>
                      <span className="block min-w-0">
                        <span className="block truncate" style={{ fontSize: 13, color: T.ink }}>
                          {ph.name}
                        </span>
                        <span className="block truncate" style={{ fontSize: 11, color: T.inkSoft }}>
                          {DOC_FMT[ph.fmt]}，{fmtChars(ph.chars)}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <img
                      src={ph.data}
                      alt=""
                      style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 14, border: "1.5px solid rgba(255,255,255,0.85)", display: "block" }}
                    />
                  )}
                  <button
                    onClick={() => setAttach((a) => a.filter((q) => q.id !== ph.id))}
                    aria-label={ph.kind === "doc" ? "不发这份" : "不发这张"}
                    className="absolute flex items-center justify-center"
                    style={{ top: -6, right: -6, width: 22, height: 22, borderRadius: 999, background: "rgba(var(--k-dim),0.78)" }}
                  >
                    <Icon name="x" size={12} color="#fff" sw={2.2} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {editing && (
            <div className="flex items-center justify-between" style={{ gap: 8, padding: "4px 8px 6px", fontSize: 12, color: T.dai }}>
              <span>正在改这条。发出去后从这里重新聊，原来的能翻回去</span>
              <button onClick={cancelEdit} className="kfs-tap flex-shrink-0" style={{ color: T.inkSoft, padding: "2px 6px" }}>
                取消
              </button>
            </div>
          )}
          {recording ? (
            <div className="flex items-center" style={{ gap: 10, padding: "4px 2px" }}>
              <button onClick={cancelVoice} className="kfs-tap flex-shrink-0" style={chip}>
                取消
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center" style={{ gap: 6, fontSize: 13, color: T.dai }}>
                  <Icon name="wave" size={16} />
                  <span>正在听 {Math.max(0, Math.round((Date.now() - recording.start) / 1000))}″</span>
                </div>
                <div className="truncate" style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
                  {recording.text || "说吧，我听着"}
                </div>
              </div>
              <button onClick={sendVoice} className="kfs-tap flex-shrink-0" style={{ ...chipPrimary, boxShadow: "0 3px 8px rgba(var(--k-dai-shade),0.28)" }}>
                发送
              </button>
            </div>
          ) : (
            <>
              <textarea
                ref={taRef}
                className="kfs-field block w-full"
                value={input}
                rows={1}
                placeholder={dictating ? "正在听你说…" : "说话，我听着"}
                onFocus={() => memePanel && setMemePanel(false)}
                onChange={(e) => {
                  setInput(e.target.value);
                  fitComposer(e.target);
                  // 她还在打字，就再等等
                  if (timerRef.current) scheduleReply(2800);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    sendText();
                  }
                }}
                style={{
                  resize: "none",
                  maxHeight: 120,
                  padding: "6px 10px",
                  fontSize: 16,
                  lineHeight: 1.45,
                  color: T.ink,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  userSelect: "text",
                  WebkitUserSelect: "text",
                }}
              />
              <div className="flex items-center" style={{ gap: 6, marginTop: 4 }}>
                {!editing && (
                  <>
                    <RoundBtn onClick={() => photoInputRef.current && photoInputRef.current.click()} label="发照片或文档">
                      <Icon name="plus" size={20} />
                    </RoundBtn>
                    <RoundBtn onClick={() => setMemePanel(!memePanel)} label="表情包" active={memePanel}>
                      <Icon name="smile" size={20} />
                    </RoundBtn>
                  </>
                )}
                <button
                  onClick={() => setSheet("model")}
                  onMouseDown={(e) => e.preventDefault()}
                  className="kfs-tap flex items-center flex-shrink-0"
                  style={{
                    gap: 3,
                    padding: "8px 10px 8px 13px",
                    borderRadius: 999,
                    fontSize: 13,
                    color: T.ink,
                    backgroundColor: "rgba(255,255,255,0.42)",
                    border: "1px solid rgba(255,255,255,0.65)",
                  }}
                >
                  {modelLabel(activeModel)}
                  <Icon name="chevD" size={14} />
                </button>
                <div className="flex-1" />
                <RoundBtn onClick={toggleDictation} label="听写" active={dictating}>
                  <Icon name="mic" size={19} />
                </RoundBtn>
                {keyKind === "send" ? (
                  <button
                    onClick={sendText}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label={editing ? "发送修改" : "发送"}
                    disabled={editing ? !input.trim() : false}
                    className="kfs-tap flex-shrink-0 flex items-center justify-center"
                    style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    background: T.daiGrad,
                    boxShadow: "0 3px 8px rgba(var(--k-dai-shade),0.3)",
                  }}
                  >
                    <Icon name="up" color="#fff" size={19} sw={2.1} />
                  </button>
                ) : keyKind === "stop" ? (
                  // 停键（见 stopReply）。刚从发送变过来的那一小会儿点它不算：她发话的那一下手指要是连着点了两下，
                  // 第二下不该把自己刚发的这一句停掉
                  <button
                    onClick={() => keySettled() && stopReply()}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="停"
                    className="kfs-tap kfs-stop flex-shrink-0 flex items-center justify-center"
                    style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    background: T.daiGrad,
                    boxShadow: "0 3px 8px rgba(var(--k-dai-shade),0.3)",
                  }}
                  >
                    <Icon name="stop" color="#fff" size={19} sw={2} />
                  </button>
                ) : (
                  // 声波键。刚从停键变过来的那一小会儿点它不算：她按停的那一下连着点了两下、
                  // 或者正要按停的时候他正好回完了，不该一下子开始录音
                  <button
                    onClick={() => keySettled("stop") && startVoice()}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="发语音"
                    className="kfs-tap flex-shrink-0 flex items-center justify-center"
                    style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    background: T.daiGrad,
                    boxShadow: "0 3px 8px rgba(var(--k-dai-shade),0.3)",
                  }}
                  >
                    <Icon name="wave" color="#fff" size={19} sw={2} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {/* 加号背后的文件框：照片，加上 Word、Markdown、文本。iPhone 的“选取文件”里只有这几种点得动 */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*,.docx,.md,.markdown,.txt,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          onChange={pickFiles}
          style={{ display: "none" }}
        />

        {/* 侧栏打开时，点露出来的这一条关掉 */}
        {x > 0 && <div className="absolute inset-0 z-30" onClick={() => setDrawerOpen(false)} />}
      </div>

      {renderSheet()}

      {diaryOpen && (
        <DiaryPage
          now={now}
          onBack={() => setDiaryOpen(false)}
          loadMonth={loadMonth}
          saveEntry={saveEntry}
          loadDays={loadDays}
          writeHis={writeHis}
        />
      )}

      {historyOpen && (
        <HistoryPage
          index={index}
          currentId={chatId}
          now={now}
          onBack={() => setHistoryOpen(false)}
          onOpen={openChat}
          onDelete={deleteChat}
          onLongPress={(chat, rect) => setChatMenu({ chat, rect })}
        />
      )}

      {menu && (
        <MsgMenu
          menu={menu}
          now={now}
          busy={loading}
          onClose={() => setMenu(null)}
          onCopy={(r) => copyText(r.item.type === "doc" ? r.item.text || docsRef.current[r.item.docId] || "" : r.item.text || "")}
          onEdit={startEdit}
          onRetry={(r) => {
            setMenu(null);
            retryAt(r.msg.id);
          }}
        />
      )}

      {chatMenu && (
        <ChatMenu
          menu={chatMenu}
          onClose={() => setChatMenu(null)}
          onRename={(chat) => {
            setChatMenu(null);
            setRenaming({ id: chat.id, title: chat.title || "" });
          }}
          onDelete={(chat) => {
            setChatMenu(null);
            deleteChat(chat.id);
          }}
        />
      )}

      {renaming && (
        <Sheet title="重命名" onClose={() => setRenaming(null)}>
          <input
            value={renaming.title}
            onChange={(e) => setRenaming({ ...renaming, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                renameChat(renaming.id, renaming.title);
                setRenaming(null);
              }
            }}
            autoFocus
            maxLength={40}
            aria-label="新名字"
            className="kfs-field"
            style={{ ...field, userSelect: "text", WebkitUserSelect: "text" }}
          />
          <div className="flex justify-end" style={{ gap: 8, marginTop: 14 }}>
            <button onClick={() => setRenaming(null)} className="kfs-tap" style={chip}>
              取消
            </button>
            <button
              onClick={() => {
                renameChat(renaming.id, renaming.title);
                setRenaming(null);
              }}
              disabled={!renaming.title.trim()}
              className="kfs-tap"
              style={{ ...chipPrimary, opacity: renaming.title.trim() ? 1 : 0.5 }}
            >
              保存
            </button>
          </div>
        </Sheet>
      )}

      {docView && (
        <Sheet
          title={
            <span className="kfs-doc-title truncate" style={{ ...SHEET_TITLE, fontSize: 16.5, letterSpacing: "0.02em", minWidth: 0, marginRight: 12 }}>
              {docView.name}
            </span>
          }
          onClose={() => setDocView(null)}
        >
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: -10, marginBottom: 12 }}>
            {DOC_FMT[docView.fmt] || "文档"}，{fmtChars(docView.text.length)}
            {docView.images ? `，有 ${docView.images} 张图片取不出来` : ""}
          </div>
          {docView.cut && (
            <p style={{ fontSize: 12.5, color: "#A8473D", lineHeight: 1.6, marginBottom: 10 }}>
              没写完：回复长度到上限了。在 API 面板把“回复最长多少”调成“长”，再点重新回答。
            </p>
          )}
          <div className="kfs-doc-body" style={{ ...glass(0.42, 12), borderRadius: 18, padding: "14px 14px 6px", userSelect: "text", WebkitUserSelect: "text" }}>
            {docView.fmt === "txt" ? (
              <div className="whitespace-pre-wrap break-words" style={{ fontSize: 14, lineHeight: 1.75, color: T.ink, paddingBottom: 8 }}>
                {docView.text}
              </div>
            ) : (
              <MdView text={docView.text} />
            )}
          </div>
          <div className="flex flex-wrap" style={{ gap: 8, marginTop: 14 }}>
            {!docView.mine && (
              <button onClick={() => saveDoc(docView.name, docView.text)} className="kfs-tap" style={chipPrimary}>
                存到手机
              </button>
            )}
            <button onClick={() => copyText(docView.text)} className="kfs-tap" style={chip}>
              复制全文
            </button>
          </div>
        </Sheet>
      )}

      {toast && (
        <div className="absolute z-50 kfs-in" style={{ top: "calc(92px + env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
          <div style={{ ...glass(0.82, 20), borderRadius: 999, padding: "8px 18px", fontSize: 13, color: T.ink }}>{toast}</div>
        </div>
      )}

      {copySheet && (
        <Sheet title="复制" onClose={() => setCopySheet("")}>
          <p style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 10 }}>这里不让直接复制，长按下面的字自己选吧。</p>
          <textarea
            readOnly
            value={copySheet}
            className="kfs-field"
            style={{ ...field, minHeight: 120, resize: "none", userSelect: "text", WebkitUserSelect: "text" }}
          />
        </Sheet>
      )}

      {/* 点开的照片：点一下关掉。整页不许捏以后这里也放大不了：卿卿说不用（点开的只有她自己发的照片，原图在她相册里） */}
      {viewer && (
        <div
          onClick={() => setViewer(null)}
          className="kfs-viewer absolute inset-0 z-50 flex items-center justify-center kfs-in"
          style={{ background: "rgba(var(--k-dim),0.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        >
          <img src={viewer} alt="" style={{ maxWidth: "92%", maxHeight: "86%", borderRadius: 18, objectFit: "contain", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }} />
        </div>
      )}

      {splash && (
        <SplashByTheme
          theme={theme}
          fading={splashFade}
          onEnter={() => {
            setSplashFade(true);
            setTimeout(() => setSplash(false), 700);
          }}
        />
      )}
    </div>
  );
}
