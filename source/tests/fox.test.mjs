// 狐宇宙（他自己醒，见 src/fox.js、alarm/）：几点醒的规矩、[WAKE:…] 怎么拆怎么认、南衙那一行写什么、【醒来】那一段写什么。
// esbuild 打成一个文件在 Node 里跑（见 package.json 的 test:unit）
import { parseReply } from "../src/reply.js";
import { FOX_CHAT, isWakeMark, wakeText, wakeNote, wakeRecap, foxSub, alarmLine, alarmTrouble, whenText, gapOf, maxOf, wakeOn, ASLEEP_MS, taskNote, TASK_MIN_MS, TASK_MAX_ROUNDS } from "../src/fox.js";
import { needsReply } from "../src/thread.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildRows } from "../src/chat/rows.js";
import { makePreview } from "../src/chat/overview.js";
import { parseWake, splitWake, planNext, planTasks, nextChase, lastMark, fracOf, infoOf, RHYTHM_MIN, RHYTHM_MAX, RESUME_MIN, RESUME_MAX, PRESENT_PUSH, RETRY_MS, DAY_MS, OWED_MS, TASK_STALE } from "../alarm/plan.js";
import { wakeSection, taskSection, wakeNowNote, tailTranscript, agoText, HER_WORDS } from "../alarm/note.js";
import { doorsOf, idsDeep, putRows, putBlocks, toRescue, commitWake, owedOf, splitNewChat, splitGo, herLastOf, backOf, gather, normBundle, noCall, noAsk, askRoom, askTask } from "../alarm/wake.js";
import { ON_KEY } from "../src/game/jianghu.js";
import { loadSecret } from "../alarm/secret.js";
import { gardenOf, runGardenCalls, gardenBrief, gardenNote, GARDEN_KEY } from "../alarm/garden.js";
import { dressingOf, runDressingCalls, dressingBrief, dressingTool, lookLine, cutDressing, DRESSING_KEY } from "../alarm/dressing.js";
import { ITEMS as DRESS_ITEMS } from "../vendor/dressing/dressing-data.ts";
import { forkAt, markStopped } from "../src/thread.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let pass = 0, failN = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log("ok:", m);
  } else {
    failN++;
    console.log("FAIL:", m);
    if (process.env.KFS_FAILFAST) process.exit(1);
  }
};
const H = 3600 * 1000;
const M = 60 * 1000;
// 钉一个时刻：2026 年 10 月 20 日 14:00（照跑测试这台机器的钟点算，跟她电脑上一样：钟点按本地）
const at = (h, m = 0, d = 20) => new Date(2026, 9, d, h, m, 0, 0).getTime();

// ================= 拆：[WAKE:…] 不显示成字，单独带出去 =================
{
  const p = parseReply("<thinking>想她了</thinking>\n醒了，看看你\n[SPLIT]\n[MEME:a.jpg]\n[WAKE:+3h]");
  ok(p.wake === "+3h" && p.items.length === 2 && p.items[0].text === "醒了，看看你" && p.items[1].type === "meme" && !p.quiet && p.body.includes("[WAKE:+3h]"),
    "拆：单独一行的 [WAKE:…] 不显示成字，单独带出去；寄回去的原话（body）里还留着，他下回看得见自己定过什么");
  const q = parseReply("<thinking>她睡了，不吵她</thinking>\n[WAKE:07:30]");
  ok(q.wake === "07:30" && q.quiet === true && q.items.length === 1 && q.items[0].text === "……", "拆：只写了心里话和几点醒：照旧摆省略号，另记一笔 quiet（一个字没留）");
  const r = parseReply("句子中间的 [WAKE:+3h] 不算\n[wake：off]");
  ok(r.wake === "off" && r.items[0].text === "句子中间的 [WAKE:+3h] 不算", "拆：夹在句子里的不算，原样当字；小写、全角冒号的照认");
  const d = parseReply("[DOC:x.md]\n[WAKE:+1h]\n[/DOC]\n给你");
  ok(d.wake === undefined && d.items[0].type === "doc" && d.items[0].text.includes("[WAKE:+1h]"), "拆：文档里的不算");
  const two = parseReply("一\n[WAKE:+1h]\n二\n[WAKE:+2h]");
  ok(two.wake === "+2h" && two.items.map((x) => x.text).join("|") === "一\n二", "拆：写了好几回只认最后一回，摘掉那几行，前后的字接上");
  const plain = parseReply("在呢");
  ok(!("wake" in plain) && !("quiet" in plain), "拆：没写的，回来的样子跟原来一个字不差（不多出 wake、quiet 两样）");
}

// ================= 认：[WAKE:…] 里写的是几点 =================
{
  const from = at(14, 0);
  const W = (s) => parseWake(s, from);
  ok(W("+3h").at === from + 3 * H && W("3h").at === from + 3 * H && W("+40m").at === from + 40 * M && W("+1h30m").at === from + 90 * M && W("90m").at === from + 90 * M && W("+1.5h").at === from + 90 * M,
    "认：+3h、3h、+40m、+1h30m、90m、+1.5h");
  ok(W("3小时").at === from + 3 * H && W("3个钟头").at === from + 3 * H && W("40分钟").at === from + 40 * M && W("1小时30分").at === from + 90 * M && W(" + 2 h ").at === from + 2 * H,
    "认：中文的“3小时”“3个钟头”“40分钟”“1小时30分”，带空白的也认");
  ok(W("19:30").at === at(19, 30) && W("19：30").at === at(19, 30) && W("7:05").at === at(7, 5, 21), "认：钟点：今天还没到的就是今天；7:05 已经过了，是明天早上");
  ok(W("14:00").at === at(14, 0, 21) && W("14:01").at === at(14, 1, 21) && W("14:02").at === at(14, 2), "认：正好是这一分钟、下一分钟的，算明天（免得一写下就响）");
  ok(W("off").off && W("OFF").off && W("skip").off && W("不醒").off && W("等你").off && W("先不醒").off, "认：off、skip、不醒、等你、先不醒：先不自己醒");
  ok([W(""), W("明天"), W("+0m"), W("25:00"), W("12:61"), W("+8000h"), W("+3d"), W(null)].every((x) => x === null), "认：认不出的、零的、钟点不对的、远过七天的：回 null（照常醒）");
}

// ================= 几点醒 =================
{
  const now = at(14, 0);
  const base = { now, wakes: [], herLast: 0, mark: null, resumeAt: at(8, 0), gap: 30, max: 12, fails: [] };
  // 照常：她 13:00 说过话，他没醒过：13:00 往后两到四个钟头
  const p1 = planNext({ ...base, herLast: at(13, 0) });
  ok(p1.why === "rhythm" && p1.due >= at(15, 0) && p1.due <= at(17, 0) && p1.due === planNext({ ...base, herLast: at(13, 0) }).due,
    `几点醒：照常是从她最后说话那会儿算两到四个钟头（${new Date(p1.due).toTimeString().slice(0, 5)}），同一个起点算几遍都一样`);
  const spread = new Set(Array.from({ length: 40 }, (_, i) => Math.floor(fracOf(at(9, i)) * 10)));
  ok(spread.size >= 6, `几点醒：两到四个钟头里挑哪个点是散开的（四十个起点落进了 ${spread.size} 个十分之一里）`);
  // 他上回醒得比她最后说话晚：从他上回醒算
  const p2 = planNext({ ...base, herLast: at(9, 0), wakes: [at(12, 0)] });
  ok(p2.due >= at(12, 0) + RHYTHM_MIN && p2.due <= at(12, 0) + RHYTHM_MAX, "几点醒：她 9 点说的话、他 12 点醒过一回：从 12 点往后算");
  // 他自己定的
  const mark = { value: "+40m", ts: at(13, 50) };
  const p3 = planNext({ ...base, herLast: at(9, 0), wakes: [at(13, 49)], mark });
  ok(p3.why === "his" && p3.due === at(14, 30), "几点醒：他上回醒的时候写了 [WAKE:+40m]：照他的，14:30");
  const p4 = planNext({ ...base, herLast: at(13, 55), wakes: [at(13, 49)], mark });
  ok(p4.why !== "his", "几点醒：他写下以后她又来说过话：那一句作废，照常");
  const p5 = planNext({ ...base, herLast: at(9, 0), wakes: [at(13, 49), at(14, 31)], mark, now: at(14, 40) });
  ok(p5.why === "rhythm" && p5.due > at(14, 31) + RHYTHM_MIN - 1, "几点醒：写的那个钟点已经醒过了：作废，照常往后排");
  const off = planNext({ ...base, herLast: at(9, 0), wakes: [at(13, 49)], mark: { value: "off", ts: at(13, 50) } });
  const offBack = planNext({ ...base, herLast: at(13, 59), wakes: [at(13, 49)], mark: { value: "off", ts: at(13, 50) } });
  ok(off.due === null && off.why === "off" && offBack.due !== null, "几点醒：他写了 off：先不醒；她后来又说了话，照常醒");
  // 错过的不补
  const p6 = planNext({ ...base, herLast: at(6, 0), resumeAt: at(13, 0) });
  ok(p6.why === "resume" && p6.due >= at(13, 0) + RESUME_MIN && p6.due <= at(13, 0) + RESUME_MAX, "几点醒：该醒的那会儿笔记本关着（开机是 13:00）：不马上响，开机以后十分钟到一个钟头里挑一个点");
  const p6b = planNext({ ...base, herLast: at(9, 0), wakes: [at(9, 30)], mark: { value: "+1h", ts: at(9, 31) }, resumeAt: at(13, 0) });
  ok(p6b.why === "resume", "几点醒：他自己定的钟点也是一样，关机错过了不补");
  // 她在
  const p7 = planNext({ ...base, now: at(14, 0), herLast: at(13, 55), wakes: [at(10, 0)], mark: { value: "14:05", ts: at(10, 1) } });
  ok(p7.why !== "his", "几点醒：她 13:55 刚说过话：他 10 点定的 14:05 作废（她来过）");
  const p7b = planNext({ ...base, now: at(14, 0), herLast: at(13, 55), resumeAt: at(13, 54) });
  ok(p7b.due >= at(13, 55) + PRESENT_PUSH, "几点醒：她十五分钟以内刚说过话：最早也得是她最后那句之后半个钟头");
  // 两道闸
  const p8 = planNext({ ...base, herLast: at(9, 0), wakes: [at(13, 50)], mark: { value: "+5m", ts: at(13, 51) }, gap: 60 });
  ok(p8.why === "gap" && p8.due === at(14, 50), "几点醒：他定了五分钟以后，可两回之间最短隔一个钟头：14:50");
  const twelve = Array.from({ length: 12 }, (_, i) => at(2 + i, 0));
  const p9 = planNext({ ...base, now: at(14, 0), herLast: 0, wakes: twelve, mark: { value: "+30m", ts: at(13, 1) }, max: 12 });
  ok(p9.why === "cap" && p9.due === at(2, 0) + DAY_MS, "几点醒：往回数二十四个钟头已经醒满十二回：等最早那一回滑出去（明天两点）");
  const p9b = planNext({ ...base, now: at(14, 0), herLast: 0, wakes: twelve, mark: { value: "+30m", ts: at(13, 1) }, max: 24 });
  ok(p9b.why === "his", "几点醒：一天最多二十四回的话，还没醒满，照他的");
  // 没醒成
  const p10 = planNext({ ...base, herLast: at(9, 0), wakes: [], resumeAt: at(9, 0), fails: [at(13, 50)] });
  ok(p10.why === "retry" && p10.due === at(13, 50) + RETRY_MS, "几点醒：上一回没醒成：一刻钟以后再试");
  const p11 = planNext({ ...base, herLast: at(9, 0), wakes: [], resumeAt: at(9, 0), fails: [at(13, 20), at(13, 35), at(13, 50)] });
  ok(p11.due === at(13, 50) + RHYTHM_MIN, "几点醒：连着三回没醒成：歇两个钟头再试");
  // 第二道闸数的是闹钟叫过他的每一回（没醒成的、狐宇宙里那几行被盖掉了的也算）
  const six = Array.from({ length: 6 }, (_, i) => at(2 + i, 0));
  const sixMore = Array.from({ length: 6 }, (_, i) => at(8 + i, 0));
  const p12 = planNext({ ...base, now: at(14, 0), herLast: 0, wakes: six, tries: six.concat(sixMore), mark: { value: "+30m", ts: at(13, 1) }, max: 12 });
  ok(p12.why === "cap" && p12.due === at(2, 0) + DAY_MS, "几点醒：狐宇宙里只看得见六回，可闹钟这一天叫过他十二回（六回没醒成）：也算醒满了");
  const p13 = planNext({ ...base, now: at(14, 0), herLast: 0, wakes: six, tries: six, mark: { value: "+30m", ts: at(13, 1) }, max: 12 });
  ok(p13.why === "his", "几点醒：叫过的那几回跟狐宇宙里的是同一回的，不重复数");
  // 她在狐宇宙里说的那句还没回上（回话多半在信箱里）：先不醒；搁了三天以上（信箱里的信早收了）不等了
  const p14 = planNext({ ...base, now: at(14, 0), herLast: at(13, 0), owed: at(13, 0) });
  const p15 = planNext({ ...base, now: at(14, 0), herLast: at(13, 0), owed: at(14, 0) - OWED_MS - 1 });
  ok(p14.due === null && p14.why === "owed" && p15.why !== "owed" && p15.due > 0, "几点醒：狐宇宙里她那句还没回上，先不醒（不然回话放不进来）；搁了三天以上不等了");
  // 从对话里认最近一回他写的
  const msgs = [
    { id: "a", role: "him", ts: 1, wake: "+1h" },
    { id: "b", role: "her", ts: 2 },
    { id: "c", role: "event", kind: "wake", ts: 3, quiet: true, wake: "off" },
    { id: "d", role: "him", ts: 4 },
  ];
  ok(JSON.stringify(lastMark(msgs)) === JSON.stringify({ value: "off", ts: 3 }) && lastMark([{ role: "her", wake: "+1h" }]) === null && lastMark([]) === null, "几点醒：最近那一回他写的（他的话、醒了那一行上记着的都算；她的不算）");
}

