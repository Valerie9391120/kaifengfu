# 藏音匣（见开发说明“藏音匣”那节）：真的浏览器、真的 voice 函数（跑在假 Supabase 里，假的 ElevenLabs 念出来是没声音的 mp3，一个字四分之一秒）。
# 聊天里长按他的语音条存进去、移出来；南衙里那一行点进去；第一页抽纸条（刻本体、繁体、年月日、放、放完不收、点空白收回、空的时候晃）；
# 往上划一根线串起来的全部（从新到旧、按月份、截短、圈里放、展开、移出）；删了对话还在；另一台设备上也有；跟着主题变色；
# 刻本体一块一块按需取；转繁体那一包只在点开藏音匣的时候取，转好的记在这台设备上；切到后台停下、回来接着放；
# 只有语气标签的语音也存得进、移得出；丁香入口点进去也取得到图和字；页面上没有被安全策略拦下的东西。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_cangyin.py
import json, re, sys, time
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
MENU = "() => [...document.querySelectorAll('.z-50 button')].map((b) => b.textContent.trim())"
BOX = "() => { const r = document.querySelector('.kfs-cangyin'); return r ? { ...r.dataset } : null; }"
HAS = "(t) => document.body.innerText.includes(t)"
# 存档里藏音匣的那几条（没上锁的那一份）
BOXKEYS = """() => new Promise((res) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').getAll();
  r.onsuccess = () => res(r.result.filter((x) => !x.del && (x.k.startsWith('kfs2:cyx:') || x.k.startsWith('kfs2:cyxa:'))).map((x) => [x.k, x.v])); }; })"""
# 记下开封府最近一回拿来放声音的那个东西（藏音匣跟聊天用的是不是同一个）
WATCH = r"""(() => {
  const play = HTMLMediaElement.prototype.play;
  window.__kfsPlayed = [];
  HTMLMediaElement.prototype.play = function () { window.__kfsAudio = this; if (!window.__kfsPlayed.includes(this)) window.__kfsPlayed.push(this); return play.apply(this, arguments); };
})()"""

def has(page, text): return page.evaluate(HAS, text)
def wait_has(page, text, want=True, timeout=4.0):
    end = time.time() + timeout
    while time.time() < end:
        if has(page, text) == want:
            return True
        page.wait_for_timeout(100)
    return has(page, text) == want
def box(page): return page.evaluate(BOX)
def wait_box(page, key, val, timeout=8.0):
    end = time.time() + timeout
    while time.time() < end:
        b = box(page)
        if b is not None and b.get(key) == val:
            return True
        page.wait_for_timeout(100)
    return False
def stored(page):
    kv = page.evaluate(BOXKEYS)
    metas = {k[len("kfs2:cyx:"):]: json.loads(v) for k, v in kv if k.startswith("kfs2:cyx:")}
    auds = {k[len("kfs2:cyxa:"):]: v for k, v in kv if k.startswith("kfs2:cyxa:")}
    return metas, auds
def voice_raw(page, src): return page.evaluate(KV, "kfs2:voice:" + src)
def reply(page, text, timeout=30000):
    say(page, "原样回：" + text)
    wait_js(page, "!!document.querySelector('.kfs-typing')", 8000)
    ok_ = wait_js(page, "!document.querySelector('.kfs-typing')", timeout)
    page.wait_for_timeout(600)
    return ok_
def menu_on(page, target):
    long_press(page, target)
    if not page.evaluate(MENU):          # 电脑上的浏览器松手那一下会补一下点击，把菜单点没了：右键再叫一次
        target.click(button="right"); page.wait_for_timeout(500)
    return page.evaluate(MENU)
def tap_menu(page, label):
    page.locator(".z-50 button", has_text=label).first.click(); page.wait_for_timeout(500)
def close_menu(page):
    if page.locator(".z-50").count():
        page.mouse.click(5, 840); page.wait_for_timeout(400)
def side(page):
    page.get_by_role("button", name="打开侧栏").click(); page.wait_for_timeout(600)
# 第四个格子点不点得到（侧栏开着、上面没盖着东西）；点不到就先拉开侧栏
TILE_ON_TOP = """() => { const b = document.querySelectorAll('.kfs-side-scroll .grid > button')[3]; if (!b) return false; const r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (top === b || b.contains(top)); }"""
def nanya_rows(page):
    if not page.evaluate(TILE_ON_TOP):
        side(page)
    page.locator(".kfs-side-scroll .grid > button").nth(3).click()
    page.locator(".kfs-nanya").wait_for(timeout=5000); page.wait_for_timeout(400)
    return page.evaluate("""() => [...document.querySelectorAll('.kfs-nanya .kfs-nanya-row')].map((b) => { const t = b.children[1].children;
      return { name: t[0].textContent, sub: t[1].textContent, soon: b.dataset.soon || '', svgs: b.querySelectorAll('svg').length }; })""")
def open_box(page):
    page.locator(".kfs-nanya-row", has_text="藏音匣").click()
    page.locator(".kfs-cangyin").wait_for(timeout=10000)
    return wait_box(page, "state", "ready", 10)
