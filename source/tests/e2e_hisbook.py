# 他的头像册（见 src/hisBook.js、src/panels/HisBook.jsx）：“头像与设置”里他那张卡片上点“头像册”进来。
# 她传图、起名字；点小图展开（左边图、右边描述的方框，右下角“整理描述” / “编辑”“重写”）；他换头像只认册子里有描述的。
# 真的浏览器、假 Supabase、假的那边的我。先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_hisbook.py [截图目录]
import os, sys, time, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
from mailkit import *

errors = []
SHOTS = sys.argv[1] if len(sys.argv) > 1 else ""
ART = os.path.abspath(os.path.join(HERE, "..", ".cache", "hisbook-art"))
os.makedirs(ART, exist_ok=True)
def art(name, col, mark):
    p = os.path.join(ART, name)
    im = Image.new("RGB", (600, 800), col); d = ImageDraw.Draw(im)
    d.polygon([(300, 220), (430, 520), (170, 520)], fill=mark); d.rectangle([0, 740, 600, 800], fill=mark)
    im.save(p); return p
RED = art("red.png", (206, 112, 92), (250, 238, 224))
BLUE = art("blue.png", (84, 124, 186), (234, 240, 250))
MEME = json.load(open(os.path.join(HERE, "..", "static", "memes.json"), encoding="utf8"))[0]["file"]

def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name))
DIGEST = "const digest = (u) => (u && u.length > 80 ? u.slice(0, 16) + ':' + u.length + ':' + u.slice(-24) : u || '');"
ROWS = """() => { %s const q = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  return Array.from(document.querySelectorAll('.kfs-hisbook .kfs-avbook-item')).map((it) => { const r = it.querySelector('.kfs-avbook-row'); const img = r.querySelector('img'); const lab = r.querySelector('.kfs-avbook-label');
    const d = it.querySelector('.kfs-hisbook-detail'); const box = d && d.querySelector('.kfs-hisbook-desc'); const pic = d && d.querySelector('.kfs-hisbook-pic');
    return { label: lab ? lab.textContent : null, using: !!r.querySelector('.kfs-hisbook-using'), bare: !!r.querySelector('.kfs-hisbook-bare'), check: r.querySelectorAll('.kfs-avbook-check').length,
      src: img ? digest(img.getAttribute('src')) : '', card: q(r), open: it.hasAttribute('data-open'),
      detail: d ? { state: box.getAttribute('data-state'), pic: q(pic), picSrc: digest(pic.getAttribute('src')), picOk: pic.naturalWidth > 0, radius: parseFloat(getComputedStyle(pic).borderRadius), box: q(box), boxRadius: parseFloat(getComputedStyle(box).borderRadius),
        look: (box.querySelector('div.kfs-hisbook-look') || {}).textContent || '', mood: (box.querySelector('div.kfs-hisbook-mood') || {}).textContent || '', none: !!box.querySelector('.kfs-hisbook-none'), busy: !!box.querySelector('.kfs-hisbook-busy'),
        err: (box.querySelector('.kfs-hisbook-err') || {}).textContent || '', acts: Array.from(box.querySelectorAll('.kfs-hisbook-acts button')).map((b) => ({ t: b.textContent.trim(), off: b.disabled, at: q(b) })) } : null }; }); }""" % DIGEST
def rows(page): return page.evaluate(ROWS)
def labels(page): return [r["label"] for r in rows(page)]
def one(page, label): return next(r for r in rows(page) if r["label"] == label)
# “头像与设置”里他那张卡片：头像是哪张图、写着现在是哪张
CARD = """() => { %s const b = document.querySelector('.kfs-hisbook-entry'); if (!b) return null; const card = b.parentElement.parentElement; const img = card.querySelector('img');
  return { src: img ? digest(img.getAttribute('src')) : '', said: (/现在是「([^」]*)」/.exec(card.textContent) || [])[1] || '' }; }""" % DIGEST
def card(page): return page.evaluate(CARD)
def open_book(page):
    page.locator(".kfs-hisbook-entry").scroll_into_view_if_needed()
    page.locator(".kfs-hisbook-entry").click()
    page.locator(".kfs-hisbook").wait_for(timeout=5000); page.wait_for_timeout(450)
