# 侧栏顶上“開封府”那三个字：python3 tools/make_title.py <qiji-combo.ttf>（在 source/ 里跑），生成 src/ui/art/title.js。
#
# 这三个字固定用秘戏钱匣卷轴上那款刻本体，不跟着系统的字体走。
# 字是齊伋體（Qiji，Copyright (c) 2020 Lingdong Huang，SIL Open Font License 1.1，保留字体名 QIJI；
# 授权全文在 static/jinhui/OFL.txt），黄令东从明代凌闵刻本里一个个抠出来的。取法同 tools/make_jinhui.py：
#   npm pack @raycosine/qiji-font@0.0.4，解开以后的 package/qiji-combo.ttf。
# 刻本里只有繁体的“開”（这款字把“开”也指到它上面），所以写出来是“開封府”。
#
# 为什么不用字体文件、画成一条路径：就三个字，为它们取两块字（一百六十多 KB）不值；
# 画成路径不用等字体、不闪，颜色跟着字的颜色走（fill 写 currentColor）。
# 用的是原样的轮廓（没像 make_jinhui.py 那样省点）：这三个字摆得大，刀口的毛边要留着。坐标取整（一个字一千个单位）。
#
# 摆法：三个字照墨迹（不照字框）排，字和字之间空 GAP 个单位：刻本字的字框左右留白不一样，照字框排看着一疏一密。
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

TEXT = "開封府"
GAP = 190

if len(sys.argv) != 2:
    sys.exit("用法：python3 tools/make_title.py <qiji-combo.ttf>")
font = TTFont(sys.argv[1])
cmap, glyphs = font.getBestCmap(), font.getGlyphSet()
path = SVGPathPen(glyphs, ntos=lambda v: str(int(round(v))))
whole = BoundsPen(glyphs)
x = 0
for ch in TEXT:
    g = glyphs[cmap[ord(ch)]]
    own = BoundsPen(glyphs)
    g.draw(own)
    left, _, right, _ = own.bounds
    for pen in (path, whole):
        g.draw(TransformPen(pen, (1, 0, 0, -1, x - left, 0)))  # 字体里 y 朝上，SVG 里朝下
    x += (right - left) + GAP
x0, y0, x1, y1 = [int(round(v)) for v in whole.bounds]
out = (
    "// 侧栏顶上“開封府”三个字（App.jsx 的侧栏那里）：齊伋體的轮廓画成一条路径。\n"
    "// 齊伋體 Qiji, Copyright (c) 2020 Lingdong Huang, SIL Open Font License 1.1（static/jinhui/OFL.txt）。\n"
    "// 这个文件是 tools/make_title.py 生成的，别手改：换字、换字距，去改那边重新生成。\n"
    f"// BOX 是这条路径占的框（给 viewBox 用）：左、上、宽、高，一个字一千个单位。\n"
    f"export const BOX = [{x0}, {y0}, {x1 - x0}, {y1 - y0}];\n"
    f'export const PATH =\n  "{path.getCommands()}";\n'
)
open("src/ui/art/title.js", "w", encoding="utf-8").write(out)
print(f"src/ui/art/title.js：{len(out)} 个字符，框 {x1 - x0}×{y1 - y0}")
