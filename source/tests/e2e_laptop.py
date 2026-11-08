# 传话走她笔记本上的 Claude Code（卿卿 11 月 8 日定的，见开发说明“传话走笔记本上的 Claude Code”那节）的端到端测试：
# 真的浏览器；假 Supabase 里起了一扇真的门（alarm/door.js），门里的 Claude Code 换成假的（照假的 Anthropic 回，回话带 via: "claude-code"），
# 门替她等回话的时候读写信箱、敲手机走闹钟真的 cloud.js（见 tests/mock-supabase.mjs 的“她的笔记本”那一段）。
#   API 面板：传话走哪儿（API / 笔记本）、门牌暗记两格（存之前收拾一下）、上网查（默认开着）、测试连接敲门、侧栏那一格写“走笔记本”
#   上网查：那一包带着记号、名帖后面添【上网】；他查了写“用了 上网查”；关了就不带；电话里也带
#   走笔记本：回话从门那头来；用量另记、不算钱
#   走不了（敲不到、Claude Code 出岔子）：底下那张卡问她“这句走 API”“再敲笔记本”；只管这一句，下一句照旧先走笔记本、再问
#   重新回答没走成：一样问（“这次走 API”）
#   她切走了：门照样等完、放进信箱、敲她的手机；没回成的也敲一条“笔记本那头没回上”，她回来底下那张卡照样问
#   写日记：走不了弹出来问这篇走不走 API
#   打电话：接通前敲门，敲不到问这通电话走不走 API；打到一半断了，他说一句“笔记本那头断了”，挂掉
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787，门在 8788）和测试网页（8080），再：python3 tests/e2e_laptop.py
# KFS_SHOTS=目录：顺手截几张给她看的图
import json, os, re, struct, time, urllib.parse, wave
from playwright.sync_api import sync_playwright
from mailkit import *

SHOTS = os.environ.get("KFS_SHOTS", "")
DOOR = "http://127.0.0.1:8788"
TOKEN = "KFSDO-ORTES-TKEY2-34567"
errors = []

def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        time.sleep(0.4)
        page.screenshot(path=os.path.join(SHOTS, name + ".png"))
def door(**q): return mock("/__debug/door?" + urllib.parse.urlencode(q))
def vias(since=0): return [c.get("via") for c in calls()[since:]]
def side(page):
    page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
def shut_side(page):
    page.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)
def open_api(page):
    side(page)
    page.get_by_text("API", exact=True).click()
    page.locator(".kfs-route").wait_for(timeout=5000); time.sleep(0.4)
def close_api(page):
    page.get_by_role("button", name="关闭").click(); time.sleep(0.4)
    shut_side(page)
def usage_rows(page):
    return page.evaluate("[...document.querySelectorAll('.kfs-sheet span')].map((e) => e.textContent)")
def lap_card(page):
    e = page.locator(".kfs-lap-ask")
    return e.inner_text() if e.count() else ""
def wait_card(page, timeout=20000):
    return wait_js(page, "!!document.querySelector('.kfs-lap-ask')", timeout)

# 打电话用的（同 tests/e2e_call.py）
PHASE = "(() => { const e = document.querySelector('.kfs-call'); return e ? e.dataset.phase : null; })()"
def wait_phase(page, want, timeout=15000): return wait_js(page, PHASE + " === " + json.dumps(want), timeout)
def stt(): return mock("/__debug/stt")["conns"]
def stt_open():
    c = stt()
    return bool(c) and not c[-1]["closed"]