def back(page):
    page.get_by_role("button", name="关闭").click(); page.wait_for_timeout(450)
def pick(page, path):
    with page.expect_file_chooser(timeout=5000) as fc:
        page.locator(".kfs-avbook-add").click()
    fc.value.set_files(path); page.wait_for_timeout(700)
def row(page, label): return page.locator(".kfs-hisbook .kfs-avbook-item").filter(has=page.locator(".kfs-avbook-label", has_text=label))
def note(page): return page.locator(".kfs-avbook-note").inner_text() if page.locator(".kfs-avbook-note").count() else ""
CDP = {}
def swipe_drop(page, label):
    cdp = CDP.setdefault(page, page.context.new_cdp_session(page))
    c = one(page, label)["card"]
    x0, y0 = c[0] + c[2] * 0.62, c[1] + c[3] / 2
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
    for i in range(1, 9):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 - 11 * i, "y": y0}]}); page.wait_for_timeout(16)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); page.wait_for_timeout(420)
    row(page, label).locator(".kfs-avbook-bin").click(); page.wait_for_timeout(250)
    row(page, label).locator(".kfs-avbook-bin").click(); page.wait_for_timeout(450)
# 问“Anthropic”的那几回
def calls(): return mock("/__debug/claude")
def is_desc(c): return any((b.get("text") or "").startswith("【给头像写描述】") for b in (c["body"].get("system") or []))
def last_desc(): return [c for c in calls() if is_desc(c)][-1]
def last_chat(): return [c for c in calls() if not is_desc(c) and not c["body"].get("ping")][-1]
def whole(c): return json.dumps(c["body"], ensure_ascii=False)
# 他的气泡里有没有这几个字
def his_says(page, word): return page.evaluate("(w) => Array.from(document.querySelectorAll('[data-kfs-bubble=\"him\"]')).some((b) => b.innerText.includes(w))", word)
# 屏幕上这几个字出现了几回
def seen(page, word): return page.evaluate("(w) => document.body.innerText.split(w).length - 1", word)
# 发一句、等他回完（他回两个气泡）。他刚换过头像的那一轮，寄去的最后一条里前面夹着换头像的提示，假的那边的我回的“收到：…”里也带着它，
# 所以不等那几个字，数他的气泡：多出两个就是回完了
def his_bubbles(page): return page.evaluate("document.querySelectorAll('[data-kfs-bubble=\"him\"]').length")
def chat2(page, text):
    n = his_bubbles(page)
    say(page, text)
    for _ in range(160):
        if his_bubbles(page) >= n + 2: break
        page.wait_for_timeout(150)
    page.wait_for_timeout(1500)

