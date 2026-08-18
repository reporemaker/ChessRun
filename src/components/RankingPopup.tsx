import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameMode } from '../engine/types'
import { MODES } from '../ui/modes'
import { leaderboardEnabled } from '../ui/leaderboard'
import { type RankingView, demoRanking, fetchRanking, readRanking } from '../ui/ranking'
import { formatRemaining, isoWeekKey, weekEnd } from '../ui/scores'
import { useSettings } from '../ui/settings'
import { useT } from '../ui/text'
import { BadgeGlyph } from './BadgeGlyph'

interface Props {
  onClose: () => void
  /** Açılışta seçili mod — oyundan açıldıysa oynanan mod */
  mode?: GameMode
  /** Yalnızca DEV: sunucu gelmeden gerçek görünüm için örnek tablo */
  demo?: boolean
}

/**
 * Haftalık sıralama — kendi penceresi.
 *
 * Ayarlar penceresinin içine gömülü liste dar ve kısa kalıyordu; sıralama
 * oyunun sosyal yüzü, kendi sahnesini hak ediyor. Düzen: mod sekmeleri ·
 * hafta sayacı · üç sayı · liste (ilk üç renkli, "sen" satırı vurgulu) ·
 * listede değilsen altta yapışık kendi satırın. Yalnızca haftalık lig.
 *
 * Sunucu bağlanana kadar liste kendi koşuların (ranking.ts dürüst davranıyor:
 * sıra ve oyuncu sayısı bilinmiyor). Rozet glifi için ad yanında yer var —
 * rozet sistemi gelince dolacak.
 */
export function RankingPopup({ onClose, mode: initialMode, demo = false }: Props) {
  const t = useT()
  const { lang } = useSettings()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [mode, setMode] = useState<GameMode>(initialMode ?? 'classic')

  const local: RankingView = useMemo(() => (demo ? demoRanking(mode) : readRanking(mode)), [demo, mode])
  const [remote, setRemote] = useState<RankingView | null>(null)
  const [offline, setOffline] = useState(false)

  /* Sunucu görünümü: yerel liste anında çiziliyor, cevap gelince yerini
     alıyor. Mod değişince eski cevap kalmasın diye sıfırlanıyor; geç gelen
     cevap `alive` bayrağıyla düşüyor. Sunucu yoksa hiç istek yok. */
  useEffect(() => {
    setRemote(null)
    setOffline(false)
    if (demo || !leaderboardEnabled) return
    let alive = true
    void fetchRanking(mode).then((v) => {
      if (!alive) return
      if (v) setRemote(v)
      else setOffline(true)
    })
    return () => {
      alive = false
    }
  }, [demo, mode])

  const view = remote ?? local

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const now = new Date()
  const week = isoWeekKey(now)
  const endsIn = formatRemaining(weekEnd(now).getTime() - now.getTime())
  const meRow = view.rows.find((row) => row.me)
  const meOutside = !view.pending && view.rank != null && !meRow

  return (
    <div
      className="pop-back"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="pop rank" role="dialog" aria-modal="true" aria-label={t('rank.title')}>
        <div className="pop-hd">
          <span className="pop-ttl">
            {t('rank.title')}
            <small>{week}</small>
          </span>
          <button
            type="button"
            className="pop-x"
            ref={closeRef}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        <div className="pop-bd rank-bd">
          {/* Mod sekmeleri: skorlar modlar arası kıyaslanmaz, tablo mod başına */}
          <div className="rank-modes" role="tablist" aria-label={t('settings.ranking')}>
            {MODES.filter((entry) => entry.ready).map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={mode === entry.id}
                className={mode === entry.id ? 'on' : ''}
                onClick={() => setMode(entry.id)}
              >
                <span className="rank-glyph">{entry.glyph}</span>
                {t(entry.nameKey)}
              </button>
            ))}
          </div>

          <div className="rank-me">
            <span>
              <b className="gold">{view.rank == null ? '—' : `#${view.rank}`}</b>
              <small>{t('settings.rankMine')}</small>
            </span>
            <span>
              <b>{view.score.toLocaleString(lang)}</b>
              <small>{t('settings.scoreMine')}</small>
            </span>
            <span>
              <b>{view.players == null ? '—' : view.players.toLocaleString(lang)}</b>
              <small>{t('settings.players')}</small>
            </span>
          </div>

          <ol className="rank-list">
            {view.rows.length === 0 && <li className="rank-empty">{t('settings.empty')}</li>}
            {view.rows.map((row) => (
              <li
                key={row.at}
                className={`rank-row${row.me ? ' me' : ''}${row.place <= 3 ? ` p${row.place}` : ''}`}
              >
                <span className="rank-pos">{row.place}</span>
                <span className="rank-name">
                  {/* Rozet yeri her satırda sabit: glif yoksa boş kalır, adlar hizada durur */}
                  {row.badge ? (
                    <BadgeGlyph id={row.badge} className={`rank-badge${row.badgeTier ? ` t-${row.badgeTier}` : ''}`} />
                  ) : (
                    <i className="rank-badge" aria-hidden="true" />
                  )}
                  <b>{row.name}</b>
                  {row.me && <em>{t('settings.you')}</em>}
                </span>
                <span className="rank-dist">
                  {row.distance}
                  <small>{t('rank.rows')}</small>
                </span>
                <span className="rank-score">{row.score.toLocaleString(lang)}</span>
              </li>
            ))}
          </ol>

          {/* Listede değilsen kendi satırın altta yapışık — "ben neredeyim"
              sorusu kaydırmadan cevaplansın */}
          {meOutside && (
            <div className="rank-row me sticky">
              <span className="rank-pos">{view.rank}</span>
              <span className="rank-name">
                <b>{t('settings.you')}</b>
              </span>
              <span className="rank-dist" />
              <span className="rank-score">{view.score.toLocaleString(lang)}</span>
            </div>
          )}

          {/* Geçen haftanın ilk üçü — kürsü. Sıra 2·1·3: ortadaki en yüksek.
              Sunucu (Faz 9) gelince dolacak; şimdilik yalnızca demo. */}
          {view.lastWeek && (
            <div className="rank-last">
              <span className="rank-last-lb">
                {t('rank.lastWeek')} <small>{view.lastWeek.week}</small>
              </span>
              <ol className="rank-podium">
                {[2, 1, 3].map((place) => {
                  const row = view.lastWeek!.rows.find((r) => r.place === place)
                  if (!row) return null
                  return (
                    <li key={place} className={`p${place}`}>
                      <span className="pd-name">
                        {row.badge && (
                          <BadgeGlyph id={row.badge} className={`rank-badge${row.badgeTier ? ` t-${row.badgeTier}` : ''}`} />
                        )}
                        <b>{row.name}</b>
                      </span>
                      <span className="pd-score">{row.score.toLocaleString(lang)}</span>
                      <span className="pd-step">
                        {place === 1 && <i className="pd-crown" aria-hidden="true">♛</i>}
                        <span className="pd-num">{place}</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          {/* En alt: hafta sayacı ortada, varsa not altında */}
          <div className="rank-ft">
            <span className="rank-ends">{t('rank.endsIn', { t: endsIn })}</span>
            {demo ? (
              <span className="rank-note demo">{t('rank.demo')}</span>
            ) : !view.pending ? null : !leaderboardEnabled ? (
              <span className="rank-note">{t('rank.local')}</span>
            ) : offline ? (
              <span className="rank-note">{t('rank.offline')}</span>
            ) : (
              <span className="rank-note">{t('rank.loading')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
