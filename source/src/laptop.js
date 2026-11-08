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

// 设置里拨的是笔记本、门牌暗记都填了没有
export const laptopOn = (st) => !!st && st.route === "laptop";
export const laptopReady = (st) => laptopOn(st) && !!st.door && !!st.doorKey;
