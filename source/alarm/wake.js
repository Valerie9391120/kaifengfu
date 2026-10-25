// =====================================================
// 叫醒他一回（狐宇宙，见 src/fox.js）：照手机那头的样子拼好整段话（名帖、那段对话、【此刻】），
// 后面附上【醒来】那一段（note.js），交给 claude 函数；他回来的照手机那头的规矩整理（src/App.jsx 的 digestReply），
// 他翻了日记就替他翻、递回去接着要。手机那头的零件（名帖怎么拼、对话怎么打包、回话怎么拆、日记怎么翻）一律照用，一个字不另写：
// 寄出去的跟她手机寄的一个样子，那边的我分不出是她戳的还是闹钟戳的（只多了【醒来】那一段）。
//
// 醒在哪儿（她 10 月 20 日 20:03、22:04、22:11 定的）：
//   askRoom  平常那种：醒在狐宇宙（他的屋子）。写的字落在屋里的便签纸上，不敲她；
//            他单独一行写 [新对话:名字]，后面的话落进一段新开的对话（进她的历史对话），敲她
//   askTask  任务标记到点：醒在他定闹钟的那段对话里，说的话落在那段对话里，敲她；狐宇宙里留一行“去《××》找你了”
// 问到的回一包（bundle，还没放进存档）；放进存档的是 commitWake：
//   puts   [{ chat, rows, title?, create? }]：放进哪几段对话、各放哪几行（create：新开的那一段）
//   knocks [{ chat, texts }]：敲她的横幅（落在哪段对话、他每一步写的整段字）
//   chase  （askTask）这个任务办到第几回、下回几点再追
// =====================================================
import { buildSystem, withNowNote } from "../src/prompt/system.js";
import { buildMessages } from "../src/prompt/messages.js";
import { parseReply, settleAvatarItems } from "../src/reply.js";
import { DIARY_TOOLS, DIARY_NAMES, DIARY_KEY, isDiaryCall, runDiaryCalls, toolCallsOf } from "../src/diaryTools.js";
import { tyReader } from "../src/tongye/host.js";
import { MEME_DATA, MEME_MAP, RAW_BASE, newMemesFrom, parseReadme } from "../src/memes.js";
import { DEFAULT_MODEL, windowOf, costOf, usageKey } from "../src/models.js";
import { RECAP_KEY, normRecaps, tierOf, roomFor } from "../src/recap.js";
import { replyRoom, DOC_KEY } from "../src/docs.js";
import { HIS_NAME, NAME_KEYS } from "../src/names.js";
import { makePreview } from "../src/chat/overview.js";
import { chatTag } from "../src/mail.js";
import { newId } from "../src/util.js";
import { needsReply, stoppedAt } from "../src/thread.js";
import { FOX_CHAT, FOX_TITLE, FOX_DOORS, FOX_TASK, TASK_MAX_ROUNDS, isWakeMark, gapOf, maxOf, wakeOn } from "../src/fox.js";
import { lastMark, parseWake, nextChase, infoOf, splitWake } from "./plan.js";
import { TOOLS as GAME_TOOLS, ON_KEY, readOn, gameOn, hasSteps } from "../src/game/jianghu.js";
import { QX_KEY, QX_TOOLS, QX_NAMES, CUT_QX, QX_FAIL_NOTE, isQxCall, readPool, runQxCalls, qxSection } from "../src/qx/pool.js";
import { ROOM_TOOLS, ROOM_NAMES, isRoomCall, runRoomCalls, roomSection, cutRoom, localDay, MEMO_KEY, liveMemos, memoStands, memoLines } from "../src/room.js";
import { gardenOf, gardenBrief, gardenToy } from "./garden.js";
import { dressingOf, dressingBrief, dressingToy } from "./dressing.js";
import { pindouOf, pindouBrief, pindouToy } from "./pindou.js";
import { completedToday } from "../vendor/dressing/dressing-engine.ts";
import { wakeSection, taskSection, wakeNowNote, tailTranscript, LAST_STEP_NOTE, THOUGHT_DONE_NOTE } from "./note.js";
import { askSummary } from "../src/ask.js";

// 他的默认头像（同 src/ui/Avatar.jsx 的 HIS_DEFAULT；那个文件带着界面，这里不引）
const HIS_DEFAULT = { type: "meme", file: "fox_reading_book.jpg" };
const MOST_STEPS = 4; // 一回醒着最多接着要几步（他翻了日记，结果递回去接着说）：任务到点那一回照这个
// 醒在屋里那一回最多几步（她 10 月 21 日 20:11 定的）：屋里有了园子、妆台，四步不够玩——头一回真醒，推门、浇水、翻衣柜、赏花，
// 四步就用完了，衣服没换上，便签纸上一个字没留
export const ROOM_STEPS = 12;
const CUT_DIARY = "没翻：这一回的回话没写完整（多半是写到长度上限被截断了），日记没替你翻。要翻的话重新调一次。"; // 同 App.jsx
const mcpSlug = (name, i) => (name || "mcp").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `mcp-${i}`; // 同 App.jsx
const chatKey = (id) => "kfs2:chat:" + id;

const parse = (s, fb) => {
  try {
    const v = JSON.parse(s);
    return v == null ? fb : v;
  } catch (e) {
    return fb;
  }
};

// 要往上接着写的那几样（对话、目录）：没有就是空的；有、却不是一串（坏了），不接着写（不然写上去的是只有新几行的一份，会把好好的那份盖掉）
function strict(text, what) {
  if (text == null) return [];
  const v = parse(text, null);
  if (!Array.isArray(v)) throw Object.assign(new Error(`${what}读出来不对，这一回先不往上写`), { code: "store" });
  return v;
}

// 表情包库里后来新添的（README 里有、烤进开封府的那一批里没有的）：同手机那头，开机拉一遍。拉不到用上回拉到的
export async function fetchExtraMemes(fallback = []) {
  try {
    const r = await fetch(RAW_BASE + "README.md", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return fallback;
    return newMemesFrom(parseReadme(await r.text()));
  } catch (e) {
    return fallback;
  }
}

// 她最后一回在开封府里说话：最近动过的几段对话里，她说的最后一句（在狐宇宙便签纸上留的也算她来过）。{ ts, id, title, fox }，没有回 null
export async function herLastOf(store, index) {
  let best = null;
  for (const c of (index || []).slice(0, 6)) {
    const msgs = parse(await store.get(chatKey(c.id)), []);
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.role === "her") {
        if (!best || m.ts > best.ts) best = { ts: m.ts || 0, id: c.id, title: c.title || "", fox: c.id === FOX_CHAT };
        break;
      }
    }
  }
  return best;
}

