import { describe, expect, it } from 'vitest'
import { addDays, bucketOf, comparisonOf, daysBetween, previousOf, rangeOf } from './period'
import {
  type RunRow,
  type VisitRow,
  computeDims,
  computeTotals,
  foldTotals,
  percentile,
} from './rollup'

const visit = (over: Partial<VisitRow> = {}): VisitRow => ({
  session_id: 's1',
  country: 'TR',
  ui_lang: 'tr',
  nav_lang: 'tr',
  accept_lang: 'tr',
  browser: 'chrome',
  os: 'android',
  device: 'mobile',
  viewport: 'xs',
  referrer: '',
  standalone: 0,
  app_version: '1.0',
  ...over,
})

const run = (over: Partial<RunRow> = {}): RunRow => ({
  session_id: 's1',
  mode: 'classic',
  daily: 0,
  score: 10,
  distance: 20,
  app_version: '1.0',
  duration_ms: 30_000,
  end_reason: 'lifeLost',
  country: 'TR',
  ui_lang: 'tr',
  device: 'mobile',
  ...over,
})

describe('percentile', () => {
  it('boş dizide null', () => {
    expect(percentile([], 50)).toBeNull()
  })

  it('gerçek bir gözlem döndürüyor, ara değer değil', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20)
    expect(percentile([10, 20, 30, 40], 90)).toBe(40)
    expect(percentile([7], 50)).toBe(7)
  })
})

describe('computeTotals', () => {
  it('oturum = ziyaret oturumları ∪ oturum-sonu olayları (aynı kişinin ikinci açılışı sayılır)', () => {
    const t = computeTotals('d', [visit({ session_id: 's1' })], [], [
      { session_id: 's1', duration_ms: 1000 },
      { session_id: 's2', duration_ms: 3000 },
      { session_id: 's3', duration_ms: null },
    ])
    expect(t.visitors).toBe(1)
    expect(t.sessions).toBe(3)
  })
  it('oturum süresi yalnızca süre bildiren oturum-sonu satırlarından; mesafe toplamı koşulardan', () => {
    const t = computeTotals('d', [], [run({ distance: 10 }), run({ distance: 30 })], [
      { session_id: 's1', duration_ms: 1000 },
      { session_id: 's2', duration_ms: 3000 },
      { session_id: 's3', duration_ms: null },
    ])
    expect(t.sess_dur_count).toBe(2)
    expect(t.sess_dur_sum_ms).toBe(4000)
    expect(t.sess_dur_p50_ms).toBe(1000)
    expect(t.dist_sum).toBe(40)
  })
  it('ziyaretçi = satır, oturum = farklı session, oyuncu = koşusu olan oturum', () => {
    const t = computeTotals(
      '2026-08-17',
      [visit({ session_id: 'a' }), visit({ session_id: 'a' }), visit({ session_id: 'b' })],
      [run({ session_id: 'a' }), run({ session_id: 'a' })],
    )
    expect(t.visitors).toBe(3)
    expect(t.sessions).toBe(2)
    expect(t.players).toBe(1)
    expect(t.runs).toBe(2)
  })

  it('modları ayrı sayıyor ve günlük meydan okumayı işaretliyor', () => {
    const t = computeTotals(
      'd',
      [],
      [run({ mode: 'trio' }), run({ mode: 'trio' }), run({ mode: 'kingRun', daily: 1 })],
    )
    expect(t.runs_trio).toBe(2)
    expect(t.runs_kingrun).toBe(1)
    expect(t.runs_classic).toBe(0)
    expect(t.runs_daily).toBe(1)
  })

  it('süresi olmayan koşu ortalamayı bozmuyor', () => {
    const t = computeTotals('d', [], [run({ duration_ms: 10_000 }), run({ duration_ms: null })])
    expect(t.dur_count).toBe(1)
    expect(t.dur_sum_ms).toBe(10_000)
    expect(t.dur_p50_ms).toBe(10_000)
  })

  it('bilinmeyen mod sayımı bozmuyor', () => {
    const t = computeTotals('d', [], [run({ mode: 'uydurma' })])
    expect(t.runs).toBe(1)
    expect(t.runs_classic + t.runs_kingrun + t.runs_trio).toBe(0)
  })
})

