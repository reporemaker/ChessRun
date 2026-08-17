import { type BadgeId, badgeOf, readBadges, readSelectedBadge } from '../ui/badges'
import { useT } from '../ui/text'

interface Props {
  /** Değişimi yeniden okutmak için — App'in tuttuğu sayaç */
  version: number
  onOpen: () => void
  /** Sınıf öneki: pop (pencere) / gv (oyun sütunu) */
  skin: 'pop' | 'gv'
}

/**
 * Seçili rozet + "Rozetler" düğmesi. Ayarlar penceresinde ve oyun sütununda
 * yalnızca bu görünüyor; listenin tamamı kendi penceresinde (BadgesPopup).
 */
export function BadgeChip({ version, onOpen, skin }: Props) {
  const t = useT()
  void version // yalnızca yeniden çizim tetiklemek için
  const id: BadgeId | null = readSelectedBadge()
  const badge = id ? badgeOf(id) : null
  const tierIdx = id ? (readBadges()[id]?.tier ?? 0) : 0
  const tier = badge ? badge.tiers[Math.min(tierIdx, badge.tiers.length - 1)] : null

  return (
    <div className={`${skin}-badgebar`}>
      <span className={`bdg-chip${badge ? '' : ' none'}`} title={badge ? t(badge.howKey, { n: badge.thresholds[tierIdx] }) : undefined}>
        <span
          className={`bdg-glyph${tier ? ` t-${tier}` : ''}`}
          aria-label={tier && badge && badge.tiers.length > 1 ? t(`tier.${tier}`) : undefined}
        >
          {badge ? badge.glyph : '·'}
        </span>
        <b>{badge ? t(badge.nameKey) : t('badges.none')}</b>
      </span>
      <button type="button" className={`${skin}-badgebtn`} onClick={onOpen}>
        {t('badges.title')}
      </button>
    </div>
  )
}
