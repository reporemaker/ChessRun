import { ROWS } from '../engine/config'
import type { StringKey } from './i18n'

/** Bir turun fazları. Arayüz bunları sırayla oynatır, motor zamanlamayı bilmez. */
export type Phase =
  | 'input'
  | 'playerMove'
  | 'boardOut'
  | 'boardIn'
  | 'stuckOut'
  | 'stuckIn'
  | 'scroll'
  | 'enemyMove'

/**
 * Süreler bilerek kısa.
 *
 * Eski değerlerde bir tur 1220ms sürüyordu: 20 turluk ortalama bir oyunun
 * neredeyse tamamı animasyon izlemekle geçiyordu. Kaydırma hareketi
 * okunaklı kaldığı sürece hızlı olmalı - bu bir runner, satranç değil.
 */
export const PIECE_SLIDE_MS = 150

/** Tahtanın bir satır ilerleme süresi */
export const BOARD_SCROLL_MS = 190

/** Fazlar arası nefes payı - hamleler birbirine karışmasın */
export const SETTLE_MS = 40

/**
 * Şah yendiğinde tahta baştan kuruluyor: satırlar yukarıdan aşağı sırayla
 * yanıp sönüp eziliyor (arcade can kaybı efekti), sonra aynı sırayla
 * geri açılıyor. Gecikme satır satır arttığı için tarama hissi veriyor.
 *
 * Süreler makette seçilen 1.5× tempoda: yanıp sönmenin okunabilmesi için
 * her kesik biraz daha uzun duruyor.
 */
export const TILE_STAGGER_MS = 51
export const BOARD_OUT_MS = 540
export const BOARD_IN_MS = 480

/**
 * Sıkışma: taşlar kart destesi karılır gibi kareler arasında zıplayıp
 * bulanıklaşıyor, sonra yeni dizilimde tek tek yerine oturuyor.
 * Gecikme sütun sütun arttığı için deste soldan sağa karılıyor gibi
 * görünüyor. Süreler makette seçilen 1.5× tempoda.
 */
export const STUCK_OUT_MS = 960
export const STUCK_IN_MS = 600
export const STUCK_OUT_STAGGER_MS = 21
export const STUCK_IN_STAGGER_MS = 33

/** En alt satırın sırasının gelmesi için geçen süre */
const CASCADE_MS = (ROWS - 1) * TILE_STAGGER_MS

/** En sağdaki sütunun sırasının gelmesi (8 sütunluk tahtada) */
const STUCK_OUT_CASCADE = 7 * STUCK_OUT_STAGGER_MS
const STUCK_IN_CASCADE = 7 * STUCK_IN_STAGGER_MS

export const PHASE_MS: Record<Exclude<Phase, 'input'>, number> = {
  playerMove: PIECE_SLIDE_MS + SETTLE_MS,
  boardOut: BOARD_OUT_MS + CASCADE_MS,
  boardIn: BOARD_IN_MS + CASCADE_MS + SETTLE_MS,
  stuckOut: STUCK_OUT_MS + STUCK_OUT_CASCADE,
  stuckIn: STUCK_IN_MS + STUCK_IN_CASCADE + SETTLE_MS,
  scroll: BOARD_SCROLL_MS + SETTLE_MS,
  enemyMove: PIECE_SLIDE_MS + SETTLE_MS * 2,
}

/* ------------------------------------------------------------------ *
 * Hız ayarı: tüm süreler tek çarpanla ölçekleniyor. Oyuncular arasında
 * "izlemek isteyen" ile "sıradaki hamleyi isteyen" farkı çok büyük.
 * ------------------------------------------------------------------ */

export type SpeedKey = 'slow' | 'normal' | 'fast'

export const SPEEDS: Record<SpeedKey, { labelKey: StringKey; factor: number }> = {
  slow: { labelKey: 'speed.slow', factor: 1.6 },
  normal: { labelKey: 'speed.normal', factor: 1 },
  fast: { labelKey: 'speed.fast', factor: 0.55 },
}

export const SPEED_ORDER: SpeedKey[] = ['slow', 'normal', 'fast']

const SPEED_STORAGE_KEY = 'chessrun:speed'

export function readSpeed(): SpeedKey {
  try {
    const stored = localStorage.getItem(SPEED_STORAGE_KEY)
    if (stored && stored in SPEEDS) return stored as SpeedKey
  } catch {
    // depolama kapalı - varsayılanla devam
  }
  return 'normal'
}

export function storeSpeed(speed: SpeedKey): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, speed)
  } catch {
    // sessizce geç: ayar sadece bu oturum için geçerli olur
  }
}

/** Bir turun toplam süresi - HUD'da hız etiketinin yanında gösteriliyor */
export function turnDuration(factor: number): number {
  return Math.round(
    (PHASE_MS.playerMove + PHASE_MS.scroll + PHASE_MS.enemyMove) * factor,
  )
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
