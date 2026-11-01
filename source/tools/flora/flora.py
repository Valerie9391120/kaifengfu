# 各种花共用的形状：叶片（椭圆/卵形/披针/带状，可带锯齿）、圆瓣、漏斗形花冠、杯状副冠、枝
import math
import numpy as np
from kit import (MB, tube, ellipsoid, grid_quads, frame_from, place, norm, rot,
                 new_mat, ramp, uv_xy, attr, math_node, mix_rgb, hsv, thin_surface, noise_bump, srgb)


# ---------------- 叶 ----------------
def leaf_blade(rng, L, W, shape='elliptic', nu=11, nv=21, serr=0.0, teeth=12, fold=0.2, droop=0.15,
               wave=0.03, twist=0.0, tip=0.85, petiole=0.0):
    """一片叶：沿 +Y 长，面朝 +Z。shape 决定最宽处：
    elliptic 中间、ovate 偏下、obovate 偏上、lanceolate 偏下且细长、strap 几乎等宽的带子。"""
    u = np.linspace(-1, 1, nu); v = np.linspace(0, 1, nv)
    U, Vv = np.meshgrid(u, v)
    peak = {'elliptic': 0.5, 'ovate': 0.36, 'obovate': 0.64, 'lanceolate': 0.3, 'strap': 0.2}[shape]
    # 一个在 peak 处取 1、两头为 0 的单峰
    a = math.log(0.5) / math.log(peak)
    t = np.clip(Vv, 0, 1) ** a
    w = np.sin(np.pi * t) ** tip
    if shape == 'strap':
        w = np.clip(np.sin(np.pi * np.clip(Vv / 0.12, 0, 0.5)), 0, 1) * (1 - np.clip((Vv - 0.75) / 0.25, 0, 1) ** 1.6)
    w = np.maximum(w, 0.04 * (1 - Vv))
    if serr:
        fr = (teeth * Vv) % 1.0
        w = w * (1 - serr * fr ** 1.6 * np.clip(Vv * 6, 0, 1))
    x = U * W / 2 * w
    y = L * Vv
    ph = rng.uniform(0, 6.3)
    z = fold * np.abs(x) - droop * L * Vv ** 2 + wave * W * np.sin(3 * U + 9 * Vv + ph) * np.abs(U)
    if twist:
        ang = twist * Vv
        x, z = x * np.cos(ang) - z * np.sin(ang), x * np.sin(ang) + z * np.cos(ang)
    V = np.stack([x, y + petiole, z], -1).reshape(-1, 3)
    UV = np.stack([(U + 1) / 2, Vv], -1).reshape(-1, 2)
    return V, grid_quads(nv, nu), UV


def strap(rng, L, W, arch=0.4, twist=0.6, n=40, nu=5, side=0.0):
    """长带状的叶（兰、水仙）：先往上，再往外弯下来，顺带拧一点。返回 V,Q,UV（局部：起点在原点，先沿 +Z 长，往 +X 弯）。"""
    s = np.linspace(0, 1, n)
    # 中线：一条往外弯的抛物线
    cx = arch * L * s ** 2; cz = L * s * (1 - 0.45 * arch * s ** 1.5)
    cy = side * L * s ** 2
    C = np.stack([cx, cy, cz], -1)
    T = norm(np.gradient(C, axis=0))
    up = np.array([0, 1.0, 0])
    Nn = norm(np.cross(T, up))
    B = np.cross(Nn, T)
    w = W * (np.clip(s / 0.05, 0, 1) ** 0.5) * (1 - np.clip((s - 0.7) / 0.3, 0, 1) ** 1.7)
    w = np.maximum(w, 0.002)
    ang = twist * s + rng.uniform(-0.2, 0.2)
    u = np.linspace(-1, 1, nu)
    Vs = []
    for i in range(n):
        d = math.cos(ang[i]) * B[i] + math.sin(ang[i]) * Nn[i]
        nrm = -math.sin(ang[i]) * B[i] + math.cos(ang[i]) * Nn[i]
        row = C[i][None, :] + (u[:, None] * w[i] / 2) * d[None, :] + (0.12 * w[i] * u[:, None] ** 2) * nrm[None, :]
        Vs.append(row)
    V = np.concatenate(Vs)
    U, Sv = np.meshgrid((u + 1) / 2, s)
    UV = np.stack([U, Sv], -1).reshape(-1, 2)
    return V, grid_quads(n, nu), UV


