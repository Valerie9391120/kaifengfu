# 选项卡（他弹给她的几道选择题，卿卿 10 月 24 日凌晨要的，见开发说明“选项卡”那一节）的端到端测试。
# 真的浏览器、假 Supabase，一台“手机”，回话都是排好的（编的题）：
#   他的话一条一条蹦完了，卡片才从输入框上面浮出来；聊天里他那条底下一行“他问了你 N 个问题 · 点开答”；
#   卡片：题目、右上角“第 1 项，共 2 项”切题、✕；选项一行一个（数字块、说明那行小字）；最后一行“其他回答”和“跳过”，写了字、多选勾了几个换成“好了”；
#   单选点一下跳到下一题，多选勾好了点“好了”；都答了一起发给他：一题一行“Q: 题目”、一行“A: 答案”，跳过的写“（跳过）”；
#   答完那一行换成“已答”（点不了），他那边收到的就是这几行，他自己弹的卡原样在他的话里；
#   自己写一句（回车也算好了）；全跳过了什么都不发，那一行还是“点开答”，点了卡片再出来；✕ 收起来，不再自己弹（重开也不弹）；
#   卡片开着、她直接打字发了：卡片收起来，照常发；没答的卡重开开封府还在；重新回答：旧卡收起来，新回话里的卡照样弹；
#   键盘起来（在“其他回答”里打字）：卡片和输入框一起铺到键盘上面。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080，用 tests/serve.py 起），再：python3 tests/e2e_ask.py
# KFS_SHOTS=某个文件夹：顺手截几张卡片的样子
import json, os, time, urllib.parse
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SHOTS = os.environ.get("KFS_SHOTS", "")
# 假的“可视区”：浏览器里弹不出 iPhone 的键盘，用它假装键盘弹起来（同 e2e_quote.py）
FAKE_KEYBOARD = """(() => {
  if (window.top !== window) return;
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

CARD = """() => { const c = document.querySelector('.kfs-ask'); if (!c) return null; const r = c.getBoundingClientRect();
  const pager = c.querySelector('.kfs-ask-pager');
  return { q: (c.querySelector('.kfs-ask-q') || {}).textContent || '', pager: pager ? pager.textContent : '',
    prevOff: !!(c.querySelector('[aria-label="上一题"]') || {}).disabled, nextOff: !!(c.querySelector('[aria-label="下一题"]') || {}).disabled,
    opts: [...c.querySelectorAll('.kfs-ask-opt')].map((b) => ({ text: b.textContent, on: b.getAttribute('aria-pressed') === 'true', badge: (b.firstElementChild || {}).textContent || '', svg: !!(b.firstElementChild && b.firstElementChild.querySelector('svg')) })),
    other: (c.querySelector('.kfs-ask-other') || {}).value, ok: !!c.querySelector('.kfs-ask-ok'), skip: !!c.querySelector('.kfs-ask-skip'), x: !!c.querySelector('.kfs-ask-x'),
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), high: Math.round(r.height) }; }"""
ROWS = "() => [...document.querySelectorAll('.kfs-ask-row')].map((e) => ({ text: e.textContent, button: e.tagName === 'BUTTON' }))"
# 他最后一个气泡（她的气泡在 .flex-row-reverse 里）
HIS_LAST = """() => { const all = [...document.querySelectorAll('.kfs-chat-rows .whitespace-pre-wrap')].filter((b) => !b.closest('.flex-row-reverse')); const b = all[all.length - 1];
  if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom) }; }"""
RECT = "(sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; }"

def card(page): return page.evaluate(CARD)
def rows(page): return page.evaluate(ROWS)
def queue(text): mock("/__debug/reply-queue?text=" + urllib.parse.quote(text))
def hers(page): return [m for m in chat_of(page)[1] if m.get("role") == "her"]
def his_msgs(page): return [m for m in chat_of(page)[1] if m.get("role") == "him"]
def asks_of(m): return [it for it in (m.get("items") or []) if it.get("type") == "ask"]
def last_user_texts(body):
    last = [m for m in body["messages"] if m["role"] == "user"][-1]
    return [b["text"] for b in last["content"] if b.get("type") == "text"]
def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name))
def tap_opt(page, text):
    page.locator(".kfs-ask .kfs-ask-opt", has_text=text).first.click(); time.sleep(0.35)
# 等卡片浮出来；一边等一边记：卡片出来的时候，他那条话是不是已经蹦完了（最后一个气泡写着 tail）
def wait_card(page, tail, timeout=25):
    early = False
    end = time.time() + timeout
    while time.time() < end:
        st = page.evaluate("(t) => ({ card: !!document.querySelector('.kfs-ask'), done: [...document.querySelectorAll('.kfs-chat-rows .whitespace-pre-wrap')].some((b) => !b.closest('.flex-row-reverse') && b.textContent.includes(t)) })", tail)
        if st["card"] and not st["done"]: early = True
        if st["card"]:
            time.sleep(0.5)
            return True, early
        time.sleep(0.08)
    return False, early

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    ctx.add_init_script(FAKE_KEYBOARD)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    first_time(pa)

    # ================= 单选、多选、说明、切题 =================
    queue("好呀，我来问问你：\n[ASK]\n问：今晚吃什么？\n- 火锅｜天冷了，热乎乎的\n- 烧烤\n- 麻辣烫\n问（多选）：吃完想干嘛？\n- 散步\n- 看电影\n- 回家窝着\n[/ASK]\n[SPLIT]\n挑好了告诉我")
    say(pa, "今晚吃什么好呢")
    got, early = wait_card(pa, "挑好了告诉我")
    c = card(pa)
    ok(got and not early, f"他的话一条一条蹦完了，卡片才浮出来（蹦到一半没出来：{not early}）")
    ok(c and c["q"] == "今晚吃什么？" and c["pager"] == "第 1 项，共 2 项" and c["prevOff"] and not c["nextOff"] and c["x"],
       f"卡片顶上：题目、右边“第 1 项，共 2 项”（头一题往前那颗点不了）、✕（{c and (c['q'], c['pager'])}）")
    ok(c and [o["badge"] for o in c["opts"]] == ["1", "2", "3"] and c["opts"][0]["text"] == "1火锅天冷了，热乎乎的" and c["opts"][1]["text"] == "2烧烤" and not any(o["on"] for o in c["opts"]),
       f"选项一行一个：数字块、选项，带说明的底下一行小字（{c and [o['text'] for o in c['opts']]}）")
    ok(c and c["skip"] and not c["ok"] and c["other"] == "", "最后一行：“其他回答”空着，右边是“跳过”")
    ok(rows(pa) == [{"text": "他问了你 2 个问题 · 点开答", "button": True}], f"聊天里他那条底下一行：他问了你 2 个问题 · 点开答（{rows(pa)}）")
    comp = pa.evaluate(RECT, ".kfs-composer")
    last = pa.evaluate(HIS_LAST)
    ok(c and comp and c["bottom"] <= comp["top"] and c["left"] == 12 and c["right"] == 393 - 12 and pa.get_by_placeholder("说话，我听着").is_visible(),
       f"卡片浮在输入框上面（{c and c['bottom']} ≤ {comp and comp['top']}），左右各让 12 像素；输入框照旧在底下")
    ok(last and c and last["text"] == "挑好了告诉我" and last["bottom"] <= c["top"], f"聊天记录跟着变矮、停在最底下：他最后那句露在卡片上面（{last and last['bottom']} ≤ {c and c['top']}）")
    shot(pa, "ask_1_single.png")

    pa.get_by_role("button", name="下一题").click(); time.sleep(0.3)
    c = card(pa)
    ok(c and c["q"] == "吃完想干嘛？可多选" and c["pager"] == "第 2 项，共 2 项" and c["nextOff"] and not c["prevOff"], f"右上角点“›”切到第二题：多选的题目后面写着“可多选”（{c and c['q']}）")
    pa.get_by_role("button", name="上一题").click(); time.sleep(0.3)
    ok(card(pa)["q"] == "今晚吃什么？", "点“‹”切回头一题")

    tap_opt(pa, "烧烤")
    c = card(pa)
    ok(c and c["q"] == "吃完想干嘛？可多选" and c["pager"] == "第 2 项，共 2 项", "单选的题点一下就跳到下一题")
    tap_opt(pa, "散步")
    tap_opt(pa, "回家窝着")
    c = card(pa)
    ok(c and [o["on"] for o in c["opts"]] == [True, False, True] and c["opts"][0]["svg"] and c["opts"][1]["badge"] == "2" and c["ok"] and not c["skip"],
       f"多选：勾上的数字块换成对勾，没勾的还是数字；勾了几个，“跳过”换成“好了”（{c and [o['on'] for o in c['opts']]}）")
    tap_opt(pa, "看电影"); tap_opt(pa, "看电影")
    ok([o["on"] for o in card(pa)["opts"]] == [True, False, True], "再点一下勾掉，再点又勾上")
    pa.get_by_role("button", name="上一题").click(); time.sleep(0.3)
    c = card(pa)
    ok(c and [o["on"] for o in c["opts"]] == [False, True, False] and c["opts"][1]["badge"] == "2", "切回头一题：选过的那一个亮着")
    pa.get_by_role("button", name="下一题").click(); time.sleep(0.3)
    ok([o["on"] for o in card(pa)["opts"]] == [True, False, True], "再切回来：勾着的还勾着")
    shot(pa, "ask_2_multi.png")
    n_her = len(hers(pa))
    n_calls = len(calls())
    pa.locator(".kfs-ask .kfs-ask-ok").click()
    time.sleep(0.6)
    answer = "Q: 今晚吃什么？\nA: 烧烤\n\nQ: 吃完想干嘛？\nA: 散步、回家窝着"
    h = hers(pa)
    ok(not card(pa) and len(h) == n_her + 1 and h[-1].get("text") == answer, f"点“好了”：卡片收起来，一题一行问、一行答发给他（{h[-1].get('text') if h else None!r}）")
    ok(rows(pa) == [{"text": "他问了你 2 个问题 · 已答", "button": False}], f"那一行换成“已答”，点不了（{rows(pa)}）")
    him1 = [m for m in his_msgs(pa) if asks_of(m)][-1]
    ok(asks_of(him1)[0].get("done") and not asks_of(him1)[0].get("closed"), "存档里那张卡记着答过了")
    ok(wait_mock(lambda: len(calls()) > n_calls, 15), "她答的那一条照常等他回")
    body = calls()[-1]["body"]
    sent = last_user_texts(body)
    mine = [b["text"] for m in body["messages"] if m["role"] == "assistant" for b in m["content"] if b.get("type") == "text"]
    ok(answer in sent, f"他那边收到的就是这几行（{[s[:30] for s in sent]}）")
    ok(any("[ASK]\n问：今晚吃什么？\n- 火锅｜天冷了，热乎乎的" in t for t in mine), "他自己弹的那张卡原样在他上一回的话里（他看得见自己问了什么）")
    sys_text = "\n".join(b["text"] for b in body["system"] if b.get("type") == "text")
    ok("想让她挑一挑的时候" in sys_text and "[/ASK]" in sys_text, "名帖【回复格式】里教了他怎么弹")
    pa.get_by_text("收到：" + answer.split("\n")[0]).last.wait_for(timeout=20000)
    time.sleep(1.5)
    ok(not card(pa), "他回了别的话：卡片不再弹")
    shot(pa, "ask_3_answered.png")

    # ================= 自己写一句、跳过 =================
    queue("[ASK]\n问：周末去哪？\n- 公园\n- 商场\n问：几点出门？\n- 十点\n- 下午\n[/ASK]")
    say(pa, "周末呢")
    got, _ = wait_card(pa, "这一回没有字")
    other = pa.locator(".kfs-ask .kfs-ask-other")
    other.click()
    other.fill("去海边")
    time.sleep(0.3)
    c = card(pa)
    ok(got and c and c["ok"] and not c["skip"] and c["other"] == "去海边", "“其他回答”里写了字：“跳过”换成“好了”")
    shot(pa, "ask_4_other.png")
    other.press("Enter"); time.sleep(0.4)
    c = card(pa)
    ok(c and c["q"] == "几点出门？" and c["other"] == "" and c["skip"], "回车也算好了：跳到下一题（这一题的“其他回答”是空的）")
    pa.get_by_role("button", name="上一题").click(); time.sleep(0.3)
    ok(card(pa)["other"] == "去海边", "切回去：写的那一句还在")
    pa.get_by_role("button", name="下一题").click(); time.sleep(0.3)
    n_her = len(hers(pa))
    pa.locator(".kfs-ask .kfs-ask-skip").click(); time.sleep(0.6)
    h = hers(pa)
    ok(not card(pa) and len(h) == n_her + 1 and h[-1].get("text") == "Q: 周末去哪？\nA: 去海边\n\nQ: 几点出门？\nA: （跳过）", f"自己写的照发；跳过的那题写“（跳过）”（{h[-1].get('text') if h else None!r}）")
    pa.get_by_text("收到：Q: 周末去哪？").last.wait_for(timeout=20000)
    time.sleep(1.5)

    # ================= 全跳过：什么都不发；点开再答；✕ =================
    queue("[ASK]\n问：要不要喝奶茶？\n- 要\n- 不要\n[/ASK]")
    say(pa, "渴了")
    got, _ = wait_card(pa, "这一回没有字")
    n_her = len(hers(pa))
    n_calls = len(calls())
    pa.locator(".kfs-ask .kfs-ask-skip").click(); time.sleep(3.2)
    ok(got and not card(pa) and len(hers(pa)) == n_her and len(calls()) == n_calls, "一题都没答（全跳过）：卡片收起来，什么都不发，也不叫他回")
    ok(rows(pa)[-1] == {"text": "他问了你 1 个问题 · 点开答", "button": True}, f"那一行还是“点开答”（{rows(pa)[-1]}）")
    pa.locator(".kfs-ask-row").last.click(); time.sleep(0.6)
    c = card(pa)
    ok(c and c["q"] == "要不要喝奶茶？" and c["pager"] == "" and c["skip"], "点那一行：卡片再浮出来，从头答（只有一题的不摆切题）")
    pa.locator(".kfs-ask .kfs-ask-x").click(); time.sleep(0.6)
    him3 = his_msgs(pa)[-1]
    ok(not card(pa) and asks_of(him3)[0].get("closed") and not asks_of(him3)[0].get("done"), "✕：收起来，存档里记着关掉过")
    time.sleep(1.0)
    ok(not card(pa), "关掉的不再自己弹")
    pa.locator(".kfs-ask-row").last.click(); time.sleep(0.6)
    tap_opt(pa, "要")
    h = hers(pa)
    ok(not card(pa) and h[-1].get("text") == "Q: 要不要喝奶茶？\nA: 要" and rows(pa)[-1]["text"] == "他问了你 1 个问题 · 已答", "关掉以后点开再答：照样发，那一行换成“已答”")
    pa.get_by_text("收到：Q: 要不要喝奶茶？").last.wait_for(timeout=20000)
    time.sleep(1.5)

    # ================= 卡片开着、她直接打字发了 =================
    queue("[ASK]\n问：看哪部电影？\n- 甲片\n- 乙片\n[/ASK]")
    say(pa, "看电影吗")
    got, _ = wait_card(pa, "这一回没有字")
    n_her = len(hers(pa))
    say(pa, "都行，你挑")
    time.sleep(0.8)
    h = hers(pa)
    him4 = [m for m in his_msgs(pa) if asks_of(m)][-1]
    ok(got and not card(pa) and len(h) == n_her + 1 and h[-1].get("text") == "都行，你挑" and asks_of(him4)[0].get("closed"), "卡片开着、她直接打字发了：卡片收起来，她那句照常发")
    ok(rows(pa)[-1] == {"text": "他问了你 1 个问题 · 点开答", "button": True}, "那一行还是“点开答”（想答还能点开）")
    pa.get_by_text("收到：都行，你挑").last.wait_for(timeout=20000)
    time.sleep(1.5)

    # ================= 没答的卡：重开开封府还在 =================
    queue("[ASK]\n问：明天几点叫你？\n- 七点\n- 八点\n[/ASK]")
    say(pa, "明天要早起")
    got, _ = wait_card(pa, "这一回没有字")
    pa.reload()
    kite(pa)
    back_to_last(pa)
    got2, _ = wait_card(pa, "这一回没有字", 10)
    ok(got and got2 and card(pa)["q"] == "明天几点叫你？", "没答的卡：重开开封府、回到这段对话，卡片还在")

    # ================= 重新回答：旧卡收起来，新回话里的卡照样弹 =================
    queue("先问一个\n[SPLIT]\n[ASK]\n问：原来那题？\n- 甲\n- 乙\n[/ASK]")
    say(pa, "再问问")
    got, _ = wait_card(pa, "先问一个")
    ok(got and card(pa)["q"] == "原来那题？", "（一张新卡）")
    queue("换个问法\n[SPLIT]\n[ASK]\n问：换成这题？\n- 丙\n- 丁\n- 戊\n[/ASK]")
    retry_last(pa)
    time.sleep(0.4)
    gone = not card(pa)
    got, early = wait_card(pa, "换个问法")
    c = card(pa)
    ok(gone and got and not early and c["q"] == "换成这题？" and [o["badge"] for o in c["opts"]] == ["1", "2", "3"] and not any(o["on"] for o in c["opts"]),
       f"重新回答：旧卡当场收起来；新回话蹦完了，新卡浮出来，从头答（{c and c['q']}）")

    # ================= 键盘起来：卡片和输入框一起铺到键盘上面 =================
    pa.locator(".kfs-ask .kfs-ask-other").click(); time.sleep(0.3)
    pa.evaluate("window.__kfsKeyboard(500)"); time.sleep(0.8)
    c = card(pa)
    comp = pa.evaluate(RECT, ".kfs-composer")
    ok(c and comp and c["bottom"] <= comp["top"] and comp["bottom"] <= 500 and c["top"] >= 0 and pa.evaluate("document.activeElement && document.activeElement.classList.contains('kfs-ask-other')"),
       f"在“其他回答”里打字、键盘起来：卡片、输入框一起铺到键盘上面（输入框底边 {comp and comp['bottom']} ≤ 500）")
    shot(pa, "ask_5_keyboard.png")
    pa.evaluate("document.activeElement.blur()"); pa.evaluate("window.__kfsKeyboard(null)"); time.sleep(0.6)
    pa.locator(".kfs-ask .kfs-ask-x").click(); time.sleep(0.5)

    # ================= 另一双眼睛挑出来的那几样 =================
    # 单选：“其他回答”里写着字再点选项，字一起带上
    queue("[ASK]\n问：烧烤要几分辣？\n- 微辣\n- 中辣\n- 特辣\n[/ASK]")
    say(pa, "晚上吃烧烤")
    got, _ = wait_card(pa, "这一回没有字")
    other = pa.locator(".kfs-ask .kfs-ask-other")
    other.click(); other.fill("多放孜然"); time.sleep(0.2)
    tap_opt(pa, "中辣")
    time.sleep(0.5)
    h = hers(pa)
    ok(got and not card(pa) and h[-1].get("text") == "Q: 烧烤要几分辣？\nA: 中辣、多放孜然", f"单选：写着字再点选项，写的字一起带上（{h[-1].get('text')!r}）")
    pa.get_by_text("收到：Q: 烧烤要几分辣？").last.wait_for(timeout=20000)
    time.sleep(1.5)

    # 翻回去改了勾、没再点“好了”：交的是改过的
    queue("[ASK]\n问（多选）：周末带什么？\n- 伞\n- 水\n- 零食\n问：几点走？\n- 早上\n- 中午\n[/ASK]")
    say(pa, "周末出去")
    got, _ = wait_card(pa, "这一回没有字")
    tap_opt(pa, "伞"); tap_opt(pa, "零食")
    pa.locator(".kfs-ask .kfs-ask-ok").click(); time.sleep(0.4)
    on2 = card(pa)["q"] == "几点走？"
    pa.get_by_role("button", name="上一题").click(); time.sleep(0.3)
    tap_opt(pa, "零食")
    pa.get_by_role("button", name="下一题").click(); time.sleep(0.3)
    tap_opt(pa, "早上")
    time.sleep(0.5)
    h = hers(pa)
    ok(got and on2 and not card(pa) and h[-1].get("text") == "Q: 周末带什么？\nA: 伞\n\nQ: 几点走？\nA: 早上", f"多选答完了又翻回去勾掉一个、没再点“好了”：交的是卡上眼下勾着的（{h[-1].get('text')!r}）")
    pa.get_by_text("收到：Q: 周末带什么？").last.wait_for(timeout=20000)
    time.sleep(1.5)

    # 一条话里两张卡：只自己弹头一张，关掉了第二张不跟着冒
    queue("[ASK]\n问：第一张？\n- 一\n- 二\n[/ASK]\n[ASK]\n问：第二张？\n- 三\n- 四\n[/ASK]")
    say(pa, "两张")
    got, _ = wait_card(pa, "这一回没有字")
    first_q = card(pa)["q"] if card(pa) else None
    pa.locator(".kfs-ask .kfs-ask-x").click(); time.sleep(1.2)
    ok(got and first_q == "第一张？" and not card(pa) and [r["text"] for r in rows(pa)[-2:]] == ["他问了你 1 个问题 · 点开答"] * 2,
       "一条话里两张卡：只自己弹头一张；关掉了，第二张不跟着冒，两行都还能点开")
    pa.locator(".kfs-ask-row").last.click(); time.sleep(0.5)
    ok(card(pa) and card(pa)["q"] == "第二张？", "点第二张那一行：第二张浮出来")
    pa.locator(".kfs-ask .kfs-ask-x").click(); time.sleep(0.4)

    # 没写 [/ASK]：卡到 [SPLIT] 为止，后面那句照常是他的话
    queue("[ASK]\n问：忘了收尾？\n- 甲\n- 乙\n[SPLIT]\n后面那句照常是话")
    say(pa, "写岔")
    got, early = wait_card(pa, "后面那句照常是话")
    c = card(pa)
    ok(got and not early and c and [o["text"] for o in c["opts"]] == ["1甲", "2乙"], f"没写 [/ASK]：卡到 [SPLIT] 为止，后面那句照常是他的气泡，蹦完了卡才出来（{c and [o['text'] for o in c['opts']]}）")
    pa.locator(".kfs-ask .kfs-ask-x").click(); time.sleep(0.4)

    # 只弹了一张卡、一个气泡都没有的那条：长按那一行出菜单，能重新回答
    queue("[ASK]\n问：只有卡？\n- 是\n- 否\n[/ASK]")
    say(pa, "只弹卡")
    got, _ = wait_card(pa, "这一回没有字")
    pa.locator(".kfs-ask .kfs-ask-x").click(); time.sleep(0.4)
    queue("重答了\n[SPLIT]\n[ASK]\n问：重答的卡？\n- 好\n- 不好\n[/ASK]")
    wait_js(pa, "!document.querySelector('.kfs-typing')", 30000)
    pa.locator(".kfs-ask-row").last.click(button="right"); time.sleep(0.5)
    acts = pa.locator(".z-50 button").all_inner_texts()
    pa.locator(".z-50 button", has_text="重新回答").first.click()
    got2, early = wait_card(pa, "重答了")
    ok(got and acts == ["重新回答"] and got2 and not early and card(pa)["q"] == "重答的卡？",
       f"只弹了一张卡的那条：长按（右键）那一行出菜单（{acts}），点“重新回答”，新回话照常蹦、新卡照常弹")
    pa.locator(".kfs-ask .kfs-ask-x").click(); time.sleep(0.4)

    # 重新回答等着的工夫里，答了上面那张卡：“已答”不丢
    queue("[ASK]\n问：上面那张？\n- 左\n- 右\n[/ASK]")
    say(pa, "上面一张")
    got, _ = wait_card(pa, "这一回没有字")
    say(pa, "先不答，再说一句")
    pa.get_by_text("收到：先不答，再说一句").last.wait_for(timeout=20000)
    time.sleep(1.5)
    mock("/__debug/claude-hold?ms=6000")
    queue("（重答的那一版）")
    retry_last(pa)
    time.sleep(0.8)
    pa.locator(".kfs-ask-row").last.click(); time.sleep(0.5)
    mid_q = card(pa)["q"] if card(pa) else None
    tap_opt(pa, "右")
    time.sleep(0.4)
    pa.get_by_text("（重答的那一版）").last.wait_for(timeout=25000)
    time.sleep(1.5)
    up = [m for m in his_msgs(pa) if asks_of(m) and asks_of(m)[0]["qs"][0]["q"] == "上面那张？"]
    ok(mid_q == "上面那张？" and up and asks_of(up[-1])[0].get("done") and pa.locator(".kfs-ask-row", has_text="已答").count() >= 1
       and any(m.get("text") == "Q: 上面那张？\nA: 右" for m in hers(pa)),
       "重新回答等着的工夫里点开上面那张卡答了：新回答到了以后那一行还是“已答”（存档里也记着），她答的那条照留着")

    ok(not errors, f"页面没报错（{errors[:3]}）")
    browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
if count["failed"]: raise SystemExit(1)
