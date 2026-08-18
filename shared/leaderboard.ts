import type { Mode } from './events'

/**
 * Haftalık sıralama sunucusunun sözleşmesi — oyun, Worker ve panel
 * arasındaki tek ortak tanım (istatistik için `events.ts` neyse bu da o).
 *
 *   POST /lb/runs                 gövde: SubmitBody                → 204 (her durumda)
 *   GET  /lb/weekly?mode=&week=   başlık: x-chessrun-token (ist.)  → WeeklyResponse
 *   GET  /lb/pulse?day=                                            → PulseResponse
 *
 * Güven modeli dürüstçe: cihaz jetonu **taşıyıcı sırdır**. Sunucu imzayı
 * doğrulayamıyor (anahtar cihazda), jetonu bilen skoru gönderebilir. Bu
 * yüzden sunucu jetonu ham saklamıyor (SHA-256), dışarı yalnızca kısa
 * hâlini veriyor ve tabloyu haftada bir sıfırlıyor — hilenin ödülü küçük,
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
 * Günlük çarpan — günün mücadelesi puanı o günkü diğer koşuları büyütür
 *
 * çarpan = 1 + min(günlükPuan, DAILY_BONUS_CAP) / DAILY_BONUS_DIV
 * (150 → ×1,15 · 500+ → ×1,5). Yalnızca mücadeleden SONRA oynanan
 * koşulara (aynı yerel takvim günü). Sunucu kendi kaydından uygular
 * (istemcinin çarptığı skora güvenmez), istemci aynı formülle gösterir.
 * ------------------------------------------------------------------ */
export const DAILY_BONUS_CAP = 500
export const DAILY_BONUS_DIV = 1000

export function dailyBonus(dailyScore: number | null | undefined): number {
  if (dailyScore == null || !(dailyScore > 0)) return 1
  return 1 + Math.min(dailyScore, DAILY_BONUS_CAP) / DAILY_BONUS_DIV
}

/** Çarpan uygulanmış puan (aşağı yuvarlanır) */
export function applyDailyBonus(score: number, dailyScore: number | null | undefined): number {
  return Math.floor(score * dailyBonus(dailyScore))
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
  /** Koşunun yerel takvim günü — günlük çarpanın hangi güne bakacağı (daily ile aynı biçim) */
  day?: string
  /** İstemcinin kendi anahtarıyla attığı imza — sunucu saklıyor, doğrulayamıyor */
  sig?: string
  /** Oyuncunun seçtiği rozet — tabloda adın önünde */
  badge?: string
  badgeTier?: BadgeTier
}

export interface WeeklyEntry {
  place: number
  name: string
  /** Jetonun kısa hâli `a1b2…9f` — tam jeton hiçbir cevapta yok */
  token: string
  score: number
  distance: number
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
  me?: { place: number; score: number; distance: number }
  /** Geçen haftanın ilk üçü — Pazartesi kazananlar iz bırakmadan silinmesin */
  lastWeek?: { week: string; entries: WeeklyEntry[] }
}

export interface PulseResponse {
  day: string
  players: number
}

/**
 * Günün Mücadelesi — tohum ve tek hak, sunucuda.
 *
 *   GET  /lb/daily?day=YYYY-MM-DD   başlık: x-chessrun-token (ist.)  → DailyResponse
 *   POST /lb/daily/start            gövde: DailyStartBody             → DailyResponse
 *
 * Tohum sunucu sırrından türer (HMAC(secret, gün)); tarihten hesaplanan
 * tohum herkesçe önceden bilinir ve yarının tahtası çalışılabilirdi.
 * Hak KOŞU BAŞLAYINCA yanar: `start` günü + jeton hash'ini `lb_daily`ye
 * yazar (aynı tablo nabzı da besliyor: "bugün X kişi oynadı"). Cevaptaki
 * `played` çağrı ÖNCESİ durum — start'ta true dönerse hak zaten yanmıştı,
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
 * Panel — /api/names, /api/words (Access arkasında)
 * ------------------------------------------------------------------ */

export const PLAYER_STATUSES = ['ok', 'shadow', 'banned'] as const
export type PlayerStatus = (typeof PLAYER_STATUSES)[number]

export interface PlayerRow {
  /** Jetonun SHA-256'sı — moderasyon eylemlerinin anahtarı; ham jeton değil */
  hash: string
  short: string
  name: string
  status: PlayerStatus
  badge: string | null
  runs: number
  firstSeen: number
  lastSeen: number
  /** Moderatör sıfırladıysa: kabul edilmeyen ad */
  rejectedName: string | null
}

export interface NamesResponse {
  rows: PlayerRow[]
  total: number
}

export const NAME_ACTIONS = ['reset', 'shadow', 'ban', 'clear'] as const
export type NameAction = (typeof NAME_ACTIONS)[number]

export interface NameActionBody {
  hash: string
  action: NameAction
}

export interface WordsResponse {
  words: string[]
}