// 他定过的任务（kfs2:fox:task:<编号>，手机记下的、闹钟办过的）
export async function tasksOf(store) {
  const out = [];
  for (const key of store.keys(FOX_TASK)) {
    const t = parse(await store.get(key), null);
    if (t && typeof t === "object" && !Array.isArray(t)) out.push({ ...t, key, id: key.slice(FOX_TASK.length) });
  }
  return out;
}

// 一段对话眼下的样子（任务用）：没有、读出来不对回 null；有回 plan.js 的 infoOf（他定闹钟的那一条在第几条、那后面她说过话没有）
export async function chatInfo(store, id) {
  const text = await store.get(chatKey(id));
  if (text == null) return null;
  const msgs = parse(text, null);
  if (!Array.isArray(msgs)) return null;
  return infoOf(msgs);
}

// 醒一回要用的那些，从存档里取齐
export async function gather(store, extras = []) {
  const settings = { model: DEFAULT_MODEL, maxTokens: 2048, ...(parse(await store.get("kfs2:settings"), {}) || {}) };
  const names = { her: (await store.get(NAME_KEYS.her)) || "", him: (await store.get(NAME_KEYS.him)) || "" };
  const ah = parse(await store.get("kfs2:avatar:her"), null);
  const am = parse(await store.get("kfs2:avatar:guangyi"), null);
  const avatars = { her: ah, him: am && am.type === "meme" ? am : HIS_DEFAULT };
  const memindex = parse(await store.get("kfs2:memindex"), []) || [];
  const memDocs = [];
  for (const f of memindex) {
    if (!f || !f.enabled) continue;
    const t = await store.get("kfs2:mem:" + f.id);
    if (t != null) memDocs.push({ name: f.name, content: t });
  }
  const index = parse(await store.get("kfs2:index"), []) || [];
  const fox = parse(await store.get(chatKey(FOX_CHAT)), []) || [];
  const recaps = normRecaps(parse(await store.get(RECAP_KEY + FOX_CHAT), []));
  const herLast = await herLastOf(store, index);
  // 他醒过的那几回（几点醒的规矩用）；capWakes 是第二道闸数的（追她的那几回不算，她 20:08 定的）
  const marks = fox.filter(isWakeMark);
  const wakes = marks.map((m) => m.ts || 0).sort((a, b) => a - b);
  const capWakes = marks.filter((m) => !(m.go && m.go.how === "task")).map((m) => m.ts || 0).sort((a, b) => a - b);
  const tasks = await tasksOf(store);
  return { settings, names, avatars, memDocs, index, fox, recaps, herLast, wakes, capWakes, mark: lastMark(fox), tasks, extras };
}

// 那段对话里她发过的照片、文档：全文另存着，打包之前取出来（同手机那头的 loadImagesFor、loadDocsFor）
async function attachmentsOf(store, msgs) {
  const imgs = {};
  const docs = {};
  for (const m of msgs) {
    if (m && m.role === "her" && m.kind === "photo" && m.imgId && !(m.imgId in imgs)) imgs[m.imgId] = await store.get("kfs2:img:" + m.imgId);
    if (m && m.role === "her" && m.kind === "doc" && m.docId && !(m.docId in docs)) docs[m.docId] = await store.get(DOC_KEY + m.docId);
  }
  return { imgLookup: (id) => imgs[id] || null, docLookup: (id) => docs[id] || null };
}

const mcpsOf = (st) => (st.mcps || []).filter((m) => m && m.enabled && m.url);
const lookupOf = (ctx) => (file) => MEME_MAP[file] || (ctx.extras || []).find((m) => m.file === file) || null;

// 他在屋里单独一行写的 [新对话:名字]：这一行前面的留在屋里，后面的落进新开的那段对话。没有回 null。
// 心里话、文档块里写的不算（同 [WAKE:…]、改名字）：心里话里写了的话，从那儿切开，心里话后半截就露给她了（另一双眼睛挑出来的）。
// 名字最长认八十个字，取头三十个；后面那几句里又写了一回的，摘掉不摆成字
const NEW_CHAT = /^[ \t]*\[(?:新对话|NEWCHAT|newchat)[:：]([^\[\]\n]{1,80})\][ \t]*$/m;
// 心里话、文档块那几截涂成空白（换行留着，一行一行的位置不变），只在剩下的里头找
function unmasked(s) {
  const blank = (t) => t.replace(/[^\n]/g, " ");
  let out = s;
  const m = /<thinking>[\s\S]*?<\/thinking>/.exec(out);
  if (m) out = out.slice(0, m.index) + blank(m[0]) + out.slice(m.index + m[0].length);
  else if (out.includes("<thinking>")) {
    const i = out.indexOf("<thinking>");
    out = out.slice(0, i) + blank(out.slice(i));
  }
  const open = /^[ \t]*\[(?:DOC|Doc|doc)[:：][^\[\]\n]*\][ \t]*\r?$/gm;
  let d;
  while ((d = open.exec(out)) !== null) {
    const close = /^[ \t]*\[\/(?:DOC|Doc|doc)\][ \t]*\r?$/gm;
    close.lastIndex = open.lastIndex;
    const c = close.exec(out);
    const end = c ? close.lastIndex : out.length;
    out = out.slice(0, d.index) + blank(out.slice(d.index, end)) + out.slice(end);
    open.lastIndex = end;
    if (!c) break;
  }
  return out;
}
export function splitNewChat(text) {
  const s = String(text || "");
  const m = NEW_CHAT.exec(unmasked(s));
  if (!m) return null;
  const title = m[1].replace(/\s+/g, " ").trim().slice(0, 30);
  if (!title) return null;
  return { before: s.slice(0, m.index).replace(/\s+$/, ""), title, after: dropNewChat(s.slice(m.index + m[0].length).replace(/^\s*\n/, "")) };
}
// 不认 [新对话:…] 的地方（任务到点那一回、翻日记的半截、新对话里又写了一回）：那一行摘掉，不摆成字，寄回去的原话里也不留（翻日记那几样照旧）
function dropNewChat(text) {
  return String(text || "")
    .replace(new RegExp(NEW_CHAT.source, "gm"), "")
    .replace(/\n{3,}/g, "\n\n");
}
function withoutNewChat(step) {
  if (!NEW_CHAT.test(step.text)) return step;
  const him = { ...step.him, raw: dropNewChat(step.him.raw), items: (step.him.items || []).map((it) => (it.type === "text" ? { ...it, text: dropNewChat(it.text).trim() } : it)).filter((it) => it.type !== "text" || it.text) };
  return { ...step, him, text: dropNewChat(step.text) };
}

