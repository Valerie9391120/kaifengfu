# 通话（卿卿 10 月 14 日要的，见开发说明“通话”那一节）的端到端测试：
# 真的浏览器、假 Supabase 里跑真的 voice 函数（它去敲的 ElevenLabs 是假的，念出来是没声音的 mp3，一个字四分之一秒）、假的 Anthropic。
# 听她说话（14:26 她定的）：ElevenLabs 的实时听写。浏览器的麦克风是假的（Chromium 自带的假麦克风，喂一段没声音的 wav），
# 实时听写那头是假 Supabase 里的假 Scribe（tests/stt-harness.mjs）：测试叫 /__debug/stt-say 让它回一句“听到一半的字”。
# 退回去的那条路（函数还是旧的、key 没开 Speech to Text）：手机自带的听写装不出来，换成一个能遥控的假听写（__srSay）。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：python3 tests/e2e_call.py
import json, os, re, struct, time, urllib.parse, wave
from playwright.sync_api import sync_playwright
from mailkit import *

FAKE = r"""(() => {
  window.__srs = [];
  class FakeSR {
    constructor() { this.started = false; this.stopped = false; this.aborted = false; window.__srs.push(this); }
    start() { if (window.__srDeny) { setTimeout(() => this.onerror && this.onerror({ error: 'not-allowed' }), 0); return; } this.started = true; }
    stop() { this.stopped = true; setTimeout(() => this.onend && this.onend(), 60); }
    abort() { this.aborted = true; }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
  const live = () => { const r = window.__srs[window.__srs.length - 1]; return r && r.started && !r.stopped && !r.aborted ? r : null; };
  window.__srOpen = () => !!live();
  window.__srSay = (text) => { const r = live(); if (!r || !r.onresult) return false; r.onresult({ results: [[{ transcript: text }]] }); return true; };
  window.__srCount = () => window.__srs.length;
  // 放声音的：记下放过哪几段（地址）、放了几回
  window.__plays = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__plays.push(this.src); return play.apply(this, arguments); };
  // 屏幕常亮：记下要过没有、放了没有
  window.__wake = { asked: 0, released: 0 };
  try {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wake.asked += 1; return { release: async () => { window.__wake.released += 1; } }; } } });
  } catch (e) {}
  // 麦克风：记下开过的几回，看挂了以后关没关
  window.__mics = [];
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => { const s = await gum(c); window.__mics.push(s); return s; };
  }
  window.__micLive = () => window.__mics.filter((s) => s.getTracks().some((t) => t.readyState === 'live')).length;
})()"""

PHASE = "(() => { const e = document.querySelector('.kfs-call'); return e ? e.dataset.phase : null; })()"
# 字幕（两个人共用的那一块）：最后一段的字、是谁的、什么颜色
SUBS = "(() => { const e = document.querySelector('.kfs-sub-turn:last-child'); return e ? e.textContent : ''; })()"
WHO = "(() => { const e = document.querySelector('.kfs-sub-turn:last-child'); return e ? e.dataset.who : ''; })()"
SUBCOLOR = "(() => { const e = document.querySelector('.kfs-sub-turn:last-child'); return e ? getComputedStyle(e).color : ''; })()"
# 字幕里一段一段：[[是谁的, 字], ...]（最后一段是眼下在说的）
TURNS = "[...document.querySelectorAll('.kfs-sub-turn')].map((e) => [e.dataset.who, e.textContent])"
# 字幕每变一回记一笔（变得快，隔一会儿看一眼会漏掉）
SUBLOG = """(() => { window.__subLog = []; const root = document.querySelector('.kfs-call');
  const mo = new MutationObserver(() => {
    const e = [...document.querySelectorAll('.kfs-sub-turn')].map((x) => [x.dataset.who, x.textContent]);
    const last = window.__subLog[window.__subLog.length - 1];
    if (!last || JSON.stringify(last) !== JSON.stringify(e)) window.__subLog.push(e);
  });
  mo.observe(root, { subtree: true, childList: true, characterData: true }); return true; })()"""
