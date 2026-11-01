# 图画院的框景，从恩师那张画里拆出来：
#   wall.webp     光墙（挂落、两幅空轴、瓶子花枝都抹掉，案面以上那一截）
#   lattice.webp  右上角的挂落（抠出来，带透明）
#   table.webp    底下的长案（案面往下那一截；瓶底那一段从右边挪过来补齐）
# 再把十瓶花转成 webp，量好瓶底在图里的位置。卷轴（秘戏钱匣那一轴切成的五截）见 tools/make_tuhua_zhou.py。
# 用法：python3 tools/make_tuhua_assets.py 恩师那张框景.jpg - 十瓶所在目录 static/tuhua
#   恩师那张画（771×1672）不在仓库里；第二个参数原来是秘戏钱匣的卷轴，现在不用了（写个 - 占位）；
#   十瓶是 tools/flora/ 出的 arr_1.png … arr_10.png（800×1370，透明底）
import sys, os, json
import numpy as np, cv2
from PIL import Image

src, _unused, vase_dir, out = sys.argv[1:5]
os.makedirs(out, exist_ok=True)
im = np.array(Image.open(src).convert('RGB')).astype(np.float32)
H, W = im.shape[:2]
TABLE_Y = 1514            # 案面后沿（墙和案面交界）那一行

# ---------------- 要抹掉的几块 ----------------
REG = {
    'lattice': (388, 0, W, 294),
    'scroll_l': (68, 90, 374, 770),
    'scroll_r': (398, 418, 727, 1347),
    'vase': (0, 842, 302, TABLE_Y + 3),
}
mask = np.zeros((H, W), np.uint8)
for (x0, y0, x1, y1) in REG.values():
    mask[y0:y1, x0:x1] = 255

# ---------------- 墙的明暗：干净的墙面拟合一个三次曲面 ----------------
clean = np.zeros((H, W), bool); clean[:TABLE_Y - 2] = True
clean[cv2.dilate(mask, np.ones((25, 25), np.uint8)) > 0] = False
ys, xs = np.nonzero(clean)
sel = np.random.default_rng(0).choice(len(ys), size=min(60000, len(ys)), replace=False)
ys, xs = ys[sel], xs[sel]
def basis(x, y):
    x = x / W; y = y / H
    return np.stack([np.ones_like(x), x, y, x * y, x * x, y * y, x ** 3, y ** 3, x * x * y, x * y * y], -1)
blur = cv2.GaussianBlur(im, (0, 0), 6)
YY, XX = np.mgrid[0:H, 0:W].astype(np.float64)
B = basis(XX.ravel(), YY.ravel())
low = np.zeros_like(im)
A = basis(xs.astype(np.float64), ys.astype(np.float64))
for c in range(3):
    coef, *_ = np.linalg.lstsq(A, blur[ys, xs, c], rcond=None)
    low[..., c] = (B @ coef).reshape(H, W)

# ---------------- 墙的纹理：从干净的墙上随机取小块，交叠着拼（不留重复的痕迹） ----------------
hp_all = im - cv2.GaussianBlur(im, (0, 0), 5)
sources = [(302, 776, 398, 1500), (0, 0, 66, 830), (0, 800, 300, 840), (740, 300, 771, 1500)]
rng = np.random.default_rng(1)
P, O = 40, 12                      # 小块边长、交叠
step = P - O
win1 = np.ones(P, np.float32)
win1[:O] = np.sin(np.linspace(0, np.pi / 2, O)) ** 2
win1[-O:] = win1[:O][::-1]
win = np.outer(win1, win1)[..., None]
acc = np.zeros((H + 2 * P, W + 2 * P, 3), np.float32); wacc = np.zeros((H + 2 * P, W + 2 * P, 1), np.float32)
cands = [s for s in sources if (s[2] - s[0]) > P and (s[3] - s[1]) > P]
for y in range(-O, H, step):
    for x in range(-O, W, step):
        x0, y0, x1, y1 = cands[rng.integers(len(cands))]
        sx = rng.integers(x0, x1 - P); sy = rng.integers(y0, y1 - P)
        patch = hp_all[sy:sy + P, sx:sx + P]
        if rng.random() < 0.5: patch = patch[:, ::-1]
        if rng.random() < 0.5: patch = patch[::-1]
        ya, xa = y + O, x + O
        acc[ya:ya + P, xa:xa + P] += patch * win
        wacc[ya:ya + P, xa:xa + P] += win
tex = (acc / np.maximum(wacc, 1e-6))[O:O + H, O:O + W]
# 交叠处平均以后纹理会变弱一点：按干净墙面的纹理强度补回来
k = hp_all[clean].std() / max(tex[clean].std(), 1e-6)
tex *= k
fill = np.clip(low + tex, 0, 255).astype(np.uint8)

