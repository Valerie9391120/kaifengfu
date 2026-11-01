# 单看一种花：python spec.py 模块名 出图.png [宽 高 采样]
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, numpy as np
import kit

name, out = sys.argv[1], sys.argv[2]
W, H, SPP = (int(a) for a in (sys.argv[3:6] if len(sys.argv) > 5 else (440, 440, 40)))
sc = kit.reset(samples=SPP, res=(W, H))
kit.world()
rng = np.random.default_rng(int(sys.argv[6]) if len(sys.argv) > 6 else 7)

if name in ('weizi', 'yulouchun'):
    import peony
    G = peony.garden(); M = peony.mats(name)
    rings = peony.RINGS_YLC if name == 'yulouchun' else None
    peony.bloom(G, rng, (0, 0, 0), kit.norm((-0.15, -0.8, 0.6)), rings=rings, center=(name == 'weizi'))
    peony.stem(G, peony.bezier((0, 0.25, -1.4), (0, 0.2, -0.8), (0.05, 0.1, -0.3), (0.0, 0.05, -0.08)))
    peony.leaf(G, rng, (0.02, 0.2, -0.6), (-1, -0.5, 0.1), up=(0, -0.6, 1))
    peony.leaf(G, rng, (0.05, 0.2, -0.55), (1, -0.6, 0.15), up=(0, -0.6, 1))
    peony.build(G, M, prefix=name)
    target, fh = (0.0, 0, -0.1), 2.6
elif name == 'plum':
    import plum
    G = plum.garden(); M = plum.mats()
    P, nodes = plum.path(rng, (-0.55, 0, -0.45), (1, 0, 0.6), 0.6, step=0.04, node=0.18, kink=(14, 26))
    R = plum.radii(P, 0.04, 0.024, nodes); plum.add_branch(G, P, R)
    for (s0, d, L) in ((0.99, (0.8, 0.0, 0.7), 0.75), (0.5, (0.1, -0.1, 1.0), 0.6)):
        i = int(s0 * (len(P) - 1))
        P2, _ = plum.path(rng, P[i], d, L, step=0.04, node=0, wander=0.015)
        R2 = plum.radii(P2, 0.013, 0.006); plum.add_branch(G, P2, R2, young=1.0, sides=8)
        plum.blossoms_along(G, rng, P2, R2, start=0.1, gap=(0.1, 0.15))
    plum.build(G, M)
    target, fh = (0.0, 0, 0.12), 1.45
else:
    mod = importlib.import_module(name)
    G = mod.garden(); M = mod.mats()
    target, fh = mod.specimen(G, rng)
    mod.build(G, M)
kit.lights(target=target)
kit.camera(target=target, dist=14, height=target[2] + 0.5, frame_h=fh)
kit.render(out)
