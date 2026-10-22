# 回屋看一眼、换装便签（卿卿 2026 年 10 月 22 日凌晨要的，见 src/room.js、开发说明“回屋看一眼”那一节）：手机这头走一遍，家里的闹钟用真的那一份（测试包）。
#   “他自己醒”开着：平常说话寄过去的名帖里多【你的屋子】那一段（一个字不提便签），工具里一直带着 room_look、room_memo（排在抽签后面）；
#   闹钟叫醒他一回：他去院子里浇了水、去妆台前换了一身（没完成搭配）；
#   她问花：他回屋看了看园子——她那边一行小字，看到的字（第几天、《群芳谱》）只在寄给他的结果里，她的页面上没有；妆台、衣柜同上；
#   她说“记得下次穿……”：他在屋里的妆台上留了一张便签——她那边一行“记录了下次换装偏好”，便签记在存档里（写的什么、哪段对话），她的页面上看不到便签上写的；
#   写到一半被截断：不替他办，一行“想回屋看一眼，没看成”；
#   再叫醒他一回：【醒来】里摆着那张便签，工具里没有回屋那两样（他就在屋里）；他完成了今天的搭配，便签收起来（手机上同步下来也没了）；
#   回到聊天再看妆台：写着今天完成的那一身；
#   “他自己醒”关了：名帖里没有那一段，工具照带。
# 真的浏览器、假 Supabase、假的 Anthropic。账号和话都是编的。
# 先在 source/ 里 npm run build:test、KFS_TEST_URL=http://127.0.0.1:8787 node alarm/build.mjs，起好两个服务（见开发说明），再：python3 tests/e2e_room.py
import json, os, re, shutil, subprocess, tempfile, time
from urllib.parse import quote
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
HERE_DIR = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE_DIR, "..", "alarm", "dist", "kfs-alarm-test.mjs")
SHOTS = os.path.join(HERE_DIR, "shots")
os.makedirs(SHOTS, exist_ok=True)
NOTES = "() => [...document.querySelectorAll('.kfs-chat-rows .kfs-diary-note')].map((d) => d.innerText.trim())"
PAGE = "() => document.querySelector('.kfs-chat-rows').innerText"
TOOLS = ["diary_list", "diary_read", "diary_search", "diary_note", "qx_draw", "room_look", "room_memo"]

def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, f"room_{name}.png"))

def side(page):
    if not page.evaluate(REACHABLE):
        page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)

def hide_side(page):
    if page.locator("div.absolute.inset-0.z-30").count():
        page.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)

def new_chat(page):
    side(page)
    page.locator(".kfs-dock-fade button", has_text="新对话").click(); time.sleep(0.6)

def toggle_wake(page):
    side(page)
    page.get_by_role("button", name="头像与设置").click(); time.sleep(0.6)
    sw = page.get_by_role("switch", name="他自己醒")
    (sw if sw.count() else page.get_by_role("button", name="他自己醒")).click()
    time.sleep(0.5)
    page.get_by_role("button", name="关闭").click(); time.sleep(0.4)
    hide_side(page)

def settings_of(page):
    return json.loads(page.evaluate(KV, "kfs2:settings") or "{}")

def alarm_env(home, extra=None):
    env = dict(os.environ, KFS_ALARM_HOME=home, KFS_ALARM_PLAIN="1", KFS_ALARM_NOSTART="1", KFS_ALARM_EMAIL="qing@example.com", KFS_ALARM_PASSWORD="correct-horse", KFS_ALARM_PASS=PASS, KFS_ALARM_MANUAL_GAP="0")
    env.update(extra or {})
    return env

def alarm(args, home):
    r = subprocess.run(["node", BUNDLE] + args, env=alarm_env(home), capture_output=True, text=True, timeout=180)
    return r.returncode, r.stdout + r.stderr

def resync(page):
    # 装成切走又回来：开封府回到眼前的时候同步一遍（见 Gate.jsx）
    page.evaluate("window.__away(true)"); time.sleep(0.3)
    page.evaluate("window.__away(false)"); time.sleep(0.3)

