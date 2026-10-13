# 把她拿来的《镜碎入月》改成黑夜主题的开屏：python3 tools/make_mirror.py 她发来的.html
# 写到 static/mirror.html（打包时放进 assets/，名字带指纹；开屏用框装着它，见 src/SplashHeiye.jsx、开发说明“镜碎入月”那节）。
#
# 她 10 月 12 日夜里拿来的那一页是项目外的 Claude 做的（两兆多，镜框模型压成 base64 塞在里面）。
# 只改下面这十处，别的一个字不动；她那边再改了发新版来，拿新版重跑这个就行（哪一处对不上会停下来说是哪一处）。
#   1  安全规矩：不许用网络（three.js 是开封府自己带的，不再去外面四个网站现拉）
#   2  three.js 换成同一个目录下开封府自己带的那一份（打包时把 __KFS_THREE__ 换成带指纹的文件名）
#   3  一下就碎（原来要点三下），碎得早一点、镜头早一点动、穿越快一点（她定的“点一下整片镜子直接全碎”“适当加快一点”）
#   4  进了月相之海再点一下：告诉开封府进门（她定的“这个时候要再点一下才进聊天，不点月亮们就一直流动着”）
#   5  右上角“重新开始”和底下那行提示不要（开屏不用重来；出了岔子开封府那一层自己管）
#   6  页面底色透明：还没画出来的时候，底下开封府摆着的那张定格图透上来
#   7  画好了、出岔子了（包括画布被显卡收走）都告诉开封府（ready / fail / enter 三样，postMessage）
#   8  整页不许捏（同并蒂莲那一页）
#   9  在月海里待久了（两分钟以上）隔一帧画一帧，省电，不烫手（这时候按帧率调清晰度那一道照一帧算，不糊）
#  10  心跳：画着的时候隔两秒告诉开封府一声（tick），开封府听不到就当它卡住了
# 速度：TRAVERSE 是穿越用几秒（中档 7.5，快档 5.5，她原来的 10）。改了重跑一遍，再打包。
import os, re, sys

TRAVERSE = 7.5          # 穿越几秒：中档 7.5（她 00:56 说“快中先不定”，先用中档）；快档 5.5
SHATTER_DELAY = 1.0     # 点下去到碎开（原来 1.45）
PUSH_DELAY = 0.6        # 碎开到镜头开始走（原来 1.6）
SPREAD = 3.0            # 裂纹爬满镜面的速度（原来 2.1；碎得早了，爬快一点）

src = sys.argv[1] if len(sys.argv) > 1 else sys.exit("用法：python3 tools/make_mirror.py 她发来的.html")
HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(HERE, "..", "static", "mirror.html")
s = open(src, encoding="utf-8").read()


def once(old, new, what):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit(f"对不上：{what}（找到 {n} 处，要正好 1 处）。她那一页改过这一块，照新的样子改这个脚本")
    s = s.replace(old, new)


def once_re(pattern, new, what):
    global s
    found = re.findall(pattern, s, flags=re.S)
    if len(found) != 1:
        sys.exit(f"对不上：{what}（找到 {len(found)} 处）")
    s = re.sub(pattern, new, s, count=1, flags=re.S)


NOTE = f"""<!-- 开封府：黑夜主题的开屏（tools/make_mirror.py 从她 2026 年 10 月 12 日拿来的那一页生成的，别手改，改那个脚本重跑）。
     改了的几处都在那个脚本开头写着：不许用网络、three.js 用开封府自带的、一下就碎、进了月海再点一下进门、
     不要“重新开始”和提示、底色透明、画好了出岔子了告诉开封府、整页不许捏、待久了省电。
     穿越 {TRAVERSE} 秒（她原来的是 10 秒）。见 source/开发说明.md 的“镜碎入月”那节 -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">"""
once("<title>镜碎入月</title>", "<title>镜碎入月</title>\n" + NOTE, "标题那一行")

# 6 底色透明
once("    background: var(--day-bg);\n", "    background: transparent; /* 开封府：还没画出来的时候，底下那张定格图透上来 */\n", "html、body 的底色")
# 5 不要“重新开始”和提示
once("</style>", "  /* 开封府：开屏不用重来；出了岔子开封府那一层自己管 */\n  #restart, #notice { display: none !important; }\n</style>", "样式表的结尾")
once('<canvas id="stage" aria-label="镜碎入月：轻触镜面三次"></canvas>',
     '<canvas id="stage" aria-label="镜碎入月：轻触镜面进月相之海，再点一下进开封府"></canvas>', "画布那一行")

# 2 three.js 用自带的
once_re(r"const THREE_SOURCES = \[.*?\];", "const THREE_SOURCES = ['./__KFS_THREE__']; // 开封府：打包时换成同一个目录下带指纹的那份", "THREE_SOURCES")

