/**
 * Kalınan yerden devam - «devam fişi».
 *
 * Koşu sürerken her commit'te localStorage'a yazılır, koşu bitince /
 * çıkılınca silinir. Yenileme, sekme ölümü, PWA'nın işletim sistemince
 * kapatılması: açılışta fiş varsa «Koşun yarım kaldı — DEVAM ET / VAZGEÇ».
 * 30 dakikada eskir (sessizce atılır - eski davranış: koşu yok olurdu).
 *
 * localStorage (sessionStorage değil): asıl kayıp senaryosu iOS'ta ana
 * ekrandaki uygulamanın arka planda öldürülmesi; orada sessionStorage da
 * gider. Tek fiş: son yazılan koşu (iki sekmede iki koşu = sonuncusu kalır).
 *
 * Motor durumu saf veri; tek istisna `GameState.rng` (kapanış) - tohum +
 * iç durum olarak saklanıp `createRng(seed, state)` ile aynı akış sürdürülür;
 * tohumsuz (sistem) üreteçte zaten saklanacak bir şey yok. Günlük durum
 * (`DailyState`) baştan saf: satırlar tohum+indeksten türer.
 *
 * Güvenlik notu: fiş yerel; sıralama puanı yine koşu sonunda imzalanıp
 * gönderilir - fişi elle düzenlemek puan uydurmakla aynı sınıfta, sunucu
 * makullük sınırı o konuyu ayrıca ele alıyor (yapilacaklar §1).
 */
import type { DailyState } from '../engine/daily'
import { type Rng, createRng, systemRng } from '../engine/random'
import type { GameState } from '../engine/types'
import type { GameConfig } from '../components/Game'
import type { RunTally } from './badges'

export const RESUME_KEY = 'chessrun:resume'
export const RESUME_TTL_MS = 30 * 60_000

/** GameState'in JSON hâli: rng yerine tohum + iç durum */
export type SerializedGame = Omit<GameState, 'rng'> & { rngState: number | null }

export interface GameResume {
  kind: 'game'
  game: SerializedGame
  /** Koşunun o ana kadar geçen süresi (duvar saati, ms) */
  elapsedMs: number
  /** Koşunun başladığı gün (çarpan ve defter için) */
  runDay: string
  /** Koşu başında sabitlenen günlük puanı (çarpan) */
  dailyToday: number | null
  tally: RunTally
  prevType: GameState['playerType']
}

export interface DailyResume {
  kind: 'daily'
  game: DailyState
  elapsedMs: number
  day: string
}

export interface ResumeTicket {
  v: 1
  savedAt: number
  config: GameConfig
  data: GameResume | DailyResume
}

export function serializeGame(game: GameState): SerializedGame {
  const { rng, ...rest } = game
  return { ...rest, rngState: rng.state }
}

export function reviveGame(data: SerializedGame): GameState {
  const { rngState, ...rest } = data
  const rng: Rng = rest.seed == null ? systemRng : createRng(rest.seed, rngState ?? rest.seed)
  return { ...rest, rng }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function saveResume(ticket: Omit<ResumeTicket, 'v' | 'savedAt'>, now = Date.now()): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(RESUME_KEY, JSON.stringify({ v: 1, savedAt: now, ...ticket } satisfies ResumeTicket))
  } catch {
    // kota / özel mod - devam özelliği sessizce kapalı
  }
}

export function clearResume(): void {
  try {
    storage()?.removeItem(RESUME_KEY)
  } catch {
    // yoksay
  }
}

/** Geçerli fiş ya da null; bozuk/eski fiş silinir */
export function readResume(now = Date.now()): ResumeTicket | null {
  const store = storage()
  if (!store) return null
  let raw: string | null = null
  try {
    raw = store.getItem(RESUME_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const ticket = JSON.parse(raw) as ResumeTicket
    if (!isTicket(ticket) || now - ticket.savedAt > RESUME_TTL_MS || ticket.savedAt > now + 60_000) {
      clearResume()
      return null
    }
    return ticket
  } catch {
    clearResume()
    return null
  }
}

function isTicket(value: unknown): value is ResumeTicket {
  if (!value || typeof value !== 'object') return false
  const t = value as Partial<ResumeTicket>
  if (t.v !== 1 || typeof t.savedAt !== 'number' || !t.config || typeof t.config !== 'object') return false
  const d = t.data as { kind?: unknown; game?: unknown; runDay?: unknown; day?: unknown } | undefined
  if (!d || typeof d !== 'object' || !d.game || typeof d.game !== 'object') return false
  if (d.kind === 'game') {
    const g = d.game as Partial<SerializedGame>
    return (
      Array.isArray(g.board) && Array.isArray(g.squad) && typeof g.score === 'number' && g.status === 'playing' && typeof d.runDay === 'string'
    )
  }
  if (d.kind === 'daily') {
    const g = d.game as Partial<DailyState>
    return Array.isArray(g.board) && typeof g.score === 'number' && g.status === 'playing' && typeof d.day === 'string'
  }
  return false
}

/** Fiş bu konfige/güne uyuyor mu - App açılışta soruyor */
export function resumeMatches(ticket: ResumeTicket, mode: GameConfig['mode'], day?: string): boolean {
  if (ticket.config.mode !== mode) return false
  if (ticket.data.kind === 'daily') return ticket.data.day === day
  return true
}
