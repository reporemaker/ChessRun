import { describe, expect, it } from 'vitest'
import { SCORE_CAP } from '@shared/leaderboard'
import {
  type MhKind,
  type MhMode,
  type MhMove,
  type MhState,
  applyMove,
  botMove,
  isCheck,
  legalMoves,
  mhScore,
  newMaharajah,
  playerSide,
  positionKey,
} from './maharajah'

/** Boş tahtaya taş dizen yardımcı: { 'r,c': tür } */
function setup(mode: MhMode, pieces: Record<string, MhKind>, toMove: MhState['toMove']): MhState {
  const s = newMaharajah(mode)
  const board = s.board.map((row) => row.map(() => null as MhState['board'][0][0]))
  let amazon = null
  let id = 100
  for (const [at, t] of Object.entries(pieces)) {
    const [r, c] = at.split(',').map(Number)
    board[r][c] = { id: id++, t }
    if (t === 'A') amazon = { r, c }
  }
  const next: MhState = { ...s, board, amazon, toMove, moved: { k: true, qr: true, kr: true }, seen: {} }
  next.seen[positionKey(next)] = 1
  return next
}

const find = (s: MhState, fr: number, fc: number, r: number, c: number): MhMove => {
  const m = legalMoves(s, { r: fr, c: fc }).find((x) => x.r === r && x.c === c)
  if (!m) throw new Error(`yasal değil: ${fr},${fc} → ${r},${c}`)
  return m
}

/** Tekrarlanabilir rastgele sayı */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('Mihrace: başlangıç', () => {
  it('Şahin: oyuncu mihrace (altta), ordu üstte, ilk hamle oyuncunun', () => {
    const s = newMaharajah('falcon')
    expect(s.board[7][4]?.t).toBe('A')
    expect(s.board[0].map((p) => p?.t).join('')).toBe('rnbqkbnr')
    expect(s.board[1].every((p) => p?.t === 'p')).toBe(true)
    expect(s.toMove).toBe(playerSide('falcon'))
  })

  it('Avcı: oyuncu ordu (altta), mihrace üstte, ilk hamle oyuncunun', () => {
    const s = newMaharajah('hunter')
    expect(s.board[0][4]?.t).toBe('A')
    expect(s.board[7].map((p) => p?.t).join('')).toBe('rnbqkbnr')
    expect(s.toMove).toBe('army')
    // Piyon iki adım yukarı gidebilir
    expect(legalMoves(s, { r: 6, c: 0 }).map((m) => m.r)).toEqual([5, 4])
  })
})

