import { describe, expect, it } from 'vitest'
import { emptyRow, makePiece } from './board'
import { PIECE_VALUE, ROWS } from './config'
import {
  DAILY_BOOST_FACTOR,
  DAILY_COLS,
  DAILY_FINAL_MS,
  DAILY_KING_GAP_ROWS,
  DAILY_OPENING_ROWS,
  DAILY_QUEEN_CAPTURES,
  DAILY_SCORE_FACTOR,
  DAILY_START_MS,
  type DailyState,
  applyDailyMove,
  applyDailyScroll,
  createDaily,
  dailyIntervalMs,
  dailyLevel,
  dailyMoves,
  dailySpeedCaptures,
  dailyStriker,
  hasKing,
  hasSafeExit,
  openingIsFair,
  rescueEntryRow,
  rowIndexAt,
  spawnDailyRow,
} from './daily'
import type { Board, PieceType, Pos } from './types'

/** Boş tahta + istenen taşlar; oyuncu (row,col)'da `type` olarak */
function setup(
  player: Pos,
  type: PieceType,
  enemies: Array<[number, number, PieceType]>,
  extra: Partial<DailyState> = {},
): DailyState {
  const state = createDaily({ seed: 1 })
  const board: Board = Array.from({ length: ROWS }, () => emptyRow(DAILY_COLS))
  board[player.row].cells[player.col] = makePiece(type, 'w')
  for (const [row, col, kind] of enemies) board[row].cells[col] = makePiece(kind, 'b')
  return {
    ...state,
    board,
    incoming: emptyRow(DAILY_COLS),
    player,
    playerType: type,
    chain: [type],
    ...extra,
  }
}

describe('günlük mücadele - kuruluş', () => {
  it('sekiz sütun, atla başlar, alt satırlar boş', () => {
    const state = createDaily({ seed: 42 })
    expect(state.board[0].cells).toHaveLength(DAILY_COLS)
    expect(state.playerType).toBe('n')
    for (let r = ROWS - DAILY_OPENING_ROWS; r < ROWS; r++) {
      const pieces = state.board[r].cells.filter((c) => c && c.color === 'b')
      expect(pieces).toHaveLength(0)
    }
  })

  it('aynı tohum aynı tahtayı üretir; farklı tohum farklı', () => {
    const a = createDaily({ seed: 7 })
    const b = createDaily({ seed: 7 })
    const c = createDaily({ seed: 8 })
    const shape = (s: DailyState) =>
      s.board.map((row) => row.cells.map((cell) => cell?.type ?? '.').join('')).join('/')
    expect(shape(a)).toBe(shape(b))
    expect(shape(a)).not.toBe(shape(c))
  })

  it('satır üretimi yalnızca (tohum, indeks)e bağlı - piyon ve vezir yok', () => {
    for (let index = 0; index < 400; index++) {
      const row = spawnDailyRow(99, index, 'b')
      const again = spawnDailyRow(99, index, 'b')
      expect(row.cells.map((c) => c?.type)).toEqual(again.cells.map((c) => c?.type))
      for (const cell of row.cells) {
        if (cell) expect(['n', 'b', 'r', 'k']).toContain(cell.type)
      }
    }
  })

  it('açılışta tam bir şah var; yenince sıradaki satırlardan biri yenisini getirir', () => {
    const state = createDaily({ seed: 5 })
    const kings = state.board.flatMap((row) => row.cells.filter((c) => c?.type === 'k'))
    expect(kings).toHaveLength(1)
    // Şahı tahtadan kaldır (yenmiş gibi) → şah gelene kadar kaydır
    // Oyuncuyu üst satıra al ki kaymalar düşüşle bitmesin
    let next = {
      ...state,
      player: { row: 0, col: 0 },
      board: state.board.map((row) => ({ ...row, cells: row.cells.map((c) => (c?.type === 'k' ? null : c)) })),
    }
    expect(hasKing(next.board, 'b')).toBe(false)
    let steps = 0
    while (!hasKing(next.board, 'b') && steps < DAILY_KING_GAP_ROWS + 3) {
      next = applyDailyScroll(next)
      steps++
    }
    expect(hasKing(next.board, 'b')).toBe(true)
    // Bekleme: en az GAP kayma şahsız, sonra bir satır sonra tahtada
    expect(steps).toBeGreaterThanOrEqual(DAILY_KING_GAP_ROWS)
    expect(steps).toBeLessThanOrEqual(DAILY_KING_GAP_ROWS + 2)
    // Tek şah
    const kingsAfter = next.board.flatMap((row) => row.cells.filter((c) => c?.type === 'k'))
    expect(kingsAfter).toHaveLength(1)
  })

  it('kayınca giren satır tahtaya oturur, indeksler kayar, oyuncu bir satır iner', () => {
    const state = createDaily({ seed: 3 })
    const incomingShape = state.incoming.cells.map((c) => c?.type ?? '.').join('')
    const next = applyDailyScroll(state)
    expect(next.board[0].cells.map((c) => c?.type ?? '.').join('')).toBe(incomingShape)
    expect(next.player.row).toBe(state.player.row + 1)
    expect(next.distance).toBe(1)
    expect(next.spawned).toBe(state.spawned + 1)
    expect(rowIndexAt(next, 0)).toBe(rowIndexAt(state, 0) + 1)
    expect(next.score).toBe(DAILY_SCORE_FACTOR)
  })

  it('açılış her tohumda adil: güvenli hamle + güvenli devam var', () => {
    for (let seed = 1; seed <= 300; seed++) {
      expect(openingIsFair(createDaily({ seed })), `tohum ${seed}`).toBe(true)
    }
  })

  it('en alt satırdayken kayma = düşüş', () => {
    const state = setup({ row: ROWS - 1, col: 3 }, 'n', [])
    const next = applyDailyScroll(state)
    expect(next.status).toBe('gameover')
    expect(next.endReason).toBe('fellOff')
  })
})

