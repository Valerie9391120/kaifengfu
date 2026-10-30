# 抄提要的流水账（10 月 30 日添的）：每试一回抄提要记一笔，API 面板里写出来（成没成、为什么没成、等了多久），
# 眼前这段对话抄到哪儿了、攒了多厚，上回没成的几点以后再试；“现在抄一趟”当场抄一趟。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_recap_log.py
import json, re, sys, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []

SEED = """(recs) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite');
  recs.forEach((r) => tx.objectStore('kv').put({ k: r[0], v: r[1], dirty: 1, del: 0 })); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }; o.onerror = () => rej(o.error); })"""
TURNS = 240

# 编一段旧对话（同 tests/e2e_recap.py 的 old_chat）
def old_chat(tag, turns, her_len, his_len):
    rows, t = [], int(time.time() * 1000) - turns * 2 * 60000 - 3600000
    for i in range(turns):
        t += 60000
        rows.append({"id": f"{tag}{i}h", "role": "her", "ts": t, "text": f"{tag}旧话第{i}问" + "问" * her_len})
        t += 60000
        raw = f"{tag}旧话第{i}答" + "答" * his_len
        rows.append({"id": f"{tag}{i}m", "role": "him", "ts": t, "raw": raw, "items": [{"type": "text", "text": raw}]})
    return rows

def plant(page, cid, rows, title):
    page.wait_for_timeout(3000)
    index = json.loads(page.evaluate(KV, "kfs2:index") or "[]")
    index = [{"id": cid, "title": title, "preview": "旧的", "updatedAt": int(time.time() * 1000)}] + [c for c in index if c["id"] != cid]
    page.evaluate(SEED, [["kfs2:chat:" + cid, json.dumps(rows, ensure_ascii=False)], ["kfs2:index", json.dumps(index, ensure_ascii=False)], ["kfs2:lastChat", cid]])
    page.reload(); kite(page); page.wait_for_timeout(800)
    back_to_last(page)

def rule_of(c):
    system = c["body"].get("system")
    return next((b.get("text", "") for b in system if b.get("text", "").startswith(("【抄提要】", "【并提要】"))), "") if isinstance(system, list) else ""
def recap_calls(): return [c for c in calls() if rule_of(c)]
def talk_calls(): return [c for c in calls() if not rule_of(c) and not c["body"].get("ping")]
def recaps_of(page, cid): return json.loads(page.evaluate(KV, "kfs2:recap:" + cid) or "null")
def rows_on(page): return page.locator(".kfs-recap").count()
def held(): return mock("/__debug/claude-held")["held"]
def away(page, gone): page.evaluate("(v) => window.__away(v)", gone)
def ledger(page): return json.loads(page.evaluate("localStorage.getItem('kfs-recap-bad')") or "{}")
def log_of(page): return json.loads(page.evaluate("localStorage.getItem('kfs-recap-log')") or "[]")
def side(page):
    page.get_by_role("button", name="打开侧栏").click(); page.wait_for_timeout(600)
def shut_side(page):
    page.locator("div.absolute.inset-0.z-30").click(); page.wait_for_timeout(600)
def open_api(page):
    side(page)
    page.get_by_text("API", exact=True).click()
    page.locator(".kfs-recap-check").wait_for(timeout=5000)
    page.locator(".kfs-recap-check").scroll_into_view_if_needed()
def close_api(page):
    page.get_by_role("button", name="关闭").click(); page.wait_for_timeout(400)
    shut_side(page)
def state_text(page): return page.locator(".kfs-recap-state").inner_text()
def log_lines(page): return [l.inner_text() for l in page.locator(".kfs-recap-log").all()]
def now_note(page): return page.locator(".kfs-recap-now-note").inner_text() if page.locator(".kfs-recap-now-note").count() else ""
def press_now(page): page.locator(".kfs-recap-now").click()
def wait_note(page, timeout=20000):
    return wait_js(page, "(() => { const n = document.querySelector('.kfs-recap-now-note'); return !!n && n.dataset.ok != null; })()", timeout)