describe('Mihrace: kurallar', () => {
  it('piyon son karede dönüşmez ve donar (iki yönde de)', () => {
    // Avcı: ordu altta, piyon yukarı gider
    let s = setup('hunter', { '1,3': 'p', '7,7': 'k', '4,0': 'A' }, 'army')
    s = applyMove(s, find(s, 1, 3, 0, 3))
    expect(s.board[0][3]?.t).toBe('p')
    s = { ...s, toMove: 'army' }
    expect(legalMoves(s, { r: 0, c: 3 })).toEqual([])
    // Şahin: ordu üstte, piyon aşağı gider
    let f = setup('falcon', { '6,2': 'p', '0,7': 'k', '3,0': 'A' }, 'army')
    f = applyMove(f, find(f, 6, 2, 7, 2))
    expect(f.board[7][2]?.t).toBe('p')
  })

  it('Şahin: şahı mat eden oyuncu kazanır', () => {
    // Ordu üstte: şah köşede (0,0). Mihrace (1,2)'ye gelince at gibi şah çeker,
    // kaçış kareleri de tehditte; şaha bitişik değil, yenemez
    const s = setup('falcon', { '0,0': 'k', '2,2': 'A' }, 'amazon')
    const m = find(s, 2, 2, 1, 2)
    const next = applyMove(s, m)
    expect(isCheck(next)).toBe(true)
    expect(next.result).toEqual({ outcome: 'win', reason: 'mate' })
  })

  it('Avcı: mihraceyi yiyen oyuncu kazanır', () => {
    const s = setup('hunter', { '7,4': 'k', '6,3': 'p', '5,4': 'A' }, 'army')
    const next = applyMove(s, find(s, 6, 3, 5, 4))
    expect(next.result).toEqual({ outcome: 'win', reason: 'captured' })
  })

  it('pat iki taraf için de beraberlik', () => {
    // Şahin: şah köşede, mihrace pat ettiriyor (şah çekmeden bütün kareleri tutuyor)
    const f = setup('falcon', { '0,0': 'k', '3,2': 'A' }, 'amazon')
    const stale = legalMoves(f).map((m) => applyMove(f, m)).find((n) => n.result?.reason === 'stalemate')
    expect(stale?.result).toEqual({ outcome: 'draw', reason: 'stalemate' })
    // Avcı: aynı durum oyuncunun başına gelirse de beraberlik
    const h = setup('hunter', { '7,0': 'k', '4,2': 'A' }, 'amazon')
    const stale2 = legalMoves(h).map((m) => applyMove(h, m)).find((n) => n.result?.reason === 'stalemate')
    expect(stale2?.result).toEqual({ outcome: 'draw', reason: 'stalemate' })
  })

  it('50 hamle kuralı: 100 sessiz yarım hamlede beraberlik', () => {
    let s = setup('hunter', { '7,0': 'k', '6,7': 'r', '0,4': 'A' }, 'army')
    s = { ...s, quiet: 99 }
    const next = applyMove(s, find(s, 6, 7, 5, 7))
    expect(next.result).toEqual({ outcome: 'draw', reason: 'fifty' })
  })

  it('taş yemek ya da piyon oynamak 50 hamle sayacını sıfırlar', () => {
    let s = setup('hunter', { '7,0': 'k', '6,3': 'p', '0,4': 'A' }, 'army')
    s = { ...s, quiet: 60 }
    expect(applyMove(s, find(s, 6, 3, 5, 3)).quiet).toBe(0)
  })

  it('üç kez tekrar beraberlik', () => {
    let s = setup('hunter', { '7,0': 'k', '7,7': 'r', '0,4': 'A' }, 'army')
    const shuffle: [number, number, number, number][] = [
      [7, 7, 6, 7],
      [0, 4, 0, 5],
      [6, 7, 7, 7],
      [0, 5, 0, 4],
    ]
    for (let round = 0; round < 2 && !s.result; round++)
      for (const [fr, fc, r, c] of shuffle) {
        if (s.result) break
        s = applyMove(s, find(s, fr, fc, r, c))
      }
    expect(s.result).toEqual({ outcome: 'draw', reason: 'repetition' })
  })

  it('rok: kale de yerine gelir; kale yendiyse o tarafa rok yok', () => {
    let s = setup('hunter', { '7,4': 'k', '7,7': 'r', '7,0': 'r', '0,1': 'A' }, 'army')
    s = { ...s, moved: { k: false, qr: false, kr: false } }
    const castle = legalMoves(s, { r: 7, c: 4 }).find((m) => m.castle === 'k')!
    const next = applyMove(s, castle)
    expect(next.board[7][6]?.t).toBe('k')
    expect(next.board[7][5]?.t).toBe('r')
    expect(next.moved.k).toBe(true)
    // Kale olmadan rok önerilmez
    const noRook = { ...s, board: s.board.map((row, r) => row.map((p, c) => (r === 7 && c === 0 ? null : p))) }
    expect(legalMoves(noRook, { r: 7, c: 4 }).some((m) => m.castle === 'q')).toBe(false)
  })

  it('ordu şahını mihracenin tehdidine bırakamaz, mihrace şahı yiyemez', () => {
    const s = setup('falcon', { '0,4': 'k', '2,4': 'A' }, 'army')
    // e7 (1,4) ve f7 vb. mihracenin tehdidinde: şah oraya gidemez
    expect(legalMoves(s, { r: 0, c: 4 }).some((m) => m.r === 1 && m.c === 4)).toBe(false)
    const a = setup('falcon', { '1,4': 'k', '3,4': 'A' }, 'amazon')
    expect(legalMoves(a).some((m) => m.r === 1 && m.c === 4)).toBe(false)
  })
})

