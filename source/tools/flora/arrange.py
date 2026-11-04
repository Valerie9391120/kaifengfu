# 十来瓶花：同一只月白瓶、同一套光和机位，只换瓶里插的花
# 用法：python arrange.py 编号 出图.png [宽 高 采样]
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math, numpy as np
import kit

which = sys.argv[1]
out = sys.argv[2]
W, H, SPP = (int(a) for a in (sys.argv[3:6] if len(sys.argv) > 5 else (800, 1370, 96)))

sc = kit.reset(samples=SPP, res=(W, H))
kit.world()
kit.lights(target=(0.1, 0, 2.8))
kit.shadow_floor(0.0, x=(-4, 4), y=(-1.2, 1.15))
kit.vase()
MZ = kit.MOUTH_Z
N = kit.norm
IN = lambda x, y=0.0: np.array([x, y, MZ - 0.55])     # 瓶里（插进去的那一头）
FACE = np.array([0, -1.0, 0])


def peony_parts(kind, seed):
    import peony
    G = peony.garden(); M = peony.mats(kind)
    return peony, G, M, np.random.default_rng(seed)


def peony_stem(peony, G, rng, base, head, ax, kind, size=1.0, spin=0.0, ctrl=None):
    rings = peony.RINGS_YLC if kind == 'yulouchun' else None
    peony.bloom(G, rng, head, ax, size=size, spin=spin, rings=rings, center=(kind == 'weizi'))
    c1, c2 = ctrl if ctrl is not None else ((base[0] * 0.6, base[1], MZ + 0.15), (head[0] * 0.5, head[1] * 0.5, (MZ + head[2]) / 2 + 0.1))
    peony.stem(G, peony.bezier(base, c1, c2, np.asarray(head) - ax * 0.07 * size), 0.034, 0.027)


# ---------------------------------------------------------------- 各瓶
def a2():
    """玉楼春 · 西府海棠：一朵白牡丹压在瓶口，一枝海棠往右上斜出去。"""
    import peony, begonia
    pe, G, M, rng = peony_parts('yulouchun', 21)
    o = np.array([-0.22, -0.45, MZ + 0.78]); ax = N((-0.3, -0.85, 0.45))
    peony_stem(pe, G, rng, IN(-0.05), o, ax, 'yulouchun', size=0.92, spin=0.3)
    pe.leaf(G, rng, (-0.1, -0.08, MZ + 0.12), (-0.85, -0.75, -0.05), up=(0, -0.6, 1), size=0.95)
    pe.leaf(G, rng, (0.1, -0.1, MZ + 0.1), (0.95, -0.7, -0.05), up=(0, -0.6, 1), size=1.05)
    pe.leaf(G, rng, (0.0, 0.12, MZ + 0.4), (0.1, 0.3, 1.0), up=(0, -1, 0.15), size=1.0)
    pe.build(G, M, prefix='yulouchun')
    BG = begonia.garden(); BM = begonia.mats(); r2 = np.random.default_rng(22)
    begonia.branch(BG, r2, IN(0.05, 0.08), (0.55, 0.05, 1.0), 3.3, r0=0.045, every=(0.17, 0.24))
    begonia.branch(BG, r2, IN(0.08, 0.1), (1.0, 0.05, 0.45), 2.2, r0=0.035, every=(0.18, 0.26))
    begonia.build(BG, BM)


def a3():
    """茶花 · 水仙：两枝茶花一高一低，水仙一丛从瓶口往右上立着。"""
    import camellia, narcissus
    G = camellia.garden(); M = camellia.mats(); rng = np.random.default_rng(31)
    camellia.branch(G, rng, IN(0.0), (0.5, -0.45, MZ + 0.72), face=(0.4, -1, 0.2), leaves=6, bend=(0.1, 0, 0.15), size=1.2)
    camellia.branch(G, rng, IN(-0.05, 0.05), (-0.5, -0.15, MZ + 1.5), face=(-0.3, -1, 0.3), leaves=5, bud_at=0.6, bend=(-0.1, 0, 0.1), size=1.05)
    camellia.branch(G, rng, IN(0.05, 0.08), (1.05, -0.05, MZ + 1.35), face=(0.6, -1, 0.25), leaves=4, bud_at=0, bend=(0.1, 0, 0.2), size=0.9)
    camellia.build(G, M)
    NG = narcissus.garden(); NM = narcissus.mats(); r2 = np.random.default_rng(32)
    narcissus.stalk(NG, r2, IN(0.08, 0.05), (0.75, 0.0, MZ + 2.6), face=(0.2, -1, 0.15), leaves=0, bend=(0.1, 0, 0))
    narcissus.stalk(NG, r2, IN(0.1, 0.1), (1.25, 0.05, MZ + 2.1), face=(0.4, -1, 0.1), leaves=0, bend=(0.15, 0, 0.1))
    narcissus.stalk(NG, r2, IN(0.05, 0.08), (0.2, 0.1, MZ + 3.05), face=(0, -1, 0.2), leaves=0)
    for (az, L, arch) in ((-0.3, 2.6, 0.25), (0.2, 2.9, 0.15), (-0.9, 2.2, 0.35), (0.6, 2.4, 0.3), (-1.4, 1.8, 0.5)):
        V, Q, UV = narcissus.F.strap(r2, L, 0.09, arch=arch, twist=r2.uniform(-0.8, 0.8), n=40, nu=5)
        NG['leaf'].add(kit.place(V, kit.rot((0, 0, 1), az), IN(0.06, 0.06)), Q, [], UV, rand=r2.random())
    narcissus.build(NG, NM)


