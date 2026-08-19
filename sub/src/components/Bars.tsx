import type { BreakdownResponse, BreakdownRow, Dimension } from '@shared/events'
import { fmtInt, fmtPct, fmtValue } from '../format'

/**
 * Yatay bar listesi - her kırılımın ortak gövdesi.
 *
 * Ülke, dil, tarayıcı, cihaz, mod, bitiş sebebi… hepsi farklı veriyle
 * aynı bileşen; `daily_dim`'in tek şekilde olması burada karşılığını
 * buluyor. Sayı ve yüzde barın DIŞINDA: bar yalnızca görsel karşılaştırma,
 * bilgi metinde - renk tek taşıyıcı değil.
 */

interface Props {
  dim: Dimension
  rows: BreakdownRow[]
  /** Koşu boyutlarında (mod, bitiş) sayı koşudur, ziyaretçi değil */
  unit: 'visitors' | 'runs'
  /** Sınır dışında kalanların toplamı - "Diğer" satırı, yüzdeler 100'e tamamlansın */
  rest?: BreakdownResponse['rest']
}

export function Bars({ dim, rows, unit, rest }: Props) {
  if (rows.length === 0) return <div className="chart-empty">Bu dönemde veri yok</div>
  const top = Math.max(1, ...rows.map((r) => r[unit]))

  return (
    <ol className="bars">
      {rows.map((r) => (
        <li key={r.value} className="bar-row">
          <span className="bar-label" title={r.value}>
            {fmtValue(dim, r.value)}
          </span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${(r[unit] / top) * 100}%` }} />
          </span>
          <span className="bar-num">{fmtInt(r[unit])}</span>
          <span className="bar-pct">{fmtPct(r.share)}</span>
        </li>
      ))}
      {rest && (
        <li className="bar-row rest" title={`Listelenmeyen ${fmtInt(rest.values)} değerin toplamı`}>
          <span className="bar-label">Diğer ({fmtInt(rest.values)} değer)</span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${(rest[unit] / top) * 100}%` }} />
          </span>
          <span className="bar-num">{fmtInt(rest[unit])}</span>
          <span className="bar-pct">{fmtPct(rest.share)}</span>
        </li>
      )}
    </ol>
  )
}
