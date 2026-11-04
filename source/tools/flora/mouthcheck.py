# 查瓶口穿模：python mouthcheck.py 编号 [瓶口特写.png 宽 采样]
# 把那一瓶搭一遍（不出整图），列出从瓶里起头的每根枝梗：离瓷面最近还剩多少（负的就是戳进瓷里了）、
# 从哪儿出的瓶（口沿上头出来才对）；再把场景里所有花、叶、枝的顶点过一遍，看有没有落进瓷里头的。
# 给了特写路径就再拍一张瓶口的特写（机位不动，只是拉近）。
import sys, os, runpy
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np
import bpy, kit

which = sys.argv[1]
close = sys.argv[2] if len(sys.argv) > 2 else None
CW = int(sys.argv[3]) if len(sys.argv) > 3 else 640
CS = int(sys.argv[4]) if len(sys.argv) > 4 else 24
_render = kit.render
BAD = []


def report(path):
    print(f'== 第 {which} 瓶：瓶口内径 {kit.inner_r(kit.LIP - 0.02):.3f}，瓶颈最细处内径 {kit._INN[:, 0][kit._INN[:, 1] > 1.6].min():.3f}，口沿顶 z={kit.LIP:.3f}')
    for P, R, who in kit.TUBES:
        cls = kit.where(P); m = kit.clearance(P) - R
        e = int(np.argmax(cls != 1)) if (cls != 1).any() else len(P) - 1
        r, z = kit._rz(P)
        i = int(np.argmin(m))
        out = '口沿上' if z[e] >= kit.LIP - 0.03 else f'瓶身上 z={z[e]:.2f}'
        flag = '  ✗' if m[i] < 0 else ('  ·' if m[i] < 0.006 else '')
        if m[i] < 0: BAD.append(who)
        print(f'{flag:3} 最近 {m[i]:+.3f} @z={z[i]:.2f} ρ={r[i]:.3f} r={R[i]:.3f} | 出瓶：{out} | {who}')
    for who, note in kit.NOTES: print(f'  改：{note} | {who}')
    # 瓶口上头（看得见的那一段）两根枝梗有没有互相穿过去
    T = [(P, R, w) for P, R, w in kit.TUBES if R.max() > 0.01]
    for a in range(len(T)):
        for b in range(a + 1, len(T)):
            (P1, R1, w1), (P2, R2, w2) = T[a], T[b]
            m1 = P1[:, 2] > kit.LIP - 0.01; m2 = P2[:, 2] > kit.LIP - 0.01
            if not m1.any() or not m2.any(): continue
            A, B = P1[m1], P2[m2]
            d = np.linalg.norm(A[:, None] - B[None], axis=2) - R1[m1][:, None] - R2[m2][None]
            i, k = np.unravel_index(np.argmin(d), d.shape)
            if d[i, k] < 0:
                print(f'  ✗ 两根交叉 {d[i, k]:+.3f} @z={A[i, 2]:.2f} | {w1.split(" ← ")[0]} × {w2.split(" ← ")[0]}'); BAD.append('cross')
    print('-- 顶点：')
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.name in ('vase', 'floor'): continue
        M = np.array(ob.matrix_world)
        V = np.array([v.co[:] for v in ob.data.vertices])
        if not len(V): continue
        V = V @ M[:3, :3].T + M[:3, 3]
        near = V[(V[:, 2] < kit.LIP + 0.1) & (np.hypot(V[:, 0], V[:, 1]) < 0.75)]
        if not len(near): continue
        c = kit.clearance(near); k = int((c < 0).sum())
        if k: print(f'  ✗ {ob.name}: {k} 个顶点在瓷里头（最深 {-c.min():.3f}）'); BAD.append(ob.name)
    print('== 结论：', '有穿模' if BAD else '干净')
    if close:
        sc = bpy.context.scene
        c = bpy.data.cameras.new('close'); c.sensor_fit = 'VERTICAL'; c.sensor_height = 24.0
        ob = bpy.data.objects.new('close', c); sc.collection.objects.link(ob)
        ob.location = (0.55, -26.0, 2.95); kit.aim(ob, (0.0, 0.0, 2.1))
        c.lens = 24.0 * 26.0 / 1.25
        sc.camera = ob
        sc.render.resolution_x = sc.render.resolution_y = CW; sc.cycles.samples = CS
        _render(close)


kit.render = report
script = 'bouquet.py' if which == '1' else 'arrange.py'
sys.argv = [script, 'x.png', '64', '64', '4'] if which == '1' else [script, which, 'x.png', '64', '64', '4']
runpy.run_path(os.path.join(HERE, script), run_name='__main__')
