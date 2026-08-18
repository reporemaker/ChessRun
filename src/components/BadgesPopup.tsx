import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BADGES,
  type Badge,
  type BadgeId,
  type BadgeSection,
  type EarnedBadges,
  type Tier,
  readBadges,
  readSelectedBadge,
  selectBadge,
} from '../ui/badges'
import { readLifetime } from '../ui/lifetime'
import { leaderboardEnabled } from '../ui/leaderboard'
import { useT } from '../ui/text'
import { BadgeGlyph } from './BadgeGlyph'

interface Props {
  onClose: () => void
  /** Seçili rozet değişince (künye ve sıralama tazelensin) */
  onSelect?: (id: BadgeId | null) => void
}

const SECTIONS: Array<{ id: BadgeSection; key: 'badges.pieces' | 'badges.skill' | 'badges.loyal' | 'badges.league' }> = [
  { id: 'pieces', key: 'badges.pieces' },
  { id: 'skill', key: 'badges.skill' },
  { id: 'loyal', key: 'badges.loyal' },
  { id: 'league', key: 'badges.league' },
]

/**
 * Rozet penceresi - sıralama gibi kendi sahnesi.
 *
 * Bölümler: figürler · ustalık · süreklilik · haftalık lig. Satır: glif
 * (kademe rengi) · ad · kademe noktaları · ilerleme · seç. Görünürlük
 * politikaları rozetler.md'den: `afterFirst` aileler ilk kademe kazanılana
 * kadar hiç listelenmiyor; `firstOpen` ilk eşiği gösterip üst kademeleri
 * saklıyor; `hidden` "?" - kazanılınca açılıyor. Lig rozetleri sunucudan
 * (`claimLeague`); sunucu tanımlı değilse "yakında" ve sayım dışı. Eski not:
 * kadar kilitli.
 *
 * Değerler `chessrun:lifetime`'dan (kümülatif toplamlar ve tek-koşu en
 * iyiler); oyun sürerken pencere açılırsa mevcut koşunun sayaçları henüz
 * eklenmemiştir - koşu bitince eklenir, bilinçli sadeleştirme.
 */
