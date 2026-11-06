# 狐宇宙那一页：他屋里的一张书案（见 src/desk/、tools/make_desk.py）。手机这头走一遍，家里的闹钟用真的那一份（测试包）：
#   南衙里点“狐宇宙”：菜单、侧栏收起，盖一层全屏（层高 60），框里装着案上那一页（点的时候才下载）；框是隔开的、名字里带着暗号，不带暗号的话不理；
#     刘海、底下那一条照手机量的递进去（画面铺满整屏，按钮、卡片让开）；顶上没有“案上”、底下没有两行提示、点了东西不冒名字、返回只有箭头；眼前那段对话不换；那一页画好以后左上角是它自己的“回开封府”，点了关上、回到原来那段对话；
#   推近花盆：卡片上写园子眼下的样子（还没去过照实说；闹钟替他浇了水以后照存档写），没有按钮；推近铜镜：卡片上不写字，底下照镜子、衣柜、成就三颗；
#   锦盒：梦库、梦廊两颗点了在这一层里弹出那一页（那一页先不画），叉一点回到案上；
#   铜镜：底下照镜子、衣柜、成就三颗，点了在这一层里弹出那一页（照屋里卡片的样子）；衣柜里加一件、改字、删一件、撤销、找；锁着的写为什么删不了；
#     家里的闹钟照改过的衣柜替他办（他翻衣柜看得见新添的、改了的，删掉的不在）；
#   信笺：推近点“写一张”展开；还空着写“纸上还空着。”；留信：放进狐宇宙那段对话（记着是便签），不叫他、眼前那段对话不换；
#   他醒了一回（浇水、换了一身完成搭配、写了几句）：纸上多一轮——他的字转成繁体（刻本体）、后头几行小字、末尾日子；
#   已阅：那一轮收起来（记在 kfs2:fox:read），撤回放回去；再叫醒他一回：寄给他的狐宇宙那段对话里没有收起来的那一轮、它回的那张便签；
#   信匣：就在信笺上翻开（摆的是狐宇宙那段对话）：他在左（刻本体、繁体）、她在右，不带气泡；收进信匣的那一轮醒了那一行盖“阅”；
#     心里话收着、点开看；表情包画在纸上；小字照摆；点开文档在纸上看，左上角回信匣；长按一句出“复制”，复制的是原文；左上角回信笺；
#     这一层不藏、眼前那段对话不换；
#   画不出来的手机（没有 WebGL）：一句话、一颗“去信匣”、梦库梦廊两个口子，信匣底下摆回便签纸。
# 真的浏览器、假 Supabase、假的 Anthropic。账号和话都是编的。那一页要 WebGL，这台机器没有显卡，用 SwiftShader 软着画（慢）。
# 先在 source/ 里 npm run build:test、KFS_TEST_URL=http://127.0.0.1:8787 node alarm/build.mjs，起好两个服务（见开发说明），再：python3 tests/e2e_desk.py
# 要截图给人看：KFS_SHOTS=某个文件夹 python3 tests/e2e_desk.py
import json, os, re, shutil, subprocess, tempfile, time
from urllib.parse import quote
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
HERE_DIR = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE_DIR, "..", "alarm", "dist", "kfs-alarm-test.mjs")
SHOTS = os.environ.get("KFS_SHOTS", "")
GL = ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
LAYER = """() => { const l = document.querySelector('.kfs-desk'); if (!l) return null; const r = l.getBoundingClientRect(), f = l.querySelector('iframe'), s = getComputedStyle(l);
  return { rect: [r.left, r.top, r.width, r.height], z: s.zIndex, vis: s.visibility, frames: document.querySelectorAll('iframe').length, src: f ? f.getAttribute('src') : '',
    sandbox: f ? f.getAttribute('sandbox') : '', named: f ? !!f.getAttribute('name') : false, close: !!l.querySelector('.kfs-desk-close'),
    sheet: !!document.querySelector('.kfs-nanya'), bg: getComputedStyle(document.body).backgroundColor, note: (l.querySelector('.kfs-desk-note') || {}).textContent || '' }; }"""
CARD = "() => ({ on: document.getElementById('card').classList.contains('on'), sub: document.getElementById('k-sub').textContent, title: document.getElementById('k-title').textContent, note: document.getElementById('k-note').textContent, acts: [...document.querySelectorAll('#k-acts button')].map((b) => b.textContent) })"
BOX = """() => [...document.querySelectorAll('#xj .xj-b-in > *')].map((e) => { const t = e.querySelector('.xj-t'), r = (t || e).getBoundingClientRect(), in_ = document.querySelector('#xj .xj-b-in').getBoundingClientRect();
  return { cls: e.className, text: e.innerText.trim(), font: getComputedStyle(t || e).fontFamily, seal: !!e.querySelector('.xj-seal'), img: (e.querySelector('img') || {}).src || '',
    left: Math.round(r.left - in_.left), right: Math.round(in_.right - r.right), k: e.dataset.k || '' }; })"""
# 一段字怎么排：字号、行距、字距、对齐、怎么折行、一行多宽（去掉左右空的）、什么字
TYPE = """(sel) => { const p = document.querySelector(sel); if (!p) return null; const c = getComputedStyle(p), r = p.getBoundingClientRect();
  return { size: c.fontSize, lh: c.lineHeight, ls: c.letterSpacing, align: c.textAlign, wb: c.wordBreak, lb: c.lineBreak, wrap: c.textWrapStyle || c.textWrap || '',
    w: Math.round((r.width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight)) * 10) / 10, font: c.fontFamily.split(',')[0] }; }"""
PAPER = """() => [...document.querySelectorAll('#xj .xj-letters .xj-round')].map((s) => ({ id: s.dataset.id, body: s.querySelector('.xj-body').innerText.trim(), simp: s.classList.contains('simp'),
  lines: [...s.querySelectorAll('.xj-lines p')].map((p) => p.textContent), sign: (s.querySelector('.xj-sign') || {}).textContent || '',
  font: getComputedStyle(s.querySelector('.xj-body')).fontFamily }))"""


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name + ".png"), timeout=300000)


def shot_still(pg, name):
    # 弹出来的那一页滑稳了再截（只在要截图的时候等）
    if SHOTS:
        time.sleep(1.2)
        shot(pg, name)


def poll(fn, timeout=8.0, step=0.2):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(step)
    return False


def side(pg):
    if not pg.evaluate(REACHABLE):
        pg.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)


def nanya(pg):
    side(pg)
    pg.get_by_role("button", name=re.compile("^南衙")).click()
    pg.locator(".kfs-nanya").wait_for(timeout=5000); time.sleep(0.4)


def toggle_wake(pg):
    side(pg)
    pg.get_by_role("button", name="头像与设置").click(); time.sleep(0.6)
    sw = pg.get_by_role("switch", name="他自己醒")
    (sw if sw.count() else pg.get_by_role("button", name="他自己醒")).click()
    time.sleep(0.5)
    pg.get_by_role("button", name="关闭").click(); time.sleep(0.4)
    if pg.locator("div.absolute.inset-0.z-30").count():
        pg.locator("div.absolute.inset-0.z-30").click(); time.sleep(0.6)


