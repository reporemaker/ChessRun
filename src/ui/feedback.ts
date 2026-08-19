import type { GameMode } from '../engine/types'
import { getIdentity, shortToken } from './identity'
import { translate, type Lang, localeOf } from './i18n'
import { readRuns } from './scores'
import { APP_VERSION, CONTACT_MAIL } from './version'

/**
 * Öneri gönder - `mailto:` bağlantısı.
 *
 * Form yok, sunucu yok: form demek Worker'a uç + e-posta sağlayıcısı + spam
 * koruması + beş dilde durum mesajları demekti; bir öneri düğmesi için
 * fazla. `mailto:` oyuncunun kendi mail uygulamasını açıyor, adres
 * CONTACT_MAIL. Cevap gönderenin adresine gider, ad istenmez.
 *
 * Mail oyuncunun SEÇTİĞİ arayüz dilinde: selam + tek köşeli parantezli yer
 * tutucu (oyuncu siler, yazar) + imza; çizginin altında silinebilir otomatik
 * bilgi bloğu (sürüm · dil · cihaz · tarayıcı/OS · ekran · ana ekrandan mı ·
 * açık oyun · son koşu). Kişisel veri yok. Tek tür: öneri - hata da aynı
 * adrese gider, ayrı bir "hata bildir" maili yok. Emoji ve uzun tire yok.
 *
 * Bilinen zayıflık: masaüstünde webmail kullananlarda mailto hiçbir şey
 * açmayabilir; bu yüzden `feedbackText` panoya kopyalanabilir yedek üretir
 * ve adres metin olarak da görünür.
 */
function uaShort(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '?'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : '?'
  return `${browser} · ${os}`
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

function lastRunLine(lang: Lang, mode?: GameMode): string | null {
  const runs = readRuns()
  const last = [...runs].reverse().find((run) => (mode ? run.mode === mode : true))
  if (!last) return null
  const at = new Date(last.at)
  const when = Number.isNaN(at.getTime())
    ? ''
    : ` · ${at.toLocaleDateString(localeOf(lang), { day: '2-digit', month: '2-digit', year: 'numeric' })} ${at.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })}`
  return `${translate(lang, 'feedback.last')}: ${translate(lang, 'share.points', { n: last.score })} · ${translate(lang, 'share.rows', { n: last.distance })}${when}`
}

export interface FeedbackMail {
  subject: string
  body: string
  href: string
}

export function feedbackMail(lang: Lang, mode?: GameMode): FeedbackMail {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(lang, key, vars)
  const modeName = mode ? t(`mode.${mode}.name`) : null
  const subject = `${t('feedback.subject.idea')}${modeName ? ` · ${modeName}` : ''}`

  const screen =
    typeof window === 'undefined' ? '' : ` · ${t('feedback.screen')} ${window.innerWidth}×${window.innerHeight}`
  const context = [
    `${t('feedback.version')} ${APP_VERSION} · ${t('feedback.lang')} ${lang.toUpperCase()} · ${t('feedback.device')} #${shortToken(getIdentity().token)}`,
    `${t('feedback.env')}: ${uaShort()}${screen} · ${t('feedback.pwa')}: ${isStandalone() ? t('feedback.yes') : t('feedback.no')}`,
    modeName ? `${t('feedback.game')}: ${modeName}` : null,
    lastRunLine(lang, mode),
  ]
    .filter(Boolean)
    .join('\n')

  const body = [
    t('feedback.hi'),
    '',
    t('feedback.ph.idea'),
    '',
    t('feedback.bye'),
    '',
    '',
    '- - -',
    t('feedback.auto'),
    context,
    t('feedback.reply'),
    '',
  ].join('\n')

  return {
    subject,
    body,
    href: `mailto:${CONTACT_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  }
}

/** Settings/Game/DailyGame çağrıları: yalnızca href */
export function feedbackHref(lang: Lang, mode?: GameMode): string {
  return feedbackMail(lang, mode).href
}

/** Webmail yedeği: adres + konu + gövde, panoya kopyalanacak metin */
export function feedbackText(lang: Lang, mode?: GameMode): string {
  const mail = feedbackMail(lang, mode)
  return `${CONTACT_MAIL}\n${mail.subject}\n\n${mail.body}`
}
