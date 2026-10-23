import { describe, expect, it } from 'vitest'
import {
  type RunRecord,
  bestOf,
  currentStreak,
  dailyRuns,
  dailySeed,
  dayEnd,
  dayKey,
  formatRemaining,
  isoWeekKey,
  rankOf,
  runsOfWeek,
  topRuns,
  weekEnd,
  weeklyHistory,
} from './scores'
import { translate } from './i18n'
import type { Translate } from './text'

function run(score: number, week: string, at = '2026-08-16T10:00:00.000Z'): RunRecord {
  return { mode: 'classic' as const, score, distance: score * 2, cols: 8, level: 1, at, week }
}

describe('ISO hafta anahtarı', () => {
  it('haftanın günleri aynı anahtarı verir', () => {
    // 2026-08-10 pazartesi … 2026-08-16 pazar
    const week = isoWeekKey(new Date(2026, 7, 10))
    for (let day = 10; day <= 16; day++) {
      expect(isoWeekKey(new Date(2026, 7, day))).toBe(week)
    }
    expect(isoWeekKey(new Date(2026, 7, 17))).not.toBe(week)
  })

  it('yıl sınırında haftayı bölmez - perşembesi hangi yıldaysa o yıla ait', () => {
    // 2025-12-29 pazartesi ile 2026-01-04 pazar aynı ISO haftası
    expect(isoWeekKey(new Date(2025, 11, 29))).toBe(isoWeekKey(new Date(2026, 0, 4)))
    expect(isoWeekKey(new Date(2026, 0, 1))).toBe('2026-W01')
  })

  it('biçim sıralanabilir: alfabetik sıra kronolojik sırayla aynı', () => {
    const keys = [
      isoWeekKey(new Date(2026, 0, 5)),
      isoWeekKey(new Date(2026, 5, 1)),
      isoWeekKey(new Date(2026, 11, 7)),
    ]
    expect([...keys].sort()).toEqual(keys)
  })
})

describe('hafta sonu', () => {
  it('bir sonraki pazartesi 00:00', () => {
    const end = weekEnd(new Date(2026, 7, 13, 15, 30)) // perşembe
    expect(end.getDay()).toBe(1)
    expect(end.getDate()).toBe(17)
    expect(end.getHours()).toBe(0)
  })

  it('pazartesi günü bir hafta sonrasını gösterir, aynı günü değil', () => {
    const monday = new Date(2026, 7, 10, 9, 0)
    expect(weekEnd(monday).getDate()).toBe(17)
    expect(weekEnd(monday).getTime()).toBeGreaterThan(monday.getTime())
  })

  it('kalan süre insan diliyle yazılır', () => {
    const tr: Translate = (key, vars) => translate('tr', key, vars)
    const en: Translate = (key, vars) => translate('en', key, vars)
    expect(formatRemaining(0, tr)).toBe('bitti')
    expect(formatRemaining(90 * 60_000, tr)).toBe('1 saat 30 dk')
    expect(formatRemaining(50 * 3_600_000, tr)).toBe('2 gün 2 saat')
    // Her dil kendi birimleriyle - İngilizcede Türkçe kelime kalmasın
    expect(formatRemaining(50 * 3_600_000, en)).toBe('2 d 2 h')
    expect(formatRemaining(90 * 60_000, en)).toBe('1 h 30 min')
  })
})

describe('günlük meydan okuma', () => {
  it('gün anahtarı yerel takvime göre üretilir', () => {
    expect(dayKey(new Date(2026, 7, 16, 23, 59))).toBe('2026-08-16')
    expect(dayKey(new Date(2026, 0, 3, 0, 1))).toBe('2026-01-03')
  })

  it('aynı gün aynı tohum, farklı gün farklı tohum', () => {
    expect(dailySeed('2026-08-16')).toBe(dailySeed('2026-08-16'))
    expect(dailySeed('2026-08-16')).not.toBe(dailySeed('2026-08-17'))
  })

  it('gün sonu yarın 00:00', () => {
    const end = dayEnd(new Date(2026, 7, 16, 18, 30))
    expect(end.getDate()).toBe(17)
    expect(end.getHours()).toBe(0)
  })

  it('günün koşuları moda göre süzülür', () => {
    const runs: RunRecord[] = [
      { ...run(10, '2026-W33'), daily: '2026-08-16' },
      { ...run(20, '2026-W33'), daily: '2026-08-16', mode: 'kingRun' },
      { ...run(30, '2026-W33'), daily: '2026-08-15' },
      run(40, '2026-W33'),
    ]

    expect(dailyRuns(runs, '2026-08-16')).toHaveLength(2)
    expect(dailyRuns(runs, '2026-08-16', 'classic')).toHaveLength(1)
    expect(bestOf(dailyRuns(runs, '2026-08-16', 'kingRun'))?.score).toBe(20)
  })
})

