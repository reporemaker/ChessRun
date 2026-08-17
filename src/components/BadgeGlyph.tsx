import { type BadgeId, badgeOf } from '../ui/badges'
import { BADGE_ICONS } from '../ui/badgeIcons'

interface Props {
  id: BadgeId
  /** Kademe sınıfı (t-black …) ve yer sınıfı (bdg-glyph, rank-badge…) */
  className?: string
  title?: string
  ariaLabel?: string
}

/**
 * Rozet simgesi — SVG ikonu varsa onu, yoksa Unicode glifi çiziyor.
 * Boyut ve renk üst öğenin sınıfından: `.bdg-glyph`, `.rank-badge` 20px,
 * kademe rengi `.t-*` ile `currentColor` üzerinden.
 *
 * SVG işaretlemesi kendi sabitimizden geliyor (badgeIcons.ts), kullanıcı
 * girdisi değil — dangerouslySetInnerHTML burada güvenli.
 */
export function BadgeGlyph({ id, className = '', title, ariaLabel }: Props) {
  const badge = badgeOf(id)
  const icon = BADGE_ICONS[id]
  if (icon) {
    return (
      <span className={`${className} has-svg`.trim()} title={title} aria-label={ariaLabel} role={ariaLabel ? 'img' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon }} />
      </span>
    )
  }
  return (
    <span className={className} title={title} aria-label={ariaLabel} role={ariaLabel ? 'img' : undefined}>
      {badge.glyph}
    </span>
  )
}
