// 测试用：在 Node 里跑真的 voice 函数（supabase/voice_function.ts，一个字不改），再配一个假的 ElevenLabs。
// voice 函数和 push 函数在同一个假 Supabase 里跑，各认各的密钥柜：这里给它一个自己的 Deno（不碰 push 那一份的）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, "..", "supabase", "voice_function.ts");
// 函数文件本身不往外交东西；测试要摸里面的零件，就在转出来的那份末尾补一行 export
const INTERNALS = ["mp3Seconds", "elevenError", "loadKeys", "homeOrigin", "looksMp3", "b64"];

export const voiceEnv = {};
let seq = 0;

export async function loadVoiceFunction() {
  const js = transformSync(fs.readFileSync(SOURCE, "utf8"), { loader: "ts", format: "esm", target: "es2022" }).code;
  const dir = path.join(HERE, "..", ".cache");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `voice_function.${process.pid}.${++seq}.mjs`);
  let served = null;
  globalThis.__kfsVoiceDeno = {
    env: { get: (k) => voiceEnv[k] },
    serve: (handler) => {
      served = handler;
    },
  };
  fs.writeFileSync(out, `const Deno = globalThis.__kfsVoiceDeno;\n${js}\nexport { ${INTERNALS.join(", ")} };\n`);
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(out, { force: true });
  if (typeof served !== "function") throw new Error("voice 函数没有调用 Deno.serve");
  return { handler: served, ...mod };
}

// 一段没有声音的 mp3：MPEG-1 Layer III，64 kbps，44.1 kHz，单声道，一帧 208 个字节、1152 个采样
export function silentFrames(seconds) {
  const frames = Math.max(1, Math.round((seconds * 44100) / 1152));
  const out = new Uint8Array(208 * frames);
  for (let i = 0; i < frames; i++) out.set([0xff, 0xfb, 0x50, 0xc4], i * 208);
  return out;
}

// 假的 ElevenLabs。认 key 和声音编号；念出来的是没有声音的 mp3，长短照字数算（标签不算，一个字四分之一秒，至少一秒）。
// state.fail：下一回照它的样子出岔子（quota 额度用完、key 不认、voice 找不到声音、busy 太挤、down 一时出岔子、model 不认这个模型、
// garbage 回来的不是声音、timeout 等太久了、offline 连不上、broken 念回来的读到一半断了）；failTimes 连着几回（不写就是一回）；
// always 一直这样，直到改回来。
// state.hold：下一回压这么多毫秒再答（念得慢）。state.ttsModels：平常念字的那个接口认哪几个模型（null 是都认）。
// state.stabilities：念字的那个接口认哪几个“稳不稳”的数（null 是都认；v3 只认 0、0.5、1）
export function createFakeEleven() {
  const log = [];
  const state = { key: "", voice: "", fail: null, failTimes: 0, always: false, hold: 0, ttsModels: null, stabilities: null };
  const reply = (status, data) => new Response(typeof data === "string" ? data : JSON.stringify(data), { status, headers: { "content-type": typeof data === "string" ? "text/plain" : "application/json" } });
  const seconds = (text) => Math.max(1, Array.from(String(text).replace(/\[[A-Za-z][^\]]*\]/g, "").replace(/\s+/g, "")).length * 0.25);
  async function receive(url, init = {}) {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    let body = {};
    try {
      body = JSON.parse(init.body || "{}");
    } catch (e) {}
    const entry = { path: u.pathname, format: u.searchParams.get("output_format"), key: headers["xi-api-key"], body, at: Date.now() };
    log.push(entry);
    if (state.hold) {
      const ms = state.hold;
      state.hold = 0;
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        if (init.signal) init.signal.addEventListener("abort", () => {
          clearTimeout(t);
          entry.cut = true;
          reject(init.signal.reason instanceof Error ? init.signal.reason : new DOMException("aborted", "AbortError"));
        }, { once: true });
      });
    }
    if (init.signal && init.signal.aborted) throw new DOMException("aborted", "AbortError");
    const fail = state.fail;
    if (fail && !state.always && --state.failTimes <= 0) state.fail = null;
    if (fail === "timeout") throw new DOMException("The signal has been aborted", "TimeoutError");
    if (fail === "offline") throw new TypeError("fetch failed");
    if (fail === "quota") return reply(401, { detail: { status: "quota_exceeded", message: "This request exceeds your quota of 10000. You have 3 credits remaining, while 60 credits are required for this request." } });
    if (headers["xi-api-key"] !== state.key || fail === "key") return reply(401, { detail: { status: "invalid_api_key", message: "Invalid API key" } });
    if (fail === "busy") return reply(429, { detail: { status: "too_many_concurrent_requests", message: "Too many concurrent requests" } });
    if (fail === "down") return reply(500, "Internal Server Error");
    const tts = u.pathname.startsWith("/v1/text-to-speech/");
    const dialogue = u.pathname === "/v1/text-to-dialogue";
    if (!tts && !dialogue) return reply(404, { detail: "Not Found" });
    const voice = tts ? decodeURIComponent(u.pathname.slice("/v1/text-to-speech/".length)) : ((body.inputs || [])[0] || {}).voice_id;
    if (voice !== state.voice || fail === "voice") return reply(404, { detail: { status: "voice_not_found", message: "A voice with the voice_id was not found." } });
    if (tts && (fail === "model" || (state.ttsModels && !state.ttsModels.includes(body.model_id)))) {
      return reply(400, { detail: { status: "model_not_supported", message: `The model ${body.model_id} is not supported for text to speech.` } });
    }
    const vs = body.voice_settings;
    if (tts && vs && state.stabilities && !state.stabilities.includes(vs.stability)) {
      return reply(400, { detail: { status: "invalid_ttd_stability", message: "Invalid TTD stability value. Must be one of: [0.0, 0.5, 1.0]" } });
    }
    if (fail === "garbage") return reply(200, "<html>not audio</html>");
    const text = tts ? body.text : ((body.inputs || [])[0] || {}).text;
    const audio = silentFrames(seconds(text || ""));
    if (fail === "broken") {
      // 回了 200，声音传到一半断了
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(audio.subarray(0, 416));
          c.error(new TypeError("terminated"));
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "audio/mpeg" } });
    }
    return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg" } });
  }
  return { log, state, receive, seconds };
}