describe('günlük mücadele - hamle', () => {
  it('en alt satır oynanabilir, güvenlik süzülmez', () => {
    const state = setup({ row: 5, col: 3 }, 'r', [[6, 0, 'r']])
    const moves = dailyMoves(state)
    // Kale aşağı 6 ve 7'ye inebilir; 6. satır rakip kalenin hattında ama süzülmüyor
    expect(moves.some((m) => m.row === ROWS - 1 && m.col === 3)).toBe(true)
    expect(moves.some((m) => m.row === 6 && m.col === 3)).toBe(true)
  })

  it('korunmayan taşı yemek: puan + dönüşüm + zincir', () => {
    const state = setup({ row: 6, col: 3 }, 'n', [[4, 4, 'b']])
    const next = applyDailyMove(state, { row: 4, col: 4 })
    expect(next.status).toBe('playing')
    expect(next.playerType).toBe('b')
    expect(next.captures).toBe(1)
    expect(next.combo).toBe(1)
    expect(next.score).toBe(PIECE_VALUE.b * DAILY_SCORE_FACTOR)
    expect(next.chain).toEqual(['n', 'b'])
  })

  it('korunan taşı yemek koşuyu bitirir', () => {
    // b(4,4) fil; onu koruyan kale (4,0) aynı satırda, arası boş
    const state = setup({ row: 6, col: 3 }, 'n', [
      [4, 4, 'b'],
      [4, 0, 'r'],
    ])
    const next = applyDailyMove(state, { row: 4, col: 4 })
    expect(next.status).toBe('gameover')
    expect(next.endReason).toBe('captured')
  })

  it('vurulan BOŞ kareye inmek de koşuyu bitirir; vuran taş bulunur', () => {
    const state = setup({ row: 6, col: 3 }, 'n', [[4, 0, 'r']])
    const next = applyDailyMove(state, { row: 4, col: 4 })
    expect(next.board[4].cells[4]?.type).toBe('n')
    expect(next.status).toBe('gameover')
    expect(dailyStriker(next)).toEqual({ row: 4, col: 0 })
  })

  it('koruma yeme SONRASI ölçülür: yenen taş kapalı hattı açar', () => {
    // Kale (2,4) dikey hatta; fil (3,4) hattı kapatıyor; at (4,4) hedef.
    // Fili değil atı yiyorsak: at (4,4) fil tarafından mı korunuyor? Hayır.
    // Ama kale (2,4) → (3,4) dolu → (4,4) korunmaz. Şimdi tersi:
    // hedef fil (3,4); yenince kale hattı (3,4)'e açık → korunuyor.
    const state = setup({ row: 5, col: 3 }, 'n', [
      [2, 4, 'r'],
      [3, 4, 'b'],
    ])
    const next = applyDailyMove(state, { row: 3, col: 4 })
    expect(next.status).toBe('gameover')
  })

  it('zincir çarpanı: art arda yeme büyür, boş hamle sıfırlar', () => {
    // (4,4) at: kale (2,3) onu vurmuyor; sonra kale yenir (at (4,4) artık yok)
    const state = setup({ row: 6, col: 3 }, 'n', [
      [4, 4, 'n'],
      [2, 3, 'r'],
    ])
    const one = applyDailyMove(state, { row: 4, col: 4 })
    expect(one.status).toBe('playing')
    const two = applyDailyMove(one, { row: 2, col: 3 })
    expect(two.combo).toBe(2)
    expect(two.playerType).toBe('r')
    expect(two.score - one.score).toBe(PIECE_VALUE.r * DAILY_SCORE_FACTOR * 2)
    const idle = applyDailyMove(two, { row: 2, col: 0 })
    expect(idle.combo).toBe(0)
    expect(idle.status).toBe('playing')
  })

  it('hız eğrisi: 5 sn/kare ile başlar, 100 yemede 1 sn/kareye iner', () => {
    expect(dailyIntervalMs(0)).toBeCloseTo(DAILY_START_MS, 6)
    expect(dailyIntervalMs(4)).toBeCloseTo(DAILY_START_MS, 6)
    expect(dailyIntervalMs(5)).toBeLessThan(DAILY_START_MS)
    expect(dailyIntervalMs(100)).toBeCloseTo(DAILY_FINAL_MS, 6)
    expect(dailyIntervalMs(500)).toBeCloseTo(DAILY_FINAL_MS, 6)
    // her tık aynı oranda
    const r1 = dailyIntervalMs(0) / dailyIntervalMs(5)
    const r2 = dailyIntervalMs(50) / dailyIntervalMs(55)
    expect(r1).toBeCloseTo(r2, 9)
    expect(dailyLevel(0)).toBe(1)
    expect(dailyLevel(100)).toBe(21)
  })

  it('ilk 10 saniyeden sonra hızlanma iki kat: boostAt sonrası her yeme iki sayılır', () => {
    expect(dailySpeedCaptures(12, null)).toBe(12)
    expect(dailySpeedCaptures(4, 4)).toBe(4)
    expect(dailySpeedCaptures(9, 4)).toBe(4 + 5 * DAILY_BOOST_FACTOR)
    // boostAt sonrası tık 2,5 yemede bir: 5 yeme iki tık
    expect(dailyLevel(dailySpeedCaptures(10, 0))).toBe(5)
    expect(dailyIntervalMs(dailySpeedCaptures(50, 0))).toBeCloseTo(DAILY_FINAL_MS, 6)
  })
})

