# 藏音匣纸条上的刻本体（见开发说明“藏音匣”那节）：生成 static/jinhui/ 里一块一块的字体（00.woff2、01.woff2……）和 slices.json。
#
# 字从哪儿来：
#   齊伋體（Qiji，黄令东从明代凌闵刻本里一个个抠出来的），用它的 combo 版：刻本里没有的字，作者用思源宋体“做旧”补齐了。
#   SIL Open Font License 1.1，保留字体名 QIJI —— 这里截出来、改过的版本不能再叫这个名字，所以叫 KFS Jinhui（锦灰）。
#   取法：npm pack @raycosine/qiji-font@0.0.4（只是把 GitHub 上发布的那两份字体原样包了一下，OFL），解开以后的 package/qiji-combo.ttf。
# 刻本里只有“。、”两个标点：别的标点和数字从 Noto Serif CJK SC 里取（OFL 1.1），挪进刻本字的格子、宽度跟刻本字一样，并进来；
# “〇”刻本里也没有：照明体的样子（左右粗、上下细）画一个，半径带一点点抖，像刀刻的。
#
# 轮廓简化：刻本字是从扫描图描出来的，一个字七八百个点，很重。每一圈先摊成折线，再按 3 个单位（一个字一千个单位）
# 的误差省掉多余的点（Ramer–Douglas–Peucker），只用直线连。纸条上一个字十七个半点大，3 个单位是二十分之一个点，看不出来；
# 放大到一百六十像素对过，跟原样分不出来。体积小一半多。
#
# 放哪些字、什么次序：tools/jinhui_chars.txt（tools/make_jinhui_chars.mjs 生成，常用的在前）。
# 切块：标点、数字和最常用的字在头一块，往后一百个字一块。页面上用 unicode-range 一块一块按需取（build.mjs 照 slices.json 写样式表）。
#
# 用法：python3 tools/make_jinhui.py <qiji-combo.ttf> [Noto Serif CJK 的 ttc，默认 /usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc]
# 要 fontTools、brotli、numpy（pip install fonttools brotli numpy）。
import io, json, math, os, random, sys
import numpy as np
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "static", "jinhui")
COMBO = sys.argv[1] if len(sys.argv) > 1 else None
NOTO = sys.argv[2] if len(sys.argv) > 2 else "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc"
NOTO_SC = 2  # 那一份 ttc 里第三个是 SC
if not COMBO:
    raise SystemExit("用法：python3 tools/make_jinhui.py <qiji-combo.ttf> [NotoSerifCJK-Regular.ttc]")

EPS = 3        # 轮廓简化的误差（单位：一个字一千）
FIRST = 300    # 头一块放多少个最常用的字（标点、数字另算）
PER = 100      # 往后一块多少个字
ADV = 800      # 刻本字都是 800 宽
CX, CY, S = 500, 280, 0.82   # 刻本字格子的中心；Noto 的字挪进来缩多少（Noto 的格子中心 (500, 380)、字高九百，刻本字七百四十来）
PUNCT = "，；：？！“”‘’…—–（）《》〈〉「」『』【】·/%~～＋－＝0123456789"
# 两份字体的版权声明照原样留着（OFL 要求）：齊伋體的，和 Noto Serif CJK（思源宋体）的
COPY = ("Copyright (c) 2020, Lingdong Huang, with Reserved Font Name QIJI. "
        "Punctuation and digits from Noto Serif CJK SC: \u00a9 2017-2023 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. "
        "Subset, simplified, merged and renamed (KFS Jinhui) for kaifengfu.")
OFL = "This Font Software is licensed under the SIL Open Font License, Version 1.1. https://openfontlicense.org"

chars = [c for c in open(os.path.join(HERE, "jinhui_chars.txt"), encoding="utf-8").read() if not c.isspace()]

# ---------- 1. 截出要的字 ----------
font = TTFont(COMBO)
cmap = font.getBestCmap()
have = [c for c in chars if ord(c) in cmap]
extra_q = [c for c in "。、" if ord(c) in cmap]
opts = subset.Options()
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
opts.name_languages = ["*"]
opts.notdef_outline = True
opts.hinting = False
sub = subset.Subsetter(opts)
sub.populate(text="".join(have + extra_q + [" "]))
sub.subset(font)
for tag in ("FFTM",):
    if tag in font:
        del font[tag]
print("截出来", len(have), "个字", flush=True)

# ---------- 2. 并进标点、数字、〇 ----------
noto = TTFont(NOTO, fontNumber=NOTO_SC)
ngs = noto.getGlyphSet()
ncmap = noto.getBestCmap()
nhm = noto["hmtx"].metrics
order = list(font.getGlyphOrder())
glyf = font["glyf"]
hmtx = font["hmtx"]

