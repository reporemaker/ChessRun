import { useEffect, useRef, useState } from 'react'
import { minColsOf } from './engine/config'
import { Game, type GameConfig, type GameHandle } from './components/Game'
import { DailyGame } from './components/DailyGame'
import { Home, type HomeFocus } from './components/Home'
import { Page, type PageId } from './components/Pages'
import { RankingPopup } from './components/RankingPopup'
import { BadgesPopup } from './components/BadgesPopup'
import { Settings } from './components/Settings'
import { claimLeague } from './ui/badges'
import { fetchAwards, flushSubmitQueue } from './ui/leaderboard'
import { RESET_EVENT, pullProfile, pushProfile } from './ui/sync'
import { useSettings } from './ui/settings'
import { unlockSound } from './ui/sound'
import { trackSessionEnd, trackVisit } from './ui/stats'
import { dailySeed, dayKey } from './ui/scores'
import './App.css'

/** ?dev=game&mode=… kısayolu; günlük için bugünün tohumu ve günü de dolar */
function devConfig(mode: string, seedParam: string | null): GameConfig {
  const day = dayKey()
  // &seed=N ile belirli bir tahta (yalnızca DEV; günlük kilit DEV'de zaten yok)
  const seed = seedParam != null && seedParam !== '' ? Number(seedParam) >>> 0 : dailySeed(day)
  return mode === 'daily'
    ? { mode: 'daily', playerColor: 'w', cols: 8, seed, daily: day }
    : { mode: mode as GameConfig['mode'], playerColor: 'w', cols: 8 }
}

/**
 * Menü, oyun ve iki katman: ayarlar penceresi ile bilgi sayfaları.
 *
 * Oyunun tüm durumu Game içinde yaşıyor ve `key` ile sıfırlanıyor -
 * yeni bir konfigürasyon seçildiğinde bileşen baştan kuruluyor, yarım
 * kalmış tur zincirleri kendiliğinden iptal oluyor.
 */
export default function App() {
  // Geliştirmede ?dev=game ile doğrudan oyuna girilebiliyor - ekran
  // görüntüsüyle doğrulama için. Üretim derlemesinde tamamen kapalı.
  const [config, setConfig] = useState<GameConfig | null>(() =>
    import.meta.env.DEV && window.location.search.includes('dev=game')
      ? devConfig(
          new URLSearchParams(window.location.search).get('mode') ?? 'classic',
          new URLSearchParams(window.location.search).get('seed'),
        )
      : null,
  )
  // ?dev=settings - ayarlar penceresini açık başlat (yalnızca DEV)
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
  /* Paylaşım bağlantısı: ?g=classic|kingRun|trio|daily(&d=gün) → ana sayfada o
     kart vurgulanır. Adres çubuğu temizlenir ki yenilemede tekrar vurgulamasın. */
  const [focus] = useState<HomeFocus | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const g = params.get('g')
    if (!g || !['classic', 'kingRun', 'trio', 'daily'].includes(g)) return null
    const d = params.get('d') ?? undefined
    try {
      window.history.replaceState(null, '', window.location.pathname)
    } catch {
      // yoksay
    }
    return { mode: g as HomeFocus['mode'], day: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined }
  })
  const gameRef = useRef<GameHandle>(null)
  // Sıralama kendi penceresi. ?dev=rank örnek veriyle açıyor (yalnızca DEV).
  const demoRank = import.meta.env.DEV && window.location.search.includes('dev=rank')
  const [rankOpen, setRankOpen] = useState<boolean>(demoRank)
  // Rozet penceresi; ?dev=badges açık başlatır (yalnızca DEV)
  const [badgesOpen, setBadgesOpen] = useState<boolean>(
    import.meta.env.DEV && window.location.search.includes('dev=badges'),
  )
  // Seçili rozet değişince fişler yeniden okusun
  const [badgeVersion, setBadgeVersion] = useState(0)

  // Ekran okuyucular ve tarayıcı tireleme kuralları için
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  /* Ziyaret Game'den bağımsız, burada sayılıyor - siteye girip hiç
     oynamayan da ziyaretçidir. Oturum sonu için `visibilitychange` +
     `pagehide` çifti kullanılıyor: `beforeunload`/`unload` mobil
     Safari'de güvenilir tetiklenmiyor. Uç tanımsızken hepsi sessiz. */
  /* Lig rozetleri: bitmiş haftaların birincilikleri sunucudan; kazanılan
     varsa depoya işlenir ve fişler yeniden okur. Haftada bir değişen veri -
     açılışta bir kez yeter. */
  useEffect(() => {
    // Ağ yüzünden gönderilememiş koşular (özellikle günlük) açılışta tekrar denenir
    void flushSubmitQueue()
    void fetchAwards().then((firsts) => {
      if (firsts && claimLeague(firsts).length > 0) setBadgeVersion((v) => v + 1)
    })
    // Sunucu profili (rozetler, sayaçlar, defter özeti) yerelle birleşir;
    // moderatör sıfırlaması da buradan iner. Değişen varsa fişler yeniden okur.
    void pullProfile().then((r) => {
      if (r.changed) setBadgeVersion((v) => v + 1)
    })
    // Moderatör sıfırlaması bir gönderim cevabıyla da gelebilir - fişler tazelensin
    const onReset = () => setBadgeVersion((v) => v + 1)
    window.addEventListener(RESET_EVENT, onReset)
    return () => window.removeEventListener(RESET_EVENT, onReset)
  }, [])

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
   * ediyor - abandon'un bitmesini beklemek şart, yoksa kayıt sökülen
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
      {config?.mode === 'daily' ? (
        <DailyGame
          key={runKey}
          ref={gameRef}
          config={config}
          onExit={() => setConfig(null)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPage={setPage}
          onOpenRanking={() => setRankOpen(true)}
          onOpenBadges={() => setBadgesOpen(true)}
          badgeVersion={badgeVersion}
        />
      ) : config ? (
        <Game
          key={runKey}
          ref={gameRef}
          config={config}
          onExit={() => setConfig(null)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPage={setPage}
          onOpenRanking={() => setRankOpen(true)}
          onOpenBadges={() => setBadgesOpen(true)}
          badgeVersion={badgeVersion}
          onRestartWithCols={restartWithCols}
        />
      ) : (
        <Home
          onStart={(next) => {
            unlockSound()
            setConfig(next)
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          focus={focus}
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
          onOpenBadges={() => setBadgesOpen(true)}
          badgeVersion={badgeVersion}
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

      {badgesOpen && (
        <BadgesPopup
          onClose={() => setBadgesOpen(false)}
          onSelect={() => {
            setBadgeVersion((v) => v + 1)
            // Seçilen rozet koşu beklemeden tabloya yansısın
            void pushProfile(false)
          }}
        />
      )}

      {rankOpen && (
        <RankingPopup
          // Günlük ligi sunucuda henüz yok: pencere haftanın ligini açar
          mode={config?.mode === 'daily' ? undefined : config?.mode}
          demo={demoRank}
          onClose={() => setRankOpen(false)}
        />
      )}

      {page && <Page page={page} onClose={() => setPage(null)} />}
    </>
  )
}
