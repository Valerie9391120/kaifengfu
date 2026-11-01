# 单看一朵：python one.py 模块 函数 出图 [axis]
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, numpy as np
import kit
mod = importlib.import_module(sys.argv[1]); fn = getattr(mod, sys.argv[2]); out = sys.argv[3]
kit.reset(samples=40, res=(420, 420)); kit.world()
G = mod.garden(); M = mod.mats(); rng = np.random.default_rng(3)
ax = kit.norm(tuple(float(a) for a in sys.argv[4].split(','))) if len(sys.argv) > 4 else kit.norm((0, -1, 0.35))
fn(G, rng, np.zeros(3), ax)
mod.build(G, M)
fh = float(sys.argv[5]) if len(sys.argv) > 5 else 0.7
kit.lights(target=(0, 0, 0)); kit.camera(target=(0, 0, 0.02), dist=10, height=0.3, frame_h=fh)
kit.render(out)
