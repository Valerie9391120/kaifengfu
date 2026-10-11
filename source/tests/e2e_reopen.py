# 划掉重新打开，落在哪儿：新的一页，还是先回到上回那段（那段还在等他回话的时候）。
# 2026 年 10 月 10 日夜里卿卿报的：划掉重新打开还是回到旧对话。根子是这台设备上记着的“交出去还没着落的那一回”有的再也不会有着落，
# 开机却一直当上回那段还在等（要等记下满一天才不算）。这里把留下这种记录的几种情形各走一遍：
# 该是新的一页的是新的一页，该回到那段的照旧回到那段；没着落的重新回答看过信箱以后记一笔“没着落了”，别的一样不动。
# 真的浏览器、真的 push 函数（跑在假 Supabase 里）、假的 Anthropic。话都是编的。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_reopen.py
# 每一段从头来过（假后端清空、新开一台“手机”），互不相干；只想跑其中几段就把名字写在后面：python3 tests/e2e_reopen.py regen_killed
import json, re, sys, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
def page_of(ctx, tag):
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(tag + ": " + str(e)))
    return page

def phone(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    return ctx

MOTTO = "(() => { const p = document.querySelector('.kfs-motto'); return p ? [...p.querySelectorAll(':scope > span')].map((s) => s.textContent) : null; })()"
def rows_shown(page): return page.evaluate("document.querySelectorAll('.kfs-chat-rows > div').length")
# 新的一页：一个气泡都没有，中间摆着那行字
def fresh(page): return rows_shown(page) == 0 and bool(page.evaluate(MOTTO))
def said(page, text): return page.evaluate("(t) => document.querySelector('.kfs-chat-rows') ? document.querySelector('.kfs-chat-rows').innerText.includes(t) : false", text)
# 这台设备上记着的那几回：（是不是重新回答，认没认过“没着落了”）
def recorded(page): return [(bool(j.get("fork")), bool(j.get("dead"))) for j in jobs(page)]
working = lambda: any(r["state"] == "working" for r in box()["rows"])
# 信箱里被删过几回（“信箱没动”拿它前后比）
deletes = lambda: sum(1 for x in box()["log"] if x["method"] == "DELETE")
# 等到记着的那几回成了这个样子
def wait_recorded(page, want, timeout=15.0):
    end = time.time() + timeout
    while time.time() < end:
        if recorded(page) == want:
            return True
        page.wait_for_timeout(200)
    return recorded(page) == want

# 开封府被系统收掉、白屏闪退：不给页面收尾的机会（切走、关页面的那几下它都听不到）
def kill(page):
    page.evaluate("""() => { for (const n of ['pagehide', 'visibilitychange', 'beforeunload', 'unload', 'freeze']) {
      window.addEventListener(n, (e) => e.stopImmediatePropagation(), true); document.addEventListener(n, (e) => e.stopImmediatePropagation(), true); } }""")
    page.close()

def reopen(ctx, tag, settle=1200):
    page = page_of(ctx, tag)
    page.goto(BASE); kite(page); page.wait_for_timeout(settle)
    return page

# 这一页上“断网”的开关：st["down"] 为真的时候，交给小后端的话出不去，信箱也看不成（和 e2e_mail_edge 里 unsent 那一段一样）。
# 手机自己还以为有网（不会报“网回来了”）
def net(page, st):
    page.route("**/functions/v1/push", lambda route: route.abort("internetdisconnected") if st["down"] and route.request.method == "POST" and '"op":"reply"' in (route.request.post_data or "") else route.continue_())
    page.route("**/rest/v1/mailbox*", lambda route: route.abort("internetdisconnected") if st["down"] and route.request.method == "GET" else route.continue_())

# 这一页看了几遍信箱（整张单子的那种，不算单看某一格的）
def watch_box(page, seen):
    def on_request(req):
        if req.method == "GET" and "/rest/v1/mailbox" in req.url and "job=eq." not in req.url and "limit=1" not in req.url:
            seen["lists"] += 1
    page.on("request", on_request)

# 等到 cond() 为真。等的工夫里让浏览器那头接着走（page.on 挂的那些要靠它才收得到；time.sleep 的时候收不到）
def wait_page(page, cond, timeout=8.0, step=150):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        page.wait_for_timeout(step)
    return cond()

# 切走又回来一下：开封府会看一遍信箱
def glance(page, wait=2500):
    page.evaluate("window.__away(true)"); page.evaluate("window.__away(false)")
    page.wait_for_timeout(wait)


# 一句没送出去（真没网，“消息没送到…点这里重发”），她没点重发、又说了一句，两句一起回上了。
# 为头一句记着的那一回再没人划：原来往后一天里每回重新打开都回到这段。现在：新的一页（那一笔还记着，只是不再当它在等）
def superseded(browser):
    A = phone(browser)
    pa = page_of(A, "superseded"); st = {"down": False}; net(pa, st); seen = {"lists": 0}; watch_box(pa, seen)
    first_time(pa); chat(pa, "第一句")
    c0, o0 = len(calls()), box()["ops"].count("reply")
    st["down"] = True
    say(pa, "这句没出去")
    noted = wait_js(pa, "document.body.innerText.includes('点这里重发')", 15000)
    st["down"] = False
    pa.wait_for_timeout(11000)                 # 记下过了十秒
    n = seen["lists"]
    glance(pa, 500)                            # 网好了，看一遍信箱
    looked = wait_page(pa, lambda: seen["lists"] > n, 8)
    pa.wait_for_timeout(2500)
    ok(noted and looked and recorded(pa) == [(False, False)] and note_count(pa, "点这里重发") == 1 and len(calls()) == c0 and box()["ops"].count("reply") == o0,
       "没送出去的那一句还等着她点重发：看过信箱以后，记着的那一回原样记着（平常的话不记“没着落了”），那一行还在，也没有自己重发")
    say(pa, "再说一句")
    got = wait_js(pa, "document.body.innerText.includes('收到：这句没出去 / 再说一句')", 25000)
    wait_js(pa, "document.body.innerText.includes('第二条')", 10000); pa.wait_for_timeout(1500)
    cid, msgs = chat_of(pa)
    roles = [m["role"] for m in msgs]
    left = jobs(pa)
    ok(got and roles == ["her", "him", "her", "her", "him"] and len(calls()) - c0 == 1 and note_count(pa) == 0 and len(left) == 1 and left[0]["last"] == msgs[2]["id"] and not left[0]["fork"],
       f"她没点重发、又说了一句：两句一起回上了，只问了一回；为头一句记着的那一回还记着（对话里：{roles}）")
    d0 = deletes()
    pa.close()
    pb = reopen(A, "superseded2")
    first = fresh(pb)
    pb.wait_for_timeout(13000)                 # 看信箱的那几遍都走完
    ok(first and fresh(pb) and recorded(pb) == [(False, False)] and deletes() == d0 and box()["rows"] == [] and len(calls()) - c0 == 1 and not pb.evaluate(TYPING),
       "划掉重新打开：新的一页（原来会回到那段）。那一回照旧记着、没人动它，信箱没动，也没有多问一回")
    pb.close()
    pc = reopen(A, "superseded3")
    ok(fresh(pc), "再划掉重新打开：还是新的一页")
    back_to_last(pc)
    pc.wait_for_timeout(4000)                  # 点开那段会再看一遍信箱：不该替头一句补发
    ok(said(pc, "收到：这句没出去 / 再说一句") and note_count(pc) == 0 and not pc.evaluate(TYPING) and len(calls()) - c0 == 1, "上回那段在历史对话里：点开，话都在，没有“点这里重发”，他也没有自己再回一遍")
    A.close()


# 照 10 月 10 日下午那一阵走一遍：他正回着的时候白屏了；页面自己重来，那一页里后端的请求都不通，回话进不来，
# 她又发了两句都没送到；然后她划掉、重新打开（这回通了）。
# 头一回重新打开回到那段是对的（那条回话在信箱里等着取，最后那句等着补发）；都回上以后再打开，是新的一页
def afternoon(browser):
    A = phone(browser)
    pa = page_of(A, "afternoon")
    first_time(pa); chat(pa, "第一句")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=4000")
    say(pa, "他正回着就白屏了")
    ok(wait_mock(working, 10), "下午那一阵·准备：发一句，他正回着")
    kill(pa)
    pb = page_of(A, "afternoon2"); st = {"down": True}
    pb.route("**/functions/v1/push", lambda route: route.abort("internetdisconnected") if st["down"] else route.continue_())
    pb.route("**/rest/v1/mailbox*", lambda route: route.abort("internetdisconnected") if st["down"] else route.continue_())
    pb.goto(BASE); kite(pb); pb.wait_for_timeout(1500)
    stuck = (not fresh(pb)) and said(pb, "他正回着就白屏了") and not said(pb, "收到：他正回着就白屏了")
    say(pb, "在吗")
    first = wait_js(pb, "document.body.innerText.includes('点这里重发')", 60000)
    say(pb, "怎么不理我"); pb.wait_for_timeout(1000)
    second = wait_js(pb, "document.body.innerText.includes('点这里重发')", 60000)
    ok(stuck and first and second and len(jobs(pb)) == 3 and len(calls()) - c0 == 1,
       "白屏以后自己重来的那一页：回到那段，可后端不通，回话进不来；她又发了两句都没送到（这台设备上记着三回，Anthropic 只问过头一回）")
    kill(pb)
    pc = reopen(A, "afternoon3")
    back = not fresh(pc)
    got = wait_js(pc, "document.body.innerText.includes('收到：他正回着就白屏了')", 20000) and wait_js(pc, "document.body.innerText.includes('收到：在吗 / 怎么不理我')", 40000)
    wait_js(pc, "document.body.innerText.includes('第二条')", 10000); pc.wait_for_timeout(2000)
    ok(back and got and len(calls()) - c0 == 2 and note_count(pc) == 0,
       "划掉重新打开（通了）：先回到那段，信箱里那条回话取出来了，最后那句自己补发、回上了（一共只多问了一回）")
    pc.close()
    pd = reopen(A, "afternoon4")
    first = fresh(pd)
    pd.wait_for_timeout(8000)
    ok(first and fresh(pd) and len(calls()) - c0 == 2 and not pd.evaluate(TYPING) and box()["rows"] == [],
       f"都回上了，再划掉重新打开：新的一页（中间那句“在吗”记着的那一回原来会让它一直回到那段）；没有多问，他也没有自己再回一遍（还记着：{recorded(pd)}）")
    A.close()


# 重新回答没成（真没网），她没再点。原来那一回一直算在等（重新回答的那一种只要记着就算），重新打开回到那段；
# 现在：网好了、看过信箱，那一笔上记“没着落了”，重新打开是新的一页。没网、信箱看不成的时候不记。
# 记了以后那一回照旧记着：回到那段再点重新回答，照常回
def regen_failed(browser):
    A = phone(browser)
    pa = page_of(A, "regen_failed"); st = {"down": False}; net(pa, st)
    first_time(pa); chat(pa, "第一句")
    c0, d0 = len(calls()), deletes()
    st["down"] = True
    pa.get_by_role("button", name="重新回答").last.click()
    noted = wait_js(pa, "document.body.innerText.includes('重新回答没成功')", 15000)
    rec = recorded(pa)
    pa.wait_for_timeout(11000)
    glance(pa, 3000)                           # 还没网：信箱看不成，认不准，不记
    blind = recorded(pa)
    ok(noted and rec == [(True, False)] and blind == rec and said(pa, "收到：第一句"),
       "重新回答没成（没网）：旧回答原样回来，那一回还记着；信箱看不成的时候不记“没着落了”")
    st["down"] = False
    glance(pa, 1000)                           # 网好了，看一遍信箱
    marked = wait_recorded(pa, [(True, True)], 15)
    ok(marked and box()["rows"] == [] and deletes() == d0 and len(calls()) == c0 and not pa.evaluate(TYPING) and not pa.evaluate("document.body.innerText.includes('2/2')"),
       "网好了、看过信箱：信箱里没有那一回，这台设备上那一笔记上“没着落了”（还记着，信箱没动）；没有自己再问一回，旧回答还是那一个版本")
    pa.close()
    pb = reopen(A, "regen_failed2")
    ok(fresh(pb) and recorded(pb) == [(True, True)], "划掉重新打开：新的一页")
    back_to_last(pb)
    pb.get_by_role("button", name="重新回答").last.click()
    again = wait_js(pb, "document.body.innerText.includes('2/2')", 25000)
    pb.wait_for_timeout(1500)
    ok(again and len(calls()) - c0 == 1 and jobs(pb) == [], "回到那段再点重新回答：照常回出第二个版本（只问了一回），回完那两回都不再记着")
    A.close()


# 重新回答没成（没网），过后自己再看信箱的那几遍也都没看成，就不再自己看了。网悄悄好了（手机没报“网回来了”），
# 她接着在那段里聊，回上了，聊完就划掉：这中间没有哪个由头去看信箱。回话落进对话以后要自己去看一遍，把那一回认成没着落的；
# 不然重新打开还会先回到那段
def regen_moved_on(browser):
    A = phone(browser)
    pa = page_of(A, "regen_moved_on"); st = {"down": False}; net(pa, st); seen = {"lists": 0}; watch_box(pa, seen)
    first_time(pa); chat(pa, "第一句")
    c0 = len(calls())
    st["down"] = True
    pa.get_by_role("button", name="重新回答").last.click()
    noted = wait_js(pa, "document.body.innerText.includes('重新回答没成功')", 15000)
    pa.wait_for_timeout(40000)                 # 四秒以后看一遍，再隔两秒、四秒、八秒、十六秒各一遍：都没看成，到这儿不再自己看了
    tried = seen["lists"]
    pa.wait_for_timeout(6000)
    gave_up = seen["lists"] == tried and recorded(pa) == [(True, False)]
    st["down"] = False                         # 网悄悄好了
    pa.wait_for_timeout(3000)
    quiet = seen["lists"] == tried
    ok(noted and tried >= 5 and gave_up and quiet, f"重新回答没成、过后自己看的那几遍信箱也都没看成（{tried} 遍）：不再自己看了；网悄悄好了，也没有哪个由头去看，那一回还没认过")
    say(pa, "接着聊")
    got = wait_js(pa, "document.body.innerText.includes('收到：接着聊')", 25000)
    wait_js(pa, "document.body.innerText.includes('第二条')", 10000)
    marked = wait_recorded(pa, [(True, True)], 12)
    ok(got and marked and seen["lists"] > tried and len(calls()) - c0 == 1, "她接着聊、回上了：回话落进对话以后自己去看了一遍信箱，把那一回认成没着落的（只问了这一回）")
    pa.close()
    pb = reopen(A, "regen_moved_on2")
    ok(fresh(pb), "聊完划掉重新打开：新的一页")
    A.close()


# 点了重新回答，话还没出手机开封府就被收掉。那一回记着，信箱里却永远不会有它。
# 头一回重新打开回到那段说得过去（开机那一下还不知道话出没出去）；看过信箱、记下满十秒，那一笔记上“没着落了”，再打开是新的一页。
# 记下还不满十秒的时候不记（话也许刚出手机，小后端还没来得及开出那一格）
def regen_killed(browser):
    A = phone(browser)
    pa = page_of(A, "regen_killed"); held = []; st = {"stuck": False}
    def push_route(route):
        r = route.request
        if st["stuck"] and r.method == "POST" and '"op":"reply"' in (r.post_data or ""):
            held.append(route); return
        route.continue_()
    pa.route("**/functions/v1/push", push_route)       # 拦在这一页上：页面一关，悬着的那一下就真的没了
    # 这一页上信箱也看不成：悬着的那一下掐掉以后，它不会在被收掉之前自己认出“信箱里没有这一回”把那一笔划了
    pa.route("**/rest/v1/mailbox*", lambda route: route.abort("internetdisconnected") if st["stuck"] and route.request.method == "GET" else route.continue_())
    first_time(pa); chat(pa, "第一句")
    c0, o0 = len(calls()), box()["ops"].count("reply")
    st["stuck"] = True
    pa.get_by_role("button", name="重新回答").last.click()
    t0 = time.time()
    end = time.time() + 5
    while time.time() < end and not held: pa.wait_for_timeout(100)
    rec = recorded(pa)
    for r in held:
        try: r.abort("internetdisconnected")           # 悬着的那一下到底没出去
        except Exception: pass
    kill(pa)
    seen = {"lists": 0}
    pb = page_of(A, "regen_killed2"); watch_box(pb, seen)
    pb.goto(BASE); kite(pb); pb.wait_for_timeout(600)
    back = not fresh(pb) and said(pb, "收到：第一句")
    looked = wait_page(pb, lambda: seen["lists"] >= 1, 8)  # 头一遍信箱看过了
    pb.wait_for_timeout(700)
    young = time.time() - t0
    kept = recorded(pb)
    ok(len(held) == 1 and rec == [(True, False)] and back and looked and young < 9.5 and kept == rec,
       f"点了重新回答、话没出手机就被收掉：头一回重新打开先回到那段；头一遍信箱看过了，那一回记下还不满十秒（{young:.1f} 秒），不记“没着落了”")
    marked = wait_recorded(pb, [(True, True)], 20)
    took = time.time() - t0
    ok(marked and took >= 10 and box()["rows"] == [] and len(calls()) == c0 and box()["ops"].count("reply") == o0 and not pb.evaluate(TYPING) and not pb.evaluate("document.body.innerText.includes('2/2')"),
       f"记下满了十秒、信箱里还是没有它：那一笔记上“没着落了”（点下去以后 {took:.1f} 秒）；没有自己再问一回，旧回答还是那一个版本")
    pb.close()
    pc = reopen(A, "regen_killed3")
    ok(fresh(pc), "再划掉重新打开：新的一页")
    A.close()


# 点了重新回答，话到了小后端（他要想二十四秒），开封府被收掉。重新打开：回到那段；
# 那一回记下早过了十秒，可信箱里有它那一格（还在等）：不记“没着落了”。新回答到了、放进对话（第二个版本），那一回才不记了；再打开是新的一页
def regen_alive(browser):
    A = phone(browser)
    pa = page_of(A, "regen_alive")
    first_time(pa); chat(pa, "第一句")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=24000")
    pa.get_by_role("button", name="重新回答").last.click()
    t0 = time.time()
    sent = wait_mock(working, 10)
    rec = recorded(pa)
    kill(pa)
    seen = {"lists": 0}
    pb = page_of(A, "regen_alive2"); watch_box(pb, seen)
    pb.goto(BASE); kite(pb); pb.wait_for_timeout(600)
    back = not fresh(pb)
    while time.time() - t0 < 12.5: pb.wait_for_timeout(250)   # 记下过了十秒
    n = seen["lists"]
    again = wait_page(pb, lambda: seen["lists"] > n, 8)       # 之后又看过一遍信箱
    pb.wait_for_timeout(1200)
    still = recorded(pb)
    waiting_rows = [r["state"] for r in box()["rows"]]
    ok(sent and rec == [(True, False)] and back and again and still == rec and waiting_rows == ["working"] and time.time() - t0 < 22,
       f"重新回答的话到了小后端、开封府被收掉：重新打开先回到那段；那一回记下早过了十秒，可信箱里有它那一格（{waiting_rows}）：不记“没着落了”")
    kill(pb)
    pc = reopen(A, "regen_alive3")
    back2 = not fresh(pc)
    got = wait_js(pc, "document.body.innerText.includes('2/2')", 40000)
    cleared = wait_js(pc, "!localStorage.getItem('kfs-jobs')", 15000) and wait_mock(lambda: box()["rows"] == [], 10)
    ok(back2 and got and cleared and len(calls()) - c0 == 1, "这时候再划掉重新打开：还是先回到那段（它确实还在等）；新回答到了，放进对话（第二个版本），信取走，那一回不再记着；只问了一回")
    pc.wait_for_timeout(1000)
    pc.close()
    pd = reopen(A, "regen_alive4")
    ok(fresh(pd), "回完了再划掉重新打开：新的一页")
    A.close()


# 认错了的那一回：记了“没着落了”，那一格后来却在信箱里冒出来了（话其实出了手机，只是到小后端到得晚）。
# 装法：同一台设备上开着两页。甲页点了重新回答，话悬在半路（还没到小后端）；乙页看过信箱、记下满了十秒，把那一回记成没着落的。
# 这时候话到了小后端，信箱里开出了那一格：乙页下一遍看信箱，把记号擦掉（它确实还在等）。甲页照常等到新回答、放进对话
def came_back(browser):
    A = phone(browser)
    pa = page_of(A, "came_back"); held = []; st = {"stuck": False}
    def push_route(route):
        r = route.request
        if st["stuck"] and r.method == "POST" and '"op":"reply"' in (r.post_data or ""):
            held.append(route); return
        route.continue_()
    pa.route("**/functions/v1/push", push_route)
    first_time(pa); chat(pa, "第一句")
    c0 = len(calls())
    st["stuck"] = True
    pa.get_by_role("button", name="重新回答").last.click()
    end = time.time() + 5
    while time.time() < end and not held: pa.wait_for_timeout(100)
    rec = recorded(pa)
    pb = reopen(A, "came_back2", settle=600)   # 同一台设备上的另一页
    back = not fresh(pb)
    marked = wait_recorded(pb, [(True, True)], 25)
    ok(len(held) == 1 and rec == [(True, False)] and back and marked and box()["rows"] == [],
       "认错了·准备：甲页的重新回答悬在半路；另一页看过信箱，那一回记下满了十秒、信箱里没有它：记成了没着落的")
    mock("/__debug/claude-hold?ms=15000")
    st["stuck"] = False
    held[0].continue_()                        # 话到了小后端
    arrived = wait_mock(working, 10)
    glance(pb, 500)
    cleared = wait_recorded(pb, [(True, False)], 12)
    rows = [r["state"] for r in box()["rows"]]
    ok(arrived and cleared and rows == ["working"], f"话到了小后端、信箱里开出了那一格（{rows}）：另一页下一遍看信箱，把“没着落了”那个记号擦掉")
    pb.close()
    got = wait_js(pa, "document.body.innerText.includes('2/2')", 40000)
    pa.wait_for_timeout(1500)
    ok(got and jobs(pa) == [] and len(calls()) - c0 == 1 and wait_mock(lambda: box()["rows"] == [], 10), "甲页照常等到新回答、放进对话（第二个版本），那一回不再记着；只问了一回")
    pa.close()
    pc = reopen(A, "came_back3")
    ok(fresh(pc), "回完了划掉重新打开：新的一页")
    A.close()


# 记着的那几回不是眼前这段对话的：一样认。
# 甲那段：重新回答没成（没着落了）；乙那段：最后一句没送出去（等着补发）；她眼前是新开的一页。
# 看过信箱：甲的那一笔记上“没着落了”，乙的那一笔原样。划掉重新打开：先回到乙那段（它还在等），那一句自己补发、回上
def elsewhere(browser):
    A = phone(browser)
    pa = page_of(A, "elsewhere"); st = {"down": False}; net(pa, st)
    first_time(pa); chat(pa, "甲一")
    c0 = len(calls())
    jia = last_chat(pa)
    st["down"] = True
    pa.get_by_role("button", name="重新回答").last.click()
    failed = wait_js(pa, "document.body.innerText.includes('重新回答没成功')", 15000)
    pa.get_by_label("新对话").click(); pa.wait_for_timeout(600)
    say(pa, "乙一")
    unsent = wait_js(pa, "document.body.innerText.includes('点这里重发')", 15000)
    yi = last_chat(pa)
    pa.get_by_label("新对话").click(); pa.wait_for_timeout(600)
    before = recorded(pa)
    st["down"] = False
    pa.wait_for_timeout(11000)
    glance(pa, 1000)
    marked = wait_recorded(pa, [(True, True), (False, False)], 15)
    pa.wait_for_timeout(3500)                  # 再等一遍：乙的那一笔不许跟着变
    left = jobs(pa)
    ok(failed and unsent and jia != yi and before == [(True, False), (False, False)] and marked and recorded(pa) == [(True, True), (False, False)] and [j["chat"] for j in left] == [jia, yi] and fresh(pa) and len(calls()) == c0,
       "记着的两回都不是眼前这段的：甲那段重新回答没成的那一笔记上了“没着落了”；乙那段没送出去的那一句还等着补发，它那一笔原样；眼前还是新的一页，没有自己去问")
    pa.close()
    pb = reopen(A, "elsewhere2")
    back = not fresh(pb) and said(pb, "乙一") and not said(pb, "甲一")
    got = wait_js(pb, "document.body.innerText.includes('收到：乙一')", 40000)
    wait_js(pb, "document.body.innerText.includes('第二条')", 10000); pb.wait_for_timeout(1500)
    ok(back and got and len(calls()) - c0 == 1 and recorded(pb) == [(True, True)] and note_count(pb) == 0,
       "划掉重新打开：先回到乙那段（它还在等），没送出去的那一句自己补发、回上了（只问了一回），回完那一回不再记着")
    pb.close()
    pc = reopen(A, "elsewhere3")
    ok(fresh(pc), "回完了再划掉重新打开：新的一页")
    A.close()


SCENES = [("superseded", superseded), ("afternoon", afternoon), ("regen_failed", regen_failed), ("regen_moved_on", regen_moved_on), ("regen_killed", regen_killed), ("regen_alive", regen_alive), ("came_back", came_back), ("elsewhere", elsewhere)]

if __name__ == "__main__":
    only = set(sys.argv[1:])
    with sync_playwright() as p:
        for name, scene in SCENES:
            if only and name not in only:
                continue
            mock("/__debug/reset")
            browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
            try:
                scene(browser)
            finally:
                browser.close()
    print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
    print(f"\n通过 {count['passed']}  失败 {count['failed']}")
    raise SystemExit(1 if count["failed"] or errors else 0)
