# 头像册（见 src/avatarBook.js、src/panels/AvatarBook.jsx）：账户面板头像那一栏只剩“从相册选”和“头像册”两颗；
# 头像册点开是存好的头像，一行一张卡片：小图（点了放大）、名字、名字后面一支钢笔（改名字）、最右边一个方格（点了才换头像，在用的打勾）；
# 左滑露出垃圾桶，点两次才删；能添（相册选图起名字、把眼下用的存进来）；跟着云端走。
# 真的浏览器、假 Supabase。先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_avbook.py [截图目录]
import os, sys, time, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
from mailkit import *

errors = []
SHOTS = sys.argv[1] if len(sys.argv) > 1 else ""
ART = os.path.abspath(os.path.join(HERE, "..", ".cache", "avbook-art"))
os.makedirs(ART, exist_ok=True)
def art(name, col, mark):
    p = os.path.join(ART, name)
    im = Image.new("RGB", (600, 800), col); d = ImageDraw.Draw(im)
    d.ellipse([150, 250, 450, 550], fill=mark); d.rectangle([0, 0, 600, 60], fill=mark)
    im.save(p); return p
RED = art("red.png", (214, 120, 100), (250, 236, 220))
BLUE = art("blue.png", (90, 130, 190), (236, 240, 250))
GREEN = art("green.png", (110, 160, 120), (240, 248, 236))
NOT_IMG = os.path.join(ART, "not-a-picture.png")
with open(NOT_IMG, "w") as f: f.write("这不是一张图")

def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name))
# 册子里眼下什么样：一行一行的名字、哪一行打着勾、图、卡片和垃圾桶摆在哪
DIGEST = "const digest = (u) => (u.length > 80 ? u.slice(0, 16) + ':' + u.length + ':' + u.slice(-24) : u);"
ROWS = """() => { %s return Array.from(document.querySelectorAll('.kfs-avbook-item')).map((it) => { const r = it.querySelector('.kfs-avbook-row'); const img = r.querySelector('img');
  const lab = r.querySelector('.kfs-avbook-label'); const box = r.querySelector('.kfs-avbook-check'); const bin = it.querySelector('.kfs-avbook-bin'); const big = it.querySelector('.kfs-avbook-big img');
  const q = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  return { label: lab ? lab.textContent : null, using: r.hasAttribute('data-using'), checked: !!box && box.getAttribute('aria-checked') === 'true', tick: !!box && !!box.querySelector('svg'),
    kind: r.getAttribute('data-kind'), ok: !!img && img.naturalWidth > 0, src: img ? digest(img.getAttribute('src')) : '', open: it.hasAttribute('data-open'),
    card: q(r), bin: q(bin), binShown: parseFloat(getComputedStyle(bin).opacity), binText: bin.textContent, binIcon: !!bin.querySelector('svg'),
    big: big ? { box: q(big), src: digest(big.getAttribute('src')), radius: parseFloat(getComputedStyle(big).borderRadius), ok: big.naturalWidth > 0 } : null }; }); }""" % DIGEST
def rows(page): return page.evaluate(ROWS)
def labels(page): return [r["label"] for r in rows(page)]
def using(page): return [r["label"] for r in rows(page) if r["using"]]
def one(page, label): return next(r for r in rows(page) if r["label"] == label)
# 账户面板最上面那个大头像眼下是哪张图（默认的字是 'default'）；册子开着的时候量不着（None）
MINE = """() => { %s const a = document.querySelector('.kfs-avbook-entry'); if (!a) return null; const img = a.parentElement.parentElement.querySelector('img');
  return img ? digest(img.getAttribute('src')) : 'default'; }""" % DIGEST
def mine(page): return page.evaluate(MINE)
def open_book(page):
    page.locator(".kfs-avbook-entry").scroll_into_view_if_needed()
    page.locator(".kfs-avbook-entry").click()
    page.locator(".kfs-avbook").wait_for(timeout=5000); page.wait_for_timeout(450)