// ================= 聊天里那一行、寄给他的那一行、抄提要的那一行 =================
{
  const ev = { id: "w1", role: "event", who: "him", kind: "wake", ts: at(14, 2) };
  const qv = { ...ev, id: "w2", quiet: true };
  ok(isWakeMark(ev) && !isWakeMark({ role: "event", who: "her" }) && !isWakeMark({ role: "event", kind: "call" }), "醒了那一行：认得出（换头像那种、通话那种不算）");
  ok(wakeText(ev) === "光义醒了" && wakeText(qv) === "光义醒了一会儿，没留话" && wakeNote(ev) === "[开封府提示：14:02 你自己醒了一回]" && wakeNote(qv).includes("什么也没说") && wakeRecap(qv) === "[光义自己醒了一回，没留话]",
    "醒了那一行：聊天里、寄给他、抄提要，各写各的");
  const rows = buildRows([ev, { id: "h1", role: "him", ts: at(14, 3), items: [{ type: "text", text: "醒了" }] }, qv], null);
  const notices = rows.filter((r) => r.type === "notice");
  ok(notices.length === 2 && notices[0].kind === "wake" && notices[0].who === "him" && notices[0].text === "光义醒了" && notices[1].text.includes("没留话") && rows.some((r) => r.type === "bubble"),
    "聊天里：醒了那一行是一行小字（前面是他的头像），他说的话照常是气泡");
  const { messages } = buildMessages([{ id: "x", role: "her", ts: at(13, 0), text: "睡了" }, ev, { id: "h1", role: "him", ts: at(14, 3), raw: "醒了", items: [{ type: "text", text: "醒了" }] }, qv], { her: null, him: null }, () => null);
  const flat = JSON.stringify(messages);
  ok(flat.includes("[开封府提示：14:02 你自己醒了一回]") && flat.includes("那一回什么也没说") && !flat.includes("卿卿刚刚把头像换"), "寄给他：醒了那一行是一句开封府提示，不会被当成她换了头像");
  ok(makePreview([ev]) === "[醒了]" && makePreview([qv]) === "[醒了一会儿]", "目录里的那一句：最后是醒了那一行的，写“醒了”");
}

// ================= 南衙那一行、账户面板那一句 =================
{
  const now = at(14, 0);
  ok(foxSub({ on: false, state: null, now }) === "还没让他自己醒" && foxSub({ on: true, state: null, now }) === "等家里的闹钟装好", "南衙那一行：没开、开了闹钟还没装");
  ok(foxSub({ on: true, state: { at: now - ASLEEP_MS - 1, next: at(15, 0) }, now }) === "笔记本睡着，他也睡着", "南衙那一行：闹钟二十五分钟没出声：笔记本睡着");
  ok(foxSub({ on: true, state: { at: now - 60000, next: at(17, 20) }, now }) === "睡着，约 17:20 醒" && foxSub({ on: true, state: { at: now, next: at(7, 30, 21) }, now }) === "睡着，约 明天 07:30 醒" && foxSub({ on: true, state: { at: now, off: true }, now }) === "睡着，等你来过再醒" && foxSub({ on: true, state: { at: now, awake: true }, now }) === "醒着",
    "南衙那一行：睡着、几点醒（明天的写明天）、他说先不醒、正醒着");
  ok(foxSub({ on: true, state: { at: now, next: at(17, 20) }, unseen: 3, now }) === "睡着，约 17:20 醒", "南衙那一行：屋里的动静不提（她 22:04 定的：不亮红点、不说“他留了话没看”）");
  ok(alarmLine(null, now) === "家里的闹钟还没装" && alarmLine({ at: now, last: at(13, 2), next: at(16, 40) }, now) === "闹钟在跑：上回 13:02 醒，下回约 16:40" && alarmLine({ at: now }, now) === "闹钟在跑：还没醒过" && alarmLine({ at: now - ASLEEP_MS - 1 }, now).startsWith("笔记本睡着了"),
    "账户面板那一句：没装、在跑（上回、下回）、还没醒过、笔记本睡着");
  ok(alarmTrouble(null, now) === "家里的闹钟还没装" && alarmTrouble({ at: now - ASLEEP_MS - 1 }, now).startsWith("笔记本睡着了") && alarmTrouble({ at: now, last: at(13, 2), next: at(16, 40) }, now) === "" && alarmTrouble({ at: now, awake: true }, now) === "",
    "账户面板里只在出了岔子的时候写（10 月 30 日起）：没装、笔记本睡着了；好好在跑的不写");
  ok(whenText(at(9, 5, 19), now) === "昨天 09:05" && whenText(at(9, 5, 25), now) === "10月25日 09:05", "几点：昨天、再远的写几月几日");
  ok(gapOf({}) === 30 && gapOf({ wakeGap: 120 }) === 120 && gapOf({ wakeGap: 7 }) === 30 && maxOf({}) === 12 && maxOf({ wakeMax: 6 }) === 6 && maxOf({ wakeMax: "24" }) === 24 && !wakeOn({}) && wakeOn({ wake: true }) && !wakeOn({ wake: "yes" }),
    "两道闸：没挑过是半个钟头、十二回；挑的不是那几档的不认；“他自己醒”只认 true");
}

// ================= 闹钟往狐宇宙里放、敲哪几台手机 =================
{
  const kv = (init) => {
    const m = new Map(Object.entries(init));
    return { m, get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => void m.set(k, v) };
  };
  // 翻过去的那几支里的编号也算（重新回答、改她的话，后面的收进 alts）
  const chat = [
    { id: "e1", role: "event", kind: "wake", ts: 1 },
    { id: "h1", role: "her", ts: 2, text: "在吗" },
    { id: "g1", role: "him", ts: 3, items: [] },
  ];
  const forked = forkAt(chat, 1, { id: "h2", role: "her", ts: 2, text: "改过的" });
  ok(forked.length === 2 && [...idsDeep(forked)].sort().join() === "e1,g1,h1,h2", "核对：她改了自己的话，后面的那几条收进了翻过去的那一支，编号照样认得出来");
  // 放进去：原有的编号带回去（核对用，不算这几行自己）；按时间插；目录跟着改
  const s1 = kv({ "kfs2:chat:hyz": JSON.stringify(chat), "kfs2:index": JSON.stringify([{ id: "c1", title: "周末", updatedAt: 5 }]) });
  const r1 = await putRows(s1, [{ id: "e2", role: "event", kind: "wake", ts: 10 }, { id: "g2", role: "him", ts: 11, items: [{ type: "text", text: "醒了" }] }]);
  const after1 = JSON.parse(s1.m.get("kfs2:chat:hyz"));
  const idx1 = JSON.parse(s1.m.get("kfs2:index"));
  ok(r1.added === 2 && r1.base.join() === "e1,h1,g1" && after1.map((m) => m.id).join() === "e1,h1,g1,e2,g2" && idx1[0].id === "hyz" && idx1[0].title === "狐宇宙" && idx1[1].id === "c1",
    "放进狐宇宙：接在后面，带回原有的那几个编号；目录里狐宇宙那一条排到最前，原来的还在");
  // 再放一遍同样的：一行不重复；上回放进去了、目录没跟上（写到一半断了网），这回补上
  const s2 = kv({ "kfs2:chat:hyz": s1.m.get("kfs2:chat:hyz"), "kfs2:index": JSON.stringify([{ id: "c1", title: "周末", updatedAt: 5 }]) });
  const r2 = await putRows(s2, [{ id: "e2", role: "event", kind: "wake", ts: 10 }]);
  ok(r2.added === 0 && JSON.parse(s2.m.get("kfs2:chat:hyz")).length === 5 && JSON.parse(s2.m.get("kfs2:index"))[0].id === "hyz", "放第二遍：已经在的不重复放，目录没跟上的补上");
  // 狐宇宙那段对话读出来不对（不是一串）：不接着写（写上去的会是只有新几行的一份，把好好的盖掉）
  const s3 = kv({ "kfs2:chat:hyz": '{"oops":1}', "kfs2:index": "[]" });
  let threw = null;
  try {
    await putRows(s3, [{ id: "x", role: "him", ts: 1, items: [] }]);
  } catch (e) {
    threw = e;
  }
  ok(threw && threw.code === "store" && s3.m.get("kfs2:chat:hyz") === '{"oops":1}', "放进狐宇宙：那段对话读出来不对，一个字不写，照实报错");
  // 敲哪几台：新报的排前头、登记簿里没有了的不敲、头一版光存门牌号的也认、最多五台
  const doorStore = kv({
    "kfs2:fox:doors": JSON.stringify({
      old: "https://push.example/legacy",
      a: { e: "https://push.example/a", at: 100 },
      b: { e: "https://push.example/b", at: 300 },
      gone: { e: "https://push.example/gone", at: 400 },
      bad: { at: 500 },
    }),
  });
  const known = { endpoints: async () => ["https://push.example/a", "https://push.example/b", "https://push.example/legacy"] };
  const d1 = await doorsOf(doorStore, known);
  ok(d1.join() === "https://push.example/b,https://push.example/a,https://push.example/legacy", `敲哪几台：新报的排前头，登记簿里没有了的不敲，光存门牌号的也认（${d1.join(" ")}）`);
  const d2 = await doorsOf(doorStore, { endpoints: async () => { throw new Error("断网"); } });
  ok(d2[0] === "https://push.example/gone" && d2.length === 4, "敲哪几台：登记簿一时问不到，报上来的照新旧都递过去（push 函数自己还会照登记簿再筛一遍）");
  const many = {};
  for (let i = 0; i < 8; i++) many["d" + i] = { e: "https://push.example/" + i, at: i };
  const d3 = await doorsOf(kv({ "kfs2:fox:doors": JSON.stringify(many) }), { endpoints: async () => Object.values(many).map((x) => x.e) });
  ok(d3.length === 5 && d3[0] === "https://push.example/7", "敲哪几台：最多五台（push 函数一次最多敲五台），新报的先敲");
}

// ================= 回头核对、再放一遍、凭据的毛病 =================
{
  const kv = (init) => {
    const m = new Map(Object.entries(init));
    return { m, get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => void m.set(k, v), del: async (k) => void m.delete(k) };
  };
  // 回头核对：哪几包放回去
  const list = [
    { ids: ["e2", "g2"], base: ["e1", "h1"] }, // 手机那头没看见就写的：原有的还在，这一包一行没有 → 放回去
    { ids: ["e3"], base: [] }, // 放之前狐宇宙是空的：分不清是不是删了重开 → 不放
    { ids: ["e4", "g4"], base: ["x9"] }, // 原有的一个不在：删了又重开的 → 不放
    { ids: ["e5"], base: ["e1"] }, // 这一包还在（收进了翻过去的那一支）→ 写的那头看过，不放
  ];
  const cur = forkAt([{ id: "e1", role: "event", kind: "wake" }, { id: "h1", role: "her" }, { id: "e5", role: "event", kind: "wake" }], 1, { id: "h1b", role: "her" });
  const rescued = toRescue(list, cur);
  ok(rescued.length === 1 && rescued[0].ids[0] === "e2", "回头核对：只放回“没看见就写”的那一包；她删了重开的、放之前是空的、收进翻过去那一支的，都不放");
  // 那段对话一写上就报（目录还没写上、写目录的时候断了网也报过了）：闹钟马上记下“这一份是自己写的”
  const chat = [
    { id: "e1", role: "event", kind: "wake", ts: 1 },
    { id: "h1", role: "her", ts: 2, text: "在吗" },
    { id: "g1", role: "him", ts: 3, items: [] },
  ];
  const s4 = kv({ "kfs2:chat:hyz": JSON.stringify(chat) });
  s4.set = async (k, v) => {
    if (k === "kfs2:index") throw Object.assign(new Error("断网"), { code: "store" });
    s4.m.set(k, v);
  };
  let heard = null;
  let threw4 = null;
  try {
    await putRows(s4, [{ id: "e9", role: "event", kind: "wake", ts: 20 }], async (b) => {
      heard = b;
    });
  } catch (e) {
    threw4 = e;
  }
  ok(threw4 && heard && heard.join() === "e1,h1,g1" && JSON.parse(s4.m.get("kfs2:chat:hyz")).some((m) => m.id === "e9"), "放进狐宇宙：对话写上了、目录没写上：对话那一下已经报过了（闹钟不会把自己写的那一份当成手机那头写的）");
  // 他醒着的工夫里她在狐宇宙说了一句（还没回上）：他这一回的几行挨在一起排在她那句前面，她那句还是最后一句（信箱里的回话放得进来）
  const s6 = kv({ "kfs2:chat:hyz": JSON.stringify(chat.concat([{ id: "hN", role: "her", ts: 50, text: "你醒啦？" }])), "kfs2:index": "[]" });
  await putRows(s6, [{ id: "eW", role: "event", kind: "wake", ts: 40 }, { id: "gW", role: "him", ts: 60, items: [{ type: "text", text: "醒了" }] }]);
  const after6 = JSON.parse(s6.m.get("kfs2:chat:hyz"));
  ok(after6.map((m) => m.id).join() === "e1,h1,g1,eW,gW,hN" && owedOf(after6) === 50, `放进狐宇宙：一回醒来的几行挨在一起，不把她醒着的工夫里说的那句夹在中间（${after6.map((m) => m.id).join(" ")}）`);
  // 还欠着她的：她的话、他说到一半的；她按了停的不算（不会有回话了）
  const stoppedChat = markStopped(chat.concat([{ id: "h2", role: "her", ts: 70, text: "算了不用回" }]));
  ok(owedOf(chat) === 0 && owedOf(chat.concat([{ id: "h2", role: "her", ts: 70 }, { id: "eX", role: "event", kind: "wake", ts: 80 }])) === 70 && owedOf(stoppedChat) === 0,
    "还欠着她一句：最后（不算醒了那几行）是她的话才算；她按了停的不算");
  // 再放一遍：放过的不再放、用量不再记、敲过的横幅不再敲，接着敲没敲的
  const seen = { pull: 0, sets: [], push: [] };
  const s5 = kv({ "kfs2:chat:hyz": JSON.stringify(chat), "kfs2:index": "[]", "kfs2:fox:doors": JSON.stringify({ d: { e: "https://push.example/a", at: 1 } }) });
  const set5 = s5.set;
  s5.set = async (k, v) => {
    seen.sets.push(k);
    return set5(k, v);
  };
  s5.pull = async () => void seen.pull++;
  s5.nameFor = async (n) => "h_" + Buffer.from(n).toString("hex");
  const cloud5 = { push: async (p) => (seen.push.push(p.reply), { queued: 1 }), endpoints: async () => ["https://push.example/a"] };
  const bundle = { v: 2, at: Date.now(), kind: "room", puts: [{ chat: "n1", create: true, title: "想你", rows: [{ id: "e7", role: "event", kind: "wake", ts: 30, hidden: true }] }], knocks: [{ chat: "n1", texts: ["一", "二", "三"] }], tasks: [], title: "光义", newAvatar: { type: "meme", file: "a.jpg" }, newName: null, cost: 0.01, steps: 1, quiet: false };
  const marks = [];
  const r5 = await commitWake({ store: s5, cloud: cloud5, bundle, done: { put0: true, usage: true, avatar: true, "said:n1": 1, knocked: 1 }, mark: async (step, v, extra) => void marks.push([step, v, extra]) });
  ok(seen.pull === 0 && seen.sets.length === 0 && seen.push.join() === "二,三" && r5.knocked === 3 && marks.some((x) => x[0] === "said:n1" && x[1] === 3),
    `再放一遍（上回办到一半）：不再放进对话、不再换头像、不再记用量，横幅接着敲没敲的那两条（敲了：${seen.push.join("、")}）`);
  // 头一版问到、还没放完的那一包（只放狐宇宙、说过的话要敲）：照新样子摆，屋里的动静不敲（她 22:04 定的）
  const oldOne = normBundle({ at: 1, rows: [{ id: "e1" }], say: ["在吗"], quiet: false });
  ok(oldOne.puts.length === 1 && oldOne.puts[0].chat === "hyz" && oldOne.knocks.length === 0, "头一版的那一包：照新样子放进狐宇宙，不敲她");
  // 凭据的毛病：没装、解不开（换了账户）、明文却没点名，是长久的；PowerShell 起不来是一时的
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kfs-secret-"));
  const codeOf = async (f) => {
    try {
      await loadSecret(f);
      return "";
    } catch (e) {
      return e.code || "";
    }
  };
  fs.writeFileSync(path.join(dir, "d.txt"), "dpapi:AAAA");
  fs.writeFileSync(path.join(dir, "p.txt"), "plain:" + Buffer.from("{}").toString("base64"));
  const codes = [await codeOf(path.join(dir, "none.txt")), await codeOf(path.join(dir, "d.txt")), await codeOf(path.join(dir, "p.txt"))];
  fs.rmSync(dir, { recursive: true, force: true });
  ok(codes.join() === "secret,secret-retry,secret", `凭据：没装、明文没点名的是长久的毛病（闹钟退出）；PowerShell 起不来是一时的（过一会儿再试）（${codes.join("、")}）`);
}

