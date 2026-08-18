import type { AwardsResponse, PulseResponse, SubmitBody, WeeklyResponse } from '@shared/leaderboard'
import type { GameMode } from '../engine/types'
import { badgeOf, readBadges, readSelectedBadge } from './badges'
import { getIdentity } from './identity'
import type { RunRecord } from './scores'

/**
 * Haftalık yarışmanın sunucu ucu.
 *
 * Sunucu yokken oyun tamamen yerel çalışıyor: haftalık yarışma "kendi
 * rekorunu geç" demek. `VITE_LEADERBOARD_URL` tanımlandığı anda aynı
 * kayıtlar imzasıyla birlikte gönderilmeye ve global tablo çekilmeye
 * başlıyor — arayüzde başka hiçbir şey değişmiyor.
 *
 * Sözleşme `shared/leaderboard.ts`'te; Worker aynı tipleri kullanıyor.
 * Kimlik jetonu yalnızca gövdede (POST) ve `x-chessrun-token` başlığında
 * (GET, kendi sıran için) gidiyor — hiçbir zaman URL'de: sorgu dizgileri
 * loglara düşer, başlıklar düşmez.
 */
const ENDPOINT = import.meta.env.VITE_LEADERBOARD_URL as string | undefined

export const leaderboardEnabled = Boolean(ENDPOINT)

export type { WeeklyEntry, WeeklyResponse } from '@shared/leaderboard'

/** Oyuncunun o an seçili rozeti — sunucu tabloda adın önünde gösterecek */
function selectedBadge(): Pick<SubmitBody, 'badge' | 'badgeTier'> {
  const id = readSelectedBadge()
  if (!id) return {}
  const badge = badgeOf(id)
  const idx = readBadges()[id]?.tier ?? 0
  return { badge: id, badgeTier: badge.tiers[Math.min(idx, badge.tiers.length - 1)] }
}

export async function submitRun(run: RunRecord): Promise<boolean> {
  if (!ENDPOINT) return false

  const identity = getIdentity()
  const body: SubmitBody = {
    token: identity.token,
    name: identity.name,
    alg: 'HMAC-SHA256',
    mode: run.mode,
    score: run.score,
    distance: run.distance,
    cols: run.cols,
    level: run.level,
    at: run.at,
    week: run.week,
    daily: run.daily,
    sig: run.sig,
    ...selectedBadge(),
  }

  try {
    const response = await fetch(`${ENDPOINT}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    })
    return response.ok
  } catch {
    // Ağ yoksa skor yerelde duruyor; sonraki koşuda tekrar denenebilir
    return false
  }
}

/**
 * Haftanın tablosu. Jeton başlıkta gidiyor ki sunucu listede olmasan da
 * kendi sıranı hesaplasın. Sunucu ulaşılamazsa `null` — arayüz yerel
 * görünüme düşüyor.
 */
export async function fetchWeekly(mode: GameMode, week: string): Promise<WeeklyResponse | null> {
  if (!ENDPOINT) return null

  try {
    const params = new URLSearchParams({ mode, week })
    const response = await fetch(`${ENDPOINT}/weekly?${params}`, {
      headers: { 'x-chessrun-token': getIdentity().token },
    })
    if (!response.ok) return null
    return (await response.json()) as WeeklyResponse
  } catch {
    return null
  }
}

/**
 * Bugünün nabzı: günlük tahtayı kaç kişi oynadı. Ana sayfanın alt satırı
 * bunu bazen ipucu yerine gösteriyor — günlük yarışmayı bir cümleden çok
 * daha iyi anlatıyor. Sunucu yokken null.
 */
export async function fetchPulse(day: string): Promise<number | null> {
  if (!ENDPOINT) return null

  try {
    const response = await fetch(`${ENDPOINT}/pulse?day=${encodeURIComponent(day)}`)
    if (!response.ok) return null
    const data = (await response.json()) as PulseResponse
    return typeof data.players === 'number' ? data.players : null
  } catch {
    return null
  }
}

/**
 * Bitmiş haftalardaki birinciliklerin — lig rozetleri bundan türetiliyor
 * (bkz. badges.ts `leagueAwards`). Sunucu yok/ulaşılamıyorsa null: rozet
 * verilmez ama alınmış rozet de geri alınmaz.
 */
export async function fetchAwards(): Promise<AwardsResponse['firsts'] | null> {
  if (!ENDPOINT) return null

  try {
    const response = await fetch(`${ENDPOINT}/awards`, {
      headers: { 'x-chessrun-token': getIdentity().token },
    })
    if (!response.ok) return null
    const data = (await response.json()) as AwardsResponse
    return Array.isArray(data.firsts) ? data.firsts : null
  } catch {
    return null
  }
}
