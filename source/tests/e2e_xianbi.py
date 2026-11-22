# 闲笔集那一页怎么走（见 src/panels/DiaryPage.jsx、diaryDeck.js）的端到端测试。真的浏览器、假 Supabase，一台“手机”，手指是真的触摸事件：
#   进来是月历那一页：没有顶栏，右上角一块日晷，年月竖着写在左边，今天选中着，最底下一行小字；
#   左右划换月：年月原地不动、里面的数字跟着换，格子跟着手指走，晷盘跟着转；划到头拉不动、松手回来；
#   在晷盘上绕着圈拨也换月（逆时针拨往后、顺时针拨往前），点晷盘外圈的地支跳到那个月；
#   换到别的月不选哪一天，这时候往上划翻不过去；点一天选中，往上划翻到那一天的那一页；划得不够远松手回来；
#   那一天的那一页在最顶上往下拉回月历；回到本月又选中今天；选中的那一天再点一下也翻过去；左上角返回回侧栏。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080，用 tests/serve.py 起），再：python3 tests/e2e_xianbi.py
import os, re, time
from datetime import date
from playwright.sync_api import sync_playwright
from mailkit import *
from diarykit import DIARY_PAGE, DIARY_TITLE

errors = []
SHOTS = os.environ.get("KFS_SHOTS", "")
W, H = IPHONE["viewport"]["width"], IPHONE["viewport"]["height"]
SEL = "(() => { const b = document.querySelector('.kfs-diary-mon:not([inert]) button[aria-pressed=\"true\"]'); return b ? b.dataset.day : null; })()"
PEEK = "document.querySelector('.kfs-diary-peek').textContent"
# 年月那一块在哪儿、月份那一格前一层淡到几成、眼前那个月的格子在哪儿、格子那一块在哪儿、晷盘转了多少度、晷盘的圆心和半径
WHERE = """(() => { const t = document.querySelector('.kfs-diary-title').getBoundingClientRect();
  const lay = document.querySelector('.kfs-diary-title > div:nth-child(2) > div').children[0];
  const mons = [...document.querySelectorAll('.kfs-diary-mon')].filter((e) => e.style.visibility !== 'hidden').map((e) => Math.round(e.firstElementChild.getBoundingClientRect().left));
  const g = document.querySelector('.kfs-diary-mon:not([inert])').getBoundingClientRect();
  const d = document.querySelector('.kfs-dial').getBoundingClientRect();
  const rot = parseFloat((document.querySelector('.kfs-dial > g').getAttribute('transform') || 'rotate(0)').slice(7));
  return { titleLeft: Math.round(t.left), titleTop: Math.round(t.top), fade: parseFloat(getComputedStyle(lay).opacity), mons,
    gx: g.left + g.width / 2, gy: g.top + Math.min(g.height, 200) * 0.3, gb: g.bottom, rot, cx: d.left + d.width / 2, cy: d.top + d.height / 2, r: d.width / 2 }; })()"""
# 晷盘上亮着的是哪个地支
CUR_BRANCH = "(() => { const b = document.querySelector('.kfs-dial-b[data-on=\"1\"]'); return b ? +b.dataset.b : null; })()"
BR = "子丑寅卯辰巳午未申酉戌亥"
import math
def at_angle(w, r_frac, deg):
    t = math.radians(deg)
    return w["cx"] + w["r"] * r_frac * math.sin(t), w["cy"] - w["r"] * r_frac * math.cos(t)

