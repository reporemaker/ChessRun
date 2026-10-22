/**
 * Figürler: public/figures/ altındaki çizim seti (22 Ekim 2026). Kaynak
 * figure.png, her figür iki renkte ayrı PNG (white/ ve black/), şeffaf
 * zemin, satır içinde taban hizalı kare tuval - taşlar arası boy farkı korunur.
 *
 * Unicode glifler yalnızca düz metinde kalıyor (paylaşım metni, pano).
 * Boyut `1em`: glifin yerine geçtiği için kapsayıcının font-size'ı aynen işler.
 */
import type { PieceType } from '../engine/types'

export type FigureName = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king' | 'eagle' | 'wolf'
export type FigureColor = 'white' | 'black'

export const FIGURE_OF: Record<PieceType, FigureName> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

/** Ana sayfa kartları glif anahtarı taşıyor (modes.ts) - karşılıkları */
export const FIGURE_OF_GLYPH: Record<string, FigureName> = {
  '♟': 'pawn',
  '♞': 'knight',
  '♝': 'bishop',
  '♜': 'rook',
  '♛': 'queen',
  '♚': 'king',
  '🦅': 'eagle',
  '🐺': 'wolf',
}

export function figureSrc(name: FigureName, color: FigureColor = 'white'): string {
  return `/figures/${color}/${name}.png`
}

/* Canvas için (paylaşım kartı): bir kez yüklenir, hata olursa null */
const imageCache = new Map<string, Promise<HTMLImageElement | null>>()

export function figureImage(name: FigureName, color: FigureColor = 'white'): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null)
  const src = figureSrc(name, color)
  let pending = imageCache.get(src)
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    })
    imageCache.set(src, pending)
  }
  return pending
}

/** Paylaşım paneli açılınca: paylaşım anında bekleme olmasın */
export function preloadFigures(): void {
  for (const name of Object.values(FIGURE_OF)) void figureImage(name)
}
