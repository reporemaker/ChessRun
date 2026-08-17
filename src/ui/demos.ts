import type { PieceType, Color } from '../engine/types'
import type { StringKey } from './i18n'

/**
 * "Nasıl oynanır" mini animasyonları — kare kare (frame) veri.
 *
 * Her demo 5×5 küçük bir tahta ve bir kare dizisi: taşların yeri, vurgular,
 * kısa altyazı. Oynatıcı (MiniBoard) iki kare arasındaki farkı bulup
 * oyundaki hareket diliyle oynatıyor: taş kayar, yenen taş büyüyüp söner,
 * kaymada tahta bir satır iner. Veri saf; motor kullanılmıyor, çünkü
 * öğretim için "gerçek" değil "okunur" durum gerekiyor — ama her sahne
 * kurallara ve taş hareketlerine uygun (tur sırası: sen → kayma → rakip).
 *
 * Tahta gösterimi: satır dizisi, her hücre '.' ya da renk+tip ('wN', 'bR').
 * r0 en üst satır. Vurgular (bir karede birden fazla olabilir):
 *   ring   — sıradaki taşın (yeşil halka, oyundaki .player-square)
 *   select — kadrodaki bekleyen taş (sönük halka)
 *   dot    — oynanabilir kare (nötr nokta)
 *   target — yenecek taş / hedef kare (altın halka)
 *   danger — vurulan kare ya da ölüm satırı (kırmızı ×)
 *   glow   — şah çekilen kral (altın parıltı, oyundaki .checked-king)
 */

export type DemoId =
  | 'scroll'
  | 'stuck'
  | 'ambush'
  | 'transform'
  | 'chain'
  | 'kingBonus'
  | 'kingSafe'
  | 'kingClimb'
  | 'kingEnd'
  | 'trioPick'
  | 'trioDrift'
  | 'trioBack'

export type Mark = 'ring' | 'dot' | 'target' | 'danger' | 'glow' | 'select'

export interface Cell {
  color: Color
  type: PieceType
}

export interface Frame {
  /** Satırlar; hücre '.' boş, 'wN' beyaz at, 'bK' siyah şah */
  rows: string[][]
  marks?: Array<{ r: number; c: number; kind: Mark }>
  /** Bu kare bir kayma: oynatıcı tahtayı bir satır aşağı indirir */
  scroll?: boolean
  /** Tahta baştan kurulum: bütün tahta yanıp söner */
  refresh?: boolean
  /** Sağ üstte kısa rozet: +1, ×2, −1 … */
  tag?: string
  captionKey?: StringKey
  /** Süre çarpanı (1 = temel tempo) */
  hold?: number
}

export interface Demo {
  id: DemoId
  cols: number
  frames: Frame[]
}

export function parseCell(token: string): Cell | null {
  if (token === '.' || token.length !== 2) return null
  return { color: token[0] === 'w' ? 'w' : 'b', type: token[1].toLowerCase() as PieceType }
}

/** Kısa yazım: 5 satır, her satır 'wN . bR . .' */
const B = (...rows: string[]) => rows.map((s) => s.trim().split(/\s+/))

const M = (kind: Mark, ...cells: Array<[number, number]>) =>
  cells.map(([r, c]) => ({ r, c, kind }))

/** Ölüm satırı: en alt satırın tamamı × */
const DEATH = M('danger', [4, 0], [4, 1], [4, 2], [4, 3], [4, 4])

const F = (rows: string[][], extra: Omit<Frame, 'rows'> = {}): Frame => ({ rows, ...extra })

/* ------------------------------------------------------------------ *
 * Ortak kurallar
 * ------------------------------------------------------------------ */