# ---------------- 一块一块泊松融合进去 ----------------
wall = np.clip(im, 0, 255).astype(np.uint8)
PAD = 40
for name, (x0, y0, x1, y1) in REG.items():
    m = np.zeros((H, W), np.uint8); m[y0:y1, x0:x1] = 255
    s_p = cv2.copyMakeBorder(fill, PAD, PAD, PAD, PAD, cv2.BORDER_REFLECT)
    d_p = s_p.copy(); d_p[PAD:-PAD, PAD:-PAD] = wall      # 四周那一圈用补出来的墙（不把挂落镜像进去）
    m_p = cv2.copyMakeBorder(m, PAD, PAD, PAD, PAD, cv2.BORDER_CONSTANT, value=0)
    # 贴着画边的，把镜像出去的那一圈也一起换
    if x0 == 0: m_p[y0 + PAD:y1 + PAD, PAD - 30:PAD] = 255
    if y0 == 0: m_p[PAD - 30:PAD, x0 + PAD:x1 + PAD] = 255
    if x1 == W: m_p[y0 + PAD:y1 + PAD, W + PAD:W + PAD + 30] = 255
    if y0 == 0 and x1 == W: m_p[PAD - 30:PAD, W + PAD:W + PAD + 30] = 255
    yy, xx = np.nonzero(m_p)
    ctr = (int((xx.min() + xx.max()) / 2), int((yy.min() + yy.max()) / 2))
    wall = cv2.seamlessClone(s_p, d_p, m_p, ctr, cv2.NORMAL_CLONE)[PAD:-PAD, PAD:-PAD]
Image.fromarray(wall[:TABLE_Y]).save(f'{out}/wall.webp', quality=84, method=6)
if os.environ.get('TH_DEBUG'): Image.fromarray(wall).save(f'{out}/_wall_full.jpg', quality=90)   # 整面墙（连长案）看一眼补得怎么样

# ---------------- 挂落：和光墙比，差得多的是木头 ----------------
x0, y0, x1, y1 = REG['lattice']
reg = im[y0:y1, x0:x1]; bg = wall[y0:y1, x0:x1].astype(np.float32)
lab_r = cv2.cvtColor(np.clip(reg, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
lab_b = cv2.cvtColor(np.clip(bg, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
d = np.sqrt(((lab_r - lab_b) * np.array([0.8, 1.6, 1.6])) ** 2).sum(-1) ** 0.5 if False else np.sqrt((((lab_r - lab_b) * np.array([0.8, 1.6, 1.6])) ** 2).sum(-1))
a = np.clip((d - 13) / 26, 0, 1)
# 去掉零星的墙面斑点：先开运算，再只留和大块木头连着的
core = (a > 0.5).astype(np.uint8)
core = cv2.morphologyEx(core, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(core, 8)
keep = np.zeros_like(core)
for i in range(1, n):
    if st[i, cv2.CC_STAT_AREA] > 300: keep[lab == i] = 1
near = cv2.dilate(keep, np.ones((5, 5), np.uint8)) > 0
a = np.where(near, a, 0)
a = cv2.GaussianBlur(a, (0, 0), 0.5)
a[a < 0.05] = 0
# 去掉墙色：c = (像素 - (1-a)·墙) / a
c = (reg - (1 - a[..., None]) * bg) / np.maximum(a[..., None], 1e-3)
c = np.where(a[..., None] > 0.02, c, reg)
rgba = np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8)
lat = Image.fromarray(rgba, 'RGBA')
lat = lat.resize((round(lat.width * 1.6), round(lat.height * 1.6)), Image.LANCZOS)
lat.save(f'{out}/lattice.webp', quality=82, method=6)

# ---------------- 长案：案面往下那一截；瓶底那一段从右边同一条上挪过来 ----------------
tab = im[TABLE_Y:].copy()
ya, yb, xa, xb, sh = 0, 1538 - TABLE_Y, 16, 196, 172
blk = tab[ya:yb, xa + sh:xb + sh].copy()
ramp = np.ones(xb - xa, np.float32); fe = 14
ramp[:fe] = np.linspace(0, 1, fe); ramp[-fe:] = np.linspace(1, 0, fe)
tab[ya:yb, xa:xb] = tab[ya:yb, xa:xb] * (1 - ramp[None, :, None]) + blk * ramp[None, :, None]
tabi = Image.fromarray(np.clip(tab, 0, 255).astype(np.uint8))
tabi = tabi.resize((tabi.width * 2, tabi.height * 2), Image.LANCZOS)
tabi.save(f'{out}/table.webp', quality=86, method=6)

# ---------------- 十瓶花 ----------------
meta = []
for i in range(1, 11):
    p = f'{vase_dir}/arr_{i}.png'
    r = Image.open(p).convert('RGBA'); arr = np.array(r)
    # 案面上那一层淡影子：往图的左右两边淡掉，免得贴到案面上露出一道边；右上角一个点是灯，去掉
    al = arr[..., 3].astype(np.float32)
    band = np.zeros_like(al); band[1240:] = 1.0
    xs_ = np.arange(al.shape[1], dtype=np.float32)
    fade = np.clip(np.minimum(xs_, al.shape[1] - 1 - xs_) / 180.0, 0, 1) ** 1.5
    al = al * (1 - band) + al * band * fade[None, :]
    al[:6, -12:] = 0
    arr[..., 3] = np.clip(al, 0, 255).astype(np.uint8)
    r = Image.fromarray(arr, 'RGBA'); al = arr[..., 3]
    rows = np.nonzero((al > 250).any(axis=1))[0]; bottom = int(rows.max())
    cols = np.nonzero(al[bottom - 4] > 250)[0]; cx = (cols.min() + cols.max()) / 2
    body = al[:bottom - 40]
    top = int(np.nonzero((body > 12).any(axis=1))[0].min())
    lit = np.nonzero((body > 12).any(axis=0))[0]
    meta.append({'cx': round(float(cx), 1), 'by': bottom, 'top': top, 'left': int(lit.min()), 'right': int(lit.max()), 'w': r.width, 'h': r.height})
    r.save(f'{out}/vase{i}.webp', quality=86, method=6)
json.dump(meta, open(f'{out}/vases.json', 'w'))

print('ok', 'table rows', tab.shape, 'lattice', lat.size)
print(json.dumps(meta))
