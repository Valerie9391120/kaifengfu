# 气泡里的字：标题行加大加粗、**加粗**、*动作* 淡斜体。真的浏览器里看画出来的样子。
# 先在 source/ 里 npm run build:test，起好两个服务（见开发说明），再：python3 tests/e2e_rich.py
import json, re, sys, time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
# 他最后那一条回话里的头一个气泡：里面一样一样是什么（标签、字、字号、粗细、斜不斜、淡不淡、上边在哪、下边在哪）
HIS = """() => {
  const all = [...document.querySelectorAll('.kfs-chat-rows .whitespace-pre-wrap')].filter((b) => !b.closest('.flex-row-reverse'));
  const b = all[all.length - 1];
  if (!b) return null;
  const cs = getComputedStyle(b);
  const kids = [...b.children].map((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    return { tag: e.tagName.toLowerCase(), cls: e.className, text: e.textContent, size: parseFloat(s.fontSize), weight: Number(s.fontWeight), italic: s.fontStyle === 'italic', opacity: Number(s.opacity),
      top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), high: Math.round(r.height), block: s.display === 'block',
      inner: [...e.children].map((c) => { const t = getComputedStyle(c); return { tag: c.tagName.toLowerCase(), text: c.textContent, weight: Number(t.fontWeight), italic: t.fontStyle === 'italic', opacity: Number(t.opacity) }; }) }; });
  const r = b.getBoundingClientRect();
  return { text: b.textContent, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), kids, top: Math.round(r.top), bottom: Math.round(r.bottom), count: all.length };
}"""
def his(page):
    return page.evaluate(HIS)
