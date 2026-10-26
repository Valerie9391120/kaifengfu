# 秘戏钱匣（卿卿 2026 年 10 月 21 日要的，见开发说明“秘戏钱匣”那一节；签库、抽签见 src/qx/pool.js，单测在 tests/qx.test.mjs）：
#   南衙里多一行“秘戏钱匣”（外圆内方的铜钱），签库空着写“签库还空着”；点了菜单、侧栏都收起，盖一层全屏，框里装着锦盒那一页，点的时候才下载；
#   签库空着点锦盒不开抽，打开签库；导入签库文件（编的那一份，tests/fixtures/签库-测试.json）；认不出来的文件说一句；
#   签库那一页：抽哪几样（关掉一样）、找签、点叉删、撤销、加一条、翻全部、换一份先问一声、底下的署名；
#   点锦盒抽一签：卷轴上一样一竖行（关掉的那一样不抽），字转成了繁体；长按一行重抽那一行；“发给光义”点了变“已发”；
#   匣子开着的时候丢的签先攒着（他不回、也不往那边问），叉一点回到聊天，他把几签一起看了再回；寄过去的是【秘戏钱匣】卿卿抽了一签……（简体），
#   名帖里多【秘戏钱匣】那一段（写着维度名），工具里带着 qx_draw；聊天里一签一个方框；
#   他自己抽：一行小字写着抽到了什么（每个维度都抽，不看她关了哪几样）；只抽一样；写到一半截断的不替他抽；
#   锦盒那一页说出岔子了：换成一句话，签库照样能开。
# 真的浏览器、假 Supabase。账号、签都是编的。锦盒要用 WebGL 画，这台机器没有显卡，用 SwiftShader 软着画（慢，抽的时候把那一页的钟拨到展开完）。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_qx.py
# 要截图给人看：KFS_SHOTS=某个文件夹 python3 tests/e2e_qx.py
import json, os, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SHOTS = os.environ.get("KFS_SHOTS", "")
ARGS = ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "fixtures", "签库-测试.json")
NANYA = """() => [...document.querySelectorAll('.kfs-nanya .kfs-nanya-row')].map((b) => { const t = b.children[1].children;
  return { name: t[0].textContent, sub: t[1].textContent, shapes: [...b.children[0].querySelectorAll('svg > *')].map((e) => e.tagName) }; })"""
LAYER = """() => { const l = document.querySelector('.kfs-qx'); if (!l) return null; const r = l.getBoundingClientRect(), f = l.querySelector('iframe');
  return { rect: [r.left, r.top, r.width, r.height], z: getComputedStyle(l).zIndex, frames: document.querySelectorAll('iframe').length, src: f ? f.getAttribute('src') : '',
    sandbox: f ? f.getAttribute('sandbox') : '', named: f ? !!f.getAttribute('name') : false,
    chat: document.documentElement.hasAttribute('data-kfs-chat'), bg: getComputedStyle(document.body).backgroundColor, sheet: !!document.querySelector('.kfs-nanya'),
    note: (l.querySelector('.kfs-qx-note') || {}).textContent || '' }; }"""
INSIDE = """() => ({ state: window.__coinbox ? window.__coinbox.state : '', block: !!window.__qxBlock, hint: document.getElementById('hint').textContent,
  cols: [...document.querySelectorAll('.qx-col')].map((c) => [c.querySelector('.qx-d').textContent, c.querySelector('.qx-t').textContent]),
  send: [document.getElementById('send').textContent, document.getElementById('send').disabled, document.getElementById('send').classList.contains('show')],
  done: document.body.classList.contains('qx-done'), safeB: getComputedStyle(document.documentElement).getPropertyValue('--safe-b').trim(),
  font: getComputedStyle(document.getElementById('scroll-text')).fontFamily })"""
BOX_AT = "(() => { const h = document.getElementById('hint').getBoundingClientRect(); return [innerWidth / 2, h.top - 40]; })()"


def calls():
    return mock("/__debug/claude")


