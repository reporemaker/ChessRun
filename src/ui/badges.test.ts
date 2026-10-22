import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../engine/types'
import { emptyTally, leagueAwards, tallyEvents, tallyStep } from './badges'

/**
 * `tallyEvents` artık canlı yolda: `Game.tsx`'in `commit()` fonksiyonu her
 * durum geçişinde çağırıyor. Rozet arayüzü henüz yok ama sayaçlar koşu
 * defterine yazılıyor, yani buradaki bir hata sessizce yanlış veri üretir.
 */
describe('tallyEvents', () => {
  it('boş sayaç her şeyi sıfırdan başlatıyor', () => {
    const tally = emptyTally()
    expect(tally.kings).toBe(0)
    expect(tally.bestStreak).toBe(0)
    expect(tally.mated).toBe(false)
    expect(tally.squadIntact).toBe(true)
  })

  it('çağrılar arasında biriktiriyor - tur zinciri boyunca çağrılıyor', () => {
    let tally = emptyTally()
    tally = tallyEvents(tally, [{ kind: 'kingBonus', points: 50, lives: 3 }], 'n')
    tally = tallyEvents(tally, [{ kind: 'kingBonus', points: 50, lives: 3 }], 'n')
    expect(tally.kings).toBe(2)
  })

  it('şah zincirinin EN UZUNUNU tutuyor, sonuncusunu değil', () => {
    let tally = emptyTally()
    tally = tallyEvents(tally, [{ kind: 'check', points: 10, streak: 4 }], 'q')
    tally = tallyEvents(tally, [{ kind: 'check', points: 10, streak: 1 }], 'q')
    expect(tally.bestStreak).toBe(4)
  })

  /**
   * `before` parametresinin var olma sebebi: `transform` olayı yalnızca
   * HEDEF taşı taşıyor. "Vezirken piyona düştüm" ancak önceki tip
   * bilinirse anlaşılıyor - Game.tsx bunu ayrı bir ref'te taşıyor çünkü
   * commit'in kapanışındaki state bir tur zincirinde bayatlıyor.
   */
  it('düşüşü yalnızca önceki tip ağır taşsa işaretliyor', () => {
    const toPawn: GameEvent[] = [{ kind: 'transform', to: 'p' }]

    expect(tallyEvents(emptyTally(), toPawn, 'q').downgraded).toBe(true)
    expect(tallyEvents(emptyTally(), toPawn, 'r').downgraded).toBe(true)
    // Attan piyona geçmek düşüş değil - at zaten hafif taş
    expect(tallyEvents(emptyTally(), toPawn, 'n').downgraded).toBe(false)
  })

  it('her dönüşüm transformed işaretliyor, yönü ne olursa olsun', () => {
    const up: GameEvent[] = [{ kind: 'transform', to: 'q' }]
    const tally = tallyEvents(emptyTally(), up, 'p')
    expect(tally.transformed).toBe(true)
    expect(tally.downgraded).toBe(false)
  })

  it('mat ve sıkışma hakkını sayıyor', () => {
    let tally = emptyTally()
    tally = tallyEvents(tally, [{ kind: 'stuck', points: 5, left: 2 }], 'n')
    tally = tallyEvents(tally, [{ kind: 'stuck', points: 5, left: 1 }], 'n')
    tally = tallyEvents(tally, [{ kind: 'mate', points: 80 }], 'n')
    expect(tally.stuckUsed).toBe(2)
    expect(tally.mated).toBe(true)
  })

  it('Üçlü: taş kaybı kadro bütünlüğünü kalıcı olarak bozuyor', () => {
    let tally = emptyTally()
    expect(tally.squadIntact).toBe(true)
    tally = tallyEvents(tally, [{ kind: 'pieceLost', piece: 'n', reason: 'fellOff', left: 2 }], 'n')
    expect(tally.squadIntact).toBe(false)
    // Kaybedilen taş geri gelse bile bütünlük geri gelmiyor
    tally = tallyEvents(tally, [{ kind: 'squadGain', piece: 'r', size: 3 }], 'n')
    expect(tally.squadIntact).toBe(false)
  })

  it('ilgisiz olaylar hiçbir sayacı kıpırdatmıyor', () => {
    const before = emptyTally()
    // scroll kadro bütünken mesafeyi yazar (0 → 0), capture artık sayılıyor;
    // gerçekten ilgisiz olanlar: boardRefresh, squadGain, threat, gameover
    const after = tallyEvents(
      before,
      [
        { kind: 'boardRefresh' },
        { kind: 'squadGain', piece: 'r', size: 3 },
        { kind: 'threat', points: 2, count: 1 },
        { kind: 'gameover' },
      ],
      'n',
    )
    expect(after).toEqual(before)
  })

  /* --- Figür rozet sayaçları (17 Ağustos 2026) --- */

  it('yenen taşları tipe göre sayıyor', () => {
    let tally = emptyTally()
    tally = tallyEvents(tally, [{ kind: 'capture', piece: 'r', points: 5 }], 'n')
    tally = tallyEvents(tally, [{ kind: 'capture', piece: 'r', points: 5 }], 'r')
    tally = tallyEvents(tally, [{ kind: 'capture', piece: 'b', points: 3 }], 'r')
    expect(tally.captured.r).toBe(2)
    expect(tally.captured.b).toBe(1)
    expect(tally.captured.n).toBe(0)
  })

  it('vezirle yeme yalnızca hamle öncesi tip vezirse sayılıyor', () => {
    let tally = emptyTally()
    tally = tallyEvents(tally, [{ kind: 'capture', piece: 'n', points: 3 }], 'q')
    tally = tallyEvents(tally, [{ kind: 'capture', piece: 'n', points: 3 }], 'r')
    expect(tally.queenCaptures).toBe(1)
  })

  it('harakiri: vezirken piyona düşme - kaleyken değil', () => {
    const toPawn: GameEvent[] = [{ kind: 'transform', to: 'p' }]
    expect(tallyEvents(emptyTally(), toPawn, 'q').harakiri).toBe(1)
    expect(tallyEvents(emptyTally(), toPawn, 'r').harakiri).toBe(0)
    // ama Düşüş ikisinde de işaretleniyor
    expect(tallyEvents(emptyTally(), toPawn, 'r').downgraded).toBe(true)
  })

  it('adımlar hamle öncesi taş tipine yazılıyor', () => {
    let tally = emptyTally()
    tally = tallyStep(tally, 'p')
    tally = tallyStep(tally, 'p')
    tally = tallyStep(tally, 'q')
    expect(tally.steps.p).toBe(2)
    expect(tally.steps.q).toBe(1)
    expect(tally.steps.n).toBe(0)
  })

  it('kadro bütünken mesafe kaymada güncelleniyor, kayıptan sonra donuyor', () => {
    let tally = emptyTally()
    tally = tallyEvents(tally, [{ kind: 'scroll' }], 'q', 4)
    expect(tally.noLossDistance).toBe(4)
    tally = tallyEvents(tally, [{ kind: 'pieceLost', piece: 'b', reason: 'captured', left: 2 }], 'q', 5)
    tally = tallyEvents(tally, [{ kind: 'scroll' }], 'q', 9)
    expect(tally.noLossDistance).toBe(4) // dondu
    expect(tally.squadIntact).toBe(false)
  })

  it('Av\'da can kaybı da bütünlüğü bozuyor (tek taş = kadro)', () => {
    const tally = tallyEvents(emptyTally(), [{ kind: 'lifeLost', reason: 'captured' }], 'n', 3)
    expect(tally.squadIntact).toBe(false)
  })

  it('girdiyi değiştirmiyor - yeni nesne döndürüyor', () => {
    const before = emptyTally()
    const after = tallyEvents(before, [{ kind: 'kingBonus', points: 50, lives: 3 }], 'n')
    expect(before.kings).toBe(0)
    expect(after).not.toBe(before)
  })
})

