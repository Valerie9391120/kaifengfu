// 家里的闹钟走一遍（狐宇宙，见 alarm/、src/fox.js），对着假 Supabase：
//   装（setup：登录、对暗号、凭据封好——测试的机器不是 Windows，存的是明文——拉一遍存档）；暗号不对装不上；
//   叫醒一回、他什么也没说（只写了心里话和 [WAKE:off]）：狐宇宙里只留醒了那一行，不敲手机；
//   再叫醒一回（她在狐宇宙里说过一句、他回过了）、他翻了日记再说话：替他翻、递回去接着要，两步都放进狐宇宙，敲了横幅（心里话、[WAKE:…] 不上横幅），点了回到狐宇宙；
//   寄过去的是名帖加狐宇宙那段对话，后面附着【醒来】那一段（她的原话照抄）；
//   醒在屋里：去园子里浇水、去妆台前换一身完成今天的搭配，闹钟替他办，屋里只留一行小字，不敲她；今天完成过了，再醒不给“完成搭配”；
//   后台跑（run）：心跳写上了，下回几点醒照他定的；手机那头没看见就把狐宇宙盖掉了，放回去；
//     她在手机上删了他的一句、改了自己的话（后面的收进翻过去的那一支），不放回去；
//     后台在跑的时候手敲 wake：交给后台叫；问到了却一时放不进存档，封好记着，过一会儿只再放、不再问他一遍、横幅不重敲；
//     她在狐宇宙里说的那句还没回上（回话在信箱里）：不叫他；
//     任务标记：到点在定闹钟的那段对话里醒、找她、接着追、不追了就收；没到点她先回来了，作废；
//   想找她：开一段新对话（敲她，点了进那段）；醒在屋里写的字不敲她；
//     这台电脑上记着的（state.json）、日志里，一个他说的字都没有；
//   后台在跑的时候重装：叫旧的自己停、换新的跑起来；
//   卸干净（后台那一个也停了）。
// 先起假 Supabase（npm run mock &）。跑：npm run test:alarm（会先打好闹钟的测试包）
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { deriveVault, seal, unseal, rowKeyFor, toB64 } from "../src/vault.js";
import { forkAt } from "../src/thread.js";

const BASE = "http://127.0.0.1:8787";
const BUNDLE = path.resolve("alarm/dist/kfs-alarm-test.mjs");
const EMAIL = "qing@example.com";
const PASSWORD = "correct-horse";
const PASS = "月亮与六便士";
const ITER = 2000; // 测试里少算几轮（真的是六十万轮；闹钟照库房里记着的轮数算）
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => (await fetch(BASE + p)).json();

// ---------- 她手机上已经有的：暗号、设置、名帖、一段对话、日记、一台登记了通知的手机 ----------
await get("/__debug/reset");
await get("/__debug/push-secrets?make=1");
const login = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json", apikey: "sb_publishable_test" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
const H = { apikey: "sb_publishable_test", Authorization: "Bearer " + login.access_token, "Content-Type": "application/json" };
const salt = crypto.getRandomValues(new Uint8Array(16));
const vault = await deriveVault(PASS, salt, ITER);
const now = Date.now();
const day = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const yesterday = day(now - 24 * 3600 * 1000);
const phone = await get("/__debug/push-device");
await fetch(`${BASE}/rest/v1/push_subs?on_conflict=user_id,endpoint`, { method: "POST", headers: H, body: JSON.stringify({ endpoint: phone.endpoint, p256dh: phone.p256dh, auth: phone.auth, page: "http://127.0.0.1:8080/" }) });
const kv = {
  "kfs2:settings": JSON.stringify({ model: "claude-sonnet-4-6", maxTokens: 2048, wake: true }),
  "kfs2:memindex": JSON.stringify([{ id: "m1", name: "名帖.md", enabled: true, size: 10 }]),
  "kfs2:mem:m1": "你是光义，她是卿卿。（测试名帖）",
  "kfs2:index": JSON.stringify([{ id: "c1", title: "周末去哪", preview: "去睡", updatedAt: now - 3 * 3600 * 1000 }]),
  "kfs2:chat:c1": JSON.stringify([
    { id: "h1", role: "her", ts: now - 3 * 3600 * 1000 - 60000, text: "困了，先睡" },
    { id: "g1", role: "him", ts: now - 3 * 3600 * 1000, raw: "去睡", items: [{ type: "text", text: "去睡" }] },
  ]),
  [`kfs2:diary:${yesterday.slice(0, 7)}`]: JSON.stringify({ [yesterday]: { her: { text: "（测试日记）今天去运河边走了一圈，泡桐花开了。", moods: ["开心"], updatedAt: now - 86400000 } } }),
  "kfs2:fox:doors": JSON.stringify({ dPhone: phone.endpoint }),
};
const put = async (pairs) => {
  const rows = [];
  for (const [k, v] of Object.entries(pairs)) rows.push({ key: await rowKeyFor(vault, k), value: await seal(vault, JSON.stringify({ k, v })) });
  await fetch(`${BASE}/rest/v1/kv`, { method: "POST", headers: H, body: JSON.stringify(rows) });
};
await fetch(`${BASE}/rest/v1/kv`, {
  method: "POST",
  headers: H,
  body: JSON.stringify([
    { key: "m_kdf", value: JSON.stringify({ v: 1, salt: toB64(salt), iter: ITER }) },
    { key: "m_check", value: await seal(vault, "开封府") },
  ]),
});
await put(kv);
// 从库房里取出来解开（拿的是假 Supabase 的底账）
const read = async (k) => {
  const rk = await rowKeyFor(vault, k);
  const row = (await get("/__debug/rows")).find((r) => r.key === rk);
  if (!row) return null;
  const p = JSON.parse(await unseal(vault, row.value));
  return p.d ? null : p.v;
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kfs-alarm-"));
// 手敲的 wake 两分钟以内不再叫：测试里一回接一回地叫，拨成 0（专门试这一条的那一处另拨回来）
const env = { ...process.env, KFS_ALARM_HOME: HOME, KFS_ALARM_PLAIN: "1", KFS_ALARM_NOSTART: "1", KFS_ALARM_EMAIL: EMAIL, KFS_ALARM_PASSWORD: PASSWORD, KFS_ALARM_PASS: PASS, KFS_ALARM_MANUAL_GAP: "0" };
const alarm = (args, extra = {}) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [BUNDLE, ...args], { env: { ...env, ...extra }, encoding: "utf8", timeout: 120000 }) };
  } catch (e) {
    return { code: e.status || 1, out: String(e.stdout || "") + String(e.stderr || "") };
  }
};

