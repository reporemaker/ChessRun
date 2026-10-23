import { useEffect, useMemo, useRef, useState } from 'react'
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
import { readMhBest, recordMhScore } from '../ui/mhScores'
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

interface Props {
  onExit: () => void
  onOpenSettings: () => void
  onOpenPage: (page: PageId) => void
  onOpenRanking: () => void
  onOpenBadges: () => void
  badgeVersion: number
}

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
 */
export function MaharajahGame({ onExit, onOpenSettings, onOpenPage, onOpenRanking, onOpenBadges, badgeVersion }: Props) {
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
  const [mode, setMode] = useState<MhMode | null>(null)
  const [game, setGame] = useState<MhState | null>(null)
  const [selected, setSelected] = useState<MhPos | null>(null)
  /** Bitmiş oyunun kaydı - puan yazılırken bir kez hesaplanır */
  const [record, setRecord] = useState<{ isRecord: boolean; best: number; earned: number; bonus: number } | null>(null)
  /* Günlük çarpan oyun BAŞINDA sabitlenir (Game.tsx ile aynı kural): bugün
     günün mücadelesi oynandıysa onun puanı → ×(1 + puan/1000). Sunucu aynı
     çarpanı kendi kaydından uygular; buradaki gösterim ve yerel defter için. */
  const runDay = useRef(dayKey())
  const dailyToday = useRef<number | null>(null)
  /** Aynı oyun iki kez yazılmasın (StrictMode efekti iki kez çalıştırır) */
  const recorded = useRef<MhState | null>(null)

  const side = mode ? playerSide(mode) : null
  const myTurn = Boolean(game && !game.result && game.toMove === side)

  function start(next: MhMode) {
    runDay.current = dayKey()
    dailyToday.current = dailyScoreOf(readRuns(), runDay.current)
    setMode(next)
    setGame(newMaharajah(next))
    setSelected(null)
    setRecord(null)
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

  // Oyun bitti: puan bir kez yazılır (defter + lig), rekorsa kapanış söyler
  const score = game ? mhScore(game) : null
  useEffect(() => {
    if (!mode || !game || !score || recorded.current === game) return
    recorded.current = game
    const isRecord = score.total > 0 && recordMhScore(mode, score.total)
    const earned = applyDailyBonus(score.total, dailyToday.current)
    setRecord({ isRecord, best: readMhBest()[mode], earned, bonus: dailyBonus(dailyToday.current) })
    // Hiç hamle yapılmadan biten oyun yok; yine de boş koşu lige gitmesin
    if (game.plies === 0) return
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
  const risky = useMemo(() => (game && active ? riskOf(game, targets) : new Set<number>()), [game, active, targets])

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
        <ExitButton active={Boolean(game && !game.result && game.plies > 0)} onExit={onExit} className="mh-back">
          ← {t('game.menu')}
        </ExitButton>
        <span className="mh-ttl">
          <Fig type="eagle" /> {t('mode.maharajah.name')}
          {mode && <em> · {t(mode === 'falcon' ? 'mh.falcon.name' : 'mh.hunter.name')}</em>}
        </span>
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
            <div className="board" role="grid">
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
              onRestart={() => start(mode)}
              onSwitch={() => start(mode === 'falcon' ? 'hunter' : 'falcon')}
              onExit={onExit}
            />
          )}
          </div>

          {/* Bitince düğmeler kapanış perdesinde; burada ikinci kez çizilmiyor */}
          <div className={`mh-side ${game.result ? 'done' : ''}`}>
            <p className="mh-meta">
              {t('mh.moves', { n: game.plies })} · {t('mh.captured', { n: game.captured })}
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
