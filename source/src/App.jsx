import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { store } from "./store.js";
import { callClaude, callReply, callVoice, mailbox, freshToken } from "./cloud.js";
import { VOICE_KEY, HOLD_MS, WANT_KEY, HEARD_KEY, HEARD_MAX, VOICE_SAMPLE, voiceKeyOf, voicesIn, heardOf, shownOf, stabOf, secondsOf, readHeard, readVoice, collectHisIds, voiceWhere, silentMp3 } from "./voice.js";
import { createSpeaker } from "./speaker.js";
import { MOTTO_KEY, MOTTO_LAST, DEFAULT_MOTTO, parseMotto, pickMotto, poolAt, fillMotto, mottoLines, readMotto, packMotto, describeMotto } from "./motto.js";
import { MottoPanel } from "./panels/MottoPanel.jsx";
import { openProbe } from "./probe.js";
import { createFollow } from "./scroll.js";
import { gapInfo, setFill } from "./gap.js";
import { THEMES, useTheme, setTheme, entranceTheme, entranceUrl } from "./theme.js";
import { HER_NAME, HIS_NAME, NAME_KEYS, cleanName, tidyName } from "./names.js";
import { DOC_KEY, DOC_FMT, docFmtOf, readDoc, replyRoom } from "./docs.js";
import { parseReply, settleAvatarItems } from "./reply.js";
import { forkAt, switchAlt, needsReply, insertReply, answeredAfter, hasJob, mailFit, mailPut, markStopped, unmarkStopped, stoppedAt, cutReply } from "./thread.js";
import { createRelay, parseReplyMark, chatTag, resultOk, explainResult, JOBS_KEY, RELAY_KEY, HALTED_KEY } from "./mail.js";
import { disablePush, resyncPush, watchNotices, probeReply, knockList, clearReplyNotices } from "./push.js";
import { WEEK, sepLabel, timeAgo } from "./days.js";
import { newId, fmtChars } from "./util.js";
import { MEME_DATA, MEME_MAP, RAW_BASE, memeSrc, newMemesFrom, parseReadme } from "./memes.js";
import { urlToThumb, fileToPhoto } from "./images.js";
import { DEFAULT_MODEL, modelLabel, costOf, money, usageKey, windowOf, thinksFirst } from "./models.js";
import { RECAP_KEY, RECAP_BAD_KEY, normRecaps, pickRecap, tierOf, roomFor, dueRecap, splitForMerge, nextRecap, cleanRecap, addRecap, mayRetry, afterFail, afterAway, loadBad } from "./recap.js";
import { dayKeyOf, parseDayKey, moodOf, dayTranscript, parseDiary } from "./diary.js";
import { WALL, SERIF, SANS, T, glass, DOCK_GLASS, chip, chipPrimary, field, GLOBAL_CSS } from "./ui/style.js";
import { Icon } from "./ui/Icon.jsx";
import { HIS_DEFAULT, Avatar } from "./ui/Avatar.jsx";
import { Glows, IconBtn, SHEET_TITLE, Sheet, Toggle, RoundBtn } from "./ui/parts.jsx";
import { buildSystem, withNowNote } from "./prompt/system.js";
import { sameAv, buildMessages } from "./prompt/messages.js";
import { buildRecapAsk, buildMergeAsk } from "./prompt/recap.js";
import { DaysCard, Tile, HistoryCard } from "./side/Cards.jsx";
import { ChatMenu } from "./side/ChatMenu.jsx";
import { buildRows } from "./chat/rows.js";
import { makeTitle, makePreview, collectImgIds, collectDocIds } from "./chat/overview.js";
import { BubbleRow } from "./chat/Bubble.jsx";
import { CtrlRow, ThinkingRow, NoticeRow, TypingRow, RecapRow } from "./chat/Lines.jsx";
import { MsgMenu } from "./chat/MsgMenu.jsx";
import { SplashByTheme } from "./Splash.jsx";
import { NickTitle } from "./panels/NickTitle.jsx";
import { MdView } from "./panels/MdView.jsx";
import { DiaryPage } from "./panels/DiaryPage.jsx";
import { HistoryPage } from "./panels/HistoryPage.jsx";
import { HisAvatarCard, AvatarSection } from "./panels/AvatarSection.jsx";
import { MemoryPanel } from "./panels/MemoryPanel.jsx";
import { McpPanel } from "./panels/McpPanel.jsx";
import { ApiPanel } from "./panels/ApiPanel.jsx";
import { PushPanel } from "./panels/PushPanel.jsx";
import { ModelPanel } from "./panels/ModelPanel.jsx";

