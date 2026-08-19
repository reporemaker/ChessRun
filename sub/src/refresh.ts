import { useEffect, useState } from 'react'

/**
 * Panel tazeliği - tek sayaç. Her `useQuery` bu sayacı dinler: sayaç
 * artınca eldeki veri ekranda kalır, arkada yeniden çekilir (titreme yok).
 *
 * Artıranlar: üstteki "Yenile" düğmesi, sekme görünürken 30 sn'lik zamanlayıcı,
 * sekme arka plandan öne gelince bir kez. Oyuncu ad/rozet değiştirdiğinde
 * sunucu anında güncelleniyor (POST /lb/profile) - panelin de bakarken
 * güncellenmesi bunun tamamlayıcısı (kullanıcı, 19 Ağustos).
 */
const AUTO_MS = 30_000

let tick = 0
let lastAt = Date.now()
const listeners = new Set<() => void>()

export function bumpRefresh(): void {
  tick++
  lastAt = Date.now()
  listeners.forEach((fn) => fn())
}

export function useRefreshTick(): number {
  const [, set] = useState(0)
  useEffect(() => {
    const fn = () => set((v) => v + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return tick
}

export function lastRefreshAt(): number {
  return lastAt
}

/** App bir kez kurar: zamanlayıcı + görünürlük */
export function startAutoRefresh(): () => void {
  const id = setInterval(() => {
    if (document.visibilityState === 'visible') bumpRefresh()
  }, AUTO_MS)
  const onVisible = () => {
    if (document.visibilityState === 'visible') bumpRefresh()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
