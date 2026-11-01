# 木槿：薄软的五瓣花，花色温柔明净（淡粉紫），瓣根一圈深红的“眼”；中间一根雄蕊柱；花苞紧拢；叶三浅裂、有粗齿
import math
import numpy as np
from kit import MB, tube, ellipsoid, frame_from, place, norm, rot, srgb, grid_quads
import flora as F
from flora import pframe, at


def mats():
    M = {}
    M['petal'] = F.petal_mat('hibiscus_petal', [(0.0, srgb(118, 14, 58)), (0.13, srgb(150, 30, 86)), (0.22, srgb(206, 146, 196)),
                                                (0.6, srgb(222, 176, 216)), (1.0, srgb(230, 192, 224))],
                             trans=0.42, rough=0.42, sheen=0.25, veins=(70.0, 5.0), vein_str=0.07, rand_v=0.08, trans_v=1.1)
    M['column'] = F.ramp_mat('hibiscus_column', [(0.0, srgb(226, 210, 220)), (1.0, srgb(246, 240, 236))], 0.5)
    M['anther'] = F.plain('hibiscus_anther', (238, 210, 120), 0.6)
    M['calyx'] = F.plain('hibiscus_calyx', (84, 110, 56), 0.6, sheen=0.3)
    M['bud'] = F.ramp_mat('hibiscus_bud', [(0.0, srgb(90, 114, 58)), (0.65, srgb(110, 120, 70)), (0.85, srgb(200, 150, 190)), (1.0, srgb(214, 168, 206))], 0.5)
    M['leaf'] = F.leaf_mat('hibiscus_leaf', top=srgb(64, 98, 50), mid=srgb(74, 104, 52), under=srgb(110, 134, 90),
                           trans=0.18, rough=0.55, rand_v=0.2, veins=(30.0, 4.0))
    M['bark'] = F.bark_mat('hibiscus_bark', dark=(78, 70, 62), mid=(104, 96, 84), light=(132, 124, 110), young=(96, 104, 64))
    return M


def garden():
    return {k: MB() for k in ('petal', 'column', 'anther', 'calyx', 'bud', 'leaf', 'bark')}


def build(G, M, prefix='hibiscus'):
    return F.build_all(G, M, prefix)


def hib_petal(rng, L, W, cup=0.6, wave=0.05, nu=15, nv=15):
    """倒卵形的大花瓣：根上窄，往外扇开，边上起伏。"""
    u = np.linspace(-1, 1, nu); v = np.linspace(0, 1, nv)
    U, Vv = np.meshgrid(u, v)
    w = np.clip(Vv / 0.7, 0, 1) ** 0.75 * (1 - np.clip((Vv - 0.78) / 0.22, 0, 1) ** 2.2)
    w = np.maximum(w, 0.12 * (1 - Vv))
    x = U * W / 2 * w
    y = L * Vv * (1 - 0.05 * U ** 2)
    ph = rng.uniform(0, 6.3, 3)
    z = cup * 0.3 * W * (U * w) ** 2 + 0.06 * L * Vv ** 2
    z += wave * L * (np.sin(6 * U + ph[0]) * Vv ** 2.5 + 0.5 * np.sin(11 * U + ph[1]) * Vv ** 3)
    V = np.stack([x, y, z], -1).reshape(-1, 3)
    UV = np.stack([(U + 1) / 2, Vv], -1).reshape(-1, 2)
    return V, grid_quads(nv, nu), UV


def flower(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis) @ rot((0, 0, 1), rng.uniform(0, 6.3))
    put = lambda V: place(np.asarray(V) * size, Rm, origin)
    rand = rng.random()
    for k in range(5):
        th = 2 * np.pi * k / 5 + rng.normal(0, 0.05)
        V, Q, UV = hib_petal(rng, 0.36 * rng.uniform(0.95, 1.05), 0.36, cup=0.5, wave=0.05)
        V = V @ rot((0, 1, 0), 0.22).T                      # 每瓣绕自己的长轴拧一点，叠成旋转状
        G['petal'].add(put(V @ pframe(th, math.radians(68 + rng.normal(0, 4))).T + at(0.02, th, 0.0)), Q, [], UV, rand=rand)
    # 雄蕊柱：中间一根，上半截挂满花药，顶上花柱分五叉
    P = F.curve((0, 0, 0.0), (0, 0.02, 0.22), n=8)
    V, Q, T, UV = tube(P, np.linspace(0.012, 0.007, 8), sides=7, cap=True)
    G['column'].add(put(V), Q, T, UV)
    for k in range(34):
        s = rng.uniform(0.45, 0.95); p = P[0] + (P[-1] - P[0]) * s
        o = norm([rng.normal(), rng.normal(), 0.2])
        V, Q, T, UV = tube(np.array([p, p + o * 0.022]), 0.0018, sides=4, cap=False)
        G['column'].add(put(V), Q, T, UV)
        V, Q, T, UV = ellipsoid(p + o * 0.026, (0.006, 0.006, 0.006), nu=5, nv=4)
        G['anther'].add(put(V), Q, T, UV)
    for k in range(5):
        th = 2 * np.pi * k / 5
        V, Q, T, UV = tube(np.array([P[-1], P[-1] + at(0.022, th, 0.025)]), 0.003, sides=4, cap=True)
        G['column'].add(put(V), Q, T, UV)
        V, Q, T, UV = ellipsoid(P[-1] + at(0.024, th, 0.028), (0.007, 0.007, 0.007), nu=5, nv=4)
        G['anther'].add(put(V), Q, T, UV)
    for k in range(5):
        th = 2 * np.pi * (k + 0.5) / 5
        V, Q, UV = F.leaf_blade(rng, 0.11, 0.05, shape='ovate', nu=5, nv=7, fold=0.4)
        G['calyx'].add(put(V @ pframe(th, math.radians(60)).T + at(0.02, th, -0.03)), Q, [], UV)
    V, Q, T, UV = ellipsoid((0, 0, -0.03), (0.04, 0.04, 0.045), nu=8, nv=5)
    G['calyx'].add(put(V), Q, T, UV)


