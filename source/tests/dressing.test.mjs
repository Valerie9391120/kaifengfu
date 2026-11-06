// 妆台的衣柜挪到手机上（见 src/dressing/closet.js、vendor/dressing/ 的 SOURCE.md）：衣柜那一条怎么存、怎么读；照一开始那一份改一遍（改字、加、删）；
// 锁（成就里点了名的、一开始穿着的、删了凑不够数的）；加、改、删、撤销、找；照镜子、衣柜、成就三页摆什么；
// 引擎拿这一份衣柜玩（新加的穿得上、描述看得见、删掉的取下来穿不上、名字留着、试过几种算新加的、全部基础××不算）；
// 家里的闹钟替他办的时候照这一份；聊天里回屋看衣柜、看妆台照这一份。
// 仓库是公开的：这里加的衣服都是编的。
import {
  CLOSET_KEY, CATS, emptyCloset, normCloset, readCloset, packCloset, isEmptyCloset, closetItems, closetCatalog, lockOf, addItem, editItem, dropItem, undropItem,
  closetView, findItems, lookRows, mirrorView, achievementsView, NAME_MAX,
} from "../src/dressing/closet.js";
import { BASE_ITEMS, DEFAULT_CATALOG, ITEMS } from "../vendor/dressing/dressing-data.ts";
import { DressingEngine } from "../vendor/dressing/dressing-engine.ts";
import { ACHIEVEMENTS } from "../vendor/dressing/achievements.ts";
import { dressingOf, runDressingCalls, DRESSING_KEY } from "../alarm/dressing.js";
import { runRoomCalls, lookLine, dressingView, wardrobeView } from "../src/room.js";
import { dressingCard, deskCards } from "../src/desk/parts.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const kv = () => {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => { m.set(k, v); return true; } };
};
const DAY = "2026-11-06";
const memStore = (init = null) => {
  let st = init;
  return { load: async () => st, update: async (fn) => { const [next, v] = await fn(st ? JSON.parse(JSON.stringify(st)) : null); st = next; return v; }, now: () => st };
};
const eng = (cat, st = null, today = DAY) => {
  const s = memStore(st);
  return { e: new DressingEngine(s, { today: () => today }, cat), s };
};

// ---------- 存、读 ----------
ok(eq(readCloset(null), emptyCloset()) && eq(readCloset("乱码{"), emptyCloset()) && eq(readCloset(JSON.stringify({ v: 2 })), emptyCloset()), "读不出来、版本不对：当空的");
ok(isEmptyCloset(readCloset(null)) && CLOSET_KEY === "kfs2:dressing:closet" && CATS.length === 7, "空的认得出；钥匙；七样");
{
  const raw = {
    v: 1,
    add: [
      { id: "outfit_my_a", name: "  格子  睡衣 ", category: "outfit", description: " 软的 ", at: 5 },
      { id: "outfit_my_a", name: "重了编号", category: "outfit" },
      { id: "hair_loose", name: "跟一开始那一份重编号", category: "hair" },
      { id: "x_my_b", name: "没有这一样", category: "hat" },
      { id: "acc_my_c", name: "   ", category: "accessory" },
      { id: "acc_my_d", name: "很长".repeat(40), category: "accessory" },
    ],
    edit: { outfit_black_turtleneck: { name: "高领黑毛衣" }, outfit_qipao: { name: " 改了名的旗袍 ", description: "" }, reward_crocs: { name: "攒来的不能改" }, nope: { name: "没这件" } },
    drop: ["outfit_my_a", "nope", "outfit_my_a", "reward_crocs"],
  };
  const r = normCloset(raw);
  ok(r.add.length === 2 && r.add[0].name === "格子 睡衣" && r.add[0].description === "软的" && r.add[1].name.length === NAME_MAX, `加的：认不出的扔掉，去空白、截长（${r.add.map((a) => a.name).join("|")}）`);
  ok(eq(Object.keys(r.edit), ["outfit_qipao"]) && r.edit.outfit_qipao.name === "改了名的旗袍" && !("description" in r.edit.outfit_qipao), "改的：跟原来一样的不记，攒成就换来的、没有的不记");
  ok(eq(r.drop, ["outfit_my_a"]), "删的：认得的、不重的");
  ok(eq(readCloset(packCloset(r)), r), "存进去再读出来一样");
}

