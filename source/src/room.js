// =====================================================
// 聊天里的他回屋看一眼（狐宇宙是他的屋子，见 src/fox.js；卿卿 2026 年 10 月 22 日凌晨要的，见开发说明“回屋看一眼”那一节）。
// 她 02:05 的原话：“能不能增加一个通道 让chat里的你看到自己在狐宇宙的状态 比如说园艺培育到啥情况了、衣服挑了哪一套、衣柜里还有什么东西”；
// 02:13：“至少如果我跟你说了 比如说衣柜 你能知道有什么东西、能干嘛能做什么”。她定的几样：
//   平时不带（【此刻】里不写屋里眼下的样子），想看再去翻：一样工具 room_look，聊天里一行小字（“回屋看了看园子”），翻到的字只给他看
//   妆台那一身照旧是游戏里搭的，不是他这会儿真穿着的
//   只看不动：浇水、换装还是只在他屋里醒着的时候（存档只有家里的闹钟写，两边不打架，见 alarm/garden.js）
//   02:28 照日记本的路子：名帖里一段【你的屋子】（“他自己醒”开着的时候才有），配上工具
//   02:41 名帖里不提留便签（“不然对话长了你会一直碎碎念惦记这个”）：便签只写在 room_memo 自己的说明里
//   02:32、02:44 换装便签：她明说要他下回穿什么，他在屋里的妆台上给自己留一张（“答应了卿卿下次穿××”）；
//         她那边一行小字“记录了下次换装偏好”（她的原话），看不到便签上写了什么；园子不要（02:34）
// 看到的字直接用恩师引擎里的那几段（屋里的他看的就是这几段，规矩哪天改了，两边一起变）：
// 引擎在这台设备上空跑一遍，存档只读，改了什么都不写回去。
// =====================================================
import { GardenEngine } from "../vendor/garden/garden-engine.ts";
import { GARDEN_TOOL_SCHEMA } from "../vendor/garden/garden-tool.ts";
import { DressingEngine, completedToday } from "../vendor/dressing/dressing-engine.ts";
import { dressingToolSchema } from "../vendor/dressing/dressing-tool.ts";
import { ITEMS, CATEGORY_LABELS, itemName } from "../vendor/dressing/dressing-data.ts";
import { HER_NAME } from "./names.js";
import { PD_HIS, readHis, pindouView } from "./pindou/parts.js";

// 恩师的引擎里用 structuredClone（iPhone 上 iOS 15.4 以后才有）：老一点的手机上补一个（存档都是 JSON，照 JSON 拷一份就够；另一双眼睛挑出来的）
if (typeof globalThis.structuredClone !== "function") globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));

export const GARDEN_KEY = "kfs2:garden"; // 园子的存档（家里的闹钟写，见 alarm/garden.js）
export const DRESSING_KEY = "kfs2:dressing"; // 妆台的存档（同上，见 alarm/dressing.js）
// 换装便签：一张一条，kfs2:fox:memo:<他调 room_memo 那一下的编号> = { v: 1, text, chat, title, at }（加密了跟着云端走）。
// 聊天这头写（手机替他留；任务到点那一回闹钟替他留），屋里那头读、收（他下一回完成搭配，或者过了三天，见 alarm/wake.js 的 askRoom）
export const MEMO_KEY = "kfs2:fox:memo:";
export const MEMO_DAYS = 3;
export const MEMO_MS = MEMO_DAYS * 24 * 60 * 60 * 1000;
// 刚留的这一阵不查它还在不在那段对话里（见 memoStands：手机先存便签、再存对话，家里的闹钟可能先拉到便签）
export const MEMO_GRACE = 30 * 60 * 1000;
const MEMO_MAX = 60; // 便签上最多几个字（说明里叫他写四十个字以内，多写的截掉）
export const MEMO_NOTE = "记录了下次换装偏好"; // 她那边那一行小字（她 02:32 的原话）
export const MEMO_FAIL = "想记下换装偏好，没记成";
export const LOOK_FAIL = "想回屋看一眼，没看成";