NOTE = "(() => { const e = document.querySelector('.kfs-call-note'); return e ? e.textContent : ''; })()"
KEY = "(() => { const b = [...document.querySelectorAll('.kfs-composer button')].pop(); return b ? b.getAttribute('aria-label') : null; })()"
MARKS = "[...document.querySelectorAll('.kfs-call-mark')].map((e) => e.textContent.trim())"
HELLOS = ["卿卿？", "怎么了？", "你来了"]
errors = []
mode = {"ears": "stt"}  # stt：ElevenLabs 的实时听写；sr：退回手机自带的听写

def phase(page): return page.evaluate(PHASE)
def wait_phase(page, want, timeout=15000):
    return wait_js(page, PHASE + " === " + json.dumps(want), timeout)
def eleven(): return mock("/__debug/eleven")["log"]
# 只看念的那几回（要听写通行证的那几回不算）
def spoken(since): return [x["text"] for x in eleven()[since:] if x["path"].startswith("/v1/text-to")]
def queue_reply(text): mock("/__debug/reply-queue?text=" + urllib.parse.quote(text))
def sys_text(body):
    s = body["system"]
    return s[0]["text"] if isinstance(s, list) else s
def last_user_texts(body):
    last = [m for m in body["messages"] if m["role"] == "user"][-1]
    return [b["text"] for b in last["content"] if b.get("type") == "text"]
def stt(): return mock("/__debug/stt")["conns"]
def stt_open():
    c = stt()
    return bool(c) and not c[-1]["closed"]
def ears_open(page):
    return stt_open() if mode["ears"] == "stt" else page.evaluate("window.__srOpen()")
def ears_count(page):
    return len(stt()) if mode["ears"] == "stt" else page.evaluate("window.__srCount()")
def say_in_call(page, text):
    if mode["ears"] == "stt":
        wait_mock(stt_open, 6)
        return mock("/__debug/stt-say?text=" + urllib.parse.quote(text))["ok"]
    return page.evaluate("(t) => window.__srSay(t)", text)
def phone(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.grant_permissions(["microphone"])
    ctx.add_init_script(STUB)
    ctx.add_init_script(FAKE)
    return ctx
def page_of(ctx, tag):
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(tag + ": " + str(e)))
    return page
def hello_of(page):
    cid, msgs = chat_of(page)
    starts = [m for m in msgs if m.get("kind") == "call" and m.get("phase") == "start"]
    return starts[-1].get("hi") if starts else None
def dial(page):
    page.locator(".kfs-composer button[aria-label='打电话']").click()
    return wait_phase(page, "listening", 15000)

