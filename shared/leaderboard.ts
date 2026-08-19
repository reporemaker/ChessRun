import type { Mode } from './events'

/**
 * Haftalık sıralama sunucusunun sözleşmesi - oyun, Worker ve panel
 * arasındaki tek ortak tanım (istatistik için `events.ts` neyse bu da o).
 *
 *   POST /lb/runs                 gövde: SubmitBody                → 204 (her durumda)
 *   GET  /lb/weekly?mode=&week=   başlık: x-chessrun-token (ist.)  → WeeklyResponse
 *   GET  /lb/pulse?day=                                            → PulseResponse
 *
 * Güven modeli dürüstçe: cihaz jetonu **taşıyıcı sırdır**. Sunucu imzayı
 * doğrulayamıyor (anahtar cihazda), jetonu bilen skoru gönderebilir. Bu
 * yüzden sunucu jetonu ham saklamıyor (SHA-256), dışarı yalnızca kısa
 * hâlini veriyor ve tabloyu haftada bir sıfırlıyor - hilenin ödülü küçük,
 * izi bir hafta.
 */

export const BADGE_TIERS = ['black', 'bronze', 'silver', 'gold'] as const
export type BadgeTier = (typeof BADGE_TIERS)[number]

/** Beyaz-liste kelepçesi: bunların dışındaki değerler sessizce atılıyor */
export const LB_LIMITS = {
  nameMax: 24,
  scoreMax: 1_000_000,
  distanceMax: 1_000_000,
  colsMin: 4,
  colsMax: 8,
  levelMax: 999,
  /** Haftalık listede dönen satır sayısı */
  listLimit: 12,
  /** Ad değişikliği: sunucu günde bu kadar kabul ediyor */
  renamesPerDay: 3,
} as const

/* ------------------------------------------------------------------ *
 * Sahtecilik frenleri - ucuz ve kaba, bilerek.
 *
 * Jeton taşıyıcı sır: curl ile istenen skor yazılabiliyor. Tam çözüm
 * (tohumlu tekrar oynatma) sonraya; buradakiler yalnızca absürdü keser ve
 * moderatöre işaret bırakır:
 *   - makullük: satır başına en çok şu kadar puan (motorun teorik tavanının
 *     üstü: Av/Kaçış/Üçlü bir turda şah 25 + zincir şah 10 + mat 5/20 +
 *     tehdit + satır 1 + sıkışma 5 ≈ 64; günlükte bir kayma aralığında
 *     birden çok yeme olabildiği için çok daha gevşek),
 *   - sıklık: jeton başına dakikada en çok N koşu (bir koşu saniyeler sürer),
 *   - panel işareti: puan/satır "şüpheli" eşiğini aşan ya da dakikalık
 *     sınıra dayanan oyuncu ⚠ ile listelenir → tek tıkla Gizle.
 * ------------------------------------------------------------------ */
/** Satır başına kabul edilen en yüksek puan (üstü: koşu atılır) */
export const PLAUSIBLE_PER_ROW: Record<Mode, number> = { classic: 80, kingRun: 80, trio: 100, daily: 1000 }
/** Panel işareti için "olağan dışı" puan/satır eşiği (gerçek oyunda görülenin ~2 katı) */
export const SUSPECT_PER_ROW: Record<Mode, number> = { classic: 8, kingRun: 8, trio: 12, daily: 60 }
export const BURST_WINDOW_MS = 60_000
/** Pencere içinde kabul edilen koşu sayısı; üstü düşer */
export const BURST_MAX_RUNS = 8

export function plausibleScoreMax(mode: Mode, distance: number): number {
  return PLAUSIBLE_PER_ROW[mode] * (Math.max(0, distance) + 1)
}

/* ------------------------------------------------------------------ *
 * Günlük çarpan - günün mücadelesi puanı o günkü diğer koşuları büyütür
 *
 * çarpan = 1 + günlükPuan / DAILY_BONUS_DIV, ÜST SINIR YOK (kullanıcı kararı,
 * 18 Ağustos): 150 → ×1,15 · 500 → ×1,5 · 1000 → ×2 · 1882 → ×2,88.
 * Yalnızca mücadeleden SONRA oynanan koşulara (aynı yerel takvim günü).
 * Sunucu kendi kaydından uygular (istemcinin çarptığı skora güvenmez),
 * istemci aynı formülle gösterir. Skor kelepçesi (LB_LIMITS.scoreMax)
 * çarpımdan sonra da geçerli.
 * ------------------------------------------------------------------ */
