import { MODES, type Mode } from '@shared/events'
import type { WeeklyEntry } from '@shared/leaderboard'
import { isoWeekUtc, nextWeek, previousWeek, weekStartUtc } from '@shared/week'
import { api } from '../api'
import { BADGE_LABEL, TIER_LABEL } from '../badges'
import { useQuery } from '../useQuery'

/**
 * Lig - haftanın üç tablosu, oyuncunun gördüğü hâliyle (aynı SQL, aynı
 * sınır). Hafta gezinmesi hash'te (`week=2026-W34`); geçmiş haftalar
 * lb_weekly budanana kadar (~8 hafta) görünür, sonrası yalnızca lb_award
 * (birincilikler) - o da Adlar sayfasındaki "1." sütununda.
 */
const MODE_LABEL: Record<Mode, string> = { classic: 'Av', kingRun: 'Kaçış', trio: 'Üçlü', daily: 'Günün Mücadelesi' }

function fmtWeek(week: string): string {
  const start = new Date(weekStartUtc(week))
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const f = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${f(start)} – ${f(end)}`
}

interface Props {
  week?: string
  onWeek: (week: string) => void
}

export function League({ week, onWeek }: Props) {
  const current = isoWeekUtc(Date.now())
  const shown = week ?? current
  const q = useQuery(`league ${shown}`, () => api.league(shown))
  const boards = q.data?.boards ?? MODES.map((mode) => ({ mode, players: 0, entries: [] as WeeklyEntry[] }))

  return (
    <>
      <div className="controls">
        <div className="nav-range">
          <button className="arrow" onClick={() => onWeek(previousWeek(shown))} aria-label="Önceki hafta">‹</button>
          <button className="range" onClick={() => onWeek(current)} title="Bu haftaya dön">
            {shown} · {fmtWeek(shown)}
          </button>
          <button className="arrow" onClick={() => onWeek(nextWeek(shown))} disabled={shown >= current} aria-label="Sonraki hafta">›</button>
        </div>
        {shown === current && <span className="muted">bu hafta · canlı</span>}
        {shown < current && <span className="muted">bitmiş hafta · ilk üç arşivde</span>}
      </div>

      {q.error && <div className="banner error">{q.error}</div>}

      <div className="league-grid">
        {boards.map((board) => (
          <section className="card names" key={board.mode}>
            <header className="card-head">
              <h3>
                {MODE_LABEL[board.mode]} <span className="muted">- {board.players} oyuncu</span>
              </h3>
            </header>
            {board.entries.length === 0 ? (
              <div className="chart-empty">{q.loading ? '…' : 'Bu hafta bu ligde koşu yok'}</div>
            ) : (
              <table className="names-table league-table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Ad</th>
                    <th>Jeton</th>
                    <th className="num" title="Haftalık TOPLAM puan (her koşu eklenir)">Puan</th>
                    <th className="num" title="Bu haftaki koşu sayısı">Koşu</th>
                    <th className="num" title="En iyi tek koşu">En iyi</th>
                    <th className="num" title="Toplam satır">Mesafe</th>
                  </tr>
                </thead>
                <tbody>
                  {board.entries.map((e) => (
                    <tr key={e.token} className={e.place <= 3 ? `place-${e.place}` : ''}>
                      <td className="num mono">{e.place}</td>
                      <td className="name">
                        {e.badge && (
                          <span className={`badge-tag tier-${e.badgeTier ?? 'black'}`} title={`${BADGE_LABEL[e.badge]?.name ?? e.badge}${e.badgeTier ? ` · ${TIER_LABEL[e.badgeTier] ?? e.badgeTier}` : ''}`}>
                            {BADGE_LABEL[e.badge]?.glyph ?? e.badge}{' '}
                          </span>
                        )}
                        {e.name}
                      </td>
                      <td className="mono muted">{e.token}</td>
                      <td className="num mono">{e.score.toLocaleString('tr-TR')}</td>
                      <td className="num mono muted">{e.runs}</td>
                      <td className="num mono muted">{e.best.toLocaleString('tr-TR')}</td>
                      <td className="num mono muted">{e.distance.toLocaleString('tr-TR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>

      <section className="card defs">
        <h2>Nasıl çalışıyor</h2>
        <dl>
          <dt>Tablo</dt>
          <dd>Oyundaki sıralama penceresiyle aynı sorgu: hafta × mod, oyuncu başına o haftaki TOPLAM puan (her koşu eklenir; Koşu = sayısı, En iyi = tek koşu), ilk 12. Gizli ve yasaklı oyuncular yok.</dd>
          <dt>Hafta</dt>
          <dd>ISO hafta, UTC. Pazartesi 00:00'da yeni tablo. Bitmiş haftaların ilk üçü <code>lb_award</code>'a yazılır (her gece cron); haftalık satırlar ~8 hafta sonra silinir, günlük nabız 35 gün.</dd>
          <dt>Birincilik</dt>
          <dd>Aynı hafta×modda en az 2 oyuncu varsa 1. sıra birincilik sayılır - lig rozetleri (weekFirst · weekKing · emperor) buradan.</dd>
        </dl>
      </section>
    </>
  )
}
