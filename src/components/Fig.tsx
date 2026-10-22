import type { PieceType } from '../engine/types'
import { FIGURE_OF, type FigureColor, type FigureName, figureSrc } from '../ui/figures'

/** Figür görseli (ui/figures.ts) - glifin yerine geçer, boyutu 1em ölçeğinde */
interface FigProps {
  type: PieceType | FigureName
  color?: FigureColor
  className?: string
}

export function Fig({ type, color = 'white', className }: FigProps) {
  const name = type.length === 1 ? FIGURE_OF[type as PieceType] : (type as FigureName)
  return (
    <img
      className={`fig ${className ?? ''}`}
      src={figureSrc(name, color)}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
    />
  )
}
