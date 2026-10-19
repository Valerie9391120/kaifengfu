# 黑夜的主屏幕图标：python3 tools/make_heiye_icon.py 月相.png（在 source/ 里跑）
# 原图是卿卿画的（1620×2160，蓝黑的水面上一圈八个月相）。10 月 19 日她拿它请恩师加了细节、出了三张，
# 缩到图标大小一比，加上去的星星、云、水面碎光都糊了，平涂的这张最清楚，她就定了自己画的这张。
# 原图不进仓库，她那儿有。
#
# 生成 static/icons-heiye/ 里的四张：
#   iPhone（apple-touch-icon、icon-192、icon-512）：以月环为中心裁成方的，月环占八成宽，圆角系统自己切
#     （她看过的草样就是这个裁法）；
#   安卓的 maskable 只露中间一个直径八成的圆，月环缩到七成二，整圈都在圆里头。
# 原图上边离月环只有几十个像素，裁的时候够不着的地方用原图最上面那一溜的颜色补：那一溜是纯的夜色，补了看不出接缝。
import os
import sys

import numpy as np
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGB")
a = np.asarray(src).astype(int)
R, G, B = a[..., 0], a[..., 1], a[..., 2]

# 月亮：亮的那半是奶黄（R>200、G>190、B>130），暗的那半是灰青（G 比 R 高出 25 以上）；水波是灰蓝，两样都不沾
moon = ((R > 200) & (G > 190) & (B > 130)) | ((G - R > 25) & (G > 60) & (B > 70))
ys, xs = np.nonzero(moon)
# 两头各掐掉千分之二：她顺手点的几粒星星屑不算进月环
x0, x1 = np.percentile(xs, [0.2, 99.8])
y0, y1 = np.percentile(ys, [0.2, 99.8])
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
ring = max(x1 - x0, y1 - y0)
sky = tuple(int(v) for v in np.median(a[:30].reshape(-1, 3), axis=0))
print(f"月环：中心 {cx:.0f},{cy:.0f}，直径 {ring:.0f} 像素；补边用的夜色 {sky}")
# 认错了就停：月环该在画面上半截、差不多居中，大小在宽的四成到六成之间（她这张是 820,461、807）
if not (0.4 * src.width < ring < 0.6 * src.width and abs(cx - src.width / 2) < 0.1 * src.width and cy < src.height / 2):
    sys.exit("月环没认对，图换了的话看看上面的颜色门槛")


def square(share, size):
    """月环占 share 那么宽的一张方图，size×size"""
    s = int(round(ring / share))
    canvas = Image.new("RGB", (s, s), sky)
    canvas.paste(src, (int(round(s / 2 - cx)), int(round(s / 2 - cy))))
    return canvas.resize((size, size), Image.LANCZOS)


OUT = "static/icons-heiye/"
os.makedirs(OUT, exist_ok=True)
for name, size in {"apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512}.items():
    square(0.80, size).save(OUT + name, optimize=True)
square(0.72, 512).save(OUT + "icon-maskable-512.png", optimize=True)
print("黑夜的图标生成好了")
