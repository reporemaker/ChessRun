/**
 * Ana sayfa kartlarının figür ikonları: fonttan BAĞIMSIZ inline SVG.
 *
 * Unicode satranç glifleri (♞ ♚ ♛) cihazdan cihaza farklı yedek fontlardan
 * geliyor; bazı Android/iOS fontlarında dikeyde uzun ve ince çıkıyordu
 * (kullanıcı, 18 Ağustos: "figürler bir tık dikeyde sünmüş"). Siluetler
 * kendi çizimimiz, her cihazda aynı oranda. Tahtadaki taşlar hâlâ glif
 * (orada tek fontla, hücreye göre ölçekli çiziliyor). Yollar pieceIconPaths.ts'te.
 */
import { type IconGlyph, PIECE_PATHS } from './pieceIconPaths'

interface PieceIconProps {
  glyph: string
  className?: string
}

/** Bilinmeyen glif gelirse metin olarak düşer (yeni bir mod eklenirse kırılmasın) */
export function PieceIcon({ glyph, className }: PieceIconProps) {
  const d = PIECE_PATHS[glyph as IconGlyph]
  if (!d) return <>{glyph}</>
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}