# ---------------- 花瓣 ----------------
def round_petal(rng, L, W, cup=0.8, curl=0.0, wave=0.02, nu=11, nv=11, claw=0.18, notch=0.0, point=0.0, fold=0.0):
    """圆一点的花瓣（梅、海棠、茶花、木槿、月季）：根上窄，中上部最宽。"""
    u = np.linspace(-1, 1, nu); v = np.linspace(0, 1, nv)
    U, Vv = np.meshgrid(u, v)
    w = (2 * np.sqrt(np.clip(Vv * (1 - Vv), 0, None))) ** 0.75
    if point:   # 瓣尖收成一个钝尖
        w = w * (1 - point * np.clip((Vv - 0.6) / 0.4, 0, 1) ** 1.5 * 0.5)
    w = np.maximum(w, claw * (1 - Vv))
    x = U * W / 2 * w
    top = 1 - 0.06 * U ** 2 - notch * np.exp(-(U / 0.18) ** 2)
    y = L * Vv * (1 + (top - 1) * Vv ** 3)
    ph = rng.uniform(0, 6.3, 2)
    z = cup * 0.42 * W * (U * w) ** 2 + cup * 0.18 * L * Vv ** 2 + curl * L * Vv ** 3
    z += wave * L * np.sin(7 * U + ph[0]) * Vv ** 3 + wave * 0.6 * L * np.sin(11 * U + ph[1]) * Vv ** 4
    z += fold * np.abs(x)
    V = np.stack([x, y, z], -1).reshape(-1, 3)
    UV = np.stack([(U + 1) / 2, Vv], -1).reshape(-1, 2)
    return V, grid_quads(nv, nu), UV


def pframe(th, a):
    """花瓣的朝向：绕花轴转 th，离轴张开 a。局部 x→切向，y→瓣长，z→瓣的里面。"""
    d = np.array([math.sin(a) * math.cos(th), math.sin(a) * math.sin(th), math.cos(a)])
    n = np.array([-math.cos(a) * math.cos(th), -math.cos(a) * math.sin(th), math.sin(a)])
    t = np.array([-math.sin(th), math.cos(th), 0.0])
    return np.stack([t, d, n], 1)


def at(r, th, h):
    return np.array([r * math.cos(th), r * math.sin(th), h])


def funnel(rng, R, depth, r0=0.02, lobes=5, inc=0.55, flare=2.2, reflex=0.15, nphi=60, ns=16, phase=0.0, zpow=1.6):
    """漏斗形花冠（映山红）：底下一根细管，往上张开成五裂。局部花轴 +Z。UV：x=绕一圈，y=从底到边。"""
    phi = np.linspace(0, 2 * np.pi, nphi + 1); s = np.linspace(0, 1, ns)
    P, S = np.meshgrid(phi, s)
    lobe = 0.5 + 0.5 * np.cos(lobes * (P - phase))
    cut = inc * (1 - lobe) ** 3 * np.clip((S - 0.45) / 0.55, 0, 1) ** 1.2
    r = (r0 + (R - r0) * S ** flare) * (1 - cut)
    z = depth * (1 - (1 - S) ** zpow) - reflex * depth * np.clip((S - 0.75) / 0.25, 0, 1) ** 2
    ph = rng.uniform(0, 6.3)
    z += 0.04 * depth * np.sin(3 * P + ph) * S ** 3
    V = np.stack([r * np.cos(P), r * np.sin(P), z], -1).reshape(-1, 3)
    UV = np.stack([P / (2 * np.pi), S], -1).reshape(-1, 2)
    return V, grid_quads(ns, nphi + 1), UV


def cup(rng, R0, R1, h, nphi=36, ns=6, frill=0.12, k=12):
    """杯状副冠（水仙中间那一圈金盏）：口沿带细褶。"""
    phi = np.linspace(0, 2 * np.pi, nphi + 1); s = np.linspace(0, 1, ns)
    P, S = np.meshgrid(phi, s)
    r = R0 + (R1 - R0) * S ** 1.4
    r = r * (1 + frill * S ** 3 * np.sin(k * P + rng.uniform(0, 6.3)) * 0.5)
    z = h * S + frill * h * S ** 3 * np.cos(k * P)
    V = np.stack([r * np.cos(P), r * np.sin(P), z], -1).reshape(-1, 3)
    UV = np.stack([P / (2 * np.pi), S], -1).reshape(-1, 2)
    return V, grid_quads(ns, nphi + 1), UV


