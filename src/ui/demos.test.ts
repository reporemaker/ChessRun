import { describe, expect, it } from 'vitest'
import {
  type MhGrid,
  type MhKind,
  type MhState,
  applyMove,
  isCheck,
  kingPos,
  legalMoves,
  newMaharajah,
} from '../engine/maharajah'
import { DEMOS, type Demo, type Frame, parseCell } from './demos'

/**
 * Mihrace dersleri gerçek tahtanın 5×5 penceresi (Demo.mh). Her ders
 * motorda yeniden kurulup oyun mantığına karşı denetleniyor - ders
 * değişirse "olmamış hamle" ya da "görünmeyen şah" sessizce giremesin:
 *
 *   - her adım ya öncekiyle aynı pozisyon ya da ondan tek YASAL hamle,
 *   - şah çekilmiş her adımda şah parlıyor (glow),
 *   - ilk adımda şah yok, oyun bittikten sonra adım yok.
 */
const MH = Object.values(DEMOS).filter((demo): demo is Demo & { mh: { r0: number; c0: number } } => demo.mh != null)

/** Pencereyi 8×8'e yerleştirir; oyuncu beyaz (Şahin'de mihrace, Avcı'da ordu) */
function stateOf(demo: Demo & { mh: { r0: number; c0: number } }, frame: Frame, toMove: MhState['toMove']): MhState {
  const falcon = demo.frames.some((f) => f.rows.some((row) => row.includes('wA')))
  const base = newMaharajah(falcon ? 'falcon' : 'hunter')
  const board: MhGrid = base.board.map((row) => row.map(() => null))
  let amazon = null
  let id = 1
  frame.rows.forEach((row, r) =>
    row.forEach((token, c) => {
      const cell = parseCell(token)
      if (!cell) return
      const at = { r: r + demo.mh.r0, c: c + demo.mh.c0 }
      board[at.r][at.c] = { id: id++, t: cell.type as MhKind }
      if (cell.type === 'A') amazon = at
    }),
  )
  return { ...base, board, amazon, toMove, moved: { k: true, qr: true, kr: true }, seen: {} }
}

const key = (s: MhState) => s.board.map((row) => row.map((p) => p?.t ?? '.').join('')).join('/')

describe('Mihrace dersleri: oyun mantığı', () => {
  it('altı ders var, hepsi 5×5', () => {
    expect(MH.map((d) => d.id)).toEqual(['mhMove', 'mhFalcon', 'mhHunter', 'mhRisk', 'mhStalemate', 'mhPawn'])
    for (const demo of MH) for (const f of demo.frames) expect(f.rows.map((r) => r.length)).toEqual([5, 5, 5, 5, 5])
  })

  for (const demo of MH) {
    it(`${demo.id}: her adım tek yasal hamle, şah görünür, bitişten sonra adım yok`, () => {
      expect(isCheck(stateOf(demo, demo.frames[0], 'amazon')), 'ilk adımda şah').toBe(false)
      demo.frames.forEach((frame, i) => {
        const s = stateOf(demo, frame, 'amazon')
        if (isCheck(s)) {
          const k = kingPos(s.board)!
          const glow = frame.marks?.some((m) => m.kind === 'glow' && m.r === k.r - demo.mh.r0 && m.c === k.c - demo.mh.c0)
          expect(glow, `adım ${i + 1}: şah var ama parlamıyor`).toBe(true)
        }
        if (i === 0) return
        const prevFrame = demo.frames[i - 1]
        if (key(stateOf(demo, prevFrame, 'amazon')) === key(s)) return
        // Hamleyi hangi taraf yapmış olursa olsun tek yasal hamleyle gelinmeli
        const reached = (['amazon', 'army'] as const).some((side) => {
          const prev = stateOf(demo, prevFrame, side)
          return legalMoves(prev).some((m) => {
            const next = applyMove(prev, m)
            if (key(next) !== key(s)) return false
            // Bu hamleyle oyun bittiyse ders burada bitmeli
            if (next.result) expect(i, `adım ${i + 1}: oyun bitti ama ders sürüyor`).toBe(demo.frames.length - 1)
            return true
          })
        })
        expect(reached, `adım ${i + 1}: önceki adımdan tek yasal hamleyle gelinmiyor`).toBe(true)
      })
    })
  }

  it('bitiş adımları gerçekten bitiş: Şahin mat, Avcı yeme, Pat pat', () => {
    const end = (id: string) => {
      const demo = MH.find((d) => d.id === id)!
      const [a, b] = demo.frames.slice(-2)
      for (const side of ['amazon', 'army'] as const) {
        const prev = stateOf(demo, a, side)
        for (const m of legalMoves(prev)) {
          const next = applyMove(prev, m)
          if (key(next) === key(stateOf(demo, b, side))) return next.result
        }
      }
      return null
    }
    expect(end('mhFalcon')).toEqual({ outcome: 'win', reason: 'mate' })
    expect(end('mhHunter')).toEqual({ outcome: 'win', reason: 'captured' })
    expect(end('mhStalemate')).toEqual({ outcome: 'draw', reason: 'stalemate' })
  })
})