def center(page, sel, i=0, fy=0.5):
    return page.evaluate("([s, i, fy]) => { const r = document.querySelectorAll(s)[i].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * fy }; }", [sel, i, fy])
def tap(page, sel, i=0, fy=0.5):
    c = center(page, sel, i, fy)
    page.mouse.click(c["x"], c["y"])
def swipe(page, x, y0, y1, steps=10):
    page.mouse.move(x, y0); page.mouse.down()
    for i in range(1, steps + 1):
        page.mouse.move(x, y0 + (y1 - y0) * i / steps); time.sleep(0.016)
    page.mouse.up()
def tap_box(page): tap(page, ".cy-boxfront", 0, 0.62)
def loaded_scripts(page): return page.evaluate("performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\\/assets\\/(s2t|cangyin)-/.test(n)).map((n) => n.split('/').pop().split('-')[0])")
def font_faces(page): return page.evaluate("(() => { const f = [...document.fonts].filter((x) => x.family.replace(/\"/g, '') === 'KFS Jinhui'); return { all: f.length, loaded: f.filter((x) => x.status === 'loaded').length }; })()")
# 这台设备上转好的繁体（编号 → 字）
def trad_map(page): return json.loads(page.evaluate("localStorage.getItem('kfs-cyx-trad') || '{}'"))
def wait_trad(page, n, timeout=15.0):
    end = time.time() + timeout
    m = {}
    while time.time() < end:
        m = trad_map(page)
        if len(m) >= n:
            break
        page.wait_for_timeout(300)
    return m
# 安全策略（网页头上那一句 CSP）拦下了什么：记下来，最后看一眼
CSP = "window.__kfsCsp = []; document.addEventListener('securitypolicyviolation', (e) => window.__kfsCsp.push(e.violatedDirective + ' ' + e.blockedURI));"
# 纸条底下那张画布上画出来没有：抽几处看是不是不透明
PAPER_INK = """() => { const c = document.querySelector('.cy-strip canvas.cy-paper'); if (!c || !c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0, all = 0; for (let i = 3; i < d.length; i += 4 * 61) { all++; if (d[i] > 200) n++; } return n / all; }"""
# 另一台设备：从哪个入口进（丁香的入口是 dingxiang/）
def second_device_at(page, url):
    page.goto(url)
    page.get_by_text("进门先报上名来").wait_for(timeout=15000)
    page.locator("input[type=email]").fill("qing@example.com")
    page.locator("input[type=password]").fill("correct-horse")
    page.get_by_role("button", name="进府").click()
    page.get_by_text("对暗号").wait_for(timeout=15000)
    page.locator("form input").first.fill(PASS)
    page.get_by_role("button", name="开门").click()
    if "dingxiang" not in url:
        return kite(page)
    # 丁香的开屏：把小猪拉到最右边、松手进门
    knob = page.get_by_role("slider", name="把小猪拉到最右边，进开封府")
    knob.wait_for(timeout=30000)
    time.sleep(1.2)
    kb = knob.bounding_box(); kx, ky = kb["x"] + kb["width"] / 2, kb["y"] + kb["height"] / 2
    page.mouse.move(kx, ky); page.mouse.down(); page.mouse.move(kx + 400, ky, steps=10); time.sleep(0.7); page.mouse.up()
    knob.wait_for(state="detached", timeout=10000)
    page.get_by_placeholder("说话，我听着").wait_for(timeout=10000)
    time.sleep(0.5)
