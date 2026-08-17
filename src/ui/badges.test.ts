import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../engine/types'
import { emptyTally, tallyEvents } from './badges'

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

  it('çağrılar arasında biriktiriyor — tur zinciri boyunca çağrılıyor', () => {
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
   * bilinirse anlaşılıyor — Game.tsx bunu ayrı bir ref'te taşıyor çünkü
   * commit'in kapanışındaki state bir tur zincirinde bayatlıyor.
   */
  it('düşüşü yalnızca önceki tip ağır taşsa işaretliyor', () => {
    const toPawn: GameEvent[] = [{ kind: 'transform', to: 'p' }]

    expect(tallyEvents(emptyTally(), toPawn, 'q').downgraded).toBe(true)
    expect(tallyEvents(emptyTally(), toPawn, 'r').downgraded).toBe(true)
    // Attan piyona geçmek düşüş değil — at zaten hafif taş
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
    const after = tallyEvents(
      before,
      [{ kind: 'scroll' }, { kind: 'capture', piece: 'p', points: 1 }, { kind: 'gameover' }],
      'n',
    )
    expect(after).toEqual(before)
  })

  it('girdiyi değiştirmiyor — yeni nesne döndürüyor', () => {
    const before = emptyTally()
    const after = tallyEvents(before, [{ kind: 'kingBonus', points: 50, lives: 3 }], 'n')
    expect(before.kings).toBe(0)
    expect(after).not.toBe(before)
  })
})