describe('günlük mücadele - vezir (mantar) kuralı', () => {
  it('şahı at ile yiyince vezir olur, at hatırlanır', () => {
    const state = setup({ row: 6, col: 3 }, 'n', [[4, 4, 'k']])
    const next = applyDailyMove(state, { row: 4, col: 4 })
    expect(next.status).toBe('playing')
    expect(next.playerType).toBe('q')
    expect(next.base).toBe('n')
    expect(next.kings).toBe(1)
    expect(next.events.some((e) => e.kind === 'promote')).toBe(true)
  })

  it('KORUNAN şahı yemek de güvenli: vezir olursun, mantar durur', () => {
    // şah (4,4), onu koruyan kale (4,0)
    const state = setup({ row: 6, col: 3 }, 'n', [
      [4, 4, 'k'],
      [4, 0, 'r'],
    ])
    const next = applyDailyMove(state, { row: 4, col: 4 })
    expect(next.status).toBe('playing')
    expect(next.playerType).toBe('q')
    expect(next.base).toBe('n')
    expect(next.events.some((e) => e.kind === 'shrink')).toBe(false)
    // Sonraki vuruş mantarı götürür ama öldürmez
    const hit = applyDailyMove(next, { row: 4, col: 1 })
    expect(hit.status).toBe('playing')
    expect(hit.playerType).toBe('n')
  })

  it('vezirken yeme dönüşüm vermez, sayaç iner; dolunca eski taşa döner', () => {
    const state = setup({ row: 6, col: 3 }, 'q', [[3, 3, 'r']], { base: 'n', queenLeft: DAILY_QUEEN_CAPTURES })
    const next = applyDailyMove(state, { row: 3, col: 3 })
    expect(next.playerType).toBe('q')
    expect(next.base).toBe('n')
    expect(next.queenLeft).toBe(DAILY_QUEEN_CAPTURES - 1)
    // Son hak: kale (1,3) yenince süre dolar → at
    const last = { ...next, queenLeft: 1 }
    last.board[1].cells[3] = makePiece('r', 'b')
    const done = applyDailyMove(last, { row: 1, col: 3 })
    expect(done.playerType).toBe('n')
    expect(done.base).toBeNull()
    expect(done.queenLeft).toBe(0)
    expect(done.events.some((e) => e.kind === 'expire' && e.to === 'n')).toBe(true)
    expect(done.status).toBe('playing')
  })

  it('vezirken şah yemek sayacı yeniler', () => {
    const state = setup({ row: 6, col: 3 }, 'q', [[3, 3, 'k']], { base: 'n', queenLeft: 1 })
    const next = applyDailyMove(state, { row: 3, col: 3 })
    expect(next.playerType).toBe('q')
    expect(next.queenLeft).toBe(DAILY_QUEEN_CAPTURES)
  })

  it('vezirken vurulursa ölmez, eski taşına döner', () => {
    // hedef (3,3) kale, onu (3,0)daki kale koruyor
    const state = setup({ row: 6, col: 3 }, 'q', [
      [3, 3, 'r'],
      [3, 0, 'r'],
    ], { base: 'n' })
    const next = applyDailyMove(state, { row: 3, col: 3 })
    expect(next.status).toBe('playing')
    expect(next.playerType).toBe('n')
    expect(next.base).toBeNull()
    expect(next.board[3].cells[3]?.type).toBe('n')
    expect(next.events.some((e) => e.kind === 'shrink' && e.to === 'n')).toBe(true)
    // Vuran kale (3,0) mantarı yedi ve harcandı: tahtadan kalktı
    expect(next.board[3].cells[0]).toBeNull()
    const shrink = next.events.find((e) => e.kind === 'shrink') as { by: Pos | null; piece: PieceType | null }
    expect(shrink.by).toEqual({ row: 3, col: 0 })
    expect(shrink.piece).toBe('r')
    // Mantar gitti: bir sonraki vuruş ölüm - (1,2)ye at hamlesi, (1,0)daki kale vuruyor
    next.board[1].cells[0] = makePiece('r', 'b')
    const again = applyDailyMove(next, { row: 1, col: 2 })
    expect(again.status).toBe('gameover')
  })

  it('vezirken düşmek yine ölüm', () => {
    const state = setup({ row: ROWS - 1, col: 3 }, 'q', [], { base: 'n' })
    expect(applyDailyScroll(state).status).toBe('gameover')
  })
})

