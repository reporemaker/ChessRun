import { describe, expect, it } from 'vitest'
import { addDays, bucketOf, daysBetween, previousOf, rangeOf } from './period'
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
  ...over,
})

const run = (over: Partial<RunRow> = {}): RunRow => ({
  session_id: 's1',
  mode: 'classic',
  daily: 0,
  score: 10,
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
    const t = computeTotals('d', [visit({ session_id: 's1' })], [], ['s1', 's2', 's3'])
    expect(t.visitors).toBe(1)
    expect(t.sessions).toBe(3)
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
    expect(Number.isNaN(empty.avgDurationMs)).toBe(false)
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
