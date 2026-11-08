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

// 做网页（卿卿 11 月 8 日要的，同 Moonlight；只在走笔记本的时候有）：那一包带上 kfs_pages（那段对话的记号：门那头给 Claude Code
// 读、写、改，只许写那段对话的网页文件夹，见 alarm/bridge.js），名帖后面添【做网页】这一段（{{KFS_PAGES}} 门那头换成那个文件夹）。
// 他写成、改成的那一页回话里带回来（kfs_page），手机这头整页存进开封府：kfs2:page:<id>（加密了跟着云端走），对话里摆一张卡
export const PAGE_KEY = "kfs2:page:";
export const LAP_PAGE_NOTE = `【做网页】
她想要个网页、小游戏、小玩意儿玩的时候，你能自己写一个给她：用 Write 写一个 .html 文件，放进这个文件夹：{{KFS_PAGES}}
- 一个文件装下全部：样式、脚本都写在里面，不用别的文件。画面用 CSS、canvas、SVG、emoji 自己画。
- 她多半在手机上点开：竖屏、手指点，字和按钮大一点。
- <title> 里写上这个网页的名字，对话里那张卡片上写的就是它。
- 写好了照常跟她说话，代码不用贴出来：对话里会自己出一张卡片，她点开就能玩。
- 她要改，就改原来那个文件（先 Read 再 Edit），改完的那一版也会出一张卡片；她要另做一个，才另起一个文件名。
- 一页最多一兆，别往里塞大图。网页里存不住东西（localStorage 用不了），关了再开就从头来。
- 只在这个文件夹里写，别处的文件不碰。平时聊天用不着，她要了再做。`;
// 往一包里添做网页：带上那段对话的记号，名帖后面添那一段
export function withLapPages(body, tag) {
  const sys = Array.isArray(body.system) ? body.system : body.system ? [{ type: "text", text: String(body.system) }] : [];
  return { ...body, kfs_pages: tag, system: [...sys, { type: "text", text: LAP_PAGE_NOTE }] };
}
// 回话里带回来的那几页（kfs_page）→ 对话里的那几样（{ type: "page", page, title, file, edited, toobig? }）和要存的那几页。
// page：这一条回话的 id 加第几页（两台设备各取一遍同一封信，存的是同一个名字）
export function pagesOf(content, msgId) {
  const items = [];
  const saves = [];
  (content || [])
    .filter((b) => b && b.type === "kfs_page")
    .forEach((b, i) => {
      const it = { type: "page", page: `${msgId}.${i}`, title: String(b.title || b.file || "网页").slice(0, 80), file: String(b.file || ""), edited: !!b.edited };
      if (typeof b.html === "string" && b.html) saves.push({ key: PAGE_KEY + it.page, value: JSON.stringify({ file: it.file, title: it.title, html: b.html, edited: it.edited }) });
      else it.toobig = Number(b.toobig) || 1;
      items.push(it);
    });
  return { items, saves };
}
// 跟他说他做过的那几页（寄回给他的对话里，跟在他那一条后面）
export function pageNote(it) {
  if (it.toobig) return `[开封府提示：你做的网页《${it.title}》（${it.file}）太大了（${(it.toobig / 1048576).toFixed(1)} 兆），开封府存不下，她打不开。一页最多一兆，别往里塞大图。]`;
  return `[开封府提示：你${it.edited ? "改过的那一页" : "做的网页"}《${it.title}》（${it.file}）放进对话里了，她点开就能玩。]`;
}

// 设置里拨的是笔记本、门牌暗记都填了没有
export const laptopOn = (st) => !!st && st.route === "laptop";
export const laptopReady = (st) => laptopOn(st) && !!st.door && !!st.doorKey;
