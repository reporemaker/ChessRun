import { useState } from 'react'
import type { GameMode } from '../engine/types'
import { feedbackHref, feedbackText } from '../ui/feedback'
import type { Lang } from '../ui/i18n'
import { copyText } from '../ui/share'
import { useT } from '../ui/text'

/**
 * Öneri gönder + webmail yedeği (metni kopyala). Tek mail: öneri; hata da
 * aynı adrese, ayrı "hata bildir" bağlantısı yok (kalabalık ediyordu). Mail
 * oyuncunun arayüz dilinde açılır (bkz. ui/feedback.ts).
 *
 * İki parça ayrı da kullanılabiliyor: ayarlar penceresi yalnızca bağlantıyı
 * (Hakkında · Öneri · Yükle sırasında), kopyalama satırı yok. Oyun/günlük
 * sağ sütunu ikisini birlikte (`FeedbackLinks`).
 */
interface FeedbackLinksProps {
  lang: Lang
  mode?: GameMode
  /** Ana düğmenin sınıfı (kapsayıcının düğme dili) */
  className?: string
}

export function FeedbackLink({ lang, mode, className = '' }: FeedbackLinksProps) {
  const t = useT()
  return (
    <a className={className} href={feedbackHref(lang, mode)}>
      {t('settings.feedback')}
    </a>
  )
}

export function FeedbackCopy({ lang, mode }: Omit<FeedbackLinksProps, 'className'>) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  async function copy() {
    const ok = await copyText(feedbackText(lang, mode))
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 2500)
  }

  return (
    <span className="fb-more">
      <button type="button" onClick={() => void copy()}>
        {copied ? t('feedback.copied') : t('feedback.copy')}
      </button>
    </span>
  )
}

export function FeedbackLinks(props: FeedbackLinksProps) {
  return (
    <>
      <FeedbackLink {...props} />
      <FeedbackCopy lang={props.lang} mode={props.mode} />
    </>
  )
}
