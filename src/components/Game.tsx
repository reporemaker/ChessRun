import { useEffect, useMemo, useRef, useState } from 'react'
import { ROWS, STUCK_RIGHTS, STUCK_SCORE, levelOf } from '../engine/config'
import {
  applyBoardRefresh,
  applyEnemyMove,
  applyPlayerMove,
  applyScroll,
  applyStuck,
  checkedKingSquare,
  colsOf,
  createGame,
  hasAnyMove,
  legalMoves,
  movesToKing,
  needsBoardRefresh,
  playerInCheck,
  safeMoves,
  selectPiece,
} from '../engine/game'
import { key } from '../engine/moves'
import type { Color, GameEvent, GameMode, GameState, PieceType, Pos, Row } from '../engine/types'
import { emptyTally, tallyEvents } from '../ui/badges'
import { type TipId, TIP_KEY, readSeenTips, storeSeenTips } from '../ui/coach'
import { LANGS } from '../ui/i18n'
import type { StringKey } from '../ui/i18n'
import { submitRun } from '../ui/leaderboard'
import { GLYPH, PIECE_NAME_KEY } from '../ui/pieces'
import {
  type RunRecord,
  currentStreak,
  rankOf,
  readRuns,
  readStanding,
  recordRun,
  topRuns,
} from '../ui/scores'
import { setLang, setPieceColor, setSound, useSettings } from '../ui/settings'
import { shareRun, shareText } from '../ui/share'
import { endReasonOf, trackRun } from '../ui/stats'
import { type Translate, useT } from '../ui/text'
import { playEvents, playSound, unlockSound } from '../ui/sound'
import {
  PHASE_MS,
  type Phase,
  SPEEDS,
  SPEED_ORDER,
  type SpeedKey,
  readSpeed,
  storeSpeed,
  wait,
} from '../ui/timing'
import { ArcadeOutro } from './ArcadeOutro'
import { Board } from './Board'

export interface GameConfig {
  mode: GameMode
  playerColor: Color
  cols: number
  /** Günlük meydan okumaysa tohum ve gün anahtarı dolu olur */
  seed?: number | null
  daily?: string
}

interface GameProps {
  config: GameConfig
  onExit: () => void
  onOpenSettings: () => void
  onOpenPage: (page: 'help' | 'about') => void
}

interface Flash {
  id: number
  text: string
  tone: 'good' | 'great' | 'bad' | 'info'
}

/** Koşu bittiğinde deftere yazılan sonucun özeti */
interface RunResult {
  run: RunRecord
  isBest: boolean
  isWeekBest: boolean
  allTime: number
  weekBest: number
  /** Arcade tablosu ve sıra — Şah Kaçışı kapanışında gösteriliyor */
  table: RunRecord[]
  rank: number
}

const TIP_MS = 7000

