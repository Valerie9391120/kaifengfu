# 替她等回话的端到端测试共用的零件（tests/e2e_mail_edge.py 在用）。
# 假的“系统”（通知的许可、订阅、装“不在眼前”的开关）和 tests/e2e_mail.py 里的是同一套。
import json, os, re, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("KFS_BASE", "http://127.0.0.1:8080/")
MOCK = os.environ.get("KFS_MOCK", "http://127.0.0.1:8787")
CHROME = os.environ.get("CHROME_PATH", "/opt/google/chrome/chrome" if os.path.exists("/opt/google/chrome/chrome") else None)
PASS = "test-passphrase-123"
GRACE = 6.0   # 小后端把回话放进信箱以后，等这么多秒再敲手机
IPHONE = dict(viewport={"width": 393, "height": 852}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN", timezone_id="Europe/Dublin")

count = {"passed": 0, "failed": 0}
def ok(cond, msg):
    if cond:
        count["passed"] += 1; print("ok:", msg, flush=True)
    else:
        count["failed"] += 1; print("FAIL:", msg, flush=True)
        if os.environ.get("KFS_FAILFAST"):      # 故意改坏了看拦不拦得住的时候：头一条没过就收工
            raise SystemExit(1)

def mock(path, data=None):
    req = urllib.request.Request(MOCK + path, data=data.encode() if data is not None else None, method="POST" if data is not None else "GET")
    return json.loads(urllib.request.urlopen(req).read() or b"null")

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
  // 装“切走了”“回来了”
  let hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  window.__away = (v) => { hidden = !!v; document.dispatchEvent(new Event("visibilitychange")); };
})();""".replace("__MOCK__", MOCK)

# 手机本地存档里的一条（没上锁的那份）
KV = """(key) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').get(key);
  r.onsuccess = () => res(r.result && !r.result.del ? r.result.v : null); r.onerror = () => rej(r.error); }; o.onerror = () => rej(o.error); })"""
REACHABLE = """(() => { const b = document.querySelector('[aria-label="头像与设置"]'); if (!b) return false; const r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (top === b || b.contains(top)); })()"""
TYPING = "document.body.innerText.includes('正在输入')"

def wait_js(page, expr, timeout=15000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        if page.evaluate(expr):
            return True
        time.sleep(0.15)
    return False

def wait_mock(cond, timeout=20, step=0.15):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(step)
    return False

# 戳一下燕子进门（开屏）
def kite(page):
    k = page.get_by_role("button", name="戳一下燕子，进开封府")
    k.wait_for(timeout=30000)
    time.sleep(1.0)
    k.click()
    page.get_by_placeholder("说话，我听着").wait_for(timeout=10000)
    wait_js(page, "!document.querySelector('[aria-label=\"戳一下燕子，进开封府\"]')")
    time.sleep(0.5)

# 头一台设备：注册、设暗号
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

# 另一台设备：登录、对暗号
def second_device(page):
    page.goto(BASE)
    page.get_by_text("进门先报上名来").wait_for(timeout=15000)
    page.locator("input[type=email]").fill("qing@example.com")
    page.locator("input[type=password]").fill("correct-horse")
    page.get_by_role("button", name="进府").click()
    page.get_by_text("对暗号").wait_for(timeout=15000)
    page.locator("form input").first.fill(PASS)
    page.get_by_role("button", name="开门").click()
    kite(page)

def say(page, text):
    ta = page.get_by_placeholder("说话，我听着")
    ta.fill(text)
    ta.press("Enter")

# 发一句、等他回完（假的那边的我回两条：“收到：…”“第二条”）
def chat(page, text):
    say(page, text)
    page.get_by_text("收到：" + text).last.wait_for(timeout=20000)
    page.get_by_text("第二条").last.wait_for(timeout=10000)
    time.sleep(1.5)

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

def enable_notifications(page):
    mock("/__debug/push-secrets?make=1")
    open_panel(page)
    page.get_by_role("button", name="开启通知").click()
    wait_js(page, "(() => { const p = document.querySelector('.kfs-push'); return !!p && p.dataset.state === 'on'; })()")
    time.sleep(0.5)
    close_panel(page)

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
def last_chat(page):
    return page.evaluate(KV, "kfs2:lastChat")
def chat_by(page, cid):
    return json.loads(page.evaluate(KV, "kfs2:chat:" + cid) or "[]")
# 眼前（上次停的）那段对话：编号和里面的话
def chat_of(page):
    cid = last_chat(page)
    return cid, chat_by(page, cid)
def note_count(page, pattern="点这里重发|没成功"):
    return page.get_by_text(re.compile(pattern)).count()
# 长按一个气泡（手指按住不放）
def long_press(page, locator, hold=0.7):
    b = locator.bounding_box()
    x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    cdp = page.context.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    time.sleep(hold)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    cdp.detach()
    time.sleep(0.5)
