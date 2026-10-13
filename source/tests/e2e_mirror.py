# 黑夜的开屏（镜碎入月）端到端：python3 tests/e2e_mirror.py
# 先在 source/ 里 npm run build:test，再开两个服务（同 tests/e2e.py）。
# 镜碎入月要 WebGL，这台机器没有显卡，自己带着 SwiftShader 的参数起浏览器；软着画很慢，
# 测试伸手进那一页（框的网址后面带 #debug，开关是 localStorage 的 kfs-mirror-debug）把时间往前拨，不干等。
import json, os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("KFS_BASE", "http://127.0.0.1:8080/")
MOCK = os.environ.get("KFS_MOCK", "http://127.0.0.1:8787")
CHROME = os.environ.get("CHROME_PATH", "/opt/google/chrome/chrome" if os.path.exists("/opt/google/chrome/chrome") else None)
SHOTS = os.environ.get("KFS_SHOTS")
PASS = "test-passphrase-123"
GL = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

passed, failed = 0, 0


def ok(cond, msg):
    global passed, failed
    if cond:
        passed += 1
        print("ok:", msg)
    else:
        failed += 1
        print("FAIL:", msg)


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name + ".png"))


def mirror_frame(page):
    for f in page.frames:
        if "/assets/mirror-" in f.url:
            return f
    return None


def login(page, first):
    page.goto(BASE)
    page.get_by_text("进门先报上名来").wait_for(timeout=20000)
    page.locator("input[type=email]").fill("qing@example.com")
    page.locator("input[type=password]").fill("correct-horse")
    page.get_by_role("button", name="进府").click()
    if first:
        page.get_by_text("设一句暗号").wait_for(timeout=15000)
        fields = page.locator("form input")
        fields.nth(0).fill(PASS)
        fields.nth(1).fill(PASS)
        page.get_by_role("button", name="设好了").click()
    else:
        page.get_by_text("对暗号").first.wait_for(timeout=15000)
        page.locator("form input").first.fill(PASS)
        page.get_by_role("button", name="开门").click()


