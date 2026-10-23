import type { MhMode } from '../engine/maharajah'

/**
 * Mihrace'nin en iyi puanları - rol başına, yalnızca bu cihazda.
 *
 * Mihrace serbest oyun: koşu defterine (scores.ts) ve haftalık lige
 * girmiyor, sunucu bu modu tanımıyor. Ana sayfa kartı ve bitiş ekranının
 * «yeni rekor» satırı buradan okuyor.
 */
const KEY = 'chessrun:mh-best'

export type MhBest = Record<MhMode, number>

export function readMhBest(): MhBest {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<MhBest>
    return {
      falcon: typeof raw.falcon === 'number' ? raw.falcon : 0,
      hunter: typeof raw.hunter === 'number' ? raw.hunter : 0,
    }
  } catch {
    return { falcon: 0, hunter: 0 }
  }
}

/** Ana sayfa kartı: iki rolün büyüğü; hiç puan yoksa null («-») */
export function mhBestOverall(): number | null {
  const best = readMhBest()
  const top = Math.max(best.falcon, best.hunter)
  return top > 0 ? top : null
}

/** Puanı yazar; önceki en iyiyi geçtiyse true */
export function recordMhScore(mode: MhMode, score: number): boolean {
  const best = readMhBest()
  if (score <= best[mode]) return false
  best[mode] = score
  try {
    localStorage.setItem(KEY, JSON.stringify(best))
  } catch {
    // Depo yoksa rekor bu oturumda kalır
  }
  return true
}
