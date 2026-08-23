import {
  DIFFICULTY,
  OPENING_SAFE_ROWS,
  ROWS,
  SPAWN_WEIGHTS,
  START_PIECE,
  clampCols,
} from './config'
import { type Rng, below, pick, shuffled, systemRng } from './random'
import type { Board, Cell, Color, Piece, PieceType, Pos, Row } from './types'

let nextId = 1

export function newId(): number {
  return nextId++
}

/** Tahta genişliği artık sabit değil - her zaman tahtanın kendisinden okunur */
export function colsOf(board: Board): number {
  return board[0].cells.length
}

export function makePiece(type: PieceType, color: Color): Piece {
  return { id: newId(), type, color }
}

export function emptyRow(cols: number): Row {
  return { id: newId(), cells: new Array<Cell>(cols).fill(null) }
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => ({ id: row.id, cells: [...row.cells] }))
}

function weightedType(rng: Rng): PieceType {
  const total = SPAWN_WEIGHTS.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng() * total
  for (const [type, weight] of SPAWN_WEIGHTS) {
    roll -= weight
    if (roll <= 0) return type
  }
  return 'p'
}

export interface SpawnOptions {
  cols: number
  /** Beklenen taş sayısı: 0.75 → satırların %75'inde bir taş */
  pieces: number
  enemyColor: Color
  withKing?: boolean
  /** Bu sütuna kesin bir piyon koy - oyuncuya ilk avını garantilemek için */
  baitCol?: number | null
  rng?: Rng
}

/**
 * Beklenen değerden gerçek adet: tam kısmı garanti, kesir kısmı olasılık.
 * 0.75 → %75 ihtimalle 1 taş; 1.5 → 1 taş kesin, ikincisi %50.
 */
function rollCount(rng: Rng, expected: number): number {
  const whole = Math.floor(expected)
  return whole + (rng() < expected - whole ? 1 : 0)
}

/** Üstten eklenecek yeni satırı üretir */
export function spawnRow({
  cols,
  pieces,
  enemyColor,
  withKing,
  baitCol,
  rng = systemRng,
}: SpawnOptions): Row {
  const row = emptyRow(cols)
  const columns = shuffled(rng, Array.from({ length: cols }, (_, i) => i))
  const count = Math.min(cols, rollCount(rng, pieces))

  for (let i = 0; i < count; i++) {
    row.cells[columns[i]] = makePiece(weightedType(rng), enemyColor)
  }

  if (baitCol != null && baitCol >= 0 && baitCol < cols) {
    row.cells[baitCol] = makePiece('p', enemyColor)
  }

  if (withKing) {
    row.cells[below(rng, cols)] = makePiece('k', enemyColor)
  }

  return row
}

export function findPiece(board: Board, match: (p: Piece) => boolean): Pos | null {
  const cols = colsOf(board)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const piece = board[row].cells[col]
      if (piece && match(piece)) return { row, col }
    }
  }
  return null
}

export function findKing(board: Board, enemyColor: Color): Pos | null {
  return findPiece(board, (p) => p.type === 'k' && p.color === enemyColor)
}

/**
 * Klasik modda şah her zaman tahtada olmalı: yendiğinde ya da alttan
 * silindiğinde en üst satırdaki boş bir kareye yenisi doğar.
 * (Şah Kaçışı modunda rakip şahı yok - oyuncunun kendisi şah.)
 */
export function ensureKing(board: Board, enemyColor: Color, rng: Rng = systemRng): void {
  if (findKing(board, enemyColor)) return

  const cols = colsOf(board)
  const free: number[] = []
  for (let col = 0; col < cols; col++) {
    if (!board[0].cells[col]) free.push(col)
  }

  const col = free.length > 0 ? pick(rng, free) : below(rng, cols)
  board[0].cells[col] = makePiece('k', enemyColor)
}

export interface CreateBoardOptions {
  playerColor: Color
  cols: number
  /** Oyuncunun başlangıç taşı - Şah Kaçışı'nda şah */
  playerPiece?: PieceType
  /** Rakip şahı tahtaya konsun mu (klasik mod) */
  withKing?: boolean
  /**
   * Oyuncunun açılış satırı. Üçlü bunu yukarı çekiyor: kadro dipte
   * doğduğunda oynanmayan iki taş daha ilk turlarda tahtadan düşüyor,
   * oyuncunun onları kurtaracak sırası hiç gelmiyor.
   */
  playerRow?: number
  /** Açılış satırlarının yoğunluğu - modun eğri tabanı (createGame geçirir) */
  openingPieces?: number
  rng?: Rng
}