def back(page):
    page.get_by_role("button", name="关闭").click(); page.wait_for_timeout(450)
def pick(page, how, path):
    with page.expect_file_chooser(timeout=5000) as fc:
        how()
    fc.value.set_files(path); page.wait_for_timeout(700)
def box_of(page, label): return page.get_by_role("checkbox", name="用这张：" + label, exact=True)
def row(page, label): return page.locator(".kfs-avbook-item").filter(has=box_of(page, label))
def use(page, label): box_of(page, label).click(); page.wait_for_timeout(400)
# 手指在一行上划：从卡片中间偏右的地方起，横着走 dx、竖着走 dy
CDP = {}
def finger(page, label, dx, dy=0, steps=8, lift=True):
    cdp = CDP.setdefault(page, page.context.new_cdp_session(page))
    c = one(page, label)["card"]
    x0, y0 = c[0] + c[2] * 0.62, c[1] + c[3] / 2
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
    for i in range(1, steps + 1):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + dx * i / steps, "y": y0 + dy * i / steps}]})
        page.wait_for_timeout(16)
    if lift:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); page.wait_for_timeout(420)
def lift(page):
    CDP[page].send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); page.wait_for_timeout(420)
# 删一行：左滑、点垃圾桶、再点一次
def drop(page, label):
    finger(page, label, -90)
    row(page, label).locator(".kfs-avbook-bin").click(); page.wait_for_timeout(250)
    row(page, label).locator(".kfs-avbook-bin").click(); page.wait_for_timeout(450)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)
        chat(pa, "在吗")

        # ================= 头像那一栏：两颗钮 =================
        open_panel(pa)
        pa.locator(".kfs-avbook-entry").scroll_into_view_if_needed(); pa.wait_for_timeout(300)
        sec = pa.locator(".kfs-avbook-entry").locator("xpath=..")
        names = [b.inner_text().strip() for b in sec.locator("button").all()]
        ok(names == ["从相册选", "头像册"] and pa.get_by_role("button", name="恢复默认").count() == 0 and pa.get_by_role("button", name="白兔").count() == 0 and mine(pa) == "default",
           f"头像那一栏只有两颗钮：从相册选、头像册；没有“恢复默认”，那四颗小钮收起来了（{names}）")
        shot(pa, "avbook_1_account.png")

        # ================= 点开：原来那四张 =================
        open_book(pa)
        r = rows(pa)
        ok(pa.get_by_text("头像册", exact=True).count() == 1 and [x["label"] for x in r] == ["白兔", "小老鼠", "吃东西鼠", "坏猫"] and all(x["kind"] == "meme" and x["ok"] for x in r) and not using(pa),
           f"点“头像册”：一页单子，原来那四张，一行一张图一个名字，图都显示得出来（{[x['label'] for x in r]}）")
        ok(pa.locator(".kfs-avbook-add").inner_text() == "添一张" and pa.locator(".kfs-avbook-keep").count() == 0, "最上面一颗“添一张”；眼下是默认头像，没有“把现在用的存进来”")
        parts = pa.evaluate("""(() => { const r = document.querySelector('.kfs-avbook-row'); const x = (s) => { const b = r.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; }; const c = r.getBoundingClientRect();
          const sq = r.querySelector('.kfs-avbook-check span').getBoundingClientRect(); const cs = getComputedStyle(r.querySelector('.kfs-avbook-check span'));
          return { thumb: x('.kfs-avbook-thumb'), label: x('.kfs-avbook-label'), pen: x('.kfs-avbook-pen'), check: x('.kfs-avbook-check'), card: [Math.round(c.left), Math.round(c.right)], sq: [Math.round(sq.width), Math.round(sq.height)], radius: parseFloat(cs.borderRadius),
            drops: r.querySelectorAll('.kfs-avbook-drop').length, said: r.textContent.includes('在用') }; })()""")
        ok(parts["thumb"][1] <= parts["label"][0] and 0 <= parts["pen"][0] - parts["label"][1] <= 4 and parts["pen"][1] < parts["check"][0] - 60 and parts["card"][1] - parts["check"][1] <= 12
           and parts["sq"] == [24, 24] and parts["radius"] < 12 and not parts["drops"] and not parts["said"] and not any(x["tick"] or x["binShown"] > 0 for x in r),
           f"一行从左到右：小图、名字、紧跟着一支钢笔、最右边一个方格（方的，空着）；没有小桶、没有“在用”两个字，垃圾桶藏着（{parts}）")
        shot(pa, "avbook_2_list.png")

        # ================= 点方格才换；点别的地方不换 =================
        pa.locator(".kfs-avbook-label", has_text="白兔").click(); pa.wait_for_timeout(300)
        c = one(pa, "白兔")["card"]
        pa.mouse.click(c[0] + c[2] * 0.6, c[1] + c[3] / 2); pa.wait_for_timeout(300)
        ok(not using(pa), "点名字、点卡片中间：不换头像")
        use(pa, "白兔")
        bunny = rows(pa)[0]["src"]
        r = rows(pa)
        ok(using(pa) == ["白兔"] and [x["label"] for x in r if x["checked"] and x["tick"]] == ["白兔"] and pa.locator(".kfs-avbook").count() == 1 and pa.locator(".kfs-avbook-keep").count() == 0,
           "点“白兔”那行最右边的方格：换上了，格子里打了勾（只这一格）；册子不收起来；已经在册子里的不用再存")
        shot(pa, "avbook_3_using.png")
        back(pa)
        ok(pa.locator(".kfs-avbook").count() == 0 and pa.locator(".kfs-avbook-entry").count() == 1 and mine(pa) == bunny, "关掉册子回到“头像与设置”，上面的头像是白兔")
        close_panel(pa)
        ok(pa.get_by_text("你换了新头像").count() == 1, "聊到一半从册子里换的：对话里照旧留一行“你换了新头像”")
        open_panel(pa); open_book(pa)
        use(pa, "白兔")
        back(pa)
        ok(mine(pa) == bunny, "已经打勾的方格再点一下：不动，还是这一张")
        open_book(pa)
        ok(using(pa) == ["白兔"], "勾还在")
        use(pa, "坏猫")
        ok(using(pa) == ["坏猫"] and [x["label"] for x in rows(pa) if x["tick"]] == ["坏猫"], "点另一行的方格：勾挪过去")
        use(pa, "白兔")
        back(pa)

        # ================= 从相册选：直接换上，不进册子 =================
        pick(pa, lambda: pa.get_by_role("button", name="从相册选").click(), RED)
        red = mine(pa)
        ok(red.startswith("data:image/jpeg") and red != bunny, "“从相册选”：选了直接换上")
        open_book(pa)
        ok(labels(pa) == ["白兔", "小老鼠", "吃东西鼠", "坏猫"] and not using(pa) and not any(x["tick"] for x in rows(pa)) and pa.locator(".kfs-avbook-keep").inner_text() == "把现在用的存进来",
           "这一张没进册子（还是四行，哪格都没勾）；册子上面多一颗“把现在用的存进来”")
        shot(pa, "avbook_3b_keep.png")

        # ================= 把现在用的存进来 =================
        pa.locator(".kfs-avbook-keep").click(); pa.wait_for_timeout(300)
        ok(pa.locator(".kfs-avbook-new").count() == 1 and pa.locator(".kfs-avbook-new img").count() == 1 and pa.locator(".kfs-avbook-keep").count() == 0, "点它：出来一张小卡片，左边是那张图，右边起名字")
        fs = pa.evaluate("parseFloat(getComputedStyle(document.querySelector('.kfs-avbook-name')).fontSize)")
        ok(fs >= 16, f"起名字的框是十六像素的字，iPhone 上点进去不会放大（{fs}）")
        pa.locator(".kfs-avbook-name").fill("一二三四五六七八九十甲乙丙丁")
        ok(pa.locator(".kfs-avbook-name").input_value() == "一二三四五六七八九十甲乙", "名字最多十二个字，多的打不进去")
        # 用拼音打名字（她 11 月 18 日 19:10 在他那本上报的，这一本是同一个毛病）：还没选字的工夫里不动框里的字
        nb = pa.locator(".kfs-avbook-name"); nb.fill("")
        mid = ime(pa, nb, "hong hong de na yi zhang tu", "红红的那一张图")
        ok(mid == "hong hong de na yi zhang tu" and nb.input_value() == "红红的那一张图", f"用拼音打名字：拼音超过十二个字母也不被截，选了字才落进去（{mid} → {nb.input_value()}）")
        pa.locator(".kfs-avbook-name").fill("  红的那张 ")
        shot(pa, "avbook_4_naming.png")
        pa.locator(".kfs-avbook-save").click(); pa.wait_for_timeout(500)
        r = rows(pa)
        ok([x["label"] for x in r] == ["红的那张", "白兔", "小老鼠", "吃东西鼠", "坏猫"] and r[0]["kind"] == "pic" and r[0]["ok"] and r[0]["src"] == red and using(pa) == ["红的那张"] and pa.locator(".kfs-avbook-new").count() == 0 and pa.locator(".kfs-avbook-keep").count() == 0,
           "点“存进去”：放在最上面，名字收拾过，格子里打着勾；卡片收起，那颗钮也没了")

        # ================= 添一张：从相册选、起名字；不换头像 =================
        pick(pa, lambda: pa.locator(".kfs-avbook-add").click(), BLUE)
        ok(pa.locator(".kfs-avbook-new").count() == 1 and len(labels(pa)) == 5, "“添一张”选了图：先出来起名字的卡片，还没进单子")
        pa.get_by_role("button", name="不存了").click(); pa.wait_for_timeout(300)
        ok(pa.locator(".kfs-avbook-new").count() == 0 and len(labels(pa)) == 5, "点“不存了”：卡片收起，单子没变")
        pick(pa, lambda: pa.locator(".kfs-avbook-add").click(), BLUE)
        pa.locator(".kfs-avbook-name").fill("蓝的"); pa.locator(".kfs-avbook-name").press("Enter"); pa.wait_for_timeout(500)
        ok(labels(pa) == ["蓝的", "红的那张", "白兔", "小老鼠", "吃东西鼠", "坏猫"] and using(pa) == ["红的那张"], "再选一次、起名字按回车：存进去了，放在最上面；头像没换，打勾的还是红的那张")
        pick(pa, lambda: pa.locator(".kfs-avbook-add").click(), GREEN)
        pa.locator(".kfs-avbook-save").click(); pa.wait_for_timeout(500)
        ok(labels(pa)[0] == "未命名" and len(labels(pa)) == 7, "没起名字就存：叫“未命名”")
        shot(pa, "avbook_5_added.png")
        pick(pa, lambda: pa.locator(".kfs-avbook-add").click(), BLUE)
        said = pa.locator(".kfs-avbook-note").inner_text() if pa.locator(".kfs-avbook-note").count() else ""
        ok("已经有了" in said and pa.locator(".kfs-avbook-new").count() == 0 and len(labels(pa)) == 7, f"同一张图再添一遍：说一声已经有了，不存第二遍（{said}）")
        pick(pa, lambda: pa.locator(".kfs-avbook-add").click(), NOT_IMG)
        said = pa.locator(".kfs-avbook-note").inner_text() if pa.locator(".kfs-avbook-note").count() else ""
        ok("读不出来" in said and len(labels(pa)) == 7, f"选了个不是图的：说一声读不出来（{said}）")

        # ================= 相册选的那一行也能换 =================
        use(pa, "蓝的")
        ok(using(pa) == ["蓝的"], "点“蓝的”那一行的方格：换上了")
        back(pa)
        blue = mine(pa)
        ok(blue.startswith("data:image/jpeg") and blue != red, "回到“头像与设置”：头像是蓝的那张")
        open_book(pa)

        # ================= 点小图：放大了摆在卡片下面正中 =================
        row(pa, "红的那张").locator(".kfs-avbook-thumb").click(); pa.wait_for_timeout(500)
        r = rows(pa); it = next(x for x in r if x["label"] == "红的那张"); nxt = r[[x["label"] for x in r].index("红的那张") + 1]
        b = it["big"]
        ok(b and b["ok"] and b["src"] == red and b["box"][2] == b["box"][3] >= 180 and 12 < b["radius"] < b["box"][2] / 2 - 20 and b["box"][1] >= it["card"][1] + it["card"][3] and b["box"][1] + b["box"][3] <= nxt["card"][1]
           and abs((b["box"][0] + b["box"][2] / 2) - (it["card"][0] + it["card"][2] / 2)) <= 1 and sum(1 for x in r if x["big"]) == 1 and using(pa) == ["蓝的"],
           f"点“红的那张”的小图：这张图放大了，圆角方的，摆在这张卡片下面正中、下一行上面；头像没换（{b}）")
        shot(pa, "avbook_10_big.png")
        row(pa, "白兔").locator(".kfs-avbook-thumb").click(); pa.wait_for_timeout(500)
        r = rows(pa)
        ok([x["label"] for x in r if x["big"]] == ["白兔"] and one(pa, "白兔")["big"]["src"] == bunny, "再点“白兔”的小图：红的那张自己收起，换成白兔放大（一次只放大一张）")
        row(pa, "白兔").locator(".kfs-avbook-thumb").click(); pa.wait_for_timeout(400)
        ok(not any(x["big"] for x in rows(pa)), "再点一下小图：收起来")
        row(pa, "白兔").locator(".kfs-avbook-thumb").click(); pa.wait_for_timeout(400)
        pa.locator(".kfs-avbook-big img").click(); pa.wait_for_timeout(400)
        ok(not any(x["big"] for x in rows(pa)) and using(pa) == ["蓝的"], "点大图本身也收起来；头像一直没动")

        # ================= 改名字：点名字后面的钢笔就地改 =================
        def pen(name): row(pa, name).locator(".kfs-avbook-pen").click(); pa.wait_for_timeout(300)
        box = pa.locator(".kfs-avbook-rename")
        pen("白兔")
        st = pa.evaluate("(() => { const i = document.querySelector('.kfs-avbook-rename'); const r = i.closest('.kfs-avbook-row'); return { v: i.value, focus: document.activeElement === i, sel: [i.selectionStart, i.selectionEnd], fs: parseFloat(getComputedStyle(i).fontSize), others: r.querySelectorAll('.kfs-avbook-pen, .kfs-avbook-check').length, done: r.querySelectorAll('.kfs-avbook-renamed').length, img: !!r.querySelector('img') }; })()")
        ok(st["v"] == "白兔" and st["focus"] and st["sel"] == [0, 2] and st["fs"] >= 16 and st["others"] == 0 and st["done"] == 1 and st["img"] and box.count() == 1,
           f"点“白兔”名字后面的钢笔：名字就地变成输入框，旧名字全选着；钢笔和方格换成一个对勾，图还在（{st}）")
        shot(pa, "avbook_9_rename.png")
        box.fill(""); mid = ime(pa, box, "da bai tu da bai tu", "大白兔")
        ok(mid == "da bai tu da bai tu" and box.input_value() == "大白兔", "改名字的框里用拼音打：一样不被截")
        box.fill("大白兔"); box.press("Enter"); pa.wait_for_timeout(400)
        ok(labels(pa) == ["未命名", "蓝的", "红的那张", "大白兔", "小老鼠", "吃东西鼠", "坏猫"] and box.count() == 0 and using(pa) == ["蓝的"] and rows(pa)[3]["src"] == bunny,
           "打“大白兔”按回车：名字换了，位置、图都没动；打勾的还是原来那张")
        pen("大白兔"); box.fill(""); box.press("Enter"); pa.wait_for_timeout(300)
        ok(labels(pa)[3] == "大白兔", "清空了按回车：不改，还是原来的名字")
        pen("大白兔"); box.fill("一二三四五六七八九十甲乙丙丁")
        ok(box.input_value() == "一二三四五六七八九十甲乙", "改名字也是最多十二个字")
        box.press("Escape"); pa.wait_for_timeout(300)
        ok(labels(pa)[3] == "大白兔" and box.count() == 0, "按 Esc：不改了")
        pen("大白兔"); box.fill("点别处"); pa.get_by_text("头像册", exact=True).click(); pa.wait_for_timeout(400)
        ok(labels(pa)[3] == "点别处" and box.count() == 0, "打了字点别处：也算改好")
        pen("点别处"); box.fill("点对勾"); pa.locator(".kfs-avbook-renamed").click(); pa.wait_for_timeout(400)
        ok(labels(pa)[3] == "点对勾" and box.count() == 0, "点对勾：改好")
        pen("点对勾"); box.fill("关了也算"); back(pa); open_book(pa)
        ok(labels(pa)[3] == "关了也算", "改到一半直接把册子关了：写了的也算数")
        pen("关了也算"); box.fill("白兔"); box.press("Enter"); pa.wait_for_timeout(300)
        pen("蓝的"); box.fill("蓝蓝的"); box.press("Enter"); pa.wait_for_timeout(300)
        ok(using(pa) == ["蓝蓝的"], "正在用的那一行改名字：勾还在")
        pen("蓝蓝的"); box.fill("蓝的"); box.press("Enter"); pa.wait_for_timeout(300)
        pen("吃东西鼠"); box.fill("  吃货   鼠 "); box.press("Enter"); pa.wait_for_timeout(400)
        ok(labels(pa) == ["未命名", "蓝的", "红的那张", "白兔", "小老鼠", "吃货 鼠", "坏猫"], "名字照样收拾：头尾的空去掉、中间连着的空收成一个")
        pen("吃货 鼠"); box.fill("吃货鼠"); box.press("Enter"); pa.wait_for_timeout(400)

        # ================= 左滑：露出垃圾桶 =================
        shut = one(pa, "坏猫")
        finger(pa, "坏猫", -20)
        ok(one(pa, "坏猫")["card"] == shut["card"] and not one(pa, "坏猫")["open"] and one(pa, "坏猫")["binShown"] == 0, "往左划一点点就松手：弹回去，垃圾桶没出来")
        finger(pa, "坏猫", -40, lift=False)
        pa.wait_for_timeout(120)
        mid = one(pa, "坏猫")
        ok(mid["card"][0] == shut["card"][0] and 28 <= shut["card"][2] - mid["card"][2] <= 40 and 0 < mid["binShown"] < 1, f"手指往左拖着：卡片右边跟着手指收窄，左边不动；垃圾桶一点点冒出来（窄了 {shut['card'][2] - mid['card'][2]}，{mid['binShown']:.2f}）")
        lift(pa)
        o = one(pa, "坏猫")
        ok(o["open"] and o["card"][0] == shut["card"][0] and shut["card"][2] - o["card"][2] == 56 and o["binShown"] == 1 and o["binIcon"] and o["binText"] == "" and o["bin"][2] == 44 and o["bin"][0] >= o["card"][0] + o["card"][2] + 8
           and o["bin"][0] + o["bin"][2] == shut["card"][0] + shut["card"][2] and labels(pa)[-1] == "坏猫" and using(pa) == ["蓝的"],
           f"划过一半松手：停在开着，卡片右边让开 56，垃圾桶整个露在让出来的那一截里；小图和名字都还看得见，头像没换（{o['card']}，{o['bin']}）")
        shot(pa, "avbook_6_swiped.png")
        pa.get_by_text("头像册", exact=True).click(); pa.wait_for_timeout(450)
        ok(one(pa, "坏猫")["card"] == shut["card"] and not one(pa, "坏猫")["open"] and one(pa, "坏猫")["binShown"] == 0, "点别处：收回去")
        finger(pa, "坏猫", -90)
        ok(one(pa, "坏猫")["open"] and shut["card"][2] - one(pa, "坏猫")["card"][2] == 56, "划得再远也只让开那么多")
        finger(pa, "坏猫", 70)
        ok(not one(pa, "坏猫")["open"] and one(pa, "坏猫")["card"] == shut["card"], "往右划回去：收回去")
        finger(pa, "坏猫", -90); finger(pa, "小老鼠", -90)
        ok([x["label"] for x in rows(pa) if x["open"]] == ["小老鼠"], "一行开着的时候去划另一行：原来那行收回去，只开着一行")
        use(pa, "白兔")
        ok(not any(x["open"] for x in rows(pa)) and using(pa) == ["白兔"], "开着的时候点别的行的方格：收回去，那一格也勾上了")
        use(pa, "蓝的")
        top = pa.evaluate("document.querySelector('.kfs-sheet-box').scrollTop")
        finger(pa, "白兔", -6, -80)
        ok(not any(x["open"] for x in rows(pa)), "竖着划（滚册子）：不会划开")
        pa.evaluate("(t) => { document.querySelector('.kfs-sheet-box').scrollTop = t; }", top); pa.wait_for_timeout(200)
        cm = one(pa, "坏猫")["card"]
        pa.mouse.move(cm[0] + cm[2] * 0.6, cm[1] + cm[3] / 2); pa.mouse.down(); pa.mouse.move(cm[0] + cm[2] * 0.6 - 90, cm[1] + cm[3] / 2, steps=6); pa.mouse.up(); pa.wait_for_timeout(450)
        ok(one(pa, "坏猫")["open"], "用鼠标按着往左拖也划得开")
        pa.get_by_text("头像册", exact=True).click(); pa.wait_for_timeout(450)

        # ================= 删：点垃圾桶，再点一次才删 =================
        finger(pa, "坏猫", -90)
        row(pa, "坏猫").locator(".kfs-avbook-bin").click(); pa.wait_for_timeout(350)
        a = one(pa, "坏猫")
        ok(a["binText"] == "再点一次删掉" and not a["binIcon"] and a["open"] and len(labels(pa)) == 7 and a["bin"][0] >= a["card"][0] + a["card"][2] + 8 and a["bin"][2] > 90,
           f"点一下垃圾桶：变成“再点一次删掉”，还没删；卡片再让开一点，字放得下（{a['bin']}）")
        shot(pa, "avbook_6_armed.png")
        pa.wait_for_timeout(3300)
        a = one(pa, "坏猫")
        ok(a["binText"] == "" and a["binIcon"] and a["open"] and len(labels(pa)) == 7, "三秒没再点：变回垃圾桶（还开着），没删")
        row(pa, "坏猫").locator(".kfs-avbook-bin").click(); pa.wait_for_timeout(250)
        row(pa, "坏猫").locator(".kfs-avbook-bin").click(); pa.wait_for_timeout(450)
        ok(labels(pa) == ["未命名", "蓝的", "红的那张", "白兔", "小老鼠", "吃货鼠"] and not any(x["open"] for x in rows(pa)), "再点一次：删掉了，原来那四张也删得掉")
        # 删正在用的那一张：头像不变
        drop(pa, "蓝的")
        ok("蓝的" not in labels(pa) and not using(pa) and pa.locator(".kfs-avbook-keep").count() == 1, "删掉正在用的那一张：册子里没有它了，“把现在用的存进来”又出来了")
        back(pa)
        ok(mine(pa) == blue, "头像本身没变，还是蓝的那张")
        close_panel(pa)

        # ================= 云端：都是乱码 =================
        time.sleep(3)
        cloud = mock("/__debug/rows")
        dump = json.dumps(cloud, ensure_ascii=False)
        ok("红的那张" not in dump and "avbook" not in dump and "data:image" not in dump and "未命名" not in dump and "吃货鼠" not in dump, "云端看不到册子里的名字（改过的也一样）、图，连记录名都看不出是什么")

        # ================= 重新打开：记着 =================
        pa.reload()
        kite(pa); pa.wait_for_timeout(800)
        open_panel(pa); open_book(pa)
        r = rows(pa)
        ok([x["label"] for x in r] == ["未命名", "红的那张", "白兔", "小老鼠", "吃货鼠"] and [x["kind"] for x in r][:2] == ["pic", "pic"] and all(x["ok"] for x in r),
           "划掉重开：册子还是那五行，改的名字记着，相册选的那两张图也在")
        back(pa); close_panel(pa)

        # ================= 另一台设备：同一份 =================
        ctx2 = browser.new_context(**IPHONE)
        ctx2.add_init_script(STUB)
        pb = ctx2.new_page()
        pb.on("pageerror", lambda e: errors.append(str(e)))
        second_device(pb); pb.wait_for_timeout(1500)
        open_panel(pb); open_book(pb)
        r = rows(pb)
        ok([x["label"] for x in r] == ["未命名", "红的那张", "白兔", "小老鼠", "吃货鼠"] and all(x["ok"] for x in r) and [x["kind"] for x in r][:2] == ["pic", "pic"],
           f"另一台设备登进来：看到的是同一份册子，图也到了（{[x['label'] for x in r]}）")
        # 那一台上删一张、添一张、改一个名字；这一台开着册子，自己跟着变
        open_panel(pa); open_book(pa)
        row(pa, "小老鼠").locator(".kfs-avbook-thumb").click(); pa.wait_for_timeout(400)
        drop(pb, "小老鼠")
        pick(pb, lambda: pb.locator(".kfs-avbook-add").click(), BLUE)
        pb.locator(".kfs-avbook-name").fill("那台添的"); pb.locator(".kfs-avbook-save").click(); pb.wait_for_timeout(500)
        row(pb, "红的那张").locator(".kfs-avbook-pen").click(); pb.wait_for_timeout(300)
        pb.locator(".kfs-avbook-rename").fill("那台改的"); pb.locator(".kfs-avbook-rename").press("Enter"); pb.wait_for_timeout(500)
        want = ["那台添的", "未命名", "那台改的", "白兔", "吃货鼠"]
        ok(labels(pb) == want, "那一台上删一张、添一张、改一个名字")
        for _ in range(60):
            r = rows(pa)
            if [x["label"] for x in r] == want and all(x["ok"] for x in r): break
            pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pa.wait_for_timeout(500)
        r = rows(pa)
        ok([x["label"] for x in r] == want and all(x["ok"] for x in r) and r[0]["kind"] == "pic" and not any(x["big"] for x in r), f"这一台开着册子：自己跟着变成一样的，新添的那张图也到了；放大着的那一行被删了，大图跟着没了（{[x['label'] for x in r]}）")
        shot(pa, "avbook_7_synced.png")

        # ================= 删光了：空的，不会自己长回来 =================
        for name in list(labels(pa)):
            drop(pa, name)
        ok(labels(pa) == [] and pa.locator(".kfs-avbook-empty").inner_text() == "册子里还空着", "全删光：写着“册子里还空着”")
        shot(pa, "avbook_8_empty.png")
        pa.reload()
        kite(pa); pa.wait_for_timeout(800)
        open_panel(pa); open_book(pa)
        ok(labels(pa) == [] and pa.locator(".kfs-avbook-keep").count() == 1, "重开还是空的，原来那四张不会自己长回来；眼下用的那张还能存进来")
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
sys.exit(1 if count["failed"] or errors else 0)
