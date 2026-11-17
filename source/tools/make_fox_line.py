# 从恩师画的那只狐狸（src/ui/art/fox.js，一块填色的形状）里取出那根线，给白昼的开屏“一笔画成”用。
# 在 source/ 里跑：python3 tools/make_fox_line.py [对照图.png]
# 生成 src/ui/art/foxLine.js：两段描线的路径（坐标系 24×24，和 fox.js 一样）、线多粗、各有多长。
#
# 画不是重画的：把 fox.js 那块形状涂成位图，细化成一个像素宽的骨架（线的正中），顺着骨架走一遍排成点，再抹平、删掉多余的点。
# 这只狐狸差不多是一笔。骨架是三根枝、一个岔口（身子底下，尾巴那根线跟身子那根线并到一处的地方）：
#   身子：后背的头（腰上）→ 后背 → 两只耳朵 → 脸 → 鼻尖 → 下巴 → 胸口 → 岔口
#   一小截：岔口 → 往右一小截收住
#   尾巴：岔口 → 往左 → 折回来 → 绕一大圈 → 尾巴尖（收在下巴旁边）
# 起笔在后背的头上、顺着后背往上画，是她定的（11 月 17 日，头一版是从尾巴尖起的，她在截图上画了箭头）：
#   第一笔：后背的头 → 身子 → 岔口 → 右边那一小截的头
#   第二笔：岔口 → 尾巴 → 尾巴尖
# 开屏上滑块拉多少，照这个次序画多少（见 src/SplashBaizhou.jsx）。
#
# 要 numpy、Pillow、scikit-image。换了 fox.js（恩师换了画）重新跑一遍；认不出“三个头、一个岔口”的画会直接报错。
import re
import sys
import numpy as np
from PIL import Image, ImageDraw
from skimage.morphology import skeletonize
from scipy import ndimage as ndi

SRC = "src/ui/art/fox.js"
OUT = "src/ui/art/foxLine.js"
VB = 24.0
S = 80            # 一个单位涂成几个像素（24 个单位 → 1920 像素见方）
SMOOTH = 9        # 骨架上的点前后各看几个取平均（抹掉像素的锯齿）
TOL = 0.012       # 删点的时候许离开原来的线多远（单位）；照开屏上摆的大小不到零点二个像素

text = open(SRC, encoding="utf-8").read()
d = re.search(r'PATH =\s*"([^"]+)"', text.replace("\n", " ")).group(1)

# ---- 1. fox.js 的路径 → 多边形 → 位图（只有 M、c、l、z，都是相对坐标；别的字母直接报错） ----
toks = re.findall(r"[a-zA-Z]|-?\d*\.?\d+", d)
pts, i, cur, start = [], 0, np.zeros(2), None
def nums(n):
    global i
    v = [float(toks[i + k]) for k in range(n)]
    i += n
    return v