describe('computeDims', () => {
  it('ziyaret boyutları visitors, koşu boyutları runs sayıyor', () => {
    const rows = computeDims('d', [visit({ country: 'TR' }), visit({ country: 'DE' })], [
      run({ mode: 'trio' }),
    ])
    const find = (dim: string, value: string) => rows.find((r) => r.dim === dim && r.value === value)
    expect(find('country', 'TR')?.visitors).toBe(1)
    expect(find('country', 'DE')?.visitors).toBe(1)
    expect(find('mode', 'trio')?.runs).toBe(1)
  })

  it('boş yönlendiren "direct", boş dil "?"', () => {
    const rows = computeDims('d', [visit({ referrer: '', nav_lang: '' })], [])
    expect(rows.find((r) => r.dim === 'referrer')?.value).toBe('direct')
    expect(rows.find((r) => r.dim === 'nav_lang')?.value).toBe('?')
  })

  it('PWA açılışı ayrı kovada', () => {
    const rows = computeDims('d', [visit({ standalone: 1 }), visit({ standalone: 0 })], [])
    const pwa = rows.find((r) => r.dim === 'standalone' && r.value === 'pwa')
    expect(pwa?.visitors).toBe(1)
  })

  it('günlük huni yalnızca günlük koşuları sayıyor; sürüm iki tarafta da var', () => {
    const rows = computeDims(
      'd',
      [visit({ app_version: '1.0' }), visit({ session_id: 's2', app_version: '1.1' })],
      [
        run({ daily: 1, end_reason: 'abandoned' }),
        run({ daily: 1, end_reason: 'lifeLost' }),
        run({ daily: 0, end_reason: 'lifeLost' }),
      ],
    )
    const funnel = rows.filter((r) => r.dim === 'daily_end')
    expect(funnel.reduce((s, r) => s + r.runs, 0)).toBe(2)
    expect(funnel.find((r) => r.value === 'abandoned')?.runs).toBe(1)
    // Günlük olmayan koşu huniye girmez ama genel bitişe girer
    expect(rows.find((r) => r.dim === 'end_reason' && r.value === 'lifeLost')?.runs).toBe(2)
    expect(rows.find((r) => r.dim === 'app_version' && r.value === '1.1')?.visitors).toBe(1)
    expect(rows.find((r) => r.dim === 'app_version' && r.value === '1.0')?.runs).toBe(3)
  })
})

describe('foldTotals - planın tek değişmezi', () => {
  it('bir haftanın toplamı yedi gününün toplamına eşit', () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      computeTotals(
        `2026-08-1${i}`,
        Array.from({ length: i + 1 }, (_, k) => visit({ session_id: `s${i}-${k}` })),
        Array.from({ length: i }, (_, k) => run({ session_id: `s${i}-${k}`, duration_ms: 1000 * (k + 1) })),
      ),
    )
    const week = foldTotals(days)
    expect(week.visitors).toBe(1 + 2 + 3 + 4 + 5 + 6 + 7)
    expect(week.runs).toBe(0 + 1 + 2 + 3 + 4 + 5 + 6)
    expect(week.players).toBe(days.reduce((s, d) => s + d.players, 0))
    // Ortalama toplam süre / toplam sayı - günlük ortalamaların ortalaması DEĞİL
    const sum = days.reduce((s, d) => s + d.dur_sum_ms, 0)
    const cnt = days.reduce((s, d) => s + d.dur_count, 0)
    expect(week.avgDurationMs).toBe(Math.round(sum / cnt))
  })

  it('medyan yalnızca tek günde - medyanların ortalaması medyan değildir', () => {
    const one = computeTotals('d', [], [run({ duration_ms: 5 }), run({ duration_ms: 50 }), run({ duration_ms: 500 })])
    expect(foldTotals([one]).medianDurationMs).toBe(50)
    expect(foldTotals([one, one]).medianDurationMs).toBeNull()
  })

  it('boş dönemde sıfırlar, NaN yok', () => {
    const empty = foldTotals([])
    expect(empty.avgDurationMs).toBe(0)
    expect(empty.runs).toBe(0)
    expect(empty.avgSessionMs).toBe(0)
    expect(empty.avgScore).toBe(0)
    expect(Number.isNaN(empty.avgDurationMs)).toBe(false)
  })

  it('oturum süresi ortalaması toplam/sayı; medyan ve p90 tek günde; ort. skor ve mesafe koşu başına', () => {
    const a = computeTotals('a', [], [run({ score: 10, distance: 5, duration_ms: 1 }), run({ score: 30, distance: 15, duration_ms: 100 })], [
      { session_id: 's1', duration_ms: 2000 },
    ])
    const b = computeTotals('b', [], [run({ score: 20, distance: 10 })], [
      { session_id: 's2', duration_ms: 4000 },
      { session_id: 's3', duration_ms: 6000 },
    ])
    const one = foldTotals([a])
    expect(one.avgSessionMs).toBe(2000)
    expect(one.medianSessionMs).toBe(2000)
    expect(one.p90DurationMs).toBe(100)
    expect(one.avgScore).toBe(20)
    expect(one.avgDistance).toBe(10)
    const two = foldTotals([a, b])
    expect(two.avgSessionMs).toBe(4000)
    expect(two.medianSessionMs).toBeNull()
    expect(two.p90DurationMs).toBeNull()
    expect(two.avgScore).toBe(20)
  })

  it('0005 öncesi toplam satırı (yeni sütunlar yok) çökertmiyor', () => {
    const legacy = { ...computeTotals('x', [], [run()]) } as Record<string, unknown>
    delete legacy.sess_dur_sum_ms
    delete legacy.sess_dur_count
    delete legacy.sess_dur_p50_ms
    delete legacy.dist_sum
    const f = foldTotals([legacy as unknown as ReturnType<typeof computeTotals>])
    expect(f.avgSessionMs).toBe(0)
    expect(f.avgDistance).toBe(0)
    expect(f.medianSessionMs).toBeNull()
  })
})