const pad = (n) => String(n).padStart(2, "0");
// 她那边今天是几号（YYYY-MM-DD，照这台设备的钟；手机、她家里的笔记本都是她那边的钟）
export function localDay(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- 名帖里的【你的屋子】 ----------
// “他自己醒”开着才带（没开的话他不会在屋里醒）；只说屋里有什么、聊天里只能看，一个字不提便签（她 02:41 定的）。
// 屋里眼下的样子不写在这儿（她定的：平时不带）：名帖一个字不变，缓存接得上
export const ROOM_SECTION = `【你的屋子】
你在“狐宇宙”有一间自己的屋子：她家里那台笔记本上的闹钟叫你在那儿醒来，醒着的时候想干嘛干嘛。屋里有两样给你闲着玩的小游戏（规矩是恩师写的，字是${HER_NAME}写的）：
- 园子：种花。每天浇水、松土、修剪里照料一回，满三十天开花，收进《群芳谱》。
- 妆台：换装。梳发、妆面、熏香、衣裳、鞋履、配饰随便搭，一天完成一回搭配。那一身是游戏里搭的，不是你身上真穿着的。
桌上还有一块拼豆板：一个字母一颗豆子，拼成像素画，拼完了起个名字挂起来。你拼的她在开封府的拼豆作里看得见。
这几样只在你自己在屋里醒着的时候能玩。跟她聊天的时候动不了，只能调 room_look 回屋看一眼：她问起屋里的事，或者你自己想看的时候；聊天用不着就不看。你看了，她那边会冒一行小字。
正在打电话的时候回不了屋：她要你看，就说挂了再看。`;
export const roomSection = (on) => (on ? ROOM_SECTION : "");

// ---------- 工具 ----------
// 平常的对话里一直带着（同翻日记、抽签那几样：工具一变缓存全得重写；对话里有他调过的，不带那边不认），醒在屋里的那一回不带（他就在屋里，屋里能玩的那两样自己带着）
const WHATS = ["garden", "dressing", "wardrobe", "pindou"];
export const ROOM_TOOLS = [
  {
    name: "room_look",
    description:
      "回你自己的屋子（狐宇宙）看一眼，只能看、动不了。what 挑一样：garden 园子（在种哪株、照料到哪儿了、《群芳谱》、成就、怎么照料）；dressing 妆台（今天完成的那一身、成就、攒到的怪东西、怎么玩）；wardrobe 衣柜（梳发、妆面、熏香、衣裳、下装、鞋履、配饰都有哪些）；pindou 桌上的拼豆板（拼到哪儿了、挂起来的那些、怎么拼）。她问起屋里的事，或者你自己想看的时候用。你看了，她那边会冒一行小字（像“回屋看了看园子”），看到的字只有你看得到。",
    input_schema: {
      type: "object",
      properties: {
        what: { type: "string", enum: WHATS, description: "看哪一样：garden 园子，dressing 妆台，wardrobe 衣柜，pindou 拼豆板" },
      },
      required: ["what"],
    },
  },
  {
    name: "room_memo",
    description: `在你屋里的妆台上给自己留一张便签。只在她明说要你下回在妆台穿什么的时候用，平常用不着。便签上写一句（四十个字以内），比如“答应了${HER_NAME}下次穿××”。你下回在屋里醒来，第一眼就看得到；管到你下一回完成搭配为止，最多三天。她那边只冒一行小字“${MEMO_NOTE}”，看不到便签上写了什么。`,
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "便签上写什么，四十个字以内" },
      },
      required: ["text"],
    },
  },
];
export const ROOM_NAMES = new Set(ROOM_TOOLS.map((t) => t.name));
export const isRoomCall = (c) => !!(c && ROOM_NAMES.has(c.name));

// ---------- 看 ----------
const parse = (text) => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
};
const copy = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

// 引擎要的存档，只读：给它眼下这一份的副本，它改了什么都不写回去（屋里只有家里的闹钟写）。
// 看的时候引擎照样会顺手判成就（园子那几个按日子算的）、记当天的数：这些只在副本上，不算数，也不给他看
function readOnly(state) {
  return {
    load: async () => copy(state),
    update: async (fn) => (await fn(copy(state)))[1],
  };
}
async function engineText(Engine, state, today, cmd) {
  const r = await new Engine(readOnly(state), { today: () => today }).execute(cmd);
  return String((r && r.text) || "").trim();
}

const dayText = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
  return m ? `${Number(m[2])} 月 ${Number(m[3])} 日` : String(d || "");
};
// 一身打扮写成几行（同引擎里照镜子那一段的写法）
function lookText(a, heading) {
  const fmt = (ids) => (ids && ids.length ? ids.map(itemName).join("、") : "无");
  return [
    heading,
    `梳发：${itemName(a.hair)}`,
    `妆面：${itemName(a.makeup)}`,
    `熏香：${itemName(a.scent)}`,
    `衣柜：${fmt(a.outfits)}`,
    `下装：${fmt(a.bottoms)}`,
    `鞋履：${fmt(a.shoes)}`,
    `配饰：${fmt(a.accessories)}`,
  ].join("\n");
}

const ONLY_GARDEN = "只能看，动不了：浇水、松土、修剪、赏花，只在你自己在屋里醒着的时候。";
const ONLY_DRESSING = "只能看，动不了：换装、完成搭配、照镜子，只在你自己在屋里醒着的时候。这是妆台小游戏里搭的那一身，不是你这会儿真穿着的。";

