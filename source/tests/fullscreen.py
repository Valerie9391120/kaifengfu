# 检查“页面矮一个状态栏、底下空一条”时的处理。先起好测试服务（见开发说明），再：python3 tests/fullscreen.py
import os, io, time, urllib.request
from playwright.sync_api import sync_playwright
from PIL import Image
MOCK = os.environ.get("KFS_MOCK", "http://127.0.0.1:8787")
BASE = os.environ.get("KFS_BASE", "http://127.0.0.1:8080/")
CHROME = os.environ.get("CHROME_PATH", "/opt/google/chrome/chrome" if os.path.exists("/opt/google/chrome/chrome") else None)
SHOTS = os.environ.get("KFS_SHOTS", "")
STRIP = (0xD6, 0xDC, 0xCD)  # 系统在最底下画的那条，颜色取网页底色
passed = failed = 0
def ok(c, m):
    global passed, failed
    if c: passed += 1; print("ok:", m)
    else: failed += 1; print("FAIL:", m)

STANDALONE = "Object.defineProperty(Navigator.prototype, 'standalone', { get() { return true; } });"
# 假的“可视区”：浏览器里弹不出 iPhone 的键盘，用它假装键盘弹起来（可视区变矮、往下挪）
FAKE_KEYBOARD = """(() => {
  const fake = new EventTarget();
  let h = null, top = 0;
  Object.defineProperty(fake, 'height', { get: () => (h == null ? window.innerHeight : h) });
  Object.defineProperty(fake, 'width', { get: () => window.innerWidth });
  Object.defineProperty(fake, 'offsetTop', { get: () => top });
  Object.defineProperty(fake, 'offsetLeft', { get: () => 0 });
  Object.defineProperty(fake, 'scale', { get: () => 1 });
  window.__kfsKeyboard = (height, offsetTop) => { h = height; top = offsetTop || 0; fake.dispatchEvent(new Event('resize')); fake.dispatchEvent(new Event('scroll')); };
  Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
})();"""
KB_STATE = """() => {
  const root = document.querySelector('.select-none').getBoundingClientRect();
  const c = document.querySelector('.kfs-composer');
  const cr = c.getBoundingClientRect();
  const btn = Math.max(...[...c.querySelectorAll('button')].map(b => b.getBoundingClientRect().bottom));
  const head = document.querySelector('[aria-label="打开侧栏"]').getBoundingClientRect();
  return { open: document.documentElement.hasAttribute('data-kfs-kb'), top: Math.round(root.top), bottom: Math.round(root.bottom),
           composer: Math.round(cr.bottom), btn: Math.round(btn), head: Math.round(head.top) };
}"""
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