# ---------------- 枝 ----------------
def curve(p0, p1, bend=(0, 0, 0), n=16, sag=0.0):
    """从 p0 到 p1 的一条弧，中间往 bend 方向鼓一点，sag 往下坠一点。"""
    p0 = np.asarray(p0, float); p1 = np.asarray(p1, float)
    t = np.linspace(0, 1, n)[:, None]
    P = p0 + (p1 - p0) * t + np.asarray(bend, float) * 4 * t * (1 - t) - np.array([0, 0, sag]) * 4 * t * (1 - t)
    return P


def points_along(P, n_or_s):
    """沿折线取点（按长度比例 s∈[0,1]），返回点、切向。"""
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)]); Lt = cum[-1]
    out = []
    for s in n_or_s:
        d = s * Lt; i = int(np.searchsorted(cum, d)); i = min(max(i, 1), len(P) - 1)
        f = (d - cum[i - 1]) / max(seg[i - 1], 1e-9)
        p = P[i - 1] + (P[i] - P[i - 1]) * f
        out.append((p, norm(P[i] - P[i - 1])))
    return out


def side_dir(T, rng, face=(0, -1, 0), bias=0.5, up=0.3):
    o = norm(np.cross(T, rng.normal(0, 1, 3)))
    return norm(o + bias * np.asarray(face, float) + up * np.array([0, 0, 1.0])), o


# ---------------- 材质 ----------------
def petal_mat(name, stops, trans=0.35, rough=0.45, sheen=0.25, veins=(40.0, 5.0), vein_str=0.08,
              rand_v=0.12, rand_h=0.02, trans_v=1.3, trans_s=1.0, spec=0.35, axis='Y', spots=None, back=None, back_amt=0.6):
    m, nt, out = new_mat(name)
    tc, sep = uv_xy(nt)
    r = ramp(nt, stops)
    nt.links.new(sep.outputs[axis], r.inputs[0])
    rnd = attr(nt, 'rand')
    hue = math_node(nt, 'MULTIPLY_ADD', rnd.outputs['Fac'], rand_h); hue.inputs[2].default_value = 0.5 - rand_h / 2
    val = math_node(nt, 'MULTIPLY_ADD', rnd.outputs['Fac'], rand_v); val.inputs[2].default_value = 1.0 - rand_v / 2
    col = r.outputs['Color']
    if spots is not None:   # (颜色, 斑点的尺度, 阈值, 只在 uv.y 的这一段)：映山红上瓣的斑、兰花唇瓣的点
        sc_col, scl, thr, (y0, y1), xr = spots
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scl; nz.inputs['Detail'].default_value = 1.0
        nt.links.new(tc.outputs['UV'], nz.inputs['Vector'])
        sp = ramp(nt, [(thr, (0, 0, 0)), (thr + 0.04, (1, 1, 1))])
        nt.links.new(nz.outputs['Fac'], sp.inputs[0])
        band = math_node(nt, 'MULTIPLY',
                         math_node(nt, 'GREATER_THAN', sep.outputs['Y'], y0).outputs[0],
                         math_node(nt, 'LESS_THAN', sep.outputs['Y'], y1).outputs[0])
        if xr is not None:
            bx = math_node(nt, 'MULTIPLY',
                           math_node(nt, 'GREATER_THAN', sep.outputs['X'], xr[0]).outputs[0],
                           math_node(nt, 'LESS_THAN', sep.outputs['X'], xr[1]).outputs[0])
            band = math_node(nt, 'MULTIPLY', band.outputs[0], bx.outputs[0])
        f = math_node(nt, 'MULTIPLY', band.outputs[0], sp.outputs['Color'])
        col = mix_rgb(nt, f.outputs[0], col, sc_col)
    if back is not None:
        br = ramp(nt, back); nt.links.new(sep.outputs[axis], br.inputs[0])
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        f = math_node(nt, 'MULTIPLY', geo.outputs['Backfacing'], back_amt)
        col = mix_rgb(nt, f.outputs[0], col, br.outputs['Color'])
    base = hsv(nt, col, hue.outputs[0], 1.0, val.outputs[0])
    trc = hsv(nt, col, 0.5, trans_s, trans_v)
    nrm = None
    if veins:
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (veins[0], veins[1], 1.0)
        nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
        nrm = noise_bump(nt, scale=1.0, strength=vein_str, detail=2.0, vec=mp.outputs[0])
    thin_surface(nt, out, base, trc, trans=trans, rough=rough, sheen=sheen, normal=nrm, spec=spec)
    return m


