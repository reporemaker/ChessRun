import { chooseEnemyMove } from './ai'
import {
  clearAround,
  cloneBoard,
  colsOf,
  createBoard,
  ensureKing,
  findKing,
  freeSquareFor,
  makePiece,
  placeSquadmates,
  refreshBoard,
  respawnSquare,
  scrollBoard,
  squareShade,
} from './board'
import {
  BAIT_START_DISTANCE,
  BAIT_UNTIL_FIRST_CAPTURE,
  CHECK_SCORE,
  DEFAULT_COLS,
  KING_BONUS_LIVES,
  MATE_SCORE,
  MAX_CHECK_STREAK,
  PIECE_VALUE,
  ROWS,
  ROW_SCORE,
  STUCK_RIGHTS,
  STUCK_SCORE,
  START_LIVES,
  START_PIECE,
  TRIO_MATE_SCORE,
  TRIO_MAX_SQUAD,
  TRIO_THREAT_CAP,
  TRIO_THREAT_SCORE,
  TRIO_TYPES,
  minColsOf,
  rowPieces,
  rowPiecesOf,
} from './config'
import { attackersOf, isSafeWait, safeMoves, unattackedMoves } from './fairness'
import {
  attackSquares,
  chebyshev,
  enemyThreats,
  key,
  kingInCheck,
  pseudoMoves,
  samePos,
} from './moves'
import { type Rng, createRng, systemRng } from './random'
import type { Color, GameMode, GameState, Piece, PieceType, Pos } from './types'

export interface NewGameOptions {
  playerColor: Color
  cols?: number
  /** 'classic' = Av, 'kingRun' = Kaçış, 'trio' = Üçlü */
  mode?: GameMode
  /** Tohum verilirse oyun birebir tekrarlanabilir (günlük meydan okuma) */
  seed?: number | null
}

export function createGame({
  playerColor,
  cols = DEFAULT_COLS,
  mode = 'classic',
  seed = null,
}: NewGameOptions): GameState {
  const enemyColor: Color = playerColor === 'w' ? 'b' : 'w'
  const rng: Rng = seed == null ? systemRng : createRng(seed)
  const playerType: PieceType =
    mode === 'kingRun' ? 'k' : mode === 'trio' ? TRIO_TYPES[0] : START_PIECE

  const { board, player } = createBoard({
    playerColor,
    // Üçlü dar koridora sığmıyor: üç kayan taş 4 sütunda birbirini kilitliyor
    cols: Math.max(cols, minColsOf(mode)),
    playerPiece: playerType,
    // Kaçış'ta avlanacak şah yok; Av ve Üçlü'de rakip şahı hedef
    withKing: mode !== 'kingRun',
    // Üçlü tahtanın ortasından başlıyor: kadro dipte doğduğunda oyuncunun
    // sırası gelmeden iki taş birden düşüyordu
    playerRow: mode === 'trio' ? ROWS - 4 : ROWS - 2,
    rng,
  })

  const squad =
    mode === 'trio'
      ? [player, ...placeSquadmates(board, playerColor, player, TRIO_TYPES.slice(1), rng)]
      : [player]

  return {
    mode,
    seed,
    rng,
    board,
    player,
    squad,
    selected: 0,
    playerType,
    playerColor,
    enemyColor,
    chain: [playerType],
    score: 0,
    // Kaçış tek canlık: mat olduğun an koşu biter.
    // Üçlü'de "can" diye ayrı bir sayaç yok - kalan taş sayısı odur.
    lives: mode === 'kingRun' ? 1 : mode === 'trio' ? squad.length : START_LIVES,
    distance: 0,
    checkStreak: 0,
    stuckLeft: STUCK_RIGHTS,
    status: 'playing',
    events: [],
    scrollTick: 0,
    refreshTick: 0,
  }
}

/**
 * Oyuncunun oynayabileceği kareler - Üçlü'de yalnızca *seçili* taşın.
 *
 * Kaçış'ta gerçek satranç kuralı geçerli: **vurulan kareye giremezsin.**
 * Böylece "mat" kendiliğinden tanımlanıyor - vuruluyorsun ve gidecek güvenli
 * kare yok. Diğer modlarda böyle bir kısıt yok, risk oyuncunun tercihi.
 */