// ---------- 照一开始那一份改一遍 ----------
{
  let r = emptyCloset();
  ok(closetItems(r).length === BASE_ITEMS.length && eq(closetCatalog(r).BASE_IDS, DEFAULT_CATALOG.BASE_IDS), "空的：就是一开始那一份");
  r = addItem(r, "shoes", { name: "编的草鞋", description: "编的描述" }, 1).rec;
  r = editItem(r, "outfit_qipao", { name: "改名旗袍", description: "改的描述" }).rec;
  r = dropItem(r, BASE_ITEMS.find((x) => x.category === "accessory" && x.base && !lockOf(r, x.id)).id).rec;
  const cat = closetCatalog(r);
  const mine = r.add[0];
  ok(mine.id.startsWith("shoes_my_") && cat.ITEMS[mine.id].base && cat.ITEMS[mine.id].batch === 3 && cat.BASE_IDS.shoes.includes(mine.id) && !cat.V1_BASE_IDS.shoes.includes(mine.id), "加的：算平常就有的（试过几种算它），不算一开始那一批（全部基础××不算它）");
  ok(cat.ITEMS.outfit_qipao.name === "改名旗袍" && cat.ITEMS.outfit_qipao.description === "改的描述" && ITEMS.outfit_qipao.name === "高开叉旗袍", "改了字的换上；一开始那一份一个字没动");
  const gone = r.drop[0];
  ok(cat.ITEMS[gone].gone && !cat.BASE_IDS.accessory.includes(gone) && cat.itemName(gone) === ITEMS[gone].name && !cat.itemAvailable(gone, []), "删的：名字留着，不算件数，穿不上");
  ok(closetCatalog(r) === cat && closetCatalog(JSON.parse(JSON.stringify(r))) === cat, "同一份衣柜只算一回");
}

// ---------- 锁 ----------
{
  const r = emptyCloset();
  ok(lockOf(r, "outfit_black_turtleneck") === "《男人最淫荡的衣服》要用", `成就里点了名的：写着哪条要用（${lockOf(r, "outfit_black_turtleneck")}）`);
  ok(lockOf(r, "outfit_none").includes("《坦荡荡》") && lockOf(r, "shoes_barefoot").includes("《跣足而游》"), "不穿、跣足锁着");
  ok(lockOf(r, "hair_loose").includes("《改头换面》") && lockOf(r, "makeup_bare") && lockOf(r, "scent_none"), "一开始穿着的那三样锁着");
  const named = new Set();
  for (const a of ACHIEVEMENTS) for (const m of String(a.check).matchAll(/"((?:hair|makeup|scent|outfit|bottom|shoes|acc)_[a-z0-9_]+)"/g)) if (ITEMS[m[1]]) named.add(m[1]);
  ok(named.size > 30 && [...named].every((id) => lockOf(r, id)), `成就条件里写着的单品一件不落都锁着（${named.size} 件）`);
  const free = BASE_ITEMS.filter((x) => x.base && !lockOf(r, x.id));
  ok(free.length > 60 && free.every((x) => !named.has(x.id)), `别的删得（${free.length} 件）`);
  ok(lockOf(r, "reward_crocs") === "这一件改不了", "攒成就换来的改不了");
  // 发型：一开始十二种，点了名的两种（披发、松散低盘发）；删到只剩十种，再删就凑不够《理发店VIP》
  let h = emptyCloset();
  const hairs = BASE_ITEMS.filter((x) => x.category === "hair" && x.base && !lockOf(h, x.id));
  for (const x of hairs.slice(0, 2)) h = dropItem(h, x.id).rec;
  const third = dropItem(h, hairs[2].id);
  ok(h.drop.length === 2 && third.why === "少了它《理发店VIP》凑不够" && eq(third.rec, h), `发型删到十种就锁上（${third.why}）`);
  h = addItem(h, "hair", { name: "编的发型" }).rec;
  ok(!lockOf(h, hairs[2].id), "加一种发型，又能删一种");
  // 头面部配饰：《头顶违章建筑》要三件。点了名的六件留着，别的全删了也凑得够，一件都不锁
  let f = emptyCloset();
  const heads = BASE_ITEMS.filter((x) => x.category === "accessory" && x.base && x.headFace && !lockOf(f, x.id));
  let whys = 0;
  for (const x of heads) {
    const d = dropItem(f, x.id);
    if (d.why) whys++;
    else f = d.rec;
  }
  const left = closetCatalog(f).BASE_IDS.accessory.filter((id) => closetCatalog(f).ITEMS[id].headFace);
  ok(heads.length >= 10 && whys === 0 && left.length >= 3, `头面部配饰：删得只剩点了名的那几件（${left.length} 件）还凑得够，不锁`);
}

