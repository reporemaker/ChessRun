import {
  DEVICES,
  END_REASONS,
  MODES,
  SPEEDS,
  UI_LANGS,
  VIEWPORTS,
  type Device,
  type EndReason,
  type Mode,
  type RunPayload,
  type SessionPayload,
  type Speed,
  type UiLang,
  type Viewport,
  type VisitPayload,
} from '../../shared/events'

/**
 * Toplama uçlarının doğrulama katmanı.
 *
 * **Veriyi asıl koruyan yer burası.** Hız sınırı ve bot filtresi gürültüyü
 * azaltıyor; ama sınırsız serbest metin kabul eden tek bir alan, birinin
 * kırılımını on bin çöp değerle zehirlemesine yeter. Bu yüzden her sabit
 * liste beyaz listeden geçiyor, her metin kırpılıyor, her sayı kelepçeleniyor
 * ve bilinmeyen anahtarlar düşüyor.
 *
 * Fonksiyonların hepsi saf: D1 olmadan test edilebiliyorlar.
 */

/** Süre üst sınırı: 2 saat. Sekme arka planda kalırsa saat işlemeye devam
 *  ediyor; gece açık bırakılan bir koşu 9 saatlik "süre" üretebilir. */
export const MAX_DURATION_MS = 2 * 60 * 60 * 1000

/** Gövde üst sınırı - ayrıştırmadan ÖNCE bakılıyor */
export const MAX_BODY_BYTES = 2048

export function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  // null ve '' "değer yok" demek, sıfır demek değil - Number(null) === 0
  // olduğu için bu ayrımı elle yapmak gerekiyor.
  if (value === null || value === undefined || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export function bool(value: unknown): boolean {
  return value === true
}

function pick<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback
}

/** İki harfli dil etiketi; harf dışı her şey atılıyor */
export function langCode(value: unknown): string {
  const raw = str(value, 8).slice(0, 2).toLowerCase()
  return /^[a-z]{2}$/.test(raw) ? raw : ''
}

/** Accept-Language: 'tr-TR,tr;q=0.9,en;q=0.8' → 'tr' */
export function acceptLang(header: string | null): string {
  if (!header) return ''
  return langCode(header.split(',')[0]?.trim().split('-')[0])
}

/**
 * Yönlendiren yalnızca HOST olarak saklanıyor. Yol ve sorgu dizesi başlık,
 * arama terimi ve bazen jeton sızdırır - panelde hiçbir işe yaramazken.
 */
export function referrerHost(value: unknown, selfHost: string): string {
  const raw = str(value, 512)
  if (!raw) return ''
  try {
    const host = new URL(raw).hostname.toLowerCase()
    // Kendi sitesinden gelen gezinme "yönlendiren" değil
    return host === selfHost ? '' : host.slice(0, 100)
  } catch {
    return ''
  }
}

/** Ülke kodu: iki büyük harf, bilinmiyorsa XX */
export function countryCode(value: string | null | undefined): string {
  const raw = (value ?? '').toUpperCase()
  return /^[A-Z]{2}$/.test(raw) ? raw : 'XX'
}

export interface CleanVisit {
  sessionId: string
  appVersion: string
  uiLang: UiLang
  navLang: string
  viewport: Viewport
  touch: boolean
  standalone: boolean
  reducedMotion: boolean
  referrer: string
}

export function cleanVisit(raw: unknown, selfHost: string): CleanVisit | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Partial<VisitPayload>
  const sessionId = str(body.sessionId, 64)
  if (!sessionId) return null

  return {
    sessionId,
    appVersion: str(body.appVersion, 16),
    uiLang: pick(UI_LANGS, body.uiLang, 'tr'),
    navLang: langCode(body.navLang),
    viewport: pick(VIEWPORTS, body.viewport, 'md'),
    touch: bool(body.touch),
    standalone: bool(body.standalone),
    reducedMotion: bool(body.reducedMotion),
    referrer: referrerHost(body.referrer, selfHost),
  }
}

export interface CleanRun {
  sessionId: string
  appVersion: string
  uiLang: UiLang
  mode: Mode
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
  /** Eski istemci göndermez → undefined; bot süzgeci o zaman bu koşulu atlar */
  touch?: boolean
}

