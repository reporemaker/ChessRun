import { useEffect } from 'react'
import type { ResumeTicket } from '../ui/resume'
import { useT } from '../ui/text'

/**
 * «Koşun yarım kaldı — DEVAM ET / VAZGEÇ». Açılışta devam fişi varsa
 * (ui/resume): ana sayfada ya da fişin oyununun adresinde. Oyun, karar
 * verilene kadar KURULMAZ - yoksa yeni koşu başlar ve fişi ezerdi.
 */
interface Props {
  ticket: ResumeTicket
  onResume: () => void
  onSkip: () => void
}

export function ResumePrompt({ ticket, onResume, onSkip }: Props) {
  const t = useT()
  const game = ticket.data.game
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  return (
    <div className="pop-back" role="presentation">
      <div className="pop-warn gv-leave" role="alertdialog" aria-modal="true" aria-labelledby="resume-ttl">
        <b id="resume-ttl">{t('resume.title')}</b>
        <p>
          {t('resume.body', {
            mode: t(`mode.${ticket.config.mode}.name`),
            score: t('share.points', { n: game.score }),
            rows: t('share.rows', { n: game.distance }),
          })}
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
