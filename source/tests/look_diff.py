# 比两遍 tests/look.py 拍的照：python3 tests/look_diff.py 前 后 [差异图放哪]
# 一张一张比像素：一样的报“一样”；不一样的报有多少个像素不同、最多差多少、在哪一块（外接框），
# 再把不一样的地方用红色标出来存一张图，好拿眼睛看是哪儿变了。
import os, sys
from PIL import Image, ImageChops

a_dir, b_dir = sys.argv[1], sys.argv[2]
diff_dir = sys.argv[3] if len(sys.argv) > 3 else None
if diff_dir:
    os.makedirs(diff_dir, exist_ok=True)

same, differ, missing = 0, 0, 0
for root, _, files in os.walk(a_dir):
    for f in sorted(files):
        if not f.endswith(".png"):
            continue
        rel = os.path.relpath(os.path.join(root, f), a_dir)
        pb = os.path.join(b_dir, rel)
        if not os.path.exists(pb):
            print(f"缺：{rel}")
            missing += 1
            continue
        A = Image.open(os.path.join(root, f)).convert("RGB")
        B = Image.open(pb).convert("RGB")
        if A.size != B.size:
            print(f"大小不一样：{rel} {A.size} {B.size}")
            differ += 1
            continue
        d = ImageChops.difference(A, B)
        box = d.getbbox()
        if not box:
            same += 1
            continue
        differ += 1
        px = d.convert("L").point(lambda v: 255 if v > 0 else 0)
        n = sum(1 for v in (px.get_flattened_data() if hasattr(px, "get_flattened_data") else px.getdata()) if v)
        mx = max(max(ch) for ch in (band.getextrema() for band in d.split()))
        print(f"不一样：{rel}  {n} 个像素，最多差 {mx}，在 {box}")
        if diff_dir:
            mark = Image.blend(A, Image.new("RGB", A.size, (255, 255, 255)), 0.6)
            mark.paste((255, 0, 0), mask=px)
            mark.save(os.path.join(diff_dir, rel.replace(os.sep, "__")))
print(f"一样 {same}  不一样 {differ}  缺 {missing}")
