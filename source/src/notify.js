// =====================================================
// 通知：不碰浏览器、不碰云端的那些零件（单独测得了）。
// 接浏览器和云端的在 push.js；发通知的在小后端（supabase/push_function.ts）；
// 显示通知的是系统自己，认不得的浏览器由 sw.js 兜底。
// =====================================================

// 记在这台设备上（localStorage，不跟云端走）
export const PUSH_FLAG = "kfs-push"; // 写着 "on"：她在这台设备上开过通知
export const PUSH_KEY = "kfs-push-key"; // 订阅的时候用的是服务器的哪把公钥

// ---------- base64url ----------

export function bytesToB64u(bytes) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
  let s = "";
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 两种 base64 都认；不是 base64 就回 null
export function b64uToBytes(text) {
  const t = String(text == null ? "" : text).trim().replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!t || !/^[A-Za-z0-9+/]+$/.test(t) || t.length % 4 === 1) return null;
  try {
    const raw = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  } catch (e) {
    return null;
  }
}

// 两把公钥是不是同一把（写法不同不算不同）
export function sameKey(a, b) {
  const x = b64uToBytes(a);
  const y = b64uToBytes(b);
  return !!x && !!y && bytesToB64u(x) === bytesToB64u(y);
}

// ---------- 钥匙 ----------

// 生成一对签名用的钥匙（VAPID，P-256）。公钥 65 个字节、私钥 32 个字节，都写成 base64url：
// 和 web-push 这类工具生成的是同一种，小后端认的就是这种
export async function generateVapidKeys(subtle) {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  const jwk = await subtle.exportKey("jwk", pair.privateKey);
  const d = b64uToBytes(jwk.d);
  if (pub.length !== 65 || pub[0] !== 4 || !d || d.length !== 32) throw new Error("钥匙没生成对");
  return { publicKey: bytesToB64u(pub), privateKey: bytesToB64u(d) };
}

// 贴进 Supabase 密钥柜的那三行（那边一次能贴好几行“名字=值”）
export function secretsBlock(keys, email) {
  const mail = String(email || "").trim();
  return [`VAPID_PUBLIC_KEY=${keys.publicKey}`, `VAPID_PRIVATE_KEY=${keys.privateKey}`, `VAPID_SUBJECT=mailto:${mail || "这里换成你的邮箱"}`].join("\n");
}

// ---------- 这台设备能不能开 ----------

// w 是 window（测试里传假的）。能开回 { ok: true }；不能开回 { ok: false, why, say }
export function pushSupport(w) {
  const nav = (w && w.navigator) || {};
  if (!w || !w.isSecureContext) return { ok: false, why: "insecure", say: "这个网址不是 https 的，开不了通知。" };
  if ("serviceWorker" in nav && "PushManager" in w && "Notification" in w) return { ok: true, why: "", say: "" };
  const ua = String(nav.userAgent || "");
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  if (apple && !isStandalone(w)) return { ok: false, why: "homescreen", say: "通知只在主屏幕上的开封府里能开。从主屏幕的图标进来，再到这里开。" };
  if (apple) return { ok: false, why: "old", say: "这台设备的系统太旧，开不了通知（要 iOS 16.4 以上）。" };
  return { ok: false, why: "nopush", say: "这个浏览器开不了通知。" };
}

// 是不是从主屏幕的图标打开的
export function isStandalone(w) {
  const nav = (w && w.navigator) || {};
  if (nav.standalone === true) return true;
  try {
    return !!(w.matchMedia && w.matchMedia("(display-mode: standalone)").matches);
  } catch (e) {
    return false;
  }
}

// ---------- 订阅 ----------

// 这份订阅是拿哪把服务器公钥订的；浏览器不肯说就回空
export function subscriptionKey(sub) {
  try {
    const key = sub && sub.options && sub.options.applicationServerKey;
    return key ? bytesToB64u(key) : "";
  } catch (e) {
    return "";
  }
}

// 这台设备是从哪个入口装的（点了通知回到这儿）：只要网址到斜杠为止的那段，问号井号后面的不要
export function entrancePage(loc) {
  return String(loc.origin) + String(loc.pathname).replace(/[^/]*$/, "");
}

