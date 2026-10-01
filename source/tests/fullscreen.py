# 检查“页面矮一个状态栏、底下空一条”时的处理。先起好测试服务（见开发说明），再：python3 tests/fullscreen.py
import os, io, time, urllib.request
from playwright.sync_api import sync_playwright
from PIL import Image
MOCK = os.environ.get("KFS_MOCK", "http://127.0.0.1:8787")
BASE = os.environ.get("KFS_BASE", "http://127.0.0.1:8080/")
CHROME = os.environ.get("CHROME_PATH", "/opt/google/chrome/chrome" if os.path.exists("/opt/google/chrome/chrome") else None)
STRIP = (0xD6, 0xDC, 0xCD)  # 系统在最底下画的那条，颜色取网页底色
passed = failed = 0
def ok(c, m):
    global passed, failed
    if c: passed += 1; print("ok:", m)
    else: failed += 1; print("FAIL:", m)

STANDALONE = "Object.defineProperty(Navigator.prototype, 'standalone', { get() { return true; } });"
MIST = "(() => { const m = document.querySelector('.kfs-bottom-mist'); const s = getComputedStyle(m); return s.display === 'none' ? 'none' : (parseFloat(s.opacity) > 0.5 ? 'on' : 'off'); })()"
COMPOSER = """() => {
  const c = document.querySelector('.kfs-composer');
  const r = c.getBoundingClientRect();
  const btn = Math.max(...[...c.querySelectorAll('button')].map(b => b.getBoundingClientRect().bottom));
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), btn: Math.round(btn) };
}"""

def bottom_color(pg, y):
    # 输入框最底下一行像素的平均颜色（左右各让开一点）
    png = pg.screenshot(clip={"x": 10, "y": y - 1, "width": 373, "height": 1})
    im = Image.open(io.BytesIO(png)).convert("RGB")
    px = [im.getpixel((x, im.height - 1)) for x in range(im.width)]
    return tuple(round(sum(p[i] for p in px) / len(px)) for i in range(3))

def run(name, viewport_h, inset_top, standalone, login=False):
    urllib.request.urlopen(MOCK + "/__debug/reset").read()
    c = browser.new_context(viewport={"width": 393, "height": viewport_h}, screen={"width": 393, "height": 852},
                            device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN")
    if standalone: c.add_init_script(STANDALONE)
    pg = c.new_page()
    cdp = c.new_cdp_session(pg)
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": inset_top, "bottom": 34, "left": 0, "right": 0}})
    pg.goto(BASE)
    pg.get_by_text("进门先报上名来").wait_for(timeout=15000)
    time.sleep(0.7)
    var = pg.evaluate("document.documentElement.getAttribute('data-kfs-gap') || ''")
    gate_h = pg.evaluate("(() => { const el = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'fixed' && d.querySelector('img')); return el ? Math.round(el.getBoundingClientRect().height) : null; })()")
    res = {"gap": var, "mist": pg.evaluate(MIST), "gate_h": gate_h}
    if login:
        pg.locator("input[type=email]").fill("qing@example.com"); pg.locator("input[type=password]").fill("correct-horse")
        pg.get_by_role("button", name="进府").click()
        pg.get_by_text("设一句暗号").wait_for(timeout=15000)
        f = pg.locator("form input"); f.nth(0).fill("test-passphrase-123"); f.nth(1).fill("test-passphrase-123")
        pg.get_by_role("button", name="设好了").click()
        k = pg.get_by_role("button", name="戳一下燕子，进开封府"); k.wait_for(timeout=30000); time.sleep(1)
        res["mist_splash"] = pg.evaluate(MIST)
        k.click()
        pg.get_by_text("如月之恒，官家在这").wait_for(timeout=10000)
        k.wait_for(state="detached", timeout=10000); time.sleep(0.6)  # 开屏淡完，淡出那层也退完
        res["app_h"] = pg.evaluate("Math.round(document.querySelector('.select-none').getBoundingClientRect().height)")
        res["composer"] = pg.evaluate(COMPOSER)
        res["mist_chat"] = pg.evaluate(MIST)
        res["seam"] = bottom_color(pg, res["composer"]["bottom"])
        res["scroll_h"] = pg.evaluate("document.documentElement.scrollHeight")
        pg.get_by_role("button", name="打开侧栏").click(); time.sleep(0.8)
        res["mist_drawer"] = pg.evaluate(MIST)
        res["drawer_row"] = pg.evaluate("(() => { const r = document.querySelector('.kfs-dock-fade'); return { bottom: Math.round(r.getBoundingClientRect().bottom), btn: Math.round(Math.max(...[...r.querySelectorAll('button')].map(b => b.getBoundingClientRect().bottom))) }; })()")
        pg.mouse.click(380, 400); time.sleep(0.8)
        pg.locator(".kfs-composer button", has_text="Sonnet").click(); time.sleep(0.8)
        res["mist_sheet"] = pg.evaluate(MIST)
    c.close()
    print(name, res)
    return res

def near(a, b, tol):
    return all(abs(a[i] - b[i]) <= tol for i in range(3))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    a = run("A 你现在这种：页面矮了一个状态栏，底下空一条", 793, 59, True, login=True)
    ok(a["gap"] == "bottom" and a["mist"] == "on" and a["mist_splash"] == "on", "量出底下空一条：门口和开屏页最底下淡出")
    ok(a["gate_h"] == 793 and a["app_h"] == 793, "页面高度不硬补，就是网页够得着的那么高")
    ok(a["composer"]["bottom"] == 793 and a["composer"]["left"] == 0 and a["composer"]["right"] == 393, "输入框整块贴到网页最底边")
    ok(a["composer"]["btn"] == 793 - 8, "输入框不再给横条让位，按钮离底边只留 8")
    ok(a["mist_chat"] == "off" and a["mist_drawer"] == "off", "对话页和侧栏不盖淡出，按钮不发白")
    ok(near(a["seam"], STRIP, 4), f"输入框底边和那条色块接得上（{a['seam']} 对 {STRIP}）")
    ok(a["drawer_row"]["bottom"] == 793 and a["drawer_row"]["btn"] == 793 - 12, "侧栏最底下那排也沉下去")
    ok(a["mist_sheet"] == "on", "弹出面板时照旧淡出")
    ok(a["scroll_h"] <= 793, "页面不会被拖着上下晃")
    b = run("B 系统正常：页面本来就是整屏", 852, 59, True, login=True)
    ok(b["gap"] == "" and b["mist"] == "none" and b["gate_h"] == 852, "系统正常时不加淡出，照样整屏")
    ok(b["composer"]["bottom"] == 852 and b["composer"]["btn"] == 852 - 34, "系统正常时输入框铺到屏幕底，按钮让开底下横条")
    ok(b["drawer_row"]["btn"] == 852 - 34, "系统正常时侧栏最底下那排也让开横条")
    c_ = run("C 苹果那个毛病：状态栏是实心条", 793, 0, True)
    ok(c_["gap"] == "" and c_["mist"] == "none" and c_["gate_h"] == 793, "状态栏实心的情况不加")
    d = run("D 在 Safari 里打开", 793, 59, False)
    ok(d["gap"] == "" and d["mist"] == "none" and d["gate_h"] == 793, "在 Safari 里打开不加")
    browser.close()
print(f"\n通过 {passed}  失败 {failed}")
