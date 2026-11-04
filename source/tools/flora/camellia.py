# 茶花：重瓣，花瓣厚润整齐、层层围拢，颜色浓丽；叶子浓绿发亮；一朵开在枝头，旁边一个花苞
import math
import numpy as np
import kit
from kit import MB, tube, ellipsoid, frame_from, place, norm, rot, srgb
import flora as F
from flora import pframe, at

GOLD = math.radians(137.508)


def mats():
    M = {}
    M['petal'] = F.petal_mat('camellia_petal', [(0.0, srgb(104, 6, 30)), (0.35, srgb(152, 12, 42)), (1.0, srgb(172, 20, 50))],
                             trans=0.2, rough=0.3, sheen=0.15, veins=(36.0, 6.0), vein_str=0.05, rand_v=0.14, trans_v=1.3, spec=0.5)
    M['bud'] = F.ramp_mat('camellia_bud', [(0.0, srgb(80, 98, 52)), (0.7, srgb(96, 96, 54)), (0.9, srgb(150, 40, 48)), (1.0, srgb(170, 26, 44))], 0.4)
    M['leaf'] = F.leaf_mat('camellia_leaf', top=srgb(30, 62, 36), mid=srgb(40, 70, 40), under=srgb(86, 116, 70),
                           trans=0.08, rough=0.4, gloss=0.15, rand_v=0.15, veins=(30.0, 3.0))
    M['bark'] = F.bark_mat('camellia_bark', dark=(70, 62, 54), mid=(98, 90, 78), light=(128, 120, 106), young=(92, 96, 60))
    M['sepal'] = F.plain('camellia_sepal', (92, 100, 60), 0.5)
    return M


def garden():
    return {k: MB() for k in ('petal', 'bud', 'leaf', 'bark', 'sepal')}


def build(G, M, prefix='camellia'):
    return F.build_all(G, M, prefix)


def bloom(G, rng, origin, axis, size=1.0, n=62):
    Rm = frame_from(axis)
    put = lambda V: place(np.asarray(V) * size, Rm, origin)
    off = rng.uniform(0, 6.3)
    for i in range(n):
        f = i / (n - 1)                      # 0 最外 → 1 最里
        th = off + i * GOLD
        tilt = 88 - 64 * f ** 0.85           # 外面平摊，里面一层层立起来，正中间还微微合着
        L = 0.36 - 0.27 * f ** 0.85
        V, Q, UV = F.round_petal(rng, L * rng.uniform(0.96, 1.03), L * 1.18, cup=0.25 + 1.1 * f,
                                 curl=0.02 + 0.12 * f, wave=0.004, nu=13, nv=12, claw=0.42, notch=0.035)
        b = at(0.05 * (1 - f) + 0.01, th, 0.09 * f ** 1.3)
        G['petal'].add(put(V @ pframe(th, math.radians(tilt + rng.normal(0, 1.5))).T + b), Q, [], UV, rand=rng.random())
    # 托在下面的几片萼片
    for k in range(5):
        th = off + 2 * np.pi * k / 5
        V, Q, UV = F.round_petal(rng, 0.07, 0.07, cup=1.2, nu=7, nv=7)
        G['sepal'].add(put(V @ pframe(th, math.radians(110)).T + at(0.04, th, -0.02)), Q, [], UV)


def bud(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis)
    put = lambda V: place(np.asarray(V) * size, Rm, origin)
    V, Q, T, UV = ellipsoid((0, 0, 0.07), (0.07, 0.07, 0.085), nu=14, nv=9)
    G['bud'].add(put(V), Q, T, UV)
    off = rng.uniform(0, 6.3)
    for k in range(5):
        th = off + 2 * np.pi * k / 5
        V, Q, UV = F.round_petal(rng, 0.06, 0.06, cup=2.0, nu=7, nv=7)
        G['sepal'].add(put(V @ pframe(th, math.radians(35)).T + at(0.02, th, 0.0)), Q, [], UV)


def leaf(G, rng, p, d, size=1.0, up=(0, 0, 1)):
    V, Q, UV = F.leaf_blade(rng, rng.uniform(0.46, 0.58) * size, 0.24 * size, shape='elliptic', nu=11, nv=24,
                            serr=0.05, teeth=22, fold=0.18, droop=0.1, tip=0.8, petiole=0.04)
    d = norm(d); x = norm(np.cross(d, up)); z = np.cross(x, d)
    G['leaf'].add(place(V, np.stack([x, d, z], 1), p), Q, [], UV, rand=rng.random())
    V, Q, T, UV = tube(np.array([p, p + d * 0.045]), 0.008, sides=5, cap=False)
    G['bark'].add(V, Q, T, UV, young=1.0)


def branch(G, rng, p0, p1, face=(0, -1, 0), size=1.0, bud_at=0.7, leaves=6, bend=(0, 0, 0)):
    """一根短枝：枝头一朵（朝 face），叶子互生，枝上一个花苞。"""
    P = F.curve(p0, p1, bend=bend, n=20)
    R = np.linspace(0.03, 0.02, len(P)) * size
    nk = kit.neck(P, R); P = nk.P     # 从瓶口正经出来；瓶口以下不挂叶子
    V, Q, T, UV = tube(P, R, sides=8, cap=True)
    G['bark'].add(V, Q, T, UV, young=0.5)
    (pe, Te), = F.points_along(P, [1.0])
    ax = norm(Te + 1.2 * np.asarray(face, float))
    bloom(G, rng, pe + ax * 0.02, ax, size=size)
    sgn = 1
    for s in np.linspace(0.35, 0.92, leaves):
        (p, Tt), = F.points_along(P, [s])
        o = norm(np.cross(Tt, (0, 1, 0))) * sgn; sgn = -sgn
        d = norm(o + 0.6 * Tt + 0.3 * np.asarray(face, float))
        leaf(G if nk.ok(s) else kit.SINK, rng, p, d, size=size, up=norm(np.array([0, 0, 1.0]) + 0.6 * np.asarray(face, float)))
    if bud_at:
        (p, Tt), = F.points_along(P, [nk.up(bud_at)])
        o = norm(np.cross(Tt, (0, 1, 0)))
        bud(G, rng, p + o * 0.03, norm(o + Tt + 0.5 * np.asarray(face, float)), size=size)
    return P


def specimen(G, rng):
    branch(G, rng, (0.25, 0.25, -1.0), (0.0, 0.0, 0.05), face=(-0.3, -1, 0.3), leaves=5)
    return (0.0, 0, -0.15), 1.9
