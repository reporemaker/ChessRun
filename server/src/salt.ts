/**
 * Ziyaretçi tekilleştirmesi — çerezsiz, IP saklamadan.
 *
 * `hash = SHA-256(günlük_tuz ‖ ip ‖ ua ‖ "chessrun")`, ilk 16 bayt.
 *
 * **IP yalnızca bu dosyadaki bir yerel değişken olarak var ve hiçbir yere
 * yazılmıyor.** Tuz her gece dönüyor, bir öncekiyse 48 saat sonra
 * siliniyor — o andan itibaren dünkü hash'ler hiçbir IP'ye geri
 * bağlanamıyor. Plausible/Fathom'ın modeli bu.
 *
 * Dürüst not: "geri döndürülemez şekilde anonimleştirildiği için kişisel
 * veri değildir" yorumu yaygın ve savunulabilir, ama mahkeme testinden
 * geçmiş değil.
 *
 * İki anahtar tutuluyor. Gece yarısını 00:05'teki cron'dan önce geçen bir
 * istek hâlâ dünkü tuzla geliyor; `yesterday` olmasa o birkaç dakikalık
 * pencerede aynı ziyaretçi iki kez sayılırdı.
 */

const TODAY = 'salt:today'
const YESTERDAY = 'salt:yesterday'
const TTL_SECONDS = 172_800 // 48 saat

export interface SaltStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

function randomSalt(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Bugünün tuzunu döndürür; yoksa üretip yazar.
 *
 * Cron ölse bile toplama çalışmaya devam etsin diye tembel üretim var —
 * tuz yoksa ziyaretçi sayımı tamamen durmuş olurdu.
 */
export async function currentSalt(store: SaltStore): Promise<string> {
  const existing = await store.get(TODAY)
  if (existing) return existing
  const fresh = randomSalt()
  await store.put(TODAY, fresh, { expirationTtl: TTL_SECONDS })
  return fresh
}

/** Gecelik döndürme: bugünkü dünkü olur, yeni bir bugün üretilir */
export async function rotateSalt(store: SaltStore): Promise<void> {
  const today = await store.get(TODAY)
  if (today) await store.put(YESTERDAY, today, { expirationTtl: TTL_SECONDS })
  await store.put(TODAY, randomSalt(), { expirationTtl: TTL_SECONDS })
}

export async function hashVisitor(salt: string, ip: string, ua: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}|${ip}|${ua}|chessrun`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest).slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