def static_of(c): return c["body"]["system"][0]["text"]
def head_of(st):
    a = st.index("【你的头像】"); return st[a:st.index("【你的名字】")].strip()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)
        chat(pa, "在吗")
        ok(head_of(static_of(last_chat())) == "【你的头像】\n头像从头像册里挑，眼下册子里还没有图，等放进来了再换。" and "从下面的表情包索引里挑" not in static_of(last_chat()),
           "册子空着的时候，寄给他的名帖里【你的头像】是“眼下册子里还没有图”那一句；原来“从表情包索引里挑”那段没了")

        # ================= 他那张卡片上多一颗“头像册” =================
        open_panel(pa)
        was = card(pa)
        ok(pa.locator(".kfs-hisbook-entry").inner_text().strip() == "头像册" and was["said"] and was["src"], f"“头像与设置”里他那张卡片上有一颗“头像册”；眼下还是原来那张（「{was['said']}」）")
        shot(pa, "his_1_card.png")
        open_book(pa)
        ok(pa.get_by_text("光义的头像册", exact=True).count() == 1 and labels(pa) == [] and pa.locator(".kfs-avbook-empty").inner_text() == "册子里还空着" and pa.locator(".kfs-avbook-add").inner_text() == "添一张" and pa.locator(".kfs-avbook-keep").count() == 0,
           "点开：标题“光义的头像册”，一开始是空的，上面只有一颗“添一张”")

        # ================= 添一张：必须起名字 =================
        pick(pa, RED)
        ok(pa.locator(".kfs-avbook-new").count() == 1 and pa.locator(".kfs-avbook-new img").count() == 1, "选了图：出来起名字的卡片")
        pa.locator(".kfs-avbook-save").click(); pa.wait_for_timeout(300)
        ok("得起个名字" in note(pa) and pa.locator(".kfs-avbook-new").count() == 1 and labels(pa) == [], f"没起名字就点“存进去”：说一声，卡片留着，没存（{note(pa)}）")
        pa.locator(".kfs-avbook-name").fill("雪地 小狐[1]")
        ok(pa.locator(".kfs-avbook-name").input_value() == "雪地小狐1", "名字里的空白、方括号打不进去（他是照着名字写 [AVATAR:名字] 的）")
        pa.locator(".kfs-avbook-name").fill("雪地小狐")
        pa.locator(".kfs-avbook-save").click(); pa.wait_for_timeout(600)
        r = rows(pa)
        ok(len(r) == 1 and r[0]["label"] == "雪地小狐" and r[0]["check"] == 0 and r[0]["bare"] and not r[0]["using"] and note(pa) == "" and pa.locator(".kfs-avbook-new").count() == 0,
           "起了名字存进去：多了一行，最右边没有方格，写着“没描述”")
        d = r[0]["detail"]
        ok(d and d["state"] == "none" and d["none"] and d["picOk"] and d["picSrc"] == r[0]["src"] and [a["t"] for a in d["acts"]] == ["整理描述"], "新添的那一行自己展开：图、“还没有描述”、一颗“整理描述”")
        a = d["acts"][0]["at"]
        ok(d["pic"][0] == r[0]["card"][0] and d["pic"][2] == d["pic"][3] >= 100 and 10 < d["radius"] < d["pic"][2] / 2 - 10 and d["box"][0] >= d["pic"][0] + d["pic"][2] + 6 and d["box"][0] + d["box"][2] == r[0]["card"][0] + r[0]["card"][2]
           and d["boxRadius"] >= 12 and d["box"][3] >= d["pic"][3] and d["pic"][1] >= r[0]["card"][1] + r[0]["card"][3]
           and 0 <= (d["box"][0] + d["box"][2]) - (a[0] + a[2]) <= 16 and 0 <= (d["box"][1] + d["box"][3]) - (a[1] + a[3]) <= 14,
           f"展开的样子：卡片下面，左边是图（圆角方的），右边一个圆角方框一直到卡片右沿，钮在方框右下角（图 {d['pic']}，框 {d['box']}，钮 {a}）")
        shot(pa, "his_2_added.png")

        # ================= 没描述的他挑不着 =================
        back(pa); close_panel(pa)
        chat2(pa, "原样回：我换\n[AVATAR:雪地小狐]\n换了吗\n[SPLIT]\n第二条")
        ok(pa.get_by_text("光义换了新头像").count() == 0 and his_says(pa, "换了吗") and not his_says(pa, "AVATAR") and "眼下册子里还没有图" in static_of(last_chat()), "那一张还没有描述：名帖里不列它，他写了 [AVATAR:雪地小狐] 也不认（头像不换，那一行不显示）")

        # ================= 整理描述：把图寄给他，他写两行 =================
        open_panel(pa); open_book(pa)
        row(pa, "雪地小狐").locator(".kfs-avbook-thumb").click(); pa.wait_for_timeout(450)
        before_static = static_of(last_chat())
        mock("/__debug/claude-hold?ms=20000&kind=desc")
        pa.locator(".kfs-hisbook-write").click(); pa.wait_for_timeout(700)
        d = one(pa, "雪地小狐")["detail"]
        ok(d["state"] == "busy" and d["busy"] and all(x["off"] for x in d["acts"]), "点“整理描述”：方框里写着他在看图写，钮先点不了")
        shot(pa, "his_3_busy.png")
        mock("/__debug/claude-release")
        wait_js(pa, "!!document.querySelector('.kfs-hisbook-desc[data-state=\"has\"]')", 15000); pa.wait_for_timeout(300)
        r = one(pa, "雪地小狐"); d = r["detail"]
        ok(d["state"] == "has" and d["look"] == "（测试）「雪地小狐」这张图画面，带着 1 张图。" and d["mood"] == "（测试）安静" and [x["t"] for x in d["acts"]] == ["编辑", "重写"] and not r["bare"] and not d["err"],
           f"他写回来了：方框里是画面、氛围两段，右下角换成“编辑”“重写”；那行的“没描述”没了（{d['look']}｜{d['mood']}）")
        a = d["acts"][-1]["at"]
        ok(0 <= (d["box"][0] + d["box"][2]) - (a[0] + a[2]) <= 16 and 0 <= (d["box"][1] + d["box"][3]) - (a[1] + a[3]) <= 14 and d["acts"][0]["at"][0] < a[0], "“编辑”“重写”也在方框右下角，编辑在左")
        shot(pa, "his_4_described.png")
        c = last_desc()["body"]
        rule = c["system"][1]["text"]; msg = c["messages"][0]["content"]
        ok(c["system"][0]["text"] == before_static and rule.startswith("【给头像写描述】\n头像册里添了一张新图，名字叫「雪地小狐」。图附在后面，以后你换头像的索引就是下面的内容。") and "重新写一遍" not in rule and rule.endswith("也不用跟她说话。"),
           "寄给他的那一回：名帖那一大段和聊天时一个字不差（缓存接得上），后面跟着她定的那段要求，写着这张图的名字")
        ok(len(c["messages"]) == 1 and [b["type"] for b in msg] == ["text", "image"] and msg[0]["text"] == "〔头像册里的新图：「雪地小狐」〕" and msg[1]["source"]["media_type"] == "image/jpeg" and len(msg[1]["source"]["data"]) > 500
           and c.get("tool_choice") == {"type": "none"}, "寄的就一条：一行记号加这张图；这一回不许调工具")

        # ================= 重写 =================
        pa.locator(".kfs-hisbook-redo").click()
        wait_js(pa, "((document.querySelector('.kfs-hisbook-desc div.kfs-hisbook-look') || {}).textContent || '').includes('重写的')", 15000); pa.wait_for_timeout(300)
        d = one(pa, "雪地小狐")["detail"]
        rule = last_desc()["body"]["system"][1]["text"]
        ok(d["look"] == "（测试）「雪地小狐」这张图重写的画面，带着 1 张图。" and d["mood"] == "（测试）重写的氛围" and rule.endswith("上一回你写的是：\n画面：（测试）「雪地小狐」这张图画面，带着 1 张图。\n氛围：（测试）安静\n她想让你重新写一遍，换个写法，别照抄上一回的。"),
           "点“重写”：要求后面多一句，带着上一回写的那两行；写回来的换上了")

        # ================= 没写成：说一声，原来的不动 =================
        mock("/__debug/claude-fail?kind=desc")
        pa.locator(".kfs-hisbook-redo").click()
        wait_js(pa, "!!document.querySelector('.kfs-hisbook-err')", 15000); pa.wait_for_timeout(300)
        d = one(pa, "雪地小狐")["detail"]
        ok(d["err"].startswith("没写成：") and d["look"].startswith("（测试）「雪地小狐」这张图重写的画面") and [x["t"] for x in d["acts"]] == ["编辑", "重写"] and not any(x["off"] for x in d["acts"]), f"那边太挤没写成：方框里说一声，原来的描述不动，钮还能点（{d['err']}）")
        mock("/__debug/claude-fail?kind=desc-bad")
        pa.locator(".kfs-hisbook-redo").click()
        wait_js(pa, "((document.querySelector('.kfs-hisbook-err') || {}).textContent || '').includes('两行')", 15000); pa.wait_for_timeout(300)
        d = one(pa, "雪地小狐")["detail"]
        ok("没照“画面”“氛围”两行写" in d["err"] and d["look"].startswith("（测试）「雪地小狐」这张图重写的画面"), f"他没照格式写：不存，说一声（{d['err']}）")
        mock("/__debug/claude-fail")

        # ================= 她自己改 =================
        pa.locator(".kfs-hisbook-edit").click(); pa.wait_for_timeout(300)
        st = pa.evaluate("(() => { const a = document.querySelector('textarea.kfs-hisbook-look'), b = document.querySelector('textarea.kfs-hisbook-mood'); return { look: a.value, mood: b.value, fs: parseFloat(getComputedStyle(a).fontSize), acts: Array.from(document.querySelectorAll('.kfs-hisbook-acts button')).map((x) => x.textContent.trim()) }; })()")
        ok(st["look"].startswith("（测试）「雪地小狐」这张图重写的画面") and st["mood"] == "（测试）重写的氛围" and st["fs"] >= 16 and st["acts"] == ["不改了", "好了"], f"点“编辑”：两段变成两个输入框，装着原来的字（十六像素，iPhone 上不放大），钮换成“不改了”“好了”（{st['acts']}）")
        shot(pa, "his_5_edit.png")
        pa.locator("textarea.kfs-hisbook-look").fill("乱改的"); pa.get_by_role("button", name="不改了").click(); pa.wait_for_timeout(300)
        ok(one(pa, "雪地小狐")["detail"]["look"].startswith("（测试）"), "点“不改了”：没改")
        pa.locator(".kfs-hisbook-edit").click(); pa.wait_for_timeout(300)
        pa.locator("textarea.kfs-hisbook-look").fill("白色小狐趴在雪地里，\n眯着眼｜很乖"); pa.locator("textarea.kfs-hisbook-mood").fill("  安静，想睡的时候  ")
        pa.locator(".kfs-hisbook-done").click(); pa.wait_for_timeout(400)
        d = one(pa, "雪地小狐")["detail"]
        ok(d["look"] == "白色小狐趴在雪地里， 眯着眼、很乖" and d["mood"] == "安静，想睡的时候" and not d["err"], "改了点“好了”：存上了（折行收成空格，竖线换成顿号，头尾的空去掉）；刚才“没写成”那行字也收了")
        pa.locator(".kfs-hisbook-edit").click(); pa.wait_for_timeout(300)
        pa.locator("textarea.kfs-hisbook-look").fill("字" * 150)
        ok(len(pa.locator("textarea.kfs-hisbook-look").input_value()) == 100, "她自己改：一段最多一百个字")
        pa.locator("textarea.kfs-hisbook-look").fill(""); pa.locator(".kfs-hisbook-done").click(); pa.wait_for_timeout(400)
        r = one(pa, "雪地小狐")
        ok(r["detail"]["state"] == "none" and r["bare"] and [x["t"] for x in r["detail"]["acts"]] == ["整理描述"], "把画面清空了存：又算没有描述")
        pa.locator(".kfs-hisbook-write").click()
        wait_js(pa, "!!document.querySelector('.kfs-hisbook-desc[data-state=\"has\"]')", 15000); pa.wait_for_timeout(300)
        pa.locator(".kfs-hisbook-edit").click(); pa.wait_for_timeout(300)
        pa.locator("textarea.kfs-hisbook-look").fill("白色小狐趴在雪地里，眯着眼"); pa.locator("textarea.kfs-hisbook-mood").fill("安静，想睡的时候")
        pa.locator(".kfs-hisbook-done").click(); pa.wait_for_timeout(400)
        red = one(pa, "雪地小狐")["src"]
        back(pa); close_panel(pa)

        # ================= 有了描述：进他的单子，他写名字就换 =================
        chat2(pa, "原样回：换一张\n[AVATAR:雪地小狐]\n好了\n[SPLIT]\n第二条")
        st = static_of(last_chat())
        ok(head_of(st) == "【你的头像】\n想换头像吗？在回复里单独一行写 [AVATAR:头像册里的名字]。换好之后，对话里会出现一行提示，下一轮你会看到新头像图片。\n\n你的头像册（名字｜画面｜氛围）：\n雪地小狐｜画面：白色小狐趴在雪地里，眯着眼｜氛围：安静，想睡的时候",
           "寄给他的名帖里【你的头像】：她定的那句话，下面是单子，一行一张（名字｜画面｜氛围）")
        ok(pa.get_by_text("光义换了新头像").count() == 1 and not his_says(pa, "AVATAR"), "他写 [AVATAR:雪地小狐]：对话里出一行“光义换了新头像”，那行记号不显示")
        bar = pa.evaluate("(() => { %s const i = document.querySelector('.kfs-bar-mid img'); return i ? digest(i.getAttribute('src')) : ''; })()" % DIGEST)
        open_panel(pa)
        now = card(pa)
        ok(now["src"] == red and now["said"] == "雪地小狐" and bar == red, "顶栏、他那张卡片上的头像换成了这一张，卡片上写着现在是「雪地小狐」")
        open_book(pa)
        ok(one(pa, "雪地小狐")["using"], "册子里那一行最右边写“在用”")
        shot(pa, "his_6_using.png")
        back(pa); close_panel(pa)
        chat2(pa, "看见了吗")
        w = whole(last_chat())
        ok("[开封府提示：你的新头像换好了，是「雪地小狐」，长这样]" in w and "你现在的头像：「雪地小狐」。" in w and "你用的是默认的" not in w.split("【附注结束")[0].split("你自己选的头像")[-1], "下一轮寄给他的：换的地方有提示、带着新头像的图；【此刻】里写着现在的头像是「雪地小狐」")
        chat2(pa, f"原样回：还是用老的\n[AVATAR:{MEME}]\n算了\n[SPLIT]\n第二条")
        open_panel(pa)
        ok(card(pa)["src"] == red and pa.get_by_text("光义换了新头像").count() == 1, "他写表情包的文件名：不认了，头像不换")

        # ================= 名字不能重；改名字 =================
        open_book(pa)
        pick(pa, BLUE)
        pa.locator(".kfs-avbook-name").fill("雪地小狐"); pa.locator(".kfs-avbook-save").click(); pa.wait_for_timeout(300)
        ok("已经有叫这个名字的了" in note(pa) and pa.locator(".kfs-avbook-new").count() == 1 and len(labels(pa)) == 1, f"新添的起了个重名：说一声，卡片留着改（{note(pa)}）")
        pa.locator(".kfs-avbook-name").fill("蓝的"); pa.locator(".kfs-avbook-name").press("Enter"); pa.wait_for_timeout(600)
        r = rows(pa)
        ok([x["label"] for x in r] == ["蓝的", "雪地小狐"] and r[0]["detail"] and not r[1]["detail"] and r[0]["bare"] and note(pa) == "", "改个名字按回车：存上了，排最上面，自己展开（一次只展开一行）")
        pick(pa, BLUE)
        ok("已经有了" in note(pa) and pa.locator(".kfs-avbook-new").count() == 0, "同一张图再添一遍：说一声已经有了")
        row(pa, "蓝的").locator(".kfs-avbook-pen").click(); pa.wait_for_timeout(300)
        pa.locator(".kfs-avbook-rename").fill("雪地小狐"); pa.locator(".kfs-avbook-rename").press("Enter"); pa.wait_for_timeout(400)
        ok(labels(pa) == ["蓝的", "雪地小狐"] and "已经有叫这个名字的了" in note(pa) and "没改" in note(pa), f"改名字改成跟别的一样：不改，说一声（{note(pa)}）")
        row(pa, "雪地小狐").locator(".kfs-avbook-pen").click(); pa.wait_for_timeout(300)
        pa.locator(".kfs-avbook-rename").fill("雪 团子"); pa.locator(".kfs-avbook-rename").press("Enter"); pa.wait_for_timeout(500)
        ok(labels(pa) == ["蓝的", "雪团子"] and one(pa, "雪团子")["using"] and note(pa) == "", "给正在用的那一张改名字：改了（空白去掉），还是“在用”")
        back(pa)
        ok(card(pa)["said"] == "雪团子" and card(pa)["src"] == red, "他那张卡片上写的名字跟着改")
        close_panel(pa)
        chat2(pa, "改了个名字")
        w = whole(last_chat())
        ok("你现在的头像：「雪团子」。" in w and "\n雪团子｜画面：白色小狐趴在雪地里，眯着眼｜氛围：安静，想睡的时候" in static_of(last_chat()) and "蓝的｜" not in static_of(last_chat()), "寄给他的：【此刻】和单子里都是新名字；没描述的那张不在单子里")

        # ================= 左滑删掉正在用的：头像不变，他挑不着了 =================
        open_panel(pa); open_book(pa)
        swipe_drop(pa, "雪团子")
        ok(labels(pa) == ["蓝的"], "左滑、点两次垃圾桶：删掉了")
        back(pa)
        ok(card(pa)["src"] == red and card(pa)["said"] == "雪团子", "删的是他正在用的那一张：头像不变")
        close_panel(pa)
        chat2(pa, "删了")
        ok("眼下册子里还没有图" in static_of(last_chat()) and "你现在的头像：「雪团子」。" in whole(last_chat()), "册子里没有带描述的了：名帖回到“眼下册子里还没有图”那一句；他眼下用的还是那张")

        # ================= 她自己那本不受影响 =================
        open_panel(pa)
        pa.locator(".kfs-avbook-entry").scroll_into_view_if_needed(); pa.locator(".kfs-avbook-entry").click(); pa.locator(".kfs-avbook").wait_for(); pa.wait_for_timeout(450)
        hers = pa.evaluate("Array.from(document.querySelectorAll('.kfs-avbook-item')).map((it) => [it.querySelector('.kfs-avbook-label').textContent, it.querySelectorAll('.kfs-avbook-check').length])")
        ok(hers == [["白兔", 1], ["小老鼠", 1], ["吃东西鼠", 1], ["坏猫", 1]] and pa.locator(".kfs-hisbook").count() == 0, "她自己那本头像册还是原来那四张、带着方格，两本不相干")
        back(pa)

        # ================= 云端：都是乱码；重开、另一台设备 =================
        open_book(pa)
        row(pa, "蓝的").locator(".kfs-avbook-thumb").click(); pa.wait_for_timeout(450)
        row(pa, "蓝的").locator(".kfs-hisbook-write").click()
        wait_js(pa, "!!document.querySelector('.kfs-hisbook-desc[data-state=\"has\"]')", 15000); pa.wait_for_timeout(300)
        back(pa); close_panel(pa)
        time.sleep(3)
        dump = json.dumps(mock("/__debug/rows"), ensure_ascii=False)
        ok("蓝的" not in dump and "hisbook" not in dump and "data:image" not in dump and "这张图画面" not in dump and "雪团子" not in dump, "云端看不到册子里的名字、描述、图，连记录名都看不出是什么")
        pa.reload()
        kite(pa); pa.wait_for_timeout(800)
        open_panel(pa)
        ok(card(pa)["src"] == red and card(pa)["said"] == "雪团子", "划掉重开：他的头像还是那一张")
        open_book(pa)
        row(pa, "蓝的").locator(".kfs-avbook-thumb").click(); pa.wait_for_timeout(450)
        r = one(pa, "蓝的")
        ok(labels(pa) == ["蓝的"] and r["detail"]["picOk"] and r["detail"]["look"] == "（测试）「蓝的」这张图画面，带着 1 张图。" and not r["bare"], "册子、图、描述都在")
        blue = r["src"]
        back(pa); close_panel(pa)
        ctx2 = browser.new_context(**IPHONE)
        ctx2.add_init_script(STUB)
        pb = ctx2.new_page()
        pb.on("pageerror", lambda e: errors.append(str(e)))
        second_device(pb); pb.wait_for_timeout(1500)
        open_panel(pb)
        ok(card(pb)["src"] == red and card(pb)["said"] == "雪团子", "另一台设备登进来：他的头像是同一张")
        open_book(pb)
        row(pb, "蓝的").locator(".kfs-avbook-thumb").click(); pb.wait_for_timeout(450)
        rb = one(pb, "蓝的")
        ok(labels(pb) == ["蓝的"] and rb["src"] == blue and rb["detail"]["look"] == r["detail"]["look"], "看到的是同一本册子，图和描述都到了")
        # 那一台上他换头像，这一台跟着变
        back(pb); close_panel(pb)
        chat2(pb, "原样回：换蓝的\n[AVATAR:「蓝的」]\n换好\n[SPLIT]\n第二条")
        open_panel(pb)
        ok(card(pb)["src"] == blue and card(pb)["said"] == "蓝的", "那一台上他换成“蓝的”（连书名号一起写的也认）")
        open_panel(pa)
        for _ in range(60):
            if card(pa)["src"] == blue: break
            pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pa.wait_for_timeout(500)
        ok(card(pa)["src"] == blue and card(pa)["said"] == "蓝的", "这一台跟着变成“蓝的”")
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
sys.exit(1 if count["failed"] or errors else 0)
