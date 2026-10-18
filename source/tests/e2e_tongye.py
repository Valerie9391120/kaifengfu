# 同页那一本手帐搬进开封府（10 月 18 日，作者同意了；见开发说明“同页搬进来”那一节、src/tongye/、tools/tongye.mjs）的端到端测试。
# 真的浏览器、假 Supabase，一台“手机”从头走到尾，再拿第二台对一下：
#   原来那一版手帐掺的页（kfs2:jz:）挪过来；闲笔集日历上的 🏷️、那一天底下的卡片；点开是同页（隔开的框，碰不到开封府）；
#   点开没动不留；天气在哪儿（Open-Meteo 用 page.route 假的）；换版式风格、打字、聊天里的照片、相册的照片、批注、存一代、存长图；
#   关上再开都在；闲笔集里留、删批注；第二台设备同步过去照样；他翻日记看得到这一本、他留的批注贴在页上；
#   删掉一页（同页「存」最底下）、找回来；云端只有乱码；框里的安全规矩没拦它自己的脚本。
# 同页的框是隔开的（sandbox），Playwright 往里点有时点歪（框在手机模式下的坐标），框里的点都直接发给那个元素（ftap）。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：python3 tests/e2e_tongye.py
import base64, io, json, os, re, time
from datetime import date, timedelta
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
refused = []
wx_log = []

def fake_photo(color, w=900, h=1200, fmt="PNG"):
    im = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(im)
    d.ellipse([w * 0.2, h * 0.25, w * 0.8, h * 0.75], fill=(255, 255, 255))
    buf = io.BytesIO()
    im.save(buf, fmt)
    return buf.getvalue()

def data_url(color):
    return "data:image/jpeg;base64," + base64.b64encode(fake_photo(color, 600, 800, "JPEG")).decode()

def open_meteo(route):
    url = route.request.url
    wx_log.append(url)
    head = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    if "geocoding-api" in url:
        body = {"results": [{"name": "某城", "latitude": 12.3456, "longitude": -45.6789, "timezone": "Etc/UTC", "admin1": "某省", "country": "某国"}]} if "name=%E6%9F%90%E5%9F%8E" in url else {}
    else:
        body = {"daily": {"weather_code": [61], "temperature_2m_max": [15.4], "temperature_2m_min": [9.6], "precipitation_sum": [3.2], "wind_speed_10m_max": [21.7], "sunset": ["2026-10-18T18:21"]}}
    route.fulfill(status=200, headers=head, body=json.dumps(body))

PUT = """(recs) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite');
  for (const r of recs) tx.objectStore('kv').put(r); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }; o.onerror = () => rej(o.error); })"""
TYKEYS = """() => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').getAll();
  r.onsuccess = () => res(r.result.filter((x) => /^kfs2:(ty|tyls|jzimg):/.test(x.k) && !x.del).map((x) => x.k).sort()); r.onerror = () => rej(r.error); }; o.onerror = () => rej(o.error); })"""

def kvj(page, key):
    t = page.evaluate(KV, key)
    return json.loads(t) if t else None

def fx(page, wait=25):
    # 框里那一页（同页）：进了编辑器才算
    end = time.time() + wait
    while time.time() < end:
        try:
            el = page.query_selector("iframe.kfs-ty-frame")
            f = el.content_frame() if el else None
            if f and f.evaluate("!!window.__kfsShell && document.documentElement.classList.contains('app-mode')"):
                time.sleep(0.8)
                return f
        except Exception:
            pass
        time.sleep(0.3)
    return None

def ftap(f, sel, i=0):
    f.evaluate("([s, i]) => { const e = document.querySelectorAll(s)[i]; if (!e) throw new Error('没有 ' + s); e.click(); }", [sel, i])
    time.sleep(0.5)

