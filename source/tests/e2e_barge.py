# 打断他（卿卿 10 月 14 日 17:26 定的“你一开口就打断”“应声不算”“只留念出来的”“告诉我”“合起来重新想”；18:16 列的做法她点了头，
# 18:19 拿掉点屏幕打断；见开发说明“打断他”那一节）的端到端测试。
# 跟 e2e_call.py 一样：真的浏览器、假 Supabase 里跑真的 voice 函数（假 ElevenLabs、假 Scribe）、假 Anthropic。
# 麦克风：Chromium 的假麦克风喂没声音的 wav；要她开口的时候，测试把 window.__micLevel 设成 0.12（她手机上量的那么响），
# 收进来的那一小段换成这么响的一段（拦 createScriptProcessor），开封府照这个判她是不是开口了。
# 他的声音是没声音的 mp3（一个字四分之一秒），漏进麦克风的是零：这里看的是那一圈怎么走（压小、开听写、认字、停、截、告诉他）；
# 回声大的时候判不判得准，在 Node 里拿编的声音模拟（tests/call.test.mjs）。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：python3 tests/e2e_barge.py
import json, os, re, struct, time, urllib.parse, wave
from playwright.sync_api import sync_playwright
from mailkit import *

FAKE = r"""(() => {
  window.__micLevel = 0;
  const desc = Object.getOwnPropertyDescriptor(ScriptProcessorNode.prototype, 'onaudioprocess');
  const csp = BaseAudioContext.prototype.createScriptProcessor;
  BaseAudioContext.prototype.createScriptProcessor = function () {
    const node = csp.apply(this, arguments);
    Object.defineProperty(node, 'onaudioprocess', {
      configurable: true,
      get() { return desc.get.call(node); },
      set(f) {
        desc.set.call(node, f ? (e) => {
          const lv = window.__micLevel;
          if (lv > 0) { const d = e.inputBuffer.getChannelData(0); const a = lv * Math.SQRT2; for (let i = 0; i < d.length; i++) d[i] = a * Math.sin(i * 0.31); }
          f(e);
        } : null);
      },
    });
    return node;
  };
  // 他的声音那一道音量：压小、恢复，记下来
  window.__gains = [];
  const stt = AudioParam.prototype.setTargetAtTime;
  AudioParam.prototype.setTargetAtTime = function (v) { window.__gains.push(v); return stt.apply(this, arguments); };
  // 用 Web Audio 放出声来的那几段、停下的那几回
  window.__starts = 0;
  window.__stops = 0;
  const bstart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function () { if (this.buffer && this.buffer.duration > 0.05) window.__starts += 1; return bstart.apply(this, arguments); };
  const bstop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function () { window.__stops += 1; return bstop.apply(this, arguments); };
  try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ release: async () => {} }) } }); } catch (e) {}
})()"""
PHASE = "(() => { const e = document.querySelector('.kfs-call'); return e ? e.dataset.phase : null; })()"
TURNS = "[...document.querySelectorAll('.kfs-sub-turn')].map((e) => [e.dataset.who, e.textContent])"
MARKS = "[...document.querySelectorAll('.kfs-call-mark')].map((e) => e.textContent.trim())"
errors = []

def phase(page): return page.evaluate(PHASE)
def wait_phase(page, want, timeout=15000):
    return wait_js(page, PHASE + " === " + json.dumps(want), timeout)
def queue_reply(text): mock("/__debug/reply-queue?text=" + urllib.parse.quote(text))
def stt(): return mock("/__debug/stt")["conns"]
def stt_open():
    c = stt()
    return bool(c) and not c[-1]["closed"]
def stt_say(text):
    wait_mock(stt_open, 6)
    return mock("/__debug/stt-say?text=" + urllib.parse.quote(text))["ok"]
def answered(): return [c for c in calls() if not c.get("cut")]
def user_texts(body):
    return [b["text"] for m in body["messages"] if m["role"] == "user" for b in m["content"] if b.get("type") == "text"]
def all_texts(body):
    return [m["role"][0] + ":" + b["text"] for m in body["messages"] for b in m["content"] if b.get("type") == "text"]
