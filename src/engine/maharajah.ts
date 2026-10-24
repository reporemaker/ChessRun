/**
 * Mihrace (Maharajah): tek taş (vezir + at hareketi) bütün orduya karşı.
 * Kayan tahta yok, klasik 8×8. Prototipler: m.html (Şahin) ve n.html (Avcı),
 * 25-26 Ağustos 2026; kurallar 22 Ekim 2026'da kesinleşti.
 *
 *   Şahin  (falcon): oyuncu mihrace, bot ordu. Kazanç: şahı mat etmek.
 *   Avcı   (hunter): oyuncu ordu, bot mihrace. Kazanç: mihraceyi yemek.
 *
 * Kurallar: piyon son karede dönüşmez (donar), rok var, geçerken alma yok.
 * Pat iki taraf için de beraberlik. 50 hamle kuralı (100 yarım hamle, taş
 * yenmeden ve piyon oynamadan) ve üç kez tekrar beraberlik. Mihrace şahı
 * yiyemez, şah çeker; mihraceyi yemek her zaman yasal.
 *
 * Oyuncu her iki modda da altta: Şahin'de ordu üstte, Avcı'da altta.
 * Saf fonksiyonlar: durum alır, yeni durum döner. Bot kendi çalışma kopyasında
 * geçici hamle yapıp geri alıyor (prototiplerdeki gibi).
 */

export type MhMode = 'falcon' | 'hunter'
export type MhKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k' | 'A'
export type MhSide = 'army' | 'amazon'

export interface MhPiece {
  id: number
  t: MhKind
}

export type MhGrid = (MhPiece | null)[][]

export interface MhPos {
  r: number
  c: number
}

export interface MhMove {
  fr: number
  fc: number
  r: number
  c: number
  castle?: 'k' | 'q'
}

export type MhOutcome = 'win' | 'loss' | 'draw'
export type MhReason = 'mate' | 'captured' | 'stalemate' | 'fifty' | 'repetition'

/** Rok hakları: true = o taş oynadı (ya da yok), rok yok */
export interface MhMoved {
  k: boolean
  qr: boolean
  kr: boolean
}

export interface MhState {
  mode: MhMode
  board: MhGrid
  /** Mihracenin yeri; yendiyse null */
  amazon: MhPos | null
  /** Ordu üstte mi (Şahin) - piyon yönü ve ev satırı buna bağlı */
  armyTop: boolean
  moved: MhMoved
  toMove: MhSide
  /** 50 hamle kuralı: taş yenmeden ve piyon oynamadan geçen yarım hamle */
  quiet: number
  /** Pozisyon anahtarı → kaç kez görüldü (üç kez tekrar) */
  seen: Record<string, number>
  lastMove: MhMove | null
  /** Botun son hamlesi (Avcı botu ileri geri sallanmasın) */
  lastBot: MhMove | null
  /** Oyuncunun yaptığı hamle sayısı */
  plies: number
  /** Oyuncunun yediği taşlar (puanlama sonra) */
  captured: number
  /**
   * Kılavuz: hamle hedeflerinde rakibin tehdit ettiği kareler kırmızı nokta ile
   * gösterilir. Kapalıysa oyuncu tehlikeyi kendi görür ve puan ×2 olur. Oyun
   * başında sabitlenir (durumda taşınır ki oyun sürerken değişmesin, devam
   * fişinden sürerken de korunsun). Eski fişlerde alan yok → açık sayılır.
   */
  guide?: boolean
  result: { outcome: MhOutcome; reason: MhReason } | null
}

export const MH_VALUE: Record<Exclude<MhKind, 'A'>, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
/** 50 hamle = iki tarafın 50'şer hamlesi */
export const MH_QUIET_LIMIT = 100