def fwait(f, expr, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if f.evaluate(expr):
                return True
        except Exception:
            pass
        time.sleep(0.25)
    return False

def open_xianbi(page):
    page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    page.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
    page.locator(".kfs-nanya-row", has_text="闲笔集").click()
    page.locator(".kfs-page").wait_for(timeout=10000)
    page.get_by_text("手帐和批注").wait_for(timeout=10000); time.sleep(0.6)

def pick_day(page, d):
    # 日历上点那一天（不是这个月的先翻到上个月）
    today_d = date.today()
    if (d.year, d.month) != (today_d.year, today_d.month):
        page.get_by_role("button", name="上个月").click(); time.sleep(0.5)
    page.locator(f".kfs-page button[data-day='{d.isoformat()}']").click(); time.sleep(0.8)

def close_ty(page, f):
    # 编辑器左上角回本子，再点本子左上角“闲笔集”
    ftap(f, ".backhome"); time.sleep(0.8)
    ftap(f, ".kfs-close"); time.sleep(1.5)

def close_side(page):
    if page.locator("div.absolute.inset-0.z-30").count():
        page.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)

def leave_xianbi(page):
    page.get_by_role("button", name="返回").first.click(); time.sleep(0.6)
    close_side(page)

def gone(page, timeout=15):
    # 框拆了（关上回闲笔集）
    end = time.time() + timeout
    while time.time() < end:
        if page.locator("iframe.kfs-ty-frame").count() == 0:
            time.sleep(1.2)
            return True
        time.sleep(0.25)
    return False

def trash_keys(page):
    return [k for k in page.evaluate(TYKEYS) if k.startswith("kfs2:ty:trash/")]

def his_last_call(page):
    cid, msgs = chat_of(page)
    steps = [m for m in msgs if m["role"] == "him" and m.get("calls")]
    return steps[-1]["calls"][0] if steps else {}

