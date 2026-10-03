# 手上的事：整页不许捏（连带着侧栏、长按只认一根手指）；聊天记录怎么滚（不拽、回到最新的圆钮、点上面回顶）；点横幅回来到底。
# 真的浏览器，用调试接口发真的触摸（不是鼠标装的）。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_gesture.py
# 每一段从头来过；只想跑其中几段就把名字写在后面：python3 tests/e2e_gesture.py photo
# KFS_SHOTS=某个目录：顺手存几张截图
#
# 这里跑的是 Chrome，不是她手机上的 Safari：三道拦没拦上、手指的事接没接对，这里验得了；
# iPhone 到底捏不捏得动，只有她的手机说了算（两边在 touch-action 上还不一样，见开发说明）。
import io, json, os, re, sys, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
from mailkit import *

SHOTS = os.environ.get("KFS_SHOTS", "")
errors = []

def page_of(ctx, tag):
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(tag + ": " + str(e)))
    return page

def phone(browser, notify=False):
    ctx = browser.new_context(**IPHONE)
    if notify:
        ctx.grant_permissions(["notifications"], origin=BASE.rstrip("/"))
    ctx.add_init_script(STUB)
    return ctx

# Chrome 有个本事叫“滚动锚定”：里面的东西变高变矮的时候，它自己把位置挪一挪，让眼前那几行不动。
# iPhone 上的 WebKit 到 iOS 26 为止没有（WebKit Bug 298514，2026 年 3 月才修进去）。聊天记录怎么滚的那几段照没有它的样子跑，
# 不然有的毛病在 Chrome 里被它盖住了，试不出来（打长草稿的时候输入框把聊天记录顶歪那一样就是）
# KFS_ANCHOR=1：留着它跑一遍（iOS 27 起 WebKit 也有了），两种都得过
NO_ANCHOR = "html { --kfs-test-anchor: on; }" if os.environ.get("KFS_ANCHOR") else "html, html * { overflow-anchor: none !important; }"

def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=f"{SHOTS}/{name}.png")

# 手指。pts 是 [(编号, x, y), …]：这会儿屏幕上所有的手指
class Fingers:
    def __init__(self, page):
        self.page = page
        self.cdp = page.context.new_cdp_session(page)
    def _send(self, kind, pts):
        self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, x, y in pts]})
        self.page.wait_for_timeout(16)
    def down(self, pts):
        self._send("touchStart", pts)
    def move(self, pts):
        self._send("touchMove", pts)
    def up(self):
        self._send("touchEnd", [])
    # 被系统打断（来电话、下拉通知那种）
    def cancel(self):
        self._send("touchCancel", [])
    # 从 a 挪到 b（两组手指一一对应），分几步走
    def glide(self, a, b, steps=10):
        for k in range(1, steps + 1):
            t = k / steps
            self.move([(i, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) for (i, x0, y0), (_, x1, y1) in zip(a, b)])
    def close(self):
        self.cdp.detach()

# 一张编的照片
def fake_photo(w=900, h=1200):
    im = Image.new("RGB", (w, h), (236, 228, 240))
    d = ImageDraw.Draw(im)
    for k, r in enumerate(range(380, 20, -60)):
        d.ellipse([w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r], outline=(150 + k * 12, 120 + k * 10, 200 - k * 8), width=6)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()

SCALE = "window.visualViewport ? window.visualViewport.scale : 1"
# 对话窗被侧栏推出去多远
SHIFT = "(() => { const m = getComputedStyle(document.querySelector('.kfs-chat-scroll').parentElement).transform.match(/-?[\\d.]+/g); return m ? Math.round(Number(m[4])) : 0; })()"
LIST = "document.querySelector('.kfs-chat-scroll')"


# 在门口（还没登录的那一页）两根手指往外拉一回，回手里和松手以后整页的倍数
def spread_at_gate(page):
    page.goto(BASE)
    page.get_by_text("进门先报上名来").wait_for(timeout=15000)
    page.wait_for_timeout(300)
    f = Fingers(page)
    p0, p1 = [(0, 166, 300), (1, 226, 300)], [(0, 70, 300), (1, 322, 300)]
    f.down(p0); f.glide(p0, p1, 12)
    mid = page.evaluate(SCALE)
    f.up(); page.wait_for_timeout(400); f.close()
    return mid, page.evaluate(SCALE)

