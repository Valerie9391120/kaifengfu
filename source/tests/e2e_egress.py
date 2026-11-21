# 库房的流量（Supabase 后台记的“PostgREST Egress”）端到端测试。11 月 21 日超了免费的额度以后加的，见 src/engine.js 开头。
# 真的浏览器、假 Supabase（它记着库房往外发了多少，/__debug/kv-egress），两台“手机”：
#   一台聊长一点，切回来、联网这些要同步的时候连着同步好几回：什么都没变，存档一行内容都不再取（原来往回多拉的那一分钟里的整段对话回回重新下载）；
#   自己刚传上去的不取回来；
#   另一台登录：整份取一遍；之后头一台说一句，另一台同步几回，只取改了的那几行、每行一回，那一句也到了；
#   关掉重开：也不再取那一分钟里已经有的。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080，用 tests/serve.py 起），再：python3 tests/e2e_egress.py
import time
from playwright.sync_api import sync_playwright
from mailkit import *

errors = []
SYNC = "document.dispatchEvent(new Event('visibilitychange'))"   # 切回来：Gate.jsx 同步一回（推、拉）

def egress(reset=False):
    return mock("/__debug/kv-egress" + ("?reset=1" if reset else ""))

def rows():
    return mock("/__debug/rows")

def syncs(page, n, gap=0.6):
    for _ in range(n):
        page.evaluate(SYNC)
        time.sleep(gap)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    mock("/__debug/reset")
    A = browser.new_context(**IPHONE)
    A.add_init_script(STUB)
    pa = A.new_page()
    pa.on("pageerror", lambda e: errors.append(str(e)))
    try:
        first_time(pa)
        for i in range(6):
            chat(pa, f"第{i}句：今天风很大，浪拍到路上来了，拍了几张照片都糊了，也挺好看。" * 3)
        time.sleep(2.5)   # 最后那一下改动传上去
        syncs(pa, 2)
        biggest = max(len(r["value"]) for r in rows())

        # ---- 头一台：什么都没变，连着同步十回 ----
        egress(reset=True)
        syncs(pa, 10)
        e = egress(reset=True)
        ok(e["gets"] >= 10 and e["value"] == 0, f"什么都没变，同步十回（问了 {e['gets']} 回）：存档一行内容都不再取（只问了 {e['browser']} 字节的“哪几行改过”）")

        # ---- 头一台说一句：自己传上去的不取回来 ----
        chat(pa, "再说一句")
        time.sleep(2.5)
        egress(reset=True)
        syncs(pa, 4)
        e = egress(reset=True)
        ok(e["value"] == 0, f"自己刚说的那一句（对话、目录都改了）：同步四回，一行都没取回来（{e['value']}）")

        # ---- 另一台 ----
        B = browser.new_context(**IPHONE)
        B.add_init_script(STUB)
        pb = B.new_page()
        pb.on("pageerror", lambda e: errors.append(str(e)))
        egress(reset=True)
        second_device(pb)
        time.sleep(1.5)
        e = egress(reset=True)
        total = sum(len(r["value"]) for r in rows() if r["key"].startswith("h_"))
        ok(e["value"] >= total * 0.9 and pb.get_by_text("收到：再说一句").count() > 0, f"另一台登录：整份取一遍（{e['value']} / {total}），聊过的都在")
        syncs(pb, 6)
        e = egress(reset=True)
        ok(e["value"] == 0, f"另一台同步六回：不再取（{e['value']}）")

        before = max(r["updated_at"] for r in rows())
        chat(pa, "第三台没有，第二台看得见")
        time.sleep(2.5)
        changed = [r for r in rows() if r["updated_at"] > before and r["key"].startswith("h_")]
        size = sum(len(r["value"]) for r in changed)
        egress(reset=True)
        syncs(pb, 5)
        e = egress(reset=True)
        pb.get_by_text("收到：第三台没有，第二台看得见").wait_for(timeout=10000)
        ok(0 < e["value"] <= size, f"头一台说了一句，另一台同步五回：只取了改了的那 {len(changed)} 行、每行一回（{e['value']} / {size}），那一句到了")

        # ---- 关掉重开 ----
        pb.reload()
        kite(pb)
        time.sleep(1.5)
        egress(reset=True)
        syncs(pb, 3)
        e = egress(reset=True)
        ok(e["value"] == 0, f"另一台关掉重开、同步三回：那一分钟里已经有的不再取（{e['value']}）")
        ok(biggest > 2000, f"（最大的一行是那段对话，{biggest} 字）")
    finally:
        try:
            errs = [e for e in errors if "ResizeObserver" not in e]
            ok(not errs, f"页面没有报错（{errs[:3]}）")
        except Exception:
            pass
        browser.close()

print(f"\n通过 {count['passed']}  失败 {count['failed']}")
raise SystemExit(1 if count["failed"] else 0)
