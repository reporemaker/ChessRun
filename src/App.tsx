import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { DEFAULT_COLS, minColsOf } from './engine/config'
import { Game, type GameConfig, type GameHandle } from './components/Game'
import { DailyGame } from './components/DailyGame'
import { MaharajahGame } from './components/MaharajahGame'
import { Home, type HomeFocus } from './components/Home'
import { Page, type PageId } from './components/Pages'
import { RankingPopup } from './components/RankingPopup'
import { BadgesPopup } from './components/BadgesPopup'
import { Settings } from './components/Settings'
import { claimLeague } from './ui/badges'
import { RANKS_EVENT, fetchAwards, flushSubmitQueue, sayHello } from './ui/leaderboard'
import { PROFILE_EVENT, RESET_EVENT, pullProfile, pushProfile } from './ui/sync'
import { getSettings, useSettings } from './ui/settings'
import { DAILY_REPLAY_ALLOWED, dailyPlayed } from './ui/dailyLock'
import { fetchDaily, leaderboardEnabled } from './ui/leaderboard'
import { type PlayMode, type Route, parseRoute, pathOf, routeOfMode } from './ui/route'

/* Zorluk testi paneli yalnızca geliştirmede: koşul derlemede sabit false
   olduğu için modül üretim paketine hiç girmiyor. */
const TuningPanel = import.meta.env.DEV
  ? lazy(() => import('./components/TuningPanel').then((m) => ({ default: m.TuningPanel })))
  : null
import { type ResumeTicket, clearResume, readResume, resumeMatches } from './ui/resume'
import { ResumePrompt } from './components/ResumePrompt'
import { setBeforeReload } from './ui/reload'
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

/** Game/DailyGame'in `key`'i: değişince bileşen baştan kurulur (yeni koşu) */
function runKeyOf(config: GameConfig): string {
  return `${config.mode}-${config.cols}-${config.seed ?? 'free'}-${config.daily ?? ''}`
}

/** /play/<mod> adresinden konfig: ayarlardaki koridor (Üçlü için en az kendi genişliği) */
function playConfig(mode: PlayMode): GameConfig {
  return { mode, playerColor: 'w', cols: Math.max(getSettings().cols, minColsOf(mode)) }
}

/**
 * Açılış rotası: adres bilinmiyorsa ana sayfa ve adres düzeltilir. Paylaşım
 * `?g=` sorgusu korunur (aşağıdaki odak mantığı okuyacak).
 */
function initialRoute(): Route {
  const route = parseRoute(window.location.pathname)
  if (route) return route
  try {
    window.history.replaceState(null, '', `/${window.location.search}`)
  } catch {
    // yoksay
  }
  return { kind: 'home' }
}

/**
 * Menü, oyun ve iki katman: ayarlar penceresi ile bilgi sayfaları.
 *
 * Oyunun tüm durumu Game içinde yaşıyor ve `key` ile sıfırlanıyor -
 * yeni bir konfigürasyon seçildiğinde bileşen baştan kuruluyor, yarım
 * kalmış tur zincirleri kendiliğinden iptal oluyor.
 */
