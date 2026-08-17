import { beforeEach, describe, expect, it } from 'vitest'
import { emptyTally, tallyEvents, tallyStep } from './badges'
import { addRun, emptyLifetime, readLifetime, recordLifetime } from './lifetime'

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
