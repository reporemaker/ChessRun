import { type CSSProperties, type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ROWS } from '../engine/config'
import {
  DAILY_COLS,
  DAILY_MAX_COMBO,
  DAILY_START_MS,
  type DailyEvent,
  type DailyState,
  applyDailyMove,
  applyDailyScroll,
  createDaily,
  dailyIntervalMs,
  dailyLevel,
  dailyMoves,
  dailyStriker,
} from '../engine/daily'
import { tuningActive } from '../engine/tuning'
import type { PieceType, Pos } from '../engine/types'
import { getIdentity, shortToken } from '../ui/identity'
import { DAILY_REPLAY_ALLOWED, markDailyPlayed } from '../ui/dailyLock'
import { RANKS_EVENT, leaderboardEnabled, startDaily } from '../ui/leaderboard'
import { GLYPH, PIECE_NAME_KEY } from '../ui/pieces'
import { type RunRecord, currentStreak, readRuns, readStanding, recordRun } from '../ui/scores'
import { lifetimeStreak, recordLifetime } from '../ui/lifetime'
import { emptyTally } from '../ui/badges'
import { useRanking } from '../ui/useRanking'
import { trackRun } from '../ui/stats'
import { setLang, setPieceColor, setSound, useSettings } from '../ui/settings'
import { LANGS } from '../ui/i18n'
import type { ShareInput } from '../ui/share'
import { dailyBonus } from '@shared/leaderboard'
import { FeedbackLink } from './FeedbackLinks'
import { type Translate, useT } from '../ui/text'
import { type SoundName, playSound, unlockSound } from '../ui/sound'
import { APP_VERSION } from '../ui/version'
import { type DailyResume, clearResume, saveResume } from '../ui/resume'
import { DailyOutro } from './DailyOutro'
import { ExitButton } from './ExitButton'
import { BadgeChip } from './BadgeChip'
import { DailyBoard, STRIKE_DELAY_MS, STRIKE_MOVE_MS } from './DailyBoard'
import { NameChip } from './NameChip'
import type { GameConfig, GameHandle } from './Game'

/**
 * Günün Mücadelesi ekranı.
 *
 * Motor (engine/daily.ts) kesikli: hamle ve "bir satır kaydı" adımları.
 * Zaman burada akıyor: requestAnimationFrame döngüsü kayma ilerlemesini
 * (0..1) ölçüp kayan katmana `--t` olarak yazar, 1'i geçince motora bir
 * adım attırır. React yalnızca motor durumu değişince çizer; kaymanın
 * kendisi kompozitörde, 60 fps'te, React'siz.
 *
 * Sekme arka plana gidince rAF durur; geri gelince geçen süre kadar adım
 * atılır (en çok ROWS+1 - yeterince uzun kaldıysan düşmüşsündür). Karar:
 * duraklatma yok, süre akar.
 */

interface DailyGameProps {
  config: GameConfig
  onExit: () => void
  onOpenSettings: () => void
  onOpenPage: (page: 'help') => void
  onOpenRanking: () => void
  onOpenBadges: () => void
  badgeVersion: number
  /** Devam fişi: hak zaten yanmış, koşu kaldığı yerden (hazır/geri sayım atlanır) */
  resume?: DailyResume
  ref?: Ref<GameHandle>
}

interface Flash {
  id: number
  text: string
  tone: 'good' | 'great' | 'bad' | 'info'
}

interface RunResult {
  run: RunRecord
  isBest: boolean
  /** Koşu öncesi en iyi (kapanışta "en iyin") */
  best: number
  elapsedMs: number
}

/** Hız değişimi tık tık değil: hedefe bu zaman sabitiyle yaklaşır */
const SPEED_EASE_MS = 600

/** Geri sayım adımı ve "BAŞLA" görünme süresi */
const COUNT_STEP_MS = 1000
const GO_MS = 600

/**
 * Yenilme sahnesi: vurulan kareye inince oyun ANINDA kararmaz - vuran taş
 * gelip seni alır, "VURULDUN" görünür, bir saniye sonra oyun sonu ekranı
 * (kullanıcı 18 Ağustos: "yenildiğimi göster, 1 sn sonra game over").
 */
