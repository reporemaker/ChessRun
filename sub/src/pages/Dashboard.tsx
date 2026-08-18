import type { Metric, Period } from '@shared/events'
import { useState } from 'react'
import { api } from '../api'
import { Bars } from '../components/Bars'
import { Kpi } from '../components/Kpi'
import { Line } from '../components/Line'
import { METRIC_LABEL, MODE_LABEL, fmtDuration, fmtInt } from '../format'
import { todayUtc } from '../period'
import { useQuery } from '../useQuery'

interface Props {
  period: Period
  at: string
}

const METRICS: Metric[] = ['visitors', 'players', 'runs', 'runs_daily', 'sessions']

/**
 * Dashboard: KPI satırı, tek büyük seri, iki kırılım özeti.
 *
 * Kasıtlı olarak az: her şeyi göstermek istatistik sayfasının işi. Burada
 * "bugün nasıl gidiyor" sorusuna on saniyede cevap alınmalı.
 */
export function Dashboard({ period, at }: Props) {
  const [metric, setMetric] = useState<Metric>('visitors')
  const today = todayUtc()

  const sum = useQuery(`sum ${period} ${at}`, () => api.summary(period, at))
  const ser = useQuery(`ser ${metric} ${period} ${at}`, () => api.series(metric, period, at))
  const modes = useQuery(`bd mode ${period} ${at}`, () => api.breakdown('mode', period, at, 4))
  const ends = useQuery(`bd end ${period} ${at}`, () => api.breakdown('end_reason', period, at, 6))
  const countries = useQuery(`bd country ${period} ${at}`, () => api.breakdown('country', period, at, 6))

  const s = sum.data
  const p = s?.previous

  return (
    <>
      {sum.error && <div className="banner error" role="alert">{sum.error}</div>}

      <section className="kpis" aria-label="Özet">
        <Kpi
          primary
          label="Ziyaretçi"
          value={s ? fmtInt(s.visitors) : '…'}
          now={s?.visitors}
          before={p?.visitors}
          hint="Gün başına tekil; IP saklanmaz"
        />
        <Kpi
          label="Oyuncu"
          value={s ? fmtInt(s.players) : '…'}
          now={s?.players}
          before={p?.players}
          hint="En az bir oyun bitiren oturum"
        />
        <Kpi
          label="Oyun"
          value={s ? fmtInt(s.runs) : '…'}
          now={s?.runs}
          before={p?.runs}
          hint="Kaydedilen koşu sayısı (yarım bırakılan dahil) - bütün modlar"
        />
        <Kpi
          neutral
          label="Ortalama süre"
          value={s ? fmtDuration(s.avgDurationMs) : '…'}
          now={s?.avgDurationMs}
          before={p?.avgDurationMs}
          hint={
            s?.medianDurationMs != null
              ? `Medyan ${fmtDuration(s.medianDurationMs)}`
              : 'Toplam süre ÷ oyun; medyan günlük görünümde'
          }
        />
        <Kpi
          label="Oturum"
          value={s ? fmtInt(s.sessions) : '…'}
          now={s?.sessions}
          before={p?.sessions}
          hint="Sekme başına; 30 dk hareketsizlikte yenilenir"
        />
      </section>

      <section className="card wide">
        <header className="card-head">
          <h2>Zaman içinde</h2>
          <div className="seg" role="tablist" aria-label="Metrik">
            {METRICS.map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={metric === m}
                className={metric === m ? 'on' : ''}
                onClick={() => setMetric(m)}
              >
                {METRIC_LABEL[m]}
              </button>
            ))}
          </div>
        </header>
        {ser.error ? (
          <div className="chart-empty">{ser.error}</div>
        ) : (
          <Line points={ser.data?.points ?? []} label={METRIC_LABEL[metric]} today={today} />
        )}
      </section>

      <section className="grid-3">
        <div className="card">
          <header className="card-head">
            <h2>Oyunlar</h2>
            <span className="muted">
              {s
                ? `${MODE_LABEL.classic} ${fmtInt(s.runsByMode.classic)} · ${MODE_LABEL.kingRun} ${fmtInt(s.runsByMode.kingRun)} · ${MODE_LABEL.trio} ${fmtInt(s.runsByMode.trio)} · Günlük ${fmtInt(s.runsByMode.daily)}`
                : ''}
            </span>
          </header>
          {modes.data && <Bars dim="mode" rows={modes.data.rows} unit="runs" />}
          {s && s.runsDaily > 0 && (
            <p className="foot">
              {fmtInt(s.runsDaily)} oyun {MODE_LABEL.daily}'nde - grafikte "Günlük mücadele" ölçütü
            </p>
          )}
        </div>
        <div className="card">
          <header className="card-head">
            <h2>Nasıl bitti</h2>
          </header>
          {ends.data && <Bars dim="end_reason" rows={ends.data.rows} unit="runs" />}
        </div>
        <div className="card">
          <header className="card-head">
            <h2>Ülkeler</h2>
          </header>
          {countries.data && <Bars dim="country" rows={countries.data.rows} unit="visitors" />}
        </div>
      </section>
    </>
  )
}