/** Oyunun açılış tahtası: altta tek taş, üstte seyrek düşmanlar */
export function createBoard({
  playerColor,
  cols: requestedCols,
  playerPiece = START_PIECE,
  withKing = true,
  playerRow = ROWS - 2,
  openingPieces = DIFFICULTY.classic.base,
  rng = systemRng,
}: CreateBoardOptions): { board: Board; player: Pos } {
  const cols = clampCols(requestedCols)
  const enemyColor: Color = playerColor === 'w' ? 'b' : 'w'
  const player: Pos = { row: playerRow, col: Math.floor(cols / 2) }
  const board: Board = []

  for (let row = 0; row < ROWS; row++) {
    // Oyuncunun çevresinde nefes alacak boş bir bölge bırak
    const nearPlayer = row > player.row - OPENING_SAFE_ROWS
    board.push(
      nearPlayer
        ? emptyRow(cols)
        : spawnRow({ cols, pieces: openingPieces, enemyColor, rng }),
    )
  }

  if (withKing) ensureKing(board, enemyColor, rng)
  board[player.row].cells[player.col] = makePiece(playerPiece, playerColor)

  return { board, player }
}

/** Satranç tahtasında iki kare arası mesafe - moves.ts'e bağımlı kalmamak için burada */
function distance(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col))
}

export interface RefreshOptions {
  cols: number
  /** Satır başına beklenen taş sayısı */
  pieces: number
  enemyColor: Color
  player: Pos
  playerPiece: Piece
  /** Oyuncunun çevresinde boş bırakılan yarıçap (sıkışmada 0) */
  safeRadius?: number
  /** Rakip şahı yeni tahtaya konsun mu */
  withKing?: boolean
  rng?: Rng
}

/**
 * Tahtayı baştan kurar: şah yendiğinde çağrılır.
 *
 * Kazanılan can aynı turda geri alınmamalı - bu yüzden oyuncunun çevresi
 * temizlenir, yeni şah uzağa konur ve en alt satırdaki oyuncu bir yukarı
 * alınır (orada kalsa bir sonraki kaymada zaten düşerdi).
 */
export function refreshBoard({
  cols,
  pieces,
  enemyColor,
  player,
  playerPiece,
  safeRadius = 2,
  withKing = true,
  rng = systemRng,
}: RefreshOptions): { board: Board; player: Pos } {
  const board: Board = []
  for (let row = 0; row < ROWS; row++) {
    board.push(spawnRow({ cols, pieces, enemyColor, rng }))
  }

  const at: Pos = player.row >= ROWS - 1 ? { row: ROWS - 2, col: player.col } : player

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      if (distance({ row, col }, at) <= safeRadius) board[row].cells[col] = null
    }
  }

  board[at.row].cells[at.col] = playerPiece
  if (withKing) placeFreshKing(board, enemyColor, at, Math.max(safeRadius, 2), rng)

  return { board, player: at }
}

/**
 * Oyuncunun bitişiğindeki sekiz kareyi boşaltır.
 *
 * Sıkışma sonrası son çare: yeniden dizilen tahtada oyuncu yine hamlesiz
 * kalırsa kurtuluş kurtarmamış olur. Bitişik kareler boşalınca her taş
 * tipinin en az bir hamlesi doğar.
 */
export function clearAround(board: Board, at: Pos): void {
  const cols = colsOf(board)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      if (row === at.row && col === at.col) continue
      if (distance({ row, col }, at) <= 1) board[row].cells[col] = null
    }
  }
}

/** Yeni şah oyuncudan uzağa, tercihen üst satırlara konur */
function placeFreshKing(
  board: Board,
  enemyColor: Color,
  player: Pos,
  safeRadius: number,
  rng: Rng,
): void {
  const cols = colsOf(board)
  const top: Pos[] = []
  const rest: Pos[] = []

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      if (board[row].cells[col]) continue
      const pos = { row, col }
      if (distance(pos, player) <= safeRadius) continue
      if (row <= 2) top.push(pos)
      else rest.push(pos)
    }
  }

  const pool = top.length > 0 ? top : rest
  if (pool.length === 0) {
    ensureKing(board, enemyColor, rng)
    return
  }

  const pos = pick(rng, pool)
  board[pos.row].cells[pos.col] = makePiece('k', enemyColor)
}

export interface ScrollOptions extends Omit<SpawnOptions, 'withKing' | 'cols'> {
  player: Pos
  /** Klasik modda tahtada şah kalmasını garantiler */
  keepKing?: boolean
}

/**
 * Tahtayı bir satır ilerletir: üste yeni satır, en alttaki satır silinir.
 * Silinen satırda kalan her taş (oyuncu dahil) tahtadan düşer.
 */
