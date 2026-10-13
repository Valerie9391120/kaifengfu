# 开封府走一圈拍照：门口、开屏、空对话、聊天、照片和文档、侧栏、几张面板、闲笔集、历史对话……每个主题各走一遍。
# 不是测试，不判对错，只拍：装修前后各拍一遍，拿 tests/look_diff.py 一张一张比（收拢那一步要一个像素都不差），
# 或者拿去给她看样子。
#
# 先在 source/ 里：npm run build:test，再开两个服务（同 tests/e2e.py）：
#   npm run mock                         （假 Supabase，8787）
#   cd dist-test && python3 -m http.server 8080
# 然后：python3 tests/look.py 输出目录 [主题 ...]      主题不写就是三套：qinglv dingxiang heiye（包里没有的主题会退回青绿，照样拍）
# 拿老包比的时候，老包另起一个端口，KFS_BASE=http://127.0.0.1:8081/ python3 tests/look.py 另一个目录
#
# 时间钉在 2026-10-12 23:27（都柏林）：日期卡片、日记、聊天里的时间每回都一样，前后两遍才比得上。
# 截图时把动画停掉（animations="disabled"），呼吸、飘动的那些也停在同一处。
# 回话照排好的来（假 Supabase 的 /__debug/reply-queue），不是“收到：……”。
import io, json, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("KFS_BASE", "http://127.0.0.1:8080/")
MOCK = os.environ.get("KFS_MOCK", "http://127.0.0.1:8787")
CHROME = os.environ.get("CHROME_PATH", "/opt/google/chrome/chrome" if os.path.exists("/opt/google/chrome/chrome") else None)
MINGTIE = os.path.join(HERE, "fixtures", "名帖-测试.md")
MDFILE = os.path.join(HERE, "fixtures", "文档-测试.md")
PASS = "test-passphrase-123"
NOW = "2026-10-12T23:27:00+01:00"

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "look")
themes = sys.argv[2:] or ["qinglv", "dingxiang", "heiye"]
os.makedirs(out, exist_ok=True)
notes = []


def queue(text):
    urllib.request.urlopen(MOCK + "/__debug/reply-queue?text=" + urllib.parse.quote(text)).read()


# 一张编的照片（照 tests/e2e_gesture.py 的 fake_photo）
def fake_photo(w=900, h=1200):
    im = Image.new("RGB", (w, h), (236, 228, 240))
    d = ImageDraw.Draw(im)
    for k, r in enumerate(range(380, 20, -60)):
        d.ellipse([w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r], outline=(150 + k * 12, 120 + k * 10, 200 - k * 8), width=6)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def long_press(page, locator, hold=0.7):
    box = locator.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    cdp = page.context.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    time.sleep(hold)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    cdp.detach()
    time.sleep(0.6)


