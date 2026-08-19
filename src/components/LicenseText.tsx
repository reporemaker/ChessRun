import { useState } from 'react'
import { useT } from '../ui/text'

/**
 * Hakkında › Kim yaptı: «Lisans metni (Apache 2.0)» - Chessnut figürlerinin
 * lisansı uygulamanın İÇİNDE (yalnızca depoda dosya değil): Apache 2.0
 * md. 4 dağıtımla birlikte lisans metnini ister; web uygulamasında görünür
 * yer burası. Metin açılınca yüklenir (11 KB pakete girmez).
 */
export function LicenseText() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && text == null) {
      const mod = await import('../../LICENSES/chessnut-APACHE-2.0.txt?raw')
      setText(mod.default)
    }
  }

  return (
    <div className="page-license">
      <button type="button" className="page-mail page-license-btn" onClick={() => void toggle()} aria-expanded={open}>
        {open ? t('about.license.hide') : t('about.license.show')}
      </button>
      {open && (
        <pre className="page-license-text" tabIndex={0}>
          {text ?? '…'}
        </pre>
      )}
    </div>
  )
}
