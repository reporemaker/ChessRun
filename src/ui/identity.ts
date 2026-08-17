/**
 * Hesapsız kimlik: her tarayıcı kendi jetonunu ve imzalama anahtarını üretir.
 *
 * E-posta/şifre istemeden "bu skor bu cihaza ait" diyebilmenin yolu bu.
 * Jeton kalıcı (localStorage), anahtar cihazdan hiç çıkmıyor; skorlar
 * HMAC-SHA256 ile imzalanıyor.
 *
 * Dürüst sınır: anahtar tarayıcıda durduğu için bu imza *kurcalamayı*
 * fark ettirir, kararlı bir hile girişimini durduramaz — depolamayı elle
 * düzenleyen biri kendi anahtarıyla yeniden imzalayabilir. Gerçek koruma
 * ancak sunucu tarafında, tohumlu bir koşunun tekrar oynatılıp
 * doğrulanmasıyla olur (bkz. README, sıradaki adımlar).
 */

export interface Identity {
  /** Cihazın kalıcı kimliği */
  token: string
  /** Görünen ad — oyuncu değiştirebilir */
  name: string
  createdAt: string
}

const IDENTITY_KEY = 'chessrun:identity'
const SECRET_KEY = 'chessrun:secret'

const ADJECTIVES = [
  'Sessiz', 'Hızlı', 'Cesur', 'Kurnaz', 'Soğukkanlı',
  'Çelik', 'Gölge', 'Yalın', 'Ateşli', 'Sabırlı',
]

const NOUNS = ['At', 'Fil', 'Kale', 'Vezir', 'Piyon', 'Şah']

function randomName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adjective} ${noun} ${100 + Math.floor(Math.random() * 900)}`
}

/** Eski tarayıcılarda ve test ortamında yokluğa dayanıklı erişim */
function webcrypto(): Crypto | undefined {
  return typeof crypto === 'undefined' ? undefined : crypto
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const api = webcrypto()

  if (api) api.getRandomValues(bytes)
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)

  return bytes
}

function randomToken(): string {
  const uuid = webcrypto()?.randomUUID?.()
  if (uuid) return uuid
  return [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

let cached: Identity | null = null

export function getIdentity(): Identity {
  if (cached) return cached

  try {
    const stored = localStorage.getItem(IDENTITY_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Identity
      if (parsed?.token) {
        cached = parsed
        return parsed
      }
    }
  } catch {
    // bozuk kayıt: yenisini üret
  }

  const identity: Identity = {
    token: randomToken(),
    name: randomName(),
    createdAt: new Date().toISOString(),
  }
  store(identity)
  cached = identity
  return identity
}

export function renameIdentity(name: string): Identity {
  const trimmed = name.trim().slice(0, 24)
  const identity = { ...getIdentity(), name: trimmed || randomName() }
  store(identity)
  cached = identity
  return identity
}

function store(identity: Identity): void {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  } catch {
    // depolama kapalı: kimlik yalnızca bu oturumda yaşar
  }
}

/** Jetonun gösterilebilir kısa hâli: `a1b2…9f` */
export function shortToken(token: string): string {
  const clean = token.replace(/-/g, '')
  return `${clean.slice(0, 4)}…${clean.slice(-2)}`
}

/* ------------------------------------------------------------------ *
 * İmzalama
 * ------------------------------------------------------------------ */

function secretBytes(): Uint8Array {
  try {
    const stored = localStorage.getItem(SECRET_KEY)
    if (stored) return Uint8Array.from(atob(stored), (c) => c.charCodeAt(0))
  } catch {
    // yeni anahtar üretilecek
  }

  const bytes = randomBytes(32)

  try {
    localStorage.setItem(SECRET_KEY, btoa(String.fromCharCode(...bytes)))
  } catch {
    // yoksay
  }
  return bytes
}

async function hmacKey(): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  return crypto.subtle.importKey(
    'raw',
    secretBytes() as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** İmzalanan metin: alanların sırası sunucuyla birebir aynı olmalı */
export function runPayload(fields: (string | number)[]): string {
  return fields.join('|')
}

export async function signPayload(payload: string): Promise<string | null> {
  try {
    const key = await hmacKey()
    if (!key) return null
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
  } catch {
    return null
  }
}

export async function verifyPayload(payload: string, signature: string): Promise<boolean> {
  const expected = await signPayload(payload)
  return expected != null && expected === signature
}
