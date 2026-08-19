import { useSyncExternalStore } from 'react'

/**
 * "Ana ekrana ekle" - platform ipucu ve (Chromium'da) yükleme istemi.
 *
 * `beforeinstallprompt` sayfa yüklendikten kısa süre sonra bir kez ateşlenir;
 * yakalanmazsa kaybolur. Bu yüzden dinleyici modül yüklenir yüklenmez
 * kuruluyor - Ayarlar penceresi çok sonra açılsa da düğme çalışır.
 * iOS/Safari'de böyle bir olay yok: orada yalnızca metin ipucu.
 *
 * Ayarlar penceresinde tek düğme (`useInstallState`): istem hazırsa YÜKLE →
 * tarayıcı kutusu; değilse ANA EKRANA EKLE → düğmenin altında platform
 * ipucu açılır; uygulama olarak açıksa düğme yok.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    listeners.forEach((fn) => fn())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((fn) => fn())
  })
}

export type Platform = 'ios' | 'android' | 'desktop'

export function platformOf(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  // iPadOS 13+ kendini Mac diye tanıtıyor; dokunmatik nokta sayısı ele veriyor
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** Uygulama olarak mı açık (ana ekrandan / yüklü pencere) */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Yükleme istemi hazır mı (yalnızca Chromium tabanlı tarayıcılar) */
export function canPromptInstall(): boolean {
  return deferred != null
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  try {
    await event.prompt()
    const choice = await event.userChoice
    return choice.outcome === 'accepted'
  } catch {
    return false
  } finally {
    listeners.forEach((fn) => fn())
  }
}

/** İstem hazır olunca / kullanılınca haber ver - React yeniden çizsin */
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export type InstallState = 'installed' | 'prompt' | 'hint'

/**
 * Düğmenin durumu; `beforeinstallprompt` gelince / kullanılınca yeniden
 * çizilir. `installed` = uygulama olarak açık, `prompt` = Chromium istemi
 * hazır, `hint` = yalnızca elle ekleme ipucu gösterilebilir.
 */
export function useInstallState(): InstallState {
  const ready = useSyncExternalStore(onInstallChange, canPromptInstall, () => false)
  if (isStandalone()) return 'installed'
  return ready ? 'prompt' : 'hint'
}