// ---------- 装 ----------
const wrong = alarm(["setup"], { KFS_ALARM_PASS: "不是这个" });
ok(wrong.code === 1 && wrong.out.includes("暗号不对") && !fs.existsSync(path.join(HOME, "secret.txt")), "装：暗号不对，装不上，凭据不存");
const badLogin = alarm(["setup"], { KFS_ALARM_PASSWORD: "wrong" });
ok(badLogin.code === 1 && badLogin.out.includes("登录没成"), "装：密码不对，照实说登录没成");
const s = alarm(["setup"]);
const secret = fs.readFileSync(path.join(HOME, "secret.txt"), "utf8");
ok(s.code === 0 && s.out.includes("暗号对上了") && s.out.includes("拉完了") && !s.out.includes("还是旧的") && secret.startsWith("plain:") && !secret.includes(PASS),
  "装：登录、对上暗号、拉一遍存档；推送的小后端是新的（会敲他醒来说的话），不提醒；凭据里没有暗号本身（只有算出来的钥匙）");
const rowsDir = fs.readdirSync(path.join(HOME, "rows"));
const onDisk = rowsDir.map((f) => fs.readFileSync(path.join(HOME, "rows", f), "utf8")).join("\n");
ok(rowsDir.length >= Object.keys(kv).length && !onDisk.includes("测试名帖") && !onDisk.includes("困了") && onDisk.includes('"v":"v1.'), `装：存档拉到这台电脑上（${rowsDir.length} 行），磁盘上是云端原样的密文，一个明文字都没有`);

// ---------- 叫醒一回：他什么也没说 ----------
await get("/__debug/reply-queue?text=" + encodeURIComponent("<thinking>她睡得正香，不吵她</thinking>\n[WAKE:off]"));
const n0 = (await get("/__debug/push")).delivered.length;
const w1 = alarm(["wake"]);
let fox = JSON.parse((await read("kfs2:chat:hyz")) || "[]");
ok(w1.code === 0 && w1.out.includes("醒过了") && fox.length === 1 && fox[0].kind === "wake" && fox[0].quiet === true && fox[0].wake === "off" && fox[0].thinking === "她睡得正香，不吵她",
  "叫醒一回、他只写了心里话和 [WAKE:off]：狐宇宙里只留醒了那一行（记着这一回一个字没留、他的心里话、他定的 off）");
