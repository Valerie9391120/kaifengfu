# 通话页拍照（不是测试，不判对错）：你在说（字幕是你的）、他在想、他在说（一段一段出）、字幕满了往上滚、你又开口（换回你的）、
# 静音、点一下屏幕、挂了以后的聊天；再录一小段视频看字幕怎么淡出、怎么滚。拍给她看样子用；字都是编的。
#
# 先在 source/ 里：npm run build:test，再开两个服务（同 tests/e2e.py）：
#   npm run mock                         （假 Supabase，8787）
#   cd dist-test && python3 -m http.server 8080
# 然后：python3 tests/look_call.py 输出目录 [主题]      主题不写是 heiye（通话页本身是黑的，主题只管挂了以后那张聊天）
# 不要视频：KFS_VIDEO=0。视频要 ffmpeg（webm 转成 iPhone 放得了的 mp4）。
#
# 通话页照她的手机留出状态栏和底下横条的地方（KFS_SAFE="上,下"，默认 59,34：屏幕 852 高、有灵动岛的 iPhone）：
# 浏览器里 env(safe-area-inset-*) 是 0，不留的话拍出来比她手机上宽松，字幕和按钮之间的空看着比实际多。
# 头像后面那圈光是一直在动的：拍照的时候钉在最亮那一下（他在说）、吸满气那一下（他在想）；
# 另拼两张会动的图（GIF）看它怎么动：一帧一帧把动画拨到那一刻再拍，动得匀。视频里不钉，照真的动。
import io, json, os, subprocess, sys, time, urllib.parse
from PIL import Image
from playwright.sync_api import sync_playwright
from mailkit import *

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "shots", "call")
theme = sys.argv[2] if len(sys.argv) > 2 else "heiye"
os.makedirs(out, exist_ok=True)
SAFE_TOP, SAFE_BOTTOM = [int(x) for x in os.environ.get("KFS_SAFE", "59,34").split(",")]
VIDEO = os.environ.get("KFS_VIDEO", "1") != "0"

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
FREEZE = r""".kfs-call-talk { animation-delay: -0.475s !important; animation-play-state: paused !important; }
.kfs-call-think { animation-delay: -1.4s !important; animation-play-state: paused !important; }"""
PHASE = "(() => { const e = document.querySelector('.kfs-call'); return e ? e.dataset.phase : null; })()"
UNITS = "document.querySelectorAll('.kfs-sub-turn:not(.kfs-sub-out) .kfs-sub-unit').length"
SCROLLED = "(() => { const e = document.querySelector('.kfs-sub-turn:not(.kfs-sub-out)'); return !!e && e.scrollTop > 0; })()"


def style(css):
    return "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = " + json.dumps(css) + "; document.head.appendChild(s); });"


SAFE_CSS = f".kfs-call {{ padding-top: {SAFE_TOP + 44}px !important; padding-bottom: {SAFE_BOTTOM + 40}px !important; }}"


def queue(text):
    mock("/__debug/reply-queue?text=" + urllib.parse.quote(text))


def wait_phase(page, want, timeout=15000):
    return wait_js(page, PHASE + " === " + json.dumps(want), timeout)


# 她说一句：听写的字一点一点长出来（每回多两三个字），跟真的一样
def speak(page, text, step=3, gap=0.28):
    chars = list(text)
    for i in range(step, len(chars) + step, step):
        page.evaluate("(t) => window.__srSay(t)", "".join(chars[:i]))
        time.sleep(gap)


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


# 门口、开屏（同 tests/look.py：照主题挑怎么进门），再打两句字
def enter(page):
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
    ta = page.get_by_placeholder("说话，我听着")
    ta.wait_for(timeout=30000)
    time.sleep(1.0)
    queue("在呢。\n[SPLIT]\n下班了？")
    ta.fill("老公在吗")
    ta.press("Enter")
    page.get_by_text("下班了？", exact=True).last.wait_for(timeout=30000)
    time.sleep(1.5)
    page.evaluate("document.activeElement && document.activeElement.blur()")


def phone(browser, **extra):
    ctx = browser.new_context(**IPHONE, **extra)
    ctx.add_init_script(STUB)
    ctx.add_init_script(FAKE_SR)
    ctx.add_init_script(style(SAFE_CSS))
    ctx.add_init_script(f"try {{ if (!sessionStorage.getItem('kfs-look-theme')) {{ localStorage.setItem('kfs-theme', '{theme}'); localStorage.setItem('kfs-mirror-still', '1'); sessionStorage.setItem('kfs-look-theme', '1'); }} }} catch (e) {{}}")
    return ctx


