import { RECOVERY_CODE_LEN, RECOVERY_KDF_ITERATIONS } from '@shared/leaderboard'

/**
 * Kurtarma kodu - saf kısım (ağ yok, depo yok; test edilebilir).
 *
 * Kod 12 karakter Crockford base32 (I/L/O/U yok - okunuşta karışmasın),
 * XXXX-XXXX-XXXX diye gösterilir. Koddan PBKDF2-SHA256 ile iki değer türer:
 *   lookup = PBKDF2(kod, "chessrun-recovery-lookup")  → sunucudaki satırın anahtarı
 *   key    = PBKDF2(kod, "chessrun-recovery-key")     → AES-GCM anahtarı
 * Sunucu yalnızca `lookup` (kendi sırrıyla bir kez daha HMAC'lenmiş) ve
 * şifreli blob'u görür; kodun kendisini asla. 60 bit rastgele kod × 120 bin
 * tur: veritabanı ve sunucu sırrı birlikte sızsa bile kaba kuvvet ≈ 2^77 SHA
 * (yalnızca veritabanı sızarsa biber yüzünden hiçbir şey denenemez).
 * Cihazda maliyet iki türetme ≈ 100-200 ms, yalnızca kod oluştur/gir anında.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function generateCode(): string {
  const bytes = new Uint8Array(RECOVERY_CODE_LEN)
  crypto.getRandomValues(bytes)
  // 256 % 32 === 0 → mod almak yanlı değil
  return [...bytes].map((b) => ALPHABET[b % 32]).join('')
}

/** XXXX-XXXX-XXXX */
export function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-')
}

/**
 * Kullanıcının yazdığını koda çevirir: büyük harf, ayraçlar atılır,
 * O→0, I/L→1, U→V (Crockford). Uzunluk ya da alfabe tutmazsa null.
 */
export function normalizeCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
  if (code.length !== RECOVERY_CODE_LEN) return null
  for (const ch of code) if (!ALPHABET.includes(ch)) return null
  return code
}

async function pbkdf2(code: string, salt: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const material = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: RECOVERY_KDF_ITERATIONS },
    material,
    256,
  )
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

/** Sunucuya giden anahtar - kodun kendisi değil */
export async function lookupOf(code: string): Promise<string> {
  return hex(await pbkdf2(code, 'chessrun-recovery-lookup'))
}

async function keyOf(code: string): Promise<CryptoKey> {
  const raw = await pbkdf2(code, 'chessrun-recovery-key')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Blob içeriği - kimliği başka cihazda yeniden kurmaya yeten her şey */
export interface RecoveryPayload {
  v: 1
  token: string
  /** base64 */
  secret: string
  name: string
  createdAt: string
}

/** base64(iv ‖ şifreli metin) */
export async function encryptPayload(code: string, payload: RecoveryPayload): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyOf(code)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)))
  const out = new Uint8Array(12 + cipher.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(cipher), 12)
  return toBase64(out)
}

/** Yanlış kod ya da bozuk blob → null (AES-GCM doğrulaması düşer) */
export async function decryptPayload(code: string, blob: string): Promise<RecoveryPayload | null> {
  try {
    const bytes = fromBase64(blob)
    if (bytes.length < 12 + 16) return null
    const key = await keyOf(code)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as Partial<RecoveryPayload>
    if (parsed?.v !== 1 || typeof parsed.token !== 'string' || typeof parsed.secret !== 'string') return null
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(parsed.token)) return null
    return {
      v: 1,
      token: parsed.token,
      secret: parsed.secret,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export { toBase64 as bytesToBase64, fromBase64 as base64ToBytes }
