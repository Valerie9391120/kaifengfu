# 通话（卿卿 10 月 14 日要的，见开发说明“通话”那一节）的端到端测试：
# 真的浏览器、假 Supabase 里跑真的 voice 函数（它去敲的 ElevenLabs 是假的，念出来是没声音的 mp3，一个字四分之一秒）、假的 Anthropic。
# 手机自带的听写装不出来：换成一个能遥控的假听写（__srSay 对着它说一句；它被叫收尾以后自己报结束）。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：python3 tests/e2e_call.py
import json, re, time, urllib.parse
from playwright.sync_api import sync_playwright
from mailkit import *

FAKE_SR = r"""(() => {
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
})()"""

PHASE = "(() => { const e = document.querySelector('.kfs-call'); return e ? e.dataset.phase : null; })()"
# 字幕（她 11:40 定的两个人共用的那一块）：眼下这一轮的字、是谁的、什么颜色、有没有正淡出去的上一轮
SUBS = "(() => { const e = document.querySelector('.kfs-sub-turn:not(.kfs-sub-out)'); return e ? e.textContent : ''; })()"
WHO = "(() => { const e = document.querySelector('.kfs-sub-turn:not(.kfs-sub-out)'); return e ? e.dataset.who : ''; })()"
SUBCOLOR = "(() => { const e = document.querySelector('.kfs-sub-turn:not(.kfs-sub-out) .kfs-sub-text'); return e ? getComputedStyle(e).color : ''; })()"
FADING = "[...document.querySelectorAll('.kfs-sub-out')].map((e) => e.dataset.who)"
# 字幕每变一回记一笔：[眼下这一轮的字, 是谁的, 正淡出去的是谁的]（变得快，隔一会儿看一眼会漏掉）
SUBLOG = """(() => { window.__subLog = []; const root = document.querySelector('.kfs-call');
  const mo = new MutationObserver(() => {
    const cur = document.querySelector('.kfs-sub-turn:not(.kfs-sub-out)');
    const e = [cur ? cur.textContent : '', cur ? cur.dataset.who : '', [...document.querySelectorAll('.kfs-sub-out')].map((x) => x.dataset.who).join(',')];
    const last = window.__subLog[window.__subLog.length - 1];
    if (!last || last.join('|') !== e.join('|')) window.__subLog.push(e);
  });
  mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] }); return true; })()"""
NOTE = "(() => { const e = document.querySelector('.kfs-call-note'); return e ? e.textContent : ''; })()"
KEY = "(() => { const b = [...document.querySelectorAll('.kfs-composer button')].pop(); return b ? b.getAttribute('aria-label') : null; })()"
MARKS = "[...document.querySelectorAll('.kfs-call-mark')].map((e) => e.textContent.trim())"
errors = []

def phase(page): return page.evaluate(PHASE)
def wait_phase(page, want, timeout=15000):
    return wait_js(page, PHASE + " === " + json.dumps(want), timeout)
def eleven(): return mock("/__debug/eleven")["log"]
def queue_reply(text): mock("/__debug/reply-queue?text=" + urllib.parse.quote(text))
def sys_text(body):
    s = body["system"]
    return s[0]["text"] if isinstance(s, list) else s
def last_user_texts(body):
    last = [m for m in body["messages"] if m["role"] == "user"][-1]
    return [b["text"] for b in last["content"] if b.get("type") == "text"]
def set_pause(page, ms):
    page.evaluate("""(ms) => new Promise((res) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => {
        const tx = o.result.transaction('kv', 'readwrite'); const st = tx.objectStore('kv'); const g = st.get('kfs2:settings');
        g.onsuccess = () => { const cur = g.result && !g.result.del ? JSON.parse(g.result.v) : {}; cur.callPause = ms; st.put({ ...(g.result || {}), v: JSON.stringify(cur) }, 'kfs2:settings'); };
        tx.oncomplete = () => res(true); }; })""", ms)
def phone(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    ctx.add_init_script(FAKE_SR)
    return ctx
def page_of(ctx, tag):
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(tag + ": " + str(e)))
    return page
def dial(page):
    page.locator(".kfs-composer button[aria-label='打电话']").click()
    return wait_phase(page, "listening", 5000)