export function legalMoves(state: GameState): Pos[] {
  if (state.status !== 'playing') return []
  if (state.mode === 'kingRun') return unattackedMoves(state)
  return pseudoMoves(state.board, state.player, state.playerColor)
}

/**
 * Kadronun **herhangi** bir taşının hamlesi var mı?
 *
 * Sıkışmanın tanımı bu: Üçlü'de seçili taşın kilitlenmesi sıkışma değil,
 * başka taş oynarsın. Koşu ancak üç taşın da hamlesi kalmayınca durur.
 */
export function hasAnyMove(state: GameState): boolean {
  if (state.status !== 'playing') return false
  if (state.mode !== 'trio') return legalMoves(state).length > 0
  return state.squad.some((pos) => pseudoMoves(state.board, pos, state.playerColor).length > 0)
}

/** Üçlü: kadrodan başka bir taşa geçer. Tur harcamaz, tahta kaymaz. */
export function selectPiece(state: GameState, index: number): GameState {
  if (state.mode !== 'trio' || state.status !== 'playing') return state
  if (index < 0 || index >= state.squad.length || index === state.selected) return state

  const next: GameState = { ...state, events: [], selected: index }
  settleSquad(next)
  return next
}

/** Rakibin vurabildiği kareler */
export function threatenedSquares(state: GameState): Set<string> {
  return enemyThreats(state.board, state.playerColor, state.enemyColor)
}

/**
 * Şah çekiliyse rakip şahın karesi - arayüz bunu işaretler.
 * Üçlü'de şahı kadronun *herhangi* bir taşı çekmiş olabilir.
 */
export function checkedKingSquare(state: GameState): Pos | null {
  if (state.status !== 'playing' || state.mode === 'kingRun') return null

  for (const pos of state.squad) {
    const king = kingInCheck(state.board, pos, state.playerColor, state.enemyColor)
    if (king) return king
  }

  return null
}

/** Kaçış'ta oyuncunun kendisi tehdit altında mı? */
export function playerInCheck(state: GameState): boolean {
  if (state.status !== 'playing') return false
  return attackersOf(state.board, state.player, state.playerColor, state.enemyColor).size > 0
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    board: cloneBoard(state.board),
    player: { ...state.player },
    squad: state.squad.map((pos) => ({ ...pos })),
    chain: [...state.chain],
    events: [],
  }
}

/**
 * Kadro ile aktif taş arasındaki tek senkron noktası.
 *
 * `player` ve `playerType` her zaman `squad[selected]`'ın yansıması; tek
 * taşlı modlarda kadro da tek elemanlı tutuluyor, böylece motorun geri
 * kalanı iki ayrı dünya bilmek zorunda kalmıyor.
 */
function settleSquad(state: GameState): void {
  if (state.mode !== 'trio') {
    state.squad = [state.player]
    state.selected = 0
    return
  }

  if (state.squad.length === 0) return
  if (state.selected < 0 || state.selected >= state.squad.length) state.selected = 0

  const pos = state.squad[state.selected]
  state.player = pos

  const piece = state.board[pos.row].cells[pos.col]
  if (piece) state.playerType = piece.type
}

/* ------------------------------------------------------------------ *
 * Tur fazlara bölündü: her fazın kendi animasyonu var ve arayüz
 * bunları sırayla oynatıyor. Motor zamanlamayı hiç bilmiyor.
 *   1. applyPlayerMove - oyuncu oynar, yediği taşa dönüşür
 *  1.5 applyBoardRefresh - yalnızca şah yendiyse
 *   2. applyScroll     - tahta bir satır ilerler
 *   3. applyEnemyMove  - rakip tek taşını oynar
 * ------------------------------------------------------------------ */

