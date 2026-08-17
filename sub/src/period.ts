import type { Period } from '@shared/events'

/**
 * Panel tarafı dönem gezinmesi — UTC. Sunucudaki `period.ts` aralığı
 * hesaplıyor; burası yalnızca "önceki / sonraki" için `at` gününü
 * kaydırıyor. Sunucu `at`'ten aralığı kendisi çıkarıyor.
 */

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function shift(period: Period, at: string, dir: -1 | 1): string {
  const d = new Date(`${at}T00:00:00Z`)
  switch (period) {
    case 'day':
      d.setUTCDate(d.getUTCDate() + dir)
      break
    case 'week':
      d.setUTCDate(d.getUTCDate() + 7 * dir)
      break
    case 'month':
      // Ayın 1'ine sabitle: 31 Ocak + 1 ay = 3 Mart gibi taşmalar olmasın
      d.setUTCDate(1)
      d.setUTCMonth(d.getUTCMonth() + dir)
      break
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + dir)
      break
  }
  return d.toISOString().slice(0, 10)
}

/** Gelecekte mi — "sonraki" düğmesi bugünü aşmasın */
export function isFuture(at: string, now = new Date()): boolean {
  return at > todayUtc(now)
}

/** URL hash ↔ durum: #/stats?period=week&at=2026-08-17 — derin bağlantı, tarayıcı geri tuşu */
export interface Route {
  page: 'dashboard' | 'stats'
  period: Period
  at: string
}

const PERIODS: Period[] = ['day', 'week', 'month', 'year']

export function parseHash(hash: string, now = new Date()): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const params = new URLSearchParams(query)
  const period = params.get('period') as Period | null
  const at = params.get('at')
  return {
    page: path === 'stats' ? 'stats' : 'dashboard',
    period: period && PERIODS.includes(period) ? period : 'week',
    at: at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : todayUtc(now),
  }
}

export function toHash(route: Route): string {
  return `#/${route.page}?period=${route.period}&at=${route.at}`
}
