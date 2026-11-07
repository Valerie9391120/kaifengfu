// =====================================================
// 园子那三页的零件（推近花盆，卡片上那三颗：看看园子、群芳谱、成就；页面见 GardenSheets.jsx），不碰界面。
// 只看，不改：园子的存档（kfs2:garden）只有家里的闹钟写（见 alarm/garden.js），手机这头只读；
// 字用园艺引擎里现成的那一份（vendor/garden：十二种花的名字、各配的那段字、开花那段字，三十个成就），不另写一份。
//   看看园子：这一盆（哪株、到哪一步、照料了几天、今天照料过没有；开了写开了，带上开花那段字）＋照料的账
//   群芳谱：十二种全列，名字和配的那段字都写上，没收进来的整条灰着
//   成就：三十个全列，点亮的亮着、没点亮的灰着（同妆台的成就那一页）
// =====================================================
import { PLANTS, PLANT_ORDER } from "../../vendor/garden/garden-data.ts";
import { ACHIEVEMENTS } from "../../vendor/garden/achievements.ts";
import { cn } from "../desk/parts.js";

const CARED = { water: "浇过水了", loosen: "松过土了", prune: "修剪过了" };
// 到哪一步（同引擎：十天以内萌动，十一到二十天抽枝展叶，二十一天起孕蕾）
export const stageOf = (n) => (n >= 21 ? "孕蕾" : n >= 11 ? "抽枝展叶" : "萌动");
const ymd = (d) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
// 日子写成汉字：2026-10-28 → 十月二十八日
export function cnDay(d) {
  const m = ymd(d);
  return m ? `${cn(Number(m[2]))}月${cn(Number(m[3]))}日` : "";
}
const dayNo = (d) => {
  const m = ymd(d);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : NaN;
};
const num = (x) => Math.max(0, Math.floor(Number(x) || 0));

// ---------- 看看园子 ----------
// kind：never 还没进过园子；garden 进过了（plant：眼下这一盆，没在种是 null，empty 写一句；rows：照料的账）
export function lookView(state, today) {
  if (!state || !state.initialized) return { kind: "never" };
  const s = state.stats || {};
  const done = (state.completedPlants || []).length;
  const p = state.currentPlant && PLANTS[state.currentPlant];
  let plant = null;
  if (p) {
    const days = num(state.careDays);
    if (days >= 30) {
      const h = (state.plantHistory || {})[state.currentPlant] || {};
      plant = { name: p.displayName, text: `${p.shortName}开了。`, bloom: p.bloomText || "", since: h.completedAt ? `${cnDay(h.completedAt)}开的。` : "" };
    } else {
      const cared = state.todayCareDate === today && CARED[state.todayCareAction] ? CARED[state.todayCareAction] : "还没照料";
      plant = {
        name: p.displayName,
        text: `${stageOf(days)}，${days ? `照料了${cn(days)}天` : "刚种下"}（满三十天开花）。今天${cared}。`,
        bloom: "",
        since: state.currentPlantStartedAt ? `${cnDay(state.currentPlantStartedAt)}种下。` : "",
      };
    }
  }
  // 连着照料：最后照料的那天是今天或者昨天才算连着（引擎只在照料的时候往上加，断了要等下一回照料才变回一天）
  const last = dayNo(s.lastCareDate);
  const now = dayNo(today);
  const streak = last === now || last === now - 1 ? num(s.consecutiveCareDays) : 0;
  const best = num(s.bestCareStreak);
  const times = (k) => (num(s[k]) ? `${cn(num(s[k]))}回` : "还没有");
  const rows = [
    { label: "浇水", text: times("water") },
    { label: "松土", text: times("loosen") },
    { label: "修剪", text: times("prune") },
    { label: "赏花", text: times("admire") },
    { label: "连着", text: best ? `${streak ? `眼下连着照料了${cn(streak)}天` : "眼下没连着"}，最长连着${cn(best)}天` : "还没照料过" },
    { label: "谢过", text: num(s.deaths) ? `${cn(num(s.deaths))}株` : "没谢过" },
    { label: "开过", text: done ? `${cn(done)}种，收在《群芳谱》里` : "还没开过" },
  ];
  if (state.firstGardenDate) rows.push({ label: "进园", text: `${cnDay(state.firstGardenDate)}头一回进园子` });
  return { kind: "garden", plant, empty: p ? "" : done ? "眼下没在种。" : "庭中暂时空着。", rows };
}

// ---------- 群芳谱 ----------
// 十二种照引擎里的次序；on：收进来了（开过）；meta：哪天开的、在种、谢过几回
export function bookView(state) {
  const got = new Set((state && state.completedPlants) || []);
  const hist = (state && state.plantHistory) || {};
  const growing = state && state.currentPlant && num(state.careDays) < 30 ? state.currentPlant : null;
  const list = PLANT_ORDER.map((id, i) => {
    const p = PLANTS[id];
    const h = hist[id] || {};
    const meta = [];
    if (got.has(id) && h.completedAt) meta.push(`${cnDay(h.completedAt)}开的`);
    if (id === growing) meta.push(`在种，照料了${cn(num(state.careDays))}天`);
    if (num(h.deaths)) meta.push(`谢过${cn(num(h.deaths))}回`);
    return { id, no: cn(i + 1), name: p.displayName, text: p.collectionText, on: got.has(id), meta: meta.join(" · ") };
  });
  const total = list.length;
  const n = list.filter((f) => f.on).length;
  return { got: n, total, head: n ? `收了${cn(n)}种，一共${cn(total)}种。` : `一种都还没收，一共${cn(total)}种。`, list };
}

// ---------- 成就 ----------
export function gardenAchievementsView(state) {
  const on = new Set((state && state.unlockedAchievements) || []);
  const list = ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, description: a.description, on: on.has(a.id) }));
  return { lit: list.filter((a) => a.on).length, total: list.length, list };
}
