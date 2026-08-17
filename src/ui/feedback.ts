import type { GameMode } from '../engine/types'
import { getIdentity, shortToken } from './identity'
import { translate, type Lang } from './i18n'
import { APP_VERSION, CONTACT_MAIL } from './version'

/**
 * Öneri / hata bildirimi — `mailto:` bağlantısı.
 *
 * Form yok, sunucu yok: form demek Worker'a uç + e-posta sağlayıcısı + spam
 * koruması + beş dilde "gönderildi / gönderilemedi" durumları demekti; bir
 * öneri düğmesi için fazla (bkz. sonra_planlar.md). `mailto:` oyuncunun
 * kendi mail uygulamasını açıyor, adres zaten CONTACT_MAIL.
 *
 * Konu ve gövde önceden dolu: sürüm, cihaz kısa kimliği ve o an açık olan
 * mod. Hata bildirimlerinde "hangi sürüm, hangi mod" sorusunu baştan
 * bitiriyor — oyuncu sadece derdini yazıyor.
 *
 * Bilinen zayıflık: masaüstünde webmail kullananlarda mailto hiçbir şey
 * açmayabilir. Bu yüzden düğmenin yanında adres metin olarak da duruyor.
 */
export function feedbackHref(lang: Lang, mode?: GameMode): string {
  const subject = translate(lang, 'feedback.subject')
  const context = [
    `${translate(lang, 'about.version')}: ${APP_VERSION}`,
    `${translate(lang, 'about.device')}: #${shortToken(getIdentity().token)}`,
    mode ? `${translate(lang, 'feedback.mode')}: ${translate(lang, `mode.${mode}.name`)}` : null,
  ]
    .filter(Boolean)
    .join('\n')
  const body = `${translate(lang, 'feedback.body')}\n\n\n— — —\n${context}\n`
  return `mailto:${CONTACT_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
