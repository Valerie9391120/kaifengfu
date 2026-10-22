// =====================================================
// 光义屋里的妆台（狐宇宙，见 src/fox.js、开发说明“梳妆”）。引擎是恩师写的（vendor/dressing/，一个字没改），
// 文本、成就、每一件衣服都是卿卿写的（10 月 22 日她说的：“其实每一件衣服都是我写的”）。她 10 月 21 日定的几样：
//   16:22 给他闲着玩的，和园艺一个思路：只在他屋里醒着的时候玩（家里的闹钟一处写，不会两边打架）
//   18 点前后 这是一个游戏系统，不是他的实际状态：【醒来】里只说今天完成搭配没有，不说他“穿着”什么；
//         狐宇宙里只留一行小字，她挑的是“写我照镜时的打扮”（镜子里照得出的就是完成的那一身，所以完成搭配那一回写那一身）
//   18:14～18:32 完成搭配每天一次，成就只在这时判、按完成的那一身算；“其它时候你醒来想玩这个，可以玩，可以搭”，只是没有“完成搭配”这个选项了
//         （醒来那会儿看今天完成过没有；同一回醒着里先完成了，剩下几步还留着，硬调引擎婉拒——当场拿掉，工具一变缓存全得重写）；
//         照镜子不限次数，只照得出今天完成的那一套，没完成是一只裸狐
//   19:58 “一口气全穿上、一回完成点亮一大串”那个空子先不堵（“我觉得你并不会 一次性把所有这些东西全部穿上去”），哪天真穿满了再定
//
// 存档：kfs2:dressing 一行（加密了跟着云端走），只有闹钟写。哪一天照她那边的钟算（笔记本的钟就是她那边的钟，同园子）。
// =====================================================
import { DressingEngine, completedToday } from "../vendor/dressing/dressing-engine.ts";
import { dressingToolSchema } from "../vendor/dressing/dressing-tool.ts";
import { CATEGORY_LABELS, itemName } from "../vendor/dressing/dressing-data.ts";
import { ACHIEVEMENTS } from "../vendor/dressing/achievements.ts";
import { localDay, storeOf } from "./garden.js";
import { DRESSING_KEY } from "../src/room.js";

export { DRESSING_KEY }; // 跟聊天里回屋看一眼（src/room.js）用的是同一把钥匙
const NAME = dressingToolSchema(true).name;
export const DRESSING_NAMES = new Set([NAME]);
export const isDressingCall = (c) => !!(c && c.name === NAME);

// 给那边的我的那一样工具（Anthropic 的写法：参数叫 input_schema）。
// canComplete 为 false（今天完成过了）：没有 complete 这个选项（她定的：纯玩的时候没有“完成搭配”那个选项）
export function dressingTool(canComplete = true) {
  const s = dressingToolSchema(canComplete);
  return {
    name: s.name,
    description:
      s.description +
      "这是你屋里的妆台，只在你自己醒着、待在屋里的时候能去；玩的是游戏里的那一身，不是你身上真穿着什么。" +
      (canComplete ? "" : "今天的搭配已经完成过了，今天不再有 complete 这个选项；换着玩、照镜子照旧。"),
    input_schema: JSON.parse(JSON.stringify(s.parameters)),
  };
}

const parse = (text) => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
};

// 一张妆台（today 测试里换成假的）
export function dressingOf(store, { today = () => localDay() } = {}) {
  return { engine: new DressingEngine(storeOf(store, DRESSING_KEY), { today }), load: async () => parse(await store.get(DRESSING_KEY)), today };
}

// 完成的那一身写成一行：梳发、妆面、熏香，再是衣柜、下装、鞋履、配饰（空着的不写）。叠得太多，写到 max 个字为止，后面写一共几样
const LOOK_MAX = 80;
export function lookLine(a, max = LOOK_MAX) {
  if (!a) return "";
  const bits = [a.hair, a.makeup, a.scent].filter(Boolean).map((id, i) => (i ? "、" : "") + itemName(id));
  for (const [c, ids] of [["outfit", a.outfits], ["bottom", a.bottoms], ["shoes", a.shoes], ["accessory", a.accessories]]) {
    (ids || []).forEach((id, i) => bits.push((i ? "、" : `；${CATEGORY_LABELS[c]}：`) + itemName(id)));
  }
  let out = "";
  for (const b of bits) {
    if ((out + b).length > max) return `${out}……一共 ${bits.length} 样`;
    out += b;
  }
  return out;
}