export function Game({ config, onExit, onOpenSettings, onOpenPage }: GameProps) {
  const [game, setGame] = useState<GameState>(() => createGame(config))
  const [phase, setPhase] = useState<Phase>('input')
  const [ghostRow, setGhostRow] = useState<Row | null>(null)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [shake, setShake] = useState(0)
  const [speed, setSpeed] = useState<SpeedKey>(readSpeed)
  const [tip, setTip] = useState<TipId | null>(null)
  const [hiScore, setHiScore] = useState(() => readStanding(config.mode).allTime?.score ?? 0)
  const [result, setResult] = useState<RunResult | null>(null)
  const [shared, setShared] = useState<'shared' | 'copied' | 'failed' | null>(null)
  const [stuckBanner, setStuckBanner] = useState(false)

  /* Reklam yalnızca gerçek bir slot tanımlıysa çiziliyor — tanımsızken
     yer tutucu kutu göstermiyoruz. */
  const AD_SLOT = import.meta.env.VITE_AD_SLOT as string | undefined

  const seenTips = useRef(readSeenTips())
  const factor = SPEEDS[speed].factor
  const t = useT()
  const settings = useSettings()

  function pickSpeed(next: SpeedKey) {
    setSpeed(next)
    storeSpeed(next)
  }

  // Devam eden tur zincirini iptal etmek için — yeni oyun ya da bileşenin
  // sökülmesi yarım kalmış bir zincirin state yazmasını engeller
  const turnRef = useRef(0)
  useEffect(() => () => void turnRef.current++, [])

  /* --- Koşu ölçümü ---------------------------------------------------
     Koşu tam iki yerde doğuyor: bu bileşenin kurulması ve restart().
     restart() yeniden monte ETMİYOR, o yüzden mount'a bağlı bir effect
     ikinci doğumu kaçırırdı; [game]'e bağlı olan ise her commit'te
     çalışırdı. Doğrusu ref + restart()'ta tek satır.

     performance.now(), Date.now() değil: monoton, saat düzeltmelerinden
     etkilenmiyor. Kusuru sekme arka plandayken de işlemesi — gece açık
     kalan bir koşu şişik süre üretir; sunucu kırpıyor, panel medyanı da
     gösteriyor.

     Motora saat konmuyor: tohum + hamle dizisi bayt bayt aynı tahtayı
     üretmeli, günlük meydan okuma ve ileride sunucu doğrulaması buna
     dayanıyor. */
  const runStart = useRef(performance.now())
  const tally = useRef(emptyTally())
  // tallyEvents hamleden ÖNCEKİ taş tipini istiyor. commit'in kapanışındaki
  // `game` bir tur zincirinde bayatlıyor (runTurn arada render olmadan
  // commit'i birkaç kez çağırıyor), bu yüzden tipi commit'in kendisi taşıyor.
  const prevType = useRef<PieceType>(game.playerType)
  // Motor gameover'ı bir kez yayıyor (cloneState events'i sıfırlıyor) ama o
  // garanti üç dosya ötede yaşıyor — tek satırlık sigorta.
  const finished = useRef(false)

  const moves = useMemo(() => legalMoves(game), [game])
  const safe = useMemo(() => new Set(safeMoves(game).map(key)), [game])
  const checkedKing = useMemo(() => checkedKingSquare(game), [game])
  const kingDistance = useMemo(() => movesToKing(game), [game])
  const underThreat = useMemo(
    () => game.mode === 'kingRun' && playerInCheck(game),
    [game],
  )

  useEffect(() => {
    if (!tip) return
    const timer = setTimeout(() => setTip(null), TIP_MS)
    return () => clearTimeout(timer)
  }, [tip])

  /** Bir ipucunu yalnızca ilk kez gösterir */
  function offerTip(id: TipId) {
    if (seenTips.current.has(id)) return
    seenTips.current.add(id)
    storeSeenTips(seenTips.current)
    setTip(id)
  }

  function commit(next: GameState) {
    tally.current = tallyEvents(tally.current, next.events, prevType.current)
    prevType.current = next.playerType

    setGame(next)
    playEvents(next.events)

    const nextFlash = describeEvents(next.events, t)
    if (nextFlash) setFlash(nextFlash)

    for (const event of next.events) {
      if (event.kind === 'transform') offerTip('transform')
      if (event.kind === 'check') offerTip('check')
      if (event.kind === 'lifeLost') {
        setShake((n) => n + 1)
        buzz(60)
      }
      if (event.kind === 'checkmated') {
        setShake((n) => n + 1)
        buzz([80, 60, 120])
      }
      if (event.kind === 'kingBonus') buzz([30, 40, 30])
      if (event.kind === 'capture') buzz(18)
      if (event.kind === 'gameover' && !finished.current) {
        finished.current = true
        void finishRun(next)
      }
    }
  }

  /** Koşuyu imzalayıp deftere yaz, rekor kırıldıysa kutla */
  async function finishRun(state: GameState) {
    const before = readStanding(state.mode)
    const durationMs = performance.now() - runStart.current
    const counts = tally.current
    const cols = colsOf(state.board)
    const level = levelOf(state.distance) + 1

    const run = await recordRun({
      mode: state.mode,
      score: state.score,
      distance: state.distance,
      cols,
      level,
      daily: config.daily,
      chain: state.chain,
      kings: counts.kings,
      bestStreak: counts.bestStreak,
      stuckUsed: counts.stuckUsed,
      mated: counts.mated,
    })

    const after = readStanding(state.mode)
    const isBest = run.score > 0 && run.score > (before.allTime?.score ?? 0)
    const runs = readRuns()

    setHiScore(after.allTime?.score ?? run.score)
    setResult({
      run,
      isBest,
      isWeekBest: !isBest && run.score > 0 && run.score > (before.thisWeek?.score ?? 0),
      allTime: after.allTime?.score ?? run.score,
      weekBest: after.thisWeek?.score ?? run.score,
      table: topRuns(runs, state.mode),
      rank: rankOf(runs, run),
    })

    if (isBest) buzz([40, 60, 40, 60, 90])

    // Sunucu tanımlıysa aynı kayıt imzasıyla haftalık tabloya gider
    void submitRun(run)

    // İstatistik ayrı uç, ayrı tip, cihaz jetonu YOK. Oyunu bekletmiyor.
    trackRun({
      mode: state.mode,
      daily: Boolean(config.daily),
      score: state.score,
      distance: state.distance,
      cols,
      level,
      durationMs,
      endReason: endReasonOf(state.events),
      speed,
      kings: counts.kings,
      bestStreak: counts.bestStreak,
      stuckUsed: counts.stuckUsed,
      mated: counts.mated,
    })
  }

  function restart() {
    turnRef.current++
    unlockSound()
    const next = createGame(config)
    // Koşunun ikinci doğum yeri — bileşen yeniden monte olmadığı için
    // ölçüm ref'lerini burada elle sıfırlamak zorundayız
    runStart.current = performance.now()
    tally.current = emptyTally()
    prevType.current = next.playerType
    finished.current = false
    setGame(next)
    setPhase('input')
    setGhostRow(null)
    setFlash(null)
    setResult(null)
    setShared(null)
    setHiScore(readStanding(config.mode).allTime?.score ?? 0)
  }

  /**
   * Bir turu fazlarına ayırıp sırayla oynatır:
   * oyuncu oynar → (şah yendiyse tahta yenilenir) → tahta kayar → rakip oynar.
   */
  async function runTurn(afterPlayerMove: GameState, playerMoved: boolean) {
    const token = ++turnRef.current
    const alive = () => turnRef.current === token
    const pause = (ms: number) => wait(ms * factor)

    if (playerMoved) {
      setPhase('playerMove')
      commit(afterPlayerMove)
      await pause(PHASE_MS.playerMove)
      if (!alive()) return
    }

    // Şah yendiyse tahta baştan kurulur: satırlar yanıp söner, yenisi açılır
    let base = afterPlayerMove
    if (needsBoardRefresh(afterPlayerMove)) {
      setPhase('boardOut')
      await pause(PHASE_MS.boardOut)
      if (!alive()) return

      base = applyBoardRefresh(afterPlayerMove)
      setPhase('boardIn')
      commit(base)
      await pause(PHASE_MS.boardIn)
      if (!alive()) return
    }

    const scrolled = applyScroll(base)
    setGhostRow(base.board[ROWS - 1])
    setPhase('scroll')
    commit(scrolled)
    await pause(PHASE_MS.scroll)
    if (!alive()) return

    if (scrolled.status === 'playing') {
      const answered = applyEnemyMove(scrolled)
      setPhase('enemyMove')
      commit(answered)
      await pause(PHASE_MS.enemyMove)
      if (!alive()) return

      // Sıra oyuncuya döndü: durumu anlatan bir ipucu varsa şimdi çıkar
      if (answered.status === 'playing') {
        const toKing = movesToKing(answered)
        if (answered.player.row >= ROWS - 2) offerTip('edge')
        else if (toKing != null && toKing <= 2) offerTip('king')
      }

      // Hamlesi kalmadıysa bekleme yok: sıkışma fazı devreye giriyor
      if (answered.status === 'playing' && !hasAnyMove(answered)) {
        setGhostRow(null)
        await runStuck(answered, alive, pause)
        return
      }
    }

    setPhase('input')
    setGhostRow(null)
  }

  /**
   * Sıkışma: hamlen kalmadı. Bir hak yanıyor, tahta yeniden diziliyor.
   * Hak bittiyse applyStuck koşuyu bitiriyor ve bitiş ekranı devralıyor.
   */
  async function runStuck(
    base: GameState,
    alive: () => boolean,
    pause: (ms: number) => Promise<void>,
  ) {
    offerTip('stuck')
    setStuckBanner(true)
    setPhase('stuckOut')
    await pause(PHASE_MS.stuckOut)
    if (!alive()) return

    const next = applyStuck(base)
    setPhase('stuckIn')
    commit(next)
    await pause(PHASE_MS.stuckIn)
    if (!alive()) return

    setStuckBanner(false)
    if (next.status === 'playing') setPhase('input')
  }

  function onMove(to: Pos) {
    if (phase !== 'input' || game.status !== 'playing') return

    // Üçlü: kendi taşına dokunmak hamle değil, seçim. Tur harcamıyor.
    const index = game.squad.findIndex((pos) => pos.row === to.row && pos.col === to.col)
    if (game.mode === 'trio' && index >= 0 && index !== game.selected) {
      unlockSound()
      playSound('move')
      setGame(selectPiece(game, index))
      return
    }

    const moved = applyPlayerMove(game, to)
    if (moved === game) return

    unlockSound()
    playSound('move')
    void runTurn(moved, true)
  }

  async function onShare() {
    if (!config.daily) return
    setShared(
      await shareRun(
        shareText({
          mode: game.mode,
          day: config.daily,
          score: game.score,
          distance: game.distance,
          chain: game.chain,
          streak: currentStreak(readRuns()),
          mated: game.events.some((event) => event.kind === 'checkmated'),
        }, t),
      ),
    )
  }

  const canAct = phase === 'input' && game.status === 'playing'
  const over = game.status === 'gameover'
  // Arcade kapanış üç modda da: tahta kırmızı alarmla söner, sonra tablo açılır
  const arcadeOutro = over
  const shareLabel =
    shared === 'copied'
      ? t('game.shareCopied')
      : shared === 'shared'
        ? t('game.shareDone')
        : t('game.share')

  const lives =
    game.mode === 'trio' ? String(game.squad.length) : '♥'.repeat(Math.min(game.lives, 5))
  const livesLabel = game.mode === 'trio' ? t('hud.pieces') : t('hud.lives')
  const stuckDots =
    '●'.repeat(game.stuckLeft) + '○'.repeat(Math.max(0, STUCK_RIGHTS - game.stuckLeft))

  /** Sağ sütundaki ve mobil köşelerdeki tur durumu */
  /** Üçlü'de kadro: hangi taş seçili, hangisi bir sonraki kaymada düşecek */
  const squadStrip =
    game.mode !== 'trio' ? null : (
      <span className="gv-squad">
        {game.squad.map((pos, index) => {
          const piece = game.board[pos.row].cells[pos.col]
          return (
            <span
              key={piece?.id ?? index}
              className={`gv-sq ${index === game.selected ? 'on' : ''} ${
                pos.row >= ROWS - 1 ? 'falling' : ''
              }`}
              title={pos.row >= ROWS - 1 ? t('hud.falling') : undefined}
            >
              {piece ? GLYPH[piece.type] : '·'}
            </span>
          )
        })}
      </span>
    )

  const stateLine = (
    <span className="gv-tx gv-state">
      <b>
        {GLYPH[game.playerType]} {t(PIECE_NAME_KEY[game.playerType])}
      </b>
      {checkedKing != null && (
        <>
          {' · '}
          <i>
            {t('hud.check')}
            {game.checkStreak > 1 ? ` ×${game.checkStreak}` : ''}
          </i>
        </>
      )}
      {underThreat && (
        <>
          {' · '}
          <i>{t('hud.threat')}</i>
        </>
      )}
      {game.mode !== 'kingRun' && (
        <>
          {' · ♚ '}
          <b>{kingDistance == null ? '—' : kingDistance}</b> {t('hud.moves')}
        </>
      )}
      {' · '}
      <b>{safe.size}</b> {t('hud.safeMoves')}
    </span>
  )

  return (
    <div className="gv">
      {/* ---- masaüstü üst çubuk ---- */}
      <div className="gv-bar">
        <button type="button" className="gv-back" onClick={onExit}>
          ← {t('game.menu')}
        </button>
        <span>
          <span className="gv-glyph">{game.mode === 'kingRun' ? '♚' : game.mode === 'trio' ? '♛' : '♞'}</span>{' '}
          <span className="gv-mode">{t(`mode.${game.mode}.name`)}</span>
        </span>
        {config.daily && <span>{t('game.daily')}</span>}
        <span className="gv-sp" />
        <span>{t('home.rank')} —</span>
      </div>

      {/* ---- mobil üst köşeler ---- */}
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

      {/* ---- tahta ---- */}
      <div className="gv-board">
        <Board
          state={game}
          moves={moves}
          checkedKing={checkedKing}
          ghostRow={ghostRow}
          phase={phase}
          speed={factor}
          shakeTick={shake}
          dying={arcadeOutro}
          onMove={onMove}
        />

        {flash && !stuckBanner && (
          <div key={flash.id} className={`flash ${flash.tone}`}>
            {flash.text}
          </div>
        )}

        {stuckBanner && (
          <div className="stuck-banner">
            <strong>{t('game.stuck')}</strong>
            <span>{t('game.stuckSub', { n: STUCK_SCORE })}</span>
            <em>{stuckDots}</em>
          </div>
        )}

        {/* İpucu tahtanın üstünde: mobilde ayrı bir satıra yer yok */}
        {tip && (
          <p className="gv-tip">
            {t(TIP_KEY[tip])}
            <button type="button" onClick={() => setTip(null)} aria-label={t('game.tipClose')}>
              ×
            </button>
          </p>
        )}

        {arcadeOutro && (
          <ArcadeOutro
            run={result?.run ?? null}
            score={game.score}
            distance={game.distance}
            mated={game.events.some((event) => event.kind === 'checkmated')}
            table={result?.table ?? []}
            rank={result?.rank ?? null}
            isRecord={result?.isBest ?? false}
            isWeekRecord={result?.isWeekBest ?? false}
            chain={game.mode === 'classic' ? game.chain : undefined}
            daily={config.daily}
            shareLabel={shareLabel}
            onShare={() => void onShare()}
            onRestart={restart}
            onExit={onExit}
          />
        )}
      </div>

      {/* ---- mobil alt köşeler ---- */}
      <div className="gv-cnr bot">
        <span className="gv-cell">
          <span className="gv-lb">{t('hud.distance')}</span>
          <span className="gv-n lg">{game.distance}</span>
        </span>
        <span className="gv-cell r">
          <span className="gv-lb">{livesLabel}</span>
          <span className="gv-n lg">{lives}</span>
        </span>
      </div>

      {/* ---- mobil dişli: tek dokunulacak şey ---- */}
      <div className="gv-gear">
        <button
          type="button"
          className="gv-gearbtn"
          onClick={onOpenSettings}
          aria-label={t('settings.title')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* ---- masaüstü ipucu satırı ---- */}
      <p className="gv-hint gv-tx">
        {canAct ? statusHint(game, checkedKing != null, underThreat, t) : phaseLabel(phase, t)}
      </p>

      {/* ---- masaüstü sağ sütun (D) ---- */}
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
            <span className="gv-n md">{levelOf(game.distance) + 1}</span>
          </span>
          <span className="gv-cell">
            <span className="gv-lb">{livesLabel}</span>
            <span className="gv-n md">{lives}</span>
          </span>
          <span className="gv-cell">
            <span className="gv-lb">{t('hud.stuck')}</span>
            <span className="gv-n md">{stuckDots}</span>
          </span>
        </div>

        {squadStrip}
        {stateLine}

        <div className="gv-hr" />

        <div className="gv-set">
          <span className="gv-lb">{t('settings.title')}</span>

          <span className="gv-field">
            <span className="gv-tx">{t('hud.speed')}</span>
            <span className="gv-seg">
              {SPEED_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={speed === key ? 'on' : ''}
                  aria-pressed={speed === key}
                  onClick={() => pickSpeed(key)}
                >
                  {t(SPEEDS[key].labelKey)}
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

        {/* Rozet sistemi henüz yok: yeri ayrıldı, sahte ilerleme gösterilmiyor */}
        <div className="gv-cell">
          <span className="gv-lb">
            {t('game.badges')} · {t('common.soon')}
          </span>
          <span className="gv-bdg">
            <u>♛</u>
            <u>♚</u>
            <u>♜</u>
            <u>♝</u>
            <u>♞</u>
          </span>
        </div>

        <div className="gv-links">
          <button type="button" className="gv-lk" onClick={() => onOpenPage('help')}>
            {t('settings.howTo')}
          </button>
          <button type="button" className="gv-lk" onClick={() => onOpenPage('about')}>
            {t('settings.about')}
          </button>
        </div>

        {AD_SLOT && <div className="gv-ad">REKLAM</div>}
      </aside>
    </div>
  )
}

function statusHint(
  game: GameState,
  inCheck: boolean,
  underThreat: boolean,
  t: Translate,
): string {
  if (underThreat) return t('hint.threat')
  if (inCheck) return t('hint.check')
  if (game.mode === 'kingRun') return t('hint.kingRun')
  return ''
}

/** Dokunmatik cihazlarda kısa titreşim — desteklenmiyorsa sessizce geçer */
function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // yoksay
  }
}

