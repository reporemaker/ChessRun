import type { AwardsResponse, PulseResponse, SubmitBody, WeeklyResponse,
  DailyResponse,
  DailyStartBody,
} from '@shared/leaderboard'
import type { GameMode } from '../engine/types'
import { badgeOf, readBadges, readSelectedBadge } from './badges'
import { getIdentity } from './identity'
import type { RunRecord } from './scores'
import { schedulePush } from './sync'

/**
 * Haftalık yarışmanın sunucu ucu.
 *
 * Sunucu yokken oyun tamamen yerel çalışıyor: haftalık yarışma "kendi
 * rekorunu geç" demek. `VITE_LEADERBOARD_URL` tanımlandığı anda aynı
 * kayıtlar imzasıyla birlikte gönderilmeye ve global tablo çekilmeye
 * başlıyor - arayüzde başka hiçbir şey değişmiyor.
 *
 * Sözleşme `shared/leaderboard.ts`'te; Worker aynı tipleri kullanıyor.
 * Kimlik jetonu yalnızca gövdede (POST) ve `x-chessrun-token` başlığında
 * (GET, kendi sıran için) gidiyor - hiçbir zaman URL'de: sorgu dizgileri
 * loglara düşer, başlıklar düşmez.
 */
const ENDPOINT = import.meta.env.VITE_LEADERBOARD_URL as string | undefined

export const leaderboardEnabled = Boolean(ENDPOINT)

export type { WeeklyEntry, WeeklyResponse } from '@shared/leaderboard'

/** Oyuncunun o an seçili rozeti - sunucu tabloda adın önünde gösterecek */
function selectedBadge(): Pick<SubmitBody, 'badge' | 'badgeTier'> {
  const id = readSelectedBadge()
  if (!id) return {}
  const badge = badgeOf(id)
  const idx = readBadges()[id]?.tier ?? 0
  return { badge: id, badgeTier: badge.tiers[Math.min(idx, badge.tiers.length - 1)] }
}

/* ------------------------------------------------------------------ *
 * Yeniden deneme kuyruğu
 *
 * Gönderim ağ yüzünden düşerse koşu cihazda kuyruğa yazılır; uygulama
 * açılışında ve bir sonraki başarılı gönderimden sonra tekrar denenir.
 * En çok QUEUE_MAX koşu (eskisi düşer). Özellikle GÜNLÜK koşu için önemli:
 * sunucu o günkü çarpanı ancak günlük skoru aldıysa uygular.
 * ------------------------------------------------------------------ */
const QUEUE_KEY = 'chessrun:lb-queue'
const QUEUE_MAX = 20

function readQueue(): RunRecord[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as RunRecord[]) : []
  } catch {
    return []
  }
}

function writeQueue(runs: RunRecord[]): void {
  try {
    if (runs.length === 0) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(runs.slice(-QUEUE_MAX)))
  } catch {
    // depolama kapalı: kuyruk yok
  }
}

function enqueue(run: RunRecord): void {
  const queue = readQueue().filter((r) => r.at !== run.at)
  queue.push(run)
  writeQueue(queue)
}

let flushing = false

/** Kuyruktakileri sırayla yeniden dener; ilk başarısızlıkta durur (ağ yok) */
export async function flushSubmitQueue(): Promise<void> {
  if (!ENDPOINT || flushing) return
  const queue = readQueue()
  if (queue.length === 0) return
  flushing = true
  try {
    let sent = 0
    for (const run of queue) {
      const ok = await postRun(run)
      if (!ok) break
      writeQueue(readQueue().filter((r) => r.at !== run.at))
      sent++
    }
    // Kuyruktan giden koşular deftere çoktan işlenmişti; profil de yetişsin
    if (sent > 0) schedulePush()
  } finally {
    flushing = false
  }
}

export async function submitRun(run: RunRecord): Promise<boolean> {
  if (!ENDPOINT) return false
  const ok = await postRun(run)
  if (!ok) {
    enqueue(run)
    return false
  }
  // Başarılı gönderim = ağ var: bekleyenleri de gönder
  void flushSubmitQueue()
  // Koşu deftere/sayaçlara/rozetlere işlendi - profil de sunucuya çıksın
  schedulePush()
  return true
}

