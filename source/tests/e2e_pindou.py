# 拼豆作（卿卿 2026 年 10 月 25 日要的，见开发说明“拼豆作”那一节；零件在 src/pindou/，单测在 tests/pindou.test.mjs）：手机这头走一遍，家里的闹钟用真的那一份（测试包）。
#   南衙里多一行“拼豆作”（四颗豆子的图标），排在秘戏钱匣后面，小字“还没拼过”；点之前不下载那一页，点了菜单、侧栏都收起，盖一层全屏（层高 60）；
#   拼几颗、粘贴作品码铺一幅；存进作品集（存档里一幅一条，名字、作品码都对）；她这块板子隔一会儿存一回，切到后台马上存；
#   “发给光义”：变“已发”，开着的时候他先不回（不往那边问）；板子动了又能发；叉一点回到聊天，正中两个方框（不是气泡），他把两幅一起看了才回；
#   寄过去的是图加一句“【拼豆作】卿卿拼了一幅《…》”；
#   只换样子不写板子那一条（习惯记在这台设备上）；重新打开开封府：板子、作品集都还在；另一台设备登进来：作品集同步过来了，板子也是那块；
#   两台设备：开着的那一台手上没有没存的，同步下来就换上；两台都拼了，后存的那一台认出来，先前那一块存进作品集不盖掉；
#   删一幅（点两下；中间同步了一回不打断）存档里也没了；
#   「他的」那一栏：“他自己醒”关着照实说；闹钟叫醒他一回，他在桌上拼了、挂起来一幅、又拼了几颗：手机上同步下来，「他的」那一栏看得见桌上那块和挂起来的那一幅（点开看大图）；
#   狐宇宙里两行小字（一样的只留一行）；醒在屋里那一回工具里带着 play_pindou，【醒来】里有拼豆板那一行；
#   聊天里“回屋看看拼豆”：一行小字“回屋看了看拼豆板”，看到的字（桌上那块、挂起来的）只在寄给他的结果里；
#   狐宇宙里打开拼豆作：不摆“发给光义”；底板跟着三套主题换颜色；一块板子最多 52 种颜色，再拼一种新的不让放。
# 真的浏览器、假 Supabase、假的 Anthropic。账号、板子都是编的。
# 先在 source/ 里 npm run build:test、KFS_TEST_URL=http://127.0.0.1:8787 node alarm/build.mjs，起好两个服务（见开发说明），再：python3 tests/e2e_pindou.py
# 要截图给人看：KFS_SHOTS=某个文件夹 python3 tests/e2e_pindou.py
import json, os, re, subprocess, tempfile, time
from urllib.parse import quote
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
HERE_DIR = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE_DIR, "..", "alarm", "dist", "kfs-alarm-test.mjs")
SHOTS = os.environ.get("KFS_SHOTS", "")
NOTES = "() => [...document.querySelectorAll('.kfs-chat-rows .kfs-diary-note')].map((d) => d.innerText.trim())"
PAGE = "() => document.querySelector('.kfs-chat-rows').innerText"
NANYA = """() => [...document.querySelectorAll('.kfs-nanya .kfs-nanya-row')].map((b) => { const t = b.children[1].children;
  return { name: t[0].textContent, sub: t[1].textContent, shapes: [...b.children[0].querySelectorAll('svg > *')].map((e) => e.tagName) }; })"""
LAYER = """() => { const l = document.querySelector('.kfs-pindou'); if (!l) return null; const r = l.getBoundingClientRect();
  return { rect: [r.left, r.top, r.width, r.height], z: getComputedStyle(l.closest('.kfs-pindou-shell') || l).zIndex, sheet: !!document.querySelector('.kfs-nanya'),
    canvas: !!l.querySelector('.pd-cv'), board: getComputedStyle(l).getPropertyValue('--board').trim() }; }"""
# 本地存档里某个前缀底下有哪些钥匙（没上锁的那份）
KEYS = """(prefix) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').getAll();
  r.onsuccess = () => res((r.result || []).filter((x) => !x.del && String(x.k).startsWith(prefix)).map((x) => x.k)); r.onerror = () => rej(r.error); }; o.onerror = () => rej(o.error); })"""
