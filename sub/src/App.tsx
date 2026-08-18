import type { Period } from '@shared/events'
import { rangeOf } from '@shared/period'
import { useEffect, useState } from 'react'
import { api } from './api'
import { PERIOD_LABEL, fmtRange } from './format'
import { type Route, isFuture, parseHash, shift, toHash, todayUtc } from './period'
import { Dashboard } from './pages/Dashboard'
import { Names } from './pages/Names'
import { Stats } from './pages/Stats'
import { useQuery } from './useQuery'
import './theme.css'

/**
 * Kabuk: başlık, sayfa sekmeleri, dönem seçici, gezinme.
 *
 * Router kütüphanesi yok — üç sayfa için `location.hash`; oyunun
 * `App.tsx`'i de sayfaları aynı şekilde `useState` ile tutuyor. Hash'te
 * dönem ve tarih de var: sekme yenilenince görünüm kaybolmuyor, geri tuşu
 * çalışıyor, bir görünüm başkasına gönderilebiliyor.
 */
const NAV: Array<{ id: Route['page']; label: string }> = [
  { id: 'dashboard', label: 'Özet' },
  { id: 'stats', label: 'İstatistik' },
  { id: 'names', label: 'Adlar' },
]
const PERIODS: Period[] = ['day', 'week', 'month', 'year']

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash))

  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash))
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const go = (next: Partial<Route>) => {
    location.hash = toHash({ ...route, ...next })
  }

  const health = useQuery('health', () => api.health())
  const stale =
    health.data?.lastRollupDay != null && shift('day', health.data.lastRollupDay, 1) < todayUtc()

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="brand-num">1403</span>
          <span className="brand-name">ChessRun</span>
        </div>
        <nav className="tabs" aria-label="Sayfalar">
          {NAV.map((n) => (
            <a key={n.id} href={toHash({ ...route, page: n.id })} className={route.page === n.id ? 'on' : ''} aria-current={route.page === n.id ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="health" title={health.data ? `Son toplama: ${health.data.lastRollupDay ?? '—'} · ham satır: ${health.data.rawRows}` : ''}>
          <span className={`dot ${health.error ? 'bad' : stale ? 'warn' : 'ok'}`} aria-hidden="true" />
          <span className="muted">
            {health.error ? 'Worker yok' : stale ? 'Toplama gecikti' : health.data ? 'Canlı' : '…'}
          </span>
        </div>
      </header>

      {route.page !== 'names' && (
      <div className="controls">
        <div className="seg" role="tablist" aria-label="Dönem">
          {PERIODS.map((p) => (
            <button key={p} role="tab" aria-selected={route.period === p} className={route.period === p ? 'on' : ''} onClick={() => go({ period: p })}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="nav-range">
          <button className="arrow" onClick={() => go({ at: shift(route.period, route.at, -1) })} aria-label="Önceki dönem">‹</button>
          <button className="range" onClick={() => go({ at: todayUtc() })} title="Bugüne dön">
            <RangeLabel period={route.period} at={route.at} />
          </button>
          <button
            className="arrow"
            onClick={() => go({ at: shift(route.period, route.at, 1) })}
            disabled={isFuture(shift(route.period, route.at, 1))}
            aria-label="Sonraki dönem"
          >
            ›
          </button>
        </div>
      </div>
      )}

      <main>
        {route.page === 'dashboard' ? (
          <Dashboard period={route.period} at={route.at} />
        ) : route.page === 'stats' ? (
          <Stats period={route.period} at={route.at} />
        ) : (
          <Names />
        )}
      </main>

      <footer className="foot-bar muted">
        Ham veri 35 gün, günlük toplamlar kalıcı · IP ve cihaz jetonu hiç saklanmaz · bir SmartKraft projesi
      </footer>
    </div>
  )
}

/** Aralık sunucuyla aynı saf fonksiyondan (shared/period) — ekstra istek yok */
function RangeLabel({ period, at }: { period: Period; at: string }) {
  const r = rangeOf(period, at)
  return <>{fmtRange(r.from, r.to)}</>
}