# ---------- 整页不许捏 ----------
def nopinch(browser):
    # 对照：另开一台，把头两道在半路上换掉（网页开头那行换回原来的、样式里那条换成“随便”），同一只手在门口一拉，整页得放大。
    # 不然下面那几条“拉不动”说明不了什么（这只手可能根本没使上劲）。浏览器只在网页打开的时候认那一行，所以得换着打开，不能开着改
    L = phone(browser)
    def loosen(route):
        r = route.fetch()
        body = r.text()
        body = body.replace(", minimum-scale=1, maximum-scale=1, user-scalable=no", "").replace("touch-action:pan-x pan-y", "touch-action:auto")
        route.fulfill(response=r, body=body)
    L.route(re.compile(r"^" + re.escape(BASE) + r"($|index\.html|assets/.*\.css)"), loosen)
    pl = page_of(L, "nopinch-loose")
    loose = spread_at_gate(pl)
    was = pl.evaluate("[document.querySelector('meta[name=viewport]').content, getComputedStyle(document.body).touchAction]")
    L.close()
    A = phone(browser)
    pa = page_of(A, "nopinch")
    tight = spread_at_gate(pa)
    ok("user-scalable" not in was[0] and was[1] == "auto" and loose[0] > 2 and loose[1] > 2 and tight == (1, 1),
       f"对照：头两道撤掉的那一台，在门口两根手指一拉，整页放大到 {loose[1]:.1f} 倍；正常的这一台，同一只手拉不动（{tight}）")
    first_time(pa)
    meta = pa.evaluate("document.querySelector('meta[name=viewport]').content")
    ok("user-scalable=no" in meta and "maximum-scale=1" in meta and "minimum-scale=1" in meta and "viewport-fit=cover" in meta and "width=device-width" in meta,
       f"头一道：网页开头写明不缩放，原来的“铺到刘海底下”也还在（{meta}）")
    ta = pa.evaluate("[getComputedStyle(document.documentElement).touchAction, getComputedStyle(document.body).touchAction]")
    ok(ta == ["pan-x pan-y", "pan-x pan-y"], f"第二道：整页只许上下左右滑（{ta}）")
    stopped = pa.evaluate("""['gesturestart', 'gesturechange'].map((t) => { const e = new Event(t, { bubbles: true, cancelable: true });
      (document.querySelector('textarea') || document.body).dispatchEvent(e); return e.defaultPrevented; })""")
    ok(stopped == [True, True], "第三道：Safari 报双指落下、在动，都拦掉了")

    # 聊上几句，让聊天记录长过一屏
    for i in range(6):
        chat(pa, f"第{i + 1}句")
    box = pa.evaluate(f"(() => {{ const r = {LIST}.getBoundingClientRect(); return {{ x: r.left + r.width / 2, y: r.top + r.height / 2 }}; }})()")
    # iPhone 的 WebKit 走到会滚的盒子就把 touch-action 重新算，所以会滚的盒子自己、它里面的东西、输入框，身上都得写着
    inside = pa.evaluate("""[...new Set(['.kfs-chat-scroll', '.kfs-chat-scroll .items-end', '.kfs-chat-scroll .items-end span', '.kfs-composer', 'textarea', '.kfs-side-scroll', '.kfs-his-name']
      .map((q) => { const e = document.querySelector(q); return e ? getComputedStyle(e).touchAction : 'missing:' + q; }))]""")
    scrollers = pa.evaluate("""[...document.querySelectorAll('*')].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY + getComputedStyle(e).overflowX))
      .map((e) => getComputedStyle(e).touchAction).filter((v) => v !== 'pan-x pan-y').length""")
    ok(inside == ["pan-x pan-y"] and scrollers == 0, f"第二道写在每个元素身上：聊天记录、气泡、输入框、侧栏里面都是“只许滑”，页面上会滚的盒子没有一个漏的（{inside}，漏 {scrollers} 个）")
    f = Fingers(pa)
    # 两根手指往外拉。没拦的时候（上线前的那一版）这么一拉，Chrome 里整页会放大到五倍：这几条在那一版上是过不了的
    slid = []   # 捏的工夫里对话窗被带着挪过没有（侧栏）
    def spread(x, y, a=30, b=126):
        p0, p1 = [(0, x - a, y), (1, x + a, y)], [(0, x - b, y), (1, x + b, y)]
        f.down(p0); f.glide(p0, p1, 12)
        mid = pa.evaluate(SCALE); slid.append(pa.evaluate(SHIFT))
        f.up(); pa.wait_for_timeout(400)
        slid.append(pa.evaluate(SHIFT))
        return mid, pa.evaluate(SCALE)
    ok(pa.evaluate(SCALE) == 1, "捏之前：整页是原样大小")
    ok(spread(box["x"], box["y"]) == (1, 1), "两根手指在聊天记录上往外拉：手里、松手以后，整页都不放大")
    # Chrome 里整页本来就缩不到比原样小（她手机上会缩到左上角去），这一条在这儿拦不住什么；留着是看页面有没有被挪动
    ok(spread(box["x"], box["y"], 126, 30) == (1, 1) and pa.evaluate("window.scrollX === 0 && window.scrollY === 0"), "往里捏：整页不缩小，也没被挪动")
    ok(slid == [0, 0, 0, 0] and not pa.evaluate(REACHABLE), f"两根手指捏的时候，侧栏不跟着出来（往里捏时头一根手指是往右走的，原来会被当成右划）（{slid}）")
    kb = pa.evaluate("(() => { const r = document.querySelector('.kfs-composer').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 24 }; })()")
    ok(spread(kb["x"], kb["y"]) == (1, 1), "在输入框那一块上往外拉：一样不动")
    bar = pa.evaluate("(() => { const r = document.querySelector('.kfs-his-name').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()")
    ok(spread(bar["x"], bar["y"]) == (1, 1), "在顶栏上往外拉：一样不动")
    slid.clear()

    # 两根手指不是一起落下的：头一根已经把侧栏带出来一截，第二根落下，这一回就不算划侧栏
    f.down([(0, 24, 420)]); f.glide([(0, 24, 420)], [(0, 150, 424)], 6)
    part = pa.evaluate(SHIFT)
    f.down([(0, 150, 424), (1, 300, 600)]); pa.wait_for_timeout(500)
    snapped = pa.evaluate(SHIFT)
    f.glide([(0, 150, 424), (1, 300, 600)], [(0, 260, 424), (1, 330, 600)], 6)
    still = pa.evaluate(SHIFT)
    f.up(); pa.wait_for_timeout(600)
    ok(part > 80 and snapped == 0 and still == 0 and pa.evaluate(SHIFT) == 0 and not pa.evaluate(REACHABLE), f"划侧栏划到一半（带出来 {part}）落下第二根手指：侧栏弹回去，接着怎么动都不出来")

    # 长按只认一根手指
    bubble = pa.locator(".kfs-chat-scroll .items-end span", has_text="收到：第6句").last
    bb = bubble.bounding_box()
    bx, by = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
    menu = lambda: pa.get_by_text("复制", exact=True).count() > 0
    f.down([(0, bx - 12, by), (1, bx + 12, by)]); pa.wait_for_timeout(750)
    two_same = menu()
    f.up(); pa.wait_for_timeout(300)
    f.down([(0, bx, by)]); pa.wait_for_timeout(120); f.down([(0, bx, by), (1, bx + 10, by + 2)]); pa.wait_for_timeout(700)
    two_later = menu()
    f.up(); pa.wait_for_timeout(300)
    f.down([(0, bx, by)]); pa.wait_for_timeout(120); f.down([(0, bx, by), (1, 60, 300)]); pa.wait_for_timeout(700)
    two_apart = menu()
    f.up(); pa.wait_for_timeout(300)
    ok(not two_same and not two_later and not two_apart and not menu(), "两根手指按在气泡上不动（一起落下、先后落下、另一根落在别处）：都不出长按的菜单")
    f.down([(0, bx, by)]); pa.wait_for_timeout(750)
    one = menu()
    # 菜单出来了，这根手指还没抬，接着往右划：底下的侧栏不跟着走
    f.glide([(0, bx, by)], [(0, bx + 170, by + 4)], 8)
    under_menu = pa.evaluate(SHIFT)
    f.up(); pa.wait_for_timeout(500)
    ok(one and under_menu == 0 and pa.evaluate(SHIFT) == 0, f"一根手指按住：菜单照出；手指不抬接着往右划，底下的侧栏不动（{under_menu}）")
    pa.mouse.click(196, 40); pa.wait_for_timeout(400)
    ok(not menu(), "点菜单外面：菜单收了")

    # 别的手上的事照旧
    top0 = pa.evaluate(f"{LIST}.scrollTop")
    room = pa.evaluate(f"{LIST}.scrollHeight - {LIST}.clientHeight")
    f.down([(0, box["x"], 420)]); f.glide([(0, box["x"], 420)], [(0, box["x"], 680)], 13); f.up()
    pa.wait_for_timeout(600)
    top1 = pa.evaluate(f"{LIST}.scrollTop")
    ok(room > 200 and top0 > 200 and top1 < top0 - 120, f"一根手指往下划：聊天记录照滚（{round(top0)} → {round(top1)}）")
    f.down([(0, 24, 420)]); f.glide([(0, 24, 420)], [(0, 300, 430)], 12); f.up()
    pa.wait_for_timeout(700)
    ok(pa.evaluate(REACHABLE), "一根手指往右划：侧栏照开")
    shot(pa, "nopinch")
    # 侧栏里的历史对话也是长按出菜单（另一处长按，共用同一个“数手指”）：两根手指不出，一根手指照出
    row = pa.locator(".kfs-history button").last.bounding_box()
    rx, ry = row["x"] + row["width"] / 2, row["y"] + row["height"] / 2
    rename = lambda: pa.get_by_text("重命名", exact=True).count() > 0
    f.down([(0, rx - 30, ry), (1, rx + 30, ry)]); pa.wait_for_timeout(750)
    two = rename()
    f.up(); pa.wait_for_timeout(300)
    f.down([(0, rx, ry)]); pa.wait_for_timeout(750)
    one = rename()
    f.up(); pa.wait_for_timeout(300); f.close()
    ok(not two and one, "历史对话那一行：两根手指按着不出菜单，一根手指按住照出")
    A.close()


