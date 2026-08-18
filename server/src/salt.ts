/**
 * Ziyaretçi tekilleştirmesi - çerezsiz, IP saklamadan.
 *
 * `hash = SHA-256(günlük_tuz ‖ ip ‖ ua ‖ "chessrun")`, ilk 16 bayt.
 *
 * **IP yalnızca bu dosyadaki bir yerel değişken olarak var ve hiçbir yere
 * yazılmıyor.** Tuz her gece dönüyor, bir öncekiyse 48 saat sonra
 * siliniyor - o andan itibaren dünkü hash'ler hiçbir IP'ye geri
 * bağlanamıyor. Plausible/Fathom'ın modeli bu.
 *
 * Dürüst not: "geri döndürülemez şekilde anonimleştirildiği için kişisel
 * veri değildir" yorumu yaygın ve savunulabilir, ama mahkeme testinden
 * geçmiş değil.
 *
 * Tuz GÜNE bağlı: `salt:<gün>` anahtarı, ilk istekte tembel üretilir, 48
 * saat sonra KV kendiliğinden siler. Eskiden "bugün/dün" çifti vardı ve
 * 00:05'teki cron döndürüyordu; gün anahtarı 00:00'da değiştiği için o beş
 * dakikada aynı ziyaretçi iki kez sayılıyordu ve `yesterday` hiç okunmuyordu
 * (19 Ağustos denetimi). Güne bağlı anahtarda böyle bir pencere yok ve cron
 * ölse de sayım bozulmuyor.
 */

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

export function saltKey(day: string): string {
  return `salt:${day}`
}

/**
 * Günün tuzunu döndürür; yoksa üretip yazar. İki izole aynı anda "yok"
 * görüp iki farklı tuz yazabilir - o günün ilk saniyesindeki birkaç
 * ziyaretçi bir kez fazla sayılır, kabul edilebilir (KV son yazan kazanır,
 * sonraki istekler tek tuzda birleşir).
 */
export async function currentSalt(store: SaltStore, day: string): Promise<string> {
  // İzole başına bellek: KV okuması ziyaret başına değil gün başına
  // (KV Free 100k okuma/gün; ziyaret beacon'ı onu tüketebilirdi)
  if (memo && memo.day === day && memo.store === store) return memo.salt
  const key = saltKey(day)
  let salt = await store.get(key)
  if (!salt) {
    salt = randomSalt()
    await store.put(key, salt, { expirationTtl: TTL_SECONDS })
  }
  memo = { day, salt, store }
  return salt
}

let memo: { day: string; salt: string; store: SaltStore } | null = null

export async function hashVisitor(salt: string, ip: string, ua: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}|${ip}|${ua}|chessrun`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest).slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
