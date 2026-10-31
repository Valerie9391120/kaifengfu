# 图画院：他画的画都收在南衙里这一栏（卿卿 10 月 30 日晚上要的，见 src/tuhua.js）。
# 真的浏览器、真的 draw 函数（跑在假 Supabase 里）、假的 ElevenLabs，同 tests/e2e_draw.py。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_tuhua.py [截图目录]
import json, os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SHOTS = sys.argv[1] if len(sys.argv) > 1 else ""
ART = os.path.abspath(os.path.join(HERE, "..", ".cache", "draw-art"))
DONE = os.path.abspath(os.path.join(HERE, "..", "static", "oauth", "done.html"))
QUIET = "!document.querySelector('.kfs-typing')"
HIS = """() => [...document.querySelectorAll('.kfs-chat-rows [data-kfs-bubble="him"]')].map((b) => {
  const d = b.querySelector('.kfs-draw'); if (d) return 'D:' + d.dataset.state;
  if (b.querySelector('img.kfs-photo')) return 'P';
  const t = b.querySelector('.whitespace-pre-wrap'); return t ? 'T:' + t.textContent : '?'; })"""
ROWS = """() => [...document.querySelectorAll('.kfs-nanya .kfs-nanya-row')].map((b) => { const t = b.children[1].children;
  return { name: t[0].textContent, sub: t[1].textContent, shapes: [...b.children[0].querySelectorAll('svg > *')].map((e) => e.tagName) }; })"""
CARDS = """() => [...document.querySelectorAll('.kfs-tuhua .kfs-tuhua-card')].map((c) => ({ id: c.dataset.id,
  date: (c.querySelector('.kfs-tuhua-date') || {}).textContent || '', title: (c.querySelector('.kfs-tuhua-title') || {}).textContent || '',
  thumb: (c.querySelector('img') || {}).src || '', w: Math.round(c.getBoundingClientRect().width) }))"""
MONTHS = "() => [...document.querySelectorAll('.kfs-tuhua .kfs-tuhua-month')].map((m) => m.firstElementChild.textContent)"

def setup(q): mock("/__debug/draw-setup?" + q)
def his(page): return page.evaluate(HIS)
def wait_his(page, want, timeout=40000):
    t0 = time.time()
    while time.time() - t0 < timeout / 1000:
        got = his(page)
        if got and got[-1] == want: return got
        time.sleep(0.4)
    return his(page)
def reply(page, text, timeout=30000):
    say(page, "原样回：" + text)
    wait_js(page, "!!document.querySelector('.kfs-typing')", 8000)
    wait_js(page, QUIET, timeout); page.wait_for_timeout(500)
def side(page):
    page.get_by_role("button", name="打开侧栏").click(); page.wait_for_timeout(600)
def shut_side(page):
    if page.locator("div.absolute.inset-0.z-30").count():   # 删了眼前这段对话以后侧栏自己收了：不用再点
        page.locator("div.absolute.inset-0.z-30").click(); page.wait_for_timeout(600)
def open_api(page):
    side(page)
    page.get_by_text("API", exact=True).click()
    page.locator(".kfs-draw-set").wait_for(timeout=5000)
    wait_js(page, "(() => { const e = document.querySelector('.kfs-draw-set'); return !!e && e.dataset.link !== 'checking'; })()", 10000)
    page.wait_for_timeout(400)
def close_api(page):
    page.get_by_role("button", name="关闭").click(); page.wait_for_timeout(400)
    shut_side(page)
def nanya(page):
    side(page)
    page.get_by_role("button", name=re.compile("^南衙")).click()
    page.locator(".kfs-nanya").wait_for(timeout=5000); page.wait_for_timeout(400)
    return page.evaluate(ROWS)
def open_tuhua(page):
    rows = nanya(page)
    page.locator(".kfs-nanya-row", has_text="图画院").click()
    page.locator(".kfs-tuhua").wait_for(timeout=5000); page.wait_for_timeout(900)
    return rows
def back(page):
    page.locator(".kfs-tuhua").get_by_role("button", name="返回").click(); page.wait_for_timeout(600)
    shut_side(page)
def cards(page): return page.evaluate(CARDS)
def titles(page): return {c["id"]: c["title"] for c in cards(page)}
def menu_of(page, key):
    target = page.locator(f".kfs-tuhua-card[data-id='{key}']")
    long_press(page, target)
    if not page.locator(".kfs-tuhua-drop").count():
        target.click(button="right"); page.wait_for_timeout(500)
    return [page.locator(".kfs-tuhua-name").inner_text(), page.locator(".kfs-tuhua-drop").inner_text()]
