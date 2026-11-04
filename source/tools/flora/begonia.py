# 西府海棠：粉白相间的花压满枝头，花梗细长、花微微垂首；花苞深粉红；新叶带一点红
import math
import numpy as np
import kit
from kit import MB, tube, ellipsoid, frame_from, place, norm, rot, srgb
import flora as F
from flora import pframe, at

SCALE = 1.4


def mats():
    M = {}
    # 花瓣里面粉白，外面（背面）和瓣边粉一些
    M['petal'] = F.petal_mat('begonia_petal',
                             [(0.0, srgb(244, 222, 222)), (0.3, srgb(252, 246, 244)), (0.85, srgb(250, 236, 236)), (1.0, srgb(242, 200, 210))],
                             back=[(0.0, srgb(222, 120, 150)), (0.6, srgb(236, 160, 182)), (1.0, srgb(230, 140, 168))],
                             back_amt=0.75, trans=0.32, trans_v=1.1, rand_v=0.2, rough=0.42, sheen=0.25, veins=(30.0, 5.0), vein_str=0.05)
    M['bud'] = F.petal_mat('begonia_bud', [(0.0, srgb(178, 52, 84)), (1.0, srgb(206, 72, 104))], trans=0.2, rough=0.45, sheen=0.2, veins=None)
    M['sepal'] = F.plain('begonia_sepal', (118, 64, 62), 0.5)
    M['pedicel'] = F.ramp_mat('begonia_pedicel', [(0.0, srgb(112, 84, 64)), (1.0, srgb(132, 62, 70))], 0.5)
    M['anther'] = F.plain('begonia_anther', (226, 186, 70), 0.6)
    M['filament'] = F.plain('begonia_filament', (240, 226, 214), 0.6)
    M['leaf'] = F.leaf_mat('begonia_leaf', top=srgb(70, 104, 50), mid=srgb(96, 110, 52), under=srgb(118, 138, 92),
                           edge=srgb(140, 70, 60), edge_amt=0.45, trans=0.22, rough=0.5)
    M['bark'] = F.bark_mat('begonia_bark', dark=(58, 40, 38), mid=(84, 60, 54), light=(112, 92, 84), young=(110, 66, 56))
    return M


def garden():
    return {k: MB() for k in ('petal', 'bud', 'sepal', 'pedicel', 'anther', 'filament', 'leaf', 'bark')}


def build(G, M, prefix='begonia'):
    return F.build_all(G, M, prefix)


def flower(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis) @ rot((0, 0, 1), rng.uniform(0, 6.3))
    put = lambda V: place(np.asarray(V) * size * SCALE, Rm, origin)
    off = rng.uniform(0, 6.3); rand = rng.random()
    for k in range(5):
        th = off + 2 * np.pi * k / 5 + rng.normal(0, 0.07)
        L = 0.12 * rng.uniform(0.92, 1.08)
        V, Q, UV = F.round_petal(rng, L, L * 0.86, cup=0.9 + rng.uniform(-0.2, 0.3), wave=0.03, nu=11, nv=12)
        G['petal'].add(put(V @ pframe(th, math.radians(58 + rng.normal(0, 6))).T + at(0.012, th, 0.006)), Q, [], UV, rand=rand)
    for k in range(5):
        th = off + 2 * np.pi * (k + 0.5) / 5
        V, Q, UV = F.round_petal(rng, 0.04, 0.03, cup=0.5, nu=7, nv=7, point=0.8)
        G['sepal'].add(put(V @ pframe(th, math.radians(96)).T + at(0.011, th, -0.002)), Q, [], UV)
    V, Q, T, UV = ellipsoid((0, 0, -0.014), (0.016, 0.016, 0.02), nu=8, nv=5)
    G['sepal'].add(put(V), Q, T, UV)
    for k in range(22):
        th = rng.uniform(0, 2 * np.pi); r = rng.uniform(0.004, 0.01); a = math.radians(rng.uniform(10, 40))
        d = np.array([math.sin(a) * math.cos(th), math.sin(a) * math.sin(th), math.cos(a)])
        pts = at(r, th, 0.006) + np.outer(np.linspace(0, rng.uniform(0.045, 0.06), 3), d)
        V, Q, T, UV = tube(pts, 0.0016, sides=4, cap=False)
        G['filament'].add(put(V), Q, T, UV)
        V, Q, T, UV = ellipsoid(pts[-1] + d * 0.003, (0.0045, 0.0045, 0.004), frame_from(d), nu=5, nv=4)
        G['anther'].add(put(V), Q, T, UV)


