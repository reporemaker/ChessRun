import type {
  EndReason,
  RunPayload,
  SessionPayload,
  Speed,
  UiLang,
  Viewport,
  VisitPayload,
} from '@shared/events'
import type { GameEvent, GameMode } from '../engine/types'
import { getSettings } from './settings'
import { claimVisit, countRun, sessionRuns, sessionStart, touchSession } from './session'
import { APP_VERSION } from './version'

/**
 * İstatistik istemcisi.
 *
 * `leaderboard.ts` ile aynı sözleşme: env değişkeni tanımsızsa hiçbir şey
 * yapmaz, asla hata fırlatmaz, oyunu asla bekletmez. Fark, taşıdığı veride:
 * burada **cihaz jetonu yok**. Sıralama tablosu jetona ihtiyaç duyuyor
 * çünkü o bir kimlik iddiası; istatistik duymuyor, o yüzden almıyor.
 *
 * `VITE_LEADERBOARD_URL`'den ayrı bir değişken kullanılıyor: üretimde ikisi
 * aynı Worker'ı gösterecek olsa bile bunlar farklı rıza ve dağıtım
 * hikâyeleri — sıralama açıkken istatistiği kapatabilmek gerekiyor.
 *
 * Sunucu sözleşmesi (hepsi her durumda 204 döner):
 *   POST {url}/visit    · POST {url}/run    · POST {url}/session
 */
const ENDPOINT = import.meta.env.VITE_STATS_URL as string | undefined

/**
 * Dördüncü bir mod eklendiği gün bu satır derlemede kırılıyor: `shared`
 * kendi `Mode` birleşimini bağımsız tanımlıyor (motor tipini import etmesi
 * arayüzü Worker'ın içine sürüklerdi), o yüzden ikisinin aynı kaldığını
 * bir yerde iddia etmek gerekiyor.
 */
const _modesAgree: import('@shared/events').Mode = null as unknown as GameMode
void _modesAgree

/**
 * Kullanıcı izlenmek istemediğini söylediyse hiç göndermiyoruz.
 *
 * `navigator.webdriver` de aynı kapıdan geçiyor: headless/otomasyon
 * tarayıcıları (yeni alan adını CT loglarından bulan tarayıcılar, link
 * önizleyiciler) bunu `true` verir ve JS çalıştırdıkları için normalde
 * ziyaret sayılırlardı. Makine ziyaretçi değildir; sunucudaki
 * `looksAutomated` bunun ikinci katmanı.
 */
function optedOut(): boolean {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; webdriver?: boolean }
    return nav.doNotTrack === '1' || nav.globalPrivacyControl === true || nav.webdriver === true
  } catch {
    return false
  }
}

export const statsEnabled = Boolean(ENDPOINT)

/* ------------------------------------------------------------------ *
 * Saf projeksiyonlar — DOM'a dokunmuyorlar, bu yüzden test edilebilirler
 * ------------------------------------------------------------------ */

/**
 * İstemciden okunan, **hiçbiri izin gerektirmeyen** sinyaller.
 *
 * Bilerek dışarıda bırakılanlar: `screen.width/height`, `devicePixelRatio`,
 * `hardwareConcurrency`, `deviceMemory`. Hepsi izinsiz okunabiliyor ama
 * hiçbir ürün sorusunu cevaplamıyor; bir araya geldiklerinde tarayıcıyı
 * tekilleştirmeye yarıyorlar. Ölçüm sebebi olmayan her alan parmak izidir.
 */
export interface ClientEnv {
  sessionId: string
  appVersion: string
  /** Uygulamada seçili dil — başlıklardan gelemeyecek tek sinyal */
  uiLang: UiLang
  navLang: string
  viewport: Viewport
  touch: boolean
  standalone: boolean
  reducedMotion: boolean
  referrer: string
}

/** Kesin piksel değil kova: kova ölçüm, tam genişlik parmak izi */
export function viewportBucket(width: number): Viewport {
  if (width < 480) return 'xs'
  if (width < 900) return 'sm'
  if (width < 1400) return 'md'
  return 'lg'
}

/** navigator.language → iki harf; 'tr-TR' ve 'tr' aynı kovaya düşsün */
export function langTag(value: string): string {
  return value.slice(0, 2).toLowerCase()
}

/**
 * Koşunun nasıl bittiği. Motorda böyle bir alan yok — bitiş olayları
 * ayrı ayrı yayılıyor, bu fonksiyon onları tek bir sebebe indiriyor.
 * Sıra önemli: mat ve sıkışma, can kaybından daha spesifik.
 */
export function endReasonOf(events: GameEvent[]): EndReason {
  if (events.some((event) => event.kind === 'checkmated')) return 'checkmated'
  if (events.some((event) => event.kind === 'stuckOut')) return 'stuckOut'
  const lost = events.find((event) => event.kind === 'lifeLost')
  if (lost) return lost.reason === 'fellOff' ? 'fellOff' : 'lifeLost'
  return 'other'
}

