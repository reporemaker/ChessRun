import { COL_CHOICES } from '../engine/config'
import type { GameEvent, GameState, PieceType } from '../engine/types'
import type { StringKey } from './i18n'
import type { RunRecord } from './scores'

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
  | 'transform'
  | 'downgrade'
  | 'chain'
  | 'throne'
  | 'breath'
  | 'hunter'
  | 'fugitive'
  | 'squad'
  | 'mate'
  | 'sevenDays'
  | 'allModes'
  | 'narrow'

export type BadgeFamily = 'learn' | 'skill' | 'loyal'

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
}

export function emptyTally(): RunTally {
  return {
    kings: 0,
    bestStreak: 0,
    stuckUsed: 0,
    mated: false,
    transformed: false,
    downgraded: false,
    squadIntact: true,
  }
}

/** Değerli taşlar: bunlardan piyona düşmek "Düşüş" rozetinin konusu */
const HEAVY: PieceType[] = ['q', 'r']

/**
 * Bir turun olaylarını sayaçlara işler. `before` dönüşümün *hangi taştan*
 * olduğunu bilmek için gerekiyor — olay yalnızca hedefi taşıyor.
 */
export function tallyEvents(tally: RunTally, events: GameEvent[], before: PieceType): RunTally {
  const next = { ...tally }

  for (const event of events) {
    switch (event.kind) {
      case 'kingBonus':
        next.kings += 1
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
        break
      case 'pieceLost':
        next.squadIntact = false
        break
      default:
        break
    }
  }

  return next
}

export interface BadgeContext {
  state: GameState
  tally: RunTally
  /** Geçmiş koşular — süreklilik rozetleri buradan hesaplanıyor */
  runs: RunRecord[]
  /** Gün serisi */
  streak: number
}

export interface Badge {
  id: BadgeId
  glyph: string
  family: BadgeFamily
  /** Gizli rozetin adı ve koşulu kazanılana kadar saklanıyor */
  secret: boolean
  nameKey: StringKey
  howKey: StringKey
  earned: (context: BadgeContext) => boolean
}

const NARROW_COLS = COL_CHOICES[0]

export const BADGES: Badge[] = [
  /* --- Mekanik keşfi: koşulu baştan açık, oyunu öğretiyor --- */
  {
    id: 'transform',
    glyph: '♞',
    family: 'learn',
    secret: false,
    nameKey: 'badge.transform',
    howKey: 'badge.transform.how',
    earned: (c) => c.tally.transformed,
  },
  {
    id: 'downgrade',
    glyph: '♟',
    family: 'learn',
    secret: false,
    nameKey: 'badge.downgrade',
    howKey: 'badge.downgrade.how',
    earned: (c) => c.tally.downgraded,
  },
  {
    id: 'chain',
    glyph: '⚡',
    family: 'learn',
    secret: false,
    nameKey: 'badge.chain',
    howKey: 'badge.chain.how',
    earned: (c) => c.tally.bestStreak >= 3,
  },
  {
    id: 'throne',
    glyph: '♚',
    family: 'learn',
    secret: false,
    nameKey: 'badge.throne',
    howKey: 'badge.throne.how',
    earned: (c) => c.tally.kings >= 1,
  },
  {
    id: 'breath',
    glyph: '○',
    family: 'learn',
    secret: false,
    nameKey: 'badge.breath',
    howKey: 'badge.breath.how',
    earned: (c) => c.tally.stuckUsed >= 1,
  },

  /* --- Ustalık: her modun kendi rozeti, koşulu gizli --- */
  {
    id: 'hunter',
    glyph: '♛',
    family: 'skill',
    secret: true,
    nameKey: 'badge.hunter',
    howKey: 'badge.hunter.how',
    earned: (c) => c.state.mode === 'classic' && c.tally.kings >= 2,
  },
  {
    id: 'fugitive',
    glyph: '♚',
    family: 'skill',
    secret: true,
    nameKey: 'badge.fugitive',
    howKey: 'badge.fugitive.how',
    earned: (c) => c.state.mode === 'kingRun' && c.state.distance >= 30,
  },
  {
    id: 'squad',
    glyph: '♜',
    family: 'skill',
    secret: true,
    nameKey: 'badge.squad',
    howKey: 'badge.squad.how',
    earned: (c) => c.state.mode === 'trio' && c.tally.squadIntact && c.state.distance >= 20,
  },
  {
    id: 'mate',
    glyph: '✕',
    family: 'skill',
    secret: true,
    nameKey: 'badge.mate',
    howKey: 'badge.mate.how',
    earned: (c) => c.tally.mated,
  },

  /* --- Süreklilik: zaten var olan sinyallerden, koşulu gizli --- */
  {
    id: 'sevenDays',
    glyph: '▲',
    family: 'loyal',
    secret: true,
    nameKey: 'badge.sevenDays',
    howKey: 'badge.sevenDays.how',
    earned: (c) => c.streak >= 7,
  },
  {
    id: 'allModes',
    glyph: '◆',
    family: 'loyal',
    secret: true,
    nameKey: 'badge.allModes',
    howKey: 'badge.allModes.how',
    earned: (c) => {
      const played = new Set(c.runs.map((run) => run.mode))
      played.add(c.state.mode)
      return played.size >= 3
    },
  },
  {
    id: 'narrow',
    glyph: '▬',
    family: 'loyal',
    secret: true,
    nameKey: 'badge.narrow',
    howKey: 'badge.narrow.how',
    earned: (c) =>
      c.state.board[0].cells.length <= NARROW_COLS && c.state.distance >= 15,
  },
]

