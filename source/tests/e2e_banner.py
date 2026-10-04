# 横幅一个气泡敲一条：真的浏览器、真的 push 函数（跑在假 Supabase 里）、假的 Anthropic、假的推送服务。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_banner.py
# 每一段从头来过（假后端清空、新开浏览器），互不相干；只想跑其中几段就把名字写在后面：python3 tests/e2e_banner.py tidy
#
# “横幅挂在手机上”这一样，浏览器里装不出苹果的那一套（系统自己显示），用的是老一些的浏览器走的那条路：
# 把假推送服务收到的那段 JSON 借调试接口交给真的 sw.js，由它显示成一条真的通知。挂着哪几条，问浏览器就知道。
# 这个没有屏幕的浏览器有个脾气：一条通知挂上二十五到三十秒，它自己就收了（量过）。所以每一段里“还挂着”“收掉了”
# 都是在挂上去十几秒以内看的；要一直挂到这一段完的那两条（测试通知、别的对话的横幅）另说了“别自己收”（requireInteraction）
import json, re, sys, time
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

# 一回回话敲的那几条横幅。小后端一个气泡敲一条、隔一秒一条：等到从第 since 条起又到了 n 条为止，回这几条（假推送服务解开以后的样子）
def knocks(since, n, timeout=GRACE + 16):
    wait_mock(lambda: len(banners()) >= since + n, timeout=timeout)
    return banners()[since:]
bodies = lambda got: [b["json"]["notification"]["body"] for b in got]
tags = lambda got: [b["json"]["notification"].get("tag") for b in got]
shown = lambda text: "[...document.querySelectorAll('.items-end span')].some((e) => e.children.length === 0 && e.textContent === " + json.dumps(text) + ")"