USAGE_ROW = """(name) => { const k = [...document.querySelectorAll('.kfs-sheet span')].find((e) => e.textContent === name); return k && k.nextElementSibling ? k.nextElementSibling.textContent : null; }"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    A = browser.new_context(**IPHONE)
    A.add_init_script(STUB)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append("A: " + str(e)))
    first_time(pa)

    # ================= 短对话：那一块写着还空着、用不着抄 =================
    open_api(pa)
    ok("还空着" in state_text(pa) and pa.locator(".kfs-recap-log-none").count() == 1 and pa.locator(".kfs-recap-now").is_disabled(), "新开的空对话：写着还空着；这台手机上还没试过；“现在抄一趟”点不了")
    pa.screenshot(path="/tmp/kfs_recap_empty.png")
    close_api(pa)
    chat(pa, "头一句")
    open_api(pa)
    ok("一共 2 条" in state_text(pa) and "还没抄过提要" in state_text(pa) and "该抄了" not in state_text(pa), "短对话：一共几条、还没抄过、没攒够")
    r0 = len(recap_calls())
    press_now(pa)
    ok(wait_note(pa) and "用不着抄" in now_note(pa) and len(recap_calls()) == r0 and log_of(pa) == [], "短对话点“现在抄一趟”：用不着抄，没去问，流水账不记")
    close_api(pa)

    # ================= 长对话，那边一直太挤：自动的那一回记一笔“没抄成” =================
    mock("/__debug/claude-fail?kind=recap")
    OLD = old_chat("甲", TURNS, 100, 300)
    plant(pa, "old-chat-1", OLD, "很长的旧对话")
    r0 = len(recap_calls())
    chat(pa, "这段很长")
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 1, 15), "他回完了：去抄了（那边太挤）")
    pa.wait_for_timeout(2000)
    t0 = len(talk_calls())
    lg = log_of(pa)
    ok(len(lg) == 1 and lg[0]["chat"] == "old-chat-1" and lg[0]["ok"] is False and "太挤" in lg[0]["why"] and "529" in lg[0]["why"] and lg[0]["manual"] is False and lg[0]["ms"] >= 0,
       "流水账记了一笔：哪段对话、没成、为什么（太挤，529）、不是她点的")
    ok(not any(k in json.dumps(lg, ensure_ascii=False) for k in ("甲旧话", "这段很长")), "流水账里没有一个字的原话")
    open_api(pa)
    st = state_text(pa)
    ok(f"一共 {TURNS * 2 + 2} 条" in st and "还没抄过提要" in st and "该抄了" in st, "API 面板：这段对话一共几条、还没抄过、攒够了该抄了")
    lines = log_lines(pa)
    ok(len(lines) == 1 and "没抄成" in lines[0] and "太挤" in lines[0] and "等了" in lines[0] and pa.locator('.kfs-recap-log[data-ok="no"]').count() == 1, "最近几回：写着没抄成、为什么、等了多久（红字）")
    ok(pa.locator(".kfs-recap-retry").count() == 1 and "以后他回完话再自己试" in pa.locator(".kfs-recap-retry").inner_text(), "上回没成：写着几点以后再自己试")
    ok(pa.evaluate(USAGE_ROW, "上一回抄提要") is None, "没回话的那一回没花钱：用量里不摆“上一回抄提要”")
    pa.screenshot(path="/tmp/kfs_recap_failed.png")

    # ================= 点“现在抄一趟”：不等那十分钟，当场试；写到上限被截断 =================
    mock("/__debug/claude-fail?kind=recap-cut")
    r0 = len(recap_calls())
    press_now(pa)
    ok(wait_note(pa) and len(recap_calls()) == r0 + 1, "点了“现在抄一趟”：不等那十分钟，当场去抄")
    note = now_note(pa)
    ok("没抄成" in note and "写到上限被截断" in note and "400 token" in note and re.search(r"上限 \d+", note) and pa.locator('.kfs-recap-now-note[data-ok="no"]').count() == 1, "这回写到上限被截断：写明用了多少 token、上限多少（红字）")
    lines = log_lines(pa)
    ok(len(lines) == 2 and "（你点的）" in lines[0] and "写到上限被截断" in lines[0] and "太挤" in lines[1], "最近几回多了一行，新的在最上面，写着是你点的")
    ok((ledger(pa).get("old-chat-1") or {}).get("times") == 2, "点的那一趟没成，照样记进隔多久再试的那本账")
    ok(pa.evaluate(USAGE_ROW, "上一回抄提要") is not None, "写到一半的那一回花了钱：用量里摆出“上一回抄提要”")

    # ================= 那边好了：点一下抄成了 =================
    mock("/__debug/claude-fail")
    r0 = len(recap_calls())
    press_now(pa)
    ok(wait_note(pa) and "抄成了一趟" in now_note(pa) and len(recap_calls()) == r0 + 1, "那边好了，再点一下：抄成了一趟（只抄一趟）")
    lines = log_lines(pa)
    ok(len(lines) == 3 and "抄成了" in lines[0] and "（你点的）" in lines[0] and pa.locator('.kfs-recap-log[data-ok="yes"]').count() == 1, "最近几回：最上面那行是抄成了")
    ok("old-chat-1" not in ledger(pa) and pa.locator(".kfs-recap-retry").count() == 0, "抄成了：隔多久再试那一笔清掉，“几点以后再试”那句也没了")
    st = state_text(pa)
    ok("提要抄到" in st and "1 段" in st and "还没抄完" in st, "这段对话那一句改成：提要抄到几点、一段、还没抄完")
    pa.screenshot(path="/tmp/kfs_recap_ok.png")
    close_api(pa)
    ok(len(talk_calls()) == t0, "开着 API 面板点了这么几下：一句话都没替她发出去（只问了抄提要的那几回）")
    ok(rows_on(pa) == 1 and len((recaps_of(pa, "old-chat-1") or [])) == 1, "聊天里多了那行小字，存档里有了那一份提要")

    # 重开：流水账还在，用量里“上一回抄提要”照它写
    pa.reload(); kite(pa); pa.wait_for_timeout(800)
    back_to_last(pa)
    open_api(pa)
    ok(len(log_lines(pa)) == 3 and pa.evaluate(USAGE_ROW, "上一回抄提要") is not None, "划掉重开：流水账还在（记在这台手机上），“上一回抄提要”也照它写")

    # ================= 点了以后她切走：这一趟断了 =================
    mock("/__debug/claude-hold?ms=90000&kind=recap")
    press_now(pa)
    ok(wait_mock(held, 15) and "别切走" in now_note(pa), "点了，压着没回：写着等了多久、别切走")
    pa.wait_for_timeout(1200)
    ok(re.search(r"等了 \d+ 秒", now_note(pa)) and pa.locator(".kfs-recap-now").is_disabled(), "一秒一跳写着等了几秒；钮点不了")
    pa.screenshot(path="/tmp/kfs_recap_busy.png")
    away(pa, True)
    mock("/__debug/claude-fail?kind=recap")
    mock("/__debug/claude-release")
    pa.wait_for_timeout(1500)
    away(pa, False)
    ok(wait_note(pa) and "切走" in now_note(pa) and "你切走了" in log_lines(pa)[0], "抄的工夫里她切走了：写着你切走了，这一趟断了")
    mock("/__debug/claude-fail")
    close_api(pa)

    # 他回完话自动抄的那一回成了，流水账也记（不是她点的）
    pa.evaluate("localStorage.removeItem('kfs-recap-bad')")
    pa.reload(); kite(pa); pa.wait_for_timeout(800)
    back_to_last(pa)
    r0 = len(recap_calls())
    chat(pa, "接着抄吧")
    ok(wait_mock(lambda: len(recap_calls()) >= r0 + 1, 15), "他回完话：自动接着抄")
    pa.wait_for_timeout(4000)
    lg = log_of(pa)
    ok(lg and lg[0]["ok"] is True and lg[0]["manual"] is False and len(lg) <= 6, "自动抄成的也记一笔（不是她点的）；流水账最多留六笔")

    ok(not errors, "页面没报错" + ("：" + " | ".join(errors[:3]) if errors else ""))
    browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
sys.exit(1 if count["failed"] else 0)
