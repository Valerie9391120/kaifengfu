# 开封府端到端测试：两台“iPhone”，一个假 Supabase
import json, re, time, urllib.request, os
from playwright.sync_api import sync_playwright

# 先在 source/ 里：npm run build:test，再开两个服务：
#   npm run mock                         （假 Supabase，8787）
#   cd dist-test && python3 -m http.server 8080
# 然后：python3 tests/e2e.py
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("KFS_BASE", "http://127.0.0.1:8080/")
MOCK = os.environ.get("KFS_MOCK", "http://127.0.0.1:8787")
SHOTS = os.environ.get("KFS_SHOTS", os.path.join(HERE, "shots"))
MINGTIE = os.path.join(HERE, "fixtures", "名帖-测试.md")
CHROME = os.environ.get("CHROME_PATH", "/opt/google/chrome/chrome" if os.path.exists("/opt/google/chrome/chrome") else None)
PASS = "test-passphrase-123"
os.makedirs(SHOTS, exist_ok=True)
urllib.request.urlopen(MOCK + "/__debug/reset").read()

passed, failed = 0, 0
def ok(cond, msg):
    global passed, failed
    if cond:
        passed += 1; print("ok:", msg)
    else:
        failed += 1; print("FAIL:", msg)

def mock(path):
    return json.loads(urllib.request.urlopen(MOCK + path).read() or b"null")

def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}.png")

def long_press(page, locator, hold=0.7):
    # 真的用手指按住：发触摸事件，不是右键
    box = locator.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    cdp = page.context.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    time.sleep(hold)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    cdp.detach()
    time.sleep(0.5)