export const DAILY_BONUS_DIV = 1000

export function dailyBonus(dailyScore: number | null | undefined): number {
  if (dailyScore == null || !(dailyScore > 0)) return 1
  return 1 + dailyScore / DAILY_BONUS_DIV
}

/**
 * Jetonun gösterilebilir kısa hâli: `a1b2c3…9f` (6+2 = 32 bit). Eskiden 4+2
 * (24 bit): ~1000 oyuncuda %3 çakışma, iki kişi aynı görünüyordu. Tek kaynak:
 * sunucu `lb_player.short` buraya göre yazar/yeniler, istemci "ben" vurgusu
 * ve künye için aynı fonksiyonu kullanır. Geçiş: eski 7 karakterli kısa
 * hâller tabloda kalabilir; istemci `shortMatches` ile ikisini de tanır.
 */
export function shortOf(token: string): string {
  const clean = token.replace(/-/g, '')
  return `${clean.slice(0, 6)}…${clean.slice(-2)}`
}

/** Tablodaki kısa hâl (eski 4+2 ya da yeni 6+2) bu jetonun mu */
export function shortMatches(short: string, token: string): boolean {
  const clean = token.replace(/-/g, '')
  const i = short.indexOf('…')
  if (i < 0) return false
  const head = short.slice(0, i)
  const tail = short.slice(i + 1)
  return head.length >= 4 && clean.startsWith(head) && clean.endsWith(tail)
}

/** Çarpan uygulanmış puan (aşağı yuvarlanır, skor tavanıyla kelepçeli) */
export function applyDailyBonus(score: number, dailyScore: number | null | undefined): number {
  return Math.min(LB_LIMITS.scoreMax, Math.floor(score * dailyBonus(dailyScore)))
}

export interface SubmitBody {
  token: string
  name: string
  alg: 'HMAC-SHA256'
  mode: Mode
  /** HAM puan (çarpansız); sunucu günlük çarpanı kendisi uygular */
  score: number
  distance: number
  cols: number
  level: number
  /** ISO zaman damgası */
  at: string
  /** ISO hafta: 2026-W33 */
  week: string
  /** Günlük meydan okumaysa günün anahtarı */
  daily?: string
  /** Koşunun yerel takvim günü - günlük çarpanın hangi güne bakacağı (daily ile aynı biçim) */
  day?: string
  /** İstemcinin kendi anahtarıyla attığı imza - sunucu saklıyor, doğrulayamıyor */
  sig?: string
  /** Oyuncunun seçtiği rozet - tabloda adın önünde */
  badge?: string
  badgeTier?: BadgeTier
}

/**
 * Haftalık lig satırı. `score` = o hafta o modda BİRİKTİRİLEN toplam puan
 * (her koşu eklenir; günlük çarpan uygulanmış), `distance` = toplam satır,
 * `runs` = koşu sayısı, `best` = en iyi tek koşu (bilgi). Sıra: toplam puan,
 * eşitlikte toplam satır, sonra erken gelen.
 */
export interface WeeklyEntry {
  place: number
  name: string
  /** Jetonun kısa hâli `a1b2c3…9f` (eski satırlarda `a1b2…9f`) - tam jeton hiçbir cevapta yok */
  token: string
  score: number
  distance: number
  runs: number
  best: number
  badge?: string
  badgeTier?: BadgeTier
}

export interface WeeklyResponse {
  week: string
  mode: Mode
  entries: WeeklyEntry[]
  /** Bu hafta bu modda en az bir koşu yollayan oyuncu sayısı */
  players: number
  /** Başlıkta jeton geldiyse ve tabloda varsa: kendi sıran (listede olmasan da) */
  me?: { place: number; score: number; distance: number; runs: number; best: number }
  /** Geçen haftanın ilk üçü - Pazartesi kazananlar iz bırakmadan silinmesin */
  lastWeek?: { week: string; entries: WeeklyEntry[] }
}

export interface PulseResponse {
  day: string
  players: number
}

