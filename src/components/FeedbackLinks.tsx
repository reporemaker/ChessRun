import { useState } from 'react'
import type { GameMode } from '../engine/types'
import { type FeedbackKind, feedbackHref, feedbackText } from '../ui/feedback'
import type { Lang } from '../ui/i18n'
import { copyText } from '../ui/share'
import { useT } from '../ui/text'

/**
 * Öneri gönder + Hata bildir + webmail yedeği (metni kopyala) - üç yerde
 * aynı: ayarlar penceresi, oyun sağ sütunu, günlük sağ sütun. Mail
 * oyuncunun arayüz dilinde açılır (bkz. ui/feedback.ts, mail.html taslağı).
 */
interface FeedbackLinksProps {
  lang: Lang
  mode?: GameMode
  /** Ana düğmenin sınıfı (kapsayıcının düğme dili) */
  className?: string
}

export function FeedbackLinks({ lang, mode, className = '' }: FeedbackLinksProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  async function copy(kind: FeedbackKind) {
    const ok = await copyText(feedbackText(lang, kind, mode))
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 2500)
  }

  return (
    <>
      <a className={className} href={feedbackHref(lang, mode, 'idea')}>
        {t('settings.feedback')}
      </a>
      <span className="fb-more">
        <a href={feedbackHref(lang, mode, 'bug')}>{t('feedback.bug')}</a>
        {' · '}
        <button type="button" onClick={() => void copy('idea')}>
          {copied ? t('feedback.copied') : t('feedback.copy')}
        </button>
      </span>
    </>
  )
}
