# 同页那一本手帐搬进开封府（10 月 18 日，作者同意了；见开发说明“同页搬进来”那一节、src/tongye/、tools/tongye.mjs）的端到端测试。
# 真的浏览器、假 Supabase，一台“手机”从头走到尾，再拿第二台对一下：
#   原来那一版手帐掺的页（kfs2:jz:）挪过来；闲笔集日历上的 🏷️、那一天底下的卡片；点开是同页（隔开的框，碰不到开封府）；
#   点开没动不留；天气在哪儿（Open-Meteo 用 page.route 假的）；字（开封府自己带着，不连 Google；换风格那一层的小样）；
#   换版式风格、打字、聊天里的照片、相册的照片、批注、存一代、存长图；
#   关上再开都在；打完字马上关也存上了；闲笔集里留、删批注；照片库多了六十张，点开照片照样摆齐、没动手一笔不存；
#   第二台设备同步过去照样；他翻日记看得到这一本、他留的批注贴在页上；删掉一页（同页「存」最底下）、找回来；
#   交给光义（那一天的那一屏 →「交给光义」→ 他排好了，她那一层一样不动；没排成说一声、不起页）；
#   框里不带暗号来问的一概不理；云端只有乱码；框里的安全规矩没拦它自己的脚本。
# 同页的框是隔开的（sandbox），Playwright 往里点有时点歪（框在手机模式下的坐标），框里的点都直接发给那个元素（ftap）。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080，用 tests/serve.py 起：照 GitHub Pages 带 Access-Control-Allow-Origin，
# 框里才取得到字），再：python3 tests/e2e_tongye.py
import base64, io, json, os, re, time
from datetime import date, timedelta
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
refused = []
wx_log = []
google = []    # 向 Google Fonts 要过字的（一次都不该有）
font_bad = []  # 取字被拦下的（跨来路、安全规矩）

# 字取到了：那一种字至少有一块取回来了
def font_in(fam):
    return f"[...document.fonts].some((x) => x.family.replace(/[\"']/g, '') === '{fam}' && x.status === 'loaded')"

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

def day_screen(page, wait=30):
    # 框里那一页摆好了、停在那一天的那一屏（同页本子首页点一天的那一屏：交给光义、自己拼）
    end = time.time() + wait
    while time.time() < end:
        try:
            el = page.query_selector("iframe.kfs-ty-frame")
            f = el.content_frame() if el else None
            if f and f.evaluate("!!window.__kfsShell && document.getElementById('sDay').classList.contains('on')"):
                time.sleep(0.8)
                return f
        except Exception:
            pass
        time.sleep(0.3)
    return None

def self_page(page, f):
    # 那一天的那一屏点“自己拼”：进编辑器
    ftap(f, "#toSelf")
    return fx(page)

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

def close_ty(page, f, fast=False):
    # 编辑器左上角回本子，再点本子左上角“闲笔集”（关之前那一层先把没存的存了，等框拆了）。fast：两下连着点，不停
    ftap(f, ".backhome"); time.sleep(0.05 if fast else 0.8)
    ftap(f, ".kfs-close")
    end = time.time() + 15
    while time.time() < end and page.locator("iframe.kfs-ty-frame").count():
        time.sleep(0.2)
    time.sleep(1.0)

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

def kv_until(page, key, pred, timeout=12):
    # 存档里那一条等到合 pred 为止（框里点了以后外面存要一会儿）
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

# 在框里点一下（按下、抬起、click 都发：批注那一下是按下的时候接的）
TAP = """(sel) => { const e = document.querySelector(sel); if (!e) throw new Error('没有 ' + sel); const r = e.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + Math.min(8, r.width / 2), clientY: r.top + r.height / 2, pointerType: 'touch', isPrimary: true, pointerId: 7 };
  e.dispatchEvent(new PointerEvent('pointerdown', o)); e.dispatchEvent(new PointerEvent('pointerup', o)); e.click(); }"""
