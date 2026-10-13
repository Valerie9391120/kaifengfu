# 黑夜开屏的定格图：python3 tools/make_heiye_poster.py
#
# 开屏一打开先摆这张（static/splash-heiye.webp），镜碎入月那一页在框里读完、画出来了再淡进来盖住它；
# 那一页没读完、手机画不动、出了岔子的时候，就是这张图，点一下进门（见 src/SplashHeiye.jsx）。
# 照 static/mirror.html 本身画：镜子还没碰、刚飘起来那一下（时间走到 1 秒），按她手机的屏（393×852）三倍画，
# 存成 1179×2556 的 webp。要先 npm install（three.js 从 node_modules 里拿），要 Playwright 和机器上的 Chrome。
# static/mirror.html 换了（tools/make_mirror.py 重跑过）要跟着重画这张。
import os, shutil, subprocess, sys, tempfile, time
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..")
tmp = tempfile.mkdtemp()
page = open(os.path.join(SRC, "static", "mirror.html"), encoding="utf-8").read().replace("'./__KFS_THREE__'", "'./three.module.min.js'")
open(os.path.join(tmp, "mirror.html"), "w", encoding="utf-8").write(page)
shutil.copy(os.path.join(SRC, "node_modules", "three", "build", "three.module.min.js"), tmp)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8097", "--bind", "127.0.0.1"], cwd=tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = b.new_page(viewport={"width": 393, "height": 852}, device_scale_factor=3)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://127.0.0.1:8097/mirror.html#debug-manual")
        pg.wait_for_function("() => window.__mirror && window.__mirror.app.ready", timeout=180000)
        # 三倍屏照三倍画（那一页自己最多画两倍）；改完让它按新的大小重摆一遍
        pg.evaluate("() => { window.__mirror.CONFIG.quality.maxPixelRatio = 3; window.dispatchEvent(new Event('resize')); window.__mirror.advance(1.0, 30); }")
        time.sleep(2.4)  # 画布是淡进来的（1.8 秒）
        pg.evaluate("() => window.__mirror.renderOnce()")
        shot = os.path.join(tmp, "poster.png")
        pg.screenshot(path=shot)
        b.close()
finally:
    srv.terminate()
if errs:
    sys.exit("出错：" + "; ".join(errs))
im = Image.open(shot).convert("RGB")
out = os.path.join(SRC, "static", "splash-heiye.webp")
im.save(out, "WEBP", quality=86, method=6)
print(f"写好了 {os.path.normpath(out)}（{im.size[0]}×{im.size[1]}，{os.path.getsize(out) // 1024} KB）")
