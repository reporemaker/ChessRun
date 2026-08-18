import { fmtDelta } from '../format'

/**
 * Tek sayı + önceki döneme göre delta.
 *
 * Delta yalnızca renkle değil, ok karakteri ve işaretle de veriliyor.
 * `hint` sayının tanımını taşıyor - "ziyaretçi" ile "oturum" arasındaki
 * fark altı ay sonra da bir bakışta anlaşılsın diye tanımlar arayüzde.
 */

interface Props {
  label: string
  value: string
  now?: number
  before?: number
  hint: string
  /** Vurgu KPI'sı - dashboard'da tek tane */
  primary?: boolean
  /** Yönü olmayan metrik (süre): artış iyi ya da kötü değil, renk verilmez */
  neutral?: boolean
}

export function Kpi({ label, value, now, before, hint, primary, neutral }: Props) {
  const delta = now !== undefined && before !== undefined ? fmtDelta(now, before) : null
  return (
    <div className={`kpi${primary ? ' primary' : ''}`} title={hint}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta && (
        <div className={`kpi-delta ${neutral ? 'flat' : delta.dir}`} aria-label={`önceki döneme göre ${delta.text}`}>
          <span aria-hidden="true">{delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '■'}</span> {delta.text}
        </div>
      )}
      <div className="kpi-hint">{hint}</div>
    </div>
  )
}
