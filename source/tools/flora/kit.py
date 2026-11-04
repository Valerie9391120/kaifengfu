# 共用的：清场、渲染设置、光、相机、月白瓶、网格小工具、材质小工具
import bpy, math, os
import numpy as np

# ---------------- 场景 ----------------
def reset(samples=128, res=(700, 1200)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.use_denoising = True
    cy.denoiser = 'OPENIMAGEDENOISE'
    cy.max_bounces = 8; cy.diffuse_bounces = 3; cy.glossy_bounces = 3
    cy.transmission_bounces = 6; cy.transparent_max_bounces = 8
    cy.caustics_reflective = False; cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'AgX'
    return sc


def world(color=(0.78, 0.67, 0.53), strength=0.55):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*color, 1); bg.inputs[1].default_value = strength


def aim(ob, target):
    from mathutils import Vector
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def area(name, loc, target, energy, size, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    ob = bpy.data.objects.new(name, l); bpy.context.scene.collection.objects.link(ob)
    ob.location = loc; aim(ob, target)
    ob.visible_camera = False   # 灯本身不入画（不然右上角会落一个点）
    return ob


def lights(target=(0, 0, 3.0), key=1.0):
    # 光照着恩师那张画来：左前上方一盏大的暖光，右边淡淡补一点，背后一盏勾边
    area('key', (-6.5, -7.0, 8.5), target, 2300 * key, 8.0, (1.0, 0.94, 0.86))
    area('fill', (7.5, -6.0, 3.5), target, 800 * key, 8.0, (1.0, 0.97, 0.93))
    area('rim', (2.5, 7.0, 7.5), target, 1200 * key, 4.0, (1.0, 0.96, 0.9))


def camera(target=(0, 0, 3.0), dist=26.0, height=3.0, frame_h=7.0, aspect_h=True):
    sc = bpy.context.scene
    c = bpy.data.cameras.new('cam'); c.sensor_fit = 'VERTICAL'; c.sensor_height = 24.0
    c.lens = 24.0 * dist / frame_h
    ob = bpy.data.objects.new('cam', c); sc.collection.objects.link(ob); sc.camera = ob
    ob.location = (target[0], -dist, height); aim(ob, target)
    return ob


def shadow_floor(z=0.0, x=(-30, 30), y=(-30, 30)):
    me = bpy.data.meshes.new('floor')
    me.from_pydata([(x[0], y[0], z), (x[1], y[0], z), (x[1], y[1], z), (x[0], y[1], z)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new('floor', me); bpy.context.scene.collection.objects.link(ob)
    ob.is_shadow_catcher = True
    return ob


def render(path):
    import time
    sc = bpy.context.scene
    sc.render.filepath = path
    t = time.time(); bpy.ops.render.render(write_still=True)
    print('render', path, round(time.time() - t, 1), 's')


# ---------------- 网格小工具 ----------------
def grid_quads(nv, nu, off=0):
    i, j = np.meshgrid(np.arange(nv - 1), np.arange(nu - 1), indexing='ij')
    a = i * nu + j
    return np.stack([a, a + 1, a + nu + 1, a + nu], -1).reshape(-1, 4) + off


def norm(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)


def rot(axis, ang):
    a = norm(axis); x, y, z = a; c, s = math.cos(ang), math.sin(ang); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def frame_from(d, up=(0, 0, 1)):
    """以 d 为 +Z（主方向）造一个正交基：返回 3x3，列是 x、y、z。"""
    d = norm(d); up = np.asarray(up, float)
    if abs(np.dot(d, norm(up))) > 0.98: up = np.array([0.0, 1.0, 0.0]) if abs(d[1]) < 0.9 else np.array([1.0, 0, 0])
    x = norm(np.cross(up, d)); y = np.cross(d, x)
    return np.stack([x, y, d], 1)


def tube(P, R, sides=8, cap=True, v0=0.0, v1=1.0, twist_up=None):
    """沿一串点 P 拉一根管子，半径 R（每个点一个）。返回 V, quads, tris, UV。"""
    P = np.asarray(P, float); n = len(P); R = np.broadcast_to(np.asarray(R, float), (n,))
    if SEC is not None and P[0, 2] > 0.5 and where(P[:1])[0] == 1: TUBES.append((P.copy(), np.array(R), _who()))   # 局部坐标里先建的小零件（花丝之类）不算
    T = np.gradient(P, axis=0); T = norm(T)
    up = np.array([0, 0, 1.0]) if twist_up is None else np.asarray(twist_up, float)
    if abs(np.dot(T[0], up)) > 0.95: up = np.array([1.0, 0, 0])
    N = np.zeros_like(P); N[0] = norm(np.cross(T[0], up))
    for i in range(1, n):
        v = N[i - 1] - np.dot(N[i - 1], T[i]) * T[i]
        N[i] = norm(v) if np.linalg.norm(v) > 1e-9 else N[i - 1]
    B = np.cross(T, N)
    ph = np.linspace(0, 2 * np.pi, sides + 1)
    cs, sn = np.cos(ph), np.sin(ph)
    V = P[:, None, :] + R[:, None, None] * (cs[None, :, None] * N[:, None, :] + sn[None, :, None] * B[:, None, :])
    V = V.reshape(-1, 3)
    nu = sides + 1
    Q = grid_quads(n, nu)
    U, W = np.meshgrid(np.linspace(0, 1, nu), np.linspace(v0, v1, n))
    UV = np.stack([U, W], -1).reshape(-1, 2)
    Tr = np.zeros((0, 3), int)
    if cap:
        c = len(V); V = np.vstack([V, P[-1]]); UV = np.vstack([UV, [0.5, v1]])
        last = (n - 1) * nu + np.arange(sides)
        Tr = np.stack([last, last + 1, np.full(sides, c)], -1)
    return V, Q, Tr, UV


def ellipsoid(c, axes, R=np.eye(3), nu=10, nv=7):
    """一个小椭球（花药、花苞用）。axes=(a,b,c) 沿局部 x,y,z。"""
    th = np.linspace(0, np.pi, nv); ph = np.linspace(0, 2 * np.pi, nu + 1)
    T, Pp = np.meshgrid(th, ph, indexing='ij')
    x = np.sin(T) * np.cos(Pp) * axes[0]; y = np.sin(T) * np.sin(Pp) * axes[1]; z = np.cos(T) * axes[2]
    V = np.stack([x, y, z], -1).reshape(-1, 3) @ np.asarray(R).T + np.asarray(c)
    Q = grid_quads(nv, nu + 1)
    UV = np.stack([Pp / (2 * np.pi), 1 - T / np.pi], -1).reshape(-1, 2)
    return V, Q, np.zeros((0, 3), int), UV


class MB:
    """攒网格：一样材质的零件攒到一起，最后一次建成一个物体。"""
    def __init__(self):
        self.V, self.Q, self.T, self.UV = [], [], [], []
        self.A = {}
        self.n = 0

    def add(self, V, Q, T, UV, **attrs):
        V = np.asarray(V, float)
        k = len(V)
        self.V.append(V); self.UV.append(np.asarray(UV, float))
        if len(Q): self.Q.append(np.asarray(Q, int) + self.n)
        if len(T): self.T.append(np.asarray(T, int) + self.n)
        for name, val in attrs.items():
            self.A.setdefault(name, []).append(np.broadcast_to(np.asarray(val, float), (k,)).copy())
        # 没给的属性补 0
        for name in self.A:
            if name not in attrs: self.A[name].append(np.zeros(k))
        self.n += k

    def build(self, name, mat=None, smooth=True):
        if not self.V: return None
        V = np.concatenate(self.V)
        Q = np.concatenate(self.Q) if self.Q else np.zeros((0, 4), int)
        T = np.concatenate(self.T) if self.T else np.zeros((0, 3), int)
        me = bpy.data.meshes.new(name)
        me.from_pydata(V.tolist(), [], Q.tolist() + T.tolist())
        uv = me.uv_layers.new(name='UVMap')
        loopv = np.concatenate([Q.ravel(), T.ravel()]).astype(int)
        UV = np.concatenate(self.UV)
        uv.data.foreach_set('uv', UV[loopv].astype(np.float32).ravel())
        for k, arrs in self.A.items():
            a = me.attributes.new(k, 'FLOAT', 'POINT')
            a.data.foreach_set('value', np.concatenate(arrs).astype(np.float32))
        if smooth: me.shade_smooth()
        me.update()
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        if mat is not None: me.materials.append(mat)
        return ob


def place(V, R=np.eye(3), t=(0, 0, 0)):
    return np.asarray(V) @ np.asarray(R).T + np.asarray(t)


# ---------------- 材质小工具 ----------------
def srgb(r, g, b):
    def f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b))


def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, nt, out


def ramp(nt, stops, interp='LINEAR'):
    r = nt.nodes.new('ShaderNodeValToRGB'); cr = r.color_ramp; cr.interpolation = interp
    els = cr.elements
    els[0].position = stops[0][0]; els[0].color = (*stops[0][1], 1)
    els[1].position = stops[-1][0]; els[1].color = (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        e = els.new(p); e.color = (*c, 1)
    return r


def uv_xy(nt):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['UV'], sep.inputs[0])
    return tc, sep


def attr(nt, name):
    a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = name; a.attribute_type = 'GEOMETRY'
    return a


def math_node(nt, op, a=None, b=None):
    m = nt.nodes.new('ShaderNodeMath'); m.operation = op
    for i, v in enumerate((a, b)):
        if v is None: continue
        if isinstance(v, (int, float)): m.inputs[i].default_value = v
        else: nt.links.new(v, m.inputs[i])
    return m


def mix_rgb(nt, fac, a, b, blend='MIX'):
    m = nt.nodes.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.blend_type = blend
    for sock, v in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
        if isinstance(v, (int, float)): sock.default_value = v
        elif isinstance(v, tuple): sock.default_value = (*v, 1) if len(v) == 3 else v
        else: nt.links.new(v, sock)
    return m.outputs[2]


def hsv(nt, color, h=0.5, s=1.0, v=1.0):
    n = nt.nodes.new('ShaderNodeHueSaturation')
    for sock, val in ((n.inputs['Hue'], h), (n.inputs['Saturation'], s), (n.inputs['Value'], v)):
        if isinstance(val, (int, float)): sock.default_value = val
        else: nt.links.new(val, sock)
    nt.links.new(color, n.inputs['Color'])
    return n.outputs[0]


def thin_surface(nt, out, base, trans_color, trans=0.3, rough=0.5, sheen=0.0, normal=None, spec=0.5):
    """薄片（花瓣、叶子）：漫反射 + 透光。"""
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(base, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in p.inputs: p.inputs['Specular IOR Level'].default_value = spec
    if sheen:
        p.inputs['Sheen Weight'].default_value = sheen
        p.inputs['Sheen Roughness'].default_value = 0.4
    tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
    nt.links.new(trans_color, tr.inputs['Color'])
    if normal is not None:
        nt.links.new(normal, p.inputs['Normal']); nt.links.new(normal, tr.inputs['Normal'])
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = trans
    nt.links.new(p.outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    return p


def noise_bump(nt, scale=30.0, strength=0.2, detail=4.0, vec=None, distance=0.02):
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = detail
    if vec is not None: nt.links.new(vec, nz.inputs['Vector'])
    b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = strength
    b.inputs['Distance'].default_value = distance
    nt.links.new(nz.outputs['Fac'], b.inputs['Height'])
    return b.outputs['Normal']


# ---------------- 月白瓶 ----------------
VASE_S = 1.1
VASE_PROF = [(0.42, 0.0), (0.45, 0.05), (0.55, 0.35), (0.62, 0.7), (0.55, 1.05), (0.3, 1.35),
             (0.18, 1.6), (0.16, 1.8), (0.22, 1.95), (0.24, 2.0)]
MOUTH_Z = 2.0 * VASE_S
MOUTH_R = 0.24 * VASE_S


def vase_mat():
    m, nt, out = new_mat('yuebai')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = (0.74, 0.83, 0.9, 1)   # 月白
    p.inputs['Roughness'].default_value = 0.12
    p.inputs['Coat Weight'].default_value = 1.0
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    return m


def vase(N=96):
    import bmesh
    S = VASE_S
    me = bpy.data.meshes.new('vase'); bm = bmesh.new()
    rings = []
    for (r, z) in VASE_PROF:
        rings.append([bm.verts.new((S * r * math.cos(2 * math.pi * i / N), S * r * math.sin(2 * math.pi * i / N), S * z)) for i in range(N)])
    c = bm.verts.new((0, 0, 0))
    for i in range(N): bm.faces.new((c, rings[0][(i + 1) % N], rings[0][i]))
    for a, b in zip(rings, rings[1:]):
        for i in range(N): bm.faces.new((a[i], a[(i + 1) % N], b[(i + 1) % N], b[i]))
    bm.normal_update(); bm.to_mesh(me); bm.free()
    me.shade_smooth()
    ob = bpy.data.objects.new('vase', me); bpy.context.scene.collection.objects.link(ob)
    so = ob.modifiers.new('wall', 'SOLIDIFY'); so.thickness = 0.04; so.offset = -1.0
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    me.materials.append(vase_mat())
    measure_vase(ob)
    return ob


# ---------------- 瓶口：枝梗得从瓶口正经出来 ----------------
# 瓶壁的纵剖面（ρ=到瓶轴的距离, z）：vase() 建好以后，从细分、加厚过的网格上沿一条经线量出来。
# 外壁从瓶底往上走到口沿顶，内壁从口沿顶往下走到瓶里底。花枝离瓶壁多远、有没有戳穿，都照这个算。
SEC = None      # 剖面一圈 (m, 2)
LIP = None      # 口沿顶的 z
_OUT = None     # 外壁 (k, 2)，z 递增
_INN = None     # 内壁 (k, 2)，z 递增
TUBES = []      # 从瓶里起头的管子（中线、半径、谁建的），查穿模用
NOTES = []      # neck() 改了哪几根、怎么改的


def measure_vase(ob):
    global SEC, LIP, _OUT, _INN
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg); me = ev.to_mesh()
    V = np.array([v.co[:] for v in me.vertices]); E = np.array([e.vertices[:] for e in me.edges])
    ev.to_mesh_clear()
    on = (np.abs(V[:, 1]) < 1e-5) & (V[:, 0] > -1e-6)
    adj = {}
    for a, b in E[on[E[:, 0]] & on[E[:, 1]]]:
        adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    ends = [k for k, v in adj.items() if len(v) == 1]
    order = [min(ends, key=lambda k: V[k, 2])]; prev = -1
    while True:
        nx = [n for n in adj[order[-1]] if n != prev]
        if not nx: break
        prev = order[-1]; order.append(nx[0])
    P = V[order][:, [0, 2]]
    top = int(np.argmax(P[:, 1]))
    SEC, LIP = P, float(P[top, 1])
    _OUT, _INN = P[:top + 1], P[top:][::-1]
    EXITS.clear(); TUBES.clear(); NOTES.clear(); STEMS.clear()


def outer_r(z): return np.interp(z, _OUT[:, 1], _OUT[:, 0], right=0.0)
def inner_r(z): return np.interp(z, _INN[:, 1], _INN[:, 0], left=0.0, right=0.0)


def _rz(P):
    P = np.atleast_2d(np.asarray(P, float))
    return np.hypot(P[:, 0], P[:, 1]), P[:, 2]


def where(P):
    """每个点在哪：0 瓶外，1 瓶里（口沿以下、内壁以内），2 瓷里头（瓶壁里）。"""
    r, z = _rz(P)
    solid = (z <= LIP) & (r <= outer_r(z)) & ((r >= inner_r(z)) | (z < _INN[0, 1]))
    cav = (z < LIP) & (r < inner_r(z)) & (z >= _INN[0, 1]) & ~solid
    return np.where(solid, 2, np.where(cav, 1, 0))


def clearance(P):
    """每个点离瓷面多远（在瓷里头算负的）。"""
    r, z = _rz(P)
    Q = np.stack([r, z], -1); A = SEC[:-1]; B = SEC[1:]
    AB = B - A; t = np.clip(((Q[:, None] - A[None]) * AB[None]).sum(2) / np.maximum((AB ** 2).sum(1), 1e-12), 0, 1)
    d = np.sqrt(((Q[:, None] - (A[None] + t[..., None] * AB[None])) ** 2).sum(2)).min(1)
    return np.where(where(P) == 2, -d, d)


def _who():
    import sys
    f = sys._getframe(2); out = []
    while f is not None and len(out) < 3:
        nm = f.f_code.co_name; mod = f.f_globals.get('__name__', '?')
        if nm not in ('<module>',): out.append(f"{mod}.{nm}:{f.f_lineno}")
        f = f.f_back
    return ' ← '.join(out)


# 一根枝从瓶里出来该怎么走：瓶里顺着瓶颈下去（看不见），从口沿里面出来，再顺顺地接上原来露在外面的那截。
GAP = 0.008     # 离瓷面至少留这么一丝
EXITS = []      # 这一瓶里已经占了的出口（口沿平面上的位置、半径），后来的枝从旁边出，不挤在一处
STEMS = []      # 这一瓶里已经插好的、从瓶里起头的枝梗（中线、半径）：后来的出瓶那段别和它们穿在一起


def _bez(p0, p1, p2, p3, n):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def arclen(P):
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])


