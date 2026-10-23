import type { MhMode, MhState } from '../engine/maharajah'
import { MH_ARMY_VALUE, armyMaterial } from '../engine/maharajah'

/**
 * Mihrace'nin cihazdaki kayıtları: rol başına en iyi puan ve rozet sayaçları.
 *
 * Puan haftalık lige koşu defteri üzerinden gider (MaharajahGame → recordRun);
 * buradakiler ana sayfa kartının «en iyin»i, bitiş ekranının «yeni rekor»u ve
 * Mihrace rozetlerinin (badges.ts, bölüm `maharajah`) kaynağı.
 */
const KEY = 'chessrun:mh-best'
const STATS_KEY = 'chessrun:mh-stats'

export type MhBest = Record<MhMode, number>

export function readMhBest(): MhBest {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<MhBest>
    return {
      falcon: typeof raw.falcon === 'number' ? raw.falcon : 0,
      hunter: typeof raw.hunter === 'number' ? raw.hunter : 0,
    }
  } catch {
    return { falcon: 0, hunter: 0 }
  }
}

/** Ana sayfa kartı: iki rolün büyüğü; hiç puan yoksa null («-») */
export function mhBestOverall(): number | null {
  const best = readMhBest()
  const top = Math.max(best.falcon, best.hunter)
  return top > 0 ? top : null
}

/** Puanı yazar; önceki en iyiyi geçtiyse true */
export function recordMhScore(mode: MhMode, score: number): boolean {
  const best = readMhBest()
  if (score <= best[mode]) return false
  best[mode] = score
  try {
    localStorage.setItem(KEY, JSON.stringify(best))
  } catch {
    // Depo yoksa rekor bu oturumda kalır
  }
  return true
}

/* ------------------------------------------------------------------ *
 * Rozet sayaçları
 * ------------------------------------------------------------------ */

export interface MhStats {
  /** Şahin olarak kazanılan oyun (mat) */
  falconWins: number
  /** Avcı olarak kazanılan oyun (mihraceyi yemek) */
  hunterWins: number
  /** En kısa galibiyet, oyuncunun hamlesi; hiç yoksa null */
  fastestWin: number | null
  /** Şahin: bütün ordu yenip mat edildi mi (bir kez yeter) */
  sweep: boolean
  /** Avcı: hiç taş kaybetmeden kazanıldı mı */
  guard: boolean
}

const EMPTY: MhStats = { falconWins: 0, hunterWins: 0, fastestWin: null, sweep: false, guard: false }

export function readMhStats(): MhStats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') as Partial<MhStats>
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
    return {
      falconWins: n(raw.falconWins),
      hunterWins: n(raw.hunterWins),
      fastestWin: typeof raw.fastestWin === 'number' && raw.fastestWin > 0 ? raw.fastestWin : null,
      sweep: raw.sweep === true,
      guard: raw.guard === true,
    }
  } catch {
    return { ...EMPTY }
  }
}

/** Bitmiş bir oyunun sayaçlara etkisi - saf, test edilebilir */
export function applyMhResult(stats: MhStats, game: MhState): MhStats {
  if (game.result?.outcome !== 'win') return stats
  const left = armyMaterial(game.board)
  const next = { ...stats }
  if (game.mode === 'falcon') {
    next.falconWins += 1
    if (left === 0) next.sweep = true
  } else {
    next.hunterWins += 1
    if (left === MH_ARMY_VALUE) next.guard = true
  }
  next.fastestWin = next.fastestWin == null ? game.plies : Math.min(next.fastestWin, game.plies)
  return next
}

/** Bitmiş oyunu işler, yeni sayaçları döndürür */
export function recordMhResult(game: MhState): MhStats {
  const next = applyMhResult(readMhStats(), game)
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(next))
  } catch {
    // depo yoksa sayaç bu oturumla sınırlı
  }
  return next
}
