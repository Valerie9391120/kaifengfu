# 闲笔集里掺的手帐（卿卿 10 月 18 日凌晨要的，见开发说明“闲笔集掺手帐”那一节、src/jz/）的端到端测试。真的浏览器，假 Supabase：
#   聊天里发两张编的照片、说几句；闲笔集里写今天的日记；掺一页手帐：填天气在哪儿（Open-Meteo 用 page.route 假的）、挑照片和原话、
#   换版式和风格、贴纸（Fluent Emoji 那一包取得到）、写字、挪、藏、改字、留批注；让光义排（假的那边的我照编号排，见 mock 的 fakeArrange）、
#   排坏了的那一回；回闲笔集看卡片、批注；聊天里他翻日记看得到手帐和批注、他留批注；重新打开都还在；云端只有乱码；删掉这一页。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：python3 tests/e2e_jz.py
# KFS_SHOTS=某个文件夹：顺手截一张改的时候的样子（六种版式 × 八种风格的样张另有 tests/look_jz.py）
import io, json, os, re, time
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SHOTS = os.environ.get("KFS_SHOTS", "")
HER_DIARY = "今天在运河边看到泡桐花，紫色的，一串一串挂着。"
CJK = re.compile(r"[\u4e00-\u9fff]")
LAYOUTS = ["column", "polaroid", "cover", "bento", "scroll", "letter"]
STYLES = ["inkpaper", "xuan", "kraft", "film", "night", "washi", "newsprint", "chalk"]
wx_log = []

def fake_photo(color, w=900, h=1200):
    im = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(im)
    for k, r in enumerate(range(380, 20, -60)):
        d.ellipse([w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r], outline=(150 + k * 12, 120 + k * 10, 200 - k * 8), width=6)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()

def open_meteo(route):
    url = route.request.url
    wx_log.append(url)
    head = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    if "geocoding-api" in url:
        body = {"results": [{"name": "某城", "latitude": 12.3456, "longitude": -45.6789, "timezone": "Etc/UTC", "admin1": "某省", "country": "某国"}]} if "name=%E6%9F%90%E5%9F%8E" in url else {}
    else:
        body = {"daily": {"weather_code": [61], "temperature_2m_max": [15.4], "temperature_2m_min": [9.6], "precipitation_sum": [3.2]}}
    route.fulfill(status=200, headers=head, body=json.dumps(body))

def kv(page, key):
    return page.evaluate(KV, key)
def page_of_day(page, day):
    t = kv(page, "kfs2:jz:" + day)
    return json.loads(t) if t else None
def notes_of_day(page, day):
    t = kv(page, "kfs2:jzn:" + day)
    return json.loads(t) if t else []
def close_side(page):
    if page.locator("div.absolute.inset-0.z-30").count():
        page.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)
def open_xianbi(page):
    page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
    page.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
    page.locator(".kfs-nanya-row", has_text="闲笔集").click()
    page.locator(".kfs-page").wait_for(timeout=10000)
    page.get_by_text("手帐和批注").wait_for(timeout=10000); time.sleep(0.4)
def leave_xianbi(page):
    page.get_by_role("button", name="返回").first.click(); time.sleep(0.6)
    close_side(page)
def open_jz(page):
    page.locator(".kfs-jz-open").click()
    page.locator(".kfs-jz .jz-sheet").wait_for(timeout=10000); time.sleep(0.5)
def jz_back(page):
    page.locator(".kfs-jz").get_by_role("button", name="返回").click(); time.sleep(0.8)
def sheet_off(page):
    page.locator(".kfs-jz div.absolute.inset-0.z-40").last.click(position={"x": 30, "y": 30}); time.sleep(0.4)
def toast(page, pattern, timeout=8000):
    return wait_js(page, f"(() => {{ const t = document.querySelector('.kfs-jz-toast'); return !!t && /{pattern}/.test(t.innerText); }})()", timeout)
def tap_part(page, k):
    # 贴纸、写的字是随手摆的，可能正好压在那一块上（真点会点到贴纸）：直接把“点了一下”发给那一块
    page.locator(f".kfs-jz .jz-sheet [data-part='{k}']").first.dispatch_event("click"); time.sleep(0.4)
IMGS = """() => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').getAll();
  r.onsuccess = () => res(r.result.filter((x) => x.k.startsWith('kfs2:jzimg:') && !x.del).map((x) => x.k.slice(11)).sort()); r.onerror = () => rej(r.error); }; o.onerror = () => rej(o.error); })"""
def act(page, name):
    page.locator(".kfs-jz-act", has_text=name).click(); time.sleep(0.4)
def look(page):
    return page.evaluate("(() => { const s = document.querySelector('.kfs-jz .jz-sheet'); return s ? [s.dataset.layout, s.dataset.style] : null; })()")
