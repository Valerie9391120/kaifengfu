# 狐宇宙（他自己醒，卿卿 2026 年 10 月 20 日要的，见 src/fox.js、alarm/）：手机这头走一遍，家里的闹钟用真的那一份（测试包）。
#   南衙最顶上一行“狐宇宙”，小字照眼下的样子写；点了进那段对话（还空着：中间写“狐宇宙”和一句话）；
#   账户面板里“他自己醒”：开了才有两道闸（存进设置）；这台手机没开通知照实说敲不到；开了通知，门牌号报进存档（加密的）；
#   闹钟装上、叫醒他一回（他留了话）：手机上南衙那一格亮小点、那一行写“他留了话，还没看”，横幅敲到这台手机，点横幅回到狐宇宙；
#   狐宇宙不进历史对话的列表；翻开以后小点收了，看到哪儿记进存档；醒了那一行是一行小字（前面是他的头像），他的话是气泡；
#   她在狐宇宙里回他：寄过去的【此刻】后面多一句“这段对话是狐宇宙”，他前面醒了那一行是一句开封府提示。
# 真的浏览器、假 Supabase、假的 Anthropic。账号和话都是编的。
# 先在 source/ 里 npm run build:test、KFS_TEST_URL=http://127.0.0.1:8787 node alarm/build.mjs，起好两个服务（见开发说明），再：python3 tests/e2e_fox.py
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
HISTORY = "() => [...document.querySelectorAll('.kfs-history button')].slice(1).map((b) => b.innerText.split('\\n')[0])"

def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, f"fox_{name}.png"))

def side(page):
    if not page.evaluate(REACHABLE):
        page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)

def nanya(page):
    side(page)
    page.get_by_role("button", name=re.compile("^南衙")).click()
    page.locator(".kfs-nanya").wait_for(timeout=5000); time.sleep(0.4)
    return page.evaluate(ROWS)

def close_sheet(page):
    page.get_by_role("button", name="关闭").click(); time.sleep(0.4)

def settings_of(page):
    return json.loads(page.evaluate(KV, "kfs2:settings") or "{}")

def alarm(args, home, extra=None):
    env = dict(os.environ, KFS_ALARM_HOME=home, KFS_ALARM_PLAIN="1", KFS_ALARM_NOSTART="1", KFS_ALARM_EMAIL="qing@example.com", KFS_ALARM_PASSWORD="correct-horse", KFS_ALARM_PASS=PASS)
    env.update(extra or {})
    r = subprocess.run(["node", BUNDLE] + args, env=env, capture_output=True, text=True, timeout=180)
    return r.returncode, r.stdout + r.stderr

def new_chat(page):
    side(page)
    page.locator(".kfs-dock-fade button", has_text="新对话").click(); time.sleep(0.6)