describe('günlük mücadele - her yeni satırda en az bir çıkış', () => {
  it('giren satır son çıkışı kapatıyorsa suçlu taş silinir', () => {
    // At (4,4): çıkış kareleri 2,3,5,6. sütunlarda; 0. satırda dört kale hepsini vuruyor
    const state = setup({ row: 4, col: 4 }, 'n', [
      [0, 2, 'r'],
      [0, 3, 'r'],
      [0, 5, 'r'],
      [0, 6, 'r'],
    ])
    expect(hasSafeExit(state.board, state.player, 'w', 'b')).toBe(false)
    const changed = rescueEntryRow(state.board, state.player, 'w', 'b')
    expect(changed).toBe(true)
    expect(hasSafeExit(state.board, state.player, 'w', 'b')).toBe(true)
    const left = state.board[0].cells.filter(Boolean).length
    expect(left).toBe(3)
  })

  it('sebep satır değilse (satırsız da çıkış yoksa) dokunmaz', () => {
    // At (4,4); çıkışları 3./5. satırlardaki kaleler kapatıyor, 0. satırdaki fil masum
    const state = setup({ row: 4, col: 4 }, 'n', [
      [7, 2, 'r'],
      [7, 3, 'r'],
      [7, 5, 'r'],
      [7, 6, 'r'],
      [0, 0, 'b'],
    ])
    expect(hasSafeExit(state.board, state.player, 'w', 'b')).toBe(false)
    expect(rescueEntryRow(state.board, state.player, 'w', 'b')).toBe(false)
    expect(state.board[0].cells[0]?.type).toBe('b')
  })

  it('kayma sırasında devreye girer ve rescue olayı üretir', () => {
    // Oyuncu (3,4) at; giren satır (incoming) dört kale ile tüm çıkışları kapatacak
    const state = setup({ row: 3, col: 4 }, 'n', [])
    const incoming = emptyRow(DAILY_COLS)
    for (const col of [2, 3, 5, 6]) incoming.cells[col] = makePiece('r', 'b')
    const next = applyDailyScroll({ ...state, incoming })
    expect(next.status).toBe('playing')
    expect(next.events.some((e) => e.kind === 'rescue')).toBe(true)
    expect(hasSafeExit(next.board, next.player, 'w', 'b')).toBe(true)
  })
})
