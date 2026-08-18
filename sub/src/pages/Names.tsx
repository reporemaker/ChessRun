import type { NameAction, PlayerRow, PlayerStatus } from '@shared/leaderboard'
import { BASE_BANNED } from '@shared/names'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { useQuery } from '../useQuery'

/**
 * Adlar — haftalık sıralamadaki oyuncu adlarının moderasyonu.
 *
 * Üç eylem, hepsi geri alınabilir: Sıfırla (ad yer tutucuya döner, eski ad
 * bir daha kabul edilmez) · Gizle (listeden düşer, kendisi fark etmez) ·
 * Yasakla (koşuları yazılmaz). Alt kısımda yasaklı kelime listesi —
 * `shared/names` kök listesiyle birleşip istemcide ve sunucuda çalışıyor.
 *
 * Panel ham jetonu görmüyor: satır anahtarı SHA-256 hash, gösterim kısa
 * jeton. Tabloda oyuncunun GÜNCEL adı; oyuncu ad değiştirirse burada da
 * değişir.
 */

const STATUS_LABEL: Record<PlayerStatus, string> = { ok: 'açık', shadow: 'gizli', banned: 'yasaklı' }
const FILTERS: Array<{ id: PlayerStatus | ''; label: string }> = [
  { id: '', label: 'Hepsi' },
  { id: 'ok', label: 'Açık' },
  { id: 'shadow', label: 'Gizli' },
  { id: 'banned', label: 'Yasaklı' },
]

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
  const [status, setStatus] = useState<PlayerStatus | ''>('')
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
    setBusy(row.hash)
    setError(null)
    try {
      const fresh = await api.act(row.hash, action)
      setRows((current) => current?.map((r) => (r.hash === fresh.hash ? fresh : r)) ?? null)
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
              {list.data ? `— ${list.data.total} oyuncu${list.data.total > (rows?.length ?? 0) ? `, ilk ${rows?.length}` : ''}` : ''}
            </span>
          </h3>
          <div className="names-tools">
            <div className="seg" role="tablist" aria-label="Durum">
              {FILTERS.map((f) => (
                <button key={f.id} role="tab" aria-selected={status === f.id} className={status === f.id ? 'on' : ''} onClick={() => setStatus(f.id)}>
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
          <div className="chart-empty">{debounced || status ? 'Eşleşen oyuncu yok' : 'Henüz oyuncu yok — ilk koşu gelince burada görünür'}</div>
        ) : (
          <table className="names-table">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Jeton</th>
                <th>Rozet</th>
                <th className="num">Koşu</th>
                <th>Son</th>
                <th>Durum</th>
                <th className="acts">Eylem</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row) => (
                <tr key={row.hash} className={row.status !== 'ok' ? `st-${row.status}` : ''}>
                  <td className="name">
                    {row.name}
                    {row.rejectedName && (
                      <span className="muted rejected" title="Sıfırlandı — bu ad artık kabul edilmiyor">
                        {' '}
                        (eski: {row.rejectedName})
                      </span>
                    )}
                  </td>
                  <td className="mono">{row.short}</td>
                  <td className="mono muted">{row.badge ?? '—'}</td>
                  <td className="num mono">{row.runs}</td>
                  <td className="muted" title={new Date(row.lastSeen).toLocaleString('tr-TR')}>
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
          <dt>Gizle</dt>
          <dd>Oyuncu haftalık listede görünmez ama kendi sırasını görmeye devam eder — gölgeleme, itiraz doğurmasın diye.</dd>
          <dt>Yasakla</dt>
          <dd>Koşuları hiç yazılmaz; istemci farkı görmez (204).</dd>
          <dt>Kısıtlar</dt>
          <dd>Ad değişikliği günde 3 · 24 karakter · <code>#</code> ve görünmez karakterler atılır · ChessRun / SmartKraft rezerve · yasaklı kökler istemcide ve sunucuda.</dd>
          <dt>Jeton</dt>
          <dd>Ham cihaz jetonu bu panele hiç gelmez; satırlar SHA-256 hash'iyle anahtarlanır, gösterim kısa hâl.</dd>
        </dl>
      </section>
    </>
  )
}

/** Yasaklı kelimeler — tek metin kutusu, satır başına bir kelime */
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
          Yasaklı kelimeler <span className="muted">— ek liste, kök hâlinde, satır başına bir</span>
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