def run(name, viewport_h, inset_top, standalone, login=False, vh=None, kb=False):
    urllib.request.urlopen(MOCK + "/__debug/reset").read()
    c = browser.new_context(viewport={"width": 393, "height": viewport_h}, screen={"width": 393, "height": 852},
                            device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN")
    if standalone: c.add_init_script(STANDALONE)
    # 浏览器里没法真的让 100vh 比网页高，用 main.jsx 留的口子告诉它 100vh 量出来是多少
    if vh: c.add_init_script(f"window.__KFS_TEST_VH__ = {vh};")
    if kb: c.add_init_script(FAKE_KEYBOARD)
    pg = c.new_page()
    cdp = c.new_cdp_session(pg)
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": inset_top, "bottom": 34, "left": 0, "right": 0}})
    pg.goto(BASE)
    pg.get_by_text("进门先报上名来").wait_for(timeout=15000)
    time.sleep(0.7)
    var = pg.evaluate("document.documentElement.getAttribute('data-kfs-gap') || ''")
    gate_h = pg.evaluate("(() => { const el = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'fixed' && d.querySelector('img')); return el ? Math.round(el.getBoundingClientRect().height) : null; })()")
    res = {"gap": var, "mist": pg.evaluate(MIST), "gate_h": gate_h,
           "html_h": pg.evaluate("Math.round(document.documentElement.getBoundingClientRect().height)"),
           "body_h": pg.evaluate("Math.round(document.body.getBoundingClientRect().height)")}
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
        # 浏览器窗口只有 viewport_h 那么高，撑满时输入框底边在窗口外面，量不了也不用量
        res["seam"] = bottom_color(pg, res["composer"]["bottom"]) if res["composer"]["bottom"] <= viewport_h else None
        res["scroll_h"] = pg.evaluate("document.documentElement.scrollHeight")
        if kb:
            # 键盘弹起来：可视区剩上面 447 高、往下挪了 344（照她截图量的），外壳要正好铺在这块里
            pg.get_by_placeholder("说话，我听着").focus()
            pg.evaluate("window.__kfsKeyboard(447, 344)"); time.sleep(0.3)
            res["kb_open"] = pg.evaluate(KB_STATE)
            pg.evaluate("document.activeElement.blur(); window.__kfsKeyboard(null, 0)"); time.sleep(0.3)
            res["kb_closed"] = pg.evaluate(KB_STATE)
        # 整页被挪动了（比如收键盘以后），要自己挪回顶上
        pg.evaluate("window.scrollTo(0, 59)"); time.sleep(0.4)
        res["scroll_after"] = pg.evaluate("Math.round(window.scrollY)")
        pg.get_by_role("button", name="打开侧栏").click(); time.sleep(0.8)
        res["mist_drawer"] = pg.evaluate(MIST)
        res["drawer_row"] = pg.evaluate("(() => { const r = document.querySelector('.kfs-dock-fade'); return { bottom: Math.round(r.getBoundingClientRect().bottom), btn: Math.round(Math.max(...[...r.querySelectorAll('button')].map(b => b.getBoundingClientRect().bottom))) }; })()")
        pg.mouse.click(380, 400); time.sleep(0.8)
        pg.locator(".kfs-composer button", has_text="Sonnet").click(); time.sleep(0.8)
        res["mist_sheet"] = pg.evaluate(MIST)
        # 账户面板里“量一量屏幕底下”：把整页撑到屏幕高，量出来的数摆出来，关掉后原样回来
        pg.get_by_role("button", name="关闭").click(); time.sleep(0.5)
        pg.get_by_role("button", name="打开侧栏").click(); time.sleep(0.8)
        pg.get_by_role("button", name="头像与设置").click(); time.sleep(0.6)
        pg.get_by_role("button", name="量一量屏幕底下").click(); time.sleep(0.4)
        res["probe"] = pg.evaluate("""() => {
          const p = document.getElementById('kfs-probe');
          const t = p ? p.innerText : '';
          return { on: document.documentElement.hasAttribute('data-kfs-probe'), body_h: Math.round(document.body.getBoundingClientRect().height),
                   root_hidden: getComputedStyle(document.getElementById('root')).display === 'none',
                   screen: /屏幕高\s*852/.test(t), inner: /innerHeight\s*793/.test(t), gap: /是，空 59/.test(t),
                   gold: [...p.querySelectorAll('div')].some(d => d.textContent === '金色：原来空着的那一条' && Math.round(d.getBoundingClientRect().top) === 793) };
        }""")
        if SHOTS: pg.screenshot(path=os.path.join(SHOTS, f"probe_{name[0]}.png"))
        pg.get_by_role("button", name="关掉量屏幕").click(); time.sleep(0.4)
        res["probe_closed"] = pg.evaluate("!document.getElementById('kfs-probe') && !document.documentElement.hasAttribute('data-kfs-probe') && getComputedStyle(document.getElementById('root')).display !== 'none'")
        res["back_to_sheet"] = pg.get_by_role("button", name="量一量屏幕底下").is_visible()
        res["has_switch"] = pg.get_by_role("switch", name="铺满到屏幕最底下").count() > 0
        if vh:
            # 账户面板的开关：关掉退回贴底，再打开撑满；关着的设定记在这台手机上
            STATE = "[document.documentElement.getAttribute('data-kfs-gap'), Math.round(document.documentElement.getBoundingClientRect().height), localStorage.getItem('kfs-fill')]"
            sw = pg.get_by_role("switch", name="铺满到屏幕最底下")
            res["switch_init"] = sw.get_attribute("aria-checked")
            sw.click(); time.sleep(0.4); res["switch_off"] = pg.evaluate(STATE)
            sw.click(); time.sleep(0.4); res["switch_on"] = pg.evaluate(STATE)
            sw.click(); time.sleep(0.4)
            pg.reload(); pg.get_by_role("button", name="戳一下燕子，进开封府").wait_for(timeout=30000); time.sleep(0.5)
            res["off_after_reload"] = pg.evaluate(STATE)
    c.close()
    print(name, res)
    return res

def near(a, b, tol):
    return all(abs(a[i] - b[i]) <= tol for i in range(3))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    a = run("A 你的手机：空一条，但 100vh 够得着屏幕底（量过）", 793, 59, True, login=True, vh=852, kb=True)
    ok(a["gap"] == "fill" and a["mist"] == "none" and a["mist_splash"] == "none", "量出空一条、100vh 够得着：撑满，不用淡出")
    ok(a["html_h"] == 852 and a["body_h"] == 852 and a["gate_h"] == 852 and a["app_h"] == 852, "html、body、门口、开封府外壳都撑到屏幕那么高")
    ok(a["composer"]["bottom"] == 852 and a["composer"]["left"] == 0 and a["composer"]["right"] == 393, "输入框整块贴到屏幕最底下")
    ok(a["composer"]["btn"] == 852 - 34, "按钮照常让开底下横条，跟官端一样")
    ok(a["mist_chat"] == "none" and a["mist_drawer"] == "none" and a["mist_sheet"] == "none", "撑满以后哪儿都不盖淡出")
    ok(a["drawer_row"]["bottom"] == 852 and a["drawer_row"]["btn"] == 852 - 34, "侧栏最底下那排也到底，让开横条")
    ok(a["scroll_after"] == 0, "整页被挪动了会自己挪回顶上")
    k = a["kb_open"]
    ok(k["open"] and k["top"] == 344 and k["bottom"] == 791, f"键盘弹起来：外壳正好铺在键盘上面那块（{k}）")
    ok(k["composer"] == 791 and k["btn"] == 791 - 8, "键盘弹起来：输入框连同底下那排按钮整块贴在键盘上面")
    ok(k["head"] >= 344 + 59, "键盘弹起来：顶栏还在屏幕最上面，没被推出去")
    k2 = a["kb_closed"]
    ok(not k2["open"] and k2["top"] == 0 and k2["bottom"] == 852 and k2["btn"] == 852 - 34, "收起键盘：外壳回到整屏，按钮重新让开底下横条")
    pr = a["probe"]
    ok(pr["on"] and pr["root_hidden"] and pr["body_h"] == 852, "量屏幕：整页临时撑到屏幕那么高，开封府本体先藏起来")
    ok(pr["screen"] and pr["inner"] and pr["gap"], "量屏幕：屏幕高、网页高、空多少都摆出来")
    ok(pr["gold"], "量屏幕：金色那块正好落在空出来的那条里")
    ok(a["probe_closed"] and a["back_to_sheet"], "量屏幕：点关掉，原样回到账户面板")
    ok(a["switch_init"] == "true" and a["switch_off"] == ["bottom", 793, "off"] and a["switch_on"] == ["fill", 852, None],
       "账户面板的开关：关掉退回贴底，再打开又撑满")
    ok(a["off_after_reload"] == ["bottom", 793, "off"], "开关关着的设定记在这台手机上，重开还是关着")

    a2 = run("A2 另一种：100vh 也够不着，系统真没把那条给网页", 793, 59, True, login=True)
    ok(a2["gap"] == "bottom" and a2["mist"] == "on" and a2["mist_splash"] == "on", "量出空一条、100vh 也够不着：门口和开屏页最底下淡出")
    ok(a2["html_h"] == 793 and a2["gate_h"] == 793 and a2["app_h"] == 793, "页面高度不硬补，就是网页够得着的那么高")
    ok(a2["composer"]["bottom"] == 793 and a2["composer"]["btn"] == 793 - 8, "输入框贴到网页最底边，按钮离底边只留 8")
    ok(a2["mist_chat"] == "off" and a2["mist_drawer"] == "off", "对话页和侧栏不盖淡出，按钮不发白")
    ok(near(a2["seam"], STRIP, 4), f"输入框底边和那条色块接得上（{a2['seam']} 对 {STRIP}）")
    ok(a2["drawer_row"]["bottom"] == 793 and a2["drawer_row"]["btn"] == 793 - 12, "侧栏最底下那排也沉下去")
    ok(a2["mist_sheet"] == "on", "弹出面板时照旧淡出")
    ok(a2["scroll_h"] <= 793 and a2["scroll_after"] == 0, "页面不会被拖着上下晃")
    ok(not a2["has_switch"] and not a["probe"] is None, "撑不满的手机上不摆开关")
    b = run("B 系统正常：页面本来就是整屏", 852, 59, True, login=True)
    ok(b["gap"] == "" and b["mist"] == "none" and b["gate_h"] == 852 and b["html_h"] == 852, "系统正常时不加淡出，照样整屏")
    ok(b["composer"]["bottom"] == 852 and b["composer"]["btn"] == 852 - 34, "系统正常时输入框铺到屏幕底，按钮让开底下横条")
    ok(b["drawer_row"]["btn"] == 852 - 34, "系统正常时侧栏最底下那排也让开横条")
    c_ = run("C 苹果那个毛病：状态栏是实心条", 793, 0, True)
    ok(c_["gap"] == "" and c_["mist"] == "none" and c_["gate_h"] == 793, "状态栏实心的情况不加")
    d = run("D 在 Safari 里打开", 793, 59, False)
    ok(d["gap"] == "" and d["mist"] == "none" and d["gate_h"] == 793, "在 Safari 里打开不加")
    browser.close()
print(f"\n通过 {passed}  失败 {failed}")