const STRIKE_MS = 1000

/**
 * Dönüşüm titreşimi süresi (Mario mantarı). Aynı hamlede birden çok dönüşüm
 * olabilir (korunan şahı yedin: at→vezir, sonra vuruldun: vezir→at) -
 * sırayla oynatılır ki oyuncu ne olduğunu görsün. CSS morph-* ile aynı.
 */
const MORPH_MS = 700
/** Vezirken vurulma: kare kırmızı flaş süresi */
const HIT_FLASH_MS = 700

interface Morph {
  id: number
  from: PieceType
  to: PieceType
  /** hold: iki figür aynı, yalnızca bekletir (vuran taş yoldayken vezir görünsün) */
  tone: 'up' | 'down' | 'hold'
  /** Bu adımın süresi; yoksa MORPH_MS */
  durationMs?: number
}

/**
 * Sunucuya gönderim. Worker `shared/events` MODES'ta `daily`yi tanıdığı
 * sürümle birlikte dağıtılmalı - eski Worker bilinmeyen modu `classic`e
 * düşürüp günlük koşuları Av ligine karıştırırdı (18 Ağustos: birlikte dağıtıldı).
 */
const DAILY_SUBMIT = true

export function DailyGame({
  config,
  onExit,
  onOpenSettings,
  onOpenPage,
  onOpenRanking,
  onOpenBadges,
  badgeVersion,
  resume,
  ref,
}: DailyGameProps) {
  const seed = config.seed ?? 0
  const day = config.daily ?? ''
  const t = useT()
  const settings = useSettings()

  const [game, setGame] = useState<DailyState>(() => resume?.game ?? createDaily({ seed }))
  const [runId, setRunId] = useState(0)
  /* Açılış: önce "Hazır mısın?" penceresi (kurallar), sonra 3-2-1 geri sayım,
     sonra tahta akmaya başlar. Tahta arkada duruyor (kaymıyor, hamle yok).
     Devam fişiyle gelindiyse hak zaten yanmış: doğrudan oyun. */
  const [phase, setPhase] = useState<'ready' | 'countdown' | 'playing'>(resume ? 'playing' : 'ready')
  const [count, setCount] = useState(3)
  const countTimer = useRef<number | null>(null)
  // "Hazırım": hak burada yanar (sunucu start). Sunucu yoksa yerel; ulaşılamıyorsa
  // ya da hak zaten yanmışsa pencere bunu söyler, oyun başlamaz.
  const [arming, setArming] = useState(false)
  const [introError, setIntroError] = useState<'offline' | 'played' | null>(null)

  async function onReady() {
    unlockSound()
    if (arming || phase !== 'ready') return
    if (leaderboardEnabled && day) {
      setArming(true)
      setIntroError(null)
      const info = await startDaily(day)
      setArming(false)
      // Geliştirmede sunucusuz da oynanabilsin (yerel tohum); canlıda sunucu şart
      if (!info && !DAILY_REPLAY_ALLOWED) {
        setIntroError('offline')
        return
      }
      if (info?.played && !DAILY_REPLAY_ALLOWED) {
        setIntroError('played')
        return
      }
      // Tohum sunucudan gelenle aynı olmalı; değilse (gün döndü vb.) tahtayı yenile
      if (info && info.seed !== seed) {
        const fresh = createDaily({ seed: info.seed })
        latest.current = fresh
        setGame(fresh)
      }
    }
    if (day) markDailyPlayed(day)
    beginCountdown()
  }

  function beginCountdown() {
    setPhase('countdown')
    setCount(3)
    let n = 3
    const tick = () => {
      n -= 1
      if (n >= 1) {
        setCount(n)
        countTimer.current = window.setTimeout(tick, COUNT_STEP_MS)
      } else {
        setCount(0)
        countTimer.current = window.setTimeout(() => {
          runStart.current = performance.now()
          lastTs.current = null
          setPhase('playing')
        }, GO_MS)
      }
    }
    countTimer.current = window.setTimeout(tick, COUNT_STEP_MS)
  }
  useEffect(() => () => {
    if (countTimer.current != null) window.clearTimeout(countTimer.current)
  }, [])
  const [flash, setFlash] = useState<Flash | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [hiScore, setHiScore] = useState(() => readStanding('daily').allTime?.score ?? 0)
  const [identity, setIdentity] = useState(() => getIdentity())
  // Yenilme sahnesi (vuran taş → oyuncu) ve oyun sonu perdesinin gecikmesi
  const [strike, setStrike] = useState<{ from: Pos; to: Pos; ghost?: PieceType } | null>(null)
  const strikeClear = useRef<number | null>(null)
  const [outro, setOutro] = useState(false)
  const outroTimer = useRef<number | null>(null)
  // Dönüşüm kuyruğu: sırayla oynar, biri bitince öbürü başlar
  const [morph, setMorph] = useState<Morph | null>(null)
  const morphQueue = useRef<Morph[]>([])
  const morphTimer = useRef<number | null>(null)
  const morphId = useRef(0)
  const [hitFlash, setHitFlash] = useState(false)
  const hitTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (outroTimer.current != null) window.clearTimeout(outroTimer.current)
    if (morphTimer.current != null) window.clearTimeout(morphTimer.current)
    if (hitTimer.current != null) window.clearTimeout(hitTimer.current)
    if (strikeClear.current != null) window.clearTimeout(strikeClear.current)
  }, [])

  // morphTimer null = kuyruk boşta; doluysa sıradaki, mevcut bitince gelir
  function playNextMorph() {
    const next = morphQueue.current.shift() ?? null
    setMorph(next)
    morphTimer.current = next ? window.setTimeout(playNextMorph, next.durationMs ?? MORPH_MS) : null
  }

  function enqueueMorphs(items: Morph[]) {
    if (items.length === 0) return
    morphQueue.current.push(...items)
    if (morphTimer.current == null) playNextMorph()
  }
  // Koşu sunucuya İŞLENDİ (RANKS_EVENT): kart, sunucunun onayladığı toplamla tazelensin
  const [rankTick, setRankTick] = useState(0)
  useEffect(() => {
    const onRanks = () => setRankTick((n) => n + 1)
    window.addEventListener(RANKS_EVENT, onRanks)
    return () => window.removeEventListener(RANKS_EVENT, onRanks)
  }, [])
  const { view: ranking, status: rankStatus } = useRanking('daily', `${result ? 1 : 0}-${rankTick}`)

  const latest = useRef(game)
  latest.current = game
  const slideRef = useRef<HTMLDivElement | null>(null)
  const progress = useRef(0)
  // Devam: hız anlık hedefinden başlar (yumuşatma kısa), süre kaldığı yerden
  const rps = useRef(resume ? 1000 / dailyIntervalMs(resume.game.captures) : 1000 / DAILY_START_MS)
  const lastTs = useRef<number | null>(null)
  const finished = useRef(false)
  const runStart = useRef(performance.now() - (resume?.elapsedMs ?? 0))

  /* Devam fişi: her commit'te (satır kayması dahil) yaz; bitince / çıkınca sil.
     Günlük, hak yandıktan sonra yenilemede kaybolmasın - kilit zaten sunucuda. */
  useEffect(() => {
    if (phase !== 'playing' || game.status !== 'playing' || finished.current) return
    if (game.distance === 0 && game.score === 0) return
    saveResume({
      config,
      data: { kind: 'daily', game, elapsedMs: performance.now() - runStart.current, day },
    })
  }, [game, phase, config, day])


  const moves = useMemo(() => (phase === 'playing' ? dailyMoves(game) : []), [game, phase])

  function commit(next: DailyState) {
    const prevType = latest.current.playerType
    latest.current = next
    setGame(next)

    // Dönüşümler olay sırasıyla: at→fil, at→vezir(mantar), vezir→at(vuruş)
    const morphs: Morph[] = []
    let typeBefore = prevType
    for (const event of next.events) {
      if (event.kind === 'transform') {
        morphs.push({ id: ++morphId.current, from: typeBefore, to: event.to, tone: 'up' })
        typeBefore = event.to
      } else if (event.kind === 'promote') {
        morphs.push({ id: ++morphId.current, from: typeBefore, to: 'q', tone: 'up' })
        typeBefore = 'q'
      } else if (event.kind === 'expire') {
        morphs.push({ id: ++morphId.current, from: 'q', to: event.to, tone: 'down' })
        typeBefore = event.to
      } else if (event.kind === 'shrink') {
        // Vuran taş karene gelirken vezir görünmeye devam eder (hold), taş
        // varınca kırmızı flaş + küçülme; vuran taş orada söner (DailyBoard ghost)
        const travel = event.by ? STRIKE_DELAY_MS + STRIKE_MOVE_MS : 0
        if (event.by && event.piece) {
          setStrike({ from: event.by, to: next.player, ghost: event.piece })
          if (strikeClear.current != null) window.clearTimeout(strikeClear.current)
          strikeClear.current = window.setTimeout(() => setStrike(null), travel + 400)
          morphs.push({ id: ++morphId.current, from: 'q', to: 'q', tone: 'hold', durationMs: travel })
        }
        morphs.push({ id: ++morphId.current, from: 'q', to: event.to, tone: 'down' })
        typeBefore = event.to
        if (hitTimer.current != null) window.clearTimeout(hitTimer.current)
        hitTimer.current = window.setTimeout(() => {
          setHitFlash(true)
          hitTimer.current = window.setTimeout(() => setHitFlash(false), HIT_FLASH_MS)
        }, travel)
      }
    }
    enqueueMorphs(morphs)

    const sound = soundOf(next.events)
    if (sound) playSound(sound)
    const nextFlash = describeEvents(next.events, t)
    if (nextFlash) setFlash(nextFlash)

    for (const event of next.events) {
      if (event.kind === 'capture') buzz(18)
      if (event.kind === 'promote') buzz([30, 40, 30])
      if (event.kind === 'shrink') buzz(60)
      if (event.kind === 'gameover' && !finished.current) {
        finished.current = true
        void finishRun(next)
        const striker = event.reason === 'captured' ? dailyStriker(next) : null
        if (striker) {
          setStrike({ from: striker, to: next.player })
          buzz([80, 60, 120])
          outroTimer.current = window.setTimeout(() => {
            setOutro(true)
            playSound('gameover')
          }, STRIKE_MS)
        } else {
          setOutro(true)
        }
      }
    }
  }

  async function record(state: DailyState, endReason: 'fellOff' | 'lifeLost' | 'abandoned'): Promise<RunRecord> {
    clearResume()
    const run = await recordRun({
      mode: 'daily',
      score: state.score,
      distance: state.distance,
      cols: DAILY_COLS,
      level: dailyLevel(state.captures),
      daily: day || undefined,
      day: day || undefined,
      chain: state.chain,
      kings: state.kings,
      bestStreak: state.bestCombo,
    })
    // Ömür boyu sayaçlar + günlük seri: bu mod da sayılır (19 Ağustos'a kadar
    // yalnızca Game.tsx yazıyordu; seri hiç ilerlemiyordu). Yenen taş = zincir.
    const tally = emptyTally()
    tally.kings = state.kings
    tally.bestStreak = state.bestCombo
    for (const piece of state.chain) tally.captured[piece] += 1
    recordLifetime(tally, { mode: 'daily', distance: state.distance, daily: day || undefined })
    if (DAILY_SUBMIT) {
      const { submitRun } = await import('../ui/leaderboard')
      void submitRun(run)
    }
    // İstatistik: ayrı uç, jeton yok. Hız ayarı bu modda yok - 'normal'.
    trackRun({
      mode: 'daily',
      daily: true,
      score: state.score,
      distance: state.distance,
      cols: DAILY_COLS,
      level: dailyLevel(state.captures),
      durationMs: performance.now() - runStart.current,
      endReason,
      speed: 'normal',
      kings: state.kings,
      bestStreak: state.bestCombo,
      stuckUsed: 0,
      mated: false,
    })
    return run
  }

  async function finishRun(state: DailyState) {
    const before = readStanding('daily')
    const elapsedMs = performance.now() - runStart.current
    const run = await record(state, state.endReason === 'fellOff' ? 'fellOff' : 'lifeLost')
    const after = readStanding('daily')
    setHiScore(after.allTime?.score ?? run.score)
    setResult({
      run,
      // Test kipinde kolay eğri gerçek rekoru "kırmış" görünmesin
      isBest: !tuningActive() && run.score > 0 && run.score > (before.allTime?.score ?? 0),
      best: before.allTime?.score ?? 0,
      elapsedMs,
    })
  }

  useImperativeHandle(ref, () => ({
    score: () => latest.current.score,
    abandon: async () => {
      const state = latest.current
      if (finished.current || state.status !== 'playing') return
      if (state.distance === 0 && state.score === 0) return
      finished.current = true
      await record(state, 'abandoned')
    },
  }))

  /* --- zaman döngüsü ------------------------------------------------ */
  useEffect(() => {
    if (game.status !== 'playing' || phase !== 'playing') return
    let raf = 0
    const frame = (ts: number) => {
      const last = lastTs.current ?? ts
      lastTs.current = ts
      const dt = Math.max(0, ts - last)

      const target = 1000 / dailyIntervalMs(latest.current.captures)
      rps.current += (target - rps.current) * (1 - Math.exp(-dt / SPEED_EASE_MS))
      progress.current += (dt / 1000) * rps.current

      let steps = 0
      while (progress.current >= 1 && steps <= ROWS) {
        progress.current -= 1
        steps += 1
        const next = applyDailyScroll(latest.current)
        // Satır kayması ile --t sıfırlaması AYNI karede DOM'a inmeli; yoksa
        // React bir kare geç kaydırır ve tahta bir an yukarı zıplar
        flushSync(() => commit(next))
        if (next.status !== 'playing') {
          progress.current = 0
          break
        }
      }
      if (steps > ROWS) progress.current = 0

      slideRef.current?.style.setProperty('--t', progress.current.toFixed(4))
      if (latest.current.status === 'playing') raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // commit her render'da yeni kapanış; döngü yalnızca koşu başında kurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.status, phase, runId])

  function onMove(to: Pos) {
    const state = latest.current
    if (state.status !== 'playing' || phase !== 'playing') return
    const moved = applyDailyMove(state, to)
    if (moved === state) return
    unlockSound()
    if (!moved.events.some((e) => e.kind !== 'scroll')) playSound('move')
    commit(moved)
  }

  /** Yalnızca geliştirmede: aynı tohumla yeniden başlat */
  function restart() {
    unlockSound()
    progress.current = 0
    rps.current = 1000 / DAILY_START_MS
    lastTs.current = null
    finished.current = false
    runStart.current = performance.now()
    const next = createDaily({ seed })
    latest.current = next
    setGame(next)
    setFlash(null)
    setResult(null)
    setStrike(null)
    setOutro(false)
    setMorph(null)
    setHitFlash(false)
    morphQueue.current = []
    if (outroTimer.current != null) window.clearTimeout(outroTimer.current)
    if (morphTimer.current != null) window.clearTimeout(morphTimer.current)
    morphTimer.current = null
    setRunId((n) => n + 1)
    if (countTimer.current != null) window.clearTimeout(countTimer.current)
    beginCountdown()
  }

  const shareInput: ShareInput = {
    mode: 'daily',
    day,
    score: game.score,
    distance: game.distance,
    captures: game.captures,
    chain: game.chain,
    streak: Math.max(currentStreak(readRuns()), lifetimeStreak()),
    name: identity.name,
    lang: settings.lang,
    bonus: dailyBonus(game.score),
  }

  const speedNow = 1000 / dailyIntervalMs(game.captures)

  const stateLine = (
    <span className="gv-tx gv-state">
      <b>
        {GLYPH[game.playerType]} {t(PIECE_NAME_KEY[game.playerType])}
      </b>
      {game.playerType === 'q' && game.base && (
        <>
          {' · '}
          <i>{t('daily.queen')}</i>
          {game.queenLeft > 0 && <> · <b>{t('daily.queenLeft', { n: game.queenLeft })}</b></>}
          {' → '}
          {GLYPH[game.base]}
        </>
      )}
    </span>
  )

  // Hak yandı ve oynanıyor: çıkışta onay + deftere `abandoned` (puan kalır)
  const runLive = phase === 'playing' && game.status === 'playing' && (game.distance > 0 || game.score > 0)

  return (
    <div className="gv daily-gv">
      <div className="gv-bar">
        <ExitButton className="gv-back" active={runLive} onExit={onExit}>
          ← {t('game.menu')}
        </ExitButton>
        <span>
          <span className="gv-glyph">⚡</span> <span className="gv-mode">{t('mode.daily.name')}</span>
        </span>
        <span>{t('game.daily')}</span>
        <span className="gv-sp" />
        <span>
          {t('hud.level')} <b>{dailyLevel(game.captures)}</b>
        </span>
      </div>

      <div className="gv-cnr">
        <ExitButton className="gv-exit" active={runLive} onExit={onExit} ariaLabel={t('game.menu')}>
          ←
        </ExitButton>
        <span className="gv-cell">
          <span className="gv-lb">{t('hud.score')}</span>
          <span className="gv-n xl">{game.score}</span>
        </span>
        <span className="gv-cell r">
          <span className="gv-lb">{t('home.best')}</span>
          <span className="gv-n lg">{Math.max(hiScore, game.score)}</span>
        </span>
      </div>

      <div className="gv-board" style={{ '--cols': String(DAILY_COLS) } as CSSProperties}>
        <DailyBoard
          state={game}
          moves={moves}
          slideRef={slideRef}
          dying={outro}
          strike={strike}
          morph={morph}
          hitFlash={hitFlash}
          onMove={onMove}
        />

        {phase === 'ready' && (
          <div className="outro daily-intro" role="dialog" aria-modal="true">
            <div className="outro-head">
              <p className="di-title">{t('daily.intro.title')}</p>
              <p className="di-ask">{t('daily.intro.ask')}</p>
            </div>
            <ul className="di-rules">
              <li>{t('daily.intro.r1')}</li>
              <li>{t('daily.intro.r2')}</li>
              <li>{t('daily.intro.r3')}</li>
            </ul>
            <div className="outro-actions">
              <button type="button" className="outro-btn primary" autoFocus disabled={arming} onClick={() => void onReady()}>
                {arming ? '…' : introError === 'played' ? t('daily.played') : t('daily.intro.go')}
              </button>
              {introError === 'offline' && <p className="di-err">{t('daily.offline')}</p>}
              {introError === 'played' && <p className="di-err">{t('daily.playedSub', { clock: '' }).replace(/\s*·\s*$/, '')}</p>}
              <button type="button" className="outro-btn" onClick={onExit}>
                {t('game.toMenu')}
              </button>
            </div>
          </div>
        )}

        {phase === 'countdown' && (
          <div className="daily-count" aria-live="assertive">
            <span key={count} className={count > 0 ? 'num' : 'go'}>{count > 0 ? count : t('daily.count.go')}</span>
          </div>
        )}

        {flash && !outro && (
          <div key={flash.id} className={`flash ${flash.tone}`}>
            {flash.text}
          </div>
        )}

        {outro && (
          <DailyOutro
            state={game}
            day={day}
            seedHex={(seed >>> 0).toString(16).slice(0, 6).toUpperCase()}
            isRecord={result?.isBest ?? false}
            best={result?.best ?? hiScore}
            elapsedMs={result?.elapsedMs ?? performance.now() - runStart.current}
            streak={Math.max(currentStreak(readRuns()), lifetimeStreak())}
            share={shareInput}
            onExit={onExit}
            onRestart={DAILY_REPLAY_ALLOWED ? restart : undefined}
          />
        )}
      </div>

      <div className="gv-cnr bot">
        <span className="gv-cell">
          <span className="gv-lb">{t('hud.distance')}</span>
          <span className="gv-n lg">{game.distance}</span>
        </span>
        <span className="gv-cell r">
          <span className="gv-lb">{t('daily.speed')}</span>
          <span className="gv-n lg">{speedNow.toFixed(1)}</span>
        </span>
      </div>

      <div className="gv-gear">
        <button type="button" className="gv-gearbtn" onClick={onOpenSettings} aria-label={t('settings.title')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <p className="gv-hint gv-tx">{t('daily.rules')}</p>

      <aside className="gv-side">
        <div className="gv-head">
          <span className="gv-cell">
            <span className="gv-lb">{t('hud.score')}</span>
            <span className="gv-n xl">{game.score}</span>
          </span>
          <span className="gv-sp" />
          <span className="gv-cell" style={{ textAlign: 'right' }}>
            <span className="gv-lb">{t('home.best')}</span>
            <span className="gv-n lg">{Math.max(hiScore, game.score)}</span>
          </span>
        </div>

        <div className="gv-stats">
          <span className="gv-cell">
            <span className="gv-lb">{t('hud.distance')}</span>
            <span className="gv-n md">{game.distance}</span>
          </span>
          <span className="gv-cell">
            <span className="gv-lb">{t('hud.level')}</span>
            <span className="gv-n md">{dailyLevel(game.captures)}</span>
          </span>
          <span className="gv-cell">
            <span className="gv-lb">{t('daily.speed')}</span>
            <span className="gv-n md">{speedNow.toFixed(1)}</span>
          </span>
          <span className="gv-cell">
            <span className="gv-lb">{t('daily.captures')}</span>
            <span className="gv-n md">{game.captures}</span>
          </span>
          <span className="gv-cell">
            <span className="gv-lb">{t('daily.combo')}</span>
            <span className="gv-n md">{game.combo > 0 ? `×${game.combo}` : '-'}</span>
          </span>
        </div>

        {stateLine}
        <p className="gv-tx daily-rules">{t('daily.rules')}</p>

        {DAILY_REPLAY_ALLOWED && (
          <div className="gv-btns one">
            <button type="button" onClick={restart}>
              {t('daily.dev.again')}
            </button>
          </div>
        )}

        <div className="gv-hr" />

        <div className="gv-set">
          <span className="gv-lb">{t('settings.title')}</span>
          <span className="gv-field">
            <span className="gv-tx">{t('settings.pieceColor')}</span>
            <span className="gv-seg">
              {(['w', 'b'] as const).map((color) => (
                <button
                  key={color}
                  type="button"
                  className={settings.pieceColor === color ? 'on' : ''}
                  aria-pressed={settings.pieceColor === color}
                  onClick={() => setPieceColor(color)}
                >
                  {color === 'w' ? t('settings.white') : t('settings.black')}
                </button>
              ))}
            </span>
          </span>
          <span className="gv-field">
            <span className="gv-tx">{t('hud.sound')}</span>
            <span className="gv-seg">
              {[true, false].map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  className={settings.sound === on ? 'on' : ''}
                  aria-pressed={settings.sound === on}
                  onClick={() => setSound(on)}
                >
                  {on ? t('settings.soundOn') : t('settings.soundOff')}
                </button>
              ))}
            </span>
          </span>
          <span className="gv-field">
            <span className="gv-tx">{t('settings.lang')}</span>
            <span className="gv-seg">
              {LANGS.map((entry) => (
                <button
                  key={entry.code}
                  type="button"
                  className={settings.lang === entry.code ? 'on' : ''}
                  aria-pressed={settings.lang === entry.code}
                  onClick={() => setLang(entry.code)}
                >
                  {entry.label}
                </button>
              ))}
            </span>
          </span>
        </div>

        <div className="gv-hr" />

        <div className="gv-meta">
          <span className="gv-chip">
            v<b>{APP_VERSION}</b>
          </span>
          <span className="gv-chip">
            #<b>{shortToken(identity.token)}</b>
          </span>
          <NameChip identity={identity} onChange={setIdentity} skin="gv" />
        </div>

        <div className="gv-hr" />
        <BadgeChip version={badgeVersion} onOpen={onOpenBadges} skin="gv" />
        <div className="gv-hr" />

        <button type="button" className="gv-rank" onClick={onOpenRanking}>
          <span className="gv-lb">{t('settings.ranking')}</span>
          <span className="gv-rank-row">
            <span className="gv-cell">
              <span className="gv-n md gold">{ranking.rank == null ? '-' : `#${ranking.rank}`}</span>
              <span className="gv-lb">{t('settings.rankMine')}</span>
            </span>
            <span className="gv-cell">
              <span className="gv-n md">{ranking.score}</span>
              <span className="gv-lb">{t('settings.scoreMine')}</span>
            </span>
            <span className="gv-cell">
              <span className="gv-n md">{ranking.players ?? '-'}</span>
              <span className="gv-lb">{t('settings.players')}</span>
            </span>
          </span>
          <span className="gv-rank-ft">
            <span>{t('settings.openFull')}</span>
            {rankStatus === 'local' && <i>{t('settings.serverPending')}</i>}
            {rankStatus === 'offline' && <i>{t('rank.offline')}</i>}
          </span>
        </button>

        <div className="gv-btns one">
          <button type="button" onClick={() => onOpenPage('help')}>
            {t('settings.howTo')}
          </button>
        </div>
        <div className="gv-btns">
          {/* Hakkında: pencere değil /about statik sayfası; koşu devam
              fişiyle (ui/resume) geri çağrılır */}
          <button type="button" onClick={() => window.location.assign('/about')}>
            {t('settings.about')}
          </button>
          <FeedbackLink lang={settings.lang} mode="daily" />
        </div>
      </aside>
    </div>
  )
}

function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // yoksay
  }
}

