import type { Board } from '@shared/leaderboard'
import { nextWeek } from '@shared/week'
import { COL_CHOICES } from '../engine/config'
import { tuningActive } from '../engine/tuning'
import { colsOf } from '../engine/game'
import type { GameEvent, GameMode, GameState, PieceType } from '../engine/types'
import type { StringKey } from './i18n'
import type { Lifetime } from './lifetime'
import type { MhStats } from './mhScores'

/**
 * Rozetler - görev listesi değil, **keşif haritası**.
 *
 * Kılavuz kareleri kaldırdığımızdan beri oyunu öğreten iki şey vardı: nasıl
 * oynanır sayfası ve ilk oyunda bir kez çıkan bağlamsal ipuçları. İpuçları
 * bir daha görünmüyor. Rozetler üçüncü katman: kilitli rozet listesi
 * "oyunun yapabildiği ama senin henüz yapmadığın şeyler" haritası oluyor.
 *
 * Bu yüzden "100 oyun oyna" tipi öğütücü rozet yok - hiçbir şey öğretmiyor.
 * Öğreten beş rozetin koşulu baştan açık; ustalık ve süreklilik rozetleri
 * sürpriz değeri için gizli (bkz. `secret`).
 */

export type BadgeId =
  // figür aileleri - kümülatif
  | 'rook'
  | 'knight'
  | 'bishop'
  // figür aileleri - tek koşu
  | 'pawn'
  | 'queen'
  | 'king'
  | 'musketeers'
  // kümülatif ustalık
  | 'harakiri'
  | 'oneUp'
  // tek koşu ustalık (kademesiz)
  | 'chain'
  | 'hunter'
  | 'mate'
  | 'breath'
  | 'transform'
  // süreklilik
  | 'sevenDays'
  | 'thirtyDays'
  | 'narrow'
  // Mihrace (kendi sayaçları: mhScores.ts)
  | 'mhFalcon'
  | 'mhHunter'
  | 'mhSwift'
  | 'mhSweep'
  | 'mhGuard'
  // haftalık lig - sunucu (Faz 9)
  | 'weekFirst'
  | 'weekKing'
  | 'emperor'

export type BadgeSection = 'pieces' | 'skill' | 'loyal' | 'maharajah' | 'league'

/** Kademe: kümülatif ailelerde 4 (siyah ilk kez), tek-koşuda 3, kademesizde 1 */
export type Tier = 'black' | 'bronze' | 'silver' | 'gold'

/**
 * Görünürlük politikası (rozetler.md kararı):
 * - `open`: her şey baştan görünür
 * - `firstOpen`: ilk kademe koşuluyla görünür, üst kademeler kazanılana kadar gizli
 * - `afterFirst`: ilk kademe kazanılana kadar aile hiç GÖRÜNMEZ; sonra hep açık
 * - `hidden`: kazanılana kadar "?"
 */
export type Reveal = 'open' | 'firstOpen' | 'afterFirst' | 'hidden'

/**
 * Bir koşu boyunca biriken sayaçlar.
 *
 * Bunların hiçbiri `GameState`'te tutulmuyor: şah zinciri her turda
 * sıfırlanıyor, yenen şah sayısı hiç sayılmıyor. Rozetler için koşu
 * boyunca ayrıca biriktirmek gerekiyor; aynı sayaçlar koşu sonunda
 * deftere de yazılıyor, böylece geriye dönük hesap mümkün oluyor.
 */
