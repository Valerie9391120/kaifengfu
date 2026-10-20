# 江湖棋局（卿卿 10 月 15 日要的，见开发说明“江湖棋局”那一节、src/game/jianghu.js）的端到端测试：
# 真的浏览器、真的引擎（她仓库里拷来的那一份，在手机上那一包里跑），假 Supabase 里假的那边的我是个假主持人（见 tests/mock-supabase.mjs 的 fakeHost）：
#   “开局”调 new_game（她商贾、他镖师）；“帮我扔”调 roll；“连扔两回”连着调两回 roll；“只调不说”一个字不说只调 game_info；
#   结果递回去以后照结果的头一行说一句，说完。
#   “写到一半”：说了一句、调了 roll，回话却停在 max_tokens 上（写到长度上限被截断）。
# 骰子照他调的那一样的编号掷（编号是假主持人一个一个往上数的，跟真随机一样）：每一条都照存档、引擎回的样子认，不认具体几点。
# 最后一段是两台设备（只有新路有，KFS_OLD_PATH=1 的时候不跑）：一步棋只让发那一回的设备替他调，发的那台关着、过了等它的工夫，另一台才替它放。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：python3 tests/e2e_jianghu.py
import json, os, re, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
D = ["diary_list", "diary_read", "diary_search", "diary_note"]  # 翻日记的四样（日记共读，10 月 18 日起随时带着；第四样留批注是掺手帐那回加的，见 src/diaryTools.js）
GD = ["new_game", "roll", "game_action", "game_info"] + D
CARDS = "[...document.querySelectorAll('.kfs-game-card')].map((e) => e.innerText)"
STRIP = "(() => { const e = document.querySelector('.kfs-game-strip'); return e ? e.innerText.replace(/\\n/g, ' | ') : null; })()"
HIS = "[...document.querySelectorAll(\"[data-kfs-bubble='him']\")].map((e) => e.innerText)"

def sys_text(body):
    s = body["system"]
    return s[0]["text"] if isinstance(s, list) else s
def now_note(body):
    last = body["messages"][-1]["content"]
    return [b["text"] for b in last if b.get("type") == "text" and b["text"].startswith("【此刻】")]
def board_line(body):
    n = now_note(body)
    return [l for l in (n[0] if n else "").split("\n") if l.startswith("【棋盘】")]
def strip_of(board):
    ch = board["ch"].replace("：", " · ", 1)
    return f"{ch} | 卿卿 第{board['her'][0]}格 {board['her'][1]}两 ｜ 小晋 第{board['him'][0]}格 {board['him'][1]}两"
def settle(page, n, timeout=30):
    # 等假的那边答满 n 回、顶上的“正在输入…”收了、最后一步的卡片冒出来
    wait_mock(lambda: len(calls()) >= n, timeout)
    wait_js(page, "!(" + TYPING + ")", timeout * 1000)
    time.sleep(1.2)
