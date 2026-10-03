# 手上的事：整页不许捏，连带着侧栏、长按只认一根手指。真的浏览器，用调试接口发真的触摸（不是鼠标装的）。
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

def phone(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    return ctx

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


SCENES = [("nopinch", nopinch), ("photo", photo)]
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