# ---------- 点开的照片：照旧点一下关掉；在它上面捏，整页也不动 ----------
# （照片自己不放大：写过一版双指缩放，卿卿说不用，撤了，见开发说明）
def photo(browser):
    A = phone(browser)
    pa = page_of(A, "photo")
    first_time(pa)
    pa.locator("input[type=file][accept*='image']").set_input_files({"name": "编的照片.png", "mimeType": "image/png", "buffer": fake_photo()})
    pa.locator(".kfs-composer img").first.wait_for(timeout=10000)
    pa.get_by_role("button", name="发送", exact=True).click()
    pic = pa.locator(".kfs-chat-scroll img.kfs-photo")
    pic.first.wait_for(timeout=10000)
    wait_js(pa, "!(" + TYPING + ")", 25000); pa.wait_for_timeout(2500)
    wait_js(pa, "!(" + TYPING + ")", 25000); pa.wait_for_timeout(800)

    BOXOF = """(() => { const st = document.querySelector('.kfs-viewer'); if (!st) return null; const r = st.getBoundingClientRect(); const b = st.querySelector('img').getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, W: r.width, H: r.height, w: b.width, h: b.height, left: b.left, top: b.top }; })()"""
    pic.last.tap(); pa.wait_for_timeout(600)
    v = pa.evaluate(BOXOF)
    ok(v is not None and v["w"] <= v["W"] * 0.92 + 1 and v["h"] <= v["H"] * 0.86 + 1 and v["w"] > 200, "点一下照片：打开了，整张都在屏幕里")
    shot(pa, "photo-open")
    f = Fingers(pa)
    cx, cy = v["cx"], v["cy"]
    p0, p1 = [(0, cx - 40, cy), (1, cx + 40, cy)], [(0, cx - 130, cy), (1, cx + 130, cy)]
    f.down(p0); f.glide(p0, p1, 12)
    mid = pa.evaluate(SCALE)
    f.up(); pa.wait_for_timeout(500)
    w = pa.evaluate(BOXOF)
    ok(mid == 1 and pa.evaluate(SCALE) == 1 and w is not None and abs(w["w"] - v["w"]) < 0.5 and abs(w["left"] - v["left"]) < 0.5 and abs(w["top"] - v["top"]) < 0.5,
       "在点开的照片上两根手指往外拉：整页不放大，照片不动，也没被关掉")
    f.down(p1); f.glide(p1, p0, 12); f.up(); pa.wait_for_timeout(500)
    ok(pa.evaluate(SCALE) == 1 and pa.locator(".kfs-viewer").count() == 1, "往里捏：一样不动，照片还开着")
    f.close()
    pa.touchscreen.tap(cx, cy); pa.wait_for_timeout(500)
    ok(pa.locator(".kfs-viewer").count() == 0, "点一下：关掉（和原来一样）")
    A.close()


# ---------- 聊天记录怎么滚：不拽、回到最新的圆钮、点上面回顶、系统自带的滚动条 ----------
GAP = "(() => { const e = document.querySelector('.kfs-chat-scroll'); return Math.round(e.scrollHeight - e.clientHeight - e.scrollTop); })()"
TOP = "Math.round(document.querySelector('.kfs-chat-scroll').scrollTop)"
# 圆钮：出没出来、在哪
BTN = """(() => { const s = document.querySelector('.kfs-latest'); const c = getComputedStyle(s); const r = s.querySelector('button').getBoundingClientRect();
  const list = document.querySelector('.kfs-chat-scroll').getBoundingClientRect(); const comp = document.querySelector('.kfs-composer').getBoundingClientRect();
  const panel = document.querySelector('.kfs-sheet.overflow-y-auto'); const pt = panel ? panel.getBoundingClientRect().top : null;
  return { shown: c.visibility === 'visible' && Number(c.opacity) > 0.99 && c.pointerEvents === 'auto', hidden: c.visibility === 'hidden' && c.pointerEvents === 'none', cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height,
    bottom: r.bottom, listBottom: list.bottom, mid: list.left + list.width / 2, compTop: comp.top, panelTop: pt }; })()"""

# 一根手指在聊天记录上划：从 y0 到 y1，到了以后停一下再抬（不带惯性，停在哪就是哪）
def drag(page, f, y0, y1, x=196):
    f.down([(0, x, y0)]); f.glide([(0, x, y0)], [(0, x, y1)], 12)
    for _ in range(8):
        f.move([(0, x, y1)])
    f.up(); page.wait_for_timeout(350)