/**
 * Günün Mücadelesi - tohum ve tek hak, sunucuda.
 *
 *   GET  /lb/daily?day=YYYY-MM-DD   başlık: x-chessrun-token (ist.)  → DailyResponse
 *   POST /lb/daily/start            gövde: DailyStartBody             → DailyResponse
 *
 * Tohum sunucu sırrından türer (HMAC(secret, gün)); tarihten hesaplanan
 * tohum herkesçe önceden bilinir ve yarının tahtası çalışılabilirdi.
 * Hak KOŞU BAŞLAYINCA yanar: `start` günü + jeton hash'ini `lb_daily`ye
 * yazar (aynı tablo nabzı da besliyor: "bugün X kişi oynadı"). Cevaptaki
 * `played` çağrı ÖNCESİ durum - start'ta true dönerse hak zaten yanmıştı,
 * oyun başlamamalı. Gün istemcinin takvim günü; sunucu UTC güne ±1 gün
 * tolerans tanır (saat dilimleri), dışı reddedilir.
 */
export interface DailyStartBody {
  token: string
  day: string
}

export interface DailyResponse {
  day: string
  /** 32 bit tohum */
  seed: number
  /** Jeton verildiyse: bu gün için hak yandı mı (start'ta: çağrı öncesi) */
  played: boolean
}

/**
 * GET /lb/awards  başlık: x-chessrun-token  → AwardsResponse
 *
 * Bitmiş haftalarda (bu hafta hariç) oyuncunun birinci bitirdiği
 * hafta×mod çiftleri. Lig rozetleri (weekFirst · weekKing · emperor)
 * istemcide bundan türetiliyor; sunucu rozet bilmiyor, yalnızca sonucu
 * biliyor. Yalnız başına oynanan hafta birincilik sayılmıyor
 * (`AWARD_MIN_PLAYERS`).
 */
export const AWARD_MIN_PLAYERS = 2

export interface AwardsResponse {
  firsts: Array<{ week: string; mode: Mode }>
}

/* ------------------------------------------------------------------ *
 * Kalıcılık (Faz 10) - kurtarma kodu + sunucu profili
 *
 *   POST /lb/recovery         gövde: RecoveryPutBody   → 204 (her durumda)
 *   POST /lb/recovery/fetch   gövde: RecoveryFetchBody → RecoveryFetchResponse | 404
 *   GET  /lb/profile          başlık: x-chessrun-token → ProfileResponse
 *   POST /lb/profile          gövde: ProfilePutBody    → ProfileResponse
 *
 * Kurtarma kodu 12 karakter (Crockford base32, XXXX-XXXX-XXXX). Sunucu kodu
 * HİÇ görmüyor: istemci koddan PBKDF2 (SHA-256, RECOVERY_KDF_ITERATIONS) ile
 * iki değer türetiyor - `lookup` (satırın anahtarı) ve blob'u şifreleyen AES
 * anahtarı. Sunucu `lookup`ı bir de kendi sırrıyla HMAC'leyip saklıyor
 * (biber): veritabanı tek başına sızsa çevrimdışı deneme için hiçbir şey yok;
 * sır + veritabanı birlikte sızsa bile 60 bit × PBKDF2 maliyeti (≈2^77 SHA)
 * pratik değil. Çevrimiçi deneme WAF hız sınırına takılır.
 *
 * Profil istemcinin yazdığı JSON (rozetler, ömür boyu sayaçlar, defter);
 * sunucu içeriğe bakmıyor, yalnızca boyutu kelepçeliyor. "Otoriter" olduğu
 * tek yer sıfırlama: moderatör başarımları sıfırlarsa `resetAt` dolar ve
 * cihaz yerel kopyayı da siler.
 * ------------------------------------------------------------------ */

export const RECOVERY_CODE_LEN = 12
/** İstemci tarafı KDF turu - telefonda ~100 ms, kaba kuvvette 10^5 kat maliyet */
export const RECOVERY_KDF_ITERATIONS = 120_000
export const RECOVERY_LOOKUP_RE = /^[a-f0-9]{64}$/
export const RECOVERY_BLOB_MAX = 2048
export const PROFILE_MAX_BYTES = 48 * 1024

export interface RecoveryPutBody {
  token: string
  lookup: string
  /** base64 AES-GCM (12 bayt iv + şifreli metin) */
  blob: string
}
export interface RecoveryFetchBody {
  lookup: string
}
export interface RecoveryFetchResponse {
  blob: string
}

