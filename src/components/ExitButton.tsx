import { type ReactNode, useState } from 'react'
import { useEscape } from '../ui/escape'
import { useT } from '../ui/text'

/**
 * Oyundan çıkış düğmesi - masaüstünde üst çubuktaki «← Menü», mobilde sol
 * üst köşedeki «←» (mobilde eskiden koşu sırasında hiç çıkış yoktu).
 *
 * Koşu sürüyorsa (`active`) hafif onay: yanlışlıkla dokunma telefonda
 * kolay. Onaylanınca App koşuyu `abandon` ile deftere yazıp ana sayfaya
 * döner (puan kaybolmaz, koşu biter). Koşu yoksa / bittiyse doğrudan çıkar.
 * Tarayıcı geri tuşu aynı yoldan geçer ama onay sormaz (kullanıcı zaten
 * "geri" dedi).
 */
interface Props {
  active: boolean
  onExit: () => void
  className: string
  children: ReactNode
  ariaLabel?: string
}

export function ExitButton({ active, onExit, className, children, ariaLabel }: Props) {
  const t = useT()
  const [ask, setAsk] = useState(false)

  // Onay açıkken Escape = KAL (yığında en üstte; altındaki pencereyi kapatmaz)
  useEscape(() => setAsk(false), ask)

  return (
    <>
      <button type="button" className={className} aria-label={ariaLabel} onClick={() => (active ? setAsk(true) : onExit())}>
        {children}
      </button>
      {ask && (
        <div
          className="pop-back"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAsk(false)
          }}
        >
          <div className="pop-warn gv-leave" role="alertdialog" aria-modal="true" aria-labelledby="gv-leave-ttl">
            <b id="gv-leave-ttl">{t('game.leave.title')}</b>
            <p>{t('game.leave.body')}</p>
            <div className="pop-warn-act">
              <button type="button" onClick={() => setAsk(false)} autoFocus>
                {t('game.leave.stay')}
              </button>
              <button type="button" className="go" onClick={onExit}>
                {t('game.leave.go')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
