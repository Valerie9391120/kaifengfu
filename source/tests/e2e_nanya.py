# 南衙：侧栏第四个格子。原来写“日记本”、点了直接进日记；2026 年 10 月 11 日卿卿把它改成了小功能汇总：
#   格子叫“南衙”，图标是恩师画的牡丹（比手绘的那一套大一号，跟着主题色走），底下那行小字照旧是今天的日记写了没；
#   点了从底下冒出一张菜单（和万岁殿、MCP、API 那几张一样）：闲笔集（就是日记，改了名）、藏音匣、网易云；
#   后两样还没盖：淡一档、写“营造中”，点了只冒一句“还在营造”，别的不动；
#   点闲笔集：菜单收起，日记那一页滑进来，顶上写“闲笔集”；按返回回到侧栏，不回菜单；
#   让那边写日记时寄去的话里还叫“日记本”，没跟着改。
# 真的浏览器、假 Supabase、假的 Anthropic。账号和话都是编的。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_nanya.py
import io, json, re, time
from PIL import Image
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []

# 四个格子：各写着什么、图标多大
TILES = """() => [...document.querySelectorAll('.kfs-side-scroll .grid > button')].map((b) => {
  const s = b.firstElementChild.querySelector('svg').getBoundingClientRect(), t = b.lastElementChild.children;
  return { label: t[0].textContent, sub: t[1].textContent, icon: [s.width, s.height] }; })"""
# 南衙那一格的牡丹：多大、在小白块里摆得正不正、什么颜色
PEONY = """() => { const chip = document.querySelectorAll('.kfs-side-scroll .grid > button')[3].firstElementChild, svg = chip.querySelector('svg'), path = svg.querySelector('path');
  const r = path.getBoundingClientRect(), c = chip.getBoundingClientRect(), s = svg.getBoundingClientRect(), cs = getComputedStyle(path);
  return { shapes: svg.querySelectorAll('*').length, size: [r.width, r.height], off: [r.left - c.left, c.right - r.right, r.top - c.top, c.bottom - r.bottom],
    fill: cs.fill, stroke: cs.stroke, color: getComputedStyle(chip).color, box: [s.x, s.y, s.width, s.height] }; }"""
# 菜单里的每一行
ROWS = """() => [...document.querySelectorAll('.kfs-nanya .kfs-nanya-row')].map((b) => { const t = b.children[1].children;
  return { name: t[0].textContent, sub: t[1].textContent, soon: b.dataset.soon || '', svgs: b.querySelectorAll('svg').length, dim: getComputedStyle(t[0]).opacity, chip: getComputedStyle(b.children[0]).opacity }; })"""
SHEET = """() => { const b = document.querySelector('.kfs-sheet-box'); if (!b) return null; const r = b.getBoundingClientRect();
  return { title: b.children[1].firstElementChild.textContent, left: r.left, right: innerWidth - r.right, bottom: innerHeight - r.bottom }; }"""
# 格子点不点得到（上面没盖着东西）
TILE_ON_TOP = """() => { const b = document.querySelectorAll('.kfs-side-scroll .grid > button')[3], r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (top === b || b.contains(top)); }"""
HAS = "(t) => document.body.innerText.includes(t)"

def tile_sub(page): return page.evaluate(TILES)[3]["sub"]
def rows(page): return page.evaluate(ROWS)
def has(page, text): return page.evaluate(HAS, text)
def wait_has(page, text, want=True, timeout=4.0):
    end = time.time() + timeout
    while time.time() < end:
        if has(page, text) == want:
            return True
        page.wait_for_timeout(100)
    return has(page, text) == want
# 点第四个格子，等菜单冒出来。照位置找它，不照上面的字找（字对不对另有一条看着）。菜单没出来回 False
# 点了以后等格子上那行小字换掉（存日记、他写日记都要一会儿）。没换也回当时写着的，由下一条去判
def sub_after(page, before, timeout=4.0):
    end = time.time() + timeout
    while time.time() < end:
        if tile_sub(page) != before:
            break
        page.wait_for_timeout(100)
    page.wait_for_timeout(200)
    return tile_sub(page)