await sleep(1500);
ok((await get("/__debug/push")).delivered.length === n0, "叫醒一回、他什么也没说：不敲手机");
const idx = JSON.parse(await read("kfs2:index"));
ok(idx[0].id === "hyz" && idx[0].title === "狐宇宙" && idx.some((c) => c.id === "c1"), "目录里有了狐宇宙那一条（手机那头不往历史对话里列），原来的对话还在");
const st1 = JSON.parse(await read("kfs2:fox:state"));
ok(st1.off === true && !st1.awake && st1.last === fox[0].ts && st1.at > now, "心跳：醒完了，记着上回几点醒、他说先不醒");
const ask1 = (await get("/__debug/claude")).pop().body;
const lastUser = ask1.messages[ask1.messages.length - 1];
const lastText = lastUser.content.map((b) => b.text || "").join("\n");
const sys = Array.isArray(ask1.system) ? ask1.system.map((b) => b.text).join("") : ask1.system;
ok(sys.includes("测试名帖") && sys.includes("【回复格式】") && lastText.includes("【醒来】") && lastText.includes("你想干嘛都行——玩手账") && lastText.includes("现在的时间（她那边的钟）") && lastText.includes("《周末去哪》") && lastText.includes("卿卿：困了，先睡") && lastText.includes("这是你头一回自己醒"),
  "寄过去的：名帖照手机那头的拼法；最后一句后面附着【醒来】（她的原话照抄、她在哪段对话里最后说的、那段对话最后几句、头一回醒）");
ok((ask1.tools || []).some((t) => t.name === "diary_read") && ask1.max_tokens === 2048 && ask1.model === "claude-sonnet-4-6", "寄过去的：带着翻日记那几样工具，模型、回复长度照她的设置");

// ---------- 再叫醒一回：他翻了日记再说话 ----------
// 她在狐宇宙里说过一句“翻日记 某天”，他回过她了（假的那边的我照这句去翻）
fox = JSON.parse(await read("kfs2:chat:hyz"));
const herAt = Date.now() - 60 * 1000;
await put({
  "kfs2:chat:hyz": JSON.stringify(
    fox.concat([
      { id: "hz1", role: "her", ts: herAt, text: `翻日记 ${yesterday}` },
      { id: "gz1", role: "him", ts: herAt + 2000, raw: "好，等我醒了翻", items: [{ type: "text", text: "好，等我醒了翻" }] },
    ])
  ),
});
await get("/__debug/reply-queue?text=" + encodeURIComponent("<thinking>她去看泡桐花了</thinking>\n醒了，翻了翻你昨天写的\n[SPLIT]\n泡桐花好看吗\n[WAKE:+3h]"));
const w2 = alarm(["wake"]);
fox = JSON.parse(await read("kfs2:chat:hyz"));
const ev2 = fox[3];
const step1 = fox[4];
const step2 = fox[5];
ok(w2.code === 0 && fox.length === 6 && fox[1].id === "hz1" && fox[2].id === "gz1" && ev2.kind === "wake" && !ev2.quiet && step1.role === "him" && step1.calls && step1.calls[0].name === "diary_read" && typeof step1.calls[0].out === "string" && step1.calls[0].out.includes("泡桐花") && step1.calls[0].note,
  "再叫醒一回：他翻了日记，闹钟替他翻（翻到的是那一天的日记，聊天里有一行小字），放进狐宇宙");
ok(step2.role === "him" && step2.items.map((x) => x.text).join("|") === "醒了，翻了翻你昨天写的|泡桐花好看吗" && step2.wake === "+3h" && step2.thinking === "她去看泡桐花了" && !step2.stop,
  "再叫醒一回：结果递回去，他接着说完（[WAKE:+3h] 不显示成字，记在这一条上）");
const ask2 = (await get("/__debug/claude")).slice(-2);
ok(ask2[1].body.messages.some((m) => m.role === "user" && m.content.some((b) => b.type === "tool_result")) && ask2[1].body.messages[ask2[1].body.messages.length - 1].content.some((b) => (b.text || "").includes("【醒来】")) && ask2[0].body.messages.some((m) => m.content.some((b) => (b.text || "").includes("[开封府提示：") && b.text.includes("你自己醒了一回，那一回什么也没说"))),
  "再叫醒一回：接着要的那一回带着翻到的结果，【醒来】那一段还在；上一回他什么也没说，这一回他看得见（一行开封府提示）");
await sleep(2500);
ok((await get("/__debug/push")).delivered.length === n0, "醒在自己屋里、写的字落在便签纸上：不敲她的手机（她 22:04 定的）");
const usage = JSON.parse(await read(`kfs2:usage:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`));
ok(usage && usage.replies === 3 && usage.cost > 0, `用量：记进本月（醒了三步，约 $${usage && usage.cost.toFixed(4)}），手机上 API 那一格照常看得到`);
// 刚叫完又敲一遍 wake（手抖、等不及）：两分钟以内不再叫
const nAskGap = (await get("/__debug/claude")).length;
const again2 = alarm(["wake"], { KFS_ALARM_MANUAL_GAP: "120000" });
ok(again2.out.includes("他刚醒过") && (await get("/__debug/claude")).length === nAskGap, "刚叫完又敲一遍 wake：两分钟以内不再叫（不多花一回钱）");

