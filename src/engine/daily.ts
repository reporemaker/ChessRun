import { cloneBoard, colsOf, emptyRow, makePiece } from './board'
import { PIECE_VALUE, ROWS } from './config'
import { attackersOf } from './fairness'
import { chebyshev, enemyThreats, key, pseudoMoves, samePos } from './moves'
import { type Rng, createRng, hashSeed, shuffled } from './random'
import type { Board, Color, PieceType, Pos, Row } from './types'

/**
 * Günün Mücadelesi — Av'ın "kesintisiz" hâli.
 *
 * Tahta tık tık değil, sürekli ve yumuşak kayar; rakip hamle YAPMAZ.
 * Tek koşu, can yok. Kaybetmenin iki yolu var:
 *   1. hamle sonrası vurulan bir karede durmak (korunan taşı yemek dahil),
 *   2. en alt satırdayken tahtanın bir satır daha kayması (düşmek).
 *
 * Yediğin taşa dönüşürsün; şahı yersen VEZİR olursun (Mario'nun mantarı):
 * vezirken vurulursan ölmez, şahı yediğin taşa geri dönersin. Vezirken
 * yeme dönüşüm vermez — mantar bir vuruş yiyene kadar sürer.
 *
 * Bu modda piyon da rakip veziri de yok: piyon kayan tahtada yerinde
 * sayıyor (dönüşünce ölüm), vezir de her şeyi koruduğu için tahtayı
 * kilitliyordu.
 *
 * Zamanlama motorun DIŞINDA: arayüz süreyi ölçer, her tam satırda
 * `applyDailyScroll` çağırır. Motor yalnızca kesikli durumu bilir; bu
 * sayede tohum + hamle dizisi bayt bayt aynı oyunu üretir.
 */

/** Günlük mücadele sabit genişlikte oynanır: sekiz yatay kare */
export const DAILY_COLS = 8

/** Başlangıçta bir satırın kayma süresi ve ulaşılabilecek en hızlı süre
 *  (kullanıcı 18 Ağustos: 5 s → 1 s; ilk deneme 2 s → 0,33 s çok hızlıydı) */
export const DAILY_START_MS = 5000
export const DAILY_FINAL_MS = 1000

/**
 * Her 5 yemede bir "tık" hızlanır; 100 yemede (20 tık) son hıza ulaşır.
 * Tıklar arası oran sabit (geometrik): ilk tık da son tık da aynı ölçüde
 * "sıkıştırır" — doğrusal bölseydik ilk tıklar hissedilmez, sonlar sert olurdu.
 */
export const DAILY_TICK_CAPTURES = 5
export const DAILY_TICKS = 20

/** Günde tek hak olduğu için puan diğer oyunların iki katı */
export const DAILY_SCORE_FACTOR = 2

/**
 * Vezir (mantar) kaç yeme sürer. 500 oyunluk simülasyonda sınırsız vezir
 * oyunun %85'ini vezir olarak geçirtiyordu — dönüşüm zinciri kayboluyordu.
 * Süre dolunca şahı yediğin taşa dönersin; şah yersen sayaç yenilenir.
 * 0 = sınırsız (yalnızca vurulunca biter).
 */
export const DAILY_QUEEN_CAPTURES = 6

/** Art arda yeme zinciri çarpanı; boş kareye basınca zincir sıfırlanır */
export const DAILY_MAX_COMBO = 3

/** Hayatta kalınan her satır (Av'daki ROW_SCORE ile aynı taban) */
export const DAILY_ROW_SCORE = 1

/** Koşu başında en alttaki bu kadar satır boş: oyuncunun nefes alacağı yer */
export const DAILY_OPENING_ROWS = 3

/**
 * Rakip taş havuzu — piyon ve vezir yok. Şah havuzdan gelmez: tahtada her
 * zaman TEK şah bulunur (kullanıcı 18 Ağustos: "şah yoksa yenisi gelsin");
 * açılışta bir tane konur, yendiğinde ya da dipten düştüğünde bir sonraki
 * satır bir şah taşır. Bkz. `spawnDailyRow` withKing.
 */
