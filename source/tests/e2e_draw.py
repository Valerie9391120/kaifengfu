# 他画画：真的浏览器、真的 draw 函数和 push 函数（跑在假 Supabase 里）、假的 Anthropic、假的 ElevenLabs（登录的几道门、MCP、放图的地方）。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_draw.py [截图目录]
import json, os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SHOTS = sys.argv[1] if len(sys.argv) > 1 else ""
ART = os.path.abspath(os.path.join(HERE, "..", ".cache", "draw-art"))
DONE = os.path.abspath(os.path.join(HERE, "..", "dist-test", "oauth", "done.html"))
QUIET = "!document.querySelector('.kfs-typing')"
MENU = "() => [...document.querySelectorAll('.z-50 button')].map((b) => b.textContent.trim())"
# 他那几个气泡里的东西，照先后：D:画还没好（它的样子） P:画好了的图 T:字
HIS = """() => [...document.querySelectorAll('.kfs-chat-rows [data-kfs-bubble="him"]')].map((b) => {
  const d = b.querySelector('.kfs-draw'); if (d) return 'D:' + d.dataset.state;
  if (b.querySelector('img.kfs-photo')) return 'P';
  const t = b.querySelector('.whitespace-pre-wrap'); return t ? 'T:' + t.textContent : '?'; })"""
NOTE = "() => [...document.querySelectorAll('.kfs-chat-rows .kfs-draw')].map((d) => d.textContent)"

def dbg(): return mock("/__debug/draw")
def setup(q): mock("/__debug/draw-setup?" + q)
def tools(name=None): return [x for x in dbg()["log"] if "tool" in x and (name is None or x["tool"] == name)]
def his(page): return page.evaluate(HIS)
def settle(page, timeout=30000):
    ok_ = wait_js(page, QUIET, timeout)
    page.wait_for_timeout(500)
    return ok_
def reply(page, text, timeout=30000):
    say(page, "原样回：" + text)
    wait_js(page, "!!document.querySelector('.kfs-typing')", 8000)
    return settle(page, timeout)
def side(page):
    page.get_by_role("button", name="打开侧栏").click(); page.wait_for_timeout(600)
def shut_side(page):
    page.locator("div.absolute.inset-0.z-30").click(); page.wait_for_timeout(600)
def link_state(page):
    return page.evaluate("(document.querySelector('.kfs-draw-set') || {dataset: {}}).dataset.link || ''")
def open_api(page):
    side(page)
    page.get_by_text("API", exact=True).click()
    page.locator(".kfs-draw-set").wait_for(timeout=5000)
    wait_js(page, "(() => { const e = document.querySelector('.kfs-draw-set'); return !!e && e.dataset.link !== 'checking'; })()", 10000)
    page.wait_for_timeout(400)
def close_api(page):
    page.get_by_role("button", name="关闭").click(); page.wait_for_timeout(400)
    shut_side(page)
def settings(page): return json.loads(page.evaluate(KV, "kfs2:settings") or "{}")
def last_him(page):
    cid, msgs = chat_of(page)
    hims = [m for m in msgs if m.get("role") == "him"]
    return cid, hims[-1] if hims else None
def draw_key(page):
    cid, m = last_him(page)
    j = [i for i, it in enumerate(m.get("items", [])) if it.get("type") == "draw"][0]
    return cid, f"{m['id']}.{j}"
def wait_his(page, want, timeout=40000):
    t0 = time.time()
    while time.time() - t0 < timeout / 1000:
        got = his(page)
        if got and got[-1] == want: return got
        time.sleep(0.4)
    return his(page)
def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name))
def menu_on(page, target):
    long_press(page, target)
    if not page.evaluate(MENU):
        target.click(button="right"); page.wait_for_timeout(500)
    return page.evaluate(MENU)

