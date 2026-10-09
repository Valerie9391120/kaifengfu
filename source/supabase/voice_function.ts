// =====================================================
// 开封府 · 念语音的小后端（函数名：voice）
// 只做一件事：确认敲门的是卿卿本人，再把他要念的那一段字交给 ElevenLabs，用他的声音念出来，把声音交回网页。
// 念好的声音这里不留：网页拿到以后加密了存进库房，跟照片一个路子，云端存的还是乱码。
// 要念的那几句字 ElevenLabs 看得见（它得照着念），念过的会留在她 ElevenLabs 账号的历史记录里；不留的那种只有企业版能开。
//
// 密钥柜里要有两样：
//   ELEVENLABS_API_KEY   她在 ElevenLabs 后台 API Keys 里建的那一把（权限只开 Text to Speech 就够；最好设一个额度上限）
//   ELEVENLABS_VOICE_ID  他的声音的编号（换声音就改这一格）
// 可以没有的：
//   ELEVENLABS_MODEL     用哪个模型念，默认 eleven_v4（v3 念中文带口音，她试过）
// 和另外两个函数共用的照旧：ALLOWED_EMAIL、ALLOWED_ORIGIN
//
// 两个动作：
//   key    钥匙放好了没有（不去敲 ElevenLabs 的门，不花钱）
//   speak  念一段：回 { type: "voice", audio: base64 的 mp3, mime, dur: 几秒, model, via }
// =====================================================

const ELEVEN = "https://api.elevenlabs.io";
const DEFAULT_MODEL = "eleven_v4";
const FORMAT = "mp3_44100_64"; // 一秒八 KB：一条十几秒的一百来 K，存进库房两百 K 上下，比一张照片小
const BITRATE = 64000; // 跟上面那个对得上：认不出帧的时候按它估几秒
const MAX_TEXT = 600; // 一回最多念多少个字（语气标签也算字）：网页那头一条语音最多四百个字，这里多留一点
const SMALL_BODY = 8000; // 寄来的东西最多这么长
const SPEAK_TIMEOUT = 45_000; // 等 ElevenLabs 念最多等多少毫秒
const MAX_AUDIO = 4_000_000; // 念回来的声音最多这么大（一分钟的才五十来万字节；再大就是出了岔子）
const SIMILARITY = 0.8; // 跟她克隆的那个声音像不像：高一点，听着才是他
const STABILITY = 0.5; // 念得稳不稳：没说就放在中间（低了起伏大，一句话里会忽大忽小；高了平）

// 开封府的网页住在这儿（搬了家就在密钥柜里写 ALLOWED_ORIGIN）
const HOME_ORIGIN = "https://valerie9391120.github.io";

type Rec = Record<string, unknown>;

// 密钥柜里贴进来的值：两头的空白和引号去掉（整段粘贴的时候容易带上）
function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}

const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

// 开封府的网页住在哪。密钥柜里写了 ALLOWED_ORIGIN（不是 *）就听它的，只取到域名为止
function homeOrigin(): string {
  const set = env("ALLOWED_ORIGIN");
  if (set && set !== "*") {
    try {
      return new URL(set).origin;
    } catch (_) {
      // 写得不像网址就当没写
    }
  }
  return HOME_ORIGIN;
}

function cors(): Record<string, string> {
  const set = env("ALLOWED_ORIGIN");
  return {
    "Access-Control-Allow-Origin": set && set !== "*" ? homeOrigin() : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(), "Content-Type": "application/json" } });
}

// 出错时的格式和另外两个函数一样，网页那边一套处理就够了。code：是哪一种（网页看了知道怎么跟她说）
function fail(status: number, message: string, code = ""): Response {
  return json(status, { type: "error", error: { type: "kaifengfu", message, ...(code ? { code } : {}) } });
}

// Supabase 自动放进来的公开钥匙（新版在 SUPABASE_PUBLISHABLE_KEYS 里，旧版叫 SUPABASE_ANON_KEY）；
// 都没有就用网页自己带来的那把，它本来就是公开的
function publishableKey(req: Request): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
    const first = Object.values(keys)[0];
    if (typeof first === "string") return first;
  } catch (_) {
    // 没有新版钥匙就往下找
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
}

