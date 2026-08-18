import { useState } from 'react'
import {
  type ShareInput,
  type ShareOutcome,
  canSystemShare,
  copyText,
  downloadShareCard,
  platformLinks,
  shareRun,
  shareText,
} from '../ui/share'
import { useT } from '../ui/text'

/**
 * Tek paylaşım bileşeni - dört oyunun kapanışında aynı davranış.
 *
 * Sistem paylaşım sayfası varsa (mobil): tek düğme; resim + açıklama +
 * bağlantı gider. Yoksa (masaüstü): düğme küçük bir seçici açar:
 * WhatsApp · Telegram · X · Facebook · metni kopyala · PNG indir.
 */
interface SharePanelProps {
  input: ShareInput
  className?: string
}

export function SharePanel({ input, className = '' }: SharePanelProps) {
  const t = useT()
  const [outcome, setOutcome] = useState<ShareOutcome | 'png' | null>(null)
  const [open, setOpen] = useState(false)
  const system = canSystemShare()

  const label =
    outcome === 'copied'
      ? t('game.shareCopied')
      : outcome === 'shared'
        ? t('game.shareDone')
        : outcome === 'png'
          ? t('share.pngDone')
          : t('game.share')

  async function onPrimary() {
    if (system) {
      setOutcome(await shareRun(input, t))
      return
    }
    setOpen((v) => !v)
  }

  const links = open ? platformLinks(input, t) : null

  return (
    <div className={`share ${className}`}>
      <button type="button" className="outro-btn primary" onClick={() => void onPrimary()}>
        {label}
      </button>
      {links && (
        <div className="share-pick" role="group" aria-label={t('share.pickTitle')}>
          <a className="share-btn wa" href={links.whatsapp} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a className="share-btn tg" href={links.telegram} target="_blank" rel="noopener noreferrer">
            Telegram
          </a>
          <a className="share-btn x" href={links.x} target="_blank" rel="noopener noreferrer">
            X
          </a>
          <a className="share-btn fb" href={links.facebook} target="_blank" rel="noopener noreferrer">
            Facebook
          </a>
          <button
            type="button"
            className="share-btn"
            onClick={() => void copyText(shareText(input, t)).then((ok) => setOutcome(ok ? 'copied' : 'failed'))}
          >
            {t('share.copy')}
          </button>
          <button
            type="button"
            className="share-btn"
            onClick={() => void downloadShareCard(input, t).then((ok) => ok && setOutcome('png'))}
          >
            {t('share.png')}
          </button>
        </div>
      )}
    </div>
  )
}
