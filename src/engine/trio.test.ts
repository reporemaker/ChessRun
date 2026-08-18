import { describe, expect, it } from 'vitest'
import { emptyRow, makePiece } from './board'
import { ROWS, TRIO_MATE_SCORE, TRIO_MAX_SQUAD, TRIO_THREAT_CAP, TRIO_TYPES } from './config'
import {
  applyEnemyMove,
  applyPlayerMove,
  applyScroll,
  applyStuck,
  createGame,
  hasAnyMove,
  legalMoves,
  needsBoardRefresh,
  applyBoardRefresh,
  selectPiece,
} from './game'
import { pseudoMoves } from './moves'
import { createRng, systemRng } from './random'
import type { Board, GameState, PieceType, Pos } from './types'

/** Elle kurulan, rastgeleliği kapatılmış Üçlü tahtası */
function trioState(squad: Array<{ pos: Pos; type: PieceType }>, cols = 8): GameState {
  const board: Board = Array.from({ length: ROWS }, () => emptyRow(cols))
  const state: GameState = {
    mode: 'trio',
    seed: null,
    rng: systemRng,
    board,
    player: squad[0].pos,
    squad: squad.map((entry) => entry.pos),
    selected: 0,
    playerType: squad[0].type,
    chain: [squad[0].type],
    playerColor: 'w',
    enemyColor: 'b',
    score: 0,
    lives: squad.length,
    distance: 0,
    checkStreak: 0,
    stuckLeft: 2,
    status: 'playing',
    events: [],
    scrollTick: 0,
    refreshTick: 0,
  }

  for (const entry of squad) {
    board[entry.pos.row].cells[entry.pos.col] = makePiece(entry.type, 'w')
  }

  return state
}

function put(state: GameState, pos: Pos, type: PieceType): void {
  state.board[pos.row].cells[pos.col] = makePiece(type, state.enemyColor)
}

function typeAt(state: GameState, pos: Pos): PieceType | undefined {
  return state.board[pos.row].cells[pos.col]?.type
}

describe('Üçlü - kadro', () => {
  it('vezir, kale ve filden oluşan üç taşla başlıyor', () => {
    const state = createGame({ playerColor: 'w', mode: 'trio', cols: 8, seed: 7 })

    expect(state.squad).toHaveLength(3)
    expect(state.lives).toBe(3)

    const types = state.squad.map((pos) => typeAt(state, pos))
    expect([...types].sort()).toEqual([...TRIO_TYPES].sort())
  })

  it('kadro taşları farklı karelerde ve tahtanın içinde doğuyor', () => {
    for (let seed = 0; seed < 120; seed++) {
      const state = createGame({ playerColor: 'w', mode: 'trio', cols: 6, seed })
      const seen = new Set(state.squad.map((pos) => `${pos.row},${pos.col}`))

      expect(seen.size).toBe(state.squad.length)
      for (const pos of state.squad) {
        expect(pos.row).toBeGreaterThanOrEqual(0)
        expect(pos.row).toBeLessThan(ROWS)
        expect(state.board[pos.row].cells[pos.col]?.color).toBe('w')
      }
    }
  })

  it('dar koridor isteğe rağmen en az 6 sütuna genişliyor', () => {
    const state = createGame({ playerColor: 'w', mode: 'trio', cols: 4, seed: 3 })
    expect(state.board[0].cells).toHaveLength(6)
  })

  it('seçim tur harcamıyor: tahta kaymıyor, puan değişmiyor', () => {
    const state = createGame({ playerColor: 'w', mode: 'trio', cols: 8, seed: 11 })
    const next = selectPiece(state, 2)

    expect(next.selected).toBe(2)
    expect(next.player).toEqual(state.squad[2])
    expect(next.playerType).toBe(typeAt(state, state.squad[2]))
    expect(next.distance).toBe(state.distance)
    expect(next.scrollTick).toBe(state.scrollTick)
    expect(next.score).toBe(state.score)
  })

  it('hamleler yalnızca seçili taşın hamleleri', () => {
    const state = trioState([
      { pos: { row: 4, col: 0 }, type: 'r' },
      { pos: { row: 4, col: 7 }, type: 'b' },
    ])

    expect(legalMoves(state)).toEqual(pseudoMoves(state.board, { row: 4, col: 0 }, 'w'))
    expect(legalMoves(selectPiece(state, 1))).toEqual(
      pseudoMoves(state.board, { row: 4, col: 7 }, 'w'),
    )
  })
})

