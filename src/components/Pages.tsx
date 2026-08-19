import { getIdentity, shortToken } from '../ui/identity'
import type { StringKey } from '../ui/i18n'
import type { DemoId } from '../ui/demos'
import { MODES } from '../ui/modes'
import { GLYPH } from '../ui/pieces'
import { LessonStage } from './LessonStage'
import {
  CHECK_SCORE,
  KING_BONUS_LIVES,
  MATE_SCORE,
  MAX_CHECK_STREAK,
  PIECE_VALUE,
  ROW_SCORE,
  STUCK_RIGHTS,
  STUCK_SCORE,
  TRIO_MATE_SCORE,
  TRIO_THREAT_CAP,
  TRIO_THREAT_SCORE,
} from '../engine/config'
import type { PieceType } from '../engine/types'
import { useEscape } from '../ui/escape'
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
  bodyKeys: StringKey[]
  /** Bölümün başındaki ders sahnesi: her ders bir demo (ui/demos.ts) */
  lessons?: DemoId[]
  /** Motorda henüz olmayan mod - bölüm "yakında" damgasıyla çiziliyor */
  soon?: boolean
}

// Kılavuz düzeni: her bölüm önce EKRAN (dersler, adım adım animasyon),
// altında KURALLAR (kısa maddeler). Sonda puan tablosu - Atari kılavuzlarının
// "SCORING" sayfası gibi, sayılar doğrudan motor sabitlerinden.
const HELP: Section[] = [
  {
    titleKey: 'help.core.title',
    lessons: ['scroll', 'stuck', 'ambush'],
    bodyKeys: ['help.core.1', 'help.core.2', 'help.core.3', 'help.core.4', 'help.core.6', 'help.core.7', 'help.core.5'],
  },
  {
    titleKey: 'mode.classic.name',
    glyph: '♞',
    lessons: ['transform', 'chain', 'kingBonus'],
    bodyKeys: ['help.classic.1', 'help.classic.2', 'help.classic.5', 'help.classic.3', 'help.classic.4'],
  },
  {
    titleKey: 'mode.kingRun.name',
    glyph: '♚',
    lessons: ['kingSafe', 'kingClimb', 'kingEnd'],
    bodyKeys: ['help.kingRun.1', 'help.kingRun.2', 'help.kingRun.3', 'help.kingRun.4'],
  },
  {
    titleKey: 'mode.trio.name',
    glyph: '♛',
    lessons: ['trioPick', 'trioDrift', 'trioBack'],
    bodyKeys: ['help.trio.1', 'help.trio.2', 'help.trio.5', 'help.trio.3', 'help.trio.4'],
    soon: !MODES.find((entry) => entry.id === 'trio')?.ready,
  },
]

/** Puan tablosu satırları - etiket anahtarı + motor sabitinden değer */
const PIECE_ORDER: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k']

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
  { titleKey: 'about.credit.title', bodyKeys: ['about.credit.1', 'about.credit.2', 'about.credit.3'] },
]

/**
 * Nasıl oynanır ve Hakkında - ayarlar penceresindeki iki düğmenin hedefi.
 *
 * Tam ekran açılıyor: pencerenin içine sığmayacak kadar uzunlar ve okuma
 * sırasında arkadaki tahtanın akması dikkat dağıtıyordu. Tasarım dili yine
 * aynı - monospace, altın yalnızca başlıklarda.
 */
export function Page({ page, onClose }: PageProps) {
  const t = useT()
  const identity = getIdentity()
  const sections = page === 'help' ? HELP : ABOUT

  // Escape yalnızca en üstteki pencereyi kapatır (ui/escape yığını)
  useEscape(onClose)

  return (
    <div className="page" role="dialog" aria-modal="true">
      <header className="page-hd">
        <button type="button" className="page-back" onClick={onClose}>
          ← {t('common.back')}
        </button>
        <span className="page-ttl">{page === 'help' ? t('help.title') : t('about.title')}</span>
      </header>

      <div className="page-bd">
        {page === 'help' && (
          <aside className="page-notice" role="note">
            <b>{t('help.notice.title')}</b>
            <p>{t('help.notice.body')}</p>
          </aside>
        )}
        {sections.map((section, n) => (
          <section key={section.titleKey} className={`page-sec ${section.lessons ? 'spread' : ''}`}>
            <h2>
              {page === 'help' && <span className="page-num">{n + 1}</span>}
              {section.glyph && <span className="page-glyph">{section.glyph}</span>}
              {t(section.titleKey)}
              {section.soon && <em className="page-soon">{t('common.soon')}</em>}
            </h2>
            {section.lessons && <LessonStage lessons={section.lessons} />}
            <div className="page-rules">
            {section.lessons && <h3 className="page-sub">{t('manual.rules')}</h3>}
            <ul>
              {section.bodyKeys.map((key) =>
                key === 'about.credit.2' ? (
                  <li key={key}>
                    {t(key, { mail: '' })}
                    <a className="page-mail" href={`mailto:${CONTACT_MAIL}`}>
                      {CONTACT_MAIL}
                    </a>
                  </li>
                ) : (
                  <li key={key}>{t(key)}</li>
                ),
              )}
            </ul>
            </div>
          </section>
        ))}

        {page === 'help' && (
          <section className="page-sec">
            <h2>
              <span className="page-num">{HELP.length + 1}</span>
              {t('score.title')}
            </h2>
            <table className="page-score">
              <tbody>
                <tr>
                  <td>{t('score.row')}</td>
                  <td>+{ROW_SCORE}</td>
                </tr>
                <tr>
                  <td>{t('score.capture')}</td>
                  <td>
                    {PIECE_ORDER.map((p) => (
                      <span key={p} className="page-pv">
                        {GLYPH[p]}
                        {PIECE_VALUE[p]}
                      </span>
                    ))}
                  </td>
                </tr>
                <tr>
                  <td>{t('score.check')}</td>
                  <td>{t('score.checkVal', { n: CHECK_SCORE, max: MAX_CHECK_STREAK })}</td>
                </tr>
                <tr>
                  <td>{t('score.mate')}</td>
                  <td>+{MATE_SCORE}</td>
                </tr>
                <tr>
                  <td>{t('score.king')}</td>
                  <td>
                    +{PIECE_VALUE.k} · ♥ +{KING_BONUS_LIVES}
                  </td>
                </tr>
                <tr>
                  <td>{t('score.stuck', { n: STUCK_RIGHTS })}</td>
                  <td>+{STUCK_SCORE}</td>
                </tr>
                <tr>
                  <td>{t('score.trioThreat')}</td>
                  <td>{t('score.trioThreatVal', { n: TRIO_THREAT_SCORE, cap: TRIO_THREAT_CAP })}</td>
                </tr>
                <tr>
                  <td>{t('score.trioMate')}</td>
                  <td>+{TRIO_MATE_SCORE}</td>
                </tr>
              </tbody>
            </table>
            <p className="page-note">{t('score.noteKingRun')}</p>
          </section>
        )}

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
