// =====================================================
// 开封府 · 传话的小后端（函数名：claude）
// 只做一件事：确认敲门的是卿卿本人，再替她把话转给 Anthropic。
// Anthropic 的 key 只存在 Supabase 的密钥柜里，网页和手机上都没有。
// =====================================================

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ALLOWED_EMAIL = (Deno.env.get("ALLOWED_EMAIL") ?? "").trim().toLowerCase();
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

// Supabase 自动放进来的公开钥匙（新版在 SUPABASE_PUBLISHABLE_KEYS 里，旧版叫 SUPABASE_ANON_KEY）
function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
    const first = Object.values(keys)[0];
    if (typeof first === "string") return first;
  } catch (_) {
    // 没有新版钥匙就用旧版
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}
const PUBLISHABLE = publishableKey();

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kfs-beta",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 出错时用和 Anthropic 一样的格式回话，网页那边一套处理就够了
function fail(status: number, message: string): Response {
  return new Response(JSON.stringify({ type: "error", error: { type: "kaifengfu", message } }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// 拿着她手里的登录凭证去问 Supabase：这是谁
async function whoIsKnocking(req: Request): Promise<{ id: string; email?: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !SUPABASE_URL || !PUBLISHABLE) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user && typeof user.id === "string" ? user : null;
  } catch (_) {
    return null;
  }
}

const BETA_PATTERN = /^[a-z0-9-]+(,[a-z0-9-]+)*$/;
const MODEL_PATTERN = /^claude-[a-z0-9.-]+$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "只收 POST");
  if (!ANTHROPIC_API_KEY) return fail(500, "密钥柜里还没有 ANTHROPIC_API_KEY");

  // 第一道：必须是登录过的人
  const user = await whoIsKnocking(req);
  if (!user) return fail(401, "请先登录开封府");

  // 第二道：必须是卿卿本人
  if (ALLOWED_EMAIL && (user.email ?? "").trim().toLowerCase() !== ALLOWED_EMAIL) {
    return fail(403, "这里只认卿卿");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_) {
    return fail(400, "收到的不是合法的 JSON");
  }

  // 测试用：发 {"ping": true}，回一个“在”
  if (body && body.ping === true) {
    body = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16,
      messages: [{ role: "user", content: "回一个字：在" }],
    };
  }

  // 防手滑：只认 Claude 的模型，回复长度设个上限
  if (!MODEL_PATTERN.test(String(body.model ?? ""))) return fail(400, "模型名不对");
  const maxTokens = Number(body.max_tokens ?? 0);
  if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 32000) {
    return fail(400, "max_tokens 超出范围");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };
  const beta = (req.headers.get("x-kfs-beta") ?? "").trim();
  if (beta && BETA_PATTERN.test(beta)) headers["anthropic-beta"] = beta;

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    return fail(502, "连不上 Anthropic：" + String(e).slice(0, 120));
  }

  // 原样转回去（以后要一个字一个字地冒出来，也走这条路）
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...CORS, "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
});