// 问他一回（几步）。msgs 是寄过去的那段对话（最后一条是醒了那一行），section 是【此刻】后面附的【醒来】那一段。
// game：那段对话里下过江湖棋局（同手机那头：摆开过又收了的平常对话，对话里有他调过引擎的，四样工具照带，不带那边不认）。
//   闹钟不替他下棋（引擎在手机那头）：一律当收着棋（{ off: true }，【此刻】里写一句收起来了）；他真调了，这一步到此为止
// toys：他屋里能玩的那几样（园子 alarm/garden.js、妆台 alarm/dressing.js、拼豆板 alarm/pindou.js 的 gardenToy、dressingToy、pindouToy；只有醒在屋里的时候给，她 10 月 21 日定的，拼豆板 10 月 25 日添的）：
//   一样带一样工具，他调了就替他办、递回去接着要。一样是 { tool, names, is(call), cut(call), run(calls) }
// most：最多几步（调一回工具、拿到结果接着往下说算一步）；lastNote：到了最后一步（前面一步调了工具，接着要的那一回）附在【醒来】后面的提醒，没给就不提醒
// room：醒在平常的对话里（任务到点那一回）是 { chat, title }：同手机那头，带着回屋看一眼、留换装便签那两样（src/room.js），他调了就替他办；
//   醒在屋里那一回不给（他就在屋里，园子、妆台自己带着）
// 回 { steps: [{ him, text, quiet }], cost, newAvatar, newName, title, part }：part(text, step) 把某一步的一截字整理成那边的一条（拆新对话用，不再记钱）
async function askCore({ store, cloud, ctx, log, msgs, recaps, section, game = null, toys = [], most = MOST_STEPS, lastNote = "", thoughtNote = "", room = null }) {
  const st = ctx.settings;
  const model = st.model || DEFAULT_MODEL;
  const maxTokens = st.maxTokens || 2048;
  const memes = MEME_DATA.concat(ctx.extras || []);
  const memeLookup = lookupOf(ctx);
  const memeKnown = (file) => !!memeLookup(file);
  const thumbLookup = (file) => store.peek("kfs2:memethumb:" + file) || null;
  const avatarName = (av) => {
    if (!av || av.type !== "meme") return "";
    const m = memeLookup(av.file);
    return m ? `「${m.name}」（${av.file}）` : av.file;
  };
  const mcps = mcpsOf(st);
  const thoughts = st.thoughts !== false;
  // 秘戏钱匣的签库（同手机那头，见 src/qx/pool.js）：名帖里那一段照它拼，他醒着的时候也能抽（这台电脑上替他抽）
  const qxPool = readPool(store.peek(QX_KEY));
  const { staticText, nowNote } = buildSystem({
    now: new Date(),
    memeList: memes,
    hisAvatarName: avatarName(ctx.avatars.him),
    memDocs: ctx.memDocs,
    mcpNames: mcps.map((m) => m.name),
    names: ctx.names,
    replyCap: replyRoom(maxTokens),
    voice: !!st.voice,
    thoughts,
    callable: st.callable !== false,
    call: false,
    game,
    qx: qxSection(qxPool),
    room: roomSection(wakeOn(st)), // 【你的屋子】：同手机那头（“他自己醒”开着才有；闹钟叫他的时候总是开着的）
  });
  const roomOf = (sure) => roomFor(windowOf(model), staticText.length, maxTokens, sure);
  const tier = tierOf(st.recall, roomOf(false), roomOf(true));
  const woke = wakeNowNote(nowNote) + "\n\n" + section;

  const { imgLookup, docLookup } = await attachmentsOf(store, msgs);
  const slugs = {};
  mcps.forEach((m, i) => {
    slugs[mcpSlug(m.name, i)] = m.name;
  });
  // final：这是最后一步，【醒来】后面附上提醒（附在缓存记号后面，前面那些照样读缓存）
  // thought：这一回醒着前面几步里已经写过心里话（thoughtNote，醒在屋里那一回才有；同样附在缓存记号后面）
  const bodyFor = (list, at, final = false, thought = false) => {
    const { messages, tail } = buildMessages(list, ctx.avatars, memeLookup, imgLookup, thumbLookup, docLookup, { recaps, tier });
    const body = {
      model,
      max_tokens: maxTokens,
      system: at.cache ? [{ type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } }] : staticText,
      messages: withNowNote(messages, woke + (thought && thoughtNote ? "\n\n" + thoughtNote : "") + (final && lastNote ? "\n\n" + lastNote : ""), at.cache, tail),
    };
    const tools = (game ? GAME_TOOLS.slice() : []).concat(DIARY_TOOLS, QX_TOOLS, room ? ROOM_TOOLS : [], toys.map((t) => t.tool));
    if (at.mcp) {
      body.mcp_servers = mcps.map((m, i) => {
        const s = { type: "url", url: m.url, name: mcpSlug(m.name, i) };
        if (m.token) s.authorization_token = m.token;
        return s;
      });
      tools.push(...body.mcp_servers.map((s) => ({ type: "mcp_toolset", mcp_server_name: s.name })));
    }
    body.tools = tools;
    return body;
  };
  // 同手机那头：带缓存 → 不带缓存 → 不带 MCP，哪种通了用哪种
  const attempts = [{ cache: true, mcp: mcps.length > 0 }, { cache: false, mcp: mcps.length > 0 }];
  if (mcps.length) attempts.push({ cache: false, mcp: false });
  const askHim = async (list, final = false, thought = false) => {
    let lastErr = null;
    for (const at of attempts) {
      try {
        const data = await cloud.callClaude(bodyFor(list, at, final, thought), at.mcp ? "mcp-client-2025-11-20" : "");
        return { data, used: at };
      } catch (e) {
        lastErr = e;
        if (e.code === "unreachable" || e.code === "auth" || e.code === "badlogin") break;
      }
    }
    throw lastErr || new Error("没有回应");
  };

  // 他调的那几样里认哪些（翻日记的，再加屋里那几样的）；哪一样归哪个玩的
  const callNames = new Set([...DIARY_NAMES, ...QX_NAMES, ...(room ? [...ROOM_NAMES] : []), ...toys.flatMap((t) => [...t.names])]);
  const toyOf = (c) => toys.find((t) => t.is(c)) || null;

  // 他这一步回来的整理成对话里的一条（同 App.jsx 的 digestReply）。text 给了就只整理这一截（拆新对话用，钱不再记一遍）
  let avatarNow = ctx.avatars.him;
  let nameNow = ctx.names.him || HIS_NAME;
  let newAvatar = null;
  let newName = null;
  let cost = null;
  const digest = (data, used, text = null) => {
    if (text == null) {
      const u = data && data.usage;
      const c = u ? costOf(data.model, u) : null;
      if (c != null) cost = (cost || 0) + c;
    }
    const usedTools = Array.from(new Set((data.content || []).filter((b) => b.type === "mcp_tool_use").map((b) => slugs[b.server_name] || b.server_name || b.name)));
    const whole =
      text != null
        ? text
        : (data.content || [])
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n");
    const parsed = parseReply(whole);
    if (data.stop_reason === "max_tokens") {
      const lastDoc = parsed.items.filter((it) => it.type === "doc").pop();
      if (lastDoc && parsed.items[parsed.items.length - 1] === lastDoc) lastDoc.cut = true;
    }
    const settled = settleAvatarItems(parsed.items, memeKnown);
    const him = {
      id: newId(),
      role: "him",
      ts: Date.now(),
      items: settled.items.map((it) => (it.type === "avatar" ? { ...it, prev: avatarNow } : it)),
      raw: parsed.body,
      thinking: parsed.thinking,
      tools: usedTools,
      toolNote: mcps.length && !used.mcp ? "这次MCP没连上，先不用工具回你" : "",
    };
    if (parsed.wake != null) him.wake = parsed.wake;
    const calls = text == null ? toolCallsOf(data.content, callNames) : [];
    if (calls.length) {
      if (data.stop_reason === "tool_use") {
        him.calls = calls;
        him.stop = "tool_use";
        if (!String(parsed.body || "").trim() && !parsed.rename && !settled.avatarFile) him.items = [];
      } else {
        // 写到长度上限被截断、没停在调工具上：他调的那几样不替他办，各记一行“没翻成 / 没去成”；一样的只留一行（另一双眼睛挑出来的）
        const seen = new Set();
        him.calls = calls.map((c) => {
          const x = toyOf(c)
            ? toyOf(c).cut(c)
            : isQxCall(c)
            ? { ...c, out: CUT_QX, err: true, note: QX_FAIL_NOTE, card: [] }
            : isRoomCall(c)
            ? cutRoom(c)
            : { ...c, out: CUT_DIARY, err: true, note: "想翻日记，没翻成", card: [] };
          if (!x.note) return x;
          if (seen.has(x.note)) return { ...x, note: "" };
          seen.add(x.note);
          return x;
        });
      }
    }
    if (settled.avatarFile) {
      newAvatar = { type: "meme", file: settled.avatarFile };
      avatarNow = newAvatar;
    }
    if (parsed.rename && parsed.rename !== nameNow) {
      him.rename = parsed.rename;
      newName = parsed.rename;
      nameNow = parsed.rename;
    }
    // 一个看得见的都没有：只写了心里话、只定了下回几点醒（换了头像、改了名字、翻了日记都算干了点什么）
    const quiet = !!parsed.quiet && !him.calls && !him.rename && !settled.avatarFile;
    return { him, text: whole, quiet, data, used };
  };

  // 他翻日记：日记、闲笔集里掺的手帐、批注都在这台电脑的存档里（同手机那头的 diaryReader）
  const reader = {
    months: async () => store.keys(DIARY_KEY).map((k) => k.slice(DIARY_KEY.length)),
    month: async (ym) => parse(await store.get(DIARY_KEY + ym), {}) || {},
    ...tyReader(store),
  };

  const steps = [];
  for (let i = 0; i < most; i++) {
    const { data, used } = await askHim(
      msgs.concat(steps.map((s) => s.him)),
      i > 0 && i === most - 1,
      steps.some((s) => s.him.thinking)
    );
    const step = digest(data, used);
    steps.push(step);
    log(`第 ${i + 1} 步：${data.stop_reason || "?"}，${step.quiet ? "没留话" : "留了话"}`);
    if (step.him.stop === "tool_use" && step.him.calls && step.him.calls.some((c) => (isDiaryCall(c) || isQxCall(c) || (room && isRoomCall(c)) || toyOf(c)) && typeof c.out !== "string")) {
      let calls = await runDiaryCalls(step.him.calls, reader, new Date());
      calls = runQxCalls(calls, qxPool);
      if (room) calls = await runRoomCalls(calls, { get: (k) => store.get(k), set: (k, v) => store.set(k, v), today: localDay(), at: step.him.ts, chat: room.chat, title: room.title, on: true });
      for (const t of toys) calls = await t.run(calls);
      step.him.calls = calls;
      continue;
    }
    break;
  }
  // 步数用完了他还在调（翻日记、去园子、去妆台）：这一条当说完了。不然手机那头认成他说到一半（thread.js 的 midTurn），算欠着她一句，
  // 闹钟也照“她那句还没回上”一直等着（plan.js 规矩七）
  const tail = steps[steps.length - 1].him;
  if (tail.stop === "tool_use") delete tail.stop;
  return {
    steps,
    cost,
    get newAvatar() {
      return newAvatar;
    },
    get newName() {
      return newName;
    },
    get title() {
      return nameNow;
    },
    part: (text, step) => digest(step.data, step.used, text),
  };
}