H2 = "#page .title h2"
H2TXT = "(document.querySelector('#page .title h2') || {}).innerText"

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
    pa.on("console", lambda m: font_bad.append(m.text[:200]) if re.search(r"blocked by CORS|Refused to load", m.text) else None)
    A.on("request", lambda r: google.append(r.url) if re.search(r"fonts\.(googleapis|gstatic)\.com", r.url) else None)
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
        ok(R and R.get("herTitle") == "泡桐花" and R["title"] == "" and R["layout"] == "column" and R["style"] == "washi" and R["photos"][0]["src"] == "kfsimg:jzold1" and R["photos"][0]["role"] == "hero"
           and R["chat"] == [{"w": "her", "t": "16:12", "p": "今天看到泡桐花了"}] and R["by"] == "her",
           "挪过来的那一天（同页的 day）：标题照她改的（她自己拼的一页，记成她起的）、单栏流、和纸（青墨素纸那几种同名的换成同页的）、主照片还是那张图、原话照原样")
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
        # 字：开封府自己带着（tools/tyfonts.mjs），不连 Google。框是隔开的（来路是 null），取字要 Access-Control-Allow-Origin（GitHub Pages 带着，测试网页 tests/serve.py 照样带）
        links = f.evaluate("[...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href'))")
        base6 = ["noto-serif-sc-300", "noto-serif-sc-400", "noto-serif-sc-600", "ibm-plex-mono-400", "ibm-plex-mono-500", "long-cang-400"]
        names = [h.split("/")[-1][:-4] for h in links]
        ok(all(re.match(r"^\./tyfonts-[0-9a-f]{10}/[a-z0-9-]+\.css$", h) for h in links) and all(n in names for n in base6) and "zcool-xiaowei-400" in names and len(names) == len(set(names)),
           f"字的样式表都是开封府自己的：原来取 Google 那一行换成的六张，和纸要的 ZCOOL XiaoWei 换上风格的时候挂上，不重复（{names}）")
        ok(fwait(f, font_in("ZCOOL XiaoWei") + " && " + font_in("Noto Serif SC") + " && " + font_in("IBM Plex Mono"), 25),
           "字取到了：标题的 ZCOOL XiaoWei、正文的思源宋体、小字的 IBM Plex Mono（没取到的话测试网页要用 tests/serve.py 起）")
        st = page_state(f)
        ok("emoji:fox" in st["stk"] and "text:那天真好" in st["stk"] and st["pins"] == 1, f"她贴的狐狸、写的字、那条批注的小记号都在（{st['stk']}，批注 {st['pins']}）")
        iso = f.evaluate("""() => { const r = {}; try { r.parent = !!window.parent.document; } catch (e) { r.parent = 'blocked'; }
          try { indexedDB.open('kfs-local'); r.idb = 'open'; } catch (e) { r.idb = 'blocked'; }
          try { window.localStorage.getItem('x'); r.ls = 'open'; } catch (e) { r.ls = 'blocked'; }
          try { r.cookie = document.cookie; } catch (e) { r.cookie = 'blocked'; } return r; }""")
        ok(iso == {"parent": "blocked", "idb": "blocked", "ls": "blocked", "cookie": "blocked"}, f"框是隔开的：碰不到开封府的网页、存档、这台设备上的东西、cookie（{iso}）")
        sb = pa.evaluate("document.querySelector('iframe.kfs-ty-frame').getAttribute('sandbox')")
        ok(sb == "allow-scripts allow-downloads", f"框的 sandbox 只给跑脚本、存长图（{sb}）")
        bad = f.evaluate("""async () => { const P = window.parent; const ask = (method, args, tok) => new Promise((res) => { const id = 900000 + Math.floor(Math.random() * 1000);
            const h = (e) => { if (e.data && e.data.re === id) { removeEventListener('message', h); res(e.data); } }; addEventListener('message', h);
            P.postMessage({ kfsTy: 1, tok, id, method, args }, '*'); setTimeout(() => res('no answer'), 2500); });
          return [await ask('get', { k: 'kfs2:ty:cfg/main' }), await ask('get', { k: 'kfs2:settings' }, 'guess'), await ask('list', { prefix: 'kfs2:ty:' }, ''), await ask('sources', { date: '2026-10-18' })]; }""")
        ok(bad == ["no answer"] * 4, f"框里不带暗号来要东西（连这一本自己的都算上）：一样都不理（{bad}）")
        ok(f.evaluate("window.name") == "" and f.evaluate("typeof window.__kfsTok") == "undefined", "开门带进去的东西（连暗号）读完就清了，框里别处拿不到")
        close_ty(pa, f)
        ok(pa.locator("iframe.kfs-ty-frame").count() == 0 and "泡桐花" in pa.locator(".kfs-jz-open").inner_text(), "回本子、再点“闲笔集”：框拆了，回到昨天那一天，卡片还在")

        # ================= 今天：点开没动，不留 =================
        pick_day(pa, td)
        ok(pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐", "今天还没掺：卡片是“掺一页手帐”")
        pa.locator(".kfs-jz-open").click()
        f = day_screen(pa)
        ok(f is not None and f.evaluate("document.getElementById('toChat').offsetParent !== null && document.getElementById('toSelf').offsetParent !== null")
           and "交给光义" in f.evaluate("document.getElementById('toChat').innerText"), "点开：同页那一天的那一屏（本子首页点一天的那一屏），「交给光义」「自己拼」两颗")
        ok(fwait(f, "document.querySelectorAll('#dayThumbs img').length === 2 && [...document.querySelectorAll('#dayThumbs img')].every((i) => i.naturalWidth > 0)")
           and re.search(r"2\s*张照片", f.evaluate("document.getElementById('dayFound').innerText")) and not re.search(r"样吃的", f.evaluate("document.getElementById('dayFound').innerText")),
           f"照片那一栏是她今天在聊天里发的两张，聊了几句照今天的原话数（“几样吃的”开封府没有，不摆）（{f.evaluate('document.getElementById(\'dayFound\').innerText')!r}，{f.evaluate('[...document.querySelectorAll(\'#dayThumbs img\')].map((i) => i.naturalWidth)')}）")
        f = self_page(pa, f)
        ok(f is not None, "点“自己拼”：进同页的编辑器")
        close_ty(pa, f)
        ok(kvj(pa, f"kfs2:ty:day/{today}") is None and kvj(pa, f"kfs2:ty:page/{today}") is None and pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐",
           "什么都没动就关了：这一页不留（同原来那一版“点开不动不存”），卡片还是“掺一页手帐”")

        # ================= 天气在哪儿 =================
        pa.locator(".kfs-jz-open").click()
        f = self_page(pa, day_screen(pa))
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

        # ================= 换风格那一层的小样：各用各的字 =================
        n_links = f.evaluate("document.querySelectorAll('link[rel=stylesheet]').length")
        f.evaluate("openSheet()"); time.sleep(0.6)
        ok(fwait(f, " && ".join(font_in(x) for x in ["ZCOOL KuaiLe", "Silkscreen", "Playfair Display", "Ma Shan Zheng", "Unbounded", "Noto Sans SC"]), 30),
           "换风格那一层：二十六张小样各用各的字（孟菲斯的 ZCOOL KuaiLe、像素的 Silkscreen、报纸的 Playfair Display、宣纸的马善政、Y2K 的 Unbounded、几种无衬线的思源黑体……）")
        only_pv = f.evaluate("""(() => { const pv = new Set([...'0123456789.这一天的标题'].map((c) => c.codePointAt(0)));
            const fs = [...document.fonts].filter((x) => x.family.replace(/["']/g, '') === 'ZCOOL KuaiLe');
            return fs.length > 0 && fs.every((x) => x.unicodeRange.split(',').every((r) => { const [a, b] = r.trim().replace(/^U\\+/i, '').split('-');
              const lo = parseInt(a, 16), hi = b ? parseInt(b, 16) : lo; for (let c = lo; c <= hi; c++) if (!pv.has(c)) return false; return true; })); })()""")
        ok(f.evaluate("document.querySelectorAll('link[rel=stylesheet]').length") == n_links and only_pv,
           "小样只认小样上那几个字（“0123456789.这一天的标题”），不挂样式表（存长图的时候不带它们，同原版）")
        f.evaluate("closeSheet()"); time.sleep(0.6)

        # ================= 拼一页 =================
        f.evaluate("applyStyle('kraft'); applyLayout('polaroid')"); time.sleep(1.2)
        ok(fwait(f, font_in("Special Elite"), 20) and f.evaluate("[...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.getAttribute('href').endsWith('/special-elite-400.css'))"),
           "换成牛皮纸：它要的打字机字（Special Elite）挂上、取到了")
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
        f.evaluate("window.journalAdd.text()"); time.sleep(0.8)
        pa.keyboard.type("最后一笔")
        close_ty(pa, f, fast=True)
        P = kvj(pa, f"kfs2:ty:page/{today}")
        ok(any(s["c"] == "text" and s.get("m") == "最后一笔" for s in P["stk"]), "打完字马上关（同页停手 0.7 秒才存）：最后一笔也存上了（关之前先存）")
        pa.locator(".kfs-day-notedrop").last.click(); time.sleep(0.2)
        pa.locator(".kfs-day-notedrop").last.click(); time.sleep(0.8)
        ok(pa.locator(".kfs-day-note").count() == 1, "删一条（点两下）：剩一条")

        # ================= 照片库大了：点开那一下照片摆得齐；没动手一笔不存 =================
        P0 = kvj(pa, f"kfs2:ty:page/{today}")
        pics0 = [s for s in P0["stk"] if s["c"] == "pic"]
        base = kvj(pa, "kfs2:ty:mine/" + pics0[0]["k"])
        recs = []
        for i in range(60):
            m = dict(base)
            m["id"] = f"mx{i}"; m["src"] = f"kfsimg:mximg{i}"; m["at"] = int(base.get("at") or 0) + i + 1
            if "asset" in m:
                m["asset"] = f"mximg{i}"
            recs.append({"k": f"kfs2:ty:mine/mx{i}", "v": json.dumps(m, ensure_ascii=False), "dirty": 1, "del": 0})
            recs.append({"k": f"kfs2:jzimg:mximg{i}", "v": data_url(((i * 37) % 255, 120, 200)), "dirty": 1, "del": 0})
        Py = kvj(pa, f"kfs2:ty:page/{fday}")
        for x in Py["stk"]:
            if x.get("m") == "那天真好":
                x["kc"] = "red;background:url(https://example.invalid/x.png)"
        recs.append({"k": f"kfs2:ty:page/{fday}", "v": json.dumps(Py, ensure_ascii=False), "dirty": 1, "del": 0})
        pa.evaluate(PUT, recs)
        pa.reload(); kite(pa)
        open_xianbi(pa)
        pick_day(pa, td)
        pa.locator(".kfs-jz-open").click()
        f = fx(pa, 40)
        ok(f is not None and fwait(f, "[...document.querySelectorAll('#page .stk.placed[data-c=pic] img')].filter((i) => i.naturalWidth > 0).length === 3", 30),
           "照片库里多了六十张：点开那一下她放的三张照片照样摆齐（等照片库取齐了才开）")
        time.sleep(3)
        P1 = kvj(pa, f"kfs2:ty:page/{today}")
        ok(P1 and P1.get("ts") == P0.get("ts") and len([s for s in P1["stk"] if s["c"] == "pic"]) == 3, "没动手：那一页一笔没存（还是原来那一份，三张照片都在）")
        close_ty(pa, f)
        P2 = kvj(pa, f"kfs2:ty:page/{today}")
        ok(P2 and P2.get("ts") == P0.get("ts"), "关上：也没存")

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
        kc_bad = f.evaluate("""(() => { const s = [...document.querySelectorAll('#page .stk.placed[data-c=text]')].find((x) => (x.querySelector('.mt') || {}).innerText === '那天真好');
            return s ? [s.style.getPropertyValue('--kc'), getComputedStyle(s.querySelector('.tbox')).color, getComputedStyle(s.querySelector('.tbox')).backgroundImage] : null; })()""")
        ok(kc_bad and kc_bad[0] == "" and kc_bad[1] != "rgb(255, 0, 0)" and kc_bad[2] == "none", f"存档里那一段字的颜色不规矩（不是 # 加六位）：摆回来的时候不用（{kc_bad}）")
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
        f = self_page(pa, day_screen(pa))
        ftap(f, "#saveBtn")
        ok(fwait(f, "document.querySelectorAll('#trashList [data-tr]').length === 1"), "再点开昨天（一页空的）、「存」最底下：最近删掉的有一页")
        ftap(f, "#trashList [data-tr]")
        ok(gone(pa), "找回：关上回闲笔集")
        R = kvj(pa, f"kfs2:ty:day/{fday}")
        ok(R and R.get("herTitle") == "泡桐花" and kvj(pa, "kfs2:ty:notes/nold1") and not trash_keys(pa), f"找回来了：那一页、批注都在，废纸篓空了（点开那一下什么都没写，没多出一页空的进废纸篓：{trash_keys(pa)}）")
        ok("泡桐花" in pa.locator(".kfs-jz-open").inner_text() and pa.locator(".kfs-page .kfs-jz-tag").count() == 2, "闲笔集里昨天的卡片、🏷️ 都回来了")

        # ================= 交给光义：另问他一回，不进聊天；她那一层一样不动 =================
        P_before = kvj(pa, f"kfs2:ty:page/{today}")
        look_before = kvj(pa, f"kfs2:tyls:journalLook:{today}")
        _, msgs_before = chat_of(pa)
        pick_day(pa, td)
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        ftap(f, ".backhome"); time.sleep(0.8)
        ftap(f, "#shToday")
        ok(fwait(f, "document.getElementById('sDay').classList.contains('on')"), "编辑器回本子、点今天：那一天的那一屏")
        n0 = len(calls())
        ftap(f, "#toChat")
        ok(fwait(f, "document.getElementById('sChat').classList.contains('on') && /交给我吧/.test(document.getElementById('msgs').innerText)"), "「交给光义」：同页原来的那一屏（他开场那一句是同页原来的）")
        ok(fwait(f, "document.querySelectorAll('#att .ap img').length === 2 && [...document.querySelectorAll('#att .ap img')].every((i) => i.naturalWidth > 0)"),
           "先挑上她今天在聊天里发的那两张（她能拿掉、能从相册再添）")
        f.evaluate("(() => { const t = document.getElementById('chIn'); t.value = '安安静静的，标题带尖括号'; })()")
        ftap(f, "#chSend")
        ok(fwait(f, "!!document.querySelector('#msgs .done')", 40), "发出去：“在排”那一栏一步一步亮，排好了冒出“打开这一页”")
        log = f.evaluate("[...document.querySelectorAll('#msgs .log .r')].map((r) => r.className + '|' + r.innerText.replace(/\\n/g, ' '))")
        ok(len(log) == 2 and all(" ok|" in x for x in log) and "看了这天的照片和聊天" in log[0] and "2 张照片" in log[0] and "排好了" in log[1] and "照你挑的版式风格" in log[1],
           f"“在排”那一栏：看了这天的照片和聊天、排好了（她自己挑过版式风格，照她的）（{log}）")
        arr = [c for c in calls()[n0:] if any(str(x.get("text", "")).startswith("【排手帐】") for x in (c["body"].get("system") or []) if isinstance(x, dict))]
        ok(len(arr) == 1, f"另问了他一回（{len(arr)}）")
        body = arr[0]["body"] if arr else {}
        utext = "\n".join(b.get("text", "") for b in (body.get("messages") or [{}])[0].get("content", []) if b.get("type") == "text")
        imgs = [b for b in (body.get("messages") or [{}])[0].get("content", []) if b.get("type") == "image"]
        ok("她说想要：安安静静的，标题带尖括号" in utext and "照片1（她发过来的" in utext and "照片2（她发过来的" in utext and len(imgs) == 2 and "｜卿卿｜今天看到泡桐花了" in utext
           and "她自己挑的版式、风格：拍立得墙 × 牛皮纸" in utext and "“泡桐花开了”" in utext and "天气：小雨" in utext and not body.get("tools"),
           "寄给他的：她想要的、她挑的两张照片（图跟着）、今天的原话（带编号）、她动过的（挑的版式风格、页上打的字）、天气；不带工具")
        _, msgs_after = chat_of(pa)
        ok(len(msgs_after) == len(msgs_before), "不进聊天（聊天里一条都没多）")
        R = kvj(pa, f"kfs2:ty:day/{today}")
        ok(R and R["by"] == "me" and R["status"] == "done" and R["title"] == "（测试排的）＜b＞泡桐花＜/b＞" and R["layout"] == "bento" and R["style"] == "film" and R.get("at") == "某城" and R["wx"]["code"] == 61,
           f"今天的 day 换成他排的：标题里的尖括号换成全角的、他挑的版式风格记着、天气在哪儿带上（{ {k: R.get(k) for k in ['by', 'title', 'layout', 'style']} if R else None}）")
        ok(R and [p["role"] for p in R["photos"]] == ["hero", ""] and all(p["src"].startswith("kfsimg:") and pa.evaluate(KV, "kfs2:jzimg:" + p["src"][7:]) for p in R["photos"]),
           "照片：他挑的两张（一张主照片，只挑了一张双联照不成对），从聊天里另存一份（编的那一张不要）")
        ok(R and len(R["chat"]) == 2 and all(q["p"] and q["p"] != "编的编号" for q in R["chat"]), "原话：照编号抄两句（编的编号认不出，不要）")
        ok(kvj(pa, f"kfs2:ty:page/{today}") == P_before and kvj(pa, f"kfs2:tyls:journalLook:{today}") == look_before, "她那一层一样没动：她贴的、打的字、藏的，她挑的版式风格")
        mine_note = [kvj(pa, k) for k in pa.evaluate(TYKEYS) if k.startswith("kfs2:ty:notes/")]
        ok(any(n and n["who"] == "me" and n["text"] == "（测试批注）这张我最喜欢" and n["b"] == "he" and n["day"] == today for n in mine_note), "他顺手留的一条批注：贴在主照片旁边")
        asks = [kvj(pa, k) for k in pa.evaluate(TYKEYS) if k.startswith("kfs2:ty:ask/")]
        ok(len(asks) == 1 and asks[0]["status"] == "done" and asks[0]["day"] == today and len(asks[0]["photos"]) == 2 and all(x.startswith("kfschat:") for x in asks[0]["photos"]),
           f"她发的那一张 ask：寄的照片是开封府认得的编号（聊天里的），排好了记成 done（{asks}）")
        ftap(f, "#msgs .done")
        ok(fwait(f, "document.documentElement.classList.contains('app-mode')", 15), "点“打开这一页”：进编辑器")
        time.sleep(1.5)
        # 冒出来的小提示都记下来（同页的 toast）
        f.evaluate("""(() => { window.__seen = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { const t = (n.textContent || '').trim(); if (t) window.__seen.push(t); })))
            .observe(document.body, { childList: true, subtree: true, characterData: true }); })()""")
        f.evaluate(TAP, H2)
        fwait(f, "!!document.querySelector('.kfs-ti') && /清空就/.test(document.querySelector('.kfs-ti-tip').innerText)")
        f.evaluate("(() => { const i = document.querySelector('.kfs-ti-in'); i.focus(); i.select(); })()")
        pa.keyboard.type("先起一个")
        ftap(f, ".kfs-ti-ok")
        kv_until(pa, f"kfs2:ty:day/{today}", lambda R: R.get("herTitle") == "先起一个")
        time.sleep(2.0)
        seen = f.evaluate("window.__seen.filter((t) => /刚更新了这一页/.test(t))")
        ok(not seen and (kvj(pa, f"kfs2:ty:day/{today}") or {}).get("herTitle") == "先起一个", f"他排好了、她点开以后自己起了个标题：不冒“光义刚更新了这一页”（{seen}）")
        f.evaluate(TAP, H2)
        fwait(f, "!!document.querySelector('.kfs-ti') && /清空就/.test(document.querySelector('.kfs-ti-tip').innerText)")
        f.evaluate("(() => { const i = document.querySelector('.kfs-ti-in'); i.focus(); i.select(); })()")
        pa.keyboard.press("Backspace"); pa.keyboard.press("Enter")
        kv_until(pa, f"kfs2:ty:day/{today}", lambda R: "herTitle" not in R)
        fwait(f, "!document.querySelector('.kfs-ti')")
        hn = f.evaluate("""(() => { const R = (ts, o) => Object.assign({ day: '1.1', ts, by: 'me', status: 'done', steps: [] }, o || {});
            __kfsIngest(R(1)); const a = __kfsHisNew(R(1)); __kfsIngest(R(2)); const b = __kfsHisNew(R(2)); const c = __kfsHisNew(R(2));
            __kfsIngest(R(3, { by: 'her' })); const d = __kfsHisNew(R(3, { by: 'her' })); __kfsIngest(R(4, { steps: [{ fail: 1 }] })); const e = __kfsHisNew(R(4, { steps: [{ fail: 1 }] }));
            __kfsIngest(R(4)); const g = __kfsHisNew(R(4)); return [a, b, c, d, e, g]; })()""")
        ok(hn == [False, True, False, False, False, False], f"“光义刚更新了这一页”只在那一天收到他新排好的一份（钟点变了）的时候说一回：头一回收到、同一份再收、她拼的、没排成的都不说（{hn}）")
        st = page_state(f)
        ok(st["layout"] == "polaroid" and st["style"] == "kraft" and "（测试排的）＜b＞泡桐花＜/b＞" in (st["title"] or "") and f.evaluate("!document.querySelector('.title h2 b')")
           and len(st["pics"]) == 3 and "text:泡桐花开了" in st["stk"] and st["pins"] == 3,
           f"那一页：照她挑的拍立得墙、牛皮纸；题签是他起的（尖括号照字摆，没当成加粗）；她放的三张照片、打的字都在；批注三颗（{st}）")
        ftap(f, ".backhome"); time.sleep(0.8)
        f.evaluate("(() => { try { window.__kfsShell.home(); } catch (e) {} })()"); time.sleep(0.6)
        ok(f.evaluate("[...document.querySelectorAll('#rec .card b')].some((b) => b.textContent.includes('（测试排的）＜b＞泡桐花') && !b.querySelector('b'))"),
           "本子首页那一列：他起的标题照字摆（同页那儿是直接当 HTML 画的，尖括号换成全角就画不成别的）")
        close_ty(pa, f)
        card = pa.locator(".kfs-jz-open").inner_text()
        ok("（测试排的）＜b＞泡桐花＜/b＞" in card and "拍立得墙 × 牛皮纸" in card and "他排的" in card, f"闲笔集今天的卡片：他起的标题、她挑的版式风格、他排的（{card!r}）")

        # ================= 她自己起标题（点纸上的题签；她 10 月 18 日看了样子说“可以”）：他起的留着，不盖 =================
        his_t = "（测试排的）＜b＞泡桐花＜/b＞"
        dkey = f"kfs2:ty:day/{today}"
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        ftap(f, "#noteBtn")
        f.evaluate(TAP, H2); time.sleep(0.6)
        ok(f.evaluate("!document.querySelector('.kfs-ti') && !!document.querySelector('.npop')"), "正开着“批注”的时候点题签：照旧是批注（冒的是批注的气泡），不冒起标题那一条")
        ftap(f, ".npop [data-nx]")
        ftap(f, "#xray")
        f.evaluate(TAP, H2); time.sleep(0.6)
        ok(f.evaluate("document.getElementById('app').classList.contains('xray') && !document.querySelector('.kfs-ti')"), "正开着“拆零件”的时候点题签：也不冒")
        ftap(f, "#xray")
        f.evaluate(TAP, H2)
        ok(fwait(f, f"!!document.querySelector('.kfs-ti') && document.querySelector('.kfs-ti-in').value === '{his_t}' && /清空就用回光义起的/.test(document.querySelector('.kfs-ti-tip').innerText)"),
           "点一下题签：底下冒出一条打标题，填着他起的；底下一行写着清空就用回光义起的")
        geo = f.evaluate("""(() => { const b = document.querySelector('.kfs-ti').getBoundingClientRect(), h = document.querySelector('#page .title h2').getBoundingClientRect(), p = document.getElementById('page').getBoundingClientRect();
            return [Math.round(b.top - h.bottom), Math.round(b.left - p.left), Math.round(p.right - b.right)]; })()""")
        ok(4 <= geo[0] <= 24 and geo[1] >= 0 and geo[2] >= 0, f"那一条摆在题签底下、在纸里（离题签、纸的左右：{geo}）")
        f.evaluate("(() => { const i = document.querySelector('.kfs-ti-in'); i.focus(); i.select(); })()")
        pa.keyboard.type("不要了")
        ok(f.evaluate(H2TXT).strip() == "不要了", "边打纸上边换")
        pa.keyboard.press("Escape"); time.sleep(0.8)
        ok(f.evaluate("!document.querySelector('.kfs-ti')") and f.evaluate(H2TXT).strip() == his_t and "herTitle" not in (kvj(pa, dkey) or {}), "按 Esc：不改了，纸上换回去，什么都不存")
        f.evaluate(TAP, H2)
        fwait(f, "!!document.querySelector('.kfs-ti') && /清空就/.test(document.querySelector('.kfs-ti-tip').innerText)")
        f.evaluate("(() => { const i = document.querySelector('.kfs-ti-in'); i.focus(); i.select(); })()")
        pa.keyboard.type("我起的<标题>")
        ftap(f, ".kfs-ti-ok")
        R = kv_until(pa, dkey, lambda R: R.get("herTitle") == "我起的＜标题＞")
        ok(R and R.get("herTitle") == "我起的＜标题＞" and R["title"] == his_t and R["by"] == "me" and R["layout"] == "bento",
           f"点“好”：存在那一天的 day 里，记成她起的（尖括号换全角）；他起的留着，还是他排的那一页（{ {k: (R or {}).get(k) for k in ['herTitle', 'title', 'by']} }）")
        ok(fwait(f, "(document.querySelector('#page .title h2') || {}).innerText.trim() === '我起的＜标题＞' && !!document.querySelector('#page .title h2 svg') && !document.querySelector('#page .title h2 b') && !document.querySelector('.kfs-ti')"),
           "题签换成她起的（照字摆，红笔下划线还在），那一条收起来")
        ftap(f, ".backhome"); time.sleep(0.8)
        f.evaluate("(() => { try { window.__kfsShell.home(); } catch (e) {} })()"); time.sleep(0.6)
        ok(f.evaluate("[...document.querySelectorAll('#rec .card b')].some((b) => b.textContent.includes('我起的＜标题＞') && !b.querySelector('*'))"), "本子首页那一列：照她起的")
        close_ty(pa, f)
        card = pa.locator(".kfs-jz-open").inner_text()
        ok("我起的＜标题＞" in card and "他排的" in card, f"闲笔集今天的卡片：她起的标题（还是他排的）（{card!r}）")
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        f.evaluate(TAP, H2)
        ok(fwait(f, "!!document.querySelector('.kfs-ti') && document.querySelector('.kfs-ti-in').value === '我起的＜标题＞' && /清空就用回光义起的/.test(document.querySelector('.kfs-ti-tip').innerText)"), "再打开、点题签：填着她起的")
        f.evaluate("(() => { const i = document.querySelector('.kfs-ti-in'); i.focus(); i.select(); })()")
        pa.keyboard.press("Backspace"); time.sleep(0.3)
        ok(f.evaluate(H2TXT).strip() == his_t, "删空：纸上马上换回他起的")
        pa.keyboard.press("Enter")
        R = kv_until(pa, dkey, lambda R: "herTitle" not in R)
        ok(R and "herTitle" not in R and R["title"] == his_t and fwait(f, f"(document.querySelector('#page .title h2') || {{}}).innerText.trim() === '{his_t}'"), "回车：拿掉她起的，用回他起的")
        f.evaluate(TAP, H2)
        fwait(f, "!!document.querySelector('.kfs-ti') && /清空就/.test(document.querySelector('.kfs-ti-tip').innerText)")
        f.evaluate("(() => { const i = document.querySelector('.kfs-ti-in'); i.focus(); i.select(); })()")
        pa.keyboard.type("泡桐花那天")
        f.evaluate(TAP, "#page .prose"); time.sleep(0.3)
        R = kv_until(pa, dkey, lambda R: R.get("herTitle") == "泡桐花那天")
        ok(R and R.get("herTitle") == "泡桐花那天" and f.evaluate("!document.querySelector('.kfs-ti')"), "打完点纸上别处：也算定了（同同页自己改字那一条），存上")

        # ================= 打的字挑颜色（同上）：点她打的那一段字，那一条里多一颗“色” =================
        TXT = "[...document.querySelectorAll('#page .stk.placed[data-c=text]')].find((x) => (x.querySelector('.mt') || {}).innerText === '泡桐花开了')"
        pkey = f"kfs2:ty:page/{today}"
        ink0 = f.evaluate(f"getComputedStyle({TXT}.querySelector('.mt')).color")
        f.evaluate(f"select({TXT})"); time.sleep(0.5)
        bar = f.evaluate("""(() => { const b = document.getElementById('stkbar'); return { can: b.classList.contains('kfs-can-col'), btns: [...b.querySelectorAll('.tools button')].filter((x) => x.offsetParent).map((x) => x.innerText).join(''),
            w: b.offsetWidth, pw: document.getElementById('page').clientWidth }; })()""")
        ok(bar["can"] and bar["btns"] == "字色形转大小上下底顶撕" and bar["w"] <= bar["pw"], f"点她打的那一段字：那一条里“字”后面多一颗“色”，每颗窄一点，还是一排放得下（{bar}）")
        ftap(f, "#stkbar .kfs-col")
        ok(f.evaluate("""(() => { const b = document.getElementById('stkbar'); return b.classList.contains('kfs-coloring') && b.querySelectorAll('.kfs-sw').length === 9 && b.querySelector('.kfs-colrow').offsetParent !== null
            && b.querySelector('.tools').offsetParent === null && b.querySelector('.kfs-sw.on').dataset.c === '' && b.offsetWidth <= document.getElementById('page').clientWidth; })()"""),
           "点“色”：换成一排九个颜色（原来的那个圈着），放得下")
        ftap(f, "#stkbar .kfs-sw[data-c='#C23A2B']")
        ok(f.evaluate(f"getComputedStyle({TXT}.querySelector('.mt')).color") == "rgb(194, 58, 43)" and f.evaluate("document.querySelector('#stkbar .kfs-sw.on').dataset.c") == "#C23A2B",
           "点朱红：那一段字马上换成朱红，朱红圈上")
        others = f.evaluate(f"[...document.querySelectorAll('#page .stk.placed[data-c=text]')].filter((x) => x !== {TXT}).map((x) => getComputedStyle(x.querySelector('.mt')).color)")
        ok(others and all(c == ink0 for c in others), f"别的字不动（{others}，原来是 {ink0}）")
        ftap(f, "#stkbar .kfs-col-ok")
        ok(f.evaluate("!document.getElementById('stkbar').classList.contains('kfs-coloring') && document.querySelector('#stkbar .tools').offsetParent !== null"), "点“好”：收回去")
        P = kv_until(pa, pkey, lambda P: any(x.get("m") == "泡桐花开了" and x.get("kc") == "#C23A2B" for x in P["stk"]))
        ok(P and any(x.get("m") == "泡桐花开了" and x.get("kc") == "#C23A2B" for x in P["stk"]) and not any(x.get("kc") for x in P["stk"] if x.get("m") != "泡桐花开了"),
           "颜色跟着那一段字存在她那一层（别的不带）")
        f.evaluate("select(document.querySelector('#page .stk.placed[data-c=pic]'))"); time.sleep(0.4)
        ok(f.evaluate("!document.getElementById('stkbar').classList.contains('kfs-can-col') && document.querySelector('#stkbar .kfs-col').offsetParent === null && document.querySelector('#stkbar [data-a=txt]').offsetParent !== null"),
           "点她放的照片（底下能写一句）：没有“色”（只给打的字）")
        f.evaluate("select(null)"); time.sleep(0.3)
        f.evaluate("applyStyle('xuan')"); time.sleep(1.2)
        ok(f.evaluate(f"getComputedStyle({TXT}.querySelector('.mt')).color") == "rgb(194, 58, 43)", "换风格：还是朱红")
        f.evaluate("applyStyle('kraft')"); time.sleep(1.0)
        ftap(f, "#saveBtn"); ftap(f, "#genSave"); time.sleep(0.8)
        ftap(f, "#saveGrab")
        G = kv_until(pa, f"kfs2:ty:gens/{today}", lambda G: len(G["list"]) == 2)
        gn = G["list"][-1]["n"] if G else 0
        ok(G and any(x.get("m") == "泡桐花开了" and x.get("kc") == "#C23A2B" for x in G["list"][-1]["stk"]), f"存一代（第 {gn} 代）：颜色也记下")
        f.evaluate(f"select({TXT})"); time.sleep(0.4)
        ftap(f, "#stkbar .kfs-col"); ftap(f, "#stkbar .kfs-sw[data-c='']"); ftap(f, "#stkbar .kfs-col-ok")
        f.evaluate("select(null)"); time.sleep(0.3)
        ok(f.evaluate(f"getComputedStyle({TXT}.querySelector('.mt')).color") == ink0 and kv_until(pa, pkey, lambda P: not any(x.get("kc") for x in P["stk"])) is not None
           and not any(x.get("kc") for x in kvj(pa, pkey)["stk"]), "挑“原来的”：跟着纸，存的那一份也拿掉了颜色")
        f.evaluate(f"loadGen({gn})"); time.sleep(2.0)
        ok(fwait(f, f"(() => {{ const t = {TXT}; return !!t && getComputedStyle(t.querySelector('.mt')).color === 'rgb(194, 58, 43)'; }})()"), f"换回第 {gn} 代：朱红回来了")
        # 刘海屏（iPhone 顶上让开 59、底下 34：外面那一层量好了告诉框里）。她 10 月 18 日 18:44 报的：编辑器顶上那一条把“版式 / 风格”那一块挡住了
        pa.evaluate("() => document.querySelector('iframe.kfs-ty-frame').contentWindow.postMessage({ kfsTy: 1, safe: { t: 59, b: 34, l: 0, r: 0 } }, '*')")
        time.sleep(0.8)
        GEO = """(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const t = r('.top'), b = r('.toolbar .tb');
            return { top: [Math.round(t.top), Math.round(t.bottom)], tb: Math.round(b.top), pad: getComputedStyle(document.querySelector('.top')).paddingTop }; })()"""
        f.evaluate("scrollTo(0, 0)"); time.sleep(0.4)
        g0 = f.evaluate(GEO)
        f.evaluate("scrollTo(0, 400)"); time.sleep(0.4)
        g1 = f.evaluate(GEO)
        f.evaluate("scrollTo(0, 0)")
        ok(g0["tb"] >= g0["top"][1] and g0["pad"] == "71px" and g1["top"][0] == 0 and g1["top"][1] >= 59 + 60,
           f"刘海屏：顶上那一条底色铺到最顶上、字让开刘海，“版式 / 风格”那一块排在它底下不被挡；往上划的时候刘海那一截是它盖着（{g0} {g1}）")
        f.evaluate("document.getElementById('libBtn').click()"); time.sleep(0.8)
        lib = f.evaluate("Math.round(document.getElementById('libS').getBoundingClientRect().top)")
        f.evaluate("document.getElementById('libDone').click()"); time.sleep(0.5)
        ok(lib >= 59, f"刘海屏：贴纸库那一层不顶进刘海里（顶上在 {lib}）")
        pa.evaluate("() => document.querySelector('iframe.kfs-ty-frame').contentWindow.postMessage({ kfsTy: 1, safe: { t: 0, b: 0, l: 0, r: 0 } }, '*')")
        time.sleep(0.5)
        close_ty(pa, f)
        ok(any(x.get("m") == "泡桐花开了" and x.get("kc") == "#C23A2B" for x in kvj(pa, pkey)["stk"]), "关上：存着朱红")
        pa.locator(".kfs-jz-open").click()
        f = fx(pa)
        ok(f is not None and fwait(f, f"(() => {{ const t = {TXT}; return !!t && getComputedStyle(t.querySelector('.mt')).color === 'rgb(194, 58, 43)'; }})()") and f.evaluate(H2TXT).strip() == "泡桐花那天",
           "再打开：那一段字还是朱红，题签是她起的")
        close_ty(pa, f)

        # ================= 交给光义，没排成：说一声，不起页 =================
        f3 = td - timedelta(days=3)
        pick_day(pa, f3)
        ok(pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐", "三天前还没掺")
        pa.locator(".kfs-jz-open").click()
        f = day_screen(pa)
        ok(f is not None and fwait(f, "/还没传照片/.test(document.getElementById('dayThumbs').innerText)"), "那一天的那一屏：那天聊天里没有照片，照同页说一句")
        ftap(f, "#toChat")
        ok(fwait(f, "document.getElementById('sChat').classList.contains('on')") and f.evaluate("document.querySelectorAll('#att .ap').length") == 0, "「交给光义」：没有照片可挑")
        f.evaluate("(() => { const t = document.getElementById('chIn'); t.value = '排坏'; })()")
        ftap(f, "#chSend")
        ok(fwait(f, "!!document.querySelector('#msgs .log .r.fail')", 30) and "没排成" in f.evaluate("document.querySelector('#msgs .log .r.fail').innerText") and not f.evaluate("!!document.querySelector('#msgs .done')"),
           "他回的看不懂：“在排”那一栏说没排成（打叉），不冒“打开这一页”")
        R3 = kvj(pa, f"kfs2:ty:day/{f3.isoformat()}")
        ok(R3 and R3["status"] == "failed" and not R3.get("title") and not R3.get("photos"), "那一天记的是没排成（什么都没有）")
        close_ty(pa, f)
        ok(pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐" and pa.locator(f".kfs-page button[data-day='{f3.isoformat()}'] .kfs-jz-tag").count() == 0, "闲笔集里还是“掺一页手帐”，日历上不标")

        # ================= 云端只有乱码 =================
        rows = mock("/__debug/rows")
        flat = json.dumps(rows, ensure_ascii=False)
        leaks = [w for w in ["泡桐花", "蹲着拍的", "那天真好", "某城", "kraft", "polaroid", "journalLook", "kfsimg", "kfs2:ty", "测试排的", "kfschat", "安安静静的", "我起的", "herTitle", "C23A2B"] if w in flat]
        ok(not leaks, f"云端只有乱码（字、城市、版式风格、键名都看不见：{leaks}）")
    except Exception as e:
        import traceback; traceback.print_exc()
        ok(False, f"出错：{e}")
    finally:
        ok(not google and not font_bad, f"字一回都没向 Google 要，也没有被拦下的（{google[:2]} {font_bad[:2]}）")
        ok(not refused, f"框里的安全规矩没拦同页自己的脚本：{refused[:2]}")
        ok(not errors, f"页面没报错：{errors[:3]}")
        print(f"\n通过 {count['passed']}  失败 {count['failed']}")
        browser.close()
    raise SystemExit(1 if count["failed"] or errors else 0)