def scroll(browser):
    A = phone(browser)
    pa = page_of(A, "scroll")
    first_time(pa)
    pa.add_style_tag(content=NO_ANCHOR)
    for i in range(7):
        chat(pa, f"第{i + 1}句")
    f = Fingers(pa)
    b = pa.evaluate(BTN)
    ok(pa.evaluate(GAP) <= 1 and b["hidden"], f"聊完停在最底下：圆钮不出来（离底 {pa.evaluate(GAP)}）")

    # 往上翻：圆钮浮出来
    drag(pa, f, 400, 680)
    up1 = pa.evaluate(TOP)
    b = pa.evaluate(BTN)
    ok(pa.evaluate(GAP) > 200 and b["shown"], f"往上翻了一截：圆钮浮出来（离底 {pa.evaluate(GAP)}）")
    ok(abs(b["cx"] - b["mid"]) < 1 and abs(b["w"] - 38) < 0.5 and abs(b["h"] - 38) < 0.5 and abs((b["listBottom"] - b["bottom"]) - 10) < 1 and b["listBottom"] <= b["compTop"] + 0.5,
       f"圆钮在输入框正上方、左右居中，离输入框 {b['compTop'] - b['bottom']:.0f} 像素")
    shot(pa, "scroll-button")

    # 不拽：她翻着旧消息的时候，他的回话一条条蹦出来，画面不动
    say(pa, "翻着旧消息的时候你回你的")
    pa.wait_for_timeout(400)
    ok(pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "她自己发话：回到最底下，圆钮收了")
    drag(pa, f, 380, 700)
    held = pa.evaluate(TOP)
    seen_typing = wait_js(pa, TYPING, 15000)
    pa.get_by_text("收到：翻着旧消息的时候你回你的").last.wait_for(state="attached", timeout=20000)
    pa.get_by_text("第二条").nth(7).wait_for(state="attached", timeout=10000)
    wait_js(pa, "!(" + TYPING + ")", 15000); pa.wait_for_timeout(600)
    b = pa.evaluate(BTN)
    ok(seen_typing and abs(pa.evaluate(TOP) - held) <= 1 and pa.evaluate(GAP) > 300 and b["shown"], f"翻着旧消息的时候他回了两条：画面一点没动（{held} → {pa.evaluate(TOP)}），圆钮还在")

    # 点圆钮：滑回最底下
    pa.touchscreen.tap(b["cx"], b["cy"]); pa.wait_for_timeout(120)
    mid_gap = pa.evaluate(GAP)
    pa.wait_for_timeout(600)
    b = pa.evaluate(BTN)
    last = pa.evaluate("(() => { const all = [...document.querySelectorAll('.kfs-chat-scroll .items-end span')].filter((e) => e.textContent === '第二条'); const r = all[all.length - 1].getBoundingClientRect(); const l = document.querySelector('.kfs-chat-scroll').getBoundingClientRect(); return r.bottom <= l.bottom && r.top >= l.top; })()")
    ok(0 < mid_gap and pa.evaluate(GAP) <= 1 and b["hidden"] and last, f"点圆钮：滑回最底下（半路上离底还有 {mid_gap}），最新那条看得见，圆钮收了")

    # 在最底下的时候照旧跟着
    chat(pa, "在最底下的时候照旧跟着")
    ok(pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "在最底下的时候他回话：一条条跟到底，和原来一样")

    # 点上面回顶
    bar = pa.evaluate("(() => { const r = document.querySelector('.kfs-bar-mid').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()")
    pa.touchscreen.tap(bar["x"], bar["y"]); pa.wait_for_timeout(700)
    b = pa.evaluate(BTN)
    ok(pa.evaluate(TOP) == 0 and b["shown"], "点顶栏中间（头像和名字）：滑回最顶，圆钮出来（好回来）")
    pa.touchscreen.tap(b["cx"], b["cy"]); pa.wait_for_timeout(700)
    ok(pa.evaluate(GAP) <= 1, "再点圆钮：回到最底下")
    strip = pa.evaluate("(() => { const r = document.querySelector('.kfs-top-strip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; })()")
    pa.touchscreen.tap(strip["x"], strip["y"]); pa.wait_for_timeout(700)
    ok(strip["h"] >= 12 and pa.evaluate(TOP) == 0, "点顶栏上面那一条（时间电量那儿）：也回最顶")
    pa.touchscreen.tap(pa.evaluate(BTN)["cx"], pa.evaluate(BTN)["cy"]); pa.wait_for_timeout(700)
    # 顶栏两头的按钮照旧，不把聊天记录带走
    pa.get_by_role("button", name="打开侧栏").tap(); pa.wait_for_timeout(700)
    opened = pa.evaluate(REACHABLE)
    pa.locator("div.absolute.inset-0.z-30").tap(); pa.wait_for_timeout(700)
    ok(opened and pa.evaluate(GAP) <= 1 and not pa.evaluate(REACHABLE), "点顶栏左边的按钮：照旧开侧栏，聊天记录没被带到顶上去")

    # 键盘弹出来：一下到底（她在翻旧消息也一样）。只认输入框的键盘：在弹出面板里打字的时候，后面的聊天记录不动
    drag(pa, f, 380, 700)
    away_gap = pa.evaluate(GAP)
    pa.evaluate("document.activeElement && document.activeElement.blur()")
    pa.evaluate("window.dispatchEvent(new CustomEvent('kfs-kb', { detail: { open: true } }))"); pa.wait_for_timeout(300)
    ok(away_gap > 200 and pa.evaluate(GAP) == away_gap and pa.evaluate(BTN)["shown"], "键盘是别处（弹出面板里的输入框）弹出来的：聊天记录不动")
    pa.evaluate("document.querySelector('.kfs-composer textarea').focus({ preventScroll: true })")
    pa.evaluate("window.dispatchEvent(new CustomEvent('kfs-kb', { detail: { open: true } }))"); pa.wait_for_timeout(300)
    ok(pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "输入框的键盘弹出来：一下到底")

    # 上面两条只发了个信号，盒子没动。这里照 keyboard.js 的办法真把外壳顶矮、再放回去（--kfs-kb-h），聊天记录的盒子跟着变
    KB = """(h) => { const r = document.documentElement; if (h) { r.style.setProperty('--kfs-kb-top', '0px'); r.style.setProperty('--kfs-kb-h', h + 'px'); }
      else { r.style.removeProperty('--kfs-kb-top'); r.style.removeProperty('--kfs-kb-h'); } }"""
    pa.evaluate("document.activeElement && document.activeElement.blur()")
    box0 = pa.evaluate(f"{LIST}.clientHeight")
    pa.evaluate(KB, 552); pa.wait_for_timeout(300)
    box1 = pa.evaluate(f"{LIST}.clientHeight")
    ok(box0 - box1 == 300 and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], f"在最底下的时候键盘把聊天记录的盒子顶矮了（{box0} → {box1}）：照旧贴着底")
    chat(pa, "键盘开着的时候你回")
    ok(pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "键盘开着的时候他回话：跟到底")
    pa.evaluate(KB, 0); pa.wait_for_timeout(300)
    ok(pa.evaluate(f"{LIST}.clientHeight") == box0 and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "键盘收了、盒子高回去：还在最底下")
    drag(pa, f, 380, 700)
    held = pa.evaluate(TOP)
    pa.evaluate(KB, 552); pa.wait_for_timeout(300)
    ok(pa.evaluate(TOP) == held and pa.evaluate(BTN)["shown"], "翻着旧消息的时候盒子被键盘顶矮：画面不动，圆钮还在")
    pa.evaluate(KB, 0); pa.wait_for_timeout(300)
    ok(pa.evaluate(TOP) == held and pa.evaluate(BTN)["shown"], "盒子高回去：画面也不动")
    b = pa.evaluate(BTN)
    pa.touchscreen.tap(b["cx"], b["cy"]); pa.wait_for_timeout(700)

    # 打长草稿：输入框跟着字数长高。量高度的那一下输入框先矮回一行、上面的聊天记录高了一截，浏览器把位置往回收；
    # 没有“滚动锚定”的浏览器（iPhone）不给放回来，原来每敲一个字聊天记录往下掉一截，四五行的时候还被当成她翻走了
    TA_H = "Math.round(document.querySelector('.kfs-composer textarea').getBoundingClientRect().height)"
    pa.get_by_placeholder("说话，我听着").click()
    for n in range(1, 6):
        pa.keyboard.type(f"草稿的第{n}行", delay=10); pa.keyboard.press("Shift+Enter")
    pa.keyboard.type("接着敲", delay=10); pa.wait_for_timeout(300)
    th = pa.evaluate(TA_H)
    ok(th >= 110 and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], f"草稿打到六行（输入框高 {th}）、一个字一个字敲：聊天记录一直贴着底，圆钮没出来")
    pa.keyboard.press("Enter")
    pa.get_by_text(re.compile("^收到：草稿的第1行")).last.wait_for(state="attached", timeout=20000)
    pa.get_by_text("第二条").last.wait_for(state="attached", timeout=10000)
    wait_js(pa, "!(" + TYPING + ")", 15000); pa.wait_for_timeout(900)
    ok(pa.evaluate(TA_H) < 50 and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "发出去：输入框矮回去，他的回话跟到底")

    # 输入框有焦点（键盘开着）的时候点圆钮、点顶栏：焦点不许被抢走，不然键盘就收了
    FOCUS = "document.activeElement === document.querySelector('.kfs-composer textarea')"
    pa.evaluate("document.querySelector('.kfs-composer textarea').focus({ preventScroll: true })")
    drag(pa, f, 380, 700)
    b = pa.evaluate(BTN)
    pa.touchscreen.tap(b["cx"], b["cy"]); pa.wait_for_timeout(700)
    ok(pa.evaluate(GAP) <= 1 and pa.evaluate(FOCUS), "输入框有焦点的时候点圆钮：回到底，焦点还在输入框上")
    pa.touchscreen.tap(bar["x"], bar["y"]); pa.wait_for_timeout(700)
    ok(pa.evaluate(TOP) == 0 and pa.evaluate(FOCUS), "点顶栏中间：回顶，焦点还在")
    pa.touchscreen.tap(pa.evaluate(BTN)["cx"], pa.evaluate(BTN)["cy"]); pa.wait_for_timeout(700)
    pa.touchscreen.tap(strip["x"], strip["y"]); pa.wait_for_timeout(700)
    ok(pa.evaluate(TOP) == 0 and pa.evaluate(FOCUS), "点顶栏上面那一条：回顶，焦点还在")
    pa.touchscreen.tap(pa.evaluate(BTN)["cx"], pa.evaluate(BTN)["cy"]); pa.wait_for_timeout(700)
    pa.evaluate("document.activeElement && document.activeElement.blur()")

    # 表情包面板：翻着的时候开，画面不动，圆钮挪到面板上面；在最底下的时候开，照旧贴着底
    drag(pa, f, 380, 700)
    t0 = pa.evaluate(TOP)
    pa.get_by_role("button", name="表情包").tap(); pa.wait_for_timeout(500)
    b = pa.evaluate(BTN)
    ok(pa.evaluate(TOP) == t0 and b["shown"] and b["panelTop"] is not None and b["bottom"] <= b["panelTop"] - 5, f"翻着旧消息的时候打开表情包面板：画面不动，圆钮在面板上面（隔 {b['panelTop'] - b['bottom']:.0f}）")
    shot(pa, "scroll-button-memes")
    # 面板开着的时候点顶栏：只收面板，不回顶
    pa.touchscreen.tap(bar["x"], bar["y"]); pa.wait_for_timeout(600)
    ok(pa.evaluate(TOP) == t0 and pa.locator(".kfs-sheet.overflow-y-auto").count() == 0, "表情包面板开着的时候点顶栏中间：只收面板，聊天记录不动")
    pa.get_by_role("button", name="表情包").tap(); pa.wait_for_timeout(500)
    pa.touchscreen.tap(strip["x"], strip["y"]); pa.wait_for_timeout(600)
    ok(pa.evaluate(TOP) == t0 and pa.locator(".kfs-sheet.overflow-y-auto").count() == 0, "点顶栏上面那一条：也只收面板")
    pa.get_by_role("button", name="表情包").tap(); pa.wait_for_timeout(500)
    b = pa.evaluate(BTN)
    pa.touchscreen.tap(b["cx"], b["cy"]); pa.wait_for_timeout(700)
    ok(pa.evaluate(GAP) <= 1, "面板开着点圆钮：照样回到最底下")
    pa.get_by_role("button", name="表情包").tap(); pa.wait_for_timeout(500)
    pa.get_by_role("button", name="表情包").tap(); pa.wait_for_timeout(500)
    ok(pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "在最底下的时候打开表情包面板：聊天记录照旧贴着底")
    pa.get_by_role("button", name="表情包").tap(); pa.wait_for_timeout(400)

    # 图片晚一步才加载出来（聊天记录变长了，可没人滚）：在最底下就跟到新的底，翻着旧消息就不动
    grow = """() => { const d = document.createElement('div'); d.style.height = '180px'; d.className = 'late'; document.querySelector('.kfs-chat-rows').appendChild(d); }"""
    pa.evaluate(grow); pa.wait_for_timeout(200)
    ok(pa.evaluate(GAP) <= 1, "在最底下的时候有图片晚到、把聊天记录撑长了：跟到新的底")
    drag(pa, f, 380, 700)
    t1 = pa.evaluate(TOP)
    pa.evaluate(grow); pa.wait_for_timeout(200)
    ok(pa.evaluate(TOP) == t1 and pa.evaluate(GAP) > 300, "翻着旧消息的时候有图片晚到：画面不动")
    pa.evaluate("document.querySelectorAll('.kfs-chat-scroll .late').forEach((e) => e.remove())"); pa.wait_for_timeout(200)
    b = pa.evaluate(BTN)
    pa.touchscreen.tap(b["cx"], b["cy"]); pa.wait_for_timeout(700)

    # 手指在最底下来回带着（一直有滚动在报），他的回话带着“思考过程”一起蹦出来：一路跟到底。
    # 头一版栽在这儿：蹦出一条长的、还没跟上的那一小会儿，手指报来一下滚动，就被当成她翻走了
    n2 = pa.get_by_text("第二条").count()
    say(pa, "手指动着的时候你回\n这一句有\n好几行\n思考过程也就长")
    f.down([(0, 196, 430)])
    hi, k, done_at = 0, 0, None
    t_end = time.time() + 14
    while time.time() < t_end:
        f.move([(0, 196, 430 + (36 if k % 2 == 0 else 0))]); k += 1
        hi = max(hi, pa.evaluate(GAP))
        if done_at is None and pa.get_by_text("第二条").count() > n2 and not pa.evaluate(TYPING):      # 这一回的最后一条蹦出来了
            done_at = time.time()
        if done_at and time.time() - done_at > 0.8:
            break
    f.move([(0, 196, 430)])
    for _ in range(6):
        f.move([(0, 196, 430)])
    f.up(); pa.wait_for_timeout(500)
    ok(done_at is not None and k > 20 and 5 < hi and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"] and pa.get_by_text(re.compile("^收到：手指动着的时候你回")).count() >= 1,
       f"手指在最底下来回带着（带了 {k} 回，最远离底 {hi}）、他回了三条带“思考过程”的：一路跟到底，圆钮没出来")

    # 她自己点开“思考过程”：聊天记录变高了，可那不是新话，刚点开的字不能被带走
    # 点的是那一行的头上（自己算位置点：点开以后那一块很高，让测试工具挑地方点的话，它会先把聊天记录滚一下）
    think = pa.get_by_role("button", name="思考过程").last
    tb = think.bounding_box()
    t_before = pa.evaluate(TOP)
    pa.touchscreen.tap(tb["x"] + 30, tb["y"] + 10); pa.wait_for_timeout(600)
    b = pa.evaluate(BTN)
    ok(pa.evaluate(TOP) == t_before and pa.evaluate(GAP) >= 64 and b["shown"], f"在最底下点开“思考过程”（长出来 {pa.evaluate(GAP)}）：画面不动，圆钮出来")
    shot(pa, "scroll-thinking")
    pa.touchscreen.tap(tb["x"] + 30, tb["y"] + 10); pa.wait_for_timeout(600)
    ok(pa.evaluate(TOP) == t_before and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "再点一下收起来：又在最底下了，圆钮收了")

    # 藏着的圆钮点不着：它底下的东西照常能点
    b = pa.evaluate(BTN)
    hit = pa.evaluate("([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !e.closest('.kfs-latest'); }", [b["cx"], b["cy"]])
    ok(b["hidden"] and hit, "圆钮藏着的时候：那个位置点到的是底下的聊天记录，不是它")

    # 翻着旧消息的时候点“重新回答”：新回答接在最后，到底等着看。
    # （这一条分不出 App.jsx 里那句 pin() 在不在：要点“重新回答”，那条回话得在眼前，离底也就一两百像素；
    #   旧回答一收，聊天记录矮了一截，她已经被浏览器收到底了。那句 pin() 是把话说死，留着）
    drag(pa, f, 430, 560)
    last_his = pa.get_by_text(re.compile("^收到：手指动着的时候你回")).last
    was_away = pa.evaluate(BTN)["shown"]
    last_his.click(button="right"); pa.wait_for_timeout(500)
    n0 = len(calls())
    pa.locator(".z-50 button", has_text="重新回答").tap()
    wait_mock(lambda: len(calls()) > n0, 15)
    wait_js(pa, TYPING, 8000); wait_js(pa, "!(" + TYPING + ")", 20000); pa.wait_for_timeout(900)
    ok(was_away and len(calls()) == n0 + 1 and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "翻着旧消息的时候点了重新回答：到底，新回答跟得上")

    # 聊天记录还带着惯性的时候点圆钮：先叫它停下（不许滚一小会儿），再滑。不先停的话，滑到了底又被惯性带走
    # （把“叫停”那几行去掉，这里就是离底几十上百像素、圆钮又冒出来）。
    # 圆钮是用程序点的：Chrome 里手指点一下带着惯性的东西，那一下只算“停”、不算点，点不着；
    # iPhone 上圆钮不在聊天记录里头，点得着，惯性照旧带着，正是要防的那种
    pa.evaluate("""() => { const l = document.querySelector('.kfs-chat-scroll'); window.__ov = [];
      new MutationObserver(() => window.__ov.push(l.style.overflowX + '/' + l.style.overflowY)).observe(l, { attributes: true, attributeFilter: ['style'] }); }""")
    # 等两帧看它是不是真的还在自己走，是的话马上点。点的那一下放在动画帧外头（真手指点下去就是这样）：
    # 放在动画帧里头点的话，“不许滚”当帧就画上了，只等一回动画帧就放开的写法也混得过去
    FLING_CLICK = """(sel) => new Promise((done) => { const l = document.querySelector('.kfs-chat-scroll'); const a = l.scrollTop;
      requestAnimationFrame(() => requestAnimationFrame(() => { const moved = Math.round(Math.abs(l.scrollTop - a));
        if (moved <= 5) { done(moved); return; }
        setTimeout(() => { document.querySelector(sel).click(); done(moved); }, 0); })); })"""
    # 快划一下，不停顿：带着惯性。机器忙的时候手指那几下发得不匀，划不出惯性来：回原处重划，最多三回
    def fling_click(y0, y1, sel, back):
        for _ in range(3):
            pa.evaluate("window.__ov.splice(0)")
            f.down([(0, 196, y0)]); f.glide([(0, 196, y0)], [(0, 196, y1)], 6); f.up()
            moved = pa.evaluate(FLING_CLICK, sel)
            if moved > 5:
                return moved
            pa.wait_for_timeout(400); back(); pa.wait_for_timeout(700)
        return 0
    moved = fling_click(300, 700, ".kfs-latest button", lambda: pa.touchscreen.tap(pa.evaluate(BTN)["cx"], pa.evaluate(BTN)["cy"]))
    pa.wait_for_timeout(1500)
    ov = pa.evaluate("window.__ov.splice(0)")
    ok(moved > 5 and ov == ["hidden/hidden", "/"] and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"] and pa.evaluate(f"getComputedStyle({LIST}).overflowY") == "auto",
       f"带着惯性的时候（两帧里自己走了 {moved} 像素）点圆钮：先不许它滚一小会儿（横竖都不许：{ov}），滑到底就停在底，没被惯性带走（离底 {pa.evaluate(GAP)}）")
    drag(pa, f, 380, 700)
    ok(pa.evaluate(GAP) > 200, "放开以后照常能滚")
    # 点上面回顶也一样：带着往下的惯性点顶栏，滑到顶就停在顶
    pa.touchscreen.tap(bar["x"], bar["y"]); pa.wait_for_timeout(700)
    moved = fling_click(650, 250, ".kfs-bar-mid", lambda: pa.touchscreen.tap(bar["x"], bar["y"]))
    pa.wait_for_timeout(1500)
    ov = pa.evaluate("window.__ov.splice(0)")
    ok(moved > 5 and ov == ["hidden/hidden", "/"] and pa.evaluate(TOP) == 0 and pa.evaluate(f"getComputedStyle({LIST}).overflowY") == "auto",
       f"带着惯性的时候（两帧里自己走了 {moved} 像素）点顶栏：一样先停再滑，停在最顶（{pa.evaluate(TOP)}）")
    b = pa.evaluate(BTN)
    pa.touchscreen.tap(b["cx"], b["cy"]); pa.wait_for_timeout(700)

    # 浏览器报“滚了一下”是晚一拍的：自己刚滚到底、紧接着蹦出一条长的，这时候才报来的那一下不能当成她翻的
    # （头一版栽在这儿：他的回话带着“思考过程”一起蹦出来的时候，偶尔就不跟了）
    late = pa.evaluate("""() => { const l = document.querySelector('.kfs-chat-scroll'); const d = document.createElement('div'); d.style.height = '220px'; d.className = 'late'; document.querySelector('.kfs-chat-rows').appendChild(d);
      l.dispatchEvent(new Event('scroll'));
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(Math.round(l.scrollHeight - l.clientHeight - l.scrollTop))))); }""")
    ok(late <= 1 and pa.evaluate(BTN)["hidden"], f"在最底下的时候蹦出一条长的、晚一拍报来一下“滚了”：照样跟到底（离底 {late}）")
    pa.evaluate("document.querySelectorAll('.kfs-chat-scroll .late').forEach((e) => e.remove())"); pa.wait_for_timeout(200)

    # 系统开了“减弱动态效果”：一下到，不滑
    pa.emulate_media(reduced_motion="reduce")
    drag(pa, f, 380, 700)
    b = pa.evaluate(BTN)
    pa.touchscreen.tap(b["cx"], b["cy"]); pa.wait_for_timeout(60)
    ok(pa.evaluate(GAP) <= 1, "系统开了“减弱动态效果”：点圆钮一下到底，不滑")
    pa.emulate_media(reduced_motion="no-preference")

    # 滚动条：聊天记录用系统自带的那根，别处照旧藏着
    bars = pa.evaluate("""[getComputedStyle(document.querySelector('.kfs-chat-scroll')).scrollbarWidth, getComputedStyle(document.querySelector('.kfs-side-scroll')).scrollbarWidth,
      matchMedia('(hover: hover) and (pointer: fine)').matches, [...document.styleSheets].some((sh) => { try { return [...sh.cssRules].some((r) => r.media && /hover: hover/.test(r.conditionText) && /kfs-chat-scroll/.test(r.cssText)); } catch (e) { return false; } })]""")
    ok(bars == ["auto", "none", False, True], f"手机上：聊天记录的滚动条不藏（系统自带的那根），侧栏的照旧藏着；用鼠标的地方有一条规矩把它藏回去（{bars}）")

    # 滑到一半她的手指落在聊天记录上：当场停下，听她的
    drag(pa, f, 380, 700); drag(pa, f, 380, 700)
    b = pa.evaluate(BTN); far = pa.evaluate(GAP)
    pa.touchscreen.tap(b["cx"], b["cy"])
    f.down([(0, 196, 300)]); pa.wait_for_timeout(250)
    stopped = pa.evaluate(GAP)
    f.up(); pa.wait_for_timeout(500)
    ok(far > 400 and 0 < stopped < far and abs(pa.evaluate(GAP) - stopped) <= 1 and pa.evaluate(BTN)["shown"], f"点了圆钮、滑到一半手指落在聊天记录上：当场停住（离底 {far} → {stopped}），圆钮还在")
    # 电脑上是滚轮：滑到一半滚轮一动，一样停下听她的
    b = pa.evaluate(BTN); far = pa.evaluate(GAP)
    pa.touchscreen.tap(b["cx"], b["cy"]); pa.wait_for_timeout(80)
    pa.mouse.move(196, 400); pa.mouse.wheel(0, -40); pa.wait_for_timeout(700)
    stopped = pa.evaluate(GAP)
    pa.wait_for_timeout(300)
    ok(far > 300 and 40 < stopped and abs(pa.evaluate(GAP) - stopped) <= 1 and pa.evaluate(BTN)["shown"], f"滑到一半滚轮动了一下：也当场停住（离底 {far} → {stopped}），没接着滑到底")

    # 翻着旧消息的时候改一句以前的话：改完那一句成了最后一句，他的回话要跟得上
    old = pa.get_by_text("第6句", exact=True)
    old.evaluate("(e) => e.scrollIntoView({ block: 'end' })"); pa.wait_for_timeout(300)
    was_away = pa.evaluate(BTN)["shown"]
    long_press(pa, old)
    if not pa.get_by_text("编辑", exact=True).count():        # 松手时测试工具补的那一下点击会落在遮罩上把菜单关掉（电脑上的浏览器才这样）：用右键再叫一次
        old.click(button="right"); pa.wait_for_timeout(500)
    pa.get_by_text("编辑", exact=True).tap(); pa.wait_for_timeout(300)
    pa.get_by_placeholder("说话，我听着").fill("第6句改过了")
    pa.get_by_role("button", name="发送修改").tap()
    pa.get_by_text("收到：第6句改过了").last.wait_for(state="attached", timeout=20000)
    wait_js(pa, "!(" + TYPING + ")", 15000); pa.wait_for_timeout(900)
    ok(was_away and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], "翻着旧消息的时候改了一句以前的话：改完到底，他的回话跟得上")

    # 换一段对话：从最底下看起，上一段翻到哪不带过来
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    say(pa, "\n".join(f"长长的一句的第{i}行" for i in range(1, 41)))
    pa.get_by_text("第二条").last.wait_for(state="attached", timeout=25000)
    wait_js(pa, "!(" + TYPING + ")", 15000); pa.wait_for_timeout(900)
    tall = pa.evaluate(f"{LIST}.scrollHeight - {LIST}.clientHeight")
    for _ in range(10):                      # 翻到离顶不远的地方（要比那一段对话能滚的长度小得多，不然换回去被浏览器一收也是底，试不出来）
        if pa.evaluate(TOP) < 250:
            break
        drag(pa, f, 300, 700)
    here = pa.evaluate(TOP)
    pa.get_by_role("button", name="打开侧栏").tap(); pa.wait_for_timeout(700)
    pa.locator(".kfs-history button", has_text="第1句").tap(); pa.wait_for_timeout(1200)
    if pa.evaluate(REACHABLE):
        pa.locator("div.absolute.inset-0.z-30").tap(); pa.wait_for_timeout(700)
    back = pa.evaluate(f"[{GAP}, {LIST}.scrollHeight - {LIST}.clientHeight, {TOP}]")
    ok(tall > 800 and pa.evaluate(TOP) > 0 and back[1] > here + 200 and back[0] <= 1 and pa.evaluate(BTN)["hidden"] and pa.get_by_text("收到：第6句改过了").count() > 0,
       f"在另一段长对话里翻到半截（{here}），换回这一段：从最底下看起（离底 {back[0]}），圆钮不出来")

    # 换到一段正好一样高的对话：什么都没变高变矮，量大小的那个不会报，全靠“对话变了”当场报的那一回
    pa.get_by_role("button", name="打开侧栏").tap(); pa.wait_for_timeout(700)
    pa.locator(".kfs-history button", has_text="长长的一句").first.tap(); pa.wait_for_timeout(1200)
    if pa.evaluate(REACHABLE):
        pa.locator("div.absolute.inset-0.z-30").tap(); pa.wait_for_timeout(700)
    h_b = pa.evaluate(f"{LIST}.scrollHeight")
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    say(pa, "\n".join(f"长长的一句的第{i}行" for i in range(1, 41)))
    pa.get_by_text("第二条").last.wait_for(state="attached", timeout=25000)
    wait_js(pa, "!(" + TYPING + ")", 15000); pa.wait_for_timeout(900)
    h_c = pa.evaluate(f"{LIST}.scrollHeight")
    for _ in range(10):
        if pa.evaluate(TOP) < 250:
            break
        drag(pa, f, 300, 700)
    here = pa.evaluate(TOP)
    pa.get_by_role("button", name="打开侧栏").tap(); pa.wait_for_timeout(700)
    twins = pa.locator(".kfs-history button", has_text="长长的一句")
    n_twins = twins.count()
    twins.nth(1).tap(); pa.wait_for_timeout(1200)
    if pa.evaluate(REACHABLE):
        pa.locator("div.absolute.inset-0.z-30").tap(); pa.wait_for_timeout(700)
    ok(n_twins == 2 and h_b == h_c and pa.evaluate(f"{LIST}.scrollHeight") == h_c and here < 250 and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"],
       f"在一段对话里翻到半截（{here}），换到另一段正好一样高的（{h_b} / {h_c}）：照样从最底下看起（离底 {pa.evaluate(GAP)}）")

    # 丁香主题下的样子（她用的是这个）
    open_panel(pa)
    pa.get_by_role("button", name="丁香主题").tap(); pa.wait_for_timeout(500)
    close_panel(pa)
    drag(pa, f, 380, 660)
    ok(pa.evaluate(BTN)["shown"] and pa.evaluate("document.documentElement.getAttribute('data-kfs-theme')") == "dingxiang", "换成丁香：圆钮照出")
    shot(pa, "scroll-button-dingxiang")
    f.close()
    A.close()


