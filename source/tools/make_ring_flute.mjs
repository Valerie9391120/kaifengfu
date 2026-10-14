// =====================================================
//   来电铃声的试作（卿卿 10 月 14 日 22:08 要的：原来那段“叮——咚”有点灵异感，要柔和优美一点、像笛子的；
//   22:56 她说先搁置。见开发说明“来电铃声”那一节）。开封府眼下没用它，来电也没有铃声（原来那段“叮——咚”她 22:58 让撤了）。
//   笛声是现算的：几个泛音（箫暗、长笛柔、竹笛亮）、一点气声（吐音的头上多一点）、长音上的颤音、倚音、颤音（tr），
//   再过一道八路反馈延迟网络的混响（处理两遍取后一遍，尾巴绕回开头，循环着放接得上）。五段旋律都是自己写的。
//   跑：node tools/make_ring_flute.mjs 输出目录 —— 每段存成一个 wav（32k、单声道，循环两遍）
// =====================================================
// 每段旋律：[音高(MIDI), 拍数, 记号]；记号：s 连着上一个音（不吐音），g 前面带一个上方的倚音，v 长音加颤音
const TWO_PI = Math.PI * 2;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA_D = [2, 4, 6, 9, 11]; // D 调五声：D E F# A B
// 五声音阶里上面那个音（倚音、颤音用）
const upper = (p, scale = PENTA_D) => {
  for (let q = p + 1; q < p + 6; q++) if (scale.includes(((q % 12) + 12) % 12)) return q;
  return p + 2;
};