/** 1. faz: oyuncunun hamlesi */
export function applyPlayerMove(state: GameState, to: Pos): GameState {
  if (state.status !== 'playing') return state
  if (!legalMoves(state).some((pos) => samePos(pos, to))) return state

  const next = cloneState(state)
  const from = next.player
  const moving = next.board[from.row].cells[from.col]
  if (!moving) return state

  const target = next.board[to.row].cells[to.col]
  // Kaçış'ta rakip şah yok; diğer iki modda şahı yemek koşunun ödülü
  const capturedKing = target?.type === 'k' && next.mode !== 'kingRun'

  if (target) {
    const points = PIECE_VALUE[target.type]
    next.score += points

    if (capturedKing) {
      // Şah dönüşüm vermez; saf bonustur. Av'da can, Üçlü'de taş getirir.
      const gained = next.mode === 'trio' ? 0 : KING_BONUS_LIVES
      next.lives += gained
      next.events.push({ kind: 'kingBonus', points, lives: gained })
    } else {
      next.events.push({ kind: 'capture', piece: target.type, points })

      // Dönüşüm yalnızca Av'da: Kaçış'ta hep şahsın, Üçlü'de kadro sabit
      if (next.mode === 'classic' && target.type !== next.playerType) {
        next.playerType = target.type
        next.chain.push(target.type)
        next.events.push({ kind: 'transform', to: target.type })
      }
    }
  }

  const landing = { ...to }
  next.board[from.row].cells[from.col] = null
  next.board[landing.row].cells[landing.col] = { ...moving, type: next.playerType }
  next.player = landing
  next.squad[next.selected] = landing

  // Şah yendiyse kadro takviyesi burada: eksik taş geri gelir, kadro tamsa
  // dördüncü taş katılır (bkz. reinforceSquad)
  if (next.mode === 'trio' && capturedKing) reinforceSquad(next)

  if (next.mode !== 'kingRun') {
    // Şah yendiyse yeni şah tahta yenilenirken konur (bkz. applyBoardRefresh)
    if (capturedKing) {
      next.checkStreak = 0
    } else {
      ensureKing(next.board, next.enemyColor, next.rng)

      if (checkedKingSquare(next)) {
        // Zincir şah: her ardışık şah rakibin bir turunu daha yakıyor
        next.checkStreak = Math.min(MAX_CHECK_STREAK, state.checkStreak + 1)
        const points = CHECK_SCORE * next.checkStreak
        next.score += points
        next.events.push({ kind: 'check', points, streak: next.checkStreak })
      } else {
        next.checkStreak = 0
      }
    }
  }

  if (next.mode === 'trio') scoreThreats(state, next, from, landing)

  settleSquad(next)
  return next
}

/**
 * Üçlü'nün ikinci puan kaynağı: **yeni** tehdit kurmak.
 *
 * Yalnızca oynanan taşın yeni karesinden vurduğu ve eski karesinden
 * vurmadığı rakip taşlar sayılıyor - yani puan baskı *kurmaktan* geliyor,
 * baskıyı sürdürmekten değil. Aynı taşı iki kare arasında gidip gelerek
 * saymak da bu yüzden işe yaramıyor. Şah dışarıda: onun karşılığı zaten
 * şah puanı.
 */
function scoreThreats(before: GameState, next: GameState, from: Pos, to: Pos): void {
  const was = attackedEnemies(before.board, from, before.playerColor, before.enemyColor)
  const now = attackedEnemies(next.board, to, next.playerColor, next.enemyColor)

  let fresh = 0
  for (const id of now) if (!was.has(id)) fresh++
  if (fresh === 0) return

  const count = Math.min(fresh, TRIO_THREAT_CAP)
  const points = count * TRIO_THREAT_SCORE
  next.score += points
  next.events.push({ kind: 'threat', points, count })
}

function attackedEnemies(
  board: GameState['board'],
  from: Pos,
  playerColor: Color,
  enemyColor: Color,
): Set<number> {
  const ids = new Set<number>()

  for (const pos of attackSquares(board, from, playerColor)) {
    const piece = board[pos.row].cells[pos.col]
    if (piece && piece.color === enemyColor && piece.type !== 'k') ids.add(piece.id)
  }

  return ids
}

/**
 * Şah yendiğinde kadro takviyesi.
 *
 * Eksik taş varsa o geri gelir; kadro tamsa dördüncü taş katılır ve o taş
 * her zaman **ikinci fil** olur - çünkü tek fil tahtanın yarısını hiç
 * göremiyor. İkinci fil bu yüzden zorunlu olarak karşı renkte doğuyor.
 */