// ---------- 他屋里的园子（恩师写的引擎，alarm/garden.js）：醒在屋里，去院子里浇了水 ----------
await get("/__debug/tool-queue?name=play_garden&input=" + encodeURIComponent(JSON.stringify({ action: "water" })) + "&text=" + encodeURIComponent("去院子里看看"));
await get("/__debug/reply-queue?text=" + encodeURIComponent("浇过水了，叶子绿绿的"));
const nAskG = (await get("/__debug/claude")).length;
const nPushG = (await get("/__debug/push")).delivered.length;
const wG = alarm(["wake"]);
fox = JSON.parse(await read("kfs2:chat:hyz"));
const gStep = fox.find((m) => m.role === "him" && (m.calls || []).some((c) => c.name === "play_garden"));
const gardenSt = JSON.parse((await read("kfs2:garden")) || "{}");
const asksG = (await get("/__debug/claude")).slice(nAskG).map((x) => x.body);
const askG0 = asksG[0] ? JSON.stringify(asksG[0].messages) : "";
const askG1 = asksG[1] ? JSON.stringify(asksG[1].messages) : "";
ok(wG.code === 0 && asksG.length === 2 && (asksG[0].tools || []).some((t) => t.name === "play_garden") && askG0.includes("去院子里种花") && askG0.includes("还没进去过"),
  "醒在屋里：带着园子那一样工具，【醒来】里告诉他园子眼下的样子（还没进去过）");
ok(gStep && gStep.calls[0].note === "去园子里浇了水" && askG1.includes("缘识") && askG1.includes("浇了一圈水") && gardenSt.currentPlant === "peony_weizi" && gardenSt.careDays === 1 && fox[fox.length - 1].items.map((x) => x.text).join() === "浇过水了，叶子绿绿的",
  "他去院子里浇了水：闹钟替他办（头一回先推开园门，那首诗给他看），存档记进 kfs2:garden，屋里一行小字“去园子里浇了水”，他接着说完");
await sleep(1500);
ok((await get("/__debug/push")).delivered.length === nPushG && !fs.readFileSync(path.join(HOME, "state.json"), "utf8").includes("魏紫"), "园子里的动静不敲她；这台电脑上记着的里头没有园子里的字");

// ---------- 他屋里的妆台（恩师写的引擎，alarm/dressing.js）：醒在屋里，换了一身，完成了今天的搭配 ----------
await get("/__debug/tool-queue?name=play_dressing_room&input=" + encodeURIComponent(JSON.stringify({ action: "select", category: "outfit", itemId: "outfit_black_turtleneck" })) + "&text=" + encodeURIComponent("去妆台前玩一会儿"));
await get("/__debug/tool-queue?name=play_dressing_room&input=" + encodeURIComponent(JSON.stringify({ action: "complete" })));
await get("/__debug/reply-queue?text=" + encodeURIComponent("换好了，今天就这一身"));
const nAskD = (await get("/__debug/claude")).length;
const nPushD = (await get("/__debug/push")).delivered.length;
const wD = alarm(["wake"]);
fox = JSON.parse(await read("kfs2:chat:hyz"));
const dNotes = fox.filter((m) => m.role === "him" && (m.calls || []).some((c) => c.name === "play_dressing_room")).flatMap((m) => m.calls.map((c) => c.note)).filter(Boolean);
const dressSt = JSON.parse((await read("kfs2:dressing")) || "{}");
const asksD = (await get("/__debug/claude")).slice(nAskD).map((x) => x.body);
const dTool = (b) => (b && b.tools ? b.tools.find((t) => t.name === "play_dressing_room") : null);
const askD0 = asksD[0] ? JSON.stringify(asksD[0].messages) : "";
const askD2 = asksD[2] ? JSON.stringify(asksD[2].messages) : "";
ok(wD.code === 0 && asksD.length === 3 && dTool(asksD[0]) && dTool(asksD[0]).input_schema.properties.action.enum.includes("complete") && (asksD[0].tools || []).some((t) => t.name === "play_garden") && askD0.includes("去妆台前玩换装") && askD0.includes("妆台你还没去过") && askD0.includes("不是你这会儿真穿着什么"),
  "醒在屋里：园子、妆台两样工具都带着（今天还没完成搭配，有 complete）；【醒来】里说这是个换装小游戏、妆台还没去过");
