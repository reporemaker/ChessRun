import type { NameAction, PlayerRow, PlayerStatus } from '@shared/leaderboard'
import { BASE_BANNED } from '@shared/names'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { badgeText } from '../badges'
import { useQuery } from '../useQuery'

/**
 * Adlar - haftalık sıralamadaki oyuncu adlarının moderasyonu.
 *
 * Dört geri alınabilir eylem: Sıfırla (ad yer tutucuya döner, eski ad
 * bir daha kabul edilmez) · Gizle (listeden düşer, kendisi fark etmez) ·
 * Yasakla (koşuları yazılmaz) · Geri al. İki geri alınamaz eylem, onaylı:
 * Başarımları sıfırla (ad + rozet + skorlar + birincilikler + sunucu profili;
 * cihaza da sıfır iner) · Sil (tüm satırlar - öksüz kimlik temizliği).
 * Alt kısımda yasaklı kelime listesi - `shared/names` kök listesiyle
 * birleşip istemcide ve sunucuda çalışıyor.
 *
 * Panel ham jetonu görmüyor: satır anahtarı SHA-256 hash, gösterim kısa
 * jeton. Tabloda oyuncunun GÜNCEL adı; oyuncu ad değiştirirse burada da
 * değişir.
 */

type Filter = PlayerStatus | 'orphan' | 'suspect' | ''
const STATUS_LABEL: Record<PlayerStatus, string> = { ok: 'açık', shadow: 'gizli', banned: 'yasaklı' }
const FILTERS: Array<{ id: Filter; label: string; title?: string }> = [
  { id: '', label: 'Hepsi' },
  { id: 'ok', label: 'Açık' },
  { id: 'shadow', label: 'Gizli' },
  { id: 'banned', label: 'Yasaklı' },
  { id: 'orphan', label: 'Öksüz', title: '1 yıldır koşu yok ve hiç birincilik yok - elle silinecek adaylar' },
  { id: 'suspect', label: '⚠ Şüpheli', title: 'Puan/satır mod eşiğinin üstünde ya da dakikada 8+ koşu - elle bak, gerekirse Gizle' },
]

const CONFIRM: Partial<Record<NameAction, (row: PlayerRow) => string>> = {
  wipe: (row) =>
    `«${row.name}» (${row.short}) için başarımlar sıfırlansın mı?\n\nAd yer tutucuya döner ve reddedilir, rozet düşer, bu ve geçmiş haftaların skorları ile birincilikler silinir, sunucu profili boşalır. Oyuncunun cihazı bir sonraki açılışta yerel rozet/sayaç/defterini de siler. Kurtarma kodu geçersiz olur.\n\nGERİ ALINAMAZ.`,
  delete: (row) =>
    `«${row.name}» (${row.short}) tamamen silinsin mi?\n\nOyuncunun tüm satırları gider: kimlik, skorlar, birincilikler, profil, kurtarma kodu. Aynı cihaz tekrar oynarsa yepyeni oyuncu olarak görünür.\n\nGERİ ALINAMAZ.`,
}

