# 自定义聊天背景（见 src/wall.js）：账户面板“主题色”底下一个开关。开着、选好了图，不管哪个主题聊天那一屏都是那一张；关了回到主题自带的。
# 真的浏览器、假 Supabase。先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_wall.py [截图目录]
import os, sys, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
from mailkit import *

errors = []
SHOTS = sys.argv[1] if len(sys.argv) > 1 else ""
ART = os.path.abspath(os.path.join(HERE, "..", ".cache", "wall-art"))
FAKE_KEYBOARD = """(() => {
  let h = null, top = 0;
  const fake = new EventTarget();
  Object.defineProperty(fake, 'height', { get: () => (h == null ? window.innerHeight : h) });
  Object.defineProperty(fake, 'width', { get: () => window.innerWidth });
  Object.defineProperty(fake, 'offsetTop', { get: () => top });
  Object.defineProperty(fake, 'offsetLeft', { get: () => 0 });
  Object.defineProperty(fake, 'scale', { get: () => 1 });
  window.__kfsKeyboard = (height, offsetTop) => { h = height; top = offsetTop || 0; fake.dispatchEvent(new Event('resize')); fake.dispatchEvent(new Event('scroll')); };
  Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
})();"""
# 聊天那一屏最底下那张图、输入框那一块眼下什么样
LOOK = """() => {
  const w = document.querySelector('.kfs-wall'); const c = document.querySelector('.kfs-composer'); const cs = c ? getComputedStyle(c) : null;
  const r = w ? w.getBoundingClientRect() : null; const win = w ? w.parentElement.getBoundingClientRect() : null;
  return { src: w ? ((u) => (u.length > 80 ? u.slice(0, 22) + '…' + u.length + '…' + u.slice(-16) : u))(w.getAttribute('src')) : '', custom: !!w && w.hasAttribute('data-custom'), nat: w ? [w.naturalWidth, w.naturalHeight] : null,
    rect: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null, win: win ? [Math.round(win.width), Math.round(win.height)] : null,
    clear: !!c && c.hasAttribute('data-clear'), bg: cs ? cs.backgroundImage + ' / ' + cs.backgroundColor : '', blur: cs ? (cs.backdropFilter || cs.webkitBackdropFilter || 'none') : '',
    theme: document.documentElement.getAttribute('data-kfs-theme'), on: localStorage.getItem('kfs-wall-on') };
}"""
def look(page): return page.evaluate(LOOK)
def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name))
def keyboard(page, h):
    page.evaluate("(h) => window.__kfsKeyboard(h, 0)", h); page.wait_for_timeout(350)
def switch(page): return page.get_by_role("switch", name="自定义聊天背景")
def to_wall_set(page):
    open_panel(page)
    page.locator(".kfs-wall-set").scroll_into_view_if_needed(); page.wait_for_timeout(300)
def pick(page, how, path):
    with page.expect_file_chooser(timeout=5000) as fc:
        how()
    fc.value.set_files(path); page.wait_for_timeout(900)

