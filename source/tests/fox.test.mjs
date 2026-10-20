// 狐宇宙（他自己醒，见 src/fox.js、alarm/）：几点醒的规矩、[WAKE:…] 怎么拆怎么认、南衙那一行写什么、【醒来】那一段写什么。
// esbuild 打成一个文件在 Node 里跑（见 package.json 的 test:unit）
import { parseReply } from "../src/reply.js";
import { FOX_CHAT, isWakeMark, wakeText, wakeNote, wakeRecap, unseenOf, foxSub, alarmLine, whenText, gapOf, maxOf, wakeOn, ASLEEP_MS } from "../src/fox.js";
import { buildMessages } from "../src/prompt/messages.js";
import { buildRows } from "../src/chat/rows.js";
import { makePreview } from "../src/chat/overview.js";
import { parseWake, planNext, lastMark, fracOf, RHYTHM_MIN, RHYTHM_MAX, RESUME_MIN, RESUME_MAX, PRESENT_PUSH, RETRY_MS, DAY_MS, OWED_MS } from "../alarm/plan.js";
import { wakeSection, wakeNowNote, tailTranscript, agoText, HER_WORDS } from "../alarm/note.js";
import { doorsOf, idsDeep, putRows, toRescue, commitWake, owedOf } from "../alarm/wake.js";
import { loadSecret } from "../alarm/secret.js";
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
  ok(foxSub({ on: false, state: null, unseen: 1, now }) === "他留了话，还没看" && foxSub({ on: true, state: { at: now }, unseen: 3, now }) === "他留了 3 回话，还没看", "南衙那一行：有没看的，先说这个");
  ok(unseenOf([{ role: "him", ts: 5 }, { role: "event", kind: "wake", ts: 9 }, { role: "him", ts: 10 }, { role: "her", ts: 11 }], 6) === 1 && unseenOf([], 0) === 0, "没看过的：只数他说的话（只醒了一下的那几行不算），看到哪儿以后的");
  ok(alarmLine(null, now) === "家里的闹钟还没装" && alarmLine({ at: now, last: at(13, 2), next: at(16, 40) }, now) === "闹钟在跑：上回 13:02 醒，下回约 16:40" && alarmLine({ at: now }, now) === "闹钟在跑：还没醒过" && alarmLine({ at: now - ASLEEP_MS - 1 }, now).startsWith("笔记本睡着了"),
    "账户面板那一句：没装、在跑（上回、下回）、还没醒过、笔记本睡着");
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
  const bundle = { at: Date.now(), rows: [{ id: "e7", role: "event", kind: "wake", ts: 30 }], say: ["一", "二", "三"], title: "光义", newAvatar: { type: "meme", file: "a.jpg" }, newName: null, cost: 0.01, steps: 1, quiet: false };
  const marks = [];
  const r5 = await commitWake({ store: s5, cloud: cloud5, bundle, done: { put: true, base: ["e1"], usage: true, avatar: true, said: 1, knocked: 1 }, mark: async (step, v, extra) => void marks.push([step, v, extra]) });
  ok(seen.pull === 0 && seen.sets.length === 0 && seen.push.join() === "二,三" && r5.knocked === 3 && r5.base.join() === "e1" && marks.some((x) => x[0] === "said" && x[1] === 3) && marks.some((x) => x[0] === "knock"),
    `再放一遍（上回办到一半）：不再放进对话、不再换头像、不再记用量，横幅接着敲没敲的那两条（敲了：${seen.push.join("、")}）`);
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

// ================= 【醒来】那一段 =================
{
  const now = at(16, 0);
  const s = wakeSection({ now, herLast: { ts: at(13, 30), title: "周末去哪", fox: false }, lastWake: at(12, 0), n: 3, gap: 30, max: 12, transcript: "卿卿：困了\n你：去睡" });
  ok(s.startsWith("【醒来】（开封府附上的，不是她说的话）") && s.includes(HER_WORDS) && s.includes("2 个钟头 30 分钟前") && s.includes("《周末去哪》") && s.includes("4 个钟头前") && s.includes("卿卿：困了\n你：去睡") && s.includes("[WAKE:+3h]") && s.includes("[WAKE:off]") && s.includes("这一回是第 3 回") && s.includes("最快隔 30 分钟"),
    "【醒来】：她的原话照抄、她多久前在哪段对话里说的话、他上回几点醒、那段对话最后几句、怎么定下回几点醒、两道闸");
  const first = wakeSection({ now, herLast: null, lastWake: 0, n: 1, gap: 120, max: 6, transcript: "" });
  ok(first.includes("她还没在开封府里说过话") && first.includes("这是你头一回自己醒") && first.includes("最快隔 2 个钟头") && !first.includes("最后几句"), "【醒来】：头一回、她没说过话、没有可抄的");
  const net = wakeSection({ now, herLast: null, lastWake: 0, n: 1, gap: 30, max: 12, transcript: "", mcps: ["tavily"] });
  ok(net.includes("她给你接了 “tavily”，想用就用") && first.includes("上网还没接上") && !net.includes("上网还没接上"), "【醒来】：她接了 tavily（MCP 开着），告诉他能上网；没接的时候照实说");
  const inFox = wakeSection({ now, herLast: { ts: at(15, 50), title: "狐宇宙", fox: true }, lastWake: at(15, 0), n: 2, gap: 30, max: 12, transcript: "" });
  ok(inFox.includes("她最后一回说话就在狐宇宙里，10 分钟前"), "【醒来】：她最后就在狐宇宙里说的：不另抄，说就是上面那几句");
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

console.log(`\n通过 ${pass}  失败 ${failN}`);
if (failN) process.exitCode = 1;
void FOX_CHAT;
