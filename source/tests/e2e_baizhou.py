# 白昼（第四套主题，11 月 17 日添的）：入口和图标、开屏（滑块拉多少狐狸画多少，拉到头松手才进门）、颜色、主题色那一排的次序。
# 真的浏览器、假 Supabase。先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_baizhou.py [截图目录]
import io, json, os, sys, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright
import numpy as np
from PIL import Image
from mailkit import *

errors = []
SHOTS = sys.argv[1] if len(sys.argv) > 1 else ""
def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name))
# 狐狸那一块里有多少陶土色的像素（画出来多少）
def ink(page):
    box = page.locator(".kfs-bz-fox").bounding_box()
    im = Image.open(io.BytesIO(page.screenshot(clip=dict(x=box["x"] - 8, y=box["y"] - 8, width=box["width"] + 16, height=box["height"] + 16)))).convert("RGB")
    a = np.asarray(im).astype(int)
    return int(((a[..., 0] - a[..., 2] > 60) & (a[..., 0] > 150)).sum())
def state(page):
    return page.evaluate("""() => { const k = document.querySelector('.kfs-bz-knob'), s = document.querySelector('.kfs-bz-fox'), t = document.querySelector('.kfs-bz-track');
      return k ? { now: Number(k.getAttribute('aria-valuenow')), done: k.hasAttribute('data-done'), drawn: Number(s.getAttribute('data-drawn')),
        masked: s.querySelector('[data-fox]').hasAttribute('mask'), shown: getComputedStyle(t).opacity, x: Math.round(k.getBoundingClientRect().left - t.getBoundingClientRect().left) } : null; }""")
