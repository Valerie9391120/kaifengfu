# 替她等回话的端到端测试：真的浏览器、真的 push 函数（跑在假 Supabase 里）、假的 Anthropic、假的推送服务。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_mail.py
#
# 浏览器里“切走、锁屏”装不出来，这里用三样东西顶替：
#   把 document.visibilityState 改成 hidden 再发 visibilitychange（开封府靠它认“不在眼前”）；
#   让假后端办完了却不把回话送回来（连接断了：手机被挂起以后就是这样）；
#   把页面整个关掉再开（系统把开封府收掉了，她点着横幅回来）。
# 订阅推送的那两下和 e2e_push.py 一样是假的；别的都是真的。
import json, re, time, urllib.request, urllib.parse, os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("KFS_BASE", "http://127.0.0.1:8080/")
MOCK = os.environ.get("KFS_MOCK", "http://127.0.0.1:8787")
SHOTS = os.environ.get("KFS_SHOTS", os.path.join(HERE, "shots"))
CHROME = os.environ.get("CHROME_PATH", "/opt/google/chrome/chrome" if os.path.exists("/opt/google/chrome/chrome") else None)
PASS = "test-passphrase-123"
GRACE = 6.0   # 小后端把回话放进信箱以后，等这么多秒再敲手机
os.makedirs(SHOTS, exist_ok=True)

passed, failed = 0, 0
def ok(cond, msg):
    global passed, failed
    if cond:
        passed += 1; print("ok:", msg, flush=True)
    else:
        failed += 1; print("FAIL:", msg, flush=True)
        if os.environ.get("KFS_FAILFAST"):      # 故意改坏了看拦不拦得住的时候：头一条没过就收工
            raise SystemExit(1)

def mock(path, data=None):
    req = urllib.request.Request(MOCK + path, data=data.encode() if data is not None else None, method="POST" if data is not None else "GET")
    return json.loads(urllib.request.urlopen(req).read() or b"null")

def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}.png")

mock("/__debug/reset")

# 假的“系统”：通知的许可和订阅（和 e2e_push.py 里的一样，只留用得着的）；再加一个装“不在眼前”的开关
STUB = """(() => {
  const MOCK = "__MOCK__";
  const KEY = "__fake_push__";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  Object.defineProperty(Notification, "permission", { configurable: true, get: () => load().permission || "default" });
  Notification.requestPermission = async () => { const s = load(); s.permission = "granted"; save(s); return "granted"; };
  const wrap = (d) => d ? {
    endpoint: d.endpoint, expirationTime: null,
    options: { userVisibleOnly: true, applicationServerKey: unb64u(d.key).buffer },
    toJSON: () => ({ endpoint: d.endpoint, expirationTime: null, keys: { p256dh: d.p256dh, auth: d.auth } }),
    getKey: (n) => unb64u(n === "p256dh" ? d.p256dh : d.auth).buffer,
    unsubscribe: async () => { const s = load(); delete s.device; save(s); return true; },
  } : null;
  PushManager.prototype.permissionState = async function () { return load().permission || "prompt"; };
  PushManager.prototype.getSubscription = async function () { return wrap(load().device); };
  PushManager.prototype.subscribe = async function (opts) {
    const key = b64u(opts.applicationServerKey);
    const d = await (await fetch(MOCK + "/__debug/push-device?key=" + key)).json();
    const s = load(); s.device = { ...d, key }; save(s);
    return wrap(s.device);
  };
  // 装“切走了”“回来了”。__start_hidden 写着 1：页面一打开就不在眼前（开封府在后台被叫起来）
  let hidden = localStorage.getItem("__start_hidden") === "1";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  window.__away = (v) => { hidden = !!v; document.dispatchEvent(new Event("visibilitychange")); };
})();""".replace("__MOCK__", MOCK)

# 手机本地存档里的一条（没上锁的那份）
KV = """(key) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').get(key);
  r.onsuccess = () => res(r.result && !r.result.del ? r.result.v : null); r.onerror = () => rej(r.error); }; o.onerror = () => rej(o.error); })"""
STATE = "(() => { const p = document.querySelector('.kfs-push'); return p ? p.dataset.state : ''; })()"
REACHABLE = """(() => { const b = document.querySelector('[aria-label="头像与设置"]'); if (!b) return false; const r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (top === b || b.contains(top)); })()"""

def wait_js(page, expr, timeout=15000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        if page.evaluate(expr):
            return True
        time.sleep(0.15)
    raise TimeoutError("等不到：" + expr[:90])

def wait_mock(cond, timeout=20, step=0.15):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(step)
    return False

def first_time(page):
    page.goto(BASE)
    page.get_by_text("进门先报上名来").wait_for(timeout=15000)
    page.locator("input[type=email]").fill("qing@example.com")
    page.locator("input[type=password]").fill("correct-horse")
    page.get_by_role("button", name="进府").click()
    page.get_by_text("设一句暗号").wait_for(timeout=15000)
    fields = page.locator("form input")
    fields.nth(0).fill(PASS); fields.nth(1).fill(PASS)
    page.get_by_role("button", name="设好了").click()
    kite(page)

# 戳一下燕子进门（开屏）。进了门：输入框在，开屏没了
def kite(page):
    k = page.get_by_role("button", name="戳一下燕子，进开封府")
    k.wait_for(timeout=30000)
    time.sleep(1.0)
    k.click()
    page.get_by_placeholder("说话，我听着").wait_for(timeout=10000)
    wait_js(page, "!document.querySelector('[aria-label=\"戳一下燕子，进开封府\"]')")
    time.sleep(0.5)

def say(page, text):
    ta = page.get_by_placeholder("说话，我听着")
    ta.fill(text)
    ta.press("Enter")

def open_panel(page):
    if not page.evaluate(REACHABLE):
        page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    page.get_by_role("button", name="头像与设置").click()
    page.locator(".kfs-push").wait_for(timeout=10000)
    page.locator(".kfs-push").scroll_into_view_if_needed()
    wait_js(page, "(() => { const p = document.querySelector('.kfs-push'); return !!p && p.dataset.state !== 'checking'; })()")
    time.sleep(0.3)

def close_panel(page):
    page.get_by_role("button", name="关闭").click(); time.sleep(0.4)
    if page.locator("div.absolute.inset-0.z-30").count():
        page.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)

