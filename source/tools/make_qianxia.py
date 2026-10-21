# 把她拿来的《锦盒抽签》改成秘戏钱匣那一页：python3 tools/make_qianxia.py 她发来的锦盒抽签.html
# 写到 static/qianxia.html（打包时放进 assets/，名字带指纹；南衙 → 秘戏钱匣，一层全屏的框装着它，见 src/qx/QxPage.jsx、开发说明“秘戏钱匣”那节）。
#
# 她 10 月 21 日拿来的那一页是项目外的 Claude 做的（一个文件，两兆六：three.js r170 打在里面，图和铜钱声压成 base64）。
# 铜钱是她找的古钱拓片、恩师做成的图；铜钱声是 Kenney 的 RPG Audio、Vinrax 的 Coin Drop（都是 CC0，那一页开头写着）。
# 只改下面这几处，别的一个字不动；她那边再改了发新版来，拿新版重跑这个就行（哪一处对不上会停下来说是哪一处）。
#   1  安全规矩：不许用网络（只许它自己写在文件里的脚本、样式，和同一个目录里的刻本体）
#   2  卷轴上的字由开封府递进来：一个维度一竖行，右起；维度名朱色小字在上，签在下；刻本体（开封府递来的已经转成繁体）
#   3  长按卷轴上的一行：告诉开封府重抽这一样，换上新的那一行（发出去以后封上，不能再换）
#   4  “再抽一次”旁边多一颗“发给他”（字、摆不摆由开封府递进来）；点了告诉开封府，变成“已发”
#   5  脚本跑起来了、画好了、开抽、展开完、收回去了、出岔子了（WebGL 建不起来、图读不成、画出来以前就报错）、画好以后画布被收走了，
#      都告诉开封府（postMessage；这一页关在隔开的框里，每一句带着开封府给的暗号，见 src/qx/QxPage.jsx）
#   6  签库空着的时候点锦盒不开抽，告诉开封府（那一层打开签库）；提示那一行换成开封府递来的字
#   7  声音跟着静音键走：原来它把 iPhone 的声音路子设成 playback（静音也响），这里不设
#   8  闲着（没在抽、或者卷轴展开着没人动）一分钟以上，隔一帧画一帧，省电
#   9  整页不许捏（同并蒂莲、镜碎入月）
#  10  按钮躲开 iPhone 底下那一条：框里的 env(safe-area-inset-bottom) 是 0，开封府量好了递进来（--safe-b）
import os, re, sys

src = sys.argv[1] if len(sys.argv) > 1 else sys.exit("用法：python3 tools/make_qianxia.py 她发来的锦盒抽签.html")
HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(HERE, "..", "static", "qianxia.html")
s = open(src, encoding="utf-8").read()


def once(old, new, what):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit(f"对不上：{what}（找到 {n} 处，要正好 1 处）。她那一页改过这一块，照新的样子改这个脚本")
    s = s.replace(old, new)


# 1 安全规矩；刻本体的样式表（打包时把 __KFS_JINHUI__ 换成 assets/ 里带指纹的那一张，同一个目录）
NOTE = """<!-- 开封府：秘戏钱匣（tools/make_qianxia.py 从她 2026 年 10 月 21 日拿来的《锦盒抽签》生成的，别手改，改那个脚本重跑）。
     改了的几处都在那个脚本开头写着：不许用网络、卷轴上的字开封府递进来、长按一行重抽、“发给他”、开抽展开收回出岔子告诉开封府、
     签库空着不开抽、声音跟着静音键、闲着省电、整页不许捏、按钮躲开底下那一条。见 source/开发说明.md 的“秘戏钱匣”那节 -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src data:; base-uri 'none'; form-action 'none'">
<link rel="stylesheet" href="./__KFS_JINHUI__">"""
once("<title>锦盒抽签</title>", "<title>锦盒抽签</title>\n" + NOTE, "标题那一行")

