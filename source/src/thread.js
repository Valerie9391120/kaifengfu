// =====================================================
// 一段对话（一串消息）上的几样手艺：欠不欠回复、回复插在哪、开分支、翻分支，
// 还有从信箱里取出来的回话该不该放、放在哪。
// 不碰页面，测试在 Node 里跑。
//
// 一条消息：{ id, role: "her" | "him" | "event", ts, … }。
// 重新回答、改她说过的话，都会在那一条上开分支：alts 里存着每一支（node 是那一条，after 是它后面的对话），
// altIdx 是眼下摆在外面的是第几支。
// =====================================================

// 在第 i 条开一个新分支：旧的这条连同它后面的对话存进 alts，新的接上，后面清空
export function forkAt(msgs, i, newNode) {
  const m = msgs[i];
  const { alts: oldAlts, altIdx, ...node } = m;
  const alts = oldAlts ? oldAlts.slice() : [];
  alts[oldAlts ? altIdx : 0] = { node, after: msgs.slice(i + 1) };
  const { alts: _x, altIdx: _y, ...fresh } = newNode;
  alts.push({ node: fresh, after: [] });
  return msgs.slice(0, i).concat([{ ...fresh, alts, altIdx: alts.length - 1 }]);
}

// 翻到第 t 个分支：先把眼前这支收好，再把那支整个换上来
export function switchAlt(msgs, i, t) {
  const m = msgs[i];
  if (!m || !m.alts || t < 0 || t >= m.alts.length || t === m.altIdx) return msgs;
  const { alts: oldAlts, altIdx, ...node } = m;
  const alts = oldAlts.slice();
  alts[altIdx] = { node, after: msgs.slice(i + 1) };
  return msgs.slice(0, i).concat([{ ...alts[t].node, alts, altIdx: t }], alts[t].after);
}

// 最后一条（不算换头像提示）是她的话，就说明还欠她一个回复
export function needsReply(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "event") continue;
    return msgs[i].role === "her";
  }
  return false;
}

// 回复插在这次请求的最后一条后面，回复途中她又发的排在回复后面
export function insertReply(base, lastMsgId, him) {
  const pos = lastMsgId ? base.findIndex((m) => m.id === lastMsgId) : -1;
  return pos >= 0 ? base.slice(0, pos + 1).concat([him], base.slice(pos + 1)) : base.concat([him]);
}

// ---------- 信箱里取出来的回话 ----------
// 走新路要来的回话，那一条上记着是哪一回（job）。info 是那一回的条子：
//   chat 哪段对话；last 接在哪一句后面；fork 有的话，是“重新回答”，要换掉的是哪一条；at 那一回是几点发出去的

// 这段对话里（连同翻过去的那些分支），有没有某一回的回话
export function hasJob(msgs, job) {
  return (msgs || []).some((m) => m.job === job || (m.alts || []).some((a) => (a.node && a.node.job === job) || hasJob(a.after, job)));
}

// 这一句后面（不算换头像提示）是不是已经有他的回话了
export function answeredAfter(msgs, lastId) {
  const pos = msgs.findIndex((m) => m.id === lastId);
  if (pos < 0) return false;
  for (let i = pos + 1; i < msgs.length; i++) {
    if (msgs[i].role === "event") continue;
    return msgs[i].role === "him";
  }
  return false;
}

// 这一回的回话放不放得进这段对话：
//   ok     放得进
//   dup    已经在里面了（放过了）
//   later  这台设备上的这段对话还没跟上（没有那一句，多半是还没同步到）
//   gone   用不着了：那一句后面已经有回话；或者要换掉的那一条已经不在外面摆着
export function mailFit(msgs, info, job) {
  if (!Array.isArray(msgs) || !msgs.length) return "later";
  if (hasJob(msgs, job)) return "dup";
  if (!msgs.some((m) => m.id === info.last)) return "later";
  if (info.fork) {
    const j = msgs.findIndex((m) => m.id === info.fork);
    return j >= 0 && msgs[j].role === "him" ? "ok" : "gone";
  }
  return answeredAfter(msgs, info.last) ? "gone" : "ok";
}

// 放进去（先用 mailFit 看过是 ok 的）。him 是整理好的那一条回话
export function mailPut(msgs, info, him) {
  if (!info.fork) return insertReply(msgs, info.last, him);
  // 重新回答：在要换掉的那一条上开新分支。那一回发出去以后她又说的话，接在新回答后面，不收进旧分支
  const j = msgs.findIndex((m) => m.id === info.fork);
  const tail = msgs.slice(j + 1);
  const later = tail.filter((m) => (m.ts || 0) > (info.at || 0));
  const old = tail.filter((m) => !((m.ts || 0) > (info.at || 0)));
  return forkAt(msgs.slice(0, j + 1).concat(old), j, him).concat(later);
}