def say_and_wait(page, text, more):
    n = len(calls())
    say(page, text)
    settle(page, n + more)
    return n

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    # KFS_OLD_PATH=1：装作信箱那张表还没建，整套都走老路（claude 函数，同 tests/e2e.py）。两条路都得过
    if os.environ.get("KFS_OLD_PATH"):
        mock("/__debug/mail-setup?table=missing")
    A = browser.new_context(**IPHONE)
    A.add_init_script(STUB)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append("A: " + str(e)))
    try:
        first_time(pa)
        # ================= 南衙里那一行、点开那一张 =================
        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        pa.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
        rows = pa.evaluate("[...document.querySelectorAll('.kfs-nanya-row')].map((e) => e.innerText.replace(/\\n/g, ' | '))")
        ok(rows[1:3] == ["闲笔集 | 今天还没写", "江湖棋局 | 还没开局"] and len(rows) == 6, f"南衙里多一行“江湖棋局”，排在闲笔集后面，还没开局（{rows}）")
        pa.locator(".kfs-nanya-row", has_text="江湖棋局").click(); time.sleep(0.6)
        sheet = pa.locator(".kfs-jianghu").inner_text()
        ok(pa.locator(".kfs-jianghu-go").count() == 0 and pa.locator(".kfs-jianghu-new").count() == 1 and pa.locator(".kfs-jianghu-here").count() == 0 and "开新的一局会另开一段对话" in sheet and "开局”就开" not in sheet,
           "点开：还没下过，只有“开新的一局”（眼下是还空着的新对话，没有“就在这段对话里下”）；底下的小字里没有“跟小晋说一声开局就开”")
        pa.locator(".kfs-jianghu-new").click(); time.sleep(0.8)
        ok(pa.locator(".kfs-game-title").inner_text() == "江湖棋局" and pa.locator(".kfs-game-empty").inner_text().strip() == "江湖棋局" and pa.evaluate(STRIP) == "江湖棋局 | 还没开局",
           "开新的一局：开了一段空对话，中间只写“江湖棋局”（底下那句提示和气泡拿掉了），顶栏底下一条“还没开局”")

        # ================= 开局 =================
        n0 = say_and_wait(pa, "开局", 2)
        cs = calls()[n0:]
        b0, b1 = cs[0]["body"], cs[1]["body"]
        ok([t.get("name") for t in b0.get("tools", [])] == GD and "【江湖棋局】" in sys_text(b0) and "主持人口吻与AI玩家角色口吻要清楚区分" in sys_text(b0),
           "这段对话寄的：带着四样工具（后面跟着翻日记的四样，10 月 18 日起随时带着），名帖里多一段【江湖棋局】（后面跟着游戏自带的主持规矩）")
        ok(board_line(b0) == ["【棋盘】还没开局（还没调 new_game）。"], f"【此刻】里多一行棋盘：还没开局（{board_line(b0)}）")
        cid, msgs = chat_of(pa)
        his = [m for m in msgs if m["role"] == "him"]
        step, done = his[0], his[1]
        c = step["calls"][0]
        ok(cid.startswith("jh") and step.get("stop") == "tool_use" and c["name"] == "new_game" and "〔只给你看〕你的身份：镖师" in c["out"] and c["out"].endswith("〔引擎〕status=active｜currentPlayer=human") and not c.get("err"),
           "他说“好，开局。”就调了 new_game：那一步记着他还没说完，引擎回的字后面有只给他看的身份和状态行")
        last = b1["messages"][-1]["content"]
        prev = b1["messages"][-2]
        ok(last[0]["type"] == "tool_result" and last[0]["tool_use_id"] == c["id"] and last[0]["content"] == c["out"] and last[-1]["type"] == "text" and last[-1]["text"].startswith("【此刻】"),
           "结果递回去：最后一句最前面是 tool_result（对得上他调的那一样），【此刻】排在后面")
        ok(prev["role"] == "assistant" and [x["type"] for x in prev["content"]] == ["text", "tool_use"] and prev["content"][0]["text"] == "好，开局。" and prev["content"][1]["id"] == c["id"],
           "他前面那一步照原样寄回去：他说的字、他调的那一样")
        ok(board_line(b1)[0].startswith("【棋盘】第一章：中原风起；卿卿第1格、45两；小晋第1格、45两；轮到卿卿"), f"接着说的那一回，【此刻】里的棋盘已经是开了局的（{board_line(b1)}）")
        ok(sys_text(b1) == sys_text(b0) and b1.get("tools") == b0.get("tools"), "名帖、工具前后两回一个字不差（缓存接得上）")
        snap = json.loads(pa.evaluate(KV, "kfs2:jhs:" + step["id"]) or "null")
        ok(snap and snap["players"]["human"]["identity"]["id"] == "merchant" and step["board"]["ch"] == "第一章：中原风起" and "stop" not in done and done.get("calls") is None,
           "这一步的整份棋盘另存了一条（kfs2:jhs:那一步）；他说完的那一条不记“没说完”")
        cards = pa.evaluate(CARDS)
        ok(cards == ["〔局〕开局 · 卿卿选了商贾"], f"聊天里摆了一张卡片，只写她的身份（{cards}）")
        ok(pa.evaluate(STRIP) == "第一章 · 中原风起 | 卿卿 第1格 45两 ｜ 小晋 第1格 45两", f"顶上那条：第一章，两人都在第1格、45两（{pa.evaluate(STRIP)}）")
        ok(pa.evaluate(HIS)[:1] == ["好，开局。"] and pa.evaluate(HIS)[-1] == "轮到下一步了", "他的话：开局前那一句、卡片、接着说的两条")

        # ================= 帮我扔 =================
        n1 = say_and_wait(pa, "帮我扔", 2)
        cid, msgs = chat_of(pa)
        roll = [m for m in msgs if m["role"] == "him" and m.get("calls") and m["calls"][0]["name"] == "roll"][-1]
        die = re.search(r"掷出了 (\d+) 点", roll["calls"][0]["out"])
        dice = [x for x in pa.evaluate(CARDS) if x.startswith("〔骰〕")]
        ok(die and dice and dice[-1].startswith(f"〔骰〕卿卿掷出 {die.group(1)} 点 → 第{roll['board']['her'][0]}格【") and roll["calls"][0]["card"][0] == dice[-1],
           f"帮我扔：卡片写掷了几点、走到哪一格（{roll['calls'][0]['card']}）")
        ok(pa.evaluate(STRIP) == strip_of(roll["board"]), f"顶上那条跟着走了（{pa.evaluate(STRIP)}）")
        board1 = roll["board"]

        # ================= 重新回答掷骰子的那一步：棋盘退回那一步之前 =================
        retry_n = len(calls())
        wait_js(pa, "!document.querySelector('.kfs-typing')", 20000)
        pa.locator(".kfs-chat-rows [data-kfs-bubble='him']", has_text="我替你扔。").last.click(button="right")
        pa.locator(".z-50 button", has_text="重新回答").first.click()
        settle(pa, retry_n + 2)
        cid, msgs = chat_of(pa)
        roll2 = [m for m in msgs if m["role"] == "him" and m.get("calls") and m["calls"][0]["name"] == "roll"][-1]
        snap_before = json.loads(pa.evaluate(KV, "kfs2:jhs:" + step["id"]))
        snap_after = json.loads(pa.evaluate(KV, "kfs2:jhs:" + roll2["id"]))
        d2 = int(re.search(r"掷出了 (\d+) 点", roll2["calls"][0]["out"]).group(1))
        ok(roll2["id"] != roll["id"] and snap_before["players"]["human"]["position"] == 1 and snap_after["players"]["human"]["position"] == roll2["board"]["her"][0] and roll2["board"]["her"][0] <= 1 + d2,
           f"重新回答那一步：从开局那一步之后的棋盘接着下（她又从第1格掷，这回 {d2} 点，到第{roll2['board']['her'][0]}格），不是接着上一回掷到的地方")
        ok(pa.evaluate(STRIP) == strip_of(roll2["board"]), "顶上那条是新的这一回")
        # 翻回旧的那一版：棋盘也翻回去
        pa.locator(".kfs-chat-rows button[aria-label='上一个版本']").first.click(); time.sleep(0.8)
        ok(pa.evaluate(STRIP) == strip_of(board1), f"翻回旧的那一版：顶上那条也翻回旧的（{pa.evaluate(STRIP)}）")
        pa.locator(".kfs-chat-rows button[aria-label='下一个版本']").first.click(); time.sleep(0.8)
        ok(pa.evaluate(STRIP) == strip_of(roll2["board"]), "再翻回来：又是新的")

        # ================= 连扔两回：一口气调两步 =================
        n2 = say_and_wait(pa, "连扔两回", 3)
        cid, msgs = chat_of(pa)
        tail = msgs[-3:]
        ok([m.get("stop") for m in tail] == ["tool_use", "tool_use", None] and all(m["role"] == "him" for m in tail) and tail[0]["calls"][0]["name"] == "roll" and tail[1]["calls"][0]["name"] == "roll",
           "连扔两回：他调一回、结果递回去、又调一回、再递回去才说完（三条回话，前两条记着没说完）")
        b3 = calls()[-1]["body"]
        kinds = [(m["role"], [x["type"] for x in m["content"]]) for m in b3["messages"][-4:]]
        ok(kinds[0][0] == "assistant" and kinds[0][1][-1] == "tool_use" and kinds[1][1][0] == "tool_result" and kinds[2][1][-1] == "tool_use" and kinds[3][1][0] == "tool_result",
           f"最后那一回寄的：两步都照原样排着（他调、结果、他又调、结果）（{kinds}）")
        ok(pa.evaluate(STRIP) == strip_of(tail[1]["board"]), "顶上那条是最后一步之后的")

        # ================= 只调不说：那一步一个字没说 =================
        n3 = say_and_wait(pa, "只调不说", 2)
        cid, msgs = chat_of(pa)
        mute = [m for m in msgs if m["role"] == "him" and m.get("calls") and m["calls"][0]["name"] == "game_info"][-1]
        nb = calls()[n3 + 1]["body"]
        asst = [m for m in nb["messages"] if m["role"] == "assistant"][-1]
        ok(not mute.get("items") and [x["type"] for x in asst["content"]] == ["tool_use"] and "……" not in pa.evaluate(HIS), "只调了引擎、一个字没说的那一步：聊天里没有空气泡（不补“……”），寄回去也只有他调的那一样")
        ok(not [x for x in pa.evaluate(CARDS) if "game_info" in x], "查看棋盘不摆卡片")

        # ================= 写到长度上限被截断：他调的那一样不替他调 =================
        strip_was = pa.evaluate(STRIP)
        cards_was = len(pa.evaluate(CARDS))
        n_cut = say_and_wait(pa, "写到一半", 1)
        time.sleep(1.5)
        cid, msgs = chat_of(pa)
        cut = [m for m in msgs if m["role"] == "him"][-1]
        cc = (cut.get("calls") or [{}])[0]
        ok(cc.get("name") == "roll" and cc.get("err") and str(cc.get("out", "")).startswith("没执行") and "stop" not in cut and not cc.get("card") and "board" not in cut and pa.evaluate(HIS)[-1] == "写着写着",
           "回话写到长度上限被截断（里头有他调的 roll）：不替他调，记成没调成；不算说到一半；他写的字照常摆")
        ok(len(calls()) == n_cut + 1 and pa.evaluate(STRIP) == strip_was and len(pa.evaluate(CARDS)) == cards_was and pa.locator(".kfs-more").count() == 0,
           "没有接着要后半截，棋盘、卡片都没动，底下也没有“还没说完”")
        n_after = say_and_wait(pa, "查棋盘", 2)
        bb = calls()[n_after]["body"]
        res = [b for m in bb["messages"] if m["role"] == "user" and isinstance(m["content"], list) for b in m["content"] if b.get("type") == "tool_result" and b.get("tool_use_id") == cc.get("id")]
        ok(len(res) == 1 and res[0].get("is_error") and res[0]["content"].startswith("没执行"), "下一回寄过去：截断的那一样后面照样跟着一个结果，写明没执行、标成出错（不然那边不认）")

        # ================= 按停：他说到一半，后半截不要了 =================
        # 用“查棋盘”（调 game_info）：掷骰子要看棋盘眼下许不许掷（前面几步走下来，也许正等着结算场景），查看哪会儿都成
        mock("/__debug/claude-hold?ms=15000&kind=cont")
        n4 = len(calls())
        say(pa, "查棋盘")
        held = wait_mock(lambda: mock("/__debug/claude-held")["held"], 20)   # 他说了“我看看。”、调了 game_info，结果递回去的那一回压着
        time.sleep(0.5)
        pressed = held and pa.evaluate("(() => { const b = document.querySelector('.kfs-stop'); if (!b) return false; b.click(); return true; })()")
        time.sleep(1.5)
        cid, msgs = chat_of(pa)
        lastm = [m for m in msgs if m["role"] != "event"][-1]
        ok(pressed and lastm["role"] == "him" and lastm.get("stop") == "tool_use" and lastm.get("stopped") and pa.locator(".kfs-stopped").count() == 1 and pa.locator(".kfs-stopped").inner_text() == "停了，点这里让我回",
           "他调完引擎、还没接着说的时候按停：后半截不要了，那一步底下一行“停了，点这里让我回”（摆在他那一边）")
        mock("/__debug/claude-hold?ms=0")
        n5 = len(calls())
        pa.locator(".kfs-stopped").click()
        settle(pa, n5 + 1)
        cid, msgs = chat_of(pa)
        ok([m for m in msgs if m["role"] != "event"][-1].get("stop") is None and pa.locator(".kfs-stopped").count() == 0 and calls()[-1]["body"]["messages"][-1]["content"][0]["type"] == "tool_result",
           "点了那一行：他接着说完（寄的最后一句最前面还是那一步的结果）")

        # ================= 换个会先想一阵的模型：想的那一块不寄回去 =================
        pa.evaluate("document.activeElement && document.activeElement.blur()")   # 打字的时候输入框是一行、模型那个按钮收着（她 10 月 17 日定的）：先让键盘收下去
        pa.get_by_role("button", name=re.compile("^Sonnet 4.6")).click()
        pa.get_by_text("选择模型", exact=True).wait_for(timeout=5000)
        pa.get_by_role("button", name=re.compile("^Opus 5.5")).click(); time.sleep(0.6)
        n6 = say_and_wait(pa, "帮我扔", 2)
        # （假 Supabase 记的次序是答完的次序：前面按停掐掉的那一回，压着的工夫到了才记上，会插在这几回中间。照模型和样子认）
        cb = [c for c in calls() if c["body"]["model"] == "claude-opus-5-5" and not c.get("cut") and c["body"]["messages"][-1]["content"][0]["type"] == "tool_result"][-1]["body"]
        asst = [m for m in cb["messages"] if m["role"] == "assistant"]
        ok(all(x["type"] != "thinking" for m in asst for x in m["content"]) and cb["model"] == "claude-opus-5-5", "Opus 5.5 回话前面带着一块“想的”（空的，带签名）：结果递回去的时候不带它（全不带，那边认）")
        pa.evaluate("document.activeElement && document.activeElement.blur()")   # 打字的时候输入框是一行、模型那个按钮收着（她 10 月 17 日定的）：先让键盘收下去
        pa.get_by_role("button", name=re.compile("^Opus 5.5")).click()
        pa.get_by_text("选择模型", exact=True).wait_for(timeout=5000)
        pa.get_by_role("button", name=re.compile("^Sonnet 4.6")).click(); time.sleep(0.6)

        # ================= 南衙：小字、接着上一局 =================
        cid, msgs = chat_of(pa)
        bd = [m for m in msgs if m["role"] == "him" and m.get("board")][-1]["board"]
        pa.locator("button[aria-label='新对话']").tap(); time.sleep(0.6)
        n7 = say_and_wait(pa, "你好", 1)
        plain_id = last_chat(pa)
        # （照她说的那一句认：前面按停掐掉的那一回压着的工夫到了才记上，可能排在这一回后面）
        said = lambda c: any(b.get("type") == "text" and b.get("text") == "你好" for b in (c["body"]["messages"][-1]["content"] if isinstance(c["body"]["messages"][-1]["content"], list) else []))
        nb = [c for c in calls()[n7:] if said(c)][-1]["body"]
        ok([t.get("name") for t in nb.get("tools", [])] == D and "【江湖棋局】" not in sys_text(nb) and not board_line(nb), "平常的对话：不带棋局那四样（只带翻日记的四样），名帖里没有【江湖棋局】，【此刻】里没有棋盘")
        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        pa.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
        sub = pa.locator(".kfs-nanya-row", has_text="江湖棋局").inner_text().split("\n")[-1]
        ok(sub == f"第一章 · 第{bd['her'][0]}格", f"南衙那一行的小字：最近那一局下到哪了（{sub}）")
        pa.locator(".kfs-nanya-row", has_text="江湖棋局").click(); time.sleep(0.6)
        ok(pa.locator(".kfs-jianghu-go").count() == 1 and "上一局" in pa.locator(".kfs-jianghu").inner_text(), "点开：有“上一局”那一块和“接着上一局”")
        pa.locator(".kfs-jianghu-go").click(); time.sleep(0.8)
        ok(last_chat(pa) == cid and pa.evaluate(STRIP) == strip_of(bd), "接着上一局：翻回那一局的对话，顶上那条是它的棋盘")

        # ================= 在平常对话里摆开棋盘、收棋（10 月 16 日）=================
        def jianghu_sheet(page):
            page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
            page.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
            page.locator(".kfs-nanya-row", has_text="江湖棋局").click(); time.sleep(0.6)
        def ons(page):
            return json.loads(page.evaluate(KV, "kfs2:jhon") or "[]")
        def said_by(text, start):
            return [c for c in calls()[start:] if any(b.get("type") == "text" and b.get("text") == text for b in (c["body"]["messages"][-1]["content"] if isinstance(c["body"]["messages"][-1]["content"], list) else []))]
        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        pa.locator(".kfs-history button", has_text="你好").first.click(); time.sleep(0.8)
        ok(last_chat(pa) == plain_id and pa.evaluate(STRIP) is None, "翻回那段平常对话（“你好”）：顶上没有那一条")
        jianghu_sheet(pa)
        ok(pa.locator(".kfs-jianghu-here").count() == 1 and pa.locator(".kfs-jianghu-stop").count() == 0 and "也可以就在眼下这段对话里下" in pa.locator(".kfs-jianghu").inner_text(),
           "在平常对话里点开那一张：多一颗“就在这段对话里下”")
        pa.locator(".kfs-jianghu-here").click(); time.sleep(0.8)
        ok(pa.evaluate(STRIP) == "江湖棋局 | 还没开局" and plain_id in ons(pa) and "收到：你好" in pa.evaluate(HIS) and pa.locator(".kfs-jianghu").count() == 0,
           "摆开了：那一张收起来，顶上一条“还没开局”，前面聊的都在，单子里记上了这段对话")
        n8 = say_and_wait(pa, "改名开局", 2)
        b8 = said_by("改名开局", n8)[0]["body"]
        ok([t.get("name") for t in b8.get("tools", [])] == GD and "这段对话原来是你们平常聊天" in sys_text(b8) and board_line(b8) == ["【棋盘】还没开局（还没调 new_game）。"] and "tool_choice" not in b8
           and any(blk.get("type") == "text" and blk.get("text") == "你好" for m in b8["messages"] if m["role"] == "user" and isinstance(m["content"], list) for blk in m["content"]),
           "摆开以后寄的：带着四样工具，名帖里是换了说法的那一段（原来是平常聊天），【此刻】里一行棋盘，前面聊的照样寄")
        ok(last_chat(pa) == plain_id and pa.evaluate(CARDS)[-1:] == ["〔局〕开局 · 阿卿选了商贾"] and pa.evaluate(STRIP) == "第一章 · 中原风起 | 阿卿 第1格 45两 ｜ 晋哥 第1格 45两",
           f"开局时起了名字（她叫阿卿、他叫晋哥）：卡片、顶上那条照这一局的名字写（{pa.evaluate(STRIP)}）")
        index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
        ok(any(x["id"] == plain_id and x["title"] == "你好" for x in index), "这段对话的名字没变（还叫“你好”，不改成“江湖棋局”）")
        jianghu_sheet(pa)
        sheet2 = pa.locator(".kfs-jianghu").inner_text()
        ok(pa.locator(".kfs-jianghu-stop").count() == 1 and pa.locator(".kfs-jianghu-here").count() == 0 and "阿卿 第1格 45两" in sheet2 and "正摆着棋盘" in sheet2,
           "再点开那一张：“上一局”是这段对话里的这一局，换成一颗“收棋”")
        pa.locator(".kfs-jianghu-stop").click(); time.sleep(0.8)
        ok(pa.evaluate(STRIP) is None and plain_id not in ons(pa) and pa.evaluate(CARDS)[-1:] == ["〔局〕开局 · 阿卿选了商贾"], "收棋：顶上那条没了，单子里拿掉了，下过的卡片还在")
        n9 = say_and_wait(pa, "收棋以后", 1)
        b9 = said_by("收棋以后", n9)[0]["body"]
        ok([t.get("name") for t in b9.get("tools", [])] == GD and "tool_choice" not in b9 and "【江湖棋局】" not in sys_text(b9) and board_line(b9) and board_line(b9)[0].startswith("【棋盘】收起来了"),
           "收了棋再说话：四样工具照带（对话里有他调过的）；10 月 18 日起这一回照许调（他能翻日记）；名帖里没有【江湖棋局】，【此刻】里写着收起来了")
        ok("收到：收棋以后" in pa.evaluate(HIS) and pa.evaluate(STRIP) is None, "他照平常聊天回")
        # 收着棋他还是调了棋局那几样：一样不下，递回去“棋盘收着”
        cards_off = len(pa.evaluate(CARDS))
        n9b = say_and_wait(pa, "收着棋帮我扔", 2)
        offstep = [m for m in chat_by(pa, plain_id) if m["role"] == "him" and m.get("calls")][-1]
        oc = offstep["calls"][0]
        ok(oc["name"] == "roll" and oc.get("err") and oc["out"].startswith("棋盘收着，这一步没下") and "board" not in offstep and len(pa.evaluate(CARDS)) == cards_off and pa.evaluate(STRIP) is None and plain_id not in ons(pa),
           "收着棋他调了 roll：一样不下（递回去“棋盘收着”、标成出错），没有卡片，顶上那条还是没有，单子里也没记上")
        ok(any(x.startswith("（测试主持）没成：棋盘收着") for x in pa.evaluate(HIS)), "他接着说的时候看得到没下成")
        jianghu_sheet(pa)
        pa.locator(".kfs-jianghu-here").click(); time.sleep(0.8)
        ok(pa.evaluate(STRIP) == "第一章 · 中原风起 | 阿卿 第1格 45两 ｜ 晋哥 第1格 45两" and plain_id in ons(pa), "再摆开：接着原来那一局（顶上那条还是那一局）")
        # 收起来：后面几段照旧用专门下棋的那一局
        jianghu_sheet(pa)
        pa.locator(".kfs-jianghu-stop").click(); time.sleep(0.8)
        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        pa.locator(".kfs-history button", has_text="江湖棋局").first.click(); time.sleep(0.8)
        ok(last_chat(pa) == cid and plain_id not in ons(pa), "收起来，翻回专门下棋的那一局")

        # ================= 两台设备：一步棋只让发那一回的设备替他调 =================
        if not os.environ.get("KFS_OLD_PATH"):
            def to_game(page):
                page.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
                page.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
                page.locator(".kfs-nanya-row", has_text="江湖棋局").click(); time.sleep(0.6)
                page.locator(".kfs-jianghu-go").click(); time.sleep(0.8)
            def nudge(page):
                # 装作切走又回来：同步一下、看一遍信箱
                page.evaluate("window.__away(true)"); time.sleep(0.2); page.evaluate("window.__away(false)")
            def conts(tool_id):
                # 把这一步的结果递回去、要后半截的那几回
                out = []
                for c in calls():
                    last = c["body"]["messages"][-1]["content"]
                    if isinstance(last, list) and last and last[0].get("type") == "tool_result" and last[0].get("tool_use_id") == tool_id:
                        out.append(c)
                return out
            B = browser.new_context(**IPHONE)
            B.add_init_script(STUB)
            pb = B.new_page()
            pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
            second_device(pb)
            to_game(pb)
            ok(last_chat(pb) == cid and pb.evaluate(STRIP) == pa.evaluate(STRIP), f"另一台设备也翻到这一局，顶上那条一样（{pb.evaluate(STRIP)}）")

            # ---- 头一回：发的那台关了，过一会儿又打开（没过等它的工夫） ----
            mock("/__debug/claude-hold?ms=60000")
            say(pa, "帮我扔")
            ok(wait_mock(lambda: mock("/__debug/claude-held")["held"], 20), "手机上说“帮我扔”（他要想一会儿）")
            job = [r for r in box()["rows"] if r["state"] == "working"][0]["job"]
            her_id = [m for m in chat_of(pa)[1] if m["role"] == "her"][-1]["id"]
            nudge(pb)
            ok(wait_mock(lambda: any(m["id"] == her_id for m in chat_by(pb, cid)), 15), "另一台同步到了她这一句")
            time.sleep(1.5)
            nudge(pb); time.sleep(2.5)
            ok(not any(j.get("job") == job for j in jobs(pb)) and not pb.evaluate(TYPING),
               "另一台不守这一回（是手机发的；回来的要是一步棋，得手机替他调）：不记它、顶上也不显示正在输入")
            pa.close()
            mock("/__debug/claude-release")
            ok(wait_mock(lambda: any(r["job"] == job and r["state"] == "done" for r in box()["rows"]), 20), "手机关了：回话照样进了信箱")
            cards_b = len(pb.evaluate(CARDS))
            nudge(pb); time.sleep(4.5)
            ok(not any(m.get("job") == job for m in chat_by(pb, cid)) and len(pb.evaluate(CARDS)) == cards_b and any(r["job"] == job for r in box()["rows"]),
               "另一台看到这一封：是手机发的一步棋，先不放（信留着，等手机放）")
            pa = A.new_page()
            pa.on("pageerror", lambda e: errors.append("A2: " + str(e)))
            pa.goto(BASE); kite(pa)
            ok(wait_mock(lambda: any(m.get("job") == job for m in chat_by(pa, cid)), 20), "手机又打开：它替他调了这一步，放进了对话")
            step1 = [m for m in chat_by(pa, cid) if m.get("job") == job][0]
            tid1 = step1["calls"][0]["id"]
            ok(wait_mock(lambda: len(conts(tid1)) >= 1, 30), "手机接着要了后半截")
            time.sleep(4.0)
            nudge(pb)
            ok(wait_mock(lambda: any(m.get("job") == job for m in chat_by(pb, cid)), 15) and not any(r["job"] == job for r in box()["rows"]), "另一台同步下来：这一步也在（信箱里那一封收掉了）")
            time.sleep(4.0)
            ok(len(conts(tid1)) == 1, f"后半截只要了一回（另一台没再替他调一遍、没再接着要：{len(conts(tid1))} 回）")

            # ---- 第二回：发的那台关着不回来，过了等它的工夫，另一台替它放 ----
            to_game(pa)
            wait_js(pa, "!(" + TYPING + ")", 30000); time.sleep(1.0)
            mock("/__debug/claude-hold?ms=60000")
            say(pa, "查棋盘")
            ok(wait_mock(lambda: mock("/__debug/claude-held")["held"], 20), "手机上又说一句“查棋盘”")
            job2 = [r for r in box()["rows"] if r["state"] == "working"][0]["job"]
            pa.close()
            mock("/__debug/claude-release")
            ok(wait_mock(lambda: any(r["job"] == job2 and r["state"] == "done" for r in box()["rows"]), 20), "手机关了，回话进了信箱")
            nudge(pb); time.sleep(4.5)
            ok(not any(m.get("job") == job2 for m in chat_by(pb, cid)), "另一台：还在等手机的那会儿，先不放")
            aged = mock("/__debug/mail-age?ms=200000")
            ok(aged["aged"] >= 1 and wait_mock(lambda: any(m.get("job") == job2 for m in chat_by(pb, cid)), 20), "过了等手机的工夫（手机一直没开）：另一台替它放了")
            step2 = [m for m in chat_by(pb, cid) if m.get("job") == job2][0]
            c2b = step2["calls"][0]
            ok(c2b["name"] == "game_info" and not c2b.get("err") and "〔引擎〕status=" in c2b["out"] and step2.get("board"), "另一台替它调的：引擎照样调成了（用的是同步过来的上一步的棋盘）")
            ok(wait_mock(lambda: len(conts(c2b["id"])) == 1, 30) and wait_js(pb, "document.body.innerText.includes('轮到下一步了')", 20000), "另一台接着要了后半截，他说完了")
            pb.close(); B.close()
            pa = A.new_page()
            pa.on("pageerror", lambda e: errors.append("A3: " + str(e)))
            pa.goto(BASE); kite(pa)
            to_game(pa)
            time.sleep(1.0)
            cid, msgs = chat_of(pa)

        # ================= 历史对话里的名字、删对话连棋盘一起删 =================
        index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
        ok(any(x["id"] == cid and x["title"] == "江湖棋局" for x in index), "历史对话里这一段叫“江湖棋局”")
        steps_ids = [m["id"] for m in msgs if m["role"] == "him" and m.get("calls")]
        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        pa.get_by_role("button", name="头像与设置").click(); time.sleep(0.6)
        pa.get_by_role("button", name="删掉当前这段对话").click(); time.sleep(0.3)
        pa.get_by_role("button", name="再点一次，删掉这段对话").click(); time.sleep(1.2)
        left = [s for s in steps_ids if pa.evaluate(KV, "kfs2:jhs:" + s)]
        ok(not left, f"删掉这一局：每一步另存的棋盘也删了（剩 {len(left)} 条）")
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
if count["failed"]:
    raise SystemExit(1)
