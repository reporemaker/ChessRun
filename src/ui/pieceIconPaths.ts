/**
 * Figür siluetlerinin SVG yolları (viewBox 0 0 100 100). Hem ana sayfa
 * ikonları (PieceIcon) hem paylaşım kartı (canvas Path2D) buradan çizer -
 * fonttan bağımsız, her cihazda aynı oran.
 */
export type IconGlyph = '♞' | '♚' | '♛' | '♝' | '♜' | '♟' | '⚡'

export const PIECE_PATHS: Record<IconGlyph, string> = {
  // At: sağa bakan baş, yele, göz oyuğu ayrı (evenodd)
  '♞':
    // Sağa bakan baş: tek kulak, burun ileride ve aşağıda, yele arkada, boyun tabana
    'M20 90 H80 V84 C80 78 76 72 70 66 C74 62 82 60 88 54 C92 50 92 44 88 40 C82 36 76 32 72 30 L66 20 L60 10 L56 22 C50 22 46 22 42 24 C28 28 20 44 24 60 C20 70 20 80 20 90 Z ' +
    'M72 40 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 Z',
  // Şah: haç + gövde + taban
  '♚':
    'M46 6 H54 V13 H61 V21 H54 V28 H46 V21 H39 V13 H46 Z ' +
    'M50 26 C36 26 30 36 30 46 C30 54 36 58 40 62 L40 70 H60 V62 C64 58 70 54 70 46 C70 36 64 26 50 26 Z ' +
    'M32 72 H68 V78 H32 Z M28 80 H72 V88 H28 Z',
  // Vezir: taçlı, üç toplu
  '♛':
    'M50 8 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 Z ' +
    'M26 18 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 Z ' +
    'M74 18 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 Z ' +
    'M22 44 L26 24 L38 44 L50 16 L62 44 L74 24 L78 44 L72 68 H28 Z ' +
    'M30 72 H70 V78 H30 Z M26 80 H74 V88 H26 Z',
  // Fil: mitra + gövde + taban
  '♝':
    'M50 6 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 Z ' +
    'M50 14 C38 22 32 34 32 44 C32 52 38 58 42 62 L42 70 H58 V62 C62 58 68 52 68 44 C68 34 62 22 50 14 Z ' +
    'M32 72 H68 V78 H32 Z M28 80 H72 V88 H28 Z',
  // Kale: mazgallı tepe + gövde + taban
  '♜':
    'M28 12 H38 V20 H44 V12 H56 V20 H62 V12 H72 V30 L66 36 V66 H34 V36 L28 30 Z ' +
    'M30 70 H70 V76 H30 Z M26 78 H74 V88 H26 Z',
  // Piyon
  '♟':
    'M50 12 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 Z ' +
    'M50 22 C40 26 36 34 38 42 L44 46 L40 68 H60 L56 46 L62 42 C64 34 60 26 50 22 Z ' +
    'M32 72 H68 V78 H32 Z M28 80 H72 V88 H28 Z',
  // Şimşek: günün mücadelesi
  '⚡': 'M58 6 L26 54 H46 L40 94 L74 42 H54 Z',
}



/** Canvas için ham yol (Path2D) - paylaşım kartı figürleri fonttan bağımsız */
export function iconPath(glyph: string): string | null {
  return PIECE_PATHS[glyph as IconGlyph] ?? null
}
