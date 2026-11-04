# 月季：柔软的花瓣一层层舒展，颜色鲜润（粉红）；高心，外瓣边缘往外翻卷；羽状复叶五小叶；茎上有小刺
import math
import numpy as np
import kit
from kit import MB, tube, ellipsoid, frame_from, place, norm, rot, srgb, grid_quads
import flora as F
from flora import pframe, at

GOLD = math.radians(137.508)


def mats():
    M = {}
    M['petal'] = F.petal_mat('rose_petal', [(0.0, srgb(238, 204, 170)), (0.22, srgb(232, 126, 150)), (0.7, srgb(224, 98, 130)), (1.0, srgb(218, 86, 120))],
                             back=[(0.0, srgb(240, 214, 190)), (1.0, srgb(236, 146, 168))], back_amt=0.5,
                             trans=0.35, rough=0.42, sheen=0.35, veins=(40.0, 6.0), vein_str=0.05, rand_v=0.12)
    M['sepal'] = F.plain('rose_sepal', (78, 104, 56), 0.55, sheen=0.2)
    M['leaf'] = F.leaf_mat('rose_leaf', top=srgb(42, 74, 40), mid=srgb(58, 80, 42), under=srgb(96, 120, 80),
                           edge=srgb(130, 60, 50), edge_amt=0.4, trans=0.14, rough=0.45, gloss=0.08, veins=(30.0, 4.0))
    M['stem'] = F.ramp_mat('rose_stem', [(0.0, srgb(80, 96, 50)), (0.8, srgb(84, 108, 56)), (1.0, srgb(110, 80, 56))], 0.5)
    M['prickle'] = F.plain('rose_prickle', (140, 70, 56), 0.5)
    return M


def garden():
    return {k: MB() for k in ('petal', 'sepal', 'leaf', 'stem', 'prickle')}


def build(G, M, prefix='rose'):
    return F.build_all(G, M, prefix)


def rose_petal(rng, L, W, cup, roll, curl, nu=13, nv=13):
    u = np.linspace(-1, 1, nu); v = np.linspace(0, 1, nv)
    U, Vv = np.meshgrid(u, v)
    w = (2 * np.sqrt(np.clip(Vv * (1 - Vv * 0.92), 0, None))) ** 0.7
    w = np.maximum(w, 0.28 * (1 - Vv)); w = w / w.max()
    x = U * W / 2 * w; y = L * Vv * (1 - 0.05 * U ** 2)
    xn = U * w
    z = cup * 0.35 * W * xn ** 2 * (1 - roll * Vv ** 2)
    z -= roll * 0.3 * W * np.abs(xn) ** 2.5 * Vv ** 2
    z += curl * L * Vv ** 2
    ph = rng.uniform(0, 6.3)
    z += 0.015 * L * np.sin(6 * U + ph) * Vv ** 3
    V = np.stack([x, y, z], -1).reshape(-1, 3)
    UV = np.stack([(U + 1) / 2, Vv], -1).reshape(-1, 2)
    return V, grid_quads(nv, nu), UV


def bloom(G, rng, origin, axis, size=1.0, n=34):
    Rm = frame_from(axis)
    put = lambda V: place(np.asarray(V) * size, Rm, origin)
    off = rng.uniform(0, 6.3)
    for i in range(n):
        f = i / (n - 1)
        th = off + i * GOLD
        tilt = 80 - 72 * f ** 0.7
        L = 0.3 - 0.12 * f
        cup = 0.4 + 2.6 * f ** 1.2
        roll = 1.2 * (1 - f) ** 1.5
        curl = -0.08 * (1 - f) + 0.32 * f ** 1.5
        V, Q, UV = rose_petal(rng, L * rng.uniform(0.95, 1.05), L * (1.05 - 0.2 * f), cup, roll, curl)
        b = at(0.04 * (1 - f) + 0.008, th, 0.16 * f ** 1.1)
        G['petal'].add(put(V @ pframe(th, math.radians(tilt + rng.normal(0, 3))).T + b), Q, [], UV, rand=rng.random())
    for k in range(5):
        th = off + 2 * np.pi * k / 5
        V, Q, UV = F.leaf_blade(rng, 0.16, 0.035, shape='lanceolate', nu=5, nv=9, fold=0.3, droop=0.25)
        G['sepal'].add(put(V @ pframe(th, math.radians(118)).T + at(0.035, th, -0.03)), Q, [], UV)
    V, Q, T, UV = ellipsoid((0, 0, -0.05), (0.045, 0.045, 0.06), nu=10, nv=6)
    G['sepal'].add(put(V), Q, T, UV)


