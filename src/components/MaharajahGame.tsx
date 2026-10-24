import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyDailyBonus, dailyBonus } from '@shared/leaderboard'
import {
  type MhGrid,
  type MhMode,
  type MhMove,
  type MhPiece,
  type MhPos,
  type MhState,
  amazonAttacks,
  applyMove,
  armyAttacks,
  armyMaterial,
  MH_ARMY_VALUE,
  botMove,
  isCheck,
  kingPos,
  legalMoves,
  mhScore,
  newMaharajah,
  playerSide,
} from '../engine/maharajah'
import type { StringKey } from '../ui/i18n'
import { getIdentity } from '../ui/identity'
import { RANKS_EVENT, submitRun } from '../ui/leaderboard'
import { type BadgeAward, claimMhBadges } from '../ui/badges'
import { readMhBest, readMhGuide, recordMhResult, recordMhScore, writeMhGuide } from '../ui/mhScores'
import { type MhTicket, clearMhResume, saveMhResume } from '../ui/mhResume'
import { trackRun } from '../ui/stats'
import { dailyScoreOf, dayKey, readRuns, recordRun } from '../ui/scores'
import { useSettings } from '../ui/settings'
import { playSound } from '../ui/sound'
import { useT } from '../ui/text'
import { useRanking } from '../ui/useRanking'
import { ExitButton } from './ExitButton'
import { Fig } from './Fig'
import { GearIcon } from './GearIcon'
import { MaharajahOutro } from './MaharajahOutro'
import type { PageId } from './Pages'
import { SidePanel } from './SidePanel'

/** Bot düşünme payı: hamle anında gelmesin, oyuncu kendi hamlesini görsün */
const BOT_DELAY_MS = 450
/** Taşın kareden kareye kayma süresi. Kayan tahtadan (150) biraz uzun: bu bir
    runner değil, hamle okunsun; vezir gibi tahta boyu giden mihrace de yetişsin. */
export const MH_SLIDE_MS = 220

/** Hareket azaltma tercihi: taş kaymaz, yerine gelir (MiniBoard ile aynı ölçüt) */
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

interface Props {
  onExit: () => void
  onOpenSettings: () => void
  onOpenPage: (page: PageId) => void
  onOpenRanking: () => void
  onOpenBadges: () => void
  badgeVersion: number
  /** Devam fişi (ui/mhResume): kabul edildiyse oyun bu durumdan sürer */
  resume?: MhTicket
}

/** İstatistikte bitiş sebebi: Mihrace'nin sonucu kayan tahtanınkine uymuyor */
const END_OF = { win: 'won', loss: 'lost', draw: 'drawn' } as const

const RESULT_KEY: Record<string, StringKey> = {
  'win:mate': 'mh.win.mate',
  'win:captured': 'mh.win.captured',
  'loss:mate': 'mh.loss.mate',
  'loss:captured': 'mh.loss.captured',
  'draw:stalemate': 'mh.draw.stalemate',
  'draw:fifty': 'mh.draw.fifty',
  'draw:repetition': 'mh.draw.repetition',
}

/**
 * Mihrace: önce rol seçimi (Şahin / Avcı), sonra klasik 8×8 tahta.
 * Kurallar ve botlar engine/maharajah.ts'te. Serbest oyun: günlük hak yok,
 * istendiği kadar oynanır. Bitince puan (mhScore) ve kapanış perdesi. Oyun
 * öteki oyunlar gibi koşu defterine yazılır ve haftalık lige gider (mod
 * `maharajah`, mesafe = oyuncunun hamle sayısı); günlük çarpan da uygulanır.
 * Rol başına en iyi puan ayrıca cihazda (ui/mhScores).
 *
 * Kılavuz anahtarı (rol seçiminde): açıkken hamle hedeflerinden rakibin tehdit
 * ettiği kareler kırmızı nokta alır; kapalıyken oyuncu tehlikeyi kendi bulur ve
 * puan ×2 (engine mhScore). Tercih cihazda kalır, oyun başında duruma yazılır
 * ve oyun sürerken değişmez.
 */
