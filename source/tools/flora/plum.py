# 白梅：老枝曲折、新枝细直，五瓣白花、红褐色的萼、一簇细长的雄蕊，枝头是花苞
import math
import numpy as np
from kit import (MB, tube, ellipsoid, grid_quads, frame_from, place, norm, rot,
                 new_mat, ramp, uv_xy, attr, math_node, mix_rgb, hsv, thin_surface, noise_bump, srgb)
import bpy

SCALE = 1.5   # 花朵比真的大一点，手机上才看得清


def mats():
    M = {}
    m, nt, out = new_mat('plum_petal')
    tc, sep = uv_xy(nt)
    r = ramp(nt, [(0.0, srgb(206, 214, 170)), (0.18, srgb(236, 238, 222)), (1.0, srgb(247, 246, 240))])
    nt.links.new(sep.outputs['Y'], r.inputs[0])
    rnd = attr(nt, 'rand')
    vv = math_node(nt, 'MULTIPLY_ADD', rnd.outputs['Fac'], 0.08); vv.inputs[2].default_value = 0.94
    base = hsv(nt, r.outputs['Color'], 0.5, 1.0, vv.outputs[0])
    trc = hsv(nt, r.outputs['Color'], 0.5, 1.3, 0.95)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (30.0, 5.0, 1.0)
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    nrm = noise_bump(nt, scale=1.0, strength=0.06, detail=2.0, vec=mp.outputs[0])
    thin_surface(nt, out, base, trc, trans=0.42, rough=0.42, sheen=0.25, normal=nrm, spec=0.35)
    M['petal'] = m

    def plain(name, rgb, rough=0.55):
        m, nt, out = new_mat(name)
        p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.inputs['Base Color'].default_value = (*srgb(*rgb), 1)
        p.inputs['Roughness'].default_value = rough; nt.links.new(p.outputs[0], out.inputs['Surface'])
        return m
    M['sepal'] = plain('plum_sepal', (98, 40, 34), 0.5)
    M['filament'] = plain('plum_filament', (238, 232, 212), 0.6)
    M['anther'] = plain('plum_anther', (214, 160, 40), 0.6)
    M['pistil'] = plain('plum_pistil', (196, 210, 150), 0.5)

    # 树皮：深褐里带灰，一点青灰的苔斑；新枝偏红褐
    m, nt, out = new_mat('plum_bark')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 22.0; n1.inputs['Detail'].default_value = 6.0
    nt.links.new(tc.outputs['Object'], n1.inputs['Vector'])
    r1 = ramp(nt, [(0.3, srgb(38, 30, 26)), (0.55, srgb(62, 52, 44)), (0.75, srgb(92, 86, 74))])
    nt.links.new(n1.outputs['Fac'], r1.inputs[0])
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 7.0; n2.inputs['Detail'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
    lich = ramp(nt, [(0.58, (0, 0, 0)), (0.66, (1, 1, 1))])
    nt.links.new(n2.outputs['Fac'], lich.inputs[0])
    col = mix_rgb(nt, lich.outputs['Color'], r1.outputs['Color'], srgb(118, 122, 100))
    yg = attr(nt, 'young')
    col = mix_rgb(nt, yg.outputs['Fac'], col, srgb(74, 52, 38))
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(col, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.8
    nrm = noise_bump(nt, scale=45.0, strength=0.45, detail=5.0, vec=tc.outputs['Object'], distance=0.01)
    nt.links.new(nrm, p.inputs['Normal'])
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    M['bark'] = m
    return M


def garden():
    return {k: MB() for k in ('petal', 'sepal', 'filament', 'anther', 'pistil', 'bark')}


def build(G, M, prefix='plum'):
    obs = []
    for k, mb in G.items():
        ob = mb.build(f'{prefix}_{k}', M[k])
        if ob: obs.append(ob)
    return obs


# ---------------- 花 ----------------
def petal(rng, L, W, cup, nu=11, nv=11):
    u = np.linspace(-1, 1, nu); v = np.linspace(0, 1, nv)
    U, Vv = np.meshgrid(u, v)
    w = (2 * np.sqrt(np.clip(Vv * (1 - Vv), 0, None))) ** 0.75
    w = np.maximum(w, 0.18 * (1 - Vv))
    x = U * W / 2 * w
    y = L * Vv * (1 - 0.06 * U ** 2)
    ph = rng.uniform(0, 6.3)
    z = cup * 0.42 * W * (U * w) ** 2 + cup * 0.18 * L * Vv ** 2 + 0.02 * L * np.sin(7 * U + ph) * Vv ** 3
    V = np.stack([x, y, z], -1).reshape(-1, 3)
    UV = np.stack([(U + 1) / 2, Vv], -1).reshape(-1, 2)
    return V, grid_quads(nv, nu), UV


def pframe(th, a):
    d = np.array([math.sin(a) * math.cos(th), math.sin(a) * math.sin(th), math.cos(a)])
    n = np.array([-math.cos(a) * math.cos(th), -math.cos(a) * math.sin(th), math.sin(a)])
    t = np.array([-math.sin(th), math.cos(th), 0.0])
    return np.stack([t, d, n], 1)


def flower(G, rng, origin, axis, size=1.0, half=False):
    Rm = frame_from(axis) @ rot((0, 0, 1), rng.uniform(0, 6.3))
    put = lambda V: place(np.asarray(V) * size * SCALE, Rm, origin)
    off = rng.uniform(0, 2 * np.pi)
    rand = rng.random()
    tilt = 38 if half else 66
    for k in range(5):
        th = off + 2 * np.pi * k / 5 + rng.normal(0, 0.06)
        L = 0.105 * rng.uniform(0.92, 1.08)
        V, Q, UV = petal(rng, L, L * 1.02, 0.9 + rng.uniform(-0.2, 0.3) + (1.2 if half else 0))
        a = math.radians(tilt + rng.normal(0, 5))
        G['petal'].add(put(V @ pframe(th, a).T + [0.011 * math.cos(th), 0.011 * math.sin(th), 0.004]), Q, [], UV, rand=rand)
    for k in range(5):
        th = off + 2 * np.pi * (k + 0.5) / 5
        V, Q, UV = petal(rng, 0.044, 0.042, 0.6, nu=7, nv=7)
        G['sepal'].add(put(V @ pframe(th, math.radians(104)).T + [0.011 * math.cos(th), 0.011 * math.sin(th), -0.003]), Q, [], UV)
    V, Q, T, UV = ellipsoid((0, 0, -0.012), (0.017, 0.017, 0.018), nu=8, nv=5)
    G['sepal'].add(put(V), Q, T, UV)
    if not half:
        for k in range(26):
            th = rng.uniform(0, 2 * np.pi); r = rng.uniform(0.004, 0.011); a = math.radians(rng.uniform(14, 52))
            d = np.array([math.sin(a) * math.cos(th), math.sin(a) * math.sin(th), math.cos(a)])
            Ls = rng.uniform(0.05, 0.072)
            pts = np.array([r * math.cos(th), r * math.sin(th), 0.006]) + np.outer(np.linspace(0, Ls, 3), d)
            V, Q, T, UV = tube(pts, 0.0017, sides=4, cap=False)
            G['filament'].add(put(V), Q, T, UV)
            V, Q, T, UV = ellipsoid(pts[-1] + d * 0.003, (0.0048, 0.0048, 0.0042), frame_from(d), nu=5, nv=4)
            G['anther'].add(put(V), Q, T, UV)
        pts = np.outer(np.linspace(0.004, 0.058, 3), [0, 0, 1])
        V, Q, T, UV = tube(pts, 0.0022, sides=5, cap=True)
        G['pistil'].add(put(V), Q, T, UV)
    return Rm


def bud(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis)
    put = lambda V: place(np.asarray(V) * size * SCALE, Rm, origin)
    s = rng.uniform(0.75, 1.05)
    # 花苞：一个小圆球，顶上隐约五道瓣缝；底下红褐色的萼兜住小半
    off = rng.uniform(0, 6.3)
    cz = 0.024 * s
    V, Q, T, UV = ellipsoid((0, 0, cz), (0.026 * s, 0.026 * s, 0.029 * s), nu=20, nv=10)
    ph = np.arctan2(V[:, 1], V[:, 0]); h = (V[:, 2] - cz) / (0.029 * s)
    k = 1 + 0.07 * np.cos(5 * ph + off) * np.clip(h + 0.3, 0, 1)
    V[:, 0] *= k; V[:, 1] *= k
    UV[:, 1] = 0.3 + 0.7 * UV[:, 1]
    G['petal'].add(put(V), Q, T, UV, rand=rng.random())
    for k in range(5):
        th = off + 2 * np.pi * (k + 0.5) / 5
        V, Q, UV = petal(rng, 0.032 * s, 0.034 * s, 2.4, nu=7, nv=7)
        G['sepal'].add(put(V @ pframe(th, math.radians(34)).T + [0.008 * math.cos(th), 0.008 * math.sin(th), -0.006]), Q, [], UV)
    V, Q, T, UV = ellipsoid((0, 0, -0.006), (0.013, 0.013, 0.013), nu=8, nv=5)
    G['sepal'].add(put(V), Q, T, UV)


# ---------------- 枝 ----------------
def path(rng, p0, d0, length, step=0.05, node=0.3, kink=(14, 30), wander=0.03, lift=0.0, side=None):
    """一根枝的中线：两节之间微微弯，到节上折一下（左右交替），梅枝那种"之"字。"""
    pts = [np.asarray(p0, float)]; d = norm(d0)
    n = max(3, int(round(length / step)))
    sgn = 1 if rng.random() < 0.5 else -1
    nodes = []
    acc = 0.0
    nxt = node * rng.uniform(0.7, 1.3)
    side = norm(side) if side is not None else None
    for i in range(n):
        acc += step
        if node and acc >= nxt:
            ax = np.cross(d, side if side is not None else rng.normal(0, 1, 3))
            if np.linalg.norm(ax) < 1e-6: ax = np.cross(d, [1, 0, 0])
            d = norm(rot(ax, sgn * math.radians(rng.uniform(*kink))) @ d)
            sgn = -sgn
            nodes.append(len(pts) - 1)
            acc = 0.0; nxt = node * rng.uniform(0.7, 1.3)
        else:
            d = norm(d + rng.normal(0, wander, 3))
        if lift: d = norm(d + np.array([0, 0, lift]))
        pts.append(pts[-1] + d * step)
    P = np.array(pts)
    # 折角处稍微圆一下，不至于像折断的
    if len(P) > 4:
        Q = P.copy(); Q[1:-1] = 0.25 * P[:-2] + 0.5 * P[1:-1] + 0.25 * P[2:]
        P = Q
    return P, nodes


def radii(P, r0, r1, nodes=(), knot=0.18):
    s = np.linspace(0, 1, len(P))
    R = r1 + (r0 - r1) * (1 - s) ** 0.9
    for i in nodes:
        R *= 1 + knot * np.exp(-((np.arange(len(P)) - i) / 1.2) ** 2)
    return R


def frame_at(P, i):
    T = norm(P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)])
    return T


