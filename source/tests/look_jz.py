# 闲笔集掺的手帐：拍样张给她看（不是测试，不判对错）。
#   一页编好的手帐（字、照片都是编的：照片是 PIL 画的色块），直接放进这台手机的本地存档（IndexedDB 的 kv，跟开封府自己存的一样，
#   dirty 着，开封府自己会加密了推上云端），重新打开开封府，再去闲笔集里点开拍：
#   每个主题：闲笔集那一天底下的卡片和批注、改的时候的样子；头一个主题再拍六种版式 × 八种风格各一张，外加每种版式一张八拼的小样。
#
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：
#   python3 tests/look_jz.py 输出目录 [主题 ...]      主题不写就是三套：qinglv dingxiang heiye
import base64, io, json, math, os, random, re, sys, time
from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("KFS_BASE", "http://127.0.0.1:8080/")
MOCK = os.environ.get("KFS_MOCK", "http://127.0.0.1:8787")
CHROME = os.environ.get("CHROME_PATH", "/opt/google/chrome/chrome" if os.path.exists("/opt/google/chrome/chrome") else None)
PASS = "test-passphrase-123"
NOW = "2026-10-12T23:27:00+01:00"
DAY = "2026-10-12"
LAYOUTS = ["column", "polaroid", "cover", "bento", "scroll", "letter"]
STYLES = ["inkpaper", "xuan", "kraft", "film", "night", "washi", "newsprint", "chalk"]

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "look_jz")
themes = sys.argv[2:] or ["qinglv", "dingxiang", "heiye"]
os.makedirs(out, exist_ok=True)


# ---------- 编的照片（色块画的） ----------
def data_url(im, q=84):
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=q)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

def grad(w, h, top, bottom):
    im = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return im

def tree_photo():
    rnd = random.Random(7)
    w, h = 1200, 900
    im = grad(w, h, (214, 214, 236), (238, 230, 236))
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle([0, 640, w, h], fill=(150, 168, 178, 255))
    for k in range(24):
        y = 660 + k * 10 + rnd.randint(-3, 3)
        x = rnd.randint(0, w - 300)
        d.line([(x, y), (x + rnd.randint(80, 300), y)], fill=(222, 228, 236, 120), width=3)
    d.polygon([(700, 640), (735, 300), (760, 300), (790, 640)], fill=(92, 74, 66, 255))
    for (x0, y0, x1, y1) in [(745, 330, 560, 170), (750, 360, 960, 180), (748, 420, 1040, 330), (742, 400, 470, 300)]:
        d.line([(x0, y0), (x1, y1)], fill=(92, 74, 66, 255), width=14)
    for _ in range(420):
        cx, cy = rnd.gauss(750, 210), rnd.gauss(250, 95)
        r = rnd.randint(10, 26)
        c = rnd.choice([(176, 150, 214), (196, 170, 226), (156, 128, 196), (214, 196, 236)])
        d.ellipse([cx - r, cy - r * 1.3, cx + r, cy + r * 1.3], fill=c + (rnd.randint(150, 230),))
    return im.filter(ImageFilter.GaussianBlur(1.2))

def lantern_photo():
    rnd = random.Random(3)
    w, h = 900, 1200
    im = grad(w, h, (24, 30, 58), (54, 44, 70))
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for k in range(9):
        x = 120 + k * 85 + rnd.randint(-10, 10)
        y = 260 + int(70 * math.sin(k / 1.6)) + k * 42
        g.ellipse([x - 70, y - 70, x + 70, y + 70], fill=(255, 170, 80, 70))
    im.paste(glow.filter(ImageFilter.GaussianBlur(26)), (0, 0), glow.filter(ImageFilter.GaussianBlur(26)))
    d = ImageDraw.Draw(im, "RGBA")
    for k in range(9):
        x = 120 + k * 85 + rnd.randint(-10, 10)
        y = 260 + int(70 * math.sin(k / 1.6)) + k * 42
        d.ellipse([x - 30, y - 38, x + 30, y + 38], fill=(232, 96, 60, 255))
        d.rectangle([x - 12, y - 46, x + 12, y - 38], fill=(240, 196, 90, 255))
    d.rectangle([0, 1000, w, h], fill=(30, 26, 40, 255))
    return im

