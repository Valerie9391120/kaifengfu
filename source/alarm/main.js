// =====================================================
// 开封府的闹钟（狐宇宙，卿卿 2026 年 10 月 20 日要的，见开发说明“狐宇宙”那一节、src/fox.js）。
// 跑在她家里那台笔记本上（联想拯救者，Windows），算她的第二台设备：登录、对过暗号，跟手机同一份存档。
// 开机登录以后自己起来（“启动”文件夹里放一个小文件，见 installStartup），在后台一分钟看一眼：
// 到点了（规矩见 plan.js）就叫醒他一回（wake.js），他想说什么说什么，写了看得见的字就敲她的手机。
//
//   node kfs-alarm.mjs setup      装：输邮箱、密码、暗号，拉一遍存档，开机自己起来，现在就在后台跑起来
//   node kfs-alarm.mjs status     看看：在不在跑、上回几点醒、下回打算几点
//   node kfs-alarm.mjs wake       现在就叫醒他一回（不看钟点；“他自己醒”得开着）。后台那一个在跑，就交给它叫
//   node kfs-alarm.mjs stop       停下后台那一个（它正在叫他就等它叫完；下回开机还会起来）
//   node kfs-alarm.mjs uninstall  卸：停下、开机不再起来、这台电脑上的凭据和存档都删掉
//   node kfs-alarm.mjs run        后台跑的就是这一个（开机的时候自己起；一般用不着手敲）
//
// 这台电脑上的东西都在 %LOCALAPPDATA%\kaifengfu-alarm\ 里：凭据（DPAPI 封着）、存档（云端原样的密文）、
// state.json（几点叫过他、没醒成几回；他说的话在这里只存密文）、日志（不记他说的话）。
//
// 防出岔子的几样（另一双眼睛看了两遍挑出来的，见开发说明“狐宇宙”那一节）：
//   问他（花钱）和放进狐宇宙分两步：问到了先封好记下（state.json 的 pending），放进去了才划掉；
//     放的那几步（放进对话、换头像、记用量、敲手机）办过哪一步也记着，再放一遍的时候办过的不再办。
//     放不进去（断了网、库房一时不应）过一会儿只再放，不再问他一遍；放进去以前不叫下一回；放了一天也放不进去才扔。
//   放进去以后回头核对一天（watch）：狐宇宙那段对话被手机那头没看见就盖掉了，放回去；
//     手机那头看见了再删的、她把狐宇宙整段删了的、删了又重开的，不放回去。放回去之前先拉一遍最新的。
//   只许一个在跑：靠的是一根只有活着的进程才占得住的管子（Windows 的命名管道；测试的机器上是一个 socket 文件），
//     进程没了管子就没了，不靠进程号（Windows 会把进程号给别的程序再用）。手敲的 wake、stop、setup、status
//     都从这根管子跟后台那一个说话：wake 交给它叫；stop、setup 叫它把手上这一回办完自己停，不去杀进程。
//   一圈出了岔子只记一笔，下一圈照常；凭据解不开、密码不对、暗号换了（每拉一回存档对一遍），记一笔退出
//     （重试多少回也没用，得重新 setup）；PowerShell 一时起不来这种，过一会儿再试。
// =====================================================
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import readline from "node:readline";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { unseal, CHECK_TEXT } from "../src/vault.js";
import { FOX_CHAT, FOX_STATE, BEAT_MS, TASK_MAX_ROUNDS, wakeOn, gapOf, maxOf } from "../src/fox.js";
import { createCloud } from "./cloud.js";
import { createStore, writeAtomic } from "./store.js";
import { saveSecret, loadSecret } from "./secret.js";
import { planNext, planTasks, parseWake, splitWake, DAY_MS, OWED_MS, RETRY_MS } from "./plan.js";
import { gather, askRoom, askTask, commitWake, fetchExtraMemes, putBlocks, toRescue, owedOf, chatInfo, tasksOf, normBundle } from "./wake.js";

export const VERSION = "2026-10-20";
// 测试的时候（tests/e2e_alarm.mjs）可以拨快：KFS_ALARM_TICK、KFS_ALARM_PULL、KFS_ALARM_MANUAL_GAP（毫秒）
const TICK = Number(process.env.KFS_ALARM_TICK) || 60 * 1000; // 一分钟看一眼
const PULL_EVERY = Number(process.env.KFS_ALARM_PULL) || 5 * 60 * 1000; // 五分钟从云端拉一回（她说了话、改了设置、他在手机上定了几点醒，都靠这个知道）
const ASK_WAIT = 13 * 60 * 1000; // 手敲的 wake 交给后台以后最多等多久（他翻日记要好几步，一步最多两分多钟）
const STOP_WAIT = 13 * 60 * 1000; // 叫后台那一个停，最多等它把手上这一回办完多久（同上）
// 手敲的 wake：他这么久以内刚醒过，先不叫（手抖敲了两遍、等不及又敲一遍，不多花一回钱）。测试里可以拨：KFS_ALARM_MANUAL_GAP（毫秒）
const MANUAL_GAP = /^\d+$/.test(process.env.KFS_ALARM_MANUAL_GAP || "") ? Number(process.env.KFS_ALARM_MANUAL_GAP) : 2 * 60 * 1000;
// 追她的时候两回之间最短五分钟（她 20:03 定的）；测试里可以拨：KFS_ALARM_TASK_MIN（毫秒）
const TASK_MIN = /^\d+$/.test(process.env.KFS_ALARM_TASK_MIN || "") ? Number(process.env.KFS_ALARM_TASK_MIN) : undefined;
const TASK_DAY_MAX = 36; // 追她的那几回不算进第二道闸（她 20:08 定的）；所有任务加起来往回数二十四个钟头最多这么多回（防代码出岔子绕圈）
const FATAL = new Set(["secret", "badlogin"]); // 碰上这几样后台那一个退出（重试没用，得重新 setup）

const home = () =>
  process.env.KFS_ALARM_HOME ||
  path.join(process.env.LOCALAPPDATA || path.join(process.env.HOME || process.cwd(), ".local", "share"), "kaifengfu-alarm");
