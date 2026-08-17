import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DEMOS, type DemoId, type Frame, type Mark, parseCell } from '../ui/demos'
import { GLYPH } from '../ui/pieces'
import { useT } from '../ui/text'

interface Props {
  id: DemoId
}

/** Temel tempo; her karenin `hold` çarpanı bunun üstüne biner */
const BEAT_MS = 1150
/** Son kareden sonra baştan almadan önceki nefes */
const LOOP_PAUSE = 1.4

/* Oyundaki hareketin aynısı, öğretim için biraz daha yavaş
   (Board.tsx: PIECE_SLIDE_MS 150 / BOARD_SCROLL_MS 190, aynı eğriler) */
const SLIDE_MS = 300
const SLIDE_EASE = 'cubic-bezier(.22,.68,.28,1)'
const SCROLL_MS = 380
const SCROLL_EASE = 'cubic-bezier(.3,.7,.3,1)'
const FADE_MS = 420

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * "Nasıl oynanır" mini tahtası — kare kare oynatıcı, oyunun hareket diliyle.
 *
 * Kareler sabit tempoda değişiyor; iki kare arasındaki fark bulunup
 * oyundaki gibi oynatılıyor: yer değiştiren taş kayarak gidiyor (FLIP),
 * yenen taş büyüyüp sönüyor, kaymada bütün tahta bir satır iniyor,
 * yenilenmede tahta soluk geçişle değişiyor. Vurgular oyundakiyle aynı
 * dili konuşuyor: yeşil halka sıradaki taş, altın hedef, kırmızı tehlike.
 *
 * Tahta boyutu sabit (5×5, --mb-cell) ve altyazıya üç satır yer ayrılıyor:
 * dil değişince yerleşim oynamıyor.
 */
export function MiniBoard({ id }: Props) {
  const t = useT()
  const demo = DEMOS[id]
  const [idx, setIdx] = useState(0)
  const boardRef = useRef<HTMLDivElement>(null)
  const prevRef = useRef<Frame | null>(null)

  useEffect(() => {
    const frame = demo.frames[idx]
    const last = idx === demo.frames.length - 1
    const wait = BEAT_MS * (frame.hold ?? 1) * (last ? LOOP_PAUSE : 1)
    const timer = setTimeout(() => setIdx(last ? 0 : idx + 1), wait)
    return () => clearTimeout(timer)
  }, [demo, idx])

  const frame: Frame = demo.frames[idx]

  // Kare değişti: önceki kareyle farkı bul ve hareketi oynat
  useLayoutEffect(() => {
    const prev = prevRef.current
    prevRef.current = frame
    const el = boardRef.current
    if (!el || !prev || reduced()) return
    const cell = el.querySelector<HTMLElement>('.mb-sq')?.offsetWidth ?? 0
    const pieceAt = (r: number, c: number) =>
      el.querySelector<HTMLElement>(`[data-rc="${r}:${c}"] .piece`)

    if (frame.scroll) {
      // Bir satır yukarıdan başla, yerine in — Board.tsx ile aynı
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

    // Fark: boşalan ve dolan kareler
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
      // Yenen taş: kaybolurken büyüyüp sönüyor
      const taken = prev.rows[r]?.[c]
      if (taken && taken !== '.') ghost(el, r, c, taken, cell, 'pop')
      // Yeme dışında silinen taş (pusu koruması): yalnızca sönüyor
      vacated
        .filter((v) => v !== from && !(v[0] === r && v[1] === c))
        .forEach(([vr, vc, vt]) => ghost(el, vr, vc, vt, cell, 'fade'))
      return
    }
    if (arrived.length === 0) {
      vacated.forEach(([vr, vc, vt]) => ghost(el, vr, vc, vt, cell, 'fade'))
      return
    }
    // Çok şey değişti (döngü başı): yumuşak geçiş
    el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' })
  }, [frame])

  const marks = new Map<string, Mark[]>()
  frame.marks?.forEach((m) => {
    const key = `${m.r}:${m.c}`
    marks.set(key, [...(marks.get(key) ?? []), m.kind])
  })

  return (
    <figure
      className="mb"
      style={{ '--mb-cols': demo.cols } as CSSProperties}
      aria-label={frame.captionKey ? t(frame.captionKey) : undefined}
    >
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
                <span key={`${r}-${c}`} data-rc={`${r}:${c}`} className={`mb-sq ${shade} ${kinds?.map((k) => `m-${k}`).join(' ') ?? ''}`}>
                  {cell && (
                    <span className={`piece ${cell.color === 'w' ? 'white' : 'black'}`}>
                      {GLYPH[cell.type]}
                    </span>
                  )}
                  {kinds?.includes('dot') && <i className="mb-dot" />}
                </span>
              )
            }),
          )}
        </div>
        {frame.tag && (
          <span key={`${idx}:${frame.tag}`} className="mb-tag">
            {frame.tag}
          </span>
        )}
      </div>
      <figcaption className="mb-cap">{frame.captionKey ? t(frame.captionKey) : ''}</figcaption>
      <span className="mb-steps" aria-hidden>
        {demo.frames.map((_, i) => (
          <i key={i} className={i === idx ? 'on' : ''} />
        ))}
      </span>
    </figure>
  )
}

/**
 * Kaybolan taşın hayaleti: kareye geçici bir glif konur, animasyon bitince
 * silinir. React ağacının dışında — bir sonraki karede zaten yok.
 */
function ghost(board: HTMLElement, r: number, c: number, token: string, cell: number, kind: 'pop' | 'fade') {
  const sq = board.querySelector<HTMLElement>(`[data-rc="${r}:${c}"]`)
  const piece = parseCell(token)
  if (!sq || !piece) return
  const g = document.createElement('span')
  g.className = `piece ${piece.color === 'w' ? 'white' : 'black'} mb-ghost`
  g.textContent = GLYPH[piece.type]
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