describe('leagueAwards', () => {
  it('birincilik yoksa rozet yok', () => {
    expect(leagueAwards([])).toEqual([])
  })

  it('bir birincilik → weekFirst', () => {
    expect(leagueAwards([{ week: '2026-W33', mode: 'classic' }])).toEqual(['weekFirst'])
  })

  it('aynı hafta üç lig → weekKing', () => {
    const w = '2026-W33'
    expect(
      leagueAwards([
        { week: w, mode: 'classic' },
        { week: w, mode: 'kingRun' },
        { week: w, mode: 'trio' },
      ]),
    ).toEqual(['weekFirst', 'weekKing'])
  })

  it('aynı ligde 4 ardışık hafta → emperor; araya boşluk girerse değil', () => {
    const run = ['2026-W31', '2026-W32', '2026-W33', '2026-W34'].map((week) => ({ week, mode: 'trio' as const }))
    expect(leagueAwards(run)).toContain('emperor')
    const gap = ['2026-W30', '2026-W31', '2026-W33', '2026-W34'].map((week) => ({ week, mode: 'trio' as const }))
    expect(leagueAwards(gap)).not.toContain('emperor')
    // farklı liglerdeki ardışıklık sayılmaz
    const mixed = [
      { week: '2026-W31', mode: 'trio' as const },
      { week: '2026-W32', mode: 'classic' as const },
      { week: '2026-W33', mode: 'trio' as const },
      { week: '2026-W34', mode: 'trio' as const },
    ]
    expect(leagueAwards(mixed)).not.toContain('emperor')
  })

  it('yıl sınırında ardışıklık takvimle çözülüyor', () => {
    const run = ['2026-W51', '2026-W52', '2026-W53', '2027-W01'].map((week) => ({ week, mode: 'classic' as const }))
    expect(leagueAwards(run)).toContain('emperor')
  })

  it('ortak lig: birincilik weekFirst, 4 ardışık hafta emperor, weekKing yok', () => {
    expect(leagueAwards([{ week: '2026-W43', mode: 'all' }])).toEqual(['weekFirst'])
    const run = ['2026-W43', '2026-W44', '2026-W45', '2026-W46'].map((week) => ({ week, mode: 'all' as const }))
    expect(leagueAwards(run)).toEqual(['weekFirst', 'emperor'])
    // geçiş haftasının iki yanı ayrı lig: eski oyun birincilikleri ortak ligle zincirlenmez
    const across = [
      { week: '2026-W40', mode: 'classic' as const },
      { week: '2026-W41', mode: 'classic' as const },
      { week: '2026-W42', mode: 'classic' as const },
      { week: '2026-W43', mode: 'all' as const },
    ]
    expect(leagueAwards(across)).not.toContain('emperor')
  })
})
