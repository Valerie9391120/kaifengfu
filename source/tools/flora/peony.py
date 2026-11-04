# 魏紫：开着的一朵、一个花苞、复叶、花梗。颜色照书房那朵魏紫（紫红，瓣边浅紫透光）
import math
import numpy as np
import kit
from kit import (MB, tube, ellipsoid, grid_quads, frame_from, place, norm, rot,
                 new_mat, ramp, uv_xy, attr, math_node, mix_rgb, hsv, thin_surface, noise_bump, srgb)
import bpy

# ---------------- 材质 ----------------
PETAL = {
    # 魏紫：瓣根深紫红 → 瓣身紫红 → 瓣边浅紫
    'weizi': [(0.0, srgb(50, 4, 42)), (0.25, srgb(94, 12, 80)), (0.65, srgb(124, 24, 108)), (1.0, srgb(160, 66, 154))],
    # 玉楼春：千层白花，花心深处一线淡淡的暖色
    'yulouchun': [(0.0, srgb(214, 172, 132)), (0.16, srgb(236, 218, 196)), (0.4, srgb(246, 242, 232)), (1.0, srgb(250, 249, 244))],
}


def mats(kind='weizi'):
    M = {}
    m, nt, out = new_mat(kind + '_petal')
    tc, sep = uv_xy(nt)
    r = ramp(nt, PETAL[kind])
    nt.links.new(sep.outputs['Y'], r.inputs[0])
    rnd = attr(nt, 'rand'); rg = attr(nt, 'ring')
    hue = math_node(nt, 'MULTIPLY_ADD', rnd.outputs['Fac'], 0.035); hue.inputs[2].default_value = 0.4825
    k1, k2 = (0.22, -0.18) if kind == 'weizi' else (0.06, 0.1)
    val = math_node(nt, 'MULTIPLY_ADD', rnd.outputs['Fac'], k1); val.inputs[2].default_value = 1.0 - k1 / 2 - 0.01
    val2 = math_node(nt, 'MULTIPLY_ADD', rg.outputs['Fac'], k2); val2.inputs[2].default_value = 1.0
    vv = math_node(nt, 'MULTIPLY', val.outputs[0], val2.outputs[0])
    base = hsv(nt, r.outputs['Color'], hue.outputs[0], 1.0, vv.outputs[0])
    trc = hsv(nt, r.outputs['Color'], 0.5, 1.0, 1.35 if kind == 'weizi' else 0.95)
    # 顺着瓣长的细脉
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (70.0, 6.0, 1.0)
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    nrm = noise_bump(nt, scale=1.0, strength=0.12, detail=3.0, vec=mp.outputs[0])
    thin_surface(nt, out, base, trc, trans=0.32 if kind == 'weizi' else 0.42, rough=0.48, sheen=0.35, normal=nrm, spec=0.35)
    M['petal'] = m

    m, nt, out = new_mat('weizi_anther')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.inputs['Base Color'].default_value = (*srgb(232, 176, 38), 1)
    p.inputs['Roughness'].default_value = 0.6; nt.links.new(p.outputs[0], out.inputs['Surface'])
    M['anther'] = m
    m, nt, out = new_mat('weizi_filament')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.inputs['Base Color'].default_value = (*srgb(176, 70, 120), 1)
    p.inputs['Roughness'].default_value = 0.6; nt.links.new(p.outputs[0], out.inputs['Surface'])
    M['filament'] = m
    m, nt, out = new_mat('weizi_carpel')
    tc, sep = uv_xy(nt)
    r = ramp(nt, [(0.0, srgb(150, 168, 110)), (0.75, srgb(170, 150, 120)), (1.0, srgb(200, 60, 130))])
    nt.links.new(sep.outputs['Y'], r.inputs[0])
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(r.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.5; nt.links.new(p.outputs[0], out.inputs['Surface'])
    M['carpel'] = m

    # 叶：深绿，叶缘一点紫红；背面浅一些
    m, nt, out = new_mat('weizi_leaf')
    tc, sep = uv_xy(nt)
    edge = math_node(nt, 'SUBTRACT', sep.outputs['X'], 0.5)
    edge = math_node(nt, 'ABSOLUTE', edge.outputs[0])
    edge = math_node(nt, 'MULTIPLY', edge.outputs[0], 2.0)
    edge = math_node(nt, 'POWER', edge.outputs[0], 6.0)
    g = ramp(nt, [(0.0, srgb(46, 72, 40)), (0.5, srgb(38, 62, 34)), (1.0, srgb(56, 74, 40))])
    nt.links.new(sep.outputs['Y'], g.inputs[0])
    rnd = attr(nt, 'rand')
    gv = math_node(nt, 'MULTIPLY_ADD', rnd.outputs['Fac'], 0.25); gv.inputs[2].default_value = 0.85
    gcol = hsv(nt, g.outputs['Color'], 0.5, 1.0, gv.outputs[0])
    edge_m = math_node(nt, 'MULTIPLY', edge.outputs[0], 0.55)
    col = mix_rgb(nt, edge_m.outputs[0], gcol, srgb(120, 40, 60))
    # 背面颜色浅、带一点粉白
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    col = mix_rgb(nt, geo.outputs['Backfacing'], col, srgb(96, 116, 88))
    trc = hsv(nt, col, 0.5, 1.2, 1.6)
    # 叶脉：顺着 Y 方向的细条
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (40.0, 4.0, 1.0)
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    nrm = noise_bump(nt, scale=1.0, strength=0.08, detail=2.0, vec=mp.outputs[0])
    thin_surface(nt, out, col, trc, trans=0.18, rough=0.6, sheen=0.0, normal=nrm, spec=0.08)
    M['leaf'] = m

    # 萼片、苞片：绿里透紫红，尖上更红
    m, nt, out = new_mat('weizi_sepal')
    tc, sep = uv_xy(nt)
    r = ramp(nt, [(0.0, srgb(70, 96, 52)), (0.6, srgb(84, 92, 54)), (1.0, srgb(140, 52, 78))])
    nt.links.new(sep.outputs['Y'], r.inputs[0])
    trc = hsv(nt, r.outputs['Color'], 0.5, 1.0, 1.5)
    thin_surface(nt, out, r.outputs['Color'], trc, trans=0.15, rough=0.5, sheen=0.1)
    M['sepal'] = m

    # 花梗：下面带木色，往上转绿、近花处泛紫红
    m, nt, out = new_mat('weizi_stem')
    tc, sep = uv_xy(nt)
    r = ramp(nt, [(0.0, srgb(92, 70, 52)), (0.35, srgb(84, 92, 56)), (0.85, srgb(96, 84, 58)), (1.0, srgb(128, 58, 72))])
    nt.links.new(sep.outputs['Y'], r.inputs[0])
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(r.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.55
    nrm = noise_bump(nt, scale=60.0, strength=0.1)
    nt.links.new(nrm, p.inputs['Normal'])
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    M['stem'] = m
    return M


def garden():
    return {k: MB() for k in ('petal', 'anther', 'filament', 'carpel', 'leaf', 'sepal', 'stem')}


def build(G, M, prefix='weizi'):  # noqa
    return _build(G, M, prefix)


def _build(G, M, prefix):
    obs = []
    for k, mb in G.items():
        ob = mb.build(f'{prefix}_{k}', M[k])
        if ob: obs.append(ob)
    return obs


# ---------------- 花瓣 ----------------
def petal(rng, L, W, cup, curl, ruffle, crinkle, nu=17, nv=19, fq=1.0):
    u = np.linspace(-1, 1, nu); v = np.linspace(0, 1, nv)
    U, Vv = np.meshgrid(u, v)
    ph = rng.uniform(0, 2 * np.pi, 6)
    wv = 0.16 + 0.84 * np.sin(np.clip(Vv / 0.78, 0, 1) * np.pi / 2) ** 1.2
    notch = (0.04 * np.sin(4.5 * fq * U + ph[0]) + 0.025 * np.sin(8.0 * fq * U + ph[1])) / fq
    topc = 1 - (0.26 / fq) * U ** 2 + notch
    y = L * Vv * (1 + (topc - 1) * Vv ** 4)
    x = U * (W / 2) * wv
    xn = U * wv
    z = cup * 0.22 * W * (xn ** 2) * (0.25 + 0.75 * Vv)
    z += curl * L * Vv ** 2
    edge = np.clip((Vv - 0.45) / 0.55, 0, 1) ** 1.6 + 0.45 * np.abs(U) ** 3 * Vv
    z += ruffle * 0.06 * L * edge * (np.sin(5 * fq * U + ph[3]) + 0.5 * np.sin(9 * fq * U + ph[4] + 3 * Vv))
    z += crinkle * 0.016 * L * np.sin(13 * fq * U + 9 * Vv + ph[5]) * np.sin(15 * Vv + 5 * U + ph[0])
    V = np.stack([x, y, z], -1).reshape(-1, 3)
    UV = np.stack([(U + 1) / 2, Vv], -1).reshape(-1, 2)
    return V, grid_quads(nv, nu), UV


def petal_frame(th, a):
    d = np.array([math.sin(a) * math.cos(th), math.sin(a) * math.sin(th), math.cos(a)])
    n = np.array([-math.cos(a) * math.cos(th), -math.cos(a) * math.sin(th), math.sin(a)])
    t = np.array([-math.sin(th), math.cos(th), 0.0])
    return np.stack([t, d, n], 1)   # 局部 x→t，y→d（瓣长），z→n（瓣内面）


# 从外到里：片数、长、宽、离轴的角度、瓣尖往里卷、横向兜、边上的褶、细皱、离中心多远、高
RINGS = [
    # 外面三层护瓣：宽、圆、兜着
    (6, 0.74, 0.74, 74, 0.02, 1.4, 0.8, 0.4, 0.10, 0.00, 1.0),
    (7, 0.70, 0.68, 62, 0.06, 1.5, 0.9, 0.5, 0.09, 0.02, 1.0),
    (8, 0.64, 0.60, 50, 0.10, 1.6, 1.0, 0.6, 0.08, 0.04, 1.0),
    # 里面一团冠：窄些、皱些，越往里越立
    (12, 0.50, 0.40, 38, 0.24, 2.0, 1.1, 0.9, 0.07, 0.07, 1.2),
    (16, 0.42, 0.34, 28, 0.32, 2.2, 1.2, 1.0, 0.06, 0.09, 1.3),
    (20, 0.33, 0.28, 20, 0.40, 2.4, 1.2, 1.0, 0.045, 0.11, 1.3),
    (22, 0.24, 0.21, 13, 0.46, 2.6, 1.2, 1.0, 0.03, 0.13, 1.4),
]


RINGS_YLC = [
    (6, 0.74, 0.76, 76, 0.02, 1.4, 0.7, 0.4, 0.10, 0.00, 1.0),
    (7, 0.70, 0.70, 64, 0.06, 1.5, 0.8, 0.5, 0.09, 0.02, 1.0),
    # 楼子：一层层往上摞，越往上越立、越皱
    (14, 0.46, 0.40, 40, 0.20, 2.0, 1.1, 1.0, 0.075, 0.08, 1.2),
    (16, 0.42, 0.36, 30, 0.28, 2.2, 1.2, 1.1, 0.065, 0.13, 1.3),
    (18, 0.38, 0.32, 22, 0.34, 2.4, 1.2, 1.1, 0.055, 0.18, 1.3),
    (18, 0.32, 0.27, 15, 0.40, 2.5, 1.2, 1.2, 0.045, 0.23, 1.4),
    (16, 0.24, 0.21, 9, 0.46, 2.6, 1.2, 1.2, 0.03, 0.28, 1.4),
]


def bloom(G, rng, origin, axis, size=1.0, spin=0.0, rings=None, center=True):
    RINGS_ = rings or RINGS
    Rm = frame_from(axis) @ rot((0, 0, 1), spin)
    put = lambda V: place(np.asarray(V) * size, Rm, origin)
    nr = len(RINGS_)
    for ri, (n, L, W, tilt, curl, cup, ruf, cr, r0, h, fq) in enumerate(RINGS_):
        off = rng.uniform(0, 2 * np.pi)
        for k in range(n):
            th = off + 2 * np.pi * k / n + rng.normal(0, 0.12)
            a = math.radians(tilt + rng.normal(0, 5))
            V, Q, UV = petal(rng, L * rng.uniform(0.88, 1.08), W * rng.uniform(0.85, 1.1),
                             cup * rng.uniform(0.8, 1.2), curl + rng.normal(0, 0.05), ruf, cr, fq=fq)
            b = np.array([r0 * math.cos(th), r0 * math.sin(th), h])
            G['petal'].add(put(V @ petal_frame(th, a).T + b), Q, [], UV, rand=rng.random(), ring=ri / (nr - 1))
    # 雄蕊：一圈金黄，夹在里面几层瓣中间
    for k in range(70):
        th = rng.uniform(0, 2 * np.pi); r = rng.uniform(0.03, 0.075); a = math.radians(rng.uniform(18, 62))
        Ls = rng.uniform(0.07, 0.11)
        base = np.array([r * math.cos(th), r * math.sin(th), 0.07])
        d = np.array([math.sin(a) * math.cos(th), math.sin(a) * math.sin(th), math.cos(a)])
        pts = base + np.outer(np.linspace(0, Ls, 4), d)
        V, Q, T, UV = tube(pts, 0.0035, sides=5, cap=False)
        G['filament'].add(put(V), Q, T, UV)
        V, Q, T, UV = ellipsoid(pts[-1] + d * 0.012, (0.0065, 0.0065, 0.017), frame_from(d), nu=6, nv=5)
        G['anther'].add(put(V), Q, T, UV)
    for k in range(40 if center else 0):
        th = rng.uniform(0, 2 * np.pi); r = rng.uniform(0.04, 0.2)
        c = np.array([r * math.cos(th), r * math.sin(th), 0.36 - 0.55 * r + rng.uniform(-0.03, 0.03)])
        d = norm([math.cos(th) * 0.6, math.sin(th) * 0.6, 1])
        V, Q, T, UV = ellipsoid(c, (0.008, 0.008, 0.018), frame_from(d), nu=6, nv=5)
        G['anther'].add(put(V), Q, T, UV)
    for k in range(26 if center else 8):   # 正中间露出来的一簇
        th = rng.uniform(0, 2 * np.pi); r = 0.06 * math.sqrt(rng.random())
        c = np.array([r * math.cos(th), r * math.sin(th), rng.uniform(0.19, 0.27)])
        d = norm([math.cos(th) * 0.4, math.sin(th) * 0.4, 1])
        V, Q, T, UV = ellipsoid(c, (0.009, 0.009, 0.02), frame_from(d), nu=6, nv=5)
        G['anther'].add(put(V), Q, T, UV)
    # 心皮
    for k in range(5):
        th = 2 * np.pi * k / 5 + rng.normal(0, 0.2); d = norm([0.25 * math.cos(th), 0.25 * math.sin(th), 1])
        V, Q, T, UV = ellipsoid(np.array([0.016 * math.cos(th), 0.016 * math.sin(th), 0.1]), (0.016, 0.016, 0.045), frame_from(d), nu=8, nv=6)
        G['carpel'].add(put(V), Q, T, UV)
    # 花托和萼片
    V, Q, T, UV = ellipsoid((0, 0, -0.02), (0.075, 0.075, 0.06), nu=12, nv=7)
    G['sepal'].add(put(V), Q, T, UV)
    off = rng.uniform(0, 2 * np.pi)
    for k in range(5):
        th = off + 2 * np.pi * k / 5
        V, Q, UV = petal(rng, 0.2, 0.15, 1.6, -0.05, 0.3, 0.2, nu=9, nv=10)
        G['sepal'].add(put(V @ petal_frame(th, math.radians(102 + rng.normal(0, 6))).T + [0.06 * math.cos(th), 0.06 * math.sin(th), -0.03]), Q, [], UV)
    # 两三片细长的苞片
    for k in range(3):
        th = off + rng.uniform(0, 2 * np.pi)
        V, Q, UV = lobe(rng, 0.32, 0.07, fold=0.3, droop=0.08)
        G['sepal'].add(put(V @ petal_frame(th, math.radians(118)).T + [0.05 * math.cos(th), 0.05 * math.sin(th), -0.05]), Q, [], UV)
    return Rm


def bud(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis)
    put = lambda V: place(np.asarray(V) * size, Rm, origin)
    # 里面一团紫红（顶上露出来）
    V, Q, T, UV = ellipsoid((0, 0, 0.11), (0.1, 0.1, 0.12), nu=16, nv=10)
    UV[:, 1] = 0.35 + 0.65 * UV[:, 1]
    G['petal'].add(put(V), Q, T, UV, rand=rng.random(), ring=1.0)
    # 外面几片萼片裹着
    off = rng.uniform(0, 2 * np.pi)
    for k in range(5):
        th = off + 2 * np.pi * k / 5 + rng.normal(0, 0.1)
        V, Q, UV = petal(rng, 0.2 * rng.uniform(0.9, 1.1), 0.2, 3.2, 0.12, 0.2, 0.2, nu=11, nv=12)
        G['sepal'].add(put(V @ petal_frame(th, math.radians(22 + rng.normal(0, 4))).T + [0.03 * math.cos(th), 0.03 * math.sin(th), 0.0]), Q, [], UV)
    V, Q, T, UV = ellipsoid((0, 0, -0.01), (0.06, 0.06, 0.05), nu=10, nv=6)
    G['sepal'].add(put(V), Q, T, UV)
    for k in range(2):
        th = off + rng.uniform(0, 2 * np.pi)
        V, Q, UV = lobe(rng, 0.28, 0.06, fold=0.3, droop=0.08)
        G['sepal'].add(put(V @ petal_frame(th, math.radians(120)).T + [0.04 * math.cos(th), 0.04 * math.sin(th), -0.03]), Q, [], UV)


# ---------------- 叶 ----------------
def lobe(rng, L, W, fold=0.25, droop=0.15, nu=9, nv=14):
    """一片披针形的裂片：顺着 +Y 长，中脉对折成浅 V 字，尖往下垂。"""
    u = np.linspace(-1, 1, nu); v = np.linspace(0, 1, nv)
    U, Vv = np.meshgrid(u, v)
    w = np.sin(np.pi * np.clip(Vv, 0, 1) ** 0.8) ** 0.75 * (1 - 0.1 * Vv)
    w = np.maximum(w, 0.05 * (1 - Vv))
    x = U * W / 2 * w
    y = Vv * L
    ph = rng.uniform(0, 6.3)
    z = fold * np.abs(x) - droop * L * Vv ** 2 + 0.035 * W * np.sin(3 * U + 9 * Vv + ph) * np.abs(U)
    V = np.stack([x, y, z], -1).reshape(-1, 3)
    UV = np.stack([(U + 1) / 2, Vv], -1).reshape(-1, 2)
    return V, grid_quads(nv, nu), UV


def leaflet(G, rng, L, R, t, lobes3=True):
    """一片小叶：一片主裂片，左右各一片侧裂片（三裂）。R/t 把局部（沿 +Y 长、面朝 +Z）放到世界里。"""
    rand = rng.random()
    W = 0.5 * L
    V, Q, UV = lobe(rng, L, W, fold=0.22, droop=0.12 + rng.uniform(0, 0.08))
    G['leaf'].add(place(V, R, t), Q, [], UV, rand=rand)
    if lobes3:
        for sgn in (-1, 1):
            if rng.random() < 0.15: continue
            Ls = L * rng.uniform(0.55, 0.7)
            V, Q, UV = lobe(rng, Ls, 0.5 * Ls, fold=0.22, droop=0.1)
            Rl = rot((0, 0, 1), sgn * math.radians(rng.uniform(34, 46))) @ rot((0, 1, 0), sgn * 0.12)
            V = V @ Rl.T + [0, 0.18 * L, -0.004]
            G['leaf'].add(place(V, R, t), Q, [], UV, rand=rand)


_STEMS = {}   # 每个园子里已经建好的花梗（中线、半径）：叶子的叶柄从梗上长出来


def _on_stem(G, o):
    """这个园子里离 o 最近的花梗上一点（中线上，瓶口以上），没有梗就 None。"""
    best = None
    for P, R in _STEMS.get(id(G), []):
        s = kit.arclen(P); t = np.linspace(0, s[-1], 240)
        Q = np.stack([np.interp(t, s, P[:, k]) for k in range(3)], -1)
        if kit.LIP is not None: Q = Q[Q[:, 2] > kit.LIP + 0.06]
        if not len(Q): continue
        d = np.linalg.norm(Q - o, axis=1); i = int(np.argmin(d))
        if best is None or d[i] < best[1]: best = (Q[i], d[i])
    return best


def leaf(G, rng, origin, direction, up=(0, 0, 1), size=1.0, petiole=0.5):
    """一片三出复叶：叶柄 + 顶生小叶 + 两片侧生小叶。direction 是叶柄伸出去的方向。
    这个园子里已经有花梗的，叶柄从离 origin 最近的那根梗上长出来，弯过去接到三片小叶那儿（小叶还在原地方）。"""
    d = norm(direction)
    x = norm(np.cross(d, up)); z = np.cross(x, d)
    R = np.stack([x, d, z], 1) * size   # 局部 y 沿叶柄，z 朝上
    o = np.asarray(origin, float)
    # 叶柄：微微拱起
    s = np.linspace(0, 1, 8)
    P = np.stack([0 * s, petiole * s, 0.12 * petiole * np.sin(np.pi * s * 0.8)], -1)
    on = _on_stem(G, o)
    if on is None:
        V, Q, T, UV = tube(P, np.linspace(0.016, 0.011, 8), sides=6, cap=False)
        G['stem'].add(place(V, R, o), Q, T, UV)
    else:
        p0 = on[0]; tw = place(P[-1], R, o)
        dt = norm(R @ np.array([0, 1.0, -0.244]))          # 原来叶柄到头那一下的走向，小叶照这个接
        L = np.linalg.norm(tw - p0)
        t0 = norm(norm(tw - p0) + np.array([0, 0, 0.45]))   # 从梗上斜斜往上出
        Pw = bezier(p0, p0 + t0 * L * 0.35, tw - dt * L * 0.35, tw, n=14)
        V, Q, T, UV = tube(Pw, np.linspace(0.016, 0.011, 14) * size, sides=6, cap=False)
        G['stem'].add(V, Q, T, UV)
        print(f'peony.leaf: 叶柄接到梗上（原来离梗 {on[1]:.3f}，新叶柄长 {kit.arclen(Pw)[-1]:.2f}）')
    tip = P[-1]
    Lt = rng.uniform(0.62, 0.74)
    leaflet(G, rng, Lt, R @ rot((1, 0, 0), -0.08), place(tip, R, o))
    for sgn in (-1, 1):
        a = sgn * math.radians(rng.uniform(52, 66))
        Rl = R @ rot((0, 0, 1), a) @ rot((0, 1, 0), sgn * 0.25) @ rot((1, 0, 0), -0.1)
        base = tip + np.array([0, -0.02, 0])
        leaflet(G, rng, Lt * rng.uniform(0.72, 0.85), Rl, place(base, R, o), lobes3=rng.random() < 0.6)


# ---------------- 花梗 ----------------
def bezier(p0, p1, p2, p3, n=24):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = map(lambda a: np.asarray(a, float), (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def stem(G, pts, r0=0.032, r1=0.025):
    R = np.linspace(r0, r1, len(pts))
    pts = kit.neck(pts, R).P          # 从瓶里起头的：瓶颈那截捋顺，从瓶口正经出来
    _STEMS.setdefault(id(G), []).append((pts, R))
    V, Q, T, UV = tube(pts, R, sides=10, cap=False)
    G['stem'].add(V, Q, T, UV)