function reinforceSquad(state: GameState): void {
  if (state.squad.length >= TRIO_MAX_SQUAD) return

  const have = state.squad.map((pos) => state.board[pos.row].cells[pos.col]?.type)
  const missing: PieceType = TRIO_TYPES.find((type) => !have.includes(type)) ?? 'b'

  let shade: number | null = null
  if (missing === 'b') {
    const bishop = state.squad.find((pos) => state.board[pos.row].cells[pos.col]?.type === 'b')
    if (bishop) shade = 1 - squareShade(state.distance, bishop)
  }

  const threatened = enemyThreats(state.board, state.playerColor, state.enemyColor)
  const spot = freeSquareFor(state.board, threatened, state.distance, shade, state.rng)
  if (!spot) return

  state.board[spot.row].cells[spot.col] = makePiece(missing, state.playerColor)
  state.squad.push(spot)
  state.lives = state.squad.length
  state.events.push({ kind: 'squadGain', piece: missing, size: state.squad.length })
}

/**
 * Oyuncunun mevcut taşıyla rakip şaha kaç hamlede ulaşabileceği.
 *
 * Hem hedefi görünür kılıyor (şah avı Av modunun asıl amacı) hem de satranç
 * bilmeyene taşının nasıl hareket ettiğini öğretiyor: "atla 3, filken 1".
 * Tahta her tur kaydığı için sayı yaklaşık - yine de yön duygusu veriyor.
 */
export function movesToKing(state: GameState, maxDepth = 4): number | null {
  if (state.status !== 'playing' || state.mode === 'kingRun') return null

  const king = findKing(state.board, state.enemyColor)
  if (!king) return null

  const piece = state.board[state.player.row].cells[state.player.col]
  if (!piece) return null

  const board = cloneBoard(state.board)
  board[state.player.row].cells[state.player.col] = null

  // Taşı geçici olarak kareye koyup hamlelerini sor, sonra kareyi eski
  // hâline döndür - altındaki düşman taşı silinmesin
  const movesFrom = (from: Pos): Pos[] => {
    const occupant = board[from.row].cells[from.col]
    board[from.row].cells[from.col] = piece
    const moves = pseudoMoves(board, from, state.playerColor)
    board[from.row].cells[from.col] = occupant
    return moves
  }

  const seen = new Set([key(state.player)])
  let frontier = [state.player]

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: Pos[] = []

    for (const from of frontier) {
      for (const to of movesFrom(from)) {
        if (samePos(to, king)) return depth
        const id = key(to)
        if (seen.has(id)) continue
        seen.add(id)
        next.push(to)
      }
    }

    if (next.length === 0) break
    frontier = next
  }

  return null
}

/** Şah yendi mi? Yenildiyse sıradaki faz tahtanın baştan kurulması. */
export function needsBoardRefresh(state: GameState): boolean {
  return state.events.some((event) => event.kind === 'kingBonus')
}

/**
 * 1.5. faz: şah yendiğinde tahta baştan kurulur.
 *
 * Av'da kazanılan can aynı turda geri alınmamalı: şahı yediğin kare çoğu
 * zaman tahtanın göbeğinde, etrafı sarılmış bir kare oluyordu ve +1 can
 * anında geri gidiyordu. Yeni tahtada oyuncunun çevresi temiz.
 *
 * Üçlü'de çevre **temizlenmiyor**: üç taşın etrafını birden boşaltmak
 * tahtanın yarısını siler, şah yemeyi "tahtayı süpür" düğmesine çevirirdi.
 * Ödül zaten kadroya katılan taş.
 */
export function applyBoardRefresh(state: GameState): GameState {
  if (state.status !== 'playing') return state

  const next = cloneState(state)
  if (!next.board[next.player.row].cells[next.player.col]) return state

  rebuildBoard(next, next.mode === 'trio' ? 0 : 2)

  // Yeni tahtada oyuncuyu vuran taş kalmasın - hiçbiri "bilinen tehdit" değil
  if (next.mode !== 'trio') dropAmbushers(next, next.player, new Set())

  next.events.push({ kind: 'boardRefresh' })
  return next
}

