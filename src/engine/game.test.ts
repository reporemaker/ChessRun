import { describe, expect, it } from 'vitest'
import { colsOf, emptyRow, makePiece, scrollBoard, spawnRow } from './board'
import {
  DIFFICULTY,
  CHECK_SCORE,
  DEFAULT_COLS,
  MATE_SCORE,
  MAX_ROW_PIECES,
  STUCK_SCORE,
  MINOR_SPAWN_WEIGHTS,
  ROWS,
  SPAWN_WEIGHTS,
  clampCols,
  rowPieces,
} from './config'
import { safeMoves } from './fairness'
import {
  applyBoardRefresh,
  applyEnemyMove,
  applyPlayerMove,
  applyScroll,
  checkedKingSquare,
  createGame,
  legalMoves,
  movesToKing,
  needsBoardRefresh,
  playerMove,
  threatenedSquares,
  applyStuck,
} from './game'
import { key } from './moves'
import { systemRng } from './random'
import type { Board, GameState, PieceType, Pos } from './types'

/** Rastgeleliği devre dışı bırakılmış, elle kurulan tahta */
function blankState(overrides: Partial<GameState> = {}, cols = DEFAULT_COLS): GameState {
  const board: Board = Array.from({ length: ROWS }, () => emptyRow(cols))
  const state: GameState = {
    mode: 'classic',
    seed: null,
    rng: systemRng,
    board,
    player: { row: ROWS - 2, col: 3 },
    playerType: 'p',
    chain: ['p'],
    playerColor: 'w',
    enemyColor: 'b',
    score: 0,
    lives: 3,
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
  // Kadro aktif taştan türetiliyor: tek taşlı modlarda tek elemanlı
  if (state.squad.length === 0) state.squad = [state.player]
  state.board[state.player.row].cells[state.player.col] = makePiece(
    state.playerType,
    state.playerColor,
  )
  return state
}

function put(state: GameState, pos: Pos, type: PieceType): void {
  state.board[pos.row].cells[pos.col] = makePiece(type, state.enemyColor)
}

function countKings(state: GameState): number {
  return state.board.reduce(
    (sum, row) => sum + row.cells.filter((c) => c?.type === 'k').length,
    0,
  )
}

describe('dönüşüm', () => {
  it('yenen taşa dönüşür ve değeri kadar puan verir', () => {
    const state = blankState()
    put(state, { row: ROWS - 3, col: 4 }, 'n')

    const next = applyPlayerMove(state, { row: ROWS - 3, col: 4 })

    expect(next.playerType).toBe('n')
    expect(next.score).toBe(3)
  })

  it('vezirken piyon yiyince piyona düşer - güç kaybı gerçek', () => {
    const state = blankState({ playerType: 'q' })
    put(state, { row: ROWS - 3, col: 3 }, 'p')

    const next = applyPlayerMove(state, { row: ROWS - 3, col: 3 })

    expect(next.playerType).toBe('p')
    expect(next.score).toBe(1)
  })
})

describe('şah bonusu', () => {
  it('+25 puan ve +1 can verir, dönüşüm yaptırmaz', () => {
    const state = blankState()
    put(state, { row: ROWS - 3, col: 4 }, 'k')

    const next = applyPlayerMove(state, { row: ROWS - 3, col: 4 })

    expect(next.score).toBe(25)
    expect(next.lives).toBe(4)
    expect(next.playerType).toBe('p')
  })

  it('şah yendikten sonra tahtada yeni bir şah doğar', () => {
    const state = blankState()
    put(state, { row: ROWS - 3, col: 4 }, 'k')

    expect(countKings(playerMove(state, { row: ROWS - 3, col: 4 }))).toBe(1)
  })
})

describe('şah yenince tahta yenilenir', () => {
  function afterKingCapture(): GameState {
    const state = blankState({ playerType: 'n', player: { row: 5, col: 3 } })
    put(state, { row: 3, col: 4 }, 'k')
    const moved = applyPlayerMove(state, { row: 3, col: 4 })
    expect(needsBoardRefresh(moved)).toBe(true)
    return applyBoardRefresh(moved)
  }

  it('yeni tahta kurulur ve animasyon sayacı artar', () => {
    const next = afterKingCapture()

    expect(next.refreshTick).toBe(1)
    expect(next.events.some((e) => e.kind === 'boardRefresh')).toBe(true)
    expect(countKings(next)).toBe(1)
    expect(next.board[next.player.row].cells[next.player.col]?.color).toBe(next.playerColor)
  })

  it('yeni tahtada oyuncuyu vuran taş bulunmaz - kazanılan can korunur', () => {
    for (let round = 0; round < 200; round++) {
      const next = afterKingCapture()

      expect(threatenedSquares(next).has(key(next.player))).toBe(false)
      expect(next.player.row).toBeLessThan(ROWS - 1) // kaymayla da düşmez
    }
  })

  it('şah yemek asla aynı turda can kaybettirmez', () => {
    // Kullanıcının asıl derdi buydu: +1 can kazanıp aynı turda geri vermek.
    let kingsEaten = 0

    for (let round = 0; round < 150; round++) {
      let state = createGame({ playerColor: 'w', cols: 4 + (round % 5) })

      for (let turn = 0; turn < 120 && state.status === 'playing'; turn++) {
        const options = legalMoves(state)
        if (options.length === 0) {
          state = applyStuck(state)
          continue
        }

        const kingSquare = options.find(
          (pos) => state.board[pos.row].cells[pos.col]?.type === 'k',
        )
        const target = kingSquare ?? options[Math.floor(Math.random() * options.length)]
        const livesBefore = state.lives

        state = playerMove(state, target)

        if (kingSquare) {
          kingsEaten++
          expect(state.lives).toBe(livesBefore + 1)
        }
      }
    }

    expect(kingsEaten).toBeGreaterThan(10) // test boşa dönmesin
  })

  it('dar tahtada da can kaybettirmez - şah yeniden doğarken dibe konamaz', () => {
    // Regresyon: kayma sonrası yeniden doğan şah oyuncunun bitişiğine
    // düştüğünde, eski kod onu yalnızca kendi satırında taşımaya çalışıyordu.
    // 4 sütunda o satır doluysa şah yerinde kalıyor ve oyuncuyu yiyordu -
    // ~350 şah yemede bir. Bu yüzden test bilerek dar tahtada ve hacimli.
    let kingsEaten = 0

    for (let round = 0; round < 600; round++) {
      let state = createGame({ playerColor: 'w', cols: 4 })

      for (let turn = 0; turn < 120 && state.status === 'playing'; turn++) {
        const options = legalMoves(state)
        if (options.length === 0) {
          state = applyStuck(state)
          continue
        }

        const kingSquare = options.find(
          (pos) => state.board[pos.row].cells[pos.col]?.type === 'k',
        )
        const target = kingSquare ?? options[Math.floor(Math.random() * options.length)]
        const livesBefore = state.lives

        state = playerMove(state, target)

        if (kingSquare) {
          kingsEaten++
          expect(state.lives).toBe(livesBefore + 1)
        }
      }
    }

    expect(kingsEaten).toBeGreaterThan(80)
  })
})

describe('şah çekme', () => {
  /** Kalesi 3. sütunda olan oyuncu, aynı sütundaki şaha şah çeker */
  function checkPosition(): GameState {
    const state = blankState({ playerType: 'r', player: { row: 6, col: 3 } })
    put(state, { row: 2, col: 3 }, 'k')
    put(state, { row: 0, col: 7 }, 'n') // uzakta, şahı kurtaramaz
    return state
  }

  it('oyuncunun taşı şahı vurduğunda şah durumu bildirilir', () => {
    expect(checkedKingSquare(checkPosition())).toEqual({ row: 2, col: 3 })
  })

  it('şah altındaki rakip başka taşını oynayamaz - sadece şahını kurtarır', () => {
    const state = checkPosition()

    const next = applyEnemyMove(state)

    expect(checkedKingSquare(next)).toBeNull()
    // Uzaktaki at yerinde kaldı: rakip bu turda savunmaktan başka bir şey yapamaz
    expect(next.board[0].cells[7]?.type).toBe('n')
  })

  it('şah çeken taşı yiyebiliyorsa yer', () => {
    const state = blankState({ playerType: 'r', player: { row: 4, col: 3 } })
    put(state, { row: 2, col: 3 }, 'k')
    put(state, { row: 3, col: 2 }, 'p') // çapraz alışla kaleyi yer

    const next = applyEnemyMove(state)

    expect(next.player).not.toEqual({ row: 4, col: 3 })
    expect(next.lives).toBe(2)
  })

  it('mat olduğunda rakip donup kalmaz, başka bir taşını oynar', () => {
    for (let round = 0; round < 30; round++) {
      const state = blankState({ playerType: 'r', player: { row: 0, col: 0 } }, 4)
      put(state, { row: 0, col: 3 }, 'k')
      put(state, { row: 1, col: 2 }, 'p') // kaçış karelerini kendi taşları kapatıyor
      put(state, { row: 1, col: 3 }, 'p')

      const next = applyEnemyMove(state)

      expect(next.events.some((e) => e.kind === 'mate')).toBe(true)
      expect(checkedKingSquare(next)).toEqual({ row: 0, col: 3 }) // şah hâlâ masada
      // Piyonlardan biri ilerledi: şah kurtulmuyor ama oyun donmuyor
      expect(next.board[2].cells.filter(Boolean)).toHaveLength(1)
      expect(next.board[1].cells.filter(Boolean)).toHaveLength(1)
    }
  })

  it('şah çekilmiyorken rakip normal oynar', () => {
    const state = blankState({ playerType: 'n', player: { row: 6, col: 3 } })
    put(state, { row: 7, col: 7 }, 'k')
    put(state, { row: 2, col: 3 }, 'r')

    const next = applyEnemyMove(state)

    expect(next.board[2].cells[3]).toBeNull() // kale oyuncuya doğru ilerledi
  })
})

describe('şah avı puanlaması', () => {
  it('şah çekmek puan verir, zincir çarpanı büyütür', () => {
    const state = blankState({ playerType: 'r', player: { row: 6, col: 3 } })
    put(state, { row: 2, col: 3 }, 'k')

    const first = applyPlayerMove(state, { row: 5, col: 3 })
    expect(first.checkStreak).toBe(1)
    expect(first.score).toBe(CHECK_SCORE)

    // Aynı sütunda kalmaya devam: şah zinciri sürüyor
    const second = applyPlayerMove(first, { row: 4, col: 3 })
    expect(second.checkStreak).toBe(2)
    expect(second.score).toBe(CHECK_SCORE + CHECK_SCORE * 2)
  })

  it('şah çekilmeyen hamle zinciri sıfırlar', () => {
    const state = blankState({ playerType: 'r', player: { row: 6, col: 3 }, checkStreak: 3 })
    put(state, { row: 2, col: 0 }, 'k')

    const next = applyPlayerMove(state, { row: 6, col: 5 })

    expect(next.checkStreak).toBe(0)
    expect(next.score).toBe(0)
  })

  it('mat ek puan verir', () => {
    const state = blankState({ playerType: 'r', player: { row: 0, col: 0 } }, 4)
    put(state, { row: 0, col: 3 }, 'k')
    put(state, { row: 1, col: 2 }, 'p')
    put(state, { row: 1, col: 3 }, 'p')

    const next = applyEnemyMove(state)

    expect(next.score).toBe(MATE_SCORE)
    expect(next.events.some((e) => e.kind === 'mate' && e.points === MATE_SCORE)).toBe(true)
  })
})

describe('şaha kaç hamle', () => {
  it('atın bir hamlede ulaştığı şahı 1 sayar', () => {
    const state = blankState({ playerType: 'n', player: { row: 7, col: 3 } })
    put(state, { row: 5, col: 4 }, 'k')

    expect(movesToKing(state)).toBe(1)
  })

  it('taş tipine göre değişir - aynı tahtada fil ile at farklı sayar', () => {
    const asBishop = blankState({ playerType: 'b', player: { row: 7, col: 3 } })
    put(asBishop, { row: 5, col: 5 }, 'k')
    expect(movesToKing(asBishop)).toBe(1) // çapraz hat açık

    const asKnight = blankState({ playerType: 'n', player: { row: 7, col: 3 } })
    put(asKnight, { row: 5, col: 5 }, 'k')
    expect(movesToKing(asKnight)).toBeGreaterThan(1)
  })

  it('derinlik içinde ulaşılamıyorsa null döner', () => {
    // Piyon geriye gidemez: alttaki şaha asla ulaşamaz
    const state = blankState({ playerType: 'p', player: { row: 2, col: 3 } })
    put(state, { row: 7, col: 3 }, 'k')

    expect(movesToKing(state)).toBeNull()
  })

  it('araya giren taşları hesaba katar ve tahtayı bozmaz', () => {
    const state = blankState({ playerType: 'r', player: { row: 7, col: 3 } })
    put(state, { row: 4, col: 3 }, 'k')
    put(state, { row: 6, col: 3 }, 'q') // kalenin önünü kapatıyor

    const before = JSON.stringify(state.board)
    expect(movesToKing(state)).toBeGreaterThan(1) // doğrudan hat kapalı
    expect(JSON.stringify(state.board)).toBe(before) // hesap tahtayı kirletmedi
  })
})

describe('tur akışı', () => {
  it('her hamlede tahta bir satır ilerler', () => {
    const state = blankState()
    const after = playerMove(state, { row: ROWS - 3, col: 3 })

    expect(after.distance).toBe(1)
    expect(after.scrollTick).toBe(1)
  })

  it('fazlar tek tek uygulanabilir ve toplu çağrıyla aynı sonucu verir', () => {
    const state = blankState()
    const target = { row: ROWS - 3, col: 3 }

    const stepped = applyEnemyMove(applyScroll(applyPlayerMove(state, target)))

    expect(stepped.distance).toBe(1)
    expect(stepped.player.row).toBe(ROWS - 2) // bir yukarı, sonra kayma bir aşağı
  })

  it('en alt satırda kalan oyuncu tahtadan düşer', () => {
    const board: Board = Array.from({ length: ROWS }, () => emptyRow(DEFAULT_COLS))
    const options = { enemyColor: 'b' as const, pieces: 0 }

    expect(
      scrollBoard(board, { ...options, player: { row: ROWS - 1, col: 2 } }).playerFellOff,
    ).toBe(true)
    expect(
      scrollBoard(board, { ...options, player: { row: ROWS - 2, col: 2 } }).playerFellOff,
    ).toBe(false)
  })
})

describe('koridor genişliği', () => {
  it('seçilen genişlikte tahta kurulur', () => {
    for (const cols of [4, 5, 6, 7, 8]) {
      const state = createGame({ playerColor: 'w', cols })
      expect(colsOf(state.board)).toBe(cols)
      expect(state.board.every((row) => row.cells.length === cols)).toBe(true)
      expect(state.player.col).toBeLessThan(cols)
    }
  })

  it('sınır dışı genişlik istekleri 4-8 aralığına çekilir', () => {
    expect(clampCols(1)).toBe(4)
    expect(clampCols(99)).toBe(8)
    expect(clampCols(6)).toBe(6)
  })

  it('dar tahtada hamleler kenardan taşmaz', () => {
    let state = createGame({ playerColor: 'w', cols: 4 })

    for (let turn = 0; turn < 60 && state.status === 'playing'; turn++) {
      const options = legalMoves(state)
      for (const move of options) {
        expect(move.col).toBeGreaterThanOrEqual(0)
        expect(move.col).toBeLessThan(4)
      }
      state =
        options.length === 0
          ? applyStuck(state)
          : playerMove(state, options[Math.floor(Math.random() * options.length)])
      expect(state.board.every((row) => row.cells.length === 4)).toBe(true)
    }
  })

  it('kayma tahtanın genişliğini korur', () => {
    const board: Board = Array.from({ length: ROWS }, () => emptyRow(5))
    const next = scrollBoard(board, {
      player: { row: 3, col: 2 },
      enemyColor: 'b',
      pieces: 3,
    })

    expect(next.board.every((row) => row.cells.length === 5)).toBe(true)
  })
})

describe('zorluk', () => {
  it('düşman yoğunluğu seviyeyle artar ve tavanı aşmaz', () => {
    expect(rowPieces(0, 'p')).toBeLessThan(rowPieces(40, 'p'))
    expect(rowPieces(100000, 'q')).toBeLessThanOrEqual(MAX_ROW_PIECES)
  })

  it('eğriler mod bazlı ve elle ayarlanan değerlerde sabit (23 Ağustos 2026)', () => {
    // Bu sayılar ölçüm + Seu'nun el ayarıyla kondu; yanlışlıkla değişirse test kırılsın
    expect(DIFFICULTY.classic).toEqual({ step: 20, base: 0.3, inc: 0.08 })
    expect(DIFFICULTY.kingRun).toEqual({ step: 10, base: 0.3, inc: 0.15 })
    expect(DIFFICULTY.trio).toEqual({ step: 15, base: 0.5, inc: 0.1 })
  })

  it('ağır taş baskısı: vezirle düşman daha yoğun doğar', () => {
    expect(rowPieces(0, 'q')).toBeGreaterThan(rowPieces(0, 'p'))
  })

  it('dar koridorda satır başına daha az taş doğar - baskı orantılı kalır', () => {
    expect(rowPieces(0, 'n', 4)).toBeCloseTo(rowPieces(0, 'n', 8) / 2)
    expect(rowPieces(0, 'n', 8)).toBe(DIFFICULTY.classic.base)

    // Asıl ölçüt kare başına düşen baskı: her genişlikte aynı olmalı
    for (const cols of [4, 5, 6, 7, 8]) {
      expect(rowPieces(0, 'n', cols) / cols).toBeCloseTo(DIFFICULTY.classic.base / 8)
    }
  })

  it('yeni satırların %75\'inde tam bir taş doğar (0.75 yoğunlukta)', () => {
    let withPiece = 0
    const rows = 6000
    for (let i = 0; i < rows; i++) {
      const row = spawnRow({ cols: 8, pieces: 0.75, enemyColor: 'b' })
      const count = row.cells.filter(Boolean).length
      expect(count).toBeLessThanOrEqual(1) // 0.75 → ya bir taş ya hiç
      if (count === 1) withPiece++
    }

    expect(withPiece / rows).toBeGreaterThan(0.72)
    expect(withPiece / rows).toBeLessThan(0.78)
  })

  it('beklenen değerin tam kısmı garanti, kesir kısmı olasılık', () => {
    // 1.5 → bir taş kesin, ikincisi yazı tura
    let total = 0
    const rows = 4000
    for (let i = 0; i < rows; i++) {
      const count = spawnRow({ cols: 8, pieces: 1.5, enemyColor: 'b' }).cells.filter(Boolean).length
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(2)
      total += count
    }

    expect(total / rows).toBeGreaterThan(1.45)
    expect(total / rows).toBeLessThan(1.55)
  })

  it('piyon, diğer taşların toplamının üçte biri kadar çıkar', () => {
    const weightOf = (type: PieceType) =>
      SPAWN_WEIGHTS.find(([t]) => t === type)?.[1] ?? 0
    const others = MINOR_SPAWN_WEIGHTS.reduce((sum, [, w]) => sum + w, 0)

    expect(weightOf('p')).toBeCloseTo(others / 3)
  })

  it('yem piyonu istenen sütuna konur - ilk av garantisi', () => {
    const row = spawnRow({ cols: 6, pieces: 0, enemyColor: 'b', baitCol: 2 })

    expect(row.cells[2]?.type).toBe('p')
    expect(row.cells.filter(Boolean)).toHaveLength(1)
  })
})

describe('tehdit hesabı', () => {
  it('düşman piyonu ilerlediği kareyi değil, çaprazlarını tehdit eder', () => {
    const state = blankState()
    put(state, { row: 4, col: 4 }, 'p')

    const threats = threatenedSquares(state)

    expect(threats.has(key({ row: 5, col: 3 }))).toBe(true)
    expect(threats.has(key({ row: 5, col: 5 }))).toBe(true)
    expect(threats.has(key({ row: 5, col: 4 }))).toBe(false)
  })

  it('en alt satıra inmek güvenli sayılmaz - kayma hemen ardından gelir', () => {
    const state = blankState({ player: { row: ROWS - 2, col: 3 }, playerType: 'r' })

    const safe = safeMoves(state).map(key)

    expect(safe).not.toContain(key({ row: ROWS - 1, col: 3 }))
    expect(safe).toContain(key({ row: ROWS - 3, col: 3 }))
  })
})

describe('sıkışma', () => {
  it('hamlesi kalmayan oyuncuyu kurtarmak için taş silinmez - kaybetmek gerçek', () => {
    const state = blankState()
    // Piyonun ilerleyeceği kare tıkalı, çaprazları boş → hiç hamlesi yok
    put(state, { row: ROWS - 3, col: 3 }, 'p')

    expect(legalMoves(state)).toHaveLength(0)

    const next = applyEnemyMove(state)

    // Tıkacı yerinde: oyuncu ya bekleyecek ya da bedelini ödeyecek
    expect(next.board[ROWS - 3].cells[3]?.type).toBe('p')
    expect(legalMoves(next)).toHaveLength(0)
  })

  it('sıkışınca hak yanar, tahta yeniden dizilir, puan gelir', () => {
    const state = blankState()
    put(state, { row: ROWS - 3, col: 3 }, 'p')
    expect(legalMoves(state)).toHaveLength(0)

    const next = applyStuck(state)

    expect(next.status).toBe('playing')
    expect(next.stuckLeft).toBe(1)
    expect(next.score).toBe(STUCK_SCORE)
    expect(next.refreshTick).toBe(1)
    // Kurtuluş gerçekten kurtarmalı: yeni tahtada hamlesi olmalı
    expect(legalMoves(next).length).toBeGreaterThan(0)
    expect(threatenedSquares(next).has(key(next.player))).toBe(false)
  })

  it('hak bitince sıkışmak koşuyu bitirir', () => {
    const state = blankState({ stuckLeft: 0 })
    put(state, { row: ROWS - 3, col: 3 }, 'p')

    const next = applyStuck(state)

    expect(next.status).toBe('gameover')
    expect(next.events.some((e) => e.kind === 'stuckOut')).toBe(true)
  })

  it('sıkışma tahtayı boşaltmaz - şah yemenin ödülüyle karışmamalı', () => {
    let dense = 0
    const rounds = 60

    for (let round = 0; round < rounds; round++) {
      const state = createGame({ playerColor: 'w', cols: 8, seed: 300 + round })
      const after = applyStuck(state)
      dense += after.board.reduce((sum, row) => sum + row.cells.filter(Boolean).length, 0)
    }

    // Aynı yoğunlukta yeniden dizilim: tahta bomboş kalmamalı
    expect(dense / rounds).toBeGreaterThan(3)
  })
})

describe('bütünlük', () => {
  it('uzun rastgele oyunlarda çökmez ve değişmezleri korur', () => {
    for (let round = 0; round < 20; round++) {
      const cols = 4 + (round % 5)
      let state = createGame({ playerColor: round % 2 === 0 ? 'w' : 'b', cols })
      expect(countKings(state)).toBe(1)

      for (let turn = 0; turn < 200 && state.status === 'playing'; turn++) {
        const options = legalMoves(state)
        state =
          options.length === 0
            ? applyStuck(state)
            : playerMove(state, options[Math.floor(Math.random() * options.length)])

        expect(state.board).toHaveLength(ROWS)
        expect(state.board.every((row) => row.cells.length === cols)).toBe(true)
        expect(state.lives).toBeGreaterThanOrEqual(0)

        if (state.status === 'playing') {
          expect(countKings(state)).toBe(1)
          expect(state.board[state.player.row].cells[state.player.col]?.color).toBe(
            state.playerColor,
          )
        }
      }
    }
  })

  it('güvenli işaretlenen hamle o turda asla can kaybettirmez', () => {
    // Oyunun oyuncuya verdiği asıl söz bu: güvenli sayılan bir kareye inip
    // hemen ardından yenmek ya da tahtadan düşmek mümkün olmamalı.
    for (let round = 0; round < 25; round++) {
      let state = createGame({ playerColor: round % 2 === 0 ? 'w' : 'b', cols: 4 + (round % 5) })

      for (let turn = 0; turn < 80 && state.status === 'playing'; turn++) {
        const options = safeMoves(state)
        if (options.length === 0) break

        const livesBefore = state.lives
        state = playerMove(state, options[Math.floor(Math.random() * options.length)])

        expect(state.lives).toBeGreaterThanOrEqual(livesBefore)
      }
    }
  })
})