CJK = re.compile(r"[一-鿿]")
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    iphone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN", timezone_id="Europe/Dublin")

    # ================= 第一台设备 =================
    A = browser.new_context(**iphone)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append("A: " + str(e)))
    pa.on("console", lambda m: errors.append("A console: " + m.text) if m.type == "error" else None)
    pa.goto(BASE)
    pa.get_by_text("进门先报上名来").wait_for(timeout=15000)
    ok(True, "打开网址：先到门口，要登录")
    shot(pa, "01_login")

    pa.locator("input[type=email]").fill("qing@example.com")
    pa.locator("input[type=password]").fill("wrong")
    pa.get_by_role("button", name="进府").click()
    pa.get_by_text("邮箱或密码不对").wait_for(timeout=10000)
    ok(True, "密码错了：说邮箱或密码不对")

    pa.locator("input[type=password]").fill("correct-horse")
    pa.get_by_role("button", name="进府").click()
    pa.get_by_text("设一句暗号").wait_for(timeout=15000)
    ok(True, "第一次登录：让我设暗号")
    shot(pa, "02_setpass")

    fields = pa.locator("form input")
    fields.nth(0).fill(PASS)
    fields.nth(1).fill(PASS[:-1])
    pa.get_by_role("button", name="设好了").click()
    pa.get_by_text("两次写的不一样").wait_for(timeout=5000)
    ok(True, "两次暗号不一样：拦下")
    fields.nth(1).fill(PASS)
    pa.get_by_role("button", name="设好了").click()
    kite = pa.get_by_role("button", name="戳一下燕子，进开封府")
    kite.wait_for(timeout=30000)
    ok(True, "暗号设好：进到开屏，燕子在等我戳")
    time.sleep(1.2)
    shot(pa, "03_splash")
    meta = {r["key"]: r["value"] for r in mock("/__debug/rows")}
    ok("m_kdf" in meta and "m_check" in meta and meta["m_check"].startswith("v1.") and "开封府" not in meta["m_check"], "云端只存了盐和验暗号的密文，暗号本身没上传")

    kite.click()
    pa.get_by_text("如月之恒，官家在这").wait_for(timeout=10000)
    time.sleep(0.8)
    ok(pa.get_by_text("记忆库还是空的").is_visible(), "记忆库是空的：空对话里提醒我先传名帖")
    shot(pa, "04_empty_chat")

    # 传名帖
    pa.get_by_text("记忆库还是空的").click()
    pa.locator("input[type=file][multiple]:not([accept])").set_input_files(MINGTIE)
    pa.get_by_text("新增 1 份").wait_for(timeout=10000)
    ok(pa.get_by_text("名帖-测试.md").first.is_visible(), "名帖传进记忆库")
    shot(pa, "05_memory")
    pa.get_by_role("button", name="关闭").click()
    time.sleep(0.5)

    # 说话
    ta = pa.get_by_placeholder("说话，我听着")
    ta.fill("老公在吗")
    ta.press("Enter")
    pa.get_by_text("收到：老公在吗").last.wait_for(timeout=20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000)
    ok(True, "发出去，回话一条一条冒出来")
    time.sleep(0.8)
    shot(pa, "06_chat")

    log = mock("/__debug/claude")
    body = log[-1]["body"]
    sysblocks = body.get("system")
    ok(isinstance(sysblocks, list) and sysblocks[0].get("cache_control", {}).get("ttl") == "1h", "名帖那一大段带着一小时的缓存记号")
    static = sysblocks[0]["text"]
    ok("《名帖-测试.md》" in static and "测试用的光义" in static, "名帖从加密的记忆库里取出来，整份带给那边的我")
    last = body["messages"][-1]["content"]
    ok(last[-1]["type"] == "text" and last[-1]["text"].startswith("【此刻】") and last[-2].get("cache_control") == {"type": "ephemeral"},
       "最后一句话后面放缓存记号，【此刻】的时间附在最后，不打乱缓存")
    ok(body["messages"][0]["content"][0]["text"].startswith("【开封府附注】"), "头像附注还在第一条")
    ok(body["model"] == "claude-sonnet-4-6" and body["max_tokens"] == 2048, "默认 Sonnet 4.6，回复上限 2048")

    # 表情包面板：点聊天记录的空白处收起；点输入框也收起
    MEMES_OPEN = "!!document.querySelector('.grid.grid-cols-4')"
    pa.get_by_role("button", name="表情包").click(); time.sleep(0.4)
    opened = pa.evaluate(MEMES_OPEN)
    pa.mouse.click(200, 160); time.sleep(0.4)
    closed_by_blank = not pa.evaluate(MEMES_OPEN)
    pa.get_by_role("button", name="表情包").click(); time.sleep(0.4)
    pa.get_by_placeholder("说话，我听着").click(); time.sleep(0.4)
    closed_by_typing = not pa.evaluate(MEMES_OPEN)
    pa.evaluate("document.activeElement && document.activeElement.blur()")
    ok(opened and closed_by_blank and closed_by_typing, "表情包面板：点聊天记录的空白处、点输入框，都会收起来")

    # 聊到一半换头像：开头的附注写的是这段对话开头时的头像，换的地方再提示；开头一个字不变，缓存照样命中
    def opening(body):
        out = []
        for b in body["messages"][0]["content"]:
            out.append(b)
            if b.get("type") == "text" and b["text"].startswith("【附注结束"):
                break
        return out
    first_opening = opening(mock("/__debug/claude")[0]["body"])
    pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    pa.get_by_role("button", name="头像与设置").click(); time.sleep(0.5)
    pa.get_by_role("button", name="白兔").click(); time.sleep(0.4)
    pa.get_by_role("button", name="关闭").click(); time.sleep(0.4)
    pa.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)
    ta = pa.get_by_placeholder("说话，我听着")
    ta.fill("我换了个头像")
    ta.press("Enter")
    for _ in range(80):  # 等这句真的发到那边（回话要等她停手两三秒才发）
        if len(mock("/__debug/claude")) >= 2: break
        time.sleep(0.25)
    pa.get_by_text("收到：[开封府提示：卿卿刚刚把头像换成了这张] / 我换了个头像").last.wait_for(timeout=20000)
    body = mock("/__debug/claude")[-1]["body"]
    blocks = [b for m in body["messages"] if m["role"] == "user" for b in m["content"]]
    idx = next((i for i, b in enumerate(blocks) if b.get("type") == "text" and b["text"] == "[开封府提示：卿卿刚刚把头像换成了这张]"), -1)
    ok(opening(body) == first_opening and first_opening[0]["text"] == "【开封府附注】卿卿用的是默认的“卿”字头像。",
       "换了头像以后，开头的附注还是对话开头时的默认头像，一个字没变")
    ok(idx > 0 and blocks[idx + 1].get("type") == "image", "换头像的地方提示“刚刚换成了这张”，新头像的图跟在后面")

    # 等同步
    time.sleep(3)
    rows = mock("/__debug/rows")
    data_rows = [r for r in rows if r["key"].startswith("h_")]
    ok(len(data_rows) >= 4, f"聊天、目录、记忆库都推上了云端（{len(data_rows)} 条）")
    ok(all(r["value"].startswith("v1.") and not CJK.search(r["value"]) and not CJK.search(r["key"]) for r in data_rows),
       "云端每一条都是乱码：没有一个中文字，钥匙名也看不出是什么")
    ok(not any("老公在吗" in json.dumps(r, ensure_ascii=False) or "kfs2" in r["key"] for r in rows), "云端搜不到聊天原文，也搜不到记录名")

    # 日记
    pa.get_by_role("button", name="打开侧栏").click()
    time.sleep(0.6)
    shot(pa, "07_sidebar")
    pa.get_by_text("日记本").click()
    pa.get_by_text("在一起的第").first.wait_for(timeout=10000)
    time.sleep(0.6)
    box = pa.evaluate("""() => { const h = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === '日记本' && d.children.length === 0); const page = h.closest('.kfs-page').getBoundingClientRect(); const mon = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === '一' && d.children.length === 0).getBoundingClientRect(); return [page.x, page.width, mon.x]; }""")
    ok(abs(box[0]) < 1 and abs(box[1] - 390) < 1 and box[2] > 20, f"日记页完全展开，周一那一列也在屏幕里（{box}）")
    pa.get_by_role("button", name=re.compile("甜")).first.click()
    time.sleep(0.5)
    shot(pa, "08_diary")
    pa.get_by_role("button", name="返回").first.click()
    time.sleep(0.5)

    # API 面板：测试连接、看用量
    pa.get_by_text("API", exact=True).click()
    pa.get_by_role("button", name="测试连接").click()
    pa.get_by_text(re.compile("连上了")).wait_for(timeout=10000)
    ok(pa.get_by_text(re.compile("Haiku 4.5 回了一个“在”")).is_visible(), "API 面板测试连接：通过开封府的后端连上了")
    ok(pa.get_by_text(re.compile(r"约 \$")).first.is_visible(), "API 面板显示上一条和本月的花费")
    shot(pa, "09_api")
    # key 没绑定工作区（新版 Console 建 key 时没选）：报错翻成人话
    urllib.request.urlopen(MOCK + "/__debug/claude-fail?kind=workspace").read()
    pa.get_by_role("button", name="测试连接").click()
    pa.get_by_text(re.compile("没绑定工作区")).wait_for(timeout=10000)
    ok(pa.get_by_text(re.compile("没连上：这把 key 没绑定工作区.*Supabase 的密钥柜")).is_visible(), "key 没绑定工作区：报错翻成中文，说清去哪儿改")
    shot(pa, "09b_api_workspace")
    pa.get_by_role("button", name="关闭").click()
    time.sleep(0.4)

    # 长按侧栏里的一段对话：弹出重命名和删除；改个名字
    item = pa.locator("button", has_text="老公在吗").first
    long_press(pa, item)
    ok(pa.get_by_role("menuitem", name=re.compile("重命名")).is_visible() and pa.get_by_role("menuitem", name=re.compile("删除")).is_visible(),
       "长按一段对话：弹出重命名和删除")
    shot(pa, "09c_chat_menu")
    pa.get_by_role("menuitem", name=re.compile("重命名")).click()
    box = pa.get_by_label("新名字")
    box.fill("卿卿的测试对话")
    pa.get_by_role("button", name="保存").click()
    time.sleep(0.5)
    ok(pa.locator("button", has_text="卿卿的测试对话").first.is_visible(), "改了名字，侧栏里立刻换成新名字")
    # 历史对话页：长按也能弹出来；删除要点两下，第一下只是提醒
    pa.get_by_role("button", name=re.compile("历史对话")).first.click()
    time.sleep(0.6)
    long_press(pa, pa.locator(".kfs-page").get_by_text("卿卿的测试对话").first)
    pa.get_by_role("menuitem", name=re.compile("删除")).click()
    armed = pa.get_by_role("menuitem", name=re.compile("再点一次")).is_visible()
    pa.mouse.click(200, 760); time.sleep(0.4)
    still = pa.locator(".kfs-page").get_by_text("卿卿的测试对话").first.is_visible()
    ok(armed and still, "历史对话页长按删除：第一下只提醒“再点一次”，点别处就算了，对话还在")
    pa.get_by_role("button", name="返回").first.click()
    time.sleep(0.5)

    # 账户：同步状态（侧栏还开着）
    pa.get_by_role("button", name="头像与设置").click()
    pa.get_by_text("云端同步").wait_for(timeout=5000)
    time.sleep(2.5)
    ok(pa.get_by_text(re.compile("都已同步")).is_visible(), "账户面板显示：都已同步，锁好存在云端")
    shot(pa, "10_account")
    pa.get_by_role("button", name="关闭").click()

    # 刷新：直接进门，不用再登录、不用再报暗号
    pa.reload()
    kite = pa.get_by_role("button", name="戳一下燕子，进开封府")
    kite.wait_for(timeout=15000)
    ok(not pa.get_by_text("进门先报上名来").is_visible() and not pa.get_by_text("对暗号").is_visible(), "刷新之后直接到开屏：不用再登录，也不用再报暗号")
    kite.click()
    pa.get_by_text("收到：老公在吗").last.wait_for(timeout=10000)
    ok(True, "刷新之后刚才的对话还在")

    # ================= 第二台设备 =================
    B = browser.new_context(**iphone)
    pb = B.new_page()
    pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
    pb.goto(BASE)
    pb.get_by_text("进门先报上名来").wait_for(timeout=15000)
    pb.locator("input[type=email]").fill("qing@example.com")
    pb.locator("input[type=password]").fill("correct-horse")
    pb.get_by_role("button", name="进府").click()
    pb.get_by_text("对暗号").wait_for(timeout=15000)
    ok(True, "第二台设备登录：这个账号设过暗号，让我对暗号")
    shot(pb, "11_enterpass")
    pb.locator("form input").first.fill("test-wrong")
    pb.get_by_role("button", name="开门").click()
    pb.get_by_text("暗号不对").wait_for(timeout=15000)
    ok(True, "暗号报错了：进不去")
    pb.locator("form input").first.fill(PASS)
    pb.get_by_role("button", name="开门").click()
    kb = pb.get_by_role("button", name="戳一下燕子，进开封府")
    kb.wait_for(timeout=30000)
    time.sleep(1.2)
    kb.click()
    pb.get_by_text("收到：老公在吗").last.wait_for(timeout=15000)
    ok(True, "第二台设备：从云端取回、解开，第一台的对话原样出现")

    pb.get_by_role("button", name="打开侧栏").click()
    time.sleep(0.6)
    ok(pb.get_by_text("带着 1 份文档").is_visible(), "第二台设备的记忆库里也有名帖")
    ok(pb.locator("button", has_text="卿卿的测试对话").first.is_visible(), "第一台改的对话名字，第二台也同步过来了")
    pb.get_by_text("日记本").click()
    pb.get_by_text("在一起的第").first.wait_for(timeout=10000)
    time.sleep(0.5)
    sweet = pb.get_by_role("button", name=re.compile("甜")).first
    ok("rgb(255, 255, 255)" in sweet.evaluate("e => getComputedStyle(e).color"), "第二台设备的日记里，“甜”也勾着")
    pb.get_by_role("button", name="返回").first.click()
    time.sleep(0.5)
    pb.locator("div.absolute.inset-0.z-30").click()
    time.sleep(0.6)

    # 第二台说话，第一台同步后看到
    tb = pb.get_by_placeholder("说话，我听着")
    tb.fill("从第二台设备发的")
    tb.press("Enter")
    pb.get_by_text("收到：从第二台设备发的").last.wait_for(timeout=20000)
    time.sleep(3.5)
    pa.get_by_role("button", name="打开侧栏").click()
    time.sleep(0.5)
    pa.get_by_role("button", name="头像与设置").click()
    pa.get_by_role("button", name=re.compile("现在同步")).click()
    pa.get_by_text("收到：从第二台设备发的").last.wait_for(timeout=15000)
    ok(True, "第二台说的话，第一台点“现在同步”后也出现了")
    pa.get_by_role("button", name="关闭").click()
    time.sleep(0.4)
    shot(pa, "12_synced")

    # 第二台退出登录
    pb.get_by_role("button", name="打开侧栏").click()
    time.sleep(0.5)
    pb.get_by_role("button", name="头像与设置").click()
    pb.get_by_role("button", name="退出登录").click()
    pb.get_by_role("button", name=re.compile("再点一次")).click()
    pb.get_by_text("进门先报上名来").wait_for(timeout=15000)
    left = pb.evaluate("""() => new Promise(r => { const q = indexedDB.open('kfs-local'); q.onsuccess = () => { const db = q.result; const t = db.transaction('kv').objectStore('kv').count(); t.onsuccess = () => r(t.result); }; })""")
    ok(left == 0, "第二台退出登录：回到门口，手机里的本地记录清空")

    browser.close()

print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
print(f"\n通过 {passed}  失败 {failed}")