// ---------- 加、改、删、撤销、找 ----------
{
  let r = emptyCloset();
  ok(addItem(r, "hat", { name: "帽子" }).why === "先挑加在哪一样里" && addItem(r, "outfit", { name: "  " }).why === "名字还空着", "没挑哪一样、名字空着：不加");
  ok(addItem(r, "outfit", { name: "高领黑毛衣" }).why === "衣柜里已经有「高领黑毛衣」了", "同一样里重名不加");
  const a = addItem(r, "outfit", { name: "编的长袍", description: "编的，灰色" });
  r = a.rec;
  ok(a.item && r.add.length === 1 && addItem(r, "outfit", { name: "编的长袍" }).why && !addItem(r, "shoes", { name: "编的长袍" }).why, "加上了；同一样里再加同名不行，别的一样里行");
  ok(editItem(r, a.item.id, { name: "编的长袍二", description: "" }).rec.add[0].name === "编的长袍二", "她加的能改");
  ok(editItem(r, "outfit_qipao", { name: "高领黑毛衣" }).why === "衣柜里已经有「高领黑毛衣」了" && editItem(r, "outfit_qipao", { name: "" }).why === "名字还空着" && editItem(r, "reward_crocs", { name: "x" }).why === "这一件改不了", "改成重名、改空、改攒来的：不行");
  r = editItem(r, "outfit_black_turtleneck", { name: "黑色高领毛衣", description: "编的描述" }).rec;
  ok(r.edit.outfit_black_turtleneck.name === "黑色高领毛衣" && !dropItem(r, "outfit_black_turtleneck").dropped, "锁着的能改字，删不了");
  r = editItem(r, "outfit_black_turtleneck", { name: "高领黑毛衣", description: "" }).rec;
  ok(!("outfit_black_turtleneck" in r.edit), "改回原样：不记");
  const d = dropItem(r, a.item.id);
  ok(d.dropped && d.dropped.name === "编的长袍" && closetItems(d.rec).find((x) => x.id === a.item.id).gone && dropItem(d.rec, a.item.id).why === "这一件已经删了", "删了；再删说删过了");
  ok(eq(undropItem(d.rec, a.item.id), r), "撤销：放回去");
  ok(editItem(d.rec, a.item.id, { name: "改删掉的" }).why === "这一件已经删了", "删掉的不能改");
  const hits = findItems(r, "编的 灰色");
  ok(hits.length === 1 && hits[0].id === a.item.id && hits[0].label === "衣柜" && findItems(r, "旗袍").some((x) => x.id === "outfit_qipao") && !findItems(d.rec, "编的").length && !findItems(r, " ").length, "找：几个词都得有，名字描述里找，删掉的不找");
  const v = closetView(r, ["reward_crocs"]);
  const shoes = v.find((g) => g.cat === "shoes").items;
  ok(v.length === 7 && v[0].label === "梳发" && shoes.some((x) => x.id === "reward_crocs" && x.reward && x.lock === "攒成就换来的") && !shoes.some((x) => x.id === "reward_supreme_gold_crocs"), "衣柜那一页：七样，攒到的列着（不能动），没攒到的不列");
  ok(v.find((g) => g.cat === "outfit").items.find((x) => x.id === a.item.id).mine, "她加的标着");
}