export function MaharajahGame({ onExit, onOpenSettings, onOpenPage, onOpenRanking, onOpenBadges, badgeVersion, resume }: Props) {
  const t = useT()
  const { pieceColor } = useSettings()
  const [identity, setIdentity] = useState(() => getIdentity())
  // Koşu sunucuya işlenince (RANKS_EVENT) sıralama kutusu tazelensin - Game.tsx ile aynı
  const [rankTick, setRankTick] = useState(0)
  useEffect(() => {
    const onRanks = () => setRankTick((n) => n + 1)
    window.addEventListener(RANKS_EVENT, onRanks)
    return () => window.removeEventListener(RANKS_EVENT, onRanks)
  }, [])
  const { view: ranking, status: rankStatus } = useRanking(rankTick)
  const [mode, setMode] = useState<MhMode | null>(resume?.game.mode ?? null)
  const [guide, setGuide] = useState(() => readMhGuide())
  const [game, setGame] = useState<MhState | null>(resume?.game ?? null)
  const [selected, setSelected] = useState<MhPos | null>(null)
  /** Bitmiş oyunun kaydı - puan yazılırken bir kez hesaplanır */
  const [record, setRecord] = useState<{ isRecord: boolean; best: number; earned: number; bonus: number; badges: BadgeAward[] } | null>(null)
  /* Günlük çarpan oyun BAŞINDA sabitlenir (Game.tsx ile aynı kural): bugün
     günün mücadelesi oynandıysa onun puanı → ×(1 + puan/1000). Sunucu aynı
     çarpanı kendi kaydından uygular; buradaki gösterim ve yerel defter için. */
  const runDay = useRef(resume?.runDay ?? dayKey())
  const dailyToday = useRef<number | null>(resume?.dailyToday ?? null)
  /** Oyun süresi (istatistik): fişten devamda önceki süre üstüne */
  const startedAt = useRef(performance.now() - (resume?.elapsedMs ?? 0))
  /** Aynı oyun iki kez yazılmasın (StrictMode efekti iki kez çalıştırır) */
  const recorded = useRef<MhState | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  /** FLIP: taş kimliği → son çizimdeki karesinin yeri (Board.tsx ile aynı yöntem) */
  const offsets = useRef(new Map<number, { top: number; left: number }>())

  /* Taşlar kareden kareye KAYAR: her çizimden sonra her taşın yeni yerini
     ölçüp bir öncekinden buraya kaydırıyoruz (rokta kale de kendi
     kimliğiyle kayar; yenen taş hedefte kaybolur, yiyen üstüne gelir).
     Yalnızca `transform` - taşlarda filter yok, bkz. App.css .piece notu. */
  useLayoutEffect(() => {
    const root = boardRef.current
    if (!root) return
    const next = new Map<number, { top: number; left: number }>()
    const still = reducedMotion()
    root.querySelectorAll<HTMLElement>('[data-piece-id]').forEach((square) => {
      const id = Number(square.dataset.pieceId)
      const now = { top: square.offsetTop, left: square.offsetLeft }
      const before = offsets.current.get(id)
      next.set(id, now)
      if (!before || still) return
      const dx = before.left - now.left
      const dy = before.top - now.top
      if (dx === 0 && dy === 0) return
      const piece = square.querySelector<HTMLElement>('.piece')
      if (!piece) return
      square.classList.add('mh-moving')
      const anim = piece.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: MH_SLIDE_MS, easing: 'cubic-bezier(.22,.68,.28,1)' },
      )
      anim.onfinish = () => square.classList.remove('mh-moving')
    })
    offsets.current = next
  })

  const side = mode ? playerSide(mode) : null
  const myTurn = Boolean(game && !game.result && game.toMove === side)

  function start(next: MhMode) {
    clearMhResume()
    startedAt.current = performance.now()
    runDay.current = dayKey()
    dailyToday.current = dailyScoreOf(readRuns(), runDay.current)
    offsets.current = new Map() // yeni dizilim: eski yerlerden kayma yok
    setMode(next)
    setGame(newMaharajah(next, guide))
    setSelected(null)
    setRecord(null)
  }

  function toggleGuide() {
    const next = !guide
    setGuide(next)
    writeMhGuide(next)
  }

  function play(move: MhMove) {
    if (!game) return
    const victim = game.board[move.r][move.c]
    const next = applyMove(game, move)
    setGame(next)
    setSelected(null)
    if (next.result) playSound(next.result.outcome === 'win' ? 'mate' : 'gameover')
    else if (isCheck(next)) playSound('check')
    else playSound(victim ? 'capture' : 'move')
  }

  // Bot sırası: kısa bir bekleme, sonra hamle
  useEffect(() => {
    if (!game || game.result || game.toMove === side) return
    const timer = window.setTimeout(() => {
      const move = botMove(game)
      if (move) play(move)
    }, BOT_DELAY_MS)
    return () => window.clearTimeout(timer)
    // play her çizimde yeni; tetikleyen yalnızca oyun durumu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, side])

  /* Devam fişi: oyun sürerken her hamlede yazılır, bitince silinir (kayan
     tahta oyunlarıyla aynı - yenileme ya da kapanan uygulama oyunu silmesin) */
  useEffect(() => {
    if (!game) return
    if (game.result) clearMhResume()
    else if (game.plies > 0)
      saveMhResume({ game, runDay: runDay.current, dailyToday: dailyToday.current, elapsedMs: performance.now() - startedAt.current })
  }, [game])

  /** Çıkış: süren oyun istatistikte «yarıda bırakıldı» sayılır, fiş silinir */
  function exit() {
    if (game && !game.result && game.plies > 0) report(game, 'abandoned', 0)
    clearMhResume()
    onExit()
  }

  function report(g: MhState, endReason: 'won' | 'lost' | 'drawn' | 'abandoned', score: number) {
    trackRun({
      mode: 'maharajah',
      daily: false,
      score,
      distance: g.plies,
      cols: 8,
      level: 1,
      durationMs: performance.now() - startedAt.current,
      endReason,
      speed: 'normal',
      kings: 0,
      bestStreak: 0,
      stuckUsed: 0,
      mated: g.result?.reason === 'mate' && g.result.outcome === 'win',
    })
  }

  // Oyun bitti: puan bir kez yazılır (defter + lig), rekorsa kapanış söyler
  const score = game ? mhScore(game) : null
  useEffect(() => {
    if (!mode || !game || !score || recorded.current === game) return
    recorded.current = game
    const isRecord = score.total > 0 && recordMhScore(mode, score.total)
    const earned = applyDailyBonus(score.total, dailyToday.current)
    // Rozet sayaçları ve yeni kazanılan Mihrace rozetleri (bitiş ekranında listelenir)
    const badges = claimMhBadges(recordMhResult(game))
    setRecord({ isRecord, best: readMhBest()[mode], earned, bonus: dailyBonus(dailyToday.current), badges })
    // Hiç hamle yapılmadan biten oyun yok; yine de boş koşu lige gitmesin
    if (game.plies === 0) return
    if (game.result) report(game, END_OF[game.result.outcome], earned)
    void recordRun({
      mode: 'maharajah',
      score: earned,
      distance: game.plies,
      cols: 8,
      level: 1,
      day: runDay.current,
      rawScore: earned !== score.total ? score.total : undefined,
      bonus: earned !== score.total ? dailyBonus(dailyToday.current) : undefined,
      mated: game.result?.reason === 'mate' && game.result.outcome === 'win',
    }).then((run) => submitRun(run))
  }, [mode, game, score])

  // Şahin'de oyuncunun tek taşı var: sırası gelince kendiliğinden seçili
  const active: MhPos | null = myTurn && game ? (mode === 'falcon' ? game.amazon : selected) : null
  const targets = useMemo(() => (game && active ? legalMoves(game, active) : []), [game, active])
  const guideOn = game?.guide !== false
  const risky = useMemo(() => (game && active && guideOn ? riskOf(game, targets) : new Set<number>()), [game, active, targets, guideOn])

  function onSquare(r: number, c: number) {
    if (!game || !myTurn) return
    const target = targets.find((m) => m.r === r && m.c === c)
    if (target) {
      play(target)
      return
    }
    if (mode === 'hunter') {
      const piece = game.board[r][c]
      const own = piece && piece.t !== 'A'
      setSelected(own && !(selected?.r === r && selected?.c === c) ? { r, c } : null)
    }
  }

  const checkedKing = game && isCheck(game) ? kingPos(game.board) : null
  // Oyuncunun taşları ayarlardaki renkte, rakibinki öteki renkte (Board.tsx ile aynı kural)
  const colorOf = (piece: MhPiece) =>
    ((piece.t === 'A') === (mode === 'falcon')) === (pieceColor === 'w') ? 'white' : 'black'

  const status = !game
    ? ''
    : game.result
      ? t(RESULT_KEY[`${game.result.outcome}:${game.result.reason}`])
      : myTurn
        ? checkedKing && mode === 'hunter'
          ? `${t('mh.check')} ${t('mh.you')}`
          : t('mh.you')
        : t('mh.bot')

  return (
    <div className={`mh ${game ? 'playing' : ''}`}>
      <header className="mh-hd">
        <ExitButton active={Boolean(game && !game.result && game.plies > 0)} onExit={exit} className="mh-back">
          ← {t('game.menu')}
        </ExitButton>
        <span className="mh-ttl">
          <Fig type="eagle" /> {t('mode.maharajah.name')}
          {mode && <em> · {t(mode === 'falcon' ? 'mh.falcon.name' : 'mh.hunter.name')}</em>}
        </span>
        {/* Kılavuzsuz oyunun işareti başlığın DIŞINDA: dar ekranda başlık kısalsa da ×2 görünür kalır */}
        {game && !guideOn && <span className="mh-x2" aria-label={t('mh.guide.short.off')}>×2</span>}
        <button type="button" className="gv-gearbtn mh-gear" onClick={onOpenSettings} aria-label={t('settings.title')}>
          <GearIcon />
        </button>
      </header>

      {!mode || !game ? (
        <div className="mh-pick">
          <h2>{t('mh.pick')}</h2>
          {(['falcon', 'hunter'] as const).map((m) => (
            <button key={m} type="button" className="mh-role" onClick={() => start(m)}>
              <span className="mh-role-g">
                {m === 'falcon' ? <Fig type="eagle" /> : <Fig type="k" />}
              </span>
              <span className="mh-role-t">
                <b>{t(m === 'falcon' ? 'mh.falcon.name' : 'mh.hunter.name')}</b>
                <small>{t(m === 'falcon' ? 'mh.falcon.line' : 'mh.hunter.line')}</small>
              </span>
            </button>
          ))}
          <div className="mh-guide">
            <span className="mh-guide-t">
              <b>{t('mh.guide')}</b>
              <small>{t(guide ? 'mh.guide.on' : 'mh.guide.off')}</small>
            </span>
            <button
              type="button"
              className={`pop-tg ${guide ? 'on' : ''}`}
              role="switch"
              aria-checked={guide}
              aria-label={t('mh.guide')}
              onClick={toggleGuide}
            >
              <i />
            </button>
          </div>
          <p className="mh-rules">{t('mh.rules')}</p>
          <button type="button" className="mh-link" onClick={() => onOpenPage('help')}>
            {t('settings.howTo')}
          </button>
        </div>
      ) : (
        <>
          <p className={`mh-status ${game.result ? `end ${game.result.outcome}` : ''}`} aria-live="polite">
            {status}
          </p>

          {/* Tahta alanı öteki oyunlarla aynı ölçüde: .gv-board kuralları */}
          <div className="mh-board">
          <div className="board-frame">
            <div className="board" role="grid" ref={boardRef}>
              {game.board.map((row, r) => (
                <div className="board-row" key={r} role="row">
                  {row.map((piece, c) => {
                    const target = targets.some((m) => m.r === r && m.c === c)
                    const last = game.lastMove && ((game.lastMove.fr === r && game.lastMove.fc === c) || (game.lastMove.r === r && game.lastMove.c === c))
                    const classes = [
                      'square',
                      (r + c) % 2 === 0 ? 'light' : 'dark',
                      target ? 'movable' : '',
                      active && active.r === r && active.c === c ? 'player-square' : '',
                      checkedKing && checkedKing.r === r && checkedKing.c === c ? 'checked-king' : '',
                      last ? 'mh-last' : '',
                    ]
                    return (
                      <button
                        key={c}
                        type="button"
                        role="gridcell"
                        data-piece-id={piece?.id}
                        className={classes.join(' ')}
                        disabled={!myTurn}
                        onClick={() => onSquare(r, c)}
                      >
                        {piece && (
                          <span className={`piece ${colorOf(piece)} ${piece.t === 'k' ? 'king' : ''}`}>
                            <Fig type={piece.t === 'A' ? 'eagle' : piece.t} color={colorOf(piece)} />
                          </span>
                        )}
                        {target && <span className={`dot ${risky.has(r * 8 + c) ? 'mh-risk' : ''} ${piece ? 'mh-cap' : ''}`} />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {game.result && score && record && (
            <MaharajahOutro
              key={`${mode}-${game.plies}`}
              mode={mode}
              result={game.result}
              score={score}
              best={record.best}
              earned={record.earned}
              bonus={record.bonus}
              isRecord={record.isRecord}
              badges={record.badges}
              onRestart={() => start(mode)}
              onSwitch={() => start(mode === 'falcon' ? 'hunter' : 'falcon')}
              onExit={onExit}
            />
          )}
          </div>

          {/* Bitince düğmeler kapanış perdesinde; burada ikinci kez çizilmiyor */}
          <div className={`mh-side ${game.result ? 'done' : ''}`}>
            <p className="mh-meta">
              {t('mh.moves', { n: game.plies })} · {t('mh.captured', { n: game.captured })} · {t(guideOn ? 'mh.guide.short.on' : 'mh.guide.short.off')}
            </p>
            <div className="mh-act">
              <button type="button" className={game.result ? 'go' : ''} onClick={() => start(mode)}>
                {t('mh.again')}
              </button>
              <button type="button" onClick={() => start(mode === 'falcon' ? 'hunter' : 'falcon')}>
                {t('mh.switch')}
              </button>
            </div>
          </div>
          <p className="mh-rules mh-foot">{t('mh.rules')}</p>

          {/* Masaüstü sağ sütun: öteki oyunlarla aynı iskelet (.gv-side) -
              üstte bu oyunun göstergeleri, altında ortak ayarlar paneli.
              Mobilde yok; ayarlar üst çubuktaki dişliden açılıyor. */}
          <aside className="gv-side">
            <div className="gv-head">
              <span className="gv-cell">
                <span className="gv-lb">{t('mh.hud.moves')}</span>
                <span className="gv-n xl">{game.plies}</span>
              </span>
              <span className="gv-sp" />
              <span className="gv-cell" style={{ textAlign: 'right' }}>
                <span className="gv-lb">{t('home.best')}</span>
                <span className="gv-n lg">{readMhBest()[mode] || '-'}</span>
              </span>
            </div>

            <div className="gv-stats">
              <span className="gv-cell">
                <span className="gv-lb">{t('mh.hud.captured')}</span>
                <span className="gv-n md">{game.captured}</span>
              </span>
              <span className="gv-cell">
                <span className="gv-lb">{t('mh.guide')}</span>
                <span className="gv-n md">{guideOn ? t('mh.guide.cell.on') : '×2'}</span>
              </span>
              <span className="gv-cell">
                <span className="gv-lb">{t('mh.outro.material')}</span>
                <span className="gv-n md">
                  {mode === 'falcon' ? MH_ARMY_VALUE - armyMaterial(game.board) : armyMaterial(game.board)}
                </span>
              </span>
            </div>

            <p className={`gv-tx mh-state ${game.result ? `end ${game.result.outcome}` : ''}`} aria-live="polite">
              {status}
            </p>

            <div className="gv-btns">
              <button type="button" onClick={() => start(mode)}>
                {t('mh.again')}
              </button>
              <button type="button" onClick={() => start(mode === 'falcon' ? 'hunter' : 'falcon')}>
                {t('mh.switch')}
              </button>
            </div>

            <SidePanel
              identity={identity}
              onIdentityChange={setIdentity}
              ranking={ranking}
              rankStatus={rankStatus}
              badgeVersion={badgeVersion}
              onOpenBadges={onOpenBadges}
              onOpenRanking={onOpenRanking}
              onOpenHelp={() => onOpenPage('help')}
            />
          </aside>
        </>
      )}
    </div>
  )
}

/** Hamle sonrası rakibin tehdit ettiği hedef kareler (kırmızı nokta) */
function riskOf(game: MhState, targets: MhMove[]): Set<number> {
  const out = new Set<number>()
  for (const m of targets) {
    if (game.board[m.r][m.c]?.t === 'A') continue
    const board: MhGrid = game.board.map((row) => row.slice())
    const mover = board[m.fr][m.fc]
    board[m.r][m.c] = mover
    board[m.fr][m.fc] = null
    const threatened =
      mover?.t === 'A'
        ? armyAttacks(board, game.armyTop).has(m.r * 8 + m.c)
        : game.amazon != null && amazonAttacks(board, game.amazon).has(m.r * 8 + m.c)
    if (threatened) out.add(m.r * 8 + m.c)
  }
  return out
}
