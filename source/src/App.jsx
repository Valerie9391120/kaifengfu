import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { store } from "./store.js";
import { callClaude, callReply, callVoice, mailbox, freshToken } from "./cloud.js";
import { VOICE_KEY, HOLD_MS, WANT_KEY, HEARD_KEY, HEARD_MAX, VOICE_SAMPLE, voiceKeyOf, voicesIn, heardOf, shownOf, stabOf, secondsOf, readHeard, readVoice, packVoice, collectHisIds, voiceWhere, silentMp3 } from "./voice.js";
import { createSpeaker } from "./speaker.js";
import { MOTTO_KEY, MOTTO_LAST, DEFAULT_MOTTO, parseMotto, pickMotto, poolAt, fillMotto, mottoLines, readMotto, packMotto, describeMotto } from "./motto.js";
import { MottoPanel } from "./panels/MottoPanel.jsx";
import { openProbe } from "./probe.js";
import { createFollow } from "./scroll.js";
import { createSlide } from "./slide.js";
import { gapInfo, setFill } from "./gap.js";
import { THEMES, useTheme, setTheme, entranceTheme, entranceUrl } from "./theme.js";
import { HER_NAME, HIS_NAME, NAME_KEYS, cleanName, tidyName } from "./names.js";
import { DOC_KEY, DOC_FMT, docFmtOf, readDoc, replyRoom } from "./docs.js";
import { parseReply, settleAvatarItems, rawOf } from "./reply.js";
import { forkAt, switchAlt, needsReply, insertReply, answeredAfter, hasJob, mailFit, mailPut, mailBefore, markStopped, unmarkStopped, stoppedAt, cutReply, stillWaiting, midTurn } from "./thread.js";
import { GAME_PREFIX, SNAP_KEY, ON_KEY, TOOLS as GAME_TOOLS, GAME_NAMES, OFF_CALL, isGameChat, gameOn, readOn, hasSteps, needsRun, lastStep, boardIn, collectStepIds, runCalls, nanyaSub } from "./game/jianghu.js";
import { DIARY_TOOLS, DIARY_NAMES, DIARY_KEY, isDiaryCall, runDiaryCalls, toolCallsOf } from "./diaryTools.js";
import { GameStrip, GameCardRow, JianghuPanel } from "./game/GameParts.jsx";
import { createRelay, parseReplyMark, chatTag, resultOk, explainResult, JOBS_KEY, RELAY_KEY, HALTED_KEY } from "./mail.js";
import { disablePush, resyncPush, watchNotices, probeReply, knockList, clearReplyNotices } from "./push.js";
import { WEEK, sepLabel, timeAgo } from "./days.js";
import { newId, fmtChars } from "./util.js";
import { MEME_DATA, MEME_MAP, RAW_BASE, memeSrc, newMemesFrom, parseReadme } from "./memes.js";
import { urlToThumb, fileToPhoto } from "./images.js";
import { DEFAULT_MODEL, modelLabel, costOf, money, usageKey, windowOf, thinksFirst } from "./models.js";
import { RECAP_KEY, RECAP_BAD_KEY, normRecaps, pickRecap, tierOf, roomFor, dueRecap, splitForMerge, nextRecap, cleanRecap, addRecap, mayRetry, afterFail, afterAway, loadBad } from "./recap.js";
import { dayKeyOf, parseDayKey, moodOf, dayTranscript, parseDiary } from "./diary.js";
import { WALL, SERIF, SANS, T, glass, fill, DOCK_GLASS, chip, chipPrimary, field, GLOBAL_CSS, HAIR, HAIRLINE, FLOAT_SHADOW } from "./ui/style.js";
import { Icon } from "./ui/Icon.jsx";
import { HIS_DEFAULT, Avatar } from "./ui/Avatar.jsx";
import { Glows, IconBtn, SHEET_TITLE, Sheet, Toggle, RoundBtn } from "./ui/parts.jsx";
import { buildSystem, withNowNote } from "./prompt/system.js";
import { sameAv, buildMessages, dataUrlBlock } from "./prompt/messages.js";
import { buildRecapAsk, buildMergeAsk } from "./prompt/recap.js";
import { DaysCard, Tile, HistoryCard } from "./side/Cards.jsx";
import { ChatMenu } from "./side/ChatMenu.jsx";
import { LotusPage } from "./panels/LotusPage.jsx";
import { QxPage } from "./qx/QxPage.jsx";
import { LotRow } from "./qx/LotRow.jsx";
import { QX_KEY, QX_TOOLS, QX_NAMES, CUT_QX, QX_FAIL_NOTE, isQxCall, readPool, packPool, emptyPool, runQxCalls, qxSection, poolSize, hasLots, cleanLines } from "./qx/pool.js";
import { ROOM_TOOLS, ROOM_NAMES, isRoomCall, runRoomCalls, roomSection, cutRoom, localDay } from "./room.js";
import { buildRows } from "./chat/rows.js";
import { makeTitle, makePreview, collectImgIds, collectDocIds } from "./chat/overview.js";
import { BubbleRow } from "./chat/Bubble.jsx";
import { CtrlRow, ThinkingRow, NoticeRow, TypingRow, RecapRow } from "./chat/Lines.jsx";
import { AskCard, AskRow } from "./chat/AskCard.jsx";
import { answerText } from "./ask.js";
import { MsgMenu } from "./chat/MsgMenu.jsx";
import { SplashByTheme } from "./Splash.jsx";
import { NickTitle } from "./panels/NickTitle.jsx";
import { MdView } from "./panels/MdView.jsx";
import { DiaryPage } from "./panels/DiaryPage.jsx";
import { JZCFG_KEY, materialsOf } from "./jz/model.js";
import { dayWeather } from "./jz/weather.js";
import { HistoryPage } from "./panels/HistoryPage.jsx";
import { HisAvatarCard, AvatarSection } from "./panels/AvatarSection.jsx";
import { MemoryPanel } from "./panels/MemoryPanel.jsx";
import { McpPanel } from "./panels/McpPanel.jsx";
import { ApiPanel } from "./panels/ApiPanel.jsx";
import { PushPanel } from "./panels/PushPanel.jsx";
import { ModelPanel } from "./panels/ModelPanel.jsx";
import { NanyaPanel, soonToast } from "./panels/NanyaPanel.jsx";
import { BOX_KEY, BOX_AUDIO, packEntry, keptText, listEntries, sameVoiceIds, findBySrc, boxSub } from "./cangyin/parts.js";
import { CangyinPage, TRAD_KEY } from "./cangyin/CangyinPage.jsx";
import { CallPage } from "./call/CallPage.jsx";
import { FOX_CHAT, FOX_TITLE, FOX_STATE, FOX_DOORS, FOX_TASK, isFoxChat, wakeOn, readFoxState, foxSub, taskNote } from "./fox.js";
import { FoxSection } from "./panels/FoxSection.jsx";
import { FoxNotePad } from "./chat/FoxNotePad.jsx";
import { createListener, pauseOf } from "./call/listen.js";
import { createSayer, segmentsOfReply, segmentsOfItems } from "./call/say.js";
import { emptySubs, herLive, herDone, hisSay } from "./call/subs.js";
import { createCallAudio, DUCK } from "./call/play.js";
import { createMic } from "./call/mic.js";
import { createHearer } from "./call/hear.js";
import { HELLOS, HELLO_KEY, HELLO_LAST, HELLO_WAIT, pickHello } from "./call/hello.js";
import { createEchoProbe, ECHO_LINE, ECHO_KEY } from "./call/echo.js";
import { EchoProbe } from "./call/EchoProbe.jsx";
import { pendingCall, ringLeft, CALL_RING_MS } from "./call/incoming.js";
import { createBarge, echoOf, ackOnly, cutPlan, cutItems } from "./call/barge.js";
import {
  TY_IMG,
  TY_KV,
  TY_LS,
  TY_LAYOUTS,
  TY_STYLES,
  TY_PHOTO_MAX,
  TY_STALE,
  TY_WAIT,
  madeDays,
  infoOf,
  notesOf,
  addNoteTo,
  dropNoteOf,
  openMode,
  migrateAll,
  fillWeather,
  tyReader,
  dayRecOf,
  pageRecOf,
  herLookOf,
  tyArrangeAsk,
  parseTyArrange,
  makingDay,
  failedDay,
  arrangedDay,
  settleStale,
  tyTag,
  tyChanged,
  onTyChanged,
} from "./tongye/host.js";
import { IncomingCall } from "./call/IncomingCall.jsx";
import { isCallMark } from "./call/marks.js";

/* =========================================================
   开封府 v5 · 独立版
   代码里不写私事：人设和记忆在加密的记忆库里。
   ========================================================= */

// 江湖棋局的引擎（见 game/engine.js）：单独一包，build.mjs 打成 assets/jianghu-<指纹>.js，名字写进 __KFS_JIANGHU__。
// 开封府开门不碰它，头一回要替他调引擎的时候才取；取不到（网不好）这一回不记，下回再取
/* global __KFS_JIANGHU__ */
const JIANGHU_URL = typeof __KFS_JIANGHU__ !== "undefined" ? __KFS_JIANGHU__ : "./jianghu.js";
let enginePromise = null;
const loadEngine = () => {
  // 照这一包自己的地址找（两个入口都一样：它和这一包在同一个目录）；写成 new URL(...) 是不让打包的时候把它当成要一起打进来的东西
  if (!enginePromise) enginePromise = import(new URL(JIANGHU_URL, import.meta.url).href).catch((e) => {
    enginePromise = null;
    throw e;
  });
  return enginePromise;
};

const MAX_STEPS = 12; // 江湖棋局里他一口气连着调引擎、还没说完的，接到这么多步就不自己接了（见 afterStep）
// 这台设备的编号：只记在这台设备上，不同步。要回话的时候写进条子（info.extra.from；江湖棋局那段另写一份 info.extra.dev，原来就有），
// 回来的要是一步棋、或者他翻日记的一步，先让发那一回的设备替他调（见 applyMail）。存不住的（无痕模式）这一趟用一个
const DEVICE_ID = (() => {
  try {
    const had = localStorage.getItem("kfs-dev");
    if (had) return had;
    const id = "d" + newId();
    localStorage.setItem("kfs-dev", id);
    return id;
  } catch (e) {
    return "d" + newId();
  }
})();
const STEP_GRACE = 2 * 60 * 1000; // 别的设备发的那一回、回来的是一步棋（或者翻日记的一步）：先等发的那台放这么久，它还没放（多半关着），这台再替它放
// 他调了引擎、回话却没停在 tool_use 上（写到长度上限被截断了）：调的那几样多半没写完整，一样不调，递回去的是这一句
const CUT_CALL = "没执行：这一回的回话没写完整（多半是写到长度上限被截断了），这一步没下。要下的话重新调一次。";
const CUT_DIARY = "没翻：这一回的回话没写完整（多半是写到长度上限被截断了），日记没替你翻。要翻的话重新调一次。";
// 他回话里认哪几样工具是要开封府在手机上替他办的：江湖棋局那四样、翻日记那几样、秘戏钱匣里抽签那一样（MCP 的那头自己办，不归这里）
const CALL_NAMES = new Set([...GAME_NAMES, ...DIARY_NAMES, ...QX_NAMES, ...ROOM_NAMES]);
// 这一回是不是这台设备发的（江湖棋局那段原来只写 dev；10 月 18 日起每一回都写 from）
const ownJob = (info) => !!(info && info.extra && (info.extra.dev === DEVICE_ID || info.extra.from === DEVICE_ID));

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

