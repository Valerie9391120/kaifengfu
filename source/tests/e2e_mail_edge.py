# 替她等回话：边角上的情形（第二遍审出来以后补的）。真的浏览器、真的 push 函数（跑在假 Supabase 里）。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_mail_edge.py
# 每一段从头来过（假后端清空、新开浏览器），互不相干；只想跑其中几段就把名字写在后面：python3 tests/e2e_mail_edge.py cold regen
import json, re, sys, threading, time, urllib.request
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
def page_of(ctx, tag):
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(tag + ": " + str(e)))
    return page

def phone(browser, notify=True):
    ctx = browser.new_context(**IPHONE)
    if notify:
        ctx.grant_permissions(["notifications"], origin=BASE.rstrip("/"))
    ctx.add_init_script(STUB)
    return ctx

working = lambda: any(r["state"] == "working" for r in box()["rows"])
done = lambda: any(r["state"] == "done" for r in box()["rows"])
shown = lambda text: "[...document.querySelectorAll('.items-end span')].some((e) => e.children.length === 0 && e.textContent === " + json.dumps(text) + ")"


# 开封府被收掉、回话在信箱里。她回来的那一下信箱没看成（网络还没醒）：不能就此不管，过一会儿自己再看
def cold(browser):
    A = phone(browser)
    pa = page_of(A, "cold")
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    b0 = len(banners())
    mock("/__debug/claude-hold?ms=2500")
    say(pa, "我先去忙了")
    ok(wait_mock(working, 8), "信箱没看成·准备：发一句、开封府被收掉")
    pa.close()
    ok(wait_mock(lambda: len(banners()) == b0 + 1, GRACE + 12), "信箱没看成·准备：回话进了信箱，横幅到了")
    state = {"asleep": True, "failed": 0}
    def box_route(route):
        if state["asleep"] and route.request.method == "GET":
            state["failed"] += 1
            return route.abort("internetdisconnected")
        route.continue_()
    pb = page_of(A, "cold2")
    pb.route("**/rest/v1/mailbox*", box_route)
    c0 = len(calls())
    pb.goto(BASE); kite(pb)
    pb.wait_for_timeout(2500)
    still = pb.evaluate(shown("收到：我先去忙了"))
    state["asleep"] = False                  # 网络醒了。她什么都没点
    t0 = time.time()
    got = wait_js(pb, shown("收到：我先去忙了"), 14000)
    took = time.time() - t0
    ok(state["failed"] >= 1 and not still and got and took < 12 and note_count(pb) == 0 and wait_mock(lambda: box()["rows"] == []) and len(calls()) == c0,
       f"她回来的那一下信箱没看成：过一会儿自己再看，网络醒了 {took:.1f} 秒回话就在对话里（她什么都没点；没有重发）")
    A.close()


# 点着回话的横幅进来（冷启动），他这一回换的头像是仓库里新加的图：照样认得
def avatar(browser):
    A = phone(browser)
    README = "# memes\n\n### 新来的图\n- File: `brand_new_meme.jpg`\n- Text: 测试\n- Tone: 测试\n"
    def raw(route):
        if route.request.url.endswith("README.md"):
            time.sleep(0.4)                  # 仓库里那份清单要过一会儿才读得回来
            return route.fulfill(status=200, content_type="text/plain; charset=utf-8", body=README, headers={"access-control-allow-origin": "*"})
        route.abort()
    A.route("https://raw.githubusercontent.com/**", raw)
    his = lambda page: json.loads(page.evaluate(KV, "kfs2:avatar:guangyi") or "null")
    pa = page_of(A, "avatar")
    first_time(pa); enable_notifications(pa)
    say(pa, "原样回：[AVATAR:fox_reading_book.jpg]\n先换一张")
    pa.get_by_text("先换一张").last.wait_for(timeout=20000); time.sleep(GRACE + 0.5)
    b0 = len(banners())
    mock("/__debug/claude-hold?ms=3000")
    say(pa, "原样回：[AVATAR:brand_new_meme.jpg]\n又换了")
    ok(wait_mock(working, 8), "横幅进来认头像·准备：发一句、开封府被收掉")
    pa.close()
    ok(wait_mock(lambda: len(banners()) == b0 + 1, GRACE + 12), "横幅进来认头像·准备：横幅到了")
    nav = banners()[-1]["json"]["notification"]["navigate"]
    pb = page_of(A, "avatar2")
    pb.goto(nav); kite(pb)
    pb.get_by_text("又换了").last.wait_for(timeout=15000); time.sleep(2.0)
    _, msgs = chat_of(pb)
    av = his(pb)
    ok(bool(av) and av.get("file") == "brand_new_meme.jpg" and any(it.get("type") == "avatar" and it.get("file") == "brand_new_meme.jpg" for it in msgs[-1]["items"]),
       f"点着横幅进来、他换的头像是仓库里新加的图：等清单读回来再取信，头像换上了（{av}）")
    A.close()


