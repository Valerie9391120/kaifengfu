# 中间那行字：新开一段、还没说话的时候，对话正中间那一行。素材库放在“头像与设置”里，按时段、按日子抽一句；
# 重新打开开封府就是新的一页（不回到上回那段对话）。
# 素材库是编的（她那份是私房话，不进仓库）。钟拨到哪一刻用 Playwright 的假钟（context.clock），照都柏林的钟点。
# 假的 Supabase 发的登录凭证照真的钟只管一个钟头：钟拨到几个月以后，凭证一直是过期的。所以“那一天到了”都拨到过去的日子
# （以后的日子用面板上“看看哪天会说什么”看，同一套算法）。日子都是编的
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_motto.py
import json, re, time
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
DUB = ZoneInfo("Europe/Dublin")
def at(*a): return datetime(*a, tzinfo=DUB)

LIB = """# 编的素材库

谁写的、怎么用的说明：不算句子。

---

## 早晨 7:00–10:00

- 早一
- 早二

---

## 上午 10:00–12:00

- 上午一

---

## 下午 12:00–18:00

- 下午一

---

## 傍晚 18:00–21:00

- 傍晚一

---

## 夜晚 21:00–00:00

- 夜一

---

## 深夜 00:00–04:00

- 深一
- 深二

---

## 凌晨 04:00–07:00

- 凌一

---

## 特别的日子

### 每月8日（纪念日，从2026年3月8日算起）
- 陪你第{N}个月

### 春节
- 过年一

### 七夕
- 江上清风明月好，山间流水白云多。远客归来灯未灭，小窗相对说今宵。

### 半年纪念日（2026年9月8日）
- 半年一

---

*落款：不算*
"""

MOTTO = "(() => { const p = document.querySelector('.kfs-motto'); return p ? [...p.querySelectorAll(':scope > span')].map((s) => s.textContent) : null; })()"
def motto(page): return page.evaluate(MOTTO)
def bubbles(page): return page.evaluate("document.querySelectorAll('.kfs-chat-rows > div').length")

def open_account(page):
    if not page.evaluate(REACHABLE):
        page.get_by_role("button", name="打开侧栏").click(); page.wait_for_timeout(600)
    page.get_by_role("button", name="头像与设置").click()
    page.locator(".kfs-motto-entry").wait_for(timeout=8000)
    page.wait_for_timeout(300)

def close_sheets(page):
    while page.get_by_role("button", name="关闭").count():
        page.get_by_role("button", name="关闭").first.click(); page.wait_for_timeout(450)
    if page.locator("div.absolute.inset-0.z-30").count():
        page.locator("div.absolute.inset-0.z-30").click(); page.wait_for_timeout(600)