const RAYS_R = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const RAYS_B = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const
const RAYS_Q = [...RAYS_R, ...RAYS_B]
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] as const
const BACK: MhKind[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']

const inB = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8
const sq = (r: number, c: number) => r * 8 + c

export function playerSide(mode: MhMode): MhSide {
  return mode === 'falcon' ? 'amazon' : 'army'
}

/** Ordunun ev satırı ve piyon yönü */
function homeRow(armyTop: boolean) {
  return armyTop ? 0 : 7
}
function pawnDir(armyTop: boolean) {
  return armyTop ? 1 : -1
}

export function newMaharajah(mode: MhMode, guide = true): MhState {
  const armyTop = mode === 'falcon'
  const home = homeRow(armyTop)
  const pawns = home + pawnDir(armyTop)
  const board: MhGrid = Array.from({ length: 8 }, () => Array<MhPiece | null>(8).fill(null))
  let id = 1
  BACK.forEach((t, c) => (board[home][c] = { id: id++, t }))
  for (let c = 0; c < 8; c++) board[pawns][c] = { id: id++, t: 'p' }
  const amazon = { r: armyTop ? 7 : 0, c: 4 }
  board[amazon.r][amazon.c] = { id: id++, t: 'A' }
  const state: MhState = {
    mode,
    board,
    amazon,
    armyTop,
    moved: { k: false, qr: false, kr: false },
    // Her iki modda da ilk hamle oyuncunun
    toMove: playerSide(mode),
    quiet: 0,
    seen: {},
    lastMove: null,
    lastBot: null,
    plies: 0,
    captured: 0,
    guide,
    result: null,
  }
  state.seen[positionKey(state)] = 1
  return state
}

/* ------------------------------------------------------------------ *
 * Hamle üretimi (çalışma tahtası üzerinde)
 * ------------------------------------------------------------------ */

interface Ctx {
  b: MhGrid
  amz: MhPos | null
  armyTop: boolean
  moved: MhMoved
}

const ctxOf = (s: MhState): Ctx => ({ b: s.board.map((row) => row.slice()), amz: s.amazon, armyTop: s.armyTop, moved: s.moved })

export function amazonAttacks(b: MhGrid, pos: MhPos): Set<number> {
  const set = new Set<number>()
  for (const [dr, dc] of RAYS_Q) {
    let r = pos.r + dr
    let c = pos.c + dc
    while (inB(r, c)) {
      set.add(sq(r, c))
      if (b[r][c]) break
      r += dr
      c += dc
    }
  }
  for (const [dr, dc] of KNIGHT) {
    const r = pos.r + dr
    const c = pos.c + dc
    if (inB(r, c)) set.add(sq(r, c))
  }
  return set
}

/** Mihracenin hamleleri: boş kare ya da şah dışındaki ordu taşı */
export function amazonMoves(b: MhGrid, from: MhPos): MhMove[] {
  const out: MhMove[] = []
  const add = (r: number, c: number) => out.push({ fr: from.r, fc: from.c, r, c })
  for (const [dr, dc] of RAYS_Q) {
    let r = from.r + dr
    let c = from.c + dc
    while (inB(r, c)) {
      const p = b[r][c]
      if (!p) add(r, c)
      else {
        if (p.t !== 'k') add(r, c)
        break
      }
      r += dr
      c += dc
    }
  }
  for (const [dr, dc] of KNIGHT) {
    const r = from.r + dr
    const c = from.c + dc
    if (!inB(r, c)) continue
    const p = b[r][c]
    if (!p || p.t !== 'k') add(r, c)
  }
  return out
}

/** Ordunun tehdit ettiği kareler (savunma hesabı için) */
export function armyAttacks(b: MhGrid, armyTop: boolean): Set<number> {
  const set = new Set<number>()
  const dir = pawnDir(armyTop)
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r][c]
      if (!p || p.t === 'A') continue
      if (p.t === 'p') {
        for (const dc of [-1, 1]) if (inB(r + dir, c + dc)) set.add(sq(r + dir, c + dc))
      } else if (p.t === 'n') {
        for (const [dr, dc] of KNIGHT) if (inB(r + dr, c + dc)) set.add(sq(r + dr, c + dc))
      } else if (p.t === 'k') {
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && inB(r + dr, c + dc)) set.add(sq(r + dr, c + dc))
      } else {
        const rays = p.t === 'r' ? RAYS_R : p.t === 'b' ? RAYS_B : RAYS_Q
        for (const [dr, dc] of rays) {
          let rr = r + dr
          let cc = c + dc
          while (inB(rr, cc)) {
            set.add(sq(rr, cc))
            if (b[rr][cc]) break
            rr += dr
            cc += dc
          }
        }
      }
    }
  return set
}

export function kingPos(b: MhGrid): MhPos | null {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c]?.t === 'k') return { r, c }
  return null
}