export function scrollBoard(
  board: Board,
  options: ScrollOptions,
): { board: Board; player: Pos; playerFellOff: boolean } {
  const { player, keepKing = true, rng = systemRng, ...spawn } = options
  const playerFellOff = player.row === ROWS - 1

  const next = cloneBoard(board)
  next.pop() // en alt satır silinir
  next.unshift(spawnRow({ ...spawn, rng, cols: colsOf(board) }))
  if (keepKing) ensureKing(next, spawn.enemyColor, rng)

  return {
    board: next,
    player: { row: player.row + 1, col: player.col },
    playerFellOff,
  }
}

/**
 * Oyuncunun can kaybından sonra yeniden doğacağı kare.
 * En alt satır bilerek dışarıda: orada doğmak bir sonraki kaymada
 * anında ikinci bir can kaybı demek olurdu.
 */
export function respawnSquare(
  board: Board,
  threatened: Set<string>,
  rng: Rng = systemRng,
): Pos {
  const cols = colsOf(board)
  const candidates: Pos[] = []
  for (let row = ROWS - 2; row >= ROWS - 4 && row >= 0; row--) {
    for (let col = 0; col < cols; col++) {
      if (board[row].cells[col]) continue
      candidates.push({ row, col })
    }
  }

  const safe = candidates.filter((pos) => !threatened.has(`${pos.row},${pos.col}`))
  const pool = safe.length > 0 ? safe : candidates

  if (pool.length === 0) {
    // Son çare: alt sıralarda şah olmayan bir taşı ez
    for (let row = ROWS - 2; row >= 0; row--) {
      for (let col = 0; col < cols; col++) {
        if (board[row].cells[col]?.type === 'k') continue
        board[row].cells[col] = null
        return { row, col }
      }
    }
  }

  return pick(rng, pool)
}

/* ------------------------------------------------------------------ *
 * Üçlü - kadro yerleşimi
 * ------------------------------------------------------------------ */

/** Bir karenin *görünen* rengi. Tahta kayarken satır arttığı için
 *  ham (row+col) pariteti her turda dönüyor; distance onu geri çeviriyor. */
export function squareShade(distance: number, pos: Pos): number {
  return (distance + pos.row + pos.col) % 2
}

/**
 * Açılışta kadronun geri kalanını yerleştirir.
 *
 * Aynı satıra dizmiyoruz: üç taş tek sırada dururken ilk kaymada üçü
 * birden aynı anda dibe yaklaşıyor ve oyuncu daha ilk turda seçim
 * yapamadan sıkışıyor. Farklı satırlara dağılınca sıraları da dağılıyor.
 */
export function placeSquadmates(
  board: Board,
  playerColor: Color,
  anchor: Pos,
  types: PieceType[],
  rng: Rng = systemRng,
): Pos[] {
  const cols = colsOf(board)
  const spots: Pos[] = []

  // Çapanın bir üstü, kendi satırı ve bir altı: kadro aynı satıra dizilirse
  // üçü birden aynı anda dibe iniyor ve oyuncu sırayla kurtaramıyor
  for (const row of [anchor.row - 1, anchor.row, anchor.row + 1]) {
    if (row < 0 || row >= ROWS) continue
    for (let col = 0; col < cols; col++) {
      if (row === anchor.row && col === anchor.col) continue
      if (board[row].cells[col]) continue
      spots.push({ row, col })
    }
  }

  const placed: Pos[] = []
  const pool = shuffled(rng, spots)

  for (const type of types) {
    // Kadro birbirinin üstüne yığılmasın: önce uzak kareler denenir
    const pick = pool.find(
      (pos) => !placed.some((other) => distance(other, pos) <= 1) && distance(pos, anchor) > 1,
    )
    const spot = pick ?? pool.find((pos) => !board[pos.row].cells[pos.col])
    if (!spot) continue

    board[spot.row].cells[spot.col] = makePiece(type, playerColor)
    placed.push(spot)
  }

  return placed
}

/**
 * Kadroya katılacak taş için boş kare.
 *
 * Sırayla: vurulmayan ve istenen renkte bir kare → vurulmayan herhangi bir
 * kare → herhangi bir boş kare. En alt satır hiç denenmiyor: oraya doğan
 * taş bir sonraki kaymada anında düşerdi.
 */
export function freeSquareFor(
  board: Board,
  threatened: Set<string>,
  distanceNow: number,
  shade: number | null,
  rng: Rng = systemRng,
): Pos | null {
  const cols = colsOf(board)
  const open: Pos[] = []

  for (let row = ROWS - 2; row >= 0; row--) {
    for (let col = 0; col < cols; col++) {
      if (board[row].cells[col]) continue
      open.push({ row, col })
    }
  }

  if (open.length === 0) return null

  const safe = open.filter((pos) => !threatened.has(`${pos.row},${pos.col}`))
  const shaded = shade == null ? [] : safe.filter((pos) => squareShade(distanceNow, pos) === shade)

  const pool = shaded.length > 0 ? shaded : safe.length > 0 ? safe : open
  return pick(rng, pool)
}