def leaf_mat(name, top, under, edge=None, edge_amt=0.0, mid=None, trans=0.15, rough=0.5, gloss=0.0, rand_v=0.25, veins=(36.0, 4.0)):
    m, nt, out = new_mat(name)
    tc, sep = uv_xy(nt)
    stops = [(0.0, mid or top), (1.0, top)]
    g = ramp(nt, stops)
    nt.links.new(sep.outputs['Y'], g.inputs[0])
    rnd = attr(nt, 'rand')
    gv = math_node(nt, 'MULTIPLY_ADD', rnd.outputs['Fac'], rand_v); gv.inputs[2].default_value = 1 - rand_v / 2
    col = hsv(nt, g.outputs['Color'], 0.5, 1.0, gv.outputs[0])
    if edge is not None and edge_amt:
        e = math_node(nt, 'SUBTRACT', sep.outputs['X'], 0.5)
        e = math_node(nt, 'ABSOLUTE', e.outputs[0])
        e = math_node(nt, 'MULTIPLY', e.outputs[0], 2.0)
        e = math_node(nt, 'POWER', e.outputs[0], 6.0)
        e = math_node(nt, 'MULTIPLY', e.outputs[0], edge_amt)
        col = mix_rgb(nt, e.outputs[0], col, edge)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    col = mix_rgb(nt, geo.outputs['Backfacing'], col, under)
    trc = hsv(nt, col, 0.5, 1.2, 1.6)
    nrm = None
    if veins:
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (veins[0], veins[1], 1.0)
        nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
        nrm = noise_bump(nt, scale=1.0, strength=0.07, detail=2.0, vec=mp.outputs[0])
    p = thin_surface(nt, out, col, trc, trans=trans, rough=max(rough, 0.55), sheen=0.0, normal=nrm, spec=0.06 + 0.12 * gloss)
    return m


def plain(name, rgb, rough=0.55, sheen=0.0, coat=0.0):
    m, nt, out = new_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.inputs['Base Color'].default_value = (*srgb(*rgb), 1)
    p.inputs['Roughness'].default_value = rough
    if sheen: p.inputs['Sheen Weight'].default_value = sheen
    if coat: p.inputs['Coat Weight'].default_value = coat
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    return m


def ramp_mat(name, stops, rough=0.55, axis='Y', bump=0.0):
    m, nt, out = new_mat(name)
    tc, sep = uv_xy(nt)
    r = ramp(nt, stops); nt.links.new(sep.outputs[axis], r.inputs[0])
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(r.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    if bump:
        nt.links.new(noise_bump(nt, scale=60.0, strength=bump), p.inputs['Normal'])
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    return m


def bark_mat(name, dark=(52, 42, 36), mid=(78, 66, 56), light=(108, 100, 88), young=(84, 62, 44), lichen=None):
    m, nt, out = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 22.0; n1.inputs['Detail'].default_value = 6.0
    nt.links.new(tc.outputs['Object'], n1.inputs['Vector'])
    r1 = ramp(nt, [(0.3, srgb(*dark)), (0.55, srgb(*mid)), (0.75, srgb(*light))])
    nt.links.new(n1.outputs['Fac'], r1.inputs[0])
    col = r1.outputs['Color']
    if lichen is not None:
        n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 7.0; n2.inputs['Detail'].default_value = 3.0
        nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
        lich = ramp(nt, [(0.58, (0, 0, 0)), (0.66, (1, 1, 1))])
        nt.links.new(n2.outputs['Fac'], lich.inputs[0])
        col = mix_rgb(nt, lich.outputs['Color'], col, srgb(*lichen))
    yg = attr(nt, 'young')
    col = mix_rgb(nt, yg.outputs['Fac'], col, srgb(*young))
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(col, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.8
    nrm = noise_bump(nt, scale=45.0, strength=0.4, detail=5.0, vec=tc.outputs['Object'], distance=0.01)
    nt.links.new(nrm, p.inputs['Normal'])
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    return m


def build_all(G, M, prefix):
    obs = []
    for k, mb in G.items():
        ob = mb.build(f'{prefix}_{k}', M[k])
        if ob: obs.append(ob)
    return obs
