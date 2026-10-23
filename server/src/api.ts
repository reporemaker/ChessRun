import {
  type BreakdownResponse,
  type BreakdownsResponse,
  type Dimension,
  type Metric,
  type SeriesResponse,
  type SummaryResponse,
  dayKeyUtc,
  isDimension,
  isMetric,
  isPeriod,
} from '../../shared/events'
import { addDays, bucketOf, comparisonOf, daysBetween, rangeOf, type Range } from './period'
import {
  type DailyTotals,
  type DimRow,
  type RunRow,
  type SessionRow,
  type VisitRow,
  computeDims,
  computeTotals,
  foldTotals,
} from './rollup'

/**
 * Okuma API'si - panelin tükettiği dört uç.
 *
 * Tazelik kuralı: dünden öncesi `daily_totals`/`daily_dim` toplamlarından,
 * BUGÜN ham tablodan anlık hesaplanıyor. Bugünün taraması tek güne sınırlı,
 * yani panelde "bugün" hiçbir zaman 24 saat bayat değil; geçmiş günler
 * içinse ham tabloya hiç dokunulmuyor - D1'in okuma bütçesi öyle korunuyor.
 */

type DB = D1Database
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const EMPTY_TOTALS = (day: string): DailyTotals => ({
  day,
  visitors: 0,
  sessions: 0,
  players: 0,
  runs: 0,
  runs_classic: 0,
  runs_kingrun: 0,
  runs_trio: 0,
  runs_daily: 0,
  runs_maharajah: 0,
  dur_sum_ms: 0,
  dur_count: 0,
  dur_p50_ms: null,
  dur_p90_ms: null,
  score_sum: 0,
  sess_dur_sum_ms: 0,
  sess_dur_count: 0,
  sess_dur_p50_ms: null,
  dist_sum: 0,
})

/** Bugünün ham satırlarından anlık toplam - henüz cron çalışmadı */
async function liveTotals(db: DB, day: string): Promise<{ totals: DailyTotals; dims: DimRow[] }> {
  const visits = (
    await db
      .prepare(
        `SELECT session_id, country, ui_lang, nav_lang, accept_lang, browser, os, device,
                viewport, referrer, standalone, app_version FROM visit WHERE day = ?1`,
      )
      .bind(day)
      .all<VisitRow>()
  ).results
  const runs = (
    await db
      .prepare(
        `SELECT session_id, mode, daily, score, distance, duration_ms, end_reason, country, ui_lang,
                device, app_version
           FROM run_event WHERE day = ?1`,
      )
      .bind(day)
      .all<RunRow>()
  ).results
  const sessions = (
    await db.prepare(`SELECT session_id, duration_ms FROM session_event WHERE day = ?1`).bind(day).all<SessionRow>()
  ).results
  return { totals: computeTotals(day, visits, runs, sessions), dims: computeDims(day, visits, runs) }
}

/** Aralıktaki günlük toplamlar: geçmiş toplamdan, bugün hamdan, boş günler sıfır */
async function totalsFor(db: DB, range: Range, today: string): Promise<DailyTotals[]> {
  const stored = (
    await db
      .prepare(`SELECT * FROM daily_totals WHERE day >= ?1 AND day <= ?2 ORDER BY day`)
      .bind(range.from, range.to)
      .all<DailyTotals>()
  ).results
  const byDay = new Map(stored.map((t) => [t.day, t]))

  if (today >= range.from && today <= range.to && !byDay.has(today)) {
    byDay.set(today, (await liveTotals(db, today)).totals)
  }
  return daysBetween(range).map((day) => byDay.get(day) ?? EMPTY_TOTALS(day))
}

export async function summary(db: DB, url: URL, now = Date.now()): Promise<SummaryResponse | Response> {
  const period = url.searchParams.get('period') ?? 'day'
  const at = url.searchParams.get('at') ?? dayKeyUtc(now)
  if (!isPeriod(period)) return bad('period')
  if (!DAY_RE.test(at)) return bad('at')

  const today = dayKeyUtc(now)
  const range = rangeOf(period, at)
  // Sürmekte olan dönemde önceki dönemin yalnızca aynı uzunluktaki başı
  // (bkz. shared/period comparisonOf) - hafta ortasında her delta ▼ olmasın
  const { prev, partial, comparedDays } = comparisonOf(period, range, today)
  const [cur, before] = await Promise.all([totalsFor(db, range, today), totalsFor(db, prev, today)])

  return {
    period,
    from: range.from,
    to: range.to,
    ...foldTotals(cur),
    previous: foldTotals(before),
    partial,
    comparedDays,
  }
}