# 早就守着的那一回（重新打开的时候他还在回），她又切走；回来的那一下信箱没看成：不报“连不上”
def back(browser):
    A = phone(browser)
    pa = page_of(A, "back")
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=7000")
    say(pa, "我先去忙了")
    ok(wait_mock(working, 8), "回来那一下没看成·准备：发一句（他要想七秒）、开封府被收掉")
    pa.close()
    state = {"frozen": False, "held": []}
    def box_route(route):
        if state["frozen"] and route.request.method == "GET":
            state["held"].append(route)      # 手机被挂起：这一下悬着，不成也不败
            return
        route.continue_()
    pb = page_of(A, "back2")
    pb.route("**/rest/v1/mailbox*", box_route)
    pb.goto(BASE); kite(pb)
    ok(wait_js(pb, TYPING, 8000), "重新打开的时候他还在回：守着这一回（正在输入），不重发")
    state["frozen"] = True
    pb.evaluate("window.__away(true)")
    arrived = False
    end = time.time() + 20
    while time.time() < end and not arrived:
        arrived = done()
        pb.wait_for_timeout(120)             # 让浏览器那头的请求走到这里的开关上（悬住）
    ok(arrived, "她又切走了：回话照样进了信箱")
    state["frozen"] = False                  # 她回来：悬着的那一下这时候才断
    pb.evaluate("window.__away(false)")
    held = len(state["held"])
    for r in state["held"]:
        try: r.abort("connectionreset")
        except Exception: pass
    noted = False
    end = time.time() + 2.0
    while time.time() < end:
        noted = noted or note_count(pb, "点这里重发") > 0
        pb.wait_for_timeout(100)
    got = wait_js(pb, shown("收到：我先去忙了"), 12000)
    ok(held >= 1 and not noted and got and note_count(pb, "点这里重发") == 0 and len(calls()) - c0 == 1,
       f"早就守着的那一回、她切走又回来、悬着的那一眼断了：不报“连不上”，再看一眼就取到；从头到尾只问了一回（悬着 {held} 眼，报错 {noted}，取到 {got}，问了 {len(calls()) - c0} 回）")
    A.close()


# 重新回答：直接等的那头断了、信箱那一眼也没看成。过几秒自己去信箱里取，不用她再点
def regen(browser):
    A = phone(browser, notify=False)
    pa = page_of(A, "regen")
    state = {"asleep": False}
    pa.route("**/rest/v1/mailbox*", lambda route: route.abort("internetdisconnected") if state["asleep"] and route.request.method == "GET" else route.continue_())
    first_time(pa)
    chat(pa, "第一句")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=1500")
    mock("/__debug/mail-setup?drop=1")       # 小后端照常办完，回话却没送回网页
    state["asleep"] = True
    pa.get_by_role("button", name="重新回答").last.click()
    note = pa.get_by_text(re.compile("重新回答没成功"))
    note.first.wait_for(timeout=15000)
    state["asleep"] = False                  # 网络好了
    t0 = time.time()
    healed = wait_js(pa, "!document.body.innerText.includes('重新回答没成功')", 12000)
    took = time.time() - t0
    time.sleep(1.0)
    _, msgs = chat_of(pa)
    ok(healed and len(msgs[-1].get("alts") or []) == 2 and msgs[-1].get("job") and len(calls()) - c0 == 1 and wait_mock(lambda: box()["rows"] == []) and pa.get_by_text("2/2").count() == 1,
       f"重新回答没连上：过几秒自己去信箱里把新回答取出来（{took:.1f} 秒），那句“没成功”收掉；只问了一回")
    # 平常的一句话也一样：直接等的那头断了、信箱那一眼也没看成，过几秒自己取
    c1 = len(calls())
    mock("/__debug/claude-hold?ms=1500")
    mock("/__debug/mail-setup?drop=1")
    state["asleep"] = True
    say(pa, "第二句")
    pa.get_by_text(re.compile("点这里重发")).first.wait_for(timeout=15000)
    state["asleep"] = False
    t1 = time.time()
    healed2 = wait_js(pa, shown("收到：第二句"), 12000)
    took2 = time.time() - t1
    time.sleep(1.0)
    ok(healed2 and note_count(pa) == 0 and len(calls()) - c1 == 1 and wait_mock(lambda: box()["rows"] == []),
       f"平常的话没连上：过几秒自己去信箱里把回话取出来（{took2:.1f} 秒），不用她点重发；只问了一回")
    A.close()