// Tur sırası + kayma + düşme: at oynar, tahta kayar, rakip oynar; at alt
// satıra inerse bir sonraki kaymada silinir.
const scrollDemo: Demo = {
  id: 'scroll',
  cols: 5,
  frames: [
    F(B('. . . bR .', '. . . . .', '. . . . .', '. . wN . .', '. . . . .'), {
      marks: [...M('ring', [3, 2]), ...M('dot', [1, 1], [1, 3], [2, 0], [2, 4], [4, 0], [4, 4])],
      captionKey: 'demo.yourMove',
    }),
    F(B('. . . bR .', '. wN . . .', '. . . . .', '. . . . .', '. . . . .'), {
      marks: M('ring', [1, 1]),
      captionKey: 'demo.moved',
    }),
    F(B('. . bP . .', '. . . bR .', '. wN . . .', '. . . . .', '. . . . .'), {
      marks: [...M('ring', [2, 1]), ...DEATH],
      scroll: true,
      tag: '+1',
      captionKey: 'demo.scroll',
      hold: 1.3,
    }),
    F(B('. . bP . .', '. . . . bR', '. wN . . .', '. . . . .', '. . . . .'), {
      marks: M('ring', [2, 1]),
      captionKey: 'demo.enemyMoves',
    }),
    // Kötü hamle (öğretim): at ölüm satırına iner
    F(B('. . bP . .', '. . . . bR', '. . . . .', '. . . . .', '. . wN . .'), {
      marks: [...M('ring', [4, 2]), ...DEATH],
      captionKey: 'demo.bottomRow',
      hold: 1.3,
    }),
    F(B('. bB . . .', '. . bP . .', '. . . . bR', '. . . . .', '. . . . .'), {
      marks: DEATH,
      scroll: true,
      tag: '−♥',
      captionKey: 'demo.fell',
      hold: 1.8,
    }),
  ],
}

// Sıkışma: piyonun önü kapalı, çaprazda yenecek yok → hamle yok → hak yanar,
// tahta yenilenir, +5.
const stuckDemo: Demo = {
  id: 'stuck',
  cols: 5,
  frames: [
    F(B('. . . . .', '. . . . .', '. bR . . .', '. wP . . .', '. . . . .'), {
      marks: [...M('ring', [3, 1]), ...M('danger', [2, 1])],
      captionKey: 'demo.noMove',
      hold: 1.5,
    }),
    F(B('. . . . .', '. . . . .', '. bR . . .', '. wP . . .', '. . . . .'), {
      marks: M('ring', [3, 1]),
      tag: '−1',
      captionKey: 'demo.stuck',
      hold: 1.2,
    }),
    F(B('. . . bP .', '. . . . .', '. . . . bR', '. wP . . .', '. . . . .'), {
      marks: [...M('ring', [3, 1]), ...M('dot', [2, 1])],
      refresh: true,
      tag: '+5',
      captionKey: 'demo.reshuffle',
      hold: 1.8,
    }),
  ],
}

// Pusu koruması: kaymayla üstten gelen kale atı vuruyor → silinir.
// Sonra at kendi hamlesiyle filin menziline giriyor → kalır, yenilir.
const ambushDemo: Demo = {
  id: 'ambush',
  cols: 5,
  frames: [
    F(B('. . . . .', '. . . bB .', '. wN . . .', '. . . . .', '. . . . .'), {
      marks: M('ring', [2, 1]),
      captionKey: 'demo.moved',
      hold: 0.8,
    }),
    // Kale (0,1) sütunu vuruyor: (1,1),(2,1) boş → at (3,1) tehdit altında
    F(B('. bR . . .', '. . . . .', '. . . bB .', '. wN . . .', '. . . . .'), {
      marks: [...M('ring', [3, 1]), ...M('danger', [1, 1], [2, 1], [3, 1])],
      scroll: true,
      captionKey: 'demo.ambush',
      hold: 1.5,
    }),
    F(B('. . . . .', '. . . . .', '. . . bB .', '. wN . . .', '. . . . .'), {
      marks: M('ring', [3, 1]),
      tag: '✕',
      captionKey: 'demo.ambushGone',
      hold: 1.5,
    }),
    // At (3,1) → (1,2): filin (2,3) çaprazında — kendi isteğiyle
    F(B('. . . . .', '. . wN . .', '. . . bB .', '. . . . .', '. . . . .'), {
      marks: [...M('ring', [1, 2]), ...M('danger', [1, 2])],
      captionKey: 'demo.ownRisk',
      hold: 1.5,
    }),
    F(B('. . . . bP', '. . . . .', '. . wN . .', '. . . bB .', '. . . . .'), {
      marks: [...M('ring', [2, 2]), ...M('danger', [2, 2]), ...DEATH],
      scroll: true,
      tag: '+1',
      captionKey: 'demo.scroll',
    }),
    F(B('. . . . bP', '. . . . .', '. . bB . .', '. . . . .', '. . . . .'), {
      tag: '−♥',
      captionKey: 'demo.captured',
      hold: 1.8,
    }),
  ],
}

