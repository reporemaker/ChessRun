import type { Rng } from './random'

/** Taş tipleri: piyon, at, fil, kale, vezir, şah */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

/** w = beyaz, b = siyah */
export type Color = 'w' | 'b'

export interface Piece {
  /** React key'leri ve animasyon takibi için kalıcı kimlik */
  id: number
  type: PieceType
  color: Color
}

export interface Pos {
  row: number
  col: number
}

export type Cell = Piece | null

/** Satır kimliği, tahta kaydığında React'in satırları doğru eşlemesi için */
export interface Row {
  id: number
  cells: Cell[]
}

/** board[0] = en üst (en yeni) satır, board[ROWS-1] = en alt (silinmek üzere olan) satır */
export type Board = Row[]

export type GameStatus = 'playing' | 'gameover'

/**
 * 'classic'  - Av: yediğine dönüşürsün, rakip şahı avlarsın.
 * 'kingRun'  - Kaçış: şah sensin, vurulan kareye giremezsin,
 *              puan hayatta kalınan satır. Ana oyunun aynadaki yansıması.
 * 'trio'     - Üçlü: vezir, kale ve fil senin; her tur yalnızca birini
 *              oynarsın, oynamadıkların bir satır düşer. Tek taş değil
 *              kadro yönetiyorsun; bir taşı kaybetmek koşuyu bitirmez.
 */
export type GameMode = 'classic' | 'kingRun' | 'trio' | 'daily'

export type GameEvent =
  | { kind: 'capture'; piece: PieceType; points: number }
  | { kind: 'kingBonus'; points: number; lives: number }
  | { kind: 'transform'; to: PieceType }
  | { kind: 'lifeLost'; reason: 'captured' | 'fellOff' }
  | { kind: 'scroll' }
  /** Oyuncu rakip şaha şah çekti - rakip bu turda savunmak zorunda */
  | { kind: 'check'; points: number; streak: number }
  /** Şahı kurtaracak hamle kalmadı: rakip başka bir taşını rastgele oynadı */
  | { kind: 'mate'; points: number }
  /** Şah Kaçışı: oyuncu mat oldu, koşu bitti */
  | { kind: 'checkmated' }
  /** Hamlesi kalmadı: tahta yeniden dizildi, bir sıkışma hakkı gitti */
  | { kind: 'stuck'; points: number; left: number }
  /** Üçlü: kadrodan bir taş gitti - koşu bitmez, kadro küçülür */
  | { kind: 'pieceLost'; piece: PieceType; reason: 'captured' | 'fellOff'; left: number }
  /** Üçlü: şah yendi, eksik taş geri geldi (ya da dördüncü taş katıldı) */
  | { kind: 'squadGain'; piece: PieceType; size: number }
  /** Üçlü: hamle yeni rakip taşları tehdit altına aldı */
  | { kind: 'threat'; points: number; count: number }
  /** Hamlesi kalmadı ve sıkışma hakkı bitti: koşu bitti */
  | { kind: 'stuckOut' }
  /** Şah yendi - tahta baştan kuruldu */
  | { kind: 'boardRefresh' }
  | { kind: 'gameover' }

export interface GameState {
  mode: GameMode
  /** Tohum verildiyse oyun birebir tekrarlanabilir; null = serbest oyun */
  seed: number | null
  /** Bu koşunun rastgelelik akışı - tohumluysa deterministik */
  rng: Rng
  board: Board
  /** Aktif taşın tahtadaki konumu - her zaman squad[selected] */
  player: Pos
  /**
   * Oyuncunun tahtadaki bütün taşları. Av ve Kaçış'ta tek elemanlı;
   * Üçlü'de üç (şah yendikçe dört) taş.
   */
  squad: Pos[]
  /** Kadroda hangi taş seçili - hamle onunla oynanıyor */
  selected: number
  /** Oyuncunun şu anki taşı - yediği taşa dönüştüğü için değişir */
  playerType: PieceType
  /** Dönüşüm zinciri: koşunun hikâyesi (♞→♟→♛…), paylaşım kartında kullanılır */
  chain: PieceType[]
  playerColor: Color
  enemyColor: Color
  score: number
  lives: number
  /** Kaç satır ilerlendi - hem mesafe hem zorluk seviyesinin kaynağı */
  distance: number
  /** Art arda kaç tur şah çekildi - şah puanının çarpanı */
  checkStreak: number
  /** Kalan sıkışma hakkı: bitince hamlesizlik ölüm demek */
  stuckLeft: number
  status: GameStatus
  /** Son turda olanlar - HUD ve efektler için */
  events: GameEvent[]
  /** Kayma animasyonunu tetiklemek için artan sayaç */
  scrollTick: number
  /** Tahtanın baştan kurulma sayısı - dökülme animasyonunu tetikler */
  refreshTick: number
}
