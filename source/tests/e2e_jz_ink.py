# 手帐上的字看不看得清：六种版式 × 八种风格，一页编好的手帐（标题、正文、红笔、原话、照片和底下的字、饭、心情、天气、两个人的日记都有），
# 每一种都把纸上带字的地方挨个量一遍：字的颜色叠在它底下那一层（纸、卡、小票、相框……）上，对比不到 3:1 的算看不清。
# 贴纸和她自己写的字不量（摆在哪儿、压在什么上面是她挑的），批注的小记号不量（颜色是定死的）。
# 起因：10 月 18 日卿卿说原话卡里“光义”两个字是白的，完全看不清（牛皮纸的点缀色是米白，原话卡也是米白）。
# 先在 source/ 里 npm run build:test，起好假 Supabase（8787）和测试网页（8080），再：python3 tests/e2e_jz_ink.py
import io, json, re, time, base64
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from mailkit import *

LAYOUTS = ["column", "polaroid", "cover", "bento", "scroll", "letter"]
STYLES = ["inkpaper", "xuan", "kraft", "film", "night", "washi", "newsprint", "chalk"]
DAY = "2026-10-12"
NOW = "2026-10-12T23:27:00+01:00"
MIN = 3.0

def photo(color, w=600, h=800):
    im = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(im)
    d.ellipse([w * 0.2, h * 0.3, w * 0.8, h * 0.7], fill=tuple(min(255, c + 40) for c in color))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

def records():
    at = 1760301000000
    page = {
        "v": 1, "day": DAY, "layout": "column", "style": "inkpaper", "at": at,
        "wx": {"code": 2, "hi": 18, "lo": 11, "mm": 0, "city": "某城", "src": "open-meteo"},
        "arr": {
            "by": "him", "at": at, "title": "泡桐花开了",
            "body": "她今天走运河那条路回来，说看到泡桐花了。",
            "cap": "运河边 · 下午四点",
            "pen": {"text": "她说是[[紫色的]]", "margin": "记得"},
            "quotes": [
                {"id": "q1", "w": "her", "t": "16:12", "p": "今天看到泡桐花了！"},
                {"id": "q2", "w": "him", "t": "16:13", "p": "在哪儿看到的？"},
                {"id": "q3", "w": "her", "t": "16:14", "p": "运河边，一整棵都开了"},
                {"id": "q4", "w": "him", "t": "16:15", "p": "拍给我看看。"},
            ],
            "photos": [
                {"id": "jzinkhero", "role": "hero", "note": ""},
                {"id": "jzinkpair1", "role": "pair", "note": "晚上的灯"},
                {"id": "jzinkpair2", "role": "pair", "note": "回来泡的茶"},
                {"id": "jzinkfood", "role": "food", "note": "番茄米线"},
                {"id": "jzinkmore", "role": "more", "note": "路边的猫"},
            ],
            "stickers": [],
        },
        "mine": {"edit": {}, "hide": [], "at": at, "stickers": [], "texts": []},
    }
    month = {DAY: {
        "her": {"text": "下午走运河那条路回来，泡桐花开了。", "moods": ["happy", "sweet"], "updatedAt": at},
        "him": {"text": "她说泡桐花开了。我在这边听她讲。", "moods": ["calm"], "updatedAt": at},
    }}
    imgs = {"jzinkhero": (176, 150, 214), "jzinkpair1": (40, 40, 70), "jzinkpair2": (226, 204, 178), "jzinkfood": (200, 96, 60), "jzinkmore": (120, 140, 120)}
    recs = [
        {"k": "kfs2:jz:" + DAY, "v": json.dumps(page, ensure_ascii=False), "dirty": True},
        {"k": "kfs2:diary:" + DAY[:7], "v": json.dumps(month, ensure_ascii=False), "dirty": True},
    ]
    return recs + [{"k": "kfs2:jzimg:" + k, "v": photo(c), "dirty": True} for k, c in imgs.items()]

PUT = """(recs) => new Promise((res, rej) => { const o = indexedDB.open('kfs-local'); o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite');
  for (const r of recs) tx.objectStore('kv').put(r); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }; o.onerror = () => rej(o.error); })"""

