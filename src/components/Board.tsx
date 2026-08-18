import { type CSSProperties, useLayoutEffect, useRef } from 'react'
import { ROWS } from '../engine/config'
import { colsOf } from '../engine/game'
import { key } from '../engine/moves'
import type { GameState, Pos, Row } from '../engine/types'
import { GLYPH } from '../ui/pieces'
import { useSettings } from '../ui/settings'
import {
  BOARD_IN_MS,
  BOARD_OUT_MS,
  BOARD_SCROLL_MS,
  PIECE_SLIDE_MS,
  STUCK_IN_MS,
  STUCK_IN_STAGGER_MS,
  STUCK_OUT_MS,
  STUCK_OUT_STAGGER_MS,
  TILE_STAGGER_MS,
  type Phase,
} from '../ui/timing'

interface BoardProps {
  state: GameState
  moves: Pos[]
  /** Şah çekiliyse rakip şahın karesi */
  checkedKing: Pos | null
  /** Kayma animasyonu sırasında alttan çıkan satırın hayaleti */
  ghostRow: Row | null
  phase: Phase
  /** Hız çarpanı: tüm animasyon süreleri bununla ölçeklenir */
  speed: number
  /** Her artışta tahta bir kez sarsılır - can kaybında */
  shakeTick: number
  /** Koşu bitti: tahta CRT gibi çöküp sönüyor (Şah Kaçışı kapanışı) */
  dying?: boolean
  onMove: (pos: Pos) => void
}

interface Offset {
  top: number
  left: number
}