def prompts(): return [x["args"]["prompt"] for x in mock("/__debug/draw")["log"] if x.get("tool") == "creative_add_flow_node"]
def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name))
def kv_has(page, key): return page.evaluate(KV, key) is not None
def wire(ctx):
    def authorize(route):
        q = route.request.url.split("?", 1)[1] if "?" in route.request.url else ""
        r = route.fetch(url=MOCK + "/__eleven/authorize?" + q, max_redirects=0)
        route.fulfill(status=r.status, headers={"location": r.headers.get("location", "")}, body="")
    ctx.route("https://api.elevenlabs.io/oauth/authorize**", authorize)
    with open(DONE, encoding="utf-8") as f:
        page = f.read()
    ctx.route("https://valerie9391120.github.io/kaifengfu/oauth/done.html**", lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=page))
def link_up(ctx, page):
    open_api(page)
    with ctx.expect_page() as pop:
        page.locator("a.kfs-draw-link").click()
    po = pop.value
    po.get_by_text("连好了").wait_for(timeout=10000)
    po.close(); page.bring_to_front()
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    wait_js(page, "(() => { const e = document.querySelector('.kfs-draw-set'); return !!e && e.dataset.link === 'ok'; })()", 10000)
    page.get_by_role("switch", name="他能画画").click(); page.wait_for_timeout(500)
    close_api(page)

