import type { MhTicket } from '../ui/mhResume'
import { useT } from '../ui/text'
import { ResumePrompt } from './ResumePrompt'

/** Mihrace'nin devam fişi için «Oyunun yarım kaldı» - kayan tahtanınkiyle aynı pencere */
export function MhResumeOffer({ ticket, onResume, onSkip }: { ticket: MhTicket; onResume: () => void; onSkip: () => void }) {
  const t = useT()
  const body = t('mh.resume.body', {
    role: t(ticket.game.mode === 'falcon' ? 'mh.falcon.name' : 'mh.hunter.name'),
    n: ticket.game.plies,
  })
  return <ResumePrompt body={body} onResume={onResume} onSkip={onSkip} />
}