def a4():
    """秋菊 · 金桂：三枝菊高低错落，一枝金桂横斜过去。"""
    import chrysanthemum as C, osmanthus as O
    G = C.garden(); M = C.mats(); rng = np.random.default_rng(41)
    C.stem(G, rng, IN(0.0), (0.35, -0.3, MZ + 1.25), face=(0.3, -1, 0.15), bend=(0.1, 0, 0), size=1.0, leaves=4)
    C.stem(G, rng, IN(-0.05), (-0.45, -0.2, MZ + 2.05), face=(-0.2, -1, 0.25), bend=(-0.1, 0, 0), size=0.85, leaves=4)
    C.stem(G, rng, IN(0.05), (0.95, -0.15, MZ + 2.35), face=(0.5, -1, 0.2), bend=(0.2, 0, 0.1), size=0.78, leaves=3)
    C.build(G, M)
    OG = O.garden(); OM = O.mats(); r2 = np.random.default_rng(42)
    O.branch(OG, r2, IN(0.05, 0.08), (1.0, 0.05, 0.5), 2.6, pairs=7, bloom_from=0.25)
    O.branch(OG, r2, IN(-0.05, 0.1), (-0.6, 0.1, 1.0), 1.4, pairs=4)
    O.build(OG, OM)


def a5():
    """月季 · 芷兰：一丛兰叶从瓶口拱出去，两枝月季一高一低，兰花一箭立在后面。"""
    import rose as R, orchid as Oc
    OG = Oc.garden(); OM = Oc.mats(); r2 = np.random.default_rng(52)
    Oc.leaves(OG, r2, IN(0.0, 0.05), n=9, L=(2.0, 3.0), W=(0.07, 0.09), face_az=-math.pi / 2 + 0.3, spread=0.9)
    Oc.scape(OG, r2, IN(0.05, 0.1), (0.85, 0.1, MZ + 3.0), bend=(0.15, 0, 0), n_flowers=5)
    Oc.build(OG, OM)
    G = R.garden(); M = R.mats(); rng = np.random.default_rng(51)
    R.stem(G, rng, IN(-0.05), (-0.35, -0.35, MZ + 1.0), face=(-0.3, -1, 0.2), bend=(-0.1, 0, 0), leaves=2)
    R.stem(G, rng, IN(0.05), (0.45, -0.2, MZ + 1.7), face=(0.3, -1, 0.15), bend=(0.1, 0, 0), leaves=2, with_bud=False)
    R.build(G, M)


def a6():
    """映山红 · 玉楼春：一枝映山红往右上开散，一朵玉楼春低低压在瓶口左边。"""
    import azalea as A
    pe, G, M, rng = peony_parts('yulouchun', 61)
    o = np.array([-0.08, -0.48, MZ + 0.72]); ax = N((-0.25, -0.85, 0.45))
    peony_stem(pe, G, rng, IN(-0.05), o, ax, 'yulouchun', size=0.88, spin=1.1)
    pe.leaf(G, rng, (-0.1, -0.08, MZ + 0.12), (-0.8, -0.8, -0.05), up=(0, -0.6, 1), size=0.9)
    pe.leaf(G, rng, (0.1, -0.1, MZ + 0.12), (0.95, -0.7, 0.0), up=(0, -0.6, 1), size=1.05)
    pe.build(G, M, prefix='yulouchun')
    AG = A.garden(); AM = A.mats(); r2 = np.random.default_rng(62)
    A.branch(AG, r2, IN(0.05, 0.05), (0.45, 0.0, 1.0), 2.9, forks=4)
    A.branch(AG, r2, IN(0.0, 0.08), (0.9, 0.05, 0.6), 2.0, forks=3)
    A.branch(AG, r2, IN(-0.05, 0.1), (-0.25, 0.1, 1.0), 2.2, forks=2)
    A.build(AG, AM)