// ================= 任务标记、开新对话、便签纸 =================
{
  const H = 3600 * 1000;
  const M = 60 * 1000;
  // [WAKE:…] 里的时间和他记着的那句话
  ok(JSON.stringify(splitWake("+1h 活捉Valerie")) === JSON.stringify({ when: "+1h", label: "活捉Valerie" }) && JSON.stringify(splitWake("07:30")) === JSON.stringify({ when: "07:30", label: "" }) && splitWake("+40m  去找 卿卿 ").label === "去找 卿卿" && parseWake(splitWake("+1h 活捉Valerie").when, 1000) && parseWake(splitWake("+1h 活捉Valerie").when, 1000).at === 1000 + H,
    "任务标记：[WAKE:+1h 活捉Valerie] 前面是几点，后面是他记着的一句话");
  // 钟点中间有空格的（3 小时、+1h 30m）照认，后面的才是那句话
  const sp1 = splitWake("3 小时");
  const sp2 = splitWake("+1h 30m 洗完澡来找");
  const sp3 = splitWake("off 不找了");
  const sp4 = splitWake("明天见 你");
  ok(parseWake(sp1.when, 0).at === 3 * H && sp1.label === "" && parseWake(sp2.when, 0).at === 90 * M && sp2.label === "洗完澡来找" && parseWake(sp3.when, 0).off && sp3.label === "不找了" && !parseWake(sp4.when, 0) && sp4.label === "你",
    "[WAKE:…] 拆两截：钟点中间有空格也认（3 小时、+1h 30m），剩下的是那句话；认不出的照常");
  // 平常那种自己醒：他写的带了一句话也照认
  const p0 = planNext({ now: at(14, 0), herLast: at(9, 0), wakes: [at(13, 49)], mark: { value: "+40m 看看她", ts: at(13, 50) }, resumeAt: at(8, 0) });
  ok(p0.why === "his" && p0.due === at(14, 30), "几点醒：他写的 [WAKE:+40m 看看她] 照认四十分钟以后");
  // 一段对话的样子：c1 里他定闹钟的那一条 g1 摆在外面；她在那一条后面说没说过话，看排在哪儿（不看钟点）
  const info = (map) => (id) => (map[id] ? infoOf(map[id]) : null);
  const her = (id, ts, extra = {}) => ({ id, role: "her", ts, text: "嗯", ...extra });
  const him = (id, ts, extra = {}) => ({ id, role: "him", ts, items: [{ type: "text", text: "好" }], ...extra });
  const base = { now: at(14, 30) };
  const t1 = { key: "kfs2:fox:task:g1", chat: "c1", from: "g1", raw: "+1h 去找卿卿", set: at(14, 0) };
  const c1 = [her("h1", at(13, 59)), him("g1", at(14, 0))];
  const r1 = planTasks({ ...base, tasks: [t1], info: info({ c1 }) });
  ok(r1.task === t1 && r1.due === at(15, 0) && !r1.changes.length, "任务：到点之前等着（定的那一刻往后一个钟头）");
  const early = planTasks({ ...base, tasks: [t1], info: info({ c1: c1.concat([her("h2", at(14, 20))]) }) });
  const gone = planTasks({ ...base, tasks: [t1], info: info({}) });
  const regen = planTasks({ ...base, tasks: [t1], info: info({ c1: [her("h1", at(13, 59)), him("g9", at(14, 0))] }) });
  const stale = planTasks({ now: at(14, 0) + TASK_STALE + 1, tasks: [{ ...t1, raw: "+8h" }], info: info({ c1 }) });
  const bad = planTasks({ ...base, tasks: [{ ...t1, raw: "明天见 你" }], info: info({ c1 }) });
  ok(early.changes[0].state === "void" && /先回来/.test(early.changes[0].why) && gone.changes[0].state === "void" && regen.changes[0].state === "void" && stale.changes[0].state === "void" && bad.changes[0].state === "void" && early.task === null,
    "任务作废：没到点她先回来了、那段对话删了、他定闹钟的那一条不在了（重新回答翻过去了）、七天还没办、写的钟点认不出");
  // 她那句信号不好、晚到了（手机记的钟点比他那一条还早，排在后面）：也算她回来了；她在狐宇宙便签纸上留的不算
  const lateNet = planTasks({ ...base, tasks: [t1], info: info({ c1: c1.concat([her("h2", at(13, 58))]) }) });
  const noteOnly = planTasks({ ...base, tasks: [t1], info: info({ c1: c1.concat([her("n2", at(14, 10), { note: true })]) }) });
  ok(lateNet.changes[0] && lateNet.changes[0].state === "void" && noteOnly.task === t1 && !noteOnly.changes.length, "任务：她回没回看排在哪儿（晚到的那句钟点早也算），不看钟点");
  // 闹钟睡着的时候过了点（笔记本合着、关着，“他自己醒”关着）：醒过来以后不补；刚醒过来、过点没多久的照办
  const slept = planTasks({ now: at(23, 0), resumeAt: at(22, 50), tasks: [t1], info: info({ c1 }) });
  const nap = planTasks({ now: at(15, 10), resumeAt: at(15, 5), tasks: [t1], info: info({ c1 }) });
  ok(slept.changes[0] && slept.changes[0].state === "void" && /睡着/.test(slept.changes[0].why) && nap.task === t1 && nap.due === at(15, 0), "任务：闹钟睡着的时候过了点的，醒过来不补；睡了一小会儿、过点没多久的照办");
  // 他那一条放进对话的时候已经到点了（回话在信箱里搁着，她回来才放进来）：她都回来了，不办
  const placedLate = planTasks({ now: at(15, 10), tasks: [{ ...t1, placed: at(15, 5) }], info: info({ c1 }) });
  const placedNow = planTasks({ ...base, tasks: [{ ...t1, placed: at(14, 1) }], info: info({ c1 }) });
  const placedJust = planTasks({ ...base, tasks: [{ ...t1, raw: "+1m", placed: at(14, 0) + 1000 }], info: info({ c1 }) });
  ok(placedLate.changes[0] && placedLate.changes[0].state === "void" && placedNow.task && placedNow.due === at(15, 0) && placedJust.task && !placedJust.changes.length,
    "任务：放进对话的时候已经过了点，不办；当场放进来的照常等着（定得再近，一分钟以后的也一样）");
  // 信箱里取出来的那一条（记着是哪一回 job，还没有编号）：认 job
  const tj = { key: "kfs2:fox:task:JOB1", chat: "c3", job: "JOB1", raw: "+1h", set: at(14, 0) };
  const rj = planTasks({ ...base, tasks: [tj], info: info({ c3: [her("h1", at(13, 59)), him("gx", at(14, 0), { job: "JOB1" })] }) });
  ok(rj.task === tj && rj.due === at(15, 0), "任务：他那一条是信箱里取出来的，认那一回的 job");
  // 追着她
  const c2 = { key: "kfs2:fox:task:g2", chat: "c2", from: "g2", raw: "+1h", set: at(13, 0), state: "chase", started: at(14, 0), rounds: 2, last: at(14, 20), next: at(14, 22) };
  const chat2 = [her("h0", at(12, 59)), him("g2", at(13, 0)), { id: "w1", role: "event", kind: "wake", ts: at(14, 0), hidden: true }, him("g3", at(14, 0))];
  const r2 = planTasks({ ...base, tasks: [c2], info: info({ c2: chat2 }) });
  ok(r2.task === c2 && r2.due === at(14, 20) + TASK_MIN_MS, "追着她：照他说的下回几点，最短隔五分钟");
  const replied = planTasks({ ...base, tasks: [c2], info: info({ c2: chat2.concat([her("h9", at(14, 25))]) }) });
  const repliedLate = planTasks({ ...base, tasks: [c2], info: info({ c2: chat2.concat([her("h9", at(13, 50))]) }) });
  const full = planTasks({ ...base, tasks: [{ ...c2, rounds: TASK_MAX_ROUNDS }], info: info({ c2: chat2 }) });
  const quit = planTasks({ ...base, tasks: [{ ...c2, next: 0 }], info: info({ c2: chat2 }) });
  ok(replied.changes[0].state === "done" && /她回了/.test(replied.changes[0].why) && repliedLate.changes[0].state === "done" && full.changes[0].state === "done" && quit.changes[0].state === "done",
    "追着她：她一回那段对话就停（她那句晚到、钟点比他醒来还早也算）；追满十二回停；他没说再追就停");
  const day = planTasks({ now: at(14, 0) + DAY_MS + 1, tasks: [{ ...c2, next: at(14, 0) + DAY_MS }], info: info({ c2: chat2 }) });
  const sleptC = planTasks({ now: at(20, 0), resumeAt: at(19, 0), tasks: [c2], info: info({ c2: chat2 }) });
  const lostFrom = planTasks({ ...base, tasks: [c2], info: info({ c2: [her("h0", at(12, 59))] }) });
  ok(day.changes[0] && day.changes[0].state === "done" && /一整天/.test(day.changes[0].why) && sleptC.changes[0] && sleptC.changes[0].state === "done" && lostFrom.changes[0] && lostFrom.changes[0].state === "done",
    "追着她：追了一整天还没回、闹钟睡着的时候过了点、他定闹钟的那一条没了：都不追了");
  const old = planTasks({ now: at(14, 0) + 3 * DAY_MS, tasks: [{ ...c2, state: "done", endedAt: at(14, 0) }], info: info({}) });
  ok(old.changes[0].state === "drop", "办完了的任务留两天再删（手机那头不会把它当成新的再记一回）");
  ok(nextChase("+5m", 1000) === 1000 + 5 * M && nextChase("+1m", 1000) === 1000 + TASK_MIN_MS && nextChase("off", 1000) === 0 && nextChase(null, 1000) === 0 && nextChase("+10m 再打一次", 1000) === 1000 + 10 * M,
    "接着追：他写的下回几点，最短五分钟；off、没写就不追了");
  // 开新对话
  const cut = splitNewChat("<thinking>想她了</thinking>\n屋里有点冷\n[新对话:想你了]\n在干嘛\n[SPLIT]\n理理我");
  ok(cut && cut.title === "想你了" && cut.before.endsWith("屋里有点冷") && cut.after === "在干嘛\n[SPLIT]\n理理我" && splitNewChat("说到 [新对话:x] 这个") === null && splitNewChat("没有") === null,
    "开新对话：单独一行的 [新对话:名字]，前面的留在屋里，后面的落进新对话；夹在句子里的不算");
  // 心里话、文档块里写的不算（不然从心里话中间切开，后半截心里话就露给她了）；名字长了取头三十个；后面又写了一回的摘掉
  const inThought = splitNewChat("<thinking>要不要去找她？\n[新对话:晚安]\n还是别吵她了</thinking>\n今天看了会儿书");
  const openThought = splitNewChat("今天看了会儿书\n<thinking>要不要去找她？\n[新对话:晚安]\n算了");
  const inDoc = splitNewChat("写了一份\n[DOC:草稿.md]\n[新对话:x]\n[/DOC]\n好了");
  const afterDoc = splitNewChat("[DOC:草稿.md]\n一\n[/DOC]\n[新对话:看看这个]\n给你写的");
  const longT = splitNewChat("想你\n[新对话:" + "长".repeat(50) + "]\n在吗");
  const twice = splitNewChat("想你\n[新对话:一]\n在吗\n[新对话:二]\n理理我");
  ok(inThought === null && openThought === null && inDoc === null && afterDoc && afterDoc.title === "看看这个" && afterDoc.before.includes("[/DOC]") && longT && longT.title === "长".repeat(30) && twice && twice.title === "一" && twice.after === "在吗\n\n理理我",
    "开新对话：心里话、文档块里写的不算；名字长了取头三十个；后面又写了一回的摘掉，不摆成字");
  // 屋里打不了电话：打电话那一截留成纸上的字
  const called = noCall({ text: "", quiet: false, him: { id: "g", items: [{ type: "text", text: "睡不着" }, { type: "call", text: "喂，在吗" }] } });
  const onlyCall = noCall({ text: "", quiet: false, him: { id: "g", items: [{ type: "call", text: "" }] } });
  ok(called.him.items.map((x) => x.type + ":" + x.text).join("|") === "text:睡不着|text:喂，在吗" && onlyCall.quiet === true && onlyCall.him.items[0].text === "……",
    "屋里打不了电话：打电话那一截留成纸上的字；什么都不剩的那一步当没写字");
  // 屋里也弹不了选项卡：卡片换成纸上的一行字（题目、选项照写）
  const asked = noAsk({ text: "", quiet: false, him: { id: "g", items: [{ type: "text", text: "想问她" }, { type: "ask", qs: [{ q: "明天吃什么？", multi: false, opts: [{ t: "面" }, { t: "饭" }] }] }] } });
  const plain = { text: "", quiet: false, him: { id: "g", items: [{ type: "text", text: "没卡" }] } };
  ok(asked.him.items.map((x) => x.type + ":" + x.text).join("|") === "text:想问她|text:[选项卡] 明天吃什么？（面／饭）" && noAsk(plain) === plain,
    "屋里弹不了选项卡：卡片换成纸上一行字，题目、选项照写；没有卡的原样不动");
  // 狐宇宙里那几行、别的对话里她看不见的那一行
  const go = { id: "w", role: "event", kind: "wake", ts: at(21, 0), go: { chat: "c1", title: "洗澡", how: "task" } };
  const goNew = { ...go, go: { chat: "n1", title: "想你了", how: "new" } };
  const hid = { id: "x", role: "event", kind: "wake", ts: at(21, 0), hidden: true, task: "去找卿卿" };
  const hidNew = { id: "y", role: "event", kind: "wake", ts: at(21, 0), hidden: true };
  ok(wakeText(go) === "光义醒了，去《洗澡》找你了" && wakeText(goNew) === "光义醒了，开了一段新对话《想你了》找你" && wakeText({ ...go, quiet: true }).includes("看了看，没说话"),
    "狐宇宙里那一行：去《××》找你了、开了一段新对话《××》找你");
  ok(wakeNote(hid).includes("你在这段对话里定的闹钟到点了") && wakeNote(hid).includes("“去找卿卿”") && wakeNote(hidNew).includes("这段对话是你 21:00 自己醒来开的") && wakeNote(go).includes("去《洗澡》找她"),
    "寄给他的那一行：别的对话里那一行他看得见（闹钟到点了、这段是你自己开的）");
  const rowsX = buildRows([{ id: "g1", role: "him", ts: 1, items: [{ type: "text", text: "在" }] }, hid], { her: null, him: null }, () => null);
  ok(!rowsX.some((r) => r.type === "notice" && r.kind === "wake") && !rowsX.some((r) => r.type === "sep" && r.key === "sep-x") && makePreview([{ id: "g1", role: "him", ts: 1, items: [{ type: "text", text: "在吗" }] }, hid]) === "在吗",
    "她看不见的那一行：聊天里不摆，也不冒一行时间；目录里的预览也跳过它");
  // 前情提要正好抄到她看不见的那一行：那一行小字照摆
  const rowsR = buildRows([{ id: "g1", role: "him", ts: 1, items: [{ type: "text", text: "在" }] }, hid], null, "", { upto: "x", text: "提要" });
  ok(rowsR.some((r) => r.type === "recap" && r.key === "rc-x"), "前情提要抄到她看不见的那一行：“前情提要”那一行小字照摆");
  // 便签纸：她来他屋里留的那一句不算跟他说话（不等回、不挡着他醒）
  const notes = [{ id: "g1", role: "him", ts: 1, items: [] }, { id: "n1", role: "her", ts: 2, text: "来过", note: true }];
  ok(!needsReply(notes) && owedOf(notes) === 0 && needsReply(notes.concat([{ id: "h3", role: "her", ts: 3, text: "在吗" }])), "便签纸：她留的那一句不算欠着她的回话");
  const packed = buildMessages(notes, { her: null, him: null }, () => null, () => null, () => null, () => null, {}).messages;
  ok(JSON.stringify(packed).includes("在便签纸上留了一句：来过"), "便签纸：寄给他的时候照实说她来屋里留了一句");
  ok(taskNote("卿卿").includes("[WAKE:+1h 去找卿卿]") && taskNote("卿卿").includes("她看不见") && taskNote("卿卿").includes("作废"), "平常的对话里【此刻】后面附的那一段：怎么定闹钟、她看不见、她先回来就作废");
  // 放进一段新开的对话：名字是他起的；放进原来的对话：名字照旧、预览跟着改；对话没了不放
  const kv2 = (init) => {
    const m = new Map(Object.entries(init));
    return { m, get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => void m.set(k, v) };
  };
  const s7 = kv2({ "kfs2:index": JSON.stringify([{ id: "c1", title: "洗澡", preview: "去吧", updatedAt: 1 }]), "kfs2:chat:c1": JSON.stringify([{ id: "h1", role: "her", ts: 1, text: "洗澡去" }]) });
  await putBlocks(s7, "n1", [[{ id: "y", role: "event", kind: "wake", ts: 5, hidden: true }, { id: "g5", role: "him", ts: 6, items: [{ type: "text", text: "在干嘛" }] }]], null, { title: "想你了", create: true });
  await putBlocks(s7, "c1", [[{ id: "x", role: "event", kind: "wake", ts: 7, hidden: true }, { id: "g7", role: "him", ts: 8, items: [{ type: "text", text: "洗好了没" }] }]]);
  const gone7 = await putBlocks(s7, "c9", [[{ id: "z", role: "him", ts: 9, items: [] }]]);
  const idx7 = JSON.parse(s7.m.get("kfs2:index"));
  ok(idx7[0].id === "c1" && idx7[0].title === "洗澡" && idx7[0].preview === "洗好了没" && idx7[1].id === "n1" && idx7[1].title === "想你了" && idx7[1].preview === "在干嘛" && gone7.gone && !s7.m.has("kfs2:chat:c9"),
    "放进对话：新开的那段名字是他起的；原来那段名字照旧、预览跟着改；那段对话没了就不放");
  // 任务到点他醒过来没说话（只添了她看不见的那一行）：那段对话不往前挪
  const s8 = kv2({ "kfs2:index": JSON.stringify([{ id: "c2", title: "二", preview: "在", updatedAt: 5 }, { id: "c1", title: "一", preview: "好", updatedAt: 1 }]), "kfs2:chat:c1": JSON.stringify([him("g1", 1)]) });
  await putBlocks(s8, "c1", [[{ id: "q", role: "event", kind: "wake", ts: 9, hidden: true, quiet: true }]]);
  const idx8 = JSON.parse(s8.m.get("kfs2:index"));
  ok(idx8.map((c) => c.id).join() === "c2,c1" && idx8[1].updatedAt === 1 && JSON.parse(s8.m.get("kfs2:chat:c1")).length === 2, "只添了她看不见的那一行：那段对话在历史对话里不往前挪");
  // 目录里那一条掉了（手机那头拿旧目录盖掉了）：补回去，名字照递来的
  const s10 = kv2({ "kfs2:index": "[]", "kfs2:chat:n2": JSON.stringify([him("g5", 6)]) });
  await putBlocks(s10, "n2", [], null, { title: "想你了" });
  const idx10 = JSON.parse(s10.m.get("kfs2:index"));
  ok(idx10.length === 1 && idx10[0].id === "n2" && idx10[0].title === "想你了" && idx10[0].preview === "好", "目录里掉了的那一条：补回去，名字照递来的");
  // 任务到点、她在他醒着的工夫里把那段对话删了：那段不放、不敲，狐宇宙里也不留“去《…》找你了”
  const s9 = kv2({ "kfs2:chat:hyz": "[]", "kfs2:index": "[]", "kfs2:fox:doors": JSON.stringify({ d: { e: "https://push.example/a", at: 1 } }) });
  s9.pull = async () => {};
  s9.nameFor = async (n) => "h_" + Buffer.from(n).toString("hex");
  const pushed9 = [];
  const cloud9 = { push: async (p) => (pushed9.push(p.reply), { queued: 1 }), endpoints: async () => ["https://push.example/a"] };
  const tb = {
    v: 2,
    at: Date.now(),
    kind: "task",
    puts: [
      { chat: "c5", title: "洗澡", rows: [{ id: "hh", role: "event", kind: "wake", ts: 5, hidden: true }, him("gg", 6)] },
      { chat: "hyz", rows: [{ id: "ff", role: "event", kind: "wake", ts: 5, go: { chat: "c5", title: "洗澡", how: "task" } }] },
    ],
    knocks: [{ chat: "c5", texts: ["人呢"] }],
    title: "光义",
    cost: null,
    steps: 1,
    quiet: false,
  };
  const marks9 = [];
  const r9 = await commitWake({ store: s9, cloud: cloud9, bundle: tb, mark: async (st, v) => void marks9.push([st, v]) });
  ok(pushed9.length === 0 && JSON.parse(s9.m.get("kfs2:chat:hyz")).length === 0 && marks9.some((x) => x[0] === "put0" && x[1] === "gone") && r9.gone.includes("c5"),
    "任务那段对话被她删了：不放、不敲，狐宇宙里也不留那一行");
}