def _resample(P, m):
    s = arclen(P); t = np.linspace(0, s[-1], m)
    return np.stack([np.interp(t, s, P[:, k]) for k in range(3)], -1)


def _ang(a, b):
    return math.acos(float(np.clip(np.dot(norm(a), norm(b)), -1, 1)))


def _bend(P):
    """一条线一共拐了多少（弧度）、最急的地方曲率多大。"""
    d = np.diff(P, axis=0); ds = np.linalg.norm(d, axis=1); d = d / np.maximum(ds[:, None], 1e-12)
    a = np.arccos(np.clip((d[1:] * d[:-1]).sum(1), -1, 1))
    k = a / np.maximum(0.5 * (ds[1:] + ds[:-1]), 1e-9)
    return float(a.sum()), float(k.max()) if len(k) else 0.0


def _ok_path(P, R, gap):
    """整根都不碰瓷，而且是从瓶口出来的（瓶里的点后头紧跟着瓶外口沿以下的点，就是从瓶身上穿出去的）。"""
    if (clearance(P) - R < gap).any(): return False
    w = where(P)
    for a, b, zb in zip(w[:-1], w[1:], P[1:, 2]):
        if a == 1 and b == 0 and zb < LIP: return False
    return True


def _exit_spot(ex, r, rmax):
    """出口别和前头几根挤在一处：挨得太近就推开一点，再收回口沿里面。"""
    ex = np.array(ex, float)
    for _ in range(30):
        moved = False
        for (e2, r2) in EXITS:
            d = ex - e2; L = np.linalg.norm(d); need = r + r2 + 0.006
            if L < need:
                ex = ex + (d / L if L > 1e-6 else np.array([0.0, 1.0])) * (need - L) * 0.6; moved = True
        L = np.linalg.norm(ex)
        if L > rmax: ex *= rmax / L
        if not moved: break
    return ex