def add(ch, draw, adv, reverse):
    name = "kfs.u%04X" % ord(ch)
    tt = TTGlyphPen(None)
    draw(Cu2QuPen(tt, max_err=1.0, reverse_direction=True) if reverse else tt)
    g = tt.glyph()
    if name not in order:
        order.append(name)
    glyf.glyphs[name] = g
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    g.recalcBounds(glyf)
    hmtx[name] = (adv, getattr(g, "xMin", 0))
    for t in font["cmap"].tables:
        if t.isUnicode():
            if t.format == 4 and ord(ch) > 0xFFFF:
                continue
            t.cmap[ord(ch)] = name

added = []
qcmap = font.getBestCmap()
for ch in PUNCT:
    if ord(ch) in qcmap or ord(ch) not in ncmap:
        continue
    g = ncmap[ord(ch)]
    w = nhm[g][0]
    if w >= 900:  # 全角的：挪进刻本字的格子
        m = (S, 0, 0, S, CX - S * 500, CY - S * 380)
        adv = ADV
    else:  # 窄的（数字、半角符号）：跟着缩一样的比例，宽度照它自己的
        m = (S, 0, 0, S, 40, CY - S * 380)
        adv = round(w * S + 80)
    add(ch, lambda pen, g=g, m=m: ngs[g].draw(TransformPen(pen, m)), adv, True)
    added.append(ch)

def ring(pen):
    rnd = random.Random(7)
    def loop(rx, ry, clockwise, wob):
        n = 72
        ph = [rnd.uniform(0, 6.28) for _ in range(3)]
        pts = []
        for i in range(n):
            t = (i / n) * 2 * math.pi
            w = 1 + wob * (math.sin(3 * t + ph[0]) * 0.5 + math.sin(5 * t + ph[1]) * 0.3 + math.sin(11 * t + ph[2]) * 0.2)
            pts.append((round(CX + rx * w * math.cos(t)), round(CY + ry * w * math.sin(t))))
        if clockwise:
            pts.reverse()
        pen.moveTo(pts[0])
        for q in pts[1:]:
            pen.lineTo(q)
        pen.closePath()
    # 明体的圈：左右两边粗、上下细
    loop(300, 318, True, 0.02)
    loop(214, 262, False, 0.032)
if ord("〇") not in qcmap:
    add("〇", ring, ADV, False)
    added.append("〇")
print("并进来", len(added), "个：", "".join(added), flush=True)

