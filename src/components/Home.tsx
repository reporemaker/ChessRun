import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_COLS, minColsOf } from '../engine/config'
import { type ModeId, MODES, isPlayable } from '../ui/modes'
import { DAILY_REPLAY_ALLOWED, dailyPlayed } from '../ui/dailyLock'
import { dailyBonus } from '@shared/leaderboard'
import {
  type RunRecord,
  currentStreak,
  dailyScoreOf,
  dailySeed,
  dayEnd,
  dayKey,
  readRuns,
} from '../ui/scores'
import { type DailyInfo, fetchDaily, fetchPulse, leaderboardEnabled } from '../ui/leaderboard'
import { useRanking } from '../ui/useRanking'
import { lifetimeStreak } from '../ui/lifetime'
import { useSettings } from '../ui/settings'
import { useT } from '../ui/text'
import { APP_VERSION } from '../ui/version'
import type { StringKey } from '../ui/i18n'
import type { GameConfig } from './Game'
import { PieceIcon } from '../ui/pieceIcons'

/** Paylaşım bağlantısıyla gelen kişi: hangi kart vurgulansın (?g=…&d=…) */
export interface HomeFocus {
  mode: ModeId
  day?: string
}

interface HomeProps {
  onStart: (config: GameConfig) => void
  onOpenSettings: () => void
  focus?: HomeFocus | null
}

/** Geri sayım: saat:dakika:saniye - dile bağlı olmayan tek biçim */
function clockOf(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const parts = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
  return parts.map((part) => String(part).padStart(2, '0')).join(':')
}

/**
 * Ana sayfa - "tahta arayüz" A varyantı.
 *
 * Zemin gerçek bir satranç tahtası ve yumuşak akıyor; kartlar onun üstünde
 * duruyor, saydam ama gövdeli. Dört kart: bir günün oyunu, üç serbest mod.
 * Masaüstünde iki sütuna açılıyor, mobilde tek sütun kalıyor.
 */
