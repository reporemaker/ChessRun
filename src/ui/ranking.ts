import type { GameMode } from '../engine/types'
import { getIdentity } from './identity'
import { leaderboardEnabled } from './leaderboard'
import { type RunRecord, bestOf, isoWeekKey, readRuns, runsOfMode, runsOfWeek } from './scores'

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
  distance: number
  /** Bu satır oyuncunun kendisi mi — listede altın gösteriliyor */
  me: boolean
  /** ISO zaman damgası, React anahtarı olarak da kullanılıyor */
  at: string
  /** Oyuncunun seçtiği rozet glifi — rozet sistemi gelince dolacak (yapilacaklar.md) */
  badge?: string
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

export function readRanking(scope: RankScope, mode?: GameMode, now: Date = new Date()): RankingView {
  const stored = readRuns()
  const all = mode ? runsOfMode(stored, mode) : stored
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
      distance: run.distance,
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

/**
 * Yalnızca geliştirme: sıralama penceresini sunucu gelmeden GERÇEK
 * görünümüyle değerlendirebilmek için örnek tablo. Üretim derlemesinde
 * çağrılmıyor (App yalnızca DEV + ?dev=rank ile açıyor). Adlar beş dilin
 * rastgele ad kalıbından, rozet glifleri yer tutucu.
 */
export function demoRanking(scope: RankScope, mode: GameMode): RankingView {
  const seed = (mode === 'classic' ? 3 : mode === 'kingRun' ? 7 : 11) + (scope === 'week' ? 0 : 20)
  const names = [
    'Gölge Vezir 417', 'Shadow Queen 88', 'Schatten-Dame 512', 'Torre Plata 356', 'Roi Glace 516',
    'Fırtına At 831', 'North Bishop 971', 'Sturm-Turm 204', 'Dama Sombra 640', 'Cavalier Fer 150',
    'Buz Şah 181', 'Moon Rook 547', 'Himmel-König 318', 'Alfil Oro 722', 'Pion Acier 550',
    'Demir Piyon 903', 'Storm Knight 66', 'Nacht-Läufer 430', 'Rey Viento 275', 'Reine Nuit 802',
  ]
  const badges = ['♞', '♛', '⚡', '♚', undefined, '○', undefined, '♜', undefined, '◆']
  const identity = getIdentity()
  // Haftada 4. (listede), tüm zamanlarda 47. (liste dışı → altta yapışık satır)
  const mePlace = scope === 'week' ? 4 : 47
  const top = scope === 'week' ? 5400 : 12800
  const rows: RankRow[] = Array.from({ length: 15 }, (_, i) => {
    const place = i + 1
    const score = Math.round(top * Math.pow(0.86, i) + ((seed * (i + 1) * 37) % 90))
    const me = place === mePlace
    return {
      place,
      name: me ? identity.name : names[(i * seed) % names.length],
      score,
      distance: Math.round(score / (mode === 'kingRun' ? 60 : 24)),
      me,
      at: `demo-${scope}-${mode}-${i}`,
      badge: me ? '♞' : badges[(i * seed) % badges.length],
    }
  })
  const myScore = rows[mePlace - 1]?.score ?? Math.round(top * Math.pow(0.86, 14) * 0.7)
  return { rank: mePlace, score: myScore, players: scope === 'week' ? 312 : 1847, pending: false, rows }
}