def alarm(args, home):
    env = dict(os.environ, KFS_ALARM_HOME=home, KFS_ALARM_PLAIN="1", KFS_ALARM_NOSTART="1", KFS_ALARM_EMAIL="qing@example.com", KFS_ALARM_PASSWORD="correct-horse", KFS_ALARM_PASS=PASS, KFS_ALARM_MANUAL_GAP="0")
    r = subprocess.run(["node", BUNDLE] + args, env=env, capture_output=True, text=True, timeout=240)
    return r.returncode, r.stdout + r.stderr


def resync(pg):
    pg.evaluate("window.__away(true)"); time.sleep(0.3)
    pg.evaluate("window.__away(false)"); time.sleep(0.3)


def until(pg, fn, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        resync(pg)
        time.sleep(0.6)
    return fn()


def desk_frame(pg, timeout=120):
    # 照那一层里眼下那个框找（框拆了又建，手里的旧框对象可能还挂着）
    end = time.time() + timeout
    while time.time() < end:
        try:
            h = pg.query_selector(".kfs-desk iframe")
            f = h.content_frame() if h else None
            if f and f.evaluate("!!window.__scene && window.__scene.started()"):
                return f
        except Exception:
            pass
        time.sleep(0.4)
    print("  （案上那一页没画出来：", pg.evaluate(LAYER), "）", flush=True)
    return None


TITLE = {"花盆": "园子", "铜镜": "妆台", "锦盒": "罗浮梦", "信笺": "你留的便签"}


# 手指点进框里那一页：这台机器上 Chrome 有时候把点进框里的坐标折半（框在另一个进程里、又仿着两倍屏的时候，哪一回碰上说不准），
# 点花盆落到了左上角的梨枝上。先在框里铺一层透明的量一回（量的那一下落在这一层上，不碰底下的东西）：
# 坐标对得上就用真的手指点；对不上就在框里照那个点直接发一串按下、抬起、点击（同手指点一下的次序）
CAL = """(() => { const d = document.createElement('div'); d.id = '__cal'; d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent;touch-action:none';
  const rec = (e) => { e.preventDefault(); e.stopPropagation(); if (e.type === 'pointerdown') window.__calXY = [e.clientX, e.clientY]; };
  ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach((t) => d.addEventListener(t, rec, true));
  window.__calXY = null; document.body.appendChild(d); })()"""
SYN = """([x, y]) => { const el = document.elementFromPoint(x, y); if (!el) return null;
  const id = 900 + (window.__synN = (window.__synN || 0) + 1), o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };
  const pe = (t) => el.dispatchEvent(new PointerEvent(t, { ...o, pointerId: id, pointerType: 'touch', isPrimary: true, button: 0, buttons: t === 'pointerdown' ? 1 : 0 }));
  let tt = null; try { tt = new Touch({ identifier: id, target: el, clientX: x, clientY: y }); } catch (e) {}
  const te = (t) => { if (tt) try { el.dispatchEvent(new TouchEvent(t, { ...o, touches: t === 'touchend' ? [] : [tt], targetTouches: t === 'touchend' ? [] : [tt], changedTouches: [tt] })); } catch (e) {} };
  pe('pointerdown'); te('touchstart'); pe('pointerup'); te('touchend'); el.dispatchEvent(new MouseEvent('click', { ...o, button: 0 }));
  return el.id || el.tagName; }"""
SYN_DOWN = """([x, y]) => { const el = document.elementFromPoint(x, y); if (!el) return null;
  const id = 900 + (window.__synN = (window.__synN || 0) + 1), o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };
  let tt = null; try { tt = new Touch({ identifier: id, target: el, clientX: x, clientY: y }); } catch (e) {}
  window.__synHold = { el, id, o, tt };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerId: id, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 }));
  if (tt) el.dispatchEvent(new TouchEvent('touchstart', { ...o, touches: [tt], targetTouches: [tt], changedTouches: [tt] }));
  return el.id || el.tagName; }"""
SYN_UP = """(() => { const h = window.__synHold; if (!h) return; window.__synHold = null;
  h.el.dispatchEvent(new PointerEvent('pointerup', { ...h.o, pointerId: h.id, pointerType: 'touch', isPrimary: true, button: 0, buttons: 0 }));
  if (h.tt) h.el.dispatchEvent(new TouchEvent('touchend', { ...h.o, touches: [], targetTouches: [], changedTouches: [h.tt] })); })()"""
synthetic = []


def frame_scale(pg, fr):
    s = fr.evaluate("window.__tapScale || 0")
    if s:
        return s
    ox, oy = pg.evaluate("(() => { const r = document.querySelector('.kfs-desk iframe').getBoundingClientRect(); return [r.left, r.top]; })()")
    fr.evaluate(CAL)
    pg.touchscreen.tap(ox + 120, oy + 300)
    poll(lambda: fr.evaluate("window.__calXY") is not None, 5)
    xy = fr.evaluate("(() => { const d = document.getElementById('__cal'); if (d) d.remove(); return window.__calXY; })()")
    s = 1 if xy and abs(xy[0] - 120) < 2 and abs(xy[1] - 300) < 2 else (round(xy[0] / 120, 2) if xy else -1)
    fr.evaluate(f"window.__tapScale = {s}")
    if s != 1:
        print(f"  （这一回框里收到的手指坐标是 {xy}（该是 [120, 300]）：框里的点改成在框里直接发）", flush=True)
    return s


def ftap(pg, fr, x, y):
    # 点框里 (x, y) 那一点（框里的坐标）
    if frame_scale(pg, fr) == 1:
        ox, oy = pg.evaluate("(() => { const r = document.querySelector('.kfs-desk iframe').getBoundingClientRect(); return [r.left, r.top]; })()")
        pg.touchscreen.tap(ox + x, oy + y)
    else:
        synthetic.append(fr.evaluate(SYN, [x, y]))


def fpress(pg, fr, cdp, x, y, until, timeout=3):
    # 长按框里 (x, y)：按下去，等 until() 成了再抬起来；返回按着的时候成没成
    if frame_scale(pg, fr) == 1:
        ox, oy = pg.evaluate("(() => { const r = document.querySelector('.kfs-desk iframe').getBoundingClientRect(); return [r.left, r.top]; })()")
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": ox + x, "y": oy + y}]})
        got = poll(until, timeout)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    else:
        synthetic.append(fr.evaluate(SYN_DOWN, [x, y]))
        got = poll(until, timeout)
        fr.evaluate(SYN_UP)
    return got


def tap_item(pg, fr, name):
    # 镜头停稳了再点（软着画，慢：一帧画得久了，手指按下、抬起隔得太久，那一页不当是点）；没推近就再点一回
    for i in range(5):
        poll(lambda: not fr.evaluate("window.__scene.moving()"), 10)
        time.sleep(0.5)
        x, y = fr.evaluate(f"(() => {{ const h = window.__scene.holders().find((x) => x[0] === {json.dumps(name)}); return window.__scene.screenOf(h[1], h[2], h[3]); }})()")
        frame_scale(pg, fr)
        # 点的那一下先不画（同开封府盖着一层的时候 hold）：软着画一帧要好久，按下、抬起中间隔得太久，那一页不当是点；停画以后等手里那一帧画完再点，没点上就多等一会儿
        fr.evaluate("window.KFSROOM && (KFSROOM.hold = true)")
        time.sleep(0.4 + 0.8 * i)
        ftap(pg, fr, x, y)
        time.sleep(0.3)
        fr.evaluate("window.KFSROOM && (KFSROOM.hold = false)")
        if poll(lambda: fr.evaluate(CARD)["on"] and fr.evaluate(CARD)["title"] == TITLE[name], 8):
            return True
        if os.environ.get("DBG"):
            print("  （点", name, [round(x), round(y)], "没推近；点着的是", fr.evaluate(f"window.__three.hitAt({x}, {y})"), "镜头", fr.evaluate("[window.__scene.where(), window.__scene.moving()]"), "）", flush=True)
    return False


def back_to_desk(fr):
    # 推近着才点左上角（没推近的时候那一颗是“回开封府”）
    if fr.evaluate(CARD)["on"]:
        fr.evaluate("document.getElementById('back').click()")
        poll(lambda: not fr.evaluate(CARD)["on"], 10)
    time.sleep(3.0)  # 镜头退回案前（软着画，慢）


def card_of(pg, fr, name):
    tap_item(pg, fr, name)
    time.sleep(2.5)
    c = fr.evaluate(CARD)
    if os.environ.get("DBG") and not c["on"]:
        print("  （没推近", name, "：那一层", pg.evaluate(LAYER), "）", flush=True)
    return c


def open_paper(pg, fr):
    tap_item(pg, fr, "信笺")
    time.sleep(1.0)
    fr.evaluate("[...document.querySelectorAll('#k-acts button')].find((b) => b.textContent === '写一张').click()")
    ok(poll(lambda: fr.evaluate("window.XJ && XJ.state() === 'open'"), 120), "推近信笺、点“写一张”：玉佩挪开，信笺展开")
    time.sleep(0.6)


def close_paper(fr):
    fr.evaluate("document.querySelector('#xj .xj-top .xj-back').click()")
    poll(lambda: fr.evaluate("!window.__xj.ph()"), 120)
    time.sleep(1.0)


def run(browser):
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    got = []
    pg.on("request", lambda r: got.append(r.url) if "/assets/desk-" in r.url else None)
    if os.environ.get("DBG"):
        pg.on("console", lambda m: print("  [console]", m.type, m.text[:200], flush=True) if m.type in ("error", "warning") else None)
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 59, "bottom": 34, "left": 0, "right": 0}})
    first_time(pg)
    ta = pg.get_by_placeholder("说话，我听着")
    ta.fill("今天早点睡"); ta.press("Enter")
    wait_mock(lambda: len(calls()) >= 1, 30); wait_js(pg, "!document.body.innerText.includes('正在输入')", 30000); time.sleep(0.8)
    here = last_chat(pg)
    toggle_wake(pg)
    home = tempfile.mkdtemp(prefix="kfs-desk-")
    try:
        code, out = alarm(["setup"], home)
        ok(code == 0 and "暗号对上了" in out, "家里的闹钟：拿她设的暗号装上了")

        # ---- 南衙 → 狐宇宙 ----
        nanya(pg)
        ok(not got, "点之前没去下载案上那一页")
        pg.locator(".kfs-nanya-row", has_text="狐宇宙").click()
        pg.locator(".kfs-desk").wait_for(timeout=5000)
        fr = desk_frame(pg)
        lay = pg.evaluate(LAYER)
        ok(fr is not None and lay["rect"] == [0, 0, 393, 852] and lay["z"] == "60" and "/assets/desk-" in lay["src"] and not lay["sheet"] and lay["bg"] == "rgb(28, 22, 20)",
           f"点了：菜单收起，盖一层全屏（层高 60），框里装着案上那一页；网页底色换成那一页的（{lay}）")
        ok(len(got) == 1 and lay["sandbox"] == "allow-scripts" and lay["named"], f"那一页这时候才下载；框是隔开的，名字里带着暗号（{len(got)}，{lay['sandbox']}）")
        if not fr:
            shot(pg, "desk_fail"); ctx.close(); return
        ok(poll(lambda: not pg.evaluate(LAYER)["close"], 10), "画好以后，开封府这头的叉收起来（左上角是那一页自己的“回开封府”）")
        reach = fr.evaluate("(() => { try { return String(!!window.parent.document.body); } catch (e) { return 'blocked'; } })()")
        ok(reach == "blocked" and fr.evaluate("window.name") == "", f"那一页够不着开封府这一页（来路是 null）；暗号它读完就清掉了（{reach}）")
        safe = fr.evaluate("(() => { const st = document.getElementById('stage').getBoundingClientRect(), bk = document.getElementById('back').getBoundingClientRect(), cs = getComputedStyle(document.documentElement);"
                           " return [cs.getPropertyValue('--safe-top').trim(), cs.getPropertyValue('--safe-bottom').trim(), st.top, st.height, Math.round(bk.top), innerHeight]; })()")
        ok(safe[0] == "59px" and safe[1] == "34px" and safe[2] == 0 and safe[3] == safe[5] and safe[4] >= 59,
           f"刘海、底下那一条照手机量的递进去（框里的 env() 是 0）：画面铺满整屏，左上角那颗让开刘海（{safe}）")
        gone = fr.evaluate("['pill', 'hint', 'tag'].map((id) => { const e = document.getElementById(id); return !e || getComputedStyle(e).display === 'none'; })"
                           ".concat([getComputedStyle(document.getElementById('back'), '::before').display === 'none'])")
        ok(gone == [True, True, True, True], f"顶上没有“案上”、底下没有那两行提示、点了东西不冒名字；返回后头没有那一团暗（{gone}）")
        fonts = fr.evaluate("[...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href'))")
        ok(any(re.match(r"\./wenkai-[0-9a-f]{10}\.css$", f) for f in fonts) and any(re.match(r"\./jinhui-[0-9a-f]{10}\.css$", f) for f in fonts), f"字：霞鹜文楷切好的那一份、藏音匣的刻本体（{fonts}）")
        csp = fr.evaluate("document.querySelector('meta[http-equiv=Content-Security-Policy]').content")
        ok("default-src 'none'" in csp and "'unsafe-inline'" not in csp.split("script-src")[1].split(";")[0] and "connect-src 'self'" in csp, f"安全规矩：脚本只许那几段（记了指纹）、只连自己（{csp[:80]}…）")
        back = fr.evaluate("[document.getElementById('back').hidden, document.getElementById('back').getAttribute('aria-label')]")
        ok(back == [False, "回开封府"], f"案上左上角：回开封府（{back}）")
        shot(pg, "desk_1")
        fr.evaluate("window.parent.postMessage({ desk: 'close' }, '*')")
        time.sleep(0.8)
        ok(pg.locator(".kfs-desk").count() == 1, "不带暗号说的话开封府不理（冒充“回开封府”，那一层还在）")

        # ---- 推近花盆、铜镜、锦盒 ----
        c = card_of(pg, fr, "花盆")
        ok(c["title"] == "园子" and c["sub"] == "钧窑六方盆" and c["note"] == "园子我还没进去过。头一回进去，会得一盆魏紫。" and c["acts"] == [], f"花盆：园子还没进去过，照实说；没有按钮（{c}）")
        back_to_desk(fr)
        c = card_of(pg, fr, "铜镜")
        ok(c["title"] == "妆台" and c["note"] == "" and c["acts"] == ["照镜子", "衣柜", "成就"], f"铜镜：妆台还没去过：不写字，底下照镜子、衣柜、成就三颗（{c}）")
        back_to_desk(fr)
        c = card_of(pg, fr, "锦盒")
        ok(c["title"] == "罗浮梦" and c["acts"] == ["梦库", "梦廊"], f"锦盒：罗浮梦，梦库、梦廊两颗（{c['acts']}）")
        fr.evaluate("[...document.querySelectorAll('#k-acts button')].find((b) => b.textContent === '梦库').click()")
        ok(poll(lambda: pg.locator(".kfs-desk .kfs-sheet-box").count() == 1 and "梦库还空着" in pg.locator(".kfs-desk .kfs-sheet-box").inner_text(), 5) and poll(lambda: fr.evaluate("window.KFSROOM.hold"), 3),
           "点梦库：这一层里弹出梦库那一页（还空着，能导入），那一页先不画")
        ok(fr.evaluate("getComputedStyle(document.getElementById('card')).opacity") == "0", "弹着的时候，那一页推近以后底下那张卡片收起来（不从磨砂底下透上来）")
        look = pg.evaluate("""(() => { const b = document.querySelector('.kfs-desk .kfs-room .kfs-room-box'); if (!b) return null; const s = getComputedStyle(b), t = document.querySelector('.kfs-desk .kfs-room-title');
          return { bg: s.backgroundColor, radius: s.borderTopLeftRadius, color: s.color, font: getComputedStyle(t).fontFamily, sub: (document.querySelector('.kfs-desk .kfs-room-sub') || {}).textContent || '', title: t.textContent,
            btn: getComputedStyle(document.querySelector('.kfs-desk .kfs-lf-import')).backgroundImage, loaded: document.fonts.check('22px \"KFS WenKai\"', '梦库') }; })()""")
        ok(look and look["bg"] == "rgba(22, 16, 13, 0.88)" and look["radius"] == "4px" and look["color"] == "rgb(239, 230, 214)" and look["font"].startswith('"KFS WenKai"') and look["sub"] == "锦盒 · 罗浮梦" and look["title"] == "梦库",
           f"梦库照屋里卡片的样子：深色的底、方角、纸色的字、霞鹜文楷，上面一小行“锦盒 · 罗浮梦”（{look}）")
        ok(look and "239, 230, 214" in look["btn"], f"导入那一颗：纸色的底（同卡片上那一颗）（{look and look['btn'][:60]}）")
        shot(pg, "desk_2_pool")
        pg.locator(".kfs-desk .kfs-sheet-box").get_by_role("button", name="关闭").click()
        ok(poll(lambda: pg.locator(".kfs-desk .kfs-sheet-box").count() == 0, 4) and poll(lambda: not fr.evaluate("window.KFSROOM.hold"), 3), "叉一点：回到案上，接着画")
        fr.evaluate("[...document.querySelectorAll('#k-acts button')].find((b) => b.textContent === '梦廊').click()")
        ok(poll(lambda: "梦廊里还没有留下梦。" in pg.locator(".kfs-desk .kfs-sheet-box").inner_text(), 5), "点梦廊：弹出梦廊那一页（还没有梦）")
        pg.locator(".kfs-desk .kfs-sheet-box").get_by_role("button", name="关闭").click(); time.sleep(0.6)
        back_to_desk(fr)

        # ---- 回开封府：回到原来那段对话 ----
        fr.evaluate("document.getElementById('back').click()")
        ok(poll(lambda: pg.locator(".kfs-desk").count() == 0, 5) and last_chat(pg) == here and pg.evaluate("getComputedStyle(document.body).backgroundColor") != "rgb(28, 22, 20)",
           "案上点左上角：那一层拆掉，回到原来那段对话（开的时候没翻到狐宇宙），网页底色换回来")

        # ---- 信笺：空着、留信 ----
        nanya(pg)
        pg.locator(".kfs-nanya-row", has_text="狐宇宙").click()
        fr = desk_frame(pg)
        poll(lambda: not pg.evaluate(LAYER)["close"], 10)
        c = card_of(pg, fr, "信笺")
        ok(c["title"] == "你留的便签" and c["acts"] == ["写一张"], f"信笺：卡片照那一页原来写的（{c}）")
        fr.evaluate("[...document.querySelectorAll('#k-acts button')].find((b) => b.textContent === '写一张').click()")
        ok(poll(lambda: fr.evaluate("window.XJ && XJ.state() === 'open'"), 120), "点“写一张”：信笺展开")
        time.sleep(0.6)
        ok(fr.evaluate("document.querySelector('#xj .xj-empty').textContent") == "纸上还空着。" and fr.evaluate(PAPER) == [], "他还没在纸上写过字：纸上还空着")
        DOOD = "[...document.querySelectorAll('#xj .xj-page:not([hidden]) .xj-doodle')].map((d) => [d.classList.contains('her'), d.textContent, getComputedStyle(d).fontFamily])"
        d0 = fr.evaluate(DOOD)
        ok(len(d0) == 1 and d0[0][0] is False and d0[0][1] == "到此一游！", f"她还没留过信：纸底下“到此一游！”（{d0}）")
        c0 = len(calls())
        fr.evaluate("document.querySelector('#xj .xj-btn[data-act=write]').click()"); time.sleep(0.8)
        fr.fill("#xj .xj-ta", "我来过啦，冰箱里有布丁")
        fr.evaluate("document.querySelector('#xj .xj-btn[data-act=send]').click()")
        ok(poll(lambda: (chat_by(pg, "hyz") or [{}])[-1].get("text") == "我来过啦，冰箱里有布丁", 5), "留信：放进狐宇宙那段对话")
        last = chat_by(pg, "hyz")[-1]
        ok(last.get("role") == "her" and last.get("note") is True and last_chat(pg) == here, "记着是便签（同原来便签纸上留的）；眼前那段对话没换")
        time.sleep(2.0)
        ok(len(calls()) == c0 and poll(lambda: "信留下了" in fr.evaluate("document.querySelector('#xj .xj-note').textContent"), 3), "不叫他、不等回话；纸上一句“信留下了，我醒来就看。”")
        d1 = fr.evaluate(DOOD)
        ok(len(d1) == 1 and d1[0][0] is True and d1[0][1] == "我来过啦，冰箱里有布丁" and d1[0][2].startswith('"XJ Doodle", "Long Cang"'), f"纸底下“到此一游！”换成她写的，同一个笔（龙藏体）（{d1}）")
        fr.evaluate("document.querySelector('#xj .xj-btn[data-act=write]').click()"); time.sleep(0.8)
        fr.fill("#xj .xj-ta", "第二张：记得喝水")
        fr.evaluate("document.querySelector('#xj .xj-btn[data-act=send]').click()")
        ok(poll(lambda: [x[1] for x in fr.evaluate(DOOD)] == ["我来过啦，冰箱里有布丁", "第二张：记得喝水"] and (chat_by(pg, "hyz") or [{}])[-1].get("text") == "第二张：记得喝水", 6),
           f"再留一张：一张接一张摆着（{fr.evaluate(DOOD)}）")
        time.sleep(3.0)  # 等这一张推上云端（不然闹钟拿到的那段对话里还没有它，两边一前一后写，后写的盖掉先写的）
        shot(pg, "desk_3_left")

        # ---- 他醒了一回 ----
        mock("/__debug/tool-queue?name=play_garden&input=" + quote(json.dumps({"action": "water"})))
        mock("/__debug/tool-queue?name=play_dressing_room&input=" + quote(json.dumps({"action": "select", "category": "outfit", "itemId": "outfit_black_turtleneck"})))
        mock("/__debug/tool-queue?name=play_dressing_room&input=" + quote(json.dumps({"action": "complete"})))
        mock("/__debug/reply-queue?text=" + quote("<thinking>她留了布丁</thinking>\n布丁吃了，园子里的花也浇过了。\n今天风大，记得关窗。\n[SPLIT]\n[MEME:fox_reading_book.jpg]\n[WAKE:+2h]"))
        code, out = alarm(["wake"], home)
        ok(code == 0 and "醒过了" in out, f"叫醒他一回（{out.strip().splitlines()[-1] if out.strip() else ''}）")
        ok(until(pg, lambda: len(fr.evaluate(PAPER)) == 1 and not fr.evaluate(PAPER)[0]["simp"], 40), "同步下来：纸上多一轮（开着的那一页跟着换，转好繁体）")
        d2 = fr.evaluate(DOOD)
        ok(len(d2) == 1 and d2[0][0] is False and d2[0][1] == "到此一游！", f"他醒来回了信：她那两张收起来，纸底下又是“到此一游！”（{d2}）")
        ind = fr.evaluate("[...document.querySelectorAll('#xj .xj-round .xj-body p')].map((p) => getComputedStyle(p).textIndent)")
        ok(ind and all(x == "0px" for x in ind), f"他写的字不缩进（同信匣里）（{ind}）")
        t_paper = fr.evaluate(TYPE, "#xj .xj-letters .xj-round:not(.simp) .xj-body p")
        t_paper_l = fr.evaluate(TYPE, "#xj .xj-letters .xj-round .xj-lines p")
        p1 = fr.evaluate(PAPER)[0]
        ok(p1["body"] == "布丁喫了，園子裏的花也澆過了。\n\n今天風大，記得關窗。" and "KFS Jinhui" in p1["font"], f"他写的字：转成繁体（OpenCC 标准繁体，同藏音匣：吃写成喫）、刻本体，一段一段（{p1['body']}，{p1['font'][:40]}）")
        ok(p1["lines"] == ["去园子里浇了水", "在妆台前换了换行头", "完成了今天的搭配：披发、素面、不熏香；衣柜：高领黑毛衣"], f"后头几行小字（{p1['lines']}）")
        ok(re.fullmatch(r"[〇一二三四五六七八九十]+月[〇一二三四五六七八九十]+日 (深夜|清晨|上午|午間|午後|傍晚|夜裏)", p1["sign"]) is not None, f"末尾落日子（{p1['sign']}）")
        shot(pg, "desk_4_round")

        # ---- 已阅、撤回 ----
        rid = p1["id"]
        fr.evaluate("document.querySelector('#xj .xj-btn[data-act=read]').click()")
        ok(poll(lambda: rid in json.loads(pg.evaluate(KV, "kfs2:fox:read") or "{}").get("ids", []), 5) and poll(lambda: fr.evaluate(PAPER) == [], 5),
           "已阅：那一轮收起来，记在 kfs2:fox:read")
        ok(poll(lambda: "收进信匣了" in fr.evaluate("(document.querySelector('#xj .xj-undo') || {}).textContent || ''"), 3), "原地一行“收进信匣了 · 撤回”")
        shot(pg, "desk_5_read")
        fr.evaluate("document.querySelector('#xj .xj-undo button').click()")
        ok(poll(lambda: rid not in json.loads(pg.evaluate(KV, "kfs2:fox:read") or "{}").get("ids", []), 5) and poll(lambda: len(fr.evaluate(PAPER)) == 1, 5), "撤回：放回纸上，存档里那一笔划掉")
        time.sleep(0.8)
        fr.evaluate("document.querySelector('#xj .xj-btn[data-act=read]').click()")
        ok(poll(lambda: rid in json.loads(pg.evaluate(KV, "kfs2:fox:read") or "{}").get("ids", []), 5), "再点已阅：收起来")
        time.sleep(3.0)  # 等推上云端

        # ---- 再叫醒他一回：收起来的那一轮、它回的那张便签不寄 ----
        mock("/__debug/reply-queue?text=" + quote("又醒了一回。\n[SPLIT]\n[VOICE]\n听得见吗\n[SPLIT]\n[DOC:清单.md]\n# 清单\n- 布丁\n- **关窗**\n[/DOC]"))
        c1 = len(calls())
        code, out = alarm(["wake"], home)
        body = json.dumps(calls()[c1]["body"]["messages"], ensure_ascii=False) if len(calls()) > c1 else ""
        if os.environ.get("DBG"): print([w + ":" + str(w in body) for w in ["布丁吃了", "冰箱里有布丁", "关窗", "又醒了", "醒来"]])
        ok(code == 0 and body and "布丁吃了" not in body and "冰箱里有布丁" not in body and "关窗" not in body,
           "再叫醒他一回：寄给他的狐宇宙那段对话里没有收起来的那一轮、它回的那张便签")
        ok(until(pg, lambda: [r["body"] for r in fr.evaluate(PAPER)] == ["又醒了一回。\n\n聽得見嗎"], 40), f"纸上只有新的这一轮（语音的字也写上）（{[r['body'] for r in fr.evaluate(PAPER)]}）")

        # ---- 信匣：就在信笺上翻开 ----
        fr.evaluate("document.querySelector('#xj .xj-box').click()")
        ok(poll(lambda: fr.evaluate("XJ.view()") == "B" and len(fr.evaluate(BOX)) > 3, 10), "信匣：在信笺上翻开（换一页），开封府递来狐宇宙里的")
        lay = pg.evaluate(LAYER)
        ok(lay["vis"] == "visible" and last_chat(pg) == here, f"这一层不藏，眼前那段对话不换（{lay['vis']}，{last_chat(pg)}）")
        tb = fr.evaluate("[getComputedStyle(document.querySelector('#xj .xj-box')).opacity, getComputedStyle(document.querySelector('#xj .xj-box')).pointerEvents, document.querySelector('#xj .xj-top .xj-back').getAttribute('aria-label')]")
        ok(poll(lambda: fr.evaluate("getComputedStyle(document.querySelector('#xj .xj-box')).opacity") == "0", 3) and tb[1] == "none" and tb[2] == "回信笺", f"右上角的“信匣”收起来，左上角回信笺（{tb}）")
        time.sleep(1.2)
        B = fr.evaluate(BOX)
        if os.environ.get("DBG"):
            for e in B: print("   ", e["cls"], "|", e["text"][:40], "|", e["left"], e["right"])
        her = [e for e in B if "xj-b-say" in e["cls"] and " her" in e["cls"] and e["text"] == "我来过啦，冰箱里有布丁"]
        mine = [e for e in B if "xj-b-say" in e["cls"] and " me" in e["cls"] and e["text"].startswith("布丁喫了，園子裏的花也澆過了。")]
        ok(her and mine, f"她留的信在右、我写的在左（{[e['text'][:12] for e in B if 'xj-b-say' in e['cls']]}）")
        if her and mine:
            ok(her[0]["right"] <= 2 and her[0]["left"] > 40 and mine[0]["left"] <= 2, f"他在左、她在右：她的贴着右边、我的贴着左边，不带气泡（她 {her[0]['left']}/{her[0]['right']}，我 {mine[0]['left']}）")
            ok("KFS Jinhui" in mine[0]["font"] and "KFS Jinhui" not in her[0]["font"] and "KFS WenKai" in her[0]["font"], f"我的字是刻本体、繁体；她的是文楷（{mine[0]['font'][:30]} / {her[0]['font'][:30]}）")
        wk = [e for e in B if "xj-b-notice" in e["cls"] and "醒了" in e["text"]]
        ok(len(wk) >= 2 and wk[0]["seal"] and not wk[-1]["seal"], f"醒了那一行照原来那一页写；收进信匣的那一轮盖“阅”（{[(e['text'], e['seal']) for e in wk]}）")
        ok(any("xj-b-line" in e["cls"] and e["text"] == "去园子里浇了水" for e in B), "那一回干了什么的小字照摆")
        t_box = fr.evaluate(TYPE, "#xj .xj-boxp .xj-b-say.me:not(.simp) .xj-t p")
        t_box_l = fr.evaluate(TYPE, "#xj .xj-boxp .xj-b-line.me")
        ok(t_paper and t_paper == t_box, f"信笺上他写的字跟信匣里一模一样：一样大、一样的行距字距、一样宽、一样折行（纸上 {t_paper}，信匣 {t_box}）")
        ok(t_paper_l and t_paper_l == t_box_l, f"底下那几行小字也跟信匣里一样（纸上 {t_paper_l}，信匣 {t_box_l}）")
        th = [e for e in B if "xj-b-think" in e["cls"]]
        ok(th and th[0]["text"] == "心里话" and fr.evaluate("document.querySelector('#xj .xj-b-thought').hidden"), f"心里话收着（{th and th[0]['text']}）")
        fr.evaluate("document.querySelector('#xj .xj-b-think button').click()")
        ok(poll(lambda: fr.evaluate("(() => { const t = document.querySelector('#xj .xj-b-thought'); return !t.hidden && t.textContent; })()") == "她留了布丁", 3), "点开看：心里话摆出来")
        mm = [e for e in B if "xj-b-meme" in e["cls"]]
        corner = """(() => { const i = document.querySelector('#xj .xj-b-meme img'); if (!i || !i.src.startsWith('data:image/png') || !i.naturalWidth) return null;
          const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
          return [x.getImageData(1, 1, 1, 1).data[3], x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data[3]]; })()"""
        ok(poll(lambda: (fr.evaluate(corner) or [255])[0] == 0, 6) and fr.evaluate(corner)[1] == 255 and mm and " me" in mm[0]["cls"],
           f"表情包画在纸上：白底抠掉、透出纸来（角上透明，中间照旧），在我这一边（{fr.evaluate(corner)}）")
        shot(pg, "desk_6_box")
        # 我的语音：屋里写的，闹钟不念；还没念的点了念出来，念好了就在纸上放
        vb = "document.querySelector('#xj .xj-b-play')"
        ok(poll(lambda: fr.evaluate(vb + ".dataset.s") == "none" and "点这里念出来" in fr.evaluate(vb + ".textContent"), 8) and "聽得見嗎" in fr.evaluate(vb + ".parentNode.innerText"),
           f"我的语音：字照写（刻本体、繁体），前面一个点两道弧，还没念写“还没念，点这里念出来”（{fr.evaluate(vb + '.textContent')}）")
        fr.evaluate(vb + ".click()")
        ok(poll(lambda: fr.evaluate(vb + ".dataset.s") == "ready" and re.fullmatch(r"\d+″", fr.evaluate(vb + ".textContent")) is not None, 25), f"点了：用我的声音念出来，念好了写几秒（{fr.evaluate(vb + '.textContent')}）")
        fr.evaluate("(() => { window.__played = []; const op = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__played.push(String(this.src).slice(0, 16)); return op.call(this); }; })()")
        fr.evaluate(vb + ".scrollIntoView({ block: 'center' })"); time.sleep(0.4)
        px, py = fr.evaluate("(() => { const r = " + vb + ".getBoundingClientRect(); return [r.left + 12, r.top + r.height / 2]; })()")
        for _ in range(3):  # 软着画慢，手指那一下有时候没认上：没放就再点一回
            ftap(pg, fr, px, py)
            if poll(lambda: fr.evaluate("window.__played.length") >= 1, 4):
                break
            time.sleep(0.6)
        ok(fr.evaluate("window.__played.length") >= 1 and fr.evaluate("window.__played[0]").startswith("data:audio/"), f"再点：就在纸上放（声音是开封府递进来的，iPhone 上只认点在框里的那一下）（{fr.evaluate('window.__played')}）")
        # 点开一份文档：在纸上看，左上角回信匣
        fr.evaluate("document.querySelector('#xj .xj-b-doc button').click()")
        ok(poll(lambda: fr.evaluate("XJ.view()") == "R" and fr.evaluate("document.querySelector('#xj .xj-r-title').textContent") == "清单.md" and "布丁" in fr.evaluate("document.querySelector('#xj .xj-r-body').innerText"), 5),
           "点开文档：在纸上看（名字、正文）")
        rd = fr.evaluate("[document.querySelector('#xj .xj-r-meta').textContent, [...document.querySelectorAll('#xj .xj-r-body .xj-h')].map((x) => x.textContent), [...document.querySelectorAll('#xj .xj-r-body li')].map((x) => x.textContent), [...document.querySelectorAll('#xj .xj-r-acts button')].map((b) => b.textContent), document.querySelector('#xj .xj-top .xj-back').getAttribute('aria-label')]")
        ok(rd[0].startswith("Markdown，") and rd[1] == ["清单"] and rd[2] == ["布丁", "关窗"] and rd[3] == ["存到手机", "复制全文"] and rd[4] == "回信匣", f"标题、一条一条、存到手机、复制全文；左上角回信匣（{rd}）")
        shot(pg, "desk_6b_doc")
        fr.evaluate("document.querySelector('#xj .xj-top .xj-back').click()")
        ok(poll(lambda: fr.evaluate("XJ.view()") == "B", 3), "左上角：回到信匣")
        time.sleep(0.5)
        # 长按我写的那一句：出“复制”，复制的是原文
        fr.evaluate("(() => { const s = [...document.querySelectorAll('#xj .xj-b-say.me')].find((x) => x.innerText.includes('布丁喫了')); s.scrollIntoView({ block: 'center' }); })()")
        time.sleep(0.4)
        x, y = fr.evaluate("(() => { const s = [...document.querySelectorAll('#xj .xj-b-say.me')].find((x) => x.innerText.includes('布丁喫了')).querySelector('.xj-t').getBoundingClientRect(); return [s.left + 20, s.top + 10]; })()")
        pressed = fpress(pg, fr, cdp, x, y, lambda: fr.evaluate("!document.querySelector('#xj .xj-copy').hidden"))
        time.sleep(0.6)
        ok(pressed and fr.evaluate("!document.querySelector('#xj .xj-copy').hidden") and fr.evaluate("XJ.view()") == "B", "长按一句：冒出“复制”（手指抬起来也还在）")
        shot(pg, "desk_6c_copy")
        fr.evaluate("(() => { window.__copied = []; const o = document.execCommand.bind(document); document.execCommand = (c) => { if (c === 'copy') window.__copied.push(document.activeElement && document.activeElement.value); return o(c); }; })()")
        bx, by = fr.evaluate("(() => { const r = document.querySelector('#xj .xj-copy button').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
        ftap(pg, fr, bx, by)
        ok(poll(lambda: fr.evaluate("document.querySelector('#xj .xj-copy').hidden"), 3) and poll(lambda: "复制好了" in fr.evaluate("document.querySelector('#xj .xj-tip').textContent"), 3),
           "点“复制”：复制好了（纸底下冒一句）")
        cp = fr.evaluate("window.__copied")
        ok(cp and cp[-1] == "布丁吃了，园子里的花也浇过了。\n今天风大，记得关窗。", f"复制的是原文（简体，没转繁体）（{cp[-1:] if cp else cp}）")
        fr.evaluate("document.querySelector('#xj .xj-top .xj-back').click()")
        ok(poll(lambda: fr.evaluate("XJ.view()") == "L" and [r["body"] for r in fr.evaluate(PAPER)] == ["又醒了一回。\n\n聽得見嗎"], 4), f"左上角：回到信笺（纸上照旧）（{[r['body'] for r in fr.evaluate(PAPER)]}）")
        time.sleep(0.6)
        close_paper(fr)
        back_to_desk(fr)

        # ---- 卡片照存档写 ----
        c = card_of(pg, fr, "花盆")
        ok(c["sub"] == "钧窑六方盆 · 魏紫" and c["note"].startswith("魏紫，萌动，照料了一天（满三十天开花）。今天浇过水了。"), f"花盆：闹钟替他浇了水以后，照存档写（{c['note']}）")
        shot(pg, "desk_7_pot")
        back_to_desk(fr)
        c = card_of(pg, fr, "铜镜")
        ok(c["note"] == "" and fr.evaluate("document.getElementById('k-note').getBoundingClientRect().height") == 0 and c["acts"] == ["照镜子", "衣柜", "成就"],
           f"铜镜：卡片上不写字（那一身在照镜子那一页里），底下照镜子、衣柜、成就三颗（{c['note']}，{c['acts']}）")
        shot(pg, "desk_8_mirror")

        # ---- 铜镜那三颗：照镜子、衣柜（加、改、删、撤销、找）、成就 ----
        act = lambda t: fr.evaluate(f"[...document.querySelectorAll('#k-acts button')].find((b) => b.textContent === {json.dumps(t)}).click()")
        sheet_title = lambda: pg.evaluate("(document.querySelector('.kfs-desk .kfs-room-title') || {}).textContent || ''")
        close_sheet = lambda: pg.locator(".kfs-desk .kfs-sheet-box").get_by_role("button", name="关闭").click()
        act("照镜子")
        ok(poll(lambda: sheet_title() == "照镜子", 4), "点照镜子：照屋里卡片的样子弹出来")
        rows = pg.evaluate("[...document.querySelectorAll('.kfs-desk .kfs-dr-row')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim())")
        ok(len(rows) == 7 and rows[0] == "梳发 披发" and rows[3] == "衣柜 高领黑毛衣" and "镜中今日" in pg.locator(".kfs-desk .kfs-sheet-box").inner_text(), f"镜中今日：七行，照今天完成的那一身（{rows}）")
        shot_still(pg, "desk_8a_mirror")
        close_sheet()
        ok(poll(lambda: pg.locator(".kfs-desk .kfs-sheet-box").count() == 0, 4), "叉一点：回到案上")
        act("衣柜")
        ok(poll(lambda: sheet_title() == "衣柜", 4), "点衣柜：弹出衣柜那一页")
        box_ = pg.locator(".kfs-desk .kfs-sheet-box")
        def open_cat(cat):
            for _ in range(4):
                time.sleep(0.8)
                if box_.locator(f".kfs-dr-open[data-cat={cat}][aria-expanded=true]").count():
                    return True
                box_.locator(f".kfs-dr-open[data-cat={cat}]").click()
                if poll(lambda: box_.locator(f".kfs-dr-open[data-cat={cat}][aria-expanded=true]").count() == 1, 4):
                    return True
            return False
        open_cat("outfit")
        ok(poll(lambda: box_.locator(".kfs-dr-item[data-id=outfit_black_turtleneck] .kfs-dr-lock").count() == 1 and box_.locator(".kfs-dr-item[data-id=outfit_black_turtleneck] .kfs-dr-drop").count() == 0, 3),
           "翻全部 · 衣柜：成就要用的那件写着“锁”，没有叉")
        box_.locator(".kfs-dr-item[data-id=outfit_lightblue_roundrobe] button").first.click()
        ok(poll(lambda: box_.locator(".kfs-dr-edit").count() == 1 and "删不了：《游侠儿》要用" in box_.locator(".kfs-dr-edit").inner_text(), 3), "点一件：底下摊开改字；锁着的写为什么删不了")
        if SHOTS:
            box_.locator(".kfs-dr-edit").scroll_into_view_if_needed()
            shot_still(pg, "desk_8b0_edit")
        box_.locator(".kfs-dr-edit-name").fill("编的改名圆领袍")
        box_.locator(".kfs-dr-edit-desc").fill("编的描述，测试用")
        box_.locator(".kfs-dr-save").click()
        ok(poll(lambda: box_.locator(".kfs-dr-item[data-id=outfit_lightblue_roundrobe] .kfs-dr-name").inner_text().startswith("编的改名圆领袍") and box_.locator(".kfs-dr-edit").count() == 0, 3), "改了名字、描述：存上")
        box_.locator(".kfs-dr-addcats button", has_text="鞋履").click()
        box_.locator(".kfs-dr-new-name").fill("编的草鞋")
        box_.locator(".kfs-dr-new-desc").fill("编的，草编的")
        box_.locator(".kfs-dr-add").click()
        ok(poll(lambda: box_.locator(".kfs-dr-msg").inner_text() == "加上了：鞋履 · 编的草鞋", 3), "加一件：挑鞋履、写名字描述，加上")
        box_.locator(".kfs-dr-add").click()
        ok(poll(lambda: box_.locator(".kfs-dr-msg").inner_text() == "名字还空着", 3), "名字空着：不加")
        open_cat("shoes")
        mine = box_.locator(".kfs-dr-item", has_text="编的草鞋")
        ok(poll(lambda: mine.count() == 1 and "新添" in mine.inner_text(), 3), "翻全部 · 鞋履：新添的那一双在，标着“新添”")
        shoe_id = mine.get_attribute("data-id")
        free = box_.locator(".kfs-dr-list .kfs-dr-item:has(.kfs-dr-drop)").first
        free_id = free.get_attribute("data-id")
        free_name = free.locator(".kfs-dr-name").inner_text()
        it = box_.locator(f".kfs-dr-list .kfs-dr-item[data-id={free_id}]")
        def drop2():  # 点叉、再点“删掉”
            it.locator(".kfs-dr-drop").click()
            poll(lambda: it.locator(".kfs-dr-confirm").count() == 1, 3)
            it.locator(".kfs-dr-confirm").click()
        it.locator(".kfs-dr-drop").click()
        ok(poll(lambda: it.locator(".kfs-dr-confirm").count() == 1, 3) and it.count() == 1, "点叉一下：没删，叉变成“删掉”")
        ok(poll(lambda: it.locator(".kfs-dr-confirm").count() == 0 and it.locator(".kfs-dr-drop").count() == 1, 6) and it.count() == 1, "三秒不点：变回叉，还是没删")
        drop2()
        ok(poll(lambda: it.count() == 0 and f"删了「{free_name}」" in box_.locator(".kfs-dr-undo").inner_text(), 3), f"再点“删掉”才删：没了，上头一行“删了「{free_name}」 撤销”")
        box_.locator(".kfs-dr-undo-btn").click()
        ok(poll(lambda: it.count() == 1 and box_.locator(".kfs-dr-undo").count() == 0, 3), "撤销：放回去")
        drop2()
        gone_it = box_.locator(f".kfs-dr-goneitem[data-id={free_id}]")
        ok(poll(lambda: it.count() == 0 and gone_it.count() == 1 and free_name in gone_it.inner_text(), 3), "最底下“删掉的”里列着它")
        gone_it.locator(".kfs-dr-restore").click()
        ok(poll(lambda: it.count() == 1 and gone_it.count() == 0, 3), "“删掉的”里点放回去：回到衣柜里")
        drop2()
        ok(poll(lambda: it.count() == 0, 3), "再删一回，这回不放回去")
        box_.locator(".kfs-dr-search").fill("编的 草")
        ok(poll(lambda: box_.locator(".kfs-dr-hits .kfs-dr-item").count() == 1 and "鞋履" in box_.locator(".kfs-dr-hits .kfs-dr-item").inner_text(), 3), "找一件：几个词都得有，写着是哪一样的")
        shot_still(pg, "desk_8b_closet")
        close_sheet()
        act("成就")
        ok(poll(lambda: sheet_title() == "成就", 4), "点成就：弹出成就那一页")
        achs = pg.evaluate("[document.querySelectorAll('.kfs-desk .kfs-dr-ach').length, document.querySelectorAll('.kfs-desk .kfs-dr-ach.on').length, document.querySelector('.kfs-desk .kfs-dr-lit').textContent, document.querySelectorAll('.kfs-desk .kfs-dr-reward').length, !!document.querySelector('.kfs-desk .kfs-dr-ach.on[data-id=most_indecent_menswear]')]")
        ok(achs[0] == 60 and achs[1] >= 2 and achs[2] == f"点亮了 {achs[1]} 个，一共 60 个。" and achs[3] == 12 and achs[4], f"六十个全列，点亮的亮着；攒成就换来的十二样（{achs}）")
        shot_still(pg, "desk_8c_achv")
        close_sheet()
        time.sleep(3.0)  # 等衣柜那一条推上云端

        # ---- 家里的闹钟照她改过的衣柜：他翻衣柜看得见新添的、改了的名字和描述，删掉的不在 ----
        mock("/__debug/tool-queue?name=play_dressing_room&input=" + quote(json.dumps({"action": "catalog", "category": "shoes"})))
        mock("/__debug/tool-queue?name=play_dressing_room&input=" + quote(json.dumps({"action": "catalog", "category": "outfit"})))
        mock("/__debug/reply-queue?text=" + quote("翻了翻衣柜。"))
        c2 = len(calls())
        code, out = alarm(["wake"], home)
        sent = json.dumps([x["body"]["messages"] for x in calls()[c2:]], ensure_ascii=False)
        ok(code == 0 and f"编的草鞋 [{shoe_id}]——编的，草编的" in sent and "编的改名圆领袍 [outfit_lightblue_roundrobe]——编的描述，测试用" in sent and f"[{free_id}]" not in sent,
           "闹钟替他翻衣柜：新添的那双、改了的名字和描述都在，删掉的那件不在")
        back_to_desk(fr)
        fr.evaluate("document.getElementById('back').click()")
        ok(poll(lambda: pg.locator(".kfs-desk").count() == 0, 5) and last_chat(pg) == here, "关上：回到原来那段对话（信匣就在信笺上，没翻到狐宇宙那段对话）")
    finally:
        shutil.rmtree(home, ignore_errors=True)
    ok(not errors, f"页面没报错（{errors[:3]}）")
    ctx.close()


def no_gl(browser):
    # 画不出来的手机：一句话、一颗“去信匣”；信匣底下摆回便签纸
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    second_device(pg)
    nanya(pg)
    pg.locator(".kfs-nanya-row", has_text="狐宇宙").click()
    ok(poll(lambda: "画不出这间屋子" in pg.evaluate(LAYER)["note"], 60), f"没有 WebGL：那一层写一句画不出来（{pg.evaluate(LAYER)}）")
    ok(pg.locator(".kfs-desk-box").count() == 1 and pg.locator(".kfs-desk-close").count() == 1, "一颗“去信匣”，左上角开封府这头的叉")
    ok(pg.locator(".kfs-desk-lf-pool").count() == 1 and pg.locator(".kfs-desk-lf-gallery").count() == 1, "梦库、梦廊两个口子（南衙里那一行拿掉了，锦盒在画不出来的那一页上）")
    pg.locator(".kfs-desk-lf-pool").click()
    ok(poll(lambda: pg.locator(".kfs-desk .kfs-room .kfs-sheet-box").count() == 1 and pg.locator(".kfs-desk .kfs-room-title").inner_text() == "梦库", 4), "点梦库：照屋里卡片的样子弹出来")
    pg.locator(".kfs-desk .kfs-sheet-box").get_by_role("button", name="关闭").click()
    ok(poll(lambda: pg.locator(".kfs-desk .kfs-sheet-box").count() == 0 and pg.locator(".kfs-desk-box").count() == 1, 4), "叉一点：回到那一句话")
    shot(pg, "desk_9_nogl")
    pg.locator(".kfs-desk-box").click()
    ok(poll(lambda: last_chat(pg) == "hyz" and pg.locator(".kfs-fox-pad").count() == 1 and pg.locator(".kfs-desk").count() == 0, 5), "去信匣：那一层关上，翻到狐宇宙那段对话，底下摆回便签纸")
    ok(pg.evaluate("localStorage.getItem('kfs-desk-fail')") == "1" and pg.get_by_role("button", name="打开侧栏").count() == 1, "这台手机记着画不出来（下回翻到信匣也摆便签纸）；顶栏左边照旧是打开侧栏")
    pg.locator(".kfs-fox-pad-input").fill("这台画不出来，我在这儿留")
    pg.locator(".kfs-fox-pad-save").click(); time.sleep(1.0)
    ok((chat_by(pg, "hyz") or [{}])[-1].get("text") == "这台画不出来，我在这儿留", "便签纸上留的照样放进狐宇宙")
    ctx.close()


mock("/__debug/reset")
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=GL) if CHROME else p.chromium.launch(args=GL)
    run(browser)
    browser.close()
    plain = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-3d-apis"]) if CHROME else p.chromium.launch(args=["--no-sandbox", "--disable-3d-apis"])
    no_gl(plain)
    plain.close()
if synthetic:
    print(f"\n（框里收到的手指坐标对不上，有 {len(synthetic)} 下是在框里直接发的：{synthetic[:8]}）")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] else 0)