# 她在 ElevenLabs 的登录页上点了授权：那个地址交给假的 ElevenLabs，它把浏览器送回 draw 函数；
# draw 函数再送到网页里的“连好了”那一页（线上是 GitHub Pages 上的 oauth/done.html，这里换成刚打的包里那一份）
def wire(ctx):
    def authorize(route):
        q = route.request.url.split("?", 1)[1] if "?" in route.request.url else ""
        r = route.fetch(url=MOCK + "/__eleven/authorize?" + q, max_redirects=0)
        route.fulfill(status=r.status, headers={"location": r.headers.get("location", "")}, body="")
    ctx.route("https://api.elevenlabs.io/oauth/authorize**", authorize)
    with open(DONE, encoding="utf-8") as f:
        page = f.read()
    ctx.route("https://valerie9391120.github.io/kaifengfu/oauth/done.html**", lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=page))

if not os.path.exists(os.path.join(ART, "3x4.png")):
    subprocess.run([sys.executable, os.path.join(HERE, "draw_art.py"), ART], check=True)

with sync_playwright() as p:
    args = ["--no-sandbox"]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    wire(ctx)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)

        # ================= API 面板：还没连上 =================
        open_api(pa)
        link = pa.locator("a.kfs-draw-link")
        href = link.get_attribute("href") if link.count() else ""
        ok(link_state(pa) == "no" and href.startswith("https://api.elevenlabs.io/oauth/authorize?") and "code_challenge=" in href,
           f"API 面板：还没连上 ElevenLabs，“连上 ElevenLabs”是一个直接打开登录页的链接（地址先要好了）（{href[:70]}）")
        ok(pa.get_by_role("switch", name="他能画画").get_attribute("aria-checked") == "false" and not pa.locator(".kfs-draw-check").count() and not pa.locator(".kfs-draw-test").count(),
           "“他能画画”没开过就是关着的；没出岔子不写字；没连上没有“试画一张”")
        ok(not tools(), "打开面板看一眼：不碰 MCP（不花钱）")
        shot(pa, "api-unlinked.png")

        # ================= 连上 ElevenLabs =================
        with ctx.expect_page() as pop:
            link.click()
        po = pop.value
        po.wait_for_load_state()
        po.get_by_text("连好了").wait_for(timeout=10000)
        ok("连上 ElevenLabs 了" in po.inner_text("body") and dbg()["linked"], "点“连上 ElevenLabs”：新开一页去登录，授权了送回来，“连好了”；凭证存在小后端那头")
        shot(po, "oauth-done.png")
        po.close()
        pa.bring_to_front()
        pa.evaluate("window.dispatchEvent(new Event('focus'))")
        wait_js(pa, "(() => { const e = document.querySelector('.kfs-draw-set'); return !!e && e.dataset.link === 'ok'; })()", 10000)
        ok(link_state(pa) == "ok" and pa.locator(".kfs-draw-test").count() == 1 and pa.locator(".kfs-draw-unlink").count() == 1,
           "回到开封府（又看得见了）：再问一回，连上了，“试画一张”“断开 ElevenLabs”摆出来")
        link_row = dbg()["link"]
        ok(not any(k in json.dumps(link_row) for k in ["verifier"]) and link_row.get("tokens", {}).get("access"), "登录那一趟的东西清掉了，只留凭证")

        pa.get_by_role("switch", name="他能画画").click(); pa.wait_for_timeout(500)
        ok(settings(pa).get("draw") is True, "开“他能画画”：存进设置（跟着云端走）")

        # ================= 试画一张 =================
        setup("art=" + ART + "&polls=1")
        pa.locator(".kfs-draw-test").click()
        wait_js(pa, "!!document.querySelector('.kfs-draw-test-note')", 30000)
        note = pa.locator(".kfs-draw-test-note").inner_text()
        add = tools("creative_add_flow_node")
        run = tools("creative_run_flow_nodes")
        ok(pa.locator(".kfs-draw-test-note").get_attribute("data-ok") == "yes" and pa.locator(".kfs-draw-test-note img").count() == 1 and re.search(r"画好了，\d+ 秒，花了 237 点额度", note),
           f"试画一张：画好了摆在面板上，说几秒、花了几点额度（{note}）")
        ok(len(add) == 1 and "小狐狸" in add[0]["args"]["prompt"] and add[0]["args"]["model_parameters"]["aspect_ratio"] == "3:4" and len(run) == 1 and run[0]["args"]["generations_count"] == 1,
           "试画的那一张：竖的（3:4），只画一张（不是几张挑一张）")
        pa.locator(".kfs-draw-set").scroll_into_view_if_needed()
        shot(pa, "api-linked.png")
        close_api(pa)

        # ================= 他在聊天里画一张 =================
        setup("polls=3")
        reply(pa, "给你画了一张，等一下\n[DRAW:竖] 一只小狐狸坐在窗边的书案前读书，窗外月亮很大，几枝花，水彩")
        cid, key = draw_key(pa)
        got = wait_his(pa, "D:busy", 8000)
        ok(got[-2:] == ["T:给你画了一张，等一下", "D:busy"] and "他在画" in pa.evaluate(NOTE)[-1],
           f"他的回话：前面的字照常一个气泡，画那一样摆成“他在画”（{got[-2:]}）")
        his_text = pa.evaluate("() => [...document.querySelectorAll('.kfs-chat-rows [data-kfs-bubble=\"him\"]')].map((b) => b.textContent).join('|')")
        ok("小狐狸坐在窗边" not in his_text and "[DRAW" not in his_text, "写在 [DRAW] 后面的“画什么”她看不见，记号也不摆")
        shot(pa, "chat-drawing.png")
        got = wait_his(pa, "P")
        img = pa.evaluate(KV, "kfs2:img:draw." + key)
        job = pa.evaluate(KV, "kfs2:drawjob:" + key)
        ok(got[-1] == "P" and img and img.startswith("data:image/jpeg") and job is None,
           "画好了：摆成一张图；图缩成照片那样存进库房（kfs2:img:draw.…），画到一半的那一笔删了")
        add = tools("creative_add_flow_node")
        ok(len(add) == 2 and add[-1]["args"]["prompt"].startswith("一只小狐狸坐在窗边") and add[-1]["args"]["model_parameters"]["aspect_ratio"] == "3:4" and add[-1]["args"].get("flow_id"),
           "交给 ElevenLabs 的就是他写的“画什么”，竖的；画在上回那一块画布上（不是一回开一块）")
        pa.wait_for_timeout(600)
        shot(pa, "chat-drawn.png")
        pa.locator(".kfs-chat-rows img.kfs-photo").last.click(); pa.wait_for_timeout(700)
        big = pa.evaluate("(() => { const i = document.querySelector('.kfs-viewer img'); return !!i && i.src.startsWith('data:image/jpeg') && i.getBoundingClientRect().width > 300; })()")
        ok(big, "点那张画：看大图")
        shot(pa, "chat-viewer.png")
        pa.locator(".kfs-viewer").click(); pa.wait_for_timeout(600)
        mm = menu_on(pa, pa.locator(".kfs-chat-rows img.kfs-photo").last)
        ok(mm == ["重新回答"], f"长按那张画：只有“重新回答”（{mm}）")
        pa.mouse.click(200, 120); pa.wait_for_timeout(400)

        # ================= 她下一回说话：他看得到画成了什么样 =================
        n = len(mock("/__debug/claude"))
        reply(pa, "好看")
        body = mock("/__debug/claude")[n:][0]["body"]
        sys_text = json.dumps(body.get("system", ""), ensure_ascii=False)
        msgs = body["messages"]
        hit = None
        for i, m in enumerate(msgs):
            if m["role"] == "user" and isinstance(m["content"], list):
                for k, b in enumerate(m["content"]):
                    if b.get("type") == "text" and "你画的那张画好了，长这样" in b.get("text", ""):
                        hit = (i, k, m["content"])
        ok(hit and hit[1] + 1 < len(hit[2]) and hit[2][hit[1] + 1].get("type") == "image" and hit[2][hit[1] + 1]["source"]["media_type"] == "image/jpeg",
           "她下一回说话：他那条后面附一句“你画的那张画好了，长这样”，跟着那张图")
        ok("[DRAW]" in sys_text and "[DRAW:竖]" in sys_text, "“他能画画”开着：名帖的【回复格式】里教他怎么画")
        prev = [m for m in msgs if m["role"] == "assistant" and isinstance(m["content"], list) and any("[DRAW:竖] 一只小狐狸" in (b.get("text") or "") for b in m["content"])]
        ok(len(prev) == 1, "他那一条照原样寄回去（记号、“画什么”都在）")

        # ================= 横的、方的 =================
        setup("polls=1")
        reply(pa, "[DRAW:横] 一扇窗，窗外月亮和花枝，水彩\n[SPLIT]\n[DRAW] 一盏灯，暖色，水彩")
        got = wait_his(pa, "P")
        time.sleep(4)
        got = wait_his(pa, "P")
        ratios = [x["args"]["model_parameters"]["aspect_ratio"] for x in tools("creative_add_flow_node")[-2:]]
        ok(got[-2:] == ["P", "P"] and ratios == ["4:3", "1:1"], f"一条回话里两张（[SPLIT] 隔开）：一张一张画，横的 4:3、不写的是方的（{got[-2:]}，{ratios}）")
        shot(pa, "chat-two.png")

        # ================= 没画成：缘故、点了重画 =================
        setup("fail=quota")
        reply(pa, "[DRAW] 额度不够的那一张")
        got = wait_his(pa, "D:fail")
        note = pa.evaluate(NOTE)[-1]
        ok(got[-1] == "D:fail" and "额度" in note and "点这里重画" in note, f"额度不够：气泡上写着缘故和“点这里重画”，不自己一遍一遍画（{note}）")
        _, key2 = draw_key(pa)
        rec = json.loads(pa.evaluate(KV, "kfs2:drawjob:" + key2) or "{}")
        ok(rec.get("state") == "failed" and "额度" in rec.get("why", ""), "没画成的缘故记进库房（别的设备也看得见）")
        shot(pa, "chat-fail.png")
        runs = len(tools("creative_run_flow_nodes"))
        pa.locator(".kfs-chat-rows .kfs-draw").last.click()
        got = wait_his(pa, "P")
        ok(got[-1] == "P" and len(tools("creative_run_flow_nodes")) == runs + 1 and pa.evaluate(KV, "kfs2:drawjob:" + key2) is None, "点“点这里重画”：重画一回，画好了")

        # ================= 关了“他能画画”：他画的不画，点了才画 =================
        open_api(pa)
        pa.get_by_role("switch", name="他能画画").click(); pa.wait_for_timeout(500)
        close_api(pa)
        runs = len(tools("creative_run_flow_nodes"))
        n = len(mock("/__debug/claude"))
        reply(pa, "[DRAW] 没开开关的时候画的")
        time.sleep(2)
        got = his(pa)
        note = pa.evaluate(NOTE)[-1]
        body = mock("/__debug/claude")[n:][0]["body"]
        ok(got[-1] == "D:none" and "点这里画出来" in note and len(tools("creative_run_flow_nodes")) == runs, f"“他能画画”关着：他写了也不画，气泡上“这张画还没画，点这里画出来”（{note}）")
        ok("[DRAW]" not in json.dumps(body.get("system", ""), ensure_ascii=False), "关着的时候：名帖里不教他画")
        pa.locator(".kfs-chat-rows .kfs-draw").last.click()
        got = wait_his(pa, "P")
        ok(got[-1] == "P" and len(tools("creative_run_flow_nodes")) == runs + 1, "点了“点这里画出来”：画一张")
        open_api(pa)
        pa.get_by_role("switch", name="他能画画").click(); pa.wait_for_timeout(500)
        close_api(pa)

        # ================= 登录丢了：说去连，连上了点了接着来 =================
        setup("unlink=1")
        reply(pa, "[DRAW] 没连上的时候画的")
        got = wait_his(pa, "D:fail")
        note = pa.evaluate(NOTE)[-1]
        ok(got[-1] == "D:fail" and "没连上 ElevenLabs" in note and "在 API 面板连上以后" in note, f"凭证没了：气泡上说去 API 面板连上（{note}）")
        open_api(pa)
        ok(link_state(pa) == "no" and pa.locator("a.kfs-draw-link").count() == 1, "API 面板：又是“连上 ElevenLabs”")
        with ctx.expect_page() as pop:
            pa.locator("a.kfs-draw-link").click()
        po = pop.value
        po.get_by_text("连好了").wait_for(timeout=10000)
        po.close(); pa.bring_to_front()
        pa.evaluate("window.dispatchEvent(new Event('focus'))")
        wait_js(pa, "(() => { const e = document.querySelector('.kfs-draw-set'); return !!e && e.dataset.link === 'ok'; })()", 10000)
        close_api(pa)
        pa.locator(".kfs-chat-rows .kfs-draw").last.click()
        got = wait_his(pa, "P")
        ok(got[-1] == "P", "重新连上，点了：画好了")

        # ================= 画到一半关掉重开：接着问，不再开画（开画一回扣一回额度） =================
        setup("polls=4")
        reply(pa, "[DRAW] 画到一半关掉重开的那一张")
        got = wait_his(pa, "D:busy", 8000)
        _, key3 = draw_key(pa)
        wait_js(pa, f"(async () => {{ const v = await ({KV})('kfs2:drawjob:{key3}'); return !!v && v.includes('running'); }})()", 10000)
        runs = len(tools("creative_run_flow_nodes"))
        pa.reload()
        kite(pa)
        back_to_last(pa)
        got = wait_his(pa, "P", 45000)
        ok(got[-1] == "P" and len(tools("creative_run_flow_nodes")) == runs, f"关掉重开：接着问画好没有，画好了摆出来；没再开画一回（开画 {len(tools('creative_run_flow_nodes')) - runs} 回）")

        # ================= 另一台设备：画好的图跟着云端走，不重画 =================
        pb_ctx = browser.new_context(**IPHONE)
        pb_ctx.add_init_script(STUB)
        pb = pb_ctx.new_page()
        pb.on("pageerror", lambda e: errors.append("[B] " + str(e)))
        second_device(pb)
        back_to_last(pb)
        pb.wait_for_timeout(2500)
        got_b = his(pb)
        runs_b = len(tools("creative_run_flow_nodes"))
        pb.wait_for_timeout(2000)
        ok(got_b.count("P") >= 6 and "D:busy" not in got_b and len(tools("creative_run_flow_nodes")) == runs_b, f"另一台设备打开这段对话：画好的都在（{got_b.count('P')} 张），不重画")
        pb_ctx.close()

        # ================= 小后端还没建：API 面板说一句 =================
        setup("fn=missing")
        open_api(pa)
        bad = pa.locator(".kfs-draw-check").inner_text() if pa.locator(".kfs-draw-check").count() else ""
        ok("draw" in bad and "函数" in bad, f"draw 函数还没建：API 面板上红字说一句（{bad}）")
        shot(pa, "api-nofn.png")
        setup("fn=ok")
        close_api(pa)

        # ================= 删了这段对话：画好的图、画到一半的那一笔都删 =================
        keys = [k for k in pa.evaluate("() => new Promise((res) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').getAllKeys(); r.onsuccess = () => res(r.result); }; })") if k.startswith("kfs2:img:draw.")]
        side(pa)
        item = pa.locator(".kfs-history button").nth(1)
        long_press(pa, item)
        pa.get_by_role("menuitem", name=re.compile("删除")).click(); pa.wait_for_timeout(300)
        if pa.get_by_role("menuitem", name=re.compile("再点一次")).count():
            pa.get_by_role("menuitem", name=re.compile("再点一次")).click()
        pa.wait_for_timeout(1500)
        left = [k for k in keys if pa.evaluate(KV, k)]
        ok(keys and not left and pa.evaluate(KV, "kfs2:chat:" + cid) is None, f"删了这段对话：他画的 {len(keys)} 张图跟着删了（剩 {len(left)}）")
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
sys.exit(1 if count["failed"] or errors else 0)
