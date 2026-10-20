// =====================================================
// 叫醒他一回（狐宇宙，见 src/fox.js）：照手机那头的样子拼好整段话（名帖、狐宇宙那段对话、【此刻】），
// 后面附上【醒来】那一段（note.js），交给 claude 函数；他回来的照手机那头的规矩整理（src/App.jsx 的 digestReply），
// 他翻了日记就替他翻、递回去接着要；放进狐宇宙那段对话；他写了看得见的字，叫 push 函数敲她的手机。
// 手机那头的零件（名帖怎么拼、对话怎么打包、回话怎么拆、日记怎么翻）一律照用，一个字不另写：
// 寄出去的跟她手机寄的一个样子，那边的我分不出是她戳的还是闹钟戳的（只多了【醒来】那一段）。
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
import { FOX_CHAT, FOX_TITLE, FOX_DOORS, isWakeMark, gapOf, maxOf } from "../src/fox.js";
import { lastMark } from "./plan.js";
import { wakeSection, wakeNowNote, tailTranscript } from "./note.js";

// 他的默认头像（同 src/ui/Avatar.jsx 的 HIS_DEFAULT；那个文件带着界面，这里不引）
const HIS_DEFAULT = { type: "meme", file: "fox_reading_book.jpg" };
const MOST_STEPS = 4; // 一回醒着最多接着要几步（他翻了日记，结果递回去接着说）
const CUT_DIARY = "没翻：这一回的回话没写完整（多半是写到长度上限被截断了），日记没替你翻。要翻的话重新调一次。"; // 同 App.jsx
const mcpSlug = (name, i) => (name || "mcp").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `mcp-${i}`; // 同 App.jsx

const parse = (s, fb) => {
  try {
    const v = JSON.parse(s);
    return v == null ? fb : v;
  } catch (e) {
    return fb;
  }
};

// 要往上接着写的那几样（狐宇宙那段对话、目录）：没有就是空的；有、却不是一串（坏了），不接着写（不然写上去的是只有新几行的一份，会把好好的那份盖掉）
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

