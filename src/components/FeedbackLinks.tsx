import type { GameMode } from '../engine/types'
import { feedbackHref } from '../ui/feedback'
import type { Lang } from '../ui/i18n'
import { useT } from '../ui/text'

/**
 * Öneri gönder bağlantısı. Tek mail: öneri; hata da aynı adrese, ayrı
 * "hata bildir" bağlantısı yok (kalabalık ediyordu). Mail oyuncunun
 * arayüz dilinde açılır (bkz. ui/feedback.ts). Hem ayarlar penceresi
 * hem oyun/günlük sağ sütunu bunu kullanır; eski "metni kopyala"
 * yedeği her iki yerden de kaldırıldı.
 */
interface FeedbackLinkProps {
  lang: Lang
  mode?: GameMode
  /** Ana düğmenin sınıfı (kapsayıcının düğme dili) */
  className?: string
}

export function FeedbackLink({ lang, mode, className = '' }: FeedbackLinkProps) {
  const t = useT()
  return (
    <a className={className} href={feedbackHref(lang, mode)}>
      {t('settings.feedback')}
    </a>
  )
}