/* =========================================================
   开封府 v5 · 独立版
   代码里不写私事：人设和记忆在加密的记忆库里。
   ========================================================= */

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
// 重新打开开封府：上回那段还在等他回话、等的那一回是这么久以内交出去的，先回到那段（再久的就是新的一页，那段在历史对话里，点开照样补发）
const WAITING_MAX = 24 * 3600 * 1000;
const KEY_SETTLE = 400; // 最右边那个键刚换了样子（变成停、停变声波）这么多毫秒里，点它不算：手指连着点了两下，第二下不该落在新换上的键上
const FRESH_MS = 500; // 回话摆出来以后这么多毫秒里按的停，可能赶在画面重画之前（见 stopReply）
// ---------- 抄前情提要（见 recap.js、主体里的 runRecaps） ----------
const RECAP_WAIT = 1500; // 他回完一句以后等这么久再去看该不该抄（回话还在一条一条蹦，别抢在这一下）
const RECAP_BACK = 2000; // 她回到眼前以后等这么久再接着抄（iOS 上一回来就发的请求会悬很久）
const RECAP_CHAIN = 4; // 他回完一句，最多接连抄这么多趟（一趟一段）；还没抄到头的，等他下回回完话接着抄
const RECAP_ROOM = 4000; // 抄的那一回最多让他写这么多 token：一段最长九百字、并出来的最长一千二，写超一点也放得下；再长就是写飞了，不要
// 自己会先想一阵再写的模型（models.js 的 thinksFirst）：想的那些字也算在这个数里，所以放宽一倍，免得想的把写的挤掉。
// 只放宽上限，别的不动：想多想少（effort）一改，名帖那一大段就接不上聊天时写下的缓存了
const RECAP_ROOM_THINK = 8000;
const RECAP_PATIENCE = 140 * 1000; // 抄的那一回最多等这么久（网关自己等到 150 秒也就不等了）
const SWEEP_WAIT = 20 * 1000; // 开机以后过这么久，去收一遍删掉的对话留下的提要（见 sweepRecaps）
const SWEEP_AGE = 60 * 60 * 1000; // 只收抄了一个钟头以上的：刚抄的那份，它的对话可能只是还没同步过来
// ---------- 这一趟先不带缓存记号 ----------
// 带缓存的那种写法没通、不带的通了：接下来这么久里发话都不带缓存记号，省得回回先碰一次壁。
// 原来是记到开封府重开为止。那时候寄的对话只有最后二三十条，不带缓存也贵不到哪儿去；
// 现在寄的是提要加好几万字的原话，一直不带缓存的话每句话都按原价算，所以过十分钟再带上试一回
const NO_CACHE_MS = 10 * 60 * 1000;

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
  const flagsRef = useRef({ noCacheAt: -Infinity }); // 上一回记下“先不带缓存记号”是什么时候（见 NO_CACHE_MS）
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
  // 前情提要（见 recap.js）：眼前这段对话抄过的那几份（聊天记录里那行小字照它画）、点开看的那一份
  const [recaps, setRecaps] = useState([]);
  const [recapView, setRecapView] = useState(null);
  const [recapArmed, setRecapArmed] = useState(false); // “丢掉重抄”点了头一下
  const [recapUsage, setRecapUsage] = useState(null); // 上一回抄提要花了多少（API 面板里写）
  // 抄提要的活：want 是他回过话、该去看一眼要不要抄的那几段对话；busy 是正抄着的；
  // failed 记没抄成的（{ at, times, away }，见 recap.js 的 mayRetry）：这本账也记在这台设备上，重开了接着认
  const recapJob = useRef(null);
  if (recapJob.current === null) {
    let failed = {};
    try {
      failed = loadBad(localStorage.getItem(RECAP_BAD_KEY), Date.now());
      // 收拾过的那一份当场写回去：读的时候不认的（太老的、钟点不对的）不留在设备上，免得哪天又被认回来
      if (Object.keys(failed).length) localStorage.setItem(RECAP_BAD_KEY, JSON.stringify(failed));
      else localStorage.removeItem(RECAP_BAD_KEY);
    } catch (e) {}
    recapJob.current = { want: new Set(), busy: new Set(), failed, timer: null };
  }
  const [viewer, setViewer] = useState(null);
  const photoInputRef = useRef(null);
  const [voiceNote, setVoiceNote] = useState("");
  const [dictating, setDictating] = useState(false);
  const [recording, setRecording] = useState(null);
  const recordingRef = useRef(null);
  const recRef = useRef(null);
  const dictBaseRef = useRef("");
  // 他的语音条（见 voice.js、speaker.js）：每一条眼下的样子（念着、念好了、念不成…）、正在放的是哪一条、转过文字的那几条
  const [voices, setVoices] = useState({});
  const voicesRef = useRef({});
  const speakerRef = useRef(null);
  const rowListRef = useRef([]); // 眼下摆着的那几行（放完一条语音，看下一条是不是也是他的语音）
  const [playing, setPlaying] = useState("");
  const playingRef = useRef("");
  const audioRef = useRef(null);
  const audioSrcRef = useRef(""); // 放声音的东西眼下装着的那个地址（换下一条的时候把上一个收回，不攒着占内存）
  const hidesRef = useRef(0); // 开封府到现在一共被切走过几回（念语音的时候看她走没走开，见 speaker.js）
  const [heard, setHeard] = useState(() => {
    try {
      return new Set(readHeard(localStorage.getItem(HEARD_KEY)));
    } catch (e) {
      return new Set();
    }
  });
  const holdRef = useRef(null); // 回话蹦到语音那一条、正等它念好：{ key, at }（见“分条”那一段）
  // 中间那行字（新开一段、还没说话的时候，对话正中间那一行；见 motto.js）。
  // 素材库原文开机那一下从存档里现取（引擎手里是现成的）：不等，免得先闪一下“如月之恒”再换
  const [mottoText, setMottoText] = useState(() => readMotto(store.peek(MOTTO_KEY)));
  const mottoLib = useMemo(() => parseMotto(mottoText), [mottoText]);
  const mottoLibRef = useRef(mottoLib);
  mottoLibRef.current = mottoLib;
  const [motto, setMotto] = useState("");
  const mottoRef = useRef("");
  const mottoDraftRef = useRef(null); // 素材库改了一半、没存就关掉了：留着，下回点进来接着改
  const [voiceCheck, setVoiceCheck] = useState(null); // API 面板里：念语音的小后端接上没有（{ state, say, model }）
  const [voiceTestNote, setVoiceTestNote] = useState("");
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [, setTick] = useState(0);
  const [menu, setMenu] = useState(null);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [diaryToday, setDiaryToday] = useState({ her: false, him: false });
  const diaryCache = useRef({});
  const dayMsgsRef = useRef({});
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState("");
  const [noticeMark, setNoticeMark] = useState(""); // 她是点了哪条通知回来的（通知网址后面的记号）
  const [booted, setBooted] = useState(false); // 开机那一遍读完了（目录、设置、记忆库都在了）
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

      // 重新打开开封府：是新的一页（中间那行字是这个时段的那一句），不回到上回那段对话（卿卿 10 月 10 日定的，照官方 app）。
      // 只是切出去又切回来、开封府没被系统收掉的，什么都不变；点横幅进来的照旧打开那段对话（见 openFromNotice）。上回那段在历史对话里。
      // 例外：上回那段还在等他回话，先回到那段。“在等”认的是这台设备上记着的、为那段对话交出去过还没着落的那几回（relay.pendingFor：
      // 平常的话、重新回答都算；回话正在路上、在信箱里等着、没送到要补发、没回成，都还记着；回话放进对话了、她按了停，就不记了）。
      // 其中有一回是一天之内交出去的、它的回话还没在对话里（别的设备取走放进去、同步过来了的不算在等），她最后那句也没按停。
      // 只看存档里最后一句是不是她的不够：别的设备上说的话同步过来了、回话还没同步过来，也像在等；
      // 反过来，等的是重新回答、或者等的工夫里她又说了一句，最后那句又不像在等。
      // 回话正在路上、在信箱里等着、那一句没送出去要补发、没回成要摆“点这里重发”，这几样都只认眼前这段对话（信箱那条路审过三遍，不为这个动它）；
      // 换成新的一页的话，回话会悄悄落进那段里，没送出去的那句要等她自己点开那段才补发
      const lastId = await store.get("kfs2:lastChat");
      if (lastId && list.find((c) => c.id === lastId)) {
        const msgs = safeParse(await store.get("kfs2:chat:" + lastId), []) || [];
        const now = Date.now();
        const waiting =
          !stoppedAt(msgs) &&
          getRelay()
            .pendingFor(lastId)
            .some((r) => now - r.at < WAITING_MAX && !hasJob(msgs, r.job) && (r.fork || !answeredAfter(msgs, r.last)));
        if (waiting && chatIdRef.current !== lastId && !messagesRef.current.length) {
          chatIdRef.current = lastId;
          messagesRef.current = msgs;
          setChatId(lastId);
          setMessages(msgs);
          loadImagesFor(msgs);
          showRecaps(lastId);
        }
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
      if (keys.includes(MOTTO_KEY)) setMottoText(readMotto(await store.get(MOTTO_KEY)));
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
      if (has(RECAP_KEY)) showRecaps(chatIdRef.current);
      // 别的设备念好的语音同步下来了（这台设备上要念的那一条就不用再念了）
      if (has(VOICE_KEY) && speakerRef.current) speakerRef.current.synced(keys.filter((k) => k.startsWith(VOICE_KEY)));
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

  // ---- 前情提要（规矩见 recap.js） ----
  // 一段对话抄过的那几份（另存一条，不在对话里）
  const readRecaps = async (id) => normRecaps(safeParse(await store.get(RECAP_KEY + id), []));
  // 眼前这段对话的提要有变（翻到这段对话、新抄了一份、别的设备抄的同步下来了）：聊天记录里那行小字跟着换
  const showRecaps = async (id) => {
    const list = await readRecaps(id);
    if (chatIdRef.current === id) setRecaps(list);
  };
  // “他记多长”那一档眼下的几个数。staticText 是名帖那一大段：它越长，屋子里留给对话的越少，屋子小的模型跟着缩
  const recallTier = (staticText) => {
    const st = settingsRef.current;
    const room = (sure) => roomFor(windowOf(st.model || DEFAULT_MODEL), (staticText || "").length, st.maxTokens || 2048, sure);
    return tierOf(st.recall, room(false), room(true));
  };

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
    stopVoice();
    setEditing(null);
    setMenu(null);
    setRecapView(null);
    setRecapArmed(false);
    // 那段对话同步取出来（引擎手里是现成的），和 chatId 同一下换上：
    // 不经过“换了对话、话还没取出来、屏幕上空着”的那一下（那一下会白抽一句中间那行字，还会闪一下）
    const msgs = safeParse(store.peek("kfs2:chat:" + id), []) || [];
    chatIdRef.current = id;
    messagesRef.current = msgs;
    listMount.current = Date.now();
    setChatId(id);
    setMessages(msgs);
    setReveal(null);
    setErrorNote("");
    setMemePanel(false);
    setHistoryOpen(false);
    setDrawerOpen(false);
    loadImagesFor(msgs);
    showRecaps(id);
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
    stopVoice();
    setEditing(null);
    setMenu(null);
    const id = newId();
    chatIdRef.current = id;
    listMount.current = Date.now();
    messagesRef.current = [];
    setChatId(id);
    setMessages([]);
    setRecaps([]);
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
    // 他在这段对话里（连同翻过去的那些版本）念过的语音：一起删；还没念的不念了，正念着的那一问掐掉
    const said = collectHisIds(old).flatMap((hid) => store.keys(VOICE_KEY + hid + ".")).map((k) => k.slice(VOICE_KEY.length));
    if (said.length) getSpeaker().drop(said);
    getSpeaker().dropChat(id);
    const next = indexRef.current.filter((c) => c.id !== id);
    indexRef.current = next;
    setIndex(next);
    store.set("kfs2:index", JSON.stringify(next));
    store.del("kfs2:chat:" + id);
    // 这段对话抄过提要的：跟着删（没抄过的不用留一条“删了”的记录）
    if ((await store.get(RECAP_KEY + id)) != null) store.del(RECAP_KEY + id);
    if (recapJob.current.failed[id]) {
      delete recapJob.current.failed[id];
      saveBad();
    }
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

  // recap：这一回是抄前情提要的。钱照样记进本月；API 面板里“上一条”那几行不让它顶掉（那是她看上一句话寄了多厚用的），另记一行
  const recordUsage = (data, recap = false) => {
    const u = data && data.usage;
    if (!u) return;
    const cost = costOf(data.model, u);
    if (recap) setRecapUsage({ model: data.model, cost });
    else setUsage({ model: data.model, ...u, cost });
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

  // 存着的声音（base64）变成能放的地址
  const audioUrl = (audio, mime) => {
    const bin = atob(audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime || "audio/mpeg" }));
  };
  // 给放声音的东西换一个地址：上一个是这里造的就收回（一条语音一两百 K，聊久了不收会越攒越多）
  const loadAudio = (a, url) => {
    const old = audioSrcRef.current;
    a.src = url;
    audioSrcRef.current = url;
    if (old && old !== url && old.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(old);
      } catch (e) {}
    }
  };
  // ---- 他的语音条：念的活（见 speaker.js）。用到的浏览器和云端的东西在这里递进去 ----
  const getSpeaker = () => {
    if (!speakerRef.current) {
      speakerRef.current = createSpeaker({
        call: async (text, stability, signal) => {
          const d = await callVoice({ op: "speak", text, stability }, { signal });
          return { audio: d.audio, mime: d.mime, dur: d.dur };
        },
        store: { get: (k) => store.get(k), set: (k, v) => store.set(k, v), del: (k) => store.del(k) },
        visible: () => document.visibilityState === "visible",
        hides: () => hidesRef.current,
        wants: {
          get: () => {
            try {
              return localStorage.getItem(WANT_KEY) || "";
            } catch (e) {
              return "";
            }
          },
          set: (text) => {
            try {
              if (text) localStorage.setItem(WANT_KEY, text);
              else localStorage.removeItem(WANT_KEY);
            } catch (e) {}
          },
        },
        stab: () => stabOf(settingsRef.current.voiceStab),
        // 那一条回话里的这一样在哪儿（"shown" 在眼前、"kept" 在翻过去的版本里、"" 没了，见 voice.js 的 voiceWhere）：
        // 眼前这段对话看画面上的那一份，别的看存档。正在重新回答的那段，旧回答从画面上收起来了，
        // 还在点“重新回答”那一刻的整段里（forkRef）：算翻过去的（还没念的不念；念到一半的念完照存）
        alive: async (w) => {
          const cut = w.k.lastIndexOf(".");
          const id = w.k.slice(0, cut);
          const j = Number(w.k.slice(cut + 1));
          const msgs = chatIdRef.current === w.c ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + w.c), null);
          const here = voiceWhere(msgs, id, j, w.t);
          if (here) return here;
          const fk = forkRef.current;
          return fk && fk.chat === w.c && voiceWhere(fk.full, id, j, w.t) ? "kept" : "";
        },
        now: () => Date.now(),
        sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
        onChange: (key, st) => {
          const next = { ...voicesRef.current };
          if (st) next[key] = st;
          else delete next[key]; // 不认这一条了：再冒出来的话重新看一眼
          voicesRef.current = next;
          setVoices(next);
          // 正放着的那一条不在了（掐断了、删了）：停下
          if (playingRef.current === key && (!st || st.s !== "ready")) stopVoice();
        },
      });
    }
    return speakerRef.current;
  };
  // ---- 放他的语音 ----
  // 只用一个放声音的东西：iPhone 上它放过一回（她点的那一下），放完接着放下一条才不用她再点
  const player = () => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  };
  const stopVoice = () => {
    const a = audioRef.current;
    if (a) {
      a.onended = null;
      a.onerror = null;
      a.onpause = null;
      a.pause();
    }
    playingRef.current = "";
    setPlaying("");
  };
  // 放完一条：紧跟着的下一个气泡也是他的语音、念好了的，接着放（照微信）
  const nextVoiceAfter = (key) => {
    const list = rowListRef.current;
    const at = list.findIndex((r) => r.type === "bubble" && r.role === "him" && r.item.type === "voice" && voiceKeyOf(r.msg.id, r.idx) === key);
    if (at < 0) return "";
    for (let i = at + 1; i < list.length; i++) {
      const r = list[i];
      if (r.type !== "bubble") continue;
      if (r.role !== "him" || r.item.type !== "voice") return "";
      const k = voiceKeyOf(r.msg.id, r.idx);
      const st = voicesRef.current[k];
      return st && st.s === "ready" ? k : "";
    }
    return "";
  };
  // 点一下放，再点一下停。
  // 声音现从存档里取、现变成能放的地址（同步的，不等：iPhone 上只有她手指点下去的那一下才许出声，等一下再放就会被拦）
  const playVoice = (key) => {
    if (playingRef.current === key) {
      stopVoice();
      return;
    }
    const st = voicesRef.current[key];
    if (!st || st.s !== "ready") return;
    const rec = readVoice(store.peek(VOICE_KEY + key));
    let url = "";
    try {
      url = rec ? audioUrl(rec.audio, rec.mime) : "";
    } catch (e) {
      url = "";
    }
    if (!url) {
      stopVoice();
      setToast("这条语音放不出来");
      return;
    }
    const a = player();
    a.onended = null;
    a.onerror = null;
    a.onpause = null;
    a.pause();
    loadAudio(a, url);
    a.onended = () => {
      const next = nextVoiceAfter(key);
      if (next) playVoice(next);
      else stopVoice();
    };
    a.onerror = () => {
      stopVoice();
      setToast("这条语音放不出来");
    };
    // 不是放完了、是被停下的（来电话、锁屏上点了暂停、耳机拔了）：画面上跟着停。
    // 放完的那一下也会先来一个“停了”（那时候已经放到头了，ended 是真的），不算；换下一条之前那一下停的，等到它来的时候已经在放下一条了，也不算
    a.onpause = () => {
      if (a.paused && !a.ended && playingRef.current === key) stopVoice();
    };
    playingRef.current = key;
    setPlaying(key);
    const p = a.play();
    if (p && p.catch) {
      p.catch(() => {
        if (playingRef.current === key) stopVoice();
      });
    }
  };
  // 这条语音眼下是不是把字摆在气泡上（念不成、没人念）
  const voiceAsText = (r) => {
    const st = voicesRef.current[voiceKeyOf(r.msg.id, r.idx)];
    return !!st && (st.s === "fail" || st.s === "none");
  };
  // 转文字、取消转文字：记在这台设备上
  const toggleHeard = (key) => {
    setMenu(null);
    setHeard((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(HEARD_KEY, JSON.stringify(Array.from(next).slice(-HEARD_MAX)));
      } catch (e) {}
      return next;
    });
  };

  // API 面板里：念语音的小后端接上没有（打开面板的时候看一眼，不花钱）
  const checkVoice = async () => {
    try {
      const k = await callVoice({ op: "key" }, { wait: 15000 });
      setVoiceCheck(k.configured ? { state: "ok", model: k.model || "" } : { state: "setup", say: k.message || "" });
    } catch (e) {
      setVoiceCheck({ state: e.code || "refused", say: String((e && e.message) || "") });
    }
  };
  // 试听一句：照眼下“念得稳不稳”那一档念一句他的话，念好了就放（不存）
  const testVoice = async () => {
    // 她点下去的这一下先拿几帧没声音的放一下：iPhone 上只有手指点下去的那一下才许出声，等念好的回来就不是那一下了
    stopVoice();
    const a = player();
    try {
      loadAudio(a, URL.createObjectURL(new Blob([silentMp3(3)], { type: "audio/mpeg" })));
      const warm = a.play();
      if (warm && warm.catch) warm.catch(() => {});
    } catch (e) {}
    setVoiceTesting(true);
    setVoiceTestNote("");
    try {
      const d = await callVoice({ op: "speak", text: VOICE_SAMPLE, stability: stabOf(settingsRef.current.voiceStab) });
      stopVoice(); // 等的工夫里她点开了哪条语音：停下，放试听的这一句
      loadAudio(a, audioUrl(d.audio, d.mime));
      const p = a.play();
      if (p && p.catch) p.catch(() => setVoiceTestNote("念好了，可这台设备没让放出声来。点一下下面聊天里的语音条试试"));
      const how = [d.via === "dialogue" ? "走的是对话那个接口" : "", d.loose ? "“念得稳不稳”那一档它不认，照这个声音自己存着的设置念的" : ""].filter(Boolean).join("；");
      setVoiceTestNote(`念好了，${secondsOf(d.dur)} 秒${how ? `（${how}）` : ""}。没听到声音的话，看看手机的音量`);
      setVoiceCheck({ state: "ok", model: d.model || "" });
    } catch (e) {
      setVoiceTestNote(`没念成：${String((e && e.message) || e).slice(0, 160)}`);
    }
    setVoiceTesting(false);
  };

  // ---- 中间那行字：抽一句（上一回抽到的那句这台设备记着，不连着两回一样） ----
  const pickLine = () => {
    let last = "";
    try {
      last = localStorage.getItem(MOTTO_LAST) || "";
    } catch (e) {}
    const line = pickMotto(mottoLibRef.current, new Date(), last);
    try {
      if (line) localStorage.setItem(MOTTO_LAST, line);
    } catch (e) {}
    mottoRef.current = line;
    setMotto(line);
  };
  // 回到眼前的时候：空着的那一页还摆着，可这会儿已经换了时段、换了一天（抽到的那句不在眼下这一堆里了）：重抽
  const freshMotto = () => {
    if (messagesRef.current.length) return;
    const pool = poolAt(mottoLibRef.current, new Date());
    if (!pool.lines.map((x) => fillMotto(x, pool.n)).includes(mottoRef.current)) pickLine();
  };
  // 她在“头像与设置”里改了素材库：存进库房（加密了跟着云端走）
  const saveMotto = async (text) => {
    const ok = await store.set(MOTTO_KEY, packMotto(text, Date.now()));
    if (ok === false) markStorageFail();
    setMottoText(readMotto(packMotto(text, 0)));
  };

  // 回话放进了 id 那段对话：里头的语音条记下来要念（她开了“他能发语音”才念；没开的时候他发的，气泡上有“点这里念出来”）
  const wantVoices = (id, him) => {
    if (!settingsRef.current.voice || !him) return;
    const list = voicesIn(him);
    if (list.length) getSpeaker().want(id, list);
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
      voice: !!st.voice,
    });
    // 这段对话抄过提要的：前面的不寄原话，换成提要（见 recap.js）
    const recapList = opts.chat ? await readRecaps(opts.chat) : [];
    const { messages: apiMessages, tail } = buildMessages(msgs, avatarsRef.current, memeLookup, imgLookup, thumbLookup, docLookup, { recaps: recapList, tier: recallTier(staticText) });

    // 依次尝试：带缓存 → 不带缓存 → 不带MCP，哪种通了用哪种
    const withMcp = mcps.length > 0;
    const attempts = [];
    // （手机的钟被往回拨过、记的钟点比现在还晚：不认那个钟点，照常带）
    const sinceNoCache = Date.now() - flagsRef.current.noCacheAt;
    if (sinceNoCache >= NO_CACHE_MS || sinceNoCache < 0) attempts.push({ cache: true, mcp: withMcp });
    attempts.push({ cache: false, mcp: withMcp });
    if (withMcp) attempts.push({ cache: false, mcp: false });
    const bodyFor = (at) => {
      const body = {
        model,
        max_tokens: st.maxTokens || 2048,
        system: at.cache ? [{ type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } }] : staticText,
        messages: withNowNote(apiMessages, nowNote, at.cache, tail),
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
        if (first.cache && !got.used.cache && !got.used.shaky && !!got.used.mcp === !!first.mcp) flagsRef.current.noCacheAt = Date.now();
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
    if (attempts[0].cache && used === attempts[1]) flagsRef.current.noCacheAt = Date.now();
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
        wantVoices(id, him); // 里头有语音条的：记下来要念（存好以后再记：念之前要在存档里认得出这一条）
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
      recapSoon(id);
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
      const here = chatIdRef.current === id;
      if (here) {
        messagesRef.current = next;
        setMessages(next);
        // 里头的语音条先记下要念，再从头蹦：蹦到语音那一条认得出它在等着念（顶上“正在录音…”等它一会儿），
        // 不先摆成“还没念”。也不能等存完再记：存的那一下工夫里她按停掐断了的，记的时候还当它在
        wantVoices(id, him);
        startReveal(him.id);
      }
      await saveChat(id, next);
      if (!here) wantVoices(id, him); // 她翻到别的对话去了：存好以后再记（念之前要在存档里认得出这一条）
      if (settle) settle();
      recapSoon(id);
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

  // 回话摆出来了：从头一条开始一条一条蹦（见下面“分条”那一段）。
  // 头一条就是语音条的：先一条都不摆，等它念好了再冒出来（和后面的语音条一样）
  const startReveal = (id) => {
    freshRef.current = { id, at: performance.now() };
    const m = messagesRef.current.find((x) => x.id === id);
    const first = m && m.items && m.items[0];
    setReveal({ id, count: first && first.type === "voice" ? 0 : 1 });
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
    // 没蹦到的那几样里的语音条：不念了（正念着的那一问掐掉，念好存着的删掉）
    const kept = Math.max(1, count || 0);
    const gone = out.dropped.map((it, i) => (it.type === "voice" ? voiceKeyOf(msgId, kept + i) : "")).filter(Boolean);
    if (gone.length) getSpeaker().drop(gone);
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
    const him = digestReply(result.data, result.used, info.extra || null, job, stamp);
    const next = mailPut(msgs, info, him);
    if (here()) messagesRef.current = next;
    await saveChat(id, next);
    wantVoices(id, him);
    // 存的那一下工夫里对话又变了（她发了一句、点了重新回答）：画面已经是更新的那份，不拿这一份旧的去盖
    if (here() && messagesRef.current === next) {
      setMessages(next);
      setErrorNote("");
    }
    recapSoon(id);
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

  // ---- 抄前情提要 ----
  // 他回完一句、回话存好以后叫一声（recapSoon）：过一会儿去看这段对话够不够厚，够了就叫他把前面的抄成提要。
  // 在后台办：不挡她说话，不占停键，顶上不显示“正在输入”。抄的工夫里她照常聊，寄的还是原来那一整段；
  // 抄完一趟存好，下一句话起前面的才换成提要。一趟只抄一段（见 recap.js），没抄到头就接着抄下一趟，最多连抄 RECAP_CHAIN 趟。
  // 走的是写日记那条路（网页自己等着，不经信箱）：她切走了这一回多半就断了。断了不要紧，照旧寄原话，下回他回完话再抄。
  // 一回话只张罗一次：没抄成的不自己再试，等他下回回完话；而且越不成隔得越久（见 recap.js 的 mayRetry）。
  // 她切走才断的，头一回不算没抄成（不是那边的毛病）；连着两回都这样断，照没抄成记（见 recap.js 的 afterAway）
  const saveBad = () => {
    try {
      const failed = recapJob.current.failed;
      if (Object.keys(failed).length) localStorage.setItem(RECAP_BAD_KEY, JSON.stringify(failed));
      else localStorage.removeItem(RECAP_BAD_KEY);
    } catch (e) {}
  };
  const recapSoon = (id) => {
    const job = recapJob.current;
    job.want.add(id);
    clearTimeout(job.timer);
    job.timer = setTimeout(() => latest.current.runRecaps(), RECAP_WAIT);
  };

  const runRecaps = async () => {
    const job = recapJob.current;
    for (const id of Array.from(job.want)) {
      if (job.busy.has(id)) continue;
      // 她不在眼前：先不抄（这头随时会断，白花一回钱）。还留在单子上，她回到眼前的时候再来（见下面开机以后挂的那几样）
      if (document.visibilityState !== "visible") return;
      // 这一圈转到它之前，另一圈已经把它办了（单子是这一圈开头抄下来的，中间等过别的对话）：不办第二遍
      if (!job.want.delete(id)) continue;
      if (!mayRetry(job.failed[id], Date.now())) continue;
      job.busy.add(id);
      try {
        for (let pass = 0; pass < RECAP_CHAIN; pass++) {
          const out = await writeRecap(id);
          if (out !== "done") break;
          if (job.failed[id]) {
            delete job.failed[id];
            saveBad();
          }
          // 抄完这一趟她已经走了：剩下的等她回来接着抄（这一趟是成了的，不算重试）
          if (document.visibilityState !== "visible") {
            job.want.add(id);
            break;
          }
        }
      } catch (e) {
        job.failed[id] = e && e.code === "away" ? afterAway(job.failed[id], Date.now()) : afterFail(job.failed[id], Date.now());
        saveBad();
      }
      job.busy.delete(id);
    }
  };

  // 问他要一段提要。最多等 RECAP_PATIENCE；等的工夫里她切走过、这一回又没成的，抛 code 是 away 的错
  const askRecap = async (body) => {
    const ctl = new AbortController();
    let left = false;
    const onHide = () => {
      if (document.visibilityState !== "visible") left = true;
    };
    document.addEventListener("visibilitychange", onHide);
    let late = null;
    const give = setTimeout(() => ctl.abort(), RECAP_PATIENCE);
    try {
      // 两道：到点把线掐了；连换登录凭证都悬着、掐不着的时候，过三秒照样不等了
      return await Promise.race([
        callClaude(body, "", ctl.signal),
        new Promise((_, no) => {
          late = setTimeout(() => no(new Error("等太久")), RECAP_PATIENCE + 3000);
        }),
      ]);
    } catch (e) {
      if (left) throw Object.assign(new Error("她切走了"), { code: "away" });
      throw e;
    } finally {
      clearTimeout(give);
      clearTimeout(late);
      document.removeEventListener("visibilitychange", onHide);
    }
  };

  // 看一段对话该不该抄，该抄就抄一趟存好。回 "done" 抄了一趟（也许还有下一趟）；"none" 用不着抄；
  // "later" 这会儿不方便，回头再看；"gone" 那段对话没了。没抄成抛错
  const writeRecap = async (id) => {
    // 正在重新回答的那段对话：画面上旧回答先收起来了，这会儿看到的不是整段。等它完了（那一头回完也会叫一声）
    if (forkRef.current && forkRef.current.chat === id) return "later";
    const here = () => chatIdRef.current === id;
    const alive = () => indexRef.current.some((c) => c.id === id);
    const msgs = here() ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + id), null);
    if (!Array.isArray(msgs) || !alive()) return "gone";
    const st = settingsRef.current;
    const model = st.model || DEFAULT_MODEL;
    const memDocs = memFilesRef.current.filter((f) => f.enabled).map((f) => ({ name: f.name, content: memTextsRef.current[f.id] || "" }));
    // 名帖那一大段和聊天时寄的一个字不差（缓存接得上）；【此刻】这回用不着
    const { staticText } = buildSystem({ now: new Date(), memeList: allMemes, hisAvatarName: "", memDocs, mcpNames: [], voice: !!st.voice });
    // 这段对话的照片：眼前这一段的都在手上，别的对话的现从存档里取
    const photos = {};
    for (const m of msgs) {
      if (m.role !== "her" || m.kind !== "photo" || !m.imgId) continue;
      const have = imgsRef.current[m.imgId];
      photos[m.imgId] = (have === undefined ? await store.get("kfs2:img:" + m.imgId) : have) || "";
    }
    const due = dueRecap(msgs, await readRecaps(id), recallTier(staticText), (m) => (photos[m.imgId] || "").length);
    if (!due) return "none";
    let ask = null;
    if (due.kind === "merge") ask = buildMergeAsk({ parts: splitForMerge(due.prev, due.count).old });
    else {
      const piece = msgs.slice(due.from, due.to + 1);
      const docTexts = {};
      for (const m of piece) {
        if (m.role !== "her" || m.kind !== "doc" || !m.docId) continue;
        const have = docsRef.current[m.docId];
        docTexts[m.docId] = (have === undefined ? await store.get(DOC_KEY + m.docId) : have) || "";
      }
      ask = buildRecapAsk({ msgs: piece, prev: due.prev, thick: due.thick, memeLookup, imgLookup: (k) => photos[k] || null, docLookup: (k) => docTexts[k] || null });
    }
    const data = await askRecap({
      model,
      max_tokens: thinksFirst(model) ? RECAP_ROOM_THINK : RECAP_ROOM,
      system: [
        { type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: ask.rule },
      ],
      messages: [{ role: "user", content: ask.content }],
    });
    recordUsage(data, true);
    // 没写完的不要（写到上限被截断、屋子满了、那边不肯写）：断掉的正是最后那几样（还没聊完的话头）
    if (data.stop_reason && data.stop_reason !== "end_turn" && data.stop_reason !== "stop_sequence") throw new Error("没写完");
    const text = cleanRecap((data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n"));
    if (!text) throw new Error("没写出字");
    // 抄的工夫里这段对话被删了：不存
    if (!alive()) return "gone";
    // 单子现取现存：这工夫里别的设备也可能抄了一份
    const listNow = await readRecaps(id);
    // 抄的工夫里她把上一份丢掉了（面板里的“丢掉重抄”）：这一趟是接着那一份抄的，存了的话丢掉的那几段又跟着回来了。
    // 不存，等他下回回完话从头来
    if (due.prev && !listNow.some((r) => r.id === due.prev.id)) return "later";
    const rec = nextRecap(due, text, msgs, { id: newId(), at: Date.now(), model: data.model || model });
    // 抄的工夫里对话照常在变（她又说了话、改了前面的、翻了版本）：这一份认的是 upto 那一条，那一条还摆在外面它就作数，
    // 不在了就先搁着（翻回来又作数），所以不用再对一遍
    const next = addRecap(listNow, rec);
    const ok = await store.set(RECAP_KEY + id, JSON.stringify(next));
    if (!ok) markStorageFail();
    if (here()) setRecaps(normRecaps(next));
    return "done";
  };

  // 她点开一份提要、觉得抄得不对：把最近抄的这一份丢掉。单子里更早的那份（没有这一趟的）接着作数；
  // 他下回回完话，这一趟会重抄。原话一条不动。
  // 丢了以后没有别的作数的了（头一趟；或者连着丢了好几回、前面留的几份都丢完了），丢的就是整份，下回从头抄
  const dropRecap = async (rec) => {
    const id = chatIdRef.current;
    const next = (await readRecaps(id)).filter((r) => r.id !== rec.id).map(({ text, ...r }) => r);
    if (next.length) {
      const ok = await store.set(RECAP_KEY + id, JSON.stringify(next));
      if (!ok) markStorageFail();
    } else store.del(RECAP_KEY + id);
    if (chatIdRef.current === id) setRecaps(normRecaps(next));
    setRecapView(null);
    setToast(pickRecap(messagesRef.current, next).recap ? "丢掉了，他下回回完话会重抄" : "整份丢掉了，他下回回完话从头抄");
  };

  // 删掉的对话留下的提要：收掉。平常删对话的时候就一起删了（deleteChat）；这里收的是漏网的：
  // 还是旧包的那台设备删的对话（它不认得提要）；这台设备正抄着的时候，那段对话在另一台设备上被删了。
  // 只收“目录里没有、对话也没有、抄了一个钟头以上”的。手上有这样的才动：先同步一遍，
  // 同步成了、手上没有没传上去的，再看一遍还是这样，才删（它的对话可能只是还没同步过来）
  const sweepRecaps = async () => {
    if (document.visibilityState !== "visible") return;
    const orphans = async () => {
      const out = [];
      for (const key of store.keys(RECAP_KEY)) {
        const id = key.slice(RECAP_KEY.length);
        if (recapJob.current.busy.has(id) || indexRef.current.some((c) => c.id === id) || (await store.get("kfs2:chat:" + id)) != null) continue;
        const newest = normRecaps(safeParse(await store.get(key), [])).reduce((t, r) => Math.max(t, r.at || 0), 0);
        if (Date.now() - newest >= SWEEP_AGE) out.push(key);
      }
      return out;
    };
    if (!(await orphans()).length) return;
    await store.syncNow();
    let state = null;
    store.onStatus((st) => {
      state = st;
    })();
    if (!state || state.offline || state.syncing || state.pending) return;
    for (const key of await orphans()) store.del(key);
  };

  latest.current = { checkMail, openFromNotice, leaving, resendSoon, runRecaps, sweepRecaps, stopVoice, freshMotto };

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
    const sweepTimer = setTimeout(() => latest.current.sweepRecaps().catch(() => {}), SWEEP_WAIT);
    // 新路通不通还不知道的时候（开机那一下没网、没问成）再问一声；已经知道了就什么都不做。
    // 回到眼前的那一下晚一点问：iOS 上一回来就发的请求会悬很久
    let warmTimer = null;
    const warmSoon = (ms) => {
      clearTimeout(warmTimer);
      warmTimer = setTimeout(() => getRelay().warm(), ms);
    };
    // 上回没念完的语音条（开封府被系统收掉了）：接着念；她不在眼前的时候停下的，回来接着念。
    // 回到眼前的那一下晚一点念：iOS 上一回来就发的请求会悬很久。
    // “他能发语音”关着的（上回记下的是开着的时候的）：不念了
    const resumeVoices = () => {
      const sp = getSpeaker();
      if (settingsRef.current.voice) sp.resume();
      else if (sp.wanting().length) sp.halt();
    };
    let voiceTimer = setTimeout(resumeVoices, 1200);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        backAtRef.current = Date.now();
        latest.current.checkMail();
        warmSoon(700);
        clearTimeout(voiceTimer);
        voiceTimer = setTimeout(resumeVoices, 700);
        latest.current.freshMotto();
        // 她不在的时候有一句话没连上、没送成：现在补发（晚一点发，躲开刚回来那一下）
        if (backResend.current.size) {
          const again = Array.from(backResend.current);
          backResend.current.clear();
          again.forEach((id) => latest.current.resendSoon(id));
        }
        // 她不在的时候该抄还没动手的前情提要：歇一下再抄
        if (recapJob.current.want.size) {
          clearTimeout(recapJob.current.timer);
          recapJob.current.timer = setTimeout(() => latest.current.runRecaps(), RECAP_BACK);
        }
      } else {
        hidesRef.current++;
        latest.current.leaving();
        latest.current.stopVoice(); // 切走了：正放着的语音停下（iPhone 自己也会停，画面上跟着停）
      }
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
      clearTimeout(voiceTimer);
      clearTimeout(mailTimer.current);
      clearTimeout(recapJob.current.timer);
      clearTimeout(sweepTimer);
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
  // 下一条要冒出来的是语音条：它眼下什么样子（还不知道是 "?"；不是语音条是 ""）
  const nextVoice = useMemo(() => {
    if (!reveal) return "";
    const msg = messages.find((m) => m.id === reveal.id);
    const it = msg && msg.items && msg.items[reveal.count];
    if (!it || it.type !== "voice") return "";
    const st = voices[voiceKeyOf(msg.id, reveal.count)];
    return st ? st.s : "?";
  }, [reveal, messages, voices]);
  // 轮到语音条、它还没念好：等着（最多 HOLD_MS），顶上写“正在录音…”
  const voiceHolding = nextVoice === "?" || nextVoice === "load" || nextVoice === "wait" || nextVoice === "busy";
  useEffect(() => {
    if (!reveal) return;
    const msg = messages.find((m) => m.id === reveal.id);
    if (!msg || reveal.count >= msg.items.length) {
      holdRef.current = null;
      setReveal(null);
      return;
    }
    const nextItem = msg.items[reveal.count];
    const step = () => setReveal((r) => (r && r.id === msg.id && r.count === reveal.count ? { id: r.id, count: r.count + 1 } : r));
    let delay;
    if (nextItem.type === "voice") {
      const key = voiceKeyOf(msg.id, reveal.count);
      if (nextVoice === "?") getSpeaker().look(key); // 还不知道它什么样子（存档里有没有、要不要念）：看一眼
      if (nextVoice === "wait") getSpeaker().hurry(key); // 前头还排着别的（上一条回话里的）：先念画面正等着的这一条
      if (voiceHolding) {
        if (!holdRef.current || holdRef.current.key !== key) holdRef.current = { key, at: Date.now() };
        const t = setTimeout(step, Math.max(0, HOLD_MS - (Date.now() - holdRef.current.at)));
        return () => clearTimeout(t);
      }
      // 念好了（或者念不成）：歇一下就冒出来
      delay = holdRef.current && holdRef.current.key === key ? 300 : 700;
    } else {
      delay =
        nextItem.type === "meme"
          ? 750
          : nextItem.type === "doc"
          ? 900
          : nextItem.type === "avatar"
          ? 650
          : Math.min(1900, 550 + (nextItem.text ? nextItem.text.length : 0) * 28);
    }
    const t = setTimeout(step, delay);
    return () => clearTimeout(t);
  }, [reveal, messages, nextVoice]);

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
      voice: !!st.voice,
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
不要写<thinking>，不要[SPLIT]、[MEME]、[AVATAR]、[NAME]、[DOC]、[VOICE]，不要动作描写的星号，不用破折号。`;
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
      localStorage.removeItem(RECAP_BAD_KEY);
      localStorage.removeItem(WANT_KEY); // 要念还没念的语音条（换了人登录，不替上一位念）
      localStorage.removeItem(HEARD_KEY);
      localStorage.removeItem(MOTTO_LAST);
    } catch (e) {}
    stopVoice();
    if (account.signOut) account.signOut();
  };

  // ---- 侧滑手势 ----
  // 只认一根手指。落下了第二根，这一回就不算划侧栏了（拖到一半的弹回去），等手指全抬起来再从头认：
  // 整页不许捏以后，两根手指往里一捏，头一根正好是往右走的，原来会被当成右划、把侧栏带出来
  const onTouchStart = (e) => {
    if (sheet || historyOpen || splash || viewer || menu || diaryOpen || docView || recapView) return;
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
    if (sheet || historyOpen || splash || viewer || menu || diaryOpen || docView || recapView) {
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
  // 聊天记录里那行“抄成了提要”的小字：只摆眼下作数的那一份（单子里更早的几份不摆，它们已经被这一份接过去了）
  const liveRecap = useMemo(() => pickRecap(messages, recaps).recap, [messages, recaps]);
  const rows = useMemo(() => buildRows(messages, reveal, stoppedId, liveRecap), [messages, reveal, stoppedId, liveRecap]);
  rowListRef.current = rows;
  // 打开 API 面板：看一眼念语音的小后端接上没有
  useEffect(() => {
    if (sheet === "api") checkVoice();
  }, [sheet]);
  // 冒出来的语音条：还不知道它什么样子的（存档里有没有念好的），看一眼
  useEffect(() => {
    for (const r of rows) {
      if (r.type !== "bubble" || r.role !== "him" || r.item.type !== "voice") continue;
      const k = voiceKeyOf(r.msg.id, r.idx);
      if (!voicesRef.current[k]) getSpeaker().look(k);
    }
  }, [rows]);
  // 空着的那一页一冒出来（开机、新开一段、删了眼前这段）就抽一句；她看着的时候不换。素材库改了、同步过来了，也重抽一句。
  // 开机那一遍读完了才抽（booted）：上回那段要是还在等他回话，开门就是那段，不是空着的这一页，白抽一句会占掉“上一回抽到的”
  const blank = messages.length === 0;
  useEffect(() => {
    if (blank && booted) pickLine();
  }, [chatId, blank, mottoLib, booted]);
  // 她关了“他能发语音”（这台设备上关的，或者别的设备上关了同步过来）：还没念的不念了，正念着的掐掉。念好的留着照样能放
  useEffect(() => {
    if (!settings.voice && speakerRef.current) speakerRef.current.halt();
  }, [settings.voice]);
  // 面板里那一份丢掉以后，还有没有更早的一份接着作数（没有的话，丢的就是整份：面板里的字照实写）
  const recapFallback = useMemo(() => !!recapView && !!pickRecap(messages, recaps.filter((r) => r.id !== recapView.id)).recap, [messages, recaps, recapView]);
  // 提要的面板开着的工夫里又抄了一趟（或者另一台设备抄的同步过来了）：面板跟着换成眼下作数的那一份。
  // 她看到的、点“丢掉重抄”丢的，都是这一份；作数的那份没了（另一台设备丢掉了）就把面板收起来
  useEffect(() => {
    if (!recapView || (liveRecap && liveRecap.id === recapView.id)) return;
    setRecapView(liveRecap || null);
    setRecapArmed(false);
  }, [liveRecap]);
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
  const chatOnTop = !splash && !sheet && !historyOpen && !diaryOpen && !menu && !viewer && !copySheet && !chatMenu && !renaming && !docView && !recapView;
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
    if (sheet === "motto") {
      return (
        <Sheet title="中间那行字" onClose={() => setSheet("account")}>
          <MottoPanel text={mottoText} draftRef={mottoDraftRef} onSave={saveMotto} onDone={() => setSheet("account")} />
        </Sheet>
      );
    }
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
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>中间那行字</div>
          <button
            onClick={() => setSheet("motto")}
            className="kfs-tap kfs-motto-entry w-full text-left"
            style={{ ...glass(0.5, 16), borderRadius: 16, padding: "12px 14px", marginBottom: 22, display: "block" }}
          >
            <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.5 }}>
              {(() => {
                const seen = describeMotto(mottoLib);
                return seen.total ? `放了 ${seen.total} 句：${seen.slots.length} 个时段、${seen.days.length} 个日子` : `还没放素材库，中间写的是“${DEFAULT_MOTTO}”`;
              })()}
            </div>
            <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>新开一段时对话正中间那一行。点这里放素材库、改句子</div>
          </button>
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
          <PushPanel email={account.email} onCopy={copyText} back={noticeBack} voiceOn={!!settings.voice} mailStatus={() => getRelay().status()} onReplyReady={() => getRelay().learn(true)} />

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
        <Sheet title="API" onClose={() => { setSheet(null); setTestNote(""); setVoiceTestNote(""); }}>
          <ApiPanel
            settings={settings}
            onChange={(patch) => {
              updateSettings(patch);
              setTestNote("");
            }}
            voiceCheck={voiceCheck}
            onVoiceTest={testVoice}
            voiceTestNote={voiceTestNote}
            voiceTesting={voiceTesting}
            onTest={testApi}
            testNote={testNote}
            testing={testing}
            usage={usage}
            monthUsage={monthUsage}
            recapUsage={recapUsage}
            fit={recallTier(buildSystem({ now: new Date(), memeList: allMemes, hisAvatarName: "", memDocs: memFiles.filter((f) => f.enabled).map((f) => ({ name: f.name, content: memTexts[f.id] || "" })), mcpNames: [], voice: !!settings.voice }).staticText)}
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
            {/* 头一个方块上写“万岁殿”（卿卿 10 月 10 日改的，原来写“记忆库”）。只换了方块上这三个字：点开以后面板顶上的标题、
                空对话里“记忆库还是空的”那一句、寄给那边的【记忆库】（prompt/system.js）都没动，还叫记忆库 */}
            <Tile icon="doc" label="万岁殿" sub={memFiles.length ? `带着 ${enabledDocs} 份文档` : "放文档"} onClick={() => setSheet("memory")} />
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
                {/* 回话蹦到语音条、正等它念好：写“正在录音…” */}
                {voiceHolding ? "正在录音…" : "正在输入…"}
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
              {/* 中间那行字：素材库里按时段、按日子抽的那一句（见 motto.js）；还没放素材库的照旧是“如月之恒，官家在这”。
                  长的（七夕那几句诗）一句一行，居中 */}
              <p className="kfs-motto" style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 2, letterSpacing: "0.3em", paddingLeft: "0.3em", textAlign: "center", color: T.motto }}>
                {mottoLines(motto || DEFAULT_MOTTO).map((line, i) => (
                  <span key={i} style={{ display: "block" }}>
                    {line}
                  </span>
                ))}
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
            if (row.type === "recap") {
              return <RecapRow key={row.key} onOpen={() => setRecapView(row.recap)} />;
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
                voices={voices}
                heard={heard}
                playing={playing}
                onVoice={playVoice}
                onVoiceAgain={(r) => getSpeaker().again(chatIdRef.current, voiceKeyOf(r.msg.id, r.idx), r.item.text)}
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
          heard={menu.row.role === "him" && menu.row.item.type === "voice" && heard.has(voiceKeyOf(menu.row.msg.id, menu.row.idx))}
          // 念不成、没人念的那种气泡上已经把字摆出来了：不给“转文字”
          hearable={!(menu.row.role === "him" && menu.row.item.type === "voice" && voiceAsText(menu.row))}
          onClose={() => setMenu(null)}
          onHeard={(r) => toggleHeard(voiceKeyOf(r.msg.id, r.idx))}
          // 他的语音条复制的是转出来的字（语气标签不带）；字摆在气泡上的那种，复制摆着的那些
          onCopy={(r) =>
            copyText(
              r.item.type === "doc"
                ? r.item.text || docsRef.current[r.item.docId] || ""
                : r.role === "him" && r.item.type === "voice"
                ? voiceAsText(r)
                  ? shownOf(r.item.text)
                  : heardOf(r.item.text)
                : r.item.text || ""
            )
          }
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

      {/* 点开看的那份前情提要：他抄了什么，她看得见。只看、能复制、不能改；抄得不对可以把最近抄的这一趟丢掉，让他重抄 */}
      {recapView && (
        <Sheet
          title="前情提要"
          onClose={() => {
            setRecapView(null);
            setRecapArmed(false);
          }}
        >
          <p className="kfs-recap-about" style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.65, marginTop: -8, marginBottom: 12 }}>
            这段对话聊长了。这一行以前的{recapView.n ? ` ${recapView.n} 条` : ""}原话不再每次寄给他，换成他自己抄的这一份；这一行以后的照旧寄原话。原话都还在你这儿，往上翻就是。
          </p>
          <div className="kfs-recap-meta" style={{ fontSize: 12, color: T.inkSoft, marginBottom: 10 }}>
            {[recapView.ts ? `抄到 ${sepLabel(recapView.ts, now)} 为止` : "", `${recapView.parts.length} 段`, fmtChars(recapView.text.length), recapView.more ? "还没抄完，他回完话接着抄" : ""].filter(Boolean).join("，")}
          </div>
          <div
            className="kfs-recap-body whitespace-pre-wrap break-words"
            style={{ ...glass(0.42, 12), borderRadius: 18, padding: "14px 14px", fontSize: 14, lineHeight: 1.75, color: T.ink, userSelect: "text", WebkitUserSelect: "text" }}
          >
            {recapView.text}
          </div>
          <div className="flex flex-wrap" style={{ gap: 8, marginTop: 14 }}>
            <button onClick={() => copyText(recapView.text)} className="kfs-tap" style={chip}>
              复制
            </button>
            <button
              onClick={() => {
                if (!recapArmed) {
                  setRecapArmed(true);
                  return;
                }
                setRecapArmed(false);
                dropRecap(recapView);
              }}
              className="kfs-tap"
              style={{ ...chip, color: "#A8473D" }}
            >
              {!recapArmed ? "抄得不对，丢掉重抄" : recapFallback ? "再点一次，丢掉最近抄的这一趟" : "再点一次，整份丢掉从头抄"}
            </button>
          </div>
          <p className="kfs-recap-drop-note" style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 8, lineHeight: 1.6 }}>
            {recapFallback ? "丢掉的只是最近抄的那一趟，他下回回完话会重抄。原话一条不动。" : "前面没有留着更早的一份了：丢的是整份提要，他下回回完话从头抄。原话一条不动。"}
          </p>
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