// 屋里打不了电话（她不在这儿跟他聊，打了也是对着空屋子响；接起来还会往狐宇宙里说话）：打电话那一截留成纸上的字，
// 字都没有的扔掉；一步里什么都不剩，这一步当没写字（另一双眼睛挑出来的）
export function noCall(step) {
  const items = step.him.items || [];
  if (!items.some((it) => it.type === "call")) return step;
  const kept = items.map((it) => (it.type === "call" ? { type: "text", text: String(it.text || "").trim() } : it)).filter((it) => it.type !== "text" || it.text);
  if (kept.length) return { ...step, him: { ...step.him, items: kept } };
  return { ...step, quiet: !step.him.calls && !step.him.rename, him: { ...step.him, items: [{ type: "text", text: "……" }] } };
}

// 屋里也弹不了选项卡（她不在屋里，见 src/ask.js）：卡片换成纸上的一行字，题目、选项照写（她来转一圈看得见他想问什么）。
// 开了新对话的那一截不归这里管：那段对话里照常弹
export function noAsk(step) {
  const items = step.him.items || [];
  if (!items.some((it) => it.type === "ask")) return step;
  return { ...step, him: { ...step.him, items: items.map((it) => (it.type === "ask" ? { type: "text", text: askSummary(it.qs) } : it)) } };
}