/**
 * Tahtayı baştan kurup kadroyu üstüne geri yerleştirir.
 *
 * Tek taşlı modlarda `refreshBoard` zaten yetiyordu; kadroda ise geri kalan
 * taşların da yeni tahtada kendi karelerinde belirmesi gerekiyor, yoksa şah
 * yemek iki taşı birden siliyordu.
 */
function rebuildBoard(state: GameState, safeRadius: number): void {
  const cols = colsOf(state.board)
  const carried = state.squad.map((pos) => ({
    pos,
    piece: state.board[pos.row].cells[pos.col],
  }))

  const active = carried[state.selected]
  if (!active?.piece) return

  const result = refreshBoard({
    cols,
    pieces: rowPiecesOf(state.mode, state.distance, state.playerType, cols),
    enemyColor: state.enemyColor,
    player: active.pos,
    playerPiece: active.piece,
    safeRadius,
    withKing: state.mode !== 'kingRun',
    rng: state.rng,
  })

  state.board = result.board
  state.squad = state.squad.map((pos, index) => (index === state.selected ? result.player : pos))

  carried.forEach((entry, index) => {
    if (index === state.selected || !entry.piece) return
    const target = landingFor(state, entry.pos, index)
    state.board[target.row].cells[target.col] = entry.piece
    state.squad[index] = target
  })

  state.player = result.player
  state.refreshTick += 1
  settleSquad(state)
}

/**
 * Yeni tahtada bir kadro taşının ineceği kare.
 * Kendi karesi tercih edilir; en alt satırdaysa bir yukarı alınır (orada
 * kalsa ilk kaymada düşerdi), doluysa en yakın boş kare aranır.
 */
function landingFor(state: GameState, pos: Pos, index: number): Pos {
  const cols = colsOf(state.board)
  const taken = (candidate: Pos): boolean =>
    state.squad.some((other, i) => i !== index && samePos(other, candidate))

  const start = pos.row >= ROWS - 1 ? { row: ROWS - 2, col: pos.col } : pos
  if (!taken(start)) return start

  for (let row = ROWS - 2; row >= 0; row--) {
    for (let col = 0; col < cols; col++) {
      const candidate = { row, col }
      if (!taken(candidate)) return candidate
    }
  }

  return start
}

/** 2. faz: tahtanın bir satır ilerlemesi */
export function applyScroll(state: GameState): GameState {
  if (state.status !== 'playing') return state

  const next = cloneState(state)

  // Kaymadan önce oyuncuyu kimlerin vurduğunu not al - sonrasında bu listede
  // olmayan bir tehdit varsa, o tehdit oyuncunun hamlesiyle değil kaymayla
  // doğmuş demektir ve oyuncunun görüp kaçınma şansı olmamıştır.
  //
  // Üçlü'de bu not kadronun **her** taşı için ayrı tutuluyor. Yalnızca
  // oynanan taşı korumak ölçümde modu oynanamaz kılıyordu: rakip turda tek
  // hamle yapıyor, ama kayma her tur bedava saldırgan doğuruyor ve üç
  // hedefin arasından birini mutlaka vuruyordu - oyuncunun tek hamlesiyle
  // cevap veremeyeceği bir tempo. 300 koşuda kadronun tamamı ortalama
  // 6 turda yenmişti, düşerek kaybedilen taş sayısı sıfırdı.
  const knownAttackers = new Set(
    attackersOf(next.board, next.player, next.playerColor, next.enemyColor).keys(),
  )
  const squadAttackers = next.squad.map(
    (pos) => new Set(attackersOf(next.board, pos, next.playerColor, next.enemyColor).keys()),
  )

  // Düşen taşların tipi kayma öncesinde okunmalı: en alt satır siliniyor
  const types = next.squad.map((pos) => next.board[pos.row].cells[pos.col]?.type ?? null)

  next.distance += 1
  next.scrollTick += 1

  // Hayatta kalınan her satır puan: üç modda da aynı taban kural
  next.score += ROW_SCORE

  const result = scrollBoard(next.board, {
    player: next.player,
    enemyColor: next.enemyColor,
    pieces: rowPiecesOf(next.mode, next.distance, next.playerType, colsOf(next.board)),
    baitCol: baitColumn(next),
    keepKing: next.mode !== 'kingRun',
    rng: next.rng,
  })

  next.board = result.board
  next.events.push({ kind: 'scroll' })

  if (next.mode === 'trio') {
    scrollSquad(next, types, squadAttackers)
  } else if (result.playerFellOff) {
    loseLife(next, 'fellOff')
  } else {
    next.player = result.player
    dropAmbushers(next, next.player, knownAttackers)
  }

  settleSquad(next)
  return next
}