def say_in_call(page, text):
    ok_ = page.evaluate("(t) => window.__srSay(t)", text)
    return ok_

with sync_playwright() as p:
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    A = phone(browser)
    pa = page_of(A, "call")
    try:
        first_time(pa)
        chat(pa, "先打个字")
        before = mock("/__debug/claude")[-1]["body"]
        ok(pa.evaluate(KEY) == "打电话", "输入框空着、他没在回：右下角那个声波键是“打电话”（原来是“发一条语音”）")

        # ================= 一通电话 =================
        c0 = len(calls())
        e0 = len(eleven())
        got = dial(pa)
        ok(got and pa.evaluate("window.__srOpen()") and pa.evaluate("window.__wake.asked") == 1 and pa.evaluate(MARKS) == ["通话开始"],
           "点声波键：通话页出来、开始听（开了听写）；要了屏幕常亮；聊天里记一行“通话开始”")
        ok(pa.evaluate("document.querySelector('.kfs-call').textContent").startswith("在听你说") and pa.locator(".kfs-call button[aria-label='挂断']").count() == 1 and pa.locator(".kfs-call button[aria-label='静音']").count() == 1,
           "通话页：上面写“在听你说”和时长，底下静音、挂断两个键")
        queue_reply("*抱住你* 嗯。我今天也在想你，想了一整天，想着你在干嘛。\n[SPLIT]\n[MEME:pig_gaodiaoluguo.jpg]\n[SPLIT]\n[whispers] 晚安😊")
        mock("/__debug/claude-hold?ms=2500")   # 他想两秒半：看得到“他在想”的时候字幕上是什么
        pa.evaluate(SUBLOG)
        # 字放大到一行五六个字：他这三段就装不下字幕区了，看它往上滚（真的字号要一百多字才满）
        pa.evaluate("(() => { const st = document.createElement('style'); st.id = 'kfs-test-big'; st.textContent = '.kfs-sub-text { font-size: 60px !important; }'; document.head.appendChild(st); })()")
        say_in_call(pa, "喂")
        time.sleep(0.5)
        heard = (pa.evaluate(SUBS), pa.evaluate(WHO), pa.evaluate(SUBCOLOR))
        say_in_call(pa, "喂，你在吗")
        t0 = time.time()
        held = wait_mock(lambda: mock("/__debug/claude-held")["held"], 8)   # 那一问到了假 Anthropic（压着没答）
        took = time.time() - t0
        ok(heard == ("喂", "her", "rgb(153, 153, 153)") and held and 1.3 <= took <= 3.5, f"字幕是她的（浅灰）、边说边出；停 1.6 秒左右就当说完了、马上发出去，不等那两秒（{heard}，{took:.1f} 秒）")
        ok(phase(pa) == "thinking" and pa.evaluate(SUBS) == "喂，你在吗" and pa.evaluate(WHO) == "her", f"他在想的时候：她那句还摆在字幕上（{phase(pa)}、{pa.evaluate(SUBS)}）")
        sent = wait_mock(lambda: len(calls()) == c0 + 1, 10)
        body = calls()[-1]["body"]
        texts = last_user_texts(body)
        now_note = [t for t in texts if t.startswith("【此刻】")]
        ok("[开封府提示：你们开始打电话了]" in texts and "喂，你在吗" in texts and now_note and now_note[0].endswith("不用写 [VOICE]。语气标签照用。") and "【通话】你们正在打电话" in now_note[0],
           "寄过去的：“开始打电话了”那行提示、她说的话；【此刻】后面附着【通话】那一段")
        ok(sys_text(body) == sys_text(before), "打电话的时候名帖一个字不动（和打电话之前寄的一样，缓存接得上）")
        spoke = wait_phase(pa, "speaking", 15000)
        color = pa.evaluate(SUBCOLOR)
        done = wait_phase(pa, "listening", 30000)
        log = pa.evaluate("window.__subLog")
        his = []
        for t, who, _ in log:
            if who == "him" and t not in his:
                his.append(t)
        ok(["嗯。", "him", "her"] in log and color == "rgb(240, 240, 240)",
           f"他开口了：她的字幕淡出去，他的从头出（暖白）（{[e for e in log if e[1] == 'him'][:2]}）")
        ok(his == ["嗯。", "嗯。我今天也在想你，想了一整天，想着你在干嘛。", "嗯。我今天也在想你，想了一整天，想着你在干嘛。晚安"],
           f"念到哪段出哪段：一段一段接上去（{his}）")
        said = [x["text"] for x in eleven()[e0:]]
        ok(spoke and done and said == ["嗯。", "我今天也在想你，想了一整天，想着你在干嘛。", "[whispers] 晚安"],
           f"他的回话一句一句念：动作、表情不念，表情包不念，头一段短（{said}）")
        ok(pa.evaluate(SUBS) == "嗯。我今天也在想你，想了一整天，想着你在干嘛。晚安" and pa.evaluate(WHO) == "him",
           f"念完了：他这一轮三段都在字幕上，接在一起、语气标签和动作都不摆；接着听她说的时候还留着（{pa.evaluate(SUBS)}）")
        fades = pa.evaluate("[...document.querySelectorAll('.kfs-sub-turn:not(.kfs-sub-out) .kfs-sub-unit')].map((e) => getComputedStyle(e).opacity)")
        ok(fades == ["0.38", "0.62", "1"], f"最新的那截照常亮，前一截淡一点，再往前更淡（{fades}）")
        sc = pa.evaluate("""(() => { const e = document.querySelector('.kfs-sub-turn:not(.kfs-sub-out)'); const units = e.querySelectorAll('.kfs-sub-unit');
          const last = units[units.length - 1].getBoundingClientRect(); const box = e.getBoundingClientRect(); const cs = getComputedStyle(e);
          return { top: Math.round(e.scrollTop), max: e.scrollHeight - e.clientHeight, h: Math.round(box.height), mask: cs.webkitMaskImage || cs.maskImage || '', seen: last.bottom <= box.bottom + 1 && last.bottom > box.top }; })()""")
        ok(sc["max"] > 0 and abs(sc["top"] - sc["max"]) <= 2 and "gradient" in sc["mask"] and sc["seen"] and 200 <= sc["h"] <= 240,
           f"字幕满了：往上滚到最底下，刚念的那截看得见，顶上那截慢慢淡没；字幕区 225 高上下（{sc}）")
        pa.evaluate("document.getElementById('kfs-test-big').remove()")
        ok(pa.evaluate("window.__srOpen()"), "念完了：接着听她说（又开了听写）")
        cid, msgs = chat_of(pa)
        her = [m for m in msgs if m.get("role") == "her"]
        ok(her[-1].get("text") == "喂，你在吗" and her[-1].get("via") == "call" and msgs[-1]["role"] == "him",
           "聊天里：她说的是一条平常的字（记着是电话里说的），他的回话照常在后面")

        # 第二句：他的回话里有语音条的写法，开着“他能发语音”也只念一回
        e1 = len(eleven())
        queue_reply("[VOICE]\n[softly] 我一直在。")
        say_in_call(pa, "嗯嗯")
        time.sleep(0.12)
        swap = (pa.evaluate(SUBS), pa.evaluate(WHO), pa.evaluate(FADING))
        ok(swap == ("嗯嗯", "her", ["him"]), f"她又开口了：他的字幕淡出去，她的从头出（{swap}）")
        wait_mock(lambda: len(calls()) == c0 + 2, 8)
        wait_phase(pa, "speaking", 15000)
        wait_phase(pa, "listening", 20000)
        time.sleep(1.0)
        said2 = [x["text"] for x in eleven()[e1:]]
        ok(said2 == ["[softly] 我一直在。"], f"他还是写了 [VOICE]：通话这头念一回，聊天里的语音条不再念一遍（{said2}）")

        # 他只回了个表情包（没出声）：她接着说的，接在她这一轮后面
        say_in_call(pa, "你看这个")
        queue_reply("[MEME:pig_gaodiaoluguo.jpg]")
        wait_mock(lambda: len(calls()) == c0 + 3, 8)
        wait_phase(pa, "thinking", 3000)
        back = wait_phase(pa, "listening", 15000)
        time.sleep(0.5)
        say_in_call(pa, "好看吧")
        time.sleep(0.3)
        joined = (pa.evaluate(SUBS), pa.evaluate(WHO))
        ok(back and joined == ("你看这个 好看吧", "her"), f"他没出声（只回了表情包）：她接着说的接在她这一轮后面，不清空（{joined}）")
        queue_reply("嗯，好看。")
        wait_mock(lambda: len(calls()) == c0 + 4, 8)
        wait_phase(pa, "speaking", 15000)
        wait_phase(pa, "listening", 20000)
        time.sleep(0.5)

        # 静音：不听；取消静音：接着听
        pa.locator(".kfs-call button[aria-label='静音']").click()
        time.sleep(0.3)
        muted = (phase(pa), pa.evaluate("window.__srOpen()"), pa.locator(".kfs-call button[aria-label='取消静音']").count())
        pa.locator(".kfs-call button[aria-label='取消静音']").click()
        time.sleep(0.3)
        ok(muted == ("muted", False, 1) and phase(pa) == "listening" and pa.evaluate("window.__srOpen()"), f"静音：不听她说（听写关了），写“静音中”；取消静音：接着听（{muted}）")

        # 挂断
        time.sleep(1.2)
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.8)
        cid, msgs = chat_of(pa)
        marks = pa.evaluate(MARKS)
        ok(phase(pa) is None and not pa.evaluate("window.__srOpen()") and pa.evaluate("window.__wake.released") == 1 and msgs[-1].get("kind") == "call" and msgs[-1].get("phase") == "end" and msgs[-1].get("secs", 0) >= 5
           and len(marks) == 2 and marks[0] == "通话开始" and re.match(r"^通话 \d+ (秒|分钟)$", marks[1]),
           f"挂断：通话页收了、不听了、屏幕常亮放了；聊天里记一行“通话 N 秒”（{marks}）")
        ok(pa.evaluate(KEY) == "打电话", "挂了以后那个键还是“打电话”")
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
        dial(pa)
        time.sleep(0.5)
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.8)
        cid, msgs = chat_of(pa)
        ok(len(msgs) == n_before and not any(m.get("kind") == "call" and m.get("phase") == "start" and m is msgs[-1] for m in msgs) and pa.evaluate(MARKS)[-1:] != ["通话开始"],
           "一句话没说就挂了：“通话开始”那行也拿掉，聊天里什么都不留")

        # ================= 锁屏、切走：挂断 =================
        dial(pa)
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
        ok(still == "listening" and gone and msgs[-1].get("kind") == "call" and msgs[-1].get("phase") == "end", f"锁屏、切走：藏了一秒多就挂（一眨眼的不算）；聊天里照样记上打了多久（{still}）")

        # ================= 这一句没送到：说一声，接着听 =================
        dial(pa)
        mock("/__debug/claude-fail?kind=broken")
        say_in_call(pa, "这句送不到")
        noted = wait_js(pa, NOTE + ".includes('没送到')", 25000)
        ok(noted and phase(pa) == "listening", f"这一句没送到：通话页上说一声，接着听（{pa.evaluate(NOTE)}）")
        mock("/__debug/claude-fail")
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.6)

        # ================= iPhone 不让自己接着听：点一下屏幕 =================
        pa.evaluate("window.__srDeny = true")
        pa.locator(".kfs-composer button[aria-label='打电话']").click()
        tapped = wait_phase(pa, "tap", 5000)
        note = pa.evaluate(NOTE)
        status = pa.evaluate("document.querySelector('.kfs-call-status').textContent")
        pa.evaluate("window.__srDeny = false")
        pa.locator(".kfs-call").click(position={"x": 200, "y": 300})
        ok(tapped and status.startswith("点一下屏幕，接着说") and "麦克风" in note and "点一下屏幕" not in note and wait_phase(pa, "listening", 3000) and pa.evaluate("window.__srOpen()"),
           f"听写不肯开：最上面写“点一下屏幕，接着说”，底下一句看看麦克风（不再说一遍点屏幕）；她点一下，接着听（{status}／{note}）")
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.6)

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
raise SystemExit(1 if count["failed"] else 0)