// 拿着她手里的登录凭证去问 Supabase：这是谁
async function whoIsKnocking(req: Request): Promise<{ id: string; email?: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const base = env("SUPABASE_URL");
  const key = publishableKey(req);
  if (!token || !base || !key) return null;
  try {
    const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const user = await r.json();
    return user && typeof user.id === "string" ? user : null;
  } catch (_) {
    return null;
  }
}

// ---------- 钥匙 ----------
type Keys = { ok: true; key: string; voice: string; model: string } | { ok: false; missing: string[]; message: string; model: string };

function loadKeys(): Keys {
  const key = env("ELEVENLABS_API_KEY");
  const voice = env("ELEVENLABS_VOICE_ID");
  const set = env("ELEVENLABS_MODEL");
  // 模型名只认 eleven_ 开头的那种写法：写岔了就当没写，用默认的
  const model = /^eleven_[a-z0-9_]{1,40}$/.test(set) ? set : DEFAULT_MODEL;
  const missing: string[] = [];
  if (!key) missing.push("ELEVENLABS_API_KEY");
  if (!voice) missing.push("ELEVENLABS_VOICE_ID");
  if (missing.length) return { ok: false, missing, message: "密钥柜里还没有 " + missing.join("、"), model };
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(key)) {
    return { ok: false, missing: ["ELEVENLABS_API_KEY"], message: "ELEVENLABS_API_KEY 不对：应该是 ElevenLabs 后台给的那一串，中间不带空格", model };
  }
  if (!/^[A-Za-z0-9]{8,40}$/.test(voice)) {
    return { ok: false, missing: ["ELEVENLABS_VOICE_ID"], message: "ELEVENLABS_VOICE_ID 不对：应该是 ElevenLabs 声音页面上 Voice ID 那一串（二十个上下的字母数字，中间没有空格）", model };
  }
  return { ok: true, key, voice, model };
}

// ---------- 念回来的 mp3 有几秒 ----------
// 一帧一帧数：每一帧开头四个字节写着这一帧多长、一秒多少个采样；帧数乘每帧的采样数，除以一秒的采样数，就是几秒。
// 开头要是有一段 ID3 标签，先跳过去。中间碰上认不出的字节，往后挪一个字节再找（最多挪这么多回，免得一直挪）
const BR_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BR_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>;

function mp3Seconds(bytes: Uint8Array): number {
  let at = 0;
  // ID3v2：“ID3”、两个字节的版本、一个字节的标记、四个字节的长度（每个字节只用低七位）
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    at = 10 + size + (bytes[5] & 0x10 ? 10 : 0);
  }
  let seconds = 0;
  let skips = 0;
  while (at + 4 <= bytes.length) {
    const b1 = bytes[at + 1];
    const b2 = bytes[at + 2];
    const version = (b1 >> 3) & 3; // 3 是 MPEG-1，2 是 MPEG-2，0 是 MPEG-2.5，1 不算
    const layer = (b1 >> 1) & 3; // 1 是 Layer III
    const bi = (b2 >> 4) & 15;
    const si = (b2 >> 2) & 3;
    if (bytes[at] !== 0xff || (b1 & 0xe0) !== 0xe0 || version === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) {
      at++;
      if (++skips > 4096) break;
      continue;
    }
    const v1 = version === 3;
    const rate = SR[version][si];
    const bitrate = (v1 ? BR_V1 : BR_V2)[bi] * 1000;
    const pad = (b2 >> 1) & 1;
    const len = Math.floor(((v1 ? 144 : 72) * bitrate) / rate) + pad;
    if (len < 4) break;
    seconds += (v1 ? 1152 : 576) / rate;
    at += len;
  }
  return seconds;
}

// 一长串字节写成 base64：一小段一小段地转，免得一口气塞给 fromCharCode 的东西太多
function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ElevenLabs 回来的报错：翻成她看得懂的话。原话只留看得见的字，别太长
function tidy(text: string): string {
  return String(text).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}