export const DAILY_SPAWN_WEIGHTS: ReadonlyArray<readonly [PieceType, number]> = [
  ['n', 18],
  ['b', 18],
  ['r', 12],
]

/** Açılış şahının satırı (üretim indeksi): tahtanın üst yarısı, birkaç hamle uzakta */
export const DAILY_OPENING_KING_ROW = ROWS - 3

/**
 * Şah tahtadan çıkınca (yendin ya da dipten düştü) yenisi HEMEN gelmez: bu
 * kadar şahsız kayma geçmeden sıradaki satıra konmaz. 500 oyunluk
 * simülasyonda (18 Ağustos) anında gelen şah "şah çiftliği" yaratıyordu:
 * yedikçe yeni şah, oyun başına 20–30 şah, puanın yarısı şahtan. Bir ekran
 * (6 satır) ara ile "her ekranda en çok bir şah".
 */
export const DAILY_KING_GAP_ROWS = 6

/**
 * Satır başına beklenen taş: satır indeksiyle (yani zamanla) artar, oyuncunun
 * ne yaptığına BAĞLI DEĞİL — herkes aynı gün aynı satırları görsün diye.
 */
export const DAILY_BASE_ROW_PIECES = 0.9
export const DAILY_ROW_PIECES_PER_ROW = 1 / 80
export const DAILY_MAX_ROW_PIECES = 2.0

export type DailyEndReason = 'captured' | 'fellOff'

export type DailyEvent =
  | { kind: 'capture'; piece: PieceType; points: number; combo: number }
  | { kind: 'transform'; to: PieceType }
  /** Şah yendi: vezir oldun */
  | { kind: 'promote'; points: number }
  /** Vezirken vuruldun: mantar gitti, eski taşına döndün */
  | { kind: 'shrink'; to: PieceType }
  /** Vezir süresi doldu: eski taşına döndün (vuruş yok) */
  | { kind: 'expire'; to: PieceType }
  | { kind: 'scroll'; points: number }
  | { kind: 'gameover'; reason: DailyEndReason }

export interface DailyState {
  seed: number
  /** ROWS satır; 0 en üst */
  board: Board
  /** Üstten girmek üzere olan satır — kayma sırasında kısmen görünür */
  incoming: Row
  /** Şimdiye dek üretilen satır sayısı = sıradaki satırın indeksi */
  spawned: number
  player: Pos
  playerType: PieceType
  /** Vezirken vurulunca dönülecek taş; vezir değilken null */
  base: PieceType | null
  /** Vezirken kalan yeme hakkı (DAILY_QUEEN_CAPTURES'tan geri sayar); vezir değilken 0 */
  queenLeft: number
  playerColor: Color
  enemyColor: Color
  score: number
  captures: number
  combo: number
  bestCombo: number
  kings: number
  distance: number
  chain: PieceType[]
  status: 'playing' | 'gameover'
  endReason: DailyEndReason | null
  events: DailyEvent[]
  /** Art arda kaç kaymadır tahtada şah yok (şah bekleme sayacı) */
  kingless: number
}

/* ------------------------------------------------------------------ *
 * Hız eğrisi
 * ------------------------------------------------------------------ */

/** Kaç tık hızlanıldı (0..DAILY_TICKS) */
export function dailyTicks(captures: number): number {
  return Math.min(DAILY_TICKS, Math.floor(captures / DAILY_TICK_CAPTURES))
}

/** Bir satırın kayma süresi (ms) — yeme sayısına göre */
export function dailyIntervalMs(captures: number): number {
  const ratio = DAILY_FINAL_MS / DAILY_START_MS
  return DAILY_START_MS * Math.pow(ratio, dailyTicks(captures) / DAILY_TICKS)
}

/** Arayüzde gösterilen seviye: 1'den başlar, her tıkta bir artar */
export function dailyLevel(captures: number): number {
  return dailyTicks(captures) + 1
}

/* ------------------------------------------------------------------ *
 * Satır üretimi — yalnızca (tohum, satır indeksi)'ne bağlı
 * ------------------------------------------------------------------ */

function rowRng(seed: number, index: number): Rng {
  return createRng(hashSeed(`${seed >>> 0}:${index}`))
}