def bud(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis)
    put = lambda V: place(np.asarray(V) * size * SCALE, Rm, origin)
    s = rng.uniform(0.8, 1.05)
    V, Q, T, UV = ellipsoid((0, 0, 0.028 * s), (0.024 * s, 0.024 * s, 0.032 * s), nu=16, nv=9)
    ph = np.arctan2(V[:, 1], V[:, 0]); h = (V[:, 2] - 0.028 * s) / (0.032 * s)
    k = 1 + 0.06 * np.cos(5 * ph + rng.uniform(0, 6)) * np.clip(h + 0.3, 0, 1)
    V[:, 0] *= k; V[:, 1] *= k
    G['bud'].add(put(V), Q, T, UV)
    off = rng.uniform(0, 6.3)
    for k in range(5):
        th = off + 2 * np.pi * k / 5
        V, Q, UV = F.round_petal(rng, 0.03 * s, 0.026 * s, cup=1.8, nu=7, nv=7, point=0.8)
        G['sepal'].add(put(V @ pframe(th, math.radians(40)).T + at(0.008, th, -0.004)), Q, [], UV)


def cluster(G, rng, p, T, face=(0, -1, 0), n=(4, 7), size=1.0, leaves=2):
    """一个短枝上的一簇：四到七根细长的花梗，花朵微微垂首，开的和苞间杂。"""
    k = rng.integers(n[0], n[1] + 1)
    up = np.array([0, 0, 1.0])
    for i in range(k):
        ax0, o = F.side_dir(T, rng, face=face, bias=0.5, up=0.6)
        Lp = rng.uniform(0.18, 0.3) * size
        tip = p + ax0 * Lp + np.array([0, 0, -0.06 * Lp / 0.25])
        P = F.curve(p, tip, bend=up * 0.04 * size, n=8)
        V, Q, Tt, UV = tube(P, np.linspace(0.006, 0.004, 8), sides=5, cap=False)
        G['pedicel'].add(V, Q, Tt, UV)
        hang = norm(ax0 + np.array([0, 0, -0.55]))       # 花头微微垂下
        if rng.random() < 0.38:
            bud(G, rng, tip, norm(ax0 + np.array([0, 0, -0.1])), size=size)
        else:
            flower(G, rng, tip, norm(hang + 0.35 * np.asarray(face, float)), size=size * rng.uniform(0.92, 1.06))
    for i in range(leaves):
        d, o = F.side_dir(T, rng, face=face, bias=0.2, up=0.2)
        V, Q, UV = F.leaf_blade(rng, rng.uniform(0.32, 0.42) * size, 0.15 * size, shape='elliptic', serr=0.12, teeth=14,
                                fold=0.25, droop=0.12, petiole=0.03)
        x = norm(np.cross(d, up)); z = np.cross(x, d)
        R = np.stack([x, d, z], 1)
        G['leaf'].add(place(V, R, p), Q, [], UV, rand=rng.random())


def branch(G, rng, p0, d0, L, r0=0.035, face=(0, -1, 0), every=(0.16, 0.26), size=1.0, side=(0, 1, 0)):
    from plum import path, radii
    P, nn = path(rng, p0, d0, L, step=0.04, node=0.3, kink=(8, 18), side=side, lift=0.01)
    R = radii(P, r0, 0.008, nn, knot=0.1)
    nk = kit.neck(P, R, woody=True); P = nk.P     # 从瓶口正经出来；瓶口以下不开花
    V, Q, T, UV = tube(P, R, sides=9, cap=True)
    G['bark'].add(V, Q, T, UV, young=0.4)
    s = 0.22
    while s < 0.97:
        (p, Tt), = F.points_along(P, [s])
        cluster(G if nk.ok(s) else kit.SINK, rng, p, Tt, face=face, size=size)
        s += rng.uniform(*every) / L * 1.0
    return P, R


def specimen(G, rng):
    branch(G, rng, (-0.6, 0.0, -0.1), (1.0, 0.0, 0.35), 1.3, r0=0.03, every=(0.2, 0.28))
    return (0.05, 0, 0.15), 1.25