// 确定的伪随机（同样的参数出同样的声音）
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296 * 2 - 1;
  };
}
// RBJ 带通（常数峰值增益）
function bandpass(rate, fc, q) {
  const w = TWO_PI * fc / rate, al = Math.sin(w) / (2 * q), c = Math.cos(w);
  const a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

export const TIMBRES = {
  // 箫：暗、气声多
  xiao: { harm: [1, 0.22, 0.09, 0.035, 0.014], breath: 0.042, chiff: 0.05, noiseFc: 1900, noiseQ: 0.9, vib: 0.0042, vibRate: 5.0, wet: 0.24, lp: 5600 },
  // 长笛：柔、亮一点
  flute: { harm: [1, 0.38, 0.16, 0.075, 0.032, 0.014], breath: 0.03, chiff: 0.07, noiseFc: 2600, noiseQ: 0.8, vib: 0.0052, vibRate: 5.3, wet: 0.22, lp: 7000 },
  // 竹笛：亮、带一点笛膜的嗡
  dizi: { harm: [1, 0.55, 0.38, 0.27, 0.19, 0.13, 0.085, 0.055, 0.035], breath: 0.025, chiff: 0.08, noiseFc: 3200, noiseQ: 1.0, vib: 0.0058, vibRate: 5.6, wet: 0.18, lp: 8000 },
};

// 一段旋律念成声音（干声），回 Float32Array；restBeats：后面空几拍（混响的尾巴落在这里）
function renderDry(tune, rate, tb) {
  const beat = 60 / tune.bpm;
  const evs = [];
  let t = 0;
  tune.notes.forEach(([p, d, mark = ""], i) => {
    const dur = d * beat;
    if (p === null) {
      t += dur;
      return;
    }
    if (mark.includes("g")) {
      // 倚音：从五声音阶里上面那个音快快地落下来（6 的上面是 1'，3 的上面是 5）
      const gp = upper(p, tune.scale);
      evs.push({ t0: t, dur: 0.065, f: hz(gp), slur: mark.includes("s"), vib: false, grace: true });
      evs.push({ t0: t + 0.065, dur: dur - 0.065, f: hz(p), slur: true, vib: mark.includes("v") || dur >= 0.7 });
    } else evs.push({ t0: t, dur, f: hz(p), slur: mark.includes("s") && i > 0, vib: mark.includes("v") || dur >= 0.7, trill: mark.includes("t") ? hz(upper(p, tune.scale)) : 0 });
    t += dur;
  });
  const end = t + tune.rest * beat;
  const n = Math.ceil(end * rate);
  const out = new Float32Array(n);
  const noise = rng(tune.seed || 7);
  const bp = bandpass(rate, tb.noiseFc, tb.noiseQ);
  let phase = 0;
  let fNow = evs[0].f;
  let aNow = 0;
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const next = evs[i + 1];
    const last = !next || next.t0 > e.t0 + e.dur + 1e-6; // 后面是休止
    const s0 = Math.round(e.t0 * rate);
    const tail = last ? 0.22 : 0;
    const s1 = Math.min(n, Math.round((e.t0 + e.dur + tail) * rate));
    const fFrom = fNow;
    const aFrom = e.slur ? aNow : i === 0 || (evs[i - 1] && evs[i - 1].t0 + evs[i - 1].dur < e.t0 - 1e-6) ? 0 : aNow * 0.45;
    const glide = e.slur ? (e.grace ? 0.02 : 0.045) : 0.012;
    const durS = e.dur;
    const km = tb.harm.filter((_, k) => (k + 1) * e.f * 1.02 < 0.45 * rate && (k + 1) * fFrom * 1.02 < 0.45 * rate).length;
    for (let s = s0; s < s1; s++) {
      const tt = (s - s0) / rate;
      // 音高：从上一个音滑过来；长音加颤音（0.22 秒以后慢慢加深）
      const g = Math.min(1, tt / glide);
      let f = fFrom + (e.f - fFrom) * (g * g * (3 - 2 * g));
      // 颤音（笛子的“tr”）：头上一段在这个音和上面那个音之间快快地打，打完落在本音上
      if (e.trill) {
        const span = Math.min(0.5, durS * 0.55);
        if (tt < span) {
          const ph = (tt / 0.062) % 2;
          const up = ph < 1 ? Math.min(1, ph / 0.25) : Math.max(0, 1 - (ph - 1) / 0.25);
          f = f + (e.trill - e.f) * up * (1 - Math.max(0, (tt - span + 0.06) / 0.06));
        }
      }
      let am = 1;
      if (e.vib) {
        const depth = Math.max(0, Math.min(1, (tt - 0.22) / 0.4));
        const ph = TWO_PI * tb.vibRate * tt;
        f *= 1 + tb.vib * depth * Math.sin(ph);
        am = 1 + 0.06 * depth * Math.sin(ph + 0.7);
      }
      // 力度：吐音的头上从低处起来；长音中间微微鼓起；后面是休止的那个音慢慢收
      let a;
      if (e.slur) a = aFrom + (1 - aFrom) * Math.min(1, tt / 0.03);
      else a = aFrom + (1 - aFrom) * (1 - Math.exp(-tt / (i === 0 ? 0.045 : 0.02)));
      if (durS >= 0.6 && tt < durS) a *= 0.9 + 0.1 * Math.sin(Math.PI * Math.min(1, tt / durS));
      if (last) {
        const fadeFrom = durS * 0.55;
        if (tt > fadeFrom) {
          const u = Math.min(1, (tt - fadeFrom) / (durS - fadeFrom + tail));
          a *= Math.cos(u * Math.PI / 2) ** 1.5;
        }
      } else if (next && !next.slur && tt > durS - 0.04) {
        a *= 1 - 0.35 * Math.min(1, (tt - (durS - 0.04)) / 0.04); // 吐下一个音之前松一下
      }
      // 笛子的声音：几个泛音；吹得响的时候亮一点
      phase += TWO_PI * f / rate;
      if (phase > 1e6) phase -= TWO_PI * Math.floor(phase / TWO_PI);
      let tone = 0;
      for (let k = 0; k < km; k++) tone += tb.harm[k] * (k === 0 ? 1 : 0.6 + 0.4 * a) * Math.sin((k + 1) * phase);
      // 气声：一直有一点，吐音的头上多一点（chiff）
      const chiff = e.slur ? 0 : tb.chiff * Math.exp(-tt / 0.009);
      const air = bp(noise()) * (tb.breath + chiff) * 3;
      out[s] += 0.32 * a * am * (tone + air);
      aNow = a;
      fNow = f;
    }
    aNow = last ? 0 : aNow;
  }
  return out;
}

