# 闲笔集月历上那块日晷的字：python3 tools/make_dial_glyphs.py <qiji-combo.ttf>（在 source/ 里跑），生成 src/panels/dialGlyphs.js。
#
# 晷盘上的字都用刻本体，跟侧栏顶上“開封府”是同一款（齊伋體，Qiji，Copyright (c) 2020 Lingdong Huang，
# SIL Open Font License 1.1，保留字体名 QIJI；授权全文在 static/jinhui/OFL.txt）。取法同 tools/make_title.py：
#   npm pack @raycosine/qiji-font@0.0.4，解开以后的 package/qiji-combo.ttf。
# 字画成路径（同 make_title.py 的道理：不用等字体、不闪、颜色跟着 fill 走）。
#
# 一个字一条路径，原点放在墨迹的正中（摆的时候只管转、挪、缩），一个字一千个单位。
# 刻本的轮廓很碎（刀口的毛边），原样放进来五十个字要三百来 KB：曲线先拆成折线，再照摆出来的大小省点（Douglas–Peucker），
# 地支摆得大（手机上十几二十像素），省得少；节气、月份那几圈的小字只有八九个像素，省得多。
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen

BIG = "子丑寅卯辰巳午未申酉戌亥"
SMALL = "一二三四五六七八九十月" + "大雪冬至小寒立春雨水惊蛰分清明谷夏满芒种暑秋处白露霜降"
TOL_BIG = 6
TOL_SMALL = 16


class Flat(BasePen):
    def __init__(self, gs, dx, dy):
        super().__init__(gs)
        self.dx, self.dy = dx, dy
        self.rings, self.cur = [], None

    def _p(self, p):
        return (p[0] - self.dx, self.dy - p[1])  # 字体里 y 朝上，SVG 里朝下

    def _moveTo(self, p):
        self.cur = [self._p(p)]

    def _lineTo(self, p):
        self.cur.append(self._p(p))

    def _qCurveToOne(self, p1, p2):
        a = self._getCurrentPoint()
        for i in range(1, 7):
            t = i / 6
            x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
            y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
            self.cur.append(self._p((x, y)))

    def _curveToOne(self, p1, p2, p3):
        a = self._getCurrentPoint()
        for i in range(1, 9):
            t = i / 8
            mt = 1 - t
            x = mt**3 * a[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0]
            y = mt**3 * a[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1]
            self.cur.append(self._p((x, y)))

    def _closePath(self):
        if self.cur:
            self.rings.append(self.cur)
        self.cur = None

    _endPath = _closePath


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = pts[i], pts[j]
        dx, dy = x2 - x1, y2 - y1
        L = (dx * dx + dy * dy) ** 0.5 or 1e-9
        best, bk = -1, -1
        for k in range(i + 1, j):
            d = abs((pts[k][0] - x1) * dy - (pts[k][1] - y1) * dx) / L
            if d > best:
                best, bk = d, k
        if best > tol:
            keep[bk] = True
            stack += [(i, bk), (bk, j)]
    return [p for p, k in zip(pts, keep) if k]


def path_of(gs, g, tol):
    b = BoundsPen(gs)
    g.draw(b)
    x0, y0, x1, y1 = b.bounds
    pen = Flat(gs, (x0 + x1) / 2, (y0 + y1) / 2)
    g.draw(pen)
    out = []
    for ring in pen.rings:
        # 闭合的一圈：从离第一个点最远的那一点劈成两半各自省，免得首尾那一段被省没
        far = max(range(len(ring)), key=lambda k: (ring[k][0] - ring[0][0]) ** 2 + (ring[k][1] - ring[0][1]) ** 2)
        pts = dp(ring[: far + 1], tol)[:-1] + dp(ring[far:] + [ring[0]], tol)[:-1]
        if len(pts) < 3:
            continue
        pts = [(int(round(x)), int(round(y))) for x, y in pts]
        s = f"M{pts[0][0]} {pts[0][1]}"
        px, py = pts[0]
        for x, y in pts[1:]:
            s += f"l{x - px} {y - py}"
            px, py = x, y
        out.append(s + "z")
    return "".join(out).replace(" -", "-")


if len(sys.argv) != 2:
    sys.exit("用法：python3 tools/make_dial_glyphs.py <qiji-combo.ttf>")
font = TTFont(sys.argv[1])
cmap, gs = font.getBestCmap(), font.getGlyphSet()
lines = []
for chars, tol in ((BIG, TOL_BIG), (SMALL, TOL_SMALL)):
    for ch in dict.fromkeys(chars):
        if ch in BIG and tol == TOL_SMALL:
            continue
        lines.append(f'  "{ch}": "{path_of(gs, gs[cmap[ord(ch)]], tol)}",')
out = (
    "// 闲笔集月历上那块日晷的字（DiaryPage.jsx 的 Dial）：齊伋體的轮廓画成路径，一字一条，原点在墨迹正中，一个字一千个单位。\n"
    "// 齊伋體 Qiji, Copyright (c) 2020 Lingdong Huang, SIL Open Font License 1.1（static/jinhui/OFL.txt）。\n"
    "// 这个文件是 tools/make_dial_glyphs.py 生成的，别手改：换字、换省点的多少，去改那边重新生成。\n"
    "export const DIAL_GLYPHS = {\n" + "\n".join(lines) + "\n};\n"
)
open("src/panels/dialGlyphs.js", "w", encoding="utf-8").write(out)
print(f"src/panels/dialGlyphs.js：{len(out.encode())} 字节，{len(lines)} 个字")