/** Satır indeksine göre beklenen taş sayısı */
export function dailyRowPieces(index: number): number {
  return Math.min(DAILY_MAX_ROW_PIECES, DAILY_BASE_ROW_PIECES + index * DAILY_ROW_PIECES_PER_ROW)
}

function weightedType(rng: Rng): PieceType {
  const total = DAILY_SPAWN_WEIGHTS.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng() * total
  for (const [type, weight] of DAILY_SPAWN_WEIGHTS) {
    roll -= weight
    if (roll <= 0) return type
  }
  return 'n'
}

/**
 * `index` numaralı satır. Aynı tohum + aynı indeks → aynı satır, oyuncu ne
 * oynarsa oynasın. İlk satırlar (0..OPENING-1, tahtanın dibi) boş.
 */
export function spawnDailyRow(
  seed: number,
  index: number,
  enemyColor: Color,
  withKing = false,
): Row {
  const row = emptyRow(DAILY_COLS)
  if (index < DAILY_OPENING_ROWS) return row

  const rng = rowRng(seed, index)
  const expected = dailyRowPieces(index)
  const whole = Math.floor(expected)
  const count = Math.min(DAILY_COLS, whole + (rng() < expected - whole ? 1 : 0))
  const columns = shuffled(rng, Array.from({ length: DAILY_COLS }, (_, i) => i))

  for (let i = 0; i < count; i++) {
    row.cells[columns[i]] = makePiece(weightedType(rng), enemyColor)
  }

  // Şah: karıştırılmış sütun listesinin ilk boş karesi (yoksa ilk kare).
  // Ek rng tüketimi yok — şahsız hâli aynı satırın birebir aynısı.
  if (withKing) {
    const col = columns.find((c) => !row.cells[c]) ?? columns[0]
    row.cells[col] = makePiece('k', enemyColor)
  }
  return row
}

export function hasKing(rows: readonly Row[], enemyColor: Color): boolean {
  return rows.some((row) => row.cells.some((cell) => cell?.type === 'k' && cell.color === enemyColor))
}

/** Tahtadaki `r` satırının üretim indeksi — kare deseni ve testler için */
export function rowIndexAt(state: DailyState, r: number): number {
  // incoming = spawned-1; board[0] = spawned-2; board[r] = spawned-2-r
  return state.spawned - 2 - r
}

/* ------------------------------------------------------------------ *
 * Kuruluş
 * ------------------------------------------------------------------ */

export interface DailyOptions {
  seed: number
  playerColor?: Color
}

/**
 * Açılış adil mi? Atın en az bir güvenli hamlesi olmalı ve o hamleden sonra
 * da en az bir güvenli hamle kalmalı. Aksi hâlde ilk iki kaymada kaderden
 * ölüm var — günde tek hakta kabul edilemez. Simülasyonda tohumların
 * ~%10'u böyle açılıyordu.
 */
export function openingIsFair(state: DailyState): boolean {
  for (const move of dailyMoves(state)) {
    // Dibe inmek "güvenli" sayılmaz: bir sonraki kayma öldürür
    if (move.row >= ROWS - 1) continue
    const after = applyDailyMove(state, move)
    if (after.status !== 'playing') continue
    // Kayma araya girer; sonrasında da bir çıkış olmalı
    const scrolled = applyDailyScroll(after)
    if (scrolled.status !== 'playing') continue
    const escapes = dailyMoves(scrolled).some(
      (next) => next.row < ROWS - 1 && applyDailyMove(scrolled, next).status === 'playing',
    )
    if (escapes) return true
  }
  return false
}

/** Adil açılış bulunana dek denenecek en çok tohum tuzu */
export const DAILY_OPENING_TRIES = 32

/**
 * Günün tahtası. Tohum adil bir açılış vermiyorsa tohum tuzlanır
 * (`seed#1`, `seed#2`, …) — deterministik: aynı gün herkes aynı tuzu bulur.
 */
export function createDaily({ seed, playerColor = 'w' }: DailyOptions): DailyState {
  let state = buildDaily(seed >>> 0, playerColor)
  for (let salt = 1; salt < DAILY_OPENING_TRIES && !openingIsFair(state); salt++) {
    state = buildDaily(hashSeed(`${seed >>> 0}#${salt}`), playerColor)
  }
  return state
}

