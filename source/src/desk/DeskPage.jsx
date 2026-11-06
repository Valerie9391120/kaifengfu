import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon.jsx";
import { safeTopPx } from "../ui/parts.jsx";
import { newId } from "../util.js";
import { loadS2T } from "../cangyin/CangyinPage.jsx";
import { localDay } from "../room.js";
import { LuofuPoolSheet } from "../luofu/LuofuPoolSheet.jsx";
import { LuofuGallery } from "../luofu/LuofuGallery.jsx";
import { DressingMirror, DressingCloset, DressingAchievements } from "../dressing/DressingSheets.jsx";
import { DOC_FMT } from "../docs.js";
import { fmtChars } from "../util.js";
import { sepLabel } from "../days.js";
import { pickRecap } from "../recap.js";
import { roundsOf, deskCards, boxOf } from "./parts.js";

/* global __KFS_DESK__, __KFS_WENKAI_CSS__ */
// 狐宇宙那一层：他屋里的一张书案（那一页是 tools/make_desk.py 生成的，零件见 parts.js）。
// 南衙里点“狐宇宙”进来：盖一层全屏（层高 60，同秘戏钱匣），里面一个框装着那一页；框是这时候才建、才去下载（头一回十几兆），关上就拆了。
// 框是隔开的（sandbox 只给 allow-scripts，来路是 null）：碰不到开封府的网页、存档、localStorage。认那一页靠暗号：
// 每回打开现起一个，放在框的名字里，那一页读完就清掉，说话带着；不带暗号的一概不理，信也只递给带暗号来要的那一回。
// 和那一页一问一答（postMessage）：
//   它说 hello → 递 setup（刘海、底下那一条让开多高：框里的 env(safe-area-inset-*) 是 0）、data（信笺上的信、推近花盆铜镜的卡片上写什么）；
//   它说 ready（画好了）、fail（画不出来；net 是有东西没取到）、lost（画好以后画布被收走了，框重建一回）；
//   它说 read / unread（信笺上点了已阅、撤回）、leave（留信：放进狐宇宙那段对话，回它 left）、
//   luofu（锦盒里的梦库、梦廊：这一层里弹出来那一页）、dressing（铜镜那三颗：照镜子、衣柜、成就，同上）、close（案上点左上角：关上）。
//   信匣（在信笺上翻开，摆的是狐宇宙那段对话，见 parts.js 的 boxOf）：它说 box（on：翻开了、合上了），翻开着的时候递 box（摆什么）、
//   pics（表情包、照片、画，晚到的补上）、states（语音、画眼下的样子）、sounds（他念好的语音，那一页自己放）；它说 voice、draw（点了没念的语音、没画的画）、doc、recap（点开一份文档、提要，回它 show）、
//   recapdrop（提要丢掉重抄，回它 tip）、save（文档存到手机）、copy（那一页里复制不成，这边替它复制，回它 copied）。
//   藏起来、弹着梦库梦廊的时候递 hold，那一页先不画（省电）
export const DESK_URL = typeof __KFS_DESK__ !== "undefined" ? __KFS_DESK__ : "./assets/desk.html";
// 霞鹜文楷（同那一页那一份，build.mjs 拼的）：这一层上弹出来的梦库、梦廊照屋里卡片的样子写，字也跟那一页一样。打开这一层的时候挂上，挂一回就留着
const WENKAI_CSS = typeof __KFS_WENKAI_CSS__ !== "undefined" ? __KFS_WENKAI_CSS__ : "";
function hangWenkai() {
  try {
    if (!WENKAI_CSS || document.querySelector("link[data-kfs-wenkai]")) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = WENKAI_CSS;
    l.setAttribute("data-kfs-wenkai", "");
    document.head.appendChild(l);
  } catch (e) {}
}
const WAIT_MS = 20000; // 这么久还没画出来，说一句（头一回要下十几兆）
const REBUILD_MAX = 2; // 画布被收走，框最多重建几回
const BG = "#1c1614"; // 那一页的底色（屋里木头的暗处）
const NOTE = {
  fail: "这台手机画不出这间屋子。信匣照样能看，便签也能留。",
  net: "屋里的东西没取全，可能是网不好。把开封府从后台划掉、重新打开再试。信匣照样能看，便签也能留。",
  slow: "屋子还在路上，网有点慢……",
  gone: "这一页取不到了：把开封府从后台划掉、重新打开再试。信匣照样能看，便签也能留。",
};