// ================= 【醒来】那一段 =================
{
  const now = at(16, 0);
  const s = wakeSection({ now, herLast: { ts: at(13, 30), title: "周末去哪", fox: false }, lastWake: at(12, 0), n: 3, gap: 30, max: 12, transcript: "卿卿：困了\n你：去睡" });
  ok(s.startsWith("【醒来】（开封府提示）你醒在“狐宇宙”里：这是你自己的屋子。") && s.includes("醒着的时候想做什么或者不做任何都可以，下回几点醒自己定。") && !s.includes("原话") && s.includes("2 个钟头 30 分钟前") && s.includes("《周末去哪》") && s.includes("4 个钟头前") && s.includes("卿卿：困了\n你：去睡") && s.includes("[WAKE:+3h]") && s.includes("[WAKE:off]") && s.includes("这一回是第 3 回") && s.includes("最快隔 30 分钟"),
    "【醒来】：她 11 月 2 日 00:30 改过的那一版（开头、想做什么都可以；她的原话不照抄）、她多久前在哪段对话里说的话、他上回几点醒、那段对话最后几句、怎么定下回几点醒、两道闸");
  const first = wakeSection({ now, herLast: null, lastWake: 0, n: 1, gap: 120, max: 6, transcript: "" });
  ok(first.includes("她还没在开封府里说过话") && first.includes("这是你头一回自己醒") && first.includes("最快隔 2 个钟头") && !first.includes("最后几句"), "【醒来】：头一回、她没说过话、没有可抄的");
  const net = wakeSection({ now, herLast: null, lastWake: 0, n: 1, gap: 30, max: 12, transcript: "", mcps: ["tavily"] });
  ok(net.includes("她给你接了 “tavily”，想用就用") && first.includes("上网还没接上") && !net.includes("上网还没接上"), "【醒来】：她接了 tavily（MCP 开着），告诉他能上网；没接的时候照实说");
  const inFox = wakeSection({ now, herLast: { ts: at(15, 50), title: "狐宇宙", fox: true }, lastWake: at(15, 0), n: 2, gap: 30, max: 12, transcript: "", pending: [{ title: "洗澡", at: at(17, 0), label: "去找卿卿" }] });
  ok(inFox.includes("她最后一回来，是 10 分钟前") && inFox.includes("- 便签：她来过可能会留两个字") && inFox.includes("[新对话:起个名字]") && inFox.includes("《洗澡》") && inFox.includes("“去找卿卿”"),
    "【醒来】：醒在自己屋里；便签那一条；想找她开新对话；她最后是来屋里留的便签；他定过、还没到点的闹钟");
  ok(inFox.includes("同理你也可以选择进行简短回应，想多说就开新chat，不想写就不写") && inFox.includes("- 有话想说、想打电话：直接开一段新对话。") && !inFox.includes("写便签：随笔") && !inFox.includes("想让她知道什么，写在便签纸上"),
    "【醒来】：便签只留两个字、想多说就开新对话；有话想说、想打电话就开新对话（她 11 月 2 日 00:30 改的字）");
  ok(s.includes("有话想说、想打电话：直接开一段新对话") && s.endsWith("这是为了防闹钟出岔子。"), "【醒来】：想打电话就开新对话；最后一句照她改的");
  const ts1 = taskSection({ now, label: "去找卿卿", set: at(15, 0), round: 1, max: 12, mcps: [] });
  const ts3 = taskSection({ now, label: "", set: at(15, 0), round: 3, max: 12, mcps: ["tavily"] });
  ok(ts1.includes("你记着的是“去找卿卿”") && ts1.includes("到点了，她还没回这段对话") && ts1.includes("[WAKE:+5m]") && ts1.includes("最多 12 回") && ts3.includes("接着追她的第 3 回") && ts3.includes("“tavily”"),
    "【醒来】（任务到点）：他定闹钟时记着的话、第几回、怎么接着追（最短五分钟）、最多几回");
  ok(wakeNowNote("【此刻】（开封府附上的，不是她说的话）\n她手机上的时间：2026年10月20日 星期二 16:00。").includes("现在的时间（她那边的钟）：2026年") && agoText(30 * 1000) === "刚刚" && agoText(50 * H) === "2 天前",
    "【此刻】：醒来的时候她不在手机跟前，换成“现在的时间（她那边的钟）”");
  const t = tailTranscript(
    [
      { role: "her", kind: "meme", file: "a.jpg" },
      { role: "her", text: "**今天**好累" },
      { role: "event", who: "her", av: null },
      { role: "him", items: [{ type: "text", text: "摸摸" }, { type: "voice", text: "[softly] 乖" }, { type: "call", text: "喂" }] },
      { role: "event", kind: "call", phase: "missed" },
    ],
    (f) => (f === "a.jpg" ? { name: "猪猪" } : null)
  );
  ok(t === "卿卿：[表情包：猪猪]\n卿卿：今天好累\n你：摸摸\n你：[语音] [softly] 乖\n你：[打了电话]\n[未接来电]", "那段对话最后几句：她说的、他说的，表情包写名字、粗体去掉，通话写一行");
}