export async function series(db: DB, url: URL, now = Date.now()): Promise<SeriesResponse | Response> {
  const metric = url.searchParams.get('metric') ?? 'visitors'
  const period = url.searchParams.get('period') ?? 'month'
  const at = url.searchParams.get('at') ?? dayKeyUtc(now)
  if (!isMetric(metric)) return bad('metric')
  if (!isPeriod(period)) return bad('period')
  if (!DAY_RE.test(at)) return bad('at')

  const range = rangeOf(period, at)
  const days = await totalsFor(db, range, dayKeyUtc(now))

  // Yıl görünümünde aylara katlıyoruz; diğerlerinde gün başına nokta
  const buckets = new Map<string, number>()
  for (const d of days) {
    const key = bucketOf(period, d.day)
    buckets.set(key, (buckets.get(key) ?? 0) + d[metric as Metric])
  }
  return { metric, period, points: [...buckets].map(([bucket, value]) => ({ bucket, value })) }
}

/**
 * Kırılım(lar). Tek boyut `breakdown`, birden çok boyut `breakdowns`
 * (`dims=a,b,c`): geçmiş günler `daily_dim`den tek sorguyla, bugün ham
 * satırlardan TEK taramayla - istatistik sayfası eskiden 12 kartı için
 * bugünün ham tablosunu 12 kez tarıyordu.
 *
 * `rest`: sınırın dışında kalanların toplamı; panel bunu "Diğer (n değer)"
 * satırı olarak basar ki yüzdeler 100'e tamamlansın.
 */
export async function breakdown(
  db: DB,
  url: URL,
  now = Date.now(),
): Promise<BreakdownResponse | Response> {
  const dim = url.searchParams.get('dim') ?? 'country'
  if (!isDimension(dim)) return bad('dim')
  const many = await breakdowns(db, withDims(url, dim), now)
  return many instanceof Response ? many : (many[dim] as BreakdownResponse)
}

function withDims(url: URL, dim: string): URL {
  const u = new URL(url.toString())
  u.searchParams.set('dims', dim)
  return u
}

export async function breakdowns(
  db: DB,
  url: URL,
  now = Date.now(),
): Promise<BreakdownsResponse | Response> {
  const dims = (url.searchParams.get('dims') ?? '').split(',').filter(Boolean)
  const period = url.searchParams.get('period') ?? 'month'
  const at = url.searchParams.get('at') ?? dayKeyUtc(now)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20') || 20))
  if (dims.length === 0 || dims.length > 20 || !dims.every(isDimension)) return bad('dims')
  if (!isPeriod(period)) return bad('period')
  if (!DAY_RE.test(at)) return bad('at')

  const today = dayKeyUtc(now)
  const range = rangeOf(period, at)
  const wanted = new Set<string>(dims)

  const placeholders = dims.map((_, i) => `?${i + 3}`).join(',')
  const stored = (
    await db
      .prepare(
        `SELECT dim, value, SUM(visitors) AS visitors, SUM(runs) AS runs
           FROM daily_dim WHERE day >= ?1 AND day <= ?2 AND dim IN (${placeholders})
          GROUP BY dim, value`,
      )
      .bind(range.from, range.to, ...dims)
      .all<{ dim: string; value: string; visitors: number; runs: number }>()
  ).results

  const acc = new Map<string, Map<string, { visitors: number; runs: number }>>()
  const add = (dim: string, value: string, visitors: number, runs: number) => {
    let table = acc.get(dim)
    if (!table) {
      table = new Map()
      acc.set(dim, table)
    }
    const cur = table.get(value) ?? { visitors: 0, runs: 0 }
    cur.visitors += visitors
    cur.runs += runs
    table.set(value, cur)
  }
  for (const r of stored) add(r.dim, r.value, r.visitors, r.runs)

  if (today >= range.from && today <= range.to) {
    const rolled = await db.prepare(`SELECT 1 FROM daily_totals WHERE day = ?1`).bind(today).first()
    if (!rolled) {
      for (const row of (await liveTotals(db, today)).dims) {
        if (wanted.has(row.dim)) add(row.dim, row.value, row.visitors, row.runs)
      }
    }
  }

  const out: BreakdownsResponse = {}
  for (const dim of dims as Dimension[]) {
    // Ziyaret boyutu mu koşu boyutu mu - payı ona göre hesapla
    const runDim = dim === 'mode' || dim === 'end_reason' || dim === 'daily_end'
    const rows = [...(acc.get(dim) ?? new Map<string, { visitors: number; runs: number }>())]
      .map(([value, v]) => ({ value, visitors: v.visitors, runs: v.runs }))
      .sort((a, b) => (runDim ? b.runs - a.runs : b.visitors - a.visitors))
    const total = rows.reduce((s, r) => s + (runDim ? r.runs : r.visitors), 0)
    const shown = rows.slice(0, limit)
    const hidden = rows.slice(limit)
    const restV = hidden.reduce((s, r) => s + r.visitors, 0)
    const restR = hidden.reduce((s, r) => s + r.runs, 0)
    out[dim] = {
      dim,
      total,
      rows: shown.map((r) => ({ ...r, share: total ? (runDim ? r.runs : r.visitors) / total : 0 })),
      rest: hidden.length
        ? { values: hidden.length, visitors: restV, runs: restR, share: total ? (runDim ? restR : restV) / total : 0 }
        : null,
    }
  }
  return out
}

