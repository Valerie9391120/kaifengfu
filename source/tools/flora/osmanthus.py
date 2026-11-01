# 金桂：革质的深绿叶对生，叶腋里一簇簇碎金似的小花（四裂，橙黄）
import math
import numpy as np
from kit import MB, tube, ellipsoid, frame_from, place, norm, rot, srgb
import flora as F
from flora import pframe, at

SCALE = 1.6


def mats():
    M = {}
    M['flower'] = F.petal_mat('osmanthus_flower', [(0.0, srgb(226, 140, 24)), (0.5, srgb(240, 168, 36)), (1.0, srgb(246, 186, 56))],
                              trans=0.3, rough=0.5, sheen=0.2, veins=None, rand_v=0.18, rand_h=0.02)
    M['pedicel'] = F.plain('osmanthus_pedicel', (150, 130, 70), 0.6)
    M['leaf'] = F.leaf_mat('osmanthus_leaf', top=srgb(36, 66, 40), mid=srgb(44, 72, 42), under=srgb(96, 120, 78),
                           trans=0.08, rough=0.45, gloss=0.1, rand_v=0.18, veins=(26.0, 3.0))
    M['bark'] = F.bark_mat('osmanthus_bark', dark=(86, 80, 70), mid=(112, 106, 94), light=(140, 134, 120), young=(110, 116, 76))
    return M


def garden():
    return {k: MB() for k in ('flower', 'pedicel', 'leaf', 'bark')}


def build(G, M, prefix='osmanthus'):
    return F.build_all(G, M, prefix)


def floret(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis) @ rot((0, 0, 1), rng.uniform(0, 6.3))
    put = lambda V: place(np.asarray(V) * size * SCALE, Rm, origin)
    rand = rng.random()
    for k in range(4):
        th = 2 * np.pi * k / 4 + rng.normal(0, 0.1)
        V, Q, UV = F.round_petal(rng, 0.03, 0.026, cup=0.7, nu=7, nv=7, claw=0.35)
        G['flower'].add(put(V @ pframe(th, math.radians(70 + rng.normal(0, 8))).T + at(0.004, th, 0.003)), Q, [], UV, rand=rand)
    V, Q, T, UV = ellipsoid((0, 0, 0.0), (0.008, 0.008, 0.009), nu=6, nv=4)
    G['flower'].add(put(V), Q, T, UV, rand=rand)


def fascicle(G, rng, p, dirs, face=(0, -1, 0), n=(7, 13), size=1.0):
    """叶腋里一簇：细细的花梗，十来朵挤在一起。"""
    k = rng.integers(n[0], n[1] + 1)
    for i in range(k):
        d = norm(dirs + rng.normal(0, 0.55, 3) + 0.5 * np.asarray(face, float))
        L = rng.uniform(0.04, 0.09) * size
        q = p + d * L
        V, Q, T, UV = tube(np.array([p, p + d * L * 0.5, q]), 0.0035, sides=4, cap=False)
        G['pedicel'].add(V, Q, T, UV)
        floret(G, rng, q, norm(d + 0.4 * np.asarray(face, float)), size=size * rng.uniform(0.85, 1.1))


def leaf(G, rng, p, d, size=1.0, up=(0, 0, 1)):
    V, Q, UV = F.leaf_blade(rng, rng.uniform(0.5, 0.64) * size, 0.2 * size, shape='elliptic', nu=9, nv=20,
                            serr=0.03, teeth=10, fold=0.22, droop=0.12, tip=0.8, petiole=0.05)
    d = norm(d); x = norm(np.cross(d, up)); z = np.cross(x, d)
    G['leaf'].add(place(V, np.stack([x, d, z], 1), p), Q, [], UV, rand=rng.random())
    V, Q, T, UV = tube(np.array([p, p + d * 0.055]), 0.007, sides=5, cap=False)
    G['bark'].add(V, Q, T, UV, young=1.0)


def branch(G, rng, p0, d0, L, face=(0, -1, 0), size=1.0, pairs=6, side=(0, 1, 0), bloom_from=0.15):
    """一枝：叶子一对一对交互对生，每对叶腋都开一簇。"""
    from plum import path, radii
    P, nn = path(rng, p0, d0, L, step=0.04, node=0.28, kink=(5, 12), side=side, lift=0.015)
    R = radii(P, 0.026, 0.01, nn, knot=0.08)
    V, Q, T, UV = tube(P, R, sides=8, cap=True)
    G['bark'].add(V, Q, T, UV, young=0.5)
    fa = np.asarray(face, float)
    for j, s in enumerate(np.linspace(0.18, 0.98, pairs)):
        (p, Tt), = F.points_along(P, [s])
        base = norm(np.cross(Tt, (0, 1, 0)))
        ang = (math.pi / 2) * (j % 2) + rng.normal(0, 0.2)
        o = norm(math.cos(ang) * base + math.sin(ang) * np.cross(Tt, base))
        for sgn in (1, -1):
            d = norm(sgn * o + 0.55 * Tt)
            leaf(G, rng, p, d, size=size, up=norm(np.array([0, 0, 1.0]) + 0.5 * fa))
            if s >= bloom_from and s < 0.95:
                fascicle(G, rng, p + d * 0.02, norm(sgn * o * 0.6 + Tt * 0.5), face=face, size=size)
    # 梢上一对小嫩叶
    (pe, Te), = F.points_along(P, [1.0])
    for sgn in (1, -1):
        o = norm(np.cross(Te, (0, 1, 0)))
        d = norm(sgn * o * 0.6 + Te)
        V, Q, UV = F.leaf_blade(rng, 0.3 * size, 0.1 * size, shape='elliptic', nu=7, nv=12, fold=0.35, droop=0.05)
        x = norm(np.cross(d, (0, 0, 1))); z = np.cross(x, d)
        G['leaf'].add(place(V, np.stack([x, d, z], 1), pe), Q, [], UV, rand=rng.random())
    return P


def specimen(G, rng):
    branch(G, rng, (-0.5, 0.05, -0.75), (0.45, 0.0, 1.0), 1.5, pairs=5)
    return (0.0, 0, 0.0), 1.8
