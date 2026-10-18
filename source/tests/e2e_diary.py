# 日记共读（卿卿 10 月 18 日凌晨要的，见开发说明“日记共读”那一节、src/diaryTools.js）的端到端测试：
# 真的浏览器，假 Supabase 里假的那边的我会翻日记（见 tests/mock-supabase.mjs 的 fakeDiary）：
#   “翻日记 2026-10-18”先说一句再调 diary_read；“翻日记目录”一个字不说只调 diary_list；“搜日记 某某”调 diary_search；
#   “翻两回 2026-10-18”先调 diary_list、再调 diary_read；“翻到一半”调了 diary_read 可回话停在 max_tokens 上。
#   结果递回去以后说“（测试翻日记）”加结果的头一行，再一条“翻完了”。
# 日记是在闲笔集里真写的（编的字），他那一页是让假的那边的我写的。
# 最后一段是两台设备（只有新路有，KFS_OLD_PATH=1 的时候不跑）：他翻日记的一步只让发那一回的设备替他翻。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：python3 tests/e2e_diary.py
import json, os, re, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
HIS = "[...document.querySelectorAll(\"[data-kfs-bubble='him']\")].map((e) => e.innerText)"
NOTES = "[...document.querySelectorAll('.kfs-diary-note')].map((e) => e.innerText)"
HER_DIARY = "今天在运河边看到泡桐花，紫色的，一串一串挂着。"
DIARY_NAMES = ["diary_list", "diary_read", "diary_search"]

def sys_text(body):
    s = body["system"]
    return s[0]["text"] if isinstance(s, list) else s
def tool_names(body):
    return [t.get("name") or t.get("type") for t in body.get("tools", [])]
def settle(page, n, timeout=30):
    wait_mock(lambda: len(calls()) >= n, timeout)
    wait_js(page, "!(" + TYPING + ")", timeout * 1000)
    time.sleep(1.2)
def say_and_wait(page, text, more):
    n = len(calls())
    say(page, text)
    settle(page, n + more)
    return n
def said_by(text, start=0):
    def hit(c):
        last = c["body"]["messages"][-1]["content"]
        return isinstance(last, list) and any(b.get("type") == "text" and b.get("text") == text for b in last)
    return [c for c in calls()[start:] if hit(c)]
def conts(tool_id):
    out = []
    for c in calls():
        last = c["body"]["messages"][-1]["content"]
        if isinstance(last, list) and last and last[0].get("type") == "tool_result" and last[0].get("tool_use_id") == tool_id:
            out.append(c)
    return out