def qx_frame(pg, timeout=60, not_this=None):
    # 照那一层里眼下那个框找（框拆了又建，Playwright 手里的旧框对象可能还挂着，不照网址找）
    end = time.time() + timeout
    why = ""
    while time.time() < end:
        try:
            h = pg.query_selector(".kfs-qx iframe")
            f = h.content_frame() if h else None
            if f and f is not not_this and f.evaluate("!!document.body && document.body.classList.contains('ready') && !!window.__coinbox"):
                return f
        except Exception as e:
            why = str(e)[:80]
        time.sleep(0.3)
    lay = pg.evaluate(LAYER)
    print(f"  （锦盒那一页没画出来：那一层 {lay and {k: lay[k] for k in ('frames', 'src', 'note')}}，{why}）", flush=True)
    return None


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


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name + ".png"))


def open_nanya(pg):
    pg.get_by_role("button", name="打开侧栏").click(); pg.wait_for_timeout(700)
    pg.locator(".kfs-side-scroll .grid > button").nth(3).click()
    pg.locator(".kfs-nanya").wait_for(timeout=5000); pg.wait_for_timeout(400)


def draw(pg, fr):
    # 点锦盒（真点，点在提示那一行上头），把那一页的钟拨到卷轴展开完
    fr.evaluate("window.__coinbox.freeze(0)")
    x, y = fr.evaluate(BOX_AT)
    pg.mouse.click(x, y)
    started = poll(lambda: fr.evaluate("window.__coinbox.state") == "playing", 5)
    fr.evaluate("window.__coinbox.freeze(11.8)")
    poll(lambda: fr.evaluate("document.body.classList.contains('qx-done') && document.querySelectorAll('.qx-col').length > 0"), 10)
    pg.wait_for_timeout(400)
    return started


def tap_in(pg, fr, sel):
    x, y = fr.evaluate(f"(() => {{ const b = document.querySelector('{sel}').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }})()")
    pg.touchscreen.tap(x, y)