export interface RunTally {
  /** Yenen rakip şah sayısı */
  kings: number
  /** Bu koşudaki en uzun şah zinciri */
  bestStreak: number
  /** Kullanılan sıkışma hakkı */
  stuckUsed: number
  /** Rakip mat edildi mi */
  mated: boolean
  /** Hiç dönüşüm oldu mu (Av) */
  transformed: boolean
  /** Vezir/kaleyken piyona düşüldü mü - dönüşümün riskli yüzü */
  downgraded: boolean
  /** Üçlü: hiç taş kaybedilmedi mi */
  squadIntact: boolean
  /* --- Figür rozetleri için (17 Ağustos 2026 ölçümüyle açıldı) --- */
  /** Yenen rakip taşlar, tipe göre - kale/at/fil kümülatif aileleri buradan */
  captured: Record<PieceType, number>
  /** Hangi taş olarak kaç hamle yapıldı - "piyonken 5 adım" buradan */
  steps: Record<PieceType, number>
  /** Vezirken yenen taş - Üçlü'nün vezir ailesi (Av'da vezir yeyince dönüşür) */
  queenCaptures: number
  /** Vezirken piyon yiyip piyona düşme - Harakiri */
  harakiri: number
  /** Üçlü: kadro tam bütünken kat edilen mesafe - Silahşörler */
  noLossDistance: number
}

const ZERO: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }

export function emptyTally(): RunTally {
  return {
    kings: 0,
    bestStreak: 0,
    stuckUsed: 0,
    mated: false,
    transformed: false,
    downgraded: false,
    squadIntact: true,
    captured: { ...ZERO },
    steps: { ...ZERO },
    queenCaptures: 0,
    harakiri: 0,
    noLossDistance: 0,
  }
}

/** Değerli taşlar: bunlardan piyona düşmek "Düşüş" rozetinin konusu */
const HEAVY: PieceType[] = ['q', 'r']

/**
 * Bir turun olaylarını sayaçlara işler. `before` dönüşümün *hangi taştan*
 * olduğunu bilmek için gerekiyor - olay yalnızca hedefi taşıyor.
 */
export function tallyEvents(
  tally: RunTally,
  events: GameEvent[],
  before: PieceType,
  /** Kayma anındaki mesafe - kadro bütünken kat edilen yol için */
  distance = 0,
): RunTally {
  const next: RunTally = { ...tally, captured: { ...tally.captured }, steps: { ...tally.steps } }

  for (const event of events) {
    switch (event.kind) {
      case 'kingBonus':
        next.kings += 1
        break
      case 'capture':
        next.captured[event.piece] += 1
        if (before === 'q') next.queenCaptures += 1
        break
      case 'check':
        next.bestStreak = Math.max(next.bestStreak, event.streak)
        break
      case 'stuck':
        next.stuckUsed += 1
        break
      case 'mate':
        next.mated = true
        break
      case 'transform':
        next.transformed = true
        if (event.to === 'p' && HEAVY.includes(before)) next.downgraded = true
        if (event.to === 'p' && before === 'q') next.harakiri += 1
        break
      case 'pieceLost':
      case 'lifeLost':
        next.squadIntact = false
        break
      case 'scroll':
        if (next.squadIntact) next.noLossDistance = distance
        break
      default:
        break
    }
  }

  return next
}

/**
 * Oyuncu hamle yaptı: hangi taş olarak? Sessiz hamle olay üretmediği için
 * bunu olaylardan çıkaramıyoruz - Game.runTurn hamleden hemen sonra çağırıyor.
 */
export function tallyStep(tally: RunTally, as: PieceType): RunTally {
  return { ...tally, steps: { ...tally.steps, [as]: tally.steps[as] + 1 } }
}

export interface BadgeContext {
  state: GameState
  /** Bu koşunun sayaçları */
  tally: RunTally
  /** Bu koşudan ÖNCEKİ ömür boyu toplamlar - kümülatif = life + tally */
  life: Lifetime
  /** Günlük seri (defter ve ömür boyu deponun büyüğü) */
  streak: number
}

export interface Badge {
  id: BadgeId
  glyph: string
  section: BadgeSection
  reveal: Reveal
  nameKey: StringKey
  howKey: StringKey
  /** Kademe eşikleri; kademesiz rozette tek eleman [1] */
  thresholds: number[]
  tiers: Tier[]
  /** Şu anki değer (kümülatif ya da bu koşu / en iyi). Sunucu rozetinde null. */
  value: (context: BadgeContext) => number | null
  /** Sunucu gerektiriyor - Faz 9'a kadar kilitli */
  server?: boolean
  /**
   * Mihrace rozeti: değeri kayan tahta koşusundan değil Mihrace sayaçlarından
   * (`value` bu rozetlerde hep null - claimBadges dokunmaz, claimMhBadges işler)
   */
  mh?: (stats: MhStats) => number
}