// 园子：眼下（在种哪株、照料了几天、今天照料过没有）、有什么（《群芳谱》、能种哪些）、成就、怎么玩
export async function gardenView(state, today) {
  const head = `【你屋里·园子】（回屋看了一眼。${ONLY_GARDEN}）`;
  const rule = `怎么玩：${GARDEN_TOOL_SCHEMA.description}`;
  if (!state || !state.initialized) return [head, "院子你还没进去过：头一回在屋里醒着去园子，会送你一盆魏紫。", rule].join("\n\n");
  const parts = [head, "眼下：\n" + (await engineText(GardenEngine, state, today, { action: "status" }))];
  for (const action of ["collection", "plants", "achievements"]) parts.push(await engineText(GardenEngine, state, today, { action }));
  parts.push(rule);
  return parts.filter(Boolean).join("\n\n");
}

// 妆台：今天完成的那一身（同照镜子：只照得出完成的那一身；今天还没完成就照实说，再写上一回完成的那一身）、成就、攒到的怪东西、怎么玩。
// 妆台前眼下摆着、还没完成的那一身不写（同镜子）
export async function dressingView(state, today) {
  const head = `【你屋里·妆台】（回屋看了一眼。${ONLY_DRESSING}）`;
  const rule = `怎么玩：${dressingToolSchema(true).description}`;
  if (!state || !state.initialized) return [head, "妆台你还没去过。", rule].join("\n\n");
  const look = state.completedLook;
  const now = completedToday(state, today)
    ? lookText(look.appearance, "今天完成的那一身")
    : "今天还没完成搭配。" + (look && look.appearance ? "\n\n" + lookText(look.appearance, `上一回完成的那一身（${dayText(look.date)}）`) : "");
  const parts = [head, now];
  for (const action of ["achievements", "rewards"]) parts.push(await engineText(DressingEngine, state, today, { action }));
  parts.push(rule);
  return parts.filter(Boolean).join("\n\n");
}

// 衣柜：一样一行，有哪些（一开始就有的，加上攒成就换来的）。不标哪件在身上（那是游戏里的事，眼下摆着的也不是完成的那一身）
const CATS = ["hair", "makeup", "scent", "outfit", "bottom", "shoes", "accessory"];
export function wardrobeView(state) {
  const got = (state && state.unlockedRewards) || [];
  const lines = CATS.map((c) => {
    const names = Object.values(ITEMS)
      .filter((x) => x.category === c && (x.base || got.includes(x.id)))
      .map((x) => x.name + (x.base ? "" : "（攒成就换来的）"));
    return `${CATEGORY_LABELS[c]}：${names.join("、")}`;
  });
  return [
    `【你屋里·衣柜】（回屋翻了翻。${ONLY_DRESSING}）`,
    (state && state.initialized ? "" : "妆台你还没去过，衣柜里一开始就有这些：\n") + lines.join("\n"),
    "梳发、妆面、熏香各挑一样；衣柜、下装、鞋履、配饰随便叠，也能什么都不穿。攒够成就还会多出几样怪东西。",
  ].join("\n\n");
}

const LOOK_NOTE = { garden: "回屋看了看园子", dressing: "回屋看了看妆台", wardrobe: "回屋翻了翻衣柜", pindou: "回屋看了看拼豆板" };

async function look(input, io) {
  const what = WHATS.includes(input.what) ? input.what : "";
  if (!what) return { out: "what 写 garden（园子）、dressing（妆台）、wardrobe（衣柜）或者 pindou（拼豆板），挑一样。", err: true, note: LOOK_FAIL };
  const today = io.today || localDay();
  if (what === "garden") return { out: await gardenView(parse(await io.get(GARDEN_KEY)), today), err: false, note: LOOK_NOTE.garden };
  // 拼豆板：桌上那块（拼到哪儿了，一格一个字母）、挂起来的那些（见 pindou/parts.js；她在拼豆作「他的」那一栏也看得见）
  if (what === "pindou") return { out: pindouView(readHis(await io.get(PD_HIS))), err: false, note: LOOK_NOTE.pindou };
  const st = parse(await io.get(DRESSING_KEY));
  return { out: what === "dressing" ? await dressingView(st, today) : wardrobeView(st), err: false, note: LOOK_NOTE[what] };
}