# 2、4、10 样子
CSS = """
  /* 开封府：卷轴上的签。一个维度一竖行，右起；维度名朱色小字在上，签在下。字号照几行、最长那一行算（--qx-fs，纸宽的几分之几，见底下 fit） */
  #scroll-text {
    font-family: "KFS Jinhui", "Songti TC", "Songti SC", "STSong", "Noto Serif CJK TC", "Noto Serif CJK SC", serif;
    padding: calc(var(--ph, 300px) * .07) calc(var(--pw, 180px) * .07);
    font-size: calc(var(--pw, 180px) * var(--qx-fs, .12));
    line-height: 1.55; letter-spacing: .08em;
  }
  #qx-cols { text-align: start; }
  .qx-col + .qx-col { margin-block-start: .4em; }
  .qx-d { font-size: .64em; letter-spacing: .2em; color: #9a3b26; margin-inline-end: .5em; }
  .qx-t { color: #33241a; }
  .qx-col { transition: opacity .25s ease; }
  .qx-col.qx-roll, .qx-col.qx-in { opacity: .15; }
  body.qx-done #scroll-text .qx-col { pointer-events: auto; -webkit-touch-callout: none; }
  /* 开封府：“再抽一次”“发给他”并排，躲开 iPhone 底下那一条（--safe-b 开封府写进来） */
  #qx-acts {
    position: fixed; left: 0; right: 0; bottom: calc(5.5vh + var(--safe-b, env(safe-area-inset-bottom, 0px)));
    display: flex; justify-content: center; gap: 14px; pointer-events: none;
  }
  #qx-acts > #again, #qx-acts > #send { position: static; left: auto; bottom: auto; transform: translateY(8px); }
  #qx-acts > #again.show, #qx-acts > #send.show { transform: translateY(0); }
  #send {
    font: inherit; font-size: 14px; letter-spacing: .45em; padding: 10px 22px 10px calc(22px + .45em);
    color: #f7e6c6; background: rgba(40, 14, 6, .35); border: 1px solid rgba(247, 222, 180, .45);
    border-radius: 999px; cursor: pointer; opacity: 0; pointer-events: none;
    transition: opacity .6s ease, transform .6s ease, background .2s;
    -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  }
  #send.show { opacity: 1; pointer-events: auto; }
  #send.show:disabled { opacity: .5; cursor: default; }
</style>"""
once("</style>", CSS, "样式表的结尾")

# 2 卷轴上原来那五格（照抽到哪一枚显示，都空着）换成开封府递进来的那几行
once_pat = re.compile(r'  <div id="scroll-text">\n(?:    <div data-coin="\d"><!-- [^>]*--></div>\n){5}  </div>\n')
found = once_pat.findall(s)
if len(found) != 1:
    sys.exit(f"对不上：卷轴上那五格（找到 {len(found)} 处）")
s = once_pat.sub('  <div id="scroll-text"><div id="qx-cols"></div></div>\n', s, count=1)

# 4 “发给他”
once('  <button id="again" type="button">再抽一次</button>\n',
     '  <div id="qx-acts"><button id="again" type="button">再抽一次</button><button id="send" type="button">发给他</button></div>\n',
     "再抽一次那颗")

