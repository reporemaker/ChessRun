import { useLayoutEffect, useRef } from 'react'
import { type Demo, type Frame, type Mark, parseCell } from '../ui/demos'
import { FIGURE_OF, figureSrc } from '../ui/figures'
import { Fig } from './Fig'

interface Props {
  demo: Demo
  /** Gösterilen kare - zamanlama üstteki LessonStage'de */
  idx: number
}

/* Oyundaki hareketin aynısı, öğretim için biraz daha yavaş
   (Board.tsx: PIECE_SLIDE_MS 150 / BOARD_SCROLL_MS 190, aynı eğriler) */
const SLIDE_MS = 320
const SLIDE_EASE = 'cubic-bezier(.22,.68,.28,1)'
const SCROLL_MS = 400
const SCROLL_EASE = 'cubic-bezier(.3,.7,.3,1)'
const FADE_MS = 420

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Ders tahtası - bir demonun tek karesini çizer, kare değişince farkı
 * oyunun hareket diliyle oynatır: yer değiştiren taş kayar (FLIP), yenen
 * taş büyüyüp söner, kaymada bütün tahta bir satır iner, yenilenmede
 * soluk geçiş. Vurgular oyundakiyle aynı: yeşil halka sıradaki taş, altın
 * hedef, kırmızı × tehlike, altın parıltı şah.
 */
export function MiniBoard({ demo, idx }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const prevRef = useRef<Frame | null>(null)
  const frame = demo.frames[idx]

  useLayoutEffect(() => {
    const prev = prevRef.current
    prevRef.current = frame
    const el = boardRef.current
    if (!el || !prev || prev === frame || reduced()) return
    const cell = el.querySelector<HTMLElement>('.mb-sq')?.offsetWidth ?? 0
    const pieceAt = (r: number, c: number) =>
      el.querySelector<HTMLElement>(`[data-rc="${r}:${c}"] .piece`)

    if (frame.scroll && isShifted(prev, frame)) {
      el.animate([{ transform: `translateY(${-cell}px)` }, { transform: 'translateY(0)' }], {
        duration: SCROLL_MS,
        easing: SCROLL_EASE,
      })
      return
    }
    if (frame.refresh) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' })
      return
    }

    const vacated: Array<[number, number, string]> = []
    const arrived: Array<[number, number, string]> = []
    prev.rows.forEach((row, r) =>
      row.forEach((tok, c) => {
        const now = frame.rows[r]?.[c] ?? '.'
        if (tok !== '.' && tok !== now) vacated.push([r, c, tok])
        if (now !== '.' && tok !== now) arrived.push([r, c, now])
      }),
    )
    if (arrived.length === 0 && vacated.length === 0) return

    if (arrived.length === 1) {
      const [r, c, tok] = arrived[0]
      const from = vacated.find(([, , v]) => v[0] === tok[0]) ?? vacated[0]
      const piece = pieceAt(r, c)
      if (from && piece) {
        piece.animate(
          [
            { transform: `translate(${(from[1] - c) * cell}px, ${(from[0] - r) * cell}px)` },
            { transform: 'translate(0, 0)' },
          ],
          { duration: SLIDE_MS, easing: SLIDE_EASE },
        )
      }
      const taken = prev.rows[r]?.[c]
      if (taken && taken !== '.') ghost(el, r, c, taken, cell, 'pop')
      vacated
        .filter((v) => v !== from && !(v[0] === r && v[1] === c))
        .forEach(([vr, vc, vt]) => ghost(el, vr, vc, vt, cell, 'fade'))
      return
    }
    if (arrived.length === 0) {
      vacated.forEach(([vr, vc, vt]) => ghost(el, vr, vc, vt, cell, 'fade'))
      return
    }
    // Çok şey değişti (ders başı, geri sarma): yumuşak geçiş
    el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' })
  }, [frame])

  const marks = new Map<string, Mark[]>()
  frame.marks?.forEach((m) => {
    const key = `${m.r}:${m.c}`
    marks.set(key, [...(marks.get(key) ?? []), m.kind])
  })

  return (
    <div className="mb-frame">
      <div
        ref={boardRef}
        className="mb-board"
        style={{ gridTemplateColumns: `repeat(${demo.cols}, var(--mb-cell))` }}
      >
        {frame.rows.map((row, r) =>
          row.map((token, c) => {
            const cell = parseCell(token)
            const kinds = marks.get(`${r}:${c}`)
            const shade = (r + c) % 2 === 0 ? 'light' : 'dark'
            return (
              <span
                key={`${r}-${c}`}
                data-rc={`${r}:${c}`}
                className={`mb-sq ${shade} ${kinds?.map((k) => `m-${k}`).join(' ') ?? ''}`}
              >
                {cell && (
                  <span className={`piece ${cell.color === 'w' ? 'white' : 'black'}`}>
                    <Fig type={cell.type} color={cell.color === 'w' ? 'white' : 'black'} />
                  </span>
                )}
                {kinds?.includes('dot') && <i className="mb-dot" />}
              </span>
            )
          }),
        )}
      </div>
    </div>
  )
}

/** Kayma karesi gerçekten bir önceki karenin bir satır inmiş hâli mi?
 *  (Geri sarmada ya da ders değişiminde değil - o zaman soluk geçiş) */
function isShifted(prev: Frame, next: Frame): boolean {
  for (let r = 1; r < next.rows.length; r++) {
    const above = prev.rows[r - 1]
    if (!above) return false
    for (let c = 0; c < next.rows[r].length; c++) {
      if (above[c] !== next.rows[r][c]) return false
    }
  }
  return true
}

/**
 * Kaybolan taşın hayaleti: kareye geçici bir glif konur, animasyon bitince
 * silinir. React ağacının dışında - bir sonraki karede zaten yok.
 */
function ghost(board: HTMLElement, r: number, c: number, token: string, cell: number, kind: 'pop' | 'fade') {
  const sq = board.querySelector<HTMLElement>(`[data-rc="${r}:${c}"]`)
  const piece = parseCell(token)
  if (!sq || !piece) return
  const g = document.createElement('span')
  g.className = `piece ${piece.color === 'w' ? 'white' : 'black'} mb-ghost`
  const img = document.createElement('img')
  img.className = 'fig'
  img.alt = ''
  img.src = figureSrc(FIGURE_OF[piece.type], piece.color === 'w' ? 'white' : 'black')
  g.appendChild(img)
  g.style.fontSize = `${cell * 0.78}px`
  sq.appendChild(g)
  const anim =
    kind === 'pop'
      ? g.animate(
          [
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(1.35)', opacity: 0.7, offset: 0.4 },
            { transform: 'scale(0.6)', opacity: 0 },
          ],
          { duration: 360, easing: 'cubic-bezier(0.34, 1.6, 0.5, 1)' },
        )
      : g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: 'ease-out' })
  anim.onfinish = () => g.remove()
}