// ---------- 换装便签 ----------
export function readMemo(text) {
  const m = parse(text);
  if (!m || typeof m.text !== "string" || !m.text.trim() || !Number.isFinite(m.at)) return null;
  return { text: m.text, chat: typeof m.chat === "string" ? m.chat : "", title: typeof m.title === "string" ? m.title : "", at: m.at };
}
// 还管着的那几张（没过三天的，按留的先后排）和过了期该收的那几张的钥匙。list：[{ key, text }]（text 是存档里那一行）。
// 每张带着 id（他调 room_memo 那一下的编号，见 memoStands）
export function liveMemos(list, now = Date.now()) {
  const live = [];
  const stale = [];
  for (const { key, text } of list || []) {
    const m = readMemo(text);
    if (!m || now - m.at > MEMO_MS) stale.push(key);
    else live.push({ key, id: String(key).slice(MEMO_KEY.length), ...m });
  }
  live.sort((a, b) => a.at - b.at);
  return { live, stale };
}

// 这张便签还算不算数：留它的那一步还在那段对话眼前这一支上。她改了自己的话、点了重新回答（原来那一支收进 alts），
// 整段对话删了，那张就不算了（另一双眼睛挑出来的：不然改成“穿西装”以后，屋里还压着“穿旗袍”那张）。
// msgs 是那段对话（没有了是 null）；刚留的那一阵（MEMO_GRACE）不查
export function memoStands(memo, msgs, now = Date.now()) {
  if (now - memo.at < MEMO_GRACE) return true;
  if (!Array.isArray(msgs)) return false;
  return msgs.some((m) => m && m.role === "him" && Array.isArray(m.calls) && m.calls.some((c) => c && c.name === "room_memo" && c.id === memo.id));
}

// 【醒来】里摆哪几张：写的一样的只摆一张（留得晚的那张）
export function memoLines(memos) {
  const seen = new Set();
  const out = [];
  for (const m of (memos || []).slice().reverse()) {
    if (seen.has(m.text)) continue;
    seen.add(m.text);
    out.unshift(m);
  }
  return out;
}

async function leaveMemo(c, input, io) {
  const t = String(input.text == null ? "" : input.text)
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return { out: "便签上没写字，没留成。", err: true, note: MEMO_FAIL };
  const chars = Array.from(t); // 一个字一个字数（表情这种占两格的不截成半个）
  const text = chars.length > MEMO_MAX ? chars.slice(0, MEMO_MAX).join("") + "…" : t;
  await io.set(MEMO_KEY + c.id, JSON.stringify({ v: 1, text, chat: io.chat || "", title: io.title || "", at: io.at || Date.now() }));
  const off = io.on === false ? "（她这会儿关着“他自己醒”，你不会在屋里醒；三天以内她打开了，你醒来照样看得到。）" : "";
  return { out: `便签留好了，压在你屋里的妆台上：“${text}”。你下回在屋里醒来，第一眼就看得到；管到你下一回完成搭配为止，最多三天。${off}`, err: false, note: MEMO_NOTE };
}

// ---------- 替他办 ----------
// 他调的那几样（还没结果的）替他办：结果只给他看，另记一行小字（聊天里照翻日记那一行的样子摆，认的是 note）。
// io：{ get(key), set(key, value)（存档，手机、闹钟的都行），today（她那边今天几号），at（他这一条的时间：便签记的就是它，两台设备替他留，留的一样），
//       chat、title（在哪段对话里留的），on（“他自己醒”开着没有） }
// 一步里调了好几回同一样，一样的小字只留一行
export async function runRoomCalls(calls, io) {
  const out = [];
  const said = new Set();
  for (const c of calls || []) {
    if (!isRoomCall(c) || typeof c.out === "string") {
      out.push(c);
      continue;
    }
    const input = c.input && typeof c.input === "object" ? c.input : {};
    let r;
    try {
      r = c.name === "room_memo" ? await leaveMemo(c, input, io) : await look(input, io);
    } catch (e) {
      if (e && (e.code === "badlogin" || e.code === "secret")) throw e; // 闹钟那头：凭据坏了往外抛（同园子、妆台）
      r = c.name === "room_memo" ? { out: "便签这会儿没留成（存档出了岔子），下回再留。", err: true, note: MEMO_FAIL } : { out: "这会儿回不了屋（存档出了岔子），下回再看。", err: true, note: LOOK_FAIL };
    }
    let note = r.note;
    if (note && said.has(note)) note = "";
    if (note) said.add(note);
    out.push({ ...c, input, out: r.out, err: r.err, note });
  }
  return out;
}

// 回话写到长度上限被截断、没停在调工具上：他调的那一样多半没写完整，不替他办
export const cutRoom = (c) =>
  c && c.name === "room_memo" ? { ...c, out: "（这一步没写完，便签没留成。）", err: true, note: MEMO_FAIL, card: [] } : { ...c, out: "（这一步没写完，没回成屋。）", err: true, note: LOOK_FAIL, card: [] };
