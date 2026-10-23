import type { Dimension, Metric, Period } from '@shared/events'
import { useState } from 'react'
import { api } from '../api'
import { Bars } from '../components/Bars'
import { Kpi } from '../components/Kpi'
import { Line } from '../components/Line'
import { METRIC_LABEL, MODE_LABEL, PERIOD_LABEL, fmtDuration, fmtInt, fmtPct } from '../format'
import { todayUtc } from '../period'
import { useQuery } from '../useQuery'

interface Props {
  period: Period
  at: string
}

const METRICS: Metric[] = ['visitors', 'players', 'runs', 'runs_daily', 'sessions']
// "önceki haftanın / ayın / yılın" - tamlayan hâli
const PERIOD_GEN: Record<Period, string> = { day: 'günün', week: 'haftanın', month: 'ayın', year: 'yılın' }
// Üç kart + günlük huni tek istekte (bugünün ham satırları bir kez taranır)
const DIMS: Dimension[] = ['mode', 'end_reason', 'country', 'daily_end']

/**
 * Dashboard: KPI satırı, tek büyük seri, üç kırılım özeti + günlük huni.
 *
 * Kasıtlı olarak az: her şeyi göstermek istatistik sayfasının işi. Burada
 * "bugün nasıl gidiyor" sorusuna on saniyede cevap alınmalı.
 *
 * Dürüstlük notları KPI'ların altında tek satırda: günler UTC; ziyaretçi
 * gün bazında tekil (haftada aynı kişi 7 kez sayılabilir); oyuncu oturum
 * bazlı, ziyaretçiyi aşabilir; delta sürmekte olan dönemde önceki dönemin
 * yalnızca aynı uzunluktaki başına göre.
 */
