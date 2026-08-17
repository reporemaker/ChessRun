import { useEffect, useRef, useState } from 'react'
import { DEMOS, type DemoId } from '../ui/demos'
import type { StringKey } from '../ui/i18n'
import { useT } from '../ui/text'
import { MiniBoard } from './MiniBoard'

interface Props {
  /** Bölümün dersleri; her biri bir demo */
  lessons: DemoId[]
}

/** Temel tempo; her karenin `hold` çarpanı bunun üstüne biner */
const BEAT_MS = 1600
/** Son kareden sonra baştan almadan önceki nefes */
const LOOP_PAUSE = 1.5

/**
 * Ders sahnesi — kılavuzun "ekranı".
 *
 * Solda büyük tahta, sağda dersin adımları: her adım animasyonun bir
 * karesi, sıradaki adım altınla yanıyor. Metin ve hareket aynı şey —
 * okuduğun cümle o an tahtada oluyor. Altta kaset düğmeleri: önceki /
 * oynat-durdur / sonraki, ve bölümün ders sekmeleri. Adıma tıklayınca
 * oraya atlar. Sahne görünür değilken oynatma durur (aynı anda dört
 * sahne dönmesin, pil ve dikkat için).
 */
export function LessonStage({ lessons }: Props) {
  const t = useT()
  const [lesson, setLesson] = useState(0)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [visible, setVisible] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)

  const demo = DEMOS[lessons[lesson]]
  const frames = demo.frames
  const frame = frames[idx]

  // Ekran dışındayken durur
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.2,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Otomatik ilerleme
  useEffect(() => {
    if (!playing || !visible) return
    const last = idx === frames.length - 1
    const wait = BEAT_MS * (frame.hold ?? 1) * (last ? LOOP_PAUSE : 1)
    const timer = setTimeout(() => setIdx(last ? 0 : idx + 1), wait)
    return () => clearTimeout(timer)
  }, [playing, visible, idx, frame, frames.length])

  function pick(next: number) {
    setLesson(next)
    setIdx(0)
    setPlaying(true)
  }

  function step(delta: number) {
    setIdx((cur) => (cur + delta + frames.length) % frames.length)
    setPlaying(false)
  }

  return (
    <div ref={rootRef} className="ls">
      {lessons.length > 1 && (
        <div className="ls-nav">
          <div className="ls-tabs" role="tablist">
            {lessons.map((id, i) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={i === lesson}
                aria-label={t(`lesson.${id}` as StringKey)}
                className={`ls-tab ${i === lesson ? 'on' : ''}`}
                onClick={() => pick(i)}
              >
                <b>{i + 1}</b>
                <span>{t(`lesson.${id}` as StringKey)}</span>
              </button>
            ))}
          </div>
          {/* Dar ekranda sekmeler yalnızca numara; seçili dersin adı yanında */}
          <span className="ls-cur">{t(`lesson.${lessons[lesson]}` as StringKey)}</span>
        </div>
      )}

      <div className="ls-stage">
        <div className="ls-screen">
          <div className="ls-hud">
            <span>
              {t('manual.step')} {idx + 1}/{frames.length}
            </span>
            <span key={`${lesson}:${idx}`} className={`ls-tag ${frame.tag ? 'on' : ''}`}>
              {frame.tag ?? ''}
            </span>
          </div>
          <MiniBoard demo={demo} idx={idx} />
        </div>

        <ol className="ls-steps">
          {frames.map((f, i) => (
            <li key={i} className={i === idx ? 'on' : i < idx ? 'done' : ''}>
              <button type="button" onClick={() => { setIdx(i); setPlaying(false) }}>
                <i>{i + 1}</i>
                <span>{f.captionKey ? t(f.captionKey) : ''}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="ls-ctl">
        <button type="button" onClick={() => step(-1)} aria-label={t('manual.prev')}>
          ◀
        </button>
        <button
          type="button"
          className="ls-play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? t('manual.pause') : t('manual.play')}
        >
          {playing ? '❚❚' : '▶'} <span>{playing ? t('manual.pause') : t('manual.play')}</span>
        </button>
        <button type="button" onClick={() => step(1)} aria-label={t('manual.next')}>
          ▶
        </button>
      </div>
    </div>
  )
}
