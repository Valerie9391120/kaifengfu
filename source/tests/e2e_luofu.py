# 罗浮梦（卿卿 2026 年 11 月 1 日定的，见开发说明“罗浮梦”那一节；零件在 src/luofu/，单测在 tests/luofu.test.mjs）：手机这头走一遍，家里的闹钟用真的那一份（测试包）。
#   南衙里狐宇宙下面一行“罗浮梦”（一枝梅花，手绘那一套），梦库空着写“梦库还空着”；点了菜单换成罗浮梦那一张：两颗按钮，梦库、梦廊；
#   梦库空着：一句话、一颗“导入梦库文件”；导一份不对的文件说一句（不是梦库的文档、签库文件）；导入编的那一份（tests/fixtures/梦库-测试.json）；
#   梦库那一页：一种一行（几条、占几成、哪几种进梦廊）、做梦的机会；翻全部（醒来就散的写那一段，记得完整的写标题和来源，点开看正文）；
#   找梦（几个词都得有）；点叉删、撤销（放回原处）；加一条（两类）；换一份先问一声；梦廊空着；南衙的小字跟着梦库；
#   名帖：“他自己醒”关着没有【罗浮梦】，开着有（紧跟在【你的屋子】后面）；平常聊天的工具里没有 luofu_nap（他只在屋里睡）；
#   闹钟叫醒他：她在狐宇宙的便签纸上留“睡两觉”（梦库换成只有记得完整的那一种）——他睡了两觉，狐宇宙里两行小字“睡了一觉 · 梦廊里多了一场：〈…〉”，
#     进度和梦廊同步到手机上；梦廊里两场（最新的在最上面，标题、来源、哪天；不写一共多少），点开看全文；
#   换成只有醒来就散的那一类：他睡一觉，小字“睡了一觉 · 做了个梦”，梦里的字她的页面上一个都没有；
#   读一场：一行“翻出梦廊里的一场：〈…〉”；梦库里删了那一场，梦廊里照旧；写到一半截断的：一行“想睡一会儿，没睡成”。
# 真的浏览器、假 Supabase、假的 Anthropic。账号、梦都是编的（天气、点心、去处）。
# 先在 source/ 里 npm run build:test、KFS_TEST_URL=http://127.0.0.1:8787 node alarm/build.mjs，起好两个服务（见开发说明），再：python3 tests/e2e_luofu.py
# 要截图给人看：KFS_SHOTS=某个文件夹 python3 tests/e2e_luofu.py
import json, os, subprocess, tempfile, time
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
HERE_DIR = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE_DIR, "..", "alarm", "dist", "kfs-alarm-test.mjs")
POOL = os.path.join(HERE_DIR, "fixtures", "梦库-测试.json")
SHOTS = os.environ.get("KFS_SHOTS", "")
NOTES = "() => [...document.querySelectorAll('.kfs-chat-rows .kfs-diary-note')].map((d) => d.innerText.trim())"
PAGE = "() => document.querySelector('.kfs-chat-rows').innerText"
NANYA = """() => [...document.querySelectorAll('.kfs-nanya .kfs-nanya-row')].map((b) => { const t = b.children[1].children, svg = b.children[0].querySelector('svg');
  return { name: t[0].textContent, sub: t[1].textContent, shapes: [...svg.querySelectorAll(':scope > *')].map((e) => e.tagName), size: [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height],
    fill: getComputedStyle(svg.firstElementChild).fill, stroke: getComputedStyle(svg.firstElementChild).stroke, color: getComputedStyle(b.children[0]).color }; })"""
SHEET = "() => { const b = document.querySelector('.kfs-sheet-box'); return b ? b.children[1].firstElementChild.textContent : null; }"
FIX = json.load(open(POOL, encoding="utf-8"))
EVENT_TEXTS = [d["text"] for k in FIX["kinds"] if k["type"] == "event" for d in k["dreams"]]
CARDS = [d for k in FIX["kinds"] if k["type"] == "card" for d in k["dreams"]]


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