/** Koşu yükünün oyun tarafındaki ham girdisi */
export interface RunFacts {
  mode: GameMode
  daily: boolean
  score: number
  distance: number
  cols: number
  level: number
  durationMs: number
  endReason: EndReason
  speed: Speed
  kings: number
  bestStreak: number
  stuckUsed: number
  mated: boolean
}

export function buildVisitPayload(env: ClientEnv): VisitPayload {
  return {
    sessionId: env.sessionId,
    appVersion: env.appVersion,
    uiLang: env.uiLang,
    navLang: env.navLang,
    viewport: env.viewport,
    touch: env.touch,
    standalone: env.standalone,
    reducedMotion: env.reducedMotion,
    referrer: env.referrer,
  }
}

export function buildRunPayload(facts: RunFacts, env: ClientEnv): RunPayload {
  return {
    sessionId: env.sessionId,
    appVersion: env.appVersion,
    uiLang: env.uiLang,
    mode: facts.mode,
    daily: facts.daily,
    score: facts.score,
    distance: facts.distance,
    cols: facts.cols,
    level: facts.level,
    // Kırpma sunucuda da yapılıyor; burada da yapmak bozuk bir sayının
    // ağa çıkmasını engelliyor. Sekme arka planda kalırsa süre şişiyor.
    durationMs: Math.max(0, Math.round(facts.durationMs)),
    endReason: facts.endReason,
    speed: facts.speed,
    kings: facts.kings,
    bestStreak: facts.bestStreak,
    stuckUsed: facts.stuckUsed,
    mated: facts.mated,
  }
}

/* ------------------------------------------------------------------ *
 * DOM okuması ve gönderim
 * ------------------------------------------------------------------ */

function media(query: string): boolean {
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

export function readEnv(sessionId: string): ClientEnv {
  return {
    sessionId,
    appVersion: APP_VERSION,
    uiLang: getSettings().lang as UiLang,
    navLang: langTag(navigator.language ?? ''),
    viewport: viewportBucket(window.innerWidth),
    touch: (navigator.maxTouchPoints ?? 0) > 0,
    standalone:
      media('(display-mode: standalone)') ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    reducedMotion: media('(prefers-reduced-motion: reduce)'),
    // Yalnızca host anlamlı; yolu ve sorguyu sunucu zaten atıyor ama
    // göndermemek daha temiz — yol başlık ve arama terimi sızdırabilir
    referrer: document.referrer,
  }
}

function post(path: string, body: unknown): void {
  if (!ENDPOINT || optedOut()) return
  try {
    void fetch(`${ENDPOINT}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Ağ yoksa istatistik kaybediliyor. Yeniden deneme kuyruğu bilerek
    // yok: kuyruk localStorage tüketimi ve sunucuda tekrar/kopya sorunu
    // demek. Koşu *kaydını* zaten localStorage taşıyor, kaybolan yalnızca
    // sayaç.
  }
}

/** Oturum başına bir kez, uygulama açılışında. Oyun oynamayanı da sayar. */
export function trackVisit(): void {
  if (!ENDPOINT || optedOut()) return
  const session = touchSession()
  if (!claimVisit()) return
  post('visit', buildVisitPayload(readEnv(session.id)))
}

export function trackRun(facts: RunFacts): void {
  if (!ENDPOINT || optedOut()) return
  const session = touchSession()
  countRun()
  post('run', buildRunPayload(facts, readEnv(session.id)))
}

/**
 * Oturum sonu. `sendBeacon` tam olarak burada doğru: sayfa ölüyor olabilir.
 *
 * `unload`/`beforeunload` kullanılmıyor — mobil Safari'de güvenilir
 * tetiklenmiyor. Doğru çift `visibilitychange` + `pagehide`.
 */
export function trackSessionEnd(): void {
  if (!ENDPOINT || optedOut()) return
  const start = sessionStart()
  if (!start) return

  const body: SessionPayload = {
    sessionId: touchSession().id,
    appVersion: APP_VERSION,
    durationMs: Math.max(0, Date.now() - start),
    runs: sessionRuns(),
  }

  try {
    const json = JSON.stringify(body)
    // Aynı origin'de JSON içerik tipi sorunsuz. Çapraz origin'e düşülürse
    // `text/plain`'e inmek gerekir: sendBeacon preflight yapamaz ve bu,
    // "iOS'ta oturum olayları rastgele kayboluyor" olarak ortaya çıkar.
    const blob = new Blob([json], { type: 'application/json' })
    if (navigator.sendBeacon?.(`${ENDPOINT}/session`, blob)) return
  } catch {
    // beacon reddedilirse aşağıdaki yedeğe düşülüyor
  }
  post('session', body)
}