/* ------------------------------------------------------------------ *
 * Av
 * ------------------------------------------------------------------ */

// Dönüşüm iki yönlü: at kaleyi yer → kale olur; kale piyonu yer → piyon olur.
const transformDemo: Demo = {
  id: 'transform',
  cols: 5,
  frames: [
    F(B('. . . . .', '. . . bR .', '. wN . . .', '. . . . .', '. . . . .'), {
      marks: [...M('ring', [2, 1]), ...M('target', [1, 3])],
      captionKey: 'demo.capture',
    }),
    F(B('. . . . .', '. . . wR .', '. . . . .', '. . . . .', '. . . . .'), {
      marks: M('ring', [1, 3]),
      tag: '♞→♜ +5',
      captionKey: 'demo.becameRook',
      hold: 1.6,
    }),
    F(B('. . . bP .', '. . . wR .', '. . . . .', '. . . . .', '. . . . .'), {
      marks: [...M('ring', [1, 3]), ...M('target', [0, 3])],
      captionKey: 'demo.capturePawn',
    }),
    F(B('. . . wP .', '. . . . .', '. . . . .', '. . . . .', '. . . . .'), {
      marks: M('ring', [0, 3]),
      tag: '♜→♟ +1',
      captionKey: 'demo.becamePawn',
      hold: 1.8,
    }),
  ],
}

// Şah zinciri: şah +2, rakip yalnızca şahını kurtarır, arka arkaya şah ×2.
const chainDemo: Demo = {
  id: 'chain',
  cols: 5,
  frames: [
    F(B('. . . bK .', '. . . . .', 'wR . . . .', '. . . . .', '. . . . .'), {
      marks: [...M('ring', [2, 0]), ...M('dot', [2, 3])],
      captionKey: 'demo.yourMove',
    }),
    F(B('. . . bK .', '. . . . .', '. . . wR .', '. . . . .', '. . . . .'), {
      marks: [...M('ring', [2, 3]), ...M('glow', [0, 3])],
      tag: '+2',
      captionKey: 'demo.check',
      hold: 1.4,
    }),
    F(B('. bP . . .', '. . . bK .', '. . . . .', '. . . wR .', '. . . . .'), {
      marks: [...M('ring', [3, 3]), ...M('glow', [1, 3]), ...DEATH],
      scroll: true,
      tag: '+1',
      captionKey: 'demo.scroll',
    }),
    F(B('. bP . . .', '. . bK . .', '. . . . .', '. . . wR .', '. . . . .'), {
      marks: M('ring', [3, 3]),
      captionKey: 'demo.mustDefend',
      hold: 1.3,
    }),
    F(B('. bP . . .', '. . bK . .', '. . . . .', '. . wR . .', '. . . . .'), {
      marks: [...M('ring', [3, 2]), ...M('glow', [1, 2])],
      tag: '×2 +4',
      captionKey: 'demo.checkAgain',
      hold: 1.8,
    }),
  ],
}

// Şahı yeme: +25 puan, +1 can, tahta baştan.
const kingBonusDemo: Demo = {
  id: 'kingBonus',
  cols: 5,
  frames: [
    F(B('. bK . . .', '. . . . .', '. . wN . .', '. . . . .', '. . . . .'), {
      marks: [...M('ring', [2, 2]), ...M('target', [0, 1])],
      captionKey: 'demo.kingInReach',
    }),
    F(B('. wN . . .', '. . . . .', '. . . . .', '. . . . .', '. . . . .'), {
      marks: M('ring', [0, 1]),
      tag: '+25 ♥+1',
      captionKey: 'demo.kingTaken',
      hold: 1.5,
    }),
    F(B('. . bB . .', 'bP . . bR .', '. . . . .', '. . wN . .', '. . . . .'), {
      marks: M('ring', [3, 2]),
      refresh: true,
      captionKey: 'demo.freshBoard',
      hold: 1.8,
    }),
  ],
}

/* ------------------------------------------------------------------ *
 * Kaçış
 * ------------------------------------------------------------------ */