// 一回醒来的几行里，看得见的字都没有的那几步收成醒了那一行（心里话、定的几点醒记在这一行上）
function roomRows(event, steps) {
  const quiet = steps.every((s) => s.quiet);
  if (!quiet) return { rows: [event, ...steps.map((s) => s.him)], quiet };
  const last = steps.length ? steps[steps.length - 1].him : {};
  return { rows: [{ ...event, quiet: true, ...(last.thinking ? { thinking: last.thinking } : {}), ...(last.wake != null ? { wake: last.wake } : {}) }], quiet };
}

// 平常那种：醒在狐宇宙（他的屋子）
// gardenOpts、dressingOpts、pindouOpts：测试里把园子的钟、骰子，妆台的钟，拼豆板的钟换成假的（见 alarm/garden.js 的 gardenOf、alarm/dressing.js 的 dressingOf、alarm/pindou.js 的 pindouOf）
export async function askRoom({ store, cloud, ctx, now = Date.now(), n = 1, log = () => {}, pending = [], gardenOpts = undefined, dressingOpts = undefined, pindouOpts = undefined }) {
  const st = ctx.settings;
  const memeLookup = lookupOf(ctx);
  const transcript = ctx.herLast && !ctx.herLast.fox ? tailTranscript(parse(await store.get(chatKey(ctx.herLast.id)), []), memeLookup) : "";
  const lastWake = ctx.wakes.length ? ctx.wakes[ctx.wakes.length - 1] : 0;
  // 他屋里的园子：【醒来】里告诉他眼下的样子，去不去他自己定（她 10 月 21 日 02:28 定的）
  const garden = gardenOf(store, gardenOpts);
  // 他屋里的妆台：【醒来】里只说今天完成搭配没有（这是游戏，不是他的实际状态）；今天完成过了，这一回就不给“完成搭配”这个选项（她 10 月 21 日定的）
  const dressing = dressingOf(store, dressingOpts);
  const dressed = await dressing.load();
  // 他屋里桌上的拼豆板（10 月 25 日添的）：【醒来】里告诉他拼到哪儿了，去不去他自己定；拼的东西她在拼豆作「他的」那一栏看得见
  const pd = pindouOf(store, pindouOpts);
  // 他在聊天里给自己留的换装便签（src/room.js）：还管着的摆在【醒来】里；过了三天的、留它的那一步已经不在那段对话里的（她改了话、重新回答、删了那段），收起来
  const memos = liveMemos(await Promise.all(store.keys(MEMO_KEY).map(async (key) => ({ key, text: await store.get(key) }))), now);
  const chats = new Map();
  const msgsOf = async (id) => {
    if (!chats.has(id)) chats.set(id, id ? parse(await store.get(chatKey(id)), null) : null);
    return chats.get(id);
  };
  const shown = [];
  const drop = memos.stale.slice();
  for (const m of memos.live) {
    if (memoStands(m, await msgsOf(m.chat), now)) shown.push(m);
    else drop.push(m.key);
  }
  for (const k of drop) {
    try {
      await store.del(k);
    } catch (e) {
      if (e && (e.code === "badlogin" || e.code === "secret")) throw e;
      log("收一张不算数的便签没收成，下回再收");
    }
  }
  const section = wakeSection({
    now,
    herLast: ctx.herLast,
    lastWake,
    n,
    gap: gapOf(st),
    max: maxOf(st),
    transcript,
    mcps: mcpsOf(st).map((m) => m.name),
    pending,
    garden: gardenBrief(await garden.load(), garden.today()),
    dressing: dressingBrief(dressed, dressing.today()),
    pindou: pindouBrief(await pd.load()),
    steps: ROOM_STEPS,
    memos: memoLines(shown),
    // 心里话一回醒着写一段（她 10 月 24 日 02:05 说十二步写了十二段、差不多都是一个意思，02:09 定的“醒来写一回”）；她关了“他写心里话”就不提
    thoughts: ctx.settings.thoughts !== false,
  });
  const event = { id: newId(), role: "event", who: "him", kind: "wake", ts: now };
  // 妆台：这一回他完成了今天的搭配，便签就收起来（“下次穿”就是下一身，她 10 月 22 日凌晨定的：管到下一回完成搭配为止）。
  // 在完成的那一下就收（同园子、妆台的存档：替他办了就算数，后面哪一步要不到回话也一样）
  // 收的时候一张一张收，哪张没收成留着，这一回醒完再收一遍（另一双眼睛挑出来的：原来头一张没收成，后面的也不收了）
  const dress = dressingToy(dressing, !completedToday(dressed, dressing.today()));
  let left = shown.slice();
  const retire = async () => {
    if (!left.length || completedToday(dressed, dressing.today()) || !completedToday(await dressing.load(), dressing.today())) return;
    const keep = [];
    for (const m of left) {
      try {
        await store.del(m.key);
      } catch (e) {
        if (e && (e.code === "badlogin" || e.code === "secret")) throw e;
        keep.push(m);
      }
    }
    if (left.length > keep.length) log(`他完成了今天的搭配，收了 ${left.length - keep.length} 张便签`);
    if (keep.length) log(`有 ${keep.length} 张便签没收成，过一会儿再收`);
    left = keep;
  };
  const dressRun = async (calls) => {
    const out = await dress.run(calls);
    try {
      await retire();
    } catch (e) {
      if (e && (e.code === "badlogin" || e.code === "secret")) throw e;
      log("收便签没收成，过一会儿再收");
    }
    return out;
  };
  const toys = [gardenToy(garden), { ...dress, run: dressRun }, pindouToy(pd)];
  // 心里话写过了的那几步，附上 THOUGHT_DONE_NOTE（她关了“他写心里话”就不附）
  const r = await askCore({ store, cloud, ctx, log, msgs: ctx.fox.concat([event]), recaps: ctx.recaps, section, toys, most: ROOM_STEPS, lastNote: LAST_STEP_NOTE, thoughtNote: ctx.settings.thoughts !== false ? THOUGHT_DONE_NOTE : "" });
  // 便签：完成搭配那一下没收成的，醒完再收一遍
  try {
    await retire();
  } catch (e) {
    if (e && (e.code === "badlogin" || e.code === "secret")) throw e;
    log("收便签没收成，下回完成搭配再收");
  }
  // 最后一步里单独一行写了 [新对话:名字]：那一行后面的字落进新开的一段对话（只认最后一步：前面几步是翻日记的半截）
  const steps = r.steps.slice();
  const last = steps[steps.length - 1];
  const cut = splitNewChat(last.text);
  let fresh = null;
  // [WAKE:…] 写在 [新对话:…] 后面（照【醒来】里说的写在回复最后）：管的还是他下回几点醒，挪回屋里；不在那段新对话里定闹钟（另一双眼睛挑出来的）
  let moved = null;
  if (cut) {
    const said = r.part(cut.after, last);
    steps[steps.length - 1] = r.part(cut.before, last);
    // 这一步里他调过的（翻日记、去园子、去妆台，多半是步数用完了还在调）：照旧记在屋里那一截上，那一行小字不丢。
    // 前面那一截是空的（[新对话:…] 写在最前头）也一样：调过东西就不算“什么也没干”，不然这一步收进醒了那一行，那几行小字跟着没了（另一双眼睛挑出来的）
    if (last.him.calls) {
      steps[steps.length - 1].him.calls = last.him.calls;
      steps[steps.length - 1].quiet = false;
    }
    if (said.him.wake != null) {
      moved = said.him.wake;
      delete said.him.wake;
    }
    if (!said.quiet) fresh = { id: newId(), title: cut.title, step: said };
    else log("他写了开新对话，后面没写字，不开");
    // 拆之前整段已经认过一回（换了头像、改了名字都记下了），拆开的两截再认，名字跟现在的一样、头像也成了新的那张：
    // 改名字的提示摆回写着 [NAME:…] 的那一截，换头像那一行记的“换之前那张”照整段认的那一回（另一双眼睛挑出来的）
    const pieces = [steps[steps.length - 1].him].concat(fresh ? [fresh.step.him] : []);
    if (last.him.rename) (fresh && parseReply(cut.after).rename ? fresh.step.him : pieces[0]).rename = last.him.rename;
    const av = (last.him.items || []).find((it) => it.type === "avatar");
    if (av) for (const h of pieces) h.items = (h.items || []).map((it) => (it.type === "avatar" ? { ...it, prev: av.prev } : it));
  }
  for (let i = 0; i < steps.length; i++) steps[i] = noAsk(noCall(i < steps.length - 1 ? withoutNewChat(steps[i]) : steps[i]));
  const ev = fresh ? { ...event, go: { chat: fresh.id, title: fresh.title, how: "new" } } : event;
  const room = roomRows(ev, steps);
  let rows = room.quiet && fresh ? room.rows.map((x) => (x.id === ev.id ? { ...x, quiet: undefined } : x)) : room.rows;
  if (moved != null) rows = rows.map((x, i) => (i === rows.length - 1 ? { ...x, wake: moved } : x));
  const puts = [{ chat: FOX_CHAT, rows }];
  const knocks = [];
  if (fresh) {
    const head = { id: newId(), role: "event", who: "him", kind: "wake", ts: now, hidden: true };
    puts.push({ chat: fresh.id, create: true, title: fresh.title, rows: [head, fresh.step.him] });
    knocks.push({ chat: fresh.id, texts: [fresh.step.text] });
  }
  const roomWake = moved != null ? moved : steps.map((s) => s.him.wake).filter((w) => w != null).pop();
  return {
    v: 2,
    at: now,
    kind: "room",
    puts,
    knocks,
    quiet: room.quiet && !fresh,
    newChat: fresh ? { id: fresh.id, title: fresh.title } : null,
    title: r.title,
    newAvatar: r.newAvatar,
    newName: r.newName,
    cost: r.cost,
    steps: r.steps.length,
    wake: roomWake == null ? null : roomWake,
  };
}