def mic(page, level): page.evaluate("(v) => { window.__micLevel = v; }", level)
def gains(page): return page.evaluate("window.__gains")
def dial(page):
    page.locator(".kfs-composer button[aria-label='打电话']").click()
    return wait_phase(page, "listening", 15000)
def hang(page):
    page.locator(".kfs-call button[aria-label='挂断']").click()
    time.sleep(0.8)
# 她说一句（还在听的时候）：字出来、停够了算说完，发出去
def say_turn(page, text):
    stt_say(text)
    time.sleep(0.2)

SILENCE = os.path.join(HERE, "..", ".cache", "silence-16k.wav")
os.makedirs(os.path.dirname(SILENCE), exist_ok=True)
if not os.path.exists(SILENCE):
    with wave.open(SILENCE, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(struct.pack("<h", 0) * 16000 * 20)

# 他这一句：头一段“我跟你说，今天下午我去了公园，”（十五个字，三秒多），后面一段三十几个字（八秒多）
LONG = "我跟你说，今天下午我去了公园，银杏叶全黄了，风一吹哗哗地往下掉，我在长椅上坐了好久，一直在想你。"
SEG1 = "我跟你说，今天下午我去了公园，"

with sync_playwright() as p:
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + SILENCE]
    browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.grant_permissions(["microphone"])
    ctx.add_init_script(STUB)
    ctx.add_init_script(FAKE)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)
        chat(pa, "先打个字")
        dial(pa)
        time.sleep(0.5)

        # ================= 他说着，她开口：压小、开听写，认出是她的话就停，聊天里只留念出来的，告诉他 =================
        queue_reply(LONG)
        c0 = len(answered())
        say_turn(pa, "跟我说说今天")
        wait_mock(lambda: len(answered()) == c0 + 1, 10)
        spoke = wait_phase(pa, "speaking", 15000)
        time.sleep(1.0)
        n0 = len(stt())
        g0 = len(gains(pa))
        mic(pa, 0.12)
        opened = wait_mock(lambda: len(stt()) == n0 + 1 and stt_open(), 4)
        ducked = gains(pa)[g0:] == [0.25]
        still = phase(pa)
        conn = stt()[-1]
        ok(spoke and opened and ducked and still == "speaking", f"他说着、她开口了（连着半秒多）：他的声音先压小（{gains(pa)[g0:]}）、开听写；还没认出她说的字，先不停（{still}）")
        wait_mock(lambda: stt()[-1]["bytes"] > 0, 3, 0.02)
        first_bytes = stt()[-1]["bytes"]
        ok(first_bytes >= 0.6 * 32000, f"开听写的时候从她开口那会儿往前一点送起（头几个字不丢）：一连上就送过去 {first_bytes} 个字节（零点六秒往上）")
        time.sleep(0.3)
        stops0 = pa.evaluate("window.__stops")
        stt_say("等一下，我先说")
        stopped = wait_phase(pa, "listening", 3000)
        ok(stopped and pa.evaluate("window.__stops") > stops0 and gains(pa)[-1] == 1 and pa.evaluate(TURNS)[-1] == ["her", "等一下，我先说"],
           f"认出是她说的（不是他自己那句漏进去的）：他停下，声音恢复，接着听她说；字幕上是她的（{pa.evaluate(TURNS)[-1:]}）")
        cid, msgs = chat_of(pa)
        his = [m for m in msgs if m.get("role") == "him"][-1]
        i = msgs.index(his)
        mark = msgs[i + 1] if i + 1 < len(msgs) else {}
        kept = (his.get("items") or [{}])[0].get("text", "")
        ok(his.get("cut") and len(his.get("items", [])) == 1 and 3 <= len(kept) < len(SEG1) and SEG1.startswith(kept) and his.get("raw") == kept,
           f"聊天里他那一条只留念出来的（念到头一段一半多被打断）：{kept}")
        ok(mark.get("kind") == "call" and mark.get("phase") == "cut" and mark.get("said") == kept and mark.get("callOf") == his["id"],
           f"后面记一行（聊天里不摆）：他说到“{mark.get('said')}”被打断了")
        # 她说完：发出去，他知道自己被打断在哪儿
        queue_reply("好，你说。")
        mic(pa, 0)
        c1 = len(answered())
        sent = wait_mock(lambda: len(answered()) == c1 + 1, 8)
        body = answered()[-1]["body"]
        texts = all_texts(body)
        note = f"u:[开封府提示：你说到“{kept}”的时候被她打断了，后面的没说出来]"
        ok(sent and note in texts and texts.index("a:" + kept) < texts.index(note) < texts.index("u:等一下，我先说") and not any(LONG in t for t in texts),
           f"她说完了照常发出去：寄给他的是他截剩下的那一条、“你说到……被她打断了”、她的话（后面没念出来的他看不到）（{texts[-4:]}）")
        wait_phase(pa, "speaking", 15000)
        back = wait_phase(pa, "listening", 15000)
        ok(back, "他接着回了，回完接着听")

        # ================= 漏进来的是他自己那句：不停，声音恢复，接着说 =================
        queue_reply(LONG)
        c2 = len(answered())
        say_turn(pa, "再说一遍")
        wait_mock(lambda: len(answered()) == c2 + 1, 10)
        wait_phase(pa, "speaking", 15000)
        time.sleep(1.2)
        n1 = len(stt())
        g1 = len(gains(pa))
        mic(pa, 0.12)
        opened = wait_mock(lambda: len(stt()) == n1 + 1 and stt_open(), 4)
        stt_say("今天下午我去了公园")
        time.sleep(0.5)
        mic(pa, 0)
        gave_up = wait_mock(lambda: not stt_open(), 5)
        ok(opened and gave_up and gains(pa)[g1:] == [0.25, 1] and phase(pa) == "speaking",
           f"听写认出来的是他自己那句（漏进去的）：不停；听写关了、声音恢复，他接着说（{gains(pa)[g1:]}，{phase(pa)}）")
        done = wait_phase(pa, "listening", 20000)
        cid, msgs = chat_of(pa)
        his = [m for m in msgs if m.get("role") == "him"][-1]
        ok(done and not his.get("cut") and his["items"][0]["text"] == LONG and not any(m.get("phase") == "cut" for m in msgs[msgs.index(his):]),
           "他把这一句说完了：聊天里那一条一个字没少，没记“被打断”")

        # ================= “嗯嗯”（应声）：不打断 =================
        queue_reply(LONG)
        c3 = len(answered())
        say_turn(pa, "嗯，接着说")
        wait_mock(lambda: len(answered()) == c3 + 1, 10)
        wait_phase(pa, "speaking", 15000)
        time.sleep(1.0)
        n2 = len(stt())
        mic(pa, 0.12)
        opened = wait_mock(lambda: len(stt()) == n2 + 1 and stt_open(), 4)
        stt_say("嗯嗯")
        time.sleep(0.6)
        mid = phase(pa)
        mic(pa, 0)
        gave_up = wait_mock(lambda: not stt_open(), 5)
        ok(opened and mid == "speaking" and gave_up and phase(pa) == "speaking", f"她应了一声（嗯嗯）：不打断，他接着说（{mid}）")
        wait_phase(pa, "listening", 20000)
        cid, msgs = chat_of(pa)
        ok(not [m for m in msgs if m.get("role") == "him"][-1].get("cut") and not any(m.get("role") == "her" and m.get("text") == "嗯嗯" for m in msgs),
           "应声不记成她的一句话，他那一条也没截")

        # ================= 他在想、她又开口了：那一回作废（不记“停了”），两句一起问 =================
        mock("/__debug/claude-hold?ms=20000")
        n4 = len(stt())
        say_turn(pa, "我想问你个事")
        held = wait_mock(lambda: mock("/__debug/claude-held")["held"], 8)
        thinking = wait_phase(pa, "thinking", 3000)
        listening_conn = wait_mock(lambda: len(stt()) == n4 + 1 and stt_open(), 5)
        stt_say("算了，先说别的")
        back_to_listen = wait_phase(pa, "listening", 3000)
        ok(held and thinking and listening_conn and back_to_listen, "他在想的时候接着听；她又开口了（不光是应声）：这一回不等了，接着听她说完")
        mic(pa, 0)
        both = wait_mock(lambda: any("算了，先说别的" in user_texts(c["body"]) for c in answered()), 10)
        body = [c for c in answered() if "算了，先说别的" in user_texts(c["body"])][-1]["body"] if both else {"messages": []}
        ut = user_texts(body)
        ok(both and ut.index("我想问你个事") < ut.index("算了，先说别的") and not any("停了" in t for t in ut),
           f"她说完：两句一起问他（前面那一回作废，不记“停了”）（{ut[-3:]}）")
        cid, msgs = chat_of(pa)
        a_msg = [m for m in msgs if m.get("role") == "her" and m.get("text") == "我想问你个事"][-1]
        ok(not a_msg.get("stopped"), "前面那句上没记“停了”（不摆“停了，点这里让我回”）")
        wait_phase(pa, "speaking", 15000)
        wait_phase(pa, "listening", 20000)
        mock("/__debug/claude-release")
        time.sleep(2.0)
        cid, msgs = chat_of(pa)
        a_at = max(i for i, m in enumerate(msgs) if m.get("role") == "her" and m.get("text") == "我想问你个事")
        after = [((m.get("items") or [{}])[0].get("text") or "") for m in msgs[a_at:] if m.get("role") == "him"]
        ok(after == ["收到：我想问你个事 / 算了，先说别的"], f"作废的那一回后来答了也不放进聊天里：两句后面只有他回两句的那一条（{after}）")

        # ================= 他在想的时候她应了一声：不作废，也不当一句话 =================
        mock("/__debug/claude-hold?ms=3500")
        queue_reply("嗯，在呢。")
        c5 = len(answered())
        n3 = len(stt())
        say_turn(pa, "你在吗")
        wait_mock(lambda: mock("/__debug/claude-held")["held"], 8)
        wait_mock(lambda: len(stt()) == n3 + 1 and stt_open(), 5)
        stt_say("嗯")
        time.sleep(0.4)
        quiet_subs = pa.evaluate(TURNS)[-1]
        replied = wait_mock(lambda: len(answered()) == c5 + 1, 10)
        wait_phase(pa, "speaking", 15000)
        wait_phase(pa, "listening", 20000)
        cid, msgs = chat_of(pa)
        ok(replied and len(answered()) == c5 + 1 and not any(m.get("role") == "her" and m.get("text") == "嗯" for m in msgs) and quiet_subs == ["her", "你在吗"],
           f"他在想的时候她“嗯”了一声：不作废那一回，也不当一句话发出去，字幕上不摆（{quiet_subs}）")

        # ================= 他在想、她又开口、没说完就挂了：前面那句照样问他 =================
        mock("/__debug/claude-hold?ms=20000")
        n5 = len(stt())
        say_turn(pa, "最后一个问题")
        wait_mock(lambda: mock("/__debug/claude-held")["held"], 8)
        wait_phase(pa, "thinking", 3000)
        wait_mock(lambda: len(stt()) == n5 + 1 and stt_open(), 5)
        stt_say("不对，我想想")
        wait_phase(pa, "listening", 3000)
        c6 = len(answered())
        hang(pa)
        redo = wait_mock(lambda: any("最后一个问题" in user_texts(c["body"]) for c in answered()[c6:]), 10)
        wait_js(pa, "!(" + TYPING + ")", 20000); time.sleep(1.0)
        cid, msgs = chat_of(pa)
        end_at = max(i for i, m in enumerate(msgs) if m.get("phase") == "end")
        ok(redo and any(m.get("role") == "him" for m in msgs[end_at:]) and not any(m.get("stopped") for m in msgs),
           "没说完就挂了：前面那句还欠着回话，挂了以后照样问他（他照平常回）")
        mock("/__debug/claude-release")

        # ================= 挂了以后聊天里 =================
        bubbles = pa.evaluate("[...document.querySelectorAll(\"[data-kfs-bubble='him']\")].map((e) => e.textContent)")
        ok(kept in bubbles and not pa.get_by_text("被你打断").count(), f"聊天里：他被打断的那一条只摆念出来的；“被打断”那一行不摆")
    finally:
        print("\n页面报错：" + ("\n".join(errors[:10]) if errors else "无"))
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
if count["failed"]:
    raise SystemExit(1)
