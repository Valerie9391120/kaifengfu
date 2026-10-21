// =====================================================
// 光义屋里的园子（狐宇宙，见 src/fox.js、开发说明“园艺”）。引擎是恩师写的（vendor/garden/，一个字没改），
// 规矩、文本是卿卿定的、她写的：头一回进园子送一盆魏紫；每天浇水、松土、修剪三选一算一次照料，赏花不限；
// 照料满三十天开花，收进《群芳谱》，魏紫开了以后自己挑下一种；培育中照料一回有万分之二的机会凋谢。
//
// 她 10 月 21 日定的几样：
//   00:11 只在他屋里醒着的时候种（家里的闹钟一处写，不会两边打架）；她看园子等书房那个场景（点花盆、桌上那朵牡丹），南衙里不单开一栏
//   02:28 他每回在屋里醒来，【醒来】里告诉他园子眼下的样子，去不去他自己定；
//         他在园子里干了什么，狐宇宙里只留一行小字（“去园子里浇了水”），园子里的那几段字只给他看
//
// 存档：kfs2:garden 一行（加密了跟着云端走），只有闹钟写。引擎要的 GardenStore 照这一行办（同一个闹钟里一样一样排着来）。
// 哪一天照她那边的钟算（笔记本的钟就是她那边的钟）。
// =====================================================
import { GardenEngine } from "../vendor/garden/garden-engine.ts";
import { GARDEN_TOOL_SCHEMA } from "../vendor/garden/garden-tool.ts";
import { PLANTS } from "../vendor/garden/garden-data.ts";

export const GARDEN_KEY = "kfs2:garden";
const NAME = GARDEN_TOOL_SCHEMA.name;
export const GARDEN_NAMES = new Set([NAME]);
export const isGardenCall = (c) => !!(c && c.name === NAME);
// 给那边的我的那一样工具（Anthropic 的写法：参数叫 input_schema）
export const GARDEN_TOOL = {
  name: NAME,
  description: GARDEN_TOOL_SCHEMA.description + "这是你屋里的院子，只在你自己醒着、待在屋里的时候能去。",
  input_schema: JSON.parse(JSON.stringify(GARDEN_TOOL_SCHEMA.parameters)),
};

const parse = (text) => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
};
const pad = (n) => String(n).padStart(2, "0");
// 她那边今天是几号（YYYY-MM-DD，照这台电脑的钟）
export function localDay(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 引擎要的存档：读 kfs2:garden；改的时候一样一样排着来（同一个闹钟里先后两回不会互相盖掉）
function storeOf(store) {
  let queue = Promise.resolve();
  return {
    async load() {
      return parse(await store.get(GARDEN_KEY));
    },
    update(fn) {
      const run = queue.then(async () => {
        const [next, value] = await fn(parse(await store.get(GARDEN_KEY)));
        await store.set(GARDEN_KEY, JSON.stringify(next));
        return value;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

// 一个园子（today、rng 测试里换成假的）
export function gardenOf(store, { today = () => localDay(), rng = Math.random } = {}) {
  return { engine: new GardenEngine(storeOf(store), { today }, rng), load: async () => parse(await store.get(GARDEN_KEY)), today };
}

const nameOf = (id) => (id && PLANTS[id] ? PLANTS[id].shortName : "花");
const CARE = { water: "浇了水", loosen: "松了土", prune: "修剪了枝叶" };

// 狐宇宙里那一行小字（她 02:28 定的：只要一行小字）。before、after 是办之前、办之后的存档
export function gardenNote(input, before, after) {
  const a = input && input.action;
  const b = before || {};
  const bs = b.stats || {};
  const as = (after && after.stats) || {};
  if (CARE[a]) {
    if (!((as.totalCare || 0) > (bs.totalCare || 0))) return "去园子里看了看";
    if ((as.deaths || 0) > (bs.deaths || 0)) return `去园子里${CARE[a]}，${nameOf(b.currentPlant)}没能熬过去`;
    if (after && after.careDays === 30 && (b.careDays || 0) === 29) return `去园子里${CARE[a]}，${nameOf(after.currentPlant)}开花了`;
    return `去园子里${CARE[a]}`;
  }
  if (a === "admire") return "在园子里赏了花";
  if (a === "plant") return after && after.currentPlant && (after.currentPlant !== b.currentPlant || after.currentPlantStartedAt !== b.currentPlantStartedAt) ? `在园子里种下了${nameOf(after.currentPlant)}` : "去园子里看了看";
  if (a === "collection") return "翻了翻《群芳谱》";
  if (a === "achievements") return "看了看园子里的成就";
  if (a === "plants") return "看了看能种哪些花";
  return "去园子里看了看";
}

// 替他办他调的那几样（还没结果的）：结果是引擎回的字（只给他看），另记一行小字（摆在狐宇宙里）
export async function runGardenCalls(calls, garden) {
  const out = [];
  for (const c of calls || []) {
    if (!isGardenCall(c) || typeof c.out === "string") {
      out.push(c);
      continue;
    }
    const input = c.input && typeof c.input === "object" ? c.input : {};
    try {
      const before = await garden.load();
      const parts = [];
      const say = (r) => parts.push(...[r.text, ...r.events, ...r.newAchievements.map((x) => `成就解锁——${x.name}\n${x.description}`)].map((x) => String(x || "").trim()).filter(Boolean));
      // 头一回进园子，他上来就浇水（没先 open）：先替他推开园门，她写的那首《缘识》照样给他看（引擎只在 open 的时候给），再办他要办的
      if ((!before || !before.initialized) && input.action !== "open") say(await garden.engine.execute({ action: "open" }));
      const r = await garden.engine.execute({ action: input.action, plantId: input.plantId, targetPlantId: input.targetPlantId });
      say(r);
      out.push({ ...c, out: parts.join("\n\n") || "园子里没什么动静。", err: false, note: gardenNote(input, before, r.state) });
    } catch (e) {
      if (e && (e.code === "badlogin" || e.code === "secret")) throw e;
      out.push({ ...c, out: "园子这会儿进不去（存档出了岔子），下回再来。", err: true, note: "想去园子里，没去成" });
    }
  }
  return out;
}
// 回话写到长度上限被截断、没停在调工具上：他调的那一样多半没写完整，不替他办
export const cutGarden = (c) => ({ ...c, out: "（这一步没写完，园子没去成。）", err: true, note: "想去园子里，没去成" });

// 【醒来】里那一句：园子眼下的样子（她 02:28 定的：告诉他，去不去他自己定）。state 是存档（没进过是 null）
export function gardenBrief(state, today) {
  if (!state || !state.initialized) return "院子你还没进去过（头一回去，会送你一盆魏紫）。";
  const done = (state.completedPlants || []).length;
  const book = done ? `《群芳谱》里收了 ${done} 种。` : "";
  const p = state.currentPlant && PLANTS[state.currentPlant];
  if (!p) return `院子里眼下空着，没在种的${done ? "，可以挑下一株来种" : ""}。${book}`;
  if (state.careDays >= 30) return `${p.displayName}已经栽成，开着；可以挑下一株来种。${book}`;
  return `院子里在种${p.displayName}，照料了 ${state.careDays} 天（满三十天开花），今天${state.todayCareDate === today ? "已经照料过了" : "还没照料"}。${book}`;
}