function buildDaily(seed: number, playerColor: Color): DailyState {
  const enemyColor: Color = playerColor === 'w' ? 'b' : 'w'

  // Alt satır indeks 0, üst satır indeks ROWS-1; giren satır ROWS.
  // Açılış şahı sabit bir satırda: ilk vezir denemesi birkaç hamle uzakta.
  const board: Board = []
  for (let r = 0; r < ROWS; r++) {
    const index = ROWS - 1 - r
    board.push(spawnDailyRow(seed, index, enemyColor, index === DAILY_OPENING_KING_ROW))
  }
  const incoming = spawnDailyRow(seed, ROWS, enemyColor)

  const player: Pos = { row: ROWS - 2, col: Math.floor(DAILY_COLS / 2) }
  board[player.row].cells[player.col] = makePiece('n', playerColor)

  return {
    seed: seed >>> 0,
    board,
    incoming,
    spawned: ROWS + 1,
    player,
    playerType: 'n',
    base: null,
    queenLeft: 0,
    playerColor,
    enemyColor,
    score: 0,
    captures: 0,
    combo: 0,
    bestCombo: 0,
    kings: 0,
    distance: 0,
    chain: ['n'],
    status: 'playing',
    endReason: null,
    events: [],
    kingless: 0,
  }
}

function cloneState(state: DailyState): DailyState {
  return {
    ...state,
    board: cloneBoard(state.board),
    incoming: { id: state.incoming.id, cells: [...state.incoming.cells] },
    player: { ...state.player },
    chain: [...state.chain],
    events: [],
  }
}

/* ------------------------------------------------------------------ *
 * Hamle
 * ------------------------------------------------------------------ */

/**
 * Oynanabilir kareler: taşın tüm satranç hamleleri. Güvenlik SÜZÜLMEZ —
 * vurulan kareye basmak serbest, sonucu ölüm. En alt satır da oynanabilir:
 * orada bir sonraki kaymaya kadar vaktin var.
 */
export function dailyMoves(state: DailyState): Pos[] {
  if (state.status !== 'playing') return []
  return pseudoMoves(state.board, state.player, state.playerColor)
}

/** Vurulan taşın puanı: değer × günlük çarpan × zincir çarpanı */
export function capturePoints(type: PieceType, combo: number): number {
  return PIECE_VALUE[type] * DAILY_SCORE_FACTOR * Math.min(DAILY_MAX_COMBO, Math.max(1, combo))
}