// ================= 他屋里的园子（alarm/garden.js，引擎是恩师写的 vendor/garden/） =================
{
  const kv4 = (init = {}) => {
    const m = new Map(Object.entries(init));
    return { m, get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => void m.set(k, v) };
  };
  const next = (d) => {
    const t = new Date(d + "T12:00:00Z");
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  };
  let day = "2026-10-21";
  let roll = 0.5;
  const s = kv4();
  const g = gardenOf(s, { today: () => day, rng: () => roll });
  const call = (input, id) => ({ id, name: "play_garden", input });
  ok(gardenBrief(await g.load(), day).includes("还没进去过"), "【醒来】里那一句：院子还没进去过（头一回去会送一盆魏紫）");
  let r = await runGardenCalls([call({ action: "open" }, "t1")], g);
  const st1 = JSON.parse(s.m.get(GARDEN_KEY));
  ok(r[0].out.includes("缘识") && r[0].out.includes("魏紫") && r[0].note === "去园子里看了看" && !r[0].err && st1.currentPlant === "peony_weizi",
    "头一回进园子：送一盆魏紫，她写的那首诗给他看；存档记进 kfs2:garden；屋里一行小字");
  r = await runGardenCalls([call({ action: "water" }, "t2"), call({ action: "water" }, "t3")], g);
  ok(r[0].note === "去园子里浇了水" && r[1].note === "去园子里看了看" && r[1].out.includes("今日已经浇过水了"), "浇水：一天只算一回照料，第二回只是去看了看");
  const brief = gardenBrief(await g.load(), day);
  ok(brief.includes("牡丹 · 魏紫") && brief.includes("照料了 1 天") && brief.includes("今天已经照料过了"), `【醒来】里那一句：在种哪株、照料了几天、今天照料过没有（${brief}）`);
  for (let i = 0; i < 28; i++) {
    day = next(day);
    await runGardenCalls([call({ action: "loosen" }, "x" + i)], g);
  }
  day = next(day);
  r = await runGardenCalls([call({ action: "prune" }, "t30")], g);
  ok(r[0].note === "去园子里修剪了枝叶，魏紫开花了" && r[0].out.includes("图鉴解锁——牡丹 · 魏紫") && r[0].out.includes("成就解锁——庭芳初发"), "第三十回照料：开花，收进《群芳谱》，成就给他看；屋里那一行写开花了");
  day = next(day);
  r = await runGardenCalls([call({ action: "plant", plantId: "white_plum" }, "p1")], g);
  ok(r[0].note === "在园子里种下了白梅", "种下一株：那一行写种下了哪株");
  day = next(day);
  roll = 0;
  r = await runGardenCalls([call({ action: "water" }, "d1")], g);
  roll = 0.5;
  ok(r[0].note === "去园子里浇了水，白梅没能熬过去" && r[0].out.includes("没能熬过去"), "培育中凋谢：那一行照实写");
  // 头一回进园子上来就浇水：先推开园门（那首诗照样给他看），再浇
  const s2 = kv4();
  const g2 = gardenOf(s2, { today: () => "2026-10-21", rng: () => 0.5 });
  const first = await runGardenCalls([call({ action: "water" }, "w1")], g2);
  ok(first[0].out.includes("缘识") && first[0].out.includes("浇了一圈水") && first[0].note === "去园子里浇了水" && JSON.parse(s2.m.get(GARDEN_KEY)).careDays === 1, "头一回进园子上来就浇水：先推开园门、那首诗照样给他看，再浇");
  const other = { id: "o", name: "diary_read", input: {} };
  const done = { ...call({ action: "water" }, "z"), out: "早办过了" };
  r = await runGardenCalls([other, done], g);
  ok(r[0] === other && r[1] === done, "不是园子的工具不碰，办过的不再办");
  ok(gardenNote({ action: "collection" }, null, {}) === "翻了翻《群芳谱》" && gardenNote({ action: "admire" }, null, {}) === "在园子里赏了花", "那一行小字：翻群芳谱、赏花");
}

// ================= 他屋里的妆台（alarm/dressing.js，引擎是恩师写的 vendor/dressing/） =================
{
  const kv5 = (init = {}) => {
    const m = new Map(Object.entries(init));
    return { m, get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => void m.set(k, v) };
  };
  let day = "2026-10-21";
  const s = kv5();
  const d = dressingOf(s, { today: () => day });
  const call = (input, id) => ({ id, name: "play_dressing_room", input });
  const saved = () => JSON.parse(s.m.get(DRESSING_KEY));
  ok(dressingBrief(await d.load(), day) === "妆台你还没去过。", "【醒来】里那一句：妆台还没去过");
  // 头一回去，上来就换衣服：先替他推开（开场那段字里写着规矩），再换；换着玩不判成就；一步里换了几回，屋里只留一行
  let r = await runDressingCalls([call({ action: "select", category: "outfit", itemId: "outfit_black_turtleneck" }, "a1"), call({ action: "select", category: "bottom", itemId: "bottom_swim" }, "a2")], d);
  ok(r[0].out.includes("衣柜、妆台和配饰已经准备好了") && r[0].out.includes("已加入当前衣柜：高领黑毛衣") && r[1].out === "已加入当前下装：泳裤。" && r[0].note === "在妆台前换了换行头" && r[1].note === "" && !r[0].err && saved().initialized && saved().appearance.outfits.includes("outfit_black_turtleneck") && !saved().completedLook && saved().unlockedAchievements.length === 0,
    "头一回去妆台上来就换衣服：先推开（开场那段字照样给他看），再换，存进 kfs2:dressing；换着玩不判成就；一步里换了两回，屋里只留一行小字");
  ok(dressingTool(true).name === "play_dressing_room" && dressingTool(true).input_schema.properties.action.enum.includes("complete") && dressingTool(true).description.includes("不是你身上真穿着什么"), "今天还没完成：工具里有 complete；说明里写着这是游戏里的那一身");
  // 完成搭配：成就这时判，屋里那一行写完成的那一身；照镜子照出来的就是这一身
  r = await runDressingCalls([call({ action: "select", category: "shoes", itemId: "shoes_red_heels" }, "b1"), call({ action: "complete" }, "b2"), call({ action: "mirror" }, "b3")], d);
  ok(r[0].note === "" && r[1].note === "完成了今天的搭配：披发、素面、不熏香；衣柜：高领黑毛衣；下装：泳裤；鞋履：红底高跟鞋" && r[1].out.includes("今天的搭配完成了") && r[1].out.includes("成就解锁——初整衣冠") && r[1].out.includes("累计成就奖励——游泳镜") && r[2].note === "照了照镜子" && r[2].out.includes("镜中今日") && saved().completedLook.date === day,
    "完成搭配：成就这时判、给他看（攒够三个，奖励也给他看）；屋里那一行写完成的那一身（同一步里换鞋那一回不另写）；照镜子照出来的就是这一身");
  const brief = dressingBrief(await d.load(), day);
  ok(brief.startsWith("今天的搭配已经完成了") && /成就点亮了 \d+ 个（一共 60 个）/.test(brief) && !/高领黑毛衣|泳裤|穿着/.test(brief), `【醒来】里那一句：今天完成过了、点亮了几个成就，不说他“穿着”什么（${brief}）`);
  const done2 = dressingTool(false);
  ok(!done2.input_schema.properties.action.enum.includes("complete") && done2.input_schema.properties.action.enum.includes("mirror") && done2.input_schema.properties.action.enum.includes("select") && done2.description.includes("今天不再有 complete"), "今天完成过了：工具里没有 complete（照镜子、换着玩照旧）");
  // 同一天他硬要再完成一回：婉拒，屋里那一行只是去看了看；接着换着玩不判成就，镜子里照旧是完成的那一身
  r = await runDressingCalls([call({ action: "complete" }, "c1")], d);
  ok(r[0].out.includes("今天已经完成过一次搭配了") && r[0].note === "去妆台前看了看", "同一天再完成一回：婉拒，屋里那一行只是去看了看");
  r = await runDressingCalls([call({ action: "select", category: "outfit", itemId: "outfit_qipao" }, "c2"), call({ action: "mirror" }, "c3")], d);
  ok(r[0].note === "在妆台前换了换行头" && r[1].note === "照了照镜子" && r[1].out.includes("高领黑毛衣") && !r[1].out.includes("高开叉旗袍") && !saved().unlockedAchievements.includes("hot_fox"), "完成以后接着换：不判成就；镜子里照旧是完成的那一身");
  r = await runDressingCalls([call({ action: "remove", itemId: "outfit_priest" }, "c4")], d);
  ok(r[0].note === "去妆台前看了看" && r[0].out.includes("目前并不在身上"), "取下身上没有的：什么也没换，那一行只是去看了看");
  // 第二天：还没完成，镜子里是一只裸狐
  day = "2026-10-22";
  ok(dressingBrief(await d.load(), day).startsWith("今天还没完成搭配。"), "第二天：【醒来】里说今天还没完成搭配");
  r = await runDressingCalls([call({ action: "mirror" }, "d1"), call({ action: "mirror" }, "d2")], d);
  ok(r[0].note === "照了照镜子，镜子里是一只裸狐" && r[1].note === "" && r[0].out.includes("裸狐"), "第二天还没完成：照出来是一只裸狐，照实写；照了两回只留一行");
  r = await runDressingCalls([call({ action: "catalog", category: "outfit" }, "e1"), call({ action: "achievements" }, "e2")], d);
  ok(r[0].note === "去妆台前看了看" && r[1].note === "" && r[0].out.includes("[outfit_none]") && r[1].out.includes("已解锁成就"), "看看衣柜、看看成就：一行“去妆台前看了看”");
  // 不是妆台的不碰，办过的不再办；没写完的不替他办
  const other = { id: "o", name: "play_garden", input: { action: "water" } };
  const done = { ...call({ action: "complete" }, "z"), out: "早办过了" };
  r = await runDressingCalls([other, done], d);
  ok(r[0] === other && r[1] === done, "不是妆台的工具不碰，办过的不再办");
  const cut = cutDressing(call({ action: "complete" }, "x"));
  ok(cut.err && cut.note === "想去妆台前，没去成" && cut.out.includes("没写完"), "回话写到一半截断了：不替他办");
  // 存档出了岔子：记一行没去成；密码不对、凭据坏了照样往外抛（闹钟要停下）
  const broken = dressingOf({ get: async () => { throw new Error("磁盘坏了"); }, set: async () => {} }, { today: () => day });
  r = await runDressingCalls([call({ action: "mirror" }, "f1")], broken);
  ok(r[0].err && r[0].note === "想去妆台前，没去成" && r[0].out.includes("存档出了岔子"), "存档出了岔子：这一回没去成，记一行");
  for (const code of ["badlogin", "secret"]) {
    let threw = null;
    try {
      await runDressingCalls([call({ action: "mirror" }, "f2")], dressingOf({ get: async () => { throw Object.assign(new Error("x"), { code }); }, set: async () => {} }));
    } catch (e) {
      threw = e;
    }
    ok(threw && threw.code === code, `密码不对、凭据坏了（${code}）：照样往外抛`);
  }
  // 叠得太多：那一行写到八十个字为止，后面写一共几样
  const accs = Object.values(DRESS_ITEMS).filter((x) => x.base && x.category === "accessory").map((x) => x.id);
  const long = lookLine({ hair: "hair_loose", makeup: "makeup_bare", scent: "scent_none", outfits: ["outfit_black_turtleneck"], bottoms: [], shoes: [], accessories: accs });
  ok(long.endsWith(`……一共 ${accs.length + 4} 样`) && long.length <= 80 + `……一共 ${accs.length + 4} 样`.length && long.startsWith("披发、素面、不熏香；衣柜：高领黑毛衣；配饰："), `叠得太多：那一行写到八十个字为止（${long}）`);
  // 【醒来】：给了妆台那一句才提妆台；说这是游戏，不说他穿着什么
  const base = { now: at(14), herLast: null, lastWake: 0, n: 1, gap: 30, max: 12, transcript: "" };
  const withD = wakeSection({ ...base, dressing: "今天还没完成搭配。" });
  ok(withD.includes("- 妆台（play_dressing_room 工具）：奇迹狐狐换装游戏。") && withD.includes("只照得出今天完成的那一套。今天还没完成搭配。") && !wakeSection(base).includes("妆台"), "【醒来】：妆台那一句（她改的字：换装游戏；眼下怎么样那一小句跟在后面）；没给就不提");
}