function inCheck(x: Ctx): boolean {
  const k = kingPos(x.b)
  return Boolean(k && x.amz && amazonAttacks(x.b, x.amz).has(sq(k.r, k.c)))
}

/** Ordu hamlesi yasal mı: şahı mihraceye bırakmıyor. Mihraceyi yemek her zaman yasal. */
function legalArmy(x: Ctx, fr: number, fc: number, r: number, c: number): boolean {
  const cap = x.b[r][c]
  if (cap?.t === 'A') return true
  x.b[r][c] = x.b[fr][fc]
  x.b[fr][fc] = null
  const bad = inCheck(x)
  x.b[fr][fc] = x.b[r][c]
  x.b[r][c] = cap
  return !bad
}

function armyMovesFrom(x: Ctx, r: number, c: number): MhMove[] {
  const out: MhMove[] = []
  const p = x.b[r][c]
  if (!p || p.t === 'A') return out
  const push = (rr: number, cc: number, castle?: 'k' | 'q') => {
    if (castle || legalArmy(x, r, c, rr, cc)) out.push(castle ? { fr: r, fc: c, r: rr, c: cc, castle } : { fr: r, fc: c, r: rr, c: cc })
  }
  const enemy = (rr: number, cc: number) => x.b[rr][cc]?.t === 'A'
  if (p.t === 'p') {
    // Dönüşüm yok: son satırdaki piyonun ileri karesi tahta dışı, donar
    const dir = pawnDir(x.armyTop)
    const start = homeRow(x.armyTop) + dir
    if (inB(r + dir, c) && !x.b[r + dir][c]) {
      push(r + dir, c)
      if (r === start && !x.b[r + 2 * dir][c]) push(r + 2 * dir, c)
    }
    for (const dc of [-1, 1]) if (inB(r + dir, c + dc) && enemy(r + dir, c + dc)) push(r + dir, c + dc)
  } else if (p.t === 'n') {
    for (const [dr, dc] of KNIGHT) {
      const rr = r + dr
      const cc = c + dc
      if (inB(rr, cc) && (!x.b[rr][cc] || enemy(rr, cc))) push(rr, cc)
    }
  } else if (p.t === 'k') {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const rr = r + dr
        const cc = c + dc
        if (inB(rr, cc) && (!x.b[rr][cc] || enemy(rr, cc))) push(rr, cc)
      }
    // Rok: şah ve kale yerinde ve oynamamış, arası boş, şah tehdit altında
    // değil, geçtiği iki kare de tehdit altında değil
    const home = homeRow(x.armyTop)
    if (r === home && c === 4 && !x.moved.k && !inCheck(x)) {
      const atk = x.amz ? amazonAttacks(x.b, x.amz) : new Set<number>()
      const free = (cc: number) => !x.b[home][cc]
      const safe = (cc: number) => !atk.has(sq(home, cc))
      if (!x.moved.kr && x.b[home][7]?.t === 'r' && free(5) && free(6) && safe(5) && safe(6)) push(home, 6, 'k')
      if (!x.moved.qr && x.b[home][0]?.t === 'r' && free(1) && free(2) && free(3) && safe(2) && safe(3)) push(home, 2, 'q')
    }
  } else {
    const rays = p.t === 'r' ? RAYS_R : p.t === 'b' ? RAYS_B : RAYS_Q
    for (const [dr, dc] of rays) {
      let rr = r + dr
      let cc = c + dc
      while (inB(rr, cc)) {
        if (!x.b[rr][cc]) push(rr, cc)
        else {
          if (enemy(rr, cc)) push(rr, cc)
          break
        }
        rr += dr
        cc += dc
      }
    }
  }
  return out
}

function armyMovesAll(x: Ctx): MhMove[] {
  const out: MhMove[] = []
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (x.b[r][c] && x.b[r][c]!.t !== 'A') out.push(...armyMovesFrom(x, r, c))
  return out
}

/** Sıradaki tarafın yasal hamleleri; `from` verilirse yalnızca o kareden */
export function legalMoves(s: MhState, from?: MhPos): MhMove[] {
  if (s.result) return []
  if (s.toMove === 'amazon') {
    if (!s.amazon) return []
    if (from && (from.r !== s.amazon.r || from.c !== s.amazon.c)) return []
    return amazonMoves(s.board, s.amazon)
  }
  const x = ctxOf(s)
  return from ? armyMovesFrom(x, from.r, from.c) : armyMovesAll(x)
}