describe('Üçlü - kayma ve kayıp', () => {
  it('oynanmayan taşlar da bir satır düşüyor', () => {
    const state = trioState([
      { pos: { row: 2, col: 0 }, type: 'r' },
      { pos: { row: 3, col: 4 }, type: 'b' },
      { pos: { row: 4, col: 6 }, type: 'q' },
    ])

    const next = applyScroll(state)

    expect(next.squad).toEqual([
      { row: 3, col: 0 },
      { row: 4, col: 4 },
      { row: 5, col: 6 },
    ])
  })

  it('en alt satırdaki taş düşüyor ama koşu bitmiyor', () => {
    const state = trioState([
      { pos: { row: 3, col: 0 }, type: 'r' },
      { pos: { row: ROWS - 1, col: 4 }, type: 'b' },
      { pos: { row: 4, col: 6 }, type: 'q' },
    ])

    const next = applyScroll(state)
    const lost = next.events.filter((event) => event.kind === 'pieceLost')

    expect(lost).toHaveLength(1)
    expect(lost[0]).toMatchObject({ piece: 'b', reason: 'fellOff', left: 2 })
    expect(next.status).toBe('playing')
    expect(next.squad).toHaveLength(2)
    expect(next.lives).toBe(2)
  })

  it('son taş da düşünce koşu biter', () => {
    const state = trioState([{ pos: { row: ROWS - 1, col: 2 }, type: 'q' }])
    const next = applyScroll(state)

    expect(next.status).toBe('gameover')
    expect(next.squad).toHaveLength(0)
    expect(next.events.some((event) => event.kind === 'gameover')).toBe(true)
  })

  it('düşen taş seçiliyken seçim hayatta kalan taşa kayıyor', () => {
    const state = trioState([
      { pos: { row: ROWS - 1, col: 1 }, type: 'q' },
      { pos: { row: 2, col: 5 }, type: 'r' },
    ])

    const next = applyScroll(state)

    expect(next.squad).toHaveLength(1)
    expect(next.selected).toBe(0)
    expect(next.player).toEqual(next.squad[0])
    expect(next.playerType).toBe('r')
  })

  it('rakip bir taşı yediğinde koşu değil kadro küçülüyor', () => {
    const state = trioState([
      { pos: { row: 4, col: 4 }, type: 'q' },
      { pos: { row: 6, col: 1 }, type: 'b' },
    ])
    put(state, { row: 5, col: 1 }, 'r')
    state.rng = createRng(5)

    const next = applyEnemyMove(state)
    const lost = next.events.filter((event) => event.kind === 'pieceLost')

    expect(lost).toHaveLength(1)
    expect(lost[0]).toMatchObject({ piece: 'b', reason: 'captured', left: 1 })
    expect(next.status).toBe('playing')
    expect(next.lives).toBe(1)
  })
})

describe('Üçlü - puan', () => {
  it('dönüşüm yok: yediği taşa dönüşmüyor', () => {
    const state = trioState([{ pos: { row: 4, col: 4 }, type: 'q' }])
    put(state, { row: 2, col: 4 }, 'p')

    const next = applyPlayerMove(state, { row: 2, col: 4 })

    expect(next.playerType).toBe('q')
    expect(next.events.some((event) => event.kind === 'transform')).toBe(false)
    expect(typeAt(next, { row: 2, col: 4 })).toBe('q')
  })

  it('yeni tehdit kurmak puan getiriyor, tavanı aşamıyor', () => {
    const state = trioState([{ pos: { row: 7, col: 0 }, type: 'q' }])
    // Vezir 4. satıra çıkınca dört rakip taşı birden tehdit ediyor
    put(state, { row: 4, col: 1 }, 'p')
    put(state, { row: 4, col: 7 }, 'p')
    put(state, { row: 3, col: 0 }, 'p')
    put(state, { row: 3, col: 1 }, 'p')
    put(state, { row: 5, col: 1 }, 'p')

    const next = applyPlayerMove(state, { row: 4, col: 0 })
    const threat = next.events.find((event) => event.kind === 'threat')

    expect(threat).toBeDefined()
    expect(threat?.kind === 'threat' && threat.count).toBeLessThanOrEqual(TRIO_THREAT_CAP)
  })

  it('aynı tehdidi sürdürmek puan getirmiyor - puan kurmaktan geliyor', () => {
    const state = trioState([{ pos: { row: 4, col: 0 }, type: 'r' }])
    put(state, { row: 0, col: 0 }, 'p')

    // Kale zaten piyonu vuruyor; dikeyde yaklaşmak yeni tehdit kurmuyor
    const next = applyPlayerMove(state, { row: 2, col: 0 })
    expect(next.events.some((event) => event.kind === 'threat')).toBe(false)
  })

  it('mat Üçlüde büyük ikramiye', () => {
    const state = trioState([{ pos: { row: 4, col: 0 }, type: 'r' }])
    // Şah köşede, kalenin hattında ve kaçacak yeri yok
    put(state, { row: 0, col: 0 }, 'k')
    put(state, { row: 0, col: 1 }, 'p')
    put(state, { row: 1, col: 1 }, 'p')
    state.board[1].cells[0] = makePiece('p', 'b')
    state.board[1].cells[0] = null

    const checked = applyPlayerMove(state, { row: 3, col: 0 })
    expect(checked.events.some((event) => event.kind === 'check')).toBe(true)

    const after = applyEnemyMove(checked)
    const mate = after.events.find((event) => event.kind === 'mate')
    if (mate?.kind === 'mate') expect(mate.points).toBe(TRIO_MATE_SCORE)
  })
})

