// 他的语音条：零件（src/voice.js）、拆回话（src/reply.js）、念的活（src/speaker.js）、念语音的小后端（supabase/voice_function.ts）。
// node tests/voice.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBundle } from "./push-harness.mjs";
import { loadVoiceFunction, voiceEnv, createFakeEleven, silentFrames } from "./voice-harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
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

const voice = await loadBundle("src/voice.js");
const reply = await loadBundle("src/reply.js");
const { createSpeaker, RETRY_MS } = await loadBundle("src/speaker.js");

// ================= 零件 =================
{
  const { splitVoice, spokenOf, heardOf, shownOf, voiceWidth, secondsOf, packVoice, readVoice, voiceKeyOf, voicesIn, collectHisIds, voiceWhere, unvoice, stabOf, VOICE_STAB } = voice;
  ok(J(splitVoice("在呢")) === J([{ voice: false, text: "在呢" }]) && J(splitVoice("a\r\nb")) === J([{ voice: false, text: "a\r\nb" }]),
    "切语音：没有 [VOICE] 的一条原样交回（换行一个不动）");
  ok(J(splitVoice("[VOICE]\n想你了")) === J([{ voice: false, text: "" }, { voice: true, text: "想你了" }]), "切语音：第一行单独写 [VOICE]，下面是语音");
  ok(J(splitVoice("先说一句\n[VOICE]\n再发语音\n第二行")) === J([{ voice: false, text: "先说一句" }, { voice: true, text: "再发语音\n第二行" }]), "切语音：忘了写 [SPLIT]、语音接在一句话后面：也切得开");
  ok(J(splitVoice("[VOICE] 同一行\n下一行")) === J([{ voice: false, text: "" }, { voice: true, text: "同一行\n下一行" }]) && J(splitVoice("  [voice]\t小写\n")) === J([{ voice: false, text: "" }, { voice: true, text: "小写\n" }]),
    "切语音：记号后面同一行跟着的字算语音的头一行；前头的空格、小写的都认");
  ok(J(splitVoice("[VOICE]\n一\n[VOICE]\n二")) === J([{ voice: false, text: "" }, { voice: true, text: "一" }, { voice: true, text: "二" }]), "切语音：两个 [VOICE] 是两条语音");
  ok(J(splitVoice("句子中间的 [VOICE] 不算")) === J([{ voice: false, text: "句子中间的 [VOICE] 不算" }]) && J(splitVoice("全角【VOICE】不算")).includes("全角"), "切语音：记号要在一行的开头");

  ok(spokenOf("[whispers] 卿卿，*摸摸头* **乖**。\n# 标题\n\n\n\n后面") === "[whispers] 卿卿， 乖。\n标题\n\n后面", "念的字：动作不念，加粗的星号、标题的井号去掉，语气标签留着，空行收拢");
  ok(spokenOf("5 * 2") === "5 2" && spokenOf("") === "" && spokenOf(null) === "", "念的字：零散的星号去掉；空的回空");
  ok(heardOf("[whispers] 卿卿。 [continues softly] 我在这里。 [light chuckle] 你又跑来了。") === "卿卿。我在这里。你又跑来了。", "转文字：语气标签摘干净，标签留下的空格（夹在中文中间的）不要");
  ok(heardOf("[quietly, after a pause] Hey. [laughs] I'm here.") === "Hey. I'm here." && heardOf("[laughs]") === "" && heardOf("[表情包] 不是标签") === "[表情包] 不是标签", "转文字：英文的照留空格；只有标签的转出来是空的；中文方括号不当标签");
  ok(heardOf("*走过去* 抱住你") === "抱住你", "转文字：动作也不摆（念的时候就没念）");
  ok(shownOf("[whispers] *摸摸头* **乖**。 [laughs] 好") === "*摸摸头* **乖**。好" && shownOf("[laughs]") === "" && shownOf("[sighs] OK, [pause] fine.\r\n第二行") === "OK, fine.\n第二行",
    "念不成时摆在气泡上的字：语气标签摘掉，动作、加粗留着（照平常的字画）");

  ok(voiceWidth(1) === 78 && voiceWidth(0) === 78 && voiceWidth(NaN) === 78 && voiceWidth(60) === 206 && voiceWidth(600) === 206 && voiceWidth(10) > 78 && voiceWidth(10) < voiceWidth(30) && voiceWidth(30) < 206,
    `气泡多宽：一秒的最窄（78），越长越宽，一分钟往上不再宽（206）；十秒 ${voiceWidth(10)}、三十秒 ${voiceWidth(30)}`);
  ok(voiceWidth(5) - voiceWidth(1) > voiceWidth(59) - voiceWidth(55), "气泡多宽：起头长得快、后头慢（照微信）");
  ok(secondsOf(0) === 1 && secondsOf(2.4) === 2 && secondsOf(2.5) === 3 && secondsOf("x") === 1, "几秒：四舍五入，至少一秒");

  const rec = packVoice({ audio: "SUQz", mime: "audio/mpeg", dur: 2.345 });
  ok(J(readVoice(rec)) === J({ mime: "audio/mpeg", dur: 2.3, audio: "SUQz" }), "存声音：存得进、取得出，几秒留一位小数");
  ok(readVoice("不是 JSON") === null && readVoice(J({ audio: "" })) === null && readVoice(J({ audio: "<script>" })) === null && readVoice(J({ audio: "SUQz", mime: "text/html" })).mime === "audio/mpeg",
    "存声音：坏的、空的、不是 base64 的不认；类型写得不像声音的，当 mp3");
  ok(voiceKeyOf("abc", 2) === "abc.2", "名字：回话的 id 加第几样");
  ok(J(voicesIn({ id: "m1", items: [{ type: "text", text: "在" }, { type: "voice", text: "想你" }, { type: "meme", file: "a.jpg" }, { type: "voice", text: "" }] })) === J([{ key: "m1.1", j: 1, text: "想你" }]) && J(voicesIn(null)) === "[]",
    "要念的那几样：只认有字的语音条，记着它是第几样");
  // 眼前的是 m1（第二个版本）；版本那一格里第二个（altIdx 1）是 m1 掐断之前存下的旧样子（多一条“掐掉的”）
  const tree = [
    { id: "h1", role: "her" },
    {
      id: "m1",
      role: "him",
      items: [{ type: "voice", text: "甲" }],
      altIdx: 1,
      alts: [
        { node: { id: "m0", role: "him", items: [{ type: "voice", text: "乙" }] }, after: [{ id: "x", role: "her" }, { id: "m2", role: "him", items: [{ type: "text", text: "丁" }, { type: "voice", text: "丙" }] }] },
        { node: { id: "m1", role: "him", items: [{ type: "voice", text: "甲" }, { type: "voice", text: "掐掉的" }] }, after: [] },
      ],
    },
  ];
  ok(J(collectHisIds(tree).sort()) === J(["m0", "m1", "m2"]), "删对话：他的每一条回话（连同翻过去的那些版本）都找得到");
  ok(voiceWhere(tree, "m1", 0, "甲") === "shown" && voiceWhere(tree, "m0", 0, "乙") === "kept" && voiceWhere(tree, "m2", 1, "丙") === "kept",
    "在哪儿：眼前这一支上的是 shown；翻过去的版本里的（连同那一支后面的）是 kept");
  ok(voiceWhere(tree, "m1", 1, "掐掉的") === "" && voiceWhere(tree, "m1", 0, "乙") === "" && voiceWhere(tree, "m1", 1, "甲") === "" && voiceWhere(tree, "zz", 0, "甲") === "" && voiceWhere(null, "m1", 0, "甲") === "",
    "在哪儿：版本那一格里眼前那一支的旧样子不算（掐断的照样算没了）；字对不上、第几样对不上、没有这一条的都不算");
  ok(unvoice("在\n[SPLIT]\n[VOICE]\n[whispers] 想你了") === "在\n[SPLIT][语音] 想你了" && unvoice("[VOICE] 同一行") === "[语音] 同一行", "写日记的摘录：语音写成“[语音] ”，标签摘掉");
  ok(unvoice("按 [Enter] 发出去\n[SPLIT]\n[VOICE]\n[laughs] 好\n*笑* 嗯") === "按 [Enter] 发出去\n[SPLIT][语音] 好\n嗯" && unvoice("先说一句\n[VOICE] [sighs] 再发语音") === "先说一句\n[语音] 再发语音",
    "写日记的摘录：只动语音那几段（平常打的字里方括号括着的英文照留）；语音里的动作不摘录（念的时候就没念）");
  ok(stabOf("steady") === 1 && stabOf("lively") === 0 && stabOf("mid") === 0.5 && stabOf("乱写") === 0.5 && Object.keys(VOICE_STAB).length === 3,
    "念得稳不稳：三档，只用 0、0.5、1（v3 只认这三个）；没选过、写岔了就是适中");

  const s = voice.silentMp3(3);
  ok(s.length === 624 && s[0] === 0xff && s[208] === 0xff && s[209] === 0xfb, "几帧没声音的 mp3：一帧 208 个字节，帧头对");

  const now = 1_000_000_000_000;
  const raw = J([
    { k: "a.0", t: "甲", c: "c1", at: now - 1000 },
    { k: "a.0", t: "重复的", c: "c1", at: now - 500 },
    { k: "b.0", t: "太老", c: "c1", at: now - voice.WANT_AGE - 1 },
    { k: "c.0", t: "钟点在将来", c: "c1", at: now + 3600_000 },
    { k: "d.0", t: 5, c: "c1", at: now },
    { k: "e.0", t: "乙", c: "c2", at: now },
  ]);
  const w = voice.readWants(raw, now);
  ok(J(w.map((x) => x.k)) === J(["a.0", "e.0"]) && voice.readWants("坏的", now).length === 0 && voice.readWants(J({}), now).length === 0, "要念的那一串：重复的、太老的、钟点不对的、写坏了的不认");
  const many = voice.addWants([], Array.from({ length: 80 }, (_, i) => ({ k: `m${i}.0`, t: "字", c: "c", at: now })));
  ok(many.length === voice.WANT_MAX && many[0].k === "m20.0" && J(voice.dropWants(w, ["a.0"]).map((x) => x.k)) === J(["e.0"]) && J(voice.addWants(w, [{ k: "a.0", t: "新", c: "c1", at: now }]).map((x) => x.t)) === J(["乙", "新"]),
    "要念的那一串：最多记六十条（挤掉老的）；划掉、重记都对");
  ok(J(voice.readHeard(J(["a.0", 3, "b.1"]))) === J(["a.0", "b.1"]) && J(voice.readHeard("坏")) === "[]", "转过文字的那一串：只认名字");
}

