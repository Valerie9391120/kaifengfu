# 南衙那一格的牡丹：python3 tools/make_peony.py 牡丹原图.png（在 source/ 里跑）
# 原图是恩师画的线稿，卿卿 2026 年 10 月 11 日给的：1254×1254 的透明底 PNG，只有紫色的线。原图不进仓库，她那儿有。
# 生成 src/ui/peony.js：一条 SVG 路径，坐标系是 24×24（和 src/ui/Icon.jsx 里别的图标一样）。
#
# 做三件事：
#   1 裁掉留白。原图四周留白多，花只占中间一块，原样缩小了花只有一点点大。
#     把花框成正方形（花在正中），四边各留花最长那一边的 4%（PAD）。
#   2 线加粗。原图的线照 25 个点摆出来只有 0.73 个点粗，别的图标是 1.5，看着发虚。加到 1.15（LINE）。
#     不加到 1.5：这朵花线多、挨得近，加到一样粗花心就挤成一团。卿卿看过四个样子（25 线不动、25 加粗一点、
#     25 加到一样粗、原图大小加到一样粗），挑的是“25，线加粗一点”，就是这里的数。
#     加粗是照着原来的线往外均匀长一圈（到线的距离不超过某个数的地方都算线），花形不动。
#   3 描成路径（potrace）。描完和加粗后的原图叠着对过，放大到 800 像素也看不出差别。
#
# 摆多大（PT）要和线粗一起看：路径里的线粗是照“这个框摆成 PT 个点见方”算的。
# 换了 PT、LINE，或者换了图，重新跑一遍，再把 tests/e2e_nanya.py 里那几个数跟着改
# （花的宽高、两倍屏上的墨量、看“花瓣里空不空”的那一格在哪儿）。
#
# 要 numpy、Pillow、scipy，还有 potracer（纯 Python 的 potrace）。写的时候用的是 0.0.4：pip install potracer==0.0.4
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import potrace

PT = 25.0     # 摆多大：这个框是几个点见方（格子里别的图标是 20）
LINE = 1.15   # 摆出来以后线多粗，单位是点
PAD = 0.04    # 花四边各留的白，按花最长那一边的比例
VB = 24.0     # 路径的坐标系：0 到 24
TOL = 0.4     # 描的时候许曲线离开原样多远（potrace 的 opttolerance）；越大路径越短
OUT = "src/ui/peony.js"

src = sys.argv[1]
A = np.asarray(Image.open(src).convert("RGBA"))[..., 3].astype(np.float32) / 255.0
# 不透明过半的算线。背景里有抠图留下的残影（不透明度不到 1%，眼睛看不见），过不了这条线，自然就没了
ink = A >= 0.5

# 两张“距离表”：线里的每一点离线外最近的格子多远、线外的每一点离线最近的格子多远。
# 量的是格子中心到格子中心，线真正的边在两个格子正中间，所以到边的距离要减半个格子
inner = ndi.distance_transform_edt(ink)
outer = ndi.distance_transform_edt(~ink)

# 原图上线有多粗：线正中间那一道“脊”上的点，到边的距离乘二
ridge = (inner == ndi.maximum_filter(inner, size=5)) & (inner > 4)
stroke = float(np.median(inner[ridge]) * 2 - 1)

# 花的框
ys, xs = np.where(ink)
x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
side = max(x1 - x0, y1 - y0) * (1 + 2 * PAD)
fx, fy = (x0 + x1) / 2 - side / 2, (y0 + y1) / 2 - side / 2   # 框的左上角
k = PT / side                                                  # 原图一个像素是几个点
grow = max(0.0, (LINE / k - stroke) / 2)                       # 线两边各往外长多少像素

# 框里每一格：离线的边多远（线外为正，线里为负），不超过 grow 的都算线
n = int(round(side))
yy, xx = np.mgrid[0:n, 0:n]
sx, sy = fx + xx, fy + yy
d_out = ndi.map_coordinates(outer, [sy, sx], order=1, mode="nearest")
d_in = ndi.map_coordinates(inner, [sy, sx], order=1, mode="nearest")
thick = np.where(d_out > 0, d_out - 0.5, -(d_in - 0.5)) <= grow