export function applyDailyMove(state: DailyState, to: Pos): DailyState {
  if (state.status !== 'playing') return state
  if (!dailyMoves(state).some((pos) => samePos(pos, to))) return state

  const next = cloneState(state)
  const from = next.player
  const moving = next.board[from.row].cells[from.col]
  if (!moving) return state

  const target = next.board[to.row].cells[to.col]

  if (target) {
    next.captures += 1
    next.combo += 1
    next.bestCombo = Math.max(next.bestCombo, next.combo)
    const points = capturePoints(target.type, next.combo)
    next.score += points

    if (target.type === 'k') {
      next.kings += 1
      next.events.push({ kind: 'capture', piece: 'k', points, combo: next.combo })
      if (next.playerType !== 'q') {
        // Mantar: vezir ol, eski taşını hatırla
        next.base = next.playerType
        next.playerType = 'q'
        next.chain.push('q')
        next.events.push({ kind: 'promote', points })
      }
      // Vezirken şah: sayaç yenilenir
      next.queenLeft = DAILY_QUEEN_CAPTURES
    } else {
      next.events.push({ kind: 'capture', piece: target.type, points, combo: next.combo })
      if (next.playerType === 'q') {
        // Vezirken yeme dönüşüm vermez; sayaç işler, dolunca eski taşa dönüş
        // queenLeft 0 iken vezirsen (sınırsız kip) sayaç işlemez
        if (DAILY_QUEEN_CAPTURES > 0 && next.base && next.queenLeft > 0) {
          next.queenLeft -= 1
          if (next.queenLeft === 0) {
            next.playerType = next.base
            next.base = null
            next.queenLeft = 0
            next.chain.push(next.playerType)
            next.events.push({ kind: 'expire', to: next.playerType })
          }
        }
      } else if (target.type !== next.playerType) {
        next.playerType = target.type
        next.chain.push(target.type)
        next.events.push({ kind: 'transform', to: target.type })
      }
    }
  } else {
    next.combo = 0
  }

  next.board[from.row].cells[from.col] = null
  next.board[to.row].cells[to.col] = { ...moving, type: next.playerType }
  next.player = { ...to }

  // Tehlike hamleden SONRAKİ tahtada ölçülür: yediğin taş bir kalenin
  // hattını kapatıyor olabilirdi, şimdi açıldı.
  //
  // İstisna: ŞAHI YEMEK HER ZAMAN GÜVENLİ. Korunan şahı yediğinde vezir olup
  // aynı anda vurulmak (mantar gelir gider) oyuncuya "şah beni yedi" gibi
  // görünüyordu (18 Ağustos canlı test). Mantar bundan sonraki bir vuruşu
  // karşılar; şahı almak her zaman ödül, asla ceza.
  const attacked =
    target?.type !== 'k' && enemyThreats(next.board, next.playerColor, next.enemyColor).has(key(to))
  if (attacked) {
    if (next.playerType === 'q' && next.base) {
      // Vuruldun ama vezirdin: küçül, devam et
      next.playerType = next.base
      next.base = null
      next.queenLeft = 0
      next.chain.push(next.playerType)
      next.board[to.row].cells[to.col] = { ...moving, type: next.playerType }
      next.events.push({ kind: 'shrink', to: next.playerType })
    } else {
      next.status = 'gameover'
      next.endReason = 'captured'
      next.events.push({ kind: 'gameover', reason: 'captured' })
    }
  }

  return next
}

/* ------------------------------------------------------------------ *
 * Kayma adımı — arayüz her tam satırda bir kez çağırır
 * ------------------------------------------------------------------ */

export function applyDailyScroll(state: DailyState): DailyState {
  if (state.status !== 'playing') return state

  const next = cloneState(state)

  // En alt satırdayken kayma = düşüş
  if (next.player.row >= ROWS - 1) {
    next.status = 'gameover'
    next.endReason = 'fellOff'
    next.events.push({ kind: 'gameover', reason: 'fellOff' })
    return next
  }

  next.board = [next.incoming, ...next.board.slice(0, ROWS - 1)]
  // Şah yoksa sayaç işler; bekleme dolunca sıradaki satır bir şah getirir.
  // Giren satırda şah varsa (yolda) sayaç sıfır — çift şah doğmaz.
  const kingOnBoard = hasKing(next.board, next.enemyColor)
  next.kingless = kingOnBoard ? 0 : next.kingless + 1
  const withKing = !kingOnBoard && next.kingless >= DAILY_KING_GAP_ROWS
  next.incoming = spawnDailyRow(next.seed, next.spawned, next.enemyColor, withKing)
  if (withKing) next.kingless = 0
  next.spawned += 1
  next.player = { row: next.player.row + 1, col: next.player.col }
  next.distance += 1

  const points = DAILY_ROW_SCORE * DAILY_SCORE_FACTOR
  next.score += points
  next.events.push({ kind: 'scroll', points })
  return next
}

/**
 * Oyuncuyu vuran taş — yenilme sahnesi için. Birden çok vuran varsa en
 * yakını (o "yer"). Vurulmuyorsa null.
 */
export function dailyStriker(state: DailyState): Pos | null {
  const attackers = [...attackersOf(state.board, state.player, state.playerColor, state.enemyColor).values()]
  if (attackers.length === 0) return null
  return attackers.reduce((best, pos) =>
    chebyshev(pos, state.player) < chebyshev(best, state.player) ? pos : best,
  )
}

/** Oyuncunun taşı şu an vurulan bir karede mi? (arayüz uyarısı için) */
export function dailyUnderThreat(state: DailyState): boolean {
  return enemyThreats(state.board, state.playerColor, state.enemyColor).has(key(state.player))
}

export { colsOf }
