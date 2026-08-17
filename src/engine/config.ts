import type { GameMode, PieceType } from './types'

/**
 * Tahta genişliği oyun başında seçilir. Dar koridor tamamen farklı bir oyun:
 * kaçacak yer az, ama düşman da az doğuyor.
 */
export const MIN_COLS = 4
export const MAX_COLS = 8
export const DEFAULT_COLS = MAX_COLS
export const COL_CHOICES: number[] = [4, 5, 6, 7, 8]

/**
 * Oyuncuya sunulan koridor genişlikleri: 4–8 sütun, beşi de seçilebilir.
 *
 * Bir ara üç adlandırılmış kademe (dar/orta/geniş = 4/6/8) denendi; ölçümde
 * 5 ve 7 komşularından belirgin ayrışmıyordu. Yine de kaldırıldı çünkü
 * "8'de oynuyorum, biraz daha dar istiyorum" diyen oyuncunun 6'ya düşmek
 * dışında seçeneği kalmıyordu — ince ayar hakkı ölçümden değerli.
 * Eski kayıtlardaki `narrow|medium|wide` değerleri okunurken sayıya
 * çevriliyor (settings.ts), kimsenin tercihi kaybolmuyor.
 */
export const DEFAULT_CORRIDOR_COLS = MAX_COLS

/** Eski adlandırılmış kademeler → sütun; yalnızca geriye dönük okuma için */
export const LEGACY_CORRIDOR: Record<string, number> = { narrow: 4, medium: 6, wide: MAX_COLS }

export function clampCols(cols: number): number {
  return Math.max(MIN_COLS, Math.min(MAX_COLS, Math.round(cols)))
}

/** Aynı anda görünen satır sayısı. Yeni satır üstten eklenir, en alttaki silinir. */
export const ROWS = 8

/** Standart satranç taş değerleri. Şah normalde puanlanmaz; burada bonus hedefi. */
export const PIECE_VALUE: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 25,
}

export const START_LIVES = 3

/**
 * Oyuncunun başlangıç taşı.
 *
 * Piyon olamaz: kayma her turda olduğu için piyon 1 kare ilerlerken tahta
 * onu 1 kare geri itiyor — net ilerlemesi sıfır. Hiçbir ava yetişemiyor,
 * sadece kendisine gelen taşları bekliyor ve karşı piyonla karşılaştığında
 * her zaman kaybediyor. At ise turda net 1 satır kazanabildiği için
 * oyuncuya gerçek bir seçenek alanı bırakıyor.
 */
export const START_PIECE: PieceType = 'n'

/** Şah yemenin ekstra can ödülü (Mario 1-up mantığı) */
export const KING_BONUS_LIVES = 1

/**
 * Şah çekmenin puanı. Art arda şah çekmek çarpanı büyütür: rakip her
 * seferinde bir turunu savunmaya harcadığı için zincir şah, tahtayı
 * dondurup şaha yaklaşmanın yolu. Oyunun asıl beceri ifadesi burada.
 */
export const CHECK_SCORE = 2
export const MAX_CHECK_STREAK = 5

/** Rakip şahını kurtaramadığında (mat) ek puan */
export const MATE_SCORE = 5

/**
 * Hayatta kalınan her satırın puanı — üç modda da aynı.
 *
 * Ölçümle konuldu: eskiden puan yalnızca yemekten geldiği için ChessRun
 * dakikada 28.7 puan verirken Şah Kaçışı 62.3 veriyordu. Satır puanı
 * eklenince ikisi de ~60'a oturuyor, yani oyuncunun harcadığı süre her
 * modda aynı karşılığı alıyor.
 */
export const ROW_SCORE = 1