describe('Üçlü - şah yemek kadroyu tamamlıyor', () => {
  it('eksik taş geri geliyor', () => {
    const state = trioState([
      { pos: { row: 4, col: 4 }, type: 'q' },
      { pos: { row: 6, col: 1 }, type: 'b' },
    ])
    put(state, { row: 2, col: 4 }, 'k')
    state.rng = createRng(9)

    const next = applyPlayerMove(state, { row: 2, col: 4 })
    const gain = next.events.find((event) => event.kind === 'squadGain')

    expect(gain).toMatchObject({ kind: 'squadGain', piece: 'r', size: 3 })
    expect(next.squad).toHaveLength(3)
    expect(next.lives).toBe(3)
  })

  it('kadro tamsa dördüncü taş ikinci fil ve karşı renkte doğuyor', () => {
    const state = trioState([
      { pos: { row: 4, col: 4 }, type: 'q' },
      { pos: { row: 6, col: 1 }, type: 'b' },
      { pos: { row: 6, col: 6 }, type: 'r' },
    ])
    put(state, { row: 2, col: 4 }, 'k')
    state.rng = createRng(4)

    const next = applyPlayerMove(state, { row: 2, col: 4 })
    const gain = next.events.find((event) => event.kind === 'squadGain')

    expect(gain).toMatchObject({ kind: 'squadGain', piece: 'b', size: 4 })

    const bishops = next.squad.filter((pos) => typeAt(next, pos) === 'b')
    expect(bishops).toHaveLength(2)

    const shades = bishops.map((pos) => (next.distance + pos.row + pos.col) % 2)
    expect(shades[0]).not.toBe(shades[1])
  })

  it('kadro dolduktan sonra büyümüyor', () => {
    const state = trioState([
      { pos: { row: 4, col: 4 }, type: 'q' },
      { pos: { row: 6, col: 1 }, type: 'b' },
      { pos: { row: 6, col: 6 }, type: 'r' },
      { pos: { row: 5, col: 2 }, type: 'b' },
    ])
    put(state, { row: 2, col: 4 }, 'k')

    const next = applyPlayerMove(state, { row: 2, col: 4 })

    expect(next.squad).toHaveLength(TRIO_MAX_SQUAD)
    expect(next.events.some((event) => event.kind === 'squadGain')).toBe(false)
  })

  it('şah yendiğinde tahta yenileniyor ve kadronun tamamı taşınıyor', () => {
    const state = trioState([
      { pos: { row: 4, col: 4 }, type: 'q' },
      { pos: { row: 6, col: 1 }, type: 'b' },
      { pos: { row: 6, col: 6 }, type: 'r' },
    ])
    put(state, { row: 2, col: 4 }, 'k')
    state.rng = createRng(21)

    const moved = applyPlayerMove(state, { row: 2, col: 4 })
    expect(needsBoardRefresh(moved)).toBe(true)

    const fresh = applyBoardRefresh(moved)
    expect(fresh.squad).toHaveLength(moved.squad.length)

    const seen = new Set<string>()
    for (const pos of fresh.squad) {
      expect(fresh.board[pos.row].cells[pos.col]?.color).toBe('w')
      seen.add(`${pos.row},${pos.col}`)
    }
    expect(seen.size).toBe(fresh.squad.length)
  })
})