export function isCheck(s: MhState): boolean {
  return inCheck(ctxOf(s))
}

/* ------------------------------------------------------------------ *
 * Hamle uygulama ve hakem
 * ------------------------------------------------------------------ */

export function positionKey(s: Pick<MhState, 'board' | 'toMove' | 'moved'>): string {
  let key = s.toMove === 'army' ? 'a' : 'm'
  key += `${+s.moved.k}${+s.moved.qr}${+s.moved.kr}`
  for (const row of s.board) for (const p of row) key += p ? p.t : '.'
  return key
}

export function applyMove(s: MhState, m: MhMove): MhState {
  const board = s.board.map((row) => row.slice())
  const mover = board[m.fr][m.fc]!
  const victim = board[m.r][m.c]
  board[m.r][m.c] = mover
  board[m.fr][m.fc] = null
  let amazon = s.amazon
  if (mover.t === 'A') amazon = { r: m.r, c: m.c }
  if (victim?.t === 'A') amazon = null

  const home = homeRow(s.armyTop)
  if (m.castle === 'k') {
    board[home][5] = board[home][7]
    board[home][7] = null
  } else if (m.castle === 'q') {
    board[home][3] = board[home][0]
    board[home][0] = null
  }
  const moved = { ...s.moved }
  if (mover.t === 'k') moved.k = true
  if (m.fr === home && m.fc === 0) moved.qr = true
  if (m.fr === home && m.fc === 7) moved.kr = true
  // Kale yerinde yendiyse o tarafa rok da biter
  if (m.r === home && m.c === 0) moved.qr = true
  if (m.r === home && m.c === 7) moved.kr = true

  const byPlayer = (mover.t === 'A') === (s.mode === 'falcon')
  const next: MhState = {
    ...s,
    board,
    amazon,
    moved,
    toMove: s.toMove === 'army' ? 'amazon' : 'army',
    quiet: victim || mover.t === 'p' ? 0 : s.quiet + 1,
    seen: { ...s.seen },
    lastMove: m,
    lastBot: byPlayer ? s.lastBot : m,
    plies: s.plies + (byPlayer ? 1 : 0),
    captured: s.captured + (byPlayer && victim ? 1 : 0),
  }
  const key = positionKey(next)
  next.seen[key] = (next.seen[key] ?? 0) + 1
  next.result = judge(next, next.seen[key])
  return next
}

/** Hamleden sonra oyun bitti mi; sonuç oyuncunun gözünden */
function judge(s: MhState, repeats: number): MhState['result'] {
  const playerIsAmazon = s.mode === 'falcon'
  if (!s.amazon) return { outcome: playerIsAmazon ? 'loss' : 'win', reason: 'captured' }
  const x = ctxOf(s)
  if (s.toMove === 'army') {
    if (armyMovesAll(x).length === 0) {
      if (inCheck(x)) return { outcome: playerIsAmazon ? 'win' : 'loss', reason: 'mate' }
      return { outcome: 'draw', reason: 'stalemate' }
    }
  } else if (amazonMoves(s.board, s.amazon).length === 0) {
    return { outcome: 'draw', reason: 'stalemate' }
  }
  if (s.quiet >= MH_QUIET_LIMIT) return { outcome: 'draw', reason: 'fifty' }
  if (repeats >= 3) return { outcome: 'draw', reason: 'repetition' }
  return null
}

/* ------------------------------------------------------------------ *
 * Puan (oyun bitince)
 *
 *   taş    Şahin: yediğin ordu malzemesi · Avcı: kazanırsan ayakta
 *          tuttuğun malzeme (piyon 1 · at/fil 3 · kale 5 · vezir 9; ordu 39)
 *   sonuç  kazanç 50 · pat 10 · kayıp ve öteki beraberlikler 0
 *   hız    yalnızca kazançta: 50 hamleden önce biten her hamle +1
 *   çarpan kılavuz kapalıysa (tehlikeli kareler gösterilmez) ×2
 *
 * Puan haftalık lige giriyor (shared/leaderboard SCORE_CAP = 276), bu yüzden
 * bedava puan yok: Avcı'nın 39'u oyun başında hazır olduğu ve üç tekrar ya
 * da 50 hamle beraberliği birkaç hamlede zorlanabildiği için ikisi de
 * yalnızca gerçek bir sonuçla (kazanç / pat) puan getiriyor.
 * ------------------------------------------------------------------ */