# ---------- 3. 轮廓简化 ----------
def flatten(coords, flags, ends):
    out = []
    start = 0
    for end in ends:
        pts = coords[start:end + 1]
        on = [f & 1 for f in flags[start:end + 1]]
        start = end + 1
        n = len(pts)
        if n < 2:
            continue
        k = next((i for i in range(n) if on[i]), None)
        if k is None:
            p0 = ((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2)
            seq = [(p0, 1)] + [(pts[(1 + i) % n], 0) for i in range(n)]
        else:
            seq = [(pts[(k + i) % n], on[(k + i) % n]) for i in range(n)]
        seq.append(seq[0])
        poly = [seq[0][0]]
        cur = seq[0][0]
        ctrl = None
        def curve(a0, c, a1):
            for t in (0.25, 0.5, 0.75, 1.0):
                u = 1 - t
                poly.append((u * u * a0[0] + 2 * u * t * c[0] + t * t * a1[0], u * u * a0[1] + 2 * u * t * c[1] + t * t * a1[1]))
        for p, o in seq[1:]:
            if o:
                if ctrl is None:
                    poly.append(p)
                else:
                    curve(cur, ctrl, p)
                    ctrl = None
                cur = p
            else:
                if ctrl is None:
                    ctrl = p
                else:
                    mid = ((ctrl[0] + p[0]) / 2, (ctrl[1] + p[1]) / 2)
                    curve(cur, ctrl, mid)
                    cur = mid
                    ctrl = p
        out.append(np.array(poly[:-1], dtype=float))
    return out

def rdp(pts, eps):
    n = len(pts)
    if n < 3:
        return pts
    keep = np.zeros(n, bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        p, q = pts[a], pts[b]
        seg = pts[a + 1:b]
        d = q - p
        L = math.hypot(d[0], d[1])
        dist = np.hypot(seg[:, 0] - p[0], seg[:, 1] - p[1]) if L < 1e-9 else np.abs(d[0] * (seg[:, 1] - p[1]) - d[1] * (seg[:, 0] - p[0])) / L
        i = int(np.argmax(dist))
        if dist[i] > eps:
            m = a + 1 + i
            keep[m] = True
            stack.append((a, m))
            stack.append((m, b))
    return pts[keep]

def simplify_closed(poly, eps):
    if len(poly) < 8:
        return poly
    c = poly.mean(axis=0)
    i = int(np.argmax(np.hypot(poly[:, 0] - c[0], poly[:, 1] - c[1])))
    j = int(np.argmax(np.hypot(poly[:, 0] - poly[i][0], poly[:, 1] - poly[i][1])))
    if i > j:
        i, j = j, i
    a = rdp(poly[i:j + 1], eps)
    b = rdp(np.vstack([poly[j:], poly[:i + 1]]), eps)
    out = np.vstack([a[:-1], b[:-1]])
    return out if len(out) >= 3 else poly

before = after = 0
for name in font.getGlyphOrder():
    g = glyf[name]
    if g.isComposite() or g.numberOfContours <= 0:
        continue
    coords, ends, flags = g.getCoordinates(glyf)
    before += len(coords)
    pen = TTGlyphPen(None)
    for poly in flatten(list(coords), list(flags), list(ends)):
        s = np.round(simplify_closed(poly, EPS)).astype(int)
        pts = [tuple(s[0])]
        for q in s[1:]:
            if tuple(q) != pts[-1]:
                pts.append(tuple(q))
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts.pop()
        if len(pts) < 3:
            continue
        pen.moveTo(pts[0])
        for q in pts[1:]:
            pen.lineTo(q)
        pen.closePath()
        after += len(pts)
    ng = pen.glyph()
    glyf[name] = ng
    ng.recalcBounds(glyf)
print(f"轮廓的点：{before} → {after}", flush=True)

# ---------- 4. 改名（OFL 保留字体名）：只留 Windows 那一套名字 ----------
name = font["name"]
name.names = [r for r in name.names if r.platformID == 3 and r.nameID not in (0, 1, 2, 3, 4, 6, 13, 14, 16, 17, 21, 22)]
for nid, val in ((0, COPY), (1, "KFS Jinhui"), (2, "Regular"), (3, "KFSJinhui-Regular;kfs"), (4, "KFS Jinhui"), (6, "KFSJinhui-Regular"), (13, OFL), (14, "https://openfontlicense.org")):
    name.setName(val, nid, 3, 1, 0x409)

whole = io.BytesIO()
font.save(whole)
whole = whole.getvalue()

# ---------- 5. 切块 ----------
final = TTFont(io.BytesIO(whole)).getBestCmap()
han = [c for c in have if ord(c) in final]
head = [c for c in added + extra_q if ord(c) in final] + han[:FIRST]
groups = [head] + [han[i:i + PER] for i in range(FIRST, len(han), PER)]
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith(".woff2"):
        os.remove(os.path.join(OUT, f))
slices = []
total = 0
for k, grp in enumerate(groups):
    f = TTFont(io.BytesIO(whole))
    o = subset.Options()
    o.flavor = "woff2"
    o.layout_features = ["*"]
    o.name_IDs = ["*"]
    o.name_languages = ["*"]
    o.notdef_outline = False
    o.hinting = False
    s = subset.Subsetter(o)
    s.populate(text="".join(grp))
    s.subset(f)
    f.flavor = "woff2"
    fn = f"{k:02d}.woff2"
    f.save(os.path.join(OUT, fn))
    size = os.path.getsize(os.path.join(OUT, fn))
    total += size
    slices.append({"f": fn, "c": "".join(grp)})
json.dump({"family": "KFS Jinhui", "eps": EPS, "slices": slices}, open(os.path.join(OUT, "slices.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
lic = open(os.path.join(os.path.dirname(COMBO), "LICENSE.txt"), encoding="utf-8").read() if os.path.exists(os.path.join(os.path.dirname(COMBO), "LICENSE.txt")) else ""
open(os.path.join(OUT, "OFL.txt"), "w", encoding="utf-8").write(
    "KFS Jinhui（开封府藏音匣纸条上的字）\n\n" + COPY + "\n\n"
    "Qiji font: https://github.com/LingDong-/qiji-font\nNoto Serif CJK: https://github.com/notofonts/noto-cjk\n\n" + (lic or OFL) + "\n")
print(f"{len(slices)} 块，一共 {total // 1024} KB（头一块 {os.path.getsize(os.path.join(OUT, '00.woff2')) // 1024} KB）→ static/jinhui/", flush=True)