# 描。0.0.4 这一版把“真”当白纸、“假”当墨，所以反过来给它（给反了的话描出来的是纸不是线，下面对面积的那一道会拦住）
curves = potrace.Bitmap(~thick).trace(turdsize=20, alphamax=1.0, opticurve=True, opttolerance=TOL)
f = VB / n


def num(v):
    s = ("%.2f" % v).rstrip("0").rstrip(".")
    if s in ("", "-0"):
        return "0"
    return s.replace("0.", ".", 1) if s.startswith(("0.", "-0.")) else s


def pt(p):
    return (round(p.x * f, 2), round(p.y * f, 2))


def rel(a, b):
    return num(a[0] - b[0]) + " " + num(a[1] - b[1])


def bezier(p0, p1, p2, p3, steps=12):
    """一段曲线上的几个点（不含起点），量框、量面积用。"""
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        out.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
    return out


parts, segs, area = [], 0, 0.0
allpts = []
for c in curves:
    cur = pt(c.start_point)
    ring = [cur]
    parts.append("M" + num(cur[0]) + " " + num(cur[1]))
    for s in c.segments:
        segs += 1
        if s.is_corner:
            a, b = pt(s.c), pt(s.end_point)
            parts.append("l" + rel(a, cur) + " " + rel(b, a))
            ring += [a, b]
        else:
            a, e, b = pt(s.c1), pt(s.c2), pt(s.end_point)
            parts.append("c" + rel(a, cur) + " " + rel(e, cur) + " " + rel(b, cur))
            ring += bezier(cur, a, e, b)
        cur = b
    parts.append("z")
    # 这一圈围了多大（外圈和洞绕的方向相反，一正一负，加起来就是墨的面积）
    area += sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(ring, ring[1:] + ring[:1])) / 2
    allpts += ring
d = "".join(parts).replace(" -", "-")

# 对一道：路径围出来的面积，该和加粗以后那张图里墨的面积差不多。差得远多半是黑白给反了（库换了版本）、或者描丢了东西
want = float(thick.sum()) * f * f
if not 0.97 * want < abs(area) < 1.03 * want:
    sys.exit("描出来的不对：路径围了 %.1f，加粗后的图里墨是 %.1f（24×24 里的面积）。没写 %s" % (abs(area), want, OUT))

lo = (min(p[0] for p in allpts), min(p[1] for p in allpts))
hi = (max(p[0] for p in allpts), max(p[1] for p in allpts))
line = (stroke + 2 * grow) * k
fw, fh = (hi[0] - lo[0]) * PT / VB, (hi[1] - lo[1]) * PT / VB     # 花本身多大：照描出来的路径量
pt_s = "%g" % PT
with open(OUT, "w", encoding="utf-8") as fp:
    fp.write(
        "// 南衙那一格的牡丹（Icon.jsx 里的 peony）。恩师画的线稿，卿卿 2026 年 10 月 11 日给的。\n"
        "// 这个文件是 tools/make_peony.py 生成的，别手改：换图、换大小、换线的粗细，都去改那边的数重新生成。\n"
        "// 坐标系是 24×24，和别的图标一样；别的图标是描线，这一个是一块填色的形状（要填色、不描边，见 Icon.jsx）。\n"
        "//\n"
        f"// PEONY_PT：照这个大小摆（别的图标在格子里是 20）。照它摆，线是 {line:.2f} 个点粗，花本身 {fw:.1f}×{fh:.1f} 个点。\n"
        "// 线比别的图标（1.5）细一档是故意的：这朵花线多、挨得近，加到一样粗花心就挤成一团（卿卿挑的这个粗细）\n"
        f"export const PEONY_PT = {pt_s};\n"
        f'export const PEONY_PATH =\n  "{d}";\n'
    )

print("原图 %dx%d，线粗 %.1f 像素，花的框 (%d,%d)-(%d,%d)" % (A.shape[1], A.shape[0], stroke, x0, y0, x1, y1))
print("裁成 %.1f 像素见方，摆成 %s 个点：线两边各长 %.2f 像素，线 %.2f 个点，花 %.2f×%.2f 个点" % (side, pt_s, grow, line, fw, fh))
print("路径：%d 圈、%d 段、%d 个字，落在 (%.2f,%.2f)-(%.2f,%.2f)，围的面积 %.1f（图里墨 %.1f），写进 %s" % (len(curves), segs, len(d), lo[0], lo[1], hi[0], hi[1], abs(area), want, OUT))
