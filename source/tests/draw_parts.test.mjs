// 他画画：零件（src/draw.js）、拆回话（src/reply.js）、画画的活（src/painter.js）。
// node tests/draw_parts.test.mjs
import { loadBundle } from "./push-harness.mjs";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log("ok:", msg);
  } else {
    failed++;
    console.log("FAIL:", msg);
    if (process.env.KFS_FAILFAST) process.exit(1);
  }
}
const J = (x) => JSON.stringify(x);

const draw = await loadBundle("src/draw.js");
const reply = await loadBundle("src/reply.js");
const { createPainter, RETRY_MAX } = await loadBundle("src/painter.js");

// ================= 零件 =================
{
  const { splitDraw, drawOf, titleSplit, drawKeyOf, drawImgOf, drawsIn, collectDrawKeys, drawWhere, readWants, addWants, dropWants, readJob, packJob, drawNote, DRAW_RULE, WANT_MAX, TITLE_MAX } = draw;
  ok(splitDraw("在呢") === null && splitDraw("句子中间的 [DRAW] 不算") === null && splitDraw("[DRAW:大]\n不认的横竖") === null, "认画：没有记号、记号不在一行开头、横竖写的不认得：都不是画");
  ok(J(splitDraw("[DRAW]\n一只狐狸")) === J({ before: "", prompt: "一只狐狸", ratio: "", title: "" }), "认画：单独一行 [DRAW]，下面是画什么");
  ok(J(splitDraw("先说\n[DRAW:竖] 同一行\n第二行")) === J({ before: "先说\n", prompt: "同一行\n第二行", ratio: "竖", title: "" }), "认画：记号前面的字留着照常拆；同一行跟着的算画什么的头一行；竖的");
  // 名字（卿卿 10 月 31 日要的）：记号同一行后面只有一个《……》
  ok(J(splitDraw("[DRAW:竖]《月下读书》\n一扇木窗\n一盏灯")) === J({ before: "", prompt: "一扇木窗\n一盏灯", ratio: "竖", title: "月下读书" }), "名字：记号同一行后面的《……》是名字，下面几行是画什么");
  ok(splitDraw("[DRAW]  《雪夜》 \r\n雪").title === "雪夜" && splitDraw("[DRAW]《 雪夜 》\n雪").title === "雪夜", "名字：两头的空白、Windows 的换行都认，名字两头的空格去掉");
  ok(J(splitDraw("[DRAW] 《清明上河图》那样的长卷")) === J({ before: "", prompt: "《清明上河图》那样的长卷", ratio: "", title: "" }), "《清明上河图》那样后面还跟着字的：不是名字，是画什么里的字");
  ok(splitDraw("[DRAW]\n《雪夜》\n雪").title === "", "名字要写在记号同一行：另起一行写的《……》算画什么");
  ok(splitDraw("[DRAW]《" + "长".repeat(TITLE_MAX + 1) + "》\n画").title === "" && splitDraw("[DRAW]《》\n画").title === "", "名字太长、空的书名号：不算名字");
  ok(splitDraw("[DRAW]《只有名字》").prompt === "", "只写了名字、没写画什么：画什么是空的（不画）");
  ok(J(drawOf({ type: "draw", prompt: "《旧的》\n画什么" })) === J({ title: "旧的", prompt: "画什么" }) && J(drawOf({ type: "draw", prompt: "一扇窗", title: "窗" })) === J({ prompt: "一扇窗", title: "窗" }) && drawOf({ type: "draw", prompt: "《清明上河图》那样" }).title === "",
     "有名字以前拆的（旧闹钟拆的）：名字那一行还在画什么里，摘出来；拆好的照用");
  ok(splitDraw("  [draw：横]\t横的").ratio === "横" && splitDraw("[Draw: 方 ]\n方").ratio === "方", "认画：前头的空格、小写、全角冒号、横竖两边的空格都认");
  ok(splitDraw("[DRAW]\n一\n[DRAW]\n二").prompt === "一\n[DRAW]\n二", "认画：一条里只认头一个，后面的 [DRAW] 算画什么里的字");
  ok(splitDraw("[DRAW]\n   ").prompt === "", "认画：画什么是空的：交回空的（拆的时候不算一张画）");
  ok(drawKeyOf("m1", 2) === "m1.2" && drawImgOf("m1.2") === "draw.m1.2", "名字：那一条回话的 id 加第几样；画好的图存成 draw. 开头的照片");
  const msgs = [
    { id: "h1", role: "her", text: "画一张" },
    { id: "m1", role: "him", items: [{ type: "text", text: "好" }, { type: "draw", prompt: "狐狸", ratio: "竖" }], alts: [{ node: { id: "m0", role: "him", items: [{ type: "draw", prompt: "旧的" }] }, after: [] }] },
    { id: "m2", role: "him", items: [{ type: "draw", prompt: "" }] },
  ];
  ok(J(drawsIn(msgs[1])) === J([{ key: "m1.1", prompt: "狐狸", ratio: "竖", title: "" }]) && drawsIn(msgs[0]).length === 0 && drawsIn(msgs[2]).length === 0, "一条回话里的画：他的才算，画什么空的不算");
  ok(J(drawsIn({ id: "m9", role: "him", items: [{ type: "draw", prompt: "《旧的》\n狐狸" }] })) === J([{ key: "m9.0", prompt: "狐狸", ratio: "", title: "旧的" }]), "一条回话里的画：名字还夹在画什么里的，摘出来（交出去画的不带名字）");
  ok(J(collectDrawKeys(msgs)) === J(["m1.1", "m0.0"]), "所有分支里的画（删对话的时候一起清）");
  ok(drawWhere(msgs, "m1.1") === "shown" && drawWhere(msgs, "m0.0") === "kept" && drawWhere(msgs, "zz.0") === "", "一张画在哪儿：在眼前、在翻过去的版本里、没了");
  const now = 1e12;
  const w = readWants(JSON.stringify([{ k: "a", p: "画", c: "c1", at: now }, { k: "a", p: "重了", at: now }, { k: "b", p: "", at: now }, { k: "c", p: "老的", at: now - 3 * 86400e3 }, { k: "d", p: "竖", r: "竖", at: now }, { k: "e", p: "乱的横竖", r: "斜", at: now }, "乱的"]), now);
  ok(J(w.map((x) => x.k)) === J(["a", "d", "e"]) && w[1].r === "竖" && w[2].r === "" && readWants("乱的", now).length === 0, "记着要画的那一串：重的、空的、太老的、不成样子的不认；横竖认不得的当没写");
  let L = [];
  for (let i = 0; i < WANT_MAX + 5; i++) L = addWants(L, [{ k: "k" + i, p: "p", at: now }]);
  ok(L.length === WANT_MAX && L[0].k === "k5" && dropWants(L, ["k5"]).length === WANT_MAX - 1, "那一串最多留这么多张");
  ok(readJob(packJob({ state: "running", flow: "f", node: "n", sessions: ["s"], at: 5, by: "d" })).flow === "f" && readJob(packJob({ state: "failed", why: "额度不够" })).why === "额度不够" && readJob(packJob({ state: "starting", at: 3 })).state === "starting" && readJob("乱的") === null && readJob(packJob({ flow: "f", sessions: [] })) === null,
    "画到一半的那一笔：正在画、没画成、正在开画都认；不成样子的不认");
  ok(drawNote({ img: "x" }).includes("画好了，长这样") && drawNote({ old: true }).includes("没带上") && drawNote({ why: "额度不够" }).includes("额度不够") && drawNote({ none: true }).includes("没画出来") && drawNote(null).includes("还在画"), "寄给他的那一句：画好了带图、太老了不带图、没画成、没画、还在画");
  ok(DRAW_RULE.includes("[DRAW]") && DRAW_RULE.includes("[DRAW:竖]") && DRAW_RULE.includes("她看不见") && DRAW_RULE.includes("[DRAW]《月下读书》") && DRAW_RULE.includes("图画院"), "名帖里教他的那一段：怎么写、横竖、起名字（写在记号同一行、摆在图画院里）、画什么那几行她看不见");
}