export function cleanRun(raw: unknown): CleanRun | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Partial<RunPayload>
  const sessionId = str(body.sessionId, 64)
  if (!sessionId) return null

  return {
    sessionId,
    appVersion: str(body.appVersion, 16),
    uiLang: pick(UI_LANGS, body.uiLang, 'tr'),
    mode: pick(MODES, body.mode, 'classic'),
    daily: bool(body.daily),
    score: clampInt(body.score, 0, 1_000_000),
    distance: clampInt(body.distance, 0, 100_000),
    cols: clampInt(body.cols, 1, 16, 8),
    level: clampInt(body.level, 1, 999, 1),
    durationMs: clampInt(body.durationMs, 0, MAX_DURATION_MS),
    endReason: pick(END_REASONS, body.endReason, 'other'),
    speed: pick(SPEEDS, body.speed, 'normal'),
    kings: clampInt(body.kings, 0, 999),
    bestStreak: clampInt(body.bestStreak, 0, 999),
    stuckUsed: clampInt(body.stuckUsed, 0, 999),
    mated: bool(body.mated),
    touch: typeof body.touch === 'boolean' ? body.touch : undefined,
  }
}

export interface CleanSession {
  sessionId: string
  appVersion: string
  durationMs: number
  runs: number
  touch?: boolean
}

export function cleanSession(raw: unknown): CleanSession | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Partial<SessionPayload>
  const sessionId = str(body.sessionId, 64)
  if (!sessionId) return null

  return {
    sessionId,
    appVersion: str(body.appVersion, 16),
    // Oturum bir gün sürebilir; koşudan farklı bir tavan
    durationMs: clampInt(body.durationMs, 0, 24 * 60 * 60 * 1000),
    runs: clampInt(body.runs, 0, 10_000),
    touch: typeof body.touch === 'boolean' ? body.touch : undefined,
  }
}

/* ------------------------------------------------------------------ *
 * User-Agent ayrıştırma
 *
 * Ham UA ASLA saklanmıyor: tek başına en büyük parmak izi katkısı o.
 * Küçük bir alt dizi tablosu üç kovaya indiriyor; kesinlik değil kova
 * istiyoruz. Sıra önemli - Edge kendini Chrome, Chrome kendini Safari
 * ilan ediyor.
 * ------------------------------------------------------------------ */

export interface Agent {
  browser: string
  os: string
  device: Device
}

const BOTS = ['bot', 'crawler', 'spider', 'headless', 'curl', 'wget', 'python-', 'monitor', 'preview']

export function isBot(ua: string): boolean {
  const low = ua.toLowerCase()
  return BOTS.some((needle) => low.includes(needle))
}

/**
 * UA temizken bile makineyi ele veren iki ucuz işaret. Yeni alan adı
 * Certificate Transparency loglarına düştüğü an headless Chrome'lu
 * tarayıcılar geliyor ve JS çalıştırdıkları için `sendBeacon` ateşleniyor
 * (18 Ağustos: ilk 4 "ziyaretçi"nin 3'ü buydu - IS/FI/US).
 *
 * - `Accept-Language` boş: gerçek tarayıcı istisnasız gönderir.
 * - Telefon UA'sı ama `maxTouchPoints === 0`: cihaz emülasyonu.
 *
 * Yanlış pozitif riski bilinçli olarak sıfıra yakın tutuldu; masaüstü UA'lı
 * dokunmatiksiz makineler ve dokunmatik ekranlı dizüstüler etkilenmiyor.
 */
export function looksAutomated(input: {
  acceptLang: string
  device: Device
  os: string
  touch?: boolean
}): boolean {
  if (input.acceptLang === '') return true
  const phoneUa = input.device === 'mobile' && (input.os === 'android' || input.os === 'ios')
  if (phoneUa && input.touch === false) return true
  return false
}

export function parseAgent(uaRaw: string | null): Agent {
  const ua = uaRaw ?? ''

  let browser = 'other'
  if (/Edg\//.test(ua)) browser = 'edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'opera'
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung'
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'firefox'
  else if (/Chrome\/|CriOS/.test(ua)) browser = 'chrome'
  else if (/Safari\//.test(ua)) browser = 'safari'

  let os = 'other'
  if (/Android/.test(ua)) os = 'android'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'ios'
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macos'
  else if (/Windows/.test(ua)) os = 'windows'
  else if (/Linux|X11/.test(ua)) os = 'linux'

  let device: Device = 'desktop'
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'tablet'
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = 'mobile'

  return { browser, os, device }
}

export function pickDevice(value: unknown): Device {
  return pick(DEVICES, value, 'desktop')
}
