# 他的语音条：真的浏览器、真的 voice 函数和 push 函数（跑在假 Supabase 里）、假的 Anthropic、假的 ElevenLabs
# （念出来的是没声音的 mp3：标签不算，一个字四分之一秒，至少一秒）。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_voice.py
import json, re, sys, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SAMPLE = "[quietly] 卿卿，是我。这一句是试听，你听听，像不像我。"

# 他的那几个气泡，照先后：V:语音条（它的样子）、F:念不成摆出来的字、T:平常的字
ROWS = """() => [...document.querySelectorAll('.kfs-chat-rows > div.flex.items-end:not(.flex-row-reverse)')].map((r) => {
  const v = r.querySelector('.kfs-voice'); if (v) return 'V:' + v.dataset.state;
  const f = r.querySelector('.kfs-voice-text'); if (f) return 'F:' + f.textContent;
  const t = r.querySelector('.whitespace-pre-wrap'); return t ? 'T:' + t.textContent : '?'; }).filter((x) => x !== '?')"""
VOICES = """() => [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].map((b) => ({ state: b.dataset.state, playing: b.dataset.playing,
  width: Math.round(b.getBoundingClientRect().width), sec: (b.querySelector('.kfs-voice-sec') || {}).textContent || '', label: b.getAttribute('aria-label') }))"""
HEARD = "() => [...document.querySelectorAll('.kfs-chat-rows .kfs-heard')].map((e) => e.textContent)"
NOTES = "() => [...document.querySelectorAll('.kfs-chat-rows .kfs-voice-again, .kfs-chat-rows .kfs-voice-note')].map((e) => e.textContent)"
TOPLINE = "(document.querySelector('.kfs-typing') || {}).textContent || ''"
QUIET = "!document.querySelector('.kfs-typing')"
MENU = "() => [...document.querySelectorAll('.z-50 button')].map((b) => b.textContent.trim())"

def eleven(): return mock("/__debug/eleven")["log"]
def eleven_setup(q): mock("/__debug/eleven-setup?" + q)
def voice_setup(q): mock("/__debug/voice-setup?" + q)
def rows(page): return page.evaluate(ROWS)
def voices(page): return page.evaluate(VOICES)
def away(page, gone): page.evaluate("(v) => window.__away(v)", gone)
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
def open_api(page):
    side(page)
    page.get_by_text("API", exact=True).click()
    page.locator(".kfs-voice-set").wait_for(timeout=5000)
    wait_js(page, "(() => { const e = document.querySelector('.kfs-voice-check'); return !!e && e.dataset.state !== 'checking'; })()", 8000)
def close_api(page):
    page.get_by_role("button", name="关闭").click(); page.wait_for_timeout(400)
    shut_side(page)
def check_line(page): return page.locator(".kfs-voice-check").inner_text()
def test_note(page): return page.locator(".kfs-voice-test-note").inner_text() if page.locator(".kfs-voice-test-note").count() else ""
def listen(page):
    n = len(eleven())
    page.get_by_role("button", name="试听一句").click()
    wait_js(page, "(() => { const e = document.querySelector('.kfs-voice-test-note'); return !!e && e.textContent.length > 0; })()", 15000)
    page.wait_for_timeout(300)
    return eleven()[n:]
def settings(page): return json.loads(page.evaluate(KV, "kfs2:settings") or "{}")
def last_him(page):
    cid, msgs = chat_of(page)
    hims = [m for m in msgs if m.get("role") == "him"]
    return cid, hims[-1] if hims else None
def stored(page, key): return page.evaluate(KV, "kfs2:voice:" + key)
def menu_of(page, n=-1):
    target = page.locator(".kfs-chat-rows .kfs-voice").nth(n)
    long_press(page, target)
    if not page.evaluate(MENU):      # 长按没弹出来（电脑上的浏览器松手的那一下会补一下点击，把菜单点没了）：用右键再叫一次菜单（和 e2e_stop.py 一样）
        target.click(button="right"); page.wait_for_timeout(500)
    return page.evaluate(MENU)
