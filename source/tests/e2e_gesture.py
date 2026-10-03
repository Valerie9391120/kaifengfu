# 手上的事：整页不许捏、点开的照片双指缩放。真的浏览器，用调试接口发真的触摸（不是鼠标装的）。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_gesture.py
# 每一段从头来过；只想跑其中几段就把名字写在后面：python3 tests/e2e_gesture.py photo
# KFS_SHOTS=某个目录：顺手存几张截图（给卿卿看样子用）
#
# 这里跑的是 Chrome，不是她手机上的 Safari：算得对不对、接没接上，这里验得了；
# iPhone 到底拦不拦得住双指、手感跟不跟手，只有她的手机说了算。
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
    # 从 a 挪到 b（两组手指一一对应），分几步走
    def glide(self, a, b, steps=10):
        for k in range(1, steps + 1):
            t = k / steps
            self.move([(i, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) for (i, x0, y0), (_, x1, y1) in zip(a, b)])
    def close(self):
        self.cdp.detach()

# 一张编的照片：格子、圈、小字，放大了看得出放大了
def fake_photo(w=900, h=1200):
    im = Image.new("RGB", (w, h), (236, 228, 240))
    d = ImageDraw.Draw(im)
    for x in range(0, w, 60):
        d.line([(x, 0), (x, h)], fill=(205, 190, 220), width=1)
    for y in range(0, h, 60):
        d.line([(0, y), (w, y)], fill=(205, 190, 220), width=1)
    for k, r in enumerate(range(380, 20, -60)):
        c = (150 + k * 12, 120 + k * 10, 200 - k * 8)
        d.ellipse([w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r], outline=c, width=6)
    for row in range(0, h, 120):
        for col in range(0, w, 180):
            d.text((col + 8, row + 8), f"{col // 180},{row // 120}", fill=(90, 70, 130))
    d.rectangle([w / 2 - 6, h / 2 - 6, w / 2 + 6, h / 2 + 6], fill=(200, 60, 90))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()

VIEW = """(() => { const st = document.querySelector('.kfs-viewer'); if (!st) return null; const img = st.querySelector('img');
  const m = getComputedStyle(img).transform; const n = (m.match(/-?[\\d.]+(e-?\\d+)?/g) || []).map(Number);
  const a = m.startsWith('matrix3d') ? { s: n[0], x: n[12], y: n[13] } : m.startsWith('matrix') ? { s: n[0], x: n[4], y: n[5] } : { s: 1, x: 0, y: 0 };
  const r = st.getBoundingClientRect(); const b = img.getBoundingClientRect();
  return { ...a, zoom: Number(st.dataset.zoom), cx: r.left + r.width / 2, cy: r.top + r.height / 2, W: r.width, H: r.height, w: img.offsetWidth, h: img.offsetHeight, left: b.left, right: b.right, top: b.top, bottom: b.bottom }; })()"""
# 网页自己造的触摸事件，只发给看照片那一页。pts 是 [(编号, x, y), …]：这会儿还按着的手指
TOUCH = """([type, pts]) => { const st = document.querySelector('.kfs-viewer'); const mk = ([id, x, y]) => new Touch({ identifier: id, target: st, clientX: x, clientY: y });
  const list = pts.map(mk); st.dispatchEvent(new TouchEvent(type, { touches: list, targetTouches: list, changedTouches: list.length ? list : [mk([99, 0, 0])], bubbles: true, cancelable: true })); }"""
def touch(page, kind, pts):
    page.evaluate(TOUCH, [kind, [list(p) for p in pts]])
    page.wait_for_timeout(16)

SCALE = "window.visualViewport ? window.visualViewport.scale : 1"
# 对话窗被侧栏推出去多远
SHIFT = "(() => { const m = getComputedStyle(document.querySelector('.kfs-chat-scroll').parentElement).transform.match(/-?[\\d.]+/g); return m ? Math.round(Number(m[4])) : 0; })()"
LIST = "document.querySelector('.kfs-chat-scroll')"


# ---------- 整页不许捏 ----------
def nopinch(browser):
    A = phone(browser)
    pa = page_of(A, "nopinch")
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

    # 别的手上的事照旧
    top0 = pa.evaluate(f"{LIST}.scrollTop")
    room = pa.evaluate(f"{LIST}.scrollHeight - {LIST}.clientHeight")
    f.down([(0, box["x"], 420)]); f.glide([(0, box["x"], 420)], [(0, box["x"], 680)], 13); f.up()
    pa.wait_for_timeout(600)
    top1 = pa.evaluate(f"{LIST}.scrollTop")
    ok(room > 200 and top0 > 200 and top1 < top0 - 120, f"一根手指往下划：聊天记录照滚（{round(top0)} → {round(top1)}）")
    f.down([(0, 24, 420)]); f.glide([(0, 24, 420)], [(0, 300, 430)], 12); f.up(); f.close()
    pa.wait_for_timeout(700)
    ok(pa.evaluate(REACHABLE), "一根手指往右划：侧栏照开")
    shot(pa, "nopinch")
    A.close()


