import type { Period } from './events'

/**
 * Dönem aritmetiği - UTC, saf, test edilebilir.
 *
 * Her şey `YYYY-MM-DD` gün anahtarı üstünde. Hafta ISO: Pazartesi başlar.
 * `previous` her dönem için eşdeğer önceki aralık - panelin her KPI'da
 * gösterdiği delta buradan.
 */

export interface Range {
  from: string
  to: string
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parse(day: string): Date {
  return new Date(`${day}T00:00:00Z`)
}

export function addDays(day: string, n: number): string {
  const d = parse(day)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/** Verilen günü içeren dönemin aralığı, iki uç dahil */
export function rangeOf(period: Period, at: string): Range {
  const d = parse(at)
  switch (period) {
    case 'day':
      return { from: at, to: at }
    case 'week': {
      // ISO: Pazartesi=1 … Pazar=7
      const dow = d.getUTCDay() || 7
      const from = addDays(at, 1 - dow)
      return { from, to: addDays(from, 6) }
    }
    case 'month': {
      const from = `${at.slice(0, 7)}-01`
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      return { from, to: addDays(iso(next), -1) }
    }
    case 'year':
      return { from: `${at.slice(0, 4)}-01-01`, to: `${at.slice(0, 4)}-12-31` }
  }
}

/** Aynı uzunlukta bir önceki dönem */
export function previousOf(period: Period, range: Range): Range {
  switch (period) {
    case 'day':
      return { from: addDays(range.from, -1), to: addDays(range.to, -1) }
    case 'week':
      return { from: addDays(range.from, -7), to: addDays(range.to, -7) }
    case 'month': {
      const d = parse(range.from)
      const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
      return rangeOf('month', iso(prev))
    }
    case 'year': {
      const y = Number(range.from.slice(0, 4)) - 1
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    }
  }
}

/**
 * Delta için kıyas aralığı. Dönem sürüyorsa (bugün içinde, son gün değil)
 * önceki dönemin yalnızca aynı uzunluktaki başı: bugün dahil geçen gün
 * sayısı kadar. Yoksa çarşamba günü "bu hafta" 3 gün, "geçen hafta" 7 gün
 * olur ve her delta ▼ görünür. Bitmiş dönemde tam önceki dönem.
 */
export function comparisonOf(
  period: Period,
  range: Range,
  today: string,
): { prev: Range; partial: boolean; comparedDays: number } {
  const partial = today >= range.from && today < range.to
  const comparedDays = daysBetween({ from: range.from, to: partial ? today : range.to }).length
  const full = previousOf(period, range)
  const prev = partial ? { from: full.from, to: addDays(full.from, comparedDays - 1) } : full
  return { prev, partial, comparedDays }
}

/** Seri grafiği için kova anahtarı: gün → gün, hafta/ay → gün, yıl → ay */
export function bucketOf(period: Period, day: string): string {
  return period === 'year' ? day.slice(0, 7) : day
}

/** `from`..`to` arasındaki her gün - seride boş günler sıfır olarak çıksın diye */
export function daysBetween(range: Range): string[] {
  const out: string[] = []
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) out.push(day)
  return out
}
