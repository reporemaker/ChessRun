import { beforeEach, describe, expect, it } from 'vitest'
import { emptyTally, tallyEvents, tallyStep } from './badges'
import { addRun, emptyLifetime, lifetimeStreak, prevDayKey, readLifetime, recordLifetime } from './lifetime'

function installStore() {
  const map = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    },
  })
  return map
}

beforeEach(() => {
  installStore()
})

describe('addRun (saf)', () => {
  it('toplamları biriktiriyor', () => {
    let tally = emptyTally()
    tally = tallyEvents(tally, [{ kind: 'capture', piece: 'r', points: 5 }], 'n')
    tally = tallyEvents(tally, [{ kind: 'kingBonus', points: 50, lives: 3 }], 'n')
    tally = tallyStep(tally, 'p')

    let life = emptyLifetime()
    life = addRun(life, tally, { mode: 'classic', distance: 12 })
    life = addRun(life, tally, { mode: 'classic', distance: 8 })
    expect(life.runs).toBe(2)
    expect(life.runsByMode.classic).toBe(2)
    expect(life.total.captured.r).toBe(2)
    expect(life.total.kings).toBe(2)
    expect(life.total.steps.p).toBe(2)
    expect(life.total.distance).toBe(20)
  })

  /**
   * Tek-koşu "en iyi"ler moda bağlı: piyon adımı yalnızca Av'da, vezirle
   * yeme yalnızca Üçlü'de, kral mesafesi yalnızca Kaçış'ta anlamlı.
   */
  it('en iyileri yalnızca ilgili modda güncelliyor', () => {
    let tally = emptyTally()
    for (let i = 0; i < 7; i++) tally = tallyStep(tally, 'p')
    tally = tallyEvents(tally, [{ kind: 'capture', piece: 'n', points: 3 }], 'q')

    let life = emptyLifetime()
    life = addRun(life, tally, { mode: 'trio', distance: 30 })
    expect(life.best.pawnSteps).toBe(0) // Üçlü'de piyon adımı sayılmaz
    expect(life.best.queenCaptures).toBe(1)
    expect(life.best.kingDistance).toBe(0)

    life = addRun(life, tally, { mode: 'classic', distance: 30 })
    expect(life.best.pawnSteps).toBe(7)

    life = addRun(life, emptyTally(), { mode: 'kingRun', distance: 41 })
    expect(life.best.kingDistance).toBe(41)
    life = addRun(life, emptyTally(), { mode: 'kingRun', distance: 20 })
    expect(life.best.kingDistance).toBe(41) // düşmüyor
  })

  it('girdiyi değiştirmiyor', () => {
    const life = emptyLifetime()
    addRun(life, emptyTally(), { mode: 'classic', distance: 5 })
    expect(life.runs).toBe(0)
  })
})

describe('günlük seri (defter sınırından bağımsız)', () => {
  it('ardışık günler +1, aynı gün değişmez, kopunca 1', () => {
    let life = emptyLifetime()
    life = addRun(life, emptyTally(), { mode: 'classic', distance: 1, daily: '2026-08-10' })
    life = addRun(life, emptyTally(), { mode: 'classic', distance: 1, daily: '2026-08-10' }) // aynı gün
    life = addRun(life, emptyTally(), { mode: 'kingRun', distance: 1, daily: '2026-08-11' })
    life = addRun(life, emptyTally(), { mode: 'trio', distance: 1 }) // serbest koşu seriyi etkilemez
    life = addRun(life, emptyTally(), { mode: 'classic', distance: 1, daily: '2026-08-12' })
    expect(life.streak.current).toBe(3)
    expect(life.streak.best).toBe(3)
    life = addRun(life, emptyTally(), { mode: 'classic', distance: 1, daily: '2026-08-15' }) // 13-14 boş
    expect(life.streak.current).toBe(1)
    expect(life.streak.best).toBe(3)
  })

  it('ay ve yıl sınırında da ardışık', () => {
    expect(prevDayKey('2026-03-01')).toBe('2026-02-28')
    expect(prevDayKey('2026-01-01')).toBe('2025-12-31')
    let life = emptyLifetime()
    life = addRun(life, emptyTally(), { mode: 'classic', distance: 1, daily: '2025-12-31' })
    life = addRun(life, emptyTally(), { mode: 'classic', distance: 1, daily: '2026-01-01' })
    expect(life.streak.current).toBe(2)
  })

  /**
   * 300 koşu sınırı: günde 30 oyun oynayan biri için 30 günlük seri defterden
   * asla okunamaz. Ömür boyu depo koşu koşu ilerlediği için 30'u görüyor.
   */
  it('30 gün seri 900 koşuda da 30 okunuyor', () => {
    let life = emptyLifetime()
    for (let d = 1; d <= 30; d++) {
      const day = `2026-07-${String(d).padStart(2, '0')}`
      life = addRun(life, emptyTally(), { mode: 'classic', distance: 1, daily: day })
      for (let i = 0; i < 29; i++) life = addRun(life, emptyTally(), { mode: 'classic', distance: 1 })
    }
    expect(life.runs).toBe(900)
    expect(life.streak.current).toBe(30)
    expect(lifetimeStreak(life, '2026-07-30')).toBe(30)
    expect(lifetimeStreak(life, '2026-07-31')).toBe(30) // dün oynadı, seri sürüyor
    expect(lifetimeStreak(life, '2026-08-01')).toBe(0) // koptu
  })
})

describe('recordLifetime (depo)', () => {
  it('okuyup ekleyip yazıyor; sonraki okuma birikmiş değeri görüyor', () => {
    recordLifetime(emptyTally(), { mode: 'classic', distance: 3 })
    recordLifetime(emptyTally(), { mode: 'trio', distance: 4 })
    const life = readLifetime()
    expect(life.runs).toBe(2)
    expect(life.total.distance).toBe(7)
    expect(life.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('eski/eksik kayıt bozulmuyor — bilinmeyen alanlar sıfırla dolar', () => {
    localStorage.setItem('chessrun:lifetime', JSON.stringify({ runs: 3, total: { kings: 1 } }))
    const life = readLifetime()
    expect(life.runs).toBe(3)
    expect(life.total.kings).toBe(1)
    expect(life.total.captured.r).toBe(0)
    expect(life.best.pawnSteps).toBe(0)
  })

  it('bozuk JSON → boş depo, çökmez', () => {
    localStorage.setItem('chessrun:lifetime', '{{{')
    expect(readLifetime().runs).toBe(0)
  })
})