// ================= 拆回话 =================
{
  const { parseReply, rawOf } = reply;
  const items = (t) => J(parseReply(t).items);
  ok(items("[VOICE]\n[whispers] 卿卿，我在。") === J([{ type: "voice", text: "[whispers] 卿卿，我在。" }]), "拆回话：[VOICE] 开头的一条是语音，标签留着（念的时候要用）");
  ok(items("<thinking>想</thinking>\n先打字\n[SPLIT]\n[VOICE]\n想你了\n[SPLIT]\n再打字") === J([{ type: "text", text: "先打字" }, { type: "voice", text: "想你了" }, { type: "text", text: "再打字" }]), "拆回话：语音夹在字中间，照先后");
  ok(items("没写 SPLIT\n[VOICE]\n抓到你了") === J([{ type: "text", text: "没写 SPLIT" }, { type: "voice", text: "抓到你了" }]), "拆回话：语音接在一句话后面（没写 [SPLIT]）也切得开");
  ok(items("[VOICE]\n先说\n[MEME:a.jpg]\n再说") === J([{ type: "voice", text: "先说\n\n再说" }, { type: "meme", file: "a.jpg" }]), "拆回话：语音里夹着的表情包照认，排在语音后面；语音里的字并成一条");
  ok(items("[VOICE]\n[MEME:a.jpg]") === J([{ type: "meme", file: "a.jpg" }]) && items("[VOICE]") === J([{ type: "text", text: "……" }]) && items("[VOICE]\n  \n") === J([{ type: "text", text: "……" }]), "拆回话：语音里一个字都没有：不算语音（只剩表情包的就是表情包；什么都没有的是省略号）");
  const rn = parseReply("[VOICE]\n改个名\n[NAME:小狐]");
  ok(rn.rename === "小狐" && J(rn.items) === J([{ type: "voice", text: "改个名" }]), "拆回话：语音里单独一行的改名字照认，名字不念");
  ok(items("[VOICE]\n讲写法\n[NAME:新名字]") === J([{ type: "voice", text: "讲写法\n[NAME:新名字]" }]), "拆回话：照抄名帖里的写法（[NAME:新名字]）不算改名，留在字里");
  ok(items("[VOICE] [VOICE] 写了两遍") === J([{ type: "voice", text: "写了两遍" }]) && items("[VOICE]\n中间[VOICE]也不留") === J([{ type: "voice", text: "中间也不留" }]), "拆回话：语音里不留 [VOICE] 这几个字");
  const { untoken } = reply;
  ok(untoken("[VOI[VOICE]CE]") === "" && untoken("[VO[VOI[VOICE]CE]ICE]尾") === "尾" && untoken("a[voice]b[Voice]c") === "abc" && untoken("[VOICEx] [VoIcE]") === "[VOICEx] [VoIcE]" && untoken("一家人 👨\u200d👩\u200d👧") === "一家人 👨\u200d👩\u200d👧",
    "摘 [VOICE]：摘到没有为止（摘掉一个两头拼起来又成了一个的，也摘）；不是这三种写法的不动；表情照留");
  const deep = "[VOI".repeat(15000) + "CE]".repeat(15000);
  const t0 = performance.now();
  const flat = untoken(deep);
  ok(flat === "" && performance.now() - t0 < 300, `摘 [VOICE]：套了一万五千层的一趟摘完（${Math.round(performance.now() - t0)} 毫秒）`);
  ok(items("[VOICE]\n[VOI[VOICE]CE]") === J([{ type: "text", text: "……" }]) && items("[VOICE] [VOICE]") === J([{ type: "text", text: "……" }]), "拆回话：语音里摘完 [VOICE] 一个字都不剩的，不算语音");
  ok(items("[DOC:x.md]\n[VOICE]\n文档里的不算\n[/DOC]\n[VOICE]\n文档外的算") === J([{ type: "doc", name: "x.md", text: "[VOICE]\n文档里的不算" }, { type: "voice", text: "文档外的算" }]), "拆回话：文档块里的 [VOICE] 是正文，不算");
  ok(items("句子中间的 [VOICE] 不算") === J([{ type: "text", text: "句子中间的 [VOICE] 不算" }]), "拆回话：句子中间的 [VOICE] 照原样当字");
  ok(rawOf([{ type: "text", text: "在" }, { type: "voice", text: "想你\n第二行" }], "") === "在\n[SPLIT]\n[VOICE] 想你\n第二行", "写回去：语音写回 [VOICE]，记号和头一行在同一行");
  const back = parseReply("<thinking>x</thinking>\n" + rawOf([{ type: "voice", text: "[DOC: x .md ]\n后面" }], ""));
  ok(J(back.items) === J([{ type: "voice", text: "[DOC: x .md ]\n后面" }]), "写回去：语音头一行长得像文档开头的记号，再拆还是语音（记号和头一行写在同一行）");
}