export const MH_ARMY_VALUE = 39
export const MH_WIN_POINTS = 50
export const MH_STALEMATE_POINTS = 10
export const MH_SPEED_PAR = 50
/** Kılavuzsuz oyunun çarpanı */
export const MH_NO_GUIDE_MULTIPLIER = 2

export interface MhScore {
  material: number
  result: number
  speed: number
  /** Üç kalemin toplamı, çarpansız */
  base: number
  /** 1 (kılavuz açık) ya da MH_NO_GUIDE_MULTIPLIER */
  multiplier: number
  /** base × multiplier - lige giden ve rekor sayılan puan */
  total: number
}

/** Ordunun tahtada kalan malzemesi (şah sayılmaz) */
export function armyMaterial(b: MhGrid): number {
  let sum = 0
  for (const row of b) for (const p of row) if (p && p.t !== 'A') sum += MH_VALUE[p.t]
  return sum
}

/** Bitmiş oyunun puanı; oyun sürüyorsa null */
export function mhScore(s: MhState): MhScore | null {
  if (!s.result) return null
  const { outcome, reason } = s.result
  const left = armyMaterial(s.board)
  const material = s.mode === 'falcon' ? MH_ARMY_VALUE - left : outcome === 'win' ? left : 0
  const result = outcome === 'win' ? MH_WIN_POINTS : reason === 'stalemate' ? MH_STALEMATE_POINTS : 0
  const speed = outcome === 'win' ? Math.max(0, MH_SPEED_PAR - s.plies) : 0
  const base = material + result + speed
  const multiplier = s.guide === false ? MH_NO_GUIDE_MULTIPLIER : 1
  return { material, result, speed, base, multiplier, total: base * multiplier }
}

/* ------------------------------------------------------------------ *
 * Botlar (prototiplerden)
 * ------------------------------------------------------------------ */

/** Sıradaki bot hamlesi; oyun bittiyse ya da sıra oyuncudaysa null */
export function botMove(s: MhState, rand: () => number = Math.random): MhMove | null {
  if (s.result || s.toMove === playerSide(s.mode)) return null
  return s.mode === 'falcon' ? pickArmyMove(s, rand) : pickAmazonMove(s, rand)
}

/**
 * Şahin'de ordu (m.html): mihraceyi yiyebiliyorsa yer; yoksa bedava taş
 * kaptırmayan, mihraceyi savunulan kareye sıkıştıran hamle.
 */
function pickArmyMove(s: MhState, rand: () => number): MhMove | null {
  const x = ctxOf(s)
  const list = armyMovesAll(x)
  if (list.length === 0 || !x.amz) return null
  const kill = list.find((m) => x.b[m.r][m.c]?.t === 'A')
  if (kill) return kill
  let best = list[0]
  let bestScore = Infinity
  for (const m of list) {
    const fromP = x.b[m.fr][m.fc]!
    const toP = x.b[m.r][m.c]
    x.b[m.r][m.c] = fromP
    x.b[m.fr][m.fc] = null
    let score = 0
    const atk = amazonAttacks(x.b, x.amz)
    const def = armyAttacks(x.b, x.armyTop)
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = x.b[r][c]
        if (p && p.t !== 'A' && p.t !== 'k' && atk.has(sq(r, c)) && !def.has(sq(r, c))) score += MH_VALUE[p.t]
      }
    if (def.has(sq(x.amz.r, x.amz.c))) score -= 1.5
    const advance = x.armyTop ? m.r : 7 - m.r
    score -= (fromP.t === 'p' ? 0.08 * advance : 0) + 0.04 * (3.5 - Math.abs(3.5 - m.c))
    score += rand() * 0.3
    x.b[m.fr][m.fc] = fromP
    x.b[m.r][m.c] = toP
    if (score < bestScore) {
      bestScore = score
      best = m
    }
  }
  return best
}

/**
 * Avcı'da mihrace (n.html): mat > iki hamlede mat > güvenli yeme > şah ve
 * şahı sıkıştırma. Zorunlu değilse tehditli kareye gitmez; pat (artık
 * beraberlik) ve kapana kısılma cezalı.
 */
