import { MODES } from '@shared/events'
import { hashSeed } from '../engine/random'
import { tuningActive } from '../engine/tuning'
import type { GameMode, PieceType } from '../engine/types'
import { getIdentity, runPayload, signPayload } from './identity'
import type { Translate } from './text'

/**
 * Cihazın skor defteri.
 *
 * Her koşu imzalanıp saklanıyor; rekorlar, haftalık yarışma ve günlük
 * meydan okuma bu tek defterden hesaplanıyor. Sunucu yokken yarışma
 * "kendi rekorunu geç" demek - sunucu bağlandığı an aynı kayıtlar global
 * tabloya gidiyor (bkz. leaderboard.ts).
 */
/**
 * Defterdeki oyun: motorun kayan tahta oyunları + Mihrace (kendi motoru,
 * engine/maharajah.ts). Sunucunun tanıdığı listeyle aynı (shared MODES).
 */
export type RunMode = GameMode | 'maharajah'

export interface RunRecord {
  mode: RunMode
  score: number
  distance: number
  /** Koridor genişliği - rekorlar genişliğe göre de tutuluyor */
  cols: number
  level: number
  /** ISO zaman damgası */
  at: string
  /** ISO hafta anahtarı: 2026-W33 */
  week: string
  /** Günlük meydan okumaysa günün anahtarı: 2026-08-16 */
  daily?: string
  /** Koşunun yerel takvim günü - günlük çarpan hangi güne bakıyor */
  day?: string
  /** Günlük çarpan uygulandıysa: ham puan ve çarpan (`score` çarpılmış hâl) */
  rawScore?: number
  bonus?: number
  /** Dönüşüm zinciri, sıkıştırılmış: "n>b>q" */
  chain?: string
  /* --- Rozet sayaçları: eski kayıtlarda yok, bu yüzden hepsi isteğe bağlı.
     Yokluk "olmadı" değil "bilinmiyor" demek; geriye dönük hesapta
     atlanıyorlar (bkz. `claimFromHistory`). --- */
  /** Bu koşuda yenen rakip şah sayısı */
  kings?: number
  /** Bu koşudaki en uzun şah zinciri */
  bestStreak?: number
  /** Kullanılan sıkışma hakkı */
  stuckUsed?: number
  /** Rakip mat edildi mi */
  mated?: boolean
  /** HMAC imzası (üretilemezse yok) */
  sig?: string
}

const RUNS_KEY = 'chessrun:runs'
const MAX_RUNS = 300

/* ------------------------------------------------------------------ *
 * Saf yardımcılar - depolamaya dokunmadıkları için doğrudan test edilir
 * ------------------------------------------------------------------ */

/**
 * ISO 8601 hafta anahtarı. Haftanın perşembesi hangi yıldaysa hafta o yıla
 * aittir - yılbaşına denk gelen haftaların iki yıla bölünmesini bu engelliyor.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)

  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Günün anahtarı, yerel takvime göre: 2026-08-16 */
export function dayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Günün tohumu. İki mod da aynı tohumu paylaşıyor: "bugünün tahtası"
 * herkes için ve her mod için aynı kaynaktan doğuyor.
 */
export function dailySeed(day: string): number {
  return hashSeed(day)
}

/** Haftanın bittiği an: bir sonraki pazartesi 00:00 (yerel saat) */
export function weekEnd(date: Date): Date {
  const end = new Date(date)
  const day = end.getDay() || 7
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + (8 - day))
  return end
}

/**
 * Günün mücadelesi puanı (o günün en iyi günlük koşusu) - diğer oyunlara
 * çarpan için. Oynanmadıysa null.
 */
export function dailyScoreOf(runs: RunRecord[], day: string): number | null {
  const best = runs
    .filter((run) => run.mode === 'daily' && run.daily === day)
    .reduce((top, run) => Math.max(top, run.score), -1)
  return best < 0 ? null : best
}

/** Günün bittiği an: yarın 00:00 */
export function dayEnd(date: Date): Date {
  const end = new Date(date)
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + 1)
  return end
}