/** İstemcinin yazdığı, sunucunun içine bakmadığı profil */
export interface ProfileData {
  badges: unknown
  lifetime: unknown
  runs: unknown[]
}

export interface ProfilePutBody {
  token: string
  /** Oyuncunun o anki adı - koşu beklemeden sunucuya işlenir */
  name: string
  badge?: string
  badgeTier?: BadgeTier
  /** Verilmezse yalnızca ad/rozet güncellenir */
  data?: ProfileData
  /**
   * İstemcinin uyguladığı son sıfırlama damgası (ms). Sunucu, `reset_at`
   * bundan yeniyse `data`yı YOK SAYAR: sıfırlamadan habersiz bir cihazın
   * eski verisi sıfırlanmış profili dirilte­mesin. İstemci sıfırlamayı
   * uygulayınca damgayı öğrenir ve bir sonraki gönderim kabul edilir.
   */
  resetSeen?: number
}

export interface ProfileResponse {
  /** Sunucunun listede gösterdiği ad */
  name: string
  /** İstemcinin yolladığı ad bu istekte reddedildi (filtre / rezerve / moderatör) */
  nameRejected: boolean
  data: ProfileData | null
  updatedAt: number | null
  /** Moderatör sıfırladıysa: an (ms). İstemci bundan sonra yerel kopyayı da siler. */
  resetAt: number | null
  /** Bu istekteki `data` boyut/sıfırlama yüzünden yazılmadıysa true */
  dataDropped?: boolean
}

/* ------------------------------------------------------------------ *
 * Panel - /api/names, /api/words (Access arkasında)
 * ------------------------------------------------------------------ */

export const PLAYER_STATUSES = ['ok', 'shadow', 'banned'] as const
export type PlayerStatus = (typeof PLAYER_STATUSES)[number]

/** Panel liste filtresi: durumlar + "öksüz" (1 yıl koşusuz, hiç birincilik yok) */
export const ORPHAN_AFTER_MS = 365 * 86_400_000

export interface PlayerRow {
  /** Jetonun SHA-256'sı - moderasyon eylemlerinin anahtarı; ham jeton değil */
  hash: string
  short: string
  name: string
  status: PlayerStatus
  badge: string | null
  badgeTier: BadgeTier | null
  runs: number
  firstSeen: number
  lastSeen: number
  /** Moderatör sıfırladıysa: kabul edilmeyen ad */
  rejectedName: string | null
  /** İstemcinin en son yolladığı ve sunucunun reddettiği ham ad (filtre / rezerve / moderatör) */
  lastRejected: string | null
  /** Moderatör başarımları sıfırladıysa: ne zaman (ms) */
  resetAt: number | null
  /** Bitmiş haftalarda birincilik sayısı */
  firsts: number
  /** Kurtarma kodu oluşturmuş mu */
  recovery: boolean
  /**
   * Şüphe işareti (null = yok): `ratio` = en yüksek puan/satır'ın mod eşiğine
   * oranı (≥1 şüpheli), `burst` = son pencerede dakikalık sınıra dayandı.
   */
  suspect: { ratio: number; burst: boolean } | null
}

export interface NamesResponse {
  rows: PlayerRow[]
  total: number
}

/**
 * reset  → ad yer tutucuya, eski ad reddedilir (geri alınabilir)
 * shadow → listeden düşer, kendi sırasını görür
 * ban    → koşuları yazılmaz
 * clear  → status ok, rejected_name NULL
 * wipe   → başarımları sıfırla: ad + rozet + skorlar + birincilikler + sunucu profili
 *          sıfırlanır; cihaza da "sıfır" iner (profil cevabındaki resetAt). GERİ ALINAMAZ.
 * delete → oyuncunun tüm lb_* satırları silinir. GERİ ALINAMAZ.
 */
export const NAME_ACTIONS = ['reset', 'shadow', 'ban', 'clear', 'wipe', 'delete'] as const
export type NameAction = (typeof NAME_ACTIONS)[number]

/** GET /api/league?week= - panelde hafta × mod tablosu */
export interface LeagueBoard {
  mode: Mode
  players: number
  entries: WeeklyEntry[]
}
export interface LeagueResponse {
  week: string
  boards: LeagueBoard[]
}

export interface NameActionBody {
  hash: string
  action: NameAction
}

export interface WordsResponse {
  words: string[]
}
