# 秋菊：黄花，细长花瓣层层舒卷，愈到外层愈疏朗（外层长瓣下垂、瓣尖往上勾，里层短瓣往里抱）；叶有深裂
import math
import numpy as np
from kit import MB, tube, ellipsoid, frame_from, place, norm, rot, srgb, grid_quads
import flora as F
from flora import pframe, at

GOLD = math.radians(137.508)


def mats():
    M = {}
    M['floret'] = F.petal_mat('chrys_floret', [(0.0, srgb(206, 140, 26)), (0.3, srgb(236, 180, 44)), (1.0, srgb(246, 204, 70))],
                              trans=0.35, rough=0.45, sheen=0.25, veins=(6.0, 40.0), vein_str=0.04, rand_v=0.12, rand_h=0.015)
    M['leaf'] = F.leaf_mat('chrys_leaf', top=srgb(48, 76, 44), mid=srgb(56, 82, 46), under=srgb(112, 128, 100),
                           trans=0.12, rough=0.6, rand_v=0.18, veins=(30.0, 4.0))
    M['stem'] = F.ramp_mat('chrys_stem', [(0.0, srgb(96, 84, 58)), (1.0, srgb(86, 104, 58))], 0.6)
    M['receptacle'] = F.plain('chrys_receptacle', (90, 104, 56), 0.6)
    return M


def garden():
    return {k: MB() for k in ('floret', 'leaf', 'stem', 'receptacle')}


def build(G, M, prefix='chrys'):
    return F.build_all(G, M, prefix)


def quill(rng, L, W, roll, curl, hook=0.0, nu=7, nv=18):
    """一根管状的舌状花：窄条卷成半管，顺着长度弯，瓣尖可以往回勾。"""
    u = np.linspace(-1, 1, nu); v = np.linspace(0, 1, nv)
    U, Vv = np.meshgrid(u, v)
    w = np.clip(np.sin(np.pi * np.clip(Vv, 0, 1) ** 0.5), 0.25, 1) * (1 - 0.5 * np.clip((Vv - 0.85) / 0.15, 0, 1))
    ang = U * roll * (0.6 + 0.4 * Vv)                # 横向卷起来
    r = W / max(roll, 1e-3)
    x = r * np.sin(ang) * w
    zc = r * (1 - np.cos(ang)) * w
    y = L * Vv
    z = zc + curl * L * Vv ** 2 + hook * L * np.clip((Vv - 0.7) / 0.3, 0, 1) ** 2
    V = np.stack([x, y, z], -1).reshape(-1, 3)
    UV = np.stack([(U + 1) / 2, Vv], -1).reshape(-1, 2)
    return V, grid_quads(nv, nu), UV


# 从外到里：数目、长、宽、离轴角度、顺长弯（+往里）、瓣尖回勾、卷的程度
RINGS = [
    (22, 0.5, 0.05, 108, -0.08, 0.32, 2.2),
    (24, 0.44, 0.048, 90, 0.0, 0.24, 2.0),
    (24, 0.36, 0.045, 68, 0.12, 0.1, 1.8),
    (22, 0.28, 0.045, 46, 0.3, 0.0, 1.6),
    (20, 0.2, 0.045, 26, 0.45, 0.0, 1.5),
    (14, 0.13, 0.04, 12, 0.5, 0.0, 1.4),
]


def head(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis)
    put = lambda V: place(np.asarray(V) * size, Rm, origin)
    i = 0
    for ri, (n, L, W, tilt, curl, hook, roll) in enumerate(RINGS):
        off = rng.uniform(0, 6.3)
        for k in range(n):
            th = off + 2 * np.pi * k / n + rng.normal(0, 0.06)
            V, Q, UV = quill(rng, L * rng.uniform(0.88, 1.1), W, roll, curl + rng.normal(0, 0.05), hook * rng.uniform(0.6, 1.3))
            a = math.radians(tilt + rng.normal(0, 6))
            b = at(0.035 * (1 - ri / len(RINGS)) + 0.01, th, 0.012 * ri)
            G['floret'].add(put(V @ pframe(th, a).T + b), Q, [], UV, rand=rng.random())
    V, Q, T, UV = ellipsoid((0, 0, 0.03), (0.04, 0.04, 0.03), nu=10, nv=6)
    G['floret'].add(put(V), Q, T, UV, rand=0.5)
    V, Q, T, UV = ellipsoid((0, 0, -0.025), (0.06, 0.06, 0.04), nu=10, nv=6)
    G['receptacle'].add(put(V), Q, T, UV)


def leaf(G, rng, p, d, size=1.0, up=(0, 0, 1)):
    """菊叶：卵形，羽状深裂（两侧各两道深缺）。"""
    V, Q, UV = F.leaf_blade(rng, rng.uniform(0.38, 0.46) * size, 0.3 * size, shape='ovate', nu=11, nv=28,
                            serr=0.55, teeth=3.2, fold=0.22, droop=0.15, tip=0.7, petiole=0.06)
    d = norm(d); x = norm(np.cross(d, up)); z = np.cross(x, d)
    G['leaf'].add(place(V, np.stack([x, d, z], 1), p), Q, [], UV, rand=rng.random())
    V, Q, T, UV = tube(np.array([p, p + d * 0.065]), 0.007, sides=5, cap=False)
    G['stem'].add(V, Q, T, UV)


def stem(G, rng, p0, p1, face=(0, -1, 0), bend=(0, 0, 0), size=1.0, leaves=4):
    P = F.curve(p0, p1, bend=bend, n=24)
    V, Q, T, UV = tube(P, np.linspace(0.022, 0.016, len(P)), sides=8, cap=False)
    G['stem'].add(V, Q, T, UV)
    (pe, Te), = F.points_along(P, [1.0])
    ax = norm(Te + 1.0 * np.asarray(face, float))
    head(G, rng, pe + ax * 0.02, ax, size=size)
    fa = np.asarray(face, float); sgn = 1
    for s in np.linspace(0.3, 0.85, leaves):
        (p, Tt), = F.points_along(P, [s])
        o = norm(np.cross(Tt, (0, 1, 0))) * sgn; sgn = -sgn
        leaf(G, rng, p, norm(o + 0.6 * Tt + 0.3 * fa), size=size, up=norm(np.array([0, 0, 1.0]) + 0.5 * fa))
    return P


def specimen(G, rng):
    stem(G, rng, (0.05, 0.15, -1.0), (0.0, 0.0, 0.15), face=(0, -1, 0.2))
    return (0.0, 0, -0.15), 1.8
