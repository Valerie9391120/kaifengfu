# 手帐（同页）里的「我的」是个架子（她 10 月 22 日、23 日定的，见开发说明“「我的」是个架子”）的端到端测试。
# 真的浏览器、假 Supabase，一台“手机”：
#   「我的」里传两张贴纸：贴纸栏、贴纸库里两张，“几张”、给 agent 的清单都是两张；
#   页上直接放一张照片（加号 → 放照片）：页上有，「我的」里没有（贴纸栏、分组、贴纸库、几张、给 agent 的清单都不多它）；
#   一张贴纸贴到页上、存好：在「我的」里删它 → 只从架子上拿下来（提示“页上贴着的还在”），页上照旧，存档里记着拿下来（off）、图还在；常用里也没了；
#   另一张哪儿都没贴：删 → 真删（存档、图都没了）；
#   再传一张，只贴在昨天那一页上：删 → 也只拿下来（这一页没有，问了外面：别的日子的页还贴着）；
#   关上再开：页上那张贴纸、那张照片都还在、画得出来；「我的」里一张不剩。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080，用 tests/serve.py 起），再：python3 tests/e2e_mine.py
import io, json, os, re, time
from datetime import date, timedelta
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SHOTS = os.environ.get("KFS_SHOTS", "")

def fake_png(color, w=320, h=320):
    im = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(im)
    d.ellipse([w * 0.2, h * 0.2, w * 0.8, h * 0.8], fill=(255, 255, 255))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()

def png_file(name, color, w=320, h=320):
    return {"name": name, "mimeType": "image/png", "buffer": fake_png(color, w, h)}

def open_meteo(route):
    head = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    body = {} if "geocoding-api" in route.request.url else {"daily": {"weather_code": [3], "temperature_2m_max": [14.0], "temperature_2m_min": [8.0], "precipitation_sum": [0], "wind_speed_10m_max": [10], "sunset": ["2026-10-23T18:10"]}}
    route.fulfill(status=200, headers=head, body=json.dumps(body))

def kvj(page, key):
    t = page.evaluate(KV, key)
    return json.loads(t) if t else None

def kv_until(page, key, pred, timeout=12, raw=False):
    end = time.time() + timeout
    v = None
    while time.time() < end:
        v = page.evaluate(KV, key) if raw else kvj(page, key)
        try:
            if pred(v):
                return v
        except Exception:
            pass
        time.sleep(0.25)
    return v

def frame_when(page, cond, wait=30):
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
        time.sleep(0.3)
    return None

EDITOR = "document.documentElement.classList.contains('app-mode')"
DAYSCREEN = "document.getElementById('sDay') && document.getElementById('sDay').classList.contains('on')"

