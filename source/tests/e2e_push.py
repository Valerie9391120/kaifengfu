# 通知的端到端测试：真的浏览器、真的 push 函数（跑在假 Supabase 里）、假的推送服务。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_push.py
#
# 浏览器里订不了真的推送（那要连谷歌、苹果的服务器），所以“系统弹窗”和“向推送服务订门牌号”这两下是假的（见 STUB）；
# 别的都是真的：服务工作线程真的注册，登记簿真的读写，函数真的加密签名，假推送服务照苹果的规矩验、拿设备的私钥解开。
import json, re, time, urllib.request, urllib.parse, os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("KFS_BASE", "http://127.0.0.1:8080/")
MOCK = os.environ.get("KFS_MOCK", "http://127.0.0.1:8787")
SHOTS = os.environ.get("KFS_SHOTS", os.path.join(HERE, "shots"))
CHROME = os.environ.get("CHROME_PATH", "/opt/google/chrome/chrome" if os.path.exists("/opt/google/chrome/chrome") else None)
PASS = "test-passphrase-123"
QING = "11111111-1111-1111-1111-111111111111"
os.makedirs(SHOTS, exist_ok=True)

passed, failed = 0, 0
def ok(cond, msg):
    global passed, failed
    if cond:
        passed += 1; print("ok:", msg)
    else:
        failed += 1; print("FAIL:", msg)

def mock(path, data=None):
    req = urllib.request.Request(MOCK + path, data=data.encode() if data is not None else None, method="POST" if data is not None else "GET")
    return json.loads(urllib.request.urlopen(req).read() or b"null")

def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}.png")

mock("/__debug/reset")

# 假的“系统”：许可弹窗和订阅。像真浏览器那样记在这台设备上（localStorage），刷新以后还在。
# window.__KFS_TEST_PERMISSION__ 是她在弹窗里点了什么（默认点“允许”）；window.__pushCalls 记下先后做了什么
STUB = """(() => {
  const MOCK = "__MOCK__";
  const KEY = "__fake_push__";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  window.__pushCalls = [];
  // 是不是还在手指点下去的那一下里：iPhone 只在这时候肯弹许可
  let inTap = false;
  document.addEventListener("click", () => { inTap = true; setTimeout(() => { inTap = false; }, 0); }, true);
  // __fake_stuck__：装作 iOS 在主屏幕应用里许了以后 Notification.permission 还一直报“没问过”、只有推送那一头说得准（防着的，没查证真有）
  const stuck = () => localStorage.getItem("__fake_stuck__") === "1";
  Object.defineProperty(Notification, "permission", { configurable: true, get: () => (stuck() ? "default" : load().permission || "default") });
  PushManager.prototype.permissionState = async function () { const p = load().permission; return p === "granted" || p === "denied" ? p : "prompt"; };
  Notification.requestPermission = async () => {
    window.__pushCalls.push(inTap ? "permission:in-tap" : "permission:late");
    const s = load();
    if (!s.permission || s.permission === "default") { s.permission = inTap ? (window.__KFS_TEST_PERMISSION__ || "granted") : "default"; save(s); }
    return s.permission;
  };
  const wrap = (d) => d ? {
    endpoint: d.endpoint, expirationTime: null,
    options: { userVisibleOnly: true, applicationServerKey: unb64u(d.key).buffer },
    toJSON: () => ({ endpoint: d.endpoint, expirationTime: null, keys: { p256dh: d.p256dh, auth: d.auth } }),
    getKey: (n) => unb64u(n === "p256dh" ? d.p256dh : d.auth).buffer,
    unsubscribe: async () => { window.__pushCalls.push("unsubscribe"); const s = load(); if (s.device && s.device.endpoint === d.endpoint) { delete s.device; save(s); } return true; },
  } : null;
  PushManager.prototype.getSubscription = async function () { return wrap(load().device); };
  PushManager.prototype.subscribe = async function (opts) {
    window.__pushCalls.push("subscribe");
    if (load().permission !== "granted") throw new DOMException("permission denied", "NotAllowedError");
    if (!opts || opts.userVisibleOnly !== true || !opts.applicationServerKey) throw new DOMException("bad options", "NotAllowedError");
    const key = b64u(opts.applicationServerKey);
    const d = await (await fetch(MOCK + "/__debug/push-device?key=" + key)).json();
    const s = load(); s.device = { ...d, key }; save(s);
    return wrap(s.device);
  };
  if (navigator.serviceWorker) {   // 空白页上没有这个
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...a) => { window.__pushCalls.push("register"); return register(...a); };
  }
})();""".replace("__MOCK__", MOCK)