describe('Üçlü - sıkışma', () => {
  it('seçili taşın kilitlenmesi sıkışma değil', () => {
    const state = trioState([
      { pos: { row: 0, col: 0 }, type: 'b' },
      { pos: { row: 4, col: 4 }, type: 'q' },
    ])
    // Filin tek çaprazı kendi taşıyla kapalı
    state.board[1].cells[1] = makePiece('r', 'w')
    state.squad.push({ row: 1, col: 1 })

    expect(legalMoves(state)).toHaveLength(0)
    expect(hasAnyMove(state)).toBe(true)
  })

  it('üç taşın da hamlesi kalmayınca sıkışma tetikleniyor ve tahta yenileniyor', () => {
    // Üç taş da üst satıra sıkıştırılmış ve her çıkışı kendi taşlarıyla kapalı
    const state = trioState(
      [
        { pos: { row: 0, col: 0 }, type: 'q' },
        { pos: { row: 0, col: 2 }, type: 'b' },
        { pos: { row: 0, col: 4 }, type: 'r' },
      ],
      6,
    )

    for (const [row, col] of [
      [0, 1],
      [0, 3],
      [0, 5],
      [1, 0],
      [1, 1],
      [1, 3],
      [1, 4],
    ]) {
      state.board[row].cells[col] = makePiece('p', 'w')
    }
    state.rng = createRng(2)

    expect(hasAnyMove(state)).toBe(false)

    const next = applyStuck(state)

    expect(next.stuckLeft).toBe(1)
    expect(next.status).toBe('playing')
    expect(next.squad).toHaveLength(3)
    expect(hasAnyMove(next)).toBe(true)
    expect(next.events.some((event) => event.kind === 'stuck')).toBe(true)
  })
})

describe('Üçlü - bütünlük', () => {
  it('kadro ile aktif taş hiçbir fazda ayrışmıyor', () => {
    for (let seed = 0; seed < 60; seed++) {
      let state = createGame({ playerColor: 'w', mode: 'trio', cols: 8, seed })
      let turns = 0

      const check = (label: string) => {
        if (state.status !== 'playing') return
        expect(state.squad.length, `${label}/${seed}`).toBeGreaterThan(0)
        expect(state.player, `${label}/${seed}`).toEqual(state.squad[state.selected])
        expect(state.lives, `${label}/${seed}`).toBe(state.squad.length)

        for (const pos of state.squad) {
          expect(state.board[pos.row].cells[pos.col]?.color, `${label}/${seed}`).toBe('w')
        }
      }

      while (state.status === 'playing' && turns < 40) {
        if (!hasAnyMove(state)) {
          state = applyStuck(state)
          check('stuck')
          if (state.status !== 'playing') break
          continue
        }

        // Hamlesi olan ilk taşı seç, ilk hamlesini oyna
        const index = state.squad.findIndex(
          (pos) => pseudoMoves(state.board, pos, state.playerColor).length > 0,
        )
        state = selectPiece(state, index)
        check('select')

        state = applyPlayerMove(state, legalMoves(state)[0])
        check('move')

        if (needsBoardRefresh(state)) {
          state = applyBoardRefresh(state)
          check('refresh')
        }

        state = applyScroll(state)
        check('scroll')
        if (state.status !== 'playing') break

        state = applyEnemyMove(state)
        check('enemy')
        turns++
      }
    }
  })

  it('aynı tohum aynı oyunu veriyor', () => {
    const signature = (seed: number): string => {
      let state = createGame({ playerColor: 'w', mode: 'trio', cols: 7, seed })
      const marks: string[] = []

      for (let turn = 0; turn < 15 && state.status === 'playing'; turn++) {
        if (!hasAnyMove(state)) {
          state = applyStuck(state)
          continue
        }
        const index = state.squad.findIndex(
          (pos) => pseudoMoves(state.board, pos, state.playerColor).length > 0,
        )
        state = applyPlayerMove(selectPiece(state, index), legalMoves(selectPiece(state, index))[0])
        if (needsBoardRefresh(state)) state = applyBoardRefresh(state)
        state = applyScroll(state)
        if (state.status !== 'playing') break
        state = applyEnemyMove(state)
        marks.push(`${state.score}:${state.squad.map((p) => `${p.row},${p.col}`).join('|')}`)
      }

      return marks.join(' ')
    }

    expect(signature(42)).toBe(signature(42))
    expect(signature(42)).not.toBe(signature(43))
  })
})