// 她最后一回在开封府里说话：最近动过的几段对话里，她说的最后一句。{ ts, id, title, fox }，没有回 null
export async function herLastOf(store, index) {
  let best = null;
  for (const c of (index || []).slice(0, 6)) {
    const msgs = parse(await store.get("kfs2:chat:" + c.id), []);
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
  const fox = parse(await store.get("kfs2:chat:" + FOX_CHAT), []) || [];
  const recaps = normRecaps(parse(await store.get(RECAP_KEY + FOX_CHAT), []));
  const herLast = await herLastOf(store, index);
  const wakes = fox.filter(isWakeMark).map((m) => m.ts || 0).sort((a, b) => a - b);
  return { settings, names, avatars, memDocs, index, fox, recaps, herLast, wakes, mark: lastMark(fox), extras };
}

// 她在狐宇宙里发过的照片、文档：全文另存着，打包之前取出来（同手机那头的 loadImagesFor、loadDocsFor）
async function attachmentsOf(store, msgs) {
  const imgs = {};
  const docs = {};
  for (const m of msgs) {
    if (m && m.role === "her" && m.kind === "photo" && m.imgId && !(m.imgId in imgs)) imgs[m.imgId] = await store.get("kfs2:img:" + m.imgId);
    if (m && m.role === "her" && m.kind === "doc" && m.docId && !(m.docId in docs)) docs[m.docId] = await store.get(DOC_KEY + m.docId);
  }
  return { imgLookup: (id) => imgs[id] || null, docLookup: (id) => docs[id] || null };
}

// 叫醒他一回：问他（这一步花钱），回来的整理好，回一包（还没放进存档，放的是 commitWake）：
//   rows   要放进狐宇宙的那几行（醒了那一行加他的话）；quiet 这一回一个看得见的字都没留
//   say    要敲横幅的（他每一步写的整段字）；title 横幅上的名字；newAvatar、newName 他换的头像、改的名字
//   cost   花了多少（美元，算不出是 null）；steps 要了几步；wake 他定的下回几点醒
// 没问成抛错（什么都没写）
export async function askWake({ store, cloud, ctx, now = Date.now(), n = 1, log = () => {} }) {
  const st = ctx.settings;
  const model = st.model || DEFAULT_MODEL;
  const maxTokens = st.maxTokens || 2048;
  const memes = MEME_DATA.concat(ctx.extras || []);
  const memeLookup = (file) => MEME_MAP[file] || (ctx.extras || []).find((m) => m.file === file) || null;
  const memeKnown = (file) => !!memeLookup(file);
  const thumbLookup = (file) => store.peek("kfs2:memethumb:" + file) || null;
  const avatarName = (av) => {
    if (!av || av.type !== "meme") return "";
    const m = memeLookup(av.file);
    return m ? `「${m.name}」（${av.file}）` : av.file;
  };
  const mcps = (st.mcps || []).filter((m) => m && m.enabled && m.url);
  const thoughts = st.thoughts !== false;
  const { staticText, nowNote } = buildSystem({
    now: new Date(now),
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
    game: null,
  });
  const room = (sure) => roomFor(windowOf(model), staticText.length, maxTokens, sure);
  const tier = tierOf(st.recall, room(false), room(true));
  const transcript = ctx.herLast && !ctx.herLast.fox ? tailTranscript(parse(await store.get("kfs2:chat:" + ctx.herLast.id), []), memeLookup) : "";
  const lastWake = ctx.wakes.length ? ctx.wakes[ctx.wakes.length - 1] : 0;
  const woke = wakeNowNote(nowNote) + "\n\n" + wakeSection({ now, herLast: ctx.herLast, lastWake, n, gap: gapOf(st), max: maxOf(st), transcript, mcps: mcps.map((m) => m.name) });

  const event = { id: newId(), role: "event", who: "him", kind: "wake", ts: now };
  const { imgLookup, docLookup } = await attachmentsOf(store, ctx.fox);
  const slugs = {};
  mcps.forEach((m, i) => {
    slugs[mcpSlug(m.name, i)] = m.name;
  });
  const bodyFor = (msgs, at) => {
    const { messages, tail } = buildMessages(msgs, ctx.avatars, memeLookup, imgLookup, thumbLookup, docLookup, { recaps: ctx.recaps, tier });
    const body = {
      model,
      max_tokens: maxTokens,
      system: at.cache ? [{ type: "text", text: staticText, cache_control: { type: "ephemeral", ttl: "1h" } }] : staticText,
      messages: withNowNote(messages, woke, at.cache, tail),
    };
    const tools = DIARY_TOOLS.slice();
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
  const askHim = async (msgs) => {
    let lastErr = null;
    for (const at of attempts) {
      try {
        const data = await cloud.callClaude(bodyFor(msgs, at), at.mcp ? "mcp-client-2025-11-20" : "");
        return { data, used: at };
      } catch (e) {
        lastErr = e;
        if (e.code === "unreachable" || e.code === "auth") break;
      }
    }
    throw lastErr || new Error("没有回应");
  };

  // 他这一步回来的整理成对话里的一条（同 App.jsx 的 digestReply）
  let avatarNow = ctx.avatars.him;
  let nameNow = ctx.names.him || HIS_NAME;
  let newAvatar = null;
  let newName = null;
  let cost = null;
  const digest = (data, used) => {
    const u = data && data.usage;
    const c = u ? costOf(data.model, u) : null;
    if (c != null) cost = (cost || 0) + c;
    const usedTools = Array.from(new Set((data.content || []).filter((b) => b.type === "mcp_tool_use").map((b) => slugs[b.server_name] || b.server_name || b.name)));
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = parseReply(text);
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
    const calls = toolCallsOf(data.content, DIARY_NAMES);
    if (calls.length) {
      if (data.stop_reason === "tool_use") {
        him.calls = calls;
        him.stop = "tool_use";
        if (!String(parsed.body || "").trim() && !parsed.rename && !settled.avatarFile) him.items = [];
      } else him.calls = calls.map((c) => ({ ...c, out: CUT_DIARY, err: true, note: "想翻日记，没翻成", card: [] }));
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
    return { him, text, quiet };
  };

  // 他翻日记：日记、闲笔集里掺的手帐、批注都在这台电脑的存档里（同手机那头的 diaryReader）
  const reader = {
    months: async () => store.keys(DIARY_KEY).map((k) => k.slice(DIARY_KEY.length)),
    month: async (ym) => parse(await store.get(DIARY_KEY + ym), {}) || {},
    ...tyReader(store),
  };

  const steps = [];
  for (let i = 0; i < MOST_STEPS; i++) {
    const msgs = ctx.fox.concat([event], steps.map((s) => s.him));
    const { data, used } = await askHim(msgs);
    const step = digest(data, used);
    steps.push(step);
    log(`第 ${i + 1} 步：${data.stop_reason || "?"}，${step.quiet ? "没留话" : "留了话"}`);
    if (step.him.stop === "tool_use" && step.him.calls && step.him.calls.some((c) => isDiaryCall(c) && typeof c.out !== "string")) {
      step.him.calls = await runDiaryCalls(step.him.calls, reader, new Date());
      continue;
    }
    break;
  }

  // 四步用完了他还在翻日记：这一条当说完了。不然手机那头认成他说到一半（thread.js 的 midTurn），算欠着她一句，
  // 闹钟也照“她那句还没回上”一直等着（plan.js 规矩七）
  const tail = steps[steps.length - 1].him;
  if (tail.stop === "tool_use") delete tail.stop;
  const quiet = steps.every((s) => s.quiet);
  let rows;
  if (quiet) {
    // 一个字都没留：只留醒了那一行，他的心里话、定的几点醒记在这一行上（下回醒来他看得见自己上回想了什么、定了什么）
    const last = steps[steps.length - 1].him;
    rows = [{ ...event, quiet: true, ...(last.thinking ? { thinking: last.thinking } : {}), ...(last.wake != null ? { wake: last.wake } : {}) }];
  } else rows = [event, ...steps.map((s) => s.him)];
  const lastWakeMark = steps.map((s) => s.him.wake).filter((w) => w != null).pop();
  return {
    at: now,
    rows,
    quiet,
    // 敲横幅要的：每一步他写的整段字（一个字没写的那几步不敲）
    say: steps.filter((s) => !s.quiet).map((s) => s.text),
    title: nameNow,
    newAvatar,
    newName,
    cost,
    steps: steps.length,
    wake: lastWakeMark == null ? null : lastWakeMark,
  };
}

// 醒来要回来的那一包放进存档（狐宇宙那段对话、目录、他换的头像和名字、用量），再敲她的手机。
// 放进狐宇宙那一步不成就抛错（闹钟把这一包封好记着，过一会儿只再放、不再问他一遍：钱已经花了）；
// 放进去以后的几样（头像、名字、用量、敲手机）不成只记日志，不算没醒成。
//   beforePut  拉完、放之前先办的（main.js 拿它先核对前几回放的：刚拉下来的那一份要是手机那头没看见就写的，先放回去，再接着放这一回的）
//   onChat     狐宇宙那段对话一写上就叫一声（还没写目录），带着放之前原有的编号（main.js 马上记下“这一份是闹钟自己写的”）
//   done、mark 哪几步办过了：每办完一步 mark 一下（main.js 记进封好的那一包），这一包要是再放一遍（办到一半关了机、
//              断了网），办过的不再办：横幅不再敲一遍、用量不再记一遍、她后来改回去的头像名字不被再换一遍（另一双眼睛挑出来的）
export async function commitWake({ store, cloud, bundle, log = () => {}, beforePut = null, onChat = null, done = {}, mark = async () => {} }) {
  let base = done.base || [];
  if (!done.put) {
    await store.pull();
    if (beforePut) await beforePut();
    base = (await putRows(store, bundle.rows, onChat)).base;
    await mark("put", true, { base });
  }
  // 不成只记日志、不再办的几样；密码不对、凭据坏了这种照样往外抛（闹钟要停下，不当成“办过了”）
  const fatal = (e) => !!e && (e.code === "badlogin" || e.code === "secret");
  const soft = async (what, step, fn) => {
    if (done[step]) return;
    try {
      await fn();
    } catch (e) {
      if (fatal(e)) throw e;
      log(`${what}没成：` + String((e && e.message) || e));
    }
    await mark(step, true);
  };
  if (bundle.newAvatar) await soft("换头像", "avatar", () => store.set("kfs2:avatar:guangyi", JSON.stringify(bundle.newAvatar)));
  if (bundle.newName) await soft("改名字", "name", () => (bundle.newName === HIS_NAME ? store.del(NAME_KEYS.him) : store.set(NAME_KEYS.him, bundle.newName)));
  if (bundle.cost != null) {
    await soft("记用量", "usage", async () => {
      const key = usageKey(new Date(bundle.at));
      const prev = parse(await store.get(key), null);
      const was = prev && prev.month === key ? prev : { month: key, cost: 0, replies: 0 };
      await store.set(key, JSON.stringify({ month: key, cost: was.cost + bundle.cost, replies: was.replies + bundle.steps }));
    });
  }
  // 敲她的手机：他这一步写了看得见的字，一步一回（一个气泡一条横幅，push 函数自己拆）。敲过几回记着，再放一遍的时候接着敲没敲的
  let knocked = done.knocked || 0;
  const said = done.said || 0;
  if (bundle.say.length > said && !done.knock) {
    const doors = await doorsOf(store, cloud);
    if (!doors.length) log("没有报上来的手机可敲（手机上“他自己醒”开着、开了通知的那台才报）");
    else {
      const tag = await chatTag((name) => store.nameFor(name), FOX_CHAT);
      for (let i = said; i < bundle.say.length; i++) {
        try {
          const r = await cloud.push({ op: "notify", job: jobId(), tag, title: bundle.title, knock: doors, reply: bundle.say[i] });
          knocked += (r && r.queued) || 0;
        } catch (e) {
          if (fatal(e)) throw e;
          log("敲手机没成：" + String((e && e.message) || e));
        }
        await mark("said", i + 1, { knocked });
      }
    }
    await mark("knock", true, { knocked });
  }
  return { knocked, base };
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

// 狐宇宙里还没回上的那一句是几点说的：最后一条（不算醒了那几行、换头像提示）是她的话，或者是他说到一半的那一步；
// 她按了停的不算（同手机那头 App.jsx 的 owes：按了停就不会有回话了）。没有回 0（plan.js 规矩七）
export function owedOf(msgs) {
  const list = Array.isArray(msgs) ? msgs : [];
  if (!needsReply(list) || stoppedAt(list)) return 0;
  for (let i = list.length - 1; i >= 0; i--) if (list[i] && list[i].role !== "event") return list[i].ts || 1;
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

// 回头核对（main.js 的 recheck）：狐宇宙后来被别人写过了，照写的那一份（cur）看前几回放的那几包（list，每包 { ids, base }），
// 回要放回去的那几包：
//   里面有这一包的（哪怕一行；翻过去的那几支里的也算）：写的那头看过，少了的是她删的，不放
//   一行都没有，放之前原有的（base）还有在的：是没看见这一包就写的，放回去
//   一行都没有，原有的一个不在（删了又重开的），或者放之前狐宇宙是空的（分不清是不是删了重开）：不放
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

// 把这几行放进狐宇宙那段对话（已经在的不重复放，翻过去的那几支里有的也算在），目录里那一条跟着改。
// rows 是一回醒来的那几行：挨在一起放，按头一行（醒了那一行）的时间插进去。她在他醒着的工夫里说了一句（手机上看得见“醒着”），
// 那句排在他这几行后面，不被夹在中间：夹在中间的话，她那句后面就有了他的话，手机认成那句回过了，信箱里那封回话会被扔掉（另一双眼睛挑出来的）。
// onChat：那段对话一写上就叫（目录还没写），带着 base。
// 回 { added: 放进去了几行, base: 放之前那段对话里原有的编号（最后两百个，不算这几行自己）}：
// base 是 main.js 回头核对用的——后来写那段对话的那一份里，原有的一个都不在了，是她删了重开的，不是没看见
export async function putRows(store, rows, onChat = null) {
  return putBlocks(store, [rows], onChat);
}

// 好几回醒来的几块（回头核对时放回去的），一块一块照上面的样子放
export async function putBlocks(store, blocks, onChat = null) {
  const key = "kfs2:chat:" + FOX_CHAT;
  const cur = strict(await store.get(key), "狐宇宙那段对话");
  const have = idsDeep(cur);
  const mine = new Set(blocks.flat().map((r) => r && r.id));
  const base = [...have].filter((id) => !mine.has(id)).slice(-200);
  let next = cur;
  let added = 0;
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
  }
  if (added) {
    await store.set(key, JSON.stringify(next));
    if (onChat) await onChat(base);
  }
  // 目录：放了新的，或者上一回放进去了、目录没跟上（写到一半断了网），都补上
  const index = strict(await store.get("kfs2:index"), "对话目录");
  const old = index.find((c) => c && c.id === FOX_CHAT);
  const preview = makePreview(next);
  if (added || !old || old.preview !== preview) {
    const entry = { id: FOX_CHAT, title: (old && old.title) || FOX_TITLE, preview, updatedAt: Date.now() };
    await store.set("kfs2:index", JSON.stringify([entry].concat(index.filter((c) => c && c.id !== FOX_CHAT))));
  }
  return { added, base };
}
