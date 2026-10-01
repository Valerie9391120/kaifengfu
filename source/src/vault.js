// =====================================================
// 暗号与钥匙
// 暗号 → PBKDF2（60万轮）→ 两把钥匙：
//   一把 AES-GCM 加密内容，一把 HMAC 打乱钥匙名。
// 钥匙不能导出，只存在这台设备的浏览器数据库里；暗号本身从不保存、从不上传。
// =====================================================

const te = new TextEncoder();
const td = new TextDecoder();

export const KDF_ITER = 600000;
export const CHECK_TEXT = "开封府";

export function toB64(bytes) {
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function toB64url(bytes) {
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveVault(passphrase, salt, iterations = KDF_ITER) {
  const base = await crypto.subtle.importKey("raw", te.encode(String(passphrase).normalize("NFC")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 512)
  );
  const aes = await crypto.subtle.importKey("raw", bits.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const mac = await crypto.subtle.importKey("raw", bits.slice(32, 64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  bits.fill(0);
  return { aes, mac };
}

// 加密：每次随机一个 iv，结果形如 v1.<iv>.<密文>
export async function seal(vault, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, vault.aes, te.encode(text)));
  return "v1." + toB64(iv) + "." + toB64(ct);
}

export async function unseal(vault, sealed) {
  const parts = String(sealed || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("不认识的格式");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(parts[1]) }, vault.aes, fromB64(parts[2]));
  return td.decode(pt);
}

// 云端看到的钥匙名：h_ 加一串打乱的字，看不出是聊天、日记还是照片
export async function rowKeyFor(vault, name) {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", vault.mac, te.encode(name)));
  return "h_" + toB64url(sig.subarray(0, 24));
}
