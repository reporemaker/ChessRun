import { useEffect, useState } from 'react'
import { Game, type GameConfig } from './components/Game'
import { Home } from './components/Home'
import { Page, type PageId } from './components/Pages'
import { Settings } from './components/Settings'
import { useSettings } from './ui/settings'
import { unlockSound } from './ui/sound'
import { trackSessionEnd, trackVisit } from './ui/stats'
import './App.css'

/**
 * Menü, oyun ve iki katman: ayarlar penceresi ile bilgi sayfaları.
 *
 * Oyunun tüm durumu Game içinde yaşıyor ve `key` ile sıfırlanıyor —
 * yeni bir konfigürasyon seçildiğinde bileşen baştan kuruluyor, yarım
 * kalmış tur zincirleri kendiliğinden iptal oluyor.
 */
export default function App() {
  // Geliştirmede ?dev=game ile doğrudan oyuna girilebiliyor — ekran
  // görüntüsüyle doğrulama için. Üretim derlemesinde tamamen kapalı.
  const [config, setConfig] = useState<GameConfig | null>(() =>
    import.meta.env.DEV && window.location.search.includes('dev=game')
      ? {
          mode: (new URLSearchParams(window.location.search).get('mode') ??
            'classic') as GameConfig['mode'],
          playerColor: 'w',
          cols: 8,
        }
      : null,
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Aynı geliştirme kısayolu bilgi sayfaları için: ?dev=page&page=about
  const [page, setPage] = useState<PageId | null>(() =>
    import.meta.env.DEV && window.location.search.includes('dev=page')
      ? ((new URLSearchParams(window.location.search).get('page') ?? 'about') as PageId)
      : null,
  )
  const { lang } = useSettings()

  // Ekran okuyucular ve tarayıcı tireleme kuralları için
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  /* Ziyaret Game'den bağımsız, burada sayılıyor — siteye girip hiç
     oynamayan da ziyaretçidir. Oturum sonu için `visibilitychange` +
     `pagehide` çifti kullanılıyor: `beforeunload`/`unload` mobil
     Safari'de güvenilir tetiklenmiyor. Uç tanımsızken hepsi sessiz. */
  useEffect(() => {
    trackVisit()
    const onHide = () => {
      if (document.visibilityState === 'hidden') trackSessionEnd()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', trackSessionEnd)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', trackSessionEnd)
    }
  }, [])

  const runKey = config
    ? `${config.mode}-${config.cols}-${config.seed ?? 'free'}-${config.daily ?? ''}`
    : ''

  return (
    <>
      {config ? (
        <Game
          key={runKey}
          config={config}
          onExit={() => setConfig(null)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPage={setPage}
        />
      ) : (
        <Home
          onStart={(next) => {
            unlockSound()
            setConfig(next)
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          onExitGame={
            config
              ? () => {
                  setSettingsOpen(false)
                  setConfig(null)
                }
              : undefined
          }
          onOpenPage={(next) => {
            setSettingsOpen(false)
            setPage(next)
          }}
        />
      )}

      {page && <Page page={page} onClose={() => setPage(null)} />}
    </>
  )
}
