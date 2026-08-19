import { type CSSProperties, type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { COL_CHOICES, ROWS, STUCK_RIGHTS, STUCK_SCORE, levelOf } from '../engine/config'
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
import type { EndReason } from '@shared/events'
import type { Color, GameEvent, GameMode, GameState, PieceType, Pos, Row } from '../engine/types'
import { type BadgeAward, badgeOf, claimBadges, emptyTally, tallyEvents, tallyStep } from '../ui/badges'
import { type Lifetime, lifetimeStreak, readLifetime, recordLifetime } from '../ui/lifetime'
import { type TipId, TIP_KEY, readSeenTips, storeSeenTips } from '../ui/coach'
import { getIdentity, shortToken } from '../ui/identity'
import { LANGS } from '../ui/i18n'
import type { StringKey } from '../ui/i18n'
import { submitRun } from '../ui/leaderboard'
import { GLYPH, PIECE_NAME_KEY } from '../ui/pieces'
import {
  type RunRecord,
  currentStreak,
  dailyScoreOf,
  dayKey,
  rankOf,
  readRuns,
  readStanding,
  recordRun,
  topRuns,
} from '../ui/scores'
import { applyDailyBonus, dailyBonus } from '@shared/leaderboard'
import { useRanking } from '../ui/useRanking'
import { setCols, setLang, setPieceColor, setSound, useSettings } from '../ui/settings'
import type { ShareInput } from '../ui/share'
import { FeedbackLinks } from './FeedbackLinks'
import { endReasonOf, trackRun } from '../ui/stats'
import { type Translate, useT } from '../ui/text'
import { playEvents, playSound, unlockSound } from '../ui/sound'
import { APP_VERSION } from '../ui/version'
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
import { type GameResume, clearResume, reviveGame, saveResume, serializeGame } from '../ui/resume'
import { ArcadeOutro } from './ArcadeOutro'
import { ExitButton } from './ExitButton'
import { BadgeChip } from './BadgeChip'
import { NameChip } from './NameChip'
import { Board } from './Board'

export interface GameConfig {
  mode: GameMode
  playerColor: Color
  cols: number
  /** Günlük meydan okumaysa tohum ve gün anahtarı dolu olur */
  seed?: number | null
  daily?: string
}

/**
 * App'in oyuna dışarıdan dokunabildiği tek yer. Koridor genişliği oyun
 * sürerken değişirse App önce `abandon()` ile mevcut koşuyu deftere
 * yazdırıyor, sonra yeni genişlikte yeniden kuruyor - puan kaybolmuyor,
 * kapanıyor.
 */
export interface GameHandle {
  /** Sürmekte olan koşuyu kaydeder (bitmiş ya da hiç başlamamışsa hiçbir şey yapmaz) */
  abandon: () => Promise<void>
  /** Uyarı metninde göstermek için anlık skor */
  score: () => number
}

interface GameProps {
  config: GameConfig
  onExit: () => void
  onOpenSettings: () => void
  onOpenPage: (page: 'help' | 'about') => void
  onOpenRanking: () => void
  onOpenBadges: () => void
  badgeVersion: number
  /** Sağ sütundaki koridor seçimi onaylanınca: App koşuyu kapatıp yeni genişlikte kurar */
  onRestartWithCols: (cols: number) => void
  /** Devam fişi (yenileme / sekme ölümü sonrası): koşu kaldığı yerden sürer */
  resume?: GameResume
  ref?: Ref<GameHandle>
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
  /** Arcade tablosu ve sıra - Şah Kaçışı kapanışında gösteriliyor */
  table: RunRecord[]
  rank: number
  /** Bu koşuda kazanılan rozet kademeleri - kapanış özeti */
  badges: BadgeAward[]
}

const TIP_MS = 7000

export function Game({
  config,
  onExit,
  onOpenSettings,
  onOpenPage,
  onOpenRanking,
  onOpenBadges,
  badgeVersion,
  onRestartWithCols,
  resume,
  ref,
}: GameProps) {
  const [game, setGame] = useState<GameState>(() => (resume ? reviveGame(resume.game) : createGame(config)))
  const [phase, setPhase] = useState<Phase>('input')
  const [ghostRow, setGhostRow] = useState<Row | null>(null)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [shake, setShake] = useState(0)
  const [speed, setSpeed] = useState<SpeedKey>(readSpeed)
  const [tip, setTip] = useState<TipId | null>(null)
  const [hiScore, setHiScore] = useState(() => readStanding(config.mode).allTime?.score ?? 0)
  const [result, setResult] = useState<RunResult | null>(null)
  const [stuckBanner, setStuckBanner] = useState(false)
  // Sağ sütun: koridor seçimi onay bekliyor (pencereyle aynı akış)
  const [pendingCols, setPendingCols] = useState<number | null>(null)
  const [identity, setIdentity] = useState(() => getIdentity())
  // Sıralama özeti - koşu bitince (result değişince) tazeleniyor
  const { view: ranking, status: rankStatus } = useRanking(config.mode, result)

  /* Reklam yalnızca gerçek bir slot tanımlıysa çiziliyor - tanımsızken
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

  // Devam eden tur zincirini iptal etmek için - yeni oyun ya da bileşenin
  // sökülmesi yarım kalmış bir zincirin state yazmasını engeller
  const turnRef = useRef(0)
  useEffect(() => () => void turnRef.current++, [])

  /* --- Koşu ölçümü ---------------------------------------------------
     Koşu tam iki yerde doğuyor: bu bileşenin kurulması ve restart().
     restart() yeniden monte ETMİYOR, o yüzden mount'a bağlı bir effect
     ikinci doğumu kaçırırdı; [game]'e bağlı olan ise her commit'te
     çalışırdı. Doğrusu ref + restart()'ta tek satır.

     performance.now(), Date.now() değil: monoton, saat düzeltmelerinden
     etkilenmiyor. Kusuru sekme arka plandayken de işlemesi - gece açık
     kalan bir koşu şişik süre üretir; sunucu kırpıyor, panel medyanı da
     gösteriyor.

     Motora saat konmuyor: tohum + hamle dizisi bayt bayt aynı tahtayı
     üretmeli, günlük meydan okuma ve ileride sunucu doğrulaması buna
     dayanıyor. */
  const runStart = useRef(performance.now() - (resume?.elapsedMs ?? 0))
  /* Günlük çarpan: koşu BAŞINDA sabitlenir (bugün günün mücadelesi
     oynandıysa onun puanı → 1 + puan/1000, üst sınır yok). Yalnızca mücadeleden
     sonraki koşular alır - koşu başlarken kayıt varsa zaten sonrasındayız.
     Sunucu aynı çarpanı kendi kaydından uygular; buradaki gösterim ve
     yerel defter içindir. Günlük modun kendisi çarpan almaz. */
  const runDay = useRef(resume?.runDay ?? dayKey())
  const dailyToday = useRef<number | null>(resume ? resume.dailyToday : dailyScoreOf(readRuns(), runDay.current))
  const bonus = dailyBonus(dailyToday.current)
  const tally = useRef(resume?.tally ?? emptyTally())
  // tallyEvents hamleden ÖNCEKİ taş tipini istiyor. commit'in kapanışındaki
  // `game` bir tur zincirinde bayatlıyor (runTurn arada render olmadan
  // commit'i birkaç kez çağırıyor), bu yüzden tipi commit'in kendisi taşıyor.
  const prevType = useRef<PieceType>(resume?.prevType ?? game.playerType)
  // Motor gameover'ı bir kez yayıyor (cloneState events'i sıfırlıyor) ama o
  // garanti üç dosya ötede yaşıyor - tek satırlık sigorta.
  const finished = useRef(false)
  // Kümülatif rozetler = koşu öncesi ömür boyu + bu koşunun sayaçları.
  // Ömür boyu koşu başında bir kez okunuyor; koşu bitince kendisi güncelleniyor.
  const lifeRef = useRef<Lifetime>(readLifetime())
  const awards = useRef<BadgeAward[]>([])

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

  /* Devam fişi: tur zinciri durulunca (phase=input) ve kaybedilecek bir şey
     varken yaz; bitince / çıkınca silinir (finishRun, abandon). Yenileme,
     sekme ölümü, PWA'nın öldürülmesi → açılışta «devam et» (bkz. ui/resume). */
  useEffect(() => {
    if (phase !== 'input' || game.status !== 'playing' || finished.current) return
    if (game.distance === 0 && game.score === 0) return
    saveResume({
      config,
      data: {
        kind: 'game',
        game: serializeGame(game),
        elapsedMs: performance.now() - runStart.current,
        runDay: runDay.current,
        dailyToday: dailyToday.current,
        tally: tally.current,
        prevType: prevType.current,
      },
    })
  }, [game, phase, config])

  /** Bir ipucunu yalnızca ilk kez gösterir */
  function offerTip(id: TipId) {
    if (seenTips.current.has(id)) return
    seenTips.current.add(id)
    storeSeenTips(seenTips.current)
    setTip(id)
  }

  function commit(next: GameState) {
    tally.current = tallyEvents(tally.current, next.events, prevType.current, next.distance)
    prevType.current = next.playerType


    setGame(next)
    playEvents(next.events)

    const nextFlash = describeEvents(next.events, t)
    if (nextFlash) setFlash(nextFlash)

    // Rozet: koşu ortasında kademe geçilince HEMEN altın flash (karar:
    // "oyun anında hemen ve kapanışta"). Olay flash'ından SONRA: aynı
    // commit'te "Yedin!" ile çakışırsa rozet kazanır. Değişmeyen kademeler
    // boş döner, ucuz.
    const fresh = claimBadges({
      state: next,
      tally: tally.current,
      life: lifeRef.current,
      streak: Math.max(currentStreak(readRuns()), lifetimeStreak()),
    })
    if (fresh.length > 0) {
      awards.current = [...awards.current, ...fresh]
      const award = fresh[fresh.length - 1]
      const badge = badgeOf(award.id)
      const tierName = t(`tier.${badge.tiers[Math.min(award.tier, badge.tiers.length - 1)]}`)
      setFlash({
        id: Date.now(),
        text: t('badges.earned', { name: t(badge.nameKey), tier: tierName }),
        tone: 'great',
      })
      playSound('kingBonus')
    }

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

  /**
   * Koşuyu deftere yazar, sıralamaya ve istatistiğe bildirir. Hem doğal
   * bitişte (finishRun) hem yarıda bırakmada (abandon) aynı yol -
   * ikisinin de kaydı ve sayacı aynı olmalı, yalnızca bitiş sebebi farklı.
   */
  async function recordAndReport(state: GameState, endReason: EndReason): Promise<RunRecord> {
    clearResume()
    const durationMs = performance.now() - runStart.current
    const counts = tally.current
    const cols = colsOf(state.board)
    const level = levelOf(state.distance) + 1

    const boosted = applyDailyBonus(state.score, dailyToday.current)
    const run = await recordRun({
      mode: state.mode,
      score: boosted,
      distance: state.distance,
      cols,
      level,
      daily: config.daily,
      day: runDay.current,
      rawScore: boosted !== state.score ? state.score : undefined,
      bonus: boosted !== state.score ? bonus : undefined,
      chain: state.chain,
      kings: counts.kings,
      bestStreak: counts.bestStreak,
      stuckUsed: counts.stuckUsed,
      mated: counts.mated,
    })

    // Ömür boyu sayaçlar: kümülatif rozet aileleri (defter 300 koşuyla sınırlı)
    lifeRef.current = recordLifetime(counts, { mode: state.mode, distance: state.distance, daily: config.daily })

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
      endReason,
      speed,
      kings: counts.kings,
      bestStreak: counts.bestStreak,
      stuckUsed: counts.stuckUsed,
      mated: counts.mated,
    })
    return run
  }

  /** Koşuyu imzalayıp deftere yaz, rekor kırıldıysa kutla */
  async function finishRun(state: GameState) {
    const before = readStanding(state.mode)
    const run = await recordAndReport(state, endReasonOf(state.events))

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
      badges: awards.current,
    })

    if (isBest) buzz([40, 60, 40, 60, 90])
  }

  // Ref state'i değil son commit edilen durumu görsün: abandon bir tur
  // zincirinin ortasında çağrılabilir, kapanıştaki `game` bayat olabilir
  const latest = useRef(game)
  latest.current = game

  useImperativeHandle(ref, () => ({
    score: () => latest.current.score,
    abandon: async () => {
      const state = latest.current
      // Bitmişse zaten yazıldı; hiç oynanmadıysa deftere sıfır satır düşmesin
      if (finished.current || state.status !== 'playing') return
      if (state.distance === 0 && state.score === 0) return
      finished.current = true
      turnRef.current++ // yarım kalmış tur zinciri artık state yazmasın
      await recordAndReport(state, 'abandoned')
    },
  }))

  function restart() {
    turnRef.current++
    unlockSound()
    const next = createGame(config)
    // Koşunun ikinci doğum yeri - bileşen yeniden monte olmadığı için
    // ölçüm ref'lerini burada elle sıfırlamak zorundayız
    runStart.current = performance.now()
    runDay.current = dayKey()
    dailyToday.current = dailyScoreOf(readRuns(), runDay.current)
    tally.current = emptyTally()
    prevType.current = next.playerType
    finished.current = false
    awards.current = []
    lifeRef.current = readLifetime()
    setGame(next)
    setPhase('input')
    setGhostRow(null)
    setFlash(null)
    setResult(null)
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
      // Sessiz hamle olay üretmiyor; "hangi taş olarak kaç adım" burada sayılıyor
      tally.current = tallyStep(tally.current, prevType.current)
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

  /** Paylaşım girdisi: kapanıştaki SharePanel resim + metin + bağlantıyı bundan üretir */
  const shareInput: ShareInput = {
    mode: game.mode,
    day: config.daily ?? runDay.current,
    score: applyDailyBonus(game.score, dailyToday.current),
    distance: game.distance,
    captures: (Object.values(tally.current.captured) as number[]).reduce((a, b) => a + b, 0),
    chain: game.chain,
    streak: Math.max(currentStreak(readRuns()), lifetimeStreak()),
    name: identity.name,
    lang: settings.lang,
    mated: game.events.some((event) => event.kind === 'checkmated'),
  }

  const canAct = phase === 'input' && game.status === 'playing'
  // Kaybedilecek bir şey var mı: çıkışta onay ve deftere `abandoned` kaydı buna bakar
  const runLive = game.status === 'playing' && (game.distance > 0 || game.score > 0)
  const over = game.status === 'gameover'
  // Arcade kapanış üç modda da: tahta kırmızı alarmla söner, sonra tablo açılır
  const arcadeOutro = over
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
          <b>{kingDistance == null ? '-' : kingDistance}</b> {t('hud.moves')}
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
        <ExitButton className="gv-back" active={runLive} onExit={onExit}>
          ← {t('game.menu')}
        </ExitButton>
        <span>
          <span className="gv-glyph">{game.mode === 'kingRun' ? '♚' : game.mode === 'trio' ? '♛' : '♞'}</span>{' '}
          <span className="gv-mode">{t(`mode.${game.mode}.name`)}</span>
        </span>
        {config.daily && <span>{t('game.daily')}</span>}
        {bonus > 1 && <span className="gv-bonus">{t('game.bonus', { x: bonus.toFixed(2) })}</span>}
        <span className="gv-sp" />
        <span>{t('home.rank')} -</span>
      </div>

      {/* ---- mobil üst köşeler: «←» çıkış (koşu sürüyorsa onaylı) · skor · en iyi ---- */}
      <div className="gv-cnr">
        <ExitButton className="gv-exit" active={runLive} onExit={onExit} ariaLabel={t('game.menu')}>
          ←
        </ExitButton>
        <span className="gv-cell">
          <span className="gv-lb">{t('hud.score')}{bonus > 1 ? ` · ×${bonus.toFixed(2)}` : ''}</span>
          <span className="gv-n xl">{game.score}</span>
        </span>
        <span className="gv-cell r">
          <span className="gv-lb">{t('home.best')}</span>
          <span className="gv-n lg">{Math.max(hiScore, game.score)}</span>
        </span>
      </div>

      {/* ---- tahta ---- */}
      <div className="gv-board" style={{ '--cols': String(colsOf(game.board)) } as CSSProperties}>
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
            score={applyDailyBonus(game.score, dailyToday.current)}
            bonus={bonus > 1 ? bonus : undefined}
            distance={game.distance}
            mated={game.events.some((event) => event.kind === 'checkmated')}
            table={result?.table ?? []}
            rank={result?.rank ?? null}
            isRecord={result?.isBest ?? false}
            isWeekRecord={result?.isWeekBest ?? false}
            chain={game.mode === 'classic' ? game.chain : undefined}
            badges={result?.badges}
            daily={config.daily}
            share={shareInput}
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

          {/* Hız yalnızca oyunda var - o yüzden pencerede yok, burada ilk */}
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

          {/* Buradan aşağısı ayarlar penceresiyle aynı sırada:
              taş rengi → koridor → ses → dil */}
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
            <span className="gv-tx">
              {t('settings.corridor')} <b>· {t('corridor.cols', { n: settings.cols })}</b>
            </span>
            <span className="gv-seg" role="radiogroup" aria-label={t('settings.corridor')}>
              {COL_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  className={(pendingCols ?? settings.cols) === n ? 'on' : ''}
                  aria-checked={(pendingCols ?? settings.cols) === n}
                  onClick={() => {
                    if (n === settings.cols) return
                    // Günlük meydan okumada genişlik sabit: sorulmaz, ayar sonrakine kalır
                    if (config.daily) setCols(n)
                    else setPendingCols(n)
                  }}
                >
                  {n}
                </button>
              ))}
            </span>
            {pendingCols != null && (
              <span className="gv-warn" role="alertdialog" aria-live="polite">
                <b>{t('corridor.restart.title')}</b>
                <span>{t('corridor.restart.body', { score: game.score, n: pendingCols })}</span>
                <span className="gv-warn-act">
                  <button type="button" onClick={() => setPendingCols(null)}>
                    {t('corridor.restart.cancel')}
                  </button>
                  <button
                    type="button"
                    className="go"
                    onClick={() => {
                      const cols = pendingCols
                      setPendingCols(null)
                      setCols(cols)
                      onRestartWithCols(cols)
                    }}
                  >
                    {t('corridor.restart.ok')}
                  </button>
                </span>
              </span>
            )}
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

        {/* Künye: sürüm · cihaz · ad (kalemle düzenlenir) - pencereyle aynı */}
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

        {/* Rozet: yalnızca seçili olan + pencereyi açan düğme */}
        <BadgeChip version={badgeVersion} onOpen={onOpenBadges} skin="gv" />

        <div className="gv-hr" />

        {/* Sıralama özeti: üç sayı; tam liste kendi penceresinde */}
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

        {/* Nasıl oynanır tek başına tam genişlik düğme; altında Hakkında +
            Öneri iki düğme yan yana - üçü aynı düğme dilinde */}
        <div className="gv-btns one">
          <button type="button" onClick={() => onOpenPage('help')}>
            {t('settings.howTo')}
          </button>
        </div>
        <div className="gv-btns">
          <button type="button" onClick={() => onOpenPage('about')}>
            {t('settings.about')}
          </button>
          <FeedbackLinks lang={settings.lang} mode={config.mode} />
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

/** Dokunmatik cihazlarda kısa titreşim - desteklenmiyorsa sessizce geçer */
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