export function Dashboard({ period, at }: Props) {
  const [metric, setMetric] = useState<Metric>('visitors')
  const today = todayUtc()

  const sum = useQuery(`sum ${period} ${at}`, () => api.summary(period, at))
  const ser = useQuery(`ser ${metric} ${period} ${at}`, () => api.series(metric, period, at))
  const bd = useQuery(`bds dash ${period} ${at}`, () => api.breakdowns(DIMS, period, at, 6))

  const s = sum.data
  const p = s?.previous
  const modes = bd.data?.mode
  const ends = bd.data?.end_reason
  const countries = bd.data?.country
  const funnel = bd.data?.daily_end

  // Günlük mücadele hunisi: başlayan = bitişini bildiren her koşu (yarıda
  // bırakılan dahil), bitiren = yarıda bırakılmayan. Sekmesi öldürülen ve
  // hiç bildirmeyen koşu iki sayıda da yok - "başlayan" alt sınırdır.
  const dailyStarted = funnel?.total ?? 0
  const dailyAbandoned = funnel?.rows.find((r) => r.value === 'abandoned')?.runs ?? 0
  const dailyFinished = dailyStarted - dailyAbandoned

  const compare = s
    ? s.partial
      ? `önceki ${PERIOD_GEN[s.period]} ilk ${s.comparedDays} gününe göre`
      : 'önceki döneme göre'
    : undefined
  const periodName = PERIOD_LABEL[period].toLocaleLowerCase('tr')

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
          compare={compare}
          hint="Gün başına tekil (IP+tarayıcı özeti); çok günlü dönemde aynı kişi her gün yeniden sayılır. IP saklanmaz"
        />
        <Kpi
          label="Oyuncu"
          value={s ? fmtInt(s.players) : '…'}
          now={s?.players}
          before={p?.players}
          compare={compare}
          hint="En az bir oyun bitiren oturum - oturum bazlı olduğu için ziyaretçiyi aşabilir"
        />
        <Kpi
          label="Oyun"
          value={s ? fmtInt(s.runs) : '…'}
          now={s?.runs}
          before={p?.runs}
          compare={compare}
          hint={
            s && s.runs > 0
              ? `Kaydedilen koşu (yarım bırakılan dahil), bütün modlar · ort. ${fmtInt(s.avgScore)} puan · ${fmtInt(s.avgDistance)} satır`
              : 'Kaydedilen koşu sayısı (yarım bırakılan dahil) - bütün modlar'
          }
        />
        <Kpi
          neutral
          label="Oyun süresi"
          value={s ? fmtDuration(s.avgDurationMs) : '…'}
          now={s?.avgDurationMs}
          before={p?.avgDurationMs}
          compare={compare}
          hint={
            s?.medianDurationMs != null
              ? `Ortalama · medyan ${fmtDuration(s.medianDurationMs)} · p90 ${fmtDuration(s.p90DurationMs)}`
              : 'Ortalama: toplam süre ÷ oyun; medyan ve p90 günlük görünümde'
          }
        />
        <Kpi
          neutral
          label="Oturum süresi"
          value={s ? fmtDuration(s.avgSessionMs) : '…'}
          now={s?.avgSessionMs}
          before={p?.avgSessionMs}
          compare={compare}
          hint={
            s?.medianSessionMs != null
              ? `Ortalama · medyan ${fmtDuration(s.medianSessionMs)} · yalnızca oturum-sonu bildiren sekmeler`
              : 'Açılıştan sekme kapanana kadar, ortalama; medyan günlük görünümde. Oturum-sonu bildirmeyen sekme sayılmaz'
          }
        />
        <Kpi
          label="Oturum"
          value={s ? fmtInt(s.sessions) : '…'}
          now={s?.sessions}
          before={p?.sessions}
          compare={compare}
          hint="Sekme başına; 30 dk hareketsizlikte yenilenir"
        />
      </section>

      <p className="kpi-note">
        Günler <b>UTC</b> (TR için +3 sa: «bugün» 03:00'e kadar dünü de sayar) ·{' '}
        {period === 'day' ? (
          <>ziyaretçi bu güne özgü tekil</>
        ) : (
          <>
            ziyaretçi <b>gün bazında</b> tekil - {periodName} içinde aynı kişi birden çok sayılabilir
          </>
        )}
        {s && s.players > s.visitors && (
          <>
            {' '}· <b>oyuncu &gt; ziyaretçi</b>: oyuncu oturum bazlı, ziyaretçi gün bazlı; ilk ziyaret bot süzgecine takılan ya da
            başka gün gelen oyuncu burada sayılır
          </>
        )}
        {s?.partial && (
          <>
            {' '}· ▲▼ <b>{compare}</b> (dönem sürüyor)
          </>
        )}
      </p>

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
                ? `${MODE_LABEL.classic} ${fmtInt(s.runsByMode.classic)} · ${MODE_LABEL.kingRun} ${fmtInt(s.runsByMode.kingRun)} · ${MODE_LABEL.trio} ${fmtInt(s.runsByMode.trio)} · Günlük ${fmtInt(s.runsByMode.daily)} · ${MODE_LABEL.maharajah} ${fmtInt(s.runsByMode.maharajah ?? 0)}`
                : ''}
            </span>
          </header>
          {bd.error ? <div className="chart-empty">{bd.error}</div> : modes && <Bars dim="mode" rows={modes.rows} unit="runs" rest={modes.rest} />}
          {dailyStarted > 0 && (
            <p className="foot" title="Başlayan = bitişini bildiren her günlük koşu (yarıda bırakılan dahil); bitiren = yarıda bırakılmayan. Hiç bildirmeyen sekme ikisinde de yok.">
              Günlük mücadele: <b>{fmtInt(dailyStarted)}</b> başladı → <b>{fmtInt(dailyFinished)}</b> bitirdi (
              {fmtPct(dailyStarted ? dailyFinished / dailyStarted : 0)}) · {fmtInt(dailyAbandoned)} yarıda
            </p>
          )}
        </div>
        <div className="card">
          <header className="card-head">
            <h2>Nasıl bitti</h2>
          </header>
          {ends && <Bars dim="end_reason" rows={ends.rows} unit="runs" rest={ends.rest} />}
        </div>
        <div className="card">
          <header className="card-head">
            <h2>Ülkeler</h2>
          </header>
          {countries && <Bars dim="country" rows={countries.rows} unit="visitors" rest={countries.rest} />}
        </div>
      </section>
    </>
  )
}
