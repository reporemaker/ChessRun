import type { GameMode, PieceType } from '../engine/types'
import type { RunTally } from './badges'

/**
 * Ömür boyu sayaçlar — kümülatif rozet aileleri için.
 *
 * Koşu defteri (`chessrun:runs`) son 300 koşuyu tutuyor; "1000 kale yedin"
 * gibi sayılar oradan hesaplanamaz. Bu depo koşu bittikçe (doğal ya da yarıda)
 * toplamları biriktiriyor. Geriye dönük değil: sayaçlar açıldığı günden
 * başlıyor — 17 Ağustos 2026'da kullanıcıyla kabul edildi.
 *
 * İki grup: `total` (tüm koşuların toplamı) ve `best` (tek koşudaki en iyi
 * — tek-koşu rozet ailelerinin ilerlemesi buradan okunuyor).
 */

const STORAGE_KEY = 'chessrun:lifetime'

const ZERO: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }

export interface Lifetime {
  /** Sayaçların açıldığı gün — "bugünden başlar" dürüstlüğü için görünür */
  since: string
  runs: number
  runsByMode: Record<GameMode, number>
  total: {
    /** Yenen rakip taş, tipe göre */
    captured: Record<PieceType, number>
    /** Hangi taş olarak kaç hamle */
    steps: Record<PieceType, number>
    kings: number
    harakiri: number
    stuckUsed: number
    mated: number
    distance: number
  }
  best: {
    /** Av: piyonken tek koşuda en çok adım */
    pawnSteps: number
    /** Üçlü: vezirle tek koşuda en çok yeme */
    queenCaptures: number
    /** Kaçış: tek koşuda en uzun mesafe */
    kingDistance: number
    /** Üçlü: kadro bütünken en uzun mesafe */
    trioNoLoss: number
    /** Herhangi bir modda tek koşuda en çok şah */
    kingsInRun: number
    /** En uzun şah zinciri */
    streak: number
  }
}

export function emptyLifetime(now = new Date()): Lifetime {
  return {
    since: now.toISOString().slice(0, 10),
    runs: 0,
    runsByMode: { classic: 0, kingRun: 0, trio: 0 },
    total: {
      captured: { ...ZERO },
      steps: { ...ZERO },
      kings: 0,
      harakiri: 0,
      stuckUsed: 0,
      mated: 0,
      distance: 0,
    },
    best: { pawnSteps: 0, queenCaptures: 0, kingDistance: 0, trioNoLoss: 0, kingsInRun: 0, streak: 0 },
  }
}

export function readLifetime(): Lifetime {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyLifetime()
    const parsed = JSON.parse(raw) as Partial<Lifetime>
    // Eksik alanlar (ileride eklenenler) sıfırla dolsun; eski kayıt bozulmasın
    const base = emptyLifetime()
    return {
      ...base,
      ...parsed,
      runsByMode: { ...base.runsByMode, ...parsed.runsByMode },
      total: {
        ...base.total,
        ...parsed.total,
        captured: { ...ZERO, ...parsed.total?.captured },
        steps: { ...ZERO, ...parsed.total?.steps },
      },
      best: { ...base.best, ...parsed.best },
    }
  } catch {
    return emptyLifetime()
  }
}

function write(lifetime: Lifetime): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lifetime))
  } catch {
    // depolama kapalı: sayaçlar bu oturumla sınırlı
  }
}

export interface RunFacts {
  mode: GameMode
  distance: number
}

/** Saf: bir koşuyu ömür boyu toplamlara ekler, yeni nesne döndürür */
export function addRun(life: Lifetime, tally: RunTally, run: RunFacts): Lifetime {
  const captured = { ...life.total.captured }
  const steps = { ...life.total.steps }
  for (const t of Object.keys(ZERO) as PieceType[]) {
    captured[t] += tally.captured[t]
    steps[t] += tally.steps[t]
  }
  return {
    ...life,
    runs: life.runs + 1,
    runsByMode: { ...life.runsByMode, [run.mode]: life.runsByMode[run.mode] + 1 },
    total: {
      captured,
      steps,
      kings: life.total.kings + tally.kings,
      harakiri: life.total.harakiri + tally.harakiri,
      stuckUsed: life.total.stuckUsed + tally.stuckUsed,
      mated: life.total.mated + (tally.mated ? 1 : 0),
      distance: life.total.distance + run.distance,
    },
    best: {
      pawnSteps: Math.max(life.best.pawnSteps, run.mode === 'classic' ? tally.steps.p : 0),
      queenCaptures: Math.max(life.best.queenCaptures, run.mode === 'trio' ? tally.queenCaptures : 0),
      kingDistance: Math.max(life.best.kingDistance, run.mode === 'kingRun' ? run.distance : 0),
      trioNoLoss: Math.max(life.best.trioNoLoss, run.mode === 'trio' ? tally.noLossDistance : 0),
      kingsInRun: Math.max(life.best.kingsInRun, tally.kings),
      streak: Math.max(life.best.streak, tally.bestStreak),
    },
  }
}

/** Koşu bitti: oku, ekle, yaz. Game.recordAndReport çağırıyor. */
export function recordLifetime(tally: RunTally, run: RunFacts): Lifetime {
  const next = addRun(readLifetime(), tally, run)
  write(next)
  return next
}