ok(dNotes.join("|") === "在妆台前换了换行头|完成了今天的搭配：披发、素面、不熏香；衣柜：高领黑毛衣" && askD2.includes("衣柜、妆台和配饰已经准备好了") && askD2.includes("今天的搭配完成了") && askD2.includes("成就解锁——初整衣冠") && dressSt.completedLook && dressSt.completedLook.date === day(Date.now()) && dressSt.completedLook.appearance.outfits.includes("outfit_black_turtleneck") && fox[fox.length - 1].items.map((x) => x.text).join() === "换好了，今天就这一身",
  "他换了一身、完成了今天的搭配：闹钟替他办（头一回先推开，开场那段给他看），成就给他看，存档记进 kfs2:dressing；屋里两行小字，完成的那一行写那一身；他接着说完");
await sleep(1500);
const stateD = fs.readFileSync(path.join(HOME, "state.json"), "utf8");
ok((await get("/__debug/push")).delivered.length === nPushD && !/高领黑毛衣|初整衣冠|换好了/.test(stateD), "妆台前的动静不敲她；这台电脑上记着的里头没有妆台上的字");
// 同一天再醒一回：今天完成过了，妆台那一样工具里不给 complete；【醒来】里说今天的搭配已经完成了
await get("/__debug/reply-queue?text=" + encodeURIComponent("<thinking>今天的已经换过了，歇着</thinking>"));
const nAskD3 = (await get("/__debug/claude")).length;
const wD3 = alarm(["wake"]);
const askD3 = (await get("/__debug/claude")).slice(nAskD3).map((x) => x.body)[0];
const enumD3 = dTool(askD3) ? dTool(askD3).input_schema.properties.action.enum : [];
// 【醒来】那一段（最后一句后面附的）：只说今天完成过没有、点亮了几个，完成的那一身一个字都不提
const lastD3 = askD3 ? askD3.messages[askD3.messages.length - 1].content.map((b) => b.text || "").join("\n") : "";
const textD3 = lastD3.slice(lastD3.indexOf("【醒来】"));
ok(wD3.code === 0 && dTool(askD3) && !enumD3.includes("complete") && enumD3.includes("mirror") && enumD3.includes("select") && lastD3.includes("【醒来】") && textD3.includes("今天的搭配已经完成了") && textD3.includes("成就点亮了") && !/高领黑毛衣|披发|素面|不熏香/.test(textD3),
  "同一天再醒一回：今天完成过了，妆台那一样工具里没有 complete（照镜子、换着玩照旧）；【醒来】里说今天的搭配已经完成了，不说他穿着什么");

// ---------- 想找她：开一段新对话 ----------
await get("/__debug/reply-queue?text=" + encodeURIComponent("<thinking>想她了</thinking>\n屋里写两句：今天风好大\n[新对话:想你了]\n在干嘛\n[SPLIT]\n理理我\n[WAKE:+2h]"));
const nPushNew = (await get("/__debug/push")).delivered.length;
const wNew = alarm(["wake"]);
const idxNew = JSON.parse(await read("kfs2:index"));
const newEntry = idxNew.find((c) => c.id !== "hyz" && c.id !== "c1");
const newChat = newEntry ? JSON.parse((await read("kfs2:chat:" + newEntry.id)) || "[]") : [];
fox = JSON.parse(await read("kfs2:chat:hyz"));
const goNew = fox.find((m) => m.kind === "wake" && m.go && m.go.how === "new");
const roomNote = fox[fox.length - 1];
ok(wNew.code === 0 && wNew.out.includes("开了一段新对话") && newEntry && newEntry.title === "想你了" && newEntry.preview === "在干嘛" && newChat.length === 2 && newChat[0].hidden && newChat[1].items.map((x) => x.text).join("|") === "在干嘛|理理我",
  "想找她：单独一行的 [新对话:想你了] 后面那几句落进一段新开的对话（名字他起的，进她的历史对话），最前头一行她看不见");
ok(goNew && goNew.go.chat === newEntry.id && goNew.go.title === "想你了" && roomNote.role === "him" && roomNote.items.map((x) => x.text).join("|") === "屋里写两句：今天风好大" && roomNote.thinking === "想她了",
  "想找她：狐宇宙里留一行“开了一段新对话《想你了》找你”，那一行前面写的留在屋里的便签纸上");
ok(roomNote.wake === "+2h" && !("wake" in newChat[1]) && (await read("kfs2:fox:task:" + newChat[1].id)) == null,
  "想找她：最后那一行 [WAKE:+2h] 管的还是他下回几点醒（记在屋里），不在新对话里定闹钟");
await sleep(3000);
const pushesNew = (await get("/__debug/push")).delivered.slice(nPushNew);
const tagNew = (await rowKeyFor(vault, "notice:" + newEntry.id)).slice(2);
ok(pushesNew.length === 2 && pushesNew.map((d) => d.json.notification.body).join("|") === "在干嘛|理理我" && pushesNew.every((d) => d.endpoint === phone.endpoint && d.json.notification.navigate.startsWith(`http://127.0.0.1:8080/#n=r.${tagNew}.`)),
  `想找她：一个气泡一条横幅，点了进那段新对话（${pushesNew.length} 条）`);