// 打字的框最高多少（照微信，八行上下；见 fitComposer）
const COMPOSE_MAX = 200;

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
  // 她在打字（输入框有焦点）：输入框变成一行（见底下“输入框”那一块）
  const [taFocus, setTaFocus] = useState(false);

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
  // 江湖棋局里他说到一半（掷了骰子、等结果）、这台设备刚替他调完引擎的那一段对话：那一条蹦完就接着要后半截（见“接着说”那一段）。
  // 只记这台设备这一回放进去的：别的设备同步过来的、上回打开时留下的，不自己接（底下摆一行“还没说完，点这里让我接着说”）
  const [cont, setCont] = useState("");
  const contRef = useRef("");
  // 回话到手了、正在替他调引擎、还没放进对话的那几回（askGuangyi 里，记的是 job）：信箱那头看到同一回先别放（见 applyMail）
  const settlingRef = useRef(new Set());
  // 她在哪几段平常对话里摆开了江湖棋局的棋盘（南衙里“就在这段对话里下”；ON_KEY 那一条，跟着云端走，见 game/jianghu.js）
  const [onSet, setOnSet] = useState(() => new Set());
  const onSetRef = useRef(new Set());
  const isOn = (id) => gameOn(id, onSetRef.current);
  const applyOnSet = (next) => {
    onSetRef.current = next;
    setOnSet(next);
  };
  // 摆开、收棋：改单子、存（存不进去的照旧挂那一条“写不进去”）
  const setBoardOn = (id, on) => {
    const next = new Set(onSetRef.current);
    if (on) next.add(id);
    else next.delete(id);
    applyOnSet(next);
    store.set(ON_KEY, JSON.stringify([...next])).then((ok) => {
      if (!ok) markStorageFail();
    });
  };
  const armCont = (id) => {
    contRef.current = id;
    setCont(id);
  };
  const disarmCont = () => {
    contRef.current = "";
    setCont("");
  };
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
  // 选项卡（他弹给她的几道选择题，见 ask.js、chat/AskCard.jsx）：眼下浮在输入框上面的是哪一张（{ msgId, idx }，没有是 null）。
  // ref 跟着：她发话那一下（sendHer）要当场知道开着没有
  const [askView, setAskViewState] = useState(null);
  const askViewRef = useRef(null);
  const setAskView = (v) => {
    askViewRef.current = v;
    setAskViewState(v);
  };
  const [dictating, setDictating] = useState(false);
  const recRef = useRef(null);
  // 正在打电话（见 call/ 和开发说明“通话”那一节）：call 是通话页上摆的样子；callRef 里还有听写、念、放声音的那几样
  const [call, setCall] = useState(null);
  const callRef = useRef(null);
  // 他写不写心里话：照“头像与设置”里的开关（默认开着）；正在打电话的那段对话照关着算（她 10 月 15 日要的，
  // 见开发说明“电话里心里话自动关着”）。开关本身不动：挂了就照开关，打到一半开封府被系统收掉，回来开关也不会卡在关着。
  // 聊天、抄提要拼名帖都照这个：同一段对话两处的名帖一个字不差，缓存才接得上
  const thoughtsFor = (chatId) => settingsRef.current.thoughts !== false && !(callRef.current && callRef.current.chat === chatId);
  const [echo, setEcho] = useState(null); // 量一量回声（见 call/echo.js）：那一页眼下的样子
  const echoRef = useRef(null);
  const [ring, setRing] = useState(null); // 他打来的电话正在响（见 call/incoming.js）
  const ringRef = useRef(null);
  const [seenTick, setSeenTick] = useState(0); // 她回到眼前一回加一（他打来的电话等她在眼前再认）
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
  const [menu, setMenu] = useState(null);
  const [diaryOpen, setDiaryOpen] = useState(false);
  // 藏音匣（见 cangyin/）：开着没有；里面那几条（从新到旧，parts.js 的 listEntries）
  const [boxOpen, setBoxOpen] = useState(false);
  const [boxList, setBoxList] = useState([]);
  const boxRef = useRef([]);
  // 藏音匣借走了放声音的东西（见 boxAudio）：这边要停下它的时候（切到后台、来电话）告诉那一页一声
  const audioOwner = useRef(null);
  const [diaryToday, setDiaryToday] = useState({ her: false, him: false });
  // 狐宇宙（见 fox.js）：闹钟写的那一份（醒着没有、下回几点醒、还活着没有）
  const [foxState, setFoxState] = useState(null);
  const diaryCache = useRef({});
  const dayMsgsRef = useRef({});
  const chatDaysRef = useRef({}); // 同上，聊天的（狐宇宙不算）；见 loadDays
  const foxDaysRef = useRef({}); // 同上，狐宇宙里的
  const daysAtRef = useRef(0); // 上一回按天归好是几点（0：还没归过）
  const daysRunRef = useRef(null); // 正在归的那一趟
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
  const [lotusArmed, setLotusArmed] = useState(false); // 长按了日期卡片：卡片最底下那行换成了“去看并蒂莲”
  const [lotusOpen, setLotusOpen] = useState(false); // 并蒂莲那一层开着
  const [qxOpen, setQxOpen] = useState(false); // 秘戏钱匣那一层开着（见 qx/QxPage.jsx）
  const [qxPool, setQxPool] = useState(emptyPool); // 秘戏钱匣的签库（kfs2:qx:pool，见 qx/pool.js）
  const qxPoolRef = useRef(qxPool); // 替他抽签的时候用（settleCalls 在回调里，拿最新的）
  qxPoolRef.current = qxPool;
  // 秘戏钱匣开着：她丢进聊天的签先攒着，他先不回，关上了再回（见 openQx、closeQx、scheduleReply、triggerReply）。
  // owe：开着的这一阵里有要回的（她丢了签、进来之前刚说完一句、别处想叫他回被拦下了）。关上的时候只认这个：
  // 什么都没丢、也没拦下过，就不替她叫他（江湖棋局里“点这里让我接着说”的那一步、别的设备的那一步，照旧不自己接）
  const qxHold = useRef({ on: false, owe: false });
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
  const winRef = useRef(null); // 对话窗那一整块（侧栏出来的时候往右让开的就是它）
  const slideRef = useRef(null); // 它怎么滑（见 slide.js，下面量 x 的地方接上）
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
      applyOnSet(readOn(await store.get(ON_KEY)));

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

      // 日记（界面上叫“闲笔集”）：今天写了没
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
      // 一回还算不算在等，照 thread.js 的 stillWaiting（10 月 10 日夜里卿卿报了“划掉重新打开还是回到旧对话”以后改的）：
      // 平常的话得是“那一句还在、它后面一句他的话都没有”。原来只看紧跟着的那一句：一句没送成、她没点重发又说了一句、
      // 两句一起回上了的，为头一句记着的那一回没人划，会一直当它在等，一天里每回重新打开都回到那段。
      // （头一句那一回要是其实到了小后端、回话晚些才进信箱：照旧悄悄插在那一句后面，不为它回到那段。）
      // 重新回答的那一回照旧只要记着就算，除非看过信箱、认准它没着落了（记着 dead，见 checkMail 最后那一段），
      // 或者它接的那一句不在外面摆着了。所以没着落的重新回答最多认错到下一回看成信箱为止
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
            .some((r) => now - r.at < WAITING_MAX && stillWaiting(msgs, r));
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

      refreshBox();
      refreshFox();
      refreshQx();
      setBooted(true);
    })();
  }, []);

  // ---- 狐宇宙：“他自己醒”开着的时候，这台手机报门牌号（他找她的时候敲这一台，同 push.js 的 knockList） ----
  // 存成 { 设备编号: { e: 门牌号, at: 几点报的 } }：好几台手机各报各的，谁也不顶掉谁（闹钟敲的时候新报的排前头，
  // 登记簿里已经没有的不敲，见 alarm/wake.js 的 doorsOf）。关了“他自己醒”、这台关了通知、门牌号换了（重新订过），
  // 回到眼前、收起面板的时候跟着改；没变不写（头一版存的是光一个门牌号，碰上了换成新样子）
  useEffect(() => {
    if (!booted) return;
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      let doors = safeParse(store.peek(FOX_DOORS), null);
      if (!doors || typeof doors !== "object" || Array.isArray(doors)) doors = {};
      const mine = wakeOn(settingsRef.current) ? knockList()[0] || "" : "";
      const had = doors[DEVICE_ID];
      if (mine ? had && typeof had === "object" && had.e === mine : !had) return;
      const next = { ...doors };
      if (mine) next[DEVICE_ID] = { e: mine, at: Date.now() };
      else delete next[DEVICE_ID];
      store.set(FOX_DOORS, JSON.stringify(next));
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [booted, settings.wake, sheet]);

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
      if (keys.includes(ON_KEY)) applyOnSet(readOn(await store.get(ON_KEY)));
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
      // 藏音匣：别的设备存了、移出了
      if (has(BOX_KEY)) refreshBox();
      // 狐宇宙：闹钟写了心跳
      if (has(FOX_STATE)) refreshFox();
      // 秘戏钱匣：别的设备导了签库、删了加了签、改了抽哪几样
      if (keys.includes(QX_KEY)) refreshQx();
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
    // 这一回放进去的里面有他定的闹钟（任务标记）：存之前先记下原来那一份，看是不是头一回放进来（平常一条都没有，不多解一遍）
    const marks = wakeOn(settingsRef.current) && keep.some((m) => m && m.role === "him" && typeof m.wake === "string");
    const before = marks ? safeParse(store.peek("kfs2:chat:" + id), []) || [] : null;
    const ok = await store.set("kfs2:chat:" + id, JSON.stringify(keep));
    if (!ok) markStorageFail();
    if (marks) noteTasks(id, before, keep);
    const prev = indexRef.current;
    const old = prev.find((c) => c.id === id);
    const entry = {
      id,
      // 江湖棋局的那一段（编号 jh 开头）：名字就叫“江湖棋局”，不照她头一句话起（她可以长按改名）
      title: old && old.title ? old.title : isGameChat(id) ? "江湖棋局" : isFoxChat(id) ? FOX_TITLE : makeTitle(msgs, memeLookup),
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
    // 秘戏钱匣开着的时候翻到别的对话（点了通知）：先关上，丢在眼前这段的签这就交出去（closeQx 排上、flushPending 马上送）
    if (qxHold.current.on) closeQx();
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

  // game：开的是一局江湖棋局（编号以 jh 开头，见 game/jianghu.js；南衙里“开新的一局”）
  const newChat = (game = false) => {
    if (qxHold.current.on) closeQx(); // 同 openChat
    flushPending();
    stopVoice();
    setEditing(null);
    setMenu(null);
    const id = (game === true ? GAME_PREFIX : "") + newId();
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
    // 江湖棋局：每一步另存着的棋盘（连同翻过去的那些版本里的），一起删；摆着棋盘的平常对话，单子里也拿掉
    collectStepIds(old).forEach((sid) => store.del(SNAP_KEY + sid));
    if (onSetRef.current.has(id)) setBoardOn(id, false);
    if (contRef.current === id) disarmCont();
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

  // 江湖棋局：最近那一局（历史对话里摆着棋盘的、最新的那一段：编号 jh 开头的，或者她在平常对话里摆开、还没收的）和它的棋盘。
  // 南衙里那一行的小字、点开那一张用。没有回 null
  const latestGame = () => {
    const g = indexRef.current.find((c) => isOn(c.id));
    if (!g) return null;
    const msgs = g.id === chatIdRef.current ? messagesRef.current : safeParse(store.peek("kfs2:chat:" + g.id), []) || [];
    return { id: g.id, board: boardIn(msgs) };
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
    const lost = audioOwner.current;
    audioOwner.current = null;
    const a = audioRef.current;
    if (a) {
      a.onended = null;
      a.onerror = null;
      a.onpause = null;
      a.pause();
    }
    playingRef.current = "";
    setPlaying("");
    if (lost) lost();
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

  // ---- 狐宇宙（见 fox.js）----
  // 闹钟写的那一份：引擎手里现成的，同步取。（他在屋里的动静不亮红点：她 22:04 定的）
  const refreshFox = () => {
    setFoxState(readFoxState(store.peek(FOX_STATE)));
  };

  // ---- 秘戏钱匣（见 qx/pool.js、qx/QxPage.jsx） ----
  // 签库一整份存在一条里（四百来条签，几 KB），改一下整条重存
  const refreshQx = () => {
    const p = readPool(store.peek(QX_KEY));
    qxPoolRef.current = p;
    setQxPool(p);
  };
  const saveQx = (p) => {
    qxPoolRef.current = p;
    setQxPool(p);
    store.set(QX_KEY, packPool(p)).then((ok) => {
      if (!ok) markStorageFail();
    });
  };
  // 她点了“发给光义”：这一签丢进眼前这段对话（她的一条话，kind: "lot"）。秘戏钱匣开着，他先不回（qxHold），关上了一起回。
  // 狐宇宙那段对话（他的屋子，她只留便签）里不丢：那一层不摆“发给光义”（canSend），这里也拦一道
  const sendLot = ({ coin, lines }) => {
    const ls = cleanLines(lines);
    if (!ls.length || !chatIdRef.current || isFoxChat(chatIdRef.current)) return false;
    if (qxHold.current.on) qxHold.current.owe = true;
    sendHer({ kind: "lot", coin: Number(coin) || 0, lines: ls }, { hold: true });
    return true;
  };
  const openQx = () => {
    // 她进来之前刚说完一句、还在等她停手的那两秒：先不回，记着欠一句，关上了一起回
    qxHold.current = { on: true, owe: disarm() };
    setQxOpen(true);
  };
  const closeQx = () => {
    const h = qxHold.current;
    qxHold.current = { on: false, owe: false };
    setQxOpen(false);
    // 开着的时候丢了签（或者有要回的被拦下了）、他还没回：这就回（正回着别的一段的话，记下来，回完那段轮到这里，同 triggerReply）
    if (h.owe && owes(messagesRef.current)) {
      if (loadingRef.current) pendingRef.current.add(chatIdRef.current);
      else scheduleReply(700);
    } else if (!loadingRef.current) nextPending();
  };
  // 她来他屋里转一圈，在便签纸上留了一句（FoxNotePad）：放进狐宇宙，记 note: true——不叫他、不等回话，他下回醒来看得见
  const saveFoxNote = (text) => {
    if (chatIdRef.current !== FOX_CHAT) return;
    const next = messagesRef.current.concat([{ id: newId(), role: "her", ts: Date.now(), text, note: true }]);
    messagesRef.current = next;
    follow.pin();
    setMessages(next);
    saveChat(FOX_CHAT, next);
  };
  // 任务标记（见 fox.js）：他在平常的对话里写了 [WAKE:…]（拆出来记在他那一条的 wake 上），那一条头一回放进对话的时候，
  // 记一个任务给家里的闹钟（一个任务一行：kfs2:fox:task:<他那一条的编号>）。她看不见。已经记过的不再记。
  // placed：几点放进对话的。回话在信箱里搁到她回来才放进来的，放的时候也许已经过了点：她都回来了，闹钟就不办（alarm/plan.js）
  const noteTasks = (id, prev, msgs) => {
    if (isFoxChat(id) || isGameChat(id) || !wakeOn(settingsRef.current)) return;
    const had = new Set((prev || []).map((m) => m && m.id));
    for (const m of msgs) {
      if (!m || m.role !== "him" || typeof m.wake !== "string" || had.has(m.id)) continue;
      if (store.peek(FOX_TASK + m.id) != null) continue;
      store.set(FOX_TASK + m.id, JSON.stringify({ v: 1, chat: id, from: m.id, raw: m.wake, set: m.ts || Date.now(), placed: Date.now() }));
    }
  };

  // ---- 藏音匣（见开发说明“藏音匣”那节、cangyin/）----
  // 存档里那几条（引擎手里本来就是现成的，同步取）
  const refreshBox = () => {
    const list = listEntries(store.keys(BOX_KEY).map((k) => [k, store.peek(k)]));
    boxRef.current = list;
    setBoxList(list);
    return list;
  };
  // 长按他的语音条“存入藏音匣”：念好的声音整份拷一份（删了对话也还在），字是转出来的那些（标签摘干净）；
  // 存过的那一条，同一个地方写“移出藏音匣”
  const keepVoice = async (r) => {
    setMenu(null);
    const src = voiceKeyOf(r.msg.id, r.idx);
    const had = findBySrc(boxRef.current, src);
    if (had) {
      await dropKept(had.id);
      setToast("已移出藏音匣");
      return;
    }
    const raw = store.peek(VOICE_KEY + src);
    const rec = readVoice(raw);
    if (!rec) {
      setToast("这条语音还没念好，存不进去");
      return;
    }
    const id = newId();
    // 先存声音、再存这一条：这一条在了，声音就一定在（另一台设备上先同步到这一条、声音还在路上的，放的时候说一句“还没同步过来”）
    await store.set(BOX_AUDIO + id, raw);
    await store.set(BOX_KEY + id, packEntry({ src, chat: chatIdRef.current, at: r.msg.ts || Date.now(), text: keptText(heardOf(r.item.text)), dur: rec.dur, saved: Date.now() }));
    refreshBox();
    setToast("已存入藏音匣");
  };
  // 移出：同一条语音存过两回的（两台设备还没同步上的时候各存了一回）一起移出
  const dropKept = async (id) => {
    const ids = sameVoiceIds(store.keys(BOX_KEY).map((k) => [k, store.peek(k)]), id);
    for (const x of ids) {
      await store.del(BOX_KEY + x);
      await store.del(BOX_AUDIO + x);
    }
    refreshBox();
  };
  // 藏音匣那一页放声音：用聊天里那一个放声音的东西（iPhone 上被她点过一回，接着放才不拦）。
  // 那一页要放的时候 claim(lost)：聊天这边放着的停下，之后这边再停它（切到后台、来电话、点开别的）就叫一声 lost，那一页上跟着停
  const boxAudio = {
    el: player,
    load: loadAudio,
    urlOf: (id) => {
      const rec = readVoice(store.peek(BOX_AUDIO + id));
      try {
        return rec ? audioUrl(rec.audio, rec.mime) : "";
      } catch (e) {
        return "";
      }
    },
    claim: (lost) => {
      stopVoice();
      audioOwner.current = lost || null;
    },
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
    if (callRef.current && callRef.current.chat === id) return; // 正在打电话：通话那头一句一句念，这里不再念一遍
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
    // 他定了下回自己几点醒（[WAKE:…]，狐宇宙，见 fox.js）：记在这一条上，家里的闹钟照最近的那一条办
    if (parsed.wake != null) him.wake = parsed.wake;
    // 江湖棋局里他调了引擎（掷骰子、买东西，见 game/jianghu.js）、翻了日记（见 diaryTools.js）：记下调了哪几样，放进对话之前替他调（settleCalls）。
    // 停在 tool_use 上的：他还没说完，等结果递回去接着说（thread.js 的 midTurn）。
    // 只调了工具、一个字没说的那一步：不摆“……”（拆回话那一下没字就补一个，这一步不要），聊天里只有卡片、那一行小字
    // 回话没停在 tool_use 上、里头却有他调的（写到长度上限被截断了）：一样不调，记成没调成（CUT_CALL、CUT_DIARY）。
    // 这样的一条不算说到一半，也照常摆字（一个字没有的摆“……”，不然她看着像他什么都没回）
    const calls = toolCallsOf(data.content, CALL_NAMES);
    if (calls.length) {
      if (data.stop_reason === "tool_use") {
        him.calls = calls;
        him.stop = "tool_use";
        if (!String(parsed.body || "").trim() && !parsed.rename && !settled.avatarFile) him.items = [];
      } else
        him.calls = calls.map((c) =>
          isDiaryCall(c)
            ? { ...c, out: CUT_DIARY, err: true, note: "想翻日记，没翻成", card: [] }
            : isQxCall(c)
            ? { ...c, out: CUT_QX, err: true, note: QX_FAIL_NOTE, card: [] }
            : isRoomCall(c)
            ? cutRoom(c)
            : { ...c, out: CUT_CALL, err: true, card: [] }
        );
    }
    if (settled.avatarFile) changeHisAvatar({ type: "meme", file: settled.avatarFile });
    // 他给自己改了名字：顶栏马上换；回复上记一笔，对话里留一行提示（和现在一样的不算改）
    if (parsed.rename && parsed.rename !== (namesRef.current.him || HIS_NAME)) {
      him.rename = parsed.rename;
      changeHisName(parsed.rename);
    }
    return him;
  };

  // ---- 日记共读：他翻日记的时候从哪儿取（见 diaryTools.js） ----
  // 每回现取：日记就在这台手机的存档里（解开了的），别的设备写的同步下来也在这儿；她点过保存的都在
  // 闲笔集里掺的手帐（同页那一本）、那一天的批注也给他看；他留批注（diary_note）也走这儿（见 tongye/host.js 的 tyReader）
  const diaryReader = {
    months: async () => store.keys(DIARY_KEY).map((k) => k.slice(DIARY_KEY.length)),
    month: async (ym) => safeParse(await store.get(DIARY_KEY + ym), {}) || {},
    ...tyReader(store),
  };

  // ---- 江湖棋局：替他调引擎（见 game/jianghu.js） ----
  // 他这一步调了引擎：放进对话之前先替他调完，结果、小卡片记在这一条上（him.calls、him.board），
  // 调完以后的整份存档另存一条（SNAP_KEY + 这一条的 id），下一步从它接着下。
  // before：放进去以后排在它前面的那几条。棋盘照它们里最后一步之后的样子接着下：
  // 重新回答的那一步，前面就是它原来前面的那几条，棋盘自然退回那一步之前（她 10 月 15 日点过头的“能悔棋”）。
  // 调过的不再调（别的设备调好、同步过来的）。没调成的（存档没同步过来、引擎取不到）：每一样记上缘故、标成出错，
  // 这一条不算下过棋（不记 board，下一步照旧从前一步接着下）；他看到缘故自己会跟她说。
  // strict：这一回是别的设备发的、这台替它放（见 applyMail）：没调成的不记出错，回 false（信留着，等同步下来再放）。调成了（或者用不着调）回 true
  // chat：哪段对话。棋盘收着（她收了棋）的时候他调了这四样：一样不下，递回去 OFF_CALL（原来这时候干脆不许他调工具，
  // 10 月 18 日添了翻日记，平常对话随时能翻，就改成这样，见 game/jianghu.js 的 OFF_LINE）
  // 日记共读：他翻日记的那几样先在这台手机上替他翻（见 diaryTools.js）；日记就在手机上，用不着等同步、取引擎，翻不成的只有存档取不到，记成出错
  const settleCalls = async (him, before, strict = false, chat = "") => {
    if (!needsRun(him)) return true;
    if (him.calls.some((c) => isDiaryCall(c) && typeof c.out !== "string")) him.calls = await runDiaryCalls(him.calls, diaryReader, new Date());
    // 秘戏钱匣里抽签（见 qx/pool.js）：照这台手机上的签库、照他调的那一样的编号抽（两台设备抽得一样）
    if (him.calls.some((c) => isQxCall(c) && typeof c.out !== "string")) him.calls = runQxCalls(him.calls, qxPoolRef.current);
    // 回屋看一眼、给屋里的自己留换装便签（见 room.js）：屋里的存档就在这台手机上（家里的闹钟写、同步下来的），只读；便签记的是他这一条的时间（两台设备替他留，留的一样）
    if (him.calls.some((c) => isRoomCall(c) && typeof c.out !== "string")) {
      const title = ((chat && indexRef.current.find((x) => x.id === chat)) || {}).title || "";
      const set = async (k, v) => {
        if ((await store.set(k, v)) === false) markStorageFail(); // 这台手机上没存进去（同别处：照样记在手上、推上云端，提示她一声）
      };
      him.calls = await runRoomCalls(him.calls, { get: (k) => store.get(k), set, today: localDay(), at: him.ts || Date.now(), chat, title, on: wakeOn(settingsRef.current) });
    }
    if (!needsRun(him)) return true;
    // 剩下的是江湖棋局那几样
    if (chat && !isOn(chat)) {
      him.calls = him.calls.map((c) => (typeof c.out === "string" ? c : { ...c, out: OFF_CALL, err: true, card: [] }));
      return true;
    }
    const todo = him.calls.filter((c) => typeof c.out !== "string");
    const prev = lastStep(before);
    let state = null;
    let why = "";
    if (prev && prev.board) {
      state = safeParse(await store.get(SNAP_KEY + prev.id), null);
      if (!state) why = "这台手机上还没有上一步的棋盘（多半是别的设备下的，还没同步过来），这一步没下成。跟她说一声，等一会儿再试。";
    }
    let eng = null;
    if (!why) {
      try {
        eng = await loadEngine();
      } catch (e) {
        why = "开封府这会儿取不到棋局的引擎（多半是网不好），这一步没下成。跟她说一声，过一会儿再试。";
      }
    }
    if (why) {
      if (strict) return false;
      him.calls = him.calls.map((c) => (typeof c.out === "string" ? c : { ...c, out: why, err: true, card: [] }));
      return true;
    }
    const r = await runCalls(eng, state, todo);
    const byId = new Map(r.calls.map((c) => [c.id, c]));
    him.calls = him.calls.map((c) => byId.get(c.id) || c);
    him.board = r.board;
    if (r.state) {
      const ok = await store.set(SNAP_KEY + him.id, JSON.stringify(r.state));
      if (!ok) markStorageFail();
    }
    return true;
  };

  // 他这一条放进去以后，是不是正停在“说到一半、等着接着说”上：是这段对话的最后一句（不算换头像提示），又是说到一半的那一步。
  // 是的话：眼前这一段，等它蹦完接着要后半截（armCont，见“接着说”那一段）；别的对话，记进 pendingRef 替它在后台接着要。
  // 她按了停的那一回（那一步上记着“停了”）：不接
  const afterStep = (id, msgs, him) => {
    if (!midTurn(him) || him.stopped) return;
    const said = msgs.filter((m) => m.role !== "event");
    const last = said[said.length - 1];
    if (!last || last.id !== him.id) return; // 他这一步后面她又说了话：回她那一句就是接着说，不用另接
    // 一口气连着调了好些步还没说完（多半是转不出来了）：不自己接了，底下摆“还没说完，点这里让我接着说”，她点了再接
    let run = 0;
    for (let i = said.length - 1; i >= 0 && midTurn(said[i]); i--) run++;
    if (run >= MAX_STEPS) return;
    if (chatIdRef.current === id) armCont(id);
    else pendingRef.current.add(id);
  };

  // 向那边要一条回复。成了回 { him, settle }：him 是整理好的回复；settle 是走新路时要在“放进对话、存好”以后叫的。失败抛错。
  // opts.chat 哪段对话；opts.fork 是“重新回答”的话，要换掉的是哪一条；
  // opts.resume 有的话，这一回早就发出去了（上次打开时发的），不用再拼一遍话，守着信箱等就行；
  // opts.recheck 是她点“重发”要的；opts.flushed 是切走的那一下抢着交出去的；
  // opts.signal 是她按停的时候要拉的那根线：拉了，这里抛 code 是 stopped 的错，而且保证不再把回话整理出来
  // （整理回话的那一下会换头像、改名字、记用量：按了停的那一回，这些都不能发生）。
  // 这个保证是下面两头给的：新路 mail.js 的 guarded，老路 cloud.js 的 callClaude，按了停都只抛 stopped、不交回话
  // 回来的是要开封府替他办的一步（翻日记、下棋），可那一回不是这台发的（见 ownJob）
  const notMine = (info, data) => !!info && !ownJob(info) && !!data && data.stop_reason === "tool_use" && toolCallsOf(data.content, CALL_NAMES).length > 0;
  const requestReply = async (msgs, opts = {}) => {
    const signal = opts.signal || null;
    if (opts.resume) {
      const got = await getRelay().resume(opts.resume.job, opts.resume.info, signal);
      // 守着的是别的设备发的那一回，回来的却是要开封府替他办的一步（翻日记、下棋）：这台不整理、不放，信留着，
      // 让发的那台办（两台都办的话会各要一回后半截）；它关着的话，过 STEP_GRACE 这台再替它办（见 applyMail）。
      // 在整理之前就打住：整理那一下会记用量、换头像、改名字，信箱那头回头还要再整理一遍
      if (notMine(got.info || opts.resume.info, got.data)) throw Object.assign(new Error("发的那台替他办"), { code: "elsewhere" });
      return { him: digestReply(got.data, got.used, (got.info && got.info.extra) || null, got.job, got.at ? Math.min(Date.now(), got.at) : 0), settle: got.settle };
    }
    const st = settingsRef.current;
    const model = st.model || DEFAULT_MODEL;
    const mcps = (st.mcps || []).filter((m) => m.enabled && m.url);
    const docs = memFilesRef.current
      .filter((f) => f.enabled)
      .map((f) => ({ name: f.name, content: memTextsRef.current[f.id] || "" }));
    const inCall = !!(callRef.current && callRef.current.chat === opts.chat);
    // 江湖棋局：摆着棋盘的那一段（jh 开头的，或者她在平常对话里摆开的）名帖里多一段【江湖棋局】，【此刻】里多一行棋盘，带着四样工具；
    // 摆开过又收了棋的平常对话，对话里有他调过的：四样工具照带（不带那边不认），这一回不许调，【此刻】里写一句收起来了（见 game/jianghu.js）
    const game = isOn(opts.chat) ? { board: boardIn(msgs), mixed: !isGameChat(opts.chat) } : hasSteps(msgs) ? { off: true } : null;
    const { staticText, nowNote: baseNote } = buildSystem({
      now: new Date(),
      memeList: allMemes,
      hisAvatarName: avatarName(avatarsRef.current.him),
      memDocs: docs,
      mcpNames: mcps.map((m) => m.name),
      names: namesRef.current,
      replyCap: replyRoom(st.maxTokens || 2048),
      voice: !!st.voice,
      thoughts: thoughtsFor(opts.chat), // 他写不写心里话：照开关，正在打电话的这段对话照关着算（见上面 thoughtsFor）
      callable: st.callable !== false, // 他能打电话（API 面板里的开关，默认开着；见 call/incoming.js）
      call: inCall, // 正在打电话：【此刻】后面附上通话的规矩（见 call/）
      game,
      qx: qxSection(qxPoolRef.current), // 秘戏钱匣：签库里有签才有这一段，只写维度名（见 qx/pool.js）
      room: roomSection(wakeOn(st)), // 他的屋子：“他自己醒”开着才有这一段（见 room.js）
    });
    // 任务标记（见 fox.js）：“他自己醒”开着的时候，平常的对话里【此刻】后面附一段，他知道能定个闹钟到点来找她。在记号后面，名帖一个字不动
    const tasks = wakeOn(st) && !isFoxChat(opts.chat) && !isGameChat(opts.chat);
    const nowNote = tasks ? baseNote + "\n\n" + taskNote(namesRef.current.her || HER_NAME) : baseNote;
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
      // 江湖棋局的四样工具排在最前头，翻日记的几样跟着（日记共读，见 diaryTools.js：随时带着），秘戏钱匣里抽签那一样再跟着（也随时带着，见 qx/pool.js），
      // 回屋看一眼、留换装便签那两样再跟着（也随时带着，见 room.js），MCP 的排最后。
      // 三种写法都带：摘掉 MCP 的那一种也带着，对话里有他调过的，不带那边不认
      const tools = (game ? GAME_TOOLS.slice() : []).concat(DIARY_TOOLS, QX_TOOLS, ROOM_TOOLS);
      if (at.mcp) {
        body.mcp_servers = mcps.map((m, i) => {
          const s = { type: "url", url: m.url, name: mcpSlug(m.name, i) };
          if (m.token) s.authorization_token = m.token;
          return s;
        });
        tools.push(...body.mcp_servers.map((s) => ({ type: "mcp_toolset", mcp_server_name: s.name })));
      }
      body.tools = tools;
      // 打电话的时候不下棋（卿卿 10 月 15 日定的）、不翻日记（10 月 18 日定的）：工具照带（对话里有他调过的），只是这一回不许调。
      // 收了棋的原来也是这样不许调；10 月 18 日起照许（平常对话能翻日记），他真调了棋局那几样，settleCalls 递回去“棋盘收着”
      if (inCall) body.tool_choice = { type: "none" };
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
          // 条子里记上是哪台设备发的（回来的要是一步棋、翻日记的一步，先让这台替他调，见 applyMail）。
          // 江湖棋局那段另写 dev（原来就有：别的设备照它不守这一回，见 checkMail）；from 每一回都写，只管谁来替他调
          extra: { ...(ctx || {}), from: DEVICE_ID, ...(game && !game.off ? { dev: DEVICE_ID } : {}) },
          recheck: !!opts.recheck,
          signal,
        });
        // 和老路上的记性一样：只有“不带缓存、别的照旧”才通的那种，才记下回别带缓存记号。
        // 是工具连不上、摘了工具才通的，不算缓存的毛病；是 Anthropic 一时出岔子、小后端才换的写法（shaky），也不算：
        // 记了的话，它挤上两三秒，她这一趟后面的每句话都不带缓存、按全价算
        if (first.cache && !got.used.cache && !got.used.shaky && !!got.used.mcp === !!first.mcp) flagsRef.current.noCacheAt = Date.now();
        // 她点“重发”找回来的是别的设备发的那一回（这台守着它的时候断过网，记得它；见 mail.js 的 asking），回来的是要替他办的一步：
        // 跟守信箱那一支一样打住，让发的那台办（不然两台各要一回后半截）
        if (notMine(got.info, got.data)) throw Object.assign(new Error("发的那台替他办"), { code: "elsewhere" });
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
    const req = { ctl: new AbortController(), stopped: false, chat: id };
    reqRef.current = req;
    let settling = ""; // 正在替他调引擎的那一回（见下面 settlingRef）
    try {
      // 回话到手以前她按停：这一句当场以 stopped 收场（作废）。到手以后再按，这里已经过去了，就是“掐断”（见 stopReply）
      const { him, settle } = await unlessStopped(
        requestReply(msgs, { chat: id, resume, recheck: !!(how && how.recheck), flushed: !!(how && how.flushed), signal: req.ctl.signal }),
        req.ctl.signal
      );
      // 回复插在这次请求的最后一条后面；等回复时她又发的几条排在后面
      const anchor = resume ? resume.info.last : msgs.length ? msgs[msgs.length - 1].id : null;
      // 江湖棋局：他这一步调了引擎，放进对话之前先替他调完（见 settleCalls）。已经在对话里了的（别的设备放进去的）不调。
      // 调的工夫里（头一回要取引擎，网慢能有一两秒）信箱那头会看到同一封：记进 settlingRef，它先不放（见 applyMail），放好了才勾掉
      if (needsRun(him) && him.job) {
        settling = him.job;
        settlingRef.current.add(settling);
      }
      if (needsRun(him)) {
        const pre = chatIdRef.current === id ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + id), null) || msgs;
        if (!(him.job && hasJob(pre, him.job))) await settleCalls(him, anchor ? mailBefore(pre, { last: anchor }) : pre, false, id);
      }
      const isCurrent = chatIdRef.current === id;
      // 她已经翻到别的对话去了：以存档里的为准（等的工夫里她在这段对话里又说的话都在存档里，拿发话那一刻的旧样子去存会把它们盖掉）
      const base = isCurrent ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + id), null) || msgs;
      // 不比她那一句早（从信箱里取的，时间是云端的钟记的）
      const said = base.find((m) => m.id === anchor);
      if (said && him.ts <= said.ts) him.ts = said.ts + 1;
      // 这一回的回话已经在对话里了（信箱那头先放进去的）：不放第二遍
      if (!(him.job && hasJob(base, him.job))) {
        // 江湖棋局里他说到一半、回话到手以后她才按的停：后半截不要了，这一步上记一笔“停了”（底下摆“停了，点这里让我回”）
        if (req.stopped && !req.restart && midTurn(him)) him.stopped = true;
        const next = insertReply(base, anchor, him);
        if (isCurrent) messagesRef.current = next;
        await saveChat(id, next);
        settlingRef.current.delete(settling);
        wantVoices(id, him); // 里头有语音条的：记下来要念（存好以后再记：念之前要在存档里认得出这一条）
        afterStep(id, next, him); // 江湖棋局里他说到一半：等这一条蹦完接着要后半截
        if (chatIdRef.current === id) {
          // 摆的是眼下的那一份（messagesRef），不是存之前的 next：存的那一下工夫里对话可能又变了
          // （她按了停、把上一条正在蹦的掐断了；她又发了一句），拿存之前的去摆会把这些盖掉
          setMessages(messagesRef.current);
          // 回话放进去的时候这段对话就在眼前：从头一条开始蹦；存的那一下工夫里她按了停的，照“掐断”办，只留头一条。
          // 放进去的时候不在眼前、存的那一下工夫里她才翻过来的：她看到的已经是整条了，不收回去重蹦。
          // 电话里他在想、她又开口了（dropReply）、可回话前脚已经到手的：照常摆（念不念，看电话那头，见“电话里他的回话到了”）
          if (isCurrent) {
            if (req.stopped && !req.restart) cutShort(him.id, 1);
            else startReveal(him.id);
          }
        }
      }
      if (settle) settle();
      lapseSoon(id);
      recapSoon(id);
    } catch (e) {
      if (e && e.code === "stopped") {
        // 她按了停，回话还没到：这一回作废（信箱那头 mail.js 已经收拾了），不报错、不重发、过后也不去信箱里找。
        // 她那句话留着，底下摆一行“停了，点这里让我回”。
        // 电话里他在想、她又开口了（dropReply）：这一回也作废，可不记“停了”：她说完这一句，两句一起问
        if (!req.restart) markStoppedIn(id);
      } else if (e && e.code === "elsewhere") {
        // 守着的那一回回来的是要替他办的一步、可不是这台发的（见 requestReply）：信留着，过几秒再看信箱（applyMail 照规矩办）
        clearTimeout(mailTimer.current);
        mailTimer.current = setTimeout(() => latest.current.checkMail(), 3000);
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
    if (settling) settlingRef.current.delete(settling); // 已经在对话里了没放、她按了停、出岔子了：一样勾掉
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
      // 江湖棋局：重新回答的这一步，棋盘从它原来前面的那几条接着下（等于退回那一步之前，见 settleCalls）；翻日记的照常翻
      await settleCalls(him, base, false, id);
      if (req.stopped && midTurn(him)) him.stopped = true;
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
      afterStep(id, next, him); // 江湖棋局里他说到一半：等这一条蹦完接着要后半截
      if (settle) settle();
      lapseSoon(id);
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
  // 打字的框随着行数一行一行长高，最高八行上下（COMPOSE_MAX，照微信：卿卿 10 月 17 日试了微信发来的截图），再多就在框里翻
  const fitComposer = (el) => {
    const list = scrollRef.current;
    const keep = list ? list.scrollTop : 0;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, COMPOSE_MAX) + "px";
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
    // 秘戏钱匣开着：她可能还在一签一签地丢，先不回，记着欠一句，关上了再回（closeQx）
    if (qxHold.current.on) {
      qxHold.current.owe = true;
      return;
    }
    if (loadingRef.current) {
      pendingRef.current.add(chatIdRef.current);
      return;
    }
    const msgs = messagesRef.current;
    if (owes(msgs)) askGuangyi(chatIdRef.current, msgs, null, how);
    else nextPending(); // 眼前这一段用不着回了：别的等着的那几段不能跟着干等
  };

  const scheduleReply = (ms) => {
    if (qxHold.current.on) {
      qxHold.current.owe = true; // 秘戏钱匣开着，先不回（见 triggerReply）
      return;
    }
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
    // 江湖棋局里他说到一半（掷了骰子、这一步正蹦着，或者蹦完了正要接着说）：后半截不要了，那一步上记一笔“停了”。
    // 后半截已经在要了的（req 还在）：那一头按停作废以后自己会记（askGuangyi 接 stopped 的那一段）
    if (contRef.current) disarmCont();
    if (!req && midTurn(messagesRef.current.filter((m) => m.role !== "event").pop())) markStoppedIn(chatIdRef.current);
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

  // 选项卡上记一笔（见 ask.js）：答完了（done）、关掉了 / 她直接回了话（closed）。改的是眼下那一条（开过分支的，切走那一下会连这一笔一起存进 alts）
  const patchAsk = (msgId, idx, patch) => {
    let hit = false;
    const next = messagesRef.current.map((m) => {
      const it = m.id === msgId && Array.isArray(m.items) ? m.items[idx] : null;
      if (!it || it.type !== "ask") return m;
      hit = true;
      const items = m.items.slice();
      items[idx] = { ...it, ...patch };
      return { ...m, items };
    });
    if (!hit) return;
    messagesRef.current = next;
    setMessages(next);
    saveChat(chatIdRef.current, next);
  };
  // 卡片右上角的 ✕：收起来，记一笔关掉了（不再自己弹；他那条底下那一行“点开答”还在）
  const closeAsk = () => {
    const v = askViewRef.current;
    if (!v) return;
    setAskView(null);
    patchAsk(v.msgId, v.idx, { closed: true });
  };
  // 答完了：一题一行问、一行答发给他（她 10 月 24 日 03:13 挑的“问一行、答一行”）；全跳过了就当没答，什么都不发
  const answerAsk = (answers) => {
    const v = askViewRef.current;
    if (!v) return;
    setAskView(null);
    const m = messagesRef.current.find((x) => x.id === v.msgId);
    const it = m && Array.isArray(m.items) ? m.items[v.idx] : null;
    if (!it || it.type !== "ask") return;
    const text = answerText(it.qs, answers);
    if (!text) {
      patchAsk(v.msgId, v.idx, { closed: true });
      return;
    }
    patchAsk(v.msgId, v.idx, { done: Date.now() });
    sendHer({ kind: "text", text });
  };

  // opts.now：马上发，不等她停手那两秒多（电话里她说完一句就是说完了，见 callSaid）
  const sendHer = (payloads, opts = {}) => {
    const list = Array.isArray(payloads) ? payloads : [payloads];
    if (!list.length) return;
    // 选项卡开着、她没答直接发了话（打字、表情包、照片……）：卡片收起来，照常发（她 10 月 24 日凌晨点头的那几条里的第三条）
    if (askViewRef.current) closeAsk();
    const id = chatIdRef.current;
    const t0 = Date.now();
    const add = list.map((p, i) => ({ id: newId() + i, role: "her", ts: t0 + i, ...p }));
    const next = messagesRef.current.concat(add);
    messagesRef.current = next;
    follow.pin(); // 她自己发话：就算正翻着旧消息，也回到最底下
    setMessages(next);
    setErrorNote("");
    saveChat(id, next);
    if (opts.hold) return; // 秘戏钱匣里丢进来的签：先攒着，关上了再回（closeQx）
    if (opts.now) {
      disarm();
      triggerReply();
    } else scheduleReply(2200);
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

  // ---- 打电话（卿卿 10 月 14 日要的，见 call/ 和开发说明“通话”那一节） ----
  // 右下角的声波键原来是“发一条语音”（她那头其实是听写，跟系统自带的语音转文字没两样），她说直接改成通话。
  // 一通电话：点声波键 → 通话页、屏幕常亮、聊天里记一行“通话开始” → 听她说（手机自带的听写，停 1.6 秒算说完）
  // → 当平常的一句话马上发出去 → 他回的话一句一句用他的声音念（最多两段一起准备，按顺序放）→ 念完接着听。
  // 他在电话里的规矩附在【此刻】后面（prompt/system.js 的 CALL_NOTE），名帖一个字不动。
  // 挂断（点挂断、锁屏、切走都算）：聊天里记一行“通话 12 分钟”；一句话没说就挂了，“通话开始”那行也不留。
  // subs：字幕（她 10 月 14 日 11:40 定的两个人共用的那一块，见 call/subs.js）
  const callView = (c) => ({ phase: c.phase, subs: c.subs, note: c.note, start: c.start, muted: c.muted });
  const callUi = (patch) => {
    const c = callRef.current;
    if (!c) return;
    Object.assign(c, patch);
    setCall(callView(c));
  };
  // 接着听她说（静音着就不听）。要在她点的那一下里叫的：头一回开听写、iPhone 不让自己接着听时她点屏幕那一下
  const callListen = () => {
    const c = callRef.current;
    if (!c) return;
    if (c.muted) {
      callUi({ phase: "muted" });
      return;
    }
    // 听的那一头还没准备好（通行证、麦克风还在路上）：准备好了再开
    if (!c.listener) {
      c.wantListen = true;
      callUi({ phase: "ring" });
      return;
    }
    // 字幕不清：他刚说的那些留着，等她开口了才换成她的
    callUi({ phase: "listening", note: c.phase === "tap" || c.note === CALL_HINT ? "" : c.note });
    // 麦克风接在放声音的那个 AudioContext 上：它要是被系统停了（来了个提示音之类），叫它醒过来，不然收不到声音。她点屏幕重开的那一下里叫，iPhone 认
    if (c.mic) {
      try {
        const ac = c.audio.ctx();
        if (ac && ac.state !== "running" && ac.resume) ac.resume().catch(() => {});
      } catch (e) {}
    }
    c.listener.start();
    hintLater(c);
  };
  // 开了听写八秒还一个字没听到：底下提醒一句。iPhone 有时开起来了却听不见（见 call/play.js），她点一下屏幕就在她点的那一下里重开
  const CALL_HINT = "说了没出字的话，点一下屏幕";
  const hintLater = (c) => {
    clearTimeout(c.hintTimer);
    c.hintTimer = setTimeout(() => {
      if (callRef.current === c && c.phase === "listening" && c.listener && !c.listener.heard()) callUi({ note: CALL_HINT });
    }, 8000);
  };
  const hintOff = (c) => {
    clearTimeout(c.hintTimer);
    c.hintTimer = null;
    if (c.note === CALL_HINT) callUi({ note: "" });
  };
  // 她点了一下屏幕：“点一下屏幕，接着说”的时候接着听；在听、可一个字还没听到的时候，重开听写（在她点的这一下里开，iPhone 认）。
  // 已经听到字了不动（点到屏幕不把她说了一半的丢掉）
  const callTap = () => {
    const c = callRef.current;
    if (!c) return;
    if (c.phase === "tap" || (c.phase === "listening" && c.listener && !c.listener.heard())) callListen();
  };
  // 她说完了一句：当平常的一句话发出去，不等那两秒（电话里等着难受）
  const callSaid = (text) => {
    const c = callRef.current;
    if (!c) return;
    clearTimeout(c.hintTimer);
    c.redo = false; // 他在想的时候她又开口、作废了的那一回（见 dropReply）：这一句一发，两句一起问
    c.live = "";
    callUi({ phase: "thinking", subs: herDone(c.subs, text), note: "" });
    sendHer({ kind: "text", text, via: "call" }, { now: true });
    // 他在想的时候接着听（她 17:26 定的：他还没开口、她又接着说了，算她补一句，两句合起来重新想，见 earsCbs）。
    // 只在 ElevenLabs 那种听法里（手机自带的听写一开一停都响）；静音着不听
    if (c.ears === "eleven" && c.listener && !c.muted) c.listener.start();
  };
  // 电话里他还在想、她又开口了（不光是应声）：这一回不等了（不记“停了”），等她说完，两句一起问（她 17:26 定的“合起来重新想”）。
  // 她这一句要是终究没说成（静音了、听写断了、挂了），前面那句还欠着回话：照眼下的对话再问一回（redoOwed）
  const dropReply = (c) => {
    const req = reqRef.current;
    if (!req || req.stopped || req.chat !== c.chat) return;
    req.stopped = true;
    req.restart = true;
    req.ctl.abort();
    c.redo = true;
  };
  const redoOwed = (c) => {
    if (!c.redo) return false;
    c.redo = false;
    if (chatIdRef.current !== c.chat || loadingRef.current || timerRef.current || !owes(messagesRef.current)) return false;
    triggerReply();
    return true;
  };
  // 听写停下：她边说边出的那一截（c.live，认“她是不是正说着”用）跟着清掉
  const earsStop = (c) => {
    if (c.listener) c.listener.stop();
    c.live = "";
  };

  // ---- 打断他（她 17:26 定的“你一开口就打断”；18:16 列的做法她点了头，18:19 拿掉点屏幕打断，见 call/barge.js） ----
  // 他说话的时候听着麦克风：像她开口了（比该漏进来的大出一截、连着半秒多），他的声音先压小、开听写（从她开口那会儿往前一点送过去）；
  // 认出她说的字（不是他自己那句漏进去的，也不光是“嗯”“对”这种应声）：他停下，聊天里他那一条截成只剩念出来的，告诉他说到哪儿被打断了，接着听她说完；
  // 认不出来（杂音、咳嗽、她不说了）：声音恢复，接着说
  const BARGE_CONFIRM = 2500; // 压小了以后最多等这么久认她说的字（她又像在说了，从那会儿再算，可一回最多 BARGE_MAX）
  const BARGE_MAX = 6000;
  const BARGE_QUIET = 900; // 她好像不说了：再等这么久还没认出来就算了
  const BARGE_PREROLL = 1500; // 开听写的时候最多从这么久以前送起：从像她在说的头一帧往前 0.4 秒，至少 0.7 秒（少送他自己的声音进去）
  const BARGE_PREROLL_MIN = 700;
  // 他刚说的、正说的、下一段（认“是不是他自己那句漏进去的”用）：c.said 里排着这一回所有要念的，眼下念到的是倒数第 left 段
  const recentSaid = (c) => {
    const list = c.said || [];
    const at = Math.max(0, list.length - (c.sayer ? c.sayer.left() : 0));
    return list
      .slice(Math.max(0, at - 3), at + 2)
      .map((s) => s.text)
      .join(" ");
  };
  const bargeFrame = (c, rms) => {
    if (callRef.current !== c || c.muted || c.phase !== "speaking" || !c.barge) return;
    const ev = c.barge.feed({ rms });
    if (ev === "suspect") bargeSuspect(c);
    else if (ev === "clear") bargeQuiet(c);
  };
  const bargeSuspect = (c) => {
    if (!c.listener || c.ears !== "eleven") return;
    const b = c.barging;
    if (b) {
      // 正认着，她停了一下又像在说了：接着认（从这会儿再等一阵，一回最多 BARGE_MAX）
      if (b.ok) return;
      clearTimeout(b.timer);
      b.timer = setTimeout(() => bargeGiveUp(c), Math.max(0, Math.min(BARGE_CONFIRM, b.at + BARGE_MAX - Date.now())));
      return;
    }
    const since = c.barge ? c.barge.since() : 0;
    const preroll = since ? Math.min(BARGE_PREROLL, Math.max(BARGE_PREROLL_MIN, Date.now() - since + 400)) : BARGE_PREROLL;
    c.audio.duck(true);
    c.barging = { ok: false, echo: false, ack: false, at: Date.now(), timer: setTimeout(() => bargeGiveUp(c), BARGE_CONFIRM) };
    c.listener.start({ preroll });
  };
  const bargeQuiet = (c) => {
    const b = c.barging;
    if (!b || b.ok) return;
    clearTimeout(b.timer);
    b.timer = setTimeout(() => bargeGiveUp(c), BARGE_QUIET);
  };
  const bargeGiveUp = (c) => {
    const b = c.barging;
    if (!b || b.ok || callRef.current !== c) return;
    clearTimeout(b.timer);
    c.barging = null;
    earsStop(c);
    c.audio.duck(false);
    // 不是她要说话：听写认出来的是他自己那句、一个字没认出来，都当漏进来的比估的多，调上去（见 barge.js 的 echoed；
    // 不调的话，漏得多的时候隔几秒就白压小一回）。认出来是她应了一声（嗯、对）的不调：那是她的声音
    if (c.barge) {
      if (b.ack && !b.echo) c.barge.reset();
      else c.barge.echoed();
    }
  };
  const bargeConfirm = (c, t) => {
    const b = c.barging;
    if (!b || b.ok) return;
    clearTimeout(b.timer);
    b.ok = true;
    c.barging = null;
    const cut = c.sayer.interrupt();
    c.audio.duck(false);
    if (c.barge) c.barge.reset();
    cutCallReply(c, cut);
    hintOff(c);
    callUi({ phase: "listening", subs: herLive(c.subs, t) });
  };
  // 正认着她是不是要打断他、他自己已经说完了：用不着打断。开着的听写接着听她说（不重开，她说了一半的不丢）；
  // 听写认出来的是他自己那句的，那一截不能算她的话：回 false，外头照常重开听写
  const bargeDone = (c) => {
    const b = c.barging;
    if (!b || b.ok) return false;
    clearTimeout(b.timer);
    c.barging = null;
    c.audio.duck(false);
    if (c.barge) c.barge.reset();
    if (b.echo || c.muted || !c.listener || !c.listener.listening()) return false;
    callUi({ phase: "listening", subs: herLive(c.subs, c.live) });
    hintLater(c);
    return true;
  };
  // 他被打断了：聊天里他那一条（或者几条）截成只剩念出来的（她 17:26 定的“只留念出来的”），后面记一行（聊天里不摆）告诉他说到哪儿被打断了。
  // cut：sayer.interrupt() 交回来的 { playing, pending }；c.said 是这一回排给他念的那几段，各是哪一条的第几样（怎么截见 barge.js 的 cutPlan、cutItems）。
  // given：不是从 c.said 来的那几段（回话前脚刚到、她已经又说上了的那一条，见“电话里他的回话到了”）
  const cutCallReply = (c, cut, given = null) => {
    const list = given || c.said || [];
    if (!given) c.said = [];
    const plans = cutPlan(list, cut);
    if (!plans.length) return;
    const gone = [];
    const put = (base) => {
      if (!Array.isArray(base)) return null;
      let next = base;
      plans.forEach((p) => {
        const at = next.findIndex((m) => m.id === p.msgId);
        if (at < 0) return;
        const m = next[at];
        const { items, said } = cutItems(m.items, p);
        // 截掉的那几样里的语音条：不念了（跟掐断一样，见 cutShort）
        (m.items || []).forEach((it, j) => {
          if (it && it.type === "voice" && j >= p.stop) gone.push(voiceKeyOf(m.id, j));
        });
        const mark = { id: newId(), role: "event", who: "call", kind: "call", phase: "cut", callOf: m.id, said, ts: (m.ts || 0) + 1 };
        next = next.slice(0, at).concat([{ ...m, items, raw: rawOf(items, m.rename || ""), cut: true }, mark], next.slice(at + 1));
      });
      return next;
    };
    if (chatIdRef.current === c.chat) {
      const next = put(messagesRef.current);
      if (next) {
        messagesRef.current = next;
        setMessages(next);
        saveChat(c.chat, next);
      }
      if (gone.length) getSpeaker().drop(gone);
    } else {
      store.get("kfs2:chat:" + c.chat).then((text) => {
        const next = put(safeParse(text, null));
        if (next) saveChat(c.chat, next);
        if (gone.length) getSpeaker().drop(gone);
      });
    }
  };
  const callListenFailed = (kind) => {
    const c = callRef.current;
    if (!c) return;
    if (kind === "none") {
      callUi({ phase: "tap", note: "这台手机上没有听写，打不了电话" });
      return;
    }
    // ElevenLabs 的实时听写那头（hear.js）出的岔子。“点一下屏幕，接着说”最上面那行写着了，这里不再说一遍
    const eleven = { net: "听写断了", busy: "ElevenLabs 那边太挤", quota: "ElevenLabs 的额度用完了", key: "ElevenLabs 不给听写的通行证了（看看那把 key 的 Speech to Text 权限）", terms: "ElevenLabs 要你先在它网站上同意听写（Speech to Text）的条款" };
    if (eleven[kind]) {
      callUi({ phase: "tap", note: eleven[kind] });
      return;
    }
    // iPhone 有时不让网页自己接着开听写（要她点一下）；麦克风没给开封府用的话，点了也不行，看看设置。
    callUi({ phase: "tap", note: kind === "dead" ? "听写老是一开就停。" : "听不了。一直这样的话，看看设置里有没有让开封府用麦克风" });
  };
  // 两种听法交回来的都一样：听到的字（字幕）、说完了一句、听不了
  // 光是应声（嗯、对、好的、哈哈）不算她要说话（她 17:26 定的“应声不算”，见 barge.js 的 ackOnly）：
  // 他说话的时候不打断他；他在想的时候不作废那一回、也不当一句话发出去
  const earsCbs = (c) => ({
    onText: (t) => {
      if (callRef.current !== c) return;
      const has = !!(t && t.trim());
      c.live = has ? t : "";
      const real = has && !ackOnly(t);
      // 她好像要打断他、还没认准的时候：字先不上字幕；认准是她说的（不是他自己那句漏进去的，也不光是应声）才停他
      if (c.barging && !c.barging.ok) {
        if (has && !real) c.barging.ack = true;
        const echo = real ? echoOf(t, recentSaid(c)) : null;
        if (echo === true) c.barging.echo = true;
        if (echo === false) bargeConfirm(c, t);
        return;
      }
      if (c.phase === "thinking") {
        // 他在想的时候她应了一声：不算，字幕上也不摆
        if (!real) return;
        // 他在想的时候她又开口了：这一回不等了，等她说完两句一起问
        dropReply(c);
        callUi({ phase: "listening" });
      }
      if (has) hintOff(c);
      callUi({ subs: herLive(c.subs, t) });
    },
    onDone: (t) => {
      if (callRef.current !== c) return;
      c.live = "";
      if (c.barging && !c.barging.ok) {
        // 还没认准她就说完了：是她说的照常发出去；是他自己那句漏进去的、光是应声、认不出的，不算
        const ack = ackOnly(t);
        const echo = ack ? null : echoOf(t, recentSaid(c));
        if (echo === false) {
          bargeConfirm(c, t);
          callSaid(t);
        } else {
          if (ack) c.barging.ack = true;
          if (echo === true) c.barging.echo = true;
          bargeGiveUp(c);
        }
        return;
      }
      if (c.phase === "thinking") {
        // 他在想的时候她应了一声（嗯、好的）：不当一句话发出去，接着等他（接着听）
        if (ackOnly(t)) {
          if (c.ears === "eleven" && c.listener && !c.muted) c.listener.start();
          return;
        }
        // 字幕上一直光是应声、定下来才有别的字：这会儿才作废那一回，两句一起问
        dropReply(c);
      }
      callSaid(t);
    },
    onFail: (kind) => {
      if (callRef.current !== c) return;
      c.live = "";
      if (c.barging && !c.barging.ok) {
        bargeGiveUp(c);
        return;
      }
      // 他在想的时候接着听的那一条断了：不报（这会儿本来就不是在等她说话），他说完照常接着听
      if (c.phase === "thinking") return;
      // 他在想的时候她又开口了、那一回作废了，这一句却没听成：前面那句照眼下的对话再问一回（他说完接着听，听不了到时候再说）
      if (redoOwed(c)) {
        callUi({ phase: "thinking" });
        return;
      }
      callListenFailed(kind);
    },
  });
  const callLater = (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  };
  // 用什么听她说话（她 10 月 14 日 14:26 定的）：ElevenLabs 的实时听写（不响，字边说边出）。先问 voice 函数要一张通行证，
  // 再开麦克风（整通电话开着）。要不到、开不了：退回手机自带的听写（会滴滴嘟嘟），底下说一句为什么
  const EARS_WHY = {
    old: "ElevenLabs 听写还没接上（念语音的那个函数还是旧的），先用手机自带的听写",
    key: "ElevenLabs 听写没接上：那把 key 没开 Speech to Text，先用手机自带的听写",
    terms: "ElevenLabs 听写没接上：要先在 ElevenLabs 网站上同意听写（Speech to Text）的条款，先用手机自带的听写",
    setup: "ElevenLabs 还没接好，先用手机自带的听写",
    quota: "ElevenLabs 的额度用完了，先用手机自带的听写",
    net: "连不上 ElevenLabs 的听写，先用手机自带的听写",
    auth: "登录过期了，先用手机自带的听写",
    nomic: "这里开不了麦克风，先用手机自带的听写",
  };
  const earsWhy = (e) => {
    const code = e && e.code;
    const reason = e && e.reason;
    if (code === "nofn" || (code === "refused" && !reason && /不认识这个动作/.test(String(e.message || "")))) return "old";
    if (reason === "key" || reason === "setup" || reason === "quota" || reason === "terms") return reason;
    if (code === "auth") return "auth";
    return "net";
  };
  const systemEars = (c, why) => {
    if (callRef.current !== c) return;
    const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    c.ears = "system";
    // 听的那头定了（退回自带的听写，或者听不了）：接起来那一句可以放了（见 startCall 的 earsReady）
    c.earsGo();
    if (why === "mic") {
      // 麦克风没给开封府用：手机自带的听写也用不了
      c.listener = null;
      callUi({ phase: "tap", note: "麦克风没给开封府用：看看设置里有没有让开封府用麦克风" });
      return;
    }
    if (!SR) {
      c.listener = null;
      callUi({ phase: "tap", note: "这里开不了麦，打不了电话。" });
      return;
    }
    c.listener = createListener({ SR, now: () => Date.now(), later: callLater, pauseMs: pauseOf(settingsRef.current.callPause), ...earsCbs(c) });
    callUi({ note: EARS_WHY[why] || "" });
    if (c.wantListen) {
      c.wantListen = false;
      callListen();
    }
  };
  const setupEars = (c) => {
    const hasMic = typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof WebSocket !== "undefined" && c.audio.ctx();
    if (!hasMic) {
      systemEars(c, "nomic");
      return;
    }
    // 要通行证最多等 15 秒（平常一两秒；念语音的那七十秒太久，电话一直“接通中…”）
    const HEAR_WAIT = 15000;
    const token = () =>
      callVoice({ op: "hear" }, { wait: HEAR_WAIT }).catch((e) => {
        throw Object.assign(new Error(String((e && e.message) || e)), { code: (e && e.reason) || (e && e.code) || "net" });
      });
    // 麦克风和通行证一起要（原来是先要通行证再开麦克风）：接起来那一句要等麦克风开了才放，少等一会儿
    const mic = createMic(window, c.audio.ctx());
    const opened = mic.open().then(
      () => null,
      (e) => e || new Error("麦克风开不了")
    );
    const got = callVoice({ op: "hear" }, { wait: HEAR_WAIT }).then(
      (tk) => ({ tk }),
      (e) => ({ e })
    );
    Promise.all([opened, got]).then(([micErr, t]) => {
      if (callRef.current !== c) {
        mic.close();
        return;
      }
      if (micErr) {
        mic.close();
        systemEars(c, micErr.code === "mic" ? "mic" : "nomic");
        return;
      }
      if (t.e) {
        mic.close();
        systemEars(c, earsWhy(t.e));
        return;
      }
      c.mic = mic;
      c.ears = "eleven";
      c.listener = createHearer({ now: () => Date.now(), later: callLater, pauseMs: pauseOf(settingsRef.current.callPause), token, first: t.tk, socket: (url) => new WebSocket(url), mic, ...earsCbs(c) });
      // 他说话的时候听她是不是要打断他（见 call/barge.js）：照着他这会儿多响算该漏进来多少
      // 压小了的时候漏进来的也跟着小（DUCK）
      c.barge = createBarge({ now: () => Date.now(), out: () => c.audio.level() * (c.barging && !c.barging.ok ? DUCK : 1) });
      c.bargeOff = mic.listen(({ rms }) => bargeFrame(c, rms));
      c.earsGo();
      if (c.wantListen) {
        c.wantListen = false;
        callListen();
      }
    });
  };
  // him：他打来、她接了的那一通（见 call/incoming.js 和下面的 answerRing）：{ callOf 他打电话的那一条, segs 接起来他先说的几段, pre 响铃的时候先念好的 }
  const startCall = (him = null) => {
    if (callRef.current) return;
    if (dictating && recRef.current) recRef.current.stop();
    // 放他声音的（见 call/play.js）：在她点的这一下里开起来（iPhone 要这一下）；告诉 iPhone 这一通是又放又录的；
    // 用 Web Audio 放，不用 <audio>（<audio> 放过一回，iPhone 上下一回开听写就听不见了，她 12:50 碰上的）
    const audio = createCallAudio(window, silentMp3(3));
    audio.unlock();
    const id = chatIdRef.current;
    // 接起来他先说的那一句（见 call/hello.js）：三句里挑一句，不跟上回一样。他打来的那一通不用：他先说的写在打电话那一条里
    let hi = null;
    if (!him) {
      let lastHi = "";
      try {
        lastHi = localStorage.getItem(HELLO_LAST) || "";
      } catch (e) {}
      hi = pickHello(lastHi);
      try {
        localStorage.setItem(HELLO_LAST, hi);
      } catch (e) {}
    }
    const mark = him
      ? { id: newId(), role: "event", who: "call", kind: "call", phase: "start", from: "him", callOf: him.callOf, ts: Date.now() }
      : { id: newId(), role: "event", who: "call", kind: "call", phase: "start", hi, ts: Date.now() };
    const next = messagesRef.current.concat([mark]);
    messagesRef.current = next;
    follow.pin();
    setMessages(next);
    saveChat(id, next);
    // 听的那头准备好了没有（麦克风开了、通行证到了；或者定了退回自带的听写）。他的声音等它好了才放：
    // 她 17:12 报的，存好的那三句一接通就放，那会儿麦克风还没开，iPhone 只从听筒出声；麦克风开着的时候放的都走外放。
    // 最多等 HELLO_WAIT（通行证、麦克风老不来，也不让她一直干等）
    let earsGo = null;
    const earsReady = new Promise((r) => (earsGo = r));
    setTimeout(earsGo, HELLO_WAIT);
    const c = { chat: id, startId: mark.id, start: Date.now(), spoken: new Set(), audio, wake: null, muted: false, phase: "ring", subs: emptySubs(), note: "", hi, from: him ? "him" : "", pre: (him && him.pre) || null, listener: null, mic: null, ears: "", earsGo, said: [], barging: null, barge: null };
    c.sayer = createSayer({
      // 念好的一段：Web Audio 解码好（解不开的留着 <audio> 用的地址兜底），交给念的那头当“地址”排队。
      // 接起来那一句：存过就直接用存着的（不再花钱）；头一回念好了存起来。
      // 他打来的那一通：接起来他先说的，响铃的工夫里已经念好了（c.pre），直接用；没念成的现念。
      // 解码好了等听的那头准备好再交（准备好以后的都不用等）：念好了才算“开口”，字幕、那圈光跟着声音一起出
      synth: async (text, signal) => {
        let clip = null;
        const early = c.pre && c.pre.get(text);
        if (early) {
          c.pre.delete(text);
          try {
            const d = await early;
            clip = await audio.decode(d.audio, d.mime);
          } catch (e) {
            clip = null;
          }
        }
        const hello = !him && HELLOS.includes(text);
        const kept = !clip && hello ? readVoice(store.peek(HELLO_KEY + text)) : null;
        if (clip) {
          // 响铃的时候念好的
        } else if (kept) clip = await audio.decode(kept.audio, kept.mime);
        else {
          const d = await callVoice({ op: "speak", text, stability: stabOf(settingsRef.current.voiceStab) }, { signal });
          if (hello) store.set(HELLO_KEY + text, packVoice(d)).catch(() => {});
          clip = await audio.decode(d.audio, d.mime);
        }
        await earsReady;
        return { url: clip };
      },
      play: (clip) => audio.play(clip),
      stopPlay: () => audio.stop(),
      // 她打断他的时候：正放着的那一段放到哪儿了（截他那一条用）
      progress: () => audio.progress(),
      // 这一段放完了、不要了：地址收回（一段几十 K，一通电话下来不收会越攒越多）
      release: (clip) => audio.release(clip),
      onState: (st) => {
        if (callRef.current !== c) return;
        if (st === "speaking") {
          hintOff(c);
          if (c.barge) c.barge.reset();
          callUi({ phase: "speaking" });
        } else if (st === "done") {
          c.said = [];
          // 正认着她是不是要打断他、他说完了：开着的听写接着听她说（见 bargeDone）
          if (!bargeDone(c)) callListen();
        }
      },
      // 接起来那一句没念出来不说（字幕上照样有那一句）；别的说一声
      onError: (e, text) => callRef.current === c && text !== c.hi && callUi({ note: `有一句没念出来（${String((e && e.message) || e).slice(0, 60)}），字在聊天里` }),
      // 念到这一段了：字幕出这一段（他开口的头一段把她的字幕换下去）
      onSegment: (text) => callRef.current === c && callUi({ subs: hisSay(c.subs, text) }),
    });
    callRef.current = c;
    setCall(callView(c));
    // 屏幕常亮（自己熄了电话就断了；她自己锁屏还是会断，网页管不了）
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock
          .request("screen")
          .then((w) => {
            if (callRef.current === c) c.wake = w;
            else w.release().catch(() => {});
          })
          .catch(() => {});
      }
    } catch (e) {}
    // 准备听（ElevenLabs 的通行证、麦克风），同时把他先说的那一句准备好（听的那头好了才放，见上面 earsReady）；说完了接着听。
    // 他打来的那一通：先说的是打电话那一条里写的（没写的话，接通了就听她说）
    setupEars(c);
    const first = him ? him.segs || [] : [hi];
    first.forEach((text) => c.said.push({ msgId: null, item: -1, text })); // 接起来那一句不在聊天里：被打断了也不用截
    c.sayer.add(first);
    c.sayer.end();
  };
  const hangUp = () => {
    const c = callRef.current;
    if (!c) return;
    callRef.current = null;
    setCall(null);
    clearTimeout(c.hintTimer);
    // 正认着她是不是要打断他的那一下：不认了（声音跟着整个收掉）；不再听她是不是要打断
    if (c.barging) clearTimeout(c.barging.timer);
    c.barging = null;
    if (c.bargeOff) c.bargeOff();
    earsStop(c);
    c.sayer.cancel();
    if (c.mic) c.mic.close();
    c.audio.close();
    if (c.wake) c.wake.release().catch(() => {});
    // 聊天里那两行：说过话的记一行“通话 12 分钟”；一句没说的，“通话开始”那行也拿掉。
    // 他打来的那一通，她接了就算通过电话（他开口说了），一句没说也留着、记上打了多久（不然他那一通就没着落了）
    const secs = Math.max(1, Math.round((Date.now() - c.start) / 1000));
    const put = (base) => {
      const at = base.findIndex((m) => m.id === c.startId);
      if (at < 0) return null;
      const spoke = c.from === "him" || base.slice(at + 1).some((m) => m.role === "her");
      return spoke ? base.concat([{ id: newId(), role: "event", who: "call", kind: "call", phase: "end", secs, ts: Date.now() }]) : base.filter((m) => m.id !== c.startId);
    };
    if (chatIdRef.current === c.chat) {
      const next = put(messagesRef.current);
      if (next) {
        messagesRef.current = next;
        setMessages(next);
        saveChat(c.chat, next);
      }
    } else {
      store.get("kfs2:chat:" + c.chat).then((text) => {
        const base = safeParse(text, null);
        const next = Array.isArray(base) ? put(base) : null;
        if (next) saveChat(c.chat, next);
      });
    }
    // 他在想的时候她又开口了、那一回作废了，这一句没说完就挂了：前面那句还欠着回话，照眼下的对话再问一回（挂了，他照平常回）
    redoOwed(c);
  };
  const toggleMute = () => {
    const c = callRef.current;
    if (!c) return;
    c.muted = !c.muted;
    if (c.muted) {
      // 正压着他的声音、认她是不是要打断：不认了，声音恢复
      if (c.barging) bargeGiveUp(c);
      if (c.phase === "listening" || c.phase === "tap") {
        earsStop(c);
        clearTimeout(c.hintTimer);
        const note = c.note === CALL_HINT ? "" : c.note;
        // 他在想的时候她又开口了、那一回作废了，这一句没说完就静音了：前面那句照眼下的对话再问一回
        if (redoOwed(c)) callUi({ phase: "thinking", note });
        else callUi({ phase: "muted", note });
      } else {
        // 他在想的时候接着听的那一条（见 callSaid）：静音了不听
        if (c.phase === "thinking" && c.ears === "eleven") earsStop(c);
        callUi({});
      }
    } else if (c.phase === "muted") callListen();
    else {
      // 他在想：接着听（她补一句，两句一起问）
      if (c.phase === "thinking" && c.ears === "eleven" && c.listener && !c.listener.listening()) c.listener.start();
      callUi({});
    }
  };

  // ---- 量一量回声（打断他用；她 10 月 14 日 17:26 定的“得先量回声”，见 call/echo.js） ----
  // 跟打电话一模一样的样子：她点的这一下里开 Web Audio、设又放又录；麦克风开着回声消除；麦克风开好了才放他那一句。
  // 他那一句念好存着（kfs2:echoline，加密了跟着云端走），再量不再花钱。
  // 那根一跳一跳的条不走 App 的 state（一秒十几回，整页跟着重画太费），那一页自己隔一会儿来取（echoLevel）
  const echoClip = async (audio) => {
    const kept = readVoice(store.peek(ECHO_KEY));
    if (kept) return audio.decode(kept.audio, kept.mime);
    const d = await callVoice({ op: "speak", text: ECHO_LINE, stability: stabOf(settingsRef.current.voiceStab) });
    store.set(ECHO_KEY, packVoice(d)).catch(() => {});
    return audio.decode(d.audio, d.mime);
  };
  const echoUi = (e, patch) => {
    if (echoRef.current !== e) return;
    Object.assign(e.view, patch);
    setEcho({ ...e.view });
  };
  const echoLevel = () => (echoRef.current ? echoRef.current.level : 0);
  const stopEcho = (e) => {
    if (!e) return;
    if (e.probe) e.probe.stop();
    if (e.mic) e.mic.close();
    e.mic = null;
    e.audio.close();
  };
  const startEcho = () => {
    if (echoRef.current || callRef.current) return;
    const audio = createCallAudio(window, silentMp3(3));
    audio.unlock();
    const e = { audio, mic: null, probe: null, level: 0, view: { step: "prep", result: null, error: "" } };
    echoRef.current = e;
    setEcho({ ...e.view });
    const ac = audio.ctx();
    if (!ac || typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      echoUi(e, { step: "fail", error: "这里开不了麦克风（或者放不了声音），量不了。" });
      return;
    }
    const mic = createMic(window, ac);
    e.mic = mic;
    Promise.all([mic.open(), echoClip(audio)]).then(
      ([, clip]) => {
        if (echoRef.current !== e) return;
        const set = mic.settings();
        e.probe = createEchoProbe({
          now: () => Date.now(),
          later: callLater,
          mic,
          play: (clip2) => audio.play(clip2),
          clip,
          onStep: (step) => echoUi(e, { step }),
          onLevel: (level) => {
            e.level = level;
          },
          onDone: (result) => {
            e.level = 0;
            if (e.mic) e.mic.close();
            e.mic = null;
            echoUi(e, { step: "done", result: { ...result, aec: typeof set.echoCancellation === "boolean" ? set.echoCancellation : null, rate: ac.sampleRate } });
          },
          onFail: (err) => echoUi(e, { step: "fail", error: `量到一半出岔子了（${String((err && err.message) || err).slice(0, 60)}）` }),
        });
        e.probe.start();
      },
      (err) => {
        const code = err && err.code;
        const why =
          code === "mic"
            ? "麦克风没给开封府用：看看设置里有没有让开封府用麦克风。"
            : code === "none"
            ? "这里开不了麦克风，量不了。"
            : `念不出我那一句（${String((err && err.message) || err).slice(0, 60)}），量不了。`;
        echoUi(e, { step: "fail", error: why });
      }
    );
  };
  const closeEcho = () => {
    const e = echoRef.current;
    echoRef.current = null;
    setEcho(null);
    stopEcho(e);
  };
  const againEcho = () => {
    closeEcho();
    startEcho();
  };

  // ---- 他打来的电话（她 10 月 14 日 17:26、17:35 定的，见 call/incoming.js 和开发说明“他打给她”） ----
  // 他的回话里写了 [CALL]：放进对话以后（一条一条蹦完了、她在眼前），一分钟以内到的就响，过了一分钟记“未接来电”。
  // 响的时候把他接起来要说的先念好；她点接听：跟她打过去一样开声音、开麦克风，他先开口；挂断、一分钟没接：“未接来电”。
  // 没有铃声：原来那段自己合成的“叮——咚”她嫌有灵异感，她手机上本来也放不出来，22:58 她说“虽然放不出来还是先把它撤掉吧”，撤了（见开发说明“来电铃声”）
  // 没接（挂断、一分钟没接、过了一分钟才看到）：在他打电话那一条后面记一行“未接来电”（见 call/marks.js）。
  // 几点没接的：他那一条到了一分钟的时候（过了好久才看到的，不记成看到的那会儿）
  const missCall = (chat, msgId) => {
    const put = (base) => {
      if (!Array.isArray(base) || base.some((m) => isCallMark(m) && m.callOf === msgId)) return null;
      const at = base.findIndex((m) => m.id === msgId);
      if (at < 0) return null;
      const t0 = base[at].ts || 0;
      const mark = { id: newId(), role: "event", who: "call", kind: "call", phase: "missed", callOf: msgId, ts: Math.max(t0 + 1, Math.min(Date.now(), t0 + CALL_RING_MS)) };
      return base.slice(0, at + 1).concat([mark], base.slice(at + 1));
    };
    if (chatIdRef.current === chat) {
      const next = put(messagesRef.current);
      if (next) {
        messagesRef.current = next;
        setMessages(next);
        saveChat(chat, next);
      }
    } else {
      store.get("kfs2:chat:" + chat).then((text) => {
        const next = put(safeParse(text, null));
        if (next) saveChat(chat, next);
      });
    }
  };
  const endRing = (r, why) => {
    if (ringRef.current !== r) return;
    ringRef.current = null;
    setRing(null);
    clearTimeout(r.timer);
    if (why !== "answer") missCall(r.chat, r.msgId);
  };
  const startRing = (msg, item, left) => {
    if (echoRef.current) closeEcho();
    if (dictating && recRef.current) recRef.current.stop();
    stopVoice(); // 正放着的语音条停下
    const r = { msgId: msg.id, chat: chatIdRef.current, segs: segmentsOfReply([item]), pre: new Map(), timer: null };
    ringRef.current = r;
    setRing({ msgId: r.msgId });
    // 他接起来要说的先念好（她一接马上响；没接的话这几个字的额度白扣）
    r.segs.forEach((s) => {
      const p = callVoice({ op: "speak", text: s, stability: stabOf(settingsRef.current.voiceStab) });
      p.catch(() => {});
      r.pre.set(s, p);
    });
    r.timer = setTimeout(() => endRing(r, "missed"), left);
  };
  // 接听：在她点的这一下里开声音、开麦克风（startCall 里），他先说
  const answerRing = () => {
    const r = ringRef.current;
    if (!r) return;
    // 秘戏钱匣开着的时候他打来、她接了：先关上（打着电话说的话得马上回，不能攒着）
    if (qxHold.current.on) closeQx();
    endRing(r, "answer");
    startCall({ callOf: r.msgId, segs: r.segs, pre: r.pre });
  };
  const declineRing = () => {
    const r = ringRef.current;
    if (r) endRing(r, "declined");
  };
  // 她回到眼前的那一下：他那一通要是还没着落，再看一眼（不在眼前的时候不响、也不急着记没接）
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === "visible") setSeenTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    if (callRef.current || ringRef.current) return;
    const p = pendingCall(messages);
    if (!p) return;
    if (reveal && reveal.id === p.msg.id) return; // 还在一条一条蹦：等他前面的话摆完再响
    if (document.visibilityState !== "visible") return;
    const left = settingsRef.current.callable === false ? 0 : ringLeft(p.msg.ts, Date.now());
    if (!left) missCall(chatIdRef.current, p.msg.id);
    else startRing(p.msg, p.item, left);
  }, [messages, reveal, seenTick]);

  // 电话里他的回话到了（不管是直接等到的、还是从信箱里取的，放进对话以后都在 messages 里）：一句一句念。
  // 排给他念的每一段记着是哪一条的第几样（c.said）：她打断他的时候照这个把聊天里那一条截成只剩念出来的（见 cutCallReply）
  useEffect(() => {
    const c = callRef.current;
    if (!c || chatId !== c.chat) return;
    const at = messages.findIndex((m) => m.id === c.startId);
    if (at < 0) return;
    for (let i = at + 1; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== "him" || c.spoken.has(m.id)) continue;
      c.spoken.add(m.id);
      const segs = segmentsOfItems(m.items).map((s) => ({ msgId: m.id, item: s.item, text: s.text }));
      // 回话前脚刚到、她已经又说上了（不光是应声；他在想的时候她又开口了，dropReply 没赶上的那一眨眼）：
      // 这一条算他还没开口就被她打断了（一个字没念：聊天里留“……”，告诉他），接着听她说完，两句一起问
      if (!c.barging && c.listener && c.listener.listening() && c.live && !ackOnly(c.live) && !c.sayer.busy()) {
        if (segs.length) cutCallReply(c, { playing: null, pending: segs.map((s) => s.text) }, segs);
        continue;
      }
      // 正认着她是不是要打断他（压小了、开着听写）：那一头不停，这一条接着排在后面
      if (!c.barging) earsStop(c);
      segs.forEach((s) => c.said.push(s));
      c.sayer.add(segs.map((s) => s.text));
      c.sayer.end(); // 一条回话是整条到的：没有可念的（只有表情包之类），马上接着听
    }
  }, [messages, chatId]);
  // 电话里这一句没送到（底下那行红字出来了）：说一声，接着听她说（那一句还在，下一句一起寄过去）
  useEffect(() => {
    const c = callRef.current;
    if (!c || !errorNote || c.phase !== "thinking") return;
    callUi({ note: "刚才那句没送到，接着说就行" });
    callListen();
  }, [errorNote]);
  // 锁屏、切到别的 app：网页 app 到了后台听不了也念不了，挂断（见开发说明“通话”那一节）。
  // 藏起来一眨眼就回来的不算（系统弹个框之类）：藏了一秒多才挂。锁了屏定时器会停，所以回来的时候再按钟点算一遍
  useEffect(() => {
    let hiddenAt = 0;
    let timer = null;
    const off = () => {
      if (!callRef.current) return;
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        clearTimeout(timer);
        timer = setTimeout(() => callRef.current && latest.current.hangUp(), 1200);
      } else {
        clearTimeout(timer);
        if (hiddenAt && Date.now() - hiddenAt >= 1200 && callRef.current) latest.current.hangUp();
        hiddenAt = 0;
      }
    };
    const gone = () => callRef.current && latest.current.hangUp();
    document.addEventListener("visibilitychange", off);
    window.addEventListener("pagehide", gone);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", off);
      window.removeEventListener("pagehide", gone);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- 信箱：她不在的时候到的回话（那条新路见 mail.js） ----
  // 信箱里的一封回话放进它那段对话。回 applied 放进去了；dup 早放过了；gone 用不着了；failed 那一回没回成（已经告诉她了）；
  // later 这台设备上的那段对话还没跟上（等同步下来再放，信先留着）；keep 没回成、她眼前又不是那段对话（信先留着）；
  // busy 那段对话正在重新回答、这一回正在替他调引擎（等它完了再看，信先留着）；
  // wait 江湖棋局里别的设备发的一步棋，先等发的那台放（过一会儿再看，信先留着）
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
    // 江湖棋局：这一封里他调了引擎（见 settleCalls）。
    //   这台设备正在替这一回调（守着的那条路先拿到了）：等它放好再看（到时候就是 dup）
    //   别的设备发的：先让发的那台放，信留着（它放好了，对话同步过来，这里再看就是 dup）。
    //   过了 STEP_GRACE 它还没放（多半关着了）：这台替它放。骰子照他调的那一样的编号掷（见 game/jianghu.js 的 seededRng），
    //   两台各放一遍也掷得一样；上一步的棋盘还没同步过来、引擎取不到的，不记成出错，信留着等同步下来（later）
    // 日记共读：他翻日记的一步也照这个规矩（见 diaryTools.js）：翻日记不掷骰子，可两台都替他翻、都接着要后半截，对话里会多出一条重复的
    const steps = toolCallsOf(result.data.content, CALL_NAMES).length > 0; // 上面 resultOk 看过：data 是一封正常的回话
    const ours = ownJob(info);
    if (steps && settlingRef.current.has(job)) return "busy";
    if (steps && !ours && Date.now() - (Date.parse(row.done_at) || 0) < STEP_GRACE) return "wait";
    // 这条算几点到的：小后端放进信箱的时候（不比她那一句早，不比现在晚）
    const anchor = msgs.find((m) => m.id === info.last);
    const stamp = Math.max(((anchor && anchor.ts) || 0) + 1, Math.min(Date.now(), Date.parse(row.done_at) || Date.now()));
    const him = digestReply(result.data, result.used, info.extra || null, job, stamp);
    let base = msgs;
    if (steps) {
      if (!(await settleCalls(him, mailBefore(msgs, info), !ours, id))) return "later";
      // 调引擎的那一下工夫里对话可能又变了（她发了一句、别处同步下来一段、她翻过来了）：照眼下的放
      base = here() ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + id), null) || msgs;
      const fit2 = mailFit(base, info, job);
      if (fit2 !== "ok") return fit2;
    }
    const next = mailPut(base, info, him);
    if (here()) messagesRef.current = next;
    await saveChat(id, next);
    wantVoices(id, him);
    // 江湖棋局里他说到一半：接着要后半截（眼前这一段等它摆好；别的对话在后台接，眼下没在回话就马上轮）
    afterStep(id, next, him);
    if (midTurn(him) && !here() && !loadingRef.current) nextPending();
    // 存的那一下工夫里对话又变了（她发了一句、点了重新回答）：画面已经是更新的那份，不拿这一份旧的去盖
    if (here() && messagesRef.current === next) {
      setMessages(next);
      setErrorNote("");
    }
    recapSoon(id);
    return "applied";
  };

  // 回话落进 id 那段对话以后：这台设备上要是还为这段记着一回没认过的重新回答、这会儿又没人守着它（多半就是没成的那一回），
  // 过两秒看一遍信箱，好把它认成没着落的（见 checkMail 最后那一段）。平常没有这样的一回，什么都不做。
  // 没有这一下的话，要等下一个看信箱的由头（她切回来、网回来、翻对话、重新打开）：重新回答没成（那会儿没网，过后自己再看的那几遍
  // 也都没看成）、网悄悄好了她接着聊、聊完就划掉的，中间一个由头都没有，重新打开还会先回到那段
  const lapseSoon = (id) => {
    // 叫它的地方回话已经存好了：这里出什么岔子都不许往外抛（外头会当成那一回没成）
    try {
      const relay = getRelay();
      if (!relay.pendingFor(id).some((r) => r.fork && !r.dead && !relay.isLive(r.job))) return;
      clearTimeout(mailTimer.current);
      mailTimer.current = setTimeout(() => latest.current.checkMail(), 2000);
    } catch (e) {}
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
          // 江湖棋局里别的设备发的那一回：这台不守（回来的要是一步棋，先让发的那台替他调，见 applyMail），过几秒再看
          const theirs = !!(m.info.extra && m.info.extra.dev && m.info.extra.dev !== DEVICE_ID);
          if (mine && !m.info.fork && !theirs && mailFit(messagesRef.current, m.info, m.job) === "ok") askGuangyi(m.info.chat, messagesRef.current, { job: m.job, info: m.info });
          else again = true;
          continue;
        }
        const out = await applyMail(m);
        if (out === "busy" || out === "wait") {
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
      // 记着的重新回答里已经没着落的：记一笔“没着落了”（mail.js 的 lapse），开机就不再当那段还在等他回话。
      // 重新回答的那一回只要记着就算“在等”（它的回话也许在路上、在信箱里，开机那一下分不出来）。可有的再也不会有回话：
      // 重新回答没成（没连上）、她没再点；点了重新回答、话还没出手机开封府就被收掉。原来这种要等记下满一天才不算，
      // 这一天里每回重新打开都回到那段（卿卿 10 月 10 日夜里报的“划掉重新打开还是回到旧对话”，平常的话那一半见开机那一段）。
      // 这里只挑：这一遍信箱看成了（看不成就不白跑下面那一眼），单子里没有它，这会儿没人守着它，
      // 记下也过了十秒（不是话刚出手机、小后端还没来得及开出那一格的；不满十秒的过三秒再看）。
      // 认准没着落是 lapse 的事：它自己再去信箱里看一眼那一格，真没有才记。不等它（那一眼最多悬八秒，不能压着这一遍）。
      // 反过来，记过“没着落了”、单子里却有它的（认错了：那一格是后来才冒出来的），也交给 lapse，它看到那一格在就把记号擦掉。
      // 只动那一个记号，那一回照旧记着、信箱不碰；平常的话记着的那几回这里不管
      if (list !== null && document.visibilityState === "visible") {
        for (const r of relay.pendingAll()) {
          if (!r.fork || relay.isLive(r.job)) continue;
          const here = list.some((m) => m.job === r.job);
          if (here ? !r.dead : r.dead) continue; // 单子里有它、没记过；单子里没有它、已经记过：都不用再认
          const age = Date.now() - r.at;
          // 手机的钟被往回拨过、记的钟点比现在还晚的：不等
          if (!here && age >= 0 && age < ORPHAN_AGE) again = true;
          else relay.lapse(r.job).catch(() => {});
        }
      }
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
    // 秘戏钱匣开着、攒着要回的（丢了签、进来之前刚说完的那一句）：切走以后页面可能就没了，也这一下交出去（交了就不再欠，回来照旧开着）
    if (qxHold.current.on && qxHold.current.owe && getRelay().trusted()) {
      qxHold.current = { on: false, owe: false };
      triggerReply({ flushed: true });
      qxHold.current = { on: true, owe: false };
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
    // 名帖那一大段和聊天时寄的一个字不差（缓存接得上；正在打电话的这段对话，心里话那一条照关着算，见 thoughtsFor；
    // 江湖棋局那一段带着【江湖棋局】那一段，见 game/jianghu.js）；【此刻】这回用不着
    const game = isOn(id) ? { board: null, mixed: !isGameChat(id) } : hasSteps(msgs) ? { off: true } : null;
    const { staticText } = buildSystem({ now: new Date(), memeList: allMemes, hisAvatarName: "", memDocs, mcpNames: [], voice: !!st.voice, thoughts: thoughtsFor(id), callable: st.callable !== false, game, qx: qxSection(qxPoolRef.current), room: roomSection(wakeOn(st)) });
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
    const recapBody = {
      model,
      max_tokens: thinksFirst(model) ? RECAP_ROOM_THINK : RECAP_ROOM,
      system: [
        { type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: ask.rule },
      ],
      messages: [{ role: "user", content: ask.content }],
    };
    // 工具照聊天时一样带着（排在名帖前头，带着才接得上聊天时写下的缓存：江湖棋局那四样、翻日记那三样），只是这一回不许调
    recapBody.tools = (game ? GAME_TOOLS : []).concat(DIARY_TOOLS, QX_TOOLS, ROOM_TOOLS);
    recapBody.tool_choice = { type: "none" };
    const data = await askRecap(recapBody);
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

  latest.current = { checkMail, openFromNotice, leaving, resendSoon, runRecaps, sweepRecaps, stopVoice, freshMotto, hangUp, triggerReply };

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

  // 输入框一行还是两行（卿卿 10 月 17 日要的：打字的时候输入框加键盘占得太多）。
  // 键盘开着（输入框有焦点）或者表情包面板开着：一行，左边加号，中间打字，右边笑脸和发送（听写开着的时候留着听写）；
  // 都收下去：照原来两行，上面打字，下面加号、笑脸、模型……听写、发送。
  // 打字的框一直是同一个（摆在一张格子里换格子，不换地方）：换来换去焦点不丢、键盘不收
  const compact = taFocus || memePanel;
  const composeSlots = compact
    ? [!editing && "plus", "ta", !editing && "smile", dictating && "mic", "key"].filter(Boolean)
    : [!editing && "plus", !editing && "smile", "model", "gap", "mic", "key"].filter(Boolean);
  const composeCols = composeSlots.map((k) => (k === "ta" || k === "gap" ? "minmax(0, 1fr)" : "auto")).join(" ");
  const composeAreas = compact ? `"${composeSlots.join(" ")}"` : `"${composeSlots.map(() => "ta").join(" ")}" "${composeSlots.join(" ")}"`;
  // 一行两行换了：打字的框照新的样子重新量一回高
  useLayoutEffect(() => {
    if (taRef.current) fitComposer(taRef.current);
  }, [compact]);
  // 打字的时候点了别处（底下那条回话、文档卡片……）：按下去那一刻打字的框就失了焦点。
  // 这时候先不变回两行：输入框一长高，她点的那一条（多半就是挨着输入框的最底下那条）被挤开，松手落在输入框上，那一下白点了。
  // 等这一下点完（松手、点击发完）再变（手机上按下、松手、点击是连着发的，等的只是一眨眼）
  const pressing = useRef(false);
  useEffect(() => {
    const down = () => (pressing.current = true);
    const up = () => (pressing.current = false);
    window.addEventListener("mousedown", down, true);
    window.addEventListener("mouseup", up, true);
    window.addEventListener("dragend", up, true);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("mouseup", up, true);
      window.removeEventListener("dragend", up, true);
    };
  }, []);
  const taBlurred = () => {
    if (!pressing.current) {
      setTaFocus(false);
      return;
    }
    let t = 0;
    const done = () => {
      window.removeEventListener("mouseup", later, true);
      window.removeEventListener("dragend", later, true);
      clearTimeout(t);
      // 这工夫里又点回了打字的框：还是一行
      if (document.activeElement !== taRef.current) setTaFocus(false);
    };
    // 松手那一下后面紧跟着点击：等点击发完
    const later = () => {
      clearTimeout(t);
      t = setTimeout(done, 0);
    };
    window.addEventListener("mouseup", later, true);
    window.addEventListener("dragend", later, true);
    // 一直没松手（按着不放、挪到了外头）：一秒以后照样变回去
    t = setTimeout(done, 1000);
  };

  // 表情包面板（照微信，卿卿 10 月 17 日要的）：沉在输入框底下，占着键盘那块地方。
  // 点笑脸：键盘开着的先收下去（面板等键盘落下去那一帧才撑开，见 input.css），再点一下只收面板、不弹键盘
  const toggleMemes = () => {
    if (memePanel) {
      setMemePanel(false);
      return;
    }
    const ta = taRef.current;
    if (ta && document.activeElement === ta) ta.blur();
    setMemePanel(true);
  };
  // 面板开着点输入框：键盘升起来那一下（keyboard.js 报“开了”）面板已经压成 0 了，这时候再收，输入框正好落在键盘上面、不跳；
  // 键盘没升起来的（接着实体键盘、电脑上）过一会儿也收
  const memesToKeyboard = () => {
    let t = 0;
    const done = () => {
      window.removeEventListener("kfs-kb", onKb);
      clearTimeout(t);
      setMemePanel(false);
    };
    const onKb = (e) => e.detail && e.detail.open && done();
    window.addEventListener("kfs-kb", onKb);
    t = setTimeout(done, 600);
  };
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

  // 翻到（开了）一局江湖棋局：引擎那一包先取着（他头一回掷骰子的时候就不用再等它下）。取不到不要紧，要用的时候再取
  useEffect(() => {
    if (gameOn(chatId, onSet)) loadEngine().catch(() => {});
  }, [chatId, onSet]);

  // ---- 接着说：江湖棋局里他说到一半（见 game/jianghu.js） ----
  // 这一步放进去了、引擎的结果也记上了（afterStep 记的 cont）：等它蹦完（没在回话、没在蹦、没排着队），接着要后半截。
  // 她翻到别的对话去了：先不接，翻回来再接。她按了停：stopReply 已经撤了。
  // 歇一下再要：这一步最后一样刚摆出来，卡片跟着冒，让她看一眼
  useEffect(() => {
    if (!cont || cont !== chatId || loading || reveal || queued) return;
    const t = setTimeout(() => {
      if (contRef.current !== chatIdRef.current || loadingRef.current || timerRef.current) return;
      disarmCont();
      latest.current.triggerReply();
    }, 450);
    return () => clearTimeout(t);
  }, [cont, chatId, loading, reveal, queued]);

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
          : nextItem.type === "ask"
          ? 700
          : Math.min(1900, 550 + (nextItem.text ? nextItem.text.length : 0) * 28);
    }
    const t = setTimeout(step, delay);
    return () => clearTimeout(t);
  }, [reveal, messages, nextVoice]);

  // ---- 选项卡：他这条话蹦完了、里头有一张还没答的，就从输入框上面浮出来（她 10 月 24 日凌晨要的“跟 Claude 一样从底下弹”） ----
  // 只认最后一条（不算那几行小字）是他的、已经蹦完了的；答过的（done）、她关掉过的（closed）不再自己弹（底下那一行点了还能打开）。
  // 狐宇宙（他的屋子，她在那儿只留便签）、打着电话的时候不弹。
  // 开着的那张对不上了（那一条重新回答收起来了、翻了版本、删了、换了一段对话）：先收起来，再照上面的看要不要弹
  useEffect(() => {
    const v = askViewRef.current;
    if (v) {
      const m = messages.find((x) => x.id === v.msgId);
      const it = m && Array.isArray(m.items) ? m.items[v.idx] : null;
      if (it && it.type === "ask" && !it.done) return;
      setAskView(null);
    }
    if (call || isFoxChat(chatId)) return;
    let last = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "event" || messages[i].note) continue;
      last = messages[i];
      break;
    }
    if (!last || last.role !== "him" || (reveal && reveal.id === last.id)) return;
    const idx = (last.items || []).findIndex((it) => it && it.type === "ask" && !it.done && !it.closed);
    if (idx >= 0) setAskView({ msgId: last.id, idx });
  }, [messages, reveal, chatId, call]);

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
  // 界面上叫“闲笔集”（卿卿 2026 年 10 月 11 日改的名，入口也从侧栏的格子挪进了“南衙”那张菜单）。
  // 代码、存档的钥匙名、让那边写日记时寄去的话里都还叫日记、diary，没跟着改
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

  // 把所有对话按天归好：日历的深浅、我写日记要读的聊天、手帐的引用栏，都从这来。
  //   dayMsgsRef  所有对话（连狐宇宙）：我写日记读的
  //   chatDaysRef 聊天（狐宇宙不算）：闲笔集日历的深浅、“这天说了几句”、手帐引用栏的聊天那一栏、那一屏的“几句聊天”
  //   foxDaysRef  狐宇宙里的（她留的、我在屋里说的）：手帐引用栏的便签那一栏（她 10 月 22 日画的、说“你来决定就行”）
  // 回的是每一天聊了几句（聊天的）。同时只翻一遍（闲笔集、手帐一起要的时候不各翻各的）；翻过一遍记一笔（daysAtRef），
  // 手帐找没聊过天的日子不再从头翻（10 月 22 日她报手帐卡，查到的一处）
  const loadDays = () => {
    if (daysRunRef.current) return daysRunRef.current;
    const run = (async () => {
      const byDay = {};
      const chatDays = {};
      const foxDays = {};
      for (const c of indexRef.current) {
        const msgs =
          c.id === chatIdRef.current ? messagesRef.current : safeParse(await store.get("kfs2:chat:" + c.id), []) || [];
        const side = isFoxChat(c.id) ? foxDays : chatDays;
        msgs.forEach((m) => {
          if (m.role !== "her" && m.role !== "him") return;
          const k = dayKeyOf(new Date(m.ts));
          (byDay[k] = byDay[k] || []).push(m);
          (side[k] = side[k] || []).push(m);
        });
      }
      dayMsgsRef.current = byDay;
      chatDaysRef.current = chatDays;
      foxDaysRef.current = foxDays;
      daysAtRef.current = Date.now();
      const counts = {};
      Object.keys(chatDays).forEach((k) => {
        counts[k] = chatDays[k].length;
      });
      return counts;
    })();
    daysRunRef.current = run;
    const done = () => {
      if (daysRunRef.current === run) daysRunRef.current = null;
    };
    run.then(done, done);
    return run;
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
      thoughts: st.thoughts !== false, // 他写不写心里话（“头像与设置”里的开关，默认开着）
      callable: st.callable !== false, // 他能打电话（API 面板里的开关，默认开着；见 call/incoming.js）
      diary: false, // 名帖不带【日记本】那一段：这一回不带工具，他翻不了（日记共读，见 diaryTools.js）
    });
    const msgs = dayMsgsRef.current[key] || [];
    const transcript = msgs.length ? dayTranscript(msgs, memeLookup) : "（这天你们没在开封府说话）";
    const herMoods = ((herEntry && herEntry.moods) || []).map((k) => (moodOf(k) || {}).t).filter(Boolean);
    const herPart =
      herEntry && (herEntry.text || herMoods.length)
        ? `\n\n她这天的日记：\n${herMoods.length ? "心情：" + herMoods.join("、") + "\n" : ""}${herEntry.text || ""}`
        : "";
    const rule = `【写日记】
这次不是聊天。这是开封府日记本（闲笔集）里属于你的那一页，日期是${label}。
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

  // ---- 同页那一本手帐（见 src/tongye/、开发说明“同页搬进来”那一节）：闲笔集里那张小卡片、批注、点开的那一层 ----
  // 框里那一页关在隔开的框里，能要的只有这一本自己的东西、某一天的原话和聊天里的照片（见 tongye/host.js 的 makeServer）
  // 挪上一版的页、点开某一天之前，先跟云端对一回：开封府开门的时候同步是不等的，刚开门就点进来，另一台设备做好的页还没拉下来，
  // 这边挪一回、存一回就把它盖了。二十秒里对过就不再对；没网、对不上（最多等五秒），回 false：这一回不挪（点开照样开）
  const tySyncAt = useRef(0);
  const tySync = async () => {
    if (Date.now() - tySyncAt.current < 20000) return true;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    let done = false;
    try {
      await Promise.race([store.syncNow().then(() => (done = true)), new Promise((r) => setTimeout(r, 5000))]);
    } catch (e) {}
    let st = {};
    const off = store.onStatus((s) => (st = s || {}));
    off();
    if (!done || st.offline || st.error) return false;
    tySyncAt.current = Date.now();
    return true;
  };
  const tyMigrate = async () => {
    try {
      if (await tySync()) await migrateAll(store);
    } catch (e) {}
  };
  // ---- 光义排一页（同页的「交给光义」，见 tongye/host.js 的 tyArrangeAsk） ----
  // 她在那一屏挑照片、说一句想要什么样，点了发送（同页写了一张 ask/<编号>，makeServer 交过来）：另问他一回，跟让他写日记一样不进聊天、不进前情提要。
  // 那一天的 day 记着进度（同页“在排”那一栏、本子首页“光义在做”照着亮）；排好了写成他排的那一页；没排成放回原样，“在排”那一栏说一声。
  // 这台设备上同一天正排着、另一台设备十分钟以内起的还在排：不再起一回（那一张记成 busy）
  const tyBusy = useRef(new Set());
  // 一道保险：十分钟里最多排六回（同页那一页要是出了岔子一直写 ask，不会一直花钱）
  const tyRuns = useRef([]);
  const tyArrange = async (ask) => {
    const day = ask.day;
    const key = `${TY_KV}day/${day}`;
    const askKey = `${TY_KV}ask/${ask.id}`;
    const markAsk = (status) => {
      const a = safeParse(store.peek(askKey), null);
      if (a && typeof a === "object") store.set(askKey, JSON.stringify({ ...a, status, end: Date.now() })).catch(() => {});
    };
    const prev = dayRecOf(store, day);
    if (tyBusy.current.has(day) || (prev && prev.status === "making" && prev.mk && Date.now() - (Number(prev.mk.at) || 0) < TY_STALE)) {
      markAsk("busy");
      return;
    }
    tyBusy.current.add(day);
    const write = async (R) => {
      if (!(await store.set(key, JSON.stringify(R)))) {
        markStorageFail();
        throw Object.assign(new Error("存不进去"), { why: "存不进去（存档满了？），腾出地方再交给我一回" });
      }
      tyChanged([key]);
    };
    const t0 = Date.now();
    tyRuns.current = tyRuns.current.filter((t) => t0 - t < 10 * 60 * 1000);
    if (tyRuns.current.length >= 6) {
      try {
        await write(failedDay(makingDay(prev, day, [], t0), day, [{ a: "没排成", b: "这一会儿交给我太多回了，过几分钟再来", fail: 1 }], t0));
      } catch (e) {}
      tyBusy.current.delete(day);
      markAsk("busy");
      return;
    }
    tyRuns.current.push(t0);
    let steps = [{ a: "在读这天的照片和聊天", ok: false }];
    let making = makingDay(prev, day, steps);
    // 排的这一会儿她起了标题（setTitle 写在排着的那一份上）：往回写的时候带上
    const withHers = (R) => {
      const cur = dayRecOf(store, day);
      if (cur && cur.status === "making" && cur.mk && cur.mk.at === making.mk.at) {
        if (cur.herTitle) R.herTitle = cur.herTitle;
        else delete R.herTitle;
      }
      return R;
    };
    try {
      await write(making);
    } catch (e) {
      tyBusy.current.delete(day);
      markAsk("failed");
      return;
    }
    try {
      // 原料：那一天的原话、照片（她发过来的在前，再是这一页上原来的、那天聊天里的），最多十张，长边 512
      // 聊天里的原话、狐宇宙里的便签分开给他（便签另列一段，写明是狐宇宙里的；她 10 月 22 日说的“可以”）；照片两边的都算
      if (!daysAtRef.current || !(dayMsgsRef.current[day] || []).length) await loadDays();
      const chatMs = chatDaysRef.current[day] || [];
      const foxMs = foxDaysRef.current[day] || [];
      const both = materialsOf([...chatMs, ...foxMs]);
      const mats = { quotes: materialsOf(chatMs).quotes, photos: both.photos };
      const notes = materialsOf(foxMs).quotes.map((q) => ({ ...q, src: "便签" }));
      // 他挑出来的照几点排（原话、便签掺在一起）
      const noteIds = new Set(notes.map((q) => q.id));
      const allQ = both.quotes.map((q) => (noteIds.has(q.id) ? { ...q, src: "便签" } : q));
      const chatT = (imgId) => (mats.photos.find((p) => p.imgId === imgId) || {}).t || "";
      const cands = [];
      const add = (ref, from, t) => {
        if (cands.length < TY_PHOTO_MAX && !cands.some((c) => c.ref === ref)) cands.push({ ref, from, t });
      };
      ask.photos.forEach((r) => {
        // 聊天里的只认这一天的
        if (r.startsWith("kfschat:") && !mats.photos.some((p) => p.imgId === r.slice(8))) return;
        add(r, "asked", r.startsWith("kfschat:") ? chatT(r.slice(8)) : "");
      });
      const was = making.mk.prev;
      ((was && was.photos) || []).forEach((p) => p && typeof p.src === "string" && /^kfsimg:[A-Za-z0-9_-]+$/.test(p.src) && add(p.src, "page", p.t || ""));
      mats.photos.forEach((p) => add("kfschat:" + p.imgId, "chat", p.t));
      const shown = [];
      const blocks = [];
      for (const c of cands) {
        const data = c.ref.startsWith("kfsimg:") ? await store.get(TY_IMG + c.ref.slice(7)) : imgsRef.current[c.ref.slice(8)] || (await store.get("kfs2:img:" + c.ref.slice(8)));
        if (typeof data !== "string" || !data.startsWith("data:image/")) continue;
        let thumb = data;
        try {
          thumb = await urlToThumb(data, 512);
        } catch (e) {}
        const blk = dataUrlBlock(thumb);
        if (!blk) continue;
        const tag = tyTag(shown.length);
        shown.push({ ...c, tag, data });
        blocks.push({ type: "text", text: tag }, blk);
      }
      steps = [
        { a: "看了这天的照片和聊天", b: `${shown.length} 张照片 · ${mats.quotes.length} 句原话${notes.length ? ` · ${notes.length} 句便签` : ""}`, ok: true },
        { a: "在排", b: "挑照片、挑原话、起标题", ok: false },
      ];
      making = withHers({ ...making, steps });
      await write(making);

      // 问他：名帖照写日记那一回（不带工具，不带【日记本】那一段），后面跟【排手帐】
      const st = settingsRef.current;
      const model = st.model || DEFAULT_MODEL;
      const d = parseDayKey(day);
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
      const docs = memFilesRef.current.filter((f) => f.enabled).map((f) => ({ name: f.name, content: memTextsRef.current[f.id] || "" }));
      const { staticText, nowNote } = buildSystem({
        now: new Date(),
        memeList: allMemes,
        hisAvatarName: avatarName(avatarsRef.current.him),
        memDocs: docs,
        mcpNames: [],
        voice: !!st.voice,
        thoughts: st.thoughts !== false,
        callable: st.callable !== false,
        diary: false,
      });
      const diary = ((await loadMonth(day.slice(0, 7))) || {})[day] || {};
      const P = pageRecOf(store, day) || {};
      const keep = {
        hide: (P.hide || []).filter((k) => typeof k === "string"),
        texts: (P.stk || []).filter((o) => o && o.c === "text" && !o.me1 && typeof o.m === "string" && o.m.trim()).map((o) => o.m.trim()),
        title: making.herTitle || "",
        look: herLookOf(store, day, was),
      };
      const wxRec = (was && was.wx) || safeParse(store.peek(`${TY_KV}wx/${day}`), null);
      const wx = wxRec && Number.isFinite(wxRec.code) ? wxRec : null;
      const at = (was && was.at) || (wxRec && wxRec.at) || "";
      const q = tyArrangeAsk({ label, her: namesRef.current.her || HER_NAME, quotes: mats.quotes, notes, photos: shown, diary, wx, at, wish: ask.text, keep });
      let data;
      // 等他最多五分钟：一直没回（网卡住了），这一台上“在排”就一直转、别处也收拾不了（这一天在 tyBusy 里），当没排成
      const ac = new AbortController();
      let late = false;
      const timer = setTimeout(() => {
        late = true;
        ac.abort();
      }, TY_WAIT);
      try {
        data = await callClaude(
          {
            model,
            max_tokens: thinksFirst(model) ? 8000 : 3000,
            system: [
              { type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } },
              { type: "text", text: q.rule },
            ],
            messages: [{ role: "user", content: [{ type: "text", text: `${q.text}\n\n${nowNote}` }].concat(blocks) }],
          },
          undefined,
          ac.signal
        );
      } catch (e) {
        throw Object.assign(new Error(String((e && e.message) || e)), { why: late ? "等了好久没回来，再交给我一回试试" : "没连上，等一会儿再交给我一回" });
      } finally {
        clearTimeout(timer);
      }
      recordUsage(data);
      const said = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const A = parseTyArrange(said, allQ, shown.map((x) => x.tag));

      // 他挑的聊天里的照片另存一份（长边 1000，同“聊天里的照片”放上纸那条路；聊天删了它还在）
      const srcOf = {};
      for (const p of A.photos) {
        const c = shown.find((x) => x.tag === p.tag);
        if (!c) continue;
        if (c.ref.startsWith("kfsimg:")) {
          srcOf[p.tag] = c.ref;
          continue;
        }
        let img = c.data;
        try {
          img = await urlToThumb(c.data, 1000);
        } catch (e) {}
        const id = "ty" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (!(await store.set(TY_IMG + id, img))) {
          markStorageFail();
          throw Object.assign(new Error("存不进去"), { why: "存不进去（存档满了？），腾出地方再交给我一回" });
        }
        srcOf[p.tag] = "kfsimg:" + id;
      }
      const nPh = A.photos.filter((p) => srcOf[p.tag]).length;
      const look = `${A.layout ? TY_LAYOUTS[A.layout] : "版式本子挑"} × ${A.style ? TY_STYLES[A.style] : "风格本子挑"}`;
      const done = [steps[0], { a: "排好了", b: `${keep.look ? "照你挑的版式风格" : look} · 照片 ${nPh} 张 · 原话 ${A.quotes.length} 句`, ok: true }];
      // 排的这一会儿她自己起了标题、清空了：照她这会儿的（读这会儿排着的那一份，见 withHers）
      const herTitle = withHers({ herTitle: making.herTitle || "" }).herTitle || "";
      await write(
        arrangedDay(herTitle, A, {
          day,
          src: (tag) => srcOf[tag],
          time: (tag) => (shown.find((x) => x.tag === tag) || {}).t || "",
          wx,
          at,
          now: Date.now(),
          steps: done,
        })
      );
      // 这一页同页记着的版式风格要是她没改过（离开那一天的时候自动记的），拿掉：照他挑的摆。
      // 这会儿再看一眼（他排着的时候她要是挑了版式风格，照她的）
      if (!keep.look && !herLookOf(store, day, was) && store.peek(`${TY_LS}journalLook:${day}`) != null) {
        await store.del(`${TY_LS}journalLook:${day}`);
        tyChanged([`${TY_LS}journalLook:${day}`]);
      }
      // 他想留一句批注
      if (A.note) {
        const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const n = { id, day, who: "me", text: A.note.text, at: Date.now(), re: null, b: A.note.b, fx: 0.9, fy: A.note.b ? 0.12 : 0.06 };
        if (await store.set(`${TY_KV}notes/${id}`, JSON.stringify(n))) tyChanged([`${TY_KV}notes/${id}`]);
      }
      markAsk("done");
    } catch (e) {
      const why = (e && e.why) || "没排出来，再交给我一回试试";
      try {
        await write(failedDay(withHers({ ...making }), day, [...steps.filter((s) => s.ok !== false), { a: "没排成", b: why, fail: 1 }]));
      } catch (x) {}
      markAsk("failed");
    } finally {
      tyBusy.current.delete(day);
    }
  };
  const tyApi = {
    // 掺过手帐的那几天（闲笔集的日历格子上标一个 🏷️）。原来那一版掺的页先挪过来（挪过的不再挪；对过云端才挪）；
    // 排到一半断了的（开封府被关了），当没排成
    days: async () => {
      await tyMigrate();
      try {
        await settleStale(store, tyBusy.current);
      } catch (e) {}
      return madeDays(store);
    },
    // 那一天有变化（他排好了、另一台设备改了）：闲笔集重看一遍
    watch: (fn) =>
      onTyChanged((keys) => {
        if (keys.some((k) => k.startsWith(`${TY_KV}day/`) || k.startsWith(`${TY_KV}notes/`))) fn();
      }),
    info: async (day) => {
      const i = infoOf(store, day);
      if (!i) return null;
      return { ...i, hero: i.heroId ? (await store.get(TY_IMG + i.heroId)) || null : null };
    },
    notes: async (day) => notesOf(store, day),
    addNote: async (day, text) => {
      try {
        return await addNoteTo(store, day, "her", text);
      } catch (e) {
        markStorageFail();
        return null;
      }
    },
    dropNote: async (day, id) => {
      try {
        return await dropNoteOf(store, day, id);
      } catch (e) {
        markStorageFail();
        return null;
      }
    },
    // 点开之前：先跟云端对一回（见上面 tySync），掺过了是看、没掺是打开那一天的那一屏（交给光义、自己拼）；
    // 点开的时候什么都不写（她头一回动手才起那一天的 day，见 host.js 的 ensureDay）。
    // 她填过天气在哪儿、这一天还没取过，取一回（取到了告诉框里）
    prepare: async (day) => {
      await tyMigrate();
      // 按天归的那一趟还在归（她刚打开闲笔集就点开了手帐）：等它归完，框里带进去的每天几句（日历的深浅）照新的
      if (daysRunRef.current) await daysRunRef.current.catch(() => {});
      const mode = openMode(store, day);
      const cfg = safeParse(await store.get(JZCFG_KEY), {}) || {};
      // 天气等一小会儿（最多两秒半）：取到了再开，同页打开那一下天气签就画上了；取得慢的，取到了再告诉框里
      await Promise.race([fillWeather(store, day, cfg, dayWeather).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
      return mode;
    },
    // 框里要的几样：每一天聊了多少、某一天的话、聊天里的一张照片
    // 聊天（heat、dayMsgs）和狐宇宙里的（noteHeat、noteMsgs，引用栏的便签那一栏）分开给。
    // 归过一遍就照归好的给（没聊过天的日子不再从头翻一遍：10 月 22 日她报手帐卡，查到的一处）；还没归过的先归一遍
    frame: () => {
      const count = (byDay) => {
        const h = {};
        Object.keys(byDay).forEach((k) => {
          h[k] = (byDay[k] || []).length;
        });
        return h;
      };
      // 正在归的那一趟（她刚打开闲笔集）等它归完，不拿上一回归好的旧的给；从没归过的归一遍
      const ready = async () => {
        if (daysRunRef.current) await daysRunRef.current;
        else if (!daysAtRef.current) await loadDays();
      };
      return {
        heat: count(chatDaysRef.current),
        noteHeat: count(foxDaysRef.current),
        dayMsgs: async (date) => {
          await ready();
          return chatDaysRef.current[date] || [];
        },
        noteMsgs: async (date) => {
          await ready();
          return foxDaysRef.current[date] || [];
        },
        chatImg: async (imgId) => imgsRef.current[imgId] || (await store.get("kfs2:img:" + imgId)) || null,
        onFail: markStorageFail,
        // 她在「交给光义」那一屏点了发送
        onAsk: (ask) => tyArrange(ask),
      };
    },
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
      localStorage.removeItem(TRAD_KEY); // 藏音匣纸条上转好的繁体（是她存的那几句话，跟本地存档一起清掉）
    } catch (e) {}
    stopVoice();
    if (account.signOut) account.signOut();
  };

  // ---- 侧滑手势 ----
  // 只认一根手指。落下了第二根，这一回就不算划侧栏了（拖到一半的弹回去），等手指全抬起来再从头认：
  // 整页不许捏以后，两根手指往里一捏，头一根正好是往右走的，原来会被当成右划、把侧栏带出来
  const onTouchStart = (e) => {
    if (sheet || historyOpen || splash || viewer || menu || diaryOpen || boxOpen || docView || recapView || lotusOpen || qxOpen) return;
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
    if (sheet || historyOpen || splash || viewer || menu || diaryOpen || boxOpen || docView || recapView || lotusOpen || qxOpen) {
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
  // ---- 对话窗跟着侧栏让开、滑回来（见 slide.js）----
  // 它的 transform 不交给系统动画（不写 CSS 过渡），在这里一帧一帧写：长对话里 iPhone 的 WebKit 会在系统动画那一下
  // 把整段对话每个气泡的画面一起备上，内存顶破，整页被杀。手指拖着的时候一下到位，松了手、点了按钮才自己滑
  if (!slideRef.current) {
    slideRef.current = createSlide({
      // 写到百分之一个像素为止：再细的眼睛看不出；滑到最后那几帧的数小得很，不收一收浏览器会记成 2.7e-06 这种样子
      put: (v) => {
        if (winRef.current) winRef.current.style.transform = `translateX(${Math.round(v * 100) / 100}px)`;
      },
      raf: (fn) => requestAnimationFrame(fn),
      caf: (id) => cancelAnimationFrame(id),
      now: () => performance.now(),
    });
  }
  const dragging = dragX !== null;
  useLayoutEffect(() => {
    if (dragging) slideRef.current.jump(x);
    else slideRef.current.to(x);
  }, [x, dragging]);
  useEffect(() => () => slideRef.current.stop(), []);
  // 侧栏收起来：日期卡片上的“去看并蒂莲”变回纪念日那行（别处落手指的那一道在 DaysCard 里，这一道兜着不是手指收起的那些）
  useEffect(() => {
    if (!drawerOpen) setLotusArmed(false);
  }, [drawerOpen]);
  // 江湖棋局里他说到一半、这一步蹦完正要接着说的那一下（cont）也算在回：顶上照旧“正在输入…”，停键照旧在
  const typing = loading || reveal !== null || (!!cont && cont === chatId);
  // 那边的我在回：她一发完话就算（话还排着队），到回话全蹦完为止。停键认的是这个
  const replying = queued || typing;
  // 那行“停了，点这里让我回”摆在她哪一句底下（江湖棋局里也可能是他说到一半的那一步）：他没在回的时候才摆
  const stoppedId = !replying ? stoppedAt(messages) : "";
  // 江湖棋局里他说到一半、却没人接着要的那一步（上回打开时留下的、别的设备同步过来的、接着要的那一回没送到的）：
  // 底下摆一行“还没说完，点这里让我接着说”。他在回、停了、底下已经有“没送到，点这里重发”的时候不摆
  const lastSaid = messages.filter((m) => m.role !== "event").pop();
  const moreId = !replying && !errorNote && !stoppedId && midTurn(lastSaid) ? lastSaid.id : "";
  // 聊天记录里那行“抄成了提要”的小字：只摆眼下作数的那一份（单子里更早的几份不摆，它们已经被这一份接过去了）
  const liveRecap = useMemo(() => pickRecap(messages, recaps).recap, [messages, recaps]);
  const rows = useMemo(() => buildRows(messages, reveal, stoppedId, liveRecap, moreId), [messages, reveal, stoppedId, liveRecap, moreId]);
  // 眼下浮着的那张选项卡（见上面 askView）：那一条还在、那一样还是没答的卡，才摆。狐宇宙、打着电话的时候不摆
  const askMsg = askView && !call && !isFoxChat(chatId) ? messages.find((m) => m.id === askView.msgId) : null;
  const askHit = askMsg && Array.isArray(askMsg.items) ? askMsg.items[askView.idx] : null;
  const askItem = askHit && askHit.type === "ask" && !askHit.done && Array.isArray(askHit.qs) && askHit.qs.length ? askHit : null;
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
  // 并蒂莲那一层不算在里头：那层淡出（main.jsx 的 BottomMist）在外壳外头、层高 60，会盖到并蒂莲上面；
  // 那一层开着的时候网页底色是黑的，本来也不该淡进浅色（见 panels/LotusPage.jsx）
  const chatOnTop = !splash && !sheet && !historyOpen && !diaryOpen && !boxOpen && !menu && !viewer && !copySheet && !chatMenu && !renaming && !docView && !recapView;
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
  // 今天的日记写了没：侧栏“南衙”那一格底下的小字，和点开以后“闲笔集”那一行的小字，是同一句
  const diarySub = diaryToday.her && diaryToday.him ? "今天都写了" : diaryToday.her ? "今天卿卿写了" : diaryToday.him ? "今天光义写了" : "今天还没写";

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
          {/* 他写不写心里话：卿卿 10 月 14 日凌晨要的开关，放在他的头像卡片底下；一个开关管所有模型，默认开着。
              关了，寄过去的【回复格式】里就没有心里话那一条（见 prompt/system.js 的 THOUGHT_RULE）。存在设置里，跟着云端走。
              打电话的时候自动照关着寄（10 月 15 日，见 thoughtsFor），这里的开关不跟着动 */}
          <div className="kfs-thoughts flex items-center justify-between" style={{ ...glass(0.5, 16), borderRadius: 16, padding: "10px 14px", marginTop: 10, gap: 12 }}>
            <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.5 }}>
              他写心里话
              <div style={{ fontSize: 11.5, color: T.inkSoft }}>
                {settings.thoughts !== false ? "开着：先写几句心里话，点“思考过程”能看" : "关着：不写心里话，直接回你"}
              </div>
            </div>
            <Toggle on={settings.thoughts !== false} onChange={(v) => updateSettings({ thoughts: v })} label="他写心里话" />
          </div>
          <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>所有模型一起管，打电话的时候自动关着。拨了以后，下一句话那段对话的缓存得重新攒一回，那一句贵一些，之后照常。</p>
          {/* 他自己醒（狐宇宙，卿卿 10 月 20 日要的，见 fox.js、panels/FoxSection.jsx）：跟“他写心里话”放在一处，都是他的事 */}
          <FoxSection settings={settings} onChange={updateSettings} state={foxState} canKnock={knockList().length > 0} now={now.getTime()} />
          <div style={{ height: 1, background: HAIR, margin: "22px 0 18px" }} />
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>主题色</div>
          <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: theme === entranceTheme() ? 22 : 10 }}>
            {[
              ["qinglv", "linear-gradient(140deg,#BCD4CA,#7FA39A)"],
              ["dingxiang", "linear-gradient(140deg,#DCCFF0,#A58BC9)"],
              ["heiye", "linear-gradient(140deg,#8FABDC,#0E1A36)"],
            ].map(([k, g]) => (
              <button
                key={k}
                onClick={() => setTheme(k)}
                aria-pressed={theme === k}
                aria-label={`${THEMES[k].label}主题`}
                className="kfs-tap flex items-center"
                style={{ ...chip, gap: 8, padding: "5px 14px 5px 6px", backgroundColor: theme === k ? fill(0.82) : chip.backgroundColor }}
              >
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: g, border: `2px solid ${T.onDai}`, boxShadow: theme === k ? `0 0 0 2px ${T.dai}` : "none" }} />
                {THEMES[k].label}
              </button>
            ))}
          </div>
          {/* 还没有自己入口和图标的主题（theme.js 里 entrance 是空的）：只说一句图标不变，不给网址。
              黑夜 10 月 19 日有了入口，眼下三套都有，这一块不出来；往后再添主题、还没挑图标的时候用得上 */}
          {theme !== entranceTheme() && !THEMES[theme].entrance && (
            <div style={{ ...glass(0.5, 16), borderRadius: 16, padding: "12px 14px", marginBottom: 22 }}>
              <p className="kfs-theme-noentry" style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.65 }}>
                {THEMES[theme].label}还没有自己的主屏幕图标，图标还是{THEMES[entranceTheme()].icon}。换过来就记在这台手机上了，下回打开还是{THEMES[theme].label}。
              </p>
            </div>
          )}
          {theme !== entranceTheme() && THEMES[theme].entrance && (
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
          <div style={{ ...glass(0.5, 16), borderRadius: 16, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6, color: sync.offline || !storageOk ? T.red : T.ink }}>
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

          <div style={{ height: 1, background: HAIR, margin: "22px 0 18px" }} />
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
              style={{ ...chip, color: T.red }}
            >
              {clearArmed ? "再点一次，删掉这段对话" : "删掉当前这段对话"}
            </button>
            <button onClick={logout} className="kfs-tap" style={{ ...chip, color: T.red }}>
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
        <Sheet title="万岁殿" onClose={() => { setSheet(null); setMemNote(""); }}>
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
            onEchoProbe={startEcho}
            onTest={testApi}
            testNote={testNote}
            testing={testing}
            usage={usage}
            monthUsage={monthUsage}
            recapUsage={recapUsage}
            fit={recallTier(buildSystem({ now: new Date(), memeList: allMemes, hisAvatarName: "", memDocs: memFiles.filter((f) => f.enabled).map((f) => ({ name: f.name, content: memTexts[f.id] || "" })), mcpNames: [], voice: !!settings.voice, thoughts: settings.thoughts !== false, callable: settings.callable !== false, qx: qxSection(qxPool), room: roomSection(wakeOn(settings)) }).staticText)}
          />
        </Sheet>
      );
    }
    if (sheet === "nanya") {
      // 南衙：小功能汇总（见 panels/NanyaPanel.jsx）。点“闲笔集”：菜单收起，日记那一页照原来的样子滑进来；
      // 从日记按返回是回到侧栏，不回这张菜单（卿卿点过头的）。还没盖好的那几行，点了只冒一句话
      return (
        <Sheet title="南衙" onClose={() => setSheet(null)}>
          <NanyaPanel
            subs={{ fox: foxSub({ on: wakeOn(settings), state: foxState, now: now.getTime() }), diary: diarySub, jianghu: nanyaSub(latestGame() && latestGame().board), voicebox: boxSub(boxList.length), qx: hasLots(qxPool) ? `签库里 ${poolSize(qxPool)} 条签` : "签库还空着" }}
            open={{
              // 狐宇宙：菜单收起，翻到那段对话（他自己醒来说的话都在那儿，见 fox.js）
              fox: () => {
                setSheet(null);
                openChat(FOX_CHAT);
              },
              diary: () => {
                setSheet(null);
                setDiaryOpen(true);
              },
              // 江湖棋局：这张菜单换成棋局那一张（接着上一局、开新的一局）
              jianghu: () => setSheet("jianghu"),
              // 藏音匣：菜单收起，那一页滑进来；左上角返回回到侧栏（跟闲笔集一样）。聊天里正放着的语音停下
              voicebox: () => {
                stopVoice();
                setSheet(null);
                setBoxOpen(true);
              },
              // 秘戏钱匣：菜单、侧栏都收起，盖上那一层（见 qx/QxPage.jsx）；叉一点回到眼前这段对话（她丢进来的签在这儿，他关上以后回）。
              // 聊天里正放着的语音停下（锦盒自己有声音）
              qx: () => {
                stopVoice();
                setSheet(null);
                setDrawerOpen(false);
                openQx();
              },
            }}
            onSoon={(name) => setToast(soonToast(name))}
          />
        </Sheet>
      );
    }
    if (sheet === "jianghu") {
      // 江湖棋局（见 game/GameParts.jsx 的 JianghuPanel）：接着上一局，就是翻到最近那一局的那段对话；
      // 开新的一局，就是开一段编号 jh 开头的新对话（她说一声“开局”，他问身份、讲开场）；
      // 就在这段对话里下：眼下这段平常对话（说过话的、在历史对话里的）摆开棋盘；收棋：摆开过的这一段收起来（卿卿 10 月 16 日要的）
      const g = latestGame();
      const cur = chatId;
      const plain = !isGameChat(cur) && messages.length > 0 && index.some((c) => c.id === cur);
      const shut = () => {
        setSheet(null);
        setHistoryOpen(false);
        setDrawerOpen(false);
      };
      return (
        <Sheet title="江湖棋局" onClose={() => setSheet(null)}>
          <JianghuPanel
            last={g ? g.board : null}
            hasGame={!!g}
            here={plain ? (gameOn(cur, onSet) ? "on" : "off") : ""}
            onContinue={() => {
              setSheet(null);
              if (g) openChat(g.id);
            }}
            onNew={() => {
              setSheet(null);
              newChat(true);
            }}
            onHere={() => {
              shut();
              setBoardOn(cur, true);
            }}
            onStop={() => {
              shut();
              setBoardOn(cur, false);
            }}
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
          {/* 并蒂莲的暗门（卿卿 10 月 12 日定的）：长按它，最底下那行换成“去看并蒂莲”，点那一行才进去；光点不算 */}
          <DaysCard
            now={now}
            armed={lotusArmed}
            onArm={() => setLotusArmed(true)}
            onDisarm={() => setLotusArmed(false)}
            onLotus={() => {
              setLotusArmed(false);
              setLotusOpen(true);
            }}
          />
          <div className="grid grid-cols-2 flex-shrink-0" style={{ gap: 12 }}>
            {/* 头一个方块上写“万岁殿”（卿卿 10 月 10 日改的，原来写“记忆库”）。换了两处：方块上这三个字、点开以后面板顶上的标题。
                空对话里“记忆库还是空的”那一句、寄给那边的【记忆库】（prompt/system.js）没动，还叫记忆库 */}
            {/* 四个方块的图标是恩师画的一套（卿卿 2026 年 10 月 11 日定的）：万岁殿是殿，MCP 是三足乌，API 是云月，南衙是牡丹。
                都比手绘的那一套大一号、跟着主题色走（ui/Icon.jsx 最上面）。换的只是图标：方块上的字、底下的小字、点开是哪个面板都没动 */}
            <Tile icon="hall" label="万岁殿" sub={memFiles.length ? `带着 ${enabledDocs} 份文档` : "放文档"} onClick={() => setSheet("memory")} />
            <Tile icon="crow" label="MCP" sub={enabledMcp ? `开着 ${enabledMcp} 个` : `装了 ${(settings.mcps || []).length} 个`} onClick={() => setSheet("mcp")} />
            <Tile icon="moon" label="API" sub={monthUsage && monthUsage.month === usageKey() && monthUsage.replies ? `本月约 ${money(monthUsage.cost)}` : "连接与用量"} onClick={() => setSheet("api")} />
            {/* 第四个方块是“南衙”（卿卿 2026 年 10 月 11 日定的）：原来写“日记本”、点了直接进日记，现在点了从底下冒出一张菜单
                （见 renderSheet 里的 nanya），日记是里面的头一行“闲笔集”。图标是恩师画的牡丹。
                底下那行小字没动，还是今天的日记写了没 */}
            {/* 狐宇宙里他的动静不在这儿亮小点（她 10 月 20 日 22:04 定的：不弹横幅、不要红点） */}
            <Tile icon="peony" label="南衙" sub={diarySub} onClick={() => setSheet("nanya")} />
          </div>
        </div>
        {/* 历史对话固定在最底下那排（头像、新对话）的正上方，不跟着上面那段滚（卿卿定的位置）。
            它和底下那排之间隔 12，跟卡片之间的间距一样；屏幕有富余的时候，空在它和四个方块之间 */}
        <div className="flex-shrink-0" style={{ padding: "0 16px" }}>
          <HistoryCard
            index={index.filter((c) => !isFoxChat(c.id))}
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
      {/* 往右让开多少（transform）不写在这儿，也不写它的 CSS 过渡：由 slide.js 一帧一帧写到它身上（见上面量 x 的地方）。
          **别把 transform 的过渡加回来**：长对话里 iPhone 会白屏、退回开屏（见 slide.js 开头）。圆角的过渡照旧 */}
      <div
        ref={winRef}
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{
          transition: dragX === null ? "border-radius .35s" : "none",
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

        {/* 江湖棋局那一段：顶栏底下一条，写第几章、各在第几格、各有几两（见 game/GameParts.jsx） */}
        {gameOn(chatId, onSet) && <GameStrip board={boardIn(messages)} />}

        {storageBanner && (
          <div
            className="relative z-10 flex items-center justify-between flex-shrink-0"
            style={{ ...glass(0.62, 20), borderRadius: 14, margin: "8px 12px 0", padding: "8px 12px", fontSize: 12, color: T.red }}
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
          {/* 江湖棋局那一段还空着：中间写“江湖棋局”（底下原来有一句怎么开局的提示，卿卿 10 月 16 日说连同气泡拿掉） */}
          {/* 狐宇宙还空着（他还没自己醒过）：中间写“狐宇宙”，底下一行小字是眼下的样子（同南衙那一行，见 fox.js 的 foxSub） */}
          {messages.length === 0 && !loading && isFoxChat(chatId) && (
            <div className="kfs-fox-empty h-full flex flex-col items-center justify-center" style={{ gap: 12 }}>
              <p className="kfs-fox-title" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.4em", paddingLeft: "0.4em", color: T.motto }}>
                {FOX_TITLE}
              </p>
              {/* 字的颜色同中间那行字（--k-motto，实色）：这一块压在背景中间那一方深色上，淡墨在上面看不清 */}
              <p style={{ fontSize: 12.5, color: T.motto, lineHeight: 1.8, textAlign: "center", letterSpacing: "0.05em" }}>
                这是他的屋子：他自己醒来干了什么，都留在这里
                <br />
                <span className="kfs-fox-sub" style={{ opacity: 0.75 }}>
                  {foxSub({ on: wakeOn(settings), state: foxState, now: now.getTime() })}
                </span>
              </p>
            </div>
          )}
          {messages.length === 0 && !loading && isGameChat(chatId) && (
            <div className="kfs-game-empty h-full flex flex-col items-center justify-center">
              <p className="kfs-game-title" style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.4em", paddingLeft: "0.4em", color: T.motto }}>
                江湖棋局
              </p>
            </div>
          )}
          {messages.length === 0 && !loading && !isGameChat(chatId) && !isFoxChat(chatId) && (
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
              const r = row.kind === "rename" || row.kind === "wake" ? { ...row, av: avatars.him } : row;
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
                />
              );
            }
            if (row.type === "tools") {
              // “用了 tavily”那一行；他翻了日记的那一行（kind: diary，见 diaryTools.js）也是这个样子
              return (
                <div key={row.key} className={row.kind === "diary" ? "kfs-diary-note" : undefined} style={{ marginLeft: 42, marginTop: 8, fontSize: 11.5, color: T.inkFaint }}>
                  {row.text}
                </div>
              );
            }
            if (row.type === "lot") {
              // 她从秘戏钱匣里丢进来的一签（见 qx/LotRow.jsx）
              return <LotRow key={row.key} msg={row.msg} animate={row.msg.ts >= listMount.current} />;
            }
            if (row.type === "game") {
              // 江湖棋局：他这一步下了什么（掷了几点、走到哪、花了几两，见 game/jianghu.js 的 cardsOf）
              return <GameCardRow key={row.key} text={row.text} animate={row.msg.ts >= listMount.current} />;
            }
            if (row.type === "stopped" || row.type === "more") {
              // 她按停作废的那一句底下：一行小字，点了照眼下的对话让那边的我回（样子照原来他回话底下那颗“重新回答”，那一颗 10 月 13 日夜里拿掉了）。
              // 江湖棋局里他说到一半的那一步（停了的、没人接着要的）：摆在他那一边，点了他接着说
              const his = row.msg.role === "him";
              return (
                <div key={row.key} className={`kfs-in flex ${his ? "justify-start" : "justify-end"}`} style={{ marginTop: 2, [his ? "marginLeft" : "marginRight"]: 36 }}>
                  <button onClick={askAgain} className={`kfs-tap ${row.type === "more" ? "kfs-more" : "kfs-stopped"}`} style={{ padding: "6px 6px", fontSize: 12, color: T.inkSoft }}>
                    {row.type === "more" ? "还没说完，点这里让我接着说" : "停了，点这里让我回"}
                  </button>
                </div>
              );
            }
            if (row.type === "recap") {
              return <RecapRow key={row.key} onOpen={() => setRecapView(row.recap)} />;
            }
            if (row.type === "ask") {
              // 他弹给她的选项卡：一行“他问了你 N 个问题 · 点开答”，点了卡片再浮出来；答完了“已答”（见 chat/AskCard.jsx）
              return (
                <AskRow
                  key={row.key}
                  n={(row.item.qs || []).length}
                  done={!!row.item.done}
                  onOpen={() => {
                    if (call || isFoxChat(chatId)) return;
                    setAskView({ msgId: row.msg.id, idx: row.idx });
                  }}
                />
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
              <button onClick={retry} className="kfs-tap" style={{ ...glass(0.62, 18), borderRadius: 18, padding: "8px 16px", fontSize: 12.5, color: T.red, maxWidth: "88%" }}>
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
              style={{ ...glass(0.66, 18), width: 38, height: 38, borderRadius: 999, color: T.ink, boxShadow: FLOAT_SHADOW }}
            >
              <Icon name="down" size={19} sw={2} />
            </button>
          </span>
        </div>

        {voiceNote && (
          <div
            className="relative z-10 flex-shrink-0 kfs-in"
            style={{ ...glass(0.62, 18), borderRadius: 16, margin: "0 12px 8px", padding: "9px 14px", fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, whiteSpace: "pre-line" }}
          >
            {voiceNote}
          </div>
        )}

        {/* 他弹给她的选项卡（见 chat/AskCard.jsx）：浮在输入框上面，输入框照旧能用（直接打字发出去，卡片就收起来）。
            换了一张卡（哪怕同一条话同一个位置，翻了版本换成了别的题）从头答 */}
        {askItem && <AskCard key={askView.msgId + "-" + askView.idx + "-" + JSON.stringify(askItem.qs)} qs={askItem.qs} onDone={answerAsk} onClose={closeAsk} />}

        {/* 输入框：照官方摆，上面写字，下面一排按钮，整块贴着底边。
            --kfs-sab 平时是底下横条要让的高度，iOS 底下空一条的时候是 0（见 input.css）。
            表情包面板开着的时候连在按钮底下、一起贴到屏幕最底（照微信，卿卿 10 月 17 日要的），横条那一截由面板自己让。
            打字的时候（键盘或者表情包面板开着）变成一行：左边加号，中间打字，右边笑脸和发送；模型、听写先收起来（她 10 月 17 日点的） */}
        {isFoxChat(chatId) ? (
          <FoxNotePad onSave={saveFoxNote} />
        ) : (
        <div
          className="kfs-composer relative z-10 flex-shrink-0"
          data-compact={compact ? "" : undefined}
          style={{ ...DOCK_GLASS, padding: `${compact ? 8 : 10}px 14px ${memePanel ? "0" : "max(8px, var(--kfs-sab))"}` }}
        >
          {attach.length > 0 && (
            <div className="flex overflow-x-auto kfs-scroll" style={{ gap: 10, padding: "6px 4px 10px" }}>
              {attach.map((ph) => (
                <div key={ph.id} className="relative flex-shrink-0">
                  {ph.kind === "doc" ? (
                    <div
                      className="kfs-doc-chip flex items-center"
                      style={{ height: 60, maxWidth: 190, gap: 8, padding: "0 12px 0 8px", borderRadius: 14, background: fill(0.55), border: HAIRLINE }}
                    >
                      <span className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 11, background: fill(0.75), color: T.dai }}>
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
                      style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 14, border: HAIRLINE, display: "block" }}
                    />
                  )}
                  <button
                    onClick={() => setAttach((a) => a.filter((q) => q.id !== ph.id))}
                    aria-label={ph.kind === "doc" ? "不发这份" : "不发这张"}
                    className="absolute flex items-center justify-center"
                    style={{ top: -6, right: -6, width: 22, height: 22, borderRadius: 999, background: "rgba(var(--k-dim),0.78)" }}
                  >
                    <Icon name="x" size={12} color={T.onDai} sw={2.2} />
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
          <div style={{ display: "grid", gridTemplateColumns: composeCols, gridTemplateAreas: composeAreas, columnGap: 6, rowGap: 4, alignItems: compact ? "end" : "center" }}>
              <textarea
                ref={taRef}
                className="kfs-field block w-full"
                value={input}
                rows={1}
                placeholder={dictating ? "正在听你说…" : "说话，我听着"}
                onFocus={() => {
                  setTaFocus(true);
                  if (memePanel) memesToKeyboard();
                }}
                onBlur={taBlurred}
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
                  gridArea: "ta",
                  resize: "none",
                  maxHeight: COMPOSE_MAX,
                  // 一行的时候自己是一个圆角的框（跟两边的圆钮一样高），两行的时候照原来贴在玻璃上
                  padding: compact ? "8px 12px" : "6px 10px",
                  borderRadius: compact ? 19 : 0,
                  fontSize: 16,
                  lineHeight: 1.45,
                  color: T.ink,
                  background: compact ? fill(0.42) : "transparent",
                  border: "none",
                  outline: "none",
                  userSelect: "text",
                  WebkitUserSelect: "text",
                }}
              />
                {!editing && (
                  <span style={{ gridArea: "plus", display: "flex" }}>
                    <RoundBtn onClick={() => photoInputRef.current && photoInputRef.current.click()} label="发照片或文档">
                      <Icon name="plus" size={20} />
                    </RoundBtn>
                  </span>
                )}
                {!editing && (
                  <span style={{ gridArea: "smile", display: "flex" }}>
                    <RoundBtn onClick={toggleMemes} label="表情包" active={memePanel}>
                      <Icon name="smile" size={20} />
                    </RoundBtn>
                  </span>
                )}
                {!compact && (
                  <button
                    onClick={() => setSheet("model")}
                    onMouseDown={(e) => e.preventDefault()}
                    className="kfs-tap flex items-center flex-shrink-0"
                    style={{
                      gridArea: "model",
                      justifySelf: "start",
                      gap: 3,
                      padding: "8px 10px 8px 13px",
                      borderRadius: 999,
                      fontSize: 13,
                      color: T.ink,
                      backgroundColor: fill(0.42),
                      border: HAIRLINE,
                    }}
                  >
                    {modelLabel(activeModel)}
                    <Icon name="chevD" size={14} />
                  </button>
                )}
                {(!compact || dictating) && (
                  <span style={{ gridArea: "mic", display: "flex" }}>
                    <RoundBtn onClick={toggleDictation} label="听写" active={dictating}>
                      <Icon name="mic" size={19} />
                    </RoundBtn>
                  </span>
                )}
                <span style={{ gridArea: "key", display: "flex" }}>
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
                    <Icon name="up" color={T.onDai} size={19} sw={2.1} />
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
                    <Icon name="stop" color={T.onDai} size={19} sw={2} />
                  </button>
                ) : (
                  // 声波键：打电话（10 月 14 日起，原来是发一条语音，见开发说明“通话”那一节）。
                  // 刚从停键变过来的那一小会儿点它不算：她按停的那一下连着点了两下、
                  // 或者正要按停的时候他正好回完了，不该一下子打出去
                  <button
                    onClick={() => keySettled("stop") && startCall()}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="打电话"
                    className="kfs-tap flex-shrink-0 flex items-center justify-center"
                    style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    background: T.daiGrad,
                    boxShadow: "0 3px 8px rgba(var(--k-dai-shade),0.3)",
                  }}
                  >
                    <Icon name="wave" color={T.onDai} size={19} sw={2} />
                  </button>
                )}
                </span>
          </div>
          {/* 表情包面板：沉在按钮底下，照键盘那么高（见 input.css 的 .kfs-meme-panel），一行四张，上下翻；点一张直接发出去 */}
          {memePanel && (
            <div className="kfs-meme-panel overflow-y-auto kfs-scroll" style={{ margin: "8px -14px 0", borderTop: HAIRLINE }}>
              <div className="grid grid-cols-4" style={{ gap: 10, padding: "12px 14px max(12px, var(--kfs-sab))" }}>
                {allMemes.map((m) => (
                  <button
                    key={m.file}
                    onClick={() => sendMeme(m.file)}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label={m.name}
                    className="kfs-tap overflow-hidden"
                    style={{ aspectRatio: "1 / 1", borderRadius: 16, border: HAIRLINE, boxShadow: "0 3px 10px rgba(var(--k-shade),0.12)" }}
                  >
                    <img src={memeSrc(m.file)} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        )}
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
          jz={tyApi}
        />
      )}

      {boxOpen && (
        <CangyinPage
          entries={boxList}
          audio={boxAudio}
          toast={setToast}
          onBack={() => setBoxOpen(false)}
          onRemove={(id) => dropKept(id)}
          onFail={() => {
            setBoxOpen(false);
            setToast("藏音匣没打开，可能是网不好，过一会儿再试");
          }}
        />
      )}

      {historyOpen && (
        <HistoryPage
          index={index.filter((c) => !isFoxChat(c.id))}
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
          // 狐宇宙是他的屋子（她只来看看、在便签纸上留话）：不给编辑、重新回答
          room={isFoxChat(chatId)}
          heard={menu.row.role === "him" && menu.row.item.type === "voice" && heard.has(voiceKeyOf(menu.row.msg.id, menu.row.idx))}
          // 念不成、没人念的那种气泡上已经把字摆出来了：不给“转文字”
          hearable={!(menu.row.role === "him" && menu.row.item.type === "voice" && voiceAsText(menu.row))}
          // 藏音匣：念好了的才存得进去（声音要拷一份）；存过的写“移出藏音匣”
          kept={menu.row.role === "him" && menu.row.item.type === "voice" && !!findBySrc(boxList, voiceKeyOf(menu.row.msg.id, menu.row.idx))}
          keepable={menu.row.role === "him" && menu.row.item.type === "voice" && !!voices[voiceKeyOf(menu.row.msg.id, menu.row.idx)] && voices[voiceKeyOf(menu.row.msg.id, menu.row.idx)].s === "ready"}
          onKeep={keepVoice}
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

      {/* 并蒂莲：盖在最上面（比照片、提示那几层还高），叉一点就整层拆掉，回到侧栏 */}
      {lotusOpen && <LotusPage theme={theme} onClose={() => setLotusOpen(false)} />}
      {qxOpen && <QxPage pool={qxPool} onPool={saveQx} sendLot={sendLot} canSend={!isFoxChat(chatId)} onClose={closeQx} />}

      {/* 通话页：盖在最上面（见 call/CallPage.jsx）。她点屏幕那一下（iPhone 不让自己接着听的时候）接着听 */}
      {call && <CallPage call={call} avatar={avatars.him} name={names.him || HIS_NAME} onMute={toggleMute} onHangUp={hangUp} onTap={callTap} />}
      {echo && <EchoProbe echo={echo} levelOf={echoLevel} onClose={closeEcho} onAgain={againEcho} />}
      {ring && <IncomingCall avatar={avatars.him} name={names.him || HIS_NAME} onAnswer={answerRing} onDecline={declineRing} />}

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
            <p style={{ fontSize: 12.5, color: T.red, lineHeight: 1.6, marginBottom: 10 }}>
              没写完：回复长度到上限了。在 API 面板把“回复最长多少”调成“长”，再长按这张文档卡片，点重新回答。
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
              style={{ ...chip, color: T.red }}
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