def eleven(): return mock("/__debug/eleven")["log"]
SILENCE = os.path.join(HERE, "..", ".cache", "silence-16k.wav")
os.makedirs(os.path.dirname(SILENCE), exist_ok=True)
with wave.open(SILENCE, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    w.writeframes(struct.pack("<h", 0) * 16000 * 20)

with sync_playwright() as p:
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + SILENCE]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.grant_permissions(["microphone"])
    ctx.add_init_script(STUB)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)
        enable_notifications(pa)
        chat(pa, "先走 API 说一句")
        ok(vias()[-1] != "door", "没拨过开关：照旧走 API")

        # ================= API 面板：传话走哪儿 =================
        open_api(pa)
        ok(pa.locator(".kfs-route").get_attribute("data-route") == "api" and pa.get_by_role("button", name="API", exact=True).get_attribute("aria-pressed") == "true" and not pa.locator(".kfs-door-fields").count(),
           "API 面板最上面：传话走哪儿，没拨过是 API，门牌暗记那两格不摆")
        shot(pa, "1-api")
        pa.get_by_role("button", name="笔记本", exact=True).click(); time.sleep(0.5)
        ok(pa.locator(".kfs-route").get_attribute("data-route") == "laptop" and pa.locator(".kfs-door-fields").count() == 1 and "走你笔记本上的 Claude Code" in pa.locator(".kfs-sheet").inner_text(),
           "拨到笔记本：底下出来门牌、暗记两格，说明换成一句走笔记本的")
        web = pa.get_by_role("switch", name="上网查")
        ok(web.count() == 1 and web.get_attribute("aria-checked") == "true" and "让他用 Claude Code 自带的搜索、读网页，走订阅额度" in pa.locator(".kfs-lap-web").inner_text(),
           "两格底下还有“上网查”（字照 Moonlight），默认开着")
        url = pa.locator(".kfs-door-url")
        url.fill(f"  {DOOR}/kfs/ping "); url.press("Enter"); time.sleep(0.3)
        key = pa.locator(".kfs-door-key")
        key.fill("kfsdo ortes tkey2 34567"); key.press("Enter"); time.sleep(0.5)
        ok(url.input_value() == DOOR and key.input_value() == TOKEN, f"门牌只留到端口、暗记收成大写横杠连（{url.input_value()} / {key.input_value()}）")
        st = json.loads(pa.evaluate(KV, "kfs2:settings") or "{}")
        ok(st.get("route") == "laptop" and st.get("door") == DOOR and st.get("doorKey") == TOKEN, "存进设置（跟云端走，闹钟也看得见）")
        seen0 = door()["seen"]
        pa.get_by_role("button", name="测试连接").click()
        ok(wait_js(pa, "document.body.innerText.includes('连上了：笔记本上的 Claude Code 2.1.319')", 15000) and door()["seen"] == seen0 + 1,
           "测试连接：敲门、让笔记本上的 Claude Code 回一个字，写着是哪一版")
        shot(pa, "2-laptop")
        close_api(pa)
        side(pa)
        ok("走笔记本" in pa.locator(".kfs-drawer, body").first.inner_text(), "侧栏 API 那一格底下写“走笔记本”")
        shut_side(pa)

        # ================= 走笔记本说话 =================
        n0 = len(calls())
        chat(pa, "笔记本在吗")
        ok(vias(n0) == ["door"] and not lap_card(pa), "说一句：交给笔记本那扇门（Claude Code 回的），底下没有那张卡")
        ok(door()["last"] == {"web": True, "note": True, "call": False}, f"上网查开着：那一包带着记号，名帖后面添了【上网】那一段（{door()['last']}）")
        cid, msgs = chat_of(pa)
        him = [m for m in msgs if m["role"] == "him"][-1]
        ok(him.get("job") and [it["text"] for it in him["items"]] == ["收到：笔记本在吗", "第二条"], "回话落进对话，跟走 API 一个样子（新路：这一回记着编号）")
        open_api(pa)
        rows = usage_rows(pa)
        ok("本月走笔记本" in rows and "2 次，不算钱" in rows and any(r.startswith("走的笔记本") for r in rows), f"用量：走笔记本的另记、不算钱；上一条写走的笔记本（{[r for r in rows if '笔记本' in r]}）")
        pa.get_by_text("本月走笔记本").scroll_into_view_if_needed()
        shot(pa, "2b-usage")
        close_api(pa)

        # ================= 上网查 =================
        chat(pa, "上网查一下明天天气")
        ok(wait_js(pa, "document.body.innerText.includes('用了 上网查')", 8000), "他用 Claude Code 自带的搜索查了：对话里写“用了 上网查”（同 tavily 那样）")
        open_api(pa)
        pa.get_by_role("switch", name="上网查").click(); time.sleep(0.5)
        ok(json.loads(pa.evaluate(KV, "kfs2:settings") or "{}").get("lapWeb") is False, "关掉上网查：存进设置")
        close_api(pa)
        chat(pa, "这回不上网")
        ok(door()["last"] == {"web": False, "note": False, "call": False}, f"关了：那一包不带记号、名帖后面没有【上网】（{door()['last']}）")
        open_api(pa)
        pa.get_by_role("switch", name="上网查").click(); time.sleep(0.5)
        shot(pa, "7-web")
        close_api(pa)

        # ================= 笔记本睡着了：每句都问 =================
        door(down=1)
        n1 = len(calls())
        say(pa, "睡着了吗")
        ok(wait_card(pa) and "敲不到笔记本" in lap_card(pa) and "这句走 API" in lap_card(pa) and "再敲笔记本" in lap_card(pa), f"敲不到：底下那张卡问这句走不走 API（{lap_card(pa)!r}）")
        ok(len(calls()) == n1 and count_text(pa, "收到：睡着了吗") == 0, "问她之前什么都没送出去（不走 API 也不干等）")
        shot(pa, "3-ask")
        pa.locator(".kfs-lap-api").click()
        pa.get_by_text("收到：睡着了吗").last.wait_for(timeout=20000)
        time.sleep(1.5)
        ok(vias(n1) and "door" not in vias(n1) and not lap_card(pa), f"点“这句走 API”：这一句走 API 回上了，卡收了（{vias(n1)}）")
        n2 = len(calls())
        say(pa, "还是睡着")
        ok(wait_card(pa) and len(calls()) == n2, "下一句：照旧先走笔记本，敲不到再问（每句都问）")
        door(down=0)
        pa.locator(".kfs-lap-again").click()
        pa.get_by_text("收到：还是睡着").last.wait_for(timeout=20000)
        time.sleep(1.5)
        ok(vias(n2) == ["door"] and not lap_card(pa), "笔记本醒了，点“再敲笔记本”：这一句走笔记本回上了")

        # ================= Claude Code 那头出岔子：照实说，一样问 =================
        door(fail="cc_quota")
        n3 = len(calls())
        say(pa, "额度呢")
        ok(wait_card(pa) and "订阅的额度用完了" in lap_card(pa) and len(calls()) == n3, f"Claude Code 说额度用完了：卡上照实写（{lap_card(pa)!r}）")
        pa.locator(".kfs-lap-api").click()
        pa.get_by_text("收到：额度呢").last.wait_for(timeout=20000)
        time.sleep(1.5)
        ok("door" not in vias(n3), "点“这句走 API”：走 API 回上了")
        door(fail="")

        # ================= 重新回答没走成：一样问 =================
        door(down=1)
        n4 = len(calls())
        retry_last(pa)
        ok(wait_card(pa) and "重新回答没成功" in lap_card(pa) and "这次走 API" in lap_card(pa) and pa.locator(".kfs-lap-ask").get_attribute("data-kind") == "regen", f"重新回答敲不到笔记本：问这次走不走 API（{lap_card(pa)!r}）")
        shot(pa, "4-regen")
        pa.locator(".kfs-lap-api").click()
        ok(wait_js(pa, "!document.querySelector('.kfs-lap-ask') && !document.querySelector('.kfs-typing')", 20000) and len(calls()) > n4 and "door" not in vias(n4), "点“这次走 API”：这一回重新回答走 API")
        time.sleep(1.5)
        door(down=0)

        # ================= 她切走了：门照样等完、放进信箱、敲手机 =================
        b0 = len(banners())
        mock("/__debug/claude-hold?ms=2500")
        n5 = len(calls())
        say(pa, "我先去忙")
        time.sleep(0.4)
        pa.evaluate("window.__away(true)")
        ok(wait_mock(lambda: any(r["state"] == "done" for r in box()["rows"]), timeout=15) and vias(n5) == ["door"], "她切走了：门照样等 Claude Code 回完，封好放进信箱")
        ok(wait_mock(lambda: len(banners()) >= b0 + 2, timeout=12), "过几秒信还在：门借 push 函数敲她的手机")
        got = [b["json"]["notification"] for b in banners()[b0:b0 + 2]]
        ok([b.get("title") for b in got] == ["光义", "光义"] and [b.get("body") for b in got] == ["收到：我先去忙", "第二条"], f"横幅写的是他回的话（{[b.get('body') for b in got]}）")
        pa.evaluate("window.__away(false)")
        pa.get_by_text("收到：我先去忙").last.wait_for(timeout=15000)
        time.sleep(1.5)
        ok(count_text(pa, "收到：我先去忙") == 1 and wait_mock(lambda: box()["rows"] == []), "她回来：回话在对话里，只一条；信箱收干净")

        # 切走了、Claude Code 又没回成：也敲一条；她回来底下那张卡照样问
        door(fail="cc_auth")
        b1 = len(banners())
        say(pa, "你登录了吗")
        time.sleep(0.4)
        pa.evaluate("window.__away(true)")
        ok(wait_mock(lambda: len(banners()) >= b1 + 1, timeout=15), "她不在、又没回成：也敲一条")
        sorry = banners()[b1]["json"]["notification"]
        ok(sorry.get("title") == "开封府" and str(sorry.get("body", "")).startswith("笔记本那头没回上") and "没登录" in sorry.get("body", ""), f"横幅：笔记本那头没回上（{sorry.get('body')}）")
        pa.evaluate("window.__away(false)")
        ok(wait_card(pa, 15000) and "没登录" in lap_card(pa), f"她回来：底下那张卡问这句走不走 API（{lap_card(pa)!r}）")
        door(fail="")
        pa.locator(".kfs-lap-again").click()
        pa.get_by_text("收到：你登录了吗").last.wait_for(timeout=20000)
        time.sleep(1.5)
        ok(not lap_card(pa), "她登好了点“再敲笔记本”：回上了")

        # ================= 写日记：走不了弹出来问 =================
        door(down=1)
        side(pa)
        pa.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
        pa.locator(".kfs-nanya-row", has_text="闲笔集").click()
        pa.locator(".kfs-page").wait_for(timeout=10000); time.sleep(0.6)
        n6 = len(calls())
        pa.get_by_role("button", name="让光义写这一天").click()
        ok(wait_js(pa, "!!document.querySelector('.kfs-lap-confirm')", 15000) and "这篇日记走 API 吗" in pa.locator(".kfs-lap-confirm").inner_text() and len(calls()) == n6,
           "让他写日记、敲不到笔记本：弹出来问这篇走不走 API")
        shot(pa, "5-diary")
        pa.locator(".kfs-lap-yes").click()
        ok(wait_js(pa, "!document.querySelector('.kfs-lap-confirm') && document.body.innerText.includes('重写')", 20000) and "door" not in vias(n6), "点“走 API”：这篇走 API 写好了")
        pa.get_by_role("button", name="重写").click()
        ok(wait_js(pa, "!!document.querySelector('.kfs-lap-confirm')", 15000), "再写一回：照旧先敲笔记本，敲不到再问")
        pa.locator(".kfs-lap-no").click()
        ok(wait_js(pa, "document.body.innerText.includes('没写成')", 10000), "点“先不了”：这一回不写，照实说没写成")
        door(down=0)
        pa.get_by_role("button", name="返回").first.click(); time.sleep(0.8)   # 闲笔集按返回回到侧栏
        shut_side(pa)

        # ================= 打电话 =================
        door(down=1)
        pa.locator(".kfs-composer button[aria-label='打电话']").click()
        ok(wait_js(pa, "!!document.querySelector('.kfs-call-ask')", 15000) and pa.evaluate(PHASE) == "ring" and "这通电话走 API 吗" in pa.locator(".kfs-call").inner_text(),
           "接通前敲门、敲不到：通话页上问这通电话走不走 API（他先不开口）")
        shot(pa, "6-call")
        e0 = len(eleven())
        pa.locator(".kfs-call-api").click()
        ok(wait_phase(pa, "listening", 15000), "点“走 API”：接通，他先说一句，在听她说")
        n7 = len(calls())
        wait_mock(stt_open, 6)
        mock("/__debug/stt-say?text=" + urllib.parse.quote("电话里说一句"))
        ok(wait_mock(lambda: len(calls()) > n7, 20) and "door" not in vias(n7), "这一通电话里说的走 API")
        wait_phase(pa, "listening", 20000)
        pa.get_by_role("button", name="挂断").click(); time.sleep(1.0)
        door(down=0)
        pa.locator(".kfs-composer button[aria-label='打电话']").click()
        ok(wait_phase(pa, "listening", 15000) and not pa.locator(".kfs-call-ask").count(), "笔记本醒着：接通前敲到了，不问，照常接通")
        n8 = door()["seen"]
        wait_mock(stt_open, 6)
        mock("/__debug/stt-say?text=" + urllib.parse.quote("电话里查一下"))
        ok(wait_mock(lambda: door()["seen"] > n8, 20) and door()["last"] == {"web": True, "note": True, "call": True}, f"电话里走笔记本：也带着上网查（工具照旧不许调，上网那两样照给；{door()['last']}）")
        wait_phase(pa, "listening", 20000)
        door(down=1)
        e1 = len(eleven())
        wait_mock(stt_open, 6)
        mock("/__debug/stt-say?text=" + urllib.parse.quote("你还在吗"))
        ok(wait_js(pa, "!document.querySelector('.kfs-call')", 25000), "打到一半笔记本那头断了：挂掉")
        said = [x["text"] for x in eleven()[e1:] if x["path"].startswith("/v1/text-to")]
        ok("笔记本那头断了" in said, f"挂之前他说了一句“笔记本那头断了”（{said}）")
        ok(wait_card(pa, 5000), "挂了以后：没送到的那句底下照样问走不走 API")
        door(down=0)

        ok(not errors, f"页面没报错（{errors[:3]}）")
    finally:
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] else 0)