def reply(page, text, wait_for):
    say(page, "原样回：" + text)
    ok_ = wait_js(page, "(() => { const all = [...document.querySelectorAll('.kfs-chat-rows .whitespace-pre-wrap')].filter((b) => !b.closest('.flex-row-reverse')); const b = all[all.length - 1]; return !!b && b.textContent.includes(" + json.dumps(wait_for) + "); })()", 20000)
    page.wait_for_timeout(1200)
    return ok_

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    ctx = browser.new_context(**IPHONE)
    ctx.add_init_script(STUB)
    pa = ctx.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    first_time(pa)

    # ---- 平常的话：和原来一样 ----
    got = reply(pa, "今天风很大，*推了推眼镜* 你出门带伞", "你出门带伞")
    b = his(pa)
    kinds = [(k["tag"], k["text"]) for k in b["kids"]]
    em = [k for k in b["kids"] if k["tag"] == "em"]
    ok(got and kinds == [("span", "今天风很大，"), ("em", "推了推眼镜"), ("span", " 你出门带伞")] and em[0]["italic"] and abs(em[0]["opacity"] - 0.72) < 0.01 and em[0]["weight"] == b["weight"] and b["size"] == 15.5,
       f"平常的话带一个星号的动作：动作是淡斜体，星号不显示，别的字照旧（{kinds}）")
    base_weight = b["weight"]

    # ---- 加粗 ----
    got = reply(pa, "这句**要紧**，别忘。***都要***也行", "也行")
    b = his(pa)
    kinds = [(k["tag"], k["text"]) for k in b["kids"]]
    strong = [k for k in b["kids"] if k["tag"] == "strong"]
    both = [k for k in b["kids"] if k["tag"] == "em"]
    ok(got and kinds == [("span", "这句"), ("strong", "要紧"), ("span", "，别忘。"), ("em", "都要"), ("span", "也行")] and "*" not in b["text"],
       f"两个星号围起来的：加粗，两边不再各剩一个星号（{kinds}）")
    ok(len(strong) == 1 and strong[0]["weight"] == 600 and strong[0]["weight"] > base_weight and not strong[0]["italic"] and strong[0]["opacity"] == 1 and strong[0]["size"] == 15.5,
       f"加粗的字：比平常的字粗（{strong[0]['weight'] if strong else None} 对 {base_weight}），不斜、不淡、一样大")
    ok(len(both) == 1 and both[0]["weight"] == 600 and both[0]["italic"] and abs(both[0]["opacity"] - 0.72) < 0.01, "三个星号围起来的：又粗又淡斜")

    # ---- 标题 ----
    text = "先说结论\n\n# 今天的打算\n\n先**吃饭**，再*伸个懒腰*\n## 下午\n#标签不算\n### 三级 **粗**\n#### 四级\n最后一句"
    got = reply(pa, text, "最后一句")
    b = his(pa)
    hs = [k for k in b["kids"] if k["cls"] == "kfs-h"]
    ok(got and [(h["tag"], h["text"], h["size"]) for h in hs] == [("div", "今天的打算", 20), ("div", "下午", 18), ("div", "三级 粗", 16.5), ("div", "四级", 15.5)] and all(h["weight"] == 600 and h["block"] for h in hs),
       f"井号开头、后面跟空格的那几行：标题，自己占一行，加粗，一级二级三级比平常的字大（{[(h['text'], h['size'], h['weight']) for h in hs]}）")
    ok([h["high"] for h in hs] == [28, 25, 23, 22], f"标题那一行的行高比正文紧一点（字号的 1.4 倍）：{[h['high'] for h in hs]} 像素")
    ok("#标签不算" in b["text"] and "# " not in b["text"] and "##" not in b["text"] and "*" not in b["text"] and b["text"].startswith("先说结论今天的打算"),
       f"井号后面不跟空格的（#标签）照原样摆；标题的井号、加粗的星号都不显示（{b['text'][:40]}…）")
    kinds = [(k["tag"], k["text"]) for k in b["kids"]]
    ok(kinds == [("span", "先说结论"), ("div", "今天的打算"), ("span", "先"), ("strong", "吃饭"), ("span", "，再"), ("em", "伸个懒腰"), ("div", "下午"), ("span", "#标签不算"), ("div", "三级 粗"), ("div", "四级"), ("span", "最后一句")],
       f"标题前后的话各成一段，段里的加粗、淡斜体照认；紧挨着标题的空行不另占地方（{kinds}）")
    h3 = hs[2] if len(hs) > 2 else {"inner": []}
    ok([(c["tag"], c["text"], c["weight"]) for c in h3["inner"]] == [("span", "三级 ", 600), ("strong", "粗", 600)], "标题里的加粗照认")
    # 摆的位置：一样一样往下排，标题和它下面那一行挨着（空不到十个像素），标题上面留一点空
    first, h1, body = b["kids"][0], hs[0], b["kids"][2]
    gap_above = h1["top"] - first["bottom"]
    gap_below = body["top"] - h1["bottom"]
    tops = [k["top"] for k in b["kids"] if k["tag"] in ("div",)]
    ok(tops == sorted(tops) and len(set(tops)) == len(tops) and 10 <= gap_above <= 12 and 4 <= gap_below <= 6 and all(h["left"] == first["left"] for h in hs),
       f"标题一行一个、从上往下排，和气泡里别的字左边对齐；标题上面留一点空（{gap_above} 像素），下面紧跟正文（{gap_below} 像素）")
    # 头一样就是标题：上面不另留空
    got = reply(pa, "# 开头就是标题\n正文一句", "正文一句")
    b = his(pa)
    h = b["kids"][0]
    pad = h["top"] - b["top"]
    ok(got and h["cls"] == "kfs-h" and h["text"] == "开头就是标题" and 10 <= pad <= 12 and [(k["tag"], k["text"]) for k in b["kids"]] == [("div", "开头就是标题"), ("span", "正文一句")],
       f"气泡里头一样就是标题：上面只有气泡自己的边（{pad} 像素），不另留空")
    # 只有一个标题
    got = reply(pa, "## 只有一个标题", "只有一个标题")
    b = his(pa)
    under = b["bottom"] - b["kids"][0]["bottom"]
    ok(got and len(b["kids"]) == 1 and b["kids"][0]["cls"] == "kfs-h" and b["kids"][0]["size"] == 18 and 10 <= under <= 12, f"整个气泡只有一个标题：照样是标题，底下只有气泡自己的边（{under} 像素），不多留空")

    # ---- 一对星号围着两行：原来就是整段淡斜体，不动 ----
    got = reply(pa, "*走过去\n把窗关上*", "把窗关上")
    b = his(pa)
    ok(got and [(k["tag"], k["text"]) for k in b["kids"]] == [("em", "走过去\n把窗关上")] and b["kids"][0]["italic"] and abs(b["kids"][0]["opacity"] - 0.72) < 0.01, "一对星号围着两行的动作：整段淡斜体（和原来一样）")

    # ---- 她自己发的话也一样认 ----
    n2 = count_text(pa, "第二条")
    say(pa, "**我也会加粗**")
    pa.wait_for_timeout(600)
    mine = pa.evaluate("""() => { const all = [...document.querySelectorAll('.kfs-chat-rows .flex-row-reverse .whitespace-pre-wrap')]; const b = all[all.length - 1];
      return b ? [...b.children].map((e) => [e.tagName.toLowerCase(), e.textContent, Number(getComputedStyle(e).fontWeight)]) : null; }""")
    ok(mine == [["strong", "我也会加粗", 600]], f"她自己发的话里的加粗：一样认（{mine}）")
    wait_js(pa, "[...document.querySelectorAll('.items-end span')].filter((e) => e.children.length === 0 && e.textContent === '第二条').length === " + str(n2 + 1), 25000)   # 等他回完这一句
    pa.wait_for_timeout(1500)

    # ---- 历史对话里那一行预览：不带井号、星号 ----
    got = reply(pa, "# 预览里的标题\n**粗的** 和 *斜的*，#标签", "#标签")
    pa.wait_for_timeout(800)
    index = json.loads(pa.evaluate(KV, "kfs2:index") or "[]")
    cid = last_chat(pa)
    row = [c for c in index if c["id"] == cid][0]
    ok(got and row.get("preview") == "预览里的标题\n粗的 和 斜的，#标签", f"历史对话里那一行预览：标题的井号、星号都去掉，不是标题的井号留着（{json.dumps(row.get('preview'), ensure_ascii=False)}）")

    browser.close()

print("页面报错：" + "\n".join(errors) if errors else "页面没有报错")
print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] or errors else 0)
