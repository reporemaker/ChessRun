import { tuningActive } from '../engine/tuning'
import type { GameMode, PieceType } from '../engine/types'
import type { RunTally } from './badges'

/**
 * Ömür boyu sayaçlar - kümülatif rozet aileleri için.
 *
 * Koşu defteri (`chessrun:runs`) son 300 koşuyu tutuyor; "1000 kale yedin"
 * gibi sayılar oradan hesaplanamaz. Bu depo koşu bittikçe (doğal ya da yarıda)
 * toplamları biriktiriyor. Geriye dönük değil: sayaçlar açıldığı günden
 * başlıyor - 17 Ağustos 2026'da kullanıcıyla kabul edildi.
 *
 * İki grup: `total` (tüm koşuların toplamı) ve `best` (tek koşudaki en iyi
 * - tek-koşu rozet ailelerinin ilerlemesi buradan okunuyor).
 */

const STORAGE_KEY = 'chessrun:lifetime'

const ZERO: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }

export interface Lifetime {
  /** Sayaçların açıldığı gün - "bugünden başlar" dürüstlüğü için görünür */
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
  /**
   * Günlük meydan okuma serisi. Defterden hesaplanan seri (scores.currentStreak)
   * 300 koşu sınırına takılıyor: günde 30 oyun oynayan birinin defteri 10 günü
   * kapsar, 30 günlük seri asla 30 okunmaz. Burada koşu koşu güncelleniyor.
   */
  streak: {
    /** Şu anki seri (gün) */
    current: number
    best: number
    /** Serinin son sayıldığı gün anahtarı (YYYY-MM-DD, yerel) */
    lastDay: string | null
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
    runsByMode: { classic: 0, kingRun: 0, trio: 0, daily: 0 },
    total: {
      captured: { ...ZERO },
      steps: { ...ZERO },
      kings: 0,
      harakiri: 0,
      stuckUsed: 0,
      mated: 0,
      distance: 0,
    },
    streak: { current: 0, best: 0, lastDay: null },
    best: { pawnSteps: 0, queenCaptures: 0, kingDistance: 0, trioNoLoss: 0, kingsInRun: 0, streak: 0 },
  }
}

/** 'YYYY-MM-DD' → bir önceki gün, yerel takvim */
export function prevDayKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - 1)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
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
      streak: { ...base.streak, ...parsed.streak },
      best: { ...base.best, ...parsed.best },
    }
  } catch {
    return emptyLifetime()
  }
}

/**
 * İki sayaç kaydının birleşimi - sunucu profili ile yerel kopya. Sayaçlar
 * tek yönlü büyüdüğü için alan alan en büyük kalır; `since` en erken;
 * seri için son günü daha ileri olan kayıt kazanır. Saf.
 */
export function mergeLifetime(a: Lifetime, b: Lifetime): Lifetime {
  const maxRec = <K extends string>(x: Record<K, number>, y: Record<K, number>): Record<K, number> => {
    const out = { ...x }
    for (const k of Object.keys(y) as K[]) out[k] = Math.max(x[k] ?? 0, y[k] ?? 0)
    return out
  }
  const streak =
    (a.streak.lastDay ?? '') === (b.streak.lastDay ?? '')
      ? { current: Math.max(a.streak.current, b.streak.current), best: Math.max(a.streak.best, b.streak.best), lastDay: a.streak.lastDay }
      : {
          ...((a.streak.lastDay ?? '') > (b.streak.lastDay ?? '') ? a.streak : b.streak),
          best: Math.max(a.streak.best, b.streak.best),
        }
  return {
    since: a.since <= b.since ? a.since : b.since,
    runs: Math.max(a.runs, b.runs),
    runsByMode: maxRec(a.runsByMode, b.runsByMode),
    total: {
      ...maxRec(
        { kings: a.total.kings, harakiri: a.total.harakiri, stuckUsed: a.total.stuckUsed, mated: a.total.mated, distance: a.total.distance },
        { kings: b.total.kings, harakiri: b.total.harakiri, stuckUsed: b.total.stuckUsed, mated: b.total.mated, distance: b.total.distance },
      ),
      captured: maxRec(a.total.captured, b.total.captured),
      steps: maxRec(a.total.steps, b.total.steps),
    },
    streak,
    best: maxRec(a.best, b.best),
  }
}