# 重新回答的工夫里她又说了一句，结果重新回答没成：旧回答放回来，她新说的那一句不丢，接着回它
def typed(browser):
    A = phone(browser, notify=False)
    pa = page_of(A, "typed")
    first_time(pa)
    chat(pa, "甲一")
    _, before = chat_of(pa)
    mock("/__debug/claude-fail?kind=broken")
    mock("/__debug/claude-hold?ms=3000")
    pa.get_by_role("button", name="重新回答").last.click()
    ok(wait_mock(working, 8), "重新回答没成、她新说了一句·准备：他在重新回答")
    say(pa, "新说的一句")
    pa.get_by_text(re.compile("重新回答没成功")).first.wait_for(timeout=20000)
    mock("/__debug/claude-fail")
    time.sleep(0.5)
    cid, failed = chat_of(pa)
    ok([m["id"] for m in failed[:2]] == [m["id"] for m in before] and not failed[1].get("alts") and len(failed) == 3 and failed[2].get("text") == "新说的一句" and count_text(pa, "新说的一句") == 1 and count_text(pa, "收到：甲一") == 1,
       "重新回答没成：旧回答放回来，她这工夫里新说的那一句还在（画面上、存档里都在）")
    pa.get_by_text("收到：新说的一句").last.wait_for(timeout=20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.2)
    after = chat_by(pa, cid)
    ok(len(after) == 4 and after[3]["role"] == "him" and after[2].get("text") == "新说的一句", "重新回答没成以后：她新说的那一句照常回上了")
    A.close()


# 这台设备记着“新路是通的”，小后端却不接了（换回了旧的那份；或者函数里成了样板）。发完就切走：
# 切走的那一下交不成，不从藏着的页面走老路
def stale(browser):
    A = phone(browser, notify=False)
    pa = page_of(A, "stale")
    first_time(pa)
    chat(pa, "第一句")
    for state, name in [("old", "换回了旧的那份"), ("template", "函数里成了样板")]:
        mock("/__debug/push-setup")
        pa.reload(); kite(pa); pa.wait_for_timeout(1200)       # 这时候小后端是好的：开机问一声，记上“通”
        mock("/__debug/push-setup?fn=" + state)                 # 然后它不接了，这台设备还不知道
        hint = pa.evaluate("localStorage.getItem('kfs-relay')")
        c0, o0 = len(calls()), len(box()["ops"])
        say(pa, "发完就走 " + state)
        pa.wait_for_timeout(400)
        pa.evaluate("window.__away(true)")
        pa.wait_for_timeout(1500)
        early = len(calls()) - c0
        tried = box()["ops"][o0:].count("reply")
        pa.evaluate("window.__away(false)")
        pa.get_by_text("收到：发完就走 " + state).last.wait_for(timeout=20000)
        pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1200)
        total = box()["ops"][o0:].count("reply")
        ok(hint == "ok" and tried == 1 and early == 0 and total == 1 and len(calls()) - c0 == 1 and calls()[-1]["via"] == "claude" and note_count(pa) == 0 and pa.evaluate("localStorage.getItem('kfs-relay')") is None,
           f"记着新路是通的、小后端却不接了（{name}）：切走的那一下交不成，不从藏着的页面走老路（那一回会白问）；照旧等她停手那两秒多，走老路回上了；整包只往新路上寄了 {total} 回，只问了一回")
    mock("/__debug/push-setup")
    A.close()