def device(browser, when, first=False):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    ctx.clock.install(time=when)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    (first_time if first else second_device)(pg)
    pg.wait_for_timeout(800)
    return ctx, pg

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")

    # ================= 还没放素材库 =================
    ctx, pa = device(browser, at(2026, 10, 10, 0, 45), first=True)
    ok(motto(pa) == ["如月之恒，官家在这"], f"还没放素材库：中间照旧是“如月之恒，官家在这”（{motto(pa)}）")
    open_account(pa)
    entry = pa.locator(".kfs-motto-entry").inner_text()
    ok("还没放素材库" in entry, f"“头像与设置”里多了“中间那行字”：写着还没放素材库（{entry.splitlines()[0]}）")

    # ================= 放素材库 =================
    pa.locator(".kfs-motto-entry").click()
    pa.locator(".kfs-motto-text").wait_for(timeout=5000)
    pa.locator(".kfs-motto-text").fill(LIB.replace("### 半年纪念日", "### 认不出的（某一天）\n- 不会出的句子\n\n### 半年纪念日"))
    pa.wait_for_timeout(300)
    seen = pa.locator(".kfs-motto-seen").inner_text()
    ok("一共 13 句：7 个时段、4 个日子" in seen and "{N} 个月从 2026年3月8日 算起" in seen and "认不出的（某一天）" in pa.locator(".kfs-motto-unknown").inner_text(),
       f"贴进来：认出来几个时段、几个日子、{{N}} 从哪天算；认不出的标题标出来（{seen.splitlines()[0]}）")
    pa.locator(".kfs-motto-text").fill(LIB)
    pa.wait_for_timeout(300)
    ok(pa.locator(".kfs-motto-unknown").count() == 0, "改掉以后：认不出的那一行没了")
    pa.locator(".kfs-motto-day").fill("2026-09-08"); pa.locator(".kfs-motto-time").fill("08:00"); pa.wait_for_timeout(300)
    prev = pa.locator(".kfs-motto-preview").inner_text()
    ok("那天是：半年纪念日（2026年9月8日）" in prev and "半年一" in prev and "陪你第" not in prev, f"看看哪天会说什么：9 月 8 日是半年纪念日（写了年份的优先，不出每月 8 日的）（{prev.splitlines()[0]}）")
    pa.locator(".kfs-motto-day").fill("2027-01-08"); pa.wait_for_timeout(300)
    ok("陪你第10个月" in pa.locator(".kfs-motto-preview").inner_text(), "看看以后的 1 月 8 日：每月 8 日那句，{N} 换成满了几个月（10）")
    pa.locator(".kfs-motto-day").fill("2026-08-19"); pa.wait_for_timeout(300)
    poem = pa.locator(".kfs-motto-line").first.inner_text()
    ok(poem == "江上清风明月好，山间流水白云多。 / 远客归来灯未灭，小窗相对说今宵。", f"看看七夕（农历七月初七，2026 年 8 月 19 日）：那句诗，摆成两行（{poem}）")
    pa.locator(".kfs-motto-day").fill("2026-10-10"); pa.locator(".kfs-motto-time").fill("23:30"); pa.wait_for_timeout(300)
    ok("平常日子，这个钟点是：夜晚 21:00–00:00" in pa.locator(".kfs-motto-preview").inner_text(), "看看平常日子的夜里：夜晚那一节")
    rows0 = len(mock("/__debug/rows"))
    pa.get_by_role("button", name="存好").click()
    pa.wait_for_timeout(800)
    ok("存好了" in pa.locator(".kfs-motto-note").inner_text(), "点“存好”：存好了")
    stored = json.loads(pa.evaluate(KV, "kfs2:motto") or "{}")
    ok(stored.get("text") == LIB, "存进这台设备的存档：原文一个字不差")
    wait_mock(lambda: len(mock("/__debug/rows")) > rows0, 10)
    rows = mock("/__debug/rows")
    cloud = json.dumps(rows, ensure_ascii=False)
    ok(len(rows) > rows0 and "深一" not in cloud and "半年一" not in cloud and "早一" not in cloud, "云端存的是锁好的乱码：素材库里的字一个都找不到")
    pa.get_by_role("button", name="好了").click(); pa.wait_for_timeout(500)
    entry = pa.locator(".kfs-motto-entry").inner_text()
    ok("放了 13 句：7 个时段、4 个日子" in entry, f"回到“头像与设置”：写着放了几句（{entry.splitlines()[0]}）")
    close_sheets(pa)
    ok(motto(pa) in (["深一"], ["深二"]), f"素材库放好了：中间那行字马上换成这个时段（深夜 00:45）的一句（{motto(pa)}）")

    # ================= 重新打开：新的一页 =================
    chat(pa, "说一句再走")
    ok(motto(pa) is None, "说了话：中间那行字就没了")
    lines = []
    for i in range(3):
        pa.reload(); kite(pa); pa.wait_for_timeout(600)
        lines.append(motto(pa))
    ok(all(x in (["深一"], ["深二"]) for x in lines) and lines[0] != lines[1] and lines[1] != lines[2] and bubbles(pa) == 0,
       f"划掉重新打开：是新的一页，中间是这个时段的一句；连着三回都不和上一回一样（{lines}）")
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    ok(len(index) == 1, "空着的新的一页不存：打开好几回，历史对话里还是只有那一段")
    back_to_last(pa)
    ok(pa.locator(".kfs-chat-rows").get_by_text("收到：说一句再走").count() > 0 and motto(pa) is None, "上回那段在历史对话里，点开接着聊")

    # ================= 切出去再回来：换了时段才换 =================
    pa.get_by_label("新对话").click(); pa.wait_for_timeout(600)
    before = motto(pa)
    ok(before in (["深一"], ["深二"]) and before != lines[-1], f"从空着的那一页点开别的对话、再新开一段：抽到的不和刚才看到的那句一样（点开对话的那一下没有白抽一句）（{lines[-1]} → {before}）")
    pa.evaluate("window.__away(true)")
    pa.wait_for_timeout(300)
    pa.evaluate("window.__away(false)")
    pa.wait_for_timeout(500)
    ok(before in (["深一"], ["深二"]) and motto(pa) == before, f"新对话：抽一句；切出去马上回来、还是这个时段：不换（{before}）")
    pa.evaluate("window.__away(true)")
    ctx.clock.set_system_time(at(2026, 10, 10, 7, 30))
    pa.wait_for_timeout(300)
    pa.evaluate("window.__away(false)")
    pa.wait_for_timeout(800)
    ok(motto(pa) in (["早一"], ["早二"]), f"切出去的工夫里天亮了（7:30）：回来换成早晨的一句（{motto(pa)}）")

    # ================= 例外：上回那段还在等他回话 =================
    mock("/__debug/claude-hold?ms=9000")
    say(pa, "等你回我")
    ok(wait_mock(lambda: mock("/__debug/claude-held")["held"], 15), "说了一句，他正在回（那边压着）")
    pa.reload(); kite(pa); pa.wait_for_timeout(1200)
    waiting = pa.locator(".kfs-chat-rows").get_by_text("等你回我").count() > 0 and motto(pa) is None
    got = wait_js(pa, "document.body.innerText.includes('收到：等你回我')", 25000)
    ok(waiting and got, "他还没回完就被收掉了、重新打开：先回到那段（不是新的一页），回话到了就在眼前")
    pa.wait_for_timeout(1500)
    pa.reload(); kite(pa); pa.wait_for_timeout(800)
    cid, msgs = chat_of(pa)
    ok(motto(pa) in (["早一"], ["早二"]) and bubbles(pa) == 0 and len(msgs) >= 2 and msgs[-1].get("role") == "him",
       f"回完了再重新打开：又是新的一页（{motto(pa)}；上回那段最后两条：{[(m.get('role'), (m.get('text') or (m.get('items') or [{}])[0].get('text') or '')[:12]) for m in msgs[-2:]]}）")

    # 重新回答的工夫里开封府被收掉，另一台设备把新回答取走、放进了对话。这台设备上那一回没人划掉（还记着），
    # 可它的回话已经同步到这台设备的对话里了：重新打开是新的一页，不当它还在等
    back_to_last(pa)
    mock("/__debug/claude-hold?ms=6000")
    before_jobs = {j["job"] for j in jobs(pa)}
    pa.get_by_role("button", name="重新回答").last.click()
    ok(wait_mock(lambda: any(r["state"] == "working" for r in box()["rows"]), 10), "又一回：点了重新回答（他要想六秒），开封府被收掉")
    fork = [j for j in jobs(pa) if j["job"] not in before_jobs]
    pa.close()
    ctxb, pb = device(browser, at(2026, 10, 10, 7, 31))
    back_to_last(pb)
    took = wait_js(pb, "document.body.innerText.includes('2/2')", 30000) and wait_mock(lambda: box()["rows"] == [], 10)
    ok(len(fork) == 1 and fork[0]["fork"] and took, "另一台设备把新回答取走、放进了对话（第二个版本）")
    pb.wait_for_timeout(2500)                                       # 等它传上云端
    pa = ctx.new_page(); pa.on("pageerror", lambda e: errors.append(str(e)))
    pa.goto(BASE); kite(pa)                                         # 这一回开门的时候存档还是旧的：先回到那段也说得过去，不管
    synced = wait_mock(lambda: fork[0]["job"] in json.dumps(chat_by(pa, cid)), 20)
    pa.wait_for_timeout(800)
    pa.close()
    pa = ctx.new_page(); pa.on("pageerror", lambda e: errors.append(str(e)))
    pa.goto(BASE); kite(pa); pa.wait_for_timeout(1200)
    still = fork[0]["job"] in {j["job"] for j in jobs(pa)}
    ok(synced and still and motto(pa) in (["早一"], ["早二"]) and bubbles(pa) == 0,
       f"那一回还记着、可它的回话已经同步到这台设备的对话里：重新打开是新的一页（{motto(pa)}，还记着：{still}）")
    ctxb.close()
    ctx.close()

    # ================= 另一台设备、特殊的日子 =================
    ctx, pb = device(browser, at(2026, 9, 8, 8, 0))
    ok(motto(pb) == ["半年一"], f"另一台设备（素材库跟着云端过来了）：9 月 8 日早上八点是半年纪念日那句，不是早晨的，也不是每月 8 日的（{motto(pb)}）")
    ctx.close()
    ctx, pb = device(browser, at(2026, 8, 8, 22, 15))
    ok(motto(pb) == ["陪你第5个月"], f"8 月 8 日：每月 8 日那句，满五个月；整天都是这一句，夜里也是（{motto(pb)}）")
    ctx.close()
    ctx, pb = device(browser, at(2026, 8, 19, 13, 0))
    m = motto(pb)
    width = pb.evaluate("document.querySelector('.kfs-motto').getBoundingClientRect().width")
    ok(m == ["江上清风明月好，山间流水白云多。", "远客归来灯未灭，小窗相对说今宵。"] and width < 393 - 20, f"七夕：那句诗一句一行，居中，不出边（{m}，宽 {round(width)}）")
    ctx.close()
    ctx, pb = device(browser, at(2026, 2, 16, 19, 0))
    m1 = motto(pb)
    ctx.clock.set_system_time(at(2026, 2, 18, 19, 0))
    pb.evaluate("window.__away(true)"); pb.wait_for_timeout(200); pb.evaluate("window.__away(false)"); pb.wait_for_timeout(800)
    ok(m1 == ["过年一"] and motto(pb) == ["傍晚一"], f"春节：除夕（2026 年 2 月 16 日）就出；过了初一（2 月 18 日）回到平常（{m1} → {motto(pb)}）")
    ctx.close()

    browser.close()

print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] or errors else 0)