def bud(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis)
    put = lambda V: place(np.asarray(V) * size, Rm, origin)
    V, Q, T, UV = ellipsoid((0, 0, 0.07), (0.045, 0.045, 0.09), nu=14, nv=9)
    h = np.clip((V[:, 2] - 0.07) / 0.09, -1, 1)
    k = 1 - 0.45 * np.clip(h, 0, 1) ** 1.5          # 顶上收尖
    V[:, 0] *= k; V[:, 1] *= k
    UV[:, 1] = 0.3 + 0.7 * UV[:, 1]
    G['petal'].add(put(V), Q, T, UV, rand=rng.random())
    off = rng.uniform(0, 6.3)
    for k_ in range(5):
        th = off + 2 * np.pi * k_ / 5
        V, Q, UV = F.leaf_blade(rng, 0.15, 0.035, shape='lanceolate', nu=5, nv=9, fold=0.3, droop=-0.1)
        G['sepal'].add(put(V @ pframe(th, math.radians(28 + rng.normal(0, 5))).T + at(0.025, th, -0.01)), Q, [], UV)
    V, Q, T, UV = ellipsoid((0, 0, -0.03), (0.035, 0.035, 0.045), nu=10, nv=6)
    G['sepal'].add(put(V), Q, T, UV)


def leaf(G, rng, p, d, size=1.0, up=(0, 0, 1)):
    """五小叶的羽状复叶。"""
    d = norm(d); x = norm(np.cross(d, up)); z = np.cross(x, d)
    R = np.stack([x, d, z], 1) * size
    Lr = 0.34
    P = np.stack([np.zeros(6), np.linspace(0, Lr, 6), -0.04 * np.linspace(0, 1, 6) ** 2], -1)
    V, Q, T, UV = tube(P, np.linspace(0.008, 0.005, 6), sides=5, cap=False)
    G['stem'].add(place(V, R, p), Q, T, UV)
    rand = rng.random()
    def leaflet(L, base, ang):
        V, Q, UV = F.leaf_blade(rng, L, 0.55 * L, shape='ovate', nu=9, nv=16, serr=0.12, teeth=10, fold=0.25, droop=0.1, tip=0.85)
        Rl = rot((0, 0, 1), ang)
        G['leaf'].add(place(V @ Rl.T + base, R, p), Q, [], UV, rand=rand)
    leaflet(0.2, P[-1], 0.0)
    for (s, L) in ((0.45, 0.17), (0.78, 0.18)):
        b = np.array([0, s * Lr, -0.04 * s ** 2])
        for sgn in (1, -1):
            leaflet(L, b, sgn * math.radians(rng.uniform(62, 76)))


def stem(G, rng, p0, p1, face=(0, -1, 0), bend=(0, 0, 0), size=1.0, leaves=2, with_bud=True):
    P = F.curve(p0, p1, bend=bend, n=24)
    R = np.linspace(0.024, 0.018, len(P))
    nk = kit.neck(P, R); P = nk.P     # 从瓶口正经出来；瓶口以下不长刺、不挂叶子
    V, Q, T, UV = tube(P, R, sides=8, cap=False)
    G['stem'].add(V, Q, T, UV)
    # 小刺
    for s in rng.uniform(0.05, 0.85, 10):
        (p, Tt), = F.points_along(P, [s])
        o = norm(np.cross(Tt, rng.normal(0, 1, 3)))
        V, Q, T, UV = tube(np.array([p + o * 0.016, p + o * 0.04 - Tt * 0.012]), [0.008, 0.0005], sides=5, cap=False)
        (G if nk.ok(s) else kit.SINK)['prickle'].add(V, Q, T, UV)
    (pe, Te), = F.points_along(P, [1.0])
    ax = norm(Te + 0.9 * np.asarray(face, float))
    bloom(G, rng, pe + ax * 0.05, ax, size=size)
    fa = np.asarray(face, float); sgn = 1
    for s in np.linspace(0.45, 0.8, leaves):
        (p, Tt), = F.points_along(P, [s])
        o = norm(np.cross(Tt, (0, 1, 0))) * sgn; sgn = -sgn
        leaf(G if nk.ok(s) else kit.SINK, rng, p, norm(o + 0.7 * Tt + 0.3 * fa), size=size, up=norm(np.array([0, 0, 1.0]) + 0.5 * fa))
    if with_bud:
        (p, Tt), = F.points_along(P, [nk.up(0.62)])
        o = norm(np.cross(Tt, (0, 1, 0))) * -1
        q = p + norm(o + Tt) * 0.3
        Pb = F.curve(p, q, bend=Tt * 0.04, n=8)
        V, Q, T, UV = tube(Pb, 0.012, sides=6, cap=False)
        G['stem'].add(V, Q, T, UV)
        bud(G, rng, q, norm(o * 0.5 + Tt + 0.3 * fa), size=size)
    return P


def specimen(G, rng):
    stem(G, rng, (0.05, 0.15, -1.0), (0.0, 0.0, 0.2), face=(0, -1, 0.1))
    return (0.0, 0, -0.15), 1.8