cmd = None
while i < len(toks):
    if re.match(r"[a-zA-Z]", toks[i]):
        cmd = toks[i]; i += 1
        if cmd in "zZ":
            continue
    if cmd == "M":
        cur = np.array(nums(2)); start = cur.copy(); pts.append(cur.copy()); cmd = "L"
    elif cmd == "l":
        cur = cur + np.array(nums(2)); pts.append(cur.copy())
    elif cmd == "c":
        v = nums(6)
        p0, p1, p2, p3 = cur, cur + v[0:2], cur + v[2:4], cur + v[4:6]
        for t in np.linspace(0, 1, 17)[1:]:
            pts.append((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)
        cur = p3
    else:
        sys.exit(f"fox.js 的路径里有没见过的字母 {cmd}")
im = Image.new("L", (int(VB * S), int(VB * S)), 0)
ImageDraw.Draw(im).polygon([(float(x) * S, float(y) * S) for x, y in pts], fill=255)
ink = np.asarray(im) > 127

# ---- 2. 骨架：三个头、一个岔口 ----
sk = skeletonize(ink)
ys, xs = np.nonzero(sk)
idx = {(int(y), int(x)): k for k, (y, x) in enumerate(zip(ys, xs))}
def nbrs(p):
    y, x = p
    return [(y + dy, x + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (y + dy, x + dx) in idx]
# 先剪毛刺：细化在拐得急的地方、圆头上会多长出一小根（比线粗还短），从头走到岔口不到 SPUR 个像素的剪掉，剪到没有为止
SPUR = int(1.5 * 1.2 * S)
spurs = []  # 剪下来的毛刺（从尖到根）。恩师的画在这几处是尖的（耳朵尖、尾巴折回来的地方），留着给蒙版用，见下面
while True:
    deg = {p: len(nbrs(p)) for p in idx}
    cut = None
    for e in [p for p, k in deg.items() if k == 1]:
        path, prev, cur = [e], None, e
        while deg[cur] < 3 and len(path) <= SPUR:
            nx = [q for q in nbrs(cur) if q != prev]
            if not nx:
                break
            prev, cur = cur, nx[0]
            path.append(cur)
        if deg[cur] >= 3 and len(path) <= SPUR:
            cut = path[:-1]
            break
    if not cut:
        break
    if len(cut) >= 4:
        spurs.append(cut + [cur])
    for q in cut:
        del idx[q]
# 剪过以后再细化一遍（剪口上会剩一两个多余的点），然后照“绕这个点一圈，从空到有换了几回”数它接着几根线：
# 一回是头，三回以上是岔口（光数挨着几个点不行：拐弯的地方台阶上的点也挨着三个）
m2 = np.zeros_like(sk)
for (y, x) in idx:
    m2[y, x] = True
sk = skeletonize(m2)
ys, xs = np.nonzero(sk)
idx = {(int(y), int(x)): k for k, (y, x) in enumerate(zip(ys, xs))}
RING = [(-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1)]
def arms(p):
    on = [((p[0] + dy, p[1] + dx) in idx) for dy, dx in RING]
    return sum(1 for k in range(8) if on[k] and not on[k - 1])
deg = {p: arms(p) for p in idx}
ends = [p for p, k in deg.items() if k == 1]
forks = [p for p, k in deg.items() if k >= 3]
print("头：", [(round(x / S, 1), round(y / S, 1)) for y, x in ends], "岔口的点：", [(round(x / S, 2), round(y / S, 2)) for y, x in forks])
if len(ends) != 3 or not forks:
    sys.exit(f"认不出来：骨架有 {len(ends)} 个头、{len(forks)} 个岔口的点（要三个头、一个岔口）")
fy, fx = np.mean(forks, axis=0)
if max(np.hypot(p[0] - fy, p[1] - fx) for p in forks) > 6:
    sys.exit("认不出来：岔口不止一处")
fork = min(forks, key=lambda p: np.hypot(p[0] - fy, p[1] - fx))
forkset = set(forks)

# 从一个头顺着骨架走到岔口
def walk(a):
    path, prev, cur = [a], None, a
    while cur not in forkset:
        nx = [q for q in nbrs(cur) if q != prev and q not in path[-3:]]
        if not nx:
            sys.exit("骨架走到一半断了")
        # 斜着挨的和正着挨的都有的时候先走正着挨的（免得跳过一个点）
        nx.sort(key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))
        prev, cur = cur, nx[0]
        path.append(cur)
    path.append(fork)
    return path
branches = [walk(e) for e in ends]
# 哪根是哪根：最长的是尾巴（绕一大圈），最短的是右边那一小截，剩下的是身子
order = sorted(range(3), key=lambda k: len(branches[k]))
stub, body, tail = branches[order[0]], branches[order[1]], branches[order[2]]

def to_units(path):
    a = np.array([(x + 0.5, y + 0.5) for y, x in path], dtype=float) / S
    # 抹平：两头钉住，中间取前后的平均
    out = a.copy()
    n = len(a)
    for k in range(n):
        lo, hi = max(0, k - SMOOTH), min(n, k + SMOOTH + 1)
        w = min(k - lo, hi - 1 - k)
        out[k] = a[k - w:k + w + 1].mean(axis=0)
    return out
def rdp(p, tol):
    if len(p) < 3:
        return p
    a, b = p[0], p[-1]
    ab = b - a
    L = np.hypot(*ab) or 1e-9
    dist = np.abs(ab[0] * (p[:, 1] - a[1]) - ab[1] * (p[:, 0] - a[0])) / L
    k = int(dist.argmax())
    if dist[k] <= tol:
        return np.array([a, b])
    return np.vstack([rdp(p[:k + 1], tol)[:-1], rdp(p[k:], tol)])
def length(p):
    return float(np.hypot(*np.diff(p, axis=0).T).sum())

stroke1 = rdp(to_units(body + stub[::-1][1:]), TOL)   # 后背的头 → 身子 → 岔口 → 小截的头
stroke2 = rdp(to_units(tail[::-1]), TOL)              # 岔口 → 尾巴 → 尾巴尖

# 线多粗：骨架上每一点到形状边上的距离的两倍，取中间那个数（岔口附近的不算数，中位数自己避开了）
dist = ndi.distance_transform_edt(ink)
width = float(np.median(dist[ys, xs]) * 2 / S)

# ---- 3. 蒙版 ----
# 开屏上画的不是这两笔本身，是 fox.js 那块形状，上面盖一层蒙版：蒙版照这两笔描、描得比线粗一圈（MASK），描到哪形状就露到哪。
# 这样画完了就是恩师那块形状，一个点不差（这两笔自己描出来，尖的地方是圆的，差百分之五六）。
# 尖出去的那几处（剪下来的毛刺）蒙版够不着：各补一小笔，这一笔画过它的根的时候露出来（at：画到总长的几成）。
MASK = 1.5
total = length(stroke1) + length(stroke2)
def at_of(pt):
    best = (1e9, 0.0)
    done = 0.0
    for st in (stroke1, stroke2):
        seg = np.hypot(*np.diff(st, axis=0).T)
        cum = np.concatenate([[0], np.cumsum(seg)])
        dd = np.hypot(st[:, 0] - pt[0], st[:, 1] - pt[1])
        k = int(dd.argmin())
        if dd[k] < best[0]:
            best = (dd[k], (done + cum[k]) / total)
        done += cum[-1]
    return best[1]
tips = []
for sp in spurs:
    a = np.array([(x + 0.5, y + 0.5) for y, x in sp], dtype=float) / S
    a = rdp(a[::-1], TOL * 2)  # 从根到尖
    tips.append((at_of(a[0]), a))
tips.sort(key=lambda t: t[0])
cover = Image.new("L", (int(VB * S), int(VB * S)), 0)
dc = ImageDraw.Draw(cover)
def brush(dr0, st, w):
    xy = [(float(x) * S, float(y) * S) for x, y in st]
    dr0.line(xy, fill=255, width=int(round(w * S)), joint="curve")
    r = w * S / 2
    for x, y in (xy[0], xy[-1]):
        dr0.ellipse([x - r, y - r, x + r, y + r], fill=255)
for st in [stroke1, stroke2] + [t[1] for t in tips]:
    brush(dc, st, width * MASK)
# 挡板：蒙版比线粗，头一笔画到下巴的时候会把挨着的尾巴尖露出一丝。第二笔（尾巴）没画到的地方先用一根黑的挡住
# （照第二笔描，比线粗一点；从岔口起头 GUARD_SKIP 这么长不挡，那一段跟头一笔本来就长在一处），第二笔自己画过去的时候再露。
GUARD = 1.3
GUARD_SKIP = 1.3
seg2 = np.hypot(*np.diff(stroke2, axis=0).T)
cum2 = np.concatenate([[0], np.cumsum(seg2)])
k0 = int(np.searchsorted(cum2, GUARD_SKIP))
guard = stroke2[k0:]
missed = (ink & ~(np.asarray(cover) > 127)).sum() / ink.sum()
# 早露的检查：每一处墨迹照离它最近的那一笔算“该在几成的时候露”；拉到各个位置，看有多少墨迹比该露的时候早露了一成以上
def frac_map():
    best = np.full(ink.shape, 1e9); when = np.zeros(ink.shape)
    yy, xx = np.nonzero(ink)
    done = 0.0
    for st in (stroke1, stroke2):
        seg = np.hypot(*np.diff(st, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
        for k in range(len(st)):
            dd = np.hypot(xx / S - st[k, 0], yy / S - st[k, 1])
            better = dd < best[yy, xx]
            best[yy[better], xx[better]] = dd[better]
            when[yy[better], xx[better]] = (done + cum[k]) / total
        done += cum[-1]
    return when
WHEN = frac_map()
def part(st, upto):
    seg = np.hypot(*np.diff(st, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
    k = int(np.searchsorted(cum, upto))
    return st[:max(2, k + 1)] if upto > 0 else None
worst = 0.0
worst_late = 0.0
for f in np.linspace(0.02, 0.98, 25):
    m = Image.new("L", (int(VB * S), int(VB * S)), 0); dm = ImageDraw.Draw(m)
    at = f * total
    a = part(stroke1, min(at, length(stroke1)))
    if a is not None: brush(dm, a, width * MASK)
    for t in tips:
        if t[0] <= f and t[0] * total <= length(stroke1): brush(dm, t[1], width * MASK)
    xy = [(float(x) * S, float(y) * S) for x, y in guard]
    dm.line(xy, fill=0, width=int(round(width * GUARD * S)), joint="curve")
    b2 = part(stroke2, at - length(stroke1)) if at > length(stroke1) else None
    if b2 is not None: brush(dm, b2, width * MASK)
    for t in tips:
        if t[0] <= f and t[0] * total > length(stroke1): brush(dm, t[1], width * MASK)
    seen = ink & (np.asarray(m) > 127)
    early = (seen & (WHEN > f + 0.1)).sum() / ink.sum()
    worst = max(worst, early)
    late = (ink & ~seen & (WHEN < f - 0.1)).sum() / ink.sum()   # 该露了一成以上还没露的（挡板挡多了、蒙版够不着）
    worst_late = max(worst_late, late)
print(f"挡板照第二笔描、比线粗 {GUARD} 倍、从岔口起头 {GUARD_SKIP} 不挡；拉到各处，早露一成以上的墨迹最多占 {worst * 100:.2f}%，该露没露的最多占 {worst_late * 100:.2f}%")
if worst > 0.002 or worst_late > 0.004:
    sys.exit("早露或者漏画得多了，不写文件")
print(f"蒙版描得比线粗 {MASK} 倍，补了 {len(tips)} 小笔（画到 {', '.join(f'{t[0] * 100:.0f}%' for t in tips)} 的时候露）；画完以后形状没露出来的占 {missed * 100:.3f}%")
if missed > 0.0005:
    sys.exit("蒙版盖不全，不写文件")

# ---- 4. 对照：照这两笔自己描出来，跟原来那块形状比 ----
K = 4  # 对照图放大几倍画再缩回来
chk = Image.new("L", (int(VB * S), int(VB * S)), 0)
dr = ImageDraw.Draw(chk)
for st in (stroke1, stroke2):
    xy = [(float(x) * S, float(y) * S) for x, y in st]
    dr.line(xy, fill=255, width=int(round(width * S)), joint="curve")
    r = width * S / 2
    for x, y in (xy[0], xy[-1]):
        dr.ellipse([x - r, y - r, x + r, y + r], fill=255)
mine = np.asarray(chk) > 127
iou = (mine & ink).sum() / (mine | ink).sum()
off = max(dist.max() * 0, float(ndi.distance_transform_edt(~ink)[mine & ~ink].max()) if (mine & ~ink).any() else 0.0) / S
print(f"线粗 {width:.3f}；第一笔 {len(stroke1)} 个点、长 {length(stroke1):.2f}；第二笔 {len(stroke2)} 个点、长 {length(stroke2):.2f}")
print(f"描出来跟原来那块形状重合 {iou * 100:.1f}%；描到形状外头最远 {off:.3f} 个单位")
if iou < 0.90:
    sys.exit("重合不到九成五，不写文件")
if len(sys.argv) > 1:
    rgb = np.zeros((*ink.shape, 3), np.uint8) + 247
    rgb[ink & mine] = (198, 105, 75)
    rgb[ink & ~mine] = (40, 90, 200)     # 原来有、描出来没有：蓝
    rgb[~ink & mine] = (220, 40, 40)     # 描出来多的：红
    Image.fromarray(rgb).resize((960, 960), Image.LANCZOS).save(sys.argv[1])

def path(p):
    return "M" + "L".join(f"{x:.2f} {y:.2f}" for x, y in p)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(f"""// 恩师画的那只狐狸（fox.js）里的那根线：白昼的开屏滑块拉多少、照这个次序画多少（见 SplashBaizhou.jsx）。
// 这个文件是 tools/make_fox_line.py 从 fox.js 生成的，别手改：恩师换了画，先重新生成 fox.js，再跑一遍那个脚本。
// 坐标系 24×24（同 fox.js）。两笔：头一笔从后背的头（腰上）起，顺着后背往上，画两只耳朵、脸、下巴、胸口，
// 过身子底下那个岔口，到右边那一小截的头；第二笔从岔口往左画尾巴，绕一大圈，收在尾巴尖上。起笔在哪儿是她定的。
// 描出来（圆头、圆角、WIDTH 这么粗）跟 fox.js 那块形状重合 {iou * 100:.1f}%。
//
// 开屏上画的是 fox.js 那块形状，上面盖一层蒙版：蒙版照这两笔描（MASK_WIDTH 这么粗，比线粗一圈），描到哪形状露到哪，
// 所以画完了就是恩师那块形状，一个点不差。尖出去的那几处蒙版够不着，各补一小笔（TIPS）：画到总长的 at 成的时候露出来。
export const WIDTH = {width:.3f};
export const MASK_WIDTH = {width * MASK:.3f};
export const STROKES = [
  {{ len: {length(stroke1):.2f}, d: "{path(stroke1)}" }},
  {{ len: {length(stroke2):.2f}, d: "{path(stroke2)}" }},
];
// 挡板（GUARD）：蒙版里第二笔没画到的地方先用一根黑的挡住（不然头一笔画到下巴的时候会把挨着的尾巴尖露出一丝），第二笔画过去才露
export const GUARD = {{ width: {width * GUARD:.3f}, d: "{path(guard)}" }};
export const TIPS = [
{chr(10).join(f'  {{ at: {t[0]:.4f}, stroke: {0 if t[0] * total <= length(stroke1) else 1}, d: "{path(t[1])}" }},' for t in tips)}
];
""")
print("写好了", OUT)