# ---------- 点开的照片：双指缩放 ----------
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

    pic.last.tap(); pa.wait_for_timeout(600)
    v = pa.evaluate(VIEW)
    ok(v is not None and v["zoom"] == 1 and abs(v["s"] - 1) < 0.01 and v["w"] <= v["W"] * 0.92 + 1 and v["h"] <= v["H"] * 0.86 + 1, "点一下照片：打开了，原样大小，整张都在屏幕里")
    ok(pa.evaluate("getComputedStyle(document.querySelector('.kfs-viewer')).touchAction") == "none", "这一页自己认手指（浏览器不插手）")
    shot(pa, "photo-1x")
    cx, cy = v["cx"], v["cy"]
    f = Fingers(pa)

    # 往外拉：放大
    a0, a1 = [(0, cx - 40, cy), (1, cx + 40, cy)], [(0, cx - 120, cy), (1, cx + 120, cy)]
    f.down(a0); f.glide(a0, a1)
    mid = pa.evaluate(VIEW)
    ok(abs(mid["s"] - 3) < 0.05 and mid["zoom"] == 3 and abs(mid["x"]) < 1 and abs(mid["y"]) < 1, f"两根手指从正中往两边拉开三倍：照片放大三倍，还在正中（{mid['s']:.2f}）")
    f.up(); pa.wait_for_timeout(450)
    v = pa.evaluate(VIEW)
    ok(abs(v["s"] - 3) < 0.01 and pa.locator(".kfs-viewer").count() == 1, "松手：留在三倍，照片没被关掉")
    ok(pa.evaluate(SCALE) == 1, "放大的是照片，整页没跟着放大")
    shot(pa, "photo-3x")

    # 放大以后一根手指拖
    f.down([(0, cx, cy)]); f.glide([(0, cx, cy)], [(0, cx + 70, cy - 110)], 8)
    d = pa.evaluate(VIEW)
    ok(abs(d["x"] - 70) < 1 and abs(d["y"] + 110) < 1 and abs(d["s"] - 3) < 0.01, f"放大以后一根手指拖：照片跟着手指走（{d['x']:.0f}, {d['y']:.0f}）")
    f.up(); pa.wait_for_timeout(450)
    ok(pa.locator(".kfs-viewer").count() == 1, "拖完抬手：不算点，照片没被关掉")
    # 拖过头：弹回到边上，不留空
    f.down([(0, cx, cy)]); f.glide([(0, cx, cy)], [(0, cx + 340, cy + 500)], 10)
    over = pa.evaluate(VIEW)
    f.up(); pa.wait_for_timeout(500)
    e = pa.evaluate(VIEW)
    ok(over["left"] > 2 and over["top"] > 2 and abs(e["left"]) < 0.2 and abs(e["top"]) < 0.2, f"拖过了头：手里还跟着走一点，松手弹回去，照片的边贴着屏幕的边（左 {e['left']:.1f}，上 {e['top']:.1f}）")
    shot(pa, "photo-3x-corner")

    # 捏的不是正中：手指中间那一点底下的东西不跑
    f.down([(0, cx - 30, cy - 200), (1, cx + 30, cy - 200)])
    spot0 = pa.evaluate(VIEW)
    px0 = ((cx - spot0["cx"]) - spot0["x"]) / spot0["s"], ((cy - 200 - spot0["cy"]) - spot0["y"]) / spot0["s"]
    f.glide([(0, cx - 30, cy - 200), (1, cx + 30, cy - 200)], [(0, cx - 45, cy - 200), (1, cx + 45, cy - 200)], 6)
    spot1 = pa.evaluate(VIEW)
    px1 = ((cx - spot1["cx"]) - spot1["x"]) / spot1["s"], ((cy - 200 - spot1["cy"]) - spot1["y"]) / spot1["s"]
    f.up(); pa.wait_for_timeout(450)
    ok(abs(spot1["s"] - 4.5) < 0.06 and abs(px0[0] - px1[0]) < 1.5 and abs(px0[1] - px1[1]) < 1.5, f"在偏上的地方接着放大：手指中间那一点底下还是照片上的同一处（{spot1['s']:.2f} 倍）")

    # 拉过头：最多五倍
    b0, b1 = [(0, cx - 20, cy), (1, cx + 20, cy)], [(0, cx - 180, cy), (1, cx + 180, cy)]
    f.down(b0); f.glide(b0, b1)
    big = pa.evaluate(VIEW)
    f.up(); pa.wait_for_timeout(500)
    v = pa.evaluate(VIEW)
    ok(5 < big["s"] <= 7.01 and abs(v["s"] - 5) < 0.01 and v["zoom"] == 5, f"拉过了头：手里到 {big['s']:.2f} 倍，松手弹回五倍")
    ok(v["left"] <= 0.2 and v["right"] >= v["W"] - 0.2 and v["top"] <= 0.2 and v["bottom"] >= v["H"] - 0.2, "五倍的时候照片盖满屏幕，四边都不露底")

    # 往里捏：缩小；捏过头弹回原样
    d0, d1 = [(0, cx - 150, cy), (1, cx + 150, cy)], [(0, cx - 75, cy), (1, cx + 75, cy)]
    f.down(d0); f.glide(d0, d1)
    half = pa.evaluate(VIEW)
    f.up(); pa.wait_for_timeout(450)
    ok(abs(half["s"] - 2.5) < 0.05, f"两根手指往里捏一半：从五倍缩到两倍半（{half['s']:.2f}）")
    f.down(d0); f.glide(d0, [(0, cx - 15, cy), (1, cx + 15, cy)])
    tiny = pa.evaluate(VIEW)
    f.up(); pa.wait_for_timeout(500)
    v = pa.evaluate(VIEW)
    ok(0.5 <= tiny["s"] < 1 and v["zoom"] == 1 and abs(v["s"] - 1) < 0.01 and abs(v["x"]) < 0.5 and abs(v["y"]) < 0.5 and pa.locator(".kfs-viewer").count() == 1,
       f"捏得比原样还小：手里到 {tiny['s']:.2f} 倍，松手弹回原样、回到正中")

    # 原样大小的时候一根手指划：照片不动
    f.down([(0, cx, cy)]); f.glide([(0, cx, cy)], [(0, cx + 90, cy + 60)], 6)
    still = pa.evaluate(VIEW)
    f.up(); pa.wait_for_timeout(400)
    ok(abs(still["x"]) < 0.5 and abs(still["y"]) < 0.5 and pa.locator(".kfs-viewer").count() == 1, "没放大的时候一根手指划：照片不动，也没被关掉")

    # 两根手指抬起一根：照片不跳，剩下那根接着拖。
    # 调试接口装不出“只抬一根”（它得两根一起抬），这一段用网页自己造的触摸事件
    touch(pa, "touchstart", [(0, cx - 40, cy), (1, cx + 40, cy)])
    touch(pa, "touchmove", [(0, cx - 120, cy + 30), (1, cx + 120, cy + 30)])
    two = pa.evaluate(VIEW)
    touch(pa, "touchend", [(1, cx + 120, cy + 30)])
    one = pa.evaluate(VIEW)
    touch(pa, "touchmove", [(1, cx + 80, cy + 50)])
    drag = pa.evaluate(VIEW)
    touch(pa, "touchstart", [(1, cx + 80, cy + 50), (2, cx - 20, cy + 50)])
    touch(pa, "touchmove", [(1, cx + 105, cy + 50), (2, cx - 45, cy + 50)])
    again = pa.evaluate(VIEW)
    touch(pa, "touchend", []); pa.wait_for_timeout(450)
    ok(abs(two["s"] - 3) < 0.01 and abs(one["x"] - two["x"]) < 0.01 and abs(one["y"] - two["y"]) < 0.01 and abs(one["s"] - two["s"]) < 0.001, "两根手指抬起一根：照片不跳")
    ok(abs(drag["s"] - two["s"]) < 0.001 and abs((drag["x"] - one["x"]) + 40) < 0.5 and abs((drag["y"] - one["y"]) - 20) < 0.5, "剩下那根接着拖：倍数不变，照片跟着走")
    ok(abs(again["s"] - 4.5) < 0.01 and pa.locator(".kfs-viewer").count() == 1, f"又落下一根接着捏：从眼下的倍数接着算（{again['s']:.2f}）")

    # 刚捏完的那一下不算点
    f.down(a0); f.glide(a0, a1, 6); f.up()
    pa.evaluate("document.querySelector('.kfs-viewer').click()")
    pa.wait_for_timeout(200)
    ok(pa.locator(".kfs-viewer").count() == 1, "刚捏完紧跟着报的一下 click：不算点，照片没被关掉")
    pa.wait_for_timeout(500)

    # 点一下关掉；再点开是原样
    f.down([(0, cx, cy)]); f.move([(0, cx + 4, cy + 3)])
    nudged = pa.evaluate(VIEW)
    f.up(); pa.wait_for_timeout(500)
    ok(nudged is not None and nudged["s"] > 2.9 and pa.locator(".kfs-viewer").count() == 0, "放大着的时候点一下（手指带着挪了几个像素）：照样算点，关掉")
    pic.last.tap(); pa.wait_for_timeout(600)
    v = pa.evaluate(VIEW)
    ok(v is not None and v["zoom"] == 1 and abs(v["s"] - 1) < 0.01 and abs(v["x"]) < 0.5, "再点开：又是原样大小（不记上回放大到哪）")
    pa.touchscreen.tap(cx, cy + 300); pa.wait_for_timeout(500)
    ok(pa.locator(".kfs-viewer").count() == 0, "点照片外面的暗处：关掉")
    # 关掉以后，手指的事回到聊天上：侧栏照开
    f.down([(0, 24, 420)]); f.glide([(0, 24, 420)], [(0, 300, 430)], 12); f.up(); f.close()
    pa.wait_for_timeout(700)
    ok(pa.evaluate(REACHABLE), "照片关掉以后往右划：侧栏照开")
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
