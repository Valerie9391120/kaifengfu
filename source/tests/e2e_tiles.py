# 侧栏四个方块上的图标。2026 年 10 月 11 日卿卿把它们换成了恩师画的一套：
#   万岁殿是殿，MCP 是三足乌，API 是云月，南衙是牡丹。
#   都是线稿描成的一块填色的形状（不是描线的），比手绘的那一套大一号（25 对 20），颜色跟着主题走。
#   换的只是图标：方块上的字、底下的小字、点开是哪个面板，都没动。
# 真的浏览器、假 Supabase。账号是编的。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_tiles.py
import io, re
from PIL import Image
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []

# 每个图标的数（tools/make_art.py 重新生成以后要跟着改）：
#   size   画本身多大（点），照 25 个点摆出来的
#   ink    两倍屏上的墨量（把图标那一小块截下来，照线的颜色折成整格数）；三倍屏是它的 9/4
#   hole   里面空着的一格，hard 线最实的一格：都是占图标那个 25 点见方的框的比例（横，竖）
ART = [
    dict(label="万岁殿", what="殿", size=(23.76, 14.24), ink=741, hole=(0.260, 0.580), hard=(0.167, 0.713), sheet="万岁殿"),
    dict(label="MCP", what="三足乌", size=(23.60, 23.17), ink=642, hole=(0.620, 0.287), hard=(0.673, 0.580), sheet="MCP"),
    dict(label="API", what="云月", size=(23.48, 15.97), ink=450, hole=(0.513, 0.420), hard=(0.740, 0.540), sheet="API"),
    dict(label="南衙", what="牡丹", size=(23.57, 19.47), ink=731, hole=(0.500, 0.647), hard=(0.500, 0.500), sheet="南衙"),
]

TILES = """() => [...document.querySelectorAll('.kfs-side-scroll .grid > button')].map((b) => { const chip = b.firstElementChild, svg = chip.querySelector('svg'), first = svg && svg.firstElementChild;
  const c = chip.getBoundingClientRect(), s = svg ? svg.getBoundingClientRect() : c, t = b.lastElementChild.children;
  const r = first ? first.getBoundingClientRect() : { left: c.left, right: c.left, top: c.top, bottom: c.top, width: 0, height: 0 }, cs = first ? getComputedStyle(first) : { fill: '', stroke: '' };
  return { label: t[0].textContent, sub: t[1].textContent, svg: [s.width, s.height], shapes: svg ? svg.querySelectorAll('*').length : 0, tag: first ? first.tagName : '',
    size: [r.width, r.height], off: [r.left - c.left, c.right - r.right, r.top - c.top, c.bottom - r.bottom],
    fill: cs.fill, stroke: cs.stroke, color: getComputedStyle(chip).color, box: [s.x, s.y, s.width, s.height] }; })"""
SHEET_TITLE = "() => { const b = document.querySelector('.kfs-sheet-box'); return b ? b.children[1].firstElementChild.textContent : null; }"
# 手绘的那一套（菜单里那三行的图标、面板右上角的叉）：多大、是不是还是描线的
DRAWN = """() => { const one = (svg) => { const s = svg.getBoundingClientRect(), cs = getComputedStyle(svg.firstElementChild); return { size: [s.width, s.height], fill: cs.fill, stroke: cs.stroke }; };
  return { rows: [...document.querySelectorAll('.kfs-nanya-row')].map((b) => one(b.querySelector('svg'))), close: one(document.querySelector('.kfs-sheet-box [aria-label="关闭"] svg')),
    color: getComputedStyle(document.querySelector('.kfs-nanya-row').firstElementChild).color }; }"""

