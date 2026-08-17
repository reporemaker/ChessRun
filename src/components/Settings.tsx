import { useEffect, useMemo, useRef, useState } from 'react'
import { COL_CHOICES } from '../engine/config'
import { feedbackHref } from '../ui/feedback'
import { getIdentity, shortToken } from '../ui/identity'
import { LANGS, hasFullProse } from '../ui/i18n'
import { GLYPH } from '../ui/pieces'
import { readRanking } from '../ui/ranking'
import { setCols, setLang, setPieceColor, setSound, useSettings } from '../ui/settings'
import { useT } from '../ui/text'
import { APP_VERSION } from '../ui/version'
import { NameChip } from './NameChip'

/**
 * Oyun sürerken pencere açıldıysa App bunu geçiriyor: koridor değişimi
 * mevcut koşuyu etkilesin mi sorusu buradan cevaplanıyor.
 */
export interface LiveGame {
  /** Günlük meydan okumada genişlik sabit — soru sorulmaz, ayar sonrakine kalır */
  daily: boolean
  /** Uyarı metnindeki puan */
  score: () => number
  /** Onaylanırsa: mevcut koşu deftere yazılır, yeni genişlikte baştan kurulur */
  restart: (cols: number) => void
}

interface SettingsProps {
  onClose: () => void
  onOpenPage: (page: 'help' | 'about') => void
  /** Oyun sürüyorsa menüye dönüş bağlantısı — mobilde tek çıkış yolu */
  onExitGame?: () => void
  onOpenRanking: () => void
  game?: LiveGame
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
export function Settings({ onClose, onOpenPage, onExitGame, onOpenRanking, game }: SettingsProps) {
  const settings = useSettings()
  const t = useT()
  const closeRef = useRef<HTMLButtonElement>(null)

  const ranking = useMemo(() => readRanking('week'), [])

  const [identity, setIdentity] = useState(() => getIdentity())

  // Koridor: oyun sürerken seçilen genişlik önce burada bekler, onay ister
  const [pendingCols, setPendingCols] = useState<number | null>(null)

  function pickCols(cols: number) {
    if (cols === settings.cols) return
    // Oyun sürüyor ve genişlik o oyunu etkileyecekse önce sor
    if (game && !game.daily) {
      setPendingCols(cols)
      return
    }
    setCols(cols)
  }

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

          {/* A2 · koridor + B · ses — aynı satırda, iki sütun.
              Koridor oyunu etkileyen tek ayar; ses küçük bir anahtar.
              İkisini yan yana koymak bir satır kazandırıyor. */}
          <div className="pop-lin two">
            <div className="pop-col">
              <span className="pop-k">
                {t('settings.corridor')}
                <small>
                  {t('settings.corridorHint')} · {t('corridor.cols', { n: settings.cols })}
                </small>
              </span>
              <span className="pop-sw cols" role="radiogroup" aria-label={t('settings.corridor')}>
                {COL_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    className={(pendingCols ?? settings.cols) === n ? 'on' : ''}
                    aria-checked={(pendingCols ?? settings.cols) === n}
                    onClick={() => pickCols(n)}
                  >
                    {n}
                  </button>
                ))}
              </span>
            </div>
            <div className="pop-col end">
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
          </div>

          {/* Koridor uyarısı: oyun sürerken genişlik değişecekse. Puan
              kaybolmuyor, kapanıyor — mevcut koşu deftere yazılıyor. */}
          {pendingCols != null && game && (
            <div className="pop-warn" role="alertdialog" aria-live="polite">
              <b>{t('corridor.restart.title')}</b>
              <p>{t('corridor.restart.body', { score: game.score(), n: pendingCols })}</p>
              <div className="pop-warn-act">
                <button type="button" onClick={() => setPendingCols(null)}>
                  {t('corridor.restart.cancel')}
                </button>
                <button
                  type="button"
                  className="go"
                  onClick={() => {
                    const cols = pendingCols
                    setPendingCols(null)
                    setCols(cols)
                    game.restart(cols)
                  }}
                >
                  {t('corridor.restart.ok')}
                </button>
              </div>
            </div>
          )}

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

          {/* G · künye — ad düzenlenebilir (NameChip). Tekillik yok, hijyen var:
              bkz. identity.ts cleanName. */}
          <div className="pop-chips">
            <span className="pop-chip">
              v<b>{APP_VERSION}</b>
            </span>
            <span className="pop-chip">
              #<b>{shortToken(identity.token)}</b>
            </span>
            <NameChip identity={identity} onChange={setIdentity} skin="pop" />
          </div>

          {/* rozetler sekizinci bölüm olarak buraya gelecek */}
          <div className="pop-future">↓ {t('settings.badgesSoon')} ↓</div>
          {/* D · ayraç */}
          <div className="pop-dv">{t('settings.ranking')}</div>

          {/* E · sıralama özeti — tam liste kendi penceresinde */}
          <button type="button" className="pop-trio" onClick={onOpenRanking}>
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
            <span>{t('settings.openFull')}</span>
            {ranking.pending && <span className="pend">{t('settings.serverPending')}</span>}
          </div>

          {/* ayraç */}
          <div className="pop-dv">{t('settings.info')}</div>

          {/* F · üç düğme: Hakkında · Nasıl oynanır · Öneri (mailto — form değil,
              bkz. ui/feedback.ts). Adres Hakkında sayfasında yazılı. */}
          <div className="pop-links three">
            <button type="button" onClick={() => onOpenPage('about')}>
              {t('settings.about')}
            </button>
            <button type="button" onClick={() => onOpenPage('help')}>
              {t('settings.howTo')}
            </button>
            <a href={feedbackHref(settings.lang)}>{t('settings.feedback')}</a>
          </div>
        </div>
      </div>
    </div>
  )
}