// 订阅 → 登记簿里的一行。浏览器给的订阅不完整就回 null
export function subscriptionRow(sub, uid, page, now = new Date()) {
  let json = null;
  try {
    json = sub && typeof sub.toJSON === "function" ? sub.toJSON() : null;
  } catch (e) {}
  const keys = (json && json.keys) || {};
  let p256dh = keys.p256dh || "";
  let auth = keys.auth || "";
  try {
    if (!p256dh && sub.getKey) p256dh = bytesToB64u(sub.getKey("p256dh"));
    if (!auth && sub.getKey) auth = bytesToB64u(sub.getKey("auth"));
  } catch (e) {}
  const endpoint = (json && json.endpoint) || (sub && sub.endpoint) || "";
  const k = b64uToBytes(p256dh);
  const a = b64uToBytes(auth);
  if (!uid || !/^https:\/\//.test(endpoint) || !k || k.length !== 65 || !a || a.length !== 16) return null;
  return { user_id: uid, endpoint, p256dh: bytesToB64u(k), auth: bytesToB64u(a), page: String(page || ""), updated_at: now.toISOString() };
}

// 门牌号是哪家推送服务的
export function pushHostOf(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch (e) {
    return "";
  }
}

export function serviceName(host) {
  if (/\.push\.apple\.com$/.test(host)) return "苹果";
  if (host === "fcm.googleapis.com") return "谷歌";
  if (/mozilla\.com$/.test(host)) return "火狐";
  if (/\.notify\.windows\.com$/.test(host)) return "微软";
  return "推送服务";
}

// ---------- 发得怎么样，说成人话 ----------

// status 是推送服务回的状态码（0 是根本没发出去），note 是它说的原因
export function explainOutcome({ status, note, host }) {
  const who = serviceName(host || "");
  const why = String(note || "");
  if (status >= 200 && status < 300) {
    return { ok: true, say: `${who}收下了，横幅该到了。没到的话，看看是不是开着专注模式，或者手机的 设置 → 通知 → 开封府 里把横幅关了。` };
  }
  if (status === 0 && /^(BadEndpoint|BadKeys|BadPage)$/.test(why)) return { ok: false, say: "这台设备的登记不对，点“关掉”再重新开启一次。" };
  if (status === 0) return { ok: false, say: `没连上${who}，过一会儿再试。` };
  if (status === 404 || status === 410) return { ok: false, say: "这台设备的通知地址作废了，重新开启一次。" };
  if (why === "VapidPkHashMismatch") return { ok: false, say: "密钥柜里的钥匙换过了，这台设备还订在旧的上面。点“关掉”再重新开启一次。" };
  if (status === 403 || /^Bad(JwtToken|AuthorizationHeader|VapidPublicKey)$/.test(why)) {
    return { ok: false, say: `${who}不认密钥柜里的钥匙（${why || status}）。多半是 VAPID_SUBJECT 不是一个真的邮箱，或者公钥私钥不是一对。` };
  }
  if (status === 413) return { ok: false, say: "这条通知太长，推送服务不收。" };
  if (status === 429) return { ok: false, say: `发得太勤，${who}让歇一会儿。` };
  if (status >= 500) return { ok: false, say: `${who}这会儿出了岔子（${status}），过一会儿再试。` };
  return { ok: false, say: `${who}没收（${status}${why ? " " + why : ""}）。把这行字截图给我。` };
}

// ---------- 给我看的细节 ----------

// 面板最底下“看细节”里的那几行：出了毛病她截个图，我就知道卡在哪一步。state 是 push.js 的 checkPush 给的
export function describePush(state) {
  const yes = (b) => (b ? "是" : "否");
  const lines = [`从主屏幕的图标打开：${yes(state.standalone)}`, `浏览器能开通知：${state.support.ok ? "能" : "不能（" + state.support.why + "）"}`];
  if (!state.support.ok) return lines;
  const setup = state.setup;
  lines.push(`系统的许可：${{ granted: "允许了", denied: "拒绝了", default: "还没问过" }[state.permission] || state.permission}`);
  lines.push(`登记簿：${{ ok: "有", missing: "还没建", error: "读不到" }[setup.table] || "没查"}`);
  lines.push(`小后端：${{ ok: "接上了", unreachable: "连不上", auth: "没登录", refused: "不肯答" }[setup.fn] || "没查"}`);
  lines.push(`钥匙：${{ ok: "放好了", missing: "还没放", bad: "不对" }[setup.keys] || "还看不到"}`);
  if (setup.say) lines.push(`它说：${setup.say}`);
  lines.push(`服务线程：${state.worker === "ok" ? "在" : state.worker || "还没起"}`);
  lines.push(`这台设备的门牌号：${state.host ? serviceName(state.host) + "给的（" + state.host + "）" : "还没有"}`);
  lines.push(`这台设备开过通知：${yes(state.flag)}；登记簿里一共 ${state.devices} 台`);
  if (state.last) lines.push(`上一回发：${new Date(state.last.at).toLocaleString("zh-CN", { hour12: false })}，状态 ${state.last.status}${state.last.note ? "，" + state.last.note : ""}`);
  return lines;
}

// ---------- 从通知回来 ----------

// 通知里的网址后面带着一个记号（#n=…）。读出来；没有或者不像，就回空
export function readNoticeMark(hash) {
  const m = /^#n=([A-Za-z0-9._-]{1,80})$/.exec(String(hash || ""));
  return m ? m[1] : "";
}

export function noticeMarkOfUrl(url) {
  try {
    return readNoticeMark(new URL(url).hash);
  } catch (e) {
    return "";
  }
}