def add_branch(G, P, R, young=0.0, sides=10):
    V, Q, T, UV = tube(P, R, sides=sides, cap=True)
    G['bark'].add(V, Q, T, UV, young=young)


def blossoms_along(G, rng, P, R, start=0.12, gap=(0.08, 0.14), face=(0, -1, 0.0), bias=0.55, up=0.3, tipbuds=2, density=1.0):
    """顺着一根新枝挂花：隔一段一朵（偶尔两朵），枝梢上是花苞。"""
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)]); Ltot = cum[-1]
    s = start * Ltot + rng.uniform(0, 0.03)
    out = []
    while s < Ltot * 0.97:
        i = int(np.searchsorted(cum, s)); i = min(max(i, 1), len(P) - 1)
        T = norm(P[i] - P[i - 1])
        near_tip = s > Ltot - tipbuds * 0.09
        k = 2 if rng.random() < 0.18 else 1
        for _ in range(k):
            o = norm(np.cross(T, rng.normal(0, 1, 3)))
            ax = norm(o + bias * np.asarray(face, float) + up * np.array([0, 0, 1.0]))
            if np.dot(ax, T) < -0.4: ax = norm(ax + T)
            pos = P[i] + o * (R[i] + 0.006)
            if near_tip or rng.random() < 0.2:
                bud(G, rng, pos, ax, size=1.0)
            else:
                flower(G, rng, pos + ax * 0.004, ax, size=rng.uniform(0.9, 1.08), half=rng.random() < 0.15)
            out.append(pos)
        s += rng.uniform(*gap) / density
    return out
