import { useEffect, useMemo, useRef, useState } from 'react'
import { COL_CHOICES } from '../engine/config'
import { feedbackHref } from '../ui/feedback'
import { NAME_MAX, getIdentity, renameIdentity, shortToken } from '../ui/identity'
import { type Lang, LANGS, hasFullProse, localeOf } from '../ui/i18n'
import { GLYPH } from '../ui/pieces'
import { type RankScope, readRanking } from '../ui/ranking'
import { setCols, setLang, setPieceColor, setSound, useSettings } from '../ui/settings'
import { useT } from '../ui/text'
import { APP_VERSION, CONTACT_MAIL } from '../ui/version'

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
  game?: LiveGame
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
export function Settings({ onClose, onOpenPage, onExitGame, game }: SettingsProps) {
  const settings = useSettings()
  const t = useT()
  const closeRef = useRef<HTMLButtonElement>(null)

  const [showList, setShowList] = useState(false)
  const [scope, setScope] = useState<RankScope>('allTime')
  const ranking = useMemo(() => readRanking(scope), [scope])

  // Ad düzenleme: kalem → satır içi giriş. Kaydet/İptal/Rastgele.
  const [identity, setIdentity] = useState(() => getIdentity())
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Koridor: oyun sürerken seçilen genişlik önce burada bekler, onay ister
  const [pendingCols, setPendingCols] = useState<number | null>(null)

  useEffect(() => {
    if (editingName) nameRef.current?.select()
  }, [editingName])

  function startEditName() {
    setNameDraft(identity.name)
    setNameError(false)
    setEditingName(true)
  }

  function saveName(raw: string) {
    const next = renameIdentity(raw)
    if (!next) {
      setNameError(true)
      return
    }
    setIdentity(next)
    setEditingName(false)
    setNameError(false)
  }

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

          {/* Öneri: mailto, form değil (bkz. ui/feedback.ts). Adres metin
              olarak da duruyor — masaüstünde webmail kullananlarda mailto
              hiçbir şey açmayabilir, o zaman kopyalar. */}
          <a className="pop-feedback" href={feedbackHref(settings.lang)}>
            <span>{t('settings.feedback')}</span>
            <small>{CONTACT_MAIL}</small>
          </a>

          {/* G · künye — ad düzenlenebilir (kalem). Tekillik yok, hijyen var:
              bkz. identity.ts cleanName. */}
          {editingName ? (
            <form
              className="pop-name"
              onSubmit={(event) => {
                event.preventDefault()
                saveName(nameDraft)
              }}
            >
              <input
                ref={nameRef}
                value={nameDraft}
                maxLength={NAME_MAX}
                autoComplete="off"
                autoCapitalize="words"
                spellCheck={false}
                aria-label={t('name.edit')}
                aria-invalid={nameError}
                onChange={(event) => {
                  setNameDraft(event.target.value)
                  setNameError(false)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditingName(false)
                }}
              />
              <button type="submit" className="go">
                {t('name.save')}
              </button>
              <button type="button" onClick={() => saveName('')} title={t('name.random')}>
                ⟳
              </button>
              <button type="button" onClick={() => setEditingName(false)}>
                ×
              </button>
              <small className={nameError ? 'err' : ''}>
                {nameError ? t('name.invalid') : t('name.hint', { n: NAME_MAX })}
              </small>
            </form>
          ) : (
            <div className="pop-chips">
              <span className="pop-chip">
                v<b>{APP_VERSION}</b>
              </span>
              <span className="pop-chip">
                #<b>{shortToken(identity.token)}</b>
              </span>
              <button
                type="button"
                className="pop-chip name"
                onClick={startEditName}
                aria-label={t('name.edit')}
                title={t('name.edit')}
              >
                <b>{identity.name}</b>
                <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                  <path
                    d="M11.3 1.7a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L5.5 13.5 1.5 14.5l1-4z M9.8 3.2l3 3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* rozetler sekizinci bölüm olarak buraya gelecek */}
          <div className="pop-future">↓ {t('settings.badgesSoon')} ↓</div>
        </div>
      </div>
    </div>
  )
}