// ---------- 三页 ----------
{
  const cat = closetCatalog(emptyCloset());
  ok(mirrorView(null, DAY, null).kind === "never", "照镜子：没去过");
  const look = { hair: "hair_loose", makeup: "makeup_bare", scent: "scent_none", outfits: ["outfit_black_turtleneck"], bottoms: [], shoes: [], accessories: [] };
  const st = { initialized: true, completedLook: { date: DAY, appearance: look }, unlockedAchievements: ["most_indecent_menswear", "first_mirror"], unlockedRewards: [] };
  const m = mirrorView(st, DAY, null);
  ok(m.kind === "today" && m.rows.length === 7 && m.rows[0].text === "披发" && m.rows[3].text === "高领黑毛衣" && m.rows[4].text === "无", "照镜子：今天完成的那一身，七行");
  const y = mirrorView(st, "2026-11-07", null);
  ok(y.kind === "fox" && y.last.date === DAY && y.last.rows[3].text === "高领黑毛衣", "第二天还没完成：裸狐，另写上一回");
  const r2 = editItem(emptyCloset(), "outfit_black_turtleneck", { name: "编的新名字" }).rec;
  ok(lookRows(look, r2)[3].text === "编的新名字" && cat.itemName("outfit_black_turtleneck") === "高领黑毛衣", "名字照这一份衣柜写");
  const av = achievementsView(st, null);
  ok(av.total === 60 && av.list.length === 60 && av.lit === 2 && av.list.find((a) => a.id === "first_mirror").on && !av.list.find((a) => a.id === "hair_3").on, "成就：六十个全列，点亮的标着");
  ok(av.rewards.length === 12 && av.rewards[0].milestone === 3 && av.rewards[0].name === "游泳镜" && !av.rewards[0].on && av.next === 3, "攒成就换来的：十二样，下一份点亮三个以后");
}

// ---------- 引擎拿这一份衣柜玩 ----------
{
  let r = addItem(emptyCloset(), "shoes", { name: "编的布鞋", description: "编的，青色" }).rec;
  const shoe = r.add[0].id;
  r = editItem(r, "outfit_qipao", { name: "编的旗袍名" }).rec;
  let cat = closetCatalog(r);
  const { e, s } = eng(cat);
  await e.execute({ action: "open" });
  const list = (await e.execute({ action: "catalog", category: "shoes" })).text;
  ok(list.includes(`编的布鞋 [${shoe}]——编的，青色`) && !list.includes("reward_crocs"), "翻衣柜：新加的在，描述带着；没攒到的不列");
  ok((await e.execute({ action: "select", category: "shoes", itemId: shoe })).text === "已加入当前鞋履：编的布鞋。", "新加的穿得上");
  await e.execute({ action: "select", category: "outfit", itemId: "outfit_qipao" });
  await e.execute({ action: "select", category: "hair", itemId: "hair_curls" });
  const done = await e.execute({ action: "complete" });
  ok(done.text.includes("鞋履：编的布鞋") && done.text.includes("衣柜：编的旗袍名") && done.newAchievements.some((a) => a.id === "hot_fox"), "完成搭配：照这一份写名字，成就照旧判");
  ok(s.now().stats.usedShoes.includes(shoe), "试过几种：算新加的");
  // 删了他正穿着的（卷发、旗袍以外的那双新鞋）：下回去妆台就取下来
  r = dropItem(r, shoe).rec;
  r = dropItem(r, "hair_curls").rec;
  cat = closetCatalog(r);
  const e2 = new DressingEngine(s, { today: () => DAY }, cat);
  const stt = (await e2.execute({ action: "status" })).text;
  ok(stt.includes("鞋履：无") && stt.includes("梳发：披发") && !s.now().appearance.shoes.length && s.now().appearance.hair === "hair_loose", "删掉的：身上的取下来，梳发换回披发");
  ok((await e2.execute({ action: "select", category: "shoes", itemId: shoe })).text === "没有找到这个单品，或它不属于所选类别。" && !(await e2.execute({ action: "catalog", category: "shoes" })).text.includes(shoe), "删掉的穿不上，衣柜里不列");
  ok((await e2.execute({ action: "mirror" })).text.includes("鞋履：编的布鞋"), "今天完成的那一身照旧写着（名字留着）");
}
{
  // 全部基础鞋履只数一开始那一批：新加的鞋不撑大；《浓淡相宜》加了妆面也只要那三种
  let r = addItem(emptyCloset(), "shoes", { name: "编的第十四双" }).rec;
  r = addItem(r, "makeup", { name: "编的妆面" }).rec;
  const cat = closetCatalog(r);
  const v1 = cat.V1_BASE_IDS.shoes;
  const st = { version: 1, initialized: true, appearance: { hair: "hair_loose", makeup: "makeup_full", scent: "scent_none", outfits: [], bottoms: [], shoes: [], accessories: [] },
    touched: { hair: false, makeup: true, scent: false, outfit: false, bottom: false, shoes: true, accessory: false }, unlockedAchievements: [], unlockedRewards: [],
    stats: { mirrorCount: 0, completeCount: 0, usedHair: [], usedMakeup: ["makeup_bare", "makeup_light"], usedScent: [], usedOutfits: [], usedBottoms: [], usedShoes: v1.slice(1), usedAccessories: [], nakedCompleteStreak: 0, noBarefootCompleteStreak: 0 }, dailyFinalLooks: [] };
  st.appearance.shoes = [v1[0]];
  const { e } = eng(cat, st);
  const r1 = await e.execute({ action: "complete" });
  ok(r1.newAchievements.some((a) => a.id === "shoes_all") && r1.newAchievements.some((a) => a.id === "makeup_all"), `新加的不撑大“全部基础鞋履”“三种妆面”（${r1.newAchievements.map((a) => a.name).join("、")}）`);
}