FAKE = "JSON.parse(localStorage.getItem('__fake_push__') || '{}')"
STATE = "(() => { const p = document.querySelector('.kfs-push'); return p ? p.dataset.state : ''; })()"
STEPS = "[...document.querySelectorAll('.kfs-push-step')].map((s) => s.dataset.done + '|' + s.textContent)"
NOTE = "(() => { const n = document.querySelector('.kfs-push-note'); return n ? n.dataset.ok + '|' + n.textContent : ''; })()"

def enter(page):
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

def kite(page):
    k = page.get_by_role("button", name="戳一下燕子，进开封府")
    k.wait_for(timeout=30000)
    time.sleep(1.0)
    k.click()
    page.get_by_text("如月之恒，官家在这").wait_for(timeout=10000)
    time.sleep(0.9)

# 侧栏压在对话窗底下：头像那个按钮点不点得到，看它中间那一点上面是不是它自己
REACHABLE = """(() => { const b = document.querySelector('[aria-label="头像与设置"]'); if (!b) return false; const r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (top === b || b.contains(top)); })()"""

def open_panel(page):
    if not page.evaluate(REACHABLE):
        page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    page.get_by_role("button", name="头像与设置").click()
    page.locator(".kfs-push").wait_for(timeout=10000)
    page.locator(".kfs-push").scroll_into_view_if_needed()
    wait_settled(page)