// ---------- 后台跑 ----------
// 跟后台那一个说话的那根管子（测试的机器上是文件夹里的 alarm.sock）：问它是谁
const pingSock = () =>
  new Promise((resolve) => {
    const c = net.connect(path.join(HOME, "alarm.sock"));
    let buf = "";
    const t = setTimeout(() => {
      c.destroy();
      resolve(null);
    }, 2000);
    c.on("connect", () => c.write(JSON.stringify({ op: "ping" }) + "\n"));
    c.on("data", (d) => {
      buf += d;
      const i = buf.indexOf("\n");
      if (i < 0) return;
      clearTimeout(t);
      c.destroy();
      try {
        resolve(JSON.parse(buf.slice(0, i)));
      } catch (e) {
        resolve(null);
      }
    });
    c.on("error", () => {
      clearTimeout(t);
      resolve(null);
    });
  });
const waitChat = async (cond, ms = 6000) => {
  let v = [];
  for (let t = 0; t < ms; t += 250) {
    await sleep(250);
    v = JSON.parse((await read("kfs2:chat:hyz")) || "[]");
    if (cond(v)) break;
  }
  return v;
};

// 手机那头差不多同时写了狐宇宙（它那一份还没有闹钟刚放的几行）：盖掉了；目录也拿旧的那份盖掉了（还没有他新开的那段）
const before = JSON.parse(await read("kfs2:fox:state"));
await put({ "kfs2:chat:hyz": JSON.stringify(fox.slice(0, 3)), "kfs2:index": JSON.stringify(idxNew.filter((c) => c.id !== newEntry.id)) });
const child = spawn(process.execPath, [BUNDLE, "run"], { env: { ...env, KFS_ALARM_TICK: "500", KFS_ALARM_PULL: "500" }, stdio: "ignore" });
let st2 = null;
let back = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  st2 = JSON.parse((await read("kfs2:fox:state")) || "null");
  back = JSON.parse((await read("kfs2:chat:hyz")) || "[]");
  if (st2 && st2.at > before.at && back.length === fox.length) break;
}
ok(st2 && st2.at > before.at && st2.next && Math.abs(st2.next - (roomNote.ts + 2 * 3600 * 1000)) < 5000 && !st2.off, `后台跑：心跳写上了，下回打算照他定的 +2h（${st2 && new Date(st2.next).toTimeString().slice(0, 5)}）`);
let idxBack = [];
for (let i = 0; i < 20; i++) {
  idxBack = JSON.parse((await read("kfs2:index")) || "[]");
  if (idxBack.some((c) => c.id === newEntry.id)) break;
  await sleep(250);
}
const relisted = idxBack.find((c) => c.id === newEntry.id);
ok(relisted && relisted.title === "想你了", "后台跑：手机那头拿旧目录盖掉了，他新开的那段从历史对话里掉了：补回去（名字照旧）");
ok(back.length === fox.length && back.map((m) => m.id).join() === fox.map((m) => m.id).join(), "后台跑：手机那头没看见就把狐宇宙盖掉了（闹钟后来放的两回都没了），放回去，次序照旧");

// 她在手机上删了他的一句（手机那头是看见过这几行的）：不放回去
await put({ "kfs2:chat:hyz": JSON.stringify(back.filter((m) => m.id !== step1.id)) });
await sleep(2500);
const afterDel = JSON.parse((await read("kfs2:chat:hyz")) || "[]");
ok(afterDel.length === fox.length - 1 && !afterDel.some((m) => m.id === step1.id), "后台跑：她在手机上删了他的一句（手机那头看见过这几行）：不放回去");

// 后台在跑的时候手敲 wake：交给后台叫。问到了，一时放不进存档（库房不应）：封好记着，过一会儿只再放，不再问他一遍
const nAsk = (await get("/__debug/claude")).length;
await get("/__debug/reply-queue?text=" + encodeURIComponent("<thinking>又想她了</thinking>\n又醒了一回，看看你在不在"));
await get("/__debug/kv-fail?times=1&key=" + encodeURIComponent(await rowKeyFor(vault, "kfs2:chat:hyz")));
const nPush3 = (await get("/__debug/push")).delivered.length;
const w3 = alarm(["wake"]);
const midState = fs.readFileSync(path.join(HOME, "state.json"), "utf8");
const n3 = afterDel.length + 3; // 这一回：醒了那一行、翻日记那一步、说完的那一步
const fox3 = await waitChat((v) => v.length === n3);
await sleep(2500);
const asks3 = (await get("/__debug/claude")).length - nAsk;
const pushes3 = (await get("/__debug/push")).delivered.length - nPush3;
// （她在狐宇宙里最后说的还是“翻日记 某天”，假的那边的我照样先翻一回：这一回醒是两步）
const him3 = fox3[n3 - 1] || {};
ok(w3.code === 0 && w3.out.includes("交给它叫") && w3.out.includes("还没放进去") && fox3.length === n3 && fox3[n3 - 3].kind === "wake" && (fox3[n3 - 2].items || []).map((x) => x.text).join() === "我翻翻。" && (him3.items || []).map((x) => x.text).join() === "又醒了一回，看看你在不在" && asks3 === 2 && pushes3 === 0,
  `后台在跑的时候手敲 wake：交给后台叫；一时放不进存档，过一会儿放进去了，没再问他一遍；醒在屋里不敲她（这一回两步：问了 ${asks3} 回、敲了 ${pushes3} 条，狐宇宙 ${fox3.length} 行）`);