# 这台设备还不知道新路通不通（没问过、没问成）：切走的那一下不抢着交，也不赶在这会儿去问
def unsure(browser):
    A = phone(browser, notify=False)
    pa = page_of(A, "unsure")
    first_time(pa)
    chat(pa, "第一句")
    pa.evaluate("localStorage.removeItem('kfs-relay')")
    c0, o0 = len(calls()), len(box()["ops"])
    say(pa, "还不知道的时候")
    pa.wait_for_timeout(400)
    pa.evaluate("window.__away(true)")
    pa.wait_for_timeout(1000)
    early = box()["ops"][o0:]
    pa.evaluate("window.__away(false)")
    pa.get_by_text("收到：还不知道的时候").last.wait_for(timeout=20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1200)
    ok(early == [] and len(calls()) - c0 == 1 and note_count(pa) == 0,
       f"还不知道新路通不通的时候发完就切走：切走的那一下不抢着交、也不赶在这会儿去敲门问（敲了 {early}），照旧等她停手那两秒多；回上了，只问了一回")
    A.close()


# 发完就切走，切走的那一下网正好断了（话没送到）：不报错，等她回到眼前自己补发
def blip(browser):
    A = phone(browser, notify=False)
    pa = page_of(A, "blip")
    net = {"down": False}
    pa.route(re.compile(re.escape(MOCK) + "/.*"), lambda route: route.abort("internetdisconnected") if net["down"] else route.continue_())
    first_time(pa)
    chat(pa, "第一句")
    ok(pa.evaluate("localStorage.getItem('kfs-relay')") == "ok", "切走时断网·准备：这台设备上新路走通过")
    c0 = len(calls())
    say(pa, "发完就走")
    pa.wait_for_timeout(400)
    net["down"] = True                       # 进电梯了
    pa.evaluate("window.__away(true)")
    pa.wait_for_timeout(7000)                # 页面还醒着的那几秒里，话交不出去、信箱也看不成
    noted = note_count(pa)
    net["down"] = False
    pa.evaluate("window.__away(false)")
    got = wait_js(pa, shown("收到：发完就走"), 15000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1200)
    ok(noted == 0 and got and note_count(pa) == 0 and len(calls()) - c0 == 1 and calls()[-1]["via"] == "push" and jobs(pa) == [],
       "发完就切走、那一下网正好断了：不在她不在的时候报错；她回到眼前自己补发，回上了，只问了一回")
    A.close()


# 她的话改到一半（输入框开着），点了“重新回答”，又点发送：他回完之前先不改
def edit(browser):
    A = phone(browser, notify=False)
    pa = page_of(A, "edit")
    first_time(pa)
    chat(pa, "甲一")
    bubble = pa.locator(".items-end span").filter(has_text=re.compile("^甲一$")).first
    long_press(pa, bubble)
    if not pa.locator("button", has_text="编辑").count():      # 长按没弹出来（电脑上的浏览器有时不认这一下）：用右键再叫一次菜单
        bubble.click(button="right"); time.sleep(0.5)
    pa.locator("button", has_text="编辑").first.click(); time.sleep(0.5)
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=4000")
    pa.get_by_role("button", name="重新回答").last.click()
    ok(wait_mock(working, 8), "改到一半点重新回答·准备：他在重新回答")
    ta = pa.locator("textarea").first
    ta.fill("甲一改过了"); ta.press("Enter"); time.sleep(0.5)
    toast = pa.get_by_text("等他回完再改").count()
    kept = ta.input_value()
    wait_mock(lambda: box()["rows"] == [], 20)
    wait_js(pa, "!" + TYPING, 20000); time.sleep(1.5)
    _, mid = chat_of(pa)
    ok(toast == 1 and kept == "甲一改过了" and len(mid) == 2 and mid[0].get("text") == "甲一" and not mid[0].get("alts") and len(mid[1].get("alts") or []) == 2 and len(calls()) - c0 == 1,
       "他正在重新回答的时候点发送改她的话：先不改（说一声“等他回完再改”，输入框里的字留着）；新回答照常开成第二个版本")
    ta.press("Enter")
    pa.get_by_text("收到：甲一改过了").last.wait_for(timeout=20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); time.sleep(1.5)
    _, after = chat_of(pa)
    top = [m["id"] for m in after]
    stray = [a["node"]["id"] for m in after for a in (m.get("alts") or []) if a["node"]["id"] in top and a["node"]["id"] != m["id"]]
    ok(len(after) == 2 and after[0].get("text") == "甲一改过了" and len(after[0].get("alts") or []) == 2 and after[1]["role"] == "him" and not stray and len(set(top)) == len(top),
       "他回完了再点发送：照常改，旧的那一句连同它后面的两个版本收进旧分支；同一条话不会在对话里出现两回")
    A.close()