if not os.path.exists(os.path.join(ART, "3x4.png")):
    subprocess.run([sys.executable, os.path.join(HERE, "draw_art.py"), ART], check=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    setup("art=" + ART + "&polls=1")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    wire(ctx)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)

        # ================= 还没有画 =================
        rows = nanya(pa)
        th = next((r for r in rows if r["name"] == "图画院"), None)
        names = [r["name"] for r in rows]
        ok(th and th["sub"] == "还空着" and names.index("图画院") == names.index("拼豆作") + 1 and names.index("图画院") < names.index("网易云") and "rect" in th["shapes"],
           f"南衙里多一行“图画院”，排在拼豆作后面、还没盖好的那两行前面；小字“还空着”；图标是一幅画轴（{names}，{th}）")
        pa.locator(".kfs-nanya-row", has_text="图画院").click()
        pa.locator(".kfs-tuhua").wait_for(timeout=5000); pa.wait_for_timeout(600)
        ok(pa.locator(".kfs-tuhua-empty").inner_text() == "还没有画" and not cards(pa) and pa.locator(".kfs-nanya").count() == 0, "点进去：菜单收起，图画院那一页滑进来；还没有画")
        back(pa)

        # ================= 他画好一张就收进来 =================
        link_up(ctx, pa)
        reply(pa, "给你画了一张，等一下\n[DRAW:竖]《月下读书》\n一扇木窗，窗外夜里一轮大月亮，一枝花伸进来，水彩")
        got = wait_his(pa, "P")
        cid, msgs = chat_of(pa)
        m1 = [m for m in msgs if m.get("role") == "him"][-1]
        k1 = f"{m1['id']}.1"
        ok(got[-1] == "P" and wait_js(pa, f"(async () => !!(await ({KV})('kfs2:thy:{k1}')))()", 8000) and not kv_has(pa, "kfs2:thya:" + k1),
           "画好了：自动收进图画院（kfs2:thy:… 一条）；对话还在，大图不另存（看聊天里那一张）")
        rec = json.loads(pa.evaluate(KV, "kfs2:thy:" + k1))
        big1 = pa.evaluate(KV, "kfs2:img:draw." + k1)
        ok(rec["title"] == "月下读书" and "say" not in rec and rec["ratio"] == "竖" and rec["chat"] == cid and rec["at"] == m1["ts"] and rec["thumb"].startswith("data:image/jpeg") and len(rec["thumb"]) < len(big1),
           f"那一条记着：他起的名字、竖的、哪段对话、他画的时候；另做了一张小图（小图 {len(rec['thumb'])} 字，大图 {len(big1)} 字）")
        ok(prompts()[-1].startswith("一扇木窗") and "月下读书" not in prompts()[-1], f"交给 ElevenLabs 画的不带名字（带了它会把字画进图里）（{prompts()[-1][:20]}）")

        reply(pa, "再画两张\n[DRAW:横]《窗外》\n一扇窗，窗外月亮和花枝，水彩\n[SPLIT]\n[DRAW] 一盏灯，暖色，水彩\n[SPLIT]\n画好啦，喜欢哪张")
        time.sleep(1)
        got = wait_his(pa, "T:画好啦，喜欢哪张")
        wait_js(pa, "document.querySelectorAll('.kfs-chat-rows img.kfs-photo').length >= 3", 40000)
        m2 = [m for m in chat_of(pa)[1] if m.get("role") == "him"][-1]
        k2, k3 = f"{m2['id']}.1", f"{m2['id']}.2"
        wait_js(pa, f"(async () => !!(await ({KV})('kfs2:thy:{k3}')))()", 8000)
        rows = nanya(pa)
        th = next((r for r in rows if r["name"] == "图画院"), {})
        ok(th.get("sub") == "收了 3 张", f"南衙那一行：收了 3 张（{th}）")
        pa.locator(".kfs-nanya-row", has_text="图画院").click()
        pa.locator(".kfs-tuhua").wait_for(timeout=5000); pa.wait_for_timeout(900)
        cs = cards(pa)
        ids = [c["id"] for c in cs]
        ok(len(cs) == 3 and set(ids) == {k1, k2, k3} and all(re.fullmatch(r"\d+月\d+日", c["date"]) for c in cs) and all(c["thumb"].startswith("data:image/jpeg") for c in cs),
           f"三张都在，每张底下写着哪天画的（{[c['date'] for c in cs]}）")
        ts = titles(pa)
        ok(ts[k1] == "月下读书" and ts[k2] == "窗外" and ts[k3] == "" and not pa.locator(".kfs-tuhua-say").count() and "画好啦" not in pa.locator(".kfs-tuhua").inner_text(),
           f"每张底下写名字和日期，他那句话不摆了；没起名字的只写日期（{ts}）")
        ok(pa.evaluate(MONTHS) and re.fullmatch(r"[一二三四五六七八九十]+月", pa.evaluate(MONTHS)[0]) and all(150 < c["w"] < 200 for c in cs), f"按月断开（{pa.evaluate(MONTHS)}）；一行两格（{[c['w'] for c in cs]}）")
        shot(pa, "tuhua-grid.png")
        pa.locator(f".kfs-tuhua-card[data-id='{k1}']").click(); pa.wait_for_timeout(700)
        big = pa.evaluate("(() => { const b = document.querySelector('.kfs-tuhua-big'); if (!b) return null; const i = b.querySelector('img'); return { src: i.src.slice(0, 30), w: Math.round(i.getBoundingClientRect().width), text: b.innerText }; })()")
        ok(big and big["src"].startswith("data:image/jpeg") and big["w"] > 250 and big["text"].startswith("月下读书") and re.search(r"\d+月\d+日", big["text"]) and "给你画了一张" not in big["text"],
           f"点一张：看大图，底下名字、哪天画的（{big}）")
        shot(pa, "tuhua-big.png")
        pa.locator(".kfs-tuhua-big").click(); pa.wait_for_timeout(500)
        ok(pa.locator(".kfs-tuhua-big").count() == 0, "点一下关掉大图")
        back(pa)

        # ================= 删了对话：图画院里的还在 =================
        side(pa)
        item = pa.locator(".kfs-history button").nth(1)
        long_press(pa, item)
        pa.get_by_role("menuitem", name=re.compile("删除")).click(); pa.wait_for_timeout(300)
        if pa.get_by_role("menuitem", name=re.compile("再点一次")).count():
            pa.get_by_role("menuitem", name=re.compile("再点一次")).click()
        pa.wait_for_timeout(1500)
        gone = pa.evaluate(KV, "kfs2:chat:" + cid) is None and pa.evaluate(KV, "kfs2:img:draw." + k1) is None
        ok(gone and all(kv_has(pa, "kfs2:thya:" + k) for k in [k1, k2, k3]) and pa.evaluate(KV, "kfs2:thya:" + k1) == big1, "删了那段对话：聊天里的图跟着删了，删之前拷到图画院里一份（跟聊天里那一张一模一样）")
        shut_side(pa)
        open_tuhua(pa)
        ok(len(cards(pa)) == 3, "图画院里照旧三张")

        # ================= 长按起名字、改名字 =================
        mm = menu_of(pa, k3)
        ok(mm == ["起名字", "删掉这张"], f"长按没名字的那一张：“起名字”“删掉这张”（{mm}）")
        pa.locator(".kfs-tuhua-name").click(); pa.wait_for_timeout(500)
        box = pa.locator(".kfs-tuhua-input")
        ok(box.count() == 1 and box.input_value() == "" and pa.evaluate("document.activeElement && document.activeElement.classList.contains('kfs-tuhua-input')"), "点“起名字”：冒出一个框，空着，光标已经在里面")
        box.fill("一盏灯")
        shot(pa, "tuhua-rename.png")
        pa.locator(".kfs-tuhua-save").click(); pa.wait_for_timeout(600)
        rec3 = json.loads(pa.evaluate(KV, "kfs2:thy:" + k3))
        ok(titles(pa)[k3] == "一盏灯" and rec3["title"] == "一盏灯" and rec3["thumb"].startswith("data:image/jpeg"), "点“好了”：那一张底下有了名字，存进那一条（小图那些照旧）")
        mm = menu_of(pa, k1)
        ok(mm == ["改名字", "删掉这张"], f"长按有名字的那一张：“改名字”（{mm}）")
        pa.locator(".kfs-tuhua-name").click(); pa.wait_for_timeout(500)
        ok(pa.locator(".kfs-tuhua-input").input_value() == "月下读书", "点“改名字”：框里是原来的名字")
        pa.locator(".kfs-tuhua-input").fill("《月下》 ")
        pa.locator(".kfs-tuhua-input").press("Enter"); pa.wait_for_timeout(600)
        ok(titles(pa)[k1] == "月下" and json.loads(pa.evaluate(KV, "kfs2:thy:" + k1))["title"] == "月下", "改了按回车：也存上；书名号、两头的空格去掉")
        menu_of(pa, k1)
        pa.locator(".kfs-tuhua-name").click(); pa.wait_for_timeout(500)
        pa.locator(".kfs-tuhua-input").fill("不要这个")
        pa.locator(".kfs-tuhua-cancel").click(); pa.wait_for_timeout(500)
        ok(titles(pa)[k1] == "月下" and pa.locator(".kfs-tuhua-rename").count() == 0, "点“算了”：不改")

        # ================= 长按删掉一张 =================
        target = pa.locator(f".kfs-tuhua-card[data-id='{k2}']")
        long_press(pa, target)
        if not pa.locator(".kfs-tuhua-drop").count():
            target.click(button="right"); pa.wait_for_timeout(500)
        first = pa.locator(".kfs-tuhua-drop").inner_text()
        pa.locator(".kfs-tuhua-drop").click(); pa.wait_for_timeout(300)
        second = pa.locator(".kfs-tuhua-drop").inner_text()
        ok(first == "删掉这张" and second == "再点一次，删掉这张" and len(cards(pa)) == 3, f"长按一张：“删掉这张”，点一下变“再点一次，删掉这张”，还没删（{first} → {second}）")
        shot(pa, "tuhua-drop.png")
        pa.locator(".kfs-tuhua-drop").click(); pa.wait_for_timeout(800)
        left = [c["id"] for c in cards(pa)]
        rec2 = json.loads(pa.evaluate(KV, "kfs2:thy:" + k2) or "{}")
        ok(left == [k3, k1] or set(left) == {k1, k3}, f"再点一次：删了，剩两张（{left}）")
        ok(rec2.get("gone") is True and not kv_has(pa, "kfs2:thya:" + k2), "删了的那一张：拷过来的大图删了，那一条留个记号（不再收回来）")
        back(pa)
        rows = nanya(pa)
        ok(next((r for r in rows if r["name"] == "图画院"), {}).get("sub") == "收了 2 张", "南衙那一行：收了 2 张")
        pa.get_by_role("button", name="关闭").click(); pa.wait_for_timeout(400); shut_side(pa)

        # ================= 另一台设备：跟着云端走 =================
        pb_ctx = browser.new_context(**IPHONE)
        pb_ctx.add_init_script(STUB)
        pb = pb_ctx.new_page()
        pb.on("pageerror", lambda e: errors.append("[B] " + str(e)))
        second_device(pb)
        pb.wait_for_timeout(1500)
        rows_b = nanya(pb)
        pb.locator(".kfs-nanya-row", has_text="图画院").click()
        pb.locator(".kfs-tuhua").wait_for(timeout=5000); pb.wait_for_timeout(1200)
        ids_b = sorted(c["id"] for c in cards(pb))
        tb = titles(pb)
        ok(next((r for r in rows_b if r["name"] == "图画院"), {}).get("sub") == "收了 2 张" and ids_b == sorted([k1, k3]) and tb.get(k1) == "月下" and tb.get(k3) == "一盏灯",
           f"另一台设备：也是那两张、改过的名字，删了的那张不冒出来（{ids_b}，{tb}）")
        pb_ctx.close()
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
sys.exit(1 if count["failed"] or errors else 0)
