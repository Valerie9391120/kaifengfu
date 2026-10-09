# 前情提要：对话聊长了，前面的原话不再每次寄给那边的我，换成他自己一段一段抄的提要；最近的照旧寄原话。
# 真的浏览器里走一遍：短对话和原来一样；早就聊得很长的旧对话头一回寄（硬切、写明前面还有）；他回完以后在后台一趟一趟抄；
# 抄好以后那行小字、点开看；往后寄的是提要加原话；抄的工夫里她照常聊；另一台设备同步得到；丢掉重抄；
# 抄不成照旧寄原话、不反复试（重开了也认）；她切走了先不抄、回来接着抄；抄到一半她走了；段数多了并；照片带图；
# 三档；删对话；收漏网的提要。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_recap.py
import json, re, sys, time
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []

# 往手机本地存档里直接放几条（没上锁的那份，记成“还没传上云端”）：造一段早就聊得很长的旧对话用。放完要重开页面才读得到
SEED = """(recs) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite');
  recs.forEach((r) => tx.objectStore('kv').put({ k: r[0], v: r[1], dirty: 1, del: 0 })); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }; o.onerror = () => rej(o.error); })"""
# 一张一个点的小图，顶替照片
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
TURNS = 240   # 一段旧对话多少个来回（一个来回四百多字，一共十万字上下）
N = TURNS * 2

# 编一段旧对话：turns 个来回，她一句 her_len 字上下、他一句 his_len 字上下；photos 里写着的那几个来回，她先发一张照片再说话
def old_chat(tag, turns, her_len, his_len, photos=()):
    rows, t = [], int(time.time() * 1000) - turns * 2 * 60000 - 3600000
    for i in range(turns):
        if i in photos:
            t += 1000
            rows.append({"id": f"{tag}{i}p", "role": "her", "ts": t, "kind": "photo", "imgId": f"{tag}img{i}"})
        t += 60000
        rows.append({"id": f"{tag}{i}h", "role": "her", "ts": t, "text": f"{tag}旧话第{i}问" + "问" * her_len})
        t += 60000
        raw = f"{tag}旧话第{i}答" + "答" * his_len
        rows.append({"id": f"{tag}{i}m", "role": "him", "ts": t, "raw": raw, "items": [{"type": "text", "text": raw}], "thinking": "（旧心声）"})
    return rows

# 把一段旧对话放进存档、排在目录最前面，重开页面。extra 是顺带放进去的别的几条
def plant(page, cid, rows, title, extra=()):
    # 先等页面把手上没传完的传完（它攒一秒多才传，传完会把自己手上的那份写回本地）：不然这里直接放进本地的目录会被它盖回去
    page.wait_for_timeout(3000)
    index = json.loads(page.evaluate(KV, "kfs2:index") or "[]")
    index = [{"id": cid, "title": title, "preview": "旧的", "updatedAt": int(time.time() * 1000)}] + [c for c in index if c["id"] != cid]
    page.evaluate(SEED, [["kfs2:chat:" + cid, json.dumps(rows, ensure_ascii=False)], ["kfs2:index", json.dumps(index, ensure_ascii=False)], ["kfs2:lastChat", cid]] + [list(x) for x in extra])
    page.reload(); kite(page); page.wait_for_timeout(800)

def rule_of(c):
    system = c["body"].get("system")
    return next((b.get("text", "") for b in system if b.get("text", "").startswith(("【抄提要】", "【并提要】"))), "") if isinstance(system, list) else ""
def recap_calls(): return [c for c in calls() if rule_of(c)]
def chat_calls(): return [c for c in calls() if not rule_of(c) and not c["body"].get("ping")]
def first_texts(body): return [b["text"] for b in body["messages"][0]["content"] if b.get("type") == "text"]
def all_texts(body): return [b["text"] for m in body["messages"] for b in m["content"] if b.get("type") == "text"]
# 寄的原话里带着几张她发的照片（图在前，后面跟一行“她发了一张照片”；开头附注里的头像不算）
def photos_in(body):
    blocks = [b for m in body["messages"] for b in m["content"]]
    return sum(1 for i, b in enumerate(blocks) if b.get("type") == "image" and i + 1 < len(blocks) and blocks[i + 1].get("text") == "[她发了一张照片]")
def images_of(c): return [i for i, b in enumerate(c["body"]["messages"][0]["content"]) if b.get("type") == "image"]
def marks(body): return [(i, j, b["cache_control"]) for i, m in enumerate(body["messages"]) for j, b in enumerate(m["content"]) if "cache_control" in b]
def ask_text(c): return "\n".join(b["text"] for b in c["body"]["messages"][0]["content"] if b["type"] == "text")
def asked_rows(c): return int((re.search(r"〔要抄的原话，一共 (\d+) 条", ask_text(c)) or [0, 0])[1])
def recaps_of(page, cid): return json.loads(page.evaluate(KV, "kfs2:recap:" + cid) or "null")
def rows_on(page): return page.locator(".kfs-recap").count()
# 单子里眼下作数的那一份：抄到的那一条在这段对话里、又最靠后（和 src/recap.js 的 pickRecap 一个意思）
def live(recs, ids):
    good = [r for r in (recs or []) if isinstance(r.get("parts"), list) and r["parts"] and r.get("upto") in ids]
    return max(good, key=lambda r: ids.index(r["upto"])) if good else None
# 钟点的写法、几段连成一整份（和 src/recap.js 的 stamp、recapText 一个写法）。页面的时区是 mailkit 里定的都柏林
def local(ts): return datetime.fromtimestamp(ts / 1000, ZoneInfo(IPHONE["timezone_id"]))
def stamp(ts):
    d = local(ts)
    return f"{d.year}年{d.month}月{d.day}日 {d.hour:02d}:{d.minute:02d}"
# 从几点到几点：同一天的后头只写钟点（src/recap.js 的 stampSpan）
def stamp_span(t0, t1):
    a, b = local(t0), local(t1)
    return f"{stamp(t0)} 到 " + (f"{b.hour:02d}:{b.minute:02d}" if a.date() == b.date() else stamp(t1))
def whole(rec): return "\n\n".join(f"〔{stamp_span(p['t0'], p['t1'])}〕\n{p['text']}" for p in rec["parts"])
def piece_text(rows, first, images=0):
    return f"（测试提要）这一段一共抄了 {rows} 条。{'这是头一段。' if first else '前面已经有提要了。'}带着 {images} 张图。她说要试试新门，我说好，后来聊到周末的打算。她还问灯会几点开始，我说七点。\n\n说定的事：周末去看灯。"
# 等他一趟一趟抄到停下来（连着 quiet 秒没有新的一回）
def settle_recaps(quiet=3.5, timeout=60):
    end, n, since = time.time() + timeout, len(recap_calls()), time.time()
    while time.time() < end:
        time.sleep(0.4)
        now = len(recap_calls())
        if now != n: n, since = now, time.time()
        elif time.time() - since >= quiet: break
    return n
