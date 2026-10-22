/**
 * Ana sayfa kartlarının figür ikonları: fonttan BAĞIMSIZ inline SVG.
 *
 * Unicode satranç glifleri (♞ ♚ ♛) cihazdan cihaza farklı yedek fontlardan
 * geliyor; bazı Android/iOS fontlarında dikeyde uzun ve ince çıkıyordu
 * (kullanıcı, 18 Ağustos: "figürler bir tık dikeyde sünmüş"). Siluetler
 * kendi çizimimiz, her cihazda aynı oranda. Tahtadaki taşlar hâlâ glif
 * (orada tek fontla, hücreye göre ölçekli çiziliyor). Yollar pieceIconPaths.ts'te.
 */
import { Fig } from '../components/Fig'
import { FIGURE_OF_GLYPH } from './figures'
import { type IconGlyph, PIECE_PATHS } from './pieceIconPaths'

interface PieceIconProps {
  glyph: string
  className?: string
}

/**
 * Satranç figürleri ve kartal/kurt: çizim seti (figures.tsx, PNG). Diğerleri
 * (⚡ gibi) siluet yolu. Bilinmeyen glif
 * metin olarak düşer (yeni bir mod eklenirse kırılmasın).
 */
export function PieceIcon({ glyph, className }: PieceIconProps) {
  const figure = FIGURE_OF_GLYPH[glyph]
  if (figure) return <span className={`piece-art ${className ?? ''}`}><Fig type={figure} /></span>
  const d = PIECE_PATHS[glyph as IconGlyph]
  if (!d) return <>{glyph}</>
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}