describe('arcade skor tablosu', () => {
  const runs: RunRecord[] = [
    { ...run(30, '2026-W33', '2026-08-16T10:00:00.000Z') },
    { ...run(90, '2026-W33', '2026-08-16T11:00:00.000Z') },
    { ...run(60, '2026-W33', '2026-08-16T12:00:00.000Z') },
    { ...run(99, '2026-W33', '2026-08-16T13:00:00.000Z'), mode: 'kingRun' },
  ]

  it('yalnızca kendi modunu, yüksekten alçağa sıralar', () => {
    expect(topRuns(runs, 'classic').map((r) => r.score)).toEqual([90, 60, 30])
    expect(topRuns(runs, 'kingRun').map((r) => r.score)).toEqual([99])
  })

  it('sınırı aşmaz', () => {
    expect(topRuns(runs, 'classic', 2)).toHaveLength(2)
  })

  it('sıra numarası kendi modu içinde hesaplanır', () => {
    expect(rankOf(runs, runs[1])).toBe(1) // 90 → klasik modun birincisi
    expect(rankOf(runs, runs[2])).toBe(2) // 60
    expect(rankOf(runs, runs[0])).toBe(3) // 30
    expect(rankOf(runs, runs[3])).toBe(1) // 99, tek kingRun koşusu
  })

  it('eşit skorlar birbirini geriye itmez', () => {
    const tied = [run(50, '2026-W33', '2026-08-16T10:00:00.000Z'), run(50, '2026-W33', '2026-08-16T11:00:00.000Z')]
    expect(rankOf(tied, tied[0])).toBe(1)
    expect(rankOf(tied, tied[1])).toBe(1)
  })
})

describe('gün serisi', () => {
  const now = new Date(2026, 7, 16, 12, 0)
  const daily = (day: string): RunRecord => ({ ...run(10, '2026-W33'), daily: day })

  it('üst üste oynanan günleri sayar', () => {
    const runs = ['2026-08-16', '2026-08-15', '2026-08-14'].map(daily)
    expect(currentStreak(runs, now)).toBe(3)
  })

  it('bugün oynanmadıysa seri dünden sayılır - gün bitmeden kırılmaz', () => {
    const runs = ['2026-08-15', '2026-08-14'].map(daily)
    expect(currentStreak(runs, now)).toBe(2)
  })

  it('atlanan gün seriyi keser', () => {
    const runs = ['2026-08-16', '2026-08-14', '2026-08-13'].map(daily)
    expect(currentStreak(runs, now)).toBe(1)
  })

  it('günlük oynanmadıysa seri yok', () => {
    expect(currentStreak([run(10, '2026-W33')], now)).toBe(0)
    expect(currentStreak([], now)).toBe(0)
  })
})

describe('rekor seçimi', () => {
  it('en yüksek skoru bulur, boş defterde null döner', () => {
    expect(bestOf([])).toBeNull()
    expect(bestOf([run(10, 'A'), run(42, 'A'), run(7, 'A')])?.score).toBe(42)
  })

  it('haftalık filtre yalnızca o haftanın koşularını alır', () => {
    const runs = [run(10, '2026-W33'), run(99, '2026-W32'), run(20, '2026-W33')]

    expect(runsOfWeek(runs, '2026-W33')).toHaveLength(2)
    expect(bestOf(runsOfWeek(runs, '2026-W33'))?.score).toBe(20)
  })

  it('haftalık geçmiş en yeniden eskiye sıralanır', () => {
    const history = weeklyHistory([
      run(10, '2026-W31'),
      run(30, '2026-W33'),
      run(20, '2026-W31'),
      run(5, '2026-W32'),
    ])

    expect(history.map((h) => h.week)).toEqual(['2026-W33', '2026-W32', '2026-W31'])
    expect(history[2]).toEqual({ week: '2026-W31', best: 20, games: 2 })
  })
})