function bad(param: string): Response {
  return Response.json({ error: `invalid ${param}` }, { status: 400 })
}

/* ------------------------------------------------------------------ *
 * Gecelik iş - SQL tarafı; hesap rollup.ts'te
 * ------------------------------------------------------------------ */

/**
 * Dünle biten, `daily_totals`ta satırı olmayan bütün günleri toplar. Başlangıç:
 * son toplanan günün ertesi; hiç toplanmadıysa en eski ham gün. Ham satırlar
 * 35 gün tutulduğu için pencere ona kırpılır (daha eskisi zaten yok).
 * Kaçan bir cron gecesi böylece ertesi gece kapanıyor; eskiden yalnızca
 * "dün" toplanıyordu ve kaçan gün sonsuza dek 0 görünüyordu.
 */
export async function rollupMissing(db: DB, today: string): Promise<string[]> {
  const yesterday = addDays(today, -1)
  const last = await db.prepare(`SELECT MAX(day) AS d FROM daily_totals`).first<{ d: string | null }>()
  const oldest = await db
    .prepare(
      `SELECT MIN(d) AS d FROM (SELECT MIN(day) AS d FROM visit UNION ALL SELECT MIN(day) FROM run_event UNION ALL SELECT MIN(day) FROM session_event)`,
    )
    .first<{ d: string | null }>()
  let start = last?.d ? addDays(last.d, 1) : (oldest?.d ?? yesterday)
  const floor = addDays(today, -RAW_KEEP_DAYS)
  if (start < floor) start = floor
  const done: string[] = []
  for (let day = start; day <= yesterday; day = addDays(day, 1)) {
    await rollupDay(db, day)
    done.push(day)
  }
  return done
}

export async function rollupDay(db: DB, day: string): Promise<void> {
  const { totals, dims } = await liveTotals(db, day)
  const now = Date.now()

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR REPLACE INTO daily_totals
           (day, visitors, sessions, players, runs, runs_classic, runs_kingrun, runs_trio,
            runs_daily, dur_sum_ms, dur_count, dur_p50_ms, dur_p90_ms, score_sum, updated_at,
            sess_dur_sum_ms, sess_dur_count, sess_dur_p50_ms, dist_sum, runs_maharajah)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`,
      )
      .bind(
        totals.day,
        totals.visitors,
        totals.sessions,
        totals.players,
        totals.runs,
        totals.runs_classic,
        totals.runs_kingrun,
        totals.runs_trio,
        totals.runs_daily,
        totals.dur_sum_ms,
        totals.dur_count,
        totals.dur_p50_ms,
        totals.dur_p90_ms,
        totals.score_sum,
        now,
        totals.sess_dur_sum_ms,
        totals.sess_dur_count,
        totals.sess_dur_p50_ms,
        totals.dist_sum,
        totals.runs_maharajah,
      ),
    db.prepare(`DELETE FROM daily_dim WHERE day = ?1`).bind(day),
    ...dims.map((r) =>
      db
        .prepare(`INSERT INTO daily_dim (day, dim, value, visitors, runs) VALUES (?1,?2,?3,?4,?5)`)
        .bind(r.day, r.dim, r.value, r.visitors, r.runs),
    ),
  ]
  await db.batch(stmts)
}

/** 35 günü aşan ham satırlar gidiyor; toplamlar kalıyor */
export const RAW_KEEP_DAYS = 35

export async function pruneRaw(db: DB, today: string, keepDays = RAW_KEEP_DAYS): Promise<void> {
  const cutoff = new Date(`${today}T00:00:00Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays)
  const day = cutoff.toISOString().slice(0, 10)
  await db.batch([
    db.prepare(`DELETE FROM visit WHERE day < ?1`).bind(day),
    db.prepare(`DELETE FROM run_event WHERE day < ?1`).bind(day),
    db.prepare(`DELETE FROM session_event WHERE day < ?1`).bind(day),
  ])
}
