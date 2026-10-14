// =====================================================
//   通话里放他的声音（见开发说明“通话”那一节的“只能说一句”）。
//   卿卿 10 月 14 日 12:50 在她手机上试：“只能说一句话欸 你回复我之后 我这边再说话 麦克风不会收录进去”。
//   网上碰到同样毛病的人的说法：iPhone 上用 <audio> 放过一回声音，iOS 把声音的路子换成了“只放不录”，
//   WebKit 换不回来；下一回开听写，听写是开起来了，可一点声音都等不到（不出字、不报错、也不报结束）。
//   所以这里两样一起做：
//   1. 这一通电话一开头告诉 iPhone 这是又放又录的（navigator.audioSession.type = "play-and-record"，有这个才设），挂了换回原来的；
//   2. 他的声音用 Web Audio 放（AudioContext 解码了直接放），不用 <audio>。Web Audio 起不来、解不开、恢复不了的，才退回 <audio>。
//   浏览器的东西从外头递进来（win），测试里拿假的跑。
// =====================================================

const RESUME_WAIT = 600; // 叫 Web Audio 醒过来最多等这么久，等不到就改用 <audio> 放这一段
const END_SLACK = 1500; // 一段放完了它要是忘了报（iPhone 偶尔这样），过了这段该有的长度再多等这么久就算放完
export const ENV_STEP = 0.02; // 一段声音多响，二十毫秒一格（听她是不是要打断他的时候要知道他这会儿多响，见 barge.js）
export const DUCK = 0.25; // 她好像开口了：他的声音先压到这么小（认出她说的字才真停）

// 一段声音每二十毫秒多响（均方根）。解不出来（测试里的假东西）就没有
export function envOf(buf) {
  try {
    const ch = buf.getChannelData(0);
    const n = Math.max(1, Math.round(buf.sampleRate * ENV_STEP));
    const out = new Float32Array(Math.ceil(ch.length / n));
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      const a = i * n;
      const b = Math.min(ch.length, a + n);
      for (let j = a; j < b; j++) s += ch[j] * ch[j];
      out[i] = Math.sqrt(s / Math.max(1, b - a));
    }
    return out;
  } catch (e) {
    return null;
  }
}

