# 映山红：鲜红的漏斗形花，枝头两三朵一簇；上面那片裂瓣有深红的斑点；长长的雄蕊翘出来；小叶簇生在枝梢
import math
import numpy as np
from kit import MB, tube, ellipsoid, frame_from, place, norm, rot, srgb
import flora as F
from flora import pframe, at

SCALE = 1.25


def mats():
    M = {}
    # funnel 的 UV：x 绕一圈（上面那片裂瓣在 0.25 附近），y 从花管到瓣边
    M['corolla'] = F.petal_mat('azalea_corolla', [(0.0, srgb(150, 8, 32)), (0.35, srgb(196, 14, 44)), (1.0, srgb(206, 22, 52))],
                               trans=0.35, rough=0.45, sheen=0.3, veins=(6.0, 40.0), vein_str=0.05, axis='Y',
                               spots=(srgb(120, 8, 26), 60.0, 0.6, (0.3, 0.72), (0.42, 0.58)), trans_v=1.15)
    M['filament'] = F.plain('azalea_filament', (214, 50, 62), 0.5)
    M['anther'] = F.plain('azalea_anther', (90, 40, 40), 0.6)
    M['calyx'] = F.plain('azalea_calyx', (96, 108, 60), 0.6, sheen=0.4)
    M['leaf'] = F.leaf_mat('azalea_leaf', top=srgb(56, 84, 44), mid=srgb(70, 92, 48), under=srgb(104, 120, 80),
                           trans=0.16, rough=0.6, rand_v=0.2, veins=(30.0, 4.0))
    M['bark'] = F.bark_mat('azalea_bark', dark=(62, 46, 38), mid=(88, 68, 56), light=(118, 100, 84), young=(104, 80, 58))
    return M


def garden():
    return {k: MB() for k in ('corolla', 'filament', 'anther', 'calyx', 'leaf', 'bark')}


def build(G, M, prefix='azalea'):
    return F.build_all(G, M, prefix)


def flower(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis) @ rot((0, 0, 1), rng.normal(0, 0.15))
    put = lambda V: place(np.asarray(V) * size * SCALE, Rm, origin)
    V, Q, UV = F.funnel(rng, 0.2, 0.2, r0=0.024, lobes=5, inc=0.42, flare=1.5, reflex=0.12, phase=math.pi, nphi=90, ns=24, zpow=1.0)
    # 有斑的那片裂瓣在 phi=pi（uv.x=0.5），转到正上方（frame_from 的 +Y）
    V = V @ rot((0, 0, 1), -math.pi / 2).T
    G['corolla'].add(put(V), Q, [], UV, rand=rng.random())
    # 雄蕊、花柱：从花管底部伸出来，往上翘
    for k in range(7):
        a = rng.uniform(-0.6, 0.6)
        tip = np.array([math.sin(a) * 0.1, 0.07 + rng.uniform(-0.02, 0.03), 0.3 + rng.uniform(-0.04, 0.03)])
        P = F.curve((0, 0, 0.02), tip, bend=(0, -0.04, 0), n=8)
        V, Q, T, UV = tube(P, 0.0028, sides=4, cap=False)
        G['filament'].add(put(V), Q, T, UV)
        V, Q, T, UV = ellipsoid(P[-1], (0.007, 0.007, 0.01), nu=5, nv=4)
        G['anther'].add(put(V), Q, T, UV)
    P = F.curve((0, 0, 0.02), (0, 0.1, 0.36), bend=(0, -0.05, 0), n=8)
    V, Q, T, UV = tube(P, 0.003, sides=4, cap=True)
    G['filament'].add(put(V), Q, T, UV)
    V, Q, T, UV = ellipsoid((0, 0, 0.0), (0.03, 0.03, 0.025), nu=8, nv=5)
    G['calyx'].add(put(V), Q, T, UV)


def tip_cluster(G, rng, p, T, face=(0, -1, 0), n=(2, 3), size=1.0):
    k = rng.integers(n[0], n[1] + 1)
    for i in range(k):
        ax, o = F.side_dir(T, rng, face=face, bias=0.6, up=0.4)
        ax = norm(ax + 0.5 * T)
        flower(G, rng, p + ax * 0.02, ax, size=size * rng.uniform(0.92, 1.05))
    # 枝梢一圈小叶
    up = np.array([0, 0, 1.0])
    for i in range(rng.integers(5, 8)):
        th = 2 * np.pi * i / 6 + rng.normal(0, 0.2)
        x0 = norm(np.cross(T, up if abs(T[2]) < 0.9 else np.array([1.0, 0, 0]))); y0 = np.cross(T, x0)
        d = norm(math.cos(th) * x0 + math.sin(th) * y0 - 0.3 * T)
        V, Q, UV = F.leaf_blade(rng, rng.uniform(0.2, 0.28) * size, 0.09 * size, shape='elliptic', nu=7, nv=10, fold=0.25, droop=0.1)
        x = norm(np.cross(d, T)); z = np.cross(x, d)
        G['leaf'].add(place(V, np.stack([x, d, z], 1), p - T * 0.03), Q, [], UV, rand=rng.random())


def branch(G, rng, p0, d0, L, face=(0, -1, 0), size=1.0, forks=3, side=(0, 1, 0)):
    from plum import path, radii
    P, nn = path(rng, p0, d0, L, step=0.04, node=0.25, kink=(8, 20), side=side, lift=0.02)
    R = radii(P, 0.022, 0.009, nn, knot=0.12)
    V, Q, T, UV = tube(P, R, sides=8, cap=True)
    G['bark'].add(V, Q, T, UV, young=0.3)
    (pe, Te), = F.points_along(P, [1.0])
    tip_cluster(G, rng, pe, Te, face=face, size=size)
    for j in range(forks):
        s = rng.uniform(0.35, 0.85)
        (p, Tt), = F.points_along(P, [s])
        d = norm(Tt + norm(np.cross(Tt, rng.normal(0, 1, 3))) * 0.9 + np.array([0, 0, 0.3]))
        Pq, _ = path(rng, p, d, L * rng.uniform(0.3, 0.5), step=0.04, node=0, wander=0.02, lift=0.02)
        Rq = radii(Pq, 0.011, 0.007)
        V, Q, T, UV = tube(Pq, Rq, sides=6, cap=True)
        G['bark'].add(V, Q, T, UV, young=0.6)
        (pq, Tq), = F.points_along(Pq, [1.0])
        tip_cluster(G, rng, pq, Tq, face=face, size=size)
    return P


def specimen(G, rng):
    branch(G, rng, (0.0, 0.1, -0.9), (0.15, 0.0, 1.0), 1.1, forks=2)
    return (0.05, 0, 0.0), 1.7
