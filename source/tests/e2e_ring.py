# 他打给她（卿卿 10 月 14 日 17:26、17:35 定的，见开发说明“他打给她”那一节）的端到端测试：
# 真的浏览器、假 Supabase 里跑真的 voice、push 函数（ElevenLabs、Anthropic、推送服务都是假的），假麦克风、假的实时听写（同 e2e_call.py）。
# 看：他回话里写了 [CALL] → 她在开封府里就弹出来电页面、先把他接起来要说的念好；接听：他先开口，接着听她说，挂了记打了多久；
#     挂断：记“未接来电”，她下一句寄过去的时候告诉他；她不在：横幅写 [来电]，一分钟以内回来照样响，响满一分钟没接记“未接来电”；
#     过了一分钟才回来：不响，直接记“未接来电”；关了“他能打电话”：不教他，他写了也不响。
# 页面里的钟用 Playwright 的假钟（照常走，要的时候一下子往前拨一分钟），“响满一分钟”不用真等。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：python3 tests/e2e_ring.py
import json, os, struct, time, urllib.parse, wave
from playwright.sync_api import sync_playwright
from mailkit import *

GRACE = 6.0   # 小后端把回话放进信箱以后，等这么多秒再敲手机（同 e2e_mail.py）
FAKE = r"""(() => {
  window.__plays = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__plays.push(this.src); return play.apply(this, arguments); };
  window.__wake = { asked: 0, released: 0 };
  try {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wake.asked += 1; return { release: async () => { window.__wake.released += 1; } }; } } });
  } catch (e) {}
  window.__mics = [];
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => { const s = await gum(c); window.__mics.push(s); return s; };
  }
  window.__micLive = () => window.__mics.filter((s) => s.getTracks().some((t) => t.readyState === 'live')).length;
})()"""
PHASE = "(() => { const e = document.querySelector('.kfs-call'); return e ? e.dataset.phase : null; })()"
RINGING = "!!document.querySelector('.kfs-ring')"
TURNS = "[...document.querySelectorAll('.kfs-sub-turn')].map((e) => [e.dataset.who, e.textContent])"
MARKS = "[...document.querySelectorAll('.kfs-call-mark')].map((e) => e.textContent.trim())"
errors = []

def phase(page): return page.evaluate(PHASE)
def wait_phase(page, want, timeout=15000):
    return wait_js(page, PHASE + " === " + json.dumps(want), timeout)
def eleven(): return mock("/__debug/eleven")["log"]
def spoken(since): return [x["text"] for x in eleven()[since:] if x["path"].startswith("/v1/text-to")]
def queue_reply(text): mock("/__debug/reply-queue?text=" + urllib.parse.quote(text))
def stt(): return mock("/__debug/stt")["conns"]
def stt_open():
    c = stt()
    return bool(c) and not c[-1]["closed"]
def say_in_call(text):
    wait_mock(stt_open, 6)
    return mock("/__debug/stt-say?text=" + urllib.parse.quote(text))["ok"]
def user_texts(body):
    return [b["text"] for m in body["messages"] if m["role"] == "user" for b in m["content"] if b.get("type") == "text"]
def his_texts(body):
    return [b["text"] for m in body["messages"] if m["role"] == "assistant" for b in m["content"] if b.get("type") == "text"]