urllib.request.urlopen(MOCK + "/__debug/reset").read()
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=GL) if CHROME else p.chromium.launch(args=GL)
    iphone = dict(viewport={"width": 393, "height": 852}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN", timezone_id="Europe/Dublin")

    # ============ 一：真的那一页 ============
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    # 这台机器没有显卡，软着画一帧要好几秒，心跳隔得远：“多久听不到算卡住”放宽到两分钟（卡住那一段另测）
    page.add_init_script("try { if (!sessionStorage.getItem('kfs-t')) { localStorage.setItem('kfs-theme', 'heiye'); localStorage.setItem('kfs-mirror-debug', '1'); localStorage.setItem('kfs-mirror-stall', '120000'); sessionStorage.setItem('kfs-t', '1'); } } catch (e) {}")
    t0 = time.time()
    login(page, True)
    splash = page.locator(".kfs-splash-heiye")
    splash.wait_for(timeout=30000)
    mode0 = splash.get_attribute("data-kfs-mirror-mode")
    poster = page.locator(".kfs-splash-heiye img").first
    # 这台机器上框读得快，开屏一出来往往已经画好了：只看定格图在底下垫着
    ok(mode0 in ("loading", "live") and poster.get_attribute("src").endswith("splash-heiye.webp"), f"黑夜的开屏：底下先垫着定格图（{mode0}）")
    for _ in range(300):
        if splash.get_attribute("data-kfs-mirror-mode") != "loading":
            break
        time.sleep(0.2)
    mode1 = splash.get_attribute("data-kfs-mirror-mode")
    ok(mode1 == "live", f"那一页画出来了，告诉开屏 ready（{mode1}，开门到这儿 {time.time() - t0:.1f} 秒，软着画）")
    fr = mirror_frame(page)
    ok(fr is not None and re.search(r"/assets/mirror-[0-9a-f]{10}\.html#debug$", fr.url or ""), f"框里装的是带指纹的那一页（{fr.url if fr else None}）")
    for _ in range(100):
        if fr.evaluate("() => !!window.__mirror"):
            break
        time.sleep(0.2)
    info = fr.evaluate("""() => { const C = window.__mirror.CONFIG; return { touches: C.breakTouches, shatter: C.shards.shatterDelay, push: C.camera.pushDelay, traverse: C.camera.traverseDuration,
        restart: getComputedStyle(document.getElementById('restart')).display, notice: getComputedStyle(document.getElementById('notice')).display,
        bg: getComputedStyle(document.body).backgroundColor, state: window.__mirror.app.state }; }""")
    ok(info["touches"] == 1 and info["shatter"] == 1.0 and info["push"] == 0.6 and info["traverse"] == 7.5, f"一下就碎，碎得早、镜头早动，穿越 7.5 秒（{info}）")
    ok(info["restart"] == "none" and info["notice"] == "none" and info["bg"] in ("rgba(0, 0, 0, 0)", "transparent"), "“重新开始”和提示都藏了，底色透明")
    # 那一页不许用网络：连开封府自己的网址都要不来
    net = fr.evaluate("""() => fetch('/').then(() => 'got', () => 'blocked')""")
    ok(net == "blocked", f"那一页的安全规矩生效：不许用网络（{net}）")
    time.sleep(2.2)
    shot(page, "m1_live")

    # 点镜子正中：一下就碎
    box = page.locator(".kfs-splash-heiye iframe").bounding_box()
    sc = fr.evaluate("() => window.__mirror.screenOf(0.0, 0.05)")
    page.mouse.click(box["x"] + sc["x"], box["y"] + sc["y"])
    time.sleep(0.5)
    st = fr.evaluate("() => window.__mirror.app.state")
    ok(st == "SHATTER", f"点一下镜面，整面镜子就碎（{st}）")
    # 碎着、推进还没穿过镜框的时候点了不算
    fr.evaluate("() => window.__mirror.advance(2.0, 30)")
    page.mouse.click(box["x"] + 196, box["y"] + 420)
    time.sleep(0.4)
    ok(splash.is_visible() and splash.get_attribute("data-kfs-mirror-mode") == "live" and not fr.evaluate("() => !!window.__mirror.app.kfsEntered"),
       "镜头还没穿过镜框的时候点了不算，不进门")
    # 往前拨到月海里
    fr.evaluate("() => window.__mirror.advance(8.0, 30)")
    w1 = fr.evaluate("() => [window.__mirror.app.world1, window.__mirror.app.state]")
    ok(w1[0] is False and w1[1] in ("TRAVERSE", "MOON_SEA"), f"穿过镜框，落进月相之海（{w1}）")
    fr.evaluate("() => window.__mirror.advance(4.0, 30)")
    st2 = fr.evaluate("() => window.__mirror.app.state")
    time.sleep(0.6)
    shot(page, "m2_moon_sea")
    # 不点就一直在月海里：开屏还在（心跳一直在报，不会被当成卡住）
    time.sleep(1.5)
    ok(st2 == "MOON_SEA" and splash.is_visible(), f"不点就一直在月海里，开屏不走（{st2}）")
    ok(page.evaluate("localStorage.getItem('kfs-mirror-try')") == "1", "放着的时候这台手机上记着“正在放”（整页没了下回先只摆定格图）")
    # 再点一下：进门
    page.mouse.click(box["x"] + 196, box["y"] + 420)
    page.locator(".kfs-motto").wait_for(timeout=15000)
    page.wait_for_timeout(900)
    ok(page.locator(".kfs-splash-heiye").count() == 0 and mirror_frame(page) is None, "月海里再点一下：进门，开屏连同那个框整个拆掉")
    ok(page.evaluate("localStorage.getItem('kfs-mirror-try')") is None, "进了门，“正在放”的记号擦掉")
    theme = page.evaluate("[document.documentElement.getAttribute('data-kfs-theme'), document.querySelector('.kfs-wall').getAttribute('src')]")
    ok(theme == ["heiye", "./assets/wall-heiye.webp"], f"进来是黑夜：蓝黑星海的聊天背景（{theme}）")
    shot(page, "m3_inside")
    ctx.close()

    first_errors = list(errors)
    # ============ 二：画不出来的时候 ============
    # 让那一页拿不到 WebGL：它说出岔子了，开屏换成定格图，点一下进门
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("try { if (!sessionStorage.getItem('kfs-t')) { localStorage.setItem('kfs-theme', 'heiye'); sessionStorage.setItem('kfs-t', '1'); } } catch (e) {}"
                         "if (location.pathname.includes('/assets/mirror-')) { HTMLCanvasElement.prototype.getContext = function () { return null; }; }")
    login(page, False)
    splash = page.locator(".kfs-splash-heiye")
    splash.wait_for(timeout=30000)
    for _ in range(150):
        if splash.get_attribute("data-kfs-mirror-mode") == "still":
            break
        time.sleep(0.2)
    ok(splash.get_attribute("data-kfs-mirror-mode") == "still" and mirror_frame(page) is None and page.get_by_text("点一下进门").is_visible(),
       "那一页拿不到 WebGL：说出岔子了，框拆掉，只剩定格图，底下写着“点一下进门”")
    shot(page, "m4_still")
    page.mouse.click(196, 300)
    page.locator(".kfs-motto").wait_for(timeout=15000)
    ok(True, "定格图点一下就进门")
    ctx.close()

    # ============ 二之二：画着画着卡住了（不报错地停下） ============
    # 那一页的每一帧循环停掉：心跳没了，开屏好几秒听不到，换成定格图，点一下进门
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    # 软着画一帧最多七八秒：“多久听不到算卡住”放宽到 15 秒（手机上是 8 秒，心跳两秒一声）
    page.add_init_script("try { if (!sessionStorage.getItem('kfs-t')) { localStorage.setItem('kfs-theme', 'heiye'); localStorage.setItem('kfs-mirror-debug', '1'); localStorage.setItem('kfs-mirror-stall', '15000'); sessionStorage.setItem('kfs-t', '1'); } } catch (e) {}")
    login(page, False)
    splash = page.locator(".kfs-splash-heiye")
    splash.wait_for(timeout=30000)
    for _ in range(300):
        if splash.get_attribute("data-kfs-mirror-mode") == "live":
            break
        time.sleep(0.2)
    time.sleep(16.0)   # 好好画着的时候过了“卡住”的那个数也不换
    live_still_live = splash.get_attribute("data-kfs-mirror-mode") == "live"
    fr = mirror_frame(page)
    fr.evaluate("() => { window.requestAnimationFrame = () => 0; }")
    t_stop = time.time()
    for _ in range(200):
        if splash.get_attribute("data-kfs-mirror-mode") == "still":
            break
        time.sleep(0.2)
    waited = time.time() - t_stop
    ok(live_still_live and splash.get_attribute("data-kfs-mirror-mode") == "still" and mirror_frame(page) is None and 4 < waited < 28
       and page.evaluate("localStorage.getItem('kfs-mirror-try')") is None,
       f"画着画着卡住了：心跳停了 {waited:.1f} 秒，开屏换成定格图（之前好好画着的那几秒不算卡），记号擦掉")
    page.mouse.click(196, 300)
    page.locator(".kfs-motto").wait_for(timeout=15000)
    ok(True, "卡住以后定格图点一下照样进门")
    ctx.close()

    # ============ 二之三：上回放到一半整页没了 ============
    # 记号没擦掉（装成上回放到一半被系统杀掉）：这一回先只摆定格图、不装那一页；擦掉记号，下一回照样放
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    page.add_init_script("try { if (!sessionStorage.getItem('kfs-t')) { localStorage.setItem('kfs-theme', 'heiye'); localStorage.setItem('kfs-mirror-try', '1'); localStorage.setItem('kfs-mirror-stall', '120000'); sessionStorage.setItem('kfs-t', '1'); } } catch (e) {}")
    login(page, False)
    splash = page.locator(".kfs-splash-heiye")
    splash.wait_for(timeout=30000)
    time.sleep(1.0)
    ok(splash.get_attribute("data-kfs-mirror-mode") == "still" and mirror_frame(page) is None and page.get_by_text("点一下进门").is_visible()
       and page.evaluate("localStorage.getItem('kfs-mirror-try')") is None,
       "上回放到一半整页没了：这一回先只摆定格图，记号擦掉")
    page.mouse.click(196, 300)
    page.locator(".kfs-motto").wait_for(timeout=15000)
    page.reload()
    splash = page.locator(".kfs-splash-heiye")
    splash.wait_for(timeout=30000)
    for _ in range(300):
        if splash.get_attribute("data-kfs-mirror-mode") != "loading":
            break
        time.sleep(0.2)
    ok(splash.get_attribute("data-kfs-mirror-mode") == "live" and mirror_frame(page) is not None, "再打开一回：照样放镜碎入月")
    ctx.close()

    errors.clear()   # 二那一段是故意让那一页拿不到 WebGL，那边报的错不算
    # ============ 三：别的主题不动 ============
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    page.add_init_script("try { if (!sessionStorage.getItem('kfs-t')) { localStorage.setItem('kfs-theme', 'qinglv'); sessionStorage.setItem('kfs-t', '1'); } } catch (e) {}")
    login(page, False)
    page.get_by_role("button", name="戳一下燕子，进开封府").wait_for(timeout=30000)
    ok(page.locator(".kfs-splash-heiye").count() == 0 and mirror_frame(page) is None, "青绿还是戳燕子，不装镜碎入月那一页")
    ctx.close()
    browser.close()

real = first_errors + errors
ok(not real, f"真的那一页走一遍、青绿那一遍，都没报错（{real[:3]}）")
print(f"\n通过 {passed}  失败 {failed}")
sys.exit(1 if failed else 0)