export function bytesOf(b64) {
  const bin = atob(String(b64 || ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// win：{ AudioContext / webkitAudioContext, Audio, URL, Blob, navigator, setTimeout, clearTimeout }
// silent：一小段没声音的 mp3（Uint8Array），在她点的那一下先放一下，后面 <audio> 才不会被 iPhone 拦
export function createCallAudio(win, silent) {
  const AC = win.AudioContext || win.webkitAudioContext;
  const later = (fn, ms) => (win.setTimeout || setTimeout)(fn, ms);
  const cancel = (t) => (win.clearTimeout || clearTimeout)(t);
  let ac = null;
  let el = null; // 退回去用的 <audio>
  let src = null; // Web Audio 正在放的那一段
  let cur = null; // 正在放的那一段：{ clip, at 开始放的时候（Web Audio 的钟） }，<audio> 放的：{ clip, el: true }
  let master = null; // 他的声音都过这一道（压小、恢复）
  let endTimer = null;
  let sess = null;
  let sessWas = null;
  const outlet = () => {
    if (!master && ac && ac.createGain) {
      try {
        master = ac.createGain();
        master.connect(ac.destination);
      } catch (e) {
        master = null;
      }
    }
    return master || ac.destination;
  };

  const elOf = () => {
    if (!el && win.Audio) {
      el = new win.Audio();
      el.preload = "auto";
    }
    return el;
  };

  return {
    // 在她点“打电话”的那一下里叫：Web Audio 开起来、放一下没声音的；<audio> 也先放一下没声音的；告诉 iPhone 这是又放又录
    unlock() {
      try {
        sess = win.navigator && win.navigator.audioSession;
        if (sess && "type" in sess) {
          sessWas = sess.type;
          sess.type = "play-and-record";
        } else sess = null;
      } catch (e) {
        sess = null;
      }
      try {
        if (AC) {
          ac = new AC();
          const b = ac.createBuffer(1, 1, 22050);
          const s = ac.createBufferSource();
          s.buffer = b;
          s.connect(ac.destination);
          s.start(0);
          if (ac.resume) ac.resume().catch(() => {});
        }
      } catch (e) {
        ac = null;
      }
      try {
        const a = elOf();
        if (a && silent) {
          a.src = win.URL.createObjectURL(new win.Blob([silent], { type: "audio/mpeg" }));
          const p = a.play();
          if (p && p.catch) p.catch(() => {});
        }
      } catch (e) {}
    },
    // 念好的一段（base64）变成能放的：Web Audio 解码好的 buf，再留一个 <audio> 用的地址兜底
    async decode(b64, mime) {
      const bytes = bytesOf(b64);
      const url = win.URL.createObjectURL(new win.Blob([bytes], { type: mime || "audio/mpeg" }));
      let buf = null;
      if (ac) {
        try {
          const copy = bytes.buffer.slice(0);
          buf = await new Promise((res, rej) => {
            const p = ac.decodeAudioData(copy, res, rej);
            if (p && p.then) p.then(res, rej);
          });
        } catch (e) {
          buf = null;
        }
      }
      return { buf, url, env: buf ? envOf(buf) : null };
    },
    // 放一段，放完了 resolve。Web Audio 醒不过来就用 <audio> 放这一段
    async play(clip) {
      if (ac && clip && clip.buf) {
        if (ac.state !== "running" && ac.resume) {
          try {
            await Promise.race([ac.resume(), new Promise((r) => later(r, RESUME_WAIT))]);
          } catch (e) {}
        }
        if (ac.state === "running") {
          return new Promise((resolve, reject) => {
            try {
              const s = ac.createBufferSource();
              s.buffer = clip.buf;
              s.connect(outlet());
              const done = () => {
                cancel(endTimer);
                endTimer = null;
                if (src === s) {
                  src = null;
                  cur = null;
                }
                resolve();
              };
              s.onended = done;
              src = s;
              s.start(0);
              cur = { clip, at: ac.currentTime || 0 };
              endTimer = later(done, (clip.buf.duration || 0) * 1000 + END_SLACK);
            } catch (e) {
              reject(e);
            }
          });
        }
      }
      const a = elOf();
      if (!a || !clip || !clip.url) throw new Error("放不出来");
      return new Promise((resolve, reject) => {
        const over = () => {
          if (cur && cur.el) cur = null;
        };
        a.onended = () => {
          over();
          resolve();
        };
        a.onerror = () => {
          over();
          reject(new Error("放不出来"));
        };
        a.src = clip.url;
        cur = { clip, el: true };
        const p = a.play();
        if (p && p.catch) p.catch(reject);
      });
    },
    // 他这会儿多响（最近 look 秒里最响的那一格；麦克风收到的比放出去的晚一点，往回多看一点）。没在放、<audio> 放的：0
    level(look = 0.3) {
      if (!cur || cur.el || !cur.clip.env || !ac) return 0;
      const t = (ac.currentTime || 0) - cur.at;
      const env = cur.clip.env;
      const i1 = Math.min(env.length - 1, Math.floor(t / ENV_STEP));
      if (i1 < 0) return 0;
      const i0 = Math.max(0, Math.floor((t - look) / ENV_STEP));
      let m = 0;
      for (let i = i0; i <= i1; i++) if (env[i] > m) m = env[i];
      return m;
    },
    // 正在放的那一段放到哪儿了：{ elapsed 秒, dur 秒 }；没在放：null
    progress() {
      if (!cur) return null;
      if (cur.el) {
        const a = el;
        return a && a.duration ? { elapsed: a.currentTime || 0, dur: a.duration } : null;
      }
      return { elapsed: Math.max(0, (ac && ac.currentTime ? ac.currentTime : 0) - cur.at), dur: (cur.clip.buf && cur.clip.buf.duration) || 0 };
    },
    // 她好像开口了：他的声音压小（on）、恢复（off）。<audio> 放的压不了（iPhone 上改不了它的音量）
    duck(on) {
      if (!master || !ac) return;
      const v = on ? DUCK : 1;
      try {
        if (master.gain.setTargetAtTime) master.gain.setTargetAtTime(v, ac.currentTime || 0, 0.04);
        else master.gain.value = v;
      } catch (e) {
        master.gain.value = v;
      }
    },
    // 立刻停下正在放的
    stop() {
      cancel(endTimer);
      endTimer = null;
      cur = null;
      if (src) {
        const s = src;
        src = null;
        s.onended = null;
        try {
          s.stop();
        } catch (e) {}
      }
      if (el) {
        el.onended = null;
        el.onerror = null;
        try {
          el.pause();
        } catch (e) {}
      }
    },
    // 这一段用完了：<audio> 用的地址收回（一段几十 K，一通电话下来不收会越攒越多）
    release(clip) {
      try {
        if (clip && clip.url) win.URL.revokeObjectURL(clip.url);
      } catch (e) {}
    },
    // 挂了：都停下、都收掉，iPhone 的声音路子换回原来的
    close() {
      this.stop();
      try {
        if (ac && ac.close) ac.close().catch(() => {});
      } catch (e) {}
      ac = null;
      master = null;
      try {
        if (el) {
          if (el.src && String(el.src).startsWith("blob:")) win.URL.revokeObjectURL(el.src);
          el.removeAttribute && el.removeAttribute("src");
        }
      } catch (e) {}
      el = null;
      try {
        if (sess) sess.type = sessWas || "auto";
      } catch (e) {}
      sess = null;
    },
    // 测试、诊断用：眼下用的哪一样放
    kind: () => (ac ? "webaudio" : el ? "audio" : "none"),
    // 麦克风也接在这个 AudioContext 上（见 mic.js；iPhone 上一个就够，少折腾）
    ctx: () => ac,
  };
}