def touch(cdp, kind, x=None, y=None):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [] if x is None else [{"x": x, "y": y}]})
# 一根手指从这儿拖到那儿（steps 步，每步一帧）；hold：到了以后先停一会儿再抬（慢慢拖过去，不是甩）
def drag(cdp, x0, y0, x1, y1, steps=12, hold=0.0, lift=True):
    touch(cdp, "touchStart", x0, y0)
    for i in range(1, steps + 1):
        touch(cdp, "touchMove", x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
        time.sleep(0.016)
    if hold:
        time.sleep(hold)
    if lift:
        touch(cdp, "touchEnd")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    A = browser.new_context(**IPHONE)
    A.add_init_script(STUB)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)
        cdp = A.new_cdp_session(pa)
        td = date.today()
        today = td.isoformat()
        this_month = f"{td.year}年{td.month}月"
        # 月历从 2026 年 10 月起：今天在那以后才有“上个月”可划
        many = (td.year, td.month) > (2026, 10)
        py, pm = (td.year, td.month - 1) if td.month > 1 else (td.year - 1, 12)
        prev_month = f"{py}年{pm}月"
        prev_day = f"{py}-{pm:02d}-15"

        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        pa.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
        pa.locator(".kfs-nanya-row", has_text="闲笔集").click()
        pa.locator(".kfs-diary").wait_for(timeout=10000); time.sleep(0.8)

        # ================= 进来：月历那一页 =================
        w0 = pa.evaluate(WHERE)
        ok(pa.evaluate(DIARY_PAGE) == "0" and pa.evaluate(DIARY_TITLE) == this_month and pa.evaluate(SEL) == today,
           f"进来停在月历那一页：{this_month}，今天选中着")
        ok(w0["titleLeft"] < W * 0.2 and w0["cx"] > W * 0.6 and w0["cy"] < H * 0.4 and w0["cx"] + w0["r"] > W and len(w0["mons"]) >= 1 and f"{td.month}月{td.day}日" in pa.evaluate(PEEK),
           f"年月在左边，晷盘在右上、出了屏幕一截；最底下一行小字写着今天（{pa.evaluate(PEEK)}）")
        ok(pa.evaluate(CUR_BRANCH) == (td.month + 1) % 12 and abs(((w0["rot"] + (td.month + 1) % 12 * 30 - 232) + 180) % 360 - 180) < 0.5,
           f"晷盘：这个月的地支（{BR[(td.month + 1) % 12]}）亮着，转到指针底下（转了 {w0['rot']:.1f} 度）")
        ok(w0["gb"] < H - 40, f"格子整块在最底下那行小字上面（格子底边 {w0['gb']:.0f}）")
        if SHOTS: pa.screenshot(path=f"{SHOTS}/xianbi-1-cal.png")

        if many:
            # ================= 左右划换月 =================
            # 拖到一半（不抬手）：年月那一行没动，月份的数字滚到一半，格子跟着手指走了
            gx, gy = w0["gx"], w0["gy"]
            drag(cdp, 80, gy, 80 + 170, gy + 2, steps=10, lift=False)
            mid = pa.evaluate(WHERE)
            frac = 1 - mid["fade"]
            ok(mid["titleLeft"] == w0["titleLeft"] and mid["titleTop"] == w0["titleTop"] and 0.2 < frac < 0.8 and len(mid["mons"]) == 2 and max(mid["mons"]) > w0["mons"][-1] + 100 and 6 < mid["rot"] - w0["rot"] < 24,
               f"划到一半：年月原地不动，月份的数字换了 {frac:.2f}，格子跟着手指走（{mid['mons']}），晷盘跟着转了 {mid['rot'] - w0['rot']:.1f} 度")
            if SHOTS: pa.screenshot(path=f"{SHOTS}/xianbi-2-mid.png")
            touch(cdp, "touchEnd"); time.sleep(1.0)
            ok(pa.evaluate(DIARY_TITLE) == prev_month, f"划够了松手：换到上个月（{pa.evaluate(DIARY_TITLE)}）")
            w1 = pa.evaluate(WHERE)
            ok(w1["fade"] > 0.99 and w1["titleTop"] == w0["titleTop"] and abs(w1["rot"] - w0["rot"] - 30) < 0.5 and pa.evaluate(CUR_BRANCH) == (pm + 1) % 12,
               f"停住：月份的数字换好了，晷盘正好转了一格（{w1['rot'] - w0['rot']:.1f} 度），亮的是{BR[(pm + 1) % 12]}")
            ok(pa.evaluate(SEL) is None and pa.evaluate(PEEK) == "", "换到别的月：不选哪一天，最底下那行小字收了")
            # 没选中：往上划翻不过去
            drag(cdp, 200, gy + 40, 200, 200); time.sleep(1.0)
            ok(pa.evaluate(DIARY_PAGE) == "0" and pa.evaluate("document.querySelector('.kfs-diary-pages').style.transform").startswith("translate3d(0px, 0"), "没选中哪一天：往上划翻不过去，松手回来")
            # 划一点点（不到两成）、慢慢的：不换月
            drag(cdp, 300, gy, 300 - 50, gy, steps=10, hold=0.25); time.sleep(0.9)
            ok(pa.evaluate(DIARY_TITLE) == prev_month, "慢慢划一点点就松手：不换月，回到原处")
            # 点一天：选中
            box = pa.locator(f".kfs-diary-mon:not([inert]) button[data-day='{prev_day}']").bounding_box()
            pa.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); time.sleep(0.4)
            ok(pa.evaluate(SEL) == prev_day and pa.evaluate(DIARY_PAGE) == "0" and f"{pm}月15日" in pa.evaluate(PEEK), f"点一天：选中，还在月历那一页，最底下写着那一天（{pa.evaluate(PEEK)}）")
            # 往上划一点点、慢慢的：不翻
            drag(cdp, 200, gy + 40, 200, gy - 20, steps=10, hold=0.25); time.sleep(0.9)
            ok(pa.evaluate(DIARY_PAGE) == "0", "选中了，往上慢慢划一点点就松手：不翻，回来")
            # 往上划：翻到那一天
            drag(cdp, 200, gy + 60, 200, 200); time.sleep(1.1)
            head = pa.evaluate("document.querySelector('.kfs-diary-day').innerText")
            ok(pa.evaluate(DIARY_PAGE) == "1" and f"{pm}月15日" in head and "卿卿写的" in head, "往上划：翻到那一天的那一页")
            if SHOTS: pa.screenshot(path=f"{SHOTS}/xianbi-3-day.png")
            # 在最顶上往下拉一点点：不回；拉得够远：回月历
            drag(cdp, 200, 300, 200, 360, steps=10, hold=0.25); time.sleep(0.9)
            ok(pa.evaluate(DIARY_PAGE) == "1", "那一页最顶上往下慢慢拉一点点：不回，弹回去")
            drag(cdp, 200, 300, 200, 660); time.sleep(1.1)
            ok(pa.evaluate(DIARY_PAGE) == "0" and pa.evaluate(DIARY_TITLE) == prev_month and pa.evaluate(SEL) == prev_day, "往下拉：回月历，还是那个月、那一天选中着")
            # 再往前一个月：有就换，没有（到头了）就拉不动
            first = (py, pm) == (2026, 10)
            drag(cdp, 80, gy, 330, gy + 2); time.sleep(1.1)
            if first:
                ok(pa.evaluate(DIARY_TITLE) == prev_month, "划到头了（月历从 2026 年 10 月起）：拉不动，松手回来")
            else:
                ok(pa.evaluate(DIARY_TITLE) != prev_month, "再往右划：再往前一个月")
                drag(cdp, 330, gy, 80, gy + 2); time.sleep(1.1)
            # 往左划回本月：又选中今天
            drag(cdp, 330, gy, 80, gy + 2); time.sleep(1.1)
            ok(pa.evaluate(DIARY_TITLE) == this_month and pa.evaluate(SEL) == today, "往左划回本月：今天又选中了")
            # 本月是最后一个月：再往左拉不动
            drag(cdp, 330, gy, 80, gy + 2); time.sleep(1.1)
            ok(pa.evaluate(DIARY_TITLE) == this_month, "本月往后没有了：拉不动，松手回来")

            # ================= 晷盘上拨 =================
            w = pa.evaluate(WHERE)
            # 落在晷盘上、往下拖（绕着圆心顺时针）：盘面跟着转，换到前一个月；年月跟着换
            sx, sy = at_angle(w, 0.8, 232 - 20)
            ex, ey = at_angle(w, 0.8, 232 + 25)
            touch(cdp, "touchStart", sx, sy)
            for i in range(1, 13):
                a = 232 - 20 + 45 * i / 12
                x, y = at_angle(w, 0.8, a); touch(cdp, "touchMove", x, y); time.sleep(0.016)
            touch(cdp, "touchEnd"); time.sleep(1.1)
            ok(pa.evaluate(DIARY_TITLE) == prev_month and pa.evaluate(CUR_BRANCH) == (pm + 1) % 12 and pa.evaluate(DIARY_PAGE) == "0",
               f"在晷盘上顺时针拨一格多：换到上个月（{pa.evaluate(DIARY_TITLE)}），还在月历那一页")
            # 逆时针拨回来
            touch(cdp, "touchStart", ex, ey)
            for i in range(1, 13):
                a = 232 + 25 - 45 * i / 12
                x, y = at_angle(w, 0.8, a); touch(cdp, "touchMove", x, y); time.sleep(0.016)
            touch(cdp, "touchEnd"); time.sleep(1.1)
            ok(pa.evaluate(DIARY_TITLE) == this_month and pa.evaluate(SEL) == today, "逆时针拨回来：回本月，今天又选中了")
            # 往后拨过头：拉不动，松手回来
            touch(cdp, "touchStart", ex, ey)
            for i in range(1, 13):
                a = 232 + 25 - 60 * i / 12
                x, y = at_angle(w, 0.8, a); touch(cdp, "touchMove", x, y); time.sleep(0.016)
            touch(cdp, "touchEnd"); time.sleep(1.1)
            ok(pa.evaluate(DIARY_TITLE) == this_month, "本月往后没有了：在晷盘上也拨不过去，松手回来")
            # 点外圈上一个月的地支：跳过去
            w = pa.evaluate(WHERE)
            tx, ty = at_angle(w, 0.86, 232 - 30)
            pa.touchscreen.tap(tx, ty); time.sleep(1.1)
            ok(pa.evaluate(DIARY_TITLE) == prev_month, f"点晷盘外圈上个月的地支（{BR[(pm + 1) % 12]}）：跳到上个月")
            tx, ty = at_angle(w, 0.86, 232 + 60)
            pa.touchscreen.tap(tx, ty); time.sleep(1.1)
            ok(pa.evaluate(DIARY_TITLE) == prev_month, "点一个还没到的月份的地支：不动")
            tx, ty = at_angle(pa.evaluate(WHERE), 0.86, 232 + 30)
            pa.touchscreen.tap(tx, ty); time.sleep(1.1)
            ok(pa.evaluate(DIARY_TITLE) == this_month and pa.evaluate(SEL) == today, "点这个月的地支：回本月")

        # ================= 选中的那一天再点一下：翻过去 =================
        box = pa.locator(f".kfs-diary-mon:not([inert]) button[data-day='{today}']").bounding_box()
        pa.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); time.sleep(1.1)
        ok(pa.evaluate(DIARY_PAGE) == "1" and f"{td.month}月{td.day}日" in pa.evaluate("document.querySelector('.kfs-diary-day').innerText"), "今天选中着，再点一下：翻到今天那一页")
        # 那一页里的东西照常点得动；写到一半往下拉不走（手指落在输入框里的不算拉）
        pa.get_by_role("button", name="写几句").tap(); time.sleep(0.4)
        pa.get_by_placeholder("这天发生了什么").fill("测试写的一句")
        pa.get_by_role("button", name="保存").tap(); time.sleep(0.6)
        ok("测试写的一句" in pa.evaluate("document.querySelector('.kfs-diary-day').innerText"), "那一页里照常写、照常存")
        drag(cdp, 200, 300, 200, 660); time.sleep(1.1)
        ok(pa.evaluate(DIARY_PAGE) == "0" and pa.locator(f".kfs-diary-mon:not([inert]) button[data-day='{today}'] span").count() >= 3, "往下拉回月历：今天的格子上多了她写过的那个小点")

        # ================= 返回 =================
        pa.get_by_role("button", name="返回").first.tap(); time.sleep(0.8)
        ok(pa.locator(".kfs-diary").count() == 0, "左上角返回：回侧栏")
    finally:
        try:
            errs = [e for e in errors if "ResizeObserver" not in e]
            ok(not errs, f"页面没有报错（{errs[:3]}）")
        except Exception:
            pass
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] else 0)