CODE = "() => window.__kfsPindou ? window.__kfsPindou._code() : ''"
# 编的一幅：16×16，第 5 行一排四颗白的、一颗紫的
SAMPLE = "PD1~16~FBFBF8,6C3FA1~.80a4b.171"


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name + ".png"))


def poll(fn, timeout=8.0, step=0.15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(step)
    return False


def side(pg):
    if not pg.evaluate(REACHABLE):
        pg.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)


def hide_side(pg):
    if pg.locator("div.absolute.inset-0.z-30").count():
        pg.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)


def open_nanya(pg):
    side(pg)
    pg.locator(".kfs-side-scroll .grid > button").nth(3).click()
    pg.locator(".kfs-nanya").wait_for(timeout=5000); pg.wait_for_timeout(400)


def open_pd(pg):
    open_nanya(pg)
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="拼豆作").click()
    pg.locator(".kfs-pindou .pd-cv").wait_for(timeout=15000)
    pg.wait_for_timeout(500)


def close_pd(pg):
    pg.locator(".kfs-pindou .pd-close").click()
    poll(lambda: not pg.evaluate("!!document.querySelector('.kfs-pindou')"), 5)
    pg.wait_for_timeout(300)


def tab(pg, name):
    pg.locator(f".kfs-pindou .pd-tabs [data-tab={name}]").click(); pg.wait_for_timeout(200)


def act(pg, name):
    pg.locator(f".kfs-pindou [data-act='{name}']").first.click(); pg.wait_for_timeout(200)


def toast(pg):
    return pg.evaluate("(document.querySelector('.kfs-pindou .pd-tmsg') || {}).textContent || ''")


def tap_cell(pg, x, y):
    # 照眼下的板子大小算那一格的中心，点一下（拼豆是默认的工具）
    n = pg.evaluate("(() => { const c = window.__kfsPindou._code(); const m = /^PD1~(\\d+)~/.exec(c); return m ? Number(m[1]) : 24; })()")
    b = pg.locator(".kfs-pindou .pd-cv").bounding_box()
    c = b["width"] / n
    pg.mouse.click(b["x"] + c * (x + 0.5), b["y"] + c * (y + 0.5))
    pg.wait_for_timeout(120)


def kv_json(pg, key):
    v = pg.evaluate(KV, key)
    return json.loads(v) if v else None


def toggle_wake(pg):
    side(pg)
    pg.get_by_role("button", name="头像与设置").click(); time.sleep(0.6)
    sw = pg.get_by_role("switch", name="他自己醒")
    (sw if sw.count() else pg.get_by_role("button", name="他自己醒")).click()
    time.sleep(0.5)
    pg.get_by_role("button", name="关闭").click(); time.sleep(0.4)
    hide_side(pg)


def new_chat(pg):
    side(pg)
    pg.locator(".kfs-dock-fade button", has_text="新对话").click(); time.sleep(0.6)


def alarm_env(home):
    return dict(os.environ, KFS_ALARM_HOME=home, KFS_ALARM_PLAIN="1", KFS_ALARM_NOSTART="1", KFS_ALARM_EMAIL="qing@example.com", KFS_ALARM_PASSWORD="correct-horse", KFS_ALARM_PASS=PASS, KFS_ALARM_MANUAL_GAP="0")


def alarm(args, home):
    r = subprocess.run(["node", BUNDLE] + args, env=alarm_env(home), capture_output=True, text=True, timeout=180)
    return r.returncode, r.stdout + r.stderr


def resync(pg):
    pg.evaluate("window.__away(true)"); time.sleep(0.3)
    pg.evaluate("window.__away(false)"); time.sleep(0.3)


def until(pg, fn, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        if fn():
            return True
        resync(pg)
        time.sleep(0.6)
    return fn()


def names_of(body):
    return [t.get("name") for t in body.get("tools", [])]


def last_result(body):
    rs = [b for m in body.get("messages", []) if isinstance(m.get("content"), list) for b in m["content"] if b.get("type") == "tool_result"]
    r = rs[-1] if rs else {}
    c = r.get("content", "")
    return c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)


def last_her(body):
    m = body.get("messages", [])[-1] if body.get("messages") else {}
    return "\n".join(x.get("text", "") for x in m.get("content", []) if isinstance(x, dict))


