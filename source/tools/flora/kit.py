# 共用的：清场、渲染设置、光、相机、月白瓶、网格小工具、材质小工具
import bpy, math
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
    return ob