def close_side(page):
    if page.locator("div.absolute.inset-0.z-30").count():
        page.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    old_path = bool(os.environ.get("KFS_OLD_PATH"))
    if old_path:
        mock("/__debug/mail-setup?table=missing")
    A = browser.new_context(**IPHONE)
    A.add_init_script(STUB)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append("A: " + str(e)))
    try:
        first_time(pa)
        y, mo, d = pa.evaluate("(() => { const t = new Date(); return [t.getFullYear(), t.getMonth() + 1, t.getDate()]; })()")
        today = f"{y}-{mo:02d}-{d:02d}"
        label = f"{mo}月{d}日"

        # ================= 在闲笔集里写今天的日记，再让他写他那一页 =================
        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        pa.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
        pa.locator(".kfs-nanya-row", has_text="闲笔集").click()
        pa.locator(".kfs-page").wait_for(timeout=10000); time.sleep(0.6)
        pa.get_by_role("button", name=re.compile("甜")).first.click(); time.sleep(0.3)
        pa.get_by_role("button", name="写几句").click(); time.sleep(0.3)
        pa.get_by_placeholder("这天发生了什么").fill(HER_DIARY)
        pa.get_by_role("button", name="保存").click(); time.sleep(0.6)
        n_write = len(calls())
        pa.get_by_role("button", name="让光义写这一天").click()
        ok(wait_js(pa, "document.body.innerText.includes('今天她第一次从开封府的新门进来')", 20000), "闲笔集里写好了今天的日记（心情甜），他那一页也写好了")
        wb = calls()[n_write]["body"]
        ok("tools" not in wb and "【日记本】" not in sys_text(wb) and any(b.get("text", "").startswith("【写日记】") for b in wb["system"]),
           "让他写日记的那一回：不带工具，名帖里也没有【日记本】那一段（跟原来一样）")
        month = json.loads(pa.evaluate(KV, "kfs2:diary:" + today[:7]) or "{}")
        ok(month.get(today, {}).get("her", {}).get("text") == HER_DIARY and month[today].get("him", {}).get("text"), "日记存在 kfs2:diary:<年-月> 里（她的、他的都在）")
        pa.get_by_role("button", name="返回").first.click(); time.sleep(0.6)
        close_side(pa)

        # ================= 平常说话：带着翻日记的三样 =================
        n0 = say_and_wait(pa, "你好", 1)
        b0 = said_by("你好", n0)[0]["body"]
        ok(tool_names(b0) == DIARY_NAMES and "tool_choice" not in b0, f"平常说一句：带着翻日记的三样工具，随时能翻（{tool_names(b0)}）")
        ok("【日记本】" in sys_text(b0) and "diary_search" in sys_text(b0) and sys_text(b0).index("【日记本】") < sys_text(b0).index("【回复格式】"), "名帖里有【日记本】那一段，排在【回复格式】前头")
        ok(pa.evaluate(NOTES) == [], "没翻：聊天里没有那一行小字")

        # ================= 翻日记：读今天 =================
        n1 = say_and_wait(pa, f"翻日记 {today}", 2)
        b1a, b1b = calls()[n1]["body"], calls()[n1 + 1]["body"]
        cid, msgs = chat_of(pa)
        his = [m for m in msgs if m["role"] == "him"]
        step, done = his[-2], his[-1]
        c = step["calls"][0]
        ok(step.get("stop") == "tool_use" and c["name"] == "diary_read" and c["input"] == {"dates": [today]} and not c.get("err") and c["note"] == f"翻了日记 · {label}",
           f"他说“我翻翻。”就调了 diary_read：那一步记着没说完，那一行小字是“翻了日记 · {label}”（{c.get('note')}）")
        ok(HER_DIARY in c["out"] and "她写的（心情：甜）" in c["out"] and "今天她第一次从开封府的新门进来" in c["out"] and "（今天）" in c["out"], "替他翻到的：她写的（连心情）、他写的都在，标着今天")
        last = b1b["messages"][-1]["content"]
        prev = b1b["messages"][-2]
        ok(last[0]["type"] == "tool_result" and last[0]["tool_use_id"] == c["id"] and last[0]["content"] == c["out"] and last[-1]["text"].startswith("【此刻】"),
           "翻到的递回去：最后一句最前面是 tool_result，【此刻】排在后面")
        ok(prev["role"] == "assistant" and [x["type"] for x in prev["content"]] == ["text", "tool_use"] and prev["content"][0]["text"] == "我翻翻。", "他前面那一步照原样寄回去：他说的字、他调的那一样")
        ok(sys_text(b1a) == sys_text(b1b) and b1a.get("tools") == b1b.get("tools") and sys_text(b1a) == sys_text(b0), "名帖、工具前后几回一个字不差（缓存接得上）")
        ok(pa.evaluate(NOTES) == [f"翻了日记 · {label}"], f"聊天里一行小字：{pa.evaluate(NOTES)}")
        hs = pa.evaluate(HIS)
        ok("我翻翻。" in hs and any(x.startswith("（测试翻日记）【") for x in hs) and hs[-1] == "翻完了" and "stop" not in done, "他的话：翻之前那一句、接着说的两条；说完的那一条不记没说完")
        order = pa.evaluate("""(() => { const all = [...document.querySelectorAll('.kfs-chat-rows *')]; const n = document.querySelector('.kfs-diary-note');
            const a = [...document.querySelectorAll("[data-kfs-bubble='him']")].find((e) => e.innerText === '我翻翻。'); const b = [...document.querySelectorAll("[data-kfs-bubble='him']")].find((e) => e.innerText.startsWith('（测试翻日记）'));
            return [all.indexOf(a), all.indexOf(n), all.indexOf(b)]; })()""")
        ok(order[0] < order[1] < order[2], f"那一行小字摆在“我翻翻。”后面、接着说的话前面（{order}）")

        # ================= 翻目录：一个字不说只翻 =================
        n2 = say_and_wait(pa, "翻日记目录", 2)
        cid, msgs = chat_of(pa)
        silent = [m for m in msgs if m["role"] == "him"][-2]
        ok(silent["items"] == [] and silent["calls"][0]["name"] == "diary_list" and silent["calls"][0]["note"] == "翻了日记目录 · 最近三十天" and f"{label}" in silent["calls"][0]["out"],
           "只翻不说的一步：没有字，翻的是最近三十天的目录（今天在里面）")
        ok(pa.evaluate(NOTES)[-1] == "翻了日记目录 · 最近三十天" and "……" not in pa.evaluate(HIS), "聊天里只有那一行小字，不摆“……”")
        b2 = calls()[n2 + 1]["body"]
        ok([x["type"] for x in b2["messages"][-2]["content"]] == ["tool_use"], "寄回去：只翻不说的那一步只有 tool_use")

        # ================= 搜日记 =================
        n3 = say_and_wait(pa, "搜日记 泡桐花", 2)
        cid, msgs = chat_of(pa)
        s = [m for m in msgs if m["role"] == "him"][-2]["calls"][0]
        ok(s["name"] == "diary_search" and s["note"] == "搜了日记 · 泡桐花" and "一共 1 处" in s["out"] and f"{label} 她写的" in s["out"], f"搜日记：找到她今天写的那一处（{s['out'][:40]}）")
        ok(pa.evaluate(NOTES)[-1] == "搜了日记 · 泡桐花", "小字写搜了什么")

        # ================= 一口气翻两回 =================
        n4 = say_and_wait(pa, f"翻两回 {today}", 3)
        cid, msgs = chat_of(pa)
        tail = msgs[-3:]
        ok([m.get("stop") for m in tail] == ["tool_use", "tool_use", None] and tail[0]["calls"][0]["name"] == "diary_list" and tail[1]["calls"][0]["name"] == "diary_read",
           "翻两回：先翻目录、结果递回去、再读那一天、再递回去才说完（三条回话，前两条记着没说完）")
        ok(pa.evaluate(NOTES)[-2:] == ["翻了日记目录 · 最近三十天", f"翻了日记 · {label}"], "两行小字，一步一行")

        # ================= 写到长度上限被截断：不替他翻 =================
        n5 = len(calls())
        say(pa, "翻到一半")
        wait_mock(lambda: len(calls()) >= n5 + 1, 20)
        wait_js(pa, "!(" + TYPING + ")", 20000); time.sleep(3.0)
        cid, msgs = chat_of(pa)
        cut = [m for m in msgs if m["role"] == "him"][-1]
        ok(len(calls()) == n5 + 1 and "stop" not in cut and cut["calls"][0]["err"] and cut["calls"][0]["out"].startswith("没翻：") and cut["calls"][0]["note"] == "想翻日记，没翻成" and "翻着翻着" in pa.evaluate(HIS),
           "回话停在 max_tokens 上：不替他翻、不接着要，记成没翻成（小字“想翻日记，没翻成”），他写的字照摆")
        n6 = say_and_wait(pa, "嗯", 1)
        b6 = said_by("嗯", n6)[0]["body"]
        res = [blk for m in b6["messages"] if m["role"] == "user" and isinstance(m["content"], list) for blk in m["content"] if blk.get("type") == "tool_result" and blk.get("tool_use_id") == cut["calls"][0]["id"]]
        ok(res and res[0].get("is_error") and res[0]["content"].startswith("没翻："), "下一回寄过去：那一样后面照样跟着结果（标成出错），他看得到没翻成")

        # ================= 重新打开：都还在 =================
        pa.reload(); kite(pa); back_to_last(pa)
        wait_js(pa, "document.querySelectorAll('.kfs-diary-note').length > 0", 10000)
        ok(len(pa.evaluate(NOTES)) == 6 and pa.evaluate(NOTES)[0] == f"翻了日记 · {label}", f"重新打开：那几行小字都还在（{len(pa.evaluate(NOTES))} 行）")

        # ================= 话出去了、开封府被收掉：回来的一步进了信箱，重新打开由这台替他翻 =================
        if not old_path:
            def nudge(page):
                page.evaluate("window.__away(true)"); time.sleep(0.2); page.evaluate("window.__away(false)")
            wait_js(pa, "!(" + TYPING + ")", 30000); time.sleep(1.0)
            mock("/__debug/claude-hold?ms=60000")
            say(pa, "搜日记 紫色")
            ok(wait_mock(lambda: mock("/__debug/claude-held")["held"], 20), "说“搜日记 紫色”（他要想一会儿）")
            job0 = [r for r in box()["rows"] if r["state"] == "working"][0]["job"]
            pa.close()
            mock("/__debug/claude-release")
            ok(wait_mock(lambda: any(r["job"] == job0 and r["state"] == "done" for r in box()["rows"]), 20), "开封府被收掉了：回话照样进了信箱")
            pa = A.new_page()
            pa.on("pageerror", lambda e: errors.append("A2: " + str(e)))
            pa.goto(BASE); kite(pa)
            ok(wait_mock(lambda: any(m.get("job") == job0 for m in chat_by(pa, cid)), 20), "重新打开（同一台）：是这台发的，当场替他翻了、放进了对话（不用等两分钟）")
            st0 = [m for m in chat_by(pa, cid) if m.get("job") == job0][0]
            ok(st0["calls"][0]["name"] == "diary_search" and "紫色" in st0["calls"][0]["out"] and not st0["calls"][0].get("err"), "翻到了“紫色”那一处")
            ok(wait_mock(lambda: len(conts(st0["calls"][0]["id"])) == 1, 30), "在后台接着要了后半截（她没翻到那段对话也接）")
            back_to_last(pa)
            ok(wait_js(pa, "document.body.innerText.includes('翻完了')", 20000), "翻到那段对话：他说完了")

        # ================= 两台设备：他翻日记的一步只让发那一回的设备替他翻 =================
        if not old_path:
            B = browser.new_context(**IPHONE)
            B.add_init_script(STUB)
            pb = B.new_page()
            pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
            second_device(pb)
            back_to_last(pb)
            ok(last_chat(pb) == cid, "另一台设备也翻到这段对话")

            # ---- 头一回：两台都开着，另一台守着这一回；回来的是翻日记的一步，只有发的那台翻 ----
            mock("/__debug/claude-hold?ms=60000")
            say(pa, f"翻日记 {today}")
            ok(wait_mock(lambda: mock("/__debug/claude-held")["held"], 20), "手机上说“翻日记”（他要想一会儿）")
            job = [r for r in box()["rows"] if r["state"] == "working"][0]["job"]
            her_id = [m for m in chat_of(pa)[1] if m["role"] == "her"][-1]["id"]
            nudge(pb)
            ok(wait_mock(lambda: any(m["id"] == her_id for m in chat_by(pb, cid)), 15), "另一台同步到了她这一句")
            time.sleep(1.5); nudge(pb)
            ok(wait_js(pb, TYPING, 10000), "平常的对话：另一台照旧守着这一回（顶上显示正在输入）")
            mock("/__debug/claude-release")
            ok(wait_mock(lambda: any(m.get("job") == job for m in chat_by(pa, cid)), 20), "回话到了：手机替他翻了，放进了对话")
            step1 = [m for m in chat_by(pa, cid) if m.get("job") == job][0]
            tid1 = step1["calls"][0]["id"]
            ok(wait_mock(lambda: len(conts(tid1)) >= 1, 30), "手机接着要了后半截")
            time.sleep(5.0); nudge(pb); time.sleep(3.0)
            ok(len(conts(tid1)) == 1, f"后半截只要了一回（另一台没替他翻一遍、没接着要：{len(conts(tid1))} 回）")
            ok(wait_mock(lambda: sum(1 for m in chat_by(pb, cid) if m.get("job") == job) == 1, 15), "另一台同步下来：这一步在，只有一条")

            # ---- 第二回：手机关了不回来，另一台守着、拿到了也先不放，过了等它的工夫才替它翻 ----
            wait_js(pa, "!(" + TYPING + ")", 30000); time.sleep(1.0)
            mock("/__debug/claude-hold?ms=60000")
            say(pa, "搜日记 运河")
            ok(wait_mock(lambda: mock("/__debug/claude-held")["held"], 20), "手机上又说一句“搜日记 运河”")
            job2 = [r for r in box()["rows"] if r["state"] == "working"][0]["job"]
            her2 = [m for m in chat_of(pa)[1] if m["role"] == "her"][-1]["id"]
            nudge(pb)
            wait_mock(lambda: any(m["id"] == her2 for m in chat_by(pb, cid)), 15); time.sleep(1.5); nudge(pb)
            ok(wait_js(pb, TYPING, 10000), "另一台守着这一回")
            pa.close()
            mock("/__debug/claude-release")
            ok(wait_mock(lambda: any(r["job"] == job2 and r["state"] == "done" for r in box()["rows"]), 20), "手机关了：回话照样进了信箱")
            time.sleep(4.0)
            ok(not any(m.get("job") == job2 for m in chat_by(pb, cid)) and any(r["job"] == job2 for r in box()["rows"]) and not pb.evaluate(TYPING),
               "另一台守到了，可那是手机发的、要替他翻的一步：先不放（信留着），顶上的正在输入收了")
            aged = mock("/__debug/mail-age?ms=200000")
            nudge(pb)
            ok(aged["aged"] >= 1 and wait_mock(lambda: any(m.get("job") == job2 for m in chat_by(pb, cid)), 20), "过了等手机的工夫（手机一直没开）：另一台替它翻了")
            step2 = [m for m in chat_by(pb, cid) if m.get("job") == job2][0]
            c2 = step2["calls"][0]
            ok(c2["name"] == "diary_search" and not c2.get("err") and "运河" in c2["out"] and "一共 1 处" in c2["out"], "另一台替它翻的：用的是同步过来的日记，找到了")
            ok(wait_mock(lambda: len(conts(c2["id"])) == 1, 30) and wait_js(pb, "document.body.innerText.includes('翻完了')", 20000), "另一台接着要了后半截，他说完了")
            B.close()
    finally:
        print(f"\n通过 {count['passed']}  失败 {count['failed']}")
        if errors:
            print("页面报错：", errors[:5])
        browser.close()
    raise SystemExit(1 if count["failed"] or errors else 0)
