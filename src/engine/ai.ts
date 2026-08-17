import { colsOf } from './board'
import { PIECE_VALUE, ROWS } from './config'
import { attackSquares, chebyshev, kingInCheck, pseudoMoves, samePos } from './moves'
import { type Rng, pick, systemRng } from './random'
import type { Board, Color, Pos } from './types'

export interface EnemyMove {
  from: Pos
  to: Pos
  /** Yenen oyuncu taşının kadro içindeki sırası — hiçbiri yenmiyorsa null */
  capturedIndex: number | null
}

/** Puanlama ağırlıkları — rakibin ne kadar agresif oynadığını buradan ayarla */
const SCORE_CAPTURE_PLAYER = 1000
const SCORE_SETS_UP_THREAT = 50
const SCORE_KING_FLEES = 30
const KING_PANIC_RADIUS = 3

/**
 * Korunan taşı yemenin cezası.
 *
 * Üçlüde oyuncunun asıl savunması taşlarının birbirini kollaması. Rakip
 * bunu hiç hesaba katmazsa oyuncunun kurduğu savunma hiçbir işe yaramıyor
 * ve kadro kuramı çöküyor; ceza yeterince büyük ki korunmasız bir taş
 * varken rakip korunanı seçmesin, ama yasak da değil — bedelini ödemeyi
 * göze alabilir.
 */
const SCORE_DEFENDED_TARGET = -400

/**
 * Rakip her turda tek bir taş oynar.
 *
 * Şah çekildiyse gerçek satrançtaki gibi başka hiçbir şey yapamaz: sadece
 * şahı kurtaran hamleler oynanabilir — şahı kaçırmak, çeken taşı (yani
 * oyuncuyu) yemek ya da araya girip hattı kapatmak. Hiçbiri mümkün değilse
 * mat olmuştur: şahı kurtarmak yerine başka bir taşını rastgele oynar —
 * kaçınılmaz sonu beklerken donup kalmaz.
 *
 * Şah çekilmediğinde öncelik sırası:
 *   1. Oyuncu taşı yiyebiliyorsa yer (en ucuz taşla, ve önce korunmasız olanı)
 *   2. Şah, oyuncu yaklaştığında kaçar
 *   3. Diğer taşlar en yakın oyuncu taşına yaklaşır, mümkünse onu tehdit eder
 *
 * Oyuncu tarafı bir liste: Av ve Kaçış'ta tek elemanlı, Üçlü'de kadronun
 * tamamı. Rakip böylece üç taşı birden görüyor, sadece seçili olanı değil.
 */
export function chooseEnemyMove(
  board: Board,
  players: Pos[],
  playerColor: Color,
  enemyColor: Color,
  rng: Rng = systemRng,
): EnemyMove | null {
  if (players.length === 0) return null

  const cols = colsOf(board)
  const checkedKing = checkedBySquad(board, players, playerColor, enemyColor)

  /** Bir kare hangi oyuncu taşını yiyor? */
  const targetIndex = (to: Pos): number | null => {
    const index = players.findIndex((pos) => samePos(pos, to))
    return index < 0 ? null : index
  }

  /** En yakın oyuncu taşına uzaklık — rakip kadroyu topluca sıkıştırır */
  const nearest = (pos: Pos): number =>
    players.reduce((best, target) => Math.min(best, chebyshev(pos, target)), Infinity)

  let best: EnemyMove | null = null
  let bestScore = -Infinity

  // Mat durumunda oynanacak hamleler: şahı kurtarmıyorlar ama rakip
  // hiç oynamadan beklemesin diye saklanıyorlar
  const doomed: EnemyMove[] = []
  const doomedKing: EnemyMove[] = []

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const piece = board[row].cells[col]
      if (!piece || piece.color !== enemyColor) continue

      const from: Pos = { row, col }

      for (const to of pseudoMoves(board, from, playerColor)) {
        const capturedIndex = targetIndex(to)

        // Şah altındayken şahı kurtarmayan her hamle yasak
        if (checkedKing && !savesKing(board, from, to, checkedKing, players, playerColor)) {
          const move = { from, to, capturedIndex }
          if (piece.type === 'k') doomedKing.push(move)
          else doomed.push(move)
          continue
        }

        let score: number

        if (capturedIndex != null) {
          // Ucuz taşla yemeyi tercih et: değerli taşlar tahtada kalsın
          score = SCORE_CAPTURE_PLAYER - PIECE_VALUE[piece.type]
          // Korunmasız hedef önce: kadronun birbirini kollaması işe yarasın
          if (isDefended(board, to, players, playerColor)) score += SCORE_DEFENDED_TARGET
        } else if (piece.type === 'k') {
          const before = nearest(from)
          const after = nearest(to)
          score = before <= KING_PANIC_RADIUS && after > before ? SCORE_KING_FLEES : -50
        } else {
          // Yaklaşmak iyi; bir oyuncu taşını vurabilecek kareye geçmek daha iyi
          score = -nearest(to)
          if (threatensAfterMove(board, from, to, players, playerColor)) {
            score += SCORE_SETS_UP_THREAT
          }
        }

        score += rng() // beraberlikleri boz, oyun ezberlenmesin

        if (score > bestScore) {
          bestScore = score
          best = { from, to, capturedIndex }
        }
      }
    }
  }

  if (best) return best

  // Mat: şah kurtulmuyor. Diğer taşlardan rastgele bir hamle oynanır,
  // taş yoksa şah kendi kaderini erteler.
  const fallback = doomed.length > 0 ? doomed : doomedKing
  if (fallback.length > 0) return pick(rng, fallback)

  return null
}