def run(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    got = []
    pg.on("request", lambda r: got.append(r.url) if "/assets/qianxia-" in r.url else None)
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 59, "bottom": 34, "left": 0, "right": 0}})
    first_time(pg)
    ta = pg.get_by_placeholder("说话，我听着")
    ta.fill("今晚去南衙抽签"); ta.press("Enter")
    poll(lambda: len(calls()) >= 1, 30); wait_js(pg, "!document.body.innerText.includes('正在输入')", 30000); pg.wait_for_timeout(800)
    c_first = calls()[-1]["body"]
    sys0 = json.dumps(c_first.get("system"), ensure_ascii=False)
    ok("qx_draw" in [t.get("name") for t in c_first.get("tools", [])] and "【秘戏钱匣】" not in sys0, "签库空着：工具里照样带着 qx_draw（跟翻日记那几样一样随时带着），名帖里没有【秘戏钱匣】")

    # ---- 南衙 ----
    open_nanya(pg)
    rows = pg.evaluate(NANYA)
    qx = next((r for r in rows if r["name"] == "秘戏钱匣"), None)
    ok([r["name"] for r in rows][3:6] == ["藏音匣", "秘戏钱匣", "拼豆作"] and qx and qx["sub"] == "签库还空着" and qx["shapes"] == ["circle", "rect"],
       f"南衙：藏音匣后面一行“秘戏钱匣”，图标是外圆内方的铜钱，小字“签库还空着”（{[r['name'] for r in rows]}，{qx}）")
    ok(not got, "点之前没去下载锦盒那一页")
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="秘戏钱匣").click()
    pg.locator(".kfs-qx").wait_for(timeout=5000)
    fr = qx_frame(pg)
    lay = pg.evaluate(LAYER)
    ok(fr is not None and lay["rect"] == [0, 0, 393, 852] and lay["z"] == "60" and "/assets/qianxia-" in lay["src"] and not lay["sheet"] and lay["chat"] and lay["bg"] == "rgb(20, 8, 6)",
       f"点了：菜单收起，盖一层全屏（层高 60），框里装着锦盒那一页；底下还是聊天（侧栏收了），网页底色换成那一页的深红黑（{lay}）")
    ok(len(got) == 1, f"那一页这时候才下载，下了一回（{len(got)}）")
    ok(lay["sandbox"] == "allow-scripts" and lay["named"], f"框是隔开的（sandbox 只给 allow-scripts），名字里带着暗号（{lay['sandbox']}）")
    if not fr:
        shot(pg, "qx_fail"); ctx.close(); return
    reach = fr.evaluate("(() => { try { return String(!!window.parent.document.body); } catch (e) { return 'blocked'; } })()")
    ok(reach == "blocked" and fr.evaluate("window.name") == "", f"那一页够不着开封府这一页（来路是 null）；框名字里的暗号它读完就清掉了（{reach}）")
    fr.evaluate("window.parent.postMessage({ qx: 'empty' }, '*')")
    pg.wait_for_timeout(600)
    ok(pg.locator(".kfs-qx .kfs-sheet-box").count() == 0, "不带暗号说的话开封府不理（冒充“签库空着还点了锦盒”，签库没打开）")
    ins = fr.evaluate(INSIDE)
    ok(ins["block"] and ins["hint"] == "先在右上角导入签库" and ins["safeB"] == "34px" and "KFS Jinhui" in ins["font"],
       f"签库空着：点锦盒不开抽，提示换成“先在右上角导入签库”；底下横条让开多高开封府写进去了；卷轴上的字是刻本体（{ins}）")
    shot(pg, "qx_01_empty")
    x, y = fr.evaluate(BOX_AT)
    pg.mouse.click(x, y)
    opened = poll(lambda: pg.locator(".kfs-qx .kfs-sheet-box").count() == 1, 5)
    ok(opened and fr.evaluate("window.__coinbox.state") == "idle" and pg.get_by_role("button", name="导入签库文件").count() == 1, "空着点锦盒：不开抽，打开签库那一页（里面一颗“导入签库文件”）")
    ok(pg.locator(".kfs-qx-credit").get_attribute("href") == "https://github.com/29-Cu/routa-della-fortuna" and pg.locator(".kfs-qx-credit").inner_text() == "Based on Ruota della Fortuna by Copper (29-Cu)",
       "签库那一页底下写着署名，带着原项目的链接（它的许可证要的）")

    # ---- 导入 ----
    bad = os.path.join(HERE, "fixtures", "文档-测试.md")
    pg.locator(".kfs-qx input[type=file]").set_input_files(bad); pg.wait_for_timeout(500)
    ok(pg.locator(".kfs-qx-msg").inner_text() == "这份文件读不出来：不是签库文件" and pg.get_by_role("button", name="导入签库文件").count() == 1, "导一份不是签库的文件：说一句，签库还空着")
    pg.locator(".kfs-qx input[type=file]").set_input_files(POOL); pg.wait_for_timeout(600)
    stored = json.loads(pg.evaluate(KV, "kfs2:qx:pool") or "null")
    ok(pg.locator(".kfs-qx-msg").inner_text() == "导进来了：4 样，11 条签。" and stored and [d["name"] for d in stored["dims"]] == ["天气", "点心", "去处", "单一"],
       f"导进来了：四样十一条，存在 kfs2:qx:pool（{pg.locator('.kfs-qx-msg').inner_text()}）")
    ok(poll(lambda: fr.evaluate("!window.__qxBlock && document.getElementById('hint').textContent === '轻触锦盒'"), 4), "导进来以后：锦盒能抽了，提示换回“轻触锦盒”")
    shot(pg, "qx_02_pool")

    # ---- 签库那一页 ----
    chips = pg.locator(".kfs-qx-dims button")
    ok([c.split(" ")[0] for c in chips.all_inner_texts()] == ["天气", "点心", "去处", "单一"] and all(b.get_attribute("aria-pressed") == "true" for b in chips.all()), "抽哪几样：四样都开着")
    chips.nth(2).click(); pg.wait_for_timeout(300)
    ok(chips.nth(2).get_attribute("aria-pressed") == "false", "关掉“去处”")
    pg.locator(".kfs-qx-search").fill("糕"); pg.wait_for_timeout(300)
    hits = pg.locator(".kfs-qx-hits .kfs-qx-tag").all_inner_texts()
    ok([h.strip() for h in hits] == ["桂花糕", "云片糕"], f"找签：搜“糕”列出两条（{hits}）")
    pg.locator(".kfs-qx-hits .kfs-qx-drop").first.click(); pg.wait_for_timeout(300)
    gone = json.loads(pg.evaluate(KV, "kfs2:qx:pool"))
    ok(pg.locator(".kfs-qx-undo").inner_text().startswith("删了「桂花糕」") and "桂花糕" not in gone["dims"][1]["tags"], "点叉：删了，顶上一条“删了「桂花糕」”")
    pg.locator(".kfs-qx-undo button").click(); pg.wait_for_timeout(300)
    back = json.loads(pg.evaluate(KV, "kfs2:qx:pool"))
    ok(back["dims"][1]["tags"][0] == "桂花糕" and pg.locator(".kfs-qx-undo").count() == 0, "撤销：放回原处")
    pg.locator(".kfs-qx-search").fill("")
    pg.locator(".kfs-qx .kfs-sheet-box button", has_text="点心").nth(1).click()
    pg.locator(".kfs-qx-new").fill("绿豆糕"); pg.locator(".kfs-qx-add").click(); pg.wait_for_timeout(300)
    ok(pg.locator(".kfs-qx-msg").inner_text() == "加上了：点心 · 绿豆糕" and json.loads(pg.evaluate(KV, "kfs2:qx:pool"))["dims"][1]["tags"][-1] == "绿豆糕", "加一条：点心里加了“绿豆糕”")
    pg.locator(".kfs-qx-new").fill("绿豆糕"); pg.locator(".kfs-qx-add").click(); pg.wait_for_timeout(300)
    ok(pg.locator(".kfs-qx-msg").inner_text() == "这一条已经有了", "重了的不加")
    pg.locator(".kfs-qx-dim", has_text="天气").click(); pg.wait_for_timeout(300)
    ok(pg.locator(".kfs-qx-all .kfs-qx-tag").count() == 4, "翻全部：点开天气，四条")
    pg.locator(".kfs-qx-replace").click(); pg.wait_for_timeout(200)
    ok(pg.get_by_text("换一份签库？眼下这 12 条").count() == 1, "换一份签库：先问一声（写着眼下有几条）")
    pg.get_by_role("button", name="算了").click()
    pg.locator(".kfs-qx .kfs-sheet-box button[aria-label='关闭']").click(); pg.wait_for_timeout(600)

    # ---- 抽一签 ----
    n0 = len(calls())
    ok(draw(pg, fr), "点锦盒：开抽")
    ins = fr.evaluate(INSIDE)
    names = [c[0] for c in ins["cols"]]
    ok(names == ["天氣", "點心", "單一"] and dict(ins["cols"])["單一"] == "只有這一條" and ins["send"] == ["发给光义", False, True],
       f"卷轴上：开着的三样各一竖行（关掉的“去处”不抽），字转成了繁体；底下“发给光义”（{ins['cols']}，{ins['send']}）")
    shot(pg, "qx_03_scroll")
    before = ins["cols"][0][1]
    col = fr.evaluate("(() => { const b = document.querySelectorAll('.qx-col')[0].getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()")
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": col[0], "y": col[1]}]})
    time.sleep(0.7)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    ok(poll(lambda: fr.evaluate(INSIDE)["cols"][0][1] != before, 4) and len(fr.evaluate(INSIDE)["cols"]) == 3, f"长按天气那一行：那一行换了一条（原来是“{before}”），别的不动")
    tap_in(pg, fr, "#send")
    ok(poll(lambda: fr.evaluate(INSIDE)["send"][:2] == ["已发", True], 4), "点“发给光义”：变成“已发”，不能再点")
    sealed = fr.evaluate(INSIDE)["cols"]
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": col[0], "y": col[1]}]})
    time.sleep(0.7)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    time.sleep(0.8)
    ok(fr.evaluate(INSIDE)["cols"] == sealed, "发出去以后这一签封上了：再长按也不换（不然卷轴上跟聊天里的对不上）")
    ok(poll(lambda: pg.locator(".kfs-lot").count() == 1, 4), "这一签进了聊天（一个方框，在匣子底下的聊天里）")
    # 再抽一次，再丢一签
    fr.evaluate("window.__coinbox.freeze(null)")
    tap_in(pg, fr, "#again")
    ok(poll(lambda: fr.evaluate("window.__coinbox.state") == "idle", 20), "再抽一次：卷轴收回去、铜钱回匣子")
    ok(fr.evaluate(INSIDE)["cols"] == [], "收回去以后卷轴上的字清掉了")
    draw(pg, fr)
    tap_in(pg, fr, "#send")
    poll(lambda: pg.locator(".kfs-lot").count() == 2, 4)
    time.sleep(3.0)
    ok(len(calls()) == n0 and not pg.evaluate("document.body.innerText.includes('正在输入')"), f"匣子开着：丢了两签，他先不回，也没往那边问（{len(calls()) - n0}）")

    # ---- 关上 ----
    pg.locator(".kfs-qx-close").click()
    ok(poll(lambda: pg.locator(".kfs-qx").count() == 0 and pg.locator("iframe").count() == 0, 3) and pg.evaluate("getComputedStyle(document.body).backgroundColor") != "rgb(20, 8, 6)",
       "叉一点：整层拆掉，框不在了，网页底色换回来")
    ok(poll(lambda: len(calls()) == n0 + 1, 15), "关上了：他这就回")
    wait_js(pg, "!document.body.innerText.includes('正在输入')", 30000); pg.wait_for_timeout(600)
    body = calls()[-1]["body"]
    last_user = [m for m in body["messages"] if m["role"] == "user"][-1]
    texts = [b.get("text", "") for b in last_user["content"] if b.get("type") == "text"]
    lots = [t for t in texts if t.startswith("【秘戏钱匣】卿卿抽了一签")]
    sys_text = json.dumps(body.get("system"), ensure_ascii=False)
    ok(len(lots) == 2 and all("单一：只有这一条" in t for t in lots) and not any("去处" in t for t in lots),
       f"寄过去的：一句话里两签，【秘戏钱匣】卿卿抽了一签（哪一枚）：一样一行，简体（{lots}）")
    ok("【秘戏钱匣】" in sys_text and "维度有：天气、点心、去处、单一。" in sys_text and "qx_draw" in [t.get("name") for t in body.get("tools", [])],
       "名帖里多了【秘戏钱匣】那一段（写着维度名），工具里带着 qx_draw")
    boxes = pg.locator(".kfs-lot").all_inner_texts()
    ok(len(boxes) == 2 and all(b.startswith("〔签〕") and "单一" in b and "只有这一条" in b for b in boxes), f"聊天里两个方框：〔签〕哪一枚，一样一行（{[b[:30] for b in boxes]}）")
    shot(pg, "qx_04_chat")

    # ---- 他自己抽 ----
    ta.fill("你也抽一签"); ta.press("Enter")
    ok(poll(lambda: pg.locator(".kfs-diary-note").count() >= 1, 30), "他抽了：聊天里冒一行小字")
    wait_js(pg, "!document.body.innerText.includes('正在输入')", 30000); pg.wait_for_timeout(500)
    note = pg.locator(".kfs-diary-note").last.inner_text()
    ok(note.startswith("抽了一签 · 天气 ") and note.count("｜") == 3 and "去处" in note, f"那一行写着抽到了什么，每个维度都抽（她关了“去处”不管他）（{note}）")
    ask = calls()
    res = [b for m in ask[-1]["body"]["messages"] if m["role"] == "user" for b in (m["content"] if isinstance(m["content"], list) else []) if b.get("type") == "tool_result"]
    ok(res and res[-1]["content"].startswith("抽到了：\n天气：") and pg.get_by_text("（测试抽签）抽到了：", exact=False).count() >= 1, "抽到的递回给他，他接着说")
    ta.fill("只抽 点心"); ta.press("Enter")
    poll(lambda: pg.locator(".kfs-diary-note").count() >= 2, 30); wait_js(pg, "!document.body.innerText.includes('正在输入')", 30000); pg.wait_for_timeout(500)
    note2 = pg.locator(".kfs-diary-note").last.inner_text()
    ok(note2.startswith("抽了一签 · 点心 ") and "｜" not in note2, f"只抽一样：那一行只有点心（{note2}）")
    ta.fill("抽到一半"); ta.press("Enter")
    poll(lambda: pg.locator(".kfs-diary-note").count() >= 3, 30); wait_js(pg, "!document.body.innerText.includes('正在输入')", 30000); pg.wait_for_timeout(500)
    ok(pg.locator(".kfs-diary-note").last.inner_text() == "想抽一签，没抽成", "写到一半截断的：不替他抽，那一行写“想抽一签，没抽成”")
    shot(pg, "qx_05_his")

    # ---- 南衙的小字跟着签库 ----
    open_nanya(pg)
    qx = next((r for r in pg.evaluate(NANYA) if r["name"] == "秘戏钱匣"), None)
    ok(qx and qx["sub"] == "签库里 12 条签", f"南衙那一行的小字：签库里几条签（{qx and qx['sub']}）")

    # ---- 那一页出岔子 ----
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="秘戏钱匣").click()
    fr = qx_frame(pg)
    if fr:
        fr.evaluate("document.getElementById('gl').dispatchEvent(new Event('webglcontextlost'))")
        fr2 = qx_frame(pg, not_this=fr)
        ok(fr2 is not None and fr2 is not fr and pg.evaluate(LAYER)["frames"] == 1 and pg.evaluate(LAYER)["note"] == "",
           "画好以后画布被收走了（iPhone 切到后台常有）：框重建一回，锦盒又画出来")
        fr = fr2 or fr
        fr.evaluate("window.__qxFail()")
        ok(poll(lambda: pg.evaluate(LAYER)["note"] == "这台手机画不出锦盒。签库照样能看、能改。" and pg.evaluate(LAYER)["frames"] == 0, 4),
           "锦盒那一页说出岔子了：框拆掉，换成一句话")
        pg.locator(".kfs-qx-pool").click()
        ok(poll(lambda: pg.locator(".kfs-qx .kfs-sheet-box").count() == 1, 3) and pg.locator(".kfs-qx-dims button").count() == 4, "签库照样能开")
        pg.locator(".kfs-qx .kfs-sheet-box button[aria-label='关闭']").click(); pg.wait_for_timeout(400)
    else:
        ok(False, "第二回进来：锦盒那一页没画出来")
    pg.locator(".kfs-qx-close").click(); pg.wait_for_timeout(500)
    ok(pg.locator(".kfs-qx").count() == 0, "叉一点回去")

    # ---- 狐宇宙（他的屋子，她只留便签）里不丢签 ----
    open_nanya(pg)
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="狐宇宙").click(); pg.wait_for_timeout(1200)
    open_nanya(pg)
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="秘戏钱匣").click()
    fr = qx_frame(pg)
    if fr:
        draw(pg, fr)
        shown = fr.evaluate("getComputedStyle(document.getElementById('send')).display")
        ok(shown == "none" and len(fr.evaluate(INSIDE)["cols"]) == 3, f"在狐宇宙里打开：照样能抽，只是不摆“发给光义”（{shown}）")
    else:
        ok(False, "在狐宇宙里打开：锦盒那一页没画出来")
    n1 = len(calls())
    pg.locator(".kfs-qx-close").click(); pg.wait_for_timeout(2500)
    ok(pg.locator(".kfs-qx").count() == 0 and len(calls()) == n1, "什么都没丢就关上：不替她叫他")
    ctx.close()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=ARGS) if CHROME else p.chromium.launch(args=ARGS)
    mock("/__debug/reset")
    run(browser)
    browser.close()

ok(not errors, f"没有没接住的错（{errors[:3]}）")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] else 0)