function elevenError(status: number, text: string): { code: string; message: string } {
  let detail: unknown = null;
  try {
    detail = (JSON.parse(text) as Rec).detail;
  } catch (_) {
    // 回来的不是 JSON
  }
  const what = isRec(detail) ? String(detail.status ?? detail.code ?? "") : "";
  const said = isRec(detail) ? String(detail.message ?? "") : Array.isArray(detail) ? detail.map((d) => (isRec(d) ? String(d.msg ?? "") : "")).join("；") : typeof detail === "string" ? detail : "";
  const plain = tidy(said || text);
  // 额度用完了先认：ElevenLabs 额度不够的时候回的也是 401（detail.status 写着 quota_exceeded），不能当成 key 不对
  if (status === 402 || /quota|credit|limit_reached|payment/i.test(what + " " + plain)) {
    return { code: "quota", message: "ElevenLabs 的额度用完了（或者这把 key 设的上限到了）" };
  }
  if (status === 401 || /invalid_api_key|api_key|unauthori[sz]ed/i.test(what)) {
    return { code: "key", message: "ElevenLabs 不认这把 key：看看密钥柜里的 ELEVENLABS_API_KEY，还有这把 key 的权限开没开 Text to Speech" };
  }
  if (/voice_not_found|voice.*not.*found/i.test(what + " " + plain)) {
    return { code: "voice", message: "ElevenLabs 找不到这个声音：看看密钥柜里的 ELEVENLABS_VOICE_ID" };
  }
  if (status === 429) return { code: "busy", message: "ElevenLabs 那边太挤，过一会儿再念" };
  if (status >= 500) return { code: "down", message: `ElevenLabs 一时出岔子了（${status}），过一会儿再念` };
  return { code: "refused", message: `ElevenLabs 不肯念（${status}${what ? "，" + tidy(what) : ""}）${plain ? "：" + plain : ""}` };
}

// 读回来的东西像不像一段 mp3：开头是 ID3 标签，或者一上来就是一帧
const looksMp3 = (b: Uint8Array) => b.length > 4 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));

// lost：这一问没走完。cut 网页那头不要了；slow 等太久了；broken 念回来的读到一半断了；offline 根本没连上
type Spoken = { ok: true; bytes: Uint8Array } | { ok: false; status: number; text: string; lost?: "cut" | "slow" | "broken" | "offline" };

// gone：网页那头不要了（她按了停、掐断了那一条，网页把这一问掐了）。跟着把敲 ElevenLabs 的这一问也掐掉：
// 它那头多半就不往下念了（念到哪儿算到哪儿，省一点额度）。
// 等的钟（四十五秒）连读回来的声音一起算：读到一半卡住的也掐
async function ask(url: string, key: string, body: Rec, gone: AbortSignal | null): Promise<Spoken> {
  const late = AbortSignal.timeout(SPEAK_TIMEOUT);
  const signal = gone && typeof AbortSignal.any === "function" ? AbortSignal.any([gone, late]) : late;
  const lost = (e: unknown, reading: boolean): Spoken => {
    if (gone && gone.aborted) return { ok: false, status: 0, text: "网页那头不要了", lost: "cut" };
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return { ok: false, status: 0, text: "等太久了", lost: "slow" };
    return reading ? { ok: false, status: 0, text: "念回来的声音读到一半断了", lost: "broken" } : { ok: false, status: 0, text: "连不上 ElevenLabs", lost: "offline" };
  };
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    return lost(e, false);
  }
  if (!r.ok) {
    let text = "";
    try {
      text = (await r.text()).slice(0, 4000);
    } catch (_) {
      // 读不出来就算了
    }
    return { ok: false, status: r.status, text };
  }
  try {
    return { ok: true, bytes: new Uint8Array(await r.arrayBuffer()) };
  } catch (e) {
    return lost(e, true);
  }
}

// ElevenLabs 不认这个“稳不稳”的数（v3 只认 0、0.5、1；别的模型也许另有讲究）：回的是 400 或 422，话里提到 stability 这些
const badSettings = (got: Spoken) => !got.ok && !got.lost && [400, 422].includes(got.status) && /stabilit|voice_settings|similarity/i.test(got.text);
// 平常念字的那个接口不认这个模型
const badModel = (got: Spoken) => !got.ok && !got.lost && [400, 404, 422].includes(got.status) && /model/i.test(got.text);

