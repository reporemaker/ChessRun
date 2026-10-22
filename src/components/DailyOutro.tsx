import { useEffect, useState } from 'react'
import { dailyBonus } from '@shared/leaderboard'
import type { DailyState } from '../engine/daily'
import { Fig } from './Fig'
import { dayEnd } from '../ui/scores'
import { useT } from '../ui/text'
import type { ShareInput } from '../ui/share'
import { SharePanel } from './SharePanel'

/**
 * Günün Mücadelesi'nin kapanışı - üç perde, ArcadeOutro ile aynı ritim:
 *   1. ölüm    - kırmızı alarm + tarama (DailyBoard `.dying`)
 *   2. başlık  - VURULDUN / DÜŞTÜN, puan sayaç sayaç tırmanır
 *   3. perde   - puan · zincir · özet · BUGÜNKÜ ÇARPAN · seri · yarın · Paylaş/Menü
 *
 * Sıralama/tablo YOK (kullanıcı kararı, 18 Ağustos: "sade kalsın") - tablo
 * Sıralama penceresinde. "Tekrar oyna" da yok: günde tek hak.
 */
type Phase = 'dying' | 'title' | 'panel'

const DYING_MS = 1620
const TITLE_MS = 1500
const COUNT_STEPS = 26

interface DailyOutroProps {
  state: DailyState
  /** Gün anahtarı ve gösterilecek tohum (kısa hex) */
  day: string
  seedHex: string
  isRecord: boolean
  best: number
  /** Koşu süresi (ms) - özet satırı */
  elapsedMs: number
  streak: number
  share: ShareInput
  onExit: () => void
  /** Yalnızca geliştirme: aynı tohumla tekrar */
  onRestart?: () => void
}

function clockOf(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const parts = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
  return parts.map((part) => String(part).padStart(2, '0')).join(':')
}

function formatDay(day: string, locale: string): string {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
}

export function DailyOutro({
  state,
  day,
  seedHex,
  isRecord,
  best,
  elapsedMs,
  streak,
  share,
  onExit,
  onRestart,
}: DailyOutroProps) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('dying')
  const [shown, setShown] = useState(0)
  const [clock, setClock] = useState(() => clockOf(dayEnd(new Date()).getTime() - Date.now()))
  const score = state.score

  useEffect(() => {
    if (phase !== 'dying') return
    const timer = setTimeout(() => setPhase('title'), DYING_MS)
    return () => clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'title') return
    const timer = setTimeout(() => setPhase('panel'), TITLE_MS)
    return () => clearTimeout(timer)
  }, [phase])

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

  // Yarın sayacı yalnızca perdede işler
  useEffect(() => {
    if (phase !== 'panel') return
    const timer = setInterval(() => setClock(clockOf(dayEnd(new Date()).getTime() - Date.now())), 1000)
    return () => clearInterval(timer)
  }, [phase])

  function skip() {
    setShown(score)
    setPhase('panel')
  }

  const title = state.endReason === 'fellOff' ? t('daily.over.fellOff') : t('daily.over.captured')
  const bonus = dailyBonus(score)
  const barPct = Math.min(100, (score / 1000) * 100)
  const mins = Math.floor(elapsedMs / 60_000)
  const secs = Math.floor((elapsedMs % 60_000) / 1000)
  const chain = state.chain.map((type, i) => (
    <span key={i} className={type === 'q' ? 'q' : undefined}>
      {i > 0 ? ' → ' : ''}
      <Fig type={type} />
    </span>
  ))
  const locale = document.documentElement.lang || 'tr'

  return (
    <div
      className={`outro daily-outro ${phase}`}
      role={phase === 'panel' ? 'region' : 'button'}
      tabIndex={phase === 'panel' ? -1 : 0}
      onClick={phase === 'panel' ? undefined : skip}
      onKeyDown={(event) => {
        if (phase !== 'panel' && (event.key === 'Enter' || event.key === ' ')) skip()
      }}
    >
      {phase === 'title' && (
        <>
          <div className="outro-head">
            <h2 className="outro-title">{title}</h2>
            <p className="outro-score">
              <strong>{shown}</strong>
              <span>{t('game.scoreLine', { n: state.distance })}</span>
            </p>
            {isRecord && <p className="outro-record">{t('outro.record')}</p>}
            <p className="outro-chain">{chain}</p>
          </div>
          <p className="outro-skip">{t('outro.skip')}</p>
        </>
      )}

      {phase === 'panel' && (
        <>
          <p className="do-kicker">
            <b>⚡ {t('mode.daily.name')}</b> · {formatDay(day, locale)} · #{seedHex}
          </p>
          <p className="outro-score">
            <strong>{score}</strong>
            <span>
              {t('game.scoreLine', { n: state.distance })}
              {!isRecord && best > 0 ? ` · ${t('home.best')} ${best}` : ''}
            </span>
          </p>
          {isRecord && <p className="outro-record">{t('outro.record')}</p>}
          <p className="do-chain">{chain}</p>
          <p className="do-summary">
            <span>
              <b>{state.captures}</b> {t('daily.captures')}
            </span>
            <span>
              {t('hud.level')} <b>{Math.min(21, Math.floor(state.captures / 5) + 1)}</b>
            </span>
            <span>
              {t('daily.combo')} <b>×{Math.max(1, Math.min(3, state.bestCombo))}</b>
            </span>
            <span>
              <b>{state.kings}</b> <Fig type="k" />
            </span>
            <span>
              <b>
                {mins}:{String(secs).padStart(2, '0')}
              </b>
            </span>
          </p>

          <div className="do-block">
            <h4>
              <span>{t('daily.outro.bonusTitle')}</span>
              <em>
                {t('mode.classic.name')} · {t('mode.kingRun.name')} · {t('mode.trio.name')}
              </em>
            </h4>
            <div className="do-bonus">
              <strong>×{bonus.toFixed(2)}</strong>
              <small>{t('daily.outro.bonusText', { x: bonus.toFixed(2) })}</small>
              <div className="do-bar" aria-hidden>
                <i style={{ width: `${barPct}%` }} />
                <em style={{ left: '50%' }} />
              </div>
              <div className="do-bar-cap" aria-hidden>
                <span>0 · ×1,00</span>
                <span>1000 · ×2,00</span>
              </div>
            </div>
          </div>

          <p className="do-foot">
            {streak > 0 && (
              <span className="fire">
                🔥 <b>{t('daily.outro.streak', { n: streak })}</b>
              </span>
            )}
            <span>
              {t('daily.outro.tomorrow')} <b>{clock}</b>
            </span>
          </p>

          <div className="outro-actions row">
            <SharePanel input={share} />
            <button type="button" className="outro-btn" onClick={onExit}>
              {t('game.toMenu')}
            </button>
          </div>
          {onRestart && (
            <button type="button" className="outro-btn dev" onClick={onRestart}>
              {t('daily.dev.again')}
            </button>
          )}
        </>
      )}

      {phase !== 'panel' && phase !== 'title' && <p className="outro-skip">{t('outro.skip')}</p>}
    </div>
  )
}