// 混响：八路反馈延迟网络（Hadamard 混在一起，每路一个低通压住高的），比四个梳状的顺，不发金属声。
// 处理两遍接起来的，取后一遍：尾巴绕回开头，循环着放接得上
function reverb(dry, rate, wet, rt60 = 1.1) {
  const n = dry.length;
  const lens = [809, 877, 937, 1049, 1151, 1277, 1381, 1511].map((l) => Math.round((l * rate) / 32000));
  const lines = lens.map((len) => ({ buf: new Float32Array(len), i: 0, lp: 0, g: Math.pow(10, (-3 * len) / (rt60 * rate)) }));
  const damp = 0.3;
  const out = new Float32Array(n);
  const o = new Float32Array(8);
  const h = (v) => {
    // 8 点 Hadamard（快速，除以根号 8）
    for (let len = 1; len < 8; len <<= 1)
      for (let i = 0; i < 8; i += len << 1)
        for (let j = i; j < i + len; j++) {
          const a = v[j], b = v[j + len];
          v[j] = a + b;
          v[j + len] = a - b;
        }
    for (let j = 0; j < 8; j++) v[j] *= 0.35355339;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let s = 0; s < n; s++) {
      let y = 0;
      for (let j = 0; j < 8; j++) {
        const L = lines[j];
        const v = L.buf[L.i];
        L.lp = v * (1 - damp) + L.lp * damp;
        o[j] = L.lp;
        y += j & 1 ? -v : v;
      }
      h(o);
      const x = dry[s] * 0.3;
      for (let j = 0; j < 8; j++) {
        const L = lines[j];
        L.buf[L.i] = x + o[j] * L.g;
        L.i = (L.i + 1) % L.buf.length;
      }
      if (pass === 1) out[s] = dry[s] * (1 - wet * 0.3) + y * 0.3 * wet;
    }
  }
  return out;
}

export function renderTune(tune, rate = 32000) {
  const tb = TIMBRES[tune.timbre];
  const dry = renderDry(tune, rate, tb);
  const mix = reverb(dry, rate, tb.wet);
  // 收尾：一阶低通去掉刺耳的、隔直流、峰值压到 0.8
  const a = Math.exp((-TWO_PI * tb.lp) / rate);
  let lp = 0, x1 = 0, y1 = 0;
  let peak = 0;
  for (let s = 0; s < mix.length; s++) {
    lp = mix[s] * (1 - a) + lp * a;
    const y = lp - x1 + 0.995 * y1;
    x1 = lp;
    y1 = y;
    mix[s] = y;
    peak = Math.max(peak, Math.abs(y));
  }
  const k = peak > 0 ? 0.8 / peak : 1;
  for (let s = 0; s < mix.length; s++) mix[s] *= k;
  return mix;
}

export function wavOf(samples, rate, loops = 1) {
  const n = samples.length * loops;
  const bytes = new Uint8Array(44 + n * 2);
  const v = new DataView(bytes.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, samples[i % samples.length]));
    v.setInt16(44 + i * 2, x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff), true);
  }
  return bytes;
}

