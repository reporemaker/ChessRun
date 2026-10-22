import { type CSSProperties, type RefObject, useLayoutEffect, useRef } from 'react'
import { ROWS } from '../engine/config'
import { type DailyState, rowIndexAt } from '../engine/daily'
import { key } from '../engine/moves'
import type { PieceType, Pos } from '../engine/types'
import { Fig } from './Fig'
import { useSettings } from '../ui/settings'
import { PIECE_SLIDE_MS } from '../ui/timing'

/** Vuran taşın yola çıkma gecikmesi ve yol süresi */
export const STRIKE_DELAY_MS = 120
export const STRIKE_MOVE_MS = 420

interface DailyBoardProps {
  state: DailyState
  moves: Pos[]
  /**
   * Kayan katman. Oyun döngüsü her karede `--t` (0..1) değişkenini bu
   * elemana yazar; React yeniden çizmez - kayma tamamen kompozitörde.
   */
  slideRef: RefObject<HTMLDivElement | null>
  /** Koşu bitti: kırmızı alarm + tarama silme (Board ile aynı CSS) */
  dying: boolean
  /**
   * Vuruş sahnesi: vuran taş `from`dan oyuncunun karesine gelir.
   * `ghost` doluysa vuran taş tahtadan çoktan silinmiştir (vezir vuruşu):
   * o tipte bir hayalet çizilir, karene kayar ve orada söner; kurban sönmez
   * (dönüşüm titreşimi devralır). `ghost` yoksa oyun sonu vuruşu: gerçek
   * taş kayar, kurban söner.
   */
  strike: { from: Pos; to: Pos; ghost?: PieceType } | null
  /**
   * Dönüşüm titreşimi (Mario mantarı): oyuncunun taşı iki figür arasında
   * yanıp söner, sonuncuda `to`da kalır. `tone` yön: büyüme ya da küçülme.
   */
  morph: { id: number; from: PieceType; to: PieceType; tone: 'up' | 'down' | 'hold' } | null
  /** Vezirken vurulma: kare kırmızı flaş, taş kalır */
  hitFlash: boolean
  onMove: (pos: Pos) => void
}

/**
 * Günün Mücadelesi tahtası.
 *
 * Dokuz satır çizilir: üstten girmek üzere olan satır + sekiz oyun satırı.
 * Katman `translateY(cell × (t − 1))` ile kayar: t=0'da giren satır tamamen
 * çerçevenin üstünde, t→1'de yerine oturur; tam o anda motor bir adım atar
 * (satır tahtaya girer, dip satır düşer) ve t sıfırlanır - görüntü hiç
 * kırılmaz. Kareler DOM'da satır kimliğiyle anahtarlı: satır aşağı
 * kaydıkça aynı düğümler taşınır, yeniden kurulmaz. Dokunma hedefi de
 * kayan düğümün kendisi olduğu için ara konumda bile doğru kareye basılır.
 */