/** Mihrace'de «hızlı galibiyet» eşiği: oyuncunun en çok bu kadar hamlesi */
export const MH_SWIFT_PLIES = 20

const CUMULATIVE: Tier[] = ['black', 'bronze', 'silver', 'gold']
const SINGLE: Tier[] = ['bronze', 'silver', 'gold']
const ONCE: Tier[] = ['gold']

const NARROW_COLS = COL_CHOICES[0]

/** Bu koşunun modu için mesafe; sayaç yalnızca ilgili modda anlamlı */
const inMode = (context: BadgeContext, mode: GameMode) => context.state.mode === mode

export const BADGES: Badge[] = [
  /* --- Figür aileleri - kümülatif (siyah 1 · bronz 50 · gümüş 250 · altın 1000) --- */
  {
    id: 'rook',
    glyph: '♜',
    section: 'pieces',
    reveal: 'afterFirst',
    nameKey: 'badge.rook',
    howKey: 'badge.rook.how',
    thresholds: [1, 50, 250, 1000],
    tiers: CUMULATIVE,
    value: (c) => c.life.total.captured.r + c.tally.captured.r,
  },
  {
    id: 'knight',
    glyph: '♞',
    section: 'pieces',
    reveal: 'afterFirst',
    nameKey: 'badge.knight',
    howKey: 'badge.knight.how',
    thresholds: [1, 50, 250, 1000],
    tiers: CUMULATIVE,
    value: (c) => c.life.total.captured.n + c.tally.captured.n,
  },
  {
    id: 'bishop',
    glyph: '♝',
    section: 'pieces',
    reveal: 'afterFirst',
    nameKey: 'badge.bishop',
    howKey: 'badge.bishop.how',
    thresholds: [1, 50, 250, 1000],
    tiers: CUMULATIVE,
    value: (c) => c.life.total.captured.b + c.tally.captured.b,
  },

  /* --- Figür aileleri - tek koşu (en iyi koşun) --- */
  {
    id: 'pawn',
    glyph: '♟',
    section: 'pieces',
    reveal: 'firstOpen',
    nameKey: 'badge.pawn',
    howKey: 'badge.pawn.how',
    thresholds: [5, 10, 15],
    tiers: SINGLE,
    value: (c) => Math.max(c.life.best.pawnSteps, inMode(c, 'classic') ? c.tally.steps.p : 0),
  },
  {
    id: 'queen',
    glyph: '♛',
    section: 'pieces',
    reveal: 'firstOpen',
    nameKey: 'badge.queen',
    howKey: 'badge.queen.how',
    thresholds: [10, 40, 80],
    tiers: SINGLE,
    value: (c) => Math.max(c.life.best.queenCaptures, inMode(c, 'trio') ? c.tally.queenCaptures : 0),
  },
  {
    id: 'king',
    glyph: '♚',
    section: 'pieces',
    reveal: 'firstOpen',
    nameKey: 'badge.king',
    howKey: 'badge.king.how',
    thresholds: [20, 45, 75],
    tiers: SINGLE,
    value: (c) => Math.max(c.life.best.kingDistance, inMode(c, 'kingRun') ? c.state.distance : 0),
  },
  {
    id: 'musketeers',
    glyph: '⚜\uFE0E', // fleur-de-lis: silahşörlerin arması; ⚔ X gibi okunuyordu
    section: 'pieces',
    reveal: 'firstOpen',
    nameKey: 'badge.musketeers',
    howKey: 'badge.musketeers.how',
    thresholds: [6, 12, 18],
    tiers: SINGLE,
    value: (c) => Math.max(c.life.best.trioNoLoss, inMode(c, 'trio') ? c.tally.noLossDistance : 0),
  },

  /* --- Kümülatif ustalık --- */
  {
    id: 'harakiri',
    glyph: '†', // hançer - piyon glifi Piyon ailesinin
    section: 'skill',
    reveal: 'firstOpen',
    nameKey: 'badge.harakiri',
    howKey: 'badge.harakiri.how',
    thresholds: [1, 15, 50, 100],
    tiers: CUMULATIVE,
    value: (c) => c.life.total.harakiri + c.tally.harakiri,
  },
  {
    id: 'oneUp',
    glyph: '♥\uFE0E',
    section: 'skill',
    reveal: 'firstOpen',
    nameKey: 'badge.oneUp',
    howKey: 'badge.oneUp.how',
    thresholds: [1, 5, 25, 50],
    tiers: CUMULATIVE,
    value: (c) => c.life.total.kings + c.tally.kings,
  },

  /* --- Tek koşu ustalık - kademesiz, hepsi açık --- */
  {
    id: 'chain',
    glyph: '⚡\uFE0E', // FE0E: emoji değil metin çizimi
    section: 'skill',
    reveal: 'open',
    nameKey: 'badge.chain',
    howKey: 'badge.chain.how',
    thresholds: [1],
    tiers: ONCE,
    value: (c) => (Math.max(c.life.best.streak, c.tally.bestStreak) >= 3 ? 1 : 0),
  },
  {
    id: 'hunter',
    glyph: '◎', // hedef - vezir glifi Vezir ailesinin
    section: 'skill',
    reveal: 'open',
    nameKey: 'badge.hunter',
    howKey: 'badge.hunter.how',
    thresholds: [1],
    tiers: ONCE,
    value: (c) => (inMode(c, 'classic') && c.tally.kings >= 2 ? 1 : 0),
  },
  {
    id: 'mate',
    glyph: '✕',
    section: 'skill',
    reveal: 'open',
    nameKey: 'badge.mate',
    howKey: 'badge.mate.how',
    thresholds: [1],
    tiers: ONCE,
    value: (c) => (c.life.total.mated > 0 || c.tally.mated ? 1 : 0),
  },
  {
    id: 'breath',
    glyph: '○',
    section: 'skill',
    reveal: 'open',
    nameKey: 'badge.breath',
    howKey: 'badge.breath.how',
    thresholds: [1],
    tiers: ONCE,
    value: (c) => (c.life.total.stuckUsed + c.tally.stuckUsed >= 1 ? 1 : 0),
  },
  {
    id: 'transform',
    glyph: '⟳', // döngü - at glifi At ailesinin
    section: 'skill',
    reveal: 'open',
    nameKey: 'badge.transform',
    howKey: 'badge.transform.how',
    thresholds: [1],
    tiers: ONCE,
    value: (c) => (c.tally.transformed ? 1 : 0),
  },

  /* --- Süreklilik - hepsi açık --- */
  {
    id: 'sevenDays',
    glyph: '▲',
    section: 'loyal',
    reveal: 'open',
    nameKey: 'badge.sevenDays',
    howKey: 'badge.sevenDays.how',
    thresholds: [7],
    tiers: ONCE,
    value: (c) => c.streak,
  },
  {
    id: 'thirtyDays',
    glyph: '◆',
    section: 'loyal',
    reveal: 'open',
    nameKey: 'badge.thirtyDays',
    howKey: 'badge.thirtyDays.how',
    thresholds: [30],
    tiers: ONCE,
    value: (c) => c.streak,
  },
  {
    id: 'narrow',
    glyph: '▬',
    section: 'loyal',
    reveal: 'open',
    nameKey: 'badge.narrow',
    howKey: 'badge.narrow.how',
    thresholds: [15],
    tiers: ONCE,
    value: (c) => (colsOf(c.state.board) <= NARROW_COLS ? c.state.distance : 0),
  },

  /* --- Mihrace - hepsi açık: oyunun yapabildiklerini gösteren harita --- */
  {
    id: 'mhFalcon',
    glyph: '✦',
    section: 'maharajah',
    reveal: 'open',
    nameKey: 'badge.mhFalcon',
    howKey: 'badge.mhFalcon.how',
    thresholds: [1, 5, 25, 50],
    tiers: CUMULATIVE,
    value: () => null,
    mh: (s) => s.falconWins,
  },
  {
    id: 'mhHunter',
    glyph: '✣',
    section: 'maharajah',
    reveal: 'open',
    nameKey: 'badge.mhHunter',
    howKey: 'badge.mhHunter.how',
    thresholds: [1, 5, 25, 50],
    tiers: CUMULATIVE,
    value: () => null,
    mh: (s) => s.hunterWins,
  },
  {
    id: 'mhSwift',
    glyph: '»',
    section: 'maharajah',
    reveal: 'open',
    nameKey: 'badge.mhSwift',
    howKey: 'badge.mhSwift.how',
    thresholds: [1],
    tiers: ONCE,
    value: () => null,
    mh: (s) => (s.fastestWin != null && s.fastestWin <= MH_SWIFT_PLIES ? 1 : 0),
  },
  {
    id: 'mhSweep',
    glyph: '∅',
    section: 'maharajah',
    reveal: 'open',
    nameKey: 'badge.mhSweep',
    howKey: 'badge.mhSweep.how',
    thresholds: [1],
    tiers: ONCE,
    value: () => null,
    mh: (s) => (s.sweep ? 1 : 0),
  },
  {
    id: 'mhGuard',
    glyph: '▣',
    section: 'maharajah',
    reveal: 'open',
    nameKey: 'badge.mhGuard',
    howKey: 'badge.mhGuard.how',
    thresholds: [1],
    tiers: ONCE,
    value: () => null,
    mh: (s) => (s.guard ? 1 : 0),
  },

  /* --- Haftalık lig - sunucu (Faz 9) --- */
  {
    id: 'weekFirst',
    glyph: '①',
    section: 'league',
    reveal: 'open',
    nameKey: 'badge.weekFirst',
    howKey: 'badge.weekFirst.how',
    thresholds: [1],
    tiers: ONCE,
    value: () => null,
    server: true,
  },
  {
    id: 'weekKing',
    glyph: '♔', // içi boş şah - dolu ♚ Şah ailesinin
    section: 'league',
    reveal: 'hidden',
    nameKey: 'badge.weekKing',
    howKey: 'badge.weekKing.how',
    thresholds: [1],
    tiers: ONCE,
    value: () => null,
    server: true,
  },
  {
    id: 'emperor',
    glyph: '✪', // taçlı yıldız
    section: 'league',
    reveal: 'hidden',
    nameKey: 'badge.emperor',
    howKey: 'badge.emperor.how',
    thresholds: [1],
    tiers: ONCE,
    value: () => null,
    server: true,
  },
]

