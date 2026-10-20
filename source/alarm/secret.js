// =====================================================
// 闹钟的凭据：她的邮箱、密码，和暗号算出来的那两把钥匙（暗号本身不存）。
// 存在这台电脑上，用 Windows 自带的 DPAPI 封起来：只有她这个 Windows 账户、在这台电脑上解得开
// （拷走文件、换个账户登录都解不开）。DPAPI 借 Windows 自带的 PowerShell 来调（-Command，不跑脚本文件，
// 不碰 PowerShell 那把“禁止运行脚本”的锁）。递过去、拿回来的都是 base64，中文暗号、中文路径都不会走样。
// 不是 Windows（测试的机器）：只有点名了 KFS_ALARM_PLAIN 才肯存明文，存的时候照实说。
// 出岔子分两种：
//   code: "secret"        解不开、没装、凭据坏了（换了账户、拷到别的电脑）：重试多少回也没用，后台那一个记一笔退出，得重新 setup
//   code: "secret-retry"  一时的：PowerShell 起得慢（刚开机杀毒、更新在忙）、超时、文件一时被占着：后台那一个过一会儿再试
// =====================================================
import fs from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { writeAtomic } from "./store.js";

const coded = (code, message) => Object.assign(new Error(message), { code });

const PS = "powershell.exe";
const ARGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];
const PROTECT =
  "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); " +
  "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
const UNPROTECT =
  "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); " +
  "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";

export const plainAllowed = () => process.platform !== "win32" && !!process.env.KFS_ALARM_PLAIN;

// PowerShell 的毛病翻成上面两种。递过去的那一串走的是标准输入，报错里没有它；只留 PowerShell 说的头一句。
// 真解不开的那种，PowerShell 的报错里一定有 CryptographicException（凭据文件坏了是 FormatException；这两个名字不随系统语言变）；别的都算一时的
function psError(e, stderr = "") {
  const all = String(stderr || (e && e.stderr) || "") + "\n" + String((e && e.message) || e);
  const said = all.split(/\r?\n/).find((x) => x.trim()) || "";
  return coded(/CryptographicException|FormatException/i.test(all) ? "secret" : "secret-retry", "Windows 没帮着封、解凭据（" + said.trim().slice(0, 160) + "）");
}

// 装的时候封（setup 一个人在跑，等着就是了）
function runPs(script, input) {
  try {
    return execFileSync(PS, [...ARGS, script], { input, encoding: "utf8", windowsHide: true, timeout: 30000 }).trim();
  } catch (e) {
    throw psError(e);
  }
}

// 后台那一个解（不卡着它：开机那一下 PowerShell 慢，卡住的话管子里有人问话也应不了，会被当成没在跑）
function runPsAsync(script, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(PS, [...ARGS, script], { encoding: "utf8", windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(psError(err, stderr));
      else resolve(String(stdout).trim());
    });
    if (child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
  });
}

// 封：一段字 → 这一台、这个账户才解得开的一串
export function protect(text) {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  if (process.platform === "win32") return "dpapi:" + runPs(PROTECT, b64);
  if (plainAllowed()) return "plain:" + b64;
  throw coded("secret", "这台电脑不是 Windows，封不了凭据");
}

export async function unprotect(sealed) {
  const s = String(sealed || "").trim();
  if (s.startsWith("dpapi:")) return Buffer.from(await runPsAsync(UNPROTECT, s.slice(6)), "base64").toString("utf8");
  if (s.startsWith("plain:") && plainAllowed()) return Buffer.from(s.slice(6), "base64").toString("utf8");
  throw coded("secret", "凭据解不开（换了 Windows 账户、换了电脑，就得重新装一遍：node kfs-alarm.mjs setup）");
}

export function saveSecret(file, obj) {
  writeAtomic(file, protect(JSON.stringify(obj)));
}

export async function loadSecret(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") throw coded("secret", "还没装（这台电脑上没有凭据）：node kfs-alarm.mjs setup");
    throw coded("secret-retry", "凭据一时读不出来（" + (e.code || e.message) + "）");
  }
  let v = null;
  try {
    v = JSON.parse(await unprotect(text));
  } catch (e) {
    if (e.code === "secret" || e.code === "secret-retry") throw e;
  }
  if (!v || !v.email || !v.bits) throw coded("secret", "凭据坏了：重新装一遍（node kfs-alarm.mjs setup）");
  return v;
}
