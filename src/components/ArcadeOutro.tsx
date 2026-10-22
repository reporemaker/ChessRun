import { useEffect, useState } from 'react'
import { getIdentity } from '../ui/identity'
import { useT } from '../ui/text'
import type { PieceType } from '../engine/types'
import { type BadgeAward, badgeOf } from '../ui/badges'
import { Fig } from './Fig'
import { BadgeGlyph } from './BadgeGlyph'
import type { ShareInput } from '../ui/share'
import { SharePanel } from './SharePanel'

/**
 * Şah Kaçışı'nın kapanışı: eski atari kabinlerindeki gibi üç perde.
 *
 *   1. ölüm    - ekran kırmızı çakar, tarama çizgisi tahtayı siler (Board yapıyor)
 *   2. başlık  - GAME OVER yanıp söner, puan sayaç sayaç yukarı tırmanır
 *   3. tablo   - skor listesi satır satır düşer, senin satırın yanıp söner
 *
 * Ekrana dokunmak sırayı atlar: kutlamayı izlemek isteyen izler,
 * istemeyen doğrudan tabloya geçer.
 */
export type OutroPhase = 'dying' | 'title' | 'table'

/**
 * Alarm dizisinin son satırı 660ms + 7×93ms + 300ms = 1611ms'de siliniyor;
 * başlık hemen ardından geliyor. Süre CSS'teki `alarm-*` animasyonlarıyla
 * birebir tutmalı, yoksa perde tahta hâlâ silinirken açılıyor.
 */
const DYING_MS = 1620
const TITLE_MS = 1500
/** Puanın sayaç sayaç tırmanması - arcade sayacı gibi kesikli */
const COUNT_STEPS = 26

/**
 * Kapanıştaki lig özeti (19 Ağustos kararı): başka oyuncu listelenmez;
 * bu koşunun puanı, bu haftaki birikmiş toplam ve sıra. `rank` sunucudan
 * (yoksa null → «—»); `total` yerel defterden (bu koşu dahil, sunucu
 * gecikse de doğru), sunucu daha büyük biliyorsa o.
 */
export interface WeeklySummary {
  earned: number
  total: number
  runs: number
  rank: number | null
  players: number | null
  /** Sunucu görünümü mü (sıra gerçek) - değilse sıra için bekleniyor/yok notu */
  live: boolean
}

interface ArcadeOutroProps {
  score: number
  /** Günlük çarpan uygulandıysa (>1): kapanışta gösterilir */
  bonus?: number
  distance: number
  mated: boolean
  weekly: WeeklySummary
  isRecord: boolean
  /** Haftalık rekor - tüm zamanlar rekoru değilse gösteriliyor */
  isWeekRecord?: boolean
  /** Av'ın dönüşüm zinciri: koşunun hikâyesi (♞→♟→♛) */
  chain?: PieceType[]
  /** Bu koşuda kazanılan rozet kademeleri - kapanış özeti */
  badges?: BadgeAward[]
  daily?: string
  /** Paylaşım girdisi; verilirse Paylaş düğmesi (SharePanel) çizilir */
  share?: ShareInput
  onRestart: () => void
  onExit: () => void
}

export function ArcadeOutro({
  score,
  bonus,
  distance,
  mated,
  weekly,
  isRecord,
  isWeekRecord,
  chain,
  badges,
  daily,
  share,
  onRestart,
  onExit,
}: ArcadeOutroProps) {
  const [phase, setPhase] = useState<OutroPhase>('dying')
  const [shown, setShown] = useState(0)
  const name = getIdentity().name
  const t = useT()

  // Perdeler sırayla açılır. Kaybetme sesi burada çalınmıyor: onu
  // `gameover` olayı geldiği anda commit() zaten çalıyor - buradan bir
  // kez daha çalmak sesi üst üste bindiriyordu.
  useEffect(() => {
    if (phase !== 'dying') return
    const timer = setTimeout(() => setPhase('title'), DYING_MS)
    return () => clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'title') return
    const timer = setTimeout(() => setPhase('table'), TITLE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // Puan sayacı: eşit adımlarla tırmanır, son adımda tam değere oturur
  useEffect(() => {
    if (phase !== 'title' || score === 0) {
      setShown(score)
      return
    }

    let step = 0
    const timer = setInterval(() => {
      step++
      setShown(step >= COUNT_STEPS ? score : Math.round((score * step) / COUNT_STEPS))
      if (step >= COUNT_STEPS) clearInterval(timer)
    }, TITLE_MS / (COUNT_STEPS + 6))

    return () => clearInterval(timer)
  }, [phase, score])

  function skip() {
    setShown(score)
    setPhase('table')
  }

  return (
    <div
      className={`outro ${phase}`}
      onClick={phase === 'table' ? undefined : skip}
      role={phase === 'table' ? undefined : 'button'}
      tabIndex={phase === 'table' ? undefined : 0}
      onKeyDown={(event) => {
        if (phase !== 'table' && (event.key === 'Enter' || event.key === ' ')) skip()
      }}
    >
      {phase !== 'dying' && (
        <div className="outro-head">
          <h2 className="outro-title">{mated ? t('outro.mated') : t('outro.over')}</h2>
          <p className="outro-score">
            <strong>{shown}</strong>
            <span>{t('game.scoreLine', { n: distance })}</span>
            {bonus != null && bonus > 1 && <em className="outro-bonus">{t('game.bonus', { x: bonus.toFixed(2) })}</em>}
          </p>
          {isRecord && <p className="outro-record">{t('outro.record')}</p>}
          {!isRecord && isWeekRecord && (
            <p className="outro-record week">{t('game.weekRecord')}</p>
          )}
          {chain && chain.length > 1 && (
            <p className="outro-chain">
              {chain.map((type, i) => (
                <span key={i}>
                  {i > 0 ? ' → ' : ''}
                  <Fig type={type} />
                </span>
              ))}
            </p>
          )}
          {/* Bu koşuda kazanılan rozetler - koşu ortasındaki flash'ın kalıcı özeti */}
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
          {/* Lig özeti: listesiz - bu koşu · haftalık toplam · sıran */}
          <div className="outro-table-head">
            <span>{t('outro.league')}</span>
            <span className="outro-rank">{name}</span>
          </div>
          <div className="outro-week" role="group" aria-label={t('outro.league')}>
            <div className="ow-cell" style={{ animationDelay: '0ms' }}>
              <span className="ow-v">+{weekly.earned}</span>
              <span className="ow-l">{t('outro.earned')}</span>
            </div>
            <div className="ow-cell" style={{ animationDelay: '90ms' }}>
              <span className="ow-v">{weekly.total}</span>
              <span className="ow-l">{t('outro.weekTotal')}</span>
            </div>
            <div className="ow-cell" style={{ animationDelay: '180ms' }}>
              <span className="ow-v">{weekly.rank != null ? `#${weekly.rank}` : '—'}</span>
              <span className="ow-l">{t('outro.weekRank')}</span>
            </div>
          </div>
          <p className="outro-week-note">
            {t('outro.weekNote', { n: weekly.runs })}
            {weekly.live && weekly.players != null ? ` · ${t('outro.players', { n: weekly.players })}` : ''}
            {!weekly.live ? ` · ${t('outro.rankPending')}` : ''}
          </p>

          <div className="outro-actions">
            {!daily && (
              <button type="button" className="outro-btn primary" onClick={onRestart}>
                {t('game.again')}
              </button>
            )}
            {share && <SharePanel input={share} />}
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