# 把图标那一小块截下来看：墨有多少、里面那一格是不是空的、线上那一格是不是实的
def look(page, box, hole, hard):
    png = page.screenshot(clip={"x": box[0], "y": box[1], "width": box[2], "height": box[3]})
    im = Image.open(io.BytesIO(png)).convert("L")
    px = list(im.tobytes()); w, h = im.size      # 灰度图：一格一个数
    paper = sorted(px)[len(px) // 2]             # 大半是底色
    dark = min(px)                               # 线正中间是实打实的墨
    if paper - dark < 40:
        return {"ink": 0.0, "hole": False, "hard": False, "scale": w / box[2]}
    at = lambda f: im.getpixel((min(w - 1, int(w * f[0])), min(h - 1, int(h * f[1]))))
    ink = sum(min(1.0, max(0.0, (paper - v) / (paper - dark))) for v in px)
    return {"ink": ink, "hole": paper - at(hole) < 14, "hard": (paper - at(hard)) / (paper - dark) > 0.8, "scale": w / box[2]}

# 四个图标挨个看一遍：（哪一个，看到的，墨量该是多少，对不对）
def drawn_ok(page, tiles, colour):
    seen = []
    for a, t in zip(ART, tiles):
        v = look(page, t["box"], a["hole"], a["hard"])
        want = a["ink"] * (v["scale"] / 2) ** 2
        seen.append((a, v, want, 0.86 * want < v["ink"] < 1.14 * want and v["hole"] and v["hard"] and t["fill"] == colour))
    return seen


def run(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    first_time(pg)
    pg.get_by_role("button", name="打开侧栏").click(); pg.wait_for_timeout(700)

    # ---- 字没动 ----
    tiles = pg.evaluate(TILES)
    subs = [t["sub"] for t in tiles]
    ok([t["label"] for t in tiles] == [a["label"] for a in ART] and subs[0] == "放文档" and re.fullmatch(r"装了 \d+ 个", subs[1]) and subs[2] == "连接与用量" and subs[3] == "今天还没写",
       f"四个方块上的字、底下的小字都没动（{[t['label'] for t in tiles]}，{subs}）")

    # ---- 四个都是恩师画的那一套 ----
    ok(all(t["svg"] == [25, 25] and t["shapes"] == 1 and t["tag"] == "path" for t in tiles),
       f"四个图标都是 25 个点见方、各是一块形状（{[t['svg'][0] for t in tiles]}，{[t['shapes'] for t in tiles]} 块）")
    ok(all(t["fill"] == t["color"] == "rgb(63, 106, 98)" and t["stroke"] == "none" for t in tiles),
       f"都是填色、不描边，颜色跟着主题走：青绿下是 {tiles[0]['fill']}（{[t['stroke'] for t in tiles]}）")
    for a, t in zip(ART, tiles):
        ok(abs(t["size"][0] - a["size"][0]) < 0.3 and abs(t["size"][1] - a["size"][1]) < 0.3 and abs(t["off"][0] - t["off"][1]) < 0.6 and abs(t["off"][2] - t["off"][3]) < 0.6,
           f"{a['label']}上是{a['what']}：摆在小白块正中，{a['size'][0]}×{a['size'][1]} 上下（{[round(v, 2) for v in t['size']]}，四边 {[round(v, 2) for v in t['off']]}）")
    for a, v, want, good in drawn_ok(pg, tiles, "rgb(63, 106, 98)"):
        ok(good, f"{a['what']}真的画出来了：墨量 {v['ink']:.0f}（该是 {want:.0f} 上下），里面空着的那一格是空的（{v['hole']}），线上那一格是实的（{v['hard']}）")

    # ---- 点开还是原来那张面板 ----
    opened = []
    grid = pg.locator(".kfs-side-scroll .grid > button")
    for i in range(4):
        grid.nth(i).click()
        try:
            pg.locator(".kfs-sheet-box").wait_for(timeout=5000)
        except Exception:
            opened.append(None); break
        pg.wait_for_timeout(500)
        opened.append(pg.evaluate(SHEET_TITLE))
        if i == 3:
            d = pg.evaluate(DRAWN)
        pg.get_by_role("button", name="关闭").click(); pg.wait_for_timeout(400)
    ok(opened == [a["sheet"] for a in ART], f"四个方块点开还是各自那张面板（{opened}）")

    # ---- 手绘的那一套没被带歪 ----
    if len(opened) == 4 and opened[3]:
        ok(all(r["size"] == [20, 20] and r["fill"] == "none" and r["stroke"] == d["color"] for r in d["rows"]) and len(d["rows"]) == 4 and d["close"]["size"] == [16, 16] and d["close"]["fill"] == "none" and d["close"]["stroke"] != "none",
           f"手绘的那一套照旧：南衙菜单里四行的图标（江湖棋局那一颗骰子也是）还是 20、描线不填色，右上角的叉还是 16（{[r['size'][0] for r in d['rows']]}，{d['close']['size'][0]}）")
    else:
        ok(False, "手绘的那一套照旧（南衙的菜单没打开，没看成）")

    # ---- 换成丁香：四个都跟着变紫 ----
    pg.get_by_role("button", name="头像与设置").click(); pg.wait_for_timeout(600)
    pg.get_by_role("button", name="丁香主题").click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="关闭").click(); pg.wait_for_timeout(500)
    tiles = pg.evaluate(TILES)
    seen = drawn_ok(pg, tiles, "rgb(112, 88, 176)")
    ok(all(good for _, _, _, good in seen),
       f"换成丁香主题：四个图标都变成丁香的紫（{sorted(set(t['fill'] for t in tiles))}），照样画得出来（墨量 {[round(v['ink']) for _, v, _, _ in seen]}）")
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
