// =====================================================
// 传话走她笔记本上的 Claude Code（卿卿 11 月 8 日定的）：API 面板里填的门牌、暗记怎么收拾。不碰界面、不碰网络
//   门牌：闹钟里跑 node kfs-alarm.mjs door 写出来的那一行，https://<电脑>.<tailnet>.ts.net:8443
//   暗记：同一处写出来的二十位，五个一组用横杠连（门那头比的时候去掉横杠、不分大小写）
// 敲门、交话见 cloud.js 的 pingDoor、callClaude、callReply（带 route 的）；门本身见 alarm/door.js
// =====================================================

// 门牌：去掉空白；没写 https:// 的补上；只留到端口（她把 /kfs/ping 那一截一起粘进来也不要紧）
export function normDoor(v) {
  let s = String(v || "").replace(/\s+/g, "");
  if (!s) return "";
  if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch (e) {
    return s.replace(/\/+$/, "");
  }
}

// 暗记：大写、去掉空白和横杠以外的；正好二十位的，五个一组用横杠连
export function normKey(v) {
  const raw = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length === 20) return raw.match(/.{5}/g).join("-");
  return String(v || "").trim().toUpperCase();
}

// 上网查（API 面板里笔记本那一档底下，默认开着）：走笔记本的那一包带上 kfs_web: true（门那头给 Claude Code 它自带的搜索、读网页，
// 见 alarm/bridge.js），名帖后面添这一段（同 Moonlight 的【上网】）。手机这头聊天、打电话，闹钟那头狐宇宙醒来，都照这个开关
export const lapWebOn = (st) => !!st && st.lapWeb !== false;
export const LAP_WEB_NOTE = "【上网】\n她给你接了上网搜索（WebSearch）和读网页（WebFetch）。要查资料、看网页的时候再用，平时聊天用不着。查到的东西用自己的话跟她说，别整段照搬。";
// 往一包里添上网查：带上记号，名帖后面添那一段（名帖是一串块的接在后头，是一段字的换成一串）
export function withLapWeb(body) {
  const sys = Array.isArray(body.system) ? body.system : body.system ? [{ type: "text", text: String(body.system) }] : [];
  return { ...body, kfs_web: true, system: [...sys, { type: "text", text: LAP_WEB_NOTE }] };
}

// 设置里拨的是笔记本、门牌暗记都填了没有
export const laptopOn = (st) => !!st && st.route === "laptop";
export const laptopReady = (st) => laptopOn(st) && !!st.door && !!st.doorKey;