export function DailyBoard({ state, moves, slideRef, dying, strike, morph, hitFlash, onMove }: DailyBoardProps) {
  const { pieceColor } = useSettings()
  const skinOf = (color: string) =>
    (color === state.playerColor) === (pieceColor === 'w') ? 'white' : 'black'

  const movable = new Set(moves.map(key))
  const rows = [state.incoming, ...state.board]

  // FLIP: oyuncunun taşı bir önceki karesinden yenisine kayarak gitsin.
  // offsetTop/Left transform'dan etkilenmez, kayma ile çakışmaz.
  //
  // Kayma ADIMINDA çalışmamalı: satırlar bir indeks aşağı kayınca taşın
  // offsetTop'u bir kare artıyor ama taş tahtaya göre yerinden oynamadı -
  // FLIP bunu hamle sanıp taşı bir kare daha "düşürüyordu" (18 Ağustos
  // canlı test: "taşım iki kere geri gidiyor"). Ölçüt: oyuncunun bulunduğu
  // satırın kimliği + sütunu değişmediyse hareket yok.
  const lastPlayer = useRef<{ top: number; left: number; rowId: number; col: number } | null>(null)
  useLayoutEffect(() => {
    const root = slideRef.current
    if (!root) return
    const square = root.querySelector<HTMLElement>('[data-player="1"]')
    if (!square) return
    const rowId = state.board[state.player.row].id
    const now = { top: square.offsetTop, left: square.offsetLeft, rowId, col: state.player.col }
    const before = lastPlayer.current
    lastPlayer.current = now
    if (!before) return
    if (before.rowId === now.rowId && before.col === now.col) return
    const dx = before.left - now.left
    const dy = before.top - now.top
    if (dx === 0 && dy === 0) return
    square.querySelector('.piece')?.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: PIECE_SLIDE_MS, easing: 'cubic-bezier(.22,.68,.28,1)' },
    )
  })

  // Yenilme sahnesi Web Animations API ile: CSS sınıfı olsaydı şahın nabız
  // animasyonu (`.piece.black.king`) öncelikle ezerdi ve şah yerinden
  // kımıldamazdı (18 Ağustos canlı test: "şah beni yerken animasyon yok").
  useLayoutEffect(() => {
    if (!strike) return
    const root = slideRef.current
    if (!root) return
    const playerSq = root.querySelector<HTMLElement>('[data-player="1"]')
    if (!playerSq) return
    if (strike.ghost) {
      // Hayalet: vuran taş tahtada yok; kayar, karede söner
      const ghost = root.querySelector<HTMLElement>('.piece.ghost')
      const fromSq = root.querySelector<HTMLElement>(`[data-row="${strike.from.row}"][data-col="${strike.from.col}"]`)
      if (!ghost || !fromSq) return
      const dx = playerSq.offsetLeft - fromSq.offsetLeft
      const dy = playerSq.offsetTop - fromSq.offsetTop
      ghost.animate(
        [
          { transform: 'translate(0, 0)', opacity: 1, offset: 0 },
          { transform: `translate(${dx}px, ${dy}px)`, opacity: 1, offset: 0.72 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0, offset: 1 },
        ],
        { duration: STRIKE_MOVE_MS + 220, delay: STRIKE_DELAY_MS, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' },
      )
      return
    }
    const strikerSq = root.querySelector<HTMLElement>('[data-striker="1"]')
    const striker = strikerSq?.querySelector<HTMLElement>('.piece')
    const victim = playerSq.querySelector<HTMLElement>('.piece')
    if (!strikerSq || !striker) return
    const dx = playerSq.offsetLeft - strikerSq.offsetLeft
    const dy = playerSq.offsetTop - strikerSq.offsetTop
    striker.style.zIndex = '4'
    striker.animate(
      [{ transform: 'translate(0, 0)' }, { transform: `translate(${dx}px, ${dy}px)` }],
      { duration: STRIKE_MOVE_MS, delay: STRIKE_DELAY_MS, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' },
    )
    victim?.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.4)' },
      ],
      { duration: 200, delay: STRIKE_DELAY_MS + STRIKE_MOVE_MS - 60, easing: 'ease-in', fill: 'forwards' },
    )
  }, [strike, slideRef])

  const captured = state.events.some((e) => e.kind === 'capture')

  return (
    <div
      className={`board-frame daily ${dying ? 'dying' : ''}`}
      style={{ '--cols': String(state.board[0].cells.length) } as CSSProperties}
    >
      <div className="board daily-slide" ref={slideRef}>
        {rows.map((row, i) => {
          // i=0 giren satır (tahta dışı), i-1 tahtadaki satır
          const r = i - 1
          const index = r < 0 ? state.spawned - 1 : rowIndexAt(state, r)
          const onBoard = r >= 0
          return (
            <div className={`board-row ${onBoard ? '' : 'incoming'}`} key={row.id}>
              {row.cells.map((cell, c) => {
                const pos = { row: r, col: c }
                const canMove = onBoard && movable.has(key(pos))
                const isPlayer = onBoard && state.player.row === r && state.player.col === c
                const isStriker = onBoard && strike != null && !strike.ghost && strike.from.row === r && strike.from.col === c
                return (
                  <button
                    type="button"
                    key={c}
                    data-player={isPlayer ? '1' : undefined}
                    data-striker={isStriker ? '1' : undefined}
                    data-row={onBoard ? r : undefined}
                    data-col={c}
                    className={[
                      'square',
                      (index + c) % 2 === 0 ? 'light' : 'dark',
                      canMove ? 'movable' : '',
                      isPlayer ? 'player-square' : '',
                      isPlayer && ((strike && !strike.ghost) || hitFlash) ? 'hit' : '',
                      r === ROWS - 1 ? 'edge' : '',
                    ].join(' ')}
                    disabled={!canMove}
                    aria-label={onBoard ? `${r + 1}. satır ${c + 1}. sütun` : undefined}
                    tabIndex={onBoard ? undefined : -1}
                    onClick={() => onMove(pos)}
                    style={{ '--i': String(Math.max(0, r)), '--c': String(c) } as CSSProperties}
                  >
                    {cell && (
                      <span
                        className={[
                          'piece',
                          skinOf(cell.color),
                          isPlayer ? 'player' : '',
                          isPlayer && captured ? 'captured' : '',
                          isPlayer && state.playerType === 'q' ? 'mushroom' : '',
                          isPlayer && morph ? `morph ${morph.tone}` : '',
                          cell.type === 'k' ? 'king' : '',
                        ].join(' ')}
                      >
                        {isPlayer && morph ? (
                          <span key={morph.id} className="morph-pair" aria-hidden>
                            <span className="g old"><Fig type={morph.from} color={skinOf(cell.color)} /></span>
                            <span className="g new"><Fig type={morph.to} color={skinOf(cell.color)} /></span>
                          </span>
                        ) : (
                          <Fig type={cell.type} color={skinOf(cell.color)} />
                        )}
                      </span>
                    )}
                    {canMove && !cell && <span className="dot" />}
                    {onBoard && strike?.ghost && strike.from.row === r && strike.from.col === c && (
                      <span key={`ghost-${state.spawned}`} className={`piece ghost ${skinOf(state.enemyColor)}`} aria-hidden>
                        <Fig type={strike.ghost} color={skinOf(state.enemyColor)} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="board-fade top" aria-hidden />
      <div className="board-fade bottom" aria-hidden />
      <div className="board-sweep" aria-hidden />
    </div>
  )
}