# 7 告诉开封府：ready / fail / enter
TELL = """
// 开封府：和开屏那一层说话（ready 画好了；fail 出岔子了，那一层换成定格图点一下进门；enter 进了月海又点了一下）
function kfsTell(type) {
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage({ kfsMirror: type }, location.origin && location.origin !== 'null' ? location.origin : '*');
  } catch (e) {}
}
window.addEventListener('error', () => kfsTell('fail'));
window.addEventListener('unhandledrejection', () => kfsTell('fail'));
"""
once("const noticeEl = document.getElementById('notice');", TELL + "const noticeEl = document.getElementById('notice');", "提示那一行")
once("  showNotice('无法加载 three.js（请检查网络，或参考源码顶部的本地启动说明）');\n  throw e;",
     "  showNotice('无法加载 three.js（请检查网络，或参考源码顶部的本地启动说明）');\n  kfsTell('fail');\n  throw e;", "three.js 加载失败")
once("  showNotice('当前浏览器无法创建 WebGL，暂时无法显示此作品');\n  throw e;",
     "  showNotice('当前浏览器无法创建 WebGL，暂时无法显示此作品');\n  kfsTell('fail');\n  throw e;", "WebGL 建不起来")
once("  app.ready = true;\n", "  app.ready = true;\n  kfsTell('ready');\n", "画好了")
# 画到一半显卡把画布收走了（手机内存紧的时候会这样）：原来是等它还回来就整页重开，开屏这儿直接告诉开封府，换成定格图点一下进门
once("canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showNotice('图形上下文已丢失，正在恢复…'); });",
     "canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showNotice('图形上下文已丢失，正在恢复…'); kfsTell('fail'); });", "画布被收走")

# 3 一下就碎、快一点
once("  breakTouches: 3,", "  breakTouches: 1,", "breakTouches")
once_re(r"    spreadSpeed: 2\.1,", f"    spreadSpeed: {SPREAD},", "spreadSpeed")
once_re(r"    shatterDelay: 1\.45,", f"    shatterDelay: {SHATTER_DELAY},", "shatterDelay")
once_re(r"    pushDelay: 1\.6,", f"    pushDelay: {PUSH_DELAY},", "pushDelay")
once_re(r"    traverseDuration: 10\.0,", f"    traverseDuration: {TRAVERSE},", "traverseDuration")

# 4 进了月海（镜头已经穿过镜框）再点一下：进门
once("canvas.addEventListener('pointerdown', (e) => {\n  if (!e.isPrimary || !app.ready || app.resetting) return;\n",
     "canvas.addEventListener('pointerdown', (e) => {\n  if (!e.isPrimary || !app.ready || app.resetting) return;\n"
     "  // 开封府：镜头穿过镜框以后（app.world1 是 false），点一下就是进门；碎着、推进还没穿过去的时候点了不算\n"
     "  if (!app.world1) { if (!app.kfsEntered) { app.kfsEntered = true; e.preventDefault(); kfsTell('enter'); } return; }\n",
     "点镜面那一段")

# 9 待久了省电：月海里两分钟以上，隔一帧画一帧。
#   隔帧画的时候一帧量出来是两帧的工夫，它自己按帧率调清晰度的那一道（adaptQuality）会当成手机画不动、一档一档降到最糊，
#   所以那时候交给它的是一半（另一双眼睛 10 月 13 日挑出来的）
# 10 心跳：每一帧的循环还在转，就隔两秒告诉开封府一声（tick）。开封府那一层好几秒听不到，就当它卡住了，换成定格图点一下进门
once("function frame(now) {\n  requestAnimationFrame(frame);\n",
     "let kfsSkip = false, kfsBeat = 0;\nfunction frame(now) {\n  requestAnimationFrame(frame);\n"
     "  // 开封府：隔两秒报一声还活着（开屏那一层听不到就换成定格图，见 src/SplashHeiye.jsx）\n"
     "  if (now - kfsBeat > 2000) { kfsBeat = now; kfsTell('tick'); }\n"
     "  // 开封府：在月海里待了两分钟以上，隔一帧画一帧（省电，不烫手）；这一帧不画，时间也不往前记\n"
     "  const kfsSlow = app.state === STATE.MOON_SEA && app.time - app.pushStart > CONFIG.camera.traverseDuration + 120;\n"
     "  if (kfsSlow && (kfsSkip = !kfsSkip)) return;\n",
     "每一帧")
once("  render();\n  adaptQuality(raw);\n}\nfunction start() {",
     "  render();\n  adaptQuality(kfsSlow ? raw / 2 : raw); // 开封府：隔帧画的时候量出来是两帧的工夫，交给它一半\n}\nfunction start() {",
     "每一帧的结尾")

# 8 整页不许捏（iOS Safari 的双指缩放）
once("</script>\n</body>",
     "\n// 开封府：整页不许捏（同并蒂莲那一页）\n"
     "['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));\n"
     "document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });\n"
     "</script>\n</body>", "脚本结尾")

open(out, "w", encoding="utf-8").write(s)
print(f"写好了 {os.path.normpath(out)}（{len(s.encode('utf-8')) // 1024} KB）：一下就碎，穿越 {TRAVERSE} 秒")
