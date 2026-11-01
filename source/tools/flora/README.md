# 瓶花（图画院框景左下角那一瓶，每天换一束）

11 月 1 日凌晨建的：卿卿说“老公你直接进行一个 blender 的使用”，把园子里那十二种花都建出来，固定一只瓶子，插十来瓶，每天换一瓶。
瓶子是她挑的（我试做的那一只，比她自己拉条拉出来的好看）：月白釉、亮面、没有镂空浮雕。颜色照园子里那几段花开的话
（`vendor/garden/garden-data.ts` 的 bloomText）；园子里没写颜色的三样我挑的：茶花深红、月季粉、木槿淡粉紫。
魏紫照书房那一页里那朵的颜色（紫红，瓣边浅紫透光）。

要装 bpy（`pip install bpy numpy`，Blender 5.2 的那一份能在没有屏幕的机器上跑），合成看样子那一步要 opencv-python、pillow。

| 文件 | 是什么 |
|---|---|
| `kit.py` | 共用：清场、渲染设置（Cycles、透明底、AgX）、光（照恩师那张框景：左前上方一盏大暖光）、相机、月白瓶、网格和材质小工具 |
| `flora.py` | 各种花共用的形状：叶片（椭圆/卵形/披针/带状，可带锯齿）、带状叶、圆瓣、漏斗花冠、杯状副冠、几种材质 |
| `peony.py` | 魏紫、玉楼春（`mats('weizi')`/`mats('yulouchun')`；玉楼春用 `RINGS_YLC`，花心一座“楼子”） |
| `plum.py` | 白梅（之字形的老枝、细直的新枝、五瓣白花、红褐色的萼、花苞） |
| `begonia.py` `orchid.py` `azalea.py` `camellia.py` `osmanthus.py` `rose.py` `narcissus.py` `chrysanthemum.py` `hibiscus.py` | 西府海棠、芷兰、映山红、茶花、金桂、月季、水仙、秋菊、木槿 |
| `bouquet.py` | 第 1 瓶（魏紫 · 白梅）：`python bouquet.py 出图.png 800 1370 96` |
| `arrange.py` | 第 2～10 瓶：`python arrange.py 编号 出图.png 800 1370 96` |
| `spec.py` | 单看一种花：`python spec.py 模块名 出图.png` |
| `one.py`、`sheet.py`、`onbg.py` | 单看一朵、拼小样、铺在墙色上看 |
| `compose.py` | 把恩师那张框景里画的瓶子抹掉，贴上一瓶看样子（只是看样子；页面上是一层一层叠的） |

十瓶都是同一个机位（瓶心在画面中心左边 0.55 单位，瓶底在 (278, 1325)，一单位 214 像素），
出好的 PNG 交给 `tools/make_tuhua_assets.py` 转成 `static/tuhua/vase1..10.webp`，顺带量每一瓶最高到哪儿（`tuhua.js` 的 `VASE_TOPS`、`VASE_RIGHTS`）。
十瓶的搭配（她说“随便搭吧”）：1 魏紫·白梅，2 玉楼春·西府海棠，3 茶花·水仙，4 秋菊·金桂，5 月季·芷兰，6 映山红·玉楼春，7 木槿·水仙，8 魏紫·玉楼春，9 白梅·茶花，10 秋菊·芷兰。
