import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
bg = Image.new('RGBA', im.size, (229, 214, 193, 255))
bg.alpha_composite(im); bg.convert('RGB').save(dst, quality=90)