# 那行小字上下各是什么
AROUND = """() => { const el = document.querySelector('.kfs-recap'); if (!el) return null; const all = [...el.parentElement.children]; const i = all.indexOf(el);
  return { before: all[i - 1] ? all[i - 1].textContent : '', after: all[i + 1] ? all[i + 1].textContent : '', text: el.textContent }; }"""
# API 面板“用量”里的一行写的是什么
USAGE_ROW = """(name) => { const k = [...document.querySelectorAll('.kfs-sheet span')].find((e) => e.textContent === name); return k && k.nextElementSibling ? k.nextElementSibling.textContent : null; }"""
# 他的回话一摆出来，页面当场装作被切走（不等这头再发话过去，赶在抄提要动手之前）
HIDE_ON = """(text) => { window.__hidAt = 0; const t = setInterval(() => { if (document.body.textContent.includes(text)) { clearInterval(t); window.__away(true); window.__hidAt = Date.now(); } }, 40); }"""
# 这台设备上记的“没抄成”的那本账（见 src/recap.js 的 RECAP_BAD_KEY）；装作过了多少分钟：把账上的钟点往回拨
AGE = """(ms) => { const b = JSON.parse(localStorage.getItem('kfs-recap-bad') || '{}'); Object.values(b).forEach((x) => { x.at -= ms; }); localStorage.setItem('kfs-recap-bad', JSON.stringify(b)); }"""
def ledger(page): return json.loads(page.evaluate("localStorage.getItem('kfs-recap-bad')") or "{}")
def held(): return mock("/__debug/claude-held")["held"]
def away(page, gone): page.evaluate("(v) => window.__away(v)", gone)
def open_recap(page):
    page.locator(".kfs-recap button").scroll_into_view_if_needed()
    page.locator(".kfs-recap button").click()
    page.locator(".kfs-recap-body").wait_for(timeout=5000)
def drop_recap(page):
    page.get_by_role("button", name="抄得不对，丢掉重抄").click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="再点一次，丢掉最近抄的这一趟").click(); page.wait_for_timeout(800)
def close_sheet(page):
    page.get_by_role("button", name="关闭").click(); page.wait_for_timeout(400)
def side(page):
    page.get_by_role("button", name="打开侧栏").click(); page.wait_for_timeout(600)
def shut_side(page):
    page.locator("div.absolute.inset-0.z-30").click(); page.wait_for_timeout(600)
def open_api(page):
    side(page)
    page.get_by_text("API", exact=True).click()
    page.locator(".kfs-recall").wait_for(timeout=5000)
def close_api(page):
    close_sheet(page)
    shut_side(page)