# 纸上带字的每一处：字的颜色（乘上一路往上的透明度）叠在它正底下那几层上（照屏幕上那一点从上往下数：它自己的底、它下面的卡、相框、纸……，
# 叠到头一层不透明的为止），算对比。照片上的字（大图封面压在照片上的那几行，照片底下垫了一层暗的）不量：照片每张不一样。
AUDIT = """(min) => {
  const sheet = document.querySelector('.kfs-jz .jz-sheet');
  const parse = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (t, b) => [0, 1, 2].map((i) => t[i] * t[3] + b[i] * (1 - t[3])).concat(1);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bad = []; let n = 0;
  for (const el of sheet.querySelectorAll('*')) {
    if (el.closest('.jz-stk, .jz-nb, svg')) continue;
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    if (!own || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    let alpha = 1;
    for (let e = el; e && e !== sheet.parentElement; e = e.parentElement) alpha *= parseFloat(getComputedStyle(e).opacity);
    const rc = el.getBoundingClientRect();
    const layers = []; let photo = false;
    for (const e of document.elementsFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2)) {
      if (e !== el && el.contains(e)) continue;
      if (e !== sheet && !sheet.contains(e)) continue;
      if (e.closest('.jz-stk, .jz-nb')) continue;
      if (e.tagName === 'IMG') { photo = true; break; }
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    if (photo) continue;
    let bg = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    const fg = parse(cs.color); fg[3] *= alpha;
    const t = over(fg, bg), a = lum(t), b = lum(bg);
    const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    n++;
    if (r < min) bad.push(`${el.className || el.tagName}「${el.textContent.trim().slice(0, 8)}」${r.toFixed(2)}`);
  }
  return { n, bad };
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
    errors = []
    try:
        mock("/__debug/reset")
        ctx = browser.new_context(**IPHONE)
        pa = ctx.new_page()
        pa.on("pageerror", lambda e: errors.append(str(e)))
        pa.clock.install(time=NOW)
        pa.clock.resume()
        first_time(pa)
        pa.evaluate(PUT, records())
        pa.reload()
        kite(pa)
        pa.get_by_role("button", name="打开侧栏").click(); time.sleep(0.6)
        pa.get_by_role("button", name=re.compile("^南衙")).click(); time.sleep(0.6)
        pa.locator(".kfs-nanya-row", has_text="闲笔集").click()
        pa.locator(".kfs-jz-open").wait_for(timeout=10000); time.sleep(0.4)
        pa.locator(".kfs-jz-open").click()
        pa.locator(".kfs-jz .jz-sheet").wait_for(timeout=10000)
        wait_js(pa, "document.querySelectorAll('.kfs-jz .jz-sheet img').length >= 5", 10000)
        pa.set_viewport_size({"width": 393, "height": 4600})  # 整张纸都在屏幕里，才数得到每一处底下是什么
        time.sleep(0.6)
        for lay in LAYOUTS:
            pa.locator(".kfs-jz-layout").click(); time.sleep(0.3)
            pa.locator(f".kfs-jz-pick[data-k='{lay}']").click(); time.sleep(0.3)
            for sty in STYLES:
                pa.locator(".kfs-jz-style").click(); time.sleep(0.25)
                pa.locator(f".kfs-jz-pick[data-k='{sty}']").click(); time.sleep(0.35)
                got = pa.evaluate(AUDIT, MIN)
                ok(got["n"] >= 12 and not got["bad"], f"{lay} × {sty}：纸上带字的 {got['n']} 处都看得清（对比至少 {MIN}:1）" + (f"；看不清的：{'、'.join(got['bad'])}" if got["bad"] else ""))
        ctx.close()
    except Exception as e:
        import traceback; traceback.print_exc()
        ok(False, f"出错：{e}")
    finally:
        ok(not errors, f"页面没报错：{errors[:3]}")
        print(f"\n通过 {count['passed']}  失败 {count['failed']}")
        browser.close()
    raise SystemExit(1 if count["failed"] or errors else 0)
