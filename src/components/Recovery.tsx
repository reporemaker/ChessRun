import { useState } from 'react'
import type { Identity } from '../ui/identity'
import { readRuns } from '../ui/scores'
import { type RestoreResult, createRecoveryCode, readRecoveryCode, restoreFromCode } from '../ui/sync'
import { useT } from '../ui/text'

interface Props {
  identity: Identity
}

/** Kod maskesi: XXXX-XXXX-XXXX → ••••-••••-XXXX (son blok kalır - hangi kod olduğu belli olsun) */
function mask(code: string): string {
  return code.replace(/[A-Z0-9](?=.*-)/g, '•')
}

/**
 * Kurtarma kodu: oluştur / göster / kopyala / yenile + koddan geri yükle.
 * Rozetler penceresinin en altında; başlığı oradaki bölüm başlığı taşır,
 * burada yalnızca açıklama + kod + form var. Sunucu tanımsızsa çağıran hiç
 * çizmez (`syncEnabled`) - kod sunucusuz anlamsız.
 */
export function Recovery({ identity }: Props) {
  const t = useT()
  const [code, setCode] = useState<string | null>(() => readRecoveryCode())
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState<'create' | 'restore' | null>(null)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState<'offline' | 'noplayer' | null>(null)
  const [input, setInput] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [confirmRenew, setConfirmRenew] = useState(false)
  const [result, setResult] = useState<RestoreResult | null>(null)

  async function create() {
    setConfirmRenew(false)
    setBusy('create')
    setFailed(null)
    const fresh = await createRecoveryCode()
    setBusy(null)
    if (!fresh.ok) {
      setFailed(fresh.reason)
      return
    }
    setCode(fresh.code)
    setShown(true)
  }

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setShown(true)
    }
  }

  function askRestore() {
    setResult(null)
    // Bu cihazda hiç koşu yoksa kaybedilecek bir şey yok - sormadan yükle
    if (readRuns().length === 0) void restore()
    else setConfirm(true)
  }

  async function restore() {
    setConfirm(false)
    setBusy('restore')
    const outcome = await restoreFromCode(input)
    setBusy(null)
    setResult(outcome)
    if (outcome === 'ok') setTimeout(() => window.location.reload(), 900)
  }

  return (
    <div className="pop-field pop-rec">
      <p className="pop-codename">{t('recovery.hint')}</p>

      {code ? (
        <div className="pop-code">
          <b className="num" aria-live="polite">
            {shown ? code : mask(code)}
          </b>
          <button type="button" onClick={() => setShown((v) => !v)}>
            {shown ? t('recovery.hide') : t('recovery.show')}
          </button>
          <button type="button" onClick={copy}>
            {copied ? t('recovery.copied') : t('recovery.copy')}
          </button>
          <button type="button" onClick={() => setConfirmRenew(true)} disabled={busy != null} title={t('recovery.renew')}>
            {busy === 'create' ? t('recovery.creating') : t('recovery.renew')}
          </button>
        </div>
      ) : (
        <div className="pop-links main">
          <button type="button" onClick={create} disabled={busy != null}>
            {busy === 'create' ? t('recovery.creating') : t('recovery.create')}
          </button>
        </div>
      )}
      {failed && <small className="pop-err">{failed === 'noplayer' ? t('recovery.needRun') : t('recovery.offline')}</small>}
      {confirmRenew && (
        <div className="pop-warn" role="alertdialog" aria-live="polite">
          <b>{t('recovery.renew.title')}</b>
          <p>{t('recovery.renew.body')}</p>
          <div className="pop-warn-act">
            <button type="button" onClick={() => setConfirmRenew(false)}>
              {t('recovery.confirm.cancel')}
            </button>
            <button type="button" className="go" onClick={() => void create()}>
              {t('recovery.renew')}
            </button>
          </div>
        </div>
      )}

      <form
        className="pop-name pop-restore"
        onSubmit={(event) => {
          event.preventDefault()
          if (input.trim()) askRestore()
        }}
      >
        <input
          value={input}
          onChange={(event) => {
            setInput(event.target.value.toUpperCase())
            setResult(null)
          }}
          placeholder={t('recovery.placeholder')}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          aria-label={t('recovery.enter')}
          aria-invalid={result != null && result !== 'ok'}
        />
        <button type="submit" className="go" disabled={busy != null || !input.trim()}>
          {busy === 'restore' ? t('recovery.restoring') : t('recovery.restore')}
        </button>
        <small className={result && result !== 'ok' ? 'err' : ''}>
          {result === 'ok'
            ? t('recovery.done')
            : result === 'invalid'
              ? t('recovery.invalid')
              : result === 'notfound'
                ? t('recovery.notfound')
                : result === 'offline'
                  ? t('recovery.offline')
                  : t('recovery.enter')}
        </small>
      </form>

      {confirm && (
        <div className="pop-warn" role="alertdialog" aria-live="polite">
          <b>{t('recovery.confirm.title')}</b>
          <p>{t('recovery.confirm.body', { name: identity.name })}</p>
          <div className="pop-warn-act">
            <button type="button" onClick={() => setConfirm(false)}>
              {t('recovery.confirm.cancel')}
            </button>
            <button type="button" className="go" onClick={() => void restore()}>
              {t('recovery.confirm.ok')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