def bud(G, rng, origin, axis, size=1.0, open_=0.0):
    Rm = frame_from(axis)
    put = lambda V: place(np.asarray(V) * size, Rm, origin)
    V, Q, T, UV = ellipsoid((0, 0, 0.08), (0.05, 0.05, 0.1 + 0.04 * open_), nu=14, nv=10)
    h = np.clip((V[:, 2] - 0.08) / 0.1, -1, 1)
    ph = np.arctan2(V[:, 1], V[:, 0])
    k = (1 - 0.35 * np.clip(h, 0, 1) ** 1.5) * (1 + 0.05 * np.cos(5 * ph + 3 * h))   # 顶上收尖、拧着的五道
    V[:, 0] *= k; V[:, 1] *= k
    G['bud'].add(put(V), Q, T, UV)
    for k_ in range(5):
        th = 2 * np.pi * k_ / 5
        V, Q, UV = F.leaf_blade(rng, 0.1, 0.045, shape='ovate', nu=5, nv=7, fold=0.4, droop=-0.1)
        G['calyx'].add(put(V @ pframe(th, math.radians(22)).T + at(0.03, th, 0.0)), Q, [], UV)


def leaf(G, rng, p, d, size=1.0, up=(0, 0, 1)):
    d = norm(d); x = norm(np.cross(d, up)); z = np.cross(x, d)
    R = np.stack([x, d, z], 1) * size
    rand = rng.random()
    V, Q, UV = F.leaf_blade(rng, 0.4, 0.24, shape='ovate', nu=11, nv=22, serr=0.22, teeth=8, fold=0.2, droop=0.12, tip=0.75, petiole=0.05)
    G['leaf'].add(place(V, R, p), Q, [], UV, rand=rand)
    for sgn in (1, -1):     # 两片小侧裂
        V, Q, UV = F.leaf_blade(rng, 0.18, 0.1, shape='ovate', nu=7, nv=12, serr=0.2, teeth=5, fold=0.2, droop=0.08, tip=0.8)
        V = V @ rot((0, 0, 1), sgn * 0.75).T + [0, 0.12, -0.003]
        G['leaf'].add(place(V, R, p), Q, [], UV, rand=rand)
    V, Q, T, UV = tube(np.array([p, p + d * 0.06 * size]), 0.006, sides=5, cap=False)
    G['bark'].add(V, Q, T, UV, young=1.0)


def branch(G, rng, p0, p1, face=(0, -1, 0), size=1.0, flowers=(0.62, 0.9), buds=(0.45, 0.78, 1.0), leaves=6, bend=(0, 0, 0)):
    P = F.curve(p0, p1, bend=bend, n=24)
    V, Q, T, UV = tube(P, np.linspace(0.026, 0.012, len(P)), sides=8, cap=True)
    G['bark'].add(V, Q, T, UV, young=0.4)
    fa = np.asarray(face, float)
    sgn = 1
    for s in flowers:
        (p, Tt), = F.points_along(P, [s])
        o = norm(np.cross(Tt, (0, 1, 0))) * sgn; sgn = -sgn
        ax = norm(o * 0.6 + 0.4 * Tt + 1.1 * fa)
        q = p + o * 0.05
        V, Q, T, UV = tube(np.array([p, q]), 0.008, sides=5, cap=False)
        G['bark'].add(V, Q, T, UV, young=1.0)
        flower(G, rng, q + ax * 0.03, ax, size=size)
    for s in buds:
        (p, Tt), = F.points_along(P, [min(s, 0.999)])
        o = norm(np.cross(Tt, rng.normal(0, 1, 3)))
        ax = norm(o * 0.5 + Tt + 0.4 * fa) if s < 1 else Tt
        bud(G, rng, p + o * 0.02, ax, size=size * 0.9)
    sg = 1
    for s in np.linspace(0.12, 0.9, leaves):
        (p, Tt), = F.points_along(P, [s])
        o = norm(np.cross(Tt, (0, 1, 0))) * sg; sg = -sg
        leaf(G, rng, p, norm(o + 0.6 * Tt + 0.3 * fa), size=size, up=norm(np.array([0, 0, 1.0]) + 0.5 * fa))
    return P


def specimen(G, rng):
    branch(G, rng, (0.1, 0.15, -1.0), (0.0, 0.0, 0.45), face=(0, -1, 0.1), flowers=(0.7,), buds=(0.5, 1.0), leaves=4)
    return (0.0, 0, -0.1), 1.8