def run(browser):
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    got = []
    pg.on("request", lambda r: got.append(r.url) if "/assets/pindou-" in r.url else None)
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 59, "bottom": 34, "left": 0, "right": 0}})
    first_time(pg)
    chat(pg, "今晚拼豆")

    # ---- 南衙 ----
    open_nanya(pg)
    rows = pg.evaluate(NANYA)
    names = [r["name"] for r in rows]
    pd = next((r for r in rows if r["name"] == "拼豆作"), None)
    ok(pd and names.index("拼豆作") == names.index("秘戏钱匣") + 1 and names.index("拼豆作") < names.index("网易云"), f"南衙里多一行“拼豆作”，排在秘戏钱匣后面、还没盖好的那两行前面（{names}）")
    ok(pd and pd["sub"] == "还没拼过" and pd["shapes"] == ["circle"] * 4, f"那一行：小字“还没拼过”，图标是四颗豆子（{pd}）")
    ok(not got, "点之前没去下载那一页")
    shot(pg, "pd_1_nanya")
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="拼豆作").click()
    pg.locator(".kfs-pindou .pd-cv").wait_for(timeout=15000); pg.wait_for_timeout(600)
    lay = pg.evaluate(LAYER)
    ok(lay and lay["z"] == "60" and lay["rect"] == [0, 0, 393, 852] and not lay["sheet"] and lay["canvas"], f"点了：菜单收起，盖一层全屏（层高 60），里面一块板子（{lay}）")
    ok(len(got) == 1, f"那一页这时候才下载，下了一回（{len(got)}）")
    ok(pg.evaluate(CODE) == "PD1~24~~.576" and pg.evaluate("document.querySelector('.kfs-pindou .pd-sizes .on').textContent") == "24×24", "头一回打开：一块空的 24×24")
    pg.locator(".kfs-pindou [data-view=fused]").click(); pg.wait_for_timeout(900)
    prefs = json.loads(pg.evaluate("localStorage.getItem('kfs-pindou-prefs') || 'null'") or "null")
    ok(prefs and prefs.get("view") == "fused" and not pg.evaluate(KV, "kfs2:pd:state"), "只换了个样子：记在这台设备上（localStorage），板子那一条不写（板子没动，不拿这台设备上的空板子去盖云端那一块）")
    pg.locator(".kfs-pindou [data-view=bead]").click(); pg.wait_for_timeout(200)
    tab(pg, "his")
    ok("“他自己醒”还关着" in pg.locator(".kfs-pindou .pd-his").inner_text(), "「他的」那一栏：他还没拼过、“他自己醒”关着，照实说")
    tab(pg, "pal")

    # ---- 拼几颗、粘贴作品码 ----
    for x in range(3, 8):
        tap_cell(pg, x, 5)
    code1 = pg.evaluate(CODE)
    ok(code1 == "PD1~24~EE7A2D~.123a5.448", f"点了五格：一排五颗狐橘（{code1}）")
    ok(pg.evaluate("document.querySelector('.kfs-pindou .pd-badge').textContent") == "5", "用量那一栏的角上写着 5")
    tab(pg, "works")
    act(pg, "paste-code")
    pg.locator(".kfs-pindou .pd-code").fill("作品码在这儿：\n" + SAMPLE[:12] + "\n" + SAMPLE[12:])
    act(pg, "code-go")
    ok(pg.evaluate(CODE) == SAMPLE and "作品码铺好了" in toast(pg) and pg.evaluate("document.querySelector('.kfs-pindou .pd-sizes .on').textContent") == "16×16",
       "粘贴作品码（夹着别的字、断了行也认）：铺上去了，板子换成 16×16")
    shot(pg, "pd_2_pasted")

    # ---- 存进作品集 ----
    pg.locator(".kfs-pindou .pd-name").fill("测试小排")
    act(pg, "save")
    poll(lambda: pg.evaluate(KEYS, "kfs2:pd:work:"), 5)
    keys = pg.evaluate(KEYS, "kfs2:pd:work:")
    w = kv_json(pg, keys[0]) if keys else None
    ok(len(keys) == 1 and w and w.get("name") == "测试小排" and w.get("code") == SAMPLE and w.get("v") == 1, f"存进作品集：存档里一幅一条（名字、作品码）（{w}）")
    ok(pg.locator(".kfs-pindou .pd-work").count() == 1 and "测试小排" in pg.locator(".kfs-pindou .pd-work").inner_text() and "16×16，5 颗" in pg.locator(".kfs-pindou .pd-work").inner_text(),
       "作品集里多一行：名字、几号板、几颗")
    ok(poll(lambda: (kv_json(pg, "kfs2:pd:state") or {}).get("code") == SAMPLE, 4), "她这块板子隔一会儿存一回（kfs2:pd:state）")
    # 切到后台：眼下这块马上存，不等那六百毫秒（点了一格，不到半秒就存上了）；回来以后撤销那一格，板子还是那一幅
    bb = pg.locator(".kfs-pindou .pd-cv").bounding_box()
    pg.mouse.click(bb["x"] + bb["width"] * 15.5 / 16, bb["y"] + bb["width"] * 15.5 / 16)
    pg.evaluate("window.__away(true)")
    code2 = pg.evaluate(CODE)
    ok(code2 != SAMPLE and poll(lambda: (kv_json(pg, "kfs2:pd:state") or {}).get("code") == code2, 0.4, 0.05), "切到后台：眼下这块马上存了，不等那六百毫秒")
    pg.evaluate("window.__away(false)"); pg.wait_for_timeout(300)
    act(pg, "undo")
    ok(pg.evaluate(CODE) == SAMPLE, "撤销那一格：还是那一幅")

    # ---- 发给光义：开着的时候他先不回 ----
    c0 = len(calls())
    act(pg, "send")
    sent = pg.locator(".kfs-pindou [data-act=send]")
    ok(poll(lambda: sent.inner_text() == "已发" and sent.is_disabled(), 4) and "关上这一页，他看了再回" in toast(pg), "点“发给光义”：变“已发”，告诉她关上以后他再回")
    tap_cell(pg, 0, 0)
    ok(sent.inner_text() == "发给光义" and not sent.is_disabled(), "板子又动了：又能发")
    act(pg, "send")
    time.sleep(3.0)
    ok(len(calls()) == c0, "开着的时候发了两幅：他先不回（没往那边问）")
    shot(pg, "pd_3_sent")
    close_pd(pg)
    cards = pg.locator(".kfs-chat-rows .kfs-pd-card")
    ok(cards.count() == 2 and "测试小排" in cards.nth(0).inner_text() and cards.nth(0).locator("canvas").count() == 1, "叉一点回到聊天：正中两个方框（〔拼豆〕名字、那一幅），不是气泡")
    ok(poll(lambda: len(calls()) == c0 + 1, 15), "关上了才回：问了一回，两幅一起看")
    wait_js(pg, "!document.body.innerText.includes('正在输入')", 20000); pg.wait_for_timeout(1200)
    body = calls()[c0]["body"] if len(calls()) > c0 else {}
    her = body.get("messages", [])[-1].get("content", []) if body.get("messages") else []
    imgs = [b for b in her if b.get("type") == "image"]
    texts = [b.get("text", "") for b in her if b.get("type") == "text"]
    ok(len(imgs) == 2 and all(b["source"]["media_type"] == "image/png" for b in imgs) and texts.count("【拼豆作】卿卿拼了一幅《测试小排》（16×16 的板子，5 颗，2 种颜色）") == 1 and any("6 颗" in t for t in texts),
       f"寄过去的：两张图，各跟着一句【拼豆作】卿卿拼了一幅《…》（几号板、几颗、几种颜色；第二幅没改名字，带着原来那个）（{texts[:3]}）")
    shot(pg, "pd_4_chat")

    # ---- 重新打开开封府、另一台设备 ----
    pg.reload()
    kite(pg)
    open_pd(pg)
    code_now = pg.evaluate(CODE)
    tab(pg, "works")
    ok(code_now.startswith("PD1~16~") and code_now != SAMPLE and pg.locator(".kfs-pindou .pd-work").count() == 1, "重新打开开封府：板子还是走的时候那样，作品集还在")
    close_pd(pg)
    ctx2 = browser.new_context(**IPHONE)
    ctx2.add_init_script(STUB)
    pg2 = ctx2.new_page()
    pg2.on("pageerror", lambda e: errors.append("另一台：" + str(e)))
    second_device(pg2)
    open_pd(pg2)
    tab(pg2, "works")
    ok(poll(lambda: pg2.locator(".kfs-pindou .pd-work").count() == 1, 10) and "测试小排" in pg2.locator(".kfs-pindou .pd-work").inner_text(), "另一台设备登进来：作品集同步过来了（加密了跟着云端走）")
    ok(pg2.evaluate(CODE) == code_now, "另一台设备上打开：板子是头一台走的时候那块（跟着云端走）")
    # 头一台又拼了一颗，推上去；另一台开着、手上没有没存的：同步下来就换上
    open_pd(pg)
    tap_cell(pg, 1, 1)
    code_a = pg.evaluate(CODE)
    ok(code_a != code_now and poll(lambda: (kv_json(pg, "kfs2:pd:state") or {}).get("code") == code_a, 4), "头一台又拼了一颗，存上了")
    pg.evaluate("window.__away(true)"); time.sleep(1.5); pg.evaluate("window.__away(false)")
    resync(pg2)
    ok(poll(lambda: pg2.evaluate(CODE) == code_a, 8) and "同步过来了" in toast(pg2), "另一台开着：头一台新拼的同步下来，换上了（它手上没有没存的），说一声")
    # 两台都拼了：头一台又拼一颗推上去；另一台切走又切回来的那一下拼了一颗（还没存），同步下来的那一块不换上；
    # 存的时候认出存着的已经不是它接着拼的那一份：那一份存进作品集，不盖掉
    tap_cell(pg, 2, 2)
    code_b = pg.evaluate(CODE)
    ok(poll(lambda: (kv_json(pg, "kfs2:pd:state") or {}).get("code") == code_b, 4), "头一台又拼一颗，存上了")
    pg.evaluate("window.__away(true)"); time.sleep(1.5); pg.evaluate("window.__away(false)")
    pg2.evaluate("window.__away(true)")
    tap_cell(pg2, 3, 3)
    pg2.evaluate("window.__away(false)")
    code_c = pg2.evaluate(CODE)
    def kept():
        ws = [kv_json(pg2, k) for k in pg2.evaluate(KEYS, "kfs2:pd:work:")]
        return [w for w in ws if w and w.get("name") == "另一台设备上的那块"]
    ok(poll(lambda: len(kept()) == 1, 8) and kept()[0].get("code") == code_b, "另一台存的时候认出来：头一台后来拼的那一块存进了作品集（“另一台设备上的那块”），没被盖掉")
    ok(poll(lambda: (kv_json(pg2, "kfs2:pd:state") or {}).get("code") == code_c, 4) and pg2.evaluate(CODE) == code_c and "存进作品集了" in toast(pg2),
       "另一台眼前那一幅照旧（存上的是它），说一声那一块存进作品集了")
    close_pd(pg)
    ctx2.close()

    # ---- 删一幅 ----
    open_pd(pg)
    tab(pg, "works")
    ok(poll(lambda: len(pg.evaluate(KEYS, "kfs2:pd:work:")) == 2 and pg.locator(".kfs-pindou .pd-work").count() == 2, 10), "头一台的作品集里也有了那一块（同步过来的）：两幅")
    keys2 = sorted(pg.evaluate(KEYS, "kfs2:pd:work:"))
    dl = pg.locator(".kfs-pindou .pd-mini.del").first
    dl.click(); pg.wait_for_timeout(200)
    ok(dl.inner_text() == "确认删除" and sorted(pg.evaluate(KEYS, "kfs2:pd:work:")) == keys2, "删除点一下：变“确认删除”，还没删")
    resync(pg)
    ok(dl.inner_text() == "确认删除", "这时候同步了一回（作品集没变）：“确认删除”还在，没被重画掉")
    dl.click()
    ok(poll(lambda: len(pg.evaluate(KEYS, "kfs2:pd:work:")) == 1, 5) and pg.locator(".kfs-pindou .pd-work").count() == 1, "再点一下：删了一幅，存档里也没了")
    dl = pg.locator(".kfs-pindou .pd-mini.del").first
    dl.click(); pg.wait_for_timeout(200); dl.click()
    ok(poll(lambda: not pg.evaluate(KEYS, "kfs2:pd:work:"), 5) and pg.locator(".kfs-pindou .pd-work").count() == 0, "另一幅也删了：作品集空了")
    close_pd(pg)

    # ---- 他在屋里拼：闹钟叫醒他一回 ----
    toggle_wake(pg)
    home = tempfile.mkdtemp(prefix="kfs-pd-")
    code, out = alarm(["setup"], home)
    ok(code == 0 and "暗号对上了" in out, "家里的闹钟：拿她设的暗号装上了")
    mock("/__debug/tool-queue?name=play_pindou&text=" + quote("去桌上拼一会儿") + "&input=" + quote(json.dumps({"action": "paint", "rows": [{"y": 10, "x": 8, "beads": "kkkkkkkk"}, {"y": 11, "x": 8, "beads": "kooooook"}]})))
    mock("/__debug/tool-queue?name=play_pindou&input=" + quote(json.dumps({"action": "finish", "name": "一块小糕"})))
    mock("/__debug/tool-queue?name=play_pindou&input=" + quote(json.dumps({"action": "paint", "rows": [{"y": 0, "beads": "ppp"}]})))
    mock("/__debug/reply-queue?text=" + quote("拼完一块，又开了一块\n[WAKE:+2h]"))
    c1 = len(calls())
    code, out = alarm(["wake"], home)
    woke = calls()[c1]["body"] if len(calls()) > c1 else {}
    ok(code == 0 and "醒过了" in out, f"叫醒他一回（{out.strip().splitlines()[-1] if out.strip() else ''}）")
    ok("play_pindou" in names_of(woke) and "- 去桌上拼拼豆（play_pindou 工具）" in last_her(woke) and "拼豆板还空着" in last_her(woke), "醒在屋里：工具里带着 play_pindou，【醒来】里一行拼豆板（还空着）")
    after = calls()[c1 + 1]["body"] if len(calls()) > c1 + 1 else {}
    res = last_result(after)
    ok("放好了：这一笔放了 16 颗" in res and "kkkkkkkk" in res, "替他办：放好了几颗，递给他板子眼下的样子")
    ok(until(pg, lambda: bool(pg.evaluate(KV, "kfs2:pindou"))), "闹钟写的那块板子同步到手机上了（kfs2:pindou，加密了跟着云端走）")
    his = kv_json(pg, "kfs2:pindou") or {}
    ok(len(his.get("done", [])) == 1 and his["done"][0]["name"] == "一块小糕" and his.get("code", "").startswith("PD1~24~F6A3BC~a3."), f"存档里：挂起来一幅《一块小糕》，桌上那块又拼了三颗（{his.get('code', '')[:30]}）")
    open_nanya(pg)
    pdrow = next((r for r in pg.evaluate(NANYA) if r["name"] == "拼豆作"), {})
    ok(pdrow.get("sub") == "他挂起来 1 幅", f"南衙那一行的小字跟着变：他挂起来 1 幅（{pdrow.get('sub')}）")
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="拼豆作").click()
    pg.locator(".kfs-pindou .pd-cv").wait_for(timeout=15000); pg.wait_for_timeout(400)
    tab(pg, "his")
    ht = pg.locator(".kfs-pindou .pd-his").inner_text()
    ok("桌上这块" in ht and "24×24，拼了 3 颗，拼到一半" in ht and "挂起来的（1 幅" in ht and "一块小糕" in ht, f"「他的」那一栏：桌上那块（拼到一半）、挂起来的那一幅（{ht[:80]}）")
    ok(pg.locator(".kfs-pindou .pd-his canvas").count() == 2 and pg.locator(".kfs-pindou .pd-his .pd-mini.del").count() == 0, "只能看：两张小图，没有删除、没有打开到板子上")
    pg.locator(".kfs-pindou .pd-his .pd-mini", has_text="看看").click(); pg.wait_for_timeout(300)
    ok(pg.locator(".kfs-pindou [data-modal=view]").is_visible() and "《一块小糕》" in pg.locator(".kfs-pindou .pd-vtitle").inner_text() and "只能看" in pg.locator(".kfs-pindou .pd-bigmeta").inner_text(), "点“看看”：大图，写着只能看")
    shot(pg, "pd_5_his")
    pg.locator(".kfs-pindou [data-modal=view] [data-act='close-modal']").click(); pg.wait_for_timeout(200)
    close_pd(pg)

    # 狐宇宙里的两行小字
    open_nanya(pg)
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="狐宇宙").click(); pg.wait_for_timeout(1200)
    notes = pg.evaluate(NOTES)
    ok(notes == ["在拼豆板上拼了一会儿", "拼完了一幅《一块小糕》，挂了起来"], f"狐宇宙里：两行小字（拼了第二回不再写），板子上的字她看不见（{notes}）")
    ok("kkkkkkkk" not in pg.evaluate(PAGE), "屋里看不到递给他的那一格一格的字")
    # 狐宇宙里打开拼豆作：不摆“发给光义”
    open_pd(pg)
    tab(pg, "works")
    ok(pg.locator(".kfs-pindou [data-act=send]").is_hidden(), "在狐宇宙里打开拼豆作：不摆“发给光义”（同秘戏钱匣）")
    close_pd(pg)

    # ---- 聊天里回屋看看拼豆 ----
    new_chat(pg)
    c2 = len(calls())
    say(pg, "回屋看看拼豆")
    wait_js(pg, "document.querySelector('.kfs-chat-rows').innerText.includes('（测试回屋）')", 20000); time.sleep(1.2)
    res = last_result(calls()[-1]["body"]) if len(calls()) > c2 else ""
    notes = pg.evaluate(NOTES)
    ok("【你屋里·拼豆板】" in res and "1.《一块小糕》" in res and "拼了 3 颗" in res, "聊天里回屋看看拼豆：递给他桌上那块、挂起来的那一幅")
    ok(notes[-1:] == ["回屋看了看拼豆板"] and "一块小糕" not in pg.evaluate(PAGE), f"她那边：一行小字“回屋看了看拼豆板”，看到的字她看不见（{notes[-1:]}）")

    # ---- 底板跟着主题换 ----
    open_pd(pg)
    boards = []
    for th in ["", "dingxiang", "heiye"]:
        pg.evaluate(f"document.documentElement.setAttribute('data-kfs-theme', '{th}')" if th else "document.documentElement.removeAttribute('data-kfs-theme')")
        pg.wait_for_timeout(300)
        boards.append(pg.evaluate(LAYER)["board"].upper())
        if th == "heiye":
            shot(pg, "pd_6_heiye")
    ok(boards == ["#CEE2DA", "#EEE4F8", "#6C8090"], f"底板跟着三套主题换颜色（{boards}）")
    pg.evaluate("document.documentElement.removeAttribute('data-kfs-theme')")

    # ---- 一块板子最多 52 种颜色（作品码写不下更多）：再拼一种新的不让放 ----
    cols = [f"1{i:02X}0A0" for i in range(52)]
    tab(pg, "works")
    act(pg, "paste-code")
    pg.locator(".kfs-pindou .pd-code").fill("PD1~16~" + ",".join(cols) + "~abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.204")
    act(pg, "code-go")
    full = pg.evaluate(CODE)
    ok(full.startswith("PD1~16~") and len(full.split("~")[2].split(",")) == 52, "铺上一块五十二种颜色的板子")
    tab(pg, "pal")
    pg.locator(".kfs-pindou .pd-pal .pd-cell[data-hex='#EE7A2D']").click(); pg.wait_for_timeout(150)
    tap_cell(pg, 8, 8)
    ok(pg.evaluate(CODE) == full and "最多 52 种颜色" in toast(pg), "再拼一种新的（狐橘）：不让放，说一声，板子没变")
    pg.locator(".kfs-pindou [data-tool=fill]").click(); pg.wait_for_timeout(100)
    tap_cell(pg, 8, 8)
    ok(pg.evaluate(CODE) == full and "最多 52 种颜色" in toast(pg), "填色也一样")
    pg.locator(f".kfs-pindou .pd-pal .pd-cell[data-hex='#{cols[-1]}']").click(); pg.wait_for_timeout(150)  # 自己调的颜色只留后二十种
    pg.locator(".kfs-pindou [data-tool=pen]").click(); pg.wait_for_timeout(100)
    tap_cell(pg, 8, 8)
    ok(pg.evaluate(CODE) != full, "板子上有的颜色照样拼")
    close_pd(pg)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    try:
        run(browser)
    finally:
        browser.close()

if errors:
    print("页面报错：", errors)
    count["failed"] += 1
else:
    print("页面没有报错")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] else 0)
