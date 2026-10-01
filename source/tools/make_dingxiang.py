# 丁香主题的图：python3 tools/make_dingxiang.py 开屏初始.png 开屏脸红.png 图标.png 聊天背景.png（在 source/ 里跑）
# 原图是卿卿画的（829×1896 的两张开屏，一张方的小猪图标，852×1846 的聊天背景），太大了不进仓库，她那儿有。
# 生成：
#   static/splash-dingxiang.webp      开屏（小猪还没脸红）
#   static/dx-heart.webp              白心里那颗小紫心（透明底的小块，叠在开屏上）
#   static/dx-blush.webp              腮红（同上）
#   static/wall-dingxiang.webp        聊天背景
#   static/icons-dingxiang/*.png      小猪图标
# 小块在原图里的位置会打印出来，要和 src/App.jsx 里 SPLASH_DX 的数对上。
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

p1_path, p3_path, icon_path, wall_path = sys.argv[1:5]
p1 = Image.open(p1_path).convert("RGB")
p3 = Image.open(p3_path).convert("RGB")
W, H = p1.size
a = np.asarray(p1).astype(np.float32)
b = np.asarray(p3).astype(np.float32)

# ---- 开屏 ----
p1.save("static/splash-dingxiang.webp", quality=86, method=6)

# ---- 脸红和小紫心：只留和初始那张不一样的地方，边上羽化，叠上去看不出接缝 ----
diff = np.abs(a - b).sum(axis=2)
changed = Image.fromarray(((diff > 18) * 255).astype(np.uint8))
soft = changed.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(2.5))
rgba = np.dstack([np.asarray(p3), np.asarray(soft)])
ys, xs = np.where(diff > 18)
for name, (lo, hi) in {"heart": (0, 950), "blush": (950, H)}.items():
    m = (ys >= lo) & (ys < hi)
    x0, y0, x1, y1 = xs[m].min() - 12, ys[m].min() - 12, xs[m].max() + 13, ys[m].max() + 13
    Image.fromarray(rgba[y0:y1, x0:x1], "RGBA").save(f"static/dx-{name}.webp", quality=92, method=6)
    print(f"{name}: x {x0}, y {y0}, w {x1 - x0}, h {y1 - y0}")

# ---- 聊天背景：卿卿另外画的那张（月牙、星星、丝带、丁香枝） ----
wall = Image.open(wall_path).convert("RGB")
wall.save("static/wall-dingxiang.webp", quality=86, method=6)
bottom = np.asarray(wall)[wall.height - 30:].reshape(-1, 3).mean(axis=0)
print("聊天背景最底边的颜色（input.css 里丁香的 --k-base）:", tuple(int(round(v)) for v in bottom))

# ---- 小猪图标 ----
src = Image.open(icon_path).convert("RGB")
s = min(src.size)
src = src.crop(((src.width - s) // 2, (src.height - s) // 2, (src.width - s) // 2 + s, (src.height - s) // 2 + s))


def padded(size, scale=0.8, blur=18):
    bg = src.resize((size, size), Image.LANCZOS).filter(ImageFilter.GaussianBlur(blur))
    inner = int(round(size * scale))
    f = max(4, int(inner * 0.06))
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rectangle([f, f, inner - f, inner - f], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(f / 2))
    off = (size - inner) // 2
    bg.paste(src.resize((inner, inner), Image.LANCZOS), (off, off), mask)
    return bg


import os

os.makedirs("static/icons-dingxiang", exist_ok=True)
for name, size in {"apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512}.items():
    src.resize((size, size), Image.LANCZOS).save("static/icons-dingxiang/" + name, optimize=True)
padded(512).save("static/icons-dingxiang/icon-maskable-512.png", optimize=True)
print("丁香主题的图生成好了")
