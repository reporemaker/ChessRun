import { useEffect } from 'react'
import { getIdentity, shortToken } from '../ui/identity'
import type { StringKey } from '../ui/i18n'
import type { DemoId } from '../ui/demos'
import { MODES } from '../ui/modes'
import { MiniBoard } from './MiniBoard'
import { useT } from '../ui/text'
import { APP_VERSION, CONTACT_MAIL } from '../ui/version'

export type PageId = 'help' | 'about'

interface PageProps {
  page: PageId
  onClose: () => void
}

interface Section {
  titleKey: StringKey
  glyph?: string
  /** Madde anahtarı ya da [madde, yanında oynayan mini tahta] çifti */
  bodyKeys: Array<StringKey | [StringKey, DemoId]>
  /** Motorda henüz olmayan mod — bölüm "yakında" damgasıyla çiziliyor */
  soon?: boolean
}

// Animasyon anlattığı maddenin YANINDA duruyor (ui/demos.ts): önce kural,
// hemen sağında o kuralın tahtası. Yer sabit — dil değişince kaymaz.
const HELP: Section[] = [
  {
    titleKey: 'help.core.title',
    bodyKeys: [
      ['help.core.1', 'scroll'],
      'help.core.2',
      ['help.core.3', 'stuck'],
      'help.core.4',
      'help.core.6',
      ['help.core.7', 'ambush'],
      'help.core.5',
    ],
  },
  {
    titleKey: 'mode.classic.name',
    glyph: '♞',
    bodyKeys: [
      'help.classic.1',
      ['help.classic.2', 'transform'],
      'help.classic.5',
      ['help.classic.3', 'chain'],
      ['help.classic.4', 'kingBonus'],
    ],
  },
  {
    titleKey: 'mode.kingRun.name',
    glyph: '♚',
    bodyKeys: [
      'help.kingRun.1',
      ['help.kingRun.2', 'kingSafe'],
      ['help.kingRun.3', 'kingClimb'],
      ['help.kingRun.4', 'kingEnd'],
    ],
  },
  {
    titleKey: 'mode.trio.name',
    glyph: '♛',
    bodyKeys: [
      ['help.trio.1', 'trioPick'],
      ['help.trio.2', 'trioDrift'],
      'help.trio.5',
      'help.trio.3',
      ['help.trio.4', 'trioBack'],
    ],
    soon: !MODES.find((entry) => entry.id === 'trio')?.ready,
  },
]

const ABOUT: Section[] = [
  { titleKey: 'about.what.title', bodyKeys: ['about.what.1', 'about.what.2'] },
  {
    titleKey: 'about.scores.title',
    bodyKeys: ['about.scores.1', 'about.scores.2', 'about.scores.3'],
  },
  // İstatistik toplamaya başladığımız gün bu bölüm de yayında olmalı:
  // ne sayıyoruz, neyi bilerek saymıyoruz, ne kadar tutuyoruz.
  {
    titleKey: 'about.privacy.title',
    bodyKeys: ['about.privacy.1', 'about.privacy.2', 'about.privacy.3'],
  },
  { titleKey: 'about.tech.title', bodyKeys: ['about.tech.1', 'about.tech.2'] },
  // Künye: kim yaptı + iletişim. Adres i18n metnine {mail} ile giriyor,
  // böylece beş çeviri de tek kaynaktan (CONTACT_MAIL) besleniyor.
  { titleKey: 'about.credit.title', bodyKeys: ['about.credit.1', 'about.credit.2'] },
]

/**
 * Nasıl oynanır ve Hakkında — ayarlar penceresindeki iki düğmenin hedefi.
 *
 * Tam ekran açılıyor: pencerenin içine sığmayacak kadar uzunlar ve okuma
 * sırasında arkadaki tahtanın akması dikkat dağıtıyordu. Tasarım dili yine
 * aynı — monospace, altın yalnızca başlıklarda.
 */
export function Page({ page, onClose }: PageProps) {
  const t = useT()
  const identity = getIdentity()
  const sections = page === 'help' ? HELP : ABOUT

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="page" role="dialog" aria-modal="true">
      <header className="page-hd">
        <button type="button" className="page-back" onClick={onClose}>
          ← {t('common.back')}
        </button>
        <span className="page-ttl">{page === 'help' ? t('help.title') : t('about.title')}</span>
      </header>

      <div className="page-bd">
        {sections.map((section) => (
          <section key={section.titleKey} className="page-sec">
            <h2>
              {section.glyph && <span className="page-glyph">{section.glyph}</span>}
              {t(section.titleKey)}
              {section.soon && <em className="page-soon">{t('common.soon')}</em>}
            </h2>
            <ul>
              {section.bodyKeys.map((entry) => {
                const [key, demo] = Array.isArray(entry) ? entry : [entry, undefined]
                if (key === 'about.credit.2') {
                  return (
                    <li key={key}>
                      {t(key, { mail: '' })}
                      <a className="page-mail" href={`mailto:${CONTACT_MAIL}`}>
                        {CONTACT_MAIL}
                      </a>
                    </li>
                  )
                }
                if (demo) {
                  return (
                    <li key={key} className="page-rule">
                      <p>{t(key)}</p>
                      <MiniBoard id={demo} />
                    </li>
                  )
                }
                return <li key={key}>{t(key)}</li>
              })}
            </ul>
          </section>
        ))}

        {page === 'about' && (
          <div className="page-meta">
            <span>
              {t('about.version')} <b>{APP_VERSION}</b>
            </span>
            <span>
              {t('about.device')} <b>#{shortToken(identity.token)}</b>
            </span>
            <span>
              <b>{identity.name}</b>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
