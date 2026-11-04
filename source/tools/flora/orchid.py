# 芷兰：修长的叶片一丛，抽出花茎，数朵清雅小花（淡黄绿，唇瓣白里带红点）
import math
import numpy as np
import kit
from kit import MB, tube, ellipsoid, frame_from, place, norm, rot, srgb
import flora as F

SCALE = 2.4


def mats():
    M = {}
    M['tepal'] = F.petal_mat('orchid_tepal', [(0.0, srgb(160, 180, 96)), (0.4, srgb(198, 208, 130)), (1.0, srgb(214, 218, 150))],
                             trans=0.4, rough=0.4, sheen=0.2, veins=(50.0, 4.0), vein_str=0.06, rand_v=0.08)
    M['lip'] = F.petal_mat('orchid_lip', [(0.0, srgb(226, 222, 186)), (1.0, srgb(244, 240, 222))],
                           trans=0.3, rough=0.45, sheen=0.2, veins=None,
                           spots=(srgb(150, 36, 64), 26.0, 0.56, (0.25, 0.8), None))
    M['column'] = F.plain('orchid_column', (220, 222, 170), 0.5)
    M['leaf'] = F.leaf_mat('orchid_leaf', top=srgb(40, 70, 40), mid=srgb(54, 82, 46), under=srgb(76, 102, 62),
                           trans=0.12, rough=0.55, gloss=0.0, rand_v=0.15, veins=(60.0, 3.0))
    M['scape'] = F.ramp_mat('orchid_scape', [(0.0, srgb(120, 128, 84)), (0.7, srgb(150, 160, 110)), (1.0, srgb(160, 150, 112))], 0.5)
    M['bract'] = F.plain('orchid_bract', (150, 120, 90), 0.6)
    return M


def garden():
    return {k: MB() for k in ('tepal', 'lip', 'column', 'leaf', 'scape', 'bract')}


def build(G, M, prefix='orchid'):
    return F.build_all(G, M, prefix)


def _part(V, theta, fwd):
    return V @ (rot((0, 0, 1), theta) @ rot((1, 0, 0), fwd)).T


def flower(G, rng, origin, axis, size=1.0):
    Rm = frame_from(axis) @ rot((0, 0, 1), rng.normal(0, 0.12))
    put = lambda V: place(np.asarray(V) * size * SCALE, Rm, origin)
    rand = rng.random()
    # 三枚萼片：一枚朝上，两枚朝左下、右下
    for th, L in ((0.0, 0.16), (math.radians(118), 0.15), (math.radians(-118), 0.15)):
        V, Q, UV = F.leaf_blade(rng, L * rng.uniform(0.92, 1.06), 0.042, shape='elliptic', nu=7, nv=12, fold=0.15, droop=-0.08, tip=0.7)
        G['tepal'].add(put(_part(V, th + rng.normal(0, 0.06), math.radians(18))), Q, [], UV, rand=rand)
    # 两枚花瓣：短一些，往前合抱着蕊柱
    for th in (math.radians(38), math.radians(-38)):
        V, Q, UV = F.leaf_blade(rng, 0.11, 0.04, shape='elliptic', nu=7, nv=10, fold=0.2, droop=-0.2, tip=0.7)
        G['tepal'].add(put(_part(V, th, math.radians(42)) + [0, 0, 0.004]), Q, [], UV, rand=rand)
    # 唇瓣：朝下伸出来再往外翻卷
    V, Q, UV = F.round_petal(rng, 0.085, 0.07, cup=0.9, curl=-0.55, wave=0.04, nu=9, nv=10)
    G['lip'].add(put(_part(V, math.pi, math.radians(55)) + [0, -0.004, 0.012]), Q, [], UV, rand=rand)
    # 蕊柱
    P = np.array([[0, 0, 0.0], [0, 0.012, 0.03], [0, 0.02, 0.055]])
    V, Q, T, UV = tube(P, [0.008, 0.008, 0.007], sides=6, cap=True)
    G['column'].add(put(V), Q, T, UV)
    V, Q, T, UV = ellipsoid((0, 0, -0.01), (0.008, 0.008, 0.016), nu=6, nv=4)
    G['column'].add(put(V), Q, T, UV)


def scape(G, rng, p0, p1, bend=(0, 0, 0), n_flowers=5, face=(0, -1, 0), size=1.0):
    P = F.curve(p0, p1, bend=bend, n=24)
    R = np.linspace(0.018, 0.011, len(P))
    nk = kit.neck(P, R); P = nk.P     # 从瓶口正经出来；苞片、花都在瓶口以上
    V, Q, T, UV = tube(P, R, sides=7, cap=True)
    G['scape'].add(V, Q, T, UV)
    # 花茎下半截一两片苞片
    for s in (0.22, 0.42):
        (p, Tt), = F.points_along(P, [s])
        V, Q, UV = F.leaf_blade(rng, 0.12, 0.05, shape='lanceolate', nu=5, nv=6, fold=0.6, droop=-0.1)
        x = norm(np.cross(Tt, (0, -1, 0.2))); z = np.cross(x, Tt)
        (G if nk.ok(s) else kit.SINK)['bract'].add(place(V, np.stack([x, Tt, z], 1), p), Q, [], UV)
    ss = nk.spread(np.linspace(0.5, 0.97, n_flowers))
    sgn = 1
    for s in ss:
        (p, Tt), = F.points_along(P, [s])
        side = norm(np.cross(Tt, (0, 1, 0))) * sgn; sgn = -sgn
        out = norm(side + 1.6 * np.asarray(face, float) + 0.1 * Tt)
        q = p + out * 0.06 * size
        V, Q, T, UV = tube(np.array([p, p + out * 0.03 * size + Tt * 0.01, q]), 0.006, sides=5, cap=False)
        G['scape'].add(V, Q, T, UV)
        V, Q, UV = F.leaf_blade(rng, 0.05, 0.025, shape='lanceolate', nu=5, nv=5, fold=0.6)
        x = norm(np.cross(out, Tt)); z = np.cross(x, out)
        G['bract'].add(place(V, np.stack([x, norm(out + Tt), z], 1), p), Q, [], UV)
        flower(G, rng, q, norm(out + 0.8 * np.asarray(face, float) + np.array([0, 0, 0.15])), size=size * rng.uniform(0.94, 1.04))
    return P


def leaves(G, rng, base, n=8, L=(2.2, 3.2), W=(0.07, 0.095), lean=(0, 0, 0), spread=1.0, face_az=-math.pi / 2):
    """一丛叶：从 base 发出来，往四面拱下去（朝镜头的那面多一些）。"""
    base = np.asarray(base, float)
    for i in range(n):
        az = face_az + spread * rng.uniform(-2.2, 2.2)
        arch = rng.uniform(0.3, 0.75)
        V, Q, UV = F.strap(rng, rng.uniform(*L), rng.uniform(*W), arch=arch, twist=rng.uniform(-1.2, 1.2), n=44, nu=5)
        R = rot((0, 0, 1), az) @ rot((0, 1, 0), rng.uniform(-0.12, 0.12))
        G['leaf'].add(place(V, R, base + rng.normal(0, 0.01, 3)), Q, [], UV, rand=rng.random())


def specimen(G, rng):
    leaves(G, rng, (0, 0, -1.2), n=7, L=(1.8, 2.4))
    scape(G, rng, (0.02, 0, -1.2), (0.15, -0.05, 0.75), bend=(0.1, 0, 0), n_flowers=4)
    return (0.1, 0, 0.1), 2.4