// 量一个长度（写成 CSS 的样子）在开封府这头是多少像素（同 LotusPage.jsx）
function px(css) {
  try {
    const d = document.createElement("div");
    d.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${css};visibility:hidden;pointer-events:none`;
    document.body.appendChild(d);
    const h = d.getBoundingClientRect().height || 0;
    d.remove();
    return h;
  } catch (e) {
    return 0;
  }
}

// 我写的那几封转成繁体（信笺上是刻本体，刻本是繁体）：这台设备上自己转、自己记着（同藏音匣），只记还在纸上的那几轮
export const TRAD_KEY = "kfs-desk-trad";
const sig = (t) => {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return t.length + ":" + (h >>> 0).toString(36);
};
function readTrad() {
  try {
    const o = JSON.parse(localStorage.getItem(TRAD_KEY) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch (e) {
    return {};
  }
}
function writeTrad(o) {
  try {
    localStorage.setItem(TRAD_KEY, JSON.stringify(o));
  } catch (e) {}
}

// 信匣里我写的那些字（刻本体）也转成繁体：这一回开着现转，记在内存里（同一句不转第二遍）
const TR = new Map();
function trOf(f, s) {
  if (!s) return s;
  if (TR.has(s)) return TR.get(s);
  let t = s;
  try {
    t = f(s);
  } catch (e) {}
  if (TR.size > 6000) TR.clear();
  TR.set(s, t);
  return t;
}
// 信匣里一份文档卡片上那一小行（同聊天里的文档卡片）
function docSub(e, docs) {
  if (e.side === "her" && docs && docs[e.ref.slice(2)] === false) return "全文没存下来";
  return `${DOC_FMT[e.fmt] || "文档"}，${fmtChars(e.chars || 0)}` + (e.cut ? "，没写完" : "");
}

// 叉的样子（那一页画出来以前、画不出来的时候才摆；画好了左上角是那一页自己的“回开封府”）
const ROUND = {
  position: "absolute",
  top: "calc(env(safe-area-inset-top) + 10px)",
  left: "calc(env(safe-area-inset-left) + 12px)",
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "1px solid rgba(239,230,214,0.2)",
  background: "rgba(14,9,7,0.5)",
  color: "rgba(239,230,214,0.9)",
  display: "grid",
  placeItems: "center",
};
const KAI = '"Kaiti SC", "STKaiti", "KaiTi", "Songti SC", "Noto Serif SC", serif';

// msgs：狐宇宙那段对话；read：收起来的那几轮（Set）；garden、dressing：园子、妆台的存档（家里的闹钟写的，只读）；
// hidden：先藏起来（这一层还在；眼下没人用：画不出来的那一回点“去信匣”，这一层是关上的）；luofu：{ pool, state, onPool }（锦盒里的梦库、梦廊）；
// closet：{ rec, onCloset }（妆台的衣柜那一条，见 dressing/closet.js；推近铜镜那三颗：照镜子、衣柜、成就）；
// box：信匣要的（App.jsx 的 deskKit：狐宇宙的提要、照片和文档、语音和画眼下的样子，再加取图、放语音、复制、存文档、丢提要那几样）
export function DeskPage({ msgs, read, garden, dressing, closet = null, hidden = false, luofu, box = null, now = new Date(), onRead, onLeave, onBox, onClose, onFail, onReady }) {
  const frame = useRef(null);
  const token = useRef(newId() + newId());
  const [gen, setGen] = useState(0); // 框重建过几回（画布被收走以后）
  const [state, setState] = useState("loading"); // loading / slow / live / fail / net / gone
  const [sheet, setSheet] = useState(null); // 弹着的那一页：pool 梦库 / gallery 梦廊 / mirror 照镜子 / closet 衣柜 / achv 成就（妆台那三页）
  const [trad, setTrad] = useState(readTrad); // 编号 → { s: 简体的指纹, t: 繁体 }
  const conv = useRef(null);
  const [convOk, setConvOk] = useState(false); // 转繁体的那一包取来了（信匣里我写的字用）
  const [boxOn, setBoxOn] = useState(false); // 信笺上翻开了信匣
  const kit = box || {};

  const rounds = useMemo(() => roundsOf(msgs, read), [msgs, read]);
  const today = localDay(now.getTime());
  const closetRec = closet ? closet.rec : null;
  const cards = useMemo(() => deskCards({ garden, dressing, today, closet: closetRec }), [garden, dressing, today, closetRec]);
  // 信匣里摆的（翻开着才算）；几点那一行照着现在写（今天、昨天），过一分钟跟着换
  const minute = Math.floor(now.getTime() / 60000);
  const boxRows = useMemo(() => (boxOn ? boxOf(msgs, { read, recaps: kit.recaps || [], now }) : []), [boxOn, msgs, read, kit.recaps, minute]);
  const boxView = useMemo(() => {
    const f = convOk ? conv.current : null;
    return boxRows.map((e) => {
      if (e.side === "me" && (e.t === "say" || e.t === "voice")) {
        const { raw, ...out } = e;
        out.trad = !!f;
        if (f) out.rich = e.rich.map((b) => ({ ...b, parts: b.parts.map((p) => ({ ...p, s: trOf(f, p.s) })) }));
        return out;
      }
      if (e.t === "doc") return { ...e, sub: docSub(e, kit.docs) };
      if (e.t === "photo" && kit.imgs && kit.imgs[e.img] === false) return { ...e, gone: true };
      if (e.t === "draw") {
        const { prompt, ...out } = e;
        return out;
      }
      return e;
    });
  }, [boxRows, convOk, kit.docs, kit.imgs]);
  const latest = useRef(null);
  latest.current = { rounds, cards, trad, gen, onRead, onLeave, onBox, onClose, onFail, onReady, hidden, sheet, msgs, kit, boxRows, closet };
  const sentPics = useRef({}); // 递过去的图（那一页记着，不再递第二遍；框重建了从头递）
  const sentSounds = useRef({}); // 递过去的声音（同上）
  const sentStates = useRef("");

  const post = (m) => {
    try {
      const w = frame.current && frame.current.contentWindow;
      if (w) w.postMessage(m, "*"); // 框是隔开的，来路是 null，只能写 *；认人靠的是只回带着暗号的那几句
    } catch (e) {}
  };
  const setup = () => post({ desk: "setup", top: safeTopPx(), bottom: px("var(--kfs-sab)"), left: px("env(safe-area-inset-left)"), right: px("env(safe-area-inset-right)") });
  const data = () => {
    const L = latest.current;
    post({
      desk: "data",
      rounds: L.rounds.map((r) => {
        const c = L.trad[r.id];
        return { ...r, trad: c && c.s === sig(r.text) ? c.t : "" };
      }),
      cards: L.cards,
    });
  };
  const hold = () => post({ desk: "hold", on: !!(latest.current.hidden || latest.current.sheet) });
  // 点开一份文档：她发的全文从存档里取（还没取到，那一页写“取着”，取到了再递一回），他写的就在那一条里
  const waitDoc = useRef("");
  const showDoc = (ref) => {
    const L = latest.current;
    const d = L.kit.doc ? L.kit.doc(ref) : null;
    waitDoc.current = d && d.text === undefined ? ref : "";
    if (!d) return post({ desk: "show", doc: { kind: "doc", id: ref, ref, title: "文档", about: "这份文档找不到了。", text: "" } });
    const has = typeof d.text === "string";
    const meta = has ? `${DOC_FMT[d.fmt] || "文档"}，${fmtChars(d.text.length)}${d.images ? `，有 ${d.images} 张图片取不出来` : ""}` : d.text === false ? "全文没存下来" : "";
    const acts = has && d.text ? (d.mine ? [{ act: "copy", label: "复制全文" }] : [{ act: "save", label: "存到手机" }, { act: "copy", label: "复制全文" }]) : [];
    post({ desk: "show", doc: { kind: "doc", id: ref, ref, title: d.name, meta, warn: d.cut ? "没写完：回复长度到上限了。" : "", text: has ? d.text : d.text === false ? "" : null, md: d.fmt !== "txt", acts } });
  };
  // 点开那一份前情提要：同对话里点开看的那一张（他抄了什么、抄到哪儿、丢掉重抄）
  const showRecap = (id) => {
    const L = latest.current;
    const all = L.kit.recaps || [];
    const rec = all.find((r) => r.id === id);
    if (!rec) return post({ desk: "show", doc: { kind: "recap", id, title: "前情提要", about: "这份提要已经不在了。", text: "" } });
    const back = !!pickRecap(L.msgs || [], all.filter((r) => r.id !== rec.id)).recap;
    post({
      desk: "show",
      doc: {
        kind: "recap",
        id,
        title: "前情提要",
        about: `这段对话聊长了。这一行以前的${rec.n ? ` ${rec.n} 条` : ""}原话不再每次寄给他，换成他自己抄的这一份；这一行以后的照旧寄原话。原话都还在你这儿，往上翻就是。`,
        meta: [rec.ts ? `抄到 ${sepLabel(rec.ts, new Date())} 为止` : "", `${rec.parts.length} 段`, fmtChars(rec.text.length), rec.more ? "还没抄完，他回完话接着抄" : ""].filter(Boolean).join("，"),
        text: rec.text,
        acts: [
          { act: "copy", label: "复制" },
          { act: "drop", label: "抄得不对，丢掉重抄", arm: back ? "再点一次，丢掉最近抄的这一趟" : "再点一次，整份丢掉从头抄" },
        ],
        foot: back ? "丢掉的只是最近抄的那一趟，他下回回完话会重抄。原话一条不动。" : "前面没有留着更早的一份了：丢的是整份提要，他下回回完话从头抄。原话一条不动。",
      },
    });
  };

  useEffect(hangWenkai, []);
  useEffect(() => {
    const onMsg = (e) => {
      const f = frame.current;
      const m = e.data || {};
      if (!f || e.source !== f.contentWindow || m.tk !== token.current) return;
      const L = latest.current;
      if (m.desk === "hello") {
        setup();
        data();
        hold();
      } else if (m.desk === "ready") {
        setState("live");
        if (L.onReady) L.onReady();
      } else if (m.desk === "fail") {
        setState(m.net ? "net" : "fail");
        if (L.onFail) L.onFail(!!m.net);
      } else if (m.desk === "lost") {
        // 画好以后画布被收走（iPhone 切到后台、内存紧）：框重建一回；重建多了还不行就算了
        setBoxOn(false);
        if (L.gen < REBUILD_MAX) {
          setGen((g) => g + 1);
          setState("loading");
        } else {
          setState("fail");
          if (L.onFail) L.onFail(true);
        }
      } else if (m.desk === "read" || m.desk === "unread") {
        if (typeof m.id === "string" && L.rounds.some((r) => r.id === m.id)) L.onRead(m.id, m.desk === "read");
      } else if (m.desk === "leave") {
        const ok = typeof m.text === "string" && !!m.text.trim() && L.onLeave(m.text);
        post({ desk: "left", n: m.n, ok: !!ok });
      } else if (m.desk === "box") {
        if (m.on) sentStates.current = "";
        setBoxOn(!!m.on);
      } else if (m.desk === "voice" || m.desk === "draw") {
        const e = typeof m.key === "string" ? L.boxRows.find((x) => x.key === m.key && x.t === m.desk) : null;
        if (e && m.desk === "voice" && L.kit.voice) L.kit.voice(e.key, e.raw);
        if (e && m.desk === "draw" && L.kit.draw) L.kit.draw(e.key, e.prompt, e.ratio);
      } else if (m.desk === "doc" && typeof m.ref === "string") showDoc(m.ref);
      else if (m.desk === "recap" && typeof m.id === "string") showRecap(m.id);
      else if (m.desk === "recapdrop" && typeof m.id === "string" && L.kit.dropRecap) {
        Promise.resolve(L.kit.dropRecap(m.id)).then((say) => say && post({ desk: "tip", text: say }), () => {});
      } else if (m.desk === "save" && typeof m.ref === "string" && L.kit.doc && L.kit.save) {
        const d = L.kit.doc(m.ref);
        if (d && typeof d.text === "string") L.kit.save(d.name, d.text);
      } else if (m.desk === "copy" && typeof m.text === "string" && L.kit.copy) {
        Promise.resolve(L.kit.copy(m.text)).then((ok) => post({ desk: "copied", ok: !!ok }), () => post({ desk: "copied", ok: false }));
      } else if (m.desk === "luofu") setSheet(m.which === "gallery" ? "gallery" : "pool");
      else if (m.desk === "dressing" && L.closet) setSheet(m.which === "closet" ? "closet" : m.which === "achv" ? "achv" : "mirror");
      else if (m.desk === "close") L.onClose();
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("resize", setup);
    window.addEventListener("kfs-kb", setup);
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("resize", setup);
      window.removeEventListener("kfs-kb", setup);
    };
  }, []);

  // 网页底色这会儿换成跟那一页一样的（同秘戏钱匣：底下空一条的手机，系统画的那条取网页底色）；藏起来（翻到信匣）的时候换回来
  useEffect(() => {
    if (hidden) return;
    const r = document.documentElement,
      b = document.body;
    const was = [r.style.backgroundColor, b.style.backgroundColor];
    r.style.backgroundColor = b.style.backgroundColor = BG;
    return () => {
      r.style.backgroundColor = was[0];
      b.style.backgroundColor = was[1];
    };
  }, [hidden]);

  // 信、卡片、繁体变了：递一份新的（那一页自己看纸上摆的变没变，没变不重摆）
  useEffect(() => {
    if (state === "live" || state === "loading" || state === "slow") data();
  }, [rounds, cards, trad]);
  useEffect(() => {
    hold();
  }, [hidden, sheet]);

  // 信匣翻开着：摆什么、图、语音和画眼下的样子，变了就递（那一页自己看摆的变没变，没变不重摆）
  useEffect(() => {
    if (boxOn) post({ desk: "box", rows: boxView });
  }, [boxOn, boxView]);
  useEffect(() => {
    sentPics.current = {};
    sentSounds.current = {};
    sentStates.current = "";
  }, [gen]);
  // 他念好的语音：声音递进去，在那一页里放（iPhone 上只认手指点下去那一下出声，点在框里，开封府这头放不出来）
  useEffect(() => {
    if (!boxOn || !kit.sound) return;
    const delta = {};
    let n = 0;
    for (const e of boxRows) {
      if (e.t !== "voice" || !e.key || sentSounds.current[e.key]) continue;
      const v = kit.voices && kit.voices[e.key];
      if (!v || v.s !== "ready") continue;
      const src = kit.sound(e.key);
      if (!src) continue;
      delta[e.key] = src;
      sentSounds.current[e.key] = true;
      n++;
    }
    if (n) post({ desk: "sounds", sounds: delta });
  }, [boxOn, boxRows, kit.voices, gen]);
  useEffect(() => {
    if (!boxOn) return;
    const want = {};
    for (const e of boxRows) {
      if (e.t === "meme" && kit.meme) want["m:" + e.file] = kit.meme(e.file);
      else if ((e.t === "photo" || e.t === "draw") && kit.imgs && typeof kit.imgs[e.img] === "string") want["i:" + e.img] = kit.imgs[e.img];
    }
    const delta = {};
    let n = 0;
    for (const k of Object.keys(want))
      if (want[k] && sentPics.current[k] !== want[k]) {
        delta[k] = want[k];
        sentPics.current[k] = want[k];
        n++;
      }
    if (n) post({ desk: "pics", pics: delta });
  }, [boxOn, boxRows, kit.imgs, gen]);
  useEffect(() => {
    if (!boxOn) return;
    const st = {};
    for (const e of boxRows) {
      if (e.t === "voice" && e.key) {
        const v = kit.voices && kit.voices[e.key];
        st[e.key] = v ? { s: v.s, dur: v.dur || 0, ...(v.long ? { long: true, why: v.why || "" } : {}) } : { s: "load" };
      } else if (e.t === "draw") {
        const d = kit.draws && kit.draws[e.key];
        st[e.key] = { s: d ? d.s : "load" };
      }
    }
    const sg = JSON.stringify([st, kit.playing || ""]);
    if (sg === sentStates.current) return;
    sentStates.current = sg;
    post({ desk: "states", st, playing: kit.playing || "" });
  }, [boxOn, boxRows, kit.voices, kit.draws, kit.playing, gen]);
  // 翻开了信匣：照片、文档从存档里取，语音、画看一眼；转繁体的那一包没取过的取来
  useEffect(() => {
    if (!boxOn) return;
    if (kit.need) kit.need();
    if (!conv.current)
      loadS2T().then(
        (m) => {
          conv.current = conv.current || m.toTrad;
          setConvOk(true);
        },
        () => {}
      );
    else setConvOk(true);
  }, [boxOn, msgs]);
  // 点开的那一份文档全文刚取到：再递一回
  useEffect(() => {
    if (boxOn && waitDoc.current) showDoc(waitDoc.current);
  }, [kit.docs]);

  // 繁体：纸上还没转过的那几轮，取了转字的那一包（同藏音匣，一兆上下）现转、记着；不在纸上的那几轮不留
  useEffect(() => {
    let gone = false;
    const live = rounds.filter((r) => !r.read && r.text);
    const todo = live.filter((r) => !(trad[r.id] && trad[r.id].s === sig(r.text)));
    const keep = new Set(live.map((r) => r.id));
    const stale = Object.keys(trad).some((id) => !keep.has(id));
    if (!todo.length) {
      if (stale) {
        const next = {};
        for (const id of keep) if (trad[id]) next[id] = trad[id];
        writeTrad(next);
        setTrad(next);
      }
      return;
    }
    (conv.current ? Promise.resolve(conv.current) : loadS2T().then((m) => (conv.current = m.toTrad))).then(
      (f) => {
        if (gone) return;
        const next = {};
        for (const id of keep) if (trad[id]) next[id] = trad[id];
        for (const r of todo) {
          try {
            next[r.id] = { s: sig(r.text), t: f(r.text) };
          } catch (e) {}
        }
        writeTrad(next);
        setTrad(next);
      },
      () => {}
    );
    return () => {
      gone = true;
    };
  }, [rounds]);

  // 这一个框二十秒还没画出来：问一声那一页还在不在。不在（开封府在手机上放久了，那一页的名字早换了、旧的删了）说取不到；在就是网慢
  useEffect(() => {
    let gone = false;
    const t = setTimeout(() => {
      fetch(DESK_URL, { method: "HEAD", cache: "no-store" })
        .then((r) => r.status)
        .catch(() => 0)
        .then((code) => {
          if (gone) return;
          if (code === 404 && latest.current.onFail) latest.current.onFail(true);
          setState((s) => (s === "loading" ? (code === 404 ? "gone" : "slow") : s));
        });
    }, WAIT_MS);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [gen]);

  const dead = state === "fail" || state === "net" || state === "gone";
  return (
    <div
      className="kfs-desk kfs-fade absolute inset-0"
      aria-hidden={hidden ? "true" : undefined}
      style={{ zIndex: 60, background: BG, visibility: hidden ? "hidden" : "visible", pointerEvents: hidden ? "none" : "auto" }}
    >
      {!dead && (
        <iframe
          key={gen}
          ref={frame}
          src={DESK_URL}
          name={token.current}
          sandbox="allow-scripts"
          allow="clipboard-write"
          title="狐宇宙"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0, display: "block", background: BG }}
        />
      )}
      {NOTE[state] && (
        <div
          className="kfs-desk-note absolute inset-x-0 text-center"
          style={{ top: "42%", padding: "0 36px", color: "#efe6d6", fontFamily: KAI, fontSize: 15, letterSpacing: "0.08em", lineHeight: 1.85 }}
        >
          <p style={{ margin: 0, pointerEvents: "none" }}>{NOTE[state]}</p>
          {dead && (
            <button
              onClick={() => latest.current.onBox(true)}
              className="kfs-desk-box kfs-tap"
              style={{ marginTop: 18, padding: "8px 22px", border: "1px solid rgba(239,230,214,0.38)", borderRadius: 999, color: "#efe6d6", fontFamily: KAI, fontSize: 15, letterSpacing: "0.2em" }}
            >
              去信匣
            </button>
          )}
          {/* 画不出来的这台手机上，锦盒里的梦库、梦廊、铜镜那三页也够不着了（南衙里那一行拿掉了）：这里留几个口子 */}
          {dead && (luofu || closet) && (
            <div className="flex justify-center flex-wrap" style={{ gap: "10px 26px", marginTop: 16, maxWidth: 300 }}>
              {[
                ...(luofu
                  ? [
                      ["pool", "梦库"],
                      ["gallery", "梦廊"],
                    ]
                  : []),
                ...(closet
                  ? [
                      ["mirror", "照镜子"],
                      ["closet", "衣柜"],
                      ["achv", "成就"],
                    ]
                  : []),
              ].map(([k, name]) => (
                <button
                  key={k}
                  onClick={() => setSheet(k)}
                  className={`${k === "pool" || k === "gallery" ? "kfs-desk-lf-" : "kfs-desk-dr-"}${k} kfs-tap`}
                  style={{ padding: "4px 2px", borderBottom: "1px solid rgba(239,230,214,0.38)", color: "#efe6d6", fontFamily: KAI, fontSize: 14, letterSpacing: "0.16em" }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {state !== "live" && (
        <button onClick={onClose} aria-label="关闭" className="kfs-desk-close kfs-tap" style={ROUND}>
          <Icon name="x" size={18} />
        </button>
      )}
      {sheet === "pool" && luofu && (
        <LuofuPoolSheet look="room" pool={luofu.pool} taken={luofu.state.seen.concat(luofu.state.gallery.map((e) => e.id))} onPool={luofu.onPool} onClose={() => setSheet(null)} />
      )}
      {sheet === "gallery" && luofu && <LuofuGallery look="room" state={luofu.state} now={now} onClose={() => setSheet(null)} />}
      {sheet === "mirror" && closet && <DressingMirror state={dressing} today={today} closet={closet.rec} onClose={() => setSheet(null)} />}
      {sheet === "closet" && closet && <DressingCloset state={dressing} closet={closet.rec} onCloset={closet.onCloset} onClose={() => setSheet(null)} />}
      {sheet === "achv" && closet && <DressingAchievements state={dressing} closet={closet.rec} onClose={() => setSheet(null)} />}
    </div>
  );
}