/**
 * Kadronun kayma karşısındaki hâli.
 *
 * Oyunun asıl gerilimi burada: turda tek taş oynadığın için diğer ikisi
 * her tur bir satır dibe iniyor. En alt satırda yakalanan taş düşer -
 * koşu bitmez, kadro küçülür.
 *
 * Pusu koruması kadronun tamamına uygulanıyor: rakip turda bir hamle
 * yapıyor, oyuncu da bir hamle - bu tempo adil. Ama kayma her tur bedava
 * saldırgan doğuruyor ve üç hedef arasından birini vurmak neredeyse hiç
 * ıskalamıyor; korumasız bırakılan taşlar oyuncunun cevap veremeyeceği bir
 * hızda eriyordu. Oyuncunun *kendi hamlesiyle* girdiği tehditler ise
 * dokunulmadan kalıyor: bilerek alınan risk risktir.
 */
function scrollSquad(
  state: GameState,
  types: (PieceType | null)[],
  known: Set<number>[],
): void {
  const survivors: Pos[] = []
  const carriedKnown: Set<number>[] = []
  const lost: PieceType[] = []
  let selected = 0

  state.squad.forEach((pos, index) => {
    const type = types[index]

    if (pos.row >= ROWS - 1 || type == null) {
      if (type) lost.push(type)
      return
    }

    if (index === state.selected) selected = survivors.length
    survivors.push({ row: pos.row + 1, col: pos.col })
    carriedKnown.push(known[index] ?? new Set())
  })

  state.squad = survivors
  state.selected = Math.min(selected, Math.max(0, survivors.length - 1))
  state.lives = survivors.length

  for (const type of lost) {
    state.events.push({ kind: 'pieceLost', piece: type, reason: 'fellOff', left: survivors.length })
  }

  if (survivors.length === 0) {
    state.status = 'gameover'
    state.events.push({ kind: 'gameover' })
    return
  }

  settleSquad(state)
  survivors.forEach((pos, index) => dropAmbushers(state, pos, carriedKnown[index]))
}

/**
 * Kaymayla birlikte doğan, oyuncunun kaçınma şansı olmayan tehditleri siler.
 *
 * Oyuncu güvenli olduğunu görerek indiği bir kareye, üstten yeni doğan bir
 * kale ya da vezir yüzünden ölmemeli. Oyuncunun hamlesinden *önce* de onu
 * vuran taşlar dokunulmadan bırakılır - bilerek alınan risk risktir.
 */
function dropAmbushers(state: GameState, target: Pos, knownAttackers: Set<number>): void {
  // Tek geçiş yetmiyor: önündeki taş kalkan bir kalenin hattı açılıyor ve
  // o kale ancak ikinci geçişte "saldıran" olarak görünüyor. Her geçişte
  // en az bir taş kalktığı için döngü tahta boyutuyla sınırlı.
  for (let pass = 0; pass < ROWS; pass++) {
    const attackers = attackersOf(state.board, target, state.playerColor, state.enemyColor)

    let changed = 0
    for (const [id, pos] of attackers) {
      if (knownAttackers.has(id)) continue

      // Şah silinemez (tahtada hep bir tane olmalı) - pusudan çıkarıp uzağa taşınır
      if (state.board[pos.row].cells[pos.col]?.type === 'k' && state.mode !== 'kingRun') {
        if (relocateKing(state, pos, target)) changed++
        continue
      }

      state.board[pos.row].cells[pos.col] = null
      changed++
    }

    if (changed === 0) return
  }
}

