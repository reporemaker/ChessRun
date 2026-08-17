import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_COLS, minColsOf } from '../engine/config'
import { type ModeId, MODES, dailyMode, isPlayable, modeInfo } from '../ui/modes'
import {
  type RunRecord,
  currentStreak,
  dailySeed,
  dayEnd,
  dayKey,
  readRuns,
} from '../ui/scores'
import { useSettings } from '../ui/settings'
import { useT } from '../ui/text'
import { APP_VERSION } from '../ui/version'
import type { GameConfig } from './Game'

interface HomeProps {
  onStart: (config: GameConfig) => void
  onOpenSettings: () => void
}

/** Geri sayım: saat:dakika:saniye — dile bağlı olmayan tek biçim */
function clockOf(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const parts = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
  return parts.map((part) => String(part).padStart(2, '0')).join(':')
}

/**
 * Ana sayfa — "tahta arayüz" A varyantı.
 *
 * Zemin gerçek bir satranç tahtası ve yumuşak akıyor; kartlar onun üstünde
 * duruyor, saydam ama gövdeli. Dört kart: bir günün oyunu, üç serbest mod.
 * Masaüstünde iki sütuna açılıyor, mobilde tek sütun kalıyor.
 */
export function Home({ onStart, onOpenSettings }: HomeProps) {
  const t = useT()
  // Koridor genişliği ayarlar penceresinden geliyor: ana sayfa artık
  // yalnızca "hangi oyunu oynayacağım" sorusunu soruyor
  const { cols } = useSettings()
  const [day, setDay] = useState(() => dayKey())
  const [clock, setClock] = useState(() => clockOf(dayEnd(new Date()).getTime() - Date.now()))

  // Saniyede bir geri sayım; gün dönünce günün tohumu da yenileniyor
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      const left = dayEnd(now).getTime() - now.getTime()
      setClock(clockOf(left))
      setDay((current) => {
        const today = dayKey(now)
        return current === today ? current : today
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const runs = useMemo(() => readRuns(), [])
  const streak = useMemo(() => currentStreak(runs), [runs])
  const seed = dailySeed(day)
  const todayMode = dailyMode(day)
  const hi = useMemo(
    () => runs.reduce((best, run) => Math.max(best, run.score), 0),
    [runs],
  )

  function start(id: ModeId, daily: boolean) {
    if (!isPlayable(id)) return

    // Üçlü dar koridora sığmıyor; motor zaten genişletiyor ama kayıt da
    // gerçek genişliği yazsın diye burada da düzeltiliyor
    const width = Math.max(cols, minColsOf(id))

    onStart(
      daily
        ? { mode: id, playerColor: 'w', cols: DEFAULT_COLS, seed, daily: day }
        : { mode: id, playerColor: 'w', cols: width },
    )
  }

  return (
    <div className="bi">
      <div className="bi-bg" aria-hidden />
      <div className="bi-veil" aria-hidden />
      <span className="bi-coord left" aria-hidden>
        8 7 6 5 4 3 2 1
      </span>
      <span className="bi-coord bottom" aria-hidden>
        a b c d e f g h
      </span>

      <div className="bi-ui">
        <header className="bi-hd">
          <span className="bi-streak">
            {streak > 0 ? t('home.streak', { n: streak }) : t('home.noStreak')}
            {hi > 0 && (
              <>
                {' · '}
                {t('home.hi')} <b>{hi}</b>
              </>
            )}
          </span>
          <span className="bi-rank">
            {t('home.rank')} <em>{t('home.rankPending')}</em>
          </span>
          <button type="button" className="bi-gear" onClick={onOpenSettings}>
            ⚙ {t('home.settings')}
          </button>
        </header>

        <div className="bi-men">
          <Card
            today
            glyph={modeInfo(todayMode).glyph}
            title={t('home.daily')}
            sub={`${t(modeInfo(todayMode).nameKey)} · ${t('home.dailyMeta', {
              seed: seed.toString(16).slice(0, 6).toUpperCase(),
              clock,
            })}`}
            value={bestScore(runs, todayMode, day)}
            valueLabel={t('home.best')}
            onClick={() => start(todayMode, true)}
          />

          {MODES.map((mode) => {
            const played = runs.filter((run) => run.mode === mode.id).length
            // Hiç oynanmamış modda sayaç yerine ne olduğunu yazmak daha faydalı:
            // ilk oyuncunun kartlar arasında seçim yapabilmesi için
            const base =
              mode.ready && played > 0
                ? `${t('home.free')} · ${t('home.games', { n: played })}`
                : t(mode.lineKey)
            return (
              <Card
                key={mode.id}
                glyph={mode.glyph}
                title={t(mode.nameKey)}
                sub={mode.mottoKey ? `${t(mode.mottoKey)} · ${base}` : base}
                value={mode.ready ? bestScore(runs, mode.id) : null}
                valueLabel={mode.ready ? t('home.hi') : t('common.soon')}
                disabled={!mode.ready}
                onClick={() => start(mode.id, false)}
              />
            )
          })}
        </div>

        <footer className="bi-ft">
          <span>{t('home.foot')}</span>
          <span>CHESSRUN v{APP_VERSION}</span>
        </footer>
      </div>
    </div>
  )
}

/** Bir modun en iyi skoru; gün verilirse yalnızca o günün koşuları sayılır */
function bestScore(runs: RunRecord[], mode: ModeId, day?: string): number | null {
  const matching = runs.filter(
    (run) => run.mode === mode && (day == null || run.daily === day),
  )
  if (matching.length === 0) return null
  return matching.reduce((best, run) => Math.max(best, run.score), 0)
}

interface CardProps {
  glyph: string
  title: string
  sub: string
  value: number | null
  valueLabel: string
  today?: boolean
  disabled?: boolean
  onClick: () => void
}

function Card({ glyph, title, sub, value, valueLabel, today, disabled, onClick }: CardProps) {
  return (
    <button
      type="button"
      className={`bi-card ${today ? 'today' : ''} ${disabled ? 'off' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="bi-g">{glyph}</span>
      <span className="bi-t">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <span className="bi-hi">
        {value ?? '—'}
        <em>{valueLabel}</em>
      </span>
    </button>
  )
}
