import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
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
  dailyUnderThreat,
} from '../engine/daily'
import type { PieceType, Pos } from '../engine/types'
import { getIdentity, shortToken } from '../ui/identity'
import { DAILY_REPLAY_ALLOWED, markDailyPlayed } from '../ui/dailyLock'
import { GLYPH, PIECE_NAME_KEY } from '../ui/pieces'
import { type RunRecord, currentStreak, rankOf, readRuns, readStanding, recordRun, topRuns } from '../ui/scores'
import { lifetimeStreak } from '../ui/lifetime'
import { useRanking } from '../ui/useRanking'
import { trackRun } from '../ui/stats'
import { setLang, setPieceColor, setSound, useSettings } from '../ui/settings'
import { LANGS } from '../ui/i18n'
import { shareRun, shareText } from '../ui/share'
import { feedbackHref } from '../ui/feedback'
import { type Translate, useT } from '../ui/text'
import { type SoundName, playSound, unlockSound } from '../ui/sound'
import { APP_VERSION } from '../ui/version'
import { ArcadeOutro } from './ArcadeOutro'
import { BadgeChip } from './BadgeChip'
import { DailyBoard } from './DailyBoard'
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
 * atılır (en çok ROWS+1 — yeterince uzun kaldıysan düşmüşsündür). Karar:
 * duraklatma yok, süre akar.
 */

interface DailyGameProps {
  config: GameConfig
  onExit: () => void
  onOpenSettings: () => void
  onOpenPage: (page: 'help' | 'about') => void
  onOpenRanking: () => void
  onOpenBadges: () => void
  badgeVersion: number
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
  table: RunRecord[]
  rank: number
}

/** Hız değişimi tık tık değil: hedefe bu zaman sabitiyle yaklaşır */
const SPEED_EASE_MS = 600

/**
 * Yenilme sahnesi: vurulan kareye inince oyun ANINDA kararmaz — vuran taş
 * gelip seni alır, "VURULDUN" görünür, bir saniye sonra oyun sonu ekranı
 * (kullanıcı 18 Ağustos: "yenildiğimi göster, 1 sn sonra game over").
 */
const STRIKE_MS = 1000

/**
 * Dönüşüm titreşimi süresi (Mario mantarı). Aynı hamlede birden çok dönüşüm
 * olabilir (korunan şahı yedin: at→vezir, sonra vuruldun: vezir→at) —
 * sırayla oynatılır ki oyuncu ne olduğunu görsün. CSS morph-* ile aynı.
 */
const MORPH_MS = 700
/** Vezirken vurulma: kare kırmızı flaş süresi */
const HIT_FLASH_MS = 700

interface Morph {
  id: number
  from: PieceType
  to: PieceType
  tone: 'up' | 'down'
}

