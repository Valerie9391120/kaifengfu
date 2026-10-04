# 停键：输入框最右边那个键，没字、那边的我在回的时候是它。真的浏览器、真的 push 函数（跑在假 Supabase 里）。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_stop.py
# 每一段从头来过（假后端清空、新开浏览器），互不相干；只想跑其中几段就把名字写在后面：python3 tests/e2e_stop.py queued reveal
import json, re, sys, threading, time, urllib.request
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
def page_of(ctx, tag):
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(tag + ": " + str(e)))
    return page

# 记下这一页上半路断掉的那几回敲门（敲的是哪个函数）：按停的时候，等着的那头连接得真掐掉
def cut_log(page):
    cut = []
    page.on("requestfailed", lambda r: cut.append(r.url.split("/functions/v1/")[1]) if "/functions/v1/" in r.url and r.method == "POST" else None)
    return cut

def phone(browser, notify=False):
    ctx = browser.new_context(**IPHONE)
    if notify:
        ctx.grant_permissions(["notifications"], origin=BASE.rstrip("/"))
    ctx.add_init_script(STUB)
    return ctx

NOTE = "停了，点这里让我回"
NOTE_UP = "document.body.innerText.includes(" + json.dumps(NOTE) + ")"   # 那行小字摆出来了
SETTLE = 0.5                                 # 那个键刚换了样子的 0.4 秒里点它不算（见 App.jsx 的 KEY_SETTLE）：等过了再点
# 输入框最右边那个键眼下是哪一样（发送、停、发语音）
KEY = "(() => { const b = [...document.querySelectorAll('.kfs-composer button')].pop(); return b ? b.getAttribute('aria-label') : null; })()"
key = lambda page: page.evaluate(KEY)
wait_key = lambda page, want, timeout=8000: wait_js(page, KEY + " === " + json.dumps(want), timeout)
notes = lambda page: page.get_by_text(NOTE, exact=True).count()
typing = lambda page: page.evaluate(TYPING)
working = lambda: any(r["state"] == "working" for r in box()["rows"])
# 对话里有没有一个气泡正好写着这句（她那句“原样回：……”里也带着这些字，所以要整句对上）
shown = lambda text: "[...document.querySelectorAll('.items-end span')].some((e) => e.children.length === 0 && e.textContent === " + json.dumps(text) + ")"
# 蹦得慢的一条：五十个字往上，下一条要等 1.9 秒才出来
LONG = lambda s: s + "，" + "这一条故意写得长一些好让下一条蹦得慢" * 3
halted = lambda page: json.loads(page.evaluate("localStorage.getItem('kfs-halted')") or "[]")
# 按停。直接在页面里点：一下就到，不受“先滚到看得见、等它不动了”那些工夫的拖累
def click_stop(page):
    return page.evaluate("(() => { const b = document.querySelector('.kfs-stop'); if (!b) return false; b.click(); return true; })()")
