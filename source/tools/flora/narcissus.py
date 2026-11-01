# 水仙：青叶之间，细长花茎托起数朵洁白小花，白瓣清透，中央一点金黄（金盏银台）
import math
import numpy as np
from kit import MB, tube, ellipsoid, frame_from, place, norm, rot, srgb
import flora as F
from flora import pframe, at

SCALE = 1.6


def mats():
    M = {}
    M['tepal'] = F.petal_mat('narcissus_tepal', [(0.0, srgb(222, 228, 196)), (0.2, srgb(246, 246, 236)), (1.0, srgb(250, 250, 244))],
                             trans=0.45, rough=0.38, sheen=0.3, veins=(40.0, 5.0), vein_str=0.05, rand_v=0.05, trans_v=0.95)
    M['corona'] = F.petal_mat('narcissus_corona', [(0.0, srgb(226, 170, 40)), (0.8, srgb(240, 190, 52)), (1.0, srgb(236, 160, 36))],
                              trans=0.3, rough=0.45, sheen=0.2, veins=None, rand_v=0.08)
    M['tube'] = F.plain('narcissus_tube', (176, 196, 150), 0.5)
    M['spathe'] = F.petal_mat('narcissus_spathe', [(0.0, srgb(176, 166, 120)), (1.0, srgb(200, 184, 140))], trans=0.5, rough=0.6, sheen=0.1, veins=None)
    M['leaf'] = F.leaf_mat('narcissus_leaf', top=srgb(70, 110, 84), mid=srgb(80, 118, 88), under=srgb(96, 128, 100),
                           trans=0.15, rough=0.45, gloss=0.1, rand_v=0.12, veins=(50.0, 2.0))
    M['scape'] = F.plain('narcissus_scape', (84, 124, 86), 0.45)
    return M


def garden():
    return {k: MB() for k in ('tepal', 'corona', 'tube', 'spathe', 'leaf', 'scape')}


def build(G, M, prefix='narcissus'):
    return F.build_all(G, M, prefix)


def flower(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis) @ rot((0, 0, 1), rng.uniform(0, 6.3))
    put = lambda V: place(np.asarray(V) * size * SCALE, Rm, origin)
    rand = rng.random()
    for k in range(6):
        th = 2 * np.pi * k / 6 + rng.normal(0, 0.04)
        L = (0.125 if k % 2 == 0 else 0.115) * rng.uniform(0.95, 1.05)
        V, Q, UV = F.round_petal(rng, L, L * (0.78 if k % 2 == 0 else 0.7), cup=0.25, curl=-0.03, wave=0.01, nu=9, nv=10, claw=0.3, point=1.0)
        G['tepal'].add(put(V @ pframe(th, math.radians(84 + rng.normal(0, 3))).T + at(0.012, th, 0.002 * (k % 2))), Q, [], UV, rand=rand)
    V, Q, UV = F.cup(rng, 0.024, 0.04, 0.04, frill=0.18, k=14)
    G['corona'].add(put(V + [0, 0, 0.002]), Q, [], UV, rand=rand)
    V, Q, T, UV = tube(np.array([[0, 0, -0.09], [0, 0, -0.04], [0, 0, 0.0]]), [0.008, 0.01, 0.014], sides=7, cap=False)
    G['tube'].add(put(V), Q, T, UV)


def stalk(G, rng, p0, p1, face=(0, -1, 0), n=(4, 7), size=1.0, bend=(0, 0, 0), leaves=3, leaf_len=(1.1, 1.7)):
    """一根花葶：顶上一个膜质的苞，伞形地垂下几根花梗，各托一朵；底下几片带状的叶。"""
    P = F.curve(p0, p1, bend=bend, n=20)
    V, Q, T, UV = tube(P, np.linspace(0.022, 0.018, len(P)), sides=8, cap=True)
    G['scape'].add(V, Q, T, UV)
    (pe, Te), = F.points_along(P, [1.0])
    V, Q, UV = F.leaf_blade(rng, 0.16, 0.06, shape='lanceolate', nu=5, nv=8, fold=0.5, droop=-0.05)
    x = norm(np.cross(Te, (0, 1, 0))); z = np.cross(x, Te)
    G['spathe'].add(place(V, np.stack([x, norm(Te + 0.3 * x), z], 1), pe - Te * 0.02), Q, [], UV)
    fa = np.asarray(face, float)
    k = rng.integers(n[0], n[1] + 1)
    for i in range(k):
        th = 2 * np.pi * i / k + rng.normal(0, 0.3)
        o = norm(math.cos(th) * x + math.sin(th) * np.cross(Te, x))
        d = norm(o + 0.35 * Te + 0.4 * fa)
        L = rng.uniform(0.12, 0.26) * size
        q = pe + d * L - Te * 0.05 * L / 0.2
        Pp = F.curve(pe, q, bend=Te * 0.04, n=8)
        V, Q, T, UV = tube(Pp, 0.006, sides=5, cap=False)
        G['scape'].add(V, Q, T, UV)
        ax = norm(d + 0.9 * fa - 0.25 * Te)
        flower(G, rng, q + ax * 0.12 * size * SCALE * 0.75, ax, size=size * rng.uniform(0.92, 1.05))
    base = np.asarray(p0, float)
    for i in range(leaves):
        az = math.atan2(fa[1], fa[0]) + rng.uniform(-1.6, 1.6)
        V, Q, UV = F.strap(rng, rng.uniform(*leaf_len), rng.uniform(0.08, 0.1), arch=rng.uniform(0.1, 0.35), twist=rng.uniform(-0.8, 0.8), n=36, nu=5)
        R = rot((0, 0, 1), az)
        G['leaf'].add(place(V, R, base + rng.normal(0, 0.01, 3)), Q, [], UV, rand=rng.random())
    return P


def specimen(G, rng):
    stalk(G, rng, (0.0, 0.05, -1.1), (0.05, 0.0, 0.25), face=(0, -1, 0.15), leaves=4, leaf_len=(1.1, 1.5))
    return (0.0, 0, -0.2), 1.8