/**
 * Sıkışma: hamlen kalmadığında tahta yeniden diziliyor.
 *
 * Bekleme düğmesi kaldırıldı — hamlen varsa oynamak zorundasın (gerçek
 * satrançtaki hamle zorunluluğu). Ama hamlesiz kalmak oyuncunun hatası
 * olmayabilir, o yüzden sıkışmak sayılı bir kurtuluş: hakkın varken tahta
 * yenilenir ve puan alırsın, hakkın bitince sıkışmak ölümdür.
 *
 * Ödül olması bilerek: kurtuluş anı bir kayıp gibi değil, kazanılmış bir
 * nefes gibi hissettirmeli. Sayıya bağlı olduğu için de sömürülemiyor —
 * bilerek sıkışmaya çalışan oyuncu sadece haklarını tüketir.
 */
export const STUCK_RIGHTS = 2
export const STUCK_SCORE = 5

/**
 * Tur akışı: oyuncu oynar → tahta bir satır kayar → rakip oynar.
 * Kayma her turda olduğu için piyon yerinde sayar; ilerlemek ancak
 * daha hareketli bir taşa dönüşmekle mümkün.
 */
export const ROWS_PER_LEVEL = 12

/**
 * Yeni satırda doğan taş sayısı — kare başına olasılık değil, satır başına
 * beklenen adet. `0.75` şu demek: satırların **%75'inde tam bir taş** doğar,
 * kalan %25'i bomboş gelir. Tam kısmı garanti, kesir kısmı olasılık olduğu
 * için 1.5 → "bir taş kesin, ikincisi %50" anlamına gelir.
 */
export const BASE_ROW_PIECES = 0.75
export const ROW_PIECES_PER_LEVEL = 0.15
export const MAX_ROW_PIECES = 2.5

/**
 * Denge valfi: kale/vezirle oynarken düşman daha yoğun doğar.
 * Güçlü taşa dönüşmenin bir bedeli olsun diye. Kapatmak için 0 yap.
 */
export const HEAVY_PIECE_TYPES: PieceType[] = ['r', 'q']
export const HEAVY_PIECE_ROW_BONUS = 0.25

/** Piyon dışındaki düşman taşlarının doğma ağırlıkları (şah ayrı yönetilir) */
export const MINOR_SPAWN_WEIGHTS: Array<[PieceType, number]> = [
  ['n', 18],
  ['b', 18],
  ['r', 12],
  ['q', 7],
]

/**
 * Piyon, diğer taşların toplamının üçte biri kadar çıkar.
 * Piyon kalabalığı hem tahtayı tıkıyor hem de dönüşünce oyuncuyu
 * en zayıf taşa düşürdüğü için oyunu tekdüzeleştiriyordu.
 */
export const PAWN_SPAWN_RATIO = 1 / 3

const MINOR_WEIGHT_TOTAL = MINOR_SPAWN_WEIGHTS.reduce((sum, [, w]) => sum + w, 0)

export const SPAWN_WEIGHTS: Array<[PieceType, number]> = [
  ['p', MINOR_WEIGHT_TOTAL * PAWN_SPAWN_RATIO],
  ...MINOR_SPAWN_WEIGHTS,
]

/** Açılışta oyuncunun çevresinde kaç satır boş bırakılır */
export const OPENING_SAFE_ROWS = 3

/**
 * Oyuncu hâlâ 0 puandayken, yeni satıra bilerek yakalanabilir bir piyon konur.
 * Hiçbir koşuda 0 puanla bitilmesin diye.
 */
export const BAIT_UNTIL_FIRST_CAPTURE = true
export const BAIT_START_DISTANCE = 2

/* ------------------------------------------------------------------ *
 * Üçlü
 *
 * Üç uzun menzilli taş, turda tek hamle. Altın kural: N taşın varsa ve
 * turda bir hamle oynuyorsan, oynadığın taş **en az N satır** tırmanmalı —
 * yoksa kadro topluca dibe iner. Üçü de kayan taş (vezir/kale/fil) olması
 * bu yüzden: at ya da piyonla bu ekonomi kapanmıyor.
 * ------------------------------------------------------------------ */

/** Kadronun açılış taşları — sırası aynı zamanda eksik taşın geri geliş sırası */
export const TRIO_TYPES: PieceType[] = ['q', 'r', 'b']