/** Kalan süre, arayüz dilinde (eskiden her dilde Türkçe «2 gün 10 saat» yazıyordu) */
export function formatRemaining(ms: number, t: Translate): string {
  if (ms <= 0) return t('time.over')

  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(hours / 24)

  if (days > 0) return t('time.dh', { d: days, h: hours % 24 })
  if (hours > 0) return t('time.hm', { h: hours, m: Math.floor((ms % 3_600_000) / 60_000) })
  return t('time.m', { m: Math.max(1, Math.floor(ms / 60_000)) })
}

export function bestOf(runs: RunRecord[]): RunRecord | null {
  return runs.reduce<RunRecord | null>(
    (best, run) => (best == null || run.score > best.score ? run : best),
    null,
  )
}

export function runsOfWeek(runs: RunRecord[], week: string): RunRecord[] {
  return runs.filter((run) => run.week === week)
}

export function runsOfMode(runs: RunRecord[], mode: RunMode): RunRecord[] {
  return runs.filter((run) => run.mode === mode)
}

/** Arcade skor tablosu: en iyiler, yüksekten alçağa */
export function topRuns(runs: RunRecord[], mode: RunMode, limit = 8): RunRecord[] {
  return runsOfMode(runs, mode)
    .slice()
    .sort((a, b) => b.score - a.score || b.distance - a.distance)
    .slice(0, limit)
}

/** Bir koşunun kendi modundaki sırası (1'den başlar) */
export function rankOf(runs: RunRecord[], run: RunRecord): number {
  const better = runsOfMode(runs, run.mode).filter(
    (other) => other.at !== run.at && other.score > run.score,
  )
  return better.length + 1
}

export function dailyRuns(runs: RunRecord[], day: string, mode?: GameMode): RunRecord[] {
  return runs.filter((run) => run.daily === day && (mode == null || run.mode === mode))
}

/**
 * Gün serisi: bugünden geriye doğru kaç gün üst üste günlük oynandı.
 * Bugün henüz oynanmadıysa seri dünden sayılır - gün bitmeden seri kırılmaz.
 */
