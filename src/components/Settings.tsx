import { useEffect, useMemo, useRef, useState } from 'react'
import { CORRIDORS, colsOfCorridor } from '../engine/config'
import { getIdentity, shortToken } from '../ui/identity'
import { type Lang, LANGS, hasFullProse, localeOf } from '../ui/i18n'
import { GLYPH } from '../ui/pieces'
import { type RankScope, readRanking } from '../ui/ranking'
import { setCorridor, setLang, setPieceColor, setSound, useSettings } from '../ui/settings'
import { useT } from '../ui/text'
import { APP_VERSION } from '../ui/version'

interface SettingsProps {
  onClose: () => void
  onOpenPage: (page: 'help' | 'about') => void
  /** Oyun sürüyorsa menüye dönüş bağlantısı — mobilde tek çıkış yolu */
  onExitGame?: () => void
}

/** Koşu tarihi, seçili dilin takvim biçiminde: 16.08 · 14:32 */
function dateLabel(at: string, lang: Lang): string {
  const date = new Date(at)
  return date.toLocaleString(localeOf(lang), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Ayarlar penceresi — kararlaştırılmış formlarında:
 * taş rengi ve koridor (segment), ses (anahtar), dil (kod ızgarası),
 * ayraç (başlıklı), sıralama (üç sayı + açılır liste), bağlantılar (iki
 * düğme), künye (rozetler).
 *
 * Koridor ana sayfadan buraya taşındı ve ham sayı olmaktan çıktı: oyuncuya
 * "4 mü 5 mi" diye sormak bir şey ifade etmiyordu, "dar mı geniş mi" ediyor.
 *
 * Rozetler son bölüm olarak gelecek; yeri altta kesik çizgiyle duruyor.
 */
export function Settings({ onClose, onOpenPage, onExitGame }: SettingsProps) {
  const settings = useSettings()
  const t = useT()
  const closeRef = useRef<HTMLButtonElement>(null)

  const [showList, setShowList] = useState(false)
  const [scope, setScope] = useState<RankScope>('allTime')
  const ranking = useMemo(() => readRanking(scope), [scope])
  const identity = useMemo(() => getIdentity(), [])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const langName = LANGS.find((entry) => entry.code === settings.lang)?.name ?? ''

  return (
    <div
      className="pop-back"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="pop" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <div className="pop-hd">
          <span className="pop-ttl">{t('settings.title')}</span>
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

        <div className="pop-bd">
          {onExitGame && (
            <button type="button" className="pop-exit" onClick={onExitGame}>
              ← {t('game.toMenu')}
            </button>
          )}

          {/* A · taş rengi */}
          <div className="pop-lin">
            <span className="pop-k">
              {t('settings.pieceColor')}
              <small>{t('settings.pieceColorHint')}</small>
            </span>
            <span className="pop-sw">
              {(['w', 'b'] as const).map((color) => (
                <button
                  key={color}
                  type="button"
                  className={settings.pieceColor === color ? 'on' : ''}
                  aria-pressed={settings.pieceColor === color}
                  onClick={() => setPieceColor(color)}
                >
                  <span className={`pop-pc ${color === 'w' ? 'white' : 'black'}`}>{GLYPH.p}</span>
                  {color === 'w' ? t('settings.white') : t('settings.black')}
                </button>
              ))}
            </span>
          </div>

          {/* A2 · koridor — oyunu etkileyen tek ayar, o yüzden en üstte */}
          <div className="pop-lin">
            <span className="pop-k">
              {t('settings.corridor')}
              <small>
                {t('settings.corridorHint')} ·{' '}
                {t('corridor.cols', { n: colsOfCorridor(settings.corridor) })}
              </small>
            </span>
            <span className="pop-sw">
              {CORRIDORS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={settings.corridor === entry.id ? 'on' : ''}
                  aria-pressed={settings.corridor === entry.id}
                  onClick={() => setCorridor(entry.id)}
                >
                  {t(`corridor.${entry.id}`)}
                </button>
              ))}
            </span>
          </div>

          {/* B · ses */}
          <div className="pop-lin">
            <span className="pop-k">
              {t('settings.sound')}
              <small>{t('settings.soundHint')}</small>
            </span>
            <button
              type="button"
              className={`pop-tg ${settings.sound ? 'on' : ''}`}
              role="switch"
              aria-checked={settings.sound}
              aria-label={t('settings.sound')}
              onClick={() => setSound(!settings.sound)}
            >
              <i />
            </button>
          </div>

          {/* C · dil */}
          <div className="pop-field">
            <span className="pop-lbl">{t('settings.lang')}</span>
            <div className="pop-codes">
              {LANGS.map((entry) => (
                <button
                  key={entry.code}
                  type="button"
                  className={settings.lang === entry.code ? 'on' : ''}
                  aria-pressed={settings.lang === entry.code}
                  lang={entry.code}
                  title={entry.name}
                  onClick={() => setLang(entry.code)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="pop-codename">
              {t('settings.langPicked', { name: langName })}
              {!hasFullProse(settings.lang) && (
                <em className="pop-partial">{t('settings.langPartial')}</em>
              )}
            </div>
          </div>

          {/* D · ayraç */}
          <div className="pop-dv">{t('settings.ranking')}</div>

          {/* E · sıralama */}
          <button
            type="button"
            className="pop-trio"
            aria-expanded={showList}
            onClick={() => setShowList((open) => !open)}
          >
            <span>
              <span className="v gold num">{ranking.rank == null ? '—' : `#${ranking.rank}`}</span>
              <span className="l">{t('settings.rankMine')}</span>
            </span>
            <span>
              <span className="v num">{ranking.score}</span>
              <span className="l">{t('settings.scoreMine')}</span>
            </span>
            <span>
              <span className="v num">{ranking.players ?? '—'}</span>
              <span className="l">{t('settings.players')}</span>
            </span>
          </button>

          <div className="pop-trioft">
            <span>{showList ? t('settings.closeFull') : t('settings.openFull')}</span>
            {ranking.pending && <span className="pend">{t('settings.serverPending')}</span>}
          </div>

          {showList && (
            <div className="pop-full">
              <div className="pop-fh">
                {(['allTime', 'week'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={scope === key ? 'on' : ''}
                    onClick={() => setScope(key)}
                  >
                    {key === 'allTime' ? t('settings.listAllTime') : t('settings.listWeek')}
                  </button>
                ))}
              </div>

              <div className="pop-fl">
                {ranking.rows.length === 0 && <p className="pop-fempty">{t('settings.empty')}</p>}
                {ranking.rows.map((row) => (
                  <div key={row.at} className={`pop-fr ${row.me ? 'me' : ''}`}>
                    <span className="rk num">{row.place}</span>
                    {/* Sunucu yokken satırı tarih anlatıyor: liste kendi
                        koşuların, tekrar eden isim bir şey söylemiyordu */}
                    <b>
                      {ranking.pending ? dateLabel(row.at, settings.lang) : row.name}
                      {row.me && ` (${t('settings.you')})`}
                    </b>
                    <span className="num">{row.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ayraç */}
          <div className="pop-dv">{t('settings.info')}</div>

          {/* F · bağlantılar */}
          <div className="pop-links">
            <button type="button" onClick={() => onOpenPage('help')}>
              {t('settings.howTo')}
            </button>
            <button type="button" onClick={() => onOpenPage('about')}>
              {t('settings.about')}
            </button>
          </div>

          {/* G · künye */}
          <div className="pop-chips">
            <span className="pop-chip">
              v<b>{APP_VERSION}</b>
            </span>
            <span className="pop-chip">
              #<b>{shortToken(identity.token)}</b>
            </span>
            <span className="pop-chip">
              <b>{identity.name}</b>
            </span>
          </div>

          {/* rozetler sekizinci bölüm olarak buraya gelecek */}
          <div className="pop-future">↓ {t('settings.badgesSoon')} ↓</div>
        </div>
      </div>
    </div>
  )
}
