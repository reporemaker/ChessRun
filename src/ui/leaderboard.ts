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
 * Sunucu sözleşmesi:
 *   POST {url}/runs      gövde: SubmitBody           → 204
 *   GET  {url}/weekly?week=2026-W33                  → { entries: WeeklyEntry[] }
 *   GET  {url}/pulse?day=2026-08-18                  → { players: number }
 */
const ENDPOINT = import.meta.env.VITE_LEADERBOARD_URL as string | undefined

export const leaderboardEnabled = Boolean(ENDPOINT)

export interface WeeklyEntry {
  name: string
  /** Jetonun kısa hâli — sunucu tam jetonu asla geri yaymamalı */
  token: string
  score: number
  distance: number
}

interface SubmitBody extends RunRecord {
  token: string
  name: string
  /** İmza algoritması — sunucu doğrulama yolunu buradan seçer */
  alg: 'HMAC-SHA256'
}

export async function submitRun(run: RunRecord): Promise<boolean> {
  if (!ENDPOINT) return false

  const identity = getIdentity()
  const body: SubmitBody = {
    ...run,
    token: identity.token,
    name: identity.name,
    alg: 'HMAC-SHA256',
  }

  try {
    const response = await fetch(`${ENDPOINT}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return response.ok
  } catch {
    // Ağ yoksa skor yerelde duruyor; sonraki koşuda tekrar denenebilir
    return false
  }
}

export async function fetchWeekly(week: string): Promise<WeeklyEntry[] | null> {
  if (!ENDPOINT) return null

  try {
    const response = await fetch(`${ENDPOINT}/weekly?week=${encodeURIComponent(week)}`)
    if (!response.ok) return null
    const data = (await response.json()) as { entries?: WeeklyEntry[] }
    return data.entries ?? null
  } catch {
    return null
  }
}

/**
 * Bugünün nabzı: günlük tahtayı kaç kişi oynadı. Ana sayfanın alt satırı
 * bunu bazen ipucu yerine gösteriyor — günlük yarışmayı bir cümleden çok
 * daha iyi anlatıyor. Sunucu (Faz 9) yokken null.
 */
export async function fetchPulse(day: string): Promise<number | null> {
  if (!ENDPOINT) return null

  try {
    const response = await fetch(`${ENDPOINT}/pulse?day=${encodeURIComponent(day)}`)
    if (!response.ok) return null
    const data = (await response.json()) as { players?: number }
    return typeof data.players === 'number' ? data.players : null
  } catch {
    return null
  }
}