export function badgeOf(id: BadgeId): Badge {
  return BADGES.find((badge) => badge.id === id) ?? BADGES[0]
}

/** Sunucudan gelen serbest metin bir rozet kimliği mi - bilinmeyen glif çizilmesin */
export function isBadgeId(value: string): value is BadgeId {
  return BADGES.some((badge) => badge.id === value)
}

/** Değere göre ulaşılan en yüksek kademe indeksi (-1 = hiç) */
export function tierIndex(badge: Badge, value: number | null): number {
  if (value == null) return -1
  let index = -1
  badge.thresholds.forEach((limit, i) => {
    if (value >= limit) index = i
  })
  return index
}

/* ------------------------------------------------------------------ *
 * Depolama - kazanılan kademe ve kazanıldığı an; seçili rozet
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'chessrun:badges'
const SELECTED_KEY = 'chessrun:badge'

export interface EarnedTier {
  /** Kazanılmış en yüksek kademe indeksi */
  tier: number
  /** İlk kazanma ve son kademe atlama zamanı */
  at: string
}

export type EarnedBadges = Partial<Record<BadgeId, EarnedTier>>

export function readBadges(): EarnedBadges {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: EarnedBadges = {}
    for (const [id, v] of Object.entries(parsed)) {
      if (!BADGES.some((b) => b.id === id)) continue
      // Eski biçim (ISO string) → kademe 0
      if (typeof v === 'string') out[id as BadgeId] = { tier: 0, at: v }
      else if (v && typeof v === 'object' && typeof (v as EarnedTier).tier === 'number')
        out[id as BadgeId] = v as EarnedTier
    }
    return out
  } catch {
    return {}
  }
}

