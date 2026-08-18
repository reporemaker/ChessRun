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

export interface SubmitBody {
  token: string
  name: string
  alg: 'HMAC-SHA256'
  mode: Mode
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
