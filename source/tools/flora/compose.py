# 把恩师那张框景里画的瓶子和花枝抹掉（墙、案面补齐），再把渲染好的瓶花放上去
# 用法：python3 compose.py 框景.jpg 瓶花.png 输出.jpg [瓶心x 瓶底y（原图坐标）]
import sys
import numpy as np, cv2
from PIL import Image

src, render, out = sys.argv[1:4]
cx0, by0 = (float(sys.argv[4]), float(sys.argv[5])) if len(sys.argv) > 5 else (132.0, 1529.0)
PX_PER_UNIT = 214.0 / 2      # 渲染那边一单位 214 像素，合到原图（一半大小）是 107

im = np.array(Image.open(src).convert('RGB')).astype(np.float32)
H, W = im.shape[:2]

# ---- 1. 墙：周围干净的墙面拟合一个平滑的明暗（二次曲面），纹理从旁边一块干净的墙上取 ----
mask = np.zeros((H, W), np.uint8); mask[845:1517, 0:300] = 255
clean = np.zeros((H, W), bool)
clean[725:1511, 300:410] = True; clean[725:845, 0:410] = True; clean[0:1511, 0:75] = True
clean[mask > 0] = False
ys, xs = np.nonzero(clean)
sel = np.random.default_rng(0).choice(len(ys), size=min(40000, len(ys)), replace=False)
ys, xs = ys[sel].astype(np.float64), xs[sel].astype(np.float64)
def basis(x, y):
    x = x / W; y = y / H
    return np.stack([np.ones_like(x), x, y, x * y, x * x, y * y], -1)
A = basis(xs, ys)
YY, XX = np.mgrid[0:H, 0:W].astype(np.float64)
low = np.zeros((H, W, 3), np.float32)
blur = cv2.GaussianBlur(im, (0, 0), 4)
for ch in range(3):
    coef, *_ = np.linalg.lstsq(A, blur[ys.astype(int), xs.astype(int), ch], rcond=None)
    low[..., ch] = (basis(XX.ravel(), YY.ravel()) @ coef).reshape(H, W)
patch = im[760:1500, 305:410]
hp = patch - cv2.GaussianBlur(patch, (0, 0), 5)
ph, pw = hp.shape[:2]
tile = np.zeros((H, W, 3), np.float32)
x = 0; k = 0
while x < 300:
    tt = hp[:, ::-1] if k % 2 else hp
    w = min(pw, 300 - x)
    tile[845:845 + min(ph, 1517 - 845), x:x + w] = tt[:min(ph, 1517 - 845), :w]
    x += pw; k += 1
fill = low + tile
# 泊松融合：补上的那块边上和原图严丝合缝（先四周镜像出一圈，免得蒙版贴着画边）
P = 40
src_p = cv2.copyMakeBorder(np.clip(fill, 0, 255).astype(np.uint8), P, P, P, P, cv2.BORDER_REFLECT)
dst_p = cv2.copyMakeBorder(np.clip(im, 0, 255).astype(np.uint8), P, P, P, P, cv2.BORDER_REFLECT)
m_p = cv2.copyMakeBorder(mask, P, P, P, P, cv2.BORDER_CONSTANT, value=0)
m_p[845 + P:1517 + P, P - 30:P] = 255          # 左边那一圈镜像出来的也一起换掉
ys_, xs_ = np.nonzero(m_p)
ctr = (int((xs_.min() + xs_.max()) / 2), int((ys_.min() + ys_.max()) / 2))
bl = cv2.seamlessClone(src_p, dst_p, m_p, ctr, cv2.NORMAL_CLONE)
im = bl[P:-P, P:-P].astype(np.float32)

# ---- 2. 案面：被瓶底挡住的那一段，从右边同一条上挪过来（木纹是横的）----
y0, y1, xa, xb, sh = 1511, 1538, 20, 190, 170
blk = im[y0:y1, xa + sh:xb + sh].copy()
ramp = np.ones(xb - xa, np.float32)
fe = 12
ramp[:fe] = np.linspace(0, 1, fe); ramp[-fe:] = np.linspace(1, 0, fe)
ramp = ramp[None, :, None]
im[y0:y1, xa:xb] = im[y0:y1, xa:xb] * (1 - ramp) + blk * ramp

plate = Image.fromarray(np.clip(im, 0, 255).astype(np.uint8))

# ---- 3. 放大一倍，把瓶花贴上去 ----
S = 2
plate = plate.resize((W * S, H * S), Image.LANCZOS).convert('RGBA')
r = Image.open(render).convert('RGBA')
a = np.array(r)[..., 3]
rw, rh = r.size
# 瓶底：最低的一行不透明的像素就是瓶底（案面上的影子是半透明的）；那一段的中点是瓶心
rows = np.nonzero((a > 250).any(axis=1))[0]
bottom = int(rows.max())
cols = np.nonzero(a[bottom - 4] > 250)[0]
vcx = (cols.min() + cols.max()) / 2
scale = S * PX_PER_UNIT / (214.0 * rh / 1370.0)
if abs(scale - 1) > 1e-3:
    r = r.resize((round(rw * scale), round(rh * scale)), Image.LANCZOS)
    vcx *= scale; bottom = int(bottom * scale)
dx = int(round(cx0 * S - vcx)); dy = int(round(by0 * S - bottom))
# 贴图可能伸出画面，先裁掉
sx, sy = max(0, -dx), max(0, -dy)
r = r.crop((sx, sy, r.size[0], r.size[1]))
plate.alpha_composite(r, dest=(dx + sx, dy + sy))
plate.convert('RGB').save(out, quality=90)
print('ok', plate.size, 'render at', dx, dy)
