import type { BreakdownResponse, Dimension, Period } from '@shared/events'
import { api } from '../api'
import { Bars } from '../components/Bars'
import { DIM_LABEL } from '../format'
import { useQuery } from '../useQuery'

interface Props {
  period: Period
  at: string
}

/**
 * İstatistik: her kırılım kendi kartında, iki grupta - hepsi TEK istekte
 * (`/api/breakdowns`): eskiden 12 kart bugünün ham satırlarını 12 kez
 * taratıyordu.
 *
 * "Kim geliyor" ziyaretçi sayısıyla, "nasıl oynuyor" koşu sayısıyla
 * ölçülüyor - aynı ülke boyutu iki grupta da var çünkü iki farklı soru:
 * siteye giren TR'liler ile oyun oynayan TR'liler aynı küme değil.
 */
const WHO: Dimension[] = ['country', 'ui_lang', 'nav_lang', 'accept_lang', 'device', 'os', 'browser', 'viewport', 'referrer', 'standalone', 'app_version']
const HOW: Dimension[] = ['mode', 'end_reason', 'daily_end']

export function Stats({ period, at }: Props) {
  const q = useQuery(`bds stats ${period} ${at}`, () => api.breakdowns([...WHO, ...HOW], period, at, 12))
  return (
    <>
      {q.error && <div className="banner error" role="alert">{q.error}</div>}

      <h2 className="group-title">Kim geliyor <span className="muted">- ziyaretçi sayısı</span></h2>
      <section className="grid-2">
        {WHO.map((dim) => (
          <Card key={dim} dim={dim} unit="visitors" data={q.data?.[dim]} loading={q.loading} />
        ))}
      </section>

      <h2 className="group-title">Nasıl oynuyor <span className="muted">- oyun sayısı</span></h2>
      <section className="grid-2">
        {HOW.map((dim) => (
          <Card key={dim} dim={dim} unit="runs" data={q.data?.[dim]} loading={q.loading} />
        ))}
      </section>

      <section className="card defs">
        <h2>Tanımlar</h2>
        <dl>
          <dt>Gün</dt>
          <dd><b>UTC</b>. Türkiye için +3 saat: «bugün» sabah 03:00'e kadar dünün son saatlerini de içerir; hafta ve ay sınırları da UTC gece yarısı.</dd>
          <dt>Ziyaretçi</dt>
          <dd>Günlük dönen tuzla hash'lenmiş IP + tarayıcı. <b>Gün başına tekil, kişi değil</b>: hafta görünümünde her gün gelen bir kişi 7 kez sayılır. Tuz 48 saatte silindiği için dünkü hash'ler geri döndürülemez; IP hiç saklanmaz.</dd>
          <dt>Oturum</dt>
          <dd>Sekme başına kimlik (<code>sessionStorage</code>), 30 dakika hareketsizlikte yenilenir; ziyaret ve oturum-sonu olaylarının birleşimi sayılır. Cihazı takip etmez.</dd>
          <dt>Oyuncu</dt>
          <dd>En az bir oyun bitiren oturum. Oturum bazlı olduğu için ziyaretçiyi <b>aşabilir</b> (aynı gün ikinci sekme, ilk ziyareti süzgece takılan oyuncu).</dd>
          <dt>Oyun</dt>
          <dd>Kaydedilen her koşu; yarım bırakılanlar da dahil (bitiş kırılımında "Yarıda bırakıldı" olarak ayrı görünür).</dd>
          <dt>Günlük mücadele - bitiş</dt>
          <dd>Yalnızca günlük mücadele koşularının bitişi: «başlayan → bitiren» hunisi. Başlayan = bitişini bildiren her koşu; hiç bildirmeyen sekme (öldürülen) sayılmaz.</dd>
          <dt>Süre</dt>
          <dd>Oyun süresi duvar saati; sekme arka plandayken de işler, bu yüzden 2 saate kırpılır ve günlük görünümde medyan ile p90 da verilir. Oturum süresi açılıştan sekme kapanana kadar; yalnızca oturum-sonu bildiren sekmelerden.</dd>
          <dt>Delta (▲▼)</dt>
          <dd>Bitmiş dönemde tam önceki dönemle; sürmekte olan dönemde önceki dönemin yalnızca aynı uzunluktaki başıyla (çarşamba: bu haftanın 3 günü ↔ geçen haftanın ilk 3 günü).</dd>
          <dt>Diğer</dt>
          <dd>Listede yer almayan değerlerin toplamı - yüzdeler böylece 100'e tamamlanır.</dd>
          <dt>Bot süzgeci</dt>
          <dd>Ziyaret, koşu ve oturum-sonu aynı kuralla elenir: bilinen bot UA'sı, Accept-Language yok, telefon UA'sı ama dokunmatik yok.</dd>
          <dt>Toplanmayan</dt>
          <dd>Şehir, ham User-Agent, ekran çözünürlüğü, cihaz jetonu, IP. Bilerek.</dd>
        </dl>
      </section>
    </>
  )
}

function Card({
  dim,
  unit,
  data,
  loading,
}: {
  dim: Dimension
  unit: 'visitors' | 'runs'
  data: BreakdownResponse | undefined
  loading: boolean
}) {
  return (
    <div className="card">
      <header className="card-head">
        <h3>{DIM_LABEL[dim]}</h3>
        {loading && <span className="muted">…</span>}
      </header>
      {data ? <Bars dim={dim} rows={data.rows} unit={unit} rest={data.rest} /> : !loading && <div className="chart-empty">Bu dönemde veri yok</div>}
    </div>
  )
}