ok(!midState.includes("又醒了一回") && !midState.includes("又想她了"), "放不进去的那一包在这台电脑上只存密文");

// 她在狐宇宙里又说了一句，回话还在信箱里（没放进来）：不叫他（不然她回来，手机认成那句回过了，信箱里那封就扔了）
await put({ "kfs2:chat:hyz": JSON.stringify(fox3.concat([{ id: "hz9", role: "her", ts: Date.now(), text: "晚安" }])) });
const nAsk4 = (await get("/__debug/claude")).length;
const w4 = alarm(["wake"]);
await sleep(1200);
const st4 = JSON.parse((await read("kfs2:fox:state")) || "{}");
ok(w4.out.includes("还没回上") && (await get("/__debug/claude")).length === nAsk4 && st4.next === 0 && !st4.off, "她在狐宇宙里说的那句还没回上：不叫他，后台那一个也不排下一回");

// 她在手机上改了自己的话：后面的对话收进翻过去的那一支。闹钟认得出那几行还在，不往外放
const forked = forkAt(fox3, 1, { id: "hz1b", role: "her", ts: fox3[1].ts, text: "改过的一句" });
await put({ "kfs2:chat:hyz": JSON.stringify(forked) });
await sleep(2500);
const afterFork = JSON.parse((await read("kfs2:chat:hyz")) || "[]");
ok(afterFork.length === 2 && afterFork[1].id === "hz1b" && afterFork[1].alts.length === 2 && afterFork[1].alts[0].after.length === fox3.length - 2, "后台跑：她改了自己的话（后面的收进翻过去的那一支）：不把那几行往外放");

const stateText = fs.readFileSync(path.join(HOME, "state.json"), "utf8");
ok(!/泡桐花|她睡得正香|翻了翻|又醒了一回|又想她了|测试名帖/.test(stateText) && !stateText.includes(PASS), "这台电脑上记着的（state.json）：他说的话、心里话只存密文");

// ---------- 任务标记：他在《周末去哪》里定了闹钟，到点她还没回那段对话，在那段对话里醒、找她 ----------
const c1Before = JSON.parse(await read("kfs2:chat:c1"));
await get("/__debug/reply-queue?text=" + encodeURIComponent("<thinking>她怎么还不来</thinking>\n睡醒了没\n[WAKE:+5m 再找]"));
const nPushT = (await get("/__debug/push")).delivered.length;
const nAskT = (await get("/__debug/claude")).length;
await put({ "kfs2:fox:task:g1": JSON.stringify({ v: 1, chat: "c1", from: "g1", raw: "+1m 去找卿卿", set: Date.now() - 2 * 60 * 1000 }) });
let c1 = [];
for (let i = 0; i < 60; i++) {
  await sleep(250);
  c1 = JSON.parse((await read("kfs2:chat:c1")) || "[]");
  if (c1.length === c1Before.length + 2) break;
}
await sleep(2500);
const t1 = JSON.parse((await read("kfs2:fox:task:g1")) || "{}");
const foxT = JSON.parse(await read("kfs2:chat:hyz"));
const goT = foxT.find((m) => m.go && m.go.how === "task");
const pushesT = (await get("/__debug/push")).delivered.slice(nPushT);
const tagC1 = (await rowKeyFor(vault, "notice:c1")).slice(2);
ok(c1.length === c1Before.length + 2 && c1[c1.length - 2].hidden && c1[c1.length - 1].items.map((x) => x.text).join() === "睡醒了没" && goT && goT.go.chat === "c1" && goT.go.title === "周末去哪",
  "任务到点：醒在他定闹钟的那段对话里找她（她看不见的那一行在前面），狐宇宙里留一行“去《周末去哪》找你了”");