def a7():
    """木槿 · 水仙：一枝木槿往右上，水仙一丛立在左边。"""
    import hibiscus as Hb, narcissus
    G = Hb.garden(); M = Hb.mats(); rng = np.random.default_rng(71)
    Hb.branch(G, rng, IN(0.05), (1.05, -0.1, MZ + 2.7), face=(0.2, -1, 0.1), flowers=(0.55, 0.82), buds=(0.4, 0.7, 1.0), leaves=7, bend=(-0.15, 0, 0.1))
    Hb.branch(G, rng, IN(0.0, 0.05), (0.75, -0.2, MZ + 1.25), face=(0.5, -1, 0.1), flowers=(0.85,), buds=(0.6, 1.0), leaves=4, bend=(0.1, 0, 0.15))
    Hb.build(G, M)
    NG = narcissus.garden(); NM = narcissus.mats(); r2 = np.random.default_rng(72)
    narcissus.stalk(NG, r2, IN(-0.05, 0.05), (-0.5, -0.05, MZ + 2.1), face=(-0.2, -1, 0.15), leaves=0, bend=(-0.1, 0, 0))
    narcissus.stalk(NG, r2, IN(-0.08, 0.08), (-0.15, 0.05, MZ + 2.55), face=(0.0, -1, 0.15), leaves=0)
    for (az, L, arch) in ((math.pi - 0.3, 2.3, 0.3), (math.pi + 0.2, 1.9, 0.4), (math.pi / 2 + 0.6, 2.5, 0.15), (math.pi + 0.7, 1.6, 0.5)):
        V, Q, UV = narcissus.F.strap(r2, L, 0.09, arch=arch, twist=r2.uniform(-0.8, 0.8), n=40, nu=5)
        NG['leaf'].add(kit.place(V, kit.rot((0, 0, 1), az), IN(-0.05, 0.06)), Q, [], UV, rand=r2.random())
    narcissus.build(NG, NM)


def a8():
    """魏紫 · 玉楼春：一紫一白两朵牡丹，一高一低，叶子衬着。"""
    import peony
    pe, G, M, rng = peony_parts('weizi', 81)
    o = np.array([-0.15, -0.45, MZ + 0.75]); ax = N((-0.3, -0.82, 0.5))
    peony_stem(pe, G, rng, IN(-0.05), o, ax, 'weizi', size=0.92, spin=0.4)
    bo = np.array([-0.6, 0.05, MZ + 2.0]); bax = N((-0.3, -0.4, 0.86))
    pe.bud(G, rng, bo, bax, size=1.0)
    pe.stem(G, pe.bezier(IN(-0.08, 0.05), (-0.1, 0.05, MZ + 0.5), (-0.45, 0.05, MZ + 1.3), bo - bax * 0.05), 0.026, 0.021)
    for (p, d, up, s) in (((-0.12, -0.08, MZ + 0.12), (-0.85, -0.75, -0.05), (0, -0.6, 1), 0.95), ((0.0, 0.12, MZ + 0.35), (-0.15, 0.3, 1.0), (0, -1, 0.15), 1.05),
                          ((-0.4, 0.05, MZ + 1.4), (-0.7, -0.3, 0.5), (0, -0.6, 1), 0.75)):
        pe.leaf(G, rng, p, d, up=up, size=s)
    pe.build(G, M, prefix='weizi')
    pe2, G2, M2, r2 = peony_parts('yulouchun', 82)
    o2 = np.array([0.55, -0.15, MZ + 1.45]); ax2 = N((0.45, -0.8, 0.45))
    peony_stem(pe2, G2, r2, IN(0.05, 0.05), o2, ax2, 'yulouchun', size=0.9, spin=0.9)
    for (p, d, up, s) in (((0.12, -0.1, MZ + 0.12), (1.0, -0.6, 0.0), (0, -0.6, 1), 1.1), ((0.35, 0.0, MZ + 0.95), (1.0, -0.3, 0.3), (0, -0.6, 1), 0.9)):
        pe2.leaf(G2, r2, p, d, up=up, size=s)
    pe2.build(G2, M2, prefix='yulouchun')