/** Bir hamlede birden çok olay: en "büyük" olanın sesi çalınır */
function soundOf(events: DailyEvent[]): SoundName | null {
  // Vurularak bitiş: önce vuruş sesi, oyun sonu sesi perde açılınca
  if (events.some((e) => e.kind === 'gameover' && e.reason === 'captured')) return 'lifeLost'
  const order: Array<[DailyEvent['kind'], SoundName]> = [
    ['gameover', 'gameover'],
    ['shrink', 'lifeLost'],
    ['promote', 'kingBonus'],
    ['expire', 'transform'],
    ['transform', 'transform'],
    ['capture', 'capture'],
  ]
  for (const [kind, sound] of order) {
    if (events.some((event) => event.kind === kind)) return sound
  }
  return null
}

let flashId = 0

function describeEvents(events: DailyEvent[], t: Translate): Flash | null {
  const parts: string[] = []
  let tone: Flash['tone'] = 'good'
  for (const event of events) {
    switch (event.kind) {
      case 'capture':
        parts.push(
          event.combo > 1
            ? t('daily.flash.combo', { piece: t(PIECE_NAME_KEY[event.piece]), points: event.points, combo: Math.min(DAILY_MAX_COMBO, event.combo) })
            : t('flash.capture', { piece: t(PIECE_NAME_KEY[event.piece]), points: event.points }),
        )
        break
      case 'transform':
        parts.push(t('flash.transform', { piece: t(PIECE_NAME_KEY[event.to]) }))
        break
      case 'promote':
        parts.length = 0
        parts.push(t('daily.flash.promote', { points: event.points }))
        tone = 'great'
        break
      case 'shrink':
        parts.push(t('daily.flash.shrink', { piece: t(PIECE_NAME_KEY[event.to]) }))
        tone = 'bad'
        break
      case 'expire':
        parts.push(t('daily.flash.expire', { piece: t(PIECE_NAME_KEY[event.to]) }))
        tone = 'info'
        break
      case 'gameover':
        if (event.reason === 'captured') {
          parts.length = 0
          parts.push(t('daily.over.captured'))
          tone = 'bad'
        }
        break
      default:
        break
    }
  }
  if (parts.length === 0) return null
  return { id: ++flashId, text: parts.join('  '), tone }
}
