import { useEffect, useRef, useState } from 'react'
import { type Identity, NAME_MAX, renameIdentity } from '../ui/identity'
import { useT } from '../ui/text'

/**
 * Oyuncu adı fişi + satır içi düzenleme. Ayarlar penceresinde ve oyun
 * ekranının sağ sütununda aynı bileşen; görünüm sınıfı üst öğeden geliyor
 * (`.pop-*` / `.gv-*`), davranış tek yerde.
 *
 * Kalem → giriş · Kaydet · ⟳ (o anki dilde rastgele) · ×. Ad hijyeni
 * `renameIdentity`/`cleanName`'de (identity.ts); burada yalnızca "olmadı"
 * gösteriliyor.
 */
interface Props {
  identity: Identity
  onChange: (next: Identity) => void
  /** Sınıf öneki: 'pop' (pencere) ya da 'gv' (oyun sütunu) */
  skin: 'pop' | 'gv'
}

export function NameChip({ identity, onChange, skin }: Props) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function start() {
    setDraft(identity.name)
    setError(false)
    setEditing(true)
  }

  function save(raw: string) {
    const next = renameIdentity(raw)
    if (!next) {
      setError(true)
      return
    }
    onChange(next)
    setEditing(false)
    setError(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`${skin}-chip name`}
        onClick={start}
        aria-label={t('name.edit')}
        title={t('name.edit')}
      >
        <b>{identity.name}</b>
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path
            d="M11.3 1.7a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L5.5 13.5 1.5 14.5l1-4z M9.8 3.2l3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </button>
    )
  }

  return (
    <form
      className={`${skin}-name`}
      onSubmit={(event) => {
        event.preventDefault()
        save(draft)
      }}
    >
      <input
        ref={inputRef}
        value={draft}
        maxLength={NAME_MAX}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        aria-label={t('name.edit')}
        aria-invalid={error}
        onChange={(event) => {
          setDraft(event.target.value)
          setError(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setEditing(false)
        }}
      />
      <button type="submit" className="go">
        {t('name.save')}
      </button>
      <button type="button" onClick={() => save('')} title={t('name.random')} aria-label={t('name.random')}>
        ⟳
      </button>
      <button type="button" onClick={() => setEditing(false)} aria-label={t('name.cancel')}>
        ×
      </button>
      <small className={error ? 'err' : ''}>
        {error ? t('name.invalid') : t('name.hint', { n: NAME_MAX })}
      </small>
    </form>
  )
}