// ================= 拆回话、写回去 =================
{
  const { parseReply, rawOf } = reply;
  const items = (t) => parseReply(t).items;
  ok(J(items("给你画一张\n[DRAW]\n一只小狐狸在读书")) === J([{ type: "text", text: "给你画一张" }, { type: "draw", prompt: "一只小狐狸在读书" }]), "拆回话：画排在记号前面的字后面；画什么不显示成字");
  ok(J(items("[DRAW:竖] 竖的\n[SPLIT]\n[DRAW:横] 横的")) === J([{ type: "draw", prompt: "竖的", ratio: "竖" }, { type: "draw", prompt: "横的", ratio: "横" }]), "拆回话：用 [SPLIT] 隔开就是两张；横竖记下来");
  ok(J(items("[DRAW]")) === J([{ type: "text", text: "……" }]) && items("[DRAW]\n  ").length === 1, "拆回话：画什么是空的：不算一张画（什么都没剩，照旧摆省略号）");
  ok(J(items("[VOICE]\n先说一句\n[DRAW]\n再画")) === J([{ type: "voice", text: "先说一句" }, { type: "draw", prompt: "再画" }]), "拆回话：语音后面接着画：语音照旧，画在后面");
  ok(J(items("[DRAW]\n画里写了 [MEME:a.jpg] 和\n[VOICE]\n不算")) === J([{ type: "draw", prompt: "画里写了 [MEME:a.jpg] 和\n[VOICE]\n不算" }]), "拆回话：画什么里写的表情包、语音记号都算字");
  ok(J(items("[MEME:a.jpg]\n[DRAW]\n画")) === J([{ type: "meme", file: "a.jpg" }, { type: "draw", prompt: "画" }]), "拆回话：记号前面的表情包照认");
  ok(J(items("[DOC:x.md]\n[DRAW]\n文档里的不算\n[/DOC]")) === J([{ type: "doc", name: "x.md", text: "[DRAW]\n文档里的不算" }]), "拆回话：文档里的 [DRAW] 不算");
  const back = (its) => parseReply("<thinking>x</thinking>\n" + rawOf(its, "")).items;
  const its = [{ type: "text", text: "给你" }, { type: "draw", prompt: "狐狸\n第二行", ratio: "竖" }, { type: "draw", prompt: "方的" }];
  ok(J(back(its)) === J(its) && rawOf([{ type: "draw", prompt: "狐狸", ratio: "竖" }]) === "[DRAW:竖] 狐狸", "写回去：[DRAW:竖] 和画什么写在同一行；再拆还是那几样");
  ok(J(items("给你\n[DRAW:横]《雪夜》\n雪地里一盏灯")) === J([{ type: "text", text: "给你" }, { type: "draw", prompt: "雪地里一盏灯", ratio: "横", title: "雪夜" }]), "拆回话：有名字的画记下名字，画什么里不带名字");
  const named = [{ type: "draw", prompt: "雪地里一盏灯\n第二行", ratio: "横", title: "雪夜" }, { type: "draw", prompt: "《清明上河图》那样", title: "长卷" }];
  ok(J(back(named)) === J(named) && rawOf([named[0]]) === "[DRAW:横]《雪夜》\n雪地里一盏灯\n第二行", `写回去：名字在记号同一行，画什么另起一行；再拆还是那几样（${rawOf([named[0]])}）`);
}

