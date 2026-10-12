# 并蒂莲：长按侧栏最上面那张日期卡片进去（卿卿 2026 年 10 月 12 日定的，那一页是项目外的 Claude 做的，她拿来放进开封府）。
#   光点卡片什么都不做；长按 0.45 秒，卡片最底下那行（纪念日）换成“去看并蒂莲 ›”（她挑的“B 藏在卡片里”），什么都不往外蹦；
#   卡片不跳（换的那一行一样高），这一行按得到的地方撑到卡片边上；别处落手指（连卡片上别的地方）、收起侧栏，都变回纪念日那行；
#   手指一挪、两根手指一起按，都不算长按（ui/press.js 本来的规矩）；
#   点“去看并蒂莲”：盖一层全屏的黑幕，里面一个框装着那一页，点进来的时候才去下载它；
#   配色跟着主题：青绿是青瓷，丁香是藕荷；在里面换了配色，下回进来还是照主题；
#   状态栏、底下横条要让开多高，由开封府写进框里（框里自己量不到）；
#   框里的起名框拿到焦点、键盘弹起来：整层铺到键盘上面，起名框露在键盘上头；
#   那一页不许联网（它自己的安全规矩）；
#   左上角一个叉：整层拆掉，框不在了，回到侧栏。
# 另照 tests/fullscreen.py 的办法装成主屏幕上底下空一条的两种手机各走一趟：
#   够不着的（"bottom"）：底下那层淡出不盖到花上，网页底色是黑的，起名框贴着框底；
#   撑满的（"fill"，她的手机）：在框里的起名框打字时，整页被挪了不跟 iOS 拧着挪回去；键盘收起来再挪回顶上。
# 真的浏览器、假 Supabase。账号是编的。花要用 WebGL 画，这台机器没有显卡，用 SwiftShader 软着画（慢，所以入场动画调快了）。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_lotus.py
# 要截图给人看：KFS_SHOTS=某个文件夹 python3 tests/e2e_lotus.py
import os, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SHOTS = os.environ.get("KFS_SHOTS", "")
ARGS = ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# 假的“可视区”，只装在开封府那一层（框里那一页用它自己的）：浏览器里弹不出 iPhone 的键盘，用它假装键盘弹起来
FAKE_KEYBOARD = """(() => {
  if (window.top !== window) return;
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
# 每一层（开封府和框里那一页）各记自己没接住的错
CATCH = "window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message)));"

# 卡片最底下那一行眼下是什么：纪念日那行，还是“去看并蒂莲”那一行（门）；卡片多高；门按得到的地方、字落在哪儿
CARD = """() => { const c = document.querySelector('.kfs-days'), cr = c.getBoundingClientRect(), last = c.lastElementChild, door = c.querySelector('.kfs-lotus-door');
  const r = document.createRange(); r.selectNodeContents(last.firstChild || last); const t = r.getBoundingClientRect();
  const cs = getComputedStyle(last);
  return { door: !!door, text: last.textContent.trim(), svgs: last.querySelectorAll('svg').length, cardH: cr.height, textTop: t.top - cr.top, textLeft: t.left - cr.left,
    hit: door ? [door.getBoundingClientRect().left - cr.left, cr.right - door.getBoundingClientRect().right, cr.bottom - door.getBoundingClientRect().bottom] : null,
    serif: /Songti|STSong|Serif/i.test(cs.fontFamily), dim: !!document.querySelector('.kfs-days-menu'), chat: document.documentElement.hasAttribute('data-kfs-chat'),
    fixed: [...document.querySelectorAll('.absolute.inset-0.z-50')].length }; }"""
LAYER = """() => { const l = document.querySelector('.kfs-lotus'); if (!l) return null; const r = l.getBoundingClientRect(), f = l.querySelector('iframe');
  const x = l.querySelector('.kfs-lotus-close').getBoundingClientRect(), hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
  return { rect: [r.left, r.top, r.width, r.height], frames: document.querySelectorAll('iframe').length, src: f.getAttribute('src'), z: getComputedStyle(l).zIndex,
    center: document.elementFromPoint(innerWidth / 2, innerHeight / 2) === f, close: [x.left, x.top, x.width, x.height], closeOnTop: !!hit && !!hit.closest('.kfs-lotus-close'),
    chat: document.documentElement.hasAttribute('data-kfs-chat') }; }"""
CARD_ON_TOP = """() => { const c = document.querySelector('.kfs-days'), r = c.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && c.contains(top); }"""
INSIDE = """() => { const cs = getComputedStyle(document.documentElement), inp = document.getElementById('nameInput').getBoundingClientRect();
  return { ready: document.body.classList.contains('ready'), accent: cs.getPropertyValue('--accent').trim(), safeT: cs.getPropertyValue('--safe-t').trim(),
    safeB: cs.getPropertyValue('--safe-b').trim(), h: innerHeight, inputBottom: inp.bottom, particles: window.LOTUS ? LOTUS.stats().particles : 0, errs: window.__errs || [] }; }"""

def lotus_frame(pg, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        for f in pg.frames:
            if "/assets/lotus-" in f.url:
                return f
        time.sleep(0.1)
    return None

def touch(cdp, kind, pts):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})

def card_center(pg):
    b = pg.locator(".kfs-days").bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

def no_door_after(pg, act):
    act(); time.sleep(0.9)
    return pg.locator(".kfs-lotus-door").count() == 0 and pg.locator(".kfs-lotus").count() == 0

# 点那一行要用手指点（tap）：长按那一回把 useLongPress 记成“刚长按过”，紧接着的鼠标点击会被它吞掉；手指落下时才把这一笔清掉（真手机上都是手指）
def door(pg):
    long_press(pg, pg.locator(".kfs-days"))
    return pg.locator(".kfs-lotus-door")

# 截图用：软着画太慢，那一页会自己一档一档降画质，截出来是糊的。截之前把画质钉回最高（只为截图，测的那些不靠它）
def sharp(f):
    if f: f.evaluate("Object.assign(LOTUS.quality, { level: 3, scale: 1, frac: 1 }); dispatchEvent(new Event('resize'))")

# 框里那一页等一个条件。不能用 wait_for_function：Playwright 拿字符串当条件时要 eval，那一页的安全规矩不许（正好说明规矩生效了）
def wait_frame(f, expr, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if f.evaluate(expr):
                return True
        except Exception:
            pass
        time.sleep(0.2)
    return False

def open_lotus(pg):
    door(pg).tap()
    pg.locator(".kfs-lotus").wait_for(timeout=5000)
    f = lotus_frame(pg)
    if f:
        wait_frame(f, "document.body.classList.contains('ready')")
        f.evaluate("LOTUS.CONFIG.introDuration = 0.25")   # 软着画一帧要大半秒，入场那 3.6 秒照原样走要等一分钟
        wait_frame(f, "LOTUS.stats().intro >= 1")
        time.sleep(0.6)
    return f

def run(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB); ctx.add_init_script(FAKE_KEYBOARD); ctx.add_init_script(CATCH)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    asked = []
    pg.on("request", lambda r: "/assets/lotus-" in r.url and asked.append(r.url))
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 59, "bottom": 34, "left": 0, "right": 0}})
    first_time(pg)
    pg.get_by_role("button", name="打开侧栏").click(); time.sleep(0.7)
    ok(not asked, f"开门、拉开侧栏，都没去下载并蒂莲那一页（{asked}）")

    # ---- 光点、挪手指、两根手指：都不算 ----
    before = pg.evaluate(CARD)
    ok(no_door_after(pg, lambda: pg.locator(".kfs-days").tap()), "光点日期卡片：什么都不变")
    x, y = card_center(pg)
    def slide():
        touch(cdp, "touchStart", [(x, y)]); time.sleep(0.05)
        touch(cdp, "touchMove", [(x, y + 20)]); time.sleep(0.7)
        touch(cdp, "touchEnd", [])
    ok(no_door_after(pg, slide), "按着卡片手指挪开了：不算长按，那一行不换")
    def two():
        touch(cdp, "touchStart", [(x - 40, y), (x + 40, y)]); time.sleep(0.7)
        touch(cdp, "touchEnd", [])
    ok(no_door_after(pg, two), "两根手指一起按住卡片：不算长按，那一行不换")

    # ---- 长按：卡片最底下那行换成“去看并蒂莲” ----
    ok(not before["door"] and (before["text"].startswith("离") or before["text"].startswith("今天是")), f"平常卡片最底下是纪念日那行（{before['text']}）")
    door(pg); time.sleep(0.4)
    d = pg.evaluate(CARD)
    ok(d["door"] and d["text"] == "去看并蒂莲" and d["svgs"] == 1 and d["serif"],
       f"长按卡片：最底下那行换成“去看并蒂莲 ›”，宋体，后面一个小箭头（{d['text']}，箭头 {d['svgs']}）")
    ok(abs(d["cardH"] - before["cardH"]) < 0.5 and abs(d["textTop"] - before["textTop"]) < 2 and abs(d["textLeft"] - before["textLeft"]) < 0.5,
       f"卡片不跳：一样高（{before['cardH']} → {d['cardH']}），字落在纪念日那行原来的地方（上下差 {round(d['textTop'] - before['textTop'], 2)}）")
    ok(bool(d["hit"]) and all(0 <= v <= 1.5 for v in d["hit"]), f"这一行按得到的地方撑到卡片左右两边和底边（离边 {d['hit']}，差的那 1 是卡片的边框）")
    ok(not d["dim"] and d["fixed"] == 0 and d["chat"], "什么都不往外蹦：没有小菜单、没有遮罩，侧栏不压暗")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "1-长按以后.png"))
    # 别处落手指：卡片上别的地方（那个大数字）
    num = pg.locator(".kfs-days span").nth(1).bounding_box()
    pg.touchscreen.tap(num["x"] + num["width"] / 2, num["y"] + num["height"] / 2); time.sleep(0.6)
    back = pg.evaluate(CARD)
    ok(not back["door"] and back["text"] == before["text"] and pg.locator(".kfs-lotus").count() == 0 and not asked,
       f"点卡片上别的地方：变回纪念日那行（{back['text']}），哪儿也没进，也没去下载")
    door(pg); time.sleep(0.3)
    t = pg.get_by_text("开封府", exact=True).first.bounding_box()
    pg.touchscreen.tap(t["x"] + t["width"] / 2, t["y"] + t["height"] / 2); time.sleep(0.6)
    ok(not pg.evaluate(CARD)["door"], "点卡片外头（侧栏顶上的“开封府”）：也变回去")
    door(pg); time.sleep(0.3)
    pg.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.8)        # 点露出来的那一条，侧栏收起
    pg.get_by_role("button", name="打开侧栏").click(); time.sleep(0.8)
    ok(not pg.evaluate(CARD)["door"] and pg.evaluate(CARD_ON_TOP), "收起侧栏再拉开：变回纪念日那行")

    # ---- 进去：青绿配青瓷 ----
    f = open_lotus(pg)
    lay = pg.evaluate(LAYER)
    ok(bool(lay) and lay["rect"] == [0, 0, 393, 852] and lay["frames"] == 1 and lay["center"] and lay["z"] == "60",
       f"点“去看并蒂莲”：盖一层整屏的黑幕，里面一个框，压在最上面（{lay and lay['rect']}，层高 {lay and lay['z']}）")
    ok(len(asked) == 1 and bool(lay) and "palette=celadon" in lay["src"], f"这时候才去下载那一页，下了一回；青绿主题带着青瓷去（{lay and lay['src']}）")
    bg = pg.evaluate("[getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor]")
    ok(bg == ["rgb(0, 0, 0)", "rgb(0, 0, 0)"], f"开着的时候网页底色换成黑的（底下空一条的手机上，系统画的那条跟着变黑）（{bg}）")
    ok(bool(lay) and lay["close"] == [12, 69, 38, 38] and lay["closeOnTop"] and lay["chat"],
       f"左上角的叉在状态栏底下（{lay and lay['close']}），压在框上面点得着；底下那层淡出照旧退着（data-kfs-chat 还挂着）")
    ins = f.evaluate(INSIDE) if f else {}
    ok(bool(ins) and ins["ready"] and ins["particles"] == 62436 and ins["accent"] == "#8fbfb4",
       f"框里那一页画出来了：62436 颗粒子，配色是青瓷（{ins.get('particles')}，{ins.get('accent')}）")
    ok(bool(ins) and ins["safeT"] == "59px" and ins["safeB"] == "34px" and ins["inputBottom"] <= ins["h"] - 34 - 16 + 0.5,
       f"状态栏、底下横条的高度写进了框里（{ins.get('safeT')}、{ins.get('safeB')}），起名框让开了横条（底边 {ins.get('inputBottom')}）")
    blocked = f.evaluate("fetch('/').then(() => 'got', () => 'blocked')") if f else ""
    ok(blocked == "blocked", f"那一页不许联网：它要连开封府自己的网址也被拦下（{blocked}）")

    # 手指划过花：框里接得到手指（隔着开封府那一层）
    scattered = 0
    if f:
        cx, cy, _ = f.evaluate("LOTUS.project(0, 4.72, 0)")
        for dx in (-90, 90, -60, 60, -120, 120, -30, 30):
            touch(cdp, "touchStart", [(cx + dx, cy)])
            if f.evaluate("LOTUS.stats().mode") == "scatter":
                for i in range(1, 16):
                    touch(cdp, "touchMove", [(cx + dx + i * 6, cy + (i % 3) * 3)]); time.sleep(0.04)
                touch(cdp, "touchEnd", []); time.sleep(0.3)
                scattered = f.evaluate("LOTUS.stats().scattered")
                break
            touch(cdp, "touchEnd", []); time.sleep(0.45)
    ok(scattered > 0, f"手指划过花：粒子被拨散了（{scattered} 颗），框里接得到手指")
    if SHOTS:
        sharp(f); time.sleep(8); pg.screenshot(path=os.path.join(SHOTS, "2-青绿进来是青瓷.png"))

    # ---- 起名框：键盘弹起来铺到键盘上面 ----
    if f:
        f.locator("#nameInput").focus(); time.sleep(0.2)
        pg.evaluate("window.__kfsKeyboard(500, 0)"); time.sleep(0.8)
        kb = pg.evaluate("() => ({ open: document.documentElement.hasAttribute('data-kfs-kb'), bottom: document.querySelector('.kfs-lotus').getBoundingClientRect().bottom })")
        ins = f.evaluate(INSIDE)
        ok(kb["open"] and kb["bottom"] == 500 and ins["h"] == 500 and ins["safeB"] == "0px" and ins["inputBottom"] <= 500 - 16 + 0.5,
           f"框里的起名框拿到焦点、键盘弹起来：整层铺到键盘上面（底边 {kb['bottom']}），起名框露在键盘上头（{ins['inputBottom']}），不再给横条让位（{ins['safeB']}）")
        f.locator("#nameInput").fill("卿卿"); time.sleep(0.6)
        named = pg.evaluate("localStorage.getItem('lotus.name')")
        f.evaluate("document.activeElement.blur()"); pg.evaluate("window.__kfsKeyboard(null, 0)"); time.sleep(0.8)
        kb = pg.evaluate("() => ({ open: document.documentElement.hasAttribute('data-kfs-kb'), bottom: document.querySelector('.kfs-lotus').getBoundingClientRect().bottom })")
        ins = f.evaluate(INSIDE)
        ok(named == "卿卿" and not kb["open"] and kb["bottom"] == 852 and ins["safeB"] == "34px",
           f"起好名字记住了（{named}）；键盘收起：整层回到整屏（{kb['bottom']}），又给横条让位（{ins['safeB']}）")
        # 在里面换个配色，看下回进来是不是还照主题
        f.evaluate("LOTUS.setPalette(0)"); time.sleep(0.3)
        errs = f.evaluate("window.__errs")
        ok(not errs, f"框里那一页没有报错（{errs}）")

    # ---- 叉：整层拆掉 ----
    pg.locator(".kfs-lotus-close").click(); time.sleep(0.6)
    ok(pg.locator(".kfs-lotus").count() == 0 and pg.locator("iframe").count() == 0 and lotus_frame(pg, 1) is None and pg.evaluate(CARD_ON_TOP),
       "点叉：整层拆掉，框也不在了，回到侧栏，日期卡片点得着")
    bg = pg.evaluate("[getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor, document.documentElement.style.backgroundColor, document.body.style.backgroundColor]")
    ok(bg[0] == bg[1] == "rgb(214, 220, 205)" and bg[2] == bg[3] == "", f"网页底色换回青绿原来的那个（{bg}）")

    # ---- 换成丁香：藕荷；里面换过的配色不算数 ----
    pg.get_by_role("button", name="头像与设置").click(); time.sleep(0.6)
    pg.get_by_role("button", name="丁香主题").click(); time.sleep(0.5)
    pg.get_by_role("button", name="关闭").click(); time.sleep(0.6)
    f = open_lotus(pg)
    lay = pg.evaluate(LAYER)
    ins = f.evaluate(INSIDE) if f else {}
    ok(bool(lay) and "palette=mauve" in lay["src"] and ins.get("accent") == "#a99bd0" and pg.evaluate("localStorage.getItem('lotus.palette')") == "2",
       f"换成丁香再进来：带着藕荷去，上回在里面换的配色不算数（{lay and lay['src']}，{ins.get('accent')}）")
    ok(f.evaluate("document.getElementById('nameInput').value") == "卿卿" if f else False, "上回起的名字还在")
    if SHOTS:
        sharp(f); time.sleep(8); pg.screenshot(path=os.path.join(SHOTS, "3-丁香进来是藕荷.png"))
    pg.locator(".kfs-lotus-close").click(); time.sleep(0.6)
    ok(pg.locator(".kfs-lotus").count() == 0 and pg.locator("iframe").count() == 0 and pg.evaluate(CARD_ON_TOP), "再点叉：照样拆干净，回到侧栏")
    top_errs = pg.evaluate("window.__errs")
    ok(not top_errs, f"开封府这一层没有报错（{top_errs}）")
    ctx.close()


STANDALONE = "Object.defineProperty(Navigator.prototype, 'standalone', { get() { return true; } });"
MIST = "(() => { const m = document.querySelector('.kfs-bottom-mist'), s = getComputedStyle(m); return { display: s.display, opacity: s.opacity }; })()"

def run_gap(browser, mode):
    mock("/__debug/reset")
    c = browser.new_context(viewport={"width": 393, "height": 793}, screen={"width": 393, "height": 852},
                            device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN", timezone_id="Europe/Dublin")
    c.add_init_script(STUB); c.add_init_script(STANDALONE); c.add_init_script(FAKE_KEYBOARD); c.add_init_script(CATCH)
    # 浏览器里没法真的让 100vh 比网页高：照 fullscreen.py 告诉它 100vh 量出来是多少（852 撑得满，793 够不着）
    c.add_init_script(f"window.__KFS_TEST_VH__ = {852 if mode == 'fill' else 793};")
    pg = c.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    cdp = c.new_cdp_session(pg)
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 59, "bottom": 34, "left": 0, "right": 0}})
    first_time(pg)
    gap = pg.evaluate("document.documentElement.getAttribute('data-kfs-gap') || ''")
    ok(gap == mode, f"[{mode}] 装成了这一种（{gap}）")
    pg.get_by_role("button", name="打开侧栏").click(); time.sleep(0.7)
    f = open_lotus(pg)
    if not f:
        ok(False, f"[{mode}] 并蒂莲没打开"); c.close(); return
    ins = f.evaluate(INSIDE)
    if mode == "bottom":
        mist = pg.evaluate(MIST)
        bg = pg.evaluate("getComputedStyle(document.documentElement).backgroundColor")
        ok(mist["display"] == "block" and mist["opacity"] == "0" and bg == "rgb(0, 0, 0)",
           f"[bottom] 底下那层淡出退着，不盖到花上（{mist}）；网页底色是黑的，系统画的那条跟着黑（{bg}）")
        ok(ins["safeB"] == "0px" and ins["h"] == 793 and ins["inputBottom"] <= 793 - 16 + 0.5,
           f"[bottom] 网页够不着横条，不再让位（{ins['safeB']}）；起名框贴着框底（{ins['inputBottom']}，框高 {ins['h']}）")
    else:
        f.locator("#nameInput").focus(); time.sleep(0.2)
        pg.evaluate("window.__kfsKeyboard(500, 0)"); time.sleep(0.6)
        pg.evaluate("window.scrollTo(0, 40)"); time.sleep(0.5)
        held = pg.evaluate("window.scrollY")
        f.evaluate("document.activeElement.blur()"); pg.evaluate("window.__kfsKeyboard(null, 0)"); time.sleep(0.8)
        back = pg.evaluate("window.scrollY")
        ok(held == 40 and back == 0, f"[fill] 在框里的起名框打字时整页被挪了（40）：不跟着挪回去（{held}）；键盘收起来，挪回顶上（{back}）")
    pg.locator(".kfs-lotus-close").click(); time.sleep(0.6)
    ok(pg.locator(".kfs-lotus").count() == 0 and pg.evaluate(CARD_ON_TOP), f"[{mode}] 点叉，回到侧栏")
    top_errs = pg.evaluate("window.__errs")
    ok(not top_errs, f"[{mode}] 开封府这一层没有报错（{top_errs}）")
    c.close()


if __name__ == "__main__":
    with sync_playwright() as p:
        mock("/__debug/reset")
        browser = p.chromium.launch(executable_path=CHROME, args=ARGS) if CHROME else p.chromium.launch(args=ARGS)
        try:
            run(browser)
            run_gap(browser, "bottom")
            run_gap(browser, "fill")
        finally:
            browser.close()
    print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
    print(f"\n通过 {count['passed']}  失败 {count['failed']}")
    raise SystemExit(1 if count["failed"] or errors else 0)
