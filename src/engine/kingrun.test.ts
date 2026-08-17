import { describe, expect, it } from 'vitest'
import { emptyRow, makePiece } from './board'
import { ROW_SCORE, ROWS } from './config'
import {
  applyPlayerMove,
  applyScroll,
  createGame,
  legalMoves,
  playerInCheck,
  playerMove,
  applyStuck,
} from './game'
import { key } from './moves'
import { systemRng } from './random'
import type { Board, GameState, PieceType, Pos } from './types'

function kingRunState(overrides: Partial<GameState> = {}, cols = 8): GameState {
  const board: Board = Array.from({ length: ROWS }, () => emptyRow(cols))
  const state: GameState = {
    mode: 'kingRun',
    seed: null,
    rng: systemRng,
    board,
    player: { row: 6, col: 3 },
    playerType: 'k',
    chain: ['k'],
    playerColor: 'w',
    enemyColor: 'b',
    score: 0,
    lives: 1,
    distance: 0,
    checkStreak: 0,
    stuckLeft: 2,
    status: 'playing',
    events: [],
    scrollTick: 0,
    refreshTick: 0,
    squad: [],
    selected: 0,
    ...overrides,
  }
  // Kadro aktif taştan türetiliyor: Kaçış'ta tek elemanlı
  if (state.squad.length === 0) state.squad = [state.player]
  state.board[state.player.row].cells[state.player.col] = makePiece('k', state.playerColor)
  return state
}

function put(state: GameState, pos: Pos, type: PieceType): void {
  state.board[pos.row].cells[pos.col] = makePiece(type, state.enemyColor)
}

describe('Şah Kaçışı kurulumu', () => {
  it('oyuncu şah olarak başlar, rakip şahı yoktur, tek canı vardır', () => {
    const state = createGame({ playerColor: 'w', mode: 'kingRun', cols: 6 })

    expect(state.playerType).toBe('k')
    expect(state.lives).toBe(1)
    expect(state.board[state.player.row].cells[state.player.col]?.type).toBe('k')

    const enemyKings = state.board.flatMap((row) =>
      row.cells.filter((c) => c?.type === 'k' && c.color === state.enemyColor),
    )
    expect(enemyKings).toHaveLength(0)
  })

  it('hayatta kalınan her satır puan getirir', () => {
    const state = kingRunState()

    const after = applyScroll(state)

    expect(after.score).toBe(ROW_SCORE)
    expect(after.distance).toBe(1)
  })
})

describe('vurulan kareye girilemez', () => {
  it('tehdit altındaki kareler hamle listesinden çıkar', () => {
    const state = kingRunState()
    put(state, { row: 0, col: 4 }, 'r') // 4. sütunun tamamını vuruyor

    const moves = legalMoves(state).map(key)

    expect(moves).toContain(key({ row: 5, col: 3 }))
    expect(moves).not.toContain(key({ row: 5, col: 4 }))
    expect(moves).not.toContain(key({ row: 6, col: 4 }))
    expect(moves).not.toContain(key({ row: 7, col: 4 }))
  })

  it('korunmasız taşı yer, korunanı yiyemez — gerçek satranç şahı', () => {
    const undefended = kingRunState()
    put(undefended, { row: 5, col: 3 }, 'p')
    expect(legalMoves(undefended).map(key)).toContain(key({ row: 5, col: 3 }))

    const defended = kingRunState()
    put(defended, { row: 5, col: 3 }, 'p')
    put(defended, { row: 4, col: 2 }, 'p') // çaprazdan (5,3)'ü koruyor
    expect(legalMoves(defended).map(key)).not.toContain(key({ row: 5, col: 3 }))
  })

  it('yediği taşa dönüşmez — baştan sona şah kalır', () => {
    const state = kingRunState()
    put(state, { row: 5, col: 3 }, 'q')

    const next = applyPlayerMove(state, { row: 5, col: 3 })

    expect(next.playerType).toBe('k')
    expect(next.chain).toEqual(['k'])
    expect(next.score).toBe(9)
  })

  it('en alt satır yasak değil, sadece ölümcül — risk oyuncunun', () => {
    const state = kingRunState({ player: { row: ROWS - 2, col: 3 } })

    expect(legalMoves(state).map(key)).toContain(key({ row: ROWS - 1, col: 3 }))
  })
})

describe('bitiş koşulları', () => {
  it('tehdit altındayken bunu bildirir', () => {
    const safe = kingRunState()
    expect(playerInCheck(safe)).toBe(false)

    const threatened = kingRunState()
    put(threatened, { row: 0, col: 3 }, 'r')
    expect(playerInCheck(threatened)).toBe(true)
  })

  /**
   * Belirlenimci oyuncu: her zaman ulaşabildiği en üst kareye basar.
   * Tohum sabit olduğu için testin sonucu da sabit — `Math.random` ile
   * oynayan bir bot, mat oranını ölçülemez hale getirip testi sallıyordu.
   */
  function climb(options: Pos[]): Pos {
    return [...options].sort((a, b) => a.row - b.row || a.col - b.col)[0]
  }

  it('koşu matla ya da düşerek biter — şah asla yenilerek kaybetmez', () => {
    // Kuralın bütünü bu testte: oyuncu hep vurulmayan kareye indiği ve
    // kaymayla doğan pusular temizlendiği için rakip onu *yiyemez*.
    // Geriye iki gerçek ölüm kalıyor: mat ve tahtadan düşmek.
    let mated = 0
    let fell = 0
    let captured = 0
    let finished = 0

    for (let round = 0; round < 200; round++) {
      let state = createGame({
        playerColor: 'w',
        mode: 'kingRun',
        cols: 4 + (round % 5),
        seed: 1000 + round,
      })

      for (let turn = 0; turn < 300 && state.status === 'playing'; turn++) {
        const options = legalMoves(state)
        state = options.length === 0 ? applyStuck(state) : playerMove(state, climb(options))

        if (state.status === 'gameover') {
          finished++
          if (state.events.some((e) => e.kind === 'checkmated')) mated++
          if (state.events.some((e) => e.kind === 'lifeLost' && e.reason === 'fellOff')) fell++
          if (state.events.some((e) => e.kind === 'lifeLost' && e.reason === 'captured')) {
            captured++
          }
        }
      }
    }

    expect(captured).toBe(0)
    expect(finished).toBeGreaterThan(150)
    expect(mated).toBeGreaterThan(0)
    expect(fell).toBeGreaterThan(0)
  })

  it('mat olan koşuda oyuncu gerçekten sıkışmıştır', () => {
    for (let round = 0; round < 120; round++) {
      let state = createGame({
        playerColor: 'w',
        mode: 'kingRun',
        cols: 5,
        seed: 5000 + round,
      })

      for (let turn = 0; turn < 300 && state.status === 'playing'; turn++) {
        const options = legalMoves(state)
        state = options.length === 0 ? applyStuck(state) : playerMove(state, climb(options))
      }

      if (state.events.some((e) => e.kind === 'checkmated')) {
        // Mat tanımı: vuruluyorsun ve gidecek güvenli kare yok
        expect(playerInCheck({ ...state, status: 'playing' })).toBe(true)
        expect(legalMoves({ ...state, status: 'playing' })).toHaveLength(0)
      }
    }
  })
})