/**
 * Şahı oyuncuya değmeyen boş bir kareye taşır. Silinemediği için tek çare bu.
 *
 * Önce kendi satırı denenir (şah gözden kaybolmuş gibi görünmesin), olmazsa
 * tahtanın tamamında en uzak boş kare seçilir. Satırla yetinmek dar tahtada
 * yetmiyordu: 4 sütunda o satır doluysa şah oyuncunun dibinde kalıyor ve
 * "şah yemek can kaybettirmez" garantisi ~350 şahta bir kırılıyordu.
 */
function relocateKing(state: GameState, from: Pos, target: Pos): boolean {
  const king = state.board[from.row].cells[from.col]
  if (!king) return false

  const cols = colsOf(state.board)
  let fallback: Pos | null = null
  let fallbackDistance = 1 // şah bitişik kareyi vurur: en az 2 uzak olmalı

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      if (state.board[row].cells[col]) continue

      const spot = { row, col }
      const distance = chebyshev(spot, target)
      if (distance <= 1) continue

      if (row === from.row) {
        moveKing(state, from, spot, king)
        return true
      }

      if (distance > fallbackDistance) {
        fallback = spot
        fallbackDistance = distance
      }
    }
  }

  if (!fallback) return false

  moveKing(state, from, fallback, king)
  return true
}

function moveKing(state: GameState, from: Pos, to: Pos, king: Piece): void {
  state.board[from.row].cells[from.col] = null
  state.board[to.row].cells[to.col] = king
}

/** 3. faz: rakibin hamlesi */
export function applyEnemyMove(state: GameState): GameState {
  if (state.status !== 'playing') return state

  const next = cloneState(state)
  const inCheck = checkedKingSquare(next) != null
  const move = chooseEnemyMove(
    next.board,
    next.squad,
    next.playerColor,
    next.enemyColor,
    next.rng,
  )

  if (move) {
    // Yenen taşın tipi hamleden *önce* okunmalı: rakip taş üstüne geçiyor
    const victim = move.capturedIndex == null ? null : next.squad[move.capturedIndex]
    const victimType = victim ? next.board[victim.row].cells[victim.col]?.type : null

    const piece = next.board[move.from.row].cells[move.from.col]
    if (piece) {
      next.board[move.from.row].cells[move.from.col] = null
      next.board[move.to.row].cells[move.to.col] = piece

      if (move.capturedIndex != null) {
        if (next.mode === 'trio') losePiece(next, move.capturedIndex, victimType, 'captured')
        else loseLife(next, 'captured')
      }
    }
  }

  // Şah hâlâ altındaysa kurtulamamış demektir: mat. Rakip yine de
  // başka bir taşını oynadı, sıra oyuncuda ve şah masada duruyor.
  if (inCheck && next.status === 'playing' && checkedKingSquare(next)) {
    // Üçlü'de mat büyük ikramiye: kadroyla kurulan tuzağın karşılığı
    const points = next.mode === 'trio' ? TRIO_MATE_SCORE : MATE_SCORE
    next.score += points
    next.events.push({ kind: 'mate', points })
  }

  checkPlayerMated(next)

  settleSquad(next)
  return next
}

/**
 * Üçlü: kadrodan bir taş gider. Can kaybı değil - koşu ancak kadro
 * tükenince biter. Bu yüzden yeniden doğma da yok: kaybettiğin taşı geri
 * almanın tek yolu rakip şahı yemek.
 */
function losePiece(
  state: GameState,
  index: number,
  type: PieceType | null | undefined,
  reason: 'captured' | 'fellOff',
): void {
  if (index < 0 || index >= state.squad.length) return

  state.squad = state.squad.filter((_, i) => i !== index)
  if (state.selected > index) state.selected -= 1
  if (state.selected >= state.squad.length) state.selected = Math.max(0, state.squad.length - 1)
  state.lives = state.squad.length

  state.events.push({
    kind: 'pieceLost',
    piece: type ?? 'q',
    reason,
    left: state.squad.length,
  })

  if (state.squad.length === 0) {
    state.status = 'gameover'
    state.events.push({ kind: 'gameover' })
    return
  }

  settleSquad(state)
}

/**
 * Kaçış'ın bitiş koşulu: vuruluyorsun ve gidecek güvenli kare yok.
 * Vurulmuyorsan hamlesizlik ölüm değil - beklersin, bedeli bir satır.
 */