def tea_photo():
    w, h = 900, 1200
    im = grad(w, h, (238, 226, 206), (222, 204, 178))
    d = ImageDraw.Draw(im, "RGBA")
    d.ellipse([170, 520, 730, 1000], fill=(248, 244, 236, 255))
    d.ellipse([230, 570, 670, 950], fill=(196, 150, 90, 255))
    d.ellipse([300, 640, 520, 780], fill=(226, 190, 130, 120))
    for k in range(3):
        x = 360 + k * 90
        d.arc([x - 40, 260, x + 40, 520], 200, 340, fill=(255, 255, 255, 140), width=8)
    return im.filter(ImageFilter.GaussianBlur(0.8))

def noodle_photo():
    rnd = random.Random(11)
    w, h = 1000, 1000
    im = grad(w, h, (164, 120, 84), (140, 100, 70))
    d = ImageDraw.Draw(im, "RGBA")
    for k in range(14):
        d.line([(0, k * 74), (w, k * 74 + 20)], fill=(120, 84, 58, 90), width=3)
    d.ellipse([110, 110, 890, 890], fill=(246, 244, 238, 255))
    d.ellipse([170, 170, 830, 830], fill=(214, 98, 52, 255))
    for _ in range(26):
        x0, y0 = rnd.randint(260, 700), rnd.randint(260, 700)
        d.arc([x0 - 120, y0 - 60, x0 + 120, y0 + 60], rnd.randint(0, 180), rnd.randint(200, 360), fill=(250, 240, 214, 255), width=7)
    for _ in range(40):
        x, y = rnd.randint(240, 760), rnd.randint(240, 760)
        d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(86, 160, 72, 255))
    return im.filter(ImageFilter.GaussianBlur(0.6))

PHOTOS = {"jzdemohero": tree_photo(), "jzdemopair1": lantern_photo(), "jzdemopair2": tea_photo(), "jzdemofood": noodle_photo()}