describe('comparisonOf - kısmi dönem deltası', () => {
  it('hafta ortasında önceki haftanın yalnızca aynı günleri', () => {
    // 2026-08-17 Pazartesi; bugün Çarşamba 19'u → 3 gün geçti
    const range = rangeOf('week', '2026-08-19')
    const c = comparisonOf('week', range, '2026-08-19')
    expect(c.partial).toBe(true)
    expect(c.comparedDays).toBe(3)
    expect(c.prev).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })
  it('bitmiş dönemde tam önceki dönem; son günde de tam', () => {
    const range = rangeOf('week', '2026-08-10')
    const done = comparisonOf('week', range, '2026-08-19')
    expect(done.partial).toBe(false)
    expect(done.comparedDays).toBe(7)
    expect(done.prev).toEqual(previousOf('week', range))
    const last = comparisonOf('week', range, '2026-08-16')
    expect(last.partial).toBe(false)
  })
  it('gün görünümü hiç kısmi değil; ay ortası önceki ayın ilk N günü', () => {
    expect(comparisonOf('day', rangeOf('day', '2026-08-19'), '2026-08-19').partial).toBe(false)
    const m = comparisonOf('month', rangeOf('month', '2026-08-19'), '2026-08-19')
    expect(m.comparedDays).toBe(19)
    expect(m.prev).toEqual({ from: '2026-07-01', to: '2026-07-19' })
  })
})

describe('period', () => {
  it('hafta Pazartesi başlıyor (ISO)', () => {
    // 2026-08-17 Pazartesi
    expect(rangeOf('week', '2026-08-17')).toEqual({ from: '2026-08-17', to: '2026-08-23' })
    // 2026-08-23 Pazar → aynı hafta
    expect(rangeOf('week', '2026-08-23')).toEqual({ from: '2026-08-17', to: '2026-08-23' })
    // 2026-08-16 Pazar → önceki hafta
    expect(rangeOf('week', '2026-08-16')).toEqual({ from: '2026-08-10', to: '2026-08-16' })
  })

  it('ay sonunu doğru buluyor - Şubat ve 31 çeken aylar', () => {
    expect(rangeOf('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(rangeOf('month', '2028-02-10').to).toBe('2028-02-29')
    expect(rangeOf('month', '2026-08-17')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('yıl', () => {
    expect(rangeOf('year', '2026-08-17')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('önceki dönem aynı uzunlukta ve bitişik', () => {
    const w = rangeOf('week', '2026-08-17')
    expect(previousOf('week', w)).toEqual({ from: '2026-08-10', to: '2026-08-16' })
    const m = rangeOf('month', '2026-03-15')
    expect(previousOf('month', m)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    const y = rangeOf('year', '2026-06-01')
    expect(previousOf('year', y)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    // Yılbaşından bir gün önce → önceki yıl
    expect(previousOf('day', rangeOf('day', '2026-01-01'))).toEqual({ from: '2025-12-31', to: '2025-12-31' })
  })

  it('addDays ay ve yıl sınırlarını aşıyor', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('daysBetween boş günleri de üretiyor', () => {
    expect(daysBetween({ from: '2026-08-30', to: '2026-09-02' })).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ])
  })

  it('yıl görünümü aya katlıyor', () => {
    expect(bucketOf('year', '2026-08-17')).toBe('2026-08')
    expect(bucketOf('month', '2026-08-17')).toBe('2026-08-17')
  })
})
