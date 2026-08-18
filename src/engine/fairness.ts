import { cloneBoard, colsOf } from './board'
import { ROWS } from './config'
import { attackSquares, enemyThreats, key, pseudoMoves, samePos } from './moves'
import type { Board, Color, GameState, Pos } from './types'

/**
 * Bir hamlenin ardından oyuncunun yenip yenmeyeceği.
 *
 * İki tehlike birden ölçülür:
 *  1. Hamleden *sonraki* konumda rakip taşların vurduğu kareler - hamle öncesi
 *     tehdit haritası yanıltıcı olur, çünkü oyuncunun terk ettiği kare
 *     kapalı bir hattı açabilir.
 *  2. En alt satır: kayma hemen hamlenin ardından geldiği için oraya inmek
 *     doğrudan tahtadan düşmek demektir.
 *
 * Kayma bu ölçümü bozmaz: tüm taşlar birlikte bir satır indiği için aradaki
 * geometri korunur. Kaymayla doğan yeni tehditler ayrıca temizleniyor
 * (bkz. applyScroll).
 */
export function isSafeLanding(state: GameState, to: Pos): boolean {
  if (to.row === ROWS - 1) return false

  const board = simulateMove(state, to)
  if (!board) return false

  return !enemyThreats(board, state.playerColor, state.enemyColor).has(key(to))
}

/**
 * Oyuncunun hamlesini uygulanmış gibi gösteren geçici tahta.
 *
 * Tehlike her zaman hamleden *sonraki* tahtada ölçülmeli: oyuncu bir kareyi
 * terk ettiğinde arkasındaki kalenin hattı açılır ve gittiği kare aniden
 * vurulur hale gelir. Hamle öncesi tahtaya bakan her hesap bu ölümü kaçırır.
 */
export function simulateMove(state: GameState, to: Pos): Board | null {
  const from = state.player
  const piece = state.board[from.row].cells[from.col]
  if (!piece) return null

  const board = cloneBoard(state.board)
  board[from.row].cells[from.col] = null
  board[to.row].cells[to.col] = piece
  return board
}

/** Oyuncunun ölmeden oynayabileceği hamleler */
export function safeMoves(state: GameState): Pos[] {
  if (state.status !== 'playing') return []
  return pseudoMoves(state.board, state.player, state.playerColor).filter((to) =>
    isSafeLanding(state, to),
  )
}

/**
 * Vurulmayan kareler - Şah Kaçışı'nda hamle *kuralı* bu.
 *
 * `safeMoves`'tan farkı en alt satır: gerçek satrançta oraya inmek yasak
 * değil, sadece ölümcül. Şah Kaçışı'nda bunu bilerek serbest bırakıyoruz;
 * "bir tur daha kazanmak için dibe basmak" oyuncunun alabileceği bir risk.
 */
export function unattackedMoves(state: GameState): Pos[] {
  if (state.status !== 'playing') return []

  return pseudoMoves(state.board, state.player, state.playerColor).filter((to) => {
    const board = simulateMove(state, to)
    if (!board) return false
    return !enemyThreats(board, state.playerColor, state.enemyColor).has(key(to))
  })
}

/**
 * Bir kareyi vuran düşman taşları, kimlikleriyle birlikte.
 * Kayma sonrası "bu tehdit yeni mi doğdu" karşılaştırması buna dayanıyor.
 */
export function attackersOf(
  board: Board,
  target: Pos,
  playerColor: Color,
  enemyColor: Color,
): Map<number, Pos> {
  const cols = colsOf(board)
  const attackers = new Map<number, Pos>()

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const piece = board[row].cells[col]
      if (!piece || piece.color !== enemyColor) continue

      const pos = { row, col }
      if (attackSquares(board, pos, playerColor).some((sq) => samePos(sq, target))) {
        attackers.set(piece.id, pos)
      }
    }
  }

  return attackers
}

/**
 * Beklemek (hamleyi atlamak) güvenli mi?
 * Beklemenin bedeli bir satır geri düşmek; en alt satırdayken beklemek
 * doğrudan tahtadan düşmek demek.
 */
export function isSafeWait(state: GameState): boolean {
  if (state.status !== 'playing') return false
  if (state.player.row >= ROWS - 1) return false
  return attackersOf(state.board, state.player, state.playerColor, state.enemyColor).size === 0
}
