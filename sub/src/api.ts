import type {
  BreakdownResponse,
  Dimension,
  HealthResponse,
  Metric,
  Period,
  SeriesResponse,
  SummaryResponse,
} from '@shared/events'

/**
 * /api/* için tipli sarmalayıcılar — panelde uç adresini bilen TEK dosya.
 *
 * Aynı origin: üretimde panel ve API aynı Worker'dan geliyor, yerelde vite
 * proxy'si taklit ediyor. Access başlığını tarayıcı kendisi taşıyor
 * (çerez), bizim eklememiz gereken bir şey yok.
 */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') query.set(k, String(v))
  const res = await fetch(`/api/${path}?${query}`, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    // 403 → Access oturumu düşmüş; 5xx → Worker; ikisi de kullanıcıya söylenir
    throw new ApiError(res.status, res.status === 403 ? 'Oturum yok — Access girişi gerekiyor' : `Sunucu ${res.status}`)
  }
  return (await res.json()) as T
}

export const api = {
  health: () => get<HealthResponse>('health', {}),
  summary: (period: Period, at: string) => get<SummaryResponse>('summary', { period, at }),
  series: (metric: Metric, period: Period, at: string) =>
    get<SeriesResponse>('series', { metric, period, at }),
  breakdown: (dim: Dimension, period: Period, at: string, limit = 12) =>
    get<BreakdownResponse>('breakdown', { dim, period, at, limit }),
}
