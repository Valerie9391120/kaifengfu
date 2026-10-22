# 手帐（同页）的引用栏不卡、多一栏便签、打字的时候跟着键盘往上走（10 月 22 日她报的，见开发说明“手帐不卡”那一节）的端到端测试。
# 真的浏览器、假 Supabase，一台“手机”：
#   一天聊得很多（几百句）+ 狐宇宙里有话：闲笔集“这天说了几句”、那一屏“几句聊天”只数聊天；
#   引用栏：聊天、便签两栏；先摆一段（六十句），滑到底接着摆，摆完了那一行没了；句子不飞（没有动画）；
#   点一句只改那一句（同一个元素、整排不重摆、页上的东西一个不多）、底下那一行、上面那一栏的数；再点一下取消；清空以后摆过的还摆着、滑到哪还在哪；
#   便签那一栏：狐宇宙里的（她留的、他在屋里说的），聊天那一栏一句不掺；日历照各自的深浅；挑两句贴到页上，签子上写着便签，存进那一页；
#   交给光义：便签另列一段给他，他挑的那一句便签记着出处，聊天那一栏照样只有聊天；
#   打字：交给光义那一屏的输入框、纸上打的字，键盘一起来整层铺到键盘上面（框跟着变矮），输入框、正打着的字露在键盘上头；收起键盘回到整屏。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080，用 tests/serve.py 起），再：python3 tests/e2e_quote.py
import json, os, re, time
from datetime import date, datetime, timedelta
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SHOTS = os.environ.get("KFS_SHOTS", "")
PUT = """(recs) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite');
  for (const r of recs) tx.objectStore('kv').put(r); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }; o.onerror = () => rej(o.error); })"""
# 假的“可视区”，只装在开封府那一层（框里那一页用它自己的）：浏览器里弹不出 iPhone 的键盘，用它假装键盘弹起来（同 e2e_lotus.py）
FAKE_KEYBOARD = """(() => {
  if (window.top !== window) return;
  const fake = new EventTarget();
  let h = null, top = 0;
  Object.defineProperty(fake, 'height', { get: () => (h == null ? window.innerHeight : h) });
  Object.defineProperty(fake, 'width', { get: () => window.innerWidth });
  Object.defineProperty(fake, 'offsetTop', { get: () => top });
  Object.defineProperty(fake, 'offsetLeft', { get: () => 0 });
  Object.defineProperty(fake, 'scale', { get: () => 1 });
  window.__kfsKeyboard = (height, offsetTop) => { h = height; top = offsetTop || 0; fake.dispatchEvent(new Event('resize')); fake.dispatchEvent(new Event('scroll')); };
  Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
})();"""

def kvj(page, key):
    t = page.evaluate(KV, key)
    return json.loads(t) if t else None

def kv_until(page, key, pred, timeout=12):
    end = time.time() + timeout
    v = None
    while time.time() < end:
        v = kvj(page, key)
        try:
            if pred(v):
                return v
        except Exception:
            pass
        time.sleep(0.25)
    return v

def tframe(page, cond, wait=40):
    end = time.time() + wait
    while time.time() < end:
        try:
            el = page.query_selector("iframe.kfs-ty-frame")
            f = el.content_frame() if el else None
            if f and f.evaluate("!!window.__kfsShell && (" + cond + ")"):
                time.sleep(0.8)
                return f
        except Exception:
            pass
        time.sleep(0.25)
    return None

