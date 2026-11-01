# 拼一张小样：python3 sheet.py 输出.jpg 列数 名字=图 ...
import sys
from PIL import Image, ImageDraw, ImageFont
out, cols = sys.argv[1], int(sys.argv[2])
items = [a.split('=', 1) for a in sys.argv[3:]]
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 22, index=2)
ims = []
for lab, p in items:
    im = Image.open(p).convert('RGBA')
    bg = Image.new('RGBA', im.size, (229, 214, 193, 255)); bg.alpha_composite(im)
    ims.append((lab, bg.convert('RGB')))
w, h = ims[0][1].size
g = 10; lh = 34
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * w + (cols + 1) * g, rows * (h + lh) + (rows + 1) * g), (214, 200, 180))
d = ImageDraw.Draw(S)
for i, (lab, im) in enumerate(ims):
    r, c = divmod(i, cols)
    x = g + c * (w + g); y = g + r * (h + lh + g)
    S.paste(im, (x, y + lh)); d.text((x + 6, y + 4), lab, fill=(70, 58, 50), font=font)
S.save(out, quality=88)
print(S.size)