// ================= 画画的活 =================
function rig(opts = {}) {
  const kv = new Map();
  let t = 1_000_000;
  const calls = [];
  const changes = [];
  const images = [];
  const env = { visible: true, where: "shown", wantsText: "" };
  const script = opts.script || []; // 一回一回 check 答什么
  const p = createPainter({
    call: async (op, body) => {
      calls.push({ op, body });
      if (opts.fail) {
        const e = opts.fail(op, calls.length);
        if (e) throw e;
      }
      if (op === "start") return { type: "job", job: { flow: "flow1", node: "node1", sessions: ["sess" + calls.length] }, credits: 237 };
      const next = script.length ? script.shift() : { type: "image", data: "iVBORw0K", mime: "image/png" };
      if (next instanceof Error) throw next;
      return next;
    },
    store: {
      get: async (k) => (kv.has(k) ? kv.get(k) : null),
      set: async (k, v) => {
        kv.set(k, v);
        return true;
      },
      del: async (k) => {
        kv.delete(k);
      },
    },
    visible: () => env.visible,
    wants: { get: () => env.wantsText, set: (v) => (env.wantsText = v) },
    alive: async () => env.where,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
      if (opts.onSleep) opts.onSleep(env, ms);
    },
    shrink: async (got) => (opts.badShrink ? Promise.reject(new Error("画布坏了")) : `data:image/jpeg;base64,small-${got.data}`),
    device: opts.device || "devA",
    onChange: (key, st) => changes.push([key, st && st.s]),
    onImage: (imgId, data, info) => images.push(info ? [imgId, data, info] : [imgId, data]),
  });
  const settle = async () => {
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  };
  return { p, kv, calls, changes, images, env, settle, tick: (ms) => (t += ms), get now() { return t; } };
}
const coded = (code, msg) => Object.assign(new Error(msg), { code });

