import { useId, useState } from 'react'
import { fmtBucket, fmtInt } from '../format'

/**
 * Zaman serisi — el yapımı SVG.
 *
 * Panelin ihtiyacı tam iki işaret (çizgi + bar listesi); bunun için bir
 * grafik kütüphanesi (~90 KB) panelin tamamından büyük olurdu. Prop şekli
 * `{points}` bilerek jenerik: bir gün kütüphaneye geçilirse yalnızca bu
 * dosya değişir.
 *
 * Erişilebilirlik: görsel olarak gizli bir tablo aynı veriyi taşıyor;
 * ekran okuyucu grafiği değil tabloyu okuyor.
 */

export interface Point {
  bucket: string
  value: number
}

interface Props {
  points: Point[]
  label: string
  /** Bugünden sonraki kovalar soluk çizilir — henüz veri gelmedi, sıfır değil */
  today?: string
}

const W = 720
const H = 200
const PAD = { top: 12, right: 28, bottom: 24, left: 40 }

export function Line({ points, label, today }: Props) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) {
    return <div className="chart-empty">Bu dönemde veri yok</div>
  }

  const max = Math.max(1, ...points.map((p) => p.value))
  // Eksen üstü "güzel" tavan: 1–2–5 dizisi
  const mag = 10 ** Math.floor(Math.log10(max))
  const nice = [1, 2, 5, 10].map((k) => k * mag).find((v) => v >= max) ?? max
  const ticks = [0, 0.5, 1].map((f) => Math.round(nice * f))

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / nice) * innerH

  // Gelecek kovalar: bugünden sonrası. Çizgi orada kesiliyor, alan solmuyor.
  const lastReal = today ? points.findLastIndex((p) => p.bucket <= today) : points.length - 1
  const real = points.slice(0, Math.max(0, lastReal) + 1)

  const path = real.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = real.length > 1 ? `${path} L${x(real.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : ''

  // Etiket seyreltme: en fazla ~8 etiket
  const step = Math.max(1, Math.ceil(points.length / 8))

  return (
    <figure className="chart" aria-labelledby={`${id}-cap`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-hidden="true"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * W
          const i = Math.round(((px - PAD.left) / innerW) * (points.length - 1))
          setHover(Math.min(points.length - 1, Math.max(0, i)))
        }}
      >
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--gold)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {fmtInt(t)}
            </text>
          </g>
        ))}

        {area && <path d={area} fill={`url(#${id}-g)`} />}
        {path && <path d={path} className="series" />}

        {points.map((p, i) =>
          // Son etiket her zaman; ondan hemen önceki adım etiketi çakışırsa atla
          i === points.length - 1 || (i % step === 0 && points.length - 1 - i >= step / 2) ? (
            <text key={p.bucket} x={x(i)} y={H - 6} className="tick" textAnchor="middle">
              {fmtBucket(p.bucket)}
            </text>
          ) : null,
        )}

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="cursor" />
            <circle cx={x(hover)} cy={y(points[hover].value)} r="4" className="dot" />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <span className="tip-k">{fmtBucket(points[hover].bucket)}</span>
          <span className="tip-v">{fmtInt(points[hover].value)}</span>
        </div>
      )}

      <figcaption id={`${id}-cap`} className="sr-only">
        {label}. {points.map((p) => `${fmtBucket(p.bucket)}: ${fmtInt(p.value)}`).join(', ')}
      </figcaption>
    </figure>
  )
}