def _inside(E, D, r, length, gap, ds=0.02):
    """从出口往瓶里走：先顺着出瓶的方向，快碰壁了就往下、往瓶轴那边拐。"""
    pts = [np.array(E, float)]; d = -norm(D); acc = 0.0
    down = np.array([0.0, 0.0, -1.0])
    while acc < length:
        q = None
        for _ in range(60):
            c = pts[-1] + d * ds
            if where(c[None])[0] == 1 and clearance(c[None])[0] >= r + gap: q = c; break
            h = np.array([c[0], c[1], 0.0]); L = np.linalg.norm(h)
            want = norm(down - 0.9 * h / L) if L > 1e-6 else down
            d = norm(d + 0.2 * want)
        if q is None: break
        pts.append(q); acc += ds
        if q[2] < 0.3: break
    return np.array(pts)


def _apart(P, R):
    """这一根在瓶口上头那段，离已经插好的那几根最近还隔多少（负的就是穿在一起了）。"""
    m = P[:, 2] > LIP - 0.01
    if not m.any() or not STEMS: return 1.0
    A = P[m]; RA = np.asarray(R)[m]; best = 1.0
    for (S, RS) in STEMS:
        k = S[:, 2] > LIP - 0.01
        if not k.any(): continue
        d = np.linalg.norm(A[:, None] - S[k][None], axis=2) - RA[:, None] - RS[k][None]
        best = min(best, float(d.min()))
    return best


