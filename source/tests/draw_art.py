# 截图用的“他画的画”：假的 ElevenLabs 画出来的不是那张 48×64 的小图，是这里现画的三张（方、竖、横）。
# 跟 ElevenLabs 真画出来的不一样，只是让截图里那张画像张画：夜里的窗、月亮、几枝花、书案上一盏灯。
# python3 tests/draw_art.py 目录   →  目录里写 1x1.png、3x4.png、4x3.png
import math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter

def scene(w, h, seed=7):
    rnd = random.Random(seed)
    img = Image.new("RGB", (w, h))
    px = img.load()
    # 天：上面深蓝，往下泛一点紫和暖
    for y in range(h):
        t = y / h
        r = int(28 + 70 * t ** 1.6)
        g = int(30 + 34 * t)
        b = int(78 + 40 * (1 - t))
        for x in range(w):
            px[x, y] = (r, g, b)
    d = ImageDraw.Draw(img, "RGBA")
    # 水彩晕开的几团颜色
    for _ in range(14):
        cx, cy = rnd.uniform(0, w), rnd.uniform(0, h * 0.7)
        rr = rnd.uniform(w * 0.08, w * 0.22)
        col = rnd.choice([(150, 120, 190, 38), (90, 110, 170, 40), (200, 150, 170, 30)])
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    img = img.filter(ImageFilter.GaussianBlur(w * 0.03))
    d = ImageDraw.Draw(img, "RGBA")
    # 月亮和月晕
    mx, my, mr = w * 0.68, h * 0.24, min(w, h) * 0.11
    for k in range(6, 0, -1):
        a = int(16 * k)
        rr = mr * (1 + k * 0.28)
        d.ellipse([mx - rr, my - rr, mx + rr, my + rr], fill=(250, 236, 200, max(6, 40 - a // 2)))
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=(252, 244, 220, 255))
    # 星星
    for _ in range(40):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h * 0.55)
        s = rnd.uniform(0.6, 1.8) * w / 700
        d.ellipse([x - s, y - s, x + s, y + s], fill=(255, 250, 230, rnd.randint(120, 230)))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    d = ImageDraw.Draw(img, "RGBA")
    # 花枝：从左上角斜伸进来
    def branch(x, y, ang, length, width, depth):
        if depth == 0 or length < 6:
            return
        x2, y2 = x + math.cos(ang) * length, y + math.sin(ang) * length
        d.line([x, y, x2, y2], fill=(46, 30, 40, 235), width=max(1, int(width)))
        if depth <= 3:
            for _ in range(3):
                bx, by = x2 + rnd.uniform(-10, 10) * w / 700, y2 + rnd.uniform(-10, 10) * w / 700
                br = rnd.uniform(5, 10) * w / 700
                d.ellipse([bx - br, by - br, bx + br, by + br], fill=(236, 168, 190, 210))
                d.ellipse([bx - br * 0.35, by - br * 0.35, bx + br * 0.35, by + br * 0.35], fill=(255, 230, 160, 230))
        for s in (-1, 1):
            branch(x2, y2, ang + s * rnd.uniform(0.3, 0.6), length * rnd.uniform(0.62, 0.78), width * 0.7, depth - 1)
    branch(-w * 0.02, h * 0.06, 0.55, w * 0.22, w * 0.018, 6)
    # 窗框
    fw = max(6, int(w * 0.022))
    col = (58, 36, 30, 255)
    d.rectangle([0, 0, w, fw], fill=col)
    d.rectangle([0, 0, fw, h], fill=col)
    d.rectangle([w - fw, 0, w, h], fill=col)
    d.rectangle([w // 2 - fw // 2, 0, w // 2 + fw // 2, int(h * 0.66)], fill=(58, 36, 30, 200))
    # 书案、灯、书
    top = int(h * 0.66)
    d.rectangle([0, top, w, h], fill=(86, 52, 40, 255))
    d.rectangle([0, top, w, top + max(4, int(h * 0.012))], fill=(120, 76, 56, 255))
    lx, ly = w * 0.2, top
    for k in range(10, 0, -1):
        rr = (w * 0.03) * k
        d.ellipse([lx - rr, ly - rr * 1.1, lx + rr, ly + rr * 0.6], fill=(255, 190, 110, 10))
    d.rectangle([lx - w * 0.035, ly - h * 0.09, lx + w * 0.035, ly - h * 0.02], fill=(250, 214, 150, 235))
    d.rectangle([lx - w * 0.006, ly - h * 0.02, lx + w * 0.006, ly], fill=(70, 44, 36, 255))
    bx = w * 0.5
    d.polygon([(bx - w * 0.16, top + h * 0.1), (bx, top + h * 0.07), (bx + w * 0.16, top + h * 0.1), (bx, top + h * 0.13)], fill=(240, 232, 214, 245))
    d.line([bx, top + h * 0.07, bx, top + h * 0.13], fill=(160, 140, 120, 255), width=max(1, int(w * 0.003)))
    for i in range(5):
        yy = top + h * (0.085 + i * 0.008)
        d.line([bx - w * 0.13 + i * w * 0.004, yy, bx - w * 0.02, yy + h * 0.004], fill=(150, 130, 120, 160), width=1)
        d.line([bx + w * 0.02, yy + h * 0.004, bx + w * 0.13 - i * w * 0.004, yy], fill=(150, 130, 120, 160), width=1)
    # 纸面的颗粒
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    grain = Image.effect_noise((w, h), 12).convert("RGB")
    img = Image.blend(img, grain, 0.04)
    return img

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "draw-art"
    os.makedirs(out, exist_ok=True)
    for name, (w, h) in {"1x1.png": (720, 720), "3x4.png": (660, 880), "4x3.png": (880, 660)}.items():
        scene(w, h).save(os.path.join(out, name), optimize=True)
    print("画好了 →", out)