const P = {
  secret: () => path.join(home(), "secret.txt"),
  state: () => path.join(home(), "state.json"),
  log: () => path.join(home(), "alarm.log"),
  startup: () => path.join(process.env.APPDATA || home(), "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "kaifengfu-alarm.vbs"),
  // 装的时候拷一份放在这儿，开机起的是这一份：她从“下载”里跑的 setup，回头把“下载”清了也不碍事
  script: () => path.join(home(), "kfs-alarm.mjs"),
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => process.stdout.write(s + "\n");
const errText = (e) => String((e && e.message) || e).slice(0, 200);

// ---------- 日志：只记几点干了什么、出了什么岔子，不记他说的话 ----------
function log(line) {
  try {
    fs.mkdirSync(home(), { recursive: true });
    const f = P.log();
    try {
      if (fs.statSync(f).size > 1024 * 1024) fs.renameSync(f, f + ".1");
    } catch (e) {}
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${d.toTimeString().slice(0, 8)}`;
    fs.appendFileSync(f, `${stamp} ${line}\n`);
  } catch (e) {}
  if (process.env.KFS_ALARM_VERBOSE) say(line);
}

// ---------- 这台电脑上记着的几样（不跟云端走） ----------
//   tries   叫过他的每一回（往回一天；第二道闸数这个）；woke 问成了的那几回（往回两天）
//   fails   连着没醒成的那几回（醒成一回就清空）；lastErr 最近一回出的岔子
//   pending 问到了、还没放完的那一包（封好的密文）和放到哪一步了；watch 放进去以后回头核对的那几回（封好的密文）
//   plan    下回打算几点（看看用）；extras 表情包库里后来新添的（公开的那份 README 里拉的）
const readState = () => {
  try {
    const s = JSON.parse(fs.readFileSync(P.state(), "utf8"));
    return s && typeof s === "object" ? s : {};
  } catch (e) {
    return {};
  }
};
const writeState = (s) => {
  fs.mkdirSync(home(), { recursive: true });
  writeAtomic(P.state(), JSON.stringify(s));
};
const recent = (list, now, span = DAY_MS) => (Array.isArray(list) ? list : []).filter((t) => typeof t === "number" && t > now - span).slice(-60);

// ---------- 钥匙：暗号 → 两把钥匙（同 src/vault.js 的 deriveVault），这里要留着算出来的那一串，下回开机不用再输暗号 ----------
async function bitsOf(pass, saltB64, iterations) {
  const te = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", te.encode(String(pass).normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(Buffer.from(saltB64, "base64"));
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 512));
}
async function vaultOf(bits) {
  const aes = await crypto.subtle.importKey("raw", bits.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const mac = await crypto.subtle.importKey("raw", bits.slice(32, 64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return { aes, mac };
}

// ---------- 只许一个在跑：一根管子 ----------
// Windows 上是命名管道（名字照这个文件夹算，换个 Windows 账户是另一根），进程没了它就没了；
// 别的系统（测试的机器）上是文件夹里一个 socket 文件，进程被杀了文件会留着，碰上了先敲一下，没人应才删
const sockPath = () =>
  process.platform === "win32"
    ? `\\\\.\\pipe\\kaifengfu-alarm-${createHash("sha256").update(home()).digest("hex").slice(0, 16)}`
    : path.join(home(), "alarm.sock");

// 往管子里递一句话（一行 JSON），等回话。untilClose：等到那头关了才算完（叫它停的时候）。
// 回 { reply, closed, timeout, error }：error 是 ENOENT、ECONNREFUSED 就是没人在跑
function talk(req, { timeout = 3000, untilClose = false } = {}) {
  return new Promise((resolve) => {
    let finished = false;
    let buf = "";
    let reply = null;
    const conn = net.connect(sockPath());
    const finish = (out) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        conn.destroy();
      } catch (e) {}
      resolve(out);
    };
    const timer = setTimeout(() => finish({ reply, timeout: true }), timeout);
    conn.setEncoding("utf8");
    conn.on("connect", () => conn.write(JSON.stringify(req) + "\n"));
    conn.on("data", (d) => {
      buf += d;
      const i = buf.indexOf("\n");
      if (i >= 0 && !reply) {
        try {
          reply = JSON.parse(buf.slice(0, i));
        } catch (e) {
          reply = {};
        }
        if (!untilClose) finish({ reply });
      }
    });
    conn.on("error", (e) => finish({ reply, error: e.code || "error" }));
    conn.on("close", () => finish({ reply, closed: true }));
  });
}
const nobody = (r) => !!r && (r.error === "ENOENT" || r.error === "ECONNREFUSED");
// 在跑的那一个是谁：{ pid, ver, cmd（run 后台 / wake 手敲的）, busy（这会儿正在叫他、正在放）}；没人在跑回 null；
// 管子有人占着、却没应声（多半正忙着，比如开机那一下等 PowerShell），回 { unknown: true }：不当成没人在跑
async function ping() {
  const r = await talk({ op: "ping" });
  if (r.reply && r.reply.pid) return r.reply;
  return nobody(r) ? null : { unknown: true };
}

// 占住管子。拿到了回 { close }；有人占着回 null。onRequest(req, reply, conn)：别人递来的一句话（conn 是那一根，看它走没走）。
// close 连着把连进来的那几根也关了，回过的话送完再关（叫它停的那一头等的就是这一下）
async function claim(onRequest) {
  const conns = new Set();
  const server = net.createServer((conn) => {
    conns.add(conn);
    conn.on("close", () => conns.delete(conn));
    let buf = "";
    conn.setEncoding("utf8");
    conn.on("error", () => {});
    conn.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let req = null;
        try {
          req = JSON.parse(line);
        } catch (e) {}
        if (req && typeof req.op === "string")
          onRequest(
            req,
            (obj) => {
              try {
                conn.write(JSON.stringify(obj) + "\n");
              } catch (e) {}
            },
            conn
          );
      }
    });
  });
  for (let i = 0; i < 2; i++) {
    const err = await new Promise((resolve) => {
      server.once("error", resolve);
      server.listen(sockPath(), () => {
        server.removeListener("error", resolve);
        resolve(null);
      });
    });
    if (!err) {
      server.on("error", () => {});
      return {
        // 回过的话先送到再关（end 是送完了再关）
        close: () => {
          server.close();
          for (const c of conns) c.end();
        },
      };
    }
    if (err.code !== "EADDRINUSE") throw err;
    // 测试的机器上：被杀掉的那一个留下的 socket 文件。敲一下，确实没人应才删
    if (process.platform !== "win32" && i === 0 && nobody(await talk({ op: "ping" }, { timeout: 1500 }))) {
      fs.rmSync(sockPath(), { force: true });
      continue;
    }
    return null;
  }
  return null;
}

// 叫在跑的那一个停：它手上正在叫他、正在放的这一回办完再停（最多等 STOP_WAIT）。回 { pid, stopped } 或 null（没在跑）
async function stopBackground() {
  let info = await ping();
  // 占着管子却没应声：多半正忙着（开机那一下等 PowerShell 最多半分钟），等它一会儿；一直不应就不动它
  for (let i = 0; i < 10 && info && info.unknown; i++) {
    await sleep(3000);
    info = await ping();
  }
  if (!info) return null;
  if (info.unknown) return { pid: 0, stopped: false, unknown: true };
  if (info.busy) say(info.cmd === "wake" ? "手敲的 wake 正在叫他，等它叫完…" : "后台那一个正在叫他，等它叫完再停（最多十来分钟）…");
  await talk({ op: "stop" }, { untilClose: true, timeout: STOP_WAIT });
  for (let i = 0; i < 20 && (await ping()); i++) await sleep(250);
  // 等不来：它亲口报的进程号（管子还通着，就是它本人，不是别的程序拿了这个号），这时候才动手
  const still = await ping();
  if (still && still.pid && still.pid === info.pid) {
    try {
      process.kill(info.pid);
    } catch (e) {}
    for (let i = 0; i < 20 && (await ping()); i++) await sleep(250);
  }
  return { pid: info.pid, stopped: !(await ping()) };
}

// ---------- 问话（密码、暗号打的时候不显示） ----------
function askLine(prompt, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(prompt)) rl.output.write(prompt);
        else if (s === "\r\n" || s === "\n") rl.output.write(s);
      };
    }
    rl.question(prompt, (ans) => {
      if (hidden) process.stdout.write("\n");
      rl.close();
      resolve(ans);
    });
  });
}

// ---------- 进门：凭据 → 登录 → 钥匙（对一遍暗号：她在手机上换过暗号的话，记着的这把就开不了了）→ 存档 ----------
async function vaultOk(cloud, vault) {
  const meta = await cloud.fetchKeys(["m_check"]);
  if (meta.m_check == null) return null; // 没取到：说不准，不当它换了
  try {
    return (await unseal(vault, meta.m_check)) === CHECK_TEXT;
  } catch (e) {
    return false;
  }
}
async function enter() {
  const sec = await loadSecret(P.secret());
  const cloud = createCloud(sec);
  await cloud.login();
  const vault = await vaultOf(Uint8Array.from(Buffer.from(sec.bits, "base64")));
  if ((await vaultOk(cloud, vault)) === false) throw Object.assign(new Error("暗号对不上了（手机上换过暗号？）：重新跑一遍 setup"), { code: "secret" });
  const store = createStore({ dir: home(), vault, cloud });
  await store.open();
  return { cloud, store, vault, sec };
}

const OFF_TEXT = "“他自己醒”关着：先在手机的账户面板里打开。";
const OWED_TEXT = "狐宇宙里你说的那句他还没回上（回话多半在信箱里，等你打开开封府才放进来），放进来以前不叫他。";
const resultLine = (r) =>
  r.ok
    ? r.newChat
      ? `醒过了，他开了一段新对话找你（敲了 ${r.knocked || 0} 条横幅）。`
      : r.quiet
      ? "醒过了，他这一回没写字。"
      : "醒过了，他在屋里的便签纸上写了点东西（不敲你）。去狐宇宙看看。"
    : r.pending
    ? `问到了他的话，还没放进去（${r.err}）。闹钟过一会儿自己再放，不再问他一遍。`
    : "没醒成：" + r.err;
const planLine = (on, plan, pending) =>
  !on
    ? "“他自己醒”关着"
    : pending
    ? "有一回醒来说的话还没放进狐宇宙，放进去以前不叫下一回"
    : plan.why === "owed"
    ? "狐宇宙里她那句还没回上，先不叫他"
    : plan.why === "chase"
    ? "他正追着她（任务标记），平常那种自己醒先停着"
    : plan.due
    ? `下回打算 ${new Date(plan.due).toLocaleString()} 醒（${plan.why}）`
    : "他说先不醒";
// 他定的下回几点醒，日志里只记认出来的意思（他写的原样不记）
const markLine = (raw, from) => {
  if (raw == null) return "";
  const w = parseWake(splitWake(raw).when, from);
  return w ? (w.off ? "，他定了先不醒" : `，他定了下回 ${new Date(w.at).toLocaleString()} 醒`) : "，他写的几点醒认不出（照常）";
};
// ---------- 叫醒、放进去、回头核对：后台那一个和手敲的 wake 都用这一套 ----------
function createAlarm({ cloud, store, vault, st, setBusy }) {
  const save = () => writeState(st);
  const keyOf = (chat) => "kfs2:chat:" + chat;
  const hashOf = async (chat) => {
    const s = await store.sealedOfKey(keyOf(chat));
    return s ? createHash("sha256").update(s).digest("hex").slice(0, 32) : "";
  };
  // 回头核对的那几段对话：{ [对话的编号]: { ours, list } }（头一版只核对狐宇宙一段，记的是 { ours, list }：照新样子摆）
  const watched = () => {
    let w = st.watch;
    if (w && Array.isArray(w.list)) w = { [FOX_CHAT]: w };
    st.watch = w && typeof w === "object" && !Array.isArray(w) ? w : {};
    return st.watch;
  };
  // 他醒过的那几回：狐宇宙里那几行醒了的，加上这台电脑上记着的（那几行被手机那头盖掉了，也照样算）
  const wakesOf = (ctx) => [...new Set((ctx.wakes || []).concat(recent(st.woke, Date.now(), 2 * DAY_MS)))].sort((a, b) => a - b);
  const chasing = (ctx) => (ctx.tasks || []).some((t) => t.state === "chase");

  // 心跳：写进存档（南衙那一行、账户面板里那一句照它写，见 src/fox.js）
  async function beat(fields) {
    try {
      await store.set(FOX_STATE, JSON.stringify({ v: 1, at: Date.now(), ver: VERSION, ...fields }));
    } catch (e) {
      if (FATAL.has(e.code)) throw e;
      log("心跳没写上：" + errText(e));
    }
  }

  // 平常那种自己醒（醒在狐宇宙）：几点。追着她的时候（任务标记）先停着
  function plan(ctx, now, resumeAt) {
    if (!wakeOn(ctx.settings)) return { due: null, why: "switch-off" };
    if (chasing(ctx)) return { due: null, why: "chase" };
    return planNext({
      now,
      wakes: wakesOf(ctx),
      capWakes: [...new Set((ctx.capWakes || []).concat(recent(st.woke, now, 2 * DAY_MS)))].sort((a, b) => a - b),
      herLast: ctx.herLast ? ctx.herLast.ts : 0,
      mark: ctx.mark,
      resumeAt,
      gap: gapOf(ctx.settings),
      max: maxOf(ctx.settings),
      fails: st.fails || [],
      tries: recent(st.tries, now),
      owed: owedOf(ctx.fox),
    });
  }

  // 任务（任务标记）：眼下最早该办的那一个；该作废、该收的写回去（日志里不记那段对话叫什么：名字是照她的话起的）。
  // resumeAt：闹钟这一回几点醒过来的（同 plan）：睡着的时候过了点的任务不补
  async function taskPlan(ctx, now, resumeAt = 0) {
    if (!wakeOn(ctx.settings) || !(ctx.tasks || []).length) return { due: null, task: null, changed: false };
    const infos = {};
    for (const t of ctx.tasks) if (t.chat && !(t.chat in infos)) infos[t.chat] = await chatInfo(store, t.chat);
    const r = planTasks({ now, tasks: ctx.tasks, info: (id) => infos[id] || null, resumeAt, ...(TASK_MIN != null ? { minGap: TASK_MIN } : {}) });
    for (const c of r.changes) {
      const t = ctx.tasks.find((x) => x.key === c.key) || {};
      const { key, id, ...rest } = t;
      if (c.state === "drop") await store.del(c.key);
      else {
        await store.set(c.key, JSON.stringify({ ...rest, state: c.state, why: c.why, endedAt: now }));
        log(`任务${c.state === "done" ? "办完了" : "作废了"}：${c.why}`);
      }
    }
    if (r.changes.length) ctx.tasks = await tasksOf(store);
    return { due: r.due, task: r.task, info: r.task ? infos[r.task.chat] : null, changed: r.changes.length > 0 };
  }
  // 追她的那几回，所有任务加起来往回数二十四个钟头还没满
  const taskRoom = () => recent(st.taskTries, Date.now()).length < TASK_DAY_MAX;
  // 还没到点的那几个任务（醒在屋里的时候告诉他）
  const pendingOf = (ctx) =>
    (ctx.tasks || [])
      .filter((t) => !t.state || t.state === "wait")
      .map((t) => {
        const p = parseWake(splitWake(t.raw).when, t.set || 0);
        const c = (ctx.index || []).find((x) => x && x.id === t.chat);
        return p && p.at ? { title: (c && c.title) || "一段对话", at: p.at, label: splitWake(t.raw).label } : null;
      })
      .filter(Boolean);

  // 暗号换了没有（每拉一回存档对一遍）：换了就照实停下。问不到不算
  async function checkVault() {
    let ok = null;
    try {
      ok = await vaultOk(cloud, vault);
    } catch (e) {
      if (FATAL.has(e.code)) throw e;
    }
    if (ok === false) throw Object.assign(new Error("暗号对不上了（手机上换过暗号？）：重新跑一遍 setup"), { code: "secret" });
  }

  // 这一回放进某段对话的那几行记下来，回头核对一天（封好）；已经记过的不再记。
  // own：那段对话眼下这一份是闹钟自己刚写的（putBlocks 的 onChat），记下它的指纹；不是自己写的不动原来记的指纹
  // （不然手机那头盖掉的那一份会被当成闹钟自己写的，再也不核对了；另一双眼睛挑出来的）
  async function watch(chat, rows, base, own = false) {
    const w = watched();
    const now = Date.now();
    const cur = w[chat] || { ours: "", list: [] };
    const list = (cur.list || []).filter((x) => x && x.until > now);
    const first = rows[0] && rows[0].id;
    if (!list.some((x) => x.ids && x.ids[0] === first)) {
      list.push({ sealed: await store.sealText(JSON.stringify(rows)), ids: rows.map((r) => r.id), base: base || [], until: now + DAY_MS });
    }
    w[chat] = { ours: own || !cur.ours ? await hashOf(chat) : cur.ours, list: list.slice(-12) };
    save();
  }

  // 任务这一回办完了：记下第几回、下回几点再追；不追了（他没说、追满了）就收
  async function applyChase(b) {
    const c = b.chase;
    const t = JSON.parse((await store.get(c.key)) || "null");
    if (!t || typeof t !== "object") return;
    const again = !!c.next && c.round < TASK_MAX_ROUNDS;
    const next = { ...t, state: again ? "chase" : "done", started: t.started || b.at, rounds: c.round, last: b.at, next: again ? c.next : 0 };
    if (!again) Object.assign(next, { why: c.next ? "追满了" : "他没说再追", endedAt: Date.now() });
    await store.set(c.key, JSON.stringify(next));
    log(again ? `任务办了第 ${c.round} 回，他说 ${new Date(c.next).toLocaleString()} 再去` : `任务办完了（第 ${c.round} 回）：${next.why}`);
  }

  // 问到了的那一包放进存档。回 { done, quiet, knocked, newChat, err }
  async function commitPending() {
    const p = st.pending;
    if (!p) return { done: true };
    if (Date.now() - (p.at || 0) > DAY_MS) {
      log("有一回醒来说的话放了一天也没放进去，不放了");
      st.pending = null;
      save();
      return { done: true, dropped: true };
    }
    let bundle;
    try {
      bundle = normBundle(JSON.parse(await store.unsealText(p.sealed)));
    } catch (e) {
      log("有一回醒来说的话解不开了（钥匙换过？），不放了");
      st.pending = null;
      save();
      return { done: true, dropped: true };
    }
    setBusy(true);
    try {
      // 上回已经放进对话了（办到后面几步断了）：先拉一遍、核对一遍（这工夫里手机那头要是没看见就盖掉了，先放回去）
      if (p.done && (p.done.put || p.done.put0)) {
        await store.pull();
        await recheck({ fresh: true });
      }
      const r = await commitWake({
        store,
        cloud,
        bundle,
        log,
        beforePut: () => recheck({ fresh: true }),
        onChat: (chat, rows, base) => watch(chat, rows, base, true),
        done: p.done || {},
        mark: async (step, value, extra) => {
          p.done = { ...(p.done || {}), ...(extra || {}), [step]: value };
          save();
        },
      });
      for (const [chat, x] of Object.entries(r.bases)) await watch(chat, x.rows, x.base);
      if (bundle.chase && !(p.done && p.done.chase)) {
        await applyChase(bundle);
        p.done = { ...(p.done || {}), chase: true };
        save();
      }
      st.pending = null;
      st.lastErr = "";
      save();
      const what = bundle.kind === "task" ? (bundle.quiet ? "任务到点，他去那段对话看了看，没说话" : `任务到点，他去那段对话找她了，敲了 ${r.knocked} 条横幅`) : bundle.newChat ? `他开了一段新对话找她，敲了 ${r.knocked} 条横幅` : bundle.quiet ? "他没写字" : "他在屋里写了点东西（不敲她）";
      log(`放进去了：${what}${p.tries ? `（第 ${p.tries + 1} 回才放完）` : ""}`);
      return { done: true, quiet: bundle.quiet, knocked: r.knocked, newChat: !!bundle.newChat };
    } catch (e) {
      if (FATAL.has(e.code)) throw e;
      p.tries = (p.tries || 0) + 1;
      p.last = Date.now();
      st.lastErr = errText(e);
      save();
      log("问到了他的话，还没放进去（过一会儿再放，不再问他一遍）：" + st.lastErr);
      return { done: false, err: st.lastErr };
    } finally {
      setBusy(false);
    }
  }

  // 问到了：先封好记下，再放进去
  async function keep(bundle, now) {
    st.pending = { sealed: await store.sealText(JSON.stringify(bundle)), at: now, tries: 0, last: 0, done: {} };
    save();
    log(`问完了：要了 ${bundle.steps} 步${bundle.cost != null ? `，约 $${bundle.cost.toFixed(4)}` : ""}${markLine(bundle.wake, now)}`);
    const r = await commitPending();
    return r.done ? { ok: true, quiet: r.quiet, knocked: r.knocked || 0, newChat: r.newChat } : { ok: false, pending: true, err: r.err };
  }

  // 平常那种：叫醒他一回，醒在狐宇宙。回 { ok, quiet, knocked, newChat } 或 { ok: false, pending?, err }
  async function wake(ctx, now) {
    const wakes = wakesOf(ctx);
    const n = wakes.filter((t) => t > now - DAY_MS).length + 1;
    st.tries = recent(st.tries, now).concat([now]);
    save();
    setBusy(true);
    try {
      await beat({ awake: true, on: true, last: wakes[wakes.length - 1] || 0 });
      log(`醒了（这一天里第 ${n} 回）`);
      let bundle;
      try {
        bundle = await askRoom({ store, cloud, ctx: { ...ctx, wakes }, now, n, log, pending: pendingOf(ctx) });
      } catch (e) {
        if (FATAL.has(e.code)) throw e;
        st.fails = (st.fails || []).concat([now]).slice(-10);
        st.lastErr = errText(e);
        save();
        log("没醒成：" + st.lastErr);
        return { ok: false, err: st.lastErr };
      }
      st.fails = [];
      st.woke = recent(st.woke, now, 2 * DAY_MS).concat([now]);
      return await keep(bundle, now);
    } finally {
      // 这一回叫完是几点（手敲的 wake 两分钟以内不再叫，从叫完算：一回醒长的要十来分钟，这工夫里她又敲的那一下不该再叫一回）
      st.ended = Date.now();
      save();
      setBusy(false);
    }
  }

  // 任务到点：醒在他定闹钟的那段对话里（info 是那段对话眼下的样子，见 wake.js 的 chatInfo）
  async function wakeTask(ctx, task, info, now) {
    const wakes = wakesOf(ctx);
    const round = (task.rounds || 0) + 1;
    st.taskTries = recent(st.taskTries, now).concat([now]);
    save();
    setBusy(true);
    try {
      await beat({ awake: true, on: true, last: wakes[wakes.length - 1] || 0 });
      log(`任务到点了，醒在他定闹钟的那段对话里（第 ${round} 回）`);
      const c = (ctx.index || []).find((x) => x && x.id === task.chat);
      let bundle;
      try {
        bundle = await askTask({ store, cloud, ctx: { ...ctx, wakes }, now, log, task, chat: { id: task.chat, title: (c && c.title) || "一段对话", msgs: info.msgs }, minGap: TASK_MIN });
      } catch (e) {
        if (FATAL.has(e.code)) throw e;
        st.lastErr = errText(e);
        // 没问成：算一回（最多十二回，不会一直白试），一刻钟以后再试
        const { key, id, ...rest } = task;
        const failed = { ...rest, state: "chase", started: task.started || now, rounds: round, last: now, next: now + RETRY_MS };
        try {
          await store.set(task.key, JSON.stringify(failed));
        } catch (e2) {
          if (FATAL.has(e2.code)) throw e2;
        }
        save();
        log("任务这一回没醒成：" + st.lastErr);
        return { ok: false, err: st.lastErr };
      }
      return await keep(bundle, now);
    } finally {
      st.ended = Date.now();
      save();
      setBusy(false);
    }
  }

  // 回头核对：放过东西的那几段对话后来被别人（手机那头）写过了，先拉一遍最新的，照最新的那一份看前几回放的——
  //   那段对话整段没了（她删了）：那段的都不放了
  //   里面有这一回放的（哪怕一行；翻过去的那几支里的也算，重新回答、改她的话会把后面的收进 alts）：
  //     写的那头是看过的，少了的是她删的，不放回去
  //   一行都没有，放之前原有的那些还有在的：是没看见这一回就写的（两边差不多同时写那段对话，云端只认后写的），放回去
  //   一行都没有，原有的一个不在（她删了又重开的），或者放之前那段对话是空的（分不清是不是删了重开）：不放
  // fresh：刚拉过（commitWake 里），不再拉
  async function recheck({ fresh = false } = {}) {
    const w = watched();
    const now = Date.now();
    let changed = [];
    let pruned = false;
    await relist(w);
    for (const chat of Object.keys(w)) {
      const list = ((w[chat] && w[chat].list) || []).filter((x) => x && x.until > now);
      if (!list.length) {
        delete w[chat];
        pruned = true;
        continue;
      }
      if (list.length !== w[chat].list.length) {
        w[chat].list = list;
        pruned = true;
      }
      if ((await hashOf(chat)) !== w[chat].ours) changed.push(chat);
    }
    if (pruned) save();
    if (!changed.length) return;
    if (!fresh) {
      await store.pull();
      const still = [];
      for (const chat of changed) if ((await hashOf(chat)) !== w[chat].ours) still.push(chat);
      changed = still;
    }
    for (const chat of changed) {
      if (!store.has(keyOf(chat))) {
        delete w[chat];
        save();
        log((chat === FOX_CHAT ? "狐宇宙那段对话" : "放过东西的一段对话") + "删掉了：前几回放的不再放回去");
        continue;
      }
      let cur = null;
      try {
        cur = JSON.parse(await store.get(keyOf(chat)));
      } catch (e) {
        if (e.code === "store") throw e;
      }
      if (!Array.isArray(cur)) {
        w[chat].ours = await hashOf(chat);
        save();
        continue;
      }
      const back = [];
      const kept = [];
      for (const x of toRescue(w[chat].list, cur)) {
        let rows = null;
        try {
          rows = JSON.parse(await store.unsealText(x.sealed));
        } catch (e) {
          log("有一回放的几行解不开了（钥匙换过？），不再核对");
          continue;
        }
        back.push(rows);
        kept.push(x);
      }
      w[chat].list = kept;
      if (back.length) {
        setBusy(true);
        try {
          const r = await putBlocks(store, chat, back, async () => {
            w[chat].ours = await hashOf(chat);
            save();
          });
          log(`${chat === FOX_CHAT ? "狐宇宙" : "一段对话"}里少了前几回放的 ${r.added} 行（手机那头没看见就写了那段对话），放回去了`);
        } finally {
          setBusy(false);
        }
      }
      if (kept.length) w[chat] = { ours: await hashOf(chat), list: kept };
      else delete w[chat];
      save();
    }
  }

  // 他新开的那几段对话（这一天里放过东西的）：手机那头拿旧的目录盖掉了云端的（它那一份还没有这一段），那段对话还在，
  // 历史对话里却列不出来、点横幅也找不着：补回目录，名字照狐宇宙里那一行记着的（另一双眼睛挑出来的）。她删了的（那段对话没了）不补
  async function relist(w) {
    const ids = Object.keys(w).filter((c) => c !== FOX_CHAT && store.has(keyOf(c)));
    if (!ids.length) return;
    const index = JSON.parse((await store.get("kfs2:index")) || "[]");
    const lost = ids.filter((c) => !index.some((x) => x && x.id === c));
    if (!lost.length) return;
    const fox = JSON.parse((await store.get(keyOf(FOX_CHAT))) || "[]");
    for (const chat of lost) {
      const go = (Array.isArray(fox) ? fox : []).find((m) => m && m.go && m.go.how === "new" && m.go.chat === chat);
      if (!go) continue;
      setBusy(true);
      try {
        await putBlocks(store, chat, [], null, { title: go.go.title || "" });
      } finally {
        setBusy(false);
      }
      log("他新开的一段对话从目录里掉了（手机那头拿旧的目录盖掉了），补回去了");
    }
  }

  // 她手敲的 wake：不看钟点，“他自己醒”得开着；上一回的还没放进去、她在狐宇宙里说的那句还没回上、他刚醒过，先不叫。
  // onStart：真要叫了叫一声（手敲的那一头这时候才说“在叫他…”）
  async function manual(ctx, onStart = null) {
    if (!wakeOn(ctx.settings)) return { ok: false, text: OFF_TEXT };
    if (st.pending) return { ok: false, text: `上一回醒来说的话还没放进去（${st.lastErr || "库房一时没应"}），放进去以前不再叫他。闹钟过一会儿自己再放。` };
    const owed = owedOf(ctx.fox);
    if (owed && Date.now() - owed < OWED_MS) return { ok: false, text: OWED_TEXT };
    const last = Math.max(0, ...wakesOf(ctx), ...recent(st.tries, Date.now()), Number(st.ended) || 0);
    if (Date.now() - last < MANUAL_GAP) return { ok: false, text: `他刚醒过（${Math.max(1, Math.round((Date.now() - last) / 1000))} 秒前），过两分钟再叫。` };
    if (onStart) onStart();
    const r = await wake(ctx, Date.now());
    return { ...r, text: resultLine(r) };
  }

  return { beat, plan, taskPlan, taskRoom, wake, wakeTask, recheck, commitPending, manual, wakesOf, checkVault };
}

// ---------- 后台跑 ----------
async function run() {
  fs.mkdirSync(home(), { recursive: true });
  // 手敲的 wake 递来的：{ reply 回话用的, conn 那一根 }。那一头走了（Ctrl+C、关了窗口）就从队里划掉，不替走了的人叫（叫一回花一回钱）；
  // 排着好几个的，叫一回、一起回话
  const requests = [];
  let stopping = false;
  let busy = false;
  let poke = null; // 叫醒歇着的那一下
  const onRequest = (req, reply, conn) => {
    if (req.op === "ping") return reply({ pid: process.pid, ver: VERSION, cmd: "run", busy });
    if (req.op === "stop") {
      stopping = true;
      reply({ ok: true, busy });
      if (poke) poke();
      return;
    }
    if (req.op === "wake") {
      if (stopping) return reply({ ok: false, text: "后台那一个正在停，等它停了再敲 wake。" });
      const item = { reply, conn };
      requests.push(item);
      if (conn)
        conn.once("close", () => {
          const i = requests.indexOf(item);
          if (i >= 0) requests.splice(i, 1);
        });
      if (poke) poke();
      return;
    }
    reply({ ok: false, text: "不认识这一句" });
  };
  // 歇一会儿：叫它停了、她手敲了 wake（withRequests），就不歇了
  const nap = (ms, withRequests = true) =>
    new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        poke = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      poke = () => {
        if (stopping || (withRequests && requests.length)) done();
      };
      poke();
    });

  // 占管子：别的在跑——是后台那一个，这一个退出；是她手敲的 wake 正在叫他、前一个正在停，等它完了再接
  let server = null;
  for (;;) {
    server = await claim(onRequest);
    if (server) break;
    const other = await ping();
    if (other && other.cmd === "run") {
      say(`闹钟已经在跑了（进程 ${other.pid}）。`);
      return;
    }
    await sleep(5000); // 手敲的 wake、前一个正在停、占着却一时没应声的：等一会儿再看
  }
  // 停下：排着的先回一句，管子关了（回过的话送到了再关），歇一下再退
  const quit = async (code, why) => {
    for (const x of requests.splice(0)) x.reply({ ok: false, text: "后台那一个停了，没叫成。" });
    log(why);
    server.close();
    await sleep(300);
    process.exit(code);
  };

  let entered = null;
  for (let i = 0; !stopping; i++) {
    try {
      entered = await enter();
      break;
    } catch (e) {
      log("进门没成：" + errText(e));
      if (FATAL.has(e.code)) return quit(1, "这一个退出：重新跑一遍 setup 就好");
      for (const x of requests.splice(0)) x.reply({ ok: false, text: "后台那一个还没连上云端（" + errText(e) + "），过一会儿再试。" });
      await nap(Math.min(10 * 60 * 1000, 30 * 1000 * (i + 1)), false); // 开机那一下网还没连上：等一会儿再进
    }
  }
  if (!entered) return quit(0, "停下了");
  const { cloud, store, vault } = entered;
  const st = readState();
  log(`闹钟起来了（${VERSION}）`);
  st.extras = await fetchExtraMemes(st.extras || []);
  const A = createAlarm({ cloud, store, vault, st, setBusy: (b) => (busy = !!b) });
  let pulled = false; // 这一回起来以后拉成过一回：这之前不核对（磁盘上的那份可能还不全，会当成她删了）
  const pull = async () => {
    try {
      await store.pull();
      pulled = true;
    } catch (e) {
      if (FATAL.has(e.code)) throw e;
      log("拉存档没成：" + errText(e));
      return false;
    }
    await A.checkVault();
    return true;
  };
  let resumeAt = Date.now();
  let lastTick = Date.now();
  let lastPull = 0;
  let lastBeat = 0;
  let lastKey = "";
  let wasOn = null;

  const tick = async () => {
    const now = Date.now();
    if (now - lastTick > 3 * Math.max(TICK, 60 * 1000)) {
      // 笔记本睡了一觉刚醒：睡着那会儿该醒的不补（plan.js 规矩三）
      resumeAt = now;
      lastPull = 0;
      log("笔记本刚醒过来");
    }
    lastTick = now;
    const reqs = requests.splice(0);
    const req = reqs.length ? (r) => reqs.forEach((x) => x.reply(r)) : null;
    let answered = !req;
    try {
      let fresh = false;
      if (req || now - lastPull >= PULL_EVERY) {
        fresh = await pull();
        lastPull = Date.now();
      }
      // 先核对、先把上一回问到的放进去，再看狐宇宙眼下的样子（放回去的那几行里有他定的几点醒）
      if (st.watch && pulled) await A.recheck();
      if (st.pending && (req || Date.now() - (st.pending.last || 0) >= PULL_EVERY)) {
        await A.commitPending();
        lastBeat = 0;
      }
      let ctx = await gather(store, st.extras || []);
      const on = wakeOn(ctx.settings);
      if (on && wasOn === false) resumeAt = now; // 她刚把“他自己醒”打开：不马上响
      wasOn = on;
      // 任务标记：该作废的作废、该收的收；到点了的先办（比平常那种自己醒要紧）
      let tp = await A.taskPlan(ctx, Date.now(), resumeAt);
      if (tp.changed) ctx = await gather(store, st.extras || []);
      if (!st.pending && !stopping && tp.task && Date.now() >= tp.due && A.taskRoom()) {
        const ok = await pull();
        lastPull = Date.now();
        ctx = await gather(store, st.extras || []);
        tp = await A.taskPlan(ctx, Date.now(), resumeAt);
        if (ok && !stopping && tp.task && Date.now() >= tp.due) {
          await A.wakeTask(ctx, tp.task, tp.info, Date.now());
          ctx = await gather(store, st.extras || []);
          lastBeat = 0;
        }
      }
      if (req) {
        // 拉的工夫里那一头都走了：不替走了的人叫。拉不到最新的也不叫（她刚在手机上说的话、刚关的开关，这台电脑还不知道）
        if (reqs.every((x) => x.conn && x.conn.destroyed)) answered = true;
        else req(fresh ? await A.manual(ctx) : { ok: false, text: "连不上云端，拉不到最新的，先不叫他。过一会儿再试。" });
        answered = true;
        ctx = await gather(store, st.extras || []);
        lastBeat = 0;
      }
      let plan = A.plan(ctx, Date.now(), resumeAt);
      if (!st.pending && !stopping && plan.due && Date.now() >= plan.due) {
        // 到点了：先拉一遍最新的，再看一眼还该不该醒（她刚好在说话、他刚在手机上定了别的钟点）；拉不到就这一圈先不叫
        const ok = await pull();
        lastPull = Date.now();
        ctx = await gather(store, st.extras || []);
        plan = A.plan(ctx, Date.now(), resumeAt);
        if (ok && !stopping && plan.due && Date.now() >= plan.due) {
          await A.wake(ctx, Date.now());
          ctx = await gather(store, st.extras || []);
          plan = A.plan(ctx, Date.now(), resumeAt);
          lastBeat = 0;
        }
      }
      const key = `${on}|${plan.due}|${plan.why}|${st.pending ? 1 : 0}`;
      if (Date.now() - lastBeat >= BEAT_MS || key !== lastKey) {
        const wakes = A.wakesOf(ctx);
        await A.beat({ awake: false, on, last: wakes[wakes.length - 1] || 0, next: plan.due || 0, off: plan.why === "off" });
        st.plan = { due: plan.due, why: plan.why, at: Date.now() };
        writeState(st);
        if (key !== lastKey) log(planLine(on, plan, st.pending));
        lastBeat = Date.now();
        lastKey = key;
      }
    } catch (e) {
      if (!answered) req({ ok: false, text: "没叫成：" + errText(e) });
      throw e;
    }
  };

  for (;;) {
    if (stopping) break;
    try {
      await tick();
    } catch (e) {
      if (FATAL.has(e.code)) return quit(1, "这一个退出：" + errText(e) + (e.code === "badlogin" ? "（邮箱、密码对不上了，改过密码？重新跑一遍 setup）" : ""));
      log("这一圈出岔子了（下一圈照常）：" + errText(e));
    }
    // 笔记本睡没睡过，从这一圈办完算起（一圈里叫醒他一回，网不好的时候能拖十几二十分钟，那不是睡着了；
    // 当成睡着了的话，这工夫里到点的任务会被当成“睡着的时候错过的”扔掉，另一双眼睛挑出来的）
    lastTick = Date.now();
    if (stopping) break;
    await nap(TICK);
  }
  await quit(0, "停下了（叫停的）");
}

// ---------- 装 ----------
const here = () => fileURLToPath(import.meta.url);

function installStartup() {
  const vbs = `' kaifengfu alarm: starts in the background after Windows sign-in (no window).\r\n' To stop it starting, delete this file or run: node "${P.script()}" uninstall\r\nCreateObject("WScript.Shell").Run """${process.execPath}"" ""${P.script()}"" run", 0, False\r\n`;
  const file = P.startup();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // UTF-16 带 BOM：路径里有中文（D:\开封府\…）wscript 也认得
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(vbs, "utf16le")]));
  return file;
}

function startBackground() {
  if (process.platform === "win32" && fs.existsSync(P.startup())) spawn("wscript.exe", [P.startup()], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  else spawn(process.execPath, [P.script(), "run"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

async function setup() {
  say("开封府的闹钟 · 装在这台电脑上");
  say("邮箱、密码、暗号只存在这台电脑上，用 Windows 的 DPAPI 封着（换个账户、拷到别的电脑都解不开）。暗号本身不存，只存它算出来的钥匙。");
  say("");
  const email = (process.env.KFS_ALARM_EMAIL || (await askLine("邮箱："))).trim();
  const password = process.env.KFS_ALARM_PASSWORD || (await askLine("密码（打的时候不显示）：", true));
  const pass = process.env.KFS_ALARM_PASS || (await askLine("暗号（打的时候不显示）：", true));
  const cloud = createCloud({ email, password });
  try {
    await cloud.login();
  } catch (e) {
    say("登录没成：" + e.message);
    process.exitCode = 1;
    return;
  }
  say("登录了。在对暗号（要算几秒）…");
  const meta = await cloud.fetchKeys(["m_kdf", "m_check"]);
  let kdf = null;
  try {
    kdf = JSON.parse(meta.m_kdf);
  } catch (e) {}
  if (!kdf || !kdf.salt || !meta.m_check) {
    say("库房里还没设过暗号：先在手机上进一回开封府、设好暗号，再来装。");
    process.exitCode = 1;
    return;
  }
  const bits = await bitsOf(pass, kdf.salt, kdf.iter || 600000);
  const vault = await vaultOf(bits);
  let okPass = false;
  try {
    okPass = (await unseal(vault, meta.m_check)) === CHECK_TEXT;
  } catch (e) {}
  if (!okPass) {
    say("暗号不对。再跑一遍 setup，重新输。");
    process.exitCode = 1;
    return;
  }
  say("暗号对上了。");
  try {
    const k = await cloud.push({ op: "key" });
    if (!(k && Array.isArray(k.can) && k.can.includes("notify"))) say("提醒：Supabase 里推送的那个小后端（push）还是旧的，他找你的时候敲不了你的手机。先把新代码贴进去 Deploy，闹钟不用重装。");
    else if (!k.can.includes("wakelabel")) say("提醒：Supabase 里推送的那个小后端（push）是上一版的：他藏着的那行闹钟要是写长了，会露在横幅上。把新代码贴进去 Deploy，闹钟不用重装。");
  } catch (e) {
    say("提醒：问推送的小后端没问成（" + e.message + "），装完以后再看。");
  }
  fs.mkdirSync(home(), { recursive: true });
  // 后台原来那一个先停下（它正在叫他就等它叫完），不然两个一起往同一个文件夹里写。
  // 停了以后不管下面哪一步出岔子，最后都把后台再起起来（用的是这时候文件夹里有的那一份），不让她的电脑上空着
  const old = await stopBackground();
  if (old && !old.stopped) {
    say(old.unknown ? "后台原来那一个一直没应声，这回先不装（不然两个一起跑）：过一会儿再跑一遍 setup。" : `后台原来那一个（进程 ${old.pid}）没停下来，这回先不装：过一会儿再跑一遍 setup。`);
    process.exitCode = 1;
    return;
  }
  try {
    saveSecret(P.secret(), { email, password, bits: Buffer.from(bits).toString("base64") });
    bits.fill(0);
    // 拷一份放进自己的文件夹（开机起的是这一份）
    if (path.resolve(here()) !== path.resolve(P.script())) fs.copyFileSync(here(), P.script());
    if (process.platform === "win32" || process.env.KFS_ALARM_STARTUP) say("开机自己起来：放好了（" + installStartup() + "）。");
    say("凭据封好了。在拉存档（头一回要拉全部，照片多的话要一会儿）…");
    try {
      const { store } = await enter();
      let shown = 0;
      await store.pull((n) => {
        if (n - shown >= 100) {
          shown = n;
          process.stdout.write(`\r  拉了 ${n} 条`);
        }
      });
      say(`\r  拉完了，一共 ${store.size()} 样。`);
    } catch (e) {
      say("\r  存档没拉完（" + errText(e) + "）：不碍事，后台那一个起来以后接着拉。");
    }
  } finally {
    if (!process.env.KFS_ALARM_NOSTART && fs.existsSync(P.script())) {
      startBackground();
      say(old ? "后台原来那一个停了，换这一版跑起来了。" : "后台跑起来了。");
    }
  }
  say("");
  say("装好了。在手机上：账户面板里把“他自己醒”打开（这一下也告诉闹钟以后敲哪台手机）。");
  say("想看它在干什么：node \"" + P.script() + "\" status");
}

// ---------- 看看 ----------
async function status() {
  const info = await ping();
  const st = readState();
  say(
    !info
      ? "没在跑"
      : info.unknown
      ? "在跑（这会儿没应声，多半正忙着；过一会儿再看）"
      : `在跑（进程 ${info.pid}，${info.ver || "?"}${info.cmd === "wake" ? "，是手敲的 wake" : ""}${info.busy ? "，这会儿正在叫他" : ""}）`
  );
  if (!fs.existsSync(P.secret())) say("还没装：node kfs-alarm.mjs setup");
  if (st.pending) say(`有一回醒来说的话还没放进去（试过 ${st.pending.tries || 0} 回${st.lastErr ? "：" + st.lastErr : ""}），放进去以前不叫下一回`);
  if (st.plan)
    say(
      st.plan.due
        ? `下回打算 ${new Date(st.plan.due).toLocaleString()} 醒（${st.plan.why}）`
        : st.plan.why === "off"
        ? "他说先不醒，等她来过再说"
        : st.plan.why === "owed"
        ? "狐宇宙里她那句还没回上，先不叫他"
        : st.plan.why === "chase"
        ? "他正追着她（任务标记），平常那种自己醒先停着"
        : "“他自己醒”关着"
    );
  if (st.fails && st.fails.length) say(`最近连着 ${st.fails.length} 回没醒成：${st.lastErr || ""}`);
  try {
    const lines = fs.readFileSync(P.log(), "utf8").trim().split("\n").slice(-12);
    say("\n最近的日志：\n" + lines.join("\n"));
  } catch (e) {}
  say("\n东西都在：" + home());
}

// ---------- 现在就叫他一回 ----------
// 后台那一个在跑：交给它叫（两个一起叫会叫两回、一起往同一个文件夹里写），等它回话
async function askBackground(info) {
  say(info.busy ? `后台那一个（进程 ${info.pid}）这会儿正好在叫他，交给它，等它叫完这一回…` : `后台那一个在跑（进程 ${info.pid}），交给它叫…`);
  const r = await talk({ op: "wake" }, { timeout: ASK_WAIT });
  if (r.reply && typeof r.reply.text === "string") {
    say(r.reply.text);
    return;
  }
  say(r.timeout ? "后台那一个还没叫完：过一会儿去狐宇宙看看，或者 status 看日志。" : "后台那一个不在了：再敲一遍 wake。");
  process.exitCode = 1;
}

async function wakeNow() {
  const other = await ping();
  if (other && other.cmd === "run") return await askBackground(other);
  if (other) {
    say(other.unknown ? "后台那一个这会儿没应声（多半正忙着），过一会儿再敲 wake。" : `另一个手敲的 wake（进程 ${other.pid}）正在叫他，等它完了再来。`);
    process.exitCode = 1;
    return;
  }
  let busy = false;
  const server = await claim((req, reply) => {
    if (req.op === "ping") return reply({ pid: process.pid, ver: VERSION, cmd: "wake", busy });
    if (req.op === "stop") return reply({ ok: true, busy }); // 叫完这一回自己就退
    reply({ ok: false, text: "另一个手敲的 wake 正在叫他，等它完了再来。" });
  });
  if (!server) {
    say("后台那一个正好在起来：过一会儿再敲 wake。");
    process.exitCode = 1;
    return;
  }
  try {
    const { cloud, store, vault } = await enter();
    await store.pull();
    const st = readState();
    st.extras = await fetchExtraMemes(st.extras || []);
    const A = createAlarm({ cloud, store, vault, st, setBusy: (b) => (busy = !!b) });
    if (st.pending) await A.commitPending();
    let ctx = await gather(store, st.extras);
    const r = await A.manual(ctx, () => say("在叫他…"));
    ctx = await gather(store, st.extras);
    const plan = A.plan(ctx, Date.now(), Date.now());
    const wakes = A.wakesOf(ctx);
    await A.beat({ awake: false, on: wakeOn(ctx.settings), last: wakes[wakes.length - 1] || 0, next: plan.due || 0, off: plan.why === "off" });
    st.plan = { due: plan.due, why: plan.why, at: Date.now() };
    writeState(st);
    say(r.text);
  } finally {
    server.close();
  }
}

async function stop() {
  const r = await stopBackground();
  if (!r) say("没在跑。");
  else say(r.stopped ? "停了。下回开机还会自己起来；不想要了用 uninstall。" : r.unknown ? "后台那一个一直没应声，没停下：过一会儿再试。" : `没停下（进程 ${r.pid} 还在）。`);
  if (r && !r.stopped) process.exitCode = 1;
}

async function uninstall() {
  const r = await stopBackground();
  if (r && !r.stopped) {
    say(r.unknown ? "后台那一个一直没应声，没停下，先不删：过一会儿再卸一遍。" : `后台那一个（进程 ${r.pid}）没停下，先不删：过一会儿再卸一遍。`);
    process.exitCode = 1;
    return;
  }
  fs.rmSync(P.startup(), { force: true });
  fs.rmSync(home(), { recursive: true, force: true });
  say("卸干净了：开机不再起来，这台电脑上的凭据、存档、日志都删了。云端和手机上的东西一样没动。");
}

const cmd = process.argv[2] || "status";
const table = { setup, run, status, wake: wakeNow, stop, uninstall };
if (!table[cmd]) {
  say("用法：node kfs-alarm.mjs setup | status | wake | stop | uninstall");
  process.exitCode = 1;
} else {
  Promise.resolve(table[cmd]()).catch((e) => {
    log("出岔子：" + String((e && e.stack) || e));
    say("出岔子了：" + String((e && e.message) || e));
    process.exitCode = 1;
  });
}
