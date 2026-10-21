# 狐宇宙（他自己醒，卿卿 2026 年 10 月 20 日要的，见 src/fox.js、alarm/）：手机这头走一遍，家里的闹钟用真的那一份（测试包）。
#   南衙最顶上一行“狐宇宙”，小字照眼下的样子写；点了进他的屋子（还空着：中间写“狐宇宙”和一句话；没有平常那个输入框，底下是一张便签纸）；
#   账户面板里“他自己醒”：开了才有两道闸（存进设置）；这台手机没开通知照实说敲不到；开了通知，门牌号报进存档（加密的）；
#   闹钟装上、叫醒他一回（他在屋里写了几句）：不敲横幅、不亮小点（她 22:04 定的）；狐宇宙不进历史对话的列表；
#     醒了那一行是一行小字（前面是他的头像），他写的是气泡；
#   她在便签纸上留一句（22:11 定的）：放进狐宇宙，不叫他、不等回话；他下回醒来看得见（一句开封府提示）；
#   他想找她：开一段新对话（名字他起的）：横幅敲到这台手机，那段对话进历史对话，最前头那一行她看不见；点横幅进那段对话；
#   任务标记：她在那段对话里说“九点回”，他回话最后写 [WAKE:+1m 去找卿卿]：气泡里看不见，记一个任务；寄过去的带着【自己醒】；
#     到点她还没回：闹钟在那段对话里叫醒他，敲她；狐宇宙里留一行“去《布丁》找你了”；她回了话，这个任务就收了。
# 真的浏览器、假 Supabase、假的 Anthropic。账号和话都是编的。
# 先在 source/ 里 npm run build:test、KFS_TEST_URL=http://127.0.0.1:8787 node alarm/build.mjs，起好两个服务（见开发说明），再：python3 tests/e2e_fox.py
# （任务那一段要等闹钟到点，整份跑两分钟上下）
import json, os, re, shutil, subprocess, tempfile, time
from urllib.parse import quote
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
HERE_DIR = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE_DIR, "..", "alarm", "dist", "kfs-alarm-test.mjs")
SHOTS = os.path.join(HERE_DIR, "shots")
os.makedirs(SHOTS, exist_ok=True)
ROWS = """() => [...document.querySelectorAll('.kfs-nanya .kfs-nanya-row')].map((b) => { const t = b.children[1].children;
  return { name: t[0].textContent, sub: t[1].textContent, dot: !!b.querySelector('.kfs-row-dot') }; })"""
NOTICES = "() => [...document.querySelectorAll('.kfs-chat-rows > div')].filter((d) => d.querySelector('img, span') && d.innerText.trim() && !d.querySelector('[data-kfs-bubble]')).map((d) => d.innerText.trim())"
BUBBLES = "() => [...document.querySelectorAll('.kfs-chat-rows [data-kfs-bubble=\"him\"]')].map((b) => b.innerText.trim())"
HERS = "() => [...document.querySelectorAll('.kfs-chat-rows [data-kfs-bubble=\"her\"]')].map((b) => b.innerText.trim())"
HISTORY = "() => [...document.querySelectorAll('.kfs-history button')].slice(1).map((b) => b.innerText.split('\\n')[0])"

def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, f"fox_{name}.png"))

def side(page):
    if not page.evaluate(REACHABLE):
        page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)

def hide_side(page):
    # 侧栏开着：点一下对话那边那层收起来
    if page.locator("div.absolute.inset-0.z-30").count():
        page.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)

def nanya(page):
    side(page)
    page.get_by_role("button", name=re.compile("^南衙")).click()
    page.locator(".kfs-nanya").wait_for(timeout=5000); time.sleep(0.4)
    return page.evaluate(ROWS)

def open_fox(page):
    nanya(page)
    page.locator(".kfs-nanya-row", has_text="狐宇宙").click(); time.sleep(1.0)

def close_sheet(page):
    page.get_by_role("button", name="关闭").click(); time.sleep(0.4)

def settings_of(page):
    return json.loads(page.evaluate(KV, "kfs2:settings") or "{}")

def alarm_env(home, extra=None):
    env = dict(os.environ, KFS_ALARM_HOME=home, KFS_ALARM_PLAIN="1", KFS_ALARM_NOSTART="1", KFS_ALARM_EMAIL="qing@example.com", KFS_ALARM_PASSWORD="correct-horse", KFS_ALARM_PASS=PASS, KFS_ALARM_MANUAL_GAP="0")
    env.update(extra or {})
    return env

