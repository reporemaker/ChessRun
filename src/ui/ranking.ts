import type { GameMode } from '../engine/types'
import { badgeOf, readBadges, readSelectedBadge } from './badges'
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

export interface RankRow {
  place: number
  name: string
  score: number
  distance: number
  /** Bu satır oyuncunun kendisi mi — listede altın gösteriliyor */
  me: boolean
  /** ISO zaman damgası, React anahtarı olarak da kullanılıyor */
  at: string
  /** Oyuncunun seçtiği rozet glifi (adın önünde) */
  badge?: string
  /** Kademe rengi için */
  badgeTier?: 'black' | 'bronze' | 'silver' | 'gold'
}

function selectedBadgeGlyph(): { glyph: string; tier: 'black' | 'bronze' | 'silver' | 'gold' } | null {
  const id = readSelectedBadge()
  if (!id) return null
  const badge = badgeOf(id)
  const idx = readBadges()[id]?.tier ?? 0
  return { glyph: badge.glyph, tier: badge.tiers[Math.min(idx, badge.tiers.length - 1)] }
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
  /**
   * Geçen haftanın ilk üçü — Pazartesi 00:00'da kazananlar iz bırakmadan
   * silinmesin. Sunucu (Faz 9) gelene kadar yok; şimdilik yalnızca demo.
   */
  lastWeek?: { week: string; rows: Array<Pick<RankRow, 'place' | 'name' | 'score' | 'badge'>> }
}

const LIST_LIMIT = 12

/**
 * Yalnızca haftalık lig. "Tüm zamanlar" tablosu bilerek yok: birkaç ay
 * sonra donar, ilk aylarda skor yapan üstte kalır, yeni oyuncu hiç
 * göremez. Haftalık her Pazartesi herkese aynı şansı veriyor. Kişisel "en
 * iyin" oyun ekranında zaten var — ligin işi değil.
 */
export function readRanking(mode?: GameMode, now: Date = new Date()): RankingView {
  const stored = readRuns()
  const all = mode ? runsOfMode(stored, mode) : stored
  const runs = runsOfWeek(all, isoWeekKey(now))
  const best = bestOf(runs)
  const identity = getIdentity()

  const pending = !leaderboardEnabled
  // Seçili rozet adın önünde — sunucu gelince diğer oyuncularınki de gelecek
  const myBadge = selectedBadgeGlyph()

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
      badge: myBadge?.glyph,
      badgeTier: myBadge?.tier,
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
export function demoRanking(mode: GameMode): RankingView {
  const seed = mode === 'classic' ? 3 : mode === 'kingRun' ? 7 : 11
  const names = [
    'Gölge Vezir 417', 'Shadow Queen 88', 'Schatten-Dame 512', 'Torre Plata 356', 'Roi Glace 516',
    'Fırtına At 831', 'North Bishop 971', 'Sturm-Turm 204', 'Dama Sombra 640', 'Cavalier Fer 150',
    'Buz Şah 181', 'Moon Rook 547', 'Himmel-König 318', 'Alfil Oro 722', 'Pion Acier 550',
    'Demir Piyon 903', 'Storm Knight 66', 'Nacht-Läufer 430', 'Rey Viento 275', 'Reine Nuit 802',
  ]
  const badges = ['♞', '♛', '⚡', '♚', undefined, '○', undefined, '♜', undefined, '◆']
  const identity = getIdentity()
  // Av'da 4. (listede), Kaçış'ta 47. (liste dışı → altta yapışık satır), Üçlü'de 2.
  const mePlace = mode === 'classic' ? 4 : mode === 'kingRun' ? 47 : 2
  const top = 5400
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
      at: `demo-${mode}-${i}`,
      badge: me ? '♞' : badges[(i * seed) % badges.length],
    }
  })
  const myScore = rows[mePlace - 1]?.score ?? Math.round(top * Math.pow(0.86, 14) * 0.7)
  const lastWeek = {
    week: '2026-W33',
    rows: [
      { place: 1, name: names[(seed * 5) % names.length], score: Math.round(top * 1.08), badge: '♛' },
      { place: 2, name: names[(seed * 6) % names.length], score: Math.round(top * 0.93), badge: undefined },
      { place: 3, name: names[(seed * 7) % names.length], score: Math.round(top * 0.81), badge: '⚡' },
    ],
  }
  return { rank: mePlace, score: myScore, players: 312, pending: false, rows, lastWeek }
}