/**
 * Kadro tavanı. Dördüncü taş bilerek son sınır: her taş turda bir hamle
 * paylaştığı için beşinci taş "hediye" değil, herkesin sırasını seyrelten
 * bir yük olurdu.
 */
export const TRIO_MAX_SQUAD = 4

/** Rakip taşı yeni tehdit altına almanın puanı ve tur başına tavanı */
export const TRIO_THREAT_SCORE = 1
export const TRIO_THREAT_CAP = 3

/** Üçlüde mat büyük ikramiye: kadroyla kurulan tuzağın karşılığı */
export const TRIO_MATE_SCORE = 20

/**
 * Üçlüde düşman yoğunluğu — ölçümle **1'e** indi.
 *
 * Tasarımda "kabaca iki katı" deniyordu; 300'er koşuluk ölçüm bunun modu
 * bitirdiğini gösterdi. Çarpan 2 iken koşu 10.5 tur sürüyor, 1.5'te 13.6,
 * 1'de 20.6 — Av 17.6 ve Kaçış 23.0 turun arasına ancak 1'de oturuyor.
 * Sebebi tırmanma ekonomisi: üç taşla turda bir hamle oynanınca oynanan
 * taşın **3 satır** birden tırmanması gerekiyor, yoğun tahtada ise kayan
 * taşların yolu kapanıp tırmanış 1-2 satıra düşüyor.
 *
 * Ağır taş primi (rowPieces içindeki +0.25) Üçlü'de uygulanmıyor: kadroda
 * zaten her zaman bir vezir var, prim sürekli açık kalırdı.
 */
export const TRIO_ROW_MULTIPLIER = 1
export const TRIO_MAX_ROW_PIECES = MAX_ROW_PIECES

/** Üçlünün en dar koridoru — 4 sütunda üç kayan taş birbirini kilitliyor */
export const TRIO_MIN_COLS = 6

/** Zorluk seviyesi */
export function levelOf(distance: number): number {
  return Math.floor(distance / ROWS_PER_LEVEL)
}

/**
 * Yeni satırda doğacak taş sayısının beklenen değeri.
 *
 * Genişlikle orantılı: 4 sütunluk koridorda satır başına aynı sayıda taş
 * doğurmak, tam tahtanın iki katı yoğunluk demek olurdu — dar koridor
 * "daha sıkışık bir oyun" olsun diye seçiliyor, "iki kat cezalı" olsun
 * diye değil. Kare başına düşen baskı her genişlikte aynı kalıyor.
 */
export function rowPieces(
  distance: number,
  playerType: PieceType,
  cols: number = MAX_COLS,
): number {
  let pieces = BASE_ROW_PIECES + levelOf(distance) * ROW_PIECES_PER_LEVEL
  if (HEAVY_PIECE_TYPES.includes(playerType)) pieces += HEAVY_PIECE_ROW_BONUS
  return Math.min(MAX_ROW_PIECES, pieces) * (clampCols(cols) / MAX_COLS)
}

/**
 * Moda göre yoğunluk. Üçlüde ağır taş primi yok — kadroda zaten hep bir
 * vezir var, prim sürekli açık kalırdı; yerine sabit bir çarpan geçiyor.
 */
export function rowPiecesOf(
  mode: GameMode,
  distance: number,
  playerType: PieceType,
  cols: number = MAX_COLS,
): number {
  if (mode !== 'trio') return rowPieces(distance, playerType, cols)

  const pieces = (BASE_ROW_PIECES + levelOf(distance) * ROW_PIECES_PER_LEVEL) * TRIO_ROW_MULTIPLIER
  return Math.min(TRIO_MAX_ROW_PIECES, pieces) * (clampCols(cols) / MAX_COLS)
}

/** Modun en dar koridoru — Üçlü 4 sütuna sığmıyor */
export function minColsOf(mode: GameMode): number {
  return mode === 'trio' ? TRIO_MIN_COLS : MIN_COLS
}
