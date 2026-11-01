# 图画院的卷轴：直接从秘戏钱匣那一页里把展开的卷轴原样拍下来，切成五截（卿卿 11 月 1 日说“为啥不能直接拿秘戏钱匣的卷轴过来用”）。
#   zhou-top.webp     天杆（连两头的小轴头）
#   zhou-tian.webp    天头（锦，底下连着那道细线）
#   zhou-paper.webp   画心那段纸（图画院里照画的横竖截长截短，画贴在上面）
#   zhou-di.webp      地头（锦，上面连着那道细线）
#   zhou-bottom.webp  地杆（连两头深红褐的轴头）
#
# 用法（先 npm run build:test，再起 tests/serve.py 8080 dist-test）：
#   python3 tools/make_tuhua_zhou.py capture        # 拍：黑底、白底各拍一张，算出透明度，存成 .cache/zhou/scroll.png
#   python3 tools/make_tuhua_zhou.py slice          # 切：五截存进 static/tuhua/，顺带打印 tuhua.js 的 ZHOU 那几个数
# 拍的时候拿 dist-test 里那一页另存一份（只多一行，把场景里的几样东西递出来），把卷轴以外的都藏起来、
# 挂绳和那个结也藏起来（图画院自己有挂绳和钉子），卷轴展开到底再拍。卷轴面是不打光的（MeshBasicMaterial），轴杆、轴头照那一页的光。
import glob, os, sys, time
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
CACHE = os.path.join(ROOT, ".cache", "zhou")
OUT = os.path.join(ROOT, "static", "tuhua")
os.makedirs(CACHE, exist_ok=True)


def capture(W=1000, H=2120):
    from playwright.sync_api import sync_playwright
    src = glob.glob(os.path.join(ROOT, "dist-test", "assets", "qianxia-*.html"))[0]
    s = open(src, encoding="utf8").read()
    hook = "Ct=Fp(n,r),li.add(Ct.group),"
    if s.count(hook) != 1:
        sys.exit("秘戏钱匣那一页改过：找不到 Ct=Fp(n,r)（卷轴是在那儿建的），照新的样子改这个脚本")
    s = s.replace(hook, hook + "window.__qx=()=>({Et,en,Ct}),")
    probe = os.path.join(os.path.dirname(src), "qx-probe.html")
    open(probe, "w", encoding="utf8").write(s)
    args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    with sync_playwright() as p:
        b = p.chromium.launch(args=args)
        pg = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2).new_page()
        pg.goto("http://127.0.0.1:8080/assets/qx-probe.html")
        t0 = time.time()
        while time.time() - t0 < 120 and not pg.evaluate("document.body.classList.contains('ready')"):
            time.sleep(0.5)
        pg.evaluate("window.__coinbox.freeze(0)"); pg.evaluate("window.__coinbox.start()"); time.sleep(1.5)
        pg.evaluate("window.__coinbox.freeze(11.8)"); time.sleep(4)   # 卷轴展开到底
        pg.add_style_tag(content="#scroll-text,#qx-acts,#hint,#bg,#bgblur{display:none!important}")
        pg.evaluate("""() => {
          const q = window.__qx(); const g = q.Ct.group;
          const inScroll = (o) => { for (let x = o; x; x = x.parent) if (x === g) return true; return false; };
          q.Et.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && !inScroll(o)) o.visible = false; });
          // 卷轴里：0 背后那片影子、5 6 两根挂绳、7 挂绳上的结
          [0, 5, 6, 7].forEach((i) => { if (g.children[i]) g.children[i].visible = false; });
        }""")
        shots = {}
        for name, col in (("black", "0x000000"), ("white", "0xffffff")):
            pg.evaluate(f"window.__qx().en.setClearColor({col}, 1)")
            time.sleep(2.5)
            shots[name] = os.path.join(CACHE, name + ".png")
            pg.screenshot(path=shots[name], timeout=300000)
        b.close()
    os.remove(probe)
    B = np.array(Image.open(shots["black"]).convert("RGB")).astype(np.float32)
    Wt = np.array(Image.open(shots["white"]).convert("RGB")).astype(np.float32)
    a = np.clip(1 - (Wt - B).mean(2) / 255.0, 0, 1)
    c = np.where(a[..., None] > 1e-3, B / np.maximum(a[..., None], 1e-3), 0)
    rgba = np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8)
    ys, xs = np.nonzero(a > 0.02)
    Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA").save(os.path.join(CACHE, "scroll.png"))
    print("拍好了", os.path.join(CACHE, "scroll.png"))


def slice_(target=480):
    im = np.array(Image.open(os.path.join(CACHE, "scroll.png"))).astype(np.float32)
    H, W = im.shape[:2]
    a = im[..., 3] / 255
    cols = np.nonzero(a[H // 2] > 0.5)[0]
    fl, fr = int(cols.min()), int(cols.max()) + 1           # 卷轴面左右
    fw = fr - fl
    # 天杆：卷轴面外边一点的那一列，上头那一段不透明的
    xo = fl - 3
    r = np.nonzero(a[:, xo] > 0.5)[0]
    face_top = int(r[r < H // 3].max()) + 1
    rb = np.nonzero((a[:, max(0, fl - 40)] > 0.3))[0]
    roll_top = int(rb[rb > H * 0.8].min())
    # 两道细线：中间那几列最暗的一行
    c0, c1 = fl + int(fw * 0.2), fl + int(fw * 0.8)
    lum = im[:, c0:c1, :3].mean(axis=(1, 2))
    s1 = min(range(int(H * 0.1), int(H * 0.25)), key=lambda y: lum[y])
    s2 = min(range(int(H * 0.7), int(H * 0.9)), key=lambda y: lum[y])
    tian_end = s1 + 4                                         # 线跟着天头
    di_start = s2 - 3                                          # 线跟着地头
    rt = np.nonzero((a[:face_top] > 0.3).any(axis=0))[0]
    top_x0, top_x1 = int(rt.min()), int(rt.max()) + 1
    k = target / fw

    def save(name, arr):
        img = Image.fromarray(arr.astype(np.uint8), "RGBA")
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
        img.save(os.path.join(OUT, name), quality=88, method=6)
        return img.size

    sz = {
        "top": save("zhou-top.webp", im[0:face_top, top_x0:top_x1]),
        "tian": save("zhou-tian.webp", im[face_top:tian_end, fl:fr]),
        "paper": save("zhou-paper.webp", im[tian_end:di_start, fl:fr]),
        "di": save("zhou-di.webp", im[di_start:roll_top, fl:fr]),
        "bottom": save("zhou-bottom.webp", im[roll_top:H, 0:W]),
    }
    # 都折成“卷轴面宽的几分之几”：页面上照轴宽缩放
    f = lambda v: round(v / fw, 4)
    print("export const ZHOU = {")
    print(f"  top: {{ h: {f(face_top)}, x: {f(top_x0 - fl)}, w: {f(top_x1 - top_x0)} }},")
    print(f"  tian: {f(tian_end - face_top)},")
    print(f"  paper: {f(di_start - tian_end)},")
    print(f"  di: {f(roll_top - di_start)},")
    print(f"  bottom: {{ h: {f(H - roll_top)}, x: {f(0 - fl)}, w: {f(W)} }},")
    print("};")
    print("图的大小", sz)


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else ""
    if what == "capture":
        capture()
    elif what == "slice":
        slice_()
    else:
        sys.exit("用法：python3 tools/make_tuhua_zhou.py capture | slice")