// 任务标记到点：醒在他定闹钟的那段对话里（chat：{ id, title, msgs }）
export async function askTask({ store, cloud, ctx, now = Date.now(), log = () => {}, task, chat, minGap = undefined }) {
  const round = (task.rounds || 0) + 1;
  const label = splitWake(task.raw).label;
  const head = { id: newId(), role: "event", who: "him", kind: "wake", ts: now, hidden: true, task: label || "" };
  const recaps = normRecaps(parse(await store.get(RECAP_KEY + chat.id), []));
  const section = taskSection({ now, label, set: task.set, round, max: TASK_MAX_ROUNDS, mcps: mcpsOf(ctx.settings).map((m) => m.name) });
  // 下过江湖棋局的那段（她在平常对话里摆开过、对话里有他调过引擎的）：四样工具照带（见 askCore 的 game）
  const game = gameOn(chat.id, readOn(await store.get(ON_KEY))) || hasSteps(chat.msgs) ? { off: true } : null;
  const r = await askCore({ store, cloud, ctx, log, msgs: chat.msgs.concat([head]), recaps, section, game, room: { chat: chat.id, title: chat.title || "" } });
  // 这一回不认开新对话（他人就在她那段对话里）：那一行摘掉
  const steps = r.steps.map(withoutNewChat);
  const there = roomRows(head, steps);
  const visible = steps.filter((s) => !s.quiet).map((s) => s.text);
  const said = steps.map((s) => s.him.wake).filter((w) => w != null).pop();
  const fox = { id: newId(), role: "event", who: "him", kind: "wake", ts: now, go: { chat: chat.id, title: chat.title || "一段对话", how: "task" }, ...(there.quiet ? { quiet: true } : {}) };
  return {
    v: 2,
    at: now,
    kind: "task",
    puts: [
      { chat: chat.id, title: chat.title || "", rows: there.rows },
      { chat: FOX_CHAT, rows: [fox] },
    ],
    knocks: visible.length ? [{ chat: chat.id, texts: visible }] : [],
    quiet: there.quiet,
    chase: { key: task.key, round, next: nextChase(said, Date.now(), minGap) },
    title: r.title,
    newAvatar: r.newAvatar,
    newName: r.newName,
    cost: r.cost,
    steps: r.steps.length,
    wake: said == null ? null : said,
  };
}