def until(page, fn, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        if fn():
            return True
        resync(page)
        time.sleep(0.6)
    return fn()

def system_of(body):
    s = body.get("system", "")
    return "".join(x.get("text", "") for x in s) if isinstance(s, list) else s

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

def replies(page):
    return page.get_by_text(re.compile("（测试回屋）")).count()

def ask(page, text):
    # 说一句，等他回屋看完回话（假的那边的我先调工具，结果递回去再说“（测试回屋）……”）
    n = replies(page)
    c = len(calls())
    say(page, text)
    wait_js(page, f"(() => [...document.querySelectorAll('.kfs-chat-rows *')].filter((e) => e.children.length === 0 && e.textContent.includes('（测试回屋）')).length > {n})()", 20000)
    time.sleep(1.2)
    return calls()[c:]


def run(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    first_time(pg)
    toggle_wake(pg)
    ok(settings_of(pg).get("wake") is True, "账户面板里打开“他自己醒”")
    new_chat(pg)

    home = tempfile.mkdtemp(prefix="kfs-room-")
    try:
        code, out = alarm(["setup"], home)
        ok(code == 0 and "暗号对上了" in out, "家里的闹钟：拿她设的暗号装上了")
        # 他在屋里醒了一回：去院子里浇了水，去妆台前换上高领黑毛衣（没完成搭配）
        mock("/__debug/tool-queue?name=play_garden&input=" + quote(json.dumps({"action": "water"})))
        mock("/__debug/tool-queue?name=play_dressing_room&input=" + quote(json.dumps({"action": "select", "category": "outfit", "itemId": "outfit_black_turtleneck"})))
        mock("/__debug/reply-queue?text=" + quote("醒了，去院子里转了转\n[WAKE:+2h]"))
        code, out = alarm(["wake"], home)
        ok(code == 0 and "醒过了" in out, f"叫醒他一回（{out.strip().splitlines()[-1] if out.strip() else ''}）")
        got = until(pg, lambda: bool(pg.evaluate(KV, "kfs2:garden")) and bool(pg.evaluate(KV, "kfs2:dressing")))
        ok(got, "闹钟写的园子、妆台同步到手机上了（加密了跟着云端走）")
        hide_side(pg)

        # ---- 她问花：他回屋看了看园子 ----
        got = ask(pg, "你的花怎么样了？回屋看看园子")
        b0, b1 = (got + [{}, {}])[0].get("body", {}), (got + [{}, {}])[1].get("body", {})
        sys0 = system_of(b0)
        sec = sys0[sys0.find("【你的屋子】"):sys0.find("【回复格式】")] if "【你的屋子】" in sys0 else ""
        ok(sec and "room_look" in sec and "便签" not in sec and "room_memo" not in sec and sys0.find("【日记本】") < sys0.find("【你的屋子】"),
           "“他自己醒”开着：名帖里多【你的屋子】（排在【日记本】后面），一个字不提便签")
        ok(names_of(b0) == TOOLS and "tool_choice" not in b0, f"工具：翻日记四样、抽签、回屋看一眼、留便签，一直带着（{names_of(b0)}）")
        res = last_result(b1)
        ok("【你屋里·园子】" in res and "已完成 1 个有效照料日 / 30" in res and "今日已浇水" in res and "群芳谱" in res and "怎么玩：" in res,
           "他回屋看了看园子：递给他的是引擎里的字（魏紫、第几天、今天浇过了、《群芳谱》、怎么玩）")
        notes = pg.evaluate(NOTES)
        text = pg.evaluate(PAGE)
        ok(notes[-1:] == ["回屋看了看园子"] and "有效照料日" not in text and "群芳谱" not in text, f"她那边：一行小字“回屋看了看园子”，园子里的字她看不见（{notes}）")
        shot(pg, "1_garden")

        # ---- 妆台、衣柜 ----
        got = ask(pg, "回屋看看妆台")
        res = last_result(got[-1]["body"]) if got else ""
        ok("【你屋里·妆台】" in res and "今天还没完成搭配。" in res and "不是你这会儿真穿着的" in res and "高领黑毛衣" not in res,
           "回屋看了看妆台：今天还没完成搭配（换上了没完成的那一身不算，同镜子）；写明是游戏里的")
        got = ask(pg, "回屋翻翻衣柜")
        res = last_result(got[-1]["body"]) if got else ""
        notes = pg.evaluate(NOTES)
        text = pg.evaluate(PAGE)
        ok("【你屋里·衣柜】" in res and "高领黑毛衣" in res and "跣足" in res and notes[-2:] == ["回屋看了看妆台", "回屋翻了翻衣柜"] and "跣足" not in text,
           f"回屋翻了翻衣柜：有哪些都递给他；她那边两行小字，衣柜里有什么她看不见（{notes[-2:]}）")

        # ---- 她说下次穿什么：他在屋里的妆台上留一张便签 ----
        got = ask(pg, "记得下次穿 高领黑毛衣")
        cid, msgs = chat_of(pg)
        him = [m for m in msgs if m.get("role") == "him" and any(c.get("name") == "room_memo" for c in (m.get("calls") or []))]
        call = next((c for c in (him[-1].get("calls") if him else []) if c.get("name") == "room_memo"), {})
        memo = json.loads(pg.evaluate(KV, "kfs2:fox:memo:" + call.get("id", "")) or "null") if call else None
        index = json.loads(pg.evaluate(KV, "kfs2:index") or "[]")
        title = next((c.get("title") for c in index if c.get("id") == cid), None)
        notes = pg.evaluate(NOTES)
        text = pg.evaluate(PAGE)
        ok(memo and memo.get("text") == "答应了卿卿下次穿高领黑毛衣" and memo.get("chat") == cid and memo.get("title") == title and memo.get("at") == him[-1].get("ts"),
           f"留便签：记在存档里（写的什么、哪段对话、他那一条的时间）（{memo}）")
        ok(notes[-1:] == ["记录了下次换装偏好"] and "答应了卿卿下次穿高领黑毛衣" not in text, f"她那边：一行“记录了下次换装偏好”（她的原话），便签上写的她看不见（{notes[-1:]}）")
        shot(pg, "2_memo")

        # ---- 写到一半被截断：不替他办 ----
        c0 = len(calls())
        say(pg, "看到一半")
        pg.get_by_text("看着看着").last.wait_for(timeout=20000)
        time.sleep(2.0)
        notes = pg.evaluate(NOTES)
        ok(notes[-1:] == ["想回屋看一眼，没看成"] and len(calls()) == c0 + 1, f"写到长度上限被截断：不替他办（只问了一回），一行“没看成”（{notes[-1:]}）")

        # ---- 再叫醒他一回：【醒来】里摆着那张便签；他完成了今天的搭配，便签收起来 ----
        mock("/__debug/tool-queue?name=play_dressing_room&input=" + quote(json.dumps({"action": "complete"})))
        mock("/__debug/reply-queue?text=" + quote("穿上了\n[WAKE:+2h]"))
        c1 = len(calls())
        code, out = alarm(["wake"], home)
        asked = calls()[c1]["body"] if len(calls()) > c1 else {}
        woke = last_her(asked)
        ok(code == 0 and "妆台上压着你自己留的一张便签" in woke and "“答应了卿卿下次穿高领黑毛衣”" in woke and (f"在《{title}》里" in woke if title else True),
           "再叫醒他一回：【醒来】里摆着那张便签（写的什么、在哪段对话里留的）")
        ok(not any(n in names_of(asked) for n in ("room_look", "room_memo")) and "play_dressing_room" in names_of(asked) and system_of(asked) == sys0,
           "醒在屋里：不带回屋那两样（他就在屋里），妆台照带；名帖跟手机上聊天时的一个字不差（连【你的屋子】）")
        got = until(pg, lambda: not pg.evaluate(KV, "kfs2:fox:memo:" + call.get("id", "")))
        ok(got, "他完成了今天的搭配：便签收起来（手机上同步下来也没了）")

        got = ask(pg, "回屋看看妆台")
        res = last_result(got[-1]["body"]) if got else ""
        ok("今天完成的那一身" in res and "衣柜：高领黑毛衣" in res, "回到聊天再看妆台：写着今天完成的那一身")
        shot(pg, "3_dressed")

        # ---- “他自己醒”关了：名帖里没有那一段，工具照带 ----
        toggle_wake(pg)
        ok(settings_of(pg).get("wake") is False, "关了“他自己醒”")
        c2 = len(calls())
        say(pg, "随便说一句")
        pg.get_by_text("收到：随便说一句").last.wait_for(timeout=20000)
        time.sleep(1.0)
        body = calls()[c2]["body"] if len(calls()) > c2 else {}
        ok("【你的屋子】" not in system_of(body) and names_of(body) == TOOLS, "关着：名帖里没有【你的屋子】，工具照带（对话里有他调过的，不带那边不认）")
        code, out = alarm(["uninstall"], home)
        ok(code == 0, "卸了家里的闹钟")
    finally:
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
