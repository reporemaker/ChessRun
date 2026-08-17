/**
 * Oyun · Worker · panel arasındaki tek ortak sözleşme.
 *
 * Bu dosyanın **hiç bağımlılığı yok** ve olamaz: üç ayrı derleme grafiği
 * (kökteki oyun, `server/`, `sub/`) onu göreli yolla içeri alıyor. React,
 * i18n ya da motor tipi import ettiği an Worker'ın içine arayüz sürüklemiş
 * oluruz — npm workspaces kurmadan tip paylaşabilmemizin tek sebebi bu
 * dosyanın yalıtık kalması.
 *
 * `erasableSyntaxOnly` açık olduğu için `enum` yok; her sabit liste
 * `as const` dizi + türetilmiş birleşim olarak yazılıyor. Böylece hem tip
 * hem de çalışma zamanı doğrulama listesi tek yerden geliyor — Worker'ın
 * beyaz liste doğrulaması aynı diziyi kullanıyor.
 */

/* ------------------------------------------------------------------ *
 * Sabit listeler — hem tip hem doğrulama kaynağı
 * ------------------------------------------------------------------ */

export const MODES = ['classic', 'kingRun', 'trio'] as const
export type Mode = (typeof MODES)[number]

export const UI_LANGS = ['tr', 'en', 'de', 'es', 'fr'] as const
export type UiLang = (typeof UI_LANGS)[number]

export const SPEEDS = ['slow', 'normal', 'fast'] as const
export type Speed = (typeof SPEEDS)[number]

/**
 * Koşunun nasıl bittiği. Motorda böyle bir alan yok — `finishRun`'da
 * `state.events` üstünden türetiliyor. Panelin üreteceği en faydalı oyun
 * tasarımı sayısı bu, ve sıralama tablosunun taşıması için bir sebep yok.
 */
// `abandoned`: oyuncu koridor genişliğini değiştirip koşuyu yeniden başlattı;
// koşu deftere yazıldı ama motor bitirmedi. Panelde "yarıda bırakıldı".
export const END_REASONS = ['checkmated', 'stuckOut', 'lifeLost', 'fellOff', 'abandoned', 'other'] as const
export type EndReason = (typeof END_REASONS)[number]

/** Kesin piksel değil kova: tam genişlik parmak izi entropisi, kova değil */
export const VIEWPORTS = ['xs', 'sm', 'md', 'lg'] as const
export type Viewport = (typeof VIEWPORTS)[number]

export const DEVICES = ['mobile', 'tablet', 'desktop'] as const
export type Device = (typeof DEVICES)[number]

/**
 * Kırılım boyutları. Yeni bir boyut eklemek toplama işinde tek satır;
 * API ve panelde sıfır değişiklik — ikisi de `daily_dim` üstünden jenerik
 * çalışıyor.
 */
export const DIMENSIONS = [
  'country',
  'ui_lang',
  'nav_lang',
  'accept_lang',
  'browser',
  'os',
  'device',
  'viewport',
  'referrer',
  'mode',
  'end_reason',
  'standalone',
] as const
export type Dimension = (typeof DIMENSIONS)[number]

export const PERIODS = ['day', 'week', 'month', 'year'] as const
export type Period = (typeof PERIODS)[number]

export const METRICS = ['visitors', 'sessions', 'players', 'runs'] as const
export type Metric = (typeof METRICS)[number]

/* ------------------------------------------------------------------ *
 * Toplama yükleri — oyundan Worker'a
 *
 * Hiçbirinde cihaz jetonu YOK ve olmayacak. Sıralama tablosu jetona
 * ihtiyaç duyuyor çünkü o bir kimlik iddiası; istatistik duymuyor.
 * Ayrı tipler bu sızıntıyı dikkat meselesi olmaktan çıkarıp yapısal
 * olarak imkânsız kılıyor.
 * ------------------------------------------------------------------ */

/** Her yükte ortak: hangi oturum, hangi sürüm */
export interface BasePayload {
  /** sessionStorage'da yaşayan sekme kimliği — cihaz değil, oturum */
  sessionId: string
  appVersion: string
}

export interface VisitPayload extends BasePayload {
  /** Uygulamada seçili dil. Başlıklardan gelemeyecek tek sinyal bu. */
  uiLang: UiLang
  /** navigator.language, iki harf. Accept-Language'tan ayrışabilir. */
  navLang: string
  viewport: Viewport
  touch: boolean
  /** Ana ekrana eklenmiş mi — service worker'ı sürdürmeye değer mi sorusu */
  standalone: boolean
  reducedMotion: boolean
  /** document.referrer; Worker yalnızca host kısmını saklıyor */
  referrer: string
}

export interface RunPayload extends BasePayload {
  mode: Mode
  daily: boolean
  score: number
  distance: number
  cols: number
  level: number
  /**
   * Duvar saati. Sekme arka plandayken de işlediği için sunucuda 2 saate
   * kırpılıyor ve panelde medyanla birlikte gösteriliyor.
   */
  durationMs: number
  endReason: EndReason
  speed: Speed
  uiLang: UiLang
  kings: number
  bestStreak: number
  stuckUsed: number
  mated: boolean
}

export interface SessionPayload extends BasePayload {
  durationMs: number
  runs: number
}

/* ------------------------------------------------------------------ *
 * Okuma yanıtları — Worker'dan panele
 * ------------------------------------------------------------------ */

export interface SummaryTotals {
  visitors: number
  sessions: number
  /** En az bir koşusu olan oturum */
  players: number
  runs: number
  runsByMode: Record<Mode, number>
  runsDaily: number
  avgDurationMs: number
  /** Yalnızca tek günlük dönemde gerçek medyan; çok günlü aralıkta null */
  medianDurationMs: number | null
}

export interface SummaryResponse extends SummaryTotals {
  period: Period
  from: string
  to: string
  /** Önceki eşdeğer dönem — her KPI'nın deltası bedavaya geliyor */
  previous: SummaryTotals
}

export interface SeriesPoint {
  bucket: string
  value: number
}

export interface SeriesResponse {
  metric: Metric
  period: Period
  points: SeriesPoint[]
}

export interface BreakdownRow {
  value: string
  visitors: number
  runs: number
  /** 0–1 arası pay; toplam sıfırsa 0 */
  share: number
}

export interface BreakdownResponse {
  dim: Dimension
  total: number
  rows: BreakdownRow[]
}

export interface HealthResponse {
  ok: boolean
  /** Son toplanan gün. Bugünden iki gün geriye düşerse cron ölmüş demektir. */
  lastRollupDay: string | null
  rawRows: number
  oldestRawDay: string | null
  /** Günlük tuz yerinde mi — yoksa ziyaretçi tekilleştirmesi bozulur */
  salted: boolean
}

/* ------------------------------------------------------------------ *
 * Yardımcılar — üç taraf da aynı gün anahtarını üretmeli
 * ------------------------------------------------------------------ */

/** UTC gün anahtarı: 2026-08-17. Sunucu tarafı her şey UTC. */
export function dayKeyUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function isMode(value: unknown): value is Mode {
  return MODES.includes(value as Mode)
}

export function isUiLang(value: unknown): value is UiLang {
  return UI_LANGS.includes(value as UiLang)
}

export function isDimension(value: unknown): value is Dimension {
  return DIMENSIONS.includes(value as Dimension)
}

export function isPeriod(value: unknown): value is Period {
  return PERIODS.includes(value as Period)
}

export function isMetric(value: unknown): value is Metric {
  return METRICS.includes(value as Metric)
}