def alarm(args, home, extra=None):
    r = subprocess.run(["node", BUNDLE] + args, env=alarm_env(home, extra), capture_output=True, text=True, timeout=180)
    return r.returncode, r.stdout + r.stderr

def new_chat(page):
    side(page)
    page.locator(".kfs-dock-fade button", has_text="新对话").click(); time.sleep(0.6)

def resync(page):
    # 装成切走又回来：开封府回到眼前的时候同步一遍（见 Gate.jsx）
    page.evaluate("window.__away(true)"); time.sleep(0.3)
    page.evaluate("window.__away(false)"); time.sleep(0.3)

def until(page, fn, timeout=12):
    # 一边同步一边等手机上看得见（闹钟写进云端的，手机回到眼前的时候才拉）
    end = time.time() + timeout
    while time.time() < end:
        if fn():
            return True
        resync(page)
        time.sleep(0.6)
    return fn()

def tag_of(url):
    # 横幅点了去哪段对话：#n=r.<那段对话的记号>.<哪一条>
    m = re.search(r"#n=r\.([^.]+)\.", url or "")
    return m.group(1) if m else None

def task_of(page, hid):
    return json.loads(page.evaluate(KV, "kfs2:fox:task:" + hid) or "{}") if hid else {}


def run(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    first_time(pg)

    # ---- 南衙最顶上那一行 ----
    rs = nanya(pg)
    ok(rs and rs[0]["name"] == "狐宇宙" and rs[0]["sub"] == "还没让他自己醒" and not rs[0]["dot"], f"南衙最顶上一行“狐宇宙”，还没让他自己醒（{rs[:1]}）")
    shot(pg, "1_nanya")
    pg.locator(".kfs-nanya-row", has_text="狐宇宙").click(); time.sleep(0.8)
    empty = pg.locator(".kfs-fox-empty")
    ok(pg.locator(".kfs-nanya").count() == 0 and empty.count() == 1 and "狐宇宙" in empty.inner_text() and "这是他的屋子" in empty.inner_text() and pg.locator(".kfs-motto").count() == 0,
       "点狐宇宙：菜单收起，进他的屋子；还空着：中间写“狐宇宙”和一句话（不是平常新的一页那行字）")
    ok(pg.locator(".kfs-composer").count() == 0 and pg.locator(".kfs-fox-pad").count() == 1 and pg.get_by_placeholder("说话，我听着").count() == 0,
       "他的屋子里没有平常那个输入框（她 22:04 定的：只能看），底下是一张便签纸（22:11 定的）")
    shot(pg, "2_empty")

    # ---- 账户面板：他自己醒 ----
    side(pg)
    pg.get_by_role("button", name="头像与设置").click(); time.sleep(0.6)
    sec = pg.locator(".kfs-fox-set")
    sec.scroll_into_view_if_needed()
    ok(sec.get_attribute("data-on") == "no" and "关着：只有你来找他，他才醒" in sec.inner_text() and pg.locator(".kfs-fox-gap").count() == 0, "账户面板：“他自己醒”默认关着，关着的时候没有两道闸")
    pg.get_by_role("switch", name="他自己醒").click() if pg.get_by_role("switch", name="他自己醒").count() else pg.get_by_role("button", name="他自己醒").click()
    time.sleep(0.5)
    st = settings_of(pg)
    ok(st.get("wake") is True and sec.get_attribute("data-on") == "yes" and "家里的闹钟还没装" in sec.inner_text() and pg.locator(".kfs-fox-noknock").count() == 1 and "他找你的时候，敲不到你" in sec.inner_text() and "不弹横幅" in sec.inner_text(),
       "打开：存进设置；底下一句“家里的闹钟还没装”；说明里写着屋里的动静不弹横幅；这台手机还没开通知，照实说他找你的时候敲不到")
    gap_on = pg.locator(".kfs-fox-gap button[aria-pressed=true]").inner_text()
    max_on = pg.locator(".kfs-fox-max button[aria-pressed=true]").inner_text()
    pg.locator(".kfs-fox-gap button", has_text="1 小时").click(); time.sleep(0.4)
    ok(gap_on == "30 分钟" and max_on == "12 回" and settings_of(pg).get("wakeGap") == 60, f"两道闸：没挑过是 30 分钟、12 回；挑了一个钟头存进设置（{gap_on}、{max_on}）")
    shot(pg, "3_account")
    close_sheet(pg)
    enable_notifications(pg)
    time.sleep(1.0)
    doors = json.loads(pg.evaluate(KV, "kfs2:fox:doors") or "{}")
    dev = json.loads(pg.evaluate("localStorage.getItem('__fake_push__')") or "{}").get("device", {})
    ok(dev and [v.get("e") for v in doors.values() if isinstance(v, dict)] == [dev.get("endpoint")] and all(isinstance(v, dict) and v.get("at", 0) > 0 for v in doors.values()),
       "开了通知：这台手机的门牌号报进存档，记着几点报的（他找你的时候敲这一台）")
    rs = nanya(pg)
    ok(rs[0]["sub"] == "等家里的闹钟装好", f"南衙那一行：开了，等家里的闹钟装好（{rs[0]['sub']}）")
    close_sheet(pg)
    new_chat(pg)

    home = tempfile.mkdtemp(prefix="kfs-fox-")
    proc = None
    try:
        # ---- 闹钟装上，叫醒他一回：他在屋里写了几句 ----
        code, out = alarm(["setup"], home)
        ok(code == 0 and "暗号对上了" in out, "家里的闹钟：拿她设的暗号装上了")
        # 他先去院子里浇了水（恩师写的园子，见 alarm/garden.js），又去妆台前换了一身、完成了今天的搭配（alarm/dressing.js），再写了几句
        mock("/__debug/tool-queue?name=play_garden&input=" + quote(json.dumps({"action": "water"})))
        mock("/__debug/tool-queue?name=play_dressing_room&input=" + quote(json.dumps({"action": "select", "category": "outfit", "itemId": "outfit_black_turtleneck"})))
        mock("/__debug/tool-queue?name=play_dressing_room&input=" + quote(json.dumps({"action": "complete"})))
        mock("/__debug/reply-queue?text=" + quote("<thinking>她还在上班吧</thinking>\n醒了，翻了会儿书\n[SPLIT]\n[MEME:fox_reading_book.jpg]\n[SPLIT]\n今天风好大\n[WAKE:+2h]"))
        n0 = len(banners())
        code, out = alarm(["wake"], home)
        ok(code == 0 and "醒过了" in out and "不敲你" in out, f"叫醒他一回（{out.strip().splitlines()[-1] if out.strip() else ''}）")
        time.sleep(3)
        ok(len(banners()) == n0, f"他醒在自己屋里写的字：不敲横幅（{len(banners()) - n0} 条）")
        got = until(pg, lambda: (json.loads(pg.evaluate(KV, "kfs2:fox:state") or "{}").get("last") or 0) > 0 and len(chat_by(pg, "hyz")) > 0)
        side(pg)
        time.sleep(1.0)
        ok(got and pg.locator(".kfs-tile-dot").count() == 0, "手机上：南衙那一格不亮小点")
        hist = pg.evaluate(HISTORY)
        ok("狐宇宙" not in hist, f"狐宇宙不进历史对话的列表（{hist}）")
        rs = nanya(pg)
        ok(rs[0]["sub"].startswith("睡着，约 ") and not rs[0]["dot"], f"南衙那一行：睡着，约几点醒（照他定的 +2h），不写“留了话”、不亮小点（{rs[0]}）")
        shot(pg, "4_nanya")
        pg.locator(".kfs-nanya-row", has_text="狐宇宙").click(); time.sleep(1.2)
        notes = pg.evaluate(NOTICES)
        said = pg.evaluate(BUBBLES)
        ok(any("光义醒了" in n for n in notes) and "醒了，翻了会儿书" in said and "今天风好大" in said and not any("WAKE" in x for x in said), f"翻开狐宇宙：醒了那一行是一行小字，他写的是气泡（{notes}，{said}）")
        garden_lines = pg.evaluate("() => [...document.querySelectorAll('.kfs-chat-rows .kfs-diary-note')].map((d) => d.innerText.trim())")
        room_text = pg.evaluate("document.querySelector('.kfs-chat-rows').innerText")
        ok(garden_lines[:1] == ["去园子里浇了水"] and "魏紫" not in room_text, f"他去院子里浇了水：屋里只有一行小字，园子里的字她看不见（她 02:28 定的）（{garden_lines}）")
        ok(garden_lines[1:] == ["在妆台前换了换行头", "完成了今天的搭配：披发、素面、不熏香；衣柜：高领黑毛衣"] and "初整衣冠" not in room_text and "已加入当前衣柜" not in room_text,
           f"他去妆台前换了一身、完成了今天的搭配：屋里两行小字，完成的那一行写那一身；妆台上的字（成就、引擎回的话）她看不见（{garden_lines[1:]}）")
        shot(pg, "4b_room_notes")

        # ---- 她在便签纸上留一句 ----
        c0 = len(calls())
        pg.locator(".kfs-fox-pad-input").fill("我来过啦，冰箱里有布丁")
        shot(pg, "5_pad")
        pg.locator(".kfs-fox-pad-save").click(); time.sleep(1.0)
        fox = chat_by(pg, "hyz")
        last = fox[-1] if fox else {}
        ok(last.get("role") == "her" and last.get("note") is True and last.get("text") == "我来过啦，冰箱里有布丁" and "我来过啦，冰箱里有布丁" in pg.evaluate(HERS) and pg.locator(".kfs-fox-pad-input").input_value() == "",
           "便签纸：留下的一句放进狐宇宙（记着是便签），纸上清空")
        time.sleep(2.5)
        ok(len(calls()) == c0 and not pg.evaluate(TYPING) and not [j for j in jobs(pg) if j.get("chat") == "hyz"], "便签纸：不叫他、不等回话（没往那边寄，没有“正在输入”）")
        shot(pg, "6_note")

        # ---- 再叫醒一回：他看见便签，开一段新对话找她 ----
        mock("/__debug/reply-queue?text=" + quote("<thinking>她留了布丁</thinking>\n布丁吃了，甜\n[新对话:布丁]\n布丁我吃了\n[SPLIT]\n你几点回来"))
        n1 = len(banners())
        c1 = len(calls())
        code, out = alarm(["wake"], home)
        ok(code == 0 and "开了一段新对话" in out, f"再叫醒一回（{out.strip().splitlines()[-1] if out.strip() else ''}）")
        asked = calls()[c1]["body"] if len(calls()) > c1 else {}
        flat = json.dumps(asked, ensure_ascii=False)
        ok("她来你屋里转了一圈，在便签纸上留了一句：我来过啦，冰箱里有布丁" in flat, "他醒来看得见她留的便签（一句开封府提示）")
        got = wait_mock(lambda: len(banners()) >= n1 + 2, 15)
        bs = banners()[n1:]
        ok(got and [b["json"]["notification"]["body"] for b in bs] == ["布丁我吃了", "你几点回来"] and all(b["endpoint"] == dev.get("endpoint") for b in bs) and all(b["json"]["notification"]["title"] == "光义" for b in bs),
           f"他开了新对话找她：横幅敲到这台手机，一个气泡一条（屋里写的那句不上横幅）（{[b['json']['notification']['body'] for b in bs]}）")
        got = until(pg, lambda: any("开了一段新对话《布丁》找你" in n for n in pg.evaluate(NOTICES)))
        said = pg.evaluate(BUBBLES)
        ok(got and "布丁吃了，甜" in said and "布丁我吃了" not in said, f"狐宇宙里：一行“开了一段新对话《布丁》找你”，[新对话] 前面写的留在屋里（{pg.evaluate(NOTICES)}）")
        hide_side(pg)
        shot(pg, "7_room")
        side(pg)
        time.sleep(0.6)
        hist = pg.evaluate(HISTORY)
        ok(hist and hist[0] == "布丁" and "狐宇宙" not in hist, f"那段新对话进她的历史对话（名字他起的），排最前头（{hist}）")
        shot(pg, "8_history")

        # ---- 点横幅进那段新对话 ----
        target = bs[-1]["json"]["notification"]["navigate"]
        pg.evaluate("(u) => { location.hash = new URL(u).hash; }", target)
        wait_js(pg, "(() => [...document.querySelectorAll('.kfs-chat-rows [data-kfs-bubble=\"him\"]')].some((b) => b.innerText.includes('你几点回来')))()", 8000)
        said = pg.evaluate(BUBBLES)
        notes = pg.evaluate(NOTICES)
        ok("布丁我吃了" in said and "你几点回来" in said and not any("醒" in n for n in notes) and pg.locator(".kfs-composer").count() == 1 and pg.locator(".kfs-fox-pad").count() == 0,
           f"点横幅：进那段新对话，最前头那一行她看不见；底下是平常的输入框（{notes}）")
        hide_side(pg)
        shot(pg, "9_newchat")
        fox = chat_by(pg, "hyz")
        go = [m for m in fox if isinstance(m.get("go"), dict) and m["go"].get("how") == "new"]
        cid = go[-1]["go"]["chat"] if go else None

        # ---- 任务标记：她说九点回，他记一个到点去找她 ----
        mock("/__debug/reply-queue?text=" + quote("<thinking>九点，记着</thinking>\n好，我等你\n[WAKE:+1m 去找卿卿]"))
        c2 = len(calls())
        say(pg, "我九点回")
        pg.get_by_text("好，我等你").last.wait_for(timeout=20000)
        time.sleep(1.5)
        asked = calls()[c2]["body"] if len(calls()) > c2 else {}
        flat = json.dumps(asked, ensure_ascii=False)
        said = pg.evaluate(BUBBLES)
        ok("【自己醒】" in flat and "[WAKE:+1h 去找卿卿]" in flat and "这一行她看不见" in flat, "“他自己醒”开着：平常对话里寄过去的【此刻】后面附着【自己醒】（怎么定一个到点去找她）")
        msgs = chat_by(pg, cid) if cid else []
        hims = [m for m in msgs if m.get("role") == "him"]
        him = hims[-1] if hims else {}
        hid = him.get("id")
        task = task_of(pg, hid)
        ok("好，我等你" in said and not any("WAKE" in x for x in said) and him.get("wake") == "+1m 去找卿卿" and task.get("chat") == cid and task.get("from") == hid and task.get("raw") == "+1m 去找卿卿" and not task.get("state"),
           f"他回话最后那一行 [WAKE:+1m 去找卿卿]：气泡里看不见，记了一个任务给家里的闹钟（{task}）")

        # ---- 到点她还没回：闹钟在那段对话里叫醒他 ----
        mock("/__debug/reply-queue?text=" + quote("<thinking>说好九点的</thinking>\n人呢\n[WAKE:+5m 再找]"))
        n2 = len(banners())
        proc = subprocess.Popen(["node", BUNDLE, "run"], env=alarm_env(home, {"KFS_ALARM_TICK": "500", "KFS_ALARM_PULL": "500"}), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        fired = wait_mock(lambda: len(banners()) >= n2 + 1, 120, 0.5)
        bs2 = banners()[n2:]
        ok(fired and [b["json"]["notification"]["body"] for b in bs2] == ["人呢"] and tag_of(bs2[0]["json"]["notification"]["navigate"]) == tag_of(target),
           f"到点她还没回：闹钟在那段对话里叫醒他，敲她，点了进那段对话（{[b['json']['notification']['body'] for b in bs2]}）")
        got = until(pg, lambda: "人呢" in pg.evaluate(BUBBLES))
        notes = pg.evaluate(NOTICES)
        ok(got and not any("醒" in n for n in notes), f"那段对话里多了他找她的那句，醒过来那一行她看不见（{notes}）")
        hide_side(pg)
        shot(pg, "10_task")
        got = until(pg, lambda: task_of(pg, hid).get("state") == "chase")
        task = task_of(pg, hid)
        ok(got and task.get("rounds") == 1, f"任务：办了一回，他说五分钟以后再找，接着追（{task.get('state')}、{task.get('rounds')}）")
        # 她回来了：这个任务收了
        mock("/__debug/reply-queue?text=" + quote("可算回来了"))
        say(pg, "来了来了")
        pg.get_by_text("可算回来了").last.wait_for(timeout=20000)
        got = until(pg, lambda: task_of(pg, hid).get("state") == "done", 15)
        ok(got, f"她在那段对话里回了话：这个任务收了，不再追（{task_of(pg, hid).get('state')}）")

        # ---- 狐宇宙里留着他这几回干了什么 ----
        open_fox(pg)
        notes = pg.evaluate(NOTICES)
        ok(any("去《布丁》找你了" in n for n in notes) and any("开了一段新对话《布丁》找你" in n for n in notes) and "我来过啦，冰箱里有布丁" in pg.evaluate(HERS),
           f"狐宇宙里一行“去《布丁》找你了”；前几回醒了的那几行、她留的便签都在（{notes}）")
        hide_side(pg)
        shot(pg, "11_room")
        code, out = alarm(["uninstall"], home)
        ok(code == 0, "卸了家里的闹钟（后台那一个也停了）")
    finally:
        if proc and proc.poll() is None:
            proc.kill()
        shutil.rmtree(home, ignore_errors=True)
    ctx.close()


if __name__ == "__main__":
    with sync_playwright() as p:
        mock("/__debug/reset")
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
        try:
            run(browser)
        finally:
            browser.close()
    print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
    print(f"\n通过 {count['passed']}  失败 {count['failed']}")
    raise SystemExit(1 if count["failed"] or errors else 0)
