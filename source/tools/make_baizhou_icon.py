# 白昼的图标：陶土色的底上，一只米白线条的狐狸（恩师画的那一只，src/ui/art/fox.js 那块形状，不是重画的）。
# 在 source/ 里跑：python3 tools/make_baizhou_icon.py
# 生成 static/icons-baizhou/ 里的四张（同另外三套）：apple-touch-icon（180）、icon-192、icon-512、icon-maskable-512。
# iPhone 那三张狐狸占图标高的六成；安卓的 maskable 占五成（整只都在中间那个直径八成的圆里）。圆角是系统切的，图是方的。
# 换了 fox.js（恩师换了画）、想换颜色或者狐狸多大，改下面的数重新跑。要 numpy、Pillow。
import os
import re
import numpy as np
from PIL import Image, ImageDraw

SRC = "src/ui/art/fox.js"
OUT = "static/icons-baizhou"
BG = (201, 113, 82)      # 陶土色的底
FG = (250, 249, 244)     # 米白的线
SS = 4                   # 放大几倍画再缩回来（边上才顺）

text = open(SRC, encoding="utf-8").read()
d = re.search(r'PATH =\s*"([^"]+)"', text.replace("\n", " ")).group(1)
toks = re.findall(r"[a-zA-Z]|-?\d*\.?\d+", d)
pts, i, cur, cmd = [], 0, np.zeros(2), None
def nums(n):
    global i
    v = [float(toks[i + k]) for k in range(n)]
    i += n
    return v
while i < len(toks):
    if re.match(r"[a-zA-Z]", toks[i]):
        cmd = toks[i]; i += 1
        if cmd in "zZ":
            continue
    if cmd == "M":
        cur = np.array(nums(2)); pts.append(cur.copy()); cmd = "L"
    elif cmd == "l":
        cur = cur + np.array(nums(2)); pts.append(cur.copy())
    elif cmd == "c":
        v = nums(6)
        p0, p1, p2, p3 = cur, cur + v[0:2], cur + v[2:4], cur + v[4:6]
        for t in np.linspace(0, 1, 25)[1:]:
            pts.append((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)
        cur = p3
    else:
        raise SystemExit(f"fox.js 的路径里有没见过的字母 {cmd}")
P = np.array(pts)
lo, hi = P.min(0), P.max(0)
size = hi - lo            # 狐狸本身多宽多高（单位）
mid = (lo + hi) / 2

def icon(px, share):
    n = px * SS
    k = n * share / size[1]                      # 一个单位几个像素：狐狸的高占图标的 share
    xy = [((x - mid[0]) * k + n / 2, (y - mid[1]) * k + n / 2) for x, y in P]
    im = Image.new("RGB", (n, n), BG)
    ImageDraw.Draw(im).polygon(xy, fill=FG)
    return im.resize((px, px), Image.LANCZOS)

os.makedirs(OUT, exist_ok=True)
for name, px, share in (("apple-touch-icon.png", 180, 0.6), ("icon-192.png", 192, 0.6), ("icon-512.png", 512, 0.6), ("icon-maskable-512.png", 512, 0.5)):
    icon(px, share).save(f"{OUT}/{name}", optimize=True)
    print(name, px, f"狐狸占高 {share:.0%}、占宽 {share * size[0] / size[1]:.0%}")
