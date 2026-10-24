import { useEffect, useState } from 'react'
import type { MhMode, MhScore, MhState } from '../engine/maharajah'
import type { StringKey } from '../ui/i18n'
import { type BadgeAward, badgeOf } from '../ui/badges'
import { getIdentity } from '../ui/identity'
import { BadgeGlyph } from './BadgeGlyph'
import { useT } from '../ui/text'

/**
 * Mihrace'nin kapanışı: öteki oyunların ArcadeOutro'suyla aynı üç perde
 * ve aynı sınıflar (.outro-*); tabloda puanın dökümü, altında lige giden
 * puan.
 *
 *   1. bekleme - son hamle tahtada görünsün (kayan tahtadaki silme yok)
 *   2. başlık  - KAZANDIN / KAYBETTİN / BERABERE yanıp söner, puan tırmanır
 *   3. tablo   - taş · sonuç · hız hücreleri, altında düğmeler
 *
 * Ekrana dokunmak sırayı atlar.
 */
type Phase = 'dying' | 'title' | 'table'

const DYING_MS = 1100
const TITLE_MS = 1500
const COUNT_STEPS = 26

const TITLE_KEY: Record<NonNullable<MhState['result']>['outcome'], StringKey> = {
  win: 'mh.outro.win',
  loss: 'mh.outro.loss',
  draw: 'mh.outro.draw',
}

interface Props {
  mode: MhMode
  result: NonNullable<MhState['result']>
  score: MhScore
  best: number
  /** Lige giden puan: günlük çarpan uygulanmış toplam */
  earned: number
  /** Günlük çarpan (>1 ise gösterilir) */
  bonus: number
  isRecord: boolean
  /** Bu oyunda kazanılan rozet kademeleri - ArcadeOutro'daki listenin aynısı */
  badges?: BadgeAward[]
  onRestart: () => void
  onSwitch: () => void
  onExit: () => void
}

export function MaharajahOutro({ mode, result, score, best, earned, bonus, isRecord, badges, onRestart, onSwitch, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>('dying')
  const [shown, setShown] = useState(0)
  const name = getIdentity().name
  const t = useT()
  const total = earned

  useEffect(() => {
    if (phase === 'table') return
    const timer = setTimeout(() => setPhase(phase === 'dying' ? 'title' : 'table'), phase === 'dying' ? DYING_MS : TITLE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // Puan sayacı: eşit adımlarla tırmanır, son adımda tam değere oturur
  useEffect(() => {
    if (phase !== 'title' || total === 0) {
      setShown(total)
      return
    }
    let step = 0
    const timer = setInterval(() => {
      step++
      setShown(step >= COUNT_STEPS ? total : Math.round((total * step) / COUNT_STEPS))
      if (step >= COUNT_STEPS) clearInterval(timer)
    }, TITLE_MS / (COUNT_STEPS + 6))
    return () => clearInterval(timer)
  }, [phase, total])

  function skip() {
    setShown(total)
    setPhase('table')
  }

  const cells: { value: string; label: StringKey }[] = [
    { value: String(score.material), label: 'mh.outro.material' },
    { value: `+${score.result}`, label: 'mh.outro.result' },
    { value: `+${score.speed}`, label: 'mh.outro.speed' },
  ]

  return (
    <div
      className={`outro mh-outro ${phase}`}
      onClick={phase === 'table' ? undefined : skip}
      role={phase === 'table' ? undefined : 'button'}
      tabIndex={phase === 'table' ? undefined : 0}
      onKeyDown={(event) => {
        if (phase !== 'table' && (event.key === 'Enter' || event.key === ' ')) skip()
      }}
    >
      {phase !== 'dying' && (
        <div className="outro-head">
          <h2 className={`outro-title ${result.outcome}`}>{t(TITLE_KEY[result.outcome])}</h2>
          <p className="outro-score">
            <strong>{shown}</strong>
            <span>{t(`mh.reason.${result.reason}`)}</span>
            {score.multiplier > 1 && <em className="outro-bonus">{t('mh.outro.noGuide', { x: score.multiplier })}</em>}
            {bonus > 1 && <em className="outro-bonus">{t('game.bonus', { x: bonus.toFixed(2) })}</em>}
          </p>
          {isRecord && <p className="outro-record">{t('outro.record')}</p>}
          {badges && badges.length > 0 && (
            <ul className="outro-badges" aria-label={t('badges.inRun')}>
              {badges.map((award) => {
                const badge = badgeOf(award.id)
                const tier = badge.tiers[Math.min(award.tier, badge.tiers.length - 1)]
                return (
                  <li key={`${award.id}-${award.tier}`} title={badge.tiers.length > 1 ? t(`tier.${tier}`) : undefined}>
                    <BadgeGlyph id={award.id} className={`bdg-glyph t-${tier}`} />
                    <b>{t(badge.nameKey)}</b>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {phase === 'table' && (
        <div className="outro-table">
          <div className="outro-table-head">
            <span>
              {t('mode.maharajah.name')} · {t(mode === 'falcon' ? 'mh.falcon.name' : 'mh.hunter.name')}
            </span>
            <span className="outro-rank">{name}</span>
          </div>
          <div className="outro-week" role="group" aria-label={t('mode.maharajah.name')}>
            {cells.map((cell, i) => (
              <div key={cell.label} className="ow-cell" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="ow-v">{cell.value}</span>
                <span className="ow-l">{t(cell.label)}</span>
              </div>
            ))}
          </div>
          <p className="outro-week-note">{t('mh.outro.note', { n: earned, best })}</p>

          <div className="outro-actions">
            <button type="button" className="outro-btn primary" onClick={onRestart}>
              {t('mh.again')}
            </button>
            <button type="button" className="outro-btn" onClick={onSwitch}>
              {t('mh.switch')}
            </button>
            <button type="button" className="outro-btn" onClick={onExit}>
              {t('game.toMenu')}
            </button>
          </div>
        </div>
      )}

      {phase !== 'table' && <p className="outro-skip">{t('outro.skip')}</p>}
    </div>
  )
}