def grab(page):
    k = page.locator(".kfs-bz-knob").bounding_box(); t = page.locator(".kfs-bz-track").bounding_box()
    return k["x"] + k["width"] / 2, k["y"] + k["height"] / 2, t["width"] - 12 - k["width"]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        # ================= 入口和图标 =================
        pa.goto(BASE + "baizhou/")
        pa.get_by_text("进门先报上名来").wait_for(timeout=15000)
        info = pa.evaluate("""() => ({ theme: document.documentElement.getAttribute('data-kfs-theme'), meta: document.querySelector('meta[name="theme-color"]').getAttribute('content'),
            icon: document.querySelector('link[rel="apple-touch-icon"]').href, manifest: document.querySelector('link[rel="manifest"]').href,
            wall: document.querySelector('img').currentSrc || document.querySelector('img').src, bg: getComputedStyle(document.body).backgroundColor,
            preload: [...document.querySelectorAll('link[rel="preload"][as="image"]')].map((l) => l.getAttribute('href')) })""")
        man = json.loads(urllib.request.urlopen(info["manifest"]).read())
        got = [urllib.request.urlopen(urllib.parse.urljoin(info["manifest"], i["src"])).status for i in man["icons"]]
        ok(info["theme"] == "baizhou" and info["meta"] == "#F9F9F7" and "/icons-baizhou/apple-touch-icon.png" in info["icon"] and info["wall"].endswith("/assets/wall-baizhou.webp") and info["bg"] == "rgb(249, 249, 247)",
           f"白昼的入口：一打开就是白昼，米白的底，图标是狐狸（{info['bg']}）")
        ok(man["start_url"] == "./baizhou/" and man["theme_color"] == "#F9F9F7" and len(man["icons"]) == 3 and all("icons-baizhou" in i["src"] for i in man["icons"])
           and got == [200, 200, 200] and urllib.request.urlopen(info["icon"]).status == 200 and info["preload"] == [],
           "白昼入口的清单：从这儿添加，以后打开的还是白昼的入口，几张图标都取得到；开屏没有图，不预载")
        icon = Image.open(io.BytesIO(urllib.request.urlopen(info["icon"]).read())).convert("RGB")
        corner, light = icon.getpixel((6, 6)), int((np.asarray(icon).min(axis=2) > 235).sum())
        ok(icon.size == (180, 180) and corner[0] - corner[2] > 90 and 0.05 < light / (180 * 180) < 0.25, f"图标：陶土色的底，中间一只米白线条的狐狸（角上 {corner}，米白占 {light / (180 * 180):.0%}）")
        shot(pa, "bz_gate.png")

        # ================= 开屏：滑块拉多少，狐狸画多少 =================
        pa.locator("input[type=email]").fill("qing@example.com"); pa.locator("input[type=password]").fill("correct-horse")
        pa.get_by_role("button", name="进府").click()
        pa.get_by_text("设一句暗号").wait_for(timeout=15000)
        f = pa.locator("form input"); f.nth(0).fill(PASS); f.nth(1).fill(PASS)
        pa.get_by_role("button", name="设好了").click()
        pa.locator(".kfs-bz-knob").wait_for(timeout=30000); pa.wait_for_timeout(1300)
        s0 = state(pa); i0 = ink(pa)
        ok(s0["now"] == 0 and s0["drawn"] == 0 and i0 == 0 and s0["shown"] == "1" and pa.locator(".kfs-bz-splash img").count() == 0,
           f"开屏：一片米白，纸上是空的（陶土色的像素 {i0} 个），底下浮出滑块")
        x0, y0, span = grab(pa)
        pa.mouse.move(x0, y0); pa.mouse.down()
        seen = []
        for frac in (0.25, 0.5, 0.75):
            pa.mouse.move(x0 + span * frac, y0, steps=5); pa.wait_for_timeout(200)
            s = state(pa); seen.append((s["now"], round(s["drawn"], 2), ink(pa), s["masked"], s["done"]))
            if frac == 0.5: shot(pa, "bz_splash_half.png")
        ok([x[0] for x in seen] == [25, 50, 75] and all(abs(x[1] - x[0] / 98.5) < 0.02 for x in seen) and 0 < seen[0][2] < seen[1][2] < seen[2][2] and all(x[3] and not x[4] for x in seen),
           f"往右拉：拉到几成，狐狸就画到几成，墨迹一路多起来（{seen}）")
        pa.mouse.up(); pa.wait_for_timeout(1200)
        s = state(pa)
        ok(s and s["now"] == 0 and s["drawn"] == 0 and ink(pa) == 0 and pa.locator(".kfs-bz-splash").count() == 1, "没拉到头就松手：圆钮弹回去，画也收回去，还在门口")
        x0, y0, span = grab(pa)
        pa.mouse.move(x0, y0); pa.mouse.down(); pa.mouse.move(x0 + span + 30, y0, steps=8); pa.wait_for_timeout(300)
        s = state(pa); full = ink(pa)
        ok(s["now"] == 100 and s["drawn"] == 1 and s["done"] and not s["masked"] and full > seen[2][2] and pa.locator(".kfs-bz-splash").count() == 1 and pa.evaluate("getComputedStyle(document.querySelector('.kfs-bz-splash')).opacity") == "1",
           f"拉到头：狐狸画完了（蒙版拿掉，露出整块形状），圆钮变成陶土色；手指还按着，不进门（墨迹 {full}）")
        shot(pa, "bz_splash_done.png")
        pa.mouse.up()
        pa.get_by_placeholder("说话，我听着").wait_for(timeout=10000)
        wait_js(pa, "!document.querySelector('.kfs-bz-splash')", 5000)
        ok(pa.locator(".kfs-bz-splash").count() == 0, "松手：进门")

        # ================= 颜色 =================
        chat(pa, "在吗")
        look = pa.evaluate("""() => { const cs = getComputedStyle(document.documentElement); const v = (n) => cs.getPropertyValue(n).split(' ').join('');
          const b = document.querySelector('.kfs-chat-rows [data-bubble], .kfs-chat-rows .kfs-bubble') ; const w = document.querySelector('.kfs-wall');
          return { ink: v('--k-ink'), dai: v('--k-dai'), base: v('--k-base'), hair: v('--k-hair'), wall: w.getAttribute('src'), body: getComputedStyle(document.body).backgroundColor,
            meta: document.querySelector('meta[name="theme-color"]').getAttribute('content') }; }""")
        ok(look["ink"] == "39,39,38" and look["dai"] == "196,108,79" and look["base"] == "249,249,247" and look["hair"].endswith(".1)") and look["wall"].endswith("wall-baizhou.webp") and look["meta"] == "#F9F9F7",
           f"里头：米白的底、近黑的字、陶土色的点缀；发丝线是一根淡的深色线；聊天背景是那一片米白（{look['ink']} / {look['dai']} / {look['base']}）")
        shot(pa, "bz_chat.png")

        # ================= 主题色那一排 =================
        open_panel(pa)
        pa.locator(".kfs-wall-set").scroll_into_view_if_needed(); pa.wait_for_timeout(300)
        chips = pa.evaluate("[...document.querySelectorAll('button[aria-label$=\"主题\"]')].map((b) => ({ name: b.textContent.trim(), on: b.getAttribute('aria-pressed') === 'true', top: Math.round(b.getBoundingClientRect().top) }))")
        ok([c["name"] for c in chips] == ["白昼", "黑夜", "青绿", "丁香"] and [c["on"] for c in chips] == [True, False, False, False] and len({c["top"] for c in chips}) == 1,
           f"主题色那一排：白昼、黑夜、青绿、丁香，四颗摆在一行，亮着的是白昼（{[(c['name'], c['top']) for c in chips]}）")
        shot(pa, "bz_panel.png")
        pa.get_by_role("button", name="青绿主题").click(); pa.wait_for_timeout(500)
        note = pa.locator(".kfs-push").evaluate("(el) => el.closest('[class*=overflow]') ? el.closest('[class*=overflow]').innerText : document.body.innerText")
        ok(pa.evaluate("document.documentElement.getAttribute('data-kfs-theme')") == "qinglv" and "主屏幕上的图标还是狐狸" in note and pa.get_by_role("button", name="复制青绿入口的网址").count() == 1,
           "换成青绿：提示主屏幕上的图标还是狐狸，给青绿入口的网址")
        pa.get_by_role("button", name="白昼主题").click(); pa.wait_for_timeout(400)
        ok(pa.evaluate("[document.documentElement.getAttribute('data-kfs-theme'), localStorage.getItem('kfs-theme')]") == ["baizhou", "baizhou"], "换回白昼：记在这台手机上")
        close_panel(pa)

        # ================= 重新打开：键盘也拉得动 =================
        pa.reload()
        pa.locator(".kfs-bz-knob").wait_for(timeout=30000); pa.wait_for_timeout(1200)
        pa.locator(".kfs-bz-knob").focus()
        pa.keyboard.press("Enter"); pa.wait_for_timeout(300)
        still = pa.locator(".kfs-bz-splash").count() == 1 and state(pa)["now"] == 0
        pa.keyboard.press("End"); pa.wait_for_timeout(1500)
        s = state(pa)
        ok(still and s["now"] == 100 and s["done"] and pa.locator(".kfs-bz-splash").count() == 1, "重新打开又是这一屏；键盘：没到头按回车不进门，按 End 圆钮走到头、狐狸画完")
        pa.keyboard.press("Enter")
        pa.get_by_placeholder("说话，我听着").wait_for(timeout=10000)
        ok(True, "到头了按回车：进门")
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
sys.exit(1 if count["failed"] or errors else 0)