# ---------- 点横幅回来：那段对话本来就开着（她是翻着旧消息的时候切走的），也到底 ----------
def notice(browser):
    A = phone(browser, notify=True)
    pa = page_of(A, "notice")
    first_time(pa); enable_notifications(pa)
    pa.add_style_tag(content=NO_ANCHOR)
    say(pa, "\n".join(f"长长的一句的第{i}行" for i in range(1, 41)))
    pa.get_by_text("第二条").last.wait_for(state="attached", timeout=25000)
    wait_js(pa, "!(" + TYPING + ")", 15000); pa.wait_for_timeout(int(GRACE * 1000) + 500)
    f = Fingers(pa)
    b0 = len(banners())
    mock("/__debug/claude-hold?ms=2500")
    say(pa, "我先去忙了")
    sent = wait_mock(lambda: any(r["state"] == "working" for r in box()["rows"]), 8)
    drag(pa, f, 300, 700)                    # 发完往上翻旧消息
    held = pa.evaluate(TOP)
    was_away = pa.evaluate(BTN)["shown"] and pa.evaluate(GAP) > 300
    pa.evaluate("window.__away(true)")       # 切走了
    knocked = wait_mock(lambda: len(banners()) == b0 + 1, GRACE + 14)
    pa.wait_for_timeout(600)
    stayed = pa.evaluate(TOP)
    ok(sent and was_away and knocked and stayed == held, f"翻着旧消息的时候切走，他回了、横幅到了：她不在的时候画面没被挪（{held} → {stayed}）")
    nav = banners()[-1]["json"]["notification"]["navigate"]
    pa.evaluate("window.__away(false)")      # 点着横幅回来：系统把网址换成带记号的
    pa.evaluate("(mark) => { location.hash = mark; }", "#" + nav.split("#")[1])
    got = wait_js(pa, "(() => [...document.querySelectorAll('.items-end span')].some((e) => e.children.length === 0 && e.textContent === '收到：我先去忙了'))()", 15000)
    wait_js(pa, "location.hash === ''", 8000); pa.wait_for_timeout(1500)
    ok(got and pa.evaluate(GAP) <= 1 and pa.evaluate(BTN)["hidden"], f"点着横幅回来（那段对话本来就开着）：到底，那一条就在眼前（离底 {pa.evaluate(GAP)}）")
    f.close()
    A.close()


SCENES = [("nopinch", nopinch), ("photo", photo), ("scroll", scroll), ("notice", notice)]
want = [a for a in sys.argv[1:] if not a.startswith("-")]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    for name, scene in SCENES:
        if want and name not in want:
            continue
        mock("/__debug/reset")
        try:
            scene(browser)
        except SystemExit:
            raise
        except Exception as e:
            ok(False, f"{name}：走到一半出了岔子：{str(e)[:300]}")
    browser.close()

print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] or errors else 0)
