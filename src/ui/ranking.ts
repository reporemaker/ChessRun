import { ALL_BOARD, type WeeklyEntry, shortMatches } from '@shared/leaderboard'
import type { GameMode } from '../engine/types'
import { type BadgeId, badgeOf, isBadgeId, readBadges, readSelectedBadge } from './badges'
import { getIdentity } from './identity'
import { fetchWeekly, leaderboardEnabled } from './leaderboard'
import { type RunRecord, isoWeekKey, readRuns, runsOfMode, runsOfWeek } from './scores'

/**
 * Sıralamanın tek okuma noktası.
 *
 * Sunucu yokken dürüst davranıyoruz: "sıran" ve "toplam oyuncu" bilinmiyor,
 * o yüzden `null` dönüyor ve arayüz onları tire gösteriyor. Bilinen tek şey
 * kendi skorun ve kendi koşuların - liste de onlardan kuruluyor.
 * Sunucu bağlandığında yalnızca bu dosya değişiyor.
 */

export interface RankRow {
  place: number
  name: string
  /** Haftalık TOPLAM puan (sunucu) ya da tek koşunun puanı (yerel liste) */
  score: number
  distance: number
  /** Sunucu satırında: bu haftaki koşu sayısı; yerel listede (satır = koşu) yok */
  runs?: number
  /** Bu satır oyuncunun kendisi mi - listede altın gösteriliyor */
  me: boolean
  /** ISO zaman damgası, React anahtarı olarak da kullanılıyor */
  at: string
  /** Oyuncunun seçtiği rozet (adın önünde) - sunucu da bu kimliği gönderecek */
  badge?: BadgeId
  /** Kademe rengi için */
  badgeTier?: 'black' | 'bronze' | 'silver' | 'gold'
}

function selectedBadgeGlyph(): { id: BadgeId; tier: 'black' | 'bronze' | 'silver' | 'gold' } | null {
  const id = readSelectedBadge()
  if (!id) return null
  const badge = badgeOf(id)
  const idx = readBadges()[id]?.tier ?? 0
  return { id, tier: badge.tiers[Math.min(idx, badge.tiers.length - 1)] }
}

export interface RankingView {
  /** Sunucu yoksa null: gerçek bir sıra bilinmiyor */
  rank: number | null
  /** Bu haftaki TOPLAM puanın (sunucudan; yoksa yerel defterden toplanır) */
  score: number
  /** Bu haftaki koşu sayın (sunucudan; yoksa yerel defterden) */
  runs?: number
  /** Sunucu yoksa null */
  players: number | null
  /** Bu görünüm yerel (sunucu cevabı değil): sıra ve oyuncu sayısı bilinmiyor */
  pending: boolean
  rows: RankRow[]
  /**
   * Geçen haftanın ilk üçü - Pazartesi 00:00'da kazananlar iz bırakmadan
   * silinmesin. Sunucu (Faz 9) gelene kadar yok; şimdilik yalnızca demo.
   */
  lastWeek?: { week: string; rows: Array<Pick<RankRow, 'place' | 'name' | 'score' | 'badge' | 'badgeTier'>> }
}

const LIST_LIMIT = 12

/**
 * Yalnızca haftalık lig. "Tüm zamanlar" tablosu bilerek yok: birkaç ay
 * sonra donar, ilk aylarda skor yapan üstte kalır, yeni oyuncu hiç
 * göremez. Haftalık her Pazartesi herkese aynı şansı veriyor. Kişisel "en
 * iyin" oyun ekranında zaten var - ligin işi değil.
 *
 * Lig puanı = o hafta BİRİKTİRİLEN toplam (her koşu eklenir; 19 Ağustos
 * kararı - "kim en çok oynadı, en çok puan topladı"). En iyi tek koşu değil.
 * 22 Ekim'den beri tek ortak lig: bütün oyunlar, günün mücadelesi dahil.
 * Sunucu yokken toplam yerel defterden.
 */
export function weekTotal(runs: RunRecord[]): number {
  return runs.reduce((sum, run) => sum + run.score, 0)
}

export function readRanking(mode?: GameMode, now: Date = new Date()): RankingView {
  const stored = readRuns()
  const all = mode ? runsOfMode(stored, mode) : stored
  const runs = runsOfWeek(all, isoWeekKey(now))
  const identity = getIdentity()

  // Seçili rozet adın önünde - sunucu görünümünde diğer oyuncularınki de var
  const myBadge = selectedBadgeGlyph()

  // Yerel listede herkes zaten sensin: her satırı "sen" diye işaretlemek
  // tabloyu baştan sona altın yapıyor ve hiçbir şey söylemiyor. O yüzden
  // vurgu kapalı ve satırlar tarihle etiketleniyor - bu hâliyle liste
  // "kendi en iyi koşuların" oluyor. Sunucu görünümü `fetchRanking`'te.
  const rows: RankRow[] = runs
    .slice()
    .sort((a, b) => b.score - a.score || b.distance - a.distance)
    .slice(0, LIST_LIMIT)
    .map((run: RunRecord, index) => ({
      place: index + 1,
      name: identity.name,
      score: run.score,
      distance: run.distance,
      me: false,
      at: run.at,
      badge: myBadge?.id,
      badgeTier: myBadge?.tier,
    }))

  return {
    rank: null,
    score: weekTotal(runs),
    runs: runs.length,
    players: null,
    pending: true,
    rows,
  }
}