// 原创的小旋律（简谱写在旁边）
const D5 = 74, E5 = 76, Fs5 = 78, A5 = 81, B5 = 83, D6 = 86, A4 = 69, Fs4 = 66, E4 = 64, D4 = 62, B4 = 71;
const C5 = 72, G5 = 79, C6 = 84, G4 = 67;
const PENTA_C = [0, 2, 4, 7, 9]; // C 调五声：C D E G A（A 羽调式也是这几个音）
export const TUNES = {
  // 一、「月下」长笛，悠扬（1 = D）：5̣ 3 — 2 3 5 6 — 5 3 2 1 2 ——
  moon: { timbre: "flute", bpm: 80, rest: 1.4, seed: 11, notes: [[A4, 0.5], [Fs5, 1.5, "v"], [E5, 0.5, "s"], [Fs5, 0.5], [A5, 0.5, "s"], [B5, 1.5, "gv"], [A5, 0.5], [Fs5, 0.5, "s"], [E5, 0.5], [D5, 0.5, "s"], [E5, 2, "v"]] },
  // 二、「轻唤」箫，温柔，一问一答（1 = D）：1 3 5 — 6 5 —｜3 2 1 — 2 3 ——
  call: { timbre: "xiao", bpm: 72, rest: 1.3, seed: 5, notes: [[D5, 0.5], [Fs5, 0.5, "s"], [A5, 1, "v"], [B5, 0.5, "g"], [A5, 1.5, "sv"], [Fs5, 0.5], [E5, 0.5, "s"], [D5, 1, "v"], [E5, 0.5], [Fs5, 2, "sv"]] },
  // 三、「竹影」竹笛，轻快一点，带倚音（1 = D）：3 5 6 5 1' — 6 5 3 2 3 ——
  bamboo: { timbre: "dizi", bpm: 96, rest: 1.2, seed: 3, notes: [[Fs5, 0.5], [A5, 0.5, "s"], [B5, 0.75, "g"], [A5, 0.25, "s"], [D6, 1, "v"], [B5, 0.5], [A5, 0.5, "s"], [Fs5, 0.5, "g"], [E5, 0.5, "s"], [Fs5, 1.5, "v"]] },
  // 四、「流水」竹笛，古风，一串一串像流水，带倚音、颤音（1 = C）：
  //    1 2 3 5 6 5 3 2 | 3 — 5 6 | 1' 6 5 6 1'(tr) — 2' 1' 6 5 | 6 ——
  stream: { timbre: "dizi", bpm: 76, rest: 1, seed: 21, scale: PENTA_C, notes: [
    [72, 0.25], [74, 0.25, "s"], [76, 0.25, "s"], [79, 0.25, "s"],
    [81, 0.25], [79, 0.25, "s"], [76, 0.25, "s"], [74, 0.25, "s"],
    [76, 1, "g"], [79, 0.5], [81, 0.5, "s"],
    [84, 0.25], [81, 0.25, "s"], [79, 0.25, "s"], [81, 0.25, "s"],
    [84, 1, "t"], [86, 0.25], [84, 0.25, "s"], [81, 0.25, "s"], [79, 0.25, "s"],
    [81, 1.5, "v"],
  ] },
  // 五、「惆怅」箫，慢慢的、长音、淡淡的惆怅（A 羽调式，1 = C）：6̣ 1 2 —— 3 5 3 2 1 — 2 3 ——
  sigh: { timbre: "xiao", bpm: 72, rest: 1, seed: 9, scale: PENTA_C, notes: [
    [A4, 1], [C5, 0.5, "s"], [74, 1.5, "v"],
    [76, 0.5], [G5, 0.5, "s"], [76, 0.5, "s"], [74, 0.5],
    [C5, 1, "gv"], [74, 0.5, "s"], [76, 2, "sv"],
  ] },
};

// ---- 命令行：把五段都存成 wav ----
const NAMES = { moon: "一-月下-长笛", call: "二-轻唤-箫", bamboo: "三-竹影-竹笛", stream: "四-流水-竹笛", sigh: "五-惆怅-箫" };
if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("make_ring_flute.mjs")) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = process.argv[2] || ".";
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, name] of Object.entries(NAMES)) {
    const x = renderTune(TUNES[k], 32000);
    fs.writeFileSync(path.join(dir, name + ".wav"), wavOf(x, 32000, 2));
    console.log(name, (x.length / 32000).toFixed(2) + " 秒一圈");
  }
}