ok(pushesT.length === 1 && pushesT[0].json.notification.body === "睡醒了没" && pushesT[0].json.notification.navigate.startsWith(`http://127.0.0.1:8080/#n=r.${tagC1}.`), "任务到点：敲她，点了进那段对话");
ok(t1.state === "chase" && t1.rounds === 1 && t1.next > Date.now() + 4 * 60 * 1000, "任务到点：他说五分钟以后再找，记下来接着追");
const askT = (await get("/__debug/claude")).slice(nAskT).pop().body;
const lastT = askT.messages[askT.messages.length - 1].content.map((b) => b.text || "").join("\n");
ok(lastT.includes("你记着的是“去找卿卿”") && JSON.stringify(askT.messages).includes("困了，先睡") && !JSON.stringify(askT.messages).includes("翻日记"), "任务到点：寄过去的是那段对话（看得见那段前面的话，不是狐宇宙），后面附着他定闹钟时记着的那句");
ok((askT.tools || []).some((t) => t.name === "diary_read") && !(askT.tools || []).some((t) => t.name === "play_garden" || t.name === "play_dressing_room") && !lastT.includes("妆台") && !lastT.includes("院子"), "任务到点：不带园子、妆台那两样（只在他屋里醒着的时候玩），【醒来】里也不提");
const stT = JSON.parse(await read("kfs2:fox:state"));
ok(stT.next === 0, "追着她的时候：平常那种自己醒先停着（南衙那一行不露任务几点）");
// 装作过了五分钟：接着追第二回
await get("/__debug/reply-queue?text=" + encodeURIComponent("还不理我？\n[WAKE:off]"));
await put({ "kfs2:fox:task:g1": JSON.stringify({ ...t1, next: Date.now() - 1000, last: Date.now() - 6 * 60 * 1000 }) });
let t2 = {};
for (let i = 0; i < 60; i++) {
  await sleep(250);
  t2 = JSON.parse((await read("kfs2:fox:task:g1")) || "{}");
  if (t2.state === "done") break;
}
c1 = JSON.parse(await read("kfs2:chat:c1"));
ok(t2.state === "done" && t2.rounds === 2 && c1[c1.length - 1].items.map((x) => x.text).join() === "还不理我？", "接着追：第二回又找了她一句；他说不追了，这个任务就收了");
// 又定了一个，没到点她先回来了：作废
await put({ "kfs2:fox:task:g9": JSON.stringify({ v: 1, chat: "c1", from: c1[c1.length - 1].id, raw: "+30m", set: Date.now() - 60 * 1000 }) });
await put({ "kfs2:chat:c1": JSON.stringify(c1.concat([{ id: "hC", role: "her", ts: Date.now(), text: "来了来了" }])) });
let t9 = {};
for (let i = 0; i < 60; i++) {
  await sleep(250);
  t9 = JSON.parse((await read("kfs2:fox:task:g9")) || "{}");
  if (t9.state) break;
}
ok(t9.state === "void" && /先回来/.test(t9.why || ""), "任务：没到点她先回来了（那段对话里说了话），作废");

const who = await pingSock();
const again = alarm(["run"]);
ok(who && who.pid === child.pid && who.cmd === "run" && again.out.includes("已经在跑了"), "后台跑：只许一个在跑（占着那根管子），再起一个自己退出");

// 后台在跑的时候重装：叫旧的把手上的办完自己停，换这一版在后台跑起来
const re = alarm(["setup"], { KFS_ALARM_NOSTART: "" });
let who2 = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  who2 = await pingSock();
  if (who2 && who2.pid !== child.pid && (child.exitCode !== null || child.signalCode !== null)) break;
}
ok(re.code === 0 && re.out.includes("后台原来那一个停了") && child.exitCode === 0 && who2 && who2.pid !== child.pid && who2.cmd === "run",
  "重装：后台原来那一个自己停了（不是被杀的），换这一版在后台跑起来");

const stat = alarm(["status"]);
ok(stat.out.includes("在跑") && stat.out.includes("放进去了"), "看看（status）：在跑、最近的日志");
const logText = fs.readFileSync(path.join(HOME, "alarm.log"), "utf8");
ok(!/泡桐花|她睡得正香|翻了翻|又醒了一回|又想她了|魏紫|高领黑毛衣|换好了/.test(logText) && !logText.includes(PASS), "日志：只记几点干了什么，不记他说的话、园子妆台上的字、她的暗号");

// ---------- 卸 ----------
const un = alarm(["uninstall"]);
await sleep(500);
ok(un.out.includes("卸干净了") && !fs.existsSync(HOME) && !(await pingSock()), "卸：后台那一个停了，凭据、存档、日志都删了");
if (child.exitCode === null && child.signalCode === null) child.kill();

console.log(`\n通过 ${pass}  失败 ${failN}`);
if (failN) process.exitCode = 1;