# 两台设备。手机点了“重新回答”就放下（页面被挂起），另一台开着、把新回答取了。手机回来：不再问一遍，也不盖掉那个版本
def pair(browser):
    A = phone(browser, notify=False)
    B = phone(browser, notify=False)
    pa = page_of(A, "pairA")
    state = {"hang": False, "held": []}
    def forward(url, headers, body):
        try:
            req = urllib.request.Request(url, data=body.encode(), method="POST", headers={k: v for k, v in headers.items() if k.lower() in ("authorization", "apikey", "content-type", "origin")})
            urllib.request.urlopen(req, timeout=60).read()
        except Exception:
            pass
    def push_route(route):
        r = route.request
        if state["hang"] and r.method == "POST" and '"op":"reply"' in (r.post_data or ""):
            threading.Thread(target=forward, args=(r.url, r.headers, r.post_data), daemon=True).start()
            state["held"].append(route)      # 手机被挂起：话送到了小后端，它那头照办，回话却一直到不了这一页
            return
        route.continue_()
    pa.route("**/functions/v1/push", push_route)
    first_time(pa)
    chat(pa, "第一句"); pa.wait_for_timeout(1500)
    pb = page_of(B, "pairB")
    second_device(pb)
    pb.get_by_text("收到：第一句").last.wait_for(timeout=20000)
    def pump(cond, timeout):
        end = time.time() + timeout
        while time.time() < end:
            if cond(): return True
            pa.wait_for_timeout(150); pb.wait_for_timeout(50)
        return False
    c0 = len(calls())
    state["hang"] = True
    mock("/__debug/claude-hold?ms=2500")
    pa.get_by_role("button", name="重新回答").last.click()
    pa.evaluate("window.__away(true)")
    ok(pump(working, 10), "两台设备·重新回答·准备：手机点了重新回答就放下")
    pa.wait_for_timeout(1500)
    pb.evaluate("window.__away(true)"); pb.evaluate("window.__away(false)")       # 她去看另一台：同步、看信箱
    ok(pump(lambda: box()["rows"] == [], 25), "两台设备·重新回答：另一台把新回答取了、信收走")
    pb.wait_for_timeout(2500)                                                     # 另一台把对话传上云端
    _, onB = chat_of(pb)
    state["hang"] = False
    pa.evaluate("window.__away(false)")                                           # 她拿起手机：悬着的那头这时候才断
    for r in state["held"]:
        try: r.abort("connectionreset")
        except Exception: pass
    pump(lambda: False, 9)
    _, onA = chat_of(pa)
    ok(len(calls()) - c0 == 1 and len(onB[-1].get("alts") or []) == 2 and onA[-1].get("job") == onB[-1].get("job") and len(onA[-1].get("alts") or []) == 2 and note_count(pa) == 0 and not pa.evaluate(TYPING),
       f"两台设备·重新回答：手机回来，认出另一台已经取到了这一回的新回答：不再问一遍（一共问了 {len(calls()) - c0} 回），摆着的还是那个版本，没有报错")
    A.close(); B.close()


