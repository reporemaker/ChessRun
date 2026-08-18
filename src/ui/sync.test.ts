import { describe, expect, it } from 'vitest'
import { type EarnedBadges, mergeBadges } from './badges'
import { emptyLifetime, mergeLifetime } from './lifetime'
import { type RunRecord, mergeRuns } from './scores'

describe('profil birleştirme - rozetler', () => {
  it('rozet başına en yüksek kademe, aynı kademede en erken tarih', () => {
    const a: EarnedBadges = { rook: { tier: 1, at: '2026-08-10' }, hunter: { tier: 0, at: '2026-08-12' } }
    const b: EarnedBadges = { rook: { tier: 0, at: '2026-08-01' }, hunter: { tier: 0, at: '2026-08-05' }, knight: { tier: 2, at: '2026-08-15' } }
    const m = mergeBadges(a, b)
    expect(m.rook).toEqual({ tier: 1, at: '2026-08-10' })
    expect(m.hunter).toEqual({ tier: 0, at: '2026-08-05' })
    expect(m.knight).toEqual({ tier: 2, at: '2026-08-15' })
  })
})

describe('profil birleştirme - sayaçlar', () => {
  it('alan alan en büyük, since en erken, seri son güne göre', () => {
    const a = emptyLifetime(new Date('2026-08-10'))
    a.runs = 10
    a.total.kings = 4
    a.total.captured.q = 2
    a.streak = { current: 3, best: 3, lastDay: '2026-08-18' }
    a.best.kingDistance = 400
    const b = emptyLifetime(new Date('2026-08-01'))
    b.runs = 6
    b.total.kings = 7
    b.total.captured.q = 1
    b.streak = { current: 1, best: 5, lastDay: '2026-08-15' }
    b.best.kingDistance = 250
    const m = mergeLifetime(a, b)
    expect(m.since).toBe('2026-08-01')
    expect(m.runs).toBe(10)
    expect(m.total.kings).toBe(7)
    expect(m.total.captured.q).toBe(2)
    expect(m.streak).toEqual({ current: 3, best: 5, lastDay: '2026-08-18' })
    expect(m.best.kingDistance).toBe(400)
  })
})

describe('profil birleştirme - defter', () => {
  it('at ile tekil, zamana göre sıralı', () => {
    const run = (at: string, score: number): RunRecord => ({ mode: 'classic', score, distance: 1, cols: 6, level: 1, at, week: '2026-W34' })
    const a = [run('2026-08-18T10:00:00Z', 10), run('2026-08-18T12:00:00Z', 30)]
    const b = [run('2026-08-18T11:00:00Z', 20), run('2026-08-18T12:00:00Z', 30)]
    const m = mergeRuns(a, b)
    expect(m.map((r) => r.score)).toEqual([10, 20, 30])
  })
})