def seed_records():
    from datetime import datetime, timezone
    at = int(datetime(2026, 10, 12, 20, 30, tzinfo=timezone.utc).timestamp() * 1000)  # 那天晚上九点半（照下面测试用的时区）
    page = {
        "v": 1, "day": DAY, "layout": "polaroid", "style": "washi", "at": at,
        "wx": {"code": 2, "hi": 18, "lo": 11, "mm": 0, "city": "某城", "src": "open-meteo"},
        "arr": {
            "by": "him", "at": at,
            "title": "泡桐花开了",
            "body": "她今天走运河那条路回来，说看到泡桐花了。我没看到，可她讲得清清楚楚：紫色的，一串一串挂着，风一吹就晃。",
            "cap": "运河边 · 下午四点",
            "pen": {"text": "她说是[[紫色的]]，一串一串挂着", "margin": "记得"},
            "quotes": [
                {"id": "q1", "w": "her", "t": "16:12", "p": "今天看到泡桐花了！"},
                {"id": "q2", "w": "him", "t": "16:13", "p": "在哪儿看到的？"},
                {"id": "q3", "w": "her", "t": "16:14", "p": "运河边，一整棵都开了，紫色的"},
                {"id": "q4", "w": "him", "t": "16:15", "p": "拍给我看看。"},
            ],
            "photos": [
                {"id": "jzdemohero", "role": "hero", "note": ""},
                {"id": "jzdemopair1", "role": "pair", "note": "晚上的灯"},
                {"id": "jzdemopair2", "role": "pair", "note": "回来泡的茶"},
                {"id": "jzdemofood", "role": "food", "note": "番茄米线"},
            ],
            "stickers": [
                {"k": "e:cherry-blossom", "x": 0.88, "y": 0.17, "r": 12, "s": 0.9},
                {"k": "s:甚好", "x": 0.86, "y": 1.02, "r": -8, "s": 0.8},
            ],
        },
        "mine": {
            "edit": {}, "hide": [], "at": at,
            "stickers": [
                {"k": "t:stripe-lilac", "x": 0.5, "y": 0.56, "r": -3, "s": 1},
                {"k": "e:fox", "x": 0.12, "y": 1.5, "r": -10, "s": 0.85},
            ],
            "texts": [{"id": "t1", "m": "那天真好", "x": 0.72, "y": 1.62, "r": -5, "s": 1.1}],
        },
    }
    month = {DAY: {
        "her": {"text": "下午走运河那条路回来，泡桐花开了，一整棵都是紫的。拍了好几张，回去泡了杯茶，晚上去看了灯。", "moods": ["happy", "sweet"], "updatedAt": at},
        "him": {"text": "她说泡桐花开了。我在这边听她一句一句讲，好像也看见了。", "moods": ["calm"], "updatedAt": at},
    }}
    notes = [
        {"id": "n1", "who": "her", "text": "这张是蹲着拍的", "at": at + 1000, "part": "hero"},
        {"id": "n2", "who": "him", "text": "标题是我起的，你要是想改就改。", "at": at + 2000, "part": "title"},
    ]
    recs = [
        {"k": "kfs2:jz:" + DAY, "v": json.dumps(page, ensure_ascii=False), "dirty": True},
        {"k": "kfs2:jzn:" + DAY, "v": json.dumps(notes, ensure_ascii=False), "dirty": True},
        {"k": "kfs2:diary:" + DAY[:7], "v": json.dumps(month, ensure_ascii=False), "dirty": True},
        {"k": "kfs2:jzcfg", "v": json.dumps({"city": {"name": "某城", "lat": 1.0, "lon": 2.0, "tz": "auto", "where": "某省，某国"}}, ensure_ascii=False), "dirty": True},
    ]
    recs += [{"k": "kfs2:jzimg:" + k, "v": data_url(im), "dirty": True} for k, im in PHOTOS.items()]
    return recs

PUT = """(recs) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite');
  for (const r of recs) tx.objectStore('kv').put(r); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }; o.onerror = () => rej(o.error); })"""


def enter(page):
    kite = page.get_by_role("button", name="戳一下燕子，进开封府")
    knob = page.get_by_role("slider", name="把小猪拉到最右边，进开封府")
    enter_any = page.locator("[data-kfs-splash-enter]")
    for _ in range(300):
        if kite.count() or knob.count() or enter_any.count():
            break
        time.sleep(0.1)
    time.sleep(1.5)
    if kite.count():
        kite.click()
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