// Şah vurulan kareye giremez; korumasız taşı yiyebilir.
const kingSafeDemo: Demo = {
  id: 'kingSafe',
  cols: 5,
  frames: [
    F(B('. . bR . .', '. . . . .', '. wK . . .', '. . . . .', '. . . . .'), {
      marks: [
        ...M('ring', [2, 1]),
        ...M('danger', [1, 2], [2, 2], [3, 2]),
        ...M('dot', [1, 0], [1, 1], [2, 0], [3, 0], [3, 1]),
      ],
      captionKey: 'demo.attacked',
      hold: 1.6,
    }),
    F(B('. . bR . .', '. wK . . .', '. . . . .', '. . . . .', '. . . . .'), {
      marks: [...M('ring', [1, 1]), ...M('target', [0, 2])],
      captionKey: 'demo.stepUp',
      hold: 1.2,
    }),
    F(B('. . wK . .', '. . . . .', '. . . . .', '. . . . .', '. . . . .'), {
      marks: M('ring', [0, 2]),
      tag: '+5',
      captionKey: 'demo.takeUndefended',
      hold: 1.8,
    }),
  ],
}

// Şah her tur bir kare, tahta her tur bir satır: çıkmayan aşağı kayar.
const kingClimbDemo: Demo = {
  id: 'kingClimb',
  cols: 5,
  frames: [
    F(B('. . . . .', '. . . . .', '. . . . .', '. . wK . .', '. . . . .'), {
      marks: [...M('ring', [3, 2]), ...M('dot', [2, 1], [2, 2], [2, 3], [3, 1], [3, 3], [4, 1], [4, 2], [4, 3])],
      captionKey: 'demo.yourMove',
    }),
    F(B('. . . . .', '. . . . .', '. . wK . .', '. . . . .', '. . . . .'), {
      marks: M('ring', [2, 2]),
      captionKey: 'demo.stepUp',
    }),
    F(B('. bP . . .', '. . . . .', '. . . . .', '. . wK . .', '. . . . .'), {
      marks: [...M('ring', [3, 2]), ...DEATH],
      scroll: true,
      tag: '+1',
      captionKey: 'demo.scroll',
    }),
    F(B('. bP . . .', '. . . . .', '. . wK . .', '. . . . .', '. . . . .'), {
      marks: M('ring', [2, 2]),
      captionKey: 'demo.stepUp',
    }),
    F(B('. . . bR .', '. bP . . .', '. . . . .', '. . wK . .', '. . . . .'), {
      marks: [...M('ring', [3, 2]), ...DEATH],
      scroll: true,
      tag: '+1',
      captionKey: 'demo.treadmill',
      hold: 1.8,
    }),
  ],
}

// Sıkışma (şah yok, güvenli kare yok → hak yanar) ile mat (şah var,
// güvenli kare yok → biter) arasındaki fark.
const kingEndDemo: Demo = {
  id: 'kingEnd',
  cols: 5,
  frames: [
    F(B('bB . . . .', '. . . . bR', '. wK . . .', '. . . . bR', '. . bB . .'), {
      marks: [
        ...M('ring', [2, 1]),
        ...M('danger', [1, 0], [1, 1], [1, 2], [2, 0], [2, 2], [3, 0], [3, 1], [3, 2]),
      ],
      captionKey: 'demo.stuckKing',
      tag: '−1',
      hold: 2,
    }),
    F(B('. . . bP .', '. . . . .', '. . . . .', '. wK . . .', '. . . . .'), {
      marks: [...M('ring', [3, 1]), ...M('dot', [2, 0], [2, 1], [2, 2])],
      refresh: true,
      tag: '+5',
      captionKey: 'demo.reshuffle',
      hold: 1.4,
    }),
    F(B('. . . . .', '. . . . bR', '. wK . . bR', '. . . . bR', '. . . . .'), {
      marks: [
        ...M('ring', [2, 1]),
        ...M('glow', [2, 1]),
        ...M('danger', [1, 0], [1, 1], [1, 2], [2, 0], [2, 2], [3, 0], [3, 1], [3, 2]),
      ],
      captionKey: 'demo.mate',
      tag: '✕',
      hold: 2.2,
    }),
  ],
}

/* ------------------------------------------------------------------ *
 * Üçlü
 * ------------------------------------------------------------------ */