/**
 * Sunucuya gönderim. Worker `shared/events` MODES'ta `daily`yi tanıdığı
 * sürümle birlikte dağıtılmalı — eski Worker bilinmeyen modu `classic`e
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
  ref,
}: DailyGameProps) {
  const seed = config.seed ?? 0
  const day = config.daily ?? ''
  const t = useT()
  const settings = useSettings()

  const [game, setGame] = useState<DailyState>(() => createDaily({ seed }))
  const [runId, setRunId] = useState(0)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [shared, setShared] = useState<'shared' | 'copied' | 'failed' | null>(null)
  const [hiScore, setHiScore] = useState(() => readStanding('daily').allTime?.score ?? 0)
  const [identity, setIdentity] = useState(() => getIdentity())
  // Yenilme sahnesi (vuran taş → oyuncu) ve oyun sonu perdesinin gecikmesi
  const [strike, setStrike] = useState<{ from: Pos; to: Pos } | null>(null)
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
  }, [])

  // morphTimer null = kuyruk boşta; doluysa sıradaki, mevcut bitince gelir
  function playNextMorph() {
    const next = morphQueue.current.shift() ?? null
    setMorph(next)
    morphTimer.current = next ? window.setTimeout(playNextMorph, MORPH_MS) : null
  }

  function enqueueMorphs(items: Morph[]) {
    if (items.length === 0) return
    morphQueue.current.push(...items)
    if (morphTimer.current == null) playNextMorph()
  }
  const { view: ranking, status: rankStatus } = useRanking('daily', result)

  const latest = useRef(game)
  latest.current = game
  const slideRef = useRef<HTMLDivElement | null>(null)
  const progress = useRef(0)
  const rps = useRef(1000 / DAILY_START_MS)
  const lastTs = useRef<number | null>(null)
  const finished = useRef(false)
  const runStart = useRef(performance.now())

  // Hak koşu başlayınca yanar — kapatıp kaçmak kurtarmaz
  useEffect(() => {
    if (day) markDailyPlayed(day)
  }, [day])

  const moves = useMemo(() => dailyMoves(game), [game])
  const threatened = useMemo(() => game.status === 'playing' && dailyUnderThreat(game), [game])

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
        morphs.push({ id: ++morphId.current, from: 'q', to: event.to, tone: 'down' })
        typeBefore = event.to
        setHitFlash(true)
        if (hitTimer.current != null) window.clearTimeout(hitTimer.current)
        hitTimer.current = window.setTimeout(() => setHitFlash(false), HIT_FLASH_MS)
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
    if (DAILY_SUBMIT) {
      const { submitRun } = await import('../ui/leaderboard')
      void submitRun(run)
    }
    // İstatistik: ayrı uç, jeton yok. Hız ayarı bu modda yok — 'normal'.
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
    const run = await record(state, state.endReason === 'fellOff' ? 'fellOff' : 'lifeLost')
    const after = readStanding('daily')
    const runs = readRuns()
    setHiScore(after.allTime?.score ?? run.score)
    setResult({
      run,
      isBest: run.score > 0 && run.score > (before.allTime?.score ?? 0),
      table: topRuns(runs, 'daily'),
      rank: rankOf(runs, run),
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
    if (game.status !== 'playing') return
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
  }, [game.status, runId])

  function onMove(to: Pos) {
    const state = latest.current
    if (state.status !== 'playing') return
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
    setShared(null)
    setStrike(null)
    setOutro(false)
    setMorph(null)
    setHitFlash(false)
    morphQueue.current = []
    if (outroTimer.current != null) window.clearTimeout(outroTimer.current)
    if (morphTimer.current != null) window.clearTimeout(morphTimer.current)
    morphTimer.current = null
    setRunId((n) => n + 1)
  }

  async function onShare() {
    setShared(
      await shareRun(
        shareText(
          {
            mode: 'daily',
            day,
            score: game.score,
            distance: game.distance,
            chain: game.chain,
            streak: Math.max(currentStreak(readRuns()), lifetimeStreak()),
          },
          t,
        ),
      ),
    )
  }

  const speedNow = 1000 / dailyIntervalMs(game.captures)
  const shareLabel =
    shared === 'copied' ? t('game.shareCopied') : shared === 'shared' ? t('game.shareDone') : t('game.share')

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
      {threatened && (
        <>
          {' · '}
          <i>{t('hud.threat')}</i>
        </>
      )}
    </span>
  )

  return (
    <div className="gv daily-gv">
      <div className="gv-bar">
        <button type="button" className="gv-back" onClick={onExit}>
          ← {t('game.menu')}
        </button>
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
        <span className="gv-cell">
          <span className="gv-lb">{t('hud.score')}</span>
          <span className="gv-n xl">{game.score}</span>
        </span>
        <span className="gv-cell r">
          <span className="gv-lb">{t('home.best')}</span>
          <span className="gv-n lg">{Math.max(hiScore, game.score)}</span>
        </span>
      </div>

      <div className="gv-board">
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

        {flash && !outro && (
          <div key={flash.id} className={`flash ${flash.tone}`}>
            {flash.text}
          </div>
        )}

        {outro && (
          <ArcadeOutro
            run={result?.run ?? null}
            score={game.score}
            distance={game.distance}
            mated={false}
            table={result?.table ?? []}
            rank={result?.rank ?? null}
            isRecord={result?.isBest ?? false}
            chain={game.chain}
            daily={day || undefined}
            shareLabel={shareLabel}
            onShare={() => void onShare()}
            onRestart={restart}
            onExit={onExit}
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
            <span className="gv-n md">{game.combo > 0 ? `×${game.combo}` : '—'}</span>
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
              <span className="gv-n md gold">{ranking.rank == null ? '—' : `#${ranking.rank}`}</span>
              <span className="gv-lb">{t('settings.rankMine')}</span>
            </span>
            <span className="gv-cell">
              <span className="gv-n md">{ranking.score}</span>
              <span className="gv-lb">{t('settings.scoreMine')}</span>
            </span>
            <span className="gv-cell">
              <span className="gv-n md">{ranking.players ?? '—'}</span>
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
          <button type="button" onClick={() => onOpenPage('about')}>
            {t('settings.about')}
          </button>
          <a href={feedbackHref(settings.lang, 'daily')}>{t('settings.feedback')}</a>
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
