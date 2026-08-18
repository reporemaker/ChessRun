import { colsOf } from './board'
import { ROWS } from './config'
import type { Board, Color, Piece, Pos } from './types'

const KNIGHT_STEPS: ReadonlyArray<[number, number]> = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
]

const ORTHOGONAL: ReadonlyArray<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIAGONAL: ReadonlyArray<[number, number]> = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
const ALL_DIRS = [...ORTHOGONAL, ...DIAGONAL]

/** Genişlik oyun başında seçildiği için sınır her zaman tahtadan okunur */
export function inBounds(board: Board, row: number, col: number): boolean {
  return row >= 0 && row < ROWS && col >= 0 && col < colsOf(board)
}

export function pieceAt(board: Board, row: number, col: number): Piece | null {
  if (!inBounds(board, row, col)) return null
  return board[row].cells[col]
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.row === b.row && a.col === b.col
}

/**
 * Piyonların ilerleme yönü. Tahta yukarı kaydığı için oyuncu yukarı (row-1),
 * düşman aşağı (row+1) doğru ilerler.
 */
export function forwardDir(color: Color, playerColor: Color): number {
  return color === playerColor ? -1 : 1
}

function slide(
  board: Board,
  from: Pos,
  dirs: ReadonlyArray<[number, number]>,
  mover: Color,
  out: Pos[],
): void {
  for (const [dr, dc] of dirs) {
    let row = from.row + dr
    let col = from.col + dc
    while (inBounds(board, row, col)) {
      const occupant = board[row].cells[col]
      if (!occupant) {
        out.push({ row, col })
      } else {
        if (occupant.color !== mover) out.push({ row, col })
        break
      }
      row += dr
      col += dc
    }
  }
}

function step(
  board: Board,
  from: Pos,
  steps: ReadonlyArray<[number, number]>,
  mover: Color,
  out: Pos[],
): void {
  for (const [dr, dc] of steps) {
    const row = from.row + dr
    const col = from.col + dc
    if (!inBounds(board, row, col)) continue
    const occupant = board[row].cells[col]
    if (!occupant || occupant.color !== mover) out.push({ row, col })
  }
}

/**
 * Bir taşın gidebileceği kareler. Şah mat kuralı yok - bu oyunda şah
 * kaybedilecek taş değil, ödül hedefi. Ama şah çekildiğinde rakip
 * savunmak zorunda (bkz. ai.ts).
 */
export function pseudoMoves(board: Board, from: Pos, playerColor: Color): Pos[] {
  const piece = pieceAt(board, from.row, from.col)
  if (!piece) return []

  const out: Pos[] = []

  switch (piece.type) {
    case 'p': {
      const f = forwardDir(piece.color, playerColor)
      const ahead = from.row + f
      // Tek kare ileri, sadece boşsa. Çift adım ve geçerken alma yok.
      if (inBounds(board, ahead, from.col) && !board[ahead].cells[from.col]) {
        out.push({ row: ahead, col: from.col })
      }
      // Çaprazda düşman varsa alır
      for (const dc of [-1, 1]) {
        const col = from.col + dc
        if (!inBounds(board, ahead, col)) continue
        const target = board[ahead].cells[col]
        if (target && target.color !== piece.color) out.push({ row: ahead, col })
      }
      break
    }
    case 'n':
      step(board, from, KNIGHT_STEPS, piece.color, out)
      break
    case 'k':
      step(board, from, ALL_DIRS, piece.color, out)
      break
    case 'b':
      slide(board, from, DIAGONAL, piece.color, out)
      break
    case 'r':
      slide(board, from, ORTHOGONAL, piece.color, out)
      break
    case 'q':
      slide(board, from, ALL_DIRS, piece.color, out)
      break
  }

  return out
}

/**
 * Bir taşın *tehdit ettiği* kareler. pseudoMoves'tan tek farkı piyon:
 * piyon ileri gidebildiği kareyi tehdit etmez, sadece çaprazları tehdit eder.
 */
export function attackSquares(board: Board, from: Pos, playerColor: Color): Pos[] {
  const piece = pieceAt(board, from.row, from.col)
  if (!piece) return []

  if (piece.type === 'p') {
    const f = forwardDir(piece.color, playerColor)
    const out: Pos[] = []
    for (const dc of [-1, 1]) {
      const row = from.row + f
      const col = from.col + dc
      if (inBounds(board, row, col)) out.push({ row, col })
    }
    return out
  }

  return pseudoMoves(board, from, playerColor)
}

/** Düşmanın vurabildiği tüm kareler */
export function enemyThreats(board: Board, playerColor: Color, enemyColor: Color): Set<string> {
  const cols = colsOf(board)
  const threats = new Set<string>()
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const piece = board[row].cells[col]
      if (!piece || piece.color !== enemyColor) continue
      for (const pos of attackSquares(board, { row, col }, playerColor)) {
        threats.add(key(pos))
      }
    }
  }
  return threats
}

/** Oyuncunun taşı rakip şahı vuruyor mu? Vuruyorsa rakip savunmak zorunda. */
export function kingInCheck(
  board: Board,
  player: Pos,
  playerColor: Color,
  enemyColor: Color,
): Pos | null {
  const cols = colsOf(board)
  let king: Pos | null = null

  for (let row = 0; row < ROWS && !king; row++) {
    for (let col = 0; col < cols; col++) {
      const piece = board[row].cells[col]
      if (piece?.type === 'k' && piece.color === enemyColor) {
        king = { row, col }
        break
      }
    }
  }
  if (!king) return null

  const attacked = attackSquares(board, player, playerColor).some((pos) => samePos(pos, king))
  return attacked ? king : null
}

export function key(pos: Pos): string {
  return `${pos.row},${pos.col}`
}

/** Satranç tahtasında iki kare arası mesafe (kral mesafesi) */
export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col))
}