def fwait(f, expr, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if f.evaluate(expr):
                return True
        except Exception:
            pass
        time.sleep(0.15)
    return False

def ftap(f, sel, i=0):
    f.evaluate("([s, i]) => { const e = document.querySelectorAll(s)[i]; if (!e) throw new Error('没有 ' + s); e.click(); }", [sel, i])
    time.sleep(0.5)

def open_xianbi(page):
    page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    page.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
    page.locator(".kfs-nanya-row", has_text="闲笔集").click()
    page.get_by_text("手帐和批注").wait_for(timeout=15000); time.sleep(0.6)

def close_ty(page, f):
    ftap(f, ".backhome"); time.sleep(0.8)
    ftap(f, ".kfs-close")
    end = time.time() + 15
    while time.time() < end and page.locator("iframe.kfs-ty-frame").count():
        time.sleep(0.2)
    time.sleep(1.0)

def shelf_tray(f):
    # 贴纸栏点到「我的」（同页的分类按钮），重摆一回
    ftap(f, "#cats button[data-c=mine]")
    f.evaluate("renderTray()"); time.sleep(0.4)
    return f.evaluate("""(() => ({ slots: [...document.querySelectorAll('#wxrow .slot')].map((s) => s.dataset.k),
      groups: [...document.querySelectorAll('#wxdays [data-mg]')].map((b) => b.textContent), src: document.getElementById('wxsrc').textContent }))()""")

def open_shelf(f):
    shelf_tray(f)
    ftap(f, "#wxdays [data-lib]")
    fwait(f, "document.getElementById('libS').classList.contains('on')", 5)
    return f.evaluate("""(() => ({ cards: [...document.querySelectorAll('#libBody [data-ld]')].map((b) => b.dataset.ld),
      n: ((document.querySelector('#libTabs [data-lc2=mine] small') || {}).textContent || '') }))()""")

def kit(f):
    return f.evaluate("journalKit.stickers().mine.keys.map((x) => x.key)")

def toast_now(f, want, timeout=10):
    ok_ = fwait(f, f"document.getElementById('toast').textContent === {json.dumps(want, ensure_ascii=False)}", timeout)
    return ok_, f.evaluate("document.getElementById('toast').textContent")

def upload(f, name, color):
    # 「我的」里传一张（贴纸库开着留着），回它的编号
    open_shelf(f)
    before = f.evaluate("MINE_STK.map((x) => x.id)")
    f.locator("#upF").set_input_files(png_file(name, color))
    fwait(f, f"MINE_STK.some((x) => !{json.dumps(before)}.includes(x.id) && x.asset)", 20)
    new = [i for i in f.evaluate("MINE_STK.filter((x) => x.asset).map((x) => x.id)") if i not in before]
    return new[0] if new else None

def stick(f, k, x=40, y=260):
    f.evaluate("([k, x, y]) => { place('mine', k, x, y, 'her', true); savePage(); }", [k, x, y])

def tear(f, k):
    f.evaluate("(k) => { document.querySelectorAll('#page .stk.placed.c-mine').forEach((s) => { if (s.dataset.k === k) s.remove(); }); savePage(); }", k)

def drop(f, k):
    open_shelf(f)
    ftap(f, f"#libBody [data-ld='{k}']")

def page_has(pa, d, k, want=True, timeout=12):
    v = kv_until(pa, f"kfs2:ty:page/{d}", lambda v: (v is not None and any(s.get("k") == k for s in v.get("stk", []))) == want, timeout)
    return (v is not None and any(s.get("k") == k for s in v.get("stk", []))) == want

def frame_gone(pa, timeout=15):
    end = time.time() + timeout
    while time.time() < end and pa.locator("iframe.kfs-ty-frame").count():
        time.sleep(0.2)
    time.sleep(1.0)
    return pa.locator("iframe.kfs-ty-frame").count() == 0

ROWS = """(pre) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').getAll();
  r.onsuccess = () => res(r.result.filter((x) => x.k.startsWith(pre) && !x.del).map((x) => [x.k, x.v])); r.onerror = () => rej(r.error); }; o.onerror = () => rej(o.error); })"""

def off_kept(pa, k, asset):
    m = kv_until(pa, f"kfs2:ty:mine/{k}", lambda v: v and v.get("off") == 1)
    return m is not None and (pa.evaluate(KV, f"kfs2:jzimg:{asset}") or "").startswith("data:image/")

TAKEN = "从「我的」拿下来了 · 页上贴着的还在"

PLACED = """(k) => { const s = [...document.querySelectorAll('#page .stk.placed.c-mine')].find((x) => x.dataset.k === k); const i = s && s.querySelector('img'); return !!i && i.naturalWidth > 0; }"""
PHOTO = "(() => { const i = document.querySelector('#page .stk.placed[data-c=pic] img'); return !!i && i.naturalWidth > 0; })()"

today = date.today()
td = today.isoformat()
yd = today - timedelta(days=1)
md = lambda d: f"{d.month}.{d.day}"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    try:
        A = browser.new_context(**IPHONE)
        A.add_init_script(STUB)
        A.route(re.compile(r"^https://(geocoding-api|api|archive-api)\.open-meteo\.com/.*"), open_meteo)
        pa = A.new_page()
        pa.on("pageerror", lambda e: errors.append(str(e)))
        first_time(pa)
        open_xianbi(pa)
        pa.locator(f".kfs-page button[data-day='{td}']").click(); time.sleep(0.8)
        pa.locator(".kfs-jz-open").click()
        f = frame_when(pa, DAYSCREEN, 40)
        ftap(f, "#toSelf")
        f = frame_when(pa, EDITOR)
        ok(f is not None, "进了今天那一页（自己拼）")

        # ================= 「我的」里传两张贴纸 =================
        open_shelf(f)
        f.locator("#upF").set_input_files([png_file("猫猫.png", (240, 180, 60)), png_file("星星.png", (120, 90, 200))])
        ok(fwait(f, "MINE_STK.filter((x) => !x.kind && x.asset).length === 2", 20), "「我的」里传了两张贴纸")
        ids = f.evaluate("MINE_STK.filter((x) => !x.kind).sort((a, b) => a.at - b.at).map((x) => [x.id, x.asset, x.note])")
        (idA, assetA, noteA), (idB, assetB, noteB) = ids
        lib = f.evaluate("""(() => ({ cards: [...document.querySelectorAll('#libBody [data-ld]')].map((b) => b.dataset.ld), n: ((document.querySelector('#libTabs [data-lc2=mine] small') || {}).textContent || '') }))()""")
        ok(sorted(lib["cards"]) == sorted([idA, idB]) and lib["n"] == "2" and noteA == "猫猫" and noteB == "星星", f"贴纸库「我的」那一栏：两张、栏上写着 2（{lib}）")
        ok(kv_until(pa, f"kfs2:ty:mine/{idA}", lambda v: v and v.get("asset") == assetA) and kv_until(pa, f"kfs2:jzimg:{assetA}", lambda v: v and v.startswith("data:image/"), raw=True),
           "存档里：mine/<编号> 一条、图在 kfs2:jzimg:")
        ftap(f, "#libDone")

        # ================= 页上直接放一张照片：页上有，「我的」里没有 =================
        f.locator("#addFab input[type=file]").set_input_files(png_file("相册里的.png", (90, 160, 220), 900, 1200))
        ok(fwait(f, "MINE_STK.some((x) => x.kind === 'photo') && " + PHOTO, 25), "加号 → 放照片：页上多了一张照片")
        photo_id = f.evaluate("MINE_STK.find((x) => x.kind === 'photo').id")
        tr = shelf_tray(f)
        ok(sorted(tr["slots"]) == sorted([idA, idB]) and photo_id not in tr["slots"], f"贴纸栏「我的」：还是那两张贴纸，那张照片不在（{tr['slots']}）")
        ok("照片" not in tr["groups"] and tr["src"].startswith("2 张自己传的"), f"分组里没有“照片”，底下写着 2 张自己传的（{tr['groups']}，{tr['src'][:12]}）")
        ok(sorted(kit(f)) == sorted([idA, idB]), "给 agent 的清单里也只有那两张")
        lib = open_shelf(f)
        ok(sorted(lib["cards"]) == sorted([idA, idB]) and lib["n"] == "2", f"贴纸库「我的」：还是两张（{lib}）")
        if SHOTS:
            pa.screenshot(path=os.path.join(SHOTS, "我的-只有自己传的.png"))
        ftap(f, "#libDone")
        ok(kv_until(pa, f"kfs2:ty:mine/{photo_id}", lambda v: v and v.get("kind") == "photo") is not None, "那张照片照样存着（页上要用），只是「我的」里不列")

        # ================= 贴纸 A 贴到页上、存好 =================
        f.evaluate("(k) => { place('mine', k, 36, 150, 'her', true); bump('mine', k); savePage(); renderTray(); }", idA)
        ok(kv_until(pa, f"kfs2:ty:page/{td}", lambda v: v and any(s.get("k") == idA for s in v.get("stk", []))) is not None and fwait(f, f"({PLACED})({json.dumps(idA)})"),
           "猫猫那张贴到页上，存进今天那一页")
        ftap(f, "#cats button[data-c=fav]")
        ok(f.evaluate("(k) => [...document.querySelectorAll('#wxrow .slot')].some((s) => s.dataset.k === k)", idA), "常用里有猫猫（贴过一回）")
        if SHOTS:
            pa.screenshot(path=os.path.join(SHOTS, "我的-页上贴着照片和贴纸.png"))

        # ================= 在「我的」里删 A：页上贴着，只从架子上拿下来 =================
        open_shelf(f)
        ftap(f, f"#libBody [data-ld='{idA}']")
        got, txt = toast_now(f, "从「我的」拿下来了 · 页上贴着的还在")
        ok(got, f"删猫猫：提示“从「我的」拿下来了 · 页上贴着的还在”（{txt}）")
        if SHOTS:
            pa.screenshot(path=os.path.join(SHOTS, "我的-拿下来了.png"))
        lib = f.evaluate("""(() => ({ cards: [...document.querySelectorAll('#libBody [data-ld]')].map((b) => b.dataset.ld), n: ((document.querySelector('#libTabs [data-lc2=mine] small') || {}).textContent || '') }))()""")
        ok(lib["cards"] == [idB] and lib["n"] == "1", f"贴纸库「我的」：只剩星星（{lib}）")
        ok(f.evaluate(f"({PLACED})({json.dumps(idA)})"), "页上的猫猫还在、画得出来")
        mA = kv_until(pa, f"kfs2:ty:mine/{idA}", lambda v: v and v.get("off") == 1)
        ok(mA is not None and (pa.evaluate(KV, f"kfs2:jzimg:{assetA}") or "").startswith("data:image/"), "存档里：猫猫记着拿下来了（off），图还在")
        ok(kit(f) == [idB], "给 agent 的清单里也没了猫猫")
        ftap(f, "#libDone")
        ok(f.evaluate("!document.querySelector('#cats button[data-c=fav]') && ![...document.querySelectorAll('#wxrow .slot')].some((s) => s.dataset.k === " + json.dumps(idA) + ")"),
           "常用里也没了猫猫（只贴过它一张，“常用”那一颗也不摆了）")

        # ================= 删 B：哪儿都没贴，真删 =================
        open_shelf(f)
        ftap(f, f"#libBody [data-ld='{idB}']")
        got, txt = toast_now(f, "删掉了")
        ok(got, f"删星星（哪儿都没贴）：提示“删掉了”（{txt}）")
        ok(kv_until(pa, f"kfs2:ty:mine/{idB}", lambda v: v is None) is None and kv_until(pa, f"kfs2:jzimg:{assetB}", lambda v: v is None, raw=True) is None,
           "存档里星星那一条、图都没了（真删）")
        ok(f.evaluate("(k) => !MINE_STK.some((x) => x.id === k)", idB) and f.evaluate("document.querySelectorAll('#libBody [data-ld]').length") == 0, "「我的」里一张不剩")

        # ================= 再传一张，只贴在昨天那一页上：删 → 也只拿下来 =================
        f.locator("#upF").set_input_files(png_file("月亮.png", (250, 230, 150)))
        ok(fwait(f, "MINE_STK.filter((x) => !x.kind && !x.off && x.asset).length === 1", 20), "再传一张：月亮")
        idC = f.evaluate("MINE_STK.find((x) => !x.kind && !x.off).id")
        f.evaluate("([k, d]) => journalBackend.set('page/' + d, { stk: [{ c: 'mine', k, who: 'her', x: 40, y: 200, r: 0, s: 1, w: null }], hide: [], ts: Date.now() })", [idC, md(yd)])
        ok(kv_until(pa, f"kfs2:ty:page/{yd.isoformat()}", lambda v: v and any(s.get("k") == idC for s in v.get("stk", []))) is not None, "月亮只贴在昨天那一页上（今天这一页没有）")
        ftap(f, f"#libBody [data-ld='{idC}']")
        got, txt = toast_now(f, "从「我的」拿下来了 · 页上贴着的还在")
        ok(got and kv_until(pa, f"kfs2:ty:mine/{idC}", lambda v: v and v.get("off") == 1) is not None, f"删月亮：昨天那一页还贴着，只拿下来（{txt}）")
        ftap(f, "#libDone")

        # ================= 关上再开 =================
        close_ty(pa, f)
        pa.locator(".kfs-jz-open").click()
        f = frame_when(pa, EDITOR, 40)
        ok(f is not None and fwait(f, f"({PLACED})({json.dumps(idA)})", 20) and fwait(f, PHOTO, 20), "关上再开：页上的猫猫、那张照片都还在、画得出来")
        if SHOTS:
            time.sleep(1.0)
            pa.screenshot(path=os.path.join(SHOTS, "我的-关上再开-页上.png"))
        tr = shelf_tray(f)
        ok(tr["slots"] == [] and tr["src"].startswith("还没有自己的贴纸") and tr["groups"] == ["全部"], f"「我的」里一张不剩（{tr}）")
        lib = open_shelf(f)
        ok(lib["cards"] == [] and lib["n"] == "", f"贴纸库「我的」：空的，栏上不写数（{lib}）")
        ok(kit(f) == [], "给 agent 的清单：空的")
        if SHOTS:
            pa.screenshot(path=os.path.join(SHOTS, "我的-关上再开.png"))
        ftap(f, "#libDone")

        # ================= 问外面问不到（断了）：哪儿都没贴也只拿下来 =================
        idU = upload(f, "雨.png", (100, 120, 140))
        assetU = f.evaluate("(k) => MINE_STK.find((x) => x.id === k).asset", idU)
        f.evaluate("(() => { window.__mu0 = window.__kfsMineUsed; window.__kfsMineUsed = () => Promise.reject(new Error('断了')); })()")
        drop(f, idU)
        got, txt = toast_now(f, TAKEN)
        ok(got and off_kept(pa, idU, assetU), f"问外面问不到（断了）：哪儿都没贴也只拿下来，不真删（{txt}）")
        f.evaluate("(() => { window.__kfsMineUsed = window.__mu0; })()")

        # ================= 这台设备上图还没取到的：先不让拿 =================
        idV = upload(f, "风.png", (60, 200, 160))
        ftap(f, "#libDone")
        stick(f, idV)
        ok(page_has(pa, td, idV), "风那张贴到页上")
        f.evaluate("(k) => { const m = MINE_STK.find((x) => x.id === k); window.__src0 = m.src; m.src = ''; }", idV)
        drop(f, idV)
        got, txt = toast_now(f, "这张的图还没取到，过一会儿再拿下来")
        mV = kvj(pa, f"kfs2:ty:mine/{idV}") or {}
        ok(got and not mV.get("off") and str(mV.get("src", "")).startswith("kfsimg:") and idV in f.evaluate("[...document.querySelectorAll('#libBody [data-ld]')].map((b) => b.dataset.ld)"),
           f"图还没取到（这台设备上是空的）：先不拿，存档里那一条一个字没动（{txt}）")
        f.evaluate("(k) => { MINE_STK.find((x) => x.id === k).src = window.__src0; }", idV)
        ftap(f, "#libDone")

        # ================= 存成新一代以后从页上撕了：那一代里还有，只拿下来 =================
        idS = upload(f, "太阳.png", (250, 120, 80))
        assetS = f.evaluate("(k) => MINE_STK.find((x) => x.id === k).asset", idS)
        ftap(f, "#libDone")
        stick(f, idS, 160, 320)
        ok(page_has(pa, td, idS), "太阳贴到页上")
        ftap(f, "#genSave")
        G = kv_until(pa, f"kfs2:ty:gens/{td}", lambda v: v and any(any(s.get("k") == idS for s in g.get("stk", [])) for g in v.get("list", [])))
        ok(G is not None, "存成新一代：那一代里有太阳")
        tear(f, idS)
        ok(page_has(pa, td, idS, want=False), "从页上把太阳撕了（页上、存档里的这一页都没有了）")
        drop(f, idS)
        got, txt = toast_now(f, TAKEN)
        ok(got and off_kept(pa, idS, assetS), f"再在「我的」里删太阳：存的那一代里还有它，只拿下来（{txt}）")
        ftap(f, "#libDone")

        # ================= 这一页进了废纸篓：废纸篓里还有，只拿下来；找回来都在 =================
        idT = upload(f, "云.png", (200, 200, 230))
        assetT = f.evaluate("(k) => MINE_STK.find((x) => x.id === k).asset", idT)
        ftap(f, "#libDone")
        stick(f, idT, 60, 420)
        ok(page_has(pa, td, idT), "云贴到页上")
        f.evaluate("renderDel()")
        ftap(f, "#delPageBtn")
        ftap(f, "#delYes")
        ok(frame_gone(pa), "「存」最底下删掉今天这一页（真的删掉）：框关上，回闲笔集")
        trash = pa.evaluate(ROWS, "kfs2:ty:trash/")
        ok(kvj(pa, f"kfs2:ty:page/{td}") is None and any(idT in v for _, v in trash), f"今天那一页挪进了废纸篓，里头有云（{len(trash)} 条）")
        pa.locator(".kfs-jz-open").click()
        f = frame_when(pa, DAYSCREEN, 40)
        ftap(f, "#toSelf")
        f = frame_when(pa, EDITOR)
        drop(f, idT)
        got, txt = toast_now(f, TAKEN)
        ok(got and off_kept(pa, idT, assetT), f"再点开、在「我的」里删云：废纸篓里还贴着，只拿下来（{txt}）")
        ftap(f, "#libDone")
        f.evaluate("renderDel()")
        found = fwait(f, "document.querySelectorAll('#trashList [data-tr]').length === 1", 10)
        if found:
            ftap(f, "#trashList [data-tr]")
        ok(found and frame_gone(pa), "「存」最底下“最近删掉的”点找回：框关上，回闲笔集")
        pa.locator(".kfs-jz-open").click()
        f = frame_when(pa, EDITOR + " || " + DAYSCREEN, 40)
        if f and f.evaluate(DAYSCREEN):
            ftap(f, "#toSelf")
            f = frame_when(pa, EDITOR)
        ok(f is not None and fwait(f, f"({PLACED})({json.dumps(idT)})", 20) and fwait(f, f"({PLACED})({json.dumps(idA)})", 20) and fwait(f, PHOTO, 20),
           "找回来的那一页：云、猫猫、那张照片都在、画得出来")
    finally:
        try:
            errs = [e for e in errors if "ResizeObserver" not in e]
            ok(not errs, f"页面没有报错（{errs[:3]}）")
        except Exception:
            pass
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] else 0)