ONE_HOUR = {"type": "ephemeral", "ttl": "1h"}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    A = browser.new_context(**IPHONE)
    A.add_init_script(STUB)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append("A: " + str(e)))
    first_time(pa)

    # ================= 短对话：和原来一样 =================
    chat(pa, "头一句")
    body = chat_calls()[-1]["body"]
    ok(not any("前情提要】这段对话" in t or "没有寄来" in t for t in all_texts(body)) and first_texts(body)[0].startswith("【开封府附注】") and "【前情提要】\n一段对话聊长了" in body["system"][0]["text"],
       "短对话：寄的和原来一样，开头没有多出来的话；名帖后面的规矩里有【前情提要】那一段")
    ok([m[2] for m in marks(body)] == [ONE_HOUR], "头一句话：对话上只有一个缓存记号，留一小时")
    chat(pa, "第二句")
    body2 = chat_calls()[-1]["body"]
    mk = marks(body2)
    ok(len(mk) == 2 and all(m[2] == ONE_HOUR for m in mk) and body2["messages"][mk[0][0]]["content"][mk[0][1]]["text"] == "头一句" and body2["messages"][mk[1][0]]["content"][mk[1][1]]["text"] == "第二句",
       "第二句话：两个记号，前一个正落在上一回放记号的那一句上")
    pa.wait_for_timeout(2500)
    ok(len(recap_calls()) == 0 and rows_on(pa) == 0 and ledger(pa) == {}, "短对话：他回完了不去抄提要，聊天记录里没有那行小字")

    # ================= 早就聊得很长的旧对话 =================
    OLD = old_chat("甲", TURNS, 100, 300)   # 四百八十条，十万字上下
    ids = [m["id"] for m in OLD]
    plant(pa, "old-chat-1", OLD, "旧的长对话")
    ok(pa.get_by_text(f"甲旧话第{TURNS - 1}答", exact=False).count() >= 1 and rows_on(pa) == 0, "旧对话读出来了（四百八十条），还没抄过提要")
    n0 = len(chat_calls())
    chat(pa, "还记得前面聊的吗")
    body = chat_calls()[-1]["body"]
    note = next((t for t in first_texts(body) if "没有寄来" in t), "")
    cut = int((re.search(r"这段对话前面还有 (\d+) 条", note) or [0, 0])[1])
    sent_old = [t for t in all_texts(body) if t.startswith("甲旧话第")]
    ok(len(chat_calls()) == n0 + 1 and note.startswith("【开封府附注】这段对话前面还有") and "这不是新开的对话" in note and "照实说那一段没寄到" in note and 40 < cut < N - 200,
       f"旧对话头一回寄：开头写明前面还有 {cut} 条没寄来、这不是新开的对话、提起时照实说")
    ok(len(sent_old) == N - cut and sent_old[0].startswith(OLD[cut]["text"][:8]) and not any(t.startswith("甲旧话第0问") for t in sent_old) and any(t.startswith(f"甲旧话第{TURNS - 1}答") for t in sent_old) and len(sent_old) > 200,
       f"切口之后的 {len(sent_old)} 条原话照寄（原来只寄最后二三十条），切口之前的不寄")
    ok(first_texts(body).index(note) < first_texts(body).index("【附注结束，以下是对话】"), "那句话写在开头的附注里，排在“附注结束”前面")

    # 他回完了：在后台一趟一趟抄，一趟一段，一回话最多连抄四趟
    ok(wait_mock(lambda: len(recap_calls()) == 4, 40), "他回完以后，开封府在后台叫他把前面的抄成提要：一趟抄一小段，接连抄了四趟")
    pa.wait_for_timeout(3500)
    rcs = recap_calls()
    asked = [asked_rows(c) for c in rcs]
    ok(len(rcs) == 4 and all(60 < a < 100 for a in asked) and sum(asked) < N - 100, f"四趟为止，这一回话不再多抄（各抄了 {asked} 条，后面的等他下回回完话）")
    ok(all(c["via"] == "claude" and c["body"]["system"][0].get("cache_control") == ONE_HOUR and c["body"]["system"][0]["text"] == body["system"][0]["text"] and rule_of(c).startswith("【抄提要】") and c["body"]["max_tokens"] == 4000
           and c["body"]["model"] == body["model"] and "mcp_servers" not in c["body"] and len(c["body"]["messages"]) == 1 and ask_text(c).rstrip().endswith("抄吧。") and "最长不超过 900 字" in rule_of(c) for c in rcs),
       "抄的每一趟：走的是写日记那条路；名帖那一大段和聊天时寄的一个字不差（缓存接得上），后面跟【抄提要】的规矩；用眼下选的模型，不带工具")
    t1 = ask_text(rcs[0])
    ok("〔前面已经抄好的提要" not in t1 and "卿卿：甲旧话第0问" in t1 and "光义：甲旧话第0答" in t1 and "甲：" not in t1 and f"光义：{OLD[asked[0] - 1]['raw'][:9]}" in t1 and f"卿卿：{OLD[asked[0]]['text'][:9]}" not in t1,
       f"头一趟：从头一条抄起（不是从硬切的地方），抄了 {asked[0]} 条，一条一条写着谁说的，抄到他的一条回话为止")
    off = 0
    chained = True
    for k in range(1, 4):
        off += asked[k - 1]
        tk = ask_text(rcs[k])
        todo = tk[tk.index("〔要抄的原话"):]
        if not (tk.startswith("〔前面已经抄好的提要，只给你对照，不用重抄〕\n") and piece_text(asked[0], True) in tk[:tk.index("〔要抄的原话")] and f"卿卿：{OLD[off]['text'][:9]}" in todo and f"光义：{OLD[off - 1]['raw'][:9]}" not in todo):
            chained = False
    ok(chained, "后面三趟：每一趟接着上一趟抄到的下一条往后抄，前面抄好的几段带着给他对照，原话不重寄")

    ok(wait_js(pa, "document.querySelectorAll('.kfs-recap').length === 1", 15000), "抄好了：聊天记录里多了一行小字（抄了四趟也只有一行）")
    recs = recaps_of(pa, "old-chat-1") or []
    rec = live(recs, ids)
    ok(len(recs) == 4 and sorted(len(r["parts"]) for r in recs) == [1, 2, 3, 4] and rec and len(rec["parts"]) == 4 and all("text" not in r for r in recs),
       "提要另存了一条（一个单子）：四趟各留一份，作数的是抄得最靠后的那一份，里面四段")
    ok(rec["n"] == sum(asked) and rec["upto"] == ids[rec["n"] - 1] and rec["upto"].endswith("m") and [x["rows"] for x in rec["parts"]] == asked and rec["more"] is True and rec["model"] == "claude-sonnet-4-6" and rec["ts"] == OLD[rec["n"] - 1]["ts"],
       f"那一份记着：抄到第 {rec['n']} 条（他的一条回话）为止，每段抄了几条，还没抄完")
    ok([x["text"] for x in rec["parts"]] == [piece_text(a, k == 0) for k, a in enumerate(asked)] and rec["parts"][0]["t0"] == OLD[0]["ts"] and rec["parts"][0]["t1"] == OLD[asked[0] - 1]["ts"] and rec["parts"][1]["t0"] == OLD[asked[0]]["ts"],
       "存下来的每一段：他顺手写的心里话、聊天的记号都清掉了；记着这一段抄的是几点到几点的原话")
    stored = chat_by(pa, "old-chat-1")
    ok(len(stored) == N + 2 and [m["id"] for m in stored[:N]] == ids and not any(m.get("role") not in ("her", "him", "event") for m in stored), "对话那一串消息一个字没动，里面没添新东西")
    pos = pa.evaluate(AROUND)
    ok(pos["text"] == "这以前的，他抄成了提要" and OLD[rec["n"] - 1]["raw"][:8] in pos["before"] and OLD[rec["n"]]["text"][:8] in pos["after"], "那行小字摆在抄到的那一条后面、留下的头一句前面")

    # API 面板：最后一回问的是抄提要，“上一条”那几行还得是她上一句话的
    open_api(pa)
    ok(pa.get_by_text("上一回抄提要").is_visible() and pa.evaluate(USAGE_ROW, "新读") == "60" and pa.evaluate(USAGE_ROW, "从缓存读") == "0" and pa.evaluate(USAGE_ROW, "写进缓存") == "9,000" and pa.locator(".kfs-no-cache").count() == 0,
       "API 面板：多一行“上一回抄提要”花了多少；“上一条”那几行还是她上一句话的（没被抄提要的那一回顶掉）")
    close_api(pa)

    # 点开看
    open_recap(pa)
    about = pa.locator(".kfs-recap-about").inner_text()
    meta = pa.locator(".kfs-recap-meta").inner_text()
    ok(pa.locator(".kfs-recap-body").inner_text() == whole(rec) and f"这一行以前的 {rec['n']} 条原话" in about and "原话都还在你这儿" in about and pa.get_by_text("前情提要", exact=True).is_visible(),
       "点那行小字：面板里是他抄的那几段（每段前面写着几点到几点），写明这以前多少条不再寄原话")
    ok("4 段" in meta and "还没抄完，他回完话接着抄" in meta and meta.startswith("抄到 "), "面板里写着：抄到什么时候、几段、多少字、还没抄完")
    close_sheet(pa)
    ok(pa.locator(".kfs-recap-body").count() == 0, "关掉面板")

    # 往后寄的：提要加原话。这一句回完会接着抄第五趟：先压着不让它答，看抄的工夫里的样子
    mock("/__debug/claude-hold?ms=90000&kind=recap")
    chat(pa, "那周末的事呢")
    body = chat_calls()[-1]["body"]
    ft = first_texts(body)
    rc_block = next((t for t in ft if t.startswith("【前情提要】")), "")
    sent_old = [t for t in all_texts(body) if t.startswith("甲旧话第")]
    ok(rc_block == f"【前情提要】这段对话聊得很长了，头 {rec['n']} 条的原话没有再寄，换成了你自己一段一段抄的提要，抄到 {stamp(rec['ts'])} 为止：\n{whole(rec)}\n【提要结束】" and not any("没有寄来" in t or "重着" in t for t in ft),
       "抄好以后的下一句：第一条里是【前情提要】，写明头多少条换成了他自己抄的、抄到几点，夹着那几段；不再有“没寄来”那句")
    ok(len(sent_old) == N - rec["n"] and sent_old[0].startswith(OLD[rec["n"]]["text"][:8]) and ft[ft.index("【附注结束，以下是对话】") + 1].startswith(OLD[rec["n"]]["text"][:8]) and any("还记得前面聊的吗" in t for t in all_texts(body)),
       f"提要后面紧接着它之后的 {len(sent_old)} 条原话，和这之后新说的（提要还没抄到的，一条没少寄）")
    ok(len(marks(body)) == 2 and all(m[2] == ONE_HOUR for m in marks(body)), "有提要的时候缓存记号照样两个")
    ok(wait_mock(held, 15) and len(recap_calls()) == 4, "他回完了：接着去抄第五趟（这一趟压着，还没答）")
    c0 = len(chat_calls())
    chat(pa, "抄的工夫里再说一句")
    body = chat_calls()[-1]["body"]
    ok(len(chat_calls()) == c0 + 1 and any(t.startswith(f"【前情提要】这段对话聊得很长了，头 {rec['n']} 条") for t in first_texts(body)) and not pa.evaluate(TYPING) and held(),
       "抄的工夫里她照常说话：不用等，寄的还是上一份提要加原话，顶上也不显示“正在输入”")
    open_recap(pa)
    ok("4 段" in pa.locator(".kfs-recap-meta").inner_text(), "这时候点开看：还是四段的那一份")
    mock("/__debug/claude-release")
    ok(wait_js(pa, "(() => { const m = document.querySelector('.kfs-recap-meta'); return !!m && m.textContent.includes('5 段'); })()", 15000), "面板开着的工夫里第五趟抄完了：面板自己换成新的那一份（五段）")
    recs = recaps_of(pa, "old-chat-1") or []
    rec2 = live(recs, ids)
    kept = N - rec2["n"]
    meta = pa.locator(".kfs-recap-meta").inner_text()
    ok(len(recap_calls()) == 5 and len(rec2["parts"]) == 5 and rec2["more"] is False and rec2["n"] == rec["n"] + asked_rows(recap_calls()[-1]) and "还没抄完" not in meta and pa.locator(".kfs-recap-body").inner_text() == whole(rec2),
       f"第五趟接着第四趟抄到头了：一共抄到第 {rec2['n']} 条，不再记着“还没抄完”")
    ok(60 <= kept <= 110, f"最近的 {kept} 条旧话（一万五千字上下）留着原话没抄")
    close_sheet(pa)
    pos = pa.evaluate(AROUND)
    ok(rows_on(pa) == 1 and OLD[rec2["n"] - 1]["raw"][:8] in pos["before"] and OLD[rec2["n"]]["text"][:8] in pos["after"], "那行小字还是只有一行，挪到了新抄到的地方")

    r0 = len(recap_calls())
    chat(pa, "再接一句")
    body = chat_calls()[-1]["body"]
    sent_old = [t for t in all_texts(body) if t.startswith("甲旧话第")]
    ok(any(t.startswith(f"【前情提要】这段对话聊得很长了，头 {rec2['n']} 条") and whole(rec2) in t for t in first_texts(body)) and len(sent_old) == kept, f"再说一句：寄的是五段的提要，加留下的那 {kept} 条和之后新说的")
    pa.wait_for_timeout(3500)
    ok(len(recap_calls()) == r0 and rows_on(pa) == 1, "抄到头了：他再回完一句，不会又去抄")
    prev_plain = [json.dumps({k: v for k, v in b.items() if k != "cache_control"}, ensure_ascii=False) for m in body["messages"] for b in m["content"]][:-1]
    chat(pa, "又接一句")
    body = chat_calls()[-1]["body"]
    now_flat = [json.dumps({k: v for k, v in b.items() if k != "cache_control"}, ensure_ascii=False) for m in body["messages"] for b in m["content"]]
    ok(len(prev_plain) > kept and now_flat[:len(prev_plain)] == prev_plain, "接着聊：上一回寄的那一整段（去掉【此刻】）原封不动是这一回的开头，缓存接得上")

    # 重新回答：提要照用
    c0 = len(chat_calls())
    pa.get_by_text("重新回答").last.click()
    ok(wait_mock(lambda: len(chat_calls()) == c0 + 1, 20), "点重新回答：又问了一回")
    pa.wait_for_timeout(3500)
    body = chat_calls()[-1]["body"]
    ok(any(t.startswith(f"【前情提要】这段对话聊得很长了，头 {rec2['n']} 条") for t in first_texts(body)) and rows_on(pa) == 1 and len(recap_calls()) == r0, "重新回答的那一回：提要照用，那行小字还在，也不为它再抄一趟")

    # API 面板：三档
    open_api(pa)
    note_text = lambda: pa.locator(".kfs-recall-note").inner_text()
    ok(pa.locator(".kfs-recall").get_attribute("data-recall") == "mid" and pa.get_by_text("他记多长").is_visible() and re.search("攒到大约 5.0 万字.*最近 1.5 万字上下留原话", note_text()) and "屋子小" not in note_text(),
       "API 面板：“他记多长”三档，没选过是适中（攒到五万字抄一回，最近一万五千字留原话）")
    pa.locator(".kfs-recall button", has_text="短").click(); pa.wait_for_timeout(500)
    ok(pa.locator(".kfs-recall").get_attribute("data-recall") == "short" and json.loads(pa.evaluate(KV, "kfs2:settings")).get("recall") == "short" and re.search("攒到大约 2.0 万字.*最近 6000 字上下留原话", note_text())
       and pa.locator(".kfs-recall button", has_text="短").get_attribute("aria-pressed") == "true",
       "拨到“短”：记进设置里（跟着云端走），底下那句话跟着换数")
    pa.locator(".kfs-recall button", has_text="适中").click(); pa.wait_for_timeout(500)
    ok(json.loads(pa.evaluate(KV, "kfs2:settings")).get("recall") == "mid" and json.loads(pa.evaluate(KV, "kfs2:settings")).get("maxTokens") == 2048, "拨回“适中”；“回复最长多少”那一组没被带着动")
    length = pa.get_by_role("group", name="回复最长多少")
    length.get_by_role("button", name="长", exact=True).click(); pa.wait_for_timeout(500)
    st = json.loads(pa.evaluate(KV, "kfs2:settings"))
    ok(st.get("maxTokens") == 4096 and st.get("recall") == "mid" and length.get_by_role("button", name="长", exact=True).get_attribute("aria-pressed") == "true" and pa.locator(".kfs-recall").get_attribute("data-recall") == "mid",
       "“回复最长多少”那一组（和三档是同一种滑块）照常能拨，拨它不带着“他记多长”动")
    length.get_by_role("button", name="适中", exact=True).click(); pa.wait_for_timeout(500)
    ok(json.loads(pa.evaluate(KV, "kfs2:settings")).get("maxTokens") == 2048, "拨回去")
    close_api(pa)
    # 换成屋子小的模型：那一档的数跟着缩，面板里照实写
    pa.get_by_role("button", name=re.compile("^Sonnet 4.6")).click()
    pa.get_by_text("选择模型", exact=True).wait_for(timeout=5000)
    pa.get_by_role("button", name=re.compile("^Haiku 4.5")).click(); pa.wait_for_timeout(600)
    open_api(pa)
    small = re.search(r"攒到大约 ([\d.]+) 万字", note_text())
    ok(small and 2.0 < float(small[1]) < 5.0 and "眼下用的 Haiku 4.5 屋子小，这一档到不了 5.0 万字" in note_text(), f"换成 Haiku 4.5（屋子只有二十万）：适中那一档缩成攒到 {small and small[1]} 万字就抄，面板里写明了")
    close_api(pa)
    pa.get_by_role("button", name=re.compile("^Haiku 4.5")).click()
    pa.get_by_text("选择模型", exact=True).wait_for(timeout=5000)
    pa.get_by_role("button", name=re.compile("^Sonnet 4.6")).click(); pa.wait_for_timeout(600)
    ok(json.loads(pa.evaluate(KV, "kfs2:settings")).get("model") == "claude-sonnet-4-6", "换回 Sonnet 4.6")

    # ================= 另一台设备 =================
    pa.wait_for_timeout(3500)   # 等这头传上云端
    B = browser.new_context(**IPHONE)
    B.add_init_script(STUB)
    pb = B.new_page()
    pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
    second_device(pb)
    if last_chat(pb) != "old-chat-1":
        side(pb)
        pb.get_by_text("旧的长对话").first.click(); pb.wait_for_timeout(1200)
    ok(wait_js(pb, "document.querySelectorAll('.kfs-recap').length === 1", 15000) and (live(recaps_of(pb, "old-chat-1"), ids) or {}).get("id") == rec2["id"], "另一台设备：提要跟着云端同步过来了，那行小字也在")
    chat(pb, "换了台设备问")
    body = chat_calls()[-1]["body"]
    ok(any(t.startswith(f"【前情提要】这段对话聊得很长了，头 {rec2['n']} 条") and whole(rec2) in t for t in first_texts(body)), "在另一台设备上说话：寄的也是提要加原话")
    cloud = mock("/__debug/rows")
    ok(not any("测试提要" in json.dumps(r, ensure_ascii=False) or "recap" in r["key"] for r in cloud) and all(r["value"].startswith("v1.") for r in cloud if r["key"].startswith("h_")), "云端的提要也是乱码：搜不到正文，钥匙名看不出是什么")

    # 抄得不对：丢掉最近抄的这一趟（在头一台上丢，另一台开着这段对话，同步以后跟着变）
    open_recap(pa)
    pa.get_by_role("button", name="抄得不对，丢掉重抄").click(); pa.wait_for_timeout(300)
    ok(pa.get_by_role("button", name="再点一次，丢掉最近抄的这一趟").is_visible() and len(recaps_of(pa, "old-chat-1")) == 5, "点“抄得不对，丢掉重抄”：先问一声，还没丢")
    pa.get_by_role("button", name="再点一次，丢掉最近抄的这一趟").click(); pa.wait_for_timeout(800)
    recs = recaps_of(pa, "old-chat-1") or []
    back = live(recs, ids)
    pos = pa.evaluate(AROUND)
    ok(pa.locator(".kfs-recap-body").count() == 0 and len(recs) == 4 and back["id"] == rec["id"] and rows_on(pa) == 1 and OLD[rec["n"] - 1]["raw"][:8] in pos["before"] and pa.get_by_text("丢掉了，他下回回完话会重抄").count() == 1,
       "再点一次：最近抄的那一趟丢掉了，作数的退回上一份（四段），那行小字挪回去；原话一条不动")
    ok(len(chat_by(pa, "old-chat-1")) >= N + 2, "对话还是那些")
    pa.wait_for_timeout(3500)   # 等这头传上云端
    side(pb)
    pb.get_by_role("button", name="头像与设置").click(); pb.wait_for_timeout(500)
    pb.get_by_role("button", name=re.compile("现在同步")).click()
    ok(wait_js(pb, f"(() => {{ const el = document.querySelector('.kfs-recap'); const all = el ? [...el.parentElement.children] : []; const i = all.indexOf(el); return i > 0 && all[i - 1].textContent.includes({json.dumps(OLD[rec['n'] - 1]['raw'][:8], ensure_ascii=False)}); }})()", 15000),
       "另一台设备正开着这段对话：同步下来以后，那行小字当场跟着挪回去（不用重开）")
    B.close()
    # 他下回回完话：把丢掉的那一趟重抄。重抄的这一趟还在路上，她又把上一份也丢了：路上这一趟是接着那一份抄的，不能把丢掉的带回来
    mock("/__debug/claude-hold?ms=90000&kind=recap")
    r0 = len(recap_calls())
    chat(pa, "丢掉以后再说一句")
    ok(wait_mock(held, 15), "他再回完一句：去重抄丢掉的那一趟（这一趟压着，还没答）")
    open_recap(pa)
    drop_recap(pa)
    recs = recaps_of(pa, "old-chat-1") or []
    three = live(recs, ids)
    ok(len(recs) == 3 and three and len(three["parts"]) == 3 and held(), "重抄的那一趟还在路上，她又丢了一回：作数的退到三段的那一份")
    mock("/__debug/claude-release")
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 1, 15), "路上的那一趟答回来了")
    pa.wait_for_timeout(2500)
    recs = recaps_of(pa, "old-chat-1") or []
    pos = pa.evaluate(AROUND)
    ok(len(recs) == 3 and live(recs, ids)["id"] == three["id"] and not any(len(r["parts"]) > 3 for r in recs) and rows_on(pa) == 1 and OLD[three["n"] - 1]["raw"][:8] in pos["before"] and len(recap_calls()) == r0 + 1 and ledger(pa) == {},
       "答回来的那一趟不存（它接着的那一份已经丢了，存了的话丢掉的那几段又回来了）；也不算没抄成")
    r0 = len(recap_calls())
    chat(pa, "这回好好抄")
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 2, 30), "他再回完一句：从三段的那一份接着抄（两趟）")
    pa.wait_for_timeout(3500)
    again = live(recaps_of(pa, "old-chat-1"), ids)
    ok(len(recap_calls()) == r0 + 2 and again and again["id"] not in (rec["id"], rec2["id"]) and len(again["parts"]) == 5 and again["n"] >= rec2["n"] and again["more"] is False and rows_on(pa) == 1, "重抄出来又是五段，那行小字回到抄到头的地方")

    # ================= 抄不成：照旧寄原话，隔一阵再试 =================
    mock("/__debug/claude-fail?kind=recap")
    OLD2 = old_chat("乙", TURNS, 100, 300)
    ids2 = [m["id"] for m in OLD2]
    plant(pa, "old-chat-2", OLD2, "第二段旧对话")
    r0 = len(recap_calls())
    chat(pa, "这段也很长")
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 1, 15), "那边这会儿太挤：抄提要的那一回照样去问了")
    pa.wait_for_timeout(3000)
    ok(len(recap_calls()) == r0 + 1 and rows_on(pa) == 0 and recaps_of(pa, "old-chat-2") is None and note_count(pa) == 0 and not pa.evaluate(TYPING), "没抄成：不存、不出那行小字，也不报错、不显示“正在输入”，也不接着试下一趟")
    ok((ledger(pa).get("old-chat-2") or {}).get("times") == 1, "这台设备上记了一笔：这段对话没抄成一回")
    chat(pa, "再说一句")
    body = chat_calls()[-1]["body"]
    ok(any("没有寄来" in t and "这不是新开的对话" in t for t in first_texts(body)) and any(t.startswith(f"乙旧话第{TURNS - 1}答") for t in all_texts(body)), "没抄成的时候照旧寄原话，开头照旧写着前面还有多少条没寄来；她说话不受影响")
    mock("/__debug/claude-fail")
    chat(pa, "第三句")
    pa.wait_for_timeout(3000)
    ok(len(recap_calls()) == r0 + 1 and rows_on(pa) == 0, "那边好了，他又回完两句：十分钟里不再试（每试一回都要花钱）")
    # 划掉重开：那笔账记在设备上，重开了也认
    pa.reload(); kite(pa); pa.wait_for_timeout(800)
    chat(pa, "重开以后再问")
    pa.wait_for_timeout(3000)
    ok(len(recap_calls()) == r0 + 1 and rows_on(pa) == 0 and (ledger(pa).get("old-chat-2") or {}).get("times") == 1, "划掉重开以后他再回完一句：还在那十分钟里，照样不试（不是每开一回试一回）")
    # 过了十分钟：他再回完一句就再试。这一回他刚回完她就切走了：先不抄，回到眼前再接着抄
    pa.evaluate(AGE, 11 * 60000)
    pa.reload(); kite(pa); pa.wait_for_timeout(800)
    pa.evaluate(HIDE_ON, "收到：说完就切走")
    say(pa, "说完就切走")
    ok(wait_js(pa, "window.__hidAt > 0", 20000), "过了十分钟。他的回话刚到，她就切走了")
    pa.wait_for_timeout(5000)
    ok(len(recap_calls()) == r0 + 1 and recaps_of(pa, "old-chat-2") is None, "她不在眼前：先不抄（这头随时会断，白花一回钱）")
    away(pa, False)
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 5, 40) and wait_js(pa, "document.querySelectorAll('.kfs-recap').length === 1", 15000), "她回到眼前：歇一下接着抄，这回抄成了（连抄四趟）")
    pa.wait_for_timeout(1500)
    rec2b = live(recaps_of(pa, "old-chat-2"), ids2)
    ok(rec2b and rec2b["upto"].startswith("乙") and len(rec2b["parts"]) == 4 and rec2b["more"] is True and note_count(pa) == 0 and "old-chat-2" not in ledger(pa), "第二段对话也有了自己的提要；抄成了，账上那一笔清掉")

    # 抄到一半她切走了、这一回断了：头一回不算没抄成；连着两回都这样，照没抄成记
    mock("/__debug/claude-hold?ms=90000&kind=recap")
    r0 = len(recap_calls())
    chat(pa, "这一趟抄到一半她走了")
    ok(wait_mock(held, 15), "他回完了：去抄第五趟（压着）")
    away(pa, True)
    mock("/__debug/claude-fail?kind=recap")
    mock("/__debug/claude-release")
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 1, 15), "抄的工夫里她切走了，这一回没成")
    pa.wait_for_timeout(1500)
    led = ledger(pa).get("old-chat-2") or {}
    ok(led.get("times") == 0 and led.get("away") == 1 and live(recaps_of(pa, "old-chat-2"), ids2)["id"] == rec2b["id"], "她切走才断的：头一回不算没抄成（账上只记“切走过一回”），提要还是原来那一份")
    mock("/__debug/claude-fail")
    away(pa, False)
    pa.wait_for_timeout(4000)
    ok(len(recap_calls()) == r0 + 1, "她回来了：不自己再试，等他下回回完话")
    mock("/__debug/claude-hold?ms=90000&kind=recap")
    chat(pa, "又是抄到一半走了")
    ok(wait_mock(held, 15), "他又回完一句：再试（没在等那十分钟）")
    away(pa, True)
    mock("/__debug/claude-fail?kind=recap")
    mock("/__debug/claude-release")
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 2, 15), "这一回又是她切走的工夫里断的")
    pa.wait_for_timeout(1500)
    led = ledger(pa).get("old-chat-2") or {}
    ok(led.get("times") == 1 and led.get("away") == 0, "连着两回都这样：照没抄成记一回（回回看一眼就走的话，不回回白问一趟）")
    mock("/__debug/claude-fail")
    away(pa, False)
    chat(pa, "这回她在")
    pa.wait_for_timeout(3500)
    ok(len(recap_calls()) == r0 + 2 and note_count(pa) == 0, "他再回完一句：十分钟里不再试；她说话照常")

    # 写到上限被截断的不要
    mock("/__debug/claude-fail?kind=recap-cut")
    OLD3 = old_chat("丙", TURNS, 100, 300)
    ids3 = [m["id"] for m in OLD3]
    plant(pa, "old-chat-3", OLD3, "第三段旧对话")
    r0 = len(recap_calls())
    chat(pa, "这一段呢")
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 1, 15), "抄提要的那一回去问了（这一回他写到上限被截断）")
    pa.wait_for_timeout(3000)
    ok(len(recap_calls()) == r0 + 1 and rows_on(pa) == 0 and recaps_of(pa, "old-chat-3") is None and (ledger(pa).get("old-chat-3") or {}).get("times") == 1, "写到上限被截断的那份不要：断掉的正是最后那几样")
    mock("/__debug/claude-fail")
    # 过了十分钟再试。抄成头一趟的时候她已经切走了：这一趟留着，剩下的等她回来接着抄
    pa.evaluate(AGE, 11 * 60000)
    pa.reload(); kite(pa); pa.wait_for_timeout(800)
    mock("/__debug/claude-hold?ms=90000&kind=recap")
    r0 = len(recap_calls())
    chat(pa, "过了十分钟再问")
    ok(wait_mock(held, 15), "过了十分钟他再回完一句：再试（头一趟压着）")
    away(pa, True)
    mock("/__debug/claude-release")
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 1, 15), "头一趟答回来的时候她已经切走了")
    pa.wait_for_timeout(4500)
    recs = recaps_of(pa, "old-chat-3") or []
    ok(len(recap_calls()) == r0 + 1 and len(recs) == 1 and len(recs[0]["parts"]) == 1 and recs[0]["more"] is True and "old-chat-3" not in ledger(pa), "抄成的这一趟照存（账上那一笔清掉）；她不在，不接着抄下一趟")
    away(pa, False)
    ok(wait_mock(lambda: len(recap_calls()) == r0 + 5, 40), "她回到眼前：接着抄剩下的（又四趟）")
    pa.wait_for_timeout(3500)
    rec3 = live(recaps_of(pa, "old-chat-3"), ids3)
    ok(len(recap_calls()) == r0 + 5 and rec3 and rec3["upto"].startswith("丙") and "这是头一段" in rec3["parts"][0]["text"] and len(rec3["parts"]) == 5 and rec3["more"] is False and rows_on(pa) == 1, "第三段对话抄到头了：五段")

    # 翻到别的对话：各是各的（侧栏里只列最近两段：第三段、第二段）
    side(pa)
    pa.get_by_text("第二段旧对话").first.click(); pa.wait_for_timeout(1500)
    pos = pa.evaluate(AROUND)
    ok(last_chat(pa) == "old-chat-2" and rows_on(pa) == 1 and OLD2[rec2b["n"] - 1]["raw"][:8] in pos["before"], "翻到第二段：摆的是它自己的那行小字")
    side(pa)
    pa.get_by_text("第三段旧对话").first.click(); pa.wait_for_timeout(1500)
    pos = pa.evaluate(AROUND)
    ok(last_chat(pa) == "old-chat-3" and rows_on(pa) == 1 and OLD3[rec3["n"] - 1]["raw"][:8] in pos["before"], "翻回第三段：摆的是它自己的那行小字")

    # ================= 删对话：提要跟着删 =================
    side(pa)
    pa.get_by_role("button", name="头像与设置").click(); pa.wait_for_timeout(500)
    pa.get_by_role("button", name="删掉当前这段对话").click()
    pa.get_by_role("button", name="再点一次，删掉这段对话").click()
    pa.wait_for_timeout(1200)
    ok(recaps_of(pa, "old-chat-3") is None and pa.evaluate(KV, "kfs2:chat:old-chat-3") is None and recaps_of(pa, "old-chat-1") is not None and recaps_of(pa, "old-chat-2") is not None, "删掉第三段对话：它的提要跟着删了，别的对话的不动")

    # ================= 段数多了并；照片带图；提要没追上的那一截写明；不在眼前的对话也抄 =================
    PHOTO_TURNS = (250, 251, 252, 253, 254, 255)
    OLD4 = old_chat("丁", 400, 100, 300, photos=PHOTO_TURNS)   # 八百零六条；第 501 条往后有六张照片
    ids4 = [m["id"] for m in OLD4]
    at400 = ids4.index("丁199m")   # 种下的提要抄到这一条（第 400 条，他的一条回话）
    now_ms = int(time.time() * 1000)
    span = lambda k: (k * 24, k * 24 + 23) if k < 16 else (384, at400)   # 种下的第 k 段管的是哪几条
    planted = {"id": "planted", "upto": ids4[at400], "more": False, "at": now_ms - 3 * 3600000, "ts": OLD4[at400]["ts"], "n": at400 + 1, "model": "claude-sonnet-4-6",
               "parts": [{"text": f"（种下的第{k + 1}段）" + "旧" * 70, "t0": OLD4[span(k)[0]]["ts"], "t1": OLD4[span(k)[1]]["ts"], "rows": span(k)[1] - span(k)[0] + 1} for k in range(17)]}
    broken = {"id": "broken", "upto": ids4[699], "text": "没分段的一整份（不是这一版的写法）", "at": now_ms, "ts": OLD4[699]["ts"], "n": 700}
    plant(pa, "old-chat-4", OLD4, "第四段旧对话", extra=[("kfs2:recap:old-chat-4", json.dumps([planted, broken], ensure_ascii=False))] + [(f"kfs2:img:丁img{i}", PNG) for i in PHOTO_TURNS])
    pos = pa.evaluate(AROUND)
    ok(rows_on(pa) == 1 and OLD4[at400]["raw"][:8] in pos["before"] and pa.locator("img[src^='data:image/png']").count() >= 6, "第四段旧对话：有一份十七段的提要（抄到第 400 条），后面有六张照片；单子里那份不成样子的不认")
    # 作数的只有这一份：点“丢掉重抄”，面板里照实写丢的是整份（只看字，不真丢）
    open_recap(pa)
    pa.get_by_role("button", name="抄得不对，丢掉重抄").click(); pa.wait_for_timeout(300)
    ok("17 段" in pa.locator(".kfs-recap-meta").inner_text() and "丢的是整份提要" in pa.locator(".kfs-recap-drop-note").inner_text() and pa.get_by_role("button", name="再点一次，整份丢掉从头抄").is_visible(),
       "前面没有留着更早的一份的时候点“丢掉重抄”：面板里写明丢的是整份")
    close_sheet(pa)
    ok(len(recaps_of(pa, "old-chat-4")) == 2 and rows_on(pa) == 1, "没点第二下就关了面板：没丢")
    # 换成自己会先想一阵的模型（Sonnet 5.5）：下面抄的那几趟，上限得放宽（想的那些字也算在上限里）
    pa.get_by_role("button", name=re.compile("^Sonnet 4.6")).click()
    pa.get_by_text("选择模型", exact=True).wait_for(timeout=5000)
    pa.get_by_role("button", name=re.compile("^Sonnet 5.5")).click(); pa.wait_for_timeout(600)
    ok(json.loads(pa.evaluate(KV, "kfs2:settings")).get("model") == "claude-sonnet-5-5", "换成 Sonnet 5.5")
    # 她说完一句就翻到别的对话去了：回话到的时候这段对话不在眼前
    r0, c0 = len(recap_calls()), len(chat_calls())
    mock("/__debug/claude-hold?ms=90000")
    say(pa, "丁这段接着聊")
    ok(wait_mock(held, 20), "她说了一句（回话压着还没到）")
    side(pa)
    pa.get_by_text("第二段旧对话").first.click(); pa.wait_for_timeout(1500)
    ok(last_chat(pa) == "old-chat-2", "翻到第二段对话去了")
    mock("/__debug/claude-release")
    ok(wait_mock(lambda: len(chat_calls()) == c0 + 1, 20), "回话到了")
    body = chat_calls()[-1]["body"]
    ft = first_texts(body)
    gap_note = next((t for t in ft if "提要之后还有" in t), "")
    gap = int((re.search(r"提要之后还有 (\d+) 条这一回没有寄来", gap_note) or [0, 0])[1])
    ok(any(t.startswith(f"【前情提要】这段对话聊得很长了，头 {at400 + 1} 条的原话没有再寄") and t.endswith(whole(planted) + "\n【提要结束】") for t in ft) and gap_note == f"【开封府附注】提要之后还有 {gap} 条这一回没有寄来，提要也还没抄到那儿，那一段说了什么你现在看不到。" and 20 < gap < 200,
       f"提要抄到第 400 条、它后面攒得太厚：提要照寄，后面最老的 {gap} 条这一回先不寄，照实写明")
    ok(not any(t.startswith(OLD4[at400 + 1]["text"][:9]) for t in all_texts(body)) and any(t.startswith("丁旧话第399答") for t in all_texts(body)) and ft.index(gap_note) < ft.index("【附注结束，以下是对话】") and photos_in(body) == 6,
       "没寄的那一截确实没寄，最近的照寄；这一回寄的原话里带着那六张照片的图")
    total = settle_recaps()
    new = recap_calls()[r0:]
    merges = [c for c in new if rule_of(c).startswith("【并提要】")]
    pieces = [c for c in new if rule_of(c).startswith("【抄提要】")]
    ok(total - r0 == len(new) == 4 and len(merges) == 1 and new[0] is merges[0] and len(pieces) == 3, f"回话到了以后（这段对话不在眼前）照样抄：先并（十七段太多了），再接着抄了 {len(pieces)} 趟")
    mt = ask_text(merges[0])
    ok("把最早的 9 段并成一段" in rule_of(merges[0]) and "最长不超过 1200 字" in rule_of(merges[0]) and mt.startswith("〔要并的几段提要〕\n〔") and all(f"（种下的第{k}段）" in mt for k in range(1, 10)) and "（种下的第10段）" not in mt and "卿卿：" not in mt and mt.rstrip().endswith("并吧。"),
       "并的那一趟：寄去的是最早的九段，不带后面八段，也不带原话")
    ok(body["model"] == "claude-sonnet-5-5" and all(c["body"]["model"] == "claude-sonnet-5-5" and c["body"]["max_tokens"] == 8000 and "output_config" not in c["body"] and "thinking" not in c["body"] and c["body"]["system"][0] == body["system"][0] for c in new),
       "自己会先想一阵的模型：抄的、并的那几趟上限都放宽到 8000；想多想少那几样一样不碰（碰了名帖就接不上聊天时写下的缓存），名帖那一块和聊天时寄的一模一样")
    with_img = [c for c in pieces if images_of(c)]
    content = with_img[0]["body"]["messages"][0]["content"] if with_img else []
    img_at = images_of(with_img[0]) if with_img else []
    ok(len(with_img) == 1 and len(img_at) == 6 and all(content[i - 1].get("type") == "text" and content[i - 1]["text"].endswith("卿卿：[照片，图跟在这一行后面]") for i in img_at) and all(content[i]["source"].get("media_type") == "image/png" and content[i]["source"].get("data") for i in img_at)
       and f"卿卿：{OLD4[at400 + 1]['text'][:9]}" in ask_text(pieces[0]) and "（测试并提要）把最早的 9 段并成了一段" in ask_text(pieces[0]) and "最长不超过 900 字" in rule_of(pieces[0]),
       "并完接着抄：从第 401 条抄起，前面并好的那几段带着给他对照；抄到照片的那一趟，六张图各跟在说明它的那一行后面")
    ok(last_chat(pa) == "old-chat-2" and rows_on(pa) == 1 and OLD2[rec2b["n"] - 1]["raw"][:8] in pa.evaluate(AROUND)["before"], "眼前的第二段对话没被搅动：摆的还是它自己的那行小字")
    side(pa)
    pa.get_by_text("第四段旧对话").first.click(); pa.wait_for_timeout(1500)
    recs4 = recaps_of(pa, "old-chat-4") or []
    rec4 = live(recs4, ids4)
    asked4 = [asked_rows(c) for c in pieces]
    photo_piece = pieces.index(with_img[0]) if with_img else 0
    ok(rec4 and len(rec4["parts"]) == 9 + len(pieces) and rec4["parts"][0]["text"].startswith("（测试并提要）把最早的 9 段并成了一段。") and rec4["parts"][0]["rows"] == 216 and rec4["parts"][0]["t0"] == OLD4[0]["ts"] and rec4["parts"][0]["t1"] == OLD4[215]["ts"]
       and [x["text"] for x in rec4["parts"][1:9]] == [x["text"] for x in planted["parts"][9:]] and rec4["parts"][9 + photo_piece]["text"] == piece_text(asked4[photo_piece], False, 6) and rec4["n"] == at400 + 1 + sum(asked4) and not any(r.get("id") == "broken" for r in recs4),
       f"翻回第四段：提要是 {rec4 and len(rec4['parts'])} 段（并出来的一段记着它管的是哪两百多条、几点到几点，后八段原样，再加新抄的），抄到第 {rec4 and rec4['n']} 条")
    pos = pa.evaluate(AROUND)
    ok(rows_on(pa) == 1 and OLD4[rec4["n"] - 1]["raw"][:8] in pos["before"] and pa.get_by_text("收到：丁这段接着聊").count() >= 1, "那行小字挪到了新抄到的地方；他的回话也在")
    chat(pa, "照片的事还记得吗")
    body = chat_calls()[-1]["body"]
    ok(any(t.startswith(f"【前情提要】这段对话聊得很长了，头 {rec4['n']} 条") and "带着 6 张图" in t for t in first_texts(body)) and photos_in(body) == 0 and not any("照片" in t for t in all_texts(body) if t.startswith("[")) and not any("这一回没有寄来" in t for t in first_texts(body)),
       "往后寄的：那六张照片已经抄进提要里了，图不再寄；提要追上来了，也没有“没寄来”那句了")
    settle_recaps(2.5, 30)

    # ================= 漏网的提要（对话早没了）：开机以后收掉 =================
    ghost = lambda at: json.dumps([{"id": "g", "upto": "不在了", "parts": [{"text": "没人要的提要" + "旧" * 60, "t0": 1, "t1": 2, "rows": 3}], "more": False, "at": at, "ts": 2, "n": 3}], ensure_ascii=False)
    pa.wait_for_timeout(3000)
    pa.evaluate(SEED, [["kfs2:recap:ghost-old", ghost(now_ms - 2 * 3600000)], ["kfs2:recap:ghost-new", ghost(int(time.time() * 1000))]])
    ok(recaps_of(pa, "ghost-old") is not None and recaps_of(pa, "ghost-new") is not None, "放两份没有对话的提要进去：一份两个钟头以前抄的，一份刚抄的")
    pa.reload(); kite(pa)
    ok(wait_mock(lambda: recaps_of(pa, "ghost-old") is None, 40, 1.0), "开机以后过一会儿：对话早没了、抄了一个钟头以上的那份收掉了")
    ok(recaps_of(pa, "ghost-new") is not None and recaps_of(pa, "old-chat-1") is not None and recaps_of(pa, "old-chat-2") is not None and recaps_of(pa, "old-chat-4") is not None and len(chat_by(pa, "old-chat-4")) >= 808,
       "刚抄的那份留着（它的对话可能只是还没同步过来）；有对话的那几份一份不动，对话也都在")

    # 删掉一段账上记着“没抄成”的对话：那一笔跟着清
    ok((ledger(pa).get("old-chat-2") or {}).get("times") == 1 and last_chat(pa) == "old-chat-4", "第二段对话账上还记着没抄成的那一笔")
    side(pa)
    pa.get_by_text("第二段旧对话").first.click(); pa.wait_for_timeout(1500)
    side(pa)
    pa.get_by_role("button", name="头像与设置").click(); pa.wait_for_timeout(500)
    pa.get_by_role("button", name="删掉当前这段对话").click()
    pa.get_by_role("button", name="再点一次，删掉这段对话").click()
    pa.wait_for_timeout(1200)
    ok(recaps_of(pa, "old-chat-2") is None and pa.evaluate(KV, "kfs2:chat:old-chat-2") is None and "old-chat-2" not in ledger(pa) and recaps_of(pa, "old-chat-4") is not None, "删掉第二段对话：提要跟着删，账上那一笔也清了")

    ok(not errors, "页面没报错" + ("：" + " | ".join(errors[:3]) if errors else ""))
    browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
sys.exit(1 if count["failed"] else 0)