# ---------- 拍照 ----------
def photos(browser):
    mock("/__debug/reset")
    ctx = phone(browser)
    ctx.add_init_script(style(FREEZE))
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    def shot(name, settle=0.3):
        time.sleep(settle)
        page.screenshot(path=os.path.join(out, name + ".png"))
        print("拍了", name, page.evaluate(PHASE))

    enter(page)
    page.locator(".kfs-composer button[aria-label='打电话']").click()
    wait_phase(page, "listening", 5000)
    time.sleep(1.0)
    mock("/__debug/claude-hold?ms=5000")
    queue("*揉揉你的头* 辛苦了。\n[SPLIT]\n[softly] 到家先喝口热水，别急着做饭，我陪你说会儿话。今天哪件事最累，跟我说说，我听着呢。\n[SPLIT]\n"
          "[laughs] 对了，我今天在书房翻到你以前写的小纸条，字歪歪扭扭的，旁边还画了一只狐狸，我看了好半天。等你歇够了，我念给你听，好不好？"
          "念完了你要是还想听，我再给你讲讲我们第一次见面那天，你迟到了二十分钟，还说是路上的猫拦着你。")
    speak(page, "嗯刚到家，今天好累，下班路上一直在想你")
    shot("01_你在说", 0.1)
    wait_phase(page, "thinking", 5000)
    shot("02_他在想", 0.6)
    wait_phase(page, "speaking", 15000)
    wait_js(page, UNITS + " >= 2", 30000)
    shot("03_他在说", 0.8)
    wait_js(page, SCROLLED, 90000)
    shot("04_他在说_满了往上滚", 1.2)
    wait_phase(page, "listening", 90000)
    time.sleep(0.8)
    queue("好，你听着。")
    speak(page, "那你现在就念给我听")
    shot("05_你又开口", 0.5)
    wait_phase(page, "speaking", 20000)
    wait_phase(page, "listening", 30000)
    time.sleep(0.6)
    page.locator(".kfs-call button[aria-label='静音']").click()
    shot("06_静音", 0.6)
    # 静音着不会变样子：借这一会儿把那圈光换成“他在说”“他在想”拍动起来的样子
    # GIF 一帧多长只能是 10 毫秒的整数倍：0.95 秒拨 19 帧（一帧 50 毫秒），2.8 秒拨 28 帧（一帧 100 毫秒），快慢和真的一样
    frames(page, "kfs-call-talk", 0.95, 19, os.path.join(out, "10_他在说_动起来.gif"))
    frames(page, "kfs-call-think", 2.8, 28, os.path.join(out, "11_他在想_动起来.gif"))
    page.evaluate("window.__srDeny = true")
    page.locator(".kfs-call button[aria-label='取消静音']").click()
    wait_phase(page, "tap", 5000)
    shot("07_点一下屏幕", 0.6)
    page.evaluate("window.__srDeny = false")
    page.locator(".kfs-call").click(position={"x": 196, "y": 200})
    wait_phase(page, "listening", 5000)
    time.sleep(1.0)
    page.locator(".kfs-call button[aria-label='挂断']").click()
    time.sleep(1.2)
    page.evaluate("(() => { const s = document.querySelector('.kfs-chat-scroll'); if (s) s.scrollTop = s.scrollHeight; })()")
    shot("08_挂了以后的聊天", 1.0)
    print("拍照这一趟页面报错：" + ("\n".join(errs[:10]) if errs else "无"))
    ctx.close()


# ---------- 录一小段：打过去、她说一句、他回两段、她又说、他又回、挂断 ----------
def film(browser):
    mock("/__debug/reset")
    vdir = os.path.join(out, "_video")
    os.makedirs(vdir, exist_ok=True)
    ctx = phone(browser, record_video_dir=vdir, record_video_size={"width": 786, "height": 1704})
    page = ctx.new_page()
    born = time.time()
    enter(page)
    begin = time.time() - born
    page.locator(".kfs-composer button[aria-label='打电话']").click()
    wait_phase(page, "listening", 5000)
    time.sleep(1.2)
    mock("/__debug/claude-hold?ms=2200")
    queue("[laughs] 真的？\n[SPLIT]\n它是不是也觉得你眼熟，想跟你回家。下回再碰到，替我跟它打声招呼。")
    speak(page, "今天下班路上看到一只小狐狸，蹲在路边看我")
    wait_phase(page, "speaking", 15000)
    wait_phase(page, "listening", 40000)
    time.sleep(1.0)
    mock("/__debug/claude-hold?ms=1800")
    queue("嗯，走慢点，看路。")
    speak(page, "好呀，那我明天还走那条路")
    wait_phase(page, "speaking", 15000)
    wait_phase(page, "listening", 20000)
    time.sleep(1.5)
    page.locator(".kfs-call button[aria-label='挂断']").click()
    time.sleep(2.0)
    end = time.time() - born
    raw = page.video.path()
    ctx.close()
    mp4 = os.path.join(out, "09_打一通电话.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{max(0, begin - 0.6):.2f}", "-to", f"{end:.2f}", "-i", raw,
                    "-vf", "scale=590:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart", "-an", mp4], check=True)
    print("录了", os.path.basename(mp4), f"{end - begin:.0f} 秒")


with sync_playwright() as p:
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    photos(browser)
    if VIDEO:
        film(browser)
    browser.close()