export function BadgesPopup({ onClose, onSelect }: Props) {
  const t = useT()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [earned, setEarned] = useState<EarnedBadges>(() => readBadges())
  const [selected, setSelected] = useState<BadgeId | null>(() => readSelectedBadge())
  const life = useMemo(() => readLifetime(), [])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Depodaki değer: koşu dışında bağlam olmadığı için ömür boyu depodan */
  function valueOf(badge: Badge): number | null {
    if (badge.server) return null
    switch (badge.id) {
      case 'rook': return life.total.captured.r
      case 'knight': return life.total.captured.n
      case 'bishop': return life.total.captured.b
      case 'pawn': return life.best.pawnSteps
      case 'queen': return life.best.queenCaptures
      case 'king': return life.best.kingDistance
      case 'musketeers': return life.best.trioNoLoss
      case 'harakiri': return life.total.harakiri
      case 'oneUp': return life.total.kings
      case 'chain': return life.best.streak >= 3 ? 1 : 0
      case 'hunter': return life.best.kingsInRun >= 2 ? 1 : 0
      case 'mate': return life.total.mated > 0 ? 1 : 0
      case 'breath': return life.total.stuckUsed > 0 ? 1 : 0
      case 'transform': return earned.transform ? 1 : 0
      case 'sevenDays':
      case 'thirtyDays': return life.streak.best
      case 'narrow': return earned.narrow ? 15 : 0
      default: return null
    }
  }

  const earnedCount = BADGES.filter((b) => earned[b.id]).length
  // Lig rozetleri sunucu varsa sayıma dahil; yokken "yakında" olarak dışarıda
  const total = BADGES.filter((b) => !b.server || leaderboardEnabled).length

  function pick(id: BadgeId) {
    const next = selected === id ? null : id
    selectBadge(next)
    setSelected(next)
    setEarned(readBadges())
    onSelect?.(next)
  }

  return (
    <div
      className="pop-back"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="pop badges" role="dialog" aria-modal="true" aria-label={t('badges.title')}>
        <div className="pop-hd">
          <span className="pop-ttl">
            {t('badges.title')}
            <small>{t('badges.count', { n: earnedCount, m: total })}</small>
          </span>
          <button
            type="button"
            className="pop-x"
            ref={closeRef}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        <div className="pop-bd bdg-bd">
          {SECTIONS.map((section) => {
            const rows = BADGES.filter((b) => b.section === section.id).filter((b) => {
              // afterFirst: ilk kademe kazanılana kadar aile hiç görünmez
              if (b.reveal === 'afterFirst') return Boolean(earned[b.id])
              return true
            })
            if (rows.length === 0) return null
            return (
              <section key={section.id} className="bdg-sec">
                <h3 className="bdg-h">
                  {t(section.key)}
                  {section.id === 'league' && !leaderboardEnabled && <small>{t('badges.server')}</small>}
                </h3>
                <ol className="bdg-list">
                  {rows.map((badge) => (
                    <BadgeRow
                      key={badge.id}
                      badge={badge}
                      have={earned[badge.id]?.tier ?? -1}
                      value={valueOf(badge)}
                      selected={selected === badge.id}
                      onPick={() => pick(badge.id)}
                    />
                  ))}
                </ol>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BadgeRow({
  badge,
  have,
  value,
  selected,
  onPick,
}: {
  badge: Badge
  have: number
  value: number | null
  selected: boolean
  onPick: () => void
}) {
  const t = useT()
  const earned = have >= 0
  const tier: Tier | null = earned ? badge.tiers[Math.min(have, badge.tiers.length - 1)] : null
  const nextIdx = Math.min(have + 1, badge.thresholds.length - 1)
  const nextLimit = badge.thresholds[nextIdx]
  const maxed = have >= badge.thresholds.length - 1
  const isCumulative = badge.tiers.length === 4
  const isOnce = badge.thresholds.length === 1

  // Gizli: kazanılana kadar ad ve koşul "?".
  // firstOpen: ilk kademe kazanılınca üst kademelerin eşiği saklanıyor -
  // oyuncu "devamı var" görür (noktalar), sayıyı görmez.
  const fullyHidden = badge.reveal === 'hidden' && !earned
  const nextHidden = badge.reveal === 'firstOpen' && have >= 0 && !maxed
  const showNext = !badge.server && !maxed && !fullyHidden && !nextHidden

  return (
    <li className={`bdg-row${earned ? ' got' : ''}${selected ? ' sel' : ''}${badge.server && !leaderboardEnabled ? ' srv' : ''}`}>
      {fullyHidden ? (
        <span className="bdg-glyph" aria-hidden="true">?</span>
      ) : (
        <BadgeGlyph
          id={badge.id}
          className={`bdg-glyph${tier ? ` t-${tier}` : ''}`}
          title={tier && !isOnce ? t(`tier.${tier}`) : undefined}
          ariaLabel={tier && !isOnce ? t(`tier.${tier}`) : undefined}
        />
      )}

      <span className="bdg-main">
        <b className="bdg-name">{fullyHidden ? '???' : t(badge.nameKey)}</b>
        <small className="bdg-how">
          {fullyHidden
            ? t('badges.hidden')
            : badge.server
              ? `${t(badge.howKey, { n: nextLimit })} · ${t('badges.server')}`
              : t(badge.howKey, { n: showNext || isOnce ? nextLimit : badge.thresholds[Math.max(have, 0)] })}
        </small>
      </span>

      {/* Sütunlar sabit: kademesiz rozette noktalar boş bir hücre olarak kalıyor */}
      <span className="bdg-dots" aria-label={isOnce ? undefined : `${have + 1}/${badge.thresholds.length}`}>
        {!isOnce &&
          badge.thresholds.map((_, i) => (
            <i key={i} className={i <= have ? `on t-${badge.tiers[i]}` : ''} />
          ))}
      </span>

      <span className="bdg-val">
        {value != null && !fullyHidden && !isOnce && (
          <>
            {isCumulative ? t('badges.total', { n: value }) : t('badges.best', { n: value })}
            {showNext && <small>{t('badges.next', { n: nextLimit })}</small>}
          </>
        )}
      </span>

      {earned ? (
        <button type="button" className={`bdg-pick${selected ? ' on' : ''}`} onClick={onPick} aria-pressed={selected}>
          {selected ? t('badges.selected') : t('badges.select')}
        </button>
      ) : (
        <span className="bdg-pick ghost" />
      )}
    </li>
  )
}
