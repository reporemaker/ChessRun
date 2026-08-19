import { useEffect, useRef } from 'react'

/**
 * Escape yığını: açık pencerelerin her biri kendi dinleyicisini kurunca tek
 * Escape HEPSİNİ kapatıyordu (ayarlardan açılan rozetler penceresinde Escape
 * ayarları da kapatıyordu). Tek dinleyici, yığın; Escape yalnızca en son
 * açılanı (en üsttekini) kapatır.
 */
const stack: Array<{ id: number; onEscape: () => void }> = []
let nextId = 0
let bound = false

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || stack.length === 0) return
  event.preventDefault()
  stack[stack.length - 1].onEscape()
}

/** Bileşen açıkken çağrılır (koşullu kullanım için `active`) */
export function useEscape(onEscape: () => void, active = true): void {
  const latest = useRef(onEscape)
  latest.current = onEscape
  useEffect(() => {
    if (!active) return
    const entry = { id: nextId++, onEscape: () => latest.current() }
    stack.push(entry)
    if (!bound) {
      window.addEventListener('keydown', onKey)
      bound = true
    }
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      if (stack.length === 0 && bound) {
        window.removeEventListener('keydown', onKey)
        bound = false
      }
    }
  }, [active])
}
