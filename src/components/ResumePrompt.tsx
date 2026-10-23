import type { ResumeTicket } from '../ui/resume'
import { useEscape } from '../ui/escape'
import { useT } from '../ui/text'

/**
 * «Koşun yarım kaldı — DEVAM ET / VAZGEÇ». Açılışta devam fişi varsa
 * (ui/resume): ana sayfada ya da fişin oyununun adresinde. Oyun, karar
 * verilene kadar KURULMAZ - yoksa yeni koşu başlar ve fişi ezerdi.
 */
interface Props {
  /** Kayan tahta fişi - gövde metni ondan; Mihrace kendi metnini `body` ile verir */
  ticket?: ResumeTicket
  body?: string
  onResume: () => void
  onSkip: () => void
}

export function ResumePrompt({ ticket, body, onResume, onSkip }: Props) {
  const t = useT()
  useEscape(onSkip)
  const game = ticket?.data.game

  return (
    <div className="pop-back" role="presentation">
      <div className="pop-warn gv-leave" role="alertdialog" aria-modal="true" aria-labelledby="resume-ttl">
        <b id="resume-ttl">{t('resume.title')}</b>
        <p>
          {body ??
            (ticket && game
              ? t('resume.body', {
                  mode: t(`mode.${ticket.config.mode}.name`),
                  score: t('share.points', { n: game.score }),
                  rows: t('share.rows', { n: game.distance }),
                })
              : '')}
        </p>
        <div className="pop-warn-act">
          <button type="button" onClick={onSkip}>
            {t('resume.skip')}
          </button>
          <button type="button" className="go" onClick={onResume} autoFocus>
            {t('resume.go')}
          </button>
        </div>
      </div>
    </div>
  )
}