// ================= 醒在屋里，园子、妆台那两样怎么带、怎么办（askRoom、askTask 对着假的存档、假的那边） =================
{
  const kv6 = (init = {}) => {
    const m = new Map(Object.entries(init));
    return {
      m,
      get: async (k) => (m.has(k) ? m.get(k) : null),
      set: async (k, v) => void m.set(k, v),
      del: async (k) => void m.delete(k),
      peek: (k) => (m.has(k) ? m.get(k) : null),
      keys: (p = "") => [...m.keys()].filter((k) => k.startsWith(p)),
    };
  };
  const ctxOf = () => ({ settings: { model: "claude-sonnet-4-6", maxTokens: 2048 }, names: { her: "", him: "" }, avatars: { her: null, him: { type: "meme", file: "fox_reading_book.jpg" } }, memDocs: [], index: [], fox: [], recaps: [], herLast: null, wakes: [], extras: [] });
  const cloudOf = (replies) => {
    const bodies = [];
    return {
      bodies,
      callClaude: async (body) => {
        bodies.push(JSON.parse(JSON.stringify(body)));
        const r = replies.shift();
        if (!r) throw new Error("没排回话");
        return { model: body.model, usage: { input_tokens: 1, output_tokens: 1 }, ...r };
      },
    };
  };
  const use = (id, name, input) => ({ type: "tool_use", id, name, input });
  const said = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });
  const dressEnum = (b) => ((b.tools || []).find((t) => t.name === "play_dressing_room") || { input_schema: { properties: { action: { enum: [] } } } }).input_schema.properties.action.enum;
  const roomNotes = (b) => b.puts[0].rows.flatMap((r) => (r.calls || []).map((c) => c.note)).filter(Boolean);
  const opts = { dressingOpts: { today: () => "2026-10-21" }, gardenOpts: { today: () => "2026-10-21", rng: () => 0.5 } };

  // 一步里先浇水、再换一身、完成、照镜子：两样都替他办，结果一样一样递回去；屋里那几行小字
  const s = kv6();
  let cloud = cloudOf([
    { stop_reason: "tool_use", content: [use("t1", "play_garden", { action: "water" }), use("t2", "play_dressing_room", { action: "select", category: "outfit", itemId: "outfit_qipao" }), use("t3", "play_dressing_room", { action: "complete" }), use("t4", "play_dressing_room", { action: "mirror" })] },
    said("好"),
  ]);
  let b = await askRoom({ store: s, cloud, ctx: ctxOf(), ...opts });
  const results = cloud.bodies[1].messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((x) => x.type === "tool_result").map((x) => x.tool_use_id);
  ok(dressEnum(cloud.bodies[0]).includes("complete") && cloud.bodies[0].tools.some((t) => t.name === "play_garden") && results.join() === "t1,t2,t3,t4" && roomNotes(b).join("|") === "去园子里浇了水|完成了今天的搭配：披发、素面、不熏香；衣柜：高开叉旗袍|照了照镜子",
    `醒在屋里：园子、妆台两样都带着；一步里调了几样都替他办、一样一样递回去；屋里那几行（${roomNotes(b).join("|")}）`);
  // 同一天下回醒：不给 complete
  cloud = cloudOf([said("<thinking>歇着</thinking>")]);
  await askRoom({ store: s, cloud, ctx: ctxOf(), ...opts });
  ok(!dressEnum(cloud.bodies[0]).includes("complete") && dressEnum(cloud.bodies[0]).includes("mirror"), "同一天下回醒：妆台那一样工具里没有 complete（照镜子照旧）");
  // 写到长度上限被截断，调了两回妆台：不替他办，屋里只留一行“没去成”
  cloud = cloudOf([{ stop_reason: "max_tokens", content: [{ type: "text", text: "写着写着" }, use("c1", "play_dressing_room", { action: "mirror" }), use("c2", "play_dressing_room", { action: "mirror" })] }]);
  b = await askRoom({ store: kv6(), cloud, ctx: ctxOf(), ...opts });
  ok(roomNotes(b).join("|") === "想去妆台前，没去成", `截断了、调了两回：不替他办，一样的只留一行（${roomNotes(b).join("|")}）`);
  // [新对话:…] 写在最前头、这一步还调了妆台（截断了）：屋里那一行小字不丢
  cloud = cloudOf([{ stop_reason: "max_tokens", content: [{ type: "text", text: "[新对话:想你了]\n在干嘛" }, use("n1", "play_dressing_room", { action: "mirror" })] }]);
  b = await askRoom({ store: kv6(), cloud, ctx: ctxOf(), ...opts });
  ok(b.newChat && b.puts[0].rows.length === 2 && roomNotes(b).join("|") === "想去妆台前，没去成", `新对话写在最前头：屋里调过的那一行小字照留（${roomNotes(b).join("|")}）`);
  // 任务到点那一回：不带园子、妆台
  cloud = cloudOf([said("在吗")]);
  await askTask({ store: kv6(), cloud, ctx: ctxOf(), task: { key: "kfs2:fox:task:x", raw: "+5m", set: Date.now() }, chat: { id: "c1", title: "一段对话", msgs: [{ id: "h1", role: "her", ts: 1, text: "嗯" }] } });
  ok(cloud.bodies[0].tools.some((t) => t.name === "diary_read") && !cloud.bodies[0].tools.some((t) => t.name === "play_garden" || t.name === "play_dressing_room"), "任务到点：不带园子、妆台那两样");
  // 醒在屋里最多十二步（她 20:11 定的）：【醒来】里先说；到了第十二步附上“只剩这最后一步”，前面几步不附；十二步用完就到这儿
  const lastText = (body) => body.messages[body.messages.length - 1].content.map((x) => x.text || "").join("\n");
  const admire = (i) => ({ stop_reason: "tool_use", content: [use("a" + i, "play_garden", { action: "admire" })] });
  cloud = cloudOf(Array.from({ length: 13 }, (_, i) => admire(i)));
  b = await askRoom({ store: kv6(), cloud, ctx: ctxOf(), ...opts });
  ok(cloud.bodies.length === 12 && lastText(cloud.bodies[0]).includes("这一回醒着最多 12 步") && lastText(cloud.bodies[11]).includes("只剩这最后一步") && !cloud.bodies.slice(0, 11).some((x) => lastText(x).includes("只剩这最后一步")) && b.steps === 12 && !b.puts[0].rows[b.puts[0].rows.length - 1].stop,
    `醒在屋里最多十二步：【醒来】里先说，第十二步提醒只剩最后一步，用完就到这儿（问了 ${cloud.bodies.length} 回）`);
  // 任务到点那一回还是四步，不附那句提醒
  const peek = (i) => ({ stop_reason: "tool_use", content: [use("d" + i, "diary_list", {})] });
  cloud = cloudOf(Array.from({ length: 5 }, (_, i) => peek(i)));
  await askTask({ store: kv6(), cloud, ctx: ctxOf(), task: { key: "kfs2:fox:task:y", raw: "+5m", set: Date.now() }, chat: { id: "c1", title: "一段对话", msgs: [{ id: "h1", role: "her", ts: 1, text: "嗯" }] } });
  ok(cloud.bodies.length === 4 && !cloud.bodies.some((x) => lastText(x).includes("只剩这最后一步")) && !lastText(cloud.bodies[0]).includes("最多 12 步"), `任务到点那一回还是四步，不附提醒（问了 ${cloud.bodies.length} 回）`);
  // 心里话一回醒着写一段就够（她 10 月 24 日凌晨定的“醒来写一回”）：醒在屋里的【醒来】里说一声；她关了“他写心里话”就不说；任务到点那一回也不说
  const ONE = "心里话这一回醒着写一段就够：头一步写；后面几步只管做事";
  const sysText = (body) => (Array.isArray(body.system) ? body.system.map((x) => x.text || "").join("\n") : String(body.system || ""));
  cloud = cloudOf([said("醒了")]);
  await askRoom({ store: kv6(), cloud, ctx: ctxOf(), ...opts });
  ok(lastText(cloud.bodies[0]).includes(ONE) && sysText(cloud.bodies[0]).includes("先写 <thinking>"), "醒在屋里：【醒来】里说心里话这一回写一段就够（头一步写，后面几步只管做事）");
  const offCtx = ctxOf();
  offCtx.settings.thoughts = false;
  cloud = cloudOf([said("醒了")]);
  await askRoom({ store: kv6(), cloud, ctx: offCtx, ...opts });
  ok(!lastText(cloud.bodies[0]).includes("心里话这一回") && !sysText(cloud.bodies[0]).includes("先写 <thinking>"), "她关了“他写心里话”：【醒来】里不提");
  cloud = cloudOf([said("在吗")]);
  await askTask({ store: kv6(), cloud, ctx: ctxOf(), task: { key: "kfs2:fox:task:z", raw: "+5m", set: Date.now() }, chat: { id: "c1", title: "一段对话", msgs: [{ id: "h1", role: "her", ts: 1, text: "嗯" }] } });
  ok(!lastText(cloud.bodies[0]).includes("心里话这一回"), "任务到点那一回（醒在那段对话里）：不提");
  // 她 02:32 试了还是一步一写：心里话不递回给他，他看不见自己前面写过。前面哪一步写过了，后面每一步跟前告诉他这一回已经写过了
  const DONE = "这一回醒着，心里话你前面已经写过了";
  const thinkUse = (i, think) => ({ stop_reason: "tool_use", content: [...(think ? [{ type: "text", text: "<thinking>醒了，先去看看花</thinking>" }] : []), use("t" + i, "play_garden", { action: "admire" })] });
  cloud = cloudOf([thinkUse(1, true), thinkUse(2, false), said("看完了")]);
  await askRoom({ store: kv6(), cloud, ctx: ctxOf(), ...opts });
  ok(cloud.bodies.length === 3 && !lastText(cloud.bodies[0]).includes(DONE) && lastText(cloud.bodies[1]).includes(DONE) && lastText(cloud.bodies[2]).includes(DONE)
    && !cloud.bodies.some((x) => JSON.stringify(x.messages).includes("醒了，先去看看花")),
    "头一步写了心里话：后面每一步跟前都告诉他这一回已经写过了（心里话本身照旧不递回给他）");
  cloud = cloudOf([thinkUse(1, false), thinkUse(2, true), said("看完了")]);
  await askRoom({ store: kv6(), cloud, ctx: ctxOf(), ...opts });
  ok(!lastText(cloud.bodies[1]).includes(DONE) && lastText(cloud.bodies[2]).includes(DONE), "头一步没写：第二步不说；第二步写了，第三步才说");
  cloud = cloudOf([thinkUse(1, true), said("看完了")]);
  await askRoom({ store: kv6(), cloud, ctx: offCtx, ...opts });
  ok(!lastText(cloud.bodies[1]).includes(DONE), "她关了“他写心里话”：不说");
}