# 2、3、4、5、6、9 和开封府说话的那一段：放在它自己那一段脚本前头（它要是一开头就出岔子，后面的不会跑）
BRIDGE = r"""<script>
// 开封府：秘戏钱匣这一页和开封府说话（开封府那一层见 src/qx/QxPage.jsx）。这一页关在隔开的框里（sandbox，来路是 null）。
// 暗号：开封府放在框的名字里带进来，这里读完就清掉；说的每一句都带着它（框要是换成了别的网页，拿不到暗号，开封府不理）。
// 告诉开封府：hello 脚本跑起来了；ready 画好了；fail 出岔子了；lost 画好以后画布被收走了（开封府重建这个框）；
//             start 开抽（抽到第几枚）；done 卷轴展开完了；again 点了再抽一次；idle 收回去了；
//             reroll 长按了第几行；send 点了发给他；empty 签库空着还点了锦盒。
// 开封府递进来：setup（发给他那颗写什么、摆不摆，签库空没空、空着的时候提示写什么，状态栏和底下横条让开多高）；
//               lines 卷轴上那几行；line 重抽的那一行；sent 发出去了；unsent 没发成。
(function () {
  'use strict';
  var tk = '';
  try { tk = String(window.name || ''); window.name = ''; } catch (e) {}
  function tell(type, extra) {
    try {
      if (!window.parent || window.parent === window) return;
      var m = { qx: type, tk: tk };
      if (extra) for (var k in extra) m[k] = extra[k];
      window.parent.postMessage(m, '*');
    } catch (e) {}
  }
  var body = document.body, host = document.getElementById('scroll-text'), cols = document.getElementById('qx-cols');
  var again = document.getElementById('again'), send = document.getElementById('send'), hint = document.getElementById('hint');
  var gl = document.getElementById('gl');
  var lines = [], sendLabel = send.textContent, hintText = hint.textContent, failed = false, readied = false, sealed = false;

  // 出岔子：WebGL 建不起来、图读不成（这两处它自己那一段里补丁叫 __qxFail），还有画出来以前脚本就报错了、画布就被收走了。
  // 画出来以后零零碎碎的报错、声音那头没接住的 promise（iPhone 上声音放不出来常有）不算：锦盒照样能抽。
  // 画出来以后画布被收走（iPhone 切到后台、内存紧）：说 lost，开封府把框重建一回
  function fail() { if (!failed) { failed = true; tell('fail'); } }
  window.__qxFail = fail;
  window.addEventListener('error', function () { if (!readied) fail(); });
  gl.addEventListener('webglcontextlost', function () { if (readied) tell('lost'); else fail(); });
  new MutationObserver(function () {
    if (!readied && body.classList.contains('ready')) { readied = true; tell('ready'); }
  }).observe(body, { attributes: true, attributeFilter: ['class'] });

  // 卷轴上那几行：一行 { d: 维度名, t: 签 }。字号照几行、最长那一竖行（维度名连签）算，放得下
  function clean(l) { return { d: String((l && l.d) || ''), t: String((l && l.t) || '') }; }
  function len(s) { var n = 0; for (var ch of s) n += /[\u0000-ɏ]/.test(ch) ? 0.6 : 1; return n; }
  function fit() {
    var n = Math.max(1, lines.length), longest = 1;
    lines.forEach(function (l) {
      var col = 0.64 * 1.2 * len(l.d) + 0.5 + 1.08 * len(l.t);
      if (col > longest) longest = col;
    });
    var fs = Math.min(0.14, 0.86 / (1.95 * n - 0.4), 1.37 / (0.3 + longest));
    host.style.setProperty('--qx-fs', fs.toFixed(4));
  }
  function col(l, i) {
    var c = document.createElement('div'); c.className = 'qx-col'; c.dataset.i = String(i);
    var d = document.createElement('span'); d.className = 'qx-d'; d.textContent = l.d;
    var t = document.createElement('span'); t.className = 'qx-t'; t.textContent = l.t;
    c.appendChild(d); c.appendChild(t);
    return c;
  }
  function paint() {
    cols.textContent = '';
    lines.forEach(function (l, i) { cols.appendChild(col(l, i)); });
    fit();
  }

  // 锦盒那一头的几处（make_qianxia.py 打的补丁里叫这几个）
  window.__qxBlock = false;
  window.__qxStart = function (coin) {
    lines = []; paint(); sealed = false;
    body.classList.remove('qx-done');
    send.classList.remove('show'); send.disabled = false; send.textContent = sendLabel;
    tell('start', { coin: coin });
  };
  window.__qxDone = function () { body.classList.add('qx-done'); send.classList.add('show'); tell('done'); };
  window.__qxIdle = function () { lines = []; paint(); tell('idle'); };
  again.addEventListener('click', function () { body.classList.remove('qx-done'); send.classList.remove('show'); tell('again'); });
  send.addEventListener('click', function (e) {
    e.stopPropagation();
    if (send.disabled || !body.classList.contains('qx-done')) return;
    send.disabled = true;
    tell('send');
  });
  // 签库空着：点锦盒不开抽（Jo 里认 __qxBlock），告诉开封府
  gl.addEventListener('click', function () { if (window.__qxBlock) tell('empty'); }, true);

  // 长按卷轴上的一行：重抽这一样（同开封府别处的长按：一根手指按住不动 0.45 秒，挪开 8 个像素不算）。
  // 这一签发出去以后就封上了，不能再换（不然卷轴上跟聊天里的对不上）
  var press = null;
  function cancel() { if (press) { clearTimeout(press.timer); press = null; } }
  cols.addEventListener('pointerdown', function (e) {
    if (!e.isPrimary || sealed || !body.classList.contains('qx-done')) return;
    var c = e.target.closest && e.target.closest('.qx-col');
    if (!c) return;
    cancel();
    press = { x: e.clientX, y: e.clientY, timer: setTimeout(function () {
      press = null;
      if (sealed) return;
      c.classList.add('qx-roll');
      tell('reroll', { i: Number(c.dataset.i) });
    }, 450) };
  });
  cols.addEventListener('pointermove', function (e) { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancel(); });
  cols.addEventListener('pointerup', cancel);
  cols.addEventListener('pointercancel', cancel);
  cols.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var m = e.data || {};
    if (m.qx === 'setup') {
      if (typeof m.send === 'string' && m.send) { sendLabel = m.send; if (!send.disabled) send.textContent = sendLabel; }
      send.style.display = m.noSend ? 'none' : '';
      window.__qxBlock = !!m.empty;
      hint.textContent = m.empty && m.emptyHint ? String(m.emptyHint) : hintText;
      var root = document.documentElement.style;
      if (typeof m.safeB === 'number') root.setProperty('--safe-b', m.safeB + 'px');
      if (typeof m.safeT === 'number') root.setProperty('--safe-t', m.safeT + 'px');
    } else if (m.qx === 'lines' && Array.isArray(m.lines)) {
      lines = m.lines.map(clean); paint();
    } else if (m.qx === 'line' && typeof m.i === 'number' && lines[m.i]) {
      lines[m.i] = clean(m.line);
      var old = cols.children[m.i], c = col(lines[m.i], m.i);
      c.classList.add('qx-in');
      if (old) cols.replaceChild(c, old);
      fit();
      requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.remove('qx-in'); }); });
    } else if (m.qx === 'sent') {
      sealed = true; send.disabled = true; send.textContent = '已发';
    } else if (m.qx === 'unsent') {
      send.disabled = false; send.textContent = sendLabel;
    }
  });

  // 9 整页不许捏
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener('touchmove', function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  tell('hello');
})();
</script>
<script>
(()=>{var no="170";"""
once('<script>\n(()=>{var no="170";', BRIDGE, "它那一段脚本的开头")

