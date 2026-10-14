# 通话页拍照（不是测试，不判对错）：接通、在听（底下是听到的字）、他在想、他在说、静音、点一下屏幕、挂了以后的聊天。
# 拍给她看样子用；她以后做好通话背景图，换上以后再拍一遍对着看。字都是编的。
#
# 先在 source/ 里：npm run build:test，再开两个服务（同 tests/e2e.py）：
#   npm run mock                         （假 Supabase，8787）
#   cd dist-test && python3 -m http.server 8080
# 然后：python3 tests/look_call.py 输出目录 [主题]      主题不写是 heiye（通话页本身是黑的，主题只管挂了以后那张聊天）
#
# 头像后面那圈光是一直在动的：拍的时候钉在最亮那一下（他在说）、吸满气那一下（他在想），一张图才看得出来。
# 另拼两张会动的图（GIF）看它怎么动：一帧一帧把动画拨到那一刻再拍，不靠截图快慢，动得匀。
import io, json, os, sys, time, urllib.parse
from PIL import Image
from playwright.sync_api import sync_playwright
from mailkit import *

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "shots", "call")
theme = sys.argv[2] if len(sys.argv) > 2 else "heiye"
os.makedirs(out, exist_ok=True)

# 手机自带的听写装不出来：换成能遥控的假听写（同 tests/e2e_call.py）；屏幕常亮也装一个
FAKE_SR = r"""(() => {
  window.__srs = [];
  class FakeSR {
    constructor() { this.started = false; this.stopped = false; window.__srs.push(this); }
    start() { if (window.__srDeny) { setTimeout(() => this.onerror && this.onerror({ error: 'not-allowed' }), 0); return; } this.started = true; }
    stop() { this.stopped = true; setTimeout(() => this.onend && this.onend(), 60); }
    abort() { this.stopped = true; }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
  window.__srSay = (text) => { const r = window.__srs[window.__srs.length - 1]; if (!r || !r.started || r.stopped || !r.onresult) return false; r.onresult({ results: [[{ transcript: text }]] }); return true; };
  try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ release: async () => {} }) } }); } catch (e) {}
})()"""
FREEZE = r"""document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style');
  s.textContent = '.kfs-call-talk { animation-delay: -0.475s !important; animation-play-state: paused !important; } .kfs-call-think { animation-delay: -1.4s !important; animation-play-state: paused !important; }';
  document.head.appendChild(s); });"""
PHASE = "(() => { const e = document.querySelector('.kfs-call'); return e ? e.dataset.phase : null; })()"


def queue(text):
    mock("/__debug/reply-queue?text=" + urllib.parse.quote(text))


def wait_phase(page, want, timeout=15000):
    return wait_js(page, PHASE + " === " + json.dumps(want), timeout)


