# 生成黑夜主题的聊天背景（蓝黑星海）：python3 tools/make_heiye.py [时间] [辉光]
#
# 照并蒂莲那一页（static/lotus.html）的天空画：同一个星云着色器（FS_SKY）、同一套噪声纹理和星点（种子都一样），
# 配色用它的“雾蓝”（mist）。先在低清的缓冲里画星云（照它的规矩，高大约 380），放大铺满，加一点胶片颗粒，
# 再按三倍屏画星点。画的是 1179×2556（她的手机 393×852 的三倍），存成 static/wall-heiye.webp。
# 要 Playwright 和机器上的 Chrome（没有显卡就用 SwiftShader 软着画，慢一点）。
#
# 时间（默认 37）：星云流到哪儿，换个数就是另一片云；辉光（默认 0.28）：画面中下那一团淡淡的光，0 就没有。
# 生成以后打印最底下一行的平均颜色：input.css 里黑夜的 --k-base、theme.js 里黑夜的 meta 照它写，接缝才看不出来。
import base64, io, json, os, sys, tempfile
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..")
T = float(sys.argv[1]) if len(sys.argv) > 1 else 37.0
HAZE = float(sys.argv[2]) if len(sys.argv) > 2 else 0.28
W, H, DPR = 1179, 2556, 3.0

# 从 lotus.html 里原样取出三段着色器，不另抄一份（它改了，这里跟着变）
lotus = open(os.path.join(SRC, "static", "lotus.html"), encoding="utf-8").read()
def grab(name):
    i = lotus.index(f"const {name} = `")
    j = lotus.index("`;", i)
    return lotus[i + len(f"const {name} = `"):j]
FS_SKY, FS_BLIT, VS_STAR, FS_PARTICLE, VS_QUAD = (grab(n) for n in ("FS_SKY", "FS_BLIT", "VS_STAR", "FS_PARTICLE", "VS_QUAD"))