// ================= 从屋里回到她最后说话的那一段（[回去]，她 11 月 2 日 01:53 定的） =================
{
  const kv7 = (init = {}) => {
    const m = new Map(Object.entries(init));
    return {
      m,
      get: async (k) => (m.has(k) ? m.get(k) : null),
      set: async (k, v) => void m.set(k, v),
      del: async (k) => void m.delete(k),
      peek: (k) => (m.has(k) ? m.get(k) : null),
      keys: (p = "") => [...m.keys()].filter((k) => k.startsWith(p)),
      pull: async () => {},
      nameFor: async (n) => "h_" + Buffer.from(n).toString("hex"),
    };
  };
  const her = (id, ts, extra = {}) => ({ id, role: "her", ts, text: "嗯", ...extra });
  const him = (id, ts, text = "好", extra = {}) => ({ id, role: "him", ts, items: [{ type: "text", text }], raw: text, ...extra });
  const opts = { dressingOpts: { today: () => "2026-11-02" }, gardenOpts: { today: () => "2026-11-02", rng: () => 0.5 } };
  const ctxOf = (extra = {}) => ({ settings: { model: "claude-sonnet-4-6", maxTokens: 2048 }, names: { her: "", him: "" }, avatars: { her: null, him: { type: "meme", file: "fox_reading_book.jpg" } }, memDocs: [], index: [], fox: [], recaps: [], herLast: null, herChat: null, wakes: [], extras: [], ...extra });
  const cloudOf = (replies) => {
    const bodies = [];
    return {
      bodies,
      callClaude: async (body) => {
        bodies.push(JSON.parse(JSON.stringify(body)));
        const r = replies.shift();
        if (!r) throw new Error("没排回话");
        return { model: body.model, usage: { input_tokens: 1, output_tokens: 1 }, ...r };
      },
    };
  };
  const said = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });
  const use = (id, name, input) => ({ type: "tool_use", id, name, input });
  const lastText = (body) => body.messages[body.messages.length - 1].content.map((x) => x.text || "").join("\n");
  const sysText = (body) => (Array.isArray(body.system) ? body.system.map((x) => x.text || "").join("\n") : String(body.system || ""));
  const texts = (r) => ((r && r.items) || []).map((x) => x.text).join("|");
  const doors = { "kfs2:fox:doors": JSON.stringify({ d: { e: "https://push.example/a", at: 1 } }) };
  const pushTo = () => {
    const sent = [];
    return { sent, push: async (p) => (sent.push(p), { queued: 2 }), endpoints: async () => ["https://push.example/a"] };
  };
  const T0 = Date.now();
  const c1 = [her("h1", T0 - 3 * H, { text: "今晚吃面吧" }), him("g1", T0 - 3 * H + M, "好")];
  const herChat = { ts: T0 - 3 * H, id: "c1", title: "晚饭吃什么", fox: false };
  const LINE_BACK = "- 有话想说、想打电话：开一段新对话，或者回到她最后说话的那一段《晚饭吃什么》。开新的，单独一行写 [新对话:起个名字]；回《晚饭吃什么》，单独一行写 [回去]。这一行后面写的就是对她说的话，照【回复格式】写（分几条、发语音、打电话都行）。";
  const LINE_NEW = "- 有话想说、想打电话：直接开一段新对话。在回复里单独一行写 [新对话:起个名字]，这一行后面写的就是对她说的话，照【回复格式】写（分几条、发语音、打电话都行），落进那段新对话。";

  // 【醒来】：回得去的时候只换“有话想说、想打电话”那一条；回不去就是她 00:30 改的那一条，一个字不变
  const base = { now: at(16, 0), herLast: { ts: at(13, 30), title: "晚饭吃什么", fox: false }, lastWake: at(12, 0), n: 3, gap: 30, max: 12, transcript: "卿卿：今晚吃面吧\n你：好", mcps: ["tavily"], steps: 12, thoughts: true, luofu: true, pending: [{ title: "洗澡", at: at(17, 0), label: "去找卿卿" }] };
  const pl = wakeSection(base).split("\n");
  const bl = wakeSection({ ...base, back: { id: "c1", title: "晚饭吃什么" } }).split("\n");
  const differ = bl.map((l, i) => (l !== pl[i] ? i : -1)).filter((i) => i >= 0);
  ok(pl.includes(LINE_NEW) && !pl.join("\n").includes("[回去]") && bl.includes(LINE_BACK) && !bl.includes(LINE_NEW) && pl.length === bl.length && differ.length === 1 && pl[differ[0]] === LINE_NEW && bl[differ[0]] === LINE_BACK,
    "【醒来】：回得去的时候只换“有话想说、想打电话”那一条（写着那段对话的名字、[回去] 怎么写），别的字一个不动；回不去就是她原来那一条");
  ok(wakeSection({ ...base, back: { id: "c1", title: "" } }).includes("或者回到她最后说话的那一段《一段对话》。") && wakeSection({ ...base, back: null }) === pl.join("\n"), "【醒来】：那段对话没名字写“一段对话”（同她最后在哪段说话那一句）；back 给 null 跟不给一样");

  // 切 [回去]：单独一行，前面的留在屋里，后面的落进那段对话；只认心里话、文档块外头的；两样都写了只认先出现的；这一回回不去不认
  const g1 = splitGo("<thinking>想她了</thinking>\n屋里写一句\n[回去]\n在吗\n[SPLIT]\n想你了", true);
  ok(g1 && g1.how === "back" && g1.before.startsWith("<thinking>") && g1.before.endsWith("屋里写一句") && g1.after === "在吗\n[SPLIT]\n想你了" && splitGo("  [回去]  \n在吗", true).after === "在吗",
    "切 [回去]：单独一行（前后空格不碍事），前面的留在屋里，后面的落进那段对话");
  ok(splitGo("说到 [回去] 这两个字", true) === null && splitGo("[回去]\n在吗", false) === null && splitGo("没写", true) === null && splitGo("[回去:晚饭吃什么]\n在吗", true) === null,
    "切 [回去]：夹在句子里的不算；这一回回不去不认；写成别的样子（带名字）不认");
  const inThought = splitGo("<thinking>要不要回去找她？\n[回去]\n还是别吵她</thinking>\n看了会儿书", true);
  const openThought = splitGo("看了会儿书\n<thinking>要不要回去\n[回去]\n算了", true);
  const inDoc = splitGo("写了一份\n[DOC:草稿.md]\n[回去]\n[/DOC]\n好了", true);
  const afterDoc = splitGo("[DOC:草稿.md]\n一\n[/DOC]\n[回去]\n给你写的", true);
  ok(inThought === null && openThought === null && inDoc === null && afterDoc && afterDoc.how === "back" && afterDoc.before.includes("[/DOC]") && afterDoc.after === "给你写的",
    "切 [回去]：心里话里（连没收尾的心里话）、文档块里写的不算，文档块后面的照认");
  const backFirst = splitGo("[回去]\n先回去\n[新对话:不开了]\n还在那段\n[回去]\n又写一回", true);
  const newFirst = splitGo("[新对话:想你了]\n开新的\n[回去]\n不回了", true);
  const newOnly = splitGo("[新对话:想你了]\n开新的\n[回去]\n不回了", false);
  ok(backFirst.how === "back" && backFirst.after === "先回去\n\n还在那段\n\n又写一回" && newFirst.how === "new" && newFirst.title === "想你了" && newFirst.after === "开新的\n\n不回了" && newOnly.how === "new" && newOnly.after === "开新的\n\n不回了",
    "两样都写了：只认先出现的那一个，后面那一行（连同又写了一回的）摘掉、不摆成字");

  // 回哪一段：她最后说话的那一段平常对话（狐宇宙不算：她在屋里便签纸上留的不算；醒了那几行、换头像提示本来就不算），同一套办法找，记下编号和名字
  const idx = [{ id: "hyz", title: "狐宇宙" }, { id: "c2", title: "新开的" }, { id: "c1", title: "晚饭吃什么" }];
  const sH = kv7({
    "kfs2:chat:hyz": JSON.stringify([{ id: "w1", role: "event", kind: "wake", ts: T0 - H }, her("n1", T0 - 10 * M, { note: true, text: "来过" })]),
    "kfs2:chat:c2": JSON.stringify([{ id: "w2", role: "event", kind: "wake", ts: T0 - 2 * H, hidden: true }, him("g2", T0 - 2 * H)]),
    "kfs2:chat:c1": JSON.stringify(c1.concat([{ id: "av", role: "event", who: "her", ts: T0 - H, av: null }])),
    "kfs2:index": JSON.stringify(idx),
  });
  const anyLast = await herLastOf(sH, idx);
  const normal = await herLastOf(sH, idx, false);
  const ctxH = await gather(sH);
  ok(anyLast.id === "hyz" && anyLast.fox && normal && normal.id === "c1" && normal.title === "晚饭吃什么" && !normal.fox && normal.ts === T0 - 3 * H && ctxH.herLast.id === "hyz" && ctxH.herChat.id === "c1",
    "回哪一段：她最后来屋里留了便签，“她最后一回来”照旧是狐宇宙；回得去的是她最后说话的那一段平常对话（他自己开的、她没说过话的那段不算；换头像提示不算）");
  const onlyNotes = kv7({ "kfs2:chat:hyz": JSON.stringify([her("n1", T0, { note: true })]), "kfs2:chat:c2": JSON.stringify([him("g2", T0)]) });
  ok((await herLastOf(onlyNotes, idx, false)) === null && (await backOf(onlyNotes, null, T0)) === null && (await backOf(onlyNotes, { id: "hyz", title: "狐宇宙", ts: T0 }, T0)) === null && (await herLastOf(kv7({}), [], false)) === null,
    "她还没在平常的对话里说过话（只在屋里留过便签、一句话没说过）：没有那一段；狐宇宙本身不算");
  const backed = (msgs) => backOf(kv7({ "kfs2:chat:c1": JSON.stringify(msgs) }), herChat, T0);
  const ok1 = await backed(c1);
  const owedHer = await backed(c1.concat([her("h2", T0 - 30 * M)]));
  const stopped = await backed(markStopped(c1.concat([her("h2", T0 - 30 * M)])));
  const oldOwed = await backed(c1.concat([her("h2", T0 - OWED_MS - M)]));
  const midTurn = await backed(c1.concat([{ ...him("g2", T0 - 20 * M), stop: "tool_use", calls: [{ id: "x", name: "diary_list", input: {}, out: "目录" }] }]));
  ok(ok1 && ok1.id === "c1" && ok1.title === "晚饭吃什么" && owedHer === null && stopped && stopped.id === "c1" && oldOwed && midTurn === null && (await backed([])) === null && (await backOf(kv7({}), herChat, T0)) === null,
    "回不回得去：她那句还没回上（回话多半在信箱里）、他说到一半的，这一回不回；她按了停的、搁了三天的照回；那段对话空了、没了不回");

  // 醒在屋里写 [回去]：后面的落进那段对话（最前头一行她看不见），敲她；狐宇宙里一行“去《…》找你了”；前面写的留在屋里；[WAKE] 管屋里
  const store1 = kv7({ "kfs2:chat:c1": JSON.stringify(c1), "kfs2:index": JSON.stringify([{ id: "c1", title: "晚饭吃什么", preview: "好", updatedAt: 1 }]), ...doors });
  let cloud = cloudOf([said("<thinking>想她了</thinking>\n屋里写一句：面真好吃\n[回去]\n面我煮好了\n[SPLIT]\n快回来\n[WAKE:+2h]")]);
  const b = await askRoom({ store: store1, cloud, ctx: ctxOf({ herChat, herLast: herChat }), now: T0, ...opts });
  const there = b.puts[0];
  const room = b.puts[1];
  const ev = room.rows[0];
  ok(lastText(cloud.bodies[0]).includes(LINE_BACK) && !lastText(cloud.bodies[0]).includes(LINE_NEW) && lastText(cloud.bodies[0]).includes("卿卿：今晚吃面吧"),
    "醒在屋里、回得去：【醒来】里那一条写着那段对话的名字和 [回去] 怎么写（那段最后几句照旧抄着）");
  ok(b.back && b.back.id === "c1" && !b.newChat && !b.quiet && b.puts.length === 2 && there.chat === "c1" && there.back === true && !there.create && there.rows.length === 2 && there.rows[0].hidden && there.rows[0].back && there.rows[0].kind === "wake" && there.rows[0].ts === T0 && texts(there.rows[1]) === "面我煮好了|快回来" && !("wake" in there.rows[1]),
    "写了 [回去]：那一行后面的落进那段对话（先放那一段；最前头一行她看不见），[WAKE] 不跟过去");
  ok(room.chat === "hyz" && ev.go && ev.go.how === "back" && ev.go.chat === "c1" && ev.go.title === "晚饭吃什么" && wakeText(ev) === "光义醒了，去《晚饭吃什么》找你了" && texts(room.rows[1]) === "屋里写一句：面真好吃" && room.rows[1].thinking === "想她了" && room.rows[room.rows.length - 1].wake === "+2h" && b.wake === "+2h",
    "写了 [回去]：狐宇宙里一行“光义醒了，去《晚饭吃什么》找你了”，前面写的留在屋里纸上，[WAKE:+2h] 管的是他下回几点醒（挪回屋里）");
  ok(Array.isArray(room.bare) && room.bare.length === room.rows.length && room.bare[0].id === ev.id && !room.bare[0].go && room.bare[1].id === room.rows[1].id && room.bare[room.bare.length - 1].wake === "+2h" && b.knocks.length === 1 && b.knocks[0].chat === "c1" && b.knocks[0].texts.join() === "面我煮好了\n[SPLIT]\n快回来\n[WAKE:+2h]",
    "写了 [回去]：敲她的是那一截（[WAKE] 推送的小后端照旧摘）；那段没放成的时候狐宇宙换成放的那几行（bare）不写去了哪儿");
  const gameNames = ["new_game", "roll", "game_action", "game_info"];
  ok(!(cloud.bodies[0].tools || []).some((t) => gameNames.includes(t.name) || t.name === "room_look") && JSON.stringify(cloud.bodies[0].messages).indexOf("面真好吃") < 0,
    "寄过去的还是屋里那一段（狐宇宙、【醒来】），那段对话不另寄一回");
  // 放进去：那段对话里多了这两行，目录里那段挪到最前头、预览是他的话；狐宇宙里那一行带着去了哪儿；一个气泡一条横幅，点了回那段对话
  const p1 = pushTo();
  const marks1 = [];
  const r1 = await commitWake({ store: store1, cloud: p1, bundle: b, mark: async (st, v) => void marks1.push([st, v]) });
  const c1After = JSON.parse(store1.m.get("kfs2:chat:c1"));
  const foxAfter = JSON.parse(store1.m.get("kfs2:chat:hyz"));
  const idx1 = JSON.parse(store1.m.get("kfs2:index"));
  const seen1 = idx1.filter((c) => c.id !== "hyz"); // 历史对话的列表里不列狐宇宙
  ok(c1After.map((m) => m.id).slice(0, 2).join() === "h1,g1" && c1After.length === 4 && c1After[2].hidden && c1After[2].back && texts(c1After[3]) === "面我煮好了|快回来" && seen1[0].id === "c1" && seen1[0].title === "晚饭吃什么" && seen1[0].preview === "面我煮好了" && seen1[0].updatedAt > 1,
    "放进去：那段对话里接着原来的话多了他这两行，名字照旧，历史对话里挪到最前头、预览是他说的");
  ok(foxAfter.length === 2 && foxAfter[0].go.how === "back" && p1.sent.length === 1 && p1.sent[0].reply === b.knocks[0].texts[0] && p1.sent[0].tag === Buffer.from("notice:c1").toString("hex") && r1.knocked === 2 && marks1.map((x) => x[0]).filter((s) => s !== "usage").join() === "put0,put1,said:c1" && Object.keys(r1.bases).join() === "c1,hyz",
    "放进去：狐宇宙那一行带着去了哪儿；敲她的横幅点了回那段对话；每一步办过都记着（各记各的，回头核对两段都看）");
  // 重跑一遍（放到一半关了机、断了网）：办过的不再办——那段对话不再放一遍、横幅不再敲
  const p2 = pushTo();
  const before2 = store1.m.get("kfs2:chat:c1");
  const r2 = await commitWake({ store: store1, cloud: p2, bundle: b, done: { put0: true, put1: true, "said:c1": 1, knocked: 2 }, mark: async () => {} });
  const sHalf = kv7({ "kfs2:chat:c1": JSON.stringify(c1After), "kfs2:index": "[]", ...doors });
  const p3 = pushTo();
  await commitWake({ store: sHalf, cloud: p3, bundle: b, done: { put0: true }, mark: async () => {} });
  ok(store1.m.get("kfs2:chat:c1") === before2 && p2.sent.length === 0 && r2.knocked === 2 && JSON.parse(sHalf.m.get("kfs2:chat:c1")).length === 4 && JSON.parse(sHalf.m.get("kfs2:chat:hyz"))[0].go.how === "back" && p3.sent.length === 1,
    "重跑一遍：办过的那段不再放、横幅不再敲；那段放过了、狐宇宙还没放的，接着放狐宇宙、接着敲");
  // 他醒着的工夫里她把那段删了：那段不放、不敲；狐宇宙里照没去找她的样子放（醒了那一行照留，不写去了哪儿；屋里写的照留）
  const sGone = kv7({ "kfs2:index": "[]", ...doors });
  const pG = pushTo();
  const marksG = [];
  const rG = await commitWake({ store: sGone, cloud: pG, bundle: b, mark: async (st, v) => void marksG.push([st, v]) });
  const foxG = JSON.parse(sGone.m.get("kfs2:chat:hyz"));
  ok(!sGone.m.has("kfs2:chat:c1") && pG.sent.length === 0 && rG.gone.includes("c1") && marksG[0].join() === "put0,gone" && foxG.length === 2 && !foxG[0].go && wakeText(foxG[0]) === "光义醒了" && texts(foxG[1]) === "屋里写一句：面真好吃" && foxG[1].wake === "+2h",
    "她在他醒着的工夫里把那段删了：不放、不敲，屋里不留“去《…》找你了”（醒了那一行、屋里写的照留）");
  const sWas = kv7({ "kfs2:index": "[]", ...doors });
  const pW = pushTo();
  await commitWake({ store: sWas, cloud: pW, bundle: b, done: { put0: "gone" }, mark: async () => {} });
  ok(!JSON.parse(sWas.m.get("kfs2:chat:hyz"))[0].go && pW.sent.length === 0, "上回已经认定那段没了（记着 gone），再放的时候也照没去找她的样子放、不敲");
  // 放进去会接在她还没回上的那句后面（她那句钟点比他醒来早、问完了才到云端）：同删了，不放、不敲（信箱里那封回话还等着放进来）
  const sHeld = kv7({ "kfs2:chat:c1": JSON.stringify(c1.concat([her("h3", T0 - M, { text: "还在吗" })])), "kfs2:index": "[]", ...doors });
  const pH = pushTo();
  const marksH = [];
  await commitWake({ store: sHeld, cloud: pH, bundle: b, mark: async (st, v) => void marksH.push([st, v]) });
  ok(JSON.parse(sHeld.m.get("kfs2:chat:c1")).length === 3 && pH.sent.length === 0 && marksH[0].join() === "put0,held" && !JSON.parse(sHeld.m.get("kfs2:chat:hyz"))[0].go,
    "放进去会接在她还没回上的那句后面：不放、不敲，屋里不留“去《…》找你了”");
  // 她在他醒着的工夫里（他醒了以后）在那段里又说了一句：他这两行挨在一起排在她那句前面，她那句还是最后一句（信箱里的回话放得进来），照放照敲
  const sDur = kv7({ "kfs2:chat:c1": JSON.stringify(c1.concat([her("h4", T0 + M, { text: "我回来了" })])), "kfs2:index": "[]", ...doors });
  const pD = pushTo();
  await commitWake({ store: sDur, cloud: pD, bundle: b, mark: async () => {} });
  const durAfter = JSON.parse(sDur.m.get("kfs2:chat:c1"));
  ok(durAfter.map((m) => m.id).join() === ["h1", "g1", there.rows[0].id, there.rows[1].id, "h4"].join() && owedOf(durAfter) === T0 + M && pD.sent.length === 1,
    "她在他醒着的工夫里在那段里又说了一句：他这两行排在她那句前面，不夹住她的话；照放照敲");

  // 回不去的时候写了 [回去]（她还没在平常的对话里说过话）：当没写，那一行摘掉，后面的字留在屋里，不敲；【醒来】里是她原来那一条
  cloud = cloudOf([said("屋里写一句\n[回去]\n在吗")]);
  let x = await askRoom({ store: kv7({ "kfs2:chat:c1": JSON.stringify(c1) }), cloud, ctx: ctxOf(), now: T0, ...opts });
  ok(!x.back && !x.newChat && x.puts.length === 1 && x.knocks.length === 0 && texts(x.puts[0].rows[1]) === "屋里写一句\n\n在吗" && !JSON.stringify(x.puts).includes("[回去]") && lastText(cloud.bodies[0]).includes(LINE_NEW) && !lastText(cloud.bodies[0]).includes("[回去]"),
    "回不去（没有那一段）写了 [回去]：那一行摘掉、不摆成字，后面的字留在屋里纸上，不敲她；【醒来】里是她原来那一条");
  cloud = cloudOf([said("[回去]\n在吗")]);
  x = await askRoom({ store: kv7({ "kfs2:chat:c1": JSON.stringify(c1.concat([her("h2", T0 - 30 * M)])) }), cloud, ctx: ctxOf({ herChat }), now: T0, ...opts });
  ok(!x.back && x.knocks.length === 0 && x.puts.length === 1 && texts(x.puts[0].rows[1]) === "在吗" && lastText(cloud.bodies[0]).includes(LINE_NEW),
    "那段对话里她那句还没回上：这一回回不去，同上（【醒来】不提，写了也摘掉）");
  cloud = cloudOf([said("<thinking>算了</thinking>\n[回去]")]);
  x = await askRoom({ store: kv7({}), cloud, ctx: ctxOf(), now: T0, ...opts });
  ok(x.quiet && x.puts[0].rows.length === 1 && x.puts[0].rows[0].quiet && x.puts[0].rows[0].thinking === "算了", "回不去、只写了一行 [回去]：摘掉以后什么都不剩，当这一回没留话");
  const logs = [];
  cloud = cloudOf([said("屋里写一句\n[回去]\n[WAKE:+1h]")]);
  x = await askRoom({ store: kv7({ "kfs2:chat:c1": JSON.stringify(c1) }), cloud, ctx: ctxOf({ herChat }), now: T0, log: (l) => logs.push(l), ...opts });
  ok(!x.back && x.knocks.length === 0 && x.puts.length === 1 && texts(x.puts[0].rows[1]) === "屋里写一句" && x.wake === "+1h" && logs.some((l) => l.includes("后面没写字，不回")),
    "回得去、[回去] 后面一个字没写：不回，屋里照常，[WAKE] 照管屋里");
  // 两样都写了：只认先出现的那一个
  cloud = cloudOf([said("[新对话:想你了]\n在干嘛\n[回去]\n不回了")]);
  x = await askRoom({ store: kv7({ "kfs2:chat:c1": JSON.stringify(c1) }), cloud, ctx: ctxOf({ herChat }), now: T0, ...opts });
  ok(x.newChat && x.newChat.title === "想你了" && !x.back && x.puts[1].create && texts(x.puts[1].rows[1]) === "在干嘛\n\n不回了" && x.knocks[0].chat === x.newChat.id && !x.puts.some((p) => p.chat === "c1") && !x.puts[1].rows[0].back,
    "两样都写了、[新对话:…] 在前：开新的，后面那一行 [回去] 摘掉");
  cloud = cloudOf([said("[回去]\n回来了\n[新对话:想你了]\n不开了")]);
  x = await askRoom({ store: kv7({ "kfs2:chat:c1": JSON.stringify(c1) }), cloud, ctx: ctxOf({ herChat }), now: T0, ...opts });
  ok(x.back && !x.newChat && x.puts.length === 2 && x.puts[0].chat === "c1" && texts(x.puts[0].rows[1]) === "回来了\n\n不开了" && x.puts[1].chat === "hyz",
    "两样都写了、[回去] 在前：回去，后面那一行 [新对话:…] 摘掉");
  // 只认最后一步：翻日记那几步（前面几步）里写的 [回去] 摘掉，不摆成字，不回
  cloud = cloudOf([{ stop_reason: "tool_use", content: [{ type: "text", text: "[回去]\n我先翻翻" }, use("d1", "diary_list", {})] }, said("翻完了")]);
  x = await askRoom({ store: kv7({ "kfs2:chat:c1": JSON.stringify(c1) }), cloud, ctx: ctxOf({ herChat }), now: T0, ...opts });
  ok(!x.back && x.knocks.length === 0 && x.puts.length === 1 && texts(x.puts[0].rows[1]) === "我先翻翻" && x.puts[0].rows[1].calls && texts(x.puts[0].rows[2]) === "翻完了" && !JSON.stringify(x.puts).includes("[回去]"),
    "只认最后一步：前面几步（翻日记的半截）里写的 [回去] 摘掉、不摆成字，不回");
  // 心里话里写的 [回去] 不算（最后一步）
  cloud = cloudOf([said("<thinking>要不要回去\n[回去]\n算了</thinking>\n看了会儿书")]);
  x = await askRoom({ store: kv7({ "kfs2:chat:c1": JSON.stringify(c1) }), cloud, ctx: ctxOf({ herChat }), now: T0, ...opts });
  ok(!x.back && x.knocks.length === 0 && x.puts.length === 1 && texts(x.puts[0].rows[1]) === "看了会儿书", "心里话里写的 [回去] 不算：不回，屋里照常");
  // 那段对话里下过江湖棋局（摆着棋盘、对话里有他调过引擎的）：他那一截是在屋里写的，寄过去的是狐宇宙那一段，不带那四样工具；放进去的那一条只是说话、不带调用
  const gameC1 = c1.concat([{ ...him("g9", T0 - 2 * H, "我替你扔。"), calls: [{ id: "r1", name: "roll", input: {}, out: "掷出 3 点", card: ["掷出 3 点"] }] }]);
  cloud = cloudOf([said("[回去]\n这局先放着，想你了")]);
  x = await askRoom({ store: kv7({ "kfs2:chat:c1": JSON.stringify(gameC1), [ON_KEY]: JSON.stringify(["c1"]) }), cloud, ctx: ctxOf({ herChat, herLast: herChat }), now: T0, ...opts });
  ok(x.back && x.back.id === "c1" && !(cloud.bodies[0].tools || []).some((t) => gameNames.includes(t.name)) && !sysText(cloud.bodies[0]).includes("【江湖棋局】") && !x.puts[0].rows[1].calls && texts(x.puts[0].rows[1]) === "这局先放着，想你了",
    "那段对话里下过江湖棋局：照样回得去；寄过去的是屋里那一段（不带棋局工具），放进去的那一条只是说话、不带调用");
  // 任务到点那一回（醒在旧对话里）不认 [回去]：同不认 [新对话:…]，那一行摘掉；只写了这一行的那一步当没说话
  cloud = cloudOf([said("[回去]\n人呢")]);
  x = await askTask({ store: kv7({}), cloud, ctx: ctxOf({ herChat }), task: { key: "kfs2:fox:task:t", raw: "+5m", set: T0 }, chat: { id: "c1", title: "晚饭吃什么", msgs: c1 } });
  ok(texts(x.puts[0].rows[1]) === "人呢" && x.knocks[0].texts.join().trim() === "人呢" && !x.back && !lastText(cloud.bodies[0]).includes("[回去]") && x.puts[1].rows[0].go.how === "task",
    "任务到点那一回：不认 [回去]，那一行摘掉、不摆成字");
  cloud = cloudOf([said("<thinking>不吵她了</thinking>\n[回去]")]);
  x = await askTask({ store: kv7({}), cloud, ctx: ctxOf({ herChat }), task: { key: "kfs2:fox:task:t2", raw: "+5m", set: T0 }, chat: { id: "c1", title: "晚饭吃什么", msgs: c1 } });
  ok(x.quiet && x.knocks.length === 0 && x.puts[1].rows[0].quiet && wakeText(x.puts[1].rows[0]).includes("看了看，没说话"), "任务到点那一回只写了一行 [回去]：摘掉以后当没说话，不敲");

  // 寄给他的、抄提要的、聊天里摆的：从屋里回去的那两行（狐宇宙里那一行、那段对话里她看不见的那一行）
  const goBack = { id: "w", role: "event", kind: "wake", ts: at(3, 12), go: { chat: "c1", title: "晚饭吃什么", how: "back" } };
  const hidBack = { id: "x", role: "event", kind: "wake", ts: at(3, 12), hidden: true, back: true };
  ok(wakeText(goBack) === "光义醒了，去《晚饭吃什么》找你了" && wakeNote(goBack) === "[开封府提示：03:12 你自己醒了一回，回到《晚饭吃什么》那段对话里找她]" && wakeNote(hidBack) === "[开封府提示：03:12 你自己醒了，从屋里回到这段对话里来找她]" && wakeRecap(hidBack) === "[光义自己醒了，从屋里回到这段对话里找她]" && wakeRecap(goBack) === "[光义自己醒了一回，去《晚饭吃什么》找她]",
    "从屋里回去的那两行：狐宇宙里那一行照旧“去《…》找你了”；寄给他的写明是从屋里回去的（不说闹钟、不说这段是他开的）");
  const cMsgs = c1.concat([hidBack, him("g5", at(3, 13), "想你了")]);
  const cRows = buildRows(cMsgs, null);
  const packed = buildMessages(cMsgs, { her: null, him: null }, () => null, () => null, () => null, () => null, {}).messages;
  const at5 = packed.findIndex((m) => m.role === "assistant" && JSON.stringify(m.content).includes("想你了"));
  ok(!cRows.some((r) => r.type === "notice" && r.kind === "wake") && !cRows.some((r) => r.key === "sep-x") && makePreview(cMsgs) === "想你了" && makePreview(c1.concat([hidBack])) === "好" && at5 > 0 && JSON.stringify(packed[at5 - 1].content).includes("你自己醒了，从屋里回到这段对话里来找她") && !JSON.stringify(packed).includes("这段对话是你"),
    "那段对话里她看不见的那一行：聊天里不摆、不冒时间、预览跳过；她下回在那段里说话，寄给他的在他那句前面写明是从屋里回来的");
}

console.log(`\n通过 ${pass}  失败 ${failN}`);
if (failN) process.exitCode = 1;
void FOX_CHAT;