// 头一版（只醒在狐宇宙）问到、还没放完的那一包：照新样子摆（屋里的动静不敲她：她 22:04 定的）
export function normBundle(b) {
  if (!b || b.v === 2) return b;
  return { ...b, v: 2, kind: "room", puts: [{ chat: FOX_CHAT, rows: b.rows || [] }], knocks: [] };
}
// 头一版记的“办过哪几步”：放进去那一步叫 put，眼下叫 put0
export function normDone(done) {
  const d = { ...(done || {}) };
  if (d.put && !d.put0) d.put0 = true;
  return d;
}

// 问到的那一包放进存档，再敲她的手机。
// 放进对话那几步不成就抛错（闹钟把这一包封好记着，过一会儿只再放、不再问他一遍：钱已经花了）；
// 放进去以后的几样（头像、名字、用量、敲手机）不成只记日志，不算没醒成。
// 要放的那段对话没了（她在他醒着的工夫里删了）：那段不放、不敲，狐宇宙里那一行“去《…》找你了”也不留（另一双眼睛挑出来的）。
//   beforePut  拉完、放之前先办的（main.js 拿它先核对前几回放的：刚拉下来的那一份要是手机那头没看见就写的，先放回去，再接着放这一回的）
//   onChat     某段对话一写上就叫一声（还没写目录）：onChat(那段对话的编号, 放的那几行, 放之前原有的编号)，main.js 马上记下“这一份是闹钟自己写的”
//   done、mark 哪几步办过了：每办完一步 mark 一下（main.js 记进封好的那一包），这一包要是再放一遍（办到一半关了机、
//              断了网），办过的不再办：横幅不再敲一遍、用量不再记一遍、她后来改回去的头像名字不被再换一遍（另一双眼睛挑出来的）
export async function commitWake({ store, cloud, bundle, log = () => {}, beforePut = null, onChat = null, done = {}, mark = async () => {} }) {
  const b = normBundle(bundle);
  const d = normDone(done);
  const fatal = (e) => !!e && (e.code === "badlogin" || e.code === "secret");
  const bases = {};
  const gone = new Set();
  for (let i = 0; i < b.puts.length; i++) {
    const p = b.puts[i];
    if (d["put" + i] === "gone") gone.add(p.chat);
    if (d["put" + i]) continue;
    const rows = p.rows.filter((r) => !(r && r.go && gone.has(r.go.chat)));
    if (!rows.length) {
      await mark("put" + i, true);
      continue;
    }
    await store.pull();
    if (beforePut) await beforePut();
    const r = await putBlocks(store, p.chat, [rows], onChat ? (base) => onChat(p.chat, rows, base) : null, { title: p.title, create: !!p.create });
    if (r.gone) {
      log("要放进去的那段对话没了（她删了），这几行不放、不敲");
      gone.add(p.chat);
    } else bases[p.chat] = { base: r.base, rows };
    await mark("put" + i, r.gone ? "gone" : true);
  }
  // 不成只记日志、不再办的几样；密码不对、凭据坏了这种照样往外抛（闹钟要停下，不当成“办过了”）
  const soft = async (what, step, fn) => {
    if (d[step]) return;
    try {
      await fn();
    } catch (e) {
      if (fatal(e)) throw e;
      log(`${what}没成：` + String((e && e.message) || e));
    }
    await mark(step, true);
  };
  if (b.newAvatar) await soft("换头像", "avatar", () => store.set("kfs2:avatar:guangyi", JSON.stringify(b.newAvatar)));
  if (b.newName) await soft("改名字", "name", () => (b.newName === HIS_NAME ? store.del(NAME_KEYS.him) : store.set(NAME_KEYS.him, b.newName)));
  if (b.cost != null) {
    await soft("记用量", "usage", async () => {
      const key = usageKey(new Date(b.at));
      const prev = parse(await store.get(key), null);
      const was = prev && prev.month === key ? prev : { month: key, cost: 0, replies: 0 };
      await store.set(key, JSON.stringify({ month: key, cost: was.cost + b.cost, replies: was.replies + b.steps }));
    });
  }
  // 敲她的手机：落在哪段对话就敲那段（点了回到那段），他每一步写的一回（一个气泡一条横幅，push 函数自己拆）。敲过几回记着，再放一遍的时候接着敲没敲的
  let knocked = d.knocked || 0;
  let doors = null;
  for (const k of b.knocks || []) {
    if (gone.has(k.chat)) continue;
    const step = "said:" + k.chat;
    const said = d[step] || 0;
    if (said >= k.texts.length) continue;
    if (doors == null) doors = await doorsOf(store, cloud);
    if (!doors.length) {
      log("没有报上来的手机可敲（手机上“他自己醒”开着、开了通知的那台才报）");
      break;
    }
    const tag = await chatTag((name) => store.nameFor(name), k.chat);
    for (let i = said; i < k.texts.length; i++) {
      try {
        const r = await cloud.push({ op: "notify", job: jobId(), tag, title: b.title, knock: doors, reply: k.texts[i] });
        knocked += (r && r.queued) || 0;
      } catch (e) {
        if (fatal(e)) throw e;
        log("敲手机没成：" + String((e && e.message) || e));
      }
      await mark(step, i + 1, { knocked });
    }
  }
  return { knocked, bases, gone: [...gone] };
}