export function Board({
  state,
  moves,
  checkedKing,
  ghostRow,
  phase,
  speed,
  shakeTick,
  dying = false,
  onMove,
}: BoardProps) {
  // Taş rengi görsel bir deri: motorun rengi sabit kalıyor, oyuncunun
  // taşları seçilen renge, rakibinkiler karşıt renge boyanıyor.
  const { pieceColor } = useSettings()
  const skinOf = (color: string) =>
    (color === state.playerColor) === (pieceColor === 'w') ? 'white' : 'black'

  const boardRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const offsets = useRef(new Map<number, Offset>())
  const cols = colsOf(state.board)

  // FLIP: her taşın bir önceki karesini hatırlayıp yeni karesine kaydırarak
  // götürüyoruz. Ölçüm offsetTop/offsetLeft ile - bunlar transform'dan
  // etkilenmediği için kayma animasyonuyla çakışmıyor.
  useLayoutEffect(() => {
    const root = boardRef.current
    if (!root) return

    const animate = phase === 'playerMove' || phase === 'enemyMove'
    const next = new Map<number, Offset>()

    root.querySelectorAll<HTMLElement>('[data-piece-id]').forEach((square) => {
      const id = Number(square.dataset.pieceId)
      const now: Offset = { top: square.offsetTop, left: square.offsetLeft }
      const before = offsets.current.get(id)
      next.set(id, now)

      if (!animate || !before) return
      const dx = before.left - now.left
      const dy = before.top - now.top
      if (dx === 0 && dy === 0) return

      square.querySelector('.piece')?.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: PIECE_SLIDE_MS * speed, easing: 'cubic-bezier(.22,.68,.28,1)' },
      )
    })

    offsets.current = next
  })

  // Tahta kaydığında: bir satır yukarıdan başlat, sıfıra doğru animasyonla indir.
  // Hayalet satır sayesinde alttan çıkan satır gerçekten dışarı kayıyormuş gibi görünür.
  useLayoutEffect(() => {
    const el = boardRef.current
    if (!el || state.scrollTick === 0) return

    el.style.transition = 'none'
    el.style.transform = 'translateY(calc(var(--cell) * -1))'
    void el.offsetHeight // reflow'u zorla, yoksa tarayıcı iki stili birleştirir
    el.style.transition = `transform ${BOARD_SCROLL_MS * speed}ms cubic-bezier(.3,.7,.3,1)`
    el.style.transform = 'translateY(0)'
    // speed kasten bağımlılık değil: hız değişimi kaymayı yeniden tetiklemesin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scrollTick])

  // Can kaybında tahta sarsılır - vuruşun bedensel karşılığı
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el || shakeTick === 0) return

    el.classList.remove('shake')
    void el.offsetHeight
    el.classList.add('shake')
    const timer = setTimeout(() => el.classList.remove('shake'), 400)
    return () => clearTimeout(timer)
  }, [shakeTick])

  const movable = new Set(moves.map(key))
  const justCaptured =
    phase === 'playerMove' &&
    state.events.some((e) => e.kind === 'capture' || e.kind === 'kingBonus')

  // Şah yendiğinde tahta dökülür; sıkışınca taşlar karıştırılır
  const boardPhase =
    phase === 'boardOut'
      ? 'out'
      : phase === 'boardIn'
        ? 'in'
        : phase === 'stuckOut'
          ? 'stuck-out'
          : phase === 'stuckIn'
            ? 'stuck-in'
            : ''

  return (
    <div
      className={`board-frame ${dying ? 'dying' : ''}`}
      ref={frameRef}
      // Süreler tek kaynaktan (ui/timing.ts) geliyor: CSS ile motor
      // arasındaki gecikme farkı animasyonu yarıda kesmesin
      style={
        {
          '--cols': String(cols),
          '--stagger': `${TILE_STAGGER_MS * speed}ms`,
          '--out-ms': `${BOARD_OUT_MS * speed}ms`,
          '--in-ms': `${BOARD_IN_MS * speed}ms`,
          '--stuck-out-ms': `${STUCK_OUT_MS * speed}ms`,
          '--stuck-in-ms': `${STUCK_IN_MS * speed}ms`,
          '--stuck-out-step': `${STUCK_OUT_STAGGER_MS * speed}ms`,
          '--stuck-in-step': `${STUCK_IN_STAGGER_MS * speed}ms`,
        } as CSSProperties
      }
    >
      <div className={`board ${boardPhase}`} ref={boardRef}>
        {state.board.map((row, r) => (
          <div className="board-row" key={row.id}>
            {row.cells.map((cell, c) => {
              const pos = { row: r, col: c }
              const id = key(pos)
              const squadIndex = state.squad.findIndex(
                (mate) => mate.row === r && mate.col === c,
              )
              const isSquad = squadIndex >= 0
              const isActive = state.player.row === r && state.player.col === c
              // Üçlü: kendi taşına dokunmak seçim, hamle değil
              const selectable = phase === 'input' && isSquad && !isActive
              const canMove = phase === 'input' && movable.has(id)
              const isCheckedKing =
                checkedKing != null && checkedKing.row === r && checkedKing.col === c

              return (
                <button
                  type="button"
                  key={c}
                  data-piece-id={cell?.id}
                  className={[
                    'square',
                    // Kare rengini distance ile kaydır ki desen tahtaya yapışık kalsın
                    (state.distance + r + c) % 2 === 0 ? 'light' : 'dark',
                    canMove ? 'movable' : '',
                    selectable ? 'selectable' : '',
                    isActive ? 'player-square' : '',
                    isSquad && !isActive ? 'mate-square' : '',
                    isCheckedKing ? 'checked-king' : '',
                    r === ROWS - 1 ? 'edge' : '',
                  ].join(' ')}
                  disabled={!canMove && !selectable}
                  aria-label={`${r + 1}. satır ${c + 1}. sütun`}
                  onClick={() => onMove(pos)}
                  // --i: yanıp sönme sırası (satır), --c: karıştırma sırası (sütun)
                  style={{ '--i': String(r), '--c': String(c) } as CSSProperties}
                >
                  {cell && (
                    <span
                      className={[
                        'piece',
                        skinOf(cell.color),
                        isSquad ? 'player' : '',
                        isActive && justCaptured ? 'captured' : '',
                        cell.type === 'k' ? 'king' : '',
                      ].join(' ')}
                    >
                      {GLYPH[cell.type]}
                    </span>
                  )}
                  {/* Nötr hamle işareti - satranç uygulamalarındaki gibi, renk kodu yok */}
                  {canMove && !cell && <span className="dot" />}
                </button>
              )
            })}
          </div>
        ))}

        {ghostRow && (
          <div className="board-row ghost" key={ghostRow.id} aria-hidden>
            {ghostRow.cells.map((cell, c) => (
              <div
                key={c}
                className={`square ${(state.distance + ROWS + c) % 2 === 0 ? 'light' : 'dark'}`}
              >
                {cell && (
                  <span className={`piece ${skinOf(cell.color)}`}>{GLYPH[cell.type]}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="board-fade top" aria-hidden />
      <div className="board-fade bottom" aria-hidden />
      {/* Ölüm anındaki alarm taraması - yalnızca .dying'de görünür */}
      <div className="board-sweep" aria-hidden />
    </div>
  )
}