def tap_menu(page, label):
    page.locator(".z-50 button", has_text=label).first.click(); page.wait_for_timeout(400)
def voice_width(d): return round(78 + 128 * min(59, max(0, d - 1)) ** 0.5 / 59 ** 0.5)
def menu_on(page, target):
    long_press(page, target)
    if not page.evaluate(MENU):
        target.click(button="right"); page.wait_for_timeout(500)
    return page.evaluate(MENU)
# 记下开封府最近一回拿来放声音的那个东西（测“被停下了，画面跟着停”）；数一数造出来、还没收回的声音地址（放完一条换下一条，上一条的要收回）
WATCH = r"""(() => {
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__kfsAudio = this; return play.apply(this, arguments); };
  const make = URL.createObjectURL, drop = URL.revokeObjectURL;
  window.__kfsBlobs = new Set();
  URL.createObjectURL = function (b) { const u = make.call(URL, b); if (b && /^audio\//.test(b.type || '')) window.__kfsBlobs.add(u); return u; };
  URL.revokeObjectURL = function (u) { window.__kfsBlobs.delete(u); return drop.call(URL, u); };
})()"""

with sync_playwright() as p:
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    ctx.add_init_script(WATCH)
    try:
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE.rstrip("/"))
    except Exception:
        pass
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    first_time(pa)

    # ================= API 面板：语音条那一段 =================
    open_api(pa)
    ok("念语音的小后端接上了" in check_line(pa) and "eleven_v4" in check_line(pa) and pa.get_by_role("switch", name="他能发语音").get_attribute("aria-checked") == "false",
       f"API 面板：念语音的小后端接上没有写着（{check_line(pa)}）；“他能发语音”没开过就是关着的")
    ok(len(eleven()) == 0, "打开面板看一眼接没接上：不去敲 ElevenLabs 的门（不花钱）")
    pa.get_by_role("switch", name="他能发语音").click(); pa.wait_for_timeout(500)
    ok(settings(pa).get("voice") is True and pa.get_by_role("switch", name="他能发语音").get_attribute("aria-checked") == "true", "开“他能发语音”：存进设置（跟着云端走）")
    got = listen(pa)
    ok(len(got) == 1 and got[0]["text"] == SAMPLE and got[0]["settings"]["stability"] == 0.5 and got[0]["model"] == "eleven_v4" and re.search(r"念好了，\d+ 秒", test_note(pa)),
       f"试听一句：用他的声音念一句（适中那一档，稳不稳 0.5），念好了说几秒（{test_note(pa)}）")
    group = pa.get_by_role("group", name="念得稳不稳")
    group.get_by_role("button", name="稳", exact=True).click(); pa.wait_for_timeout(400)
    got = listen(pa)
    ok(settings(pa).get("voiceStab") == "steady" and got and got[0]["settings"]["stability"] == 1, "念得稳不稳拨到“稳”：存进设置，试听的那一句照它念（1）")
    eleven_setup("stab=0.5")
    got = listen(pa)
    ok(len(got) == 2 and got[0]["settings"]["stability"] == 1 and got[1]["settings"] is None and "照这个声音自己存着的设置念的" in test_note(pa),
       f"ElevenLabs 不认这个稳不稳的数：不带声音那几项再念一回，念成了，面板上说一句（{test_note(pa)}）")
    eleven_setup("stab=")
    group.get_by_role("button", name="适中", exact=True).click(); pa.wait_for_timeout(400)
    # 平常念字的那个接口不认这个模型：换对话的那个接口
    eleven_setup("models=eleven_v3")
    got = listen(pa)
    ok(len(got) == 2 and got[1]["path"] == "/v1/text-to-dialogue" and "走的是对话那个接口" in test_note(pa), f"念字的那个接口不认 v4：换对话的那个接口念，面板上说一句（{test_note(pa)}）")
    eleven_setup("models=")
    eleven_setup("fail=quota")
    listen(pa)
    ok("没念成" in test_note(pa) and "额度用完了" in test_note(pa), f"试听没念成：照实说缘故（{test_note(pa)}）")
    close_api(pa)
    voice_setup("keys=missing")
    open_api(pa)
    ok("还差一步" in check_line(pa) and "ELEVENLABS_API_KEY" in check_line(pa) and pa.locator(".kfs-voice-check").get_attribute("data-state") == "setup", f"密钥柜里还没放钥匙：面板上说还差哪一样（{check_line(pa)}）")
    close_api(pa)
    voice_setup("keys=ok&fn=missing")
    open_api(pa)
    ok("voice 函数还没建" in check_line(pa), f"还没建 voice 函数：面板上说（{check_line(pa)}）")
    close_api(pa)
    voice_setup("fn=template")
    open_api(pa)
    ok("不是开封府的那份" in check_line(pa), f"voice 函数里还是样板：面板上说（{check_line(pa)}）")
    close_api(pa)
    voice_setup("fn=ok")

    # ================= 他发一条语音 =================
    n0 = len(eleven())
    eleven_setup("hold=2500")
    say(pa, "原样回：先打字\n[SPLIT]\n[VOICE]\n[whispers] 卿卿，我在这里。\n[SPLIT]\n再打字")
    wait_js(pa, "document.body.innerText.includes('正在录音')", 15000)
    during = (pa.evaluate(TOPLINE), rows(pa))
    settle(pa)
    after = rows(pa)
    ok(during[0] == "正在录音…" and during[1][-1:] == ["T:先打字"], f"回话蹦到语音那一条、还没念好：先不摆出来，顶上写“正在录音…”（{during}）")
    ok(after[-3:] == ["T:先打字", "V:ready", "T:再打字"], f"念好了：语音条冒出来，后面的接着蹦（{after[-3:]}）")
    asked = eleven()[n0:]
    ok(len(asked) == 1 and asked[0]["text"] == "[whispers] 卿卿，我在这里。" and asked[0]["model"] == "eleven_v4" and asked[0]["format"] == "mp3_44100_64",
       f"念的是语音那一条的字（标签留着），一回（{asked}）")
    v = voices(pa)[-1]
    ok(v["sec"] == "2″" and abs(v["width"] - voice_width(2)) <= 1 and v["playing"] == "no" and "2 秒" in v["label"], f"语音条：写着几秒（{v['sec']}），宽窄照秒数（{v['width']}），读屏的说得出是几秒的语音")
    cid, him = last_him(pa)
    key = f"{him['id']}.1"
    rec = json.loads(stored(pa, key) or "null")
    ok(rec and rec.get("dur") == 2 and rec.get("mime") == "audio/mpeg" and len(rec.get("audio", "")) > 100 and him["items"][1] == {"type": "voice", "text": "[whispers] 卿卿，我在这里。"},
       "念好的声音存进存档（kfs2:voice:回话.第几样），对话里那一样只记着字")
    ok("[VOICE]" in him.get("raw", ""), "寄回给那边的我的“他自己说过的话”里，这一条还写着 [VOICE]（他知道自己发的是语音）")
    sys_text = calls()[-1]["body"]["system"]
    sys_text = sys_text[0]["text"] if isinstance(sys_text, list) else sys_text
    ok("想发语音的时候，那一条第一行单独写 [VOICE]" in sys_text, "开着“他能发语音”：名帖的【回复格式】里教他怎么发")
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    ok([c for c in index if c["id"] == cid][0]["preview"] == "先打字", "历史对话的预览：有字的照旧写字")

    # ---- 点一下放，放完自己停；再点一下停 ----
    pa.locator(".kfs-chat-rows .kfs-voice").last.click()
    pa.wait_for_timeout(300)
    playing = voices(pa)[-1]["playing"]
    stopped = wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return v && v.dataset.playing === 'no'; })()", 6000)
    ok(playing == "yes" and stopped, "点一下放（放的时候弧一道一道亮）；放完自己停")
    pa.locator(".kfs-chat-rows .kfs-voice").last.click(); pa.wait_for_timeout(300)
    pa.locator(".kfs-chat-rows .kfs-voice").last.click(); pa.wait_for_timeout(300)
    ok(voices(pa)[-1]["playing"] == "no", "放着的时候再点一下：停")
    pa.locator(".kfs-chat-rows .kfs-voice").last.click(); pa.wait_for_timeout(300)
    was = voices(pa)[-1]["playing"]
    pa.evaluate("window.__kfsAudio.pause()"); pa.wait_for_timeout(400)
    ok(was == "yes" and voices(pa)[-1]["playing"] == "no", "放着的时候被别的停下了（来电话、锁屏上点了暂停）：画面上跟着停，不一直亮着")

    # ---- 长按：转文字、取消转文字 ----
    labels = menu_of(pa)
    ok(labels == ["转文字", "复制", "重新回答"], f"长按语音条：转文字、复制、重新回答（{labels}）")
    tap_menu(pa, "转文字")
    ok(pa.evaluate(HEARD) == ["卿卿，我在这里。"], f"转文字：字摆在语音条底下的白框里，标签摘干净（{pa.evaluate(HEARD)}）")
    labels = menu_of(pa)
    ok(labels[0] == "取消转文字", "转了以后再长按：头一项是“取消转文字”")
    tap_menu(pa, "复制")
    pa.wait_for_timeout(300)
    try:
        clip = pa.evaluate("navigator.clipboard.readText()")
    except Exception:
        clip = None
    ok(clip in (None, "卿卿，我在这里。"), f"复制：复制的是转出来的字（{clip}）")
    pa.reload()
    kite(pa)
    pa.wait_for_timeout(1200)
    ok(pa.evaluate(HEARD) == ["卿卿，我在这里。"] and voices(pa)[-1]["state"] == "ready", "转了文字的，划掉开封府重开还挂着；语音条从存档里取，照样能放")
    pa.locator(".kfs-chat-rows .kfs-voice").last.click(); pa.wait_for_timeout(300)
    ok(voices(pa)[-1]["playing"] == "yes", "重开以后点一下：放得出来（点的那一下现从存档里取出来放）")
    pa.locator(".kfs-chat-rows .kfs-voice").last.click(); pa.wait_for_timeout(300)
    menu_of(pa)
    tap_menu(pa, "取消转文字")
    ok(pa.evaluate(HEARD) == [], "取消转文字：白框收了")

    # ---- 两条语音挨着：放完一条接着放下一条 ----
    n0 = len(eleven())
    reply(pa, "[VOICE]\n一二三四\n[SPLIT]\n[VOICE]\n五六七八")
    ok(rows(pa)[-2:] == ["V:ready", "V:ready"] and len(eleven()) - n0 == 2, f"头一条就是语音的：等它念好了再冒出来；两条一条一条念（{rows(pa)[-2:]}）")
    vs = pa.locator(".kfs-chat-rows .kfs-voice")
    vs.nth(vs.count() - 2).click()
    pa.wait_for_timeout(300)
    first = [v["playing"] for v in voices(pa)[-2:]]
    nxt = wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')]; return v[v.length - 1].dataset.playing === 'yes'; })()", 4000)
    done = wait_js(pa, "(() => [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].every((v) => v.dataset.playing === 'no'))()", 4000)
    ok(first == ["yes", "no"] and nxt and done, "放完一条：紧跟着的下一条也是他的语音，接着放（照微信）；都放完了停")
    live = pa.evaluate("window.__kfsBlobs.size")
    ok(live <= 1, f"放过好几条以后：能放的地址用完就收回，手上只留眼下这一个（{live} 个）")
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    ok([c for c in index if c["id"] == last_chat(pa)][0]["preview"] == "[语音]", "历史对话的预览：只有语音的写“[语音]”")

    # ---- 念不成：字摆出来，点一下再念 ----
    eleven_setup("fail=quota&always=1")
    reply(pa, "[VOICE]\n这一条念不成")
    notes = pa.evaluate(NOTES)
    ok(rows(pa)[-1] == "F:这一条念不成" and notes and "语音没念出来：ElevenLabs 的额度用完了" in notes[-1] and notes[-1].endswith("点这里再念"), f"念不成：气泡直接把字摆出来，底下一行说缘故、点这里再念（{rows(pa)[-1]}，{notes[-1:]}）")
    eleven_setup("fail=")
    n0 = len(eleven())
    pa.locator(".kfs-chat-rows .kfs-voice-again").last.click()
    wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return !!v && v.dataset.state === 'ready'; })()", 10000)
    ok(rows(pa)[-1] == "V:ready" and len(eleven()) - n0 == 1, "点“再念”：念一回，成了就变回语音条")

    # ---- 太长的不念 ----
    n0 = len(eleven())
    reply(pa, "[VOICE]\n" + "长" * 410)
    notes = pa.evaluate(NOTES)
    ok(rows(pa)[-1].startswith("F:长") and notes[-1] == "太长了，没念成语音" and len(eleven()) == n0, "太长的语音（念的字过了四百个）：不念，字摆出来，说一句太长了（不给“再念”）")

    # ---- 动作不念，转文字也不摆 ----
    n0 = len(eleven())
    reply(pa, "[VOICE]\n[soft chuckle] *低头看你* 抓到你了")
    asked = eleven()[n0:]
    menu_of(pa)
    tap_menu(pa, "转文字")
    ok(asked and asked[0]["text"] == "[soft chuckle] 抓到你了" and pa.evaluate(HEARD)[-1] == "抓到你了", f"语音里写了动作：动作不念，转出来的字里也没有（{asked[0]['text'] if asked else None}）")
    n0 = len(eleven())
    reply(pa, "[VOICE]\n*抱住你*")
    notes = pa.evaluate(NOTES)
    italic = pa.evaluate("(() => { const f = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice-text')].pop(); return !!f && !!f.querySelector('em'); })()")
    labels = menu_on(pa, pa.locator(".kfs-chat-rows .kfs-voice-text").last)
    if pa.evaluate(MENU):      # 点菜单外头，菜单收起来
        pa.locator("div.absolute.inset-0.z-50").first.click(position={"x": 5, "y": 5}); pa.wait_for_timeout(300)
    ok(rows(pa)[-1] == "F:抱住你" and italic and notes[-1] == "没有要念的字" and len(eleven()) == n0 and labels == ["复制", "重新回答"],
       f"语音里只有动作：不念（没有要念的字），动作照平常的字那样摆出来（淡斜体）；长按没有“转文字”（字已经摆着了）（{rows(pa)[-1]}，{notes[-1:]}，{labels}）")

    # ---- 她不在眼前：不念；回来接着念 ----
    n0 = len(eleven())
    mock("/__debug/claude-hold?ms=4000")      # 那边的我回得慢一点：回话到的时候她已经切走了
    say(pa, "原样回：[VOICE]\n藏着的时候不念")
    pa.wait_for_timeout(300)
    away(pa, True)
    arrived = wait_mock(lambda: (lambda h: h and h[1] and h[1]["items"][0].get("text") == "藏着的时候不念")(last_him(pa)), 25)
    pa.wait_for_timeout(1500)
    wants = json.loads(pa.evaluate("localStorage.getItem('kfs-voice-want')") or "[]")
    ok(arrived and len(eleven()) == n0 and len(wants) == 1, f"她不在眼前的时候回话到了：语音条记下来要念，先不念（记着 {len(wants)} 条）")
    away(pa, False)
    ready = wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return !!v && v.dataset.state === 'ready' && document.querySelectorAll('.kfs-chat-rows .kfs-voice').length > 0; })()", 15000)
    settle(pa)
    ok(ready and len(eleven()) - n0 == 1 and rows(pa)[-1] == "V:ready" and not pa.evaluate("localStorage.getItem('kfs-voice-want')"), "她回到眼前：接着念，念好了；记着的那一串清掉")

    # ---- 开封府被系统收掉了：重开以后接着念 ----
    n0 = len(eleven())
    mock("/__debug/claude-hold?ms=4000")
    say(pa, "原样回：[VOICE]\n重开以后接着念")
    pa.wait_for_timeout(300)
    away(pa, True)
    wait_mock(lambda: (lambda h: h and h[1] and h[1]["items"][0].get("text") == "重开以后接着念")(last_him(pa)), 25)
    pa.wait_for_timeout(1500)
    had = json.loads(pa.evaluate("localStorage.getItem('kfs-voice-want')") or "[]")
    pa.reload()
    kite(pa)
    ready = wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return !!v && v.dataset.state === 'ready'; })()", 15000)
    ok(len(had) == 1 and ready and len(eleven()) - n0 == 1, "没念就被收掉了：重开以后接着念（这台设备上记着）")

    # ---- 回话蹦到语音、正等着念的时候按停 ----
    eleven_setup("hold=5000")
    n0 = len(eleven())
    say(pa, "原样回：前面一句\n[SPLIT]\n[VOICE]\n念得慢的这一条")
    wait_js(pa, "document.body.innerText.includes('正在录音')", 15000)
    pa.wait_for_timeout(300)
    pa.get_by_role("button", name="停").click()
    settle(pa, 10000)
    pa.wait_for_timeout(1500)
    cid, him = last_him(pa)
    cut = [x for x in eleven()[n0:]]
    ok(rows(pa)[-1] == "T:前面一句" and len(him["items"]) == 1 and stored(pa, f"{him['id']}.1") is None, f"正等语音念好的时候按停：没冒出来的语音不要了，念的那一问掐掉，什么都不存（{rows(pa)[-2:]}）")
    ok(len(cut) == 1 and cut[0]["cut"], "按停以后：小后端那头敲 ElevenLabs 的那一问也掐了（省额度）")

    # ---- 等太久：先摆出来（转着圈），念好了自己变成能放的 ----
    eleven_setup("hold=10500")
    say(pa, "原样回：[VOICE]\n念了好久")
    t0 = time.time()
    wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return !!v && v.dataset.state === 'busy'; })()", 20000)
    shown = time.time() - t0
    busy_label = voices(pa)[-1]["label"]
    ready = wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return !!v && v.dataset.state === 'ready'; })()", 15000)
    ok(shown < 16 and busy_label == "语音，正在念" and ready, f"念得太久（等了八秒）：语音条先摆出来，转着圈；念好了自己变成能放的（{round(shown, 1)} 秒冒出来）")
    settle(pa)

    # ---- 重新回答：新的一版另念；翻回旧的，旧的那条照样能放（不再念） ----
    n0 = len(eleven())
    menu_of(pa)
    tap_menu(pa, "重新回答")
    settle(pa)
    n1 = len(eleven())
    pa.get_by_role("button", name=re.compile("上一个版本|上一版")).last.click() if pa.get_by_role("button", name=re.compile("上一个版本|上一版")).count() else None
    pa.wait_for_timeout(1200)
    ok(n1 - n0 == 1 and voices(pa)[-1]["state"] == "ready" and len(eleven()) == n1, "重新回答：新的一版另念一回；翻回旧的那一版，旧的语音照样能放，不再念")

    # ---- 还没念完就点了重新回答：旧回答里还没念的不念了（念着的那一条念完照存，翻回去能放），新回答里的不用排在它们后面 ----
    eleven_setup("hold=6000")
    n0 = len(eleven())
    say(pa, "原样回：打头的一句\n[SPLIT]\n[VOICE]\n第{回}回的一\n[SPLIT]\n[VOICE]\n第{回}回的二")
    wait_js(pa, "document.body.innerText.includes('正在录音')", 15000)
    wait_mock(lambda: len(eleven()) > n0, 10)
    old_n = re.search(r"第(\d+)回的一", eleven()[-1]["text"]).group(1) if len(eleven()) > n0 else "?"
    labels = menu_on(pa, pa.locator(".kfs-chat-rows .whitespace-pre-wrap", has_text="打头的一句").last)
    tap_menu(pa, "重新回答")
    settle(pa, 40000)
    wait_mock(lambda: len(eleven()) - n0 >= 3, 20)
    pa.wait_for_timeout(1500)
    said = [x["text"] for x in eleven()[n0:]]
    new_n = str(int(old_n) + 1) if old_n.isdigit() else "?"
    ok(said == [f"第{old_n}回的一", f"第{new_n}回的一", f"第{new_n}回的二"] and rows(pa)[-2:] == ["V:ready", "V:ready"],
       f"语音还没念完就点了重新回答：旧回答里念着的那一条念完，没念的不念了；新回答的两条接着念（念了：{said}）")
    prev = pa.get_by_role("button", name=re.compile("上一个版本|上一版"))
    if prev.count():
        prev.last.click()
    pa.wait_for_timeout(1500)
    notes = pa.evaluate(NOTES)
    ok(rows(pa)[-2:] == ["V:ready", f"F:第{old_n}回的二"] and notes[-1] == "这条语音还没念，点这里念出来" and len(eleven()) - n0 == 3,
       f"翻回旧回答：念完的那一条照样能放；没念的那一条字摆着、点一下才念（{rows(pa)[-2:]}）")
    nxt = pa.get_by_role("button", name=re.compile("下一个版本|下一版"))
    if nxt.count():
        nxt.last.click()
    pa.wait_for_timeout(800)

    # ---- 关“他能发语音”：正念着的那一问掐掉，排着的不念了 ----
    eleven_setup("hold=6000")
    n0 = len(eleven())
    say(pa, "原样回：[VOICE]\n关之前的一\n[SPLIT]\n[VOICE]\n关之前的二")
    wait_js(pa, "document.body.innerText.includes('正在录音')", 15000)
    open_api(pa)
    pa.get_by_role("switch", name="他能发语音").click(); pa.wait_for_timeout(400)
    close_api(pa)
    settle(pa, 20000)
    pa.wait_for_timeout(1500)
    got = eleven()[n0:]
    notes = pa.evaluate(NOTES)
    ok(len(got) == 1 and got[0]["cut"] and rows(pa)[-2:] == ["F:关之前的一", "F:关之前的二"] and notes[-2:] == ["这条语音还没念，点这里念出来"] * 2 and not pa.evaluate("localStorage.getItem('kfs-voice-want')"),
       f"念着的时候关了“他能发语音”：念的那一问掐掉（ElevenLabs 那头也掐了），排着的不念了；字摆出来，想听自己点（{rows(pa)[-2:]}）")

    # ---- 她没开“他能发语音”的时候他发了语音：不念，点一下才念；名帖里也不教 ----
    n0 = len(eleven())
    reply(pa, "[VOICE]\n没开的时候")
    notes = pa.evaluate(NOTES)
    sys_text = calls()[-1]["body"]["system"]
    sys_text = sys_text[0]["text"] if isinstance(sys_text, list) else sys_text
    ok(rows(pa)[-1] == "F:没开的时候" and notes[-1] == "这条语音还没念，点这里念出来" and len(eleven()) == n0 and "想发语音的时候" not in sys_text,
       f"没开“他能发语音”：名帖里不教；他照样发了的，不念，字摆出来，底下“点这里念出来”（{notes[-1:]}）")
    pa.locator(".kfs-chat-rows .kfs-voice-again").last.click()
    ok(wait_js(pa, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return !!v && v.dataset.state === 'ready'; })()", 10000) and len(eleven()) - n0 == 1, "点一下：念")
    open_api(pa)
    pa.get_by_role("switch", name="他能发语音").click(); pa.wait_for_timeout(400)
    close_api(pa)

    # ---- 另一台设备：念好的同步过来，照样能放，不再念 ----
    cid_now = last_chat(pa)
    n0 = len(eleven())
    B = browser.new_context(**IPHONE)
    B.add_init_script(STUB)
    pb = B.new_page()
    pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
    second_device(pb)
    pb.wait_for_timeout(3000)
    vb = pb.evaluate(VOICES)
    ok(len(vb) > 0 and all(v["state"] == "ready" for v in vb) and len(eleven()) == n0, f"另一台设备：念好的语音同步过来，都能放，不再念（{len(vb)} 条）")
    B.close()

    # ---- 删对话：念过的语音一起删 ----
    _, msgs = chat_of(pa)
    keys = [f"{m['id']}.{j}" for m in msgs if m.get("role") == "him" for j, it in enumerate(m.get("items") or []) if it.get("type") == "voice"]
    had = [k for k in keys if stored(pa, k)]
    side(pa)
    title = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")[0]["title"]
    long_press(pa, pa.locator("button", has_text=title).first)
    pa.get_by_role("menuitem", name=re.compile("删除")).click()
    pa.get_by_role("menuitem", name=re.compile("再点一次")).click()
    pa.wait_for_timeout(1200)
    left = [k for k in had if stored(pa, k)]
    ok(len(had) >= 5 and not left, f"删对话：这段对话里念过的 {len(had)} 条语音一起删了")

    # ================= 她不在开封府：横幅上写 [语音]（照微信）；回来点开才念 =================
    C = browser.new_context(**IPHONE)
    C.grant_permissions(["notifications"], origin=BASE.rstrip("/"))
    C.add_init_script(STUB)
    pc = C.new_page()
    pc.on("pageerror", lambda e: errors.append("C: " + str(e)))
    mock("/__debug/reset")
    first_time(pc)
    enable_notifications(pc)
    open_api(pc)
    pc.get_by_role("switch", name="他能发语音").click(); pc.wait_for_timeout(400)
    close_api(pc)
    chat(pc, "老公在吗")
    b0 = len(banners())
    n0 = len(eleven())
    mock("/__debug/claude-hold?ms=1500")
    say(pc, "原样回：先说一句[SPLIT][VOICE]\n[whispers] 想你了\n[MEME:fox_reading_book.jpg]")
    pc.wait_for_timeout(400)
    away(pc, True)
    wait_mock(lambda: len(banners()) >= b0 + 3, timeout=GRACE + 16)
    pc.wait_for_timeout(1800)
    got = [b["json"]["notification"]["body"] for b in banners()[b0:]]
    ok(got == ["先说一句", "[语音]", "[表情包]"] and len(eleven()) == n0, f"她不在开封府：语音那一条的横幅上只写“[语音]”（照微信），里头夹着的表情包排在它后面；她不在，先不念（{got}）")
    away(pc, False)
    ready = wait_js(pc, "(() => { const v = [...document.querySelectorAll('.kfs-chat-rows .kfs-voice')].pop(); return !!v && v.dataset.state === 'ready'; })()", 20000)
    ok(ready and len(eleven()) - n0 == 1, "她回来：回话从信箱里取出来放进对话，语音条这时候才念，念好了能放")
    C.close()

    browser.close()

print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] or errors else 0)