/** Sunucudan gelen kaydı yerele işler; bir şey değiştiyse true */
export function mergeIntoLifetime(remote: unknown): boolean {
  if (!remote || typeof remote !== 'object') return false
  const local = readLifetime()
  // Sunucu verisi istemci yazımı: yalnızca bilinen alanlar, yalnızca sayı.
  // `numRec` şablondaki anahtarları alır, geri kalanı ve sayı olmayanı atar.
  const base = emptyLifetime()
  const r = remote as Partial<Lifetime>
  const n = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)
  const numRec = <K extends string>(tpl: Record<K, number>, src: unknown): Record<K, number> => {
    const out = { ...tpl }
    if (src && typeof src === 'object') for (const k of Object.keys(tpl) as K[]) out[k] = n((src as Record<K, unknown>)[k], tpl[k])
    return out
  }
  const rs = (r.streak ?? {}) as Partial<Lifetime['streak']>
  const rt = (r.total ?? {}) as Partial<Lifetime['total']>
  const incoming: Lifetime = {
    since: typeof r.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.since) ? r.since : base.since,
    runs: n(r.runs, 0),
    runsByMode: numRec(base.runsByMode, r.runsByMode),
    total: {
      captured: numRec(ZERO, rt.captured),
      steps: numRec(ZERO, rt.steps),
      kings: n(rt.kings, 0),
      harakiri: n(rt.harakiri, 0),
      stuckUsed: n(rt.stuckUsed, 0),
      mated: n(rt.mated, 0),
      distance: n(rt.distance, 0),
    },
    streak: {
      current: n(rs.current, 0),
      best: n(rs.best, 0),
      lastDay: typeof rs.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rs.lastDay) ? rs.lastDay : null,
    },
    best: numRec(base.best, r.best),
  }
  const merged = mergeLifetime(local, incoming)
  if (JSON.stringify(merged) === JSON.stringify(local)) return false
  write(merged)
  return true
}

/** Moderatör sıfırlaması */
export function wipeLifetime(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // yoksay
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
  /** Günlük meydan okumaysa gün anahtarı - seri buradan ilerliyor */
  daily?: string
}

/** Saf: bir koşuyu ömür boyu toplamlara ekler, yeni nesne döndürür */
export function addRun(life: Lifetime, tally: RunTally, run: RunFacts): Lifetime {
  const captured = { ...life.total.captured }
  const steps = { ...life.total.steps }
  for (const t of Object.keys(ZERO) as PieceType[]) {
    captured[t] += tally.captured[t]
    steps[t] += tally.steps[t]
  }
  // Seri: aynı gün → değişmez; dün → +1; kopuk → 1. Yalnızca günlük koşular.
  let streak = life.streak
  if (run.daily) {
    if (life.streak.lastDay === run.daily) streak = life.streak
    else if (life.streak.lastDay === prevDayKey(run.daily)) {
      const current = life.streak.current + 1
      streak = { current, best: Math.max(life.streak.best, current), lastDay: run.daily }
    } else streak = { current: 1, best: Math.max(life.streak.best, 1), lastDay: run.daily }
  }

  return {
    ...life,
    runs: life.runs + 1,
    streak,
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
  // Zorluk testi kipinde ömür boyu sayaçlar ilerlemez
  if (tuningActive()) return readLifetime()
  const next = addRun(readLifetime(), tally, run)
  write(next)
  return next
}

/**
 * Bugün itibarıyla geçerli seri: son günlük koşu bugün ya da dünse `current`,
 * değilse seri kopmuş demektir → 0. Home ve rozetler bunu defter serisiyle
 * `Math.max` yapıyor: eski oyuncuların bu depo açılmadan önceki serisi
 * defterden geliyor.
 */
export function lifetimeStreak(life: Lifetime = readLifetime(), today: string = localDayKey()): number {
  if (!life.streak.lastDay) return 0
  if (life.streak.lastDay === today || life.streak.lastDay === prevDayKey(today)) return life.streak.current
  return 0
}

function localDayKey(now = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}