# 这会儿挂着的通知（问浏览器）：[{ title, body, tag }]
HUNG = "navigator.serviceWorker.getRegistration().then((r) => (r ? r.getNotifications() : [])).then((l) => l.map((x) => ({ title: x.title, body: x.body, tag: x.tag || '' })))"
hung = lambda page: page.evaluate(HUNG)
def wait_hung(page, cond, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        if cond(hung(page)):
            return True
        page.wait_for_timeout(150)
    return False

# 借调试接口找到 sw.js 的登记号（把推送交给它要用）
def worker_of(ctx, page):
    cdp = ctx.new_cdp_session(page)
    regs = []
    cdp.on("ServiceWorker.workerRegistrationUpdated", lambda e: regs.extend(e["registrations"]))
    cdp.send("ServiceWorker.enable"); page.wait_for_timeout(800)   # 用 Playwright 自己的等法：光 sleep 的话浏览器发来的事件收不到
    rid = next((r["registrationId"] for r in regs if r["scopeURL"] == BASE), None)
    return cdp, rid

# 把一条横幅（假推送服务解开的那段 JSON）交给 sw.js，等它显示出来（挂着的里头有了这个记号）。
# 交进去了却没显示的那种偶发（见 e2e_push.py）：等三秒没动静再交一次；记号一样的两条，后一条顶掉前一条，不会多出一条
def hang(page, cdp, rid, banner):
    tag = banner["json"]["notification"].get("tag") or ""
    for _ in range(2):
        cdp.send("ServiceWorker.deliverPushMessage", {"origin": BASE.rstrip("/"), "registrationId": rid, "data": banner["text"]})
        if wait_hung(page, lambda l: any(x["tag"] == tag for x in l), 3):
            return True
    return False


# 他一回说了四样（带标题和加粗的一句、一张表情包、两句话）：敲四条，照先后、隔一秒；横幅上是平常的字
def bubbles(browser):
    A = phone(browser)
    pa = page_of(A, "bubbles")
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    b0 = len(banners())
    mock("/__debug/claude-hold?ms=1500")
    say(pa, "原样回：# 今日安排\n\n**先**吃饭，*再*散步[SPLIT][MEME:fox_reading_book.jpg][SPLIT]第三句[SPLIT]5 * 2，#标签")
    pa.wait_for_timeout(400)
    pa.evaluate("window.__away(true)")       # 发完就切走
    got = knocks(b0, 4)
    pa.wait_for_timeout(1800)                # 再等一等，看有没有多敲
    got = banners()[b0:]
    ok(bodies(got) == ["今日安排\n先吃饭，再散步", "[表情包]", "第三句", "5 * 2，#标签"],
       f"他一回说了四样：敲四条，一个气泡一条，照他说的先后；标题行的井号、围着字的星号不带，表情包单独一条（{bodies(got)!r}）")
    gaps = [got[i + 1]["at"] - got[i]["at"] for i in range(len(got) - 1)]
    ok(len(gaps) == 3 and all(950 <= g < 3000 for g in gaps), f"四条横幅一条一条到，隔一秒（隔了 {gaps} 毫秒）")
    mark = got[0]["json"]["notification"]["navigate"].split("#n=")[1]
    ok(tags(got) == [f"{mark}.{i}" for i in range(4)] and len({b["json"]["notification"]["navigate"] for b in got}) == 1 and all(b["json"]["notification"]["title"] == "光义" for b in got),
       "每条横幅自己带一个记号（哪段对话、哪一回、第几条），条条不一样；哪一条点了都回到同一处；名字都是他")
    pa.evaluate("window.__away(false)")
    back = wait_js(pa, shown("第三句"), 12000) and wait_mock(lambda: box()["rows"] == [])
    pa.wait_for_timeout(1500)
    ok(back and len(banners()) == b0 + 4, "她回来：回话在对话里，信取走；横幅就是那四条，没有多敲")
    A.close()


# 他说了六句，敲到第二条她回来了：剩下的不敲
def comeback(browser):
    A = phone(browser)
    pa = page_of(A, "comeback")
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    b0 = len(banners())
    six = ["头一句", "第二句", "第三句", "第四句", "第五句", "第六句"]
    mock("/__debug/claude-hold?ms=1500")
    say(pa, "原样回：" + "[SPLIT]".join(six))
    pa.wait_for_timeout(400)
    pa.evaluate("window.__away(true)")
    two = len(knocks(b0, 2)) >= 2
    pa.evaluate("window.__away(false)")      # 敲到第二条，她回来了
    taken = wait_mock(lambda: box()["rows"] == [], 8)
    pa.wait_for_timeout(4500)                # 要是没停，这工夫里后面几条早该到了
    got = banners()[b0:]
    ok(two and taken and 2 <= len(got) <= 3 and bodies(got) == six[:len(got)],
       f"他说了六句、敲到第二条她回来了：信一取走，剩下的不敲了（一共敲了 {len(got)} 条：正在路上的那一条拦不住，最多多一条）")
    ok(wait_js(pa, shown("第六句"), 15000), "她回来：六句都在对话里")
    A.close()


# 她点了其中一条回来（或者自己打开了开封府）：这段对话还挂着的横幅收掉；别的对话的、测试通知不动
def tidy(browser):
    A = phone(browser)
    pa = page_of(A, "tidy")
    first_time(pa); enable_notifications(pa)
    chat(pa, "甲段的话")
    cdp, rid = worker_of(A, pa)
    # 先挂一条测试通知（不带记号）、一条别的对话的横幅（记号里是另一段对话的那串字）
    stranger = "r.OTHERchatOTHERchatOTHERchat_-012.jobjobjobjobjobjob12.0"
    pa.evaluate("(t) => navigator.serviceWorker.getRegistration().then(async (r) => { await r.showNotification('测试通知', { body: '看到这条，这条路就通了。', requireInteraction: true }); await r.showNotification('光义', { body: '别的对话里的话', tag: t, requireInteraction: true }); })", stranger)
    b0 = len(banners())
    mock("/__debug/claude-hold?ms=1500")
    say(pa, "甲段又说")
    pa.wait_for_timeout(400)
    pa.evaluate("window.__away(true)")
    jia = knocks(b0, 2)
    put = len(jia) == 2 and all(hang(pa, cdp, rid, b) for b in jia)
    before = hung(pa)
    mine = jia[0]["json"]["notification"]["tag"].rsplit(".", 2)[0] + "." if jia else "?"     # r.<这段对话的那串字>.
    ok(bool(rid) and put and sorted(x["tag"] for x in before) == sorted(["", stranger] + tags(jia)) and sorted(x["body"] for x in before if x["tag"].startswith(mine)) == sorted(["收到：甲段又说", "第二条"]),
       f"收横幅·准备：她不在，他回了两句，两条横幅挂着；另有一条测试通知、一条别的对话的横幅（挂着 {len(before)} 条）")
    # 她还没回来，手机的网断了又通（开封府在后台醒着，会去看一眼信箱）：她没在看，横幅一条都不许收
    pa.evaluate("window.dispatchEvent(new Event('online'))")
    pa.wait_for_timeout(1500)
    ok(len(hung(pa)) == 4, f"她不在的时候开封府在后台动了一下（网断了又通）：横幅一条都没收（还挂着 {len(hung(pa))} 条）")
    pa.evaluate("window.__away(false)")      # 她回来了
    gone = wait_hung(pa, lambda l: not any(x["tag"].startswith(mine) for x in l), 10)
    left = hung(pa)
    ok(gone and sorted(x["tag"] for x in left) == sorted(["", stranger]) and wait_js(pa, shown("收到：甲段又说"), 8000),
       f"她回到这段对话：这段对话的两条横幅收掉了，不用她一条一条划；别的对话的那一条、测试通知都没动（还挂着 {[x['title'] + '：' + x['body'] for x in left]}）")
    # 路上还有一条晚到的（小后端敲的和她取信的前后脚）：过一会儿也收掉
    late = hang(pa, cdp, rid, jia[1])
    late_gone = wait_hung(pa, lambda l: not any(x["tag"].startswith(mine) for x in l), 9)
    ok(late and late_gone and len(hung(pa)) == 2, "晚到的那一条（她回来以后才到的）：过两秒半再收一遍，收掉了")
    later = hang(pa, cdp, rid, jia[0])       # 那一遍收完以后又到一条（到得更晚的）：七秒的那一遍收它
    later_gone = wait_hung(pa, lambda l: not any(x["tag"].startswith(mine) for x in l), 7)
    ok(later and later_gone and len(hung(pa)) == 2, "到得更晚的一条：过七秒的那一遍也收掉了")

    # 两段对话：乙段的横幅、甲段的一条旧横幅都挂着。她回到乙段：只收乙段的；翻到甲段，才收甲段的
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    chat(pa, "乙段的话")
    pa.wait_for_timeout(7500)                # 上面那两遍“过一会儿再收”走完
    b1 = len(banners())
    mock("/__debug/claude-hold?ms=1500")
    say(pa, "乙段又说")
    pa.wait_for_timeout(400)
    pa.evaluate("window.__away(true)")
    yi = knocks(b1, 2)
    put2 = len(yi) == 2 and all(hang(pa, cdp, rid, b) for b in yi) and hang(pa, cdp, rid, jia[0])
    yours = yi[0]["json"]["notification"]["tag"].rsplit(".", 2)[0] + "." if yi else "?"
    ok(put2 and yours != mine and len(hung(pa)) == 5, f"两段对话·准备：乙段的两条、甲段的一条旧横幅都挂着（两段对话的那串字不一样）（{put2}、{yours != mine}、挂着 {[x['tag'][-6:] + '|' + x['body'][:6] for x in hung(pa)]}）")
    pa.evaluate("window.__away(false)")
    only = wait_hung(pa, lambda l: not any(x["tag"].startswith(yours) for x in l), 10)
    pa.wait_for_timeout(7500)                # 等“过一会儿再收”的那两遍也走完：甲段那一条还得在
    kept = hung(pa)
    ok(only and sorted(x["tag"] for x in kept) == sorted(["", stranger, jia[0]["json"]["notification"]["tag"]]),
       f"她回到乙段：只收乙段的横幅；甲段那一条还挂着（她还没看甲段）（挂着 {len(kept)} 条）")
    pa.get_by_role("button", name="打开侧栏").click(); pa.wait_for_timeout(700)
    pa.locator(".kfs-history button.text-left").nth(1).click(); pa.wait_for_timeout(600)      # 翻到甲段
    swept = wait_hung(pa, lambda l: not any(x["tag"].startswith(mine) for x in l), 10)
    ok(swept and pa.evaluate(shown("收到：甲段又说")) and sorted(x["tag"] for x in hung(pa)) == sorted(["", stranger]), "翻到甲段：甲段那一条也收掉了；测试通知、别的对话的还在")
    cdp.detach()
    A.close()


# 信箱没看成（回来的那一下没网）：回话还没进对话，横幅先不收（上面那几行字她还用得着）；看成了再收
def offline(browser):
    A = phone(browser)
    pa = page_of(A, "offline")
    st = {"asleep": False}
    pa.route("**/rest/v1/mailbox*", lambda route: route.abort("internetdisconnected") if st["asleep"] and route.request.method == "GET" else route.continue_())
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    cdp, rid = worker_of(A, pa)
    b0 = len(banners())
    mock("/__debug/claude-hold?ms=1500")
    mock("/__debug/mail-setup?drop=1")       # 小后端照常办完，回话却没送回网页（切走以后连接断了）
    say(pa, "我先去忙了")
    pa.wait_for_timeout(400)
    pa.evaluate("window.__away(true)")
    st["asleep"] = True                      # 从切走起这台手机就看不成信箱（没网）：回话只在信箱里，进不了对话
    end = time.time() + GRACE + 16
    while time.time() < end and len(banners()) < b0 + 2:
        pa.wait_for_timeout(200)             # 一边等横幅，一边让被拦下的请求转起来
    got = banners()[b0:]
    put = len(got) == 2 and all(hang(pa, cdp, rid, b) for b in got)
    pa.evaluate("window.__away(false)")      # 她回来的那一下，信箱还是看不成
    end = time.time() + 5
    while time.time() < end:
        pa.wait_for_timeout(200)
    still = hung(pa)
    ok(put and len(still) == 2 and not pa.evaluate(shown("收到：我先去忙了")), f"她回来的那一下信箱没看成：回话还没进对话，两条横幅先不收（还挂着 {len(still)} 条）")
    st["asleep"] = False                     # 网好了：自己再看一遍，取到信，横幅收掉
    got_it = wait_js(pa, shown("收到：我先去忙了"), 25000)
    cleared = wait_hung(pa, lambda l: len(l) == 0, 10)
    ok(got_it and cleared, "网好了：信取到、回话进了对话，横幅跟着收掉")
    cdp.detach()
    A.close()


# 保险：运行环境说快要把小后端这一趟收掉了，剩下的气泡并成一条敲出去
def merged(browser):
    A = phone(browser)
    pa = page_of(A, "merged")
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    b0 = len(banners())
    mock("/__debug/push-setup?closing=1")
    mock("/__debug/claude-hold?ms=1500")
    say(pa, "原样回：一[SPLIT]二[SPLIT]三")
    pa.wait_for_timeout(400)
    pa.evaluate("window.__away(true)")
    got = knocks(b0, 1)
    pa.wait_for_timeout(3500)
    got = banners()[b0:]
    mock("/__debug/push-setup")
    ok(bodies(got) == ["一\n二\n三"], f"小后端这一趟快到点了：三个气泡并成一条敲出去（一条一行），一句都不丢（{bodies(got)!r}）")
    A.close()


# 通知面板：小后端里是哪一份代码，写得出来（她贴完新的那份，回来看一眼就知道贴上了没有）
def panel(browser):
    A = phone(browser)
    pa = page_of(A, "panel")
    first_time(pa); enable_notifications(pa)
    mock("/__debug/push-setup?fn=prev")      # 小后端里还是上一版：会替她等回话，不会一个气泡敲一条
    open_panel(pa)
    words = pa.locator(".kfs-push").inner_text()
    pa.get_by_text("看细节").click(); pa.wait_for_timeout(300)
    detail = pa.locator(".kfs-push-detail").inner_text()
    ok("会敲你，横幅上写着他说的话" in words and pa.locator(".kfs-push-bubbles").count() == 1 and "小后端还是上一版的" in words and "换成新的那份" in words and "Deploy" in words,
       "小后端里还是上一版的代码：面板照旧说会敲她，另添一句“他说几句都并成一条敲”，想要一句一条该怎么换")
    ok("替你等回话：会" in detail and "横幅一个气泡敲一条：这份代码还不会；你按停它就不等了：这份代码还不会" in detail, "看细节：上一版的代码，后来的两样写着“这份代码还不会”")
    close_panel(pa)
    mock("/__debug/push-setup")              # 她把新的那份贴进去了
    open_panel(pa)
    words = pa.locator(".kfs-push").inner_text()
    pa.get_by_text("看细节").click(); pa.wait_for_timeout(300)
    detail = pa.locator(".kfs-push-detail").inner_text()
    ok("他说几句就敲几条" in words and pa.locator(".kfs-push-bubbles").count() == 0 and "上一版" not in words, "换成新的那份以后：面板说“他说几句就敲几条”，那句提醒收了")
    ok("横幅一个气泡敲一条：会；你按停它就不等了：会" in detail, "看细节：新的那份，两样都写着“会”")
    A.close()


SCENES = [("bubbles", bubbles), ("comeback", comeback), ("tidy", tidy), ("offline", offline), ("merged", merged), ("panel", panel)]
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