/* ------------------------------------------------------------------ *
 * Sunucu görünümü
 * ------------------------------------------------------------------ */

function entryToRow(entry: WeeklyEntry, me: boolean): RankRow {
  return {
    place: entry.place,
    name: entry.name,
    score: entry.score,
    distance: entry.distance,
    runs: entry.runs,
    me,
    at: `${entry.token}-${entry.place}`,
    badge: entry.badge && isBadgeId(entry.badge) ? entry.badge : undefined,
    badgeTier: entry.badgeTier,
  }
}

/**
 * Sunucudan haftanın tablosu. Yerel görünüm (`readRanking`) anında çiziliyor,
 * bu cevap gelince yerini alıyor. Sunucu yoksa ya da ulaşılamazsa `null` -
 * çağıran yerel görünümde kalıyor ve "sunucu bağlanana kadar" notu duruyor.
 *
 * "Sen" satırı kısa jetonla eşleşiyor: ad tekil değil, jeton tekil.
 * Tablo ortak lig (bütün oyunların toplamı).
 */
export async function fetchRanking(now: Date = new Date()): Promise<RankingView | null> {
  if (!leaderboardEnabled) return null
  const week = isoWeekKey(now)
  const data = await fetchWeekly(ALL_BOARD, week)
  if (!data) return null

  // "ben": tablodaki kısa hâl eski (4+2) ya da yeni (6+2) olabilir - ikisini de tanı
  const token = getIdentity().token
  const rows = data.entries.map((entry) => entryToRow(entry, shortMatches(entry.token, token)))
  const local = readRanking(undefined, now)

  return {
    rank: data.me?.place ?? null,
    // Sunucu bu hafta için toplam biliyorsa o; bilmiyorsa (henüz
    // gönderilmedi / ağ yoktu) yerel toplam - sıfır göstermek yalan olur.
    score: data.me?.score ?? local.score,
    runs: data.me?.runs ?? local.runs,
    players: data.players,
    pending: false,
    rows,
    lastWeek: data.lastWeek
      ? { week: data.lastWeek.week, rows: data.lastWeek.entries.map((entry) => entryToRow(entry, shortMatches(entry.token, token))) }
      : undefined,
  }
}

/**
 * Yalnızca geliştirme: sıralama penceresini sunucu gelmeden GERÇEK
 * görünümüyle değerlendirebilmek için örnek tablo. Üretim derlemesinde
 * çağrılmıyor (App yalnızca DEV + ?dev=rank ile açıyor). Adlar beş dilin
 * rastgele ad kalıbından, rozet glifleri yer tutucu.
 */
export function demoRanking(): RankingView {
  const seed = 3
  const names = [
    'Gölge Vezir 417', 'Shadow Queen 88', 'Schatten-Dame 512', 'Torre Plata 356', 'Roi Glace 516',
    'Fırtına At 831', 'North Bishop 971', 'Sturm-Turm 204', 'Dama Sombra 640', 'Cavalier Fer 150',
    'Buz Şah 181', 'Moon Rook 547', 'Himmel-König 318', 'Alfil Oro 722', 'Pion Acier 550',
    'Demir Piyon 903', 'Storm Knight 66', 'Nacht-Läufer 430', 'Rey Viento 275', 'Reine Nuit 802',
  ]
  const badges: Array<BadgeId | undefined> = ['knight', 'queen', 'chain', 'king', undefined, 'breath', undefined, 'rook', undefined, 'thirtyDays']
  const tiers = ['gold', 'silver', 'gold', 'bronze', undefined, 'gold', undefined, 'black', undefined, 'gold'] as const
  const identity = getIdentity()
  // Listede 4. (liste dışı görünüm için 47 denenebilir)
  const mePlace = 4
  const top = 5400
  const rows: RankRow[] = Array.from({ length: 15 }, (_, i) => {
    const place = i + 1
    const score = Math.round(top * Math.pow(0.86, i) + ((seed * (i + 1) * 37) % 90))
    const me = place === mePlace
    return {
      place,
      name: me ? identity.name : names[(i * seed) % names.length],
      score,
      distance: Math.round(score / 24),
      me,
      at: `demo-${i}`,
      badge: me ? 'oneUp' : badges[(i * seed) % badges.length],
      badgeTier: me ? 'bronze' : tiers[(i * seed) % tiers.length],
    }
  })
  const myScore = rows[mePlace - 1]?.score ?? Math.round(top * Math.pow(0.86, 14) * 0.7)
  const lastWeek: NonNullable<RankingView['lastWeek']> = {
    week: '2026-W33',
    rows: [
      { place: 1, name: names[(seed * 5) % names.length], score: Math.round(top * 1.08), badge: 'queen', badgeTier: 'gold' },
      { place: 2, name: names[(seed * 6) % names.length], score: Math.round(top * 0.93), badge: undefined },
      { place: 3, name: names[(seed * 7) % names.length], score: Math.round(top * 0.81), badge: 'chain', badgeTier: 'gold' },
    ],
  }
  return { rank: mePlace, score: myScore, players: 312, pending: false, rows, lastWeek }
}