class Neck:
    """neck() 的结果：P 是新的中线；按长度比例 s_clear 往后才算出了瓶。
    ok(s)：沿枝 s 处挂叶子、刺行不行——出瓶以前的就不挂了（插花本来就把瓶口以下的叶子摘掉）；
    不挂的那片照样用 SINK 建一遍（随机数照旧往下走，别的叶子、花一点不变），只是不进画。
    up(s)：花、苞这类挪到出瓶以后；spread(一串 s)：一串花整串往出瓶以后匀一匀。"""
    def __init__(self, P, s_clear=0.0, note=''):
        self.P, self.s_clear, self.note = P, float(s_clear), note

    def ok(self, s):
        return s >= self.s_clear

    def up(self, s):
        return max(float(s), self.s_clear + 0.02) if self.s_clear > 0 else float(s)

    def spread(self, ss):
        ss = np.asarray(ss, float); c = self.s_clear + 0.02
        if self.s_clear <= 0 or ss.min() >= c: return ss
        lo, hi = ss.min(), ss.max()
        if hi <= c: return np.full_like(ss, c)
        return c + (ss - lo) * (hi - c) / max(hi - lo, 1e-9)


class _Sink(dict):
    """什么都收、什么都不留的“园子”：G['leaf'].add(...) 照样调，东西扔了。"""
    def __getitem__(self, k): return self
    def add(self, *a, **k): pass