export function badgeOf(id: BadgeId): Badge {
  return BADGES.find((badge) => badge.id === id) ?? BADGES[0]
}

/* ------------------------------------------------------------------ *
 * Depolama — kazanılan rozet ve kazanıldığı an
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'chessrun:badges'

export type EarnedBadges = Partial<Record<BadgeId, string>>

export function readBadges(): EarnedBadges {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as EarnedBadges
    return parsed && typeof parsed === 'object' ? parsed : {}
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
 * Yeni kazanılan rozetleri döndürür ve deftere yazar.
 * Zaten kazanılmış rozet bir daha tetiklenmiyor.
 */
export function claimBadges(context: BadgeContext, now = new Date()): BadgeId[] {
  const earned = readBadges()
  const fresh: BadgeId[] = []

  for (const badge of BADGES) {
    if (earned[badge.id]) continue
    if (!badge.earned(context)) continue
    earned[badge.id] = now.toISOString()
    fresh.push(badge.id)
  }

  if (fresh.length > 0) writeBadges(earned)
  return fresh
}

/**
 * Geçmiş koşulardan geriye dönük hesap.
 *
 * Yalnızca deftere yazılan alanlardan türetilebilenler kazanılıyor: eski
 * kayıtlarda sayaç alanları yoksa o rozetler atlanıyor — uydurma yapmıyoruz.
 */
export function claimFromHistory(runs: RunRecord[], streak: number, now = new Date()): BadgeId[] {
  const earned = readBadges()
  const fresh: BadgeId[] = []
  const give = (id: BadgeId) => {
    if (earned[id]) return
    earned[id] = now.toISOString()
    fresh.push(id)
  }

  const modes = new Set(runs.map((run) => run.mode))
  if (modes.size >= 3) give('allModes')
  if (streak >= 7) give('sevenDays')

  for (const run of runs) {
    if (run.chain) {
      const chain = run.chain.split('>') as PieceType[]
      if (chain.length > 1) give('transform')
      for (let i = 1; i < chain.length; i++) {
        if (chain[i] === 'p' && HEAVY.includes(chain[i - 1])) give('downgrade')
      }
    }
    if ((run.kings ?? 0) >= 1) give('throne')
    if ((run.kings ?? 0) >= 2 && run.mode === 'classic') give('hunter')
    if ((run.bestStreak ?? 0) >= 3) give('chain')
    if ((run.stuckUsed ?? 0) >= 1) give('breath')
    if (run.mated) give('mate')
    if (run.mode === 'kingRun' && run.distance >= 30) give('fugitive')
    if (run.cols <= NARROW_COLS && run.distance >= 15) give('narrow')
  }

  if (fresh.length > 0) writeBadges(earned)
  return fresh
}