def open_luofu(pg):
    open_nanya(pg)
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="罗浮梦").click()
    pg.locator(".kfs-luofu").wait_for(timeout=5000); pg.wait_for_timeout(400)


def open_pool(pg):
    open_luofu(pg)
    pg.locator(".kfs-luofu-pool").click(); pg.wait_for_timeout(500)


def open_gallery(pg):
    open_luofu(pg)
    pg.locator(".kfs-luofu-gallery").click(); pg.wait_for_timeout(500)


def close_sheet(pg):
    pg.locator(".kfs-sheet-box button[aria-label='关闭']").click(); pg.wait_for_timeout(450)


def close_all(pg):
    for _ in range(3):
        if pg.locator(".kfs-sheet-box").count():
            close_sheet(pg)
    hide_side(pg)


def msg(pg):
    return pg.evaluate("(document.querySelector('.kfs-lf-msg') || {}).textContent || ''")


def stored(pg):
    v = pg.evaluate(KV, "kfs2:luofu:pool")
    return json.loads(v) if v else None


def kind_of(pool, name):
    return next((k for k in (pool or {}).get("kinds", []) if k["name"] == name), {"dreams": []})


def lf_state(pg):
    v = pg.evaluate(KV, "kfs2:luofu:state")
    return json.loads(v) if v else None


def toggle_wake(pg):
    side(pg)
    pg.get_by_role("button", name="头像与设置").click(); time.sleep(0.6)
    sw = pg.get_by_role("switch", name="他自己醒")
    (sw if sw.count() else pg.get_by_role("button", name="他自己醒")).click()
    time.sleep(0.5)
    pg.get_by_role("button", name="关闭").click(); time.sleep(0.4)
    hide_side(pg)


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


def system_of(body):
    s = body.get("system", "")
    return "".join(x.get("text", "") for x in s) if isinstance(s, list) else s


def results_of(body):
    rs = [b for m in body.get("messages", []) if isinstance(m.get("content"), list) for b in m["content"] if b.get("type") == "tool_result"]
    return [r.get("content", "") if isinstance(r.get("content", ""), str) else json.dumps(r.get("content"), ensure_ascii=False) for r in rs]


def variant(tmp, name, **kw):
    # 照编的那一份另写一份（只留哪几种、做梦的机会写几），存在临时文件夹里
    o = dict(FIX)
    o.update(kw)
    p = os.path.join(tmp, name + ".json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(o, f, ensure_ascii=False)
    return p


def replace_pool(pg, path):
    open_pool(pg)
    pg.locator(".kfs-lf-replace").click(); pg.wait_for_timeout(200)
    pg.locator(".kfs-sheet-box input[type=file]").set_input_files(path); pg.wait_for_timeout(600)
    said = msg(pg)
    close_all(pg)
    return said


def leave_note(pg, text):
    open_nanya(pg)
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="狐宇宙").click(); pg.wait_for_timeout(1000)
    pg.locator(".kfs-fox-pad-input").fill(text)
    pg.locator(".kfs-fox-pad-save").click(); time.sleep(1.0)
    pg.evaluate("window.__away(true)"); time.sleep(1.5); pg.evaluate("window.__away(false)")  # 切走那一下推上云端（闹钟拉得到）
    time.sleep(0.5)


def wake(pg, home, want_notes):
    c = len(calls())
    code, out = alarm(["wake"], home)
    asked = [x["body"] for x in calls()[c:]]
    open_nanya(pg)
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="狐宇宙").click(); pg.wait_for_timeout(800)
    got = until(pg, lambda: len(pg.evaluate(NOTES)) >= want_notes, 20)
    return code, out, asked, got