# 另一台设备上显示了“没送到…点这里重发”（它没等到手机把对话传上来）。她点了：先同步看一眼，回上了就不发
def resend(browser):
    A = phone(browser, notify=False)
    B = phone(browser, notify=False)
    pa = page_of(A, "resendA")
    gate = {"up": True, "down": True}
    pa.route("**/rest/v1/kv*", lambda route: route.abort("internetdisconnected") if not gate["up"] and route.request.method == "POST" else route.continue_())
    first_time(pa)
    chat(pa, "第一句"); pa.wait_for_timeout(1500)
    pb = page_of(B, "resendB")
    pb.route("**/rest/v1/kv*", lambda route: route.abort("internetdisconnected") if not gate["down"] and route.request.method == "GET" else route.continue_())
    second_device(pb)
    pb.get_by_text("收到：第一句").last.wait_for(timeout=20000)
    def pump(cond, timeout):
        end = time.time() + timeout
        while time.time() < end:
            if cond(): return True
            pa.wait_for_timeout(120); pb.wait_for_timeout(80)
        return False
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=6000")
    say(pa, "手机上说的")
    ok(pump(working, 8), "另一台点重发·准备：手机发一句（他要想六秒）")
    pa.wait_for_timeout(1500)                                                     # 手机把这一句传上云端
    pb.evaluate("window.__away(true)"); pb.evaluate("window.__away(false)")       # 另一台切回眼前：同步、看信箱
    ok(pump(lambda: pb.evaluate(TYPING) and count_text(pb, "手机上说的") == 1, 10), "另一台设备也守着这一回（正在输入）")
    gate["up"] = False                                                            # 手机这会儿传不上去：回话到了，对话却没传上云端
    ok(pump(lambda: count_text(pa, "收到：手机上说的") == 1 and box()["rows"] == [], 20), "手机收到回话、把信取走了")
    ok(pump(lambda: note_count(pb, "点这里重发") == 1, 25), "另一台等了几眼，对话里一直没有回话：只好说没送到")
    gate["down"] = False                                                          # 另一台先别自己同步（留给她点重发的那一下）
    gate["up"] = True
    pa.evaluate("window.__away(true)"); pa.evaluate("window.__away(false)")       # 手机的网好了，对话传上去了
    pump(lambda: False, 2.5)
    gate["down"] = True
    pb.get_by_text(re.compile("点这里重发")).first.click()                         # 她在另一台上点了重发
    ok(pump(lambda: count_text(pb, "收到：手机上说的") == 1, 15), "另一台点重发：同步下来的对话里已经有回话，直接换上")
    pump(lambda: False, 2.5)
    ok(len(calls()) - c0 == 1 and note_count(pb, "点这里重发") == 0 and count_text(pb, "收到：手机上说的") == 1 and not pb.evaluate(TYPING),
       f"另一台点重发：这台设备不记得为这句话发过哪一回，先同步看一眼，别处已经回上了就不发（一共只问了 {len(calls()) - c0} 回）")
    A.close(); B.close()


# 信箱里的信是别的设备上那句话的回话，这台设备还没同步到那一句：信先留着，等同步下来再放
def later(browser):
    A = phone(browser, notify=False)
    B = phone(browser, notify=False)
    pa = page_of(A, "laterA")
    first_time(pa)
    chat(pa, "第一句"); pa.wait_for_timeout(1500)
    pb = page_of(B, "laterB")
    gate = {"down": True}
    pb.route("**/rest/v1/kv*", lambda route: route.abort("internetdisconnected") if not gate["down"] and route.request.method == "GET" else route.continue_())
    second_device(pb)
    pb.get_by_text("收到：第一句").last.wait_for(timeout=20000)
    gate["down"] = False                                                          # 另一台这会儿同步不下来
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=2500")
    say(pa, "手机上新说的")
    ok(wait_mock(working, 8), "信先留着·准备：手机发一句、手机上的开封府被收掉")
    pa.wait_for_timeout(1500)                                                     # 手机把这一句传上云端
    pa.close()
    ok(wait_mock(done, 15), "信先留着·准备：回话进了信箱")
    pb.evaluate("window.__away(true)"); pb.evaluate("window.__away(false)")       # 另一台切回眼前：看信箱（同步不下来）
    pb.wait_for_timeout(3500)
    kept = len(box()["rows"]) == 1 and count_text(pb, "手机上新说的") == 0 and count_text(pb, "收到：手机上新说的") == 0 and note_count(pb) == 0
    gate["down"] = True                                                           # 同步通了：先到的是她那一句，信这才放得进
    pb.evaluate("window.__away(true)"); pb.evaluate("window.__away(false)")
    got = wait_js(pb, shown("收到：手机上新说的"), 15000)
    pb.wait_for_timeout(1500)
    ok(kept and got and count_text(pb, "手机上新说的") == 1 and count_text(pb, "收到：手机上新说的") == 1 and wait_mock(lambda: box()["rows"] == []) and len(calls()) - c0 == 1,
       "这台设备还没同步到那一句：信先留在信箱里（不乱放、不报错）；那一句同步下来，信就放进去了，只问了一回")
    A.close(); B.close()