def drag(page, sel, dx, dy):
    page.evaluate("""([sel, dx, dy]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const o = (fx, fy) => ({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x + fx, clientY: y + fy });
      el.dispatchEvent(new PointerEvent('pointerdown', o(0, 0)));
      for (let i = 1; i <= 6; i++) el.dispatchEvent(new PointerEvent('pointermove', o(dx * i / 6, dy * i / 6)));
      el.dispatchEvent(new PointerEvent('pointerup', o(dx, dy))); }""", [sel, dx, dy])

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    A = browser.new_context(**IPHONE)
    A.add_init_script(STUB)
    A.route(re.compile(r"^https://(geocoding-api|api|archive-api)\.open-meteo\.com/.*"), open_meteo)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append("A: " + str(e)))
    try:
        first_time(pa)
        y, mo, d = pa.evaluate("(() => { const t = new Date(); return [t.getFullYear(), t.getMonth() + 1, t.getDate()]; })()")
        today = f"{y}-{mo:02d}-{d:02d}"
        label = f"{mo}月{d}日"

        # ================= 聊天里发两张照片、说一句 =================
        for color in [(236, 228, 240), (250, 226, 200)]:
            pa.locator("input[type=file][accept*='image']").set_input_files({"name": "编的照片.png", "mimeType": "image/png", "buffer": fake_photo(color)})
            pa.locator(".kfs-composer img").first.wait_for(timeout=10000)
            n = len(calls())
            pa.get_by_role("button", name="发送", exact=True).click()
            wait_mock(lambda: len(calls()) > n, 20); wait_js(pa, "!(" + TYPING + ")", 25000); time.sleep(1.5)
        n = len(calls())
        say(pa, "今天看到泡桐花了")
        wait_mock(lambda: len(calls()) > n, 20); wait_js(pa, "!(" + TYPING + ")", 25000); time.sleep(1.5)
        cid, msgs = chat_of(pa)
        photo_ids = [m["imgId"] for m in msgs if m.get("role") == "her" and m.get("kind") == "photo"]
        ok(len(photo_ids) == 2, f"聊天里发了两张照片（{photo_ids}）")

        # ================= 闲笔集：写今天的日记；卡片是“掺一页手帐” =================
        open_xianbi(pa)
        pa.get_by_role("button", name=re.compile("甜")).first.click(); time.sleep(0.3)
        pa.get_by_role("button", name="写几句").click(); time.sleep(0.3)
        pa.get_by_placeholder("这天发生了什么").fill(HER_DIARY)
        pa.get_by_role("button", name="保存").click(); time.sleep(0.6)
        ok(pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐" and pa.locator(".kfs-day-noteadd").count() == 1, "今天那一页底下多了“手帐和批注”：一个“掺一页手帐”，一个“留一条批注”")
        ok(pa.locator(".kfs-page .kfs-jz-tag").count() == 0, "还没掺手帐：日历上没有 🏷️")

        # ================= 点开：空的一页 =================
        open_jz(pa)
        parts = pa.evaluate("[...document.querySelectorAll('.kfs-jz .jz-sheet [data-part]')].map((e) => e.dataset.part)")
        ok(pa.locator(".kfs-jz").get_by_text(f"{label}的手帐").count() == 1 and look(pa) == ["column", "inkpaper"] and parts == ["head", "mood", "her"] and not pa.locator(".kfs-jz-empty").count(),
           f"掺一页手帐：单栏流、青墨素纸；新的一页摆着日子和她今天写的日记、心情（{parts}），不算空的，不出“还空着”的提示")
        ok(pa.locator(".kfs-jz .jz-sheet [data-part='wx']").count() == 0, "没填在哪儿：天气不摆（不编）")
        jz_back(pa)
        ok(page_of_day(pa, today) is None and pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐", "点开了什么都没动就退出来：不存，卡片还是“掺一页手帐”")

        # ================= 天气在哪儿 =================
        open_jz(pa)
        pa.locator(".kfs-jz-more").click(); time.sleep(0.4)
        ok("还没填" in pa.locator(".kfs-jz-city").inner_text(), "“更多”里：天气在哪儿（还没填）")
        pa.locator(".kfs-jz-city").click(); time.sleep(0.4)
        pa.locator(".kfs-jz-cityin").fill("某城")
        pa.locator(".kfs-jz-cityfind").click()
        pa.locator(".kfs-jz-cityitem").first.wait_for(timeout=8000)
        ok("某省，某国" in pa.locator(".kfs-jz-cityitem").first.inner_text(), "找到了：某城（某省，某国）")
        pa.locator(".kfs-jz-cityitem").first.click()
        ok(toast(pa, "取到了：小雨 10–15°C · 雨 3 mm"), "挑了以后取今天的天气：小雨 10–15°C · 雨 3 mm")
        time.sleep(0.6)
        wx_txt = pa.locator(".kfs-jz .jz-wx").inner_text()
        ok("小雨 10–15°C" in wx_txt and "某城" in wx_txt, f"纸上摆着天气那一块（{wx_txt!r}）")
        geo = [u for u in wx_log if "geocoding-api" in u]
        fc = [u for u in wx_log if "api.open-meteo.com/v1/forecast" in u]
        ok(len(geo) == 1 and len(fc) == 1 and "latitude=12.35&longitude=-45.68" in fc[0] and f"start_date={today}&end_date={today}" in fc[0] and "qing" not in fc[0],
           "只寄了城市名（找的时候）和经纬度、日子（取的时候）；网页的安全规矩放行这几个地址")
        pg = page_of_day(pa, today)
        cfg = json.loads(kv(pa, "kfs2:jzcfg") or "{}")
        ok(pg and pg["wx"]["code"] == 61 and pg["wx"]["city"] == "某城" and cfg.get("city", {}).get("name") == "某城" and cfg["city"]["lat"] == 12.35,
           "这回是她动手取的：这一页存了（带天气）；在哪儿记在 kfs2:jzcfg")
        # 删掉这一页，再掺一回：顺手取的天气不存
        pa.locator(".kfs-jz-more").click(); time.sleep(0.4)
        ok("某城" in pa.locator(".kfs-jz-city").inner_text(), "“更多”里写着现在是某城")
        pa.locator(".kfs-jz-delete").click(); time.sleep(0.3)
        ok("再点一次" in pa.locator(".kfs-jz-delete").inner_text() and pa.locator(".kfs-jz").count() == 1, "删这一页：点一下只是变红问一句")
        pa.locator(".kfs-jz-delete").click(); time.sleep(1.0)
        ok(pa.locator(".kfs-jz").count() == 0 and page_of_day(pa, today) is None and pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐", "再点一下：删掉了，回到闲笔集，卡片又是“掺一页手帐”")
        n_wx = len(wx_log)
        open_jz(pa)
        wait_js(pa, "!!document.querySelector('.kfs-jz .jz-wx')", 8000)
        ok(len(wx_log) == n_wx + 1 and "小雨" in pa.locator(".kfs-jz .jz-wx").inner_text(), "填过在哪儿：再掺一页，点开就顺手取了天气、摆上")
        jz_back(pa)
        ok(page_of_day(pa, today) is None, "顺手取的天气不算动过：什么都没动就退出来，还是不存")

        # ================= 排的东西：标题、照片、原话 =================
        open_jz(pa)
        wait_js(pa, "!!document.querySelector('.kfs-jz .jz-wx')", 8000)
        pa.locator(".kfs-jz-stuff").click(); time.sleep(0.5)
        pa.locator(".kfs-jz-matphoto").nth(1).wait_for(timeout=8000)
        ok(pa.locator(".kfs-jz-matphoto").count() == 2 and pa.locator(".kfs-jz-quote-pick").count() >= 3, f"排的东西：这一天聊天里的两张照片、几句原话（{pa.locator('.kfs-jz-quote-pick').count()} 句）摆着挑")
        pa.locator(".kfs-jz-title-in").fill("泡桐花开了")
        pa.locator(".kfs-jz-matphoto").first.click()
        pa.locator(".kfs-jz-photo-row").first.wait_for(timeout=8000)
        picks = pa.locator(".kfs-jz-quote-pick")
        her_q = pa.locator(".kfs-jz-quote-pick", has_text="今天看到泡桐花了").first
        her_q.click(); time.sleep(0.3)
        pa.locator(".kfs-jz-quote-pick", has_text="收到：今天看到泡桐花了").first.click(); time.sleep(0.3)
        pa.locator(".kfs-jz input[type=file]").set_input_files({"name": "相册里的.png", "mimeType": "image/png", "buffer": fake_photo((210, 236, 222))})
        pa.locator(".kfs-jz-photo-row").nth(1).wait_for(timeout=8000)
        pa.locator(".kfs-jz-cap-in").fill("运河边 · 下午")
        sheet_off(pa); time.sleep(0.8)
        ok(pa.locator(".kfs-jz .jz-title").inner_text().startswith("泡桐花开了"), "标题摆上了")
        ok(pa.locator(".kfs-jz .jz-hero img").count() == 1 and pa.locator(".kfs-jz .jz-more img").count() == 1 and pa.locator(".kfs-jz .jz-quote .jz-q").count() == 2 and pa.locator(".kfs-jz .jz-hero .jz-cap").inner_text() == "运河边 · 下午",
           "头一张照片当了主照片（底下那一行写上了），相册里那张摆在后头；两句原话摆在原话卡上")
        qtxt = pa.locator(".kfs-jz .jz-quote").inner_text()
        ok("卿卿" in qtxt and "光义" in qtxt and "今天看到泡桐花了" in qtxt, "原话照原样摆，标着谁、几点")
        time.sleep(0.8)
        pg = page_of_day(pa, today)
        hero = pg["arr"]["photos"][0]
        album = pg["arr"]["photos"][1]
        ok(pg["arr"]["by"] == "her" and pg["arr"]["title"] == "泡桐花开了" and hero["from"] == photo_ids[0] and hero["role"] == "hero" and hero["id"].startswith("jz") and pg["wx"]["code"] == 61,
           "存了：她自己拼的、标题、主照片（从聊天里那张另存的一份，记着是哪张）、天气")
        ok(bool(kv(pa, "kfs2:jzimg:" + hero["id"])) and [q["p"] for q in pg["arr"]["quotes"]][0] == "今天看到泡桐花了", "照片另存在 kfs2:jzimg:（删了聊天也还在）；原话的字照原话抄")
        ok(album["role"] == "more" and "from" not in album and bool(kv(pa, "kfs2:jzimg:" + album["id"])) and pg["arr"]["cap"] == "运河边 · 下午", "相册那张也另存了（不记从聊天哪张来）；主照片底下那一行存了")

        # ================= 版式、风格 =================
        pa.locator(".kfs-jz-layout").click(); time.sleep(0.4)
        ok(pa.locator(".kfs-jz-pick").count() == 6, "版式六种")
        pa.locator(".kfs-jz-pick[data-k='polaroid']").click(); time.sleep(0.4)
        pa.locator(".kfs-jz-style").click(); time.sleep(0.4)
        ok(pa.locator(".kfs-jz-pick").count() == 8, "风格八种")
        pa.locator(".kfs-jz-pick[data-k='night']").click(); time.sleep(0.4)
        ok(look(pa) == ["polaroid", "night"], f"挑了拍立得墙 × 夜航（{look(pa)}）")
        before = look(pa)
        pa.locator(".kfs-jz-dice-both").click(); time.sleep(0.4)
        after = look(pa)
        ok(after[0] != before[0] and after[1] != before[1] and after[0] in LAYOUTS and after[1] in STYLES, f"全洗牌：版式、风格都换了（{before} → {after}）")
        pa.locator(".kfs-jz-dice-layout").click(); time.sleep(0.3)
        ok(look(pa)[0] != after[0] and look(pa)[1] == after[1], "换版式：只换版式")
        broken = []
        for lay in LAYOUTS:
            pa.locator(".kfs-jz-layout").click(); time.sleep(0.3)
            pa.locator(f".kfs-jz-pick[data-k='{lay}']").click(); time.sleep(0.3)
            info = pa.evaluate("(() => { const s = document.querySelector('.kfs-jz .jz-sheet'); const r = s.getBoundingClientRect(); return { h: r.height, w: r.width, parts: [...s.querySelectorAll('[data-part]')].map((e) => e.dataset.part), sw: document.querySelector('.kfs-jz-scroll').scrollWidth - document.querySelector('.kfs-jz-scroll').clientWidth }; })()")
            if not (info["h"] > 300 and "hero" in info["parts"] and "title" in info["parts"] and info["sw"] <= 1):
                broken.append((lay, info))
        ok(not broken, f"六种版式都排得开：有主照片、标题，没有横着溢出去的（{broken}）")
        pa.locator(".kfs-jz-layout").click(); time.sleep(0.3)
        pa.locator(".kfs-jz-pick[data-k='column']").click(); time.sleep(0.3)
        pa.locator(".kfs-jz-style").click(); time.sleep(0.3)
        pa.locator(".kfs-jz-pick[data-k='xuan']").click(); time.sleep(0.8)
        ok(page_of_day(pa, today)["layout"] == "column" and page_of_day(pa, today)["style"] == "xuan", "换了就存（单栏流 × 宣纸）")

        # ================= 贴纸、写字、挪 =================
        pa.locator(".kfs-jz-addsticker").click(); time.sleep(0.4)
        wait_js(pa, "!!document.querySelector(\".kfs-jz-sticker[data-k='e:fox'] svg\")", 10000)
        ok(pa.locator(".kfs-jz-tab").count() == 10 and pa.locator(".kfs-jz-sticker[data-k='e:fox'] svg").count() == 1, "贴纸栏十栏；Fluent Emoji 那一包取得到（狐狸画出来了）")
        pa.locator(".kfs-jz-sticker[data-k='e:fox']").click(); time.sleep(0.9)
        fox0 = [s for s in page_of_day(pa, today)["mine"]["stickers"] if s["k"] == "e:fox"][0]
        r0 = fox0["r"]
        ratio = pa.evaluate("(() => { const r = document.querySelector('.kfs-jz .jz-wrap').getBoundingClientRect(); return r.height / r.width; })()")
        ok(0 < fox0["y"] < ratio - 0.05, f"新贴的就在纸上（不跑到纸底外头去：{fox0['y']:.2f} < {ratio:.2f}）")
        ok(pa.locator(".kfs-jz .jz-stk[data-k='e:fox'] svg").count() == 1 and pa.locator(".kfs-jz .jz-stk.sel").count() == 1 and pa.locator(".kfs-jz-selbar").is_visible(),
           "贴上一只狐狸：选中着，底下冒出转、大小、删")
        pa.locator(".kfs-jz-selbar").get_by_role("button", name="大").click(); time.sleep(0.2)
        pa.locator(".kfs-jz-selbar").get_by_role("button", name="右转").click(); time.sleep(0.2)
        pos0 = pa.evaluate("(() => { const e = document.querySelector(\".kfs-jz .jz-stk[data-k='e:fox']\"); return [e.style.left, e.style.top]; })()")
        drag(pa, ".kfs-jz .jz-stk[data-k='e:fox']", 60, 40); time.sleep(0.9)
        pos1 = pa.evaluate("(() => { const e = document.querySelector(\".kfs-jz .jz-stk[data-k='e:fox']\"); return [e.style.left, e.style.top]; })()")
        fox = [s for s in page_of_day(pa, today)["mine"]["stickers"] if s["k"] == "e:fox"]
        ok(pos1 != pos0 and len(fox) == 1 and fox[0]["s"] == 1.15 and fox[0]["r"] == r0 + 12, f"按住挪得动，松手存了（{pos0} → {pos1}；大了一号、转了 12 度）")
        pa.locator(".kfs-jz .jz-stk[data-k='e:fox']").click(); time.sleep(0.3)
        ok(pa.locator(".kfs-jz .jz-stk.sel").count() == 1, "点一下贴纸：选中，不会一点就又放掉")
        pa.locator(".kfs-jz-scroll").click(position={"x": 8, "y": 8}); time.sleep(0.3)
        ok(pa.locator(".kfs-jz .jz-stk.sel").count() == 0 and not pa.locator(".kfs-jz-selbar").count(), "点纸外头：放掉")
        pa.locator(".kfs-jz-addsticker").click(); time.sleep(0.4)
        pa.locator(".kfs-jz-tab", has_text="胶带").click(); time.sleep(0.3)
        tapes = pa.evaluate("[...document.querySelectorAll(\".kfs-jz-sticker[data-k^='t:'] .tape\")].map((e) => e.getBoundingClientRect().height)")
        ok(len(tapes) == 8 and min(tapes) > 8, f"胶带那一栏：八种花色都看得见（{tapes[:3]}…）")
        pa.locator(".kfs-jz-tab", has_text="印章").click(); time.sleep(0.3)
        ok(pa.locator(".kfs-jz-sticker").count() == 6 and pa.locator(".kfs-jz-sticker[data-k='s:卿卿']").count() == 1, "印章那一栏：先摆着的六枚（没有同页作者家的那两枚）")
        pa.get_by_placeholder("自己刻一枚（最多四个字）").fill("泡桐花开")
        pa.locator(".kfs-jz-carve").click(); time.sleep(0.5)
        ok(pa.locator(".kfs-jz .jz-stk[data-k='s:泡桐花开'] text").count() == 4, "自己刻一枚：四个字的章贴上了")
        pa.locator(".kfs-jz-addtext").click(); time.sleep(0.4)
        pa.locator(".kfs-jz-textin").fill("好看")
        pa.locator(".kfs-jz-textok").click(); time.sleep(0.8)
        ok(pa.locator(".kfs-jz .jz-stk.txt", has_text="好看").count() == 1 and [t["m"] for t in page_of_day(pa, today)["mine"]["texts"]] == ["好看"], "写了两个字贴在页上")
        pa.locator(".kfs-jz-selbar").get_by_role("button", name="删掉").click(); time.sleep(0.8)
        ok(pa.locator(".kfs-jz .jz-stk.txt").count() == 0 and page_of_day(pa, today)["mine"]["texts"] == [], "选中的字点删掉：没了")
        pa.locator(".kfs-jz-addtext").click(); time.sleep(0.4)
        pa.locator(".kfs-jz-textin").fill("好看")
        pa.locator(".kfs-jz-textok").click(); time.sleep(0.6)

        # ================= 点纸上一块：改字、藏起来 =================
        tap_part(pa, "title")
        ok([b.inner_text() for b in pa.locator(".kfs-jz-act").all()] == ["改字", "藏起来", "留一条批注"], "点标题：改字、藏起来、留一条批注")
        act(pa, "改字")
        pa.locator(".kfs-jz-edit").fill("泡桐花真的开了")
        pa.locator(".kfs-jz-save").click(); time.sleep(0.8)
        ok(pa.locator(".kfs-jz .jz-title").inner_text().startswith("泡桐花真的开了") and page_of_day(pa, today)["arr"]["title"] == "泡桐花真的开了", "改了标题（她自己拼的一页：直接改在排的那一份上）")
        tap_part(pa, "cap")
        ok([b.inner_text() for b in pa.locator(".kfs-jz-act").all()] == ["改字", "藏起来", "留一条批注"], "点主照片底下那一行：是它自己那一块（改字、藏起来、留批注），不当成点了照片")
        act(pa, "改字")
        pa.locator(".kfs-jz-edit").fill("运河边 · 下午四点")
        pa.locator(".kfs-jz-save").click(); time.sleep(0.8)
        ok(pa.locator(".kfs-jz .jz-hero .jz-cap").inner_text() == "运河边 · 下午四点" and page_of_day(pa, today)["arr"]["cap"] == "运河边 · 下午四点", "主照片底下那一行改得了")
        tap_part(pa, "mood")
        act(pa, "藏起来")
        ok(toast(pa, "心情.*藏起来了") and pa.locator(".kfs-jz .jz-sheet [data-part='mood']").count() == 0, "心情藏起来了")
        pa.locator(".kfs-jz-more").click(); time.sleep(0.4)
        ok(pa.locator(".kfs-jz-unhide").all_inner_texts() == ["心情"], "“更多”里列着藏起来的：心情")
        sheet_off(pa)

        # ================= 批注 =================
        tap_part(pa, "hero")
        act(pa, "留一条批注")
        pa.locator(".kfs-jz-notein").fill("这张拍糊了一点")
        pa.locator(".kfs-jz-noteok").click(); time.sleep(0.6)
        ok(pa.locator(".kfs-jz-note").count() == 1 and "贴在主照片旁边" in pa.locator(".kfs-jz-note").inner_text(), "在主照片旁边留了一条批注")
        sheet_off(pa)
        ok(pa.locator(".kfs-jz .jz-sheet [data-part='hero'] .jz-nb").inner_text().strip() == "批 1" and pa.locator(".kfs-jz-notes").inner_text().strip() == "1", "主照片角上标着“批 1”，顶上批注那颗写着 1")
        ns = notes_of_day(pa, today)
        ok(len(ns) == 1 and ns[0]["who"] == "her" and ns[0]["part"] == "hero" and ns[0]["text"] == "这张拍糊了一点", "批注存在 kfs2:jzn:<日子>（谁、贴在哪）")

        # ================= 让光义排 =================
        n_ar = len(calls())
        pa.locator(".kfs-jz-him").click(); time.sleep(0.4)
        him_txt = pa.locator(".kfs-sheet").last.inner_text()
        ok("你藏起来的、自己改的字、写的字、贴的贴纸都留着" in him_txt and "你放的照片他没挑的挪到最后，不会丢" in him_txt and "用他写的" in him_txt, "让他排之前说清楚：她动过的都留着，她放的照片不会丢，她写的字照她写的摆")
        pa.locator(".kfs-jz-wish").fill("要那张饭")
        pa.locator(".kfs-jz-go").click()
        ok(toast(pa, "他排好了", 20000), "交给他：一会儿排好了")
        time.sleep(1.0)
        ab = calls()[n_ar]["body"]
        content = ab["messages"][0]["content"]
        text0 = content[0]["text"]
        imgs = [b for b in content if b.get("type") == "image"]
        ok(len(ab["system"]) == 2 and ab["system"][1]["text"].startswith("【排手帐】") and "tools" not in ab and "【日记本】" not in ab["system"][0]["text"],
           "问他的那一回：名帖后面跟【排手帐】的规矩，不带工具，名帖里也不带【日记本】（跟写日记一样）")
        ok(len(imgs) == 3 and "照片 3 张" in text0 and "她说想要：要那张饭" in text0 and HER_DIARY in text0 and "小雨" in text0 and "她藏起来的：心情" in text0 and "“好看”" in text0,
           "寄过去的：三张照片（页上那两张、聊天里还没放上去的那张）、原话、日记、天气、她想要的、她动过的")
        ok(re.search(r"^\S+｜\d\d:\d\d｜卿卿｜今天看到泡桐花了$", text0, re.M), "原话一句一行，带编号")
        pg = page_of_day(pa, today)
        ok(look(pa) == ["bento", "film"] and pg["arr"]["title"] == "（测试排的）泡桐花" and pa.locator(".kfs-jz .jz-title").inner_text().startswith("泡桐花真的开了")
           and pg["mine"]["edit"].get("title") == "泡桐花真的开了" and pg["mine"]["edit"].get("cap") == "运河边 · 下午四点",
           f"他挑了格子便当 × 复古胶片、起了标题；她原来写的标题、主照片底下那一行挪到她那一层，照她写的摆（{look(pa)}）")
        roles = {x["role"]: x for x in pg["arr"]["photos"]}
        ok(pg["arr"]["by"] == "him" and [x["role"] for x in pg["arr"]["photos"]] == ["hero", "food", "more"] and roles["hero"]["id"] == hero["id"] and roles["hero"].get("from") == photo_ids[0]
           and roles["food"]["from"] == photo_ids[1] and roles["food"]["id"].startswith("jz") and roles["more"]["id"] == album["id"]
           and all(kv(pa, "kfs2:jzimg:" + x["id"]) for x in pg["arr"]["photos"]),
           f"照片：主照片还是页上那张（记着从聊天哪张来）；饭是聊天里另一张（另存了一份）；相册那张他没挑，留在页上挪到最后；图一张都没删（{[(x['role'], x['id'][:8], x.get('from', '')[:6]) for x in pg['arr']['photos']]}）")
        tap_part(pa, "title")
        ok("用他写的" in [b.inner_text() for b in pa.locator(".kfs-jz-act").all()], "点标题：多一样“用他写的”")
        act(pa, "用他写的"); time.sleep(0.8)
        ok(pa.locator(".kfs-jz .jz-title").inner_text().startswith("（测试排的）泡桐花") and "title" not in page_of_day(pa, today)["mine"]["edit"],
           f"点“用他写的”：标题换成他起的（{pa.locator('.kfs-jz .jz-title').inner_text()!r}，她那一层 {list(page_of_day(pa, today)['mine']['edit'])}）")
        sent = {m.group(1): m.group(2) for m in re.finditer(r"^(\S+)｜\d\d:\d\d｜(?:卿卿|你)｜(.*)$", text0, re.M)}
        ok([q["id"] for q in pg["arr"]["quotes"]] == list(sent)[:2] and all(sent[q["id"]] == q["p"] for q in pg["arr"]["quotes"]),
           f"原话：照他写的编号抄了两句（字照原话），编的那个编号不认（{[q['p'] for q in pg['arr']['quotes']]}）")
        ok([s["k"] for s in pg["arr"]["stickers"]] == ["e:fox", "d:heart", "s:卿卿"], f"他挑的贴纸：认得的三张贴上了（{[s['k'] for s in pg['arr']['stickers']]}）")
        ok(pg["mine"]["hide"] == ["mood"] and [t["m"] for t in pg["mine"]["texts"]] == ["好看"] and any(s["k"] == "s:泡桐花开" for s in pg["mine"]["stickers"]) and pa.locator(".kfs-jz .jz-sheet [data-part='mood']").count() == 0,
           "她那一层都留着：藏起来的心情、写的字、刻的章")
        ok("她要的：要那张饭" in pg["arr"]["body"], "正文里看得出她想要的带过去了")
        ns = notes_of_day(pa, today)
        ok(len(ns) == 2 and ns[1]["who"] == "him" and ns[1]["text"] == "（测试批注）这张我最喜欢" and ns[1]["part"] == "hero" and pa.locator(".kfs-jz-notes").inner_text().strip() == "2",
           "他排的时候顺手留了一条批注（贴在主照片旁边）")
        n_ar = len(calls())
        pa.locator(".kfs-jz-him").click(); time.sleep(0.4)
        ok("这一页他排过一回" in pa.locator(".kfs-sheet").last.inner_text(), "再让他排：说清楚会换成新的一版")
        pa.locator(".kfs-jz-wish").fill("排坏")
        pa.locator(".kfs-jz-go").click()
        ok(toast(pa, "没排成（他回的里头没有排好的那一段）", 20000) and page_of_day(pa, today)["arr"]["title"] == "（测试排的）泡桐花", "他回的拆不出来：说“没排成”，这一页原样不动")
        before = page_of_day(pa, today)
        imgs0 = pa.evaluate(IMGS)
        pa.locator(".kfs-jz-him").click(); time.sleep(0.4)
        pa.locator(".kfs-jz-wish").fill("排空")
        pa.locator(".kfs-jz-go").click()
        got_toast = toast(pa, "没排成（他排好的那一段是空的）", 20000)
        after = page_of_day(pa, today)
        ok(got_toast and after == before and pa.evaluate(IMGS) == imgs0,
           f"他回了一段空的：也算没排成，这一页、照片一样都没动（提示 {got_toast}；变了的 {[k for k in after if after.get(k) != before.get(k)]}；图 {len(imgs0)} → {len(pa.evaluate(IMGS))}；{pa.evaluate('(document.querySelector(\'.kfs-jz-toast\') || {}).innerText')}）")
        tap_part(pa, "title")
        act(pa, "改字")
        pa.locator(".kfs-jz-edit").fill("她改的标题")
        pa.locator(".kfs-jz-save").click(); time.sleep(0.8)
        pg = page_of_day(pa, today)
        ok(pa.locator(".kfs-jz .jz-title").inner_text().startswith("她改的标题") and pg["arr"]["title"] == "（测试排的）泡桐花" and pg["mine"]["edit"]["title"] == "她改的标题",
           "他排的一页她改标题：改在她那一层（他排的那一份不动，再排也盖不掉她的）")
        if SHOTS:
            os.makedirs(SHOTS, exist_ok=True)
            pa.screenshot(path=f"{SHOTS}/jz_editing.png")
        jz_back(pa)

        # ================= 回闲笔集：卡片、批注 =================
        time.sleep(0.6)
        card = pa.locator(".kfs-jz-open").inner_text()
        ok("她改的标题" in card and "格子便当 × 复古胶片" in card and "他排的" in card and "批注 2" in card and pa.locator(".kfs-jz-open img").count() == 1,
           f"闲笔集里那一天：一张小卡片（主照片、标题、版式风格、他排的、批注几条）（{card!r}）")
        ok(pa.locator(".kfs-day-note").count() == 2 and pa.locator(".kfs-day-note[data-who='him']").inner_text().startswith("光义批"), "两条批注也摆在那一天底下")
        tag_day = pa.evaluate("(() => [...document.querySelectorAll('.kfs-page .kfs-jz-tag')].map((e) => [...e.closest('button').querySelectorAll('span')].map((s) => s.textContent.trim()).find((x) => /^\\d+$/.test(x))))()")
        ok(tag_day == [str(d)], f"掺了手帐的那天（今天），日历格子上多一个 🏷️（{tag_day}）")
        pa.locator(".kfs-day-noteadd").click(); time.sleep(0.3)
        pa.locator(".kfs-day-notein").fill("闲笔集里留的一句")
        pa.locator(".kfs-day-noteok").click(); time.sleep(0.8)
        ok(pa.locator(".kfs-day-note").count() == 3 and len(notes_of_day(pa, today)) == 3, "在那一天底下也能直接留一条")
        pa.locator(".kfs-day-note", has_text="闲笔集里留的一句").locator(".kfs-day-notedrop").click(); time.sleep(0.3)
        ok(pa.locator(".kfs-day-note").count() == 3 and "再点一次" in pa.locator(".kfs-day-note", has_text="闲笔集里留的一句").inner_text(), "删一条：点一下先问")
        pa.locator(".kfs-day-note", has_text="闲笔集里留的一句").locator(".kfs-day-notedrop").click(); time.sleep(0.8)
        ok(pa.locator(".kfs-day-note").count() == 2 and len(notes_of_day(pa, today)) == 2, "再点一下：删了")
        leave_xianbi(pa)

        # ================= 他翻日记看得到手帐和批注；他留批注 =================
        n1 = len(calls())
        say(pa, f"翻日记 {today}")
        wait_mock(lambda: len(calls()) >= n1 + 2, 30); wait_js(pa, "!(" + TYPING + ")", 30000); time.sleep(1.5)
        cid, msgs = chat_of(pa)
        step = [m for m in msgs if m["role"] == "him" and m.get("calls")][-1]
        out = step["calls"][0]["out"]
        ok("手帐：有一页（你排的；版式 格子便当，风格 复古胶片）" in out and "标题：她改的标题" in out and "批注 2 条" in out and "（测试批注）这张我最喜欢" in out and "这张拍糊了一点" in out,
           "他翻今天的日记：那一页手帐（谁排的、版式风格、她改过的标题）和两条批注都跟着")
        n2 = len(calls())
        say(pa, f"留批注 {today} 那天的泡桐花")
        wait_mock(lambda: len(calls()) >= n2 + 2, 30); wait_js(pa, "!(" + TYPING + ")", 30000); time.sleep(1.5)
        notes_txt = pa.evaluate("[...document.querySelectorAll('.kfs-diary-note')].map((e) => e.innerText)")
        ns = notes_of_day(pa, today)
        ok(notes_txt[-1] == f"批注了日记 · {label}" and len(ns) == 3 and ns[-1]["who"] == "him" and ns[-1]["text"] == "那天的泡桐花" and ns[-1]["part"] == "hero",
           f"他留批注：聊天里一行小字“批注了日记 · {label}”，存进那一天（{notes_txt[-1:]}）")
        cont = calls()[n2 + 1]["body"]["messages"][-1]["content"][0]
        ok(cont["type"] == "tool_result" and "留好了" in str(cont["content"]), f"留好了递回给他（{str(cont['content'])[:40]}）")

        # ================= 重新打开：都还在 =================
        pa.reload(); kite(pa)
        open_xianbi(pa)
        card = pa.locator(".kfs-jz-open").inner_text()
        ok("她改的标题" in card and "批注 3" in card and pa.locator(".kfs-day-note").count() == 3 and pa.locator(".kfs-page .kfs-jz-tag").count() == 1, "重新打开：卡片、三条批注、日历上的 🏷️ 都在")
        open_jz(pa)
        wait_js(pa, "!!document.querySelector(\".kfs-jz .jz-stk[data-k='e:fox'] svg\")", 10000)
        ok(look(pa) == ["bento", "film"] and pa.locator(".kfs-jz .jz-stk[data-k='s:泡桐花开']").count() == 1 and pa.locator(".kfs-jz .jz-stk.txt", has_text="好看").count() == 1 and pa.locator(".kfs-jz .jz-hero img").count() == 1 and pa.locator(".kfs-jz .jz-food img").count() == 1 and pa.locator(".kfs-jz .jz-more img").count() == 1,
           "点开：版式风格、贴纸、写的字、主照片、饭、相册那张都在")
        # ================= 云端只有乱码 =================
        time.sleep(3)
        rows = mock("/__debug/rows")
        data_rows = [r for r in rows if r["key"].startswith("h_")]
        dump = json.dumps(rows, ensure_ascii=False)
        ok(all(r["value"].startswith("v1.") and not CJK.search(r["value"]) and not CJK.search(r["key"]) for r in data_rows) and not any(w in dump for w in ["泡桐花", "她改的标题", "某城", "kfs2:jz", "12.35"]),
           f"云端每一条都是乱码：搜不到标题、批注、城市、记录名（{len(data_rows)} 条）")

        # ================= 他正排着的时候删掉这一页：图跟着删、批注留着，他排好的那一版回来了也不再存 =================
        pg = page_of_day(pa, today)
        ids = [x["id"] for x in pg["arr"]["photos"]]
        mock("/__debug/claude-hold?ms=20000")
        pa.locator(".kfs-jz-him").click(); time.sleep(0.4)
        pa.locator(".kfs-jz-wish").fill("")
        pa.locator(".kfs-jz-go").click()
        pa.locator(".kfs-jz-busy").wait_for(timeout=8000)
        ok(pa.locator(".kfs-jz-him").is_disabled(), "他正排着：“让光义排”那一颗点不动（不会连着问两回）")
        wait_mock(lambda: mock("/__debug/claude-held")["held"], 10)
        pa.locator(".kfs-jz-more").click(); time.sleep(0.4)
        pa.locator(".kfs-jz-delete").click(); time.sleep(0.3)
        pa.locator(".kfs-jz-delete").click(); time.sleep(1.2)
        ok(page_of_day(pa, today) is None and all(kv(pa, "kfs2:jzimg:" + i) is None for i in ids) and pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐",
           "删掉这一页：页和另存的照片都删了，卡片回到“掺一页手帐”")
        mock("/__debug/claude-release"); time.sleep(3)
        ok(page_of_day(pa, today) is None and pa.evaluate(IMGS) == [] and pa.locator(".kfs-jz-open").inner_text().strip() == "掺一页手帐",
           "删了以后他排好的那一版才回来：不再存（页没活过来），聊天里那张也没另存")
        ok(len(notes_of_day(pa, today)) == 3 and pa.locator(".kfs-day-note").count() == 3, "批注不跟着删（那一天底下还在）")
        ok(pa.locator(".kfs-page .kfs-jz-tag").count() == 0, "删了这一页：日历上的 🏷️ 也没了")
        cid, msgs = chat_of(pa)
        ok(sum(1 for m in msgs if m.get("kind") == "photo") == 2, "聊天里那两张照片没动")
    except Exception as e:
        import traceback; traceback.print_exc()
        ok(False, f"出错：{e}")
    finally:
        ok(not errors, f"页面没报错：{errors[:3]}")
        print(f"\n通过 {count['passed']}  失败 {count['failed']}")
        browser.close()
    raise SystemExit(1 if count["failed"] or errors else 0)