// Kadrodan bir taş seçilir ve oynanır; ötekiler bekler.
const trioPickDemo: Demo = {
  id: 'trioPick',
  cols: 5,
  frames: [
    F(B('. . . . .', '. . . . .', 'wQ . . . .', '. . wR . .', '. . . . wB'), {
      marks: [...M('ring', [4, 4]), ...M('select', [2, 0], [3, 2]), ...M('dot', [3, 3], [2, 2])],
      captionKey: 'demo.pickOne',
      hold: 1.4,
    }),
    F(B('. . . . .', '. . . . .', 'wQ . wB . .', '. . wR . .', '. . . . .'), {
      marks: [...M('ring', [2, 2]), ...M('select', [2, 0], [3, 2])],
      captionKey: 'demo.movedOne',
      hold: 1.4,
    }),
    F(B('. . . . .', '. . . . .', 'wQ . wB . .', '. . wR . .', '. . . . .'), {
      marks: [...M('ring', [3, 2]), ...M('select', [2, 0], [2, 2]), ...M('dot', [3, 0], [3, 1], [3, 3], [3, 4], [4, 2])],
      captionKey: 'demo.nextPick',
      hold: 1.4,
    }),
  ],
}

// Kayma kadronun tamamını indirir: oynamayan taşlar da aşağı gider.
const trioDriftDemo: Demo = {
  id: 'trioDrift',
  cols: 5,
  frames: [
    F(B('. . . . .', '. . . . .', 'wQ . . wB .', '. . wR . .', '. . . . .'), {
      marks: [...M('ring', [2, 3]), ...M('select', [2, 0], [3, 2])],
      captionKey: 'demo.movedOne',
    }),
    F(B('. . bP . .', '. . . . .', '. . . . .', 'wQ . . wB .', '. . wR . .'), {
      marks: [...M('ring', [3, 3]), ...M('select', [3, 0], [4, 2]), ...DEATH],
      scroll: true,
      tag: '+1',
      captionKey: 'demo.othersDrift',
      hold: 1.5,
    }),
    F(B('. . bP . .', '. . . . .', '. . . . .', 'wQ . . wB .', '. . wR . .'), {
      marks: [...M('ring', [4, 2]), ...M('select', [3, 0], [3, 3]), ...M('dot', [3, 2], [2, 2], [1, 2])],
      captionKey: 'demo.rescue',
      hold: 1.4,
    }),
    F(B('. . bP . .', '. . . . .', '. . wR . .', 'wQ . . wB .', '. . . . .'), {
      marks: [...M('ring', [2, 2]), ...M('select', [3, 0], [3, 3])],
      captionKey: 'demo.rescued',
      hold: 1.6,
    }),
  ],
}

// Eksik taş şah yenince geri döner.
const trioBackDemo: Demo = {
  id: 'trioBack',
  cols: 5,
  frames: [
    F(B('. . . bK .', '. . . . .', '. . . . .', 'wQ . . . .', '. . wR . .'), {
      marks: [...M('ring', [3, 0]), ...M('select', [4, 2]), ...M('target', [0, 3])],
      captionKey: 'demo.squadShort',
      hold: 1.4,
    }),
    F(B('. . . wQ .', '. . . . .', '. . . . .', '. . . . .', '. . wR . .'), {
      marks: [...M('ring', [0, 3]), ...M('select', [4, 2])],
      tag: '+25',
      captionKey: 'demo.kingTaken',
      hold: 1.3,
    }),
    F(B('. bP . . bR', '. . . . .', '. . . . .', 'wQ . wR . .', '. . . . wB'), {
      marks: [...M('ring', [4, 4]), ...M('select', [3, 0], [3, 2])],
      refresh: true,
      captionKey: 'demo.squadBack',
      hold: 1.8,
    }),
  ],
}

export const DEMOS: Record<DemoId, Demo> = {
  scroll: scrollDemo,
  stuck: stuckDemo,
  ambush: ambushDemo,
  transform: transformDemo,
  chain: chainDemo,
  kingBonus: kingBonusDemo,
  kingSafe: kingSafeDemo,
  kingClimb: kingClimbDemo,
  kingEnd: kingEndDemo,
  trioPick: trioPickDemo,
  trioDrift: trioDriftDemo,
  trioBack: trioBackDemo,
}