def open_menu(page):
    page.locator(".kfs-side-scroll .grid > button").nth(3).click()
    try:
        page.locator(".kfs-nanya").wait_for(timeout=5000)
    except Exception:
        return False
    page.wait_for_timeout(500)
    return True

# 牡丹画出来的样子：把图标那一小块截下来，算“墨”有多少（照线的颜色折成整格数），再看花心底下那片花瓣里是不是空的
def ink_of(page, box):
    png = page.screenshot(clip={"x": box[0], "y": box[1], "width": box[2], "height": box[3]})
    im = Image.open(io.BytesIO(png)).convert("L")
    px = list(im.tobytes()); w, h = im.size   # 灰度图：一格一个数
    paper = sorted(px)[len(px) // 2]          # 大半是底色
    dark = min(px)                            # 线正中间是实打实的墨
    if paper - dark < 40:
        return {"ink": 0.0, "hole": False, "scale": w / box[2]}
    ink = sum(min(1.0, max(0.0, (paper - v) / (paper - dark))) for v in px)
    hole = im.getpixel((int(w * 0.50), int(h * 0.64)))   # 最底下正中那片花瓣的里面
    return {"ink": ink, "hole": paper - hole < 14, "scale": w / box[2]}


def run(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    first_time(pg)
    pg.get_by_role("button", name="打开侧栏").click(); pg.wait_for_timeout(700)

    # ---- 格子 ----
    tiles = pg.evaluate(TILES)
    ok([t["label"] for t in tiles] == ["万岁殿", "MCP", "API", "南衙"] and pg.get_by_text("日记本").count() == 0,
       f"侧栏四个格子：万岁殿、MCP、API、南衙，哪儿都不写“日记本”了（{[t['label'] for t in tiles]}）")
    ok(tiles[3]["sub"] == "今天还没写", f"南衙底下那行小字照旧是今天的日记写了没（{tiles[3]['sub']}）")
    pe = pg.evaluate(PEONY)
    ok(tiles[3]["icon"] == [25, 25],
       f"南衙的图标是 25 个点见方，比手绘的那一套（20）大一号（{tiles[3]['icon']}；四个方块的图标一起看的在 tests/e2e_tiles.py）")
    ok(pe["shapes"] == 1 and abs(pe["size"][0] - 23.57) < 0.3 and abs(pe["size"][1] - 19.47) < 0.3 and abs(pe["off"][0] - pe["off"][1]) < 0.6 and abs(pe["off"][2] - pe["off"][3]) < 0.6,
       f"牡丹摆在小白块正中，花本身 23.6×19.5 上下（{[round(v, 2) for v in pe['size']]}，四边 {[round(v, 2) for v in pe['off']]}）")
    ok(pe["fill"] == pe["color"] == "rgb(63, 106, 98)" and pe["stroke"] == "none",
       f"牡丹是一块填色的形状，颜色跟着主题走：青绿下是 {pe['fill']}，不描边（{pe['stroke']}）")
    seen = ink_of(pg, pe["box"])
    full = 731 * (seen["scale"] / 2) ** 2       # 两倍屏上该有 731 格上下的墨（三倍屏 1645）
    ok(0.86 * full < seen["ink"] < 1.14 * full and seen["hole"],
       f"牡丹真的画出来了：墨量 {seen['ink']:.0f}（该是 {full:.0f} 上下），最底下那片花瓣里是空的（{seen['hole']}）")

    # ---- 点开：从底下冒出来的菜单 ----
    opened = open_menu(pg)
    sh = pg.evaluate(SHEET)
    ok(opened and sh and sh["title"] == "南衙" and abs(sh["left"] - 8) < 1 and abs(sh["right"] - 8) < 1 and abs(sh["bottom"] - 8) < 1 and pg.locator(".kfs-page").count() == 0,
       f"点南衙：不直接进日记了，从底下冒出一张面板，顶上写“南衙”，贴着屏幕底（{sh}）")
    if not opened:
        ctx.close(); return                 # 菜单都没出来，后面的没法走
    rs = rows(pg)
    # 10 月 15 日闲笔集后面添了一行“江湖棋局”（见 tests/e2e_jianghu.py），四行；10 月 17 日藏音匣盖好了（见 tests/e2e_cangyin.py）
    ok([(r["name"], r["sub"]) for r in rs] == [("闲笔集", "今天还没写"), ("江湖棋局", "还没开局"), ("藏音匣", "还空着"), ("网易云", "营造中")],
       f"菜单四行：闲笔集、江湖棋局、藏音匣、网易云；闲笔集那行的小字和格子上的是同一句（{[(r['name'], r['sub']) for r in rs]}）")
    ok([r["soon"] for r in rs] == ["", "", "", "1"] and [r["svgs"] for r in rs] == [2, 2, 2, 1] and [r["dim"] for r in rs] == ["1", "1", "1", "0.55"] and [r["chip"] for r in rs] == ["1", "1", "1", "0.55"],
       f"能进去的那几行右边带箭头；还没盖的网易云淡一档、没有箭头（箭头 {[r['svgs'] - 1 for r in rs]}，名字的浓淡 {[r['dim'] for r in rs]}）")

    # ---- 藏音匣：点了进那一页（里面的见 tests/e2e_cangyin.py），左上角返回回到侧栏 ----
    c0 = len(calls())
    pg.locator(".kfs-nanya-row").nth(2).click()
    try:
        pg.locator(".kfs-cangyin").wait_for(timeout=8000)
        inbox = True
    except Exception:
        inbox = False
    ok(inbox and pg.locator(".kfs-nanya").count() == 0, "点藏音匣：菜单收起，藏音匣那一页滑进来")
    if inbox:
        pg.wait_for_timeout(600)
        pg.locator(".cy-back").click(); pg.wait_for_timeout(600)
    ok(pg.locator(".kfs-cangyin").count() == 0 and pg.locator(".kfs-nanya").count() == 0 and pg.evaluate(TILE_ON_TOP), "藏音匣左上角返回：回到侧栏，不回菜单")
    open_menu(pg)
    # ---- 还没盖的网易云：点了只冒一句话 ----
    pg.locator(".kfs-nanya-row").nth(3).click()
    said = wait_has(pg, "网易云还在营造")
    still = pg.locator(".kfs-nanya").count() == 1 and pg.locator(".kfs-page").count() == 0
    gone2 = wait_has(pg, "网易云还在营造", want=False)
    ok(said and still and gone2 and len(calls()) == c0,
       "点网易云：冒一句“网易云还在营造”，菜单还开着，那句话一会儿自己消失；前后也没往那边发什么")

    # ---- 点暗的地方、点叉：收起，回到侧栏 ----
    closed = lambda: pg.locator(".kfs-sheet-box").count() == 0 and pg.locator(".kfs-page").count() == 0 and pg.evaluate(TILE_ON_TOP)
    pg.mouse.click(196, 120); pg.wait_for_timeout(400)
    by_dim = closed()
    if by_dim:
        open_menu(pg)
    pg.get_by_role("button", name="关闭").click(); pg.wait_for_timeout(400)
    by_x = closed()
    ok(by_dim and by_x, f"点面板外面暗的地方、点右上角的叉：菜单都收起，回到侧栏，哪儿也没进（点暗处 {by_dim}，点叉 {by_x}）")
    if not by_x:
        ctx.close(); return                 # 收不起来，后面的没法走

    # ---- 闲笔集 ----
    open_menu(pg)
    pg.locator(".kfs-nanya-row").nth(0).click()
    pg.locator(".kfs-page").wait_for(timeout=5000); pg.wait_for_timeout(600)
    head = pg.evaluate("() => { const p = document.querySelector('.kfs-page'); return p.querySelector('[aria-label=\"返回\"]').parentElement.innerText.trim(); }")
    page_text = pg.locator(".kfs-page").inner_text()
    ok(head == "闲笔集" and "日记本" not in page_text and pg.locator(".kfs-sheet-box").count() == 0 and pg.locator(".kfs-nanya").count() == 0,
       f"点闲笔集：菜单收起，日记那一页滑进来，顶上写“闲笔集”（{head}）")
    ok("卿卿写的" in page_text and "光义写的" in page_text and pg.get_by_role("button", name="让光义写这一天").count() == 1,
       "日记里面没动：还是“卿卿写的”“光义写的”，还能让光义写这一天")

    # 今天写没写那一句，四种都走到：还没写 → 卿卿写了 → （取消）还没写 → 光义写了 → 都写了。格子上的字被日记页盖着也照样跟着变
    subs = [tile_sub(pg)]
    sweet = pg.get_by_role("button", name=re.compile("甜")).first
    sweet.click(); subs.append(sub_after(pg, subs[-1]))
    sweet.click(); subs.append(sub_after(pg, subs[-1]))
    n0 = len(calls())
    pg.get_by_role("button", name="让光义写这一天").click()
    wrote = wait_mock(lambda: len(calls()) > n0, 15)
    try:
        pg.get_by_role("button", name="重写").wait_for(timeout=15000)      # 他那一篇存好了才有“重写”
    except Exception:
        wrote = False
    subs.append(sub_after(pg, subs[-1]))
    sweet.click(); subs.append(sub_after(pg, subs[-1]))
    ok(wrote and subs == ["今天还没写", "今天卿卿写了", "今天还没写", "今天光义写了", "今天都写了"],
       f"格子上那行小字跟着日记变：{subs}")
    asked = json.dumps(calls()[-1]["body"], ensure_ascii=False) if wrote else ""
    ok("这是开封府日记本里属于你的那一页" in asked and "闲笔集" not in asked and "南衙" not in asked,
       "让那边写日记时寄去的话没跟着改名：还说“开封府日记本里属于你的那一页”，不提闲笔集、南衙")

    # ---- 返回：回侧栏，不回菜单 ----
    pg.get_by_role("button", name="返回").first.click(); pg.wait_for_timeout(600)
    ok(pg.locator(".kfs-page").count() == 0 and pg.locator(".kfs-sheet-box").count() == 0 and pg.evaluate(TILE_ON_TOP),
       "从闲笔集按返回：回到侧栏，菜单没有再冒出来")
    again = open_menu(pg)
    rs = rows(pg) if again else []
    ok(bool(rs) and rs[0]["name"] == "闲笔集" and rs[0]["sub"] == "今天都写了" == tile_sub(pg), f"再点开南衙：闲笔集那一行也写着“今天都写了”（{rs[0]['sub'] if rs else '菜单没出来'}）")
    if not again:
        ctx.close(); return
    pg.get_by_role("button", name="关闭").click(); pg.wait_for_timeout(400)

    # ---- 换成丁香：牡丹跟着变紫 ----
    pg.get_by_role("button", name="头像与设置").click(); pg.wait_for_timeout(600)
    pg.get_by_role("button", name="丁香主题").click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="关闭").click(); pg.wait_for_timeout(500)
    pe = pg.evaluate(PEONY)
    seen = ink_of(pg, pe["box"])
    ok(pe["fill"] == pe["color"] == "rgb(112, 88, 176)" and 0.86 * full < seen["ink"] < 1.14 * full and seen["hole"],
       f"换成丁香主题：牡丹跟着变成丁香的紫（{pe['fill']}），照样画得出来（墨量 {seen['ink']:.0f}）")
    ctx.close()


if __name__ == "__main__":
    with sync_playwright() as p:
        mock("/__debug/reset")
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
        try:
            run(browser)
        finally:
            browser.close()
    print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
    print(f"\n通过 {count['passed']}  失败 {count['failed']}")
    raise SystemExit(1 if count["failed"] or errors else 0)
