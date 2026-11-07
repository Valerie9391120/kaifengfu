# 狐宇宙那一页（他的屋子：一张书案）：python3 tools/make_desk.py 案上那一页.html
# 写到 static/desk/：desk.html（那一页）和 files/（图、几何、两份截出来的小字体）。打包的时候 build.mjs 给 files/ 里的每一样
# 起带指纹的名字、放进 assets/desk/，换进 desk.html；南衙 → 狐宇宙，一层全屏的框装着它（见 src/desk/DeskPage.jsx）。
#
# 进来的是光义那边打好的单页（three.js r128 打在里面，图和几何压成 base64，信笺那一页带着编的信，开封府这一层的接口
# window.KFSROOM 那几处已经留好了）。只改下面这几处，别的一个字不动；那一页改了，拿新的重跑这个（哪一处对不上会停下来说是哪一处）：
#   1  注释全拿掉（脚本、样式、页面上的；three.js 开头的授权留着）
#   2  图和几何一样一个文件（files/），页面照名字去取：three 的 URL 改写、fetch 换成取那个文件。哪一样没取到，画好以后告诉开封府
#   3  编的信拿掉；信笺上的信、推近以后卡片上写什么（园子、妆台眼下的样子）由开封府递进来；点了已阅、撤回、留信、信匣、梦库、梦廊，
#      案上点左上角回开封府，都告诉开封府（postMessage；这一页关在隔开的框里，每一句带着开封府给的暗号）
#   4  字：页面上写死的那些字，从霞鹜文楷里截一份（files/wenkai-ui.woff2）；递进来的字（几行小字、园子妆台的样子）不在里面的，
#      用开封府 assets 里切好的那一份（__KFS_WENKAI__，打包时换成真名字）；光义写的那几封用藏音匣的刻本体（__KFS_JINHUI__，同一份）；
#      红圈里的字用龙藏体（那一页里截好的那一小份，拆出来）；纸底下她留的信也用龙藏体，截好的那一小份里没有的字，用同页那一份字里的
#      龙藏体（__KFS_LONGCANG__，assets/tyfonts-<指纹>/ 里 Long Cang 400 那一张样式表，打包时换成真名字）
#   5  刘海、底下那一条：框里的 env(safe-area-inset-*) 是 0，开封府量好了递进来（--safe-top 这几个）
#   6  安全规矩：只许跑页面里自己写的脚本，只取同一个目录里的东西，不连别处
#   7  整页不许捏（同并蒂莲、秘戏钱匣）
# 公开仓库：写出来的东西里不许有她说的话、她的称呼、哪天几点（最后查一遍，碰上了就停下来）。
#
# 要装好 fonttools、brotli（pip install fonttools brotli），source/ 里 npm install 过（要 esbuild、lxgw-wenkai-webfont）。
import base64, json, os, re, shutil, subprocess, sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

src = sys.argv[1] if len(sys.argv) > 1 else sys.exit("用法：python3 tools/make_desk.py 案上那一页.html")
HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.normpath(os.path.join(HERE, ".."))
OUT = os.path.join(SOURCE, "static", "desk")
WK = os.path.join(SOURCE, "node_modules", "lxgw-wenkai-webfont")
s = open(src, encoding="utf-8").read()


def die(what):
    sys.exit(f"对不上：{what}。那一页改过这一块，照新的样子改这个脚本")


# ---------- 拆开：一块一块的 <script>、<style> ----------
BLOCK = re.compile(r"<(script|style)([^>]*)>(.*?)</\1>", re.S)
blocks = list(BLOCK.finditer(s))
if len(blocks) < 10:
    die(f"脚本、样式只找到 {len(blocks)} 块")


def ident(m):
    a = re.search(r'id="([^"]+)"', m.group(2))
    return a.group(1) if a else ""


byid = {ident(m): m for m in blocks if ident(m)}
for k in ["xj-fonts", "xj-style", "xj-sample", "xj-art", "xj-code", "xj-fontload"]:
    if k not in byid:
        die(f"信笺那几块里少了 {k}")
bundle = [m for m in blocks if m.group(1) == "script" and "var IMG = {" in m.group(3) and "var JSN = {" in m.group(3)]
three = [m for m in blocks if m.group(1) == "script" and "Three.js Authors" in m.group(3)[:400]]
main = [m for m in blocks if m.group(1) == "script" and "window.__scene = {" in m.group(3)]
if len(bundle) != 1 or len(three) != 1 or len(main) != 1:
    die(f"图和几何那一块 {len(bundle)}、three.js {len(three)}、主体 {len(main)}（都要正好一块）")