function fmtAgo(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ts) / 60_000))
  if (m < 60) return `${m} dk`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} sa`
  return `${Math.round(h / 24)} gün`
}

export function Names() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState<Filter>('')
  const [rows, setRows] = useState<PlayerRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(id)
  }, [q])

  const list = useQuery(`names ${debounced} ${status}`, () => api.names(debounced, status))
  useEffect(() => {
    if (list.data) setRows(list.data.rows)
  }, [list.data])

  const act = async (row: PlayerRow, action: NameAction) => {
    const ask = CONFIRM[action]
    if (ask && !window.confirm(ask(row))) return
    setBusy(row.hash)
    setError(null)
    try {
      const fresh = await api.act(row.hash, action)
      setRows((current) =>
        fresh ? (current?.map((r) => (r.hash === fresh.hash ? fresh : r)) ?? null) : (current?.filter((r) => r.hash !== row.hash) ?? null),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Olmadı')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <section className="card names">
        <header className="card-head">
          <h3>
            Oyuncu adları{' '}
            <span className="muted">
              {list.data ? `- ${list.data.total} oyuncu${list.data.total > (rows?.length ?? 0) ? `, ilk ${rows?.length}` : ''}` : ''}
            </span>
          </h3>
          <div className="names-tools">
            <div className="seg" role="tablist" aria-label="Durum">
              {FILTERS.map((f) => (
                <button key={f.id} role="tab" aria-selected={status === f.id} className={status === f.id ? 'on' : ''} title={f.title} onClick={() => setStatus(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <input
              className="names-search"
              type="search"
              placeholder="ad ya da kısa jeton…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Ara"
            />
          </div>
        </header>

        {error && <div className="banner error">{error}</div>}
        {list.error ? (
          <div className="chart-empty">{list.error}</div>
        ) : rows && rows.length === 0 ? (
          <div className="chart-empty">
            {status === 'orphan' ? 'Öksüz aday yok (1 yıldır koşusuz ve birinciliksiz oyuncu)' : status === 'suspect' ? 'Şüpheli oyuncu yok - puan/satır eşiğin altında, dakikalık sınıra dayanan yok' : debounced || status ? 'Eşleşen oyuncu yok' : 'Henüz oyuncu yok - ilk koşu gelince burada görünür'}
          </div>
        ) : (
          <table className="names-table">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Jeton</th>
                <th>Rozet</th>
                <th className="num">Koşu</th>
                <th className="num" title="Bitmiş haftalarda birincilik">1.</th>
                <th>Son</th>
                <th>Durum</th>
                <th className="acts">Eylem</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row) => (
                <tr key={row.hash} className={row.status !== 'ok' ? `st-${row.status}` : ''}>
                  <td className="name">
                    {row.suspect && (
                      <span
                        className="suspect"
                        title={`Şüpheli: ${row.suspect.ratio >= 1 ? `puan/satır eşiğin ${row.suspect.ratio}× üstünde` : ''}${row.suspect.ratio >= 1 && row.suspect.burst ? ' · ' : ''}${row.suspect.burst ? 'dakikada 8+ koşu' : ''} - curl ile yazılmış olabilir; bak, gerekirse Gizle`}
                        aria-label="şüpheli"
                      >
                        ⚠{' '}
                      </span>
                    )}
                    {row.name}
                    {row.rejectedName && (
                      <span className="muted rejected" title="Sıfırlandı - bu ad artık kabul edilmiyor">
                        {' '}
                        (eski: {row.rejectedName})
                      </span>
                    )}
                    {row.lastRejected && (
                      <span className="muted rejected" title="İstemcinin en son yolladığı, sunucunun reddettiği ham ad (filtre / rezerve / moderatör)">
                        {' '}
                        · reddedilen: «{row.lastRejected}»
                      </span>
                    )}
                    {row.resetAt && (
                      <span className="muted rejected" title={`Başarımlar sıfırlandı: ${new Date(row.resetAt).toLocaleString('tr-TR')}`}>
                        {' '}
                        · sıfırlandı
                      </span>
                    )}
                  </td>
                  <td className="mono" title={row.recovery ? 'Kurtarma kodu var' : 'Kurtarma kodu yok'}>
                    {row.short}
                    {row.recovery && <span className="pill tiny" title="Kurtarma kodu oluşturmuş"> kod</span>}
                  </td>
                  <td className="muted" title={row.badge ?? ''}>{badgeText(row.badge, row.badgeTier)}</td>
                  <td className="num mono">{row.runs}</td>
                  <td className="num mono">{row.firsts || '-'}</td>
                  <td className="muted" title={`son: ${new Date(row.lastSeen).toLocaleString('tr-TR')} · ilk: ${new Date(row.firstSeen).toLocaleString('tr-TR')}`}>
                    {fmtAgo(row.lastSeen)}
                  </td>
                  <td>
                    <span className={`pill ${row.status}`}>{STATUS_LABEL[row.status]}</span>
                  </td>
                  <td className="acts">
                    <button disabled={busy === row.hash || Boolean(row.rejectedName)} onClick={() => act(row, 'reset')} title="Ad yer tutucuya döner; eski ad reddedilir">
                      Sıfırla
                    </button>
                    <button disabled={busy === row.hash || row.status === 'shadow'} onClick={() => act(row, 'shadow')} title="Listeden düşer, kendisi fark etmez">
                      Gizle
                    </button>
                    <button className="danger" disabled={busy === row.hash || row.status === 'banned'} onClick={() => act(row, 'ban')} title="Koşuları yazılmaz">
                      Yasakla
                    </button>
                    {(row.status !== 'ok' || row.rejectedName) && (
                      <button className="undo" disabled={busy === row.hash} onClick={() => act(row, 'clear')} title="Durumu ve ad kısıtını kaldırır">
                        Geri al
                      </button>
                    )}
                    <span className="acts-sep" aria-hidden="true" />
                    <button className="danger" disabled={busy === row.hash} onClick={() => act(row, 'wipe')} title="Başarımları sıfırla: ad, rozet, skorlar, birincilikler, profil - cihaza da iner. Geri alınamaz.">
                      Sıfırla ✱
                    </button>
                    <button className="danger" disabled={busy === row.hash} onClick={() => act(row, 'delete')} title="Tüm satırları sil - öksüz kimlik temizliği. Geri alınamaz.">
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Words />

      <section className="card defs">
        <h2>Nasıl çalışıyor</h2>
        <dl>
          <dt>Sıfırla</dt>
          <dd>Ad "Oyuncu a1b2…9f" olur; eski ad kayda geçer ve oyuncu aynı adı yollamaya devam etse de kabul edilmez. Yeni bir ad seçerse geçer.</dd>
          <dt>⚠ Şüpheli</dt>
          <dd>Sunucu iki ucuz frenle işaretler: haftalık satırlarından birinde puan/satır mod eşiğinin üstünde (Av/Kaçış 8, Üçlü 12, Günlük 60 - gerçek oyunda görülenin ~2 katı) ya da son dakikada 8+ koşu (sınır aşımı zaten düşürülür). Motorun veremeyeceği puan (satır başına 80/100/1000 üstü) hiç yazılmaz. Kesin kanıt değil, bakılacak aday.</dd>
          <dt>Gizle</dt>
          <dd>Oyuncu haftalık listede görünmez ama kendi sırasını görmeye devam eder - gölgeleme, itiraz doğurmasın diye.</dd>
          <dt>Yasakla</dt>
          <dd>Koşuları hiç yazılmaz; istemci farkı görmez (204).</dd>
          <dt>Sıfırla ✱ (başarımlar)</dt>
          <dd>Geri alınamaz, onay ister. Ad yer tutucuya döner ve reddedilir, rozet düşer, tüm haftalık skorlar ve birincilikler silinir, sunucu profili boşalır ve <code>reset_at</code> dolar: oyuncunun cihazı bir sonraki açılışta rozet/sayaç/defterini de siler. Durum (gizli/yasaklı) korunur - ceza, af değil.</dd>
          <dt>Sil</dt>
          <dd>Geri alınamaz, onay ister. Oyuncunun tüm <code>lb_*</code> satırları gider. Silinen tarayıcı verisinden kalan öksüz kimlikler için; aynı cihaz tekrar oynarsa yeni oyuncu olur.</dd>
          <dt>Öksüz</dt>
          <dd>Süreye göre otomatik silme YOK - "10 gün oynamadı" ile "verisi silindi, dönmeyecek" ayırt edilemez, dönen oyuncu kaldığı yerden devam eder. Filtre 1 yıldır koşusuz ve hiç birinciliksiz oyuncuları listeler; silme elle. Şişkinlik takvim verisinde çözülür: günlük nabız 35 gün, haftalık satırlar ~8 hafta (ilk üçler önce arşive).</dd>
          <dt>Reddedilen ad</dt>
          <dd>Oyuncu "Oyuncu a1b2…9f" görünüyorsa istemcinin yolladığı ad sunucu filtresine takılmıştır (yasaklı kök, rezerve ad, <code>#</code>, ya da moderatörün reddettiği ad). En son reddedilen ham ad adın yanında «…» içinde. Oyuncu tarafı da ayarlarda "sunucu bu adı kabul etmedi" görür.</dd>
          <dt>kod</dt>
          <dd>Oyuncu kurtarma kodu oluşturmuş: tarayıcı verisi silinse de kodla aynı kimliğe döner. Panel kodu göremez (sunucuda yalnızca kör blob).</dd>
          <dt>Kısıtlar</dt>
          <dd>Ad değişikliği günde 3 · 24 karakter · <code>#</code> ve görünmez karakterler atılır · ChessRun / SmartKraft rezerve · yasaklı kökler istemcide ve sunucuda.</dd>
          <dt>Jeton</dt>
          <dd>Ham cihaz jetonu bu panele hiç gelmez; satırlar SHA-256 hash'iyle anahtarlanır, gösterim kısa hâl.</dd>
        </dl>
      </section>
    </>
  )
}

/** Yasaklı kelimeler - tek metin kutusu, satır başına bir kelime */
function Words() {
  const words = useQuery('words', () => api.words())
  const [text, setText] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const value = text ?? words.data?.words.join('\n') ?? ''
  const dirty = text != null && text !== (words.data?.words.join('\n') ?? '')

  const save = async () => {
    setError(null)
    try {
      const res = await api.setWords(value.split(/\r?\n/))
      setText(res.words.join('\n'))
      setSaved(`${res.words.length} kelime kaydedildi`)
      setTimeout(() => setSaved(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Olmadı')
    }
  }

  return (
    <section className="card words">
      <header className="card-head">
        <h3>
          Yasaklı kelimeler <span className="muted">- ek liste, kök hâlinde, satır başına bir</span>
        </h3>
        <div className="names-tools">
          {saved && <span className="muted">{saved}</span>}
          {error && <span className="bad-text">{error}</span>}
          <button className="primary" disabled={!dirty} onClick={save}>
            Kaydet
          </button>
        </div>
      </header>
      <textarea
        className="words-box"
        rows={6}
        value={value}
        onChange={(e) => setText(e.target.value)}
        placeholder={'örnek\nkelime'}
        spellCheck={false}
      />
      <p className="foot">
        Kısa kökler (&lt; 6 harf) yalnızca kelime başında, uzunlar her yerde eşleşir; aksan ve l33t (0→o, 1→i, 3→e, @→a…) çözülür.
        Yerleşik liste ({BASE_BANNED.length} kök, beş dil) her zaman açık; buradaki liste ona eklenir. Değişiklik en geç 5 dakikada etkin.
      </p>
    </section>
  )
}