async function postRun(run: RunRecord): Promise<boolean> {
  if (!ENDPOINT) return false

  const identity = getIdentity()
  const body: SubmitBody = {
    token: identity.token,
    name: identity.name,
    alg: 'HMAC-SHA256',
    mode: run.mode,
    // HAM puan: günlük çarpanı sunucu kendi kaydından uygular
    score: run.rawScore ?? run.score,
    distance: run.distance,
    cols: run.cols,
    level: run.level,
    at: run.at,
    week: run.week,
    daily: run.daily,
    day: run.day,
    sig: run.sig,
    ...selectedBadge(),
  }

  try {
    const response = await fetch(`${ENDPOINT}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      // Asılı kalmasın: cevap gelmezse kuyruğa düşer, sonra tekrar denenir
      signal: AbortSignal.timeout(10_000),
    })
    return response.ok
  } catch {
    // Ağ yoksa skor yerelde duruyor; sonraki koşuda tekrar denenebilir
    return false
  }
}

/**
 * Haftanın tablosu. Jeton başlıkta gidiyor ki sunucu listede olmasan da
 * kendi sıranı hesaplasın. Sunucu ulaşılamazsa `null` - arayüz yerel
 * görünüme düşüyor.
 */
export async function fetchWeekly(mode: GameMode, week: string): Promise<WeeklyResponse | null> {
  if (!ENDPOINT) return null

  try {
    const params = new URLSearchParams({ mode, week })
    const response = await fetch(`${ENDPOINT}/weekly?${params}`, {
      headers: { 'x-chessrun-token': getIdentity().token },
      // Tarayıcı önbelleğini atla: koşu/ad/rozet değişince liste hemen taze
      // gelsin (sunucu tarafında kısa izole önbelleği zaten var)
      cache: 'no-cache',
    })
    if (!response.ok) return null
    return (await response.json()) as WeeklyResponse
  } catch {
    return null
  }
}

/**
 * Bugünün nabzı: günlük tahtayı kaç kişi oynadı. Ana sayfanın alt satırı
 * bunu bazen ipucu yerine gösteriyor - günlük yarışmayı bir cümleden çok
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
 * Bitmiş haftalardaki birinciliklerin - lig rozetleri bundan türetiliyor
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

/* ------------------------------------------------------------------ *
 * Günün Mücadelesi - tohum ve tek hak sunucuda
 * ------------------------------------------------------------------ */

export interface DailyInfo {
  seed: number
  played: boolean
}

/** Tohum/hak istekleri asılı kalmasın: bu süreden sonra "ulaşılamadı" */
const DAILY_TIMEOUT_MS = 8000

/** Bugünün tohumu ve hak durumu. Sunucu yok/ulaşılamıyorsa null. */
export async function fetchDaily(day: string): Promise<DailyInfo | null> {
  if (!ENDPOINT) return null
  try {
    const response = await fetch(`${ENDPOINT}/daily?day=${encodeURIComponent(day)}`, {
      headers: { 'x-chessrun-token': getIdentity().token },
      cache: 'no-store',
      signal: AbortSignal.timeout(DAILY_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const data = (await response.json()) as DailyResponse
    if (typeof data.seed !== 'number') return null
    return { seed: data.seed >>> 0, played: Boolean(data.played) }
  } catch {
    return null
  }
}

/**
 * Hakkı yakar ve tohumu getirir. `played: true` dönerse hak ZATEN yanmıştı
 * (çağrı öncesi durum) - oyun başlamamalı. Sunucu yok/ulaşılamıyorsa null.
 */
export async function startDaily(day: string): Promise<DailyInfo | null> {
  if (!ENDPOINT) return null
  try {
    const body: DailyStartBody = { token: getIdentity().token, day }
    const response = await fetch(`${ENDPOINT}/daily/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(DAILY_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const data = (await response.json()) as DailyResponse
    if (typeof data.seed !== 'number') return null
    return { seed: data.seed >>> 0, played: Boolean(data.played) }
  } catch {
    return null
  }
}
