import type { Dimension, Period } from '@shared/events'
import { api } from '../api'
import { Bars } from '../components/Bars'
import { DIM_LABEL } from '../format'
import { useQuery } from '../useQuery'

interface Props {
  period: Period
  at: string
}

/**
 * İstatistik: her kırılım kendi kartında, iki grupta.
 *
 * "Kim geliyor" ziyaretçi sayısıyla, "nasıl oynuyor" koşu sayısıyla
 * ölçülüyor - aynı ülke boyutu iki grupta da var çünkü iki farklı soru:
 * siteye giren TR'liler ile oyun oynayan TR'liler aynı küme değil.
 */
const WHO: Dimension[] = ['country', 'ui_lang', 'nav_lang', 'accept_lang', 'device', 'os', 'browser', 'viewport', 'referrer', 'standalone']
const HOW: Dimension[] = ['mode', 'end_reason']

export function Stats({ period, at }: Props) {
  return (
    <>
      <h2 className="group-title">Kim geliyor <span className="muted">- ziyaretçi sayısı</span></h2>
      <section className="grid-2">
        {WHO.map((dim) => (
          <Card key={dim} dim={dim} period={period} at={at} unit="visitors" />
        ))}
      </section>

      <h2 className="group-title">Nasıl oynuyor <span className="muted">- oyun sayısı</span></h2>
      <section className="grid-2">
        {HOW.map((dim) => (
          <Card key={dim} dim={dim} period={period} at={at} unit="runs" />
        ))}
      </section>

      <section className="card defs">
        <h2>Tanımlar</h2>
        <dl>
          <dt>Ziyaretçi</dt>
          <dd>Günlük dönen tuzla hash'lenmiş IP + tarayıcı. Gün başına tekil; tuz 48 saatte silindiği için dünkü hash'ler geri döndürülemez. IP hiç saklanmaz.</dd>
          <dt>Oturum</dt>
          <dd>Sekme başına kimlik (<code>sessionStorage</code>), 30 dakika hareketsizlikte yenilenir; ziyaret ve oturum-sonu olaylarının birleşimi sayılır. Cihazı takip etmez.</dd>
          <dt>Oyuncu</dt>
          <dd>En az bir oyun bitiren oturum.</dd>
          <dt>Oyun</dt>
          <dd>Kaydedilen her koşu; yarım bırakılanlar da dahil (bitiş kırılımında "Yarıda bırakıldı" olarak ayrı görünür).</dd>
          <dt>Süre</dt>
          <dd>Duvar saati; sekme arka plandayken de işler, bu yüzden 2 saate kırpılır ve günlük görünümde medyan da verilir.</dd>
          <dt>Toplanmayan</dt>
          <dd>Şehir, ham User-Agent, ekran çözünürlüğü, cihaz jetonu, IP. Bilerek.</dd>
        </dl>
      </section>
    </>
  )
}

function Card({ dim, period, at, unit }: { dim: Dimension; period: Period; at: string; unit: 'visitors' | 'runs' }) {
  const q = useQuery(`bd ${dim} ${period} ${at}`, () => api.breakdown(dim, period, at, 12))
  return (
    <div className="card">
      <header className="card-head">
        <h3>{DIM_LABEL[dim]}</h3>
        {q.loading && <span className="muted">…</span>}
      </header>
      {q.error ? <div className="chart-empty">{q.error}</div> : q.data && <Bars dim={dim} rows={q.data.rows} unit={unit} />}
    </div>
  )
}