# 没回成的信留在信箱里（她回来的时候眼前是别的对话）。她自己从侧栏翻到那段对话：这时候才说“没送到…点这里重发”
def side(browser):
    A = phone(browser)
    pa = page_of(A, "side")
    first_time(pa); enable_notifications(pa)
    chat(pa, "甲段的话")
    pa.get_by_role("button", name="打开侧栏").click(); pa.wait_for_timeout(600)
    pa.get_by_role("button", name="新对话").first.click(); pa.wait_for_timeout(600)
    chat(pa, "乙段的话")
    pa.get_by_role("button", name="打开侧栏").click(); pa.wait_for_timeout(600)
    pa.locator("button", has_text="甲段的话").first.click(); pa.wait_for_timeout(800)
    b0 = len(banners())
    mock("/__debug/claude-fail?kind=broken")
    mock("/__debug/claude-hold?ms=3000")
    say(pa, "这句会失败")
    ok(wait_mock(working, 8), "自己翻到那段对话·准备：甲段里发一句（会失败），翻到乙段，开封府被收掉")
    pa.get_by_role("button", name="打开侧栏").click(); pa.wait_for_timeout(500)
    pa.locator("button", has_text="乙段的话").first.click(); pa.wait_for_timeout(600)
    pa.close()
    ok(wait_mock(lambda: len(banners()) == b0 + 1, GRACE + 12) and "没送到" in banners()[-1]["json"]["notification"]["body"], "自己翻到那段对话·准备：横幅说没送到")
    mock("/__debug/claude-fail")
    c1 = len(calls())
    pb = page_of(A, "side2")
    pb.goto(BASE); kite(pb)                  # 从图标进来：眼前是乙段
    pb.wait_for_timeout(2500)
    waiting = count_text(pb, "收到：乙段的话") == 1 and note_count(pb, "点这里重发") == 0 and len(box()["rows"]) == 1
    pb.get_by_role("button", name="打开侧栏").click(); pb.wait_for_timeout(600)
    pb.locator("button", has_text="甲段的话").first.click()    # 她自己翻到甲段
    said = wait_js(pb, "document.body.innerText.includes('消息没送到（这把 key 没绑定工作区')", 10000)
    ok(waiting and said and count_text(pb, "这句会失败") == 1 and wait_mock(lambda: box()["rows"] == []) and len(calls()) == c1,
       "没回成的信留着、她自己从侧栏翻到那段对话：这时候给“消息没送到（缘故）。点这里重发”，信收掉；没有偷偷重发")
    pb.get_by_text(re.compile("点这里重发")).first.click()
    pb.get_by_text("收到：这句会失败").last.wait_for(timeout=20000)
    ok(len(calls()) == c1 + 1, "点重发：回上了，只问了一回")
    A.close()


# 重新回答没成（Anthropic 那头报错）、开封府又被收掉：回来说一声“重新回答没成功”，旧回答原样在
def refail(browser):
    A = phone(browser)
    pa = page_of(A, "refail")
    first_time(pa); enable_notifications(pa)
    chat(pa, "甲一")
    b0 = len(banners())
    _, before = chat_of(pa)
    mock("/__debug/claude-fail?kind=broken")
    mock("/__debug/claude-hold?ms=3000")
    pa.get_by_role("button", name="重新回答").last.click()
    ok(wait_mock(working, 8), "重新回答没成·准备：点了重新回答、开封府被收掉")
    pa.close()
    ok(wait_mock(lambda: len(banners()) == b0 + 1, GRACE + 12) and "没送到" in banners()[-1]["json"]["notification"]["body"], "重新回答没成、她不在：横幅照实说没送到")
    mock("/__debug/claude-fail")
    c1 = len(calls())
    pb = page_of(A, "refail2")
    pb.goto(BASE); kite(pb)
    said = wait_js(pb, "document.body.innerText.includes('重新回答没成功（这把 key 没绑定工作区')", 12000)
    time.sleep(1.0)
    _, after = chat_of(pb)
    ok(said and [m["id"] for m in after] == [m["id"] for m in before] and not after[-1].get("alts") and wait_mock(lambda: box()["rows"] == []) and len(calls()) == c1 and pb.get_by_text("点这里重发").count() == 0,
       "重新回答没成、开封府被收掉：回来说一声“重新回答没成功（缘故）”，旧回答原样在，不偷偷重发；信收掉")
    A.close()


SCENES = [("cold", cold), ("avatar", avatar), ("back", back), ("regen", regen), ("typed", typed), ("stale", stale), ("unsure", unsure), ("blip", blip), ("edit", edit), ("pair", pair), ("resend", resend), ("later", later), ("side", side), ("refail", refail)]
want = [a for a in sys.argv[1:] if not a.startswith("-")]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    for name, scene in SCENES:
        if want and name not in want:
            continue
        mock("/__debug/reset")
        try:
            scene(browser)
        except SystemExit:
            raise
        except Exception as e:
            ok(False, f"{name}：走到一半出了岔子：{str(e)[:300]}")
    browser.close()

print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] or errors else 0)
