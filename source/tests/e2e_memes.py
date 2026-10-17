# 表情包面板沉在输入框底下（照微信，卿卿 10 月 17 日要的，见开发说明“表情包面板沉到底下”那节）：
# 跟输入框连成一整块、贴到屏幕最底，照这台手机的键盘那么高；点笑脸键盘收下去、面板占着键盘那块地方，
# 点输入框面板收起、键盘出来，换来换去输入框不跳；再点笑脸只收面板、不弹键盘；点聊天记录收起；点一张直接发出去。
# 浏览器里弹不出 iPhone 的键盘：跟 fullscreen.py 一样换一个假的“可视区”，假装键盘升起来、落下去。账号和话都是编的。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_memes.py
import json, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
FAKE_KEYBOARD = """(() => {
  const fake = new EventTarget();
  let h = null, top = 0;
  Object.defineProperty(fake, 'height', { get: () => (h == null ? window.innerHeight : h) });
  Object.defineProperty(fake, 'width', { get: () => window.innerWidth });
  Object.defineProperty(fake, 'offsetTop', { get: () => top });
  Object.defineProperty(fake, 'offsetLeft', { get: () => 0 });
  Object.defineProperty(fake, 'scale', { get: () => 1 });
  window.__kfsKeyboard = (height, offsetTop) => { h = height; top = offsetTop || 0; fake.dispatchEvent(new Event('resize')); fake.dispatchEvent(new Event('scroll')); };
  Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
})();"""
# 输入框那一块、按钮那一排、面板在哪；键盘开着没有；焦点在不在输入框上
STATE = """() => {
  const c = document.querySelector('.kfs-composer').getBoundingClientRect();
  const btns = [...document.querySelectorAll('.kfs-composer > div > button, .kfs-composer button[aria-label="表情包"]')];
  const row = document.querySelector('.kfs-composer button[aria-label="表情包"]').getBoundingClientRect();
  const p = document.querySelector('.kfs-meme-panel');
  const pr = p ? p.getBoundingClientRect() : null;
  const ta = document.querySelector('.kfs-composer textarea');
  return { kb: document.documentElement.hasAttribute('data-kfs-kb'), focus: document.activeElement === ta,
    compTop: Math.round(c.top), compBottom: Math.round(c.bottom), btnBottom: Math.round(row.bottom),
    panel: !!p, panelTop: pr ? Math.round(pr.top) : null, panelBottom: pr ? Math.round(pr.bottom) : null, panelH: pr ? Math.round(pr.height) : null,
    stickers: p ? p.querySelectorAll('.grid button').length : 0, active: document.querySelector('.kfs-composer button[aria-label="表情包"]').style.background.includes('gradient'),
    kbPx: getComputedStyle(document.documentElement).getPropertyValue('--kfs-kb-px').trim(), saved: localStorage.getItem('kfs-kb-px') };
}"""
def st(page): return page.evaluate(STATE)
def keyboard(page, h):   # h：可视区剩多高（None 是键盘落下去了）
    page.evaluate("(h) => window.__kfsKeyboard(h, 0)", h); page.wait_for_timeout(250)
def smile(page): page.locator('.kfs-composer button[aria-label="表情包"]').tap(); page.wait_for_timeout(300)