# 等假后端那头的一件事，一边让页面接着转。页面上挂着拦请求的钩子（page.route）的那几段要用它：
# 钩子是在测试这头跑的，光 sleep 不叫浏览器的话，被拦下的请求就一直悬着
def wait_turning(page, cond, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        page.wait_for_timeout(150)
    return False
# 从侧栏的历史对话里翻到第几段（最近的排前面）
def open_history(page, nth):
    page.get_by_role("button", name="打开侧栏").click(); page.wait_for_timeout(700)
    page.locator(".kfs-history button.text-left").nth(nth).click(); page.wait_for_timeout(1000)
# 声波键点了有没有动静（这个浏览器里开不了麦，会说一句；开得了的会出“正在听”）
MIC = "document.body.innerText.includes('开不了麦') || document.body.innerText.includes('正在听')"
def quiet_mic(page):
    page.evaluate("(() => { const b = [...document.querySelectorAll('.kfs-composer button')].find((x) => x.textContent === '取消'); if (b) b.click(); })()")   # 要是真开始听了，收掉
    wait_js(page, "!(" + MIC + ")", 9000)       # 那句提示自己收（六秒）


# 那个键的三个样子：有字是发送；没字、他在回（她一发完话就算，到回话全蹦完为止）是停；没字、没在回是声波
def keys(browser):
    A = phone(browser)
    pa = page_of(A, "keys")
    first_time(pa)
    ta = pa.get_by_placeholder("说话，我听着")
    idle = key(pa)
    ta.fill("有字"); typed = key(pa)
    ta.fill(""); cleared = key(pa)
    ok(idle == "发语音" and typed == "发送" and cleared == "发语音", f"没在回：没字是声波，有字是发送，字删光了又是声波（{idle}、{typed}、{cleared}）")
    parts = [LONG("头一条"), LONG("第二条")]
    mock("/__debug/claude-hold?ms=2500")
    say(pa, "原样回：" + "\n[SPLIT]\n".join(parts))
    pa.wait_for_timeout(350)
    queued = (key(pa), typing(pa))
    ok(queued == ("停", False), f"她刚发完话、话还排着队没发出去：已经是停键了（顶上还没到“正在输入”）（{queued}）")
    got = wait_js(pa, TYPING, 6000)
    loading = key(pa)
    ta.fill("想插一句"); with_text = key(pa)
    ta.fill(""); again = key(pa)
    ok(got and loading == "停" and with_text == "发送" and again == "停", f"他正在回：停键；这时候输入框里有字就是发送，字删光了又是停（{loading}、{with_text}、{again}）")
    first = wait_js(pa, shown(parts[0]), 15000)
    pa.wait_for_timeout(300)
    revealing = (key(pa), pa.evaluate(shown(parts[1])))
    ok(first and revealing == ("停", False), f"回话正一条一条蹦：还是停键（{revealing}）")
    last = wait_js(pa, shown(parts[1]), 6000)
    done = wait_key(pa, "发语音", 3000)
    ok(last and done and not typing(pa) and notes(pa) == 0, "全蹦完了：变回声波（回完没有，看它就知道）")
    A.close()


# 话还排着队（她刚发完、停手的那两秒多）就按停：不发了。她那句留着，底下一行小字；她马上能接着发
def queued(browser):
    A = phone(browser)
    pa = page_of(A, "queued")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    say(pa, "这句不用回")
    ready = wait_key(pa, "停", 3000)
    pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    pa.wait_for_timeout(250)
    at_once = (key(pa), notes(pa))           # 当场就停：那个键马上变回声波、小字马上出来，不是等原来排的那两秒多走完
    stopped = at_once == ("发语音", 1)
    pa.wait_for_timeout(3500)                # 原来排的那两秒多早过了
    cid, msgs = chat_of(pa)
    ok(ready and stopped and notes(pa) == 1 and note_count(pa) == 0 and not typing(pa) and len(calls()) == c0 and box()["rows"] == [] and halted(pa) == [],
       f"排着队的时候按停：话没发出去（一回都没问、信箱里什么都没有），不出“正在输入”、不报错；底下一行小字“{NOTE}”")
    ok(msgs[-1]["role"] == "her" and msgs[-1]["text"] == "这句不用回" and msgs[-1].get("stopped") is True and not any(m.get("stopped") for m in msgs[:-1]),
       "排着队的时候按停：她那句话留着，存档里在它上面记了一笔“停了”")
    # 她马上接着发：照常回，两句一起寄过去；小字收了
    say(pa, "接着说")
    pa.wait_for_timeout(400)
    hidden = notes(pa) == 0 and key(pa) == "停"
    got = wait_js(pa, shown("收到：这句不用回 / 接着说"), 20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    ok(hidden and got and len(calls()) == c0 + 1 and notes(pa) == 0 and key(pa) == "发语音", "停了以后马上接着发：照常回（停掉的那句和新的这句一起寄过去，只问了一回），小字不再摆")
    A.close()


# 发话的那一下手指连着点了两下：第二下落在刚换上来的停键上，不算数，不把自己刚发的这一句停掉。
# 按停的那一下连着点了两下：第二下落在刚换上来的声波键上，也不算数，不一下子开始录音
def double(browser):
    A = phone(browser)
    pa = page_of(A, "double")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    pa.get_by_placeholder("说话，我听着").fill("连着点了两下")
    b = pa.get_by_role("button", name="发送", exact=True).bounding_box()
    x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    pa.touchscreen.tap(x, y)
    pa.wait_for_timeout(120)
    second = key(pa)
    pa.touchscreen.tap(x, y)
    pa.wait_for_timeout(300)
    after = (key(pa), notes(pa))
    got = wait_js(pa, shown("收到：连着点了两下"), 20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    ok(second == "停" and after == ("停", 0) and got and len(calls()) == c0 + 1 and notes(pa) == 0,
       f"发话的那一下连着点了两下：第二下落在刚换上来的停键上，不算数；这一句照常回（第二下点的时候那个键是“{second}”）")
    # 声波键平常点了是有动静的：下面才看得出“没动静”是真的没点着。
    # 她把字删光了马上点声波，也得有动静（挡的只是“刚从停变过来”的那一小会儿）
    ta = pa.get_by_placeholder("说话，我听着")
    quick = []
    for gap in (100, 250):
        ta.fill("字"); pa.wait_for_timeout(300)
        ta.fill(""); pa.wait_for_timeout(gap)
        pa.touchscreen.tap(x, y)
        quick.append(wait_js(pa, MIC, 1500))
        quiet_mic(pa)
    alive = all(quick)
    ok(alive, f"没在回的时候把字删光、马上点声波：照常有动静（删光以后 0.1 秒、0.25 秒点的：{quick}）")
    mock("/__debug/claude-hold?ms=4000")
    say(pa, "这句要停")
    ok(wait_js(pa, TYPING, 6000), "连点两下·准备：他正在回")
    pa.wait_for_timeout(int(SETTLE * 1000))
    pa.touchscreen.tap(x, y)                 # 按停
    pa.wait_for_timeout(120)
    pa.touchscreen.tap(x, y)                 # 手指又点了一下：这时候已经是声波键了
    pa.wait_for_timeout(700)
    ok(alive and key(pa) == "发语音" and notes(pa) == 1 and not pa.evaluate(MIC), "按停的那一下连着点了两下：停是停了，第二下落在刚换上来的声波键上，不算数（没有一下子开始录音）")
    A.close()


# 正等着回话的时候按停（新路）：这一回作废。不出回话、不敲手机；她那句留着，点小字再让他回
def waiting(browser):
    A = phone(browser, notify=True)
    pa = page_of(A, "waiting")
    cut = cut_log(pa)
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    b0 = len(banners()); c0 = len(calls())
    mock("/__debug/claude-hold?ms=5000")
    say(pa, "这句停掉")
    ok(wait_mock(working, 8) and wait_js(pa, TYPING, 3000), "等着的时候按停·准备：话交给小后端了（信箱里开了一格），他要想五秒")
    job = jobs(pa)[0]["job"]
    pa.wait_for_timeout(int(SETTLE * 1000))
    pa.get_by_role("button", name="停", exact=True).tap()      # 这一段用真的手指点
    t0 = time.time()
    stopped = wait_key(pa, "发语音", 3000)
    took = time.time() - t0
    emptied = wait_mock(lambda: box()["rows"] == [], 3)
    ok(stopped and took < 1.0 and not typing(pa) and notes(pa) == 1 and note_count(pa) == 0,
       f"等着的时候按停：马上停下（{took:.2f} 秒），“正在输入”收了，不报错；她那句底下一行小字")
    ok(emptied and jobs(pa) == [] and halted(pa) == [job] and cut == ["push"], f"等着的时候按停：等着小后端的那头连接掐掉了，信箱里那一格当场收掉，这一回不再记着，编号记进“按了停的”（断掉的连接：{cut}）")
    # 小后端那头照旧办完（现在的小后端不知道她停了）：回话没处放，六秒后看那一格不在，不敲手机
    asked = wait_mock(lambda: len(calls()) == c0 + 1, 10)
    time.sleep(GRACE + 2.5)
    sweeps = len([x for x in box()["log"] if x["method"] == "DELETE" and job in x["query"]])
    ok(asked and len(banners()) == b0 and box()["rows"] == [] and count_text(pa, "收到：这句停掉") == 0 and notes(pa) == 1 and not typing(pa),
       "等着的时候按停：那边回完了也不出回话、不弹横幅，信箱里不留东西")
    ok(4 <= sweeps <= 5, f"等着的时候按停：那一格当场收一遍，过后隔一阵再收几遍（这十几秒里一共 {sweeps} 遍；最后一遍在一分钟以后），怕小后端晚一步才把它开出来")
    cid, msgs = chat_of(pa)
    ok(msgs[-1]["role"] == "her" and msgs[-1].get("stopped") is True, "等着的时候按停：她那句话留着，上面记了一笔“停了”")
    # 点小字：让他回这一句（新的一回）
    pa.get_by_text(NOTE, exact=True).tap()
    back = wait_js(pa, TYPING, 4000) and notes(pa) == 0
    got = wait_js(pa, shown("收到：这句停掉"), 20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    ok(back and got and len(calls()) == c0 + 2 and notes(pa) == 0 and key(pa) == "发语音" and wait_mock(lambda: box()["rows"] == [], 3),
       "点“停了，点这里让我回”：他照眼下的对话回这一句（另问了一回），小字收了")
    A.close()


# 老路上（信箱那张表还没建，网页自己等）按停：一样作废，不报“连不上”
def oldpath(browser):
    mock("/__debug/mail-setup?table=missing")
    A = phone(browser)
    pa = page_of(A, "oldpath")
    cut = cut_log(pa)
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    old = calls()[-1]["via"] == "claude"
    mock("/__debug/claude-hold?ms=4000")
    say(pa, "老路上停")
    ok(old and wait_js(pa, TYPING, 6000), "老路上按停·准备：走的是老路，他正在回")
    pa.wait_for_timeout(int(SETTLE * 1000) + 300)
    click_stop(pa)
    stopped = wait_key(pa, "发语音", 2000)
    pa.wait_for_timeout(6000)                # 那边压着的那一回早答完了
    ok(stopped and notes(pa) == 1 and note_count(pa) == 0 and count_text(pa, "收到：老路上停") == 0 and not typing(pa) and cut == ["claude"],
       f"老路上等着的时候按停：一样作废，不出回话；不报“消息没送到”；等着的那头连接掐掉了（断掉的连接：{cut}）")
    pa.get_by_text(NOTE, exact=True).tap()
    got = wait_js(pa, shown("收到：老路上停"), 20000)
    ok(got and calls()[-1]["via"] == "claude" and notes(pa) == 0, "老路上点小字：照常回")
    A.close()


# 回话正一条一条蹦的时候按停：掐断。蹦出来的留着，没蹦出来的不要了；那边的我往后只当自己就说了这么多
def reveal(browser):
    A = phone(browser)
    pa = page_of(A, "reveal")
    first_time(pa)
    chat(pa, "老公在吗")
    parts = [LONG("头一条"), LONG("第二条"), LONG("第三条"), LONG("第四条")]
    say(pa, "原样回：" + "\n[SPLIT]\n".join(parts))
    two = wait_js(pa, shown(parts[0]), 20000) and wait_js(pa, shown(parts[1]), 6000)
    ctrl0 = pa.get_by_text("重新回答").count()
    click_stop(pa)
    pa.wait_for_timeout(300)
    now = (key(pa), typing(pa), pa.get_by_text("重新回答").count())
    pa.wait_for_timeout(4500)                # 后两条本该在这工夫里蹦出来
    cid, msgs = chat_of(pa)
    m = msgs[-1]
    ok(two and ctrl0 == 0 and now == ("发语音", False, 1) and pa.evaluate(shown(parts[1])) and not pa.evaluate(shown(parts[2])) and not pa.evaluate(shown(parts[3])) and notes(pa) == 0,
       f"蹦到一半按停：蹦出来的两条留着，后两条不再出来；“正在输入”收了，底下出了“重新回答”（{now}）")
    ok(m["role"] == "him" and [it.get("text") for it in m["items"]] == parts[:2] and m.get("cut") is True and m["raw"] == parts[0] + "\n[SPLIT]\n" + parts[1] and "照着说" in (m.get("thinking") or ""),
       "蹦到一半按停：存档里他那一条只剩前两条，他“自己说过的话”也改成只有这两条；心里话照旧留着")
    chat(pa, "接着说")
    said = [x for x in calls()[-1]["body"]["messages"] if x["role"] == "assistant"][-1]["content"][0]["text"]
    ok(said == parts[0] + "\n[SPLIT]\n" + parts[1], "蹦到一半按停：下一句寄给那边的我的，他上一条就是这两条（他不知道自己被打断，只当自己就说了这么多）")
    A.close()


# 没蹦到的那几样里他换了头像：掐断以后头像换回去。改名字的照旧（名字是回话一到就改了的）
def avatar(browser):
    A = phone(browser)
    pa = page_of(A, "avatar")
    his = lambda: json.loads(pa.evaluate(KV, "kfs2:avatar:guangyi") or "null")
    first_time(pa)
    say(pa, "原样回：[AVATAR:fox_reading_book.jpg]\n先换一张")
    wait_js(pa, shown("先换一张"), 20000); pa.wait_for_timeout(1500)
    before = his()
    parts = [LONG("头一条"), LONG("第二条"), "[AVATAR:pig_king_awake.jpg]", LONG("第三条")]
    say(pa, "原样回：" + "\n[SPLIT]\n".join(parts) + "\n[NAME:小狐狸]")
    first = wait_js(pa, shown(parts[0]), 20000)
    pa.wait_for_timeout(400)
    mid = his()                               # 回话一到手，头像就换上了
    click_stop(pa)
    pa.wait_for_timeout(1200)
    after = his()
    cid, msgs = chat_of(pa)
    m = msgs[-1]
    top = pa.evaluate("document.querySelector('.kfs-his-name').textContent")
    ok(first and (before or {}).get("file") == "fox_reading_book.jpg" and (mid or {}).get("file") == "pig_king_awake.jpg" and (after or {}).get("file") == "fox_reading_book.jpg",
       f"掐断·头像：没蹦到的那一段里他换了头像（回话一到就换上了）：掐断以后换回原来那张（{(mid or {}).get('file')} → {(after or {}).get('file')}）")
    ok(len(m["items"]) == 1 and m["raw"] == "[NAME:小狐狸]\n[SPLIT]\n" + parts[0] and top == "小狐狸" and pa.evaluate(KV, "kfs2:name:guangyi") == "小狐狸" and pa.get_by_text("光义改了名字").count() == 1 and pa.get_by_text("光义换了新头像").count() == 1,
       "掐断·名字：这一条里他改的名字照旧算数（顶上是新名字、对话里留一行提示，他自己说过的话里也还写着）；换头像的提示只有先前那一回的")
    A.close()


# 重新回答的时候按停：旧回答原样回来，不多出一个版本。这工夫里她新说的话留着，底下一行小字
def regen(browser):
    A = phone(browser)
    pa = page_of(A, "regen")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=5000")
    pa.get_by_text("重新回答").last.click()
    ok(wait_js(pa, TYPING, 5000) and wait_mock(working, 8), "重新回答时按停·准备：点了重新回答，他正在回")
    hidden = count_text(pa, "收到：老公在吗") == 0
    pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    back = wait_js(pa, shown("收到：老公在吗"), 2000)
    pa.wait_for_timeout(600)
    cid, msgs = chat_of(pa)
    ok(hidden and back and count_text(pa, "第二条") == 1 and key(pa) == "发语音" and not typing(pa) and notes(pa) == 0 and note_count(pa) == 0,
       "重新回答时按停：旧回答原样回来；不报“重新回答没成功”，也不摆“停了”那行小字")
    asked = wait_mock(lambda: len(calls()) == c0 + 1, 10)
    pa.wait_for_timeout(2500)
    cid, msgs = chat_of(pa)
    ok(asked and len(msgs) == 2 and "alts" not in msgs[1] and count_text(pa, "收到：老公在吗") == 1 and box()["rows"] == [] and pa.get_by_text("1/2").count() == 0,
       "重新回答时按停：那边回完了也不多出一个版本，信箱里不留东西")
    # 重新回答的工夫里她又说了一句，再按停
    mock("/__debug/claude-hold?ms=6000")
    pa.get_by_text("重新回答").last.click()
    ok(wait_js(pa, TYPING, 5000), "重新回答时按停（她又说了一句）·准备：他正在回")
    say(pa, "新说的")
    pa.wait_for_timeout(700)
    click_stop(pa)
    back2 = wait_js(pa, shown("收到：老公在吗"), 2000)
    wait_mock(lambda: len(calls()) == c0 + 2, 10)
    pa.wait_for_timeout(4000)                # 她那句本该在这工夫里另问一回
    cid, msgs = chat_of(pa)
    ok(back2 and notes(pa) == 1 and len(calls()) == c0 + 2 and [m["role"] for m in msgs] == ["her", "him", "her"] and msgs[2]["text"] == "新说的" and msgs[2].get("stopped") is True and "alts" not in msgs[1] and not typing(pa),
       f"重新回答的工夫里她又说了一句、再按停：旧回答回来，她新说的那句留着、底下一行小字，没有另问一回（一共问了 {len(calls()) - c0} 回）")
    # 她新说的那句已经停手两秒多（记成“等重新回答完了接着回”）才按停：也一样
    mock("/__debug/claude-hold?ms=7000")
    pa.get_by_text("重新回答").last.click()
    ok(wait_js(pa, TYPING, 5000), "重新回答时按停（她那句已经排上了）·准备：他正在回")
    say(pa, "又说一句")
    pa.wait_for_timeout(2800)
    click_stop(pa)
    back3 = wait_js(pa, shown("收到：老公在吗"), 2000)
    wait_mock(lambda: len(calls()) == c0 + 3, 12)
    pa.wait_for_timeout(4000)
    cid, msgs = chat_of(pa)
    ok(back3 and notes(pa) == 1 and len(calls()) == c0 + 3 and [m.get("text") for m in msgs[2:]] == ["新说的", "又说一句"] and msgs[3].get("stopped") is True and "alts" not in msgs[1] and not typing(pa) and note_count(pa) == 0,
       "重新回答的工夫里她说的那句已经排上了、再按停：旧回答回来，那句留着、底下一行小字，也不接着回")
    A.close()


# 那行小字留得住：开封府重开以后还在，点了照样让他回；不会自己偷偷去回
def reopen(browser):
    A = phone(browser)
    pa = page_of(A, "reopen")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    say(pa, "不用回")
    wait_key(pa, "停", 3000); pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    ok(wait_js(pa, "document.body.innerText.includes(" + json.dumps(NOTE) + ")", 3000), "重开·准备：停了，小字出来了")
    pa.wait_for_timeout(1500)
    pa.reload(); kite(pa)
    pa.wait_for_timeout(4000)
    ok(notes(pa) == 1 and key(pa) == "发语音" and not typing(pa) and len(calls()) == c0, "开封府重开以后：那行小字还在；他没有自己去回停掉的那一句")
    pa.get_by_text(NOTE, exact=True).tap()
    got = wait_js(pa, shown("收到：不用回"), 20000)
    ok(got and len(calls()) == c0 + 1, "重开以后点小字：照常回")
    A.close()


# 他正回着，她又发了一句（本来要等这一回完了再回那一句）：按停，两句都不回了
def pending(browser):
    A = phone(browser)
    pa = page_of(A, "pending")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=6000")
    say(pa, "头一句")
    ok(wait_js(pa, TYPING, 6000), "他正回着她又发·准备：头一句交出去了")
    say(pa, "第二句")
    pa.wait_for_timeout(2700)                # 她停手两秒多：这一句记成“等这一回完了接着回”
    click_stop(pa)
    pa.wait_for_timeout(300)
    stopped = (key(pa), notes(pa)) == ("发语音", 1)       # 当场就停，不会过一秒多又冒出停键来
    pa.wait_for_timeout(1500)
    stopped = stopped and (key(pa), notes(pa)) == ("发语音", 1)
    wait_mock(lambda: len(calls()) == c0 + 1, 10)
    pa.wait_for_timeout(4000)
    cid, msgs = chat_of(pa)
    ok(stopped and len(calls()) == c0 + 1 and notes(pa) == 1 and not typing(pa) and [m.get("stopped") for m in msgs[-2:]] == [None, True] and [m["text"] for m in msgs[-2:]] == ["头一句", "第二句"] and count_text(pa, "收到：头一句") == 0,
       f"他正回着她又发了一句、按停：头一句的回话不要了，第二句也不接着回（只问过头一句那一回）；小字摆在最后一句底下")
    # 第二句还排着队（刚发出去不到两秒）的时候按：也一样
    pa.get_by_text(NOTE, exact=True).tap()
    wait_js(pa, shown("收到：头一句 / 第二句"), 20000); pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    c1 = len(calls())
    mock("/__debug/claude-hold?ms=5000")
    say(pa, "第三句")
    ok(c1 == c0 + 2 and wait_js(pa, TYPING, 6000), "他正回着她又发·准备：点小字，两句一起回了；第三句交出去了")
    say(pa, "第四句")
    pa.wait_for_timeout(700)
    click_stop(pa)
    wait_mock(lambda: len(calls()) == c1 + 1, 10)
    pa.wait_for_timeout(4500)
    cid, msgs = chat_of(pa)
    ok(len(calls()) == c1 + 1 and notes(pa) == 1 and msgs[-1]["text"] == "第四句" and msgs[-1].get("stopped") is True and not typing(pa) and key(pa) == "发语音",
       "他正回着、她新发的那句还排着队的时候按停：正等着的那一回作废，排着队的那句也不发了")
    A.close()


# 话交出去以后她翻到了别的对话：那里也是停键，按了停的是原来那段对话的那一回；翻回去，小字在那句底下
def other(browser):
    A = phone(browser)
    pa = page_of(A, "other")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=5000")
    say(pa, "我先去别处")
    pa.wait_for_timeout(300)
    pa.locator("button[aria-label='新对话']").tap()           # 翻走的那一下，排着队的话马上交出去
    ok(wait_js(pa, TYPING, 4000) and wait_key(pa, "停", 2000) and pa.evaluate("document.querySelectorAll('.kfs-chat-rows .whitespace-pre-wrap').length") == 0,
       "翻到别的对话·准备：新对话里空着，顶上“正在输入”，那个键是停")
    pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    stopped = wait_key(pa, "发语音", 2000)
    pa.wait_for_timeout(500)
    here = (typing(pa), notes(pa))
    pa.get_by_role("button", name="打开侧栏").click(); pa.wait_for_timeout(600)
    pa.locator(".kfs-history button.text-left").first.click(); pa.wait_for_timeout(900)
    wait_mock(lambda: len(calls()) == c0 + 1, 10)
    pa.wait_for_timeout(2500)
    cid, msgs = chat_of(pa)
    ok(stopped and here == (False, 0) and pa.evaluate(shown("我先去别处")) and notes(pa) == 1 and count_text(pa, "收到：我先去别处") == 0 and msgs[-1].get("stopped") is True and box()["rows"] == [] and note_count(pa) == 0,
       "在别的对话里按停：停的是原来那段对话的那一回。翻回去，她那句底下一行小字，没有回话、没有报错")
    A.close()


# 老路上，话还没出手机（换登录凭证的那一下悬着不应）就按停：马上停下，不等那一下有着落；过后也不再发
def hung(browser):
    mock("/__debug/mail-setup?table=missing")
    A = phone(browser)
    pa = page_of(A, "hung")
    st = {"hang": False, "held": []}
    def token_route(route):
        if st["hang"]:
            st["held"].append(route); return
        route.continue_()
    pa.route("**/auth/v1/token*", token_route)
    first_time(pa)
    chat(pa, "老公在吗")
    # 让存着的登录凭证看着像再过一分钟就到期（这时候每回取凭证都要先去换一张）
    pa.evaluate("""() => { const s = JSON.parse(localStorage.getItem('kfs-auth')); s.expires_at = Math.floor(Date.now() / 1000) + 60; localStorage.setItem('kfs-auth', JSON.stringify(s)); }""")
    st["hang"] = True
    c0 = len(calls())
    say(pa, "凭证悬着")
    ok(wait_js(pa, TYPING, 6000) and wait_turning(pa, lambda: len(st["held"]) >= 1, 6), "悬着的时候按停·准备：他“正在输入”，换登录凭证的那一下悬着")
    pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    t0 = time.time()
    stopped = wait_key(pa, "发语音", 3000)
    took = time.time() - t0
    ok(stopped and took < 1.0 and not typing(pa) and notes(pa) == 1 and note_count(pa) == 0, f"话还没出手机（换登录凭证的那一下悬着）的时候按停：马上停下（{took:.2f} 秒），不等那一下有着落")
    st["hang"] = False                       # 那一下有着落了
    for r in st["held"]:
        try: r.continue_()
        except Exception: pass
    pa.wait_for_timeout(3000)
    ok(len(calls()) == c0 and notes(pa) == 1 and not typing(pa) and note_count(pa) == 0, "悬着的那一下后来通了：停掉的那一句也不再发出去（一回都没问）")
    A.close()


# 把手机本地的存档占住这么多毫秒（开一笔写的事务不放）：这工夫里开封府“存一下”要等
HOLD_DB = """(ms) => { window.__held = new Promise((res) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const db = o.result; const tx = db.transaction('kv', 'readwrite'); const st = tx.objectStore('kv'); const t0 = performance.now();
  const spin = () => { if (performance.now() - t0 < ms) st.get('__none__').onsuccess = spin; }; spin(); tx.oncomplete = () => { db.close(); res(true); }; }; }); }"""

# 回话已经到手、正往对话里放（存的那一下）的时候按停：算“正在蹦”，掐断，只留头一条
def landed(browser):
    A = phone(browser)
    pa = page_of(A, "landed")
    first_time(pa)
    chat(pa, "老公在吗")
    parts = [LONG("头一条"), LONG("第二条"), LONG("第三条")]
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=2500")
    say(pa, "原样回：" + "\n[SPLIT]\n".join(parts))
    ok(wait_js(pa, TYPING, 6000), "到手的那一下按停·准备：他正在回")
    pa.evaluate(HOLD_DB, 6000)
    answered = wait_mock(lambda: len(calls()) == c0 + 1, 10)
    pa.wait_for_timeout(900)                 # 回话到了网页手上，“存”的那一下被占着
    mid = (key(pa), typing(pa), pa.evaluate(shown(parts[0])))
    click_stop(pa)
    pa.evaluate("window.__held")
    pa.wait_for_timeout(2600)                # 第二条本该在这工夫里蹦出来
    cid, msgs = chat_of(pa)
    m = msgs[-1]
    ok(answered and mid == ("停", True, False) and pa.evaluate(shown(parts[0])) and not pa.evaluate(shown(parts[1])) and m["role"] == "him" and len(m["items"]) == 1 and m.get("cut") is True and m["raw"] == parts[0] and key(pa) == "发语音" and not typing(pa) and notes(pa) == 0,
       f"回话已经到手、正往对话里放的那一下按停：照“掐断”办，只留头一条（按的时候 {mid}）")
    # 存的那一下工夫里她又发了一句：等存完，她这一句不能从画面上掉下去，也不能过后从存档里掉出去，照常得回
    mock("/__debug/claude-hold?ms=2000")
    say(pa, "再来")
    ok(wait_js(pa, TYPING, 6000), "到手的那一下她又发一句·准备：他正在回")
    c1 = len(calls())
    held = time.time()
    pa.evaluate(HOLD_DB, 6000)
    wait_mock(lambda: len(calls()) == c1 + 1, 10)
    time.sleep(max(0.9, held + 4.9 - time.time()))   # 存档还要被占一秒左右：这时候她发一句
    say(pa, "存的工夫里说的")
    pa.evaluate("window.__held")
    pa.wait_for_timeout(250)                 # 刚存完。她那句停手还不到两秒（还没轮到回它），画面这时候是什么样就是什么样
    still = pa.evaluate(shown("存的工夫里说的"))
    ok(still and wait_js(pa, shown("收到：再来"), 5000), "回话正往对话里放的那一下她又发了一句：存完以后回话摆出来，她新发的这句也还在画面上（一下都不掉）")
    answered = wait_js(pa, shown("收到：存的工夫里说的"), 15000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    chat(pa, "后来又说一句")
    cid, msgs = chat_of(pa)
    hers = [m.get("text") for m in msgs if m["role"] == "her"]
    ok(answered and hers[-3:] == ["再来", "存的工夫里说的", "后来又说一句"] and len(calls()) == c1 + 3, f"存的工夫里发的那一句：照常回了，过后再说话它也还在存档里（{hers[-3:]}）")
    A.close()


# 他的回话到手的那一眨眼，她正好点了一张表情包：那条回话不能丢（画面上、存档里都在，下一回也得告诉他自己说过）
# 做法：小后端回来的那一包刚读完（还没交给开封府）的那一下，在页面里点表情包面板里的头一张
JSON_HOOK = """() => {
  const orig = Response.prototype.json;
  window.__armed = false; window.__fired = 0;
  Response.prototype.json = async function () {
    const d = await orig.call(this);
    if (window.__armed && d && (d.type === 'reply' || (d.content && d.usage))) {
      window.__armed = false; window.__fired++;
      const b = document.querySelector('.grid.grid-cols-4 button');
      if (b) b.click(); else window.__fired = -1;
    }
    return d;
  };
}"""
def meme(browser):
    for hold in (0, 5000):                    # 存得快的、存得慢的（本地存档被占着）各来一回
        mock("/__debug/reset")
        A = phone(browser)
        pa = page_of(A, "meme")
        first_time(pa)
        chat(pa, "老公在吗")
        pa.evaluate(JSON_HOOK)
        c0 = len(calls())
        mock("/__debug/claude-hold?ms=4000")
        say(pa, "头一句")
        ok(wait_js(pa, TYPING, 6000), "回话到手的那一眨眼发表情包·准备：他正在回")
        pa.get_by_role("button", name="表情包").click(); pa.wait_for_timeout(400)
        pa.evaluate("window.__armed = true")
        if hold:
            pa.evaluate(HOLD_DB, hold)
        fired = wait_js(pa, "window.__fired !== 0", 9000) and pa.evaluate("window.__fired") == 1
        if hold:
            pa.evaluate("window.__held")
        pa.wait_for_timeout(1500)
        seen = pa.evaluate(shown("收到：头一句"))
        wait_mock(lambda: len(calls()) == c0 + 2, 15)       # 表情包那一回
        pa.wait_for_timeout(3000)
        cid, msgs = chat_of(pa)
        kept = [m for m in msgs if m["role"] == "him" and m["items"][0].get("text") == "收到：头一句"]
        told = [x["content"][0]["text"] for x in calls()[-1]["body"]["messages"] if x["role"] == "assistant"]
        ok(fired and seen and len(kept) == 1 and any("收到：头一句" in t for t in told) and len(calls()) == c0 + 2,
           f"回话到手的那一眨眼她正好发了一张表情包（存档{'被占着' if hold else '不忙'}）：那条回话在画面上、在存档里，下一回寄过去的话里也有它，没有白问一回")
        A.close()


# 回话刚摆出来、画面还没来得及重画的那一眨眼按停：只留头一条。
# 做法：等“带着他这条回话的那一次存档”存完；存完以后开封府头一回叫画面重画的那一下，抢在它前头排一个点停键的活。
# 手指落在这儿的时候，画面上还是“正在输入”、回话一条都没画出来
FRESH_HOOK = """(firstBubble) => {
  window.__fresh = false; window.__saved = false; window.__freshFired = 0;
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (rec, ...a) {
    const r = put.call(this, rec, ...a);
    try {
      if (window.__fresh && rec && typeof rec.k === 'string' && rec.k.startsWith('kfs2:chat:') && typeof rec.v === 'string' && rec.v.includes('照着说') && rec.v.includes('pig_king_awake'))
        this.transaction.addEventListener('complete', () => { window.__saved = true; });
    } catch (e) {}
    return r;
  };
  const post = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (...a) {
    if (window.__fresh && window.__saved) {
      window.__fresh = false;
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        const b = document.querySelector('.kfs-stop');
        window.__freshFired = b ? 1 : -1;
        window.__bubbleAtTap = [...document.querySelectorAll('.items-end span')].some((e) => e.children.length === 0 && e.textContent === firstBubble);
        if (b) b.click();
      };
      post.call(ch.port2, null);
    }
    return post.apply(this, a);
  };
}"""
def fresh(browser):
    A = phone(browser)
    pa = page_of(A, "fresh")
    first_time(pa)
    say(pa, "原样回：[AVATAR:fox_reading_book.jpg]\n先换一张")
    wait_js(pa, shown("先换一张"), 20000); pa.wait_for_timeout(1500)
    parts = [LONG("头一条"), LONG("第二条"), "[AVATAR:pig_king_awake.jpg]", LONG("第三条")]
    pa.evaluate(FRESH_HOOK, parts[0])
    mock("/__debug/claude-hold?ms=4000")
    say(pa, "原样回：" + "\n[SPLIT]\n".join(parts))
    ok(wait_js(pa, TYPING, 6000), "刚摆出来的那一眨眼按停·准备：他正在回")
    pa.evaluate(HOLD_DB, 3500)                # 存完的那一下，画面那头得是闲着的
    pa.evaluate("window.__fresh = true")
    fired = wait_js(pa, "window.__freshFired !== 0", 12000) and pa.evaluate("window.__freshFired") == 1
    pa.wait_for_timeout(5000)
    cid, msgs = chat_of(pa)
    m = msgs[-1]
    av = json.loads(pa.evaluate(KV, "kfs2:avatar:guangyi") or "null")
    ok(fired and pa.evaluate("window.__bubbleAtTap") is False and m["role"] == "him" and len(m["items"]) == 1 and m.get("cut") is True and m["raw"] == parts[0] and key(pa) == "发语音" and not typing(pa)
       and (av or {}).get("file") == "fox_reading_book.jpg" and pa.evaluate(shown(parts[0])) and not pa.evaluate(shown(parts[1])),
       "回话刚摆出来、画面还没重画的那一眨眼按停（按的时候一条都还没画出来）：只留头一条，他自己说过的话跟着改，没蹦到的换头像换回去；不会整条一下子全摆出来")
    A.close()


# 老路上，回话正好读完的那一下按停：作废。不换头像、不改名字、不记用量
GUARD_HOOK = """() => {
  const json = Response.prototype.json;
  window.__g = false; window.__gFired = 0;
  Response.prototype.json = async function () {
    const d = await json.call(this);
    if (window.__g && d && d.content && d.usage) { window.__g = false; const b = document.querySelector('.kfs-stop'); window.__gFired = b ? 1 : -1; if (b) b.click(); }
    return d;
  };
}"""
USAGE = "(async () => new Promise((res) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').getAll(); r.onsuccess = () => res(r.result.filter((x) => x.k.startsWith('kfs2:usage:')).map((x) => x.v)); }; }))()"
def guard(browser):
    mock("/__debug/mail-setup?table=missing")
    A = phone(browser)
    pa = page_of(A, "guard")
    first_time(pa)
    chat(pa, "老公在吗")
    pa.wait_for_timeout(500)
    usage0 = pa.evaluate(USAGE)
    pa.evaluate(GUARD_HOOK)
    c0 = len(calls())
    old = calls()[-1]["via"] == "claude"
    mock("/__debug/claude-hold?ms=2500")
    say(pa, "原样回：[AVATAR:pig_king_awake.jpg]\n换了\n[NAME:小狐狸]")
    ok(old and wait_js(pa, TYPING, 6000), "老路上回话读完的那一下按停·准备：走的是老路，他正在回")
    pa.wait_for_timeout(600)
    pa.evaluate("window.__g = true")
    fired = wait_js(pa, "window.__gFired !== 0", 8000) and pa.evaluate("window.__gFired") == 1
    pa.wait_for_timeout(3000)
    usage1 = pa.evaluate(USAGE)
    av = json.loads(pa.evaluate(KV, "kfs2:avatar:guangyi") or "null")
    cid, msgs = chat_of(pa)
    ok(fired and msgs[-1]["role"] == "her" and msgs[-1].get("stopped") is True and notes(pa) == 1 and (av or {}).get("file") != "pig_king_awake.jpg" and pa.evaluate(KV, "kfs2:name:guangyi") != "小狐狸"
       and usage0 == usage1 and len(usage0) == 1 and len(calls()) == c0 + 1 and pa.evaluate("document.querySelector('.kfs-his-name').textContent") == "光义",
       "老路上，回话正好读完的那一下按停：作废。头像没换、名字没改、用量没记，她那句底下一行小字")
    A.close()


# 老路上重新回答的时候按停：旧回答原样回来，不报错
def regen_old(browser):
    mock("/__debug/mail-setup?table=missing")
    A = phone(browser)
    pa = page_of(A, "regen_old")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    old = calls()[-1]["via"] == "claude"
    mock("/__debug/claude-hold?ms=5000")
    pa.get_by_text("重新回答").last.click()
    ok(old and wait_js(pa, TYPING, 5000), "老路上重新回答时按停·准备：走的是老路，他正在回")
    pa.wait_for_timeout(900)
    click_stop(pa)
    back = wait_js(pa, shown("收到：老公在吗"), 2000)
    pa.wait_for_timeout(7000)
    cid, msgs = chat_of(pa)
    ok(back and key(pa) == "发语音" and not typing(pa) and notes(pa) == 0 and note_count(pa) == 0 and len(msgs) == 2 and "alts" not in msgs[1],
       "老路上重新回答的时候按停：旧回答原样回来，不报“重新回答没成功”，不多出一个版本")
    A.close()


# 他正一条一条蹦着，她又发了一句：按停，蹦着的掐断，她新发的那句也不回了
def reveal_more(browser):
    A = phone(browser)
    pa = page_of(A, "reveal_more")
    first_time(pa)
    chat(pa, "老公在吗")
    # 她那句还排着队
    parts = [LONG("头一条"), LONG("第二条"), LONG("第三条"), LONG("第四条")]
    c0 = len(calls())
    say(pa, "原样回：" + "\n[SPLIT]\n".join(parts))
    ok(wait_js(pa, shown(parts[0]), 20000), "蹦着的时候她又发了一句·准备：头一条蹦出来了")
    say(pa, "插一句")
    pa.wait_for_timeout(700)
    click_stop(pa)
    pa.wait_for_timeout(8000)
    cid, msgs = chat_of(pa)
    him = [m for m in msgs if m["role"] == "him"][-1]
    ok(len(him["items"]) < 4 and him.get("cut") is True and msgs[-1]["role"] == "her" and msgs[-1].get("stopped") is True and len(calls()) == c0 + 1 and notes(pa) == 1 and key(pa) == "发语音" and not typing(pa),
       f"他蹦着、她新发的那句还排着队的时候按停：蹦着的掐断（留了 {len(him['items'])} 条），排着队的那句不发了，底下一行小字")
    # 她那句已经交出去了（上一条还没蹦完）
    pa.get_by_text(NOTE, exact=True).tap()
    wait_js(pa, shown("收到：插一句"), 20000); pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    parts = [LONG("甲一"), LONG("甲二"), LONG("甲三"), LONG("甲四"), LONG("甲五")]
    c1 = len(calls())
    mock("/__debug/claude-hold?ms=3000")
    say(pa, "原样回：" + "\n[SPLIT]\n".join(parts))
    ok(wait_js(pa, TYPING, 6000), "蹦着的时候下一回已经在等·准备：头一回交出去了")
    say(pa, "再插一句")                       # 等头一回的回话到了、再过一秒多，才交出去
    ok(wait_js(pa, shown(parts[0]), 20000), "蹦着的时候下一回已经在等·准备：头一回的回话开始蹦")
    mock("/__debug/claude-hold?ms=6000")
    ok(wait_mock(lambda: len(calls()) == c1 + 1 and working(), 8), "蹦着的时候下一回已经在等·准备：上一条还没蹦完，她后一句已经交给小后端了")
    pa.wait_for_timeout(300)
    whole = pa.evaluate(shown(parts[4]))
    click_stop(pa)
    wait_mock(lambda: len(calls()) == c1 + 2, 12)
    pa.wait_for_timeout(5000)
    cid, msgs = chat_of(pa)
    him = [m for m in msgs if m["role"] == "him"][-1]
    ok(not whole and len(him["items"]) < 5 and him.get("cut") is True and msgs[-1]["role"] == "her" and msgs[-1].get("stopped") is True and notes(pa) == 1 and key(pa) == "发语音" and box()["rows"] == [] and len(calls()) == c1 + 2 and count_text(pa, "收到：再插一句") == 0,
       f"他蹦着、她后一句已经在等回话的时候按停：蹦着的掐断（留了 {len(him['items'])} 条），等着的那一回作废")
    A.close()


# 那个键不会卡在“停”上：话排着队的时候切走（话抢着交出去了）、改以前的一句话、点重新回答，回完了都变回声波
def unstuck(browser):
    A = phone(browser, notify=True)
    pa = page_of(A, "unstuck")
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    say(pa, "我先走了")
    pa.wait_for_timeout(300)
    pa.evaluate("window.__away(true)")
    ok(wait_mock(lambda: len(calls()) == c0 + 1, 8), "那个键不卡住·准备：话排着队的时候切走，抢着交出去了")
    pa.wait_for_timeout(1500)
    pa.evaluate("window.__away(false)")
    got = wait_js(pa, shown("收到：我先走了"), 15000)
    pa.wait_for_timeout(4000)
    ok(got and key(pa) == "发语音" and not typing(pa), "话排着队的时候切走、回来：回完了那个键是声波")
    # 话排着队的时候点重新回答
    say(pa, "排着队的一句")
    pa.wait_for_timeout(300)
    pa.get_by_text("重新回答").last.click()
    wait_js(pa, TYPING, 5000)
    wait_js(pa, "!(" + TYPING + ")", 20000); pa.wait_for_timeout(2500)
    ok(key(pa) == "发语音" and pa.get_by_text("2/2").count() == 1, "话排着队的时候点了重新回答：回完了那个键是声波")
    # 话排着队的时候改以前的一句话
    say(pa, "又排着队的一句")
    bubble = pa.locator(".items-end span").filter(has_text=re.compile("^老公在吗$")).first
    bubble.click(button="right"); pa.wait_for_timeout(400)      # 右键也出菜单，比长按快：赶在那两秒多里
    pa.locator("button", has_text="编辑").first.click(); pa.wait_for_timeout(300)
    ta = pa.locator("textarea").first
    ta.fill("老公在不在"); ta.press("Enter")
    got = wait_js(pa, shown("收到：老公在不在"), 20000)
    wait_js(pa, "!(" + TYPING + ")", 20000); pa.wait_for_timeout(2500)
    ok(got and key(pa) == "发语音", "话排着队的时候改了以前的一句话：回完了那个键是声波")
    # 话排着队的时候把这段对话删了（账户面板里那个钮）：那一句不发了，新对话里那个键是声波
    open_panel(pa)
    c1 = len(calls())
    pa.evaluate("""() => { const ta = document.querySelector('.kfs-composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, '要删掉的一句'); ta.dispatchEvent(new Event('input', { bubbles: true })); }""")
    pa.wait_for_timeout(150)
    pa.evaluate("document.querySelector('.kfs-composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))")
    pa.wait_for_timeout(200)
    sent = pa.evaluate(shown("要删掉的一句"))
    pa.get_by_role("button", name="删掉当前这段对话").click()
    pa.get_by_role("button", name="再点一次，删掉这段对话").click()
    pa.wait_for_timeout(4000)
    ok(sent and key(pa) == "发语音" and len(calls()) == c1 and not typing(pa) and not pa.evaluate(shown("要删掉的一句")), "话排着队的时候把这段对话删了：那一句不发了，那个键是声波")
    A.close()


# “等这一回完了接着回”认的是哪一段对话：
# 甲段里停掉的那一句，不会因为乙段里有话等着回、她又正好翻回甲段，就自己被回上；乙段等着的那一句照样回（在后台）
def elsewhere(browser):
    A = phone(browser)
    pa = page_of(A, "elsewhere")
    first_time(pa)
    chat(pa, "老公在吗")                                       # 乙段
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    say(pa, "甲段这句不用回")                                  # 甲段
    wait_key(pa, "停", 3000); pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    ok(wait_js(pa, "document.body.innerText.includes(" + json.dumps(NOTE) + ")", 3000), "认哪一段·准备：甲段那句排着队的时候停了，小字出来了")
    pa.wait_for_timeout(3000)
    c0 = len(calls())
    open_history(pa, 1)                                        # 最近的两段：甲、乙
    ok(pa.evaluate(shown("收到：老公在吗")), "认哪一段·准备：翻回乙段")
    mock("/__debug/claude-hold?ms=9000")
    say(pa, "乙一")
    ok(wait_js(pa, TYPING, 6000), "认哪一段·准备：乙一交出去了（他要想九秒）")
    say(pa, "乙二")
    pa.wait_for_timeout(2900)                                  # 她停手两秒多：乙二记成“等这一回完了接着回”
    open_history(pa, 1)                                        # 最近的两段：乙、甲
    ok(pa.evaluate(shown("甲段这句不用回")) and not pa.evaluate(shown("乙一")), "认哪一段·准备：乙段的话还在等回话，她翻到了甲段")
    busy = (key(pa), typing(pa), notes(pa))
    ok(busy == ("停", True, 0), f"他正替乙段回着、眼前是甲段（最后是停掉的一句）：那个键是停，那行小字先不摆（这时候点它没用，等这一回完了再摆）（{busy}）")
    asked = wait_mock(lambda: len(calls()) == c0 + 2, 25)      # 乙一那一回、乙二那一回
    pa.wait_for_timeout(6000)
    cid, msgs = chat_of(pa)                                    # 眼前是甲段
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    other = [c["id"] for c in index if c["id"] != cid][0]
    yi = chat_by(pa, other)
    last_user = " / ".join(b["text"] for b in calls()[-1]["body"]["messages"][-1]["content"] if b["type"] == "text" and not b["text"].startswith("【此刻】"))
    ok([m["role"] for m in msgs] == ["her"] and msgs[0].get("stopped") is True and notes(pa) == 1 and not typing(pa), "乙段有话等着回、她翻回了甲段：甲段停掉的那一句没有自己被回上，小字还在")
    ok(asked and len(calls()) == c0 + 2 and last_user.endswith("乙二") and yi[-1]["role"] == "him" and yi[-1]["items"][0].get("text") == "收到：乙二" and [m.get("text") for m in yi if m["role"] == "her"][-2:] == ["乙一", "乙二"],
       f"乙段等着的那一句：轮到的时候在后台回上了，回的是乙段（最后寄过去的是“{last_user[-12:]}”）")
    A.close()


# 话还排着队她就翻到别的对话去了、那时候他正回着上一句：这一句不丢，等上一句回完了替它回
def flushed(browser):
    A = phone(browser)
    pa = page_of(A, "flushed")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=6000")
    say(pa, "丙一")
    ok(wait_js(pa, TYPING, 6000), "排着队就翻走·准备：丙一交出去了")
    say(pa, "丙二")
    pa.wait_for_timeout(300)
    pa.locator("button[aria-label='新对话']").tap()            # 丙二还排着队（没到两秒多）
    asked = wait_mock(lambda: len(calls()) == c0 + 2, 25)
    pa.wait_for_timeout(5000)
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    msgs = chat_by(pa, index[0]["id"])
    ok(asked and len(calls()) == c0 + 2 and msgs[-1]["role"] == "him" and msgs[-1]["items"][0].get("text") == "收到：丙二" and wait_key(pa, "发语音", 3000) and not typing(pa),
       "他正回着上一句、她新发的那句还排着队就翻到了别的对话：那一句没丢，上一句回完以后在后台回上了")
    A.close()


# 正等着的那一回是别的对话的，眼前这段对话里她的话在“等这一回完了接着回”：按停，两头都停，眼前这句底下也有小字
def both(browser):
    A = phone(browser)
    pa = page_of(A, "both")
    first_time(pa)
    chat(pa, "老公在吗")                                       # 甲段
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=9000")
    say(pa, "甲一")
    pa.wait_for_timeout(300)
    pa.locator("button[aria-label='新对话']").tap()            # 甲一马上交出去；她到了空着的乙段
    ok(wait_js(pa, TYPING, 4000), "两头都停·准备：甲段的话在等回话，她在新开的乙段")
    say(pa, "乙一")
    pa.wait_for_timeout(2900)                                  # 乙一记成“等这一回完了接着回”
    click_stop(pa)
    pa.wait_for_timeout(1200)
    here = (key(pa), typing(pa), notes(pa), note_count(pa))
    wait_mock(lambda: len(calls()) == c0 + 1, 12)
    pa.wait_for_timeout(5000)
    cid, msgs = chat_of(pa)
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    jia = chat_by(pa, [c["id"] for c in index if c["id"] != cid][0])
    ok(here == ("发语音", False, 1, 0) and len(calls()) == c0 + 1 and notes(pa) == 1 and msgs[-1].get("text") == "乙一" and msgs[-1].get("stopped") is True and jia[-1].get("text") == "甲一" and jia[-1].get("stopped") is True,
       f"等着的是别的对话的那一回、眼前这句在排后头：按停，两头都不回了，两句底下都记着“停了”（按完 {here}）")
    A.close()


# 重新回答的新回答已经到手、正存着的那一下按停，这工夫里她还新说了一句：新回答掐成一条，她新说的那句也不接着回
def regen_save(browser):
    A = phone(browser)
    pa = page_of(A, "regen_save")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=7000")
    pa.get_by_text("重新回答").last.click()
    ok(wait_js(pa, TYPING, 5000), "重新回答到手的那一下按停·准备：他正在回")
    say(pa, "新说的")
    pa.wait_for_timeout(2900)
    pa.evaluate(HOLD_DB, 7000)
    ok(wait_mock(lambda: len(calls()) == c0 + 1, 10), "重新回答到手的那一下按停·准备：那边回完了")
    pa.wait_for_timeout(1200)                                  # 新回答到了网页手上，“存”的那一下被占着
    click_stop(pa)
    pa.evaluate("window.__held")
    pa.wait_for_timeout(500)
    soon = (key(pa), notes(pa))               # 存完的那一下：那个键是声波、小字在，不会又冒出停键来
    pa.wait_for_timeout(6500)
    cid, msgs = chat_of(pa)
    ok(soon == ("发语音", 1) and len(calls()) == c0 + 1 and msgs[-1].get("text") == "新说的" and msgs[-1].get("stopped") is True and notes(pa) == 1 and key(pa) == "发语音" and not typing(pa),
       "重新回答的新回答到手、正存着的那一下按停：她这工夫里新说的那句不接着回，底下一行小字")
    A.close()


# 不按停的时候照旧：重新回答的工夫里她又说了一句，新回答到了以后接着回那一句
def regen_more(browser):
    A = phone(browser)
    pa = page_of(A, "regen_more")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=5000")
    pa.get_by_text("重新回答").last.click()
    ok(wait_js(pa, TYPING, 5000), "重新回答的工夫里又说一句（不按停）·准备：他正在重新回答")
    say(pa, "顺便再说一句")
    got = wait_js(pa, shown("收到：顺便再说一句"), 30000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    cid, msgs = chat_of(pa)
    ok(got and len(calls()) == c0 + 2 and [m["role"] for m in msgs] == ["her", "him", "her", "him"] and len(msgs[1].get("alts") or []) == 2 and notes(pa) == 0 and key(pa) == "发语音",
       "重新回答的工夫里她又说了一句、没按停：新回答开成第二个版本，接着回了她那一句")
    A.close()


# 重新回答的工夫里她又说了一句、接着翻到了别的对话，在那里按停：翻回来，旧回答在，她新说的那句底下有小字
def regen_away(browser):
    A = phone(browser)
    pa = page_of(A, "regen_away")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=9000")
    pa.get_by_text("重新回答").last.click()
    ok(wait_js(pa, TYPING, 5000), "重新回答、翻走、按停·准备：他正在重新回答")
    say(pa, "新说的")
    pa.wait_for_timeout(2900)                                  # 记成“等这一回完了接着回”
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(600)
    ok(key(pa) == "停" and typing(pa) and pa.evaluate("document.querySelectorAll('.kfs-chat-rows .whitespace-pre-wrap').length") == 0, "重新回答、翻走、按停·准备：她到了新对话，那个键是停")
    click_stop(pa)
    stopped = wait_key(pa, "发语音", 2000)
    pa.wait_for_timeout(600)
    open_history(pa, 0)
    wait_mock(lambda: len(calls()) == c0 + 1, 14)
    pa.wait_for_timeout(3000)
    cid, msgs = chat_of(pa)
    ok(stopped and pa.evaluate(shown("收到：老公在吗")) and [m["role"] for m in msgs] == ["her", "him", "her"] and msgs[2].get("text") == "新说的" and msgs[2].get("stopped") is True and "alts" not in msgs[1]
       and notes(pa) == 1 and note_count(pa) == 0 and len(calls()) == c0 + 1,
       "重新回答的工夫里她又说了一句、翻到别的对话按了停：翻回来，旧回答原样在，她新说的那句底下一行小字，没有接着回")
    A.close()


# 最后寄给那边的我的那一句（不算开封府附的那些）
def last_user(call):
    return " / ".join(b["text"] for b in call["body"]["messages"][-1]["content"] if b["type"] == "text" and not b["text"].startswith("【") and "附注" not in b["text"] and "头像" not in b["text"])
# 眼前这段对话的编号，和别的那几段的编号
def other_chats(page):
    cid = last_chat(page)
    index = json.loads(page.evaluate(KV, "kfs2:index") or "[]")
    return cid, [c["id"] for c in index if c["id"] != cid]


# ---- 她不在的时候没送成、回来补发的那几段 ----
# 这一页的网能掐：交话的那一下（op: reply）能悬在半路（到不了小后端）；断网的时候，交话的、看信箱的都不通。
# net["reach"] 为真的时候，断网时交出去的话其实送到了小后端，只是手机这头没听见回音
def lift(pa):
    net = {"hold": False, "held": [], "down": False, "reach": False, "sent": 0}
    def push_route(route):
        if route.request.method == "POST" and '"op":"reply"' in (route.request.post_data or ""):
            if net["hold"]:
                net["held"].append(route); return      # 话悬在半路：没到小后端
            if net["down"]:
                net["sent"] += 1
                if net["reach"]:
                    deliver(route.request)
                route.abort("internetdisconnected"); return
        route.continue_()
    pa.route("**/functions/v1/push", push_route)
    pa.route("**/rest/v1/mailbox*", lambda route: route.abort("internetdisconnected") if net["down"] and route.request.method == "GET" else route.continue_())
    return net
# 把页面交出去的那一包照原样递给小后端（回音不要）：话送到了，手机这头没听见
def deliver(req):
    url, data = req.url, (req.post_data or "").encode()
    head = {k: v for k, v in req.headers.items() if k.lower() not in ("content-length", "host", "accept-encoding", "connection")}
    def run():
        try:
            urllib.request.urlopen(urllib.request.Request(url, data=data, method="POST", headers=head), timeout=90).read()
        except Exception:
            pass
    threading.Thread(target=run, daemon=True).start()
# 手机进了口袋，网断了：悬着的那几下断掉（reach：其实送到了小后端），信箱也看不成
def into_pocket(pa, net, secs=9000, reach=False):
    net["down"] = True
    pa.evaluate("window.__away(true)")
    net["hold"] = False
    for r in net["held"]:
        try:
            if reach:
                deliver(r.request)
            r.abort("internetdisconnected")
        except Exception: pass
    net["held"].clear()
    pa.wait_for_timeout(secs)
def back(pa, net):
    net["down"] = False
    pa.evaluate("window.__away(false)")
# 回来，过 ms 毫秒按停（在页面里掐着表点：回来以后那七百毫秒里的事，差一百毫秒就不是一回事）。回（按的时候那个键是什么、点没点着、顶上是不是“正在输入”）
BACK_STOP = """(ms) => { window.__away(false); return new Promise((res) => setTimeout(() => {
  const last = [...document.querySelectorAll('.kfs-composer button')].pop(); const b = document.querySelector('.kfs-stop');
  const out = [last ? last.getAttribute('aria-label') : null, !!b, document.body.innerText.includes('正在输入')];
  if (b) b.click(); res(out); }, ms)); }"""
def back_then_stop(pa, net, ms=520):
    net["down"] = False
    return tuple(pa.evaluate(BACK_STOP, ms))
# 两段对话：甲段、乙段（眼前是乙段）
def two_chats(pa):
    chat(pa, "甲在吗")
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    chat(pa, "乙在吗")
# 侧栏开着的时候点历史对话里的第几段（不等、不滚：赶时间的那几段用）
ROW = "(n) => { const r = document.querySelectorAll('.kfs-history button.text-left'); if (!r[n]) return false; r[n].click(); return true; }"
# 这几回寄给那边的我的，各是哪一句（只留最后两个字）
asked_since = lambda c0: [last_user(c)[-2:] for c in calls()[c0:]]


# “她不在的时候没送成、回来补发”也认是哪一段对话：
# 乙段的话交出去以后她翻到了甲段（甲段最后是停掉的一句），手机进了口袋，那一回根本没送到小后端。
# 回来以后补发的是乙段的那一句（在后台），甲段停掉的那句不会自己被回上
def comeback(browser):
    A = phone(browser)
    pa = page_of(A, "comeback")
    net = lift(pa)
    first_time(pa)
    chat(pa, "老公在吗")                                       # 乙段
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    say(pa, "甲段这句不用回")                                  # 甲段
    wait_key(pa, "停", 3000); pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    ok(wait_js(pa, NOTE_UP, 3000), "回来补发认哪一段·准备：甲段那句停了")
    pa.wait_for_timeout(3000)
    c0 = len(calls())
    open_history(pa, 1)                                        # 乙段
    net["hold"] = True
    say(pa, "乙一")
    pa.wait_for_timeout(300)
    open_history(pa, 1)                                        # 翻到甲段：乙一马上交出去（悬在半路）
    ok(wait_turning(pa, lambda: len(net["held"]) >= 1, 8) and pa.evaluate(shown("甲段这句不用回")) and box()["rows"] == [], "回来补发认哪一段·准备：乙一交出去了、还没到小后端，她在甲段")
    into_pocket(pa, net)                                       # 手机进了口袋，网断了：这一回记成“等她回来再发”
    quiet = len(calls()) == c0 and note_count(pa) == 0
    back(pa, net)
    asked = wait_turning(pa, lambda: len(calls()) == c0 + 1, 20)
    pa.wait_for_timeout(5000)
    cid, others = other_chats(pa)
    jia = chat_by(pa, cid); yi = chat_by(pa, others[0])
    ok(quiet and not any(m["role"] == "him" for m in jia) and notes(pa) == 1 and jia[-1].get("stopped") is True, "她不在的时候乙段的话没送成、回来的时候眼前是甲段：甲段停掉的那一句没有自己被回上，小字还在；她不在的时候也没报错")
    ok(asked and len(calls()) == c0 + 1 and last_user(calls()[-1]).endswith("乙一") and yi[-1]["role"] == "him" and yi[-1]["items"][0].get("text") == "收到：乙一",
       f"回来补发的是乙段的那一句，在后台回上了（一共问了 {len(calls()) - c0} 回）")
    A.close()


# 回来补发，平常的话是这样；她先停掉、后来自己点小字要的那一回也是这样（点了小字，那一句就和平常的话一样了）
def noteback(browser):
    A = phone(browser)
    pa = page_of(A, "noteback")
    net = lift(pa)
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    net["hold"] = True
    say(pa, "平常的一句")
    ok(wait_turning(pa, lambda: len(net["held"]) >= 1, 8), "回来补发·准备：平常的一句交出去了，悬在半路")
    into_pocket(pa, net)
    quiet = len(calls()) == c0 and note_count(pa) == 0
    back(pa, net)
    resent = wait_turning(pa, lambda: len(calls()) == c0 + 1, 15) and wait_js(pa, shown("收到：平常的一句"), 10000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    ok(quiet and resent and len(calls()) == c0 + 1 and jobs(pa) == [], "平常的一句，她不在的时候没送成：回来以后自己补发、回上了（只问了一回）")
    say(pa, "先停再要的一句")
    wait_key(pa, "停", 3000); pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    ok(wait_js(pa, NOTE_UP, 3000), "回来补发·准备：又说一句、停了，小字出来了")
    pa.wait_for_timeout(2500)
    c1 = len(calls())
    net["hold"] = True
    pa.get_by_text(NOTE, exact=True).tap()                     # 她自己要回话了
    ok(wait_turning(pa, lambda: len(net["held"]) >= 1, 8) and typing(pa) and notes(pa) == 0, "回来补发·准备：她点了小字，这一回交出去了，悬在半路")
    into_pocket(pa, net)
    quiet2 = len(calls()) == c1 and note_count(pa) == 0
    back(pa, net)
    resent2 = wait_turning(pa, lambda: len(calls()) == c1 + 1, 15) and wait_js(pa, shown("收到：先停再要的一句"), 10000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    cid, msgs = chat_of(pa)
    ok(quiet2 and resent2 and len(calls()) == c1 + 1 and notes(pa) == 0 and note_count(pa) == 0 and jobs(pa) == [] and not any(m.get("stopped") for m in msgs),
       f"先停掉、后来她自己点小字要的那一回，她不在的时候没送成：回来以后一样自己补发、回上了（问了 {len(calls()) - c1} 回，小字 {notes(pa)} 行）")
    A.close()


# 两段对话各有一句等她回来补发（一段在眼前，一段不在）。她回来半秒多就按停：两段都不发了。
# 眼前那一段的补发这时候还排着队；另一段的要再过 0.2 秒才轮到，也得算在“都不回了”的里头
def resend_stop(browser):
    A = phone(browser)
    pa = page_of(A, "resend_stop")
    net = lift(pa)
    first_time(pa); two_chats(pa)
    c0 = len(calls())
    open_history(pa, 1)                                        # 甲段
    net["hold"] = True
    say(pa, "甲二")
    pa.wait_for_timeout(300)
    open_history(pa, 1)                                        # 翻到乙段：甲二马上交出去（悬在半路）
    ok(wait_turning(pa, lambda: len(net["held"]) >= 1, 8), "回来就按停·准备：甲二交出去了、悬在半路，她在乙段")
    say(pa, "乙二")
    pa.wait_for_timeout(2600)                                  # 乙二记成“等这一回完了接着回”
    into_pocket(pa, net, 14000)                                # 甲二那一回没连上；接着轮到乙二，也没连上：两段都等她回来再发
    quiet = (len(calls()) - c0, note_count(pa), len(jobs(pa)))
    k, pressed, busy = back_then_stop(pa, net)
    pa.wait_for_timeout(250)
    soon = (key(pa), notes(pa))
    pa.wait_for_timeout(7000)
    cid, others = other_chats(pa)
    yi = chat_by(pa, cid); jia = chat_by(pa, others[0])
    asked = asked_since(c0)
    ok(quiet == (0, 0, 2) and (k, pressed) == ("停", True) and soon == ("发语音", 1), f"两段都等着补发、她回来半秒多按停：那个键是停，按了马上变回声波，眼前这句底下一行小字（她不在的时候 {quiet}，按的时候 {(k, pressed, busy)}，按完 {soon}）")
    ok("甲二" not in asked and (busy or asked == []) and [m.get("text") for m in (jia[-1], yi[-1])] == ["甲二", "乙二"] and jia[-1].get("stopped") is True and yi[-1].get("stopped") is True and jobs(pa) == [] and not typing(pa) and key(pa) == "发语音",
       f"按停以后：两段都不发了（另一段的补发本该 0.2 秒以后轮到，也不发），两句上都记着“停了”，记着的那两回都不再记着（按停以后问过的：{asked}）")
    A.close()


# 不按停的时候照旧：两段对话各有一句等她回来补发，回来以后两段都补发，各回各的、各一回
def two_back(browser):
    A = phone(browser)
    pa = page_of(A, "two_back")
    net = lift(pa)
    first_time(pa); two_chats(pa)
    c0 = len(calls())
    open_history(pa, 1)                                        # 甲段
    net["hold"] = True
    say(pa, "甲二")
    pa.wait_for_timeout(300)
    open_history(pa, 1)                                        # 翻到乙段：甲二马上交出去（悬在半路）
    ok(wait_turning(pa, lambda: len(net["held"]) >= 1, 8), "两段都补发·准备：甲二交出去了、悬在半路，她在乙段")
    say(pa, "乙二")
    pa.wait_for_timeout(2600)
    into_pocket(pa, net, 14000)
    quiet = (len(calls()) - c0, note_count(pa), len(jobs(pa)))
    back(pa, net)
    both = wait_turning(pa, lambda: len(calls()) >= c0 + 2, 30)
    seen = wait_js(pa, shown("收到：乙二"), 15000)
    pa.wait_for_timeout(8000)
    cid, others = other_chats(pa)
    yi = chat_by(pa, cid); jia = chat_by(pa, others[0])
    asked = sorted(asked_since(c0))
    ok(quiet == (0, 0, 2) and both and seen and asked == ["乙二", "甲二"] and jia[-1]["role"] == "him" and jia[-1]["items"][0].get("text") == "收到：甲二" and yi[-1]["role"] == "him" and yi[-1]["items"][0].get("text") == "收到：乙二"
       and note_count(pa) == 0 and notes(pa) == 0 and jobs(pa) == [] and key(pa) == "发语音" and not typing(pa),
       f"两段对话各有一句没送成、她回来以后什么都没按：两段都补发了，各回各的、各问一回，什么都没剩下（问过的：{asked}）")
    A.close()


# 等着补发的那一句在别的对话里。她回来 0.25 秒就翻到了那段对话：照样只补发一回，回话就在眼前蹦出来
def back_open(browser):
    A = phone(browser)
    pa = page_of(A, "back_open")
    net = lift(pa)
    first_time(pa); two_chats(pa)
    open_history(pa, 1)                                        # 甲段
    c0 = len(calls())
    net["hold"] = True
    say(pa, "甲二")
    pa.wait_for_timeout(300)
    open_history(pa, 1)                                        # 翻到乙段：甲二马上交出去（悬在半路）
    ok(wait_turning(pa, lambda: len(net["held"]) >= 1, 8), "回来就翻过去·准备：甲二交出去了、悬在半路，她在乙段")
    into_pocket(pa, net)
    quiet = (len(calls()) - c0, note_count(pa))
    pa.get_by_role("button", name="打开侧栏").click(); pa.wait_for_timeout(800)   # 侧栏先开好：翻过去的那一下不费工夫
    back(pa, net)
    pa.wait_for_timeout(250)
    went = pa.evaluate(ROW, 0)                                 # 翻到甲段（最近动过的排最前）
    asked = wait_turning(pa, lambda: len(calls()) == c0 + 1, 15)
    seen = wait_js(pa, shown("收到：甲二"), 10000)
    pa.wait_for_timeout(5000)
    cid, others = other_chats(pa)
    jia = chat_by(pa, cid); yi = chat_by(pa, others[0])
    ok(quiet == (0, 0) and went and asked and seen and asked_since(c0) == ["甲二"] and jia[-1]["role"] == "him" and sum(1 for m in jia if m["role"] == "him") == 2 and sum(1 for m in yi if m["role"] == "him") == 1
       and notes(pa) == 0 and note_count(pa) == 0 and jobs(pa) == [] and key(pa) == "发语音",
       f"等着补发的那一句在别的对话里、她回来 0.25 秒就翻了过去：只补发一回，回在那段对话里、就在眼前；乙段没动（问过的：{asked_since(c0)}）")
    A.close()


# 她不在的时候没送成、还记着的那一回，回来以后补发还没轮到（这会儿没有哪一回正替它办着）的时候她按了停：那一回也得作废。
# 不然 (1) 它要是其实送到了小后端，回话过一会儿自己冒进对话；(2) 根本没送到的，下回打开会当成“上回没送到的”替她补发。
# 两段对话各有一句等着补发：回来以后甲二（不在眼前的那一段）先补发（他在想），乙二（眼前这一段）等着轮到。她不慌不忙按了停
def orphan(browser):
    for reach in (True, False):
        mock("/__debug/reset")
        tag = "其实送到了" if reach else "根本没送到"
        A = phone(browser)
        pa = page_of(A, "orphan")
        net = lift(pa)
        first_time(pa); two_chats(pa)
        c0 = len(calls())
        open_history(pa, 1)                                    # 甲段
        net["hold"] = True
        say(pa, "甲二")
        pa.wait_for_timeout(300)
        open_history(pa, 1)                                    # 翻到乙段：甲二马上交出去（悬在半路）
        ok(wait_turning(pa, lambda: len(net["held"]) >= 1, 8), f"记着的那一回一并作废（乙二{tag}）·准备：甲二交出去了、悬在半路，她在乙段")
        say(pa, "乙二")
        pa.wait_for_timeout(2600)                              # 乙二记成“等这一回完了接着回”
        if reach:
            mock("/__debug/claude-hold?ms=24000")              # 乙二那一回其实送到了小后端（他要想二十四秒），只是手机这头没听见回音
            net["reach"] = True
        into_pocket(pa, net, 14000)                            # 甲二那一回断了；接着轮到乙二，也没连上：两段都等她回来再发
        net["reach"] = False
        away = (len(jobs(pa)), [r["state"] for r in box()["rows"]])
        mock("/__debug/claude-hold?ms=9000")                   # 回来以后先补发的那一回（甲二，在后台），他要想九秒
        back(pa, net)
        started = wait_turning(pa, lambda: sum(1 for r in box()["rows"] if r["state"] == "working") == (2 if reach else 1), 10)
        pa.wait_for_timeout(3000)                              # 甲二正补发着，乙二还等着轮到
        k = key(pa)
        pressed = click_stop(pa)
        pa.wait_for_timeout(1500)
        emptied = wait_turning(pa, lambda: box()["rows"] == [], 3)
        cid, others = other_chats(pa)
        yi = chat_by(pa, cid); jia = chat_by(pa, others[0])
        state = (started, away, k, pressed, jia[-1].get("text"), jia[-1].get("stopped"), yi[-1].get("text"), yi[-1].get("stopped"), notes(pa), key(pa), typing(pa))
        ok(state == (True, (2, ["working"] if reach else []), "停", True, "甲二", True, "乙二", True, 1, "发语音", False), f"乙二{tag}、等着轮到，甲二正补发着：按停，两句上都记了“停了”（{state}）")
        ok(jobs(pa) == [] and emptied, f"乙二{tag}：按停以后，记着的那两回都不再记着（原来记着 {away[0]} 回，现在 {len(jobs(pa))} 回），信箱里的格子都收掉了")
        done = wait_turning(pa, lambda: len(calls()) == c0 + (2 if reach else 1), 40)     # 那边照旧办完
        pa.wait_for_timeout(5000)
        yi = chat_by(pa, cid); jia = chat_by(pa, others[0])
        after = (done, jia[-1]["role"], yi[-1]["role"], len(box()["rows"]), typing(pa), notes(pa), sorted(asked_since(c0)))
        ok(after == (True, "her", "her", 0, False, 1, ["乙二", "甲二"] if reach else ["甲二"]), f"乙二{tag}：那边回完了，两段对话里都没有回话冒出来（{after}）")
        c1 = len(calls())
        pa.close()                                             # 她把开封府关了（眼前是乙段，小字在乙二底下）
        pb = page_of(A, "orphan2")
        pb.goto(BASE); kite(pb)
        pb.wait_for_timeout(10000)
        cid2, msgs = chat_of(pb)
        again = (cid2 == cid, len(calls()) - c1, msgs[-1]["role"], msgs[-1].get("text"), notes(pb), typing(pb), len(jobs(pb)))
        ok(again == (True, 0, "her", "乙二", 1, False, 0), f"乙二{tag}：重开以后，停掉的那一句没有被当成“上回没送到的”替她补发；小字还在（{again}）")
        A.close()


# 一段对话：话其实送到了小后端，手机这头没听见回音。她回来半秒多（补发还排着队）就按了停：过后没有回话冒出来；重开也不自己回
def back_stop(browser):
    A = phone(browser)
    pa = page_of(A, "back_stop")
    net = lift(pa)
    first_time(pa)
    chat(pa, "第一句")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=16000")
    say(pa, "到了却没听见回音")
    pa.wait_for_timeout(300)
    net["reach"] = True; net["down"] = True
    pa.evaluate("window.__away(true)")                         # 切走的那一下话马上交出去：送到了小后端（他要想十六秒），手机这头却断了
    ok(wait_turning(pa, lambda: net["sent"] >= 1 and working(), 8), "回来就按停（一段对话）·准备：话送到了小后端，手机这头没听见回音")
    pa.wait_for_timeout(8000)
    net["reach"] = False
    away = (note_count(pa), len(jobs(pa)), [r["state"] for r in box()["rows"]])
    k, pressed, busy = back_then_stop(pa, net)
    pa.wait_for_timeout(1000)
    soon = (key(pa), notes(pa), typing(pa))
    emptied = wait_turning(pa, lambda: box()["rows"] == [], 3)
    ok(away == (0, 1, ["working"]) and (k, pressed) == ("停", True) and soon == ("发语音", 1, False) and jobs(pa) == [] and emptied,
       f"回来半秒多按停（补发{'已经发出去了' if busy else '还排着队'}）：马上停下，小字出来；记着的那一回不再记着，信箱里那一格收掉（她不在的时候 {away}，按完 {soon}）")
    done = wait_turning(pa, lambda: len(calls()) == c0 + 1, 20)                           # 那边照旧办完
    pa.wait_for_timeout(5000)
    cid, msgs = chat_of(pa)
    ok(done and msgs[-1]["role"] == "her" and msgs[-1].get("stopped") is True and count_text(pa, "收到：到了却没听见回音") == 0 and notes(pa) == 1 and not typing(pa) and box()["rows"] == [],
       "那边回完了：没有回话冒出来，小字还在")
    pa.close()
    pb = page_of(A, "back_stop2")
    pb.goto(BASE); kite(pb)
    pb.wait_for_timeout(10000)
    still = len(calls()) == c0 + 1 and notes(pb) == 1 and not typing(pb)
    pb.get_by_text(NOTE, exact=True).tap()
    got = wait_js(pb, shown("收到：到了却没听见回音"), 20000)
    pb.get_by_text("第二条").last.wait_for(timeout=10000); pb.wait_for_timeout(1500)
    ok(still and got and len(calls()) == c0 + 2 and notes(pb) == 0 and jobs(pb) == [], f"重开以后：他没有自己去回停掉的那一句；点小字，照常回（一共问了 {len(calls()) - c0} 回）")
    A.close()


# 记着的那一回接的是前面的一句：她回来以后马上又说了一句，再按停。停的是这段对话眼下所有的事：前面那一回也不要了
def lost_more(browser):
    A = phone(browser)
    pa = page_of(A, "lost_more")
    net = lift(pa)
    first_time(pa)
    chat(pa, "第一句")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=18000")
    say(pa, "头一句")
    pa.wait_for_timeout(300)
    net["reach"] = True; net["down"] = True
    pa.evaluate("window.__away(true)")                         # 头一句送到了小后端（他要想十八秒），手机这头没听见回音
    ok(wait_turning(pa, lambda: net["sent"] >= 1 and working(), 8), "前面那一回也不要了·准备：头一句送到了小后端，手机这头没听见回音")
    pa.wait_for_timeout(8000)
    net["reach"] = False
    ta = pa.get_by_placeholder("说话，我听着")
    ta.fill("又说一句")                                         # 字先打好：回来的那一下就发
    rec0 = len(jobs(pa))
    back(pa, net)
    ta.press("Enter")                                          # 头一句的补发还排着队（没轮到），她又说了一句
    pa.wait_for_timeout(int(SETTLE * 1000) + 150)
    at = (key(pa), typing(pa))
    pressed = click_stop(pa)
    pa.wait_for_timeout(1000)
    soon = (key(pa), notes(pa), typing(pa))
    emptied = wait_turning(pa, lambda: box()["rows"] == [], 3)
    ok(rec0 == 1 and at == ("停", False) and pressed and soon == ("发语音", 1, False) and jobs(pa) == [] and emptied,
       f"头一句那一回还记着、她又说了一句（还排着队）就按停：记着的那一回不再记着，信箱里那一格收掉（按的时候 {at}，按完 {soon}，还记着 {len(jobs(pa))} 回）")
    done = wait_turning(pa, lambda: len(calls()) == c0 + 1, 25)                           # 那边照旧办完头一句那一回
    pa.wait_for_timeout(5000)
    cid, msgs = chat_of(pa)
    ok(done and [m.get("text") for m in msgs[-2:]] == ["头一句", "又说一句"] and [m["role"] for m in msgs[-2:]] == ["her", "her"] and msgs[-1].get("stopped") is True and count_text(pa, "收到：头一句") == 0
       and notes(pa) == 1 and not typing(pa) and box()["rows"] == [],
       "那边回完了头一句那一回：没有回话冒出来（它接的虽然不是最后一句，也一并作废了）；小字在最后一句底下")
    pa.get_by_text(NOTE, exact=True).tap()
    got = wait_js(pa, shown("收到：头一句 / 又说一句"), 20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    ok(got and len(calls()) == c0 + 2 and notes(pa) == 0 and jobs(pa) == [], f"点小字：两句一起回了（另问了一回，一共 {len(calls()) - c0} 回）")
    A.close()


# 替别的对话在后台回的时候，不动眼前这段对话底下那句“消息没送到…点这里重发”
def keepnote(browser):
    A = phone(browser)
    pa = page_of(A, "keepnote")
    first_time(pa)
    chat(pa, "老公在吗")                                       # 乙段
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=9000")
    say(pa, "甲一")                                            # 甲段
    ok(wait_js(pa, TYPING, 6000), "后台回的时候不动眼前的报错·准备：甲一交出去了（要想九秒）")
    open_history(pa, 1)                                        # 乙段
    say(pa, "乙一")
    pa.wait_for_timeout(2900)                                  # 乙一记成“等这一回完了接着回”
    open_history(pa, 1)                                        # 回甲段
    ok(pa.evaluate(shown("甲一")), "后台回的时候不动眼前的报错·准备：回到甲段，甲一还在等；乙段有话等着轮到")
    mock("/__debug/claude-fail?kind=broken")                   # 甲一这一回会报错
    wait_mock(lambda: len(calls()) >= c0 + 1, 12)
    pa.wait_for_timeout(9000)
    kept = note_count(pa, "点这里重发")
    mock("/__debug/claude-fail?kind=")
    ok(kept == 1, "眼前这段的回话没回成、紧跟着轮到替别的对话在后台回：眼前那句“消息没送到…点这里重发”还在")
    A.close()


# 两段对话里都有话等着轮到，她在第三段：两段都回上，各回各的、各一回
def two(browser):
    A = phone(browser)
    pa = page_of(A, "two")
    first_time(pa)
    chat(pa, "甲在吗")                                         # 甲段
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    chat(pa, "乙在吗")                                         # 乙段
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=12000")
    say(pa, "乙一")
    ok(wait_js(pa, TYPING, 6000), "两段都等着·准备：乙一交出去了（要想十二秒）")
    say(pa, "乙二"); pa.wait_for_timeout(2900)                 # 乙段等着
    open_history(pa, 1)                                        # 甲段
    say(pa, "甲二"); pa.wait_for_timeout(2900)                 # 甲段也等着
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)   # 第三段（空的）
    asked = wait_mock(lambda: len(calls()) == c0 + 3, 30)
    pa.wait_for_timeout(5000)
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    chats = {c["title"]: chat_by(pa, c["id"]) for c in index}
    a = [m for t, m in chats.items() if t.startswith("甲")][0]; b = [m for t, m in chats.items() if t.startswith("乙")][0]
    ok(asked and len(calls()) == c0 + 3 and a[-1]["role"] == "him" and a[-1]["items"][0].get("text") == "收到：甲二" and b[-1]["role"] == "him" and b[-1]["items"][0].get("text") == "收到：乙二"
       and sum(1 for m in a if m["role"] == "him") == 2 and sum(1 for m in b if m["role"] == "him") == 3 and key(pa) == "发语音" and not typing(pa),
       "两段对话里都有话等着轮到、她在第三段：两段都在后台回上了，各回各的、各一回")
    A.close()


# 眼前这段的话排着队等着接着回、别的对话里也有话等着，这时候她把眼前这段删了：别的那段不能跟着干等
def dropped(browser):
    A = phone(browser)
    pa = page_of(A, "dropped")
    first_time(pa)
    chat(pa, "甲在吗")                                         # 甲段
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    chat(pa, "乙在吗")                                         # 乙段
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=13000")
    say(pa, "乙一")
    ok(wait_js(pa, TYPING, 6000), "删了眼前这段·准备：乙一交出去了")
    say(pa, "乙二"); pa.wait_for_timeout(2900)                 # 乙段等着
    open_history(pa, 1)                                        # 甲段
    say(pa, "甲二"); pa.wait_for_timeout(2900)                 # 甲段也等着
    open_history(pa, 1)                                        # 回乙段
    open_panel(pa)                                             # 面板先开好：等乙一的回话一到，马上删
    ok(wait_mock(lambda: len(calls()) == c0 + 1, 20), "删了眼前这段·准备：乙一回了（接下来一秒多以后该接着回乙二）")
    pa.wait_for_timeout(350)
    pa.evaluate("""() => { const hit = (t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === t); if (b) b.click(); return !!b; };
      hit('删掉当前这段对话'); setTimeout(() => hit('再点一次，删掉这段对话'), 60); }""")
    asked = wait_mock(lambda: len(calls()) == c0 + 2, 20)
    pa.wait_for_timeout(4000)
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    chats = {c["title"]: chat_by(pa, c["id"]) for c in index}
    a = [m for t, m in chats.items() if t.startswith("甲")]
    ok(asked and len(calls()) == c0 + 2 and len(chats) == 1 and a and a[0][-1]["role"] == "him" and a[0][-1]["items"][0].get("text") == "收到：甲二" and last_user(calls()[-1]).endswith("甲二"),
       f"眼前这段的话正排着队、她把这段删了：那一句不发了；别的对话里等着的那一句接着轮到、回上了（一共问了 {len(calls()) - c0} 回）")
    A.close()


# 历史对话那一页（侧栏没开就先开）
def history_page(page):
    if not page.evaluate(REACHABLE):
        page.get_by_role("button", name="打开侧栏").click(); page.wait_for_timeout(600)
    page.get_by_role("button", name=re.compile("历史对话")).first.click(); page.wait_for_timeout(600)
# 照名字翻到一段对话
def open_titled(page, title):
    history_page(page)
    page.locator(".kfs-page button.text-left", has_text=title).first.click(); page.wait_for_timeout(900)


# 等着轮到的那几段里，排在前头的那一段被她删了：跳过它，后头那一段照样回上
def skipped(browser):
    A = phone(browser)
    pa = page_of(A, "skipped")
    first_time(pa)
    chat(pa, "甲在吗")
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    chat(pa, "乙在吗")
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(500)
    chat(pa, "丙在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=24000")
    say(pa, "丙一")
    ok(wait_js(pa, TYPING, 6000), "排前头的那段被删了·准备：丙一交出去了（要想二十四秒）")
    open_titled(pa, "甲在吗")
    say(pa, "甲二"); pa.wait_for_timeout(2900)                 # 甲段先等着
    open_titled(pa, "乙在吗")
    say(pa, "乙二"); pa.wait_for_timeout(2900)                 # 乙段后等着
    history_page(pa)
    long_press(pa, pa.locator(".kfs-page").get_by_text("甲在吗").first)
    pa.get_by_role("menuitem", name=re.compile("删除")).click()
    pa.get_by_role("menuitem", name=re.compile("再点一次")).click(); pa.wait_for_timeout(500)
    pa.locator(".kfs-page button.text-left", has_text="丙在吗").first.click(); pa.wait_for_timeout(900)   # 她回到丙段等着
    ready = len(calls()) == c0 and pa.evaluate(shown("丙一"))
    asked = wait_mock(lambda: len(calls()) == c0 + 2, 40)      # 丙一那一回、乙二那一回
    pa.wait_for_timeout(4000)
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    chats = {c["title"]: chat_by(pa, c["id"]) for c in index}
    b = [m for t, m in chats.items() if t.startswith("乙")]
    ok(ready and asked and len(calls()) == c0 + 2 and sorted(t[0] for t in chats) == ["丙", "乙"] and b and b[0][-1]["role"] == "him" and b[0][-1]["items"][0].get("text") == "收到：乙二" and wait_key(pa, "发语音", 3000),
       f"等着轮到的两段里，排前头的那一段被她删了：跳过它，后头那一段照样在后台回上（一共问了 {len(calls()) - c0} 回，剩下的对话：{sorted(chats)}）")
    A.close()


# 替别的对话在后台回的那条回话正存着的时候，她翻到了那段对话：看到的是整条回话，不收回去重蹦一遍
def peek(browser):
    A = phone(browser)
    pa = page_of(A, "peek")
    first_time(pa)
    chat(pa, "老公在吗")
    c0 = len(calls())
    mock("/__debug/claude-hold?ms=6000")
    say(pa, "头一句")
    ok(wait_js(pa, TYPING, 6000), "后台的回话正存着她翻过来·准备：头一句交出去了")
    parts = [LONG("头一条"), LONG("第二条"), LONG("第三条")]
    mock("/__debug/claude-hold?ms=5000")                       # 留给后台那一回
    say(pa, "原样回：" + "\n[SPLIT]\n".join(parts))
    pa.wait_for_timeout(2900)
    pa.locator("button[aria-label='新对话']").tap(); pa.wait_for_timeout(400)   # 她去了一段空对话
    ok(wait_mock(lambda: len(calls()) == c0 + 1 and working(), 12), "后台的回话正存着她翻过来·准备：头一句回了；后一句正在后台回")
    pa.evaluate(HOLD_DB, 12000)
    wait_mock(lambda: len(calls()) == c0 + 2, 10); pa.wait_for_timeout(900)   # 回话到手了，存的那一下被占着
    open_history(pa, 0)                                        # 她翻回那段对话
    during = (pa.evaluate(shown(parts[0])), pa.evaluate(shown(parts[2])))
    pa.evaluate("window.__held")
    pa.wait_for_timeout(300)
    after = (pa.evaluate(shown(parts[0])), pa.evaluate(shown(parts[2])), key(pa), typing(pa))
    pa.wait_for_timeout(3000)
    cid, msgs = chat_of(pa)
    ok(during == (True, True) and after == (True, True, "发语音", False) and len(msgs[-1]["items"]) == 3 and len(calls()) == c0 + 2,
       f"后台的回话正存着的时候她翻到了那段对话：看到的是整条，存完也不收回去重蹦（存的时候 {during}，刚存完 {after}）")
    A.close()


# 那个键自己从声波变成停（重新打开的时候他还在回）：头 0.4 秒里点它不算，不会一下子把他停掉
TAP_AT_ONCE = """(() => { window.__tapped = 0; const tick = () => { const b = [...document.querySelectorAll('.kfs-composer button')].pop();
  if (b && b.getAttribute('aria-label') === '停') { window.__tapped = performance.now(); b.click(); return; } requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()"""
def selfstop(browser):
    A = phone(browser, notify=True)
    pa = page_of(A, "selfstop")
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    mock("/__debug/claude-hold?ms=14000")
    say(pa, "我先去忙了")
    ok(wait_mock(working, 8), "那个键自己变成停·准备：话交出去了（要想十四秒），开封府被收掉")
    pa.close()
    pb = page_of(A, "selfstop2")
    pb.add_init_script(TAP_AT_ONCE)                            # 那个键一变成停，头一帧就点它
    pb.goto(BASE); kite(pb)
    tapped = wait_js(pb, "window.__tapped > 0", 10000)
    pb.wait_for_timeout(1200)
    after = (key(pb), typing(pb), working(), halted(pb), notes(pb))
    ok(tapped and after == ("停", True, True, [], 0), f"那个键自己从声波变成停的头 0.4 秒里点了它：不算数，他照旧在回（{after}）")
    A.close()


# 退出登录：这台设备上记的“按了停的”也清掉
def signout(browser):
    A = phone(browser)
    pa = page_of(A, "signout")
    first_time(pa)
    chat(pa, "老公在吗")
    mock("/__debug/claude-hold?ms=4000")
    say(pa, "这句停掉")
    wait_js(pa, TYPING, 6000); wait_mock(working, 8); pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    wait_key(pa, "发语音", 2000)
    had = len(halted(pa)) == 1
    open_panel(pa)
    pa.get_by_role("button", name="退出登录", exact=True).click(); pa.wait_for_timeout(1500)
    pa.get_by_role("button", name=re.compile("再点一次.*退出")).click()
    pa.get_by_text("进门先报上名来").wait_for(timeout=15000)
    ok(had and pa.evaluate("localStorage.getItem('kfs-halted')") is None and pa.evaluate("localStorage.getItem('kfs-jobs')") is None, "退出登录：这台设备上记的“按了停的那几回”也清掉了")
    A.close()


# 守着上次打开时发出去的那一回（重新打开的时候他还在回）的时候按停：一样作废
def resume(browser):
    A = phone(browser, notify=True)
    pa = page_of(A, "resume")
    first_time(pa); enable_notifications(pa)
    chat(pa, "老公在吗")
    b0 = len(banners()); c0 = len(calls())
    mock("/__debug/claude-hold?ms=10000")
    say(pa, "我先去忙了")
    ok(wait_mock(working, 8), "守着的时候按停·准备：发一句（他要想十秒）、开封府被收掉")
    pa.close()
    pb = page_of(A, "resume2")
    pb.goto(BASE); kite(pb)
    ok(wait_js(pb, TYPING, 8000) and wait_key(pb, "停", 2000) and working(), "守着的时候按停·准备：重新打开，他还在回：守着这一回，那个键是停")
    job = box()["rows"][0]["job"]
    pb.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pb)
    stopped = wait_key(pb, "发语音", 2000)
    emptied = wait_mock(lambda: box()["rows"] == [], 3)
    wait_mock(lambda: len(calls()) == c0 + 1, 14)
    time.sleep(GRACE + 2.5)
    ok(stopped and emptied and notes(pb) == 1 and note_count(pb) == 0 and count_text(pb, "收到：我先去忙了") == 0 and len(banners()) == b0 and halted(pb) == [job] and jobs(pb) == [] and box()["rows"] == [],
       "守着上次发出去的那一回的时候按停：一样作废，那一格收掉；那边回完了也不出回话、不弹横幅")
    A.close()


# 点小字让他回：那一笔“停了”当场擦掉（画面上、存档里都擦）。这一回没回成：底下是“没送到”那一句，那行“停了”不再摆；重发成了，都收
def failed(browser):
    A = phone(browser)
    pa = page_of(A, "failed")
    first_time(pa)
    chat(pa, "老公在吗")
    say(pa, "这句先停")
    wait_key(pa, "停", 3000); pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    ok(wait_js(pa, NOTE_UP, 3000), "没回成·准备：停了，小字出来了")
    pa.wait_for_timeout(1500)
    cid, msgs = chat_of(pa)
    marked = msgs[-1].get("stopped") is True
    mock("/__debug/claude-fail?kind=broken")
    pa.get_by_text(NOTE, exact=True).tap()
    told = wait_js(pa, "document.body.innerText.includes('点这里重发')", 25000)
    pa.wait_for_timeout(500)
    cid, msgs = chat_of(pa)
    ok(marked and told and notes(pa) == 0 and note_count(pa, "点这里重发") == 1 and key(pa) == "发语音" and msgs[-1].get("text") == "这句先停" and "stopped" not in msgs[-1],
       f"点小字让他回、这一回没回成：底下是“消息没送到…点这里重发”；那行“停了”不再摆（点的那一下，那一笔就擦掉了，存档里也擦了：{'stopped' not in msgs[-1]}）")
    mock("/__debug/claude-fail?kind=")
    pa.get_by_text(re.compile("点这里重发")).first.click()
    got = wait_js(pa, shown("收到：这句先停"), 25000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    ok(got and notes(pa) == 0 and note_count(pa) == 0, "点重发回上了：两行都收了")
    A.close()


# 停掉的那一句，她改了再发：改出来的新话上没有“停了”那一笔；翻回原来那一句，小字还在
def edit(browser):
    A = phone(browser)
    pa = page_of(A, "edit")
    first_time(pa)
    chat(pa, "老公在吗")
    say(pa, "写错了的一句")
    wait_key(pa, "停", 3000); pa.wait_for_timeout(int(SETTLE * 1000))
    click_stop(pa)
    ok(wait_js(pa, "document.body.innerText.includes(" + json.dumps(NOTE) + ")", 3000), "改停掉的那一句·准备：停了，小字出来了")
    bubble = pa.locator(".items-end span").filter(has_text=re.compile("^写错了的一句$")).first
    long_press(pa, bubble)
    if not pa.locator("button", has_text="编辑").count():      # 长按没弹出来（电脑上的浏览器有时不认这一下）：用右键再叫一次菜单
        bubble.click(button="right"); time.sleep(0.5)
    pa.locator("button", has_text="编辑").first.click(); time.sleep(0.5)
    ta = pa.locator("textarea").first
    ta.fill("改对了的一句"); ta.press("Enter")
    got = wait_js(pa, shown("收到：改对了的一句"), 20000)
    pa.get_by_text("第二条").last.wait_for(timeout=10000); pa.wait_for_timeout(1500)
    cid, msgs = chat_of(pa)
    her = [m for m in msgs if m["role"] == "her"][-1]
    ok(got and her["text"] == "改对了的一句" and "stopped" not in her and her["alts"][0]["node"].get("stopped") is True and notes(pa) == 0,
       "停掉的那一句改了再发：照常回；改出来的新话上没有“停了”那一笔（原来那一句上的还留着）")
    pa.get_by_role("button", name="上一个版本").last.click(); pa.wait_for_timeout(700)
    ok(notes(pa) == 1 and pa.evaluate(shown("写错了的一句")) and count_text(pa, "收到：改对了的一句") == 0, "翻回原来那一句：底下那行小字还在")
    A.close()


SCENES = [("keys", keys), ("queued", queued), ("double", double), ("waiting", waiting), ("oldpath", oldpath), ("reveal", reveal), ("avatar", avatar), ("regen", regen), ("reopen", reopen), ("pending", pending), ("other", other),
          ("hung", hung), ("landed", landed), ("resume", resume), ("failed", failed), ("edit", edit),
          ("meme", meme), ("fresh", fresh), ("guard", guard), ("regen_old", regen_old), ("reveal_more", reveal_more), ("unstuck", unstuck),
          ("elsewhere", elsewhere), ("flushed", flushed), ("both", both), ("regen_save", regen_save), ("regen_more", regen_more), ("regen_away", regen_away),
          ("comeback", comeback), ("noteback", noteback), ("resend_stop", resend_stop), ("two_back", two_back), ("back_open", back_open), ("orphan", orphan), ("back_stop", back_stop), ("lost_more", lost_more),
          ("keepnote", keepnote), ("two", two), ("dropped", dropped), ("skipped", skipped), ("peek", peek), ("selfstop", selfstop), ("signout", signout)]
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