def tour(browser, theme, matrix):
    import urllib.request
    urllib.request.urlopen(MOCK + "/__debug/reset").read()
    tdir = os.path.join(out, theme)
    os.makedirs(tdir, exist_ok=True)
    ctx = browser.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN", timezone_id="Europe/Dublin")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.clock.install(time=NOW)
    page.clock.resume()
    page.add_init_script(f"try {{ if (!sessionStorage.getItem('kfs-look-theme')) {{ localStorage.setItem('kfs-theme', '{theme}'); localStorage.setItem('kfs-mirror-still', '1'); sessionStorage.setItem('kfs-look-theme', '1'); }} }} catch (e) {{}}")
    page.goto(BASE)
    page.get_by_text("进门先报上名来").wait_for(timeout=20000)
    page.locator("input[type=email]").fill("qing@example.com")
    page.locator("input[type=password]").fill("correct-horse")
    page.get_by_role("button", name="进府").click()
    page.get_by_text("设一句暗号").wait_for(timeout=15000)
    fields = page.locator("form input")
    fields.nth(0).fill(PASS); fields.nth(1).fill(PASS)
    page.get_by_role("button", name="设好了").click()
    enter(page)
    page.evaluate(PUT, seed_records())
    page.reload()
    enter(page)

    def shot(name, settle=0.5):
        time.sleep(settle)
        page.screenshot(path=os.path.join(tdir, name + ".png"), animations="disabled")

    # 闲笔集那一天
    page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    page.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
    page.locator(".kfs-nanya-row", has_text="闲笔集").click()
    page.locator(".kfs-page").wait_for(timeout=10000)
    page.locator(".kfs-jz-open").wait_for(timeout=10000); time.sleep(0.8)
    page.locator(".kfs-jz-open").scroll_into_view_if_needed(); time.sleep(0.4)
    page.evaluate("(() => { const e = document.querySelector('.kfs-jz-open'); e.scrollIntoView({ block: 'center' }); })()")
    shot("jz_01_day_card", 0.8)
    # 点开：改的样子
    page.locator(".kfs-jz-open").click()
    page.locator(".kfs-jz .jz-sheet").wait_for(timeout=10000)
    page.wait_for_function("() => !!document.querySelector(\".kfs-jz .jz-stk[data-k='e:fox'] svg\")", timeout=10000)
    shot("jz_02_editing", 1.0)
    page.locator(".kfs-jz-addsticker").click(); shot("jz_03_stickers", 0.8)
    page.locator(".kfs-jz-tab", has_text="印章").click(); shot("jz_04_seals", 0.6)
    page.locator(".kfs-jz div.absolute.inset-0.z-40").last.click(position={"x": 30, "y": 30}); time.sleep(0.4)
    page.locator(".kfs-jz-him").click(); shot("jz_05_ask_him", 0.6)
    page.locator(".kfs-jz div.absolute.inset-0.z-40").last.click(position={"x": 30, "y": 30}); time.sleep(0.4)
    page.locator(".kfs-jz-notes").click(); shot("jz_06_notes", 0.6)
    page.locator(".kfs-jz div.absolute.inset-0.z-40").last.click(position={"x": 30, "y": 30}); time.sleep(0.4)

    if matrix:
        page.set_viewport_size({"width": 393, "height": 4600})
        time.sleep(0.6)
        for lay in LAYOUTS:
            page.locator(".kfs-jz-layout").click(); time.sleep(0.3)
            page.locator(f".kfs-jz-pick[data-k='{lay}']").click(); time.sleep(0.3)
            for sty in STYLES:
                page.locator(".kfs-jz-style").click(); time.sleep(0.25)
                page.locator(f".kfs-jz-pick[data-k='{sty}']").click(); time.sleep(0.45)
                page.locator(".kfs-jz .jz-wrap").screenshot(path=os.path.join(out, f"m_{lay}_{sty}.png"), animations="disabled")
        page.set_viewport_size({"width": 393, "height": 852})
        # 每种版式一张八拼的小样
        for lay in LAYOUTS:
            ims = [Image.open(os.path.join(out, f"m_{lay}_{sty}.png")) for sty in STYLES]
            tw = 360
            th = max(int(im.height * tw / im.width) for im in ims)
            sheet = Image.new("RGB", (tw * 4 + 50, th * 2 + 30), (250, 250, 248))
            for i, im in enumerate(ims):
                sm = im.resize((tw, int(im.height * tw / im.width)), Image.LANCZOS)
                sheet.paste(sm, (10 + (i % 4) * (tw + 10), 10 + (i // 4) * (th + 10)))
            sheet.save(os.path.join(out, f"sheet_{lay}.png"))
    print(theme, "errors:", errs[:3])
    ctx.close()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    for i, th in enumerate(themes):
        tour(browser, th, i == 0)
    browser.close()
print("拍好了：", out)