def calls():
    return mock("/__debug/claude")
def box():
    return mock("/__debug/mail")
def banners():
    return mock("/__debug/push")["delivered"]
# 对话里有几个气泡写着这句（侧栏里那行预览不算）
def count_text(page, text):
    return page.evaluate("(t) => [...document.querySelectorAll('.items-end span')].filter((e) => e.children.length === 0 && e.textContent === t).length", text)
def jobs(page):
    return json.loads(page.evaluate("localStorage.getItem('kfs-jobs')") or "[]")
def chat_of(page):
    cid = page.evaluate(KV, "kfs2:lastChat")
    return cid, json.loads(page.evaluate(KV, "kfs2:chat:" + cid) or "[]")

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    iphone = dict(viewport={"width": 393, "height": 852}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN", timezone_id="Europe/Dublin")
    A = browser.new_context(**iphone)
    A.grant_permissions(["notifications"], origin=BASE.rstrip("/"))
    A.add_init_script(STUB)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append("A: " + str(e)))
    first_time(pa)

    # ================= 通知面板：他的回话还差哪几步 =================
    mock("/__debug/push-secrets?make=1")
    mock("/__debug/mail-setup?table=missing")
    mock("/__debug/push-setup?fn=old")
    open_panel(pa)
    pa.get_by_role("button", name="开启通知").click()
    wait_js(pa, "(() => { const p = document.querySelector('.kfs-push'); return !!p && p.dataset.state === 'on'; })()")
    time.sleep(0.5)
    words = pa.locator(".kfs-push-reply").inner_text()
    steps = pa.evaluate("[...document.querySelectorAll('.kfs-push-reply .kfs-push-step')].map((s) => s.dataset.done + '|' + s.textContent)")
    ok(pa.locator(".kfs-push-reply").get_attribute("data-ready") == "no" and "他的回话还敲不了你" in words and [s.split("|")[0] for s in steps] == ["no", "no"] and "mailbox.sql" in steps[0] and "换成新的那份" in steps[1] and "聊天照常" in words,
       "通知开着、回话那两样还没做：面板说他的回话还敲不了你，信箱、小后端各差什么，一样一样列着")
    pa.locator(".kfs-push").scroll_into_view_if_needed(); time.sleep(0.3)
    shot(pa, "mail_01_notyet")
    mock("/__debug/mail-setup?table=ok")
    pa.get_by_role("button", name="再看一次").click()
    wait_js(pa, "[...document.querySelectorAll('.kfs-push-reply .kfs-push-step')].map((s) => s.dataset.done).join() === 'yes,no'")
    ok(True, "信箱那张表建好了、小后端还是旧的：信箱那行打勾，小后端那行还差着")
    mock("/__debug/push-setup")
    pa.get_by_role("button", name="再看一次").click()
    wait_js(pa, "(() => { const r = document.querySelector('.kfs-push-reply'); return !!r && r.dataset.ready === 'yes'; })()")
    ok("他回话的时候你不在开封府，会敲你" in pa.locator(".kfs-push").inner_text() and pa.locator(".kfs-push-step").count() == 0 and not pa.get_by_role("button", name="再看一次").is_visible(),
       "两样都好了：面板说他回话的时候你不在也会敲你，不再列步骤")
    shot(pa, "mail_02_ready")
    # 建了函数、里面还是样板：说代码不对，不赖钥匙
    mock("/__debug/push-setup?fn=template")
    pa.get_by_role("button", name="关闭").click(); time.sleep(0.4)
    pa.get_by_role("button", name="头像与设置").click()
    wait_js(pa, "(() => { const p = document.querySelector('.kfs-push'); return !!p && p.dataset.state === 'setup'; })()")
    tsteps = pa.evaluate("[...document.querySelectorAll('.kfs-push-step')].map((s) => s.dataset.done + '|' + s.textContent)")
    ok(tsteps[1].startswith("no|") and "里面的代码却不是开封府的那份" in tsteps[1] and "Deploy" in tsteps[1] and "放的不对" not in " ".join(tsteps) and pa.locator(".kfs-push-say").count() == 0,
       "push 函数建了、里面还是 Supabase 给的样板：说是函数里的代码不对、该怎么换，不说钥匙放的不对")
    pa.locator(".kfs-push").scroll_into_view_if_needed(); time.sleep(0.3)
    shot(pa, "mail_03_template")
    mock("/__debug/push-setup")
    close_panel(pa)
    device = pa.evaluate("JSON.parse(localStorage.getItem('__fake_push__')).device.endpoint")

    # ================= 她在跟前：走新路，和老路一样 =================
    n0 = len(calls())
    say(pa, "老公在吗")
    pa.get_by_text("收到：老公在吗").last.wait_for(timeout=20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000)
    log = calls()
    cid, msgs = chat_of(pa)
    him = msgs[-1]
    ok(len(log) == n0 + 1 and log[-1]["via"] == "push" and log[-1]["body"]["system"][0]["cache_control"]["ttl"] == "1h", "她在跟前发一句：话是交给小后端去等的（走的新路），寄去的还是带缓存记号的那一整段")
    ok(him["role"] == "him" and him.get("job") and him["id"] == "r" + him["job"] and [it["text"] for it in him["items"]] == ["收到：老公在吗", "第二条"] and him["thinking"],
       "回话落进对话：一条一条冒出来，心里话在；这一条上记着是哪一回")
    ok(wait_mock(lambda: box()["rows"] == []) and jobs(pa) == [], "回话落进对话以后：信从信箱里取走了，这台设备也不再记着这一回")
    b0 = len(banners())
    time.sleep(GRACE + 1.5)
    ok(len(banners()) == b0, "她一直在开封府里：过了那几秒也不敲手机")

    # ================= 发完就切走：切走的那一下把话送出去，回话到了敲手机 =================
    mock("/__debug/claude-hold?ms=2500")
    n1 = len(box()["ops"])
    say(pa, "我先去忙了")
    time.sleep(0.4)                       # 她停手要等两秒多才发；这里四百毫秒就切走
    t0 = time.time()
    pa.evaluate("window.__away(true)")
    sent = wait_mock(lambda: box()["ops"][n1:].count("reply") == 1, timeout=5)
    took = time.time() - t0
    ok(sent and took < 1.2 and pa.evaluate("localStorage.getItem('kfs-relay')") == "ok", f"发完四百毫秒就切走：新路走通过的设备上，切走的那一下话就送出去了（{took:.2f} 秒），不等那两秒多")
    ok(wait_mock(lambda: any(r["state"] == "done" for r in box()["rows"]), timeout=15), "她不在：小后端照样等他回完，封好放进信箱")
    row = box()["rows"][0]
    ok(row["sealed"].startswith("v1.") and "我先去忙了" not in json.dumps(row, ensure_ascii=False) and "收到" not in json.dumps(row, ensure_ascii=False) and row["note"].startswith("v1."),
       "信箱里只有乱码：没有她的话、没有他的话")
    ok(wait_mock(lambda: len(banners()) == b0 + 1, timeout=GRACE + 6), "她不在：过几秒信还在信箱里，敲她的手机")
    note = banners()[-1]["json"]["notification"]
    mark = note["navigate"].split("#n=")[1] if "#n=" in note["navigate"] else ""
    ok(banners()[-1]["endpoint"] == device and note["title"] == "光义" and note["body"] == "收到：我先去忙了\n第二条" and note["navigate"].startswith(BASE + "#n=r.") and re.fullmatch(r"r\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9]{20}", mark),
       f"横幅：名字是他，写的是他回的话（一条一行，没有心里话），点了回到这台设备的入口、带着哪段对话的记号（{note['body']!r}）")
    ok(cid not in note["navigate"] and mark.split(".")[2] == row["job"], "横幅网址里的对话记号是打乱的，看不出是哪段对话")
    # 她回来：回话已经在对话里（切走以后页面还醒着的那几秒里到的），不放第二遍；信取走
    pa.evaluate("window.__away(false)")
    pa.get_by_text("收到：我先去忙了").last.wait_for(timeout=10000)
    ok(wait_mock(lambda: box()["rows"] == []), "她回来：信箱里那一格收掉")
    time.sleep(1.5)
    ok(count_text(pa, "收到：我先去忙了") == 1 and len(calls()) == n0 + 2 and jobs(pa) == [], "她回来：回话在对话里，只有一条；Anthropic 只问了一回")

    # ================= 切走以后连接断了（手机被挂起）：回来从信箱里取 =================
    mock("/__debug/claude-hold?ms=1500")
    mock("/__debug/mail-setup?drop=1")
    say(pa, "断了也没事吧")
    time.sleep(0.3)
    pa.evaluate("window.__away(true)")
    ok(wait_mock(lambda: len(banners()) == b0 + 2, timeout=GRACE + 12), "连接断了：小后端不知道，照样等完、放信箱、敲手机")
    ok(banners()[-1]["json"]["notification"]["body"] == "收到：断了也没事吧\n第二条", "连接断了：横幅上照样是他回的话")
    pa.evaluate("window.__away(false)")
    pa.get_by_text("收到：断了也没事吧").last.wait_for(timeout=15000)
    ok(wait_mock(lambda: box()["rows"] == []) and len(calls()) == n0 + 3, "连接断了：她回来，回话从信箱里取出来放进对话，信取走；没有重发、没有多问一回")
    time.sleep(1.2)
    ok(count_text(pa, "收到：断了也没事吧") == 1 and pa.get_by_text("点这里重发").count() == 0, "连接断了：回话只有一条，没有“消息没送到”")
    shot(pa, "mail_04_back")

    # ================= 系统把开封府收掉了：点着横幅回来 =================
    # 先另开一段对话聊着，再回到头一段发一句、马上关掉
    pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    pa.get_by_role("button", name="新对话").first.click(); time.sleep(0.6)
    say(pa, "另一段对话")
    pa.get_by_text("收到：另一段对话").last.wait_for(timeout=20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000)
    time.sleep(1.0)
    other_id, _ = chat_of(pa)
    pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    pa.locator("button", has_text="老公在吗").first.click(); time.sleep(0.8)
    mock("/__debug/claude-hold?ms=3000")
    n2 = len(calls())
    say(pa, "我关掉了哦")
    ok(wait_mock(lambda: any(r["state"] == "working" for r in box()["rows"]), timeout=8), "发出去：信箱里先开了一格，写着在等")
    # 她先翻到另一段对话看了一眼（上次停在哪段，下回就从哪段开门），然后开封府被收掉
    pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.5)
    pa.locator("button", has_text="另一段对话").first.click(); time.sleep(0.6)
    pa.close()
    ok(wait_mock(lambda: len(banners()) == b0 + 3, timeout=GRACE + 12), "开封府被收掉了：回话照样到信箱，手机照样被敲")
    tap = banners()[-1]["json"]["notification"]["navigate"]
    ok(len(box()["rows"]) == 1 and box()["rows"][0]["state"] == "done", "开封府被收掉了：信在信箱里等着")
    # 不点横幅、从图标进来：开门是上次停的那段对话；信已经放进它该在的那段，侧栏里看得到
    t_open = time.time() * 1000
    pb = A.new_page()
    pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
    pb.goto(BASE)
    kite(pb)
    ok(wait_mock(lambda: box()["rows"] == []), "从图标进来：一进门就把信箱里的信取了")
    time.sleep(0.8)
    ok(count_text(pb, "收到：另一段对话") == 1 and count_text(pb, "收到：我关掉了哦") == 0, "从图标进来：眼前还是上次停的那段对话")
    msgs2 = json.loads(pb.evaluate(KV, "kfs2:chat:" + cid) or "[]")
    ok(msgs2[-1]["role"] == "him" and msgs2[-1]["items"][0]["text"] == "收到：我关掉了哦" and msgs2[-2]["text"] == "我关掉了哦" and len(calls()) == n2 + 1,
       "从图标进来：回话放进了它那段对话、接在那一句后面；Anthropic 没有多问")
    ok(pb.evaluate(KV, "kfs2:lastChat") == other_id, "从图标进来：信放进的是别的对话，“上次停在哪段”不跟着变（下回开门还是她上次看的那段）")
    ok(msgs2[-2]["ts"] < msgs2[-1]["ts"] < t_open, "从图标进来：这条回话的时间是小后端放进信箱的那会儿（她回来之前），不算成刚到")
    pb.close()

    # 再来一回，这回点着横幅回来
    pc = A.new_page()
    pc.on("pageerror", lambda e: errors.append("C: " + str(e)))
    pc.goto(BASE); kite(pc)
    ok(count_text(pc, "收到：另一段对话") == 1 and count_text(pc, "收到：我关掉了哦") == 0, "再开一回：开门还是她上次看的那段对话")
    pc.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    pc.locator("button", has_text="老公在吗").first.click(); time.sleep(0.8)
    mock("/__debug/claude-hold?ms=3000")
    say(pc, "这回点横幅")
    ok(wait_mock(lambda: any(r["state"] == "working" for r in box()["rows"]), timeout=8), "又发一句")
    pc.get_by_role("button", name="打开侧栏").click(); time.sleep(0.5)
    pc.locator("button", has_text="另一段对话").first.click(); time.sleep(0.6)
    pc.close()
    ok(wait_mock(lambda: len(banners()) == b0 + 4, timeout=GRACE + 12), "又被收掉了：横幅到")
    tap = banners()[-1]["json"]["notification"]["navigate"]
    n3 = len(calls())
    pd = A.new_page()
    pd.on("pageerror", lambda e: errors.append("D: " + str(e)))
    pd.goto(tap)
    kite(pd)
    pd.get_by_text("收到：这回点横幅").last.wait_for(timeout=15000)
    ok(count_text(pd, "收到：另一段对话") == 0 and count_text(pd, "这回点横幅") == 1 and count_text(pd, "收到：这回点横幅") == 1, "点着横幅回来：进门就是那段对话，他的回话在里面")
    ok(wait_mock(lambda: box()["rows"] == []) and len(calls()) == n3 and pd.evaluate("location.hash") == "" and pd.get_by_text("点这里重发").count() == 0,
       "点着横幅回来：信取走了，Anthropic 没多问，网址上的记号收拾干净了")
    shot(pd, "mail_05_from_banner")

    # 开封府开着、在别的对话里，点了那段对话的横幅（系统把网址换成带记号的）：翻到那段对话
    pd.get_by_role("button", name="打开侧栏").click(); time.sleep(0.5)
    pd.locator("button", has_text="另一段对话").first.click(); time.sleep(0.6)
    pd.evaluate("(mark) => { location.hash = mark; }", "#" + tap.split("#")[1])
    pd.get_by_text("收到：这回点横幅").last.wait_for(timeout=10000)
    ok(count_text(pd, "收到：另一段对话") == 0 and count_text(pd, "收到：这回点横幅") == 1 and pd.evaluate("location.hash") == "", "开着的时候点横幅：翻到那段对话")

    # ================= 回来的时候他还没回完：顶上显示正在输入，等到了就落进对话 =================
    mock("/__debug/claude-hold?ms=9000")
    say(pd, "回来早了")
    ok(wait_mock(lambda: any(r["state"] == "working" for r in box()["rows"]), timeout=8), "发一句（他要想九秒）")
    pd.close()
    pe = A.new_page()
    pe.on("pageerror", lambda e: errors.append("E: " + str(e)))
    n4 = len(calls())
    pe.goto(BASE); kite(pe)
    typing = "!!document.querySelector('.kfs-typing')"
    seen = False
    for _ in range(40):
        if pe.evaluate("document.body.innerText.includes('正在输入')"):
            seen = True; break
        time.sleep(0.1)
    ok(seen and pe.get_by_text("收到：回来早了").count() == 0 and len(box()["rows"]) == 1, "她回来的时候他还没回完：不重发，守着信箱，顶上显示“正在输入”")
    pe.get_by_text("收到：回来早了").last.wait_for(timeout=20000)
    pe.get_by_text("第二条").last.wait_for(timeout=10000)
    ok(wait_mock(lambda: box()["rows"] == []) and len(calls()) == n4 + 1 and len([c for c in calls()[n4:]]) == 1, "等到了：回话落进对话，信取走；从头到尾只问了一回")
    b1 = len(banners())
    time.sleep(GRACE + 1.5)
    ok(len(banners()) == b1, "她已经回到开封府里等着了：回话到了不再敲手机")

    # ================= 没回成 =================
    mock("/__debug/claude-fail?kind=broken")
    say(pe, "这句会失败")
    pe.get_by_text(re.compile("消息没送到（这把 key 没绑定工作区")).wait_for(timeout=20000)
    ok(wait_mock(lambda: box()["rows"] == []) and jobs(pe) == [], "没回成、她在跟前：和老路一样给一句“消息没送到（缘故）。点这里重发”；信箱里不留东西")
    time.sleep(GRACE + 1.5)
    ok(len(banners()) == b1, "没回成、她在跟前：不敲手机")
    mock("/__debug/claude-fail")
    n5 = len(calls())
    pe.get_by_text(re.compile("点这里重发")).click()
    pe.get_by_text("收到：这句会失败").last.wait_for(timeout=20000)
    ok(len(calls()) == n5 + 1 and calls()[-1]["via"] == "push", "点重发：重新发一回，回上了")
    # 没回成、她不在：横幅照实说没送到
    pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.5)
    mock("/__debug/claude-fail?kind=broken")
    say(pe, "这句也会失败")
    time.sleep(0.3)
    pe.evaluate("window.__away(true)")
    ok(wait_mock(lambda: len(banners()) == b1 + 1, timeout=GRACE + 10), "没回成、她不在：敲一下")
    fail_note = banners()[-1]["json"]["notification"]
    ok(fail_note["title"] == "开封府" and "没送到" in fail_note["body"] and "workspace" not in json.dumps(fail_note), "没回成的横幅：照实说没送到，不带报错的细节")
    pe.evaluate("window.__away(false)")
    pe.get_by_text(re.compile("消息没送到")).wait_for(timeout=10000)
    ok(wait_mock(lambda: box()["rows"] == []), "她回来：看到“消息没送到…点这里重发”，信箱里那一格收掉")
    mock("/__debug/claude-fail")
    pe.get_by_text(re.compile("点这里重发")).click()
    pe.get_by_text("收到：这句也会失败").last.wait_for(timeout=20000)
    pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.5)
    # 没回成、开封府又被收掉了；收掉之前她还翻到了别的对话
    mock("/__debug/claude-fail?kind=broken")
    mock("/__debug/claude-hold?ms=3000")
    say(pe, "关掉以后才失败")
    ok(wait_mock(lambda: len(box()["rows"]) == 1, timeout=8), "发一句（他要想三秒，然后失败）")
    pe.get_by_role("button", name="打开侧栏").click(); time.sleep(0.5)
    pe.locator("button", has_text="另一段对话").first.click(); time.sleep(0.6)
    pe.close()
    ok(wait_mock(lambda: len(banners()) == b1 + 2, timeout=GRACE + 10) and "没送到" in banners()[-1]["json"]["notification"]["body"], "没回成、开封府被收掉了：照样敲一下说没送到")
    fail_tap = banners()[-1]["json"]["notification"]["navigate"]
    mock("/__debug/claude-fail")
    # 从图标回来：眼前是另一段对话。那封报错的信先留着（等她翻到那段对话再说），不偷偷重发
    pe = A.new_page()
    pe.on("pageerror", lambda e: errors.append("E2: " + str(e)))
    n6 = len(calls())
    pe.goto(BASE); kite(pe)
    time.sleep(2.5)
    ok(count_text(pe, "收到：另一段对话") == 1 and pe.get_by_text("点这里重发").count() == 0 and len(box()["rows"]) == 1 and len(calls()) == n6,
       "她从图标回来、眼前是别的对话：没回成的那封信先留在信箱里，不在不相干的对话底下说“没送到”，也不偷偷重发")
    pe.close()
    # 点着那条“没送到”的横幅回来：翻到那段对话，底下有“点这里重发”可点
    pe = A.new_page()
    pe.on("pageerror", lambda e: errors.append("E3: " + str(e)))
    pe.goto(fail_tap); kite(pe)
    pe.get_by_text(re.compile("消息没送到（这把 key 没绑定工作区")).wait_for(timeout=15000)
    ok(wait_mock(lambda: box()["rows"] == []) and len(calls()) == n6 and count_text(pe, "关掉以后才失败") == 1 and count_text(pe, "收到：另一段对话") == 0,
       "点着“没送到”的横幅回来：翻到那段对话，那一句还在，底下是“消息没送到（缘故）。点这里重发”；信箱里那一格收掉")
    pe.get_by_text(re.compile("点这里重发")).click()
    pe.get_by_text("收到：关掉以后才失败").last.wait_for(timeout=20000)
    pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.5)
    ok(len(calls()) == n6 + 1, "点重发：回上了")

    # ================= 开封府在后台醒着（没在眼前）：信不取，照样敲她 =================
    mock("/__debug/claude-hold?ms=3000")
    say(pe, "后台醒着的时候")
    ok(wait_mock(lambda: any(r["state"] == "working" for r in box()["rows"]), timeout=8), "发一句（他要想三秒）")
    pe.evaluate("localStorage.setItem('__start_hidden', '1')")
    pe.close()
    b2 = len(banners())
    pe = A.new_page()                      # 系统在后台把开封府叫了起来：页面活着，可她没在看
    pe.on("pageerror", lambda e: errors.append("E4: " + str(e)))
    pe.goto(BASE); kite(pe)
    ok(wait_mock(lambda: len(banners()) == b2 + 1, timeout=GRACE + 12) and banners()[-1]["json"]["notification"]["body"].startswith("收到：后台醒着的时候"),
       "开封府醒着、可不在眼前：信箱里的信不去取（取了小后端就以为她看到了），横幅照样敲")
    ok(len(box()["rows"]) == 1 and count_text(pe, "收到：后台醒着的时候") == 0, "不在眼前的时候：信还在信箱里，对话里还没放")
    pe.evaluate("localStorage.removeItem('__start_hidden'); window.__away(false)")
    pe.get_by_text("收到：后台醒着的时候").last.wait_for(timeout=15000)
    ok(wait_mock(lambda: box()["rows"] == []) and count_text(pe, "收到：后台醒着的时候") == 1, "她一回到眼前：信取出来放进对话，信箱里收掉")
    time.sleep(1.0)

    # ================= 真没网（手机自己还以为有网）：马上照实说，不对着“正在输入”干等 =================
    time.sleep(5.5)                        # 刚回到眼前的那五秒里会多试几回（网络还没醒）；这里测的是平时
    dead = lambda route: route.abort()
    pe.route(re.compile(re.escape(MOCK) + "/.*"), dead)
    n7 = len(calls())
    t0 = time.time()
    say(pe, "没网的时候")
    pe.get_by_text(re.compile("消息没送到（连不上")).wait_for(timeout=20000)
    took = time.time() - t0
    ok(took < 6 and len(calls()) == n7, f"没网：{took:.1f} 秒就说“消息没送到（连不上…）”（她停手那两秒多也算在里面），和老路上一样快")
    pe.unroute(re.compile(re.escape(MOCK) + "/.*"), dead)
    pe.get_by_text(re.compile("点这里重发")).click()
    pe.get_by_text("收到：没网的时候").last.wait_for(timeout=20000)
    pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.5)
    ok(len(calls()) == n7 + 1 and calls()[-1]["via"] == "push" and jobs(pe) == [], "网回来了点重发：发出去了，只问了一回，走的还是新路")
    # 新路通不通还没问成（问的那会儿没网）：回到眼前的时候自己再问一声，不用等她发下一句
    pe.evaluate("localStorage.removeItem('kfs-relay')")
    pe.route(re.compile(re.escape(MOCK) + "/.*"), dead)
    pe.evaluate("window.__away(true)"); pe.evaluate("window.__away(false)")
    pe.wait_for_timeout(2500)              # 不用 time.sleep：得让浏览器那头的请求走到上面那个“断网”的开关上
    unknown = pe.evaluate("localStorage.getItem('kfs-relay')")
    pe.unroute(re.compile(re.escape(MOCK) + "/.*"), dead)
    pe.evaluate("window.__away(true)"); pe.evaluate("window.__away(false)")
    ok(unknown is None and wait_js(pe, "localStorage.getItem('kfs-relay') === 'ok'", 8000), "新路通不通还没问成（那会儿没网）：再回到眼前的时候自己问一声，问到了记下，她下一句发完就能切走")
    # 网络刚醒的那一下：敲小后端的头一回没连上，信箱却看得到。再敲一回，通了就记下；不因为这一下就认定那条路不通
    pe.evaluate("localStorage.removeItem('kfs-relay')")
    flaky = {"left": 1}
    def first_fails(route):
        if flaky["left"] > 0 and route.request.method == "POST":
            flaky["left"] -= 1
            return route.abort("internetdisconnected")
        route.continue_()
    pe.route("**/functions/v1/push", first_fails)
    pe.evaluate("window.__away(true)"); pe.evaluate("window.__away(false)")
    woke = wait_js(pe, "localStorage.getItem('kfs-relay') === 'ok'", 8000)
    pe.unroute("**/functions/v1/push", first_fails)
    ok(woke and flaky["left"] == 0, "问新路通不通的时候头一下没连上、信箱却看得到：再敲一回就通了，记下（不因为这一下把新路停三分钟）")
    # 系统说网回来了：也问一声
    pe.evaluate("localStorage.removeItem('kfs-relay')")
    pe.evaluate("window.dispatchEvent(new Event('online'))")
    ok(wait_js(pe, "localStorage.getItem('kfs-relay') === 'ok'", 8000), "还不知道新路通不通的时候网回来了：也问一声，问到了记下")

    # ================= 新路不通：自己走回老路，聊天不断 =================
    for state, name, setup, undo in [
        ("table", "信箱那张表还没建", "/__debug/mail-setup?table=missing", "/__debug/mail-setup?table=ok"),
        ("old", "push 函数还是第一步那份", "/__debug/push-setup?fn=old", "/__debug/push-setup"),
        ("template", "push 函数里还是样板", "/__debug/push-setup?fn=template", "/__debug/push-setup"),
        ("missing", "根本没有 push 函数", "/__debug/push-setup?fn=missing", "/__debug/push-setup"),
    ]:
        mock(setup)
        # 这台设备上还不知道新路通不通（没走通过，或者上回不通、记号擦了）。
        # “记着通、小后端却不接了”是另一种情形，在 tests/e2e_mail_edge.py 的 stale 那一段
        pe.evaluate("localStorage.removeItem('kfs-relay')")
        pe.reload(); kite(pe)          # 重新打开：上一种情形里“新路不通”的记性清掉
        time.sleep(1.2)                # 开机那一声“新路通不通”问完
        c0, o0 = len(calls()), len(box()["ops"])
        knocks0 = box()["notFound"]
        say(pe, f"老路 {state} 一")
        pe.get_by_text(f"收到：老路 {state} 一").last.wait_for(timeout=20000)
        pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.2)
        first_via = calls()[-1]["via"]
        tried = box()["ops"][o0:].count("reply")
        say(pe, f"老路 {state} 二")
        pe.get_by_text(f"收到：老路 {state} 二").last.wait_for(timeout=20000)
        pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.2)
        # 开机先轻轻问了一声就知道不通：那一大包对话一回都没往新路上寄
        ok(first_via == "claude" and calls()[-1]["via"] == "claude" and len(calls()) == c0 + 2 and tried == 0 and box()["ops"][o0:].count("reply") == 0 and pe.get_by_text("点这里重发").count() == 0,
           f"{name}：话照样回上了，走的是老路（claude 函数）；开机问一声就知道不通，整包对话往新路上寄了 {tried} 回（该是 0 回）；一回都没多问")
        _, m = chat_of(pe)
        ok(m[-1]["role"] == "him" and "job" not in m[-1], f"{name}：走老路回来的那一条，和从前一样")
        if state == "missing":
            # 开机那一声问下来（连敲两回都没人应、信箱却看得到）就认定那条路不通，记下了：这两句话谁也没再去敲那扇不存在的门
            ok(box()["notFound"] == knocks0, f"{name}：开机问过就记着不通，后面两句话都没再去敲那扇门（又敲了 {box()['notFound'] - knocks0} 回）")
        if state == "table":
            # 走老路的时候，切走的那一下不把话交出去（交出去她就走了，等着的这头断掉，那一回白问）：照旧等她停手两秒多
            c2 = len(calls())
            say(pe, "老路上切走")
            time.sleep(0.4)
            pe.evaluate("window.__away(true)")
            time.sleep(1.0)
            early = len(calls()) - c2
            pe.evaluate("window.__away(false)")
            pe.get_by_text("收到：老路上切走").last.wait_for(timeout=20000)
            pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.2)
            ok(early == 0 and len(calls()) == c2 + 1 and pe.evaluate("localStorage.getItem('kfs-relay')") is None, "走老路的时候切走：话不抢着交出去，照旧等她停手两秒多再发")
        mock(undo)
    # 第一步就开了通知的设备，那时候还没在这台设备上记门牌号（kfs-push-at）：装成那样再重新打开
    pe.evaluate("localStorage.removeItem('kfs-push-at')")
    pe.reload(); kite(pe)
    ok(wait_js(pe, "localStorage.getItem('kfs-push-at') === JSON.parse(localStorage.getItem('__fake_push__')).device.endpoint", 8000),
       "第一步就开了通知的设备：换上新代码头一回打开，重新登记的那一下把门牌号补上了（回话到了才知道敲哪台）")
    say(pe, "新路又通了")
    pe.get_by_text("收到：新路又通了").last.wait_for(timeout=20000)
    ok(calls()[-1]["via"] == "push", "她在 Supabase 补好了、重新打开：又走回新路")
    pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.2)

    # ================= 面板里说得出上一回是怎么到的 =================
    open_panel(pe)
    pe.get_by_role("button", name="看细节").click(); time.sleep(0.3)
    detail = pe.locator(".kfs-push-detail").inner_text()
    ok("替你等回话：会；信箱：有" in detail and "上一回回话：小后端等的，当面交到的" in detail, "看细节：写着小后端会替你等回话、信箱有、上一回回话是怎么到的")
    shot(pe, "mail_06_detail")
    close_panel(pe)

    # ================= 她接了工具、工具连不上：小后端自己摘掉工具再问 =================
    pe.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    pe.get_by_text("MCP", exact=True).first.click(); time.sleep(0.5)
    pe.get_by_role("switch").first.click(); time.sleep(0.4)
    pe.get_by_role("button", name="关闭").click(); time.sleep(0.4)
    pe.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)
    mock("/__debug/claude-fail?kind=mcp")
    c1 = len(calls())
    say(pe, "查一下文件")
    pe.get_by_text("收到：查一下文件").last.wait_for(timeout=25000)
    tail = calls()[c1:]
    ok(len(tail) == 3 and all(c["via"] == "push" for c in tail) and "mcp_servers" in tail[0]["body"] and "mcp_servers" in tail[1]["body"] and "mcp_servers" not in tail[2]["body"] and tail[0]["beta"] == "mcp-client-2025-11-20" and tail[2]["beta"] == ""
       and isinstance(tail[0]["body"]["system"], list) and "cache_control" in tail[0]["body"]["system"][0] and "cache_control" not in tail[1]["body"]["system"][0],
       "工具连不上：小后端那头照三步换写法（带缓存带工具 → 不带缓存 → 不带工具），网页只敲了一回门")
    ok(pe.get_by_text("这次MCP没连上，先不用工具回你").count() == 1, "工具连不上：回话上照旧注一句“这次MCP没连上，先不用工具回你”")
    mock("/__debug/claude-fail")
    pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.2)
    c2 = len(calls())
    say(pe, "再查一下")
    pe.get_by_text("收到：再查一下").last.wait_for(timeout=25000)
    ok(len(calls()) == c2 + 1 and "mcp_servers" in calls()[-1]["body"] and isinstance(calls()[-1]["body"]["system"], list) and "cache_control" in calls()[-1]["body"]["system"][0],
       "上一回是摘了工具才通的，不是缓存的毛病：这一回缓存记号照带（和老路上的记性一样；不然一次工具连不上，往后每句话都按全价算）")

    # ================= 重新回答 =================
    mock("/__debug/claude-fail")
    pe.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.5)
    _, before = chat_of(pe)
    c3 = len(calls())
    pe.get_by_role("button", name="重新回答").click()
    ok(wait_mock(lambda: len(calls()) == c3 + 1, timeout=15), "点“重新回答”：重新问了一回")
    wait_js(pe, "!document.body.innerText.includes('正在输入')", 20000); time.sleep(1.5)
    _, after = chat_of(pe)
    ok(calls()[-1]["via"] == "push" and len(after) == len(before) and after[-1]["role"] == "him" and len(after[-1]["alts"]) == 2 and after[-1]["altIdx"] == 1 and after[-1]["job"] != before[-1].get("job") and after[-1]["alts"][0]["node"]["id"] == before[-1]["id"]
       and wait_mock(lambda: box()["rows"] == []) and pe.get_by_text("2/2").count() == 1,
       "重新回答走的也是新路：新回答开一个版本摆在外面，旧的翻得回去；信取走了")
    # 重新回答的工夫里她又说了一句，然后开封府被收掉：旧回答和它的版本不能丢，新回答到了还是一个新版本，她那一句接在后面
    mock("/__debug/claude-hold?ms=4000")
    b3 = len(banners())
    c4 = len(calls())
    pe.get_by_role("button", name="重新回答").click()
    ok(wait_mock(lambda: any(r["state"] == "working" for r in box()["rows"]), timeout=8), "又点一回“重新回答”（他要想四秒）")
    say(pe, "等的工夫里说的")
    time.sleep(0.8)
    _, mid = chat_of(pe)
    ok([m["id"] for m in mid[:len(after)]] == [m["id"] for m in after] and len(mid[len(after) - 1]["alts"]) == 2 and mid[-1].get("text") == "等的工夫里说的",
       "重新回答的工夫里她发了一句：存档里旧回答和它的两个版本都还在（画面上先收起来的不算丢），她那一句接在最后")
    pe.close()
    ok(wait_mock(lambda: len(banners()) == b3 + 1, timeout=GRACE + 12), "开封府被收掉：新回答照样进信箱、照样敲她")
    pe = A.new_page()
    pe.on("pageerror", lambda e: errors.append("E5: " + str(e)))
    pe.goto(BASE); kite(pe)
    ok(wait_mock(lambda: box()["rows"] == []), "她回来：信取走")
    time.sleep(1.0)
    _, back = chat_of(pe)
    forked = back[len(after) - 1]
    ok(len(calls()) == c4 + 1 and forked["role"] == "him" and len(forked["alts"]) == 3 and forked["altIdx"] == 2 and forked.get("job") and [m.get("text") for m in back[len(after):]] == ["等的工夫里说的"]
       and pe.get_by_text("3/3").count() == 1 and count_text(pe, "等的工夫里说的") == 1,
       "她回来：新回答是第三个版本，前两个翻得回去；她那一句接在新回答后面；没有多问")
    pe.get_by_role("button", name="上一个版本").click(); time.sleep(0.5)
    ok(pe.get_by_text("2/3").count() == 1, "翻回上一个版本：还在")
    pe.get_by_role("button", name="下一个版本").click(); time.sleep(0.5)

    # ================= 第二台设备 =================
    B = browser.new_context(**iphone)
    B.add_init_script(STUB)
    pb = B.new_page()
    pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
    pb.goto(BASE)
    pb.get_by_text("进门先报上名来").wait_for(timeout=15000)
    pb.locator("input[type=email]").fill("qing@example.com")
    pb.locator("input[type=password]").fill("correct-horse")
    pb.get_by_role("button", name="进府").click()
    pb.get_by_text("对暗号").wait_for(timeout=15000)
    pb.locator("form input").first.fill(PASS)
    pb.get_by_role("button", name="开门").click()
    kite(pb)
    pb.get_by_text("等的工夫里说的").last.wait_for(timeout=15000)
    # 这台设备上头一句话，发完就切走：开机时已经问好了新路是通的，照样敢交出去
    ok(wait_js(pb, "localStorage.getItem('kfs-relay') === 'ok'", 8000), "新设备一进门就轻轻问好了新路通不通（还一句话都没发）")
    mock("/__debug/claude-hold?ms=2500")
    o1 = len(box()["ops"])
    say(pb, "新设备头一句")
    time.sleep(0.4)
    t0 = time.time()
    pb.evaluate("window.__away(true)")
    sent = wait_mock(lambda: box()["ops"][o1:].count("reply") == 1, timeout=5)
    ok(sent and time.time() - t0 < 1.2, "新设备上头一句话发完就切走：切走的那一下也送出去了（不用先聊过一句）")
    ok(wait_mock(lambda: any(r["state"] == "done" for r in box()["rows"]), timeout=15), "新设备：回话进了信箱")
    b4 = len(banners())
    time.sleep(GRACE + 1.5)
    ok(len(banners()) == b4, "这台设备没开通知：不敲它，也不去敲别的设备（只敲发话的那台）")
    pb.evaluate("window.__away(false)")
    pb.get_by_text("收到：等的工夫里说的 / 新设备头一句").last.wait_for(timeout=15000)
    pb.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.5)
    ok(wait_mock(lambda: box()["rows"] == []), "新设备回到眼前：信取走")

    # 手机发话、他还没回完的时候打开另一台设备：那台也显示正在输入；手机收到回话把信取走了，那台不能说“那边断了”
    pe.evaluate("window.__away(true)"); pe.evaluate("window.__away(false)")       # 手机同步一下
    pe.get_by_text("收到：等的工夫里说的 / 新设备头一句").last.wait_for(timeout=15000)
    time.sleep(1.0)
    mock("/__debug/claude-hold?ms=7000")
    c5 = len(calls())
    say(pe, "两台设备")
    ok(wait_mock(lambda: any(r["state"] == "working" for r in box()["rows"]), timeout=8), "手机发一句（他要想七秒）")
    time.sleep(1.5)                                                               # 等手机把这一句传上云端
    pb.evaluate("window.__away(true)"); pb.evaluate("window.__away(false)")       # 另一台设备切回眼前：同步、看信箱
    seen = False
    for _ in range(80):
        if count_text(pb, "两台设备") == 1 and pb.evaluate("document.body.innerText.includes('正在输入')"):
            seen = True; break
        time.sleep(0.1)
    ok(seen and len(box()["rows"]) == 1, "另一台设备：她那一句同步过来了，也守着这一回（正在输入），没有重发")
    pe.get_by_text("收到：两台设备").last.wait_for(timeout=20000)
    ok(wait_mock(lambda: box()["rows"] == []), "手机收到回话：信取走")
    pb.get_by_text("收到：两台设备").last.wait_for(timeout=20000)
    time.sleep(2.0)
    ok(pb.get_by_text("点这里重发").count() == 0 and count_text(pb, "收到：两台设备") == 1 and len(calls()) == c5 + 1 and not pb.evaluate("document.body.innerText.includes('正在输入')"),
       "另一台设备：信箱里那一格没了，不说“那边断了”；等对话同步过来，回话就在；从头到尾只问了一回")

    browser.close()

print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
print(f"\n通过 {passed}  失败 {failed}")
raise SystemExit(1 if failed or errors else 0)