function writeBadges(earned: EarnedBadges): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(earned))
  } catch {
    // depolama kapalı: rozetler bu oturumla sınırlı kalır
  }
}

/**
 * İki rozet kaydının birleşimi - sunucu profili ile yerel kopya arasında.
 * Rozet başına en yüksek kademe kalır; aynı kademede en erken tarih. Saf.
 * Bilinmeyen rozet kimlikleri (eski/yeni sürüm farkı) atlanır.
 */
export function mergeBadges(a: EarnedBadges, b: EarnedBadges): EarnedBadges {
  const out: EarnedBadges = {}
  for (const badge of BADGES) {
    const x = a[badge.id]
    const y = b[badge.id]
    if (!x && !y) continue
    if (!x || !y) {
      out[badge.id] = x ?? y
      continue
    }
    if (x.tier !== y.tier) out[badge.id] = x.tier > y.tier ? x : y
    else out[badge.id] = x.at <= y.at ? x : y
  }
  return out
}

/** Sunucudan gelen kaydı yerele işler; bir şey değiştiyse true */
export function mergeIntoBadges(remote: unknown): boolean {
  if (!remote || typeof remote !== 'object') return false
  const local = readBadges()
  const incoming: EarnedBadges = {}
  for (const [id, v] of Object.entries(remote as Record<string, unknown>)) {
    const badge = BADGES.find((b) => b.id === id)
    if (!badge) continue
    if (v && typeof v === 'object' && typeof (v as EarnedTier).tier === 'number' && typeof (v as EarnedTier).at === 'string') {
      // Sunucu verisi istemci yazımı: kademe tam sayı ve tanımlı aralıkta olsun
      const tier = Math.floor((v as EarnedTier).tier)
      if (!Number.isFinite(tier) || tier < 0) continue
      incoming[id as BadgeId] = { tier: Math.min(tier, badge.tiers.length - 1), at: (v as EarnedTier).at.slice(0, 32) }
    }
  }
  const merged = mergeBadges(local, incoming)
  if (JSON.stringify(merged) === JSON.stringify(local)) return false
  writeBadges(merged)
  return true
}