if "window.KFSROOM" not in main[0].group(3) or "window.KFSROOM" not in byid["xj-code"].group(3) + main[0].group(3):
    die("主体里没有 window.KFSROOM 那几处（要拿留好了接口的那一版）")

# ---------- 2 图和几何 ----------
dec = json.JSONDecoder()


def obj_after(text, key):
    i = text.find(key)
    if i < 0:
        die(f"没找到 {key.strip()}")
    return dec.raw_decode(text, i + len(key))[0]


b = bundle[0].group(3)
IMG = obj_after(b, "var IMG = ")
JSN = obj_after(b, "var JSN = ")
files = {}  # files/ 里的名字 → 内容（bytes）


def put(name, data):
    if name in files and files[name] != data:
        die(f"两样东西都想叫 {name}")
    files[name] = data


def flat(key):
    # "tex/letter_bake.webp" → "letter_bake.webp"
    n = key.split("/")[-1]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", n):
        die(f"名字不好放进网址：{key}")
    return n


imgMap, jsnMap = {}, {}
for k, v in IMG.items():
    m = re.fullmatch(r"data:image/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)", v)
    if not m:
        die(f"图 {k} 不是 base64 的 webp/png/jpeg")
    put(flat(k), base64.b64decode(m.group(2)))
    imgMap[k] = flat(k)
for k, v in JSN.items():
    try:
        json.loads(v)
    except Exception:
        die(f"几何 {k} 读不出来")
    put(flat(k), v.encode("utf-8"))
    jsnMap[k] = flat(k)

art = json.loads(re.search(r"window\.XJ_ART = (\{.*\});", byid["xj-art"].group(3), re.S).group(1))
artNames = {}
for k, v in list(art.items()):
    vs = v if isinstance(v, list) else [v]
    names = []
    for i, u in enumerate(vs):
        m = re.fullmatch(r"data:image/(webp|png);base64,([A-Za-z0-9+/=]+)", u)
        if not m:
            die(f"信笺的图 {k} 不是 base64")
        n = f"xj-{k}{'-' + 'abc'[i] if isinstance(v, list) else ''}.{m.group(1)}"
        put(n, base64.b64decode(m.group(2)))
        names.append(n)
    artNames[k] = names if isinstance(v, list) else names[0]

# 龙藏体那一小份（红圈里的字、“到此一游”）：信笺那几块的字里拆出来
m = re.search(r'@font-face\{font-family:"XJ Doodle";src:url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\)', byid["xj-fonts"].group(3))
if not m:
    die("龙藏体那一小份")
put("doodle.woff2", base64.b64decode(m.group(1)))