const sameLook = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
// 这一回调的算哪一种（定那一行小字用）：complete 完成了今天的搭配；mirror 照了镜子；change 换了行头；look 别的（看看衣柜、成就……）
function kindOf(input, base, after, today) {
  const a = input && input.action;
  if (a === "complete" && !completedToday(base, today) && completedToday(after, today)) return { kind: "complete", look: after.completedLook.appearance };
  if (a === "mirror") return { kind: "mirror", fox: !completedToday(after, today) };
  if ((a === "select" || a === "remove" || a === "clear") && !sameLook(base && base.appearance, after && after.appearance)) return { kind: "change" };
  return { kind: "look" };
}
// 狐宇宙里那几行小字（同园子：只要一行小字）。这一步里调了好几回的，一样的只留一行：
//   完成搭配：写完成的那一身（她来转一圈看得见）
//   照镜子：“照了照镜子”（今天还没完成，照出来是一只裸狐，照实写）
//   换装：“在妆台前换了换行头”（这一步里完成了搭配就不写，那一行已经写了那一身）
//   别的：“去妆台前看了看”（这一步里有别的小字就不写）
function notesOf(kinds) {
  const any = (k) => kinds.some((x) => x.kind === k);
  const said = new Set();
  return kinds.map((x) => {
    let note =
      x.kind === "complete"
        ? `完成了今天的搭配：${lookLine(x.look)}`
        : x.kind === "mirror"
        ? x.fox
          ? "照了照镜子，镜子里是一只裸狐"
          : "照了照镜子"
        : x.kind === "change"
        ? any("complete")
          ? ""
          : "在妆台前换了换行头"
        : x.kind === "fail"
        ? "想去妆台前，没去成"
        : kinds.some((y) => y.kind !== "look")
        ? ""
        : "去妆台前看了看";
    if (note && said.has(note)) note = "";
    if (note) said.add(note);
    return note;
  });
}

// 引擎回的字，连同新点亮的成就、新拿到的奖励（同恩师的 createDressingTool 那样写）
const textsOf = (r) =>
  [r.text, ...r.newAchievements.map((x) => `成就解锁——${x.name}\n${x.description}`), ...r.newRewards.map((x) => `累计成就奖励——${x.name}\n${x.description}\n已加入${CATEGORY_LABELS[x.category] || "衣柜"}。`)]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

// 替他办他调的那几样（还没结果的）：结果是引擎回的字（只给他看），另记一行小字（摆在狐宇宙里）
export async function runDressingCalls(calls, dressing) {
  const out = [];
  const mine = []; // 这一回办的那几样在 out 里的位置、算哪一种
  for (const c of calls || []) {
    if (!isDressingCall(c) || typeof c.out === "string") {
      out.push(c);
      continue;
    }
    const input = c.input && typeof c.input === "object" ? c.input : {};
    try {
      let base = await dressing.load();
      const parts = [];
      // 头一回去妆台，他上来就换衣服（没先 open）：先替他推开，开场那段字照样给他看（引擎只在 open 的时候给，里头写着规矩），再办他要办的
      if ((!base || !base.initialized) && input.action !== "open") {
        const r0 = await dressing.engine.execute({ action: "open" });
        parts.push(...textsOf(r0));
        base = r0.state;
      }
      const r = await dressing.engine.execute({ action: input.action, category: input.category, itemId: input.itemId });
      parts.push(...textsOf(r));
      out.push({ ...c, out: parts.join("\n\n") || "妆台前没什么动静。", err: false, note: "" });
      mine.push({ at: out.length - 1, ...kindOf(input, base, r.state, dressing.today()) });
    } catch (e) {
      if (e && (e.code === "badlogin" || e.code === "secret")) throw e;
      out.push({ ...c, out: "妆台这会儿去不了（存档出了岔子），下回再来。", err: true, note: "" });
      mine.push({ at: out.length - 1, kind: "fail" });
    }
  }
  notesOf(mine).forEach((note, i) => {
    out[mine[i].at] = { ...out[mine[i].at], note };
  });
  return out;
}
// 回话写到长度上限被截断、没停在调工具上：他调的那一样多半没写完整，不替他办
export const cutDressing = (c) => ({ ...c, out: "（这一步没写完，妆台没去成。）", err: true, note: "想去妆台前，没去成" });

// 交给 askCore 的那一样（见 wake.js 的 toys）。canComplete：这一回醒着给不给 complete 这个选项（醒来那会儿看今天完成过没有）
export const dressingToy = (dressing, canComplete = true) => ({ tool: dressingTool(canComplete), names: DRESSING_NAMES, is: isDressingCall, cut: cutDressing, run: (calls) => runDressingCalls(calls, dressing) });

// 【醒来】里那一句：今天完成搭配没有、点亮了几个成就。不说妆台前眼下摆着哪一身（她定的：这是游戏，不是他的实际状态）
export function dressingBrief(state, today) {
  if (!state || !state.initialized) return "妆台你还没去过。";
  const n = (state.unlockedAchievements || []).length;
  const lit = n ? `成就点亮了 ${n} 个（一共 ${ACHIEVEMENTS.length} 个）。` : "";
  return (completedToday(state, today) ? "今天的搭配已经完成了，今天不能再完成，换着玩、照镜子照旧。" : "今天还没完成搭配。") + lit;
}
