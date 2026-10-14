// =====================================================
//   打电话的时候开一次麦克风，整通电话不关（她 10 月 14 日 13:36 说的：系统听写每开一回、停一回都“滴滴嘟嘟”，烦人；
//   开麦克风不响，只有屏幕顶上一个橘色小点。见开发说明“通话：换成 ElevenLabs 的实时听写”那一节）。
//   她的声音变成 ElevenLabs 实时听写要的样子：16k、单声道、16 位的 PCM；顺带量一量每一小段有多响（判断她在不在说）。
//   听写那头（hear.js）只在该听的时候用这些；他说话的时候这里照样在收，那头不要。
//   浏览器的东西从外头递进来（win、AudioContext），零件不碰浏览器，测试在 Node 里跑。
// =====================================================

export const MIC_RATE = 16000;

// 降采样：从 AudioContext 的采样率（iPhone 上多半是 48000）换成 16000。一块一块地来，块和块之间接得上（记着上一块算到哪儿了）。
// 每个新的点取它前后两个旧的点按距离插一下（线性插值）；说话的声音够用
export function downsampler(from, to = MIC_RATE) {
  const step = from / to;
  let pos = 0; // 下一个要取的点，在“上一块最后一个点 + 这一块”里算的位置
  let last = 0; // 上一块最后一个点
  let first = true;
  return (input) => {
    if (!input || !input.length) return new Float32Array(0);
    if (step === 1) return Float32Array.from(input);
    // 拼起来看：位置 0 是上一块最后一个点，位置 1.. 是这一块
    const at = (i) => (i === 0 ? last : input[i - 1]);
    const n = input.length;
    const out = [];
    let p = first ? 1 : pos;
    while (p <= n) {
      const i = Math.floor(p);
      const f = p - i;
      const a = at(i);
      const b = i + 1 <= n ? at(i + 1) : a;
      out.push(a + (b - a) * f);
      p += step;
    }
    pos = p - n;
    last = input[n - 1];
    first = false;
    return Float32Array.from(out);
  };
}

// -1..1 的浮点 → 16 位整数
export function toPcm16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return out;
}

// 一小段有多响（均方根）
export function rmsOf(f32) {
  if (!f32 || !f32.length) return 0;
  let s = 0;
  for (let i = 0; i < f32.length; i++) s += f32[i] * f32[i];
  return Math.sqrt(s / f32.length);
}

// 16 位整数的声音 → base64（小端，ElevenLabs 要的就是这样）。一小截一小截地转，免得一口气塞给 fromCharCode 的东西太多
export function pcmB64(pcm, btoaFn = typeof btoa === "function" ? btoa : null) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoaFn ? btoaFn(s) : Buffer.from(s, "binary").toString("base64");
}

// win：{ navigator.mediaDevices }；ac：放他声音的那个 AudioContext（同一个，iPhone 上少折腾）
// open() 开麦克风（她第一回会被问能不能用麦克风）；listen(fn) 每收到一小段叫一回 fn({ pcm: Int16Array 16k, rms })；close() 都关掉
export function createMic(win, ac) {
  let stream = null;
  let src = null;
  let node = null;
  let sink = null;
  let fn = null;
  let resample = null;
  const handle = (f32) => {
    if (!fn) return;
    const rms = rmsOf(f32);
    const pcm = toPcm16(resample(f32));
    if (pcm.length) fn({ pcm, rms });
  };
  return {
    async open() {
      const md = win.navigator && win.navigator.mediaDevices;
      if (!md || !md.getUserMedia || !ac) throw Object.assign(new Error("这里开不了麦克风"), { code: "none" });
      try {
        stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (e) {
        throw Object.assign(new Error("麦克风没给开封府用"), { code: "mic" });
      }
      resample = downsampler(ac.sampleRate || 48000, MIC_RATE);
      src = ac.createMediaStreamSource(stream);
      // 用 ScriptProcessor 收（老办法，iPhone 上也有）。新办法 AudioWorklet 要从 blob: 地址加载一段代码，开封府的安全规矩（build.mjs 的 CSP）不让，不折腾
      node = ac.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => handle(e.inputBuffer.getChannelData(0).slice(0));
      // 接到一个不出声的出口上：有的浏览器不接出口就不往下跑
      sink = ac.createGain();
      sink.gain.value = 0;
      src.connect(node);
      node.connect(sink);
      sink.connect(ac.destination);
    },
    listen(f) {
      fn = f;
    },
    // 麦克风实际开成了什么样（回声消除开没开之类；量回声的时候摆出来）
    settings() {
      try {
        const t = stream && stream.getAudioTracks()[0];
        return (t && t.getSettings && t.getSettings()) || {};
      } catch (e) {
        return {};
      }
    },
    close() {
      fn = null;
      try {
        if (node) {
          node.onaudioprocess = null;
          node.disconnect();
        }
        if (src) src.disconnect();
        if (sink) sink.disconnect();
      } catch (e) {}
      try {
        if (stream) stream.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      stream = src = node = sink = null;
    },
  };
}
