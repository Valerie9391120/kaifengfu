# 头像册（见 src/avatarBook.js、src/panels/AvatarBook.jsx）：账户面板头像那一栏只剩“从相册选”和“头像册”两颗；
# 头像册点开是存好的头像，一行一张图一个名字，点哪行换哪张；能添（相册选图起名字、把眼下用的存进来）、能删；跟着云端走。
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
# 册子里眼下什么样：一行一行的名字、哪一行在用、有没有图
DIGEST = "const digest = (u) => (u.length > 80 ? u.slice(0, 16) + ':' + u.length + ':' + u.slice(-24) : u);"
ROWS = """() => { %s return Array.from(document.querySelectorAll('.kfs-avbook-row')).map((r) => { const img = r.querySelector('img');
  return { label: r.querySelector('.kfs-avbook-use').getAttribute('aria-label'), using: r.hasAttribute('data-using'), said: !!r.querySelector('.kfs-avbook-using'),
    kind: r.getAttribute('data-kind'), ok: !!img && img.naturalWidth > 0, src: img ? digest(img.getAttribute('src')) : '' }; }); }""" % DIGEST
def rows(page): return page.evaluate(ROWS)
def labels(page): return [r["label"] for r in rows(page)]
def using(page): return [r["label"] for r in rows(page) if r["using"]]
# 账户面板最上面那个大头像眼下是什么：默认的字、表情包、相册选的图
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
def row(page, label): return page.locator(".kfs-avbook-row").filter(has=page.get_by_role("button", name=label, exact=True))

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
        shot(pa, "avbook_2_list.png")

        # ================= 点一行就换 =================
        pa.get_by_role("button", name="白兔", exact=True).click(); pa.wait_for_timeout(400)
        bunny = rows(pa)[0]["src"]
        ok(using(pa) == ["白兔"] and [x["label"] for x in rows(pa) if x["said"]] == ["白兔"] and pa.locator(".kfs-avbook").count() == 1 and pa.locator(".kfs-avbook-keep").count() == 0,
           "点“白兔”那一行：换上了，那一行后面写“在用”；册子不收起来；已经在册子里的不用再存")
        shot(pa, "avbook_3_using.png")
        back(pa)
        ok(pa.locator(".kfs-avbook").count() == 0 and pa.locator(".kfs-avbook-entry").count() == 1 and mine(pa) == bunny, "关掉册子回到“头像与设置”，上面的头像是白兔")
        close_panel(pa)
        ok(pa.get_by_text("你换了新头像").count() == 1, "聊到一半从册子里换的：对话里照旧留一行“你换了新头像”")

        # ================= 从相册选：直接换上，不进册子 =================
        open_panel(pa)
        pick(pa, lambda: pa.get_by_role("button", name="从相册选").click(), RED)
        red = mine(pa)
        ok(red.startswith("data:image/jpeg") and red != bunny, "“从相册选”：选了直接换上")
        open_book(pa)
        ok(labels(pa) == ["白兔", "小老鼠", "吃东西鼠", "坏猫"] and not using(pa) and pa.locator(".kfs-avbook-keep").inner_text() == "把现在用的存进来",
           "这一张没进册子（还是四行，没有哪行在用）；册子上面多一颗“把现在用的存进来”")

        shot(pa, "avbook_3b_keep.png")
        # ================= 把现在用的存进来 =================
        pa.locator(".kfs-avbook-keep").click(); pa.wait_for_timeout(300)
        ok(pa.locator(".kfs-avbook-new").count() == 1 and pa.locator(".kfs-avbook-new img").count() == 1 and pa.locator(".kfs-avbook-keep").count() == 0, "点它：出来一张小卡片，左边是那张图，右边起名字")
        fs = pa.evaluate("parseFloat(getComputedStyle(document.querySelector('.kfs-avbook-name')).fontSize)")
        ok(fs >= 16, f"起名字的框是十六像素的字，iPhone 上点进去不会放大（{fs}）")
        pa.locator(".kfs-avbook-name").fill("一二三四五六七八九十甲乙丙丁")
        ok(pa.locator(".kfs-avbook-name").input_value() == "一二三四五六七八九十甲乙", "名字最多十二个字，多的打不进去")
        pa.locator(".kfs-avbook-name").fill("  红的那张 ")
        shot(pa, "avbook_4_naming.png")
        pa.locator(".kfs-avbook-save").click(); pa.wait_for_timeout(500)
        r = rows(pa)
        ok([x["label"] for x in r] == ["红的那张", "白兔", "小老鼠", "吃东西鼠", "坏猫"] and r[0]["kind"] == "pic" and r[0]["ok"] and r[0]["src"] == red and using(pa) == ["红的那张"] and pa.locator(".kfs-avbook-new").count() == 0 and pa.locator(".kfs-avbook-keep").count() == 0,
           "点“存进去”：放在最上面，名字收拾过，后面写“在用”；卡片收起，那颗钮也没了")

        # ================= 添一张：从相册选、起名字；不换头像 =================
        pick(pa, lambda: pa.locator(".kfs-avbook-add").click(), BLUE)
        ok(pa.locator(".kfs-avbook-new").count() == 1 and len(labels(pa)) == 5, "“添一张”选了图：先出来起名字的卡片，还没进单子")
        pa.get_by_role("button", name="不存了").click(); pa.wait_for_timeout(300)
        ok(pa.locator(".kfs-avbook-new").count() == 0 and len(labels(pa)) == 5, "点“不存了”：卡片收起，单子没变")
        pick(pa, lambda: pa.locator(".kfs-avbook-add").click(), BLUE)
        pa.locator(".kfs-avbook-name").fill("蓝的"); pa.locator(".kfs-avbook-name").press("Enter"); pa.wait_for_timeout(500)
        ok(labels(pa) == ["蓝的", "红的那张", "白兔", "小老鼠", "吃东西鼠", "坏猫"] and using(pa) == ["红的那张"], "再选一次、起名字按回车：存进去了，放在最上面；头像没换，在用的还是红的那张")
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

        # ================= 点相册选的那一行也能换 =================
        pa.get_by_role("button", name="蓝的", exact=True).click(); pa.wait_for_timeout(400)
        ok(using(pa) == ["蓝的"], "点“蓝的”那一行：换上了")
        back(pa)
        blue = mine(pa)
        ok(blue.startswith("data:image/jpeg") and blue != red, "回到“头像与设置”：头像是蓝的那张")
        open_book(pa)

        # ================= 删：点两次才删 =================
        row(pa, "坏猫").locator(".kfs-avbook-drop").click(); pa.wait_for_timeout(250)
        ok(row(pa, "坏猫").locator(".kfs-avbook-drop").inner_text() == "再点一次删掉" and len(labels(pa)) == 7, "点一下“坏猫”那行的小桶：变成“再点一次删掉”，还没删")
        shot(pa, "avbook_6_armed.png")
        pa.wait_for_timeout(3300)
        ok(row(pa, "坏猫").locator(".kfs-avbook-drop").inner_text() == "" and len(labels(pa)) == 7, "三秒没再点：收回成小桶，没删")
        row(pa, "坏猫").locator(".kfs-avbook-drop").click(); pa.wait_for_timeout(250)
        row(pa, "坏猫").locator(".kfs-avbook-drop").click(); pa.wait_for_timeout(400)
        ok(labels(pa) == ["未命名", "蓝的", "红的那张", "白兔", "小老鼠", "吃东西鼠"], "再点一次：删掉了，原来那四张也删得掉")
        # 删正在用的那一张：头像不变
        row(pa, "蓝的").locator(".kfs-avbook-drop").click(); pa.wait_for_timeout(250)
        row(pa, "蓝的").locator(".kfs-avbook-drop").click(); pa.wait_for_timeout(400)
        ok("蓝的" not in labels(pa) and not using(pa) and pa.locator(".kfs-avbook-keep").count() == 1, "删掉正在用的那一张：册子里没有它了，“把现在用的存进来”又出来了")
        back(pa)
        ok(mine(pa) == blue, "头像本身没变，还是蓝的那张")
        close_panel(pa)

        # ================= 云端：都是乱码 =================
        time.sleep(3)
        cloud = mock("/__debug/rows")
        dump = json.dumps(cloud, ensure_ascii=False)
        ok("红的那张" not in dump and "avbook" not in dump and "data:image" not in dump and "未命名" not in dump, "云端看不到册子里的名字、图，连记录名都看不出是什么")

        # ================= 重新打开：记着 =================
        pa.reload()
        kite(pa); pa.wait_for_timeout(800)
        open_panel(pa); open_book(pa)
        r = rows(pa)
        ok([x["label"] for x in r] == ["未命名", "红的那张", "白兔", "小老鼠", "吃东西鼠"] and [x["kind"] for x in r][:2] == ["pic", "pic"] and all(x["ok"] for x in r),
           "划掉重开：册子还是那五行，相册选的那两张图也在")
        back(pa); close_panel(pa)

        # ================= 另一台设备：同一份 =================
        ctx2 = browser.new_context(**IPHONE)
        ctx2.add_init_script(STUB)
        pb = ctx2.new_page()
        pb.on("pageerror", lambda e: errors.append(str(e)))
        second_device(pb); pb.wait_for_timeout(1500)
        open_panel(pb); open_book(pb)
        r = rows(pb)
        ok([x["label"] for x in r] == ["未命名", "红的那张", "白兔", "小老鼠", "吃东西鼠"] and all(x["ok"] for x in r) and [x["kind"] for x in r][:2] == ["pic", "pic"],
           f"另一台设备登进来：看到的是同一份册子，图也到了（{[x['label'] for x in r]}）")
        # 那一台上删一张、添一张；这一台开着册子，自己跟着变
        open_panel(pa); open_book(pa)
        row(pb, "小老鼠").locator(".kfs-avbook-drop").click(); pb.wait_for_timeout(250)
        row(pb, "小老鼠").locator(".kfs-avbook-drop").click(); pb.wait_for_timeout(400)
        pick(pb, lambda: pb.locator(".kfs-avbook-add").click(), BLUE)
        pb.locator(".kfs-avbook-name").fill("那台添的"); pb.locator(".kfs-avbook-save").click(); pb.wait_for_timeout(500)
        want = ["那台添的", "未命名", "红的那张", "白兔", "吃东西鼠"]
        ok(labels(pb) == want, "那一台上删一张、添一张")
        for _ in range(60):
            r = rows(pa)
            if [x["label"] for x in r] == want and all(x["ok"] for x in r): break
            pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pa.wait_for_timeout(500)
        r = rows(pa)
        ok([x["label"] for x in r] == want and all(x["ok"] for x in r) and r[0]["kind"] == "pic", f"这一台开着册子：自己跟着变成一样的，新添的那张图也到了（{[x['label'] for x in r]}）")
        shot(pa, "avbook_7_synced.png")

        # ================= 删光了：空的，不会自己长回来 =================
        for name in list(labels(pa)):
            row(pa, name).first.locator(".kfs-avbook-drop").click(); pa.wait_for_timeout(200)
            row(pa, name).first.locator(".kfs-avbook-drop").click(); pa.wait_for_timeout(300)
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