describe('Mihrace: puan', () => {
  it('oyun sürerken puan yok', () => {
    expect(mhScore(newMaharajah('falcon'))).toBeNull()
  })

  it('Şahin kazancı: yenen malzeme + 50 + hız payı', () => {
    // Ordudan yalnızca şah kaldı: 39 malzeme yenmiş; 12 hamlede mat
    const s = setup('falcon', { '0,0': 'k', '2,2': 'A' }, 'amazon')
    const next = applyMove({ ...s, plies: 11 }, find(s, 2, 2, 1, 2))
    expect(next.plies).toBe(12)
    expect(mhScore(next)).toEqual({ material: 39, result: 50, speed: 38, base: 127, multiplier: 1, total: 127 })
  })

  it('Avcı kazancı: ayakta kalan malzeme sayılır, 50 hamleyi aşınca hız payı 0', () => {
    const s = setup('hunter', { '7,4': 'k', '6,3': 'p', '7,0': 'r', '5,4': 'A' }, 'army')
    const next = applyMove({ ...s, plies: 70 }, find(s, 6, 3, 5, 4))
    expect(mhScore(next)).toEqual({ material: 6, result: 50, speed: 0, base: 56, multiplier: 1, total: 56 })
  })

  it('pat 10; kayıpta hız payı yok', () => {
    const f = setup('falcon', { '0,0': 'k', '3,2': 'A' }, 'amazon')
    const stale = legalMoves(f).map((m) => applyMove(f, m)).find((n) => n.result?.reason === 'stalemate')!
    expect(mhScore(stale)).toEqual({ material: 39, result: 10, speed: 0, base: 49, multiplier: 1, total: 49 })
    const lost: MhState = { ...newMaharajah('falcon'), result: { outcome: 'loss', reason: 'captured' } }
    expect(mhScore(lost)).toEqual({ material: 0, result: 0, speed: 0, base: 0, multiplier: 1, total: 0 })
  })

  it('bedava puan yok: tekrar/50 hamle beraberliği sonuç vermez, Avcı kazanmadan taş sayılmaz', () => {
    const rep: MhState = { ...newMaharajah('hunter'), plies: 3, result: { outcome: 'draw', reason: 'repetition' } }
    expect(mhScore(rep)).toEqual({ material: 0, result: 0, speed: 0, base: 0, multiplier: 1, total: 0 })
    const fifty: MhState = { ...newMaharajah('falcon'), result: { outcome: 'draw', reason: 'fifty' } }
    expect(mhScore(fifty)?.result).toBe(0)
  })

  it('kılavuz kapalıyken puan ×2; eski durum (alan yok) kılavuz açık sayılır', () => {
    const s = setup('falcon', { '0,0': 'k', '2,2': 'A' }, 'amazon')
    const off = mhScore(applyMove({ ...s, plies: 11, guide: false }, find(s, 2, 2, 1, 2)))!
    expect(off).toEqual({ material: 39, result: 50, speed: 38, base: 127, multiplier: 2, total: 254 })
    const legacy = { ...s, plies: 11 } as MhState
    delete legacy.guide
    expect(mhScore(applyMove(legacy, find(s, 2, 2, 1, 2)))?.multiplier).toBe(1)
    // Kayıpta çarpan puanı değiştirmez: 0 × 2 = 0
    const lost: MhState = { ...newMaharajah('falcon', false), result: { outcome: 'loss', reason: 'captured' } }
    expect(mhScore(lost)?.total).toBe(0)
    expect(newMaharajah('hunter').guide).toBe(true)
    expect(newMaharajah('hunter', false).guide).toBe(false)
  })

  it('tek oyunun puanı sunucu tavanını aşamaz', () => {
    // En iyi durum: ordudan yalnızca şah kalmış, ilk hamlede mat, kılavuz kapalı
    const s = setup('falcon', { '0,0': 'k', '2,2': 'A' }, 'amazon')
    const best = mhScore(applyMove({ ...s, guide: false }, find(s, 2, 2, 1, 2)))!
    expect(best.total).toBe(SCORE_CAP.maharajah)
  })
})

describe('Mihrace: botlar', () => {
  for (const mode of ['falcon', 'hunter'] as const) {
    it(`${mode}: rastgele oyuncuya karşı bot yalnızca yasal hamle yapar, oyun düzgün biter`, () => {
      for (let seed = 1; seed <= 4; seed++) {
        const rand = seeded(seed)
        let s = newMaharajah(mode)
        for (let i = 0; i < 400 && !s.result; i++) {
          const legal = legalMoves(s)
          const m = s.toMove === playerSide(mode) ? legal[Math.floor(rand() * legal.length)] : botMove(s, rand)
          expect(m).toBeTruthy()
          expect(legal.some((x) => x.fr === m!.fr && x.fc === m!.fc && x.r === m!.r && x.c === m!.c)).toBe(true)
          s = applyMove(s, m!)
        }
        if (s.result) expect(['win', 'loss', 'draw']).toContain(s.result.outcome)
      }
    })
  }

  it('Şahin: ordu mihraceyi yiyebiliyorsa yer', () => {
    const s = setup('falcon', { '0,4': 'k', '1,3': 'p', '2,4': 'A' }, 'army')
    expect(botMove(s)).toMatchObject({ fr: 1, fc: 3, r: 2, c: 4 })
  })

  it('Avcı: mihrace tek hamlede mat varsa onu oynar', () => {
    const s = setup('hunter', { '7,0': 'k', '5,2': 'A' }, 'amazon')
    const m = botMove(s, () => 0.5)!
    expect(applyMove(s, m).result).toEqual({ outcome: 'loss', reason: 'mate' })
  })
})