// ================= 念的活（speaker.js） =================
// live：在眼前的那几条（shown）；kept：翻过去了、还留着的那几条
function world(opts = {}) {
  const kv = new Map();
  const local = { text: opts.wants || "" };
  const calls = [];
  const changes = [];
  let vis = opts.visible !== false;
  let hides = 0;
  let t = 1_000_000;
  const sleeps = [];
  const live = new Set(opts.live || []);
  const kept = new Set(opts.kept || []);
  const gate = { hold: null };
  const sp = createSpeaker({
    call: async (text, stability, signal) => {
      calls.push({ text, stability });
      if (gate.hold) {
        await new Promise((resolve, reject) => {
          gate.release = resolve;
          gate.reject = reject;
          signal.addEventListener("abort", () => reject(Object.assign(new Error("不念了"), { code: "stopped" })), { once: true });
        });
      }
      if (opts.fail) {
        const e = opts.fail(calls.length);
        if (e) throw e;
      }
      return { audio: "SUQz" + calls.length, mime: "audio/mpeg", dur: text.length * 0.25 };
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
    visible: () => vis,
    hides: () => hides,
    wants: { get: () => local.text, set: (x) => (local.text = x) },
    stab: () => (opts.stab === undefined ? 0.5 : opts.stab),
    alive: async (w) => (live.has(w.k) ? "shown" : kept.has(w.k) ? "kept" : ""),
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onChange: (key, st) => changes.push([key, st ? st.s : null]),
  });
  const settle = () => new Promise((r) => setTimeout(r, 5));
  // 她切走（hides 加一）、切回来
  const show = (v) => {
    if (!v && vis) hides++;
    vis = v;
  };
  return { sp, kv, local, calls, changes, live, kept, gate, sleeps, settle, show, tick: (ms) => (t += ms) };
}
{
  // 平常的一回：要念 → 念 → 存 → 能放
  const w = world({ live: ["m1.1", "m1.3"] });
  w.sp.want("c1", [{ key: "m1.1", text: "[whispers] 想你了" }, { key: "m1.3", text: "*摸摸头* 乖" }]);
  await w.settle();
  const st1 = w.sp.stateOf("m1.1");
  const rec = voice.readVoice(w.kv.get(voice.VOICE_KEY + "m1.1"));
  ok(w.calls.length === 2 && w.calls[0].text === "[whispers] 想你了" && w.calls[1].text === "乖" && st1.s === "ready" && st1.dur === "[whispers] 想你了".length * 0.25 && rec && rec.audio === "SUQz1",
    `念：一条一条念（交出去的是念的字：标签留着，动作不念），念好一条存一条（kfs2:voice:…），记着几秒（${J(w.calls)}）`);
  ok(J(Object.keys(st1).sort()) === J(["dur", "s"]), "念好了的样子里不带声音、不带地址（放的时候现从存档里取：不攒一大堆在内存里）");
  ok(J(w.changes.filter((c) => c[0] === "m1.1").map((c) => c[1])) === J(["wait", "busy", "ready"]) && w.local.text === "", "念：样子是 等着 → 念着 → 念好了；念完了这台设备上记的那一串就空了");
  // 念好了的再要一回：不再念，样子也不动（不闪一下“等着”）
  const before = w.changes.length;
  w.sp.want("c1", [{ key: "m1.1", text: "[whispers] 想你了" }]);
  await w.settle();
  ok(w.calls.length === 2 && w.changes.length === before && w.local.text === "", "念：念好了的不再念（念一回扣一回额度），样子也不闪一下");
}
{
  // 她不在眼前：不念，记着；回来接着念
  const w = world({ visible: false, live: ["m1.0"] });
  w.sp.want("c1", [{ key: "m1.0", text: "早点睡" }]);
  await w.settle();
  const kept = voice.readWants(w.local.text, 1_000_000);
  ok(w.calls.length === 0 && w.sp.stateOf("m1.0").s === "wait" && kept.length === 1 && kept[0].c === "c1", "她不在眼前：不念，记在这台设备上");
  // 开封府被系统收掉了：重开一个，接着念
  const again = world({ wants: w.local.text, live: ["m1.0"] });
  ok(again.sp.wanting().length === 1, "重开以后：上回没念的还记着");
  again.sp.resume();
  await again.settle();
  ok(again.calls.length === 1 && again.sp.stateOf("m1.0").s === "ready" && again.local.text === "", "重开以后回到眼前：接着念，念完划掉");
}
{
  // 念的时候那一条已经没了（掐断了、删了、她改了前面的话）
  const w = world({ live: [] });
  w.sp.want("c1", [{ key: "m1.0", text: "早点睡" }]);
  await w.settle();
  ok(w.calls.length === 0 && w.local.text === "" && w.sp.stateOf("m1.0") === null && J(w.changes.at(-1)) === J(["m1.0", null]), "那一条回话里已经没有这一样了：不念，划掉；画面上那一格也清掉");
  // 念的工夫里被掐断了：念好的不存
  const w2 = world({ live: ["m1.0"] });
  w2.gate.hold = true;
  w2.sp.want("c1", [{ key: "m1.0", text: "早点睡" }]);
  await w2.settle();
  w2.live.delete("m1.0");
  w2.gate.release();
  await w2.settle();
  ok(w2.calls.length === 1 && !w2.kv.has(voice.VOICE_KEY + "m1.0") && w2.sp.stateOf("m1.0") === null, "念的工夫里那一条没了：念好的不存");
}
{
  // drop：正念着的那一问掐掉；念好存着的删掉
  const w = world({ live: ["m1.0", "m1.1"] });
  w.gate.hold = true;
  w.sp.want("c1", [{ key: "m1.0", text: "一" }, { key: "m1.1", text: "二" }]);
  await w.settle();
  await w.sp.drop(["m1.0"]);
  w.gate.hold = false;
  await w.settle();
  ok(w.calls.length === 2 && !w.kv.has(voice.VOICE_KEY + "m1.0") && w.kv.has(voice.VOICE_KEY + "m1.1") && w.sp.stateOf("m1.0") === null && w.sp.stateOf("m1.1").s === "ready",
    "不要了的（掐断了）：正念着的那一问掐掉、不存；后面的照念");
  await w.sp.drop(["m1.1"]);
  ok(!w.kv.has(voice.VOICE_KEY + "m1.1") && w.sp.stateOf("m1.1") === null, "不要了的：念好存着的删掉");
}
{
  // 念不成
  const quota = Object.assign(new Error("ElevenLabs 的额度用完了（或者这把 key 设的上限到了）"), { code: "refused", reason: "quota" });
  const w = world({ live: ["m1.0", "m1.1"], fail: () => quota });
  w.sp.want("c1", [{ key: "m1.0", text: "一" }, { key: "m1.1", text: "二" }]);
  await w.settle();
  const st = w.sp.stateOf("m1.0");
  ok(w.calls.length === 2 && st.s === "fail" && st.why.includes("额度用完了") && !st.long && w.local.text === "" && w.sleeps.length === 0,
    "念不成（额度用完了）：缘故记下，划掉，不自己再念（不歇着再试）");
  // 一时的岔子：歇一下再念一回
  const busy = Object.assign(new Error("ElevenLabs 那边太挤，过一会儿再念"), { code: "refused", reason: "busy" });
  const w2 = world({ live: ["m1.0"], fail: (n) => (n === 1 ? busy : null) });
  w2.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w2.settle();
  ok(w2.calls.length === 2 && J(w2.sleeps) === J([RETRY_MS]) && w2.sp.stateOf("m1.0").s === "ready", "一时的岔子（太挤）：歇一下再念一回，成了");
  const w3 = world({ live: ["m1.0"], fail: () => busy });
  w3.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w3.settle();
  ok(w3.calls.length === 2 && w3.sp.stateOf("m1.0").s === "fail" && J(w3.sleeps) === J([RETRY_MS]), "一时的岔子连着两回：就不念了（一回只多试一次，只歇一回）");
  // 她不在眼前的时候没连上：记着，回来再念
  const off = Object.assign(new Error("连不上"), { code: "unreachable" });
  let away = null;
  const w4 = world({ live: ["m1.0"], fail: (n) => (n === 1 ? (away(), off) : null) });
  away = () => w4.show(false);
  w4.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w4.settle();
  ok(w4.calls.length === 1 && w4.sp.stateOf("m1.0").s === "wait" && w4.sp.wanting().length === 1, "念到一半她切走了、没连上：不算念不成，记着");
  w4.show(true);
  w4.sp.resume();
  await w4.settle();
  ok(w4.calls.length === 2 && w4.sp.stateOf("m1.0").s === "ready", "她回来：接着念，成了");
  // 太长的不念
  const w5 = world({ live: ["m1.0"] });
  w5.sp.want("c1", [{ key: "m1.0", text: "长".repeat(voice.VOICE_MAX + 1) }]);
  await w5.settle();
  const long = w5.sp.stateOf("m1.0");
  ok(w5.calls.length === 0 && long.s === "fail" && long.long && long.why.includes("太长"), "太长的（念的字过了四百个）：不念，说一句太长了（再念也没用，不给“再念”）");
  const w6 = world({ live: ["m1.0"] });
  w6.sp.want("c1", [{ key: "m1.0", text: "长".repeat(voice.VOICE_MAX) }]);
  await w6.settle();
  ok(w6.calls.length === 1 && w6.sp.stateOf("m1.0").s === "ready", "正好四百个字的：念");
  // 她点了“点这里再念”
  const w7 = world({ live: ["m1.0"], fail: (n) => (n === 1 ? quota : null) });
  w7.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w7.settle();
  w7.sp.again("c1", "m1.0", "一");
  await w7.settle();
  ok(w7.calls.length === 2 && w7.sp.stateOf("m1.0").s === "ready", "念不成的，她点“再念”：再念一回");
  const seen = w7.changes.length;
  w7.sp.again("c1", "m1.0", "一");
  await w7.settle();
  ok(w7.calls.length === 2 && w7.changes.length === seen, "念好了的，再点也不念（样子也不动）");
}
{
  // look：画面上冒出一条
  const w = world({ live: ["m1.0"] });
  w.kv.set(voice.VOICE_KEY + "m1.0", voice.packVoice({ audio: "QUJD", dur: 3 }));
  await w.sp.look("m1.0");
  await w.sp.look("m2.0");
  ok(w.sp.stateOf("m1.0").s === "ready" && w.sp.stateOf("m1.0").dur === 3 && w.sp.stateOf("m2.0").s === "none" && w.calls.length === 0, "冒出来一条：存档里有就是念好了的；没有、也没人要念的，是“没念”（不自己念）");
  // 别的设备念好的同步下来了
  const w2 = world({ visible: false, live: ["m1.0"] });
  w2.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w2.settle();
  w2.kv.set(voice.VOICE_KEY + "m1.0", voice.packVoice({ audio: "QUJD", dur: 2 }));
  await w2.sp.synced([voice.VOICE_KEY + "m1.0", "kfs2:chat:x"]);
  ok(w2.sp.wanting().length === 0 && w2.local.text === "", "别的设备念好的同步下来了：这台设备上记着要念的那一条当场划掉（不等她回来）");
  w2.show(true);
  w2.sp.resume();
  await w2.settle();
  ok(w2.calls.length === 0 && w2.sp.stateOf("m1.0").s === "ready" && w2.sp.wanting().length === 0, "别的设备念好的同步下来了：这台设备就不念了");
  w2.kv.delete(voice.VOICE_KEY + "m1.0");
  await w2.sp.synced([voice.VOICE_KEY + "m1.0"]);
  ok(w2.sp.stateOf("m1.0").s === "none", "别的设备删了（对话删了）：这台设备上也没了");
  // 稳不稳交给念的那一头（“活泼”那一档是 0，也照交，不当成没写）
  const w3 = world({ live: ["m1.0"], stab: 0 });
  w3.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w3.settle();
  ok(w3.calls[0].stability === 0, "念得稳不稳：照眼下那一档交出去（0 也照交）");
}
{
  // 上回没念完的（记在设备上）：画面上冒出来只看一眼，不当场念；等“接着念”那一下（回到眼前歇一会儿，网才连得上）
  const first = world({ visible: false, live: ["m1.0"] });
  first.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await first.settle();
  const w = world({ wants: first.local.text, live: ["m1.0"] });
  await w.sp.look("m1.0");
  await w.settle();
  ok(w.calls.length === 0 && w.sp.stateOf("m1.0").s === "wait", "画面上冒出来一条记着要念的：样子是“等着”，不当场念");
  w.sp.resume();
  await w.settle();
  ok(w.calls.length === 1 && w.sp.stateOf("m1.0").s === "ready", "等到“接着念”那一下：念");
}
{
  // 她点了重新回答（旧回答翻过去了）：还没念的不念
  const w = world({ kept: ["m1.0"] });
  w.sp.want("c1", [{ key: "m1.0", text: "旧回答里的" }]);
  await w.settle();
  ok(w.calls.length === 0 && w.sp.stateOf("m1.0").s === "none" && w.local.text === "" && J(w.changes.at(-1)) === J(["m1.0", "none"]),
    "翻过去了的（她点了重新回答，旧回答收起来了）：还没念的不念，划掉（不挡着新回答里的）；样子记成“没人念”，告诉画面（翻回去是“点这里念出来”，不是一直转圈）");
  // 念到一半翻过去了：念好的照存（钱已经花了，她翻回来就能放）
  const w2 = world({ live: ["m1.0"] });
  w2.gate.hold = true;
  w2.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w2.settle();
  w2.live.delete("m1.0");
  w2.kept.add("m1.0");
  w2.gate.release();
  await w2.settle();
  ok(w2.calls.length === 1 && w2.kv.has(voice.VOICE_KEY + "m1.0") && w2.sp.stateOf("m1.0").s === "ready", "念到一半翻过去了：念好的照存（她翻回来就能放）");
}
{
  // 花钱的规矩：那头也许念完了、扣过了的几种，不自己再念
  const one = async (err, label) => {
    const w = world({ live: ["m1.0"], fail: (n) => (n === 1 ? err : null) });
    w.sp.want("c1", [{ key: "m1.0", text: "一" }]);
    await w.settle();
    const st = w.sp.stateOf("m1.0");
    ok(w.calls.length === 1 && w.sleeps.length === 0 && st.s === "fail" && !st.long && st.why === err.message && w.local.text === "", `${label}：不自己再念（念一回扣一回），摆“点这里再念”`);
  };
  await one(Object.assign(new Error("连不上念语音的小后端（voice 函数还没建，或者网不好）"), { code: "unreachable" }), "没连上（她一直在眼前）");
  await one(Object.assign(new Error("念得太久，没等到"), { code: "slow" }), "这边等太久了");
  await one(Object.assign(new Error("ElevenLabs 念得太久，没等到"), { code: "refused", reason: "slow" }), "小后端那头等 ElevenLabs 等太久了");
  await one(Object.assign(new Error("念回来的声音读到一半断了"), { code: "refused", reason: "slow" }), "念回来的读到一半断了");
  await one(Object.assign(new Error("念语音的小后端出错了（500）"), { code: "refused", reason: "gateway" }), "小后端自己出了错");
  // ElevenLabs 一时出岔子（它没念）：歇一下再念一回
  const down = Object.assign(new Error("ElevenLabs 一时出岔子了（500），过一会儿再念"), { code: "refused", reason: "down" });
  const w = world({ live: ["m1.0"], fail: (n) => (n === 1 ? down : null) });
  w.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w.settle();
  ok(w.calls.length === 2 && J(w.sleeps) === J([RETRY_MS]) && w.sp.stateOf("m1.0").s === "ready", "ElevenLabs 一时出岔子（它没念、不扣）：歇一下再念一回，成了");
}
{
  // 念的工夫里她切走又回来，回来了才知道断了（iPhone 上切走会把请求掐了）：记着，接着再念一回
  const off = Object.assign(new Error("连不上"), { code: "unreachable" });
  const w = world({ live: ["m1.0"] });
  w.gate.hold = true;
  w.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w.settle();
  w.show(false);
  w.show(true);
  w.sp.resume(); // 回到眼前那一下叫的“接着念”：正念着，记下，等这一轮完了再看一遍
  w.gate.hold = false;
  w.gate.reject(off);
  await w.settle();
  ok(w.calls.length === 2 && w.sp.stateOf("m1.0").s === "ready" && w.local.text === "", "念的工夫里她切走又回来、回来才知道断了：不算念不成，接着再念一回，成了");
  // 等太久的那种（iPhone 上切走的时候钟停着，回来一下子就到点了）也一样
  const slow = Object.assign(new Error("念得太久，没等到"), { code: "slow" });
  let away = null;
  const w2 = world({ live: ["m1.0"], fail: (n) => (n === 1 ? (away(), slow) : null) });
  away = () => w2.show(false);
  w2.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w2.settle();
  ok(w2.calls.length === 1 && w2.sp.stateOf("m1.0").s === "wait", "她切走了、等太久了：记着");
  w2.show(true);
  w2.sp.resume();
  await w2.settle();
  ok(w2.calls.length === 2 && w2.sp.stateOf("m1.0").s === "ready", "她回来：接着念，成了");
  // 额度用完了那种，切没切走都一样：念不成
  const quota = Object.assign(new Error("ElevenLabs 的额度用完了"), { code: "refused", reason: "quota" });
  const w3 = world({ live: ["m1.0"], fail: (n) => (n === 1 ? (w3.show(false), quota) : null) });
  w3.sp.want("c1", [{ key: "m1.0", text: "一" }]);
  await w3.settle();
  ok(w3.calls.length === 1 && w3.sp.stateOf("m1.0").s === "fail", "额度用完了：她切没切走都算念不成（回来不会自己再念）");
}
{
  // 删了一段对话：那段对话里正念着的掐掉、排着的不念了；别的对话里的照念
  const w = world({ live: ["a.0", "a.1", "b.0"] });
  w.gate.hold = true;
  w.sp.want("c1", [{ key: "a.0", text: "一" }, { key: "a.1", text: "二" }]);
  w.sp.want("c2", [{ key: "b.0", text: "三" }]);
  await w.settle();
  const busy = w.sp.busyWith();
  w.gate.hold = false;
  await w.sp.dropChat("c1");
  await w.settle();
  ok(busy === "a.0" && w.calls.length === 2 && w.calls[1].text === "三" && w.sp.stateOf("a.0") === null && w.sp.stateOf("a.1") === null && !w.kv.has(voice.VOICE_KEY + "a.0") && w.sp.stateOf("b.0").s === "ready" && w.local.text === "",
    "删了一段对话：那段对话里正念着的那一问掐掉、排着的不念了；别的对话里的照念");
}
{
  // 她关了“他能发语音”
  const w = world({ live: ["m1.0", "m1.1", "m2.0"] });
  w.kv.set(voice.VOICE_KEY + "m2.0", voice.packVoice({ audio: "QUJD", dur: 2 }));
  await w.sp.look("m2.0");
  w.gate.hold = true;
  w.sp.want("c1", [{ key: "m1.0", text: "一" }, { key: "m1.1", text: "二" }]);
  await w.settle();
  w.sp.halt();
  await w.settle();
  ok(w.calls.length === 1 && w.sp.stateOf("m1.0").s === "none" && w.sp.stateOf("m1.1").s === "none" && w.sp.wanting().length === 0 && w.local.text === "" && w.sp.stateOf("m2.0").s === "ready" && w.kv.has(voice.VOICE_KEY + "m2.0"),
    "她关了“他能发语音”：正念着的掐掉、排着的不念了（气泡上是“点这里念出来”）；念好的留着照样能放");
  w.gate.hold = false;
  w.sp.again("c1", "m1.1", "二");
  await w.settle();
  ok(w.calls.length === 2 && w.sp.stateOf("m1.1").s === "ready", "关着的时候她自己点“点这里念出来”：照念");
}
{
  // 画面正等着的那一条（新回话一条一条蹦，蹦到它了）：排到最前头
  const w = world({ live: ["a.0", "a.1", "b.0"] });
  w.gate.hold = true;
  w.sp.want("c1", [{ key: "a.0", text: "一" }, { key: "a.1", text: "二" }]);
  w.sp.want("c1", [{ key: "b.0", text: "三" }]);
  await w.settle();
  w.sp.hurry("b.0");
  w.sp.hurry("zz.0");
  const order = w.sp.wanting();
  w.gate.hold = false;
  w.gate.release();
  await w.settle();
  ok(J(order) === J(["b.0", "a.0", "a.1"]) && J(w.calls.map((c) => c.text)) === J(["一", "三", "二"]) && voice.readWants(w.local.text, 1_000_000).length === 0,
    `画面正等着的那一条：排到最前头，正念着的那一条念完就念它（念的先后：${w.calls.map((c) => c.text).join("、")}）`);
}

// ================= 网页这头敲 voice 函数（cloud.js 的 callVoice） =================
{
  const cloud = await loadBundle("src/cloud.js");
  const { callVoice } = cloud;
  cloud.supabase.auth.getSession = async () => ({ data: { session: { access_token: "tok" } }, error: null });
  const real = globalThis.fetch;
  let answer = null;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith("/functions/v1/voice")) return real(url, init);
    seen = init;
    return answer(init);
  };
  const codeOf = async (p) => {
    try {
      await p;
      return "ok";
    } catch (e) {
      return e.code + (e.reason ? "/" + e.reason : "");
    }
  };
  const never = (init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  const send = (status, body) => async () => new Response(typeof body === "string" ? body : J(body), { status });
  answer = send(200, { type: "voice", audio: "SUQz", mime: "audio/mpeg", dur: 1.5 });
  const d = await callVoice({ op: "speak", text: "在", stability: 0.5 });
  ok(d.audio === "SUQz" && seen.headers.Authorization === "Bearer tok" && J(JSON.parse(seen.body)) === J({ op: "speak", text: "在", stability: 0.5 }), "敲 voice 函数：带着她的登录凭证，交回念好的那一包");
  answer = never;
  const t0 = Date.now();
  const late = await codeOf(callVoice({ op: "speak", text: "在" }, { wait: 60 }));
  ok(late === "slow" && Date.now() - t0 < 1000, `等太久了（这头的钟到点）：不等了，说是 slow（${late}）——不当成没连上`);
  const ctl = new AbortController();
  const pending = callVoice({ op: "speak", text: "在" }, { signal: ctl.signal, wait: 5000 });
  setTimeout(() => ctl.abort(), 20);
  ok((await codeOf(pending)) === "stopped", "不要了（外头拉了 signal）：说是 stopped");
  const gone = new AbortController();
  gone.abort();
  ok((await codeOf(callVoice({ op: "speak", text: "在" }, { signal: gone.signal }))) === "stopped", "一上来 signal 就拉过了：不敲门");
  answer = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"type":"voice","audio":"SUQ')); c.error(new TypeError("terminated")); } }), { status: 200 });
  ok((await codeOf(callVoice({ op: "speak", text: "在" }))) === "unreachable", "回了 200、读到一半断了：说是没连上（原来会说成“voice 函数里不是开封府的代码”）");
  answer = send(200, { hello: "world" });
  ok((await codeOf(callVoice({ op: "speak", text: "在" }))) === "nofn", "回了 200、答的不是开封府的格式：函数里不是这份代码");
  answer = send(404, "Not Found");
  ok((await codeOf(callVoice({ op: "key" }))) === "nofn", "404：还没建 voice 函数");
  answer = send(500, "Internal Server Error");
  ok((await codeOf(callVoice({ op: "speak", text: "在" }))) === "refused/gateway", "小后端自己出了错（没按开封府的格式答）：reason 是 gateway（念语音的那一头不当成一时的岔子自己再念）");
  answer = send(502, { type: "error", error: { type: "kaifengfu", message: "ElevenLabs 那边太挤，过一会儿再念", code: "busy" } });
  ok((await codeOf(callVoice({ op: "speak", text: "在" }))) === "refused/busy", "小后端照开封府的格式说了缘故：原样交出去（reason 是它给的 code）");
  answer = send(401, { type: "error", error: { type: "kaifengfu", message: "请先登录开封府" } });
  ok((await codeOf(callVoice({ op: "key" }))) === "auth", "401：登录过期");
  answer = async () => {
    throw new TypeError("Load failed");
  };
  ok((await codeOf(callVoice({ op: "speak", text: "在" }))) === "unreachable", "根本没连上：unreachable");
  globalThis.fetch = real;
}