# 页面的安全策略不许 eval，Playwright 自带的 wait_for_function 轮询用不了，自己隔一会儿看一眼
def wait_js(page, expr, timeout=15000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        if page.evaluate(expr):
            return
        time.sleep(0.15)
    raise TimeoutError("等不到：" + expr[:90])

def wait_settled(page):
    wait_js(page, "(() => { const p = document.querySelector('.kfs-push'); return !!p && p.dataset.state !== 'checking'; })()")
    time.sleep(0.3)

def wait_state(page, want, timeout=15000):
    wait_js(page, f"(() => {{ const p = document.querySelector('.kfs-push'); return !!p && p.dataset.state === '{want}'; }})()", timeout)
    time.sleep(0.3)

def wait_note(page, text, timeout=10000):
    wait_js(page, f"(() => {{ const n = document.querySelector('.kfs-push-note'); return !!n && n.textContent.includes('{text}'); }})()", timeout)

# 把登记簿里的一行划掉，装作是小后端划的（推送服务说门牌号作废了，它就会这么做）
def drop_row(page, endpoint):
    token = page.evaluate("JSON.parse(localStorage.getItem('kfs-auth')).access_token")
    urllib.request.urlopen(urllib.request.Request(MOCK + "/rest/v1/push_subs?endpoint=eq." + urllib.parse.quote(endpoint, safe=""), method="DELETE", headers={"Authorization": "Bearer " + token})).read()

def close_panel(page):
    page.get_by_role("button", name="关闭").click(); time.sleep(0.4)

def again(page):
    page.get_by_role("button", name="再看一次").click(); time.sleep(0.3)
    page.get_by_role("button", name="再看一次").wait_for(timeout=10000) if page.evaluate(STATE) in ("setup", "denied", "away") else None
    time.sleep(0.8)

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    iphone = dict(viewport={"width": 393, "height": 852}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN", timezone_id="Europe/Dublin")
    A = browser.new_context(**iphone)
    A.grant_permissions(["clipboard-read", "clipboard-write", "notifications"], origin=BASE.rstrip("/"))
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append("A: " + str(e)))
    enter(pa)

    # ================= 她在 Supabase 还差哪几步 =================
    regs0 = pa.evaluate("navigator.serviceWorker.getRegistrations().then((r) => r.length)")
    open_panel(pa)
    steps = pa.evaluate(STEPS)
    ok(pa.evaluate(STATE) == "setup" and [s.split("|")[0] for s in steps] == ["yes", "yes", "no"] and "还没放" in steps[2] and pa.get_by_role("button", name="生成一份钥匙").is_visible(),
       "账户面板的通知一栏：登记簿、小后端好了，钥匙还没放，一样一样列着")
    ok(regs0 == 0 and pa.evaluate("navigator.serviceWorker.getRegistrations().then((r) => r.length)") == 0 and pa.evaluate("localStorage.getItem('kfs-push')") is None,
       "后端没接好之前：不注册服务工作线程，什么都不动")
    mock("/__debug/push-setup?fn=missing")
    again(pa)
    steps = pa.evaluate(STEPS)
    ok([s.split("|")[0] for s in steps] == ["yes", "no", "no"] and "连不上" in steps[1] and "要有一个叫 push 的函数" in steps[1] and "接上了才看得到" in steps[2], "push 函数还没建（连打招呼都过不去）：说小后端连不上、要有一个叫 push 的函数，钥匙那行说现在还看不到")
    mock("/__debug/push-setup?fn=missing-cors")
    again(pa)
    ok([s.split("|")[0] for s in pa.evaluate(STEPS)] == ["yes", "no", "no"], "push 函数还没建（网关回了 404）：一样认得出")
    mock("/__debug/push-setup?table=missing")
    again(pa)
    steps = pa.evaluate(STEPS)
    ok([s.split("|")[0] for s in steps] == ["no", "yes", "no"] and "push.sql" in steps[0], "登记簿那张表还没建：说把 push.sql 跑一遍")
    mock("/__debug/push-setup")
    again(pa)

    # ================= 生成钥匙，贴进密钥柜 =================
    pa.get_by_role("button", name="生成一份钥匙").click()
    box = pa.locator(".kfs-push-secrets pre")
    box.wait_for(timeout=10000)
    block = box.evaluate("(el) => el.textContent")
    lines = block.split("\n")
    ok(len(lines) == 3 and re.fullmatch(r"VAPID_PUBLIC_KEY=B[A-Za-z0-9_-]{86}", lines[0]) and re.fullmatch(r"VAPID_PRIVATE_KEY=[A-Za-z0-9_-]{43}", lines[1]) and lines[2] == "VAPID_SUBJECT=mailto:qing@example.com",
       "生成一份钥匙：三行“名字=值”，公钥 87 个字符、私钥 43 个字符，联系邮箱填的是登录邮箱")
    pa.locator(".kfs-push-secrets").scroll_into_view_if_needed(); time.sleep(0.3)
    shot(pa, "push_01_setup")
    pa.get_by_role("button", name="复制这三行").click()
    pa.get_by_text("已复制").wait_for(timeout=5000)
    ok(pa.evaluate("navigator.clipboard.readText()") == block, "复制这三行：剪贴板里就是这三行")
    ok(mock("/__debug/push")["secrets"] == [], "钥匙是在这台设备上生成的：没贴之前，密钥柜里什么都没有")
    mock("/__debug/push-secrets", block)   # 她在 Supabase 的 Secrets 里一次贴进去
    again(pa)
    wait_settled(pa)
    after = pa.evaluate(STATE)
    ok(after in ("denied", "off") and mock("/__debug/push")["publicKey"] == lines[0].split("=")[1], f"贴进密钥柜再看一次：三样都好了，小后端认这对钥匙（这个浏览器现在是 {after}）")
    close_panel(pa)

    # ================= 开启 =================
    A.add_init_script(STUB)
    pa.reload(); kite(pa)
    open_panel(pa)
    ok(pa.evaluate(STATE) == "off" and pa.get_by_role("button", name="开启通知").is_visible() and "眼下只有测试通知" in pa.locator(".kfs-push").inner_text(), "三样都好了、还没开：一个“开启通知”，说清眼下只有测试通知")
    reg = pa.evaluate("navigator.serviceWorker.getRegistration().then((r) => r ? { scope: r.scope, url: (r.active || r.waiting || r.installing).scriptURL } : null)")
    ok(reg == {"scope": BASE, "url": BASE + "sw.js"}, f"后端好了以后打开面板：服务工作线程先注册好（{reg and reg['url']}），等她点")
    pa.locator(".kfs-push").scroll_into_view_if_needed(); time.sleep(0.3)
    shot(pa, "push_02_off")

    pa.evaluate("window.__KFS_TEST_PERMISSION__ = 'default'")   # 系统弹窗出来，她划掉了
    pa.get_by_role("button", name="开启通知").click()
    pa.locator(".kfs-push-note").wait_for(timeout=10000)
    ok("没点“允许”" in pa.evaluate(NOTE) and pa.evaluate(STATE) == "off" and mock("/__debug/push")["rows"] == [], "弹窗被划掉：说没开成，登记簿里没有东西，还能再点")
    pa.evaluate("window.__KFS_TEST_PERMISSION__ = 'denied'")    # 她点了“不允许”
    pa.get_by_role("button", name="开启通知").click()
    wait_state(pa, "denied")
    ok("设置 → 通知 → 开封府" in pa.locator(".kfs-push").inner_text() and not pa.get_by_role("button", name="开启通知").is_visible() and mock("/__debug/push")["rows"] == [],
       "点了“不允许”：告诉她去系统设置里打开，不再给“开启”的按钮白点")
    pa.evaluate("localStorage.removeItem('__fake_push__'); window.__KFS_TEST_PERMISSION__ = 'granted'")   # 她去设置里打开了
    again(pa)
    wait_state(pa, "off")

    pa.evaluate("window.__pushCalls.length = 0")
    pa.get_by_role("button", name="开启通知").click()
    wait_state(pa, "on")
    calls = pa.evaluate("window.__pushCalls")
    dev = pa.evaluate(FAKE)["device"]
    state = mock("/__debug/push")
    row = state["rows"][0] if state["rows"] else {}
    ok(calls[0] == "permission:in-tap" and "subscribe" in calls and calls.index("subscribe") > 0, f"开启通知：问许可是手指点下去之后的头一件事，然后才订阅（{calls}）")
    ok(len(state["rows"]) == 1 and row["endpoint"] == dev["endpoint"] and row["p256dh"] == dev["p256dh"] and row["auth"] == dev["auth"] and row["user_id"] == QING and row["page"] == BASE,
       "开启通知：这台设备的门牌号和两把公开钥匙记进了登记簿，回程的网址是这台设备的入口")
    ok(dev["key"] == state["publicKey"] and pa.evaluate("localStorage.getItem('kfs-push')") == "on" and pa.evaluate("localStorage.getItem('kfs-push-key')") == state["publicKey"],
       "开启通知：订阅用的就是她生成的那把公钥；这台设备上记着开过")
    ok(all(b.is_visible() for b in [pa.get_by_role("button", name="发一条测试通知"), pa.get_by_role("button", name="十秒后再发"), pa.get_by_role("button", name="关掉", exact=True)]), "开着的时候：发一条测试通知、十秒后再发、关掉")

    # ================= 发一条测试通知 =================
    pa.get_by_role("button", name="发一条测试通知").click()
    pa.locator(".kfs-push-note").wait_for(timeout=10000); time.sleep(0.4)
    note = pa.evaluate(NOTE)
    state = mock("/__debug/push")
    got = state["delivered"][0] if state["delivered"] else {"json": {"notification": {}}, "claims": {}}
    n = got["json"]["notification"]
    ok(note.startswith("yes|") and "苹果收下了" in note, "发一条测试通知：面板上说苹果收下了")
    ok(len(state["delivered"]) == 1 and got["endpoint"] == dev["endpoint"] and got["json"]["web_push"] == 8030 and n["title"] == "测试通知" and "这条路就通了" in n["body"],
       "假推送服务照苹果的规矩验过、拿这台设备的私钥解开：是那条测试通知，声明式的写法")
    ok(re.fullmatch(re.escape(BASE) + r"#n=test-[A-Za-z0-9_-]{8}", n.get("navigate", "")) and got["claims"].get("sub") == "mailto:qing@example.com" and got["claims"].get("aud") == "https://web.push.apple.com",
       "通知点了回到这台设备的入口，后面带着记号；签名的联系人是她贴的那个邮箱")
    ok(state["rows"][0]["last_status"] == 201, "登记簿里记下了这一回：201")
    pa.locator(".kfs-push").scroll_into_view_if_needed(); time.sleep(0.3)
    shot(pa, "push_03_on")
    pa.get_by_text("看细节").click(); time.sleep(0.3)
    detail = pa.locator(".kfs-push-detail").inner_text()
    ok(all(x in detail for x in ["系统的许可：允许了", "登记簿：有", "小后端：接上了", "钥匙：放好了", "服务线程：在", "web.push.apple.com", "状态 201"]) and dev["endpoint"].split("/")[-1] not in detail,
       "看细节：卡在哪一步一眼看得出；门牌号只露是哪家的，不露整串")
    pa.locator(".kfs-push-detail").scroll_into_view_if_needed(); time.sleep(0.3)
    shot(pa, "push_04_detail")
    pa.get_by_text("收起细节").click()

    # ================= 真的服务工作线程收到这条，显示出来 =================
    cdp = A.new_cdp_session(pa)
    regs = []
    cdp.on("ServiceWorker.workerRegistrationUpdated", lambda e: regs.extend(e["registrations"]))
    cdp.send("ServiceWorker.enable"); pa.wait_for_timeout(800)   # 用 Playwright 自己的等法：光 sleep 的话浏览器发来的事件收不到
    rid = next((r["registrationId"] for r in regs if r["scopeURL"] == BASE), None)
    shown, handed = None, 0
    # 把推送交给 sw.js 这一下是借调试接口做的。几十回里见过一回交进去了却没显示（单独试了三十多回没再碰上，没找到原因），
    # 所以等三秒没动静就再交一次，交了几次写在结果里
    while rid and not shown and handed < 2:
        cdp.send("ServiceWorker.deliverPushMessage", {"origin": BASE.rstrip("/"), "registrationId": rid, "data": got["text"]})
        handed += 1
        for _ in range(15):
            shown = pa.evaluate("navigator.serviceWorker.getRegistration().then((r) => r.getNotifications()).then((l) => l.map((x) => ({ title: x.title, body: x.body, target: x.data && x.data.target })))")
            if shown: break
            pa.wait_for_timeout(200)
    ok(bool(shown) and shown[0]["title"] == "测试通知" and "这条路就通了" in shown[0]["body"] and shown[0]["target"] == n.get("navigate"),
       f"同一段 JSON 交给 sw.js（老一些的浏览器走这条路）：真的显示出一条通知，点了去的地方对（交了 {handed} 次）")
    cdp.detach()
    # 点这条通知：浏览器里没法真的伸手去点，在 sw.js 里照着发一个“被点了”的事件。开封府开着，应该收到话、不重新加载
    sw = A.service_workers[0] if A.service_workers else None
    clicked = sw.evaluate("self.registration.getNotifications().then((l) => { self.dispatchEvent(new NotificationEvent('notificationclick', { notification: l[0] })); return l.length; })") if sw else 0
    pa.get_by_text("从通知回来的").wait_for(timeout=5000)
    left = pa.evaluate("navigator.serviceWorker.getRegistration().then((r) => r.getNotifications()).then((l) => l.length)")
    ok(clicked == 1 and left == 0 and pa.locator(".kfs-push").is_visible(), "老路子上点通知：sw.js 把话传给开着的开封府，说一声“从通知回来的”，不重新加载；那条通知收起来")
    ok("这条路全通了" in pa.locator(".kfs-push-back").inner_text(), "通知面板上留一句不会消失的：是点着测试通知回来的，这条路全通了")
    time.sleep(1.8)

    # ================= 点了通知回来 =================
    pa.evaluate("location.href = location.origin + location.pathname + '#n=test-live1234'")   # 开封府开着：系统把网址换成带记号的
    pa.get_by_text("从通知回来的").wait_for(timeout=5000)
    ok(pa.evaluate("location.hash") == "" and pa.evaluate("location.href") == BASE and pa.locator(".kfs-push").is_visible(), "开封府开着的时候点通知：不重新加载（面板还开着），说一声“从通知回来的”，网址后面的记号收走")
    time.sleep(1.8)
    hist1 = pa.evaluate("[history.length, !!(history.state && history.state.kfs === 'kfs-home')]")
    pa.evaluate("location.href = location.origin + location.pathname + '#n=test-live5678'")   # 又一条
    pa.get_by_text("从通知回来的").wait_for(timeout=5000)
    time.sleep(1.8)
    hist2 = pa.evaluate("[history.length, !!(history.state && history.state.kfs === 'kfs-home')]")
    ok(hist1[1] and hist2[1] and hist2[0] == hist1[0] and pa.evaluate("location.href") == BASE,
       f"点通知回来不在历史里越攒越多：每回都退回开封府原来待的那一格（历史 {hist1[0]} 格，再来一条还是 {hist2[0]} 格），左边往右划不会变成“后退”")
    pa.evaluate("location.href = location.origin + location.pathname + '#somewhere-else'"); time.sleep(0.5)
    ok(not pa.get_by_text("从通知回来的").is_visible() and pa.evaluate("location.hash") == "#somewhere-else", "不是通知的记号：不理会，也不动它")
    before = mock("/__debug/push")["rows"][0]["updated_at"]   # 往下到进门为止不开面板：登记的时间要是变了，只能是打开开封府那一下自己重新登记的
    pa.goto("about:blank")
    pa.goto(BASE + "#n=test-cold5678")   # 开封府没开着，被通知叫起来
    k = pa.get_by_role("button", name="戳一下燕子，进开封府"); k.wait_for(timeout=30000); time.sleep(1.2)
    ok(pa.evaluate("location.hash") == "" and not pa.get_by_text("从通知回来的").is_visible(), "开封府是被通知叫起来的：记号收走；开屏还挡着的时候先不说")
    k.click()
    pa.get_by_text("从通知回来的").wait_for(timeout=5000)
    ok(True, "进了门再说“从通知回来的”")
    time.sleep(1.0)

    # ================= 每次打开重新登记 =================
    state = mock("/__debug/push")
    ok(len(state["rows"]) == 1 and state["rows"][0]["endpoint"] == dev["endpoint"] and state["rows"][0]["updated_at"] > before and state["rows"][0]["last_status"] == 201 and "subscribe" not in pa.evaluate("window.__pushCalls"),
       "重新打开开封府：这台设备悄悄重新登记了一遍（时间更新了），门牌号没换，上一回的记录没被冲掉")
    open_panel(pa)
    wait_state(pa, "on")
    ok("这条路全通了" in pa.locator(".kfs-push-back").inner_text(), "被通知叫起来的那一回：进了门打开通知面板，那句“这条路全通了”也在")
    ok("上一回" in pa.evaluate(NOTE) and "苹果收下了" in pa.evaluate(NOTE), "再打开面板：上一回发得怎么样还看得到")
    close_panel(pa)

    # 万一 iOS 许了以后 Notification.permission 还一直报“没问过”，只有推送那一头（permissionState）说得准（防着的，没查证真有）。
    # 不能因此当成没开；该自己重订的时候（登记簿里那行被划掉了）也不能因此就不订
    pa.evaluate("localStorage.setItem('__fake_stuck__', '1')")
    drop_row(pa, dev["endpoint"])
    pa.evaluate("window.__pushCalls.length = 0")
    pa.reload(); kite(pa); time.sleep(1.0)
    devS = pa.evaluate(FAKE).get("device") or {}
    rows = mock("/__debug/push")["rows"]
    renewed = devS.get("endpoint") not in (None, dev["endpoint"]) and [r["endpoint"] for r in rows] == [devS.get("endpoint")]
    open_panel(pa)
    ok(pa.evaluate("Notification.permission") == "default" and renewed and pa.evaluate(STATE) == "on" and pa.get_by_role("button", name="发一条测试通知").is_visible(),
       "系统明明许了、Notification.permission 却还报“没问过”：照样认作开着；登记簿里那行没了，打开时照样自己重订")
    pa.evaluate("localStorage.removeItem('__fake_stuck__')")
    close_panel(pa)
    dev = devS

    # ================= 十秒后再发（留给锁屏） =================
    open_panel(pa)
    wait_state(pa, "on")
    ok(pa.evaluate(NOTE) == "" and mock("/__debug/push")["rows"][0]["last_at"] is None, "（新订的门牌号还没发过：面板上没有“上一回”）")
    # 先发一条，紧接着点“十秒后再发”：不能把刚才那一条的记录当成这一条的
    pa.get_by_role("button", name="发一条测试通知").click()
    wait_note(pa, "收下了")
    sent0 = len(mock("/__debug/push")["delivered"])
    t0 = time.time()
    pa.get_by_role("button", name="十秒后再发").click()
    pa.get_by_text(re.compile("10 秒后发出")).wait_for(timeout=5000)
    quick = time.time() - t0
    ok(quick < 3 and len(mock("/__debug/push")["delivered"]) == sent0 and pa.get_by_role("button", name="等它发出去…").is_disabled() and pa.get_by_role("button", name="发一条测试通知").is_disabled(),
       f"十秒后再发：小后端先回话（{quick:.1f} 秒），这时候还没发；等着的时候不让再点")
    wait_note(pa, "收下了", 25000)
    took = time.time() - t0
    ok(10 <= took < 16 and len(mock("/__debug/push")["delivered"]) == sent0 + 1 and pa.get_by_role("button", name="十秒后再发").is_enabled(), f"十秒后再发：{took:.1f} 秒后面板上才说“收下了”（小后端在后台发的，结果从登记簿里读回来；没把刚才那一条当成这一条）")

    # 等着的工夫把通知关了：不能因为“订阅没了”就又替她订上
    pa.get_by_role("button", name="十秒后再发").click()
    pa.get_by_text(re.compile("10 秒后发出")).wait_for(timeout=5000)
    pa.evaluate("window.__pushCalls.length = 0")
    pa.get_by_role("button", name="关掉", exact=True).click()
    wait_state(pa, "off")
    time.sleep(5)
    ok(mock("/__debug/push")["rows"] == [] and "device" not in pa.evaluate(FAKE) and "subscribe" not in pa.evaluate("window.__pushCalls") and pa.evaluate(STATE) == "off" and "换了一个新的" not in pa.locator(".kfs-push").inner_text(),
       "等着“十秒后再发”的工夫把通知关了：就是关了，过几秒也不会又订上")
    pa.get_by_role("button", name="开启通知").click()
    wait_state(pa, "on")
    dev = pa.evaluate(FAKE)["device"]
    time.sleep(7)   # 刚才那条十秒的在小后端那边还排着，等它过去，免得搅了后面数通知

    # 开着通知的设备一时连不上小后端：是网络的事，不能摆出“还差几步、去建函数、生成钥匙”
    close_panel(pa)
    mock("/__debug/push-setup?fn=missing")
    open_panel(pa)
    wait_state(pa, "away")
    words = pa.locator(".kfs-push").inner_text()
    ok("连不上" in words and "过一会儿再看" in words and not pa.get_by_role("button", name="生成一份钥匙").is_visible() and pa.locator(".kfs-push-step").count() == 0 and len(mock("/__debug/push")["rows"]) == 1,
       "开着通知的设备一时连不上小后端：说是连不上、过一会儿再看；不摆“还差几步”，订阅和登记都没动")
    mock("/__debug/push-setup")
    again(pa)
    wait_state(pa, "on")
    ok(pa.get_by_role("button", name="发一条测试通知").is_visible(), "连上了再看一次：回到开着的样子")

    # 两趟“看一遍”叠在一起，先问的后到：只认后问的那一趟（不然面板会被旧答案盖回去）
    mock("/__debug/push-setup?hold=2500")
    pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))")   # 第一趟：小后端这回答得慢，答的是“钥匙好着”
    time.sleep(0.4)
    mock("/__debug/push-secrets", "")                                      # 这工夫密钥柜被清空了
    pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))")   # 第二趟：答得快，“钥匙没了”
    wait_state(pa, "setup")
    time.sleep(3.2)                                                        # 第一趟的旧答案这时候才到
    ok(pa.evaluate(STATE) == "setup" and "还没放" in pa.evaluate(STEPS)[2], "先问的后到：面板停在后问的那一趟（钥匙没了），没被迟到的旧答案盖回“开着”")
    mock("/__debug/push-secrets", block)
    again(pa)
    wait_state(pa, "on")

    # ================= 门牌号作废 =================
    mock("/__debug/push-mode?mode=gone&endpoint=" + urllib.parse.quote(dev["endpoint"], safe=""))
    pa.evaluate("window.__pushCalls.length = 0")
    pa.get_by_role("button", name="发一条测试通知").click()
    pa.get_by_text(re.compile("已经换了一个新的")).wait_for(timeout=10000); time.sleep(0.5)
    dev2 = pa.evaluate(FAKE)["device"]
    rows = mock("/__debug/push")["rows"]
    ok(dev2["endpoint"] != dev["endpoint"] and [r["endpoint"] for r in rows] == [dev2["endpoint"]] and pa.evaluate("window.__pushCalls") == ["unsubscribe", "subscribe"] and pa.evaluate(STATE) == "on",
       "推送服务说门牌号作废了：旧的从登记簿里划掉，这台设备自己退订重订、登记上新的，不用她再点开启")
    pa.get_by_role("button", name="发一条测试通知").click()
    wait_note(pa, "收下了")
    ok(mock("/__debug/push")["delivered"][-1]["endpoint"] == dev2["endpoint"], "换了新门牌号再发：到了")
    close_panel(pa)
    # 她不在的时候作废的：小后端发的时候把那行划掉了。下回打开开封府，这台设备发现登记簿里没有自己，重订一个
    drop_row(pa, dev2["endpoint"])
    ok(mock("/__debug/push")["rows"] == [], "（把登记簿里这一行划掉，装作是小后端划的）")
    pa.reload(); kite(pa); time.sleep(1.0)
    dev3 = pa.evaluate(FAKE)["device"]
    rows = mock("/__debug/push")["rows"]
    ok(dev3["endpoint"] not in (dev["endpoint"], dev2["endpoint"]) and [r["endpoint"] for r in rows] == [dev3["endpoint"]], "不在的时候门牌号被划掉了：下回打开自己重订、重新登记")

    # ================= 换钥匙 =================
    newkey = mock("/__debug/push-secrets?make=1")["publicKey"]
    open_panel(pa)
    wait_state(pa, "on")
    dev4 = pa.evaluate(FAKE)["device"]
    rows = mock("/__debug/push")["rows"]
    ok(newkey != state["publicKey"] and dev4["key"] == newkey and dev4["endpoint"] != dev3["endpoint"] and [r["endpoint"] for r in rows] == [dev4["endpoint"]] and pa.evaluate("localStorage.getItem('kfs-push-key')") == newkey,
       "密钥柜里换了一对钥匙：打开面板，这台设备自己照新公钥重订，旧的那行划掉")
    pa.get_by_role("button", name="发一条测试通知").click()
    wait_note(pa, "收下了")
    ok(mock("/__debug/push")["delivered"][-1]["endpoint"] == dev4["endpoint"], "换了钥匙再发：推送服务认新钥匙，到了")

    # ================= 丁香的入口 =================
    close_panel(pa)
    pa.goto(BASE + "dingxiang/")
    pa.locator(".kfs-dx-track").wait_for(timeout=30000); time.sleep(1.5)
    regs = pa.evaluate("navigator.serviceWorker.getRegistrations().then((l) => l.map((r) => [r.scope, (r.active || r.waiting || r.installing).scriptURL]))")
    rows = mock("/__debug/push")["rows"]
    ok(regs == [[BASE, BASE + "sw.js"]] and len(rows) == 1 and rows[0]["page"] == BASE + "dingxiang/" and rows[0]["endpoint"] == dev4["endpoint"],
       "从丁香的入口进来：服务工作线程还是根上那一个（没在 dingxiang/ 底下另起一个），登记的回程网址换成丁香的入口")
    pa.goto(BASE); kite(pa)

    # ================= 关掉 =================
    open_panel(pa)
    wait_state(pa, "on")
    pa.get_by_role("button", name="关掉", exact=True).click()
    wait_state(pa, "off")
    ok(mock("/__debug/push")["rows"] == [] and pa.evaluate("localStorage.getItem('kfs-push')") is None and "device" not in pa.evaluate(FAKE) and pa.get_by_role("button", name="开启通知").is_visible(),
       "关掉：登记簿里划掉、退订、这台设备上不再记着开过")
    close_panel(pa)
    pa.reload(); kite(pa); time.sleep(0.8)
    ok(mock("/__debug/push")["rows"] == [] and "device" not in pa.evaluate(FAKE), "关掉以后重新打开：不会自己又订上")

    # ================= 退出登录 =================
    open_panel(pa)
    pa.get_by_role("button", name="开启通知").click()
    wait_state(pa, "on")
    ok(len(mock("/__debug/push")["rows"]) == 1, "（再开启一回）")
    pa.get_by_role("button", name="退出登录").click()
    pa.get_by_role("button", name=re.compile("再点一次")).click()
    pa.get_by_text("进门先报上名来").wait_for(timeout=15000)
    ok(mock("/__debug/push")["rows"] == [] and "device" not in pa.evaluate(FAKE) and pa.evaluate("localStorage.getItem('kfs-push')") is None, "退出登录：先把这台设备的通知关掉，人走了横幅不会还往这儿发")
    A.close()

    # ================= 开不了通知的浏览器 =================
    B = browser.new_context(**iphone)
    B.add_init_script("delete window.PushManager;")
    pb = B.new_page()
    pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
    pb.goto(BASE)
    pb.get_by_text("进门先报上名来").wait_for(timeout=15000)
    pb.locator("input[type=email]").fill("qing@example.com"); pb.locator("input[type=password]").fill("correct-horse")
    pb.get_by_role("button", name="进府").click()
    pb.get_by_text("对暗号").wait_for(timeout=15000)
    pb.locator("form input").first.fill(PASS)
    pb.get_by_role("button", name="开门").click()
    kite(pb)
    open_panel(pb)
    ok(pb.evaluate(STATE) == "unsupported" and "开不了通知" in pb.locator(".kfs-push").inner_text() and pb.locator(".kfs-push button").count() == 0, "浏览器不支持推送：照实说开不了，不摆按钮")
    B.close()
    browser.close()

print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
ok(not errors, "整个过程页面没有报错")
print(f"\n通过 {passed}  失败 {failed}")
raise SystemExit(1 if failed else 0)