function pickAmazonMove(s: MhState, rand: () => number): MhMove | null {
  const x = ctxOf(s)
  if (!x.amz) return null
  const list = amazonMoves(x.b, x.amz)
  if (list.length === 0) return null

  const withAmazonAt = <T>(m: MhMove, f: () => T): T => {
    const saved = x.amz!
    const me = x.b[saved.r][saved.c]
    const victim = x.b[m.r][m.c]
    x.b[saved.r][saved.c] = null
    x.b[m.r][m.c] = me
    x.amz = { r: m.r, c: m.c }
    const res = f()
    x.b[m.r][m.c] = victim
    x.b[saved.r][saved.c] = me
    x.amz = saved
    return res
  }
  const withArmyMove = <T>(m: MhMove, f: () => T): T => {
    const p = x.b[m.fr][m.fc]
    const victim = x.b[m.r][m.c]
    x.b[m.r][m.c] = p
    x.b[m.fr][m.fc] = null
    const res = f()
    x.b[m.fr][m.fc] = p
    x.b[m.r][m.c] = victim
    return res
  }
  const isMate = () => inCheck(x) && armyMovesAll(x).length === 0
  const isStalemate = () => !inCheck(x) && armyMovesAll(x).length === 0

  const def0 = armyAttacks(x.b, x.armyTop)
  const safe = list.filter((m) => !def0.has(sq(m.r, m.c)))
  const cands = safe.length ? safe : list
  const mate = cands.find((m) => withAmazonAt(m, isMate))
  if (mate) return mate

  let best: MhMove | null = null
  let bestScore = -Infinity
  for (const m of cands) {
    const victim = x.b[m.r][m.c]
    let score = withAmazonAt(m, () => {
      if (isStalemate()) return -500
      let sc = 0
      const replies = armyMovesAll(x)
      if (inCheck(x)) {
        sc += 3
        // İki hamlede mat: her cevaba karşı güvenli bir mat hamlesi var mı
        let forced = true
        for (const w of replies) {
          if (x.b[w.r][w.c]?.t === 'A') {
            forced = false
            break
          }
          const ok = withArmyMove(w, () => {
            const d2 = armyAttacks(x.b, x.armyTop)
            return amazonMoves(x.b, x.amz!).some((a) => !d2.has(sq(a.r, a.c)) && withAmazonAt(a, isMate))
          })
          if (!ok) {
            forced = false
            break
          }
        }
        if (forced) sc += 200
      }
      // Oyuncunun cevabından sonra mihrace kapana kısılıyor mu
      let trapped = false
      for (const w of replies) {
        if (x.b[w.r][w.c]?.t === 'A') {
          trapped = true
          break
        }
        const t = withArmyMove(w, () => {
          const d2 = armyAttacks(x.b, x.armyTop)
          if (d2.has(sq(x.amz!.r, x.amz!.c))) return !amazonMoves(x.b, x.amz!).some((a) => !d2.has(sq(a.r, a.c)))
          return false
        })
        if (t) {
          trapped = true
          break
        }
      }
      if (trapped) sc -= 60
      // Şahı sıkıştır
      const k = kingPos(x.b)
      if (k) {
        const kingMob = replies.filter((w) => w.fr === k.r && w.fc === k.c).length
        sc += (8 - kingMob) * 0.6
        sc -= 0.35 * Math.max(Math.abs(k.r - x.amz!.r), Math.abs(k.c - x.amz!.c))
      }
      // Savunmasız hedefler
      const atk = amazonAttacks(x.b, x.amz!)
      const d = armyAttacks(x.b, x.armyTop)
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          const p = x.b[r][c]
          if (p && p.t !== 'A' && p.t !== 'k' && atk.has(sq(r, c)) && !d.has(sq(r, c))) sc += MH_VALUE[p.t] * 0.5
        }
      return sc
    })
    if (victim && victim.t !== 'A') score += MH_VALUE[victim.t] * 4
    if (!safe.length) score -= 100
    // İleri geri sallanma
    if (s.lastBot && m.r === s.lastBot.fr && m.c === s.lastBot.fc) score -= 1.2
    score += rand() * 0.4
    if (score > bestScore) {
      bestScore = score
      best = m
    }
  }
  return best
}
