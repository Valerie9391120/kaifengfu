# 输入框打字的时候变一行（她 10 月 17 日定的，见开发说明“打字的时候输入框变一行”那节）：键盘或者表情包面板开着，
# 左边加号、中间打字、右边笑脸和发送，模型、听写收着；打字的框一行一行长高，最高 200（八行上下），按钮待在最底下。
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
# 输入框是一行还是两行、每一样在哪
ROW = """() => {
  const c = document.querySelector('.kfs-composer');
  const ta = c.querySelector('textarea').getBoundingClientRect();
  const btn = (n) => { const b = c.querySelector('button[aria-label="' + n + '"]'); return b ? b.getBoundingClientRect() : null; };
  const model = [...c.querySelectorAll('button')].some((b) => /Sonnet|Opus|Haiku|Fable/.test(b.textContent));
  const plus = btn('发照片或文档'), smile = btn('表情包'), key = btn('打电话') || btn('发送') || btn('停');
  const p = document.querySelector('.kfs-meme-panel');
  const cr = c.getBoundingClientRect();
  const r = (b) => b && { l: Math.round(b.left), r: Math.round(b.right), b: Math.round(b.bottom) };
  return { compact: c.hasAttribute('data-compact'), h: Math.round(cr.height - (p ? p.getBoundingClientRect().height + 8 : 0)),
    ta: { l: Math.round(ta.left), r: Math.round(ta.right), t: Math.round(ta.top), b: Math.round(ta.bottom), h: Math.round(ta.height) },
    plus: r(plus), smile: r(smile), key: r(key), model, mic: !!btn('听写'), scroll: c.querySelector('textarea').scrollHeight > c.querySelector('textarea').clientHeight + 2 };
}"""
def row(page): return page.evaluate(ROW)
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

    # ---- 打字的时候输入框变一行 ----
    pa.evaluate("document.activeElement && document.activeElement.blur()"); keyboard(pa, None)
    r0 = row(pa)
    ok(not r0["compact"] and r0["model"] and r0["mic"] and r0["ta"]["b"] <= r0["plus"]["b"] - 38,
       f"不打字的时候：照原来两行，上面打字，下面加号、笑脸、模型、听写、打电话（输入框 {r0['h']} 高）")
    pa.get_by_placeholder("说话，我听着").tap(); keyboard(pa, 447)
    r1 = row(pa)
    one_row = r1["plus"]["r"] <= r1["ta"]["l"] and r1["ta"]["r"] <= r1["smile"]["l"] and r1["smile"]["r"] <= r1["key"]["l"] and all(abs(x["b"] - r1["ta"]["b"]) <= 2 for x in (r1["plus"], r1["smile"], r1["key"]))
    ok(r1["compact"] and one_row and not r1["model"] and not r1["mic"] and r1["h"] <= 58 and r0["h"] - r1["h"] >= 35,
       f"打字（键盘开着）：变一行，加号｜打字｜笑脸｜打电话，模型、听写收着；输入框 {r0['h']} → {r1['h']} 高")
    pa.get_by_placeholder("说话，我听着").fill("\n".join(f"第{i}行" for i in range(1, 4)))
    pa.wait_for_timeout(200)
    r2 = row(pa)
    pa.get_by_placeholder("说话，我听着").fill("\n".join(f"第{i}行" for i in range(1, 15)))
    pa.wait_for_timeout(200)
    r3 = row(pa)
    ok(r1["ta"]["h"] < r2["ta"]["h"] < r3["ta"]["h"] == 200 and r3["scroll"] and all(abs(x["b"] - r3["ta"]["b"]) <= 2 for x in (r3["plus"], r3["smile"], r3["key"])),
       f"打字的框一行一行长高（{r1['ta']['h']} → {r2['ta']['h']} → {r3['ta']['h']}），最高 200 就在框里翻；左右的按钮待在最底下")
    ok(r3["key"] and pa.locator('.kfs-composer button[aria-label="发送"]').count() == 1, "有字的时候最右边是发送")
    pa.get_by_placeholder("说话，我听着").fill(""); pa.wait_for_timeout(200)
    smile(pa)
    r4 = row(pa)
    ok(r4["compact"] and not r4["model"] and r4["ta"]["h"] == r1["ta"]["h"], "清空、点笑脸（面板开着）：还是一行，打字的框回到一行高")
    smile(pa)
    keyboard(pa, None)
    r5 = row(pa)
    ok(not r5["compact"] and r5["model"] and r5["mic"] and r5["h"] == r0["h"], "面板收了、键盘也落下去：回到两行，模型、听写回来")

    # ---- 打字的时候点挨着输入框的那一条：一下就点着 ----
    # （手指按下去那一刻打字的框就失了焦点；输入框要是当场长高，挨着它的那一条被挤开，松手落在输入框上，那一下白点了：等这一下点完再变回两行）
    say(pa, "原样回：[DOC:小纸条.md]\n写在这里\n[/DOC]")
    pa.locator(".kfs-doc-card").last.wait_for(timeout=20000); pa.wait_for_timeout(1500)
    pa.get_by_placeholder("说话，我听着").tap(); keyboard(pa, 447)
    cb = pa.locator(".kfs-doc-card").last.bounding_box()
    comp_top = pa.evaluate("document.querySelector('.kfs-composer').getBoundingClientRect().top")
    tap_y = cb["y"] + cb["height"] - 6
    covered = comp_top - tap_y < r0["h"] - r1["h"]   # 输入框当场长高的话，点的地方就被它盖上了
    pa.touchscreen.tap(cb["x"] + cb["width"] / 2, tap_y); pa.wait_for_timeout(600)
    opened = pa.locator(".kfs-doc-body").count() == 1
    r6 = row(pa)
    ok(covered and opened and not r6["compact"],
       f"打字的时候点挨着输入框的那张文档卡片（点的地方离输入框 {round(comp_top - tap_y)} 像素，输入框变回两行要长高 {r0['h'] - r1['h']}）：一下就点开了，点完输入框才变回两行")
    if opened:
        pa.get_by_role("button", name="关闭").click(); pa.wait_for_timeout(400)
    keyboard(pa, None)

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