def page_state(f):
    return f.evaluate("""(() => ({ layout: curLayout, style: curStyle, day: PAGE_DAY,
      stk: [...document.querySelectorAll('#page .stk.placed:not(.deco)')].map((x) => x.dataset.c + ':' + (x.dataset.c === 'text' ? (x.querySelector('.mt') || {}).innerText : x.dataset.k)),
      pics: [...document.querySelectorAll('#page .stk.placed[data-c=pic] img')].map((i) => i.naturalWidth),
      pins: document.querySelectorAll('#page .npin').length,
      title: (document.querySelector('.title h2') || {}).innerText }))()""")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    A = browser.new_context(**IPHONE)
    A.add_init_script(STUB)
    A.route(re.compile(r"^https://(geocoding-api|api|archive-api)\.open-meteo\.com/.*"), open_meteo)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append("A: " + str(e)))
    pa.on("console", lambda m: refused.append(m.text[:200]) if "Refused to execute" in m.text or "Refused to evaluate" in m.text else None)
    try:
        first_time(pa)
        td = date.today()
        today = td.isoformat()
        md = f"{td.month}.{td.day}"
        fd_ = td - timedelta(days=1)
        fday = fd_.isoformat()

        # ================= 聊天里发两张照片、说一句 =================
        for color in [(236, 200, 240), (250, 216, 170)]:
            pa.locator("input[type=file][accept*='image']").set_input_files({"name": "编的照片.png", "mimeType": "image/png", "buffer": fake_photo(color)})
            pa.locator(".kfs-composer img").first.wait_for(timeout=10000)
            n = len(calls())
            pa.get_by_role("button", name="发送", exact=True).click()
            wait_mock(lambda: len(calls()) > n, 20); wait_js(pa, "!(" + TYPING + ")", 25000); time.sleep(1.2)
        n = len(calls())
        say(pa, "今天看到泡桐花了")
        wait_mock(lambda: len(calls()) > n, 20); wait_js(pa, "!(" + TYPING + ")", 25000); time.sleep(1.2)

        # ================= 原来那一版手帐掺的一页（昨天）：放进存档 =================
        at = int(time.time() * 1000) - 86400000
        old = {"v": 1, "day": fday, "layout": "column", "style": "washi", "at": at,
               "arr": {"by": "her", "at": at, "title": "", "body": "", "cap": "", "pen": None,
                       "quotes": [{"id": "q1", "w": "her", "t": "16:12", "p": "今天看到泡桐花了"}],
                       "photos": [{"id": "jzold1", "role": "hero", "note": ""}], "stickers": []},
               "mine": {"edit": {"title": "泡桐花"}, "hide": [], "stickers": [{"k": "e:fox", "x": 0.5, "y": 0.6, "r": 0, "s": 1}],
                        "texts": [{"id": "t1", "m": "那天真好", "x": 0.3, "y": 0.9, "r": -4, "s": 1}], "at": at},
               "wx": None}
        notes = [{"id": "nold1", "who": "her", "text": "˚ʚ(´◡`)ɞ˚", "at": at, "part": "hero"}]
        pa.evaluate(PUT, [
            {"k": "kfs2:jz:" + fday, "v": json.dumps(old, ensure_ascii=False), "dirty": 1, "del": 0},
            {"k": "kfs2:jzn:" + fday, "v": json.dumps(notes, ensure_ascii=False), "dirty": 1, "del": 0},
            {"k": "kfs2:jzimg:jzold1", "v": data_url((150, 120, 200)), "dirty": 1, "del": 0},
        ])
        pa.reload(); kite(pa)

        # ================= 闲笔集：昨天那一页挪过来了 =================
        open_xianbi(pa)
        time.sleep(1.0)
        ok(pa.locator(".kfs-page .kfs-jz-tag").count() == 1, f"日历上只有一个 🏷️（昨天那一页，从原来那一版挪过来的）")
        R = kvj(pa, f"kfs2:ty:day/{fday}")
        P = kvj(pa, f"kfs2:ty:page/{fday}")
        N = kvj(pa, "kfs2:ty:notes/nold1")
        ok(R and R["title"] == "泡桐花" and R["layout"] == "column" and R["style"] == "washi" and R["photos"][0]["src"] == "kfsimg:jzold1" and R["photos"][0]["role"] == "hero"
           and R["chat"] == [{"w": "her", "t": "16:12", "p": "今天看到泡桐花了"}] and R["by"] == "her",
           "挪过来的那一天（同页的 day）：标题照她改的、单栏流、和纸（青墨素纸那几种同名的换成同页的）、主照片还是那张图、原话照原样")
        ok(P and any(s["c"] == "emoji" and s["k"] == "fox" and s["who"] == "her" for s in P["stk"]) and any(s["c"] == "text" and s.get("m") == "那天真好" for s in P["stk"]),
           "她贴的狐狸、写的“那天真好”挪到她那一层（同页的 page）")
        ok(N and N["day"] == fday and N["b"] == "he" and N["who"] == "her" and N["text"] == "˚ʚ(´◡`)ɞ˚", "批注挪成同页的批注：贴在主照片旁边")
        ok(kvj(pa, f"kfs2:ty:moved/{fday}") is not None and pa.evaluate(KV, "kfs2:jz:" + fday) is not None, "记了一笔挪过；原来那一版的存档留着（要退回那一版还在）")
        pick_day(pa, fd_)
        card = pa.locator(".kfs-jz-open").inner_text()
        ok("泡桐花" in card and "单栏流 × 和纸" in card and "批注 1" in card and pa.locator(".kfs-jz-open img").count() == 1, f"昨天底下的卡片：标题、版式 × 风格、批注 1、主照片（{card!r}）")

        # ================= 点开：同页，隔开的框 =================
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        ok(f is not None, "点开卡片：盖上一层，里面是同页那一本，进了编辑器")
        st = page_state(f)
        ok(st["day"] == f"{fd_.month}.{fd_.day}" and st["layout"] == "column" and st["style"] == "washi" and "泡桐花" in (st["title"] or ""), f"打开的是昨天那一页：单栏流、和纸、标题“泡桐花”（{st['title']!r}）")
        ok(fwait(f, "[...document.querySelectorAll('#page img')].some((i) => i.src.startsWith('blob:') && i.naturalWidth > 0)"), "主照片摆上了（图从开封府的存档里取来，框里换成 blob: 地址）")
        st = page_state(f)
        ok("emoji:fox" in st["stk"] and "text:那天真好" in st["stk"] and st["pins"] == 1, f"她贴的狐狸、写的字、那条批注的小记号都在（{st['stk']}，批注 {st['pins']}）")
        iso = f.evaluate("""() => { const r = {}; try { r.parent = !!window.parent.document; } catch (e) { r.parent = 'blocked'; }
          try { indexedDB.open('kfs-local'); r.idb = 'open'; } catch (e) { r.idb = 'blocked'; }
          try { window.localStorage.getItem('x'); r.ls = 'open'; } catch (e) { r.ls = 'blocked'; }
          try { r.cookie = document.cookie; } catch (e) { r.cookie = 'blocked'; } return r; }""")
        ok(iso == {"parent": "blocked", "idb": "blocked", "ls": "blocked", "cookie": "blocked"}, f"框是隔开的：碰不到开封府的网页、存档、这台设备上的东西、cookie（{iso}）")
        sb = pa.evaluate("document.querySelector('iframe.kfs-ty-frame').getAttribute('sandbox')")
        ok(sb == "allow-scripts allow-downloads", f"框的 sandbox 只给跑脚本、存长图（{sb}）")
        bad = f.evaluate("""async () => { const P = window.parent; const ask = (method, args) => new Promise((res) => { const id = 900000 + Math.floor(Math.random() * 1000);
            const h = (e) => { if (e.data && e.data.re === id) { removeEventListener('message', h); res(e.data); } }; addEventListener('message', h);
            P.postMessage({ kfsTy: 1, id, method, args }, '*'); setTimeout(() => res('no answer'), 3000); });
          return [await ask('get', { k: 'kfs2:settings' }), await ask('get', { k: 'kfs2:index' }), await ask('list', { prefix: 'kfs2:chat:' }), await ask('img', { id: '../img:x' }), await ask('set', { k: 'kfs2:settings', v: '{}' }), await ask('eval', {})]; }""")
        ok(bad[0]["value"] is None and bad[1]["value"] is None and bad[2]["value"] == [] and bad[3]["value"] is None and bad[4]["value"] is False and bad[5]["ok"] is False,
           f"框来要这一本以外的东西（设置、对话目录、聊天、别处的图、改设置、不认得的）：一样都不给（{[b.get('value') if isinstance(b, dict) else b for b in bad]}）")
        close_ty(pa, f)
        ok(pa.locator("iframe.kfs-ty-frame").count() == 0 and "泡桐花" in pa.locator(".kfs-jz-open").inner_text(), "回本子、再点“闲笔集”：框拆了，回到昨天那一天，卡片还在")

        # ================= 今天：点开没动，不留 =================
        pick_day(pa, td)
        ok(pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐", "今天还没掺：卡片是“掺一页手帐”")
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        ok(f is not None and "自己拼" in f.evaluate("document.querySelector('.top h1').innerText"), "点开：同页的编辑器，“自己拼”")
        close_ty(pa, f)
        ok(kvj(pa, f"kfs2:ty:day/{today}") is None and kvj(pa, f"kfs2:ty:page/{today}") is None and pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐",
           "什么都没动就关了：这一页不留（同原来那一版“点开不动不存”），卡片还是“掺一页手帐”")

        # ================= 天气在哪儿 =================
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        ftap(f, "#cfgBtn"); time.sleep(0.4)
        ok(fwait(f, "document.querySelector('.kfs-city-now') && /还没填/.test(document.querySelector('.kfs-city-now').innerText)"), "同页的设置里多了一节“天气在哪儿”：还没填")
        f.evaluate("(() => { const i = document.querySelector('.kfs-city-in'); i.value = '某城'; })()")
        ftap(f, ".kfs-city-go")
        ok(fwait(f, "document.querySelectorAll('.kfs-city-list button').length === 1"), "找“某城”：列出来一个（某省，某国）")
        ftap(f, ".kfs-city-list button")
        ok(fwait(f, "/现在：某城/.test(document.querySelector('.kfs-city-now').innerText)"), "挑了：现在是某城")
        ok(fwait(f, f"typeof WX !== 'undefined' && WX['{md}'] && WX['{md}'].code === 61 && WX['{md}'].sun === '18:21'"), "取了今天的天气，框里知道了（小雨、日落 18:21）")
        geo = [u for u in wx_log if "geocoding-api" in u]
        fc = [u for u in wx_log if "api.open-meteo.com/v1/forecast" in u]
        ok(len(geo) == 1 and len(fc) == 1 and "latitude=12.35&longitude=-45.68" in fc[0] and f"start_date={today}&end_date={today}" in fc[0], "只寄了城市名（找的时候）、经纬度和日子（取的时候）")
        cfg = json.loads(pa.evaluate(KV, "kfs2:jzcfg") or "{}")
        W = kvj(pa, f"kfs2:ty:wx/{today}")
        ok(cfg.get("city", {}).get("name") == "某城" and W and W["code"] == 61 and W["at"] == "某城" and W["sun"] == "18:21", "在哪儿记在 kfs2:jzcfg；那天的天气写进同页的 wx")
        ok(fwait(f, "/小雨/.test(document.querySelector('#page').innerText)"), "纸上的天气签：小雨")
        ftap(f, "#cfgGrab")

        # ================= 拼一页 =================
        f.evaluate("applyStyle('kraft'); applyLayout('polaroid')"); time.sleep(1.2)
        f.evaluate("window.journalAdd.text()"); time.sleep(0.8)
        pa.keyboard.type("泡桐花开了"); time.sleep(0.4)
        f.evaluate("document.activeElement && document.activeElement.blur()"); time.sleep(0.8)
        ftap(f, "#addFab .main")
        ok(f.evaluate("[...document.querySelectorAll('#addFab .menu button')].map((b) => b.innerText.trim()).join('|')").startswith("打字|放照片|聊天里的照片|贴纸"), "加东西的那一排：放照片后头多了“聊天里的照片”")
        ftap(f, "[data-kfs='chatph']")
        ok(fwait(f, "document.querySelectorAll('.kfs-ph').length === 2"), "今天聊天里的两张照片摆出来挑")
        ftap(f, ".kfs-ph", 0); ftap(f, ".kfs-ph", 1); ftap(f, ".kfs-ph-go")
        ok(fwait(f, "document.querySelectorAll('#page .stk.placed[data-c=pic] img').length === 2", 20), "挑两张放进来：纸上两张照片（走同页自己放照片那条路）")
        f.locator("#addFab input[type=file]").set_input_files({"name": "相册里的.png", "mimeType": "image/png", "buffer": fake_photo((200, 230, 210))})
        ok(fwait(f, "document.querySelectorAll('#page .stk.placed[data-c=pic] img').length === 3", 20), "从相册放一张：三张")
        f.evaluate("select && select(null)"); time.sleep(0.3)
        ftap(f, "#noteBtn")
        f.evaluate("""(() => { const pg = document.getElementById('page'); const r = pg.getBoundingClientRect(); const x = r.left + r.width * 0.75, y = r.top + 120;
            pg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true })); })()""")
        ok(fwait(f, "!!document.querySelector('.npop textarea')"), "点“批注”、点纸上：出来一个气泡")
        f.evaluate("(() => { const t = document.querySelector('.npop textarea'); t.value = '这张是蹲着拍的'; })()")
        ftap(f, ".npop .in button"); time.sleep(1.0)
        ok(f.evaluate("document.querySelectorAll('#page .npin').length") == 1, "留下了：纸上一颗批注")
        ftap(f, "#saveBtn"); ftap(f, "#genSave"); time.sleep(0.8)
        ok("第 1 代" in f.evaluate("document.getElementById('genList').innerText"), "存一代：第 1 代")
        ftap(f, "#shotBtn")
        ok(fwait(f, "(() => { const i = document.querySelector('.shot img'); return !!i && i.naturalWidth > 300; })()", 40), "存长图：整页画成一张图（框里的安全规矩没拦）")
        ftap(f, ".shot [data-x]")
        time.sleep(1.5)
        G = kvj(pa, f"kfs2:ty:gens/{today}")
        P = kvj(pa, f"kfs2:ty:page/{today}")
        L = kvj(pa, f"kfs2:tyls:journalLook:{today}") or {}
        pics = [s for s in (P or {}).get("stk", []) if s["c"] == "pic"]
        mine = [kvj(pa, "kfs2:ty:mine/" + s["k"]) for s in pics]
        ok(G and len(G["list"]) == 1 and len(pics) == 3 and all(m and m["src"].startswith("kfsimg:") and m["day"] == today for m in mine),
           "存档里：一代、三张照片（同页的 mine，图写成 kfsimg:<编号>、日子写成年-月-日）")
        imgs = [k for k in pa.evaluate(TYKEYS) if k.startswith("kfs2:jzimg:")]
        ok(len(imgs) == 4, f"照片存进 kfs2:jzimg:（挪过来的那张加今天三张：{len(imgs)}）")
        close_ty(pa, f)
        ok(kvj(pa, f"kfs2:tyls:journalLook:{today}") == {"layout": "polaroid", "style": "kraft"}, "这一天挑的版式风格记下了（跟着云端走）")

        # ================= 回到闲笔集 =================
        card = pa.locator(".kfs-jz-open").inner_text()
        ok("（还没起标题）" in card and "拍立得墙 × 牛皮纸" in card and "批注 1" in card and pa.locator(".kfs-jz-open img").count() == 1, f"今天的卡片：拍立得墙 × 牛皮纸、批注 1、她放的照片当主照片（{card!r}）")
        ok(pa.locator(".kfs-page .kfs-jz-tag").count() == 2, "日历上今天也有 🏷️ 了")
        ok(pa.locator(".kfs-day-note").count() == 1 and "这张是蹲着拍的" in pa.locator(".kfs-day-note").first.inner_text(), "闲笔集里那一天底下：那条批注")
        pa.locator(".kfs-day-noteadd").click(); time.sleep(0.3)
        pa.locator(".kfs-day-notein").fill("在闲笔集里留的一句")
        pa.locator(".kfs-day-noteok").click(); time.sleep(0.8)
        ok(pa.locator(".kfs-day-note").count() == 2, "在闲笔集里再留一条：两条")
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        st = page_state(f)
        ok(st["layout"] == "polaroid" and st["style"] == "kraft" and len(st["pics"]) == 3 and all(w > 0 for w in st["pics"]) and "text:泡桐花开了" in st["stk"] and st["pins"] == 2,
           f"再打开：拍立得墙、牛皮纸、三张照片都显示、写的字在、批注两颗（闲笔集里留的那条贴在页角）（{st}）")
        close_ty(pa, f)
        pa.locator(".kfs-day-notedrop").last.click(); time.sleep(0.2)
        pa.locator(".kfs-day-notedrop").last.click(); time.sleep(0.8)
        ok(pa.locator(".kfs-day-note").count() == 1, "删一条（点两下）：剩一条")

        # ================= 第二台设备 =================
        time.sleep(3)
        B = browser.new_context(**IPHONE)
        B.add_init_script(STUB)
        pb = B.new_page()
        pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
        second_device(pb)
        time.sleep(2)
        open_xianbi(pb)
        card_b = pb.locator(".kfs-jz-open").inner_text()
        ok("拍立得墙 × 牛皮纸" in card_b and "批注 1" in card_b, f"第二台：今天的卡片照样（{card_b!r}）")
        pb.locator(".kfs-jz-open").click()
        fb = fx(pb)
        ok(fb is not None and fwait(fb, "[...document.querySelectorAll('#page .stk.placed[data-c=pic] img')].filter((i) => i.naturalWidth > 0).length === 3", 20)
           and page_state(fb)["style"] == "kraft", "第二台打开：牛皮纸，三张照片都在（图跟着同步过来）")
        B.close()

        # ================= 他翻日记看得到这一本；他留批注 =================
        leave_xianbi(pa)
        n1 = len(calls())
        say(pa, f"翻日记 {today}")
        wait_mock(lambda: len(calls()) >= n1 + 2, 30); wait_js(pa, "!(" + TYPING + ")", 30000); time.sleep(1.5)
        c = his_last_call(pa)
        out = c.get("out") or ""
        ok(c.get("name") == "diary_read" and "手帐：有一页（她自己拼的；版式 拍立得墙，风格 牛皮纸）" in out and "照片 3 张：她贴上去的 3 张" in out and "她在页上写的字：“泡桐花开了”" in out
           and "批注 1 条：" in out and "这张是蹲着拍的" in out,
           f"他翻今天的日记：同页那一页（谁拼的、版式风格、几张照片、她写的字）和那条批注都跟着（{out[out.find('手帐'):][:200]!r}）")
        n2 = len(calls())
        say(pa, f"留批注 {today} 那天的泡桐花")
        wait_mock(lambda: len(calls()) >= n2 + 2, 30); wait_js(pa, "!(" + TYPING + ")", 30000); time.sleep(1.5)
        c = his_last_call(pa)
        N = kvj(pa, "kfs2:ty:notes/" + c.get("id", "x"))
        ok(c.get("name") == "diary_note" and not c.get("err") and "主照片旁边" in (c.get("out") or "") and N and N["who"] == "me" and N["day"] == today and N["text"] == "那天的泡桐花" and N["b"] == "he",
           f"他留批注：存成同页的一条（他的、今天、贴在主照片旁边，编号就是他调的那一样的编号）（{N}）")
        cont = calls()[n2 + 1]["body"]["messages"][-1]["content"][0]
        ok(cont["type"] == "tool_result" and "留好了" in str(cont["content"]), f"留好了递回给他（{str(cont['content'])[:40]}）")
        open_xianbi(pa)
        pick_day(pa, td)
        notes_txt = [x.inner_text() for x in pa.locator(".kfs-day-note").all()]
        ok(len(notes_txt) == 2 and "那天的泡桐花" in notes_txt[-1], f"闲笔集里今天底下：他那一条也在（{notes_txt}）")
        ok("批注 2" in pa.locator(".kfs-jz-open").inner_text(), "卡片上：批注 2")
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        ok(f is not None and page_state(f)["pins"] == 2, "点开：纸上两颗批注（他那一颗也在）")
        close_ty(pa, f)

        # ================= 删掉一页、找回来（同页「存」最底下，30 天内能找回） =================
        pick_day(pa, fd_)
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        ftap(f, "#saveBtn")
        ok(fwait(f, "!!document.querySelector('#delPageBtn') && /删掉/.test(document.querySelector('#delPageBtn').innerText)") and f.evaluate("document.querySelector('#delYes').offsetParent === null"),
           "「存」最底下：删掉这一页（“真的删掉”先藏着）")
        ftap(f, "#delPageBtn")
        ok(f.evaluate("document.querySelector('#delYes').offsetParent !== null"), "点了“删掉这一页”才露出“真的删掉”")
        ftap(f, "#delYes")
        ok(gone(pa), "删掉：同页说一声，关上回闲笔集（不在框里重新载入）")
        ok(pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐" and kvj(pa, f"kfs2:ty:day/{fday}") is None and kvj(pa, "kfs2:ty:notes/nold1") is None and len(trash_keys(pa)) == 1,
           "昨天变回“掺一页手帐”；那一页连批注挪进废纸篓（同页的 trash）")
        ok(pa.locator(".kfs-page .kfs-jz-tag").count() == 1, "日历上昨天的 🏷️ 没了（原来那一版的存档还在，也不再挪一回）")
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        ftap(f, "#saveBtn")
        ok(fwait(f, "document.querySelectorAll('#trashList [data-tr]').length === 1"), "再点开昨天（一页空的）、「存」最底下：最近删掉的有一页")
        ftap(f, "#trashList [data-tr]")
        ok(gone(pa), "找回：关上回闲笔集")
        R = kvj(pa, f"kfs2:ty:day/{fday}")
        ok(R and R["title"] == "泡桐花" and kvj(pa, "kfs2:ty:notes/nold1") and not trash_keys(pa), f"找回来了：那一页、批注都在，废纸篓空了（点开就起的那一页空的直接盖掉，没进废纸篓：{trash_keys(pa)}）")
        ok("泡桐花" in pa.locator(".kfs-jz-open").inner_text() and pa.locator(".kfs-page .kfs-jz-tag").count() == 2, "闲笔集里昨天的卡片、🏷️ 都回来了")

        # ================= 云端只有乱码 =================
        rows = mock("/__debug/rows")
        flat = json.dumps(rows, ensure_ascii=False)
        leaks = [w for w in ["泡桐花", "蹲着拍的", "那天真好", "某城", "kraft", "polaroid", "journalLook", "kfsimg", "kfs2:ty"] if w in flat]
        ok(not leaks, f"云端只有乱码（字、城市、版式风格、键名都看不见：{leaks}）")
    except Exception as e:
        import traceback; traceback.print_exc()
        ok(False, f"出错：{e}")
    finally:
        ok(not refused, f"框里的安全规矩没拦同页自己的脚本：{refused[:2]}")
        ok(not errors, f"页面没报错：{errors[:3]}")
        print(f"\n通过 {count['passed']}  失败 {count['failed']}")
        browser.close()
    raise SystemExit(1 if count["failed"] or errors else 0)
