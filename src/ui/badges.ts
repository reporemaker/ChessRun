import { COL_CHOICES } from '../engine/config'
import { colsOf } from '../engine/game'
import type { GameEvent, GameMode, GameState, PieceType } from '../engine/types'
import type { StringKey } from './i18n'
import type { Lifetime } from './lifetime'

/**
 * Rozetler — görev listesi değil, **keşif haritası**.
 *
 * Kılavuz kareleri kaldırdığımızdan beri oyunu öğreten iki şey vardı: nasıl
 * oynanır sayfası ve ilk oyunda bir kez çıkan bağlamsal ipuçları. İpuçları
 * bir daha görünmüyor. Rozetler üçüncü katman: kilitli rozet listesi
 * "oyunun yapabildiği ama senin henüz yapmadığın şeyler" haritası oluyor.
 *
 * Bu yüzden "100 oyun oyna" tipi öğütücü rozet yok — hiçbir şey öğretmiyor.
 * Öğreten beş rozetin koşulu baştan açık; ustalık ve süreklilik rozetleri
 * sürpriz değeri için gizli (bkz. `secret`).
 */

export type BadgeId =
  // figür aileleri — kümülatif
  | 'rook'
  | 'knight'
  | 'bishop'
  // figür aileleri — tek koşu
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
  // haftalık lig — sunucu (Faz 9)
  | 'weekFirst'
  | 'weekKing'
  | 'emperor'

export type BadgeSection = 'pieces' | 'skill' | 'loyal' | 'league'

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
  /** Vezir/kaleyken piyona düşüldü mü — dönüşümün riskli yüzü */
  downgraded: boolean
  /** Üçlü: hiç taş kaybedilmedi mi */
  squadIntact: boolean
  /* --- Figür rozetleri için (17 Ağustos 2026 ölçümüyle açıldı) --- */
  /** Yenen rakip taşlar, tipe göre — kale/at/fil kümülatif aileleri buradan */
  captured: Record<PieceType, number>
  /** Hangi taş olarak kaç hamle yapıldı — "piyonken 5 adım" buradan */
  steps: Record<PieceType, number>
  /** Vezirken yenen taş — Üçlü'nün vezir ailesi (Av'da vezir yeyince dönüşür) */
  queenCaptures: number
  /** Vezirken piyon yiyip piyona düşme — Harakiri */
  harakiri: number
  /** Üçlü: kadro tam bütünken kat edilen mesafe — Silahşörler */
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
 * olduğunu bilmek için gerekiyor — olay yalnızca hedefi taşıyor.
 */
export function tallyEvents(
  tally: RunTally,
  events: GameEvent[],
  before: PieceType,
  /** Kayma anındaki mesafe — kadro bütünken kat edilen yol için */
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
 * bunu olaylardan çıkaramıyoruz — Game.runTurn hamleden hemen sonra çağırıyor.
 */
export function tallyStep(tally: RunTally, as: PieceType): RunTally {
  return { ...tally, steps: { ...tally.steps, [as]: tally.steps[as] + 1 } }
}

export interface BadgeContext {
  state: GameState
  /** Bu koşunun sayaçları */
  tally: RunTally
  /** Bu koşudan ÖNCEKİ ömür boyu toplamlar — kümülatif = life + tally */
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
  /** Sunucu gerektiriyor — Faz 9'a kadar kilitli */
  server?: boolean
}

const CUMULATIVE: Tier[] = ['black', 'bronze', 'silver', 'gold']
const SINGLE: Tier[] = ['bronze', 'silver', 'gold']
const ONCE: Tier[] = ['gold']

const NARROW_COLS = COL_CHOICES[0]

/** Bu koşunun modu için mesafe; sayaç yalnızca ilgili modda anlamlı */
const inMode = (context: BadgeContext, mode: GameMode) => context.state.mode === mode

export const BADGES: Badge[] = [
  /* --- Figür aileleri — kümülatif (siyah 1 · bronz 50 · gümüş 250 · altın 1000) --- */
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

  /* --- Figür aileleri — tek koşu (en iyi koşun) --- */
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
    glyph: '†', // hançer — piyon glifi Piyon ailesinin
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

  /* --- Tek koşu ustalık — kademesiz, hepsi açık --- */
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
    glyph: '◎', // hedef — vezir glifi Vezir ailesinin
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
    glyph: '⟳', // döngü — at glifi At ailesinin
    section: 'skill',
    reveal: 'open',
    nameKey: 'badge.transform',
    howKey: 'badge.transform.how',
    thresholds: [1],
    tiers: ONCE,
    value: (c) => (c.tally.transformed ? 1 : 0),
  },

  /* --- Süreklilik — hepsi açık --- */
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

  /* --- Haftalık lig — sunucu (Faz 9) --- */
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
    glyph: '♔', // içi boş şah — dolu ♚ Şah ailesinin
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
 * Depolama — kazanılan kademe ve kazanıldığı an; seçili rozet
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

/** Oyuncunun sıralamada gösterdiği rozet — yalnızca kazanılmış olan seçilebilir */
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

/** Seçili rozetin glifi ve kademesi — sıralama satırı ve künye için */
export function selectedBadgeView(): { id: BadgeId; glyph: string; tier: Tier } | null {
  const id = readSelectedBadge()
  if (!id) return null
  const badge = badgeOf(id)
  const tierIdx = readBadges()[id]?.tier ?? 0
  return { id, glyph: badge.glyph, tier: badge.tiers[Math.min(tierIdx, badge.tiers.length - 1)] }
}
