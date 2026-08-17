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

import type { PieceType } from '../engine/types'
import { type Lang, translate } from './i18n'
import { PIECE_NAME_KEY } from './pieces'
import { getSettings } from './settings'

export interface Identity {
  /** Cihazın kalıcı kimliği */
  token: string
  /** Görünen ad — oyuncu değiştirebilir */
  name: string
  createdAt: string
}

const IDENTITY_KEY = 'chessrun:identity'
const SECRET_KEY = 'chessrun:secret'

const PIECES: PieceType[] = ['n', 'b', 'r', 'q', 'p', 'k']

/**
 * Rastgele ad, o anki arayüz dilinde. Kalıp ve belirteç listesi
 * sözlükten (`name.pattern`, `name.mods`) geliyor; taş adı `piece.*`.
 *
 * Yalnızca iki anda çağrılıyor: ilk kimlik oluşturulurken (site İngilizce
 * açıldıysa İngilizce ad) ve oyuncu ⟳'a bastığında (o an seçili dilde).
 * Dil değiştirmek ada DOKUNMAZ — ad oyuncunun etiketi, arayüz metni değil.
 *
 * Sıfat değil AD-belirteç kullanılıyor ("Gölge Vezir", "Shadow Queen",
 * "Schatten-Dame", "Dama Sombra", "Dame Ombre"): sıfat olsaydı DE/ES/FR'de
 * cinsiyet uyumu gerekirdi ("Schneller Springer" ama "Schnelle Dame").
 * Ad-belirteç her dilde uyumsuz kalabiliyor.
 */
export function randomName(lang: Lang = getSettings().lang): string {
  const mods = translate(lang, 'name.mods').split('|').filter(Boolean)
  const mod = mods[Math.floor(Math.random() * mods.length)] ?? ''
  const piece = translate(lang, PIECE_NAME_KEY[PIECES[Math.floor(Math.random() * PIECES.length)]])
  const n = 100 + Math.floor(Math.random() * 900)
  return translate(lang, 'name.pattern', { mod, piece, n })
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

/** Ad için üst sınır — sıralama satırına ve künye fişine sığan uzunluk */
export const NAME_MAX = 24

/** Kimliğe bürünmeye kapalı adlar: küçük harfe indirilip boşluksuz karşılaştırılıyor */
const RESERVED = ['chessrun', 'smartkraft', 'admin', 'sistem', 'system']

/**
 * Adı sıralama tablosuna girecek hâle getirir — tekilliği DEĞİL hijyeni
 * sağlıyor. Tekillik hesapsız modelde anlamsız: kimlik jeton, ad etiket;
 * tabloda adın yanında zaten kısa jeton duruyor.
 *
 * - `#` yasak: kısa jeton `#f93c` biçimiyle karışıp "Ahmet #f93c" taklidine
 *   izin vermesin
 * - kontrol ve yön karakterleri (RTL override, sıfır genişlik) atılıyor —
 *   görünmez ad ve görsel taklit yolu
 * - ardışık boşluk teke iniyor, kırpılıyor, NAME_MAX'a kesiliyor
 * - rezerve adlar reddediliyor
 *
 * Boş ya da geçersiz sonuç `null`: çağıran ya eski adı korur ya rastgele üretir.
 */
export function cleanName(raw: string): string | null {
  // Kontrol karakterleri kasıtlı olarak eşleniyor (görünmez ad ve yön
  // hilesi yolu); `u` bayrağı + \p{Cc}/\p{Cf} lint'in "kontrol karakteri"
  // uyarısına takılmadan aynı işi görüyor.
  const cleaned = raw
    .replace(/[#\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim()
  if (!cleaned) return null
  const flat = cleaned.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  if (RESERVED.some((word) => flat === word || flat.startsWith(word))) return null
  return cleaned
}

/**
 * Adı değiştirir. Geçersiz ad verilirse mevcut ad korunur ve `null` döner —
 * arayüz "olmadı" diyebilsin. Boş verilirse rastgele yeni ad üretilir.
 */
export function renameIdentity(name: string): Identity | null {
  const current = getIdentity()
  if (!name.trim()) {
    const identity: Identity = { ...current, name: randomName() }
    store(identity)
    cached = identity
    return identity
  }
  const cleaned = cleanName(name)
  if (!cleaned) return null
  const identity: Identity = { ...current, name: cleaned }
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