{
  // 画一张：开画、问两回还在画、画好了存起来
  const r = rig({ script: [{ type: "pending", after: 3 }, { type: "pending", after: 30 }] });
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸", ratio: "竖" }]);
  await r.settle();
  ok(J(r.calls.map((c) => c.op)) === J(["start", "check", "check", "check"]) && r.calls[0].body.prompt === "狐狸" && r.calls[0].body.ratio === "竖", "画一张：开画一回，问到画好为止（中间两回还在画）");
  ok(r.kv.get("kfs2:img:draw.m1.1") === "data:image/jpeg;base64,small-iVBORw0K" && !r.kv.has("kfs2:drawjob:m1.1") && J(r.images) === J([["draw.m1.1", "data:image/jpeg;base64,small-iVBORw0K", { key: "m1.1", chat: "c1" }]]), `画好了：缩过的图存成照片，画到一半的那一笔删掉，画面上换成图；说一声是哪段对话的哪一张（收进图画院用）（${J(r.images)}）`);
  ok(r.p.stateOf("m1.1").s === "ready" && r.p.wanting().length === 0 && r.env.wantsText === "", "画好了：样子是画好了，这台设备上记的那一串清空");
  ok(r.changes.some(([, s]) => s === "busy"), "画的时候：样子是正在画");
}
{
  // 开画的时候她不在眼前：先不开画；回来接着
  const r = rig();
  r.env.visible = false;
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  ok(r.calls.length === 0 && r.p.stateOf("m1.1").s === "wait" && JSON.parse(r.env.wantsText)[0].k === "m1.1", "她不在眼前：先不开画（记在这台设备上）");
  r.env.visible = true;
  r.p.resume();
  await r.settle();
  ok(r.calls[0].op === "start" && r.p.stateOf("m1.1").s === "ready", "她回来了：开画，画好了");
}
{
  // 问的工夫里她走开了：停下，画到一半的那一笔留着；回来接着问，不重画
  const r = rig({ script: [{ type: "pending", after: 3 }], onSleep: (env) => (env.visible = false) });
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  const job = JSON.parse(r.kv.get("kfs2:drawjob:m1.1"));
  ok(job.state === "running" && job.flow === "flow1" && job.sessions[0] === "sess1" && job.by === "devA" && r.p.stateOf("m1.1").s === "busy", "问到一半她走开了：停下，画布和会话记在存档里（跟着云端走）");
  r.env.visible = true;
  r.p.resume();
  await r.settle();
  ok(r.calls.filter((c) => c.op === "start").length === 1 && r.p.stateOf("m1.1").s === "ready", "她回来了：接着问，不重画（开画一回扣一回额度）");
}
{
  // 开封府被系统收掉重开：存档里有画到一半的那一笔，这台设备上记着要画——接着问
  const r2 = rig();
  r2.kv.set("kfs2:drawjob:m1.1", JSON.stringify({ state: "running", flow: "flowX", node: "n", sessions: ["sX"], at: r2.now - 1000, by: "devA" }));
  r2.env.wantsText = JSON.stringify([{ k: "m1.1", p: "狐狸", c: "c1", at: r2.now }]);
  const p3 = createPainterLike(r2);
  p3.resume();
  await r2.settle();
  ok(r2.calls.length >= 1 && r2.calls.every((c) => c.op === "check") && r2.calls[0].body.job.flow === "flowX" && r2.kv.has("kfs2:img:draw.m1.1"), "重开以后：接着问存档里那一回（不重画）");
}
function createPainterLike(r) {
  // 跟 rig 里同一套东西，另起一个（装作开封府重开了一回，读这台设备上记的那一串）
  return createPainter({
    call: async (op, body) => {
      r.calls.push({ op, body });
      if (op === "start") return { type: "job", job: { flow: "flow1", node: "node1", sessions: ["s"] } };
      return { type: "image", data: "AA", mime: "image/png" };
    },
    store: { get: async (k) => (r.kv.has(k) ? r.kv.get(k) : null), set: async (k, v) => (r.kv.set(k, v), true), del: async (k) => r.kv.delete(k) },
    visible: () => r.env.visible,
    wants: { get: () => r.env.wantsText, set: (v) => (r.env.wantsText = v) },
    alive: async () => r.env.where,
    now: () => r.now,
    sleep: async (ms) => r.tick(ms),
    shrink: async (got) => `data:x;base64,${got.data}`,
    device: "devA",
    onChange: () => {},
  });
}
{
  // ElevenLabs 不肯画（额度不够）：不自己再画，缘故记进存档（别的设备看得见）
  const r = rig({ fail: (op) => (op === "start" ? coded("quota", "ElevenLabs 的额度不够了") : null) });
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  const st = r.p.stateOf("m1.1");
  ok(r.calls.length === 1 && st.s === "fail" && st.why.includes("额度") && JSON.parse(r.kv.get("kfs2:drawjob:m1.1")).state === "failed", "开画没成：不自己再开；没画成的缘故记进存档");
  // 她点了“点这里重画”：划掉那一笔，重开
  await r.p.again("c1", "m1.1", "狐狸");
  await r.settle();
  ok(r.calls.filter((c) => c.op === "start").length === 2, "点了重画：又开了一回");
}
{
  // 画失败了：缘故记下
  const r = rig({ script: [{ type: "failed", why: "ElevenLabs 没画成：Content policy" }] });
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  ok(r.p.stateOf("m1.1").why.includes("Content policy") && JSON.parse(r.kv.get("kfs2:drawjob:m1.1")).why.includes("Content policy"), "画失败了：照实记下 ElevenLabs 的原话");
}
{
  // 问的时候登录过期了：记成要重新连、画到一半（点了接着问，不重画）
  const r = rig({ script: [coded("auth", "ElevenLabs 的登录过期了：在 API 面板里重新连一回")] });
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  const st = r.p.stateOf("m1.1");
  ok(st.s === "fail" && st.link && st.resume && JSON.parse(r.kv.get("kfs2:drawjob:m1.1")).state === "running", "问的时候登录过期了：说要重新连；画到一半的那一笔留着");
  await r.p.again("c1", "m1.1", "狐狸");
  await r.settle();
  ok(r.calls.filter((c) => c.op === "start").length === 1 && r.p.stateOf("m1.1").s === "ready", "重新连上以后点“接着画”：接着问，没重画");
}
{
  // 问的时候没连上、太挤：歇一会儿接着问（不花钱）；连着太多回就不问了
  const r = rig({ script: [coded("down", "一时出岔子"), coded("busy", "太挤"), { type: "pending", after: 3 }] });
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  ok(r.p.stateOf("m1.1").s === "ready", "问的时候没连上、太挤：歇一会儿接着问，画好了");
  const many = Array.from({ length: RETRY_MAX + 2 }, () => coded("unreachable", "连不上"));
  const r2 = rig({ script: many });
  r2.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r2.settle();
  ok(r2.p.stateOf("m1.1").s === "fail" && r2.p.stateOf("m1.1").resume, "连着好多回都没问成：不问了，记成没画成（画到一半，点了接着问）");
}
{
  // 画了太久：不等了
  const r = rig({ script: Array.from({ length: 400 }, () => ({ type: "pending", after: 15 })) });
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  ok(r.p.stateOf("m1.1").s === "fail" && r.p.stateOf("m1.1").why.includes("太久"), "开画以后十几分钟还没画好：不等了，记下来");
}
{
  // 那一张不在眼前了：没开画的不画；开了画的接着问完
  const r = rig();
  r.env.where = "";
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  ok(r.calls.length === 0 && r.p.stateOf("m1.1") === null, "那一张没了（掐断了、删了）：不画");
  const r2 = rig();
  r2.env.where = "kept";
  r2.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r2.settle();
  ok(r2.calls.length === 0 && r2.p.stateOf("m1.1").s === "none", "翻过去的版本里、还没开画：不画了（翻回来是“点这里画出来”）");
}
{
  // 别的设备刚记了“正在开画”：等它，不抢着另开一张
  const r = rig({ onSleep: (env, ms) => {} });
  r.kv.set("kfs2:drawjob:m1.1", JSON.stringify({ state: "starting", at: r.now, by: "devB" }));
  let n = 0;
  const p = createPainter({
    call: async (op, body) => {
      r.calls.push({ op, body });
      return op === "start" ? { type: "job", job: { flow: "f", node: "n", sessions: ["s"] } } : { type: "image", data: "AA", mime: "image/png" };
    },
    store: { get: async (k) => (r.kv.has(k) ? r.kv.get(k) : null), set: async (k, v) => (r.kv.set(k, v), true), del: async (k) => r.kv.delete(k) },
    visible: () => true,
    wants: { get: () => "", set: () => {} },
    alive: async () => "shown",
    now: () => r.now,
    sleep: async (ms) => {
      r.tick(ms);
      // 等了一回：那一台开成了
      if (++n === 1) r.kv.set("kfs2:drawjob:m1.1", JSON.stringify({ state: "running", flow: "fB", node: "n", sessions: ["sB"], at: r.now, by: "devB" }));
    },
    shrink: async (got) => `data:x;base64,${got.data}`,
    device: "devA",
    onChange: () => {},
  });
  p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  ok(r.calls.every((c) => c.op === "check") && r.calls[0].body.job.flow === "fB" && r.kv.has("kfs2:img:draw.m1.1"), "别的设备刚开了画：等它一会儿，接着问它那一回（不另开一张）");
}
{
  // 画面上冒出一张画：存档里画好了、没画成、画到一半、什么都没有
  const r = rig();
  r.kv.set("kfs2:img:draw.a.0", "data:x");
  r.kv.set("kfs2:drawjob:b.0", JSON.stringify({ state: "failed", why: "额度不够" }));
  r.kv.set("kfs2:drawjob:c.0", JSON.stringify({ state: "running", flow: "f", node: "n", sessions: ["s"], at: r.now, by: "devB" }));
  await r.p.look("a.0");
  await r.p.look("b.0");
  await r.p.look("d.0");
  ok(r.p.stateOf("a.0").s === "ready" && r.p.stateOf("b.0").s === "fail" && r.p.stateOf("b.0").why === "额度不够" && r.p.stateOf("d.0").s === "none", "看一眼：画好了、没画成（别的设备记的缘故）、什么都没有");
  await r.p.look("c.0", "c1", "狐狸");
  await r.settle();
  ok(r.calls.every((c) => c.op === "check") && r.p.stateOf("c.0").s === "ready", "看一眼：别的设备画到一半的：这台接着问（不花钱），画好了");
}
{
  // 别的设备画好了、同步下来：换成画好了
  const r = rig({ script: Array.from({ length: 3 }, () => ({ type: "pending", after: 3 })) });
  r.env.visible = false;
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  r.kv.set("kfs2:img:draw.m1.1", "data:y");
  await r.p.synced(["kfs2:img:draw.m1.1"]);
  ok(r.p.stateOf("m1.1").s === "ready" && r.p.wanting().length === 0, "别的设备画好的同步下来：这台不画了");
}
{
  // 关了“他能画画”：还没开画的不画了；已经开画的接着问完
  const r = rig();
  r.env.visible = false;
  r.kv.set("kfs2:drawjob:x.0", JSON.stringify({ state: "running", flow: "f", node: "n", sessions: ["s"], at: r.now, by: "devA" }));
  r.p.want("c1", [{ key: "m1.1", prompt: "没开画的" }, { key: "x.0", prompt: "开了画的" }]);
  await r.settle();
  await r.p.halt();
  ok(J(r.p.wanting()) === J(["x.0"]) && r.p.stateOf("m1.1").s === "none", "关了开关：没开画的不画了；开了画的留着接着问");
  // 删对话：画好的、画到一半的都删
  r.kv.set("kfs2:img:draw.x.0", "data:z");
  await r.p.dropChat("c1");
  ok(!r.kv.has("kfs2:img:draw.x.0") && !r.kv.has("kfs2:drawjob:x.0") && r.p.wanting().length === 0, "删对话：那段对话里的画（画好的、画到一半的）都删了");
}
{
  // 缩图没成：存原图
  const r = rig({ badShrink: true });
  r.p.want("c1", [{ key: "m1.1", prompt: "狐狸" }]);
  await r.settle();
  ok(r.kv.get("kfs2:img:draw.m1.1") === "data:image/png;base64,iVBORw0K", "缩图没成：存原来那一张");
}

console.log(`\n通过 ${passed}  失败 ${failed}`);
process.exit(failed ? 1 : 0);