// ---------- 家里的闹钟：照这一份替他办 ----------
{
  const s = kv();
  let r = addItem(emptyCloset(), "outfit", { name: "编的斗篷", description: "编的" }).rec;
  await s.set(CLOSET_KEY, packCloset(r));
  const d = dressingOf(s, { today: () => DAY });
  const id = r.add[0].id;
  const call = (input, cid) => ({ id: cid, name: "play_dressing_room", input });
  let out = await runDressingCalls([call({ action: "select", category: "outfit", itemId: id }, "a1"), call({ action: "complete" }, "a2")], d);
  ok(out[0].out.includes("编的斗篷") && out[1].note === "完成了今天的搭配：披发、素面、不熏香；衣柜：编的斗篷", `闹钟替他穿上新加的、完成搭配那一行照这一份写（${out[1].note}）`);
  // 她在手机上又改了名字：下一回 load 就换
  r = editItem(r, id, { name: "编的改名斗篷" }).rec;
  await s.set(CLOSET_KEY, packCloset(r));
  out = await runDressingCalls([call({ action: "mirror" }, "b1")], d);
  ok(out[0].out.includes("衣柜：编的改名斗篷"), "改了名字：他照镜子看到的跟着换");
  ok(!s.m.get(CLOSET_KEY).includes("gone") && s.m.get(CLOSET_KEY) === packCloset(r), "衣柜那一条闹钟只读");
}

// ---------- 聊天里回屋看一眼 ----------
{
  const s = kv();
  let r = addItem(emptyCloset(), "accessory", { name: "编的发簪", description: "编的木头" }).rec;
  const gone = BASE_ITEMS.find((x) => x.category === "accessory" && x.base && !lockOf(r, x.id));
  r = dropItem(r, gone.id).rec;
  await s.set(CLOSET_KEY, packCloset(r));
  const io = { get: s.get, set: s.set, today: DAY, at: 1, chat: "c1", title: "t", on: true };
  const out = await runRoomCalls([{ id: "w1", name: "room_look", input: { what: "wardrobe" } }], io);
  ok(out[0].out.includes("编的发簪（编的木头）") && !out[0].out.includes(gone.name + "、") && !out[0].out.endsWith(gone.name), "翻衣柜：新加的带描述，删掉的不列");
  const look = { hair: "hair_loose", makeup: "makeup_bare", scent: "scent_none", outfits: [], bottoms: [], shoes: [], accessories: [r.add[0].id] };
  await s.set(DRESSING_KEY, JSON.stringify({ version: 1, initialized: true, appearance: look, touched: {}, unlockedAchievements: [], unlockedRewards: [], stats: {}, completedLook: { date: DAY, appearance: look }, dailyFinalLooks: [] }));
  const out2 = await runRoomCalls([{ id: "w2", name: "room_look", input: { what: "dressing" } }], io);
  ok(out2[0].out.includes("配饰：编的发簪"), "看妆台：今天那一身照这一份写名字");
  ok(lookLine(look, undefined, closetCatalog(r)) === "披发、素面、不熏香；配饰：编的发簪" && lookLine(look).includes(r.add[0].id), "那一行：照这一份写；不给就是一开始那一份（新加的只认得编号）");
  ok(deskCards({ garden: null, dressing: JSON.parse(s.m.get(DRESSING_KEY)), today: DAY, closet: r }).铜镜.note === "今天这一身：披发、素面、不熏香；配饰：编的发簪。", "推近铜镜的卡片：照这一份写");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