function checkPlayerMated(state: GameState): void {
  if (state.status !== 'playing' || state.mode !== 'kingRun') return
  if (!playerInCheck(state)) return
  if (unattackedMoves(state).length > 0) return

  state.status = 'gameover'
  state.lives = 0
  state.events.push({ kind: 'checkmated' })
  state.events.push({ kind: 'gameover' })
}

/** Tüm fazları tek seferde çalıştırır - testler ve animasyonsuz kullanım için */
export function playerMove(state: GameState, to: Pos): GameState {
  const moved = applyPlayerMove(state, to)
  if (moved === state) return state
  const refreshed = needsBoardRefresh(moved) ? applyBoardRefresh(moved) : moved
  return applyEnemyMove(applyScroll(refreshed))
}

/**
 * Sıkışma: oyuncunun hiç hamlesi kalmadı.
 *
 * Bekleme düğmesi yok - hamlen varsa oynamak zorundasın. Hamlen yoksa bu
 * faz devreye giriyor: bir sıkışma hakkı yanıyor, tahta aynı yoğunlukta
 * yeniden diziliyor, puanın kalıyor ve üstüne prim geliyor. Hak bittiyse
 * sıkışmak koşuyu bitiriyor.
 *
 * Tahta *temizlenmiyor*, yeniden diziliyor: şah yemenin "nefes aldıran"
 * ödülüyle karışmasın diye yoğunluk aynı kalıyor.
 */
export function applyStuck(state: GameState): GameState {
  if (state.status !== 'playing') return state

  const next = cloneState(state)

  if (next.stuckLeft <= 0) {
    next.status = 'gameover'
    next.lives = 0
    next.events.push({ kind: 'stuckOut' })
    next.events.push({ kind: 'gameover' })
    return next
  }

  if (!next.board[next.player.row].cells[next.player.col]) return state

  next.stuckLeft -= 1
  next.score += STUCK_SCORE

  rebuildBoard(next, 0)

  // Yeni tahtada da vurulmuyor olmalı
  if (next.mode !== 'trio') dropAmbushers(next, next.player, new Set())

  // Ve en az bir hamlesi olmalı - yoksa kurtuluş kurtarmamış olur
  if (!hasAnyMove(next)) {
    for (const pos of next.squad) clearAround(next.board, pos)
    dropAmbushers(next, next.player, new Set())
  }

  next.events.push({ kind: 'stuck', points: STUCK_SCORE, left: next.stuckLeft })

  settleSquad(next)
  return next
}

/**
 * Oyuncu hâlâ hiç puan alamadıysa yeni satıra yakalanabilir bir piyon konur.
 * Hiçbir koşu 0 puanla bitmesin diye - ilk av, dönüşüm zincirini başlatır.
 * (Kaçış ve Üçlü'de puan zaten hayatta kalmakla geliyor, yeme şart değil.)
 */
function baitColumn(state: GameState): number | null {
  if (!BAIT_UNTIL_FIRST_CAPTURE || state.mode !== 'classic') return null
  if (state.score > 0 || state.distance < BAIT_START_DISTANCE) return null

  const offset = state.rng() < 0.5 ? -1 : 1
  return Math.max(0, Math.min(colsOf(state.board) - 1, state.player.col + offset))
}

function loseLife(state: GameState, reason: 'captured' | 'fellOff'): void {
  state.lives -= 1
  state.events.push({ kind: 'lifeLost', reason })

  if (state.lives <= 0) {
    state.lives = 0
    state.status = 'gameover'
    state.events.push({ kind: 'gameover' })
    return
  }

  // Can kaybında taşını korursun - asıl ceza zaten ilerlemenin kesilmesi
  const threatened = enemyThreats(state.board, state.playerColor, state.enemyColor)
  const pos = respawnSquare(state.board, threatened, state.rng)
  state.board[pos.row].cells[pos.col] = makePiece(state.playerType, state.playerColor)
  state.player = pos
  state.squad = [pos]
  state.selected = 0
}

export { colsOf, key, isSafeWait, rowPieces, safeMoves, unattackedMoves }