# 两张假照片：一张竖的、一张横的，都是一块一块的颜色（看得出缩没缩、挪没挪）
os.makedirs(ART, exist_ok=True)
def art(name, w, h, cols):
    p = os.path.join(ART, name)
    im = Image.new("RGB", (w, h)); d = ImageDraw.Draw(im)
    n = len(cols)
    for i, c in enumerate(cols): d.rectangle([0, h * i // n, w, h * (i + 1) // n], fill=c)
    for k in range(0, w, 200): d.line([k, 0, k, h], fill=(255, 255, 255), width=3)
    im.save(p); return p
TALL = art("tall.png", 1500, 3000, [(232, 180, 190), (250, 226, 200), (190, 214, 236), (150, 180, 220), (120, 150, 200)])
WIDE = art("wide.png", 3000, 1500, [(40, 60, 100), (70, 100, 150), (200, 170, 140)])
NOT_IMG = os.path.join(ART, "not-a-picture.png")
with open(NOT_IMG, "w") as f: f.write("这不是一张图")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB); ctx.add_init_script(FAKE_KEYBOARD)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)
        chat(pa, "在吗")
        a = look(pa)
        ok("wall" in a["src"] and not a["custom"] and not a["clear"] and "blur" in a["blur"] and a["on"] is None, f"没开的时候：主题自带的那一张，输入框那一块是玻璃（{a['src']}，{a['blur']}）")

        # ================= 打开开关：头一回就让她选图 =================
        to_wall_set(pa)
        ok(switch(pa).get_attribute("aria-checked") == "false" and pa.locator(".kfs-wall-pick").count() == 0, "账户面板主题色底下一行“自定义聊天背景”，关着；底下没有别的")
        shot(pa, "wall_set_off.png")
        pick(pa, lambda: switch(pa).click(), TALL)
        wait_js(pa, "!!document.querySelector('.kfs-wall[data-custom]')", 8000)
        ok(switch(pa).get_attribute("aria-checked") == "true" and pa.locator(".kfs-wall-thumb").count() == 1 and pa.locator(".kfs-wall-pick").inner_text() == "换一张",
           "点开关：直接叫出相册；选了一张，开关开着，底下是那张图的小样和“换一张”")
        shot(pa, "wall_set_on.png")
        close_panel(pa)
        b = look(pa)
        ok(b["custom"] and b["src"].startswith("data:image/jpeg") and max(b["nat"]) == 2048 and b["rect"] == [0, 0, b["win"][0], b["win"][1]] and b["on"] == "1",
           f"聊天那一屏最底下换成她选的那一张，铺满整屏；长边压到 2048（{b['nat']}，{b['rect']}）")
        ok(b["clear"] and b["blur"] == "none" and "gradient" not in b["bg"] and "rgba(0, 0, 0, 0)" in b["bg"], f"输入框那一块成了透明的：没有玻璃、没有底色（{b['bg']}，{b['blur']}）")
        shot(pa, "wall_qinglv.png")

        # ================= 换主题色：背景不跟着换 =================
        for key, name in (("dingxiang", "丁香"), ("heiye", "黑夜")):
            to_wall_set(pa)
            pa.get_by_role("button", name=name + "主题").click(); pa.wait_for_timeout(500)
            close_panel(pa)
            c = look(pa)
            ok(c["theme"] == key and c["custom"] and c["src"] == b["src"] and c["clear"], f"换成{name}：别的颜色跟着主题走，聊天背景还是她选的那一张")
            shot(pa, f"wall_{key}.png")

        # ================= 键盘弹出来：图不缩、不挪 =================
        full = look(pa)["rect"]
        pa.locator(".kfs-composer textarea").focus(); keyboard(pa, 500)
        k = look(pa)
        ok(k["win"][1] < full[3] - 200 and k["rect"] == full, f"键盘弹出来聊天那一屏变矮（{k['win'][1]}），她选的那一张还是照整块屏幕铺，不缩不挪（{k['rect']}）")
        shot(pa, "wall_keyboard.png")
        keyboard(pa, None); pa.evaluate("document.activeElement && document.activeElement.blur()"); pa.wait_for_timeout(300)

        # ================= 换一张（横的）；不是图的放不上 =================
        to_wall_set(pa)
        pick(pa, lambda: pa.locator(".kfs-wall-pick").click(), WIDE)
        close_panel(pa)
        d = look(pa)
        ok(d["custom"] and d["src"] != b["src"] and d["nat"] == [2048, 1024] and d["rect"] == full, f"换一张横的：换上了，照样铺满整屏（{d['nat']}）")
        pa.locator(".kfs-composer textarea").focus(); keyboard(pa, 500)
        ok(look(pa)["rect"] == full, "横的那一张（照高铺的）：键盘弹出来也不缩")
        keyboard(pa, None); pa.evaluate("document.activeElement && document.activeElement.blur()"); pa.wait_for_timeout(300)
        shot(pa, "wall_wide.png")
        to_wall_set(pa)
        pick(pa, lambda: pa.locator(".kfs-wall-pick").click(), NOT_IMG)
        said = pa.locator(".kfs-wall-set + div").inner_text()
        close_panel(pa)
        ok("没放上" in said and look(pa)["src"] == d["src"], f"选了个不是图的：说一声没放上，原来那张照旧（{said.strip()}）")

        # ================= 关了回到主题自带的；再开还是那一张 =================
        to_wall_set(pa)
        switch(pa).click(); pa.wait_for_timeout(500)
        ok(pa.locator(".kfs-wall-pick").count() == 0, "关了开关：底下那一行收起")
        close_panel(pa)
        e = look(pa)
        ok(not e["custom"] and "wall-heiye" in e["src"] and not e["clear"] and "blur" in e["blur"] and e["on"] is None, f"关了：回到主题自带的那一张（黑夜的），输入框那一块又是玻璃（{e['src']}）")
        to_wall_set(pa)
        choosers = []
        pa.on("filechooser", lambda fc: choosers.append(fc))
        switch(pa).click(); pa.wait_for_timeout(700)
        close_panel(pa)
        f2 = look(pa)
        ok(f2["custom"] and f2["src"] == d["src"] and not choosers, "再打开：还是上回那一张，不再叫相册")

        # ================= 重新打开开封府：记着 =================
        pa.reload()
        wait_js(pa, "!!document.querySelector('.kfs-composer')", 30000); pa.wait_for_timeout(1200)
        g = look(pa)
        ok(g["custom"] and g["src"] == d["src"] and g["clear"] and g["theme"] == "heiye", "划掉重开：开关、那张图、主题都记在这台手机上")
        ok(pa.evaluate("(async () => { const db = await new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); }); const all = await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').getAll(); r.onsuccess = () => res(r.result); }); return !all.some((x) => JSON.stringify(x).includes('wall')); })()"),
           "那张图只记在这台手机的本地存档里（meta），不进要同步的那一堆")
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
sys.exit(1 if count["failed"] or errors else 0)