export function currentStreak(runs: RunRecord[], now: Date = new Date()): number {
  const played = new Set(runs.map((run) => run.daily).filter(Boolean) as string[])
  if (played.size === 0) return 0

  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  if (!played.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  while (played.has(dayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

export interface WeekSummary {
  week: string
  best: number
  games: number
}

/** Haftalık özet, en yeni hafta başta */
export function weeklyHistory(runs: RunRecord[]): WeekSummary[] {
  const byWeek = new Map<string, WeekSummary>()

  for (const run of runs) {
    const entry = byWeek.get(run.week) ?? { week: run.week, best: 0, games: 0 }
    entry.best = Math.max(entry.best, run.score)
    entry.games += 1
    byWeek.set(run.week, entry)
  }

  return [...byWeek.values()].sort((a, b) => b.week.localeCompare(a.week))
}

/* ------------------------------------------------------------------ *
 * Depolama
 * ------------------------------------------------------------------ */

export function readRuns(): RunRecord[] {
  try {
    const stored = localStorage.getItem(RUNS_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored) as RunRecord[]
    if (!Array.isArray(parsed)) return []
    // Mod alanı sonradan eklendi: eski kayıtlar klasik sayılır
    return parsed.map((run) => ({ ...run, mode: run.mode ?? 'classic' }))
  } catch {
    return []
  }
}

function writeRuns(runs: RunRecord[]): void {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(-MAX_RUNS)))
  } catch {
    // depolama kapalı: skorlar bu oturumla sınırlı kalır
  }
}

/**
 * İki defterin birleşimi: koşu `at` (ISO zaman) ile tekil - aynı anda iki
 * koşu olamaz. Zamana göre sıralı, en yeni MAX_RUNS kalır. Saf.
 */
export function mergeRuns(a: RunRecord[], b: RunRecord[]): RunRecord[] {
  const byAt = new Map<string, RunRecord>()
  for (const run of [...b, ...a]) if (run && typeof run.at === 'string') byAt.set(run.at, run)
  return [...byAt.values()].sort((x, y) => x.at.localeCompare(y.at)).slice(-MAX_RUNS)
}

/** Sunucu profilindeki defter özetini yerele işler; değiştiyse true */
export function mergeIntoRuns(remote: unknown): boolean {
  if (!Array.isArray(remote)) return false
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  const modes = new Set<string>(MODES)
  // Sunucu verisi istemci yazımı: bozuk kayıt defteri (ve onu okuyan
  // ekranları) çökertmesin - alan alan doğrula, tanınmayanı at
  const incoming = (remote as RunRecord[]).filter(
    (r) =>
      r &&
      typeof r === 'object' &&
      typeof r.at === 'string' &&
      /^\d{4}-\d{2}-\d{2}T/.test(r.at) &&
      typeof r.week === 'string' &&
      /^\d{4}-W\d{2}$/.test(r.week) &&
      modes.has(r.mode) &&
      num(r.score) &&
      num(r.distance) &&
      num(r.cols) &&
      num(r.level),
  )
  if (incoming.length === 0) return false
  const local = readRuns()
  const merged = mergeRuns(local, incoming)
  if (merged.length === local.length && merged.every((r, i) => r.at === local[i]?.at)) return false
  writeRuns(merged)
  return true
}

/** Profil için özet: son PROFILE_RUNS koşu (tam defter değil, boyut için) */
export const PROFILE_RUNS = 100
export function runsForProfile(): RunRecord[] {
  return readRuns().slice(-PROFILE_RUNS)
}

/** Moderatör sıfırlaması */
export function wipeRuns(): void {
  try {
    localStorage.removeItem(RUNS_KEY)
  } catch {
    // yoksay
  }
}

export interface RunInput {
  mode: RunMode
  score: number
  distance: number
  cols: number
  level: number
  daily?: string
  day?: string
  rawScore?: number
  bonus?: number
  chain?: PieceType[]
  /* --- Rozet sayaçları. `RunRecord`'da baştan tanımlıydılar ama hiçbir
     şey yazmıyordu; `badges.ts`'in geriye dönük hesabı bunları okuyor.
     Buradan itibaren dolduruluyorlar. --- */
  kings?: number
  bestStreak?: number
  stuckUsed?: number
  mated?: boolean
}

/** Koşuyu imzalayıp deftere yazar */
export async function recordRun(input: RunInput, now = new Date()): Promise<RunRecord> {
  const identity = getIdentity()
  const at = now.toISOString()
  const week = isoWeekKey(now)

  // İmzalanan alan listesi bilerek genişletilmiyor: rozet sayaçları
  // eklenseydi daha önce imzalanmış her kayıt doğrulanamaz hale gelirdi,
  // karşılığında hiçbir şey kazanılmazdı - imza skoru cihaza bağlamak için.
  const payload = runPayload([
    identity.token,
    input.mode,
    input.score,
    input.distance,
    input.cols,
    input.level,
    at,
    week,
    input.daily ?? '',
  ])

  const run: RunRecord = {
    mode: input.mode,
    score: input.score,
    distance: input.distance,
    cols: input.cols,
    level: input.level,
    at,
    week,
    daily: input.daily,
    day: input.day,
    rawScore: input.rawScore,
    bonus: input.bonus,
    chain: input.chain?.join('>'),
    kings: input.kings,
    bestStreak: input.bestStreak,
    stuckUsed: input.stuckUsed,
    mated: input.mated,
    sig: (await signPayload(payload)) ?? undefined,
  }

  // Zorluk testi kipinde koşu deftere YAZILMAZ - kayıt gerçek istatistiği
  // kirletmesin; dönen kayıt yalnızca kapanış ekranı için.
  if (!tuningActive()) writeRuns([...readRuns(), run])
  return run
}

export interface Standing {
  allTime: RunRecord | null
  thisWeek: RunRecord | null
  games: number
  weekGames: number
  week: string
  weekEndsAt: Date
  history: WeekSummary[]
  streak: number
}

/** Bir modun (ya da mod verilmezse tüm oyunların) durumu */
export function readStanding(mode?: GameMode, now: Date = new Date()): Standing {
  const all = readRuns()
  const runs = mode ? runsOfMode(all, mode) : all
  const week = isoWeekKey(now)
  const weekRuns = runsOfWeek(runs, week)

  return {
    allTime: bestOf(runs),
    thisWeek: bestOf(weekRuns),
    games: runs.length,
    weekGames: weekRuns.length,
    week,
    weekEndsAt: weekEnd(now),
    history: weeklyHistory(runs).filter((entry) => entry.week !== week),
    streak: currentStreak(all, now),
  }
}