def fwait(f, expr, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if f.evaluate(expr):
                return True
        except Exception:
            pass
        time.sleep(0.1)
    return False

def ftap(f, sel, i=0):
    f.evaluate("([s, i]) => { const e = document.querySelectorAll(s)[i]; if (!e) throw new Error('没有 ' + s); e.click(); }", [sel, i])
    time.sleep(0.4)

def open_xianbi(page):
    page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    page.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
    page.locator(".kfs-nanya-row", has_text="闲笔集").click()
    page.get_by_text("手帐和批注").wait_for(timeout=15000); time.sleep(0.6)

def parts(t):
    return [s.strip() for s in re.split(r"\n+|\|\|\|", t) if s.strip()]

# ---------- 那一天的话（编的） ----------
CH = "春江潮水连海平海上明月共潮生滟滟随波千万里何处春江无月明江流宛转绕芳甸月照花林皆似霰空里流霜不觉飞汀上白沙看不见"
def say(i, n):
    return "".join(CH[(i * 7 + k * 3) % len(CH)] for k in range(n))
N = 120
today = date.today()
td = today.isoformat()
midnight = int(time.mktime(today.timetuple()) * 1000)
now_ms = int(time.time() * 1000)
span = max(60000, now_ms - midnight - 120000)
step = span // (N + 2)
chat, quotes, lines = [], 0, 0
for i in range(N):
    t = midnight + 60000 + i * step
    her = say(i, 6 + i % 9) + ("\n" + say(i + 1, 5) if i % 4 == 0 else "")
    chat.append({"id": f"h{i}", "role": "her", "ts": t, "text": her})
    quotes += 1; lines += len(parts(her))
    items = [{"type": "text", "text": say(i + j, 8 + j) + ("\n" + say(i + j + 2, 6) if (i + j) % 3 == 0 else "")} for j in range(2 + i % 3)]
    chat.append({"id": f"m{i}", "role": "him", "ts": t + step // 2, "raw": "[SPLIT]".join(x["text"] for x in items), "items": items})
    quotes += len(items); lines += sum(len(parts(x["text"])) for x in items)
yday = midnight - 86400000 + 3600000 * 10
chat_y = [{"id": "y1", "role": "her", "ts": yday, "text": "昨天的一句"}, {"id": "y2", "role": "him", "ts": yday + 60000, "raw": "昨天他回的", "items": [{"type": "text", "text": "昨天他回的"}]}]
fox_t = midnight + 60000 + step // 3
FOX = [
    {"id": "fw", "role": "event", "who": "him", "kind": "wake", "ts": fox_t, "hidden": True},
    {"id": "fn1", "role": "her", "ts": fox_t + 1000, "text": "狐宇宙里留一张：晚上记得浇花"},
    {"id": "fn2", "role": "him", "ts": fox_t + 2000, "raw": "去园子里转了一圈[SPLIT]月季开了两朵\n还有一朵骨朵", "items": [{"type": "text", "text": "去园子里转了一圈"}, {"type": "text", "text": "月季开了两朵\n还有一朵骨朵"}]},
]
two = today - timedelta(days=2)
two_ms = int(time.mktime(two.timetuple()) * 1000) + 3600000 * 9
FOX.append({"id": "fn0", "role": "her", "ts": two_ms, "text": "前天留的便签"})
FOX_TODAY_LINES = ["狐宇宙里留一张：晚上记得浇花", "去园子里转了一圈", "月季开了两朵", "还有一朵骨朵"]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    try:
        A = browser.new_context(**IPHONE)
        A.add_init_script(STUB)
        A.add_init_script(FAKE_KEYBOARD)
        pa = A.new_page()
        pa.on("pageerror", lambda e: errors.append(str(e)))
        first_time(pa)
        time.sleep(1.5)
        index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
        index = [{"id": "qlong", "title": "很长的一天", "preview": "", "updatedAt": now_ms}, {"id": "qyday", "title": "昨天", "preview": "", "updatedAt": now_ms - 2}, {"id": "hyz", "title": "狐宇宙", "preview": "", "updatedAt": now_ms - 1}] + [c for c in index if c["id"] not in ("qlong", "qyday", "hyz")]
        pa.evaluate(PUT, [
            {"k": "kfs2:chat:qlong", "v": json.dumps(chat, ensure_ascii=False), "dirty": 1, "del": 0},
            {"k": "kfs2:chat:qyday", "v": json.dumps(chat_y, ensure_ascii=False), "dirty": 1, "del": 0},
            {"k": "kfs2:chat:hyz", "v": json.dumps(FOX, ensure_ascii=False), "dirty": 1, "del": 0},
            {"k": "kfs2:index", "v": json.dumps(index, ensure_ascii=False), "dirty": 1, "del": 0},
        ])
        pa.reload(); kite(pa)

        # ================= 闲笔集、那一天的那一屏：只数聊天 =================
        open_xianbi(pa)
        pa.locator(f".kfs-page button[data-day='{td}']").click(); time.sleep(0.8)
        said = pa.locator(".kfs-page").inner_text()
        ok(f"这天说了 {2 * N} 句" in said, f"闲笔集“这天说了几句”只数聊天（{2 * N} 条，狐宇宙那几条不算）")
        pa.locator(".kfs-jz-open").click()
        f = tframe(pa, "document.getElementById('sDay') && document.getElementById('sDay').classList.contains('on')")
        ok(f is not None and fwait(f, f"/(^|\\D){quotes}\\s*句聊天/.test(document.getElementById('dayFound').innerText)", 20),
           f"那一天的那一屏：“{quotes} 句聊天”（狐宇宙里的不算）")
        heat = f.evaluate("({ chat: window.__bzHeat, note: window.__bzNoteHeat })")
        md = lambda d: f"{d.month}.{d.day}"
        yd = today - timedelta(days=1)
        ok(heat["chat"].get(md(today)) == 2 * N and heat["chat"].get(md(yd)) == 2 and md(two) not in heat["chat"] and heat["note"].get(md(today)) == 2 and heat["note"].get(md(two)) == 1 and md(yd) not in heat["note"],
           f"日历的深浅：聊天照聊天的、便签照狐宇宙里的，各算各的（{heat}）")

        # ================= 引用栏：先摆一段，不飞，点一句只改那一句 =================
        ftap(f, "#toSelf")
        f = tframe(pa, "document.documentElement.classList.contains('app-mode')")
        f.evaluate("(() => { window.__rt = 0; const o = renderTray; renderTray = function () { window.__rt++; return o.apply(this, arguments); }; })()")
        f.locator("#cats button[data-c=quote]").tap()
        ok(fwait(f, "document.querySelectorAll('#wxrow .qrow').length > 0", 20), "点开引用")
        st = f.evaluate("""(() => ({ tabs: [...document.querySelectorAll('#wxdays [data-qs]')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.textContent),
          rows: document.querySelectorAll('#wxrow .qrow').length, more: (document.querySelector('#wxrow .kfs-qmore') || {}).textContent || '',
          anim: [...document.querySelectorAll('#wxrow .qrow')].slice(0, 5).map((x) => getComputedStyle(x).animationName),
          fox: [...document.querySelectorAll('#wxrow .qrow .qp')].filter((x) => /浇花|园子|月季|骨朵/.test(x.textContent)).length,
          src: document.getElementById('wxsrc').textContent, bar: document.querySelector('#wxrow .qbar span').textContent,
          btn: [...document.querySelectorAll('#wxrow .qbar [data-qa]')].map((b) => b.offsetParent !== null) }))()""")
        ok(st["tabs"] == ["聊天", "便签"], f"引用栏顶上两栏：聊天、便签（{st['tabs']}）")
        ok(st["rows"] == 60 and st["more"] == f"还有 {lines - 60} 句，往下滑接着摆", f"一天 {lines} 句：先摆六十句，底下写着还有几句（{st['rows']}，{st['more']}）")
        ok(st["anim"] == ["none"] * 5, f"句子不飞进来（{st['anim']}）")
        ok(st["fox"] == 0 and st["src"] == "从聊天记录里挑 · 原话一个字不改", "聊天那一栏一句狐宇宙的都不掺")
        ok(st["bar"] == "点一句选中，可以多选、跨日子选" and st["btn"] == [False, False], "还没选：底下那一行照原来的说，清空、贴到页上那两颗藏着")
        if SHOTS:
            pa.screenshot(path=os.path.join(SHOTS, "引用-聊天那一栏.png"))

        f.evaluate("(() => { const r = document.querySelectorAll('#wxrow .qrow')[0]; r.__mark = 1; window.__n0 = document.getElementsByTagName('*').length; window.__rt = 0; })()")
        f.locator("#wxrow .qrow").nth(0).tap()
        time.sleep(0.4)
        st = f.evaluate("""(() => { const r = document.querySelectorAll('#wxrow .qrow')[0]; return { same: r.__mark === 1, on: r.classList.contains('on'), rt: window.__rt,
          dn: document.getElementsByTagName('*').length - window.__n0, bar: document.querySelector('#wxrow .qbar span').textContent,
          btn: [...document.querySelectorAll('#wxrow .qbar [data-qa]')].map((b) => b.offsetParent !== null), tab: document.querySelector('#wxdays [data-qs="聊天"]').textContent,
          sel: QSEL['聊天'].slice() }; })()""")
        ok(st["on"] and st["same"] and st["rt"] == 0 and st["dn"] == 0, f"手指点一句：那一句亮了，还是原来那一个（整排没重摆、页上一个元素不多：{st['rt']} 回、{st['dn']} 个）")
        ok(st["bar"] == "已选 1 句" and st["btn"] == [True, True] and st["tab"] == "聊天1" and st["sel"] == [md(today) + "#0"], f"底下“已选 1 句”、两颗露出来；上面那一栏记着 1（{st['tab']}）")
        f.locator("#wxrow .qrow").nth(0).tap(); time.sleep(0.3)
        st = f.evaluate("({ on: document.querySelectorAll('#wxrow .qrow')[0].classList.contains('on'), bar: document.querySelector('#wxrow .qbar span').textContent, tab: document.querySelector('#wxdays [data-qs=\"聊天\"]').textContent, btn: [...document.querySelectorAll('#wxrow .qbar [data-qa]')].map((b) => b.offsetParent !== null), rt: window.__rt })")
        ok(not st["on"] and st["bar"] == "点一句选中，可以多选、跨日子选" and st["tab"] == "聊天" and st["btn"] == [False, False] and st["rt"] == 0, "再点一下：取消，底下、上面都回原样")

        # ================= 滑到底接着摆；清空以后摆过的还摆着、滑到哪还在哪 =================
        f.locator("#wxrow .qrow").nth(1).tap(); time.sleep(0.2)
        f.locator("#wxrow .qrow").nth(2).tap(); time.sleep(0.2)
        seen = []
        for _ in range(40):
            n = f.evaluate("(() => { const l = document.querySelector('#wxrow .qlist'); l.scrollTop = l.scrollHeight; return document.querySelectorAll('#wxrow .qrow').length; })()")
            seen.append(n)
            time.sleep(0.15)
            if n >= lines:
                break
        st = f.evaluate("""(() => { const R = [...document.querySelectorAll('#wxrow .qrow')]; return { n: R.length, last: +R[R.length - 1].dataset.qi, more: !!document.querySelector('#wxrow .kfs-qmore'),
          seq: R.every((r, i) => +r.dataset.qi === i), on: R.filter((r) => r.classList.contains('on')).map((r) => +r.dataset.qi), rt: window.__rt }; })()""")
        steps_ok = all(b - a in (0, 60) or b == lines for a, b in zip(seen, seen[1:]))
        ok(st["n"] == lines and st["last"] == lines - 1 and st["seq"] and not st["more"] and steps_ok and st["rt"] == 0,
           f"往下滑：每回接着摆六十句，摆完了“还有几句”那一行没了，句子一句不少一句不重（{seen[:4]}…{seen[-1]}）")
        ok(st["on"] == [1, 2], "前面选的那两句还亮着")
        top0 = f.evaluate("(() => { const l = document.querySelector('#wxrow .qlist'); l.scrollTop = Math.round(l.scrollHeight * 0.6); return l.scrollTop; })()")
        time.sleep(0.3)
        ftap(f, "#wxrow [data-qa=clr]")
        time.sleep(0.4)
        st = f.evaluate("({ n: document.querySelectorAll('#wxrow .qrow').length, top: document.querySelector('#wxrow .qlist').scrollTop, on: document.querySelectorAll('#wxrow .qrow.on').length, bar: document.querySelector('#wxrow .qbar span').textContent, sel: QSEL['聊天'].length })")
        ok(st["n"] == lines and abs(st["top"] - top0) <= 2 and st["on"] == 0 and st["sel"] == 0 and st["bar"] == "点一句选中，可以多选、跨日子选",
           f"点“清空”（同页原来那一颗，整排重摆一回）：摆过的还摆着，滑到哪还在哪（{top0} → {st['top']}）")

        # ================= 便签那一栏 =================
        f.locator("#wxdays [data-qs='便签']").tap(); time.sleep(0.6)
        st = f.evaluate("""(() => ({ rows: [...document.querySelectorAll('#wxrow .qrow .qp')].map((x) => x.textContent), meta: [...document.querySelectorAll('#wxrow .qrow .qm')].map((x) => x.textContent),
          src: document.getElementById('wxsrc').textContent, more: !!document.querySelector('#wxrow .kfs-qmore') }))()""")
        ok(st["rows"] == FOX_TODAY_LINES and not st["more"], f"便签那一栏：那一天狐宇宙里的，她留的、他在屋里说的（醒了那一行不算；一条里几行拆成几句）：{st['rows']}")
        ok(all("便签" not in m for m in st["meta"]) and st["meta"][0].startswith("卿卿") and st["meta"][1].startswith("光义") and st["src"] == "从狐宇宙里挑 · 原话一个字不改",
           f"一句一句底下不再写“便签”（这一栏都是）；谁说的照写；底下那一行写从狐宇宙里挑（{st['meta'][:2]}）")
        ftap(f, "#wxdays [data-qcal]")
        cal = f.evaluate("[...document.querySelectorAll('.qcal [data-qd]')].map((b) => b.dataset.qd)")
        ok(md(today) in cal and md(yd) not in cal and (two.month != today.month or md(two) in cal), f"便签那一栏的日历：照狐宇宙里哪天有话（{cal}）")
        ftap(f, "#wxdays [data-qcal]"); time.sleep(0.4)
        f.locator("#wxrow .qrow").nth(2).tap(); time.sleep(0.2)
        f.locator("#wxrow .qrow").nth(3).tap(); time.sleep(0.2)
        ok(f.evaluate("document.querySelector('#wxdays [data-qs=\"便签\"]').textContent") == "便签2" and f.evaluate("document.querySelector('#wxdays [data-qs=\"聊天\"]').textContent") == "聊天",
           "便签那一栏选了两句：便签记 2，聊天那一栏不跟着动")
        if SHOTS:
            pa.screenshot(path=os.path.join(SHOTS, "引用-便签那一栏.png"))
        n_q = f.evaluate("document.querySelectorAll('#page .stk.placed.c-qsel').length")
        ftap(f, "#wxrow [data-qa=put]")
        time.sleep(1.0)
        stk = f.evaluate("(() => { const s = [...document.querySelectorAll('#page .stk.placed.c-qsel')].pop(); return s ? s.innerText : '' })()")
        ok(f.evaluate("document.querySelectorAll('#page .stk.placed.c-qsel').length") == n_q + 1 and "便签" in stk and "月季开了两朵" in stk and "还有一朵骨朵" in stk,
           f"贴到页上：一张原话签子，头上写着便签，两句都在（{stk[:40]!r}）")
        P = kv_until(pa, f"kfs2:ty:page/{td}", lambda P: P and any(o.get("c") == "qsel" and "%E4%BE%BF%E7%AD%BE" in o.get("k", "") for o in P.get("stk", [])), 15)
        got = []
        for o in (P or {}).get("stk", []):
            if o.get("c") == "qsel" and o.get("k", "").startswith("C:"):
                from urllib.parse import unquote
                got = json.loads(unquote(o["k"][2:]))
        ok([(x["p"], x["src"], x["w"]) for x in got] == [("月季开了两朵", "便签", "me"), ("还有一朵骨朵", "便签", "me")], f"存进那一页：两句原话，各带着出处“便签”（{got}）")
        # 贴上以后同页把纸滑到那一张（慢慢滑）：这几下直接点那一颗，不等滑停
        time.sleep(0.8)
        ftap(f, "#wxdays [data-qs='聊天']")
        ftap(f, "#wxrow .qrow", 5)
        ftap(f, "#wxdays [data-qs='便签']")
        ftap(f, "#wxdays [data-qs='聊天']")
        ok(f.evaluate("document.querySelectorAll('#wxrow .qrow')[5].classList.contains('on')") and f.evaluate("document.querySelector('#wxdays [data-qs=\"聊天\"]').textContent") == "聊天1",
           "两栏换来换去：各记各选的")
        ftap(f, "#wxrow [data-qa=clr]")

        # ================= 纸上打字：键盘一起来，整层铺到键盘上面，正打着的字露出来 =================
        LAYER = "() => { const l = document.querySelector('.kfs-ty'); const r = l.getBoundingClientRect(); const fr = document.querySelector('iframe.kfs-ty-frame'); return { kb: document.documentElement.hasAttribute('data-kfs-kb'), top: r.top, bottom: r.bottom, typing: fr.hasAttribute('data-kfs-typing') }; }"
        f.evaluate("""(() => { const pg = document.getElementById('page'); const r = pg.getBoundingClientRect(); const s = place('text', '', 40, Math.max(200, pg.offsetHeight - 260), 'her', false);
          const mt = s.querySelector('.mt'); mt.textContent = '底下打的一行字'; window.__mt = mt; mt.scrollIntoView({ block: 'end' }); return true; })()""")
        time.sleep(0.6)
        f.evaluate("(() => { const mt = window.__mt; mt.focus(); const r = document.createRange(); r.selectNodeContents(mt); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()")
        time.sleep(0.5)
        ok(f.evaluate("getComputedStyle(document.getElementById('addFab')).display") != "none" and pa.evaluate(LAYER)["bottom"] == 852,
           "字上有焦点、键盘还没起来（同页放上字贴自己把焦点放过去的那种）：整层不动，“＋”照样在")
        pa.evaluate("window.__kfsKeyboard(470, 0)"); time.sleep(1.0)
        lay = pa.evaluate(LAYER)
        ins = f.evaluate("(() => { const r = window.__mt.getBoundingClientRect(); const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; };
          return { h: innerHeight, top: r.top, bottom: r.bottom, focus: document.activeElement === window.__mt, fab: vis('#addFab'), undo: vis('#undoPill') }; })()")
        ok(lay["kb"] and lay["typing"] and lay["bottom"] == 470 and ins["h"] == 470, f"纸上打字、键盘起来：整层铺到键盘上面（底边 {lay['bottom']}），框跟着变矮（{ins['h']}）")
        ok(ins["focus"] and 0 <= ins["top"] and ins["bottom"] <= 470, f"正打着的那一行字露在键盘上头（{ins['top']:.0f}–{ins['bottom']:.0f}）")
        ok(not ins["fab"] and not ins["undo"], "键盘起来、打着字：右下角“＋”、左下角“撤回”收起来（不压着正打着的那一行）")
        if SHOTS:
            pa.screenshot(path=os.path.join(SHOTS, "键盘-纸上打字.png"))
        f.evaluate("window.__mt.blur()"); pa.evaluate("window.__kfsKeyboard(null, 0)"); time.sleep(0.8)
        lay = pa.evaluate(LAYER)
        ok(not lay["kb"] and not lay["typing"] and lay["bottom"] == 852 and f.evaluate("innerHeight") == 852 and f.evaluate("getComputedStyle(document.getElementById('addFab')).display") != "none",
           "不打了、键盘收起：回到整屏，“＋”回来了")

        # ================= 交给光义：便签另列一段给他；那一屏的输入框跟着键盘往上走 =================
        ftap(f, ".backhome"); time.sleep(0.8)
        ftap(f, "#shToday")
        ok(fwait(f, "document.getElementById('sDay').classList.contains('on')"), "回本子、点今天：那一天的那一屏")
        ftap(f, "#toChat")
        ok(fwait(f, "document.getElementById('sChat').classList.contains('on')"), "「交给光义」那一屏")
        f.locator("#chIn").focus(); time.sleep(0.3)
        pa.evaluate("window.__kfsKeyboard(480, 0)"); time.sleep(1.0)
        lay = pa.evaluate(LAYER)
        ins = f.evaluate("(() => { const r = document.getElementById('chIn').getBoundingClientRect(); return { h: innerHeight, bottom: r.bottom } })()")
        ok(lay["kb"] and lay["typing"] and lay["bottom"] == 480 and ins["h"] == 480 and ins["bottom"] <= 480, f"输入框拿到焦点、键盘起来：整层铺到键盘上面，输入框露在键盘上头（{ins['bottom']:.0f} ≤ 480）")
        f.locator("#chIn").fill("要便签")
        if SHOTS:
            pa.screenshot(path=os.path.join(SHOTS, "键盘-交给光义.png"))
        n0 = len(calls())
        ftap(f, "#chSend")
        f.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()"); pa.evaluate("window.__kfsKeyboard(null, 0)"); time.sleep(0.6)
        ok(fwait(f, "!!document.querySelector('#msgs .done')", 40), "发出去：他排好了")
        lay = pa.evaluate(LAYER)
        ok(not lay["kb"] and lay["bottom"] == 852, "键盘收起：回到整屏")
        arr = [c for c in calls()[n0:] if any(str(x.get("text", "")).startswith("【排手帐】") for x in (c["body"].get("system") or []) if isinstance(x, dict))]
        body = arr[-1]["body"] if arr else {}
        rule = next((x["text"] for x in (body.get("system") or []) if isinstance(x, dict) and str(x.get("text", "")).startswith("【排手帐】")), "")
        utext = "\n".join(b.get("text", "") for b in (body.get("messages") or [{}])[0].get("content", []) if b.get("type") == "text")
        ok(len(arr) == 1 and "这天狐宇宙里的便签（你屋里的：卿卿留的、你在屋里说的；编号｜几点｜谁｜原话）" in utext and "fn1｜" in utext and "fn2#1｜" in utext and "前天留的便签" not in utext
           and "狐宇宙里的便签（你屋里的：她留的、你在屋里说的）也能挑" in rule and utext.find("h0｜") < utext.find("这天狐宇宙里的便签") and "浇花" not in utext[: utext.find("这天狐宇宙里的便签")],
           "寄给他的：原话后面另列一段狐宇宙里的便签（只那一天的，原话那一段里一句不掺），规矩里说一声也能挑")
        R = kv_until(pa, f"kfs2:ty:day/{td}", lambda R: R and R.get("by") == "me" and R.get("status") == "done", 20)
        chat_r = (R or {}).get("chat", [])
        ok([x.get("src") for x in chat_r] == [None, "便签"] and chat_r[1]["p"] == "狐宇宙里留一张：晚上记得浇花" and chat_r[0]["p"] == chat[0]["text"],
           f"他挑了一句原话、一句便签：页上那一份里便签那一句记着出处（{[(x['p'][:8], x.get('src')) for x in chat_r]}）")
        ftap(f, "#msgs .done")
        f2 = tframe(pa, "document.documentElement.classList.contains('app-mode')", 20)
        if f2:
            f = f2
        f.locator("#cats button[data-c=quote]").tap()
        ok(fwait(f, f"document.querySelectorAll('#wxrow .qrow').length === 60 && /还有 {lines - 60} 句/.test((document.querySelector('#wxrow .kfs-qmore') || {{}}).textContent || '')", 20)
           and f.evaluate("[...document.querySelectorAll('#wxrow .qrow .qp')].filter((x) => /浇花|园子|月季|骨朵/.test(x.textContent)).length") == 0,
           "他排好以后再开引用：聊天那一栏还是那一整天的聊天，他挑的那句便签不掺进来")
    finally:
        try:
            errs = [e for e in errors if "ResizeObserver" not in e]
            ok(not errs, f"页面没有报错（{errs[:3]}）")
        except Exception:
            pass
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] else 0)