SINK = _Sink()


def _s_clear(P, R, m=0.1):
    """沿着枝，从哪儿往后才算出了瓶、离口沿也够远（挂叶子不至于碰着瓶）。"""
    far = np.linalg.norm(P - np.array([0, 0, LIP]), axis=1) > 0.6
    ok = ((P[:, 2] >= LIP + m) | far) & (clearance(P) - R >= 0.02) & (where(P) == 0)
    tail = np.flip(np.cumprod(np.flip(ok))).astype(bool)
    i = int(np.argmax(tail)) if tail.any() else len(P) - 1
    s = arclen(P); return s[i] / max(s[-1], 1e-9)


def neck(P, R, gap=GAP, woody=False):
    """一根从瓶里起头的枝/梗（第一个点在瓶里）：要是穿了瓶壁、压着口沿，就把瓶里那截重新走线——
    瓶里顺着瓶颈下去，从口沿里面出来，再顺顺地接上原来露在外面的那截（接头往后一点不动，点数、长短都不变，
    沿枝按位置挂的叶子、花还在原地方）。接在哪儿：挑出瓶以后拐得最缓的那个接法；
    woody=True（老枝、木本的枝）多留原来的样子（之字折），宁可接得早些。
    原来那截压根没从瓶口上头过的（贴着瓶身横出去的），整根往上提，提到能从瓶口顺顺出来为止。返回 Neck。"""
    P = np.asarray(P, float).copy(); n = len(P)
    R = np.broadcast_to(np.asarray(R, float), (n,)).astype(float)
    if SEC is None or n < 4 or P[0, 2] < 0.5 or where(P[:1])[0] != 1 or os.environ.get('KIT_NO_NECK'):
        return Neck(P)
    if _ok_path(P, R, gap) and _apart(P, R) >= 0:
        STEMS.append((P, R)); return Neck(P, _s_clear(P, R))
    s_old = arclen(P)
    r = float(R[:max(2, n // 2)].max())
    M = np.array([0.0, 0.0, LIP])
    rmax = float(inner_r(LIP - 0.025)) - r - gap
    cap = math.radians(55)
    wlen = 0.8 if woody else 0.12
    for lift in np.arange(0.0, 1.21, 0.06):
        Q = P + np.array([0.0, 0.0, lift])
        far = np.linalg.norm(Q - M, axis=1) > 0.6
        ok = (clearance(Q) - R >= gap) & (where(Q) == 0) & ((Q[:, 2] >= LIP + 0.1) | far)
        tail = np.flip(np.cumprod(np.flip(ok))).astype(bool)
        best = None
        for j in range(1, n):
            if not tail[j] or Q[j, 2] < LIP + 0.12: continue
            Pj = Q[j]; Tj = norm(Q[min(j + 1, n - 1)] - Q[j - 1])
            h = Pj[:2]
            if np.linalg.norm(h) > 0.03: u = h / np.linalg.norm(h)
            elif np.linalg.norm(Tj[:2]) > 1e-3: u = Tj[:2] / np.linalg.norm(Tj[:2])
            else: u = np.array([1.0, 0.0])
            ch = Pj - M; thc = math.atan2(np.linalg.norm(ch[:2]), ch[2])
            tht = math.atan2(np.linalg.norm(Tj[:2]), Tj[2])
            o = P[0, :2]; op = o - np.dot(o, u) * u
            for th in {round(min(max(t, 0.0), cap), 3) for t in (tht, thc, 0.5 * (tht + thc), 0.75 * thc, 0.6 * tht, 1.15 * thc)}:
                D = np.array([u[0] * math.sin(th), u[1] * math.sin(th), math.cos(th)])
                ex = _exit_spot(u * rmax * float(np.clip(th / cap, 0.15, 0.95)) + op * 0.8, r, rmax)
                E = np.array([ex[0], ex[1], LIP])
                L = np.linalg.norm(Pj - E)
                B = _bez(E, E + D * L * 0.4, Pj - Tj * L * 0.4, Pj, max(10, int(L / 0.015)))
                if (clearance(B) - r < gap).any(): continue
                tot, kmax = _bend(B)
                if tot > _ang(D, Tj) + 0.35 or kmax > 1.0 / max(0.15, 2.5 * r): continue
                Lb = arclen(B)[-1]
                score = kmax * 0.25 + wlen * Lb + 0.3 * np.linalg.norm(ex) / max(rmax, 1e-6)
                score += 40.0 * max(0.0, 0.004 - _apart(B, np.full(len(B), r)))   # 和先插的那几根穿在一起的，尽量不要
                if best is None or score < best[0]: best = (score, j, E, D, B, ex)
        if best is None: continue
        _, j, E, D, B, ex = best
        I = _inside(E, D, r, max(0.15, s_old[j] - arclen(B)[-1]), gap)
        low = _resample(np.vstack([I[::-1], B[1:]]), j + 1)
        new = np.vstack([low[:-1], Q[j:]])
        if not _ok_path(new, R, gap * 0.5): continue
        EXITS.append((ex, r)); STEMS.append((new, R))
        note = f'接在第 {j}/{n - 1} 点' + (f'，整根提了 {lift:.2f}' if lift > 0 else '')
        nk = Neck(new, _s_clear(new, R), note)
        NOTES.append((_who(), f'{note}，出瓶以后才挂东西：{nk.s_clear:.2f}'))
        return nk
    NOTES.append((_who(), '没找着顺的走法，原样留着'))
    return Neck(P, _s_clear(P, R), '没改成')