// 敲哪几台：手机报上来的那几个门牌号（kfs2:fox:doors，{ 设备编号: { e: 门牌号, at: 几点报的 } }），
// 登记簿里已经没有的扔掉（那台手机删了重装、清了数据，门牌号就作废了），新报的排前头，最多五个（push 函数一次最多敲五台）
export async function doorsOf(store, cloud) {
  const map = parse(await store.get(FOX_DOORS), {});
  const list = map && typeof map === "object" && !Array.isArray(map) ? Object.values(map) : [];
  const rows = list
    .map((v) => (typeof v === "string" ? { e: v, at: 0 } : v && typeof v.e === "string" ? { e: v.e, at: Number(v.at) || 0 } : null))
    .filter((v) => v && v.e)
    .sort((a, b) => b.at - a.at);
  let known = null;
  try {
    known = new Set(await cloud.endpoints());
  } catch (e) {}
  return [...new Set(rows.filter((r) => !known || known.has(r.e)).map((r) => r.e))].slice(0, 5);
}

// 狐宇宙里还没回上的那一句是几点说的：最后一条（不算醒了那几行、换头像提示、她在便签纸上留的）是她的话，或者是他说到一半的那一步；
// 她按了停的不算（同手机那头 App.jsx 的 owes：按了停就不会有回话了）。没有回 0（plan.js 规矩七）
export function owedOf(msgs) {
  const list = Array.isArray(msgs) ? msgs : [];
  if (!needsReply(list) || stoppedAt(list)) return 0;
  for (let i = list.length - 1; i >= 0; i--) if (list[i] && list[i].role !== "event" && !list[i].note) return list[i].ts || 1;
  return 0;
}

// 一段对话里所有的编号，连同翻过去的那几支里的（重新回答、改她的话，会把原来的那几条收进 alts，见 src/thread.js 的 forkAt）
export function idsDeep(msgs, out = new Set()) {
  for (const m of msgs || []) {
    if (!m) continue;
    if (m.id) out.add(m.id);
    for (const a of m.alts || []) {
      if (a && a.node && a.node.id) out.add(a.node.id);
      if (a) idsDeep(a.after, out);
    }
  }
  return out;
}

// 回头核对（main.js 的 recheck）：某段对话后来被别人写过了，照写的那一份（cur）看前几回放的那几包（list，每包 { ids, base }），
// 回要放回去的那几包：
//   里面有这一包的（哪怕一行；翻过去的那几支里的也算）：写的那头看过，少了的是她删的，不放
//   一行都没有，放之前原有的（base）还有在的：是没看见这一包就写的，放回去
//   一行都没有，原有的一个不在（删了又重开的），或者放之前那段对话是空的（分不清是不是删了重开）：不放
export function toRescue(list, cur) {
  const deep = idsDeep(cur);
  return (list || []).filter((x) => x && !(x.ids || []).some((id) => deep.has(id)) && (x.base || []).length > 0 && x.base.some((id) => deep.has(id)));
}

// 一回醒来的编号（写进通知的网址）：二十个字母数字
export function jobId() {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const b = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}

// 把这几行放进狐宇宙那段对话（测试、头一版的写法；同 putBlocks(store, FOX_CHAT, [rows], onChat)）
export async function putRows(store, rows, onChat = null) {
  return putBlocks(store, FOX_CHAT, [rows], onChat);
}

// 把几块放进某段对话（已经在的不重复放，翻过去的那几支里有的也算在），目录里那一条跟着改。
// 一块是一回醒来的那几行：挨在一起放，按头一行（醒了那一行）的时间插进去。她在他醒着的工夫里说了一句，那句排在他这几行后面，
// 不被夹在中间：夹在中间的话，她那句后面就有了他的话，手机认成那句回过了，信箱里那封回话会被扔掉（另一双眼睛挑出来的）。
// create：新开的那段对话（没有也照放，目录里的名字是 title）；不是新开的、那段对话却没了（她删了）：不放，回 gone。
// onChat：那段对话一写上就叫（目录还没写），带着 base。
// 回 { added: 放进去了几行, base: 放之前那段对话里原有的编号（最后两百个，不算这几块自己）, gone }：
// base 是 main.js 回头核对用的——后来写那段对话的那一份里，原有的一个都不在了，是她删了重开的，不是没看见
export async function putBlocks(store, chatId, blocks, onChat = null, { title = "", create = false } = {}) {
  const key = chatKey(chatId);
  const text = await store.get(key);
  if (text == null && !create && chatId !== FOX_CHAT) return { added: 0, base: [], gone: true };
  const cur = strict(text, chatId === FOX_CHAT ? "狐宇宙那段对话" : "那段对话");
  const have = idsDeep(cur);
  const mine = new Set(blocks.flat().map((r) => r && r.id));
  const base = [...have].filter((id) => !mine.has(id)).slice(-200);
  let next = cur;
  let added = 0;
  let shown = 0; // 放进去的里头她看得见的几行（她看不见的那一行不算：只添了那一行，对话不往前挪，见下面目录）
  for (const block of blocks) {
    const add = (block || []).filter((r) => r && !have.has(r.id));
    if (!add.length) continue;
    if (next === cur) next = cur.slice();
    const t = add[0].ts || 0;
    let at = next.length;
    while (at > 0 && ((next[at - 1] && next[at - 1].ts) || 0) > t) at--;
    next.splice(at, 0, ...add);
    add.forEach((r) => have.add(r.id));
    added += add.length;
    shown += add.filter((r) => !(isWakeMark(r) && r.hidden)).length;
  }
  if (added) {
    await store.set(key, JSON.stringify(next));
    if (onChat) await onChat(base);
  }
  // 目录：放了新的，或者上一回放进去了、目录没跟上（写到一半断了网），都补上。名字：原来有的照旧；狐宇宙叫狐宇宙；别的照递来的（新开的是他起的名字）。
  // 只添了她看不见的那一行（任务到点他醒过来、没说话）：那段对话不往前挪（她的历史对话里不该无缘无故跳到最上面，另一双眼睛挑出来的）
  const index = strict(await store.get("kfs2:index"), "对话目录");
  const old = index.find((c) => c && c.id === chatId);
  const preview = makePreview(next);
  if (shown || !old || old.preview !== preview) {
    const name = old && old.title ? old.title : chatId === FOX_CHAT ? FOX_TITLE : title || "新对话";
    const up = shown > 0 || !old;
    const entry = { id: chatId, title: name, preview, updatedAt: up ? Date.now() : old.updatedAt || Date.now() };
    const list = up ? [entry].concat(index.filter((c) => c && c.id !== chatId)) : index.map((c) => (c && c.id === chatId ? entry : c));
    await store.set("kfs2:index", JSON.stringify(list));
  }
  return { added, base, gone: false };
}