CN = "〇一二三四五六七八九"
def cn_num(n): return CN[n] if n < 10 else "十" if n == 10 else "十" + CN[n - 10] if n < 20 else CN[n // 10] + "十" + (CN[n % 10] if n % 10 else "")
def cn_date(ms):   # 照“手机”上的时区（mailkit 的 IPHONE 是都柏林）
    t = datetime.fromtimestamp(ms / 1000, ZoneInfo("Europe/Dublin"))
    return "".join(CN[int(c)] for c in str(t.year)) + "年" + cn_num(t.month) + "月" + cn_num(t.day) + "日"

# 很长的一条（编的，三百字上下，没过念语音的四百字）：纸条上展开了看会不会出屏幕
VERY_LONG = ("今天下午一个人去江边走了一圈。风很大，水是灰绿色的，对岸的楼一层一层叠上去，像谁随手搭的积木。"
             "走到那座旧桥底下的时候，想起你说过小时候最怕过桥，总觉得桥会忽然断掉，要攥着大人的衣角一步一步挪。"
             "我在桥洞里站了一会儿，听上面的车一辆一辆开过去，轰隆隆的，桥也没有断。"
             "后来天快黑了，路灯一盏一盏亮起来，卖烤红薯的推着车从我身边过去，香得要命，我买了一个，"
             "剥开来热气直往脸上扑，烫得我直吸气。想着要是你在，肯定要抢过去咬第一口，再嫌它太烫塞回给我。"
             "回来的路上一直在想你今天过得好不好，有没有好好吃饭，写东西写到几点。别熬太晚，明天还长着呢，我也在。")
LONG = "今天在想，要是能真的坐在你旁边就好了。不用说什么，你写你的东西，我在边上看着，偶尔给你倒杯水。你写累了，转过头来，我就在。就这样待一下午，天黑了也不开灯。"

with sync_playwright() as p:
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    ctx.add_init_script(WATCH)
    ctx.add_init_script(CSP)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    first_time(pa)

    # ================= 准备：开“他能发语音”，他发几条语音 =================
    side(pa)
    pa.get_by_text("API", exact=True).click(); pa.locator(".kfs-voice-set").wait_for(timeout=5000); pa.wait_for_timeout(800)
    pa.get_by_role("switch", name="他能发语音").click(); pa.wait_for_timeout(500)
    pa.get_by_role("button", name="关闭").click(); pa.wait_for_timeout(400)
    pa.locator("div.absolute.inset-0.z-30").click(); pa.wait_for_timeout(600)
    ok(reply(pa, "[VOICE]\n[softly] 今天降温了，出门把围巾带上。") and reply(pa, "先打一句字\n[SPLIT]\n[VOICE]\n嗯，晚安。") and reply(pa, "[VOICE]\n" + LONG, 60000),
       "他发了三条语音（第二条前面还有一句字）")
    vs = pa.evaluate("[...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].map((b) => b.dataset.state)")
    ok(vs == ["ready"] * 3, f"三条语音都念好了（{vs}）")
    cid, msgs = chat_of(pa)
    hims = [m for m in msgs if m.get("role") == "him"]

    # ================= 聊天里长按：存入藏音匣 =================
    m0 = menu_on(pa, pa.locator(".kfs-chat-rows .kfs-voice").nth(0))
    ok(m0 == ["转文字", "存入藏音匣", "复制", "重新回答"], f"长按念好了的语音条：转文字后面多一项“存入藏音匣”（{m0}）")
    t0 = time.time()
    tap_menu(pa, "存入藏音匣")
    said = wait_has(pa, "已存入藏音匣")
    metas, auds = stored(pa)
    ok(said and len(metas) == 1 and len(auds) == 1, f"点了：冒一句“已存入藏音匣”，存档里多了一条和它的声音（{len(metas)} 条，{len(auds)} 份声音）")
    eid, e0 = next(iter(metas.items())) if metas else ("", {})
    src0 = f"{hims[0]['id']}.0" if hims else ""
    ok(e0.get("v") == 1 and e0.get("src") == src0 and e0.get("chat") == cid and e0.get("text") == "今天降温了，出门把围巾带上。" and "trad" not in e0 and e0.get("at") == hims[0].get("ts") and e0.get("dur", 0) > 0,
       f"存的那一条：从哪条语音来、哪段对话、他说那句的时候、转出来的字（标签摘了）、几秒；繁体不存（{e0}）")
    ok(auds.get(eid) == voice_raw(pa, src0) and auds.get(eid), "声音是整份拷了一份（跟聊天里那一条一模一样）")
    m0b = menu_on(pa, pa.locator(".kfs-chat-rows .kfs-voice").nth(0))
    ok(m0b == ["转文字", "移出藏音匣", "复制", "重新回答"], f"存过的再长按：那一项写“移出藏音匣”（{m0b}）")
    tap_menu(pa, "移出藏音匣")
    gone = wait_has(pa, "已移出藏音匣")
    metas, auds = stored(pa)
    ok(gone and not metas and not auds and voice_raw(pa, src0), "点“移出藏音匣”：两样都删了，聊天里那一条的声音还在")
    # 他的字：没有这一项
    mt = menu_on(pa, pa.locator(".kfs-chat-rows [data-kfs-bubble='him']", has_text="先打一句字").first)
    ok("存入藏音匣" not in mt and "移出藏音匣" not in mt, f"长按他打的字：没有藏音匣那一项（{mt}）")
    close_menu(pa)
    # 三条都存进去（长的那条先存，好看次序是照他说的时候排的、不是照存的先后）
    for i in [2, 0, 1]:
        menu_on(pa, pa.locator(".kfs-chat-rows .kfs-voice").nth(i))
        tap_menu(pa, "存入藏音匣")
        pa.wait_for_timeout(300)
    metas, auds = stored(pa)
    ok(len(metas) == 3 and len(auds) == 3, f"三条都存进去了（{len(metas)}）")
    ok(not [s for s in loaded_scripts(pa) if s in ("s2t", "cangyin")], f"还没点开藏音匣：那一页、转繁体那一包都没取（{loaded_scripts(pa)}）")
    # 先在聊天里放一条（后面看藏音匣用的是不是同一个放声音的东西）
    pa.locator(".kfs-chat-rows .kfs-voice").nth(1).click(); pa.wait_for_timeout(600)
    pa.locator(".kfs-chat-rows .kfs-voice").nth(1).click(); pa.wait_for_timeout(300)
    ok(pa.evaluate("window.__kfsPlayed.length") == 1, "聊天里放了一条他的语音")

    # ================= 南衙：藏音匣那一行 =================
    side(pa)
    rs = nanya_rows(pa)
    vb = next((r for r in rs if r["name"] == "藏音匣"), None)
    ok(vb and vb["sub"] == "藏了 3 条" and vb["soon"] == "" and vb["svgs"] == 2, f"南衙里藏音匣那一行能点了：小字写“藏了 3 条”，右边带箭头（{vb}）")
    opened = open_box(pa)
    ok(opened and pa.locator(".kfs-nanya").count() == 0, "点进去：菜单收起，藏音匣那一页滑进来，匣子画完")
    ok(pa.locator(".cy-boxback path").count() == 4 and pa.locator(".cy-boxfront path").count() == 1 and pa.locator(".cy-boxseam path").count() == 1,
       "匣子是几笔线描：前脸一笔、两边往后收两笔、后沿一笔（还有匣口那一块淡的），匣盖和匣身那道缝单独一层")
    ok(wait_js(pa, "(() => { const h = document.querySelector('.cy-hint'); return !!h && +getComputedStyle(h).opacity > 0.5; })()", 3000), "底下一个很淡的往上的小箭头（往上划看全部）")
    # 转繁体：点开以后（匣子画完）才取那一包，转好的记在这台设备上，存档里那几条不动
    tm = wait_trad(pa, 3)
    trads = sorted(tm.values())
    metas_t, _ = stored(pa)
    ok(len(tm) == 3 and set(tm) == set(metas) and "今天降溫了，出門把圍巾帶上。" in trads and "嗯，晚安。" in trads and any("說什麼" in t and "邊上看着" in t for t in trads),
       f"点开藏音匣：没转过繁体的那几条转了，记在这台设备上（OpenCC 标准繁体：{trads[:2]}）")
    ok(metas_t == metas, "存档里那几条一个字没动（不往里写繁体：别的设备上移出了的不会被这边写回来）")
    ok("s2t" in loaded_scripts(pa) and "cangyin" in loaded_scripts(pa), f"那一页、转繁体那一包是这时候才取的（{loaded_scripts(pa)}）")

    # ================= 第一页：抽纸条 =================
    tap_box(pa)
    drew = wait_box(pa, "state", "open", 6)
    b = box(pa)
    cur = metas.get(b.get("cur"), {}) if b else {}
    words = pa.evaluate("document.querySelector('.cy-words').textContent")
    date = pa.evaluate("document.querySelector('.cy-date').textContent")
    ok(drew and cur and words == tm.get(b.get("cur")) and date == cn_date(cur.get("at", 0)),
       f"点匣子：抽出一张纸条，上面是那一条的繁体（{words[:12]}…），右下角年月日写成汉字（{date}）")
    ok(pa.evaluate("(() => { const s = document.querySelector('.cy-strip'); return getComputedStyle(s.querySelector('.cy-words')).fontFamily.includes('KFS Jinhui') && !!s.querySelector('canvas.cy-paper') && s.querySelector('canvas.cy-paper').width > 0; })()"),
       "纸条用刻本体写字；残纸画在纸条底下一张画布上")
    ok(pa.locator(".cy-strip .cy-bar").count() == 0 and pa.locator(".cy-strip .cy-play").count() == 1, "纸条上只有播放键、字和年月日，没有进度那根线")
    ink = pa.evaluate(PAPER_INK)
    ok(ink > 0.5, f"残纸真的画上了（画布上不透明的地方占 {ink:.0%}）")
    ff = font_faces(pa)
    ok(ff["all"] > 40 and 0 < ff["loaded"] < ff["all"] / 2, f"刻本体是一块一块的，用到哪些字才取哪几块（{ff['loaded']} / {ff['all']} 块）")
    ok(pa.evaluate("document.fonts.check('17.5px \"KFS Jinhui\"', document.querySelector('.cy-words').textContent)"), "这一张上的字，刻本体那几块都取回来了")
    # 放
    tap(pa, ".cy-play")
    pa.wait_for_timeout(500)
    b = box(pa)
    ok(b.get("playing") == b.get("cur") and pa.evaluate("!window.__kfsAudio.paused"), f"点播放：放起来（{b}）")
    ok(pa.evaluate("window.__kfsPlayed.length") == 1, f"藏音匣放声音用的是开封府那一个放声音的东西（就一个：{pa.evaluate('window.__kfsPlayed.length')}）")
    tap(pa, ".cy-play")
    pa.wait_for_timeout(300)
    ok(box(pa).get("playing") is None and pa.evaluate("window.__kfsAudio.paused"), "再点：停")
    # 收回去，换一张短的放到头
    pa.mouse.click(40, 800);
    back = wait_box(pa, "state", "ready", 5)
    ok(back and pa.evaluate("getComputedStyle(document.querySelector('.cy-strip')).display") == "none", "点空白：纸条收回匣子里")
    short = next((k for k, m in metas.items() if m.get("text") == "嗯，晚安。"), "")
    got = False
    for _ in range(20):
        tap_box(pa)
        wait_box(pa, "state", "open", 6)
        if box(pa).get("cur") == short:
            got = True
            break
        pa.mouse.click(40, 800); wait_box(pa, "state", "ready", 5)
    ok(got, "抽几回抽到那条短的（不跟上一回抽到同一条）")
    if got:
        tap(pa, ".cy-play")
        ended = wait_js(pa, "!document.querySelector('.kfs-cangyin').dataset.playing", 8000)
        pa.wait_for_timeout(400)
        b = box(pa)
        ok(ended and b.get("state") == "open" and b.get("cur") == short, f"放完了不收：纸条留在外面（{b}）")
        tap(pa, ".cy-play")
        pa.wait_for_timeout(400)
        ok(box(pa).get("playing") == short, "再点从头放")
        wait_js(pa, "!document.querySelector('.kfs-cangyin').dataset.playing", 8000)
    pa.screenshot(path="/tmp/cangyin_e2e_strip.png")

    # ================= 往上划：一根线串起来的全部 =================
    swipe(pa, 200, 700, 300)
    flipped = wait_box(pa, "page", "1", 3)
    pa.wait_for_timeout(600)
    order = pa.evaluate("[...document.querySelectorAll('.cy-vrow')].map((e) => e.dataset.id)")
    want = [k for k, _ in sorted(metas.items(), key=lambda kv: -kv[1]["at"])]
    ok(flipped and order == want, f"往上划：全部，从新到旧（照他说的时候，不照存的先后）")
    mons = pa.evaluate("[...document.querySelectorAll('.cy-mon')].map((e) => e.textContent)")
    ok(len(mons) == 1 and re.fullmatch("[一二三四五六七八九十]+月", mons[0] or ""), f"按月份断开，标着月份（{mons}）")
    qs = pa.evaluate("[...document.querySelectorAll('.cy-vrow .cy-q')].map((e) => e.textContent)")
    long_id = next((k for k, m in metas.items() if m.get("text") == LONG), "")
    lq = qs[order.index(long_id)] if long_id in order else ""
    ok(all(q.startswith("“") and q.endswith("”") for q in qs) and lq.endswith("…”") and "嗯，晚安。" in "".join(qs),
       f"一句一行，带前后引号；长的截短，省略号挨着后引号（{lq}）")
    meta = pa.evaluate("[...document.querySelectorAll('.cy-vrow .cy-meta')].map((e) => e.innerText)")
    ok(all(re.match(r"\d{4} / \d{2} / \d{2}\s+\d+秒", x) for x in meta), f"下面一行是日期和几秒（{meta[0]}）")
    # 圈里放
    i_long = order.index(long_id) if long_id in order else 0
    tap(pa, ".cy-ring", i_long)
    pa.wait_for_timeout(900)
    b = box(pa)
    off = pa.evaluate("(i) => parseFloat(document.querySelectorAll('.cy-prog')[i].style.strokeDashoffset)", i_long)
    ok(b.get("playing") == long_id and b.get("open") == long_id and off < 103.6, f"点圈：放起来，圈一边放一边画满，那一句整句展开（{b}，{off:.1f}）")
    full = pa.evaluate("(i) => document.querySelectorAll('.cy-vrow .cy-q')[i].textContent", i_long)
    ok(full == "“" + LONG + "”" and pa.evaluate("(i) => +getComputedStyle(document.querySelectorAll('.cy-out')[i]).opacity > 0.5", i_long),
       "展开的是整句；右下角露出“移出”")
    pa.screenshot(path="/tmp/cangyin_e2e_list.png")
    # 放着的时候切到后台：开封府那边停下放声音的东西，这一页上跟着停；回来再点接着放
    t_before = pa.evaluate("window.__kfsAudio.currentTime")
    pa.evaluate("window.__away(true)"); pa.wait_for_timeout(400)
    b = box(pa)
    on_cls = pa.evaluate("(i) => document.querySelectorAll('.cy-vrow')[i].classList.contains('cy-on')", i_long)
    ok(pa.evaluate("window.__kfsAudio.paused") and b.get("playing") is None and not on_cls, f"放着的时候切到后台：停下，圈上的两竖变回三角（{b}）")
    pa.evaluate("window.__away(false)"); pa.wait_for_timeout(400)
    tap(pa, ".cy-ring", i_long)
    pa.wait_for_timeout(500)
    t_after = pa.evaluate("window.__kfsAudio.currentTime")
    ok(box(pa).get("playing") == long_id and t_after >= t_before > 0.3, f"回来再点：接着放，不从头（{t_before:.1f} → {t_after:.1f} 秒）")
    tap(pa, ".cy-ring", i_long)
    pa.wait_for_timeout(300)
    ok(box(pa).get("playing") is None, "再点圈：停")
    pa.mouse.click(200, 800); pa.wait_for_timeout(600)
    ok(box(pa).get("open") is None, "点空白：收起")
    # 短的那一条在第二页上放到头：圈画满、淡掉，回到空圈
    i_short = order.index(short) if short in order else 0
    tap(pa, ".cy-ring", i_short)
    played = wait_box(pa, "playing", order[i_short], 3)
    ended = wait_js(pa, "!document.querySelector('.kfs-cangyin').dataset.playing", 8000)
    pa.wait_for_timeout(700)
    ring = pa.evaluate("(i) => { const r = document.querySelectorAll('.cy-vrow')[i]; return [r.classList.contains('cy-on'), parseFloat(r.querySelector('.cy-prog').style.strokeDashoffset)]; }", i_short)
    ok(played and ended and not ring[0] and ring[1] > 103, f"第二页上放到头：圈画满了淡掉，回到空圈、三角（{ring}）")
    # 点那句话：收起；再点：展开（不放）
    tap(pa, ".cy-vrow .cy-q", i_short); pa.wait_for_timeout(500)
    if box(pa).get("open") == order[i_short]:
        tap(pa, ".cy-vrow .cy-q", i_short); pa.wait_for_timeout(500)
    tap(pa, ".cy-vrow .cy-q", i_short)
    pa.wait_for_timeout(600)
    b = box(pa)
    ok(b.get("open") == order[i_short] and b.get("playing") is None, "点那句话：展开，不放")
    # 移出：正好是第一页上摆着的那一条
    tap(pa, ".cy-out", i_short)
    pa.wait_for_timeout(900)
    metas2, auds2 = stored(pa)
    ok(order[i_short] not in metas2 and order[i_short] not in auds2 and len(metas2) == 2 and pa.locator(".cy-vrow").count() == 2,
       "点“移出”：这一行收掉，存档里那一条和它的声音都删了")
    # 往下拉回第一页
    swipe(pa, 200, 150, 650, 14)
    ok(wait_box(pa, "page", "0", 3), "翻到最上面再往下拉：回第一页")
    pa.wait_for_timeout(800)
    b = box(pa)
    if got:
        ok(b.get("state") == "ready" and b.get("cur") is None and pa.evaluate("getComputedStyle(document.querySelector('.cy-strip')).display") == "none",
           f"第一页上摆着的正是移出的那一条：收回匣子里了（{b}）")

    # ================= 返回 =================
    pa.locator(".cy-back").click(); pa.wait_for_timeout(700)
    ok(pa.locator(".kfs-cangyin").count() == 0 and pa.evaluate("window.__kfsAudio.paused"), "左上角返回：那一页收掉，声音停着")
    rs = nanya_rows(pa)
    vb = next((r for r in rs if r["name"] == "藏音匣"), None)
    ok(vb and vb["sub"] == "藏了 2 条", f"南衙里那一行跟着变：藏了 2 条（{vb and vb['sub']}）")
    pa.get_by_role("button", name="关闭").click(); pa.wait_for_timeout(400)
    # 聊天里那一条也不再是“移出”
    pa.locator("div.absolute.inset-0.z-30").click(); pa.wait_for_timeout(600)
    left = [k for k in metas if k not in metas2]
    gone_src = metas[left[0]]["src"] if left else ""
    idx = [f"{h['id']}.{j}" for h in hims for j, it in enumerate(h.get("items") or []) if it.get("type") == "voice"]
    pos = idx.index(gone_src) if gone_src in idx else -1
    if pos >= 0:
        mm = menu_on(pa, pa.locator(".kfs-chat-rows .kfs-voice").nth(pos))
        ok("存入藏音匣" in mm, f"在藏音匣里移出的那一条，聊天里长按又是“存入藏音匣”（{mm}）")
        close_menu(pa)
    else:
        ok(False, f"找不到移出的那一条在聊天里的位置（{gone_src}，{idx}）")

    # ================= 删了对话还在 =================
    side(pa)
    item = pa.locator(".kfs-history button").nth(1)
    long_press(pa, item)
    pa.get_by_role("menuitem", name=re.compile("删除")).click(); pa.wait_for_timeout(300)
    if pa.get_by_role("menuitem", name=re.compile("再点一次")).count():
        pa.get_by_role("menuitem", name=re.compile("再点一次")).click()
    pa.wait_for_timeout(1200)
    deleted = pa.evaluate(KV, "kfs2:chat:" + cid) is None and voice_raw(pa, src0) is None
    metas3, auds3 = stored(pa)
    ok(deleted and len(metas3) == 2 and len(auds3) == 2, f"删了那段对话：聊天里的语音跟着删了，藏音匣里的两条还在（{deleted}，{len(metas3)}）")
    nanya_rows(pa)
    open_box(pa)
    swipe(pa, 200, 700, 300)
    wait_box(pa, "page", "1", 3); pa.wait_for_timeout(500)
    tap(pa, ".cy-ring", 0)
    pa.wait_for_timeout(700)
    ok(box(pa).get("playing") and not pa.evaluate("window.__kfsAudio.paused"), "删了对话以后，藏音匣里的照样放得出来")
    tap(pa, ".cy-ring", 0)
    pa.locator(".cy-back").click(); pa.wait_for_timeout(600)

    # ================= 另一台设备 =================
    ctx2 = browser.new_context(**IPHONE)
    ctx2.add_init_script(STUB)
    ctx2.add_init_script(CSP)
    pb = ctx2.new_page()
    pb.on("pageerror", lambda e: errors.append("[另一台] " + str(e)))
    bad = []
    pb.on("response", lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 and "/assets/" in r.url else None)
    pb.on("requestfailed", lambda r: bad.append(f"失败 {r.url}") if "/assets/" in r.url and not r.url.startswith("blob:") else None)
    second_device_at(pb, BASE + "dingxiang/")   # 另一台用丁香的入口进
    end = time.time() + 15
    synced = False
    while time.time() < end and not synced:
        m4, a4 = stored(pb)
        synced = len(m4) == 2 and len(a4) == 2
        if not synced:
            pb.wait_for_timeout(500)
    side(pb)
    rs2 = nanya_rows(pb)
    vb2 = next((r for r in rs2 if r["name"] == "藏音匣"), None)
    ok(synced and vb2 and vb2["sub"] == "藏了 2 条", f"另一台设备上：藏音匣里也是那两条（{vb2 and vb2['sub']}）")
    ok(open_box(pb), "另一台设备（丁香的入口）点进去：匣子画出来")
    tm2 = wait_trad(pb, 2)
    tap_box(pb)
    drew2 = wait_box(pb, "state", "open", 6)
    pb.wait_for_timeout(600)
    w2 = pb.evaluate("document.querySelector('.cy-words').textContent")
    ok(drew2 and len(tm2) == 2 and w2 in tm2.values() and pb.evaluate(PAPER_INK) > 0.5 and pb.evaluate("document.fonts.check('17.5px \"KFS Jinhui\"', document.querySelector('.cy-words').textContent)"),
       f"丁香入口：繁体自己转（这台设备记着），纸条、残纸、刻本体都取得到（{w2[:8]}…）")
    pb.screenshot(path="/tmp/cangyin_e2e_dingxiang_entry.png")
    pb.mouse.click(40, 800); wait_box(pb, "state", "ready", 5)
    swipe(pb, 200, 700, 300)
    wait_box(pb, "page", "1", 3); pb.wait_for_timeout(500)
    ok(pb.locator(".cy-vrow").count() == 2, "另一台设备上点开：列表里两条")
    pb.locator(".cy-back").click(); pb.wait_for_timeout(400)
    csp2 = pb.evaluate("window.__kfsCsp")
    ok(not bad and not csp2, f"丁香入口：图、刻本体、两包都取到了，没有被安全策略拦下的（{bad[:3]}，{csp2[:3]}）")
    # 退出登录：这台设备上转好的繁体（是她存的那几句话）跟本地存档一起清掉
    had_trad = bool(trad_map(pb))
    if not pb.get_by_role("button", name="头像与设置").is_visible():
        side(pb)
    pb.get_by_role("button", name="头像与设置").click()
    pb.get_by_role("button", name="退出登录").click()
    pb.get_by_role("button", name=re.compile("再点一次")).click()
    pb.get_by_text("进门先报上名来").wait_for(timeout=15000)
    ok(had_trad and pb.evaluate("localStorage.getItem('kfs-cyx-trad')") is None, "另一台退出登录：这台设备上转好的繁体跟本地存档一起清掉")
    ctx2.close()

    # ================= 跟着主题变色 =================
    colors = {}
    nanya_rows(pa)
    for t in ["qinglv", "dingxiang", "heiye"]:
        pa.evaluate("(t) => document.documentElement.setAttribute('data-kfs-theme', t)", t)
        open_box(pa)
        colors[t] = pa.evaluate("(() => { const s = getComputedStyle(document.querySelector('.cy-stage')), p = getComputedStyle(document.querySelector('.cy-boxfront path')); return [s.backgroundColor, p.stroke]; })()")
        pa.screenshot(path=f"/tmp/cangyin_e2e_{t}.png")
        pa.locator(".cy-back").click(); pa.wait_for_timeout(500)
        nanya_rows(pa)
    pa.evaluate("document.documentElement.setAttribute('data-kfs-theme', 'qinglv')")
    ok(colors["qinglv"] == ["rgb(222, 230, 216)", "rgb(58, 98, 90)"] and colors["dingxiang"] == ["rgb(241, 232, 244)", "rgb(104, 80, 166)"] and colors["heiye"] == ["rgb(13, 18, 33)", "rgb(196, 212, 240)"],
       f"跟着开封府的主题变色：青绿、丁香、黑夜各一套（{colors}）")

    # ================= 空的时候 =================
    open_box(pa)
    swipe(pa, 200, 700, 300)
    wait_box(pa, "page", "1", 3); pa.wait_for_timeout(500)
    for _ in range(2):
        tap(pa, ".cy-vrow .cy-q", 0); pa.wait_for_timeout(500)
        tap(pa, ".cy-out", 0); pa.wait_for_timeout(800)
    ok(pa.locator(".cy-vrow").count() == 0 and pa.evaluate("getComputedStyle(document.querySelector('.cy-deckempty')).display") == "block", "都移出了：列表上写“这里还空着。”")
    swipe(pa, 200, 150, 650, 14); wait_box(pa, "page", "0", 3); pa.wait_for_timeout(400)
    tap_box(pa)
    pa.wait_for_timeout(500)
    ok(box(pa).get("state") == "ready" and pa.evaluate("+getComputedStyle(document.querySelector('.cy-empty')).opacity > 0.5"),
       "空的时候点匣子：晃一晃，冒一句怎么存（不抽纸条）")
    metas5, auds5 = stored(pa)
    ok(not metas5 and not auds5, "存档里藏音匣的东西都没了")
    pa.locator(".cy-back").click(); pa.wait_for_timeout(500)
    if pa.locator("div.absolute.inset-0.z-30").count():   # 返回是回到侧栏：收起侧栏回聊天
        pa.locator("div.absolute.inset-0.z-30").click(); pa.wait_for_timeout(600)

    # ================= 只有语气标签的语音（念出来是一声笑）：存得进、看得见、移得出 =================
    ok(reply(pa, "[VOICE]\n[soft chuckle]"), "他发了一条只有语气标签的语音")
    vlast = pa.locator(".kfs-chat-rows .kfs-voice").last
    ok(wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return !!v && v.dataset.state === 'ready'; })()", 10000), "念好了（ElevenLabs 念的是那一声笑）")
    mm = menu_on(pa, vlast)
    if "存入藏音匣" in mm:
        tap_menu(pa, "存入藏音匣")
    m6, a6 = stored(pa)
    e6 = next(iter(m6.values())) if m6 else {}
    ok("存入藏音匣" in mm and len(m6) == 1 and len(a6) == 1 and e6.get("text") == "……", f"存进去：字摘干净了没有，写“……”（{e6.get('text')}）")
    nanya_rows(pa)
    open_box(pa)
    swipe(pa, 200, 700, 300)
    wait_box(pa, "page", "1", 3); pa.wait_for_timeout(500)
    qs6 = pa.evaluate("[...document.querySelectorAll('.cy-vrow .cy-q')].map((e) => e.textContent)")
    ok(qs6 == ["“……”"], f"第二页上看得见这一条（{qs6}）")
    tap(pa, ".cy-vrow .cy-q", 0); pa.wait_for_timeout(500)
    tap(pa, ".cy-out", 0); pa.wait_for_timeout(900)
    m7, a7 = stored(pa)
    ok(not m7 and not a7 and pa.locator(".cy-vrow").count() == 0, "也移得出")
    pa.locator(".cy-back").click(); pa.wait_for_timeout(500)
    if pa.locator("div.absolute.inset-0.z-30").count():
        pa.locator("div.absolute.inset-0.z-30").click(); pa.wait_for_timeout(600)

    # ================= 很长的一条：纸条上展开了也不出屏幕 =================
    ok(reply(pa, "[VOICE]\n" + VERY_LONG, 60000), f"他发了一条很长的语音（{len(VERY_LONG)} 个字）")
    wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return !!v && v.dataset.state === 'ready'; })()", 15000)
    menu_on(pa, pa.locator(".kfs-chat-rows .kfs-voice").last)
    tap_menu(pa, "存入藏音匣")
    nanya_rows(pa)
    open_box(pa)
    tap_box(pa)
    wait_box(pa, "state", "open", 6); pa.wait_for_timeout(400)
    GEOM = "(() => { const s = document.querySelector('.cy-strip').getBoundingClientRect(), w = document.querySelector('.cy-words'); return { bottom: s.bottom, top: s.top, h: innerHeight, clamp: getComputedStyle(w).webkitLineClamp, cut: w.scrollHeight > w.clientHeight + 2, lines: Math.round(w.clientHeight / parseFloat(getComputedStyle(w).lineHeight)) }; })()"
    g0 = pa.evaluate(GEOM)
    tap(pa, ".cy-words", 0, 0.3)
    pa.wait_for_timeout(400)
    g1 = pa.evaluate(GEOM)
    box_bottom = pa.evaluate("document.querySelector('.cy-boxfront').getBoundingClientRect().bottom")
    ok(g0["lines"] == 4 and g0["cut"] and g1["lines"] > 4 and g1["bottom"] <= g1["h"] - 11 and g1["top"] >= box_bottom,
       f"很长的一条：收着四行；点字展开，照屏幕放得下的行数摆（{g1['lines']} 行），纸条不出屏幕、不盖住匣子（底边 {g1['bottom']:.0f} / {g1['h']}）")
    pa.screenshot(path="/tmp/cangyin_e2e_long.png")
    tap(pa, ".cy-play")
    pa.wait_for_timeout(900)
    g2 = pa.evaluate(GEOM)
    ok(box(pa).get("playing") and g2["bottom"] <= g2["h"] - 11, f"展开着放：纸条上前一点也不出屏幕（底边 {g2['bottom']:.0f}）")
    tap(pa, ".cy-play"); pa.wait_for_timeout(300)
    tap(pa, ".cy-words", 0, 0.3)
    pa.wait_for_timeout(400)
    g3 = pa.evaluate(GEOM)
    ok(g3["lines"] == 4, "再点字：收回四行")
    pa.mouse.click(40, 840); wait_box(pa, "state", "ready", 5)
    pa.locator(".cy-back").click(); pa.wait_for_timeout(500)

    csp = pa.evaluate("window.__kfsCsp")
    ok(not csp, f"整趟下来没有被安全策略（CSP）拦下的东西（{csp[:3]}）")

    browser.close()

print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] or errors else 0)