# 假麦克风喂的：二十秒没声音的 wav（Chromium 读完了从头再放）
SILENCE = os.path.join(HERE, "..", ".cache", "silence-16k.wav")
os.makedirs(os.path.dirname(SILENCE), exist_ok=True)
with wave.open(SILENCE, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    w.writeframes(struct.pack("<h", 0) * 16000 * 20)

with sync_playwright() as p:
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + SILENCE]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    A = phone(browser)
    pa = page_of(A, "call")
    hellos_said = []   # 念过的那几句接起来的话（念过的再挑到就用存着的，不再敲 ElevenLabs）
    def check_hello(tag, e_before):
        hi = hello_of(pa)
        asked = [x["text"] for x in eleven()[e_before:] if x["text"] == hi]
        fresh = hi not in hellos_said
        hellos_said.append(hi)
        ok(hi in HELLOS and len(asked) == (1 if fresh else 0), f"{tag}：接起来他先说一句（{hi}）；{'头一回念，念好存起来' if fresh else '念过的，用存着的，不再敲 ElevenLabs'}")
        return hi
    try:
        first_time(pa)
        chat(pa, "先打个字")
        before = mock("/__debug/claude")[-1]["body"]
        ok(pa.evaluate(KEY) == "打电话", "输入框空着、他没在回：右下角那个声波键是“打电话”（原来是“发一条语音”）")

        # ================= 一通电话 =================
        c0 = len(calls())
        e_dial = len(eleven())
        pa.locator(".kfs-composer button[aria-label='打电话']").click()
        pa.locator(".kfs-call").wait_for(timeout=5000)
        pa.evaluate(SUBLOG)
        got = wait_phase(pa, "listening", 15000)
        log0 = pa.evaluate("window.__subLog")
        hi1 = check_hello("接通", e_dial)
        conns = stt()
        prm = conns[-1]["params"] if conns else {}
        ok(got and stt_open() and pa.evaluate("window.__micLive()") == 1 and pa.evaluate("window.__wake.asked") == 1 and pa.evaluate(MARKS) == ["通话开始"]
           and prm.get("model_id") == "scribe_v2_realtime" and prm.get("audio_format") == "pcm_16000" and prm.get("language_code") == "zh" and prm.get("commit_strategy") == "manual" and prm.get("token", "").startswith("sutkn_test_"),
           f"点声波键：通话页出来；开了麦克风、拿通行证连上 ElevenLabs 的实时听写（16k、中文、说完没有自己判）；要了屏幕常亮；聊天里记一行“通话开始”（{prm}）")
        ok([["him", hi1]] in log0 and pa.evaluate(TURNS)[:1] == [["him", hi1]], f"他接起来那一句在字幕上（{pa.evaluate(TURNS)[:1]}）")
        ok(pa.evaluate("document.querySelector('.kfs-call').textContent").startswith("在听你说") and pa.locator(".kfs-call button[aria-label='挂断']").count() == 1 and pa.locator(".kfs-call button[aria-label='静音']").count() == 1,
           "通话页：上面写“在听你说”和时长，底下静音、挂断两个键")
        time.sleep(0.6)
        ok(stt()[-1]["bytes"] > 0, f"麦克风的声音一路送过去了（{stt()[-1]['bytes']} 个字节）")
        e0 = len(eleven())
        queue_reply("*抱住你* 嗯。我今天也在想你，想了一整天，想着你在干嘛。\n[SPLIT]\n[MEME:pig_gaodiaoluguo.jpg]\n[SPLIT]\n[whispers] 晚安😊")
        mock("/__debug/claude-hold?ms=2500")   # 他想两秒半：看得到“他在想”的时候字幕上是什么
        pa.evaluate(SUBLOG)
        # 字放大到一行五六个字：他这三段就装不下字幕区了，看它往上滚（真的字号要一百多字才满）
        pa.evaluate("(() => { const st = document.createElement('style'); st.id = 'kfs-test-big'; st.textContent = '.kfs-sub-turn { font-size: 60px !important; }'; document.head.appendChild(st); })()")
        say_in_call(pa, "喂")
        time.sleep(0.5)
        heard = (pa.evaluate(SUBS), pa.evaluate(WHO), pa.evaluate(SUBCOLOR))
        say_in_call(pa, "喂，你在吗")
        t0 = time.time()
        held = wait_mock(lambda: mock("/__debug/claude-held")["held"], 8)   # 那一问到了假 Anthropic（压着没答）
        took = time.time() - t0
        ok(heard == ("喂", "her", "rgb(153, 153, 153)") and held and 1.3 <= took <= 3.8, f"字幕是她的（浅灰）、边说边出；停 1.6 秒左右就当说完了、马上发出去，不等那两秒（{heard}，{took:.1f} 秒）")
        conn = stt()[-1]
        ok(conn["commits"] == 1 and conn["closed"], f"说完了：送了一回 commit，这一条关了（{conn['commits']} 回）")
        ok(phase(pa) == "thinking" and pa.evaluate(SUBS) == "喂，你在吗" and pa.evaluate(WHO) == "her", f"他在想的时候：她那句还摆在字幕上（{phase(pa)}、{pa.evaluate(SUBS)}）")
        sent = wait_mock(lambda: len(calls()) == c0 + 1, 10)
        body = calls()[-1]["body"]
        texts = last_user_texts(body)
        now_note = [t for t in texts if t.startswith("【此刻】")]
        ok(f"[开封府提示：你们开始打电话了，你接起来先说了一句“{hi1}”]" in texts and "喂，你在吗" in texts and now_note and now_note[0].endswith("不用写 [VOICE]。语气标签照用。") and "【通话】你们正在打电话" in now_note[0],
           "寄过去的：“开始打电话了，你接起来先说了一句……”那行提示、她说的话；【此刻】后面附着【通话】那一段")
        ok(sys_text(body) == sys_text(before), "打电话的时候名帖一个字不动（和打电话之前寄的一样，缓存接得上）")
        spoke = wait_phase(pa, "speaking", 15000)
        color = pa.evaluate(SUBCOLOR)
        closed_while_talking = not stt_open()
        done = wait_phase(pa, "listening", 30000)
        log = pa.evaluate("window.__subLog")
        his = []
        for turns in log:
            if turns and turns[-1][0] == "him" and turns[-1][1] not in his:
                his.append(turns[-1][1])
        ok([["him", hi1], ["her", "喂，你在吗"], ["him", "嗯。"]] in log and color == "rgb(240, 240, 240)",
           f"他开口了：另起一行接在她的下面（暖白），她那句还在（{[e for e in log if e and e[-1][0] == 'him'][:1]}）")
        ok(closed_while_talking, "他在说的时候：听写那一条关着（不听，免得把他的声音当成她的）")
        ok(his == ["嗯。", "嗯。我今天也在想你，想了一整天，想着你在干嘛。", "嗯。我今天也在想你，想了一整天，想着你在干嘛。晚安"],
           f"念到哪段出哪段：一段一段接上去（{his}）")
        said = spoken(e0)
        plays = pa.evaluate("window.__plays.length")
        ok(plays <= 1, f"他的声音用 Web Audio 放，不经过 <audio>（<audio> 只在打电话那一下放过一回没声音的：{plays} 回）；iPhone 上 <audio> 放过一回，下一回开听写就听不见了（她 12:50 碰上的）")
        ok(spoke and done and said == ["嗯。", "我今天也在想你，想了一整天，想着你在干嘛。", "[whispers] 晚安"],
           f"他的回话一句一句念：动作、表情不念，表情包不念，头一段短（{said}）")
        ok(pa.evaluate(TURNS) == [["him", hi1], ["her", "喂，你在吗"], ["him", "嗯。我今天也在想你，想了一整天，想着你在干嘛。晚安"]],
           f"念完了：他三段都在他那一段里，接在一起、语气标签和动作都不摆；她那句在上面（{pa.evaluate(TURNS)}）")
        fades = pa.evaluate("[...document.querySelectorAll('.kfs-sub-unit')].map((e) => getComputedStyle(e).opacity)")
        ok(fades == ["0.38", "0.38", "0.38", "0.62", "1"], f"他这一段：最新的那截照常亮，前一截淡一点，再往前更淡；上面几段淡（{fades}）")
        centered = pa.evaluate("[...document.querySelectorAll('.kfs-sub-turn')].every((e) => getComputedStyle(e).textAlign === 'center')")
        ok(centered, "字幕居中（她 12:08 改的）")
        sc = pa.evaluate("""(() => { const e = document.querySelector('.kfs-sub-scroll'); const units = e.querySelectorAll('.kfs-sub-unit');
          const last = units[units.length - 1].getBoundingClientRect(); const box = e.getBoundingClientRect(); const cs = getComputedStyle(e);
          return { top: Math.round(e.scrollTop), max: e.scrollHeight - e.clientHeight, h: Math.round(box.height), mask: cs.webkitMaskImage || cs.maskImage || '', seen: last.bottom <= box.bottom + 1 && last.bottom > box.top }; })()""")
        ok(sc["max"] > 0 and abs(sc["top"] - sc["max"]) <= 2 and "gradient" in sc["mask"] and sc["seen"] and 200 <= sc["h"] <= 240,
           f"字幕满了：往上滚到最底下，刚念的那截看得见，顶上那截慢慢淡没；字幕区 225 高上下（{sc}）")
        pa.evaluate("document.getElementById('kfs-test-big').remove()")
        ok(wait_mock(stt_open, 5) and len(stt()) == 2, "念完了：接着听她说（又连了一条，用的是备着的通行证）")
        cid, msgs = chat_of(pa)
        her = [m for m in msgs if m.get("role") == "her"]
        ok(her[-1].get("text") == "喂，你在吗" and her[-1].get("via") == "call" and msgs[-1]["role"] == "him",
           "聊天里：她说的是一条平常的字（记着是电话里说的），他的回话照常在后面")

        # 第二句：他的回话里有语音条的写法，开着“他能发语音”也只念一回
        e1 = len(eleven())
        queue_reply("[VOICE]\n[softly] 我一直在。")
        say_in_call(pa, "嗯嗯")
        time.sleep(0.12)
        swap = pa.evaluate(TURNS)
        time.sleep(0.55)   # 淡下去有 0.45 秒的过渡：等它淡完再看
        dim = pa.evaluate("[...document.querySelectorAll('.kfs-sub-turn')].slice(-2).map((p) => [...p.querySelectorAll('.kfs-sub-unit')].map((e) => getComputedStyle(e).opacity))")
        ok(swap[-2:] == [["him", "嗯。我今天也在想你，想了一整天，想着你在干嘛。晚安"], ["her", "嗯嗯"]] and dim == [["0.38", "0.38", "0.38"], ["1"]],
           f"她又开口了：另起一行接在他的下面，他说的还在、都淡下去，她这句照常亮（{swap[-2:]}，{dim}）")
        wait_mock(lambda: len(calls()) == c0 + 2, 8)
        wait_phase(pa, "speaking", 15000)
        wait_phase(pa, "listening", 20000)
        time.sleep(1.0)
        said2 = spoken(e1)
        ok(said2 == ["[softly] 我一直在。"], f"他还是写了 [VOICE]：通话这头念一回，聊天里的语音条不再念一遍（{said2}）")

        # 他只回了个表情包（没出声）：她接着说的，接在她这一段后面
        say_in_call(pa, "你看这个")
        queue_reply("[MEME:pig_gaodiaoluguo.jpg]")
        wait_mock(lambda: len(calls()) == c0 + 3, 8)
        wait_phase(pa, "thinking", 3000)
        back = wait_phase(pa, "listening", 15000)
        time.sleep(0.5)
        say_in_call(pa, "好看吧")
        time.sleep(0.3)
        joined = (pa.evaluate(SUBS), pa.evaluate(WHO))
        ok(back and joined == ("你看这个 好看吧", "her"), f"他没出声（只回了表情包）：她接着说的接在她这一段后面，不另起一行（{joined}）")
        queue_reply("嗯，好看。")
        wait_mock(lambda: len(calls()) == c0 + 4, 8)
        wait_phase(pa, "speaking", 15000)
        wait_phase(pa, "listening", 20000)
        time.sleep(0.5)

        # 静音：不听；取消静音：接着听
        n_before = len(stt())
        pa.locator(".kfs-call button[aria-label='静音']").click()
        time.sleep(0.3)
        muted = (phase(pa), stt_open(), pa.locator(".kfs-call button[aria-label='取消静音']").count())
        pa.locator(".kfs-call button[aria-label='取消静音']").click()
        time.sleep(0.4)
        ok(muted == ("muted", False, 1) and phase(pa) == "listening" and wait_mock(stt_open, 5) and len(stt()) == n_before + 1, f"静音：不听她说（听写那一条关了），写“静音中”；取消静音：再连一条接着听（{muted}）")

        # 挂断
        time.sleep(1.2)
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.8)
        cid, msgs = chat_of(pa)
        marks = pa.evaluate(MARKS)
        ok(phase(pa) is None and not stt_open() and pa.evaluate("window.__micLive()") == 0 and pa.evaluate("window.__wake.released") == 1 and msgs[-1].get("kind") == "call" and msgs[-1].get("phase") == "end" and msgs[-1].get("secs", 0) >= 5
           and len(marks) == 2 and marks[0] == "通话开始" and re.match(r"^通话 \d+ (秒|分钟)$", marks[1]),
           f"挂断：通话页收了、听写那一条关了、麦克风关了、屏幕常亮放了；聊天里记一行“通话 N 秒”（{marks}）")
        ok(pa.evaluate(KEY) == "打电话", "挂了以后那个键还是“打电话”")
        bubbles = pa.evaluate("[...document.querySelectorAll(\"[data-kfs-bubble='him']\")].map((e) => e.textContent)")
        ok("晚安😊" in bubbles and not any("[whispers]" in b or "[softly]" in b for b in bubbles),
           f"挂了以后聊天里：电话里他那几条不摆语气标签（她 12:21 定的）（{bubbles[-5:]}）")
        stored = pa.evaluate(KV, "kfs2:callhi:" + hi1)
        ok(bool(stored) and json.loads(stored).get("audio"), "接起来那一句用他的声音念好了存着（跟着云端走），下回挑到直接放")
        # 挂了以后接着打字：寄给他的里有“电话挂了”那行
        c2 = len(calls())
        say(pa, "挂了")
        wait_mock(lambda: len(calls()) == c2 + 1, 10)
        wait_js(pa, "!(" + TYPING + ")", 20000); time.sleep(1.0)
        texts = [b["text"] for m in calls()[-1]["body"]["messages"] if m["role"] == "user" for b in m["content"] if b.get("type") == "text"]
        ok(any(t.startswith("[开封府提示：电话挂了，你们打了 ") for t in texts) and not any("【通话】" in t for t in texts), "挂了以后打字：寄给他的有“电话挂了，打了多久”那行，【通话】那一段不再附")
        index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
        ok(any(c.get("preview") for c in index), "历史对话照常")

        # ================= 一句没说就挂了：那两行都不留 =================
        n_before = len(chat_of(pa)[1])
        e_dial = len(eleven())
        dial(pa)
        check_hello("又打一回", e_dial)
        time.sleep(0.5)
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.8)
        cid, msgs = chat_of(pa)
        ok(len(msgs) == n_before and not any(m.get("kind") == "call" and m.get("phase") == "start" and m is msgs[-1] for m in msgs) and pa.evaluate(MARKS)[-1:] != ["通话开始"],
           "一句话没说就挂了：“通话开始”那行也拿掉，聊天里什么都不留")

        # ================= 锁屏、切走：挂断 =================
        e_dial = len(eleven())
        dial(pa)
        check_hello("再打一回", e_dial)
        queue_reply("嗯，我在。")
        say_in_call(pa, "我要锁屏了")
        wait_mock(lambda: len(calls()) >= 1 and "我要锁屏了" in json.dumps(calls()[-1]["body"], ensure_ascii=False), 8)
        wait_phase(pa, "listening", 20000)
        pa.evaluate("window.__away(true)")
        time.sleep(0.6)
        still = phase(pa)
        time.sleep(1.2)
        gone = phase(pa) is None
        pa.evaluate("window.__away(false)")
        time.sleep(0.5)
        cid, msgs = chat_of(pa)
        ok(still == "listening" and gone and msgs[-1].get("kind") == "call" and msgs[-1].get("phase") == "end" and pa.evaluate("window.__micLive()") == 0,
           f"锁屏、切走：藏了一秒多就挂（一眨眼的不算），麦克风关了；聊天里照样记上打了多久（{still}）")

        # ================= 这一句没送到：说一声，接着听 =================
        dial(pa)
        mock("/__debug/claude-fail?kind=broken")
        say_in_call(pa, "这句送不到")
        noted = wait_js(pa, NOTE + ".includes('没送到')", 25000)
        ok(noted and phase(pa) == "listening", f"这一句没送到：通话页上说一声，接着听（{pa.evaluate(NOTE)}）")
        mock("/__debug/claude-fail")
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.6)

        # ================= 听写那头断了：再连一回；又断了：点一下屏幕 =================
        dial(pa)
        time.sleep(0.5)
        n0 = len(stt())
        mock("/__debug/stt-fail?kind=close")
        again = wait_mock(lambda: len(stt()) == n0 + 1 and stt_open(), 6)
        mock("/__debug/stt-fail?kind=close")
        tapped = wait_phase(pa, "tap", 6000)
        note = pa.evaluate(NOTE)
        pa.locator(".kfs-call").click(position={"x": 200, "y": 300})
        ok(again and tapped and "断了" in note and wait_phase(pa, "listening", 5000) and wait_mock(stt_open, 5),
           f"听写那头断了：自己再连一回；又断了：写“点一下屏幕，接着说”（{note}），点一下再连")
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.6)

        # ================= 开了听写一个字都没来：八秒提醒一句；点一下屏幕重开 =================
        dial(pa)
        time.sleep(0.4)
        n0 = len(stt())
        time.sleep(8.4)
        hint = pa.evaluate(NOTE)
        pa.locator(".kfs-call").click(position={"x": 200, "y": 300})
        time.sleep(0.6)
        n1 = len(stt())
        ok(hint == "说了没出字的话，点一下屏幕" and n1 == n0 + 1 and stt_open() and pa.evaluate(NOTE) == "" and phase(pa) == "listening",
           f"在听、八秒一个字没来：底下提醒一句；她点一下屏幕，重开听写，那句收掉（{hint}；连了 {n0}→{n1} 条）")
        say_in_call(pa, "嗯")
        time.sleep(0.3)
        pa.locator(".kfs-call").click(position={"x": 200, "y": 300})
        time.sleep(0.4)
        ok(len(stt()) == n1 and pa.evaluate(SUBS) == "嗯", "已经听到字了再点屏幕：不重开，她说了一半的不丢")
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.6)

        # ================= 退回手机自带的听写：那把 key 没开 Speech to Text =================
        mock("/__debug/eleven-setup?stt=perm")
        mode["ears"] = "sr"
        n_stt = len(stt())
        srs0 = pa.evaluate("window.__srCount()")
        got = dial(pa)
        note = pa.evaluate(NOTE)
        ok(got and pa.evaluate("window.__srCount()") == srs0 + 1 and pa.evaluate("window.__srOpen()") and len(stt()) == n_stt and pa.evaluate("window.__micLive()") == 0 and "Speech to Text" in note and "手机自带的听写" in note,
           f"要不到听写的通行证（key 没开 Speech to Text）：退回手机自带的听写，电话照样打；底下说一句为什么（{note}）")
        queue_reply("嗯，听得见。")
        c3 = len(calls())
        say_in_call(pa, "这样听得见吗")
        wait_mock(lambda: len(calls()) == c3 + 1, 8)
        sp = wait_phase(pa, "speaking", 15000)
        bk = wait_phase(pa, "listening", 20000)
        ok(sp and bk and pa.evaluate("window.__srOpen()") and pa.evaluate(NOTE) == "", "退回去以后：说一句、他回、接着听，照常；她说了一句以后那行为什么就收了")
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.6)

        # ================= iPhone 不让自己接着听：点一下屏幕（手机自带的听写那条路） =================
        pa.evaluate("window.__srDeny = true")
        pa.locator(".kfs-composer button[aria-label='打电话']").click()
        tapped = wait_phase(pa, "tap", 15000)
        note = pa.evaluate(NOTE)
        status = pa.evaluate("document.querySelector('.kfs-call-status').textContent")
        pa.evaluate("window.__srDeny = false")
        pa.locator(".kfs-call").click(position={"x": 200, "y": 300})
        ok(tapped and status.startswith("点一下屏幕，接着说") and "麦克风" in note and "点一下屏幕" not in note and wait_phase(pa, "listening", 3000) and pa.evaluate("window.__srOpen()"),
           f"听写不肯开：最上面写“点一下屏幕，接着说”，底下一句看看麦克风（不再说一遍点屏幕）；她点一下，接着听（{status}／{note}）")
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.6)
        mock("/__debug/eleven-setup?stt=ok")
        mode["ears"] = "stt"

        # ================= API 面板：停多久算说完 =================
        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        sheet_ok = True
        try:
            pa.get_by_text("API", exact=True).click()
            pa.locator(".kfs-call-pause").wait_for(timeout=5000)
        except Exception:
            sheet_ok = False
        picked = False
        two = pa.locator(".kfs-call-pause button").filter(has_text=re.compile(r"^\s*2 秒\s*$"))
        if two.count() == 1:
            two.click(); time.sleep(0.4)
            picked = json.loads(pa.evaluate(KV, "kfs2:settings") or "{}").get("callPause") == 2000
        ok(sheet_ok and picked, "API 面板里能挑“停多久算你说完”，挑了记进设置")
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
if count["failed"]:
    raise SystemExit(1)