PAGE = """<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="%(W)d" height="%(H)d"></canvas>
<script>
const W = %(W)d, H = %(H)d, DPR = %(DPR)f, T = %(T)f, HAZE = %(HAZE)f;
const SH = %(SH)s;
function makeRng(seed) { let s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
const c = document.getElementById('c');
const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
function prog(vs, fs, attrs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const U = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); U[u.name] = gl.getUniformLocation(p, u.name); }
  return { p, U };
}
const sky = prog(SH.VS_QUAD, SH.FS_SKY, ['aP']);
const blit = prog(SH.VS_QUAD, SH.FS_BLIT, ['aP']);
const star = prog(SH.VS_STAR, SH.FS_PARTICLE, ['aStar', 'aTint']);
// 噪声纹理：同 lotus.html（种子 4242）
const nr = makeRng(4242), px = new Uint8Array(256 * 256 * 4);
for (let i = 0; i < px.length; i++) px[i] = (nr() * 255) | 0;
const noise = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, noise);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
// 低清缓冲：同 lotus.html 的 resize()（高大约 380）
const k = Math.max(2, Math.round(H / 380)), lw = Math.ceil(W / k), lh = Math.ceil(H / k);
const lowTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, lowTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lw, lh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const fbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lowTex, 0);
const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
// 雾蓝（PALETTES[0]）
const neb = ['#0e1a36', '#19163a', '#0a232d'].map(hex), haze = hex('#22386a');
// (1) 星云画进低清缓冲
gl.viewport(0, 0, lw, lh);
gl.useProgram(sky.p);
gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noise);
gl.uniform1i(sky.U.uNoise, 0);
gl.uniform1f(sky.U.uTime, T * 0.014);
gl.uniform1f(sky.U.uAspect, W / H);
gl.uniform2f(sky.U.uOff, 0.0, 0.0);
gl.uniform3fv(sky.U.uColA, neb[0]); gl.uniform3fv(sky.U.uColB, neb[1]); gl.uniform3fv(sky.U.uColC, neb[2]);
gl.uniform4f(sky.U.uHaze, 0.5, 0.40, 0.62, HAZE);
gl.uniform3fv(sky.U.uHazeCol, haze);
gl.uniform1f(sky.U.uAmt, 0.85);
gl.uniform2f(sky.U.uJit, 0.37, 0.61);
gl.drawArrays(gl.TRIANGLES, 0, 3);
// (2) 放大铺满，加颗粒
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, W, H);
gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
gl.useProgram(blit.p);
gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lowTex);
gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, noise);
gl.uniform1i(blit.U.uTex, 0); gl.uniform1i(blit.U.uNoise, 1);
gl.uniform2f(blit.U.uJit, 0.13, 0.71); gl.uniform1f(blit.U.uGrain, 2.2 / 255);
gl.drawArrays(gl.TRIANGLES, 0, 3);
// (3) 星点：同 lotus.html（种子 77、560 颗），按三倍屏的大小画
const r = makeRng(77), N = 560;
const st = new Float32Array(N * 4), tint = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  const big = r() < 0.08;
  st[i * 4] = r(); st[i * 4 + 1] = r(); st[i * 4 + 2] = 0.55 + r() * 0.9; st[i * 4 + 3] = big ? 4.2 + r() * 2.2 : 2.2 + r() * 1.6;
  const warm = r() < 0.18, kk = (big ? 0.75 : 0.28) + r() * 0.3;
  tint[i * 4] = kk * (warm ? 1.0 : 0.80); tint[i * 4 + 1] = kk * (warm ? 0.92 : 0.88); tint[i * 4 + 2] = kk * (warm ? 0.80 : 1.0); tint[i * 4 + 3] = r();
}
const bS = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bS); gl.bufferData(gl.ARRAY_BUFFER, st, gl.STATIC_DRAW);
const bT = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bT); gl.bufferData(gl.ARRAY_BUFFER, tint, gl.STATIC_DRAW);
gl.useProgram(star.p);
gl.bindBuffer(gl.ARRAY_BUFFER, bS); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, bT); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noise);
gl.uniform1i(star.U.uNoise, 0);
gl.uniform2f(star.U.uOff, 0, 0); gl.uniform1f(star.U.uAspect, W / H); gl.uniform1f(star.U.uTime, T);
gl.uniform1f(star.U.uDpr, DPR); gl.uniform1f(star.U.uAmt, 0.8); gl.uniform1f(star.U.uSoft, 0.0); gl.uniform2f(star.U.uJit, 0, 0);
gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
gl.drawArrays(gl.POINTS, 0, N);
window.__done = c.toDataURL('image/png');
</script></body></html>"""

html = PAGE % {"W": W, "H": H, "DPR": DPR, "T": T, "HAZE": HAZE,
               "SH": json.dumps({"FS_SKY": FS_SKY, "FS_BLIT": FS_BLIT, "VS_STAR": VS_STAR, "FS_PARTICLE": FS_PARTICLE, "VS_QUAD": VS_QUAD})}
tmp = tempfile.mkdtemp()
page_path = os.path.join(tmp, "sky.html")
open(page_path, "w", encoding="utf-8").write(html)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 400, "height": 400})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + page_path)
    pg.wait_for_function("() => !!window.__done", timeout=120000)
    data = pg.evaluate("window.__done")
    b.close()
if errs:
    sys.exit("出错：" + "; ".join(errs))
im = Image.open(io.BytesIO(base64.b64decode(data.split(",", 1)[1]))).convert("RGB")
out = os.path.join(SRC, "static", "wall-heiye.webp")
im.save(out, "WEBP", quality=90, method=6)
bottom = im.crop((0, H - 4, W, H)).resize((1, 1), Image.BOX).getpixel((0, 0))
print(f"写好了 {out}（{os.path.getsize(out) // 1024} KB）；最底下一行平均 rgb{bottom} = #{bottom[0]:02X}{bottom[1]:02X}{bottom[2]:02X}")