# 头像那一块拍成会动的图：那圈光换上 cls 那段动画，一圈 period 秒拨成 n 帧
def frames(page, cls, period, n, path):
    page.evaluate("(c) => { document.querySelector('.kfs-call-ring').className = 'kfs-call-ring ' + c; }", cls)
    r = page.evaluate("(() => { const b = document.querySelector('.kfs-call-ring').parentElement.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()")
    clip = {"x": r["x"] - 180, "y": r["y"] - 170, "width": 360, "height": 380}
    imgs = []
    for i in range(n):
        page.evaluate("""(t) => { const e = document.querySelector('.kfs-call-ring');
          e.style.setProperty('animation-delay', '-' + t + 's', 'important'); e.style.setProperty('animation-play-state', 'paused', 'important'); }""", period * i / n)
        time.sleep(0.03)
        im = Image.open(io.BytesIO(page.screenshot(clip=clip))).convert("RGB")
        imgs.append(im.resize((im.width // 2, im.height // 2), Image.LANCZOS))
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=round(period * 1000 / n), loop=0)
    page.evaluate("""(() => { const e = document.querySelector('.kfs-call-ring'); e.className = 'kfs-call-ring ';
      e.style.removeProperty('animation-delay'); e.style.removeProperty('animation-play-state'); })()""")
    print("拼了", os.path.basename(path), n, "帧")


with sync_playwright() as p:
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    ctx.add_init_script(FAKE_SR)
    ctx.add_init_script(FREEZE)
    ctx.add_init_script(f"try {{ if (!sessionStorage.getItem('kfs-look-theme')) {{ localStorage.setItem('kfs-theme', '{theme}'); localStorage.setItem('kfs-mirror-still', '1'); sessionStorage.setItem('kfs-look-theme', '1'); }} }} catch (e) {{}}")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    def shot(name, settle=0.3):
        time.sleep(settle)
        page.screenshot(path=os.path.join(out, name + ".png"))
        print("拍了", name, page.evaluate(PHASE))

    # ---------- 门口、开屏（同 tests/look.py：照主题挑怎么进门） ----------
    page.goto(BASE)
    page.get_by_text("进门先报上名来").wait_for(timeout=20000)
    page.locator("input[type=email]").fill("qing@example.com")
    page.locator("input[type=password]").fill("correct-horse")
    page.get_by_role("button", name="进府").click()
    page.get_by_text("设一句暗号").wait_for(timeout=15000)
    fields = page.locator("form input")
    fields.nth(0).fill(PASS); fields.nth(1).fill(PASS)
    page.get_by_role("button", name="设好了").click()
    kite_btn = page.get_by_role("button", name="戳一下燕子，进开封府")
    knob = page.get_by_role("slider", name="把小猪拉到最右边，进开封府")
    enter_any = page.locator("[data-kfs-splash-enter]")
    for _ in range(300):
        if kite_btn.count() or knob.count() or enter_any.count():
            break
        time.sleep(0.1)
    time.sleep(2.0)
    if kite_btn.count():
        kite_btn.click()
    elif knob.count():
        kb = knob.bounding_box()
        kx, ky = kb["x"] + kb["width"] / 2, kb["y"] + kb["height"] / 2
        page.mouse.move(kx, ky); page.mouse.down(); page.mouse.move(kx + 420, ky, steps=10); time.sleep(0.6)
        page.mouse.up()
    else:
        el = enter_any.first
        times = int(el.get_attribute("data-kfs-splash-enter") or "1")
        for k in range(times):
            el.click()
            if k < times - 1:
                time.sleep(float(el.get_attribute("data-kfs-splash-wait") or "1"))
    page.get_by_placeholder("说话，我听着").wait_for(timeout=30000)
    time.sleep(1.0)

    # ---------- 先打两句字 ----------
    ta = page.get_by_placeholder("说话，我听着")
    queue("在呢。\n[SPLIT]\n下班了？")
    ta.fill("老公在吗")
    ta.press("Enter")
    page.get_by_text("下班了？", exact=True).last.wait_for(timeout=30000)
    time.sleep(1.5)
    page.evaluate("document.activeElement && document.activeElement.blur()")

    # ---------- 打电话 ----------
    page.locator(".kfs-composer button[aria-label='打电话']").click()
    wait_phase(page, "listening", 5000)
    shot("01_接通_在听", 1.2)
    mock("/__debug/claude-hold?ms=6000")
    queue("*揉揉你的头* 辛苦了。\n[SPLIT]\n到家先喝口热水，别急着做饭，我陪你说会儿话。今天哪件事最累，跟我说说，我听着呢。")
    page.evaluate("(t) => window.__srSay(t)", "嗯刚到家")
    time.sleep(0.4)
    page.evaluate("(t) => window.__srSay(t)", "嗯刚到家，今天好累，下班路上一直在想你")
    shot("02_在听_听到的字", 0.2)
    wait_phase(page, "thinking", 5000)
    shot("03_他在想", 0.6)
    wait_phase(page, "speaking", 15000)
    # 头一段短，挑后面那段长的拍
    time.sleep(1.6)
    shot("04_他在说", 0.0)
    wait_phase(page, "listening", 60000)
    time.sleep(0.6)
    page.locator(".kfs-call button[aria-label='静音']").click()
    shot("05_静音", 0.6)
    # 静音着不会变样子：借这一会儿把那圈光换成“他在说”“他在想”拍动起来的样子
    # GIF 一帧多长只能是 10 毫秒的整数倍：0.95 秒拨 19 帧（一帧 50 毫秒），2.8 秒拨 28 帧（一帧 100 毫秒），快慢和真的一样
    frames(page, "kfs-call-talk", 0.95, 19, os.path.join(out, "08_他在说_动起来.gif"))
    frames(page, "kfs-call-think", 2.8, 28, os.path.join(out, "09_他在想_动起来.gif"))
    page.evaluate("window.__srDeny = true")
    page.locator(".kfs-call button[aria-label='取消静音']").click()
    wait_phase(page, "tap", 5000)
    shot("06_点一下屏幕", 0.6)
    page.evaluate("window.__srDeny = false")
    page.locator(".kfs-call").click(position={"x": 196, "y": 300})
    wait_phase(page, "listening", 5000)
    time.sleep(1.0)
    page.locator(".kfs-call button[aria-label='挂断']").click()
    time.sleep(1.2)
    page.evaluate("(() => { const s = document.querySelector('.kfs-chat-scroll'); if (s) s.scrollTop = s.scrollHeight; })()")
    shot("07_挂了以后的聊天", 1.0)
    print("页面报错：" + ("\n".join(errs[:10]) if errs else "无"))
    browser.close()