/** Moderatör sıfırlaması: kazanılanlar ve seçim gider */
export function wipeBadges(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(SELECTED_KEY)
  } catch {
    // yoksay
  }
}

/** Yeni kazanılan kademe: hangi rozet, hangi kademe */
export interface BadgeAward {
  id: BadgeId
  tier: number
}

/**
 * Bağlamı değerlendirir, yeni kazanılan kademeleri depoya yazar ve döndürür.
 * Koşu ortasında her commit'te çağrılabilir: değişmeyen kademeler boş döner,
 * yani ucuz. Zaten kazanılmış kademe bir daha tetiklenmiyor.
 */
export function claimBadges(context: BadgeContext, now = new Date()): BadgeAward[] {
  // Zorluk testi kipinde rozet kazanılmaz - kolay eğride her rozet düşerdi
  if (tuningActive()) return []
  const earned = readBadges()
  const fresh: BadgeAward[] = []

  for (const badge of BADGES) {
    if (badge.server) continue
    const reached = tierIndex(badge, badge.value(context))
    const have = earned[badge.id]?.tier ?? -1
    if (reached <= have) continue
    earned[badge.id] = { tier: reached, at: now.toISOString() }
    fresh.push({ id: badge.id, tier: reached })
  }

  if (fresh.length > 0) writeBadges(earned)
  return fresh
}

/** Mihrace sayaçlarından yeni kazanılan kademeler (oyun bitince) */
export function claimMhBadges(stats: MhStats, now = new Date()): BadgeAward[] {
  if (tuningActive()) return []
  const earned = readBadges()
  const fresh: BadgeAward[] = []
  for (const badge of BADGES) {
    if (!badge.mh) continue
    const reached = tierIndex(badge, badge.mh(stats))
    const have = earned[badge.id]?.tier ?? -1
    if (reached <= have) continue
    earned[badge.id] = { tier: reached, at: now.toISOString() }
    fresh.push({ id: badge.id, tier: reached })
  }
  if (fresh.length > 0) writeBadges(earned)
  return fresh
}