// 念一段。先走平常念字的那个接口：
//   它不认“稳不稳”那个数：不带声音的那几项再念一回（照这个声音自己存着的设置念）；
//   它不认这个模型（文档上写着 v4 走多人对话的那个接口）：换那个接口再念一回。
// 这几种它都是一口回绝、没念，再念一回不多扣
async function speak(keys: Extract<Keys, { ok: true }>, text: string, stability: number, gone: AbortSignal | null): Promise<Response> {
  const q = `?output_format=${FORMAT}`;
  const tts = `${ELEVEN}/v1/text-to-speech/${encodeURIComponent(keys.voice)}${q}`;
  let via = "tts";
  let loose = false;
  let got = await ask(tts, keys.key, { text, model_id: keys.model, voice_settings: { stability, similarity_boost: SIMILARITY } }, gone);
  if (badSettings(got)) {
    got = await ask(tts, keys.key, { text, model_id: keys.model }, gone);
    loose = true;
  }
  if (badModel(got)) {
    const again = await ask(`${ELEVEN}/v1/text-to-dialogue${q}`, keys.key, { inputs: [{ text, voice_id: keys.voice }], model_id: keys.model }, gone);
    if (again.ok) {
      got = again;
      via = "dialogue";
    }
  }
  if (!got.ok) {
    // 没走完的那几种。slow、broken：ElevenLabs 也许已经念完、扣过额度了，网页那头不会自己再念（等她点“再念”）；
    // offline：根本没连上，没念，网页那头会歇一下自己再念一回
    if (got.lost === "cut") return fail(499, "不念了", "gone");
    if (got.lost === "slow") return fail(504, "ElevenLabs 念得太久，没等到", "slow");
    if (got.lost === "broken") return fail(502, "念回来的声音读到一半断了", "slow");
    if (got.lost === "offline") return fail(502, "连不上 ElevenLabs", "down");
    const e = elevenError(got.status, got.text);
    return fail(502, e.message, e.code);
  }
  if (got.bytes.length > MAX_AUDIO) return fail(502, "念回来的声音太大了，不对劲", "refused");
  if (!looksMp3(got.bytes)) return fail(502, "念回来的不是声音", "refused");
  const counted = mp3Seconds(got.bytes);
  const dur = counted > 0 ? counted : (got.bytes.length * 8) / BITRATE;
  return json(200, { type: "voice", audio: b64(got.bytes), mime: "audio/mpeg", dur: Math.round(dur * 10) / 10, model: keys.model, via, ...(loose ? { loose: true } : {}) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (req.method !== "POST") return fail(405, "只收 POST");

  // 第一道：必须是登录过的人
  const user = await whoIsKnocking(req);
  if (!user) return fail(401, "请先登录开封府");

  // 第二道：必须是卿卿本人
  const allowed = env("ALLOWED_EMAIL").toLowerCase();
  if (allowed && (user.email ?? "").trim().toLowerCase() !== allowed) return fail(403, "这里只认卿卿");

  let body: Rec;
  try {
    const text = await req.text();
    if (text.length > SMALL_BODY) return fail(413, "寄来的东西太长");
    const parsed = JSON.parse(text);
    if (!isRec(parsed)) throw new Error("不是对象");
    body = parsed;
  } catch (_) {
    return fail(400, "收到的不是合法的 JSON");
  }

  const keys = loadKeys();

  // 问：钥匙放好了没有（不去敲 ElevenLabs 的门，不花钱）。can 是这份代码会做的事
  if (body.op === "key") {
    const can = ["speak"];
    return json(200, keys.ok ? { configured: true, model: keys.model, can } : { configured: false, missing: keys.missing, message: keys.message, model: keys.model, can });
  }

  if (body.op === "speak") {
    if (!keys.ok) return fail(400, keys.message, "setup");
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return fail(400, "没有要念的字", "empty");
    if (Array.from(text).length > MAX_TEXT) return fail(400, `太长了：一回最多念 ${MAX_TEXT} 个字`, "long");
    const s = Number(body.stability);
    const stability = Number.isFinite(s) && s >= 0 && s <= 1 ? s : STABILITY;
    return await speak(keys, text, stability, req.signal ?? null);
  }

  return fail(400, "不认识这个动作");
});