def a9():
    """白梅 · 茶花：一老枝白梅从左往右上横斜，一朵茶花开在瓶口右边。"""
    import plum, camellia
    G = plum.garden(); M = plum.mats(); rng = np.random.default_rng(91)
    side = (0, 1, 0)
    T, tn = plum.path(rng, IN(0.0, 0.05), (0.3, 0.05, 1), 3.4, step=0.05, node=0.32, kink=(16, 32), side=side)
    TR = plum.radii(T, 0.085, 0.02, tn)
    T = kit.neck(T, TR, woody=True).P      # 老枝从瓶口正经出来
    plum.add_branch(G, T, TR, sides=12)
    def br(at, d, L, scale=0.6):
        i = int(at * (len(T) - 1))
        P, nn = plum.path(rng, T[i], d, L, step=0.045, node=0.28, kink=(16, 32), side=side, lift=0.012)
        R = plum.radii(P, TR[i] * scale, 0.011, nn); plum.add_branch(G, P, R, sides=10); return P, R
    def tw(P, R, at, d, L):
        i = int(at * (len(P) - 1))
        Q, _ = plum.path(rng, P[i], d, L, step=0.04, node=0, wander=0.012, lift=0.01)
        RQ = plum.radii(Q, max(R[i] * 0.55, 0.008), 0.0045)
        plum.add_branch(G, Q, RQ, young=1.0, sides=7)
        plum.blossoms_along(G, rng, Q, RQ, start=0.12, gap=(0.075, 0.115))
    A, AR = br(0.3, (1.0, -0.05, 0.25), 2.2, 0.68)
    B, BR = br(0.55, (-0.7, 0.05, 0.6), 1.0)
    for (P, R, at, d, L) in ((A, AR, 0.2, (0.2, -0.1, 1.0), 0.7), (A, AR, 0.45, (0.5, -0.1, 1.0), 0.75), (A, AR, 0.7, (0.6, -0.1, 0.8), 0.6),
                             (A, AR, 0.95, (1.0, 0.0, 0.3), 0.5), (B, BR, 0.5, (-0.2, -0.1, 1.0), 0.5), (B, BR, 0.95, (-0.7, 0, 0.5), 0.45),
                             (T, TR, 0.7, (0.3, -0.2, 1.0), 0.55), (T, TR, 0.95, (0.0, 0.0, 1.0), 0.5), (T, TR, 0.5, (-0.4, -0.2, 1.0), 0.5)):
        tw(P, R, at, d, L)
    plum.build(G, M)
    CG = camellia.garden(); CM = camellia.mats(); r2 = np.random.default_rng(92)
    camellia.branch(CG, r2, IN(0.05), (0.62, -0.45, MZ + 0.72), face=(0.5, -1, 0.15), leaves=6, bend=(0.1, 0, 0.12), size=1.05)
    camellia.branch(CG, r2, IN(-0.05), (-0.55, -0.25, MZ + 0.6), face=(-0.5, -1, 0.1), leaves=4, bud_at=0, bend=(-0.1, 0, 0.1), size=0.8)
    camellia.build(CG, CM)


def a10():
    """秋菊 · 芷兰：兰叶一丛拱出去，两枝黄菊一高一低。"""
    import chrysanthemum as C, orchid as Oc
    OG = Oc.garden(); OM = Oc.mats(); r2 = np.random.default_rng(102)
    Oc.leaves(OG, r2, IN(0.0, 0.05), n=10, L=(2.2, 3.2), W=(0.07, 0.09), face_az=-math.pi / 2 + 0.4, spread=0.95)
    Oc.scape(OG, r2, IN(-0.05, 0.1), (-0.55, 0.1, MZ + 2.6), bend=(-0.1, 0, 0), n_flowers=4)
    Oc.build(OG, OM)
    G = C.garden(); M = C.mats(); rng = np.random.default_rng(101)
    C.stem(G, rng, IN(0.05), (0.45, -0.3, MZ + 1.35), face=(0.3, -1, 0.15), bend=(0.1, 0, 0), size=1.0, leaves=4)
    C.stem(G, rng, IN(0.08), (1.1, -0.1, MZ + 2.4), face=(0.5, -1, 0.2), bend=(0.25, 0, 0.1), size=0.8, leaves=3)
    C.build(G, M)


ARR = {'2': a2, '3': a3, '4': a4, '5': a5, '6': a6, '7': a7, '8': a8, '9': a9, '10': a10}
ARR[which]()
kit.camera(target=(0.55, 0, 2.95), dist=26, height=2.95, frame_h=6.4)
kit.render(out)