def run(browser):
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 59, "bottom": 34, "left": 0, "right": 0}})
    first_time(pg)
    chat(pg, "今晚早点睡")
    body0 = calls()[-1]["body"]
    ok("luofu_nap" not in names_of(body0) and "【罗浮梦】" not in system_of(body0), "平常聊天：工具里没有 luofu_nap（他只在屋里睡），名帖里没有【罗浮梦】")

    # ---- 南衙 ----
    open_nanya(pg)
    rows = pg.evaluate(NANYA)
    names = [r["name"] for r in rows]
    lf = next((r for r in rows if r["name"] == "罗浮梦"), None)
    ok(lf and names[:2] == ["狐宇宙", "罗浮梦"] and len(names) == 10, f"南衙里狐宇宙下面多一行“罗浮梦”（{names}）")
    ok(lf and lf["sub"] == "梦库还空着", f"梦库空着：小字“梦库还空着”（{lf and lf['sub']}）")
    ok(lf and lf["shapes"] == ["path"] * 4 and lf["size"] == [20, 20] and lf["fill"] == "none" and lf["stroke"] == lf["color"], f"图标是一枝梅花：手绘那一套，20 个点、描线不填色、跟着主题色（{lf}）")
    shot(pg, "lf_1_nanya")
    pg.locator(".kfs-nanya .kfs-nanya-row", has_text="罗浮梦").click(); pg.wait_for_timeout(500)
    ok(pg.evaluate(SHEET) == "罗浮梦" and pg.locator(".kfs-nanya").count() == 0 and pg.locator(".kfs-luofu button").all_inner_texts() == ["梦库", "梦廊"], "点了：南衙的菜单换成罗浮梦那一张，两颗按钮：梦库、梦廊")
    shot(pg, "lf_2_page")

    # ---- 梦廊空着 ----
    pg.locator(".kfs-luofu-gallery").click(); pg.wait_for_timeout(500)
    ok(pg.evaluate(SHEET) == "梦廊" and pg.locator(".kfs-lf-gempty").inner_text() == "梦廊里还没有留下梦。", "梦廊空着：“梦廊里还没有留下梦。”")
    close_sheet(pg)
    ok(pg.evaluate(SHEET) == "罗浮梦", "梦廊右上角的叉：回到罗浮梦那一张")

    # ---- 梦库空着、导入 ----
    pg.locator(".kfs-luofu-pool").click(); pg.wait_for_timeout(500)
    ok(pg.evaluate(SHEET) == "梦库" and pg.get_by_role("button", name="导入梦库文件").count() == 1 and "梦库还空着" in pg.locator(".kfs-lf-empty").inner_text(), "梦库空着：一句话、一颗“导入梦库文件”")
    shot(pg, "lf_3_empty")
    fin = pg.locator(".kfs-sheet-box input[type=file]")
    fin.set_input_files(os.path.join(HERE_DIR, "fixtures", "文档-测试.md")); pg.wait_for_timeout(500)
    ok(msg(pg) == "这份文件读不出来：不是梦库文件" and pg.get_by_role("button", name="导入梦库文件").count() == 1, "导一份不是梦库的文件（一篇文档）：说一句，梦库还空着")
    fin.set_input_files(os.path.join(HERE_DIR, "fixtures", "签库-测试.json")); pg.wait_for_timeout(500)
    ok(msg(pg) == "这不是梦库文件" and pg.evaluate(KV, "kfs2:luofu:pool") is None, "导一份签库文件：“这不是梦库文件”，存档里没写")
    fin.set_input_files(POOL); pg.wait_for_timeout(700)
    pool = stored(pg)
    ok(msg(pg) == "导进来了：3 种，11 个梦。" and pool and [k["name"] for k in pool["kinds"]] == ["天气梦", "点心梦", "去处梦"] and pool["dreamChance"] == 0.75 and "kind" not in pool,
       f"导进来了：三种十一个梦，存在 kfs2:luofu:pool（{msg(pg)}）")
    kinds = [" ".join(t.split()) for t in pg.locator(".kfs-lf-kind").all_inner_texts()]
    ok(kinds == ["天气梦 5 条 · 占 50%", "点心梦 3 条 · 占 35%", "去处梦 3 条 · 占 15% · 进梦廊"], f"一种一行：名字、几条、有梦的时候占几成；记得完整的那一种写着进梦廊（{kinds}）")
    ok(pg.locator(".kfs-lf-chance").inner_text() == "睡一觉，做梦的机会是 75%", "底下一行做梦的机会")
    ok(pg.locator(".kfs-lf-kind input, .kfs-lf-chance input").count() == 0, "比例、做梦的机会只显示不改")
    shot(pg, "lf_4_pool")

    # ---- 翻全部 ----
    pg.locator(".kfs-lf-open", has_text="天气梦").click(); pg.wait_for_timeout(300)
    items = pg.locator(".kfs-lf-all .kfs-lf-dream")
    ok(items.count() == 5 and items.nth(0).locator(".kfs-lf-text").inner_text() == EVENT_TEXTS[0], "翻全部：点开天气梦，五个梦，写着那一段")
    pg.locator(".kfs-lf-open", has_text="去处梦").click(); pg.wait_for_timeout(300)
    items = pg.locator(".kfs-lf-all .kfs-lf-dream")
    ok(items.count() == 3 and items.nth(0).locator(".kfs-lf-title").inner_text() == CARDS[0]["title"] and items.nth(0).locator(".kfs-lf-source").inner_text() == CARDS[0]["source"] and pg.locator(".kfs-lf-all .kfs-lf-text").count() == 0,
       "点开去处梦（记得完整的那一种）：三场，写标题和来源，正文先不摆")
    items.nth(0).locator("button").first.click(); pg.wait_for_timeout(300)
    ok(items.nth(0).locator(".kfs-lf-text").inner_text() == CARDS[0]["text"], "点开一场：看正文")
    shot(pg, "lf_5_all")

    # ---- 找梦、删、撤销 ----
    pg.locator(".kfs-lf-search").fill("糕"); pg.wait_for_timeout(300)
    hits = [t for t in pg.locator(".kfs-lf-hits .kfs-lf-text").all_inner_texts()]
    ok(hits == [t for t in EVENT_TEXTS if "糕" in t], f"找梦：搜“糕”列出两个（{hits}）")
    pg.locator(".kfs-lf-search").fill("云 车站"); pg.wait_for_timeout(300)
    ok(pg.locator(".kfs-lf-hits .kfs-lf-title").all_inner_texts() == ["云上的车站"], "空格隔开的几个词都得有：搜“云 车站”只剩那一场")
    pg.locator(".kfs-lf-search").fill("糕"); pg.wait_for_timeout(300)
    second = EVENT_TEXTS[[i for i, t in enumerate(EVENT_TEXTS) if "糕" in t][1]]
    pg.locator(".kfs-lf-hits .kfs-lf-drop").nth(1).click(); pg.wait_for_timeout(400)
    gone = kind_of(stored(pg), "点心梦")["dreams"]
    ok(second not in [d["text"] for d in gone] and len(gone) == 2 and pg.locator(".kfs-lf-undo").inner_text().startswith("删了「"), "点叉：删了，存档里也没了，顶上一条“删了「…」”")
    pg.locator(".kfs-lf-undo button").click(); pg.wait_for_timeout(400)
    back = kind_of(stored(pg), "点心梦")["dreams"]
    ok([d["text"] for d in back] == [d["text"] for d in kind_of(FIX, "点心梦")["dreams"]] and pg.locator(".kfs-lf-undo").count() == 0, "撤销：放回原处")
    pg.locator(".kfs-lf-search").fill("")

    # ---- 加一条（两类） ----
    pg.locator(".kfs-lf-addkinds button", has_text="点心梦").click(); pg.wait_for_timeout(200)
    ok(pg.locator(".kfs-lf-new-title").count() == 0 and pg.locator(".kfs-lf-new-text").count() == 1, "挑了醒来就散的那一种：只写一段字")
    pg.locator(".kfs-lf-new-text").fill("一碗汤圆浮上来，每一颗都在打哈欠。")
    pg.locator(".kfs-lf-add").click(); pg.wait_for_timeout(400)
    ok(msg(pg) == "加上了：点心梦 · 一碗汤圆浮上来" and kind_of(stored(pg), "点心梦")["dreams"][-1]["text"] == "一碗汤圆浮上来，每一颗都在打哈欠。", "加一条：点心梦里加了一段")
    pg.locator(".kfs-lf-new-text").fill("一碗汤圆浮上来，每一颗都在打哈欠。")
    pg.locator(".kfs-lf-add").click(); pg.wait_for_timeout(300)
    ok(msg(pg) == "这一条已经有了", "重了的不加")
    pg.locator(".kfs-lf-addkinds button", has_text="去处梦").click(); pg.wait_for_timeout(200)
    ok(pg.locator(".kfs-lf-new-title").count() == 1 and pg.locator(".kfs-lf-new-source").count() == 1, "挑了记得完整的那一种：标题、来源（可以空）、正文")
    pg.locator(".kfs-lf-new-title").fill("湖心的灯塔")
    pg.locator(".kfs-lf-new-text").fill("你梦见湖心立着一座灯塔，灯一亮，湖面就结了一层薄冰。")
    shot(pg, "lf_6_add")
    pg.locator(".kfs-lf-add").click(); pg.wait_for_timeout(400)
    added = kind_of(stored(pg), "去处梦")["dreams"][-1]
    all_ids = [d["id"] for k in stored(pg)["kinds"] for d in k["dreams"]]
    ok(msg(pg) == "加上了：去处梦 · 湖心的灯塔" and added["title"] == "湖心的灯塔" and "source" not in added and len(set(all_ids)) == len(all_ids) == 13, f"加一条：去处梦里加了一场（来源空着不写），编号跟已有的不重（{added.get('id')}）")
    ok(pg.locator(".kfs-lf-new-title").input_value() == "" and pg.locator(".kfs-lf-new-text").input_value() == "", "加上以后框清空")

    # ---- 换一份先问 ----
    pg.locator(".kfs-lf-replace").click(); pg.wait_for_timeout(200)
    ok(pg.get_by_text("换一份梦库？眼下这 13 个梦（连你加的、删的）都换掉。").count() == 1, "换一份梦库：先问一声（写着眼下有几个梦）")
    pg.get_by_role("button", name="算了").click(); pg.wait_for_timeout(200)
    ok(pg.locator(".kfs-lf-replace").count() == 1 and len(all_ids) == 13, "算了：照旧")
    close_sheet(pg)
    ok(pg.evaluate(SHEET) == "罗浮梦", "梦库右上角的叉：回到罗浮梦那一张")
    close_all(pg)
    open_nanya(pg)
    lf = next((r for r in pg.evaluate(NANYA) if r["name"] == "罗浮梦"), {})
    ok(lf.get("sub") == "梦库里 13 个梦", f"南衙那一行的小字跟着梦库：梦库里 13 个梦（{lf.get('sub')}）")
    close_all(pg)

    # ---- 名帖 ----
    chat(pg, "睡前说一句")
    body1 = calls()[-1]["body"]
    ok("【罗浮梦】" not in system_of(body1) and "luofu_nap" not in names_of(body1), "“他自己醒”关着：名帖里没有【罗浮梦】（他不会在屋里醒）")
    toggle_wake(pg)
    chat(pg, "再说一句")
    body2 = calls()[-1]["body"]
    sy = system_of(body2)
    ok("【罗浮梦】" in sy and sy.index("【你的屋子】") < sy.index("【罗浮梦】") < sy.index("【回复格式】") and "luofu_nap" not in names_of(body2), "“他自己醒”开着、梦库里有梦：名帖里【你的屋子】后面多【罗浮梦】那一段；工具照旧没有 luofu_nap")
    ok(not any(n in sy for n in ["天气梦", "点心梦", "去处梦"]) and not any(t[:6] in sy for t in EVENT_TEXTS), "那一段不写有几种梦、各叫什么，一个梦都不写")

    # ---- 闹钟叫醒他：睡两觉 ----
    home = tempfile.mkdtemp(prefix="kfs-lf-")
    code, out = alarm(["setup"], home)
    ok(code == 0 and "暗号对上了" in out, "家里的闹钟：拿她设的暗号装上了")
    tmp = tempfile.mkdtemp(prefix="kfs-lf-pool-")
    card_only = variant(tmp, "card", dreamChance=1, kinds=[k for k in FIX["kinds"] if k["type"] == "card"])
    ok(replace_pool(pg, card_only) == "导进来了：1 种，3 个梦。", "换一份梦库（只有记得完整的那一种、睡一觉一定做梦）：挑文件，换上了")
    leave_note(pg, "睡两觉")
    code, out, asked, got = wake(pg, home, 2)
    notes = pg.evaluate(NOTES)
    ok(code == 0 and "醒过了" in out and asked and "luofu_nap" in names_of(asked[0]) and "【罗浮梦】" in system_of(asked[0]), f"叫醒他一回：醒在屋里，工具里带着 luofu_nap，名帖里有【罗浮梦】（{out.strip().splitlines()[-1] if out.strip() else ''}）")
    ok(got and len(notes) == 2 and all(n.startswith("睡了一觉 · 梦廊里多了一场：〈") for n in notes) and notes[0] != notes[1], f"他睡了两觉：狐宇宙里两行小字“睡了一觉 · 梦廊里多了一场：〈标题〉”（{notes}）")
    res = results_of(asked[-1]) if asked else []
    ok(len(res) >= 2 and res[-2].startswith(FIX["intro"]) and not res[-1].startswith(FIX["intro"]), "头一回睡：先给了梦库里写的那段说明，第二觉不再给")
    ok(until(pg, lambda: (lf_state(pg) or {}).get("totalNaps") == 2), "进度、梦廊同步到手机上了（kfs2:luofu:state，闹钟写的）")
    st = lf_state(pg) or {}
    titles = [e["title"] for e in st.get("gallery", [])]
    ok([f"睡了一觉 · 梦廊里多了一场：〈{t}〉" for t in titles] == notes, "小字里的标题就是梦廊里那两场")
    shot(pg, "lf_7_room")

    # ---- 梦廊 ----
    open_gallery(pg)
    items = pg.locator(".kfs-lf-gitem")
    today = datetime.now(ZoneInfo("Europe/Dublin"))
    day = f"{today.month}月{today.day}日"
    newest = next((c for c in CARDS if titles and c["title"] == titles[-1]), {"title": "（没有）", "text": "", "source": ""})
    metas = pg.locator(".kfs-lf-gmeta").all_inner_texts()
    ok(items.count() == 2 and pg.locator(".kfs-lf-gtitle").all_inner_texts() == list(reversed(titles)), f"梦廊里两场，最新的在最上面（{pg.locator('.kfs-lf-gtitle').all_inner_texts()}）")
    ok(metas and metas[0] == " · ".join(x for x in [newest.get("source", ""), day] if x) and all(day in m for m in metas), f"每一场写来源（有的话）、哪天梦的（{metas}）")
    whole = pg.locator(".kfs-sheet-box").inner_text()
    ok("一共" not in whole and "还剩" not in whole and "/" not in whole and pg.locator(".kfs-lf-gallery > *").count() == 2, "不写一共多少张、还剩多少张，不留空位")
    shot(pg, "lf_8_gallery")
    if items.count():
        items.nth(0).click(); pg.wait_for_timeout(400)
        ok(pg.locator(".kfs-lf-rtitle").inner_text() == newest["title"] and pg.locator(".kfs-lf-rtext").inner_text() == newest["text"] and day in pg.locator(".kfs-lf-rmeta").inner_text(), "点开一场：标题、来源、哪天，全文")
        shot(pg, "lf_9_read")
        pg.locator(".kfs-lf-back").click(); pg.wait_for_timeout(300)
        ok(pg.locator(".kfs-lf-gitem").count() == 2, "返回：回到梦廊那一列")
    else:
        ok(False, "点开一场（梦廊里一场都没有，没点成）")
    close_all(pg)

    # ---- 醒来就散的那一类：小字不露梦里的事 ----
    event_only = variant(tmp, "event", dreamChance=1, kinds=[k for k in FIX["kinds"] if k["type"] == "event"])
    ok(replace_pool(pg, event_only) == "导进来了：2 种，8 个梦。", "换成只有醒来就散的那两种（一定做梦）")
    leave_note(pg, "睡一觉")
    code, out, asked, got = wake(pg, home, 3)
    notes = pg.evaluate(NOTES)
    res = results_of(asked[-1]) if asked else []
    told = [t for t in EVENT_TEXTS if res and t[:5] in res[-1]]
    ok(got and notes[-1] == "睡了一觉 · 做了个梦" and told, f"他睡了一觉、做了个醒来就散的梦：小字“睡了一觉 · 做了个梦”，梦里的事只在递给他的结果里（{notes[-1:]}）")
    page = pg.evaluate(PAGE)
    ok(not any(t[:5] in page for t in EVENT_TEXTS), "她的页面上一个梦里的字都没有")
    ok(until(pg, lambda: (lf_state(pg) or {}).get("totalNaps") == 3) and len((lf_state(pg) or {}).get("gallery", [])) == 2, "梦廊不添（醒来就散的不进梦廊）")

    # ---- 读一场；梦库里删了，梦廊照旧 ----
    older = titles[0] if titles else CARDS[0]["title"]
    leave_note(pg, "读一场 " + older)
    code, out, asked, got = wake(pg, home, 4)
    notes = pg.evaluate(NOTES)
    res = results_of(asked[-1]) if asked else []
    ok(got and notes[-1] == f"翻出梦廊里的一场：〈{older}〉" and res and next(c for c in CARDS if c["title"] == older)["text"] in res[-1], f"读一场：小字“翻出梦廊里的一场：〈标题〉”，全文递给他（{notes[-1:]}）")
    ok(replace_pool(pg, POOL) == "导进来了：3 种，11 个梦。", "换回编的那一份")
    open_pool(pg)
    pg.locator(".kfs-lf-open", has_text="去处梦").click(); pg.wait_for_timeout(300)
    target = pg.locator(".kfs-lf-all .kfs-lf-dream", has_text=older)
    target.locator(".kfs-lf-drop").click(); pg.wait_for_timeout(400)
    ok(older not in [d.get("title") for d in kind_of(stored(pg), "去处梦")["dreams"]], f"梦库里删了《{older}》")
    close_all(pg)
    open_gallery(pg)
    ok(older in pg.locator(".kfs-lf-gtitle").all_inner_texts() and pg.locator(".kfs-lf-gitem").count() == 2, "梦廊里照旧（存的是做梦那一刻的那一份）")
    close_all(pg)

    # ---- 写到一半截断的 ----
    leave_note(pg, "睡到一半")
    code, out, asked, got = wake(pg, home, 5)
    notes = pg.evaluate(NOTES)
    ok(got and notes[-1] == "想睡一会儿，没睡成" and (lf_state(pg) or {}).get("totalNaps") == 3, f"写到长度上限截断的：不替他睡，一行“想睡一会儿，没睡成”（{notes[-1:]}）")
    shot(pg, "lf_10_room_all")
    ctx.close()


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