with sync_playwright() as p:
    args = ["--no-sandbox"]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    ctx.add_init_script(FAKE_KEYBOARD)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    first_time(pa)
    chat(pa, "在吗")
    H = pa.evaluate("innerHeight")
    rest = pa.evaluate("Math.round(document.querySelector('.kfs-composer').getBoundingClientRect().bottom)")

    # ---- 还没开过键盘：点笑脸，面板贴到底，先按屏幕四成高 ----
    smile(pa)
    s0 = st(pa)
    ok(s0["panel"] and s0["panelBottom"] == H and abs(s0["panelH"] - round(H * 0.4)) <= 1 and s0["compBottom"] == s0["panelBottom"] and s0["stickers"] > 10 and s0["active"],
       f"还没开过键盘就点笑脸：面板沉在输入框底下、连成一块、贴到屏幕最底，先按屏幕四成高（{s0['panelH']} / {H}）；笑脸亮着")
    smile(pa)
    s1 = st(pa)
    ok(not s1["panel"] and not s1["focus"] and s1["compBottom"] == rest, "再点笑脸：只收面板，不弹键盘，输入框回到最底下")

    # ---- 打字：键盘升起来（可视区剩 447，键盘连上面那一条 405 高） ----
    pa.get_by_placeholder("说话，我听着").tap(); keyboard(pa, 447)
    k = st(pa)
    ok(k["kb"] and k["focus"] and k["compBottom"] == 447 and k["kbPx"] == f"{H - 447}px", f"键盘升起来：输入框贴在键盘上面（{k['compBottom']}），顺手量了键盘多高（{k['kbPx']}）")

    # ---- 键盘开着点笑脸：键盘收下去，面板占着键盘那块地方，按钮那一排不动 ----
    smile(pa)
    mid = st(pa)
    ok(not mid["focus"] and mid["panel"] and mid["btnBottom"] == k["btnBottom"], f"键盘开着点笑脸：输入框不再占着焦点（键盘就落下去了）；键盘还没落下去的那一下面板压着、按钮那一排不动（{mid['btnBottom']} / {k['btnBottom']}）")
    keyboard(pa, None)
    a = st(pa)
    ok(a["panel"] and not a["kb"] and a["panelH"] == H - 447 and a["panelBottom"] == H and a["btnBottom"] == k["btnBottom"] and a["saved"] == str(H - 447),
       f"键盘落下去：面板跟键盘一样高（{a['panelH']}），贴到底，按钮那一排还在原地（{a['btnBottom']} / {k['btnBottom']}）；键盘多高记在这台手机上")
    pa.screenshot(path="/tmp/memes_panel.png")

    # ---- 面板开着点输入框：键盘升起来那一下面板收起，按钮那一排不动 ----
    pa.get_by_placeholder("说话，我听着").tap(); pa.wait_for_timeout(150)
    before = st(pa)
    ok(before["focus"] and before["panel"] and before["btnBottom"] == k["btnBottom"], "面板开着点输入框：键盘还没升起来之前面板先留着（输入框不往下掉）")
    keyboard(pa, 447)
    b = st(pa)
    ok(b["kb"] and not b["panel"] and b["btnBottom"] == k["btnBottom"] and b["compBottom"] == 447, f"键盘升起来：面板收起，输入框贴在键盘上面，按钮那一排没动（{b['btnBottom']}）")
    pa.evaluate("document.activeElement.blur()"); keyboard(pa, None)
    ok(st(pa)["compBottom"] == rest, "键盘落下去：输入框回到最底下")

    # ---- 再开：照记着的键盘高；点聊天记录收起；划掉重开也记得 ----
    smile(pa)
    ok(st(pa)["panelH"] == H - 447, "键盘落着的时候点笑脸：面板照记着的键盘那么高")
    pa.mouse.click(200, 300); pa.wait_for_timeout(400)
    ok(not st(pa)["panel"], "点上面的聊天记录：面板收起")
    pa.reload()
    kite(pa)
    smile(pa)
    ok(st(pa)["panelH"] == H - 447, "划掉重开：还照这台手机的键盘那么高")

    # ---- 点一张：直接发出去 ----
    n0 = pa.locator(".kfs-chat-rows img").count()
    pa.locator(".kfs-meme-panel .grid button").first.tap(); pa.wait_for_timeout(800)
    ok(pa.locator(".kfs-chat-rows img").count() > n0 and not st(pa)["panel"], "点一张表情包：直接发出去（面板照旧收起）")

    # ---- 三套主题各拍一张 ----
    for t in ["qinglv", "dingxiang", "heiye"]:
        pa.evaluate("(t) => document.documentElement.setAttribute('data-kfs-theme', t)", t)
        smile(pa)
        pa.screenshot(path=f"/tmp/memes_{t}.png")
        smile(pa)
    browser.close()

print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] or errors else 0)