/**
 * Hamle şahı şahtan kurtarıyor mu?
 *
 * Hamleyi geçici uygulayıp "oyuncu hâlâ şahı vuruyor mu" diye bakmak üç
 * savunmanın üçünü birden kapsıyor: şahın kaçması, çeken taşın yenmesi ve
 * araya girilmesi. Kaçış karesi de hâlâ vuruluyorsa hamle elenmiş oluyor.
 */
function savesKing(
  board: Board,
  from: Pos,
  to: Pos,
  king: Pos,
  players: Pos[],
  playerColor: Color,
): boolean {
  const piece = board[from.row].cells[from.col]
  if (!piece) return false

  const toCell = board[to.row].cells[to.col]
  board[from.row].cells[from.col] = null
  board[to.row].cells[to.col] = piece

  // Şah kendisi oynadıysa yeni karesinden bakılır
  const kingNow = piece.type === 'k' ? to : king
  // Şahı yiyen taşlardan hangileri hâlâ tahtada? Yenen taş tehdit etmez.
  const stillChecked = players.some(
    (pos) =>
      !samePos(to, pos) &&
      attackSquares(board, pos, playerColor).some((sq) => samePos(sq, kingNow)),
  )

  board[from.row].cells[from.col] = piece
  board[to.row].cells[to.col] = toCell

  return !stillChecked
}

/** Kadrodan herhangi bir taş rakip şahı vuruyor mu? */
function checkedBySquad(
  board: Board,
  players: Pos[],
  playerColor: Color,
  enemyColor: Color,
): Pos | null {
  for (const pos of players) {
    const king = kingInCheck(board, pos, playerColor, enemyColor)
    if (king) return king
  }
  return null
}

/**
 * Kare, oyuncunun *başka* bir taşı tarafından korunuyor mu?
 * Hedefin kendisi listede olduğu için o kare dışarıda bırakılıyor.
 */
function isDefended(board: Board, target: Pos, players: Pos[], playerColor: Color): boolean {
  return players.some(
    (pos) =>
      !samePos(pos, target) &&
      attackSquares(board, pos, playerColor).some((sq) => samePos(sq, target)),
  )
}

/** Taş `to` karesine geçtiğinde oyuncunun karesini vuruyor mu? */
function threatensAfterMove(
  board: Board,
  from: Pos,
  to: Pos,
  players: Pos[],
  playerColor: Color,
): boolean {
  const piece = board[from.row].cells[from.col]
  if (!piece) return false

  // Hamleyi geçici uygula, tehdidi ölç, geri al
  const toCell = board[to.row].cells[to.col]
  board[from.row].cells[from.col] = null
  board[to.row].cells[to.col] = piece

  const hits = attackSquares(board, to, playerColor).some((pos) =>
    players.some((target) => samePos(pos, target)),
  )

  board[from.row].cells[from.col] = piece
  board[to.row].cells[to.col] = toCell

  return hits
}
