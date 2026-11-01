# 一瓶花：月白瓶 + 魏紫（一朵开的、一个花苞、几片叶）+ 一枝白梅
# 用法：python bouquet.py 出图路径 [宽 高 采样]
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math, numpy as np
import kit, peony, plum

out = sys.argv[1] if len(sys.argv) > 1 else 'bouquet.png'
W, H, SPP = (int(a) for a in (sys.argv[2:5] if len(sys.argv) > 4 else (700, 1200, 96)))

sc = kit.reset(samples=SPP, res=(W, H))
kit.world()
kit.lights(target=(0.1, 0, 2.8))
kit.shadow_floor(0.0, x=(-4, 4), y=(-1.2, 1.15))   # 只在案面那一条上有影子
kit.vase()
MZ = kit.MOUTH_Z

# ---------------- 魏紫 ----------------
PG = peony.garden(); PM = peony.mats()
rng = np.random.default_rng(11)
o = np.array([-0.45, -0.42, MZ + 0.78]); ax = kit.norm((-0.38, -0.78, 0.5))
peony.bloom(PG, rng, o, ax, size=0.94, spin=0.6)
st = peony.bezier((-0.04, 0.02, MZ - 0.6), (-0.06, 0.0, MZ + 0.1), (-0.28, -0.22, MZ + 0.45), o - ax * 0.07)
peony.stem(PG, st, 0.034, 0.027)
bo = np.array([-0.95, 0.12, MZ + 1.65]); bax = kit.norm((-0.35, -0.35, 0.87))
peony.bud(PG, rng, bo, bax, size=1.05)
peony.stem(PG, peony.bezier((-0.08, 0.06, MZ - 0.6), (-0.12, 0.08, MZ + 0.4), (-0.72, 0.12, MZ + 1.0), bo - bax * 0.05), 0.026, 0.021)
# 叶：瓶口左右各一片垂下来，后面一片衬着花，花苞那根梗上一片
peony.leaf(PG, rng, (-0.15, -0.08, MZ + 0.12), (-1.0, -0.5, -0.05), up=(0, -0.6, 1), size=1.25)
peony.leaf(PG, rng, (0.1, -0.12, MZ + 0.1), (0.9, -0.9, -0.1), up=(0, -0.7, 1), size=0.95)
peony.leaf(PG, rng, (-0.15, 0.12, MZ + 0.35), (0.15, 0.3, 1.0), up=(0, -1, 0.15), size=1.15)
peony.leaf(PG, rng, (-0.6, 0.1, MZ + 1.15), (-0.9, -0.2, 0.4), up=(0, -0.6, 1), size=0.95)
peony.build(PG, PM)

# ---------------- 白梅 ----------------
G = plum.garden(); M = plum.mats()
rng = np.random.default_rng(5)
side = (0, 1, 0)
T, tn = plum.path(rng, (0.06, 0.08, MZ - 0.5), (-0.16, 0.06, 1), 3.7, step=0.05, node=0.34, kink=(16, 32), side=side)
TR = plum.radii(T, 0.08, 0.02, tn)
plum.add_branch(G, T, TR, sides=12)

def branch(at, d, L, r1=0.011, node=0.28, lift=0.0, scale=0.58):
    i = int(at * (len(T) - 1))
    P, nn = plum.path(rng, T[i], d, L, step=0.045, node=node, kink=(16, 32), side=side, lift=lift)
    R = plum.radii(P, TR[i] * scale, r1, nn)
    plum.add_branch(G, P, R, sides=10)
    return P, R

def twig(P, R, at, d, L, up=0.25):
    i = int(at * (len(P) - 1))
    Q, _ = plum.path(rng, P[i], d, L, step=0.04, node=0, wander=0.012, lift=0.01)
    RQ = plum.radii(Q, max(R[i] * 0.55, 0.008), 0.0045)
    plum.add_branch(G, Q, RQ, young=1.0, sides=7)
    plum.blossoms_along(G, rng, Q, RQ, start=0.12, gap=(0.075, 0.115), up=up)
    return Q, RQ

A, AR = branch(0.36, (-1.0, -0.06, 0.32), 2.1, lift=0.012, scale=0.66)   # 横斜出去的一长枝
B, BR = branch(0.3, (0.8, -0.2, 0.6), 0.6, lift=0.01)               # 另一边短短一枝压住
C, CR = branch(0.72, (-0.35, 0.15, 1.0), 0.85, scale=0.6)           # 顶上往左上
# 新枝（花开在新枝上）
twig(A, AR, 0.22, (-0.2, -0.1, 1.0), 0.75)
twig(A, AR, 0.5, (-0.45, -0.15, 1.0), 0.85)
twig(A, AR, 0.78, (-0.7, -0.05, 0.7), 0.7)
twig(A, AR, 0.98, (-1.0, 0.05, 0.25), 0.5)
twig(A, AR, 0.65, (-0.3, -0.2, 1.0), 0.5)
twig(A, AR, 0.9, (-0.4, -0.1, 1.0), 0.45)
twig(B, BR, 0.4, (0.25, -0.2, 1.0), 0.6)
twig(B, BR, 0.75, (0.5, -0.1, 0.8), 0.45)
twig(B, BR, 0.97, (0.7, 0.0, 0.5), 0.3)
twig(C, CR, 0.5, (0.2, -0.1, 1.0), 0.6)
twig(C, CR, 0.95, (-0.4, 0.0, 1.0), 0.55)
twig(T, TR, 0.6, (0.3, -0.2, 1.0), 0.55)
twig(T, TR, 0.86, (0.35, -0.1, 0.9), 0.55)
twig(T, TR, 0.99, (0.2, 0.0, 1.0), 0.55)
twig(T, TR, 0.75, (-0.5, -0.2, 1.0), 0.5)
twig(A, AR, 0.4, (-0.2, -0.3, 1.0), 0.45)
twig(B, BR, 0.6, (0.4, -0.3, 0.9), 0.4)
# 老枝上的短枝也开几朵
for (P, R, ats) in ((A, AR, (0.15, 0.4, 0.7)), (B, BR, (0.2, 0.6)), (T, TR, (0.5, 0.68, 0.8)), (C, CR, (0.3,))):
    for a in ats:
        i = int(a * (len(P) - 1)); Tt = plum.frame_at(P, i)
        o2 = kit.norm(np.cross(Tt, rng.normal(0, 1, 3)))
        axf = kit.norm(o2 + 0.55 * np.array([0, -1, 0.0]) + 0.3 * np.array([0, 0, 1.0]))
        pos = P[i] + o2 * (R[i] + 0.005)
        plum.flower(G, rng, pos + axf * 0.004, axf, size=rng.uniform(0.92, 1.05))
plum.build(G, M)

# 瓶子在框景的左下角，花枝往右边空的地方伸：左右翻过来（光还是从左边来）
import bpy
for ob in bpy.context.scene.objects:
    if ob.name.startswith(('weizi_', 'plum_')): ob.scale.x = -1
kit.camera(target=(0.55, 0, 2.95), dist=26, height=2.95, frame_h=6.4)
kit.render(out)