SILENCE = os.path.join(HERE, "..", ".cache", "silence-16k.wav")
os.makedirs(os.path.dirname(SILENCE), exist_ok=True)
if not os.path.exists(SILENCE):
    with wave.open(SILENCE, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(struct.pack("<h", 0) * 16000 * 20)

with sync_playwright() as p:
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + SILENCE]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.grant_permissions(["microphone"])
    ctx.clock.install()   # 照常走；要“响满一分钟”的时候往前拨
    ctx.add_init_script(STUB)
    ctx.add_init_script(FAKE)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)
        enable_notifications(pa)
        chat(pa, "先打个字")
        sys0 = calls()[-1]["body"]["system"]
        sys_text = sys0[0]["text"] if isinstance(sys0, list) else sys0
        ok("单独一行写 [CALL]" in sys_text and "一分钟没接" in sys_text, "“他能打电话”默认开着：名帖后面的【回复格式】里教他怎么打电话")

        # ================= 她在开封府里：响、接听 =================
        e0 = len(eleven())
        c0 = len(calls())
        queue_reply("想你了\n[SPLIT]\n[CALL]\n[softly] 卿卿。在做什么。")
        plays0 = pa.evaluate("window.__plays.length")
        say(pa, "在吗")
        rang = wait_js(pa, RINGING, 20000)
        time.sleep(0.8)
        pre = spoken(e0)
        name = pa.evaluate("(() => { const e = document.querySelector('.kfs-ring-name'); return e ? e.textContent : ''; })()")
        ok(rang and name == "光义" and pa.locator(".kfs-ring button[aria-label='接听']").count() == 1 and pa.locator(".kfs-ring button[aria-label='挂断']").count() == 1,
           "他回话里写了 [CALL]：她在开封府里，弹出来电页面（他的名字、接听、挂断）")
        ok(pre == ["[softly] 卿卿。", "在做什么。"], f"响的时候就把他接起来要说的念好了（{pre}）")
        ok("光义来电" in pa.evaluate(MARKS) and pa.get_by_text("想你了").count() >= 1, "聊天里：他前面那句照常摆着，底下一行“光义来电”")
        tone = pa.evaluate("window.__plays.length") - plays0
        ok(tone == 0, f"响铃的时候没有铃声（原来那段她 22:58 让撤了），只有来电页面（放了 {tone} 回声音）")
        n_pre = len(spoken(e0))
        pa.locator(".kfs-ring button[aria-label='接听']").click()
        got = wait_phase(pa, "listening", 15000)
        log_turns = pa.evaluate(TURNS)
        ok(got and not pa.evaluate(RINGING) and log_turns[:1] == [["him", "[softly] 卿卿。在做什么。".replace("[softly] ", "")]] and len(spoken(e0)) == n_pre and pa.evaluate("window.__micLive()") == 1,
           f"接听：来电页面收了、通话页出来，他先开口（用的是响铃时念好的，没再念一遍），说完接着听她说（{log_turns[:1]}）")
        ok(pa.evaluate(MARKS)[-1] == "通话开始", "聊天里：“光义来电”后面一行“通话开始”")
        queue_reply("那我不吵你，写完了再说。")
        say_in_call("在写论文")
        ok(wait_mock(lambda: len(calls()) >= c0 + 2, 10), "她接起来说了一句：照常发出去")
        body = calls()[-1]["body"]
        ut = user_texts(body)
        ok("[开封府提示：她接了你打过去的电话，你们在打电话]" in ut and "在写论文" in ut and any(t.startswith("【此刻】") and "【通话】你们正在打电话" in t for t in ut)
           and any("[CALL]\n[softly] 卿卿。在做什么。" in t for t in his_texts(body)),
           "寄给他的：他自己打电话那一条照原样、“她接了你打过去的电话”、她的话；【此刻】后面附着【通话】那一段")
        wait_phase(pa, "speaking", 15000)
        wait_phase(pa, "listening", 20000)
        time.sleep(0.5)
        pa.locator(".kfs-call button[aria-label='挂断']").click()
        time.sleep(0.8)
        marks = pa.evaluate(MARKS)
        ok(phase(pa) is None and marks[-3:-1] == ["光义来电", "通话开始"] and marks[-1].startswith("通话 ") and pa.evaluate("window.__micLive()") == 0,
           f"挂了：聊天里“光义来电”“通话开始”……“通话 N 秒”（{marks[-3:]}）")

        # ================= 她挂断：未接来电，下一句告诉他 =================
        queue_reply("[CALL]\n是我")
        say(pa, "嗯")
        rang2 = wait_js(pa, RINGING, 20000)
        time.sleep(0.5)
        pa.locator(".kfs-ring button[aria-label='挂断']").click()
        time.sleep(0.6)
        marks = pa.evaluate(MARKS)
        ok(rang2 and not pa.evaluate(RINGING) and phase(pa) is None and marks[-2:] == ["光义来电", "未接来电"] and pa.evaluate("window.__micLive()") == 0,
           f"挂断：来电页面收了，没打起电话来；聊天里“光义来电”“未接来电”（{marks[-2:]}）")
        c1 = len(calls())
        queue_reply("刚才那个电话是我。")
        say(pa, "刚才在忙")
        pa.get_by_text("刚才那个电话是我。").last.wait_for(timeout=20000)
        time.sleep(1.0)
        ut = user_texts(calls()[c1]["body"])
        ok("[开封府提示：你打过去的电话她没接]" in ut and ut.index("[开封府提示：你打过去的电话她没接]") < ut.index("刚才在忙"), "她下一句寄过去的时候，前面附着“你打过去的电话她没接”")

        # ================= 她不在：横幅写 [来电]；一分钟以内回来照样响；响满一分钟没接，记未接 =================
        mock("/__debug/claude-hold?ms=1500")
        mock("/__debug/mail-setup?drop=1")
        b0 = len(banners())
        queue_reply("[CALL]\n卿卿，接电话。")
        say(pa, "我去洗澡了")
        time.sleep(0.3)
        pa.evaluate("window.__away(true)")
        knocked = wait_mock(lambda: len(banners()) >= b0 + 1, timeout=GRACE + 12)
        notes = [b["json"]["notification"] for b in banners()[b0:]]
        bodies = [n["body"] for n in notes]
        ok(knocked and bodies == ["[来电]"] and notes[0]["title"] == "光义", f"她不在：手机上来一条横幅，写 [来电]（他接起来要说的不上横幅）（{bodies}）")
        miss0 = pa.evaluate(MARKS).count("未接来电")
        pa.evaluate("window.__away(false)")
        rang3 = wait_js(pa, RINGING, 20000)
        ok(rang3, "一分钟以内回来：照样弹出来电页面")
        pa.clock.fast_forward(61000)
        time.sleep(1.0)
        marks = pa.evaluate(MARKS)
        ok(not pa.evaluate(RINGING) and marks[-2:] == ["光义来电", "未接来电"] and marks.count("未接来电") == miss0 + 1, f"响满一分钟没接：来电页面收了，记“未接来电”（{marks[-2:]}）")

        # ================= 过了一分钟才回来：不响，直接记未接 =================
        b1 = len(banners())
        miss1 = pa.evaluate(MARKS).count("未接来电")
        queue_reply("[CALL]\n在吗。")
        say(pa, "睡了")
        time.sleep(0.3)
        pa.evaluate("window.__away(true)")
        wait_mock(lambda: len(banners()) >= b1 + 1, timeout=GRACE + 12)
        pa.clock.fast_forward(65000)
        pa.evaluate("window.__away(false)")
        pa.get_by_text("睡了").last.wait_for(timeout=10000)
        time.sleep(3.0)
        marks = pa.evaluate(MARKS)
        ok(not pa.evaluate(RINGING) and marks[-2:] == ["光义来电", "未接来电"] and marks.count("未接来电") == miss1 + 1, f"过了一分钟才回来：不响，直接记“未接来电”（{marks[-2:]}）")
        mock("/__debug/mail-setup?drop=0")
        mock("/__debug/claude-hold?ms=0")

        # ================= 关了“他能打电话”：不教他；他写了也不响 =================
        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        pa.get_by_text("API", exact=True).click()
        pa.locator("button[aria-label='他能打电话']").wait_for(timeout=5000)
        pa.locator("button[aria-label='他能打电话']").click(); time.sleep(0.4)
        off = json.loads(pa.evaluate(KV, "kfs2:settings") or "{}").get("callable") is False
        close_panel(pa)
        c2 = len(calls())
        miss2 = pa.evaluate(MARKS).count("未接来电")
        queue_reply("[CALL]\n打不打得通")
        say(pa, "关了开关")
        wait_mock(lambda: len(calls()) > c2, 10)
        time.sleep(3.0)
        sys1 = calls()[c2]["body"]["system"]
        sys_text = sys1[0]["text"] if isinstance(sys1, list) else sys1
        ok(off and "单独一行写 [CALL]" not in sys_text and not pa.evaluate(RINGING) and pa.evaluate(MARKS)[-1] == "未接来电" and pa.evaluate(MARKS).count("未接来电") == miss2 + 1,
           "关了“他能打电话”：【回复格式】里不教；他写了也不响，记“未接来电”")
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
if count["failed"]:
    raise SystemExit(1)