# ---------- 1 注释 ----------
def strip_css(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


STRIP = r"""
const { transformSync } = require("esbuild");
let src = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (src += d));
process.stdin.on("end", () => {
  const r = transformSync(src, { loader: "js", charset: "utf8", legalComments: "none", minifyWhitespace: true });
  process.stdout.write(r.code);
});
"""


def strip_js(js):
    r = subprocess.run(["node", "-e", STRIP], input=js.encode("utf-8"), capture_output=True, cwd=SOURCE)
    if r.returncode:
        sys.exit("拿掉注释的时候 esbuild 读不懂：\n" + r.stderr.decode("utf-8", "replace")[:2000])
    return r.stdout.decode("utf-8")


# 5 刘海、底下那一条
def safe(css):
    return re.sub(r"env\(\s*safe-area-inset-(top|right|bottom|left)\s*(,[^)]*)?\)", lambda m: f"var(--safe-{m.group(1)}, env(safe-area-inset-{m.group(1)}{m.group(2) or ''}))", css)


# ---------- 3 开封府那一层 ----------
BRIDGE = r"""
(function () {
  'use strict';
  var tk = '';
  try { tk = String(window.name || ''); window.name = ''; } catch (e) {}
  function tell(type, extra) {
    try {
      if (!window.parent || window.parent === window) return;
      var m = { desk: type, tk: tk };
      if (extra) for (var k in extra) m[k] = extra[k];
      window.parent.postMessage(m, '*');
    } catch (e) {}
  }
  var rounds = [], notes = [], cards = {}, readied = false, failed = false, seq = 0, leaving = {};
  var TW = ['深夜', '清晨', '上午', '午間', '午後', '傍晚', '夜裏'];
  function letters() {
    return rounds.map(function (r) { return { id: String(r.id), who: 'me', t: Number(r.ts) || 0, text: String(r.text || ''), trad: r.trad ? String(r.trad) : '', lines: Array.isArray(r.lines) ? r.lines.map(String) : [], read: !!r.read }; })
      .concat(notes.map(function (n) { return { id: String(n.id), who: 'her', t: Number(n.ts) || 0, text: String(n.text || '') }; }));   // 她留的、他还没醒来看的那几张：摆在纸底下
  }
  var K = window.KFSROOM = {
    hold: false,
    ready: function () { if (readied || failed) return; readied = true; if (window.__kfsMiss) tell('fail', { net: true }); else tell('ready'); },
    fail: function () { if (!failed && !readied) { failed = true; tell('fail'); } },
    lost: function () { tell('lost'); },
    close: function () { tell('close'); },
    card: function (name) { return Object.prototype.hasOwnProperty.call(cards, name) ? cards[name] : null; },
    go: function (name, label) {
      if (name === '锦盒' && (label === '梦库' || label === '梦廊')) { tell('luofu', { which: label === '梦库' ? 'pool' : 'gallery' }); return true; }
      if (name === '铜镜' && (label === '照镜子' || label === '衣柜' || label === '成就')) { tell('dressing', { which: label === '衣柜' ? 'closet' : label === '成就' ? 'achv' : 'mirror' }); return true; }
      if (name === '花盆' && (label === '看看园子' || label === '群芳谱' || label === '成就')) { tell('garden', { which: label === '群芳谱' ? 'book' : label === '成就' ? 'achv' : 'look' }); return true; }
      return false;
    },
    letters: letters,
    xj: function () {
      return {
        tradWords: TW,
        onRead: function (m) { tell('read', { id: m.id }); },
        onUnread: function (m) { tell('unread', { id: m.id }); },
        onLeave: function (m) { var n = ++seq; leaving[n] = m.text; tell('leave', { text: String(m.text || ''), n: n }); },
        onBoxOn: function (on) { tell('box', { on: !!on }); },
        onVoice: function (key) { tell('voice', { key: String(key) }); },
        onDraw: function (key) { tell('draw', { key: String(key) }); },
        onDoc: function (ref) { tell('doc', { ref: String(ref) }); },
        onRecap: function (id) { tell('recap', { id: String(id) }); },
        onRecapDrop: function (id) { tell('recapdrop', { id: String(id) }); },
        onSave: function (ref) { tell('save', { ref: String(ref) }); },
        onCopy: function (text) { tell('copy', { text: String(text) }); }
      };
    }
  };
  window.addEventListener('error', function () { if (!readied) K.fail(); });
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var m = e.data || {};
    if (m.desk === 'setup') {
      var st = document.documentElement.style;
      ['top', 'right', 'bottom', 'left'].forEach(function (k) { if (typeof m[k] === 'number') st.setProperty('--safe-' + k, m[k] + 'px'); });
      try { window.dispatchEvent(new Event('resize')); } catch (er) {}
    } else if (m.desk === 'data') {
      if (Array.isArray(m.rounds)) rounds = m.rounds;
      if (Array.isArray(m.notes)) notes = m.notes;
      if (m.cards && typeof m.cards === 'object') cards = m.cards;
      if (window.XJ && XJ.setData) XJ.setData(letters());
      if (window.__kfsCard) window.__kfsCard();
    } else if (m.desk === 'left') {
      var t = leaving[m.n]; delete leaving[m.n];
      if (!m.ok && window.XJ && XJ.unsent) XJ.unsent(t);
    } else if (m.desk === 'box') {
      if (window.XJ && XJ.setBox) XJ.setBox({ rows: Array.isArray(m.rows) ? m.rows : [] });
    } else if (m.desk === 'pics') {
      if (m.pics && typeof m.pics === 'object' && window.XJ && XJ.setPics) XJ.setPics(m.pics);
    } else if (m.desk === 'sounds') {
      if (m.sounds && typeof m.sounds === 'object' && window.XJ && XJ.setSounds) XJ.setSounds(m.sounds);
    } else if (m.desk === 'states') {
      if (window.XJ && XJ.setStates) XJ.setStates({ st: m.st && typeof m.st === 'object' ? m.st : {}, playing: String(m.playing || '') });
    } else if (m.desk === 'show') {
      if (m.doc && typeof m.doc === 'object' && window.XJ && XJ.showRead) XJ.showRead(m.doc);
    } else if (m.desk === 'copied') {
      if (window.XJ && XJ.copied) XJ.copied(!!m.ok);
    } else if (m.desk === 'tip') {
      if (window.XJ && XJ.tip) XJ.tip(String(m.text || ''));
    } else if (m.desk === 'hold') {
      K.hold = !!m.on;
      var sg = document.getElementById('stage');
      if (sg) sg.classList.toggle('kfs-hold', K.hold);
    }
  });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener('touchmove', function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  tell('hello');
})();
"""

# 2 页面照名字去取：__KFS_DESK_FILES__ 打包时换成 { files/ 里的名字: 带指纹的网址 }
LOADER = (
    "(function () {\n"
    "  var F = __KFS_DESK_FILES__;\n"
    f"  var IMG = {json.dumps(imgMap, ensure_ascii=False)};\n"
    f"  var JSN = {json.dumps(jsnMap, ensure_ascii=False)};\n"
    "  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };\n"
    "  var miss = function () { window.__kfsMiss = (window.__kfsMiss || 0) + 1; };\n"
    "  THREE.DefaultLoadingManager.onError = miss;\n"
    "  THREE.DefaultLoadingManager.setURLModifier(function (u) { return has(IMG, u) && has(F, IMG[u]) ? F[IMG[u]] : u; });\n"
    "  var f0 = window.fetch;\n"
    "  window.fetch = function (u) {\n"
    "    if (typeof u === 'string' && has(JSN, u) && has(F, JSN[u])) return f0.call(window, F[JSN[u]]).then(function (r) { if (!r.ok) miss(); return r; }, function (e) { miss(); throw e; });\n"
    "    return f0.apply(this, arguments);\n"
    "  };\n"
    "  window.XJ_ART = { "
    + ", ".join(f"{json.dumps(k)}: " + (f"[{', '.join('F[' + json.dumps(x) + ']' for x in v)}]" if isinstance(v, list) else f"F[{json.dumps(v)}]") for k, v in artNames.items())
    + " };\n"
    "})();\n"
)

# ---------- 拼回去 ----------
out = []
pos = 0
for m in blocks:
    out.append(s[pos : m.start()])
    pos = m.end()
    tag, attrs, body = m.group(1), m.group(2), m.group(3)
    k = ident(m)
    if tag == "style":
        if "@font-face" in body and "data:font/woff2" in body and k != "xj-style":
            continue  # 原来内嵌的那几份字（4 换成下面那几份）
        out.append(f"<style>{safe(strip_css(body))}</style>")
    elif m is three[0]:
        out.append(f"<script>{body}</script>")
    elif m is bundle[0]:
        out.append(f"<script>{strip_js(BRIDGE)}</script>\n<script>{strip_js(LOADER)}</script>")
    elif k in ("xj-sample", "xj-art"):
        continue
    else:
        out.append(f"<script>{strip_js(body)}</script>")
out.append(s[pos:])
html = "".join(out)
html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
if "data:font" in html or re.search(r"base64,[A-Za-z0-9+/=]{200,}", html):
    die("拆完了页面里还有 base64 的东西")

# ---------- 4 字 ----------
# 页面上写死的字：脚本里的字符串、页面上的字（拿掉注释以后的），再加上递进来的那几样常见的（园子的花名、衣柜里的衣服、卡片上的说法）
def page_chars(text):
    cps = set()
    for lit in re.findall(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", text):
        cps |= {ord(c) for c in lit}
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", text, flags=re.S)
    cps |= {ord(c) for c in re.sub(r"<[^>]+>", "", body)}
    return {c for c in cps if c >= 0x2000 or 0x20 <= c < 0x7F or c == 0xB7}


def literals(t):
    return "".join(a or b for a, b in re.findall(r'"([^"\n]*)"|`([^`]*)`', re.sub(r"/\*.*?\*/|//[^\n]*", "", t, flags=re.S)))


extra = literals(open(os.path.join(SOURCE, "src", "desk", "parts.js"), encoding="utf-8").read())
extra += "".join(re.findall(r'name: "([^"]*)"', open(os.path.join(SOURCE, "vendor", "dressing", "dressing-data.ts"), encoding="utf-8").read()))
extra += "".join(re.findall(r'(?:displayName|shortName): "([^"]*)"', open(os.path.join(SOURCE, "vendor", "garden", "garden-data.ts"), encoding="utf-8").read()))
ui = page_chars(html) | {ord(c) for c in extra if ord(c) >= 0x2000 or 0x20 <= ord(c) < 0x7F}
DOODLE = {ord(c) for c in "到此一游！已阅留信下"}


def parse_faces(css):
    faces = []
    for blk in re.findall(r"@font-face\s*\{(.*?)\}", css, re.S):
        f = re.search(r"url\(['\"]?([^'\")]+)['\"]?\)", blk)
        r = re.search(r"unicode-range:\s*([^;}]+)", blk)
        if not f or not r:
            continue
        rs = []
        for part in r.group(1).split(","):
            part = part.strip().upper().replace("U+", "")
            if "-" in part:
                a, z = part.split("-")
                rs.append((int(a, 16), int(z, 16)))
            elif part:
                rs.append((int(part, 16), int(part, 16)))
        faces.append((f.group(1), rs))
    return faces


# 霞鹜文楷切好的那一份（npm 的 lxgw-wenkai-webfont，Regular）里挑出这几个字，拼成一个字体
def build_subset(cps, out_path):
    css_path = os.path.join(WK, "lxgwwenkai-regular.css")
    if not os.path.exists(css_path):
        sys.exit("没找到 node_modules/lxgw-wenkai-webfont：先在 source/ 里 npm install")
    faces = parse_faces(open(css_path, encoding="utf-8").read())
    cache, order, cmap, glyphs, hmtx, vmtx, missing, ref = {}, [".notdef"], {}, {}, {}, {}, [], None
    pen = TTGlyphPen(None)
    glyphs[".notdef"] = pen.glyph()
    hmtx[".notdef"] = (500, 0)
    vmtx[".notdef"] = (1000, 0)
    for cp in sorted(cps):
        src_f = next((fn for fn, rs in faces if any(a <= cp <= z for a, z in rs)), None)
        if not src_f:
            missing.append(cp)
            continue
        if src_f not in cache:
            cache[src_f] = TTFont(os.path.normpath(os.path.join(WK, src_f)))
        f = cache[src_f]
        ref = ref or f
        gn = f.getBestCmap().get(cp)
        if gn is None:
            missing.append(cp)
            continue
        name = "uni%04X" % cp if cp <= 0xFFFF else "u%05X" % cp
        if name not in glyphs:
            p = TTGlyphPen(None)
            f.getGlyphSet()[gn].draw(p)
            glyphs[name] = p.glyph()
            order.append(name)
            hmtx[name] = f["hmtx"][gn]
            if "vmtx" in f:
                vmtx[name] = f["vmtx"][gn]
        cmap[cp] = name
    fb = FontBuilder(ref["head"].unitsPerEm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    gt = fb.font["glyf"]
    hm = {}
    for n in order:
        g = gt[n]
        g.recalcBounds(gt)
        hm[n] = (hmtx[n][0], getattr(g, "xMin", 0) if g.numberOfContours else 0)
    fb.setupHorizontalMetrics(hm)
    hh, os2 = ref["hhea"], ref["OS/2"]
    fb.setupHorizontalHeader(ascent=hh.ascent, descent=hh.descent, lineGap=hh.lineGap)
    fb.setupNameTable({"familyName": "KFS WenKai", "styleName": "Regular", "uniqueFontIdentifier": "KFS WenKai desk subset", "fullName": "KFS WenKai",
                       "psName": "KFSWenKai-Regular", "version": "Version 1.0 (LXGW WenKai subset, SIL OFL 1.1)"})
    fb.setupOS2(sTypoAscender=os2.sTypoAscender, sTypoDescender=os2.sTypoDescender, sTypoLineGap=os2.sTypoLineGap, usWinAscent=os2.usWinAscent,
                usWinDescent=os2.usWinDescent, fsType=0, achVendID=os2.achVendID, ulUnicodeRange1=os2.ulUnicodeRange1, ulUnicodeRange2=os2.ulUnicodeRange2,
                ulUnicodeRange3=os2.ulUnicodeRange3, ulUnicodeRange4=os2.ulUnicodeRange4, sxHeight=getattr(os2, "sxHeight", 0), sCapHeight=getattr(os2, "sCapHeight", 0))
    if "vhea" in ref and vmtx:
        fb.setupVerticalHeader(ascent=ref["vhea"].ascent, descent=ref["vhea"].descent)
        fb.setupVerticalMetrics({n: vmtx.get(n, (1000, 0)) for n in order})
    fb.setupPost()
    fb.font["head"].fontRevision = 1.0
    fb.font["head"].created = fb.font["head"].modified = 3846000000  # 定死时间戳：重跑出来一个字节都不差
    fb.font.recalcTimestamp = False
    fb.font.flavor = "woff2"
    fb.save(out_path)
    return sorted(cmap), missing


os.makedirs(OUT, exist_ok=True)
tmp = os.path.join(OUT, ".wenkai-ui.woff2")
got, missing = build_subset(ui, tmp)
put("wenkai-ui.woff2", open(tmp, "rb").read())
os.remove(tmp)
dcm = set(TTFont(__import__("io").BytesIO(files["doodle.woff2"])).getBestCmap())
if not DOODLE <= dcm:
    die("龙藏体那一小份里缺字：" + "".join(chr(c) for c in sorted(DOODLE - dcm)))


def ranges(cps):
    cps = sorted(cps)
    out_r, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out_r.append("U+%X" % cps[i] if i == j else "U+%X-%X" % (cps[i], cps[j]))
        i = j + 1
    return ",".join(out_r)


FONTS = (
    '<link rel="stylesheet" href="./__KFS_WENKAI__">\n<link rel="stylesheet" href="./__KFS_JINHUI__">\n<link rel="stylesheet" href="./__KFS_LONGCANG__">\n'
    "<style>"
    f'@font-face{{font-family:"KFS WenKai";src:url("__KFS_DESK_FILE__wenkai-ui.woff2") format("woff2");font-weight:300 700;font-display:block;unicode-range:{ranges(got)}}}'
    '@font-face{font-family:"XJ Doodle";src:url("__KFS_DESK_FILE__doodle.woff2") format("woff2");font-display:block}'
    # 开封府那一层在上面弹着梦库、梦廊的时候（hold）：推近以后底下那张卡片、提示先收起来，不从磨砂底下透上来
    "#stage.kfs-hold #card,#stage.kfs-hold #hint,#stage.kfs-hold #tip,#stage.kfs-hold #tag{opacity:0!important;transition:none!important}"
    "</style>\n"
)
# 6 安全规矩：脚本只许页面里自己的那几段（照内容记指纹，打包时算），别的只许同一个目录
CSP = '<meta http-equiv="Content-Security-Policy" content="__KFS_DESK_CSP__">\n'
head_end = html.find("</head>")
if head_end < 0 or html.count("</head>") != 1:
    die("</head>")
html = html[:head_end] + CSP + FONTS + html[head_end:]
html = html.replace("<title>古风书房庭院</title>", "<title>狐宇宙</title>") if "<title>古风书房庭院</title>" in html else die("标题")

# 公开仓库：页面上摆得出来的字里不许有说到她的话、哪天几点（碰上了停下来，照着改那一页）
texts = re.findall(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", html) + [re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S))]
bad = [t[:60] for t in texts if re.search(r"她|\d{1,2} ?月 ?\d{1,2} ?日|(?<![\d.])\d{1,2}:\d{2}(?![\d.])", t)]
if bad:
    sys.exit("写出来的页面里有不该进公开仓库的字（她说的话、称呼、日子钟点），先在那一页里改掉：\n  " + "\n  ".join(bad[:20]))

# ---------- 写 ----------
fdir = os.path.join(OUT, "files")
shutil.rmtree(fdir, ignore_errors=True)
os.makedirs(fdir)
for n, data in sorted(files.items()):
    open(os.path.join(fdir, n), "wb").write(data)
open(os.path.join(OUT, "desk.html"), "w", encoding="utf-8").write(html)
open(os.path.join(OUT, "wenkai-ui.chars.txt"), "w", encoding="utf-8").write("".join(chr(c) for c in got))
size = sum(len(v) for v in files.values())
print(f"写好了 {os.path.relpath(os.path.join(OUT, 'desk.html'), SOURCE)}（{len(html.encode('utf-8')) // 1024} KB）和 files/ 里 {len(files)} 样（{size / 1048576:.1f} MB）")
print(f"  页面上的字截了 {len(got)} 个" + (f"，霞鹜文楷里没有的：{''.join(chr(c) for c in missing if c > 0x2000)}" if any(c > 0x2000 for c in missing) else ""))