/* ------------------------------------------------------------------ *
 * Lig rozetleri - sunucunun "birincilik" listesinden türetiliyor
 * ------------------------------------------------------------------ */

export interface WeekFirst {
  week: string
  /** Ortak lig öncesi haftalarda oyun, sonrasında `all` (ortak lig) */
  mode: Board
}

/**
 * Sunucudan gelen birinciliklerden hangi lig rozetlerinin kazanıldığı.
 * Saf: depoya dokunmuyor, test edilebilir.
 *
 * - weekFirst: en az bir hafta×ligde birinci
 * - weekKing:  aynı hafta üç ligde de birinci - üç ayrı lig döneminden;
 *              ortak ligde (22 Ekim 2026'dan beri) hafta başına tek lig
 *              olduğu için artık kazanılamıyor, kazananlarda duruyor
 * - emperor:   aynı ligde 4 ardışık hafta birinci (ortak ligde de geçerli)
 */
export function leagueAwards(firsts: WeekFirst[]): BadgeId[] {
  if (firsts.length === 0) return []
  const out: BadgeId[] = ['weekFirst']

  const byWeek = new Map<string, Set<Board>>()
  const byMode = new Map<Board, Set<string>>()
  for (const f of firsts) {
    if (!byWeek.has(f.week)) byWeek.set(f.week, new Set())
    byWeek.get(f.week)!.add(f.mode)
    if (!byMode.has(f.mode)) byMode.set(f.mode, new Set())
    byMode.get(f.mode)!.add(f.week)
  }

  if ([...byWeek.values()].some((modes) => modes.size >= 3)) out.push('weekKing')

  const emperor = [...byMode.values()].some((weeks) =>
    [...weeks].some((week) => {
      let run = 1
      let cursor = week
      while (run < 4 && weeks.has((cursor = nextWeek(cursor)))) run++
      return run >= 4
    }),
  )
  if (emperor) out.push('emperor')
  return out
}

/**
 * Sunucudan gelen birincilikleri depoya işler; yeni kazanılanları döndürür.
 * Sunucu rozetleri tek kademeli - kazanıldıysa kademe 0. Alınmış rozet geri
 * alınmıyor: sunucu bir hafta ulaşılamasa da oyuncu kürsüsünü kaybetmez.
 */
export function claimLeague(firsts: WeekFirst[], now = new Date()): BadgeAward[] {
  const earned = readBadges()
  const fresh: BadgeAward[] = []
  for (const id of leagueAwards(firsts)) {
    if (earned[id]) continue
    earned[id] = { tier: 0, at: now.toISOString() }
    fresh.push({ id, tier: 0 })
  }
  if (fresh.length > 0) writeBadges(earned)
  return fresh
}

/** Oyuncunun sıralamada gösterdiği rozet - yalnızca kazanılmış olan seçilebilir */
export function readSelectedBadge(): BadgeId | null {
  try {
    const id = localStorage.getItem(SELECTED_KEY) as BadgeId | null
    if (!id || !BADGES.some((b) => b.id === id)) return null
    return readBadges()[id] ? id : null
  } catch {
    return null
  }
}

export function selectBadge(id: BadgeId | null): void {
  try {
    if (id && !readBadges()[id]) return // kazanılmamış rozet seçilemez
    if (id) localStorage.setItem(SELECTED_KEY, id)
    else localStorage.removeItem(SELECTED_KEY)
  } catch {
    // yok sayılıyor
  }
}

/** Seçili rozetin glifi ve kademesi - sıralama satırı ve künye için */
export function selectedBadgeView(): { id: BadgeId; glyph: string; tier: Tier } | null {
  const id = readSelectedBadge()
  if (!id) return null
  const badge = badgeOf(id)
  const tierIdx = readBadges()[id]?.tier ?? 0
  return { id, glyph: badge.glyph, tier: badge.tiers[Math.min(tierIdx, badge.tiers.length - 1)] }
}