# 7 声音跟着静音键走（原来设成 playback，静音也响）
once('try{navigator.audioSession&&navigator.audioSession.type!=="playback"&&(navigator.audioSession.type="playback")}catch{}',
     'try{/* 开封府：不改声音路子，跟着静音键走 */}catch{}', "声音路子那一句")

# 5、6 开抽：签库空着不开抽；开了告诉开封府抽到第几枚
once('function Jo(){yt==="idle"&&(', 'function Jo(){yt==="idle"&&!window.__qxBlock&&(', "开抽那一句的开头")
once('document.body.dataset.coin=String(Sr+1),', 'document.body.dataset.coin=String(Sr+1),window.__qxStart&&window.__qxStart(Sr+1),', "抽到第几枚")
# 5 卷轴展开完（“再抽一次”冒出来的那一下）、收回去了
once('{t:L.done,fn:()=>bo.classList.add("show")}', '{t:L.done,fn:()=>{bo.classList.add("show"),window.__qxDone&&window.__qxDone()}}', "展开完那一下")
once('yt="idle",Co=performance.now()/1e3,qo.classList.remove("gone"))', 'yt="idle",Co=performance.now()/1e3,qo.classList.remove("gone"),window.__qxIdle&&window.__qxIdle())', "收回去了那一下")
# 5 出岔子：WebGL 建不起来、读图读不成
once('catch(A){throw dA("nogl").style.display="flex",A}', 'catch(A){throw dA("nogl").style.display="flex",window.__qxFail&&window.__qxFail(),A}', "WebGL 建不起来")
once('oj().catch(A=>{console.error(A),dA("nogl").style.display="flex"})', 'oj().catch(A=>{console.error(A),dA("nogl").style.display="flex",window.__qxFail&&window.__qxFail()})', "读图读不成")

# 8 闲着（没在抽、或者卷轴展开着）一分钟以上，隔一帧画一帧（手指一落下就算动过；抽着、收着的时候照常每帧画）
once('var vo=null,Ro=null;function kj(A){let e=A/1e3;',
     'var vo=null,Ro=null,qxAct=performance.now(),qxSkip=!1;addEventListener("pointerdown",()=>{qxAct=performance.now()},{passive:!0,capture:!0});'
     'function kj(A){if((yt==="idle"||yt==="done")&&A-qxAct>6e4&&(qxSkip=!qxSkip))return;let e=A/1e3;', "每一帧的开头")

open(out, "w", encoding="utf-8").write(s)
print(f"写好了 {os.path.normpath(out)}（{len(s.encode('utf-8')) // 1024} KB）")
