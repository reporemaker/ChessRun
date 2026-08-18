import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