const PHASE_KEY: Record<Phase, StringKey | null> = {
  input: null,
  playerMove: 'phase.playerMove',
  boardOut: 'phase.boardOut',
  boardIn: 'phase.boardIn',
  stuckOut: 'phase.stuckOut',
  stuckIn: 'phase.stuckIn',
  scroll: 'phase.scroll',
  enemyMove: 'phase.enemyMove',
}

function phaseLabel(phase: Phase, t: Translate): string {
  const key = PHASE_KEY[phase]
  return key ? t(key) : ''
}

let flashId = 0

function describeEvents(events: GameEvent[], t: Translate): Flash | null {
  const parts: string[] = []
  let tone: Flash['tone'] = 'good'

  for (const event of events) {
    switch (event.kind) {
      case 'kingBonus':
        parts.push(t('flash.kingBonus', { points: event.points, lives: event.lives }))
        tone = 'great'
        break
      case 'capture':
        parts.push(
          t('flash.capture', { piece: t(PIECE_NAME_KEY[event.piece]), points: event.points }),
        )
        break
      case 'transform':
        parts.push(t('flash.transform', { piece: t(PIECE_NAME_KEY[event.to]) }))
        break
      case 'check':
        parts.push(
          event.streak > 1
            ? t('flash.checkStreak', { streak: event.streak, points: event.points })
            : t('flash.check', { points: event.points }),
        )
        tone = 'great'
        break
      case 'mate':
        parts.push(t('flash.mate', { points: event.points }))
        tone = 'great'
        break
      case 'checkmated':
        parts.push(t('flash.checkmated'))
        tone = 'bad'
        break
      case 'boardRefresh':
        parts.push(t('flash.refresh'))
        tone = 'info'
        break
      case 'squadGain':
        parts.push(t('flash.squadGain', { piece: t(PIECE_NAME_KEY[event.piece]) }))
        tone = 'great'
        break
      case 'threat':
        parts.push(t('flash.threat', { count: event.count, points: event.points }))
        break
      case 'pieceLost':
        parts.push(
          t(event.reason === 'captured' ? 'flash.pieceCaptured' : 'flash.pieceFell', {
            piece: t(PIECE_NAME_KEY[event.piece]),
            left: event.left,
          }),
        )
        tone = 'bad'
        break
      case 'lifeLost':
        parts.push(
          event.reason === 'captured' ? t('flash.lifeCaptured') : t('flash.lifeFell'),
        )
        tone = 'bad'
        break
      default:
        break
    }
  }

  if (parts.length === 0) return null
  return { id: ++flashId, text: parts.join('  '), tone }
}