export default function App() {
  /* Adres → ekran (bkz. ui/route.ts): /play/<mod> doğrudan o oyun, /daily
     günün mücadelesi (kilit/tohum sunucudan - aşağıdaki effect), / ana sayfa.
     Geliştirmede ?dev=game kısayolu öncelikli (ekran görüntüsü için). */
  const [route] = useState<Route>(initialRoute)
  // Mihrace kendi ekranı: GameConfig'e girmiyor (kayan tahta yok, koşu defteri yok)
  const [maharajah, setMaharajah] = useState(route.kind === 'maharajah')
  /* Devam fişi (ui/resume): ana sayfada ya da fişin oyununun adresinde
     «devam et / vazgeç» sorulur; karar verilene dek oyun kurulmaz (yeni koşu
     fişi ezerdi). Başka bir oyunun adresinde fiş sessizce atılır. */
  const [offer, setOffer] = useState<ResumeTicket | null>(() => {
    if (import.meta.env.DEV && window.location.search.includes('dev=')) return null
    const ticket = readResume()
    if (!ticket) return null
    const r = route
    if (r.kind === 'home') return ticket
    if (r.kind === 'play' && resumeMatches(ticket, r.mode)) return ticket
    if (r.kind === 'daily' && resumeMatches(ticket, 'daily', dayKey())) return ticket
    clearResume()
    return null
  })
  // Tüketilen fiş: yalnızca aynı runKey'li ilk kuruluma verilir (koridor
  // değişimi / çıkış-giriş yeni runKey = yeni koşu, fiş uygulanmaz)
  const [resume, setResume] = useState<{ key: string; data: ResumeTicket['data'] } | null>(null)
  const [config, setConfig] = useState<GameConfig | null>(() =>
    import.meta.env.DEV && window.location.search.includes('dev=game')
      ? devConfig(
          new URLSearchParams(window.location.search).get('mode') ?? 'classic',
          new URLSearchParams(window.location.search).get('seed'),
        )
      : route.kind === 'play' && !offer
        ? playConfig(route.mode)
        : null,
  )
  // popstate dinleyicisi bir kez kuruluyor; güncel konfigi ref'ten okur
  const configRef = useRef(config)
  configRef.current = config
  // ?dev=settings - ayarlar penceresini açık başlat (yalnızca DEV)
  const [settingsOpen, setSettingsOpen] = useState(
    () => import.meta.env.DEV && window.location.search.includes('dev=settings'),
  )
  // Aynı geliştirme kısayolu kılavuz için: ?dev=page (Hakkında artık /about)
  const [page, setPage] = useState<PageId | null>(() =>
    import.meta.env.DEV && window.location.search.includes('dev=page') ? 'help' : null,
  )
  const { lang } = useSettings()
  /* Paylaşım bağlantısı: ?g=classic|kingRun|trio|daily(&d=gün) → ana sayfada o
     kart vurgulanır. Adres çubuğu temizlenir ki yenilemede tekrar vurgulamasın. */
  const [focus, setFocus] = useState<HomeFocus | null>(() => {
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

  /* --- gezinme: adres ↔ ekran ------------------------------------------ */

  /** Adres çubuğunu ekrana eşitle; oyuna girerken geçmişe yeni kayıt, çıkarken yerine yaz */
  function syncPath(next: GameConfig | null, how: 'push' | 'replace') {
    const path = pathOf(routeOfMode(next?.mode ?? null))
    if (window.location.pathname === path) return
    try {
      if (how === 'push') window.history.pushState(null, '', path)
      else window.history.replaceState(null, '', path)
    } catch {
      // yoksay (dosya:// vb.)
    }
  }

  function enterMaharajah() {
    unlockSound()
    setMaharajah(true)
    if (window.location.pathname !== '/play/maharajah') {
      try {
        window.history.pushState(null, '', '/play/maharajah')
      } catch {
        // yoksay
      }
    }
  }

  function exitMaharajah() {
    setSettingsOpen(false)
    setMaharajah(false)
    syncPath(null, 'replace')
  }

  function enterGame(next: GameConfig) {
    unlockSound()
    setResume(null)
    setConfig(next)
    syncPath(next, 'push')
  }

  /** Fişten devam: oyun aynı konfigle, `resume` verisiyle kurulur */
  function resumeFromTicket(ticket: ResumeTicket) {
    setOffer(null)
    unlockSound()
    setResume({ key: runKeyOf(ticket.config), data: ticket.data })
    setConfig(ticket.config)
    syncPath(ticket.config, route.kind === 'home' ? 'push' : 'replace')
  }

  /** Vazgeç: fiş silinir; adres bir oyunsa o oyun sıfırdan, değilse ana sayfa */
  function skipTicket() {
    setOffer(null)
    clearResume()
    if (route.kind === 'play') setConfig(playConfig(route.mode))
    else if (route.kind === 'daily') launchDailyFromRoute()
  }

  /**
   * Oyundan çıkış - tek yol: «← Menü», mobil «←», ayarlar «Menüye dön»,
   * outro, tarayıcı geri tuşu. Süren koşu deftere `abandoned` yazılır
   * (puan kalır; bitmiş/boş koşuda `abandon` zaten hiçbir şey yapmaz),
   * sonra ana sayfa. Adres yerine yazılır ki «geri» oyuna değil, oyundan
   * önceki sayfaya gitsin.
   */
  function exitGame() {
    void (async () => {
      await gameRef.current?.abandon()
      setSettingsOpen(false)
      setConfig(null)
      syncPath(null, 'replace')
    })()
  }

  /**
   * /daily adresi: kart akışının aynısı, sunucu yetkili. Oynandıysa ya da
   * sunucuya ulaşılamadıysa ana sayfa (günlük kartı vurgulu; kart kendi
   * durumunu - sonuç/uyarı - gösterir) ve adres `/`'a düzeltilir.
   */
  function launchDailyFromRoute() {
    const day = dayKey()
    const fallback = () => {
      setFocus({ mode: 'daily' })
      setConfig(null)
      syncPath(null, 'replace')
    }
    if (!leaderboardEnabled) {
      if (dailyPlayed(day) && !DAILY_REPLAY_ALLOWED) return fallback()
      setConfig({ mode: 'daily', playerColor: 'w', cols: DEFAULT_COLS, seed: dailySeed(day), daily: day })
      return
    }
    void fetchDaily(day).then((info) => {
      if (!info || (info.played && !DAILY_REPLAY_ALLOWED)) return fallback()
      setConfig({ mode: 'daily', playerColor: 'w', cols: DEFAULT_COLS, seed: info.seed, daily: day })
    })
  }

  // Kimlik geri yüklenince sayfa yenilenmeden süren koşu deftere (bkz. ui/reload)
  useEffect(() => {
    setBeforeReload(() => gameRef.current?.abandon())
    return () => setBeforeReload(null)
  }, [])

  useEffect(() => {
    if (route.kind === 'daily' && !config && !offer) launchDailyFromRoute()
    // Yalnızca açılışta: rota ilk değerinden sonra değişmiyor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Tarayıcı geri/ileri: adres neyse o ekran. Geri = oyundan çık (onay
     sormadan - kullanıcı zaten «geri» dedi); ileri/geri ile bir oyun adresine
     gelmek o oyunu (yeni koşu) açar - adres = sayfa. */
  useEffect(() => {
    const onPop = () => {
      const next = parseRoute(window.location.pathname) ?? { kind: 'home' as const }
      const current = configRef.current
      setMaharajah(next.kind === 'maharajah')
      if (next.kind === 'home') {
        if (current) exitGame()
        return
      }
      if (next.kind === 'maharajah') {
        if (current) {
          void gameRef.current?.abandon()
          setConfig(null)
        }
        return
      }
      void (async () => {
        await gameRef.current?.abandon()
        if (next.kind === 'play') setConfig(playConfig(next.mode))
        else launchDailyFromRoute()
      })()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Sıralama kendi penceresi. ?dev=rank örnek veriyle açıyor (yalnızca DEV).
  const demoRank = import.meta.env.DEV && window.location.search.includes('dev=rank')
  const [rankOpen, setRankOpen] = useState<boolean>(demoRank)
  // Rozet penceresi; ?dev=badges açık başlatır (yalnızca DEV)
  const [badgesOpen, setBadgesOpen] = useState<boolean>(
    import.meta.env.DEV && window.location.search.includes('dev=badges'),
  )
  // Seçili rozet değişince fişler yeniden okusun
  const [badgeVersion, setBadgeVersion] = useState(0)
  // Ad/rozet sunucuya işlenince sıralama görünümleri yeniden çeksin
  const [rankVersion, setRankVersion] = useState(0)

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
    // Açılış selamı: kimlik sunucuya (panel «kaç kişi girdi» için) - günde bir
    sayHello()
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
    const onProfile = () => setRankVersion((v) => v + 1)
    // Koşu sunucuya işlenince: sıralama bir koşu geride kalmasın (RANKS_EVENT)
    window.addEventListener(RESET_EVENT, onReset)
    window.addEventListener(PROFILE_EVENT, onProfile)
    window.addEventListener(RANKS_EVENT, onProfile)
    return () => {
      window.removeEventListener(RESET_EVENT, onReset)
      window.removeEventListener(PROFILE_EVENT, onProfile)
      window.removeEventListener(RANKS_EVENT, onProfile)
    }
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

  const runKey = config ? runKeyOf(config) : ''
  const resumeData = resume && resume.key === runKey ? resume.data : null

  return (
    <>
      {maharajah ? (
        <MaharajahGame onExit={exitMaharajah} onOpenSettings={() => setSettingsOpen(true)} onOpenPage={setPage} />
      ) : config?.mode === 'daily' ? (
        <DailyGame
          key={runKey}
          ref={gameRef}
          config={config}
          resume={resumeData?.kind === 'daily' ? resumeData : undefined}
          onExit={exitGame}
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
          resume={resumeData?.kind === 'game' ? resumeData : undefined}
          onExit={exitGame}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPage={setPage}
          onOpenRanking={() => setRankOpen(true)}
          onOpenBadges={() => setBadgesOpen(true)}
          badgeVersion={badgeVersion}
          onRestartWithCols={restartWithCols}
        />
      ) : (
        <Home
          onStart={enterGame}
          onStartMaharajah={enterMaharajah}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenBadges={() => setBadgesOpen(true)}
          focus={focus}
        />
      )}

      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          rankVersion={rankVersion}
          onExitGame={maharajah ? exitMaharajah : config ? exitGame : undefined}
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
          refresh={rankVersion}
          onClose={() => setRankOpen(false)}
        />
      )}

      {page && <Page onClose={() => setPage(null)} />}

      {offer && <ResumePrompt ticket={offer} onResume={() => resumeFromTicket(offer)} onSkip={skipTicket} />}

      {TuningPanel && (
        <Suspense fallback={null}>
          <TuningPanel />
        </Suspense>
      )}
    </>
  )
}