def tour(browser, theme):
    urllib.request.urlopen(MOCK + "/__debug/reset").read()
    tdir = os.path.join(out, theme)
    os.makedirs(tdir, exist_ok=True)
    ctx = browser.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              locale="zh-CN", timezone_id="Europe/Dublin")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    page.clock.install(time=NOW)
    page.clock.resume()
    # 主题记在这台手机的 localStorage 里：头一回打开之前就写好
    # 黑夜的开屏（镜碎入月）要 WebGL，这里软着画太慢、每回也不一样：只摆定格图（kfs-mirror-still，见 src/SplashHeiye.jsx）。
    # 真的那一页另有 tests/e2e_mirror.py
    page.add_init_script(f"try {{ if (!sessionStorage.getItem('kfs-look-theme')) {{ localStorage.setItem('kfs-theme', '{theme}'); localStorage.setItem('kfs-mirror-still', '1'); sessionStorage.setItem('kfs-look-theme', '1'); }} }} catch (e) {{}}")

    def shot(name, settle=0.5):
        time.sleep(settle)
        page.screenshot(path=os.path.join(tdir, name + ".png"), animations="disabled")

    def sheet_top():
        page.evaluate("(() => { const b = document.querySelector('.kfs-sheet-box'); if (b) b.scrollTop = 0; })()")

    # ---------- 门口 ----------
    page.goto(BASE)
    page.get_by_text("进门先报上名来").wait_for(timeout=20000)
    shot("01_gate", 1.0)
    page.locator("input[type=email]").fill("qing@example.com")
    page.locator("input[type=password]").fill("wrong")
    page.get_by_role("button", name="进府").click()
    page.get_by_text("邮箱或密码不对").wait_for(timeout=10000)
    page.evaluate("document.activeElement && document.activeElement.blur()")
    shot("02_gate_error", 0.6)
    page.locator("input[type=password]").fill("correct-horse")
    page.get_by_role("button", name="进府").click()
    page.get_by_text("设一句暗号").wait_for(timeout=15000)
    shot("03_setpass")
    fields = page.locator("form input")
    fields.nth(0).fill(PASS)
    fields.nth(1).fill(PASS)
    page.get_by_role("button", name="设好了").click()

    # ---------- 开屏 ----------
    # 青绿戳燕子，丁香拉滑块；别的主题看它自己开屏上带 data-kfs-splash-enter 的那一块（点它进门，点几下由它自己说：data-kfs-splash-enter="2" 是两下）
    kite = page.get_by_role("button", name="戳一下燕子，进开封府")
    knob = page.get_by_role("slider", name="把小猪拉到最右边，进开封府")
    enter_any = page.locator("[data-kfs-splash-enter]")
    for _ in range(300):
        if kite.count() or knob.count() or enter_any.count():
            break
        time.sleep(0.1)
    time.sleep(2.0)
    shot("04_splash", 0.2)
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
                shot("04b_splash_after", 0.2)
    page.locator(".kfs-motto").wait_for(timeout=30000)
    shot("05_empty", 1.2)

    # ---------- 万岁殿（记忆库）：传名帖 ----------
    page.get_by_text("记忆库还是空的").click()
    page.locator("input[type=file][multiple]:not([accept])").set_input_files(MINGTIE)
    page.get_by_text("新增 1 份").wait_for(timeout=10000)
    shot("06_memory", 0.8)
    page.get_by_role("button", name="关闭").click()
    time.sleep(0.6)

    # ---------- 聊天 ----------
    ta = page.get_by_placeholder("说话，我听着")
    convo = [
        ("在干嘛呀", "<thinking>她又熬到这个点。</thinking>\n在等你说晚安。\n[SPLIT]\n十二点了。", "十二点了。"),
        ("再五分钟！", "上回也是五分钟。", "上回也是五分钟。"),
        ("这回是真的五分钟 ^^", "<thinking>拿她没办法。</thinking>\n躺下。我数到三。", "躺下。我数到三。"),
    ]
    for say, reply, last in convo:
        queue(reply)
        ta.fill(say)
        ta.press("Enter")
        page.get_by_text(last, exact=True).last.wait_for(timeout=30000)
        time.sleep(1.0)
    page.evaluate("document.activeElement && document.activeElement.blur()")
    shot("07_chat", 1.0)

    page.get_by_role("button", name=re.compile("思考过程")).last.click()
    shot("08_thinking", 0.8)
    page.get_by_role("button", name=re.compile("思考过程")).last.click()
    time.sleep(0.4)

    ta.fill("好嘛")
    page.evaluate("document.activeElement && document.activeElement.blur()")
    shot("09_typed", 0.6)
    ta.fill("")
    page.evaluate("document.activeElement && document.activeElement.blur()")

    page.get_by_role("button", name="表情包").click()
    shot("10_memes", 0.8)
    page.get_by_role("button", name="表情包").click()
    time.sleep(0.5)

    bubble = page.locator("div.whitespace-pre-wrap.break-words", has_text=re.compile("^上回也是五分钟。$")).first
    long_press(page, bubble)
    shot("11_msgmenu", 0.6)
    page.mouse.click(196, 140)
    time.sleep(0.6)

    # ---------- 照片和文档 ----------
    picker = page.locator('input[type=file][accept*=".docx"]')
    picker.set_input_files([{"name": "窗外.png", "mimeType": "image/png", "buffer": fake_photo()},
                            {"name": "文档-测试.md", "mimeType": "text/markdown", "buffer": open(MDFILE, "rb").read()}])
    page.locator(".kfs-doc-chip").first.wait_for(timeout=10000)
    shot("12_attach", 0.8)
    queue("<thinking>她拍的。</thinking>\n好看。\n[SPLIT]\n清单我替你理好了：\n[DOC:明天要买的.md]\n# 明天要买的\n\n- 酸奶两盒\n- 青菜一把\n- `面条`一包，不许是泡面\n\n```\n十二点前睡\n```\n[/DOC]")
    ta.fill("看看这个")
    ta.press("Enter")
    page.get_by_text("清单我替你理好了：", exact=False).last.wait_for(timeout=30000)
    time.sleep(1.5)
    page.evaluate("document.activeElement && document.activeElement.blur()")
    shot("13_media", 1.0)
    card = page.get_by_text("明天要买的.md").last
    card.click()
    page.get_by_text("不许是泡面", exact=False).wait_for(timeout=10000)
    shot("14_doc", 0.8)
    page.get_by_role("button", name="关闭").last.click()
    time.sleep(0.6)

    # ---------- 侧栏 ----------
    page.get_by_role("button", name="打开侧栏").click()
    shot("15_sidebar", 1.0)
    long_press(page, page.locator(".kfs-days"))
    shot("16_lotus_door", 0.6)
    page.mouse.click(60, 50)   # 点侧栏顶上的“开封府”：门那一行变回去
    time.sleep(0.6)

    # ---------- 几张面板 ----------
    page.get_by_text("MCP", exact=True).click()
    shot("17_mcp", 0.9)
    page.get_by_role("button", name="关闭").click(); time.sleep(0.5)
    page.get_by_text("API", exact=True).click()
    page.get_by_role("button", name="测试连接").click()
    page.get_by_text(re.compile("连上了")).wait_for(timeout=10000)
    sheet_top()   # 点“测试连接”的时候测试工具会把面板滚一下（有时滚、有时不滚）：拍之前滚回最上面，前后两遍才一样
    shot("18_api", 0.6)
    page.get_by_role("button", name="关闭").click(); time.sleep(0.5)
    page.get_by_role("button", name=re.compile("^南衙")).click()
    page.locator(".kfs-nanya-row", has_text="闲笔集").wait_for(timeout=5000)
    shot("19_nanya", 0.8)
    page.locator(".kfs-nanya-row", has_text="闲笔集").click()
    page.locator(".kfs-page").wait_for(timeout=10000)
    shot("20_diary", 1.0)
    page.get_by_role("button", name="返回").first.click(); time.sleep(0.6)

    page.get_by_role("button", name="头像与设置").click()
    page.get_by_text("云端同步").wait_for(timeout=5000)
    time.sleep(2.5)
    shot("21_account", 0.4)
    page.get_by_role("button", name="改昵称").click()
    page.get_by_label("我的昵称").wait_for(timeout=5000)   # 不能让它失焦：点别处就算改好，输入框就收了（截图默认不画光标）
    sheet_top()
    shot("22_nick", 0.6)
    page.get_by_role("button", name="保存昵称").click(); time.sleep(0.4)
    page.evaluate("(() => { const b = document.querySelector('.kfs-sheet-box'); if (b) b.scrollTop = b.scrollHeight; })()")
    shot("23_account_bottom", 0.6)
    page.get_by_role("button", name="关闭").click(); time.sleep(0.5)

    item = page.locator(".kfs-history button").nth(1)
    long_press(page, item)
    shot("24_chatmenu", 0.6)
    page.mouse.click(60, 50); time.sleep(0.6)

    page.get_by_role("button", name=re.compile("历史对话")).first.click()
    shot("25_history", 1.0)
    page.get_by_role("button", name="返回").first.click(); time.sleep(0.6)

    if errs:
        notes.append(f"{theme}: 页面报错 {errs[:5]}")
    ctx.close()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    for th in themes:
        t0 = time.time()
        tour(browser, th)
        print(f"{th}: 拍完，{time.time() - t0:.0f} 秒")
    browser.close()
print("\n".join(notes) if notes else "没有报错")
