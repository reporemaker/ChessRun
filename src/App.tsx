import { useEffect, useRef, useState } from 'react'
import { minColsOf } from './engine/config'
import { Game, type GameConfig, type GameHandle } from './components/Game'
import { Home } from './components/Home'
import { Page, type PageId } from './components/Pages'
import { RankingPopup } from './components/RankingPopup'
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
  // ?dev=settings — ayarlar penceresini açık başlat (yalnızca DEV)
  const [settingsOpen, setSettingsOpen] = useState(
    () => import.meta.env.DEV && window.location.search.includes('dev=settings'),
  )
  // Aynı geliştirme kısayolu bilgi sayfaları için: ?dev=page&page=about
  const [page, setPage] = useState<PageId | null>(() =>
    import.meta.env.DEV && window.location.search.includes('dev=page')
      ? ((new URLSearchParams(window.location.search).get('page') ?? 'about') as PageId)
      : null,
  )
  const { lang } = useSettings()
  const gameRef = useRef<GameHandle>(null)
  // Sıralama kendi penceresi. ?dev=rank örnek veriyle açıyor (yalnızca DEV).
  const demoRank = import.meta.env.DEV && window.location.search.includes('dev=rank')
  const [rankOpen, setRankOpen] = useState<boolean>(demoRank)

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

  /**
   * Koridor genişliği oyun sürerken değişirse: önce mevcut koşu deftere
   * yazılsın (puan kaybolmuyor, kapanıyor), sonra yeni genişlikte baştan
   * kurulsun. runKey cols'u içerdiği için setConfig Game'i yeniden monte
   * ediyor — abandon'un bitmesini beklemek şart, yoksa kayıt sökülen
   * bileşenle birlikte gider. Hem ayarlar penceresi hem oyun sütunu
   * buradan geçiyor.
   */
  function restartWithCols(cols: number) {
    if (!config) return
    void (async () => {
      await gameRef.current?.abandon()
      setSettingsOpen(false)
      setConfig({ ...config, cols: Math.max(cols, minColsOf(config.mode)) })
    })()
  }

  const runKey = config
    ? `${config.mode}-${config.cols}-${config.seed ?? 'free'}-${config.daily ?? ''}`
    : ''

  return (
    <>
      {config ? (
        <Game
          key={runKey}
          ref={gameRef}
          config={config}
          onExit={() => setConfig(null)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPage={setPage}
          onOpenRanking={() => setRankOpen(true)}
          onRestartWithCols={restartWithCols}
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
          onOpenRanking={() => setRankOpen(true)}
          game={
            config
              ? {
                  daily: Boolean(config.daily),
                  score: () => gameRef.current?.score() ?? 0,
                  restart: restartWithCols,
                }
              : undefined
          }
        />
      )}

      {rankOpen && (
        <RankingPopup mode={config?.mode} demo={demoRank} onClose={() => setRankOpen(false)} />
      )}

      {page && <Page page={page} onClose={() => setPage(null)} />}
    </>
  )
}
