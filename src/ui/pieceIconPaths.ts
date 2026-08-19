/**
 * Figür siluetlerinin SVG yolları (viewBox 0 0 100 100). Hem ana sayfa
 * ikonları (PieceIcon) hem paylaşım kartı (canvas Path2D) buradan çizer -
 * fonttan bağımsız, her cihazda aynı oran.
 *
 * 19 Ağustos: siluetler klasik glif biçimine (♞ ♚ ♛ ♝ ♜ ♟) göre yeniden
 * çizildi - önceki taslak at/şah/vezirde tanınmıyordu (kullanıcı: "mobilde
 * çok kötü"). Taban üç kademeli, oyuk yerler evenodd ile.
 */
export type IconGlyph = '♞' | '♚' | '♛' | '♝' | '♜' | '♟' | '⚡'

export const PIECE_PATHS: Record<IconGlyph, string> = {
  // At: sola bakan baş, iki kulak, göz ve burun deliği oyuk (evenodd), boyun tabana
  '♞':
    'M22 92 H78 V84 H22 Z ' +
    'M34 82 C32 72 34 62 40 56 C34 57 26 57 20 56 C13 55 9 51 10 45 C10 41 14 39 18 37 C22 31 26 25 30 21 C34 17 38 16 41 16 L44 5 L48 14 L54 5 L57 17 C66 21 72 31 72 44 C72 58 70 70 70 82 Z ' +
    'M37 29 m-3.2 0 a3.2 3.2 0 1 0 6.4 0 a3.2 3.2 0 1 0 -6.4 0 Z ' +
    'M13 46 m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0 Z',
  // Şah: haç, kubbe, iki yana açılan gövde, üç kademeli taban
  '♚':
    'M46 4 H54 V11 H61 V18 H54 V25 H46 V18 H39 V11 H46 Z ' +
    'M50 24 C40 24 34 30 34 38 C34 44 38 48 42 50 L58 50 C62 48 66 44 66 38 C66 30 60 24 50 24 Z ' +
    'M28 52 C24 42 22 34 30 32 C36 30 40 40 44 50 L56 50 C60 40 64 30 70 32 C78 34 76 42 72 52 L70 60 L30 60 Z ' +
    'M30 62 H70 V70 H30 Z ' +
    'M26 72 H74 V80 H26 Z ' +
    'M22 82 H78 V92 H22 Z',
  // Vezir: beş toplu taç, sivri uçlar, üç kademeli taban
  '♛':
    'M50 6 m-4.5 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 Z ' +
    'M31 12 m-4.5 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 Z ' +
    'M69 12 m-4.5 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 Z ' +
    'M14 22 m-4.5 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 Z ' +
    'M86 22 m-4.5 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 Z ' +
    'M14 26 L28 54 L31 16 L42 50 L50 10 L58 50 L69 16 L72 54 L86 26 L74 62 L26 62 Z ' +
    'M28 64 H72 V72 H28 Z ' +
    'M24 74 H76 V82 H24 Z ' +
    'M20 84 H80 V92 H20 Z',
  // Fil: küçük top, yarıklı mitra, üç kademeli taban
  '♝':
    'M50 6 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 Z ' +
    'M50 13 C41 20 34 30 34 40 C34 48 38 54 44 58 L56 58 C62 54 66 48 66 40 C66 30 59 20 50 13 Z ' +
    'M41 44 L55 27 L58 31 L45 47 Z ' +
    'M36 60 H64 V68 H36 Z ' +
    'M30 70 H70 V78 H30 Z ' +
    'M24 80 H76 V92 H24 Z',
  // Kale: mazgallı tepe, gövde, üç kademeli taban
  '♜':
    'M26 8 H36 V18 H44 V8 H56 V18 H64 V8 H74 V28 L68 34 V64 H32 V34 L26 28 Z ' +
    'M28 66 H72 V74 H28 Z ' +
    'M22 76 H78 V84 H22 Z ' +
    'M20 86 H80 V92 H20 Z',
  // Piyon: top, boyun, gövde, iki kademeli taban
  '♟':
    'M50 10 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 Z ' +
    'M50 23 C43 25 39 30 39 35 C39 39 41 42 44 44 L38 66 H62 L56 44 C59 42 61 39 61 35 C61 30 57 25 50 23 Z ' +
    'M32 68 H68 V76 H32 Z ' +
    'M26 78 H74 V92 H26 Z',
  // Şimşek: günün mücadelesi
  '⚡':
    'M58 6 L26 54 H46 L40 94 L74 42 H54 Z',
}



/** Canvas için ham yol (Path2D) - paylaşım kartı figürleri fonttan bağımsız */
export function iconPath(glyph: string): string | null {
  return PIECE_PATHS[glyph as IconGlyph] ?? null
}
