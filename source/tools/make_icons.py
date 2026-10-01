# 主屏幕图标：python3 tools/make_icons.py（在 source/ 里跑）
# 原图是 static/icon-source.jpg（卿卿给的沙燕风筝，方图），生成 static/icons/ 里的四张。
# iPhone 用整张图，系统自己切圆角；安卓的 maskable 只露中间一个圆，燕子缩到八成，四周用糊开的原图垫着。
from PIL import Image, ImageDraw, ImageFilter

SRC = "static/icon-source.jpg"
OUT = "static/icons/"
src = Image.open(SRC).convert("RGB")


def full(size):
    return src.resize((size, size), Image.LANCZOS)


def padded(size, scale=0.8, blur=18):
    bg = src.resize((size, size), Image.LANCZOS).filter(ImageFilter.GaussianBlur(blur))
    inner = int(round(size * scale))
    feather = max(4, int(inner * 0.06))
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rectangle([feather, feather, inner - feather, inner - feather], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(feather / 2))
    off = (size - inner) // 2
    bg.paste(src.resize((inner, inner), Image.LANCZOS), (off, off), mask)
    return bg


full(180).save(OUT + "apple-touch-icon.png", optimize=True)
full(192).save(OUT + "icon-192.png", optimize=True)
full(512).save(OUT + "icon-512.png", optimize=True)
padded(512).save(OUT + "icon-maskable-512.png", optimize=True)
print("图标生成好了")
