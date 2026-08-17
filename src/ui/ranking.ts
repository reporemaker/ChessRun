import { getIdentity } from './identity'
import { leaderboardEnabled } from './leaderboard'
import { type RunRecord, bestOf, isoWeekKey, readRuns, runsOfWeek } from './scores'

/**
 * Sıralamanın tek okuma noktası.
 *
 * Sunucu yokken dürüst davranıyoruz: "sıran" ve "toplam oyuncu" bilinmiyor,
 * o yüzden `null` dönüyor ve arayüz onları tire gösteriyor. Bilinen tek şey
 * kendi skorun ve kendi koşuların — liste de onlardan kuruluyor.
 * Sunucu bağlandığında yalnızca bu dosya değişiyor.
 */

export type RankScope = 'allTime' | 'week'

export interface RankRow {
  place: number
  name: string
  score: number
  /** Bu satır oyuncunun kendisi mi — listede altın gösteriliyor */
  me: boolean
  /** ISO zaman damgası, React anahtarı olarak da kullanılıyor */
  at: string
}

export interface RankingView {
  /** Sunucu yoksa null: gerçek bir sıra bilinmiyor */
  rank: number | null
  /** Kendi en iyi skorun — sunucu olmadan da bilinen tek gerçek sayı */
  score: number
  /** Sunucu yoksa null */
  players: number | null
  /** Sunucu bağlı değil — arayüz "SUNUCU BEKLEMEDE" yazıyor */
  pending: boolean
  rows: RankRow[]
}

const LIST_LIMIT = 12

export function readRanking(scope: RankScope, now: Date = new Date()): RankingView {
  const all = readRuns()
  const runs = scope === 'week' ? runsOfWeek(all, isoWeekKey(now)) : all
  const best = bestOf(runs)
  const identity = getIdentity()

  const pending = !leaderboardEnabled

  // Sunucu yokken listedeki herkes zaten sensin: her satırı "sen" diye
  // işaretlemek tabloyu baştan sona altın yapıyor ve hiçbir şey söylemiyor.
  // O yüzden vurgu kapalı ve satırlar tarihle etiketleniyor — bu hâliyle
  // liste "kendi en iyi koşuların" oluyor.
  const rows: RankRow[] = runs
    .slice()
    .sort((a, b) => b.score - a.score || b.distance - a.distance)
    .slice(0, LIST_LIMIT)
    .map((run: RunRecord, index) => ({
      place: index + 1,
      name: identity.name,
      score: run.score,
      me: !pending,
      at: run.at,
    }))

  return {
    rank: null,
    score: best?.score ?? 0,
    players: null,
    pending,
    rows,
  }
}