export function Home({ onStart, onOpenSettings, focus = null }: HomeProps) {
  const t = useT()
  // Koridor genişliği ayarlar penceresinden geliyor: ana sayfa artık
  // yalnızca "hangi oyunu oynayacağım" sorusunu soruyor
  const { cols } = useSettings()

  /* Alt satır: her açılışta farklı bir mikro-ipucu. Rastgele ama son
     gösterileni sessionStorage'dan okuyup bir daha seçmiyor - sekmede
     ardışık iki açılış aynı cümleyi göstermesin. Sunucu bugünün nabzını
     verirse (fetchPulse) ipucu yerine o gösteriliyor. */
  const hint = useMemo<StringKey>(() => {
    const total = 10
    let last = -1
    try {
      last = Number(sessionStorage.getItem('chessrun:hint') ?? '-1')
    } catch {
      // yok sayılıyor
    }
    let pick = Math.floor(Math.random() * total)
    if (pick === last) pick = (pick + 1) % total
    try {
      sessionStorage.setItem('chessrun:hint', String(pick))
    } catch {
      // yok sayılıyor
    }
    return `home.hint.${pick + 1}` as StringKey
  }, [])

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

  const [pulse, setPulse] = useState<number | null>(null)
  // Bu haftanın ligindeki sıran - sunucu varsa; yoksa "SUNUCU BEKLEMEDE"
  const { view: ranking, status: rankStatus } = useRanking()
  useEffect(() => {
    let alive = true
    void fetchPulse(day).then((n) => alive && setPulse(n))
    return () => {
      alive = false
    }
  }, [day])

  const runs = useMemo(() => readRuns(), [])
  const streak = useMemo(() => Math.max(currentStreak(runs), lifetimeStreak()), [runs])
  /* Günün Mücadelesi: tohum ve tek hak SUNUCUDA (tohum sırdan türer, hak
     jetona bağlı). Sunucu cevap verene dek kart "…" gösterir; sunucu
     tanımlı değilse (yerel geliştirme) tarihten tohum + cihaz kilidi. */
  const [remote, setRemote] = useState<DailyInfo | null | 'pending'>(leaderboardEnabled ? 'pending' : null)
  const [dailyError, setDailyError] = useState(false)
  useEffect(() => {
    if (!leaderboardEnabled) return
    let alive = true
    setRemote('pending')
    void fetchDaily(day).then((info) => alive && setRemote(info))
    return () => {
      alive = false
    }
  }, [day])
  const localSeed = dailySeed(day)
  const seed = remote && remote !== 'pending' ? remote.seed : localSeed
  // Sunucu varsa hak durumunda SUNUCU yetkili (panelden sıfırlanabilsin);
  // cevap gelene dek / sunucu yokken cihaz kilidi
  const played = useMemo(
    () => (leaderboardEnabled && remote != null && remote !== 'pending' ? remote.played : dailyPlayed(day)),
    [day, remote],
  )
  const dailyLocked = played && !DAILY_REPLAY_ALLOWED
  // Bugünkü çarpan: günün mücadelesi puanından (diğer üç oyuna uygulanır)
  const todayBonus = dailyBonus(dailyScoreOf(runs, day))
  const hi = useMemo(
    () => runs.reduce((best, run) => Math.max(best, run.score), 0),
    [runs],
  )

  function start(id: ModeId) {
    if (!isPlayable(id)) return

    // Üçlü dar koridora sığmıyor; motor zaten genişletiyor ama kayıt da
    // gerçek genişliği yazsın diye burada da düzeltiliyor
    const width = Math.max(cols, minColsOf(id))
    onStart({ mode: id, playerColor: 'w', cols: width })
  }

  /**
   * Günün Mücadelesi: sabit 8 sütun, günün tohumu, günde bir kez.
   * Tohum sunucudan (GET, hak yakmaz); HAK oyunda "Hazırım"a basınca yanar
   * (DailyGame → /lb/daily/start). Sunucu ulaşılamıyorsa BAŞLATMAZ (herkes
   * aynı tahtayı oynamalı) - kart uyarı gösterir; tanımlı değilse yerel tohum.
   */
  function launchDaily() {
    if (dailyLocked) return
    if (!leaderboardEnabled) {
      onStart({ mode: 'daily', playerColor: 'w', cols: DEFAULT_COLS, seed: localSeed, daily: day })
      return
    }
    if (remote === 'pending') return
    if (!remote && DAILY_REPLAY_ALLOWED) {
      // Geliştirme: sunucu yoksa yerel tohumla aç
      onStart({ mode: 'daily', playerColor: 'w', cols: DEFAULT_COLS, seed: localSeed, daily: day })
      return
    }
    if (!remote) {
      setDailyError(true)
      setRemote('pending')
      void fetchDaily(day).then((info) => {
        setRemote(info)
        if (info) setDailyError(false)
      })
      return
    }
    onStart({ mode: 'daily', playerColor: 'w', cols: DEFAULT_COLS, seed: remote.seed, daily: day })
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
            {t('home.rank')}{' '}
            <em>
              {rankStatus === 'local'
                ? t('home.rankPending')
                : ranking.rank != null
                  ? `#${ranking.rank}`
                  : '-'}
            </em>
          </span>
          <button type="button" className="bi-gear" onClick={onOpenSettings}>
            ⚙ {t('home.settings')}
          </button>
        </header>

        <div className="bi-men">
          <Card
            today
            glyph="⚡"
            title={t('mode.daily.name')}
            focus={focus?.mode === 'daily'}
            sub={
              focus?.mode === 'daily' && focus.day && focus.day !== day
                ? t('daily.pastBoard')
                : dailyError
                ? t('daily.offline')
                : played
                  ? `${t('daily.played')}${todayBonus > 1 ? ` · ${t('daily.bonusToday', { x: todayBonus.toFixed(2) })}` : ''} · ${t('daily.playedSub', { clock })}`
                  : `${t('mode.daily.motto')} · ${t('home.dailyMeta', {
                      seed: remote === 'pending' ? '……' : seed.toString(16).slice(0, 6).toUpperCase(),
                      clock,
                    })}`
            }
            value={bestScore(runs, 'daily', day)}
            valueLabel={t('home.best')}
            disabled={dailyLocked || remote === 'pending'}
            onClick={launchDaily}
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
                focus={focus?.mode === mode.id}
                glyph={mode.glyph}
                title={t(mode.nameKey)}
                sub={mode.mottoKey ? `${t(mode.mottoKey)} · ${base}` : base}
                value={mode.ready ? bestScore(runs, mode.id) : null}
                valueLabel={mode.ready ? t('home.hi') : t('common.soon')}
                disabled={!mode.ready}
                onClick={() => start(mode.id)}
              />
            )
          })}
        </div>

        <footer className="bi-ft">
          <span className="bi-hint">{focus ? t('home.invited') : pulse != null ? t('home.pulse', { n: pulse }) : t(hint)}</span>
          <span className="bi-ver">
            CHESSRUN v{APP_VERSION} · <b>SmartKraft</b>
          </span>
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
  /** Paylaşım bağlantısıyla gelindi: kart vurgulu */
  focus?: boolean
  disabled?: boolean
  onClick: () => void
}

function Card({ glyph, title, sub, value, valueLabel, today, focus, disabled, onClick }: CardProps) {
  return (
    <button
      type="button"
      className={`bi-card ${today ? 'today' : ''} ${focus ? 'focus' : ''} ${disabled ? 'off' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="bi-g">
        <PieceIcon glyph={glyph} />
      </span>
      <span className="bi-t">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <span className="bi-hi">
        {value ?? '-'}
        <em>{valueLabel}</em>
      </span>
    </button>
  )
}
