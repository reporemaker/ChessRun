import type { PieceType } from '../engine/types'
import type { StringKey } from './i18n'

/**
 * Her iki renk için de dolu (siyah) glifleri kullanıyoruz; renk CSS'ten geliyor.
 * İçi boş beyaz glifler bazı fontlarda tutarsız çiziliyor.
 */
export const GLYPH: Record<PieceType, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

/** Taş adları sözlükte: dile göre değişiyor */
export const PIECE_NAME_KEY: Record<PieceType, StringKey> = {
  p: 'piece.p',
  n: 'piece.n',
  b: 'piece.b',
  r: 'piece.r',
  q: 'piece.q',
  k: 'piece.k',
}