def resync(page):
    # 装成切走又回来：开封府回到眼前的时候同步一遍（见 Gate.jsx）
    page.evaluate("window.__away(true)"); time.sleep(0.3)
    page.evaluate("window.__away(false)"); time.sleep(0.3)


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
    ok(pg.locator(".kfs-nanya").count() == 0 and empty.count() == 1 and "狐宇宙" in empty.inner_text() and "他自己醒来想说的话，会留在这里" in empty.inner_text() and pg.locator(".kfs-motto").count() == 0,
       "点狐宇宙：菜单收起，进那段对话；还空着：中间写“狐宇宙”和一句话（不是平常新的一页那行字）")
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
    ok(st.get("wake") is True and sec.get_attribute("data-on") == "yes" and "家里的闹钟还没装" in sec.inner_text() and pg.locator(".kfs-fox-noknock").count() == 1,
       "打开：存进设置；底下一句“家里的闹钟还没装”；这台手机还没开通知，照实说他留了话敲不到")
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
       "开了通知：这台手机的门牌号报进存档，记着几点报的（他留了话敲这一台）")
    rs = nanya(pg)
    ok(rs[0]["sub"] == "等家里的闹钟装好", f"南衙那一行：开了，等家里的闹钟装好（{rs[0]['sub']}）")
    close_sheet(pg)
    # 离开狐宇宙（开着狐宇宙的时候他留的话，她回来就看见了，算看过）
    new_chat(pg)

    # ---- 闹钟装上，叫醒他一回 ----
    home = tempfile.mkdtemp(prefix="kfs-fox-")
    try:
        code, out = alarm(["setup"], home)
        ok(code == 0 and "暗号对上了" in out, "家里的闹钟：拿她设的暗号装上了")
        mock("/__debug/reply-queue?text=" + quote("<thinking>她还在上班吧</thinking>\n醒了，想你\n[SPLIT]\n[MEME:fox_reading_book.jpg]\n[SPLIT]\n下班早点回来\n[WAKE:+2h]"))
        n0 = len(banners())
        code, out = alarm(["wake"], home)
        ok(code == 0 and "醒过了" in out, f"叫醒他一回（{out.strip().splitlines()[-1] if out.strip() else ''}）")
        got = wait_mock(lambda: len(banners()) >= n0 + 3, 15)
        bs = banners()[n0:]
        ok(got and [b["json"]["notification"]["body"] for b in bs] == ["醒了，想你", "[表情包]", "下班早点回来"] and all(b["endpoint"] == dev.get("endpoint") for b in bs) and all(b["json"]["notification"]["title"] == "光义" for b in bs),
           f"横幅敲到这台手机：一个气泡一条（心里话、[WAKE:…] 不上横幅）（{[b['json']['notification']['body'] for b in bs]}）")
        # 手机回到眼前：同步下来，南衙那一格亮小点
        resync(pg)
        side(pg)
        lit = False
        for _ in range(40):
            if pg.locator(".kfs-tile-dot").count():
                lit = True
                break
            time.sleep(0.25)
        ok(lit, "手机上：南衙那一格亮了个小点")
        hist = pg.evaluate(HISTORY)
        ok("狐宇宙" not in hist, f"狐宇宙不进历史对话的列表（{hist}）")
        rs = nanya(pg)
        ok(rs[0]["sub"] == "他留了话，还没看" and rs[0]["dot"], f"南衙那一行：他留了话，还没看，图标角上也亮着（{rs[0]}）")
        shot(pg, "4_dot")
        pg.locator(".kfs-nanya-row", has_text="狐宇宙").click(); time.sleep(1.2)
        notes = pg.evaluate(NOTICES)
        said = pg.evaluate(BUBBLES)
        ok(any("光义醒了" in n for n in notes) and "醒了，想你" in said and "下班早点回来" in said and not any("WAKE" in x for x in said), f"翻开狐宇宙：醒了那一行是一行小字，他的话是气泡（{notes}，{said}）")
        shot(pg, "5_fox")
        seen = int(pg.evaluate(KV, "kfs2:fox:seen") or 0)
        fox = json.loads(pg.evaluate(KV, "kfs2:chat:hyz") or "[]")
        side(pg)
        ok(pg.locator(".kfs-tile-dot").count() == 0 and seen >= max(m["ts"] for m in fox), "看过了：小点收了，看到哪儿记进存档（别的设备上也跟着收）")
        state = json.loads(pg.evaluate(KV, "kfs2:fox:state") or "{}")
        rs = nanya(pg)
        ok(state.get("next") and rs[0]["sub"].startswith("睡着，约 "), f"南衙那一行：睡着，约几点醒（照他定的 +2h；{rs[0]['sub']}）")
        close_sheet(pg)

        # ---- 点横幅回到狐宇宙 ----
        new_chat(pg)
        target = bs[-1]["json"]["notification"]["navigate"]
        # 开封府开着的时候点横幅：服务线程把网址里的记号递给页面（同 hashchange，见 push.js 的 watchNotices）
        pg.evaluate("(u) => { location.hash = new URL(u).hash; }", target)
        for _ in range(30):
            if "下班早点回来" in pg.evaluate(BUBBLES):
                break
            time.sleep(0.25)
        ok("下班早点回来" in pg.evaluate(BUBBLES), "点横幅：回到狐宇宙那段对话")

        # ---- 她在狐宇宙里回他 ----
        c0 = len(calls())
        chat(pg, "你醒啦")
        asked = calls()[c0]["body"] if len(calls()) > c0 else {}
        flat = json.dumps(asked, ensure_ascii=False)
        ok("这段对话是狐宇宙" in flat and "你自己醒了一回" in flat and "[WAKE:+2h]" in flat, "她在狐宇宙里回他：【此刻】后面多一句“这段对话是狐宇宙”；他前面醒了那一行、他定的几点醒，他都看得见")
        shot(pg, "6_reply")
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
