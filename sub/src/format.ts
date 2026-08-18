import type { Dimension, Metric, Mode, Period } from '@shared/events'

/**
 * Biçimlendirme ve etiketler — panel Türkçe, tek dil. Beş dilli oyunun
 * aksine panel yalnızca bir kişinin aracı; i18n makinesi buraya girmedi.
 */

const nf = new Intl.NumberFormat('tr-TR')
const pf = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 })

export const fmtInt = (n: number): string => nf.format(n)
export const fmtPct = (share: number): string => pf.format(share)

/** ms → "1 dk 32 sn" · "48 sn" · "—" */
export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} sn`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m} dk ${rest} sn` : `${m} dk`
  const h = Math.floor(m / 60)
  return `${h} sa ${m % 60} dk`
}

/** Delta: +%12 · −%4 · 0. Sıfırdan büyümeyi "yeni" diye söyle, sonsuz değil */
export function fmtDelta(now: number, before: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (before === 0 && now === 0) return { text: '0', dir: 'flat' }
  if (before === 0) return { text: 'yeni', dir: 'up' }
  const d = (now - before) / before
  if (Math.abs(d) < 0.005) return { text: '0', dir: 'flat' }
  const sign = d > 0 ? '+' : '−'
  return { text: `${sign}${pf.format(Math.abs(d))}`, dir: d > 0 ? 'up' : 'down' }
}

export const PERIOD_LABEL: Record<Period, string> = {
  day: 'Gün',
  week: 'Hafta',
  month: 'Ay',
  year: 'Yıl',
}

export const METRIC_LABEL: Record<Metric, string> = {
  visitors: 'Ziyaretçi',
  sessions: 'Oturum',
  players: 'Oyuncu',
  runs: 'Oyun',
}

export const MODE_LABEL: Record<Mode, string> = {
  classic: 'Av',
  kingRun: 'Kaçış',
  trio: 'Üçlü',
  daily: 'Günün Mücadelesi',
}

export const DIM_LABEL: Record<Dimension, string> = {
  country: 'Ülke',
  ui_lang: 'İçerik dili',
  nav_lang: 'Tarayıcı dili',
  accept_lang: 'Kabul dili',
  browser: 'Tarayıcı',
  os: 'İşletim sistemi',
  device: 'Cihaz',
  viewport: 'Ekran',
  referrer: 'Yönlendiren',
  mode: 'Oyun',
  end_reason: 'Bitiş sebebi',
  standalone: 'Açılış',
}

/** Kırılım değerlerinin okunur hâli — bilinmeyen değer olduğu gibi geçer */
const VALUE_LABEL: Record<string, string> = {
  classic: 'Av',
  kingRun: 'Kaçış',
  trio: 'Üçlü',
  daily: 'Günün Mücadelesi',
  lifeLost: 'Yenildi',
  fellOff: 'Tahtadan düştü',
  stuckOut: 'Sıkıştı',
  checkmated: 'Mat oldu',
  abandoned: 'Yarıda bırakıldı',
  other: 'Diğer',
  mobile: 'Telefon',
  tablet: 'Tablet',
  desktop: 'Masaüstü',
  xs: 'Dar (<480)',
  sm: 'Orta (<900)',
  md: 'Geniş (<1400)',
  lg: 'Çok geniş',
  pwa: 'Ana ekrandan (PWA)',
  browser: 'Tarayıcıdan',
  direct: 'Doğrudan',
  '?': 'Bilinmiyor',
  XX: 'Bilinmiyor',
  chrome: 'Chrome',
  safari: 'Safari',
  firefox: 'Firefox',
  edge: 'Edge',
  samsung: 'Samsung',
  opera: 'Opera',
  android: 'Android',
  ios: 'iOS',
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  tr: 'Türkçe',
  en: 'İngilizce',
  de: 'Almanca',
  es: 'İspanyolca',
  fr: 'Fransızca',
}

const region = new Intl.DisplayNames(['tr'], { type: 'region' })

export function fmtValue(dim: Dimension, value: string): string {
  if (dim === 'country' && /^[A-Z]{2}$/.test(value) && value !== 'XX') {
    try {
      return region.of(value) ?? value
    } catch {
      return value
    }
  }
  return VALUE_LABEL[value] ?? value
}

/** Tarih etiketi: 2026-08-17 → 17 Ağu · 2026-08 → Ağu 2026 */
export function fmtBucket(bucket: string): string {
  if (bucket.length === 7) {
    const [y, m] = bucket.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return new Date(`${bucket}T00:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function fmtRange(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00Z`)
  const t = new Date(`${to}T00:00:00Z`)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
  if (from === to) return f.toLocaleDateString('tr-TR', { ...opts, weekday: 'long' })
  return `${f.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' })} – ${t.toLocaleDateString('tr-TR', opts)}`
}
