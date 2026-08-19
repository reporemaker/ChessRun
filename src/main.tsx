import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Tek origin: Pages'in *.pages.dev adresi (ve önizlemeleri) apex'e. Orada
// /lb ve /collect çalışmaz (Worker rotaları apex'te), kimlik/skor ayrı
// düşer, SEO ikilenir. Üretimde ilk iş yönlendirme - React bile kurulmadan.
// Geliştirme/önizleme (localhost) etkilenmez.
if (import.meta.env.PROD && /\.pages\.dev$/.test(window.location.hostname)) {
  window.location.replace(`https://chessrun.app${window.location.pathname}${window.location.search}${window.location.hash}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Çevrimdışı çalışma yalnızca üretim derlemesinde: geliştirmede service
// worker açıkken vite'ın sıcak yenilemesi eski dosyaları servis edebiliyor.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

// Kalıcı depolama: tarayıcı yer sıkışınca localStorage'ı kendiliğinden
// silmesin (kimlik, rozetler, defter orada). İzin verilmezse sessizce
// geçilir; elle silmeyi kurtarma kodu + sunucu profili karşılıyor.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  window.addEventListener('load', () => {
    void navigator.storage.persist().catch(() => undefined)
  })
}
