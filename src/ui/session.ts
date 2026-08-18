/**
 * Oturum kimliği - istatistiğin tek gruplama anahtarı.
 *
 * **`localStorage` değil `sessionStorage`.** Sekme başına yaşıyor, sekmeyle
 * ölüyor; yani yapısal olarak günleri aşamıyor ve cihazı takip etmiyor.
 * Cihaz jetonu (`chessrun:identity`) burada bilerek kullanılmıyor: o bir
 * kimlik iddiası ve sıralama tablosuna ait. İstatistiğe girseydi kalıcı,
 * cihaz bazlı bir davranış profili kurmuş olurduk - çerezsiz sayım
 * kararının tüm amacı buydu.
 *
 * Üstüne 30 dakikalık hareketsizlik kuralı var. Eşik keyfi değil: dışarıyla
 * yapacağın her karşılaştırma (GA dahil) bu eşiği kullanıyor, farklı bir
 * sayı seçmek rakamları kıyaslanamaz kılardı.
 */

const ID_KEY = 'chessrun:sid'
const SEEN_KEY = 'chessrun:sid-seen'
const VISITED_KEY = 'chessrun:sid-visited'
const START_KEY = 'chessrun:sid-start'
const RUNS_KEY = 'chessrun:sid-runs'

/** Hareketsizlik eşiği: 30 dakika */
export const IDLE_MS = 30 * 60 * 1000

export interface Session {
  id: string
  /** Bu oturum yeni mi doğdu - ziyaret olayı yalnızca o zaman gönderiliyor */
  fresh: boolean
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // aşağıdaki yedeğe düşülüyor
  }
  return `s-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/** sessionStorage kapalı olabilir (gizli sekme, katı gizlilik ayarları) */
function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // depolama kapalıysa oturum bu sayfa yüklemesiyle sınırlı kalır
  }
}

/**
 * Geçerli oturumu döndürür, gerekiyorsa yenisini doğurur.
 *
 * `now` enjekte edilebiliyor çünkü 30 dakika kuralının testi başka türlü
 * gerçek zaman beklemek zorunda kalırdı.
 */
export function touchSession(now: number = Date.now()): Session {
  const id = read(ID_KEY)
  // Kaydın VARLIĞINA bakılıyor, değerinin pozitifliğine değil: `seen > 0`
  // yazılırsa geçerli bir 0 damgası "hiç görülmemiş" sayılır.
  const seenRaw = read(SEEN_KEY)
  const seen = seenRaw === null ? null : Number(seenRaw)
  const alive = id !== null && seen !== null && Number.isFinite(seen) && now - seen <= IDLE_MS

  write(SEEN_KEY, String(now))

  if (alive) return { id: id as string, fresh: false }

  const next = newId()
  write(ID_KEY, next)
  write(START_KEY, String(now))
  write(RUNS_KEY, '0')
  // Yeni oturum: ziyaret bayrağı sıfırlanıyor ki beacon bir kez daha gitsin
  try {
    sessionStorage.removeItem(VISITED_KEY)
  } catch {
    // yok sayılıyor
  }
  return { id: next, fresh: true }
}

/**
 * Ziyaret olayı bu oturumda daha önce gönderildi mi?
 *
 * Aynı sekmede sert yenileme oturumu öldürmüyor, bu yüzden `fresh` tek
 * başına yetmez - ayrı bir bayrak gerekiyor. Sunucudaki `(gün, hash)`
 * tekilleştirmesi ikinci savunma hattı ve birden çok sekmeyi karşılıyor.
 */
export function claimVisit(): boolean {
  if (read(VISITED_KEY) === '1') return false
  write(VISITED_KEY, '1')
  return true
}

export function sessionStart(): number {
  return Number(read(START_KEY) ?? '0')
}

export function countRun(): number {
  const next = Number(read(RUNS_KEY) ?? '0') + 1
  write(RUNS_KEY, String(next))
  return next
}

export function sessionRuns(): number {
  return Number(read(RUNS_KEY) ?? '0')
}