// ================= 念语音的小后端（voice 函数） =================
{
  const fn = await loadVoiceFunction();
  const fake = createFakeEleven();
  const KEY = "sk_test_eleven_key_1234567890";
  const VOICE = "TestVoiceAbcdefghij1"; // 编的（真的声音编号不进仓库）
  Object.assign(fake.state, { key: KEY, voice: VOICE });
  const USER = { id: "11111111-1111-1111-1111-111111111111", email: "qing@example.com" };
  const real = globalThis.fetch;
  let delay = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.elevenlabs.io/")) return fake.receive(url, init);
    if (url === "http://supa.test/auth/v1/user") {
      const token = (init.headers.Authorization || "").replace("Bearer ", "");
      if (token === "good") return new Response(J(USER), { status: 200 });
      if (token === "other") return new Response(J({ id: "x", email: "someone@else.com" }), { status: 200 });
      return new Response("{}", { status: 401 });
    }
    return real(input, init);
  };
  const reset = () => {
    for (const k of Object.keys(voiceEnv)) delete voiceEnv[k];
    Object.assign(voiceEnv, { SUPABASE_URL: "http://supa.test", SUPABASE_ANON_KEY: "pub", ALLOWED_EMAIL: "qing@example.com", ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE_ID: VOICE });
    Object.assign(fake.state, { fail: null, failTimes: 0, always: false, hold: 0, ttsModels: null });
    fake.log.length = 0;
  };
  const knock = async (body, token = "good") => {
    const r = await fn.handler(new Request("http://x/functions/v1/voice", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: typeof body === "string" ? body : J(body) }));
    let d = null;
    try {
      d = await r.json();
    } catch (e) {}
    return { status: r.status, d, cors: r.headers.get("Access-Control-Allow-Origin") };
  };
  reset();

  // 几秒：一帧一帧数
  const s3 = fn.mp3Seconds(silentFrames(3));
  ok(Math.abs(s3 - 3) < 0.03, `几秒：没声音的三秒（一百一十五帧）数出来 ${s3.toFixed(3)} 秒`);
  const real44 = fn.mp3Seconds(new Uint8Array(fs.readFileSync(path.join(HERE, "fixtures", "voice-3s-44k.mp3"))));
  const real22 = fn.mp3Seconds(new Uint8Array(fs.readFileSync(path.join(HERE, "fixtures", "voice-2s-22k.mp3"))));
  ok(Math.abs(real44 - 3.03) < 0.05 && Math.abs(real22 - 2.06) < 0.06, `几秒：ffmpeg 真编出来的两段（44.1 kHz 带 ID3 标签、22.05 kHz 的 MPEG-2）数出来 ${real44.toFixed(3)}、${real22.toFixed(3)} 秒（ffprobe 说 3.030、2.064）`);
  const tag = new Uint8Array(10 + 20000);
  tag.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0x01, 0x1c, 0x20]); // 两万字节的 ID3 标签（0x01 0x1c 0x20 是 7 位一组写的 20000）
  const withTag = new Uint8Array(tag.length + silentFrames(2).length);
  withTag.set(tag);
  withTag.set(silentFrames(2), tag.length);
  ok(Math.abs(fn.mp3Seconds(withTag) - 2) < 0.03, `几秒：开头带着两万字节的 ID3 标签（比如带着封面图）：跳过去再数（${fn.mp3Seconds(withTag).toFixed(3)}）`);
  ok(fn.mp3Seconds(new Uint8Array(0)) === 0 && fn.mp3Seconds(new Uint8Array(5000)) === 0 && fn.mp3Seconds(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f])) === 0, "几秒：空的、全是零的、ID3 标签说自己长得离谱的：都数出零，不卡住");
  ok(fn.looksMp3(silentFrames(1)) && fn.looksMp3(new Uint8Array([0x49, 0x44, 0x33, 4, 0])) && !fn.looksMp3(new TextEncoder().encode("<html>")), "像不像 mp3：帧头开头、ID3 开头的认，网页不认");

  // 门口
  let r = await knock({ op: "key" }, "bad");
  ok(r.status === 401 && r.d.error.message.includes("登录"), "门口：没登录的不认");
  r = await knock({ op: "key" }, "other");
  ok(r.status === 403 && r.d.error.message.includes("只认卿卿"), "门口：别人的登录不认");
  r = await knock("不是 JSON");
  ok(r.status === 400, "门口：寄来的不是 JSON");
  r = await knock({ op: "speak", text: "字".repeat(9000) });
  ok(r.status === 413, "门口：寄来的东西太长");
  r = await knock({ op: "dance" });
  ok(r.status === 400 && r.d.error.message.includes("不认识"), "门口：不认识的动作");

  // 钥匙
  r = await knock({ op: "key" });
  ok(r.status === 200 && r.d.configured === true && r.d.model === "eleven_v4" && J(r.d.can) === J(["speak"]) && fake.log.length === 0, "钥匙：放好了；默认用 eleven_v4 念；问这一句不去敲 ElevenLabs 的门（不花钱）");
  delete voiceEnv.ELEVENLABS_API_KEY;
  delete voiceEnv.ELEVENLABS_VOICE_ID;
  r = await knock({ op: "key" });
  ok(r.d.configured === false && J(r.d.missing) === J(["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"]) && r.d.message.includes("ELEVENLABS_API_KEY"), "钥匙：两样都没放：说缺哪两样");
  r = await knock({ op: "speak", text: "在" });
  ok(r.status === 400 && r.d.error.code === "setup" && fake.log.length === 0, "钥匙没放好就念：不念，说缘故（setup）");
  reset();
  voiceEnv.ELEVENLABS_VOICE_ID = "带空格 的编号";
  r = await knock({ op: "key" });
  ok(r.d.configured === false && r.d.message.includes("ELEVENLABS_VOICE_ID 不对"), "钥匙：声音编号写得不像：说它不对");
  reset();
  voiceEnv.ELEVENLABS_API_KEY = "'" + KEY + "'  ";
  voiceEnv.ELEVENLABS_MODEL = "eleven_v3";
  r = await knock({ op: "key" });
  ok(r.d.configured === true && r.d.model === "eleven_v3", "钥匙：贴进来两头带着引号、空格的照认；密钥柜里写了 ELEVENLABS_MODEL 就用它");
  voiceEnv.ELEVENLABS_MODEL = "gpt-4";
  r = await knock({ op: "key" });
  ok(r.d.model === "eleven_v4", "钥匙：ELEVENLABS_MODEL 写得不像 ElevenLabs 的模型：当没写");
  reset();

  // 念
  r = await knock({ op: "speak", text: "[whispers] 卿卿，我在。", stability: 0.3 });
  const call = fake.log[0];
  ok(r.status === 200 && r.d.type === "voice" && r.d.mime === "audio/mpeg" && r.d.via === "tts" && r.d.model === "eleven_v4", "念：念好了，交回一段 mp3");
  ok(call.path === `/v1/text-to-speech/${VOICE}` && call.format === "mp3_44100_64" && call.key === KEY && call.body.text === "[whispers] 卿卿，我在。" && call.body.model_id === "eleven_v4" && call.body.voice_settings.stability === 0.3 && call.body.voice_settings.similarity_boost === 0.8,
    `念：敲的是念字的那个接口，用她的声音、v4、64 kbps 的 mp3，稳不稳照网页说的（${J({ path: call.path, format: call.format, settings: call.body.voice_settings })}）`);
  const bytes = Buffer.from(r.d.audio, "base64");
  ok(bytes[0] === 0xff && bytes.length === silentFrames(fake.seconds("[whispers] 卿卿，我在。")).length && Math.abs(r.d.dur - fake.seconds("[whispers] 卿卿，我在。")) < 0.06, `念：交回的 base64 解开就是念回来的那一段；几秒是一帧一帧数出来的（${r.d.dur}）`);
  r = await knock({ op: "speak", text: "在", stability: 7 });
  ok(fake.log[1].body.voice_settings.stability === 0.5, "念：稳不稳写得离谱（不在 0 到 1 之间）：放在中间");
  r = await knock({ op: "speak", text: "   " });
  ok(r.status === 400 && r.d.error.code === "empty", "念：没有字的不念");
  r = await knock({ op: "speak", text: "字".repeat(601) });
  ok(r.status === 400 && r.d.error.code === "long" && fake.log.length === 2, "念：过了六百个字的不念（不去敲门）");

  // 念不成
  const failWith = async (kind) => {
    fake.state.fail = kind;
    fake.state.failTimes = 1;
    return knock({ op: "speak", text: "在" });
  };
  r = await failWith("quota");
  ok(r.status === 502 && r.d.error.code === "quota" && r.d.error.message.includes("额度用完了"), "念不成：额度用完了（ElevenLabs 回的是 401）：说额度，不说 key 不对");
  r = await failWith("key");
  ok(r.d.error.code === "key" && r.d.error.message.includes("ELEVENLABS_API_KEY"), "念不成：key 不对");
  r = await failWith("voice");
  ok(r.d.error.code === "voice" && r.d.error.message.includes("ELEVENLABS_VOICE_ID"), "念不成：找不到这个声音");
  r = await failWith("busy");
  ok(r.d.error.code === "busy", "念不成：太挤");
  r = await failWith("down");
  ok(r.d.error.code === "down" && r.d.error.message.includes("500"), "念不成：ElevenLabs 一时出岔子");
  r = await failWith("garbage");
  ok(r.status === 502 && r.d.error.message.includes("不是声音"), "念不成：回来的不是声音");
  // 没走完的几种：分开说（网页那头只对“没连上 ElevenLabs”自己再念一回；等太久、读到一半断了的也许已经扣过额度，不再念）
  r = await failWith("timeout");
  ok(r.status === 504 && r.d.error.code === "slow" && r.d.error.message.includes("太久"), "念不成：等 ElevenLabs 等太久了（slow，网页那头不自己再念）");
  r = await failWith("offline");
  ok(r.status === 502 && r.d.error.code === "down" && r.d.error.message.includes("连不上"), "念不成：连不上 ElevenLabs（down：它没念，网页那头歇一下再念一回）");
  r = await failWith("broken");
  ok(r.status === 502 && r.d.error.code === "slow" && r.d.error.message.includes("读到一半断了") && r.cors === "*",
    "念不成：回了声音、读到一半断了：照开封府的格式答（带跨域的头，网页认得出是什么岔子；原来这里会整个函数出错，网页只看得到“没连上”，还会自己再念一回）");
  // 不认这个“稳不稳”的数（v3 只认 0、0.5、1）：不带声音那几项再念一回
  fake.log.length = 0;
  fake.state.stabilities = [0, 0.5, 1];
  r = await knock({ op: "speak", text: "稳一点", stability: 0.75 });
  ok(r.status === 200 && r.d.loose === true && fake.log.length === 2 && fake.log[0].body.voice_settings.stability === 0.75 && !("voice_settings" in fake.log[1].body) && fake.log[1].body.text === "稳一点",
    "念：ElevenLabs 不认这个稳不稳的数：不带声音那几项再念一回（照这个声音自己存着的设置），成了；交回的话里说一声");
  fake.log.length = 0;
  r = await knock({ op: "speak", text: "稳", stability: 1 });
  ok(r.status === 200 && !r.d.loose && fake.log.length === 1, "念：认的数（0、0.5、1）一回就成");
  fake.state.stabilities = null;
  // 平常念字的那个接口不认 v4：换多人对话的那个接口再念一回
  fake.log.length = 0;
  fake.state.ttsModels = ["eleven_v3"];
  r = await knock({ op: "speak", text: "换个接口" });
  ok(r.status === 200 && r.d.via === "dialogue" && fake.log.length === 2 && fake.log[1].path === "/v1/text-to-dialogue" && J(fake.log[1].body.inputs) === J([{ text: "换个接口", voice_id: VOICE }]) && fake.log[1].body.model_id === "eleven_v4",
    "念：平常念字的那个接口说不认这个模型：换多人对话的那个接口（一个人说）再念一回，成了");
  fake.state.ttsModels = null;
  fake.log.length = 0;
  fake.state.fail = "key";
  fake.state.failTimes = 1;
  r = await knock({ op: "speak", text: "在" });
  ok(fake.log.length === 1, "念：别的岔子（不是不认模型）不换接口再念");
  // 网页那头不要了（她按了停、那一条被掐断，网页把这一问掐了）：敲 ElevenLabs 的那一问跟着掐
  fake.log.length = 0;
  fake.state.hold = 3000;
  const gone = new AbortController();
  const pending = fn.handler(new Request("http://x/functions/v1/voice", { method: "POST", headers: { Authorization: "Bearer good", "Content-Type": "application/json" }, body: J({ op: "speak", text: "念到一半不要了" }), signal: gone.signal }));
  await new Promise((r) => setTimeout(r, 100));
  const t0 = Date.now();
  gone.abort();
  const cutRes = await pending;
  ok(cutRes.status === 499 && (await cutRes.json()).error.code === "gone" && fake.log.length === 1 && fake.log[0].cut === true && Date.now() - t0 < 1000,
    "网页那头不要了：敲 ElevenLabs 的那一问当场掐掉（省额度），不等它念完");
  fake.state.hold = 0;
  // 跨域的头
  voiceEnv.ALLOWED_ORIGIN = "https://valerie9391120.github.io/kaifengfu/";
  r = await knock({ op: "key" });
  ok(r.cors === "https://valerie9391120.github.io", "跨域的头：密钥柜里的 ALLOWED_ORIGIN 带着路径，也只回域名");
  reset();
  // ElevenLabs 的报错翻成人话
  const e1 = fn.elevenError(422, J({ detail: [{ msg: "text too long" }, { msg: "bad" }] }));
  const e2 = fn.elevenError(400, "<html>");
  ok(e1.code === "refused" && e1.message.includes("text too long") && e2.code === "refused" && e2.message.includes("400"), "报错：422 那种一串的、回来的不是 JSON 的，也说得出个大概");
  globalThis.fetch = real;
}

console.log(`\n通过 ${passed}  失败 ${failed}`);
process.exit(failed ? 1 : 0);
